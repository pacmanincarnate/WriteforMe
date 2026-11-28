import { describe, expect, it } from 'vitest';
import {
    applyLongformSceneReport,
    applySerialSequencePlan,
    arcWindowOf,
    carrySerialToNextArc,
    createSerialInfo,
    episodeOfScene,
    episodePlanFor,
    episodesOfSequence,
    formatLongformContinuityAddendum,
    formatLongformSceneDirectives,
    formatSerialCastBlock,
    isSerialStory,
    normalizeSerialFields,
    planSerialSequence,
    serialStateOf,
    summarizeSerial,
    syncSerial,
    type SerialSceneReport,
    type SerialStory
} from '@/domain/serial';
import { createSeriesOpener, formatSeriesContinuityAddendum, formatSeriesSceneDirectives } from '@/domain/series';
import type { OpenThread, Story } from '@/types';

const SEQUENCES = 8;
const SCENES = 4;

function ledgerThread(id: string, owners: string[], extra: Partial<OpenThread> = {}): OpenThread {
    return { id, title: `Thread ${id}`, description: `About ${id}`, promise: `Promise ${id}`, status: 'open', origin_book: 1, owners, intent: 'advance', source: 'plan', touches: [], ...extra };
}

function makeStory(extra: Partial<Story> = {}, rotation: 'anchored' | 'ensemble' = 'anchored'): SerialStory {
    return {
        id: 'arc1',
        title: 'The Harbour',
        series: createSeriesOpener('The Harbour Serial', 'The Harbour', 1),
        serial: createSerialInfo({ rotation }),
        cast: [
            { name: 'Mara', corner_role: 'MAIN_CHARACTER' },
            { name: 'Ilse', corner_role: 'ANTAGONIST' },
            { name: 'Tobin', is_initial_cast: true },
            { name: 'Quill', is_initial_cast: true }
        ],
        threads: [{ id: 'T1', name: 'The harbour fire', description: 'Who set it?' }],
        sequences: Array.from({ length: SEQUENCES }, (_, i) => ({ number: i + 1, title: `Seq ${i + 1}` })),
        open_threads: [ledgerThread('S1', ['Mara'])],
        ...extra
    } as unknown as SerialStory;
}

/** Writes a whole arc with a writer who does what each episode plan says. */
function writeArc(start: SerialStory): { story: SerialStory; notes: string[] } {
    let story = start;
    const notes: string[] = [];
    let opened = 0;
    for (let seq = 1; seq <= SEQUENCES; seq++) {
        const planned = planSerialSequence(story, seq, SEQUENCES)!;
        story = { ...story, ...planned.patch };
        for (let idx = 0; idx < SCENES; idx++) {
            const pos = { seqNum: seq, sceneIdx: idx, sceneCount: SCENES, sequenceCount: SEQUENCES };
            const at = episodeOfScene(story, pos);
            const plan = episodePlanFor(story, at.episode, SEQUENCES);
            const known = (id: string) => (story.open_threads || []).some((t) => t.id === id);
            const report: SerialSceneReport = at.isLast
                ? {
                      open_thread_updates: [
                          ...plan.advance.filter(known).map((id) => ({ id, change: 'advanced' as const, note: `moved in ${at.episode}` })),
                          ...plan.close.filter(known).map((id) => ({ id, change: 'resolved' as const, note: `paid off in ${at.episode}` }))
                      ],
                      new_thread_candidates: plan.open.map((o) => ({ title: `Side plot ${++opened}`, promise: 'A new question', owners: o.shared ? o.suggested_owners : o.suggested_owners.slice(0, 1) })),
                      serial_thread_notes: plan.park.filter(known).map((id) => ({ id, change: 'parked' as const, note: 'Left for the coast.' }))
                  }
                : {};
            const res = applyLongformSceneReport(story, report, `${seq}.${idx + 1}`, {
                ...pos,
                sceneKey: `${seq - 1}-${idx}`,
                charactersPresent: ['Mara', 'Tobin'],
                pov: 'Mara'
            });
            story = { ...story, ...res.patch } as SerialStory;
            notes.push(...res.serialNotes);
        }
    }
    return { story, notes };
}

describe('domain/serial/story: a serial is a series story with a serial layer', () => {
    it('recognises a serial only when the story is also a series', () => {
        expect(isSerialStory(makeStory())).toBe(true);
        expect(isSerialStory({ id: 'solo', serial: createSerialInfo() } as Partial<Story>)).toBe(false);
        expect(isSerialStory({ id: 'book', series: createSeriesOpener('S', 'B', 1) })).toBe(false);
    });

    it('leaves every other story exactly as the series layer has it', () => {
        const solo = { id: 'solo', title: 'Solo' } as Partial<Story>;
        const book = { id: 'book', series: createSeriesOpener('S', 'B', 1), open_threads: [ledgerThread('S1', [], { planned_sequences: [2] })] } as Partial<Story>;
        for (const story of [solo, book]) {
            expect(formatLongformSceneDirectives(story, 2, 'planner', 8)).toBe(formatSeriesSceneDirectives(story, 2, 'planner', 8));
            expect(formatLongformSceneDirectives(story, 2, 'prose', 8, { index: 0, count: 4 })).toBe(formatSeriesSceneDirectives(story, 2, 'prose', 8));
            expect(formatLongformContinuityAddendum(story)).toBe(formatSeriesContinuityAddendum(story));
            expect(planSerialSequence(story, 1, 8)).toBeNull();
            expect(carrySerialToNextArc(story)).toBeUndefined();
            expect(formatSerialCastBlock(story)).toBe('');
            expect(summarizeSerial(story)).toBeNull();
        }
        expect(formatLongformSceneDirectives(solo, 2)).toBe('');
        const res = applyLongformSceneReport(solo, { open_thread_updates: [] }, '1.1');
        expect(res.patch).toEqual({});
        expect(res.serialNotes).toEqual([]);
    });

    it('repairs or drops a damaged serial field on load', () => {
        const dropped = normalizeSerialFields({ id: 'solo', serial: { roster: [] } } as Record<string, unknown>);
        expect('serial' in dropped).toBe(false);
        const repaired = normalizeSerialFields({ ...makeStory(), serial: { policy: { episodesPerSequence: 9 }, roster: 'x' } } as unknown as Record<string, unknown>) as unknown as SerialStory;
        expect(repaired.serial.policy.episodesPerSequence).toBe(3);
        expect(repaired.serial.policy.threads.side.target).toBe(3);
        expect(repaired.serial.roster).toEqual([]);
        expect(repaired.serial.arc_first_episode).toBe(1);
        const untouched = { id: 'solo' };
        expect(normalizeSerialFields(untouched)).toEqual({ id: 'solo' });
    });
});

describe('domain/serial/story: episodes over sequences', () => {
    it('gives each sequence its episodes and splits its scenes evenly', () => {
        const story = makeStory();
        expect(episodesOfSequence(story, 1)).toEqual([1, 2]);
        expect(episodesOfSequence(story, 8)).toEqual([15, 16]);
        expect(arcWindowOf(story, 8)).toMatchObject({ startsAt: 1, endsAt: 16 });
        const at = (sceneIdx: number, sceneCount = 5) => episodeOfScene(story, { seqNum: 3, sceneIdx, sceneCount, sequenceCount: 8 });
        expect([0, 1, 2, 3, 4].map((i) => at(i).episode)).toEqual([5, 5, 5, 6, 6]);
        expect(at(0)).toMatchObject({ isFirst: true, isLast: false });
        expect(at(2)).toMatchObject({ isFirst: false, isLast: true });
        expect(at(3)).toMatchObject({ isFirst: true, isLast: false });
        expect(at(4).isLast).toBe(true);
    });

    it('numbers a later arc from where the last one stopped', () => {
        const story = makeStory();
        story.serial.arc_first_episode = 17;
        expect(episodesOfSequence(story, 2)).toEqual([19, 20]);
        expect(arcWindowOf(story, 8)).toMatchObject({ startsAt: 17, endsAt: 32 });
    });
});

describe('domain/serial/story: roster and ledger view', () => {
    it('builds the roster from the cast and anchors the lead', () => {
        const serial = syncSerial(makeStory(), 1);
        expect(serial.roster.map((r) => [r.name, r.tier, r.status])).toEqual([
            ['Mara', 'core', 'active'],
            ['Ilse', 'core', 'active'],
            ['Tobin', 'supporting', 'active'],
            ['Quill', 'supporting', 'active']
        ]);
        expect(serial.roster.filter((r) => r.anchored).map((r) => r.name)).toEqual(['Mara']);
        expect(syncSerial(makeStory({}, 'ensemble'), 1).roster.some((r) => r.anchored)).toBe(false);
    });

    it('rests whoever the arc did not cast and picks a parked thread up when its owner returns', () => {
        const base = makeStory();
        const first = { ...base, serial: syncSerial(base, 1) };
        const without = { ...first, cast: (first.cast || []).filter((c) => c.name !== 'Quill') } as SerialStory;
        without.open_threads = [ledgerThread('S2', ['Quill'], { source: 'model' })];
        without.serial = { ...without.serial, thread_meta: { S2: { scope: 'side', opened_episode: 3, last_touched_episode: 8, weight: 2, moves: 2, parked: { episode: 16, note: 'Quill sailed.' } } } };
        const resting = syncSerial(without, 17);
        expect(resting.roster.find((r) => r.name === 'Quill')?.status).toBe('resting');
        expect(resting.thread_meta.S2.parked).toBeDefined();
        expect(syncSerial({ ...without, serial: resting, cast: first.cast } as SerialStory, 17).thread_meta.S2.parked).toBeDefined();
        const back = syncSerial({ ...without, serial: { ...resting, arc_first_episode: 33 }, cast: first.cast } as SerialStory, 33);
        expect(back.roster.find((r) => r.name === 'Quill')).toMatchObject({ status: 'active', active_since_episode: 33 });
        expect(back.thread_meta.S2).toMatchObject({ parked: undefined, resumed_episode: 33 });
    });

    it("adds the book's A-story as the arc's main thread without writing it to the ledger", () => {
        const state = serialStateOf(makeStory(), 4);
        expect(state.arc_number).toBe(1);
        expect(state.next_episode).toBe(4);
        expect(state.threads[0]).toMatchObject({ id: 'T1', scope: 'main', owners: ['Mara'], title: 'The harbour fire' });
        expect(state.threads[1]).toMatchObject({ id: 'S1', scope: 'series' });
        expect(state.roster.find((r) => r.name === 'Mara')?.thread_ids).toEqual(['T1', 'S1']);
        expect(state.next_thread_id).toBe(2);
    });

    it('treats a thread the story opened, or one the plan pays off, as arc-sized', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', []), ledgerThread('S2', [], { source: 'model' }), ledgerThread('S3', [], { intent: 'pay_off' })] });
        expect(serialStateOf(story, 1).threads.map((t) => t.scope)).toEqual(['main', 'series', 'side', 'side']);
    });
});

describe('domain/serial/story: planning a sequence', () => {
    it('plans the episodes of the sequence and stores them', () => {
        const planned = planSerialSequence(makeStory(), 1, SEQUENCES)!;
        expect(planned.plans.map((p) => p.episode)).toEqual([1, 2]);
        expect(planned.plans[0].phase).toBe('opening');
        expect(planned.plans[0].advance).toContain('T1');
        expect(planned.plans[0].open.length).toBeGreaterThan(0);
        expect(Object.keys(planned.patch.serial.plans)).toEqual(['1', '2']);
        expect(planned.patch.serial.roster.length).toBe(4);
    });

    it('merges a plan into the story as it stands when the scenes are saved', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', ['Mara']), ledgerThread('S2', ['Tobin'], { source: 'model' })] });
        story.serial.thread_meta = { S2: { scope: 'side', opened_episode: 1, last_touched_episode: 4, weight: 2, moves: 3, target_close_episode: 5 } };
        const planned = planSerialSequence(story, 3, SEQUENCES)!;
        // Meanwhile another scene's report landed: a new thread and a stored plan for an earlier episode.
        const later = { ...story, open_threads: [...(story.open_threads || []), ledgerThread('S3', ['Quill'], { source: 'model' })] } as SerialStory;
        later.serial = { ...later.serial, plans: { '4': { ...planned.plans[0], episode: 4 } } };
        const patch = applySerialSequencePlan(later, planned);
        expect(Object.keys(patch.serial!.plans)).toEqual(['4', '5', '6']);
        expect(patch.open_threads!.map((t) => [t.id, t.intent])).toEqual([['S1', 'advance'], ['S2', 'pay_off'], ['S3', 'advance']]);
        expect(patch.serial!.roster.length).toBe(4);
        expect(applySerialSequencePlan({ id: 'solo' }, planned)).toEqual({});
        expect(applySerialSequencePlan(later, null)).toEqual({});
    });

    it('keeps the plan the planner saw, and plans afresh when none was stored', () => {
        const story = makeStory();
        const planned = planSerialSequence(story, 1, SEQUENCES)!;
        const stored = { ...story, ...planned.patch } as SerialStory;
        stored.serial.plans['2'] = { ...stored.serial.plans['2'], hook: 'quiet' };
        expect(episodePlanFor(stored, 2, SEQUENCES).hook).toBe('quiet');
        expect(episodePlanFor(story, 2, SEQUENCES).episode).toBe(2);
    });

    it('picks the next cast when the wrap-up starts', () => {
        const story = makeStory();
        expect(planSerialSequence(story, 6, SEQUENCES)!.patch.serial.next_cast).toBeUndefined();
        const late = planSerialSequence(story, 7, SEQUENCES)!;
        expect(late.plans.map((p) => p.phase)).toEqual(['middle', 'wrap_up']);
        expect(late.patch.serial.next_cast?.anchors).toEqual(['Mara']);
    });

    it('marks a thread it plans to close as a pay-off, so the ending contract allows it', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', ['Mara']), ledgerThread('S2', ['Tobin'], { source: 'model' })] });
        story.serial.thread_meta = { S2: { scope: 'side', opened_episode: 1, last_touched_episode: 4, weight: 2, moves: 3, target_close_episode: 5 } };
        const planned = planSerialSequence(story, 3, SEQUENCES)!;
        expect(planned.plans.flatMap((p) => p.close)).toContain('S2');
        expect(planned.patch.open_threads.find((t) => t.id === 'S2')?.intent).toBe('pay_off');
        expect(planned.patch.open_threads.find((t) => t.id === 'S1')?.intent).toBe('advance');
    });
});

describe('domain/serial/story: prompts', () => {
    it('gives the scene planner one episode plan per episode of the sequence', () => {
        const story = makeStory();
        const planned = planSerialSequence(story, 1, SEQUENCES)!;
        const block = formatLongformSceneDirectives(story, 1, 'planner', SEQUENCES, undefined, planned.plans);
        expect(block).toContain('<serial_episodes sequence="1">');
        expect(block).toContain('Sequence 1 holds episodes 1, 2.');
        expect(block.match(/<serial_context /g)?.length).toBe(2);
        expect(block).toContain('<thread id="T1" scope="main" owners="Mara">The harbour fire');
        expect(block).toContain('<open_slot scope="side"');
        expect(block).not.toContain('<series_thread_directives>');
        expect(block.endsWith('\n\n')).toBe(true);
    });

    it("gives prose only its own episode and says whether the scene ends it", () => {
        const story = makeStory();
        const mid = formatLongformSceneDirectives(story, 1, 'prose', SEQUENCES, { index: 0, count: 4 });
        expect(mid.match(/<serial_context /g)?.length).toBe(1);
        expect(mid).toContain('episode="1"');
        expect(mid).toContain('Episode 1 continues after this scene');
        const last = formatLongformSceneDirectives(story, 1, 'prose', SEQUENCES, { index: 3, count: 4 });
        expect(last).toContain('episode="2"');
        expect(last).toContain('This is the last scene of episode 2');
    });

    it('adds the ending contract in the last two sequences', () => {
        const story = makeStory();
        story.series.plan = { series_question: '', series_thematic_argument: '', long_arcs: [], endgame_note: '', secrets: [], revisions: [], books: [{ book_number: 1, role: 'opener', book_question: 'Who set the fire?', stakes_scope: '', handoff_state: 'Mara leaves the harbour.', thread_intents: {}, status: 'current' }] };
        expect(formatLongformSceneDirectives(story, 6, 'planner', SEQUENCES)).not.toContain('<ending_contract');
        expect(formatLongformSceneDirectives(story, 7, 'planner', SEQUENCES)).toContain('<ending_contract book="1">');
    });

    it('asks the continuity pass for parked and kept-warm threads', () => {
        const addendum = formatLongformContinuityAddendum(makeStory());
        expect(addendum).toContain('<series_tracking>');
        expect(addendum).toContain('"serial_thread_notes"');
    });

    it('tells the cast step who is seated in a new arc', () => {
        const story = makeStory({ cast: [] });
        story.serial.seated = { anchors: ['Mara'], active: ['Mara', 'Quill'], resting: ['Ilse'], introductions: 2 };
        story.open_threads = [ledgerThread('S4', ['Quill'])];
        const block = formatSerialCastBlock(story);
        expect(block).toContain('Cast these returning characters in this arc: Mara, Quill.');
        expect(block).toContain('Always present: Mara.');
        expect(block).toContain('Do not cast them; they may be mentioned: Ilse.');
        expect(block).toContain('S4 "Thread S4" (Quill)');
    });
});

describe('domain/serial/story: after a scene', () => {
    const facts = { seqNum: 1, sceneIdx: 1, sceneCount: 4, sequenceCount: SEQUENCES, sceneKey: '0-1', charactersPresent: ['Mara', 'Tobin'], pov: 'Mara' };

    it('counts a thread as moved once per episode and records who was on the page', () => {
        let story = makeStory();
        const report: SerialSceneReport = { open_thread_updates: [{ id: 'S1', change: 'advanced', note: 'A clue.' }] };
        for (const idx of [0, 1]) {
            const res = applyLongformSceneReport(story, report, `1.${idx + 1}`, { ...facts, sceneIdx: idx, sceneKey: `0-${idx}` });
            story = { ...story, ...res.patch } as SerialStory;
        }
        expect(story.serial.thread_meta.S1).toMatchObject({ moves: 2, last_touched_episode: 1, last_moved_episode: 1 });
        expect(story.open_threads?.[0].touches?.length).toBe(2);
        expect(story.serial.episodes).toEqual([expect.objectContaining({ number: 1, arc_number: 1, kind: 'main', scene_keys: ['0-0', '0-1'], pov: 'Mara' })]);
        const mara = story.serial.roster.find((r) => r.name === 'Mara')!;
        expect(mara).toMatchObject({ appearances: 1, pov_episodes: 1, last_on_page_episode: 1 });
        expect(story.serial.roster.find((r) => r.name === 'Quill')?.appearances).toBe(0);
    });

    it('lets side threads open up to the serial policy, not the book length', () => {
        const story = makeStory({ target_word_count: 20000, open_threads: [ledgerThread('S1', []), ledgerThread('S2', [])] });
        const res = applyLongformSceneReport(story, { new_thread_candidates: [{ title: 'The stolen boat', promise: 'Who took it?', owners: ['Tobin'] }] }, '1.2', facts);
        expect(res.openedThreads.map((t) => t.id)).toEqual(['S3']);
        expect(res.patch.serial?.thread_meta.S3).toMatchObject({ scope: 'side', opened_episode: 1, moves: 1, target_close_episode: 7 });
    });

    it('does not treat an arc-sized thread closing as a contract breach, but a spine thread still is', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', []), ledgerThread('S2', [], { source: 'model' })] });
        const res = applyLongformSceneReport(story, { open_thread_updates: [{ id: 'S1', change: 'resolved', note: 'x' }, { id: 'S2', change: 'resolved', note: 'y' }] }, '1.2', facts);
        expect(res.newViolations.map((v) => v.subject)).toEqual(['S1']);
        expect(res.patch.series?.contract_violations?.map((v) => v.subject)).toEqual(['S1']);
        expect(res.patch.serial?.thread_meta.S2.closed_episode).toBe(1);
    });

    it('parks a thread on the page and keeps a parked one warm without moving it', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', []), ledgerThread('S2', ['Quill'], { source: 'model' })] });
        const parked = applyLongformSceneReport(story, { serial_thread_notes: [{ id: 's2', change: 'parked', note: 'Quill sails north.' }] }, '1.2', facts);
        expect(parked.patch.serial?.thread_meta.S2.parked).toEqual({ episode: 1, note: 'Quill sails north.' });
        expect(parked.patch.open_threads?.find((t) => t.id === 'S2')?.last_note).toBe('Book 1, scene 1.2: Quill sails north.');
        const after = { ...story, ...parked.patch } as SerialStory;
        const warm = applyLongformSceneReport(after, { serial_thread_notes: [{ id: 'S2', change: 'kept_warm', note: 'A letter arrives.' }] }, '3.1', { ...facts, seqNum: 3, sceneIdx: 0, sceneKey: '2-0' });
        expect(warm.patch.serial?.thread_meta.S2).toMatchObject({ last_touched_episode: 5, moves: 1, parked: { episode: 1 } });
        const moved = applyLongformSceneReport({ ...after, ...warm.patch } as SerialStory, { open_thread_updates: [{ id: 'S2', change: 'advanced', note: 'Quill is back.' }] }, '3.2', { ...facts, seqNum: 3 });
        expect(moved.patch.serial?.thread_meta.S2.parked).toBeUndefined();
    });

    it('says so when an episode ends without the close it planned', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', []), ledgerThread('S2', ['Tobin'], { source: 'model' })] });
        story.serial.plans = { '1': { episode: 1, kind: 'main', phase: 'middle', advance: [], close: ['S2'], park: [], keep_warm: [], open: [], due_on_page: [], hook: 'decision', previously: [], warnings: [] } };
        const res = applyLongformSceneReport(story, {}, '1.2', facts);
        expect(res.serialNotes).toEqual(['Episode 1 was planned to close "Thread S2" (S2) and it is still open.']);
        expect(res.patch.serial?.episodes[0].hook_kind).toBe('decision');
        expect(applyLongformSceneReport(story, {}, '1.1', { ...facts, sceneIdx: 0 }).serialNotes).toEqual([]);
    });
});

describe('domain/serial/story: a whole arc and the next one', () => {
    it('opens, builds and closes side threads over an arc written to plan', () => {
        const { story, notes } = writeArc(makeStory());
        expect(notes).toEqual([]);
        expect(story.serial.episodes.map((e) => e.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
        expect(story.serial.episodes.every((e) => e.scene_keys.length === 2)).toBe(true);
        const meta = story.serial.thread_meta;
        const side = (story.open_threads || []).filter((t) => meta[t.id]?.scope === 'side');
        const closed = side.filter((t) => t.status === 'resolved');
        expect(side.length).toBeGreaterThanOrEqual(4);
        expect(closed.length).toBeGreaterThanOrEqual(2);
        closed.forEach((t) => expect(meta[t.id].moves, t.id).toBeGreaterThanOrEqual(2));
        // The spine was moved, never closed, and nothing the contract forbids happened.
        expect(story.open_threads?.find((t) => t.id === 'S1')?.status).toBe('advanced');
        expect(meta.S1.last_touched_episode).toBe(16);
        expect(story.series.contract_violations || []).toEqual([]);
        // Everyone in the tiers that need one ended the arc owning a thread or had one closed for them.
        const open = side.filter((t) => t.status !== 'resolved').length;
        expect(open).toBeLessThanOrEqual(story.serial.policy.threads.side.max);
        const summary = summarizeSerial(story)!;
        expect(summary).toMatchObject({ arc: 1, written: 16, length: 16, phase: 'done', nextEpisode: 17 });
    });

    it('starts the next arc where the last one stopped, with open threads only', () => {
        const { story } = writeArc(makeStory());
        const next = carrySerialToNextArc(story)!;
        expect(next.arc_first_episode).toBe(17);
        expect(next.plans).toEqual({});
        expect(next.next_cast).toBeUndefined();
        expect(next.seated?.anchors).toEqual(['Mara']);
        expect(next.episodes.length).toBe(16);
        const openIds = (story.open_threads || []).filter((t) => t.status === 'open' || t.status === 'advanced').map((t) => t.id);
        expect(Object.keys(next.thread_meta).sort()).toEqual([...openIds].sort());
        expect(next.roster.map((r) => r.name)).toEqual(['Mara', 'Ilse', 'Tobin', 'Quill']);
        expect(next.roster.every((r) => !r.thread_ids.includes('T1'))).toBe(true);
    });

    it('summarises a serial in progress', () => {
        const story = makeStory({ open_threads: [ledgerThread('S1', ['Mara']), ledgerThread('S2', ['Quill'], { source: 'model' })] });
        story.serial.thread_meta = { S2: { scope: 'side', opened_episode: 1, last_touched_episode: 1, weight: 2, moves: 1, parked: { episode: 1, note: 'Gone.' } } };
        const summary = summarizeSerial(story)!;
        expect(summary).toMatchObject({ arc: 1, written: 0, length: 16, nextEpisode: 1, phase: 'opening', rotation: 'anchored' });
        expect(summary.spine.map((t) => t.id)).toEqual(['S1']);
        expect(summary.parked.map((t) => t.id)).toEqual(['S2']);
        expect(summary.onStage.map((r) => r.name)).toEqual(['Mara', 'Ilse', 'Tobin', 'Quill']);
    });
});
