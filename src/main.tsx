import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sidebar.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/components.css';
import './legacy/setupGlobals';
import './legacy/registerFoundationGlobals';
import './legacy/MonolithApp.jsx';

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
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('./sw.js')
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
