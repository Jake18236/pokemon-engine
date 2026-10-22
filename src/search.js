import { performance } from 'node:perf_hooks';
import { advance, legalActions, PRNG, restore, snapshot, SIMULATOR_VERSION, FORMAT } from './simulator.js';
import { evaluate } from './evaluate.js';

class BudgetExceeded extends Error {}
const average = values => values.reduce((a, b) => a + b, 0) / values.length;

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in ${min}..${max}`);
  return value;
}

// Sibling action pairs use common chance samples for less noisy comparisons.
function sampleSeed(seed, ply, sample) {
  let value = (seed ^ Math.imul(ply + 1, 0x9e3779b9) ^ Math.imul(sample + 1, 0x85ebca6b)) >>> 0;
  const words = [];
  for (let i = 0; i < 4; i++) {
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    words.push(value & 65535);
  }
  return words;
}

/** Iterative full-width simultaneous maximin; depth counts advances of Showdown's turn counter. */
export function analyze(battle, options = {}) {
  const side = options.side ?? 'p1';
  if (!['p1', 'p2'].includes(side)) throw new Error('side must be p1 or p2');
  const foe = side === 'p1' ? 'p2' : 'p1';
  const samples = integer(options.samples ?? 3, 'samples', 1, 64);
  const continuationSamples = integer(options.continuationSamples ?? samples, 'continuationSamples', 1, 64);
  const depth = integer(options.depth ?? 1, 'depth', 1, 3);
  const maxNodes = integer(options.maxNodes ?? 3000, 'maxNodes', 1, 1000000);
  const timeMs = integer(options.timeMs ?? 5000, 'timeMs', 1, 300000);
  const seed = integer(options.seed ?? 42, 'seed', 0, 0xffffffff);
  if (options.prune !== undefined && typeof options.prune !== 'boolean') throw new Error('prune must be boolean');
  const prune = options.prune ?? true;
  const start = performance.now();
  const initialMemory = process.memoryUsage();
  let peakHeapBytes = initialMemory.heapUsed;
  let peakRssBytes = initialMemory.rss;
  let nodes = 0;
  let decisionBoundaries = 0;
  let prunedResponses = 0;
  let completedDepth = 0;
  let stopReason = null;
  let candidates = [];
  const iterations = [];
  const state = snapshot(battle);
  const root = restore(state);
  let baseline;
  try {
    if (root.sides.some(s => s.choice.actions.length)) throw new Error('Analyze before either side submits a choice');
    baseline = evaluate(root, side);
  } finally { root.destroy(); }

  function checkBudget() {
    if (nodes >= maxNodes) throw new BudgetExceeded('node-limit');
    if (performance.now() - start >= timeMs) throw new BudgetExceeded('time-limit');
  }
  function measure() {
    const memory = process.memoryUsage();
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  }
  function matrix(position, targetTurn, ply) {
    checkBudget();
    decisionBoundaries++;
    const serialized = snapshot(position);
    const ownActions = legalActions(position, side, serialized, checkBudget);
    const replies = legalActions(position, foe, serialized, checkBudget);
    if (!ownActions.length || !replies.length) throw new Error('No legal actions at a nonterminal decision boundary');
    const rows = [];
    let bestRow;
    const sampleCount = ply === 0 ? samples : continuationSamples;
    for (const action of ownActions) {
      const responses = [];
      let discarded = false;
      for (const response of replies) {
        const values = [];
        const terms = {};
        const consequences = ply === 0 ? { samples: sampleCount, sampleLog: [],
          ...Object.fromEntries(['p1', 'p2'].map(id => [id, { meanHpPercent: 0, minLiving: Infinity, maxLiving: 0, active: [], statuses: [] }])) } : null;
        for (let sample = 0; sample < sampleCount; sample++) {
          checkBudget();
          const branch = restore(serialized);
          try {
            branch.prng = new PRNG(sampleSeed(seed, ply, sample));
            const logStart = branch.log.length;
            advance(branch, { [side]: action.choice, [foe]: response.choice });
            if (consequences) {
              if (sample === 0) consequences.sampleLog = branch.log.slice(logStart).filter(line => !line.startsWith('|t:|'));
              for (const id of ['p1', 'p2']) {
                const team = branch[id].pokemon;
                const info = consequences[id];
                info.meanHpPercent += team.reduce((sum, p) => sum + p.hp / p.maxhp, 0) / team.length * 100 / sampleCount;
                const living = team.filter(p => p.hp > 0).length;
                info.minLiving = Math.min(info.minLiving, living); info.maxLiving = Math.max(info.maxLiving, living);
                info.active = [...new Set([...info.active, ...branch[id].active.map(p => p.species.name)])];
                info.statuses = [...new Set([...info.statuses, ...team.filter(p => p.status && p.hp > 0).map(p => `${p.species.name}: ${p.status}`)])];
              }
            }
            nodes++;
            measure();
            // Keep pivot/replacement decisions explicit; never auto-pick a switch.
            const value = branch.ended || branch.turn >= targetTurn ? evaluate(branch, side) :
              matrix(branch, targetTurn, ply + 1)[0];
            values.push(value.score);
            for (const [key, number] of Object.entries(value.terms)) terms[key] = (terms[key] ?? 0) + number / sampleCount;
          } finally { branch.destroy(); }
        }
        responses.push({ action: response.id, label: response.label, mean: average(values),
          min: Math.min(...values), max: Math.max(...values), terms, ...(consequences ? { consequences } : {}) });
        // Exact pure-maximin cutoff on internal rows only: another opponent reply cannot
        // improve this row's minimum. Keep root diagnostics complete and preserve ties.
        const bound = responses.at(-1).mean;
        if (prune && ply > 0 && bestRow && (bound < bestRow.score ||
            bound === bestRow.score && action.id.localeCompare(bestRow.id) > 0)) {
          prunedResponses += replies.length - responses.length;
          discarded = true;
          break;
        }
      }
      if (discarded) continue;
      const worst = responses.reduce((a, b) => a.mean <= b.mean ? a : b);
      rows.push({ ...action, score: worst.mean, mean: average(responses.map(r => r.mean)),
        worstResponse: worst.action, terms: worst.terms, responses,
        explanation: explain(worst, baseline.terms),
      });
      const row = rows.at(-1);
      if (!bestRow || row.score > bestRow.score || row.score === bestRow.score && row.id.localeCompare(bestRow.id) < 0) bestRow = row;
    }
    return rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  if (!battle.ended) {
    for (let horizon = 1; horizon <= depth; horizon++) {
      const iterationStart = performance.now();
      const previousNodes = nodes;
      const position = restore(state);
      try {
        const result = matrix(position, position.turn + horizon, 0);
        // Commit only a complete root matrix; never compare unequally searched candidates.
        candidates = result;
        completedDepth = horizon;
        iterations.push({ depth: horizon, nodes: nodes - previousNodes, elapsedMs: performance.now() - iterationStart });
      } catch (error) {
        if (!(error instanceof BudgetExceeded)) throw error;
        stopReason = error.message;
        break;
      } finally { position.destroy(); }
    }
  }
  measure();
  return {
    schemaVersion: 1, format: FORMAT, simulatorVersion: SIMULATOR_VERSION, side,
    scoreKind: 'heuristic-points', policy: 'pure-action-maximin', chanceSamples: samples, continuationSamples, seed,
    status: battle.ended ? 'terminal' : completedDepth === depth ? 'complete' : completedDepth ? 'partial-depth' : 'budget-exhausted',
    requestedDepth: depth, completedDepth, stopReason, baseline, candidates,
    assumptions: ['Fully specified hypothetical state.', 'All legal opponent responses considered.',
      'Mean is a uniform-response diagnostic, not an opponent prediction.',
      'Chance samples can miss rare events; scores are not win probabilities.'],
    metrics: { nodes, decisionBoundaries, prunedResponses, elapsedMs: performance.now() - start, iterations,
      heapDeltaBytes: process.memoryUsage().heapUsed - initialMemory.heapUsed,
      sampledPeakHeapBytes: peakHeapBytes, sampledPeakRssBytes: peakRssBytes,
      rssBytes: process.memoryUsage().rss, processLifetimePeakRssBytes: process.resourceUsage().maxRSS * 1024 },
  };
}

function explain(worst, initialTerms) {
  const differences = Object.entries(worst.terms)
    .map(([key, value]) => [key, value - (initialTerms[key] ?? 0)])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2).map(([key, delta]) => `${key} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points`);
  return `Worst response: ${worst.label}. Main evaluation changes: ${differences.join(', ')}.`;
}
