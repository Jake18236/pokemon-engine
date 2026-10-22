import { advance, createPosition, legalActions, restore, snapshot, Teams } from '../src/simulator.js';
import { analyze } from '../src/search.js';

/** Plain transport-neutral state. This local lab deliberately exposes both complete teams. */
export function battleView(battle) {
  return {
    turn: battle.turn, ended: battle.ended, winner: battle.winner, request: battle.requestState,
    field: { weather: battle.field.weather, terrain: battle.field.terrain,
      effects: Object.keys(battle.field.pseudoWeather).filter(k => !battle.ruleTable.has(k)) },
    sides: Object.fromEntries(battle.sides.map(side => [side.id, {
      actions: legalActions(battle, side.id), hazards: Object.keys(side.sideConditions),
      pokemon: side.pokemon.map(p => ({
        name: p.name, species: p.species.name, types: p.getTypes(), active: p.isActive, fainted: p.fainted,
        hp: p.hp, maxhp: p.maxhp, status: p.status, ability: p.getAbility().name,
        item: p.getItem().name || 'None', boosts: { ...p.boosts },
        moves: p.moveSlots.map(m => ({ name: m.move, pp: m.pp, maxpp: m.maxpp, revealed: m.used })),
      })),
    }])),
    log: [...battle.log],
  };
}

function result(battle, extra = {}) {
  // Capture before display helpers: they must never affect the authoritative next position.
  const state = snapshot(battle);
  return { snapshot: state, view: battleView(battle), ...extra };
}

export function runCommand(command) {
  let battle;
  try {
    if (command.kind === 'load') {
      battle = createPosition(command.position);
      return result(battle, { teamText: Object.fromEntries(battle.sides.map(s => [s.id, Teams.export(s.team)])) });
    }
    battle = restore(command.snapshot);
    if (command.kind === 'analyze') return { analysis: analyze(battle, command.search) };
    if (command.kind === 'advance') {
      advance(battle, command.choices);
      return result(battle);
    }
    if (command.kind === 'engineTurn') {
      if (battle.ended) throw new Error('This battle has ended. Reset or load another scenario.');
      const turn = battle.turn;
      const decisions = [];
      // Both players analyze the same uncommitted position. Resolve replacements/pivots explicitly.
      while (!battle.ended && battle.turn === turn) {
        if (decisions.length >= 16) throw new Error('Too many replacement decisions in one turn; use manual controls.');
        const choices = {};
        const reports = {};
        for (const side of ['p1', 'p2']) {
          const actions = legalActions(battle, side);
          if (actions[0]?.kind === 'wait') { choices[side] = null; continue; }
          const report = analyze(battle, { ...command.search, side });
          const best = report.candidates[0];
          if (!best) throw new Error(`${side.toUpperCase()}: no complete ranking within the budget. Increase time or transitions, or reduce samples/depth. The turn was not applied.`);
          reports[side] = report;
          choices[side] = best.choice;
        }
        advance(battle, choices);
        decisions.push({ choices, reports });
      }
      return result(battle, { decisions });
    }
    throw new Error('Unknown sandbox command');
  } finally { battle?.destroy(); }
}
