import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advance, createPosition, legalActions, restore, snapshot } from '../src/simulator.js';
import { analyze } from '../src/search.js';
import { evaluate } from '../src/evaluate.js';

const example = JSON.parse(readFileSync(new URL('../examples/aaa-position.json', import.meta.url)));
const position = (ability = 'Mold Breaker') => {
  const input = structuredClone(example);
  input.teams.p1[0].ability = ability;
  return createPosition(input);
};
const cleanLog = battle => battle.log.filter(line => !line.startsWith('|t:|'));

test('AAA validates nonstandard abilities, bans, duplicate abilities, moves and format', () => {
  const battle = position();
  assert.equal(battle.p2.active[0].ability, 'levitate');
  assert.equal(battle.p1.active[0].canTerastallize, null);
  battle.destroy();
  for (const change of [
    input => { input.teams.p1[0].ability = 'Huge Power'; },
    input => { input.teams.p1[1].ability = 'Mold Breaker'; },
    input => { input.teams.p1[0].moves = ['Spore']; },
    input => { delete input.teams.p1[0].ability; },
    input => { input.format = 'gen9ou'; },
  ]) {
    const input = structuredClone(example);
    change(input);
    assert.throws(() => createPosition(input));
  }
});

test('Levitate grants Heatran Ground immunity; Mold Breaker bypasses it', () => {
  for (const ability of ['Regenerator', 'Mold Breaker']) {
    const battle = position(ability);
    try {
      const hp = battle.p2.active[0].hp;
      advance(battle, { p1: 'move 1', p2: 'move 4' });
      if (ability === 'Regenerator') assert.equal(battle.p2.active[0].hp, hp);
      else assert.ok(battle.p2.active[0].hp < hp / 2);
    } finally { battle.destroy(); }
  }
});

test('snapshot continuation matches independently replayed simulator and isolates branches', () => {
  const original = position();
  const state = snapshot(original);
  const branch = restore(state);
  const independent = position();
  try {
    const choices = { p1: 'move 4', p2: 'move 4' };
    advance(branch, choices);
    advance(independent, choices);
    assert.deepEqual(cleanLog(branch), cleanLog(independent));
    assert.equal(branch.prng.getSeed(), independent.prng.getSeed());
    assert.equal(snapshot(original), state);
    branch.p1.pokemon[0].set.ability = 'test';
    assert.equal(original.p1.pokemon[0].set.ability, 'Mold Breaker');
  } finally { original.destroy(); branch.destroy(); independent.destroy(); }
});

test('known-position prototype ranks every legal action without mutating the source', () => {
  const battle = position();
  try {
    const state = snapshot(battle);
    const actions = legalActions(battle, 'p1');
    assert.equal(actions.length, 5);
    const result = analyze(battle, { samples: 2 });
    assert.equal(result.candidates.length, actions.length);
    assert.equal(result.scoreKind, 'heuristic-points');
    assert.ok(result.metrics.nodes >= 50);
    assert.equal(result.completedDepth, 1);
    assert.ok(result.candidates.every(c => Number.isFinite(c.score)));
    assert.equal(snapshot(battle), state);
  } finally { battle.destroy(); }
});

test('evaluation is antisymmetric and uses actual boosted stats', () => {
  const battle = position();
  try {
    assert.equal(evaluate(battle, 'p1').score, -evaluate(battle, 'p2').score);
    const atk = battle.p1.active[0].getStat('atk');
    advance(battle, { p1: 'move 3', p2: 'move 3' });
    assert.equal(battle.p1.active[0].getStat('atk'), atk * 2);
    assert.ok(evaluate(battle).terms.setup > 0);
  } finally { battle.destroy(); }
});

test('six-member AAA teams expose four moves and five switches on each side', () => {
  const input = JSON.parse(readFileSync(new URL('../examples/aaa-six.json', import.meta.url)));
  const battle = createPosition(input);
  try {
    assert.equal(legalActions(battle, 'p1').length, 9);
    assert.equal(legalActions(battle, 'p2').length, 9);
  } finally { battle.destroy(); }
});

test('known history reconstructs a non-initial position with hazards and a switch', () => {
  const input = structuredClone(example);
  input.history = [{ p1: 'move 4', p2: 'move 4' }, { p1: 'switch 2', p2: 'move 3' }];
  const replayed = createPosition(input);
  const direct = position();
  try {
    for (const choices of input.history) advance(direct, choices);
    assert.equal(replayed.turn, 3);
    assert.ok(replayed.p1.sideConditions.stealthrock);
    assert.equal(replayed.p1.active[0].species.name, 'Corviknight');
    assert.deepEqual(cleanLog(replayed), cleanLog(direct));
    assert.throws(() => createPosition({ ...input, history: [{ p1: 'move 9', p2: 'move 1' }] }), /history\[0\]/);
  } finally { replayed.destroy(); direct.destroy(); }
});
