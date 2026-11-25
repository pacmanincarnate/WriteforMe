/**
 * @module views/directive/types
 * Shared TypeScript interfaces for the Editorial Directive Desk (`view === 'directive'`).
 */

import type React from 'react';

export interface DirectiveLineEditItem {
    find?: string;
    replace?: string;
    [key: string]: unknown;
}

export interface DirectiveAppliedEditItem {
    before: string;
    after: string;
    undone?: boolean;
    showFull?: boolean;
    [key: string]: unknown;
}

export interface DirectiveConsistencyIssue {
    severity?: string;
    category?: string;
    description?: string;
    location?: string;
    fix_suggestion?: string;
    [key: string]: unknown;
}

export interface DirectiveActionResult {
    status?: string;
    message?: string;
    proseSceneId?: string;
    reviewFixAttempted?: boolean;
    appliedEdits?: DirectiveAppliedEditItem[];
    cascade?: {
        status?: string;
        message?: string;
        appliedEdits?: DirectiveAppliedEditItem[];
        [key: string]: unknown;
    };
    review?: {
        status?: string;
        error?: unknown;
        issues: DirectiveConsistencyIssue[];
    };
    [key: string]: unknown;
}

export interface DirectiveActionItem {
    action_type: string;
    description?: string;
    skipped?: boolean;
    allow_protected?: boolean;
    allow_large_change?: boolean;
    target_act_idx?: number | string | null;
    target_seq_idx?: number | null;
    target_scene_idx?: number | null;
    target_character_id?: string;
    details: Record<string, unknown> & {
        line_edits?: DirectiveLineEditItem[];
    };
    result?: DirectiveActionResult;
    [key: string]: unknown;
}

export interface DirectivePlanState {
    evaluation?: string;
    scope_kind?: string;
    consistency_notes?: string;
    consistencyReview?: {
        status?: string;
        issues: DirectiveConsistencyIssue[];
    };
    actions: DirectiveActionItem[];
    [key: string]: unknown;
}

export interface DirectiveExecutionLogItem {
    id: number | string;
    text: string;
    status?: string;
    [key: string]: unknown;
}

export interface DirectiveStory {
    id?: string;
    title?: string;
    acts?: Array<{ number?: number | string; title?: string; [key: string]: unknown }>;
    sequences?: Array<{
        number?: number;
        title?: string;
        parent_act?: number | string | null;
        [key: string]: unknown;
    }>;
    scenes?: Record<
        string,
        Array<{ number?: number | string; title?: string; [key: string]: unknown }>
    >;
    prose?: Record<string, { final?: string; [key: string]: unknown } | null | undefined>;
    cast?: Array<{ id?: string; name: string; [key: string]: unknown }>;
    threads?: Array<{ id: string; name: string; [key: string]: unknown }>;
    lore?: Array<{ topic: string; [key: string]: unknown }>;
    secret_vault?: Array<{ id: string; title: string; [key: string]: unknown }>;
    [key: string]: unknown;
}

export interface DirectiveViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: DirectiveStory;
    setStory: (
        updaterOrValue: DirectiveStory | ((prev: DirectiveStory) => DirectiveStory)
    ) => void;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    allNarrativeModes: Record<string, unknown>;
    directiveInput: string;
    setDirectiveInput: (input: string) => void;
    protectWrittenProse: boolean;
    setProtectWrittenProse: (protect: boolean) => void;
    cascadeSceneChanges: boolean;
    setCascadeSceneChanges: (cascade: boolean) => void;
    verifyDirectiveEdits: boolean;
    setVerifyDirectiveEdits: (verify: boolean) => void;
    isPlanningDirective: boolean;
    isExecutingDirective: boolean;
    directivePlanPhase: string;
    directivePlan: DirectivePlanState | null;
    setDirectivePlan: React.Dispatch<React.SetStateAction<DirectivePlanState | null>>;
    directivePlanHistory: DirectivePlanState[];
    setDirectivePlanHistory: React.Dispatch<React.SetStateAction<DirectivePlanState[]>>;
    directiveRefinement: string;
    setDirectiveRefinement: (refinement: string) => void;
    expandedDirectiveActions: Record<number, boolean>;
    setExpandedDirectiveActions: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
    directiveExecutionLogs: DirectiveExecutionLogItem[];
    setDirectiveExecutionLogs: React.Dispatch<React.SetStateAction<DirectiveExecutionLogItem[]>>;
    directiveProgress: number;
    directiveUndoSnapshot: DirectiveStory | null;
    setDirectiveUndoSnapshot: (snapshot: DirectiveStory | null) => void;
    runDirectivePlanner: (refinementRequest?: string) => void | Promise<void>;
    restorePreviousDirectivePlan: () => void;
    executeDirectivePlan: (actions: DirectiveActionItem[]) => void | Promise<void>;
    handleAddManualDirectiveAction: () => void;
    handleToggleDirectiveActionSkip: (actIdx: number) => void;
    handleRemoveDirectiveAction: (actIdx: number) => void;
    handleUpdateActionField: (actIdx: number, field: string, value: unknown) => void;
    handleUpdateActionDetail: (actIdx: number, field: string, value: unknown) => void;
    handleUpdateAppliedEdit: (
        actIdx: number,
        editIdx: number,
        patch: Record<string, unknown>,
        isCascade?: boolean
    ) => void;
    handleUndoSurgicalEdit: (actIdx: number, editIdx: number, isCascade?: boolean) => void;
    handleFixDirectiveReview: (actIdx: number) => void | Promise<void>;
    showToast: (msg: string, type?: string) => void;
}
