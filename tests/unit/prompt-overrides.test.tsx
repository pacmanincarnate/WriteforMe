import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PROMPTS, PROSE_PROMPTS, SERIES_PROMPTS, getSurgicalPromptForMode } from '@/prompts';
import {
    applyPromptOverrides,
    isEditablePrompt,
    listEditablePrompts,
    parsePromptOverrides,
    promptProblems,
    requiredTagsOf,
    resetPromptOverride,
    savePromptOverride,
    viewPrompt,
    type PromptOverrides
} from '@/prompts/overrides';
import { PROMPT_OVERRIDES_STORAGE_KEY } from '@/hooks';
import { hydrateAllStoresFromStorage } from '@/stores';
import { SettingsPromptsTab } from '@/views/settings/SettingsPromptsTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const registry = PROMPTS as unknown as Record<string, string>;
const DEFAULTS = { ...registry };

afterEach(() => {
    applyPromptOverrides({});
    localStorage.removeItem(PROMPT_OVERRIDES_STORAGE_KEY);
});

function mustSave(overrides: PromptOverrides, key: string, wording: string): PromptOverrides {
    const result = savePromptOverride(overrides, key, wording, 1000);
    if (!result.ok) throw new Error(result.error);
    return result.overrides;
}

describe('editable prompts: the list', () => {
    it('lists every core prompt once, grouped, with its shipped wording', () => {
        const prompts = listEditablePrompts({});
        const keys = prompts.map((p) => p.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual(expect.arrayContaining(['writingAgent', 'conceptualDevelopment', 'storyArc', 'archivist', 'seriesArchitect']));
        // Aliases follow the prompt they stand for; they are not edited on their own.
        expect(keys).not.toContain('writing');
        expect(keys).not.toContain('characterDeveloper');
        prompts.forEach((p) => {
            expect(p.text).toBe(p.default);
            expect(p.customized).toBe(false);
            expect(p.group).toBeTruthy();
            expect(p.label).toBeTruthy();
        });
        expect(viewPrompt('writingAgent', {})?.default).toBe(DEFAULTS.writingAgent);
        expect(isEditablePrompt('nope')).toBe(false);
    });
});

describe('editable prompts: guard rails', () => {
    it('finds the tags a default shows the model writing', () => {
        expect(requiredTagsOf('Read <input_notes>. Reply as <out><item>x</item></out> or <flag level="1" />.')).toEqual(['flag', 'item', 'out']);
    });

    it('refuses an empty prompt and one that drops a tag the reply is read by', () => {
        const def = 'Return <edits><edit>...</edit></edits>.';
        expect(promptProblems(def, '   ')).toMatch(/empty/);
        expect(promptProblems(def, 'Return <edits> with your changes </edits>.')).toMatch(/<edit>/);
        expect(promptProblems(def, 'Be brief. Return <edits><edit>...</edit></edits>.')).toBeNull();
        const json = 'Reply as {"verdict": "pass", "notes": []}.';
        expect(promptProblems(json, 'Reply as {"verdict": "pass"}.')).toMatch(/"notes"/);
        expect(promptProblems(json, 'Short. {"verdict": "", "notes": []}')).toBeNull();
    });

    it('accepts the shipped wording of every prompt', () => {
        listEditablePrompts({}).forEach((p) => expect(promptProblems(p.default, p.default)).toBeNull());
    });

    it('refuses a save that breaks a real prompt and names the tags', () => {
        const key = 'entityNameRepair';
        const tags = viewPrompt(key, {})!.requiredTags;
        expect(tags.length).toBeGreaterThan(0);
        const result = savePromptOverride({}, key, 'Pick better names.');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(`<${tags[0]}>`);
        expect(savePromptOverride({}, 'nope', 'x').ok).toBe(false);
    });
});

describe('editable prompts: saving and applying', () => {
    it('applies a saved wording to the registry, its alias and its tier table, and reset restores it', () => {
        const wording = `${DEFAULTS.surgicalProseEditor}\nPrefer the plainest word.`;
        let overrides = mustSave({}, 'surgicalProseEditor', wording);
        applyPromptOverrides(overrides);
        expect(PROMPTS.surgicalProseEditor).toBe(wording);
        expect((PROSE_PROMPTS as Record<string, string>).surgicalProseEditor).toBe(wording);
        expect(getSurgicalPromptForMode(PROMPTS.surgicalProseEditor, false)).toBe(wording);

        const arc = `${DEFAULTS.storyArc}\nKeep the midpoint quiet.`;
        overrides = mustSave(overrides, 'storyArc', arc);
        applyPromptOverrides(overrides);
        expect(PROMPTS.storyArc).toBe(arc);
        expect(PROMPTS.storyArcPlanner).toBe(arc);

        const series = `${SERIES_PROMPTS.seriesArchitect}\nPlan three books.`;
        overrides = mustSave(overrides, 'seriesArchitect', series);
        applyPromptOverrides(overrides);
        expect(SERIES_PROMPTS.seriesArchitect).toBe(series);

        overrides = resetPromptOverride(overrides, 'storyArc');
        applyPromptOverrides(overrides);
        expect(PROMPTS.storyArc).toBe(DEFAULTS.storyArc);
        expect(PROMPTS.storyArcPlanner).toBe(DEFAULTS.storyArc);
        expect(PROMPTS.surgicalProseEditor).toBe(wording);

        applyPromptOverrides({});
        Object.keys(DEFAULTS).forEach((key) => {
            if (key !== 'audioDramaWritingAgent') expect(registry[key]).toBe(DEFAULTS[key]);
        });
    });

    it('leaves the registry byte-identical when nothing is overridden', () => {
        applyPromptOverrides({});
        Object.keys(DEFAULTS).forEach((key) => expect(registry[key]).toBe(DEFAULTS[key]));
    });

    it('feeds the audio drama Writer from an edited modifier', () => {
        const wording = `${DEFAULTS.audioDramaWritingModifier}\nKeep cues short.`;
        applyPromptOverrides(mustSave({}, 'audioDramaWritingModifier', wording));
        expect(PROMPTS.audioDramaWritingAgent.endsWith(wording)).toBe(true);
    });

    it('saving the default wording removes the override', () => {
        const overrides = mustSave({}, 'archivist', `${DEFAULTS.archivist}\nExtra.`);
        expect(viewPrompt('archivist', overrides)?.customized).toBe(true);
        expect(mustSave(overrides, 'archivist', DEFAULTS.archivist)).toEqual({});
    });

    it('keeps a wording through a changed default and flags it', () => {
        const stored = { archivist: { text: `${DEFAULTS.archivist}\nMine.`, defaultHash: 'old', updatedAt: 5 } };
        const view = viewPrompt('archivist', stored)!;
        expect(view.outdated).toBe(true);
        expect(view.problem).toBeNull();
        applyPromptOverrides(stored);
        expect(PROMPTS.archivist).toBe(stored.archivist.text);
    });

    it('falls back to the default when a stored wording no longer has a tag the new default needs', () => {
        const stored = { entityNameRepair: { text: 'Just pick better names.', defaultHash: 'old', updatedAt: 5 } };
        const view = viewPrompt('entityNameRepair', stored)!;
        expect(view.problem).toMatch(/Keep these tags/);
        applyPromptOverrides(stored);
        expect(PROMPTS.entityNameRepair).toBe(DEFAULTS.entityNameRepair);
    });

    it('applies stored overrides when the stores hydrate, after the disk vault filled storage', () => {
        const wording = `${DEFAULTS.archivist}\nFrom disk.`;
        localStorage.setItem(PROMPT_OVERRIDES_STORAGE_KEY, JSON.stringify(mustSave({}, 'archivist', wording)));
        expect(PROMPTS.archivist).toBe(DEFAULTS.archivist);
        hydrateAllStoresFromStorage();
        expect(PROMPTS.archivist).toBe(wording);
    });

    it('stores a fingerprint of the default, not the whole text', () => {
        const overrides = mustSave({}, 'archivist', `${DEFAULTS.archivist}\nMine.`);
        expect(overrides.archivist.defaultHash.length).toBeLessThan(40);
        expect(viewPrompt('archivist', overrides)?.outdated).toBe(false);
    });

    it('reads stored overrides and drops junk', () => {
        const good = { archivist: { text: 'x <a></a>', defaultHash: 'd', updatedAt: 3 } };
        expect(parsePromptOverrides(JSON.stringify({ ...good, nope: { text: 'y' }, storyArc: { text: '' }, actAgent: 7 }))).toEqual(good);
        expect(parsePromptOverrides('not json')).toEqual({});
        expect(parsePromptOverrides(null)).toEqual({});
        expect(parsePromptOverrides([1])).toEqual({});
    });
});

describe('Settings, Prompts tab', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const button = (text: string) =>
        Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

    function type(area: HTMLTextAreaElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(area, value);
            area.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    it('saves a rewording, refuses a broken one, and resets', () => {
        act(() => root.render(<SettingsPromptsTab />));
        act(() => button('Name repair').click());
        const area = container.querySelector('textarea') as HTMLTextAreaElement;
        expect(area.value).toBe(DEFAULTS.entityNameRepair);

        type(area, 'Pick better names.');
        act(() => button('Save').click());
        expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Keep these tags/);
        expect(PROMPTS.entityNameRepair).toBe(DEFAULTS.entityNameRepair);
        expect(localStorage.getItem(PROMPT_OVERRIDES_STORAGE_KEY)).toBeNull();

        const wording = `${DEFAULTS.entityNameRepair}\nNo names starting with K.`;
        type(area, wording);
        act(() => button('Save').click());
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(PROMPTS.entityNameRepair).toBe(wording);
        expect(JSON.parse(localStorage.getItem(PROMPT_OVERRIDES_STORAGE_KEY) || '{}').entityNameRepair.text).toBe(wording);
        expect(container.textContent).toContain('Edited');

        act(() => button('Reset to default').click());
        expect(PROMPTS.entityNameRepair).toBe(DEFAULTS.entityNameRepair);
        expect(JSON.parse(localStorage.getItem(PROMPT_OVERRIDES_STORAGE_KEY) || '{}')).toEqual({});
        expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe(DEFAULTS.entityNameRepair);
    });

    it('filters by search', () => {
        act(() => root.render(<SettingsPromptsTab />));
        const input = container.querySelector('input[type="search"]') as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(input, 'archivist');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(button('Archivist')).toBeTruthy();
        expect(button('The Writer')).toBeUndefined();
    });
});
