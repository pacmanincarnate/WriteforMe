import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sidebar.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/components.css';
import './legacy/setupGlobals';
import './legacy/registerFoundationGlobals';
import './legacy/registerDomainGlobals';
import './legacy/registerServiceGlobals';
import './legacy/registerStoreGlobals';
import './legacy/registerPipelineGlobals';
import './legacy/registerUiGlobals';
import './App';

const PRELOAD_RELOAD_GUARD_KEY = 'ellipsisprose_preload_reload_once';

window.addEventListener('vite:preloadError', (event) => {
    try {
        const lastReload = sessionStorage.getItem(PRELOAD_RELOAD_GUARD_KEY);
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 30000) {
            sessionStorage.setItem(PRELOAD_RELOAD_GUARD_KEY, String(now));
            event.preventDefault();
            window.location.reload();
        }
    } catch {
        // Ignore storage restrictions
    }
});

if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    // The worker is built from src/sw.ts (see its header for what to update and when). It exists
    // only in the production multi-file build: not under `npm run dev`, not in the portable file.
    if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_SINGLEFILE) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                // Same URL as the old hand-written worker, so existing installs update in place.
                .register('./sw.js', { updateViaCache: 'none' })
                .then((reg) => {
                    console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
                })
                .catch((err) => {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });
        });
    }
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage
            .persisted?.()
            .then((alreadyPersisted) => (alreadyPersisted ? true : navigator.storage.persist()))
            .then((granted) => {
                console.log(`[Storage] Persistent browser storage ${granted ? 'granted' : 'not granted (best-effort)'}.`);
            })
            .catch(() => {});
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPWAInstallPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-installable'));
    console.log('[PWA] App is ready for installation');
});

window.addEventListener('appinstalled', () => {
    window.deferredPWAInstallPrompt = null;
    console.log('[PWA] EllipsisProse was installed successfully');
});
