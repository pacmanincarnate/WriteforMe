import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
    buildLogDetailModal,
    removeLoreAt,
    resolveLogDetailRequest,
    sequenceIndicesForAct,
    setSequencesExpanded,
    toggleSequenceExpanded
} from '@/domain/story';
import {
    useLogDetailModal,
    useOutlineExpansion,
    useStoryEditors,
    type EditorStory,
    type UseLogDetailModalResult,
    type UseOutlineExpansionResult
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
});

function render(Probe: () => null): void {
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe />));
}

const entry = {
    id: 'log-7',
    function: 'Writing Agent',
    timestamp: '10:00',
    modelUsed: 'm1',
    tokensUsed: 100,
    thinkingTokens: 30,
    systemPrompt: ' sys ',
    prompt: ' user words here ',
    reasoningText: 'because',
    response: 'the prose'
};

describe('log detail (pure)', () => {
    it('resolves every call form', () => {
        expect(resolveLogDetailRequest('thinking', entry)).toEqual({ type: 'thinking', entry });
        expect(resolveLogDetailRequest(entry, 'prompt')).toEqual({ type: 'prompt', entry });
        expect(resolveLogDetailRequest(entry, undefined)).toEqual({ type: 'verbose', entry });
        expect(resolveLogDetailRequest(42, entry)).toEqual({ type: 'verbose', entry });
        expect(resolveLogDetailRequest('response', 'log-7', [null, entry])).toEqual({ type: 'response', entry });
        expect(resolveLogDetailRequest('log-7', 'thinking', [entry])).toEqual({ type: 'thinking', entry });
        expect(resolveLogDetailRequest('response', 'missing', [entry])).toBeNull();
        expect(resolveLogDetailRequest('verbose', undefined, [entry])).toBeNull();
    });

    it('builds the four views', () => {
        const verbose = buildLogDetailModal('verbose', entry);
        expect(verbose).toMatchObject({
            isOpen: true,
            type: 'verbose',
            title: 'Complete Verbose Dossier & Parameters',
            functionName: 'Writing Agent',
            timestamp: '10:00',
            model: 'm1',
            tokens: 100,
            entry
        });
        expect(verbose.content).toContain('Writing Agent');
        expect(buildLogDetailModal('thinking', entry)).toMatchObject({ type: 'thinking', tokens: 30, content: 'because' });
        expect(buildLogDetailModal('prompt', entry)).toMatchObject({
            type: 'prompt',
            content: '=== SYSTEM PROMPT ===\n\nsys\n\n=== USER PROMPT & INPUT DATA ===\n\nuser words here',
            tokens: 20
        });
        expect(buildLogDetailModal('response', entry)).toMatchObject({ type: 'response', tokens: 70, content: 'the prose' });
        expect(buildLogDetailModal('anything-else', entry).type).toBe('response');
    });

    it('falls back when an entry is sparse', () => {
        const bare = { function: 'f' };
        expect(buildLogDetailModal('thinking', bare)).toMatchObject({ tokens: 0, model: '' });
        expect(buildLogDetailModal('thinking', bare).content).toMatch(/No internal thinking/);
        expect(buildLogDetailModal('prompt', bare).content).toBe('(No prompt context recorded for this step.)');
        expect(buildLogDetailModal('prompt', { ...bare, finalSystemPrompt: 'final', systemPrompt: 'old', promptTokens: 5 })).toMatchObject({
            content: '=== SYSTEM PROMPT ===\n\nfinal\n\n',
            tokens: 5
        });
        expect(buildLogDetailModal('response', bare)).toMatchObject({ tokens: null, content: '(No response output recorded.)' });
        expect(buildLogDetailModal('response', { responseSnippet: 'snip', responseTokens: 3 })).toMatchObject({ tokens: 3, content: 'snip' });
    });
});

describe('outline expansion and lore removal (pure)', () => {
    const story = {
        acts: [{ number: 1 }, { number: 'II' }],
        sequences: [
            { number: 1, parent_act: 1 },
            { number: 2, parent_act: 2 },
            { number: 3, parent_act: 'Act 2' },
            { number: 8 }
        ]
    };

    it('finds the sequences of an act by parent_act, else by position', () => {
        expect(sequenceIndicesForAct(story, 0)).toEqual([0]);
        expect(sequenceIndicesForAct(story, 1)).toEqual([1, 2]);
        expect(sequenceIndicesForAct(story, 2)).toEqual([3]);
        expect(sequenceIndicesForAct({}, 0)).toEqual([]);
    });

    it('sets and toggles expansion without mutating', () => {
        const base = { 0: true };
        expect(setSequencesExpanded(base, [1, 2], true)).toEqual({ 0: true, 1: true, 2: true });
        expect(setSequencesExpanded(base, [0], false)).toEqual({ 0: false });
        expect(toggleSequenceExpanded(base, 0)).toEqual({ 0: false });
        expect(toggleSequenceExpanded(base, 3)).toEqual({ 0: true, 3: true });
        expect(base).toEqual({ 0: true });
    });

    it('removes one lore item', () => {
        const withLore = { title: 't', lore: ['a', 'b', 'c'] };
        expect(removeLoreAt(withLore, 1)).toEqual({ title: 't', lore: ['a', 'c'] });
        expect(withLore.lore).toHaveLength(3);
        expect(removeLoreAt({ title: 't' } as { title: string; lore?: unknown[] }, 0).lore).toEqual([]);
    });
});

describe('hooks', () => {
    it('useLogDetailModal opens by entry or id and ignores unknown ids', () => {
        let latest: UseLogDetailModalResult | null = null;
        render(function Probe() {
            latest = useLogDetailModal({ promptLog: [entry] });
            return null;
        });
        const h = () => latest as UseLogDetailModalResult;
        expect(h().logModalState).toMatchObject({ isOpen: false, type: 'verbose', entry: null });
        act(() => h().openLogDetailModal('response', 'nope'));
        expect(h().logModalState.isOpen).toBe(false);
        act(() => h().openLogDetailModal('response', 'log-7'));
        expect(h().logModalState).toMatchObject({ isOpen: true, type: 'response', content: 'the prose' });
        act(() => h().setLogModalState((prev) => ({ ...prev, isOpen: false })));
        act(() => h().openLogDetailModal(entry));
        expect(h().logModalState).toMatchObject({ isOpen: true, type: 'verbose' });
    });

    it('useOutlineExpansion toggles one sequence, a whole act, or explicit targets', () => {
        let latest: UseOutlineExpansionResult | null = null;
        const story = { acts: [{ number: 1 }, { number: 2 }], sequences: [{ parent_act: 1 }, { parent_act: 2 }, { parent_act: 2 }] };
        render(function Probe() {
            latest = useOutlineExpansion({ story });
            return null;
        });
        const h = () => latest as UseOutlineExpansionResult;
        act(() => h().toggleSequence(0));
        expect(h().expandedSequences).toEqual({ 0: true });
        act(() => h().toggleAllSequencesInAct(1));
        expect(h().expandedSequences).toEqual({ 0: true, 1: true, 2: true });
        act(() => h().toggleAllSequencesInAct(1, false));
        expect(h().expandedSequences).toEqual({ 0: true, 1: false, 2: false });
        act(() => h().toggleAllSequencesInAct(0, false, [0, 2]));
        expect(h().expandedSequences).toEqual({ 0: false, 1: false, 2: false });
    });

    it('useStoryEditors deletes lore only after confirmation', () => {
        const box: { story: EditorStory } = { story: { id: 's1', lore: ['a', 'b'] } };
        const confirms: Array<{ title: string; onConfirm: () => void | Promise<void> }> = [];
        const toasts: Array<[string, string | undefined]> = [];
        let handleDeleteLore: ((index: number) => void) | null = null;
        render(function Probe() {
            ({ handleDeleteLore } = useStoryEditors({
                story: box.story,
                setStory: (updater) => (box.story = updater(box.story)),
                selectedSequence: null,
                selectedScene: null,
                setSelectedSequence: () => {},
                setSelectedScene: () => {},
                showToast: (m, v) => toasts.push([m, v]),
                requestConfirm: (options) => confirms.push(options),
                storyStoreInstance: { saveStory: () => Promise.resolve() }
            }));
            return null;
        });
        act(() => handleDeleteLore?.(0));
        expect(confirms[0].title).toBe('Delete Lore Item?');
        expect(box.story.lore).toEqual(['a', 'b']);
        act(() => {
            void confirms[0].onConfirm();
        });
        expect(box.story.lore).toEqual(['b']);
        expect(toasts).toEqual([['Lore item deleted.', 'info']]);
    });
});
