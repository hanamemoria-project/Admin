const CACHE = 'hana-memoria-v2';

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

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Hana Memoria', body: 'Ada pesanan baru!' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png',
    badge: 'https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png'
  }));
});
