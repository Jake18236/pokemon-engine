# Feasibility and prototype plan

Inspected official Showdown source and npm package **0.11.11** on 2026-10-21.

## Findings

- [Official simulator documentation](https://github.com/smogon/pokemon-showdown/blob/master/sim/SIMULATOR.md) documents BattleStream, seed inputs, player choices and packed/JSON teams. It explicitly says teams are **not validated** by battle creation. Use `TeamValidator` first.
- [Battle implementation](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle.ts) exports `Battle.toJSON`, `Battle.fromJSON`, `restart` and `choose`. [State implementation](https://github.com/smogon/pokemon-showdown/blob/master/sim/state.ts) reconstructs Battle, Side, Pokemon, queue, PRNG and object references. `restart` reconnects the output callback. This is an internal API: [upstream warns](https://github.com/smogon/pokemon-showdown/blob/master/sim/README.md) that undocumented APIs do not follow semver. Pin the exact version and test upgrades.
- Serialization is not a cheap immutable clone. The serialized object includes aliases (notably logs and sets); use a JSON string boundary before restoring branches. Never shallow-copy a live Battle. Deserialization regenerates requests and may run code that mutates state. Test round trips, branch isolation, and continuation against independently replayed battles.
- State source warns that formats modifying species through `onModifySpecies` cannot necessarily deserialize. We support only the built-in `gen9almostanyability`, no custom rules or universal format system.
- [AAA format](https://github.com/smogon/pokemon-showdown/blob/master/config/formats.ts) uses Gen 9, Standard OMs, removal of Obtainable Abilities, Ability Clause = 1, Sleep Moves Clause, and Terastal Clause. Species/move legality still applies. Banned abilities include Huge Power, Wonder Guard, Fur Coat, Ice Scales and others; use upstream's full validator, not a hand-maintained list. The package's AAA block matches the upstream block inspected (upstream formats file blob `9a65139c7db3e999180e47614415162c61012a50`). This is a pinned rules snapshot, not an automatic live-ladder rules guarantee.
- Browser protocol/request data is not the server Battle. Opponent moves, item, ability, EVs, IVs, exact HP and RNG may be unknown. A userscript cannot clone the live server battle. Future integration needs observed-state tracking and explicit hypotheses, each reconstructed independently. Never silently substitute species' usual abilities.
- The official Node package is documented for Node, not direct browser deployment. Start with a local library/CLI; defer transport and browser packaging.

## Architecture and sequence

1. Small simulator adapter: fixed format, team validation, deterministic replay, isolated serialization, request-derived actions checked by Showdown's choice parser. No live room connection or move submission.
2. Known-position prototype: one simultaneous decision matrix. Each row is our action, each column an opponent response; both are chosen before the simulator advances. Rank the worst opponent response's average sampled outcome (conservative pure-action maximin), also show the uniform-response mean. These scores are heuristic points, never win probabilities.
3. Tests before expansion: AAA legality, nonstandard ability immunities/modifiers, seeded continuation parity and source-state isolation.
4. Shallow iterative deepening with deterministic random sampling, node/time limits and completed-iteration fallback. Forced switch and pivot decisions must remain explicit. Benchmark runtime, branch restoration cost and process memory before optimizing.
5. JSON interface for fully specified scenario hypotheses with explicit weights. Future userscript passes observations to a separate reconstruction layer. It must not send server PRNG state or read hidden fields from local hypothetical states as observations.

## Practical limits

Pure-action maximin can be too defensive; it is not a mixed-strategy equilibrium. Sampling can miss rare events. A short horizon undervalues long-term plans. Hypothesis weights are assumptions, not learned probabilities. Full-information search within a hypothesis can assume more information at future decisions than a real player has (strategy fusion). Unknown-state reconstruction, calibrated beliefs, live capture and userscript transport are separate future work.

## Dependencies and licensing

The npm package is MIT, copyright 2011–2026 Guangcong Luo and contributors; preserve its notice when distributing it. See [third-party notices](../THIRD_PARTY_NOTICES.md). Runtime dependencies include esbuild, mysql2, preact, preact-render-to-string, sockjs and ts-chacha20. Optional server/database packages and install scripts are disabled in this repository; the package includes compiled simulator code. No web/database server is started. Package-lock records transitive versions/integrities. Pokémon names and related intellectual property are not licensed by Showdown's MIT software license. Project code is private/unlicensed pending the owner's licensing choice.
