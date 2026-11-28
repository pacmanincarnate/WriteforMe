import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cleanWorldPart,
    worldAnswerObject,
    worldDraftLore,
    worldPartAsk,
    worldPartProblems,
    type WorldDraft,
    type WorldLand,
    type WorldPast,
    type WorldPowers
} from '@/domain/lore';
import type { PipelineRuntimeContext } from '@/pipeline/context';
import * as lorePipeline from '@/pipeline/lorePipeline';
import { buildWorldFromPitch } from '@/pipeline/worldBuilder';
import { SAFEGUARD_PROMPTS } from '@/prompts';
import { ModelStopError } from '@/services/llm';
import { GeneratedWorldModal } from '@/views/dashboard/GeneratedWorldModal';
import { WorldBuilderPanel } from '@/views/lore/WorldBuilderPanel';

const land = () => ({
    regions: [
        { name: 'The Shoals', summary: 'Tidal flats and stilt towns.' },
        { name: 'High Reach', summary: 'Cliffs where the lighthouses stand' }
    ],
    places: [
        { name: 'Saltgate', region: 'The Shoals', kind: 'town', summary: 'A toll town on the only causeway.' },
        { name: 'Lowmarket', region: 'the shoals', kind: 'village', summary: 'Sells what the tide leaves.' },
        { name: 'The Long Lamp', region: 'High Reach', kind: 'lighthouse', summary: 'Its keepers sell the charts.' },
        { name: 'Wreckers Stair', region: 'High Reach', kind: 'ruin', summary: 'A stair cut by people no one remembers.' }
    ]
});
const powers = (): WorldPowers => ({
    peoples: [{ name: 'Shoalfolk', summary: 'Stilt builders who read the mud.' }],
    factions: [
        { name: 'Lamp Guild', goal: 'Keep the charts secret', holds: ['The Long Lamp'], rivals: ['Causeway Wardens'], allies: [] },
        { name: 'Causeway Wardens', goal: 'Tax every crossing.', holds: ['Saltgate'], rivals: ['Lamp Guild'], allies: [] }
    ]
});
const past = () => ({
    history: [
        { when: 'Ninety years ago', event: 'The Great Tide took the old capital.' },
        { when: 'Forty years ago', event: 'The Lamp Guild bought the last free chart.' },
        { when: 'Last spring', event: 'A warden was found drowned at Saltgate.' }
    ],
    rules: [
        { name: 'The decade tide', rule: 'The sea covers the Shoals once every ten years, and no wall has held it.' },
        { name: 'Charts lie', rule: 'A chart older than a season is wrong.' }
    ]
});
const draft = (): WorldDraft => ({ land: land(), powers: powers(), past: past() });

describe('reading an answer', () => {
    it('finds the object in fences and chatter, and nothing in a useless answer', () => {
        expect(worldAnswerObject('Here you go:\n```json\n{"regions": []}\n```')).toEqual({ regions: [] });
        expect(worldAnswerObject({ regions: [] })).toEqual({ regions: [] });
        for (const bad of ['no', '[1, 2]', '{broken', null, '{"a": }']) expect(worldAnswerObject(bad)).toBeNull();
    });

    it('cleans a part to its shape', () => {
        const cleaned = cleanWorldPart('powers', {
            peoples: [{ name: ' Shoalfolk ', summary: 3 }, 'junk'],
            factions: [{ name: 'Lamp Guild', goal: 'Charts', holds: ['A', 'A', '', 4], rivals: 'none' }]
        }) as WorldPowers;
        expect(cleaned.peoples).toEqual([{ name: 'Shoalfolk', summary: '' }, { name: '', summary: '' }]);
        expect(cleaned.factions[0]).toEqual({ name: 'Lamp Guild', goal: 'Charts', holds: ['A'], rivals: [], allies: [] });
        expect((cleanWorldPart('land', null) as WorldLand).places).toEqual([]);
        expect((cleanWorldPart('land', { places: [{ name: 'X' }] }) as WorldLand).places[0].kind).toBe('place');
        expect((cleanWorldPart('past', { rules: [{ name: 'R', rule: 'r' }] }) as WorldPast).history).toEqual([]);
    });
});

describe('checking a part in code', () => {
    it('accepts a sound world', () => {
        expect(worldPartProblems('land', land(), {}, 'small')).toEqual([]);
        expect(worldPartProblems('powers', powers(), { land: land() }, 'small')).toEqual([]);
        expect(worldPartProblems('past', past(), draft(), 'small')).toEqual([]);
    });

    it('names what is wrong with the land', () => {
        const bad = land();
        bad.places[0].region = 'Nowhere';
        bad.places[1].name = 'The Shoals';
        bad.places[2].summary = '';
        bad.places[3].name = 'the long lamp';
        bad.regions.push({ name: 'Empty Quarter', summary: 'x'.repeat(600) });
        const problems = worldPartProblems('land', bad, {}, 'medium').join('\n');
        expect(problems).toContain('Give 6 to 10 places; there are 4.');
        expect(problems).toContain('Place "Saltgate" names a region that is not listed ("Nowhere").');
        expect(problems).toContain('A place and a region share the name "The Shoals".');
        expect(problems).toContain('The Long Lamp has no "summary".');
        expect(problems).toContain('Place "the long lamp" appears twice.');
        expect(problems).toContain('Region "Empty Quarter" has no place in it.');
        expect(problems).toContain('The summary of Empty Quarter runs past 500 characters.');
    });

    it('holds the factions to the places and to each other', () => {
        const bad = powers();
        bad.factions[0].holds = ['Atlantis'];
        bad.factions[0].rivals = ['Lamp Guild', 'The Nobody'];
        bad.factions[1].allies = ['Lamp Guild'];
        const problems = worldPartProblems('powers', bad, { land: land() }, 'small').join('\n');
        expect(problems).toContain('Faction "Lamp Guild" holds "Atlantis", which is not one of the places.');
        expect(problems).toContain('Faction "Lamp Guild" lists itself as a rival or ally.');
        expect(problems).toContain('Faction "Lamp Guild" names "The Nobody", which is not one of the factions.');
        expect(problems).toContain('Faction "Causeway Wardens" has "Lamp Guild" as both rival and ally.');
        const friendly = powers();
        friendly.factions.forEach((f) => (f.rivals = []));
        expect(worldPartProblems('powers', friendly, { land: land() }, 'small')).toEqual([
            'No faction has a rival. Their goals must pull against each other.'
        ]);
    });

    it('counts the past, and lets two events share a date', () => {
        const thin = past();
        thin.history = [thin.history[0], { ...thin.history[1], when: thin.history[0].when }];
        thin.rules = [];
        expect(worldPartProblems('past', thin, draft(), 'small')).toEqual([
            'Give 3 to 8 history entries; there are 2.',
            'Give 2 to 6 rules; there are 0.'
        ]);
    });
});

describe('asking and turning the world into lore', () => {
    it('shows each ask the pitch, the story, the parts so far and the last problems', () => {
        const context = { pitch: ' A drowned archipelago. ', size: 'large' as const, storyFacts: ['Genre: Fantasy'], knownTopics: ['The Old Capital'] };
        const first = worldPartAsk('land', context, {});
        expect(first).toContain('<pitch>\nA drowned archipelago.\n</pitch>');
        expect(first).toContain('10 to 14 places');
        expect(first).toContain('<story>\nGenre: Fantasy\n</story>');
        expect(first).toContain('<lore_already_in_the_story>\nThe Old Capital\n</lore_already_in_the_story>');
        expect(first).not.toContain('<world_so_far>');
        expect(first).not.toContain('<previous_answer_refused>');
        const second = worldPartAsk('powers', context, { land: land() }, ['Give 4 to 6 factions; there are 1.']);
        expect(second).toContain('- Saltgate (town, The Shoals): A toll town on the only causeway.');
        expect(second).toContain('4 to 6 factions');
        expect(second).toContain('<previous_answer_refused>\nFix these problems:\n- Give 4 to 6 factions; there are 1.');
        expect(worldPartAsk('past', { pitch: 'p', size: 'small' }, draft())).toContain('- Lamp Guild: Keep the charts secret');
    });

    it('makes one lore item for each thing, tied together', () => {
        const lore = worldDraftLore(draft());
        expect(lore).toHaveLength(2 + 4 + 1 + 2 + 3 + 2);
        expect(lore).toContainEqual({
            topic: 'Region: High Reach',
            detail: 'Cliffs where the lighthouses stand. Places: The Long Lamp, Wreckers Stair.'
        });
        expect(lore).toContainEqual({
            topic: 'Place: Saltgate',
            detail: 'A town in The Shoals. A toll town on the only causeway. Held by: Causeway Wardens.'
        });
        expect(lore).toContainEqual({
            topic: 'Faction: Lamp Guild',
            detail: 'Keep the charts secret. Holds: The Long Lamp. Rivals: Causeway Wardens.'
        });
        expect(lore).toContainEqual({ topic: 'History: Last spring', detail: 'A warden was found drowned at Saltgate.' });
        expect(lore).toContainEqual({ topic: 'Rule of the world: Charts lie', detail: 'A chart older than a season is wrong.' });
        expect(worldDraftLore({})).toEqual([]);
    });
});

describe('building the world', () => {
    const run = (
        answers: unknown[],
        story: Record<string, unknown> = { id: 'story-1', title: 'Tidewrack', genre: 'Fantasy', lore: [{ topic: 'The Old Capital', detail: 'Drowned.' }] },
        withRag = false
    ) => {
        let current = story;
        const queue = [...answers];
        const callAI = vi.fn<(...args: unknown[]) => Promise<string>>(async () => {
            const next = queue.shift();
            if (next instanceof Error) throw next;
            return typeof next === 'string' ? next : JSON.stringify(next);
        });
        const steps: string[] = [];
        const ctx = {
            callAI,
            getStory: () => current,
            setStory: (updater: (prev: typeof current) => typeof current) => (current = updater(current)),
            setLoadingStep: (step: string) => steps.push(step),
            ...(withRag
                ? {
                      getEmbeddingService: () => null,
                      setRagStatus: vi.fn(),
                      getRagIndexRevision: () => 0
                  }
                : {})
        } as unknown as PipelineRuntimeContext;
        return { ctx, callAI, steps, story: () => current };
    };

    it('asks for three parts in order, ingests lore directly via ingestLoreBatch, and saves generated_world', async () => {
        const ingestSpy = vi
            .spyOn(lorePipeline, 'ingestLoreBatch')
            .mockImplementation(async (_ctx, items) => items.map((item) => ({ ...item, id: `lore_${item.topic}`, is_merged: false })));
        try {
            const world = run([land(), powers(), past()], undefined, true);
            const result = await buildWorldFromPitch(world.ctx, { pitch: 'A drowned archipelago.', size: 'small' });
            expect(result).toMatchObject({ ok: true, written: 14, added: 14 });
            expect(world.callAI.mock.calls.map((c) => c[3])).toEqual(['World Builder: land', 'World Builder: powers', 'World Builder: past']);
            expect(world.callAI.mock.calls.every((c) => c[1] === SAFEGUARD_PROMPTS.worldBuilder && c[2] === true && c[4] === 'structure')).toBe(true);
            expect(String(world.callAI.mock.calls[0][0])).toContain('Title: Tidewrack');
            expect(String(world.callAI.mock.calls[2][0])).toContain('- Causeway Wardens: Tax every crossing.');
            expect(world.steps[0]).toBe('Building the world: the land…');
            expect(world.steps[world.steps.length - 1]).toBe('');
            expect(ingestSpy).toHaveBeenCalledTimes(1);
            expect(ingestSpy.mock.calls[0][1]).toHaveLength(14);
            expect(ingestSpy.mock.calls[0][2]).toMatchObject({ clearExisting: false, storyId: 'story-1' });
            const storyLore = world.story().lore as Array<Record<string, unknown>>;
            expect(storyLore).toHaveLength(15);
            expect(storyLore[1]).toMatchObject({ topic: 'Region: The Shoals' });
            expect(world.story().generated_world).toMatchObject({
                pitch: 'A drowned archipelago.',
                size: 'small',
                draft: { land: expect.any(Object), powers: expect.any(Object), past: expect.any(Object) }
            });
        } finally {
            ingestSpy.mockRestore();
        }
    });

    it('asks again with the problems, once, and gives up without adding anything', async () => {
        const broken = powers();
        broken.factions[0].holds = ['Atlantis'];
        const retried = run([land(), broken, powers(), past()]);
        expect(await buildWorldFromPitch(retried.ctx, { pitch: 'p', size: 'small' })).toMatchObject({ ok: true, added: 14 });
        expect(retried.callAI.mock.calls[2][3]).toBe('World Builder: powers (retry)');
        expect(String(retried.callAI.mock.calls[2][0])).toContain('holds "Atlantis", which is not one of the places');

        const failed = run(['not json', broken]);
        const tooSmall = await buildWorldFromPitch(failed.ctx, { pitch: 'p', size: 'huge' });
        expect(tooSmall).toMatchObject({ ok: false, part: 'land' });
        expect(failed.callAI).toHaveBeenCalledTimes(2);
        expect(failed.story().lore).toHaveLength(1);
        expect(failed.story().generated_world).toBeUndefined();
        expect(failed.steps[failed.steps.length - 1]).toBe('');
    });

    it('needs a pitch, and reports a stop or a failure', async () => {
        const none = run([]);
        expect(await buildWorldFromPitch(none.ctx, { pitch: '  ' })).toMatchObject({ ok: false });
        expect(none.callAI).not.toHaveBeenCalled();
        expect(await buildWorldFromPitch(run([land(), new ModelStopError()]).ctx, { pitch: 'p', size: 'small' })).toEqual({
            ok: false,
            problem: 'Stopped. Nothing was added.'
        });
        expect(await buildWorldFromPitch(run([new Error('timeout')]).ctx, { pitch: 'p' })).toEqual({ ok: false, problem: 'timeout' });
    });
});

describe('the panel on the Lore page and Overview modal', () => {
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

    const type = (value: string): void => {
        const area = host.querySelector('textarea') as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(area, value);
            area.dispatchEvent(new Event('input', { bubbles: true }));
        });
    };
    const press = async (): Promise<void> => {
        await act(async () => {
            (host.querySelector('button') as HTMLButtonElement).click();
        });
    };

    it('sends the pitch and size, and says what happened', async () => {
        const buildWorld = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, draft: {}, written: 14, added: 14 })
            .mockResolvedValueOnce({ ok: false, problem: 'The model could not do it.' });
        const showToast = vi.fn();
        act(() => root.render(<WorldBuilderPanel buildWorld={buildWorld} showToast={showToast} />));
        const button = host.querySelector('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        type('A drowned archipelago.');
        expect(button.disabled).toBe(false);
        const select = host.querySelector('select') as HTMLSelectElement;
        act(() => {
            select.value = 'large';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await press();
        expect(buildWorld).toHaveBeenCalledWith({ pitch: 'A drowned archipelago.', size: 'large' });
        expect(showToast).toHaveBeenCalledWith('The world is built: 14 lore entries added and indexed for the story.', 'success');
        expect(host.querySelector('[role="alert"]')).toBeNull();
        await press();
        expect(host.querySelector('[role="alert"]')?.textContent).toBe('The model could not do it.');
    });

    it('renders the Generated World modal with regions, places, peoples, factions, history, and rules', () => {
        const onClose = vi.fn();
        act(() =>
            root.render(
                <GeneratedWorldModal
                    isOpen={true}
                    generatedWorld={{ pitch: 'A drowned archipelago.', size: 'small', draft: draft() }}
                    onClose={onClose}
                />
            )
        );
        expect(host.textContent).toContain('Generated World');
        expect(host.textContent).toContain('A drowned archipelago.');
        expect(host.textContent).toContain('The Shoals');
        expect(host.textContent).toContain('Saltgate');
        expect(host.textContent).toContain('Shoalfolk');
        expect(host.textContent).toContain('Lamp Guild');
        expect(host.textContent).toContain('The Great Tide took the old capital.');
        expect(host.textContent).toContain('Charts lie');
        act(() => {
            (host.querySelector('button[aria-label="Close generated world viewer"]') as HTMLButtonElement).click();
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
