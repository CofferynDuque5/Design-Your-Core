/* Alarmas del panel (Web Push): suenan y se muestran aunque el panel esté cerrado.
   Lo carga el service worker de la app (vite.config.ts → workbox.importScripts). */
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: event.data ? event.data.text() : '' };
  }
  const title = d.title || 'Design Your Core';
  const body = d.body || '';
  const url = d.url || '/';
  const tag = d.tag || 'dyc-alarma';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = wins.find((w) => w.visibilityState === 'visible');
      // Con el panel a la vista, la alarma suena dentro del panel.
      if (visible) {
        visible.postMessage({ type: 'dyc-alarm', id: tag, title, body, url });
        return;
      }
      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [600, 300, 600, 300, 600],
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) await w.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
