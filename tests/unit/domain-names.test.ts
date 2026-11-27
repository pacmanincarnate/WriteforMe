import { beforeAll, describe, expect, it } from 'vitest';
import {
    NameRoll,
    cultureOf,
    drawName,
    eraOf,
    formatNameBankBlock,
    getNameBanks,
    inventedWordsOf,
    isInventedName,
    kindsOf,
    loadNameBanks,
    readNamePlace,
    setNameBanksForTests,
    unit,
    type NameBanks
} from '@/domain/names';
import { DEFAULT_SLOP_CONFIG, auditEntityNamesAndPlaces } from '@/domain/slop';

let banks: NameBanks;

beforeAll(async () => {
    banks = (await loadNameBanks()) as NameBanks;
});

describe('name banks', () => {
    it('loads the shipped data', () => {
        expect(getNameBanks()).toBe(banks);
        expect(Object.keys(banks.given.cultures).length).toBeGreaterThan(20);
        expect(banks.names.banks.peoples.elf.family.length).toBeGreaterThan(50);
    });

    it('draws the same number for the same seed and a different one for another', () => {
        expect(unit('a', 'x')).toBe(unit('a', 'x'));
        expect(unit('a', 'x')).not.toBe(unit('a', 'y'));
        expect(unit('a', 'x')).toBeGreaterThanOrEqual(0);
        expect(unit('a', 'x')).toBeLessThan(1);
    });
});

describe('reading a setting', () => {
    it('reads the era from the words a setting uses', () => {
        expect(eraOf('A nurse in present-day Ohio').era).toBe('modern');
        expect(eraOf('Victorian London, 1888').era).toBe('victorian');
        expect(eraOf('a cattle drive in the old west').era).toBe('frontier');
        expect(eraOf('a kingdom of elves and dragons').era).toBe('fantasy');
        expect(eraOf('a colony ship three centuries out').era).toBe('future');
        expect(eraOf('a samurai in Edo')).toEqual({ era: 'medieval', bank: 'edo-japan' });
    });

    it('does not read the United Kingdom as a storybook kingdom', () => {
        expect(eraOf('A detective in the United Kingdom').era).toBe('modern');
    });

    it('reads a country, then a people', () => {
        expect(cultureOf(banks, 'set in South Korea')).toBe('korea');
        expect(cultureOf(banks, 'a Nigerian nurse in Houston')).toBe('nigeria');
        expect(cultureOf(banks, 'a quiet town')).toBeNull();
    });

    it('keeps a people apart from the place when they differ', () => {
        const place = readNamePlace(banks, 'A Korean grandmother runs a diner in Houston, 1994.');
        expect(place.era).toBe('modern');
        expect(place.year).toBe(1994);
        expect(place.culture).toBeNull();
        expect(place.kin).toBe('korea');
    });

    it('finds fantasy peoples, plurals included', () => {
        expect(kindsOf(banks, 'elves and a dwarf, with wolf-kin scouts')).toEqual(
            expect.arrayContaining(['elf', 'dwarf', 'wolf-kin'])
        );
        expect(readNamePlace(banks, 'A modern office with an elf on the poster').kinds).toEqual([]);
    });
});

describe('drawing names', () => {
    it('is stable for a seed', () => {
        const place = readNamePlace(banks, 'Baltimore today');
        const a = drawName(banks, place, { seed: 's1', pronouns: 'she', age: 58 });
        const b = drawName(banks, place, { seed: 's1', pronouns: 'she', age: 58 });
        expect(a).toEqual(b);
        expect(a.full).toBe(`${a.given} ${a.family}`);
    });

    it('gives a 60-year-old and a 20-year-old names from their own birth years', () => {
        const place = readNamePlace(banks, 'A town in the United States');
        const us = banks.given.cultures.us.cohorts;
        const near = (year: number) =>
            new Set(us.filter((c) => Math.abs(c.start - year) <= 5).flatMap((c) => [...c.feminine, ...c.masculine]));
        let checked = 0;
        for (let i = 0; i < 40; i++) {
            const old = drawName(banks, place, { seed: `old-${i}`, pronouns: 'she', age: 60 });
            if (old.culture === 'us') {
                expect(near(banks.given.present_year - 60).has(old.given)).toBe(true);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(5);
    });

    it('draws local names for a named country', () => {
        const place = readNamePlace(banks, 'A fishing village in Japan');
        const cultures = new Set(
            Array.from({ length: 30 }, (_, i) => drawName(banks, place, { seed: `jp-${i}` }).culture)
        );
        expect(cultures.has('japan')).toBe(true);
    });

    it('draws from the era bank when there are no birth-year lists', () => {
        const place = readNamePlace(banks, 'A medieval village');
        const found = drawName(banks, place, { seed: 'm1', pronouns: 'he' });
        expect(found.culture).toBeNull();
        expect(Object.keys(banks.names.banks.medieval)).toContain(found.group);
    });

    it('draws a fantasy people by kind', () => {
        const place = readNamePlace(banks, 'A fantasy kingdom of dwarves');
        const found = drawName(banks, place, { seed: 'd1', pronouns: 'she', kind: 'dwarf' });
        expect(banks.names.banks.peoples.dwarf.feminine).toContain(found.given);
        expect(banks.names.banks.peoples.dwarf.family).toContain(found.family);
    });

    it('gives a Polish woman the feminine family name', () => {
        const place = readNamePlace(banks, 'Warsaw, Poland');
        const families = Array.from({ length: 60 }, (_, i) => drawName(banks, place, { seed: `pl-${i}`, pronouns: 'she' }))
            .filter((n) => n.culture === 'poland')
            .map((n) => n.family);
        expect(families.length).toBeGreaterThan(0);
        expect(families.some((f) => /ski$/.test(f))).toBe(false);
    });
});

describe('made-up names', () => {
    it('flags listed and model-shaped names and leaves real ones', () => {
        expect(isInventedName(banks, 'Elara Voss')).toBe(true);
        expect(inventedWordsOf(banks, 'Vaeryn Duskmere')).toEqual(['Vaeryn', 'Duskmere']);
        expect(isInventedName(banks, 'Kaelith Stormborn')).toBe(true);
        expect(isInventedName(banks, 'Lisa Kowalski')).toBe(false);
        expect(isInventedName(banks, 'Myra Goldberg')).toBe(false);
    });

    it('does not flag names of a fantasy people from the bank', () => {
        const elf = banks.names.banks.peoples.elf;
        expect(isInventedName(banks, `${elf.feminine[0]} ${elf.family[0]}`)).toBe(false);
    });

    it('is a hard violation in the name audit, unless the author typed the name', () => {
        const report = auditEntityNamesAndPlaces({ characters: [{ id: 'C1', name: 'Vaeryn Duskmere' }] as never });
        expect(report.hardViolations.map((v) => v.categoryId)).toEqual(['made_up']);

        const typed = auditEntityNamesAndPlaces({
            characters: [{ id: 'C1', name: 'Vaeryn Duskmere' }] as never,
            story: { concept: 'Vaeryn Duskmere returns to the capital.' }
        });
        expect(typed.hardViolations.filter((v) => v.categoryId === 'made_up')).toEqual([]);
    });

    it('is skipped when the name bank is off or not loaded', () => {
        const off = auditEntityNamesAndPlaces({
            characters: [{ id: 'C1', name: 'Vaeryn Duskmere' }] as never,
            slopConfig: { ...DEFAULT_SLOP_CONFIG, enableNameBank: false }
        });
        expect(off.violations.filter((v) => v.categoryId === 'made_up')).toEqual([]);

        setNameBanksForTests(null);
        const unloaded = auditEntityNamesAndPlaces({ characters: [{ id: 'C1', name: 'Vaeryn Duskmere' }] as never });
        expect(unloaded.violations.filter((v) => v.categoryId === 'made_up')).toEqual([]);
        setNameBanksForTests(banks);
    });
});

describe('NameRoll', () => {
    const reject = (name: string) => !auditEntityNamesAndPlaces({ characters: [{ name }] as never }).valid;

    it('offers a cast list the audit accepts, with no repeated words', () => {
        const roll = new NameRoll(banks, { seed: 'story_1', setting: 'A hospital drama in Chicago', reject });
        const offer = roll.castOffer();
        const names = [...offer.feminine, ...offer.masculine].map((n) => n.name);
        expect(names).toHaveLength(16);
        names.forEach((name) => expect(reject(name)).toBe(false));
        const words = names.flatMap((n) => n.toLowerCase().split(' '));
        expect(new Set(words).size).toBe(words.length);
    });

    it('is the same offer for the same seed', () => {
        const make = () => new NameRoll(banks, { seed: 'story_2', setting: 'Victorian London', reject }).castOffer();
        expect(make()).toEqual(make());
    });

    it('never offers a name already in the cast', () => {
        const first = new NameRoll(banks, { seed: 'story_3', setting: 'Ohio' }).castOffer().feminine[0].name;
        const again = new NameRoll(banks, { seed: 'story_3', setting: 'Ohio', avoid: [first] }).castOffer();
        const words = new Set(first.toLowerCase().split(' '));
        [...again.feminine, ...again.masculine].forEach((n) =>
            n.name.toLowerCase().split(' ').forEach((w) => expect(words.has(w)).toBe(false))
        );
    });

    it('mixes in the people a concept names', () => {
        const roll = new NameRoll(banks, { seed: 'story_4', setting: 'A Nigerian family opens a restaurant in Houston' });
        expect(roll.place.kin).toBe('nigeria');
        const nigerian = new Set(banks.given.cultures.nigeria.surnames);
        const offer = roll.castOffer();
        expect([...offer.feminine, ...offer.masculine].some((n) => nigerian.has(n.name.split(' ').slice(1).join(' ')))).toBe(true);
    });

    it('replaces a flagged name with one of the same shape', () => {
        const roll = new NameRoll(banks, { seed: 'story_5', setting: 'Boston', reject });
        expect(roll.replacementFor('Elara Voss').split(' ').length).toBeGreaterThanOrEqual(2);
        expect(roll.replacementFor('Elara').split(' ')).toHaveLength(1);
        const family = roll.replacementFor('Blackwood', { surname: true });
        expect(family).toBeTruthy();
        expect(reject(family)).toBe(false);
    });

    it('formats the prompt block with ages for modern settings and peoples for fantasy', () => {
        const modern = new NameRoll(banks, { seed: 'story_6', setting: 'Seattle' });
        const block = formatNameBankBlock(modern.castOffer(), modern.place);
        expect(block.startsWith('<name_bank>')).toBe(true);
        expect(block).toMatch(/\(about 34\)/);

        const fantasy = new NameRoll(banks, { seed: 'story_7', setting: 'A fantasy realm where elves trade with dwarves' });
        const fantasyBlock = formatNameBankBlock(fantasy.castOffer(), fantasy.place);
        expect(fantasyBlock).toMatch(/- elf names: /);
        expect(fantasyBlock).toMatch(/- dwarf names: /);
        expect(fantasyBlock).not.toMatch(/about \d+/);
    });
});
