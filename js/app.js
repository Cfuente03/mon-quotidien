// Point d'entrée : navigation entre onglets, réglages, installation PWA
import { state, save, replaceState, ymd, $, $$ } from './store.js';
import { openSheet, toast, confirmDialog } from './ui.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { initSport, renderSport, showSummary } from './sport.js';
import { initReminders, renderReminders } from './reminders.js';

const views = { home: renderCalendar, sport: renderSport, reminders: renderReminders };
let current = 'home';

function show(name) {
  if (!views[name]) name = 'home';
  current = name;
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
  $$('.bottom-nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
  views[name]();
  window.scrollTo(0, 0);
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

async function boot() {
  initCalendar($('[data-view="home"]'), { showWorkout: (id) => showSummary(id) });
  initReminders($('[data-view="reminders"]'));
  $$('.bottom-nav button').forEach((b) => (b.onclick = () => show(b.dataset.go)));
  $('[data-settings]').onclick = settings;
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'home');
  try { await initSport($('[data-view="sport"]')); } catch (e) { console.error(e); toast('Impossible de charger la base d\'exercices'); }
  if (current === 'sport') renderSport();
  updateSportBadge();
  setInterval(updateSportBadge, 5000);
  // Rafraîchit l'accueil à minuit / au retour sur l'app
  let day = ymd();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ymd() !== day) { day = ymd(); if (current === 'home') renderCalendar(); } });
}

function updateSportBadge() {
  $('.bottom-nav [data-go="sport"]').classList.toggle('live', !!state.activeWorkout);
}

// ---------- Installation ----------
let installPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function settings() {
  openSheet('Réglages', (body, close) => {
    const s = state.settings;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    body.innerHTML = `
      <form class="form">
        <label>Temps de repos par défaut (secondes)<input type="number" name="rest" min="10" max="600" step="5"></label>
        <label class="row between"><span>Son à la fin du repos</span><span class="switch"><input type="checkbox" name="sound"><span></span></span></label>
      </form>
      <h3>Installer sur le téléphone</h3>
      ${standalone ? '<p class="small">✅ L\'application est installée.</p>' : `
        ${installPrompt ? '<button class="btn primary block" data-install>📲 Installer l\'application</button>' : ''}
        <p class="small"><b>iPhone (Safari)</b> : bouton <b>Partager</b> ⬆️ → <b>Sur l'écran d'accueil</b>.<br><b>Android (Chrome)</b> : menu ⋮ → <b>Installer l'application</b>.</p>`}
      <h3>Mes données</h3>
      <p class="small muted">Tout est stocké sur cet appareil uniquement. Pensez à faire des sauvegardes.</p>
      <div class="row gap"><button class="btn ghost grow" data-export>⬇️ Exporter</button><label class="btn ghost grow file-btn">⬆️ Importer<input type="file" accept="application/json" data-import hidden></label></div>
      <button class="btn danger ghost block mt" data-reset>Tout effacer</button>
      <p class="small muted center mt">Mon Quotidien · v1.0 · Exercices : free-exercise-db (domaine public)</p>`;
    const f = $('form', body);
    f.elements.rest.value = s.restDefault;
    f.elements.sound.checked = s.sound;
    f.onchange = () => { s.restDefault = Math.max(10, Number(f.elements.rest.value) || 90); s.sound = f.elements.sound.checked; save(); };
    $('[data-install]', body)?.addEventListener('click', async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; close(); });
    $('[data-export]', body).onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mon-quotidien-${ymd()}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('[data-import]', body).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.activities) || !Array.isArray(data.workouts)) throw new Error('format');
        if (!(await confirmDialog('Remplacer toutes les données actuelles par la sauvegarde ?', 'Importer'))) return;
        replaceState(data); toast('Sauvegarde importée'); close(); location.reload();
      } catch { toast('Fichier invalide'); }
    };
    $('[data-reset]', body).onclick = async () => {
      if (!(await confirmDialog('Effacer définitivement toutes vos données ?', 'Tout effacer'))) return;
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
