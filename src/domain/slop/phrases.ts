/**
 * @module domain/slop/phrases
 * Finds wording that keeps coming back: the same run of three to eight words used again and
 * again, inside one scene or across the last few. Word lists cannot catch this, because the
 * phrase is the model's own habit in this story ("the weight of it", "something like relief").
 * Deterministic; nothing here calls a model.
 */

export const PHRASE_MIN_WORDS = 3;
export const PHRASE_MAX_WORDS = 8;
export const PHRASE_MAX_FINDINGS = 30;

export interface PhrasePassage {
    id: string;
    text: string;
}

export interface RepeatedPhrase {
    phrase: string;
    words: number;
    /** Times the phrase occurs, not counting overlaps with itself. */
    count: number;
    /** How many of the passages hold it. */
    passageCount: number;
    /** Where it occurs: passage index and character offsets. */
    spans: Array<{ passage: number; start: number; end: number }>;
}

const WORD_RX = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const BOUNDARY_RX = /[.!?;:\n\r]/;

/** A phrase made only of these says nothing about habit ("it was in the"). */
const COMMON = new Set(
    (
        'a an and are as at be been being but by did do does for from had has have he her hers him his i if in ' +
        'into is it its me my of on or our she so that the their them then there these they this those to too ' +
        'us was we were what when where which who will with would you your said says not no'
    ).split(' ')
);

interface Token {
    word: string;
    start: number;
    end: number;
    /** Sentence number: a phrase never runs across a sentence break. */
    segment: number;
}

function tokensOf(text: string): Token[] {
    const result: Token[] = [];
    let segment = 0;
    let previous = 0;
    for (const match of text.matchAll(WORD_RX)) {
        const start = match.index ?? 0;
        if (BOUNDARY_RX.test(text.slice(previous, start))) segment++;
        const word = match[0].normalize('NFKC').toLowerCase().replace(/’/g, "'");
        result.push({ word, start, end: start + match[0].length, segment });
        previous = start + match[0].length;
    }
    return result;
}

function* windowsOf(tokens: Token[], skip: ReadonlySet<string>): Generator<[string, number, number]> {
    for (let start = 0; start < tokens.length; start++) {
        const limit = Math.min(PHRASE_MAX_WORDS, tokens.length - start);
        for (let size = PHRASE_MIN_WORDS; size <= limit; size++) {
            const end = start + size - 1;
            if (tokens[start].segment !== tokens[end].segment) break;
            const words = tokens.slice(start, end + 1).map((t) => t.word);
            if (words.every((w) => COMMON.has(w))) continue;
            // A phrase that is mostly a name ("said Mara Voss") is the story, not a habit.
            if (words.filter((w) => !COMMON.has(w)).every((w) => skip.has(w))) continue;
            yield [words.join(' '), tokens[start].start, tokens[end].end];
        }
    }
}

type Span = { passage: number; start: number; end: number };

function overlapsCovered(span: Span, covered: Map<number, Array<[number, number]>>): boolean {
    const ranges = covered.get(span.passage) || [];
    return ranges.some(([left, right]) => {
        const shared = Math.min(span.end, right) - Math.max(span.start, left);
        return shared > (span.end - span.start) / 2;
    });
}

/**
 * The phrases used at least `minimum` times across the passages, longest and most used first.
 * A shorter phrase that only occurs inside a longer one already reported is left out.
 */
export function detectRepeatedPhrases(
    passages: readonly PhrasePassage[],
    options: { minimum?: number; ignoreWords?: Iterable<string> } = {}
): RepeatedPhrase[] {
    const minimum = Math.max(2, options.minimum ?? 3);
    const skip = new Set<string>();
    for (const word of options.ignoreWords || []) {
        for (const part of String(word).toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
            if (part) skip.add(part);
        }
    }

    const tokenised = passages.map((p) => tokensOf(String(p.text || '')));
    const counts = new Map<string, number>();
    for (const tokens of tokenised) {
        for (const [phrase] of windowsOf(tokens, skip)) {
            counts.set(phrase, (counts.get(phrase) || 0) + 1);
        }
    }

    const matches = new Map<string, Span[]>();
    tokenised.forEach((tokens, passage) => {
        const ends = new Map<string, number>();
        for (const [phrase, start, end] of windowsOf(tokens, skip)) {
            if ((counts.get(phrase) || 0) < minimum) continue;
            if (start < (ends.get(phrase) || 0)) continue;
            const list = matches.get(phrase) || [];
            list.push({ passage, start, end });
            matches.set(phrase, list);
            ends.set(phrase, end);
        }
    });

    const ranked = [...matches.entries()]
        .filter(([, spans]) => spans.length >= minimum)
        .sort(([a, sa], [b, sb]) => {
            const wa = a.split(' ').length;
            const wb = b.split(' ').length;
            return sb.length * wb - sa.length * wa || wb - wa || a.localeCompare(b);
        });

    const covered = new Map<number, Array<[number, number]>>();
    const findings: RepeatedPhrase[] = [];
    for (const [phrase, spans] of ranked) {
        if (spans.filter((span) => !overlapsCovered(span, covered)).length < minimum) continue;
        if (findings.length >= PHRASE_MAX_FINDINGS) break;
        findings.push({
            phrase,
            words: phrase.split(' ').length,
            count: spans.length,
            passageCount: new Set(spans.map((s) => s.passage)).size,
            spans
        });
        for (const span of spans) {
            const ranges = covered.get(span.passage) || [];
            ranges.push([span.start, span.end]);
            covered.set(span.passage, ranges);
        }
    }
    return findings;
}

/** One prompt line naming wording the last scenes keep reusing, or '' when there is none. */
export function phraseHabitsLine(
    passages: readonly PhrasePassage[],
    options: { minimumScenes?: number; shown?: number; ignoreWords?: Iterable<string> } = {}
): string {
    const minimumScenes = options.minimumScenes ?? 3;
    const shown = options.shown ?? 5;
    if (passages.length < minimumScenes) return '';
    const habits = detectRepeatedPhrases(passages, { minimum: minimumScenes, ignoreWords: options.ignoreWords })
        .filter((found) => found.passageCount >= minimumScenes)
        .sort((a, b) => b.passageCount - a.passageCount || b.words - a.words || a.phrase.localeCompare(b.phrase))
        .slice(0, shown);
    if (habits.length === 0) return '';
    const listed = habits
        .map((h) => `"${h.phrase}" (${h.passageCount} of the last ${passages.length} scenes)`)
        .join(', ');
    return `Wording the recent scenes keep reusing: ${listed}. Do not use these phrases in this scene; say it another way.`;
}

/** The written scenes just before scene `seq`-`s`, oldest first, at most `limit` of them. */
export function recentScenePassages(
    prose: unknown,
    seq: number,
    s: number,
    limit = 6
): PhrasePassage[] {
    if (!prose || typeof prose !== 'object') return [];
    const found: Array<{ seq: number; scene: number; text: string }> = [];
    for (const [key, entry] of Object.entries(prose as Record<string, unknown>)) {
        const match = /^(\d+)-(\d+)$/.exec(key);
        if (!match) continue;
        const at = { seq: Number(match[1]), scene: Number(match[2]) };
        if (at.seq > seq || (at.seq === seq && at.scene >= s)) continue;
        const text =
            typeof entry === 'string'
                ? entry
                : entry && typeof entry === 'object'
                  ? String((entry as { final?: unknown }).final || '')
                  : '';
        if (text.trim()) found.push({ ...at, text });
    }
    return found
        .sort((a, b) => a.seq - b.seq || a.scene - b.scene)
        .slice(-limit)
        .map((f) => ({ id: `${f.seq}-${f.scene}`, text: f.text }));
}
