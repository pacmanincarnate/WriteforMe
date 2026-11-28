/**
 * @module config/storageKeys
 * Central registry of browser localStorage/sessionStorage keys, prefixes,
 * IndexedDB database/object-store definitions, and legacy storage identifiers.
 */

export const STORAGE_PREFIXES = {
    app: 'ellipsisprose_',
    kokoro: 'kokoro_'
} as const;

export const STORAGE_KEYS = {
    activeStoryId: 'ellipsisprose_active_story_id',
    anthropicKey: 'ellipsisprose_anthropic_key',
    anthropicModel: 'ellipsisprose_anthropic_model',
    apiProvider: 'ellipsisprose_api_provider',
    apiTimeout: 'ellipsisprose_api_timeout',
    apiTimeoutMigratedV2: 'ellipsisprose_api_timeout_migrated_v2',
    audioDramaSettings: 'ellipsisprose_audio_drama_settings',
    bannedPhrases: 'ellipsisprose_banned_phrases',
    claudeModel: 'ellipsisprose_claude_model',
    claudeUrl: 'ellipsisprose_claude_url',
    codexModel: 'ellipsisprose_codex_model',
    codexProseModel: 'ellipsisprose_codex_prose_model',
    codexUrl: 'ellipsisprose_codex_url',
    comfyCfg: 'ellipsisprose_comfy_cfg',
    comfyClip: 'ellipsisprose_comfy_clip',
    comfyLora: 'ellipsisprose_comfy_lora',
    comfyLoraStrength: 'ellipsisprose_comfy_lora_strength',
    comfySampler: 'ellipsisprose_comfy_sampler',
    comfyScheduler: 'ellipsisprose_comfy_scheduler',
    comfySteps: 'ellipsisprose_comfy_steps',
    comfyTimeoutSec: 'ellipsisprose_comfy_timeout_sec',
    comfyUnet: 'ellipsisprose_comfy_unet',
    comfyUrl: 'ellipsisprose_comfy_url',
    comfyVae: 'ellipsisprose_comfy_vae',
    customImageStyles: 'ellipsisprose_custom_image_styles',
    customModes: 'ellipsisprose_custom_modes',
    devModel: 'ellipsisprose_dev_model',
    devProvider: 'ellipsisprose_dev_provider',
    directiveCascade: 'ellipsisprose_directive_cascade',
    directiveVerify: 'ellipsisprose_directive_verify',
    draftAuthorNote: 'ellipsisprose_draft_author_note',
    draftBookType: 'ellipsisprose_draft_book_type',
    draftConcept: 'ellipsisprose_draft_concept',
    draftCustomWords: 'ellipsisprose_draft_custom_words',
    draftLoreFiles: 'ellipsisprose_draft_lore_files',
    draftSerial: 'ellipsisprose_draft_serial',
    draftSerialRotation: 'ellipsisprose_draft_serial_rotation',
    draftSeriesOpener: 'ellipsisprose_draft_series_opener',
    draftSeriesTitle: 'ellipsisprose_draft_series_title',
    draftTitle: 'ellipsisprose_draft_title',
    draftWritingMode: 'ellipsisprose_draft_writing_mode',
    editorialAutopilot: 'ellipsisprose_editorial_autopilot',
    editorialDeepLlm: 'ellipsisprose_editorial_deep_llm',
    embeddingProvider: 'ellipsisprose_embedding_provider',
    enableAudioDramaDirection: 'ellipsisprose_enable_audio_drama_direction',
    enableMcpBridge: 'ellipsisprose_enable_mcp_bridge',
    enableNarrativeLenses: 'ellipsisprose_enable_narrative_lenses',
    enableNarrativeLensesV2: 'ellipsisprose_enable_narrative_lenses_v2',
    enableReview: 'ellipsisprose_enable_review',
    enableStylePolish: 'ellipsisprose_enable_style_polish',
    enableThinkingAct: 'ellipsisprose_enable_thinking_act',
    enableThinkingScene: 'ellipsisprose_enable_thinking_scene',
    enableThinkingWriting: 'ellipsisprose_enable_thinking_writing',
    geminiApiKey: 'gemini_api_key',
    geminiImageModelsCache: 'ellipsisprose_gemini_image_models_cache',
    geminiModel: 'ellipsisprose_gemini_model',
    geminiProseModel: 'ellipsisprose_gemini_prose_model',
    imageApiKey: 'ellipsisprose_image_api_key',
    imageModel: 'ellipsisprose_image_model',
    imageProvider: 'ellipsisprose_image_provider',
    inspectorMode: 'ellipsisprose_inspector_mode',
    koboldModel: 'ellipsisprose_kobold_model',
    koboldProseModel: 'ellipsisprose_kobold_prose_model',
    koboldUrl: 'ellipsisprose_kobold_url',
    kokoroLastDtype: 'kokoro_last_dtype',
    kokoroOptIn: 'kokoro_opt_in',
    librarySortBy: 'ellipsisprose_library_sort_by',
    libraryViewMode: 'ellipsisprose_library_view_mode',
    matrixView: 'ellipsisprose_matrix_view',
    nanoGptKey: 'ellipsisprose_nanogpt_key',
    nanoGptModel: 'ellipsisprose_nanogpt_model',
    nanoGptModelsCache: 'ellipsisprose_nanogpt_models_cache',
    nanoGptProseModel: 'ellipsisprose_nanogpt_prose_model',
    openRouterImageModelsCache: 'ellipsisprose_openrouter_image_models_cache',
    openRouterKey: 'ellipsisprose_openrouter_key',
    openRouterMaxTokens: 'ellipsisprose_openrouter_max_tokens',
    openRouterModel: 'ellipsisprose_openrouter_model',
    openRouterModelsCache: 'ellipsisprose_openrouter_models_cache',
    openRouterProseModel: 'ellipsisprose_openrouter_prose_model',
    preloadReloadOnce: 'ellipsisprose_preload_reload_once',
    proseModel: 'ellipsisprose_prose_model',
    proseProvider: 'ellipsisprose_prose_provider',
    ragFingerprint: 'ellipsisprose_rag_fingerprint',
    readerSettings: 'ellipsisprose_reader_settings',
    reviewModel: 'ellipsisprose_review_model',
    reviewProvider: 'ellipsisprose_review_provider',
    savedModels: 'ellipsisprose_saved_models',
    selectedAct: 'ellipsisprose_selectedAct',
    selectedChapter: 'ellipsisprose_selectedChapter',
    selectedScene: 'ellipsisprose_selectedScene',
    selectedSequence: 'ellipsisprose_selectedSequence',
    settingsTab: 'ellipsisprose_settings_tab',
    sidebarCollapsed: 'ellipsisprose_sidebar_collapsed',
    skippedUpdateKey: 'ellipsisprose_skipped_update_key',
    slopConfigV1: 'ellipsisprose_slop_config_v1',
    story: 'ellipsisprose_story',
    theme: 'ellipsisprose_theme',
    thinkingBudgetAct: 'ellipsisprose_thinking_budget_act',
    thinkingBudgetScene: 'ellipsisprose_thinking_budget_scene',
    thinkingBudgetStoryArc: 'ellipsisprose_thinking_budget_story_arc',
    thinkingBudgetWriting: 'ellipsisprose_thinking_budget_writing',
    useProseModel: 'ellipsisprose_use_prose_model',
    view: 'ellipsisprose_view'
} as const;

export const IDB_DATABASES = {
    story: {
        name: 'EllipsisStoryStore',
        version: 1,
        stores: { stories: 'stories' }
    },
    audio: {
        name: 'EllipsisAudioStore',
        version: 2,
        stores: { sceneAudio: 'scene_audio', sequenceAudio: 'sequence_audio' }
    },
    image: {
        name: 'EllipsisImageStore',
        version: 1,
        stores: { images: 'images' }
    },
    log: {
        name: 'EllipsisLogStore',
        version: 1,
        stores: { logs: 'logs' }
    },
    studioCache: {
        name: 'EllipsisStudioCache',
        version: 1,
        stores: { voices: 'voices', renders: 'renders' }
    },
    vector: {
        name: 'EllipsisVectorStore',
        version: 1,
        stores: { vectors: 'vectors' }
    }
} as const;

export const LEGACY_STORY_RECORD_ID = 'current_story';
