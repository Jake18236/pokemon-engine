import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createPosition, restore, snapshot } from '../src/simulator.js';
import { analyze } from '../src/search.js';

const input = JSON.parse(readFileSync(new URL('../examples/aaa-position.json', import.meta.url)));
const start = performance.now();
const battle = createPosition(input);
const setupMs = performance.now() - start;
const state = snapshot(battle);
const cloneTimes = [];
for (let i = 0; i < 100; i++) {
  const time = performance.now();
  restore(state).destroy();
  cloneTimes.push(performance.now() - time);
}
const rows = [];
const six = createPosition(JSON.parse(readFileSync(new URL('../examples/aaa-six.json', import.meta.url))));
const cases = [
  { name: '2v2-one-turn', position: battle, depth: 1, samples: 2 },
  { name: '2v2-two-turns', position: battle, depth: 2, samples: 2 },
  { name: '2v2-two-turns-less-sampling', position: battle, depth: 2, samples: 2, continuationSamples: 1 },
  { name: '6v6-one-turn', position: six, depth: 1, samples: 1 },
];
for (const { name, position, ...options } of cases) {
  for (let run = 0; run < 3; run++) {
    global.gc?.();
    const result = analyze(position, { ...options, maxNodes: 4000, timeMs: 10000 });
    rows.push({ name, requestedDepth: options.depth, run: run + 1, completedDepth: result.completedDepth,
      status: result.status, stopReason: result.stopReason,
      topAction: result.candidates[0]?.label, ...result.metrics });
  }
}
battle.destroy();
six.destroy();
console.log(JSON.stringify({ node: process.version, platform: process.platform,
  cpu: os.cpus()[0].model, setupMs, snapshotBytes: Buffer.byteLength(state),
  restoreMeanMs: cloneTimes.reduce((a, b) => a + b, 0) / cloneTimes.length, rows,
  processLifetimePeakRssBytes: process.resourceUsage().maxRSS * 1024,
}, null, 2));
