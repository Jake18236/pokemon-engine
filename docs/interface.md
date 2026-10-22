# JSON interface v1

Import `analyzeRequest` from [the API module](../src/api.js). It synchronously returns a JSON-serializable result or throws an `Error` for invalid input. The CLI prints errors to stderr and exits with status 1. The package has no network endpoints.

## Known position

```js
import { analyzeRequest } from './src/api.js';

const result = analyzeRequest({
  schemaVersion: 1,
  requestId: 'my-battle:turn-12:revision-2',
  position, // structure described below
  search: { side: 'p1', depth: 1, samples: 3, seed: 42, maxNodes: 3000, timeMs: 5000 },
});
```

`position`:

| Field | Meaning |
| --- | --- |
| `format` | Required, exactly `gen9almostanyability` |
| `teams.p1`, `teams.p2` | Complete Showdown set arrays or Showdown team-export text; explicit abilities required |
| `seed` | Initial reconstruction seed: four integers 0..65535; defaults to `[1,2,3,4]` |
| `teamOrder.p1`, `.p2` | Optional complete preview order strings, e.g. `213456`; defaults to listed order |
| `history` | Ordered decision pairs, e.g. `[{p1:'move 4',p2:'move 4'},{p1:'switch 2',p2:'move 1'}]` |

Teams use Showdown's own set fields: species, ability, item, moves, nature, EVs, IVs, level, etc. Omitted optional stats use Showdown defaults. These defaults are **hypothesis assumptions**, not observed opponent facts. Showdown rejects accidentally all-zero EV sets; for intentional zero-stat EV fixtures, use `evs: {hp: 1}` as instructed by its validator. Missing or illegal abilities are rejected. Known replay history must include exact choice decisions, including mid-turn switches; public replay text alone is insufficient. This interface does not accept arbitrary HP patches or raw client Battle objects.

The CLI also accepts the position directly, with a top-level `search` object, as in [the example](../examples/aaa-position.json).

## Search options

| Option | Default | Limits |
| --- | --- | --- |
| `side` | `p1` | `p1` or `p2` |
| `depth` | 1 | 1..3 turn-counter advances |
| `samples` | 3 | 1..64 root chance samples per pair |
| `continuationSamples` | `samples` | 1..64 samples per deeper pair |
| `seed` | 42 | Integer 0..4294967295; separate from reconstruction RNG |
| `maxNodes` | 3000 | 1..1000000 simulated transitions across all iterations |
| `timeMs` | 5000 | 1..300000; soft limit checked between operations |
| `prune` | true | Exact internal maximin cutoffs; false for reference comparisons |

## Hidden-set hypotheses

Supply `hypotheses` instead of `position`:

```js
{
  schemaVersion: 1,
  requestId: 'my-battle:turn-12',
  search: { depth: 1, samples: 3, maxNodes: 3000, timeMs: 5000 },
  hypotheses: [
    { id: 'levitate', weight: 3, position: levitatePosition },
    { id: 'earth-eater', weight: 1, position: earthEaterPosition },
  ],
}
```

See [the runnable hypothesis example](../examples/ability-hypotheses.json). Supply 1..16 unique nonempty ids and positive finite weights. Weights are normalized. Node/time budgets are split equally across hypotheses, independent of their weights; validation/reconstruction overhead is additional. Our own exact state and request must agree. The caller must ensure all hypotheses fit public opponent observations. Unknown inputs are never filled with standard species abilities.

If all hypotheses finish the same positive depth, the response includes weighted candidate scores and per-hypothesis scores. Otherwise `status` is `incomplete-hypotheses` and aggregate `candidates` is empty. Individual reports remain available. Full-information continuation within hypotheses is an approximation, explicitly reported in `assumptions`.

## Response contract

- `schemaVersion`, echoed `requestId`, `format`, `simulatorVersion`, `side` for known-position responses.
- `scoreKind: 'heuristic-points'`, policy, search seed and sampling settings.
- `status`: `complete`, `partial-depth`, `budget-exhausted`, or `terminal`; ensembles may return `incomplete-hypotheses`.
- `requestedDepth`, `completedDepth`, `stopReason` and the initial `baseline` for known-position responses.
- Sorted `candidates`: action `id`, `choice`, `kind`, human-readable `label`, `score`, `explanation`; known-position candidates also include diagnostic `mean`, `worstResponse`, component `terms`, and sampled `responses`. Ensemble candidates instead include `scenarioScores`.
- `metrics`: transitions, decision boundaries, saved responses, elapsed time, completed iterations and process memory for individual searches. Ensemble metrics sum transitions and include total elapsed time.

`choice` strings describe hypothetical simulator actions; `null` means wait. They are not submitted anywhere. Never treat `score` or the hypothesis weights as calibrated win probabilities. Retain request ids and show `completedDepth`/status in any future UI. Internal snapshots contain both full teams and must never be mistaken for publicly observed information.

Memory fields: heap delta can be negative due to garbage collection; sampled heap/RSS peaks can miss short-lived peaks; `processLifetimePeakRssBytes` is the operating system's process-wide high-water mark, not memory uniquely owned by this request. All byte fields are bytes. Runtime includes search legality checks and branch restores, but excludes prior team creation/validation.
