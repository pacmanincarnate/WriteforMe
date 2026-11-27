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
    openrouter: 'black-forest-labs/flux.2-pro'
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

export const DEFAULT_API_TIMEOUT_SEC = 120;

export const API_TIMEOUT_BOUNDS = {
    min: 5,
    max: 1800
} as const;
