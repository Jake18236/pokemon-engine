# Measured performance

Measured on 2026-10-21, Windows, Node **v24.11.1**, Intel **Core i7-13620H**. Run `npm run benchmark` to repeat. The [benchmark script](../scripts/benchmark.js) reports raw JSON with all runs, node counts, timings and process-memory measurements.

The benchmark uses the [two-member](../examples/aaa-position.json) and [six-member](../examples/aaa-six.json) synthetic fixtures. These are team sizes in singles battles, not doubles. Three runs per case, one warm Node process, explicit garbage collection before each run, seed 42, 4,000-transition cap and 10-second search budget. Initial setup/validation is outside search timings. Warm process order affects memory and JIT timings.

| Position / search | Samples root / continuation | Median search time | Transitions | Completed depth |
| --- | --- | ---: | ---: | --- |
| Two per side, one turn | 2 / 2 | **459 ms** | 62 | 1 in all 3 runs |
| Two per side, two turns | 2 / 2 | **10,004 ms** | 1,588–1,726 | 1 in all 3 runs; time-budget fallback |
| Two per side, two turns | 2 / 1 | **5,861 ms** | 771 | 2 in all 3 runs |
| Six per side, one turn | 1 / 1 | **668 ms** | 96 | 1 in all 3 runs |

All four cases ranked Earthquake first. That consistency on these fixtures is not evidence of general playing strength. One sample cannot characterize uncertainty. The two-turn 2/2 case completed in one earlier warm run at 9.8 seconds but did not complete in the final three-run batch; the table reports the final batch without presenting timeout runs as completed searches.

Initial simulator setup plus first validation: **1,044 ms**. Two-member snapshot: **14,990 bytes**. Mean restore-and-destroy time across 100 snapshots: **3.66 ms**. These measurements justify keeping depth one as the default.

Peak sampled heap was approximately **156 MiB** and operating-system peak process RSS was **285 MiB** across the whole benchmark. The first one-turn case used about **87 MiB** peak sampled heap and **171 MiB** sampled RSS. Later RSS includes retained memory from previous deeper searches; it is not incremental memory attributable to six-member battles. Heap delta fluctuates with garbage collection. No hard memory cap is implemented.

## Changes driven by the measurements

The initial unbounded one-round prototype evaluated 50 outcomes in roughly 378–480 ms after warmup, but stopped at replacement decisions. Completing those decisions increases the current one-turn work to 62 transitions. Comparing those figures as a pure speed regression would be misleading.

Full deeper expansion was too expensive. The engine now skips impossible switch probes, reuses each decision's serialized snapshot, and applies an exact maximin cutoff at internal nodes. The cutoff stops evaluating a row after a tested reply proves it cannot beat an already completed row. A regression test compares the complete root result with pruning disabled and confirms identical scores/explanations with fewer simulations. It does not remove root opponent responses or approximate mechanics.

The optional `continuationSamples` setting reduces deeper stochastic expansion. This is a quality/runtime tradeoff, not an exact optimization. The measured 2/1 case completed comfortably inside ten seconds, while 2/2 was borderline. Default continuation sampling remains equal to root sampling so users explicitly choose that tradeoff.

## Interpreting the limits

Time checks occur between synchronous operations; the 10-second budget can overshoot by a few milliseconds. Validation and history replay precede the per-position search timer. Node counts include all iterative-deepening work, chance branches and forced-switch transitions, but exclude legality-only probes. Run the benchmark on the intended deployment hardware before setting a userscript response target. Competitive strength, rare-event coverage and live-browser memory have not been benchmarked.
