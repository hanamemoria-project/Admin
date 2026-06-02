const CACHE = 'hana-memoria-v4';
const LOGO = 'https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

/* Push dari server */
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Hana Memoria', body: 'Ada pesanan baru!' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: LOGO,
    badge: LOGO,
    vibrate: [200, 100, 200]
  }));
});

/* Klik notifikasi → buka / fokus tab */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('hanamemoria') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
