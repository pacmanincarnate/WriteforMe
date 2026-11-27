/**
 * @module services/rag/embeddingService
 * Multi-provider text embedding client with exponential backoff for Gemini, OpenRouter,
 * nano-GPT, KoboldCPP, Codex Bridge, and the desktop app's built-in llama.cpp model.
 */

import {
    APP_HTTP_HEADERS,
    CLOUD_API_URLS,
    DEFAULT_EMBEDDING_MODELS,
    DEFAULT_SERVICE_URLS,
    LOCAL_PORTS,
    RETRY_LIMITS,
    TIMEOUTS_MS
} from '@/config';
import { fetchWithTimeout } from '@/services/http';
import { withCloudActivity, withLocalGpuLease } from '@/services/vram';
import { embedLocally, isLocalEmbeddingAvailable } from './localEmbedding';

export type EmbeddingProvider =
    | 'gemini'
    | 'openrouter'
    | 'nanogpt'
    | 'koboldcpp'
    | 'codex'
    | 'llamacpp'
    | string;

/** A search embeds a query; the index embeds documents. Only the built-in model tells them apart. */
export type EmbeddingKind = 'query' | 'document';

function isLocalKoboldEmbeddingUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        return (host === '127.0.0.1' || host === 'localhost') && port === String(LOCAL_PORTS.koboldcpp);
    } catch {
        return false;
    }
}

/** Multi-provider embedding API client with rate-limit backoff retries. */
export class EmbeddingService {
    public apiKey: string;
    public provider: EmbeddingProvider;
    public baseUrl: string;
    public codexUrl: string;
    /** The built-in model's id; part of the index fingerprint, so a new model re-indexes. */
    public localModel: string;

    constructor(
        apiKey = '',
        provider: EmbeddingProvider = 'gemini',
        baseUrl: string = DEFAULT_SERVICE_URLS.koboldcpp,
        codexUrl: string = DEFAULT_SERVICE_URLS.codexBridge,
        localModel: string = DEFAULT_EMBEDDING_MODELS.llamacpp
    ) {
        this.apiKey = apiKey;
        this.provider = provider;
        this.baseUrl = baseUrl;
        this.codexUrl = codexUrl;
        this.localModel = localModel || DEFAULT_EMBEDDING_MODELS.llamacpp;
    }

    isConfigured(): boolean {
        if (this.provider === 'llamacpp') return isLocalEmbeddingAvailable();
        return this.provider === 'koboldcpp' || this.provider === 'codex' || Boolean(this.apiKey);
    }

    getProviderLabel(): string {
        if (this.provider === 'llamacpp') return `llamacpp|${this.localModel}`;
        return `${this.provider}|${(DEFAULT_EMBEDDING_MODELS as Record<string, string>)[this.provider]}`;
    }

    async getEmbedding(text: string, kind: EmbeddingKind = 'document'): Promise<number[] | null> {
        if (!text || !text.trim()) return null;
        if (this.provider === 'llamacpp') {
            // Runs on the processor in the desktop app, so it takes no GPU lease.
            return embedLocally(this.localModel, text, kind);
        } else if (this.provider === 'gemini') {
            return withCloudActivity(() => this.getGeminiEmbedding(text));
        } else if (this.provider === 'nanogpt') {
            return withCloudActivity(() => this.getNanoGPTEmbedding(text));
        } else if (this.provider === 'koboldcpp') {
            return this.getKoboldCPPEmbedding(text);
        } else if (this.provider === 'codex') {
            return withCloudActivity(() => this.getCodexEmbedding(text));
        } else {
            return withCloudActivity(() => this.getOpenRouterEmbedding(text));
        }
    }

    static async fetchWithBackoff(
        url: string,
        options: RequestInit,
        timeoutMs: number = TIMEOUTS_MS.embedding,
        maxRetries: number = RETRY_LIMITS.embeddingMaxRetries
    ): Promise<Response> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            if (response.status === 429 || response.status === 503) {
                if (attempt === maxRetries) return response;
                const retryAfter = response.headers.get('Retry-After');
                const delayMs = retryAfter
                    ? parseFloat(retryAfter) * 1000
                    : 1000 * Math.pow(2, attempt) + Math.random() * 500;
                console.warn(
                    `[EmbeddingService] HTTP ${response.status} rate-limited. Retrying in ${Math.round(
                        delayMs
                    )}ms (attempt ${attempt + 1}/${maxRetries})...`
                );
                await new Promise((r) => setTimeout(r, delayMs));
                continue;
            }
            return response;
        }
        throw new Error('[EmbeddingService] Unreachable retry exhaustion');
    }

    async fetchWithBackoff(
        url: string,
        options: RequestInit,
        timeoutMs: number = TIMEOUTS_MS.embedding,
        maxRetries: number = RETRY_LIMITS.embeddingMaxRetries
    ): Promise<Response> {
        return EmbeddingService.fetchWithBackoff(url, options, timeoutMs, maxRetries);
    }

    async getGeminiEmbedding(text: string): Promise<number[] | null> {
        const model = DEFAULT_EMBEDDING_MODELS.gemini;
        const url = `${CLOUD_API_URLS.geminiModels}/${model}:embedContent`;
        const response = await this.fetchWithBackoff(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
                body: JSON.stringify({
                    model: `models/${model}`,
                    content: { parts: [{ text }] }
                })
            },
            TIMEOUTS_MS.embedding
        );
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini Embedding Failed: ${response.status} - ${err}`);
        }
        const data = (await response.json()) as { embedding?: { values?: number[] } };
        return data.embedding?.values ?? null;
    }

    async getOpenRouterEmbedding(text: string): Promise<number[] | null> {
        const model = DEFAULT_EMBEDDING_MODELS.openrouter;
        const referer =
            typeof window !== 'undefined' && window.location ? window.location.href : '';

        const response = await this.fetchWithBackoff(
            CLOUD_API_URLS.openRouterEmbeddings,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': referer,
                    'X-Title': APP_HTTP_HEADERS.title
                },
                body: JSON.stringify({
                    model,
                    input: text
                })
            },
            TIMEOUTS_MS.embedding
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter Embedding Failed: ${response.status} - ${err}`);
        }

        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        return data.data?.[0]?.embedding ?? null;
    }

    async getNanoGPTEmbedding(text: string): Promise<number[] | null> {
        const key = this.apiKey ? this.apiKey.trim() : '';
        if (!key) throw new Error('nano-GPT API Key is missing. Please add it in Settings.');

        const response = await this.fetchWithBackoff(
            CLOUD_API_URLS.nanoGptEmbeddings,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: DEFAULT_EMBEDDING_MODELS.nanogpt,
                    input: text
                })
            },
            TIMEOUTS_MS.embedding
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`nano-GPT Embedding Failed: ${response.status} - ${err}`);
        }

        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        return data.data?.[0]?.embedding ?? null;
    }

    async getCodexEmbedding(text: string): Promise<number[] | null> {
        const cleanUrl =
            this.codexUrl && String(this.codexUrl).trim()
                ? String(this.codexUrl).trim().replace(/\/+$/, '')
                : DEFAULT_SERVICE_URLS.codexBridge;
        const response = await this.fetchWithBackoff(
            `${cleanUrl}/v1/embeddings`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'default', input: text })
            },
            0
        ); // The first request may need to download the local model.
        if (!response.ok) {
            const err = await response.text();
            throw new Error(
                `Codex Bridge Embedding Failed: ${response.status} - ${err}. Run "npm run codex-bridge" (with "npm install" done once for local embeddings).`
            );
        }
        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        return data.data?.[0]?.embedding ?? null;
    }

    async getKoboldCPPEmbedding(text: string): Promise<number[] | null> {
        const cleanUrl =
            this.baseUrl && String(this.baseUrl).trim()
                ? String(this.baseUrl).trim().replace(/\/+$/, '')
                : DEFAULT_SERVICE_URLS.koboldcpp;
        const doFetch = (): Promise<Response> =>
            this.fetchWithBackoff(
                `${cleanUrl}/v1/embeddings`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'default',
                        input: text
                    })
                },
                TIMEOUTS_MS.embedding
            );
        const response = isLocalKoboldEmbeddingUrl(cleanUrl)
            ? await withLocalGpuLease('llm', { koboldUrl: cleanUrl }, doFetch)
            : await doFetch();

        if (!response.ok) {
            const err = await response.text();
            throw new Error(
                `KoboldCPP Embedding Failed: ${response.status} - ${err}. Please ensure KoboldCPP is running on port ${LOCAL_PORTS.koboldcpp} with --embedding flag enabled.`
            );
        }

        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        return data.data?.[0]?.embedding ?? null;
    }
}
