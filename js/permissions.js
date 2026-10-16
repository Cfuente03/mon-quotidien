// Autorisations (caméra, micro, localisation, notifications) + dictée vocale
import { $, esc } from './store.js';
import { toast } from './ui.js';

const PERMS = [
  { key: 'camera', name: 'camera', icon: '📷', label: 'Appareil photo', why: 'Scanner les codes-barres et photographier vos repas.' },
  { key: 'microphone', name: 'microphone', icon: '🎤', label: 'Micro', why: 'Dicter vos activités, recherches et adresses.' },
  { key: 'geolocation', name: 'geolocation', icon: '📍', label: 'Localisation', why: 'Carte, itinéraires, restaurants proches et météo.' },
  { key: 'notifications', name: 'notifications', icon: '🔔', label: 'Notifications', why: 'Rappels, fin du temps de repos.' },
];

export async function permState(name) {
  if (name === 'notifications') return 'Notification' in window ? ({ default: 'prompt' }[Notification.permission] || Notification.permission) : 'unsupported';
  try { return (await navigator.permissions.query({ name })).state; } catch { return 'unknown'; }
}

export async function requestPerm(key) {
  try {
    if (key === 'camera' || key === 'microphone') {
      const s = await navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: { facingMode: 'environment' } } : { audio: true });
      s.getTracks().forEach((t) => t.stop());
    } else if (key === 'geolocation') {
      await getPosition();
    } else if (key === 'notifications') {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('refusé');
    }
    return true;
  } catch (e) { toast(`Accès refusé : ${e.message || e.name}`); return false; }
}

export function getPosition(opts = {}) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Localisation non disponible'));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), (e) => rej(new Error(e.message || 'Position introuvable')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...opts });
  });
}

const LABEL = { granted: '✅ Autorisé', denied: '⛔ Bloqué', prompt: '❔ À demander', unknown: '❔', unsupported: 'Non disponible' };

export async function renderPermissions(root) {
  const states = await Promise.all(PERMS.map((p) => permState(p.name)));
  root.innerHTML = `
    <h1 class="page-title">Autorisations</h1>
    <p class="small muted mb">L'application demande uniquement ce dont elle a besoin. Rien n'est envoyé à un serveur, sauf vos recherches de carte, d'aliments et les photos analysées par l'IA (si vous l'activez).</p>
    <div class="list">${PERMS.map((p, i) => `
      <article class="item" style="--cc:var(--primary)">
        <div class="perm-ico">${p.icon}</div>
        <div class="grow"><div class="item-title">${p.label}</div><div class="small muted">${p.why}</div><div class="small">${LABEL[states[i]] || esc(states[i])}</div></div>
        ${states[i] === 'granted' ? '' : `<button class="btn primary small" data-req="${p.key}">Autoriser</button>`}
      </article>`).join('')}</div>
    <p class="small muted mt">Une autorisation bloquée se réactive dans les réglages du téléphone : <b>iPhone</b> → Réglages → Safari (ou l'app) ; <b>Android</b> → appui long sur l'icône → Infos sur l'appli → Autorisations.</p>`;
  root.onclick = async (e) => {
    const k = e.target.closest('[data-req]')?.dataset.req;
    if (k && (await requestPerm(k))) { toast('Autorisation accordée'); renderPermissions(root); }
  };
}

// ---------- Dictée vocale ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

// Ajoute un bouton 🎤 à droite d'un champ texte
export function attachVoice(input, onDone) {
  if (!SR || !input || input.dataset.voice) return;
  input.dataset.voice = '1';
  const wrap = document.createElement('div');
  wrap.className = 'voice-wrap';
  input.replaceWith(wrap);
  wrap.append(input);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'voice-btn'; b.textContent = '🎤'; b.setAttribute('aria-label', 'Dicter');
  wrap.append(b);
  let rec;
  b.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.maxAlternatives = 1;
    const base = input.value ? input.value + ' ' : '';
    b.classList.add('on');
    rec.onresult = (ev) => {
      input.value = base + [...ev.results].map((r) => r[0].transcript).join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Micro refusé' : 'Dictée indisponible');
    rec.onend = () => { b.classList.remove('on'); rec = null; onDone?.(input.value); };
    rec.start();
  };
}
