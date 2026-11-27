export * from './storageHelpers';
export * from './useSettingsStore';
export * from './useUiStore';
export * from './useStoryStore';
export * from './usePipelineStore';
export * from './useAudioStore';

import { STORAGE_KEYS } from '@/config';
import { applyPromptOverrides, parsePromptOverrides } from '@/prompts/overrides';
import { readStorageNullableString } from './storageHelpers';
import { useSettingsStore } from './useSettingsStore';
import { useStoryStore } from './useStoryStore';
import { useUiStore } from './useUiStore';

/**
 * Re-hydrates all persisted Zustand stores from browser storage (intended to run immediately
 * after `diskSettingsVault.hydrateBeforeMount()` populates `localStorage`).
 */
export function hydrateAllStoresFromStorage(): void {
    useSettingsStore.getState().hydrateFromStorage();
    useUiStore.getState().hydrateFromStorage();
    useStoryStore.getState().hydrateFromStorage();
    applyStoredPromptOverrides();
}

/** Prompts the user reworded in Settings replace the shipped wording before the app mounts. */
export function applyStoredPromptOverrides(): void {
    try {
        applyPromptOverrides(parsePromptOverrides(readStorageNullableString(STORAGE_KEYS.promptOverridesV1)));
    } catch (err) {
        console.warn('[prompts] Stored prompt overrides could not be applied:', err);
    }
}
