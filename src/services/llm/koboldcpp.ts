/**
 * @module services/llm/koboldcpp
 * Local KoboldCPP and Codex Bridge OpenAI-compatible client with 3-tier DRY/Min-P/XTC
 * sampler tuning, GBNF grammar support, cloud-model sanitization, and health probe.
 */

import { fetchWithTimeout } from '@/services/http';
import { cleanJson, extractReasoningAndContent } from '@/utils';
import { getKoboldLoadedModelName } from './koboldRuntime';
import {
    formatOpenAITools,
    type LlmCallOptions,
    type LlmChatMessage,
    type OpenAICompatibleFullResult,
    type OpenAIToolCall
} from './types';

export interface KoboldStatusResult {
    online: boolean;
    model: string | null;
    error: string | null;
}

interface KoboldApiResponse {
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
    };
}

const getGlobalKoboldLoadedModel = (): string => getKoboldLoadedModelName();

export function isCloudModelName(m: unknown): boolean {
    if (!m || typeof m !== 'string') return false;
    const lower = m.toLowerCase().trim();
    return (
        lower.startsWith('gemini') ||
        lower.startsWith('gpt-') ||
        lower.startsWith('o1') ||
        lower.startsWith('o3') ||
        lower.startsWith('claude') ||
        lower.includes('anthropic/') ||
        lower.includes('google/') ||
        lower.includes('meta-llama/') ||
        lower.includes('deepseek/') ||
        lower.includes('mistralai/') ||
        lower.includes('qwen/') ||
        (lower.includes('/') && !lower.includes('\\'))
    );
}

export async function callKoboldCPP(
    baseUrl: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson?: boolean,
    options?: LlmCallOptions
): Promise<unknown>;
export async function callKoboldCPP(
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson?: boolean,
    options?: LlmCallOptions
): Promise<unknown>;
export async function callKoboldCPP(
    baseUrlOrModel: string,
    modelOrPrompt: string,
    promptOrSys: string,
    systemPromptOrIsJson: string | boolean = true,
    isJsonOrOptions: boolean | LlmCallOptions = true,
    optionsOrUndefined: LlmCallOptions = {}
): Promise<unknown> {
    try {
        let baseUrl = 'http://localhost:5001';
        let model: string;
        let prompt: string;
        let systemPrompt: string;
        let isJson: boolean;
        let options: LlmCallOptions;

        let firstArg = baseUrlOrModel;
        if (
            typeof firstArg === 'string' &&
            !firstArg.startsWith('http://') &&
            !firstArg.startsWith('https://') &&
            !isCloudModelName(firstArg)
        ) {
            if (
                firstArg.includes(':') ||
                firstArg.includes('.') ||
                firstArg.startsWith('localhost')
            ) {
                firstArg = 'http://' + firstArg;
            }
        }

        if (
            typeof firstArg === 'string' &&
            (firstArg.startsWith('http://') || firstArg.startsWith('https://'))
        ) {
            baseUrl = firstArg;
            model = modelOrPrompt;
            prompt = promptOrSys;
            systemPrompt = typeof systemPromptOrIsJson === 'string' ? systemPromptOrIsJson : '';
            isJson = typeof isJsonOrOptions === 'boolean' ? isJsonOrOptions : true;
            options = optionsOrUndefined || {};
        } else {
            model = baseUrlOrModel;
            prompt = modelOrPrompt;
            systemPrompt = promptOrSys;
            isJson = typeof systemPromptOrIsJson === 'boolean' ? systemPromptOrIsJson : true;
            options =
                typeof isJsonOrOptions === 'object' && isJsonOrOptions !== null
                    ? isJsonOrOptions
                    : {};
        }

        const opts: LlmCallOptions = typeof options === 'object' && options !== null ? options : {};

        const cleanBaseUrl =
            baseUrl && String(baseUrl).trim()
                ? String(baseUrl).trim().replace(/\/+$/, '')
                : 'http://localhost:5001';

        let sanitizedKoboldModel = model;
        const globalLoaded = getGlobalKoboldLoadedModel();
        if (opts.provider !== 'codex') {
            if (
                !sanitizedKoboldModel ||
                sanitizedKoboldModel === 'koboldcpp' ||
                isCloudModelName(sanitizedKoboldModel)
            ) {
                sanitizedKoboldModel = globalLoaded || 'koboldcpp';
            }
        }
        const modelId = opts.provider === 'codex' ? model || undefined : sanitizedKoboldModel;

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
        const isThinkingEnabled = Boolean(
            opts.thinking &&
                opts.thinking.enabled &&
                ((opts.thinking.budget || 0) > 0 || opts.thinking.effort)
        );

        if (isThinkingEnabled) {
            const budget = opts.thinking?.budget || 4096;
            targetMaxTokens = Math.max(targetMaxTokens, budget + 5000);
        }

        const logLower = String(opts.logName || '').toLowerCase();
        const isWriting = Boolean(
            opts.isWritingAgent ||
                opts.agentType === 'writing' ||
                (opts.logName &&
                    ((opts.logName.includes('Writing Agent') &&
                        !opts.logName.includes('Review') &&
                        !opts.logName.includes('Surgical')) ||
                        opts.logName.includes('Prose Generator') ||
                        opts.logName.includes('Prose Writer')))
        );

        const isAudioDrama = Boolean(
            opts.isAudioDrama ||
                opts.writing_mode === 'audio_drama' ||
                opts.writingMode === 'audio_drama' ||
                (typeof systemPrompt === 'string' &&
                    systemPrompt.includes('MANDATORY OVERRIDE: AUDIO DRAMA SCRIPT')) ||
                (typeof prompt === 'string' && prompt.includes('ACOUSTIC SCRIPT CADENCE RULE:'))
        );

        const isCreativeArchitecture =
            !isWriting &&
            Boolean(
                opts.isCreativeArchitecture ||
                    opts.agentType === 'architecture' ||
                    opts.agentType === 'creative_architecture' ||
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

        const temperature =
            opts.temperature !== undefined
                ? opts.temperature
                : isWriting
                  ? 0.75
                  : isCreativeArchitecture
                    ? 0.72
                    : 0.6;
        const topP =
            opts.top_p !== undefined
                ? opts.top_p
                : isWriting
                  ? 1.0
                  : isCreativeArchitecture
                    ? 0.98
                    : 0.95;
        const minP =
            opts.min_p !== undefined
                ? opts.min_p
                : isWriting
                  ? 0.05
                  : isCreativeArchitecture
                    ? 0.06
                    : 0.08;
        const dryMultiplier =
            opts.dry_multiplier !== undefined
                ? opts.dry_multiplier
                : isWriting
                  ? isAudioDrama
                      ? 0.5
                      : 0.8
                  : isCreativeArchitecture
                    ? 0.6
                    : 0.5;
        const dryBase = opts.dry_base !== undefined ? opts.dry_base : 1.75;
        const dryAllowedLength =
            opts.dry_allowed_length !== undefined
                ? opts.dry_allowed_length
                : isWriting
                  ? isAudioDrama
                      ? 3
                      : 2
                  : isCreativeArchitecture
                    ? 2
                    : 3;
        const dryRange = opts.dry_range !== undefined ? opts.dry_range : 2048;
        const drySequenceBreakers =
            opts.dry_sequence_breakers ||
            (isWriting
                ? isAudioDrama
                    ? ['\r\n\r\n', '\n\n', '\n', ':', '[', ']', '(', ')', '---', '***', '###']
                    : ['\r\n\r\n', '\n\n', '---', '***', '###']
                : isCreativeArchitecture
                  ? ['</', '/>', '\n\n', '```']
                  : ['\n', ',', ':', '{', '}', '[', ']', '<', '>', '"']);
        const xtcProbability =
            opts.xtc_probability !== undefined
                ? opts.xtc_probability
                : isWriting && !isAudioDrama
                  ? 0.5
                  : 0.0;
        const xtcThreshold = opts.xtc_threshold !== undefined ? opts.xtc_threshold : 0.1;

        const adaptiveP = opts.adaptive_p !== undefined ? opts.adaptive_p : 0.0;
        const adaptivePDecay = opts.adaptive_p_decay !== undefined ? opts.adaptive_p_decay : 0.9;

        const samplerOrder = opts.sampler_order || [0, 1, 3, 4, 2, 5];

        const payload: Record<string, unknown> = {
            model: modelId,
            messages,
            max_tokens: targetMaxTokens,
            temperature,
            top_p: topP,
            min_p: minP,
            sampler_order: samplerOrder,
            order: samplerOrder,
            dry_multiplier: dryMultiplier,
            dry_base: dryBase,
            dry_allowed_length: dryAllowedLength,
            dry_range: dryRange,
            dry_sequence_breakers: drySequenceBreakers
        };

        if (xtcProbability > 0) {
            payload.xtc_probability = xtcProbability;
            payload.xtc_threshold = xtcThreshold;
        }

        if (opts.stop && Array.isArray(opts.stop)) {
            payload.stop = opts.stop;
        } else {
            payload.stop = ['<|im_end|>', '<|endoftext|>', '<|im_start|>'];
        }

        if (adaptiveP > 0) {
            payload.adaptive_p = adaptiveP;
            payload.adaptive_p_decay = adaptivePDecay;
        }

        if (opts.tools && Array.isArray(opts.tools) && opts.tools.length > 0) {
            payload.tools = formatOpenAITools(opts.tools);
            if (opts.tool_choice) {
                payload.tool_choice = opts.tool_choice;
            }
        }

        if (isJson && !isThinkingEnabled && (!opts.tools || opts.tools.length === 0)) {
            payload.response_format = { type: 'json_object' };
        }

        const gbnfGrammar = opts.grammar || opts.gbnf;
        if (gbnfGrammar && !isThinkingEnabled) {
            payload.grammar = gbnfGrammar;
        }

        if (!isThinkingEnabled) {
            payload.reasoning_effort = 'none';
        } else {
            const budget = opts.thinking?.budget || 0;
            const effort =
                opts.thinking?.effort && opts.thinking.effort !== 'none'
                    ? opts.thinking.effort
                    : budget <= 2048
                      ? 'low'
                      : budget <= 4096
                        ? 'medium'
                        : 'high';
            payload.reasoning_effort = effort;
            payload.enable_reasoning = true;
        }

        let response: Response;
        const koboldTimeout =
            typeof opts.timeout === 'number' && opts.timeout > 0 ? opts.timeout : 15 * 60 * 1000;
        try {
            response = await fetchWithTimeout(
                `${cleanBaseUrl}/v1/chat/completions`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                },
                koboldTimeout
            );
        } catch (fetchErr) {
            const errName = fetchErr instanceof Error ? fetchErr.name : '';
            const errMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            if (errName === 'AbortError') {
                throw new Error(
                    `KoboldCPP request timed out after ${koboldTimeout / 1000} seconds.`,
                    { cause: fetchErr }
                );
            }
            if (
                errMessage.includes('Failed to fetch') ||
                errMessage.includes('NetworkError') ||
                errMessage.includes('ECONNREFUSED') ||
                errName === 'TypeError'
            ) {
                throw new Error(
                    `Could not connect to KoboldCPP at ${cleanBaseUrl}. Please ensure KoboldCPP is running locally.`,
                    { cause: fetchErr }
                );
            }
            throw fetchErr;
        }

        if (!response.ok) {
            const errText = await response.text();
            try {
                const errJson = JSON.parse(errText) as { error?: { message?: string } };
                throw new Error(
                    `KoboldCPP Error (${response.status}): ${errJson.error?.message || errText}`
                );
            } catch (e) {
                if (e instanceof Error && e.message.startsWith('KoboldCPP Error')) throw e;
                throw new Error(`KoboldCPP Error (${response.status}): ${errText}`, { cause: e });
            }
        }

        const responseText = await response.text();
        if (!responseText || !responseText.trim()) {
            throw new Error('KoboldCPP returned an empty response body.');
        }

        let data: KoboldApiResponse;
        try {
            data = JSON.parse(responseText) as KoboldApiResponse;
        } catch (e) {
            throw new Error(
                `KoboldCPP returned invalid JSON from API: ${responseText.substring(0, 200)}`,
                { cause: e }
            );
        }

        if (data.error) {
            throw new Error(
                `KoboldCPP API returned error: ${data.error.message || JSON.stringify(data.error)}`
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
            '';

        const actualKoboldReportedModel =
            opts.provider !== 'codex'
                ? globalLoaded ||
                  (data.model && !isCloudModelName(data.model) && data.model !== 'koboldcpp'
                      ? data.model
                      : modelId && !isCloudModelName(modelId)
                        ? modelId
                        : 'koboldcpp')
                : data.model || modelId || 'codex';

        if (toolCalls.length > 0 || opts.returnFullData) {
            if (opts.onSuccess) {
                const usage = data.usage || {};
                opts.onSuccess({
                    modelUsed: actualKoboldReportedModel,
                    tokensUsed: usage.total_tokens || null,
                    promptTokens: usage.prompt_tokens || null,
                    responseTokens: usage.completion_tokens || null,
                    thinkingTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
                    reasoningTokensUsed: usage.completion_tokens_details?.reasoning_tokens || 0,
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
                    'KoboldCPP model exhausted token budget during thinking phase without generating final content. Please increase max tokens or try again.'
                );
            }
            throw new Error(
                `KoboldCPP returned no content. Response payload: ${JSON.stringify(data)}`
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
                modelUsed: actualKoboldReportedModel,
                tokensUsed:
                    usage.total_tokens ||
                    (promptToks !== null && respToks !== null
                        ? promptToks + respToks + thinkingToks
                        : null),
                promptTokens: promptToks,
                responseTokens: respToks,
                thinkingTokens: thinkingToks,
                reasoningTokensUsed: thinkingToks,
                reasoningText,
                fullResponse: text
            });
        }

        if (isJson) {
            try {
                return JSON.parse(cleanJson(text));
            } catch (e) {
                console.error('KoboldCPP JSON Parse Error. Raw Text:', text);
                throw new Error(
                    `Failed to parse KoboldCPP response as JSON. Check console for details. Raw snippet: ${String(
                        text
                    ).substring(0, 150)}`,
                    { cause: e }
                );
            }
        }

        return text;
    } catch (error) {
        console.error('KoboldCPP Error:', error);
        throw error;
    }
}

export async function checkKoboldCPPStatus(
    baseUrl = 'http://localhost:5001'
): Promise<KoboldStatusResult> {
    const cleanUrl =
        baseUrl && String(baseUrl).trim()
            ? String(baseUrl).trim().replace(/\/+$/, '')
            : 'http://localhost:5001';
    try {
        const response = await fetchWithTimeout(
            `${cleanUrl}/v1/models`,
            {
                method: 'GET',
                headers: { Accept: 'application/json' }
            },
            3000
        );

        if (!response.ok) {
            return { online: false, model: null, error: `HTTP ${response.status}` };
        }

        const data = (await response.json()) as { data?: Array<{ id?: string }> };
        const modelName = data?.data?.[0]?.id || 'KoboldCPP Loaded Model';
        return { online: true, model: modelName, error: null };
    } catch {
        return { online: false, model: null, error: 'Connection Refused / Server Offline' };
    }
}
