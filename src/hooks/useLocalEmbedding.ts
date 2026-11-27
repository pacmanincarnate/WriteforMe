/**
 * @module hooks/useLocalEmbedding
 * The desktop app's built-in embedding model, as the shell and Settings see it: which model is
 * chosen, its setup progress, and the lore re-index once a newly chosen model is running.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
    ensureLocalEmbedding,
    getLocalEmbeddingModel,
    getLocalEmbeddingStatus,
    isLocalEmbeddingAvailable,
    markLocalEmbeddingReady,
    onLocalEmbeddingAvailabilityChange,
    onLocalEmbeddingModelChange,
    onLocalEmbeddingNeedsIndex,
    setLocalEmbeddingModel,
    type LocalEmbeddingStatus
} from '@/services/rag';

const POLL_MS = 1000;

/** Whether this page can run the built-in model; turns true once the launcher's server answers. */
export function useLocalEmbeddingAvailable(): boolean {
    return useSyncExternalStore(onLocalEmbeddingAvailabilityChange, isLocalEmbeddingAvailable);
}

/** The chosen built-in model id; re-renders when Settings changes it. */
export function useLocalEmbeddingModel(): string {
    return useSyncExternalStore(onLocalEmbeddingModelChange, getLocalEmbeddingModel);
}

/**
 * While the built-in model is the embedding provider, keeps it set up (so it downloads and starts
 * even with Settings closed) and rebuilds the lore index whenever a model the index was not built
 * with starts running.
 */
export function useLocalEmbeddingReindex(rebuild: () => unknown, active: boolean): void {
    const modelId = useLocalEmbeddingModel();
    const rebuildRef = useRef(rebuild);
    rebuildRef.current = rebuild;
    const available = useLocalEmbeddingAvailable();
    useEffect(() => onLocalEmbeddingNeedsIndex(() => void rebuildRef.current()), []);
    useEffect(() => {
        if (!active || !available) return;
        let current = true;
        ensureLocalEmbedding(modelId).then(
            () => {
                if (current) markLocalEmbeddingReady(modelId);
            },
            () => undefined
        );
        return () => {
            current = false;
        };
    }, [active, available, modelId]);
}

export interface LocalEmbeddingSetup {
    modelId: string;
    status: LocalEmbeddingStatus | null;
    choose: (modelId: string) => void;
    retry: () => void;
}

/**
 * While `active`, sets the chosen model up (download, start) and reports progress. Choosing
 * another model starts over with it; nothing else is asked of the writer.
 */
export function useLocalEmbeddingSetup(active: boolean): LocalEmbeddingSetup {
    const modelId = useLocalEmbeddingModel();
    const [status, setStatus] = useState<LocalEmbeddingStatus | null>(null);
    const [attempt, setAttempt] = useState(0);
    const available = useLocalEmbeddingAvailable();

    useEffect(() => {
        if (!active || !available) return;
        let current = true;
        const refresh = (): Promise<void> =>
            getLocalEmbeddingStatus(modelId).then(
                (next) => {
                    if (current) setStatus(next);
                },
                () => undefined
            );
        const timer = setInterval(() => void refresh(), POLL_MS);
        void refresh();
        ensureLocalEmbedding(modelId)
            .then(
                (next) => {
                    if (!current) return;
                    setStatus(next);
                    markLocalEmbeddingReady(modelId);
                },
                () => (current ? refresh() : undefined)
            )
            .finally(() => clearInterval(timer));
        return () => {
            current = false;
            clearInterval(timer);
        };
    }, [active, available, modelId, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return { modelId, status, choose: setLocalEmbeddingModel, retry };
}
