import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
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
    updateDirectiveAppliedEdit
} from '@/domain/editing';
import type { DirectiveActionItem, DirectivePlan } from '@/domain/story';
import { useDirectivePlanEditors, type UseDirectivePlanEditorsResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AnyStory = Record<string, unknown>;

const action = (over: Record<string, unknown> = {}): DirectiveActionItem =>
    ({
        action_type: 'EDIT_PROSE',
        target_act_idx: 0,
        target_sequence_idx: 0,
        target_seq_idx: 0,
        target_scene_idx: 0,
        target_character_id: null,
        description: 'd',
        details: { instructions: 'i' },
        ...over
    }) as DirectiveActionItem;

const plan = (actions: DirectiveActionItem[]): DirectivePlan => ({
    evaluation: 'e',
    scope_kind: 'local',
    consistency_notes: '',
    actions
});

const edit = (before: string, after: string) => ({ index: 0, type: 'replace', matchedVia: 'exact', before, after });
interface TestEdit {
    before: string;
    after: string;
    undone?: boolean;
}
interface TestResult {
    review?: unknown;
    appliedEdits: TestEdit[];
    cascade: { status: string; appliedEdits: TestEdit[] };
}
const resultOf = (p: DirectivePlan | null, idx: number) => p?.actions[idx].result as TestResult;
const proseOf = (story: AnyStory) => story.prose as Record<string, { final?: string; stale?: unknown }>;

function executedPlan(): DirectivePlan {
    return plan([
        action({
            result: {
                status: 'applied',
                proseSceneId: '0-0',
                review: { verdict: 'pass' },
                appliedEdits: [edit('old door', 'new door'), edit('grey', 'gray')],
                cascade: { status: 'applied', message: '', appliedEdits: [edit('rain', 'snow')] }
            }
        }),
        action({ result: { status: 'applied', proseSceneId: '0-1', review: { verdict: 'pass' }, appliedEdits: [] } })
    ]);
}

describe('directive plan edits (pure)', () => {
    it('returns a missing plan unchanged', () => {
        expect(updateDirectiveActionField(null, 0, 'description', 'x')).toBeNull();
        expect(updateDirectiveActionDetail(null, 0, 'k', 'v')).toBeNull();
        expect(updateDirectiveAppliedEdit(null, 0, 0, {})).toBeNull();
        expect(toggleDirectiveActionSkip(null, 0)).toBeNull();
        expect(removeDirectiveAction(null, 0)).toBeNull();
        expect(clearDirectiveReviewsForScene(null, '0-0')).toBeNull();
    });

    it('updates a field and keeps the two sequence-index aliases in sync', () => {
        const base = plan([action(), action()]);
        const described = updateDirectiveActionField(base, 1, 'description', 'new');
        expect(described.actions[1].description).toBe('new');
        expect(described.actions[0]).toBe(base.actions[0]);
        for (const field of ['target_seq_idx', 'target_sequence_idx']) {
            const next = updateDirectiveActionField(base, 0, field, 3);
            expect(next.actions[0]).toMatchObject({ target_seq_idx: 3, target_sequence_idx: 3 });
        }
        expect(updateDirectiveActionField(base, 9, 'description', 'x').actions).toEqual(base.actions);
        expect(base.actions[1].description).toBe('d');
    });

    it('updates a detail, creating details when absent', () => {
        const base = plan([action(), action({ details: undefined })]);
        expect(updateDirectiveActionDetail(base, 0, 'find_text', 'x').actions[0].details).toEqual({
            instructions: 'i',
            find_text: 'x'
        });
        expect(updateDirectiveActionDetail(base, 1, 'k', 'v').actions[1].details).toEqual({ k: 'v' });
    });

    it('patches an applied edit on the action or on its cascade', () => {
        const base = executedPlan();
        const direct = updateDirectiveAppliedEdit(base, 0, 1, { undone: true });
        expect(resultOf(direct, 0).appliedEdits.map((e) => !!e.undone)).toEqual([false, true]);
        expect(resultOf(direct, 0).cascade.appliedEdits[0].undone).toBeUndefined();
        const cascade = updateDirectiveAppliedEdit(base, 0, 0, { undone: true }, true);
        expect(resultOf(cascade, 0).cascade.appliedEdits[0].undone).toBe(true);
        expect(resultOf(cascade, 0).cascade.status).toBe('applied');
        expect(resultOf(cascade, 0).appliedEdits[0].undone).toBeUndefined();
    });

    it('leaves actions without results, or without a cascade, untouched', () => {
        const base = plan([action(), action({ result: { appliedEdits: [edit('a', 'b')] } })]);
        expect(updateDirectiveAppliedEdit(base, 0, 0, { undone: true }).actions[0]).toBe(base.actions[0]);
        expect(updateDirectiveAppliedEdit(base, 1, 0, { undone: true }, true).actions[1]).toBe(base.actions[1]);
    });

    it('toggles skip and removes actions', () => {
        const base = plan([action(), action({ description: 'second' })]);
        const skipped = toggleDirectiveActionSkip(base, 0);
        expect(skipped.actions[0].skipped).toBe(true);
        expect(toggleDirectiveActionSkip(skipped, 0).actions[0].skipped).toBe(false);
        expect(removeDirectiveAction(base, 0).actions.map((a) => a.description)).toEqual(['second']);
    });

    it('re-keys expanded rows after a removal', () => {
        expect(shiftExpandedAfterRemoval({ 0: true, 1: true, 2: false, 3: true }, 1)).toEqual({ 0: true, 2: true });
        expect(shiftExpandedAfterRemoval(null, 0)).toEqual({});
    });

    it('picks the manual starter action from the state of the story', () => {
        expect(buildManualDirectiveAction({ author_note: 'note' })).toMatchObject({
            action_type: 'MODIFY_STORY_METADATA',
            details: { author_note: 'note' }
        });

        const outlined: AnyStory = {
            acts: [{ number: 1 }, { number: 2 }],
            sequences: [
                { number: 1, parent_act: 1 },
                { number: 2, parent_act: 2 }
            ],
            scenes: { '0': [{ title: 's' }] },
            cast: [{ name: 'Ashe' }]
        };
        expect(buildManualDirectiveAction(outlined)).toMatchObject({
            action_type: 'PERSIST_FUTURE_MANDATE',
            target_act_idx: 1,
            target_seq_idx: 1,
            target_sequence_idx: 1,
            description: 'Guide future scenes in Sequence 2',
            details: { target_scope: 'sequence', mandate_label: 'Direction', mandate_text: '' }
        });

        const developed: AnyStory = { ...outlined, scenes: { '0': [{ title: 's' }], '1': [{ title: 't' }] } };
        expect(buildManualDirectiveAction(developed)).toMatchObject({
            action_type: 'ADD_SCENE',
            details: { scene_type: 'PROACTIVE', pov_character: 'Ashe' }
        });
    });

    it('appends to a plan, or starts a manual one', () => {
        const started = appendDirectiveAction(null, { action_type: 'ADD_SCENE' });
        expect(started).toMatchObject({ evaluation: 'Custom manual directive plan.', scope_kind: 'local' });
        expect(started.actions).toHaveLength(1);
        const base = plan([action()]);
        expect(appendDirectiveAction(base, { action_type: 'X' }).actions).toHaveLength(2);
        expect(base.actions).toHaveLength(1);
    });

    it('plans an undo against the current prose', () => {
        const story = { prose: { '0-0': { final: 'A new door in gray snow.' } } };
        expect(planSurgicalEditUndo(executedPlan(), story, 0, 0)).toEqual({
            sceneId: '0-0',
            restoredProse: 'A old door in gray snow.'
        });
        expect(planSurgicalEditUndo(executedPlan(), story, 0, 0, true)?.restoredProse).toBe('A new door in gray rain.');
    });

    it('refuses an undo it cannot perform', () => {
        const story = { prose: { '0-0': { final: 'Nothing matches here.' } } };
        const base = executedPlan();
        expect(planSurgicalEditUndo(base, story, 0, 0)).toBeNull();
        expect(planSurgicalEditUndo(base, story, 0, 7)).toBeNull();
        expect(planSurgicalEditUndo(null, story, 0, 0)).toBeNull();
        const undone = updateDirectiveAppliedEdit(base, 0, 0, { undone: true });
        expect(planSurgicalEditUndo(undone, { prose: { '0-0': { final: 'new door' } } }, 0, 0)).toBeNull();
        const noScene = plan([action({ result: { appliedEdits: [edit('a', 'b')] } })]);
        expect(planSurgicalEditUndo(noScene, { prose: { '0-0': { final: 'b' } } }, 0, 0)).toBeNull();
    });

    it('writes the restored prose, marking cascade undos stale', () => {
        const story = { title: 't', prose: { '0-0': { final: 'x', draft: 'kept' }, '0-1': { final: 'y' } } };
        const undo = { sceneId: '0-0', restoredProse: 'restored' };
        const direct = applySurgicalEditUndo(story, undo);
        expect(direct.prose['0-0']).toEqual({ final: 'restored', draft: 'kept' });
        expect(direct.prose['0-1']).toBe(story.prose['0-1']);
        const cascade = applySurgicalEditUndo(story, undo, true, () => 5) as AnyStory;
        expect(proseOf(cascade)['0-0'].stale).toEqual({
            reason: 'A scene-to-prose cascade edit was undone.',
            at: 5
        });
        expect(story.prose['0-0'].final).toBe('x');
    });

    it('clears reviews for the edited scene only', () => {
        const base = { ...executedPlan(), consistencyReview: { ok: true } };
        const next = clearDirectiveReviewsForScene(base, '0-0');
        expect(next.consistencyReview).toBeUndefined();
        expect(resultOf(next, 0).review).toBeUndefined();
        expect(resultOf(next, 1).review).toEqual({ verdict: 'pass' });
    });
});

describe('useDirectivePlanEditors', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    function mount(options: { plan?: DirectivePlan | null; story?: AnyStory; planning?: boolean; executing?: boolean } = {}) {
        const view: {
            api: UseDirectivePlanEditorsResult | null;
            plan: DirectivePlan | null;
            story: AnyStory;
            expanded: Record<string, boolean>;
        } = { api: null, plan: null, story: {}, expanded: {} };
        function Probe(): null {
            const [story, setStoryState] = useState<AnyStory>(options.story || {});
            const [directivePlan, setDirectivePlan] = useState<DirectivePlan | null>(options.plan ?? null);
            const [expanded, setExpanded] = useState<Record<string, boolean>>({ 1: true });
            view.api = useDirectivePlanEditors({
                story,
                setStory: (updater) => setStoryState(updater),
                directivePlan,
                setDirectivePlan,
                setExpandedDirectiveActions: setExpanded,
                isPlanningDirective: !!options.planning,
                isExecutingDirective: !!options.executing
            });
            view.plan = directivePlan;
            view.story = story;
            view.expanded = expanded;
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return view;
    }

    it('edits fields, details and skip state through the plan setter', () => {
        const h = mount({ plan: plan([action(), action()]) });
        act(() => h.api!.handleUpdateActionField(0, 'target_seq_idx', 2));
        act(() => h.api!.handleUpdateActionDetail(0, 'find_text', 'x'));
        act(() => h.api!.handleToggleDirectiveActionSkip(1));
        expect(h.plan!.actions[0]).toMatchObject({ target_sequence_idx: 2, details: { find_text: 'x' } });
        expect(h.plan!.actions[1].skipped).toBe(true);
    });

    it('removing an action shifts the expanded rows', () => {
        const h = mount({ plan: plan([action(), action({ description: 'second' })]) });
        act(() => h.api!.handleRemoveDirectiveAction(0));
        expect(h.plan!.actions.map((a) => a.description)).toEqual(['second']);
        expect(h.expanded).toEqual({ 0: true });
    });

    it('adds a manual action, expands it, and starts a plan when there is none', () => {
        const h = mount({ story: { author_note: 'n' } });
        act(() => h.api!.handleAddManualDirectiveAction());
        expect(h.plan!.actions[0].action_type).toBe('MODIFY_STORY_METADATA');
        expect(h.expanded).toEqual({ 0: true, 1: true });
        act(() => h.api!.handleAddManualDirectiveAction());
        expect(h.plan!.actions).toHaveLength(2);
    });

    it('ignores add and undo while the agent is busy', () => {
        for (const busy of [{ planning: true }, { executing: true }]) {
            const h = mount({ ...busy, plan: executedPlan(), story: { prose: { '0-0': { final: 'new door' } } } });
            act(() => h.api!.handleAddManualDirectiveAction());
            act(() => h.api!.handleUndoSurgicalEdit(0, 0));
            expect(h.plan!.actions).toHaveLength(2);
            expect(proseOf(h.story)['0-0'].final).toBe('new door');
        }
    });

    it('undo restores the prose, marks the edit undone and clears that scene\'s reviews', () => {
        const h = mount({
            plan: { ...executedPlan(), consistencyReview: { ok: true } },
            story: { prose: { '0-0': { final: 'A new door.' } } }
        });
        act(() => h.api!.handleUndoSurgicalEdit(0, 0));
        expect(proseOf(h.story)['0-0']).toEqual({ final: 'A old door.' });
        expect(resultOf(h.plan, 0).appliedEdits[0].undone).toBe(true);
        expect(resultOf(h.plan, 0).review).toBeUndefined();
        expect(resultOf(h.plan, 1).review).toEqual({ verdict: 'pass' });
        expect(h.plan!.consistencyReview).toBeUndefined();

        act(() => h.api!.handleUndoSurgicalEdit(0, 0));
        expect(proseOf(h.story)['0-0'].final).toBe('A old door.');
    });
});
