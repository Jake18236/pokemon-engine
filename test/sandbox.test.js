import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCommand } from '../sandbox/engine.js';
import { createSandboxServer } from '../sandbox/server.js';
import { advance, createPosition, restore, snapshot } from '../src/simulator.js';

const input = JSON.parse(readFileSync(new URL('../examples/aaa-position.json', import.meta.url)));
const tactics = JSON.parse(readFileSync(new URL('../examples/strategy/scenarios.json', import.meta.url)));

test('sandbox state exposes real teams, moves, items and atomic manual transitions', () => {
  const loaded = runCommand({ kind: 'load', position: input });
  assert.equal(loaded.view.sides.p2.pokemon[0].ability, 'Levitate');
  assert.equal(loaded.view.sides.p1.actions.length, 5);
  const choices = { p1: 'move 4', p2: 'move 4' };
  const next = runCommand({ kind: 'advance', snapshot: loaded.snapshot, choices });
  const direct = createPosition(input);
  try {
    advance(direct, choices);
    assert.equal(next.view.turn, direct.turn);
    assert.deepEqual(next.view.log.filter(l => !l.startsWith('|t:|')), direct.log.filter(l => !l.startsWith('|t:|')));
    assert.ok(next.view.sides.p1.hazards.includes('stealthrock'));
    assert.ok(next.view.sides.p1.pokemon[0].moves.find(m => m.name === 'Stealth Rock').revealed);
    assert.throws(() => runCommand({ kind: 'advance', snapshot: loaded.snapshot, choices: { p1: 'move 1', p2: 'move 99' } }));
    assert.equal(runCommand({ kind: 'advance', snapshot: loaded.snapshot, choices }).view.turn, 2);
  } finally { direct.destroy(); }
});

test('engine playback analyzes both sides before choices and finishes terminal turns', () => {
  const loaded = runCommand({ kind: 'load', position: tactics.find(s => s.id === 'guaranteed-ko').position });
  const next = runCommand({ kind: 'engineTurn', snapshot: loaded.snapshot, search: { samples: 1, depth: 1, timeMs: 10000 } });
  assert.equal(next.view.ended, true);
  assert.equal(next.view.winner, 'p1');
  assert.equal(next.decisions[0].choices.p1, 'move 1');
  assert.ok(next.decisions[0].reports.p1 && next.decisions[0].reports.p2);
  assert.throws(() => runCommand({ kind: 'engineTurn', snapshot: next.snapshot }), /ended/);
});

test('playback refuses to apply a guessed move if the search budget is insufficient', () => {
  const loaded = runCommand({ kind: 'load', position: input });
  assert.throws(() => runCommand({ kind: 'engineTurn', snapshot: loaded.snapshot, search: { maxNodes: 1 } }), /not applied/);
  const original = restore(loaded.snapshot);
  assert.equal(original.turn, 1); original.destroy();
});

test('play one turn resolves a pending pivot and the queued opponent move', () => {
  const mon = (species, ability, moves) => ({ species, ability, moves, evs: { hp: 1 } });
  const battle = createPosition({ format: 'gen9almostanyability', teams: {
    p1: [mon('Mew', 'Regenerator', ['U-turn']), mon('Garchomp', 'Mold Breaker', ['Earthquake'])],
    p2: [mon('Blissey', 'Natural Cure', ['Seismic Toss'])],
  } });
  try {
    advance(battle, { p1: 'move 1', p2: 'move 1' });
    const result = runCommand({ kind: 'engineTurn', snapshot: snapshot(battle), search: { samples: 1, timeMs: 10000 } });
    assert.equal(result.view.turn, 2);
    const active = result.view.sides.p1.pokemon.find(p => p.active);
    assert.equal(active.species, 'Garchomp');
    assert.equal(active.hp, active.maxhp - 100);
    assert.equal(result.decisions[0].choices.p2, null);
  } finally { battle.destroy(); }
});

test('HTTP API loads, analyzes, advances, exports, resets, guards revisions, and cancels without committing', async () => {
  const app = await createSandboxServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (route, body, headers = {}) => {
    const res = await fetch(`${base}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.match(await (await fetch(base)).text(), /Analyze Position/);
    const scenarios = await (await fetch(`${base}/api/scenarios`)).json();
    assert.ok(scenarios.some(s => s.id === 'sacrifice'));
    let loaded = await post('load', { revision: 0, position: input });
    assert.equal(loaded.status, 200);
    const first = loaded.body.revision;
    assert.equal((await post('advance', { revision: 0, choices: {} })).status, 409);
    assert.equal((await post('load', { revision: first, position: input }, { Origin: 'https://example.com' })).status, 403);
    const analysis = await post('analyze', { revision: first, search: { samples: 1 } });
    assert.ok(analysis.body.analysis.candidates.length > 0);
    assert.equal(analysis.body.revision, first);
    const advanced = await post('advance', { revision: first, choices: { p1: 'move 4', p2: 'move 4' } });
    assert.equal(advanced.body.view.turn, 2);
    const exported = await (await fetch(`${base}/api/export`)).json();
    assert.equal(exported.history.length, 1);
    const replay = createPosition(exported); assert.equal(replay.turn, 2); replay.destroy();
    const reset = await post('reset', { revision: advanced.body.revision });
    assert.equal(reset.body.view.turn, 1);
    // Worker computes expensive analysis while the HTTP loop remains responsive.
    const pending = post('engine-turn', { revision: reset.body.revision, search: { depth: 3, samples: 64, timeMs: 30000, maxNodes: 100000 } });
    await new Promise(resolve => setTimeout(resolve, 80));
    const current = await (await fetch(`${base}/api/state`)).json();
    assert.equal(current.revision, reset.body.revision);
    const cancelled = await post('cancel', {});
    assert.equal(cancelled.body.revision, reset.body.revision);
    assert.match((await pending).body.error, /cancelled/);
    const after = await post('advance', { revision: reset.body.revision, choices: { p1: 'move 4', p2: 'move 4' } });
    assert.equal(after.body.view.turn, 2);
  } finally { await app.close(); }
});
