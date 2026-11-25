/**
 * @module stores/useSettingsStore
 * Zustand store managing theme, provider credentials, 3-role model allocation, thinking budgets,
 * slop/narrative-lens configs, ComfyUI/image settings, Reader & Audio Drama settings, and live model catalogs.
 */

import { create } from 'zustand';
import {
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_READER_SETTINGS,
    NANO_GPT_DEFAULT_MODELS,
    TTS_PIPELINE_TIERS,
    migrateAudioDramaSettings,
    type AudioDramaSettings,
    type ReaderSettings
} from '@/config';
import { normalizeSlopConfig } from '@/domain/slop';
import type { ComfyOptionsCatalog, ComfyStatusInfo } from '@/services/images';
import type {
    CodexModelInfo,
    GeminiImageModelInfo,
    ProviderModelSettings,
    ThinkingBudgetSettings
} from '@/services/llm';
import type { KoboldStatusResult } from '@/services/llm';
import type { ModelDescriptor, SlopConfig } from '@/types';
import {
    readSessionJson,
    readStorageBool,
    readStorageInt,
    readStorageJson,
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
    openRouterModelsList: ModelDescriptor[];
    nanoGptModelsList: ModelDescriptor[];
    codexModelsList: CodexModelInfo[];
    codexStatus: KoboldStatusResult;
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
    const apiProvider = readStorageString('ellipsisprose_api_provider', 'gemini');
    const embeddingProvider =
        readStorageString('ellipsisprose_embedding_provider') ||
        (apiProvider === 'codex' ? 'gemini' : apiProvider);
    const geminiModel = readStorageString('ellipsisprose_gemini_model', 'gemini-2.0-flash');
    const koboldModel = readStorageString('ellipsisprose_kobold_model', 'koboldcpp');

    const rawImageModel = readStorageString('ellipsisprose_image_model');
    const imageModel =
        rawImageModel && rawImageModel !== 'imagen-3.0-generate-002'
            ? rawImageModel
            : 'gemini-3.1-flash-image';

    const bannedPhrases = readStorageJson<string[]>(
        'ellipsisprose_banned_phrases',
        [...DEFAULT_BANNED_PHRASES]
    );
    const rawSlop = readStorageJson<Partial<SlopConfig> | null>(
        'ellipsisprose_slop_config_v1',
        null
    );
    const slopConfig = normalizeSlopConfig(rawSlop, bannedPhrases);

    const savedReader = readStorageJson<Partial<ReaderSettings> | null>(
        'ellipsisprose_reader_settings',
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
        'ellipsisprose_audio_drama_settings',
        null
    );
    const audioDramaSettings: AudioDramaSettings = savedAudioDrama
        ? migrateAudioDramaSettings(savedAudioDrama)
        : { ...DEFAULT_AUDIO_DRAMA_SETTINGS };

    return {
        theme: readStorageString('ellipsisprose_theme', 'light'),
        enableReview: readStorageBool('ellipsisprose_enable_review', true),
        enableStylePolish: readStorageBool('ellipsisprose_enable_style_polish', true),
        enableAudioDramaDirectionPass: readStorageBool(
            'ellipsisprose_enable_audio_drama_direction',
            true
        ),
        apiProvider,
        embeddingProvider,
        apiKey: readStorageString('gemini_api_key', ''),
        apiTimeout: readStorageInt('ellipsisprose_api_timeout', 120, 5, 1800),
        geminiModel,
        openRouterKey: readStorageString('ellipsisprose_openrouter_key', ''),
        openRouterModel: readStorageString(
            'ellipsisprose_openrouter_model',
            'google/gemini-2.0-flash-001'
        ),
        openRouterMaxTokens: readStorageInt('ellipsisprose_openrouter_max_tokens', 65536),
        nanoGptKey: readStorageString('ellipsisprose_nanogpt_key', ''),
        nanoGptModel: readStorageString('ellipsisprose_nanogpt_model', 'gpt-4o'),
        koboldUrl: readStorageString('ellipsisprose_kobold_url', 'http://localhost:5001'),
        koboldModel,
        koboldLoadedModel: koboldModel || 'koboldcpp',
        codexUrl: readStorageString('ellipsisprose_codex_url', 'http://localhost:5010'),
        codexModel: readStorageString('ellipsisprose_codex_model', 'gpt-5.6-luna'),
        savedModels: readStorageJson<string[]>('ellipsisprose_saved_models', [
            'google/gemini-2.0-flash-001'
        ]),
        devProvider:
            readStorageString('ellipsisprose_dev_provider') ||
            readStorageString('ellipsisprose_api_provider') ||
            'gemini',
        devModel:
            readStorageString('ellipsisprose_dev_model') ||
            readStorageString('ellipsisprose_gemini_model') ||
            'gemini-2.0-flash',
        reviewProvider: readStorageString('ellipsisprose_review_provider', ''),
        reviewModel: readStorageString('ellipsisprose_review_model', ''),
        proseProvider: readStorageString('ellipsisprose_prose_provider', ''),
        proseModel: readStorageString('ellipsisprose_prose_model', ''),
        useProseModel: readStorageBool('ellipsisprose_use_prose_model', false),
        geminiProseModel: readStorageString('ellipsisprose_gemini_prose_model', ''),
        openRouterProseModel: readStorageString('ellipsisprose_openrouter_prose_model', ''),
        nanoGptProseModel: readStorageString('ellipsisprose_nanogpt_prose_model', ''),
        koboldProseModel: readStorageString('ellipsisprose_kobold_prose_model', ''),
        codexProseModel: readStorageString('ellipsisprose_codex_prose_model', ''),
        enableThinkingAct: readStorageBool('ellipsisprose_enable_thinking_act', true),
        enableThinkingScene: readStorageBool('ellipsisprose_enable_thinking_scene', true),
        enableThinkingWriting: readStorageBool('ellipsisprose_enable_thinking_writing', true),
        thinkingBudgetStoryArc: readStorageInt('ellipsisprose_thinking_budget_story_arc', 16384),
        thinkingBudgetAct: readStorageInt('ellipsisprose_thinking_budget_act', 16384),
        thinkingBudgetScene: readStorageInt('ellipsisprose_thinking_budget_scene', 16384),
        thinkingBudgetWriting: readStorageInt('ellipsisprose_thinking_budget_writing', 16384),
        enableNarrativeLenses: readStorageBool('ellipsisprose_enable_narrative_lenses_v2', true),
        customModes: readStorageJson<Record<string, Record<string, unknown>>>(
            'ellipsisprose_custom_modes',
            {}
        ),
        bannedPhrases,
        slopConfig,
        cascadeSceneChanges: readStorageBool('ellipsisprose_directive_cascade', true),
        verifyDirectiveEdits: readStorageBool('ellipsisprose_directive_verify', true),
        editorialUseDeepLLM: readStorageBool('ellipsisprose_editorial_deep_llm', false),
        enableEditorialHarnessAutopilot: readStorageBool('ellipsisprose_editorial_autopilot', true),
        enableMcpBridge: readStorageBool('ellipsisprose_enable_mcp_bridge', false),
        imageProvider: readStorageString('ellipsisprose_image_provider', 'gemini'),
        imageModel,
        imageApiKey: readStorageString('ellipsisprose_image_api_key', ''),
        comfyUrl: readStorageString('ellipsisprose_comfy_url', 'http://127.0.0.1:8188'),
        comfyUnet: readStorageString('ellipsisprose_comfy_unet', ''),
        comfyClip: readStorageString('ellipsisprose_comfy_clip', ''),
        comfyVae: readStorageString('ellipsisprose_comfy_vae', ''),
        comfyLora: readStorageString('ellipsisprose_comfy_lora', ''),
        comfyLoraStrength: readStorageNumber('ellipsisprose_comfy_lora_strength', 0.8),
        comfySteps: readStorageNumber('ellipsisprose_comfy_steps', 8),
        comfyCfg: readStorageNumber('ellipsisprose_comfy_cfg', 1),
        comfySampler: readStorageString('ellipsisprose_comfy_sampler', 'euler'),
        comfyScheduler: readStorageString('ellipsisprose_comfy_scheduler', 'simple'),
        comfyTimeoutSec: readStorageNumber('ellipsisprose_comfy_timeout_sec', 600),
        customImageStyles: readStorageJson<Array<Record<string, unknown>>>(
            'ellipsisprose_custom_image_styles',
            []
        ),
        readerSettings: normalizedReader,
        audioDramaSettings,
        geminiModelsList: [],
        geminiImageModelsList: readSessionJson<GeminiImageModelInfo[]>(
            'ellipsisprose_gemini_image_models_cache',
            []
        ),
        openRouterModelsList: readStorageJson<ModelDescriptor[]>(
            'ellipsisprose_openrouter_models_cache',
            []
        ),
        nanoGptModelsList: readStorageJson<ModelDescriptor[]>(
            'ellipsisprose_nanogpt_models_cache',
            [...NANO_GPT_DEFAULT_MODELS]
        ),
        codexModelsList: [],
        codexStatus: { online: false, model: null, error: null },
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
        writeStorageValue('ellipsisprose_theme', next);
    },

    toggleTheme: () => {
        const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        applyThemeToDom(next);
        writeStorageValue('ellipsisprose_theme', next);
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
    },

    updateReaderSetting: (key, val) => {
        const next = { ...get().readerSettings, [key]: val };
        set({ readerSettings: next });
        writeStorageValue('ellipsisprose_reader_settings', JSON.stringify(next));
    },

    setReaderSettings: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().readerSettings)
                : nextOrUpdater;
        set({ readerSettings: next });
        writeStorageValue('ellipsisprose_reader_settings', JSON.stringify(next));
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
        writeStorageValue('ellipsisprose_audio_drama_settings', JSON.stringify(next));
    },

    setAudioDramaSettings: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().audioDramaSettings)
                : nextOrUpdater;
        set({ audioDramaSettings: next });
        writeStorageValue('ellipsisprose_audio_drama_settings', JSON.stringify(next));
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
