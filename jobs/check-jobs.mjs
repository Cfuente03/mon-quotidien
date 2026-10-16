// Robot d'alertes emploi — exécuté par GitHub Actions (voir .github/workflows/jobs.yml).
// Récupère les offres récentes, met à jour data/jobs.json (lu par l'app) et envoie une notification ntfy par nouvelle offre.
// Variables (secrets GitHub) : NTFY_TOPIC (obligatoire pour les notifications), NTFY_SERVER (optionnel),
// FT_CLIENT_ID / FT_CLIENT_SECRET (API France Travail, gratuite : https://francetravail.io).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('jobs/config.json', ROOT), 'utf8'));
const SEEN_FILE = new URL('jobs/seen.json', ROOT);
const OUT_FILE = new URL('data/jobs.json', ROOT);
const env = process.env;
const log = (...a) => console.log('•', ...a);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CONTRACTS = [['alternance', /alternan|apprenti/], ['Stage', /\bstage|intern(ship)?\b|stagiaire/], ['VIE', /\bv\.?i\.?e\b/], ['CDD', /\bcdd\b|fixed[- ]term|temporaire/], ['Intérim', /interim|intérim/], ['CDI', /\bcdi\b|permanent/], ['Thèse', /these|thèse|phd|doctora|cifre/]];
const guessContract = (txt) => { const t = norm(txt); for (const [label, re] of CONTRACTS) if (re.test(t)) return label === 'alternance' ? 'Alternance' : label; return ''; };

async function fetchJson(url, opts = {}, ms = 25000) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': 'mon-quotidien-job-alerts/1.0', Accept: 'application/json', ...(opts.headers || {}) } });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally { clearTimeout(to); }
}

// ---------- France Travail (API officielle) ----------
async function franceTravail() {
  const src = cfg.sources.franceTravail;
  if (!src?.enabled) return [];
  if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET) { log('France Travail : secrets FT_CLIENT_ID / FT_CLIENT_SECRET absents → ignoré'); return []; }
  const tok = await fetchJson('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.FT_CLIENT_ID, client_secret: env.FT_CLIENT_SECRET, scope: 'api_offresdemploiv2 o2dsoffre' }),
  });
  const out = [];
  for (const q of src.searches || []) {
    try {
      const data = await fetchJson(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?motsCles=${encodeURIComponent(q)}&publieeDepuis=7&range=0-149&sort=1`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      for (const o of data?.resultats || []) {
        out.push({
          id: `ft-${o.id}`, title: o.intitule, company: o.entreprise?.nom || '', contract: o.alternance ? 'Alternance' : ({ CDI: 'CDI', CDD: 'CDD', MIS: 'Intérim', SAI: 'Saisonnier', LIB: 'Indépendant' }[o.typeContrat] || o.typeContratLibelle || guessContract(o.intitule)),
          location: o.lieuTravail?.libelle || '', posted: o.dateCreation, url: o.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
          source: 'France Travail', text: `${o.intitule} ${o.description || ''}`,
        });
      }
      log(`France Travail « ${q} » : ${data?.resultats?.length || 0} offres`);
    } catch (e) { log(`France Travail « ${q} » : échec`, e.message); }
  }
  return out;
}

// ---------- Sites carrières Workday (Airbus, Thales…) ----------
function workdayDate(s) {
  const t = norm(s); const now = Date.now();
  if (/today|aujourd/.test(t)) return new Date(now).toISOString();
  if (/yesterday|hier/.test(t)) return new Date(now - 864e5).toISOString();
  const m = t.match(/(\d+)\+?\s*(day|jour)/); if (m) return new Date(now - Number(m[1]) * 864e5).toISOString();
  return null;
}
async function workday() {
  const out = [];
  for (const w of cfg.sources.workday || []) {
    try {
      const data = await fetchJson(w.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: w.searchText || '' }) });
      for (const j of data?.jobPostings || []) {
        out.push({
          id: `wd-${w.company}-${j.bulletFields?.[0] || j.externalPath}`, title: j.title, company: w.company, contract: guessContract(j.title),
          location: j.locationsText || '', posted: workdayDate(j.postedOn), url: `${w.site}${j.externalPath}`, source: `${w.company} (site carrières)`, text: j.title,
        });
      }
      log(`${w.company} (Workday) : ${data?.jobPostings?.length || 0} offres`);
    } catch (e) { log(`${w.company} (Workday) : échec`, e.message); }
  }
  return out;
}

// ---------- Flux RSS génériques ----------
async function rss() {
  const out = [];
  for (const r of cfg.sources.rss || []) {
    try {
      const xml = await (await fetch(r.url, { headers: { 'User-Agent': 'mon-quotidien-job-alerts/1.0' } })).text();
      for (const it of xml.split(/<item[\s>]/).slice(1)) {
        const tag = (n) => (it.match(new RegExp(`<${n}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${n}>`)) || [])[1]?.trim() || '';
        const link = tag('link'), title = tag('title');
        out.push({ id: `rss-${link}`, title, company: r.company || '', contract: guessContract(title + tag('description')), location: '', posted: tag('pubDate') ? new Date(tag('pubDate')).toISOString() : null, url: link, source: r.name || 'RSS', text: title });
      }
    } catch (e) { log(`RSS ${r.url} : échec`, e.message); }
  }
  return out;
}

// ---------- Filtrage, stockage, notifications ----------
const companyMatch = (j) => cfg.companies.find((c) => norm(j.company).includes(norm(c)) || norm(j.title).includes(norm(c)));
function keep(j) {
  if (cfg.onlyListedCompanies && !companyMatch(j)) return false;
  if (cfg.locations?.length && !cfg.locations.some((l) => norm(j.location).includes(norm(l)))) return false;
  if (cfg.contracts?.length && !cfg.contracts.some((c) => norm(j.contract).includes(norm(c)))) return false;
  if (j.posted && Date.now() - new Date(j.posted).getTime() > (cfg.maxAgeDays || 14) * 864e5) return false;
  return true;
}
const ago = (iso) => { if (!iso) return 'date inconnue'; const h = (Date.now() - new Date(iso).getTime()) / 36e5; return h < 1 ? 'il y a moins d\'1 h' : h < 24 ? `il y a ${Math.round(h)} h` : `il y a ${Math.round(h / 24)} j`; };

async function notify(title, message, url) {
  if (!env.NTFY_TOPIC) return;
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  // Publication JSON : accepte les accents et emojis dans le titre
  const res = await fetch(server, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: env.NTFY_TOPIC, title, message, tags: ['briefcase'], ...(url ? { click: url } : {}) }),
  });
  if (!res.ok) log('ntfy : échec', res.status);
}

const seen = JSON.parse(await readFile(SEEN_FILE, 'utf8').catch(() => '{}'));
const firstRun = !Object.keys(seen).length;
const all = (await Promise.all([franceTravail(), workday(), rss()])).flat();
const byId = new Map();
for (const j of all) if (j.title && j.url && keep(j)) { j.company = j.company || companyMatch(j) || ''; delete j.text; byId.set(j.id, j); }
const jobs = [...byId.values()].sort((a, b) => new Date(b.posted || 0) - new Date(a.posted || 0));
const fresh = jobs.filter((j) => !seen[j.id]);
log(`${all.length} offres récupérées, ${jobs.length} retenues, ${fresh.length} nouvelles`);

const now = new Date().toISOString();
for (const j of jobs) if (!seen[j.id]) { seen[j.id] = now; j.isNew = true; }
// on oublie les offres vues il y a plus de 60 jours
for (const [k, t] of Object.entries(seen)) if (Date.now() - new Date(t).getTime() > 60 * 864e5) delete seen[k];

if (firstRun) {
  if (jobs.length) await notify('💼 Alertes emploi activées', `${jobs.length} offres en cours suivies. Vous serez notifié de chaque nouvelle offre.`);
} else {
  const max = cfg.maxNotificationsPerRun || 8;
  for (const j of fresh.slice(0, max)) {
    await notify(`💼 ${j.company || 'Nouvelle offre'}${j.contract ? ' · ' + j.contract : ''}`, `${j.title}\n📍 ${j.location || '—'} · publiée ${ago(j.posted)}`, j.url);
  }
  if (fresh.length > max) await notify('💼 Encore d\'autres offres', `+${fresh.length - max} nouvelles offres : ouvrez l'onglet Emploi.`);
}

await mkdir(new URL('data/', ROOT), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify({ updated: now, count: jobs.length, careerPages: cfg.careerPages, keywords: cfg.keywords, companies: cfg.companies, jobs: jobs.slice(0, 300) }, null, 1));
await writeFile(SEEN_FILE, JSON.stringify(seen));
log('data/jobs.json mis à jour');
