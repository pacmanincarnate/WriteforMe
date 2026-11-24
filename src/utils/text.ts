export interface BannedPhraseMatch {
    phrase: string;
    occurrences: number;
}

export interface BannedPhraseCountResult {
    count: number;
    matches: BannedPhraseMatch[];
}

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
