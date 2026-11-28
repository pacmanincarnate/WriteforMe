import type { DrawnName, NameBanks, NamePronouns } from './types';
import { drawName } from './draw';
import { isCoinedFamilyWord, isInventedName } from './invented';
import { readNamePlace, type NamePlace } from './place';

const TRIES = 12;

export interface NameRollOptions {
    /** The same seed draws the same names. */
    seed: string;
    /** Where and when the story is set, as free text. */
    setting?: string;
    /** Other words about the story or the character; a people named here supplies half the names. */
    words?: string;
    /** Returns true for a name that must not be offered (the slop audit flags it). */
    reject?: (fullName: string) => boolean;
    /** Names already in use; no drawn name repeats one of their words. */
    avoid?: readonly string[];
}

export interface NameRollDraw {
    pronouns?: NamePronouns | null;
    age?: number | null;
    family?: string | null;
    kin?: boolean;
    kind?: string | null;
}

export interface NameCastOffer {
    feminine: Array<{ name: string; age: number }>;
    masculine: Array<{ name: string; age: number }>;
    family: string[];
    /** Names for each fantasy people the text mentions. */
    peoples: Array<{ kind: string; names: string[] }>;
}

/** Names for one story, drawn from the banks for its time and place. */
export class NameRoll {
    readonly place: NamePlace;
    private readonly taken = new Set<string>();

    constructor(
        private readonly banks: NameBanks,
        private readonly options: NameRollOptions
    ) {
        this.place = readNamePlace(banks, options.setting || '', options.words || options.setting || '');
        (options.avoid || []).forEach((name) => this.take(name));
    }

    private take(name: string): void {
        String(name || '')
            .toLowerCase()
            .split(/\s+/)
            .forEach((word) => word.length > 1 && this.taken.add(word));
    }

    private usable(found: DrawnName): boolean {
        if (!found.given) return false;
        if ([found.given, found.family].some((word) => word && this.taken.has(word.toLowerCase()))) return false;
        // Names of a fantasy people are in the banks, so they are never read as invented.
        if (isInventedName(this.banks, found.full)) return false;
        return !(this.options.reject && this.options.reject(found.full));
    }

    /** One name the audit never flags and nobody in the story carries, redrawn until it is one. */
    draw(label: string, how: NameRollDraw = {}): DrawnName {
        let found = drawName(this.banks, this.place, { seed: `${this.options.seed}:${label}:0`, ...how });
        for (let attempt = 1; attempt < TRIES && !this.usable(found); attempt++) {
            found = drawName(this.banks, this.place, { seed: `${this.options.seed}:${label}:${attempt}`, ...how });
        }
        this.take(found.full);
        return found;
    }

    /** A spread of names to cast a story from: women and men across adult ages, and spare family names. */
    castOffer(perGender = 8): NameCastOffer {
        const ages = [34, 27, 45, 61, 23, 52, 38, 70, 30, 19, 48, 57];
        const hasKin = Boolean(this.place.kin);
        const listFor = (pronouns: NamePronouns) =>
            ages.slice(0, perGender).map((age, index) => {
                const found = this.draw(`cast-${pronouns}-${index}`, { pronouns, age, kin: hasKin && index % 2 === 0 });
                return { name: found.full, age };
            });
        const feminine = listFor('she');
        const masculine = listFor('he');
        const family = Array.from({ length: 5 }, (_, index) =>
            this.draw(`cast-family-${index}`, { age: 40, kin: hasKin && index % 2 === 0 }).family
        ).filter(Boolean);
        const peoples = this.place.kinds.slice(0, 4).map((kind) => ({
            kind,
            names: (['she', 'he', 'she', 'he'] as const).map((pronouns, index) => this.draw(`kind-${kind}-${index}`, { pronouns, kind }).full)
        }));
        return { feminine, masculine, family: Array.from(new Set(family)), peoples };
    }

    /**
     * A drawn name to put in place of a flagged one, the same shape as the old name:
     * a full name for a full name, a family name for a surname, else a given name.
     */
    replacementFor(oldName: string, how: { surname?: boolean; pronouns?: NamePronouns | null } = {}): string {
        const words = String(oldName || '').trim().split(/\s+/).filter(Boolean);
        const found = this.draw(`swap-${oldName.toLowerCase()}`, { pronouns: how.pronouns || null });
        if (words.length > 1) return found.full;
        const asFamily = how.surname || (words[0] ? isCoinedFamilyWord(this.banks, words[0]) : false);
        return asFamily ? found.family || found.given : found.given;
    }
}

/** The `<name_bank>` block for the prompt that casts a story. */
export function formatNameBankBlock(offer: NameCastOffer, place: NamePlace): string {
    const aged = place.era !== 'fantasy' && place.era !== 'medieval';
    const list = (items: Array<{ name: string; age: number }>) =>
        items.map((item) => (aged ? `${item.name} (about ${item.age})` : item.name)).join(', ');
    const lines = [
        'Real names drawn for this story\'s time and place. Unless the concept or the author\'s lore already names a character, name the cast from these lists. You may pair any given name with any family name, and relatives share a family name. Do not coin names.',
        `- Women: ${list(offer.feminine)}`,
        `- Men: ${list(offer.masculine)}`
    ];
    if (offer.family.length > 0) lines.push(`- More family names: ${offer.family.join(', ')}`);
    offer.peoples.forEach((people) => lines.push(`- ${people.kind} names: ${people.names.join(', ')}`));
    return `<name_bank>\n${lines.join('\n')}\n</name_bank>`;
}
