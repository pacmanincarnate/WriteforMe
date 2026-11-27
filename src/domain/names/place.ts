import type { NameBanks } from './types';

/**
 * Reads when and where a story is set from free text (a concept, a setting line), so names
 * can be drawn for that time and place. With nothing to go on it is the modern United States.
 */

const FUTURE = 'future|futuristic|sci-?fi|space ?station|starships?|spaceships?|colony ship|cyberpunk|2[1-9]\\d\\d|[3-9]\\d{3}';

// Eras by the words a setting uses for them; the first match wins.
const ERAS: Array<[string, string]> = [
    ['steampunk', 'steampunk'],
    ['jazz-age', 'jazz age|roaring (?:19)?20s|prohibition|19(?:2\\d|20s)'],
    ['frontier', 'frontier|wild west|old west|cowboys?|gold rush|homestead'],
    ['victorian', 'victorian|edwardian|regency|gaslit|18[4-9]\\d|19(?:0\\d|1[0-4])|19th century'],
    ['medieval', 'medieval|middle ages|feudal|knights?|castles?|crusades?|1[0-4]\\d\\d'],
    ['fantasy', 'fantasy|elves|elven|dwar(?:f|ves)|wizards?|sorcer\\w+|dragons?|enchanted|fairy ?tale|kingdom'],
    ['future', FUTURE]
];

// Banks kept for one time and place.
const BANKS: Array<[string, string]> = [
    ['edo-japan', 'edo|samurai|shogun\\w*|tokugawa|feudal japan'],
    ['qing-china', 'qing|imperial china|manchu'],
    ['ottoman', 'ottoman|constantinople|sultan\\w*'],
    ['mughal-india', 'mughal'],
    ['ancient-rome', 'ancient rome|roman empire|roman republic|legionar\\w*|caesar|pompeii']
];

const YEAR = /\b(1[6-9]\d\d|2\d\d\d)s?\b/;

// Peoples by the words for them, and the culture whose names are theirs.
const PEOPLES: Record<string, string[]> = {
    ireland: ['irish'],
    scotland: ['scottish', 'scots'],
    'england-wales': ['british', 'welsh', 'cornish'],
    italy: ['italian'],
    germany: ['german'],
    france: ['french', 'quebecois', 'québécois'],
    spain: ['spanish'],
    mexico: ['mexican', 'chicano', 'chicana'],
    'us-hispanic': ['latina', 'latino', 'latinx', 'latine', 'hispanic', 'puerto rican', 'cuban', 'dominican', 'colombian', 'salvadoran', 'guatemalan', 'peruvian', 'venezuelan'],
    poland: ['polish'],
    russia: ['russian', 'ukrainian'],
    china: ['chinese', 'cantonese', 'taiwanese'],
    japan: ['japanese'],
    korea: ['korean'],
    vietnam: ['vietnamese'],
    philippines: ['filipino', 'filipina'],
    india: ['indian', 'pakistani', 'bangladeshi', 'punjabi', 'tamil', 'gujarati', 'bengali'],
    nigeria: ['nigerian', 'yoruba', 'igbo'],
    ghana: ['ghanaian'],
    jamaica: ['jamaican', 'trinidadian', 'caribbean'],
    haiti: ['haitian'],
    'us-black': ['african american', 'african-american', 'black american', 'black british'],
    'jewish-diaspora': ['jewish'],
    israel: ['israeli'],
    arab: ['arab', 'lebanese', 'egyptian', 'syrian', 'palestinian', 'iraqi', 'jordanian', 'moroccan', 'saudi', 'emirati']
};

const escapeRx = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = (pattern: string) => new RegExp(`\\b(?:${pattern})\\b`, 'i');

const ERA_RX = ERAS.map(([era, pattern]) => [era, wordsOf(pattern)] as const);
const BANK_RX = BANKS.map(([bank, pattern]) => [bank, wordsOf(pattern)] as const);
const PEOPLE_RX = Object.entries(PEOPLES).map(
    ([culture, words]) => [culture, wordsOf(words.map(escapeRx).join('|'))] as const
);

export interface NamePlace {
    era: string;
    /** A bank of its own for a time and place the data keeps one for (Edo Japan, ancient Rome). */
    bank: string | null;
    /** The year ages count back from, when the text gives one and the era has birth-year lists. */
    year: number | null;
    /** The culture whose names are local, from a country the text names. */
    culture: string | null;
    /** The culture of a people the text names, when it is not the setting's own. */
    kin: string | null;
    /** Fantasy peoples the text names (elf, dwarf), as keys of the `peoples` bank. */
    kinds: string[];
}

/** (era, bank) for a setting. "United Kingdom" is a country, not a storybook kingdom. */
export function eraOf(text: string): { era: string; bank: string | null } {
    const cleaned = String(text || '').replace(/united kingdom/gi, ' ');
    for (const [bank, rx] of BANK_RX) {
        if (rx.test(cleaned)) return { era: 'medieval', bank };
    }
    const found = ERA_RX.find(([, rx]) => rx.test(cleaned));
    return { era: found ? found[0] : 'modern', bank: null };
}

const countryRxCache = new WeakMap<NameBanks, RegExp>();

function countriesRx(banks: NameBanks): RegExp {
    let rx = countryRxCache.get(banks);
    if (!rx) {
        // Longest first, so "South Korea" wins over "Korea". Two-letter codes ("us", "uk") must be upper case.
        const names = Object.keys(banks.given.countries)
            .filter((name) => name.length > 3)
            .sort((a, b) => b.length - a.length);
        rx = wordsOf(names.map(escapeRx).join('|'));
        countryRxCache.set(banks, rx);
    }
    return rx;
}

/** The culture whose names are theirs, by the country or the people a text names. */
export function cultureOf(banks: NameBanks, text: string): string | null {
    const source = String(text || '');
    const country = source.match(countriesRx(banks));
    if (country) return banks.given.countries[country[0].toLowerCase()] || 'us';
    if (/\b(?:USA|U\.S\.A?\.?|US)\b/.test(source)) return 'us';
    if (/\b(?:UK|U\.K\.)\b/.test(source)) return banks.given.countries.uk || 'england-wales';
    const people = PEOPLE_RX.find(([, rx]) => rx.test(source));
    return people ? people[0] : null;
}

/** Fantasy peoples a text names, in the order the bank lists them ("elves" finds `elf`). */
export function kindsOf(banks: NameBanks, text: string): string[] {
    const peoples = banks.names.banks.peoples;
    if (!peoples) return [];
    const source = String(text || '').toLowerCase();
    const found: string[] = [];
    Object.keys(peoples).forEach((key) => {
        const word = key.replace(/-/g, '[- ]?');
        const stem = word.replace(/f$/, '');
        const pattern = word.endsWith('f') ? `${word}|${stem}ves|${stem}ven|${stem}vish` : `${word}s?`;
        if (new RegExp(`\\b(?:${pattern})\\b`).test(source)) found.push(key);
    });
    return found;
}

export function readNamePlace(banks: NameBanks, setting: string, words = ''): NamePlace {
    const settingText = String(setting || '');
    const wordText = String(words || '');
    const { era: readEra, bank } = eraOf(settingText || wordText);
    let era = readEra;
    const yearMatch = settingText.match(YEAR);
    const year = yearMatch && banks.given.era_years[era] !== undefined ? Number(yearMatch[1]) : null;
    if (year && era === 'modern' && year > banks.given.present_year) era = 'future';
    const country = settingText.match(countriesRx(banks));
    const culture = country ? banks.given.countries[country[0].toLowerCase()] || 'us' : null;
    const people = cultureOf(banks, wordText || settingText);
    const kin = people && people !== (culture || 'us') ? people : null;
    const kinds = era === 'fantasy' || era === 'medieval' ? kindsOf(banks, `${settingText} ${wordText}`) : [];
    return { era, bank, year, culture, kin, kinds };
}
