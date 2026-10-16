// Mannequin 3D anatomique : les 70+ zones de la carte musculaire extrudées en relief (face + dos)
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { SVGLoader } from '../vendor/SVGLoader.js';
import { MUSCLES_FR } from './exercises.js';
import { loadBodyMap, zoneMuscle, zoneValue, heat } from './bodymap.js';

const SKIN = new THREE.Color('#d8dde6'), REST = new THREE.Color('#8f99ab'), CORE = new THREE.Color('#b9c0cc');
const colorOf = (v) => (v == null ? SKIN.clone() : v <= 0 ? REST.clone() : new THREE.Color(heat(v)));

// Demi-épaisseur du corps selon la zone (unités du dessin, corps ≈ 93 de haut)
function half(id) {
  if (/head|face/.test(id)) return 4.2;
  if (/neck|nape/.test(id)) return 2.6;
  if (/chest|abs|oblique|serratus|lats|traps|lower-back|spine|glute|hip/.test(id)) return 4.6;
  if (/shoulder|deltoid/.test(id)) return 2.6;
  if (/biceps|triceps|elbow/.test(id)) return 1.9;
  if (/forearm|hand/.test(id)) return 1.5;
  if (/quads|hamstring|adductor|knee/.test(id)) return 3;
  return 2; // mollets, tibias, pieds
}

const loader = new SVGLoader();
const shapesOf = (d) => loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`).paths.flatMap((p) => SVGLoader.createShapes(p));

function bbox(list) {
  const b = new THREE.Box2();
  for (const [, d] of list) for (const s of shapesOf(d)) s.getPoints().forEach((p) => b.expandByPoint(p));
  return b;
}

export async function mountBody(container, intensity = {}) {
  container.innerHTML = '';
  const map = await loadBodyMap();
  const w = container.clientWidth || 300, h = container.clientHeight || 360;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 50);
  camera.position.set(0.9, 0.25, 3.6);
  scene.add(new THREE.HemisphereLight('#ffffff', '#30364a', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 1.8); key.position.set(2, 3, 4); scene.add(key);
  const back = new THREE.DirectionalLight('#ffffff', 1.9); back.position.set(-1.5, 3, -4); scene.add(back);

  const body = new THREE.Group();
  const S = 0.02; // 93 unités → 1,86 m
  body.scale.set(S, -S, S); // l'axe Y du dessin pointe vers le bas
  scene.add(body);
  const parts = [];
  const bevel = (depth) => ({ depth, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.18, bevelSegments: 3, curveSegments: 10 });
  const mat = (c, emissive) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, emissive: emissive ? c : 0x000000, emissiveIntensity: emissive ? 0.18 : 0 });

  const fb = bbox(map.front), bb = bbox(map.back);
  const fc = (fb.min.x + fb.max.x) / 2, bc = (bb.min.x + bb.max.x) / 2, cy = (fb.min.y + fb.max.y) / 2;

  const front = new THREE.Group(); front.position.set(-fc, -cy, 0); body.add(front);
  // Vue de dos : groupe retourné (son +x local pointe vers -x, son +z vers l'arrière du corps)
  const rearTurn = new THREE.Group(); rearTurn.rotation.y = Math.PI; body.add(rearTurn);
  const rear = new THREE.Group(); rear.position.set(-bc, -cy, 0); rearTurn.add(rear);

  for (const [id, d] of map.front) {
    const hz = half(id), v = zoneValue(id, intensity);
    for (const s of shapesOf(d)) {
      const core = new THREE.Mesh(new THREE.ExtrudeGeometry(s, bevel(2 * hz - 1.2)), mat(CORE));
      core.position.z = -(hz - 0.6); front.add(core);
      const skin = new THREE.Mesh(new THREE.ExtrudeGeometry(s, bevel(0.5)), mat(colorOf(v), v > 0));
      skin.position.z = hz - 0.6; skin.userData.zone = id; front.add(skin); parts.push(skin);
    }
  }
  for (const [id, d] of map.back) {
    const hz = half(id), v = zoneValue(id, intensity);
    for (const s of shapesOf(d)) {
      const skin = new THREE.Mesh(new THREE.ExtrudeGeometry(s, bevel(0.5)), mat(colorOf(v), v > 0));
      skin.position.z = hz - 0.6;
      skin.userData.zone = id; rear.add(skin); parts.push(skin);
    }
  }

  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.95; scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enablePan = false; controls.enableDamping = true;
  controls.minDistance = 1.4; controls.maxDistance = 6;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.4;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  const label = document.createElement('div'); label.className = 'body-label'; container.appendChild(label);
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  let down;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const [m] = zoneMuscle(ray.intersectObjects(parts)[0]?.object.userData.zone || '');
    label.textContent = m ? `${MUSCLES_FR[m]} · ${Math.round((intensity[m] || 0) * 100)}%` : '';
    label.classList.toggle('show', !!m);
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
    body.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    renderer.dispose();
  }
  loop();
  // Bascule face / dos
  const setSide = (side) => { controls.autoRotate = false; const d = camera.position.length(); camera.position.set(0, 0.25, side === 'back' ? -d : d); controls.update(); };
  return { dispose, setSide };
}
