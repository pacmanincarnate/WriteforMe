/*
 * EllipsisProse service worker.
 *
 * Strategy is deliberately conservative because ALL user data lives client-side
 * (IndexedDB + localStorage) and there is no server to force-refresh from:
 *   - App shell (navigations / index.html): NETWORK-FIRST, cache only as the
 *     offline fallback - a deploy is always picked up on the next online load,
 *     so users can never be pinned to a stale build.
 *   - Pinned CDN libraries, fonts, and local static assets: cache-first
 *     (every CDN dependency is version-pinned in index.html, so entries are
 *     immutable; bump CACHE_VERSION when changing a pin).
 *   - Everything else (LLM/embedding/image APIs): untouched - the browser
 *     talks straight to the network.
 */

const CACHE_VERSION = 'ellipsisprose-static-v1';

const OFFLINE_URLS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-192.png',
    './icon-maskable-512.png',
    './ELPIcon2.jpg',
    './favicon-32x32.png',
    './favicon-16x16.png'
];

const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'unpkg.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(OFFLINE_URLS))
            .catch((err) => console.warn('[SW] Precache failed (continuing):', err))
    );
    // Safe with network-first HTML: activating immediately never serves a stale shell.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // App shell: network-first, offline fallback from cache.
    if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.endsWith('/index.html'))) {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
                    return res;
                })
                .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
        );
        return;
    }

    // Version-pinned CDN libraries + local static assets: cache-first.
    const isCdn = CDN_HOSTS.includes(url.hostname);
    const isLocalStatic = url.origin === self.location.origin;
    if (isCdn || isLocalStatic) {
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                if (res.ok || res.type === 'opaque') {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
                }
                return res;
            }))
        );
    }
    // Anything else (API calls) falls through untouched.
});
