export * from './storageHelpers';
export * from './useSettingsStore';
export * from './useUiStore';
export * from './useStoryStore';
export * from './usePipelineStore';
export * from './useAudioStore';

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
}
