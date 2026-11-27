/**
 * @module domain/series/threads
 * The series thread ledger: limits, per-book intents, beat allocation across sequences,
 * scene-by-scene updates, model-opened threads, and coverage checks. All pure.
 */

import type {
    BookPlan,
    OpenThread,
    OpenThreadKind,
    OpenThreadStatus,
    OpenThreadUpdate,
    Story,
    ThreadCandidate,
    ThreadIntent
} from '@/types';

export interface SeriesThreadLimits {
    maxOpen: number;
    maxPayOffs: number;
}

const THREAD_KINDS: OpenThreadKind[] = ['plot', 'mystery', 'relationship', 'character', 'world'];
const THREAD_INTENTS: ThreadIntent[] = ['introduce', 'advance', 'complicate', 'pay_off', 'rest', 'defer'];
const THREAD_STATUSES: OpenThreadStatus[] = ['open', 'advanced', 'resolved', 'abandoned'];

function clean(val: unknown): string {
    return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

export function isThreadOpen(thread: OpenThread): boolean {
    return thread.status === 'open' || thread.status === 'advanced';
}

/** How many series threads a book of this length can carry. */
export function seriesThreadLimits(targetWords: unknown): SeriesThreadLimits {
    const words = Number(targetWords) || 80000;
    if (words < 30000) return { maxOpen: 2, maxPayOffs: 1 };
    if (words < 60000) return { maxOpen: 3, maxPayOffs: 1 };
    if (words <= 120000) return { maxOpen: 4, maxPayOffs: 2 };
    return { maxOpen: 5, maxPayOffs: 2 };
}

export function parseThreadIntent(val: unknown, fallback: ThreadIntent = 'advance'): ThreadIntent {
    const raw = clean(val).toLowerCase().replace(/[\s-]+/g, '_');
    if (raw === 'payoff' || raw === 'resolve') return 'pay_off';
    return THREAD_INTENTS.includes(raw as ThreadIntent) ? (raw as ThreadIntent) : fallback;
}

/** Coerces anything saved or parsed into a well-formed thread list. Never throws. */
export function normalizeOpenThreads(raw: unknown, fallbackBook = 1): OpenThread[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: OpenThread[] = [];
    raw.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const t = item as Record<string, unknown>;
        const title = clean(t.title) || clean(t.name);
        const description = clean(t.description) || clean(t.promise);
        if (!title && !description) return;
        let id = clean(t.id).toUpperCase() || `S${idx + 1}`;
        while (seen.has(id)) id = nextSeriesThreadId(out);
        seen.add(id);
        const kind = clean(t.kind).toLowerCase() as OpenThreadKind;
        const status = clean(t.status).toLowerCase() as OpenThreadStatus;
        const thread: OpenThread = {
            ...(t as Partial<OpenThread>),
            id,
            title: title || description.slice(0, 60),
            description: description || title,
            status: THREAD_STATUSES.includes(status) ? status : 'open',
            origin_book: Number(t.origin_book) || fallbackBook,
            kind: THREAD_KINDS.includes(kind) ? kind : 'plot',
            promise: clean(t.promise) || description || title,
            owners: Array.isArray(t.owners) ? t.owners.map(clean).filter(Boolean) : [],
            touches: Array.isArray(t.touches)
                ? (t.touches as unknown[])
                      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
                      .map((x) => ({
                          book: Number(x.book) || fallbackBook,
                          scene: clean(x.scene),
                          note: clean(x.note)
                      }))
                : []
        };
        if (t.intent !== undefined) thread.intent = parseThreadIntent(t.intent);
        out.push(thread);
    });
    return out;
}

export function nextSeriesThreadId(threads: Array<{ id: string }>): string {
    let max = 0;
    threads.forEach((t) => {
        const m = /^S(\d+)$/i.exec(String(t.id || ''));
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `S${max + 1}`;
}

function castNameSet(cast: unknown): Set<string> {
    const names = new Set<string>();
    if (Array.isArray(cast)) {
        cast.forEach((c) => {
            const name = clean((c as { name?: unknown })?.name).toLowerCase();
            if (name) names.add(name);
        });
    }
    return names;
}

/**
 * Sets each open thread's intent for this book from the roadmap. A thread whose owners are all
 * off stage can only rest, and pay-offs beyond the book's limit are downgraded to advances.
 */
export function planThreadsForBook(
    threads: OpenThread[],
    bookPlan: Pick<BookPlan, 'thread_intents'> | null | undefined,
    bookNumber: number,
    cast: unknown,
    limits: SeriesThreadLimits
): OpenThread[] {
    const onStage = castNameSet(cast);
    let payOffs = 0;
    return threads.map((t) => {
        if (!isThreadOpen(t)) return { ...t, intent: undefined, planned_sequences: [] };
        const planned = bookPlan?.thread_intents?.[t.id];
        let intent: ThreadIntent =
            planned || t.intent || (t.origin_book === bookNumber ? 'introduce' : 'advance');
        const owners = (t.owners || []).map((o) => o.toLowerCase());
        const ownerOnStage = owners.length === 0 || onStage.size === 0 || owners.some((o) => onStage.has(o));
        if (!ownerOnStage && intent !== 'defer') intent = 'rest';
        if (intent === 'pay_off') {
            if (payOffs >= limits.maxPayOffs) intent = 'advance';
            else payOffs += 1;
        }
        return { ...t, intent };
    });
}

/** Spreads each thread's touches over the book's sequences. Pay-offs land late. */
export function allocateThreadBeats(threads: OpenThread[], sequenceCount = 8): OpenThread[] {
    const n = Math.max(3, Math.floor(sequenceCount) || 8);
    const at = (fraction: number) => Math.min(n, Math.max(1, Math.round(fraction * n)));
    const uniq = (list: number[]) => Array.from(new Set(list)).sort((a, b) => a - b);
    return threads.map((t, idx) => {
        if (!isThreadOpen(t)) return { ...t, planned_sequences: [] };
        // Offsetting by index keeps two threads from always landing in the same sequences.
        const shift = idx % 2;
        switch (t.intent) {
            case 'pay_off':
                return { ...t, planned_sequences: uniq([at(0.25) + shift, at(0.6), n - 1]) };
            case 'introduce':
                return { ...t, planned_sequences: uniq([at(0.25), at(0.5) + shift, at(0.85)]) };
            case 'advance':
            case 'complicate':
                return { ...t, planned_sequences: uniq([at(0.35) + shift, at(0.75)]) };
            case 'rest':
                return { ...t, planned_sequences: [at(0.5) + shift] };
            default:
                return { ...t, planned_sequences: [] };
        }
    });
}

export interface SeriesThreadDirective {
    thread_id: string;
    title: string;
    intent: ThreadIntent;
    directive: string;
    /** True the first time a thread from an earlier book appears in this book. */
    needsReminder: boolean;
}

const INTENT_DIRECTIVES: Record<ThreadIntent, string> = {
    introduce: 'Open this thread on the page. Make the promise to the reader clear, and do not answer it.',
    advance: 'Move this thread forward with a concrete development. Do not resolve it.',
    complicate: 'Make this thread harder: a setback, a cost or a new obstacle. Do not resolve it.',
    pay_off: 'Build toward the pay-off of this thread. It resolves in this book, in the final sequences.',
    rest: 'Give this thread one brief keep-alive mention so the reader does not forget it. No development.',
    defer: 'Do not mention this thread.'
};

/** Threads that should be on the page in a given sequence of the current book. */
export function getSeriesThreadDirectivesForSequence(
    story: Partial<Story> | null | undefined,
    seqNum: number | string
): SeriesThreadDirective[] {
    if (!story?.series || !Array.isArray(story.open_threads)) return [];
    const book = story.series.book_number;
    const seq = Number(seqNum);
    return story.open_threads
        .filter((t) => isThreadOpen(t) && t.intent && t.intent !== 'defer')
        .filter((t) => (t.planned_sequences || []).includes(seq))
        .map((t) => {
            const touchedThisBook = (t.touches || []).some((x) => x.book === book && x.scene !== 'plan');
            return {
                thread_id: t.id,
                title: t.title,
                intent: t.intent as ThreadIntent,
                directive: INTENT_DIRECTIVES[t.intent as ThreadIntent],
                needsReminder: t.origin_book < book && !touchedThisBook
            };
        });
}

/** Appends scene-level touches and moves statuses. A no-op without updates. */
export function applyOpenThreadUpdates(
    threads: OpenThread[] | undefined,
    updates: OpenThreadUpdate[] | undefined,
    sceneLabel: string,
    bookNumber: number
): OpenThread[] {
    const list = threads || [];
    if (!Array.isArray(updates) || updates.length === 0) return list;
    const byId = new Map<string, OpenThreadUpdate>();
    updates.forEach((u) => {
        const id = clean(u?.id).toUpperCase();
        if (id) byId.set(id, u);
    });
    return list.map((t) => {
        const u = byId.get(t.id.toUpperCase());
        if (!u || t.status === 'abandoned') return t;
        const note = clean(u.note) || `Thread ${u.change}.`;
        const resolved = clean(u.change).toLowerCase() === 'resolved';
        return {
            ...t,
            status: resolved ? 'resolved' : t.status === 'resolved' ? 'resolved' : 'advanced',
            last_note: `Book ${bookNumber}, scene ${sceneLabel}: ${note}`,
            touches: [...(t.touches || []), { book: bookNumber, scene: sceneLabel, note }]
        };
    });
}

/** Opens threads the model noticed on its own, up to the book's limit. */
export function acceptThreadCandidates(
    threads: OpenThread[] | undefined,
    candidates: ThreadCandidate[] | undefined,
    limits: SeriesThreadLimits,
    bookNumber: number,
    sceneLabel = ''
): { threads: OpenThread[]; accepted: OpenThread[] } {
    const list = [...(threads || [])];
    const accepted: OpenThread[] = [];
    if (!Array.isArray(candidates)) return { threads: list, accepted };
    const known = new Set(list.map((t) => t.title.trim().toLowerCase()));
    for (const c of candidates) {
        const title = clean(c?.title);
        if (!title || known.has(title.toLowerCase())) continue;
        if (list.filter(isThreadOpen).length >= limits.maxOpen) break;
        const kind = clean(c.kind).toLowerCase() as OpenThreadKind;
        const thread: OpenThread = {
            id: nextSeriesThreadId(list),
            title,
            description: clean(c.description) || clean(c.promise) || title,
            promise: clean(c.promise) || clean(c.description) || title,
            status: 'open',
            origin_book: bookNumber,
            kind: THREAD_KINDS.includes(kind) ? kind : 'plot',
            owners: Array.isArray(c.owners) ? c.owners.map(clean).filter(Boolean) : [],
            intent: 'advance',
            planned_sequences: [],
            source: 'model',
            touches: sceneLabel ? [{ book: bookNumber, scene: sceneLabel, note: 'Opened by the story.' }] : []
        };
        list.push(thread);
        accepted.push(thread);
        known.add(title.toLowerCase());
    }
    return { threads: list, accepted };
}

export interface ThreadCoverageIssue {
    thread_id: string;
    issue: string;
}

/** Checks the plan before prose: every pay-off has a late sequence, and nothing is unscheduled. */
export function validateThreadCoverage(threads: OpenThread[] | undefined, sequenceCount = 8): ThreadCoverageIssue[] {
    const issues: ThreadCoverageIssue[] = [];
    (threads || []).filter(isThreadOpen).forEach((t) => {
        const planned = t.planned_sequences || [];
        if (!t.intent) {
            issues.push({ thread_id: t.id, issue: 'No intent set for this book.' });
        } else if (t.intent === 'defer') {
            if (planned.length > 0) issues.push({ thread_id: t.id, issue: 'Deferred thread is scheduled.' });
        } else if (planned.length === 0) {
            issues.push({ thread_id: t.id, issue: 'Thread has no scheduled sequence.' });
        } else if (t.intent === 'pay_off' && Math.max(...planned) < sequenceCount - 2) {
            issues.push({ thread_id: t.id, issue: 'Pay-off is not scheduled in the final sequences.' });
        }
    });
    return issues;
}

/** Threads scheduled before `currentSeq` that the page has not touched in this book. */
export function detectStaleThreads(threads: OpenThread[] | undefined, bookNumber: number, currentSeq: number): OpenThread[] {
    return (threads || []).filter((t) => {
        if (!isThreadOpen(t) || !t.intent || t.intent === 'defer') return false;
        const due = (t.planned_sequences || []).filter((s) => s < currentSeq);
        if (due.length === 0) return false;
        return !(t.touches || []).some((x) => x.book === bookNumber && x.scene !== 'plan');
    });
}

/** The ledger as prompt text. Planners get everything; prose gets a line per thread. */
export function formatThreadLedgerForPrompt(threads: OpenThread[] | undefined, detail: 'full' | 'brief' = 'full'): string {
    const list = (threads || []).filter(isThreadOpen);
    if (list.length === 0) return '';
    return list
        .map((t) => {
            const intent = t.intent || 'advance';
            if (detail === 'brief') return `- ${t.id} (${intent}): ${t.title}`;
            const seqs = (t.planned_sequences || []).join(', ');
            return [
                `<series_thread id="${t.id}" kind="${t.kind || 'plot'}" intent="${intent}" since_book="${t.origin_book}">`,
                `  <title>${t.title}</title>`,
                `  <promise>${t.promise || t.description}</promise>`,
                (t.owners || []).length ? `  <owners>${(t.owners || []).join(', ')}</owners>` : '',
                t.last_note ? `  <last_development>${t.last_note}</last_development>` : '',
                seqs ? `  <planned_sequences>${seqs}</planned_sequences>` : '',
                `</series_thread>`
            ]
                .filter(Boolean)
                .join('\n');
        })
        .join('\n');
}

/**
 * Links series threads to the per-book threads that carry them. The Story Arc step is asked to
 * name the series thread id in a book thread's description; anything it leaves unnamed stays unbound.
 */
export function bindSeriesThreads(threads: OpenThread[], bookThreads: unknown): OpenThread[] {
    const list = Array.isArray(bookThreads) ? (bookThreads as Array<Record<string, unknown>>) : [];
    return threads.map((t) => {
        const carrier = list.find((bt) => {
            const text = `${clean(bt?.name)} ${clean(bt?.description)}`;
            return new RegExp(`\\b${t.id}\\b`, 'i').test(text);
        });
        return carrier && clean(carrier.id) ? { ...t, bound_to: clean(carrier.id) } : { ...t, bound_to: undefined };
    });
}
