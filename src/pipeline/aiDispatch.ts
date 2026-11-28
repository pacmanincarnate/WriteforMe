/**
 * @module pipeline/aiDispatch
 * Centralized AI agent dispatcher handling three-role allocation, thinking budgets,
 * token ceilings, Kobold sampler profiles, prompt-log telemetry, and transient/timeout/budget retries.
 */

import { takeCachePoint } from '@/domain/prompt/cacheLayout';
import {
    API_TIMEOUT_BOUNDS,
    CLOUD_API_URLS,
    DEFAULT_API_TIMEOUT_SEC,
    DEFAULT_SERVICE_URLS,
    DEFAULT_TOKEN_LIMITS,
    LOG_AND_PROMPT_LIMITS,
    RETRY_LIMITS,
    getPipelineStepInfo,
    mapLogNameToStepId
} from '@/config';
import {
    buildKoboldSamplerSettings,
    callGemini,
    callKoboldCPP,
    callAnthropic,
    callNanoGPT,
    callOpenRouter,
    getEffectiveModelConfig,
    getOpenRouterModelLimits,
    invalidateOpenRouterStickyProvider,
    resolveAgentMaxTokens,
    resolveRole,
    resolveThinkingConfigForAgent,
    type LlmCallOptions,
    type LlmSuccessMetadata,
    type LlmThinkingConfig,
    type ProviderModelSettings,
    type ThinkingBudgetSettings,
    ModelStopError,
    isModelStop,
    modelCallsStopped,
    modelStopSignal,
    noteModelUsageFrom,
    sleepUnlessStopped,
    throwIfModelStopped
} from '@/services/llm';
import { beginCloudActivity } from '@/services/vram';
import { CLI_BRIDGE_DEFAULT_URLS, isCliBridgeProvider, isLocalProvider, type CliBridgeProviderId } from '@/types';

export const PROMPT_LOG_CAP = LOG_AND_PROMPT_LIMITS.promptLogCap;

export interface PromptLogErrorRecord {
    attempt: number;
    error: string;
    timestamp: string;
    final?: boolean;
}

export interface PromptLogEntry extends Record<string, unknown> {
    id: number;
    timestamp: string;
    isoTimestamp: string;
    function: string;
    stepId: number | null;
    stepTier: string | null;
    stepTitle: string | null;
    prompt: string;
    systemPrompt: string;
    finalSystemPrompt: string;
    parameters: Record<string, unknown>;
    modelUsed: string;
    modelRole: string;
    modelSize: string;
    provider: string;
    status: 'pending' | 'success' | 'error';
    isError?: boolean;
    attempts: number;
    maxRetries: number;
    pipelineAttempt: number | null;
    pipelineMaxAttempts: number;
    errors: PromptLogErrorRecord[];
    durationSec: string | null;
    durationMs: number | null;
    tokensUsed: number | null;
    promptTokens: number | null;
    cachedTokens: number | null;
    cacheWriteTokens: number | null;
    routedProvider: string | null;
    responseTokens: number | null;
    thinkingTokens: number | null;
    reasoningTokensUsed: number | null;
    reasoningText: string;
    response: string;
    responseSnippet: string;
    validationSummary: string;
    error?: string;
    lastError?: string;
    errorDetails?: string;
    actionTaken?: string;
}

export interface AiDispatchSettings {
    modelSettings: ProviderModelSettings;
    thinkingSettings: ThinkingBudgetSettings;
    apiKey?: string;
    openRouterKey?: string;
    nanoGptKey?: string;
    anthropicKey?: string;
    koboldUrl?: string;
    codexUrl?: string;
    claudeUrl?: string;
    openRouterMaxTokens?: number;
    apiTimeout?: number;
    activeStory?: { id?: string; writing_mode?: string } | null;
}

export interface AiDispatchCallbacks {
    setCurrentPipelineStep?: (stepId: number) => void;
    setPromptLog?: (updater: (prev: PromptLogEntry[]) => PromptLogEntry[]) => void;
    showToast?: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
    logPipelineDelay?: (stageName: string, durationMs: number, reason: string) => void;
    sleepFn?: (ms: number) => Promise<void>;
}

export interface AiDispatchRequest {
    prompt: string;
    systemPrompt?: string;
    isJson?: boolean;
    logName?: string;
    modelRoleOrSize?: string;
}

const defaultSleep = (ms: number): Promise<void> => sleepUnlessStopped(ms);

/** Dispatches a single structured or creative LLM request with telemetry logging and resilient retries. */
export async function dispatchAI(
    request: AiDispatchRequest,
    settings: AiDispatchSettings,
    callbacks: AiDispatchCallbacks = {}
): Promise<unknown> {
    const {
        prompt: rawPrompt,
        systemPrompt = '',
        isJson = true,
        logName = 'AI Task',
        modelRoleOrSize = 'dev'
    } = request;

    // A prompt builder may mark where its repeated start ends; the mark never reaches a model.
    const { prompt, cacheSplitIndex } = takeCachePoint(rawPrompt);

    const win =
        typeof window !== 'undefined'
            ? (window as unknown as {
                  __callAIOverride?: (
                      prompt: string,
                      systemPrompt: string,
                      isJson: boolean,
                      logName: string,
                      modelRoleOrSize: string
                  ) => Promise<unknown>;
              })
            : null;
    if (win && typeof win.__callAIOverride === 'function') {
        return await win.__callAIOverride(prompt, systemPrompt, isJson, logName, modelRoleOrSize);
    }

    const logId = Date.now();
    const startTime = performance.now();
    const activeStepId = mapLogNameToStepId(logName);
    const stepInfo = getPipelineStepInfo(logName, activeStepId);
    if (activeStepId) {
        callbacks.setCurrentPipelineStep?.(activeStepId);
    }

    const activeRole = resolveRole(modelRoleOrSize, logName);
    const effectiveConfig = getEffectiveModelConfig(activeRole, settings.modelSettings);
    const targetProvider = effectiveConfig.provider;
    let currentModelToUse = effectiveConfig.model;

    const thinkingConfig: Required<LlmThinkingConfig> = resolveThinkingConfigForAgent(
        logName,
        settings.thinkingSettings
    );

    const agentMaxTokens = resolveAgentMaxTokens({
        targetProvider,
        currentModel: currentModelToUse,
        logName,
        thinkingConfig,
        openRouterMaxTokens: settings.openRouterMaxTokens
    });

    let finalSystemPrompt = systemPrompt || '';
    if (thinkingConfig && thinkingConfig.enabled) {
        finalSystemPrompt += `\n\n[REASONING CONTEXT DIRECTIVE]: You have an allocated internal reasoning budget (${thinkingConfig.budget || 4096} tokens). Focus internal reasoning strictly on structural logic, narrative constraints, and beat execution. Do not output draft scenes, multiple full iterations, or conversational chatter during reasoning. Conclude your thinking promptly and output your complete, unabridged final response outside of thinking tags well before reaching token limits.`;
    }

    const initialEstimatedPromptTokens = Math.round(
        ((finalSystemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/).length * 1.33
    );

    const logLower = String(logName || '').toLowerCase();
    const isWritingAgent =
        (logName.includes('Writing Agent') &&
            !logName.includes('Review') &&
            !logName.includes('Surgical')) ||
        logName.includes('Prose Generator') ||
        logName.includes('Prose Writer');

    const isCreativeArchitecture =
        !isWritingAgent &&
        Boolean(
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

    const activeStoryForCall = settings.activeStory || null;
    const isAudioDramaMode = Boolean(
        activeStoryForCall?.writing_mode === 'audio_drama' ||
            (typeof finalSystemPrompt === 'string' &&
                finalSystemPrompt.includes('MANDATORY OVERRIDE: AUDIO DRAMA SCRIPT')) ||
            (typeof prompt === 'string' && prompt.includes('ACOUSTIC SCRIPT CADENCE RULE:'))
    );

    const koboldSamplerSettings = buildKoboldSamplerSettings({
        isWritingAgent,
        isCreativeArchitecture,
        isAudioDramaMode
    });

    const apiTimeoutSec = settings.apiTimeout ?? DEFAULT_API_TIMEOUT_SEC;
    const timeoutMs =
        isLocalProvider(targetProvider)
            ? 15 * 60 * 1000
            : apiTimeoutSec * 1000;

    const cliBridgeUrl = (provider: CliBridgeProviderId): string =>
        (provider === 'claude' ? settings.claudeUrl : settings.codexUrl) ||
        CLI_BRIDGE_DEFAULT_URLS[provider];

    const requestParameters: Record<string, unknown> = {
        provider: targetProvider,
        model: currentModelToUse,
        modelRole: activeRole,
        modelSize: modelRoleOrSize,
        isJson,
        maxTokens: agentMaxTokens,
        temperature:
            targetProvider === 'gemini'
                ? 0.8
                : targetProvider === 'openrouter'
                  ? 0.85
                  : targetProvider === 'koboldcpp'
                    ? koboldSamplerSettings.temperature
                    : 0.8,
        ...(targetProvider === 'koboldcpp' ? { sampler: koboldSamplerSettings } : {}),
        timeoutSeconds:
            isLocalProvider(targetProvider) ? 15 * 60 : apiTimeoutSec,
        timeoutMs,
        thinking: {
            enabled: Boolean(thinkingConfig && thinkingConfig.enabled),
            budget: thinkingConfig?.budget || 0,
            effort: thinkingConfig?.effort || 'none',
            level: thinkingConfig?.level || 'MINIMAL'
        },
        endpoint:
            targetProvider === 'gemini'
                ? `${CLOUD_API_URLS.geminiModels}/${currentModelToUse}:generateContent`
                : targetProvider === 'nanogpt'
                  ? CLOUD_API_URLS.nanoGptChat
                  : targetProvider === 'anthropic'
                    ? CLOUD_API_URLS.anthropicMessages
                  : targetProvider === 'openrouter'
                    ? CLOUD_API_URLS.openRouterChat
                    : isCliBridgeProvider(targetProvider)
                      ? `${cliBridgeUrl(targetProvider)}/v1/chat/completions`
                      : `${settings.koboldUrl || DEFAULT_SERVICE_URLS.koboldcpp}/v1/chat/completions`
    };

    const pipelineAttemptMatch = logName ? logName.match(/Attempt\s+(\d+)/i) : null;
    const pipelineMaxAttemptMatch = logName ? logName.match(/Attempt\s+\d+\/(\d+)/i) : null;

    const logEntry: PromptLogEntry = {
        id: logId,
        timestamp: new Date().toLocaleTimeString(),
        isoTimestamp: new Date().toISOString(),
        function: logName,
        stepId: stepInfo?.stepId || activeStepId || null,
        stepTier: stepInfo?.stepTier || null,
        stepTitle: stepInfo?.stepTitle || null,
        prompt,
        systemPrompt,
        finalSystemPrompt,
        parameters: requestParameters,
        modelUsed: currentModelToUse,
        modelRole: activeRole,
        modelSize: modelRoleOrSize,
        provider: targetProvider,
        status: 'pending',
        attempts: 1,
        maxRetries: RETRY_LIMITS.apiMaxRetries,
        pipelineAttempt: pipelineAttemptMatch ? parseInt(pipelineAttemptMatch[1], 10) : null,
        pipelineMaxAttempts: pipelineMaxAttemptMatch
            ? parseInt(pipelineMaxAttemptMatch[1], 10)
            : RETRY_LIMITS.apiMaxRetries,
        errors: [],
        durationSec: null,
        durationMs: null,
        tokensUsed: null,
        promptTokens: initialEstimatedPromptTokens,
        cachedTokens: null,
        cacheWriteTokens: null,
        routedProvider: null,
        responseTokens: null,
        thinkingTokens: null,
        reasoningTokensUsed: null,
        reasoningText: '',
        response: '',
        responseSnippet: '',
        validationSummary: `Dispatched to ${currentModelToUse} [${targetProvider} / ${activeRole}]. Waiting for response...`
    };
    callbacks.setPromptLog?.((prev) => [logEntry, ...prev].slice(0, PROMPT_LOG_CAP));

    const maxRetries = RETRY_LIMITS.apiMaxRetries;
    let attempt = 0;
    let timeoutRetries = 0;

    const storyKeyForCache = String(activeStoryForCall?.id || 'global')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 40);
    const modelKeyForCache = String(currentModelToUse || 'default')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 48);
    const openRouterSessionId = `ep:${storyKeyForCache}:${activeRole}:${modelKeyForCache}`;

    console.log(
        `[AI Call - "${logName}"] Starting request... Model: ${currentModelToUse} | Role: ${activeRole} | Provider: ${targetProvider} | JSON: ${isJson} | MaxTok: ${agentMaxTokens}`
    );

    const options: LlmCallOptions = {
        thinking: { ...thinkingConfig },
        max_tokens: agentMaxTokens,
        isWritingAgent,
        isAudioDrama: isAudioDramaMode,
        writing_mode: isAudioDramaMode ? 'audio_drama' : activeStoryForCall?.writing_mode,
        logName,
        modelRole: activeRole,
        timeout: timeoutMs,
        ...(targetProvider === 'openrouter' ? { sessionId: openRouterSessionId } : {}),
        ...(isCliBridgeProvider(targetProvider) ? { provider: targetProvider } : {}),
        ...(cacheSplitIndex !== null ? { cacheSplitIndex } : {}),
        onSuccess: (metadata: LlmSuccessMetadata) => {
            noteModelUsageFrom(metadata);
            const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
            const durationMs = Math.round(performance.now() - startTime);
            const thinkingToks = metadata.thinkingTokens ?? metadata.reasoningTokensUsed ?? 0;
            const respToks =
                metadata.responseTokens ??
                (metadata.tokensUsed ? Math.max(0, metadata.tokensUsed - thinkingToks) : null);
            const promptToks =
                metadata.promptTokens ??
                (prompt
                    ? Math.round(
                          ((finalSystemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/)
                              .length * 1.33
                      )
                    : initialEstimatedPromptTokens);
            const cachedToks = metadata.cachedTokens ?? null;
            const cacheWriteToks = metadata.cacheWriteTokens ?? null;
            const routedProvider = metadata.routedProvider || null;
            const cacheLogSuffix =
                cachedToks && cachedToks > 0
                    ? ` | Cached: ${cachedToks}${promptToks > 0 ? ` (${Math.min(100, Math.round((cachedToks / promptToks) * 100))}%)` : ''}${routedProvider ? ` | Host: ${routedProvider}` : ''}`
                    : routedProvider
                      ? ` | Host: ${routedProvider}`
                      : '';
            console.log(
                `[AI Call - "${logName}"] SUCCESS in ${durationSec}s | Model: ${metadata.modelUsed} | Sent Tokens: ${promptToks ?? 'unknown'}${cacheLogSuffix} | Thinking Tokens: ${thinkingToks} | Response Tokens: ${respToks || 'unknown'}`
            );
            callbacks.setPromptLog?.((prev) =>
                prev.map((entry) => {
                    if (entry.id !== logId) return entry;
                    return {
                        ...entry,
                        status: 'success',
                        durationSec,
                        durationMs,
                        modelUsed: metadata.modelUsed || currentModelToUse,
                        tokensUsed:
                            metadata.tokensUsed ??
                            (promptToks || 0) + (thinkingToks || 0) + (respToks || 0),
                        promptTokens: promptToks,
                        cachedTokens: cachedToks,
                        cacheWriteTokens: cacheWriteToks,
                        routedProvider,
                        responseTokens: respToks,
                        thinkingTokens: thinkingToks,
                        reasoningTokensUsed: thinkingToks,
                        reasoningText: metadata.reasoningText || entry.reasoningText || '',
                        response: metadata.fullResponse || entry.response || '',
                        finalSystemPrompt,
                        parameters: {
                            ...(entry.parameters || {}),
                            maxTokens: options.max_tokens,
                            thinking: {
                                ...(options.thinking ||
                                    (entry.parameters?.thinking as LlmThinkingConfig) ||
                                    {})
                            }
                        },
                        validationSummary: `Valid response received in ${durationSec}s (${durationMs}ms)`
                    };
                })
            );
        }
    };

    const sleepFn = callbacks.sleepFn ?? defaultSleep;
    const endCloudActivity = targetProvider !== 'koboldcpp' ? beginCloudActivity() : null;

    try {
        while (attempt < maxRetries) {
            const stopSignal = modelStopSignal();
        try {
            throwIfModelStopped();
            let response: unknown;
            if (targetProvider === 'gemini') {
                response = await callGemini(
                    settings.apiKey || '',
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            } else if (targetProvider === 'nanogpt') {
                response = await callNanoGPT(
                    settings.nanoGptKey || '',
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            } else if (targetProvider === 'anthropic') {
                response = await callAnthropic(
                    settings.anthropicKey || '',
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            } else if (isCliBridgeProvider(targetProvider)) {
                response = await callKoboldCPP(
                    cliBridgeUrl(targetProvider),
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            } else if (targetProvider === 'koboldcpp') {
                response = await callKoboldCPP(
                    settings.koboldUrl || DEFAULT_SERVICE_URLS.koboldcpp,
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            } else {
                response = await callOpenRouter(
                    settings.openRouterKey || '',
                    currentModelToUse,
                    prompt,
                    finalSystemPrompt,
                    isJson,
                    options
                );
            }

            const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
            const durationMs = Math.round(performance.now() - startTime);
            const respStr =
                typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            const snippet =
                respStr.length > LOG_AND_PROMPT_LIMITS.responseSnippetChars
                    ? `${respStr.slice(0, LOG_AND_PROMPT_LIMITS.responseSnippetChars)}...`
                    : respStr;
            const estimatedRespTokens = Math.round(respStr.trim().split(/\s+/).length * 1.33);
            const estimatedPromptTokens = Math.round(
                ((finalSystemPrompt || '') + ' ' + (prompt || '')).trim().split(/\s+/).length *
                    1.33
            );

            callbacks.setPromptLog?.((prev) =>
                prev.map((entry) => {
                    if (entry.id !== logId) return entry;
                    const finalPromptTokens =
                        entry.promptTokens !== null && entry.promptTokens !== undefined
                            ? entry.promptTokens
                            : estimatedPromptTokens;
                    const finalRespTokens =
                        entry.responseTokens !== null && entry.responseTokens !== undefined
                            ? entry.responseTokens
                            : estimatedRespTokens;
                    const finalThinkingTokens = entry.thinkingTokens || 0;
                    return {
                        ...entry,
                        status: 'success',
                        durationSec: entry.durationSec || durationSec,
                        durationMs: entry.durationMs || durationMs,
                        response: respStr,
                        responseSnippet: snippet,
                        finalSystemPrompt,
                        promptTokens: finalPromptTokens,
                        responseTokens: finalRespTokens,
                        tokensUsed:
                            entry.tokensUsed ??
                            (finalPromptTokens || 0) +
                                (finalThinkingTokens || 0) +
                                (finalRespTokens || 0),
                        parameters: {
                            ...(entry.parameters || {}),
                            maxTokens: options.max_tokens,
                            thinking: {
                                ...(options.thinking ||
                                    (entry.parameters?.thinking as LlmThinkingConfig) ||
                                    {})
                            }
                        },
                        validationSummary:
                            entry.validationSummary ||
                            `Valid response received (${respStr.length} chars) in ${durationSec}s`
                    };
                })
            );

            return response;
        } catch (error) {
            attempt++;
            // A Stop press is not a failure to retry or to report as one.
            if (isModelStop(error) || stopSignal.aborted || modelCallsStopped()) {
                const stopError = isModelStop(error) ? (error as Error) : new ModelStopError();
                const durationMs = Math.round(performance.now() - startTime);
                callbacks.setPromptLog?.((prev) =>
                    prev.map((entry) =>
                        entry.id === logId
                            ? {
                                  ...entry,
                                  status: 'error',
                                  durationSec: (durationMs / 1000).toFixed(2),
                                  durationMs,
                                  attempts: attempt,
                                  validationSummary: 'Stopped by you before the model finished.',
                                  actionTaken: 'Call cancelled. Nothing from it was kept.'
                              }
                            : entry
                    )
                );
                throw stopError;
            }
            const errObj = error as { name?: string; message?: string; stack?: string } | null;
            const errMsg = String(errObj?.message || error || '');
            console.error(
                `[AI Call - "${logName}"] Error (Attempt ${attempt}/${maxRetries}):`,
                errMsg,
                error
            );

            const isAuthError =
                errMsg.includes('401') ||
                errMsg.includes('Authorization Failed') ||
                errMsg.includes('API Key is missing');
            const isCreditsError =
                errMsg.includes('402') ||
                errMsg.includes('Insufficient Credits') ||
                errMsg.includes('out of credits');
            const isForbiddenError =
                errMsg.includes('403') || errMsg.includes('Access Forbidden');
            const isNotFoundError =
                errMsg.includes('404') ||
                errMsg.includes('Model Not Found') ||
                errMsg.includes('no such model');
            const isFatalBadRequest =
                errMsg.includes('400') &&
                !errMsg.includes('token') &&
                !errMsg.includes('budget') &&
                !errMsg.includes('context');
            const isPermanentError =
                isAuthError ||
                isCreditsError ||
                isForbiddenError ||
                isNotFoundError ||
                isFatalBadRequest;

            const isClientTimeout =
                errObj?.name === 'AbortError' ||
                errMsg.toLowerCase().includes('request timed out after');
            const isThinkingOrLengthCeiling =
                errMsg.includes('exceeded thinking budget') ||
                errMsg.includes('exhausted token budget') ||
                errMsg.includes('completed thinking phase') ||
                errMsg.includes('finish_reason: "length"') ||
                errMsg.includes('was cut off at token limit') ||
                errMsg.includes('token limit') ||
                (errMsg.includes('400') &&
                    (errMsg.includes('max_tokens') || errMsg.includes('budget')));

            const isTransient =
                !isPermanentError &&
                ((isClientTimeout && timeoutRetries < 1) ||
                    isThinkingOrLengthCeiling ||
                    errMsg.includes('500') ||
                    errMsg.includes('502') ||
                    errMsg.includes('503') ||
                    errMsg.includes('504') ||
                    errMsg.includes('Internal Server Error') ||
                    errMsg.includes('Bad Gateway') ||
                    errMsg.includes('Service Unavailable') ||
                    errMsg.includes('Gateway Timeout') ||
                    errMsg.includes('Overloaded') ||
                    errMsg.includes('429') ||
                    errMsg.includes('rate limit') ||
                    errMsg.includes('Rate Limit') ||
                    errMsg.includes('Failed to fetch') ||
                    errMsg.includes('empty response') ||
                    errMsg.includes('Unexpected end') ||
                    errMsg.includes('invalid JSON') ||
                    errMsg.includes('returned no content') ||
                    error instanceof TypeError);

            if (isTransient && attempt < maxRetries) {
                if (isClientTimeout) {
                    timeoutRetries++;
                    if (targetProvider === 'openrouter' && options.sessionId) {
                        invalidateOpenRouterStickyProvider(options.sessionId);
                    }
                    const prevTimeoutMs = options.timeout || timeoutMs;
                    const escalatedTimeoutMs = Math.min(
                        API_TIMEOUT_BOUNDS.max * 1000,
                        Math.max(Math.round(prevTimeoutMs * 1.5), prevTimeoutMs + 60000)
                    );
                    options.timeout = escalatedTimeoutMs;
                    console.warn(
                        `[AI Call - "${logName}"] Client timeout at ${Math.round(prevTimeoutMs / 1000)}s on attempt ${attempt}. Clearing pinned host and retrying with extended ${Math.round(escalatedTimeoutMs / 1000)}s timeout...`
                    );
                }

                if (isThinkingOrLengthCeiling) {
                    console.warn(
                        `[AI Call - "${logName}"] Thinking/token ceiling hit on attempt ${attempt}. Rebalancing budget to prioritize generation headroom for retry...`
                    );
                    const modelLimits =
                        targetProvider === 'openrouter'
                            ? getOpenRouterModelLimits(currentModelToUse)
                            : null;
                    const maxAllowedCeiling = modelLimits
                        ? modelLimits.maxOutputTokens
                        : DEFAULT_TOKEN_LIMITS.fallbackMaxOutputTokens;

                    if (attempt === 1) {
                        options.max_tokens = maxAllowedCeiling;
                        if (options.thinking && options.thinking.enabled) {
                            options.thinking.budget = Math.max(
                                1024,
                                Math.min(options.thinking.budget || 4096, 4096)
                            );
                            options.thinking.effort = 'low';
                        }
                        finalSystemPrompt +=
                            '\n\nCRITICAL RETRY DIRECTIVE: You previously ran out of output tokens during reasoning. Keep internal thinking focused and concise, and ensure you generate the complete unabridged response outside of thinking tags.';
                    } else if (attempt === 2) {
                        options.max_tokens = maxAllowedCeiling;
                        if (options.thinking) {
                            options.thinking = {
                                enabled: false,
                                budget: 0,
                                effort: 'none',
                                level: 'MINIMAL'
                            };
                        }
                        finalSystemPrompt +=
                            '\n\nCRITICAL RETRY DIRECTIVE: Do not deliberate or reason internally. Immediately output the complete final structured response directly.';

                        if (
                            targetProvider === 'openrouter' &&
                            (currentModelToUse.includes('deepseek-r1') ||
                                currentModelToUse.includes('deepseek/deepseek-r1'))
                        ) {
                            console.warn(
                                `[AI Call - "${logName}"] Model ${currentModelToUse} cannot disable reasoning. Failing over to deepseek/deepseek-chat for retry...`
                            );
                            currentModelToUse = 'deepseek/deepseek-chat';
                        }
                    }
                }

                callbacks.setPromptLog?.((prev) =>
                    prev.map((entry) => {
                        if (entry.id !== logId) return entry;
                        return {
                            ...entry,
                            attempts: attempt,
                            finalSystemPrompt,
                            parameters: {
                                ...(entry.parameters || {}),
                                maxTokens: options.max_tokens,
                                timeoutMs: options.timeout,
                                timeoutSeconds: Math.round((options.timeout || 0) / 1000),
                                thinking: {
                                    ...(options.thinking ||
                                        (entry.parameters?.thinking as LlmThinkingConfig) ||
                                        {})
                                }
                            },
                            errors: [
                                ...(entry.errors || []),
                                {
                                    attempt,
                                    error: errMsg,
                                    timestamp: new Date().toLocaleTimeString()
                                }
                            ]
                        };
                    })
                );

                const isRateLimit =
                    errMsg.includes('429') ||
                    errMsg.includes('rate limit') ||
                    errMsg.includes('Too Many Requests');
                const baseMultiplier = isRateLimit ? 7500 : 2500;
                const delayMs = Math.pow(2, attempt) * baseMultiplier + Math.random() * 1500;
                const delaySecs = (delayMs / 1000).toFixed(1);
                console.warn(
                    `[AI Call - "${logName}"] Transient API Issue (${errMsg}). Retrying in ${delaySecs}s... (Attempt ${attempt}/${maxRetries})`
                );
                callbacks.showToast?.(
                    `API issue (${logName}). Retrying in ${delaySecs}s... (${attempt}/${maxRetries})`,
                    'warning'
                );
                callbacks.logPipelineDelay?.(
                    logName,
                    delayMs,
                    `API retry backoff (Attempt ${attempt}/${maxRetries})`
                );
                await sleepFn(delayMs);
            } else {
                const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
                const durationMs = Math.round(performance.now() - startTime);
                const resolvedTimeoutMs = options.timeout || 0;
                const finalMsg = isClientTimeout
                    ? resolvedTimeoutMs > 0
                        ? `API Request timed out after ${Math.round(resolvedTimeoutMs / 1000)}s without response (${logName}, ${attempt} attempt(s)). If this recurs, raise the API Timeout in Settings.`
                        : `Request aborted (${logName}): ${errMsg}`
                    : isPermanentError
                      ? `API Configuration / Account Error (${logName}): ${errMsg}`
                      : `FAILED after ${attempt} attempt(s): ${errMsg}`;
                console.error(`[AI Call - "${logName}"] Final Failure: ${finalMsg}`);
                if (isPermanentError) {
                    callbacks.showToast?.(errMsg, 'error');
                }
                callbacks.setPromptLog?.((prev) =>
                    prev.map((entry) => {
                        if (entry.id !== logId) return entry;
                        return {
                            ...entry,
                            status: 'error',
                            isError: true,
                            durationSec,
                            durationMs,
                            validationSummary: finalMsg,
                            error: finalMsg,
                            lastError: errMsg,
                            errorDetails: String(errObj?.stack || errObj?.message || error || finalMsg),
                            attempts: attempt,
                            actionTaken: isCreditsError
                                ? `OpenRouter credits depleted. Refill credits at ${CLOUD_API_URLS.openRouterCreditsPage} to continue.`
                                : isAuthError
                                  ? 'API key invalid or missing. Update API key in Settings.'
                                  : isNotFoundError
                                    ? 'Model ID invalid or deprecated on provider. Select another model in Settings.'
                                    : 'API request failed after retries. Check API provider settings, credits/quota, and network connection.',
                            finalSystemPrompt,
                            parameters: {
                                ...(entry.parameters || {}),
                                maxTokens: options.max_tokens,
                                timeoutMs: options.timeout,
                                timeoutSeconds: Math.round((options.timeout || 0) / 1000),
                                thinking: {
                                    ...(options.thinking ||
                                        (entry.parameters?.thinking as LlmThinkingConfig) ||
                                        {})
                                }
                            },
                            errors: [
                                ...(entry.errors || []),
                                {
                                    attempt,
                                    error: errMsg,
                                    timestamp: new Date().toLocaleTimeString(),
                                    final: true
                                }
                            ]
                        };
                    })
                );
                if (isClientTimeout) {
                    throw new Error(finalMsg, { cause: error });
                }
                throw error;
            }
        }
    }

    throw new Error(`[AI Call - "${logName}"] Exceeded retry loop unexpectedly.`);
    } finally {
        endCloudActivity?.();
    }
}
