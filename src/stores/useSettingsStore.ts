/**
 * @module stores/useSettingsStore
 * Zustand store managing theme, provider credentials, 3-role model allocation, thinking budgets,
 * slop/narrative-lens configs, ComfyUI/image settings, Reader & Audio Drama settings, and live model catalogs.
 */

import { create } from 'zustand';
import {
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_COMFY_CONFIG,
    DEFAULT_IMAGE_MODELS,
    DEFAULT_LLM_MODELS,
    DEFAULT_READER_SETTINGS,
    DEFAULT_SAVED_MODELS,
    DEFAULT_SERVICE_URLS,
    DEFAULT_THINKING_BUDGETS,
    DEFAULT_TOKEN_LIMITS,
    NANO_GPT_DEFAULT_MODELS,
    STORAGE_KEYS,
    TTS_PIPELINE_TIERS,
    migrateAudioDramaSettings,
    resolveStoredApiTimeout,
    type AudioDramaSettings,
    type ReaderSettings
} from '@/config';
import { normalizeSlopConfig } from '@/domain/slop';
import type { ComfyOptionsCatalog, ComfyStatusInfo } from '@/services/images';
import type {
    CodexModelInfo,
    GeminiImageModelInfo,
    OpenRouterImageModelInfo,
    ProviderModelSettings,
    ThinkingBudgetSettings
} from '@/services/llm';
import type { KoboldStatusResult } from '@/services/llm';
import {
    CLI_BRIDGE_DEFAULT_URLS,
    isCliBridgeProvider,
    type ModelDescriptor,
    type SlopConfig
} from '@/types';
import {
    readSessionJson,
    readStorageBool,
    readStorageInt,
    readStorageJson,
    readStorageNullableString,
    readStorageNumber,
    readStorageString,
    writeStorageValue
} from './storageHelpers';

export type ThemeMode = 'light' | 'dark' | string;

export interface SettingsState {
    theme: ThemeMode;
    enableReview: boolean;
    enableStylePolish: boolean;
    enableAudioDramaDirectionPass: boolean;
    apiProvider: string;
    embeddingProvider: string;
    apiKey: string;
    apiTimeout: number;
    geminiModel: string;
    openRouterKey: string;
    openRouterModel: string;
    openRouterMaxTokens: number;
    nanoGptKey: string;
    nanoGptModel: string;
    koboldUrl: string;
    koboldModel: string;
    koboldLoadedModel: string;
    codexUrl: string;
    codexModel: string;
    claudeUrl: string;
    claudeModel: string;
    savedModels: string[];
    devProvider: string;
    devModel: string;
    reviewProvider: string;
    reviewModel: string;
    proseProvider: string;
    proseModel: string;
    useProseModel: boolean;
    geminiProseModel: string;
    openRouterProseModel: string;
    nanoGptProseModel: string;
    koboldProseModel: string;
    codexProseModel: string;
    enableThinkingAct: boolean;
    enableThinkingScene: boolean;
    enableThinkingWriting: boolean;
    thinkingBudgetStoryArc: number;
    thinkingBudgetAct: number;
    thinkingBudgetScene: number;
    thinkingBudgetWriting: number;
    enableNarrativeLenses: boolean;
    customModes: Record<string, Record<string, unknown>>;
    bannedPhrases: string[];
    slopConfig: SlopConfig;
    cascadeSceneChanges: boolean;
    verifyDirectiveEdits: boolean;
    editorialUseDeepLLM: boolean;
    enableEditorialHarnessAutopilot: boolean;
    enableMcpBridge: boolean;
    imageProvider: string;
    imageModel: string;
    imageApiKey: string;
    comfyUrl: string;
    comfyUnet: string;
    comfyClip: string;
    comfyVae: string;
    comfyLora: string;
    comfyLoraStrength: number;
    comfySteps: number;
    comfyCfg: number;
    comfySampler: string;
    comfyScheduler: string;
    comfyTimeoutSec: number;
    customImageStyles: Array<Record<string, unknown>>;
    readerSettings: ReaderSettings;
    audioDramaSettings: AudioDramaSettings;
    geminiModelsList: string[];
    geminiImageModelsList: GeminiImageModelInfo[];
    openRouterImageModelsList: OpenRouterImageModelInfo[];
    openRouterModelsList: ModelDescriptor[];
    nanoGptModelsList: ModelDescriptor[];
    codexModelsList: CodexModelInfo[];
    codexStatus: KoboldStatusResult;
    claudeModelsList: CodexModelInfo[];
    claudeStatus: KoboldStatusResult;
    codexEmbeddingStatus: Record<string, unknown> | null;
    koboldStatus: string;
    koboldError: string | null;
    comfyOptions: ComfyOptionsCatalog;
    comfyStatus: ComfyStatusInfo;
}

export interface SettingsStoreActions {
    setTheme: (nextOrUpdater: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void;
    toggleTheme: () => void;
    updateSetting: <K extends keyof SettingsState>(
        key: K,
        value: SettingsState[K],
        storageKey?: string
    ) => void;
    updateReaderSetting: <K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => void;
    setReaderSettings: (
        nextOrUpdater: ReaderSettings | ((prev: ReaderSettings) => ReaderSettings)
    ) => void;
    updateAudioDramaSetting: <K extends keyof AudioDramaSettings>(
        key: K,
        val: AudioDramaSettings[K]
    ) => void;
    setAudioDramaSettings: (
        nextOrUpdater: AudioDramaSettings | ((prev: AudioDramaSettings) => AudioDramaSettings)
    ) => void;
    getModelSettingsSnapshot: () => ProviderModelSettings;
    getThinkingSettingsSnapshot: () => ThinkingBudgetSettings;
    hydrateFromStorage: () => void;
}

export type SettingsStore = SettingsState & SettingsStoreActions;

/** Applies light/dark class and `data-theme` attribute cleanly to `document.documentElement`. */
export function applyThemeToDom(theme: ThemeMode): void {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

export function readInitialSettingsState(): SettingsState {
    const apiProvider = readStorageString(STORAGE_KEYS.apiProvider, 'gemini');
    const embeddingProvider =
        readStorageString(STORAGE_KEYS.embeddingProvider) ||
        (isCliBridgeProvider(apiProvider) ? 'gemini' : apiProvider);
    const geminiModel = readStorageString(STORAGE_KEYS.geminiModel, DEFAULT_LLM_MODELS.gemini);
    const koboldModel = readStorageString(STORAGE_KEYS.koboldModel, DEFAULT_LLM_MODELS.koboldcpp);

    const rawImageModel = readStorageString(STORAGE_KEYS.imageModel);
    const imageModel =
        rawImageModel && rawImageModel !== 'imagen-3.0-generate-002'
            ? rawImageModel
            : DEFAULT_IMAGE_MODELS.gemini;

    const bannedPhrases = readStorageJson<string[]>(
        STORAGE_KEYS.bannedPhrases,
        [...DEFAULT_BANNED_PHRASES]
    );
    const rawSlop = readStorageJson<Partial<SlopConfig> | null>(
        STORAGE_KEYS.slopConfigV1,
        null
    );
    const slopConfig = normalizeSlopConfig(rawSlop, bannedPhrases);

    const savedReader = readStorageJson<Partial<ReaderSettings> | null>(
        STORAGE_KEYS.readerSettings,
        null
    );
    const normalizedReader: ReaderSettings = savedReader
        ? {
              ...DEFAULT_READER_SETTINGS,
              ...savedReader,
              ttsDevice: savedReader.ttsDevice === 'auto' ? 'wasm' : savedReader.ttsDevice || 'wasm'
          }
        : { ...DEFAULT_READER_SETTINGS };

    const savedAudioDrama = readStorageJson<Partial<AudioDramaSettings> | null>(
        STORAGE_KEYS.audioDramaSettings,
        null
    );
    const audioDramaSettings: AudioDramaSettings = savedAudioDrama
        ? migrateAudioDramaSettings(savedAudioDrama)
        : { ...DEFAULT_AUDIO_DRAMA_SETTINGS };

    const rawApiTimeout = readStorageNullableString(STORAGE_KEYS.apiTimeout);
    const migratedApiTimeoutFlag = readStorageNullableString(STORAGE_KEYS.apiTimeoutMigratedV2);
    const { value: resolvedApiTimeout, didMigrate: didMigrateApiTimeout } = resolveStoredApiTimeout(
        rawApiTimeout,
        migratedApiTimeoutFlag
    );
    if (didMigrateApiTimeout) {
        writeStorageValue(STORAGE_KEYS.apiTimeout, resolvedApiTimeout);
    }
    if (didMigrateApiTimeout || (rawApiTimeout !== null && migratedApiTimeoutFlag !== 'true')) {
        writeStorageValue(STORAGE_KEYS.apiTimeoutMigratedV2, 'true');
    }

    return {
        theme: readStorageString(STORAGE_KEYS.theme, 'light'),
        enableReview: readStorageBool(STORAGE_KEYS.enableReview, true),
        enableStylePolish: readStorageBool(STORAGE_KEYS.enableStylePolish, true),
        enableAudioDramaDirectionPass: readStorageBool(
            STORAGE_KEYS.enableAudioDramaDirection,
            true
        ),
        apiProvider,
        embeddingProvider,
        apiKey: readStorageString(STORAGE_KEYS.geminiApiKey, ''),
        apiTimeout: resolvedApiTimeout,
        geminiModel,
        openRouterKey: readStorageString(STORAGE_KEYS.openRouterKey, ''),
        openRouterModel: readStorageString(
            STORAGE_KEYS.openRouterModel,
            DEFAULT_LLM_MODELS.openrouter
        ),
        openRouterMaxTokens: readStorageInt(
            STORAGE_KEYS.openRouterMaxTokens,
            DEFAULT_TOKEN_LIMITS.openRouterMaxTokens
        ),
        nanoGptKey: readStorageString(STORAGE_KEYS.nanoGptKey, ''),
        nanoGptModel: readStorageString(STORAGE_KEYS.nanoGptModel, DEFAULT_LLM_MODELS.nanogpt),
        koboldUrl: readStorageString(STORAGE_KEYS.koboldUrl, DEFAULT_SERVICE_URLS.koboldcpp),
        koboldModel,
        koboldLoadedModel: koboldModel || DEFAULT_LLM_MODELS.koboldcpp,
        codexUrl: readStorageString(STORAGE_KEYS.codexUrl, CLI_BRIDGE_DEFAULT_URLS.codex),
        codexModel: readStorageString(STORAGE_KEYS.codexModel, DEFAULT_LLM_MODELS.codex),
        claudeUrl: readStorageString(STORAGE_KEYS.claudeUrl, CLI_BRIDGE_DEFAULT_URLS.claude),
        claudeModel: readStorageString(STORAGE_KEYS.claudeModel, DEFAULT_LLM_MODELS.claude),
        savedModels: readStorageJson<string[]>(STORAGE_KEYS.savedModels, [
            ...DEFAULT_SAVED_MODELS
        ]),
        devProvider:
            readStorageString(STORAGE_KEYS.devProvider) ||
            readStorageString(STORAGE_KEYS.apiProvider) ||
            'gemini',
        devModel:
            readStorageString(STORAGE_KEYS.devModel) ||
            readStorageString(STORAGE_KEYS.geminiModel) ||
            DEFAULT_LLM_MODELS.gemini,
        reviewProvider: readStorageString(STORAGE_KEYS.reviewProvider, ''),
        reviewModel: readStorageString(STORAGE_KEYS.reviewModel, ''),
        proseProvider: readStorageString(STORAGE_KEYS.proseProvider, ''),
        proseModel: readStorageString(STORAGE_KEYS.proseModel, ''),
        useProseModel: readStorageBool(STORAGE_KEYS.useProseModel, false),
        geminiProseModel: readStorageString(STORAGE_KEYS.geminiProseModel, ''),
        openRouterProseModel: readStorageString(STORAGE_KEYS.openRouterProseModel, ''),
        nanoGptProseModel: readStorageString(STORAGE_KEYS.nanoGptProseModel, ''),
        koboldProseModel: readStorageString(STORAGE_KEYS.koboldProseModel, ''),
        codexProseModel: readStorageString(STORAGE_KEYS.codexProseModel, ''),
        enableThinkingAct: readStorageBool(STORAGE_KEYS.enableThinkingAct, true),
        enableThinkingScene: readStorageBool(STORAGE_KEYS.enableThinkingScene, true),
        enableThinkingWriting: readStorageBool(STORAGE_KEYS.enableThinkingWriting, true),
        thinkingBudgetStoryArc: readStorageInt(
            STORAGE_KEYS.thinkingBudgetStoryArc,
            DEFAULT_THINKING_BUDGETS.storyArc
        ),
        thinkingBudgetAct: readStorageInt(
            STORAGE_KEYS.thinkingBudgetAct,
            DEFAULT_THINKING_BUDGETS.act
        ),
        thinkingBudgetScene: readStorageInt(
            STORAGE_KEYS.thinkingBudgetScene,
            DEFAULT_THINKING_BUDGETS.scene
        ),
        thinkingBudgetWriting: readStorageInt(
            STORAGE_KEYS.thinkingBudgetWriting,
            DEFAULT_THINKING_BUDGETS.writing
        ),
        enableNarrativeLenses: readStorageBool(STORAGE_KEYS.enableNarrativeLensesV2, true),
        customModes: readStorageJson<Record<string, Record<string, unknown>>>(
            STORAGE_KEYS.customModes,
            {}
        ),
        bannedPhrases,
        slopConfig,
        cascadeSceneChanges: readStorageBool(STORAGE_KEYS.directiveCascade, true),
        verifyDirectiveEdits: readStorageBool(STORAGE_KEYS.directiveVerify, true),
        editorialUseDeepLLM: readStorageBool(STORAGE_KEYS.editorialDeepLlm, false),
        enableEditorialHarnessAutopilot: readStorageBool(STORAGE_KEYS.editorialAutopilot, true),
        enableMcpBridge: readStorageBool(STORAGE_KEYS.enableMcpBridge, false),
        imageProvider: readStorageString(STORAGE_KEYS.imageProvider, 'gemini'),
        imageModel,
        imageApiKey: readStorageString(STORAGE_KEYS.imageApiKey, ''),
        comfyUrl: readStorageString(STORAGE_KEYS.comfyUrl, DEFAULT_SERVICE_URLS.comfyui),
        comfyUnet: readStorageString(STORAGE_KEYS.comfyUnet, ''),
        comfyClip: readStorageString(STORAGE_KEYS.comfyClip, ''),
        comfyVae: readStorageString(STORAGE_KEYS.comfyVae, ''),
        comfyLora: readStorageString(STORAGE_KEYS.comfyLora, ''),
        comfyLoraStrength: readStorageNumber(
            STORAGE_KEYS.comfyLoraStrength,
            DEFAULT_COMFY_CONFIG.loraStrength
        ),
        comfySteps: readStorageNumber(STORAGE_KEYS.comfySteps, DEFAULT_COMFY_CONFIG.steps),
        comfyCfg: readStorageNumber(STORAGE_KEYS.comfyCfg, DEFAULT_COMFY_CONFIG.cfg),
        comfySampler: readStorageString(
            STORAGE_KEYS.comfySampler,
            DEFAULT_COMFY_CONFIG.sampler
        ),
        comfyScheduler: readStorageString(
            STORAGE_KEYS.comfyScheduler,
            DEFAULT_COMFY_CONFIG.scheduler
        ),
        comfyTimeoutSec: readStorageNumber(
            STORAGE_KEYS.comfyTimeoutSec,
            DEFAULT_COMFY_CONFIG.timeoutSec
        ),
        customImageStyles: readStorageJson<Array<Record<string, unknown>>>(
            STORAGE_KEYS.customImageStyles,
            []
        ),
        readerSettings: normalizedReader,
        audioDramaSettings,
        geminiModelsList: [],
        geminiImageModelsList: readSessionJson<GeminiImageModelInfo[]>(
            STORAGE_KEYS.geminiImageModelsCache,
            []
        ),
        openRouterImageModelsList: readSessionJson<OpenRouterImageModelInfo[]>(
            STORAGE_KEYS.openRouterImageModelsCache,
            []
        ),
        openRouterModelsList: readStorageJson<ModelDescriptor[]>(
            STORAGE_KEYS.openRouterModelsCache,
            []
        ),
        nanoGptModelsList: readStorageJson<ModelDescriptor[]>(
            STORAGE_KEYS.nanoGptModelsCache,
            [...NANO_GPT_DEFAULT_MODELS]
        ),
        codexModelsList: [],
        codexStatus: { online: false, model: null, error: null },
        claudeModelsList: [],
        claudeStatus: { online: false, model: null, error: null },
        codexEmbeddingStatus: null,
        koboldStatus: 'idle',
        koboldError: null,
        comfyOptions: {
            unet: [],
            clip: [],
            vae: [],
            lora: [],
            sampler: [],
            scheduler: []
        },
        comfyStatus: { online: false, version: '', device: '', error: '' }
    };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
    ...readInitialSettingsState(),

    setTheme: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function' ? nextOrUpdater(get().theme) : nextOrUpdater;
        set({ theme: next });
        applyThemeToDom(next);
        writeStorageValue(STORAGE_KEYS.theme, next);
    },

    toggleTheme: () => {
        const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        applyThemeToDom(next);
        writeStorageValue(STORAGE_KEYS.theme, next);
    },

    updateSetting: (key, value, storageKey) => {
        set({ [key]: value } as Partial<SettingsState>);
        if (storageKey) {
            if (typeof value === 'object' && value !== null) {
                writeStorageValue(storageKey, JSON.stringify(value));
            } else {
                writeStorageValue(storageKey, String(value));
            }
        }
        if (key === 'apiTimeout' || storageKey === STORAGE_KEYS.apiTimeout) {
            writeStorageValue(STORAGE_KEYS.apiTimeoutMigratedV2, 'true');
        }
    },

    updateReaderSetting: (key, val) => {
        const next = { ...get().readerSettings, [key]: val };
        set({ readerSettings: next });
        writeStorageValue(STORAGE_KEYS.readerSettings, JSON.stringify(next));
    },

    setReaderSettings: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().readerSettings)
                : nextOrUpdater;
        set({ readerSettings: next });
        writeStorageValue(STORAGE_KEYS.readerSettings, JSON.stringify(next));
    },

    updateAudioDramaSetting: (key, val) => {
        const next = { ...get().audioDramaSettings, [key]: val };
        if (key === 'pipelineTier') {
            const tierIdx = Number(val);
            const tierObj = TTS_PIPELINE_TIERS[tierIdx] || null;
            if (tierObj) next.backend = tierObj.id;
        } else if (key === 'backend') {
            const backendVal = String(val);
            next.pipelineTier =
                backendVal === 'system'
                    ? 0
                    : backendVal === 'kokoro' || backendVal === 'browser'
                      ? 1
                      : backendVal === 'breeze'
                        ? 2
                        : 3;
        }
        set({ audioDramaSettings: next });
        writeStorageValue(STORAGE_KEYS.audioDramaSettings, JSON.stringify(next));
    },

    setAudioDramaSettings: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().audioDramaSettings)
                : nextOrUpdater;
        set({ audioDramaSettings: next });
        writeStorageValue(STORAGE_KEYS.audioDramaSettings, JSON.stringify(next));
    },

    getModelSettingsSnapshot: () => {
        const s = get();
        return {
            apiProvider: s.apiProvider,
            devProvider: s.devProvider,
            devModel: s.devModel,
            reviewProvider: s.reviewProvider,
            reviewModel: s.reviewModel,
            proseProvider: s.proseProvider,
            proseModel: s.proseModel,
            geminiModel: s.geminiModel,
            openRouterModel: s.openRouterModel,
            nanoGptModel: s.nanoGptModel,
            codexModel: s.codexModel,
            claudeModel: s.claudeModel,
            koboldModel: s.koboldModel,
            koboldLoadedModel: s.koboldLoadedModel
        };
    },

    getThinkingSettingsSnapshot: () => {
        const s = get();
        return {
            enableThinkingAct: s.enableThinkingAct,
            enableThinkingScene: s.enableThinkingScene,
            enableThinkingWriting: s.enableThinkingWriting,
            thinkingBudgetStoryArc: s.thinkingBudgetStoryArc,
            thinkingBudgetAct: s.thinkingBudgetAct,
            thinkingBudgetScene: s.thinkingBudgetScene,
            thinkingBudgetWriting: s.thinkingBudgetWriting
        };
    },

    hydrateFromStorage: () => {
        const hydrated = readInitialSettingsState();
        set(hydrated);
        applyThemeToDom(hydrated.theme);
    }
}));
