/**
 * @module stores/useFeatureOptionsStore
 * Switches for optional pipeline safeguards. One persisted object, so a new option needs no
 * new storage key or shell wiring: the pipeline reads `getFeatureOptions()`, Settings writes
 * through the store.
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/config';
import { readStorageJson, writeStorageValue } from './storageHelpers';

export interface FeatureOptions {
    /** After a scene is written, one extra call reads it for unrevealed secrets told in other words. */
    secretLeakCheck: boolean;
}

export const DEFAULT_FEATURE_OPTIONS: FeatureOptions = {
    secretLeakCheck: true
};

export function normalizeFeatureOptions(raw: unknown): FeatureOptions {
    const next: FeatureOptions = { ...DEFAULT_FEATURE_OPTIONS };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next;
    const source = raw as Record<string, unknown>;
    (Object.keys(DEFAULT_FEATURE_OPTIONS) as Array<keyof FeatureOptions>).forEach((key) => {
        if (typeof source[key] === typeof DEFAULT_FEATURE_OPTIONS[key]) {
            (next as unknown as Record<string, unknown>)[key] = source[key];
        }
    });
    return next;
}

function readStored(): FeatureOptions {
    return normalizeFeatureOptions(readStorageJson<unknown>(STORAGE_KEYS.featureOptionsV1, null));
}

export interface FeatureOptionsState {
    options: FeatureOptions;
    setOption: <K extends keyof FeatureOptions>(key: K, value: FeatureOptions[K]) => void;
    hydrateFromStorage: () => void;
}

export const useFeatureOptionsStore = create<FeatureOptionsState>((set, get) => ({
    options: readStored(),
    setOption: (key, value) => {
        const options = { ...get().options, [key]: value };
        set({ options });
        writeStorageValue(STORAGE_KEYS.featureOptionsV1, JSON.stringify(options));
    },
    hydrateFromStorage: () => set({ options: readStored() })
}));

/** The options as they are now, for code outside React. */
export function getFeatureOptions(): FeatureOptions {
    return useFeatureOptionsStore.getState().options;
}
