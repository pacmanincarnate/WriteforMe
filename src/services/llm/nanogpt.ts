/**
 * @module services/llm/nanogpt
 * nano-GPT OpenAI-compatible client supporting reasoning budget/disable controls
 * (preserving always-thinking GLM models), JSON mode, and native tool calling.
 */

import { fetchWithTimeout } from '@/services/http';
import { cleanJson, extractReasoningAndContent } from '@/utils';
import {
    formatOpenAITools,
    type LlmCallOptions,
    type LlmChatMessage,
    type OpenAICompatibleFullResult,
    type OpenAIToolCall
} from './types';

interface NanoGPTApiResponse {
    error?: { message?: string };
    model?: string;
    choices?: Array<{
        message?: LlmChatMessage;
        delta?: LlmChatMessage;
    }>;
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
        cache_read_input_tokens?: number;
    };
}

export async function callNanoGPT(
    apiKey: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson = true,
    options: LlmCallOptions = {}
): Promise<unknown> {
    try {
        const key = apiKey ? apiKey.trim() : '';
        if (!key) throw new Error('nano-GPT API Key is missing. Please add it in Settings.');

        const opts: LlmCallOptions = typeof options === 'object' && options !== null ? options : {};

        const modelId = model || 'gpt-4o';
        const messages: LlmChatMessage[] =
            opts.messages && Array.isArray(opts.messages)
                ? opts.messages
                : [
                      ...(systemPrompt && String(systemPrompt).trim()
                          ? [{ role: 'system', content: systemPrompt }]
                          : []),
                      { role: 'user', content: prompt }
                  ];

        let targetMaxTokens = opts.max_tokens || 8192;

        const payload: Record<string, unknown> = {
            model: modelId,
            messages
        };

        if (isJson && (!opts.tools || opts.tools.length === 0)) {
            payload.response_format = { type: 'json_object' };
        }

        if (opts.tools && Array.isArray(opts.tools) && opts.tools.length > 0) {
            payload.tools = formatOpenAITools(opts.tools);
            if (opts.tool_choice) {
                payload.tool_choice = opts.tool_choice;
            }
        }

        if (opts.thinking && opts.thinking.enabled && (opts.thinking.budget || 0) > 0) {
            const budget = opts.thinking.budget || 0;
            const outputTokenAllowance = Math.max(targetMaxTokens, 16384);
            targetMaxTokens = Math.max(targetMaxTokens, budget + outputTokenAllowance, 32768);
            const effort =
                opts.thinking.effort ||
                (budget <= 2048 ? 'low' : budget <= 4096 ? 'medium' : 'high');

            payload.reasoning_effort = effort;
            payload.reasoning = { max_tokens: budget };
            payload.thinking = { type: 'enabled', budget_tokens: budget };
        } else if (!opts.thinking || !opts.thinking.enabled || opts.thinking.budget === 0) {
            const alwaysThinks = modelId.toLowerCase().includes('glm');
            if (!alwaysThinks) {
                payload.reasoning_effort = 'none';
                payload.reasoning = { effort: 'none' };
                payload.thinking = { type: 'disabled' };
            }
        } else if (opts.thinking && opts.thinking.effort) {
            payload.reasoning_effort = opts.thinking.effort;
            payload.reasoning = { effort: opts.thinking.effort };
            targetMaxTokens = Math.max(targetMaxTokens, 32768);
        }

        payload.max_tokens = targetMaxTokens;
        payload.max_completion_tokens = targetMaxTokens;

        const response = await fetchWithTimeout(
            'https://nano-gpt.com/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            },
            opts.timeout
        );

        if (!response.ok) {
            const errText = await response.text();
            try {
                const errJson = JSON.parse(errText) as {
                    error?: { message?: string };
                    message?: string;
                };
                if (response.status === 401) {
                    throw new Error(
                        `nano-GPT Authorization Failed (401). Please check your API Key in Settings. Details: ${
                            errJson.error?.message || errJson.message || errText
                        }`
                    );
                }
                throw new Error(
                    `nano-GPT Error: ${response.status} - ${
                        errJson.error?.message || errJson.message || errText
                    }`
                );
            } catch (e) {
                if (e instanceof Error && e.message.startsWith('nano-GPT')) throw e;
                throw new Error(`nano-GPT Error: ${response.status} - ${errText}`, { cause: e });
            }
        }

        const responseText = await response.text();
        if (!responseText || !responseText.trim()) {
            throw new Error('nano-GPT returned an empty response body.');
        }

        let data: NanoGPTApiResponse;
        try {
            data = JSON.parse(responseText) as NanoGPTApiResponse;
        } catch (e) {
            throw new Error(`nano-GPT returned invalid JSON: ${responseText.substring(0, 200)}`, {
                cause: e
            });
        }

        if (data.error) {
            throw new Error(
                `nano-GPT API returned error: ${data.error.message || JSON.stringify(data.error)}`
            );
        }

        const msg: LlmChatMessage = data.choices?.[0]?.message || { role: 'assistant' };
        const delta: Partial<LlmChatMessage> = data.choices?.[0]?.delta || {};
        const toolCalls: OpenAIToolCall[] = msg.tool_calls || delta.tool_calls || [];
        const rawText =
            (typeof msg.content === 'string' ? msg.content : '') ||
            (typeof delta.content === 'string' ? delta.content : '');
        const initialReasoning =
            msg.reasoning ||
            delta.reasoning ||
            msg.reasoning_content ||
            delta.reasoning_content ||
            msg.thought ||
            delta.thought ||
            msg.thinking ||
            delta.thinking ||
            '';

        if (toolCalls.length > 0 || opts.returnFullData) {
            if (opts.onSuccess) {
                const usage = data.usage || {};
                opts.onSuccess({
                    modelUsed: data.model || modelId,
                    tokensUsed: usage.total_tokens || null,
                    promptTokens: usage.prompt_tokens || null,
                    responseTokens: usage.completion_tokens || null,
                    thinkingTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
                    reasoningTokensUsed: usage.completion_tokens_details?.reasoning_tokens || 0,
                    cachedTokens:
                        Number(
                            usage.prompt_tokens_details?.cached_tokens ??
                                usage.cache_read_input_tokens ??
                                0
                        ) || 0,
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

        if (!text || !text.trim()) {
            if (reasoningText) {
                throw new Error(
                    'nano-GPT model exhausted token budget during thinking phase without generating final content.'
                );
            }
            throw new Error(
                `nano-GPT returned no content. Response payload: ${JSON.stringify(data)}`
            );
        }

        if (opts.onSuccess) {
            const usage = data.usage || {};
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
                      : null;
            const promptToks =
                usage.prompt_tokens !== undefined && usage.prompt_tokens !== null
                    ? usage.prompt_tokens
                    : prompt
                      ? Math.round(
                            ((systemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/)
                                .length * 1.33
                        )
                      : null;
            opts.onSuccess({
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
                cachedTokens:
                    Number(
                        usage.prompt_tokens_details?.cached_tokens ??
                            usage.cache_read_input_tokens ??
                            0
                    ) || 0,
                reasoningText,
                fullResponse: text
            });
        }

        if (isJson) {
            try {
                return JSON.parse(cleanJson(text));
            } catch (e) {
                console.error('nano-GPT JSON Parse Error. Raw Text:', text);
                throw new Error(
                    `Failed to parse nano-GPT response as JSON. Check console for details. Raw snippet: ${String(
                        text
                    ).substring(0, 150)}`,
                    { cause: e }
                );
            }
        }

        return text;
    } catch (error) {
        console.error('nano-GPT Error:', error);
        throw error;
    }
}
