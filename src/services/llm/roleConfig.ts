/**
 * @module services/llm/roleConfig
 * Three-role model allocation (dev / prose / review), KoboldCPP cloud-model sanitization,
 * thinking budget mapping, per-agent token ceilings, and Kobold sampler profiles.
 */

import { isCloudModelName } from './koboldcpp';
import { getKoboldLoadedModelName } from './koboldRuntime';
import { getOpenRouterModelLimits } from './openrouter';
import type { LlmThinkingConfig } from './types';

export type ModelRole = 'dev' | 'prose' | 'review' | string;

export interface ProviderModelSettings {
    apiProvider?: string;
    devProvider?: string;
    devModel?: string;
    reviewProvider?: string;
    reviewModel?: string;
    proseProvider?: string;
    proseModel?: string;
    geminiModel?: string;
    openRouterModel?: string;
    nanoGptModel?: string;
    codexModel?: string;
    koboldModel?: string;
    koboldLoadedModel?: string;
}

export interface EffectiveModelConfig {
    provider: string;
    model: string;
    isFallback: boolean;
}

export interface ThinkingBudgetSettings {
    enableThinkingAct?: boolean;
    enableThinkingScene?: boolean;
    enableThinkingWriting?: boolean;
    thinkingBudgetAct?: number;
    thinkingBudgetStoryArc?: number;
    thinkingBudgetScene?: number;
    thinkingBudgetWriting?: number;
}

export interface KoboldSamplerSettings {
    profile: string;
    temperature: number;
    top_p: number;
    min_p: number;
    sampler_order: number[];
    dry_multiplier: number;
    dry_base: number;
    dry_allowed_length: number;
    dry_range: number;
    dry_sequence_breakers: string[];
    xtc_probability: number;
    xtc_threshold: number;
    adaptive_p: number;
    adaptive_p_decay: number;
}

function getGlobalKoboldLoadedModel(): string {
    return getKoboldLoadedModelName();
}

/** Returns the default model ID for the requested API provider using current settings. */
export function getDefaultModelForProvider(
    prov: string,
    settings: ProviderModelSettings = {}
): string {
    if (prov === 'gemini') return settings.geminiModel || 'gemini-2.0-flash';
    if (prov === 'openrouter') return settings.openRouterModel || 'google/gemini-2.0-flash-001';
    if (prov === 'nanogpt') return settings.nanoGptModel || 'gpt-4o';
    if (prov === 'codex') return settings.codexModel || 'gpt-5.6-luna';
    if (prov === 'koboldcpp') {
        return (
            settings.koboldLoadedModel ||
            getGlobalKoboldLoadedModel() ||
            settings.koboldModel ||
            'koboldcpp'
        );
    }
    return 'gemini-2.0-flash';
}

/** Ensures a local KoboldCPP target never receives a cloud model identifier. */
export function sanitizeLocalKoboldModel(
    candidate: string | undefined,
    settings: ProviderModelSettings = {}
): string {
    if (!candidate || candidate === 'koboldcpp' || isCloudModelName(candidate)) {
        return (
            settings.koboldLoadedModel ||
            getGlobalKoboldLoadedModel() ||
            settings.koboldModel ||
            'koboldcpp'
        );
    }
    return candidate;
}

/** Resolves effective `(provider, model, isFallback)` for `dev`, `prose`, or `review` role. */
export function getEffectiveModelConfig(
    role: ModelRole = 'dev',
    settings: ProviderModelSettings = {}
): EffectiveModelConfig {
    const effectiveDevProvider = settings.devProvider || settings.apiProvider || 'gemini';
    let fallbackDevModel =
        (settings.devModel && settings.devModel.trim()) ||
        getDefaultModelForProvider(effectiveDevProvider, settings);
    if (effectiveDevProvider === 'koboldcpp') {
        fallbackDevModel = sanitizeLocalKoboldModel(fallbackDevModel, settings);
    }

    if (role === 'prose') {
        if (settings.proseProvider) {
            let m =
                settings.proseModel && settings.proseModel.trim()
                    ? settings.proseModel.trim()
                    : getDefaultModelForProvider(settings.proseProvider, settings);
            if (settings.proseProvider === 'koboldcpp') {
                m = sanitizeLocalKoboldModel(m, settings);
            }
            const hasExplicitNonCloudProse = Boolean(
                settings.proseModel &&
                    settings.proseModel.trim() &&
                    (settings.proseProvider === 'koboldcpp'
                        ? !isCloudModelName(settings.proseModel)
                        : true)
            );
            return {
                provider: settings.proseProvider,
                model: m,
                isFallback: !hasExplicitNonCloudProse
            };
        }
        if (settings.proseModel && settings.proseModel.trim()) {
            let m = settings.proseModel.trim();
            if (effectiveDevProvider === 'koboldcpp') {
                m = sanitizeLocalKoboldModel(m, settings);
            }
            return {
                provider: effectiveDevProvider,
                model: m,
                isFallback: false
            };
        }
        return {
            provider: effectiveDevProvider,
            model: fallbackDevModel,
            isFallback: true
        };
    }

    if (role === 'review') {
        if (settings.reviewProvider) {
            let m =
                settings.reviewModel && settings.reviewModel.trim()
                    ? settings.reviewModel.trim()
                    : getDefaultModelForProvider(settings.reviewProvider, settings);
            if (settings.reviewProvider === 'koboldcpp') {
                m = sanitizeLocalKoboldModel(m, settings);
            }
            const hasExplicitNonCloudReview = Boolean(
                settings.reviewModel &&
                    settings.reviewModel.trim() &&
                    (settings.reviewProvider === 'koboldcpp'
                        ? !isCloudModelName(settings.reviewModel)
                        : true)
            );
            return {
                provider: settings.reviewProvider,
                model: m,
                isFallback: !hasExplicitNonCloudReview
            };
        }
        if (settings.reviewModel && settings.reviewModel.trim()) {
            let m = settings.reviewModel.trim();
            if (effectiveDevProvider === 'koboldcpp') {
                m = sanitizeLocalKoboldModel(m, settings);
            }
            return {
                provider: effectiveDevProvider,
                model: m,
                isFallback: false
            };
        }
        return {
            provider: effectiveDevProvider,
            model: fallbackDevModel,
            isFallback: true
        };
    }

    return {
        provider: effectiveDevProvider,
        model: fallbackDevModel,
        isFallback: false
    };
}

/** Maps a requested role or log label to `'dev'`, `'prose'`, or `'review'`. */
export function resolveRole(modelRoleOrSize: string, logName = ''): 'dev' | 'prose' | 'review' {
    const name = (logName || '').toLowerCase();

    if (
        modelRoleOrSize === 'review' ||
        name.includes('review') ||
        name.includes('reviewer') ||
        name.includes('surgical') ||
        name.includes('editor') ||
        name.includes('archivist') ||
        name.includes('ledger') ||
        name.includes('continuity') ||
        name.includes('banned words') ||
        name.includes('audit') ||
        name.includes('auditor') ||
        name.includes('critique') ||
        name.includes('consistency') ||
        name.includes('choreographer') ||
        name.includes('repair')
    ) {
        return 'review';
    }

    if (modelRoleOrSize === 'prose') return 'prose';

    if (
        name.includes('character developer') ||
        name.includes('character interview') ||
        name.includes('tier 0.2')
    ) {
        return 'prose';
    }

    if (
        name.includes('writing agent') ||
        name.includes('prose generator') ||
        name.includes('prose writer') ||
        name.includes('prose') ||
        name.includes('drafting scene') ||
        name.includes('tier 5.3')
    ) {
        return 'prose';
    }

    if (modelRoleOrSize === 'dev') return 'dev';
    return 'dev';
}

/** Maps a numeric reasoning token budget into normalized effort and level settings. */
export function getThinkingConfigFromBudget(budget: number | undefined): Required<LlmThinkingConfig> {
    if (!budget || budget <= 0) {
        return { enabled: false, budget: 0, effort: 'none', level: 'MINIMAL' };
    }
    let effort: string;
    let level: string;
    if (budget <= 2048) {
        effort = 'low';
        level = 'LOW';
    } else if (budget <= 4096) {
        effort = 'medium';
        level = 'MEDIUM';
    } else {
        effort = 'high';
        level = 'HIGH';
    }
    return {
        enabled: true,
        budget,
        effort,
        level
    };
}

/** Resolves agent-specific thinking configuration from user toggle & budget settings. */
export function resolveThinkingConfigForAgent(
    logName: string,
    settings: ThinkingBudgetSettings = {}
): Required<LlmThinkingConfig> {
    const disabled: Required<LlmThinkingConfig> = {
        enabled: false,
        budget: 0,
        effort: 'none',
        level: 'MINIMAL'
    };
    const isReviewOrSurgical =
        logName.includes('Reviewer') ||
        logName.includes('Surgical') ||
        logName.includes('Editor') ||
        logName.includes('Choreographer') ||
        logName.includes('Review');
    if (isReviewOrSurgical) {
        return disabled;
    }
    if (
        logName.includes('Act Agent') ||
        logName.includes('Conceptual') ||
        logName.includes('Character') ||
        logName.includes('Directive')
    ) {
        const budget = settings.thinkingBudgetAct ?? 0;
        return settings.enableThinkingAct !== false && budget > 0
            ? getThinkingConfigFromBudget(budget)
            : disabled;
    }
    if (logName.includes('Story Arc')) {
        const budget = settings.thinkingBudgetStoryArc ?? 0;
        return settings.enableThinkingAct !== false && budget > 0
            ? getThinkingConfigFromBudget(budget)
            : disabled;
    }
    if (
        logName.includes('Scene Agent') ||
        logName.includes('Scene Roster') ||
        logName.includes('Scene Expander') ||
        logName.includes('Sequence Agent') ||
        logName.includes('Pacing')
    ) {
        const budget = settings.thinkingBudgetScene ?? 0;
        return settings.enableThinkingScene !== false && budget > 0
            ? getThinkingConfigFromBudget(budget)
            : disabled;
    }
    if (
        logName.includes('Writing Agent') ||
        logName.includes('Beat Agent') ||
        logName.includes('Prose')
    ) {
        const budget = settings.thinkingBudgetWriting ?? 0;
        return settings.enableThinkingWriting !== false && budget > 0
            ? getThinkingConfigFromBudget(budget)
            : disabled;
    }
    return disabled;
}

/** Computes output token ceiling per pipeline agent role and provider limits. */
export function resolveAgentMaxTokens({
    targetProvider,
    currentModel,
    logName,
    thinkingConfig,
    openRouterMaxTokens
}: {
    targetProvider: string;
    currentModel: string;
    logName: string;
    thinkingConfig?: LlmThinkingConfig | null;
    openRouterMaxTokens?: number;
}): number {
    const isOpenRouter = targetProvider === 'openrouter';
    const isSurgicalOrEditor =
        logName.includes('Surgical') ||
        logName.includes('Editor') ||
        logName.includes('Choreographer');
    const isHeavyAgent =
        logName.includes('Story Arc') ||
        logName.includes('Act Agent') ||
        logName.includes('Scene Agent') ||
        logName.includes('Scene Roster') ||
        logName.includes('Scene Expander') ||
        logName.includes('Sequence Agent') ||
        logName.includes('Writing Agent') ||
        logName.includes('Prose Generator') ||
        logName.includes('Prose') ||
        logName.includes('Conceptual') ||
        logName.includes('Character') ||
        logName.includes('Archivist') ||
        logName.includes('Directive') ||
        logName.includes('Lore Merger');

    if (isOpenRouter) {
        const limits = getOpenRouterModelLimits(currentModel);
        const configuredMax = openRouterMaxTokens || 65536;
        const ceiling = Math.min(configuredMax, limits.maxOutputTokens);
        if (thinkingConfig && thinkingConfig.enabled) {
            return ceiling;
        }
        if (isHeavyAgent) return ceiling;
        if (isSurgicalOrEditor) return Math.min(ceiling, 16384);
        if (logName.includes('Beat Agent')) return Math.min(ceiling, 24576);
        return Math.min(ceiling, 16384);
    }

    if (isSurgicalOrEditor) return 8192;
    if (thinkingConfig && thinkingConfig.enabled) {
        return isHeavyAgent ? 32768 : 16384;
    }
    if (isHeavyAgent) return 32768;
    if (logName.includes('Beat Agent')) return 16384;
    return 8192;
}

/** Builds 3-tier KoboldCPP sampler parameters for prose, architecture, or structured tasks. */
export function buildKoboldSamplerSettings({
    isWritingAgent,
    isCreativeArchitecture,
    isAudioDramaMode
}: {
    isWritingAgent: boolean;
    isCreativeArchitecture: boolean;
    isAudioDramaMode: boolean;
}): KoboldSamplerSettings {
    return {
        profile: isWritingAgent
            ? isAudioDramaMode
                ? 'creative_writing_audio_drama'
                : 'creative_writing'
            : isCreativeArchitecture
              ? 'creative_architecture'
              : 'structured_agents',
        temperature: isWritingAgent ? 0.75 : isCreativeArchitecture ? 0.72 : 0.6,
        top_p: isWritingAgent ? 1.0 : isCreativeArchitecture ? 0.98 : 0.95,
        min_p: isWritingAgent ? 0.05 : isCreativeArchitecture ? 0.06 : 0.08,
        sampler_order: [0, 1, 3, 4, 2, 5],
        dry_multiplier: isWritingAgent
            ? isAudioDramaMode
                ? 0.5
                : 0.8
            : isCreativeArchitecture
              ? 0.6
              : 0.5,
        dry_base: 1.75,
        dry_allowed_length: isWritingAgent
            ? isAudioDramaMode
                ? 3
                : 2
            : isCreativeArchitecture
              ? 2
              : 3,
        dry_range: 2048,
        dry_sequence_breakers: isWritingAgent
            ? isAudioDramaMode
                ? ['\r\n\r\n', '\n\n', '\n', ':', '[', ']', '(', ')', '---', '***', '###']
                : ['\r\n\r\n', '\n\n', '---', '***', '###']
            : isCreativeArchitecture
              ? ['</', '/>', '\n\n', '```']
              : ['\n', ',', ':', '{', '}', '[', ']', '<', '>', '"'],
        xtc_probability: isWritingAgent && !isAudioDramaMode ? 0.5 : 0.0,
        xtc_threshold: 0.1,
        adaptive_p: 0.0,
        adaptive_p_decay: 0.9
    };
}
