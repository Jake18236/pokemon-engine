# Local sandbox architecture

The original simulator/evaluator/search/CLI remain separate. [sandbox/engine.js](../sandbox/engine.js) is a transport-neutral command adapter over those existing modules. It accepts a known position or a **trusted internal** snapshot and returns a plain view, analysis, or a newly simulated position. It never implements damage or legality itself.

[The local HTTP server](../sandbox/server.js) binds to `127.0.0.1`, serves static local assets and owns one in-memory session with its current snapshot, original position and input history. Host/origin checks reject cross-origin use; there are no CORS permissions or public-network bindings. The server never accepts arbitrary simulator snapshots from a browser. File serving uses an explicit allowlist and scenario JSON is limited to 1 MB. Team text and logs are rendered as text, not HTML.

[A persistent Node worker](../sandbox/worker.js) runs team validation, restoration, analysis and turn simulation away from the HTTP event loop. The browser only performs asynchronous requests and renders results. This avoids both browser-main-thread blocking and per-analysis simulator-import overhead. There is one computation at a time; concurrent operations are rejected. Cancellation terminates the worker and starts a fresh one; authoritative state remains in the parent. The simulation is committed only after a successful complete command.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/scenarios` | Existing examples, individual ability hypotheses and strategic fixtures |
| `GET /api/state` | Current plain view and revision; no private simulator object |
| `GET /api/export` | Initial teams/seed/order plus full committed history |
| `POST /api/load` | Validate and load `{revision, position}` atomically |
| `POST /api/reset` | Restore the originally loaded position |
| `POST /api/advance` | Apply `{revision, choices:{p1,p2}}` at the current decision boundary |
| `POST /api/analyze` | Analyze `{revision, search}` without changing state |
| `POST /api/engine-turn` | Independently analyze both sides, then resolve a full local turn including replacements |
| `POST /api/cancel` | Cancel work without applying partial state |

Mutation/analysis commands require the current `revision`. Failed validation, invalid choices, exhausted search or cancellation do not advance the authoritative position. Responses include the revision and plain view; analysis/playback responses also include reports. A browser generation counter ignores stale responses after cancellation. Auto-play is a browser-controlled loop with a delay; it does not schedule background tasks when the page is closed. An already submitted turn can finish unless cancelled.

Engine-vs-engine analyzes both sides before applying either choice. Forced switches are separate decisions. One-turn playback stops after Showdown's turn counter advances or the battle ends. At a mid-turn root it completes that partial turn. Lack of a complete ranking is an error, never permission to choose a default/random move. A 16-decision guard and 180-second worker timeout stop pathological operations without committing partial turns.

Root search response records now include `consequences`: average equal-weight team HP percentage, min/max living members, observed active names/statuses across samples and a single illustrative log. These describe the immediate simulated decision boundary, including pending replacements, while the score may incorporate a longer continuation. They do not alter action scoring or chance sampling. UI labels maintain that distinction.

The browser uses Showdown team-export text for editing and localStorage for named saves. Portable files use the original known-position JSON contract, so they can also be analyzed by the CLI. The sandbox is not a public API or a live observation adapter. The command/view boundary can be reused behind a future userscript transport, but it currently reveals both full teams and makes no claim to infer hidden information.
