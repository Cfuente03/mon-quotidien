// Détection automatique des abonnements : relevé bancaire (CSV / OFX) et boîte Gmail
import { state, save, ymd } from './store.js';
import { loadScript } from './ui.js';

// [motif, nom, catégorie, lien de gestion]
export const MERCHANTS = [
  [/NETFLIX/, 'Netflix', 'video', 'https://www.netflix.com/account'], [/CANAL ?\+|CANALPLUS|CANAL PLUS|CANALSAT/, 'Canal+', 'video', 'https://client.canalplus.com'],
  [/CRUNCHYROLL/, 'Crunchyroll', 'video', 'https://www.crunchyroll.com/account/membership'], [/DISNEY/, 'Disney+', 'video', 'https://www.disneyplus.com/account'],
  [/PRIME ?VIDEO|AMAZON ?PRIME|AMZN ?PRIME|PRIME MEMBER/, 'Amazon Prime', 'shop', 'https://www.amazon.fr/gp/primecentral'], [/YOUTUBE|GOOGLE \*YOUTUBE/, 'YouTube Premium', 'video', 'https://www.youtube.com/paid_memberships'],
  [/PARAMOUNT/, 'Paramount+', 'video', 'https://www.paramountplus.com/account/'], [/\bADN\b|ANIMATION DIGITAL/, 'ADN', 'video', 'https://animationdigitalnetwork.com/account'],
  [/DAZN/, 'DAZN', 'video', 'https://www.dazn.com/fr-FR/myaccount'], [/BEIN/, 'beIN Sports', 'video', 'https://connect.bein.com'], [/RMC ?SPORT/, 'RMC Sport', 'video', 'https://www.rmcsport.tv'],
  [/\bMAX\b|HBO/, 'Max', 'video', 'https://auth.max.com/subscription'], [/MOLOTOV/, 'Molotov', 'video', 'https://www.molotov.tv/account'],
  [/SPOTIFY/, 'Spotify', 'music', 'https://www.spotify.com/account'], [/DEEZER/, 'Deezer', 'music', 'https://www.deezer.com/account'], [/AUDIBLE/, 'Audible', 'music', 'https://www.audible.fr/account'],
  [/APPLE\.COM|APPLE ?BILL|ITUNES|ICLOUD/, 'Apple (iCloud, Music, TV+)', 'cloud', 'https://account.apple.com'], [/GOOGLE ?ONE|GOOGLE \*STORAGE|GOOGLE STORAGE/, 'Google One', 'cloud', 'https://one.google.com/settings'],
  [/MICROSOFT|MSFT|OFFICE 365|XBOX/, 'Microsoft / Xbox', 'cloud', 'https://account.microsoft.com/services'], [/PLAYSTATION|SONY ?INTERACTIVE|PSN/, 'PlayStation Plus', 'cloud', 'https://www.playstation.com/acct/management'],
  [/NINTENDO/, 'Nintendo Online', 'cloud', 'https://accounts.nintendo.com'], [/ADOBE/, 'Adobe', 'cloud', 'https://account.adobe.com/plans'], [/DROPBOX/, 'Dropbox', 'cloud', 'https://www.dropbox.com/account/plan'],
  [/CANVA/, 'Canva', 'cloud', 'https://www.canva.com/settings/billing-and-teams'], [/DUOLINGO/, 'Duolingo', 'cloud', 'https://www.duolingo.com/settings/subscription'],
  [/OPENAI|CHATGPT/, 'ChatGPT', 'ai', 'https://chatgpt.com/#settings/Subscription'], [/ANTHROPIC|CLAUDE\.AI/, 'Claude', 'ai', 'https://claude.ai/settings/billing'],
  [/BASIC.?FIT/, 'Basic-Fit', 'sport', 'https://my.basic-fit.com'], [/FITNESS PARK/, 'Fitness Park', 'sport', 'https://www.fitnesspark.fr'], [/ON AIR|KEEP ?COOL|L'?ORANGE BLEUE/, 'Salle de sport', 'sport', ''],
  [/FREE MOBILE|FREE TELECOM|\bFREE\b/, 'Free', 'phone', 'https://subscribe.free.fr/login/'], [/SOSH|ORANGE/, 'Orange / Sosh', 'phone', 'https://espace-client.orange.fr'],
  [/\bSFR\b|RED BY SFR/, 'SFR / RED', 'phone', 'https://www.sfr.fr/mon-espace-client/'], [/BOUYGUES|B ?& ?YOU/, 'Bouygues Telecom', 'phone', 'https://www.bouyguestelecom.fr/mon-compte'],
  [/UBER ?ONE|UBER \*ONE/, 'Uber One', 'shop', 'https://account.uber.com'], [/DELIVEROO PLUS/, 'Deliveroo Plus', 'shop', ''], [/NAVIGO|COMUTITRES/, 'Navigo', 'other', 'https://www.jegeremacartenavigo.fr'],
  [/LE MONDE/, 'Le Monde', 'news', 'https://moncompte.lemonde.fr'], [/L.?EQUIPE/, "L'Équipe", 'news', 'https://www.lequipe.fr/compte'], [/MEDIAPART/, 'Mediapart', 'news', ''],
  [/LINKEDIN/, 'LinkedIn Premium', 'other', 'https://www.linkedin.com/premium/manage'], [/TINDER|BUMBLE|HINGE/, 'Appli de rencontre', 'other', ''],
];
export const matchMerchant = (txt) => MERCHANTS.find(([re]) => re.test(String(txt).toUpperCase()));

// ---------- Lecture des relevés ----------
const num = (s) => { s = String(s ?? '').replace(/\s| |€|EUR/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return Number(s.replace(/,/g, '')) || 0; };
function date(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function splitCsv(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map((x) => x.trim());
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = [';', '\t', ','].sort((a, b) => lines.slice(0, 15).join('').split(b).length - lines.slice(0, 15).join('').split(a).length)[0];
  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let hi = lines.findIndex((l) => /date/i.test(l) && /(libell|label|descr|intitul|detail|operation|nature)/i.test(norm(l)));
  if (hi < 0) hi = 0;
  const head = splitCsv(lines[hi], sep).map(norm);
  const col = (re) => head.findIndex((h) => re.test(h));
  const cD = col(/^date|date (d.)?op|date comptable/), cL = col(/libell|label|descr|intitul|detail|nature|operation$/), cA = col(/^montant|amount|valeur$/);
  const cDeb = col(/debit/), cCre = col(/credit/);
  const tx = [];
  for (const l of lines.slice(hi + 1)) {
    const r = splitCsv(l, sep), d = date(r[cD >= 0 ? cD : 0]);
    if (!d) continue;
    const amt = cA >= 0 ? num(r[cA]) : (num(r[cCre]) || 0) - Math.abs(num(r[cDeb]) || 0);
    const label = (cL >= 0 ? r[cL] : r.filter((x, i) => i !== cD && !/^-?[\d\s.,]+$/.test(x)).join(' ')) || '';
    if (amt) tx.push({ d, label: label.replace(/\s+/g, ' ').trim(), amt });
  }
  return tx;
}
function parseOfx(text) {
  return [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>))/gi)].map(([, b]) => {
    const g = (t) => (b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')) || [])[1]?.trim() || '';
    return { d: date(g('DTPOSTED')), label: [g('NAME'), g('MEMO')].filter(Boolean).join(' '), amt: num(g('TRNAMT').replace('.', ',')) || Number(g('TRNAMT')) };
  }).filter((t) => t.d && t.amt);
}
export async function importStatement(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // banques françaises
  const tx = /<OFX>|<STMTTRN>/i.test(text) ? parseOfx(text) : parseCsv(text);
  const key = (t) => `${t.d}|${t.amt}|${t.label}`;
  const known = new Set(state.bank.tx.map(key));
  const fresh = tx.filter((t) => !known.has(key(t)));
  state.bank.tx = [...state.bank.tx, ...fresh].sort((a, b) => a.d.localeCompare(b.d)).slice(-5000);
  state.bank.imported = Date.now(); save();
  return { total: tx.length, added: fresh.length };
}

// ---------- Détection des prélèvements récurrents ----------
const merchantKey = (label) => label.toUpperCase()
  .replace(/PRLV( SEPA)?|PRELEVEMENT|CB\*?|CARTE( X?\d+)?|PAIEMENT( PAR)?|ACHAT|FACT(URE)?|ECH(EANCE)?|\bDU\b|\bLE\b/g, ' ')
  .replace(/\d{2}[/.]\d{2}([/.]\d{2,4})?|X\d{3,}|\d{4,}|[*#:]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');

export function detectRecurring(tx = state.bank.tx) {
  const groups = {};
  for (const t of tx) if (t.amt < 0) { const m = matchMerchant(t.label); const k = m ? m[1] : merchantKey(t.label); if (k) (groups[k] ||= { m, list: [] }).list.push(t); }
  const out = [];
  for (const [k, { m, list }] of Object.entries(groups)) {
    list.sort((a, b) => a.d.localeCompare(b.d));
    const gaps = list.slice(1).map((t, i) => (new Date(t.d) - new Date(list[i].d)) / 864e5).sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    const cycle = med == null ? (m ? 'month' : null) : med >= 25 && med <= 35 ? 'month' : med >= 330 && med <= 400 ? 'year' : med >= 6 && med <= 8 ? 'week' : null;
    if (!cycle) continue;
    const amounts = list.map((t) => -t.amt), last = amounts.at(-1), prev = amounts.at(-2);
    if (!m && (list.length < 3 || Math.max(...amounts.slice(-3)) > Math.min(...amounts.slice(-3)) * 1.25)) continue; // montants trop variables
    out.push({ key: k, name: m ? m[1] : k.charAt(0) + k.slice(1).toLowerCase(), cat: m?.[2] || 'other', url: m?.[3] || '', price: Math.round(last * 100) / 100, cycle, last: list.at(-1).d, count: list.length, rise: prev && last > prev * 1.02 ? Math.round((last - prev) * 100) / 100 : 0 });
  }
  return out.sort((a, b) => b.price - a.price);
}

// Flux mensuels : entrées, sorties, virements
export function monthlyFlows(tx = state.bank.tx, months = 12) {
  const rec = new Set(detectRecurring(tx).map((r) => r.key));
  const map = {};
  for (const t of tx) {
    const k = t.d.slice(0, 7), o = (map[k] ||= { in: 0, out: 0, subs: 0, virIn: 0, virOut: 0 });
    if (t.amt > 0) o.in += t.amt; else o.out -= t.amt;
    const m = matchMerchant(t.label);
    if (t.amt < 0 && rec.has(m ? m[1] : merchantKey(t.label))) o.subs -= t.amt;
    if (/\bVIR(EMENT)?\b/i.test(t.label)) t.amt > 0 ? (o.virIn += t.amt) : (o.virOut -= t.amt);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([k, v]) => ({ month: k, ...v }));
}

// ---------- Scan Gmail (OAuth Google, lecture seule) ----------
const GMAIL_Q = 'newer_than:13m (from:(netflix.com OR canal-plus.com OR canalplus.com OR crunchyroll.com OR spotify.com OR deezer.com OR disneyplus.com OR amazon.fr OR primevideo.com OR apple.com OR google.com OR youtube.com OR microsoft.com OR openai.com OR anthropic.com OR basic-fit.com OR free.fr OR orange.fr OR sfr.fr OR bouyguestelecom.fr OR uber.com OR playstation.com OR xbox.com OR nintendo.com OR adobe.com OR dropbox.com OR audible.fr OR dazn.com OR paramountplus.com OR linkedin.com OR duolingo.com OR canva.com) OR subject:(abonnement OR subscription OR renouvellement OR "votre facture" OR "votre reçu" OR receipt OR "membership"))';

export async function scanGmail(onProgress) {
  const clientId = state.settings.googleClientId;
  if (!clientId) throw new Error('ID client Google manquant');
  await loadScript('https://accounts.google.com/gsi/client');
  const token = await new Promise((res, rej) => {
    const c = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/gmail.readonly', callback: (r) => (r.error ? rej(new Error(r.error)) : res(r.access_token)), error_callback: (e) => rej(new Error(e.type || 'refusé')) });
    c.requestAccessToken();
  });
  const api = async (p) => { const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Gmail ${r.status}`); return r.json(); };
  const list = await api(`messages?maxResults=150&q=${encodeURIComponent(GMAIL_Q)}`);
  const ids = (list.messages || []).map((m) => m.id);
  const found = {};
  let doneN = 0;
  const work = async (id) => {
    const m = await api(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const h = Object.fromEntries(m.payload.headers.map((x) => [x.name.toLowerCase(), x.value]));
    const text = `${h.from} ${h.subject} ${m.snippet}`;
    const mm = matchMerchant(text.replace(/@([\w-]+)\./, ' $1 '));
    onProgress?.(++doneN, ids.length);
    if (!mm) return;
    const price = (text.match(/(\d{1,4}[.,]\d{2})\s?(?:€|EUR)/i) || text.match(/€\s?(\d{1,4}[.,]\d{2})/) || [])[1];
    const d = ymd(new Date(Number(m.internalDate)));
    const f = (found[mm[1]] ||= { name: mm[1], cat: mm[2], url: mm[3], count: 0, last: d, price: 0, email: (h.to || '').match(/[\w.+-]+@[\w.-]+/)?.[0] || '' });
    f.count++;
    if (d >= f.last) { f.last = d; if (price) f.price = Number(price.replace(',', '.')); } else if (!f.price && price) f.price = Number(price.replace(',', '.'));
  };
  for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(work));
  try { window.google.accounts.oauth2.revoke(token, () => {}); } catch {}
  return Object.values(found).map((f) => ({ ...f, cycle: 'month', source: 'Gmail' })).sort((a, b) => b.price - a.price);
}

// ---------- Conseils d'économie ----------
export function savingTips(subs, detected = []) {
  const active = subs.filter((s) => s.active !== false);
  const m = (s) => (s.cycle === 'year' ? s.price / 12 : s.cycle === 'week' ? (s.price * 52) / 12 : s.price);
  const tips = [];
  const byCat = {};
  active.forEach((s) => (byCat[s.cat] ||= []).push(s));
  for (const cat of ['video', 'music']) {
    const l = byCat[cat] || [];
    if (l.length >= 2) {
      const sum = l.reduce((t, s) => t + m(s), 0), keep = Math.max(...l.map(m));
      tips.push(`<b>${l.length} services ${cat === 'video' ? 'de streaming vidéo' : 'de musique'}</b> (${l.map((s) => s.name).join(', ')}). Gardez-en un à la fois, alternez chaque mois : <b>≈ ${Math.round((sum - keep) * 12)} €/an</b> économisés.`);
    }
  }
  const unused = active.filter((s) => s.unused);
  if (unused.length) tips.push(`Résiliez ce que vous n'utilisez plus (${unused.map((s) => s.name).join(', ')}) : <b>${Math.round(unused.reduce((t, s) => t + m(s), 0) * 12)} €/an</b>.`);
  const monthlyBig = active.filter((s) => s.cycle === 'month' && ['video', 'music', 'cloud', 'ai', 'sport'].includes(s.cat) && s.price >= 5);
  if (monthlyBig.length) tips.push(`Passer à l'<b>abonnement annuel</b> coûte souvent 15 à 20 % de moins (${monthlyBig.map((s) => s.name).slice(0, 4).join(', ')}) : <b>≈ ${Math.round(monthlyBig.reduce((t, s) => t + s.price, 0) * 12 * 0.15)} €/an</b>.`);
  for (const d of detected.filter((x) => x.rise)) tips.push(`<b>${d.name}</b> a augmenté de ${d.rise.toFixed(2)} € : comparez les offres ou négociez.`);
  const tel = byCat.phone || [];
  if (tel.some((s) => s.price > 20)) tips.push('Forfait mobile > 20 € : des offres équivalentes existent souvent à 10-15 €.');
  return tips;
}
