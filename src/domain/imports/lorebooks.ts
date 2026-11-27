/**
 * @module domain/imports/lorebooks
 * Reads lorebooks written by other apps (SillyTavern world info, NovelAI, Agnai, RisuAI, and the
 * book inside a character card) into plain lore entries. Only the text, a title and literal
 * keywords carry over. Search-pattern keywords are dropped, since lore here is found by meaning
 * and not by keyword. Timing, order, depth and scripts are not translated, and switched-off
 * entries are left out.
 */

export type LorebookKind = 'novelai' | 'agnai' | 'risu' | 'sillytavern' | 'portable';

export interface ImportedLoreEntry {
    title: string;
    text: string;
    keywords: string[];
}

export interface ImportedLorebook {
    name: string;
    format: string;
    entries: ImportedLoreEntry[];
    /** Entries left out because they were switched off, empty, or folders. */
    skipped: number;
}

export const LOREBOOK_LIMITS = { entries: 5000, text: 20_000, keywords: 64 } as const;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const yes = (value: unknown): boolean => value === true || value === 'true';

const KINDS: ReadonlyArray<{ kind: LorebookKind; label: string; matches: (value: Json) => boolean }> = [
    { kind: 'novelai', label: 'NovelAI lorebook', matches: (v) => 'lorebookVersion' in v },
    { kind: 'agnai', label: 'Agnai memory book', matches: (v) => v.kind === 'memory' },
    { kind: 'risu', label: 'RisuAI lorebook', matches: (v) => v.type === 'risu' },
    { kind: 'sillytavern', label: 'SillyTavern world info', matches: (v) => isObject(v.entries) }
];

const TEXT_FIELD: Partial<Record<LorebookKind, string>> = { novelai: 'text', agnai: 'entry' };
const KEY_FIELD: Partial<Record<LorebookKind, string>> = { sillytavern: 'key', agnai: 'keywords', risu: 'key' };
const TITLE_FIELDS = ['name', 'comment', 'displayName', 'title'] as const;
const PATTERN = /^\/.*\/[a-z]*$/;

/** A character card's book saved on its own: a list of entries with keys and content. */
function isPortable(value: Json): boolean {
    const entries = value.entries;
    return (
        Array.isArray(entries) &&
        entries.length > 0 &&
        entries.every((entry) => isObject(entry) && 'content' in entry && 'keys' in entry)
    );
}

/** Which app's lorebook a parsed JSON file is, or null when it is not a lorebook. */
export function lorebookKind(value: unknown): { kind: LorebookKind; label: string } | null {
    if (!isObject(value)) return null;
    const found = KINDS.filter((candidate) => candidate.matches(value));
    if (found.length > 1) {
        throw new Error(
            `This file looks like more than one kind of lorebook (${found.map((f) => f.label).join(', ')}). Export it again from the app that made it.`
        );
    }
    if (found.length === 1) return { kind: found[0].kind, label: found[0].label };
    return isPortable(value) ? { kind: 'portable', label: 'Character lorebook' } : null;
}

function rows(value: Json, kind: LorebookKind): unknown[] {
    let entries: unknown = kind === 'risu' ? value.data : value.entries;
    if (kind === 'sillytavern' && isObject(entries)) entries = Object.values(entries);
    if (!Array.isArray(entries)) throw new Error('This lorebook has no list of entries.');
    if (entries.length > LOREBOOK_LIMITS.entries) {
        throw new Error(`A lorebook can have at most ${LOREBOOK_LIMITS.entries.toLocaleString()} entries.`);
    }
    return entries;
}

function keywords(entry: Json, kind: LorebookKind): string[] {
    let keys: unknown = entry[KEY_FIELD[kind] || 'keys'];
    if (typeof keys === 'string') keys = keys.split(',');
    if (!Array.isArray(keys)) return [];
    const words = keys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.trim().slice(0, 200))
        .filter(Boolean);
    const pattern =
        yes(entry.use_regex ?? entry.useRegex) ||
        words.some((word) => PATTERN.test(word)) ||
        (kind === 'novelai' && words.some((word) => word.includes('&')));
    return pattern ? [] : words.slice(0, LOREBOOK_LIMITS.keywords);
}

function switchedOn(entry: Json): boolean {
    if (yes(entry.disable)) return false;
    return entry.enabled !== false && entry.enabled !== 'false';
}

/** The entry's own name; else its first keywords; else the start of its text. */
function titleOf(entry: Json, number: number, words: string[], text: string): string {
    for (const field of TITLE_FIELDS) {
        const found = entry[field];
        if (typeof found === 'string' && found.trim()) return found.trim().slice(0, 160);
    }
    if (words.length > 0) {
        const named = words.slice(0, 2).join(', ');
        return (named.charAt(0).toUpperCase() + named.slice(1)).slice(0, 160);
    }
    const said = text.split(/\s+/).filter(Boolean);
    const start = said.slice(0, 6).join(' ') + (said.length > 6 ? '…' : '');
    return start.slice(0, 160) || `Entry ${number}`;
}

/** Reads a parsed lorebook file. Throws a plain-language Error when it is not one. */
export function readLorebook(value: unknown, fallbackName: string, known?: { kind: LorebookKind; label: string }): ImportedLorebook {
    const found = known || lorebookKind(value);
    if (!found || !isObject(value)) {
        throw new Error('This is not a lorebook this app can read (SillyTavern, NovelAI, Agnai or RisuAI).');
    }
    const { kind, label } = found;
    const entries: ImportedLoreEntry[] = [];
    let skipped = 0;
    rows(value, kind).forEach((item, index) => {
        const text = isObject(item) ? item[TEXT_FIELD[kind] || 'content'] : null;
        if (
            !isObject(item) ||
            (kind === 'risu' && item.mode === 'folder') ||
            typeof text !== 'string' ||
            !text.trim() ||
            !switchedOn(item)
        ) {
            skipped += 1;
            return;
        }
        const words = keywords(item, kind);
        entries.push({
            title: titleOf(item, index + 1, words, text),
            text: text.trim().slice(0, LOREBOOK_LIMITS.text),
            keywords: words
        });
    });
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 120) : '';
    return { name: name || fallbackName, format: label, entries, skipped };
}

export type ImportedLoreItem = {
    topic: string;
    detail: string;
    valid_from_act: number;
    valid_from_scene: number;
    related_to: string[];
    description: string;
};

/** The book's entries as lore items, true from the start of the story. */
export function lorebookToLoreItems(book: ImportedLorebook): ImportedLoreItem[] {
    return book.entries.map((entry) => ({
        topic: entry.title,
        detail: entry.text,
        valid_from_act: 1,
        valid_from_scene: 1,
        related_to: entry.keywords.length > 0 ? entry.keywords.slice(0, 12) : ['Imported Lorebook'],
        description: `Imported from ${book.format}: ${book.name}`
    }));
}
