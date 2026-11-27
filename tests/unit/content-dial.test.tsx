import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheOrderProblems } from '@/domain/prompt/cacheLayout';
import {
    contentDialFromPreset,
    contentDialPreset,
    contentDialXml,
    getAuthorNoteXml,
    normalizeContentDial
} from '@/domain/story';
import { buildProseContext } from '@/pipeline/proseContext';
import { ContentDialPanel, type ContentDialStory } from '@/views/dashboard/ContentDialPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the content dial', () => {
    it('sets every category from a preset and names the preset back', () => {
        const mature = contentDialFromPreset('mature', ['torture', 'not-a-topic']);
        expect(mature.levels).toEqual({ violence: 2, sex: 2, horror: 2, cruelty: 2, drugs: 2 });
        expect(mature.veils).toEqual(['torture']);
        expect(contentDialPreset(mature)).toBe('mature');
        expect(contentDialPreset({ ...mature, levels: { ...mature.levels, sex: 0 } })).toBe('custom');
        expect(contentDialPreset({ ...mature, levels: { violence: 0, sex: 0, horror: 0, cruelty: 0, drugs: 0 } })).toBe('custom');
    });

    it('cleans a stored dial and reads anything else as no dial', () => {
        expect(normalizeContentDial(undefined)).toBeNull();
        expect(normalizeContentDial({ veils: ['torture'] })).toBeNull();
        expect(normalizeContentDial({ levels: { violence: 9, sex: -2, horror: '1', cruelty: 'x' }, veils: ['self-harm', 'bogus', 'torture'] })).toEqual({
            levels: { violence: 3, sex: 0, horror: 1, cruelty: 3, drugs: 3 },
            veils: ['torture', 'self-harm']
        });
    });

    it('tells the model each level and what fades to black', () => {
        expect(contentDialXml(null)).toBe('');
        const xml = contentDialXml({ levels: { violence: 2, sex: 0, horror: 3, cruelty: 1, drugs: 2 }, veils: ['torture', 'child-harm'] });
        expect(xml).toContain('<content_limits>');
        expect(xml).toContain('- Violence: mature: shown plainly, without lingering.');
        expect(xml).toContain('- Sex: off the page: if it happens, it happens between scenes.');
        expect(xml).toContain('- Horror: unflinching: explicit and on the page, in full.');
        expect(xml).toContain('- Fade to black: torture, harm to children.');
        expect(xml).toContain('A limit is a ceiling, not a target');
        expect(contentDialXml(contentDialFromPreset('restrained'))).not.toContain('Fade to black');
    });

    it('travels with the author note, and alone when there is no note', () => {
        const dial = contentDialFromPreset('restrained');
        expect(getAuthorNoteXml(null)).toBe('');
        expect(getAuthorNoteXml({ author_note: '  ' })).toBe('');
        expect(getAuthorNoteXml({ author_note: 'Keep it dry.' })).toBe('\n<author_note>\nKeep it dry.\n</author_note>\n');
        const both = getAuthorNoteXml({ author_note: 'Keep it dry.', content_dial: dial });
        expect(both.indexOf('<author_note>')).toBeLessThan(both.indexOf('<content_limits>'));
        expect(getAuthorNoteXml({ content_dial: dial })).toContain('- Cruelty: restrained');
    });

    it('reaches the scene-writing prompt in its stable start, only when set', () => {
        const story = (content_dial?: unknown) => ({
            id: 's1',
            cast: [{ id: 'c1', name: 'Mara Vance' }],
            content_dial,
            sequences: [{ number: 1 }],
            scenes: { '0': [{ number: '1.1', title: 'Pier' }] },
            relationships: {},
            lore: []
        });
        const withDial = buildProseContext({ storyToUse: story(contentDialFromPreset('mature', ['torture'])) as never, seq: 0, s: 0 });
        expect(withDial).toContain('- Fade to black: torture.');
        expect(withDial.indexOf('<content_limits>')).toBeLessThan(withDial.indexOf('<story_so_far>'));
        expect(cacheOrderProblems(withDial)).toEqual([]);
        expect(buildProseContext({ storyToUse: story() as never, seq: 0, s: 0 })).not.toContain('<content_limits>');
    });
});

describe('the dial panel', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        document.body.innerHTML = '';
    });

    it('starts unset, takes a preset, one category, a veil, and can be cleared', () => {
        const box: { story: ContentDialStory } = { story: { id: 's1' } };
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        const render = (): void =>
            act(() =>
                root.render(
                    <ContentDialPanel
                        story={box.story}
                        setStory={(updater) => {
                            box.story = updater(box.story);
                            render();
                        }}
                    />
                )
            );
        const change = (select: HTMLSelectElement, value: string): void =>
            act(() => {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        render();
        expect(host.querySelectorAll('select')).toHaveLength(1);

        change(host.querySelector('select[aria-label="Content dial preset"]')!, 'mature');
        expect(normalizeContentDial(box.story.content_dial)?.levels.sex).toBe(2);
        expect(host.querySelectorAll('select')).toHaveLength(6);

        change(host.querySelector('select[aria-label="Sex level"]')!, '0');
        expect(normalizeContentDial(box.story.content_dial)?.levels).toEqual({ violence: 2, sex: 0, horror: 2, cruelty: 2, drugs: 2 });
        expect(host.querySelector<HTMLSelectElement>('select[aria-label="Content dial preset"]')!.value).toBe('custom');

        const veil = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Torture')!;
        act(() => veil.click());
        expect(normalizeContentDial(box.story.content_dial)?.veils).toEqual(['torture']);

        // A preset keeps the veils.
        change(host.querySelector('select[aria-label="Content dial preset"]')!, 'restrained');
        expect(normalizeContentDial(box.story.content_dial)).toEqual({
            levels: { violence: 1, sex: 1, horror: 1, cruelty: 1, drugs: 1 },
            veils: ['torture']
        });

        change(host.querySelector('select[aria-label="Content dial preset"]')!, '');
        expect('content_dial' in box.story).toBe(false);
    });
});
