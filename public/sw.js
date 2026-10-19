// Public app-shell assets only. Never cache authentication, session or vault APIs.
const CACHE = 'drip-shell-v15';
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
  if (event.data?.type === 'DRIP_WORKER_VERSION') event.ports[0]?.postMessage({ version: 3 });
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('drip-') && k !== CACHE).map(k => caches.delete(k)));
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
    const response = await fetch(req);
    if (response.ok && !response.redirected) await cache.put(req, response.clone());
    return response;
  })());
});
