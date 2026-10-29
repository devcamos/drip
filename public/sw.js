// Public app-shell assets only. Never cache authentication, session or vault APIs.
importScripts('/sw-build.js');
const CACHE = `drip-shell-${self.DRIP_BUILD_ID}`;
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/fonts/DM-Sans.ttf'];
const isAsset = path => path.startsWith('/_next/static/') || path.startsWith('/fonts/') || SHELL.includes(path);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch('/', { cache: 'reload' });
    const html = await page.clone().text();
    if (!page.ok || !html.includes('<title>Drip</title>')) throw new Error('App shell unavailable');
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g)].map(m => m[1]);
    await cache.addAll([...new Set([...SHELL.filter(x => x !== '/'), ...assets])]);
    await cache.put('/', page);
  })());
});
self.addEventListener('message', event => {
  if (event.origin !== self.location.origin) return;
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'DRIP_WORKER_VERSION') event.ports[0]?.postMessage({ version: 4 });
});

// Web Push is user-visible and deliberately excludes account names and figures.
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || !['payment-reminder', 'notification-test'].includes(payload.type) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return;
  const test = payload.type === 'notification-test';
  event.waitUntil(self.registration.showNotification(test ? 'Drip notification test' : 'Drip payment reminder', {
    body: test ? 'Phone notifications are working on this device.' : 'A payment is expected today. Open Drip to check and log what arrived.',
    tag: test ? 'drip-payment-test' : `drip-payment-${payload.date}`, icon: '/icon-192.png', badge: '/icon-192.png',
  }));
});
self.addEventListener('notificationclick', event => {
  if (!event.notification.tag?.startsWith('drip-payment-')) return;
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/?tab=payments', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => { const url = new URL(client.url); return url.origin === self.location.origin && url.pathname === '/'; });
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'DRIP_OPEN_PAYMENTS' });
    } else await self.clients.openWindow(target);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Another open tab may still need its previous build's immutable chunks.
    // Reclaim old public shells on a later activation with no other open tab.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length <= 1) await Promise.all(keys.filter(k => k.startsWith('drip-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(req).catch(async () => (await caches.open(CACHE)).match('/')));
    return;
  }
  if (!isAsset(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE); const hit = await cache.match(req);
    if (hit) return hit;
    if (url.pathname.startsWith('/_next/static/')) {
      for (const name of (await caches.keys()).filter(k => k.startsWith('drip-shell-') && k !== CACHE)) {
        const previous = await (await caches.open(name)).match(req);
        if (previous) return previous;
      }
    }
    const response = await fetch(req);
    if (response.ok && !response.redirected) await cache.put(req, response.clone());
    return response;
  })());
});
