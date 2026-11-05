// Unrot service worker: the app shell works offline; the API never comes from cache.
const VERSION = 'unrot-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Page loads: network first so updates arrive, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Hashed build assets and fonts never change: cache first.
  const immutable = (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) || url.hostname.endsWith('gstatic.com');
  if (immutable || url.hostname.endsWith('googleapis.com')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
