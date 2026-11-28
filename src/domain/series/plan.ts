/**
 * @module domain/series/plan
 * The rolling series plan: parsing the Series Architect's output, keeping written books fixed,
 * and reading the current book's entry.
 */

import type {
    BookPlan,
    BookRole,
    LongArc,
    OpenThread,
    SeriesInfo,
    SeriesPlan,
    Story,
    ThreadIntent
} from '@/types';
import { extractAllTags, extractTag } from '@/utils';
import { normalizeSeriesSecrets, validateSecretPlan } from './secrets';
import { nextSeriesThreadId, normalizeOpenThreads, parseThreadIntent } from './threads';

const BOOK_ROLES: BookRole[] = ['opener', 'escalation', 'reversal', 'low_point', 'finale', 'middle'];

function clean(val: unknown): string {
    return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

function attr(openTag: string, name: string): string {
    const m = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(openTag);
    return m ? m[1].trim() : '';
}

/** Splits `<tag attrs>inner</tag>` blocks into their opening tag and inner text. */
function blocks(text: string, tag: string): Array<{ open: string; inner: string }> {
    const out: Array<{ open: string; inner: string }> = [];
    if (!text) return out;
    const re = new RegExp(`<${tag}((?:\\s+[^>]*)?)>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push({ open: m[1] || '', inner: m[2] || '' });
    return out;
}

export function isSeriesStory(story: Partial<Story> | null | undefined): story is Partial<Story> & { series: SeriesInfo } {
    return Boolean(story && story.series && typeof story.series === 'object' && story.series.id);
}

export function emptySeriesPlan(): SeriesPlan {
    return {
        series_question: '',
        series_thematic_argument: '',
        long_arcs: [],
        endgame_note: '',
        books: [],
        secrets: [],
        revisions: []
    };
}

function normalizeBookPlan(raw: unknown, fallbackNumber: number): BookPlan | null {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const role = clean(b.role).toLowerCase() as BookRole;
    const intents: Record<string, ThreadIntent> = {};
    if (b.thread_intents && typeof b.thread_intents === 'object') {
        Object.entries(b.thread_intents as Record<string, unknown>).forEach(([id, v]) => {
            if (id) intents[id.toUpperCase()] = parseThreadIntent(v);
        });
    }
    const stage = b.lead_arc_stage as { lie?: unknown; truth?: unknown } | undefined;
    const status = clean(b.status);
    return {
        book_number: Math.max(1, Math.floor(Number(b.book_number)) || fallbackNumber),
        role: BOOK_ROLES.includes(role) ? role : 'middle',
        book_question: clean(b.book_question),
        stakes_scope: clean(b.stakes_scope),
        lead_name: clean(b.lead_name) || undefined,
        lead_arc_stage:
            stage && (clean(stage.lie) || clean(stage.truth))
                ? { lie: clean(stage.lie), truth: clean(stage.truth) }
                : undefined,
        handoff_state: clean(b.handoff_state),
        thread_intents: intents,
        status: status === 'written' || status === 'sketched' ? status : 'current'
    };
}

/** Coerces a saved plan into shape. Returns undefined when there is nothing usable. */
export function normalizeSeriesPlan(raw: unknown, currentBook = 1): SeriesPlan | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const p = raw as Record<string, unknown>;
    const books = (Array.isArray(p.books) ? p.books : [])
        .map((b, i) => normalizeBookPlan(b, i + 1))
        .filter((b): b is BookPlan => !!b)
        .sort((a, b) => a.book_number - b.book_number);
    const arcs: LongArc[] = (Array.isArray(p.long_arcs) ? p.long_arcs : [])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a) => ({ char_name: clean(a.char_name), lie: clean(a.lie), truth: clean(a.truth) }))
        .filter((a) => a.char_name);
    return {
        series_question: clean(p.series_question),
        series_thematic_argument: clean(p.series_thematic_argument),
        long_arcs: arcs,
        endgame_note: clean(p.endgame_note),
        books,
        secrets: normalizeSeriesSecrets(p.secrets, currentBook),
        revisions: (Array.isArray(p.revisions) ? p.revisions : [])
            .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
            .map((r) => ({ after_book: Number(r.after_book) || 0, summary: clean(r.summary) }))
            .filter((r) => r.summary)
    };
}

/** Load-time guard for the series fields. Stories without them pass through untouched. */
export function normalizeSeriesFields<T extends Record<string, unknown>>(story: T): T {
    if (!story || typeof story !== 'object') return story;
    const s = story as Record<string, unknown>;
    if ('open_threads' in s && !Array.isArray(s.open_threads)) s.open_threads = [];
    if (!('series' in s)) return story;
    const raw = s.series as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !clean(raw.id)) {
        delete s.series;
        return story;
    }
    const bookNumber = Math.max(1, Math.floor(Number(raw.book_number)) || 1);
    const series: SeriesInfo = {
        ...(raw as unknown as SeriesInfo),
        id: clean(raw.id),
        title: clean(raw.title) || clean(s.title) || 'Untitled Series',
        book_number: bookNumber,
        previous_books: (Array.isArray(raw.previous_books) ? raw.previous_books : [])
            .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
            .map((b, i) => ({
                book_number: Number(b.book_number) || i + 1,
                story_id: clean(b.story_id),
                title: clean(b.title) || `Book ${i + 1}`,
                recap: clean(b.recap)
            })),
        returning_cast: (Array.isArray(raw.returning_cast) ? raw.returning_cast : []).filter(
            (c): c is Record<string, unknown> & { name: string } =>
                !!c && typeof c === 'object' && !!clean((c as { name?: unknown }).name)
        )
    };
    const plan = normalizeSeriesPlan(raw.plan, bookNumber);
    if (plan) series.plan = plan;
    else delete series.plan;
    s.series = series;
    s.open_threads = normalizeOpenThreads(s.open_threads, bookNumber);
    return story;
}

export function getCurrentBookPlan(story: Partial<Story> | null | undefined): BookPlan | null {
    if (!isSeriesStory(story)) return null;
    return story.series.plan?.books.find((b) => b.book_number === story.series.book_number) || null;
}

export function getNextBookPlan(story: Partial<Story> | null | undefined): BookPlan | null {
    if (!isSeriesStory(story)) return null;
    return story.series.plan?.books.find((b) => b.book_number === story.series.book_number + 1) || null;
}

export interface ParsedSeriesPlan {
    plan: SeriesPlan;
    threads: OpenThread[];
    /** False when the model's output held nothing usable and a minimal plan was built instead. */
    parsed: boolean;
}

export interface ParseSeriesPlanContext {
    bookNumber: number;
    previousPlan?: SeriesPlan | null;
    existingThreads?: OpenThread[];
    leadName?: string;
    concept?: string;
}

function parseBookBlock(open: string, inner: string, fallbackNumber: number, currentBook: number): BookPlan {
    const number = Math.max(1, parseInt(attr(open, 'number') || extractTag(inner, 'number'), 10) || fallbackNumber);
    const intents: Record<string, ThreadIntent> = {};
    blocks(extractTag(inner, 'thread_intents') || inner, 'thread_intent').forEach((ti) => {
        const id = (attr(ti.open, 'id') || extractTag(ti.inner, 'id')).toUpperCase();
        const value = extractTag(ti.inner, 'intent') || ti.inner.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '');
        if (id) intents[id] = parseThreadIntent(value);
    });
    const stage = extractTag(inner, 'lead_arc_stage');
    const role = (attr(open, 'role') || extractTag(inner, 'role')).toLowerCase() as BookRole;
    return {
        book_number: number,
        role: BOOK_ROLES.includes(role) ? role : number === 1 ? 'opener' : 'middle',
        book_question: extractTag(inner, 'book_question'),
        stakes_scope: extractTag(inner, 'stakes_scope'),
        lead_name: extractTag(inner, 'lead_name') || undefined,
        lead_arc_stage: stage ? { lie: extractTag(stage, 'lie'), truth: extractTag(stage, 'truth') } : undefined,
        handoff_state: extractTag(inner, 'handoff_state'),
        thread_intents: intents,
        status: number < currentBook ? 'written' : number === currentBook ? 'current' : 'sketched'
    };
}

/**
 * Reads the Series Architect's XML. Written books in the previous plan are kept as they are,
 * existing threads keep their ids and history, and new threads get the next free ids.
 */
export function parseSeriesPlan(text: string, ctx: ParseSeriesPlanContext): ParsedSeriesPlan {
    const book = ctx.bookNumber;
    const prev = ctx.previousPlan || null;
    const raw = text || '';

    const parsedBooks = blocks(extractTag(raw, 'books') || raw, 'book')
        .map((b, i) => parseBookBlock(b.open, b.inner, book + i, book))
        .filter((b) => b.book_number >= book);
    const written = (prev?.books || []).filter((b) => b.book_number < book).map((b) => ({ ...b, status: 'written' as const }));
    const current =
        parsedBooks.find((b) => b.book_number === book) ||
        ({
            book_number: book,
            role: book === 1 ? 'opener' : 'middle',
            book_question: prev?.books.find((b) => b.book_number === book)?.book_question || '',
            stakes_scope: prev?.books.find((b) => b.book_number === book)?.stakes_scope || '',
            handoff_state: prev?.books.find((b) => b.book_number === book)?.handoff_state || '',
            thread_intents: {},
            status: 'current'
        } as BookPlan);
    if (!current.lead_name && ctx.leadName) current.lead_name = ctx.leadName;
    const next = parsedBooks.find((b) => b.book_number === book + 1);

    // Threads: keep what exists, add what is new.
    const threads: OpenThread[] = (ctx.existingThreads || []).map((t) => ({ ...t }));
    const idMap: Record<string, string> = {};
    blocks(extractTag(raw, 'series_threads') || '', 'series_thread').forEach((b) => {
        const givenId = (attr(b.open, 'id') || extractTag(b.inner, 'id')).toUpperCase();
        const title = extractTag(b.inner, 'title');
        const promise = extractTag(b.inner, 'promise');
        const existing = threads.find(
            (t) => (givenId && t.id === givenId) || (title && t.title.toLowerCase() === title.toLowerCase())
        );
        if (existing) {
            if (givenId) idMap[givenId] = existing.id;
            return;
        }
        if (!title && !promise) return;
        const id = nextSeriesThreadId(threads);
        if (givenId) idMap[givenId] = id;
        const fresh = normalizeOpenThreads(
            [
                {
                    id,
                    title: title || promise,
                    description: extractTag(b.inner, 'description') || promise || title,
                    promise: promise || title,
                    kind: attr(b.open, 'kind') || extractTag(b.inner, 'kind'),
                    owners: extractTag(b.inner, 'owners')
                        .split(/[,;\n]+/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    status: 'open',
                    origin_book: book,
                    source: 'plan'
                }
            ],
            book
        );
        threads.push(...fresh);
    });
    const remapIntents = (intents: Record<string, ThreadIntent>): Record<string, ThreadIntent> => {
        const out: Record<string, ThreadIntent> = {};
        Object.entries(intents).forEach(([id, v]) => {
            const real = idMap[id] || id;
            if (threads.some((t) => t.id === real)) out[real] = v;
        });
        return out;
    };
    current.thread_intents = remapIntents(current.thread_intents);
    if (next) next.thread_intents = remapIntents(next.thread_intents);

    // Secrets: previous ones keep their history; new ones are added.
    const prevSecrets = prev?.secrets || [];
    const parsedSecrets = normalizeSeriesSecrets(
        blocks(extractTag(raw, 'series_secrets') || '', 'secret').map((s, i) => ({
            id: `ssec_${prevSecrets.length + i + 1}`,
            title: extractTag(s.inner, 'title') || attr(s.open, 'title'),
            cover_story: extractTag(s.inner, 'cover_story'),
            known_by: extractTag(s.inner, 'known_by'),
            concealed_from: extractTag(s.inner, 'concealed_from'),
            layers: blocks(extractTag(s.inner, 'layers') || s.inner, 'layer').map((l, li) => ({
                layer: parseInt(attr(l.open, 'number'), 10) || li + 1,
                truth: extractTag(l.inner, 'truth') || l.inner.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim(),
                reveal_book: parseInt(attr(l.open, 'reveal_book') || extractTag(l.inner, 'reveal_book'), 10) || book,
                revealed_to: extractTag(l.inner, 'revealed_to')
            }))
        })),
        book
    ).filter((s) => !prevSecrets.some((p) => p.title.toLowerCase() === s.title.toLowerCase()));
    const secrets = validateSecretPlan([...prevSecrets, ...parsedSecrets], book);

    // Long arcs: one per character who has led a book.
    const arcs: LongArc[] = [...(prev?.long_arcs || [])];
    extractAllTags(raw, 'lead_long_arc').forEach((a) => {
        const name = extractTag(a, 'char_name') || current.lead_name || ctx.leadName || '';
        if (!name) return;
        const entry = { char_name: name, lie: extractTag(a, 'lie'), truth: extractTag(a, 'truth') };
        const idx = arcs.findIndex((x) => x.char_name.toLowerCase() === name.toLowerCase());
        if (idx >= 0) arcs[idx] = { ...arcs[idx], ...entry };
        else arcs.push(entry);
    });

    const seriesQuestion = extractTag(raw, 'series_question') || prev?.series_question || '';
    const parsed = Boolean(seriesQuestion || current.book_question || threads.length > (ctx.existingThreads || []).length);
    const revisionNote = extractTag(raw, 'revision_summary');
    const plan: SeriesPlan = {
        series_question: seriesQuestion || `What becomes of the people in this story: ${(ctx.concept || '').slice(0, 160)}`,
        series_thematic_argument: extractTag(raw, 'series_thematic_argument') || prev?.series_thematic_argument || '',
        long_arcs: arcs,
        endgame_note: extractTag(raw, 'endgame_note') || prev?.endgame_note || '',
        books: [...written, current, ...(next ? [next] : [])],
        secrets,
        revisions: [
            ...(prev?.revisions || []),
            ...(book > 1 && revisionNote ? [{ after_book: book - 1, summary: revisionNote }] : [])
        ]
    };
    return { plan, threads, parsed };
}

/**
 * Library badge text for a book of a series, such as `Book 2 of 3`. The total is the highest
 * book number among the stories given, so it grows as later books are started. Returns '' for a
 * standalone story.
 */
export function seriesBadgeLabel(
    story: Partial<Story> | null | undefined,
    allStories: Array<Partial<Story> | null | undefined> = []
): string {
    if (!isSeriesStory(story)) return '';
    const id = story.series.id;
    const total = allStories.reduce((max, other) => {
        if (!isSeriesStory(other) || other.series.id !== id) return max;
        return Math.max(max, other.series.book_number);
    }, story.series.book_number);
    return total > 1 ? `Book ${story.series.book_number} of ${total}` : `Book ${story.series.book_number}`;
}
