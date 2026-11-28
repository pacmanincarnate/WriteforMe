/**
 * @module domain/serial/story
 * Joins the serial layer to a story. A serial is a series story (`series` header, one story per
 * arc) that also carries `serial`. Its threads are the series ledger (`open_threads`); this module
 * builds the scheduler's view of them, lays episodes over the arc's sequences, stores the plans
 * the scene planner saw, and folds each drafted scene back into the roster and the ledger.
 * Everything here is pure, and every entry point passes a non-serial story through untouched.
 */

import { buildEndingContract, formatEndingContract } from '@/domain/series/contract';
import { isSeriesStory } from '@/domain/series/plan';
import { formatSeriesContinuityAddendum, formatSeriesSceneDirectives } from '@/domain/series/prompts';
import { applySeriesSceneReport, type SeriesSceneReport, type SeriesSceneReportResult } from '@/domain/series/sceneReport';
import { isThreadOpen } from '@/domain/series/threads';
import type {
    ArcCastPlan,
    ArcWindow,
    CastRotation,
    EpisodePlan,
    OpenThread,
    RosterEntry,
    RosterTier,
    RotateBy,
    SerialInfo,
    SerialState,
    SerialThread,
    SerialThreadMeta,
    SeriesInfo,
    Story
} from '@/types';
import { applyArcCast, planArcCast } from './cast';
import { formatSerialContext } from './promptBlock';
import { phaseOf, scheduleAhead, scheduleEpisode } from './scheduler';
import { DEFAULT_CAST_POLICY, DEFAULT_THREAD_POLICY } from './types';

export type SerialStory = Partial<Story> & { series: SeriesInfo; serial: SerialInfo };

export interface SerialSetup {
    rotation?: CastRotation;
    rotateBy?: RotateBy;
    episodesPerSequence?: number;
}

/** Where one scene sits in the arc. `sceneIdx` is 0-based; `seqNum` is the sequence's number (1-based). */
export interface SerialScenePosition {
    seqNum: number;
    sceneIdx: number;
    sceneCount: number;
    sequenceCount: number;
}

export interface SerialSceneFacts extends SerialScenePosition {
    /** The existing `"seq-scene"` prose key. */
    sceneKey: string;
    charactersPresent: string[];
    pov?: string;
}

export type SerialThreadNote = { id: string; change: 'parked' | 'kept_warm'; note: string };
export type SerialSceneReport = SeriesSceneReport & { serial_thread_notes?: SerialThreadNote[] };

export interface LongformSceneReportResult extends Omit<SeriesSceneReportResult, 'patch'> {
    patch: SeriesSceneReportResult['patch'] & { serial?: SerialInfo };
    /** Plain notes about the episode plan, for the user: what was planned and did not happen. */
    serialNotes: string[];
}

const clampInt = (val: unknown, min: number, max: number, fallback: number) => {
    const n = Math.floor(Number(val));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const lower = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export function isSerialStory(story: Partial<Story> | null | undefined): story is SerialStory {
    return isSeriesStory(story) && Boolean(story.serial) && typeof story.serial === 'object';
}

export function createSerialInfo(setup: SerialSetup = {}): SerialInfo {
    return {
        arc_time: { mode: 'forward', start: { day: 0 } },
        policy: {
            threads: { ...DEFAULT_THREAD_POLICY },
            cast: {
                ...DEFAULT_CAST_POLICY,
                rotation: setup.rotation === 'ensemble' ? 'ensemble' : 'anchored',
                rotateBy: setup.rotateBy ?? DEFAULT_CAST_POLICY.rotateBy
            },
            episodesPerSequence: clampInt(setup.episodesPerSequence, 1, 3, 2)
        },
        roster: [],
        episodes: [],
        arc_first_episode: 1,
        thread_meta: {},
        plans: {}
    };
}

/** Load-time guard. A story without `serial` passes through untouched; a broken one is repaired or dropped. */
export function normalizeSerialFields<T extends Record<string, unknown>>(story: T): T {
    if (!story || typeof story !== 'object' || !('serial' in story)) return story;
    const s = story as Record<string, unknown>;
    const raw = s.serial as Partial<SerialInfo> | null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isSeriesStory(s as Partial<Story>)) {
        delete s.serial;
        return story;
    }
    const base = createSerialInfo();
    const policy = (raw.policy || {}) as Partial<SerialInfo['policy']>;
    const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    s.serial = {
        ...raw,
        arc_time: isRecord(raw.arc_time) && isRecord(raw.arc_time.start) ? raw.arc_time : base.arc_time,
        policy: {
            threads: { ...base.policy.threads, ...(isRecord(policy.threads) ? policy.threads : {}) },
            cast: { ...base.policy.cast, ...(isRecord(policy.cast) ? policy.cast : {}) },
            episodesPerSequence: clampInt(policy.episodesPerSequence, 1, 3, base.policy.episodesPerSequence),
            ...(policy.interludeAfterArcs ? { interludeAfterArcs: policy.interludeAfterArcs } : {})
        },
        roster: Array.isArray(raw.roster) ? raw.roster.filter((r) => r && typeof r.name === 'string' && r.name) : [],
        episodes: Array.isArray(raw.episodes) ? raw.episodes.filter((e) => e && Number.isFinite(e.number)) : [],
        arc_first_episode: clampInt(raw.arc_first_episode, 1, Number.MAX_SAFE_INTEGER, 1),
        thread_meta: isRecord(raw.thread_meta) ? raw.thread_meta : {},
        plans: isRecord(raw.plans) ? raw.plans : {}
    } as SerialInfo;
    return story;
}

// --- episodes over sequences ----------------------------------------------------

const perSequence = (serial: SerialInfo) => clampInt(serial.policy.episodesPerSequence, 1, 3, 2);

/** The global episode numbers that sequence `seqNum` holds. An arc's length is `sequences x episodesPerSequence`. */
export function episodesOfSequence(story: SerialStory, seqNum: number): number[] {
    const k = perSequence(story.serial);
    const first = story.serial.arc_first_episode + (Math.max(1, Math.floor(seqNum)) - 1) * k;
    return Array.from({ length: k }, (_, i) => first + i);
}

/** The episode a scene belongs to: a sequence's scenes are split evenly, in order. */
export function episodeOfScene(story: SerialStory, pos: SerialScenePosition): { episode: number; isFirst: boolean; isLast: boolean } {
    const eps = episodesOfSequence(story, pos.seqNum);
    const count = Math.max(1, pos.sceneCount);
    const chunk = (idx: number) => Math.min(eps.length - 1, Math.floor((Math.max(0, idx) * eps.length) / count));
    const here = chunk(pos.sceneIdx);
    return {
        episode: eps[here],
        isFirst: pos.sceneIdx === 0 || chunk(pos.sceneIdx - 1) !== here,
        isLast: pos.sceneIdx >= count - 1 || chunk(pos.sceneIdx + 1) !== here
    };
}

function leavingNames(serial: SerialInfo): string[] {
    if (!serial.next_cast) return [];
    const staying = new Set(serial.next_cast.active.map(lower));
    return serial.roster.filter((r) => r.status === 'active' && !staying.has(lower(r.name))).map((r) => r.name);
}

export function arcWindowOf(story: SerialStory, sequenceCount = 8): ArcWindow {
    const first = story.serial.arc_first_episode;
    const count = Math.max(1, Math.floor(sequenceCount) || 8) * perSequence(story.serial);
    return { startsAt: first, endsAt: first + count - 1, leaving: leavingNames(story.serial) };
}

// --- roster and ledger view -------------------------------------------------------

type CastLike = { name?: unknown; corner_role?: unknown; is_initial_cast?: unknown };

function castOf(story: Partial<Story>): CastLike[] {
    return (Array.isArray(story.cast) ? (story.cast as CastLike[]) : []).filter((c) => c && lower(c.name));
}

function leadName(story: Partial<Story>): string | undefined {
    const cast = castOf(story);
    const lead = cast.find((c) => lower(c.corner_role) === 'main_character') || cast[0];
    return lead ? String(lead.name).trim() : undefined;
}

function tierOf(c: CastLike): RosterTier {
    if (lower(c.corner_role)) return 'core';
    return c.is_initial_cast ? 'supporting' : 'minor';
}

/**
 * Brings the roster in line with the story's cast: the cast the arc was actually given is who is on
 * stage, whatever the plan asked for. A parked thread whose owner is back is picked up again.
 * A story with no cast yet (a new arc before its cast step) is left as it is.
 */
export function syncSerial(story: SerialStory, episode: number): SerialInfo {
    const serial = story.serial;
    const cast = castOf(story);
    if (cast.length === 0) return serial;
    const onStage = new Map(cast.map((c) => [lower(c.name), c]));
    const known = new Set(serial.roster.map((r) => lower(r.name)));
    const lead = lower(leadName(story));
    const anchored = serial.policy.cast.rotation === 'anchored';
    const hasAnchor = serial.roster.some((r) => r.anchored);
    const roster: RosterEntry[] = serial.roster.map((r) => {
        if (r.status === 'dead' || r.status === 'retired' || r.status === 'guest') return r;
        const active = onStage.has(lower(r.name));
        if (active === (r.status === 'active')) return r;
        return active
            ? { ...r, status: 'active' as const, active_since_episode: episode, rested_arcs: 0 }
            : { ...r, status: 'resting' as const };
    });
    cast.forEach((c) => {
        const key = lower(c.name);
        if (known.has(key)) return;
        known.add(key);
        roster.push({
            name: String(c.name).trim(),
            tier: tierOf(c),
            status: 'active',
            introduced_episode: episode,
            last_on_page_episode: Math.max(0, episode - 1),
            appearances: 0,
            pov_episodes: 0,
            thread_ids: [],
            active_since_episode: episode,
            ...(anchored && !hasAnchor && key === lead ? { anchored: true } : {})
        });
    });
    const activeNames = new Set(roster.filter((r) => r.status === 'active').map((r) => lower(r.name)));
    const ownersOf = new Map((story.open_threads || []).map((t) => [t.id, (t.owners || []).map(lower)]));
    const thread_meta: Record<string, SerialThreadMeta> = {};
    Object.entries(serial.thread_meta).forEach(([id, m]) => {
        // Parked in an earlier arc and the owner is in this arc's cast: the thread is picked up again.
        const back = m.parked && m.parked.episode < serial.arc_first_episode && (ownersOf.get(id) || []).some((o) => activeNames.has(o));
        thread_meta[id] = back ? { ...m, parked: undefined, resumed_episode: episode } : m;
    });
    return { ...serial, roster, thread_meta };
}

function defaultMeta(t: OpenThread, serial: SerialInfo): SerialThreadMeta {
    const first = serial.arc_first_episode;
    // A thread the story opened, or one the plan pays off in this arc, is arc-sized. The rest are the spine.
    const side = t.source === 'model' || t.intent === 'pay_off';
    const moved = (t.touches || []).filter((x) => x.scene !== 'plan').length;
    return {
        scope: side ? 'side' : 'series',
        opened_episode: first,
        last_touched_episode: Math.max(0, first - 1),
        weight: side ? 2 : 1,
        moves: Math.max(1, moved)
    };
}

/** The serial fields of one ledger thread, with defaults for a thread the serial layer has not seen yet. */
export function threadMetaOf(serial: SerialInfo, thread: OpenThread): SerialThreadMeta {
    return serial.thread_meta[thread.id] ?? defaultMeta(thread, serial);
}

function mainThreadId(story: Partial<Story>): string {
    const first = Array.isArray(story.threads) ? (story.threads[0] as { id?: unknown } | undefined) : undefined;
    return String(first?.id || 'T1');
}

/**
 * The scheduler's view of the story with `episode` as the next one to plan. The arc's main thread
 * is the book's own A-story, which the series ending contract already closes; it is added here as
 * a thread of scope `main` and is never written back to the ledger.
 */
export function serialStateOf(story: SerialStory, episode: number): SerialState {
    const serial = syncSerial(story, episode);
    const first = serial.arc_first_episode;
    const ledger: SerialThread[] = (story.open_threads || []).map((t) => ({
        ...t,
        owners: t.owners || [],
        ...threadMetaOf(serial, t)
    }));
    const a = (Array.isArray(story.threads) ? story.threads[0] : undefined) as { name?: unknown; title?: unknown; description?: unknown } | undefined;
    const lead = leadName(story);
    const main: SerialThread = {
        id: mainThreadId(story),
        title: String(a?.name || a?.title || "This arc's main plot"),
        description: String(a?.description || ''),
        status: 'open',
        origin_book: story.series.book_number,
        scope: 'main',
        owners: lead ? [lead] : [],
        weight: 3,
        opened_episode: first,
        last_touched_episode: Math.max(first, episode - 1),
        moves: Math.max(1, episode - first),
        touches: []
    };
    const threads = [main, ...ledger];
    const nextId = ledger.reduce((max, t) => Math.max(max, Number(/^S(\d+)$/i.exec(t.id)?.[1]) || 0), 0) + 1;
    return {
        arc_number: story.series.book_number,
        arc_time: serial.arc_time,
        policy: serial.policy,
        threads,
        roster: serial.roster.map((r) => ({
            ...r,
            thread_ids: threads.filter((t) => t.owners.some((o) => lower(o) === lower(r.name))).map((t) => t.id)
        })),
        episodes: serial.episodes,
        next_episode: episode,
        next_thread_id: nextId
    };
}

// --- planning -------------------------------------------------------------------------

export interface SerialSequencePlan {
    plans: EpisodePlan[];
    /** Fields to merge into the story once the sequence's scenes are saved. */
    patch: { serial: SerialInfo; open_threads: OpenThread[] };
}

/**
 * Plans the episodes of one sequence, because scenes are planned a sequence at a time. From the
 * wrap-up on it also picks the next arc's cast, so this arc can settle the business of whoever
 * is about to leave.
 */
export function planSerialSequence(story: Partial<Story> | null | undefined, seqNum: number, sequenceCount = 8): SerialSequencePlan | null {
    if (!isSerialStory(story)) return null;
    const eps = episodesOfSequence(story, seqNum);
    let serial = syncSerial(story, eps[0]);
    let live: SerialStory = { ...story, serial };
    const p = serial.policy.threads;
    const window = arcWindowOf(live, sequenceCount);
    const ending = eps.some((e) => phaseOf(e, window, p) !== 'opening' && phaseOf(e, window, p) !== 'middle');
    if (ending && !serial.next_cast && serial.roster.length > 0) {
        serial = { ...serial, next_cast: planArcCast(serialStateOf(live, eps[0]), []) };
        live = { ...story, serial };
    }
    const plans = scheduleAhead(serialStateOf(live, eps[0]), eps.length, arcWindowOf(live, sequenceCount));
    const stored = { ...serial.plans };
    plans.forEach((plan) => (stored[String(plan.episode)] = plan));
    // A thread the plan closes may resolve under the series ending contract.
    const closing = new Set(plans.flatMap((plan) => plan.close));
    const open_threads = (story.open_threads || []).map((t) => (closing.has(t.id) && isThreadOpen(t) ? { ...t, intent: 'pay_off' as const } : t));
    return { plans, patch: { serial: { ...serial, plans: stored }, open_threads } };
}

/**
 * Merges a sequence plan into the story as it is when the scenes are saved, which may be later
 * than when the plan was made. Returns nothing to merge for a story that is not a serial.
 */
export function applySerialSequencePlan(story: Partial<Story> | null | undefined, planned: SerialSequencePlan | null | undefined): { serial?: SerialInfo; open_threads?: OpenThread[] } {
    if (!planned || !isSerialStory(story) || planned.plans.length === 0) return {};
    const serial = syncSerial(story, planned.plans[0].episode);
    const plans = { ...serial.plans };
    planned.plans.forEach((plan) => (plans[String(plan.episode)] = plan));
    const closing = new Set(planned.plans.flatMap((plan) => plan.close));
    return {
        serial: { ...serial, plans, next_cast: serial.next_cast ?? planned.patch.serial.next_cast },
        open_threads: (story.open_threads || []).map((t) => (closing.has(t.id) && isThreadOpen(t) ? { ...t, intent: 'pay_off' as const } : t))
    };
}

/** The plan for one episode: the one the scene planner saw, or a fresh one when none was stored. */
export function episodePlanFor(story: SerialStory, episode: number, sequenceCount = 8): EpisodePlan {
    const stored = story.serial.plans[String(episode)];
    if (stored) return stored;
    return scheduleEpisode(serialStateOf(story, episode), 'main', arcWindowOf(story, sequenceCount));
}

// --- prompts ----------------------------------------------------------------------------

function endingContractBlock(story: SerialStory, seqNum: number, audience: 'planner' | 'prose', sequenceCount: number): string {
    if (seqNum < sequenceCount - 1) return '';
    return formatEndingContract(buildEndingContract(story), audience);
}

/**
 * Scene planning and prose directives for a series book or a serial arc. A serial gets its
 * episode plan in place of the series thread schedule; any other story gets exactly what
 * `formatSeriesSceneDirectives` returns (an empty string for a standalone book).
 */
export function formatLongformSceneDirectives(
    story: Partial<Story> | null | undefined,
    seqNum: number | string,
    audience: 'planner' | 'prose' = 'planner',
    sequenceCount = 8,
    scene?: { index: number; count: number },
    plans?: EpisodePlan[]
): string {
    if (!isSerialStory(story)) return formatSeriesSceneDirectives(story, seqNum, audience, sequenceCount);
    const seq = Number(seqNum) || 1;
    const eps = episodesOfSequence(story, seq);
    const parts: string[] = [];
    if (audience === 'planner') {
        const state = serialStateOf(story, eps[0]);
        const list = plans && plans.length > 0 ? plans : eps.map((e) => episodePlanFor(story, e, sequenceCount));
        const split =
            eps.length === 1
                ? `Sequence ${seq} is episode ${eps[0]}. Its last scene ends on the episode's hook.`
                : `Sequence ${seq} holds episodes ${eps.join(', ')}. Split the scenes evenly and in order between them. The last scene of each episode ends on that episode's hook.`;
        parts.push(
            `<serial_episodes sequence="${seq}">\nThis story is released as a serial. ${split}\nIds such as S1 name longer-running threads. When a scene moves one, add its id to that scene's threads. An <open_slot> asks for one scene that raises a new question for its owners, to be answered a few episodes on.\n${list
                .map((plan) => formatSerialContext(state, plan).trimEnd())
                .join('\n')}\n</serial_episodes>`
        );
    } else {
        const count = scene?.count || 1;
        const at = episodeOfScene(story, { seqNum: seq, sceneIdx: scene?.index ?? 0, sceneCount: count, sequenceCount });
        const plan = episodePlanFor(story, at.episode, sequenceCount);
        const place = at.isLast
            ? `This is the last scene of episode ${at.episode}: end it on the planned hook.`
            : `Episode ${at.episode} continues after this scene: do not land the episode's ending yet.`;
        parts.push(
            `${formatSerialContext(serialStateOf(story, at.episode), plan).trimEnd()}\nTouch a listed thread only if this scene's blueprint calls for it. ${place}`
        );
    }
    const contract = endingContractBlock(story, seq, audience, sequenceCount);
    if (contract) parts.push(contract);
    return `${parts.join('\n')}\n\n`;
}

/** Extra output fields for the continuity pass. A serial adds one array to the series ones. */
export function formatLongformContinuityAddendum(story: Partial<Story> | null | undefined): string {
    const series = formatSeriesContinuityAddendum(story);
    if (!isSerialStory(story)) return series;
    return `${series}<serial_tracking>
This story is also a serial, released in episodes. Add one more array to the SAME JSON object, empty when nothing applies:
  "serial_thread_notes": [ { "id": "S1", "change": "parked | kept_warm", "note": "One line: what the reader was told." } ]
Use "parked" when the scene shows a thread's owner leaving the story for now and says what is left unfinished. Use "kept_warm" when a thread that is on hold is only mentioned, without moving.
In a serial a thread may be "resolved" in open_thread_updates as soon as the scene truly pays it off. When the scene opens a new question meant to run for a few episodes, report it in new_thread_candidates and name its owners.
</serial_tracking>
`;
}

/** Tells the cast step who the rotation seated for this arc. Empty for anything but a new serial arc. */
export function formatSerialCastBlock(story: Partial<Story> | null | undefined): string {
    if (!isSerialStory(story) || !story.serial.seated) return '';
    const plan = story.serial.seated;
    const owned = (story.open_threads || [])
        .filter((t) => isThreadOpen(t) && (t.owners || []).some((o) => plan.active.some((n) => lower(n) === lower(o))))
        .map((t) => `${t.id} "${t.title}" (${(t.owners || []).join(', ')})`);
    return `<serial_cast_plan arc="${story.series.book_number}">
This is a serial with a rotating cast. Cast these returning characters in this arc: ${plan.active.join(', ') || '(none)'}.${
        plan.anchors.length > 0 ? `\nAlways present: ${plan.anchors.join(', ')}.` : ''
    }${plan.resting.length > 0 ? `\nResting this arc. Do not cast them; they may be mentioned: ${plan.resting.join(', ')}.` : ''}
You may introduce up to ${plan.introductions} new character(s). Each one must own or serve a plot thread.${
        owned.length > 0 ? `\nUnfinished threads these characters bring back: ${owned.join('; ')}.` : ''
    }
</serial_cast_plan>

`;
}

// --- after a scene is drafted ---------------------------------------------------------

/**
 * Applies the continuity pass's report for one scene. For a serial it also moves the serial
 * fields: thread movement counted once per episode, closes, parked threads, who was on the page
 * and which scenes make up the episode. Any other story gets `applySeriesSceneReport` unchanged.
 */
export function applyLongformSceneReport(
    story: Partial<Story> | null | undefined,
    report: SerialSceneReport | null | undefined,
    sceneLabel: string,
    facts?: SerialSceneFacts
): LongformSceneReportResult {
    if (!isSerialStory(story) || !facts || !report) return { ...applySeriesSceneReport(story, report, sceneLabel), serialNotes: [] };
    const at = episodeOfScene(story, facts);
    const ep = at.episode;
    const serial = syncSerial(story, ep);
    const book = story.series.book_number;
    const p = serial.policy.threads;
    const metaBefore = (t: OpenThread) => threadMetaOf(serial, t);
    const before = story.open_threads || [];
    const liveSide = before.filter((t) => isThreadOpen(t) && metaBefore(t).scope === 'side' && !metaBefore(t).parked).length;
    const openNow = before.filter(isThreadOpen).length;
    // The serial's own thread policy decides how many threads may be open, not the book's length.
    const base = applySeriesSceneReport(story, report, sceneLabel, { maxOpen: openNow + Math.max(0, p.side.max - liveSide), maxPayOffs: Number.MAX_SAFE_INTEGER });

    let threads = base.patch.open_threads ?? before;
    const plan = serial.plans[String(ep)];
    const thread_meta: Record<string, SerialThreadMeta> = { ...serial.thread_meta };
    const moved = new Set((report.open_thread_updates || []).map((u) => String(u?.id || '').toUpperCase()));
    const opened = new Set(base.openedThreads.map((t) => t.id));
    threads.forEach((t) => {
        if (opened.has(t.id)) {
            thread_meta[t.id] = { scope: 'side', opened_episode: ep, last_touched_episode: ep, last_moved_episode: ep, weight: 2, moves: 1, target_close_episode: ep + 6, spawned_from: plan?.open[0]?.grow_from };
            return;
        }
        if (!moved.has(t.id.toUpperCase()) || t.status === 'abandoned') return;
        const m = thread_meta[t.id] ?? defaultMeta(t, serial);
        thread_meta[t.id] = {
            ...m,
            last_touched_episode: ep,
            last_moved_episode: ep,
            moves: m.last_moved_episode === ep ? m.moves : m.moves + 1,
            parked: undefined, // a thread that moves on the page is no longer on hold
            closed_episode: t.status === 'resolved' ? (m.closed_episode ?? ep) : m.closed_episode
        };
    });
    const notes = (Array.isArray(report.serial_thread_notes) ? report.serial_thread_notes : []).filter((n) => n && (n.change === 'parked' || n.change === 'kept_warm'));
    notes.forEach((n) => {
        const id = String(n.id || '').toUpperCase();
        const t = threads.find((x) => x.id.toUpperCase() === id);
        if (!t || !isThreadOpen(t)) return;
        const note = String(n.note || '').trim() || (n.change === 'parked' ? 'Left on hold.' : 'Mentioned.');
        const m = thread_meta[t.id] ?? defaultMeta(t, serial);
        thread_meta[t.id] = { ...m, last_touched_episode: ep, ...(n.change === 'parked' ? { parked: { episode: ep, note } } : {}) };
        threads = threads.map((x) =>
            x.id === t.id ? { ...x, last_note: `Book ${book}, scene ${sceneLabel}: ${note}`, touches: [...(x.touches || []), { book, scene: sceneLabel, note }] } : x
        );
    });

    // An arc-sized thread may close whenever it is ready, so its pay-off is not a contract breach.
    const sideIds = new Set(threads.filter((t) => (thread_meta[t.id] ?? defaultMeta(t, serial)).scope === 'side').map((t) => t.id));
    const allowed = (v: { rule: string; subject: string }) => !(v.rule === 'must_stay_open' && sideIds.has(v.subject));
    const series = base.patch.series
        ? { ...base.patch.series, contract_violations: (base.patch.series.contract_violations || []).filter(allowed) }
        : base.patch.series;

    const present = new Set(facts.charactersPresent.map(lower));
    const pov = lower(facts.pov);
    const roster = serial.roster.map((r) => {
        const key = lower(r.name);
        if (!present.has(key) && key !== pov) return r;
        const firstThisEpisode = r.last_on_page_episode < ep || r.appearances === 0;
        return {
            ...r,
            last_on_page_episode: ep,
            appearances: r.appearances + (firstThisEpisode ? 1 : 0),
            pov_episodes: r.pov_episodes + (at.isFirst && key === pov ? 1 : 0)
        };
    });
    const existing = serial.episodes.find((e) => e.number === ep);
    const episode = {
        ...(existing ?? { number: ep, arc_number: book, kind: 'main' as const, scene_keys: [] as string[] }),
        scene_keys: Array.from(new Set([...(existing?.scene_keys ?? []), facts.sceneKey])),
        hook_kind: plan?.hook ?? existing?.hook_kind,
        pov: existing?.pov ?? (facts.pov || undefined)
    };
    const episodes = [...serial.episodes.filter((e) => e.number !== ep), episode].sort((x, y) => x.number - y.number);

    const serialNotes: string[] = [];
    if (at.isLast && plan) {
        plan.close
            .map((id) => threads.find((t) => t.id === id))
            .filter((t): t is OpenThread => !!t && isThreadOpen(t))
            .forEach((t) => serialNotes.push(`Episode ${ep} was planned to close "${t.title}" (${t.id}) and it is still open.`));
        plan.park
            .map((id) => threads.find((t) => t.id === id))
            .filter((t): t is OpenThread => !!t && isThreadOpen(t) && !thread_meta[t.id]?.parked)
            .forEach((t) => serialNotes.push(`Episode ${ep} was planned to park "${t.title}" (${t.id}) with an on-page exit, and no exit was reported.`));
    }

    return {
        patch: { ...base.patch, open_threads: threads, ...(series ? { series } : {}), serial: { ...serial, thread_meta, roster, episodes } },
        openedThreads: base.openedThreads,
        newViolations: base.newViolations.filter(allowed),
        serialNotes
    };
}

// --- the next arc ------------------------------------------------------------------------

const META_KEYS: Array<keyof SerialThreadMeta> = [
    'scope',
    'opened_episode',
    'last_touched_episode',
    'target_close_episode',
    'min_episodes_open',
    'weight',
    'depends_on',
    'closed_episode',
    'moves',
    'last_moved_episode',
    'parked',
    'resumed_episode',
    'spawned_from'
];

function pickMeta(t: SerialThread): SerialThreadMeta {
    const out: Record<string, unknown> = {};
    META_KEYS.forEach((k) => {
        if (t[k] !== undefined) out[k] = t[k];
    });
    return out as unknown as SerialThreadMeta;
}

/**
 * The serial state the next arc starts with: episode numbering continues, the rotation seats the
 * cast (picked in the wrap-up, or now if the arc ended early), and only open threads keep their
 * serial fields.
 */
export function carrySerialToNextArc(source: Partial<Story> | null | undefined, sequenceCount?: number): SerialInfo | undefined {
    if (!isSerialStory(source)) return undefined;
    const count = sequenceCount || (Array.isArray(source.sequences) ? source.sequences.length : 0) || 8;
    const lastWritten = source.serial.episodes.reduce((max, e) => Math.max(max, e.number), 0);
    const nextFirst = Math.max(lastWritten, arcWindowOf(source, count).endsAt) + 1;
    const state = serialStateOf(source, nextFirst);
    const seated: ArcCastPlan = source.serial.next_cast ?? planArcCast(state, []);
    const applied = applyArcCast(state, seated);
    const main = mainThreadId(source);
    const thread_meta: Record<string, SerialThreadMeta> = {};
    // Parked threads stay parked until their owner is really cast: syncSerial picks them up then.
    state.threads.filter((t) => t.id !== main && isThreadOpen(t)).forEach((t) => (thread_meta[t.id] = pickMeta(t)));
    const time = source.serial.arc_time;
    return {
        arc_time: { mode: 'forward', start: time.end ?? time.start },
        policy: source.serial.policy,
        roster: applied.roster.map((r) => ({ ...r, thread_ids: r.thread_ids.filter((id) => id !== main) })),
        episodes: source.serial.episodes,
        arc_first_episode: nextFirst,
        thread_meta,
        plans: {},
        seated
    };
}

// --- for the dashboard ---------------------------------------------------------------

export interface SerialSummary {
    arc: number;
    /** Episodes written in this arc, and the arc's planned length. */
    written: number;
    length: number;
    nextEpisode: number;
    phase: EpisodePlan['phase'] | 'done';
    rotation: CastRotation;
    spine: SerialThread[];
    side: SerialThread[];
    parked: SerialThread[];
    onStage: RosterEntry[];
    resting: RosterEntry[];
    /** What the scheduler would flag for the next episode. */
    warnings: string[];
}

/** A read-only overview of where the serial stands, for the dashboard card. */
export function summarizeSerial(story: Partial<Story> | null | undefined): SerialSummary | null {
    if (!isSerialStory(story)) return null;
    const count = (Array.isArray(story.sequences) ? story.sequences.length : 0) || 8;
    const window = arcWindowOf(story, count);
    const inArc = story.serial.episodes.filter((e) => e.number >= window.startsAt && e.number <= window.endsAt);
    const nextEpisode = inArc.reduce((max, e) => Math.max(max, e.number), window.startsAt - 1) + 1;
    const done = nextEpisode > window.endsAt;
    const state = serialStateOf(story, Math.min(nextEpisode, window.endsAt));
    const open = state.threads.filter((t) => isThreadOpen(t) && t.scope !== 'main');
    const plan = done || state.roster.length === 0 ? null : episodePlanFor(story, nextEpisode, count);
    return {
        arc: story.series.book_number,
        written: inArc.length,
        length: window.endsAt - window.startsAt + 1,
        nextEpisode,
        phase: done ? 'done' : phaseOf(nextEpisode, window, state.policy.threads),
        rotation: state.policy.cast.rotation,
        spine: open.filter((t) => t.scope === 'series' && !t.parked),
        side: open.filter((t) => t.scope === 'side' && !t.parked),
        parked: open.filter((t) => t.parked),
        onStage: state.roster.filter((r) => r.status === 'active'),
        resting: state.roster.filter((r) => r.status === 'resting'),
        warnings: plan?.warnings ?? []
    };
}
