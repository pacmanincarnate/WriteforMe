import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyBeatFieldChange,
    applySceneBlueprintUpdate,
    dismissStaleProse,
    insertBeatAfter,
    insertSceneAt,
    moveSceneBy,
    removeBeatAt,
    removeSceneAt,
    type SceneEditableStory
} from '@/domain/story';
import { useStoryEditors, type EditorStory, type UseStoryEditorsResult } from '@/hooks';

function makeStory(): EditorStory {
    return {
        id: 'story_1',
        cast: [
            { id: 'C1', name: 'Mara' },
            { id: 'C2', name: 'Ilse' }
        ],
        sequences: [{ number: 1 }, { number: 2 }],
        scenes: {
            '0': [
                { id: '1.1', number: '1.1', title: 'Arrival', pov_character: 'Mara', setting: 'Quay', characters_present: ['Mara'] },
                { id: '1.2', number: '1.2', title: 'Bargain', pov_character: 'Ilse', setting: 'Lamp room', characters_present: ['Ilse', 'Mara'] },
                { id: '1.3', number: '1.3', title: 'Storm', pov_character: 'Mara', setting: 'Gallery' }
            ],
            '1': [{ id: '2.1', number: '2.1', title: 'Aftermath' }]
        },
        beats: {
            '0-0': [{ number: 1, action: 'lands' }],
            '0-1': [
                { number: 1, action: 'offers', tactic: 'charm', reaction: 'refuses' },
                { number: 2, action: 'insists' }
            ],
            '0-2': [{ number: 1, action: 'climbs' }],
            '0-0-2': [{ number: 1, action: 'legacy climbs' }]
        },
        prose: {
            '0-0': { final: 'Prose A' },
            '0-1': { final: 'Prose B' },
            '0-2': { draft: 'Prose C' },
            '0-0-2': { final: 'Legacy C' },
            '1-0': { final: 'Prose D' }
        }
    } as EditorStory;
}

const titles = (story: SceneEditableStory, seq = '0'): string[] => (story.scenes?.[seq] || []).map((s) => s.title);
const numbers = (story: SceneEditableStory, seq = '0'): unknown[] => (story.scenes?.[seq] || []).map((s) => s.number);

describe('sceneEditing: beats', () => {
    it('editing action or reaction rebuilds the combined description', () => {
        const story = makeStory();
        const afterAction = applyBeatFieldChange(story, '0-1', 0, 'action', 'pleads');
        expect(afterAction.beats?.['0-1'][0]).toMatchObject({
            action: 'pleads',
            char_A_action: 'pleads',
            description: '[charm] pleads -> refuses',
            action_description: '[charm] pleads -> refuses'
        });
        const afterReaction = applyBeatFieldChange(afterAction, '0-1', 0, 'reaction', '—');
        expect(afterReaction.beats?.['0-1'][0].description).toBe('[charm] pleads');
        expect(story.beats?.['0-1'][0].action).toBe('offers'); // input untouched
    });

    it('editing any other field replaces the description and backfills an empty action', () => {
        const story = makeStory();
        story.beats = { '0-0': [{ number: 1 }] };
        const next = applyBeatFieldChange(story, '0-0', 0, 'description', 'A gull screams.');
        expect(next.beats?.['0-0'][0]).toMatchObject({
            description: 'A gull screams.',
            action_description: 'A gull screams.',
            action: 'A gull screams.',
            char_A_action: 'A gull screams.'
        });
        // Out-of-range beat index leaves the list as it was.
        expect(applyBeatFieldChange(story, '0-0', 5, 'action', 'x').beats?.['0-0']).toEqual([{ number: 1 }]);
    });

    it('inserts and removes beats with renumbering', () => {
        const story = makeStory();
        const inserted = insertBeatAfter(story, '0-1', 0);
        expect(inserted.beats?.['0-1'].map((b) => [b.number, b.action])).toEqual([
            [1, 'offers'],
            [2, ''],
            [3, 'insists']
        ]);
        expect(inserted.beats?.['0-1'][1]).toMatchObject({ beat_type: 'DRAMATIC', valence: 0 });
        const removed = removeBeatAt(inserted, '0-1', 0);
        expect(removed.beats?.['0-1'].map((b) => [b.number, b.action])).toEqual([
            [1, ''],
            [2, 'insists']
        ]);
        expect(removeBeatAt(story, '0-1', 9).beats?.['0-1']).toHaveLength(2);
        expect(insertBeatAfter(story, '9-9', -1).beats?.['9-9']).toHaveLength(1);
    });
});

describe('sceneEditing: scenes', () => {
    it('removeSceneAt drops the scene with its beats/prose and shifts later scenes down', () => {
        const story = makeStory();
        const next = removeSceneAt(story, 0, 0);
        expect(titles(next)).toEqual(['Bargain', 'Storm']);
        expect(numbers(next)).toEqual(['1.1', '1.2']);
        expect(next.prose?.['0-0']).toEqual({ final: 'Prose B' });
        expect(next.prose?.['0-1']).toEqual({ draft: 'Prose C' });
        expect(next.prose?.['0-2']).toBeUndefined();
        expect(next.beats?.['0-0']).toHaveLength(2);
        expect(next.prose?.['1-0']).toEqual({ final: 'Prose D' });
        expect(titles(story)).toEqual(['Arrival', 'Bargain', 'Storm']);
        expect(numbers(story)).toEqual(['1.1', '1.2', '1.3']); // source scenes are not renumbered in place
    });

    it('insertSceneAt appends by default and inherits from the previous scene', () => {
        const story = makeStory();
        const { story: next, insertIdx, title } = insertSceneAt(story, 0);
        expect(insertIdx).toBe(3);
        expect(title).toBe('Scene 1.4');
        expect(titles(next)).toEqual(['Arrival', 'Bargain', 'Storm', 'Scene 1.4']);
        const created = next.scenes?.['0'][3];
        expect(created).toMatchObject({ number: '1.4', pov_character: 'Mara', setting: 'Gallery', user_edited: true });
        expect(created?.scene_type).toBe('REACTIVE');
        expect((created?.modality_hand as unknown[]).length).toBe(3);
        expect(next.prose).toEqual(story.prose);
    });

    it('insertSceneAt in the middle re-keys beats and prose, including legacy keys', () => {
        const story = makeStory();
        const { story: next, insertIdx } = insertSceneAt(story, 0, 1);
        expect(insertIdx).toBe(1);
        expect(titles(next)).toEqual(['Arrival', 'Scene 1.2', 'Bargain', 'Storm']);
        expect(numbers(next)).toEqual(['1.1', '1.2', '1.3', '1.4']);
        expect(next.prose?.['0-0']).toEqual({ final: 'Prose A' });
        expect(next.prose?.['0-1']).toBeUndefined();
        expect(next.prose?.['0-2']).toEqual({ final: 'Prose B' });
        expect(next.prose?.['0-3']).toEqual({ draft: 'Prose C' });
        expect(next.prose?.['0-0-3']).toEqual({ final: 'Legacy C' });
        expect(next.beats?.['0-2']).toHaveLength(2);
        expect(next.beats?.['0-0-3']).toEqual([{ number: 1, action: 'legacy climbs' }]);
        expect(next.scenes?.['0'][1]).toMatchObject({ pov_character: 'Mara', scene_type: 'REACTIVE' });
    });

    it('insertSceneAt clamps the index and handles an empty sequence', () => {
        const story = makeStory();
        expect(insertSceneAt(story, 0, 99).insertIdx).toBe(3);
        expect(insertSceneAt(story, 0, -4).insertIdx).toBe(0);
        const fresh = insertSceneAt({ cast: [{ id: 'C1', name: 'Mara' }] } as EditorStory, 2);
        expect(fresh.title).toBe('Scene 3.1');
        expect(fresh.story.scenes?.['2'][0]).toMatchObject({
            pov_character: 'Mara',
            transition_jump: 'Sequence opening',
            scene_type: 'PROACTIVE'
        });
    });

    it('moveSceneBy swaps neighbours with their beats and prose and refuses out-of-range moves', () => {
        const story = makeStory();
        const down = moveSceneBy(story, 0, 1, 1);
        expect(down).toMatchObject({ moved: true, title: 'Bargain', toIdx: 2 });
        expect(titles(down.story)).toEqual(['Arrival', 'Storm', 'Bargain']);
        expect(numbers(down.story)).toEqual(['1.1', '1.2', '1.3']);
        expect(down.story.prose?.['0-1']).toEqual({ draft: 'Prose C' });
        expect(down.story.prose?.['0-2']).toEqual({ final: 'Prose B' });
        expect(down.story.prose?.['0-0-1']).toEqual({ final: 'Legacy C' });
        expect(down.story.prose?.['0-0-2']).toBeUndefined();
        expect(down.story.beats?.['0-2']).toHaveLength(2);

        const blocked = moveSceneBy(story, 0, 0, -1);
        expect(blocked.moved).toBe(false);
        expect(blocked.story).toBe(story);
        expect(moveSceneBy(story, 0, 2, 1).moved).toBe(false);
        expect(moveSceneBy(story, 0, 1, 0).moved).toBe(false);
    });
});

describe('sceneEditing: blueprint edits', () => {
    it('marks written prose stale only when a tracked field really changed', () => {
        const story = makeStory();
        const edited = applySceneBlueprintUpdate(story, 0, 1, { setting: 'Cellar' }, {}, 777);
        expect(edited.changedFields).toEqual(['setting']);
        expect(edited.story.scenes?.['0'][1]).toMatchObject({ setting: 'Cellar', user_edited: true, number: '1.2' });
        expect(edited.story.prose?.['0-1']).toEqual({
            final: 'Prose B',
            stale: { reason: 'Scene blueprint was manually edited.', changedFields: ['setting'], at: 777 }
        });

        const same = applySceneBlueprintUpdate(story, 0, 1, { setting: 'Lamp room' });
        expect(same.changedFields).toEqual([]);
        expect(same.story.prose?.['0-1']).toEqual({ final: 'Prose B' });

        const quiet = applySceneBlueprintUpdate(story, 0, 1, { setting: 'Cellar' }, { markStale: false, markUserEdited: false });
        expect(quiet.story.prose?.['0-1']).toEqual({ final: 'Prose B' });
        expect(quiet.story.scenes?.['0'][1].user_edited).toBe(false);
    });

    it('keeps alias fields in sync and parses value shifts', () => {
        const story = makeStory();
        const { story: next } = applySceneBlueprintUpdate(story, 0, 0, {
            goal: 'Sell an hour',
            relationship_shifts: ['Mara distrusts Ilse'],
            value_shift: 'Calm -> Dread'
        });
        const scene = next.scenes?.['0'][0];
        expect(scene?.objective).toBe('Sell an hour');
        expect(scene?.value_shift).toEqual({ start_state: 'Calm', end_state: 'Dread' });
        expect(scene?.relationship_changes).toEqual(['Mara distrusts Ilse']);
    });

    it('resolves cast edits by id or name, de-duplicated', () => {
        const story = makeStory();
        const { story: next, changedFields } = applySceneBlueprintUpdate(story, 0, 0, {
            cast_names: 'C2, mara; Mara\n- Stranger'
        });
        const scene = next.scenes?.['0'][0];
        expect(scene?.characters_present).toEqual(['Ilse', 'Mara', 'Stranger']);
        expect(scene?.cast_names).toEqual(['Ilse', 'Mara', 'Stranger']);
        expect(changedFields).toContain('characters_present');
    });

    it('returns the same story for a missing scene, and dismisses stale markers', () => {
        const story = makeStory();
        expect(applySceneBlueprintUpdate(story, 0, 9, { title: 'x' }).story).toBe(story);
        const stale = applySceneBlueprintUpdate(story, 0, 1, { title: 'Renamed' }).story;
        const cleaned = dismissStaleProse(stale, 0, 1);
        expect(cleaned.prose?.['0-1']).toEqual({ final: 'Prose B' });
        expect(dismissStaleProse(story, 0, 1)).toBe(story);
    });
});

// ───────────────────────────── Hook ─────────────────────────────

interface Harness {
    api: () => UseStoryEditorsResult<EditorStory>;
    story: () => EditorStory;
    selection: () => { seq: number | null; scene: number | null };
    toasts: Array<[string, string | undefined]>;
    confirms: Array<{ title: string; onConfirm: () => void | Promise<void> }>;
    saves: Array<[string, EditorStory]>;
    rerender: () => void;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
});

function mount(initial: EditorStory, selected: { seq: number | null; scene: number | null }): Harness {
    let story = initial;
    const selection = { ...selected };
    const toasts: Harness['toasts'] = [];
    const confirms: Harness['confirms'] = [];
    const saves: Harness['saves'] = [];
    let api: UseStoryEditorsResult<EditorStory> | null = null;

    function Probe(): null {
        api = useStoryEditors<EditorStory>({
            story,
            setStory: (updater) => {
                story = updater(story);
                return story;
            },
            selectedSequence: selection.seq,
            selectedScene: selection.scene,
            setSelectedSequence: (value) => {
                selection.seq = typeof value === 'function' ? value(selection.seq) : value;
            },
            setSelectedScene: (value) => {
                selection.scene = typeof value === 'function' ? value(selection.scene) : value;
            },
            showToast: (message, variant) => toasts.push([message, variant]),
            requestConfirm: (options) => confirms.push(options),
            storyStoreInstance: {
                saveStory: vi.fn(async (id: string, data: EditorStory) => {
                    saves.push([id, data]);
                })
            }
        });
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    const rerender = (): void => act(() => root.render(<Probe key={Math.random()} />));
    rerender();
    return {
        api: () => api as UseStoryEditorsResult<EditorStory>,
        story: () => story,
        selection: () => selection,
        toasts,
        confirms,
        saves,
        rerender
    };
}

describe('useStoryEditors', () => {
    it('handleAddScene selects the new scene, saves and toasts', () => {
        const h = mount(makeStory(), { seq: 1, scene: 0 });
        h.api().handleAddScene(0, 1);
        expect(titles(h.story())).toEqual(['Arrival', 'Scene 1.2', 'Bargain', 'Storm']);
        expect(h.selection()).toEqual({ seq: 0, scene: 1 });
        expect(h.saves).toHaveLength(1);
        expect(h.saves[0][0]).toBe('story_1');
        expect(h.saves[0][1]).toBe(h.story());
        expect(h.toasts).toEqual([['Added "Scene 1.2"', 'success']]);
    });

    it('handleAddScene without a sequence targets the selected one', () => {
        const h = mount(makeStory(), { seq: 1, scene: 0 });
        h.api().handleAddScene();
        expect(titles(h.story(), '1')).toEqual(['Aftermath', 'Scene 2.2']);
        expect(h.selection()).toEqual({ seq: 1, scene: 1 });
    });

    it('handleMoveScene follows the selection and ignores impossible moves', () => {
        const h = mount(makeStory(), { seq: 0, scene: 1 });
        h.api().handleMoveScene(0, 1, 1);
        expect(titles(h.story())).toEqual(['Arrival', 'Storm', 'Bargain']);
        expect(h.selection().scene).toBe(2);
        expect(h.toasts).toEqual([['Moved "Bargain" down', 'info']]);
        expect(h.saves).toHaveLength(1);

        h.api().handleMoveScene(0, 0, -1);
        expect(h.saves).toHaveLength(1);
        expect(h.toasts).toHaveLength(1);
    });

    it('updateSceneBlueprint returns and saves the updated story, defaulting to the selection', () => {
        const h = mount(makeStory(), { seq: 0, scene: 2 });
        const updated = h.api().updateSceneBlueprint(null, null, { setting: 'Roof' });
        expect(updated).toBe(h.story());
        expect(updated.scenes?.['0'][2].setting).toBe('Roof');
        expect((updated.prose?.['0-2'] as { stale?: unknown }).stale).toBeTruthy();
        expect(h.saves).toHaveLength(1);

        h.api().handleDismissStaleProse(0, 2);
        expect((h.story().prose?.['0-2'] as { stale?: unknown }).stale).toBeUndefined();
        expect(h.saves).toHaveLength(2);
    });

    it('scene and beat deletion wait for confirmation', () => {
        const h = mount(makeStory(), { seq: 0, scene: 0 });
        h.api().handleDeleteScene(0, 1);
        expect(h.confirms[0].title).toBe('Delete Scene "Bargain"?');
        expect(titles(h.story())).toHaveLength(3);
        h.confirms[0].onConfirm();
        expect(titles(h.story())).toEqual(['Arrival', 'Storm']);
        expect(h.toasts).toEqual([['Deleted Scene "Bargain"', undefined]]);

        h.api().handleDeleteScene(0, 9);
        expect(h.confirms).toHaveLength(1);

        h.api().handleDeleteBeat(0, 0, 0);
        expect(h.confirms[1].title).toBe('Delete Beat 1?');
        h.confirms[1].onConfirm();
        expect(h.story().beats?.['0-0']).toEqual([]);
    });

    it('supports the legacy short argument forms against the selected sequence', () => {
        const h = mount(makeStory(), { seq: 0, scene: 0 });
        // Legacy (sceneIdx, beatIdx, text, <any string>) edits description on the selected sequence.
        (h.api().handleBeatChange as (...args: unknown[]) => void)(1, 0, 'A new line.', 'description');
        expect(h.story().beats?.['0-1'][0].description).toBe('A new line.');
        // (seqIdx, sceneIdx, beatIdx, text) edits action
        h.api().handleBeatChange(0, 1, 1, 'demands');
        expect(h.story().beats?.['0-1'][1]).toMatchObject({ action: 'demands', description: 'demands' });
        // (seqIdx, sceneIdx, beatIdx, field, text)
        h.api().handleBeatChange(0, 1, 1, 'reaction', 'laughs');
        expect(h.story().beats?.['0-1'][1].description).toBe('demands -> laughs');
        // (sceneIdx, insertAfterIdx)
        h.api().handleAddBeat(2, 0);
        expect(h.story().beats?.['0-2']).toHaveLength(2);
        expect(h.toasts[h.toasts.length - 1][0]).toBe('Beat added after Beat 1');
        // (sceneIdx, beatIdx)
        h.api().handleDeleteBeat(2, 1);
        h.confirms[h.confirms.length - 1].onConfirm();
        expect(h.story().beats?.['0-2']).toHaveLength(1);
    });
});
