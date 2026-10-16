// Service worker : fonctionnement hors-ligne + affichage des notifications
const VERSION = 'mq-v2';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/calendar.js', './js/sport.js', './js/reminders.js',
  './js/exercises.js', './js/body3d.js', './js/chart.js', './js/config.js', './js/lock.js', './js/permissions.js',
  './js/nutrition.js', './js/map.js', './js/jobs.js', './js/subs.js', './js/weather.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/zxing.min.js', './vendor/anthropic-sdk.mjs',
  './vendor/three.module.min.js', './vendor/OrbitControls.js', './data/exercises.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'mq-images').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Images d'exercices (GitHub) : cache d'abord, conservées pour l'usage hors-ligne
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open('mq-images').then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Fichiers de l'app : réseau d'abord (mises à jour), cache en secours
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});

// Clic sur une notification : ouvre / ramène l'application
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const go = e.notification.tag === 'rest' ? 'sport' : 'reminders';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ go }); return c.focus(); } }
    return self.clients.openWindow(`./index.html#${go}`);
  }));
});

// Prêt pour un futur serveur Web Push
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Mon Quotidien', body: 'Rappel' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: './icons/icon-192.png', badge: './icons/badge-96.png' }));
});
