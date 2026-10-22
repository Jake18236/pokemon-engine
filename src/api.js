import { performance } from 'node:perf_hooks';
import { createPosition, FORMAT, SIMULATOR_VERSION } from './simulator.js';
import { analyze } from './search.js';

/** Transport-neutral JSON API. No network access, DOM inspection or live move submission. */
export function analyzeRequest(request) {
  if (request?.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (request.position && request.hypotheses) throw new Error('Supply position or hypotheses, not both');
  if (request.position) {
    const battle = createPosition(request.position);
    try { return { requestId: request.requestId ?? null, ...analyze(battle, request.search) }; }
    finally { battle.destroy(); }
  }
  const hypotheses = request.hypotheses;
  if (!Array.isArray(hypotheses) || !hypotheses.length || hypotheses.length > 16) {
    throw new Error('Supply a known position or 1..16 explicit hypotheses; raw observations are not supported yet');
  }
  const ids = new Set();
  for (const hypothesis of hypotheses) {
    if (typeof hypothesis.id !== 'string' || !hypothesis.id || ids.has(hypothesis.id)) throw new Error('Hypothesis ids must be unique nonempty strings');
    ids.add(hypothesis.id);
    if (!Number.isFinite(hypothesis.weight) || hypothesis.weight <= 0) throw new Error('Hypothesis weights must be positive finite numbers');
  }
  const totalWeight = hypotheses.reduce((sum, h) => sum + h.weight, 0);
  if (!Number.isFinite(totalWeight)) throw new Error('Hypothesis weight sum must be finite');
  const search = request.search ?? {};
  const maxNodes = search.maxNodes ?? 3000;
  const timeMs = search.timeMs ?? 5000;
  if (!Number.isInteger(maxNodes) || maxNodes < hypotheses.length || maxNodes > 1000000 ||
      !Number.isInteger(timeMs) || timeMs < hypotheses.length || timeMs > 300000) {
    throw new Error('Budgets must be integers and allocate at least one node and millisecond per hypothesis');
  }
  const start = performance.now();
  const reports = [];
  let signature;
  for (const hypothesis of hypotheses) {
    const battle = createPosition(hypothesis.position);
    try {
      const side = search.side ?? 'p1';
      if (!['p1', 'p2'].includes(side)) throw new Error('side must be p1 or p2');
      // Own exact request/state must agree. Public-opponent consistency is the caller's responsibility.
      const currentSignature = JSON.stringify({ turn: battle.turn, ended: battle.ended,
        request: battle[side].activeRequest, own: battle.toJSON().sides[side === 'p1' ? 0 : 1],
      });
      if (signature !== undefined && signature !== currentSignature) throw new Error('Hypotheses disagree about our known state or decision boundary');
      signature = currentSignature;
      reports.push({ id: hypothesis.id, weight: hypothesis.weight / totalWeight,
        result: analyze(battle, { ...search, maxNodes: Math.floor(maxNodes / hypotheses.length), timeMs: Math.floor(timeMs / hypotheses.length) }),
      });
    } finally { battle.destroy(); }
  }
  const completedDepth = reports[0].result.completedDepth;
  const comparable = completedDepth > 0 && reports.every(r => r.result.completedDepth === completedDepth);
  let candidates = [];
  if (comparable) {
    const actions = reports[0].result.candidates;
    const actionSignature = list => JSON.stringify(list.map(a => [a.id, a.label]).sort());
    if (!reports.every(r => actionSignature(r.result.candidates) === actionSignature(actions))) {
      throw new Error('Hypotheses disagree on legal root actions');
    }
    candidates = actions.map(action => {
      const scenarioScores = reports.map(report => {
        const candidate = report.result.candidates.find(c => c.id === action.id);
        return { id: report.id, weight: report.weight, score: candidate.score, worstResponse: candidate.worstResponse };
      });
      const score = scenarioScores.reduce((sum, s) => sum + s.weight * s.score, 0);
      return { id: action.id, choice: action.choice, label: action.label, kind: action.kind, score, scenarioScores,
        explanation: `Weighted worst-response score over ${reports.length} explicit hypotheses; weights are user assumptions.`,
      };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
  return { schemaVersion: 1, requestId: request.requestId ?? null, format: FORMAT, simulatorVersion: SIMULATOR_VERSION,
    scoreKind: 'heuristic-points', policy: 'weighted-hypothesis-maximin',
    status: comparable ? reports.every(r => r.result.status === 'complete') ? 'complete' : 'partial-depth' : 'incomplete-hypotheses',
    completedDepth: comparable ? completedDepth : 0, candidates, hypotheses: reports,
    assumptions: ['Hypotheses and weights are supplied, not inferred or calibrated.',
      'Caller must verify consistency with publicly observed opponent events.',
      'Future decisions use full knowledge inside each hypothesis (strategy fusion).',
      'No aggregate ranking is returned for unequal or incomplete search depths.'],
    metrics: { nodes: reports.reduce((sum, r) => sum + r.result.metrics.nodes, 0), elapsedMs: performance.now() - start },
  };
}
