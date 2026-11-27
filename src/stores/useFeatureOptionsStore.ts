/**
 * @module stores/useFeatureOptionsStore
 * Switches for optional pipeline safeguards. One persisted object, so a new option needs no
 * new storage key or shell wiring: the pipeline reads `getFeatureOptions()`, Settings writes
 * through the store.
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/config';
import {
    cleanSpendCap,
    cleanTokenCapK,
    isAutopilotPauseAt,
    type AutopilotPauseAt
} from '@/domain/autopilot/limits';
import { readStorageJson, writeStorageValue } from './storageHelpers';

export interface FeatureOptions {
    /** After a scene is written, one extra call reads it for unrevealed secrets told in other words. */
    secretLeakCheck: boolean;
    /** When a new scene names someone the record holds dead, have those paragraphs checked and put right. */
    deadCharacterCheck: boolean;
    /** Where Autopilot pauses by itself: 'never', 'scene', 'sequence' or 'act'. */
    autopilotPauseAt: AutopilotPauseAt;
    /** Thousands of tokens one Autopilot run may use; 0 means no cap. */
    autopilotTokenCap: number;
    /** Dollars one Autopilot run may spend, where the provider reports spending; 0 means no cap. */
    autopilotSpendCap: number;
}

export const DEFAULT_FEATURE_OPTIONS: FeatureOptions = {
    secretLeakCheck: true,
    deadCharacterCheck: true,
    autopilotPauseAt: 'never',
    autopilotTokenCap: 0,
    autopilotSpendCap: 0
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
    if (!isAutopilotPauseAt(next.autopilotPauseAt)) next.autopilotPauseAt = 'never';
    next.autopilotTokenCap = cleanTokenCapK(next.autopilotTokenCap);
    next.autopilotSpendCap = cleanSpendCap(next.autopilotSpendCap);
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
