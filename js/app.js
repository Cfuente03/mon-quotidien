// Point d'entrée : verrouillage, navigation (barre du bas + menu déroulant), réglages, installation PWA
import { state, save, replaceState, ymd, $, $$, esc } from './store.js';
import { openSheet, toast, confirmDialog } from './ui.js';
import { ensureUnlocked, lockNow, lockInfo, setPeriod, changePassword, hashPassword } from './lock.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { initSport, renderSport, showSummary } from './sport.js';
import { initReminders, renderReminders } from './reminders.js';
import { renderNutrition } from './nutrition.js';
import { renderMap } from './map.js';
import { renderJobs } from './jobs.js';
import { renderSubs } from './subs.js';
import { renderPermissions } from './permissions.js';

const NAV = [
  { group: 'Ma journée', items: [['home', '📅', 'Accueil'], ['reminders', '🔔', 'Rappels']] },
  { group: 'Santé', items: [['sport', '🏋️', 'Sport'], ['nutrition', '🥗', 'Nutrition']] },
  { group: 'Outils', items: [['map', '🗺', 'Carte'], ['jobs', '💼', 'Emploi'], ['subs', '💳', 'Abonnements']] },
  { group: 'Paramètres', items: [['perms', '🔐', 'Autorisations'], ['settings', '⚙️', 'Réglages']] },
];
const BOTTOM = ['home', 'sport', 'nutrition', 'map'];
const ITEMS = Object.fromEntries(NAV.flatMap((g) => g.items.map(([k, i, l]) => [k, { icon: i, label: l, group: g.group }])));
const view = (k) => $(`[data-view="${k}"]`);
const views = {
  home: renderCalendar, sport: renderSport, reminders: renderReminders,
  nutrition: () => renderNutrition(view('nutrition')), map: () => renderMap(view('map')),
  jobs: () => renderJobs(view('jobs')), subs: () => renderSubs(view('subs')), perms: () => renderPermissions(view('perms')),
};
let current = 'home';

function show(name) {
  if (name === 'settings') { closeMenu(); return settings(); }
  if (!views[name]) name = 'home';
  current = name;
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
  $$('.bottom-nav [data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
  $('.bottom-nav [data-menu]').classList.toggle('on', !BOTTOM.includes(name));
  $('[data-title]').textContent = ITEMS[name].label;
  document.body.dataset.page = name;
  closeMenu();
  views[name]();
  window.scrollTo(0, 0);
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

// ---------- Menu déroulant ----------
function buildMenu() {
  $('[data-drawer]').innerHTML = `
    <div class="drawer-head"><img src="icons/icon-192.png" alt=""><b>Mon Quotidien</b><button class="icon-btn" data-close-menu aria-label="Fermer">✕</button></div>
    ${NAV.map((g) => `<details class="drawer-group" open><summary>${g.group}<span>▾</span></summary>
      ${g.items.map(([k, i, l]) => `<button class="drawer-item" data-go="${k}"><span>${i}</span>${l}</button>`).join('')}</details>`).join('')}
    <button class="drawer-item lock-item" data-lock><span>🔒</span>Verrouiller maintenant</button>`;
}
const openMenu = () => { $$('.drawer-item').forEach((b) => b.classList.toggle('on', b.dataset.go === current)); document.body.classList.add('menu-open'); };
const closeMenu = () => document.body.classList.remove('menu-open');

async function boot() {
  await ensureUnlocked();
  document.body.classList.remove('locked');
  buildMenu();
  initCalendar(view('home'), { showWorkout: (id) => showSummary(id) });
  initReminders(view('reminders'));
  const sportReady = initSport(view('sport')); // définit la vue Sport tout de suite, charge la base en arrière-plan
  document.addEventListener('click', (e) => {
    const go = e.target.closest('.bottom-nav [data-go], [data-drawer] [data-go]');
    if (go) return show(go.dataset.go);
    if (e.target.closest('[data-menu]')) return document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
    if (e.target.closest('[data-close-menu]') || e.target.matches('[data-backdrop]')) return closeMenu();
    if (e.target.closest('[data-lock]')) return lockNow();
    if (e.target.closest('[data-settings]')) return settings();
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h !== current) show(h); });
  show(location.hash.slice(1) || 'home');
  try { await sportReady; } catch (e) { console.error(e); toast('Impossible de charger la base d\'exercices'); }
  if (current === 'sport') renderSport();
  const badge = () => $('.bottom-nav [data-go="sport"]').classList.toggle('live', !!state.activeWorkout);
  badge(); setInterval(badge, 5000);
  let day = ymd();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ymd() !== day) { day = ymd(); if (current === 'home') renderCalendar(); } });
}

// ---------- Installation ----------
let installPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function settings() {
  openSheet('Réglages', (body, close) => {
    const s = state.settings, li = lockInfo();
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    body.innerHTML = `
      <h3>🔒 Mot de passe</h3>
      <form class="form" data-lockf>
        <label>Demander le mot de passe<select name="period" ${li.fromConfig ? 'disabled' : ''}><option value="month">Une fois par mois</option><option value="day">Une fois par jour</option><option value="always">À chaque ouverture</option></select></label>
        ${li.fromConfig ? '<p class="small muted">Mot de passe et fréquence définis dans <code>js/config.js</code>.</p>' : `
        <div class="row gap"><input type="password" name="pw" placeholder="Nouveau mot de passe" minlength="4" autocomplete="new-password" class="grow"><button class="btn ghost small" data-chpw>Changer</button></div>
        <details><summary class="small"><b>Même mot de passe sur tous mes appareils</b></summary>
          <p class="small">Tapez votre mot de passe ci-dessus puis touchez <b>Générer</b>. Copiez le code obtenu dans <code>js/config.js</code> (champ <code>hash</code>) sur GitHub. Seule l'empreinte chiffrée est publiée, jamais le mot de passe.</p>
          <button class="btn ghost small" data-gen>Générer le code pour config.js</button><textarea readonly rows="3" data-hash class="mt-s hidden"></textarea></details>`}
        <button type="button" class="btn ghost small" data-lock>🔒 Verrouiller maintenant</button>
      </form>
      <h3>🏋️ Sport</h3>
      <form class="form" data-sportf>
        <label>Temps de repos par défaut (secondes)<input type="number" name="rest" min="10" max="600" step="5"></label>
        <label class="row between"><span>Son à la fin du repos</span><span class="switch"><input type="checkbox" name="sound"><span></span></span></label>
      </form>
      <h3>🤖 Reconnaissance photo (IA)</h3>
      <form class="form" data-aif>
        <label>Clé API Anthropic<input type="password" name="key" placeholder="sk-ant-…" autocomplete="off"></label>
        <label>Modèle<select name="model"><option value="claude-opus-5-5">Claude Opus 5.5 (le plus précis)</option><option value="claude-sonnet-5-5">Claude Sonnet 5.5 (moins cher)</option><option value="claude-haiku-5-5">Claude Haiku 5.5 (le moins cher)</option></select></label>
        <p class="small muted">La clé reste sur ce téléphone et n'est jamais incluse dans les sauvegardes exportées.</p>
      </form>
      <h3>📲 Installer sur le téléphone</h3>
      ${standalone ? '<p class="small">✅ L\'application est installée.</p>' : `
        ${installPrompt ? '<button class="btn primary block" data-install>📲 Installer l\'application</button>' : ''}
        <p class="small"><b>iPhone (Safari)</b> : bouton <b>Partager</b> ⬆️ → <b>Sur l'écran d'accueil</b>.<br><b>Android (Chrome)</b> : menu ⋮ → <b>Installer l'application</b>.</p>`}
      <h3>💾 Mes données</h3>
      <p class="small muted">Tout est stocké sur cet appareil uniquement. Pensez à faire des sauvegardes.</p>
      <div class="row gap"><button class="btn ghost grow" data-export>⬇️ Exporter</button><label class="btn ghost grow file-btn">⬆️ Importer<input type="file" accept="application/json" data-import hidden></label></div>
      <button class="btn danger ghost block mt" data-reset>Tout effacer</button>
      <p class="small muted center mt">Mon Quotidien · v2.0 · Exercices : free-exercise-db · Aliments : Open Food Facts · Cartes : © OpenStreetMap</p>`;

    const lf = $('[data-lockf]', body);
    lf.elements.period.value = li.period;
    lf.elements.period.onchange = (e) => { setPeriod(e.target.value); toast('Fréquence enregistrée'); };
    $('[data-chpw]', body)?.addEventListener('click', async (e) => {
      e.preventDefault(); const pw = lf.elements.pw.value;
      if (pw.length < 4) return toast('4 caractères minimum');
      await changePassword(pw); lf.elements.pw.value = ''; toast('Mot de passe changé');
    });
    $('[data-gen]', body)?.addEventListener('click', async (e) => {
      e.preventDefault(); const pw = lf.elements.pw.value;
      if (pw.length < 4) return toast('Tapez d\'abord le mot de passe (4 caractères min.)');
      const ta = $('[data-hash]', body); ta.value = await hashPassword(pw); ta.classList.remove('hidden'); ta.select();
      try { await navigator.clipboard.writeText(ta.value); toast('Code copié'); } catch {}
    });

    const sf = $('[data-sportf]', body);
    sf.elements.rest.value = s.restDefault; sf.elements.sound.checked = s.sound;
    sf.onchange = () => { s.restDefault = Math.max(10, Number(sf.elements.rest.value) || 90); s.sound = sf.elements.sound.checked; save(); };
    const af = $('[data-aif]', body);
    af.elements.key.value = s.anthropicKey || ''; af.elements.model.value = s.aiModel || 'claude-opus-5-5';
    af.onchange = () => { s.anthropicKey = af.elements.key.value.trim(); s.aiModel = af.elements.model.value; save(); toast('Réglages IA enregistrés'); };

    $('[data-install]', body)?.addEventListener('click', async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; close(); });
    $('[data-export]', body).onclick = () => {
      const data = JSON.parse(JSON.stringify(state)); delete data.settings.anthropicKey;
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mon-quotidien-${ymd()}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('[data-import]', body).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.activities) || !Array.isArray(data.workouts)) throw new Error('format');
        if (!(await confirmDialog('Remplacer toutes les données actuelles par la sauvegarde ?', 'Importer'))) return;
        data.settings = { ...data.settings, anthropicKey: state.settings.anthropicKey };
        replaceState(data); toast('Sauvegarde importée'); close(); location.reload();
      } catch { toast('Fichier invalide'); }
    };
    $('[data-reset]', body).onclick = async () => {
      if (!(await confirmDialog('Effacer définitivement toutes vos données (et le mot de passe) ?', 'Tout effacer'))) return;
      localStorage.clear(); location.reload();
    };
  });
}

// ---------- Service worker (hors-ligne + notifications) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.go) show(e.data.go); });
}

boot();
