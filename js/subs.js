// Onglet Abonnements : comptes & abonnements par adresse e-mail, coût mensuel, rappels de renouvellement
import { state, save, uid, ymd, parseYmd, pad, $, esc } from './store.js';
import { openSheet, toast, confirmDialog } from './ui.js';
import { syncNtfy } from './reminders.js';
import { barChart } from './chart.js';
import { importStatement, detectRecurring, monthlyFlows, scanGmail, savingTips } from './finance.js';

const CATS = { video: '🎬 Streaming', music: '🎵 Musique', cloud: '☁️ Cloud & logiciels', phone: '📱 Téléphone & internet', sport: '🏋️ Sport', shop: '🛍 Shopping', news: '📰 Presse', ai: '🤖 IA', bank: '🏦 Banque & assurance', other: '📦 Autre' };
const KNOWN = [
  ['Netflix', 'video', 'https://www.netflix.com/account'], ['Disney+', 'video', 'https://www.disneyplus.com/account'], ['Prime Video / Amazon Prime', 'shop', 'https://www.amazon.fr/gp/primecentral'],
  ['Canal+', 'video', 'https://client.canalplus.com'], ['YouTube Premium', 'video', 'https://www.youtube.com/paid_memberships'], ['Spotify', 'music', 'https://www.spotify.com/account'],
  ['Deezer', 'music', 'https://www.deezer.com/account'], ['Apple (iCloud, Music, TV+)', 'cloud', 'https://account.apple.com'], ['Google One', 'cloud', 'https://one.google.com/settings'],
  ['Microsoft 365', 'cloud', 'https://account.microsoft.com/services'], ['ChatGPT', 'ai', 'https://chatgpt.com/#settings/Subscription'], ['Claude', 'ai', 'https://claude.ai/settings/billing'],
  ['Basic-Fit', 'sport', 'https://my.basic-fit.com'], ['Free', 'phone', 'https://subscribe.free.fr/login/'], ['Orange / Sosh', 'phone', 'https://espace-client.orange.fr'],
  ['SFR / RED', 'phone', 'https://www.sfr.fr/mon-espace-client/'], ['Bouygues Telecom', 'phone', 'https://www.bouyguestelecom.fr/mon-compte'], ['Uber One', 'shop', 'https://account.uber.com'],
];

let root;
const monthly = (s) => (s.cycle === 'year' ? s.price / 12 : s.cycle === 'week' ? (s.price * 52) / 12 : s.price);
function nextRenewal(s) {
  if (!s.renew) return null;
  const d = parseYmd(s.renew), today = parseYmd(ymd());
  while (d < today) { if (s.cycle === 'year') d.setFullYear(d.getFullYear() + 1); else if (s.cycle === 'week') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); }
  return d;
}

let busy = '';
export function renderSubs(el) {
  root = el ||= root;
  const subs = state.subs;
  const emails = [...new Set([...state.emails, ...subs.map((s) => s.email).filter(Boolean)])];
  const active = subs.filter((s) => s.active !== false);
  const total = active.reduce((t, s) => t + monthly(s), 0);
  const have = new Set(subs.map((s) => s.name.toLowerCase()));
  const bankDet = state.bank.tx.length ? detectRecurring() : [];
  const det = [...bankDet.map((d) => ({ ...d, source: 'Banque' })), ...state.bank.gmail.filter((g) => !bankDet.some((b) => b.name === g.name))].filter((d) => !have.has(d.name.toLowerCase()));
  const tips = savingTips(subs, bankDet);
  const flows = monthlyFlows();
  const byCat = Object.entries(active.reduce((o, s) => ((o[s.cat] = (o[s.cat] || 0) + monthly(s)), o), {})).sort((x, y) => y[1] - x[1]);
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));
  root.innerHTML = `
    <h1 class="page-title">Abonnements</h1>
    <div class="stats three"><div><b>${total.toFixed(0)} €</b><small>par mois</small></div><div><b>${(total * 12).toFixed(0)} €</b><small>par an</small></div><div><b>${active.length}</b><small>actifs</small></div></div>

    <section class="card">
      <b>🔍 Détection automatique</b>
      <div class="add-grid two mt-s">
        <label class="add-tile"><span>🏦</span>Relevé bancaire<input type="file" accept=".csv,.ofx,.qfx,.txt,text/csv" data-bankfile hidden></label>
        <button class="add-tile" data-gmail><span>✉️</span>Scanner Gmail</button>
      </div>
      ${busy ? `<p class="small center">${esc(busy)}</p>` : `<p class="small muted">Relevé : appli ou site de votre banque → Comptes → <b>Exporter</b> (CSV ou OFX), 12 mois.${state.bank.tx.length ? ` · ${state.bank.tx.length} opérations chargées` : ''}</p>`}
      ${det.length ? `<h3>Trouvés (${det.length})</h3><div class="list compact">${det.map((d, i) => `
        <article class="item" style="--cc:var(--ok)"><div class="grow"><div class="item-title">${CATS[d.cat]?.split(' ')[0] || '📦'} ${esc(d.name)}</div>
          <div class="small muted">${d.price ? `${d.price.toFixed(2)} € / ${{ month: 'mois', year: 'an', week: 'sem.' }[d.cycle]}` : 'prix inconnu'} · ${esc(d.source)} · dernier ${new Date(d.last).toLocaleDateString('fr-FR')}${d.rise ? ` · <span class="down">▲ +${d.rise.toFixed(2)} €</span>` : ''}</div></div>
          <button class="btn primary small" data-adddet="${i}">＋</button></article>`).join('')}</div>
        <button class="btn ghost small block mt-s" data-addall>Tout ajouter</button>` : ''}
    </section>

    ${tips.length ? `<section class="card"><b>💡 Économies possibles</b><div class="tips mt-s">${tips.map((t) => `<div class="tip">${t}</div>`).join('')}</div></section>` : ''}

    ${byCat.length ? `<section class="card"><b>📊 Par catégorie</b><div class="bars mt-s">${byCat.map(([c, v]) => `<div class="bar"><span>${CATS[c] || c}</span><i style="--v:${v / maxCat}"></i><b>${v.toFixed(0)} €</b></div>`).join('')}</div></section>` : ''}

    ${flows.length ? `<section class="card"><b>📉 Mes flux d'argent</b>
      ${barChart(flows.map((f) => ({ label: f.month.slice(5) + '/' + f.month.slice(2, 4), parts: [{ v: f.subs, color: '#e5484d' }, { v: Math.max(0, f.out - f.subs), color: '#ff9f43' }] })), { unit: '€', legend: [['Abonnements', '#e5484d'], ['Autres dépenses', '#ff9f43']] })}
      <table class="nut-table small"><tr><th>Mois</th><th>Entrées</th><th>Sorties</th><th>Virements ±</th></tr>
        ${flows.slice(-6).reverse().map((f) => `<tr><td>${f.month.slice(5)}/${f.month.slice(0, 4)}</td><td class="up">+${f.in.toFixed(0)}</td><td>−${f.out.toFixed(0)}</td><td>${(f.virIn - f.virOut >= 0 ? '+' : '')}${(f.virIn - f.virOut).toFixed(0)}</td></tr>`).join('')}</table></section>` : ''}

    <section class="card">
      <form class="row gap" data-email><input type="email" name="e" placeholder="Ajouter une adresse e-mail" class="grow" required><button class="btn primary">＋</button></form>
    </section>
    ${emails.map((em) => {
      const list = subs.filter((s) => s.email === em);
      return `<section class="card"><div class="row between"><b>✉️ ${esc(em)}</b><button class="icon-btn" data-rmail="${esc(em)}" aria-label="Retirer">✕</button></div>
        <div class="list compact mt-s">${list.map(subItem).join('') || '<div class="small muted">Aucun abonnement.</div>'}</div>
        <div class="row gap mt-s"><button class="btn ghost small grow" data-add="${esc(em)}">＋ Ajouter</button><a class="btn ghost small" target="_blank" rel="noopener" href="https://haveibeenpwned.com/account/${encodeURIComponent(em)}">🛡 Fuites</a></div></section>`;
    }).join('')}
    ${subs.filter((s) => !s.email).length ? `<section class="card"><b>Sans adresse</b><div class="list compact mt-s">${subs.filter((s) => !s.email).map(subItem).join('')}</div></section>` : ''}
    <button class="fab" data-add="" aria-label="Ajouter un abonnement">＋</button>`;

  $('[data-email]', root).onsubmit = (e) => {
    e.preventDefault(); const v = e.target.elements.e.value.trim().toLowerCase();
    if (!state.emails.includes(v)) state.emails.push(v); save(); renderSubs();
  };
  $('[data-bankfile]', root).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await importStatement(f); toast(r.total ? `${r.added} opérations ajoutées` : 'Aucune opération lue : format non reconnu', 4000); }
    catch (err) { toast('Lecture impossible : ' + err.message); }
    renderSubs();
  };
  const addDet = (d) => {
    const s = { id: uid(), name: d.name, cat: d.cat, price: d.price || 0, cycle: d.cycle, renew: d.last, email: d.email || '', url: d.url || '', remind: true, active: true, source: d.source };
    state.subs.push(s); if (s.email && !state.emails.includes(s.email)) state.emails.push(s.email); syncSubReminder(s);
  };
  root.onclick = async (e) => {
    const t = e.target.closest('[data-add],[data-sub],[data-rmail],[data-adddet],[data-addall],[data-gmail]');
    if (!t) return;
    if (t.dataset.adddet) { addDet(det[t.dataset.adddet]); save(); syncNtfy(); renderSubs(); toast('Ajouté'); }
    else if (t.hasAttribute('data-addall')) { det.forEach(addDet); save(); syncNtfy(); renderSubs(); toast(`${det.length} abonnements ajoutés`); }
    else if (t.hasAttribute('data-gmail')) gmail();
    else if (t.dataset.add !== undefined) editSub({ email: t.dataset.add });
    else if (t.dataset.sub) editSub(state.subs.find((s) => s.id === t.dataset.sub));
    else if (t.dataset.rmail && await confirmDialog(`Retirer ${t.dataset.rmail} ? Ses abonnements restent.`, 'Retirer')) {
      state.emails = state.emails.filter((x) => x !== t.dataset.rmail);
      state.subs.forEach((s) => { if (s.email === t.dataset.rmail) s.email = ''; });
      save(); renderSubs();
    }
  };
}

async function gmail() {
  if (!state.settings.googleClientId) return gmailSetup();
  try {
    busy = 'Connexion à Gmail…'; renderSubs();
    const res = await scanGmail((n, tot) => { busy = `Analyse des e-mails ${n}/${tot}…`; const p = $('.card p.center', root); if (p) p.textContent = busy; });
    state.bank.gmail = res; save();
    toast(res.length ? `${res.length} services trouvés` : 'Aucun abonnement trouvé', 4000);
  } catch (e) { toast('Gmail : ' + e.message, 5000); }
  busy = ''; renderSubs();
}

function gmailSetup() {
  const origin = location.origin;
  openSheet('Connecter Gmail (une seule fois)', (body, close) => {
    body.innerHTML = `<p class="small">Google exige un « ID client » à votre nom. 5 minutes, gratuit. Lecture seule, rien n'est stocké en ligne.</p>
      <ol class="steps-guide">
        <li>Ouvrez <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> → <b>Nouveau projet</b> → nom « Mon Quotidien » → <b>Créer</b>.</li>
        <li><a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">API Gmail</a> → <b>Activer</b>.</li>
        <li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Écran de consentement OAuth</a> → <b>Commencer</b> → type <b>Externe</b> → votre e-mail → <b>Créer</b>.</li>
        <li>Menu <b>Audience</b> → <b>Utilisateurs test</b> → <b>Ajouter</b> votre adresse Gmail.</li>
        <li><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clients</a> → <b>Créer un client</b> → type <b>Application Web</b>.<br>« Origines JavaScript autorisées » → <b>Ajouter</b> : <span class="copy">${esc(origin)}</span></li>
        <li>Copiez l'<b>ID client</b> (finit par <code>.apps.googleusercontent.com</code>) et collez-le ici :</li>
      </ol>
      <form class="form mt"><input name="id" placeholder="xxxx.apps.googleusercontent.com" required autocomplete="off"><button class="btn primary block">Enregistrer et scanner</button></form>
      <p class="small muted mt-s">Au scan, Google affiche « Application non validée » : c'est normal (c'est la vôtre). Touchez <b>Continuer</b>.</p>`;
    $('.copy', body).onclick = () => navigator.clipboard?.writeText(origin).then(() => toast('Copié'));
    $('form', body).onsubmit = (e) => { e.preventDefault(); state.settings.googleClientId = e.target.elements.id.value.trim(); save(); close(); gmail(); };
  }, { full: true });
}

function subItem(s) {
  const n = nextRenewal(s);
  const days = n ? Math.round((n - parseYmd(ymd())) / 864e5) : null;
  return `<article class="item ${s.active === false ? 'off' : ''}" data-sub="${s.id}" style="--cc:var(--c-other)">
    <div class="grow"><div class="item-title">${CATS[s.cat]?.split(' ')[0] || '📦'} ${esc(s.name)}</div>
      <div class="small muted">${s.price ? `${Number(s.price).toFixed(2)} € / ${{ month: 'mois', year: 'an', week: 'semaine' }[s.cycle]}` : 'Gratuit'}${n ? ` · renouvellement ${days === 0 ? 'aujourd\'hui' : days === 1 ? 'demain' : `dans ${days} j`}` : ''}</div></div>
    ${s.url ? `<a class="btn ghost small" href="${esc(s.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Gérer</a>` : ''}</article>`;
}

function editSub(s0 = {}) {
  const isNew = !s0.id;
  const s = { id: uid(), name: '', cat: 'other', price: '', cycle: 'month', renew: '', email: '', url: '', remind: true, active: true, ...s0 };
  openSheet(isNew ? 'Nouvel abonnement' : s.name, (body, close) => {
    body.innerHTML = `<form class="form">
      ${isNew ? `<div class="chips">${KNOWN.map(([n], i) => `<button type="button" class="chip" data-k="${i}">${esc(n)}</button>`).join('')}</div>` : ''}
      <label>Service<input name="name" required maxlength="60"></label>
      <div class="row gap"><label class="grow">Prix (€)<input type="number" name="price" step="0.01" min="0" inputmode="decimal"></label>
        <label class="grow">Fréquence<select name="cycle"><option value="month">Mensuel</option><option value="year">Annuel</option><option value="week">Hebdo</option></select></label></div>
      <label>Catégorie<select name="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Adresse e-mail du compte<input type="email" name="email" list="mq-emails"><datalist id="mq-emails">${state.emails.map((e) => `<option value="${esc(e)}">`).join('')}</datalist></label>
      <label>Prochain prélèvement<input type="date" name="renew"></label>
      <label>Lien de gestion / résiliation<input type="url" name="url" placeholder="https://"></label>
      <label class="row between"><span>Rappel 3 jours avant le prélèvement</span><span class="switch"><input type="checkbox" name="remind"><span></span></span></label>
      <label class="row between"><span>Je ne l'utilise plus</span><span class="switch"><input type="checkbox" name="unused"><span></span></span></label>
      <label class="row between"><span>Actif</span><span class="switch"><input type="checkbox" name="active"><span></span></span></label>
      <div class="row gap end">${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>Supprimer</button>'}<button class="btn primary">Enregistrer</button></div></form>`;
    const f = $('form', body);
    for (const k of ['name', 'price', 'cycle', 'cat', 'email', 'renew', 'url']) f.elements[k].value = s[k] ?? '';
    f.elements.remind.checked = s.remind; f.elements.unused.checked = !!s.unused; f.elements.active.checked = s.active !== false;
    f.onclick = (e) => { const k = e.target.dataset.k; if (k != null) { const [n, c, u] = KNOWN[k]; f.elements.name.value = n; f.elements.cat.value = c; f.elements.url.value = u; } };
    f.onsubmit = (e) => {
      e.preventDefault();
      Object.assign(s, { name: f.elements.name.value.trim(), price: Number(f.elements.price.value) || 0, cycle: f.elements.cycle.value, cat: f.elements.cat.value, email: f.elements.email.value.trim().toLowerCase(), renew: f.elements.renew.value, url: f.elements.url.value.trim(), remind: f.elements.remind.checked, active: f.elements.active.checked, unused: f.elements.unused.checked });
      if (s.email && !state.emails.includes(s.email)) state.emails.push(s.email);
      const i = state.subs.findIndex((x) => x.id === s.id); i >= 0 ? (state.subs[i] = s) : state.subs.push(s);
      syncSubReminder(s); save(); syncNtfy(); close(); renderSubs(); toast('Abonnement enregistré');
    };
    $('[data-del]', body)?.addEventListener('click', async () => {
      if (!(await confirmDialog(`Supprimer ${s.name} ?`, 'Supprimer'))) return;
      state.subs = state.subs.filter((x) => x.id !== s.id);
      state.reminders = state.reminders.filter((r) => r.id !== 'sub_' + s.id);
      save(); close(); renderSubs();
    });
  });
}

// Crée un rappel ponctuel 3 jours avant le prochain prélèvement
function syncSubReminder(s) {
  const id = 'sub_' + s.id;
  state.reminders = state.reminders.filter((r) => r.id !== id);
  const n = nextRenewal(s);
  if (!s.remind || !n || s.active === false) return;
  const d = new Date(n); d.setDate(d.getDate() - 3);
  d.setHours(10, 0, 0, 0);
  if (d < new Date()) d.setTime(Date.now() + 3600e3);
  state.reminders.push({ id, title: `💳 ${s.name} : prélèvement le ${n.getDate()}/${pad(n.getMonth() + 1)}`, body: `${Number(s.price).toFixed(2)} € — pensez à résilier si vous ne l'utilisez plus.`, repeat: 'once', date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, enabled: true });
}
