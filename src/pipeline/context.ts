/**
 * @module pipeline/context
 * Shared strict-TypeScript runtime context contract, typed story aliases,
 * and safe runtime value-coercion helpers for modular AI pipeline orchestrators.
 */

import type {
    CastMember,
    EntityNameAuditReport,
    LoreItem,
    SlopConfig
} from '@/types';
import type { NarrativeModeDefinition } from '@/config';
import type { PipelineLogMeta } from '@/stores';
import type {
    EffectiveModelConfig,
    ProviderModelSettings
} from '@/services/llm';
import type {
    EmbeddingService,
    LoreRetrievalResult,
    VectorStore
} from '@/services/rag';
import type { GraphManager } from '@/domain/lore';
import type {
    ProcessedLoreEntry,
    WorldUpdatesPayload
} from '@/domain/continuity';
import type { DirectivePlan } from '@/domain/story';

export type PipelineStory = Record<string, unknown>;
export type PipelineRecord = Record<string, unknown>;

export type CallAiFn = (
    prompt: string,
    systemPrompt: string,
    isJson?: boolean,
    logName?: string,
    modelRoleOrSize?: string
) => Promise<string>;

export type StoryUpdater =
    | PipelineStory
    | ((prev: PipelineStory) => PipelineStory);

export interface InterventionModalPayload {
    isOpen: boolean;
    tierName: string;
    deviationReasons: string[];
    rawOutput: string;
    onResolve:
        | ((action: 'abort' | 'retry' | 'accept', editedText?: string) => void | Promise<void>)
        | null;
}

export interface PipelineRuntimeContext {
    // Story & Library State
    getStory: () => PipelineStory;
    setStory: (updaterOrValue: StoryUpdater) => PipelineStory;
    getActiveStoryId: () => string;
    updateStoryById: (
        targetStoryId: string,
        updaterOrPatch: StoryUpdater
    ) => Promise<PipelineStory | null>;
    refreshLibrary?: () => Promise<void>;

    // Settings & Configuration Getters
    getModelSettings: () => ProviderModelSettings;
    getEffectiveModelConfig: (role?: string) => EffectiveModelConfig;
    getApiProvider: () => string;
    getEnableReview: () => boolean;
    getEnableNarrativeLenses: () => boolean;
    getEnableStylePolish?: () => boolean;
    getEnableAudioDramaDirectionPass?: () => boolean;
    getSlopConfig: () => SlopConfig;
    getBannedPhrases: () => string[];

    // Feedback & Escalation UI State
    getFeedbackLedger: () => Record<string, string[]>;
    setFeedbackLedger: (
        updater:
            | Record<string, string[]>
            | ((prev: Record<string, string[]>) => Record<string, string[]>)
    ) => void;
    setFailedReviewCritiques: (
        updater: string[] | ((prev: string[]) => string[])
    ) => void;
    setInterventionState: (
        updater:
            | InterventionModalPayload
            | ((prev: InterventionModalPayload) => InterventionModalPayload)
    ) => void;

    // UI Status & Logging Callbacks
    setLoading: (loading: boolean) => void;
    setLoadingStep: (step: string) => void;
    setCurrentPipelineStep?: (stepId: number | null) => void;
    setActivePipelineWork?: (work: PipelineRecord | null) => void;
    setGeneratingSceneKey?: (key: string | null) => void;
    setWorldPrimer: (primer: string | null) => void;
    setRagStatus: (status: string) => void;
    getRagStatus: () => string;
    setIsRebuildingRag: (rebuilding: boolean) => void;
    getIsRebuildingRag: () => boolean;
    setView?: (nextView: string | ((prev: string) => string)) => void;
    setSelectedSequence?: (seqIdx: number | null) => void;
    setSelectedScene?: (sceneIdx: number | null) => void;

    showToast: (
        message: string,
        variant?: 'success' | 'error' | 'info' | 'warning'
    ) => void;
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

    // RAG & Lore Import Refs
    getVectorStore: () => VectorStore | null;
    getGraphManager: () => GraphManager | null;
    getEmbeddingService: () => EmbeddingService | null;
    getRagIndexRevision: () => number;
    bumpRagIndexRevision: () => number;
    getLoreImportVersion: () => number;
    retrieveContext: (
        query: string,
        threshold?: number,
        filterFn?: ((metadata: Record<string, unknown>) => boolean) | null,
        loreList?: LoreItem[] | null
    ) => Promise<LoreRetrievalResult[]>;

    // Core AI Dispatcher
    callAI: CallAiFn;

    // Optional Cross-Layer / Hook Delegates (Populated incrementally across Phase 6)
    applyWorldUpdates?: (
        baseStory: PipelineStory,
        updates: WorldUpdatesPayload,
        processedLore: ProcessedLoreEntry[],
        activeActNum?: number | string,
        activeSceneNum?: number | string
    ) => PipelineStory;
    auditEntityNamesAndPlaces?: (params: {
        characters?: Array<CastMember | string>;
        places?: Array<{ name?: string } | string>;
        existingCast?: Array<CastMember | string>;
        slopConfig?: SlopConfig | null;
        story?: PipelineStory | null;
    }) => EntityNameAuditReport;
    applyCascadingNameReplacements?: (
        text: string,
        renameMap: Record<string, string>
    ) => string;
    extractCandidatePlaceNames?: (
        text: string,
        excludeCast?: Array<CastMember | string> | null
    ) => string[];

    // Phase 6B Setup, Hydration & UI Navigation Hooks
    getSetupDraft?: () => {
        inputConcept?: string;
        inputTitle?: string;
        inputAuthorNote?: string;
        inputWritingMode?: string;
        inputBookType?: string;
        inputCustomWords?: string | number;
        importedLoreText?: string;
    };
    clearSetupDraft?: () => void;
    getPendingSetupLoreMap?: () => Record<string, string>;
    getStorySnapshotsByIdMap?: () => Record<string, PipelineStory>;
    getInitializingStoryIdRef?: () => { current: string | null };
    setInitializingStoryId?: (id: string | null) => void;
    getSkipNextIdbHydrationIdRef?: () => { current: string | null };
    getIsInitialMountRef?: () => { current: boolean };
    getIsLogHydratedRef?: () => { current: boolean };
    getHasHydratedStoryRef?: () => { current: boolean };
    getImportingLore?: () => boolean;
    setActiveStoryId?: (id: string) => void;
    setPromptLog?: (logs: unknown[] | ((prev: unknown[]) => unknown[])) => void;
    setSelectedAct?: (act: number | null) => void;
    setActiveActTab?: (tab: number) => void;
    getSelectedSequence?: () => number | null;
    getSelectedScene?: () => number | null;
    getView?: () => string;
    isAutopilotProtectedView?: (v?: string) => boolean;
    logPipelineDelay?: (stageName: string, durationMs: number, reason?: string) => void;
    getAllNarrativeModes?: () => Record<string, NarrativeModeDefinition>;
    notifyAlert?: (message: string) => void;

    // Phase 6C Prose, Slop Clean & Voice Director Hooks
    getLoading?: () => boolean;
    getIsRunningManualSlopClean?: () => boolean;
    setIsRunningManualSlopClean?: (running: boolean) => void;
    getIsDirectingVoices?: () => boolean;
    setIsDirectingVoices?: (directing: boolean) => void;
    getFailedReviewCritiques?: () => string[];
    getApiCredentials?: () => {
        apiKey?: string;
        openRouterKey?: string;
        nanoGptKey?: string;
        anthropicKey?: string;
        koboldUrl?: string;
        codexUrl?: string;
        claudeUrl?: string;
        openRouterMaxTokens?: number;
    };

    // Phase 6D Directive, Editorial Harness & Autopilot Hooks
    getDirectiveInput?: () => string;
    getDirectivePlan?: () => DirectivePlan | null;
    setDirectivePlan?: (
        updater:
            | DirectivePlan
            | null
            | ((prev: DirectivePlan | null) => DirectivePlan | null)
    ) => void;
    setDirectivePlanHistory?: (
        updater: DirectivePlan[] | ((prev: DirectivePlan[]) => DirectivePlan[])
    ) => void;
    getIsPlanningDirective?: () => boolean;
    setIsPlanningDirective?: (planning: boolean) => void;
    setDirectivePlanPhase?: (phase: string | null) => void;
    getIsExecutingDirective?: () => boolean;
    setIsExecutingDirective?: (executing: boolean) => void;
    setDirectiveProgress?: (progress: number) => void;
    setDirectiveExecutionLogs?: (
        updater:
            | Array<{ id: number; text: string; status: string }>
            | ((
                  prev: Array<{ id: number; text: string; status: string }>
              ) => Array<{ id: number; text: string; status: string }>)
    ) => void;
    setDirectiveUndoSnapshot?: (snapshot: PipelineStory | null) => void;
    setDirectiveRefinement?: (refinement: string) => void;
    setExpandedDirectiveActions?: (expanded: Record<number, boolean>) => void;
    getProtectWrittenProse?: () => boolean;
    getCascadeSceneChanges?: () => boolean;
    getVerifyDirectiveEdits?: () => boolean;
    getEditorialScopeSceneId?: () => string;
    getEditorialUseDeepLLM?: () => boolean;
    getEnableEditorialHarnessAutopilot?: () => boolean;
    setIsRunningEditorialHarness?: (running: boolean) => void;
    setEditorialHarnessPhase?: (phase: string) => void;
    setEditorialHarnessProgress?: (progress: number) => void;
    getContinuousAutopilot?: () => boolean;
    setContinuousAutopilot?: (running: boolean) => void;
    getContinuousAutopilotRef?: () => { current: boolean };
    toggleContinuousAutopilot?: () => void;
    getPrefetchCacheRef?: () => { current: Map<string, Promise<PipelineStory | null>> };
    requestConfirm?: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        danger?: boolean;
        warning?: boolean;
        onConfirm?: () => void | Promise<void>;
        onCancel?: () => void;
    }) => void | Promise<unknown>;
}

export function asRecord(val: unknown): PipelineRecord {
    return val && typeof val === 'object' && !Array.isArray(val)
        ? (val as PipelineRecord)
        : {};
}

export function asOptionalRecord(val: unknown): PipelineRecord | null {
    return val && typeof val === 'object' && !Array.isArray(val)
        ? (val as PipelineRecord)
        : null;
}

export function asArray<T = unknown>(val: unknown): T[] {
    return Array.isArray(val) ? (val as T[]) : [];
}

export function asString(val: unknown, fallback = ''): string {
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return fallback;
}

export function asNumber(val: unknown, fallback = 0): number {
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string') {
        const parsed = Number(val);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
}

export function asStringArray(val: unknown): string[] {
    if (Array.isArray(val)) {
        return val
            .map((item) => (typeof item === 'string' ? item.trim() : asString(item).trim()))
            .filter(Boolean);
    }
    if (typeof val === 'string') {
        return val
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}

export function extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}
