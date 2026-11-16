/* Lumi cache is confined to this game. Never cache API responses or touch other apps. */
const CACHE_PREFIX = 'verdano-lumi-';
const CACHE = CACHE_PREFIX + 'v3';
const FILES = ['./', './index.html', './jsQR.js', './manifest.json', './icon-192.png', './icon-512.png'];
const FILE_URLS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith(CACHE_PREFIX) || /^lumi-v\d+$/.test(key)) && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;
  url.search = '';
  if (!FILE_URLS.has(url.href)) return;
  // Network-first HTML permits updates while retaining offline play.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.href, copy)));
        return response;
      }
      return caches.match(url.href).then(hit => hit || response);
    }).catch(() => caches.match(url.href)));
    return;
  }
  event.respondWith(caches.match(url.href).then(hit => hit || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.href, copy)));
    }
    return response;
  })));
});
