/// <reference lib="webworker" />
/**
 * EllipsisProse service worker (offline support).
 *
 * This file is the SOURCE. `npm run build` compiles it to `dist/sw.js` and replaces
 * `self.__WB_MANIFEST` below with the list of every file in `dist/`, each with a content hash.
 * The portable single-file build does not include a worker.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT TO UPDATE, AND WHEN
 * ---------------------------------------------------------------------------------------------
 * Ordinary releases (code, styles, icons, new lazy-loaded chunks): NOTHING. The file list is
 *   regenerated on every build, so a changed file gets a new hash, the browser sees a different
 *   `sw.js`, installs it in the background and swaps it in. Do not hand-edit a file list.
 *
 * You add a file TYPE the app must have offline (for example `.svg`, `.woff2`, `.wasm`):
 *   add the extension to `PRECACHE_GLOBS` in `vite.config.ts`. `npm run build` fails with the
 *   name of the missing file until you do (scripts/check-precache.mjs).
 *
 * You load something from a NEW external host that should work offline (a font or library CDN):
 *   add the host to `RUNTIME_CACHE_HOSTS` below. Only add hosts that serve version-pinned,
 *   immutable files. Never add an LLM, image or embedding API host.
 *
 * You change a pinned version on one of those hosts, or change the caching rules in this file:
 *   bump `RUNTIME_CACHE` (v1 -> v2). The old runtime cache is deleted when the new worker
 *   activates.
 *
 * You move the site (new domain or a different sub-path): nothing here. All paths are relative
 *   to wherever `sw.js` is served from. Users on the old address keep their old data there;
 *   browser storage is per-address and cannot follow them.
 *
 * NEVER rename `sw.js`, and never serve it with long-lived caching. Browsers find the update by
 *   re-downloading the same URL. A renamed worker leaves the old one installed forever.
 *
 * ---------------------------------------------------------------------------------------------
 * USER DATA
 * ---------------------------------------------------------------------------------------------
 * Stories, settings, images and audio live in IndexedDB and localStorage. This worker only ever
 * touches Cache Storage, and only caches whose names it owns (see `isOwnedCache`). It must never
 * open, clear or migrate IndexedDB / localStorage, and must never call
 * `registration.unregister()` or `caches.delete()` on a name it does not own.
 *
 * ---------------------------------------------------------------------------------------------
 * STRATEGY
 * ---------------------------------------------------------------------------------------------
 *   - Page loads: network first, falling back to the precached page after a short timeout. An
 *     online user always gets the newest deploy on the next load and can never be pinned to a
 *     stale build; an offline user gets the last build that finished installing.
 *   - Built files (everything in dist/): precached, served from cache.
 *   - Pinned external libraries and fonts: cache first.
 *   - `/api/*` (Local Disk Vault), non-GET requests, and every other host (LLM / image /
 *     embedding APIs): not handled at all; the browser talks straight to the network.
 */

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

/** Bump the suffix when a pinned external version or a caching rule below changes. */
const RUNTIME_CACHE = 'ellipsisprose-runtime-v1';

/** Hosts serving version-pinned, immutable files the app needs offline. Never API hosts. */
const RUNTIME_CACHE_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'esm.sh', // kokoro-js + transformers.js (in-browser TTS)
    'cdn.jsdelivr.net' // lamejs MP3 encoder worker
];

/** How long a page load waits for the network before using the offline copy. */
const NAVIGATION_NETWORK_TIMEOUT_MS = 4000;

/** Caches created by the pre-Workbox worker (`ellipsisprose-static-v1`, `-v2`). */
const LEGACY_CACHE_PREFIX = 'ellipsisprose-static-';
const RUNTIME_CACHE_PREFIX = 'ellipsisprose-runtime-';

const isOwnedCache = (name: string): boolean =>
    name.startsWith(LEGACY_CACHE_PREFIX) || name.startsWith(RUNTIME_CACHE_PREFIX);

const isApiRequest = (url: URL): boolean =>
    url.origin === self.location.origin && url.pathname.startsWith('/api/');

self.addEventListener('install', () => {
    // Safe because page loads are network-first: activating at once never serves a stale shell.
    void self.skipWaiting();
});

self.addEventListener('message', (event) => {
    const data = event.data as { type?: string } | null;
    if (data && data.type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names.filter((name) => isOwnedCache(name) && name !== RUNTIME_CACHE).map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

async function fetchWithTimeout(request: Request, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Page loads. Registered before the precache route so that it wins for navigations.
registerRoute(
    ({ request, url }) => request.mode === 'navigate' && !isApiRequest(url),
    async ({ request }) => {
        try {
            const response = await fetchWithTimeout(request, NAVIGATION_NETWORK_TIMEOUT_MS);
            if (response.ok) return response;
            throw new Error(`Navigation responded ${response.status}`);
        } catch (err) {
            const offlinePage = await matchPrecache('index.html');
            if (offlinePage) return offlinePage;
            throw err;
        }
    }
);

// Every file in dist/. The list is injected at build time.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Pinned external libraries and fonts.
registerRoute(
    ({ request, url }) => request.method === 'GET' && RUNTIME_CACHE_HOSTS.includes(url.hostname),
    new CacheFirst({
        cacheName: RUNTIME_CACHE,
        plugins: [
            {
                // Cross-origin responses without CORS are opaque (status 0); keep them, as the old worker did.
                cacheWillUpdate: async ({ response }) =>
                    response.ok || response.type === 'opaque' ? response : null
            }
        ]
    })
);
