# Architecture and scoring

## Components

| Component | Responsibility |
| --- | --- |
| [simulator adapter](../src/simulator.js) | Fixed AAA format, validated teams, deterministic history, snapshots, request-derived actions, real Showdown choice parsing |
| [evaluation](../src/evaluate.js) | Hand-selected position scores from current simulated state |
| [search](../src/search.js) | Simultaneous response matrices, chance sampling, turn horizons, budgets, exact internal maximin cutoffs |
| [JSON API](../src/api.js) | Versioned known-position and weighted-hypothesis requests |
| [CLI](../src/cli.js) | Read local JSON and print analysis; no network or move submission |
| [tests](../test/) | Controlled mechanics, parity, isolation, search and interface checks |

## State and mechanics

Use `createPosition` with legal initial teams and an exact input history. It validates both teams before constructing a Battle. Every set must explicitly supply an ability; species defaults are not an acceptable hidden-ability guess. Team Preview is resolved using the supplied order, or the listed order. History steps include both required choices; a waiting side must be omitted or null. Invalid histories fail instead of auto-selecting actions.

`snapshot` calls Showdown's serializer and converts its output to a JSON string. `restore` parses that string, calls Showdown's deserializer and reconnects a no-op output callback through `restart`. This breaks mutable aliases between branches, including team sets and logs. Restore reconstructs objects, queues and references; it is not a constant-cost clone. JSON-object restores also deep-copy the supplied object. Only unmodified AAA is accepted. These snapshots are trusted internal data, not an external save format or an untrusted browser input API.

Legal actions come from each side's current request. The adapter excludes obviously impossible switches, then checks candidates on disposable restored battles using `Side.choose` without committing a turn. The search passes both choices to `Battle.choose`; the first does not advance a simultaneous decision until all required sides choose. A waiting side has a single null action. The battle's pending queue is preserved through pivots and replacement requests. The simulator, not the evaluator, handles actual types, immunities, priority, item removal and ability events.

## Evaluation

Positive points favor the requested side. Except for terminal results, subtract the opponent's features from our features:

| Term | Weight / interpretation |
| --- | --- |
| Material | 300 per living Pokémon |
| HP | 180 × remaining HP fraction per Pokémon |
| Status | Penalty: burn 18, paralysis 24, poison 18, toxic 30, sleep 40, freeze 50 |
| Stats | Small logarithmic contribution using actual stored stats for reserves and simulator-modified stats for active Pokémon, weighted by HP |
| Setup | 6 × relevant boost stages × HP fraction; Attack/Sp. Atk matter only with a matching attack category |
| Hazards | Small pressure penalty: 5 × layers × living reserves per hazard; **not** predicted damage |
| Speed | Small bonus for effective action speed advantage, including Trick Room; move priority is handled by simulation |
| Terminal | +100,000 win, −100,000 loss, 0 draw |

Current stats come from `Pokemon.storedStats`, `getStat`, and `getActionSpeed`, not a species base-stat approximation. Current HP, status, boosts, item and ability effects follow the actual branch. Skill Swap therefore changes later behavior even though the initial set still contains the old ability.

Type matchups, ability/item interactions, immediate KO threats, recovery and setup opportunities affect the evaluation through **simulated successors**. No separate hand-coded damage calculator or arbitrary ability tier list is used. Fixed status penalties and hazard pressure are coarse heuristics: for example, the hazard penalty can undervalue a reserve wearing Boots even though actual switch damage is correctly zero. Speed does not model priority in isolation. Static weights and long-term positional strength have not been tuned or calibrated.

## Search

At each decision, construct a matrix: our actions are rows and the opponent's actions are columns. Each cell averages `samples` actual simulated continuations at the root, or `continuationSamples` at deeper decisions (defaults to `samples`). Select the row with the highest minimum column average. This is pure-action maximin, not alternating chess minimax or a mixed-strategy solver. All legal root responses are considered; none are assumed to be the opponent's predicted choice.

Seeded chance sampling uses Showdown's PRNG. Search replaces the hypothetical future RNG with reproducible sample seeds rather than exploiting the position's exact RNG. Sibling action pairs share seeds to reduce comparison noise. This does not enumerate every damage roll, accuracy check, secondary effect or speed tie. `min`/`max` are sample ranges, not guaranteed bounds or confidence intervals.

Depth counts advances of the simulator's turn counter. At a mid-turn root it includes completion of that partial turn. Forced/pivot decisions can add extra matrix nodes before the next turn, and their remaining queued actions stay intact. Opponent selection and our selection are simultaneous at normal turn boundaries. Later continuation decisions assume access to the fully simulated branch; unobserved queued choices and hidden-set scenarios can create information advantages unavailable in real play. A proper information-set search is deferred.

Iterative deepening finishes depth one before attempting depth two. Only a complete root matrix replaces the published ranking. Budgets count **simulated transitions**, including switches and repeated iterations; legality probes are measured in runtime but not node count. Time checks run between simulator operations and cannot interrupt a synchronous operation, so the wall-time limit is soft. Initial team validation/replay occurs before a known-position search's timer. No hard memory cap is implemented; memory is measured.

An exact internal-row cutoff saves work once a tested opponent reply makes an action no better than an already completed action at that node. Further replies cannot improve that row's minimum. Root rows remain fully evaluated for reporting, and ties remain deterministic. `prune: false` provides a reference mode; tests compare full candidate results. No approximate beam pruning or transposition cache is implemented.

## Hidden information and future userscripts

The API can aggregate explicitly supplied full hypotheses and positive weights. It averages each action's maximin score across those hypotheses. It checks that our own state/request and legal root actions agree and refuses to mix incomplete or unequal search depths. Caller-supplied weights are assumptions. Public-opponent consistency checking, posterior updates, uncertainty-aware future decisions and automatic set generation are not implemented.

Future flow: userscript observes public battle events plus our own request → observation tracker → consistent AAA hypotheses → local worker/process running this engine → ranked-action display. The tracker must preserve unknowns (including abilities), HP intervals, PP uncertainty and timer uncertainty. Use a request id to discard stale analysis. No component should submit a move. The Node-only simulator is a reason to validate worker or local-process packaging before selecting a transport.
