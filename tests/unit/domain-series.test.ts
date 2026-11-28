import { describe, expect, it } from 'vitest';
import { migrateStoryToSequences } from '@/domain/lifecycle';
import {
    acceptThreadCandidates,
    allocateThreadBeats,
    applyOpenThreadUpdates,
    applySeriesSceneReport,
    buildEndingContract,
    buildSequelSeed,
    carrySecretsToSequel,
    checkEndingContract,
    createSeriesOpener,
    formatEndingContract,
    formatReturningInterviewBlock,
    formatSeriesConceptRules,
    formatSeriesContext,
    formatSeriesContinuityAddendum,
    formatSeriesPlanningBlock,
    formatSeriesSceneDirectives,
    formatSeriesSequenceHints,
    formatSeriesThreadStatus,
    getSeriesThreadDirectivesForSequence,
    HIDDEN_REVEAL_SEQUENCE,
    isHiddenThisBook,
    isRevealDueThisBook,
    isSeriesStory,
    keepSeriesVaultEntries,
    materializeSeriesSecrets,
    mergeContractViolations,
    mergeReturningCast,
    nextSeriesThreadId,
    normalizeOpenThreads,
    normalizeSeriesFields,
    parseContractAudit,
    parseSeriesPlan,
    planThreadsForBook,
    seriesBadgeLabel,
    seriesThreadLimits,
    validateSequelLead,
    validateThreadCoverage
} from '@/domain/series';
import type { OpenThread, SeriesPlan, Story } from '@/types';

function thread(over: Partial<OpenThread> = {}): OpenThread {
    return {
        id: 'S1',
        title: 'The missing ledger',
        description: 'Who took the harbour ledger?',
        promise: 'We will learn who took the ledger.',
        status: 'open',
        origin_book: 1,
        owners: ['Elena Vance'],
        touches: [],
        ...over
    };
}

function plan(over: Partial<SeriesPlan> = {}): SeriesPlan {
    return {
        series_question: 'Can the harbour govern itself?',
        series_thematic_argument: 'Trust is built by debts honestly kept.',
        long_arcs: [{ char_name: 'Elena Vance', lie: 'Nobody can be trusted.', truth: 'Trust is a choice.' }],
        endgame_note: 'The harbour stands alone.',
        books: [
            {
                book_number: 1,
                role: 'opener',
                book_question: 'Will Elena expose the customs fraud?',
                stakes_scope: 'Her post and her brother.',
                lead_name: 'Elena Vance',
                handoff_state: 'Elena runs the customs house; the ledger is still missing.',
                thread_intents: { S1: 'advance', S2: 'pay_off' },
                status: 'current'
            },
            {
                book_number: 2,
                role: 'escalation',
                book_question: 'Who owns the harbour debt?',
                stakes_scope: 'The whole town.',
                handoff_state: 'The town is in open revolt.',
                thread_intents: { S1: 'pay_off' },
                status: 'sketched'
            }
        ],
        secrets: [
            {
                id: 'ssec_1',
                title: "The Harbourmaster's Bargain",
                cover_story: 'He died in the storm.',
                known_by_characters: ['Marcus Hale'],
                concealed_from_characters: ['Elena Vance'],
                reader_status: 'blind',
                layers: [
                    { layer: 1, truth: 'The harbourmaster is alive.', reveal_book: 1, revealed_to: ['Elena Vance'], status: 'hidden' },
                    { layer: 2, truth: 'He sold the harbour to the Crown.', reveal_book: 2, revealed_to: [], status: 'hidden' }
                ],
                seeded_clues: []
            }
        ],
        revisions: [],
        ...over
    };
}

function seriesStory(over: Record<string, unknown> = {}): Partial<Story> {
    const base = {
        id: 'story_b1',
        title: 'Tide Ledger',
        concept: 'A customs clerk uncovers a fraud.',
        target_word_count: 80000,
        cast: [
            { id: 'C1', name: 'Elena Vance', role: 'Protagonist', corner_role: 'Protagonist', vocal_cadence: 'Clipped.', details: { deep_profile: 'INTERVIEW TEXT' } },
            { id: 'C2', name: 'Marcus Hale', role: 'Antagonist', corner_role: 'Antagonist', vocal_cadence: 'Slow drawl.' }
        ],
        threads: [
            { id: 'T1', name: 'A-Story', description: 'The fraud.' },
            { id: 'T2', name: 'B-Story', description: 'The brother.' }
        ],
        sequences: Array.from({ length: 8 }, (_, i) => ({ number: i + 1 })),
        open_threads: [
            thread({ intent: 'advance', planned_sequences: [3, 6] }),
            thread({ id: 'S2', title: 'The brother', promise: 'Will they reconcile?', intent: 'pay_off', planned_sequences: [2, 5, 7] })
        ],
        secret_vault: [],
        series: { ...createSeriesOpener('The Harbour Books', 'Tide Ledger', 1), plan: plan() },
        ...over
    };
    return base as unknown as Partial<Story>;
}

describe('series thread ledger', () => {
    it('scales the limits with the length of the book', () => {
        expect(seriesThreadLimits(20000)).toEqual({ maxOpen: 2, maxPayOffs: 1 });
        expect(seriesThreadLimits(40000)).toEqual({ maxOpen: 3, maxPayOffs: 1 });
        expect(seriesThreadLimits(80000)).toEqual({ maxOpen: 4, maxPayOffs: 2 });
        expect(seriesThreadLimits(200000)).toEqual({ maxOpen: 5, maxPayOffs: 2 });
        expect(seriesThreadLimits(undefined)).toEqual({ maxOpen: 4, maxPayOffs: 2 });
    });

    it('normalizes saved threads without throwing and keeps ids unique', () => {
        const out = normalizeOpenThreads([
            null,
            'junk',
            { id: 's1', name: 'Old name field', status: 'ADVANCED' },
            { id: 'S1', title: 'Duplicate id', status: 'nonsense', kind: 'weird' },
            {}
        ]);
        expect(out.map((t) => t.id)).toEqual(['S1', 'S2']);
        expect(out[0]).toMatchObject({ title: 'Old name field', status: 'advanced', kind: 'plot', origin_book: 1 });
        expect(out[1]).toMatchObject({ status: 'open', kind: 'plot' });
        expect(normalizeOpenThreads('nope')).toEqual([]);
        expect(nextSeriesThreadId(out)).toBe('S3');
    });

    it('plans intents from the roadmap, rests off-stage threads and caps pay-offs', () => {
        const threads = [
            thread({ id: 'S1' }),
            thread({ id: 'S2', owners: ['Somebody Absent'] }),
            thread({ id: 'S3' }),
            thread({ id: 'S4', status: 'resolved' })
        ];
        const planned = planThreadsForBook(
            threads,
            { thread_intents: { S1: 'pay_off', S2: 'advance', S3: 'pay_off' } },
            2,
            [{ name: 'Elena Vance' }],
            { maxOpen: 4, maxPayOffs: 1 }
        );
        expect(planned.map((t) => t.intent)).toEqual(['pay_off', 'rest', 'advance', undefined]);
    });

    it('schedules pay-offs late and leaves deferred threads off the page', () => {
        const scheduled = allocateThreadBeats(
            [thread({ intent: 'pay_off' }), thread({ id: 'S2', intent: 'defer' }), thread({ id: 'S3', intent: 'advance' })],
            8
        );
        expect(Math.max(...(scheduled[0].planned_sequences || []))).toBe(7);
        expect(scheduled[1].planned_sequences).toEqual([]);
        expect(scheduled[2].planned_sequences?.length).toBe(2);
        expect(validateThreadCoverage(scheduled, 8)).toEqual([]);
        expect(validateThreadCoverage([thread({ intent: 'pay_off', planned_sequences: [2] })], 8)).toHaveLength(1);
    });

    it('gives directives only in the planned sequences and reminds the reader of old threads', () => {
        const story = seriesStory({
            series: { ...createSeriesOpener('The Harbour Books', 'x', 1), book_number: 2 }
        });
        const inSeq3 = getSeriesThreadDirectivesForSequence(story, 3);
        expect(inSeq3.map((d) => d.thread_id)).toEqual(['S1']);
        expect(inSeq3[0].needsReminder).toBe(true);
        expect(getSeriesThreadDirectivesForSequence(story, 4)).toEqual([]);
        expect(getSeriesThreadDirectivesForSequence({ open_threads: story.open_threads }, 3)).toEqual([]);
    });

    it('records scene updates and never revives an abandoned thread', () => {
        const updated = applyOpenThreadUpdates(
            [thread(), thread({ id: 'S2', status: 'abandoned' })],
            [
                { id: 's1', change: 'advanced', note: 'Elena finds a torn page.' },
                { id: 'S2', change: 'resolved', note: 'ignored' }
            ],
            '2.3',
            1
        );
        expect(updated[0]).toMatchObject({ status: 'advanced', last_note: 'Book 1, scene 2.3: Elena finds a torn page.' });
        expect(updated[0].touches).toEqual([{ book: 1, scene: '2.3', note: 'Elena finds a torn page.' }]);
        expect(updated[1].status).toBe('abandoned');
        const same = [thread()];
        expect(applyOpenThreadUpdates(same, [], '1.1', 1)).toBe(same);
    });

    it('accepts model-opened threads up to the limit and skips repeats', () => {
        const res = acceptThreadCandidates(
            [thread()],
            [
                { title: 'the missing ledger' },
                { title: 'The second seal', promise: 'Who holds the other seal?', kind: 'mystery' },
                { title: 'One too many' }
            ],
            { maxOpen: 2, maxPayOffs: 1 },
            1,
            '4.1'
        );
        expect(res.accepted.map((t) => t.title)).toEqual(['The second seal']);
        expect(res.accepted[0]).toMatchObject({ id: 'S2', source: 'model', kind: 'mystery', origin_book: 1 });
        expect(res.threads).toHaveLength(2);
    });
});

describe('layered series secrets', () => {
    it('lets a standalone secret reveal as before and holds a later-book layer', () => {
        expect(isRevealDueThisBook({ id: 'a' } as never, 1)).toBe(true);
        expect(isRevealDueThisBook({ id: 'a', scope: 'series', reveal_book: 2 } as never, 1)).toBe(false);
        expect(isRevealDueThisBook({ id: 'a', scope: 'series', reveal_book: 2 } as never, 2)).toBe(true);
        expect(isRevealDueThisBook({ id: 'a', scope: 'series', reveal_book: 2 } as never, undefined)).toBe(true);
        expect(isHiddenThisBook({ id: 'a', scope: 'series', reveal_book: 3 } as never, seriesStory())).toBe(true);
        expect(isHiddenThisBook({ id: 'a', scope: 'series', reveal_book: 3 } as never, { id: 'standalone' })).toBe(false);
    });

    it('turns the next hidden layer into a vault entry once', () => {
        const vault = materializeSeriesSecrets([{ id: 'book_secret', title: 'Own secret' }], plan(), 1);
        expect(vault).toHaveLength(2);
        const layer = vault[1] as Record<string, unknown>;
        expect(layer).toMatchObject({ id: 'ssec_1_L1', scope: 'series', reveal_book: 1, parent_secret_id: 'ssec_1', layer: 1 });
        expect((layer.reveal_anchor as { sequence_number: number }).sequence_number).not.toBe(HIDDEN_REVEAL_SEQUENCE);
        expect(materializeSeriesSecrets(vault, plan(), 1)).toHaveLength(2);

        const held = plan();
        held.secrets[0].layers[0].reveal_book = 2;
        const heldVault = materializeSeriesSecrets([], held, 1) as Array<Record<string, unknown>>;
        expect((heldVault[0].reveal_anchor as { sequence_number: number }).sequence_number).toBe(HIDDEN_REVEAL_SEQUENCE);
        expect(isHiddenThisBook(heldVault[0] as never, seriesStory())).toBe(true);
    });

    it('puts series entries back after the story arc rewrites the vault', () => {
        const previous = [
            { id: 'ssec_1_L1', title: 'Layer', parent_secret_id: 'ssec_1' },
            { id: 'old', title: 'Carried', carried_from_book: 1 },
            { id: 'plain', title: 'Plain book secret' }
        ];
        const kept = keepSeriesVaultEntries(previous, [{ id: 'new', title: 'New arc secret' }]);
        expect(kept.map((v) => v.id)).toEqual(['new', 'ssec_1_L1', 'old']);
        expect(keepSeriesVaultEntries(undefined, undefined)).toEqual([]);
    });

    it('carries unrevealed secrets forward and turns revealed ones into facts', () => {
        const carried = carrySecretsToSequel(
            seriesStory({
                secret_vault: [
                    { id: 'v1', title: 'Unrevealed', truth: 'Hidden truth', status: 'dormant', category: 'plot_mystery', clue_schedule: [{ sequence_number: 2 }] },
                    { id: 'v2', title: 'Out', truth: 'Known truth', status: 'revealed', category: 'plot_mystery' },
                    { id: 'v3', title: 'Herring', truth: 'False lead', status: 'dormant', category: 'red_herring' }
                ]
            })
        );
        expect(carried.vault.map((v) => v.id)).toEqual(['v1']);
        expect(carried.vault[0]).toMatchObject({ status: 'dormant', clue_schedule: [], carried_from_book: 1 });
        expect(carried.revealedFacts).toEqual([{ title: 'Out', truth: 'Known truth', known_by: [] }]);
        expect(carried.seriesSecrets).toHaveLength(1);
    });
});

describe('series plan', () => {
    it('recognises a series only by its header and leaves standalone stories untouched', () => {
        expect(isSeriesStory({ id: 'x' })).toBe(false);
        expect(isSeriesStory(null)).toBe(false);
        expect(isSeriesStory(seriesStory())).toBe(true);
        const standalone = { id: 'old', title: 'Old story', cast: [], threads: [] };
        const normalized = normalizeSeriesFields({ ...standalone });
        expect(normalized).toEqual(standalone);
        expect('series' in normalized).toBe(false);
        expect('open_threads' in normalized).toBe(false);
    });

    it('does not add series fields when an old saved story is migrated', () => {
        const migrated = migrateStoryToSequences({
            id: 'legacy_1',
            title: 'Legacy',
            acts: [{ number: 1, title: 'One' }],
            sequences: [{ number: 1, title: 'Seq' }]
        } as never) as Record<string, unknown>;
        expect(migrated.series).toBeUndefined();
        expect(migrated.open_threads).toBeUndefined();
    });

    it('repairs a damaged series header on load', () => {
        const repaired = normalizeSeriesFields({
            id: 's',
            series: { id: 'series_1', title: '', book_number: 'two', previous_books: 'nope' },
            open_threads: [{ title: 'Kept' }, 7]
        } as Record<string, unknown>) as unknown as Partial<Story>;
        expect(isSeriesStory(repaired)).toBe(true);
        expect(repaired.series?.book_number).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(repaired.series?.previous_books)).toBe(true);
        expect(repaired.open_threads).toHaveLength(1);
        // A header with no id cannot be trusted: the story loads as a standalone book.
        expect(isSeriesStory(normalizeSeriesFields({ id: 's', series: { title: 'No id' } } as Record<string, unknown>) as never)).toBe(false);
    });

    it('parses the Series Architect output into a plan and threads', () => {
        const xml = `<response>
  <series_question>Can the harbour govern itself?</series_question>
  <series_thematic_argument>Trust is built by debts honestly kept.</series_thematic_argument>
  <endgame_note>The harbour stands alone.</endgame_note>
  <lead_long_arc><char_name>Elena Vance</char_name><lie>Nobody can be trusted.</lie><truth>Trust is a choice.</truth></lead_long_arc>
  <books>
    <book number="1" role="opener">
      <book_question>Will Elena expose the fraud?</book_question>
      <stakes_scope>Her post.</stakes_scope>
      <lead_name>Elena Vance</lead_name>
      <handoff_state>Elena runs the customs house.</handoff_state>
      <thread_intents><thread_intent id="S1">introduce</thread_intent></thread_intents>
    </book>
    <book number="2" role="escalation">
      <book_question>Who owns the debt?</book_question>
      <stakes_scope>The town.</stakes_scope>
      <handoff_state>Revolt.</handoff_state>
      <thread_intents><thread_intent id="S1">pay_off</thread_intent></thread_intents>
    </book>
  </books>
  <series_threads>
    <series_thread id="S1" kind="mystery"><title>The missing ledger</title><promise>Who took it?</promise><owners>Elena Vance</owners></series_thread>
  </series_threads>
</response>`;
        const res = parseSeriesPlan(xml, { bookNumber: 1, existingThreads: [], leadName: 'Elena Vance', concept: 'c' });
        expect(res.parsed).toBe(true);
        expect(res.plan.series_question).toBe('Can the harbour govern itself?');
        expect(res.plan.books.map((b) => [b.book_number, b.role, b.status])).toEqual([
            [1, 'opener', 'current'],
            [2, 'escalation', 'sketched']
        ]);
        expect(res.plan.books[1].thread_intents).toEqual({ S1: 'pay_off' });
        expect(res.plan.long_arcs[0].char_name).toBe('Elena Vance');
    });

    it('falls back to a usable plan when the output cannot be parsed', () => {
        const res = parseSeriesPlan('I am sorry, I cannot do that.', {
            bookNumber: 1,
            existingThreads: [thread()],
            leadName: 'Elena Vance',
            concept: 'A customs clerk uncovers a fraud.'
        });
        expect(res.parsed).toBe(false);
        expect(res.plan.books.some((b) => b.book_number === 1)).toBe(true);
        expect(res.threads.map((t) => t.id)).toContain('S1');
    });

    it('labels a book by its place in the series', () => {
        const b1 = seriesStory();
        const b2 = seriesStory({ id: 'story_b2', series: { ...b1.series, book_number: 2 } });
        expect(seriesBadgeLabel({ id: 'standalone' }, [b1, b2])).toBe('');
        expect(seriesBadgeLabel(b1, [b1])).toBe('Book 1');
        expect(seriesBadgeLabel(b1, [b1, b2, null, { id: 'other' }])).toBe('Book 1 of 2');
        expect(seriesBadgeLabel(b2, [b1, b2])).toBe('Book 2 of 2');
    });
});

describe('hard ending contract', () => {
    it('lists what must close, pay off, stay open and stay hidden', () => {
        const story = seriesStory({
            secret_vault: [{ id: 'ssec_1_L2', title: 'Bargain', truth: 'He sold the harbour.', scope: 'series', reveal_book: 2, status: 'dormant' }]
        });
        const contract = buildEndingContract(story);
        expect(contract?.must_pay_off.map((t) => t.id)).toEqual(['S2']);
        expect(contract?.must_stay_open.map((t) => t.id)).toEqual(['S1']);
        expect(contract?.must_stay_hidden.map((s) => s.secret_id)).toEqual(['ssec_1_L2']);
        const text = formatEndingContract(contract, 'planner');
        expect(text).toContain('S1');
        expect(text).toContain('He sold the harbour.');
        expect(buildEndingContract({ id: 'standalone' })).toBeNull();
        expect(formatEndingContract(null)).toBe('');
    });

    it('flags a thread that was resolved although it had to stay open', () => {
        const story = seriesStory();
        story.open_threads = applyOpenThreadUpdates(story.open_threads, [{ id: 'S1', change: 'resolved', note: 'The thief confesses.' }], '8.2', 1);
        const violations = checkEndingContract(story);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({ rule: 'must_stay_open', subject: 'S1' });
        expect(checkEndingContract({ id: 'standalone' })).toEqual([]);
    });

    it('reads the auditor verdict and treats an unreadable one as a pass', () => {
        expect(parseContractAudit('<audit><verdict>PASS</verdict></audit>')).toEqual([]);
        expect(parseContractAudit('garbage')).toEqual([]);
        const found = parseContractAudit(
            '<audit><verdict>FAIL</verdict><violation><rule>must_stay_open</rule><subject>S1</subject><evidence>The thief confesses on the last page.</evidence></violation></audit>'
        );
        expect(found).toEqual([{ rule: 'must_stay_open', subject: 'S1', evidence: 'The thief confesses on the last page.' }]);
    });

    it('applies a scene report: movement, a new thread, a leak and a broken contract', () => {
        const story = seriesStory({
            secret_vault: [{ id: 'ssec_1_L2', title: 'Bargain', truth: 'He sold the harbour.', scope: 'series', reveal_book: 2, parent_secret_id: 'ssec_1', status: 'dormant' }]
        });
        const res = applySeriesSceneReport(
            story,
            {
                open_thread_updates: [{ id: 'S1', change: 'resolved', note: 'The thief confesses.' }],
                new_thread_candidates: [{ title: 'The second seal', promise: 'Who holds it?' }],
                secret_events: [
                    { secret_id: 'ssec_1_L2', event: 'leaked', evidence: 'Marcus says it aloud.' },
                    { secret_id: 'unknown', event: 'leaked' }
                ]
            },
            '8.2'
        );
        expect(res.openedThreads.map((t) => t.title)).toEqual(['The second seal']);
        expect(res.patch.open_threads).toHaveLength(3);
        expect(res.newViolations.map((v) => v.rule).sort()).toEqual(['must_stay_hidden', 'must_stay_open']);
        expect(res.patch.series?.contract_violations).toHaveLength(2);

        const again = applySeriesSceneReport({ ...story, ...res.patch }, { secret_events: [{ secret_id: 'ssec_1_L2', event: 'leaked', evidence: 'Marcus says it aloud.' }] }, '8.2');
        expect(again.newViolations).toEqual([]);
        expect(again.patch.series?.contract_violations).toHaveLength(2);
    });

    it('leaves a standalone story alone when a report arrives', () => {
        const res = applySeriesSceneReport({ id: 'standalone' }, { open_thread_updates: [{ id: 'S1', change: 'advanced', note: 'x' }] }, '1.1');
        expect(res).toEqual({ patch: {}, openedThreads: [], newViolations: [] });
        expect(mergeContractViolations(undefined, [])).toEqual([]);
    });
});

describe('sequel seed', () => {
    const template = { id: 'tpl', title: 'Untitled Story', cast: [], threads: [], prose: {}, style: { genre: '' } };

    it('builds Book 2 from a finished Book 1', () => {
        const source = seriesStory({
            prose: { '0-0': { final: 'Some prose.' } },
            character_states: { 'Elena Vance': { name: 'Elena Vance', emotional_state: 'Wary', location: 'Customs house' } },
            story_so_far: 'Elena exposed the fraud.',
            world_primer: 'A storm-battered harbour town.'
        });
        const seed = buildSequelSeed(source, { newStoryId: 'story_b2', title: 'Salt Debt', concept: 'The debt comes due.', recap: 'Elena exposed the fraud and took the customs house.' }, template) as Record<string, unknown>;
        const series = seed.series as NonNullable<Story['series']>;
        expect(seed).toMatchObject({ id: 'story_b2', title: 'Salt Debt', concept: 'The debt comes due.', world_primer: 'A storm-battered harbour town.' });
        expect(series.book_number).toBe(2);
        expect(series.id).toBe(source.series?.id);
        expect(series.previous_books).toEqual([
            { book_number: 1, story_id: 'story_b1', title: 'Tide Ledger', recap: 'Elena exposed the fraud and took the customs house.' }
        ]);
        expect(series.returning_cast?.map((c) => c.name)).toEqual(['Elena Vance', 'Marcus Hale']);
        expect(series.plan?.books.map((b) => b.status)).toEqual(['written', 'current']);
        expect(seed.prose).toEqual({});
        expect(seed.cast).toEqual([]);
        const threads = seed.open_threads as OpenThread[];
        expect(threads.map((t) => [t.id, t.intent])).toEqual([
            ['S1', 'pay_off'],
            ['S2', undefined]
        ]);
        expect(threads.every((t) => (t.planned_sequences || []).length === 0)).toBe(true);
    });

    it('starts a series from a standalone story', () => {
        const seed = buildSequelSeed({ id: 'solo', title: 'Solo', concept: 'Ada sails alone.', cast: [{ name: 'Ada' }] } as never, { newStoryId: 'n', title: '', concept: 'More.' }, template) as Record<string, unknown>;
        const series = seed.series as NonNullable<Story['series']>;
        expect(series).toMatchObject({ id: 'series_solo', title: 'Solo', book_number: 2 });
        expect(seed.title).toBe('Solo: Book 2');
        expect(series.previous_books[0].recap.length).toBeGreaterThan(0);
    });

    it('locks the voice of a returning character and lets the web change', () => {
        const returning = [
            { name: 'Elena Vance', vocal_cadence: 'Clipped.', voice_sample: 'sample.wav', corner_role_prior: 'Protagonist', details: { deep_profile: 'OLD INTERVIEW' }, book_last_seen: 1 }
        ];
        const merged = mergeReturningCast(
            [
                { name: 'elena vance', role: 'Mentor', corner_role: 'ALLY', vocal_cadence: 'Flowery and long.' },
                { name: 'New Face', role: 'Protagonist', corner_role: 'MAIN_CHARACTER', vocal_cadence: 'Blunt.' }
            ] as never,
            returning as never
        ) as Array<Record<string, unknown>>;
        expect(merged[0]).toMatchObject({ corner_role: 'ALLY', vocal_cadence: 'Clipped.', user_edited_cadence: true });
        expect(merged[0].returning_from_book).toBeTruthy();
        expect(merged[0].prior_deep_profile).toBe('OLD INTERVIEW');
        expect(merged[1].vocal_cadence).toBe('Blunt.');
        expect(merged[1].returning_from_book).toBeUndefined();
        expect(validateSequelLead(merged as never, returning)).toBe(false);
        expect(validateSequelLead([{ name: 'Elena Vance', corner_role: 'MAIN_CHARACTER' }] as never, returning)).toBe(true);
        expect(formatReturningInterviewBlock(merged[0], 2)).toContain('OLD INTERVIEW');
        expect(formatReturningInterviewBlock(merged[1], 2)).toBe('');
    });
});

describe('series prompt blocks', () => {
    it('are empty for a standalone story, so its prompts do not change', () => {
        const standalone = { id: 'solo', title: 'Solo', threads: [{ id: 'T1', name: 'A', description: 'a' }], secret_vault: [{ id: 'v', title: 't', truth: 'x' }] } as never;
        expect(formatSeriesContext(standalone)).toBe('');
        expect(formatSeriesConceptRules(standalone)).toBe('');
        expect(formatSeriesPlanningBlock(standalone)).toBe('');
        expect(formatSeriesSequenceHints(standalone)).toBe('');
        expect(formatSeriesSceneDirectives(standalone, 8, 'prose')).toBe('');
        expect(formatSeriesSceneDirectives(standalone, 8, 'planner')).toBe('');
        expect(formatSeriesContinuityAddendum(standalone)).toBe('');
        expect(formatSeriesThreadStatus(standalone)).toBe('');
        expect(formatSeriesContext(null)).toBe('');
    });

    it('carry the plan, the threads and the ending contract for a series', () => {
        const story = seriesStory();
        expect(formatSeriesContext(story)).toContain('The Harbour Books');
        expect(formatSeriesConceptRules(story).length).toBeGreaterThan(0);
        const planning = formatSeriesPlanningBlock(story);
        expect(planning).toContain('Will Elena expose the customs fraud?');
        expect(planning).toContain('The missing ledger');
        expect(formatSeriesSequenceHints(story)).toContain('S1');
        expect(formatSeriesSceneDirectives(story, 3, 'prose')).toContain('The missing ledger');
        expect(formatSeriesSceneDirectives(story, 4, 'prose')).toBe('');
        const ending = formatSeriesSceneDirectives(story, 8, 'prose');
        expect(ending).toContain('S1');
        expect(formatSeriesContinuityAddendum(story)).toContain('open_thread_updates');
        expect(formatSeriesThreadStatus(story)).toContain('S2 "The brother"');
    });
});
