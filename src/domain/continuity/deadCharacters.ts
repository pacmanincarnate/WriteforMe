/**
 * @module domain/continuity/deadCharacters
 * The dead-character check, in code: who the story's record says is dead, and which paragraphs of
 * a new scene name one of them. Only a scene that names the dead costs a model call (the pipeline
 * then asks for those paragraphs alone to be put right); a clean scene costs nothing.
 */

export interface DeadCheckCastMember {
    id?: string;
    name?: string;
    /** The author's own word: true is dead, false is alive whatever the story state says. */
    deceased?: unknown;
    status?: unknown;
    [key: string]: unknown;
}

export interface DeadCheckStory {
    cast?: Array<DeadCheckCastMember | null> | null;
    character_states?: Record<string, unknown> | null;
    serial?: { roster?: Array<{ name?: unknown; status?: unknown } | null> | null } | null;
    [key: string]: unknown;
}

export interface DeadCharacter {
    name: string;
    /** Where the record says so: the author's mark, the story state, or the serial's roster. */
    source: 'author' | 'state' | 'roster';
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const DEAD_WORD = /\b(dead|deceased|died|killed|slain|murdered|executed|perished|drowned|corpse|body (?:lies|left|found|buried|burned))\b/i;
/** Words that make "dead" mean something else, or leave it unsure. */
const NOT_DEAD =
    /\b(not|never|nearly|almost|half|presumed|believed|feared|thought|rumou?red|reported|supposedly|apparently|left for|playing|pretend\w*|fak\w+|feign\w*|mistaken for|as good as|might be|may be|could be|if|unless|wishes?|wants?|threat\w*|narrowly|survived?|alive|dead (?:tired|drunk|asleep|weight|set|serious|silent|calm|certain|sure|end|centre|center|on))\b/i;

/**
 * Whether a free-text physical state says the character is dead. Deliberately cautious: the state
 * must say so in its opening words, and anything that hedges ("presumed dead", "left for dead",
 * "nearly killed") does not count. A miss costs nothing; a wrong hit would rewrite a living
 * character out of a scene.
 */
export function stateSaysDead(state: unknown): boolean {
    const opening = text(state).split(/[.;\n]/)[0].slice(0, 80);
    if (!opening) return false;
    return DEAD_WORD.test(opening) && !NOT_DEAD.test(opening);
}

/** Everyone the record holds dead, by name, with where the record says so. */
export function deadCharacters(story: DeadCheckStory | null | undefined): DeadCharacter[] {
    const found = new Map<string, DeadCharacter>();
    const alive = new Set<string>();
    const cast = Array.isArray(story?.cast) ? story.cast : [];
    const states = story?.character_states && typeof story.character_states === 'object' ? story.character_states : {};

    for (const member of cast) {
        const name = text(member?.name);
        if (!member || !name) continue;
        const key = name.toLowerCase();
        if (member.deceased === false) {
            alive.add(key);
            continue;
        }
        if (member.deceased === true) {
            found.set(key, { name, source: 'author' });
            continue;
        }
        const status = text(member.status).toLowerCase();
        if (status === 'dead' || status === 'deceased') {
            found.set(key, { name, source: 'state' });
            continue;
        }
        const state = (states[name] || (member.id ? states[String(member.id)] : null)) as Record<string, unknown> | null;
        if (state && typeof state === 'object' && stateSaysDead(state.physical_state)) {
            found.set(key, { name, source: 'state' });
        }
    }
    for (const entry of story?.serial?.roster || []) {
        const name = text(entry?.name);
        const key = name.toLowerCase();
        if (name && text(entry?.status).toLowerCase() === 'dead' && !alive.has(key) && !found.has(key)) {
            found.set(key, { name, source: 'roster' });
        }
    }
    return [...found.values()];
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wholeWord = (form: string, flags: string): RegExp =>
    new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(form)}(?![\\p{L}\\p{N}-])`, flags);

/**
 * The dead a text names, by full name or by a first name of more than two letters. A first name
 * shared with a living cast member names no one for certain, so it is not used.
 */
export function namedDead(dead: ReadonlyArray<string>, passage: string, living: ReadonlyArray<string> = []): string[] {
    const livingFirst = new Set(living.map((name) => name.trim().split(/\s+/)[0].toLowerCase()).filter(Boolean));
    const found: string[] = [];
    for (const name of dead) {
        const full = name.trim();
        if (!full) continue;
        const first = full.replace(/^the\s+/i, '').split(/\s+/)[0];
        const forms = new Set([full]);
        if (first.length > 2 && /^\p{Lu}/u.test(first) && !livingFirst.has(first.toLowerCase())) forms.add(first);
        // Another of the dead's full name is theirs alone: "Dov Marsh" does not name Dov Hale.
        const withoutOthers = dead
            .map((other) => other.trim())
            .filter((other) => other && other.toLowerCase() !== full.toLowerCase())
            .reduce((rest, other) => rest.replace(wholeWord(other, 'giu'), ' '), passage);
        const hit = [...forms].some((form) => wholeWord(form, 'iu').test(form === full ? passage : withoutOthers));
        if (hit) found.push(full);
    }
    return found;
}

export interface DeadNamedParagraph {
    /** Position among the scene's paragraphs. */
    index: number;
    text: string;
    names: string[];
}

interface SplitScene {
    paragraphs: string[];
    /** The blank-line runs between paragraphs, kept so the scene can be put back exactly. */
    gaps: string[];
    lead: string;
    tail: string;
}

function splitScene(scene: string): SplitScene {
    const lead = scene.match(/^\s*/)?.[0] || '';
    const tail = scene.slice(lead.length).match(/\s*$/)?.[0] || '';
    const body = scene.slice(lead.length, scene.length - tail.length);
    const pieces = body.split(/(\n[ \t]*\n\s*)/);
    const paragraphs: string[] = [];
    const gaps: string[] = [];
    pieces.forEach((piece, index) => (index % 2 === 0 ? paragraphs.push(piece) : gaps.push(piece)));
    return { paragraphs, gaps, lead, tail };
}

/** The paragraphs of a scene that name one of the dead. */
export function deadNamedParagraphs(scene: string, dead: ReadonlyArray<string>, living: ReadonlyArray<string> = []): DeadNamedParagraph[] {
    if (dead.length === 0) return [];
    return splitScene(scene)
        .paragraphs.map((paragraph, index) => ({ index, text: paragraph, names: namedDead(dead, paragraph, living) }))
        .filter((paragraph) => paragraph.names.length > 0);
}

/** The scene with some paragraphs replaced; everything else is kept letter for letter. */
export function withParagraphsReplaced(scene: string, replacements: ReadonlyMap<number, string>): string {
    const { paragraphs, gaps, lead, tail } = splitScene(scene);
    const next = paragraphs.map((paragraph, index) => replacements.get(index) ?? paragraph);
    return lead + next.map((paragraph, index) => paragraph + (gaps[index] || '')).join('') + tail;
}

/**
 * Whether a rewritten paragraph can stand in for the original: it says something, it is one
 * paragraph, and it is neither a stub nor an expansion.
 */
export function acceptableDeadRewrite(original: string, rewrite: string): boolean {
    const clean = rewrite.trim();
    if (!clean || clean === original.trim()) return false;
    if (/\n[ \t]*\n/.test(clean)) return false;
    const ratio = clean.length / Math.max(1, original.trim().length);
    return ratio >= 0.4 && ratio <= 1.8;
}
