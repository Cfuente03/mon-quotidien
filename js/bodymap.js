// Carte anatomique (vues de face et de dos, 70+ zones) — données : body-muscles (Apache-2.0)
import { MUSCLES_FR } from './exercises.js';

let mapData;
export async function loadBodyMap() {
  return (mapData ||= fetch('./data/body-map.json').then((r) => r.json()));
}

// Zone anatomique → groupe musculaire de l'app (+ coefficient)
const RULES = [
  [/^chest/, 'chest'], [/^shoulder|^deltoid/, 'shoulders'], [/^biceps/, 'biceps'], [/^triceps/, 'triceps'],
  [/^forearm/, 'forearms'], [/^abs|^obliques|^serratus/, 'abdominals'], [/^hip-flexor/, 'quadriceps', 0.6],
  [/^lats/, 'lats'], [/^traps-upper/, 'traps'], [/^traps-(mid|lower)/, 'middle back'], [/^nape/, 'neck'], [/^neck/, 'neck'],
  [/^lower-back/, 'lower back'], [/^gluteus-medius/, 'abductors'], [/^gluteus/, 'glutes'], [/^quads/, 'quadriceps'],
  [/^hamstrings/, 'hamstrings'], [/^calves/, 'calves'], [/^tibialis/, 'calves', 0.5], [/^adductors/, 'adductors'],
];
export function zoneMuscle(id) {
  for (const [re, m, k = 1] of RULES) if (re.test(id)) return [m, k];
  return [null, 0];
}
export const zoneValue = (id, intensity) => { const [m, k] = zoneMuscle(id); return m ? (intensity[m] || 0) * k : null; };

// Échelle de couleur : gris → jaune → orange → rouge
export function heat(v) {
  if (v == null) return 'var(--body-skin)';
  if (v <= 0) return 'var(--body-rest)';
  const stops = [[0, [255, 214, 102]], [0.5, [255, 140, 50]], [1, [229, 45, 39]]];
  let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1], t = Math.min(1, (v - a) / (b - a));
  return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(',')})`;
}

// Rendu 2D : face + dos côte à côte. Touchez une zone pour son nom.
export async function renderBodyMap(el, intensity = {}) {
  const d = await loadBodyMap();
  const path = ([id, p]) => `<path d="${p}" data-z="${id}" fill="${heat(zoneValue(id, intensity))}"/>`;
  el.innerHTML = `<div class="bodymap">
    <svg viewBox="0 0 72 93" role="img" aria-label="Carte des muscles travaillés">
      <g class="bm-front">${d.front.map(path).join('')}</g><g class="bm-back">${d.back.map(path).join('')}</g>
      <text x="17.5" y="92.4" text-anchor="middle">FACE</text><text x="54.5" y="92.4" text-anchor="middle">DOS</text>
    </svg><div class="bm-label"></div>
    <div class="bm-legend"><span>Repos</span><i></i><span>Intense</span></div></div>`;
  const label = el.querySelector('.bm-label');
  el.querySelector('svg').onclick = (e) => {
    const z = e.target.dataset?.z;
    el.querySelectorAll('.bm-sel').forEach((p) => p.classList.remove('bm-sel'));
    const [m] = z ? zoneMuscle(z) : [null];
    if (!m) { label.textContent = ''; return; }
    el.querySelectorAll('path').forEach((p) => zoneMuscle(p.dataset.z)[0] === m && p.classList.add('bm-sel'));
    label.textContent = `${MUSCLES_FR[m]} · ${Math.round((intensity[m] || 0) * 100)}%`;
  };
}
