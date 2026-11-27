/** Shapes of the shipped name banks (`tables/given_names.json`, `tables/names.json`). */

export interface NameCohort {
    start: number;
    end: number;
    feminine: string[];
    masculine: string[];
}

export interface NameCulture {
    name: string;
    surnames: string[];
    cohorts: NameCohort[];
}

export interface GivenNamesData {
    present_year: number;
    /** The year ages count back from in each era that has birth-year lists. */
    era_years: Record<string, number>;
    cultures: Record<string, NameCulture>;
    /** Country name (lower case) to the culture whose names are local there. */
    countries: Record<string, string>;
    /** Names that read as invented by a language model. */
    invented: { given: string[]; family: string[] };
}

export interface NameGroup {
    feminine: string[];
    masculine: string[];
    neutral: string[];
    family: string[];
    /** Cultures the group draws birth-year given names from, with weights. `local` is the setting's own country. */
    cultures?: Record<string, number>;
    /** The group keeps its own family names even when a culture lists some. */
    own_family?: boolean;
    /** Family-name endings a woman's name takes (Roman -ius to -ia). */
    feminine_family?: Record<string, string>;
    /** A fantasy people (elf, dwarf) the group names. */
    kind?: string;
}

export interface NameEra {
    bank: string;
    mix: Record<string, number>;
}

export interface NamesData {
    banks: Record<string, Record<string, NameGroup>>;
    eras: Record<string, NameEra>;
}

export interface NameBanks {
    given: GivenNamesData;
    names: NamesData;
}

export type NamePronouns = 'she' | 'he' | 'they';

export interface DrawnName {
    given: string;
    family: string;
    full: string;
    pronouns: NamePronouns;
    group: string;
    culture: string | null;
}
