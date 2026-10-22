# Battle sandbox: a short user guide

## Start

1. Open this repository in VS Code.
2. Choose **Terminal → New Terminal**.
3. Run `npm.cmd run dev` (Windows) or `npm run dev` (macOS/Linux).
4. Open **http://127.0.0.1:3000** in your browser.

The existing dependencies must be installed. If the terminal says it cannot find `pokemon-showdown`, run `npm.cmd ci` once, then start again. Node 22+ is required. If port 3000 is occupied, run `$env:PORT=3001; npm.cmd run dev` in PowerShell and open the printed address. Changes to server/worker code require stopping and restarting the command.

## Try a battle

Choose **Mold Breaker vs Levitate**, then **Load scenario**. The board shows each active Pokémon, its real ability and item, HP, status, boosts and moves with PP. Expand a team member below the board for reserve details. All moves are known in this sandbox; green `used` marks distinguish those already used. This is not a reconstruction of a live opponent's hidden team.

Click **Analyze Position**. The list is sorted by heuristic score for the selected player. Higher is better for that player; negative is worse. A score of 100,000 marks a simulated win, not a percentage. Expand a row to see its explanation, worst examined reply, and each response's sampled immediate consequences. Expand **One sampled continuation** to read an illustrative simulator log. Average HP and living-Pokémon ranges summarize samples at the next decision boundary; they are not guaranteed predictions or the complete searched future.

The analysis header always shows completed/requested turns, transitions and elapsed search time. A shallow-search notice remains visible at depth one. If time or nodes run out, the engine keeps the last complete depth. If no depth completed, it recommends nothing. Try fewer samples or a larger budget.

**Select this action** fills the move/switch selector for the analyzed side. Choose the other side's action and click **Advance Turn**. Both decisions resolve together. A knockout, U-turn or similar event can require another replacement decision; the waiting player has a `Wait` option. No move is submitted to an external service.

## Watch engine vs. engine

- **Play one turn** analyzes both sides from the same position, applies both choices and resolves replacement decisions until the turn ends.
- **Play automatically** repeats that process, pausing briefly between turns.
- **Pause / cancel** stops automatic playback and terminates an unfinished worker computation. Only fully completed turns are committed; you may safely continue manually afterward.
- **Reset position** restores the original loaded scenario, including any history it already contained. Pause first if an analysis is running.

The playback panel reports each selected move and its depth, transitions, time and budget stop reason. The main ranking shown after playback is explicitly labeled as analysis of the **previous position**. Analyze again for recommendations at the new position. If either engine lacks a complete ranking, the whole turn is left unchanged and playback stops with an error.

Depth/time/nodes/samples apply to **each side's analysis at each decision**, not the total wall time of an engine turn. A pivot may add more decisions. Start with depth 1, two root samples, one deeper sample and a five-second budget. The server caps individual search time at 30 seconds and transitions at 100,000; a whole worker operation also has a three-minute emergency timeout. These controls are not calibrated strength settings.

## Create your own teams and scenarios

Open **Create or edit a scenario**. The loaded teams appear as ordinary Showdown export text. Edit the species, item, ability, EVs, nature and move names, or paste team exports you already have. For example:

```text
Garchomp @ Leftovers
Ability: Mold Breaker
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Swords Dance
- Stealth Rock
```

Separate Pokémon with a blank line. The first member leads. Every member needs an explicit ability and legal Gen 9 moves. Showdown checks AAA legality and explains problems (banned ability, duplicate ability, illegal move, etc.). **Validate and load teams** starts a new battle; it does not preserve damage or status from the old one.

To make a later-turn scenario, play the desired moves, type a name, and click **Save current position in this browser**. It becomes a scenario option. **Export current position** downloads the initial teams, seed and complete choice history; **Import JSON** reconstructs it later. This preserves state through the simulator rather than patching HP manually. Exported histories include mid-turn replacements. The original CLI examples also load directly. Weighted hypothesis ensembles must be analyzed through the existing CLI/API; the sandbox selects one fully specified hypothesis at a time.

Local saves belong to this browser and origin; `localhost` and `127.0.0.1` have different storage. Export files for durable backups. Battle progress is in server memory and is lost when the server stops, unless saved/exported.

## Strategic experiments

The scenario menu includes knockout, defense, setup, priority, recovery, ability immunity, hazards, sacrifice and status cases. Its description explains the expected behavior. Planning cases set depth 2 when loaded; your time/node settings remain adjustable. Expectations are not hardcoded into the engine. [The quality report](decision-quality.md) records successes and the hazard-management disagreement.

## Errors and scope

This is one shared local sandbox per server. Multiple tabs see the same battle; revision checks reject stale choices, and a page refresh resynchronizes a stale tab. No accounts, public hosting, ladder connection, sprites fetched from external servers or external userscript modifications are involved. The interface works with local assets after npm dependencies are installed. Stop the server with Ctrl+C when finished.
