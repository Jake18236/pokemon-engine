// Executed in separate processes by the regression test to isolate the format cache.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { advance, createPosition, legalActions, restore, snapshot } from '../src/simulator.js';
import { analyze } from '../src/search.js';

const fixtures = JSON.parse(readFileSync(new URL('../examples/strategy/scenarios.json', import.meta.url)));
fixtures.push({ id: 'original', position: JSON.parse(readFileSync(new URL('../examples/aaa-position.json', import.meta.url))) });
const digest = battle => {
  const data = JSON.parse(snapshot(battle));
  data.log = data.log.map(line => line.startsWith('|t:|') ? '|t:|' : line);
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
};
const output = [];
for (const fixture of fixtures) {
  const battle = createPosition(fixture.position);
  try {
    const rules = JSON.stringify([...battle.ruleTable]);
    const state = snapshot(battle);
    const own = legalActions(battle, 'p1');
    const foe = legalActions(battle, 'p2');
    const continuations = [];
    for (const action of own) {
      const branch = restore(state);
      try {
        advance(branch, { p1: action.choice, p2: foe[0].choice });
        continuations.push(digest(branch));
      } finally { branch.destroy(); }
    }
    const result = analyze(battle, { samples: 1, timeMs: 30000 });
    output.push({ id: fixture.id, snapshot: digest(battle), rules, rulesAfter: JSON.stringify([...battle.ruleTable]),
      actions: own, continuations, candidates: result.candidates });
  } finally { battle.destroy(); }
}
console.log(JSON.stringify(output));
