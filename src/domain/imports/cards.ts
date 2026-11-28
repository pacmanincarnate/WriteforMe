/**
 * @module domain/imports/cards
 * Reads character cards written by other apps (Character Card V1, V2 and V3 as JSON or inside a
 * PNG, plus Pygmalion and Backyard / Faraday JSON) and turns one into a cast member. A card is
 * written for chat, so its scenario, greetings and prompt instructions have no place in a novel:
 * they are left out, and the caller is told which were.
 */

import { readLorebook, type ImportedLorebook } from './lorebooks';

export interface CardFields {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
}

export interface ImportedCard {
    format: string;
    character: CardFields;
    /** The lorebook carried inside the card, when it has one with usable entries. */
    book: ImportedLorebook | null;
    /** Plain names of the parts of the card that are not brought over. */
    unused: string[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: Json, key: string): string => (typeof value[key] === 'string' ? (value[key] as string).trim() : '');

export const CARD_LIMITS = { name: 120, field: 40_000 } as const;

const UNUSED: ReadonlyArray<[string, string]> = [
    ['scenario', 'Scenario'],
    ['first_mes', 'First message'],
    ['alternate_greetings', 'Other greetings'],
    ['group_only_greetings', 'Group greetings'],
    ['system_prompt', 'System prompt'],
    ['post_history_instructions', 'Post-history instructions'],
    ['creator_notes', "Creator's notes"],
    ['extensions', 'App extensions']
];

function filled(value: unknown): boolean {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return false;
}

const unusedParts = (source: Json): string[] => UNUSED.filter(([key]) => filled(source[key])).map(([, label]) => label);

function fields(source: Json, names: Partial<Record<keyof CardFields, string[]>> = {}): CardFields {
    const pick = (key: keyof CardFields): string => {
        for (const candidate of names[key] || [key]) {
            const found = text(source, candidate);
            if (found) return found.slice(0, key === 'name' ? CARD_LIMITS.name : CARD_LIMITS.field);
        }
        return '';
    };
    return {
        name: pick('name'),
        description: pick('description'),
        personality: pick('personality'),
        scenario: pick('scenario'),
        first_mes: pick('first_mes'),
        mes_example: pick('mes_example')
    };
}

const LEGACY: ReadonlyArray<{
    format: string;
    matches: (value: Json) => boolean;
    names: Partial<Record<keyof CardFields, string[]>>;
}> = [
    {
        format: 'Pygmalion character',
        matches: (v) => 'char_name' in v && 'char_persona' in v,
        names: {
            name: ['char_name'],
            description: ['char_persona'],
            scenario: ['world_scenario'],
            first_mes: ['char_greeting'],
            mes_example: ['example_dialogue']
        }
    },
    {
        format: 'Backyard / Faraday character',
        matches: (v) => 'aiName' in v && 'aiPersona' in v,
        names: {
            name: ['aiDisplayName', 'aiName'],
            description: ['aiPersona'],
            first_mes: ['firstMessage'],
            mes_example: ['customDialogue']
        }
    }
];

/** Reads a parsed card file. Throws a plain-language Error when it is not a card. */
export function readCardJson(value: unknown): ImportedCard {
    if (!isObject(value)) throw new Error('This file is not a character card.');
    const spec = typeof value.spec === 'string' ? value.spec : '';
    let format = '';
    let source: Json | null = null;
    let character: CardFields | null = null;

    if ((spec === 'chara_card_v2' || spec === 'chara_card_v3') && isObject(value.data)) {
        format = spec === 'chara_card_v3' ? 'Character Card V3' : 'Character Card V2';
        source = value.data;
        character = fields(source);
    } else {
        const legacy = LEGACY.find((candidate) => candidate.matches(value));
        if (legacy) {
            format = legacy.format;
            source = value;
            character = fields(value, legacy.names);
        } else if (typeof value.name === 'string' && ('description' in value || 'personality' in value || 'first_mes' in value)) {
            format = 'Character Card V1';
            source = value;
            character = fields(value);
        }
    }
    if (!source || !character) {
        throw new Error('This file is not a character card this app can read (Character Card V1, V2 or V3, Pygmalion, or Backyard).');
    }
    if (!character.name) throw new Error('This card has no character name.');
    if (!character.description && !character.personality) {
        throw new Error(`The card for ${character.name} has no description or personality to bring over.`);
    }

    let book: ImportedLorebook | null = null;
    if (isObject(source.character_book) && Array.isArray(source.character_book.entries)) {
        const read = readLorebook(source.character_book, `${character.name}'s lore`, {
            kind: 'portable',
            label: 'Character lorebook'
        });
        if (read.entries.length > 0) book = read;
    }
    return { format, character, book, unused: unusedParts({ ...source, ...character }) };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The text chunks of a PNG by keyword. Compressed chunks are not read. */
export function pngTextChunks(bytes: Uint8Array): Record<string, string> {
    if (bytes.length < 8 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
        throw new Error('This is not a PNG picture.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const latin1 = (from: number, to: number): string => {
        let out = '';
        for (let i = from; i < to; i += 1) out += String.fromCharCode(bytes[i]);
        return out;
    };
    const found: Record<string, string> = {};
    let at = 8;
    while (at + 12 <= bytes.length) {
        const length = view.getUint32(at);
        const type = latin1(at + 4, at + 8);
        const start = at + 8;
        const end = start + length;
        if (end + 4 > bytes.length) break;
        if (type === 'tEXt') {
            let split = start;
            while (split < end && bytes[split] !== 0) split += 1;
            if (split < end) found[latin1(start, split)] = latin1(split + 1, end);
        }
        if (type === 'IEND') break;
        at = end + 4;
    }
    return found;
}

function base64Text(encoded: string): string {
    const binary = atob(encoded.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

/** The card JSON text a PNG carries (V3 before V2), or null when it carries none. */
export function pngCardText(bytes: Uint8Array): string | null {
    const chunks = pngTextChunks(bytes);
    const encoded = chunks.ccv3 || chunks.chara;
    if (!encoded) return null;
    try {
        return base64Text(encoded);
    } catch {
        throw new Error('The character card inside this picture is damaged.');
    }
}

/** Chat placeholders written out: the character by name, the chat partner as "the other person". */
export function fillCardMacros(value: string, name: string): string {
    return value
        .replace(/\{\{\s*char\s*\}\}|<BOT>|<CHAR>/gi, name)
        .replace(/\{\{\s*user\s*\}\}|<USER>/gi, 'the other person')
        .replace(/\{\{[^{}]*\}\}/g, '')
        .trim();
}

function firstSentence(value: string, limit: number): string {
    const flat = value.replace(/\s+/g, ' ').trim();
    const match = flat.match(/^.*?[.!?](?=\s|$)/);
    const sentence = (match ? match[0] : flat).trim();
    return sentence.length > limit ? `${sentence.slice(0, limit - 1).trimEnd()}…` : sentence;
}

/** The first thing the character says in the card's example dialogue, without the speaker tag. */
function firstExampleLine(example: string, name: string): string {
    for (const raw of example.split('\n')) {
        const line = raw.trim();
        const lowered = line.toLowerCase();
        if (!lowered.startsWith(`${name.toLowerCase()}:`)) continue;
        const said = line.slice(name.length + 1).trim();
        if (said) return said.slice(0, 240);
    }
    return '';
}

export type ImportedCastMember = {
    id: string;
    name: string;
    role: string;
    corner_role: string;
    archetype: string;
    logline: string;
    core_flaw: string;
    core_desire: string;
    why_it_makes_sense: string;
    what_it_costs_them: string;
    way_of_living: string;
    why_it_is_appealing: string;
    shared_outlook: string;
    the_hidden_trap: string;
    how_they_ended_up: string;
    the_wake_up_call: string;
    voice_sample?: string;
    details: { history: string; goals: string; story_events: string; deep_profile: string };
    voice: { tone: string; rhythm: string; tics: string[] };
};

/**
 * A cast member from a card: a supporting character whose description and personality become the
 * history and the deep profile. The story-shaping fields (flaw, desire, role) are left as the
 * same starting text a hand-added character gets, for the author to fill in.
 */
export function cardToCastMember(card: ImportedCard, id: string): ImportedCastMember {
    const name = card.character.name;
    const fill = (value: string): string => fillCardMacros(value, name);
    const description = fill(card.character.description);
    const personality = fill(card.character.personality);
    const example = fill(card.character.mes_example.replace(/<START>/gi, '').trim());

    const profile = [
        description && `DESCRIPTION\n${description}`,
        personality && `PERSONALITY\n${personality}`,
        example && `HOW THEY TALK (example lines from the card)\n${example}`
    ]
        .filter(Boolean)
        .join('\n\n');
    const sample = firstExampleLine(example, name);

    return {
        id,
        name,
        role: 'Supporting',
        corner_role: 'SUPPORTING',
        archetype: 'Pragmatist',
        logline: firstSentence(description || personality, 200),
        core_flaw: 'Defending their current comfort zone or safety habit.',
        core_desire: 'Pursuing their personal goal within the story world.',
        why_it_makes_sense: '',
        what_it_costs_them: '',
        way_of_living: '',
        why_it_is_appealing: '',
        shared_outlook: '',
        the_hidden_trap: '',
        how_they_ended_up: '',
        the_wake_up_call: '',
        ...(sample ? { voice_sample: sample } : {}),
        details: {
            history: description || personality,
            goals: 'Pursuing their personal goal within the story world.',
            story_events: `Imported from a ${card.format}.`,
            deep_profile: profile
        },
        voice: { tone: 'Measured', rhythm: 'Direct', tics: [] }
    };
}
