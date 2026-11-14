/* Service Worker — Lumi: O Código da Luz
   Mantém os arquivos principais em cache para o jogo funcionar offline. */
const CACHE = 'lumi-v2';
const FILES = ['./', './index.html', './jsQR.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase e outros domínios passam direto
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
