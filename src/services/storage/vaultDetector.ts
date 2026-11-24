/**
 * @module services/storage/vaultDetector
 * Probes `/api/storage/status` at most once per page session and immediately disables
 * disk-vault HTTP requests on `file://`, static hosts (`github.io`, `pages.dev`, etc.),
 * or origins returning non-JSON / 404 responses so static deployments avoid 404 storms.
 */

export type VaultAvailabilityState = 'unknown' | 'available' | 'unavailable';

const STATIC_HOST_REGEX = /(?:^|\.)(?:github\.io|pages\.dev|netlify\.app|vercel\.app)$/i;

let vaultState: VaultAvailabilityState = 'unknown';
let probePromise: Promise<boolean> | null = null;

export type LocationLike = Pick<Location, 'protocol' | 'hostname'>;

function isStaticallyUnavailableOrigin(loc?: LocationLike): boolean {
    const targetLoc = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
    if (!targetLoc) return true;
    const protocol = String(targetLoc.protocol || '');
    if (!/^https?:$/i.test(protocol)) return true;
    const hostname = String(targetLoc.hostname || '');
    if (STATIC_HOST_REGEX.test(hostname)) return true;
    return false;
}

/** Synchronously reports whether the local Node disk-vault backend is confirmed available. */
export function isLocalStorageVaultAvailable(loc?: LocationLike): boolean {
    if (isStaticallyUnavailableOrigin(loc)) {
        vaultState = 'unavailable';
        return false;
    }
    return vaultState === 'available';
}

/** Performs at most one deduplicated `GET /api/storage/status` check to verify the local disk vault. */
export async function probeLocalVaultAvailability(loc?: LocationLike): Promise<boolean> {
    if (isStaticallyUnavailableOrigin(loc)) {
        vaultState = 'unavailable';
        return false;
    }
    if (vaultState === 'available') return true;
    if (vaultState === 'unavailable') return false;
    if (probePromise) return probePromise;

    probePromise = (async () => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;
        try {
            const res = await fetch('/api/storage/status', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (!res || !res.ok) {
                vaultState = 'unavailable';
                return false;
            }
            const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
            if (contentType && !contentType.includes('application/json')) {
                vaultState = 'unavailable';
                return false;
            }
            const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
            if (data && data.ok === true) {
                vaultState = 'available';
                return true;
            }
            vaultState = 'unavailable';
            return false;
        } catch {
            vaultState = 'unavailable';
            return false;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            probePromise = null;
        }
    })();

    return probePromise;
}

/** Forces vault state to `unavailable` after a non-local failure or static 404. */
export function markLocalVaultUnavailable(): void {
    vaultState = 'unavailable';
    probePromise = null;
}

/** Returns current cached probe state for diagnostics and tests. */
export function getVaultAvailabilityState(): VaultAvailabilityState {
    return vaultState;
}

/** Resets cached vault state (strictly for isolated unit tests). */
export function resetVaultDetectorForTests(): void {
    vaultState = 'unknown';
    probePromise = null;
}
