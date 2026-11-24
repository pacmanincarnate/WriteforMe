import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NANO_GPT_DEFAULT_MODELS } from '@/config';
import {
    callGemini,
    callKoboldCPP,
    callNanoGPT,
    callOpenRouter,
    checkKoboldCPPStatus,
    clearOpenRouterRoutingState,
    computeOpenRouterSmartRoutingProfile,
    fetchNanoGPTModels,
    fetchOpenRouterModels,
    filterModelsClientSide,
    formatOpenAITools,
    getOpenRouterModelLimits,
    getOpenRouterSmartRouting,
    isCloudModelName,
    parseNanoGPTModelMetadata,
    searchNanoGPTModels,
    supportsExplicitOpenRouterCacheControl
} from '@/services/llm';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    clearOpenRouterRoutingState();
    sessionStorage.clear();
    localStorage.clear();
    delete (window as unknown as { koboldLoadedModelGlobal?: string }).koboldLoadedModelGlobal;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    clearOpenRouterRoutingState();
    sessionStorage.clear();
    localStorage.clear();
    delete (window as unknown as { koboldLoadedModelGlobal?: string }).koboldLoadedModelGlobal;
    vi.restoreAllMocks();
});

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });

describe('services/llm callGemini', () => {
    it('validates key, configures Gemini 2 vs 3 thinking, parses JSON, and fires telemetry', async () => {
        await expect(callGemini('', 'gemini-2.5-flash', 'hi', 'sys', false)).rejects.toThrow(
            'API Key is missing'
        );

        const capturedPayloads: Array<Record<string, unknown>> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) => {
            capturedPayloads.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
            return jsonResponse({
                candidates: [
                    {
                        content: {
                            parts: [
                                { thought: true, text: 'reasoning steps' },
                                { text: '{"scene":"Pier Four"}' }
                            ]
                        }
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 40,
                    thoughtsTokenCount: 25,
                    totalTokenCount: 165,
                    cachedContentTokenCount: 50
                }
            });
        });

        let reportedTokens = 0;
        let reportedCached = 0;
        const parsed25 = await callGemini('gem-key', 'gemini-2.5-pro', 'prompt', 'system', true, {
            thinking: { enabled: true, budget: 3000 },
            onSuccess: (m) => {
                reportedTokens = m.tokensUsed || 0;
                reportedCached = m.cachedTokens || 0;
            }
        });
        expect(parsed25).toEqual({ scene: 'Pier Four' });
        expect(reportedTokens).toBe(165);
        expect(reportedCached).toBe(50);
        expect(
            (capturedPayloads[0].generationConfig as { thinkingConfig?: unknown }).thinkingConfig
        ).toEqual({ thinkingBudget: 3000 });

        await callGemini('gem-key', 'gemini-3-flash', 'prompt', 'system', false, {
            thinking: { enabled: true, budget: 2048 }
        });
        expect(
            (capturedPayloads[1].generationConfig as { thinkingConfig?: unknown }).thinkingConfig
        ).toEqual({ thinkingLevel: 'LOW' });
    });

    it('returns full functionCalls structure when tools produce functionCall parts', async () => {
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'inspect_character_state',
                                        args: { character_id: 'Maren' }
                                    }
                                }
                            ]
                        }
                    }
                ]
            })
        );

        const res = (await callGemini('gem-key', 'gemini-2.5-flash', 'hi', 'sys', false, {
            tools: [
                {
                    name: 'inspect_character_state',
                    description: 'desc',
                    parameters: { type: 'object', properties: {} }
                }
            ]
        })) as { functionCalls: Array<{ name: string }> };

        expect(res.functionCalls).toHaveLength(1);
        expect(res.functionCalls[0].name).toBe('inspect_character_state');
    });
});

describe('services/llm OpenRouter smart routing & callOpenRouter', () => {
    it('computes model limits and smart routing profiles with outlier culling and caching', async () => {
        const claudeLimits = getOpenRouterModelLimits('anthropic/claude-3.7-sonnet');
        expect(claudeLimits.supportsReasoning).toBe(true);
        expect(claudeLimits.reasoningType).toBe('budget');
        expect(supportsExplicitOpenRouterCacheControl('anthropic/claude-3.7-sonnet')).toBe(true);
        expect(supportsExplicitOpenRouterCacheControl('deepseek/deepseek-v4')).toBe(false);

        const profile = computeOpenRouterSmartRoutingProfile([
            {
                tag: 'deepinfra/turbo',
                provider_name: 'DeepInfra',
                status: 0,
                uptime_last_30m: 99,
                pricing: { prompt: '0.0000005', completion: '0.0000010' }
            },
            {
                tag: 'together/standard',
                provider_name: 'Together',
                status: 0,
                uptime_last_30m: 99,
                pricing: { prompt: '0.0000006', completion: '0.0000012' }
            },
            {
                tag: 'expensive/fast',
                provider_name: 'ExpensiveHost',
                service_tier: 'priority',
                status: 0,
                pricing: { prompt: '0.0000050', completion: '0.0000100' }
            }
        ]);
        expect(profile.maxPrice).not.toBeNull();
        expect(profile.eligibleSlugs.has('deepinfra')).toBe(true);
        expect(profile.eligibleSlugs.has('expensive')).toBe(false);

        const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                data: {
                    endpoints: [
                        {
                            tag: 'deepinfra',
                            provider_name: 'DeepInfra',
                            status: 0,
                            pricing: { prompt: '0.0000005', completion: '0.0000010' }
                        }
                    ]
                }
            })
        );
        globalThis.fetch = fetchSpy;

        const [p1, p2] = await Promise.all([
            getOpenRouterSmartRouting('deepseek/deepseek-chat'),
            getOpenRouterSmartRouting('deepseek/deepseek-chat')
        ]);
        expect(p1?.eligibleSlugs.has('deepinfra')).toBe(true);
        expect(p2?.eligibleSlugs.has('deepinfra')).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles cache_control 400 retry, mandatory reasoning retry, sticky pinning, and length/auth errors', async () => {
        const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.includes('/endpoints')) {
                return jsonResponse({
                    data: {
                        endpoints: [
                            {
                                tag: 'anthropic',
                                provider_name: 'Anthropic',
                                status: 0,
                                pricing: { prompt: '0.000003', completion: '0.000015' }
                            }
                        ]
                    }
                });
            }
            const parsedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
            requests.push({ url: urlStr, body: parsedBody });
            if (requests.length === 1) {
                return jsonResponse(
                    { error: { message: 'cache_control block rejected by backend' } },
                    400
                );
            }
            return jsonResponse({
                model: 'anthropic/claude-3.7-sonnet',
                provider: 'Anthropic',
                choices: [{ finish_reason: 'stop', message: { content: 'Harbor bells tolled.' } }],
                usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
            });
        });

        const longSystem = 'Canon system instructions. '.repeat(30);
        const text = await callOpenRouter(
            'or-key',
            'anthropic/claude-3.7-sonnet',
            'Write scene.',
            longSystem,
            false,
            { sessionId: 'sess-1' }
        );
        expect(text).toBe('Harbor bells tolled.');
        // First request injected cache_control block; retry reverted to plain string messages
        expect(
            Array.isArray((requests[0].body.messages as Array<{ content: unknown }>)[0].content)
        ).toBe(true);
        expect(
            typeof (requests[1].body.messages as Array<{ content: unknown }>)[0].content
        ).toBe('string');

        // Mandatory reasoning retry + smart-routing fallback check
        clearOpenRouterRoutingState();
        const bodies2: Array<Record<string, unknown>> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.includes('/endpoints')) {
                return jsonResponse({ data: { endpoints: [] } });
            }
            const parsed = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
            bodies2.push(parsed);
            if (bodies2.length === 1) {
                return jsonResponse(
                    { error: { message: 'Reasoning is mandatory for this model' } },
                    400
                );
            }
            if (bodies2.length === 2) {
                return jsonResponse({ error: { message: 'No allowed providers match' } }, 404);
            }
            return jsonResponse({
                choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }]
            });
        });

        const res2 = await callOpenRouter(
            'or-key',
            'google/gemini-2.5-flash',
            'go',
            'sys',
            true
        );
        expect(res2).toEqual({ ok: true });
        expect(bodies2[0].reasoning).toEqual({ effort: 'none' });
        expect(bodies2[1].reasoning).toEqual({ effort: 'low', exclude: true });

        // 401 and length truncation errors
        globalThis.fetch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ error: { message: 'Bad key' } }, 401));
        await expect(
            callOpenRouter('bad', 'openai/gpt-4o', 'hi', 'sys', false, {
                disableSmartRouting: true
            })
        ).rejects.toThrow('OpenRouter Authorization Failed (401)');

        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                choices: [{ finish_reason: 'length', message: { content: '{"partial":' } }],
                usage: { completion_tokens: 99 }
            })
        );
        await expect(
            callOpenRouter('k', 'openai/gpt-4o', 'hi', 'sys', true, {
                disableSmartRouting: true
            })
        ).rejects.toThrow('Incomplete structured JSON received');
    });
});

describe('services/llm nano-GPT, KoboldCPP & formatOpenAITools', () => {
    it('configures callNanoGPT reasoning flags for GLM vs non-GLM models', async () => {
        const bodies: Array<Record<string, unknown>> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
            return jsonResponse({
                model: 'glm-4.5',
                choices: [{ message: { content: '{"ok":1}' } }],
                usage: { total_tokens: 42 }
            });
        });

        await callNanoGPT('ng-key', 'gpt-4o', 'p', 's', true);
        expect(bodies[0].reasoning_effort).toBe('none');
        expect(bodies[0].response_format).toEqual({ type: 'json_object' });

        await callNanoGPT('ng-key', 'zhipuai/glm-4.5', 'p', 's', false);
        expect(bodies[1].reasoning_effort).toBeUndefined();
    });

    it('detects cloud models, adapts KoboldCPP 5/6-arg signatures, and checks status', async () => {
        expect(isCloudModelName('anthropic/claude-3.7-sonnet')).toBe(true);
        expect(isCloudModelName('gemini-2.5-flash')).toBe(true);
        expect(isCloudModelName('local-gguf-q4')).toBe(false);

        (window as unknown as { koboldLoadedModelGlobal?: string }).koboldLoadedModelGlobal =
            'gemma-3-local';
        const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            sent.push({
                url: String(url),
                body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
            });
            return jsonResponse({
                choices: [{ message: { content: 'Salt clung to the timber.' } }]
            });
        });

        // 5-arg legacy signature + cloud model name sanitization + audio drama DRY/XTC settings
        const out = await callKoboldCPP(
            'anthropic/claude-3.5-sonnet',
            'prompt',
            'MANDATORY OVERRIDE: AUDIO DRAMA SCRIPT',
            false,
            { isWritingAgent: true }
        );
        expect(out).toBe('Salt clung to the timber.');
        expect(sent[0].url).toBe('http://localhost:5001/v1/chat/completions');
        expect(sent[0].body.model).toBe('gemma-3-local');
        expect(sent[0].body.xtc_probability).toBeUndefined();
        expect(sent[0].body.dry_multiplier).toBe(0.5);

        // 6-arg custom host signature + thinking suppresses response_format & grammar
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            sent.push({
                url: String(url),
                body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
            });
            return jsonResponse({
                choices: [{ message: { content: '{"ok":true}' } }]
            });
        });
        const jsonOut = await callKoboldCPP('localhost:5010', 'my-codex-model', 'p', 's', true, {
            provider: 'codex',
            thinking: { enabled: true, budget: 2048 },
            grammar: 'root ::= "ok"'
        });
        expect(jsonOut).toEqual({ ok: true });
        expect(sent[1].url).toBe('http://localhost:5010/v1/chat/completions');
        expect(sent[1].body.response_format).toBeUndefined();
        expect(sent[1].body.grammar).toBeUndefined();

        globalThis.fetch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ data: [{ id: 'Qwen3-32B-Q4' }] }));
        expect(await checkKoboldCPPStatus('http://127.0.0.1:5001/')).toEqual({
            online: true,
            model: 'Qwen3-32B-Q4',
            error: null
        });

        globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'));
        expect(await checkKoboldCPPStatus()).toEqual({
            online: false,
            model: null,
            error: 'Connection Refused / Server Offline'
        });

        expect(
            formatOpenAITools([
                { name: 't1', description: 'd1', parameters: { type: 'object' } }
            ])
        ).toEqual([
            {
                type: 'function',
                function: { name: 't1', description: 'd1', parameters: { type: 'object' } }
            }
        ]);
    });
});

describe('services/llm model catalogs', () => {
    it('normalizes nano-GPT metadata, filters client-side, and handles search fallback', async () => {
        const parsed = parseNanoGPTModelMetadata({
            id: 'deepseek/deepseek-r1',
            name: 'DeepSeek R1',
            context_length: '65536',
            max_output_tokens: 16384,
            capabilities: ['reasoning', 'json'],
            pricing: { prompt: 0.5, completion: 1.5 }
        });
        expect(parsed?.contextLength).toBe(65536);
        expect(parsed?.capabilities.reasoning).toBe(true);
        expect(parsed?.capabilities.json).toBe(true);

        const filtered = filterModelsClientSide(
            [
                { id: 'alpha', name: 'Alpha' },
                { id: 'beta', name: 'Beta Writer' }
            ],
            'writer'
        );
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toMatchObject({ id: 'beta' });

        globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'));
        const defaultCatalog = await fetchNanoGPTModels('');
        expect(defaultCatalog).toBe(NANO_GPT_DEFAULT_MODELS);

        const searchFallback = await searchNanoGPTModels('beta', '', filtered);
        expect(searchFallback.isFallback).toBe(true);
        expect(searchFallback.results).toHaveLength(1);

        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                data: [
                    {
                        id: 'openai/gpt-4o',
                        name: 'GPT-4o',
                        context_length: 128000,
                        top_provider: { max_completion_tokens: 16384 }
                    }
                ]
            })
        );
        const orModels = await fetchOpenRouterModels('or-key');
        expect(orModels).toHaveLength(1);
        expect(orModels[0].maxOutputTokens).toBe(16384);
    });
});
