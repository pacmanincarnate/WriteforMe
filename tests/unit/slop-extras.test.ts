import { describe, expect, it } from 'vitest';
import {
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    buildEffectiveSlopData,
    detectRepeatedPhrases,
    exportSlopConfigAsJson,
    formatSlopAuditForPrompt,
    phraseHabitsLine,
    recentScenePassages,
    scanTextForSlop
} from '@/domain/slop';
import { buildProseContext } from '@/pipeline/proseContext';
import { useFeatureOptionsStore } from '@/stores';

const passage = (id: string, text: string) => ({ id, text });

describe('repeated phrases', () => {
    it('finds a phrase used three times and reports the longest form once', () => {
        const text =
            'She felt the weight of it settle. He carried the weight of it home. ' +
            'Nobody spoke about the weight of it again. The rain kept on.';
        const found = detectRepeatedPhrases([passage('a', text)]);
        expect(found.map((f) => f.phrase)).toEqual(['the weight of it']);
        expect(found[0].count).toBe(3);
        expect(found[0].words).toBe(4);
        expect(text.slice(found[0].spans[0].start, found[0].spans[0].end)).toBe('the weight of it');
    });

    it('ignores phrases made only of common words, and phrases across a sentence break', () => {
        const text =
            'It was in the house. It was in the yard. It was in the car. ' +
            'He ran. Fast the dog. He ran. Fast the cat. He ran. Fast the bird.';
        expect(detectRepeatedPhrases([passage('a', text)])).toEqual([]);
    });

    it('does not count a phrase that is only a name', () => {
        const text = 'Then Mara Voss said no. Later Mara Voss said yes. Still Mara Voss said nothing at all.';
        expect(detectRepeatedPhrases([passage('a', text)]).length).toBeGreaterThan(0);
        expect(detectRepeatedPhrases([passage('a', text)], { ignoreWords: ['Mara Voss'] })).toEqual([]);
    });

    it('counts how many passages hold a phrase', () => {
        const scenes = [
            passage('0-0', 'Something like relief moved through her.'),
            passage('0-1', 'He felt something like relief at the door.'),
            passage('0-2', 'It was something like relief, or its cousin.'),
            passage('0-3', 'The harbour was quiet.')
        ];
        const found = detectRepeatedPhrases(scenes);
        expect(found[0].phrase).toBe('something like relief');
        expect(found[0].passageCount).toBe(3);
        expect(phraseHabitsLine(scenes)).toBe(
            'Wording the recent scenes keep reusing: "something like relief" (3 of the last 4 scenes). ' +
                'Do not use these phrases in this scene; say it another way.'
        );
        // Three uses inside one scene are that scene's business, not a habit across scenes.
        expect(
            phraseHabitsLine([
                passage('0-0', 'A breath she had not known. A breath she had not known. A breath she had not known.'),
                passage('0-1', 'Nothing.'),
                passage('0-2', 'Nothing else.')
            ])
        ).toBe('');
        expect(phraseHabitsLine(scenes.slice(0, 2))).toBe('');
    });

    it('picks the scenes just before the one being written, in story order', () => {
        const prose = {
            '0-0': { final: 'one' },
            '0-1': 'two',
            '1-0': { final: 'three' },
            '1-1': { final: 'four' },
            '1-2': { final: '' },
            '10-0': { final: 'later' },
            notes: { final: 'ignored' }
        };
        expect(recentScenePassages(prose, 1, 1).map((p) => p.text)).toEqual(['one', 'two', 'three']);
        expect(recentScenePassages(prose, 1, 1, 2).map((p) => p.id)).toEqual(['0-1', '1-0']);
        expect(recentScenePassages(null, 1, 1)).toEqual([]);
    });
});

describe('the slop scan', () => {
    it('warns about a phrase repeated inside a scene', () => {
        const text =
            'She let out a breath she had not known she was holding. The room waited.\n\n' +
            'He let out a breath she had not known he had. Was it true?\n\n' +
            'They shared a breath she had not known existed; nobody moved.';
        const report = scanTextForSlop(text);
        const hit = report.densityHits.find((h) => h.categoryId === 'repeated_phrase');
        expect(hit?.match).toBe('a breath she had not known');
        expect(formatSlopAuditForPrompt(report)).toContain('"a breath she had not known" (used 3 times)');
    });

    it('carries the Wikipedia signs: word lists and patterns', () => {
        const ids = AI_SLOP_REGISTRY.categories.map((c) => c.id);
        expect(ids).toEqual(expect.arrayContaining(['wiki_significance', 'wiki_vocabulary', 'wiki_chatbot']));
        // No word is listed twice across the whole registry.
        const all = AI_SLOP_REGISTRY.categories.flatMap((c) => c.items.map((i) => i.toLowerCase()));
        const wiki = AI_SLOP_REGISTRY.categories
            .filter((c) => c.id.startsWith('wiki_'))
            .flatMap((c) => c.items.map((i) => i.toLowerCase()));
        for (const item of wiki) expect(all.filter((x) => x === item).length, item).toBe(1);

        const report = scanTextForSlop(
            'The tower stands as a promise to the city, underscoring how far they had come. ' +
                'It was not just a building but a wound. No guards, no gates, just wind.'
        );
        expect(report.flagHits.map((h) => h.match.toLowerCase())).toContain('stands as');
        const patterns = report.patternHits.map((h) => h.categoryId);
        expect(patterns).toEqual(expect.arrayContaining(['wiki_ing_tail', 'wiki_not_just', 'wiki_no_no_just']));
    });

    it('treats a chatbot preamble and an unfilled placeholder as hard defects', () => {
        const preamble = scanTextForSlop("Here's the revised scene:\n\nMara closed the ledger room door.");
        expect(preamble.hardHits.map((h) => h.categoryId)).toContain('wiki_here_is');
        const placeholder = scanTextForSlop('Mara walked to [insert location here] and waited.');
        expect(placeholder.hardHits.map((h) => h.categoryId)).toContain('wiki_placeholder');
        // A narrator may open with "Here's the thing", and a character may agree with another.
        const fine = scanTextForSlop('Here\'s the thing about my father. "You\'re absolutely right," he said.');
        expect(fine.hardHits.filter((h) => h.categoryId.startsWith('wiki_'))).toEqual([]);
        // The same words in narration are the model talking.
        const leaked = scanTextForSlop("You're absolutely right, the scene needed more tension. Mara ran.");
        expect(leaked.hardHits.map((h) => h.categoryId)).toContain('wiki_chatbot');
    });

    it('keeps a pattern regex through the effective data and the export, and survives a bad one', () => {
        const eff = buildEffectiveSlopData(DEFAULT_SLOP_CONFIG);
        expect(eff.patterns.find((p) => p.id === 'wiki_not_just')?.regex).toBeTruthy();
        expect(exportSlopConfigAsJson(DEFAULT_SLOP_CONFIG).patterns.find((p) => p.id === 'wiki_ing_tail')?.regex).toBeTruthy();

        const withBad = {
            ...DEFAULT_SLOP_CONFIG,
            importedPack: {
                categories: [],
                patterns: [
                    { id: 'bad', title: 'Broken', severity: 'flag' as const, regex: '([unclosed' },
                    { id: 'sighs', title: 'Sighing', severity: 'flag' as const, regex: '\\bsighed\\b', flags: 'i' }
                ]
            }
        };
        const report = scanTextForSlop('He sighed. She Sighed. The door did not.', { slopConfig: withBad });
        expect(report.patternHits.filter((h) => h.categoryId === 'sighs').length).toBe(2);
    });

    it('can be switched off per rule', () => {
        const text = 'The weight of it. The weight of it. The weight of it, again?';
        const off = {
            ...DEFAULT_SLOP_CONFIG,
            categorySeverities: { ...DEFAULT_SLOP_CONFIG.categorySeverities, repeated_phrase: 'off' as const }
        };
        expect(scanTextForSlop(text).densityHits.some((h) => h.categoryId === 'repeated_phrase')).toBe(true);
        expect(scanTextForSlop(text, { slopConfig: off }).densityHits.some((h) => h.categoryId === 'repeated_phrase')).toBe(false);
    });
});

describe('the writer prompt', () => {
    const story = {
        cast: [{ name: 'Mara Voss' }],
        prose: {
            '0-0': { final: 'Mara Voss felt something like relief. Mara Voss said so.' },
            '0-1': { final: 'There was something like relief in it. Mara Voss said so.' },
            '0-2': { final: 'Something like relief, again. Mara Voss said so.' }
        }
    };

    it('names the phrases recent scenes keep reusing, and not the cast', () => {
        useFeatureOptionsStore.getState().setOption('phraseHabitWatch', true);
        const prompt = buildProseContext({ storyToUse: story as never, seq: 0, s: 3 });
        expect(prompt).toContain('<phrase_habits>');
        expect(prompt).toContain('"something like relief" (3 of the last 3 scenes)');
        expect(prompt).not.toContain('"mara voss said so"');
    });

    it('says nothing when the option is off or nothing repeats', () => {
        useFeatureOptionsStore.getState().setOption('phraseHabitWatch', false);
        expect(buildProseContext({ storyToUse: story as never, seq: 0, s: 3 })).not.toContain('<phrase_habits>');
        useFeatureOptionsStore.getState().setOption('phraseHabitWatch', true);
        expect(buildProseContext({ storyToUse: story as never, seq: 0, s: 1 })).not.toContain('<phrase_habits>');
    });
});
