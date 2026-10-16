// Onglet Nutrition : journal alimentaire, scan de codes-barres (Open Food Facts), photo analysée par IA (Claude)
import { state, save, uid, ymd, parseYmd, fmtDateLong, $, $$, esc } from './store.js';
import { openSheet, toast, loadScript, confirmDialog } from './ui.js';
import { attachVoice } from './permissions.js';
import { lineChart, barChart } from './chart.js';

const MEALS = { breakfast: '🥐 Petit-déjeuner', lunch: '🍝 Déjeuner', snack: '🍎 Collation', dinner: '🍲 Dîner' };
const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,image_front_small_url,image_front_url,nutriscore_grade,nova_group,ecoscore_grade,nutriments,quantity,serving_quantity,ingredients_text_fr,ingredients_text,allergens_tags,labels';

// Aliments de base (valeurs moyennes pour 100 g, d'après les tables Ciqual)
const BASICS = [
  ['Pomme', 53, 0.3, 11.6, 0.2], ['Banane', 90, 1.1, 20, 0.3], ['Orange', 45, 0.9, 8.6, 0.1], ['Fraises', 32, 0.7, 6, 0.3],
  ['Riz blanc cuit', 145, 2.7, 31, 0.3], ['Pâtes cuites', 150, 5.3, 29, 0.9], ['Pain baguette', 270, 9, 55, 1.2], ['Pain complet', 240, 9, 42, 2.5],
  ['Pomme de terre cuite', 80, 2, 17, 0.1], ['Frites', 290, 3.5, 36, 14], ['Flocons d\'avoine', 370, 13, 59, 7],
  ['Blanc de poulet cuit', 150, 30, 0, 2.5], ['Steak haché 5%', 125, 21, 0, 5], ['Steak haché 15%', 210, 18, 0, 15], ['Saumon cuit', 200, 24, 0, 11],
  ['Thon au naturel', 115, 26, 0, 1], ['Œuf (1 = 60 g)', 140, 12.5, 0.5, 10], ['Jambon blanc', 115, 20, 1, 3.5],
  ['Lentilles cuites', 115, 9, 17, 0.5], ['Pois chiches cuits', 140, 8, 18, 2.5], ['Brocoli cuit', 30, 2.5, 3, 0.5], ['Haricots verts', 30, 2, 4, 0.2],
  ['Salade verte', 15, 1.3, 1.5, 0.2], ['Tomate', 19, 0.9, 3, 0.2], ['Carottes', 36, 0.8, 7, 0.2], ['Avocat', 200, 1.6, 2, 20],
  ['Fromage blanc 3%', 75, 7.5, 4, 3], ['Yaourt nature', 60, 4, 5, 3], ['Skyr', 60, 10, 4, 0.2], ['Lait demi-écrémé', 46, 3.3, 4.8, 1.6],
  ['Emmental', 380, 28, 0, 30], ['Camembert', 280, 20, 0, 22], ['Beurre', 740, 0.7, 0.6, 82], ['Huile d\'olive', 900, 0, 0, 100],
  ['Amandes', 600, 21, 8, 52], ['Chocolat noir 70%', 570, 8, 33, 42], ['Whey (protéine)', 380, 78, 7, 5],
  ['Pizza margherita', 250, 10, 30, 9], ['Burger', 255, 13, 25, 11], ['Sushi / maki', 150, 5, 28, 2], ['Croissant', 410, 8, 45, 21],
  ['Coca-Cola (100 ml)', 42, 0, 10.6, 0], ['Jus d\'orange (100 ml)', 45, 0.7, 10, 0.1], ['Bière (100 ml)', 43, 0.4, 3.5, 0], ['Vin rouge (100 ml)', 85, 0.1, 2.6, 0],
].map(([name, kcal, p, c, f]) => ({ name, per100: { kcal, p, c, f }, source: 'Aliment de base' }));

let root, day = ymd(), span = 14;
const N = () => state.nutrition;
const dayData = (d = day) => (N().days[d] ||= { entries: [], water: 0 });
const r1 = (v) => Math.round(v * 10) / 10;
const calc = (e) => { const k = (e.grams || 0) / 100, p = e.per100 || {}; return { kcal: (p.kcal || 0) * k, p: (p.p || 0) * k, c: (p.c || 0) * k, f: (p.f || 0) * k }; };
export const dayTotals = (d) => dayData(d).entries.reduce((t, e) => { const v = calc(e); return { kcal: t.kcal + v.kcal, p: t.p + v.p, c: t.c + v.c, f: t.f + v.f }; }, { kcal: 0, p: 0, c: 0, f: 0 });
const defaultMeal = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 18.5 ? 'snack' : 'dinner'; };
const nsBadge = (g) => (g && 'abcde'.includes(g) ? `<span class="ns ns-${g}" title="Nutri-Score ${g.toUpperCase()}">${g.toUpperCase()}</span>` : '');

export function renderNutrition(el) {
  root = el ||= root;
  const g = N().goals, t = dayTotals(day), dd = dayData();
  const pct = (v, goal) => Math.min(100, Math.round((v / (goal || 1)) * 100));
  root.innerHTML = `
    <div class="row between"><h1 class="page-title">Nutrition</h1><button class="icon-btn" data-goals aria-label="Objectifs">🎯</button></div>
    <div class="row between day-nav"><button class="icon-btn" data-day="-1">‹</button><b>${day === ymd() ? 'Aujourd\'hui' : esc(fmtDateLong(parseYmd(day)))}</b><button class="icon-btn" data-day="1">›</button></div>
    <section class="card nut-sum">
      <div class="ring big" style="--p:${pct(t.kcal, g.kcal)};--rc:${t.kcal > g.kcal * 1.05 ? 'var(--danger)' : 'var(--c-food)'}"><span><b>${Math.round(t.kcal)}</b><small>/ ${g.kcal} kcal</small></span></div>
      <div class="macros grow">
        ${[['Protéines', t.p, g.p, '#ff7a45'], ['Glucides', t.c, g.c, '#4fa8ff'], ['Lipides', t.f, g.f, '#f5c542']].map(([l, v, goal, c]) => `
          <div class="macro"><div class="row between small"><span>${l}</span><span><b>${Math.round(v)}</b> / ${goal} g</span></div><i style="--v:${pct(v, goal) / 100};--mc:${c}"></i></div>`).join('')}
        <div class="small muted">Reste : <b>${Math.max(0, Math.round(g.kcal - t.kcal))} kcal</b></div>
      </div>
    </section>
    <section class="card water"><div class="row between"><b>💧 Eau</b><span class="small muted">${dd.water} / ${g.water} verres (25 cl)</span></div>
      <div class="glasses">${Array.from({ length: Math.max(g.water, dd.water) }, (_, i) => `<button class="glass ${i < dd.water ? 'on' : ''}" data-water="${i + 1}" aria-label="${i + 1} verres">🥛</button>`).join('')}</div></section>
    <div class="add-grid">
      <button class="add-tile" data-scan><span>📷</span>Scanner</button>
      <button class="add-tile" data-photo><span>🤖</span>Photo IA</button>
      <button class="add-tile" data-search><span>🔍</span>Rechercher</button>
      <button class="add-tile" data-manual><span>✏️</span>Manuel</button>
    </div>
    <input type="file" accept="image/*" capture="environment" data-photo-input hidden>
    ${Object.entries(MEALS).map(([k, label]) => {
      const list = dd.entries.filter((e) => e.meal === k);
      const kc = list.reduce((s, e) => s + calc(e).kcal, 0);
      return `<section class="meal"><div class="row between"><h3>${label}</h3><span class="small muted">${Math.round(kc)} kcal <button class="link" data-addmeal="${k}">＋</button></span></div>
        <div class="list compact">${list.map((e) => { const v = calc(e); return `
          <article class="item food" data-entry="${e.id}" style="--cc:var(--c-food)">
            ${e.img ? `<img src="${esc(e.img)}" alt="" class="food-img" loading="lazy">` : '<div class="food-img ph">🍽</div>'}
            <div class="grow"><div class="item-title">${esc(e.name)} ${nsBadge(e.nutriscore)}</div>
              <div class="small muted">${Math.round(e.grams)} g · P ${r1(v.p)} · G ${r1(v.c)} · L ${r1(v.f)}</div></div>
            <b class="small">${Math.round(v.kcal)}<small class="muted"> kcal</small></b></article>`; }).join('') || '<div class="small muted pad">—</div>'}</div></section>`;
    }).join('')}
    ${trendsCard()}
    ${weightCard()}`;

  root.onclick = (e) => {
    const t = e.target.closest('[data-span],[data-day],[data-water],[data-scan],[data-photo],[data-search],[data-manual],[data-addmeal],[data-entry],[data-goals],[data-weight]');
    if (!t) return;
    const d = t.dataset;
    if (d.day) { const x = parseYmd(day); x.setDate(x.getDate() + Number(d.day)); day = ymd(x); renderNutrition(); }
    else if (d.water) { dd.water = dd.water === Number(d.water) ? Number(d.water) - 1 : Number(d.water); save(); renderNutrition(); }
    else if (d.scan !== undefined) scanBarcode();
    else if (d.photo !== undefined) photoAI();
    else if (d.search !== undefined || d.addmeal) searchFood(d.addmeal);
    else if (d.manual !== undefined) manualEntry();
    else if (d.entry) editEntry(dd.entries.find((x) => x.id === d.entry));
    else if (d.goals !== undefined) editGoals();
    else if (d.weight !== undefined) addWeight();
    else if (d.span) { span = Number(d.span); renderNutrition(); }
  };
  $('[data-photo-input]', root).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) analysePhoto(f); };
}

// Tendances : calories par jour, réparties en protéines / glucides / lipides
const MC = { p: '#ff7a45', c: '#4fa8ff', f: '#f5c542' };
function trendsCard() {
  const g = N().goals, days = [];
  for (let i = span - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(ymd(d)); }
  const tots = days.map((d) => ({ d, ...dayTotals(d) }));
  const logged = tots.filter((t) => t.kcal > 0);
  const avg = (k) => (logged.length ? logged.reduce((s, t) => s + t[k], 0) / logged.length : 0);
  const bars = tots.map((t) => ({ label: `${parseYmd(t.d).getDate()}/${parseYmd(t.d).getMonth() + 1}`, parts: [{ v: t.p * 4, color: MC.p }, { v: t.c * 4, color: MC.c }, { v: t.f * 9, color: MC.f }] }));
  const row = (l, k, goal, c) => { const v = avg(k), pct = Math.round((v / (goal || 1)) * 100); return `<div class="macro"><div class="row between small"><span>${l}</span><span><b>${Math.round(v)}</b> g/j · ${pct}%</span></div><i style="--v:${Math.min(1, pct / 100)};--mc:${c}"></i></div>`; };
  return `<section class="card mt"><div class="row between"><b>📊 Tendances</b><div class="seg2 small-seg">${[7, 14, 30].map((n) => `<button data-span="${n}" class="${n === span ? 'on' : ''}">${n} j</button>`).join('')}</div></div>
    ${barChart(bars, { unit: 'kcal', goal: g.kcal, legend: [['Protéines', MC.p], ['Glucides', MC.c], ['Lipides', MC.f]] })}
    ${logged.length ? `<p class="small muted">Moyenne sur ${logged.length} jour${logged.length > 1 ? 's' : ''} saisi${logged.length > 1 ? 's' : ''} : <b>${Math.round(avg('kcal'))} kcal</b> / ${g.kcal}</p>
    <div class="macros">${row('Protéines', 'p', g.p, MC.p)}${row('Glucides', 'c', g.c, MC.c)}${row('Lipides', 'f', g.f, MC.f)}</div>` : ''}</section>`;
}

function weightCard() {
  const w = [...N().weights].sort((a, b) => a.t - b.t);
  const last = w.at(-1);
  return `<section class="card mt"><div class="row between"><b>⚖️ Poids</b><button class="btn ghost small" data-weight>＋ Ajouter</button></div>
    ${last ? `<p><b class="big-num">${last.kg} kg</b> <span class="small muted">le ${new Date(last.t).toLocaleDateString('fr-FR')}</span>
      ${w.length > 1 ? (() => { const dlt = r1(last.kg - w.at(-2).kg); return `<span class="small ${dlt <= 0 ? 'up' : 'down'}">${dlt > 0 ? '+' : ''}${dlt} kg</span>`; })() : ''}</p>
      ${w.length > 1 ? lineChart(w.slice(-30).map((x) => ({ x: x.t, y: x.kg })), { unit: 'kg', height: 130 }) : ''}` : '<p class="small muted">Suivez votre poids pour voir l\'évolution.</p>'}</section>`;
}
function addWeight() {
  const v = prompt('Votre poids (kg)', N().weights.at(-1)?.kg || '');
  const kg = Number(String(v).replace(',', '.'));
  if (kg > 20 && kg < 400) { N().weights.push({ t: Date.now(), kg: r1(kg) }); save(); renderNutrition(); }
}

// ---------- Ajout d'un aliment ----------
function addSheet(prod, { meal = defaultMeal(), grams } = {}) {
  const g0 = grams || prod.grams || prod.serving || 100;
  openSheet(prod.name, (body, close) => {
    const p = prod.per100 || {};
    body.innerHTML = `
      ${prod.img ? `<img src="${esc(prod.img)}" class="prod-img" alt="">` : ''}
      <div class="row gap wrap">${nsBadge(prod.nutriscore)}${prod.nova ? `<span class="pill">NOVA ${prod.nova}</span>` : ''}${prod.ecoscore && 'abcde'.includes(prod.ecoscore) ? `<span class="pill">Éco-score ${prod.ecoscore.toUpperCase()}</span>` : ''}${prod.brand ? `<span class="pill">${esc(prod.brand)}</span>` : ''}${prod.quantity ? `<span class="pill">${esc(prod.quantity)}</span>` : ''}</div>
      ${prod.nutriscore ? `<div class="ns-scale">${'abcde'.split('').map((l) => `<span class="ns-${l} ${l === prod.nutriscore ? 'cur' : ''}">${l.toUpperCase()}</span>`).join('')}</div>` : ''}
      <form class="form mt">
        <div class="row gap"><label class="grow">Quantité (g)<input type="number" name="g" inputmode="decimal" min="1" step="any" required></label>
          <label class="grow">Repas<select name="meal">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
        ${prod.serving ? `<div class="chips">${[0.5, 1, 2].map((m) => `<button type="button" class="chip" data-g="${prod.serving * m}">${m === 1 ? '1 portion' : m + ' portion' + (m > 1 ? 's' : '')} (${Math.round(prod.serving * m)} g)</button>`).join('')}</div>` : ''}
        <div class="stats" data-live></div>
        <button class="btn primary block">Ajouter au journal</button>
      </form>
      <table class="nut-table small"><tr><th>Pour 100 g</th><th></th></tr>
        ${[['Énergie', p.kcal, 'kcal'], ['Protéines', p.p, 'g'], ['Glucides', p.c, 'g'], ['dont sucres', p.sugar, 'g'], ['Lipides', p.f, 'g'], ['dont saturés', p.sat, 'g'], ['Fibres', p.fiber, 'g'], ['Sel', p.salt, 'g']]
          .filter(([, v]) => v != null).map(([l, v, u]) => `<tr><td>${l}</td><td>${r1(v)} ${u}</td></tr>`).join('')}</table>
      ${prod.ingredients ? `<details class="mt"><summary><b>Ingrédients</b></summary><p class="small">${esc(prod.ingredients)}</p></details>` : ''}
      ${prod.allergens?.length ? `<p class="small"><b>Allergènes :</b> ${esc(prod.allergens.join(', '))}</p>` : ''}
      ${prod.barcode ? `<p class="small muted">Code-barres ${esc(prod.barcode)} · <a href="${OFF}/product/${esc(prod.barcode)}" target="_blank" rel="noopener">Open Food Facts</a></p>` : ''}`;
    const f = $('form', body);
    f.elements.g.value = Math.round(g0); f.elements.meal.value = meal;
    const live = () => { const v = calc({ grams: Number(f.elements.g.value) || 0, per100: p }); $('[data-live]', body).innerHTML = `<div><b>${Math.round(v.kcal)}</b><small>kcal</small></div><div><b>${r1(v.p)}</b><small>prot.</small></div><div><b>${r1(v.c)}</b><small>gluc.</small></div><div><b>${r1(v.f)}</b><small>lip.</small></div>`; };
    f.oninput = live; live();
    f.onclick = (e) => { if (e.target.dataset.g) { f.elements.g.value = Math.round(e.target.dataset.g); live(); } };
    f.onsubmit = (e) => {
      e.preventDefault();
      const entry = { id: uid(), ...strip(prod), grams: Number(f.elements.g.value), meal: f.elements.meal.value, t: Date.now() };
      dayData().entries.push(entry);
      const rec = N().recents; const k = prod.barcode || prod.name;
      N().recents = [strip(prod), ...rec.filter((x) => (x.barcode || x.name) !== k)].slice(0, 25);
      save(); close(); renderNutrition(); toast(`${prod.name} ajouté`);
    };
  });
}
const strip = (p) => ({ name: p.name, brand: p.brand || '', img: p.img || '', per100: p.per100, nutriscore: p.nutriscore || '', nova: p.nova || '', barcode: p.barcode || '', serving: p.serving || null, source: p.source || '' });

function editEntry(e) {
  openSheet(e.name, (body, close) => {
    body.innerHTML = `<form class="form"><div class="row gap"><label class="grow">Quantité (g)<input type="number" name="g" step="any" min="1"></label>
      <label class="grow">Repas<select name="meal">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
      <div class="row gap end"><button type="button" class="btn danger ghost" data-del>Supprimer</button><button class="btn primary">Enregistrer</button></div></form>`;
    const f = $('form', body); f.elements.g.value = e.grams; f.elements.meal.value = e.meal;
    f.onsubmit = (ev) => { ev.preventDefault(); e.grams = Number(f.elements.g.value) || e.grams; e.meal = f.elements.meal.value; save(); close(); renderNutrition(); };
    $('[data-del]', body).onclick = () => { const dd = dayData(); dd.entries = dd.entries.filter((x) => x.id !== e.id); save(); close(); renderNutrition(); };
  });
}

function editGoals() {
  const g = N().goals;
  openSheet('Mes objectifs', (body, close) => {
    body.innerHTML = `<form class="form">
      <label>Calories / jour<input type="number" name="kcal" min="800" max="6000"></label>
      <div class="row gap"><label class="grow">Protéines (g)<input type="number" name="p"></label><label class="grow">Glucides (g)<input type="number" name="c"></label><label class="grow">Lipides (g)<input type="number" name="f"></label></div>
      <label>Verres d'eau / jour<input type="number" name="water" min="1" max="20"></label>
      <p class="small muted">Repère : protéines ≈ 1,6 à 2 g par kg de poids corporel si vous faites de la musculation.</p>
      <button class="btn primary block">Enregistrer</button></form>`;
    const f = $('form', body);
    for (const k of ['kcal', 'p', 'c', 'f', 'water']) f.elements[k].value = g[k];
    f.onsubmit = (e) => { e.preventDefault(); for (const k of ['kcal', 'p', 'c', 'f', 'water']) g[k] = Number(f.elements[k].value) || g[k]; save(); close(); renderNutrition(); };
  });
}

function manualEntry() {
  openSheet('Saisie manuelle', (body, close) => {
    body.innerHTML = `<form class="form">
      <label>Aliment<input name="name" required maxlength="80"></label>
      <label>Quantité consommée (g)<input type="number" name="g" value="100" step="any" min="1"></label>
      <p class="small muted">Valeurs pour la quantité consommée :</p>
      <div class="row gap"><label class="grow">kcal<input type="number" name="kcal" step="any" required></label><label class="grow">Prot.<input type="number" name="p" step="any" value="0"></label><label class="grow">Gluc.<input type="number" name="c" step="any" value="0"></label><label class="grow">Lip.<input type="number" name="f" step="any" value="0"></label></div>
      <label>Repas<select name="meal">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <button class="btn primary block">Ajouter</button></form>`;
    const f = $('form', body); f.elements.meal.value = defaultMeal();
    attachVoice(f.elements.name);
    f.onsubmit = (e) => {
      e.preventDefault();
      const g = Number(f.elements.g.value) || 100, k = 100 / g, n = (x) => Number(f.elements[x].value) || 0;
      dayData().entries.push({ id: uid(), name: f.elements.name.value.trim(), grams: g, meal: f.elements.meal.value, per100: { kcal: n('kcal') * k, p: n('p') * k, c: n('c') * k, f: n('f') * k }, source: 'manuel', t: Date.now() });
      save(); close(); renderNutrition();
    };
  });
}

// ---------- Open Food Facts ----------
function fromOFF(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : null);
  return {
    name: p.product_name_fr || p.product_name || p.generic_name_fr || 'Produit sans nom', brand: (p.brands || '').split(',')[0],
    img: p.image_front_small_url || p.image_front_url || '', barcode: p.code, quantity: p.quantity,
    nutriscore: (p.nutriscore_grade || '').toLowerCase(), nova: p.nova_group, ecoscore: (p.ecoscore_grade || '').toLowerCase(),
    serving: Number(p.serving_quantity) || null,
    per100: { kcal: kcal ?? 0, p: n.proteins_100g ?? 0, c: n.carbohydrates_100g ?? 0, f: n.fat_100g ?? 0, sugar: n.sugars_100g, sat: n['saturated-fat_100g'], fiber: n.fiber_100g, salt: n.salt_100g },
    ingredients: p.ingredients_text_fr || p.ingredients_text || '', allergens: (p.allergens_tags || []).map((a) => a.replace(/^\w+:/, '')), source: 'Open Food Facts',
  };
}
export async function lookupBarcode(code) {
  const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}?fields=${OFF_FIELDS}&lc=fr`);
  if (res.status === 404) return null;
  const data = await res.json();
  return data.status === 1 && data.product ? fromOFF(data.product) : null;
}
async function searchOFF(q) {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&lc=fr&fields=${OFF_FIELDS}`;
  const data = await (await fetch(url)).json();
  return (data.products || []).map(fromOFF).filter((p) => p.per100.kcal);
}

function searchFood(meal) {
  openSheet('Ajouter un aliment', (body, close) => {
    body.innerHTML = `<form class="picker-tools" data-f><input type="search" name="q" placeholder="🔍 Produit, marque, aliment…" enterkeyhint="search"></form><div class="list" data-res></div>`;
    const res = $('[data-res]', body), f = $('[data-f]', body);
    const img = (p) => (p.img ? `<img src="${esc(p.img)}" loading="lazy" class="food-img" alt="">` : '<div class="food-img ph">🍽</div>');
    const item = (p, i) => `<article class="item food" data-i="${i}">${img(p)}
      <div class="grow"><div class="item-title">${esc(p.name)} ${nsBadge(p.nutriscore)}</div><div class="small muted">${esc(p.brand || p.source || '')} · ${Math.round(p.per100.kcal)} kcal/100 g</div></div></article>`;
    let list = [];
    const show = (arr, title) => { list = arr; res.innerHTML = (title ? `<h3>${title}</h3>` : '') + (arr.map(item).join('') || '<div class="empty small">Aucun résultat</div>'); };
    const local = (q) => { const n = q.toLowerCase(); return [...N().recents, ...BASICS].filter((p) => p.name.toLowerCase().includes(n)); };
    show([...N().recents.slice(0, 10), ...BASICS.slice(0, 12)], N().recents.length ? 'Récents & aliments de base' : 'Aliments de base');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const q = f.elements.q.value.trim(); if (!q) return;
      const loc = local(q);
      show(loc, loc.length ? 'Résultats rapides' : '');
      res.insertAdjacentHTML('beforeend', '<div class="empty small" data-wait>Recherche dans Open Food Facts…</div>');
      try { const off = await searchOFF(q); show([...loc, ...off], loc.length || off.length ? '' : ''); }
      catch { $('[data-wait]', res)?.replaceWith(Object.assign(document.createElement('div'), { className: 'empty small', textContent: 'Open Food Facts injoignable.' })); }
    };
    f.elements.q.oninput = () => { const q = f.elements.q.value.trim(); if (q.length >= 2) show(local(q)); };
    attachVoice(f.elements.q, () => f.requestSubmit());
    res.onclick = (e) => { const i = e.target.closest('[data-i]')?.dataset.i; if (i != null) { close(); addSheet(list[i], { meal: meal || defaultMeal() }); } };
  }, { full: true });
}

// ---------- Scanner de code-barres / QR code ----------
function extractCode(raw) {
  const s = String(raw).trim();
  if (/^\d{8,14}$/.test(s)) return s;
  const m = s.match(/\/01\/(\d{14})/) || s.match(/(?:^|\D)(\d{13})(?:\D|$)/); // GS1 Digital Link ou EAN dans une URL
  return m ? m[1].replace(/^0(\d{13})$/, '$1') : null;
}

function scanBarcode() {
  let stop = () => {};
  openSheet('Scanner un produit', (body, close) => {
    body.innerHTML = `
      <div class="scanner"><video playsinline muted></video><div class="scan-frame"></div><p class="scan-hint">Visez le code-barres ou le QR code</p></div>
      <form class="row gap mt" data-manual><input name="code" inputmode="numeric" placeholder="ou tapez le code-barres" class="grow"><button class="btn primary">OK</button></form>`;
    const video = $('video', body);
    let done = false;
    const found = async (raw) => {
      if (done) return;
      const code = extractCode(raw);
      if (!code) { toast(`QR code lu : ${String(raw).slice(0, 60)}`); return; }
      done = true; navigator.vibrate?.(80); stop(); close();
      toast('Recherche du produit…', 1500);
      try {
        const p = await lookupBarcode(code);
        if (p) addSheet(p); else { toast('Produit inconnu d\'Open Food Facts'); manualEntry(); }
      } catch { toast('Open Food Facts injoignable'); }
    };
    $('[data-manual]', body).onsubmit = (e) => { e.preventDefault(); found(e.target.elements.code.value); };
    startScanner(video, found).then((s) => (stop = s)).catch((e) => {
      $('.scan-hint', body).textContent = `Caméra indisponible (${e.message || e.name}). Tapez le code ci-dessous.`;
    });
  }, { full: true, onClose: () => stop() });
}

async function startScanner(video, onCode) {
  if ('BarcodeDetector' in window) {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (formats.includes('ean_13')) {
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'].filter((f) => formats.includes(f)) });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
      video.srcObject = stream; await video.play();
      let alive = true;
      const tick = async () => {
        if (!alive) return;
        try { const r = await det.detect(video); if (r[0]) onCode(r[0].rawValue); } catch {}
        setTimeout(tick, 200);
      };
      tick();
      return () => { alive = false; stream.getTracks().forEach((t) => t.stop()); };
    }
  }
  // iPhone & navigateurs sans BarcodeDetector : bibliothèque ZXing
  await loadScript('vendor/zxing.min.js');
  const reader = new window.ZXing.BrowserMultiFormatReader();
  await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) onCode(res.getText()); });
  return () => reader.reset();
}

// ---------- Photo analysée par l'IA (Claude) ----------
function photoAI() {
  if (!state.settings.anthropicKey) {
    openSheet('Reconnaissance photo par IA', (body, close) => {
      body.innerHTML = `<p>Pour reconnaître les aliments sur une photo, l'app utilise <b>Claude</b> (Anthropic).</p>
        <ol class="small"><li>Créez un compte sur <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> et ajoutez quelques euros de crédit.</li>
        <li>Menu <b>API Keys</b> → <b>Create Key</b>, copiez la clé.</li><li>Collez-la ci-dessous. Elle reste uniquement sur ce téléphone.</li></ol>
        <p class="small muted">Coût indicatif : environ 1 à 2 centimes par photo.</p>
        <form class="form"><input name="k" placeholder="sk-ant-…" autocomplete="off" required><button class="btn primary block">Enregistrer</button></form>`;
      $('form', body).onsubmit = (e) => { e.preventDefault(); state.settings.anthropicKey = e.target.elements.k.value.trim(); save(); close(); $('[data-photo-input]', root).click(); };
    });
    return;
  }
  $('[data-photo-input]', root).click();
}

async function toJpegBase64(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { b64: url.split(',')[1], url };
}

const FOOD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'comment'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
      properties: { name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } } } },
    comment: { type: 'string' },
  },
};

async function analysePhoto(file) {
  let closeWait;
  openSheet('Analyse de la photo…', (body, close) => { closeWait = close; body.innerHTML = '<div class="empty">🤖 Claude identifie les aliments et estime les portions…</div>'; });
  try {
    const { b64, url } = await toJpegBase64(file);
    const { Anthropic } = await import('../vendor/anthropic-sdk.mjs');
    const client = new Anthropic({ apiKey: state.settings.anthropicKey, dangerouslyAllowBrowser: true });
    const msg = await client.beta.messages.create({
      model: state.settings.aiModel || 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FOOD_SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Identifie chaque aliment ou plat visible sur cette photo de repas. Pour chacun, estime la quantité en grammes à partir des proportions visibles (assiette, couverts, emballage), puis les calories, protéines, glucides et lipides correspondant à cette quantité, d\'après des tables nutritionnelles de référence (Ciqual). Noms en français. Si la photo ne montre pas de nourriture, renvoie une liste vide et explique pourquoi dans "comment". Dans "comment", une phrase courte sur l\'équilibre du repas.' },
      ] }],
    });
    closeWait();
    if (msg.stop_reason === 'refusal') throw new Error('Analyse refusée pour cette image');
    const text = msg.content.find((b) => b.type === 'text')?.text || '{}';
    const out = JSON.parse(text);
    showAIResult(out, url);
  } catch (e) {
    closeWait?.();
    const m = String(e.status === 401 ? 'Clé API invalide (⚙️ Réglages pour la changer)' : e.message || e);
    toast(`Échec de l'analyse : ${m.slice(0, 120)}`, 5000);
  }
}

function showAIResult(out, imgUrl) {
  const items = out.items || [];
  openSheet('Résultat de l\'analyse', (body, close) => {
    const tot = items.reduce((t, i) => ({ kcal: t.kcal + i.kcal, p: t.p + i.protein_g, c: t.c + i.carbs_g, f: t.f + i.fat_g }), { kcal: 0, p: 0, c: 0, f: 0 });
    body.innerHTML = `<img src="${imgUrl}" class="prod-img" alt="">
      ${out.comment ? `<p class="small">${esc(out.comment)}</p>` : ''}
      <div class="list compact">${items.map((i, k) => `<label class="item food"><input type="checkbox" checked data-k="${k}">
        <div class="grow"><div class="item-title">${esc(i.name)}</div><div class="small muted">≈ <input type="number" class="inline-num" value="${Math.round(i.grams)}" data-g="${k}"> g · P ${r1(i.protein_g)} · G ${r1(i.carbs_g)} · L ${r1(i.fat_g)}</div></div>
        <b class="small">${Math.round(i.kcal)} kcal</b></label>`).join('') || '<div class="empty small">Aucun aliment reconnu.</div>'}</div>
      ${items.length ? `<div class="stats"><div><b>${Math.round(tot.kcal)}</b><small>kcal</small></div><div><b>${Math.round(tot.p)}</b><small>prot.</small></div><div><b>${Math.round(tot.c)}</b><small>gluc.</small></div><div><b>${Math.round(tot.f)}</b><small>lip.</small></div></div>
      <label class="form">Repas<select data-meal>${Object.entries(MEALS).map(([k, v]) => `<option value="${k}" ${k === defaultMeal() ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <p class="small muted">Estimation par IA : ajustez les grammes si besoin.</p>
      <button class="btn primary block mt" data-add>Ajouter au journal</button>` : ''}`;
    $('[data-add]', body)?.addEventListener('click', () => {
      const meal = $('[data-meal]', body).value;
      $$('[data-k]', body).filter((c) => c.checked).forEach((c) => {
        const i = items[c.dataset.k], g0 = i.grams || 100, g = Number($(`[data-g="${c.dataset.k}"]`, body).value) || g0, k = 100 / g0;
        dayData().entries.push({ id: uid(), name: i.name, grams: g, meal, per100: { kcal: i.kcal * k, p: i.protein_g * k, c: i.carbs_g * k, f: i.fat_g * k }, source: 'IA', t: Date.now() });
      });
      save(); close(); renderNutrition(); toast('Repas ajouté');
    });
  }, { full: true });
}
