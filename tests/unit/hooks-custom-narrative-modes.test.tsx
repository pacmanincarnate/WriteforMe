import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NARRATIVE_MODES } from '@/config';
import {
    normalizeCustomModeId,
    removeCustomMode,
    renameNarrativeModeInScenes,
    upsertCustomMode,
    validateCustomModeDraft
} from '@/domain/story';
import { useCustomNarrativeModes, type UseCustomNarrativeModesResult } from '@/hooks';
import type { SceneBlueprint } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = 'ellipsisprose_custom_modes';
const builtInId = Object.keys(NARRATIVE_MODES)[0];
const draft = (over: Partial<{ id: string; context: string; prompt: string; icon: string }> = {}) => ({
    id: 'noir beat!',
    context: ' Smoky rooms ',
    prompt: ' Write it hardboiled ',
    icon: 'moon',
    ...over
});
const scene = (mode: string) => ({ dominant_narrative_mode: mode }) as unknown as SceneBlueprint;

describe('custom narrative mode rules (pure)', () => {
    it('normalises ids to upper-case letters, digits and underscores', () => {
        expect(normalizeCustomModeId('  noir beat-2_x! ')).toBe('NOIRBEAT2_X');
        expect(normalizeCustomModeId('')).toBe('');
    });

    it('accepts a valid draft and trims its text', () => {
        expect(validateCustomModeDraft(draft(), {}, null)).toEqual({
            ok: true,
            mode: { id: 'NOIRBEAT', context: 'Smoky rooms', prompt: 'Write it hardboiled', icon: 'moon' }
        });
    });

    it('rejects empty ids, built-in ids, duplicates and missing text', () => {
        const existing = { NOIRBEAT: { id: 'NOIRBEAT', context: 'c', prompt: 'p' } };
        const error = (d: ReturnType<typeof draft>, modes = {}, editing: string | null = null) => {
            const result = validateCustomModeDraft(d, modes, editing);
            return result.ok ? null : result.error;
        };
        expect(error(draft({ id: '!!!' }))).toMatch(/valid Mode ID/);
        expect(error(draft({ id: builtInId.toLowerCase() }))).toMatch(/built-in/);
        expect(error(draft(), existing)).toMatch(/already exists/);
        expect(error(draft(), existing, 'OTHER')).toMatch(/Another custom narrative mode/);
        expect(error(draft(), existing, 'NOIRBEAT')).toBeNull();
        expect(error(draft({ context: '  ' }))).toMatch(/description context/);
        expect(error(draft({ prompt: '' }))).toMatch(/prompt instructions/);
    });

    it('upserts, renames and removes without mutating the input', () => {
        const modes = { A: { id: 'A', context: 'c', prompt: 'p' } };
        const renamed = upsertCustomMode(modes, { id: 'B', context: 'c2', prompt: 'p2' }, 'A');
        expect(Object.keys(renamed)).toEqual(['B']);
        expect(Object.keys(upsertCustomMode(modes, { id: 'B', context: 'c', prompt: 'p' }))).toEqual(['A', 'B']);
        expect(removeCustomMode(modes, 'A')).toEqual({});
        expect(Object.keys(modes)).toEqual(['A']);
    });

    it('repoints scenes that used a renamed mode and leaves other stories untouched', () => {
        const story = { title: 't', scenes: { '1_1': [scene('A'), scene('C')], '1_2': [scene('A')] } };
        const next = renameNarrativeModeInScenes(story, 'A', 'B');
        expect(next.scenes['1_1'].map((s) => s.dominant_narrative_mode)).toEqual(['B', 'C']);
        expect(next.scenes['1_2'][0].dominant_narrative_mode).toBe('B');
        expect(next.title).toBe('t');
        expect(story.scenes['1_1'][0].dominant_narrative_mode).toBe('A');
        expect(renameNarrativeModeInScenes(story, 'ZZZ', 'B')).toBe(story);
        const bare: { title: string; scenes?: Record<string, SceneBlueprint[]> } = { title: 'no scenes' };
        expect(renameNarrativeModeInScenes(bare, 'A', 'B')).toBe(bare);
    });
});

type TestStory = { scenes?: Record<string, SceneBlueprint[]> };

describe('useCustomNarrativeModes', () => {
    const roots: Root[] = [];
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    function mount(initialStory: TestStory = {}) {
        const toasts: Array<[string, string | undefined]> = [];
        const alerts: string[] = [];
        const confirms: Array<{ title: string; onConfirm: () => void | Promise<void> }> = [];
        const box = { story: initialStory };
        let latest: UseCustomNarrativeModesResult | null = null;
        function Probe(): null {
            latest = useCustomNarrativeModes<TestStory>({
                setStory: (updater) => {
                    box.story = updater(box.story);
                },
                showToast: (m, v) => toasts.push([m, v]),
                requestConfirm: (options) => confirms.push(options),
                notifyAlert: (m) => alerts.push(m)
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return { current: () => latest as UseCustomNarrativeModesResult, toasts, alerts, confirms, box };
    }

    function fillForm(h: ReturnType<typeof mount>, id: string, context = 'Smoky rooms', prompt = 'Hardboiled') {
        act(() => {
            h.current().setNewModeId(id);
            h.current().setNewModeContext(context);
            h.current().setNewModePrompt(prompt);
            h.current().setNewModeIcon('moon');
        });
    }

    it('starts empty and exposes the built-in modes', () => {
        const h = mount();
        expect(h.current().customModes).toEqual({});
        expect(h.current().allNarrativeModes[builtInId]).toBe(NARRATIVE_MODES[builtInId]);
        expect(h.current().getModeIcon('NOT_A_MODE')).toBe('tag');
    });

    it('adds a mode, resets the form and persists it across a remount', () => {
        const h = mount();
        fillForm(h, 'noir');
        act(() => h.current().handleSaveCustomMode());
        expect(h.current().customModes.NOIR).toEqual({
            id: 'NOIR',
            context: 'Smoky rooms',
            prompt: 'Hardboiled',
            icon: 'moon'
        });
        expect(h.current().allNarrativeModes.NOIR.prompt).toBe('Hardboiled');
        expect(h.current().getModeIcon('NOIR')).toBe('moon');
        expect(h.current().newModeId).toBe('');
        expect(h.current().newModeIcon).toBe('tag');
        expect(h.toasts).toEqual([['Custom mode NOIR added!', 'success']]);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').NOIR.icon).toBe('moon');

        const again = mount();
        expect(again.current().customModes.NOIR.context).toBe('Smoky rooms');
    });

    it('alerts instead of saving an invalid draft', () => {
        const h = mount();
        fillForm(h, builtInId);
        act(() => h.current().handleSaveCustomMode());
        expect(h.alerts).toEqual(['This Mode ID conflicts with a built-in narrative mode.']);
        expect(h.current().customModes).toEqual({});
        expect(h.current().newModeId).toBe(builtInId);
        expect(h.toasts).toEqual([]);
    });

    it('edits a mode in place', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ NOIR: { id: 'NOIR', context: 'c', prompt: 'p' } }));
        const h = mount();
        act(() => h.current().handleStartEditCustomMode(h.current().customModes.NOIR));
        expect(h.current().editingModeId).toBe('NOIR');
        expect(h.current().newModeIcon).toBe('tag');
        act(() => h.current().setNewModePrompt('new prompt'));
        act(() => h.current().handleSaveCustomMode());
        expect(h.current().customModes.NOIR.prompt).toBe('new prompt');
        expect(h.current().editingModeId).toBeNull();
        expect(h.toasts).toEqual([['Custom mode NOIR updated!', 'success']]);
    });

    it('renaming a mode replaces the entry and repoints scenes that used it', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ NOIR: { id: 'NOIR', context: 'c', prompt: 'p' } }));
        const h = mount({ scenes: { '1_1': [scene('NOIR'), scene(builtInId)] } });
        act(() => h.current().handleStartEditCustomMode(h.current().customModes.NOIR));
        act(() => h.current().setNewModeId('gothic'));
        act(() => h.current().handleSaveCustomMode());
        expect(Object.keys(h.current().customModes)).toEqual(['GOTHIC']);
        expect(h.box.story.scenes?.['1_1'].map((s) => s.dominant_narrative_mode)).toEqual(['GOTHIC', builtInId]);
        expect(h.toasts).toEqual([['Custom mode updated to GOTHIC!', 'success']]);
        expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'))).toEqual(['GOTHIC']);
    });

    it('cancel clears the form without touching saved modes', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ NOIR: { id: 'NOIR', context: 'c', prompt: 'p' } }));
        const h = mount();
        act(() => h.current().handleStartEditCustomMode(h.current().customModes.NOIR));
        act(() => h.current().handleCancelEditCustomMode());
        expect(h.current().editingModeId).toBeNull();
        expect(h.current().newModeContext).toBe('');
        expect(h.current().customModes.NOIR).toBeDefined();
    });

    it('deletes only after confirmation, and leaves edit mode if that mode was open', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ NOIR: { id: 'NOIR', context: 'c', prompt: 'p' } }));
        const h = mount();
        act(() => h.current().handleStartEditCustomMode(h.current().customModes.NOIR));
        act(() => h.current().handleDeleteCustomMode('NOIR'));
        expect(h.confirms).toHaveLength(1);
        expect(h.confirms[0].title).toContain('NOIR');
        expect(h.current().customModes.NOIR).toBeDefined();
        act(() => {
            void h.confirms[0].onConfirm();
        });
        expect(h.current().customModes).toEqual({});
        expect(h.current().editingModeId).toBeNull();
        expect(h.toasts).toEqual([['Custom mode NOIR deleted.', 'info']]);
        expect(localStorage.getItem(STORAGE_KEY)).toBe('{}');
    });
});
