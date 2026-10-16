// Arbre de compétences façon jeu vidéo : niveaux par groupe musculaire, points forts / faibles, badges
import { state, esc } from './store.js';
import { getEx, MUSCLES_FR, isCardio } from './exercises.js';
import { radarChart, barChart } from './chart.js';

const BRANCHES = [
  { k: 'push', label: 'Poussée', icon: '💪', muscles: ['chest', 'shoulders', 'triceps'] },
  { k: 'pull', label: 'Tirage', icon: '🧗', muscles: ['lats', 'middle back', 'biceps', 'traps', 'forearms'] },
  { k: 'legs', label: 'Jambes', icon: '🦵', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { k: 'core', label: 'Gainage', icon: '🧱', muscles: ['abdominals', 'lower back'] },
];
const SHORT = { 'middle back': 'Dos', 'lower back': 'Lombaires', quadriceps: 'Quadri.', hamstrings: 'Ischios', abdominals: 'Abdos', shoulders: 'Épaules', forearms: 'Av.-bras', adductors: 'Adduct.', abductors: 'Abduct.', lats: 'Dorsaux', chest: 'Pecs' };
const done = (x) => x.sets.filter((s) => s.done && Number(s.r) > 0);

// XP = séries (muscle principal 1, secondaire 0,5). Niveau = racine de l'XP.
const lvl = (xp) => { const l = Math.floor(Math.sqrt(xp / 3)) + 1; const a = 3 * (l - 1) ** 2, b = 3 * l ** 2; return { l, p: (xp - a) / (b - a) }; };

function xpBy(workouts) {
  const xp = {}; let cardioMin = 0;
  for (const w of workouts) for (const x of w.exercises) {
    const ex = getEx(x.exId), n = done(x).length;
    if (isCardio(ex)) cardioMin += done(x).reduce((s, st) => s + (Number(st.r) || 0), 0);
    ex.primaryMuscles.forEach((m) => (xp[m] = (xp[m] || 0) + n));
    (ex.secondaryMuscles || []).forEach((m) => (xp[m] = (xp[m] || 0) + n * 0.5));
  }
  return { xp, cardioMin };
}

export function computeSkills() {
  const all = xpBy(state.workouts);
  const recentW = state.workouts.filter((w) => w.start > Date.now() - 28 * 864e5);
  const recent = xpBy(recentW);
  const branches = BRANCHES.map((b) => {
    const kids = b.muscles.map((m) => ({ m, ...lvl(all.xp[m] || 0), recent: recent.xp[m] || 0 }));
    const xp = b.muscles.reduce((s, m) => s + (all.xp[m] || 0), 0) / b.muscles.length;
    return { ...b, ...lvl(xp), kids, recent: b.muscles.reduce((s, m) => s + (recent.xp[m] || 0), 0) / b.muscles.length };
  });
  const cardio = { k: 'cardio', label: 'Cardio', icon: '🫀', ...lvl(all.cardioMin / 5), recent: recent.cardioMin / 5 };
  const regular = { k: 'regular', label: 'Régularité', icon: '📅', l: recentW.length, p: 0, recent: recentW.length * 3 };
  const axes = [...branches, cardio, regular];
  const maxR = Math.max(1, ...axes.map((a) => a.recent));
  axes.forEach((a) => (a.score = Math.round((a.recent / maxR) * 100)));
  const total = branches.reduce((s, b) => s + b.l, 0) + cardio.l - 4;
  const sorted = [...axes].sort((a, b) => b.score - a.score);
  // muscles les moins travaillés récemment
  const weakMuscles = branches.flatMap((b) => b.kids).filter((k) => !['abductors', 'adductors', 'forearms'].includes(k.m)).sort((a, b) => a.recent - b.recent).slice(0, 3);
  return { branches, axes, total: Math.max(1, total), strong: sorted.slice(0, 2), weak: sorted.slice(-2).reverse(), weakMuscles };
}

const tone = (score) => (score >= 66 ? '#3fd18b' : score >= 33 ? '#f5c542' : '#ff6b6b');

function treeSvg(s) {
  const W = 360, colW = W / 4, top = 30, bY = 104, kidY0 = 178, gap = 62;
  const maxKids = Math.max(...s.branches.map((b) => b.kids.length));
  const H = kidY0 + (maxKids - 1) * gap + 40;
  const maxRecent = Math.max(1, ...s.branches.flatMap((b) => b.kids.map((k) => k.recent)));
  const ring = (cx, cy, r, p, color) => { const C = 2 * Math.PI * r; return `<circle class="prog" cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-dasharray="${(C * Math.max(0.02, p)).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`; };
  let lines = '', nodes = '';
  nodes += `<g class="st-node"><circle class="bg" cx="${W / 2}" cy="${top}" r="24"/><text x="${W / 2}" y="${top - 3}" class="ico">🏆</text><text x="${W / 2}" y="${top + 13}" class="lvl">Niv. ${s.total}</text></g>`;
  s.branches.forEach((b, i) => {
    const cx = colW * i + colW / 2;
    const bs = s.axes.find((a) => a.k === b.k).score;
    lines += `<path class="st-line" d="M${W / 2},${top + 24} C${W / 2},${top + 50} ${cx},${bY - 50} ${cx},${bY - 26}"/>`;
    nodes += `<g class="st-node"><circle class="bg" cx="${cx}" cy="${bY}" r="26"/>${ring(cx, bY, 26, b.p, tone(bs))}
      <text x="${cx}" y="${bY - 4}" class="ico">${b.icon}</text><text x="${cx}" y="${bY + 13}" class="lvl">${b.l}</text>
      <text x="${cx}" y="${bY + 42}" class="nm">${esc(b.label.toUpperCase())}</text></g>`;
    b.kids.forEach((k, j) => {
      const y = kidY0 + j * gap, py = j ? y - gap + 19 : bY + 48;
      lines += `<line class="st-line" x1="${cx}" y1="${py}" x2="${cx}" y2="${y - 19}"/>`;
      const sc = Math.round((k.recent / maxRecent) * 100);
      nodes += `<g class="st-node"><circle class="bg" cx="${cx}" cy="${y}" r="19"/>${ring(cx, y, 19, k.p, tone(sc))}
        <text x="${cx}" y="${y + 5}" class="lvl">${k.l}</text><text x="${cx}" y="${y + 31}" class="nm">${esc(SHORT[k.m] || MUSCLES_FR[k.m])}</text></g>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Arbre de compétences">${lines}${nodes}</svg>`;
}

const BADGES = (st) => {
  const ws = state.workouts, vol = (w) => w.exercises.reduce((t, x) => t + (isCardio(getEx(x.exId)) ? 0 : done(x).reduce((s, d) => s + (Number(d.w) || 0) * Number(d.r), 0)), 0);
  const sets = ws.reduce((t, w) => t + w.exercises.reduce((s, x) => s + done(x).length, 0), 0);
  const kg = state.nutrition?.weights?.at(-1)?.kg;
  const best = (re) => Math.max(0, ...ws.flatMap((w) => w.exercises.filter((x) => re.test(x.exId)).flatMap((x) => done(x).map((d) => Number(d.w) || 0))));
  return [
    ['🥇', 'Première séance', ws.length >= 1], ['🔟', '10 séances', ws.length >= 10], ['💯', '100 séances', ws.length >= 100],
    ['📦', '500 séries', sets >= 500], ['🏗', 'Séance de 10 t', ws.some((w) => vol(w) >= 10000)], ['🔥', '4 séances en 7 j', ws.filter((w) => w.start > Date.now() - 7 * 864e5).length >= 4],
    ['🏋️', 'Développé ≥ poids du corps', kg ? best(/Bench_Press/) >= kg : false], ['🦍', 'Squat ≥ 1,5× poids', kg ? best(/Squat/) >= kg * 1.5 : false],
    ['⚖️', 'Corps équilibré', st.axes.slice(0, 4).every((a) => a.score >= 50)],
  ];
};

export function renderSkillsSection() {
  const s = computeSkills();
  const weeks = [...Array(12)].map((_, i) => {
    const end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - end.getDay() + 7 - 7 * (11 - i)); // dimanche
    const start = end.getTime() - 7 * 864e5;
    const ws = state.workouts.filter((w) => w.start > start && w.start <= end.getTime());
    const v = ws.reduce((t, w) => t + w.exercises.reduce((a, x) => a + (isCardio(getEx(x.exId)) ? 0 : done(x).reduce((q, d) => q + (Number(d.w) || 0) * Number(d.r), 0)), 0), 0);
    return { label: new Date(start + 864e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }), parts: [{ v, color: 'var(--c-sport)' }] };
  });
  return `
    <h3>🌳 Arbre de compétences</h3>
    <div class="card skilltree">${treeSvg(s)}
      <div class="st-legend"><span><i style="background:#3fd18b"></i>Bien travaillé</span><span><i style="background:#f5c542"></i>Moyen</span><span><i style="background:#ff6b6b"></i>À travailler</span><span>(28 derniers jours)</span></div></div>
    <h3>🎯 Points forts / faibles</h3>
    <div class="card">${radarChart(s.axes.map((a) => ({ label: `${a.icon} ${a.label}`, v: a.score })))}
      <div class="sw-cards"><div><b>💪 Forts</b>${s.strong.map((a) => esc(a.label)).join(', ')}</div>
        <div><b>🎯 À travailler</b>${s.weak.map((a) => esc(a.label)).join(', ')}${s.weakMuscles.length ? `<div class="small muted">${s.weakMuscles.map((k) => esc(MUSCLES_FR[k.m])).join(', ')}</div>` : ''}</div></div></div>
    <h3>📈 Volume par semaine</h3>
    <div class="card">${barChart(weeks, { unit: 'kg' })}</div>
    <h3>🏅 Badges</h3>
    <div class="badges">${BADGES(s).map(([i, l, ok]) => `<div class="badge ${ok ? '' : 'locked'}"><b>${i}</b>${esc(l)}</div>`).join('')}</div>`;
}
