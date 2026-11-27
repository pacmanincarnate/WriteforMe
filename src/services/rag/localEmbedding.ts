/**
 * @module services/rag/localEmbedding
 * The desktop app's built-in embedding model: llama.cpp on this PC's processor, downloaded and
 * started by the app (desktop/lib/embedding.cjs). The page reaches it through the desktop bridge,
 * or through its own server when started from the launcher. A page with neither (the single-file
 * build, a static host) cannot start programs, so the option is not offered.
 */

import { DEFAULT_EMBEDDING_MODELS, STORAGE_KEYS } from '@/config';
import { probeLocalVaultAvailability } from '@/services/storage';

export type LocalEmbeddingStatus = DesktopEmbeddingStatusAmbient;
export type LocalEmbeddingModel = DesktopEmbeddingModelAmbient;

type Reply<T> = { ok: boolean; value?: T; error?: string };

/** The three calls, whoever answers them: the desktop bridge or the launcher's server. */
interface Transport {
    status: (modelId: string) => Promise<Reply<LocalEmbeddingStatus>>;
    ensure: (modelId: string) => Promise<Reply<LocalEmbeddingStatus>>;
    embed: (modelId: string, texts: string[], kind: 'query' | 'document') => Promise<Reply<number[][]>>;
}

function desktopTransport(): Transport | null {
    const b = typeof window === 'undefined' ? undefined : window.ellipsisDesktopBackends;
    if (!b?.embed || !b.ensureEmbedding || !b.getEmbeddingStatus) return null;
    return { status: b.getEmbeddingStatus, ensure: b.ensureEmbedding, embed: b.embed };
}

async function askServer<T>(action: string, body: Record<string, unknown>): Promise<Reply<T>> {
    try {
        const response = await fetch(`/api/embedding/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) return { ok: false, error: `The app's server answered ${response.status}.` };
        return (await response.json()) as Reply<T>;
    } catch {
        return { ok: false, error: "The app's server is not answering." };
    }
}

/** "Launch EllipsisProse.bat" and `npm start`: server.js runs the model (embedding-launcher.js). */
const serverTransport: Transport = {
    status: (model) => askServer('status', { model }),
    ensure: (model) => askServer('ensure', { model }),
    embed: (model, texts, kind) => askServer('embed', { model, texts, kind })
};

let serverAvailable = false;
let serverProbe: Promise<void> | null = null;
const availabilityListeners = new Set<() => void>();

/** Asks the page's own server, once, whether it can run the model. */
function probeServer(): void {
    if (serverProbe || typeof window === 'undefined') return;
    // Only server.js has the route, and server.js is what answers the vault probe; asking it
    // first keeps a static host from logging a 404.
    serverProbe = probeLocalVaultAvailability()
        .then((served) => (served ? serverTransport.status('') : null))
        .then((reply) => {
            if (!reply?.ok || !reply.value?.available) return;
            serverAvailable = true;
            for (const listener of availabilityListeners) listener();
        });
}

function transport(): Transport | null {
    const desktop = desktopTransport();
    if (desktop) return desktop;
    probeServer();
    return serverAvailable ? serverTransport : null;
}

function need(): Transport {
    const t = transport();
    if (!t) throw new Error('The built-in embedding model needs the desktop app or the launcher.');
    return t;
}

function unwrap<T>(result: Reply<T>): T {
    if (!result.ok || result.value === undefined) {
        throw new Error(result.error || 'The built-in embedding model did not answer.');
    }
    return result.value;
}

/** True in the desktop app at once, and under the launcher once its server has answered. */
export function isLocalEmbeddingAvailable(): boolean {
    return transport() !== null;
}

export function onLocalEmbeddingAvailabilityChange(listener: () => void): () => void {
    availabilityListeners.add(listener);
    return () => {
        availabilityListeners.delete(listener);
    };
}

/** Test seam: forget what the server said. */
export function resetLocalEmbeddingProbe(): void {
    serverAvailable = false;
    serverProbe = null;
}

export async function getLocalEmbeddingStatus(modelId: string): Promise<LocalEmbeddingStatus> {
    return unwrap(await need().status(modelId));
}

/** Downloads what is missing and starts the model. Resolves once it answers requests. */
export async function ensureLocalEmbedding(modelId: string): Promise<LocalEmbeddingStatus> {
    return unwrap(await need().ensure(modelId));
}

export async function embedLocally(
    modelId: string,
    text: string,
    kind: 'query' | 'document'
): Promise<number[] | null> {
    return unwrap(await need().embed(modelId, [text], kind))[0] ?? null;
}

// --- Which model the writer chose -----------------------------------------------------------

const modelListeners = new Set<() => void>();

export function getLocalEmbeddingModel(): string {
    try {
        return (
            localStorage.getItem(STORAGE_KEYS.localEmbeddingModel) ||
            DEFAULT_EMBEDDING_MODELS.llamacpp
        );
    } catch {
        return DEFAULT_EMBEDDING_MODELS.llamacpp;
    }
}

export function setLocalEmbeddingModel(modelId: string): void {
    try {
        localStorage.setItem(STORAGE_KEYS.localEmbeddingModel, modelId);
    } catch {
        // The choice then lasts until the page closes.
    }
    for (const listener of modelListeners) listener();
}

export function onLocalEmbeddingModelChange(listener: () => void): () => void {
    modelListeners.add(listener);
    return () => {
        modelListeners.delete(listener);
    };
}

// --- Re-indexing once a newly chosen model is running ------------------------------------------

const readyListeners = new Set<() => void>();

/** Subscribes to "a model the lore index was not built with is now running". */
export function onLocalEmbeddingNeedsIndex(listener: () => void): () => void {
    readyListeners.add(listener);
    return () => {
        readyListeners.delete(listener);
    };
}

let lastAsked = '';

/**
 * Call when `modelId` has started. If the lore index was built with something else, it asks
 * subscribers to rebuild it (once per index state), so switching model never leaves the old
 * model's vectors behind.
 */
export function markLocalEmbeddingReady(modelId: string): void {
    let fingerprint: string;
    try {
        fingerprint = localStorage.getItem(STORAGE_KEYS.ragFingerprint) || '';
    } catch {
        return;
    }
    if (fingerprint.includes(`|llamacpp|${modelId}|`)) return;
    const asked = `${modelId}\u0000${fingerprint}`;
    if (asked === lastAsked) return;
    lastAsked = asked;
    for (const listener of readyListeners) listener();
}
