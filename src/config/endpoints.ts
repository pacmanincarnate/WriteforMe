/**
 * @module config/endpoints
 * Central registry of local service ports/URLs, cloud provider API endpoints,
 * application HTTP identity headers, and pinned CDN dependencies.
 */

import ports from './ports.json';

export const LOCAL_PORTS = ports as {
    readonly web: number;
    readonly mcpBridge: number;
    readonly koboldcpp: number;
    readonly codexBridge: number;
    readonly claudeBridge: number;
    readonly audioStudioBridge: number;
    readonly audioCpp: number;
    readonly comfyui: number;
};

export const DEFAULT_SERVICE_URLS = {
    web: `http://localhost:${LOCAL_PORTS.web}`,
    koboldcpp: `http://localhost:${LOCAL_PORTS.koboldcpp}`,
    codexBridge: `http://localhost:${LOCAL_PORTS.codexBridge}`,
    claudeBridge: `http://localhost:${LOCAL_PORTS.claudeBridge}`,
    audioStudioBridge: `http://127.0.0.1:${LOCAL_PORTS.audioStudioBridge}`,
    audioCpp: `http://127.0.0.1:${LOCAL_PORTS.audioCpp}`,
    comfyui: `http://127.0.0.1:${LOCAL_PORTS.comfyui}`,
    mcpBridge: `ws://127.0.0.1:${LOCAL_PORTS.mcpBridge}`
} as const;

export const CLOUD_API_URLS = {
    geminiBase: 'https://generativelanguage.googleapis.com/v1beta',
    geminiModels: 'https://generativelanguage.googleapis.com/v1beta/models',
    geminiInteractions: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    geminiApiKeysPage: 'https://aistudio.google.com/app/apikey',
    openRouterBase: 'https://openrouter.ai/api/v1',
    openRouterChat: 'https://openrouter.ai/api/v1/chat/completions',
    openRouterImages: 'https://openrouter.ai/api/v1/images',
    openRouterModels: 'https://openrouter.ai/api/v1/models',
    openRouterEmbeddings: 'https://openrouter.ai/api/v1/embeddings',
    openRouterAudioSpeech: 'https://openrouter.ai/api/v1/audio/speech',
    openRouterCreditsPage: 'https://openrouter.ai/credits',
    openRouterKeysPage: 'https://openrouter.ai/keys',
    nanoGptBase: 'https://nano-gpt.com/api/v1',
    nanoGptChat: 'https://nano-gpt.com/api/v1/chat/completions',
    nanoGptModels: 'https://nano-gpt.com/api/v1/models?detailed=true',
    nanoGptSearch: 'https://nano-gpt.com/api/explore/search',
    nanoGptEmbeddings: 'https://nano-gpt.com/api/v1/embeddings',
    nanoGptHomePage: 'https://nano-gpt.com',
    anthropicBase: 'https://api.anthropic.com',
    anthropicMessages: 'https://api.anthropic.com/v1/messages',
    anthropicKeysPage: 'https://console.anthropic.com/settings/keys',
    openAiImages: 'https://api.openai.com/v1/images/generations',
    openAiKeysPage: 'https://platform.openai.com/api-keys',
    githubApiRepos: 'https://api.github.com/repos'
} as const;

export const APP_HTTP_HEADERS = {
    referer: 'https://ellipsisprose.ai',
    title: 'EllipsisProse',
    audioDramaTitle: 'EllipsisProse Audio Drama'
} as const;

export const CDN_URLS = {
    lamejs: 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js',
    transformersJs: 'https://esm.sh/@huggingface/transformers@3.3.3',
    transformersWasmPath: 'https://esm.sh/@huggingface/transformers@3.3.3/dist/',
    kokoroJs: 'https://esm.sh/kokoro-js@1.2.0',
    kokoroModelBase: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main',
    kokoroModelQuantized:
        'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx',
    kokoroVoicesBase:
        'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/'
} as const;
