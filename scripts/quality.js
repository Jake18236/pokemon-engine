import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPosition, SIMULATOR_VERSION } from '../src/simulator.js';
import { analyze } from '../src/search.js';

export function measureQuality() {
  const scenarios = JSON.parse(readFileSync(new URL('../examples/strategy/scenarios.json', import.meta.url)));
  const hash = createHash('sha256');
  for (const file of ['simulator', 'search', 'evaluate']) hash.update(readFileSync(new URL(`../src/${file}.js`, import.meta.url)));
  const rows = scenarios.map(scenario => {
    const battle = createPosition(scenario.position);
    try {
      const result = analyze(battle, scenario.search);
      const best = result.candidates[0];
      const expected = result.candidates.filter(c => scenario.expected.choices.includes(c.id));
      return { id: scenario.id, name: scenario.name, expected: scenario.expected, search: scenario.search,
        recommendation: best?.id ?? null, label: best?.label ?? null,
        metExpectation: !!best && scenario.expected.choices.includes(best.id),
        expectedRank: result.candidates.findIndex(c => scenario.expected.choices.includes(c.id)) + 1 || null,
        scoreGap: best && expected.length ? best.score - Math.max(...expected.map(c => c.score)) : null,
        completedDepth: result.completedDepth, status: result.status,
        elapsedMs: result.metrics.elapsedMs, transitions: result.metrics.nodes,
        candidates: result.candidates.map(c => ({ action: c.id, label: c.label, score: c.score })),
      };
    } finally { battle.destroy(); }
  });
  return { measuredAt: new Date().toISOString(), simulatorVersion: SIMULATOR_VERSION, node: process.version,
    engineHash: hash.digest('hex'), met: rows.filter(r => r.metExpectation).length, total: rows.length, rows };
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/quality.js')) {
  const report = measureQuality();
  const output = process.argv.indexOf('--output');
  const compare = process.argv.indexOf('--compare');
  if (compare !== -1) {
    const baseline = JSON.parse(readFileSync(process.argv[compare + 1], 'utf8'));
    report.comparison = report.rows.map(row => { const before = baseline.rows.find(r => r.id === row.id); return {
      id: row.id, previous: before?.recommendation, current: row.recommendation,
      runtimeDeltaMs: before ? row.elapsedMs - before.elapsedMs : null,
      expectationChanged: before ? row.metExpectation !== before.metExpectation : null,
    }; });
  }
  if (output !== -1) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
