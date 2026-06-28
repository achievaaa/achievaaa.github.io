/* Achieva — Service Worker
   Bump CACHE_VERSION every time you deploy changes, so users get
   the fresh files instead of an old cached copy. */
const CACHE_VERSION = 'achieva-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Push Notifications ── */
self.addEventListener('push', (event) => {
  let data = { title: 'Achieva', body: 'Ada update baru!' };
  try { data = event.data.json(); } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'achieva-buddy',
      renotify: true,
      data: { url: self.location.origin }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

/* Network-first for navigation (so updates show up fast),
   cache-first for everything else (fonts, icons, etc), with offline fallback. */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
