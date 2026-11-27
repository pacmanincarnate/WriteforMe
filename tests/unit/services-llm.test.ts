import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NANO_GPT_DEFAULT_MODELS, STORAGE_KEYS } from '@/config';
import {
    callGemini,
    callKoboldCPP,
    callNanoGPT,
    callOpenRouter,
    checkKoboldCPPStatus,
    clearOpenRouterRoutingState,
    computeOpenRouterSmartRoutingProfile,
    extractOpenRouterImageModels,
    fetchNanoGPTModels,
    fetchOpenRouterImageModelsCatalog,
    fetchOpenRouterModels,
    filterModelsClientSide,
    formatOpenAITools,
    formatOpenRouterImagePricing,
    getOpenRouterModelLimits,
    getOpenRouterSmartRouting,
    getKoboldLoadedModelName,
    invalidateOpenRouterStickyProvider,
    isCloudModelName,
    setKoboldLoadedModelName,
    parseNanoGPTModelMetadata,
    searchNanoGPTModels,
    supportsExplicitOpenRouterCacheControl
} from '@/services/llm';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    clearOpenRouterRoutingState();
    sessionStorage.clear();
    localStorage.clear();
    setKoboldLoadedModelName('');
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    clearOpenRouterRoutingState();
    sessionStorage.clear();
    localStorage.clear();
    setKoboldLoadedModelName('');
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

        await callGemini('gem-key', 'gemini-4-neon', 'prompt', 'system', false, {
            thinking: { enabled: true, budget: 8192 }
        });
        expect(
            (capturedPayloads[2].generationConfig as { thinkingConfig?: unknown }).thinkingConfig
        ).toEqual({ thinkingLevel: 'HIGH' });
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

    it('streams OpenRouter SSE responses with keepalives, reasoning, tool calls, mid-stream errors, and idle reset', async () => {
        const encoder = new TextEncoder();
        const sseResponse = (chunks: string[], status = 200): Response => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(encoder.encode(chunk));
                    }
                    controller.close();
                }
            });
            return new Response(stream, {
                status,
                headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
            });
        };

        // 1. Keepalive comments, delta.reasoning + reasoning_details (no double counting), content, usage, onSuccess
        let telemetry: Record<string, unknown> | null = null;
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            sseResponse([
                ': OPENROUTER PROCESSING\n\n',
                'data: {"model":"google/gemini-4-neon","provider":"Google","choices":[{"delta":{"reasoning":"Plan step 1. ","reasoning_details":[{"text":"Plan step 1. "}]}}]}\n\n',
                'data: {"choices":[{"delta":{"reasoning_details":[{"text":"Plan step 2."}]}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"Harbor "}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"lights."},"finish_reason":"stop"}]}\n\n',
                'data: {"usage":{"prompt_tokens":120,"completion_tokens":20,"total_tokens":140,"completion_tokens_details":{"reasoning_tokens":12}}}\n\n',
                'data: [DONE]\n\n'
            ])
        );

        const sseText = await callOpenRouter('or-key', 'google/gemini-4-neon', 'Write', 'Sys', false, {
            disableSmartRouting: true,
            onSuccess: (m) => {
                telemetry = m as unknown as Record<string, unknown>;
            }
        });
        expect(sseText).toBe('Harbor lights.');
        expect(telemetry).toMatchObject({
            modelUsed: 'google/gemini-4-neon',
            routedProvider: 'Google',
            promptTokens: 120,
            responseTokens: 20,
            thinkingTokens: 12,
            reasoningText: 'Plan step 1. Plan step 2.',
            fullResponse: 'Harbor lights.'
        });

        // 2. Streaming tool_calls delta reassembly
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"query_","arguments":"{\\"topic\\":"}}]}}]}\n\n',
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"story_lore","arguments":"\\"Salt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
                'data: [DONE]\n\n'
            ])
        );
        const toolRes = (await callOpenRouter('or-key', 'google/gemini-4-neon', 'Hi', 'Sys', false, {
            disableSmartRouting: true,
            tools: [{ name: 'query_story_lore', description: 'Lookup', parameters: { type: 'object' } }]
        })) as { tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> };
        expect(toolRes.tool_calls).toHaveLength(1);
        expect(toolRes.tool_calls[0].id).toBe('call_1');
        expect(toolRes.tool_calls[0].function).toEqual({
            name: 'query_story_lore',
            arguments: '{"topic":"Salt"}'
        });

        // 3. Mid-stream errors (generic & 402 credits)
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            sseResponse(['data: {"error":{"message":"Upstream overloaded","code":503}}\n\n'])
        );
        await expect(
            callOpenRouter('or-key', 'google/gemini-4-neon', 'Hi', 'Sys', false, {
                disableSmartRouting: true
            })
        ).rejects.toThrow('OpenRouter API returned error: Upstream overloaded');

        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            sseResponse(['data: {"error":{"message":"Out of credits","code":402}}\n\n'])
        );
        await expect(
            callOpenRouter('or-key', 'google/gemini-4-neon', 'Hi', 'Sys', false, {
                disableSmartRouting: true
            })
        ).rejects.toThrow('OpenRouter Insufficient Credits (402)');

        // 4. Activity resets idle timeout across active token deltas
        vi.useFakeTimers();
        try {
            globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        setTimeout(() => {
                            controller.enqueue(
                                encoder.encode('data: {"choices":[{"delta":{"reasoning":"Thinking... "}}]}\n\n')
                            );
                        }, 60);
                        setTimeout(() => {
                            controller.enqueue(
                                encoder.encode('data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n')
                            );
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
                        }, 130);
                    }
                });
                return new Response(stream, {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' }
                });
            });

            const activePromise = callOpenRouter('or-key', 'google/gemini-4-neon', 'Hi', 'Sys', false, {
                disableSmartRouting: true,
                timeout: 100
            });
            await vi.advanceTimersByTimeAsync(150);
            await expect(activePromise).resolves.toBe('Done.');
        } finally {
            vi.useRealTimers();
        }
    });

    it('detects Gemini 4 limits, ignores empty supported_efforts, and invalidates sticky pins', async () => {
        const gemini4Limits = getOpenRouterModelLimits('google/gemini-4-neon');
        expect(gemini4Limits.maxOutputTokens).toBe(65536);
        expect(gemini4Limits.contextLength).toBe(1048576);
        expect(gemini4Limits.supportsReasoning).toBe(true);
        expect(gemini4Limits.reasoningType).toBe('both');

        sessionStorage.setItem(
            STORAGE_KEYS.openRouterModelsCache,
            JSON.stringify([
                {
                    id: 'google/gemini-4-neon',
                    contextLength: 1048576,
                    maxOutputTokens: 65536,
                    reasoning: { default_enabled: true, supported_efforts: [] }
                }
            ])
        );
        const cachedLimits = getOpenRouterModelLimits('google/gemini-4-neon');
        expect(cachedLimits.supportsReasoning).toBe(true);
        expect(cachedLimits.reasoningType).toBe('both');

        const sentOrders: Array<unknown> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.includes('/endpoints')) {
                return jsonResponse({
                    data: {
                        endpoints: [
                            {
                                tag: 'google-ai-studio',
                                provider_name: 'Google AI Studio',
                                status: 0,
                                pricing: { prompt: '0.000001', completion: '0.000002' }
                            }
                        ]
                    }
                });
            }
            const body = JSON.parse(String(init?.body || '{}')) as { provider?: { order?: unknown } };
            sentOrders.push(body.provider?.order);
            return jsonResponse({
                provider: 'Google AI Studio',
                choices: [{ finish_reason: 'stop', message: { content: 'ok' } }]
            });
        });

        await callOpenRouter('or-key', 'google/gemini-4-neon', '1', 'sys', false, { sessionId: 's-pin' });
        await callOpenRouter('or-key', 'google/gemini-4-neon', '2', 'sys', false, { sessionId: 's-pin' });
        invalidateOpenRouterStickyProvider('s-pin');
        await callOpenRouter('or-key', 'google/gemini-4-neon', '3', 'sys', false, { sessionId: 's-pin' });

        expect(sentOrders[0]).toBeUndefined();
        expect(sentOrders[1]).toEqual(['google-ai-studio']);
        expect(sentOrders[2]).toBeUndefined();
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

        setKoboldLoadedModelName('gemma-3-local');
        expect(getKoboldLoadedModelName()).toBe('gemma-3-local');
        expect((window as unknown as { koboldLoadedModelGlobal?: string }).koboldLoadedModelGlobal).toBe(
            'gemma-3-local'
        );
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

    it('formats OpenRouter image pricing across free, token, request, image, dynamic, and missing pricing', () => {
        expect(formatOpenRouterImagePricing({ prompt: '0', completion: '0' })).toEqual({
            costLabel: 'Free',
            costDetail: 'Free',
            isFree: true
        });
        expect(
            formatOpenRouterImagePricing({
                prompt: '0.0000005',
                completion: '0.000003',
                image_output: '0.00006'
            })
        ).toEqual({
            costLabel: '$60/1M img tok',
            costDetail: 'Image output: $60/1M tokens · Prompt: $0.50/1M tokens',
            isFree: false
        });
        expect(
            formatOpenRouterImagePricing({
                image_output: '0.00000732421875'
            })
        ).toEqual({
            costLabel: '$7.32/1M img tok',
            costDetail: 'Image output: $7.32/1M tokens',
            isFree: false
        });
        expect(formatOpenRouterImagePricing({ request: '0.04' })).toEqual({
            costLabel: '$0.04/img',
            costDetail: 'Per request: $0.04',
            isFree: false
        });
        expect(formatOpenRouterImagePricing({ image: '0.008' })).toEqual({
            costLabel: '$0.008/img',
            costDetail: 'Per image: $0.008',
            isFree: false
        });
        expect(formatOpenRouterImagePricing({ prompt: '-1', completion: '-1' })).toEqual({
            costLabel: 'Dynamic',
            costDetail: 'Dynamic router pricing',
            isFree: false
        });
        expect(formatOpenRouterImagePricing(null)).toEqual({
            costLabel: 'Pricing N/A',
            costDetail: 'Pricing unavailable',
            isFree: false
        });
    });

    it('extracts only real text-to-image models and fetches OpenRouter image catalog with optional auth', async () => {
        const extracted = extractOpenRouterImageModels([
            {
                id: 'recraft/recraft-v4.1-flash-v2:free',
                name: 'Recraft: Recraft V4.1 Flash V2 (free)',
                architecture: {
                    modality: 'text->image',
                    input_modalities: ['text'],
                    output_modalities: ['image']
                },
                pricing: { prompt: '0', completion: '0' }
            },
            {
                id: 'black-forest-labs/flux.2-pro',
                name: 'Black Forest Labs: FLUX.2 Pro',
                architecture: {
                    modality: 'text+image->image',
                    input_modalities: ['text', 'image'],
                    output_modalities: ['image']
                },
                pricing: { image_output: '0.00000732421875' }
            },
            {
                id: 'google/gemini-2.5-flash-image',
                name: 'Google: Gemini 2.5 Flash Image',
                architecture: {
                    modality: 'text+image->text+image',
                    input_modalities: ['text', 'image'],
                    output_modalities: ['text', 'image']
                },
                pricing: { prompt: '0.0000003', image_output: '0.00003' }
            },
            {
                id: 'openrouter/auto',
                name: 'OpenRouter Auto',
                architecture: {
                    modality: 'text+image->text+image',
                    input_modalities: ['text', 'image'],
                    output_modalities: ['text', 'image']
                },
                pricing: { prompt: '-1', completion: '-1' }
            },
            {
                id: 'some/image-upscaler',
                name: 'Image Upscaler',
                architecture: {
                    modality: 'image->image',
                    input_modalities: ['image'],
                    output_modalities: ['image']
                },
                pricing: { image_output: '0.00001' }
            },
            {
                id: 'some/text-chat',
                name: 'Text Chat',
                architecture: {
                    modality: 'text->text',
                    input_modalities: ['text'],
                    output_modalities: ['text']
                },
                pricing: { prompt: '0.000001' }
            }
        ]);

        expect(extracted.map((m) => m.id)).toEqual([
            'recraft/recraft-v4.1-flash-v2:free',
            'black-forest-labs/flux.2-pro',
            'google/gemini-2.5-flash-image'
        ]);

        const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            calls.push({ url: String(url), headers: init?.headers });
            return jsonResponse({
                data: [
                    {
                        id: 'black-forest-labs/flux.2-pro',
                        name: 'Black Forest Labs: FLUX.2 Pro',
                        architecture: {
                            modality: 'text+image->image',
                            input_modalities: ['text', 'image'],
                            output_modalities: ['image']
                        },
                        pricing: { image_output: '0.00000732421875' }
                    }
                ]
            });
        });

        const noKeyModels = await fetchOpenRouterImageModelsCatalog('');
        expect(noKeyModels).toHaveLength(1);
        expect(calls[0].url).toBe('https://openrouter.ai/api/v1/models?output_modalities=image');
        expect((calls[0].headers as Record<string, string>).Authorization).toBeUndefined();

        await fetchOpenRouterImageModelsCatalog('or-key-123');
        expect((calls[1].headers as Record<string, string>).Authorization).toBe(
            'Bearer or-key-123'
        );
    });
});
