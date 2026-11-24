export type ProviderId = 'gemini' | 'openrouter' | 'nanogpt' | 'koboldcpp' | 'codex';
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
