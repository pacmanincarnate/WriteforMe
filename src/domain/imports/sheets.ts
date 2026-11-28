/**
 * @module domain/imports/sheets
 * Reads a character sheet written as Markdown and turns it into a cast member. Sheets are written
 * by hand and no two authors lay them out alike, so the reader is loose on purpose:
 *
 * - a field is `**Label:** value` (several may share a line, split by `|`), `**Label** - value`, `Label: value`, `- Label: value`, a
 *   two-column table row, a line of YAML front matter, or the prose under a `## Label` heading;
 * - a label is placed by the words in it ("Hair Colour", "Eye color" and "Physical Description"
 *   are all appearance), not by an exact name;
 * - a label nobody recognises takes the place of the heading it sits under, and failing that is
 *   kept under Notes, so nothing the author wrote is lost.
 *
 * Relationship lines name other people. They are kept on the member and turned into entries on
 * the Relationships page for each name that is in the cast, now or after a later import.
 */

import { CARD_LIMITS, type ImportedCastMember } from './cards';

export interface SheetField {
    label: string;
    value: string;
    /** The `##` or `###` heading the field sits under, when there is one. */
    section: string;
}

export interface CharacterSheet {
    /** The `# ` heading, or the file's name when the sheet has none. */
    title: string;
    /** True when the sheet has a heading of its own, so the title is a name the author wrote. */
    headed: boolean;
    fields: SheetField[];
}

/** One relationship line from a sheet: "Rival" and the people it names, as written. */
export interface SheetRelationLine {
    label: string;
    text: string;
}

export type SheetCastMember = ImportedCastMember & {
    aliases: string[];
    appearance?: string;
    details: ImportedCastMember['details'] & { sheet_relationships?: SheetRelationLine[] };
};

export const SHEET_FILE_LIMIT_BYTES = 2 * 1024 * 1024;

const BOLD_FIELD = /^\s*(?:[-*+]\s+)?(\*\*|__)(.+?)(?::\s*\1|\1\s*(?::|[-–—](?=\s)))\s*(.*)$/;
const PLAIN_FIELD = /^\s*(?:[-*+]\s+)?([A-Z][^:*#|.!?]{0,48}):(?:\s+(.*))?$/;
const TABLE_ROW = /^\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/;
const YAML_LINE = /^([A-Za-z][\w .'/-]{0,48}):\s*(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
/** `**Age:** 22 | **Status:** student` is two fields on one line. */
const INLINE_BREAK = /\s+\|\s+(?=(?:\*\*|__)[^|]+?:)/;
const SHEET_WORDS = '(?:character(?:\\s+(?:sheet|profile|bio|card))?|profile|bio|dossier)';
const TITLE_PREFIX = new RegExp(`^${SHEET_WORDS}\\s*[:\\-–—]\\s*`, 'i');
const TITLE_SUFFIX = new RegExp(`\\s*[:\\-–—(]\\s*${SHEET_WORDS}\\)?$`, 'i');

const unmarked = (value: string): string => value.replace(/^(\*\*|__|\*|_)(.*)\1$/, '$2').trim();
const cleanTitle = (title: string): string => unmarked(title).replace(TITLE_PREFIX, '').replace(TITLE_SUFFIX, '').trim();

const stem = (filename: string): string =>
    filename
        .replace(/\.[^.]+$/, '')
        .replace(/^character[\s_-]+/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();

/** One labelled line, in whichever of the accepted layouts it is written. */
function readField(line: string, plain: boolean): { label: string; value: string } | null {
    const bold = line.match(BOLD_FIELD);
    if (bold) return { label: bold[2].replace(/:$/, '').trim(), value: bold[3].trim() };
    const row = line.match(TABLE_ROW);
    if (row) {
        const label = unmarked(row[1]);
        if (/^[\s:-]*$/.test(label) || /^(field|attribute|key|trait|property|item)$/i.test(label)) return { label: '', value: '' };
        return { label, value: row[2].trim() };
    }
    if (!plain) return null;
    const found = line.match(PLAIN_FIELD);
    if (!found || found[1].trim().split(/\s+/).length > 5) return null;
    return { label: found[1].trim(), value: (found[2] || '').trim() };
}

/** YAML front matter, as far as a sheet uses it: `key: value`, `key: [a, b]` and `- item` lists. */
function readFrontMatter(lines: string[]): { fields: SheetField[]; rest: string[] } {
    const start = lines.findIndex((line) => line.trim());
    if (start < 0 || lines[start].trim() !== '---') return { fields: [], rest: lines };
    const end = lines.findIndex((line, i) => i > start && /^(---|\.\.\.)\s*$/.test(line));
    if (end < 0) return { fields: [], rest: lines };
    const fields: SheetField[] = [];
    for (const line of lines.slice(start + 1, end)) {
        const pair = line.match(YAML_LINE);
        const item = line.match(/^\s+-\s+(.*)$/);
        const strip = (value: string): string => value.trim().replace(/^\[(.*)\]$/, '$1').replace(/^(["'])(.*)\1$/, '$2').replace(/^[|>][+-]?$/, '');
        if (pair) fields.push({ label: pair[1].replace(/[_-]+/g, ' ').trim(), value: strip(pair[2]), section: '' });
        else if (fields.length > 0 && line.trim()) {
            const last = fields[fields.length - 1];
            const more = item ? strip(item[1]) : line.trim();
            last.value = last.value ? `${last.value}${item ? ', ' : '\n'}${more}` : more;
        }
    }
    return { fields, rest: lines.slice(end + 1) };
}

/**
 * The sheets in one Markdown file: one per `# ` heading, or a single sheet when the file has no
 * such heading. A file with no labelled lines at all still gives a sheet, with its text as Notes.
 */
export function readCharacterSheets(source: string, filename = ''): CharacterSheet[] {
    const all = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const { fields: front, rest: lines } = readFrontMatter(all);
    // Plain "Label: value" lines are fields only in a sheet that marks none in bold; in one that
    // does, they are the detail lines under a bold label ("Laugh: ..." under "Physical Expression").
    const plain = !lines.some((line) => BOLD_FIELD.test(line));

    const sheets: CharacterSheet[] = [];
    let sheet: CharacterSheet | null = null;
    let field: SheetField | null = null;
    let section = '';
    const open = (title: string): CharacterSheet => {
        sheet = { title, headed: Boolean(title), fields: sheets.length === 0 ? [...front] : [] };
        sheets.push(sheet);
        section = '';
        field = null;
        return sheet;
    };

    for (const raw of lines.flatMap((each) => (TABLE_ROW.test(each) ? [each] : each.split(INLINE_BREAK)))) {
        const line = raw.trimEnd();
        if (RULE.test(line)) {
            field = null;
            continue;
        }
        const heading = line.match(HEADING);
        if (heading) {
            if (heading[1].length === 1) open(cleanTitle(heading[2]));
            else {
                section = unmarked(heading[2]).replace(/^\d+[.)]\s+/, '').replace(/:$/, '');
                field = null;
            }
            continue;
        }
        const labelled = readField(line, plain);
        if (labelled) {
            if (!labelled.label) continue;
            const target = sheet || open('');
            field = { ...labelled, section };
            target.fields.push(field);
            continue;
        }
        if (field) {
            field.value += `\n${line.trim().replace(/^[-*+]\s+/, '')}`;
        } else if (line.trim()) {
            // Prose with no label of its own: named by its heading, or kept as notes.
            const target = sheet || open('');
            field = { label: section || 'Notes', value: line.trim().replace(/^[-*+]\s+/, ''), section };
            target.fields.push(field);
        }
    }
    if (!sheet && front.length > 0) open('');

    for (const each of sheets) {
        each.fields.forEach((f) => (f.value = f.value.replace(/\n{3,}/g, '\n\n').trim().slice(0, CARD_LIMITS.field)));
        each.fields = each.fields.filter((f) => f.value);
        if (!each.title) each.title = stem(filename);
    }
    return sheets.filter((each) => each.fields.length > 0);
}

type Group = 'description' | 'appearance' | 'personality' | 'goals' | 'voice' | 'history' | 'relationships' | 'secrets' | 'notes';

const GROUP_TITLES: Record<Group, string> = {
    description: 'DESCRIPTION',
    appearance: 'APPEARANCE',
    personality: 'PERSONALITY',
    goals: 'GOALS',
    voice: 'HOW THEY TALK AND MOVE',
    history: 'HISTORY',
    relationships: 'RELATIONSHIPS',
    secrets: 'SECRETS',
    notes: 'NOTES'
};

/**
 * Which group a label belongs to, by the words in it. Checked in this order, so "Physical tells"
 * is how they talk before "physical" makes it appearance, and "Physical Description" is
 * appearance before "description" makes it the description.
 */
const GROUP_WORDS: Array<[Exclude<Group, 'notes'>, RegExp]> = [
    ['secrets', /\b(secrets?|hidden|hides|lies)\b/],
    ['relationships', /\b(relationships?|relations|family(?! (wealth|money|business|name|history|background|status))|relatives|parents?|mother|father|siblings?|sisters?|brothers?|children|sons?|daughters?|wife|husband|aunts?|uncles?|cousins?|kin|friends?|ally|allies|enemy|enemies|rivals?|partners?|lovers?|spouse|married|love interests?|romantic|romance|trust(ed|s)?|interested in|crush(es)?|mentors?|connections?|bonds?)\b/],
    ['voice', /\b(voice|vocal|speech|monologue|physical habits|speaking|speaks|accent|dialect|dialogue|address(es)?|tells?|expressions?|mannerisms?|gestures?|body language|catch ?phrases?|quotes?|verbal|vocabulary|sample lines?)\b/],
    ['goals', /\b(goals?|motivations?|motives?|ambitions?|objectives?|dreams?|aspirations?|agenda)\b/],
    ['appearance', /\b(appearance|looks?|physical|physique|gender|sex|pronouns?|species|race|ethnicity|age|birthday|height|weight|build|body|figure|hair|beard|eyes?|skin|complexion|face|marks?|scars?|tattoos?|piercings?|glasses|cloth(es|ing)|attire|outfits?|wardrobe|fashion|distinguishing|features|measurements)\b/],
    ['personality', /\b(personality|mind|mental|psycholog\w*|traits?|temperament|demeanou?r|disposition|nature|vulnerabilit\w*|fears?|phobias?|flaws?|weakness(es)?|strengths?|virtues?|vices?|likes?|dislikes?|loves|hates|quirks?|habits?|values?|beliefs?|morals?|alignment|desires?|wants?|needs?|yearning|insecurit\w*|contradictions?|triggers?|coping|neuro\w*|anxiet\w*|vices?|religion|faith|sexuality|orientation|decisions?|problem solving|adapt\w*|agency)\b/],
    ['history', /\b(summary|history|background|back ?story|bio(graphy)?|origins?|past|childhood|upbringing)\b/],
    ['description', /\b(description|overview|concept|introduction|intro|about|synopsis|profile)\b/]
];

const NAME_LABEL = /^(full |real |character |given |birth |legal )?name$/;
const ALIAS_LABEL = /\b(aka|a k a|alias(es)?|nick ?names?|also known as|goes by|other names?)\b/;
const ROLE_LABELS = [/^(story |narrative )?role$/, /^(occupation|job|profession)$/, /^(type|class)$/];
const FLAW_LABELS = [/\bflaws?\b/, /\b(weakness(es)?|vulnerabilit\w*)\b/];
const DESIRE_LABELS = [/\b(desires?|yearning)\b/, /\bwants?\b/];
const SAMPLE_LABELS = [/\b(sample|quotes?|catch ?phrases?)\b/, /^examples?$/];

/** "Goals (Long Term)" and "goals_long-term" are both looked up as plain lower-case words. */
const base = (label: string): string =>
    label.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const wordsGroup = (label: string): Group | null => GROUP_WORDS.find(([, words]) => words.test(base(label)))?.[0] || null;

/**
 * A line under a relationships or secrets heading belongs there whatever it is called. Elsewhere
 * the label decides, then the heading it sits under, and a label neither explains is a note.
 */
function groupOf(field: SheetField): Group {
    const under = field.section ? wordsGroup(field.section) : null;
    if (under === 'relationships' || under === 'secrets') return under;
    const own = wordsGroup(field.label);
    // "Description" under a Voice heading describes the voice.
    return (own === 'description' ? under : own) || own || under || 'notes';
}

/** Splits on commas that are not inside brackets: `Ada (tall, kind), Bo` gives two parts. */
function splitList(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
        if (ch === '(' || ch === '[') depth += 1;
        else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else current += ch;
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
}

const withoutBrackets = (value: string): string => value.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

function firstSentence(value: string, limit: number): string {
    const flat = value.replace(/\s+/g, ' ').trim();
    const match = flat.match(/^.*?[.!?](?=\s|$)/);
    const sentence = (match ? match[0] : flat).trim();
    return sentence.length > limit ? `${sentence.slice(0, limit - 1).trimEnd()}…` : sentence;
}

/** Flaw and desire are one-line fields in every prompt; a longer passage stays in the profile only. */
const brief = (value: string): string => (value.length <= 400 ? value : '');

/** The name a sheet gives its character: the Name line, else the heading. */
export function sheetCharacterName(sheet: CharacterSheet): string {
    const named = sheet.fields.find((f) => NAME_LABEL.test(base(f.label)));
    return withoutBrackets((named?.value || sheet.title).split('\n')[0]).slice(0, CARD_LIMITS.name);
}

/**
 * A cast member from a sheet: a supporting character, like one from a card. The whole sheet is
 * the deep profile, grouped; the parts the app reads on their own (aliases, appearance, history,
 * goals, flaw, desire) are also set as fields.
 */
export function sheetToCastMember(sheet: CharacterSheet, id: string): SheetCastMember {
    const name = sheetCharacterName(sheet);
    const pick = (labels: RegExp[]): string => {
        for (const label of labels) {
            const found = sheet.fields.find((f) => label.test(base(f.label)));
            if (found) return found.value;
        }
        return '';
    };

    const grouped = new Map<Group, SheetField[]>();
    const aliases = new Set<string>();
    if (sheet.headed && sheet.title.toLowerCase() !== name.toLowerCase()) aliases.add(sheet.title);
    for (const field of sheet.fields) {
        const key = base(field.label);
        if (NAME_LABEL.test(key)) continue;
        const isAlias = ALIAS_LABEL.test(key);
        if (isAlias) splitList(field.value.replace(/\n+/g, ', ')).map(withoutBrackets).filter(Boolean).forEach((a) => aliases.add(a));
        const group = isAlias ? 'notes' : groupOf(field);
        grouped.set(group, [...(grouped.get(group) || []), field]);
    }
    // A line keeps the heading it sat under when the heading says something its group does not
    // ("Skills" over a list kept as notes).
    const lines = (group: Group): string => {
        let heading = '';
        return (grouped.get(group) || [])
            .flatMap((f) => {
                const own = f.label.toLowerCase() === group || f.label === 'Notes' ? f.value : `${f.label}: ${f.value}`;
                const lead =
                    f.section && f.section !== heading && f.section !== f.label && !wordsGroup(f.label) && wordsGroup(f.section) !== group;
                heading = f.section;
                return lead ? [`${f.section}:`, own] : [own];
            })
            .join('\n');
    };
    // The first full sentence of the description, else the history, else the personality.
    const openers = (['description', 'history', 'personality'] as Group[])
        .flatMap((group) => grouped.get(group) || [])
        .map((f) => firstSentence(f.value.replace(/[*_|]+/g, ' '), 200));
    const logline = openers.find((sentence) => sentence.length >= 25) || openers[0] || '';
    const profile = (Object.keys(GROUP_TITLES) as Group[])
        .filter((group) => grouped.has(group))
        .map((group) => `${GROUP_TITLES[group]}\n${lines(group)}`)
        .join('\n\n')
        .slice(0, CARD_LIMITS.field);

    const description = lines('description');
    const history = lines('history') || description;
    const role = pick(ROLE_LABELS).split('\n')[0].replace(/^character\s*[-–—:]\s*/i, '').trim();
    const said = pick(SAMPLE_LABELS);
    const sample = said.match(/["“]([^"”]{8,240})["”]/)?.[1] || firstSentence(said, 240);
    const relations = (grouped.get('relationships') || []).map((f) => ({ label: f.label, text: f.value }));

    return {
        id,
        name,
        aliases: [...aliases].filter((a) => a.toLowerCase() !== name.toLowerCase()),
        role: role && role.length <= 60 ? role : 'Supporting',
        corner_role: 'SUPPORTING',
        archetype: pick([/^archetype$/]).split('\n')[0].slice(0, 60) || 'Pragmatist',
        logline,
        core_flaw: brief(pick(FLAW_LABELS)) || 'Defending their current comfort zone or safety habit.',
        core_desire: brief(pick(DESIRE_LABELS)) || 'Pursuing their personal goal within the story world.',
        why_it_makes_sense: '',
        what_it_costs_them: '',
        way_of_living: '',
        why_it_is_appealing: '',
        shared_outlook: '',
        the_hidden_trap: '',
        how_they_ended_up: '',
        the_wake_up_call: '',
        ...(grouped.has('appearance') ? { appearance: lines('appearance') } : {}),
        ...(sample ? { voice_sample: sample } : {}),
        details: {
            history,
            goals: lines('goals') || 'Pursuing their personal goal within the story world.',
            story_events: 'Imported from a Markdown file.',
            deep_profile: profile,
            ...(relations.length > 0 ? { sheet_relationships: relations } : {})
        },
        voice: { tone: 'Measured', rhythm: 'Direct', tics: [] }
    };
}

interface LinkableMember {
    name?: string;
    aliases?: unknown;
    details?: Record<string, unknown> | null;
}

type RelationshipRecord = Record<string, Record<string, unknown>>;

const words = (value: string): string[] => value.toLowerCase().split(/\s+/).filter(Boolean);

/** The one cast member a written name means, or null when it means none or more than one. */
function resolveName<T extends LinkableMember>(written: string, cast: T[], self: T): T | null {
    const plainName = (value: string): string =>
        value.toLowerCase().replace(/['’]s\b/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const wanted = plainName(written);
    if (!wanted) return null;
    const others = cast.filter((member) => member !== self && member.name);
    const namesOf = (member: T): string[] =>
        [member.name || '', ...(Array.isArray(member.aliases) ? member.aliases.map(String) : [])].map(plainName);
    const exact = others.filter((member) => namesOf(member).includes(wanted));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    // "Mara" for "Mara Vance", or "Mara Vance" for a member listed as "Mara".
    const partial = others.filter((member) => {
        const have = words(plainName(member.name || ''));
        const want = words(wanted);
        return want.every((w) => have.includes(w)) || have.every((w) => want.includes(w));
    });
    return partial.length === 1 ? partial[0] : null;
}

const trustFor = (label: string): number => (/trust|friend|ally|allies|partner|famil|blood|parent|mother|father|sibling|sister|brother|spouse|wife|husband/i.test(label) ? 8 : /rival|enem/i.test(label) ? 3 : 5);

/**
 * Adds a relationship for each person a sheet's relationship lines name who is in the cast. A
 * relationship that already has text is left alone, so running this again after a later import
 * only fills in what the newcomers made possible.
 */
export function linkSheetRelationships<T extends LinkableMember>(
    cast: T[],
    relationships: RelationshipRecord | null | undefined
): { relationships: RelationshipRecord; added: number } {
    const next: RelationshipRecord = { ...(relationships || {}) };
    let added = 0;
    for (const member of cast) {
        const kept = member.details?.sheet_relationships;
        if (!member.name || !Array.isArray(kept)) continue;
        const found = new Map<string, { said: string[]; trust: number }>();
        for (const line of kept as SheetRelationLine[]) {
            let last: { said: string[] } | null = null;
            let lastIndex = -1;
            for (const part of String(line?.text || '').split('\n').flatMap(splitList)) {
                const head = (part.match(/^[^([;:]+/)?.[0] || '').trim();
                const after = part.slice(head.length).replace(/^[\s;:]+/, '').trim();
                const bracketed = after.match(/^\(([^)]*)\)\s*[:\-–—]?\s*(.*)$/);
                const rest = bracketed ? [bracketed[1], bracketed[2]].filter(Boolean).join(': ') : after;
                const target = resolveName(head, cast, member);
                if (target?.name) {
                    const entry = found.get(target.name) || { said: [], trust: 0 };
                    entry.said.push(rest ? `${line.label} (${rest})` : line.label);
                    entry.trust = Math.max(entry.trust, trustFor(line.label));
                    found.set(target.name, entry);
                    last = entry;
                    lastIndex = entry.said.length - 1;
                } else if (last && /^[a-z]/.test(part)) {
                    // "Ada, in matters of chess": the second part describes Ada, it is not a person.
                    const so = last.said[lastIndex];
                    last.said[lastIndex] = so.endsWith(')') ? `${so.slice(0, -1)}, ${part})` : `${so} (${part})`;
                } else {
                    last = null;
                }
            }
        }
        for (const [to, entry] of found) {
            const key = `${member.name}->${to}`;
            if (String(next[key]?.current || '').trim()) continue;
            next[key] = { ...(next[key] || {}), current: entry.said.join('; ').slice(0, 400), trust_level: entry.trust, history: next[key]?.history || [] };
            added += 1;
        }
    }
    return { relationships: next, added };
}
