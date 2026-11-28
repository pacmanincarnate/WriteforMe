/**
 * @module domain/serial/scheduler
 * Decides what the next episode does: which threads it advances, closes, parks or opens, who is due
 * on the page and how it ends. Pure and deterministic; the model still invents what happens.
 */

import { overdueRoster, threadlessOnStage, underUsedRoster } from './cast';
import { applyEpisodeResult, isLive, isOpen, onStageNames } from './threads';
import type {
    ArcPhase,
    ArcWindow,
    EpisodeKind,
    EpisodePlan,
    EpisodeResult,
    HookKind,
    OpenSlot,
    SerialState,
    SerialThread,
    ThreadPolicy
} from './types';

export function phaseOf(episode: number, arc: ArcWindow, p: ThreadPolicy): ArcPhase {
    if (episode >= arc.endsAt) return 'finale';
    if (episode > arc.endsAt - p.wrapUpWindow) return 'wrap_up';
    return episode <= arc.startsAt ? 'opening' : 'middle';
}

/** Higher = more urgent to touch this episode. */
export function threadUrgency(t: SerialThread, episode: number, policy: ThreadPolicy): number {
    const idle = episode - t.last_touched_episode;
    const deadline = t.target_close_episode !== undefined ? Math.max(0, 6 - (t.target_close_episode - episode)) : 0;
    const scopeBias = t.scope === 'main' ? 4 : t.scope === 'series' ? 1 : 2;
    const stale = idle >= policy.maxIdleEpisodes ? 5 : 0;
    return scopeBias + idle * t.weight + deadline + stale;
}

function canClose(t: SerialThread, all: SerialThread[], episode: number, policy: ThreadPolicy): boolean {
    if (!isOpen(t) || t.scope === 'series') return false;
    const age = episode - t.opened_episode;
    if (age < (t.min_episodes_open ?? policy.minEpisodesOpen)) return false;
    // A payoff needs build-up. Age alone let a thread close that had been opened and then ignored.
    if (t.scope === 'side' && t.moves < policy.minTouchesBeforeClose) return false;
    // A thread back from being parked is picked up on the page before it is paid off.
    if (t.resumed_episode !== undefined && t.last_touched_episode < t.resumed_episode) return false;
    return (t.depends_on ?? []).every((id) => all.find((o) => o.id === id)?.status === 'resolved');
}

/** Vary the endings. A payoff episode may end quietly; the rest should pull the reader forward. */
function pickHook(state: SerialState, kind: EpisodeKind, phase: ArcPhase, closing: boolean): HookKind {
    if (kind === 'interlude') return 'quiet';
    if (phase === 'finale') return 'reveal'; // the arc's answer exposes the next question on the series thread
    const recent = state.episodes.slice(-2).map((e) => e.hook_kind);
    // The reveal is saved for the finale once the wrap-up starts.
    const all: HookKind[] = closing ? ['decision', 'quiet', 'reveal'] : ['cliffhanger', 'reversal', 'decision', 'reveal'];
    const options = phase === 'wrap_up' ? all.filter((h) => h !== 'reveal') : all;
    return options.find((h) => !recent.includes(h)) ?? options[0];
}

/** No LLM needed. The last recorded touch of each thread that returns after a gap. */
export function buildPreviously(state: SerialState, threadIds: string[], episode: number, gap = 3): string[] {
    return threadIds
        .map((id) => state.threads.find((t) => t.id === id))
        .filter((t): t is SerialThread => !!t && (t.touches?.length ?? 0) > 0 && episode - t.last_touched_episode >= gap)
        .map((t) => `${t.title}: ${(t.touches ?? [])[(t.touches?.length ?? 1) - 1].note}`);
}

/**
 * Pure and deterministic. Run it for one episode, or through scheduleAhead for a whole sequence.
 * The arc window lets it behave differently at the opening, in the wrap-up and on the finale.
 */
export function scheduleEpisode(state: SerialState, kind: EpisodeKind, arc: ArcWindow): EpisodePlan {
    const episode = state.next_episode;
    const p = state.policy.threads;
    const phase = phaseOf(episode, arc, p);
    const onStage = onStageNames(state, episode);
    const open = state.threads.filter((t) => isLive(t, onStage));
    const warnings: string[] = [];
    const ending = phase === 'wrap_up' || phase === 'finale';
    const leaving = new Set(ending ? (arc.leaving ?? []) : []);
    // A thread is "departing" when nobody who owns it will be on stage next arc.
    const departing = (t: SerialThread) =>
        t.scope === 'side' && t.owners.some((o) => onStage.has(o)) && t.owners.every((o) => leaving.has(o) || !onStage.has(o));

    // Interludes rest the ledger: they touch at most one thread and never close anything.
    const budget = kind === 'interlude' ? 1 : p.maxThreadsPerEpisode;

    // --- closes -----------------------------------------------------------
    const close: string[] = [];
    const main = open.find((t) => t.scope === 'main');
    if (kind === 'main' && main && phase === 'finale' && canClose(main, state.threads, episode, p)) {
        close.push(main.id);
    }
    const lastSideClose = Math.max(
        0,
        ...state.threads.filter((t) => t.scope === 'side' && t.closed_episode !== undefined).map((t) => t.closed_episode as number)
    );
    const sideDue = episode - lastSideClose >= p.closeSideEvery;
    const closable = open
        .filter((t) => t.scope === 'side' && canClose(t, state.threads, episode, p))
        .sort(
            (a, b) =>
                Number(departing(b)) - Number(departing(a)) || // settle departing characters' business first
                (a.target_close_episode ?? Infinity) - (b.target_close_episode ?? Infinity) ||
                a.opened_episode - b.opened_episode
        );
    for (const t of closable) {
        if (close.length >= p.maxClosesPerEpisode + (close.includes(main?.id ?? '') ? 1 : 0)) break;
        const pastDeadline = t.target_close_episode !== undefined && episode >= t.target_close_episode;
        const spacedOut = episode - lastSideClose >= p.minGapBetweenSideCloses;
        const promised = ending && t.intent === 'pay_off' && t.source !== 'model'; // the plan or the user said: this one ends in this arc
        if (departing(t) || promised || (pastDeadline && spacedOut) || sideDue) close.push(t.id);
        else if (pastDeadline) warnings.push(`${t.id} is past its target close; held back to space out payoffs`);
    }
    if (kind === 'interlude') close.length = 0;

    // --- parks ----------------------------------------------------------------
    // On the finale, whatever a departing character could not finish is parked on the page: the reader
    // sees them go and is told what is left hanging. A parked thread is a promise; a silent one is a dropped plot.
    const park = kind === 'main' && phase === 'finale' ? open.filter((t) => departing(t) && !close.includes(t.id)).map((t) => t.id) : [];
    const parkedNow = state.threads.filter((t) => isOpen(t) && t.parked);
    if (parkedNow.length + park.length > p.maxParked) {
        const oldest = [...parkedNow].sort((a, b) => (a.parked?.episode ?? 0) - (b.parked?.episode ?? 0))[0];
        warnings.push(
            `${parkedNow.length + park.length} threads parked, maximum is ${p.maxParked}` +
                (oldest ? `: bring back ${oldest.owners.join(' or ')} or hand ${oldest.id} to someone on stage` : '')
        );
    }
    for (const t of state.threads) {
        if (isOpen(t) && t.scope !== 'series' && !t.parked && t.owners.length > 0 && !t.owners.some((o) => onStage.has(o))) {
            warnings.push(`${t.id} has no owner on stage and was never parked`);
        }
    }

    // --- advances -----------------------------------------------------------
    // The arc's main thread is on the page every main episode; the rest compete on urgency.
    const pinned = kind === 'main' && main && !close.includes(main.id) ? [main.id] : [];
    // The finale always moves the series thread, so every arc pays into the spine.
    const spine =
        kind === 'main' && phase === 'finale'
            ? open.filter((t) => t.scope === 'series').sort((a, b) => a.last_touched_episode - b.last_touched_episode).slice(0, 1).map((t) => t.id)
            : [];
    // An interlude's best use is a check-in on someone the reader has not seen for a while.
    const keep_warm =
        kind === 'interlude' ? [...parkedNow].sort((a, b) => (a.parked?.episode ?? 0) - (b.parked?.episode ?? 0)).slice(0, 1).map((t) => t.id) : [];
    const slots = keep_warm.length ? 0 : Math.max(spine.length, budget - close.length);
    const advance = [
        ...pinned,
        ...spine,
        ...open
            .filter((t) => !close.includes(t.id) && !park.includes(t.id) && !pinned.includes(t.id) && !spine.includes(t.id))
            .sort((a, b) => threadUrgency(b, episode, p) - threadUrgency(a, episode, p))
            .map((t) => t.id)
    ].slice(0, slots);

    // --- opens --------------------------------------------------------------
    const sideAfter = open.filter((t) => t.scope === 'side' && !close.includes(t.id) && !park.includes(t.id)).length;
    const openSlots: OpenSlot[] = [];
    // Nothing new this close to the finale; threads converge there and the next arc opens fresh ones.
    const mayOpen = kind === 'main' && episode <= arc.endsAt - p.noNewSideInLast;
    const maxOpens = p.maxOpensPerEpisode + (phase === 'opening' ? 1 : 0);
    const closingSide = close.find((id) => id !== main?.id);
    if (mayOpen) {
        for (let n = sideAfter; n < p.side.target && openSlots.length < maxOpens; n++) {
            openSlots.push({
                scope: 'side',
                reason: `side threads would be ${n}, target is ${p.side.target}`,
                suggested_owners: underUsedRoster(state, episode, 2),
                grow_from: openSlots.length === 0 ? closingSide : undefined
            });
        }
    }
    // Everyone on stage owns a thread: pair up the threadless on one shared thread while there is room.
    if (mayOpen && state.policy.cast.everyoneOwnsThread) {
        const without = threadlessOnStage(state, episode, close).filter((n) => !leaving.has(n));
        if (without.length > 0 && openSlots.length === 0) {
            if (sideAfter < p.side.max) openSlots.push({ scope: 'side', reason: `${without.join(' and ')} own no open thread`, suggested_owners: without.slice(0, 2), shared: true });
            else warnings.push(`${without.join(', ')} own no open thread, but side threads are at the maximum: add them to an existing thread`);
        } else if (without.length > 0) {
            openSlots[0] = { ...openSlots[0], suggested_owners: without.slice(0, 2), shared: without.length > 1 };
        }
    }
    if (sideAfter > p.side.max) warnings.push(`${sideAfter} side threads open, maximum is ${p.side.max}`);

    // --- staleness and cast -------------------------------------------------
    for (const t of open) {
        const idle = episode - t.last_touched_episode;
        if (idle >= p.maxIdleEpisodes && !advance.includes(t.id) && !close.includes(t.id) && !park.includes(t.id)) {
            warnings.push(`${t.id} untouched for ${idle} episodes`);
        }
    }

    return {
        episode,
        kind,
        phase,
        advance,
        close,
        park,
        keep_warm,
        open: openSlots,
        due_on_page: overdueRoster(state, episode),
        hook: pickHook(state, kind, phase, close.length > 0),
        previously: buildPreviously(state, [...advance, ...close, ...keep_warm], episode),
        warnings
    };
}

/**
 * The app plans scenes one sequence at a time (generateScenes), so one-episode plans arrive too late.
 * This runs the scheduler forward, assuming the writer does as told, and returns a provisional plan per episode.
 * The sequence planner gets all of them; each is recomputed from what actually happened once its episode is next.
 */
export function scheduleAhead(state: SerialState, count: number, arc: ArcWindow): EpisodePlan[] {
    const plans: EpisodePlan[] = [];
    let s = state;
    for (let i = 0; i < count; i++) {
        const plan = scheduleEpisode(s, 'main', arc);
        plans.push(plan);
        s = applyEpisodeResult(s, assumeCompliant(s, plan), { arc_number: s.arc_number, kind: 'main', scene_keys: [], hook_kind: plan.hook });
    }
    return plans;
}

/** The result of an episode whose writer did exactly what the plan said. */
export function assumeCompliant(state: SerialState, plan: EpisodePlan): EpisodeResult {
    const touched = [...plan.advance, ...plan.close, ...plan.park, ...plan.keep_warm];
    const owners = touched.flatMap((id) => state.threads.find((t) => t.id === id)?.owners ?? []);
    const onStage = onStageNames(state, plan.episode);
    // An interlude may put a resting character on the page; a main episode may not.
    const present = [...new Set([...owners, ...plan.due_on_page])].filter((n) => plan.kind === 'interlude' || onStage.has(n));
    return {
        episode: plan.episode,
        characters_present: present,
        pov: present[0],
        thread_updates: [
            ...plan.advance.map((id) => ({ id, change: 'advanced' as const, note: `moved in episode ${plan.episode}` })),
            ...plan.close.map((id) => ({ id, change: 'resolved' as const, note: `paid off in episode ${plan.episode}` })),
            ...plan.park.map((id) => ({ id, change: 'parked' as const, note: `left hanging when its owner departed in episode ${plan.episode}` })),
            ...plan.keep_warm.map((id) => ({ id, change: 'kept_warm' as const, note: `checked in on during the interlude, episode ${plan.episode}` }))
        ],
        opened: plan.open.map((o) => ({
            title: 'new side',
            description: '',
            scope: o.scope,
            owners: o.shared ? o.suggested_owners : o.suggested_owners.slice(0, 1),
            weight: 2 as const,
            target_in: 6,
            spawned_from: o.grow_from
        }))
    };
}
