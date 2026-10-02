// Service worker: permite instalar el juego como app, abrirlo con mala conexión y recibir avisos.
// Estrategia «primero la red»: siempre se intenta la versión nueva y solo sin conexión se usa la copia.

const CACHE = 'dominio-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname === '/health') return;
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(event.request, { ignoreSearch: url.pathname === '/' });
      if (cached) return cached;
      throw new Error('Sin conexión');
    }
  })());
});

// Aviso que llega del servidor (te atacan, tu turno en la ONU, mensaje privado...).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Dominio Global', body: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Dominio Global', {
    body: data.body ?? '',
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url ?? '/' },
  }));
});

// Al tocar el aviso se abre (o se enfoca) el juego en esa partida.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        w.postMessage({ type: 'open', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
