import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
    deleteProposition,
    invalidateBelief,
    saveBelief,
    saveProposition,
    type ContinuityStoryState,
    type EpistemicGraph
} from '@/domain/continuity';
import { useEpistemicEditors, type UseEpistemicEditorsResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const graphOf = (story: ContinuityStoryState) => story.epistemic_graph as EpistemicGraph;
const edgesFor = (story: ContinuityStoryState, propId: string) =>
    graphOf(story).holds_belief_edges.filter((e) => e.proposition_id === propId);

function storyWithProp(): ContinuityStoryState {
    return saveProposition({}, { id: 'p1', claim_text: 'The butler did it', subject_id: 'Butler' });
}

describe('epistemic graph edits (pure)', () => {
    it('creates a proposition with defaults and a generated id', () => {
        const next = saveProposition({}, {}, () => 42);
        const prop = graphOf(next).propositions.prop_42;
        expect(prop).toMatchObject({
            id: 'prop_42',
            claim_text: 'Unspecified proposition',
            predicate: 'FACT',
            objective_truth: 'TRUE',
            world_valid_from_scene: '0.0',
            world_valid_to_scene: null
        });
        expect(prop.subject_id).toContain('world');
        expect(graphOf(next).entities.meta_reader).toBeDefined();
    });

    it('normalises the predicate and entity ids, and leaves the input story without the proposition', () => {
        const story: ContinuityStoryState = {};
        const next = saveProposition(story, {
            id: ' p1 ',
            predicate: ' knows ',
            subject_id: 'Lady Ashe',
            object_id: 'The Vault'
        });
        const prop = graphOf(next).propositions.p1;
        expect(prop.predicate).toBe('KNOWS');
        expect(prop.subject_id).toMatch(/lady_ashe$/);
        expect(prop.object_id).toMatch(/the_vault$/);
        // ensureEpistemicGraph attaches an empty graph to the input (existing behaviour); the edit itself is copied.
        expect((story.epistemic_graph as EpistemicGraph | undefined)?.propositions?.p1).toBeUndefined();
    });

    it('merges into an existing proposition so untouched fields survive', () => {
        const base = storyWithProp();
        graphOf(base).propositions.p1.benign_behavioral_tell = 'polishes the silver';
        const next = saveProposition(base, { id: 'p1', claim_text: 'The butler lied' });
        expect(graphOf(next).propositions.p1.claim_text).toBe('The butler lied');
        expect(graphOf(next).propositions.p1.benign_behavioral_tell).toBe('polishes the silver');
        expect(graphOf(next).propositions).not.toBe(graphOf(base).propositions);
    });

    it('saving a belief adds an edge with clamped confidence and defaults', () => {
        const next = saveBelief(storyWithProp(), { holder_id: 'Ashe', proposition_id: 'p1', confidence: 7 });
        const [edge] = edgesFor(next, 'p1');
        expect(edge).toMatchObject({
            stance: 'BELIEVES_TRUE',
            confidence: 1,
            source_type: 'DIRECT_OBSERVATION',
            source_agent_id: null,
            acquired_at_scene: '1.1',
            invalidated_at_scene: null,
            emotional_charge: 0.5
        });
        expect(edge.holder_id).toMatch(/ashe$/);
        const defaulted = saveBelief(storyWithProp(), { proposition_id: 'p1', confidence: 'high' });
        expect(edgesFor(defaulted, 'p1')[0]).toMatchObject({ holder_id: 'meta_reader', confidence: 0.85 });
    });

    it('a newer belief closes the open one for the same holder and proposition', () => {
        const first = saveBelief(storyWithProp(), { holder_id: 'Ashe', proposition_id: 'p1' });
        const second = saveBelief(first, {
            holder_id: 'Ashe',
            proposition_id: 'p1',
            stance: 'BELIEVES_FALSE',
            acquired_at_scene: '1.3'
        });
        const edges = edgesFor(second, 'p1');
        expect(edges.map((e) => [e.stance, e.invalidated_at_scene])).toEqual([
            ['BELIEVES_TRUE', '1.3'],
            ['BELIEVES_FALSE', null]
        ]);
        expect(edgesFor(first, 'p1')[0].invalidated_at_scene).toBeNull();
    });

    it('an UNAWARE stance only closes the open belief', () => {
        const first = saveBelief(storyWithProp(), { holder_id: 'Ashe', proposition_id: 'p1' });
        const next = saveBelief(first, {
            holder_id: 'Ashe',
            proposition_id: 'p1',
            stance: 'UNAWARE',
            acquired_at_scene: '1.2'
        });
        expect(edgesFor(next, 'p1').map((e) => e.invalidated_at_scene)).toEqual(['1.2']);
    });

    it('invalidates a belief by identity or by matching key', () => {
        const story = saveBelief(storyWithProp(), { holder_id: 'Ashe', proposition_id: 'p1' });
        const edge = edgesFor(story, 'p1')[0];
        expect(edgesFor(invalidateBelief(story, edge, '2.1'), 'p1')[0].invalidated_at_scene).toBe('2.1');
        const byKey = invalidateBelief(story, { ...edge }, '2.2');
        expect(edgesFor(byKey, 'p1')[0].invalidated_at_scene).toBe('2.2');
        const miss = invalidateBelief(story, { ...edge, acquired_at_scene: '9.9' }, '2.3');
        expect(edgesFor(miss, 'p1')[0].invalidated_at_scene).toBeNull();
    });

    it('deleting a proposition removes its first- and second-order beliefs only', () => {
        let story = saveProposition(storyWithProp(), { id: 'p2', claim_text: 'other' });
        story = saveBelief(story, { holder_id: 'Ashe', proposition_id: 'p1' });
        story = saveBelief(story, { holder_id: 'Ashe', proposition_id: 'p2' });
        graphOf(story).second_order_edges.push(
            { proposition_id: 'p1' } as EpistemicGraph['second_order_edges'][number],
            { proposition_id: 'p2' } as EpistemicGraph['second_order_edges'][number]
        );
        const next = deleteProposition(story, 'p1');
        expect(Object.keys(graphOf(next).propositions)).toEqual(['p2']);
        expect(graphOf(next).holds_belief_edges.map((e) => e.proposition_id)).toEqual(['p2']);
        expect(graphOf(next).second_order_edges.map((e) => e.proposition_id)).toEqual(['p2']);
        expect(graphOf(story).propositions.p1).toBeDefined();
    });

    it('keeps the legacy first_order_edges alias readable', () => {
        const next = saveBelief(storyWithProp(), { holder_id: 'Ashe', proposition_id: 'p1' });
        expect(graphOf(next).first_order_edges).toBe(graphOf(next).holds_belief_edges);
    });
});

describe('useEpistemicEditors', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    function mount(initial: ContinuityStoryState = {}) {
        const toasts: Array<[string, string | undefined]> = [];
        const confirms: Array<{ title: string; message: string; onConfirm: () => void | Promise<void> }> = [];
        const box = { story: initial };
        let latest: UseEpistemicEditorsResult | null = null;
        function Probe(): null {
            latest = useEpistemicEditors({
                setStory: (updater) => {
                    box.story = updater(box.story);
                },
                showToast: (m, v) => toasts.push([m, v]),
                requestConfirm: (options) => confirms.push(options)
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return { current: () => latest as UseEpistemicEditorsResult, toasts, confirms, box };
    }

    it('starts with closed modals and default viewer state', () => {
        const h = mount();
        expect(h.current().epistemicViewTab).toBe('gesm');
        expect(h.current().epistemicScrubberCoord).toBe('1.1');
        expect(h.current().epistemicFilterChar).toBe('ALL');
        expect(h.current().editingPropModal).toMatchObject({ isOpen: false, predicate: 'FACT' });
        expect(h.current().editingBeliefModal).toMatchObject({ isOpen: false, confidence: 0.85 });
    });

    it('saving a proposition updates the story, closes the modal and toasts', () => {
        const h = mount();
        act(() => h.current().setEditingPropModal((prev) => ({ ...prev, isOpen: true, claim_text: 'draft' })));
        act(() => h.current().handleSaveProposition({ id: 'p1', claim_text: 'A fact' }));
        expect(graphOf(h.box.story).propositions.p1.claim_text).toBe('A fact');
        expect(h.current().editingPropModal).toMatchObject({ isOpen: false, claim_text: 'draft' });
        expect(h.toasts).toEqual([['Proposition saved to Epistemic Graph.', 'success']]);
    });

    it('saving and invalidating a belief updates the story', () => {
        const h = mount(storyWithProp());
        act(() => h.current().setEditingBeliefModal((prev) => ({ ...prev, isOpen: true })));
        act(() => h.current().handleSaveBelief({ holder_id: 'Ashe', proposition_id: 'p1' }));
        expect(h.current().editingBeliefModal.isOpen).toBe(false);
        const edge = edgesFor(h.box.story, 'p1')[0];
        act(() => h.current().handleInvalidateBelief(edge, '2.4'));
        expect(edgesFor(h.box.story, 'p1')[0].invalidated_at_scene).toBe('2.4');
        expect(h.toasts).toEqual([
            ['Character belief saved to Epistemic Graph.', 'success'],
            ['Belief invalidated at Scene 2.4.', 'info']
        ]);
    });

    it('deletes a proposition only after confirmation', () => {
        const h = mount(storyWithProp());
        act(() => h.current().handleDeleteProposition('p1'));
        expect(h.confirms[0].title).toBe('Delete Proposition "p1"?');
        expect(graphOf(h.box.story).propositions.p1).toBeDefined();
        act(() => {
            void h.confirms[0].onConfirm();
        });
        expect(graphOf(h.box.story).propositions.p1).toBeUndefined();
        expect(h.toasts).toEqual([['Proposition "p1" deleted.', 'info']]);
    });
});
