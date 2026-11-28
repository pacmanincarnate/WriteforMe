/**
 * @module stores/usePipelineStore
 * Zustand store for autonomous novel generation state, step progress, verbose pipeline logs,
 * Directive Planner state, and Tier 6.0 Editorial Harness execution progress.
 */

import { create } from 'zustand';
import { getPipelineStepInfo } from '@/config';

export const STORE_PROMPT_LOG_CAP = 250;

export interface PipelineLogEntry extends Record<string, unknown> {
    id: number | string;
    timestamp: string;
    isoTimestamp?: string;
    function: string;
    stepId?: number | null;
    stepTier?: string | null;
    stepTitle?: string | null;
    status?: string;
    validationSummary?: string;
    prompt?: string;
    systemPrompt?: string;
}

export interface PipelineLogMeta {
    tierName?: string;
    summary?: string;
    systemPrompt?: string;
    formattedPrompt?: string;
    modelUsed?: string;
    provider?: string;
    attempt?: number;
    maxAttempts?: number;
    actionTaken?: string | null;
    errors?: unknown[];
    errorDetails?: string | null;
    type?: string;
    durationSec?: string | number | null;
    rawOutputSnippet?: string | null;
    [key: string]: unknown;
}

export interface PipelineStoreState {
    loading: boolean;
    loadingStep: string;
    currentPipelineStep: number | null;
    inspectedStepId: number | null;
    generatingSceneKey: string | null;
    pipelineViewMode: string;
    pipelineDisplayMode: string;
    activePipelineWork: Record<string, unknown> | null;
    promptLog: PipelineLogEntry[];
    logFilter: string;
    continuousAutopilot: boolean;
    isPlanningDirective: boolean;
    isExecutingDirective: boolean;
    directivePlan: Record<string, unknown> | null;
    directivePlanHistory: Array<Record<string, unknown>>;
    directiveExecutionLogs: Array<Record<string, unknown>>;
    directiveProgress: number;
    isRunningEditorialHarness: boolean;
    editorialHarnessPhase: string;
    editorialHarnessProgress: number;
}

export interface PipelineStoreActions {
    setLoading: (nextOrUpdater: boolean | ((prev: boolean) => boolean)) => void;
    setLoadingStep: (nextOrUpdater: string | ((prev: string) => string)) => void;
    setCurrentPipelineStep: (
        nextOrUpdater: (number | null) | ((prev: number | null) => number | null)
    ) => void;
    setInspectedStepId: (
        nextOrUpdater: (number | null) | ((prev: number | null) => number | null)
    ) => void;
    setGeneratingSceneKey: (
        nextOrUpdater: (string | null) | ((prev: string | null) => string | null)
    ) => void;
    setPipelineViewMode: (mode: string) => void;
    setPipelineDisplayMode: (mode: string) => void;
    setActivePipelineWork: (work: Record<string, unknown> | null) => void;
    setPromptLog: (
        nextOrUpdater: PipelineLogEntry[] | ((prev: PipelineLogEntry[]) => PipelineLogEntry[])
    ) => void;
    appendPromptLog: (entry: PipelineLogEntry) => void;
    setLogFilter: (filter: string) => void;
    setContinuousAutopilot: (nextOrUpdater: boolean | ((prev: boolean) => boolean)) => void;
    setIsPlanningDirective: (planning: boolean) => void;
    setIsExecutingDirective: (executing: boolean) => void;
    setDirectivePlan: (
        nextOrUpdater:
            | (Record<string, unknown> | null)
            | ((prev: Record<string, unknown> | null) => Record<string, unknown> | null)
    ) => void;
    setDirectivePlanHistory: (
        nextOrUpdater:
            | Array<Record<string, unknown>>
            | ((prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)
    ) => void;
    setDirectiveExecutionLogs: (
        nextOrUpdater:
            | Array<Record<string, unknown>>
            | ((prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)
    ) => void;
    setDirectiveProgress: (progress: number) => void;
    setIsRunningEditorialHarness: (running: boolean) => void;
    setEditorialHarnessPhase: (phase: string) => void;
    setEditorialHarnessProgress: (progress: number) => void;
    logPipelineDelay: (stageName: string, durationMs: number, reason?: string) => void;
    logPipelineValidation: (
        stageName: string,
        isPassed: boolean,
        details: string | string[],
        durationSec?: string | number | null,
        meta?: PipelineLogMeta
    ) => void;
    logPipelineError: (
        stageName: string,
        errorMsg: string,
        errorDetails?: string | null,
        meta?: PipelineLogMeta
    ) => void;
    logAudioDramaPipelineStageStart: (
        stageKey: string,
        stageTitle: string,
        details?: unknown,
        meta?: PipelineLogMeta
    ) => void;
    logAudioDramaPipelineStageComplete: (
        stageKey: string,
        stageTitle: string,
        details?: unknown,
        meta?: PipelineLogMeta
    ) => void;
    logAudioDramaPipelineStageError: (
        stageKey: string,
        stageTitle: string,
        error: unknown,
        details?: unknown,
        meta?: PipelineLogMeta
    ) => void;
}

export type PipelineStore = PipelineStoreState & PipelineStoreActions;

function parseAttemptNumbers(
    stageName: string | undefined,
    meta: PipelineLogMeta
): { pipelineAttempt: number | null; pipelineMaxAttempts: number } {
    const attemptMatch = stageName ? stageName.match(/Attempt\s+(\d+)/i) : null;
    const maxMatch = stageName ? stageName.match(/Attempt\s+\d+\/(\d+)/i) : null;
    return {
        pipelineAttempt:
            meta.attempt ?? (attemptMatch ? parseInt(attemptMatch[1], 10) : null),
        pipelineMaxAttempts:
            meta.maxAttempts ?? (maxMatch ? parseInt(maxMatch[1], 10) : 3)
    };
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
    loading: false,
    loadingStep: '',
    currentPipelineStep: null,
    inspectedStepId: null,
    generatingSceneKey: null,
    pipelineViewMode: 'detailed',
    pipelineDisplayMode: 'stage',
    activePipelineWork: null,
    promptLog: [],
    logFilter: 'all',
    continuousAutopilot: false,
    isPlanningDirective: false,
    isExecutingDirective: false,
    directivePlan: null,
    directivePlanHistory: [],
    directiveExecutionLogs: [],
    directiveProgress: 0,
    isRunningEditorialHarness: false,
    editorialHarnessPhase: '',
    editorialHarnessProgress: 0,

    setLoading: (nextOrUpdater) =>
        set((state) => ({
            loading:
                typeof nextOrUpdater === 'function' ? nextOrUpdater(state.loading) : nextOrUpdater
        })),

    setLoadingStep: (nextOrUpdater) =>
        set((state) => ({
            loadingStep:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.loadingStep)
                    : nextOrUpdater
        })),

    setCurrentPipelineStep: (nextOrUpdater) =>
        set((state) => ({
            currentPipelineStep:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.currentPipelineStep)
                    : nextOrUpdater
        })),

    setInspectedStepId: (nextOrUpdater) =>
        set((state) => ({
            inspectedStepId:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.inspectedStepId)
                    : nextOrUpdater
        })),

    setGeneratingSceneKey: (nextOrUpdater) =>
        set((state) => ({
            generatingSceneKey:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.generatingSceneKey)
                    : nextOrUpdater
        })),

    setPipelineViewMode: (mode) => set({ pipelineViewMode: mode }),
    setPipelineDisplayMode: (mode) => set({ pipelineDisplayMode: mode }),
    setActivePipelineWork: (work) => set({ activePipelineWork: work }),

    setPromptLog: (nextOrUpdater) =>
        set((state) => ({
            promptLog:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.promptLog)
                    : nextOrUpdater
        })),

    appendPromptLog: (entry) =>
        set((state) => ({
            promptLog: [entry, ...state.promptLog].slice(0, STORE_PROMPT_LOG_CAP)
        })),

    setLogFilter: (filter) => set({ logFilter: filter }),

    setContinuousAutopilot: (nextOrUpdater) =>
        set((state) => ({
            continuousAutopilot:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.continuousAutopilot)
                    : nextOrUpdater
        })),

    setIsPlanningDirective: (planning) => set({ isPlanningDirective: planning }),
    setIsExecutingDirective: (executing) => set({ isExecutingDirective: executing }),

    setDirectivePlan: (nextOrUpdater) =>
        set((state) => ({
            directivePlan:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.directivePlan)
                    : nextOrUpdater
        })),

    setDirectivePlanHistory: (nextOrUpdater) =>
        set((state) => ({
            directivePlanHistory:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.directivePlanHistory)
                    : nextOrUpdater
        })),

    setDirectiveExecutionLogs: (nextOrUpdater) =>
        set((state) => ({
            directiveExecutionLogs:
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(state.directiveExecutionLogs)
                    : nextOrUpdater
        })),

    setDirectiveProgress: (progress) => set({ directiveProgress: progress }),
    setIsRunningEditorialHarness: (running) => set({ isRunningEditorialHarness: running }),
    setEditorialHarnessPhase: (phase) => set({ editorialHarnessPhase: phase }),
    setEditorialHarnessProgress: (progress) => set({ editorialHarnessProgress: progress }),

    logPipelineDelay: (stageName, durationMs, reason = 'Cooldown delay') => {
        const logId = Date.now() + Math.random();
        const durationSec = (durationMs / 1000).toFixed(2);
        const stepInfo = getPipelineStepInfo(stageName);
        if (stepInfo?.stepId) {
            get().setCurrentPipelineStep(stepInfo.stepId);
        }
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            function: stageName || 'Pipeline Delay',
            stepId: stepInfo?.stepId || null,
            stepTier: stepInfo?.stepTier || null,
            stepTitle: stepInfo?.stepTitle || null,
            isDelay: true,
            status: 'delay',
            durationSec,
            durationMs: Math.round(durationMs),
            validationSummary: `[Delay Timer] ${reason} (${durationSec}s / ${Math.round(durationMs)}ms)`,
            prompt: `Delay timer paused execution for ${durationSec}s (${Math.round(durationMs)}ms). Reason: ${reason}`,
            systemPrompt: 'SYSTEM TIMER'
        });
    },

    logPipelineValidation: (stageName, isPassed, details, durationSec = null, meta = {}) => {
        const logId = Date.now() + Math.random();
        const detailText = Array.isArray(details) ? details.join('\n') : String(details || '');
        const stepInfo = getPipelineStepInfo(stageName || meta.tierName);
        if (stepInfo?.stepId) {
            get().setCurrentPipelineStep(stepInfo.stepId);
        }
        const attempts = parseAttemptNumbers(stageName, meta);
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            isoTimestamp: new Date().toISOString(),
            function: stageName,
            stepId: stepInfo?.stepId || null,
            stepTier: stepInfo?.stepTier || null,
            stepTitle: stepInfo?.stepTitle || null,
            isValidation: true,
            status: isPassed ? 'success' : 'validation_failed',
            durationSec,
            validationSummary:
                meta.summary ||
                `[Validation Gate] ${isPassed ? 'PASS' : 'FAIL'}: ${detailText.split('\n')[0]}`,
            prompt: detailText,
            systemPrompt: meta.systemPrompt || 'PIPELINE VALIDATION GATE',
            pipelineAttempt: attempts.pipelineAttempt,
            pipelineMaxAttempts: attempts.pipelineMaxAttempts,
            actionTaken: meta.actionTaken || null,
            errors: meta.errors || (isPassed ? [] : Array.isArray(details) ? details : [detailText]),
            errorDetails: meta.errorDetails || (!isPassed ? detailText : null),
            tierName: meta.tierName || null,
            validationType: meta.type || 'validation_gate'
        });
    },

    logPipelineError: (stageName, errorMsg, errorDetails = null, meta = {}) => {
        const logId = Date.now() + Math.random();
        const stepInfo = getPipelineStepInfo(stageName || meta.tierName);
        if (stepInfo?.stepId) {
            get().setCurrentPipelineStep(stepInfo.stepId);
        }
        const attempts = parseAttemptNumbers(stageName, meta);
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            isoTimestamp: new Date().toISOString(),
            function: stageName,
            stepId: stepInfo?.stepId || null,
            stepTier: stepInfo?.stepTier || null,
            stepTitle: stepInfo?.stepTitle || null,
            isError: true,
            status: 'error',
            durationSec: meta.durationSec || null,
            validationSummary: meta.summary || `[Pipeline Failure] ${errorMsg}`,
            prompt: errorDetails ? `${errorMsg}\n\nDetails:\n${errorDetails}` : errorMsg,
            systemPrompt: meta.systemPrompt || 'PIPELINE ERROR / FAILURE',
            error: errorMsg,
            errorDetails,
            pipelineAttempt: attempts.pipelineAttempt,
            pipelineMaxAttempts: attempts.pipelineMaxAttempts,
            actionTaken: meta.actionTaken || null,
            errors: meta.errors || [errorMsg],
            tierName: meta.tierName || null,
            rawOutputSnippet: meta.rawOutputSnippet || null
        });
    },

    logAudioDramaPipelineStageStart: (stageKey, stageTitle, details = null, meta = {}) => {
        const logId = Date.now() + Math.random();
        const detailText =
            typeof details === 'object' && details !== null
                ? JSON.stringify(details, null, 2)
                : String(details || '');
        const formattedPrompt =
            typeof meta.formattedPrompt === 'string' && meta.formattedPrompt.trim()
                ? meta.formattedPrompt
                : `[RUNNING STAGE: ${stageKey}]\n${stageTitle}\n\n${detailText}`;
        get().setCurrentPipelineStep(22);
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            isoTimestamp: new Date().toISOString(),
            function: `[Audio Drama] ${stageTitle}`,
            stepId: 22,
            stepTier: 'Tier 7.0',
            stepTitle: 'Audio Drama Multi-Voice Production',
            stageKey,
            isAudio: true,
            category: 'audio',
            status: 'running',
            isValidation: false,
            validationSummary: stageTitle,
            prompt: formattedPrompt,
            systemPrompt: 'AUDIO DRAMA TTS PIPELINE: ' + String(stageKey).toUpperCase(),
            tierName: 'Tier 7.0: Audio Drama',
            ...(meta.modelUsed ? { modelUsed: meta.modelUsed } : {}),
            ...(meta.provider ? { provider: meta.provider } : {}),
            parameters: (details as Record<string, unknown>) || {},
            meta: meta || {}
        });
    },

    logAudioDramaPipelineStageComplete: (stageKey, stageTitle, details = null, meta = {}) => {
        const logId = Date.now() + Math.random();
        const detailText =
            typeof details === 'object' && details !== null
                ? JSON.stringify(details, null, 2)
                : String(details || '');
        const detailRec =
            typeof details === 'object' && details !== null
                ? (details as Record<string, unknown>)
                : null;
        const durationSec =
            meta.durationSec ||
            detailRec?.durationSec ||
            detailRec?.totalDurationSec ||
            detailRec?.totalExportSec ||
            null;
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            isoTimestamp: new Date().toISOString(),
            function: `[Audio Drama] ${stageTitle}`,
            stepId: 22,
            stepTier: 'Tier 7.0',
            stepTitle: 'Audio Drama Multi-Voice Production',
            stageKey,
            isAudio: true,
            category: 'audio',
            status: 'success',
            durationSec,
            isValidation: false,
            validationSummary: stageTitle,
            prompt: `[COMPLETED STAGE: ${stageKey}]\n${stageTitle}\n\n${detailText}`,
            systemPrompt: 'AUDIO DRAMA TTS PIPELINE: ' + String(stageKey).toUpperCase(),
            tierName: 'Tier 7.0: Audio Drama',
            parameters: (details as Record<string, unknown>) || {},
            meta: meta || {}
        });
    },

    logAudioDramaPipelineStageError: (stageKey, stageTitle, error, details = null, meta = {}) => {
        const logId = Date.now() + Math.random();
        const errorMsg =
            error instanceof Error ? error.message : String(error || 'Unknown TTS Error');
        const detailText =
            typeof details === 'object' && details !== null
                ? JSON.stringify(details, null, 2)
                : String(details || '');
        get().setCurrentPipelineStep(22);
        get().appendPromptLog({
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            isoTimestamp: new Date().toISOString(),
            function: `[Audio Drama ERROR] ${stageTitle}`,
            stepId: 22,
            stepTier: 'Tier 7.0',
            stepTitle: 'Audio Drama Multi-Voice Production',
            stageKey,
            isAudio: true,
            category: 'audio',
            isError: true,
            status: 'error',
            durationSec: meta.durationSec || null,
            validationSummary: `[Audio Drama TTS Error] ${stageTitle}: ${errorMsg}`,
            prompt: `[STAGE FAILED: ${stageKey}]\n${stageTitle}\n\nError: ${errorMsg}\n\nDetails:\n${detailText}`,
            systemPrompt: 'AUDIO DRAMA TTS PIPELINE ERROR',
            error: errorMsg,
            errorDetails: detailText,
            tierName: 'Tier 7.0: Audio Drama',
            parameters: (details as Record<string, unknown>) || {},
            meta: meta || {}
        });
    }
}));
