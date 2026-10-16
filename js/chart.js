// Mini graphique en courbe (SVG) pour la progression
import { esc } from './store.js';

export function lineChart(points, { unit = '', height = 160 } = {}) {
  if (points.length < 2) return `<div class="empty small">Au moins 2 séances sont nécessaires pour afficher la courbe.</div>`;
  const W = 320, H = height, L = 36, R = 10, T = 12, B = 22;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12; min -= pad; max += pad;
  const x = (i) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${x(points.length - 1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  const best = ys.indexOf(Math.max(...ys));
  const dlabel = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de progression">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end" class="axis">${fmt(t)}</text>`).join('')}
    <path d="${area}" class="area"/><path d="${path}" class="line"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${i === best ? 4.5 : 3}" class="${i === best ? 'pt best' : 'pt'}"><title>${esc(dlabel(p.x))} : ${fmt(p.y)} ${esc(unit)}</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}" class="axis">${esc(dlabel(points[0].x))}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" class="axis">${esc(dlabel(points.at(-1).x))}</text>
  </svg>`;
}
