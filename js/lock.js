// Verrouillage par mot de passe (vérifié sur l'appareil, demandé une fois par mois par défaut)
import { LOCK } from './config.js';

const KEY = 'mon-quotidien-lock';
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

function readLock() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function writeLock(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

// Hash PBKDF2-SHA256 (210 000 itérations) au format "sel:hash"
export async function hashPassword(pw, saltHex) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256);
  return `${hex(salt)}:${hex(bits)}`;
}
async function verify(pw, stored) {
  const [salt] = stored.split(':');
  const h = await hashPassword(pw, salt);
  let diff = 0; for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0 && h.length === stored.length;
}

const period = () => readLock().period || LOCK.period || 'month';
function periodKey(p = period()) {
  const d = new Date();
  if (p === 'always') return 'session';
  if (p === 'day') return d.toISOString().slice(0, 10);
  return `${d.getFullYear()}-${d.getMonth() + 1}`; // mois
}
// Le mot de passe défini dans js/config.js est prioritaire (identique sur tous vos appareils)
const storedHash = () => LOCK.hash || readLock().hash;

function isUnlocked() {
  const l = readLock();
  if (period() === 'always') return sessionStorage.getItem(KEY) === '1';
  return l.unlocked === periodKey() && l.unlockedHash === storedHash();
}
function markUnlocked() {
  const l = readLock();
  writeLock({ ...l, unlocked: periodKey(), unlockedHash: storedHash() });
  sessionStorage.setItem(KEY, '1');
}

export function lockNow() {
  const l = readLock(); delete l.unlocked; writeLock(l);
  sessionStorage.removeItem(KEY); location.reload();
}
export const lockInfo = () => ({ fromConfig: !!LOCK.hash, hasPassword: !!storedHash(), period: period() });
export function setPeriod(p) { writeLock({ ...readLock(), period: p }); markUnlocked(); }
export async function changePassword(pw) { writeLock({ ...readLock(), hash: await hashPassword(pw) }); markUnlocked(); }

// Affiche l'écran de verrouillage si nécessaire ; résout quand l'app est déverrouillée
export function ensureUnlocked() {
  if (storedHash() && isUnlocked()) return Promise.resolve();
  const creating = !storedHash();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <form class="lock-box">
        <img src="icons/icon-192.png" alt="" width="72" height="72">
        <h1>Mon Quotidien</h1>
        <p class="muted">${creating ? 'Créez votre mot de passe. Il sera demandé une fois par mois sur cet appareil.' : 'Entrez votre mot de passe'}</p>
        <input type="password" name="pw" autocomplete="${creating ? 'new-password' : 'current-password'}" placeholder="Mot de passe" required minlength="4">
        ${creating ? '<input type="password" name="pw2" autocomplete="new-password" placeholder="Confirmer le mot de passe" required minlength="4">' : ''}
        <p class="lock-err" aria-live="polite"></p>
        <button class="btn primary block">${creating ? 'Créer et entrer' : 'Déverrouiller'}</button>
        ${creating ? '<p class="small muted">⚠️ Aucun moyen de le récupérer : notez-le.</p>' : '<button type="button" class="link small" data-forgot>Mot de passe oublié ?</button>'}
      </form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('.lock-err');
    setTimeout(() => f.elements.pw.focus(), 50);
    let tries = 0;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const pw = f.elements.pw.value;
      const btn = f.querySelector('button.primary'); btn.disabled = true;
      try {
        if (creating) {
          if (pw !== f.elements.pw2.value) { err.textContent = 'Les mots de passe ne correspondent pas.'; return; }
          writeLock({ ...readLock(), hash: await hashPassword(pw) });
        } else if (!(await verify(pw, storedHash()))) {
          tries++;
          err.textContent = 'Mot de passe incorrect.';
          f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
          if (tries >= 5) { btn.textContent = 'Patientez 30 s…'; await new Promise((r) => setTimeout(r, 30000)); tries = 0; btn.textContent = 'Déverrouiller'; }
          return;
        }
        markUnlocked(); el.remove(); resolve();
      } finally { btn.disabled = false; }
    };
    el.querySelector('[data-forgot]')?.addEventListener('click', () => {
      if (LOCK.hash) { alert('Le mot de passe est défini dans js/config.js : modifiez-le sur GitHub (voir README).'); return; }
      if (confirm('Sans le mot de passe, la seule solution est d\'effacer toutes les données de l\'application sur cet appareil. Continuer ?')) {
        localStorage.clear(); sessionStorage.clear(); location.reload();
      }
    });
  });
}
