/**
 * @module services/llm/agenticLoop
 * Multi-turn Writing Agent loop supporting native tool calling (Gemini & OpenAI-compatible)
 * plus automatic XML `<tool_call>` fallback for legacy local backends, prompt logging,
 * meta-commentary filtering, and Audio Drama normalization.
 */

import {
    CLOUD_API_URLS,
    DEFAULT_SERVICE_URLS,
    LOG_AND_PROMPT_LIMITS,
    getPipelineStepInfo
} from '@/config';
import { CLI_BRIDGE_DEFAULT_URLS, isCliBridgeProvider, isLocalProvider } from '@/types';
import {
    isAudioDramaScriptText,
    isMetaCommentaryText,
    normalizeAudioDramaScript
} from '@/domain/audio';
import { callGemini } from './gemini';
import { callKoboldCPP } from './koboldcpp';
import { callAnthropic } from './anthropic';
import { callNanoGPT } from './nanogpt';
import { callOpenRouter } from './openrouter';
import { WRITING_AGENT_TOOLS, executeLocalTool, type LocalToolContext } from './tools';
import type {
    GeminiContentItem,
    GeminiFullResult,
    LlmCallOptions,
    LlmChatMessage,
    LlmSuccessMetadata,
    OpenAICompatibleFullResult
} from './types';
import { noteModelUsageFrom } from './usageMeter';

export const DEFAULT_PROMPT_LOG_CAP = LOG_AND_PROMPT_LIMITS.promptLogCap;

export interface AgenticLoopParams {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    prompt?: string;
    systemPrompt?: string;
    context?: LocalToolContext;
    maxTurns?: number;
    options?: LlmCallOptions;
    onProgress?: ((message: string) => void) | null;
}

export interface AgenticLoopResult {
    prose: string;
    characterStateUpdates: unknown[];
    sceneExitHook: string;
    turnsCompleted: number;
}

export { isMetaCommentaryText };

function parseToolArgs(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
    let s = String(raw || '').trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    try {
        const parsed = JSON.parse(s) as unknown;
        return typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

function getToolProgressLabel(toolName: string, args: Record<string, unknown>): string {
    const labels: Record<string, string> = {
        inspect_character_state: `Inspecting ${String(args.character_id || 'Character')} State`,
        query_story_lore: `Querying Lore: "${String(args.topic || '').slice(0, 25)}"`,
        inspect_previous_scene_exit: 'Checking Scene Transition Hook',
        inspect_current_scene_draft: 'Inspecting Current Scene Prior Draft',
        evaluate_draft: 'Critiquing Draft Quality & Trope Balance',
        commit_scene_prose: 'Committing Final Scene Prose',
        query_archivist: `Archivist Memory: "${String(args.query || '').slice(0, 25)}"`,
        roll_narrative_oracle: `Rolling Narrative Oracle (${String(
            args.category || 'micro-friction'
        )})`
    };
    return labels[toolName] || `Tool [${toolName}]`;
}

export async function callAgenticLoop({
    provider = 'gemini',
    model = '',
    apiKey = '',
    baseUrl = '',
    prompt = '',
    systemPrompt = '',
    context = {},
    maxTurns = 5,
    options = {},
    onProgress = null
}: AgenticLoopParams): Promise<AgenticLoopResult> {
    const effectiveProvider = (provider || 'gemini').toLowerCase();
    let currentTurn = 1;
    let finalProseResult: string | null = null;
    let characterStateUpdates: unknown[] = [];
    let sceneExitHook = '';
    let latestDraftProse = '';

    const toolDelayMs =
        typeof options?.toolDelayMs === 'number' && options.toolDelayMs >= 0
            ? options.toolDelayMs
            : 600;
    const waitForToolStep = (): Promise<void> =>
        toolDelayMs > 0
            ? new Promise((resolve) => setTimeout(resolve, toolDelayMs))
            : Promise.resolve();

    console.log(`[Pipeline - Writing Agent] Starting session with ${effectiveProvider} (${model})...`);
    if (onProgress) onProgress(`Agentic Loop: Initializing ${effectiveProvider} session...`);

    const toolXmlDocumentation = `\n\nAVAILABLE RUNTIME TOOLS:
You have access to interactive agentic tools to ground your narrative in canon, state, and literary quality:
1. inspect_character_state(character_id: string): Retrieve real-time psychological, physical, and relational state for a character.
2. query_story_lore(topic: string): Search world lore, rules, and status quo facts.
3. inspect_previous_scene_exit(): Retrieve ending tone, lingering momentum, and exit hook from preceding scene.
4. inspect_current_scene_draft(include_full_draft?: boolean): Retrieve the current scene's prior draft and review feedback when revising.
5. evaluate_draft(draft_text: string, focus_areas?: string[]): Critique your draft against genre rules, dialogue ratio / audio drama character dialogue, and clinical tropes.
6. commit_scene_prose(final_prose: string, character_state_updates?: object[], scene_exit_hook?: string): TERMINAL ACTION: Commit finalized prose to story record.
7. query_archivist(query: string, focus_entity?: string): Query the Multi-Tiered Memory Engine (Graph & Event Log) for verified historical context.
8. roll_narrative_oracle(category?: string, dramatic_context?: string): Roll an improv-style lateral dice tool for organic micro-frictions (Yes but/No and, status shifts, subtext eruptions, sensorial intrusions, oblique strategies).

To call a tool, output:
<tool_call name="tool_name">
{ "parameter_name": "value" }
</tool_call>
When done, call commit_scene_prose, or enclose your completed narrative inside <prose_text>...</prose_text>.`;

    const isAudioDramaMode = Boolean(
        (context && context.story && context.story.writing_mode === 'audio_drama') ||
            (context && context.writing_mode === 'audio_drama') ||
            options?.isAudioDrama ||
            options?.writing_mode === 'audio_drama' ||
            (typeof systemPrompt === 'string' &&
                systemPrompt.includes('MANDATORY OVERRIDE: AUDIO DRAMA SCRIPT'))
    );
    const baseLogName = options?.logName || 'Writing Agent (Agentic Loop)';
    const defaultMaxTokens =
        effectiveProvider === 'openrouter'
            ? 65536
            : isLocalProvider(effectiveProvider)
              ? 32768
              : 16384;
    const resolvedMaxTokens = options?.max_tokens || defaultMaxTokens;
    const resolvedTemp =
        options?.temperature !== undefined
            ? options.temperature
            : effectiveProvider === 'gemini'
              ? 0.8
              : effectiveProvider === 'openrouter'
                ? 0.85
                : 0.75;
    const enrichedOptions: LlmCallOptions = {
        ...options,
        isWritingAgent: options?.isWritingAgent !== undefined ? options.isWritingAgent : true,
        agentType: options?.agentType || 'writing',
        isAudioDrama: isAudioDramaMode,
        writing_mode: isAudioDramaMode
            ? 'audio_drama'
            : context?.writing_mode || context?.story?.writing_mode || options?.writing_mode || 'novel',
        logName: baseLogName,
        max_tokens: resolvedMaxTokens,
        temperature: resolvedTemp
    };

    const logPromptFn = typeof options?.onPromptLog === 'function' ? options.onPromptLog : null;
    const logCap = DEFAULT_PROMPT_LOG_CAP;
    const resolveEndpoint = (): string => {
        if (effectiveProvider === 'gemini') {
            return `${CLOUD_API_URLS.geminiModels}/${model}:generateContent`;
        }
        if (effectiveProvider === 'nanogpt') return CLOUD_API_URLS.nanoGptChat;
        if (effectiveProvider === 'anthropic') return CLOUD_API_URLS.anthropicMessages;
        if (effectiveProvider === 'openrouter') {
            return CLOUD_API_URLS.openRouterChat;
        }
        if (isCliBridgeProvider(effectiveProvider)) {
            return `${baseUrl || CLI_BRIDGE_DEFAULT_URLS[effectiveProvider]}/v1/chat/completions`;
        }
        return `${baseUrl || DEFAULT_SERVICE_URLS.koboldcpp}/v1/chat/completions`;
    };

    const runLoggedAgenticTurn = async <TResult>(
        turnNum: number,
        turnPromptText: string,
        execFn: (turnOnSuccess: (metadata?: LlmSuccessMetadata) => void) => Promise<TResult>
    ): Promise<TResult> => {
        const startTime = performance.now();
        const logId = `agentic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const turnLogName = `${baseLogName} (Turn ${turnNum}/${maxTurns})`;
        const stepInfo = getPipelineStepInfo(baseLogName);
        const initialEstPromptToks = Math.round(
            ((systemPrompt || '') + ' ' + (turnPromptText || '')).trim().split(/\s+/).length * 1.33
        );
        const requestParams = {
            provider: effectiveProvider,
            model,
            modelRole: options?.modelRole || 'prose',
            modelSize: 'prose',
            isJson: false,
            maxTokens: resolvedMaxTokens,
            temperature: resolvedTemp,
            timeoutSeconds:
                isLocalProvider(effectiveProvider)
                    ? 15 * 60
                    : undefined,
            thinking: { enabled: false, budget: 0, effort: 'none', level: 'MINIMAL' },
            endpoint: resolveEndpoint()
        };

        if (logPromptFn) {
            const entry: Record<string, unknown> = {
                id: logId,
                timestamp: new Date().toLocaleTimeString(),
                isoTimestamp: new Date().toISOString(),
                function: turnLogName,
                stepId: stepInfo?.stepId || null,
                stepTier: stepInfo?.stepTier || 'Tier 5.1',
                stepTitle: stepInfo?.stepTitle || 'Writing Agent (Prose Generator)',
                prompt: turnPromptText,
                systemPrompt,
                finalSystemPrompt: systemPrompt,
                parameters: requestParams,
                modelUsed: model,
                modelRole: options?.modelRole || 'prose',
                modelSize: 'prose',
                provider: effectiveProvider,
                status: 'pending',
                attempts: 1,
                maxRetries: 1,
                pipelineAttempt: 1,
                pipelineMaxAttempts: 3,
                errors: [],
                durationSec: null,
                durationMs: null,
                tokensUsed: null,
                promptTokens: initialEstPromptToks,
                cachedTokens: null,
                cacheWriteTokens: null,
                routedProvider: null,
                responseTokens: null,
                thinkingTokens: null,
                reasoningTokensUsed: null,
                reasoningText: '',
                response: '',
                responseSnippet: '',
                validationSummary: `Dispatched to ${model} [${effectiveProvider} / prose] (Turn ${turnNum}/${maxTurns}). Waiting for response...`
            };
            logPromptFn((prev) => [entry, ...(prev || [])].slice(0, logCap));
        }

        const turnOnSuccess = (metadata: Partial<LlmSuccessMetadata> = {}): void => {
            noteModelUsageFrom(metadata);
            if (!logPromptFn) return;
            const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
            const durationMs = Math.round(performance.now() - startTime);
            const thinkingToks = metadata.thinkingTokens ?? metadata.reasoningTokensUsed ?? 0;
            const respToks =
                metadata.responseTokens ??
                (metadata.tokensUsed ? Math.max(0, metadata.tokensUsed - thinkingToks) : null);
            const promptToks = metadata.promptTokens ?? initialEstPromptToks;
            const fullResp = metadata.fullResponse || '';
            logPromptFn((prev) =>
                (prev || []).map((e) =>
                    e.id !== logId
                        ? e
                        : {
                              ...e,
                              status: 'success',
                              durationSec,
                              durationMs,
                              modelUsed: metadata.modelUsed || model,
                              tokensUsed:
                                  metadata.tokensUsed ??
                                  (promptToks || 0) + (thinkingToks || 0) + (respToks || 0),
                              promptTokens: promptToks,
                              cachedTokens: metadata.cachedTokens ?? e.cachedTokens ?? null,
                              cacheWriteTokens:
                                  metadata.cacheWriteTokens ?? e.cacheWriteTokens ?? null,
                              routedProvider: metadata.routedProvider || e.routedProvider || null,
                              responseTokens: respToks,
                              thinkingTokens: thinkingToks,
                              reasoningTokensUsed: thinkingToks,
                              reasoningText: metadata.reasoningText || e.reasoningText || '',
                              response: fullResp || e.response || '',
                              responseSnippet: fullResp
                                  ? fullResp.length > 300
                                      ? fullResp.slice(0, 300) + '...'
                                      : fullResp
                                  : e.responseSnippet,
                              validationSummary: `Valid response received in ${durationSec}s (${durationMs}ms)`
                          }
                )
            );
        };

        try {
            const result = await execFn(turnOnSuccess);
            if (logPromptFn) {
                const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
                const durationMs = Math.round(performance.now() - startTime);
                let respStr = '';
                if (typeof result === 'string') {
                    respStr = result;
                } else if (result && typeof result === 'object') {
                    const resObj = result as { text?: string; tool_calls?: unknown[] };
                    respStr =
                        resObj.text ||
                        (resObj.tool_calls && resObj.tool_calls.length > 0
                            ? JSON.stringify(resObj.tool_calls, null, 2)
                            : JSON.stringify(result, null, 2));
                }
                const snippet = respStr.length > 300 ? respStr.slice(0, 300) + '...' : respStr;
                const estRespToks = respStr
                    ? Math.round(respStr.trim().split(/\s+/).length * 1.33)
                    : 0;
                logPromptFn((prev) =>
                    (prev || []).map((e) => {
                        if (e.id !== logId) return e;
                        const finalPromptToks =
                            e.promptTokens !== null && e.promptTokens !== undefined
                                ? Number(e.promptTokens)
                                : initialEstPromptToks;
                        const finalRespToks =
                            e.responseTokens !== null && e.responseTokens !== undefined
                                ? Number(e.responseTokens)
                                : estRespToks;
                        const finalThinkToks = Number(e.thinkingTokens) || 0;
                        const prevValidation = String(e.validationSummary || '');
                        return {
                            ...e,
                            status: 'success',
                            durationSec: e.durationSec || durationSec,
                            durationMs: e.durationMs || durationMs,
                            response: e.response || respStr,
                            responseSnippet: e.responseSnippet || snippet,
                            promptTokens: finalPromptToks,
                            responseTokens: finalRespToks,
                            tokensUsed:
                                e.tokensUsed ?? finalPromptToks + finalThinkToks + finalRespToks,
                            validationSummary: prevValidation.startsWith('Valid response')
                                ? prevValidation
                                : `Valid response received (${respStr.length} chars) in ${durationSec}s`
                        };
                    })
                );
            }
            return result;
        } catch (err) {
            if (logPromptFn) {
                const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
                const durationMs = Math.round(performance.now() - startTime);
                const errMsg = String((err instanceof Error ? err.message : err) || 'Unknown error');
                logPromptFn((prev) =>
                    (prev || []).map((e) =>
                        e.id !== logId
                            ? e
                            : {
                                  ...e,
                                  status: 'error',
                                  durationSec,
                                  durationMs,
                                  error: errMsg,
                                  lastError: errMsg,
                                  errors: [
                                      ...(Array.isArray(e.errors) ? e.errors : []),
                                      {
                                          attempt: 1,
                                          timestamp: new Date().toLocaleTimeString(),
                                          error: errMsg
                                      }
                                  ],
                                  validationSummary: `Turn ${turnNum}/${maxTurns} failed: ${errMsg}`
                              }
                    )
                );
            }
            throw err;
        }
    };

    if (effectiveProvider === 'gemini') {
        const contents: GeminiContentItem[] = [{ parts: [{ text: prompt }] }];
        while (currentTurn <= maxTurns) {
            if (onProgress) onProgress(`Agentic Loop (Gemini): Turn ${currentTurn}/${maxTurns}...`);
            const turnPromptDisplay =
                currentTurn === 1
                    ? prompt
                    : contents
                          .map(
                              (c) =>
                                  `[${c.role || 'user'}]: ${(c.parts || [])
                                      .map((p) => p.text || JSON.stringify(p))
                                      .join('\n')}`
                          )
                          .join('\n\n');
            const response = (await runLoggedAgenticTurn(
                currentTurn,
                turnPromptDisplay,
                (turnOnSuccess) =>
                    callGemini(apiKey, model, '', systemPrompt, false, {
                        ...enrichedOptions,
                        tools: WRITING_AGENT_TOOLS,
                        contents,
                        returnFullData: true,
                        onSuccess: turnOnSuccess,
                        max_tokens: enrichedOptions.max_tokens || 16384
                    }) as Promise<GeminiFullResult>
            )) as GeminiFullResult;

            const functionCalls = response.functionCalls || [];
            const text = response.text || '';

            if (text && text.includes('<prose_text>')) {
                const pMatch = /<prose_text>([\s\S]*?)<\/prose_text>/i.exec(text);
                if (pMatch && pMatch[1].trim()) {
                    latestDraftProse = pMatch[1].trim();
                }
            } else if (
                functionCalls.length === 0 &&
                text &&
                text.length > 200 &&
                !text.includes('<tool_call>') &&
                !isMetaCommentaryText(text)
            ) {
                latestDraftProse = text.trim();
            }

            if (functionCalls.length > 0) {
                let hasTerminalCommit = false;
                for (const fc of functionCalls) {
                    const name = fc.name;
                    const args = parseToolArgs(fc.args);
                    const toolLabel = getToolProgressLabel(name, args);

                    if (onProgress) {
                        onProgress(
                            `Agentic Loop (Gemini) [Turn ${currentTurn}/${maxTurns}]: Executing ${toolLabel}...`
                        );
                    }
                    console.log(
                        `[Pipeline - Writing Agent] Gemini executing tool [${name}] with args:`,
                        args
                    );
                    await waitForToolStep();

                    const toolRes = executeLocalTool(name, args, context);
                    console.log(
                        `[Pipeline - Writing Agent] Gemini tool [${name}] result:`,
                        toolRes
                    );

                    if (name === 'commit_scene_prose') {
                        finalProseResult = String(args.final_prose || '').trim();
                        characterStateUpdates = Array.isArray(args.character_state_updates)
                            ? args.character_state_updates
                            : [];
                        sceneExitHook = String(args.scene_exit_hook || '');
                        hasTerminalCommit = true;
                        break;
                    }

                    if (name === 'evaluate_draft' && args.draft_text) {
                        latestDraftProse = String(args.draft_text).trim();
                    }

                    const toolPayload =
                        currentTurn >= maxTurns - 1
                            ? {
                                  ...toolRes,
                                  _turn_notice: `Turn ${currentTurn} of ${maxTurns}. You must now write the final scene prose and either call commit_scene_prose or enclose in <prose_text> tags.`
                              }
                            : toolRes;

                    contents.push({
                        role: 'model',
                        parts:
                            response.candidateParts && response.candidateParts.length > 0
                                ? response.candidateParts
                                : [{ functionCall: fc }]
                    });
                    contents.push({
                        role: 'function',
                        parts: [
                            {
                                functionResponse: {
                                    name,
                                    response: { output: toolPayload }
                                }
                            }
                        ]
                    });
                }
                if (hasTerminalCommit) break;
            } else {
                const tcMatch = /<tool_call\s+name=["']?([^"'>]+)["']?\s*>([\s\S]*?)<\/tool_call>/i.exec(
                    text
                );
                if (tcMatch) {
                    const toolName = tcMatch[1].trim();
                    const parsedArgs = parseToolArgs(tcMatch[2]);
                    const toolLabel = getToolProgressLabel(toolName, parsedArgs);

                    if (onProgress) {
                        onProgress(
                            `Agentic Loop (Gemini) [Turn ${currentTurn}/${maxTurns}]: Executing ${toolLabel}...`
                        );
                    }
                    console.log(
                        `[Pipeline - Writing Agent] Gemini executing XML tool [${toolName}] with args:`,
                        parsedArgs
                    );
                    await waitForToolStep();

                    if (toolName === 'commit_scene_prose') {
                        finalProseResult = String(parsedArgs.final_prose || '').trim();
                        characterStateUpdates = Array.isArray(parsedArgs.character_state_updates)
                            ? parsedArgs.character_state_updates
                            : [];
                        sceneExitHook = String(parsedArgs.scene_exit_hook || '');
                        break;
                    }

                    if (toolName === 'evaluate_draft' && parsedArgs.draft_text) {
                        latestDraftProse = String(parsedArgs.draft_text).trim();
                    }

                    const res = executeLocalTool(toolName, parsedArgs, context);
                    console.log(
                        `[Pipeline - Writing Agent] Gemini XML tool [${toolName}] result:`,
                        res
                    );

                    const turnNotice =
                        currentTurn >= maxTurns - 1
                            ? `\n(Turn ${currentTurn} of ${maxTurns}. You must now write the final scene prose and either call commit_scene_prose or enclose in <prose_text> tags.)`
                            : '';

                    contents.push({ role: 'model', parts: [{ text }] });
                    contents.push({
                        role: 'user',
                        parts: [
                            {
                                text: `Tool result for ${toolName}:\n${JSON.stringify(
                                    res,
                                    null,
                                    2
                                )}${turnNotice}\nPlease continue or commit final prose.`
                            }
                        ]
                    });
                } else {
                    if (text.includes('<prose_text>')) {
                        const m = /<prose_text>([\s\S]*?)<\/prose_text>/i.exec(text);
                        finalProseResult = m ? m[1].trim() : text.trim();
                    } else if (!isMetaCommentaryText(text) || !latestDraftProse) {
                        finalProseResult = text.trim();
                    }
                    break;
                }
            }
            currentTurn++;
        }
    } else {
        const providerLabel =
            effectiveProvider === 'koboldcpp'
                ? 'KoboldCPP'
                : effectiveProvider === 'codex'
                  ? 'Codex'
                  : effectiveProvider === 'claude'
                    ? 'Claude Code'
                  : effectiveProvider === 'nanogpt'
                    ? 'nano-GPT'
                  : effectiveProvider === 'anthropic'
                    ? 'Anthropic'
                    : 'OpenRouter';

        const messages: LlmChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];
        let useNativeTools = true;
        let fallbackXmlPrompt = `${prompt}\n${toolXmlDocumentation}`;

        while (currentTurn <= maxTurns) {
            console.log(
                `[Pipeline - Writing Agent] ${providerLabel} Turn ${currentTurn}/${maxTurns}...`
            );
            if (onProgress) {
                onProgress(`Agentic Loop (${providerLabel}): Turn ${currentTurn}/${maxTurns}...`);
            }

            let response: OpenAICompatibleFullResult | null = null;
            let turnResponseText = '';
            let toolCalls: OpenAICompatibleFullResult['tool_calls'] = [];

            if (useNativeTools) {
                const turnPromptDisplay =
                    currentTurn === 1
                        ? prompt
                        : messages
                              .filter((m) => m.role !== 'system')
                              .map(
                                  (m) =>
                                      `[${m.role}]: ${
                                          typeof m.content === 'string' && m.content
                                              ? m.content
                                              : JSON.stringify(m.tool_calls || '')
                                      }`
                              )
                              .join('\n\n');
                try {
                    response = await runLoggedAgenticTurn(
                        currentTurn,
                        turnPromptDisplay,
                        (turnOnSuccess) => {
                            const turnOpts: LlmCallOptions = {
                                ...enrichedOptions,
                                tools: WRITING_AGENT_TOOLS,
                                messages,
                                returnFullData: true,
                                onSuccess: turnOnSuccess
                            };
                            if (effectiveProvider === 'openrouter') {
                                const storyKeyForCache = String(context?.story?.id || 'global')
                                    .replace(/[^a-zA-Z0-9._-]/g, '_')
                                    .slice(0, 40);
                                const modelKeyForCache = String(model || 'default')
                                    .replace(/[^a-zA-Z0-9._-]/g, '_')
                                    .slice(0, 48);
                                const agenticRole = enrichedOptions.modelRole || 'prose';
                                const openRouterSessionId = `ep:${storyKeyForCache}:${agenticRole}:${modelKeyForCache}`;
                                return callOpenRouter(apiKey, model, '', systemPrompt, false, {
                                    ...turnOpts,
                                    modelRole: agenticRole,
                                    sessionId: openRouterSessionId,
                                    max_tokens: enrichedOptions.max_tokens || 65536
                                }) as Promise<OpenAICompatibleFullResult>;
                            } else if (effectiveProvider === 'nanogpt') {
                                return callNanoGPT(apiKey, model, '', systemPrompt, false, {
                                    ...turnOpts,
                                    max_tokens: enrichedOptions.max_tokens || 16384
                                }) as Promise<OpenAICompatibleFullResult>;
                            } else if (effectiveProvider === 'anthropic') {
                                return callAnthropic(apiKey, model, '', systemPrompt, false, {
                                    ...turnOpts,
                                    max_tokens: enrichedOptions.max_tokens || 32768
                                }) as Promise<OpenAICompatibleFullResult>;
                            }
                            const targetUrl =
                                isCliBridgeProvider(effectiveProvider)
                                    ? baseUrl || CLI_BRIDGE_DEFAULT_URLS[effectiveProvider]
                                    : baseUrl || DEFAULT_SERVICE_URLS.koboldcpp;
                            return callKoboldCPP(targetUrl, model, '', systemPrompt, false, {
                                ...turnOpts,
                                provider: effectiveProvider,
                                max_tokens: enrichedOptions.max_tokens || 32768
                            }) as Promise<OpenAICompatibleFullResult>;
                        }
                    );
                    toolCalls = response?.tool_calls || [];
                    turnResponseText = response?.text || '';
                } catch (turnErr) {
                    const errStr = String(
                        turnErr instanceof Error ? turnErr.message : turnErr || ''
                    ).toLowerCase();
                    if (
                        isLocalProvider(effectiveProvider) &&
                        (errStr.includes('tool') ||
                            errStr.includes('schema') ||
                            errStr.includes('unrecognized') ||
                            errStr.includes('400'))
                    ) {
                        console.warn(
                            `[callAgenticLoop] Native tools rejected by ${effectiveProvider} (${
                                turnErr instanceof Error ? turnErr.message : String(turnErr)
                            }). Switching to XML tool fallback.`
                        );
                        useNativeTools = false;
                    } else {
                        throw turnErr;
                    }
                }
            }

            if (!useNativeTools) {
                const fallbackResponse = await runLoggedAgenticTurn(
                    currentTurn,
                    fallbackXmlPrompt,
                    (turnOnSuccess) => {
                        const fbOpts: LlmCallOptions = {
                            ...enrichedOptions,
                            onSuccess: turnOnSuccess
                        };
                        if (effectiveProvider === 'nanogpt') {
                            return callNanoGPT(
                                apiKey,
                                model,
                                fallbackXmlPrompt,
                                systemPrompt,
                                false,
                                fbOpts
                            );
                        }
                        const targetUrl =
                            isCliBridgeProvider(effectiveProvider)
                                ? baseUrl || CLI_BRIDGE_DEFAULT_URLS[effectiveProvider]
                                : baseUrl || DEFAULT_SERVICE_URLS.koboldcpp;
                        return callKoboldCPP(
                            targetUrl,
                            model,
                            fallbackXmlPrompt,
                            systemPrompt,
                            false,
                            {
                                ...fbOpts,
                                provider: effectiveProvider,
                                max_tokens: enrichedOptions.max_tokens || 32768
                            }
                        );
                    }
                );
                turnResponseText =
                    typeof fallbackResponse === 'string'
                        ? fallbackResponse
                        : (fallbackResponse as { text?: string } | null)?.text ||
                          JSON.stringify(fallbackResponse);
            }

            if (turnResponseText && turnResponseText.includes('<prose_text>')) {
                const pMatch = /<prose_text>([\s\S]*?)<\/prose_text>/i.exec(turnResponseText);
                if (pMatch && pMatch[1].trim()) {
                    latestDraftProse = pMatch[1].trim();
                }
            } else if (
                toolCalls.length === 0 &&
                turnResponseText &&
                turnResponseText.length > 200 &&
                !turnResponseText.includes('<tool_call>') &&
                !isMetaCommentaryText(turnResponseText)
            ) {
                latestDraftProse = turnResponseText.trim();
            }

            if (toolCalls.length > 0) {
                let hasTerminalCommit = false;
                messages.push(
                    response?.message || {
                        role: 'assistant',
                        tool_calls: toolCalls,
                        content: turnResponseText || null
                    }
                );

                for (const tc of toolCalls) {
                    const name = tc.function?.name || '';
                    const args = parseToolArgs(tc.function?.arguments);
                    const toolLabel = getToolProgressLabel(name, args);

                    if (onProgress) {
                        onProgress(
                            `Agentic Loop (${providerLabel}) [Turn ${currentTurn}/${maxTurns}]: Executing ${toolLabel}...`
                        );
                    }
                    console.log(
                        `[Pipeline - Writing Agent] ${providerLabel} executing tool [${name}] with args:`,
                        args
                    );
                    await waitForToolStep();

                    const toolRes = executeLocalTool(name, args, context);
                    console.log(
                        `[Pipeline - Writing Agent] ${providerLabel} tool [${name}] result:`,
                        toolRes
                    );

                    if (name === 'commit_scene_prose') {
                        finalProseResult = String(args.final_prose || '').trim();
                        characterStateUpdates = Array.isArray(args.character_state_updates)
                            ? args.character_state_updates
                            : [];
                        sceneExitHook = String(args.scene_exit_hook || '');
                        hasTerminalCommit = true;
                        break;
                    }

                    if (name === 'evaluate_draft' && args.draft_text) {
                        latestDraftProse = String(args.draft_text).trim();
                    }

                    const toolPayload =
                        currentTurn >= maxTurns - 1
                            ? {
                                  ...toolRes,
                                  _turn_notice: `Turn ${currentTurn} of ${maxTurns}. You must now write the final scene prose and either call commit_scene_prose or output inside <prose_text> tags.`
                              }
                            : toolRes;

                    messages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        name,
                        content: JSON.stringify(toolPayload)
                    });
                }
                if (hasTerminalCommit) break;
            } else {
                const tcMatch = /<tool_call\s+name=["']?([^"'>]+)["']?\s*>([\s\S]*?)<\/tool_call>/i.exec(
                    turnResponseText
                );
                if (tcMatch) {
                    const toolName = tcMatch[1].trim();
                    const parsedArgs = parseToolArgs(tcMatch[2]);
                    const toolLabel = getToolProgressLabel(toolName, parsedArgs);

                    if (onProgress) {
                        onProgress(
                            `Agentic Loop (${providerLabel}) [Turn ${currentTurn}/${maxTurns}]: Executing ${toolLabel}...`
                        );
                    }
                    console.log(
                        `[Pipeline - Writing Agent] ${providerLabel} executing XML tool [${toolName}] with args:`,
                        parsedArgs
                    );
                    await waitForToolStep();

                    if (toolName === 'commit_scene_prose') {
                        finalProseResult = String(parsedArgs.final_prose || '').trim();
                        characterStateUpdates = Array.isArray(parsedArgs.character_state_updates)
                            ? parsedArgs.character_state_updates
                            : [];
                        sceneExitHook = String(parsedArgs.scene_exit_hook || '');
                        break;
                    }

                    if (toolName === 'evaluate_draft' && parsedArgs.draft_text) {
                        latestDraftProse = String(parsedArgs.draft_text).trim();
                    }

                    const res = executeLocalTool(toolName, parsedArgs, context);
                    console.log(
                        `[Pipeline - Writing Agent] ${providerLabel} XML tool [${toolName}] result:`,
                        res
                    );

                    const turnNotice =
                        currentTurn >= maxTurns - 1
                            ? `\n(Turn ${currentTurn} of ${maxTurns}. You must now write the final scene prose and either call commit_scene_prose or enclose in <prose_text> tags.)`
                            : '';

                    if (useNativeTools) {
                        messages.push({ role: 'assistant', content: turnResponseText });
                        messages.push({
                            role: 'user',
                            content: `Tool result for ${toolName}:\n${JSON.stringify(
                                res,
                                null,
                                2
                            )}${turnNotice}\nPlease proceed or call commit_scene_prose.`
                        });
                    } else {
                        fallbackXmlPrompt += `\n\n${turnResponseText}\n\n<tool_response name="${toolName}">\n${JSON.stringify(
                            res,
                            null,
                            2
                        )}${turnNotice}\n</tool_response>\n\nProceed to refine or commit final scene prose.`;
                    }
                } else {
                    if (turnResponseText.includes('<prose_text>')) {
                        const m = /<prose_text>([\s\S]*?)<\/prose_text>/i.exec(turnResponseText);
                        finalProseResult = m ? m[1].trim() : turnResponseText.trim();
                    } else if (!isMetaCommentaryText(turnResponseText) || !latestDraftProse) {
                        finalProseResult = turnResponseText.trim();
                    }
                    break;
                }
            }
            currentTurn++;
        }
    }

    let candidateProse = finalProseResult;
    if (
        (!candidateProse || isMetaCommentaryText(candidateProse)) &&
        latestDraftProse &&
        !isMetaCommentaryText(latestDraftProse)
    ) {
        candidateProse = latestDraftProse;
    } else if (!candidateProse) {
        candidateProse = latestDraftProse || '';
    }
    const preserveDrama3Tags = Boolean(isAudioDramaMode || isAudioDramaScriptText(candidateProse));
    let cleanProse = candidateProse
        .replace(/<｜.*?｜>/g, '')
        .replace(/<\|.*?\|>/g, '')
        .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_response[\s\S]*?<\/tool_response>/gi, '')
        .replace(/<prose_text>([\s\S]*?)<\/prose_text>/gi, '$1')
        .trim();

    if (cleanProse && preserveDrama3Tags) {
        cleanProse = normalizeAudioDramaScript(cleanProse);
    }
    cleanProse = cleanProse
        .replace(
            preserveDrama3Tags
                ? /<(?!\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b)\/?[a-z0-9_-]+>/gi
                : /<\/?[a-z0-9_-]+>/gi,
            ''
        )
        .replace(/▁|｜/g, '')
        .trim();

    console.log(
        `[Pipeline - Writing Agent] Completed drafting. Produced ${cleanProse.length} chars (~${
            cleanProse.split(/\s+/).filter(Boolean).length
        } words).`
    );

    if (cleanProse && (isAudioDramaMode || isAudioDramaScriptText(cleanProse))) {
        cleanProse = normalizeAudioDramaScript(cleanProse);
    }

    return {
        prose: cleanProse,
        characterStateUpdates,
        sceneExitHook,
        turnsCompleted: currentTurn
    };
}
