/**
 * @module stores/storageHelpers
 * SSR- and quota-tolerant `localStorage` and `sessionStorage` accessors used by Zustand stores.
 * Writes through `localStorage.setItem` automatically mirror to the local disk vault via
 * `diskSettingsVault`'s prototype hook when active.
 */

export function readStorageString(key: string, fallback = ''): string {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    } catch {
        return fallback;
    }
}

export function readStorageNullableString(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function readStorageBool(key: string, fallback: boolean): boolean {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val === 'true' : fallback;
    } catch {
        return fallback;
    }
}

export function readStorageInt(
    key: string,
    fallback: number,
    min?: number,
    max?: number
): number {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = parseInt(raw, 10);
        if (isNaN(parsed)) return fallback;
        if (min !== undefined && parsed < min) return fallback;
        if (max !== undefined && parsed > max) return fallback;
        return parsed;
    } catch {
        return fallback;
    }
}

export function readStorageNumber(key: string, fallback: number): number {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const num = Number(raw);
        return Number.isFinite(num) ? num : fallback;
    } catch {
        return fallback;
    }
}

export function readStorageJson<T>(key: string, fallback: T): T {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function readSessionJson<T>(key: string, fallback: T): T {
    if (typeof sessionStorage === 'undefined') return fallback;
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function writeStorageValue(key: string, value: string | number | boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Ignore storage quota / private mode restrictions
    }
}

export function removeStorageKey(key: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage restrictions
    }
}

export function writeSessionJson(key: string, value: unknown): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore session storage restrictions
    }
}
