/**
 * @module hooks/useDirectivePlanEditors
 * Manual editing of the Directive Agent's plan (Phase 6E-3): field / detail edits, skip, remove,
 * add a manual action, and undo of an applied surgical edit. The plan state itself stays with
 * the caller because the directive pipeline reads and writes it too; the edits are pure
 * functions in `@/domain/editing/directivePlanEditing`.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
    appendDirectiveAction,
    applySurgicalEditUndo,
    buildManualDirectiveAction,
    clearDirectiveReviewsForScene,
    planSurgicalEditUndo,
    removeDirectiveAction,
    shiftExpandedAfterRemoval,
    toggleDirectiveActionSkip,
    updateDirectiveActionDetail,
    updateDirectiveActionField,
    updateDirectiveAppliedEdit,
    type PlanAppliedEdit
} from '@/domain/editing';
import type { DirectivePlan } from '@/domain/story';
import type { Story } from '@/types';

type PlanStory = Partial<Story> & Record<string, unknown>;

export interface UseDirectivePlanEditorsParams<TStory extends PlanStory = PlanStory> {
    story: TStory;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    directivePlan: DirectivePlan | null;
    setDirectivePlan: Dispatch<SetStateAction<DirectivePlan | null>>;
    setExpandedDirectiveActions: Dispatch<SetStateAction<Record<string, boolean>>>;
    /** While the agent is planning or executing, adding actions and undoing edits are ignored. */
    isPlanningDirective: boolean;
    isExecutingDirective: boolean;
}

export interface UseDirectivePlanEditorsResult {
    handleUpdateActionField: (actionIdx: number, field: string, value: unknown) => void;
    handleUpdateActionDetail: (actionIdx: number, detailField: string, value: unknown) => void;
    handleUpdateAppliedEdit: (
        actionIdx: number,
        editIdx: number,
        updates: Partial<PlanAppliedEdit>,
        isCascade?: boolean
    ) => void;
    handleToggleDirectiveActionSkip: (actionIdx: number) => void;
    handleRemoveDirectiveAction: (actionIdx: number) => void;
    handleAddManualDirectiveAction: () => void;
    handleUndoSurgicalEdit: (actionIdx: number, editIdx: number, isCascade?: boolean) => void;
}

export function useDirectivePlanEditors<TStory extends PlanStory = PlanStory>({
    story,
    setStory,
    directivePlan,
    setDirectivePlan,
    setExpandedDirectiveActions,
    isPlanningDirective,
    isExecutingDirective
}: UseDirectivePlanEditorsParams<TStory>): UseDirectivePlanEditorsResult {
    const isBusy = isPlanningDirective || isExecutingDirective;

    const handleUpdateActionField = (actionIdx: number, field: string, value: unknown): void => {
        setDirectivePlan((prev) => updateDirectiveActionField(prev, actionIdx, field, value));
    };

    const handleUpdateActionDetail = (actionIdx: number, detailField: string, value: unknown): void => {
        setDirectivePlan((prev) => updateDirectiveActionDetail(prev, actionIdx, detailField, value));
    };

    const handleUpdateAppliedEdit = (
        actionIdx: number,
        editIdx: number,
        updates: Partial<PlanAppliedEdit>,
        isCascade = false
    ): void => {
        setDirectivePlan((prev) => updateDirectiveAppliedEdit(prev, actionIdx, editIdx, updates, isCascade));
    };

    const handleToggleDirectiveActionSkip = (actionIdx: number): void => {
        setDirectivePlan((prev) => toggleDirectiveActionSkip(prev, actionIdx));
    };

    const handleRemoveDirectiveAction = (actionIdx: number): void => {
        setDirectivePlan((prev) => removeDirectiveAction(prev, actionIdx));
        setExpandedDirectiveActions((prev) => shiftExpandedAfterRemoval(prev, actionIdx));
    };

    const handleAddManualDirectiveAction = (): void => {
        if (isBusy) return;
        const newAction = buildManualDirectiveAction(story);
        const nextIdx = directivePlan?.actions?.length || 0;
        setExpandedDirectiveActions((expanded) => ({ ...expanded, [nextIdx]: true }));
        setDirectivePlan((prev) => appendDirectiveAction(prev, newAction));
    };

    const handleUndoSurgicalEdit = (actionIdx: number, editIdx: number, isCascade = false): void => {
        if (isBusy) return;
        const undo = planSurgicalEditUndo(directivePlan, story, actionIdx, editIdx, isCascade);
        if (!undo) return;
        setStory((prev) => applySurgicalEditUndo(prev, undo, isCascade));
        handleUpdateAppliedEdit(actionIdx, editIdx, { undone: true }, isCascade);
        // A user-driven undo never launches verification; earlier verdicts no longer describe this prose.
        setDirectivePlan((prev) => clearDirectiveReviewsForScene(prev, undo.sceneId));
    };

    return {
        handleUpdateActionField,
        handleUpdateActionDetail,
        handleUpdateAppliedEdit,
        handleToggleDirectiveActionSkip,
        handleRemoveDirectiveAction,
        handleAddManualDirectiveAction,
        handleUndoSurgicalEdit
    };
}
