/**
 * @module services/llm/openrouter
 * OpenRouter transport client with model-family token limits, smart endpoint
 * routing/price-outlier culling, sticky session provider pinning, Anthropic
 * cache_control breakpoints, and automatic 400/404 fallback retries.
 */

import {
    APP_HTTP_HEADERS,
    CACHE_TTLS_MS,
    CLOUD_API_URLS,
    DEFAULT_LLM_MODELS,
    STORAGE_KEYS
} from '@/config';
import { fetchWithTimeout } from '@/services/http';
import { cleanJson, extractReasoningAndContent } from '@/utils';
import {
    formatOpenAITools,
    type LlmCallOptions,
    type LlmChatMessage,
    type OpenAICompatibleFullResult,
    type OpenAIToolCall
} from './types';

export interface OpenRouterModelLimits {
    maxOutputTokens: number;
    contextLength: number;
    supportsReasoning: boolean;
    reasoningType: 'both' | 'always_on' | 'effort' | 'budget' | 'none';
    minReasoningTokens: number;
    maxReasoningRatio: number;
}

export interface OpenRouterEndpointInfo {
    tag?: string;
    provider_name?: string;
    status?: number;
    uptime_last_30m?: number | null;
    uptime_last_1d?: number | null;
    supports_implicit_caching?: boolean;
    service_tier?: string;
    pricing?: {
        prompt?: number | string;
        completion?: number | string;
    };
}

export interface OpenRouterSmartRoutingProfile {
    maxPrice: { prompt: number; completion: number } | null;
    preferredMinThroughput: number;
    eligibleSlugs: Set<string>;
    providerNameToSlug: Record<string, string>;
}

interface StickyProviderPin {
    slug: string;
    providerName: string;
    misses: number;
    updatedAt: number;
}

interface CachedRoutingEntry {
    fetchedAt: number;
    profile: OpenRouterSmartRoutingProfile | null;
}

interface CachedCatalogModelEntry {
    id?: string;
    name?: string;
    maxOutputTokens?: number;
    contextLength?: number;
    top_provider?: { max_completion_tokens?: number };
    reasoning?: {
        mandatory?: boolean;
        default_enabled?: boolean;
        supported_efforts?: unknown[];
    };
}

interface OpenRouterResponsePayload {
    error?: {
        message?: string;
        code?: number;
        metadata?: {
            raw?: string | { message?: string };
        };
    };
    model?: string;
    provider?: string;
    choices?: Array<{
        finish_reason?: string;
        message?: LlmChatMessage;
    }>;
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
        prompt_tokens_details?: {
            cached_tokens?: number;
            cache_write_tokens?: number;
        };
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}

export const OPENROUTER_SMART_ROUTING_TTL_MS = CACHE_TTLS_MS.openRouterSmartRouting;
export const OPENROUTER_STICKY_PIN_TTL_MS = CACHE_TTLS_MS.openRouterStickyPin;
export const OPENROUTER_PREFERRED_MIN_THROUGHPUT = 35;

const openRouterSmartRoutingCache = new Map<string, CachedRoutingEntry>();
const openRouterEndpointFetchInflight = new Map<string, Promise<OpenRouterSmartRoutingProfile | null>>();
const openRouterStickyProviderMap = new Map<string, StickyProviderPin>();

const getWindowHref = (): string =>
    typeof window !== 'undefined' && window.location ? String(window.location.href || '') : '';

export function getOpenRouterModelLimits(modelId = ''): OpenRouterModelLimits {
    const rawId = String(modelId || '').trim();
    const mid = rawId.toLowerCase();
    const strippedId = mid.replace(
        /^(deepseek|google|anthropic|openai|meta-llama|mistralai|qwen|cohere)\//,
        ''
    );

    // 1. First check session/cached OpenRouter models list if available
    try {
        const cachedStr =
            (typeof sessionStorage !== 'undefined' &&
                sessionStorage.getItem(STORAGE_KEYS.openRouterModelsCache)) ||
            (typeof localStorage !== 'undefined' &&
                localStorage.getItem(STORAGE_KEYS.openRouterModelsCache));
        if (cachedStr) {
            const cachedList = JSON.parse(cachedStr) as CachedCatalogModelEntry[];
            if (Array.isArray(cachedList)) {
                const found = cachedList.find((m) => {
                    if (!m || !m.id) return false;
                    const mId = String(m.id).toLowerCase();
                    const mStripped = mId.replace(
                        /^(deepseek|google|anthropic|openai|meta-llama|mistralai|qwen|cohere)\//,
                        ''
                    );
                    return mId === mid || mStripped === strippedId || m.name?.toLowerCase() === mid;
                });
                if (found) {
                    const catalogMaxOut =
                        found.maxOutputTokens || found.top_provider?.max_completion_tokens;
                    const inferredMax =
                        found.contextLength && found.contextLength >= 131072
                            ? 65536
                            : found.contextLength && found.contextLength >= 32768
                              ? 32768
                              : 16384;
                    const effectiveMaxOut = catalogMaxOut
                        ? Math.max(catalogMaxOut, 16384)
                        : inferredMax;

                    const hasReasoningMetadata = Boolean(
                        found.reasoning &&
                            (found.reasoning.mandatory ||
                                found.reasoning.default_enabled ||
                                (Array.isArray(found.reasoning.supported_efforts) &&
                                    found.reasoning.supported_efforts.length > 0))
                    );
                    const nameSupportsReasoning =
                        mid.includes('thinking') ||
                        mid.includes('reasoner') ||
                        mid.includes('-r1') ||
                        mid.includes('qwq') ||
                        mid.includes('o1') ||
                        mid.includes('o3') ||
                        mid.includes('claude-3-7') ||
                        mid.includes('claude-3.7') ||
                        mid.includes('deepseek-v4') ||
                        mid.includes('v4-flash');

                    const supportsReasoning = Boolean(hasReasoningMetadata || nameSupportsReasoning);
                    let reasoningType: OpenRouterModelLimits['reasoningType'] = 'both';
                    if (found.reasoning?.mandatory || mid.includes('deepseek-r1')) {
                        reasoningType = 'always_on';
                    } else if (
                        found.reasoning?.supported_efforts ||
                        mid.includes('openai/o1') ||
                        mid.includes('openai/o3') ||
                        mid.includes('o1-') ||
                        mid.includes('o3-')
                    ) {
                        reasoningType = 'effort';
                    } else if (mid.includes('claude-3-7') || mid.includes('claude-3.7')) {
                        reasoningType = 'budget';
                    }

                    return {
                        maxOutputTokens: Math.min(Math.max(effectiveMaxOut, 16384), 131072),
                        contextLength: found.contextLength || 128000,
                        supportsReasoning,
                        reasoningType,
                        minReasoningTokens: supportsReasoning ? 1024 : 0,
                        maxReasoningRatio: 0.65
                    };
                }
            }
        }
    } catch {
        // Ignore storage read or parse failure
    }

    // 2. Static mappings with generous, modern token limits for known model families
    if (mid.includes('claude-3-7') || mid.includes('claude-3.7')) {
        return {
            maxOutputTokens: 64000,
            contextLength: 200000,
            supportsReasoning: true,
            reasoningType: 'budget',
            minReasoningTokens: 1024,
            maxReasoningRatio: 0.65
        };
    }
    if (mid.includes('claude-3-5') || mid.includes('claude-3.5') || mid.includes('claude-3-haiku')) {
        return {
            maxOutputTokens: 8192,
            contextLength: 200000,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (mid.includes('claude-3-opus')) {
        return {
            maxOutputTokens: 4096,
            contextLength: 200000,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (
        mid.includes('openai/o1') ||
        mid.includes('openai/o3') ||
        mid.includes('o1-') ||
        mid.includes('o3-')
    ) {
        return {
            maxOutputTokens: 100000,
            contextLength: 200000,
            supportsReasoning: true,
            reasoningType: 'effort',
            minReasoningTokens: 0,
            maxReasoningRatio: 0.7
        };
    }
    if (mid.includes('gpt-4o')) {
        return {
            maxOutputTokens: 16384,
            contextLength: 128000,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (
        mid.includes('gemini-2') ||
        mid.includes('gemini-3') ||
        mid.includes('gemini-flash') ||
        mid.includes('gemini-pro')
    ) {
        return {
            maxOutputTokens: 65536,
            contextLength: 1048576,
            supportsReasoning: true,
            reasoningType: 'both',
            minReasoningTokens: 512,
            maxReasoningRatio: 0.65
        };
    }
    if (
        mid.includes('deepseek-v4') ||
        mid.includes('v4-flash') ||
        mid.includes('deepseek/deepseek-v4')
    ) {
        return {
            maxOutputTokens: 65536,
            contextLength: 1048576,
            supportsReasoning: true,
            reasoningType: 'both',
            minReasoningTokens: 1024,
            maxReasoningRatio: 0.65
        };
    }
    if (mid.includes('deepseek-r1') || mid.includes('deepseek/deepseek-r1')) {
        return {
            maxOutputTokens: 32768,
            contextLength: 65536,
            supportsReasoning: true,
            reasoningType: 'always_on',
            minReasoningTokens: 0,
            maxReasoningRatio: 0.65
        };
    }
    if (mid.includes('deepseek-v3') || mid.includes('deepseek-chat')) {
        return {
            maxOutputTokens: 32768,
            contextLength: 65536,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (mid.includes('qwq') || mid.includes('qvq')) {
        return {
            maxOutputTokens: 32768,
            contextLength: 32768,
            supportsReasoning: true,
            reasoningType: 'both',
            minReasoningTokens: 1024,
            maxReasoningRatio: 0.65
        };
    }
    if (mid.includes('qwen')) {
        return {
            maxOutputTokens: 16384,
            contextLength: 32768,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (mid.includes('llama')) {
        return {
            maxOutputTokens: 16384,
            contextLength: 131072,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }
    if (mid.includes('mistral') || mid.includes('codestral') || mid.includes('mixtral')) {
        return {
            maxOutputTokens: 16384,
            contextLength: 128000,
            supportsReasoning: false,
            reasoningType: 'none',
            minReasoningTokens: 0,
            maxReasoningRatio: 0
        };
    }

    const isGenericReasoning =
        mid.includes('deepseek') ||
        mid.includes('thinking') ||
        mid.includes('reasoner') ||
        mid.includes('-r1') ||
        mid.includes('flash') ||
        mid.includes('qwq');
    return {
        maxOutputTokens: 32768,
        contextLength: 128000,
        supportsReasoning: isGenericReasoning,
        reasoningType: isGenericReasoning ? 'both' : 'none',
        minReasoningTokens: isGenericReasoning ? 1024 : 0,
        maxReasoningRatio: 0.65
    };
}

export function supportsExplicitOpenRouterCacheControl(modelId = ''): boolean {
    const mid = String(modelId || '').trim().toLowerCase();
    return mid.startsWith('anthropic/') || mid.includes('/claude-');
}

export function hasExplicitOpenRouterRoutingSuffix(modelId = ''): boolean {
    const mid = String(modelId || '').trim().toLowerCase();
    return mid === 'openrouter/auto' || /:(floor|nitro|free|exacto|online)$/.test(mid);
}

export function extractOpenRouterProviderSlug(endpoint: OpenRouterEndpointInfo = {}): string {
    const tagSlug = String(endpoint?.tag || '').split('/')[0].trim().toLowerCase();
    if (tagSlug && /^[a-z0-9][a-z0-9._-]*$/.test(tagSlug)) return tagSlug;
    const nameSlug = String(endpoint?.provider_name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
    return nameSlug && /^[a-z0-9][a-z0-9._-]*$/.test(nameSlug) ? nameSlug : '';
}

export function computeOpenRouterSmartRoutingProfile(
    endpoints: OpenRouterEndpointInfo[] = []
): OpenRouterSmartRoutingProfile {
    const list = Array.isArray(endpoints) ? endpoints : [];
    const paid = list.filter(
        (e) => Number(e?.pricing?.prompt) > 0 && Number(e?.pricing?.completion) > 0
    );
    const healthy = paid.filter(
        (e) =>
            (e.status === 0 || e.status === undefined) &&
            (e.uptime_last_30m == null || e.uptime_last_30m >= 95) &&
            (e.uptime_last_1d == null || e.uptime_last_1d >= 90)
    );
    const pool = healthy.length > 0 ? healthy : paid;

    const buildLookup = (
        items: OpenRouterEndpointInfo[]
    ): { eligibleSlugs: Set<string>; providerNameToSlug: Record<string, string> } => {
        const eligibleSlugs = new Set<string>();
        const providerNameToSlug: Record<string, string> = {};
        const implicitByName: Record<string, boolean> = {};
        for (const e of items) {
            const slug = extractOpenRouterProviderSlug(e);
            if (!slug) continue;
            eligibleSlugs.add(slug);
            const pName = String(e?.provider_name || '').trim().toLowerCase();
            if (pName) {
                const hasImplicit = e?.supports_implicit_caching !== false;
                if (!providerNameToSlug[pName] || (hasImplicit && !implicitByName[pName])) {
                    providerNameToSlug[pName] = slug;
                    implicitByName[pName] = hasImplicit;
                }
            }
        }
        return { eligibleSlugs, providerNameToSlug };
    };

    if (pool.length < 2) {
        const { eligibleSlugs, providerNameToSlug } = buildLookup(pool);
        return {
            maxPrice: null,
            preferredMinThroughput: OPENROUTER_PREFERRED_MIN_THROUGHPUT,
            eligibleSlugs,
            providerNameToSlug
        };
    }

    const isPremiumTier = (e: OpenRouterEndpointInfo): boolean =>
        /^(priority|ultrafast|fast)$/i.test(String(e?.service_tier || '')) ||
        /\/(fast|ultrafast|priority)$/i.test(String(e?.tag || ''));
    const isDiscountTier = (e: OpenRouterEndpointInfo): boolean =>
        /^(flex|spot|batch)$/i.test(String(e?.service_tier || '')) ||
        /\/(flex|spot|batch)$/i.test(String(e?.tag || ''));
    const standardOnly = pool.filter((e) => !isPremiumTier(e) && !isDiscountTier(e));
    const nonPremium = pool.filter((e) => !isPremiumTier(e));
    const basePool =
        standardOnly.length > 0 ? standardOnly : nonPremium.length > 0 ? nonPremium : pool;

    const allIn = pool.map((e) => Number(e.pricing?.prompt) * 1e6).sort((a, b) => a - b);
    const allOut = pool.map((e) => Number(e.pricing?.completion) * 1e6).sort((a, b) => a - b);
    const baseIn = basePool.map((e) => Number(e.pricing?.prompt) * 1e6).sort((a, b) => a - b);
    const baseOut = basePool.map((e) => Number(e.pricing?.completion) * 1e6).sort((a, b) => a - b);

    const p25 = (arr: number[]): number => arr[Math.floor((arr.length - 1) * 0.25)];
    const p50 = (arr: number[]): number => arr[Math.floor(arr.length / 2)];
    const medIn = p50(baseIn);
    const medOut = p50(baseOut);
    const hasOutliers =
        allIn[allIn.length - 1] > medIn * 1.35 || allOut[allOut.length - 1] > medOut * 1.35;

    if (hasOutliers) {
        const maxPrompt = Number(
            Math.min(medIn * 1.5, Math.max(p25(baseIn) * 3.0, medIn * 1.15)).toFixed(6)
        );
        const maxCompletion = Number(
            Math.min(medOut * 1.5, Math.max(p25(baseOut) * 3.0, medOut * 1.15)).toFixed(6)
        );
        const eligible = pool.filter(
            (e) =>
                Number(e.pricing?.prompt) * 1e6 <= maxPrompt * 1.001 &&
                Number(e.pricing?.completion) * 1e6 <= maxCompletion * 1.001
        );
        if (eligible.length > 0) {
            const { eligibleSlugs, providerNameToSlug } = buildLookup(eligible);
            return {
                maxPrice: { prompt: maxPrompt, completion: maxCompletion },
                preferredMinThroughput: OPENROUTER_PREFERRED_MIN_THROUGHPUT,
                eligibleSlugs,
                providerNameToSlug
            };
        }
    }

    const { eligibleSlugs, providerNameToSlug } = buildLookup(pool);
    return {
        maxPrice: null,
        preferredMinThroughput: OPENROUTER_PREFERRED_MIN_THROUGHPUT,
        eligibleSlugs,
        providerNameToSlug
    };
}

export async function getOpenRouterSmartRouting(
    modelId = ''
): Promise<OpenRouterSmartRoutingProfile | null> {
    const rawMid = String(modelId || '').trim().toLowerCase();
    if (!rawMid || !rawMid.includes('/') || hasExplicitOpenRouterRoutingSuffix(rawMid)) return null;
    const baseMid = rawMid.split(':')[0];
    const slashIdx = baseMid.indexOf('/');
    if (slashIdx <= 0) return null;
    const author = baseMid.slice(0, slashIdx);
    const slug = baseMid.slice(slashIdx + 1);
    if (!author || !slug) return null;

    const memCached = openRouterSmartRoutingCache.get(baseMid);
    if (memCached && Date.now() - memCached.fetchedAt < OPENROUTER_SMART_ROUTING_TTL_MS) {
        return memCached.profile;
    }

    const storageKey = `ellipsisprose_or_smart_route_v1:${baseMid}`;
    try {
        const rawStored =
            typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey) : null;
        if (rawStored) {
            const parsed = JSON.parse(rawStored) as {
                fetchedAt?: number;
                profile?: {
                    maxPrice: { prompt: number; completion: number } | null;
                    preferredMinThroughput: number;
                    eligibleSlugs?: string[];
                    providerNameToSlug: Record<string, string>;
                };
            };
            if (
                parsed &&
                parsed.fetchedAt &&
                Date.now() - parsed.fetchedAt < OPENROUTER_SMART_ROUTING_TTL_MS &&
                parsed.profile
            ) {
                const hydrated: OpenRouterSmartRoutingProfile = {
                    ...parsed.profile,
                    eligibleSlugs: new Set(
                        Array.isArray(parsed.profile.eligibleSlugs)
                            ? parsed.profile.eligibleSlugs
                            : []
                    )
                };
                openRouterSmartRoutingCache.set(baseMid, {
                    fetchedAt: parsed.fetchedAt,
                    profile: hydrated
                });
                return hydrated;
            }
        }
    } catch {
        // Ignore corrupt sessionStorage entries
    }

    const inflight = openRouterEndpointFetchInflight.get(baseMid);
    if (inflight) {
        return inflight;
    }

    const fetchPromise = (async (): Promise<OpenRouterSmartRoutingProfile | null> => {
        try {
            const url = `${CLOUD_API_URLS.openRouterModels}/${encodeURIComponent(
                author
            )}/${encodeURIComponent(slug)}/endpoints`;
            const res = await fetchWithTimeout(url, { method: 'GET' }, 4000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as { data?: { endpoints?: OpenRouterEndpointInfo[] } };
            const profile = computeOpenRouterSmartRoutingProfile(json?.data?.endpoints || []);
            const now = Date.now();
            openRouterSmartRoutingCache.set(baseMid, { fetchedAt: now, profile });
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem(
                        storageKey,
                        JSON.stringify({
                            fetchedAt: now,
                            profile: {
                                ...profile,
                                eligibleSlugs: Array.from(profile.eligibleSlugs || [])
                            }
                        })
                    );
                }
            } catch {
                // Ignore sessionStorage quota failures
            }
            return profile;
        } catch (err) {
            console.warn(
                `[OpenRouter] Smart routing metadata unavailable for '${baseMid}':`,
                err instanceof Error ? err.message : err
            );
            openRouterSmartRoutingCache.set(baseMid, {
                fetchedAt: Date.now() - OPENROUTER_SMART_ROUTING_TTL_MS + 60000,
                profile: null
            });
            return null;
        } finally {
            openRouterEndpointFetchInflight.delete(baseMid);
        }
    })();

    openRouterEndpointFetchInflight.set(baseMid, fetchPromise);
    return fetchPromise;
}

export function clearOpenRouterRoutingState(): void {
    openRouterSmartRoutingCache.clear();
    openRouterEndpointFetchInflight.clear();
    openRouterStickyProviderMap.clear();
    try {
        if (typeof sessionStorage !== 'undefined') {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith('ellipsisprose_or_smart_route_v1:')) {
                    sessionStorage.removeItem(k);
                }
            }
        }
    } catch {
        // Ignore sessionStorage access errors
    }
}

export async function callOpenRouter(
    apiKey: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson = true,
    options: LlmCallOptions = {}
): Promise<unknown> {
    try {
        const key = apiKey ? apiKey.trim() : '';
        if (!key) throw new Error('OpenRouter API Key is missing. Please add it in Settings.');

        const modelId = model || DEFAULT_LLM_MODELS.openrouter;
        const limits = getOpenRouterModelLimits(modelId);

        const requestedTokens =
            options.max_tokens !== undefined ? options.max_tokens : limits.maxOutputTokens;
        let targetMaxTokens = Math.min(limits.maxOutputTokens, Math.max(8192, requestedTokens));

        const hasTools = Boolean(options.tools && Array.isArray(options.tools) && options.tools.length > 0);
        const baseMessages: LlmChatMessage[] = (
            options.messages || [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        ).map((m) => ({ ...m }));

        let appliedExplicitCacheControl = false;
        let messages = baseMessages;
        if (supportsExplicitOpenRouterCacheControl(modelId)) {
            let markedSystem = false;
            messages = baseMessages.map((m, idx) => {
                if (
                    !markedSystem &&
                    m.role === 'system' &&
                    typeof m.content === 'string' &&
                    m.content.length >= 512
                ) {
                    markedSystem = true;
                    appliedExplicitCacheControl = true;
                    return {
                        ...m,
                        content: [
                            { type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }
                        ]
                    };
                }
                if (
                    !options.messages &&
                    idx === baseMessages.length - 1 &&
                    m.role === 'user' &&
                    typeof options.cacheSplitIndex === 'number' &&
                    options.cacheSplitIndex >= 1024 &&
                    typeof prompt === 'string' &&
                    options.cacheSplitIndex < prompt.length
                ) {
                    appliedExplicitCacheControl = true;
                    return {
                        ...m,
                        content: [
                            {
                                type: 'text',
                                text: prompt.slice(0, options.cacheSplitIndex),
                                cache_control: { type: 'ephemeral' }
                            },
                            { type: 'text', text: prompt.slice(options.cacheSplitIndex) }
                        ]
                    };
                }
                return m;
            });
        }

        const logLower = String(options.logName || '').toLowerCase();
        const isReviewRoleCall = options.modelRole === 'review';
        const isWriting = Boolean(
            options.isWritingAgent ||
                options.agentType === 'writing' ||
                (options.logName &&
                    ((options.logName.includes('Writing Agent') &&
                        !options.logName.includes('Review') &&
                        !options.logName.includes('Surgical')) ||
                        options.logName.includes('Prose Generator') ||
                        options.logName.includes('Prose Writer')))
        );

        const isCreativeArchitecture =
            !isWriting &&
            !isReviewRoleCall &&
            Boolean(
                options.isCreativeArchitecture ||
                    options.agentType === 'architecture' ||
                    options.agentType === 'creative_architecture' ||
                    logLower.includes('conceptual') ||
                    logLower.includes('character') ||
                    logLower.includes('story arc') ||
                    logLower.includes('act agent') ||
                    logLower.includes('act planner') ||
                    logLower.includes('scene agent') ||
                    logLower.includes('scene expander') ||
                    logLower.includes('scene roster') ||
                    logLower.includes('scene weaver') ||
                    logLower.includes('sequence agent') ||
                    logLower.includes('beat agent') ||
                    logLower.includes('directive') ||
                    logLower.includes('lore')
            );

        const defaultTemp = isWriting ? 0.85 : isCreativeArchitecture ? 0.75 : 0.6;
        const hasExplicitSuffix = hasExplicitOpenRouterRoutingSuffix(modelId);
        const smartRouting =
            !hasExplicitSuffix && !options.disableSmartRouting
                ? await getOpenRouterSmartRouting(modelId)
                : null;
        const normalizedSessionId =
            options.sessionId && String(options.sessionId).trim()
                ? String(options.sessionId).trim().slice(0, 256)
                : '';

        let pinned: StickyProviderPin | null = normalizedSessionId
            ? (openRouterStickyProviderMap.get(normalizedSessionId) ?? null)
            : null;
        if (pinned) {
            const pinExpired = Date.now() - pinned.updatedAt >= OPENROUTER_STICKY_PIN_TTL_MS;
            const pinExcluded = Boolean(
                smartRouting?.eligibleSlugs &&
                    smartRouting.eligibleSlugs.size > 0 &&
                    !smartRouting.eligibleSlugs.has(pinned.slug)
            );
            if (pinExpired || pinExcluded) {
                openRouterStickyProviderMap.delete(normalizedSessionId);
                pinned = null;
            }
        }

        const providerObj: Record<string, unknown> = {
            allow_fallbacks: true,
            data_collection: 'allow'
        };
        let appliedSmartRouting = false;
        if (!hasExplicitSuffix && smartRouting) {
            if (smartRouting.maxPrice) {
                providerObj.max_price = smartRouting.maxPrice;
                appliedSmartRouting = true;
            }
            if (smartRouting.preferredMinThroughput) {
                providerObj.preferred_min_throughput = smartRouting.preferredMinThroughput;
                appliedSmartRouting = true;
            }
            if (pinned?.slug) {
                providerObj.order = [pinned.slug];
                appliedSmartRouting = true;
            }
        } else if (!hasExplicitSuffix) {
            providerObj.preferred_min_throughput = OPENROUTER_PREFERRED_MIN_THROUGHPUT;
            appliedSmartRouting = true;
        }

        const payload: Record<string, unknown> = {
            model: modelId,
            messages,
            temperature: options.temperature !== undefined ? options.temperature : defaultTemp,
            transforms: ['middle-out'],
            provider: providerObj,
            ...(normalizedSessionId ? { session_id: normalizedSessionId } : {}),
            ...(hasTools ? { tools: formatOpenAITools(options.tools) } : {})
        };

        if (options.min_p !== undefined) {
            payload.min_p = options.min_p;
        } else if (isWriting) {
            payload.min_p = 0.05;
        } else if (isCreativeArchitecture) {
            payload.min_p = 0.06;
        }

        if (options.top_p !== undefined) {
            payload.top_p = options.top_p;
        } else if (isWriting) {
            payload.top_p = 0.98;
        } else if (isCreativeArchitecture) {
            payload.top_p = 0.98;
        }

        const isThinkingEnabled = Boolean(
            options.thinking &&
                options.thinking.enabled &&
                ((options.thinking.budget || 0) > 0 ||
                    (options.thinking.effort && options.thinking.effort !== 'none'))
        );

        let reasoningPayload: Record<string, unknown> | undefined;
        if (isThinkingEnabled && limits.supportsReasoning) {
            if (limits.reasoningType === 'effort') {
                const budget = options.thinking?.budget || 0;
                reasoningPayload = {
                    effort:
                        options.thinking?.effort ||
                        (budget <= 2048 ? 'low' : budget <= 4096 ? 'medium' : 'high')
                };
                targetMaxTokens = Math.min(
                    limits.maxOutputTokens,
                    Math.max(targetMaxTokens, 32768)
                );
            } else if (limits.reasoningType === 'always_on') {
                reasoningPayload = { exclude: false };
                targetMaxTokens = limits.maxOutputTokens;
            } else {
                const minGenHeadroom =
                    limits.maxOutputTokens > 32768
                        ? 24576
                        : limits.maxOutputTokens > 16384
                          ? 12288
                          : 8192;
                const maxAllowableBudget = Math.max(
                    limits.minReasoningTokens || 1024,
                    limits.maxOutputTokens - minGenHeadroom
                );

                let safeBudget = Math.min(options.thinking?.budget || 4096, maxAllowableBudget);
                if (limits.minReasoningTokens && safeBudget < limits.minReasoningTokens) {
                    safeBudget = limits.minReasoningTokens;
                }

                reasoningPayload = {
                    max_tokens: safeBudget,
                    exclude: false
                };

                targetMaxTokens = Math.min(
                    limits.maxOutputTokens,
                    Math.max(safeBudget + minGenHeadroom, targetMaxTokens)
                );
                if (targetMaxTokens <= safeBudget) {
                    targetMaxTokens = Math.min(
                        limits.maxOutputTokens,
                        safeBudget + (limits.maxOutputTokens > 16384 ? 8192 : 4096)
                    );
                }
            }
        } else if (limits.supportsReasoning) {
            if (limits.reasoningType === 'always_on') {
                reasoningPayload = { exclude: false };
                targetMaxTokens = limits.maxOutputTokens;
            } else {
                reasoningPayload = { effort: 'none' };
                targetMaxTokens = Math.min(
                    limits.maxOutputTokens,
                    Math.max(targetMaxTokens, limits.maxOutputTokens > 16384 ? 32768 : 8192)
                );
            }
        }
        if (reasoningPayload) {
            payload.reasoning = reasoningPayload;
        }

        targetMaxTokens = Math.min(limits.maxOutputTokens, Math.max(1024, targetMaxTokens));
        payload.max_tokens = targetMaxTokens;
        payload.max_completion_tokens = targetMaxTokens;

        const sendChatCompletion = (): Promise<Response> =>
            fetchWithTimeout(
                CLOUD_API_URLS.openRouterChat,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': getWindowHref(),
                        'X-Title': APP_HTTP_HEADERS.title
                    },
                    body: JSON.stringify(payload)
                },
                options.timeout
            );

        let response = await sendChatCompletion();

        if (!response.ok) {
            const parseErrBody = async (): Promise<{
                errText: string;
                errObj: NonNullable<OpenRouterResponsePayload['error']>;
                errMsg: string;
            }> => {
                const errText = await response.text();
                let errJson: OpenRouterResponsePayload | null;
                try {
                    errJson = JSON.parse(errText) as OpenRouterResponsePayload;
                } catch {
                    errJson = null;
                }
                const errObj = errJson?.error || {};
                const errMsg = errObj.message || errText || `HTTP ${response.status}`;
                return { errText, errObj, errMsg };
            };

            let { errObj, errMsg } = await parseErrBody();

            if (
                response.status === 400 &&
                (payload.reasoning as Record<string, unknown> | undefined)?.effort === 'none' &&
                (errMsg.toLowerCase().includes('reasoning is mandatory') ||
                    errMsg.toLowerCase().includes('cannot be disabled'))
            ) {
                console.warn(
                    `[OpenRouter] Model '${modelId}' requires reasoning; retrying with minimal excluded reasoning...`
                );
                payload.reasoning = { effort: 'low', exclude: true };
                response = await sendChatCompletion();
                if (!response.ok) {
                    ({ errObj, errMsg } = await parseErrBody());
                }
            }

            if (
                !response.ok &&
                response.status === 400 &&
                appliedExplicitCacheControl &&
                errMsg.toLowerCase().includes('cache_control')
            ) {
                console.warn(
                    `[OpenRouter] Model '${modelId}' rejected cache_control; retrying with plain string messages...`
                );
                appliedExplicitCacheControl = false;
                payload.messages = baseMessages;
                response = await sendChatCompletion();
                if (!response.ok) {
                    ({ errObj, errMsg } = await parseErrBody());
                }
            }

            if (
                !response.ok &&
                (response.status === 404 || response.status === 400) &&
                appliedSmartRouting &&
                /no allowed providers|no endpoints|max_price|preferred_min_throughput|provider/i.test(
                    errMsg
                )
            ) {
                console.warn(
                    `[OpenRouter] Smart routing constraints rejected for '${modelId}' (${errMsg}); retrying with standard fallback routing...`
                );
                appliedSmartRouting = false;
                const cacheKey = String(modelId || '').trim().toLowerCase().split(':')[0];
                openRouterSmartRoutingCache.delete(cacheKey);
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem(`ellipsisprose_or_smart_route_v1:${cacheKey}`);
                    }
                } catch {
                    // Ignore sessionStorage removal failure
                }
                if (normalizedSessionId) openRouterStickyProviderMap.delete(normalizedSessionId);
                payload.provider = { allow_fallbacks: true, data_collection: 'allow' };
                response = await sendChatCompletion();
                if (!response.ok) {
                    ({ errObj, errMsg } = await parseErrBody());
                }
            }

            if (!response.ok) {
                const errCode = errObj.code || response.status;
                const upstreamRaw = errObj.metadata?.raw;
                const upstreamMsg = upstreamRaw
                    ? ` [Upstream: ${
                          typeof upstreamRaw === 'string'
                              ? upstreamRaw
                              : upstreamRaw.message || JSON.stringify(upstreamRaw)
                      }]`
                    : '';

                if (response.status === 401) {
                    throw new Error(
                        `OpenRouter Authorization Failed (401): Please verify your API Key in Settings. Details: ${errMsg}`
                    );
                } else if (
                    response.status === 402 ||
                    errCode === 402 ||
                    errMsg.toLowerCase().includes('insufficient credits') ||
                    errMsg.toLowerCase().includes('credit')
                ) {
                    throw new Error(
                        `OpenRouter Insufficient Credits (402): Your OpenRouter account is out of credits. Please refill at ${CLOUD_API_URLS.openRouterCreditsPage}. Details: ${errMsg}`
                    );
                } else if (response.status === 403) {
                    throw new Error(
                        `OpenRouter Access Forbidden (403): Request was blocked by moderation or permissions. Details: ${errMsg}`
                    );
                } else if (
                    response.status === 404 ||
                    errMsg.toLowerCase().includes('not found') ||
                    errMsg.toLowerCase().includes('no such model')
                ) {
                    throw new Error(
                        `OpenRouter Model Not Found (404): Model '${modelId}' is not available or has been deprecated. Please select a valid model in Settings.`
                    );
                } else if (response.status === 429) {
                    throw new Error(
                        `OpenRouter Rate Limit Exceeded (429): ${errMsg}${upstreamMsg}`
                    );
                } else if (response.status === 400) {
                    throw new Error(`OpenRouter Bad Request (400): ${errMsg}${upstreamMsg}`);
                }
                throw new Error(`OpenRouter Error (${response.status}): ${errMsg}${upstreamMsg}`);
            }
        }

        const responseText = await response.text();
        if (!responseText || !responseText.trim()) {
            throw new Error('OpenRouter returned an empty response body.');
        }

        let data: OpenRouterResponsePayload;
        try {
            data = JSON.parse(responseText) as OpenRouterResponsePayload;
        } catch (e) {
            throw new Error(`OpenRouter returned invalid JSON: ${responseText.substring(0, 200)}`, {
                cause: e
            });
        }
        if (data.error) {
            const errObj = data.error;
            const errMsg = errObj.message || JSON.stringify(errObj);
            const errCode = errObj.code || 500;
            if (
                errCode === 402 ||
                errMsg.toLowerCase().includes('insufficient credits') ||
                errMsg.toLowerCase().includes('credit')
            ) {
                throw new Error(`OpenRouter Insufficient Credits (402): ${errMsg}`);
            }
            throw new Error(`OpenRouter API returned error: ${errMsg}`);
        }

        const choice = data.choices?.[0] || {};
        const finishReason = choice.finish_reason;
        const msg: LlmChatMessage = choice.message || { role: 'assistant' };
        const rawText = typeof msg.content === 'string' ? msg.content : '';
        const initialReasoning = msg.reasoning || msg.reasoning_content || '';
        const toolCalls: OpenAIToolCall[] = msg.tool_calls || [];

        const usage = data.usage || {};
        const cachedToks =
            Number(
                usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? 0
            ) || 0;
        const cacheWriteToks =
            Number(
                usage.prompt_tokens_details?.cache_write_tokens ??
                    usage.cache_creation_input_tokens ??
                    0
            ) || 0;
        const routedProvider = data.provider || null;
        if (normalizedSessionId && routedProvider && smartRouting?.providerNameToSlug) {
            const resolvedSlug =
                smartRouting.providerNameToSlug[String(routedProvider).trim().toLowerCase()];
            if (
                resolvedSlug &&
                (!smartRouting.eligibleSlugs?.size || smartRouting.eligibleSlugs.has(resolvedSlug))
            ) {
                const now = Date.now();
                if (!pinned) {
                    openRouterStickyProviderMap.set(normalizedSessionId, {
                        slug: resolvedSlug,
                        providerName: routedProvider,
                        misses: 0,
                        updatedAt: now
                    });
                } else if (pinned.slug === resolvedSlug) {
                    pinned.misses = 0;
                    pinned.updatedAt = now;
                } else {
                    pinned.misses = (pinned.misses || 0) + 1;
                    pinned.updatedAt = now;
                    if (pinned.misses >= 2) {
                        openRouterStickyProviderMap.set(normalizedSessionId, {
                            slug: resolvedSlug,
                            providerName: routedProvider,
                            misses: 0,
                            updatedAt: now
                        });
                    }
                }
            }
        }

        if (toolCalls.length > 0 || options.returnFullData) {
            if (options.onSuccess) {
                const rToks =
                    usage.completion_tokens_details?.reasoning_tokens || usage.reasoning_tokens || 0;
                options.onSuccess({
                    modelUsed: data.model || modelId,
                    tokensUsed: usage.total_tokens || null,
                    promptTokens: usage.prompt_tokens ?? null,
                    responseTokens: usage.completion_tokens ?? null,
                    thinkingTokens: rToks,
                    reasoningTokensUsed: rToks,
                    cachedTokens: cachedToks,
                    cacheWriteTokens: cacheWriteToks,
                    routedProvider,
                    reasoningText: initialReasoning,
                    fullResponse: rawText
                });
            }
            const fullResult: OpenAICompatibleFullResult = {
                tool_calls: toolCalls,
                text: rawText,
                reasoningText: initialReasoning,
                message: msg,
                data: data as unknown as Record<string, unknown>
            };
            return fullResult;
        }

        const extracted = extractReasoningAndContent(rawText, initialReasoning);
        const text = extracted.text;
        const reasoningText = extracted.reasoningText;

        const reportedReasoningToks =
            usage.completion_tokens_details?.reasoning_tokens || usage.reasoning_tokens || 0;
        const thinkingToks =
            reportedReasoningToks > 0
                ? reportedReasoningToks
                : reasoningText
                  ? Math.round(reasoningText.trim().split(/\s+/).length * 1.33)
                  : 0;
        const respToks =
            usage.completion_tokens !== undefined
                ? usage.completion_tokens
                : text
                  ? Math.round(text.trim().split(/\s+/).length * 1.33)
                  : 0;

        if (finishReason === 'length') {
            if (!text || !text.trim()) {
                throw new Error(
                    `OpenRouter model (${data.model || modelId}) exceeded thinking budget (${thinkingToks} tokens used, finish_reason: "length") without generating response output.`
                );
            } else if (isJson) {
                throw new Error(
                    `OpenRouter model (${data.model || modelId}) output was cut off at token limit (finish_reason: "length", ${respToks} completion tokens). Incomplete structured JSON received.`
                );
            } else {
                console.warn(
                    `[OpenRouter] Generation completed with finish_reason: "length". Output may be partially truncated (${respToks} tokens).`
                );
            }
        }

        if (!text || !text.trim()) {
            if (reasoningText) {
                throw new Error(
                    `OpenRouter model (${data.model || modelId}) exhausted token budget during thinking phase without generating final content.`
                );
            }
            throw new Error(
                `OpenRouter returned no content. Response payload: ${JSON.stringify(data)}`
            );
        }

        if (options.onSuccess) {
            const promptToks =
                usage.prompt_tokens !== undefined && usage.prompt_tokens !== null
                    ? usage.prompt_tokens
                    : prompt
                      ? Math.round(
                            ((systemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/)
                                .length * 1.33
                        )
                      : null;
            options.onSuccess({
                modelUsed: data.model || modelId,
                tokensUsed:
                    usage.total_tokens ||
                    (promptToks !== null && respToks !== null
                        ? promptToks + respToks + thinkingToks
                        : null),
                promptTokens: promptToks,
                responseTokens: respToks,
                thinkingTokens: thinkingToks,
                reasoningTokensUsed: thinkingToks,
                cachedTokens: cachedToks,
                cacheWriteTokens: cacheWriteToks,
                routedProvider,
                reasoningText,
                fullResponse: text
            });
        }

        if (isJson) {
            try {
                return JSON.parse(cleanJson(text));
            } catch (e) {
                console.error('OpenRouter JSON Parse Error. Raw Text:', text);
                throw new Error(
                    `Failed to parse OpenRouter response as JSON. Check console for details. Raw snippet: ${String(
                        text
                    ).substring(0, 150)}`,
                    { cause: e }
                );
            }
        }
        return text;
    } catch (error) {
        console.error('OpenRouter Error:', error);
        throw error;
    }
}
