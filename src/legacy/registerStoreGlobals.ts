import { registerWindowGlobals } from '@/compat/windowBridge';
import {
    applyThemeToDom,
    hydrateAllStoresFromStorage,
    STORE_PROMPT_LOG_CAP,
    useAudioStore,
    usePipelineStore,
    useSettingsStore,
    useStoryStore,
    useUiStore
} from '@/stores';

const __ELLIPSIS_STORES__ = {
    settings: useSettingsStore,
    ui: useUiStore,
    story: useStoryStore,
    pipeline: usePipelineStore,
    audio: useAudioStore
};

registerWindowGlobals({
    applyThemeToDom,
    hydrateAllStoresFromStorage,
    STORE_PROMPT_LOG_CAP,
    useSettingsStore,
    useUiStore,
    useStoryStore,
    usePipelineStore,
    useAudioStore,
    __ELLIPSIS_STORES__
});
