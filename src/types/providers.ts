import { DEFAULT_SERVICE_URLS } from '@/config/endpoints';

export type ProviderId = 'gemini' | 'openrouter' | 'nanogpt' | 'koboldcpp' | 'codex' | 'claude';

/**
 * Providers served by a local CLI bridge (codex-bridge.js, claude-bridge.js). Both speak the same
 * OpenAI-compatible contract and run on the user's own CLI login, so they share one code path.
 */
export const CLI_BRIDGE_DEFAULT_URLS = {
    codex: DEFAULT_SERVICE_URLS.codexBridge,
    claude: DEFAULT_SERVICE_URLS.claudeBridge
} as const;
export type CliBridgeProviderId = keyof typeof CLI_BRIDGE_DEFAULT_URLS;

export function isCliBridgeProvider(provider: unknown): provider is CliBridgeProviderId {
    return provider === 'codex' || provider === 'claude';
}

/** A provider that runs on this computer (KoboldCPP or a CLI bridge) rather than a cloud API. */
export function isLocalProvider(provider: unknown): boolean {
    return provider === 'koboldcpp' || isCliBridgeProvider(provider);
}
export type ModelRole = 'all' | 'dev' | 'review' | 'prose';
export type ImageProviderId = 'gemini' | 'openrouter' | 'comfyui' | string;

export interface ProviderModelConfig {
    provider: ProviderId;
    model?: string;
    role?: ModelRole;
    apiKey?: string;
    baseUrl?: string;
}

export interface ModelDescriptor {
    id: string;
    name: string;
    description?: string;
    contextLength?: number;
    capabilities?: {
        vision?: boolean;
        json?: boolean;
        reasoning?: boolean;
        [key: string]: unknown;
    };
}
