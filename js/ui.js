// Composants d'interface partagés : modale, toast, son, vibration
import { $ } from './store.js';

export function toast(msg, ms = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Ouvre une feuille modale. `render(body, close)` remplit le contenu.
export function openSheet(title, render, { full = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">
      <header class="sheet-head"><h2></h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
      <div class="sheet-body"></div></div>`;
  wrap.querySelector('h2').textContent = title;
  const close = () => { if (!wrap.isConnected || wrap.dataset.closing) return; wrap.dataset.closing = '1'; onClose && onClose(); wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 250); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  render(wrap.querySelector('.sheet-body'), close);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

export function confirmDialog(msg, okLabel = 'Confirmer') {
  return new Promise((resolve) => {
    let result = false;
    openSheet('Confirmation', (body, close) => {
      body.innerHTML = `<p class="mb"></p><div class="row gap end"><button class="btn ghost" data-no>Annuler</button><button class="btn danger" data-yes></button></div>`;
      body.querySelector('p').textContent = msg;
      body.querySelector('[data-yes]').textContent = okLabel;
      body.querySelector('[data-no]').onclick = close;
      body.querySelector('[data-yes]').onclick = () => { result = true; close(); };
    }, { onClose: () => resolve(result) });
  });
}

let audioCtx;
export function beep(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = i === times - 1 ? 1320 : 880;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    }
  } catch (e) { /* pas de son disponible */ }
}
// Débloque l'audio sur iOS au premier toucher
export function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
}
export const vibrate = (p = [200, 100, 200]) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

// Notification locale via le service worker (fonctionne si l'app est installée / ouverte)
export async function localNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const opts = { body, tag, icon: './icons/icon-192.png', badge: './icons/badge-96.png', vibrate: [200, 100, 200], renotify: !!tag };
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    return true;
  } catch (e) { console.warn(e); return false; }
}

// Chargement à la demande des bibliothèques lourdes
const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src, onload: res, onerror: () => { delete loaded[src]; rej(new Error('Chargement impossible : ' + src)); } });
    document.head.appendChild(s);
  }));
}
export function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

export const timeAgo = (t) => {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} jours`;
};
