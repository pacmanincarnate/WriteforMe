/**
 * @module config/defaults
 * Default model identifiers across providers/capabilities, ComfyUI defaults,
 * thinking budgets, token ceilings, and API timeout bounds.
 */

export const DEFAULT_LLM_MODELS = {
    gemini: 'gemini-3.8-flash',
    openrouter: 'deepseek/deepseek-flash-latest',
    nanogpt: 'gpt-4o',
    codex: 'gpt-5.6-luna',
    claude: 'sonnet',
    anthropic: 'claude-opus-5-5',
    koboldcpp: 'koboldcpp'
} as const;

export const DEFAULT_SAVED_MODELS: readonly string[] = [DEFAULT_LLM_MODELS.openrouter];

export const DEFAULT_EMBEDDING_MODELS = {
    gemini: 'gemini-embedding-001',
    openrouter: 'qwen/qwen3-embedding-8b',
    nanogpt: 'text-embedding-3-small',
    koboldcpp: 'default',
    codex: 'local'
} as const;

export const DEFAULT_IMAGE_MODELS = {
    gemini: 'gemini-3.1-flash-image',
    openrouter: 'black-forest-labs/flux.2-pro',
    openai: 'gpt-image-2'
} as const;

export const DEFAULT_TTS_MODELS = {
    kokoro: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    geminiTts: 'gemini-3.8-flash-tts',
    geminiTtsLite: 'gemini-3.8-flash-lite-tts'
} as const;

export const DEFAULT_COMFY_CONFIG = {
    loraStrength: 0.8,
    steps: 8,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'simple',
    timeoutSec: 600
} as const;

export const DEFAULT_THINKING_BUDGETS = {
    storyArc: 16384,
    act: 16384,
    scene: 16384,
    writing: 16384
} as const;

export const DEFAULT_TOKEN_LIMITS = {
    openRouterMaxTokens: 65536,
    fallbackMaxOutputTokens: 65536,
    geminiDefaultMaxTokens: 8192
} as const;

export const DEFAULT_API_TIMEOUT_SEC = 300;
export const LEGACY_DEFAULT_API_TIMEOUT_SEC = 120;

export const API_TIMEOUT_BOUNDS = {
    min: 5,
    max: 1800
} as const;

/**
 * Resolves the persisted API timeout, performing a one-time upgrade from the legacy
 * 120s default to 300s unless the user has already migrated or chosen another value.
 */
export function resolveStoredApiTimeout(
    rawValue: string | null,
    migratedFlag: string | null
): { value: number; didMigrate: boolean } {
    if (rawValue !== null) {
        const parsed = parseInt(rawValue, 10);
        if (
            !isNaN(parsed) &&
            parsed >= API_TIMEOUT_BOUNDS.min &&
            parsed <= API_TIMEOUT_BOUNDS.max
        ) {
            if (parsed === LEGACY_DEFAULT_API_TIMEOUT_SEC && migratedFlag !== 'true') {
                return { value: DEFAULT_API_TIMEOUT_SEC, didMigrate: true };
            }
            return { value: parsed, didMigrate: false };
        }
    }
    return { value: DEFAULT_API_TIMEOUT_SEC, didMigrate: false };
}
