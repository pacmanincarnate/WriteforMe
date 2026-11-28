/**
 * @module domain/serial/threads
 * The thread ledger: which threads are open or live, and how an episode's outcome is folded back in.
 */

import type { Episode, EpisodeResult, NewThread, SerialState, SerialThread } from './types';

export const isOpen = (t: SerialThread) => t.status === 'open' || t.status === 'advanced';
/** The arc plan says to leave this thread alone for now (series intent `rest` or `defer`). */
export const isHeld = (t: SerialThread) => t.intent === 'defer' || t.intent === 'rest';
/** Names of the characters who may appear in a main episode right now. */
export const onStageNames = (state: SerialState, episode: number) =>
    new Set(state.roster.filter((r) => r.status === 'active' && (r.rest_until_episode ?? 0) <= episode).map((r) => r.name));

/** Live = the scheduler may use it now. Parked, user-deferred and ownerless-off-stage threads are not live. */
export function isLive(t: SerialThread, onStage: Set<string>): boolean {
    if (!isOpen(t) || t.parked || isHeld(t)) return false;
    return t.scope === 'series' || t.owners.length === 0 || t.owners.some((o) => onStage.has(o));
}

/** Pure. Returns a new state, so undoing an episode is a matter of keeping the previous one. */
export function applyEpisodeResult(state: SerialState, r: EpisodeResult, episodeMeta: Omit<Episode, 'number'>): SerialState {
    const byId = new Map(r.thread_updates.map((u) => [u.id, u]));
    const threads: SerialThread[] = state.threads.map((t) => {
        const u = byId.get(t.id);
        if (!u) return t;
        const touches = [...(t.touches ?? []), { book: state.arc_number, scene: `ep${r.episode}`, note: u.note }];
        const base = { ...t, touches, last_touched_episode: r.episode, last_note: `Ep ${r.episode}: ${u.note}` };
        if (u.change === 'kept_warm') return base; // reminds the reader; does not move or un-park the thread
        if (u.change === 'parked') return { ...base, parked: { episode: r.episode, note: u.note } };
        const resolved = u.change === 'resolved';
        return {
            ...base,
            status: resolved ? 'resolved' : 'advanced',
            moves: t.moves + 1,
            closed_episode: resolved ? r.episode : t.closed_episode
        };
    });
    const withNew = openThreads({ ...state, threads }, r.episode, r.opened);
    const present = new Set(r.characters_present);
    const roster = state.roster.map((e) =>
        present.has(e.name)
            ? {
                  ...e,
                  last_on_page_episode: r.episode,
                  appearances: e.appearances + 1,
                  pov_episodes: e.pov_episodes + (r.pov === e.name ? 1 : 0),
              }
            : e
    );
    return {
        ...withNew,
        roster: roster.map((e) => ({ ...e, thread_ids: withNew.roster.find((w) => w.name === e.name)?.thread_ids ?? e.thread_ids })),
        episodes: [...state.episodes, { ...episodeMeta, number: r.episode }],
        next_episode: r.episode + 1
    };
}


/** Pure. Adds threads with fresh ids and links them to their owners in the roster. */
export function openThreads(state: SerialState, episode: number, opened: NewThread[]): SerialState {
    let nextId = state.next_thread_id;
    const added: SerialThread[] = opened.map((o) => ({
        id: `S${nextId++}`,
        title: o.title,
        description: o.description,
        status: 'open',
        origin_book: state.arc_number,
        scope: o.scope,
        owners: o.owners,
        weight: o.weight,
        opened_episode: episode,
        last_touched_episode: episode,
        target_close_episode: o.target_in !== undefined ? episode + o.target_in : undefined,
        moves: 1, // the episode that opens a thread is its first beat
        touches: [],
        source: 'model',
        spawned_from: o.spawned_from
    }));
    const roster = state.roster.map((e) => ({
        ...e,
        thread_ids: [...e.thread_ids, ...added.filter((t) => t.owners.includes(e.name)).map((t) => t.id)]
    }));
    return { ...state, threads: [...state.threads, ...added], roster, next_thread_id: nextId };
}
