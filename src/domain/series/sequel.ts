/**
 * @module domain/series/sequel
 * Starting the next book from a finished one: what carries over, the returning cast, and the
 * rule that a sequel's lead must be a character the reader already knows.
 */

import type { CastMember, PreviousBookSummary, SeriesInfo, Story } from '@/types';
import { normalizeSeriesPlan } from './plan';
import { carrySecretsToSequel } from './secrets';
import { isThreadOpen, normalizeOpenThreads } from './threads';

type AnyRecord = Record<string, unknown>;
type CastLike = CastMember & AnyRecord;

function clean(val: unknown): string {
    return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

function sameName(a: unknown, b: unknown): boolean {
    return clean(a).toLowerCase() !== '' && clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** True when the story has at least one scene of drafted prose. */
export function hasDraftedProse(story: Partial<Story> | null | undefined): boolean {
    const prose = story?.prose;
    if (!prose || typeof prose !== 'object') return false;
    return Object.values(prose).some((p) => {
        if (!p) return false;
        const txt = typeof p === 'string' ? p : p.final || p.text || p.draft || p.prose || '';
        return typeof txt === 'string' && txt.trim().length > 0;
    });
}

/** Marks a new story as the first book of a series. */
export function createSeriesOpener(seriesTitle: string, storyTitle: string, now = Date.now()): SeriesInfo {
    return {
        id: `series_${now}`,
        title: clean(seriesTitle) || clean(storyTitle) || 'Untitled Series',
        book_number: 1,
        previous_books: [],
        returning_cast: []
    };
}

/** A cast member as the series remembers them: identity and voice kept, per-book flags dropped. */
export function asReturningCastMember(member: CastLike, bookNumber: number, endState?: AnyRecord): AnyRecord & { name: string } {
    const { is_initial_cast: _initial, corner_role, ...rest } = member;
    void _initial;
    return {
        ...rest,
        name: member.name,
        last_corner_role: corner_role || rest.last_corner_role,
        last_seen_book: bookNumber,
        end_state: endState
            ? {
                  location: clean(endState.location),
                  physical_state: clean(endState.physical_state),
                  emotional_state: clean(endState.emotional_state),
                  unresolved_tension: clean(endState.unresolved_tension),
                  goals: clean(endState.goals)
              }
            : rest.end_state
    };
}

/** Every character the series knows after this book: this book's cast plus earlier absentees. */
export function collectReturningCast(source: Partial<Story>): Array<AnyRecord & { name: string }> {
    const book = source.series?.book_number || 1;
    const states = (source.character_states || {}) as Record<string, AnyRecord>;
    const current = (Array.isArray(source.cast) ? source.cast : [])
        .filter((c): c is CastLike => !!c && !!clean(c.name))
        .map((c) => asReturningCastMember(c as CastLike, book, states[c.name]));
    const earlier = (source.series?.returning_cast || []).filter(
        (r) => !current.some((c) => sameName(c.name, r.name))
    );
    return [...current, ...earlier];
}

function collapseRelationships(source: Partial<Story>, book: number): Record<string, AnyRecord> {
    const out: Record<string, AnyRecord> = { ...((source.series?.carryover?.relationships || {}) as Record<string, AnyRecord>) };
    Object.entries((source.relationships || {}) as Record<string, AnyRecord>).forEach(([key, rel]) => {
        if (!rel || typeof rel !== 'object') return;
        const current = clean(rel.current) || clean(rel.dynamic) || clean(rel.initial_feeling);
        out[key] = {
            current,
            initial_feeling: current,
            hidden_tension: clean(rel.hidden_tension),
            trust_level: Number(rel.trust_level) || 5,
            history: [{ chapter: `End of Book ${book}`, change: current }]
        };
    });
    return out;
}

function carryLore(source: Partial<Story>, book: number, recap: string, revealed: Array<{ title: string; truth: string; known_by: string[] }>): AnyRecord[] {
    const carried = (Array.isArray(source.lore) ? source.lore : [])
        .filter((l) => l && typeof l === 'object')
        .map((l) => {
            const item: AnyRecord = { ...(l as AnyRecord), valid_from_act: 1, valid_from_scene: 1 };
            if (item.from_book === undefined) item.from_book = book;
            if (clean(item.topic) === 'Status Quo Setting') item.topic = `Book ${book} Status Quo`;
            return item;
        });
    const extra: AnyRecord[] = [];
    if (recap) {
        extra.push({
            topic: `Book ${book} Recap: ${clean(source.title) || 'Previous Book'}`,
            detail: recap,
            valid_from_act: 1,
            valid_from_scene: 1,
            from_book: book
        });
    }
    revealed.forEach((r) => {
        extra.push({
            topic: `Revealed in Book ${book}: ${r.title}`,
            detail: `${r.truth}${r.known_by.length ? ` Known to: ${r.known_by.join(', ')}.` : ''}`,
            valid_from_act: 1,
            valid_from_scene: 1,
            from_book: book
        });
    });
    return [...carried, ...extra];
}

/** Deterministic recap for when no model-written one is available. */
export function fallbackRecap(source: Partial<Story>): string {
    const soFar = clean(source.story_so_far);
    if (soFar) return soFar;
    const parts = [clean(source.logline), clean(source.concept)].filter(Boolean);
    const acts = (Array.isArray(source.acts) ? source.acts : [])
        .map((a) => clean(a.act_mandate) || clean(a.description))
        .filter(Boolean);
    return [...parts, ...acts].join('\n\n');
}

export interface SequelInput {
    newStoryId: string;
    title: string;
    concept: string;
    recap?: string;
    authorNote?: string;
}

/**
 * Builds the next book's starting document. `baseTemplate` is a blank story (the caller passes
 * `createDefaultStoryTemplate`), which keeps this module free of lifecycle imports.
 */
export function buildSequelSeed(source: Partial<Story>, input: SequelInput, baseTemplate: AnyRecord): AnyRecord {
    const sourceBook = source.series?.book_number || 1;
    const bookNumber = sourceBook + 1;
    const recap = clean(input.recap) || fallbackRecap(source);
    const secrets = carrySecretsToSequel(source);
    const previous: PreviousBookSummary[] = [
        ...(source.series?.previous_books || []),
        { book_number: sourceBook, story_id: clean(source.id), title: clean(source.title) || `Book ${sourceBook}`, recap }
    ];
    const plan = normalizeSeriesPlan(source.series?.plan, bookNumber);
    if (plan) {
        plan.secrets = secrets.seriesSecrets;
        plan.books = plan.books.map((b) =>
            b.book_number <= sourceBook
                ? { ...b, status: 'written' as const }
                : b.book_number === bookNumber
                  ? { ...b, status: 'current' as const }
                  : b
        );
    }
    const threads = normalizeOpenThreads(source.open_threads, sourceBook)
        .filter(isThreadOpen)
        .map((t) => {
            const nextIntent = plan?.books.find((b) => b.book_number === bookNumber)?.thread_intents?.[t.id];
            return { ...t, intent: nextIntent, bound_to: undefined, planned_sequences: [] };
        });
    const style = (source.style || {}) as AnyRecord;
    const styleNote = [clean(style.genre_raw) || clean(style.genre), clean(style.tone_raw) || clean(style.mood), clean(style.style_raw) || clean(style.writing_guide)]
        .filter(Boolean)
        .join('\n');
    const series: SeriesInfo = {
        id: source.series?.id || `series_${clean(source.id) || input.newStoryId}`,
        title: source.series?.title || clean(source.title) || 'Untitled Series',
        book_number: bookNumber,
        previous_books: previous,
        returning_cast: collectReturningCast(source),
        carryover: {
            character_states: { ...((source.series?.carryover?.character_states || {}) as Record<string, AnyRecord>), ...((source.character_states || {}) as Record<string, AnyRecord>) },
            relationships: collapseRelationships(source, sourceBook),
            style_note: styleNote
        }
    };
    if (plan) series.plan = plan;

    const seed: AnyRecord = {
        ...baseTemplate,
        id: input.newStoryId,
        title: clean(input.title) || `${series.title}: Book ${bookNumber}`,
        concept: clean(input.concept),
        author_note: input.authorNote ?? source.author_note ?? '',
        writing_mode: source.writing_mode || 'novel',
        book_type: source.book_type || 'popular',
        target_word_count: source.target_word_count || 80000,
        world_primer: source.world_primer ?? null,
        style: source.style || baseTemplate.style,
        slop_allowlist: Array.isArray(source.slop_allowlist) ? [...(source.slop_allowlist as unknown[])] : [],
        narrator_vocal_cadence: source.narrator_vocal_cadence,
        narrator_voice_seed: source.narrator_voice_seed,
        user_edited: { narrator_vocal_cadence: true },
        lore: carryLore(source, sourceBook, recap, secrets.revealedFacts),
        secret_vault: secrets.vault,
        open_threads: threads,
        series
    };
    if (source.generation_ranges) seed.generation_ranges = source.generation_ranges;
    return seed;
}

/**
 * Gives returning characters their identity back after Tier 0.1 cast the new book. The new
 * book's corner role, flaw and desire win; voice and history come from the series.
 */
export function mergeReturningCast<T extends CastLike>(generated: T[], returning: Array<AnyRecord & { name: string }> | undefined): T[] {
    if (!Array.isArray(returning) || returning.length === 0) return generated;
    return generated.map((g) => {
        const prior = returning.find((r) => sameName(r.name, g.name));
        if (!prior) return g;
        const priorDetails = (prior.details || {}) as AnyRecord;
        const priorProfile = clean(priorDetails.deep_profile) || clean(prior.deep_profile);
        const merged: AnyRecord = {
            ...g,
            returning_from_book: Number(prior.last_seen_book) || 1,
            prior_deep_profile: priorProfile,
            prior_end_state: prior.end_state,
            last_corner_role: prior.last_corner_role
        };
        // Voice stays locked across books.
        if (clean(prior.vocal_cadence)) {
            merged.vocal_cadence = prior.vocal_cadence;
            merged.user_edited_cadence = true;
        }
        if (prior.voice_seed !== undefined) merged.voice_seed = prior.voice_seed;
        if (clean(prior.reference_text)) {
            merged.reference_text = prior.reference_text;
            merged.user_edited_reference_text = true;
        }
        ['voice_profile', 'voice_id', 'voice_sample'].forEach((k) => {
            if (prior[k] !== undefined && merged[k] === undefined) merged[k] = prior[k];
        });
        return merged as T;
    });
}

/** The generated lead, when it is one of the returning characters. */
export function findSequelLead<T extends CastLike>(generated: T[]): T | undefined {
    return (
        generated.find((c) => clean(c.corner_role).toUpperCase() === 'MAIN_CHARACTER') || generated[0]
    );
}

/** A sequel's lead may change, but must be a character the series already knows. */
export function validateSequelLead(generated: CastLike[], returning: Array<{ name: string }> | undefined): boolean {
    if (!Array.isArray(returning) || returning.length === 0) return true;
    const lead = findSequelLead(generated);
    return !!lead && returning.some((r) => sameName(r.name, lead.name));
}

/** Starting states for the new book: returning characters keep where the last book left them. */
export function mergeCarriedCharacterStates(
    generated: Record<string, AnyRecord>,
    carried: Record<string, AnyRecord> | undefined
): Record<string, AnyRecord> {
    if (!carried) return generated;
    const out: Record<string, AnyRecord> = {};
    Object.entries(generated).forEach(([name, state]) => {
        const key = Object.keys(carried).find((k) => sameName(k, name));
        const prior = key ? carried[key] : null;
        out[name] = prior
            ? {
                  ...state,
                  physical_state: clean(prior.physical_state) || state.physical_state,
                  emotional_state: clean(prior.emotional_state) || state.emotional_state,
                  location: clean(prior.location) || state.location,
                  unresolved_tension: clean(prior.unresolved_tension) || state.unresolved_tension,
                  held_items: Array.isArray(prior.held_items) ? prior.held_items : state.held_items
              }
            : state;
    });
    return out;
}

/** Relationships between two returning characters start where the last book left them. */
export function mergeCarriedRelationships(
    generated: Record<string, AnyRecord>,
    carried: Record<string, AnyRecord> | undefined,
    castNames: string[]
): Record<string, AnyRecord> {
    if (!carried) return generated;
    const out: Record<string, AnyRecord> = { ...generated };
    const inCast = (n: string) => castNames.some((c) => sameName(c, n));
    Object.entries(carried).forEach(([key, prior]) => {
        const [from, to] = key.split('->');
        if (!from || !to || !inCast(from) || !inCast(to)) return;
        const matchKey = Object.keys(out).find((k) => {
            const [f, t] = k.split('->');
            return sameName(f, from) && sameName(t, to);
        });
        const fresh = matchKey ? out[matchKey] : null;
        const current = clean(prior.current);
        out[matchKey || key] = {
            ...(fresh || {}),
            current: current || clean(fresh?.current),
            initial_feeling: current || clean(fresh?.initial_feeling),
            hidden_tension: clean(fresh?.hidden_tension) || clean(prior.hidden_tension),
            trust_level: Number(prior.trust_level) || Number(fresh?.trust_level) || 5,
            history: Array.isArray(prior.history) ? prior.history : []
        };
    });
    return out;
}
