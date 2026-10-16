// Mannequin 3D : les zones musculaires s'allument selon l'intensité du travail
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { MUSCLES_FR } from './exercises.js';

const BASE = new THREE.Color('#8a93a6');
const LOW = new THREE.Color('#ffb547');
const HIGH = new THREE.Color('#ff3b3b');
const NEUTRAL = new THREE.Color('#c9ced8');

function colorFor(v) {
  if (!v) return BASE.clone();
  return v < 0.5 ? BASE.clone().lerp(LOW, 0.35 + v * 1.3) : LOW.clone().lerp(HIGH, (v - 0.5) * 2);
}

// Morceau de cylindre (secteur angulaire) : theta = 0 → face avant (+z), PI/2 → côté +x
function sector(rt, rb, h, start, len, muscle) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 20, 1, false, start, len);
  return { g, muscle };
}

function buildBody(group, intensity) {
  const parts = [];
  const add = (geo, muscle, pos, scale, rot) => {
    const val = muscle ? intensity[muscle] || 0 : 0;
    const mat = new THREE.MeshStandardMaterial({
      color: muscle ? colorFor(val) : NEUTRAL, roughness: 0.55, metalness: 0.05,
      emissive: val ? colorFor(val) : new THREE.Color(0), emissiveIntensity: val ? 0.25 + val * 0.35 : 0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.userData.muscle = muscle;
    group.add(m); parts.push(m);
    return m;
  };
  const P = Math.PI;
  const S = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

  // Tête & cou
  add(S(0.13), null, [0, 1.68, 0], [0.9, 1.1, 1]);
  add(sector(0.06, 0.07, 0.12, 0, 2 * P).g, 'neck', [0, 1.52, 0]);
  // Trapèzes (haut du dos, entre cou et épaules)
  add(sector(0.09, 0.2, 0.12, P * 0.55, P * 0.9).g, 'traps', [0, 1.44, -0.01], [1, 1, 0.8]);

  // Buste (cage thoracique) : pectoraux devant, dorsaux sur les côtés, milieu du dos derrière
  const ch = [0.22, 0.17, 0.34, 1.24];
  const chestZ = 0.62; // aplatissement avant/arrière
  for (const [st, len, mu] of [[-P * 0.36, P * 0.72, 'chest'], [P * 0.36, P * 0.34, 'lats'], [P * 0.7, P * 0.6, 'middle back'], [P * 1.3, P * 0.34, 'lats']]) {
    add(sector(ch[0], ch[1], ch[2], st, len).g, mu, [0, ch[3], 0], [1, 1, chestZ]);
  }
  // Abdomen : abdominaux devant (+ obliques), lombaires derrière
  for (const [st, len, mu] of [[-P * 0.45, P * 0.9, 'abdominals'], [P * 0.45, P * 1.1, 'lower back']]) {
    add(sector(0.17, 0.16, 0.24, st, len).g, mu, [0, 0.95, 0], [1, 1, chestZ]);
  }
  // Bassin : avant neutre, fessiers derrière
  add(sector(0.16, 0.17, 0.14, -P * 0.5, P).g, null, [0, 0.77, 0], [1, 1, 0.66]);
  add(sector(0.16, 0.17, 0.14, P * 0.5, P).g, 'glutes', [0, 0.77, 0], [1, 1, 0.66]);
  for (const sx of [-1, 1]) add(S(0.085), 'glutes', [sx * 0.075, 0.73, -0.07], [1, 1, 0.8]);

  for (const sx of [-1, 1]) {
    // Épaules (deltoïdes)
    add(S(0.085), 'shoulders', [sx * 0.25, 1.38, 0], [1, 1, 1.05]);
    // Bras : biceps devant, triceps derrière
    const armX = sx * 0.29;
    add(sector(0.055, 0.045, 0.28, -P / 2, P).g, 'biceps', [armX, 1.18, 0], null, [0, 0, sx * 0.08]);
    add(sector(0.055, 0.045, 0.28, P / 2, P).g, 'triceps', [armX, 1.18, 0], null, [0, 0, sx * 0.08]);
    add(S(0.045), null, [sx * 0.31, 1.03, 0]);
    add(sector(0.045, 0.032, 0.27, 0, 2 * P).g, 'forearms', [sx * 0.33, 0.88, 0.01], null, [0, 0, sx * 0.06]);
    add(S(0.045), null, [sx * 0.345, 0.71, 0.01], [0.8, 1.2, 0.6]);

    // Cuisses : quadriceps devant, ischios derrière, adducteurs (intérieur), abducteurs (extérieur)
    const lx = sx * 0.09;
    const outer = sx > 0 ? P / 3 : P * 4 / 3, inner = sx > 0 ? P * 4 / 3 : P / 3;
    add(sector(0.085, 0.06, 0.38, -P / 3, P * 2 / 3).g, 'quadriceps', [lx, 0.52, 0]);
    add(sector(0.085, 0.06, 0.38, outer, P / 3).g, 'abductors', [lx, 0.52, 0]);
    add(sector(0.085, 0.06, 0.38, P * 2 / 3, P * 2 / 3).g, 'hamstrings', [lx, 0.52, 0]);
    add(sector(0.085, 0.06, 0.38, inner, P / 3).g, 'adductors', [lx, 0.52, 0]);
    add(S(0.058), null, [lx, 0.31, 0.005]);
    // Jambes : tibia devant (neutre), mollets derrière
    add(sector(0.055, 0.035, 0.34, -P / 2, P).g, null, [lx, 0.12, 0]);
    add(sector(0.06, 0.035, 0.34, P / 2, P).g, 'calves', [lx, 0.12, 0], [1, 1, 1.15]);
    add(new THREE.BoxGeometry(0.08, 0.05, 0.18), null, [lx, -0.07, 0.04]);
  }
  return parts;
}

// Monte le mannequin dans `container`. `intensity` : { muscle: 0..1 }
export function mountBody(container, intensity = {}) {
  container.innerHTML = '';
  const w = container.clientWidth || 300, h = container.clientHeight || 360;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
  camera.position.set(0.8, 1.0, 3.1);
  scene.add(new THREE.HemisphereLight('#ffffff', '#202430', 1.4));
  const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#8fb3ff', 1.0); rim.position.set(-2, 2, -3); scene.add(rim);

  const group = new THREE.Group();
  const parts = buildBody(group, intensity);
  group.position.y = -0.82;
  scene.add(group);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.92; scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enablePan = false; controls.enableDamping = true;
  controls.minDistance = 1.6; controls.maxDistance = 5;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  // Touchez une zone pour afficher le nom du muscle
  const label = document.createElement('div');
  label.className = 'body-label';
  container.appendChild(label);
  const ray = new THREE.Raycaster(); const v = new THREE.Vector2();
  let down;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(parts)[0];
    const mu = hit?.object.userData.muscle;
    label.textContent = mu ? `${MUSCLES_FR[mu]} · ${Math.round((intensity[mu] || 0) * 100)}%` : '';
    label.classList.toggle('show', !!mu);
  });

  let raf, alive = true;
  const loop = () => {
    if (!alive) return;
    if (!container.isConnected) return dispose();
    controls.update(); renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  const ro = new ResizeObserver(() => {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
  });
  ro.observe(container);
  function dispose() {
    alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
    parts.forEach((p) => { p.geometry.dispose(); p.material.dispose(); });
    renderer.dispose();
  }
  loop();
  return { dispose };
}
