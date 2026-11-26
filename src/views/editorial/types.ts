/**
 * @module views/editorial/types
 * Shared TypeScript interfaces for the Autonomous Editorial Harness view (`view === 'editorial'`).
 */

import type React from 'react';
import type { SlopConfig } from '@/types';

export interface EditorialSceneEntry {
    sceneId: string;
    seqIdx: number;
    sceneIdx: number;
    title: string;
    normalized: {
        wordCount: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface EditorialSlopViolationItem {
    severity?: string;
    category?: string;
    categoryLabel?: string;
    term?: string;
    phrase?: string;
    [key: string]: unknown;
}

export interface EditorialSceneTelemetry {
    sentenceLengthCV: number;
    meanPsychicDistance: number;
    filterWordDensityPer1k: number;
    lexicalEchoes?: unknown[];
    whiteRoomSpans?: unknown[];
    closerViolations?: unknown[];
    hardSlopViolations?: unknown[];
    flagSlopViolations?: unknown[];
    rhetoricalViolations?: unknown[];
    slopViolations?: EditorialSlopViolationItem[];
    [key: string]: unknown;
}

export interface EditorialLayer0Score {
    dTotal?: number;
    axisScores?: {
        d1_causal?: number | string;
        d2_subtext?: number | string;
        d3_value_shift?: number | string;
        d4_epistemic?: number | string;
        d5_pacing?: number | string;
        [key: string]: unknown;
    };
    takeawaySummary?: string;
    [key: string]: unknown;
}

export interface EditorialTribunalCase {
    dossierId?: string;
    priorityScore?: number;
    verdict?: string;
    prosecutorArgument?: string;
    defenseArgument?: string;
    judicialRationale?: string;
    rubricScores?: {
        E?: number | string;
        I?: number | string;
        D?: number | string;
        C?: number | string;
        R?: number | string;
        [key: string]: unknown;
    };
    ticket?: {
        sceneId?: string;
        category?: string;
        wave?: string;
        startAnchor?: string;
        surgicalDirective?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface EditorialGateResult {
    gate: string;
    passed: boolean;
    details?: string;
}

export interface EditorialAttemptHistoryItem {
    attempt: number;
    failedGates?: string[];
    feedback?: {
        diagnostic?: string;
        correction?: string;
    };
    proposedSpan?: string;
}

export interface EditorialTransactionItem {
    transactionId: string;
    sceneId?: string;
    startAnchor?: string;
    endAnchor?: string;
    priorityScore?: number | string;
    status?: string;
    attempts_used?: number;
    beforeProse?: string;
    beforeSpan?: string;
    afterSpan?: string;
    combinedDirective?: string;
    gateResults?: EditorialGateResult[];
    attemptHistory?: EditorialAttemptHistoryItem[];
    /** Why the edit did not commit (text changed, conflict, failed gates). */
    skipReason?: string;
    [key: string]: unknown;
}

export interface EditorialWaveItem {
    waveId: string;
    name: string;
    specialistAgent?: string;
    transactions?: EditorialTransactionItem[];
}

export interface EditorialHarnessLogEntry {
    id: string | number;
    timestamp: string;
    phase: string;
    status?: string;
    message: string;
}

export interface EditorialStory {
    acts?: Array<Record<string, unknown>>;
    sequences?: Array<{ number?: number; [key: string]: unknown }>;
    cast?: unknown[];
    lore?: unknown[];
    editorial_harness?: {
        lastRunAt?: number;
        preRunProseSnapshot?: unknown;
        customConstitutionOverrides?: unknown;
        novelignore?: unknown;
        constitution?: {
            intentionalOverrides?: unknown;
            genreAndSubgenre?: {
                primary?: string;
                audienceExpectationTier?: string;
            };
            genreContract?: {
                primaryGenre?: string;
            };
            narrativePOVContract?: {
                globalType?: string;
                psychicDistanceRange?: { min?: number; max?: number };
            };
            authorialDirectives?: {
                persona?: string;
                strictAntiPatterns?: string;
            };
            [key: string]: unknown;
        };
        fullTelemetry?: {
            sceneTelemetryMap?: Record<string, EditorialSceneTelemetry>;
            [key: string]: unknown;
        };
        voiceDna?: {
            syntacticCadence?: {
                meanWords?: number | string;
                stdDevWords?: number | string;
                coeffOfVariation?: number | string;
                hypotaxisRatio?: number | string;
            };
            perceptualProfile?: {
                baselinePsychicDistance?: number | string;
                filterVerbRate?: number | string;
                dialogueRatio?: number;
            };
            signatureLexicon?: Array<string | { lemma?: string; count?: number }>;
            exemplars?: Array<{
                source_anchor?: string;
                mode?: string;
                stylisticNotes?: string;
                verbatimText?: string;
            }>;
            [key: string]: unknown;
        };
        nsg?: {
            threadsLedger?: unknown[];
            totalWords?: number;
            [key: string]: unknown;
        };
        layer0Map?: Record<string, EditorialLayer0Score>;
        tribunalResult?: {
            tribunalCases?: EditorialTribunalCase[];
            deliberations?: EditorialTribunalCase[];
            verifiedTickets?: unknown[];
            [key: string]: unknown;
        };
        editPlan?: {
            allTransactions?: unknown[];
            total_transactions?: number;
            waves?: EditorialWaveItem[];
            [key: string]: unknown;
        };
        summary?: {
            meanDivergence?: number | string;
            dismissedTicketsCount?: number;
            committedTransactions?: number;
            verifiedTicketsCount?: number;
            [key: string]: unknown;
        };
        logs?: EditorialHarnessLogEntry[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface EditorialToolArgsState {
    scene_id: string;
    query?: string;
    pattern?: string;
    character_id?: string;
    topic_or_entity_id?: string;
    thread_id?: string;
    [key: string]: unknown;
}

export interface NovelIgnoreDraftRuleState {
    rule_type: string;
    pattern: string;
    [key: string]: unknown;
}

export interface EditorialViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: EditorialStory;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    bannedPhrases: string[];
    slopConfig: SlopConfig;
    editorialHarnessTab: string;
    setEditorialHarnessTab: (tab: string) => void;
    editorialScopeSceneId: string;
    setEditorialScopeSceneId: (sceneId: string) => void;
    editorialUseDeepLLM: boolean;
    setEditorialUseDeepLLM: (useDeep: boolean) => void;
    enableEditorialHarnessAutopilot: boolean;
    setEnableEditorialHarnessAutopilot: (enabled: boolean) => void;
    isRunningEditorialHarness: boolean;
    editorialHarnessPhase: string;
    editorialHarnessProgress: number;
    runAutonomousEditorialHarness: (opts: {
        mode: string;
        scopeSceneId: string;
        useLLM?: boolean;
    }) => void | Promise<void>;
    revertAllHarnessTransactions: () => void | Promise<void>;
    executeSingleHarnessTransaction: (transactionId: string) => void | Promise<void>;
    revertHarnessTransaction: (transactionId: string) => void | Promise<void>;
    novelIgnoreDraftRule: NovelIgnoreDraftRuleState;
    setNovelIgnoreDraftRule: React.Dispatch<React.SetStateAction<NovelIgnoreDraftRuleState>>;
    handleAddNovelIgnoreRule: () => void;
    handleRemoveNovelIgnoreRule: (index: number) => void;
    editorialToolName: string;
    setEditorialToolName: (toolName: string) => void;
    editorialToolArgs: EditorialToolArgsState;
    setEditorialToolArgs: React.Dispatch<React.SetStateAction<EditorialToolArgsState>>;
    editorialToolOutput: unknown;
    handleRunHarnessInspectorTool: () => void | Promise<void>;
}
