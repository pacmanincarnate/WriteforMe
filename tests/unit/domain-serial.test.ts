import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CAST_POLICY,
    DEFAULT_THREAD_POLICY,
    applyArcCast,
    applyEpisodeResult,
    assumeCompliant,
    buildPreviously,
    checkArcTimeFits,
    formatSerialContext,
    isOpen,
    onStageNames,
    openThreads,
    overdueRoster,
    phaseOf,
    planArcCast,
    reassignThreadsOf,
    scheduleAhead,
    scheduleEpisode,
    threadlessOnStage,
    type ArcCastPlan,
    type ArcWindow,
    type CastPolicy,
    type EpisodeKind,
    type EpisodePlan,
    type RosterEntry,
    type SerialState,
    type SerialThread,
    type ThreadScope
} from '@/domain/serial';

const NAMES = ['Mara', 'Ilse', 'Tobin', 'Quill', 'Ren', 'Oda', 'Wick', 'Sefa', 'Juno'];
const FIRST_CAST = ['Mara', 'Ilse', 'Tobin', 'Quill'];

function thread(id: string, scope: ThreadScope, owners: string[], extra: Partial<SerialThread> = {}): SerialThread {
    return {
        id,
        title: id,
        description: '',
        status: 'open',
        origin_book: 1,
        scope,
        owners,
        weight: 2,
        opened_episode: 1,
        last_touched_episode: 1,
        moves: 1,
        touches: [],
        ...extra
    };
}

/** Episode 1 is written: a series thread, the arc's main thread and two side threads are open. */
function seed(cast: Partial<CastPolicy> = {}): SerialState {
    const threads = [
        thread('S1', 'series', ['Mara'], { weight: 1 }),
        thread('S2', 'main', ['Mara', 'Ilse'], { weight: 3 }),
        thread('S3', 'side', ['Tobin'], { target_close_episode: 5 }),
        thread('S4', 'side', ['Quill'], { weight: 1, target_close_episode: 9 })
    ];
    const roster: RosterEntry[] = NAMES.map((name, i) => ({
        name,
        tier: i < 3 ? 'core' : 'supporting',
        status: 'active',
        introduced_episode: 1,
        last_on_page_episode: 0,
        appearances: 0,
        pov_episodes: 0,
        thread_ids: threads.filter((t) => t.owners.includes(name)).map((t) => t.id),
        anchored: name === 'Mara'
    }));
    const state: SerialState = {
        arc_number: 1,
        arc_time: { mode: 'forward', start: { day: 0, label: 'Spring, year 1' } },
        policy: {
            threads: DEFAULT_THREAD_POLICY,
            cast: { ...DEFAULT_CAST_POLICY, maxActivePerArc: 5, ...cast },
            episodesPerSequence: 1,
            interludeAfterArcs: 2
        },
        threads,
        roster,
        episodes: [],
        next_episode: 2,
        next_thread_id: 5
    };
    return applyArcCast(state, { anchors: ['Mara'], active: FIRST_CAST, resting: NAMES.filter((n) => !FIRST_CAST.includes(n)), introductions: 1 });
}

const ARCS: ArcWindow[] = [
    { startsAt: 1, endsAt: 8 },
    { startsAt: 9, endsAt: 16 },
    { startsAt: 18, endsAt: 25 },
    { startsAt: 26, endsAt: 33 }
];

interface Run {
    state: SerialState;
    plans: EpisodePlan[];
    casts: ArcCastPlan[];
    /** Open side threads with no owner on stage that were never parked, summed over episodes. */
    silentThreadEpisodes: number;
}

/** Four 8-episode arcs with an interlude at 17, written by a writer who does what each plan says. */
function run(cast: Partial<CastPolicy> = {}, wrapUp = true): Run {
    let s = seed(cast);
    const p = s.policy.threads;
    const plans: EpisodePlan[] = [];
    const casts: ArcCastPlan[] = [];
    let pending: ArcCastPlan | undefined;
    let silentThreadEpisodes = 0;
    for (let ep = 2; ep <= 33; ep++) {
        const found = ARCS.find((a) => ep >= a.startsAt && ep <= a.endsAt);
        const kind: EpisodeKind = found ? 'main' : 'interlude';
        const arc: ArcWindow = { ...(found ?? ARCS.find((a) => a.startsAt > ep)!) };
        if (kind === 'main' && ep === arc.startsAt) {
            const castPlan = pending ?? planArcCast(s, []);
            pending = undefined;
            casts.push(castPlan);
            s = applyArcCast({ ...s, arc_number: s.arc_number + 1 }, castPlan);
            s = openThreads(s, ep, [{ title: 'arc main', description: '', scope: 'main', owners: castPlan.active.slice(0, 2), weight: 3 }]);
        }
        if (wrapUp && kind === 'main') {
            if (ep === arc.endsAt - p.wrapUpWindow + 1) pending = planArcCast(s, []);
            const next = pending;
            if (next) arc.leaving = s.roster.filter((r) => r.status === 'active' && !next.active.includes(r.name)).map((r) => r.name);
        }
        const plan = scheduleEpisode(s, kind, arc);
        plans.push(plan);
        s = applyEpisodeResult(s, assumeCompliant(s, plan), { arc_number: s.arc_number, kind, scene_keys: [], hook_kind: plan.hook });
        const live = onStageNames(s, ep + 1);
        silentThreadEpisodes += s.threads.filter((t) => t.scope === 'side' && isOpen(t) && !t.parked && !t.owners.some((n) => live.has(n))).length;
    }
    return { state: s, plans, casts, silentThreadEpisodes };
}

const planFor = (r: Run, episode: number) => r.plans.find((pl) => pl.episode === episode)!;
const scopeOf = (r: Run, id: string) => r.state.threads.find((t) => t.id === id)?.scope;

describe('domain/serial: arc phases', () => {
    it('names the opening, middle, wrap-up and finale of an arc', () => {
        const arc = { startsAt: 9, endsAt: 16 };
        const phases = [9, 10, 13, 14, 15, 16].map((ep) => phaseOf(ep, arc, DEFAULT_THREAD_POLICY));
        expect(phases).toEqual(['opening', 'middle', 'middle', 'wrap_up', 'wrap_up', 'finale']);
    });
});

describe('domain/serial: scheduleEpisode', () => {
    it('is deterministic and does not mutate the state it is given', () => {
        const s = seed();
        const before = JSON.stringify(s);
        const a = scheduleEpisode(s, 'main', ARCS[0]);
        const b = scheduleEpisode(s, 'main', ARCS[0]);
        expect(a).toEqual(b);
        expect(JSON.stringify(s)).toBe(before);
    });

    it('pins the main thread in every main episode and caps threads per episode', () => {
        const r = run();
        for (const plan of r.plans.filter((pl) => pl.kind === 'main')) {
            const mainIds = [...plan.advance, ...plan.close].filter((id) => scopeOf(r, id) === 'main');
            expect(mainIds.length, `episode ${plan.episode}`).toBe(1);
            expect(plan.advance.length).toBeLessThanOrEqual(DEFAULT_THREAD_POLICY.maxThreadsPerEpisode);
        }
    });

    it('closes each arc main thread on its finale, moves the series thread there and ends on a reveal', () => {
        const r = run();
        for (const arc of ARCS) {
            const finale = planFor(r, arc.endsAt);
            expect(finale.phase).toBe('finale');
            expect(finale.close.some((id) => scopeOf(r, id) === 'main')).toBe(true);
            expect(finale.advance.some((id) => scopeOf(r, id) === 'series')).toBe(true);
            expect(finale.hook).toBe('reveal');
        }
        expect(r.state.threads.filter((t) => t.scope === 'main' && isOpen(t))).toEqual([]);
    });

    it('never closes a side thread that has not been built up', () => {
        const s = seed();
        // Old enough and past its target, but only ever opened: touches is still 1.
        const stale: SerialState = { ...s, next_episode: 6 };
        const plan = scheduleEpisode(stale, 'main', ARCS[0]);
        expect(plan.close).toEqual([]);

        const r = run();
        for (const t of r.state.threads.filter((x) => x.scope === 'side' && x.status === 'resolved')) {
            expect(t.moves, t.id).toBeGreaterThanOrEqual(DEFAULT_THREAD_POLICY.minTouchesBeforeClose);
        }
    });

    it('opens nothing in the last two episodes of an arc', () => {
        const r = run();
        for (const arc of ARCS) {
            expect(planFor(r, arc.endsAt).open).toEqual([]);
            expect(planFor(r, arc.endsAt - 1).open).toEqual([]);
        }
    });

    it('settles departing characters before they rest: no thread is left hanging silently', () => {
        const withWrapUp = run();
        expect(withWrapUp.silentThreadEpisodes).toBe(0);
        expect(withWrapUp.plans.some((pl) => pl.park.length > 0)).toBe(true);
        for (const t of withWrapUp.state.threads.filter((x) => x.scope === 'side' && isOpen(x))) {
            const live = onStageNames(withWrapUp.state, 34);
            expect(Boolean(t.parked) || t.owners.some((n) => live.has(n)), t.id).toBe(true);
        }

        // Picking the cast after the finale, as a first draft did, leaves threads behind with no exit.
        const without = run({}, false);
        expect(without.silentThreadEpisodes).toBeGreaterThan(0);
        expect(without.plans.some((pl) => pl.warnings.some((w) => w.includes('was never parked')))).toBe(true);
    });

    it('un-parks a thread when its owner returns and requires a touch before it may close', () => {
        const r = run();
        const resumed = r.state.threads.filter((t) => t.resumed_episode !== undefined && t.status === 'resolved');
        expect(resumed.length).toBeGreaterThan(0);
        for (const t of resumed) {
            expect(t.parked).toBeUndefined();
            expect(t.closed_episode!).toBeGreaterThan(t.resumed_episode!);
        }
    });

    it('keeps an interlude light: no closes, no opens, a check-in on the longest-parked thread', () => {
        const r = run();
        const interlude = planFor(r, 17);
        expect(interlude.kind).toBe('interlude');
        expect(interlude.close).toEqual([]);
        expect(interlude.open).toEqual([]);
        expect(interlude.hook).toBe('quiet');
        expect(interlude.keep_warm.length).toBe(1);
        const checkedIn = r.state.threads.find((t) => t.id === interlude.keep_warm[0])!;
        expect((checkedIn.touches ?? []).some((x) => x.scene === 'ep17')).toBe(true);
    });

    it('varies how main episodes end', () => {
        const r = run();
        const hooks = r.plans.filter((pl) => pl.kind === 'main').map((pl) => pl.hook);
        for (let i = 1; i < hooks.length; i++) {
            expect(hooks[i] === hooks[i - 1], `episodes ${i + 1} and ${i + 2}`).toBe(false);
        }
        expect(new Set(hooks).size).toBeGreaterThanOrEqual(4);
    });

    it('honours the plan a user sets on a thread', () => {
        const s = seed();
        const deferred: SerialState = { ...s, threads: s.threads.map((t) => (t.id === 'S3' ? { ...t, intent: 'defer' as const } : t)) };
        const plan = scheduleEpisode(deferred, 'main', ARCS[0]);
        expect([...plan.advance, ...plan.close]).not.toContain('S3');

        // "Resolve" makes a mature thread close in the wrap-up even when no close is otherwise due.
        const mature: SerialState = {
            ...s,
            next_episode: 6,
            threads: s.threads.map((t) =>
                t.id === 'S4' ? { ...t, intent: 'pay_off' as const, source: 'plan' as const, moves: 3, target_close_episode: 30, last_touched_episode: 5 } : t.id === 'S3' ? { ...t, status: 'resolved' as const, closed_episode: 5 } : t
            )
        };
        expect(scheduleEpisode(mature, 'main', ARCS[0]).close).toContain('S4');
    });

    it('warns when more threads are parked than the cap allows', () => {
        const s = seed();
        const parked = ['P1', 'P2', 'P3', 'P4'].map((id, i) => thread(id, 'side', ['Wick'], { parked: { episode: i + 1, note: 'left' } }));
        const plan = scheduleEpisode({ ...s, threads: [...s.threads, ...parked] }, 'main', ARCS[0]);
        expect(plan.warnings.some((w) => w.startsWith('4 threads parked, maximum is 3') && w.includes('P1'))).toBe(true);
    });
});

describe('domain/serial: scheduleAhead', () => {
    it('returns one plan per episode and matches stepping the scheduler by hand', () => {
        const s = seed();
        const ahead = scheduleAhead(s, 3, ARCS[0]);
        expect(ahead.map((pl) => pl.episode)).toEqual([2, 3, 4]);

        let step = s;
        for (const expected of ahead) {
            const plan = scheduleEpisode(step, 'main', ARCS[0]);
            expect(plan).toEqual(expected);
            step = applyEpisodeResult(step, assumeCompliant(step, plan), { arc_number: 1, kind: 'main', scene_keys: [], hook_kind: plan.hook });
        }
        expect(s.next_episode).toBe(2);
    });
});

describe('domain/serial: applying an episode', () => {
    it('records touches, moves and closes', () => {
        let s = seed();
        for (let ep = 2; ep <= 9; ep++) {
            s = applyEpisodeResult(
                s,
                { episode: ep, characters_present: ['Tobin'], pov: 'Tobin', thread_updates: [{ id: 'S3', change: 'advanced', note: `beat ${ep}` }], opened: [] },
                { arc_number: 1, kind: 'main', scene_keys: [] }
            );
        }
        const t = s.threads.find((x) => x.id === 'S3')!;
        expect(t.moves).toBe(9);
        expect((t.touches ?? []).map((x) => x.scene)).toEqual(['ep2', 'ep3', 'ep4', 'ep5', 'ep6', 'ep7', 'ep8', 'ep9']);
        expect(t.last_note).toBe('Ep 9: beat 9');
        const tobin = s.roster.find((r) => r.name === 'Tobin')!;
        expect(tobin.appearances).toBe(8);
        expect(tobin.pov_episodes).toBe(8);
        expect(s.episodes.length).toBe(8);
        expect(s.next_episode).toBe(10);
    });

    it('parks without counting a touch, and a check-in does not un-park', () => {
        let s = seed();
        s = applyEpisodeResult(s, { episode: 2, characters_present: [], thread_updates: [{ id: 'S4', change: 'parked', note: 'Quill rides north' }], opened: [] }, { arc_number: 1, kind: 'main', scene_keys: [] });
        s = applyEpisodeResult(s, { episode: 3, characters_present: [], thread_updates: [{ id: 'S4', change: 'kept_warm', note: 'a letter from Quill' }], opened: [] }, { arc_number: 1, kind: 'interlude', scene_keys: [] });
        const t = s.threads.find((x) => x.id === 'S4')!;
        expect(t.parked).toEqual({ episode: 2, note: 'Quill rides north' });
        expect(t.moves).toBe(1);
        expect(isOpen(t)).toBe(true);
        expect(buildPreviously(s, ['S4'], 7)).toEqual(['S4: a letter from Quill']);
    });

    it('gives new threads fresh ids and links them to their owners', () => {
        const s = openThreads(seed(), 4, [{ title: 'debt', description: '', scope: 'side', owners: ['Ilse', 'Tobin'], weight: 2, target_in: 6, spawned_from: 'S3' }]);
        const added = s.threads[s.threads.length - 1];
        expect(added).toMatchObject({ id: 'S5', status: 'open', opened_episode: 4, target_close_episode: 10, moves: 1, spawned_from: 'S3' });
        expect(s.next_thread_id).toBe(6);
        expect(s.roster.find((r) => r.name === 'Ilse')!.thread_ids).toContain('S5');
        expect(s.roster.find((r) => r.name === 'Tobin')!.thread_ids).toContain('S5');
    });
});

describe('domain/serial: cast rotation', () => {
    it('anchored mode keeps the lead in every arc and gives everyone else a turn', () => {
        const r = run();
        for (const c of r.casts) expect(c.active[0]).toBe('Mara');
        const lead = r.state.roster.find((x) => x.name === 'Mara')!;
        expect(lead.appearances).toBeGreaterThanOrEqual(30);
        for (const entry of r.state.roster) expect(entry.appearances, entry.name).toBeGreaterThan(0);
    });

    it('ensemble mode rests the lead, bridges arcs with two familiar faces and brings core characters back', () => {
        const r = run({ rotation: 'ensemble' });
        expect(r.casts[0].anchors).toEqual([]);
        expect(r.casts.some((c) => !c.active.includes('Mara'))).toBe(true);
        expect(r.casts[0].active.filter((n) => FIRST_CAST.includes(n)).length).toBeGreaterThanOrEqual(2);
        // A core character rests at most two arcs in a row.
        expect(r.casts[2].active).toContain('Mara');
        expect(r.silentThreadEpisodes).toBe(0);
    });

    it('thread-led seating brings back the owner of the thread that has waited longest', () => {
        const s = seed();
        const waiting: SerialState = {
            ...s,
            next_episode: 14,
            threads: [...s.threads.map((t) => ({ ...t, last_touched_episode: 13 })), thread('S9', 'side', ['Wick'], { parked: { episode: 3, note: 'left' } }), thread('S10', 'side', ['Sefa'], { parked: { episode: 11, note: 'left' } })],
            roster: s.roster.map((r) => (r.name === 'Wick' || r.name === 'Sefa' ? { ...r, last_on_page_episode: 12 } : { ...r, last_on_page_episode: 13 }))
        };
        const byThread = planArcCast({ ...waiting, policy: { ...waiting.policy, cast: { ...waiting.policy.cast, everyoneOwnsThread: false } } }, []);
        expect(byThread.active.slice(0, 3)).toEqual(['Mara', 'Wick', 'Sefa']);

        const byAbsence = planArcCast({ ...waiting, policy: { ...waiting.policy, cast: { ...waiting.policy.cast, everyoneOwnsThread: false, rotateBy: 'longest_absent' } } }, []);
        expect(byAbsence.active[0]).toBe('Mara');
        expect(byAbsence.active).toHaveLength(4);
    });

    it('does not call a character overdue the moment they return from rest', () => {
        const s = seed();
        const back = applyArcCast({ ...s, next_episode: 20 }, { anchors: ['Mara'], active: ['Mara', 'Ren'], resting: [], introductions: 1 });
        expect(back.roster.find((r) => r.name === 'Ren')!.active_since_episode).toBe(20);
        expect(overdueRoster(back, 20)).not.toContain('Ren');
        expect(overdueRoster(back, 20 + DEFAULT_CAST_POLICY.supportingMaxAbsence)).toContain('Ren');
    });

    it('exempts minor characters from needing a thread', () => {
        const s = seed();
        const withMinor: SerialState = { ...s, roster: s.roster.map((r) => (r.name === 'Quill' ? { ...r, tier: 'minor' as const } : r)), threads: s.threads.filter((t) => t.id !== 'S4') };
        expect(threadlessOnStage(withMinor, 2)).toEqual([]);
        expect(threadlessOnStage({ ...s, threads: s.threads.filter((t) => t.id !== 'S4') }, 2)).toEqual(['Quill']);
    });

    it('hands a dead character’s threads to an heir, or marks them for an on-page write-off', () => {
        const s = seed();
        const inherited = reassignThreadsOf(s, 'Quill', 'Tobin');
        expect(inherited.threads.find((t) => t.id === 'S4')!.owners).toEqual(['Tobin']);
        expect(inherited.roster.find((r) => r.name === 'Tobin')!.thread_ids).toContain('S4');
        expect(inherited.roster.find((r) => r.name === 'Quill')!.thread_ids).toEqual([]);

        const dropped = reassignThreadsOf(s, 'Quill');
        expect(dropped.threads.find((t) => t.id === 'S4')!.status).toBe('abandoned');

        // A co-owned thread simply loses that owner.
        expect(reassignThreadsOf(s, 'Ilse').threads.find((t) => t.id === 'S2')!.owners).toEqual(['Mara']);
    });
});

describe('domain/serial: story time', () => {
    const published = [{ number: 1, time: { mode: 'forward' as const, start: { day: 0 }, end: { day: 60 } } }];

    it('accepts a flashback that ends before the arc it sits behind and recasts a thread', () => {
        expect(checkArcTimeFits({ mode: 'flashback', start: { day: -400 }, end: { day: -10 }, relative_to_arc: 1, reframes: ['S1'] }, published)).toEqual([]);
        expect(checkArcTimeFits({ mode: 'forward', start: { day: 61 } }, published)).toEqual([]);
    });

    it('flags a flashback that runs into published days or recasts nothing', () => {
        const problems = checkArcTimeFits({ mode: 'flashback', start: { day: -20 }, end: { day: 5 }, relative_to_arc: 1 }, published);
        expect(problems).toEqual([
            'flashback ends on day 5, after arc 1 starts on day 0',
            'flashback names no thread it answers or recasts',
            'overlaps arc 1 (days 0 to 60): its published scenes are fixed'
        ]);
        expect(checkArcTimeFits({ mode: 'flashback', start: { day: -5 }, relative_to_arc: 7, reframes: ['S1'] }, published)).toEqual(['arc 7 not found']);
    });

    it('treats the overlapping days of a parallel arc as fixed', () => {
        expect(checkArcTimeFits({ mode: 'parallel', start: { day: 10 }, end: { day: 30 } }, published)).toEqual(['overlaps arc 1 (days 0 to 60): its published scenes are fixed']);
    });
});

describe('domain/serial: prompt block', () => {
    it('is empty without a serial or a plan, so existing prompts are unchanged', () => {
        const s = seed();
        expect(formatSerialContext(undefined, undefined)).toBe('');
        expect(formatSerialContext(s, undefined)).toBe('');
        expect(formatSerialContext(undefined, scheduleEpisode(s, 'main', ARCS[0]))).toBe('');
    });

    it('lists the episode plan for a finale', () => {
        const r = run();
        // Rebuild the state as it stood before episode 16 by replaying up to it.
        let s = seed();
        let pending: ArcCastPlan | undefined;
        let finale: EpisodePlan | undefined;
        for (let ep = 2; ep <= 16; ep++) {
            const arc: ArcWindow = { ...ARCS.find((a) => ep >= a.startsAt && ep <= a.endsAt)! };
            if (ep === arc.startsAt) {
                const castPlan = pending ?? planArcCast(s, []);
                pending = undefined;
                s = applyArcCast({ ...s, arc_number: s.arc_number + 1 }, castPlan);
                s = openThreads(s, ep, [{ title: 'arc main', description: '', scope: 'main', owners: castPlan.active.slice(0, 2), weight: 3 }]);
            }
            if (ep === arc.endsAt - 2) pending = planArcCast(s, []);
            const next = pending;
            if (next) arc.leaving = s.roster.filter((x) => x.status === 'active' && !next.active.includes(x.name)).map((x) => x.name);
            const plan = scheduleEpisode(s, 'main', arc);
            if (ep === 16) {
                finale = plan;
                break;
            }
            s = applyEpisodeResult(s, assumeCompliant(s, plan), { arc_number: s.arc_number, kind: 'main', scene_keys: [], hook_kind: plan.hook });
        }
        expect(finale).toEqual(planFor(r, 16));
        const block = formatSerialContext(s, finale);
        expect(block.startsWith('<serial_context arc="2" episode="16" kind="main" phase="finale" time_mode="forward" story_time="Spring, year 1">')).toBe(true);
        expect(block).toContain('<close>');
        expect(block).toContain('<park>');
        expect(block).toContain('<ending hook="reveal"/>');
        expect(block).toContain('Move only the listed threads; others may be mentioned but not changed.');
        expect(block.endsWith('</serial_context>\n\n')).toBe(true);
    });
});
