/**
 * @module domain/continuity/secretScrub
 * Keeps an unrevealed secret out of text a writer or character should not read.
 *
 * The first scrub replaced only the exact truth string, so the same secret in another word order
 * ("the ledger was forged by Mara") went straight through. This one also drops any sentence that
 * carries most of the truth's telling words. A secret told in entirely different words is beyond
 * word matching; the leak judge (pipeline/secretLeak.ts) reads for that.
 */

import { safeEscapeRegex } from '@/utils';

export interface ScrubbableSecret {
    truth?: string;
    title?: string;
}

const STOPWORDS = new Set(
    (
        'about above after again against also among another around because been before being below between both ' +
        'could does doing down during each every from further have having here hers herself himself into itself ' +
        'just more most much must never once only other ours ourselves over same shall should some such than that ' +
        'their theirs them themselves then there these they this those through under until upon very were what ' +
        'when where which while whom whose will with within without would your yours yourself really still even ' +
        'ever always actually secretly truly true truth secret'
    ).split(' ')
);

const SENTENCE = /[^.!?\n]+(?:[.!?]+["”')\]]*|$)/g;

/** A word reduced so "forged", "forging" and "forges" count as one. */
function stem(word: string): string {
    return word.replace(/(?:ing|ed|es|s|'s|’s)$/, '');
}

/** The words of a truth that carry it: four letters or more, not a filler, and not in `ignore`. */
export function tellingWords(truth: string, ignore: readonly string[] = []): string[] {
    const skip = new Set(ignore.flatMap((name) => name.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean).map(stem));
    const found = new Set<string>();
    (String(truth || '').toLowerCase().match(/[a-z0-9][a-z0-9'’-]{3,}/g) || []).forEach((word) => {
        if (STOPWORDS.has(word)) return;
        const base = stem(word);
        if (base.length >= 3 && !skip.has(base)) found.add(base);
    });
    return Array.from(found);
}

/** How many telling words a sentence must share with the truth before it counts as telling it. */
function neededShare(total: number): number {
    if (total <= 2) return total;
    return Math.max(2, Math.ceil(total * 0.6));
}

/** Whether a sentence carries most of a truth's telling words. */
export function sentenceTellsSecret(sentence: string, telling: readonly string[]): boolean {
    if (telling.length < 2) return false;
    const words = new Set((sentence.toLowerCase().match(/[a-z0-9][a-z0-9'’-]{2,}/g) || []).map(stem));
    const shared = telling.filter((word) => words.has(word)).length;
    return shared >= neededShare(telling.length);
}

export interface ScrubOptions {
    /** What replaces the exact truth or a sentence that tells it. */
    placeholder: string;
    /** What replaces the secret's title, when titles are scrubbed too. */
    titlePlaceholder?: string;
    /** Names that appear all over the story (the cast) and so identify no secret on their own. */
    ignoreWords?: readonly string[];
    minTruthLength?: number;
}

/** `text` with one secret taken out: the exact truth, then any sentence that tells it in other order. */
export function scrubSecretFromText(text: string, secret: ScrubbableSecret, options: ScrubOptions): string {
    let out = String(text || '');
    const truth = String(secret?.truth || '').trim();
    if (!out) return out;
    if (options.titlePlaceholder && secret?.title) {
        out = out.replace(new RegExp(safeEscapeRegex(secret.title), 'gi'), options.titlePlaceholder);
    }
    if (truth.length <= (options.minTruthLength ?? 5)) return out;
    out = out.replace(new RegExp(safeEscapeRegex(truth), 'gi'), options.placeholder);
    const telling = tellingWords(truth, options.ignoreWords);
    if (telling.length < 2) return out;
    return out.replace(SENTENCE, (sentence) => {
        if (sentence.includes(options.placeholder) || !sentenceTellsSecret(sentence, telling)) return sentence;
        const lead = sentence.match(/^\s*/)?.[0] || '';
        return `${lead}${options.placeholder}`;
    });
}

/** `text` with every one of `secrets` taken out. */
export function scrubSecretsFromText(text: string, secrets: readonly ScrubbableSecret[], options: ScrubOptions): string {
    return (secrets || []).reduce((out, secret) => scrubSecretFromText(out, secret, options), String(text || ''));
}

/** Whether any sentence of `text` still tells `truth`, exactly or by its telling words. */
export function textTellsSecret(text: string, truth: string, ignoreWords: readonly string[] = []): boolean {
    const source = String(text || '');
    const value = String(truth || '').trim();
    if (!source || value.length <= 5) return false;
    if (source.toLowerCase().includes(value.toLowerCase())) return true;
    const telling = tellingWords(value, ignoreWords);
    return (source.match(SENTENCE) || []).some((sentence) => sentenceTellsSecret(sentence, telling));
}
