/**
 * @module config/limits
 * Operational timeouts, retry counts, UI debounce/transition delays,
 * cache TTLs, audio DSP/encoding defaults, and RAG/chunking/prompt limits.
 */

export const TIMEOUTS_MS = {
    defaultFetch: 120000,
    embedding: 30000,
    audioCppQueue: 60000,
    masteringWorker: 120000,
    updateManifest: 6000,
    updateGithub: 8000,
    koboldPreflight: 2000,
    mcpSetupSettle: 120
} as const;

export const RETRY_LIMITS = {
    apiMaxRetries: 3,
    embeddingMaxRetries: 3,
    escalationMaxAttempts: 3,
    editorialHarnessMaxAttempts: 3
} as const;

export const UI_DELAYS_MS = {
    searchDebounce: 300,
    textareaDebounce: 350,
    /** How long typing must pause before a cover redraws its title. */
    coverTitleSettle: 600,
    sceneTransition: 420,
    scrollRetry: 60
} as const;

export const CACHE_TTLS_MS = {
    openRouterSmartRouting: 30 * 60 * 1000,
    openRouterStickyPin: 60 * 60 * 1000
} as const;

export const AUDIO_DSP_DEFAULTS = {
    defaultSampleRate: 44100,
    fallbackTtsSampleRate: 24000,
    standardSampleRates: [16000, 22050, 24000, 32000, 44100, 48000] as readonly number[],
    mp3BitrateKbps: 128,
    highPassHz: 75,
    fadeMs: 15,
    narratorTargetLufs: -16.5,
    dialogueTargetLufs: -18.0,
    peakLimitDb: -1.5,
    silenceGateLufs: -70
} as const;

export const RAG_LIMITS = {
    chunkTargetSize: 1800,
    chunkMaxSize: 2500,
    loreTitleMaxChars: 60,
    bm25K1: 1.2,
    bm25Weights: { topic: 4.0, detail: 1.0, related: 2.0 },
    queryExpansionLexical: 6,
    queryExpansionVector: 8,
    distillRawFallbackChars: 10000,
    distillSectionFallbackChars: 2000,
    distillMaxReduceInputChars: 20000,
    distillClusterFallbackChars: 4000
} as const;

export const LOG_AND_PROMPT_LIMITS = {
    promptLogCap: 250,
    responseSnippetChars: 300
} as const;
