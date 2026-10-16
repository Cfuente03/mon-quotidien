// Onglet Emploi : offres récentes trouvées par le robot GitHub (jobs/check-jobs.mjs)
import { state, save, $, esc } from './store.js';
import { toast, timeAgo } from './ui.js';

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
