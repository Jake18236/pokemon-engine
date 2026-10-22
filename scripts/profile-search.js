import inspector from 'node:inspector';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createPosition, restore, snapshot } from '../src/simulator.js';
import { analyze } from '../src/search.js';

const input = JSON.parse(readFileSync(new URL('../examples/aaa-position.json', import.meta.url)));
const battle = createPosition(input);
const data = snapshot(battle);
const micro = {};
for (const [name, operation] of Object.entries({
  serialize: () => snapshot(battle), parse: () => JSON.parse(data), restore: () => restore(data).destroy(),
})) {
  const start = performance.now();
  for (let i = 0; i < 100; i++) operation();
  micro[`${name}MeanMs`] = (performance.now() - start) / 100;
}
const session = new inspector.Session(); session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (err, result) => err ? reject(err) : resolve(result)));
await post('Profiler.enable'); await post('Profiler.start');
const result = analyze(battle, { depth: 2, samples: 1, continuationSamples: 1, maxNodes: 10000, timeMs: 30000 });
const { profile } = await post('Profiler.stop'); session.disconnect(); battle.destroy();
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const counts = new Map();
for (const id of profile.samples ?? []) {
  const frame = byId.get(id).callFrame;
  const label = `${frame.functionName || '(anonymous)'} (${frame.url.split('/').at(-1)}:${frame.lineNumber + 1})`;
  counts.set(label, (counts.get(label) ?? 0) + 1);
}
const report = { measuredAt: new Date().toISOString(), node: process.version, snapshotBytes: Buffer.byteLength(data), ...micro,
  completedDepth: result.completedDepth, topAction: result.candidates[0]?.label, metrics: result.metrics,
  hotFunctions: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([frame, samples]) => ({ frame, samples })),
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
