// Onglet Accueil : calendrier + activités de la journée
import { state, save, uid, ymd, parseYmd, hm, MONTHS, DAYS_SHORT, fmtDateLong, $, $$, esc } from './store.js';
import { openSheet, confirmDialog, toast } from './ui.js';
import { upsertActivityReminder, removeActivityReminder } from './reminders.js';

export const CATS = {
  sport: { label: 'Sport', icon: '🏋️', color: 'var(--c-sport)' },
  food: { label: 'Nourriture', icon: '🥗', color: 'var(--c-food)' },
  event: { label: 'Événement', icon: '🎉', color: 'var(--c-event)' },
  work: { label: 'Travail', icon: '💼', color: 'var(--c-work)' },
  other: { label: 'Autre', icon: '📌', color: 'var(--c-other)' },
};

let cursor = new Date(); cursor.setDate(1);
let selected = ymd();
let root;
let hooks = {};

export function initCalendar(el, h) { root = el; hooks = h; }

const byDay = () => {
  const m = {};
  for (const a of state.activities) (m[a.date] ||= []).push(a);
  return m;
};
const sortActs = (list) => list.sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));

export function renderCalendar() {
  const today = ymd();
  const days = byDay();
  const todayActs = sortActs([...(days[today] || [])]);
  const doneCount = todayActs.filter((a) => a.done).length;
  const now = hm();
  const next = todayActs.find((a) => !a.done && (a.start || '') >= now);
  const h = new Date().getHours();
  const hello = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';

  root.innerHTML = `
    <section class="hero card">
      <div>
        <p class="muted small">${esc(fmtDateLong(new Date()))}</p>
        <h1>${hello} 👋</h1>
        <p>${todayActs.length ? `${doneCount}/${todayActs.length} activité${todayActs.length > 1 ? 's' : ''} terminée${doneCount > 1 ? 's' : ''}` : 'Rien de prévu aujourd\'hui.'}</p>
        ${next ? `<p class="small">Prochain : <b>${esc(next.start)}</b> · ${CATS[next.cat].icon} ${esc(next.title)}</p>` : ''}
      </div>
      <div class="ring" style="--p:${todayActs.length ? Math.round((doneCount / todayActs.length) * 100) : 0}"><span>${todayActs.length ? Math.round((doneCount / todayActs.length) * 100) : 0}%</span></div>
    </section>

    <section class="quick-add">
      ${Object.entries(CATS).map(([k, c]) => `<button class="chip-btn" data-quick="${k}" style="--cc:${c.color}"><span>${c.icon}</span>${c.label}</button>`).join('')}
    </section>

    <section class="card cal">
      <header class="cal-head">
        <button class="icon-btn" data-nav="-1" aria-label="Mois précédent">‹</button>
        <h2>${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}</h2>
        <button class="icon-btn" data-nav="1" aria-label="Mois suivant">›</button>
      </header>
      <div class="cal-grid">
        ${DAYS_SHORT.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${monthCells(days, today)}
      </div>
      <div class="row between mt-s"><button class="btn ghost small" data-today>Aujourd'hui</button>
        <div class="legend">${Object.entries(CATS).map(([, c]) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div></div>
    </section>

    <section class="day-list">
      <div class="row between"><h2>${selected === today ? 'Aujourd\'hui' : esc(fmtDateLong(parseYmd(selected)))}</h2>${foodSummary(days[selected])}</div>
      <div class="list">${dayItems(sortActs([...(days[selected] || [])]))}</div>
    </section>
    <button class="fab" data-add aria-label="Ajouter une activité">＋</button>`;

  root.onclick = (e) => {
    const t = e.target.closest('[data-nav],[data-day],[data-today],[data-add],[data-quick],[data-act],[data-toggle],[data-workout]');
    if (!t) return;
    if (t.dataset.nav) { cursor.setMonth(cursor.getMonth() + Number(t.dataset.nav)); renderCalendar(); }
    else if (t.dataset.day) { selected = t.dataset.day; renderCalendar(); }
    else if (t.hasAttribute('data-today')) { cursor = new Date(); cursor.setDate(1); selected = ymd(); renderCalendar(); }
    else if (t.hasAttribute('data-add')) editActivity({ date: selected });
    else if (t.dataset.quick) editActivity({ date: selected, cat: t.dataset.quick });
    else if (t.dataset.toggle) {
      e.stopPropagation();
      const a = state.activities.find((x) => x.id === t.dataset.toggle);
      a.done = !a.done; save(); renderCalendar();
    }
    else if (t.dataset.workout) hooks.showWorkout?.(t.dataset.workout);
    else if (t.dataset.act) editActivity(state.activities.find((x) => x.id === t.dataset.act));
  };
}

function monthCells(days, today) {
  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(first); start.setDate(1 - offset);
  const inMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + inMonth) / 7) * 7;
  let html = '';
  for (let i = 0; i < cells; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d);
    const acts = days[key] || [];
    const cats = [...new Set(acts.map((a) => a.cat))].slice(0, 4);
    const cls = ['cal-day', d.getMonth() !== cursor.getMonth() && 'out', key === today && 'today', key === selected && 'sel'].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-day="${key}"><span>${d.getDate()}</span><div class="dots">${cats.map((c) => `<i style="background:${CATS[c].color}"></i>`).join('')}</div></button>`;
  }
  return html;
}

function foodSummary(list = []) {
  const kcal = list.filter((a) => a.cat === 'food').reduce((s, a) => s + (Number(a.kcal) || 0), 0);
  return kcal ? `<span class="pill" style="--cc:var(--c-food)">🔥 ${kcal} kcal</span>` : '';
}

function dayItems(list) {
  if (!list.length) return `<div class="empty">Aucune activité. Touchez <b>＋</b> pour en ajouter une.</div>`;
  return list.map((a) => {
    const c = CATS[a.cat] || CATS.other;
    return `<article class="item ${a.done ? 'done' : ''}" data-act="${a.id}" style="--cc:${c.color}">
      <button class="check ${a.done ? 'on' : ''}" data-toggle="${a.id}" aria-label="Terminé">${a.done ? '✓' : ''}</button>
      <div class="grow">
        <div class="item-title">${c.icon} ${esc(a.title)}</div>
        <div class="muted small">${a.start ? esc(a.start) + (a.end ? ' – ' + esc(a.end) : '') : 'Toute la journée'}${a.kcal ? ` · ${esc(a.kcal)} kcal` : ''}${a.reminder != null && a.reminder !== '' ? ' · 🔔' : ''}</div>
        ${a.notes ? `<div class="small notes">${esc(a.notes)}</div>` : ''}
      </div>
      ${a.workoutId ? `<button class="btn small ghost" data-workout="${a.workoutId}">Bilan</button>` : ''}
    </article>`;
  }).join('');
}

export function editActivity(a = {}) {
  const isNew = !a.id;
  const act = { id: a.id || uid(), title: '', cat: 'other', date: ymd(), start: '', end: '', notes: '', kcal: '', done: false, reminder: '', ...a };
  openSheet(isNew ? 'Nouvelle activité' : 'Modifier l\'activité', (body, close) => {
    body.innerHTML = `
      <form class="form">
        <div class="seg">${Object.entries(CATS).map(([k, c]) => `<label style="--cc:${c.color}"><input type="radio" name="cat" value="${k}" ${act.cat === k ? 'checked' : ''}><span>${c.icon} ${c.label}</span></label>`).join('')}</div>
        <label>Titre<input name="title" required maxlength="80" placeholder="Ex : Déjeuner, Réunion, Footing…"></label>
        <label>Date<input type="date" name="date" required></label>
        <div class="row gap"><label class="grow">Début<input type="time" name="start"></label><label class="grow">Fin<input type="time" name="end"></label></div>
        <label class="food-only">Calories (kcal)<input type="number" inputmode="numeric" name="kcal" min="0" max="10000"></label>
        <label>Rappel
          <select name="reminder">
            <option value="">Aucun</option><option value="0">À l'heure de début</option><option value="5">5 min avant</option>
            <option value="15">15 min avant</option><option value="30">30 min avant</option><option value="60">1 h avant</option><option value="1440">La veille</option>
          </select></label>
        <label>Notes<textarea name="notes" rows="3" maxlength="500"></textarea></label>
        <div class="row gap end">
          ${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>Supprimer</button>'}
          <button class="btn primary">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
        </div>
      </form>`;
    const f = body.querySelector('form');
    for (const k of ['title', 'date', 'start', 'end', 'kcal', 'notes', 'reminder']) f.elements[k].value = act[k] ?? '';
    const syncFood = () => body.querySelector('.food-only').classList.toggle('hidden', f.elements.cat.value !== 'food');
    f.addEventListener('change', syncFood); syncFood();
    f.onsubmit = (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      Object.assign(act, fd, { title: fd.title.trim() });
      if (act.reminder !== '' && !act.start) { toast('Ajoutez une heure de début pour le rappel'); return; }
      if (isNew) state.activities.push(act);
      else Object.assign(state.activities.find((x) => x.id === act.id), act);
      if (act.reminder !== '') upsertActivityReminder(act); else removeActivityReminder(act.id);
      save();
      selected = act.date; const d = parseYmd(act.date); cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      close(); renderCalendar(); toast(isNew ? 'Activité ajoutée' : 'Activité mise à jour');
    };
    body.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Supprimer cette activité ?', 'Supprimer'))) return;
      state.activities = state.activities.filter((x) => x.id !== act.id);
      removeActivityReminder(act.id); save(); close(); renderCalendar();
    });
    if (isNew) setTimeout(() => f.elements.title.focus(), 300);
  });
}

// Ajoute (ou met à jour) l'activité "Sport" correspondant à une séance terminée
export function logWorkoutActivity(w, title) {
  const d = new Date(w.start);
  const existing = state.activities.find((a) => a.workoutId === w.id);
  const act = existing || { id: uid(), cat: 'sport', workoutId: w.id, reminder: '' };
  Object.assign(act, { title, date: ymd(d), start: hm(d), end: hm(new Date(w.end)), done: true, notes: act.notes || '' });
  if (!existing) state.activities.push(act);
}
