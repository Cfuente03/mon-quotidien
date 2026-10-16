// Onglet Rappels : rappels ponctuels/récurrents + notifications push
import { state, save, uid, ymd, parseYmd, pad, DAYS_SHORT, MONTHS, $, esc } from './store.js';
import { openSheet, confirmDialog, toast, localNotify } from './ui.js';

const REPEAT = { once: 'Une fois', daily: 'Tous les jours', weekdays: 'Du lundi au vendredi', custom: 'Jours choisis' };
let root;

export function initReminders(el) {
  root = el;
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); syncNtfy(); } });
  setTimeout(() => { tick(); syncNtfy(); }, 1500);
}

// ---------- Calcul des occurrences ----------
function atTime(dateStr, time) {
  const d = parseYmd(dateStr); const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0); return d;
}
function matchesDay(r, d) {
  const dow = d.getDay(); // 0 = dimanche
  if (r.repeat === 'daily') return true;
  if (r.repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (r.repeat === 'custom') return (r.days || []).includes(dow);
  return false;
}
export function occurrences(r, from, to) {
  if (!r.enabled || !r.time) return [];
  if (r.repeat === 'once') {
    const t = atTime(r.date, r.time).getTime();
    return t > from && t <= to ? [t] : [];
  }
  const out = [];
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const startDate = r.date ? parseYmd(r.date).getTime() : 0;
  for (let i = 0; i < 400 && d.getTime() <= to; i++, d.setDate(d.getDate() + 1)) {
    if (!matchesDay(r, d)) continue;
    const t = atTime(ymd(d), r.time).getTime();
    if (t > from && t <= to && t >= startDate) out.push(t);
  }
  return out;
}
export const nextOccurrence = (r) => occurrences(r, Date.now(), Date.now() + 370 * 864e5)[0];

// ---------- Déclenchement dans l'application ----------
function tick() {
  const now = Date.now();
  const last = Math.max(state.settings.lastCheck || now - 60000, now - 3600e3);
  const ntfyOn = !!state.settings.ntfyTopic;
  let changed = false;
  for (const r of state.reminders) {
    for (const t of occurrences(r, last, now)) {
      // si ntfy est configuré, la notification arrive déjà par ntfy : on évite les doublons
      if (!ntfyOn || !state.settings.ntfySent[`${r.id}@${t}`]) localNotify(r.title, r.body || 'Rappel', r.id);
      if (!document.hidden) toast(`🔔 ${r.title}`, 5000);
      if (r.repeat === 'once') { r.enabled = false; changed = true; }
    }
  }
  state.settings.lastCheck = now;
  save();
  if (changed && root?.isConnected && !root.hidden) renderReminders();
}

// ---------- Push via ntfy (fonctionne même application fermée) ----------
const ntfyUrl = () => `${(state.settings.ntfyServer || 'https://ntfy.sh').replace(/\/$/, '')}/${encodeURIComponent(state.settings.ntfyTopic)}`;

async function ntfyPost(title, message, atSec) {
  const params = new URLSearchParams({ title, tags: 'bell' });
  if (atSec) params.set('at', String(atSec));
  const res = await fetch(`${ntfyUrl()}?${params}`, { method: 'POST', body: message });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}

// Programme sur le serveur ntfy les rappels des 3 prochains jours (limite de ntfy.sh)
export async function syncNtfy() {
  const s = state.settings;
  if (!s.ntfyTopic || !navigator.onLine) return;
  const now = Date.now(), horizon = now + 71 * 3600e3;
  let n = 0;
  for (const r of state.reminders) {
    for (const t of occurrences(r, now + 60e3, horizon)) {
      const key = `${r.id}@${t}`;
      if (s.ntfySent[key]) continue;
      try { await ntfyPost(r.title, r.body || 'Rappel', Math.floor(t / 1000)); s.ntfySent[key] = 1; n++; }
      catch (e) { console.warn(e); s.ntfyError = String(e.message || e); save(); return; }
    }
  }
  for (const k of Object.keys(s.ntfySent)) if (Number(k.split('@')[1]) < now - 864e5) delete s.ntfySent[k];
  s.ntfyError = ''; s.ntfyLastSync = now;
  save();
  return n;
}

// ---------- Rappels liés aux activités du calendrier ----------
export function upsertActivityReminder(a) {
  const id = 'act_' + a.id;
  const offset = Number(a.reminder) || 0;
  const t = atTime(a.date, a.start); t.setMinutes(t.getMinutes() - offset);
  const r = state.reminders.find((x) => x.id === id) || (state.reminders.push({ id }), state.reminders.at(-1));
  const when = offset === 0 ? 'Maintenant' : offset >= 1440 ? `Demain à ${a.start}` : `Dans ${offset} min (${a.start})`;
  Object.assign(r, { title: a.title, body: when, repeat: 'once', date: ymd(t), time: `${pad(t.getHours())}:${pad(t.getMinutes())}`, enabled: t.getTime() > Date.now(), activityId: a.id });
  syncNtfy();
}
export function removeActivityReminder(activityId) {
  state.reminders = state.reminders.filter((r) => r.activityId !== activityId);
}

// ---------- Interface ----------
function permissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function fmtNext(t) {
  if (!t) return 'Aucune occurrence à venir';
  const d = new Date(t), today = ymd(), tomorrow = ymd(new Date(Date.now() + 864e5));
  const day = ymd(d) === today ? 'Aujourd\'hui' : ymd(d) === tomorrow ? 'Demain' : `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4)}.`;
  return `${day} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderReminders() {
  const perm = permissionState();
  const s = state.settings;
  const list = [...state.reminders].sort((a, b) => (nextOccurrence(a) || 9e15) - (nextOccurrence(b) || 9e15));
  root.innerHTML = `
    <h1 class="page-title">Rappels</h1>
    <section class="card status">
      <div class="row between">
        <div><b>Notifications</b><div class="small muted">${{ granted: '✅ Autorisées sur cet appareil', denied: '⛔ Bloquées — à réactiver dans les réglages du navigateur', default: 'Pas encore autorisées', unsupported: isIos && !isStandalone ? 'Sur iPhone : installez d\'abord l\'app sur l\'écran d\'accueil' : 'Non prises en charge par ce navigateur' }[perm]}</div></div>
        ${perm === 'default' ? '<button class="btn primary small" data-perm>Activer</button>' : perm === 'granted' ? '<button class="btn ghost small" data-test>Tester</button>' : ''}
      </div>
      ${isIos && !isStandalone ? '<p class="small hint">📱 iPhone : touchez <b>Partager</b> puis <b>Sur l\'écran d\'accueil</b>, et ouvrez l\'app depuis l\'icône pour recevoir des notifications.</p>' : ''}
    </section>

    <details class="card" ${s.ntfyTopic ? '' : 'open'}>
      <summary><b>📲 Push même application fermée</b> <span class="small muted">${s.ntfyTopic ? (s.ntfyError ? '⚠️ erreur' : '✅ actif') : 'à configurer'}</span></summary>
      <p class="small">Les notifications locales ne s'affichent que si l'app tourne. Pour être notifié <b>à coup sûr</b>, l'app programme vos rappels sur <b>ntfy</b> (service gratuit et open source) :</p>
      <ol class="small">
        <li>Installez l'application <b>ntfy</b> (Play Store / App Store).</li>
        <li>Générez un nom de canal ci-dessous (gardez-le secret : c'est votre « adresse »).</li>
        <li>Dans ntfy, touchez <b>＋</b> et abonnez-vous à ce même nom.</li>
      </ol>
      <form class="form" data-ntfy>
        <label>Nom du canal<div class="row gap"><input name="topic" placeholder="ex : mq-7f3k2p9x" class="grow" autocomplete="off"><button type="button" class="btn ghost small" data-gen>Générer</button></div></label>
        <label>Serveur<input name="server" placeholder="https://ntfy.sh"></label>
        <div class="row gap end"><button type="button" class="btn ghost small" data-ntfytest>Envoyer un test</button><button class="btn primary small">Enregistrer</button></div>
        ${s.ntfyError ? `<p class="small danger-text">Dernière erreur : ${esc(s.ntfyError)}</p>` : s.ntfyLastSync ? `<p class="small muted">Synchronisé : ${new Date(s.ntfyLastSync).toLocaleString('fr-FR')}. Les rappels des 3 prochains jours sont programmés ; ouvrez l'app au moins une fois tous les 3 jours pour les suivants.</p>` : ''}
      </form>
    </details>

    <section class="list">
      ${list.length ? list.map((r) => `
        <article class="item ${r.enabled ? '' : 'off'}" data-rem="${r.id}" style="--cc:var(--c-event)">
          <div class="grow">
            <div class="item-title">🔔 ${esc(r.title)}</div>
            <div class="small muted">${r.repeat === 'custom' ? (r.days || []).map((d) => DAYS_SHORT[(d + 6) % 7]).join(', ') : REPEAT[r.repeat]} · ${esc(r.time)}${r.activityId ? ' · lié au calendrier' : ''}</div>
            <div class="small">${r.enabled ? '⏭ ' + fmtNext(nextOccurrence(r)) : 'Désactivé'}</div>
          </div>
          <label class="switch" data-stop><input type="checkbox" data-en="${r.id}" ${r.enabled ? 'checked' : ''}><span></span></label>
        </article>`).join('') : '<div class="empty">Aucun rappel. Touchez <b>＋</b> pour en créer un (boire de l\'eau, prendre un médicament, séance de sport…).</div>'}
    </section>
    <button class="fab" data-add aria-label="Nouveau rappel">＋</button>`;

  const f = $('[data-ntfy]', root);
  f.elements.topic.value = s.ntfyTopic || '';
  f.elements.server.value = s.ntfyServer || 'https://ntfy.sh';
  f.onsubmit = async (e) => {
    e.preventDefault();
    const topic = f.elements.topic.value.trim();
    if (topic && !/^[\w-]{6,64}$/.test(topic)) return toast('Nom de canal : 6 à 64 caractères (lettres, chiffres, - et _)');
    s.ntfyTopic = topic; s.ntfyServer = f.elements.server.value.trim() || 'https://ntfy.sh'; s.ntfySent = {};
    save();
    const n = await syncNtfy();
    toast(topic ? `Push activé${n ? ` · ${n} rappel(s) programmé(s)` : ''}` : 'Push désactivé');
    renderReminders();
  };
  $('[data-gen]', root).onclick = () => { f.elements.topic.value = 'mq-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
  $('[data-ntfytest]', root).onclick = async () => {
    const topic = f.elements.topic.value.trim();
    if (!topic) return toast('Renseignez d\'abord un nom de canal');
    const prev = [s.ntfyTopic, s.ntfyServer];
    s.ntfyTopic = topic; s.ntfyServer = f.elements.server.value.trim() || 'https://ntfy.sh';
    try { await ntfyPost('Mon Quotidien', 'Test réussi ! Vos rappels arriveront ici. 🎉'); toast('Test envoyé — vérifiez l\'app ntfy'); }
    catch (err) { toast('Échec de l\'envoi : ' + err.message); }
    [s.ntfyTopic, s.ntfyServer] = prev;
  };

  root.onclick = async (e) => {
    if (e.target.closest('[data-stop]')) return;
    if (e.target.closest('[data-perm]')) {
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Notifications activées' : 'Notifications refusées');
      renderReminders();
    } else if (e.target.closest('[data-test]')) {
      localNotify('Mon Quotidien', 'Ceci est une notification de test 👍', 'test');
    } else if (e.target.closest('[data-add]')) editReminder();
    else if (e.target.closest('[data-rem]')) editReminder(state.reminders.find((r) => r.id === e.target.closest('[data-rem]').dataset.rem));
  };
  root.onchange = (e) => {
    const en = e.target.dataset.en;
    if (!en) return;
    const r = state.reminders.find((x) => x.id === en);
    r.enabled = e.target.checked; save(); syncNtfy(); renderReminders();
  };
}

function editReminder(r0) {
  const isNew = !r0;
  const now = new Date(Date.now() + 3600e3);
  const r = { id: uid(), title: '', body: '', repeat: 'once', date: ymd(), time: `${pad(now.getHours())}:00`, days: [1, 2, 3, 4, 5], enabled: true, ...(r0 || {}) };
  openSheet(isNew ? 'Nouveau rappel' : 'Modifier le rappel', (body, close) => {
    body.innerHTML = `
      <form class="form">
        <label>Titre<input name="title" required maxlength="60" placeholder="Ex : Boire de l'eau 💧"></label>
        <label>Message<input name="body" maxlength="140" placeholder="Optionnel"></label>
        <label>Répétition<select name="repeat">${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <div class="days" data-days>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="d${d}" ${r.days.includes(d) ? 'checked' : ''}><span>${DAYS_SHORT[(d + 6) % 7]}</span></label>`).join('')}</div>
        <div class="row gap"><label class="grow" data-date>Date<input type="date" name="date"></label><label class="grow">Heure<input type="time" name="time" required></label></div>
        <div class="row gap end">
          ${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>Supprimer</button>'}
          <button class="btn primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>`;
    const f = body.querySelector('form');
    ['title', 'body', 'repeat', 'date', 'time'].forEach((k) => (f.elements[k].value = r[k] || ''));
    const sync = () => {
      $('[data-days]', body).classList.toggle('hidden', f.elements.repeat.value !== 'custom');
      $('[data-date]', body).classList.toggle('hidden', f.elements.repeat.value !== 'once');
    };
    f.elements.repeat.onchange = sync; sync();
    f.onsubmit = (e) => {
      e.preventDefault();
      Object.assign(r, {
        title: f.elements.title.value.trim(), body: f.elements.body.value.trim(), repeat: f.elements.repeat.value,
        date: f.elements.repeat.value === 'once' ? f.elements.date.value : ymd(), time: f.elements.time.value, enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6].filter((d) => f.elements['d' + d].checked),
      });
      if (r.repeat === 'once' && atTime(r.date, r.time) < Date.now()) return toast('Cette date est déjà passée');
      if (r.repeat === 'custom' && !r.days.length) return toast('Choisissez au moins un jour');
      if (isNew) state.reminders.push(r); else Object.assign(state.reminders.find((x) => x.id === r.id), r);
      save(); syncNtfy(); close(); renderReminders();
      toast('Rappel enregistré');
      if (permissionState() === 'default') Notification.requestPermission().then(() => renderReminders());
    };
    $('[data-del]', body)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Supprimer ce rappel ?', 'Supprimer'))) return;
      state.reminders = state.reminders.filter((x) => x.id !== r.id);
      const act = r.activityId && state.activities.find((a) => a.id === r.activityId);
      if (act) act.reminder = '';
      save(); close(); renderReminders();
    });
  });
}
