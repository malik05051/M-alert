/* M-Alert — service worker : notifications push quand l'application est fermée. */
'use strict';

const LEVELS = { 1: 'Information', 2: 'Jaune', 3: 'Orange', 4: 'Rouge', 5: 'Majeure' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (_) { /* contenu illisible */ }
    const alert = data.alert;
    const notice = data.notice;
    if (!alert && !notice) return;

    // Si M-Alert est ouvert et visible, l'alerte est déjà affichée via la connexion temps réel.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((c) => c.visibilityState === 'visible')) return;

    // Notification de M-Alert : simple message, sans alerte.
    if (notice) {
      const deps = notice.departments.includes('ALL') ? 'Toute la France' : notice.departments.join(', ');
      await self.registration.showNotification(`${notice.test ? '[TEST] ' : ''}🔔 ${notice.title}`, {
        body: notice.body || deps,
        tag: `notice-${notice.id}`,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { notice: notice.id },
      });
      return;
    }
    // Alerte silencieuse : aucune notification (le serveur n'en envoie pas, par sécurité).
    if (alert.silent) return;

    const deps = alert.departments.includes('ALL') ? 'Toute la France' : alert.departments.join(', ');
    let title;
    let body;
    if (data.type === 'cancel') {
      title = `Alerte levée — ${alert.title}`;
      body = `Départements : ${deps}`;
    } else {
      const prefix = (alert.test ? '[TEST] ' : '') + (data.type === 'update' ? 'Mise à jour · ' : '');
      const levelText = (alert.category === 'tsunami' || alert.category === 'seisme' || ((alert.category || 'meteo') === 'meteo' && Number(alert.phenomenon) === 10)) && alert.levelName
        ? alert.levelName // « Avis de tsunami », « Alerte séisme élevé »…
        : alert.level === 1 ? 'Information' : alert.level === 5 ? 'ALERTE MAJEURE' : 'Alerte ' + LEVELS[alert.level];
      title = `${prefix}${levelText} — ${alert.title}`;
      body = `Départements : ${deps}\n${alert.description}`;
    }
    await self.registration.showNotification(title, {
      body,
      tag: alert.id,
      renotify: data.type !== 'cancel',
      requireInteraction: data.type !== 'cancel' && alert.level >= 3,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: alert.level >= 3 ? [400, 200, 400, 200, 800] : [200, 100, 200],
      data: { id: alert.id },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.id;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows[0];
    if (client) {
      await client.focus();
      client.postMessage({ type: 'open-alert', id });
    } else {
      await self.clients.openWindow('./');
    }
  })());
});
