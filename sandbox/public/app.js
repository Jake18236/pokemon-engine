const $ = id => document.getElementById(id);
const make = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; };
let state = { revision: 0 }, catalog = [], busy = false, automatic = false, cancelling = false, generation = 0, timer;
const controls = ['load', 'reset', 'advance', 'analyze', 'step', 'play', 'create', 'save', 'export', 'import'];
const notify = (text, error = false) => { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; };
function setBusy(value) { busy = value; for (const id of controls) $(id).disabled = value || automatic; $('pause').disabled = cancelling; $('play-status').textContent = automatic ? 'Automatic playback' : value ? 'Working…' : 'Paused'; }
async function api(path, body) {
  const response = await fetch(`/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.revision, ...body }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function settings() {
  return { side: $('side').value, depth: Number($('depth').value), timeMs: Math.round(Number($('seconds').value) * 1000), maxNodes: Number($('nodes').value), samples: Number($('samples').value), continuationSamples: Number($('continuation').value) };
}
function clearAnalysis() { $('rankings').replaceChildren(); $('analysis-summary').textContent = 'Position changed. Analyze again for current recommendations.'; }
function hpBar(p) { const bar = make('progress'); bar.max = p.maxhp; bar.value = p.hp; bar.className = p.hp / p.maxhp < .3 ? 'low' : ''; bar.setAttribute('aria-label', `${p.name} HP ${p.hp} of ${p.maxhp}`); return bar; }
function pokemonInfo(p, large = false, side = '') {
  const element = make(large ? 'article' : 'details', null, large ? `combatant ${side}` : `reserve ${p.fainted ? 'fainted' : ''}`);
  if (large) { element.append(make('span', side === 'p1' ? 'PLAYER 1' : 'PLAYER 2', 'eyebrow')); element.append(make('div', p.species.slice(0, 2).toUpperCase(), 'avatar')); element.append(make('h3', p.species)); }
  else element.append(make('summary', `${p.species}${p.active ? ' · active' : ''}${p.fainted ? ' · fainted' : ''} · ${p.hp}/${p.maxhp} HP`));
  element.append(make('div', p.types.join(' / '), 'types'), hpBar(p), make('div', `${p.hp} / ${p.maxhp} HP · ${p.status || (p.fainted ? 'Fainted' : 'Healthy')}`, 'hp'));
  element.append(make('div', `Ability: ${p.ability} · Item: ${p.item}`, 'details'));
  const boosts = Object.entries(p.boosts).filter(([, n]) => n).map(([s, n]) => `${s} ${n > 0 ? '+' : ''}${n}`).join(' · ');
  if (boosts) element.append(make('div', boosts, 'badge'));
  const moves = make('div', null, 'moves');
  for (const move of p.moves) { const chip = make('span', `${move.name} ${move.pp}/${move.maxpp}${move.revealed ? ' · used' : ''}`, `move ${move.revealed ? 'used' : ''}`); moves.append(chip); }
  element.append(moves);
  return element;
}
function readableLog(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('|split|')) { line = lines[++i]; i++; }
    if (!line) continue;
    const [, event, a, b, c] = line.split('|');
    const name = a?.replace(/^p([12])[a-z]: /, 'P$1 ').replace(/^p([12]): p[12]$/, 'Player $1');
    const messages = {
      turn: `Turn ${a}`, move: `${name} used ${b}.`, switch: `${name} entered (${c}).`, drag: `${name} was forced in (${c}).`,
      '-damage': `${name}: ${b} HP remaining.`, '-heal': `${name} recovered to ${b}.`, faint: `${name} fainted.`,
      '-status': `${name} became ${b}.`, '-curestatus': `${name} recovered from ${b}.`, '-immune': `${name} is immune.`,
      '-boost': `${name}: ${b} +${c}.`, '-unboost': `${name}: ${b} −${c}.`, '-ability': `${name}: ${b}.`,
      '-activate': `${name}: ${b}.`, '-fail': `${name}: the action failed.`, '-miss': `${name}: the move missed.`,
      '-sidestart': `${name}: ${b} started.`, '-sideend': `${name}: ${b} ended.`, '-weather': `Weather: ${a}.`,
      '-start': `${name}: ${b} started.`, '-end': `${name}: ${b} ended.`, '-item': `${name}: ${b}.`, '-enditem': `${name} lost ${b}.`,
      '-supereffective': `Super effective against ${name}.`, '-resisted': `${name} resisted the attack.`, '-crit': `Critical hit on ${name}.`,
      win: `${a} won the battle.`, tie: 'The battle ended in a draw.',
    };
    if (messages[event]) result.push({ text: messages[event], turn: event === 'turn' });
  }
  return result;
}
function renderState(next, editTeams = false) {
  state = next;
  const view = state.view;
  if (!view) return;
  $('turn').textContent = view.ended ? `Battle finished · ${view.winner || 'Draw'}` : `Turn ${view.turn}${view.request === 'switch' ? ' · replacement needed' : ''}`;
  $('field').textContent = [view.field.weather, view.field.terrain, ...view.field.effects].filter(Boolean).join(' · ') || 'Clear field';
  $('active').replaceChildren(); $('teams').replaceChildren();
  for (const side of ['p1', 'p2']) {
    const team = view.sides[side];
    const active = team.pokemon.find(p => p.active);
    if (active) $('active').append(pokemonInfo(active, true, side));
    const list = make('div'); list.append(make('h3', `${side.toUpperCase()} team`), make('p', `Side conditions: ${team.hazards.join(', ') || 'none'}`, 'muted'));
    team.pokemon.forEach(p => list.append(pokemonInfo(p)));
    $('teams').append(list);
    const selector = $(`${side}-choice`); selector.replaceChildren();
    for (const action of team.actions) { const option = make('option', action.label); option.value = action.choice ?? ''; selector.append(option); }
    if (editTeams && next.teamText) $(`team-${side}`).value = next.teamText[side];
  }
  const log = $('log'); log.replaceChildren(...readableLog(view.log).map(l => make('p', l.text, l.turn ? 'turn' : ''))); log.scrollTop = log.scrollHeight;
  $('raw-log').textContent = view.log.join('\n');
  clearAnalysis();
}
function showAnalysis(report, oldPosition = false) {
  const summary = $('analysis-summary'); summary.replaceChildren();
  const status = `${report.side.toUpperCase()} · ${report.completedDepth}/${report.requestedDepth} turns · ${report.metrics.nodes.toLocaleString()} transitions · ${(report.metrics.elapsedMs / 1000).toFixed(2)} s`;
  summary.append(make('strong', status));
  summary.append(make('p', oldPosition ? 'Recommendations for the position before the displayed engine turn.' : 'Recommendations for the current position.', 'muted'));
  if (report.completedDepth < 2) summary.append(make('p', 'Shallow search: short-term tactics only.', 'warning'));
  if (report.stopReason) summary.append(make('p', `Stopped: ${report.stopReason}. ${report.completedDepth ? 'Showing the last complete depth.' : 'No complete ranking. Increase the budget or reduce samples.'}`, 'warning'));
  if (report.status === 'terminal') summary.append(make('p', 'This battle has ended.'));
  $('rankings').replaceChildren();
  report.candidates.forEach((candidate, index) => {
    const card = make('details', null, 'rank');
    const title = make('summary'); title.append(make('span', `#${index + 1}`, 'rank-number'), make('span', candidate.label), make('strong', candidate.score.toFixed(1)));
    card.append(title, make('p', candidate.explanation));
    const worst = candidate.responses.find(r => r.action === candidate.worstResponse);
    card.append(make('p', `Worst examined response: ${worst?.label ?? candidate.worstResponse}`, 'muted'));
    if (worst?.consequences) card.append(consequences(worst.consequences));
    if (!oldPosition) {
      const choose = make('button', 'Select this action'); choose.onclick = () => { $(`${report.side}-choice`).value = candidate.choice ?? ''; notify(`${candidate.label} selected for ${report.side.toUpperCase()}. Choose the other side, then Advance Turn.`); }; card.append(choose);
    }
    card.append(make('p', 'Opponent responses · expand to inspect', 'muted'));
    for (const response of candidate.responses) {
      const row = make('details', null, 'response'); row.append(make('summary', `${response.label} → ${response.mean.toFixed(1)} points (${response.min.toFixed(1)} to ${response.max.toFixed(1)})`));
      if (response.consequences) row.append(consequences(response.consequences));
      row.append(make('p', `Evaluation: ${Object.entries(response.terms).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`, 'muted'));
      card.append(row);
    }
    $('rankings').append(card);
  });
}
function consequences(value) {
  const e = make('div', null, 'response'); e.append(make('strong', 'Sampled immediate consequences'));
  for (const side of ['p1', 'p2']) {
    const s = value[side];
    e.append(make('p', `${side.toUpperCase()}: average team HP ${s.meanHpPercent.toFixed(1)}% · living ${s.minLiving}–${s.maxLiving} · active ${s.active.join(', ')}${s.statuses.length ? ` · ${s.statuses.join(', ')}` : ''}`));
  }
  e.append(make('p', `${value.samples} samples at the next decision boundary; pending replacements may remain. These are sampled outcomes, not guaranteed predictions.`, 'muted'));
  const log = make('details'); log.append(make('summary', 'One sampled continuation'));
  readableLog(value.sampleLog).forEach(l => log.append(make('p', l.text))); e.append(log); return e;
}
async function action(task, message) {
  if (busy) return;
  const token = generation; setBusy(true); notify(message);
  try { await task(token); }
  catch (error) { if (token === generation) { automatic = false; notify(error.message, true); } }
  finally { if (token === generation) setBusy(false); }
}
async function loadPosition(position, description = '') {
  automatic = false; clearTimeout(timer);
  await action(async token => { const next = await api('load', { position }); if (token !== generation) return; renderState(next, true); $('description').textContent = description; $('decisions').textContent = ''; notify('Position loaded. Choose actions or ask the engine to analyze.'); }, 'Validating teams and reconstructing position…');
}
async function engineTurn(token) {
  const next = await api('engine-turn', { search: settings() }); if (token !== generation) return;
  renderState(next);
  const rows = [];
  next.decisions.forEach((decision, i) => {
    rows.push(`Decision ${i + 1}: ${['p1', 'p2'].map(side => { const r = decision.reports[side]; return `${side.toUpperCase()} ${r?.candidates[0]?.label ?? 'wait'}${r ? ` (${r.completedDepth} turn depth, ${r.metrics.nodes} transitions, ${(r.metrics.elapsedMs / 1000).toFixed(2)} s${r.stopReason ? `, ${r.stopReason}` : ''})` : ''}`; }).join(' · ')}`);
  });
  $('decisions').textContent = rows.join('\n');
  const report = next.decisions[0]?.reports[$('side').value]; if (report) showAnalysis(report, true);
  if (state.view.ended) { automatic = false; notify(`Battle finished: ${state.view.winner || 'draw'}.`); }
  else notify('Engine turn complete. Both choices were applied by Showdown.');
}
async function tick() {
  if (!automatic) return;
  await action(engineTurn, 'Both engines are analyzing… Pause is available.');
  if (automatic) timer = setTimeout(tick, 700);
}
$('load').onclick = () => { const s = catalog.find(s => s.id === $('scenario').value); if (s) { if (s.search) { $('depth').value = s.search.depth; $('samples').value = s.search.samples; $('continuation').value = s.search.continuationSamples; } loadPosition(s.position, s.description); } };
$('analyze').onclick = () => action(async token => { const next = await api('analyze', { search: settings() }); if (token !== generation) return; showAnalysis(next.analysis); notify('Analysis complete. Expand a ranked action to inspect opponent responses.'); }, 'Analyzing in a background worker…');
$('advance').onclick = () => action(async token => { const next = await api('advance', { choices: { p1: $('p1-choice').value || null, p2: $('p2-choice').value || null } }); if (token !== generation) return; renderState(next); $('decisions').textContent = ''; notify(next.view.ended ? 'Battle finished.' : next.view.request === 'switch' ? 'Choose the required replacement, then advance again.' : 'Choices applied. Ready for the next turn.'); }, 'Applying choices through Showdown…');
$('reset').onclick = () => { automatic = false; clearTimeout(timer); action(async token => { const next = await api('reset', {}); if (token !== generation) return; renderState(next, true); $('decisions').textContent = ''; notify('Original position restored.'); }, 'Resetting position…'); };
$('step').onclick = () => action(engineTurn, 'Both engines are analyzing…');
$('play').onclick = () => { automatic = true; tick(); };
$('pause').onclick = async () => { if (cancelling) return; cancelling = true; automatic = false; clearTimeout(timer); generation++; setBusy(true); try { const next = await api('cancel', {}); renderState(next); notify('Paused. Any unfinished computation was discarded; the position is unchanged.'); } catch (error) { notify(error.message, true); } finally { cancelling = false; setBusy(false); } };
$('create').onclick = () => loadPosition({ format: 'gen9almostanyability', teams: { p1: $('team-p1').value, p2: $('team-p2').value }, history: [] }, $('custom-name').value);
function savedScenarios() { try { return JSON.parse(localStorage.getItem('aaa-sandbox-scenarios') || '[]'); } catch { return []; } }
function refreshCatalog() { $('scenario').replaceChildren(...catalog.map(s => { const o = make('option', s.name); o.value = s.id; return o; })); }
$('save').onclick = () => action(async () => { const position = await api('export'); const saved = savedScenarios(); const item = { id: `saved-${Date.now()}`, name: $('custom-name').value || 'My position', description: 'Saved in this browser.', position }; saved.push(item); localStorage.setItem('aaa-sandbox-scenarios', JSON.stringify(saved)); catalog.push(item); refreshCatalog(); $('scenario').value = item.id; notify('Current position saved in the scenario list.'); }, 'Saving position…');
$('export').onclick = () => action(async () => { const position = await api('export'); const url = URL.createObjectURL(new Blob([JSON.stringify(position, null, 2)], { type: 'application/json' })); const a = make('a'); a.href = url; a.download = 'aaa-position.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Position exported with its complete choice history.'); }, 'Exporting…');
$('import').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { if (file.size > 1024 * 1024) throw new Error('Choose a JSON file smaller than 1 MB.'); const input = JSON.parse(await file.text()); if (input.hypotheses) throw new Error('Import a single fully specified position. Individual existing hypotheses are available in the scenario list.'); await loadPosition(input.position ?? input, `Imported ${file.name}`); } catch (error) { notify(error.message, true); } event.target.value = ''; };
try { catalog = [...await api('scenarios'), ...savedScenarios()]; refreshCatalog(); const current = await api('state'); state = current; if (current.view) { renderState(current, true); notify('Current sandbox position restored.'); } else await loadPosition(catalog[0].position, catalog[0].description); }
catch (error) { notify(`Cannot start: ${error.message}`, true); }
