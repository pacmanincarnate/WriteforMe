/**
 * @module domain/editing/directivePlanEditing
 * Manual edits to a Directive Agent plan (the review list the user can tweak before and after
 * execution): field and detail edits, skip, remove, add a manual action, and undo of an applied
 * surgical edit. All functions are pure and return the input unchanged when nothing applies.
 */

import {
    computeDirectiveStoryStats,
    parseActNumber,
    type DirectiveActionItem,
    type DirectivePlan
} from '@/domain/story';
import type { Story } from '@/types';
import { locateNeedle, type AppliedSurgicalEdit } from './surgicalEdits';

type PlanStory = Partial<Story> & Record<string, unknown>;

/** An applied edit as shown in the plan; `undone` is set once the user reverts it. */
export type PlanAppliedEdit = AppliedSurgicalEdit & { undone?: boolean };

interface PlanActionResult extends Record<string, unknown> {
    proseSceneId?: string;
    appliedEdits?: PlanAppliedEdit[];
    review?: unknown;
    cascade?: { appliedEdits?: PlanAppliedEdit[]; [key: string]: unknown };
}

const SEQUENCE_INDEX_FIELDS = ['target_seq_idx', 'target_sequence_idx'];

const resultOf = (action: DirectiveActionItem | undefined): PlanActionResult | undefined =>
    action?.result as PlanActionResult | undefined;

function mapAction<P extends DirectivePlan>(
    plan: P,
    actionIdx: number,
    fn: (action: DirectiveActionItem) => DirectiveActionItem
): P {
    if (!plan.actions[actionIdx]) return { ...plan, actions: [...plan.actions] };
    return { ...plan, actions: plan.actions.map((action, idx) => (idx === actionIdx ? fn(action) : action)) };
}

/** Sets a top-level field on one action. The two sequence-index aliases are kept in sync. */
export function updateDirectiveActionField<P extends DirectivePlan | null>(
    plan: P,
    actionIdx: number,
    field: string,
    value: unknown
): P {
    if (!plan) return plan;
    return mapAction(plan, actionIdx, (action) => ({
        ...action,
        [field]: value,
        ...(SEQUENCE_INDEX_FIELDS.includes(field)
            ? { target_seq_idx: value as number, target_sequence_idx: value as number }
            : {})
    })) as P;
}

/** Sets one key inside an action's `details`. */
export function updateDirectiveActionDetail<P extends DirectivePlan | null>(
    plan: P,
    actionIdx: number,
    detailField: string,
    value: unknown
): P {
    if (!plan) return plan;
    return mapAction(plan, actionIdx, (action) => ({
        ...action,
        details: { ...(action.details || {}), [detailField]: value }
    })) as P;
}

/** Merges `updates` into one applied edit of an executed action (or of its cascade). */
export function updateDirectiveAppliedEdit<P extends DirectivePlan | null>(
    plan: P,
    actionIdx: number,
    editIdx: number,
    updates: Partial<PlanAppliedEdit>,
    isCascade = false
): P {
    if (!plan) return plan;
    const patch = (edits: PlanAppliedEdit[]): PlanAppliedEdit[] =>
        edits.map((edit, idx) => (idx === editIdx ? { ...edit, ...updates } : edit));
    return {
        ...plan,
        actions: plan.actions.map((action, idx) => {
            const result = resultOf(action);
            if (idx !== actionIdx || !result) return action;
            if (isCascade) {
                if (!result.cascade?.appliedEdits) return action;
                return {
                    ...action,
                    result: { ...result, cascade: { ...result.cascade, appliedEdits: patch(result.cascade.appliedEdits) } }
                };
            }
            if (!result.appliedEdits) return action;
            return { ...action, result: { ...result, appliedEdits: patch(result.appliedEdits) } };
        })
    };
}

export function toggleDirectiveActionSkip<P extends DirectivePlan | null>(plan: P, actionIdx: number): P {
    if (!plan) return plan;
    return {
        ...plan,
        actions: plan.actions.map((action, idx) =>
            idx === actionIdx ? { ...action, skipped: !action.skipped } : action
        )
    };
}

export function removeDirectiveAction<P extends DirectivePlan | null>(plan: P, actionIdx: number): P {
    if (!plan) return plan;
    return { ...plan, actions: plan.actions.filter((_, idx) => idx !== actionIdx) };
}

/** Re-keys the "expanded" map after an action was removed, so later rows keep their state. */
export function shiftExpandedAfterRemoval(
    expanded: Record<string, boolean> | null | undefined,
    removedIdx: number
): Record<number, boolean> {
    const next: Record<number, boolean> = {};
    Object.entries(expanded || {}).forEach(([key, value]) => {
        const n = parseInt(key, 10);
        if (n < removedIdx && value) next[n] = true;
        else if (n > removedIdx && value) next[n - 1] = true;
    });
    return next;
}

/**
 * The starter action for "Add manual action", chosen from how far the story is: a future mandate
 * for the first sequence without scenes, else a new scene, else (no outline yet) an Author's Note
 * edit.
 */
export function buildManualDirectiveAction(story: PlanStory): Record<string, unknown> {
    const stats = computeDirectiveStoryStats(story);
    if (stats.firstUnwrittenSeq) {
        const seqIdx = stats.firstUnwrittenSeq.seqIdx;
        return {
            action_type: 'PERSIST_FUTURE_MANDATE',
            target_act_idx: Math.max(0, parseActNumber(story.sequences?.[seqIdx]?.parent_act, 1) - 1),
            target_seq_idx: seqIdx,
            target_sequence_idx: seqIdx,
            target_scene_idx: 0,
            description: `Guide future scenes in Sequence ${stats.firstUnwrittenSeq.number}`,
            details: { target_scope: 'sequence', mandate_label: 'Direction', mandate_text: '' }
        };
    }
    if (stats.hasOutline) {
        return {
            action_type: 'ADD_SCENE',
            target_act_idx: 0,
            target_seq_idx: 0,
            target_sequence_idx: 0,
            target_scene_idx: 0,
            description: 'Add new scene blueprint to Sequence 1',
            details: {
                title: '',
                scene_type: 'PROACTIVE',
                pov_character: stats.firstCastName || '',
                objective: '',
                scene_events: ''
            }
        };
    }
    return {
        action_type: 'MODIFY_STORY_METADATA',
        target_act_idx: 0,
        target_seq_idx: 0,
        target_sequence_idx: 0,
        target_scene_idx: 0,
        description: "Update global Author's Note",
        details: { author_note: story.author_note || '' }
    };
}

/** Appends an action, starting a manual plan when there is none. */
export function appendDirectiveAction(
    plan: DirectivePlan | null,
    action: Record<string, unknown>
): DirectivePlan {
    const base: DirectivePlan = plan || {
        evaluation: 'Custom manual directive plan.',
        scope_kind: 'local',
        consistency_notes: '',
        actions: []
    };
    return { ...base, actions: [...base.actions, action as unknown as DirectiveActionItem] };
}

export interface SurgicalEditUndo {
    /** Prose key (`seq-scene`) the action wrote to when it ran. */
    sceneId: string;
    /** The scene's final prose with the edit reverted. */
    restoredProse: string;
}

/**
 * Works out how to revert one applied edit: finds the edit's "after" text in the scene's current
 * prose and swaps the "before" text back in. Null when the edit is missing, already undone, has
 * no recorded scene, or its text can no longer be found.
 */
export function planSurgicalEditUndo(
    plan: DirectivePlan | null | undefined,
    story: PlanStory,
    actionIdx: number,
    editIdx: number,
    isCascade = false
): SurgicalEditUndo | null {
    const result = resultOf(plan?.actions[actionIdx]);
    const edit = (isCascade ? result?.cascade : result)?.appliedEdits?.[editIdx];
    if (!result || !edit || edit.undone) return null;
    // The scene used at execution, even if the action's target controls were edited later.
    const sceneId = result.proseSceneId;
    if (!sceneId) return null;
    const proseMap = (story.prose || {}) as Record<string, { final?: string } | undefined>;
    const currentProse = proseMap[sceneId]?.final || '';
    const match = locateNeedle(currentProse, edit.after);
    if (!match) return null;
    return {
        sceneId,
        restoredProse: currentProse.slice(0, match.start) + edit.before + currentProse.slice(match.end)
    };
}

/** Writes reverted prose into the story; a reverted cascade edit marks the scene's prose stale. */
export function applySurgicalEditUndo<T extends PlanStory>(
    story: T,
    undo: SurgicalEditUndo,
    isCascade = false,
    now: () => number = Date.now
): T {
    const proseMap = (story.prose || {}) as Record<string, Record<string, unknown>>;
    return {
        ...story,
        prose: {
            ...proseMap,
            [undo.sceneId]: {
                ...proseMap[undo.sceneId],
                final: undo.restoredProse,
                ...(isCascade
                    ? { stale: { reason: 'A scene-to-prose cascade edit was undone.', at: now() } }
                    : {})
            }
        }
    };
}

/** Drops verification verdicts that described a scene's prose before it was changed by hand. */
export function clearDirectiveReviewsForScene<P extends DirectivePlan | null>(plan: P, sceneId: string): P {
    if (!plan) return plan;
    return {
        ...plan,
        consistencyReview: undefined,
        actions: plan.actions.map((action) => {
            const result = resultOf(action);
            return result?.proseSceneId === sceneId ? { ...action, result: { ...result, review: undefined } } : action;
        })
    };
}
