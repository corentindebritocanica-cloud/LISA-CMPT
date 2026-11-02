// sw.js — Service worker : garde l'interface disponible hors ligne.
// Les données passent par le cache local de Firestore, jamais par ce cache.
const VERSION = 'compta-lisa-v3';
const COQUILLE = ['./', './index.html', './css/app.css', './js/app.js', './js/calc.js', './js/format.js', './js/donnees.js', './js/defauts.js', './js/config.js',
  './vendor/firebase-13.1.0/firebase-app.js', './vendor/firebase-13.1.0/firebase-auth.js', './vendor/firebase-13.1.0/firebase-firestore.js', './icone.svg', './manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSION).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Firebase : jamais mis en cache ici
  // Réseau d'abord (mises à jour immédiates), cache si hors ligne
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
