// Onglet Abonnements : comptes & abonnements par adresse e-mail, coût mensuel, rappels de renouvellement
import { state, save, uid, ymd, parseYmd, pad, $, esc } from './store.js';
import { openSheet, toast, confirmDialog } from './ui.js';
import { syncNtfy } from './reminders.js';

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

export function renderSubs(el) {
  root = el ||= root;
  const subs = state.subs;
  const emails = [...new Set([...state.emails, ...subs.map((s) => s.email).filter(Boolean)])];
  const total = subs.filter((s) => s.active !== false).reduce((t, s) => t + monthly(s), 0);
  root.innerHTML = `
    <h1 class="page-title">Comptes & abonnements</h1>
    <div class="stats three"><div><b>${total.toFixed(2)} €</b><small>par mois</small></div><div><b>${(total * 12).toFixed(0)} €</b><small>par an</small></div><div><b>${subs.length}</b><small>abonnements</small></div></div>
    <section class="card">
      <form class="row gap" data-email><input type="email" name="e" placeholder="Ajouter une adresse e-mail" class="grow" required><button class="btn primary">＋</button></form>
      <p class="small muted mt-s">Aucun service ne peut lister automatiquement les comptes liés à une adresse. Pour chaque e-mail, l'app vous aide à les retrouver dans votre boîte mail, puis vous les ajoutez ici.</p>
    </section>
    ${emails.map((em) => {
      const list = subs.filter((s) => s.email === em);
      const q = encodeURIComponent('(abonnement OR subscription OR "votre facture" OR reçu OR receipt OR renouvellement OR "bienvenue") newer_than:1y');
      return `<section class="card">
        <div class="row between"><b>✉️ ${esc(em)}</b><button class="icon-btn" data-rmail="${esc(em)}" aria-label="Retirer">✕</button></div>
        <div class="row gap wrap mt-s">
          <a class="btn ghost small" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/${esc(em)}/#search/${q}">🔎 Chercher dans Gmail</a>
          <a class="btn ghost small" target="_blank" rel="noopener" href="https://outlook.live.com/mail/0/search?q=${encodeURIComponent('abonnement OR facture OR subscription')}">🔎 Outlook</a>
          <a class="btn ghost small" target="_blank" rel="noopener" href="https://haveibeenpwned.com/account/${encodeURIComponent(em)}">🛡 Fuites de données</a>
        </div>
        <div class="list compact mt-s">${list.map(subItem).join('') || '<div class="small muted">Aucun abonnement enregistré pour cette adresse.</div>'}</div>
        <button class="btn ghost small block mt-s" data-add="${esc(em)}">＋ Ajouter un abonnement</button>
      </section>`;
    }).join('')}
    ${subs.filter((s) => !s.email).length ? `<section class="card"><b>Sans adresse</b><div class="list compact mt-s">${subs.filter((s) => !s.email).map(subItem).join('')}</div></section>` : ''}
    <button class="fab" data-add="" aria-label="Ajouter un abonnement">＋</button>`;

  $('[data-email]', root).onsubmit = (e) => {
    e.preventDefault(); const v = e.target.elements.e.value.trim().toLowerCase();
    if (!state.emails.includes(v)) state.emails.push(v); save(); renderSubs();
  };
  root.onclick = async (e) => {
    const t = e.target.closest('[data-add],[data-sub],[data-rmail]');
    if (!t) return;
    if (t.dataset.add !== undefined) editSub({ email: t.dataset.add });
    else if (t.dataset.sub) editSub(state.subs.find((s) => s.id === t.dataset.sub));
    else if (t.dataset.rmail && await confirmDialog(`Retirer ${t.dataset.rmail} ? Ses abonnements seront conservés.`, 'Retirer')) {
      state.emails = state.emails.filter((x) => x !== t.dataset.rmail);
      state.subs.forEach((s) => { if (s.email === t.dataset.rmail) s.email = ''; });
      save(); renderSubs();
    }
  };
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
      <label class="row between"><span>Actif</span><span class="switch"><input type="checkbox" name="active"><span></span></span></label>
      <div class="row gap end">${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>Supprimer</button>'}<button class="btn primary">Enregistrer</button></div></form>`;
    const f = $('form', body);
    for (const k of ['name', 'price', 'cycle', 'cat', 'email', 'renew', 'url']) f.elements[k].value = s[k] ?? '';
    f.elements.remind.checked = s.remind; f.elements.active.checked = s.active !== false;
    f.onclick = (e) => { const k = e.target.dataset.k; if (k != null) { const [n, c, u] = KNOWN[k]; f.elements.name.value = n; f.elements.cat.value = c; f.elements.url.value = u; } };
    f.onsubmit = (e) => {
      e.preventDefault();
      Object.assign(s, { name: f.elements.name.value.trim(), price: Number(f.elements.price.value) || 0, cycle: f.elements.cycle.value, cat: f.elements.cat.value, email: f.elements.email.value.trim().toLowerCase(), renew: f.elements.renew.value, url: f.elements.url.value.trim(), remind: f.elements.remind.checked, active: f.elements.active.checked });
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
