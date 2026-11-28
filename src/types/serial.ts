/**
 * Serial fiction types: the thread ledger view, the cast roster, episodes and story time.
 * A serial is a series whose "books" are arcs. Every field is optional on a story: a story
 * without `serial` is a standalone book or a plain series book and behaves exactly as before.
 */

import type { OpenThread, OpenThreadUpdate } from './series';

/**
 * series = spans many arcs (the serial's spine, rarely closes)
 * main   = this arc's A-story, closes at the arc climax
 * side   = B/C-sized threads that open and close every few episodes
 */
export type ThreadScope = 'series' | 'main' | 'side';

/** What the serial layer records about one ledger thread. Kept beside the thread, keyed by its id. */
export interface SerialThreadMeta {
    scope: ThreadScope;
    opened_episode: number; // global episode counter, not per arc
    last_touched_episode: number;
    target_close_episode?: number; // soft deadline set when it opens
    min_episodes_open?: number; // do not close before this many episodes (default from policy)
    weight: 1 | 2 | 3; // page-time appetite: 1 = a line or two, 3 = carries scenes
    depends_on?: string[]; // cannot close until these are resolved
    closed_episode?: number;
    moves: number; // episodes that moved this thread; a payoff needs build-up, not just age
    last_moved_episode?: number; // so several scenes of one episode count as one move
    parked?: { episode: number; note: string }; // owners left the stage and the reader was told why, on the page
    resumed_episode?: number; // set when a parked thread's owner returns; it must be touched again before it can close
    spawned_from?: string; // the closed thread this one grew out of: payoffs should raise the next question
}

/**
 * A series thread seen through the serial layer. The thread itself (id, title, status, intent,
 * touches) is the book-series `OpenThread`; the serial fields come from `SerialThreadMeta`.
 */
export interface SerialThread extends OpenThread, SerialThreadMeta {
    owners: string[]; // roster names whose thread this is
}

/** Serial-only changes the continuity call may report on top of the series ones. */
export type SerialThreadUpdate = OpenThreadUpdate | { id: string; change: 'parked' | 'kept_warm'; note: string };

export interface ThreadPolicy {
    main: { max: number }; // usually 1, 2 for ensemble arcs
    side: { min: number; target: number; max: number }; // the "x# open threads" knob
    series: { max: number };
    maxThreadsPerEpisode: number; // how many threads one episode may touch
    maxIdleEpisodes: number; // a thread untouched this long is flagged stale
    closeSideEvery: number; // close at least one side thread every N episodes
    minGapBetweenSideCloses: number; // spread payoffs out even when deadlines bunch up
    minEpisodesOpen: number; // default maturity before a side thread may close
    maxOpensPerEpisode: number;
    maxClosesPerEpisode: number;
    minTouchesBeforeClose: number; // a side thread needs this many touches before it may pay off
    wrapUpWindow: number; // last N episodes of an arc: departing characters' threads are closed or parked
    noNewSideInLast: number; // no new side threads this close to the finale (the next arc opens them)
    maxParked: number; // parked threads are promises; more than this and the reader loses track
}


export type RosterStatus = 'active' | 'resting' | 'guest' | 'retired' | 'dead';
export type RosterTier = 'core' | 'supporting' | 'minor';

export interface RosterEntry {
    name: string; // joins to CastMember.name, same as mergeReturningCast
    tier: RosterTier;
    status: RosterStatus;
    introduced_episode: number;
    last_on_page_episode: number;
    appearances: number; // episodes on page
    pov_episodes: number;
    rest_until_episode?: number; // planned absence (off on a quest, in prison...)
    thread_ids: string[]; // threads they own
    anchored?: boolean; // the MC or a fixed core member; only used when rotation is 'anchored'
    active_since_episode?: number; // a character just back from rest is not instantly "due on page"
    rested_arcs?: number; // consecutive arcs spent resting
}

/**
 * anchored = a fixed MC (and optionally a fixed core) is in every arc; everyone else rotates.
 * ensemble = nobody is fixed: anyone, the lead included, can rotate out for an arc and back in.
 * Chosen per serial at setup and changeable later; the user can still rest anyone by hand.
 */
export type CastRotation = 'anchored' | 'ensemble';

/**
 * What decides who gets a rotating seat in the next arc.
 * oldest_thread  = owners of the open thread that has gone untouched longest come back first (thread-led)
 * longest_absent = whoever has been off the page longest comes back first (character-led)
 * balanced       = both, thread age counting slightly more
 */
export type RotateBy = 'oldest_thread' | 'longest_absent' | 'balanced';

export interface CastPolicy {
    rotation: CastRotation;
    rotateBy: RotateBy;
    anchorMaxAbsence: number; // anchored mode: an anchor off-page this many main episodes is due (1 = every episode)
    maxActivePerArc: number; // the four corners plus a few
    maxPovPerArc: number;
    coreMaxAbsence: number; // a core character off-page longer than this is "overdue"
    supportingMaxAbsence: number;
    introductionsPerArc: { min: number; max: number };
    everyoneOwnsThread: boolean; // every on-stage character in the tiers below must own (or co-own) one open thread; the threadless are owed a seat
    threadRequiredTiers: RosterTier[]; // minor characters and guests are exempt by default
    minCarryover: number; // ensemble mode: keep at least this many from the last arc so readers have a bridge
    requireThreadForNewCharacter: boolean; // a newcomer must own or serve a thread
    maxArcsRested: { core: number; supporting: number }; // backstop so no one the reader loves vanishes for good
}


/** In-world time as a day index from the serial's day 0. Sortable, cheap, calendar-agnostic. */
export interface StoryTime {
    day: number;
    label?: string; // 'Winter, year 3' for display and prompts
}

export type ArcTimeMode = 'forward' | 'flashback' | 'parallel';

export interface ArcTime {
    mode: ArcTimeMode;
    start: StoryTime;
    end?: StoryTime; // known once the arc is planned
    relative_to_arc?: number; // a flashback names the arc it sits before
    reframes?: string[]; // thread ids this flashback answers or recasts; a flashback with none is backstory for its own sake
}

export type EpisodeKind = 'main' | 'interlude';

/** How an episode ends. Serial readers leave at episode breaks, so the ending is planned, and varied. */
export type HookKind = 'cliffhanger' | 'reversal' | 'decision' | 'reveal' | 'quiet';

export interface Episode {
    number: number; // global, release order
    arc_number: number;
    kind: EpisodeKind;
    scene_keys: string[]; // existing "seq-scene" keys, so prose storage is untouched
    story_time?: StoryTime;
    pov?: string;
    previously?: string; // one or two reader-facing lines
    ending_hook?: string;
    hook_kind?: HookKind; // so the scheduler can vary how episodes end
    released?: boolean;
}

export interface SerialPolicy {
    threads: ThreadPolicy;
    cast: CastPolicy;
    episodesPerSequence: number; // 1-3: a sequence's scenes are split evenly into this many episodes, so an arc's length is known up front
    interludeAfterArcs?: number; // interludes sit between arcs (after every Nth arc), never mid-arc on a counter
}

/** The scheduler's working view: the ledger joined with the serial fields. Built from a story by `serialStateOf`. */
export interface SerialState {
    arc_number: number;
    arc_time: ArcTime;
    policy: SerialPolicy;
    threads: SerialThread[];
    roster: RosterEntry[];
    episodes: Episode[];
    next_episode: number;
    next_thread_id: number;
}

export interface OpenSlot {
    scope: 'side' | 'main';
    reason: string; // 'side threads below minimum', 'replace S4'
    suggested_owners: string[]; // under-used roster members
    shared?: boolean; // true = give the thread to all suggested owners together (keeps the thread count down)
    grow_from?: string; // the thread closing this episode; the new question should come out of that payoff
}

/** Where the episode sits in its arc. `leaving` is the cast that will rest next arc, known from the wrap-up window on. */
export interface ArcWindow {
    startsAt: number;
    endsAt: number;
    leaving?: string[];
}
export type ArcPhase = 'opening' | 'middle' | 'wrap_up' | 'finale';

export interface EpisodePlan {
    episode: number;
    kind: EpisodeKind;
    phase: ArcPhase;
    advance: string[]; // thread ids to move forward
    close: string[]; // thread ids to pay off in this episode
    park: string[]; // threads whose owners leave after this arc: show the exit and say what is left hanging
    keep_warm: string[]; // parked threads an interlude checks in on, without moving them
    open: OpenSlot[]; // the LLM invents the thread, the scheduler only reserves the slot
    due_on_page: string[]; // roster names overdue for an appearance
    hook: HookKind; // how the episode should end
    previously: string[]; // reader-facing recap lines for threads coming back after a gap
    warnings: string[];
}

export interface ArcCastPlan {
    anchors: string[]; // always cast; never rested by the planner (anchored mode only)
    active: string[]; // anchors first, then rotating picks; feeds Tier 0.1 as <returning_cast>
    resting: string[]; // stays in the roster, not cast this arc
    introductions: number; // how many new characters Tier 0.1 may invent
}

export interface EpisodeResult {
    episode: number;
    characters_present: string[]; // union of the episode's scenes, no LLM needed
    pov?: string;
    thread_updates: SerialThreadUpdate[]; // from the per-scene continuity call
    opened: Array<Pick<SerialThread, 'title' | 'description' | 'scope' | 'owners' | 'weight' | 'spawned_from'> & { target_in?: number }>;
}

export type NewThread = EpisodeResult['opened'][number];

/**
 * Lives on `Story.serial`, beside `series`. Absent = not a serial. The threads themselves stay in
 * `Story.open_threads` (the series ledger); the arc number is `series.book_number`.
 */
export interface SerialInfo {
    arc_time: ArcTime;
    policy: SerialPolicy;
    roster: RosterEntry[];
    episodes: Episode[];
    /** Global number of this arc's first episode. */
    arc_first_episode: number;
    thread_meta: Record<string, SerialThreadMeta>;
    /** Episode plans as the scene planner saw them, keyed by episode number, for this arc only. */
    plans: Record<string, EpisodePlan>;
    /** Picked at the start of the wrap-up: who is seated in the next arc. */
    next_cast?: ArcCastPlan;
    /** The cast plan this arc was started with. The cast step is asked to follow it. */
    seated?: ArcCastPlan;
}
