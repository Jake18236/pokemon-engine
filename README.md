# Gen 9 AAA battle analysis engine

A local decision-support prototype using the **official Pokémon Showdown simulator**, pinned to `0.11.11`. It ranks legal moves and switches from a fully specified **Generation 9 Almost Any Ability** position. The interactive sandbox lets you edit teams, simulate turns, and watch two engines play locally. It never connects to the public ladder or submits live moves.

## Open the battle sandbox

In VS Code, choose **Terminal → New Terminal**, then run:

```powershell
npm.cmd run dev
```

Open **http://127.0.0.1:3000**. Load a scenario and click **Analyze Position**. Expand a recommendation to see the opponent's replies and sampled consequences. Choose actions for both players and click **Advance Turn**, or use **Play one turn / Play automatically**. **Pause / cancel** interrupts analysis; **Reset position** returns to the loaded starting point.

Use **Create or edit a scenario** to paste or edit Showdown team exports. Save positions in your browser or import/export portable JSON files. No source-code editing is needed. Both complete teams are visible; used moves are marked separately. The example hypothesis file is available as two individual fully specified scenarios.

Read the short [sandbox user guide](docs/sandbox-guide.md). If dependencies are missing after a fresh checkout, run `npm.cmd ci` once. On macOS/Linux, use `npm` in place of `npm.cmd`. To stop the server, press Ctrl+C in the terminal. It listens only on your computer's loopback address.

## Run it

Requires Node.js 22 or newer. Tested on Windows with Node 24.11.1.

```sh
npm ci
npm test
npm run demo
npm run analyze -- examples/aaa-six.json
npm run analyze -- examples/ability-hypotheses.json
npm run benchmark
npm run quality -- --compare docs/quality-baseline.json
npm run profile
```

In PowerShell with script execution disabled, use `npm.cmd` instead of `npm`. The repository configuration skips optional server/database dependencies and install scripts; Showdown ships compiled simulator code. Installation requires npm registry access. No hosted service is required.

Start with [the small example](examples/aaa-position.json). Its Garchomp has Mold Breaker and the opposing Heatran has Levitate. Earthquake can hit Heatran because **the simulator** resolves that ability interaction. Edit the teams, initial seed, team order or choice history to investigate another position. [The six-member example](examples/aaa-six.json) is a synthetic branching benchmark, not a recommended competitive team.

## What works

- AAA team validation, including nonstandard abilities, ability bans, one-of-each ability, species/move restrictions and the Terastallization ban.
- Reconstructing known positions from teams and exact choices; isolated hypothetical branches using Showdown serialization.
- All legal singles moves and switches, including restricted requests, forced replacements and pivots. Showdown validates candidate choices and resolves damage, abilities, items, status, speed, priority, hazards and boosts.
- A non-ML position evaluator and bounded one-to-three-turn search. Default: **one turn, three chance samples, 3,000 simulated transitions, five-second search budget**. Two turns are tested, but larger positions may exhaust the budget.
- Ranked actions, heuristic scores, opponent-response tables, explanations, completed depth, timing and process-memory measurements.
- An explicit weighted-hypothesis interface for uncertain opponent sets. No automatic hidden-set inference.
- A local browser sandbox with visual teams/HP, a readable battle log, team editing, manual controls, cancellable background analysis, and engine-vs-engine playback.
- Nine strategic scenarios with documented expectations and recorded recommendations/runtime. See [decision quality](docs/decision-quality.md) for the current weakness instead of treating a test pass as proof of playing strength.

See [feasibility and source investigation](docs/feasibility.md), [architecture and scoring](docs/architecture.md), [JSON interface](docs/interface.md), and [benchmark results](docs/benchmarks.md).

## How to read the result

Higher `score` favors the selected side. For each candidate, the engine averages chance samples for each opponent response, then reports the **lowest** response average. This asks, “How well does this choice hold up against the most damaging reply we examined?” The separate `mean` treats opponent responses uniformly and is only a diagnostic. Neither number is a win probability.

`completedDepth` tells you how many advances of Showdown's turn counter were searched. Pivot and forced-switch decisions are resolved on the way. If the deeper search runs out of time or nodes, the engine returns the last complete ranking. If even depth one did not finish, it returns **no recommendation**. Always inspect `status` and `stopReason`.

For more depth, add this to a position's `search` field:

```json
{ "depth": 2, "samples": 2, "continuationSamples": 1, "maxNodes": 4000, "timeMs": 10000 }
```

Using fewer continuation samples trades random-outcome coverage for speed. It does not change simulator mechanics. Runtime depends heavily on team size, move choices and pending switches.

## Honest limits

This is a tested prototype, not a claim of strong competitive play. The heuristic weights are hand-selected. Short search misses long plans and rare random outcomes. Conservative pure-action search does not calculate a mixed-strategy equilibrium. Full information inside a hypothetical branch can overestimate what a player knows at later decisions, especially mid-turn and across hidden-set hypotheses.

A live userscript is **not implemented**. A browser exposes a public protocol and the player's private request, not the server's complete battle state. Live integration still needs observation tracking and consistent hidden-state hypotheses. The sandbox runs the existing synchronous engine in a Node worker behind a small local API, so analysis does not block the browser or HTTP loop. It is a fully known local laboratory, not a client for live battles.

Only the pinned AAA rules are supported. Updates to the live ladder may require a simulator upgrade and regression testing. [Licensing and dependency notices](THIRD_PARTY_NOTICES.md) cover the simulator; this repository is private and does not select a license for the owner's new code.
