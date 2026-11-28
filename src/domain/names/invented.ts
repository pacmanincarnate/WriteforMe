import type { NameBanks } from './types';

/**
 * Names that read as invented by a language model (Elara, Voss, Vaeryn Duskmere).
 * A word is flagged when it is on the shipped list, or when it has the shape models reach for
 * and appears in none of the real name lists.
 */

const WORD = /[A-Z][A-Za-z'’-]+/g;

// Fantasy beginnings (Kael-, Vael-, Lyr-, Zeph-) and endings (-yra, -ithra) for given names.
const COINED_GIVEN =
    /^(kael|vael|vaer|cael|lyr(a|ae|e)|zeph|nyx|vex|seraph|sylv[aei]r|elys|elar|eryn|vey|xyl|thal[aeiou]r|aeri|aeryn|ael)|(yra|yrin|ithra|ara?th|ys{2})$/i;
// Evocative compounds for family names (Ravencrest, Duskwhisper, Stormvale).
export const COINED_FAMILY =
    /^(raven|shadow|storm|night|moon|star|dusk|dawn|silver|frost|ember|thorn|wolf|black|iron|ash|winter|bright|grim|hollow|mist|sun)(wood|crest|vale|fall|mere|bane|wind|whisper|shade|heart|blade|song|fire|forge|thorne?|weaver|hollow|ridge|veil|born|walker|helm|shadow|mantle|ward|haven)$/i;
// Ordinary words that can start a sentence and happen to fit a shape above.
const NOT_NAMES = /(ed|ing|ly|less|ness|ful)$/i;

interface InventedIndex {
    invented: Set<string>;
    family: Set<string>;
    known: Set<string>;
}

const indexCache = new WeakMap<NameBanks, InventedIndex>();

function indexOf(banks: NameBanks): InventedIndex {
    const cached = indexCache.get(banks);
    if (cached) return cached;
    const known = new Set<string>();
    const addWords = (names: readonly string[] | undefined) => {
        (names || []).forEach((name) => name.split(/\s+/).forEach((word) => word && known.add(word.toLowerCase())));
    };
    Object.values(banks.given.cultures).forEach((culture) => {
        culture.cohorts.forEach((cohort) => {
            addWords(cohort.feminine);
            addWords(cohort.masculine);
        });
        addWords(culture.surnames);
    });
    Object.values(banks.names.banks).forEach((bank) => {
        Object.values(bank).forEach((group) => {
            addWords(group.feminine);
            addWords(group.masculine);
            addWords(group.neutral);
            addWords(group.family);
        });
    });
    const family = new Set(banks.given.invented.family.map((w) => w.toLowerCase()));
    const invented = new Set([...banks.given.invented.given.map((w) => w.toLowerCase()), ...family]);
    const built = { invented, family, known };
    indexCache.set(banks, built);
    return built;
}

/** Whether a capitalised word reads as invented. */
export function isCoinedWord(banks: NameBanks, word: string): boolean {
    const index = indexOf(banks);
    const folded = word.toLowerCase();
    if (index.invented.has(folded)) return true;
    if (index.known.has(folded) || NOT_NAMES.test(word)) return false;
    return COINED_GIVEN.test(word) || COINED_FAMILY.test(word);
}

/** The words of a name that read as invented, in order. */
export function inventedWordsOf(banks: NameBanks, name: string): string[] {
    return (String(name || '').match(WORD) || []).filter((word) => isCoinedWord(banks, word));
}

export function isInventedName(banks: NameBanks, name: string): boolean {
    return inventedWordsOf(banks, name).length > 0;
}

/** Whether a made-up word reads as a family name: on the invented family list, or shaped like one. */
export function isCoinedFamilyWord(banks: NameBanks, word: string): boolean {
    return indexOf(banks).family.has(word.toLowerCase()) || COINED_FAMILY.test(word);
}

/** Whether every word of a name is in the shipped real-name lists. */
export function isKnownName(banks: NameBanks, name: string): boolean {
    const words = String(name || '').match(WORD) || [];
    const index = indexOf(banks);
    return words.length > 0 && words.every((word) => index.known.has(word.toLowerCase()));
}
