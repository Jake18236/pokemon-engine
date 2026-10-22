import test from 'node:test';
import assert from 'node:assert/strict';
import showdown from 'pokemon-showdown';
import { advance, createPosition, FORMAT, legalActions, restore, snapshot } from '../src/simulator.js';

const set = (species, ability, moves, extra = {}) => ({ species, ability, moves, nature: 'Serious', evs: { hp: 1 }, ...extra });
const make = (p1, p2) => createPosition({ format: FORMAT, teams: { p1, p2 }, seed: [1, 2, 3, 4] });
const blissey = (ability = 'Natural Cure', extra = {}) => set('Blissey', ability, ['Soft-Boiled', 'Seismic Toss'], extra);
const garchomp = (ability = 'Regenerator', extra = {}) => set('Garchomp', ability, ['Dragon Claw', 'Earthquake', 'Swords Dance', 'Stealth Rock'], extra);
const log = battle => battle.log.filter(line => !line.startsWith('|t:|'));

test('Fluffy on Blissey halves contact damage with identical simulator RNG', () => {
  const damages = [];
  for (const ability of ['Natural Cure', 'Fluffy']) {
    const battle = make([garchomp()], [blissey(ability)]);
    try {
      const hp = battle.p2.active[0].hp;
      advance(battle, { p1: 'move 1', p2: 'move 2' });
      damages.push(hp - battle.p2.active[0].hp);
    } finally { battle.destroy(); }
  }
  assert.ok(damages[0] > 0);
  assert.ok(Math.abs(damages[0] / 2 - damages[1]) <= 1);
});

test('Volt Absorb prevents Electric damage on a nonstandard user', () => {
  const battle = make([set('Zapdos', 'Regenerator', ['Thunderbolt'])],
    [set('Corviknight', 'Volt Absorb', ['Iron Defense'])]);
  try {
    advance(battle, { p1: 'move 1', p2: 'move 1' });
    assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
    assert.ok(battle.log.some(line => line.includes('Volt Absorb')));
  } finally { battle.destroy(); }
});

test('Regenerator heals exactly floor(max HP / 3) on switching out', () => {
  const battle = make([garchomp(), set('Corviknight', 'Volt Absorb', ['Roost'])], [blissey()]);
  try {
    advance(battle, { p1: 'move 3', p2: 'move 2' });
    advance(battle, { p1: 'move 3', p2: 'move 2' });
    const target = battle.p1.active[0];
    const hp = target.hp;
    advance(battle, { p1: 'switch 2', p2: 'move 1' });
    assert.equal(target.hp, Math.min(target.maxhp, hp + Math.floor(target.maxhp / 3)));
  } finally { battle.destroy(); }
});

test('Stealth Rock uses real types, and Heavy-Duty Boots prevent its damage', () => {
  for (const item of ['', 'Heavy-Duty Boots']) {
    const battle = make([garchomp()], [blissey(), set('Charizard', 'Solar Power', ['Flamethrower'], { item })]);
    try {
      advance(battle, { p1: 'move 4', p2: 'move 1' });
      advance(battle, { p1: 'move 3', p2: 'switch 2' });
      const target = battle.p2.active[0];
      assert.equal(target.hp, target.maxhp - (item ? 0 : Math.floor(target.maxhp / 2)));
    } finally { battle.destroy(); }
  }
});

test('Choice Scarf modifies actual speed and Choice Band locks the move request', () => {
  const scarf = make([set('Garchomp', 'Regenerator', ['Dragon Claw'], { item: 'Choice Scarf' })], [blissey()]);
  try {
    const pokemon = scarf.p1.active[0];
    assert.equal(pokemon.getStat('spe'), Math.floor(pokemon.storedStats.spe * 1.5));
  } finally { scarf.destroy(); }
  const band = make([garchomp('Regenerator', { item: 'Choice Band' })], [blissey('Fluffy')]);
  try {
    advance(band, { p1: 'move 1', p2: 'move 1' });
    assert.deepEqual(legalActions(band, 'p1').map(a => a.id), ['move 1']);
  } finally { band.destroy(); }
});

test('Will-O-Wisp applies burn and simulator damage is reduced on the next turn', () => {
  const battle = make([garchomp()], [set('Mew', 'No Guard', ['Will-O-Wisp', 'Protect'])]);
  try {
    advance(battle, { p1: 'move 4', p2: 'move 1' });
    assert.equal(battle.p1.active[0].status, 'brn');
    const burned = restore(snapshot(battle));
    const healthy = restore(snapshot(battle));
    try {
      // Controlled differential fixture: cure through Showdown, not a custom damage calculation.
      healthy.p1.active[0].cureStatus();
      const initial = healthy.p2.active[0].hp;
      advance(burned, { p1: 'move 1', p2: 'move 1' });
      advance(healthy, { p1: 'move 1', p2: 'move 1' });
      assert.ok(initial - healthy.p2.active[0].hp > initial - burned.p2.active[0].hp);
    } finally { burned.destroy(); healthy.destroy(); }
  } finally { battle.destroy(); }
});

test('faint replacement requests only accept the surviving bench Pokémon', () => {
  const battle = make([garchomp('Mold Breaker')], [set('Heatran', 'Levitate', ['Stealth Rock']), blissey()]);
  try {
    advance(battle, { p1: 'move 2', p2: 'move 1' });
    assert.equal(battle.p2.active[0].fainted, true);
    assert.deepEqual(legalActions(battle, 'p2').map(a => a.id), ['switch 2']);
    assert.equal(legalActions(battle, 'p1')[0].kind, 'wait');
    assert.throws(() => advance(battle, { p1: 'move 1', p2: 'switch 2' }), /must wait/);
    advance(battle, { p2: 'switch 2' });
    assert.equal(battle.p2.active[0].species.name, 'Blissey');
  } finally { battle.destroy(); }
});

test('U-turn snapshot preserves the queued slower move and resumes against the switch-in', () => {
  const battle = make([set('Mew', 'Regenerator', ['U-turn']), garchomp('Mold Breaker')], [blissey()]);
  try {
    advance(battle, { p1: 'move 1', p2: 'move 2' });
    assert.equal(battle.requestState, 'switch');
    assert.ok(battle.queue.list.length > 0);
    const branch = restore(snapshot(battle));
    try {
      advance(battle, { p1: 'switch 2' });
      advance(branch, { p1: 'switch 2' });
      assert.deepEqual(log(branch), log(battle));
      assert.equal(branch.p1.active[0].hp, branch.p1.active[0].maxhp - 100);
    } finally { branch.destroy(); }
  } finally { battle.destroy(); }
});

test('Encore and trapping requests remove illegal moves and switches', () => {
  const battle = make([set('Gengar', 'Regenerator', ['Encore', 'Mean Look'])],
    [set('Blissey', 'Natural Cure', ['Soft-Boiled', 'Seismic Toss']), garchomp('Mold Breaker')]);
  try {
    advance(battle, { p1: 'move 2', p2: 'move 1' });
    assert.ok(!legalActions(battle, 'p2').some(a => a.kind === 'switch'));
    advance(battle, { p1: 'move 1', p2: 'move 2' });
    assert.deepEqual(legalActions(battle, 'p2').map(a => a.id), ['move 1']);
  } finally { battle.destroy(); }
});

test('zero PP produces the simulator Struggle request', () => {
  const battle = make([set('Blissey', 'Natural Cure', ['Soft-Boiled'])], [blissey()]);
  try {
    for (let turn = 0; turn < 8; turn++) advance(battle, { p1: 'move 1', p2: 'move 1' });
    const actions = legalActions(battle, 'p1');
    assert.equal(actions.length, 1);
    assert.match(actions[0].label, /struggle/i);
    advance(battle, { p1: actions[0].choice, p2: 'move 2' });
    assert.ok(battle.p1.active[0].hp < battle.p1.active[0].maxhp);
  } finally { battle.destroy(); }
});

test('adapter agrees with official BattleStream for the same teams, seed and choices', async () => {
  const p1 = [garchomp('Mold Breaker')];
  const p2 = [blissey('Fluffy')];
  const battle = make(p1, p2);
  const stream = new showdown.BattleStream();
  try {
    await stream.write(`>start ${JSON.stringify({ formatid: FORMAT, seed: [1, 2, 3, 4] })}\n` +
      `>player p1 ${JSON.stringify({ name: 'p1', team: p1 })}\n` +
      `>player p2 ${JSON.stringify({ name: 'p2', team: p2 })}\n>p1 team 1\n>p2 team 1\n>p1 move 1\n>p2 move 2`);
    advance(battle, { p1: 'move 1', p2: 'move 2' });
    assert.deepEqual(log(battle), log(stream.battle));
    assert.equal(battle.p1.active[0].hp, stream.battle.p1.active[0].hp);
    assert.equal(battle.prng.getSeed(), stream.battle.prng.getSeed());
  } finally { battle.destroy(); stream.destroy(); }
});

test('Skill Swap changes current abilities, and restored state retains those changes', () => {
  const battle = make([set('Mew', 'Regenerator', ['Skill Swap', 'Psychic'])],
    [set('Heatran', 'Levitate', ['Earth Power'])]);
  try {
    advance(battle, { p1: 'move 1', p2: 'move 1' });
    assert.equal(battle.p1.active[0].ability, 'levitate');
    assert.equal(battle.p1.active[0].set.ability, 'Regenerator');
    assert.equal(battle.p1.active[0].hp, battle.p1.active[0].maxhp);
    const copy = restore(snapshot(battle));
    try {
      assert.equal(copy.p1.active[0].ability, 'levitate');
      assert.equal(copy.p2.active[0].ability, 'regenerator');
      advance(copy, { p1: 'move 2', p2: 'move 1' });
      assert.equal(copy.p1.active[0].hp, copy.p1.active[0].maxhp);
    } finally { copy.destroy(); }
  } finally { battle.destroy(); }
});

test('move priority and Trick Room override ordinary speed order', () => {
  const priority = make([garchomp()], [set('Lucario', 'Adaptability', ['Extreme Speed'])]);
  try {
    advance(priority, { p1: 'move 1', p2: 'move 1' });
    assert.match(priority.log.find(line => line.startsWith('|move|')), /Lucario\|Extreme Speed/);
  } finally { priority.destroy(); }
  const trickRoom = make([set('Mew', 'Magic Guard', ['Trick Room', 'Psychic'])], [blissey()]);
  try {
    advance(trickRoom, { p1: 'move 1', p2: 'move 1' });
    const start = trickRoom.log.length;
    advance(trickRoom, { p1: 'move 2', p2: 'move 2' });
    assert.match(trickRoom.log.slice(start).find(line => line.startsWith('|move|')), /Blissey\|Seismic Toss/);
  } finally { trickRoom.destroy(); }
});
