/**
 * Book series types. Every field here is optional on a story: a story without `series` is a
 * standalone book and behaves exactly as it did before series support existed.
 */

export type OpenThreadStatus = 'open' | 'advanced' | 'resolved' | 'abandoned';
export type OpenThreadKind = 'plot' | 'mystery' | 'relationship' | 'character' | 'world';
export type ThreadIntent = 'introduce' | 'advance' | 'complicate' | 'pay_off' | 'rest' | 'defer';
export type BookRole = 'opener' | 'escalation' | 'reversal' | 'low_point' | 'finale' | 'middle';

export interface OpenThreadTouch {
    book: number;
    /** Scene label such as `4.2`, or `plan` for a planning-time note. */
    scene: string;
    note: string;
}

/** A thread that lives across books. Per-book A/B/C threads stay in `story.threads`. */
export interface OpenThread {
    /** `S1`, `S2`, ... stable for the whole series. */
    id: string;
    title: string;
    description: string;
    status: OpenThreadStatus;
    origin_book: number;
    kind?: OpenThreadKind;
    /** What the reader was told to expect. The pay-off is judged against this. */
    promise?: string;
    /** Names of the characters who carry the thread. */
    owners?: string[];
    /** What the current book should do with the thread. */
    intent?: ThreadIntent;
    /** Id of the per-book thread (`T1`..) that carries it in the current book. */
    bound_to?: string;
    linked_secret_id?: string;
    /** Sequence numbers in the current book where the thread should be on the page. */
    planned_sequences?: number[];
    touches?: OpenThreadTouch[];
    source?: 'plan' | 'user' | 'model' | 'audit';
    last_note?: string;
}

export interface SecretLayer {
    layer: number;
    /** The partial truth this layer exposes. */
    truth: string;
    reveal_book: number;
    /** Characters who learn it. Empty means only the reader learns it. */
    revealed_to?: string[];
    status: 'hidden' | 'revealed';
}

export interface SeededClueRecord {
    book: number;
    scene: string;
    directive: string;
}

/** A secret owned by the series plan. Each layer becomes a normal vault secret in its book. */
export interface SeriesSecret {
    id: string;
    title: string;
    cover_story?: string;
    known_by_characters?: string[];
    concealed_from_characters?: string[];
    reader_status?: 'aware' | 'blind';
    layers: SecretLayer[];
    /** Every clue that reached the page, in every book (the fair-play ledger). */
    seeded_clues?: SeededClueRecord[];
}

/** Series fields a vault secret may carry. Absent scope means a normal book-level secret. */
export interface SeriesSecretFields {
    scope?: 'book' | 'series';
    reveal_book?: number;
    parent_secret_id?: string;
    layer?: number;
}

export interface BookPlan {
    book_number: number;
    role: BookRole;
    /** The smaller question this book answers. */
    book_question: string;
    stakes_scope: string;
    lead_name?: string;
    lead_arc_stage?: { lie: string; truth: string };
    /** Where the lead, the cast and the world must stand on the last page. */
    handoff_state: string;
    thread_intents: Record<string, ThreadIntent>;
    status: 'written' | 'current' | 'sketched';
}

export interface LongArc {
    char_name: string;
    lie: string;
    truth: string;
}

/** Rolling roadmap: written books, the current book in full, the next one as a sketch. */
export interface SeriesPlan {
    series_question: string;
    series_thematic_argument: string;
    /** One long arc per character who has led a book. */
    long_arcs: LongArc[];
    endgame_note: string;
    books: BookPlan[];
    secrets: SeriesSecret[];
    revisions: Array<{ after_book: number; summary: string }>;
}

export interface PreviousBookSummary {
    book_number: number;
    story_id: string;
    title: string;
    recap: string;
}

export interface SeriesInfo {
    /** Shared by every book of the series. */
    id: string;
    title: string;
    book_number: number;
    previous_books: PreviousBookSummary[];
    /** Characters carried from earlier books, whether or not this book casts them. */
    returning_cast?: Array<Record<string, unknown> & { name: string }>;
    /** End-of-book state copied from the previous book when this one was started. */
    carryover?: {
        character_states?: Record<string, Record<string, unknown>>;
        relationships?: Record<string, Record<string, unknown>>;
        style_note?: string;
    };
    plan?: SeriesPlan;
    /** Violations left after the ending contract's retries ran out, for the user to see. */
    contract_violations?: ContractViolation[];
}

export interface ContractViolation {
    rule: 'must_close' | 'must_stay_open' | 'must_stay_hidden' | 'must_pay_off';
    /** `S1`, a secret id, or `book_question`. */
    subject: string;
    evidence: string;
}

export interface EndingContract {
    book_number: number;
    book_question: string;
    handoff_state: string;
    /** Per-book thread ids that must close; the A-story always does. */
    must_close: string[];
    must_pay_off: OpenThread[];
    must_stay_open: OpenThread[];
    must_stay_hidden: Array<{ secret_id: string; title: string; truth: string }>;
}

export interface OpenThreadUpdate {
    id: string;
    change: 'advanced' | 'complicated' | 'resolved';
    note: string;
}

export interface ThreadCandidate {
    title: string;
    promise?: string;
    description?: string;
    owners?: string[];
    kind?: OpenThreadKind;
}

export interface SecretEvent {
    secret_id: string;
    event: 'clue_seeded' | 'layer_revealed' | 'leaked';
    evidence?: string;
}
