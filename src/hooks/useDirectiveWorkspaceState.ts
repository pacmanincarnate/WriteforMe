/**
 * @module hooks/useDirectiveWorkspaceState
 * State of the Directive Agent workspace: the instruction being typed, the current plan and its
 * history, planning / execution progress, and the two persisted options (cascade scene changes,
 * verify edits). State only; the planner and executor live in `@/pipeline`, the plan edit
 * handlers in `useDirectivePlanEditors`. Extracted from the legacy shell in Phase 7.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DirectivePlan } from '@/domain/story';
import { usePersistedBoolean } from './usePersistedBoolean';

export const DIRECTIVE_CASCADE_STORAGE_KEY = 'ellipsisprose_directive_cascade';
export const DIRECTIVE_VERIFY_STORAGE_KEY = 'ellipsisprose_directive_verify';

type Setter<T> = Dispatch<SetStateAction<T>>;

/** One line of the directive run log shown while a plan executes. */
export interface DirectiveExecutionLogEntry {
    id: number;
    text: string;
    status: string;
}

export interface UseDirectiveWorkspaceStateResult {
    directiveInput: string;
    setDirectiveInput: Setter<string>;
    directivePlan: DirectivePlan | null;
    setDirectivePlan: Setter<DirectivePlan | null>;
    isPlanningDirective: boolean;
    setIsPlanningDirective: Setter<boolean>;
    directivePlanPhase: string | null;
    setDirectivePlanPhase: Setter<string | null>;
    /** Story snapshot taken before a plan is executed, for Undo. */
    directiveUndoSnapshot: unknown;
    setDirectiveUndoSnapshot: Setter<unknown>;
    isExecutingDirective: boolean;
    setIsExecutingDirective: Setter<boolean>;
    directiveExecutionLogs: DirectiveExecutionLogEntry[];
    setDirectiveExecutionLogs: Setter<DirectiveExecutionLogEntry[]>;
    directiveProgress: number;
    setDirectiveProgress: Setter<number>;
    protectWrittenProse: boolean;
    setProtectWrittenProse: Setter<boolean>;
    /** Persisted; on unless the user turned it off. */
    cascadeSceneChanges: boolean;
    setCascadeSceneChanges: Setter<boolean>;
    /** Persisted; on unless the user turned it off. */
    verifyDirectiveEdits: boolean;
    setVerifyDirectiveEdits: Setter<boolean>;
    directiveRefinement: string;
    setDirectiveRefinement: Setter<string>;
    directivePlanHistory: DirectivePlan[];
    setDirectivePlanHistory: Setter<DirectivePlan[]>;
    expandedDirectiveActions: Record<string, boolean>;
    setExpandedDirectiveActions: Setter<Record<string, boolean>>;
}

export function useDirectiveWorkspaceState(): UseDirectiveWorkspaceStateResult {
    const [directiveInput, setDirectiveInput] = useState('');
    const [directivePlan, setDirectivePlan] = useState<DirectivePlan | null>(null);
    const [isPlanningDirective, setIsPlanningDirective] = useState(false);
    const [directivePlanPhase, setDirectivePlanPhase] = useState<string | null>(null);
    const [directiveUndoSnapshot, setDirectiveUndoSnapshot] = useState<unknown>(null);
    const [isExecutingDirective, setIsExecutingDirective] = useState(false);
    const [directiveExecutionLogs, setDirectiveExecutionLogs] = useState<DirectiveExecutionLogEntry[]>([]);
    const [directiveProgress, setDirectiveProgress] = useState(0);
    const [protectWrittenProse, setProtectWrittenProse] = useState(true);
    const [cascadeSceneChanges, setCascadeSceneChanges] = usePersistedBoolean(
        DIRECTIVE_CASCADE_STORAGE_KEY,
        true,
        'directive cascade'
    );
    const [verifyDirectiveEdits, setVerifyDirectiveEdits] = usePersistedBoolean(
        DIRECTIVE_VERIFY_STORAGE_KEY,
        true,
        'directive verification'
    );
    const [directiveRefinement, setDirectiveRefinement] = useState('');
    const [directivePlanHistory, setDirectivePlanHistory] = useState<DirectivePlan[]>([]);
    const [expandedDirectiveActions, setExpandedDirectiveActions] = useState<Record<string, boolean>>({});

    return {
        directiveInput,
        setDirectiveInput,
        directivePlan,
        setDirectivePlan,
        isPlanningDirective,
        setIsPlanningDirective,
        directivePlanPhase,
        setDirectivePlanPhase,
        directiveUndoSnapshot,
        setDirectiveUndoSnapshot,
        isExecutingDirective,
        setIsExecutingDirective,
        directiveExecutionLogs,
        setDirectiveExecutionLogs,
        directiveProgress,
        setDirectiveProgress,
        protectWrittenProse,
        setProtectWrittenProse,
        cascadeSceneChanges,
        setCascadeSceneChanges,
        verifyDirectiveEdits,
        setVerifyDirectiveEdits,
        directiveRefinement,
        setDirectiveRefinement,
        directivePlanHistory,
        setDirectivePlanHistory,
        expandedDirectiveActions,
        setExpandedDirectiveActions
    };
}
