import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    acceptableDeadRewrite,
    deadCharacters,
    deadNamedParagraphs,
    namedDead,
    stateSaysDead,
    withParagraphsReplaced
} from '@/domain/continuity/deadCharacters';
import type { PipelineRuntimeContext } from '@/pipeline/context';
import { checkSceneForTheDead } from '@/pipeline/deadCheck';
import { ModelStopError } from '@/services/llm';
import { normalizeFeatureOptions, useFeatureOptionsStore } from '@/stores';
import { DeadRecordPanel } from '@/views/cast/DeadRecordPanel';

const story = () => ({
    cast: [
        { id: 'c1', name: 'Mara Vance' },
        { id: 'c2', name: 'Dov Hale' },
        { id: 'c3', name: 'Pell', deceased: true },
        { id: 'c4', name: 'Dov Marsh', status: 'Dead' },
        { id: 'c5', name: 'Ines Roe', deceased: false },
        null
    ],
    character_states: {
        'Dov Hale': { physical_state: 'Killed at the breakwater. His body lies in the harbor office.' },
        'Mara Vance': { physical_state: 'Dead tired, bruised ribs.' },
        'Ines Roe': { physical_state: 'Dead.' }
    },
    serial: { roster: [{ name: 'Old Tam', status: 'dead' }, { name: 'Ines Roe', status: 'dead' }, { name: 'Kit', status: 'active' }] }
});

describe('the record of the dead', () => {
    it('reads a state only when it says so plainly', () => {
        for (const dead of ['Dead.', 'Deceased; buried at sea', 'Killed at the bridge', 'A corpse on the quay']) {
            expect(stateSaysDead(dead)).toBe(true);
        }
        for (const alive of [
            'Presumed dead by the garrison',
            'Left for dead, breathing',
            'Nearly killed, arm broken',
            'Dead tired',
            'Not dead',
            'Healthy. Later killed a man.',
            'Wishes he were dead',
            '',
            null
        ]) {
            expect(stateSaysDead(alive)).toBe(false);
        }
    });

    it('takes the author first, then the story state, then the roster', () => {
        expect(deadCharacters(story())).toEqual([
            { name: 'Dov Hale', source: 'state' },
            { name: 'Pell', source: 'author' },
            { name: 'Dov Marsh', source: 'state' },
            { name: 'Old Tam', source: 'roster' }
        ]);
        expect(deadCharacters(null)).toEqual([]);
        expect(deadCharacters({})).toEqual([]);
    });
});

describe('finding the dead in a scene', () => {
    it('matches full names and unshared first names, as whole words', () => {
        expect(namedDead(['Dov Hale'], 'Dov laughed.')).toEqual(['Dov Hale']);
        expect(namedDead(['Dov Hale'], 'dov hale laughed.')).toEqual(['Dov Hale']);
        expect(namedDead(['Dov Hale'], 'The Dovecote was empty.')).toEqual([]);
        // A first name a living character shares names no one for certain.
        expect(namedDead(['Dov Hale'], 'Dov laughed.', ['Dov Marsh'])).toEqual([]);
        expect(namedDead(['Dov Hale'], 'Dov Hale laughed.', ['Dov Marsh'])).toEqual(['Dov Hale']);
        expect(namedDead(['Dov Hale', 'Dov Marsh'], 'Dov Marsh lay still.')).toEqual(['Dov Marsh']);
        expect(namedDead(['Dov Hale', 'Dov Marsh'], 'Dov lay still.')).toEqual(['Dov Hale', 'Dov Marsh']);
        expect(namedDead(['Al Reed', 'the ferryman'], 'Al and the ferryman.')).toEqual(['the ferryman']);
        expect(namedDead(['Pell'], 'Pell-mell they ran. Spell it.')).toEqual([]);
        expect(namedDead([' '], 'Anything')).toEqual([]);
    });

    it('flags only the paragraphs that name them and puts the scene back exactly', () => {
        const scene = '\nMara counted.\n\n  Pell came in.\n\n\nShe looked up at Pell.\n';
        const flagged = deadNamedParagraphs(scene, ['Pell']);
        expect(flagged.map((p) => p.index)).toEqual([1, 2]);
        expect(deadNamedParagraphs(scene, [])).toEqual([]);
        expect(withParagraphsReplaced(scene, new Map())).toBe(scene);
        expect(withParagraphsReplaced(scene, new Map([[1, 'The door stayed shut.']]))).toBe(
            '\nMara counted.\n\n  The door stayed shut.\n\n\nShe looked up at Pell.\n'
        );
    });

    it('refuses a rewrite that is empty, the same, split, a stub or an expansion', () => {
        const original = 'Pell came in and set the lamp on the table.';
        expect(acceptableDeadRewrite(original, 'No one came in. The lamp stayed dark.')).toBe(true);
        expect(acceptableDeadRewrite(original, '  ')).toBe(false);
        expect(acceptableDeadRewrite(original, ` ${original} `)).toBe(false);
        expect(acceptableDeadRewrite(original, 'No one came.\n\nThe lamp stayed dark.')).toBe(false);
        expect(acceptableDeadRewrite(original, 'No.')).toBe(false);
        expect(acceptableDeadRewrite(original, 'word '.repeat(40))).toBe(false);
    });
});

describe('checking a written scene', () => {
    const context = (callAI: (...args: unknown[]) => Promise<unknown>) => ({ callAI }) as unknown as PipelineRuntimeContext;
    const setOn = (on: boolean): void => useFeatureOptionsStore.getState().setOption('deadCharacterCheck', on as never);
    const prose = 'Mara counted the tolls.\n\nPell came in and set the lamp on the table.\n\nShe thought of Dov Hale and said nothing.';
    const params = (scene: Record<string, unknown> = {}, text = prose) => ({ story: story(), scene, prose: text, label: 'Dead Check' });

    beforeEach(() => setOn(true));
    afterEach(() => {
        setOn(true);
        vi.restoreAllMocks();
    });

    it('is on by default and costs nothing when off or when no one dead is named', async () => {
        expect(normalizeFeatureOptions({}).deadCharacterCheck).toBe(true);
        expect(normalizeFeatureOptions({ deadCharacterCheck: false }).deadCharacterCheck).toBe(false);
        const callAI = vi.fn();
        const clean = await checkSceneForTheDead(context(callAI), params({}, 'Mara counted the tolls.'));
        expect(clean).toMatchObject({ checked: true, named: [], flagged: 0, rewritten: 0 });
        const noDead = await checkSceneForTheDead(context(callAI), { ...params(), story: { cast: [{ name: 'Pell' }] } });
        expect(noDead.checked).toBe(false);
        setOn(false);
        expect((await checkSceneForTheDead(context(callAI), params())).checked).toBe(false);
        expect(callAI).not.toHaveBeenCalled();
    });

    it('sends only the paragraphs that name the dead and replaces what was rewritten', async () => {
        const callAI = vi.fn<(...args: unknown[]) => Promise<string>>(
            async () => '<passage n="1">No one came in. The lamp stayed dark on the table.</passage>\n<passage n="2">UNCHANGED</passage>'
        );
        const result = await checkSceneForTheDead(context(callAI), params());
        const [prompt, system, json, label, role] = callAI.mock.calls[0];
        expect(String(prompt)).toContain('<dead>\nPell\nDov Hale\n</dead>');
        expect(String(prompt)).toContain('<passage n="1">\nPell came in');
        expect(String(prompt)).not.toContain('counted the tolls');
        expect(String(system)).toContain('UNCHANGED');
        expect([json, label, role]).toEqual([false, 'Dead Check', 'review']);
        expect(result).toMatchObject({ named: ['Pell', 'Dov Hale'], flagged: 2, rewritten: 1, checked: true });
        expect(result.prose).toBe(
            'Mara counted the tolls.\n\nNo one came in. The lamp stayed dark on the table.\n\nShe thought of Dov Hale and said nothing.'
        );
    });

    it('leaves alone the dead the plan asks for', async () => {
        const callAI = vi.fn(async () => '<passage n="1">UNCHANGED</passage>');
        const planned = await checkSceneForTheDead(
            context(callAI),
            params({ scene_events: 'Mara remembers the night Pell taught her the knots.', cast_names: ['Mara Vance', { name: 'Dov Hale' }] })
        );
        expect(planned).toMatchObject({ checked: true, named: [], flagged: 0 });
        expect(callAI).not.toHaveBeenCalled();
    });

    it('keeps the scene when the answer is useless or the call fails, and stops when the user stops', async () => {
        const useless = await checkSceneForTheDead(context(vi.fn(async () => 'Looks fine to me.')), params());
        expect(useless).toMatchObject({ prose, rewritten: 0, flagged: 2 });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const failed = await checkSceneForTheDead(
            context(
                vi.fn(async () => {
                    throw new Error('timeout');
                })
            ),
            params()
        );
        expect(failed).toMatchObject({ prose, rewritten: 0, checked: true });
        await expect(
            checkSceneForTheDead(
                context(
                    vi.fn(async () => {
                        throw new ModelStopError();
                    })
                ),
                params()
            )
        ).rejects.toBeInstanceOf(ModelStopError);
    });
});

describe('the record on the Cast page', () => {
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('shows who is dead and why, and lets the author overrule it', () => {
        let current: ReturnType<typeof story> = story();
        const setStory = (updater: (prev: typeof current) => typeof current): void => {
            current = updater(current);
        };
        const render = (): void => act(() => root.render(<DeadRecordPanel story={current} setStory={setStory} />));
        render();
        expect(host.textContent).toContain('Who Is Dead (4)');
        expect(host.textContent).toContain('Pell: dead, you marked them dead');
        expect(host.textContent).toContain('Dov Hale: dead, the story state says so');
        expect(host.textContent).toContain('Ines Roe: alive');

        const select = (name: string) => host.querySelector(`select[aria-label="Record for ${name}"]`) as HTMLSelectElement;
        const choose = (name: string, value: string): void => {
            const el = select(name);
            act(() => {
                el.value = value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            render();
        };
        expect(select('Pell').value).toBe('dead');
        choose('Dov Hale', 'alive');
        expect(current.cast[1]).toMatchObject({ deceased: false });
        expect(host.textContent).toContain('Dov Hale: alive');
        choose('Pell', 'story');
        expect(current.cast[2]).not.toHaveProperty('deceased');
        choose('Mara Vance', 'dead');
        expect(deadCharacters(current).map((d) => d.name)).toContain('Mara Vance');
    });

    it('shows nothing for a story with no cast', () => {
        act(() => root.render(<DeadRecordPanel story={{ cast: [] }} setStory={() => undefined} />));
        expect(host.innerHTML).toBe('');
    });
});
