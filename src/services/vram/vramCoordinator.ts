/**
 * @module services/vram/vramCoordinator
 * Cross-backend local GPU/VRAM lease coordinator. Delegates to the Electron Desktop IPC
 * coordinator when available, and falls back to direct HTTP offloading across KoboldCpp,
 * Audio Studio Bridge, and ComfyUI in standalone browser/.bat mode.
 *
 * Strictly stays inside the `services` boundary (imports only `@/config` and `@/services/http`).
 */

import { DEFAULT_SERVICE_URLS } from '@/config';
import { fetchWithTimeout } from '@/services/http';

export type LocalGpuModality = 'llm' | 'audio' | 'image';

export interface LocalGpuHints extends Record<string, unknown> {
    koboldUrl?: string;
    bridgeUrl?: string;
    comfyUrl?: string;
    unet?: string;
    clip?: string;
    vae?: string;
    lora?: string;
}

type OffloadListener = (modality: LocalGpuModality) => void;

const MODALITIES: ReadonlyArray<LocalGpuModality> = ['llm', 'audio', 'image'];
const TWO_GB_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_BROWSER_IDLE_UNLOAD_MS = 10 * 60 * 1000;

const offloadListeners = new Set<OffloadListener>();
let desktopEventUnsubscribe: (() => void) | null = null;

let _cloudInFlightCount = 0;

// Browser/.bat fallback state (only used when window.ellipsisDesktopBackends.acquireGpuLease is absent)
let _browserQueue: Promise<unknown> = Promise.resolve();
let _browserCurrentModality: LocalGpuModality | null = null;
const _browserRefCount: Record<LocalGpuModality, number> = { llm: 0, audio: 0, image: 0 };
const _browserResident: Record<LocalGpuModality, boolean> = { llm: false, audio: false, image: false };
const _browserEndpoints: Record<LocalGpuModality, string> = {
    llm: DEFAULT_SERVICE_URLS.koboldcpp,
    audio: DEFAULT_SERVICE_URLS.audioStudioBridge,
    image: DEFAULT_SERVICE_URLS.comfyui
};
let _browserKoboldAdminUnloaded = false;
let _browserIdleTimer: ReturnType<typeof setTimeout> | null = null;
let _browserIdleMs = DEFAULT_BROWSER_IDLE_UNLOAD_MS;

function ensureDesktopOffloadListener(): void {
    if (desktopEventUnsubscribe || typeof window === 'undefined') return;
    const bridge = window.ellipsisDesktopBackends;
    if (!bridge?.onEvent) return;
    desktopEventUnsubscribe = bridge.onEvent((evt) => {
        if (evt?.type === 'vram-offloaded' && evt.modality && MODALITIES.includes(evt.modality)) {
            emitModalityOffloaded(evt.modality);
        }
    });
}

function emitModalityOffloaded(modality: LocalGpuModality): void {
    for (const listener of offloadListeners) {
        try {
            listener(modality);
        } catch {
            // Listener errors must never disrupt GPU lease management
        }
    }
}

/** Subscribes to local modality offload events (e.g., to invalidate cached Wave state). */
export function onLocalModalityOffloaded(listener: OffloadListener): () => void {
    ensureDesktopOffloadListener();
    offloadListeners.add(listener);
    return () => {
        offloadListeners.delete(listener);
    };
}

function totalBrowserActiveLeases(): number {
    return _browserRefCount.llm + _browserRefCount.audio + _browserRefCount.image;
}

function clearBrowserIdleTimer(): void {
    if (_browserIdleTimer) {
        clearTimeout(_browserIdleTimer);
        _browserIdleTimer = null;
    }
}

function armBrowserIdleTimer(): void {
    clearBrowserIdleTimer();
    if (_browserIdleMs <= 0) return;
    if (totalBrowserActiveLeases() > 0 || _cloudInFlightCount > 0) return;
    if (!_browserResident.llm && !_browserResident.audio && !_browserResident.image) return;

    const timer = setTimeout(() => {
        _browserIdleTimer = null;
        if (totalBrowserActiveLeases() > 0 || _cloudInFlightCount > 0) return;
        void offloadBrowserIdleModalities();
    }, _browserIdleMs);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
    }
    _browserIdleTimer = timer;
}

function normalizeUrl(url: string | undefined, fallback: string): string {
    const trimmed = String(url || '').trim() || fallback;
    return trimmed.replace(/\/+$/, '');
}

async function offloadBrowserModality(modality: LocalGpuModality): Promise<void> {
    if (!_browserResident[modality]) return;

    if (modality === 'image') {
        const comfyUrl = _browserEndpoints.image;
        try {
            const res = await fetchWithTimeout(
                `${comfyUrl}/free`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unload_models: true, free_memory: true })
                },
                4000
            );
            if (res.ok) {
                await new Promise((r) => setTimeout(r, 250));
            }
        } catch {
            // Best-effort offload in standalone browser mode
        }
        _browserResident.image = false;
        emitModalityOffloaded('image');
        return;
    }

    if (modality === 'audio') {
        const bridgeUrl = _browserEndpoints.audio;
        try {
            const healthRes = await fetchWithTimeout(`${bridgeUrl}/health`, {}, 1500).catch(
                () => null
            );
            let shouldDeactivate = true;
            if (healthRes && healthRes.ok) {
                const health = (await healthRes.json().catch(() => null)) as {
                    audiocpp_server_alive?: boolean;
                    active_wave?: number | null;
                    active_model_bytes?: number;
                } | null;
                if (health && !health.audiocpp_server_alive && !health.active_wave) {
                    shouldDeactivate = false;
                } else if (
                    health &&
                    typeof health.active_model_bytes === 'number' &&
                    health.active_model_bytes > 0 &&
                    health.active_model_bytes <= TWO_GB_BYTES
                ) {
                    shouldDeactivate = false;
                }
            }
            if (shouldDeactivate) {
                await fetchWithTimeout(
                    `${bridgeUrl}/wave/deactivate`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}'
                    },
                    10000
                );
                emitModalityOffloaded('audio');
            }
        } catch {
            // Best-effort offload in standalone browser mode
        }
        _browserResident.audio = false;
        return;
    }

    if (modality === 'llm') {
        const koboldUrl = _browserEndpoints.llm;
        try {
            const res = await fetchWithTimeout(
                `${koboldUrl}/api/admin/reload_config`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: 'unload_model' })
                },
                8000
            );
            if (res.ok) {
                _browserKoboldAdminUnloaded = true;
            }
        } catch {
            // KoboldCpp without --admin ignores this silently in standalone browser mode
        }
        _browserResident.llm = false;
        emitModalityOffloaded('llm');
    }
}

async function offloadBrowserIdleModalities(): Promise<void> {
    const next = _browserQueue.then(async () => {
        if (totalBrowserActiveLeases() > 0 || _cloudInFlightCount > 0) return;
        for (const m of MODALITIES) {
            await offloadBrowserModality(m);
        }
    });
    _browserQueue = next.catch(() => {});
    return next;
}

function getDesktopBridge() {
    if (typeof window === 'undefined') return undefined;
    return window.ellipsisDesktopBackends;
}

/**
 * Tracks active cloud AI work (LLMs, embeddings, cloud images) so local models are
 * never evicted as "idle" while waiting on a cloud model response.
 */
export function beginCloudActivity(): () => void {
    _cloudInFlightCount++;
    clearBrowserIdleTimer();
    const bridge = getDesktopBridge();
    if (bridge?.setCloudActivity) {
        void bridge.setCloudActivity(_cloudInFlightCount).catch(() => {});
    }

    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        _cloudInFlightCount = Math.max(0, _cloudInFlightCount - 1);
        const curBridge = getDesktopBridge();
        if (curBridge?.setCloudActivity) {
            void curBridge.setCloudActivity(_cloudInFlightCount).catch(() => {});
        }
        if (_cloudInFlightCount === 0) {
            armBrowserIdleTimer();
        }
    };
}

/** Runs an async cloud AI operation with cloud-activity protection active. */
export async function withCloudActivity<T>(taskFn: () => Promise<T>): Promise<T> {
    const end = beginCloudActivity();
    try {
        return await taskFn();
    } finally {
        end();
    }
}

/**
 * Runs a local GPU task under an exclusive modality lease ('llm' | 'audio' | 'image').
 * Re-entrant for nested calls of the same modality.
 */
export async function withLocalGpuLease<T>(
    modality: LocalGpuModality,
    hints: LocalGpuHints,
    taskFn: () => Promise<T>
): Promise<T> {
    ensureDesktopOffloadListener();
    const bridge = getDesktopBridge();

    if (bridge?.acquireGpuLease && bridge?.releaseGpuLease) {
        const leaseRes = await bridge.acquireGpuLease(modality, hints).catch(() => null);
        const leaseId = leaseRes?.ok ? leaseRes.value?.leaseId : undefined;
        try {
            return await taskFn();
        } finally {
            if (leaseId) {
                await bridge.releaseGpuLease(leaseId).catch(() => {});
            }
        }
    }

    if (hints.koboldUrl) _browserEndpoints.llm = normalizeUrl(hints.koboldUrl, _browserEndpoints.llm);
    if (hints.bridgeUrl) _browserEndpoints.audio = normalizeUrl(hints.bridgeUrl, _browserEndpoints.audio);
    if (hints.comfyUrl) _browserEndpoints.image = normalizeUrl(hints.comfyUrl, _browserEndpoints.image);

    clearBrowserIdleTimer();

    // Same-modality re-entrant fast path
    if (_browserCurrentModality === modality && _browserRefCount[modality] > 0) {
        _browserRefCount[modality]++;
        _browserResident[modality] = true;
        try {
            return await taskFn();
        } finally {
            _browserRefCount[modality] = Math.max(0, _browserRefCount[modality] - 1);
            if (totalBrowserActiveLeases() === 0) {
                _browserCurrentModality = null;
                armBrowserIdleTimer();
            }
        }
    }

    const acquired = _browserQueue.then(async () => {
        clearBrowserIdleTimer();
        for (const other of MODALITIES) {
            if (other !== modality && _browserResident[other] && _browserRefCount[other] === 0) {
                await offloadBrowserModality(other);
            }
        }
        if (modality === 'llm' && _browserKoboldAdminUnloaded) {
            try {
                await fetchWithTimeout(
                    `${_browserEndpoints.llm}/api/admin/reload_config`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: 'initial_model' })
                    },
                    180000
                );
                _browserKoboldAdminUnloaded = false;
            } catch {
                // Ignore if admin endpoint is unavailable
            }
        }
        _browserCurrentModality = modality;
        _browserRefCount[modality]++;
        _browserResident[modality] = true;
    });
    _browserQueue = acquired.catch(() => {});

    await acquired;
    try {
        return await taskFn();
    } finally {
        _browserRefCount[modality] = Math.max(0, _browserRefCount[modality] - 1);
        if (totalBrowserActiveLeases() === 0) {
            _browserCurrentModality = null;
            armBrowserIdleTimer();
        }
    }
}

/** Explicitly frees all resident local models across Desktop or browser mode. */
export async function freeAllLocalVram(): Promise<void> {
    const bridge = getDesktopBridge();
    if (bridge?.freeAllVram) {
        await bridge.freeAllVram().catch(() => {});
        return;
    }
    await offloadBrowserIdleModalities();
}

/** Configures the browser-mode idle unload timeout (strictly for tests). */
export function setBrowserIdleUnloadMsForTests(ms: number): void {
    _browserIdleMs = ms;
}

/** Resets in-memory coordinator state (strictly for isolated unit tests). */
export function resetVramCoordinatorForTests(): void {
    clearBrowserIdleTimer();
    _browserIdleMs = DEFAULT_BROWSER_IDLE_UNLOAD_MS;
    _browserQueue = Promise.resolve();
    _browserCurrentModality = null;
    _browserRefCount.llm = 0;
    _browserRefCount.audio = 0;
    _browserRefCount.image = 0;
    _browserResident.llm = false;
    _browserResident.audio = false;
    _browserResident.image = false;
    _browserEndpoints.llm = DEFAULT_SERVICE_URLS.koboldcpp;
    _browserEndpoints.audio = DEFAULT_SERVICE_URLS.audioStudioBridge;
    _browserEndpoints.image = DEFAULT_SERVICE_URLS.comfyui;
    _browserKoboldAdminUnloaded = false;
    _cloudInFlightCount = 0;
    if (desktopEventUnsubscribe) {
        desktopEventUnsubscribe();
        desktopEventUnsubscribe = null;
    }
}
