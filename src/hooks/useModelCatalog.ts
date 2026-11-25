/**
 * @module hooks/useModelCatalog
 * Debounced per-role model search (`useModelSearch`), provider/model/thinking state
 * & localStorage persistence, live OpenRouter / NanoGPT / Gemini / Codex / ComfyUI
 * catalog fetchers, and the centralized `callAI` dispatcher wrapper.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { NANO_GPT_DEFAULT_MODELS } from '@/config';
import { dispatchAI, type PromptLogEntry } from '@/pipeline';
import type { ComfyOptionsCatalog, ComfyStatusInfo } from '@/services/images';
import { fetchComfyInfoCatalog } from '@/services/images';
import {
    checkKoboldCPPStatus,
    fetchClaudeCatalog,
    fetchCodexCatalog,
    fetchGeminiCatalog,
    fetchGeminiImageModelsCatalog,
    fetchNanoGPTModels,
    fetchOpenRouterModels,
    filterModelsClientSide,
    getDefaultModelForProvider as resolveDefaultModelForProvider,
    getEffectiveModelConfig as resolveEffectiveModelConfig,
    sanitizeLocalKoboldModel as resolveSanitizedKoboldModel,
    searchNanoGPTModels,
    setKoboldLoadedModelName,
    type CodexModelInfo,
    type EffectiveModelConfig,
    type GeminiImageModelInfo,
    type KoboldStatusResult,
    type OpenRouterCatalogModel,
    type ParsedModelMetadata,
    type ProviderModelSettings
} from '@/services/llm';
import { CLI_BRIDGE_DEFAULT_URLS, isCliBridgeProvider, isLocalProvider, type ModelDescriptor } from '@/types';
import { safeLocalStorageSet, safeSessionStorageSet } from '@/utils';
import { useDebounce } from './useDebounce';

export type SearchModelResult =
    | OpenRouterCatalogModel
    | ParsedModelMetadata
    | ModelDescriptor
    | string;

export type NanoGptCatalogEntry = ParsedModelMetadata | ModelDescriptor | string;

export interface UseModelSearchDependencies {
    devProvider: string;
    apiKey: string;
    openRouterKey: string;
    nanoGptKey: string;
    geminiModelsList: string[];
    openRouterModelsList: OpenRouterCatalogModel[];
    nanoGptModelsList: NanoGptCatalogEntry[];
    fetchGeminiModels: () => Promise<void>;
}

export interface UseModelSearchResult {
    query: string;
    setQuery: Dispatch<SetStateAction<string>>;
    isSearching: boolean;
    results: SearchModelResult[];
    setResults: Dispatch<SetStateAction<SearchModelResult[]>>;
    isDropdownOpen: boolean;
    setIsDropdownOpen: Dispatch<SetStateAction<boolean>>;
}

/** Debounced live catalog search hook shared by Development, Review, and Prose model pickers. */
export function useModelSearch(
    label: string,
    targetProvider: string,
    {
        devProvider,
        apiKey,
        openRouterKey,
        nanoGptKey,
        geminiModelsList,
        openRouterModelsList,
        nanoGptModelsList,
        fetchGeminiModels
    }: UseModelSearchDependencies
): UseModelSearchResult {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 300);
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<SearchModelResult[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const fetchGeminiModelsRef = useRef(fetchGeminiModels);
    fetchGeminiModelsRef.current = fetchGeminiModels;

    useEffect(() => {
        let active = true;

        const runSearch = async (): Promise<void> => {
            const providerToUse = targetProvider || devProvider || 'gemini';
            if (isLocalProvider(providerToUse)) {
                setResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            const q = debouncedQuery.trim();

            try {
                if (providerToUse === 'gemini') {
                    let catalog = geminiModelsList;
                    if (catalog.length === 0 && apiKey) {
                        await fetchGeminiModelsRef.current();
                        catalog = geminiModelsList;
                    }
                    const formattedCatalog: Array<{ id: string; name: string }> = catalog.map((m) =>
                        typeof m === 'string' ? { id: m, name: m } : m
                    );
                    if (active) setResults(filterModelsClientSide(formattedCatalog, q));
                } else if (providerToUse === 'openrouter') {
                    let catalog = openRouterModelsList;
                    if (catalog.length === 0) {
                        catalog = await fetchOpenRouterModels(openRouterKey).catch(() => []);
                    }
                    if (active) setResults(filterModelsClientSide(catalog, q));
                } else if (providerToUse === 'nanogpt') {
                    const { results: found } = await searchNanoGPTModels(
                        q,
                        nanoGptKey,
                        nanoGptModelsList
                    );
                    if (active) setResults(found);
                }
            } catch (e) {
                console.error(`${label} model search error:`, e);
                if (active) setResults([]);
            } finally {
                if (active) setIsSearching(false);
            }
        };

        void runSearch();
        return () => {
            active = false;
        };
    }, [
        debouncedQuery,
        targetProvider,
        devProvider,
        apiKey,
        openRouterKey,
        nanoGptKey,
        geminiModelsList,
        openRouterModelsList,
        nanoGptModelsList,
        label
    ]);

    return {
        query,
        setQuery,
        isSearching,
        results,
        setResults,
        isDropdownOpen,
        setIsDropdownOpen
    };
}

export interface UseModelCatalogParams {
    view: string;
    story: Record<string, unknown> | null | undefined;
    storyRef: MutableRefObject<Record<string, unknown>>;
    setCurrentPipelineStep: (stepId: number) => void;
    setPromptLog: Dispatch<SetStateAction<PromptLogEntry[]>>;
    showToast: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
    logPipelineDelay: (stageName: string, durationMs: number, reason: string) => void;
    // Image catalog hook-ins owned by useStoryImages
    imageProvider: string;
    imageApiKey: string;
    geminiImageModelsList: GeminiImageModelInfo[];
    setGeminiImageModelsList: Dispatch<SetStateAction<GeminiImageModelInfo[]>>;
    setIsFetchingImageModels: Dispatch<SetStateAction<boolean>>;
    comfyUrl: string;
    setComfyStatus: Dispatch<SetStateAction<ComfyStatusInfo>>;
    setComfyOptions: Dispatch<SetStateAction<ComfyOptionsCatalog>>;
    setComfyUnet: Dispatch<SetStateAction<string>>;
    setComfyClip: Dispatch<SetStateAction<string>>;
    setComfyVae: Dispatch<SetStateAction<string>>;
    comfyRefreshId: MutableRefObject<number>;
}

export interface UseModelCatalogResult {
    enableReview: boolean;
    setEnableReview: Dispatch<SetStateAction<boolean>>;
    enableStylePolish: boolean;
    setEnableStylePolish: Dispatch<SetStateAction<boolean>>;
    enableAudioDramaDirectionPass: boolean;
    setEnableAudioDramaDirectionPass: Dispatch<SetStateAction<boolean>>;
    apiProvider: string;
    setApiProvider: Dispatch<SetStateAction<string>>;
    embeddingProvider: string;
    setEmbeddingProvider: Dispatch<SetStateAction<string>>;
    apiKey: string;
    setApiKey: Dispatch<SetStateAction<string>>;
    apiTimeout: number;
    setApiTimeout: Dispatch<SetStateAction<number>>;
    geminiModel: string;
    setGeminiModel: Dispatch<SetStateAction<string>>;
    geminiModelsList: string[];
    openRouterKey: string;
    setOpenRouterKey: Dispatch<SetStateAction<string>>;
    openRouterModel: string;
    setOpenRouterModel: Dispatch<SetStateAction<string>>;
    openRouterMaxTokens: number;
    setOpenRouterMaxTokens: Dispatch<SetStateAction<number>>;
    nanoGptKey: string;
    setNanoGptKey: Dispatch<SetStateAction<string>>;
    nanoGptModel: string;
    setNanoGptModel: Dispatch<SetStateAction<string>>;
    koboldUrl: string;
    setKoboldUrl: Dispatch<SetStateAction<string>>;
    koboldModel: string;
    setKoboldModel: Dispatch<SetStateAction<string>>;
    codexUrl: string;
    setCodexUrl: Dispatch<SetStateAction<string>>;
    codexModel: string;
    setCodexModel: Dispatch<SetStateAction<string>>;
    codexModelsList: CodexModelInfo[];
    codexStatus: KoboldStatusResult;
    codexEmbeddingStatus: Record<string, unknown> | null;
    claudeUrl: string;
    setClaudeUrl: Dispatch<SetStateAction<string>>;
    claudeModel: string;
    setClaudeModel: Dispatch<SetStateAction<string>>;
    claudeModelsList: CodexModelInfo[];
    claudeStatus: KoboldStatusResult;
    savedModels: string[];
    setSavedModels: Dispatch<SetStateAction<string[]>>;
    openRouterModelsList: OpenRouterCatalogModel[];
    nanoGptModelsList: NanoGptCatalogEntry[];
    koboldStatus: string;
    koboldLoadedModel: string;
    koboldError: string | null;
    devProvider: string;
    setDevProvider: Dispatch<SetStateAction<string>>;
    devModel: string;
    setDevModel: Dispatch<SetStateAction<string>>;
    reviewProvider: string;
    setReviewProvider: Dispatch<SetStateAction<string>>;
    reviewModel: string;
    setReviewModel: Dispatch<SetStateAction<string>>;
    proseProvider: string;
    setProseProvider: Dispatch<SetStateAction<string>>;
    proseModel: string;
    setProseModel: Dispatch<SetStateAction<string>>;
    modelSearchQuery: string;
    setModelSearchQuery: Dispatch<SetStateAction<string>>;
    isSearchingModels: boolean;
    searchResults: SearchModelResult[];
    setSearchResults: Dispatch<SetStateAction<SearchModelResult[]>>;
    isModelDropdownOpen: boolean;
    setIsModelDropdownOpen: Dispatch<SetStateAction<boolean>>;
    reviewModelSearchQuery: string;
    setReviewModelSearchQuery: Dispatch<SetStateAction<string>>;
    isSearchingReviewModels: boolean;
    reviewSearchResults: SearchModelResult[];
    setReviewSearchResults: Dispatch<SetStateAction<SearchModelResult[]>>;
    isReviewModelDropdownOpen: boolean;
    setIsReviewModelDropdownOpen: Dispatch<SetStateAction<boolean>>;
    proseModelSearchQuery: string;
    setProseModelSearchQuery: Dispatch<SetStateAction<string>>;
    isSearchingProseModels: boolean;
    proseSearchResults: SearchModelResult[];
    setProseSearchResults: Dispatch<SetStateAction<SearchModelResult[]>>;
    isProseModelDropdownOpen: boolean;
    setIsProseModelDropdownOpen: Dispatch<SetStateAction<boolean>>;
    useProseModel: boolean;
    setUseProseModel: Dispatch<SetStateAction<boolean>>;
    geminiProseModel: string;
    setGeminiProseModel: Dispatch<SetStateAction<string>>;
    openRouterProseModel: string;
    setOpenRouterProseModel: Dispatch<SetStateAction<string>>;
    nanoGptProseModel: string;
    setNanoGptProseModel: Dispatch<SetStateAction<string>>;
    koboldProseModel: string;
    setKoboldProseModel: Dispatch<SetStateAction<string>>;
    codexProseModel: string;
    setCodexProseModel: Dispatch<SetStateAction<string>>;
    enableThinkingAct: boolean;
    setEnableThinkingAct: Dispatch<SetStateAction<boolean>>;
    enableThinkingScene: boolean;
    setEnableThinkingScene: Dispatch<SetStateAction<boolean>>;
    enableThinkingWriting: boolean;
    setEnableThinkingWriting: Dispatch<SetStateAction<boolean>>;
    thinkingBudgetStoryArc: number;
    setThinkingBudgetStoryArc: Dispatch<SetStateAction<number>>;
    thinkingBudgetAct: number;
    setThinkingBudgetAct: Dispatch<SetStateAction<number>>;
    thinkingBudgetScene: number;
    setThinkingBudgetScene: Dispatch<SetStateAction<number>>;
    thinkingBudgetWriting: number;
    setThinkingBudgetWriting: Dispatch<SetStateAction<number>>;
    getModelSettingsSnapshot: () => ProviderModelSettings;
    getDefaultModelForProvider: (prov: string) => string;
    sanitizeLocalKoboldModel: (candidate: string) => string;
    getEffectiveModelConfig: (role?: string) => EffectiveModelConfig;
    saveModel: (modelToSave?: unknown) => void;
    deleteModel: (modelToDelete: string) => void;
    fetchGeminiModels: () => Promise<void>;
    fetchGeminiImageModels: (showFeedback?: boolean) => Promise<GeminiImageModelInfo[]>;
    refreshOpenRouterModels: (force?: boolean) => Promise<void>;
    refreshNanoGptModels: (force?: boolean) => Promise<void>;
    checkKoboldStatus: () => Promise<void>;
    refreshCodexModels: () => Promise<void>;
    refreshClaudeModels: () => Promise<void>;
    refreshComfyInfo: () => Promise<void>;
    handleCatalogRefresh: (targetProvider?: string | null) => Promise<void>;
    callAI: (
        prompt: string,
        systemPrompt: string,
        isJson?: boolean,
        logName?: string,
        modelRoleOrSize?: string
    ) => Promise<string>;
}

/** Manages LLM providers, three-role model configuration, catalogs, thinking budgets, and `callAI`. */
export function useModelCatalog({
    view,
    story,
    storyRef,
    setCurrentPipelineStep,
    setPromptLog,
    showToast,
    logPipelineDelay,
    imageProvider,
    imageApiKey,
    geminiImageModelsList,
    setGeminiImageModelsList,
    setIsFetchingImageModels,
    comfyUrl,
    setComfyStatus,
    setComfyOptions,
    setComfyUnet,
    setComfyClip,
    setComfyVae,
    comfyRefreshId
}: UseModelCatalogParams): UseModelCatalogResult {
    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const stableShowToast = useCallback(
        (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => {
            showToastRef.current(message, variant);
        },
        []
    );
    const [enableReview, setEnableReview] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_review');
        return val !== null ? val === 'true' : true;
    });
    const [enableStylePolish, setEnableStylePolish] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_style_polish');
        return val !== null ? val === 'true' : true;
    });
    const [enableAudioDramaDirectionPass, setEnableAudioDramaDirectionPass] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_audio_drama_direction');
        return val !== null ? val === 'true' : true;
    });
    const [apiProvider, setApiProvider] = useState(
        () => localStorage.getItem('ellipsisprose_api_provider') || 'gemini'
    );
    const [embeddingProvider, setEmbeddingProvider] = useState(
        () =>
            localStorage.getItem('ellipsisprose_embedding_provider') ||
            (isCliBridgeProvider(apiProvider) ? 'gemini' : apiProvider)
    );
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
    const [apiTimeout, setApiTimeout] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_api_timeout');
        const parsed = val !== null ? parseInt(val, 10) : 120;
        return !isNaN(parsed) && parsed >= 5 && parsed <= 1800 ? parsed : 120;
    });
    const [geminiModel, setGeminiModel] = useState(
        () => localStorage.getItem('ellipsisprose_gemini_model') || 'gemini-2.0-flash'
    );
    const [geminiModelsList, setGeminiModelsList] = useState<string[]>([]);
    const [openRouterKey, setOpenRouterKey] = useState(
        () => localStorage.getItem('ellipsisprose_openrouter_key') || ''
    );
    const [openRouterModel, setOpenRouterModel] = useState(
        () => localStorage.getItem('ellipsisprose_openrouter_model') || 'google/gemini-2.0-flash-001'
    );
    const [openRouterMaxTokens, setOpenRouterMaxTokens] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_openrouter_max_tokens');
        return val !== null ? parseInt(val, 10) : 65536;
    });
    const [nanoGptKey, setNanoGptKey] = useState(
        () => localStorage.getItem('ellipsisprose_nanogpt_key') || ''
    );
    const [nanoGptModel, setNanoGptModel] = useState(
        () => localStorage.getItem('ellipsisprose_nanogpt_model') || 'gpt-4o'
    );
    const [koboldUrl, setKoboldUrl] = useState(
        () => localStorage.getItem('ellipsisprose_kobold_url') || 'http://localhost:5001'
    );
    const [koboldModel, setKoboldModel] = useState(
        () => localStorage.getItem('ellipsisprose_kobold_model') || 'koboldcpp'
    );
    const [codexUrl, setCodexUrl] = useState(
        () => localStorage.getItem('ellipsisprose_codex_url') || 'http://localhost:5010'
    );
    const [codexModel, setCodexModel] = useState(
        () => localStorage.getItem('ellipsisprose_codex_model') ?? 'gpt-5.6-luna'
    );
    const [codexModelsList, setCodexModelsList] = useState<CodexModelInfo[]>([]);
    const [codexStatus, setCodexStatus] = useState<KoboldStatusResult>({
        online: false,
        model: null,
        error: null
    });
    const [codexEmbeddingStatus, setCodexEmbeddingStatus] = useState<Record<
        string,
        unknown
    > | null>(null);
    const codexRefreshId = useRef(0);
    const [claudeUrl, setClaudeUrl] = useState(
        () => localStorage.getItem('ellipsisprose_claude_url') || CLI_BRIDGE_DEFAULT_URLS.claude
    );
    const [claudeModel, setClaudeModel] = useState(
        () => localStorage.getItem('ellipsisprose_claude_model') ?? 'sonnet'
    );
    const [claudeModelsList, setClaudeModelsList] = useState<CodexModelInfo[]>([]);
    const [claudeStatus, setClaudeStatus] = useState<KoboldStatusResult>({
        online: false,
        model: null,
        error: null
    });
    const claudeRefreshId = useRef(0);
    const [savedModels, setSavedModels] = useState<string[]>(() => {
        const saved = localStorage.getItem('ellipsisprose_saved_models');
        return saved ? (JSON.parse(saved) as string[]) : ['google/gemini-2.0-flash-001'];
    });

    const [openRouterModelsList, setOpenRouterModelsList] = useState<OpenRouterCatalogModel[]>(() => {
        const cached = localStorage.getItem('ellipsisprose_openrouter_models_cache');
        return cached ? (JSON.parse(cached) as OpenRouterCatalogModel[]) : [];
    });
    const [nanoGptModelsList, setNanoGptModelsList] = useState<NanoGptCatalogEntry[]>(() => {
        const cached = localStorage.getItem('ellipsisprose_nanogpt_models_cache');
        return cached
            ? (JSON.parse(cached) as NanoGptCatalogEntry[])
            : [...NANO_GPT_DEFAULT_MODELS];
    });
    const [koboldStatus, setKoboldStatus] = useState('idle');
    const [koboldLoadedModel, setKoboldLoadedModel] = useState(koboldModel || 'koboldcpp');
    const [koboldError, setKoboldError] = useState<string | null>(null);

    const [devProvider, setDevProvider] = useState(
        () =>
            localStorage.getItem('ellipsisprose_dev_provider') ||
            localStorage.getItem('ellipsisprose_api_provider') ||
            'gemini'
    );
    const [devModel, setDevModel] = useState(
        () =>
            localStorage.getItem('ellipsisprose_dev_model') ||
            localStorage.getItem('ellipsisprose_gemini_model') ||
            'gemini-2.0-flash'
    );
    const [reviewProvider, setReviewProvider] = useState(
        () => localStorage.getItem('ellipsisprose_review_provider') || ''
    );
    const [reviewModel, setReviewModel] = useState(
        () => localStorage.getItem('ellipsisprose_review_model') || ''
    );
    const [proseProvider, setProseProvider] = useState(
        () => localStorage.getItem('ellipsisprose_prose_provider') || ''
    );
    const [proseModel, setProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_prose_model') || ''
    );

    const [useProseModel, setUseProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_use_prose_model') === 'true'
    );
    const [geminiProseModel, setGeminiProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_gemini_prose_model') || ''
    );
    const [openRouterProseModel, setOpenRouterProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_openrouter_prose_model') || ''
    );
    const [nanoGptProseModel, setNanoGptProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_nanogpt_prose_model') || ''
    );
    const [koboldProseModel, setKoboldProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_kobold_prose_model') || ''
    );
    const [codexProseModel, setCodexProseModel] = useState(
        () => localStorage.getItem('ellipsisprose_codex_prose_model') || ''
    );

    const [enableThinkingAct, setEnableThinkingAct] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_thinking_act');
        return val !== null ? val === 'true' : true;
    });
    const [enableThinkingScene, setEnableThinkingScene] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_thinking_scene');
        return val !== null ? val === 'true' : true;
    });
    const [enableThinkingWriting, setEnableThinkingWriting] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_enable_thinking_writing');
        return val !== null ? val === 'true' : true;
    });

    const [thinkingBudgetStoryArc, setThinkingBudgetStoryArc] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_thinking_budget_story_arc');
        return val !== null ? parseInt(val, 10) : 16384;
    });
    const [thinkingBudgetAct, setThinkingBudgetAct] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_thinking_budget_act');
        return val !== null ? parseInt(val, 10) : 16384;
    });
    const [thinkingBudgetScene, setThinkingBudgetScene] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_thinking_budget_scene');
        return val !== null ? parseInt(val, 10) : 16384;
    });
    const [thinkingBudgetWriting, setThinkingBudgetWriting] = useState(() => {
        const val = localStorage.getItem('ellipsisprose_thinking_budget_writing');
        return val !== null ? parseInt(val, 10) : 16384;
    });

    // Persist Model & Thinking Settings
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_review', enableReview);
    }, [enableReview]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_style_polish', enableStylePolish);
    }, [enableStylePolish]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_audio_drama_direction', enableAudioDramaDirectionPass);
    }, [enableAudioDramaDirectionPass]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_dev_provider', devProvider);
    }, [devProvider]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_dev_model', devModel);
    }, [devModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_review_provider', reviewProvider);
    }, [reviewProvider]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_review_model', reviewModel);
    }, [reviewModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_prose_provider', proseProvider);
    }, [proseProvider]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_prose_model', proseModel);
    }, [proseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_api_provider', apiProvider);
    }, [apiProvider]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_embedding_provider', embeddingProvider);
    }, [embeddingProvider]);
    useEffect(() => {
        safeLocalStorageSet('gemini_api_key', apiKey);
    }, [apiKey]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_api_timeout', apiTimeout);
    }, [apiTimeout]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_gemini_model', geminiModel);
    }, [geminiModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_openrouter_key', openRouterKey);
    }, [openRouterKey]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_openrouter_model', openRouterModel);
    }, [openRouterModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_openrouter_max_tokens', openRouterMaxTokens);
    }, [openRouterMaxTokens]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_nanogpt_key', nanoGptKey);
    }, [nanoGptKey]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_nanogpt_model', nanoGptModel);
    }, [nanoGptModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_nanogpt_prose_model', nanoGptProseModel);
    }, [nanoGptProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_kobold_url', koboldUrl);
    }, [koboldUrl]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_kobold_model', koboldModel);
    }, [koboldModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_codex_url', codexUrl);
    }, [codexUrl]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_codex_model', codexModel);
    }, [codexModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_codex_prose_model', codexProseModel);
    }, [codexProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_claude_url', claudeUrl);
    }, [claudeUrl]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_claude_model', claudeModel);
    }, [claudeModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_saved_models', savedModels);
    }, [savedModels]);
    useEffect(() => {
        if (openRouterModelsList.length > 0) {
            safeSessionStorageSet('ellipsisprose_openrouter_models_cache', openRouterModelsList);
        }
    }, [openRouterModelsList]);
    useEffect(() => {
        if (nanoGptModelsList.length > 0) {
            safeSessionStorageSet('ellipsisprose_nanogpt_models_cache', nanoGptModelsList);
        }
    }, [nanoGptModelsList]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_use_prose_model', useProseModel);
    }, [useProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_gemini_prose_model', geminiProseModel);
    }, [geminiProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_openrouter_prose_model', openRouterProseModel);
    }, [openRouterProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_kobold_prose_model', koboldProseModel);
    }, [koboldProseModel]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_thinking_act', enableThinkingAct);
    }, [enableThinkingAct]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_thinking_scene', enableThinkingScene);
    }, [enableThinkingScene]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_enable_thinking_writing', enableThinkingWriting);
    }, [enableThinkingWriting]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_thinking_budget_story_arc', thinkingBudgetStoryArc);
    }, [thinkingBudgetStoryArc]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_thinking_budget_act', thinkingBudgetAct);
    }, [thinkingBudgetAct]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_thinking_budget_scene', thinkingBudgetScene);
    }, [thinkingBudgetScene]);
    useEffect(() => {
        safeLocalStorageSet('ellipsisprose_thinking_budget_writing', thinkingBudgetWriting);
    }, [thinkingBudgetWriting]);

    const getModelSettingsSnapshot = useCallback(
        (): ProviderModelSettings => ({
            apiProvider,
            devProvider,
            devModel,
            reviewProvider,
            reviewModel,
            proseProvider,
            proseModel,
            geminiModel,
            openRouterModel,
            nanoGptModel,
            codexModel,
            claudeModel,
            koboldModel,
            koboldLoadedModel
        }),
        [
            apiProvider,
            claudeModel,
            codexModel,
            devModel,
            devProvider,
            geminiModel,
            koboldLoadedModel,
            koboldModel,
            nanoGptModel,
            openRouterModel,
            proseModel,
            proseProvider,
            reviewModel,
            reviewProvider
        ]
    );

    const getDefaultModelForProvider = useCallback(
        (prov: string): string => resolveDefaultModelForProvider(prov, getModelSettingsSnapshot()),
        [getModelSettingsSnapshot]
    );

    const sanitizeLocalKoboldModel = useCallback(
        (candidate: string): string =>
            resolveSanitizedKoboldModel(candidate, getModelSettingsSnapshot()),
        [getModelSettingsSnapshot]
    );

    const getEffectiveModelConfig = useCallback(
        (role = 'dev'): EffectiveModelConfig =>
            resolveEffectiveModelConfig(role, getModelSettingsSnapshot()),
        [getModelSettingsSnapshot]
    );

    if (typeof window !== 'undefined') {
        (
            window as unknown as {
                getEffectiveModelConfig?: (role?: string) => EffectiveModelConfig;
            }
        ).getEffectiveModelConfig = getEffectiveModelConfig;
    }

    const fetchGeminiModels = useCallback(async (): Promise<void> => {
        if (!apiKey) return;
        try {
            const { models, imageModels } = await fetchGeminiCatalog(apiKey);
            setGeminiModelsList(models);
            if (imageModels.length > 0) {
                setGeminiImageModelsList(imageModels);
                safeSessionStorageSet('ellipsisprose_gemini_image_models_cache', imageModels);
            }
        } catch (e) {
            console.error('Error fetching Gemini models:', e);
        }
    }, [apiKey, setGeminiImageModelsList]);

    const fetchGeminiImageModels = useCallback(
        async (showFeedback = false): Promise<GeminiImageModelInfo[]> => {
            const keyToUse = (imageApiKey || apiKey || '').trim();
            if (!keyToUse) {
                if (showFeedback) {
                    stableShowToast('Please configure your Gemini API Key first.', 'info');
                }
                return [];
            }
            setIsFetchingImageModels(true);
            try {
                const imgModels = await fetchGeminiImageModelsCatalog(keyToUse);
                if (imgModels.length > 0) {
                    setGeminiImageModelsList(imgModels);
                    safeSessionStorageSet('ellipsisprose_gemini_image_models_cache', imgModels);
                    if (showFeedback) {
                        stableShowToast(
                            `Loaded ${imgModels.length} Gemini image models on the fly!`,
                            'success'
                        );
                    }
                    return imgModels;
                }
                if (showFeedback) {
                    stableShowToast('No dedicated image models found for this API key.', 'info');
                }
            } catch (err) {
                console.error('Error fetching Gemini image models:', err);
                const msg = err instanceof Error ? err.message : String(err);
                if (showFeedback) stableShowToast(`Failed to fetch image models: ${msg}`, 'error');
            } finally {
                setIsFetchingImageModels(false);
            }
            return [];
        },
        [apiKey, imageApiKey, setGeminiImageModelsList, setIsFetchingImageModels, stableShowToast]
    );

    const refreshOpenRouterModels = useCallback(async (): Promise<void> => {
        try {
            const models = await fetchOpenRouterModels(openRouterKey);
            if (models && models.length > 0) {
                setOpenRouterModelsList(models);
                safeSessionStorageSet('ellipsisprose_openrouter_models_cache', models);
                try {
                    localStorage.removeItem('ellipsisprose_openrouter_models_cache');
                } catch {
                    // Ignore storage quota / privacy errors
                }
            }
        } catch (e) {
            console.warn('Failed to fetch OpenRouter model catalog:', e);
        }
    }, [openRouterKey]);

    const refreshNanoGptModels = useCallback(async (): Promise<void> => {
        try {
            const models = await fetchNanoGPTModels(nanoGptKey);
            if (models && models.length > 0) {
                setNanoGptModelsList([...models]);
                safeSessionStorageSet('ellipsisprose_nanogpt_models_cache', models);
                try {
                    localStorage.removeItem('ellipsisprose_nanogpt_models_cache');
                } catch {
                    // Ignore storage quota / privacy errors
                }
            }
        } catch (e) {
            console.warn('Failed to fetch nano-GPT model catalog:', e);
        }
    }, [nanoGptKey]);

    const checkKoboldStatus = useCallback(async (): Promise<void> => {
        setKoboldStatus('checking');
        setKoboldError(null);
        try {
            const res = await checkKoboldCPPStatus(koboldUrl);
            if (res.online) {
                setKoboldStatus('connected');
                const mName = res.model || 'KoboldCPP Loaded Model';
                setKoboldLoadedModel(mName);
                setKoboldModel(mName);
                setKoboldLoadedModelName(mName);
            } else {
                setKoboldStatus('offline');
                setKoboldError(res.error || 'Connection Refused / Server Offline');
            }
        } catch (err) {
            setKoboldStatus('offline');
            const msg = err instanceof Error ? err.message : String(err);
            setKoboldError(msg || 'Failed to connect to KoboldCPP');
        }
    }, [koboldUrl]);

    const refreshCodexModels = useCallback(async (): Promise<void> => {
        const refreshId = ++codexRefreshId.current;
        setCodexStatus({ online: false, model: null, error: null });
        setCodexEmbeddingStatus(null);
        setCodexModelsList([]);
        const result = await fetchCodexCatalog(codexUrl);
        if (refreshId !== codexRefreshId.current) return;
        setCodexEmbeddingStatus(result.embeddingStatus);
        setCodexModelsList(result.models);
        setCodexStatus(result.status);
    }, [codexUrl]);

    const refreshClaudeModels = useCallback(async (): Promise<void> => {
        const refreshId = ++claudeRefreshId.current;
        setClaudeStatus({ online: false, model: null, error: null });
        setClaudeModelsList([]);
        const result = await fetchClaudeCatalog(claudeUrl);
        if (refreshId !== claudeRefreshId.current) return;
        setClaudeModelsList(result.models);
        setClaudeStatus(result.status);
    }, [claudeUrl]);

    const refreshComfyInfo = useCallback(async (): Promise<void> => {
        const refreshId = ++comfyRefreshId.current;
        setComfyStatus({
            online: false,
            version: '',
            device: '',
            error: 'Checking ComfyUI...'
        });
        setComfyOptions({ unet: [], clip: [], vae: [], lora: [], sampler: [], scheduler: [] });
        const result = await fetchComfyInfoCatalog(comfyUrl);
        if (refreshId !== comfyRefreshId.current) return;
        if (result.status.online) {
            setComfyOptions(result.options);
            if (result.defaults.unet) setComfyUnet((value) => value || result.defaults.unet);
            if (result.defaults.clip) setComfyClip((value) => value || result.defaults.clip);
            if (result.defaults.vae) setComfyVae((value) => value || result.defaults.vae);
        }
        setComfyStatus(result.status);
    }, [
        comfyRefreshId,
        comfyUrl,
        setComfyClip,
        setComfyOptions,
        setComfyStatus,
        setComfyUnet,
        setComfyVae
    ]);

    const handleCatalogRefresh = useCallback(
        async (targetProvider: string | null = null): Promise<void> => {
            const prov = targetProvider || devProvider || apiProvider;
            if (prov === 'gemini') {
                await fetchGeminiModels();
                await fetchGeminiImageModels(false);
            } else if (prov === 'openrouter') {
                await refreshOpenRouterModels();
            } else if (prov === 'nanogpt') {
                await refreshNanoGptModels();
            } else if (prov === 'codex') {
                await refreshCodexModels();
            } else if (prov === 'claude') {
                await refreshClaudeModels();
            } else if (prov === 'koboldcpp') {
                await checkKoboldStatus();
            }
        },
        [
            apiProvider,
            checkKoboldStatus,
            devProvider,
            fetchGeminiImageModels,
            fetchGeminiModels,
            refreshClaudeModels,
            refreshCodexModels,
            refreshNanoGptModels,
            refreshOpenRouterModels
        ]
    );

    useEffect(() => {
        const currentComfyRef = comfyRefreshId;
        if (view === 'settings') {
            const activeProviders = new Set([
                devProvider || apiProvider,
                reviewProvider || devProvider || apiProvider,
                proseProvider || devProvider || apiProvider,
                embeddingProvider
            ]);
            if (activeProviders.has('gemini') && apiKey && geminiModelsList.length === 0) {
                void fetchGeminiModels();
            }
            if (
                imageProvider === 'gemini' &&
                (imageApiKey || apiKey) &&
                geminiImageModelsList.length === 0
            ) {
                void fetchGeminiImageModels(false);
            }
            if (activeProviders.has('openrouter') && openRouterModelsList.length === 0) {
                void refreshOpenRouterModels();
            }
            if (activeProviders.has('nanogpt') && nanoGptModelsList.length === 0) {
                void refreshNanoGptModels();
            }
            if (activeProviders.has('koboldcpp')) {
                void checkKoboldStatus();
            }
            if (activeProviders.has('codex') || embeddingProvider === 'codex') {
                void refreshCodexModels();
            }
            if (activeProviders.has('claude')) {
                void refreshClaudeModels();
            }
            if (imageProvider === 'comfyui') void refreshComfyInfo();
        }
        return () => {
            codexRefreshId.current++;
            claudeRefreshId.current++;
            currentComfyRef.current++;
        };
    }, [
        view,
        devProvider,
        reviewProvider,
        proseProvider,
        apiProvider,
        embeddingProvider,
        apiKey,
        imageApiKey,
        openRouterKey,
        nanoGptKey,
        koboldUrl,
        codexUrl,
        claudeUrl,
        imageProvider,
        comfyUrl,
        geminiModelsList.length,
        geminiImageModelsList.length,
        openRouterModelsList.length,
        nanoGptModelsList.length,
        comfyRefreshId,
        fetchGeminiModels,
        fetchGeminiImageModels,
        refreshOpenRouterModels,
        refreshNanoGptModels,
        checkKoboldStatus,
        refreshCodexModels,
        refreshClaudeModels,
        refreshComfyInfo
    ]);

    const searchDeps: UseModelSearchDependencies = {
        devProvider,
        apiKey,
        openRouterKey,
        nanoGptKey,
        geminiModelsList,
        openRouterModelsList,
        nanoGptModelsList,
        fetchGeminiModels
    };

    const devSearch = useModelSearch('Development', devProvider, searchDeps);
    const reviewSearch = useModelSearch('Review', reviewProvider || devProvider, searchDeps);
    const proseSearch = useModelSearch('Prose', proseProvider || devProvider, searchDeps);

    const saveModel = useCallback(
        (modelToSave?: unknown) => {
            const target =
                typeof modelToSave === 'string'
                    ? modelToSave
                    : openRouterModel || geminiModel || nanoGptModel;
            if (target && typeof target === 'string' && !savedModels.includes(target.trim())) {
                setSavedModels([...savedModels, target.trim()]);
            }
        },
        [geminiModel, nanoGptModel, openRouterModel, savedModels]
    );

    const deleteModel = useCallback(
        (modelToDelete: string) => {
            setSavedModels(savedModels.filter((m) => m !== modelToDelete));
        },
        [savedModels]
    );

    const callAI = useCallback(
        async (
            prompt: string,
            systemPrompt: string,
            isJson = true,
            logName = 'AI Task',
            modelRoleOrSize = 'dev'
        ): Promise<string> => {
            const win =
                typeof window !== 'undefined'
                    ? (window as unknown as {
                          callAI?: (
                              p: string,
                              s: string,
                              j: boolean,
                              l: string,
                              r: string
                          ) => Promise<unknown>;
                      })
                    : null;
            if (win && typeof win.callAI === 'function' && win.callAI !== callAI) {
                return String(await win.callAI(prompt, systemPrompt, isJson, logName, modelRoleOrSize));
            }
            const activeStory = storyRef?.current ? storyRef.current : story;
            const res = await dispatchAI(
                { prompt, systemPrompt, isJson, logName, modelRoleOrSize },
                {
                    modelSettings: {
                        apiProvider,
                        devProvider,
                        devModel,
                        reviewProvider,
                        reviewModel,
                        proseProvider,
                        proseModel,
                        geminiModel,
                        openRouterModel,
                        nanoGptModel,
                        codexModel,
                        claudeModel,
                        koboldModel,
                        koboldLoadedModel
                    },
                    thinkingSettings: {
                        enableThinkingAct,
                        enableThinkingScene,
                        enableThinkingWriting,
                        thinkingBudgetAct,
                        thinkingBudgetStoryArc,
                        thinkingBudgetScene,
                        thinkingBudgetWriting
                    },
                    apiKey,
                    openRouterKey,
                    nanoGptKey,
                    koboldUrl,
                    codexUrl,
                    claudeUrl,
                    openRouterMaxTokens,
                    apiTimeout,
                    activeStory: (activeStory || null) as {
                        id?: string;
                        writing_mode?: string;
                    } | null
                },
                {
                    setCurrentPipelineStep,
                    setPromptLog,
                    showToast: stableShowToast,
                    logPipelineDelay
                }
            );
            return typeof res === 'string' ? res : JSON.stringify(res ?? '');
        },
        [
            apiKey,
            apiProvider,
            apiTimeout,
            claudeModel,
            claudeUrl,
            codexModel,
            codexUrl,
            devModel,
            devProvider,
            enableThinkingAct,
            enableThinkingScene,
            enableThinkingWriting,
            geminiModel,
            koboldLoadedModel,
            koboldModel,
            koboldUrl,
            logPipelineDelay,
            nanoGptKey,
            nanoGptModel,
            openRouterKey,
            openRouterMaxTokens,
            openRouterModel,
            proseModel,
            proseProvider,
            reviewModel,
            reviewProvider,
            setCurrentPipelineStep,
            setPromptLog,
            stableShowToast,
            story,
            storyRef,
            thinkingBudgetAct,
            thinkingBudgetScene,
            thinkingBudgetStoryArc,
            thinkingBudgetWriting
        ]
    );

    if (typeof window !== 'undefined') {
        (window as unknown as { callAI?: typeof callAI }).callAI = callAI;
    }

    return {
        enableReview,
        setEnableReview,
        enableStylePolish,
        setEnableStylePolish,
        enableAudioDramaDirectionPass,
        setEnableAudioDramaDirectionPass,
        apiProvider,
        setApiProvider,
        embeddingProvider,
        setEmbeddingProvider,
        apiKey,
        setApiKey,
        apiTimeout,
        setApiTimeout,
        geminiModel,
        setGeminiModel,
        geminiModelsList,
        openRouterKey,
        setOpenRouterKey,
        openRouterModel,
        setOpenRouterModel,
        openRouterMaxTokens,
        setOpenRouterMaxTokens,
        nanoGptKey,
        setNanoGptKey,
        nanoGptModel,
        setNanoGptModel,
        koboldUrl,
        setKoboldUrl,
        koboldModel,
        setKoboldModel,
        codexUrl,
        setCodexUrl,
        codexModel,
        setCodexModel,
        codexModelsList,
        codexStatus,
        codexEmbeddingStatus,
        claudeUrl,
        setClaudeUrl,
        claudeModel,
        setClaudeModel,
        claudeModelsList,
        claudeStatus,
        savedModels,
        setSavedModels,
        openRouterModelsList,
        nanoGptModelsList,
        koboldStatus,
        koboldLoadedModel,
        koboldError,
        devProvider,
        setDevProvider,
        devModel,
        setDevModel,
        reviewProvider,
        setReviewProvider,
        reviewModel,
        setReviewModel,
        proseProvider,
        setProseProvider,
        proseModel,
        setProseModel,
        modelSearchQuery: devSearch.query,
        setModelSearchQuery: devSearch.setQuery,
        isSearchingModels: devSearch.isSearching,
        searchResults: devSearch.results,
        setSearchResults: devSearch.setResults,
        isModelDropdownOpen: devSearch.isDropdownOpen,
        setIsModelDropdownOpen: devSearch.setIsDropdownOpen,
        reviewModelSearchQuery: reviewSearch.query,
        setReviewModelSearchQuery: reviewSearch.setQuery,
        isSearchingReviewModels: reviewSearch.isSearching,
        reviewSearchResults: reviewSearch.results,
        setReviewSearchResults: reviewSearch.setResults,
        isReviewModelDropdownOpen: reviewSearch.isDropdownOpen,
        setIsReviewModelDropdownOpen: reviewSearch.setIsDropdownOpen,
        proseModelSearchQuery: proseSearch.query,
        setProseModelSearchQuery: proseSearch.setQuery,
        isSearchingProseModels: proseSearch.isSearching,
        proseSearchResults: proseSearch.results,
        setProseSearchResults: proseSearch.setResults,
        isProseModelDropdownOpen: proseSearch.isDropdownOpen,
        setIsProseModelDropdownOpen: proseSearch.setIsDropdownOpen,
        useProseModel,
        setUseProseModel,
        geminiProseModel,
        setGeminiProseModel,
        openRouterProseModel,
        setOpenRouterProseModel,
        nanoGptProseModel,
        setNanoGptProseModel,
        koboldProseModel,
        setKoboldProseModel,
        codexProseModel,
        setCodexProseModel,
        enableThinkingAct,
        setEnableThinkingAct,
        enableThinkingScene,
        setEnableThinkingScene,
        enableThinkingWriting,
        setEnableThinkingWriting,
        thinkingBudgetStoryArc,
        setThinkingBudgetStoryArc,
        thinkingBudgetAct,
        setThinkingBudgetAct,
        thinkingBudgetScene,
        setThinkingBudgetScene,
        thinkingBudgetWriting,
        setThinkingBudgetWriting,
        getModelSettingsSnapshot,
        getDefaultModelForProvider,
        sanitizeLocalKoboldModel,
        getEffectiveModelConfig,
        saveModel,
        deleteModel,
        fetchGeminiModels,
        fetchGeminiImageModels,
        refreshOpenRouterModels,
        refreshNanoGptModels,
        checkKoboldStatus,
        refreshCodexModels,
        refreshClaudeModels,
        refreshComfyInfo,
        handleCatalogRefresh,
        callAI
    };
}
