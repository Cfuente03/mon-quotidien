// Onglet Emploi : offres récentes trouvées par le robot GitHub (jobs/check-jobs.mjs)
import { state, save, $, esc } from './store.js';
import { toast, timeAgo, openSheet } from './ui.js';

let root, data, filter = { q: '', contract: '', fav: false };
const J = () => state.jobsState;

export async function renderJobs(el) {
  root = el;
  root.innerHTML = '<h1 class="page-title">Emploi</h1><div class="empty">Chargement…</div>';
  try { data = await (await fetch(`./data/jobs.json?t=${Date.now()}`, { cache: 'no-store' })).json(); }
  catch { data = { jobs: [] }; }
  draw();
}

function draw() {
  const jobs = data.jobs || [];
  const lastVisit = J().lastVisit || 0;
  const contracts = [...new Set(jobs.map((j) => j.contract).filter(Boolean))];
  const q = filter.q.toLowerCase();
  const list = jobs.filter((j) => !J().hidden.includes(j.id)
    && (!filter.fav || J().fav.includes(j.id))
    && (!filter.contract || j.contract === filter.contract)
    && (!q || `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)));
  const kw = (data.keywords || []).join(' ');
  root.innerHTML = `
    <h1 class="page-title">Emploi</h1>
    <section class="card small">
      ${data.updated ? `🤖 Dernière recherche : <b>${timeAgo(data.updated)}</b> · ${jobs.length} offre${jobs.length > 1 ? 's' : ''} suivie${jobs.length > 1 ? 's' : ''}` : '🤖 Le robot de recherche n\'a pas encore tourné. Activez-le sur GitHub (voir README, section « Alertes emploi »).'}
      ${data.companies?.length ? `<div class="muted mt-s">Entreprises : ${esc(data.companies.join(', '))}</div>` : ''}
      <button class="btn ${data.updated ? 'ghost' : 'primary'} small mt-s" data-setup>⚙️ ${data.updated ? 'Réglages des alertes' : 'Activer les alertes (guide)'}</button>
    </section>
    <div class="picker-tools">
      <input type="search" placeholder="🔍 Filtrer (intitulé, ville, entreprise)" data-q value="${esc(filter.q)}">
      <div class="chips"><button class="chip ${!filter.contract && !filter.fav ? 'on' : ''}" data-c="">Toutes</button><button class="chip ${filter.fav ? 'on' : ''}" data-fav-only>★ Favoris</button>
        ${contracts.map((c) => `<button class="chip ${filter.contract === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div class="list">${list.map((j) => {
      const isNew = new Date(j.posted || data.updated).getTime() > lastVisit && lastVisit;
      return `<article class="item job" style="--cc:var(--c-work)">
        <div class="grow">
          <div class="item-title">${isNew ? '<span class="badge-new">NOUVEAU</span> ' : ''}${esc(j.title)}</div>
          <div class="small"><b>${esc(j.company)}</b>${j.contract ? ` · <span class="pill" style="--cc:var(--c-work)">${esc(j.contract)}</span>` : ''}</div>
          <div class="small muted">📍 ${esc(j.location || '—')} · ${j.posted ? 'publiée ' + timeAgo(j.posted) : 'date inconnue'} · ${esc(j.source)}</div>
          <div class="row gap mt-s"><a class="btn primary small" href="${esc(j.url)}" target="_blank" rel="noopener">Voir l'offre</a>
            <button class="btn ghost small" data-star="${esc(j.id)}">${J().fav.includes(j.id) ? '★' : '☆'}</button>
            <button class="btn ghost small" data-hide="${esc(j.id)}">Masquer</button></div>
        </div></article>`;
    }).join('') || '<div class="empty">Aucune offre pour l\'instant.</div>'}</div>

    <h3>Chercher ailleurs</h3>
    <div class="list compact">
      <a class="item link-item" href="https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw || 'aéronautique')}&location=France&f_TPR=r86400" target="_blank" rel="noopener"><b>in</b><span class="grow">LinkedIn : offres des dernières 24 h</span>›</a>
      <a class="item link-item" href="https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(kw || 'aéronautique')}" target="_blank" rel="noopener"><b>🌴</b><span class="grow">Welcome to the Jungle</span>›</a>
      <a class="item link-item" href="https://candidat.francetravail.fr/offres/recherche?motsCles=${encodeURIComponent(kw || 'aéronautique')}" target="_blank" rel="noopener"><b>🇫🇷</b><span class="grow">France Travail</span>›</a>
      ${(data.careerPages || []).map((c) => `<a class="item link-item" href="${esc(c.url)}" target="_blank" rel="noopener"><b>🏢</b><span class="grow">${esc(c.company)} — site carrières</span>›</a>`).join('')}
    </div>
    <p class="small muted mt">LinkedIn ne permet pas aux applications tierces de lire vos offres ou alertes. Activez plutôt les <b>alertes emploi LinkedIn</b> dans leur app (Emplois → Alertes) : elles arrivent aussi en notification.</p>`;
  J().lastVisit = Date.now(); save();

  $('[data-q]', root).oninput = (e) => { filter.q = e.target.value; const pos = e.target.selectionStart; draw(); const i = $('[data-q]', root); i.focus(); i.setSelectionRange(pos, pos); };
  root.onclick = (e) => {
    if (e.target.closest('[data-setup]')) return setupGuide();
    const t = e.target.closest('[data-c],[data-fav-only],[data-star],[data-hide]');
    if (!t) return;
    const d = t.dataset;
    if (d.c !== undefined) { filter.contract = d.c; filter.fav = false; }
    else if (d.favOnly !== undefined) { filter.fav = !filter.fav; filter.contract = ''; }
    else if (d.star) { const i = J().fav.indexOf(d.star); i >= 0 ? J().fav.splice(i, 1) : J().fav.push(d.star); save(); }
    else if (d.hide) { J().hidden.push(d.hide); save(); toast('Offre masquée'); }
    draw();
  };
}

// Guide pas à pas : clés France Travail + secrets GitHub
function setupGuide() {
  const gh = location.hostname.endsWith('github.io') ? `https://github.com/${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}` : 'https://github.com';
  const topic = state.settings.ntfyTopic;
  openSheet('Activer les alertes emploi', (body) => {
    body.innerHTML = `
      <h3>A. Clés France Travail (gratuit)</h3>
      <p class="small muted">⚠️ Ce n'est pas votre espace candidat : c'est le site <b>développeurs</b>.</p>
      <ol class="steps-guide">
        <li>Ouvrez <a href="https://francetravail.io" target="_blank" rel="noopener"><b>francetravail.io</b></a> → <b>Se connecter / Créer un compte</b>.</li>
        <li><b>Mon espace</b> → <b>Créer une application</b>. Nom : <i>Mon Quotidien</i>.</li>
        <li>Dans l'application, ajoutez l'API <b>« Offres d'emploi v2 »</b> (bouton <i>Ajouter une API</i> / <i>S'abonner</i>).</li>
        <li>Notez l'<b>Identifiant client</b> et la <b>Clé secrète</b> affichés dans l'application.</li>
      </ol>
      <h3>B. Les donner au robot (GitHub)</h3>
      <ol class="steps-guide">
        <li>Ouvrez <a href="${gh}/settings/secrets/actions/new" target="_blank" rel="noopener"><b>Secrets du dépôt</b></a> (Settings → Secrets and variables → Actions → <b>New repository secret</b>).</li>
        <li>Créez 3 secrets, un par un :<br>
          <span class="copy">FT_CLIENT_ID</span> = identifiant client<br>
          <span class="copy">FT_CLIENT_SECRET</span> = clé secrète<br>
          <span class="copy">NTFY_TOPIC</span> = ${topic ? `<span class="copy">${esc(topic)}</span> (votre canal ntfy)` : 'votre canal ntfy (onglet Rappels)'}</li>
        <li><a href="${gh}/settings/actions" target="_blank" rel="noopener"><b>Settings → Actions → General</b></a> → en bas : <b>Read and write permissions</b> → <b>Save</b>.</li>
        <li><a href="${gh}/actions/workflows/jobs.yml" target="_blank" rel="noopener"><b>Actions → Alertes emploi</b></a> → <b>Run workflow</b>. Attendez la coche verte ✓ (≈ 1 min).</li>
        <li>Revenez ici : les offres s'affichent. Ensuite c'est automatique, toutes les 30 min.</li>
      </ol>
      <p class="small muted mt">Changer les entreprises ou mots-clés : fichier <a href="${gh}/edit/main/jobs/config.json" target="_blank" rel="noopener">jobs/config.json</a>.</p>`;
    body.querySelectorAll('.copy').forEach((c) => (c.onclick = () => navigator.clipboard?.writeText(c.textContent).then(() => toast('Copié'))));
  }, { full: true });
}
