// Onglet Sport : bibliothèque d'exercices, séance en cours, chronos, bilan, progression
import { state, save, uid, fmtDur, fmtDateLong, ymd, $, $$, esc } from './store.js';
import { openSheet, confirmDialog, toast, beep, vibrate, localNotify, unlockAudio } from './ui.js';
import { loadExercises, searchExercises, getEx, addCustomExercise, MUSCLES_FR, EQUIP_FR, CAT_FR, isCardio } from './exercises.js';
import { lineChart } from './chart.js';
import { renderSkillsSection } from './skills.js';
import { logWorkoutActivity } from './calendar.js';

let root, tab = 'session', ticker, restTimeout, bodyView;
const W = () => state.activeWorkout;

const STARTER_TEMPLATES = [
  { name: 'Push · Pecs / Épaules / Triceps', items: ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise', 'Triceps_Pushdown_-_Rope_Attachment'] },
  { name: 'Pull · Dos / Biceps', items: ['Pullups', 'Bent_Over_Barbell_Row', 'Seated_Cable_Rows', 'Face_Pull', 'Hammer_Curls'] },
  { name: 'Legs · Jambes', items: ['Barbell_Squat', 'Romanian_Deadlift', 'Leg_Press', 'Lying_Leg_Curls', 'Standing_Calf_Raises'] },
  { name: 'Full body débutant', items: ['Goblet_Squat', 'Pushups', 'One-Arm_Dumbbell_Row', 'Dumbbell_Shoulder_Press', 'Plank'] },
];

export async function initSport(el) {
  root = el;
  if (!state.settings.seeded) {
    state.templates.push(...STARTER_TEMPLATES.map((t) => ({ id: uid(), name: t.name, items: t.items.map((exId) => ({ exId, sets: 3 })) })));
    state.settings.seeded = true; save();
  }
  await loadExercises();
  if (W()) startTicker();
}

// ======================= Statistiques =======================
const e1rm = (w, r) => (r > 0 && w > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0); // formule d'Epley
const doneSets = (x) => x.sets.filter((s) => s.done && (Number(s.r) > 0));

function exStats(x) {
  const sets = doneSets(x);
  const ws = sets.map((s) => Number(s.w) || 0), rs = sets.map((s) => Number(s.r) || 0);
  return {
    sets: sets.length,
    reps: rs.reduce((a, b) => a + b, 0),
    maxW: Math.max(0, ...ws),
    maxR: Math.max(0, ...rs),
    best1rm: Math.max(0, ...sets.map((s) => e1rm(Number(s.w), Number(s.r)))),
    volume: isCardio(getEx(x.exId)) ? 0 : sets.reduce((a, s) => a + (Number(s.w) || 0) * (Number(s.r) || 0), 0),
  };
}

// Historique d'un exercice (séances terminées), du plus ancien au plus récent
function exHistory(exId, before = Infinity) {
  const out = [];
  for (const w of state.workouts) {
    if (w.start >= before) continue;
    const x = w.exercises.find((e) => e.exId === exId);
    if (x && doneSets(x).length) out.push({ w, x, s: exStats(x) });
  }
  return out.sort((a, b) => a.w.start - b.w.start);
}
const lastPerf = (exId, before) => exHistory(exId, before).at(-1);

// Intensité de travail par muscle (0..1) : séries principales = 1, secondaires = 0,5
export function muscleLoad(workouts) {
  const load = {};
  for (const w of workouts) for (const x of w.exercises) {
    const n = doneSets(x).length; if (!n) continue;
    const ex = getEx(x.exId);
    ex.primaryMuscles.forEach((m) => (load[m] = (load[m] || 0) + n));
    (ex.secondaryMuscles || []).forEach((m) => (load[m] = (load[m] || 0) + n * 0.5));
  }
  const max = Math.max(1, ...Object.values(load));
  const ref = Math.max(max, 6); // 6 séries ≈ zone bien travaillée
  return Object.fromEntries(Object.entries(load).map(([m, v]) => [m, Math.min(1, v / ref)]));
}

function analyse(w) {
  const rows = w.exercises.map((x) => {
    const ex = getEx(x.exId), s = exStats(x);
    if (!s.sets) return null;
    const hist = exHistory(x.exId, w.start);
    const prev = hist.at(-1)?.s;
    const allPrev = {
      maxW: Math.max(0, ...hist.map((h) => h.s.maxW)), best1rm: Math.max(0, ...hist.map((h) => h.s.best1rm)),
      volume: Math.max(0, ...hist.map((h) => h.s.volume)), maxR: Math.max(0, ...hist.map((h) => h.s.maxR)),
    };
    const prs = [];
    if (hist.length) {
      if (s.maxW > allPrev.maxW && s.maxW > 0) prs.push(`Charge max : ${s.maxW} kg`);
      if (s.best1rm > allPrev.best1rm + 0.01 && s.maxW > 0) prs.push(`1RM estimé : ${s.best1rm.toFixed(1)} kg`);
      if (s.volume > allPrev.volume && s.volume > 0) prs.push(`Volume : ${Math.round(s.volume)} kg`);
      if (!s.maxW && s.maxR > allPrev.maxR) prs.push(`Répétitions : ${s.maxR}`);
    }
    let trend = 'new', delta = 0;
    if (prev) {
      const metric = (st) => (st.best1rm || st.maxR || st.reps);
      const a = metric(prev), b = metric(s);
      delta = a ? ((b - a) / a) * 100 : 0;
      trend = delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat';
    }
    return { ex, x, s, prs, trend, delta, prev };
  }).filter(Boolean);
  const totals = rows.reduce((t, r) => ({ sets: t.sets + r.s.sets, reps: t.reps + r.s.reps, volume: t.volume + r.s.volume }), { sets: 0, reps: 0, volume: 0 });
  return { rows, totals };
}

// ======================= Rendu principal =======================
export function renderSport() {
  bodyView?.dispose(); bodyView = null;
  if (W()) return renderWorkout();
  root.innerHTML = `
    <h1 class="page-title">Sport</h1>
    <nav class="tabs">${[['session', 'Séance'], ['history', 'Historique'], ['progress', 'Progrès']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <div data-pane></div>`;
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderSport(); }));
  const pane = $('[data-pane]', root);
  root.onclick = null; root.oninput = null;
  ({ session: renderStart, history: renderHistory, progress: renderProgress })[tab](pane);
}

function renderStart(pane) {
  const last = [...state.workouts].sort((a, b) => b.start - a.start)[0];
  pane.innerHTML = `
    <button class="btn primary big block" data-empty>▶︎ Démarrer une séance libre</button>
    ${last ? `<p class="small muted center mt-s">Dernière séance : ${esc(last.name)} · ${esc(fmtDateLong(new Date(last.start)))}</p>` : ''}
    <div class="row between mt"><h2>Mes programmes</h2><button class="btn ghost small" data-newtpl>＋ Créer</button></div>
    <div class="list">${state.templates.map((t) => `
      <article class="item tpl" style="--cc:var(--c-sport)">
        <div class="grow" data-edittpl="${t.id}">
          <div class="item-title">${esc(t.name)}</div>
          <div class="small muted">${t.items.map((i) => esc(getEx(i.exId).label)).join(' · ')}</div>
        </div>
        <button class="btn primary small" data-start="${t.id}">Go</button>
      </article>`).join('') || '<div class="empty">Aucun programme.</div>'}
    </div>
    <button class="btn ghost block mt" data-library>📚 Parcourir les ${searchExercises().length} exercices</button>`;
  pane.onclick = (e) => {
    const t = e.target.closest('[data-empty],[data-start],[data-newtpl],[data-edittpl],[data-library]');
    if (!t) return;
    if (t.hasAttribute('data-empty')) startWorkout();
    else if (t.dataset.start) startWorkout(state.templates.find((x) => x.id === t.dataset.start));
    else if (t.hasAttribute('data-newtpl')) editTemplate();
    else if (t.dataset.edittpl) editTemplate(state.templates.find((x) => x.id === t.dataset.edittpl));
    else if (t.hasAttribute('data-library')) pickExercises({ browse: true });
  };
}

// ======================= Séance en cours =======================
function newSets(exId, n) {
  const prev = lastPerf(exId);
  const count = n || prev?.x.sets.filter((s) => s.done).length || 3;
  return Array.from({ length: count }, () => ({ w: '', r: '', done: false }));
}

function startWorkout(tpl) {
  unlockAudio();
  state.activeWorkout = {
    id: uid(), name: tpl?.name || `Séance du ${new Date().toLocaleDateString('fr-FR')}`, start: Date.now(),
    exercises: (tpl?.items || []).map((i) => ({ exId: i.exId, rest: state.settings.restDefault, sets: newSets(i.exId, i.sets) })),
    rest: null, stopwatch: null,
  };
  save(); startTicker(); renderSport();
  if (!tpl) pickExercises();
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(updateTimers, 250);
  if (W()?.rest) scheduleRestEnd();
}

function updateTimers() {
  const w = W();
  if (!w) return clearInterval(ticker);
  const now = Date.now();
  const total = $('[data-total]', root); if (total) total.textContent = fmtDur(now - w.start);
  const rest = $('[data-rest]', root);
  if (rest) {
    if (w.rest) {
      const left = w.rest.end - now;
      rest.textContent = left > 0 ? fmtDur(left) : '00:00';
      $('.timerbar', root).classList.toggle('resting', left > 0);
      $('.rest-progress', root)?.style.setProperty('--p', Math.max(0, Math.min(1, left / (w.rest.dur * 1000))));
      if (left <= 0) restDone();
    } else { rest.textContent = '—'; $('.timerbar', root)?.classList.remove('resting'); }
  }
  const sw = $('[data-sw]', root);
  if (sw) sw.textContent = w.stopwatch ? fmtDur(now - w.stopwatch) : '00:00';
}

function startRest(sec) {
  const w = W();
  w.rest = { end: Date.now() + sec * 1000, dur: sec };
  save(); scheduleRestEnd(); updateTimers();
}
function scheduleRestEnd() {
  clearTimeout(restTimeout);
  const w = W(); if (!w?.rest) return;
  restTimeout = setTimeout(() => updateTimers(), Math.max(0, w.rest.end - Date.now()) + 50);
}
function restDone() {
  const w = W(); if (!w?.rest) return;
  w.rest = null; save();
  if (state.settings.sound) beep(3);
  vibrate([300, 120, 300, 120, 300]);
  if (document.hidden) localNotify('⏱ Repos terminé', 'C\'est reparti pour la série suivante 💪', 'rest');
  else toast('⏱ Repos terminé — série suivante !');
  updateTimers();
}

function renderWorkout() {
  const w = W();
  root.innerHTML = `
    <div class="timerbar">
      <div class="tb-cell"><small>Séance</small><b data-total>00:00</b></div>
      <div class="tb-cell rest"><small>Repos</small><b data-rest>—</b>
        <div class="rest-ctrl"><button data-rest-adj="-15">−15</button><button data-rest-adj="15">+15</button><button data-rest-skip>⏭</button></div>
        <div class="rest-progress"></div></div>
      <div class="tb-cell"><small>Chrono série</small><b data-sw>00:00</b><button class="sw-btn" data-sw-toggle>${w.stopwatch ? '■ Stop' : '▶︎ Start'}</button></div>
    </div>
    <input class="title-input" data-wname maxlength="60" aria-label="Nom de la séance">
    <div data-exlist>${w.exercises.map((x, i) => exerciseCard(x, i)).join('') || '<div class="empty">Ajoutez votre premier exercice 👇</div>'}</div>
    <button class="btn ghost block" data-addex>＋ Ajouter un exercice</button>
    <div class="row gap mt">
      <button class="btn danger ghost grow" data-cancel>Abandonner</button>
      <button class="btn primary grow" data-finish>✓ Terminer la séance</button>
    </div>`;
  $('[data-wname]', root).value = w.name;
  $('[data-wname]', root).oninput = (e) => { w.name = e.target.value; save(); };
  updateTimers();

  root.oninput = (e) => {
    const el = e.target.closest('[data-f]');
    if (!el) return;
    const [i, j] = el.dataset.idx.split(',').map(Number);
    w.exercises[i].sets[j][el.dataset.f] = el.value.replace(',', '.');
    save();
  };
  root.onclick = async (e) => {
    const t = e.target.closest('button,[data-info]');
    if (!t) return;
    unlockAudio();
    const d = t.dataset;
    if (d.check) {
      const [i, j] = d.check.split(',').map(Number);
      const x = w.exercises[i], s = x.sets[j];
      if (!s.done) {
        // valeurs vides → reprend les valeurs indiquées (précédentes)
        const row = t.closest('.set-row');
        for (const f of ['w', 'r']) if (s[f] === '' || s[f] == null) s[f] = $(`[data-f="${f}"]`, row).placeholder.replace(/[^\d.]/g, '') || '';
        if (!(Number(s.r) > 0)) return toast('Indiquez le nombre de répétitions');
        s.done = true;
        if (!isCardio(getEx(x.exId))) startRest(x.rest || state.settings.restDefault);
      } else s.done = false;
      if (w.stopwatch) w.stopwatch = null;
      save(); rerenderCard(i);
    } else if (d.addset) {
      const x = w.exercises[d.addset], last = x.sets.at(-1);
      x.sets.push({ w: last?.w ?? '', r: last?.r ?? '', done: false }); save(); rerenderCard(Number(d.addset));
    } else if (d.delset) {
      const x = w.exercises[d.delset];
      if (x.sets.length > 1) { x.sets.pop(); save(); rerenderCard(Number(d.delset)); }
    } else if (d.restAdj) {
      if (w.rest) { w.rest.end += Number(d.restAdj) * 1000; w.rest.dur = Math.max(1, w.rest.dur + Number(d.restAdj)); save(); scheduleRestEnd(); updateTimers(); }
      else startRest(Math.max(15, Number(d.restAdj) > 0 ? state.settings.restDefault : 60));
    } else if (d.restSkip !== undefined) { w.rest = null; save(); clearTimeout(restTimeout); updateTimers(); }
    else if (d.swToggle !== undefined) {
      if (w.stopwatch) { toast(`⏱ Série : ${fmtDur(Date.now() - w.stopwatch)}`); w.stopwatch = null; } else w.stopwatch = Date.now();
      save(); t.textContent = w.stopwatch ? '■ Stop' : '▶︎ Start'; updateTimers();
    } else if (d.restset) {
      const x = w.exercises[d.restset];
      const v = prompt('Temps de repos pour cet exercice (secondes)', x.rest || state.settings.restDefault);
      if (v && Number(v) > 0) { x.rest = Math.round(Number(v)); save(); rerenderCard(Number(d.restset)); }
    } else if (d.exmenu) exerciseMenu(Number(d.exmenu));
    else if (d.info) showExercise(d.info);
    else if (d.addex !== undefined) pickExercises();
    else if (d.cancel !== undefined) {
      if (await confirmDialog('Abandonner la séance ? Les séries saisies seront perdues.', 'Abandonner')) {
        state.activeWorkout = null; save(); clearInterval(ticker); renderSport();
      }
    } else if (d.finish !== undefined) finishWorkout();
  };
}

function rerenderCard(i) {
  const card = $(`[data-card="${i}"]`, root);
  if (card) card.outerHTML = exerciseCard(W().exercises[i], i);
}

function exImg(ex, cls = '') {
  if (!ex.images?.length) return `<div class="ex-img ph ${cls}">${(ex.label || '?')[0]}</div>`;
  return `<div class="ex-img ${cls}"><img src="${ex.images[0]}" loading="lazy" alt="">${ex.images[1] ? `<img class="alt" src="${ex.images[1]}" loading="lazy" alt="">` : ''}</div>`;
}

function exerciseCard(x, i) {
  const ex = getEx(x.exId);
  const prev = lastPerf(x.exId, W().start);
  const cardio = isCardio(ex);
  const prevDone = prev ? prev.x.sets.filter((s) => s.done) : [];
  const [lw, lr] = cardio ? ['km', 'min'] : ['kg', 'reps'];
  return `<section class="card ex-card" data-card="${i}">
    <header class="row gap">
      <button class="plain" data-info="${ex.id}">${exImg(ex)}</button>
      <div class="grow">
        <div class="item-title">${esc(ex.label)}</div>
        <div class="small muted">${ex.primaryMuscles.map((m) => MUSCLES_FR[m] || m).join(', ')}${ex.equipment ? ' · ' + (EQUIP_FR[ex.equipment] || ex.equipment) : ''}</div>
        <div class="row gap">${cardio ? '' : `<button class="link small" data-restset="${i}">⏱ Repos ${x.rest || state.settings.restDefault}s</button>`}
          <a class="link small" href="https://www.youtube.com/results?search_query=${encodeURIComponent((ex.nameFr || ex.name) + (ex.nameFr ? ' exercice technique' : ' exercise form'))}" target="_blank" rel="noopener">▶️ Vidéo</a></div>
      </div>
      <button class="icon-btn" data-exmenu="${i}" aria-label="Options">⋯</button>
    </header>
    <div class="sets">
      <div class="set-row head"><span>Série</span><span>Précédent</span><span>${lw}</span><span>${lr}</span><span>✓</span></div>
      ${x.sets.map((s, j) => {
        const p = prevDone[j] || prevDone.at(-1);
        return `<div class="set-row ${s.done ? 'done' : ''}">
          <span class="num">${j + 1}</span>
          <span class="prev small muted">${p ? `${p.w || 0}${cardio ? 'km' : 'kg'} × ${p.r}` : '—'}</span>
          <input data-f="w" data-idx="${i},${j}" inputmode="decimal" value="${esc(s.w)}" placeholder="${p ? esc(p.w || '') : ''}" aria-label="${lw}">
          <input data-f="r" data-idx="${i},${j}" inputmode="numeric" value="${esc(s.r)}" placeholder="${p ? esc(p.r || '') : ''}" aria-label="${lr}">
          <button class="check ${s.done ? 'on' : ''}" data-check="${i},${j}" aria-label="Valider la série">${s.done ? '✓' : ''}</button>
        </div>`;
      }).join('')}
    </div>
    <div class="row gap"><button class="btn ghost small grow" data-delset="${i}">− Série</button><button class="btn ghost small grow" data-addset="${i}">＋ Série</button></div>
  </section>`;
}

function exerciseMenu(i) {
  const w = W(), x = w.exercises[i];
  openSheet(getEx(x.exId).label, (body, close) => {
    body.innerHTML = `<div class="menu">
      <button data-a="info">ℹ️ Fiche & progression</button>
      ${i > 0 ? '<button data-a="up">⬆️ Monter</button>' : ''}
      ${i < w.exercises.length - 1 ? '<button data-a="down">⬇️ Descendre</button>' : ''}
      <button data-a="replace">🔁 Remplacer</button>
      <button data-a="del" class="danger-text">🗑 Retirer de la séance</button></div>`;
    body.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      close();
      if (a === 'info') return showExercise(x.exId);
      if (a === 'up' || a === 'down') { const k = a === 'up' ? i - 1 : i + 1; [w.exercises[i], w.exercises[k]] = [w.exercises[k], w.exercises[i]]; }
      if (a === 'del') w.exercises.splice(i, 1);
      if (a === 'replace') return pickExercises({ single: true, onPick: ([id]) => { x.exId = id; x.sets = newSets(id, x.sets.length); save(); renderWorkout(); } });
      save(); renderWorkout();
    };
  });
}

async function finishWorkout() {
  const w = W();
  // les séries remplies mais non cochées sont comptées ; les séries vides sont ignorées
  w.exercises.forEach((x) => { x.sets.forEach((s) => { if (Number(s.r) > 0) s.done = true; }); x.sets = x.sets.filter((s) => s.done); });
  w.exercises = w.exercises.filter((x) => x.sets.length);
  if (!w.exercises.length) {
    if (await confirmDialog('Aucune série réalisée. Abandonner la séance ?', 'Abandonner')) { state.activeWorkout = null; save(); renderSport(); }
    else renderWorkout();
    return;
  }
  w.end = Date.now();
  delete w.rest; delete w.stopwatch;
  state.workouts.push(w);
  state.activeWorkout = null;
  logWorkoutActivity(w, `${w.name}`);
  save(); clearInterval(ticker); clearTimeout(restTimeout);
  tab = 'history'; renderSport();
  showSummary(w.id, true);
}

// ======================= Bilan =======================
export function showSummary(id, fresh = false) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return toast('Séance introuvable');
  const { rows, totals } = analyse(w);
  const load = muscleLoad([w]);
  const prCount = rows.reduce((n, r) => n + r.prs.length, 0);
  let body3d;
  openSheet(fresh ? 'Bravo ! 🎉 Bilan de séance' : w.name, (body, close) => {
    body.innerHTML = `
      ${fresh ? `<h3 class="center">${esc(w.name)}</h3>` : ''}
      <p class="center small muted">${esc(fmtDateLong(new Date(w.start)))} · ${new Date(w.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
      <div class="stats">
        <div><b>${fmtDur(w.end - w.start)}</b><small>Durée</small></div>
        <div><b>${Math.round(totals.volume).toLocaleString('fr-FR')}</b><small>kg soulevés</small></div>
        <div><b>${totals.sets}</b><small>Séries</small></div>
        <div><b>${prCount}</b><small>Records 🏆</small></div>
      </div>
      <div data-body></div>
      <p class="center small muted">Glissez pour tourner · touchez un muscle</p>
      ${muscleBars(load)}
      <h3>Exercices</h3>
      <div class="list">${rows.map((r) => `
        <article class="item res ${r.trend}" data-info="${r.ex.id}">
          ${exImg(r.ex, 'sm')}
          <div class="grow">
            <div class="item-title">${esc(r.ex.label)}</div>
            <div class="small muted">${r.s.sets} série${r.s.sets > 1 ? 's' : ''} · ${r.x.sets.map((s) => `${s.w || 0}×${s.r}`).join(', ')}</div>
            ${r.prs.map((p) => `<div class="pr">🏆 Record ! ${esc(p)}</div>`).join('')}
          </div>
          <div class="trend">${{ up: `▲ ${r.delta.toFixed(0)}%`, down: `▼ ${Math.abs(r.delta).toFixed(0)}%`, flat: '＝', new: 'Nouveau' }[r.trend]}</div>
        </article>`).join('')}</div>
      <p class="small muted">▲ progression / ▼ régression : comparaison du 1RM estimé (ou des répétitions) avec la séance précédente du même exercice.</p>
      <div class="row gap mt">
        <button class="btn ghost grow" data-tpl>💾 Enregistrer comme programme</button>
        ${fresh ? '<button class="btn primary grow" data-close>Fermer</button>' : '<button class="btn danger ghost" data-del>Supprimer</button>'}
      </div>`;
    setTimeout(() => { body3d = mountBody3d($('[data-body]', body), load); }, 60);
    body.onclick = async (e) => {
      if (e.target.closest('[data-info]')) return showExercise(e.target.closest('[data-info]').dataset.info);
      if (e.target.closest('[data-tpl]')) {
        state.templates.push({ id: uid(), name: w.name, items: w.exercises.map((x) => ({ exId: x.exId, sets: x.sets.length })) });
        save(); toast('Programme enregistré');
      }
      if (e.target.closest('[data-del]') && await confirmDialog('Supprimer définitivement cette séance ?', 'Supprimer')) {
        state.workouts = state.workouts.filter((x) => x.id !== w.id);
        state.activities = state.activities.filter((a) => a.workoutId !== w.id);
        save(); close(); renderSport();
      }
    };
  }, { full: true, onClose: () => body3d?.then((b) => b?.dispose()) });
}

// Visionneuse : mannequin 3D ou carte anatomique 2D, vue de face ou de dos
async function mountBody3d(el, load) {
  if (!el) return null;
  let mode = localStorage.getItem('mq-viewer') || '3d', side = 'front', view3d;
  el.innerHTML = `<div class="viewer-bar"><div class="seg2" data-m><button data-v="3d">3D</button><button data-v="map">Carte</button></div>
    <div class="seg2" data-s><button data-v="front" class="on">Face</button><button data-v="back">Dos</button></div></div><div data-stage></div>`;
  const stage = $('[data-stage]', el);
  const draw = async () => {
    view3d?.dispose(); view3d = null;
    $$('[data-m] button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    $('[data-s]', el).style.visibility = mode === '3d' ? 'visible' : 'hidden';
    if (mode === 'map') { const { renderBodyMap } = await import('./bodymap.js'); return renderBodyMap(stage, load); }
    stage.className = 'body3d';
    try { const { mountBody } = await import('./body3d.js'); view3d = await mountBody(stage, load); if (side === 'back') view3d.setSide('back'); }
    catch (e) { console.error(e); mode = 'map'; draw(); }
  };
  el.onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    if (b.parentElement.matches('[data-m]')) { mode = b.dataset.v; try { localStorage.setItem('mq-viewer', mode); } catch {} stage.className = ''; draw(); }
    else { side = b.dataset.v; $$('[data-s] button', el).forEach((x) => x.classList.toggle('on', x === b)); view3d?.setSide(side); }
  };
  await draw();
  return { dispose: () => view3d?.dispose() };
}

// Liens vers des vidéos de démonstration
export function videoLinks(ex) {
  const q = encodeURIComponent(ex.nameFr ? `${ex.nameFr} exercice technique` : `${ex.name} exercise form`);
  return `<div class="vid-links"><a class="btn ghost small" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">▶️ YouTube</a>
    <a class="btn ghost small" href="https://www.google.com/search?tbm=vid&q=${q}" target="_blank" rel="noopener">🔎 Vidéos Google</a></div>`;
}

function muscleBars(load) {
  const entries = Object.entries(load).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  return `<div class="bars">${entries.map(([m, v]) => `<div class="bar"><span>${MUSCLES_FR[m] || m}</span><i style="--v:${v}"></i><b>${Math.round(v * 100)}%</b></div>`).join('')}</div>`;
}

// ======================= Historique =======================
function renderHistory(pane) {
  const list = [...state.workouts].sort((a, b) => b.start - a.start);
  if (!list.length) { pane.innerHTML = '<div class="empty">Aucune séance terminée pour l\'instant.</div>'; return; }
  let month = '';
  pane.innerHTML = `<div class="list">${list.map((w) => {
    const d = new Date(w.start);
    const m = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const head = m !== month ? `<h3 class="month">${(month = m)}</h3>` : '';
    const { totals } = analyse(w);
    return `${head}<article class="item" data-sum="${w.id}" style="--cc:var(--c-sport)">
      <div class="date-box"><b>${d.getDate()}</b><small>${d.toLocaleDateString('fr-FR', { weekday: 'short' })}</small></div>
      <div class="grow"><div class="item-title">${esc(w.name)}</div>
        <div class="small muted">${fmtDur(w.end - w.start)} · ${w.exercises.length} exercice${w.exercises.length > 1 ? 's' : ''} · ${Math.round(totals.volume).toLocaleString('fr-FR')} kg</div></div>
      <span class="muted">›</span></article>`;
  }).join('')}</div>`;
  pane.onclick = (e) => { const t = e.target.closest('[data-sum]'); if (t) showSummary(t.dataset.sum); };
}

// ======================= Progrès =======================
function renderProgress(pane) {
  const now = Date.now(), week = state.workouts.filter((w) => w.start > now - 7 * 864e5);
  const prevWeek = state.workouts.filter((w) => w.start > now - 14 * 864e5 && w.start <= now - 7 * 864e5);
  const vol = (ws) => ws.reduce((t, w) => t + analyse(w).totals.volume, 0);
  const v1 = vol(week), v0 = vol(prevWeek);
  const ids = [...new Set(state.workouts.flatMap((w) => w.exercises.map((x) => x.exId)))];
  const records = ids.map((id) => {
    const h = exHistory(id);
    return { id, ex: getEx(id), n: h.length, maxW: Math.max(0, ...h.map((r) => r.s.maxW)), e1: Math.max(0, ...h.map((r) => r.s.best1rm)), maxR: Math.max(0, ...h.map((r) => r.s.maxR)) };
  }).filter((r) => r.n).sort((a, b) => b.n - a.n);
  const streak = (() => { let s = 0; const d = new Date(); const days = new Set(state.workouts.map((w) => ymd(new Date(w.start)))); if (!days.has(ymd(d))) d.setDate(d.getDate() - 1); while (days.has(ymd(d))) { s++; d.setDate(d.getDate() - 1); } return s; })();

  pane.innerHTML = `
    <div class="stats">
      <div><b>${week.length}</b><small>Séances (7 j)</small></div>
      <div><b>${Math.round(v1).toLocaleString('fr-FR')}</b><small>kg (7 j)${v0 ? ` <span class="${v1 >= v0 ? 'up' : 'down'}">${v1 >= v0 ? '▲' : '▼'}${Math.abs(Math.round(((v1 - v0) / v0) * 100))}%</span>` : ''}</small></div>
      <div><b>${state.workouts.length}</b><small>Total séances</small></div>
      <div><b>${streak}</b><small>Jours d'affilée</small></div>
    </div>
    <h3>Muscles travaillés — 7 derniers jours</h3>
    <div data-body></div>
    ${muscleBars(muscleLoad(week)) || '<div class="empty small">Aucune séance cette semaine.</div>'}
    ${renderSkillsSection()}
    <h3>Mes records</h3>
    <div class="list">${records.map((r) => `
      <article class="item" data-info="${r.id}">
        ${exImg(r.ex, 'sm')}
        <div class="grow"><div class="item-title">${esc(r.ex.label)}</div>
          <div class="small muted">${r.maxW ? `Max ${r.maxW} kg · 1RM est. ${r.e1.toFixed(1)} kg` : `Max ${r.maxR} reps`} · ${r.n} séance${r.n > 1 ? 's' : ''}</div></div>
        <span class="muted">›</span></article>`).join('') || '<div class="empty small">Vos records apparaîtront après vos premières séances.</div>'}</div>`;
  const el = $('[data-body]', pane);
  const p = mountBody3d(el, muscleLoad(week));
  p.then((b) => (bodyView = b));
  pane.onclick = (e) => { const t = e.target.closest('[data-info]'); if (t) showExercise(t.dataset.info); };
}

// ======================= Fiche exercice =======================
function showExercise(id) {
  const ex = getEx(id);
  const hist = exHistory(id);
  const cardio = isCardio(ex);
  const useW = hist.some((h) => h.s.maxW > 0) && !cardio;
  openSheet(ex.label, (body) => {
    body.innerHTML = `
      ${ex.images?.length ? `<div class="ex-hero">${ex.images.map((src) => `<img src="${src}" alt="" loading="lazy">`).join('')}</div>` : ''}
      ${ex.nameFr ? `<p class="small muted">${esc(ex.name)}</p>` : ''}
      ${videoLinks(ex)}
      <div class="tags">${ex.primaryMuscles.map((m) => `<span class="pill strong">${MUSCLES_FR[m] || m}</span>`).join('')}${(ex.secondaryMuscles || []).map((m) => `<span class="pill">${MUSCLES_FR[m] || m}</span>`).join('')}
        ${ex.equipment ? `<span class="pill">${EQUIP_FR[ex.equipment] || ex.equipment}</span>` : ''}${ex.level ? `<span class="pill">${{ beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Expert' }[ex.level]}</span>` : ''}
        ${ex.category ? `<span class="pill">${CAT_FR[ex.category] || ex.category}</span>` : ''}</div>
      <div class="row between mt"><h3>Ma progression</h3><button class="icon-btn" data-fav>${state.favorites.includes(id) ? '★' : '☆'}</button></div>
      ${hist.length ? lineChart(hist.map((h) => ({ x: h.w.start, y: useW ? Math.round(h.s.best1rm * 10) / 10 : h.s.maxR })), { unit: useW ? 'kg (1RM est.)' : 'reps' }) : '<div class="empty small">Pas encore réalisé.</div>'}
      ${hist.length ? `<p class="small muted">${useW ? '1RM estimé (formule d\'Epley)' : 'Répétitions max par série'} · ${hist.length} séance${hist.length > 1 ? 's' : ''}</p>
        <div class="list compact">${hist.slice(-5).reverse().map((h) => `<div class="small"><b>${new Date(h.w.start).toLocaleDateString('fr-FR')}</b> — ${h.x.sets.filter((s) => s.done).map((s) => `${s.w || 0}×${s.r}`).join(', ')}</div>`).join('')}</div>` : ''}
      ${ex.instructions?.length ? `<details class="mt"><summary><b>Instructions</b> <span class="small muted">(en anglais)</span></summary><ol class="small">${ex.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}`;
    $('[data-fav]', body).onclick = (e) => {
      const i = state.favorites.indexOf(id);
      i >= 0 ? state.favorites.splice(i, 1) : state.favorites.push(id);
      save(); e.target.textContent = i >= 0 ? '☆' : '★';
    };
  }, { full: true });
}

// ======================= Sélection d'exercices =======================
function pickExercises({ browse = false, single = false, onPick } = {}) {
  const picked = [];
  const f = { q: '', muscle: '', equipment: '', onlyFav: false };
  openSheet(browse ? 'Bibliothèque d\'exercices' : 'Ajouter des exercices', (body, close) => {
    body.innerHTML = `
      <div class="picker-tools">
        <input type="search" placeholder="🔍 Rechercher (ex : squat, pectoraux…)" data-q>
        <div class="chips">${['', ...Object.keys(MUSCLES_FR)].map((m) => `<button class="chip ${m === '' ? 'on' : ''}" data-m="${m}">${m ? MUSCLES_FR[m] : 'Tous'}</button>`).join('')}</div>
        <div class="row gap"><select data-eq class="grow"><option value="">Tout équipement</option>${Object.entries(EQUIP_FR).filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button class="chip" data-favf>★ Favoris</button></div>
      </div>
      <div class="list ex-list" data-list></div>
      <button class="btn ghost block small mt" data-custom>＋ Créer un exercice personnalisé</button>
      ${browse ? '' : '<div class="picker-foot"><button class="btn primary block" data-done disabled>Ajouter</button></div>'}`;
    const listEl = $('[data-list]', body);
    let limit = 60;
    const draw = () => {
      const res = searchExercises(f);
      listEl.innerHTML = res.slice(0, limit).map((ex) => `
        <article class="item ex-row ${picked.includes(ex.id) ? 'picked' : ''}" data-ex="${ex.id}">
          ${exImg(ex, 'sm')}
          <div class="grow"><div class="item-title">${state.favorites.includes(ex.id) ? '★ ' : ''}${esc(ex.label)}</div>
            <div class="small muted">${ex.primaryMuscles.map((m) => MUSCLES_FR[m] || m).join(', ')} · ${EQUIP_FR[ex.equipment] || 'Aucun'}</div></div>
          <button class="icon-btn" data-info="${ex.id}" aria-label="Fiche">ℹ︎</button>
          ${browse ? '' : `<span class="check ${picked.includes(ex.id) ? 'on' : ''}">${picked.includes(ex.id) ? picked.indexOf(ex.id) + 1 : ''}</span>`}
        </article>`).join('') + (res.length > limit ? `<button class="btn ghost block small" data-more>Afficher plus (${res.length - limit})</button>` : '') + (res.length ? '' : '<div class="empty">Aucun résultat</div>');
      const done = $('[data-done]', body);
      if (done) { done.disabled = !picked.length; done.textContent = picked.length ? `Ajouter (${picked.length})` : 'Ajouter'; }
    };
    draw();
    $('[data-q]', body).oninput = (e) => { f.q = e.target.value; limit = 60; draw(); };
    $('[data-eq]', body).onchange = (e) => { f.equipment = e.target.value; draw(); };
    body.onclick = (e) => {
      const t = e.target.closest('[data-m],[data-favf],[data-info],[data-ex],[data-more],[data-done],[data-custom]');
      if (!t) return;
      if (t.dataset.m !== undefined) { f.muscle = t.dataset.m; $$('[data-m]', body).forEach((b) => b.classList.toggle('on', b === t)); draw(); }
      else if (t.hasAttribute('data-favf')) { f.onlyFav = !f.onlyFav; t.classList.toggle('on', f.onlyFav); draw(); }
      else if (t.dataset.info) showExercise(t.dataset.info);
      else if (t.hasAttribute('data-more')) { limit += 60; draw(); }
      else if (t.hasAttribute('data-custom')) customExercise((ex) => { f.q = ex.label; $('[data-q]', body).value = ex.label; draw(); });
      else if (t.dataset.ex) {
        if (browse) return showExercise(t.dataset.ex);
        const id = t.dataset.ex, k = picked.indexOf(id);
        k >= 0 ? picked.splice(k, 1) : picked.push(id);
        if (single) { close(); return onPick(picked); }
        draw();
      } else if (t.hasAttribute('data-done')) {
        close();
        if (onPick) return onPick(picked);
        const w = W();
        picked.forEach((id) => w.exercises.push({ exId: id, rest: state.settings.restDefault, sets: newSets(id) }));
        save(); renderWorkout();
        setTimeout(() => $$('.ex-card', root).at(-picked.length)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    };
  }, { full: true });
}

function customExercise(cb) {
  openSheet('Exercice personnalisé', (body, close) => {
    body.innerHTML = `<form class="form">
      <label>Nom<input name="name" required maxlength="60"></label>
      <label>Muscle principal<select name="muscle">${Object.entries(MUSCLES_FR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Équipement<select name="equipment">${Object.entries(EQUIP_FR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <button class="btn primary block">Créer</button></form>`;
    $('form', body).onsubmit = (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const ex = addCustomExercise({ name: fd.name.trim(), muscle: fd.muscle, equipment: fd.equipment });
      close(); toast('Exercice créé'); cb(ex);
    };
  });
}

// ======================= Programmes =======================
function editTemplate(t0) {
  const t = t0 ? { ...t0, items: t0.items.map((i) => ({ ...i })) } : { id: uid(), name: '', items: [] };
  openSheet(t0 ? 'Modifier le programme' : 'Nouveau programme', (body, close) => {
    const draw = () => {
      body.innerHTML = `<form class="form">
        <label>Nom<input name="name" required maxlength="60" placeholder="Ex : Haut du corps"></label>
        <div class="list compact">${t.items.map((it, i) => `<div class="row gap tpl-row"><span class="grow">${esc(getEx(it.exId).label)}</span>
          <input type="number" min="1" max="20" value="${it.sets}" data-sets="${i}" aria-label="Séries"><small>séries</small><button type="button" class="icon-btn" data-rm="${i}">✕</button></div>`).join('') || '<div class="empty small">Aucun exercice</div>'}</div>
        <button type="button" class="btn ghost block" data-add>＋ Ajouter des exercices</button>
        <div class="row gap end">${t0 ? '<button type="button" class="btn danger ghost" data-del>Supprimer</button>' : ''}<button class="btn primary">Enregistrer</button></div></form>`;
      const f = $('form', body);
      f.elements.name.value = t.name;
      f.elements.name.oninput = (e) => (t.name = e.target.value);
      f.oninput = (e) => { if (e.target.dataset.sets) t.items[e.target.dataset.sets].sets = Math.max(1, Number(e.target.value) || 1); };
      f.onclick = async (e) => {
        if (e.target.dataset.rm) { t.items.splice(e.target.dataset.rm, 1); draw(); }
        else if (e.target.closest('[data-add]')) pickExercises({ onPick: (ids) => { ids.forEach((exId) => t.items.push({ exId, sets: 3 })); draw(); } });
        else if (e.target.closest('[data-del]') && await confirmDialog('Supprimer ce programme ?', 'Supprimer')) {
          state.templates = state.templates.filter((x) => x.id !== t.id); save(); close(); renderSport();
        }
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        if (!t.items.length) return toast('Ajoutez au moins un exercice');
        t.name = t.name.trim();
        const i = state.templates.findIndex((x) => x.id === t.id);
        i >= 0 ? (state.templates[i] = t) : state.templates.push(t);
        save(); close(); renderSport(); toast('Programme enregistré');
      };
    };
    draw();
  });
}
