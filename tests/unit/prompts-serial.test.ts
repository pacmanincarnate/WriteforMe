import { afterEach, describe, expect, it } from 'vitest';
import { createSerialInfo, formatLongformContinuityAddendum, formatLongformSceneDirectives, type SerialStory } from '@/domain/serial';
import { createSeriesOpener } from '@/domain/series';
import { SERIAL_PROMPTS } from '@/prompts';
import { applyPromptOverrides, listEditablePrompts, savePromptOverride, type PromptOverrides } from '@/prompts/overrides';

const DEFAULTS = { ...SERIAL_PROMPTS };

function story(): SerialStory {
    return {
        id: 'arc1',
        title: 'The Harbour',
        series: createSeriesOpener('The Harbour Serial', 'The Harbour', 1),
        serial: createSerialInfo(),
        cast: [{ name: 'Mara', corner_role: 'MAIN_CHARACTER' }],
        threads: [{ id: 'T1', name: 'The harbour fire' }],
        sequences: Array.from({ length: 8 }, (_, i) => ({ number: i + 1 })),
        open_threads: []
    } as unknown as SerialStory;
}

function save(key: string, wording: string): PromptOverrides {
    const res = savePromptOverride({}, key, wording);
    if (!res.ok) throw new Error(res.error);
    return res.overrides;
}

afterEach(() => applyPromptOverrides({}));

describe('editable serial prompts', () => {
    it('lists the serial wording in its own group', () => {
        const serial = listEditablePrompts({}).filter((p) => p.group === 'Serial fiction');
        expect(serial.map((p) => [p.key, p.label])).toEqual([
            ['serialEpisodePlanner', 'Serial episode planner'],
            ['serialEpisodeWriter', 'Serial episode writer'],
            ['serialContinuity', 'Serial thread tracking']
        ]);
        expect(serial.every((p) => p.description && !p.customized)).toBe(true);
    });

    it('puts the shipped wording into the planner, Writer and Archivist blocks', () => {
        const planner = formatLongformSceneDirectives(story(), 1, 'planner', 8);
        expect(planner).toContain(`<serial_episodes sequence="1">\n${DEFAULTS.serialEpisodePlanner}\nSequence 1 holds episodes 1, 2.`);
        // The planner reads the rules once, not once per episode.
        expect(planner.match(/A parked thread gets an exit/g)?.length).toBe(1);
        const prose = formatLongformSceneDirectives(story(), 1, 'prose', 8, { index: 0, count: 4 });
        expect(prose).toContain(`${DEFAULTS.serialEpisodeWriter}\n</serial_context>`);
        expect(formatLongformContinuityAddendum(story()).endsWith(`${DEFAULTS.serialContinuity}\n`)).toBe(true);
    });

    it('uses a saved wording in the next prompt and the default again after a reset', () => {
        applyPromptOverrides({
            ...save('serialEpisodePlanner', 'Plan each episode as a short story of its own.'),
            ...save('serialEpisodeWriter', 'End on a question.')
        });
        expect(formatLongformSceneDirectives(story(), 1, 'planner', 8)).toContain('<serial_episodes sequence="1">\nPlan each episode as a short story of its own.\nSequence 1 holds');
        const prose = formatLongformSceneDirectives(story(), 1, 'prose', 8, { index: 0, count: 4 });
        expect(prose).toContain('End on a question.\n</serial_context>');
        expect(prose).not.toContain('Move only the listed threads');
        applyPromptOverrides({});
        expect(formatLongformSceneDirectives(story(), 1, 'planner', 8)).toContain(DEFAULTS.serialEpisodePlanner);
    });

    it('refuses a tracking wording that drops the field or the tag the app reads', () => {
        const noField = savePromptOverride({}, 'serialContinuity', '<serial_tracking>Report parked threads.</serial_tracking>');
        expect(noField.ok).toBe(false);
        const noTag = savePromptOverride({}, 'serialContinuity', DEFAULTS.serialContinuity.replace(/<\/?serial_tracking>/g, ''));
        expect(noTag.ok).toBe(false);
        expect(savePromptOverride({}, 'serialContinuity', `${DEFAULTS.serialContinuity}\nBe strict.`).ok).toBe(true);
    });

    it('leaves a story that is not a serial without any of it', () => {
        const book = { id: 'b', series: createSeriesOpener('S', 'B', 1), open_threads: [] };
        expect(formatLongformContinuityAddendum(book)).not.toContain('serial_tracking');
        expect(formatLongformSceneDirectives({ id: 'solo' }, 1, 'planner', 8)).toBe('');
    });
});
