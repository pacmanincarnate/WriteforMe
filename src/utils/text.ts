export interface BannedPhraseMatch {
    phrase: string;
    occurrences: number;
}

export interface BannedPhraseCountResult {
    count: number;
    matches: BannedPhraseMatch[];
}

/** Escapes special regex metacharacters for safe dynamic `RegExp` construction. */
export function safeEscapeRegex(str: unknown): string {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alias of `safeEscapeRegex` used across continuity and validation engines. */
export function escapeRegExp(s: unknown): string {
    return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Counts words in a string using whitespace segmentation. */
export function countWords(text: string | null | undefined): number {
    const t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
}

/** Estimates reading time in minutes at 225 wpm (minimum 1 minute). */
export function readingMinutes(words: number): number {
    return Math.max(1, Math.round(words / 225));
}

/** Parses non-negative integer strings/numbers, returning `null` otherwise. */
export function parseNum(v: unknown): number | null {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
    return null;
}

/** Case-insensitive token/word-boundary match against a haystack string. */
export function tokenMatch(haystack: unknown, needle: unknown): boolean {
    if (!haystack || !needle) return false;
    const cleanNeedle = String(needle).trim();
    if (!cleanNeedle) return false;
    try {
        const rx = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(cleanNeedle)}([^a-zA-Z0-9_]|$)`, 'i');
        return rx.test(String(haystack));
    } catch {
        return String(haystack).toLowerCase().includes(cleanNeedle.toLowerCase());
    }
}

export const STOPWORDS: ReadonlySet<string> = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
    'as', 'is', 'it', 'its', 'he', 'she', 'we', 'us', 'my', 'his', 'her', 'our', 'me', 'him',
    'them', 'their', 'no', 'so', 'up', 'if', 'do', 'did', 'be', 'was', 'were', 'has', 'had',
    'have', 'but', 'not', 'you', 'your', 'all', 'any', 'into', 'onto', 'than', 'then', 'that',
    'this', 'dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'sir', 'lady', 'lord',
    'captain', 'major', 'general', 'colonel', 'sergeant', 'officer', 'agent', 'judge'
]);

/**
 * Counts occurrences of banned phrases in prose using word boundaries for
 * alphanumeric edges and substring matching for punctuated phrases.
 */
export function countBannedPhrases(text: string, list: string[]): BannedPhraseCountResult {
    if (!text || !list || list.length === 0) return { count: 0, matches: [] };
    let count = 0;
    const matches: BannedPhraseMatch[] = [];
    const lowerText = text.toLowerCase();

    for (let i = 0; i < list.length; i++) {
        const cleanPhrase = String(list[i] || '').trim().toLowerCase();
        if (!cleanPhrase) continue;

        const escaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = (/^\w/.test(cleanPhrase) && /\w$/.test(cleanPhrase))
            ? new RegExp(`\\b${escaped}\\b`, 'gi')
            : new RegExp(escaped, 'gi');

        const findMatches = lowerText.match(regex);
        if (findMatches) {
            count += findMatches.length;
            matches.push({ phrase: cleanPhrase, occurrences: findMatches.length });
        }
    }
    return { count, matches };
}
