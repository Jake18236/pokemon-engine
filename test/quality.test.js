import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPosition, legalActions, snapshot } from '../src/simulator.js';
import { analyze } from '../src/search.js';
import { evaluate } from '../src/evaluate.js';

const scenarios = JSON.parse(readFileSync(new URL('../examples/strategy/scenarios.json', import.meta.url)));
for (const scenario of scenarios) {
  test(`strategic fixture is legal and searchable: ${scenario.id}`, () => {
    const battle = createPosition(scenario.position);
    try {
      const original = snapshot(battle);
      const actions = legalActions(battle, 'p1');
      assert.ok(scenario.expected.choices.every(c => actions.some(a => a.id === c)));
      const result = analyze(battle, scenario.search);
      assert.equal(result.completedDepth, scenario.search.depth);
      assert.ok(result.candidates.every(c => Number.isFinite(c.score)));
      assert.equal(snapshot(battle), original);
      // Objective tactical checks. Strategic aspirations remain tracked measurements,
      // not assertions that falsely declare a subjective preference universally optimal.
      if (['guaranteed-ko', 'priority', 'ability-immunity', 'sacrifice'].includes(scenario.id)) {
        assert.ok(scenario.expected.choices.includes(result.candidates[0].id), result.candidates[0].label);
      }
    } finally { battle.destroy(); }
  });
}

test('activated Flash Fire does not crash context-free static evaluation', () => {
  const battle = createPosition(scenarios.find(s => s.id === 'setup-window').position);
  try {
    assert.ok(battle.p1.active[0].volatiles.flashfire);
    assert.ok(Number.isFinite(evaluate(battle).score));
  } finally { battle.destroy(); }
});
