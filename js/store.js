// Stockage local (localStorage) — toutes les données restent sur l'appareil
const KEY = 'mon-quotidien-v1';

const defaults = () => ({
  activities: [],
  workouts: [],
  activeWorkout: null,
  templates: [],
  customExercises: [],
  favorites: [],
  reminders: [],
  nutrition: { days: {}, goals: { kcal: 2200, p: 140, c: 250, f: 70, water: 8 }, recents: [], weights: [] },
  places: [],
  jobsState: { fav: [], hidden: [], lastVisit: 0 },
  subs: [],
  emails: [],
  settings: { restDefault: 90, ntfyServer: 'https://ntfy.sh', ntfyTopic: '', ntfySent: {}, sound: true },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      const d = defaults();
      return { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) }, nutrition: { ...d.nutrition, ...(raw.nutrition || {}) }, jobsState: { ...d.jobsState, ...(raw.jobsState || {}) } };
    }
  } catch (e) { console.warn(e); }
  return defaults();
}

export const state = load();
const listeners = new Set();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error(e); }
  listeners.forEach((fn) => fn());
}
export const onSave = (fn) => listeners.add(fn);

export function replaceState(data) {
  const d = defaults();
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, d, data, { settings: { ...d.settings, ...(data.settings || {}) } });
  save();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Dates ----------
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const fmtDateLong = (d) => `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtDur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
};

// ---------- Petits utilitaires DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
