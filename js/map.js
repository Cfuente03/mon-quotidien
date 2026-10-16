// Onglet Carte : recherche d'adresses et de lieux, lieux à proximité, itinéraires (OpenStreetMap)
import { state, save, uid, $, $$, esc } from './store.js';
import { toast, loadScript, loadCss } from './ui.js';
import { getPosition, attachVoice } from './permissions.js';

const CATS = [
  { k: 'restaurant', label: '🍽 Restaurants', q: '["amenity"~"^(restaurant|fast_food)$"]' },
  { k: 'cafe', label: '☕ Cafés', q: '["amenity"~"^(cafe|bar)$"]' },
  { k: 'shop', label: '🛒 Courses', q: '["shop"~"^(supermarket|convenience|bakery)$"]' },
  { k: 'pharmacy', label: '💊 Pharmacies', q: '["amenity"="pharmacy"]' },
  { k: 'gym', label: '🏋️ Salles de sport', q: '["leisure"="fitness_centre"]' },
  { k: 'fuel', label: '⛽ Essence', q: '["amenity"="fuel"]' },
  { k: 'atm', label: '🏧 Distributeurs', q: '["amenity"="atm"]' },
];
const MODES = { foot: '🚶 À pied', bike: '🚲 Vélo', car: '🚗 Voiture' };

let root, map, L, meLayer, me, resultsLayer, routeLayer, watchId, target, mode = 'foot';

export async function renderMap(el) {
  root = el;
  if (map) { setTimeout(() => map.invalidateSize(), 50); return; }
  root.innerHTML = `
    <div class="map-wrap">
      <div id="map"></div>
      <div class="map-top">
        <form class="map-search" data-search><input type="search" name="q" placeholder="Adresse, restaurant, lieu…" autocomplete="off" enterkeyhint="search"></form>
        <div class="chips">${CATS.map((c) => `<button class="chip" data-cat="${c.k}">${c.label}</button>`).join('')}<button class="chip" data-favs>★ Mes lieux</button></div>
      </div>
      <button class="map-locate icon-btn" data-locate aria-label="Me localiser">◎</button>
      <div class="map-panel" data-panel hidden></div>
    </div>`;
  loadCss('vendor/leaflet/leaflet.css');
  try { await loadScript('vendor/leaflet/leaflet.js'); } catch (e) { root.querySelector('#map').innerHTML = '<div class="empty">Carte indisponible hors ligne.</div>'; return; }
  L = window.L;
  L.Icon.Default.imagePath = 'vendor/leaflet/images/';
  map = L.map('map', { zoomControl: false }).setView([46.6, 2.4], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  resultsLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  meLayer = L.layerGroup().addTo(map);
  attachVoice($('[name=q]', root), () => search($('[name=q]', root).value));
  $('[data-search]', root).onsubmit = (e) => { e.preventDefault(); search(e.target.elements.q.value); e.target.elements.q.blur(); };
  root.onclick = (e) => {
    const t = e.target.closest('[data-cat],[data-favs],[data-locate],[data-pick],[data-route],[data-mode],[data-close-panel],[data-fav],[data-unfav],[data-follow]');
    if (!t) return;
    const d = t.dataset;
    if (d.cat) nearby(CATS.find((c) => c.k === d.cat));
    else if (d.favs !== undefined) showFavs();
    else if (d.locate !== undefined) locate(true);
    else if (d.pick) select(JSON.parse(decodeURIComponent(d.pick)));
    else if (d.route !== undefined) route();
    else if (d.mode) { mode = d.mode; route(); }
    else if (d.closePanel !== undefined) closePanel();
    else if (d.fav !== undefined) { state.places.push({ id: uid(), ...target }); save(); toast('Lieu enregistré'); select(target); }
    else if (d.unfav) { state.places = state.places.filter((p) => p.id !== d.unfav); save(); showFavs(); }
    else if (d.follow !== undefined) { follow = !follow; t.classList.toggle('on', follow); if (follow && me) map.setView([me.lat, me.lng], 17); }
  };
  locate(false);
}

let follow = false;
async function locate(center) {
  try {
    const p = await getPosition();
    me = p; drawMe();
    if (center || !target) map.setView([p.lat, p.lng], center ? 16 : 14);
    if (!watchId) watchId = navigator.geolocation.watchPosition((pos) => {
      me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }; drawMe();
      if (follow) map.panTo([me.lat, me.lng]);
    }, () => {}, { enableHighAccuracy: true });
  } catch (e) { if (center) toast('Position indisponible : autorisez la localisation'); }
}
function drawMe() {
  meLayer.clearLayers();
  L.circle([me.lat, me.lng], { radius: me.acc || 30, color: '#4f8cff', weight: 1, fillOpacity: 0.1 }).addTo(meLayer);
  L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2f6bff', fillOpacity: 1 }).addTo(meLayer);
}

const center = () => me || (() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; })();
const dist = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
const fmtTime = (s) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);

function panel(html) { const p = $('[data-panel]', root); p.innerHTML = html; p.hidden = false; }
function closePanel() { $('[data-panel]', root).hidden = true; resultsLayer.clearLayers(); routeLayer.clearLayers(); target = null; }

function listResults(items, title) {
  resultsLayer.clearLayers(); routeLayer.clearLayers();
  if (!items.length) return panel(`<div class="row between"><b>${esc(title)}</b><button class="icon-btn" data-close-panel>✕</button></div><div class="empty small">Aucun résultat.</div>`);
  const c = center();
  items.forEach((it) => { it.d = dist(c, it); });
  items.sort((a, b) => a.d - b.d);
  const bounds = [];
  items.forEach((it) => {
    const m = L.marker([it.lat, it.lng]).addTo(resultsLayer).on('click', () => select(it));
    m.bindTooltip(it.name, { direction: 'top', offset: [0, -30] });
    bounds.push([it.lat, it.lng]);
  });
  if (me) bounds.push([me.lat, me.lng]);
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  panel(`<div class="row between"><b>${esc(title)}</b><button class="icon-btn" data-close-panel>✕</button></div>
    <div class="list compact place-list">${items.slice(0, 30).map((it) => `
      <button class="place" data-pick="${encodeURIComponent(JSON.stringify({ name: it.name, addr: it.addr, lat: it.lat, lng: it.lng, kind: it.kind }))}">
        <b>${esc(it.name)}</b><span class="small muted">${esc(it.kind || '')}${it.addr ? ' · ' + esc(it.addr) : ''}</span><span class="small">${fmtDist(it.d)}</span>
      </button>`).join('')}</div>`);
}

async function search(q) {
  q = q.trim(); if (!q) return;
  const c = center();
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=15&lang=fr&lat=${c.lat}&lon=${c.lng}`;
    const data = await (await fetch(url)).json();
    const items = data.features.map((f) => {
      const p = f.properties, [lng, lat] = f.geometry.coordinates;
      const addr = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.postcode, p.city].filter(Boolean).join(' ');
      return { name: p.name || addr || q, addr: p.name ? addr : [p.city, p.country].filter(Boolean).join(', '), lat, lng, kind: KIND[p.osm_value] || '' };
    });
    if (items.length === 1) select(items[0]); else listResults(items, `Résultats pour « ${q} »`);
  } catch (e) { toast('Recherche impossible (connexion ?)'); }
}
const KIND = { restaurant: 'Restaurant', fast_food: 'Restauration rapide', cafe: 'Café', bar: 'Bar', pharmacy: 'Pharmacie', supermarket: 'Supermarché', bakery: 'Boulangerie', fitness_centre: 'Salle de sport', fuel: 'Station-service', city: 'Ville', town: 'Ville', village: 'Village', house: 'Adresse', street: 'Rue', residential: 'Rue', hotel: 'Hôtel', museum: 'Musée', station: 'Gare', hospital: 'Hôpital', atm: 'Distributeur', convenience: 'Supérette' };

async function nearby(cat) {
  const c = center();
  toast('Recherche à proximité…', 1500);
  const r = me ? 1500 : 2500;
  const q = `[out:json][timeout:20];(node${cat.q}(around:${r},${c.lat},${c.lng});way${cat.q}(around:${r},${c.lat},${c.lng}););out center 60;`;
  try {
    const data = await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).json();
    const items = data.elements.filter((e) => e.tags?.name).map((e) => ({
      name: e.tags.name, lat: e.lat ?? e.center.lat, lng: e.lon ?? e.center.lon,
      kind: [KIND[e.tags.amenity || e.tags.shop || e.tags.leisure], e.tags.cuisine?.split(';')[0]].filter(Boolean).join(' · '),
      addr: [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' '),
    }));
    listResults(items, cat.label);
  } catch (e) { toast('Service de lieux indisponible, réessayez'); }
}

function showFavs() {
  if (!state.places.length) return panel('<div class="row between"><b>★ Mes lieux</b><button class="icon-btn" data-close-panel>✕</button></div><div class="empty small">Sélectionnez un lieu puis touchez ☆ pour l\'enregistrer.</div>');
  listResults(state.places.map((p) => ({ ...p })), '★ Mes lieux');
}

function select(it) {
  target = it;
  resultsLayer.clearLayers(); routeLayer.clearLayers();
  L.marker([it.lat, it.lng]).addTo(resultsLayer);
  map.setView([it.lat, it.lng], Math.max(map.getZoom(), 16));
  const fav = state.places.find((p) => p.lat === it.lat && p.lng === it.lng);
  const g = `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}&travelmode=${{ foot: 'walking', bike: 'bicycling', car: 'driving' }[mode]}`;
  const a = `https://maps.apple.com/?daddr=${it.lat},${it.lng}&dirflg=${{ foot: 'w', bike: 'w', car: 'd' }[mode]}`;
  panel(`<div class="row between"><div class="grow"><b>${esc(it.name)}</b><div class="small muted">${esc([it.kind, it.addr].filter(Boolean).join(' · '))}</div>
      ${me ? `<div class="small">${fmtDist(dist(me, it))} à vol d'oiseau</div>` : ''}</div>
      ${fav ? `<button class="icon-btn" data-unfav="${fav.id}" title="Retirer">★</button>` : '<button class="icon-btn" data-fav title="Enregistrer">☆</button>'}
      <button class="icon-btn" data-close-panel>✕</button></div>
    <div class="row gap mt-s"><button class="btn primary grow" data-route>🧭 Itinéraire</button></div>
    <div class="row gap mt-s"><a class="btn ghost small grow" href="${g}" target="_blank" rel="noopener">Google Maps</a><a class="btn ghost small grow" href="${a}" target="_blank" rel="noopener">Plans (iPhone)</a></div>`);
}

const TURN = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
function stepText(s) {
  const m = s.maneuver, dir = TURN[m.modifier] || '', road = s.name ? ` sur ${s.name}` : '';
  switch (m.type) {
    case 'depart': return `Partez${road}`;
    case 'arrive': return 'Vous êtes arrivé 🎯';
    case 'roundabout': case 'rotary': return `Au rond-point, prenez la ${m.exit || ''}${m.exit === 1 ? 're' : 'e'} sortie${road}`;
    case 'continue': case 'new name': return `Continuez ${dir}${road}`;
    case 'merge': return `Insérez-vous ${dir}${road}`;
    case 'fork': return `À l'embranchement, restez ${dir}${road}`;
    case 'end of road': return `Au bout de la route, tournez ${dir}${road}`;
    default: return `Tournez ${dir}${road}`;
  }
}

async function route() {
  if (!target) return;
  if (!me) { await locate(false); if (!me) return toast('Activez la localisation pour l\'itinéraire'); }
  const coords = `${me.lng},${me.lat};${target.lng},${target.lat}`;
  const urls = [`https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`];
  if (mode === 'car') urls.push(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
  let data;
  for (const u of urls) { try { data = await (await fetch(u)).json(); if (data.code === 'Ok') break; } catch { data = null; } }
  if (!data || data.code !== 'Ok') return toast('Itinéraire introuvable');
  const r = data.routes[0];
  routeLayer.clearLayers();
  const line = L.geoJSON(r.geometry, { style: { color: '#2f6bff', weight: 6, opacity: 0.85 } }).addTo(routeLayer);
  map.fitBounds(line.getBounds(), { padding: [50, 50] });
  const steps = r.legs[0].steps;
  const arrival = new Date(Date.now() + r.duration * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  panel(`<div class="row between"><div><b>${fmtTime(r.duration)}</b> · ${fmtDist(r.distance)} <span class="small muted">arrivée ${arrival}</span><div class="small muted">vers ${esc(target.name)}</div></div><button class="icon-btn" data-close-panel>✕</button></div>
    <div class="seg-btns">${Object.entries(MODES).map(([k, v]) => `<button class="chip ${k === mode ? 'on' : ''}" data-mode="${k}">${v}</button>`).join('')}<button class="chip ${follow ? 'on' : ''}" data-follow>📍 Suivre</button></div>
    <ol class="steps small">${steps.map((s) => `<li>${esc(stepText(s))}${s.distance > 0 ? ` <span class="muted">· ${fmtDist(s.distance)}</span>` : ''}</li>`).join('')}</ol>`);
}
