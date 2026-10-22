import showdown from 'pokemon-showdown';

export const { Battle, Dex, PRNG, Teams, TeamValidator } = showdown;
export const FORMAT = 'gen9almostanyability';
export const SIMULATOR_VERSION = '0.11.11';

let rulesPrepared = false;
function prepareAAARules() {
  if (rulesPrepared || process.env.AAA_REFERENCE_RULES === '1') return;
  Dex.formats.load();
  const format = Dex.formats.get(FORMAT);
  // Upstream supports this cache slot, but AAA's rule repeal leaves it empty.
  // Cache ONLY the final top-level unmodified AAA table, never a nested/repealed subrule.
  // Battle mechanics read this table; mutable battle state is still restored independently.
  format.ruleTable = Dex.formats.getRuleTable(format);
  rulesPrepared = true;
}

export function assertFormat(battle) {
  if (battle.format.id !== FORMAT || battle.format.customRules?.length || battle.gameType !== 'singles') {
    throw new Error(`Only ${FORMAT} without custom rules is supported`);
  }
}

export function snapshot(battle) {
  assertFormat(battle);
  // toJSON alone retains aliases, including the log. The string is the isolation boundary.
  return JSON.stringify(battle.toJSON());
}

export function restore(serialized) {
  // Snapshots are trusted internal data, but reject other formats before constructing them.
  const state = typeof serialized === 'string' ? JSON.parse(serialized) : structuredClone(serialized);
  if (state.formatid !== FORMAT) throw new Error(`Only ${FORMAT} snapshots are supported`);
  prepareAAARules();
  const battle = Battle.fromJSON(state);
  battle.restart(() => {});
  assertFormat(battle);
  return battle;
}

function validatedTeam(input, side) {
  prepareAAARules();
  const team = typeof input === 'string' ? Teams.import(input) : structuredClone(input);
  if (!Array.isArray(team) || !team.length) throw new Error(`${side}: a complete team is required`);
  for (const set of team) {
    if (!set?.ability) throw new Error(`${side}: supply an explicit ability for every Pokémon`);
  }
  const problems = new TeamValidator(FORMAT).validateTeam(team);
  if (problems?.length) throw new Error(`${side}: illegal AAA team:\n${problems.join('\n')}`);
  return team;
}

/** Fully known initial teams + exact simulator choice history; never a public replay parser. */
export function createPosition(input) {
  if (input.format !== FORMAT) throw new Error(`format must be ${FORMAT}`);
  const p1 = validatedTeam(input.teams?.p1, 'p1');
  const p2 = validatedTeam(input.teams?.p2, 'p2');
  const seed = input.seed ?? [1, 2, 3, 4];
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some(n => !Number.isInteger(n) || n < 0 || n > 65535)) {
    throw new Error('seed must contain four unsigned 16-bit integers');
  }
  const battle = new Battle({
    formatid: FORMAT, seed, strictChoices: true, send: () => {},
    p1: { name: 'p1', team: p1 }, p2: { name: 'p2', team: p2 },
  });
  try {
    if (battle.requestState === 'teampreview') {
      advance(battle, {
        p1: `team ${input.teamOrder?.p1 ?? p1.map((_, i) => i + 1).join('')}`,
        p2: `team ${input.teamOrder?.p2 ?? p2.map((_, i) => i + 1).join('')}`,
      });
    }
    if (input.history !== undefined && !Array.isArray(input.history)) throw new Error('history must be an array');
    for (const [index, choices] of (input.history ?? []).entries()) {
      try { advance(battle, choices); } catch (error) {
        throw new Error(`history[${index}]: ${error.message}`);
      }
    }
    return battle;
  } catch (error) {
    battle.destroy();
    throw error;
  }
}

/** Advances a local hypothetical battle only. Capture required sides before either choice commits. */
export function advance(battle, choices) {
  assertFormat(battle);
  if (battle.ended) throw new Error('Cannot advance a finished battle');
  const required = battle.sides.filter(s => s.activeRequest && !s.activeRequest.wait);
  if (!required.length) throw new Error('Battle is not at a decision boundary');
  for (const side of battle.sides) {
    const choice = choices?.[side.id];
    if (required.includes(side)) {
      if (typeof choice !== 'string' || !choice.trim()) throw new Error(`${side.id} requires an explicit choice`);
    } else if (choice != null) {
      throw new Error(`${side.id} must wait; use null or omit its choice`);
    }
  }
  for (const side of required) {
    if (!battle.choose(side.id, choices[side.id])) throw new Error(side.choice.error || 'Invalid choice');
  }
}

/** Enumerate singles requests, then use Showdown itself to accept/reject each candidate. */
export function legalActions(battle, sideID, serialized = undefined, checkBudget = () => {}) {
  assertFormat(battle);
  if (!['p1', 'p2'].includes(sideID)) throw new Error('side must be p1 or p2');
  if (battle.ended) return [];
  const side = battle[sideID];
  const request = side.activeRequest;
  if (!request || request.wait) return [{ id: 'wait', choice: null, label: 'Wait', kind: 'wait' }];
  if (request.teamPreview) throw new Error('Choose team order before analysis');
  const candidates = [];
  for (const [index, move] of (request.active?.[0]?.moves ?? []).entries()) {
    if (!move.disabled) candidates.push({
      id: `move ${index + 1}`, choice: `move ${index + 1}`, label: move.move, kind: 'move',
    });
  }
  for (const [index, pokemon] of side.pokemon.entries()) {
    const reviving = !!side.slotConditions[side.active[0].position]?.revivalblessing;
    if (reviving ? !pokemon.fainted : pokemon.isActive || pokemon.fainted) continue;
    if (!request.forceSwitch && side.active[0].trapped) continue;
    candidates.push({
      id: `switch ${index + 1}`, choice: `switch ${index + 1}`,
      label: `Switch to ${pokemon.name}`, kind: 'switch',
    });
  }
  serialized ??= snapshot(battle);
  return candidates.filter(action => {
    checkBudget();
    const probe = restore(serialized);
    probe.strictChoices = false;
    try {
      // Side.choose validates without committing a simultaneous turn.
      return probe[sideID].choose(action.choice) && probe[sideID].isChoiceDone();
    } finally { probe.destroy(); }
  });
}
