/**
 * @module services/llm/gemini
 * Google Gemini REST client supporting thinking budgets/levels, JSON response
 * mode, native function calling, and token telemetry callbacks.
 */

import { CLOUD_API_URLS, DEFAULT_LLM_MODELS, DEFAULT_TOKEN_LIMITS } from '@/config';
import { fetchWithTimeout } from '@/services/http';
import { cleanJson, extractReasoningAndContent } from '@/utils';
import type {
    GeminiFunctionCall,
    GeminiFullResult,
    GeminiPart,
    LlmCallOptions,
    LlmToolDefinition
} from './types';
import { modelStopSignal } from './stop';

interface GeminiApiResponse {
    candidates?: Array<{
        content?: {
            parts?: GeminiPart[];
        };
    }>;
    usageMetadata?: {
        thoughtsTokenCount?: number;
        candidatesTokenCount?: number;
        promptTokenCount?: number;
        totalTokenCount?: number;
        cachedContentTokenCount?: number;
    };
}

export async function callGemini(
    apiKey: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    isJson = true,
    options: LlmCallOptions = {}
): Promise<unknown> {
    try {
        const key = apiKey ? apiKey.trim() : '';
        if (!key) throw new Error('API Key is missing. Please add it in Settings.');
        const modelId = (model || DEFAULT_LLM_MODELS.gemini).replace(/^(google\/|models\/)+/, '');

        const requestedTokens =
            options.max_tokens || options.maxTokens || DEFAULT_TOKEN_LIMITS.geminiDefaultMaxTokens;
        let targetMaxTokens = requestedTokens;

        const hasTools = Boolean(options.tools && Array.isArray(options.tools) && options.tools.length > 0);
        const generationConfig: Record<string, unknown> = {
            temperature: 0.8,
            ...(isJson && !hasTools ? { responseMimeType: 'application/json' } : {})
        };

        const isGemini3OrNewer =
            modelId.includes('gemini-3') || modelId.includes('gemini-4');

        // Apply thinking configuration if enabled, or explicitly disable for hybrid thinking models
        if (options.thinking && options.thinking.enabled && (options.thinking.budget || 0) > 0) {
            const budget = options.thinking.budget || 0;
            // Guarantee generous headroom for both deep reasoning and full structural/prose output (min 32k)
            const outputTokenAllowance = Math.max(requestedTokens, 16384);
            targetMaxTokens = Math.max(requestedTokens, budget + outputTokenAllowance, 32768);
            if (isGemini3OrNewer) {
                generationConfig.thinkingConfig = {
                    thinkingLevel:
                        options.thinking.level ||
                        (budget <= 2048 ? 'LOW' : budget <= 4096 ? 'MEDIUM' : 'HIGH')
                };
            } else {
                generationConfig.thinkingConfig = {
                    thinkingBudget: budget
                };
            }
        } else if (!options.thinking || !options.thinking.enabled || options.thinking.budget === 0) {
            // Explicitly disable thinking for hybrid/thinking-by-default models (e.g. Gemini 3.8 Flash, 3.7 Flash, 4.x)
            generationConfig.thinkingConfig = isGemini3OrNewer
                ? { thinkingLevel: 'MINIMAL' }
                : { thinkingBudget: 0 };
        } else if (options.thinking && options.thinking.effort) {
            targetMaxTokens = Math.max(requestedTokens, 32768);
            generationConfig.thinkingConfig = isGemini3OrNewer
                ? {
                      thinkingLevel:
                          options.thinking.level ||
                          (options.thinking.effort === 'low'
                              ? 'LOW'
                              : options.thinking.effort === 'high'
                                ? 'HIGH'
                                : 'MEDIUM')
                  }
                : {
                      thinkingBudget:
                          options.thinking.effort === 'low'
                              ? 2048
                              : options.thinking.effort === 'high'
                                ? 8192
                                : 4096
                  };
        }

        generationConfig.maxOutputTokens = targetMaxTokens;

        const contents = options.contents || [{ parts: [{ text: prompt }] }];
        const functionDeclarations = hasTools
            ? (options.tools || []).map((t) =>
                  'function' in t && t.function ? t.function : (t as LlmToolDefinition)
              )
            : [];
        const payload = {
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig,
            ...(hasTools ? { tools: [{ functionDeclarations }] } : {})
        };

        const response = await fetchWithTimeout(
            `${CLOUD_API_URLS.geminiModels}/${modelId}:generateContent`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify(payload),
                signal: modelStopSignal()
            },
            options.timeout
        );
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const responseText = await response.text();
        if (!responseText || !responseText.trim()) {
            throw new Error('Gemini returned an empty response body.');
        }

        let data: GeminiApiResponse;
        try {
            data = JSON.parse(responseText) as GeminiApiResponse;
        } catch (e) {
            throw new Error(`Gemini returned invalid JSON: ${responseText.substring(0, 200)}`, {
                cause: e
            });
        }

        let rawText = '';
        let initialReasoning = '';
        const functionCalls: GeminiFunctionCall[] = [];
        const parts = data.candidates?.[0]?.content?.parts;
        if (parts && parts.length > 0) {
            for (const part of parts) {
                if (part.thought) {
                    initialReasoning += part.text || '';
                } else if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                } else {
                    rawText += part.text || '';
                }
            }
        }

        if (!rawText && parts && parts[0] && !parts[0].thought && !parts[0].functionCall) {
            rawText = parts[0].text || '';
        }

        if (functionCalls.length > 0 || options.returnFullData) {
            const fullResult: GeminiFullResult = {
                functionCalls,
                text: rawText,
                reasoningText: initialReasoning,
                candidateParts: parts || [],
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
                    'Gemini model completed thinking phase but exhausted token budget before producing final response. Please try again.'
                );
            }
            if (!rawText) {
                throw new Error('Gemini returned an empty content string.');
            }
        }

        if (options.onSuccess) {
            const usage = data.usageMetadata || {};
            const reportedReasoningToks = usage.thoughtsTokenCount || 0;
            const thinkingToks =
                reportedReasoningToks > 0
                    ? reportedReasoningToks
                    : reasoningText
                      ? Math.round(reasoningText.trim().split(/\s+/).length * 1.33)
                      : 0;
            const respToks =
                usage.candidatesTokenCount !== undefined
                    ? usage.candidatesTokenCount
                    : text
                      ? Math.round(text.trim().split(/\s+/).length * 1.33)
                      : null;
            const promptToks =
                usage.promptTokenCount !== undefined && usage.promptTokenCount !== null
                    ? usage.promptTokenCount
                    : prompt
                      ? Math.round(
                            ((systemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/)
                                .length * 1.33
                        )
                      : null;
            options.onSuccess({
                modelUsed: modelId,
                tokensUsed:
                    usage.totalTokenCount ||
                    (promptToks !== null && respToks !== null
                        ? promptToks + respToks + thinkingToks
                        : null),
                promptTokens: promptToks,
                responseTokens: respToks,
                thinkingTokens: thinkingToks,
                reasoningTokensUsed: thinkingToks,
                cachedTokens: Number(usage.cachedContentTokenCount ?? 0) || 0,
                reasoningText,
                fullResponse: text
            });
        }

        if (isJson) {
            try {
                return JSON.parse(cleanJson(text));
            } catch (e) {
                console.error('Gemini JSON Parse Error. Raw Text:', text);
                throw new Error('Failed to parse AI response as JSON. Check console for details.', {
                    cause: e
                });
            }
        }
        return text;
    } catch (error) {
        console.error('Gemini Error:', error);
        throw error;
    }
}
