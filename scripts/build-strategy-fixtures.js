// Authoring helper. The generated JSON is also editable/importable through the sandbox.
import { mkdirSync, writeFileSync } from 'node:fs';
const physical = { atk: 252, spd: 4, spe: 252 };
const defensive = { hp: 252, def: 252, spd: 4 };
const mon = (species, ability, moves, extra = {}) => ({ species, ability, moves, evs: defensive, nature: 'Bold', ...extra });
const attack = (species, ability, moves, extra = {}) => mon(species, ability, moves, { evs: physical, nature: 'Jolly', ...extra });
const position = (p1, p2, history = []) => ({ format: 'gen9almostanyability', seed: [1, 2, 3, 4], teams: { p1, p2 }, history });
const scenarios = [];
function add(id, name, why, choices, battle, depth = 1) {
  scenarios.push({ id, name, expected: { choices, why }, search: { depth, samples: 2, continuationSamples: 1, timeMs: 20000, maxNodes: 10000 }, position: battle });
}
add('guaranteed-ko', 'Tactic · Take the guaranteed knockout',
  'Mold Breaker Earthquake KOs Heatran through Levitate before it acts. Setup or a weaker attack gives up a certain immediate win.', ['move 1'],
  position([attack('Garchomp', 'Mold Breaker', ['Earthquake', 'Dragon Claw', 'Swords Dance'])],
    [mon('Heatran', 'Levitate', ['Flamethrower', 'Earth Power', 'Stealth Rock'])]));
add('defensive-switch', 'Defense · Find the safe switch',
  'Corviknight is threatened by Fire attacks. Heatran resists Fire and its nonstandard Earth Eater blocks the opposing Ground coverage. Prefer the defensive switch.', ['switch 2'],
  position([mon('Corviknight', 'Volt Absorb', ['Brave Bird', 'Roost', 'Defog']), mon('Heatran', 'Earth Eater', ['Flamethrower', 'Earth Power'])],
    [mon('Heatran', 'Levitate', ['Flamethrower', 'Earth Power'])]));
add('setup-window', 'Planning · Use a choice-locked setup window',
  'Heatran is Choice-locked into Flamethrower, which Flash Fire Garchomp ignores. Swords Dance uses the safe turn to improve future damage; the opponent has no reserve in this endgame.', ['move 1'],
  position([attack('Garchomp', 'Flash Fire', ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Stealth Rock'])],
    [mon('Heatran', 'Levitate', ['Flamethrower', 'Earth Power', 'Flash Cannon', 'Protect'], { item: 'Choice Specs' })], [{ p1: 'move 4', p2: 'move 1' }]), 2);
add('priority', 'Tactic · Priority beats speed',
  'Three Seismic Tosses have weakened a faster boosted Garchomp. Lucario must use Extreme Speed to finish it before Earthquake; Close Combat moves too late.', ['move 1'],
  position([mon('Blissey', 'Regenerator', ['Seismic Toss']), attack('Lucario', 'Adaptability', ['Extreme Speed', 'Close Combat', 'Swords Dance'])],
    [attack('Garchomp', 'Mold Breaker', ['Earthquake', 'Swords Dance'])],
    [...Array.from({ length: 3 }, () => ({ p1: 'move 1', p2: 'move 2' })), { p1: 'switch 2', p2: 'move 2' }]));
add('recovery', 'Defense · Recover before attacking',
  'Blissey has taken four Seismic Tosses. Soft-Boiled restores enough health to avoid being worn down; maximizing immediate damage ignores the recovery window.', ['move 1'],
  position([mon('Blissey', 'Magic Guard', ['Soft-Boiled', 'Seismic Toss', 'Stealth Rock', 'Thunder Wave'])],
    [mon('Chansey', 'No Guard', ['Seismic Toss'])], Array.from({ length: 4 }, () => ({ p1: 'move 3', p2: 'move 1' }))));
add('ability-immunity', 'AAA · Respect Volt Absorb',
  'Thunderbolt is blocked by Corviknight\'s nonstandard Volt Absorb. Primordial Sea makes Hurricane accurate, providing useful damage instead of selecting an apparently super-effective Electric attack.', ['move 2'],
  position([mon('Zapdos', 'Primordial Sea', ['Thunderbolt', 'Hurricane', 'Roost'], { evs: { spa: 252, spd: 4, spe: 252 }, nature: 'Timid' })],
    [mon('Corviknight', 'Volt Absorb', ['Brave Bird', 'Body Press'])]));
add('hazard-management', 'Planning · Clear hazards for the reserve',
  'Stealth Rock threatens a reserve Moltres without Boots. Rapid Spin clears it while improving speed. This probes whether the engine values future switching safety over Knock Off\'s immediate damage.', ['move 2'],
  position([attack('Great Tusk', 'Regenerator', ['Bulk Up', 'Rapid Spin', 'Knock Off', 'Headlong Rush']), mon('Moltres', 'Flame Body', ['Flamethrower', 'Roost', 'Hurricane'])],
    [mon('Skarmory', 'Well-Baked Body', ['Stealth Rock', 'Roost', 'Body Press'], { item: 'Leftovers' })], [{ p1: 'move 1', p2: 'move 1' }]));
add('sacrifice', 'Endgame · Preserve the priority win condition',
  'Garchomp is weakened but boosted. Keep Blissey in, even if it faints, so Lucario enters safely and wins with Extreme Speed. Switching Lucario directly into Earthquake loses the win condition. Either staying move is acceptable.', ['move 1', 'move 2'],
  position([mon('Blissey', 'Natural Cure', ['Seismic Toss', 'Soft-Boiled']), attack('Lucario', 'Adaptability', ['Extreme Speed', 'Close Combat'])],
    [attack('Garchomp', 'Mold Breaker', ['Earthquake', 'Swords Dance'])], Array.from({ length: 3 }, () => ({ p1: 'move 1', p2: 'move 2' }))), 2);
add('status-over-damage', 'Planning · Burn instead of immediate damage',
  'No Guard makes Will-O-Wisp reliable. Burning the Choice Band physical attacker reduces later damage; this probes whether a short search prefers disruption over Psychic\'s immediate damage.', ['move 1'],
  position([mon('Mew', 'No Guard', ['Will-O-Wisp', 'Psychic'])],
    [attack('Garchomp', 'Tough Claws', ['Dragon Claw', 'Earthquake'], { item: 'Choice Band' })]), 2);
mkdirSync(new URL('../examples/strategy/', import.meta.url), { recursive: true });
writeFileSync(new URL('../examples/strategy/scenarios.json', import.meta.url), JSON.stringify(scenarios, null, 2) + '\n');
