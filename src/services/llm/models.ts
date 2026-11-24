/**
 * @module services/llm/models
 * Remote model catalog normalization, search, and fetching for OpenRouter and nano-GPT.
 */

import { NANO_GPT_DEFAULT_MODELS } from '@/config';
import { fetchWithTimeout } from '@/services/http';
import type { ModelDescriptor } from '@/types';

export interface ParsedModelMetadata extends Omit<ModelDescriptor, 'contextLength'> {
    contextLength: number | null;
    maxOutputTokens: number | null;
    capabilities: {
        vision: boolean;
        reasoning: boolean;
        json: boolean;
    };
    pricing: {
        prompt?: number | string | null;
        completion?: number | string | null;
        summary?: string;
    } | null;
    raw?: unknown;
}

export interface NanoGPTSearchResult {
    results: Array<ParsedModelMetadata | ModelDescriptor | string>;
    isFallback: boolean;
    error?: string;
}

export interface OpenRouterCatalogModel {
    id: string;
    name: string;
    description: string;
    contextLength: number | null;
    maxOutputTokens: number | null;
    reasoning: unknown;
    supportedParameters: unknown;
    pricing: unknown;
}

interface RawNanoGPTModelItem {
    id?: string;
    model?: string;
    name?: string;
    display_name?: string;
    title?: string;
    description?: string;
    summary?: string;
    context_length?: number | string;
    context_window?: number | string;
    max_context_length?: number | string;
    max_output_tokens?: number | string;
    max_tokens?: number | string;
    max_completion_tokens?: number | string;
    capabilities?:
        | string[]
        | {
              vision?: boolean;
              image?: boolean;
              reasoning?: boolean;
              thinking?: boolean;
              json?: boolean;
              json_mode?: boolean;
          };
    supports_vision?: boolean;
    vision?: boolean;
    supports_reasoning?: boolean;
    reasoning?: boolean;
    supports_json?: boolean;
    json_mode?: boolean;
    pricing?: {
        prompt?: number | string | null;
        input?: number | string | null;
        prompt_tokens?: number | string | null;
        completion?: number | string | null;
        output?: number | string | null;
        completion_tokens?: number | string | null;
    };
    cost?: unknown;
    price?: unknown;
}

export function parseNanoGPTModelMetadata(item: unknown): ParsedModelMetadata | null {
    if (!item) return null;
    if (typeof item === 'string') {
        return {
            id: item,
            name: item,
            description: '',
            contextLength: null,
            maxOutputTokens: null,
            capabilities: { vision: false, reasoning: false, json: false },
            pricing: null
        };
    }

    const rec = item as RawNanoGPTModelItem;
    const id = rec.id || rec.model || rec.name || 'unknown-model';
    const name = rec.name || rec.display_name || rec.title || id;
    const description = rec.description || rec.summary || '';

    const rawContext = rec.context_length ?? rec.context_window ?? rec.max_context_length;
    const contextLength =
        typeof rawContext === 'number' ? rawContext : parseInt(String(rawContext ?? ''), 10) || null;

    const rawMaxOut = rec.max_output_tokens ?? rec.max_tokens ?? rec.max_completion_tokens;
    const maxOutputTokens =
        typeof rawMaxOut === 'number' ? rawMaxOut : parseInt(String(rawMaxOut ?? ''), 10) || null;

    const capabilities = { vision: false, reasoning: false, json: false };
    if (Array.isArray(rec.capabilities)) {
        rec.capabilities.forEach((cap) => {
            const c = String(cap).toLowerCase();
            if (c.includes('vision') || c.includes('image')) capabilities.vision = true;
            if (c.includes('reasoning') || c.includes('thinking')) capabilities.reasoning = true;
            if (c.includes('json') || c.includes('structured')) capabilities.json = true;
        });
    } else if (typeof rec.capabilities === 'object' && rec.capabilities !== null) {
        capabilities.vision = Boolean(rec.capabilities.vision || rec.capabilities.image);
        capabilities.reasoning = Boolean(rec.capabilities.reasoning || rec.capabilities.thinking);
        capabilities.json = Boolean(rec.capabilities.json || rec.capabilities.json_mode);
    }
    if (rec.supports_vision || rec.vision) capabilities.vision = true;
    if (rec.supports_reasoning || rec.reasoning) capabilities.reasoning = true;
    if (rec.supports_json || rec.json_mode) capabilities.json = true;

    let pricing: ParsedModelMetadata['pricing'] = null;
    if (typeof rec.pricing === 'object' && rec.pricing !== null) {
        pricing = {
            prompt:
                rec.pricing.prompt ?? rec.pricing.input ?? rec.pricing.prompt_tokens ?? null,
            completion:
                rec.pricing.completion ??
                rec.pricing.output ??
                rec.pricing.completion_tokens ??
                null
        };
    } else if (rec.cost || rec.price) {
        pricing = { summary: String(rec.cost || rec.price) };
    }

    return {
        id,
        name,
        description,
        contextLength,
        maxOutputTokens,
        capabilities,
        pricing,
        raw: item
    };
}

export function filterModelsClientSide<
    T extends { id?: string; name?: string; description?: string } | string
>(catalog: ReadonlyArray<T> = [], query = ''): T[] {
    if (!query || !query.trim()) return [...catalog];
    const term = query.trim().toLowerCase();
    return catalog.filter((m) => {
        if (typeof m === 'string') return m.toLowerCase().includes(term);
        const idMatch = Boolean(m.id && m.id.toLowerCase().includes(term));
        const nameMatch = Boolean(m.name && m.name.toLowerCase().includes(term));
        const descMatch = Boolean(m.description && m.description.toLowerCase().includes(term));
        return idMatch || nameMatch || descMatch;
    });
}

export async function fetchNanoGPTModels(
    apiKey = ''
): Promise<ReadonlyArray<ParsedModelMetadata | ModelDescriptor>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    try {
        const response = await fetchWithTimeout(
            'https://nano-gpt.com/api/v1/models?detailed=true',
            { method: 'GET', headers },
            15000
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`nano-GPT Catalog Error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as
            | unknown[]
            | { data?: unknown[]; models?: unknown[]; results?: unknown[] };
        const rawList = Array.isArray(data)
            ? data
            : data.data || data.models || data.results || [];

        const parsedList = rawList
            .map(parseNanoGPTModelMetadata)
            .filter((item): item is ParsedModelMetadata => Boolean(item));

        return parsedList.length > 0 ? parsedList : NANO_GPT_DEFAULT_MODELS;
    } catch (error) {
        console.error('fetchNanoGPTModels failed:', error);
        return NANO_GPT_DEFAULT_MODELS;
    }
}

export async function searchNanoGPTModels(
    query = '',
    apiKey = '',
    cachedCatalog: ReadonlyArray<ParsedModelMetadata | ModelDescriptor | string> = [],
    signal: AbortSignal | null = null
): Promise<NanoGPTSearchResult> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        return { results: [...cachedCatalog], isFallback: false };
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    try {
        const searchUrl = `https://nano-gpt.com/api/explore/search?type=text&q=${encodeURIComponent(
            trimmedQuery
        )}`;
        const response = await fetchWithTimeout(
            searchUrl,
            { method: 'GET', headers, signal },
            10000
        );

        if (!response.ok) {
            throw new Error(`nano-GPT search returned HTTP status ${response.status}`);
        }

        const data = (await response.json()) as
            | unknown[]
            | { results?: unknown[]; data?: unknown[]; models?: unknown[] };
        const rawResults = Array.isArray(data)
            ? data
            : data.results || data.data || data.models || [];

        if (Array.isArray(rawResults) && rawResults.length > 0) {
            const parsedResults = rawResults
                .map(parseNanoGPTModelMetadata)
                .filter((item): item is ParsedModelMetadata => Boolean(item));
            return { results: parsedResults, isFallback: false };
        }

        const fallbackResults = filterModelsClientSide(cachedCatalog, trimmedQuery);
        return { results: fallbackResults, isFallback: false };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;

        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
            'nano-GPT search API call failed; engaging client-side fallback filtering:',
            errMsg
        );

        const fallbackResults = filterModelsClientSide(cachedCatalog, trimmedQuery);
        return {
            results: fallbackResults,
            isFallback: true,
            error: errMsg
        };
    }
}

interface RawOpenRouterCatalogItem {
    id?: string;
    name?: string;
    description?: string;
    context_length?: number | null;
    max_output_tokens?: number | null;
    top_provider?: { max_completion_tokens?: number | null };
    reasoning?: unknown;
    supported_parameters?: unknown;
    pricing?: unknown;
}

export async function fetchOpenRouterModels(apiKey = ''): Promise<OpenRouterCatalogModel[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    try {
        const response = await fetchWithTimeout(
            'https://openrouter.ai/api/v1/models',
            { method: 'GET', headers },
            15000
        );
        if (!response.ok) {
            throw new Error(`OpenRouter HTTP ${response.status}`);
        }
        const data = (await response.json()) as
            | RawOpenRouterCatalogItem[]
            | { data?: RawOpenRouterCatalogItem[] };
        const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : [];
        const models: OpenRouterCatalogModel[] = rawList
            .map((m) => ({
                id: m.id || m.name || '',
                name: m.name || m.id || '',
                description: m.description || '',
                contextLength: m.context_length || null,
                maxOutputTokens:
                    m.top_provider?.max_completion_tokens || m.max_output_tokens || null,
                reasoning: m.reasoning || null,
                supportedParameters: m.supported_parameters || null,
                pricing: m.pricing || null
            }))
            .filter((m) => Boolean(m.id));
        return models;
    } catch (err) {
        console.error('fetchOpenRouterModels failed:', err);
        throw err;
    }
}
