import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRequest } from '../src/api.js';

const position = (ability = 'Levitate') => ({ format: 'gen9almostanyability', teams: {
  p1: [{ species: 'Garchomp', ability: 'Regenerator', evs: { atk: 252 }, moves: ['Earthquake', 'Dragon Claw'] }],
  p2: [{ species: 'Heatran', ability, evs: { def: 252 }, moves: ['Flamethrower'] }],
} });
const request = () => ({ schemaVersion: 1, requestId: 'battle-example:turn-1', search: { samples: 1, timeMs: 20000 },
  hypotheses: [
    { id: 'levitate', weight: 3, position: position('Levitate') },
    { id: 'earth-eater', weight: 1, position: position('Earth Eater') },
  ],
});

test('known-position interface preserves request id and serializes to JSON', () => {
  const result = analyzeRequest({ schemaVersion: 1, requestId: 'test:1', position: position(), search: { samples: 1 } });
  assert.equal(result.requestId, 'test:1');
  assert.equal(result.status, 'complete');
  assert.equal(JSON.parse(JSON.stringify(result)).candidates.length, 2);
});

test('explicit hidden-ability hypotheses produce weighted action scores', () => {
  const input = request();
  const before = JSON.stringify(input);
  const result = analyzeRequest(input);
  assert.equal(result.status, 'complete');
  assert.equal(result.hypotheses[0].weight, 0.75);
  for (const candidate of result.candidates) {
    const expected = candidate.scenarioScores.reduce((sum, s) => sum + s.weight * s.score, 0);
    assert.equal(candidate.score, expected);
  }
  assert.equal(JSON.stringify(input), before);
  assert.match(result.assumptions.join(' '), /strategy fusion/);
});

test('rejects raw observations, missing abilities, invalid weights and conflicting own state', () => {
  assert.throws(() => analyzeRequest({ schemaVersion: 1, observations: [] }), /raw observations/);
  assert.throws(() => analyzeRequest({ schemaVersion: 2 }), /schemaVersion/);
  for (const change of [
    input => { input.hypotheses[0].weight = 0; },
    input => { input.hypotheses[0].weight = Infinity; },
    input => { input.hypotheses[1].id = 'levitate'; },
    input => { delete input.hypotheses[0].position.teams.p2[0].ability; },
    input => { input.hypotheses[1].position.teams.p1[0].item = 'Leftovers'; },
  ]) {
    const input = request();
    change(input);
    assert.throws(() => analyzeRequest(input));
  }
});

test('insufficient hypothesis budgets never produce an aggregate recommendation', () => {
  const input = request();
  input.search.maxNodes = 2;
  const result = analyzeRequest(input);
  assert.equal(result.status, 'incomplete-hypotheses');
  assert.deepEqual(result.candidates, []);
  assert.ok(result.metrics.nodes <= 2);
});
