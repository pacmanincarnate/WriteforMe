import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sidebar.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/components.css';
import { STORAGE_KEYS } from '@/config';
import { installDefaultAudioStageLoggers } from '@/services/audio';
import './windowApi';

installDefaultAudioStageLoggers();
import './App';

// Strip the cache-busting query parameter added by performHardReloadUpdate().
try {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('_ep_updated')) {
        currentUrl.searchParams.delete('_ep_updated');
        window.history.replaceState(null, '', currentUrl.toString());
    }
} catch {
    // Ignore history API restrictions (e.g. file:// or sandboxed frames)
}

window.addEventListener('vite:preloadError', (event) => {
    try {
        const lastReload = sessionStorage.getItem(STORAGE_KEYS.preloadReloadOnce);
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 30000) {
            sessionStorage.setItem(STORAGE_KEYS.preloadReloadOnce, String(now));
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
