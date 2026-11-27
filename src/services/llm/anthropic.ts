/**
 * @module services/llm/anthropic
 * Direct Anthropic API client (Messages API through the official SDK) for the Claude models.
 * Translates the app's OpenAI-shaped chat/tool contract to Anthropic content blocks and back,
 * maps the thinking toggle to adaptive thinking + effort, marks cache breakpoints, and opts in
 * to server-side refusal fallbacks.
 */

import { splitAtCachePoint } from '@/domain/prompt/cacheLayout';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_DEFAULT_MODELS, DEFAULT_LLM_MODELS } from '@/config';
import type { ModelDescriptor } from '@/types';
import { cleanJson } from '@/utils';
import {
    formatOpenAITools,
    type LlmCallOptions,
    type LlmChatMessage,
    type OpenAICompatibleFullResult,
    type OpenAIToolCall
} from './types';
import { ModelStopError, modelStopSignal, throwIfModelStopped } from './stop';

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type BetaTextBlockParam = Anthropic.Beta.BetaTextBlockParam;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;
type BetaTool = Anthropic.Beta.BetaTool;
type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];

const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_OUTPUT_TOKENS = 128000;
const MIN_IDLE_TIMEOUT_MS = 180000;

type AnthropicEffort = 'low' | 'medium' | 'high';

/**
 * Claude 3.x and Claude 4.0-4.5 take a fixed thinking budget and no `effort`. Everything
 * newer thinks adaptively and rejects a budget, so the two families get different requests.
 */
export function isLegacyClaudeModel(model: string): boolean {
    return /^claude-(?:[23]|instant|(?:opus|sonnet|haiku)-4-(?:[0-5](?!\d)|\d{8}))/.test(
        (model || '').trim().toLowerCase()
    );
}

function createClient(apiKey: string, timeoutMs?: number): Anthropic {
    return new Anthropic({
        apiKey,
        // The key is the user's own and never leaves their browser except to Anthropic,
        // the same trust model as the other cloud providers in this app.
        dangerouslyAllowBrowser: true,
        // dispatchAI owns the retry loop; one SDK retry only smooths over a dropped connection.
        maxRetries: 1,
        ...(timeoutMs && timeoutMs > 0 ? { timeout: timeoutMs } : {})
    });
}

function parseToolInput(args: unknown): Record<string, unknown> {
    if (args && typeof args === 'object') return args as Record<string, unknown>;
    if (typeof args === 'string' && args.trim()) {
        try {
            const parsed: unknown = JSON.parse(args);
            if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
        } catch {
            // Fall through: an unparseable argument string becomes an empty input.
        }
    }
    return {};
}

function toTextBlocks(content: LlmChatMessage['content']): BetaTextBlockParam[] {
    if (typeof content === 'string') {
        return content.trim() ? [{ type: 'text', text: content }] : [];
    }
    if (!Array.isArray(content)) return [];
    const blocks: BetaTextBlockParam[] = [];
    for (const block of content) {
        const rec = block as { type?: unknown; text?: unknown; cache_control?: unknown };
        if (rec.type === 'text' && typeof rec.text === 'string' && rec.text.trim()) {
            blocks.push({
                type: 'text',
                text: rec.text,
                ...(rec.cache_control ? { cache_control: { type: 'ephemeral' as const } } : {})
            });
        }
    }
    return blocks;
}

/**
 * Prepares a stored assistant turn for sending back. After a refusal fallback the API only
 * accepts text from before the last `fallback` block (plus the block itself, in place), so the
 * declined model's thinking and tool calls are left out. Everything after it goes back as is.
 */
export function echoableAssistantContent(content: unknown[]): BetaContentBlockParam[] {
    let boundary = -1;
    content.forEach((block, i) => {
        if ((block as { type?: unknown })?.type === 'fallback') boundary = i;
    });
    return content.filter((block, i) => {
        if (i >= boundary) return true;
        const type = (block as { type?: unknown })?.type;
        return type === 'text' || type === 'fallback';
    }) as BetaContentBlockParam[];
}

/** Converts the app's OpenAI-shaped history into Anthropic `system` text and `messages`. */
export function toAnthropicMessages(messages: ReadonlyArray<LlmChatMessage>): {
    system: string;
    messages: BetaMessageParam[];
} {
    const systemParts: string[] = [];
    const out: BetaMessageParam[] = [];

    for (const m of messages) {
        if (m.role === 'system') {
            const text = toTextBlocks(m.content)
                .map((b) => b.text)
                .join('\n\n');
            if (text.trim()) systemParts.push(text);
            continue;
        }

        if (m.role === 'tool') {
            const result: BetaToolResultBlockParam = {
                type: 'tool_result',
                tool_use_id: m.tool_call_id || '',
                content:
                    typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
            };
            // Every result of one assistant turn has to travel in a single user message.
            const last = out[out.length - 1];
            if (
                last &&
                last.role === 'user' &&
                Array.isArray(last.content) &&
                last.content.every((b) => b.type === 'tool_result')
            ) {
                last.content.push(result);
            } else {
                out.push({ role: 'user', content: [result] });
            }
            continue;
        }

        if (m.role === 'assistant') {
            if (Array.isArray(m.anthropicContent) && m.anthropicContent.length > 0) {
                out.push({
                    role: 'assistant',
                    content: echoableAssistantContent(m.anthropicContent)
                });
                continue;
            }
            const blocks: BetaContentBlockParam[] = [...toTextBlocks(m.content)];
            for (const tc of m.tool_calls || []) {
                blocks.push({
                    type: 'tool_use',
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    input: parseToolInput(tc.function?.arguments)
                });
            }
            if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
            continue;
        }

        const blocks = toTextBlocks(m.content);
        if (blocks.length > 0) out.push({ role: 'user', content: blocks });
    }

    return { system: systemParts.join('\n\n'), messages: out };
}

function toAnthropicTools(tools: LlmCallOptions['tools']): BetaTool[] {
    return formatOpenAITools(tools).map((t) => {
        const params = (t.function.parameters || {}) as Record<string, unknown>;
        return {
            name: t.function.name,
            description: t.function.description,
            input_schema: {
                ...params,
                type: 'object' as const,
                properties: (params.properties as Record<string, unknown> | undefined) ?? {}
            }
        };
    });
}

function resolveEffort(thinking: LlmCallOptions['thinking']): AnthropicEffort {
    if (!thinking || !thinking.enabled || !thinking.budget) return 'low';
    if (thinking.effort === 'low' || thinking.effort === 'medium' || thinking.effort === 'high') {
        return thinking.effort;
    }
    return thinking.budget <= 2048 ? 'low' : thinking.budget <= 4096 ? 'medium' : 'high';
}

/** Builds the Messages API request for one call. Exported so the mapping can be unit-tested. */
export function buildAnthropicRequest(
    model: string,
    prompt: string,
    systemPrompt: string,
    options: LlmCallOptions = {}
): StreamParams {
    const modelId = (model || '').trim() || DEFAULT_LLM_MODELS.anthropic;
    const legacy = isLegacyClaudeModel(modelId);

    let system = systemPrompt && String(systemPrompt).trim() ? String(systemPrompt) : '';
    let messages: BetaMessageParam[];
    if (Array.isArray(options.messages) && options.messages.length > 0) {
        const converted = toAnthropicMessages(options.messages);
        messages = converted.messages;
        // The agentic loop repeats the system prompt as the first message; don't send it twice.
        if (converted.system && converted.system.trim() !== system.trim()) {
            system = [system, converted.system].filter(Boolean).join('\n\n');
        }
        // In a conversation the opening message is re-read on every turn, so its repeated start
        // gets a cache mark too.
        const opening = messages.find((m) => m.role === 'user');
        const first = opening && Array.isArray(opening.content) ? opening.content[0] : null;
        if (opening && Array.isArray(opening.content) && first && first.type === 'text' && !first.cache_control) {
            const parts = splitAtCachePoint(first.text, options.cacheSplitIndex);
            if (parts) {
                opening.content = [
                    { type: 'text', text: parts[0], cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: parts[1] },
                    ...opening.content.slice(1)
                ];
            }
        }
    } else {
        const parts = splitAtCachePoint(prompt, options.cacheSplitIndex);
        const content: BetaTextBlockParam[] = parts
            ? [
                  { type: 'text', text: parts[0], cache_control: { type: 'ephemeral' } },
                  { type: 'text', text: parts[1] }
              ]
            : [{ type: 'text', text: prompt }];
        messages = [{ role: 'user', content }];
    }

    const thinkingOn = Boolean(
        options.thinking && options.thinking.enabled && (options.thinking.budget || 0) > 0
    );
    let maxTokens = options.max_tokens || options.maxTokens || 16384;

    const request: StreamParams = {
        model: modelId,
        max_tokens: maxTokens,
        messages
    };

    if (system) {
        // The system prompt is the stable prefix of every pipeline call, so cache it.
        request.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    }

    if (Array.isArray(options.tools) && options.tools.length > 0) {
        request.tools = toAnthropicTools(options.tools);
        // Current Claude models reject forced tool use, so anything but "none" means "auto".
        request.tool_choice = options.tool_choice === 'none' ? { type: 'none' } : { type: 'auto' };
    }

    if (legacy) {
        if (thinkingOn) {
            const budget = Math.max(1024, options.thinking?.budget || 0);
            maxTokens = Math.max(maxTokens, budget + 8192);
            request.thinking = { type: 'enabled', budget_tokens: budget };
        }
    } else {
        // Current models think adaptively and take no budget or sampling parameters; `effort`
        // is the one depth control. Thinking shares max_tokens with the answer, so leave room.
        maxTokens = Math.max(maxTokens, thinkingOn ? 32768 : 16384);
        request.thinking = { type: 'adaptive', display: 'summarized' };
        request.output_config = { effort: resolveEffort(options.thinking) };
        // If the model declines for policy reasons, let Anthropic retry on its default
        // substitute model inside the same call. Models without a fallback just run alone.
        request.betas = [SERVER_SIDE_FALLBACK_BETA];
        request.fallbacks = 'default';
    }

    request.max_tokens = Math.min(maxTokens, MAX_OUTPUT_TOKENS);
    return request;
}

function describeApiError(error: unknown): Error {
    if (error instanceof Anthropic.APIUserAbortError) {
        return new Error('Anthropic request timed out waiting for the model.', { cause: error });
    }
    if (error instanceof Anthropic.AuthenticationError) {
        return new Error(
            `Anthropic Authorization Failed (401). Please check your API Key in Settings. Details: ${error.message}`,
            { cause: error }
        );
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
        return new Error(
            `Anthropic Error: 403 - this API key cannot use the requested model. Details: ${error.message}`,
            { cause: error }
        );
    }
    if (error instanceof Anthropic.NotFoundError) {
        return new Error(
            `Anthropic Error: 404 - model not found. Check the model ID in Settings. Details: ${error.message}`,
            { cause: error }
        );
    }
    if (error instanceof Anthropic.RateLimitError) {
        return new Error(`Anthropic Error: 429 - rate limited. Details: ${error.message}`, {
            cause: error
        });
    }
    if (error instanceof Anthropic.APIConnectionError) {
        return new Error(`Anthropic connection error: ${error.message}`, { cause: error });
    }
    if (error instanceof Anthropic.APIError) {
        return new Error(`Anthropic Error: ${error.status ?? 'unknown'} - ${error.message}`, {
            cause: error
        });
    }
    return error instanceof Error ? error : new Error(String(error));
}

function estimateTokens(text: string): number {
    return text && text.trim() ? Math.round(text.trim().split(/\s+/).length * 1.33) : 0;
}

/** Calls the Anthropic Messages API. Same contract as the other `call*` provider clients. */
export async function callAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson = true,
    options: LlmCallOptions = {}
): Promise<unknown> {
    try {
        const key = apiKey ? apiKey.trim() : '';
        if (!key) throw new Error('Anthropic API Key is missing. Please add it in Settings.');

        const opts: LlmCallOptions = typeof options === 'object' && options !== null ? options : {};
        const request = buildAnthropicRequest(model, prompt, systemPrompt, opts);
        const client = createClient(key, opts.timeout);

        // Long generations are streamed so they are not cut off by an HTTP timeout. The app
        // only needs the finished message, so the deadline is on silence, not total duration.
        const idleMs = Math.max(opts.timeout || 0, MIN_IDLE_TIMEOUT_MS);
        let message: BetaMessage;
        throwIfModelStopped();
        const stream = client.beta.messages.stream(request);
        const stopSignal = modelStopSignal();
        const onStop = (): void => stream.abort();
        stopSignal.addEventListener('abort', onStop, { once: true });
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const armIdleTimer = (): void => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => stream.abort(), idleMs);
        };
        try {
            armIdleTimer();
            stream.on('streamEvent', armIdleTimer);
            message = await stream.finalMessage();
        } catch (error) {
            if (stopSignal.aborted) throw new ModelStopError();
            throw describeApiError(error);
        } finally {
            stopSignal.removeEventListener('abort', onStop);
            if (idleTimer) clearTimeout(idleTimer);
        }

        if (message.stop_reason === 'refusal') {
            const category = message.stop_details?.category;
            throw new Error(
                `Anthropic declined this request${category ? ` (${category})` : ''}. ` +
                    'Rephrase the prompt or pick another model for this slot.'
            );
        }

        let text = '';
        let reasoningText = '';
        const toolCalls: OpenAIToolCall[] = [];
        for (const block of message.content) {
            if (block.type === 'text') text += block.text;
            else if (block.type === 'thinking') reasoningText += block.thinking;
            else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    type: 'function',
                    function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) }
                });
            }
        }

        if (message.stop_reason === 'max_tokens' && toolCalls.length > 0) {
            throw new Error(
                'Anthropic model hit the output token limit in the middle of a tool call.'
            );
        }

        const usage = message.usage;
        const cachedTokens = usage.cache_read_input_tokens || 0;
        const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
        const promptTokens = usage.input_tokens + cachedTokens + cacheWriteTokens;
        const thinkingTokens = estimateTokens(reasoningText);
        const reportSuccess = (): void => {
            opts.onSuccess?.({
                modelUsed: message.model || request.model,
                tokensUsed: promptTokens + usage.output_tokens,
                promptTokens,
                responseTokens: usage.output_tokens,
                thinkingTokens,
                reasoningTokensUsed: thinkingTokens,
                cachedTokens,
                cacheWriteTokens,
                reasoningText,
                fullResponse: text
            });
        };

        if (toolCalls.length > 0 || opts.returnFullData) {
            reportSuccess();
            const fullResult: OpenAICompatibleFullResult = {
                tool_calls: toolCalls,
                text,
                reasoningText,
                message: {
                    role: 'assistant',
                    content: text || null,
                    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                    anthropicContent: message.content as unknown[]
                },
                data: message as unknown as Record<string, unknown>
            };
            return fullResult;
        }

        if (!text.trim()) {
            if (message.stop_reason === 'max_tokens') {
                throw new Error(
                    'Anthropic model exhausted token budget during thinking phase without generating final content.'
                );
            }
            throw new Error(
                `Anthropic returned no content (stop reason: ${message.stop_reason ?? 'unknown'}).`
            );
        }

        reportSuccess();

        if (isJson) {
            try {
                return JSON.parse(cleanJson(text));
            } catch (e) {
                console.error('Anthropic JSON Parse Error. Raw Text:', text);
                throw new Error(
                    `Failed to parse Anthropic response as JSON. Check console for details. Raw snippet: ${text.substring(
                        0,
                        150
                    )}`,
                    { cause: e }
                );
            }
        }

        return text;
    } catch (error) {
        console.error('Anthropic Error:', error);
        throw error;
    }
}

/**
 * Lists the Claude models this key can use, with the built-in defaults first. Without a key,
 * or if the lookup fails, the defaults alone are returned so the picker always has options.
 */
export async function fetchAnthropicModels(apiKey = ''): Promise<ModelDescriptor[]> {
    const defaults = ANTHROPIC_DEFAULT_MODELS.map((m) => ({ ...m }));
    const key = apiKey.trim();
    if (!key) return defaults;
    try {
        const client = createClient(key, 20000);
        const known = new Set(defaults.map((m) => m.id));
        const extra: ModelDescriptor[] = [];
        for await (const m of client.models.list()) {
            if (known.has(m.id) || !m.id.startsWith('claude-')) continue;
            known.add(m.id);
            extra.push({
                id: m.id,
                name: m.display_name || m.id,
                ...(m.max_input_tokens ? { contextLength: m.max_input_tokens } : {})
            });
        }
        return [...defaults, ...extra];
    } catch (error) {
        console.warn('fetchAnthropicModels failed; using the built-in list:', error);
        return defaults;
    }
}
