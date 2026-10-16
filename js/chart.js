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

// Barres simples ou empilées. bars: [{ label, parts: [{ v, color }] }], goal: ligne d'objectif optionnelle
export function barChart(bars, { unit = '', goal, height = 170, legend = [] } = {}) {
  if (!bars.length) return '<div class="empty small">Pas encore de données.</div>';
  const W = 320, H = height, L = 34, R = 6, T = 10, B = 20;
  const tot = bars.map((b) => b.parts.reduce((s, p) => s + p.v, 0));
  const max = Math.max(goal || 0, ...tot, 1) * 1.1;
  const bw = (W - L - R) / bars.length, y = (v) => T + (1 - v / max) * (H - T - B);
  const fmt = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v));
  const every = Math.ceil(bars.length / 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    ${[0, max / 2, max / 1.1].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 4}" y="${y(t) + 3}" text-anchor="end" class="axis">${fmt(t)}</text>`).join('')}
    ${bars.map((b, i) => { let acc = 0; const x = L + i * bw + bw * 0.15, w = bw * 0.7;
      return b.parts.map((p) => { const y1 = y(acc + p.v), h = y(acc) - y1; acc += p.v; return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, h)}" rx="2" fill="${p.color}"><title>${esc(b.label)} : ${fmt(p.v)} ${esc(unit)}</title></rect>`; }).join('')
        + (i % every === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(b.label)}</text>` : ''); }).join('')}
    ${goal ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" class="goal"/><text x="${W - R}" y="${y(goal) - 3}" text-anchor="end" class="axis">objectif</text>` : ''}
  </svg>${legend.length ? `<div class="chart-legend">${legend.map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>` : ''}`;
}

// Radar (toile d'araignée). axes: [{ label, v (0..100) }]
export function radarChart(axes, { size = 280 } = {}) {
  const c = size / 2, r = c - 42, n = axes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * r * v / 100, c + Math.sin(a) * r * v / 100]; };
  const poly = (v) => axes.map((_, i) => pt(i, v).join(',')).join(' ');
  return `<svg class="chart radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Points forts et points faibles">
    ${[25, 50, 75, 100].map((v) => `<polygon points="${poly(v)}" class="grid-poly"/>`).join('')}
    ${axes.map((_, i) => `<line x1="${c}" y1="${c}" x2="${pt(i, 100)[0]}" y2="${pt(i, 100)[1]}" class="grid"/>`).join('')}
    <polygon points="${axes.map((a, i) => pt(i, Math.max(4, a.v)).join(',')).join(' ')}" class="radar-area"/>
    ${axes.map((a, i) => { const [x, y] = pt(i, Math.max(4, a.v)); const [lx, ly] = pt(i, 122); return `<circle cx="${x}" cy="${y}" r="3.5" class="pt best"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${esc(a.label)}</text>`; }).join('')}
  </svg>`;
}
