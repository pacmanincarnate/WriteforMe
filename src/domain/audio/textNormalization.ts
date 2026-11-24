/**
 * @module domain/audio/textNormalization
 * Plain-text prose normalization, Kokoro TTS chunking, spoken dialogue cleaning,
 * English number/time/currency expansion, and Drama-3 tag-preserving normalization.
 */

import { countWords } from '@/utils';

export interface TtsTextChunk {
    index: number;
    text: string;
    wordCount: number;
}

const TTS_ABBREVS = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'gen', 'col', 'maj', 'capt',
    'lt', 'sgt', 'cpl', 'pvt', 'st', 'ave', 'rd', 'blvd', 'dept', 'univ',
    'co', 'inc', 'ltd', 'corp', 'vs', 'etc', 'e.g', 'i.e', 'approx', 'est'
]);

/** Strips markdown/XML markup and normalizes literary punctuation for plain-text TTS backends. */
export function stripProseToPlainText(prose: unknown): string {
    if (!prose) return '';
    let txt: unknown = prose;
    if (typeof txt === 'object' && txt !== null) {
        const rec = txt as Record<string, unknown>;
        if (typeof rec.final === 'string') txt = rec.final;
        else if (typeof rec.draft === 'string') txt = rec.draft;
        else if (typeof rec.text === 'string') txt = rec.text;
        else if (typeof rec.content === 'string') txt = rec.content;
        else return '';
    }
    if (typeof txt !== 'string') txt = String(txt || '');
    let out = txt as string;
    if (!out.trim()) return '';
    out = out.replace(/^#+\s+/gm, '');
    out = out.replace(/^\s*[-*_]{3,}\s*$/gm, '');
    out = out.replace(/!\[.*?\]\(.*?\)/g, '');
    out = out.replace(/\[(.*?)\]\(.*?\)/g, '$1');
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
    out = out.replace(/\*([^*]+)\*/g, '$1');
    out = out.replace(/__([^_]+)__/g, '$1');
    out = out.replace(/_([^_]+)_/g, '$1');
    out = out.replace(/`([^`]+)`/g, '$1');
    out = out.replace(/<[^>]+>/g, '');
    out = out.replace(/[—–]/g, ' , ');
    out = out.replace(/--+/g, ' , ');
    out = out.replace(/…/g, '... ');
    out = out.replace(/[“”]/g, '"');
    out = out.replace(/[‘’]/g, "'");
    out = out.replace(/([a-zA-Z])'([a-zA-Z])/g, "$1'$2");
    out = out.replace(/\r\n/g, '\n');
    out = out.replace(/[ \t]+/g, ' ');
    return out.trim();
}

/** Splits prose into sentence-aligned chunks sized for Kokoro/eSpeak TTS synthesis. */
export function chunkProseForTts(proseText: unknown, minChars = 120, maxChars = 320): TtsTextChunk[] {
    const plain = stripProseToPlainText(proseText);
    if (!plain) return [];

    const rawParagraphs = plain.split(/\n\s*\n+/);
    const sentences: string[] = [];

    rawParagraphs.forEach((para) => {
        const p = para.trim();
        if (!p) return;

        const regex = /([^.?!…]+(?:[.?!…]+["']?|$))/g;
        let match: RegExpExecArray | null;
        let lastSentence = '';

        while ((match = regex.exec(p)) !== null) {
            const rawSent = match[0].trim();
            if (!rawSent) continue;

            const words = rawSent.split(/\s+/);
            const lastWord = words[words.length - 1].replace(/[.?!…"']/g, '').toLowerCase();

            if (TTS_ABBREVS.has(lastWord) && regex.lastIndex < p.length) {
                lastSentence += (lastSentence ? ' ' : '') + rawSent;
                continue;
            }

            const completeSent = (lastSentence ? `${lastSentence} ` : '') + rawSent;
            lastSentence = '';
            sentences.push(completeSent);
        }

        if (lastSentence) {
            sentences.push(lastSentence);
        }
    });

    const chunks: string[] = [];
    let currentChunk = '';

    sentences.forEach((sent) => {
        const trimmed = sent.trim();
        if (!trimmed) return;

        if (!currentChunk) {
            currentChunk = trimmed;
        } else if (currentChunk.length + trimmed.length + 1 <= maxChars) {
            currentChunk += ' ' + trimmed;
        } else {
            if (currentChunk.length >= minChars) {
                chunks.push(currentChunk);
                currentChunk = trimmed;
            } else {
                currentChunk += ' ' + trimmed;
                if (currentChunk.length >= maxChars) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
            }
        }
    });

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks.map((rawText, idx) => {
        let text = rawText.trim();
        if (text && !/[.?!:;"']$/.test(text)) {
            text += '.';
        }
        return {
            index: idx,
            text,
            wordCount: countWords(text)
        };
    });
}

/** Estimates relative spoken duration weight of a cue line including punctuation pauses. */
export function computeCueTextWeight(text: unknown): number {
    const s = String(text || '').trim();
    if (!s) return 10;
    const punctMatches = s.match(/[,;:\u2014\u2013]|[.?!\u2026]/g) || [];
    return Math.max(10, s.length) + punctMatches.length * 6;
}

/** Splits an overlong cue line along sentence boundaries up to `maxChars`. */
export function splitLongCueText(text: unknown, maxChars = 220): string[] {
    const s = String(text || '').trim();
    if (!s || s.length <= maxChars) return s ? [s] : [];
    const sentences = s.match(/[^.?!\u2026]+(?:[.?!\u2026]+["'\u201d\u2019]?|$)/g) || [s];
    const out: string[] = [];
    let buf = '';
    for (const rawSent of sentences) {
        const sent = rawSent.trim();
        if (!sent) continue;
        if (!buf) buf = sent;
        else if (buf.length + sent.length + 1 <= maxChars) buf += ' ' + sent;
        else {
            out.push(buf);
            buf = sent;
        }
    }
    if (buf) out.push(buf);
    return out.length > 0 ? out : [s];
}

/**
 * Cleans spoken dialogue text for plain-text TTS backends and Whisper verification by
 * stripping `[cues]`, legacy `(events)`, the 7 Drama-3 XML tags, and markdown emphasis.
 */
export function cleanDialogueSpokenText(text: unknown): string {
    if (!text) return '';
    return String(text)
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(
            /\((?:whisper(?:ing|s)?|sighs?|gasps?|shouts?|screams?|singing|humming|stutters?|crying|sobs?|whimpers?|groans?|moans?|laughs?|chuckles?|giggles?|inhales?|exhales?|breathing\s+heavily|clears?\s+throat|coughs?|sniffs?|smacks?\s+lips|clicks?\s+tongue|yawns?|sneezes?|hiccups?|burps?|gulps?|gags?|grunts?|scoffs?|snorts?|pauses?|mutters?|softly|quietly|loudly|gently|firmly|grimly|coldly|warmly|tiredly|wearily|aside|internal|o\.s\.|v\.o\.)\)/gi,
            ' '
        )
        .replace(/<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(
            /(^|\s)\*(?:whisper(?:ing|s)?|sighs?|gasps?|shouts?|cries|sobs?|laughs?|groans?|chuckles?|pauses?|clears\s+throat|mutters?|snickers?)\*(\s|$|[.,!?])/gi,
            '$1$2'
        )
        .replace(/(^|\s)[*_]+([^*_]+?)[*_]+(\s|$|[.,!?])/g, '$1$2$3')
        .replace(/^[*_]+|[*_]+$/g, '')
        .replace(/^\(([^)]+)\)$/, '$1')
        .replace(/^["“”']\s*|\s*["“”']$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Splits spoken text into sentence/clause-aligned sub-chunks only when exceeding `maxWords`.
 */
export function splitSpokenTextIntoTtsSubchunks(spokenText: unknown, maxWords = 120): string[] {
    const clean = String(spokenText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    const countRegexWords = (str: string) => (String(str || '').match(/\b\w+\b/g) || []).length;
    const totalWords = countRegexWords(clean);

    if (totalWords <= maxWords) {
        return [clean];
    }

    const regex = /([^.?!…]+(?:[.?!…]+["'”’]?|$))/g;
    const rawSentences: string[] = [];
    let match: RegExpExecArray | null;
    let carry = '';

    while ((match = regex.exec(clean)) !== null) {
        const seg = match[0].trim();
        if (!seg) continue;
        const words = seg.split(/\s+/);
        const lastWord = words[words.length - 1].replace(/[.?!…"”'’]/g, '').toLowerCase();
        if (TTS_ABBREVS.has(lastWord) && regex.lastIndex < clean.length) {
            carry += (carry ? ' ' : '') + seg;
            continue;
        }
        const fullSent = (carry ? carry + ' ' : '') + seg;
        carry = '';
        rawSentences.push(fullSent);
    }
    if (carry) rawSentences.push(carry);

    const boundedUnits: string[] = [];
    rawSentences.forEach((sent) => {
        if (countRegexWords(sent) <= maxWords) {
            boundedUnits.push(sent);
            return;
        }
        const clauses = sent.split(/(?<=[;—–:])\s+|(?<=,)\s+(?=[A-Za-z"“'‘])/);
        let acc = '';
        let accWords = 0;
        clauses.forEach((cl) => {
            const c = cl.trim();
            if (!c) return;
            const cWords = countRegexWords(c);
            if (!acc) {
                acc = c;
                accWords = cWords;
            } else if (accWords + cWords <= maxWords) {
                acc += ' ' + c;
                accWords += cWords;
            } else {
                boundedUnits.push(acc);
                acc = c;
                accWords = cWords;
            }
        });
        if (acc) {
            if (countRegexWords(acc) > maxWords) {
                const tokens = acc.split(/\s+/);
                for (let i = 0; i < tokens.length; i += maxWords) {
                    boundedUnits.push(tokens.slice(i, i + maxWords).join(' '));
                }
            } else {
                boundedUnits.push(acc);
            }
        }
    });

    const subchunks: string[] = [];
    let current = '';
    let currentWords = 0;
    boundedUnits.forEach((unit) => {
        const u = unit.trim();
        if (!u) return;
        const uWords = countRegexWords(u);
        if (!current) {
            current = u;
            currentWords = uWords;
        } else if (currentWords + uWords <= maxWords) {
            current += ' ' + u;
            currentWords += uWords;
        } else {
            subchunks.push(current);
            current = u;
            currentWords = uWords;
        }
    });
    if (current) subchunks.push(current);

    return subchunks.map((s) => s.trim()).filter((t) => /[a-zA-Z0-9]/.test(t));
}

export const NUM_WORDS_ONES: readonly string[] = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
];

export const NUM_WORDS_TENS: readonly string[] = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
];

/** Converts non-negative integers (< 1 billion) into spoken English words. */
export function integerToEnglishWords(nInput: number): string {
    const n = Math.floor(Math.abs(nInput));
    if (n === 0) return 'zero';
    if (n < 20) return NUM_WORDS_ONES[n];
    if (n < 100) {
        const rem = n % 10;
        return NUM_WORDS_TENS[Math.floor(n / 10)] + (rem ? '-' + NUM_WORDS_ONES[rem] : '');
    }
    if (n < 1000) {
        const rem = n % 100;
        return NUM_WORDS_ONES[Math.floor(n / 100)] + ' hundred' + (rem ? ' ' + integerToEnglishWords(rem) : '');
    }
    if (n < 1000000) {
        const thousands = Math.floor(n / 1000);
        const rem = n % 1000;
        return (
            integerToEnglishWords(thousands) +
            ' thousand' +
            (rem ? ' ' + integerToEnglishWords(rem) : '')
        );
    }
    if (n < 1000000000) {
        const millions = Math.floor(n / 1000000);
        const rem = n % 1000000;
        return (
            integerToEnglishWords(millions) +
            ' million' +
            (rem ? ' ' + integerToEnglishWords(rem) : '')
        );
    }
    return String(n);
}

/** Converts an integer into spoken English ordinal words (e.g. 21 -> "twenty-first"). */
export function ordinalToEnglishWords(nInput: number): string {
    const num = Math.floor(Math.abs(nInput));
    const card = integerToEnglishWords(num);
    if (card.endsWith('one')) return card.slice(0, -3) + 'first';
    if (card.endsWith('two')) return card.slice(0, -3) + 'second';
    if (card.endsWith('three')) return card.slice(0, -5) + 'third';
    if (card.endsWith('five')) return card.slice(0, -4) + 'fifth';
    if (card.endsWith('eight')) return card + 'h';
    if (card.endsWith('nine')) return card.slice(0, -4) + 'ninth';
    if (card.endsWith('twelve')) return card.slice(0, -6) + 'twelfth';
    if (card.endsWith('y')) return card.slice(0, -1) + 'ieth';
    return card + 'th';
}

/** Normalizes currency, years, clock times, ordinals, integers, stutters, and dashes for TTS speech. */
export function normalizeAudioDramaText(rawText: unknown): string {
    if (!rawText) return '';
    let t = String(rawText);

    t = t
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2014\u2013]/g, ' -- ');

    t = t.replace(/\b([A-Za-z])-([A-Za-z]+)\b/g, (_match, letter: string, rest: string) => {
        const firstRest = rest.charAt(0);
        if (firstRest.toLowerCase() === letter.toLowerCase()) {
            const cap = rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase();
            return `${cap}... ${rest.toLowerCase()}`;
        }
        return `${letter.toUpperCase()}... ${rest}`;
    });

    t = t.replace(/\$(\d+(?:\.\d{2})?)/g, (_m, amt: string) => {
        if (amt.includes('.')) {
            const [dollars, cents] = amt.split('.');
            const dWords = integerToEnglishWords(parseInt(dollars, 10));
            const cWords = integerToEnglishWords(parseInt(cents, 10));
            return `${dWords} dollars and ${cWords} cents`;
        }
        const dWords = integerToEnglishWords(parseInt(amt, 10));
        return `${dWords} dollars`;
    });

    t = t.replace(/\b(19|20)(\d{2})s?\b/g, (m, c: string, y: string) => {
        const cWord = integerToEnglishWords(parseInt(c, 10));
        const yVal = parseInt(y, 10);
        let yWord: string;
        if (yVal === 0) yWord = 'hundred';
        else if (yVal < 10) yWord = 'oh-' + integerToEnglishWords(yVal);
        else yWord = integerToEnglishWords(yVal);
        return `${cWord} ${yWord}` + (m.endsWith('s') ? 's' : '');
    });

    t = t.replace(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi, (_m, h: string, min: string, meridiem: string | undefined) => {
        const hWords = integerToEnglishWords(parseInt(h, 10));
        let minWords: string;
        const minVal = parseInt(min, 10);
        if (minVal === 0) minWords = "o'clock";
        else if (minVal < 10) minWords = 'oh-' + integerToEnglishWords(minVal);
        else minWords = integerToEnglishWords(minVal);
        return `${hWords} ${minWords}` + (meridiem ? ' ' + meridiem.toUpperCase() : '');
    });

    t = t.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (_m, n: string) => {
        return ordinalToEnglishWords(parseInt(n, 10));
    });

    t = t.replace(/\b\d+\b/g, (m) => {
        const val = parseInt(m, 10);
        if (val < 1000000000) {
            return integerToEnglishWords(val);
        }
        return m;
    });

    t = t.replace(/\s+([,!?;:])|(\s+\.(?!\.))/g, '$1$2');
    t = t.replace(/\s{2,}/g, ' ').trim();

    return t;
}

/**
 * Normalizes spoken text for Fish Audio Drama-3 while preserving `[director/sound cues]`
 * and the 7 paired `<tag>...</tag>` prosody wrappers verbatim.
 */
export function normalizeAudioDramaTextPreservingTags(rawText: unknown): string {
    if (!rawText) return '';
    const parts = String(rawText).split(
        /(\[[^\]]+\]|<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>|<\|[^|>]+\|>)/gi
    );
    let out = '';
    for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (!seg) continue;
        if (i % 2 === 1) {
            out += seg;
        } else {
            const leadWs = /^\s/.test(seg) ? ' ' : '';
            const trailWs = /\s$/.test(seg) ? ' ' : '';
            const trimmed = seg.trim();
            if (!trimmed) {
                out += ' ';
            } else {
                const normalizedCore = normalizeAudioDramaText(trimmed);
                out += leadWs + normalizedCore + trailWs;
            }
        }
    }
    return out.replace(/\s{2,}/g, ' ').trim();
}
