/**
 * @module domain/serial/cast
 * Cast rotation: who is due on the page, who owns no thread, and who is seated for the next arc.
 */

import { isHeld, isOpen } from './threads';
import type { ArcCastPlan, CastPolicy, RosterEntry, SerialState } from './types';

export const isAnchor = (r: RosterEntry, c: CastPolicy) => c.rotation === 'anchored' && r.anchored === true;

export function overdueRoster(state: SerialState, episode: number): string[] {
    const c = state.policy.cast;
    return state.roster
        .filter((r) => r.status === 'active' && (r.rest_until_episode ?? 0) <= episode)
        .filter((r) => {
            // The clock starts when a character comes back, so a return is not an instant alarm.
            const absent = episode - Math.max(r.last_on_page_episode, r.active_since_episode ?? 0);
            if (isAnchor(r, c)) return absent >= c.anchorMaxAbsence;
            return r.tier === 'core' ? absent >= c.coreMaxAbsence : r.tier === 'supporting' ? absent >= c.supportingMaxAbsence : false;
        })
        .map((r) => r.name);
}

/** On-stage characters who will own no open main or side thread once `closing` threads are paid off. */
export function threadlessOnStage(state: SerialState, episode: number, closing: string[] = []): string[] {
    const live = state.threads.filter((t) => isOpen(t) && t.scope !== 'series' && !closing.includes(t.id));
    return state.roster
        .filter((r) => r.status === 'active' && (r.rest_until_episode ?? 0) <= episode)
        .filter((r) => state.policy.cast.threadRequiredTiers.includes(r.tier)) // throw-away characters need no thread
        .filter((r) => !live.some((t) => t.owners.includes(r.name)))
        .sort((a, b) => a.last_on_page_episode - b.last_on_page_episode)
        .map((r) => r.name);
}

/** Active, not resting, owning the fewest open threads: good owners for a new thread. */
export function underUsedRoster(state: SerialState, episode: number, n: number): string[] {
    const openIds = new Set(state.threads.filter(isOpen).map((t) => t.id));
    return state.roster
        .filter((r) => r.status === 'active' && (r.rest_until_episode ?? 0) <= episode)
        .map((r) => ({ r, load: r.thread_ids.filter((id) => openIds.has(id)).length }))
        .sort((a, b) => a.load - b.load || a.r.last_on_page_episode - b.r.last_on_page_episode)
        .slice(0, n)
        .map((x) => x.r.name);
}


/**
 * Picks who is on stage for the next arc. The four-corner web is then built from `active`.
 * Anchored mode: anchors take their seats first and the rest rotate through what is left.
 * Ensemble mode: everyone, the lead included, competes for seats; a long absence pulls them back.
 * Call it at the start of the wrap-up window, not after the finale, so the current arc can
 * settle the business of whoever is about to leave.
 */
export function planArcCast(state: SerialState, mainOwners: string[]): ArcCastPlan {
    const c = state.policy.cast;
    const ep = state.next_episode;
    const openIds = new Set(state.threads.filter(isOpen).map((t) => t.id));
    const available = state.roster.filter((r) => (r.status === 'active' || r.status === 'resting') && (r.rest_until_episode ?? 0) <= ep);
    const anchors = available.filter((r) => isAnchor(r, c));
    const rotating = available.filter((r) => !isAnchor(r, c));
    // Thread-led: how long has this character's most neglected open thread (side or main) waited?
    const absence = (r: RosterEntry) => ep - r.last_on_page_episode;
    const oldestIdle = (r: RosterEntry) => {
        const own = state.threads.filter((t) => openIds.has(t.id) && t.scope !== 'series' && !isHeld(t) && t.owners.includes(r.name));
        // A character with no thread is owed one: their time away counts as that thread's age.
        if (own.length === 0) return c.everyoneOwnsThread && c.threadRequiredTiers.includes(r.tier) ? absence(r) : 0;
        // A parked thread waits from the day it was parked; an interlude check-in does not reset that.
        return Math.max(...own.map((t) => ep - (t.parked ? t.parked.episode : t.last_touched_episode)));
    };
    const by = c.rotateBy;
    const pull = (r: RosterEntry) =>
        by === 'oldest_thread'
            ? Math.min(40, oldestIdle(r)) * 3 + Math.min(10, absence(r)) / 10 // absence only breaks ties
            : by === 'longest_absent'
              ? Math.min(30, absence(r)) + r.thread_ids.filter((id) => openIds.has(id)).length * 6
              : Math.min(40, oldestIdle(r)) * 2 + Math.min(30, absence(r));
    // Whatever the seat priority, nobody rests past the cap for their tier.
    const restCap = (r: RosterEntry) => (r.tier === 'core' ? c.maxArcsRested.core : r.tier === 'supporting' ? c.maxArcsRested.supporting : Infinity);
    // Being on page just now costs a little so the spotlight moves.
    const score = (r: RosterEntry) =>
        (mainOwners.includes(r.name) ? 100 : 0) +
        (r.tier === 'core' ? 12 : r.tier === 'supporting' ? 6 : 0) +
        ((r.rested_arcs ?? 0) >= restCap(r) ? 80 : 0) +
        pull(r) -
        (absence(r) <= 4 ? 10 : 0) -
        (c.rotation === 'ensemble' ? Math.round((25 * r.appearances) / Math.max(1, ep - 1)) : 0); // ensemble: share the spotlight
    const room = Math.max(0, c.maxActivePerArc - c.introductionsPerArc.min - anchors.length);
    let ranked = [...rotating].sort((a, b) => score(b) - score(a));
    if (c.rotation === 'ensemble') {
        // Bridge: the most recently seen characters keep enough seats that the new arc is not a stranger's story.
        const bridge = ranked.filter((r) => r.status === 'active').slice(0, c.minCarryover);
        ranked = [...bridge, ...ranked.filter((r) => !bridge.includes(r))];
    }
    const active = [...anchors.map((r) => r.name), ...ranked.slice(0, room).map((r) => r.name)];
    return {
        anchors: anchors.map((r) => r.name),
        active,
        resting: ranked.slice(room).map((r) => r.name),
        introductions: Math.min(c.introductionsPerArc.max, c.maxActivePerArc - active.length)
    };
}

/**
 * Pure. Marks the arc's cast active and everyone else available as resting (dead and retired stay put).
 * A returning owner un-parks their threads, which must then be touched again before they can close.
 */
export function applyArcCast(state: SerialState, plan: ArcCastPlan): SerialState {
    const on = new Set(plan.active);
    const ep = state.next_episode;
    return {
        ...state,
        roster: state.roster.map((r) => {
            if (r.status === 'dead' || r.status === 'retired' || r.status === 'guest') return r;
            const active = on.has(r.name);
            return {
                ...r,
                status: active ? ('active' as const) : ('resting' as const),
                active_since_episode: active && r.status !== 'active' ? ep : r.active_since_episode,
                rested_arcs: active ? 0 : (r.rested_arcs ?? 0) + 1
            };
        }),
        threads: state.threads.map((t) => (t.parked && isOpen(t) && t.owners.some((o) => on.has(o)) ? { ...t, parked: undefined, resumed_episode: ep } : t))
    };
}

/**
 * A thread must never outlive its owners silently. When a character dies or retires, each open thread
 * they own alone passes to `heir` (someone on stage), or is marked abandoned so the board asks for an
 * on-page write-off. Co-owned threads simply lose that owner.
 */
export function reassignThreadsOf(state: SerialState, name: string, heir?: string): SerialState {
    return {
        ...state,
        threads: state.threads.map((t) => {
            if (!isOpen(t) || !t.owners.includes(name)) return t;
            const rest = t.owners.filter((o) => o !== name);
            if (rest.length > 0) return { ...t, owners: rest };
            return heir ? { ...t, owners: [heir], parked: undefined } : { ...t, status: 'abandoned' as const, last_note: `${name} is gone: write this off on the page` };
        }),
        roster: state.roster.map((r) => {
            const inherited = heir === r.name ? state.threads.filter((t) => isOpen(t) && t.owners.length === 1 && t.owners[0] === name).map((t) => t.id) : [];
            return r.name === name ? { ...r, thread_ids: [] } : { ...r, thread_ids: [...r.thread_ids, ...inherited] };
        })
    };
}
