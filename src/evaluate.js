import { assertFormat } from './simulator.js';

const STATUS_COST = { brn: 18, par: 24, psn: 18, tox: 30, slp: 40, frz: 50 };
const STATS = ['atk', 'def', 'spa', 'spd', 'spe'];

/** Heuristic points. Run on disposable branches: simulator stat helpers run event handlers. */
export function evaluate(battle, perspective = 'p1') {
  assertFormat(battle);
  if (!['p1', 'p2'].includes(perspective)) throw new Error('side must be p1 or p2');
  if (battle.ended) {
    const score = !battle.winner ? 0 : battle.winner === battle[perspective].name ? 100000 : -100000;
    return { score, terms: { terminal: score } };
  }
  const own = features(battle[perspective]);
  const opponent = features(battle[perspective === 'p1' ? 'p2' : 'p1']);
  const terms = Object.fromEntries(Object.keys(own).map(key => [key, own[key] - opponent[key]]));
  return { score: Object.values(terms).reduce((a, b) => a + b, 0), terms };
}

function features(side) {
  const result = { material: 0, hp: 0, status: 0, stats: 0, setup: 0, hazards: 0, speed: 0 };
  for (const pokemon of side.pokemon) {
    if (pokemon.fainted || pokemon.hp <= 0) continue;
    const fraction = pokemon.hp / pokemon.maxhp;
    result.material += 300;
    result.hp += 180 * fraction;
    result.status -= STATUS_COST[pokemon.status] ?? 0;
    // Damage-stat modifiers can require an attacker, defender AND move (e.g. activated
    // Flash Fire). getStat has no move context; don't trigger those handlers here.
    // Use actual boosted stats, plus fully modified speed. Contextual damage modifiers
    // are evaluated by the real simulated attacks, not by a fictional neutral move.
    const stats = Object.fromEntries(STATS.map(stat => [stat,
      pokemon.isActive ? pokemon.getStat(stat, false, stat !== 'spe') : pokemon.storedStats[stat],
    ]));
    result.stats += 8 * fraction * Math.log2(Math.max(1, (Math.max(stats.atk, stats.spa) + stats.def + stats.spd) / 300));
    if (pokemon.isActive) {
      const offense = pokemon.moveSlots.map(slot => side.battle.dex.moves.get(slot.id).category);
      const relevant = ['def', 'spd', 'spe', 'accuracy', 'evasion'];
      if (offense.includes('Physical')) relevant.push('atk');
      if (offense.includes('Special')) relevant.push('spa');
      result.setup += fraction * relevant.reduce((sum, stat) => sum + 6 * pokemon.boosts[stat], 0);
    }
  }
  const active = side.active[0];
  const foe = side.foe.active[0];
  if (active?.hp > 0 && foe?.hp > 0) {
    // Includes paralysis, Choice Scarf, speed abilities and Trick Room. Priority is resolved in search.
    result.speed = 6 * Math.sign(active.getActionSpeed() - foe.getActionSpeed());
  }
  const reserves = side.pokemon.filter(p => !p.isActive && !p.fainted).length;
  // Small positional penalty, not a damage prediction. Actual switch damage/immunities are simulated.
  for (const id of ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']) {
    const condition = side.sideConditions[id];
    if (condition) result.hazards -= 5 * reserves * (condition.layers ?? 1);
  }
  return result;
}
