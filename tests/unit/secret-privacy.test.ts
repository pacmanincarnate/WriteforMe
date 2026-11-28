import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProseContext, type CallAiFn, type PipelineRuntimeContext, type PipelineStory } from '@/pipeline';
import { checkSceneForSecretLeaks, parseSecretLeaks, unrevealedSecretsAt } from '@/pipeline/secretLeak';
import {
    compileActiveState,
    scrubSecretFromText,
    sentenceTellsSecret,
    tellingWords,
    textTellsSecret
} from '@/domain/continuity';
import { DEFAULT_FEATURE_OPTIONS, useFeatureOptionsStore } from '@/stores';

/**
 * Sentinel tests: a made-up word is planted in a secret's truth, and no prompt built before the
 * reveal may contain it. The word cannot occur by accident, so one hit is a leak.
 */
const SENTINEL = 'ZXQSENTINEL';
const TRUTH = `Mara Quillon forged the harbor ledger to hide the ${SENTINEL} shipment`;
const REWORDED = `The harbor ledger was forged by Mara, hiding the ${SENTINEL} shipment.`;

type ProseParams = Parameters<typeof buildProseContext>[0];

function proseParams(overrides: { status?: string; revealSeq?: number; seqNumber?: number; act?: number } = {}): ProseParams {
    const seqNumber = overrides.seqNumber ?? 1;
    return {
        storyToUse: {
            secret_vault: [
                {
                    id: 'SEC1',
                    status: overrides.status ?? 'hidden',
                    truth: TRUTH,
                    title: 'The Forged Ledger',
                    reveal_anchor: { act_number: 3, sequence_number: overrides.revealSeq ?? 7 }
                }
            ],
            acts: [{ number: overrides.act ?? 1, title: 'Harbor', act_mandate: `Establish the docks. ${REWORDED} Nobody suspects The Forged Ledger.` }]
        },
        scene: { title: 'Dock at dawn', pov_character: 'Tom Reyes' },
        sequenceData: { number: seqNumber, parent_act: overrides.act ?? 1, title: 'Arrivals' },
        s: 0,
        seq: seqNumber - 1,
        activeCast: [
            { id: 'C1', name: 'Tom Reyes', details: { deep_profile: 'Tom trusts the harbor office too much. He counts crates twice.' } },
            { id: 'C2', name: 'Mara Quillon', details: { deep_profile: `She smiles at inspectors. ${TRUTH}. She sleeps badly.` }, interview_psychology: `I keep books. ${REWORDED} That is all.` },
            { id: 'C3', name: 'Ilse Brandt', details: { deep_profile: `Ilse runs the night shift. ${REWORDED} She says nothing.`, sheet: `NOTES\nIlse keeps a spare key. ${REWORDED}` } }
        ]
    } as unknown as ProseParams;
}

describe('secret scrub: words', () => {
    it('finds the words that carry a truth, without names or filler', () => {
        const telling = tellingWords(TRUTH, ['Mara Quillon']);
        expect(telling).toEqual(expect.arrayContaining(['forg', 'harbor', 'ledger', 'hide', 'shipment']));
        expect(telling).not.toContain('mara');
        expect(telling).not.toContain('quillon');
    });

    it('reads a sentence as telling the secret only when it carries most of those words', () => {
        const telling = tellingWords(TRUTH, ['Mara Quillon']);
        expect(sentenceTellsSecret(REWORDED, telling)).toBe(true);
        expect(sentenceTellsSecret('The harbor was loud that morning.', telling)).toBe(false);
        expect(sentenceTellsSecret('Tom signed the ledger and left.', telling)).toBe(false);
    });

    it('replaces the exact truth and a reworded sentence, and leaves the rest', () => {
        const text = `She smiles. ${TRUTH}. Later: ${REWORDED} Tom signed the ledger and left.`;
        const out = scrubSecretFromText(text, { truth: TRUTH }, { placeholder: '[Withheld]', ignoreWords: ['Mara Quillon'] });
        expect(out).not.toContain(SENTINEL);
        expect(out).toContain('She smiles.');
        expect(out).toContain('Tom signed the ledger and left.');
        expect(textTellsSecret(out, TRUTH, ['Mara Quillon'])).toBe(false);
        expect(textTellsSecret(text, TRUTH, ['Mara Quillon'])).toBe(true);
    });

    it('leaves text alone for a truth too short to match safely', () => {
        expect(scrubSecretFromText('He lied.', { truth: 'lied' }, { placeholder: '[x]' })).toBe('He lied.');
    });
});

describe('secret privacy: the Writer prompt', () => {
    it('never carries an unrevealed secret, exact or reworded', () => {
        const out = buildProseContext(proseParams());
        expect(out).not.toContain(SENTINEL);
        expect(out).not.toContain('The Forged Ledger');
        // The rest of each sheet is still there.
        expect(out).toContain('She smiles at inspectors.');
        expect(out).toContain('Ilse runs the night shift.');
        expect(out).toContain('He counts crates twice.');
        // An imported character sheet is shown to the Writer too, scrubbed the same way.
        expect(out).toContain('<character_sheet name="Ilse Brandt">');
        expect(out).toContain('Ilse keeps a spare key.');
    });

    it('carries it once the secret is revealed', () => {
        expect(buildProseContext(proseParams({ status: 'revealed' }))).toContain(SENTINEL);
    });

    it('carries it once the story reaches the reveal sequence', () => {
        expect(buildProseContext(proseParams({ revealSeq: 3, seqNumber: 3, act: 3 }))).toContain(SENTINEL);
    });
});

describe('secret privacy: the character state block', () => {
    it('keeps an unrevealed secret out of emotional state and tension lines', () => {
        const story = {
            cast: [{ id: 'C2', name: 'Mara Quillon' }],
            secret_vault: [{ status: 'hidden', truth: TRUTH, reveal_anchor: { sequence_number: 7 } }],
            character_states: {
                C2: { name: 'Mara Quillon', emotional_state: `Afraid. ${REWORDED}`, unresolved_tension: TRUTH }
            },
            sequences: [{ number: 1 }]
        };
        const block = compileActiveState(story as never, { sequence: 1, characters_present: ['Mara Quillon'] }, [], { sequence: 1 });
        expect(String(block)).not.toContain(SENTINEL);
        expect(String(block)).toContain('Afraid.');
    });
});

describe('leak judge', () => {
    afterEach(() => useFeatureOptionsStore.setState({ options: { ...DEFAULT_FEATURE_OPTIONS } }));

    const PROSE = `${'The gulls wheeled over the cranes while Tom counted crates and wrote each number down in the book. '.repeat(3)}Ilse leaned close. "She cooked the books so nobody would look for that cargo," she said. Tom laughed it off and went back to counting.`;
    const story: PipelineStory = {
        secret_vault: [{ id: 'SEC1', status: 'hidden', truth: TRUTH, reveal_anchor: { sequence_number: 7 } }]
    };

    function makeCtx(callAI: CallAiFn): PipelineRuntimeContext {
        return { callAI } as unknown as PipelineRuntimeContext;
    }

    it('lists the secrets a reader must not know yet', () => {
        expect(unrevealedSecretsAt(story, 1)).toHaveLength(1);
        expect(unrevealedSecretsAt(story, 7)).toHaveLength(0);
        expect(unrevealedSecretsAt({ secret_vault: [{ status: 'revealed', truth: TRUTH }] }, 1)).toHaveLength(0);
    });

    it('keeps only quotes that are really in the scene', () => {
        const raw = `<leaks>
<leak><secret_id>SEC1</secret_id><quote>"She cooked the books so nobody would look for that cargo,"</quote><why>States the forgery.</why></leak>
<leak><secret_id>SEC1</secret_id><quote>Mara forged the ledger</quote><why>Not in the scene.</why></leak>
<leak><secret_id>OTHER</secret_id><quote>Tom laughed it off</quote><why>Wrong secret.</why></leak>
</leaks>`;
        const leaks = parseSecretLeaks(raw, PROSE, ['SEC1']);
        expect(leaks).toHaveLength(1);
        expect(leaks[0].quote).toContain('cooked the books');
        expect(parseSecretLeaks('<leaks></leaks>', PROSE, ['SEC1'])).toEqual([]);
        expect(parseSecretLeaks('I found nothing.', PROSE, ['SEC1'])).toEqual([]);
    });

    it('makes no call when the story has no unrevealed secret, or the check is off', async () => {
        const callAI = vi.fn(async () => '<leaks></leaks>');
        const none = await checkSceneForSecretLeaks(makeCtx(callAI), { story: {}, sequenceNumber: 1, prose: PROSE });
        expect(none.checked).toBe(false);
        useFeatureOptionsStore.setState({ options: { ...DEFAULT_FEATURE_OPTIONS, secretLeakCheck: false } });
        const off = await checkSceneForSecretLeaks(makeCtx(callAI), { story, sequenceNumber: 1, prose: PROSE });
        expect(off.checked).toBe(false);
        expect(callAI).not.toHaveBeenCalled();
    });

    it('shows the judge the truth and the scene, and leaves a clean scene alone with one call', async () => {
        const callAI = vi.fn(async () => '<leaks></leaks>');
        const result = await checkSceneForSecretLeaks(makeCtx(callAI), { story, sequenceNumber: 1, prose: PROSE });
        expect(callAI).toHaveBeenCalledTimes(1);
        const prompt = String((callAI.mock.calls as unknown as string[][])[0][0]);
        expect(prompt).toContain(TRUTH);
        expect(prompt).toContain('cooked the books');
        expect(result).toEqual({ prose: PROSE, leaks: [], fixed: false, checked: true });
    });

    it('rewrites only the leaking passage', async () => {
        const quote = '"She cooked the books so nobody would look for that cargo," she said.';
        const callAI = vi.fn(async (_prompt: string, _system: string, _json?: boolean, label?: string) =>
            String(label).endsWith('Fix')
                ? `<edits><edit><original>${quote}</original><rewritten>"Ask her why the night tallies never match," she said.</rewritten></edit></edits>`
                : `<leaks><leak><secret_id>SEC1</secret_id><quote>${quote}</quote><why>States it.</why></leak></leaks>`
        );
        const result = await checkSceneForSecretLeaks(makeCtx(callAI as unknown as CallAiFn), { story, sequenceNumber: 1, prose: PROSE });
        expect(result.fixed).toBe(true);
        expect(result.prose).not.toContain('cooked the books');
        expect(result.prose).toContain('night tallies never match');
        expect(result.prose).toContain('Tom laughed it off');
        expect(callAI).toHaveBeenCalledTimes(2);
    });

    it('keeps the scene when the judge fails, or when the fix does not remove the passage', async () => {
        const failing = vi.fn(async () => {
            throw new Error('model down');
        });
        const failed = await checkSceneForSecretLeaks(makeCtx(failing), { story, sequenceNumber: 1, prose: PROSE });
        expect(failed).toEqual({ prose: PROSE, leaks: [], fixed: false, checked: true });

        const quote = 'She cooked the books so nobody would look for that cargo';
        const noFix = vi.fn(async (_p: string, _s: string, _j?: boolean, label?: string) =>
            String(label).includes('Fix') ? 'I cannot do that.' : `<leaks><leak><secret_id>SEC1</secret_id><quote>${quote}</quote><why>x</why></leak></leaks>`
        );
        const kept = await checkSceneForSecretLeaks(makeCtx(noFix as unknown as CallAiFn), { story, sequenceNumber: 1, prose: PROSE });
        expect(kept.fixed).toBe(false);
        expect(kept.prose).toBe(PROSE);
        expect(kept.leaks).toHaveLength(1);
    });
});
