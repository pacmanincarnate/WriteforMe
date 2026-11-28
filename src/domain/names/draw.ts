import type { DrawnName, NameBanks, NameGroup, NamePronouns } from './types';
import type { NamePlace } from './place';
import { pick, rankWeights, unit } from './seeded';

/** How far either side of the target birth year a name may come from, so peers don't share one year's list. */
const SPREAD = 3;

// Polish and Russian family names take a feminine ending for women (Kowalski to Kowalska).
const FEMININE_ENDINGS: Record<string, Array<[string, string]>> = {
    poland: [['dzki', 'dzka'], ['cki', 'cka'], ['ski', 'ska']],
    russia: [['skiy', 'skaya'], ['sky', 'skaya'], ['ov', 'ova'], ['ev', 'eva'], ['in', 'ina']]
};

function gendered(culture: string | null, family: string, pronouns: NamePronouns): string {
    if (pronouns !== 'she' || !culture) return family;
    for (const [ending, feminine] of FEMININE_ENDINGS[culture] || []) {
        if (family.endsWith(ending)) return family.slice(0, -ending.length) + feminine;
    }
    return family;
}

function feminineFamily(family: string, group: NameGroup): string {
    for (const [ending, feminine] of Object.entries(group.feminine_family || {})) {
        if (family.endsWith(ending)) return family.slice(0, -ending.length) + feminine;
    }
    return family;
}

/** The country a culture's names are local in, or '' for a people with no country of their own here. */
function countryOf(banks: NameBanks, culture: string | null): string {
    if (!culture) return '';
    const found = Object.entries(banks.given.countries).find(([, each]) => each === culture);
    return found ? found[0] : '';
}

interface ResolvedGroups {
    groups: Record<string, NameGroup>;
    mix: Record<string, number>;
    local: string;
    presentYear: number | null;
}

/**
 * The name groups a place draws from and the weight of each. A culture that is not the era's
 * usual one narrows the mix: in a country, to the groups that take that country's own names;
 * for a people with no country here, to the groups tied to that culture.
 */
function resolveGroups(banks: NameBanks, place: NamePlace, culture: string | null): ResolvedGroups {
    const era = banks.names.eras[place.era] || banks.names.eras.modern;
    const bankKey = place.bank || era.bank;
    const groups = banks.names.banks[bankKey] || banks.names.banks[era.bank];
    let mix: Record<string, number> = {};
    if (culture && culture !== 'us') {
        const local: Record<string, number> = {};
        const tied: Record<string, number> = {};
        Object.entries(groups).forEach(([key, group]) => {
            const cultures = group.cultures || {};
            const keys = Object.keys(cultures);
            if (keys.length === 1 && keys[0] === 'local') local[key] = 1;
            if (cultures[culture]) tied[key] = cultures[culture];
        });
        if (countryOf(banks, culture) && Object.keys(local).length > 0) mix = local;
        else if (Object.keys(tied).length > 0) mix = tied;
    }
    if (Object.keys(mix).length === 0 && bankKey === era.bank) {
        Object.entries(era.mix || {}).forEach(([key, weight]) => {
            if (weight > 0 && groups[key]) mix[key] = weight;
        });
    }
    if (Object.keys(mix).length === 0) Object.keys(groups).forEach((key) => { mix[key] = 1; });
    const eraYear = banks.given.era_years[place.era];
    return {
        groups,
        mix,
        local: banks.given.countries[countryOf(banks, culture)] || 'us',
        presentYear: place.year || (eraYear !== undefined ? eraYear : null)
    };
}

function cohortFor(banks: NameBanks, culture: string, year: number) {
    const cohorts = banks.given.cultures[culture].cohorts;
    let best = cohorts[0];
    let bestGap = Infinity;
    for (const item of cohorts) {
        const gap = item.start <= year && year <= item.end ? 0 : Math.min(Math.abs(year - item.start), Math.abs(year - item.end));
        if (gap < bestGap || (gap === bestGap && item.start > best.start)) {
            best = item;
            bestGap = gap;
        }
    }
    return best;
}

export interface DrawNameOptions {
    seed: string;
    pronouns?: NamePronouns | null;
    age?: number | null;
    /** Keeps a relative's family name. */
    family?: string | null;
    /** Draw from the people the text names (`place.kin`) and not from the place. */
    kin?: boolean;
    /** Draw from one fantasy people of the `peoples` bank (elf, dwarf). */
    kind?: string | null;
}

/** One name for a place: a given name people of that age and background carry, and a family name to match. */
export function drawName(banks: NameBanks, place: NamePlace, options: DrawNameOptions): DrawnName {
    const { seed } = options;
    const modern = place.era === 'modern' || place.era === 'future' || place.era === 'other';
    const pronouns: NamePronouns =
        options.pronouns || pick(seed, 'pronouns', ['she', 'he', 'they'] as const, modern ? [0.49, 0.49, 0.02] : [0.5, 0.5, 0]) || 'she';

    const kindGroup = options.kind ? banks.names.banks.peoples?.[options.kind] : undefined;
    if (kindGroup) {
        const pool = pronouns === 'she' ? kindGroup.feminine : pronouns === 'he' ? kindGroup.masculine : kindGroup.neutral;
        const given = pick(seed, 'given', pool.length > 0 ? pool : [...kindGroup.feminine, ...kindGroup.masculine]) || '';
        const family = options.family || pick(seed, 'family', kindGroup.family) || '';
        return { given, family, full: `${given} ${family}`.trim(), pronouns, group: options.kind as string, culture: null };
    }

    const culturePick = options.kin && place.kin ? place.kin : place.culture;
    const { groups, mix, local, presentYear } = resolveGroups(banks, place, culturePick);
    const groupKey = pick(seed, 'name-group', Object.keys(mix), Object.values(mix)) || Object.keys(groups)[0];
    const group = groups[groupKey];

    const links: Record<string, number> = {};
    if (presentYear !== null) {
        Object.entries(group.cultures || {}).forEach(([key, weight]) => {
            const resolved = key === 'local' ? local : key;
            if (banks.given.cultures[resolved] && weight > 0) links[resolved] = (links[resolved] || 0) + weight;
        });
    }
    const culture = Object.keys(links).length > 0 ? pick(seed, 'culture', Object.keys(links), Object.values(links)) || null : null;

    let given: string;
    if (culture && presentYear !== null) {
        const age = options.age ?? 22 + Math.round(unit(seed, 'name-age') * 42);
        const born = presentYear - age + Math.round((unit(seed, 'birth-year') * 2 - 1) * SPREAD);
        const cohort = cohortFor(banks, culture, born);
        let pool: string[];
        if (pronouns === 'she') pool = cohort.feminine;
        else if (pronouns === 'he') pool = cohort.masculine;
        else {
            const masculine = new Set(cohort.masculine);
            const shared = cohort.feminine.filter((item) => masculine.has(item));
            pool = shared.length > 0 ? shared : pick(seed, 'neutral-list', [cohort.feminine, cohort.masculine]) || cohort.feminine;
        }
        given = pick(seed, 'given', pool, rankWeights(pool)) || '';
    } else {
        const own = pronouns === 'she' ? group.feminine : pronouns === 'he' ? group.masculine : group.neutral;
        const pools = [own];
        if (group.neutral.length > 0 && unit(seed, 'neutral-name') < 0.12) pools.unshift(group.neutral);
        pools.push([...group.feminine, ...group.masculine, ...group.neutral]);
        given = pick(seed, 'given', pools.find((pool) => pool.length > 0) || []) || '';
    }

    let family = options.family || '';
    if (!family) {
        const surnames = culture && !group.own_family ? banks.given.cultures[culture].surnames : [];
        if (surnames.length > 0) {
            family = gendered(culture, pick(seed, 'family', surnames, rankWeights(surnames)) || '', pronouns);
        } else {
            // Most family names come from the same heritage group; some from anywhere in the place.
            const other = pick(seed, 'family-group', Object.keys(mix), Object.values(mix)) || groupKey;
            const source = unit(seed, 'mixed') >= 0.2 ? group.family : (groups[other] || group).family;
            family = pick(seed, 'family', source.length > 0 ? source : group.family) || '';
        }
    }
    if (pronouns === 'she') family = feminineFamily(family, group);
    return { given, family, full: `${given} ${family}`.trim(), pronouns, group: groupKey, culture };
}
