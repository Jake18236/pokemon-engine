# Decision-quality scenarios

The [nine fixtures](../examples/strategy/scenarios.json) are legal, deterministic Gen 9 AAA positions built from ordinary teams and exact choice histories. They use realistic tactical patterns and deliberately small endgames to make inspection affordable. They are not a representative ladder sample or a strength rating. Each fixture includes expected action ids, a plain-language rationale and search settings. The sandbox loads these same files.

Run `npm run quality` to print recommendations, all candidate scores, expected-action rank, score gap, completed depth, transitions, runtime and a hash of the engine source. To compare against the saved baseline:

```sh
npm run quality -- --compare docs/quality-baseline.json
npm run quality -- --compare docs/quality-baseline.json --output my-quality-run.json
```

The baseline was recorded after correcting the Flash Fire evaluator crash, before enabling the rule-table optimization. [The current measurement](quality-current.json) preserves the same recommendations and scores. Time samples can vary with JIT, machine load and concurrent tests; use repeated profiling for speed claims.

| Case | Expected behavior and reason | Recorded result |
| --- | --- | --- |
| Guaranteed KO | Mold Breaker Earthquake beats Levitate and immediately wins | Earthquake; met |
| Defensive switch | Earth Eater Heatran handles Fire/Ground coverage better than the active Corviknight | Switch to Heatran; met, narrow margin |
| Setup window | Exploit a Choice-locked Fire move with Flash Fire and Swords Dance | Swords Dance at depth 2; met |
| Priority | Extreme Speed finishes a weakened faster Garchomp before it can attack | Extreme Speed; met |
| Recovery | Soft-Boiled preserves a damaged Blissey against repeated fixed damage | Soft-Boiled; met |
| Ability immunity | Avoid Thunderbolt into Volt Absorb; use rain-accurate Hurricane | Hurricane; met |
| Hazard management | Clear Stealth Rock for a vulnerable reserve instead of maximizing immediate damage | **Knock Off; disagreement**. Rapid Spin ranks third, about 20.9 points behind |
| Sacrifice | Leave Blissey in so Lucario enters safely and wins with priority; switching Lucario into Earthquake loses | Seismic Toss, accepting the sacrifice; met at depth 2 |
| Status over damage | Reliable Will-O-Wisp reduces physical pressure and outperforms immediate Psychic damage | Will-O-Wisp at depth 2; met |

Eight of nine expectations are met at the specified settings and seed. Some strategic expectations are hypotheses worth testing, not mathematical proofs of optimal play. In the hazard scenario the opponent can set rocks again; Knock Off also removes Leftovers. That makes the disagreement more nuanced than a simple tactical bug. The current hazard heuristic barely prices future switching damage, and the short horizon does not value Moltres's later role explicitly. More paired scenarios (Boots/no Boots, different reserves, hazard setters unable to reapply, multiple seeds and deeper rollouts) should precede tuning.

The tests assert validity, legal expected actions, completed bounded searches, finite scores and source-state isolation for every fixture. Objective tactical cases also protect the expected recommendation. The subjective hazard preference is **reported**, not forced into a passing assertion. No Pokémon/move-specific strategy exceptions or fixture-dependent weights were added.

## Actual bug found and fixed

The setup fixture activated Flash Fire before analysis. Its move-dependent `ModifyAtk` handler expects a move argument; calling `getStat('atk')` outside damage evaluation supplied none and crashed. Static evaluation now uses actual stored/boosted damage stats without contextual damage handlers, and still uses simulator-modified speed. Actual attacks continue to apply ability/item modifiers through Showdown. This is a general fix for context-dependent modifiers, not a Flash Fire special case; a regression test protects the activated-ability position.

## Next quality work

Expand the sample before selecting weights: compare shallow/deeper decisions across multiple seeds, measure performance on held-out scenarios and run paired local self-play with reversed sides. A small fixture pass rate is not a win probability or a competitive Elo estimate. Pure maximin, chance sampling, hidden-state strategy fusion, fixed status costs and coarse hazard pressure remain documented limitations.
