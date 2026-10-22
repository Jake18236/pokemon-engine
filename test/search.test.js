import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/search.js';
import { advance, createPosition, FORMAT, snapshot } from '../src/simulator.js';

export function smallPosition() {
  return createPosition({ format: FORMAT, teams: {
    p1: [{ species: 'Garchomp', ability: 'Mold Breaker', evs: { hp: 1 }, moves: ['Earthquake', 'Swords Dance'] }],
    p2: [{ species: 'Blissey', ability: 'Fluffy', evs: { hp: 1 }, moves: ['Seismic Toss', 'Soft-Boiled'] }],
  } });
}

test('two full turns complete, include all action pairs, and are deterministic', () => {
  const battle = smallPosition();
  try {
    const state = snapshot(battle);
    const first = analyze(battle, { depth: 2, samples: 2, timeMs: 20000 });
    const second = analyze(battle, { depth: 2, samples: 2, timeMs: 20000 });
    assert.equal(first.completedDepth, 2);
    assert.equal(first.status, 'complete');
    assert.deepEqual(first.candidates, second.candidates);
    assert.ok(first.metrics.nodes > 8);
    assert.ok(first.candidates.every(c => c.responses.length === 2));
    assert.equal(snapshot(battle), state);
  } finally { battle.destroy(); }
});

test('node budget keeps the last fully evaluated depth, with no partial ranking bias', () => {
  const battle = smallPosition();
  try {
    const shallow = analyze(battle, { depth: 1, samples: 1 });
    const limited = analyze(battle, { depth: 2, samples: 1, maxNodes: 5 });
    assert.equal(limited.completedDepth, 1);
    assert.equal(limited.stopReason, 'node-limit');
    assert.deepEqual(limited.candidates, shallow.candidates);
    assert.equal(limited.metrics.nodes, 5);
    const insufficient = analyze(battle, { maxNodes: 1 });
    assert.equal(insufficient.status, 'budget-exhausted');
    assert.deepEqual(insufficient.candidates, []);
  } finally { battle.destroy(); }
});

test('internal maximin cutoffs preserve full-search scores and complete root diagnostics', () => {
  const battle = smallPosition();
  try {
    const options = { depth: 2, samples: 2, timeMs: 20000 };
    const full = analyze(battle, { ...options, prune: false });
    const pruned = analyze(battle, { ...options, prune: true });
    assert.equal(full.completedDepth, 2);
    assert.equal(pruned.completedDepth, 2);
    assert.deepEqual(pruned.candidates, full.candidates);
    assert.ok(pruned.metrics.nodes < full.metrics.nodes);
    assert.ok(pruned.metrics.prunedResponses > 0);
  } finally { battle.destroy(); }
});

test('time budget stops search and does not return a partial candidate matrix', () => {
  const battle = smallPosition();
  try {
    const result = analyze(battle, { depth: 3, samples: 64, timeMs: 1 });
    assert.equal(result.stopReason, 'time-limit');
    assert.equal(result.completedDepth, 0);
    assert.deepEqual(result.candidates, []);
  } finally { battle.destroy(); }
});

test('different RNG samples expose outcome variation', () => {
  const battle = smallPosition();
  try {
    const result = analyze(battle, { samples: 8, timeMs: 20000 });
    assert.ok(result.candidates.some(c => c.responses.some(r => r.min < r.max)));
  } finally { battle.destroy(); }
});

test('terminal results and p2 perspective have correct signs', () => {
  const battle = createPosition({ format: FORMAT, teams: {
    p1: [{ species: 'Garchomp', ability: 'Mold Breaker', evs: { hp: 1 }, moves: ['Earthquake'] }],
    p2: [{ species: 'Heatran', ability: 'Levitate', evs: { hp: 1 }, moves: ['Stealth Rock'] }],
  } });
  try {
    advance(battle, { p1: 'move 1', p2: 'move 1' });
    assert.ok(battle.ended);
    assert.equal(analyze(battle).baseline.score, 100000);
    assert.equal(analyze(battle, { side: 'p2' }).baseline.score, -100000);
    assert.equal(analyze(battle).status, 'terminal');
    assert.deepEqual(analyze(battle).candidates, []);
  } finally { battle.destroy(); }
});

test('rejects invalid budgets and partially committed simultaneous positions', () => {
  const battle = smallPosition();
  try {
    for (const options of [{ side: 'p3' }, { samples: 0 }, { depth: 9 }, { timeMs: NaN }, { seed: -1 }]) {
      assert.throws(() => analyze(battle, options));
    }
    battle.choose('p1', 'move 1');
    assert.throws(() => analyze(battle), /before either side/);
  } finally { battle.destroy(); }
});

test('three-turn horizon advances three actual turns in a single-action position', () => {
  const set = { species: 'Blissey', ability: 'Natural Cure', evs: { hp: 1 }, moves: ['Seismic Toss'] };
  const battle = createPosition({ format: FORMAT, teams: { p1: [set], p2: [set] } });
  try {
    const result = analyze(battle, { depth: 3, samples: 1, timeMs: 20000 });
    assert.equal(result.completedDepth, 3);
    assert.deepEqual(result.metrics.iterations.map(i => i.nodes), [1, 2, 3]);
  } finally { battle.destroy(); }
});
