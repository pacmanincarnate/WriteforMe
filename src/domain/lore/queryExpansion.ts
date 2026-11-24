/**
 * @module domain/lore/queryExpansion
 * Local non-LLM RAG query expansion using entity extraction, filtered unigrams, and bigrams.
 */

export const STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'by',
    'about',
    'against',
    'between',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'from',
    'up',
    'down',
    'of',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'any',
    'both',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    's',
    't',
    'can',
    'will',
    'just',
    'don',
    'should',
    'now',
    'this',
    'that',
    'these',
    'those',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'is',
    'am',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'having',
    'do',
    'does',
    'did',
    'doing',
    'would',
    'could',
    'ought',
    'scene',
    'sequence',
    'act',
    'chapter',
    'status',
    'action',
    'reaction',
    'tactic',
    'shift',
    'proactive',
    'reactive'
]);

/** Extracts top-K salient proper entities, bigrams, and keywords from a structured scene query. */
export function expandQueryLocally(query: unknown, topK = 8): string {
    if (!query || typeof query !== 'string') return '';
    const cleanRaw = query.trim();
    if (!cleanRaw || cleanRaw.startsWith('Concept:')) return '';
    const targetK = Math.min(10, Math.max(0, parseInt(String(topK), 10)));
    if (isNaN(targetK) || targetK <= 0) return '';

    const text = cleanRaw
        .replace(/<[^>]+>/g, ' ')
        .replace(/(?:Sequence|Scene|Act|Chapter)\s+\d+[:.\s]*/gi, ' ')
        .replace(/(?:Location|Characters|Threads|Themes|Objective|Scene Action):\s*/gi, ' ')
        .replace(/\[PREVIOUS SCENE[^\]]*\]/gi, ' ');

    const entityMatches: string[] = [];
    const entityRegex = /\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*\b/g;
    let match: RegExpExecArray | null;
    while ((match = entityRegex.exec(text)) !== null) {
        const candidate = match[0].trim();
        const lowerWords = candidate.toLowerCase().split(/\s+/);
        if (!lowerWords.every((w) => STOP_WORDS.has(w)) && candidate.length > 2) {
            entityMatches.push(candidate);
        }
    }

    const rawTokens = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || [];
    const filteredTokens: string[] = [];
    for (const tok of rawTokens) {
        const lower = tok.toLowerCase();
        if (lower.length > 2 && !STOP_WORDS.has(lower)) {
            filteredTokens.push(lower);
        }
    }

    const bigrams: string[] = [];
    for (let i = 0; i < filteredTokens.length - 1; i++) {
        bigrams.push(`${filteredTokens[i]} ${filteredTokens[i + 1]}`);
    }

    const scoreMap = new Map<string, number>();
    for (const ent of entityMatches) {
        scoreMap.set(ent, (scoreMap.get(ent) || 0) + 3.0);
    }
    for (const bg of bigrams) {
        scoreMap.set(bg, (scoreMap.get(bg) || 0) + 2.0);
    }
    for (const unigram of filteredTokens) {
        scoreMap.set(unigram, (scoreMap.get(unigram) || 0) + 1.0);
    }

    const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
    const results: string[] = [];
    const seenLower = new Set<string>();

    for (const [term] of sorted) {
        const lower = term.toLowerCase();
        if (!seenLower.has(lower)) {
            seenLower.add(lower);
            results.push(term);
            if (results.length >= targetK) break;
        }
    }

    return results.join(', ');
}
