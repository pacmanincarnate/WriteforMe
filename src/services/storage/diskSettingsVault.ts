/**
 * @module services/storage/diskSettingsVault
 * Mirrors browser `localStorage` settings (`gemini_api_key`, `ellipsisprose_*`, `kokoro_*`)
 * to the local Node disk vault (`/api/storage/settings`) when available, and hydrates
 * browser storage before React mounts.
 */

import { STORAGE_KEYS, STORAGE_PREFIXES } from '@/config';
import { isLocalStorageVaultAvailable, probeLocalVaultAvailability } from './vaultDetector';

export const DISK_SETTINGS_EXCLUDED_KEYS = new Set<string>([
    STORAGE_KEYS.story,
    STORAGE_KEYS.openRouterModelsCache,
    STORAGE_KEYS.nanoGptModelsCache,
    STORAGE_KEYS.ragFingerprint
]);

export const DISK_SETTINGS_API_KEY_NAMES = new Set<string>([
    STORAGE_KEYS.geminiApiKey,
    STORAGE_KEYS.openRouterKey,
    STORAGE_KEYS.nanoGptKey,
    STORAGE_KEYS.imageApiKey
]);

export function isPersistableSettingsKey(key: unknown): key is string {
    return (
        typeof key === 'string' &&
        key.length > 0 &&
        key.length <= 200 &&
        !DISK_SETTINGS_EXCLUDED_KEYS.has(key) &&
        (key === STORAGE_KEYS.geminiApiKey ||
            key.startsWith(STORAGE_PREFIXES.app) ||
            key.startsWith(STORAGE_PREFIXES.kokoro))
    );
}

interface DiskStorageWindowGlobals {
    __ellipsisRawLocalStorageSetItem?: Storage['setItem'];
    __ellipsisRawLocalStorageRemoveItem?: Storage['removeItem'];
    __ellipsisDiskSettingsHooked?: boolean;
}

const getRawStorageMethods = (): {
    setItem: Storage['setItem'] | null;
    removeItem: Storage['removeItem'] | null;
} => {
    if (typeof window === 'undefined' || typeof Storage === 'undefined' || !Storage.prototype) {
        return { setItem: null, removeItem: null };
    }
    const win = window as unknown as DiskStorageWindowGlobals;
    const setItem =
        win.__ellipsisRawLocalStorageSetItem ||
        (win.__ellipsisRawLocalStorageSetItem = Storage.prototype.setItem);
    const removeItem =
        win.__ellipsisRawLocalStorageRemoveItem ||
        (win.__ellipsisRawLocalStorageRemoveItem = Storage.prototype.removeItem);
    return { setItem, removeItem };
};

export interface DiskSettingsVault {
    hydrateBeforeMount: () => Promise<boolean>;
    queueChange: (key: string, valueOrNull: string | null) => void;
    flush: (useKeepalive?: boolean) => Promise<boolean>;
    isReady: () => boolean;
}

export const diskSettingsVault: DiskSettingsVault = (() => {
    const MAX_SETTING_CHARS = 262144;
    let ready = false;
    let lastSynced: Record<string, string> = Object.create(null) as Record<string, string>;
    let pendingPatch: Record<string, string | null> = Object.create(null) as Record<
        string,
        string | null
    >;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const canUseHttpVault = (): boolean => isLocalStorageVaultAvailable();

    const flush = async (useKeepalive = false): Promise<boolean> => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (!ready || !canUseHttpVault()) return false;
        const keys = Object.keys(pendingPatch);
        if (keys.length === 0) return true;

        const patch = { ...pendingPatch };
        pendingPatch = Object.create(null) as Record<string, string | null>;

        try {
            const res = await fetch('/api/storage/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: patch }),
                keepalive: Boolean(useKeepalive)
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            for (const [k, v] of Object.entries(patch)) {
                if (v === null) {
                    delete lastSynced[k];
                } else {
                    lastSynced[k] = v;
                }
            }
            return true;
        } catch (err) {
            for (const [k, v] of Object.entries(patch)) {
                if (!(k in pendingPatch)) {
                    pendingPatch[k] = v;
                }
            }
            if (!useKeepalive) {
                console.warn('[DiskSettingsVault] Failed to sync settings to disk:', err);
            }
            return false;
        }
    };

    const queueChange = (key: string, valueOrNull: string | null): void => {
        if (!ready || !canUseHttpVault() || !isPersistableSettingsKey(key)) return;
        if (
            valueOrNull !== null &&
            (typeof valueOrNull !== 'string' || valueOrNull.length > MAX_SETTING_CHARS)
        ) {
            return;
        }

        if (valueOrNull === null) {
            if (!(key in lastSynced) && !(key in pendingPatch)) return;
            pendingPatch[key] = null;
        } else {
            if (lastSynced[key] === valueOrNull && !(key in pendingPatch)) return;
            pendingPatch[key] = valueOrNull;
        }

        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            void flush(false);
        }, 200);
    };

    const hydrateBeforeMount = async (): Promise<boolean> => {
        const available = await probeLocalVaultAvailability();
        if (!available) return false;

        let res: Response | null;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
        try {
            res = await fetch('/api/storage/settings', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
        } catch {
            return false;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        if (!res || !res.ok) return false;
        const data = (await res.json().catch(() => null)) as {
            ok?: unknown;
            settings?: unknown;
        } | null;
        if (!data || data.ok !== true) return false;

        const diskSettings =
            data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
                ? (data.settings as Record<string, unknown>)
                : {};

        lastSynced = Object.create(null) as Record<string, string>;
        for (const [k, v] of Object.entries(diskSettings)) {
            if (isPersistableSettingsKey(k) && typeof v === 'string' && v.length <= MAX_SETTING_CHARS) {
                lastSynced[k] = v;
            }
        }

        const { setItem: rawLocalStorageSetItem } = getRawStorageMethods();

        // Hydrate browser localStorage from disk before React initializes state
        for (const [k, diskVal] of Object.entries(lastSynced)) {
            let localVal: string | null;
            try {
                localVal = localStorage.getItem(k);
            } catch {
                localVal = null;
            }

            let shouldHydrate = false;
            let hydratedVal = diskVal;

            if (localVal === null) {
                shouldHydrate = true;
            } else if (DISK_SETTINGS_API_KEY_NAMES.has(k) && !localVal.trim() && diskVal.trim()) {
                shouldHydrate = true;
            } else if (k === STORAGE_KEYS.audioDramaSettings) {
                try {
                    const localObj = JSON.parse(localVal) as Record<string, unknown> | null;
                    const diskObj = JSON.parse(diskVal) as Record<string, unknown> | null;
                    if (
                        localObj &&
                        diskObj &&
                        typeof localObj === 'object' &&
                        typeof diskObj === 'object'
                    ) {
                        const mergedObj = { ...localObj };
                        let changed = false;
                        if (
                            (!mergedObj.geminiApiKey || !String(mergedObj.geminiApiKey).trim()) &&
                            diskObj.geminiApiKey &&
                            String(diskObj.geminiApiKey).trim()
                        ) {
                            mergedObj.geminiApiKey = diskObj.geminiApiKey;
                            changed = true;
                        }
                        if (
                            (!mergedObj.openRouterApiKey ||
                                !String(mergedObj.openRouterApiKey).trim()) &&
                            diskObj.openRouterApiKey &&
                            String(diskObj.openRouterApiKey).trim()
                        ) {
                            mergedObj.openRouterApiKey = diskObj.openRouterApiKey;
                            changed = true;
                        }
                        if (changed) {
                            shouldHydrate = true;
                            hydratedVal = JSON.stringify(mergedObj);
                        }
                    }
                } catch {
                    // Ignore malformed audio drama settings JSON during hydration
                }
            }

            if (shouldHydrate && rawLocalStorageSetItem) {
                try {
                    rawLocalStorageSetItem.call(localStorage, k, hydratedVal);
                } catch (e) {
                    console.warn(`[DiskSettingsVault] Failed to hydrate "${k}":`, e);
                }
            }
        }

        // First-run migration / sync from existing browser localStorage to disk
        const migrationPatch: Record<string, string> = Object.create(null) as Record<
            string,
            string
        >;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!isPersistableSettingsKey(k)) continue;
                const v = localStorage.getItem(k);
                if (typeof v !== 'string' || v.length > MAX_SETTING_CHARS) continue;
                if (
                    DISK_SETTINGS_API_KEY_NAMES.has(k) &&
                    !v.trim() &&
                    typeof lastSynced[k] === 'string' &&
                    lastSynced[k].trim()
                ) {
                    continue;
                }
                if (lastSynced[k] !== v) {
                    migrationPatch[k] = v;
                }
            }
        } catch {
            // Ignore localStorage enumeration errors in restricted contexts
        }

        ready = true;
        if (Object.keys(migrationPatch).length > 0) {
            Object.assign(pendingPatch, migrationPatch);
            await flush(false);
        }
        return true;
    };

    return {
        hydrateBeforeMount,
        queueChange,
        flush,
        isReady: () => ready
    };
})();

/** Hooks `Storage.prototype.setItem`/`removeItem` and unload flush listeners once per window. */
export function installDiskSettingsStorageHook(): void {
    if (typeof window === 'undefined') return;
    const win = window as unknown as DiskStorageWindowGlobals;
    const { setItem: rawSetItem, removeItem: rawRemoveItem } = getRawStorageMethods();
    if (win.__ellipsisDiskSettingsHooked || !rawSetItem || !rawRemoveItem) return;

    win.__ellipsisDiskSettingsHooked = true;
    Storage.prototype.setItem = function (key: string, value: string): void {
        rawSetItem.call(this, key, value);
        try {
            if (this === window.localStorage) {
                diskSettingsVault.queueChange(String(key), String(value));
            }
        } catch {
            // Ignore localStorage queue errors
        }
    };
    Storage.prototype.removeItem = function (key: string): void {
        rawRemoveItem.call(this, key);
        try {
            if (this === window.localStorage) {
                diskSettingsVault.queueChange(String(key), null);
            }
        } catch {
            // Ignore localStorage queue errors
        }
    };
    window.addEventListener('pagehide', () => {
        void diskSettingsVault.flush(true);
    });
    window.addEventListener('beforeunload', () => {
        void diskSettingsVault.flush(true);
    });
}

installDiskSettingsStorageHook();
