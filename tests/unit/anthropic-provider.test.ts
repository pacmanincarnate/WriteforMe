import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_DEFAULT_MODELS, DEFAULT_LLM_MODELS } from '@/config';
import { dispatchAI, type PromptLogEntry } from '@/pipeline';
import {
    buildAnthropicRequest,
    callAnthropic,
    echoableAssistantContent,
    fetchAnthropicModels,
    getDefaultModelForProvider,
    getEffectiveModelConfig,
    isLegacyClaudeModel,
    toAnthropicMessages,
    type LlmSuccessMetadata,
    type OpenAICompatibleFullResult
} from '@/services/llm';
import { readInitialSettingsState } from '@/stores';
import { isLocalProvider } from '@/types';

type Json = Record<string, unknown>;
interface SentRequest {
    url: string;
    headers: Headers;
    body: Json;
}

/** One Messages API streaming response, as the server-sent events the SDK reads. */
function sse(content: Json[], extra: { stop_reason?: string; stop_details?: Json; model?: string } = {}): Response {
    const events: Json[] = [
        {
            type: 'message_start',
            message: {
                id: 'msg_1',
                type: 'message',
                role: 'assistant',
                model: extra.model || 'claude-opus-5-5',
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: {
                    input_tokens: 10,
                    output_tokens: 0,
                    cache_read_input_tokens: 90,
                    cache_creation_input_tokens: 5
                }
            }
        }
    ];
    content.forEach((block, index) => {
        if (block.type === 'text') {
            events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
            events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
        } else if (block.type === 'thinking') {
            events.push({
                type: 'content_block_start',
                index,
                content_block: { type: 'thinking', thinking: '', signature: '' }
            });
            events.push({
                type: 'content_block_delta',
                index,
                delta: { type: 'thinking_delta', thinking: block.thinking }
            });
            events.push({
                type: 'content_block_delta',
                index,
                delta: { type: 'signature_delta', signature: block.signature }
            });
        } else if (block.type === 'tool_use') {
            events.push({
                type: 'content_block_start',
                index,
                content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} }
            });
            events.push({
                type: 'content_block_delta',
                index,
                delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
            });
        }
        events.push({ type: 'content_block_stop', index });
    });
    events.push({
        type: 'message_delta',
        delta: {
            stop_reason: extra.stop_reason || 'end_turn',
            stop_sequence: null,
            ...(extra.stop_details ? { stop_details: extra.stop_details } : {})
        },
        usage: { output_tokens: 20 }
    });
    events.push({ type: 'message_stop' });
    const text = events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** Stubs `fetch` as the Anthropic API and records what the app sent. */
function stubAnthropic(respond: (req: SentRequest) => Response): SentRequest[] {
    const sent: SentRequest[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const req: SentRequest = {
                url: String(input),
                headers: new Headers(init?.headers),
                body: init?.body ? (JSON.parse(String(init.body)) as Json) : {}
            };
            sent.push(req);
            return respond(req);
        })
    );
    return sent;
}

describe('Anthropic API provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('is a cloud provider with its own default model in every role slot', () => {
        expect(isLocalProvider('anthropic')).toBe(false);
        expect(DEFAULT_LLM_MODELS.anthropic).toBe('claude-opus-5-5');
        expect(getDefaultModelForProvider('anthropic')).toBe('claude-opus-5-5');
        expect(getDefaultModelForProvider('anthropic', { anthropicModel: 'claude-haiku-5-5' })).toBe(
            'claude-haiku-5-5'
        );
        const settings = {
            apiProvider: 'anthropic',
            devModel: 'claude-haiku-5-5',
            proseProvider: 'anthropic',
            proseModel: 'claude-opus-5-5',
            reviewProvider: 'anthropic',
            reviewModel: 'claude-sonnet-5-5'
        };
        expect(getEffectiveModelConfig('dev', settings).model).toBe('claude-haiku-5-5');
        expect(getEffectiveModelConfig('prose', settings).model).toBe('claude-opus-5-5');
        expect(getEffectiveModelConfig('review', settings).model).toBe('claude-sonnet-5-5');
        expect(ANTHROPIC_DEFAULT_MODELS.map((m) => m.id)).toEqual([
            'claude-fable-5-2',
            'claude-opus-5-5',
            'claude-sonnet-5-5',
            'claude-haiku-5-5'
        ]);
    });

    it('never defaults the embedding provider to Anthropic, which cannot embed', () => {
        localStorage.setItem('ellipsisprose_api_provider', 'anthropic');
        const state = readInitialSettingsState();
        expect(state.apiProvider).toBe('anthropic');
        expect(state.embeddingProvider).toBe('gemini');
        expect(state.anthropicKey).toBe('');
        expect(state.anthropicModel).toBe('claude-opus-5-5');
    });

    it('tells current models from the older ones that still take a thinking budget', () => {
        for (const id of ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-sonnet-4-6']) {
            expect(isLegacyClaudeModel(id)).toBe(false);
        }
        for (const id of ['claude-haiku-4-5', 'claude-sonnet-4-5-20250929', 'claude-opus-4-1', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest']) {
            expect(isLegacyClaudeModel(id)).toBe(true);
        }
    });

    it('asks current models for adaptive thinking, effort and a refusal fallback, never a budget or sampling', () => {
        const off = buildAnthropicRequest('claude-opus-5-5', 'Prompt', 'System', { temperature: 0.8, max_tokens: 8192 });
        expect(off.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
        expect(off.output_config).toEqual({ effort: 'low' });
        expect(off.fallbacks).toBe('default');
        expect(off.betas).toEqual(['server-side-fallback-2026-07-01']);
        expect(off.max_tokens).toBe(16384);
        expect(off).not.toHaveProperty('temperature');
        expect(off.system).toEqual([{ type: 'text', text: 'System', cache_control: { type: 'ephemeral' } }]);

        const on = buildAnthropicRequest('claude-fable-5-2', 'Prompt', '', {
            thinking: { enabled: true, budget: 16384, effort: 'high' },
            max_tokens: 500000
        });
        expect(on.output_config).toEqual({ effort: 'high' });
        expect(on.max_tokens).toBe(128000);
        expect(on).not.toHaveProperty('system');
        expect(buildAnthropicRequest('', 'p', '', { thinking: { enabled: true, budget: 4096 } }).output_config).toEqual({
            effort: 'medium'
        });
        expect(buildAnthropicRequest('', 'p', '').model).toBe('claude-opus-5-5');
    });

    it('gives older models a thinking budget and none of the newer parameters', () => {
        const req = buildAnthropicRequest('claude-haiku-4-5', 'Prompt', 'System', {
            thinking: { enabled: true, budget: 4096 },
            max_tokens: 8192
        });
        expect(req.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
        expect(req.max_tokens).toBe(4096 + 8192);
        expect(req).not.toHaveProperty('output_config');
        expect(req).not.toHaveProperty('fallbacks');
        expect(buildAnthropicRequest('claude-haiku-4-5', 'Prompt', 'System')).not.toHaveProperty('thinking');
    });

    it('marks a cache breakpoint inside a long prompt and maps tools without forcing one', () => {
        const prompt = `${'context '.repeat(400)}Now write.`;
        const req = buildAnthropicRequest('claude-opus-5-5', prompt, '', {
            cacheSplitIndex: 3200,
            tools: [{ name: 'query_story_lore', description: 'Look up lore', parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } }],
            tool_choice: 'required'
        });
        expect(req.messages[0].content).toEqual([
            { type: 'text', text: prompt.slice(0, 3200), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: prompt.slice(3200) }
        ]);
        expect(req.tools).toEqual([
            {
                name: 'query_story_lore',
                description: 'Look up lore',
                input_schema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] }
            }
        ]);
        expect(req.tool_choice).toEqual({ type: 'auto' });
    });

    it('sends the key straight from the browser and returns parsed JSON with usage', async () => {
        const sent = stubAnthropic(() =>
            sse([
                { type: 'thinking', thinking: 'Plan the beats.', signature: 'sig' },
                { type: 'text', text: '```json\n{"beats":["a","b"]}\n```' }
            ])
        );
        const meta: LlmSuccessMetadata[] = [];
        const res = await callAnthropic(' sk-ant-test ', 'claude-haiku-5-5', 'Outline', 'System', true, {
            onSuccess: (m) => meta.push(m)
        });
        expect(res).toEqual({ beats: ['a', 'b'] });
        expect(sent).toHaveLength(1);
        expect(sent[0].url).toBe('https://api.anthropic.com/v1/messages');
        expect(sent[0].headers.get('authorization')).toBe('Bearer sk-ant-test');
        expect(sent[0].headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
        expect(sent[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
        expect(sent[0].body.model).toBe('claude-haiku-5-5');
        expect(sent[0].body.stream).toBe(true);
        expect(sent[0].body.fallbacks).toBe('default');
        expect(sent[0].body).not.toHaveProperty('betas');
        expect(sent[0].body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Outline' }] }]);
        expect(meta[0]).toMatchObject({
            modelUsed: 'claude-opus-5-5',
            promptTokens: 105,
            responseTokens: 20,
            tokensUsed: 125,
            cachedTokens: 90,
            cacheWriteTokens: 5,
            reasoningText: 'Plan the beats.'
        });
    });

    it('returns plain prose untouched when JSON was not asked for', async () => {
        stubAnthropic(() => sse([{ type: 'text', text: 'The rain kept on.' }]));
        expect(await callAnthropic('k', 'claude-opus-5-5', 'Write', 'System', false)).toBe('The rain kept on.');
    });

    it('carries a tool call round trip with the thinking block sent back unchanged', async () => {
        const thinking = { type: 'thinking', thinking: 'Check the lore first.', signature: 'sig-1' };
        const toolUse = { type: 'tool_use', id: 'toolu_1', name: 'query_story_lore', input: { topic: 'harbor' } };
        const sent = stubAnthropic((req) =>
            (req.body.messages as unknown[]).length === 1
                ? sse([thinking, toolUse], { stop_reason: 'tool_use' })
                : sse([{ type: 'text', text: 'Final prose.' }])
        );
        const tools = [{ name: 'query_story_lore', description: 'Look up lore', parameters: { type: 'object', properties: {} } }];
        const history = [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Write the scene.' }
        ];

        const first = (await callAnthropic('k', 'claude-opus-5-5', '', 'System', false, {
            tools,
            messages: history,
            returnFullData: true
        })) as OpenAICompatibleFullResult;
        expect(first.tool_calls).toEqual([
            { id: 'toolu_1', type: 'function', function: { name: 'query_story_lore', arguments: '{"topic":"harbor"}' } }
        ]);
        expect(first.reasoningText).toBe('Check the lore first.');
        // The system prompt arrives both as an argument and as the first message; it is sent once.
        expect(sent[0].body.system).toEqual([{ type: 'text', text: 'System', cache_control: { type: 'ephemeral' } }]);

        const second = (await callAnthropic('k', 'claude-opus-5-5', '', 'System', false, {
            tools,
            messages: [
                ...history,
                first.message,
                { role: 'tool', tool_call_id: 'toolu_1', name: 'query_story_lore', content: '{"facts":["tidal"]}' }
            ],
            returnFullData: true
        })) as OpenAICompatibleFullResult;
        expect(second.text).toBe('Final prose.');
        expect(second.tool_calls).toEqual([]);
        expect(sent[1].body.messages).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'Write the scene.' }] },
            { role: 'assistant', content: [thinking, toolUse] },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"facts":["tidal"]}' }] }
        ]);
    });

    it('groups the results of parallel tool calls into one user turn', () => {
        const { system, messages } = toAnthropicMessages([
            { role: 'system', content: 'S' },
            { role: 'user', content: 'Go' },
            {
                role: 'assistant',
                content: 'Looking.',
                tool_calls: [
                    { id: 'a', function: { name: 'one', arguments: '{"x":1}' } },
                    { id: 'b', function: { name: 'two', arguments: { y: 2 } } }
                ]
            },
            { role: 'tool', tool_call_id: 'a', content: 'ra' },
            { role: 'tool', tool_call_id: 'b', content: 'rb' }
        ]);
        expect(system).toBe('S');
        expect(messages).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'Go' }] },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Looking.' },
                    { type: 'tool_use', id: 'a', name: 'one', input: { x: 1 } },
                    { type: 'tool_use', id: 'b', name: 'two', input: { y: 2 } }
                ]
            },
            {
                role: 'user',
                content: [
                    { type: 'tool_result', tool_use_id: 'a', content: 'ra' },
                    { type: 'tool_result', tool_use_id: 'b', content: 'rb' }
                ]
            }
        ]);
    });

    it('drops the declined model\'s thinking and tool calls when echoing a fallback turn', () => {
        const fallback = { type: 'fallback', from: { model: 'claude-fable-5-2' }, to: { model: 'claude-opus-4-8' } };
        const kept = { type: 'thinking', thinking: 'after', signature: 's2' };
        expect(
            echoableAssistantContent([
                { type: 'thinking', thinking: 'before', signature: 's1' },
                { type: 'text', text: 'Partial' },
                { type: 'tool_use', id: 't0', name: 'one', input: {} },
                fallback,
                kept,
                { type: 'text', text: 'Rest' }
            ])
        ).toEqual([{ type: 'text', text: 'Partial' }, fallback, kept, { type: 'text', text: 'Rest' }]);
        const plain = [kept, { type: 'text', text: 'Only' }];
        expect(echoableAssistantContent(plain)).toEqual(plain);
    });

    it('explains a refusal, a bad key and a missing key in plain words', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(callAnthropic('', 'claude-opus-5-5', 'p', 's', false)).rejects.toThrow(
            'Anthropic API Key is missing. Please add it in Settings.'
        );

        stubAnthropic(() =>
            sse([], { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms' } })
        );
        await expect(callAnthropic('k', 'claude-opus-5-5', 'p', 's', false)).rejects.toThrow(
            'Anthropic declined this request (general_harms)'
        );

        stubAnthropic(
            () =>
                new Response(
                    JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                )
        );
        await expect(callAnthropic('bad', 'claude-opus-5-5', 'p', 's', false)).rejects.toThrow(
            /Anthropic Authorization Failed \(401\).*invalid x-api-key/
        );
    });

    it('lists the built-in models first and tops them up from the Models API', async () => {
        expect((await fetchAnthropicModels('')).map((m) => m.id)).toEqual(ANTHROPIC_DEFAULT_MODELS.map((m) => m.id));

        const sent = stubAnthropic(
            () =>
                new Response(
                    JSON.stringify({
                        data: [
                            { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model' },
                            { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', max_input_tokens: 1000000, type: 'model' }
                        ],
                        has_more: false,
                        first_id: 'claude-opus-5-5',
                        last_id: 'claude-opus-4-8'
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
        );
        const models = await fetchAnthropicModels('k');
        expect(sent[0].url).toContain('https://api.anthropic.com/v1/models');
        expect(models.map((m) => m.id)).toEqual([...ANTHROPIC_DEFAULT_MODELS.map((m) => m.id), 'claude-opus-4-8']);
        expect(models[models.length - 1]).toEqual({ id: 'claude-opus-4-8', name: 'Claude Opus 4.8', contextLength: 1000000 });

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        stubAnthropic(() => new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }));
        expect(await fetchAnthropicModels('k')).toHaveLength(ANTHROPIC_DEFAULT_MODELS.length);
    });

    it('dispatches a pipeline call to the Anthropic API with the slot\'s model and key', async () => {
        const sent = stubAnthropic(() => sse([{ type: 'text', text: 'Prose.' }]));
        const logs: PromptLogEntry[] = [];
        const setPromptLog = (updater: (prev: PromptLogEntry[]) => PromptLogEntry[]): void => {
            const next = updater(logs);
            logs.splice(0, logs.length, ...next);
        };

        const res = await dispatchAI(
            {
                prompt: 'Draft beat',
                systemPrompt: 'System',
                isJson: false,
                logName: 'Writing Agent Scene 1',
                modelRoleOrSize: 'prose'
            },
            {
                modelSettings: {
                    apiProvider: 'gemini',
                    proseProvider: 'anthropic',
                    proseModel: 'claude-opus-5-5'
                },
                thinkingSettings: {},
                anthropicKey: 'sk-ant-slot'
            },
            {
                setCurrentPipelineStep: vi.fn(),
                setPromptLog,
                showToast: vi.fn(),
                sleepFn: async () => {}
            }
        );

        expect(res).toBe('Prose.');
        expect(sent).toHaveLength(1);
        expect(sent[0].headers.get('authorization')).toBe('Bearer sk-ant-slot');
        expect(sent[0].body.model).toBe('claude-opus-5-5');
        expect(logs[0].provider).toBe('anthropic');
        expect(logs[0].status).toBe('success');
        expect((logs[0].parameters as Json).endpoint).toBe('https://api.anthropic.com/v1/messages');
    });
});
