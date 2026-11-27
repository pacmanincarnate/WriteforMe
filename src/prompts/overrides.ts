/**
 * @module prompts/overrides
 * Lets a user reword the core system prompts without breaking the pipeline.
 *
 * - A user's wording is stored apart from the shipped default, with a copy of the default it
 *   replaced. An update that changes the default leaves their wording alone and flags it.
 * - A save is refused when it drops an XML tag the default tells the model to write, because the
 *   parsers read those tags.
 * - `applyPromptOverrides` writes the wording in use into the live `PROMPTS` registry, which every
 *   pipeline call reads at call time.
 */

import { PROMPTS } from './index';
import { CONCEPT_PROMPTS } from './tiers/concept';
import { CONTINUITY_PROMPTS } from './tiers/continuity';
import { EDITORIAL_PROMPTS } from './tiers/editorial';
import { PROSE_PROMPTS } from './tiers/prose';
import { SAFEGUARD_PROMPTS } from './tiers/safeguards';
import { SERIAL_PROMPTS } from './tiers/serial';
import { SERIES_PROMPTS } from './tiers/series';
import { STRUCTURE_PROMPTS } from './tiers/structure';

export interface PromptOverride {
    text: string;
    /** A fingerprint of the shipped wording this replaced, so a later change to the default can be flagged. */
    defaultHash: string;
    updatedAt: number;
}

export type PromptOverrides = Record<string, PromptOverride>;

export interface EditablePromptView {
    key: string;
    group: string;
    label: string;
    description: string;
    /** The wording in use. */
    text: string;
    default: string;
    customized: boolean;
    /** Saved against an older default: their wording stays, and a newer default exists. */
    outdated: boolean;
    /** Their wording no longer fits the current default (a new required tag), so the default is in use. */
    problem: string | null;
    requiredTags: string[];
    /** JSON field names the default shows the model writing. */
    requiredFields: string[];
}

type PromptTable = Record<string, string>;

/** A short fingerprint of a wording. Storing it, not the whole default, keeps saved settings small. */
export function promptFingerprint(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${text.length}:${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

const GROUPS: Array<[string, PromptTable]> = [
    ['Concept and cast', CONCEPT_PROMPTS as PromptTable],
    ['Story structure', STRUCTURE_PROMPTS as PromptTable],
    ['Writing and revision', PROSE_PROMPTS as PromptTable],
    ['Continuity and lore', CONTINUITY_PROMPTS as PromptTable],
    ['Editorial Desk', EDITORIAL_PROMPTS as PromptTable],
    ['Book series', SERIES_PROMPTS as unknown as PromptTable],
    ['Serial fiction', SERIAL_PROMPTS as unknown as PromptTable],
    ['Safeguards', SAFEGUARD_PROMPTS as unknown as PromptTable]
];

/** Old names in the registry that must follow the prompt they alias. */
const ALIASES: Record<string, string[]> = {
    writingAgent: ['writing'],
    characterDevelopment: ['characterDeveloper'],
    storyArc: ['storyArcPlanner'],
    actAgent: ['actDivisionPlanner'],
    sequenceAgent: ['sequencePlanner'],
    scenePlannerAgent: ['sceneRosterPlanner']
};

const DESCRIPTIONS: Record<string, [string, string]> = {
    conceptualDevelopment: ['Concept developer', 'Turns your concept into genre, tone, style, setting and the starting cast (Tier 0.1).'],
    characterDevelopment: ['Character developer', 'Deepens each cast member: history, voice, flaw, desire (Tier 0.2).'],
    storyArc: ['Story arc planner', 'Plans the whole-book arc and its threads (Tier 1.1).'],
    actAgent: ['Act planner', 'Divides the arc into acts.'],
    sequenceAgent: ['Sequence planner', 'Breaks each act into its sequences.'],
    scenePlannerAgent: ['Scene planner', 'Plans the scenes of a sequence.'],
    sceneExpanderAgent: ['Scene blueprint writer', 'Expands a planned scene into the beat-by-beat blueprint the Writer follows.'],
    writingAgent: ['The Writer', 'The system prompt for every scene of prose. Audio Drama uses its own.'],
    writingReview: ['Prose reviewer', 'Reviews a drafted scene and decides whether it passes.'],
    styleAndSensoryPolish: ['Style polish', 'The polish pass over a drafted scene.'],
    surgicalProseEditor: ['Surgical editor', 'Makes targeted edits to prose without rewriting the scene.'],
    storySoFarAgent: ['Story so far', 'Compresses earlier scenes into the running summary.'],
    archivist: ['Archivist', 'Records what a finished scene changed: cast, lore, knowledge.'],
    entityNameRepair: ['Name repair', 'Replaces stock names the name audit flags.'],
    loreDistiller: ['Lore distiller', 'Condenses uploaded lore.'],
    seriesArchitect: ['Series architect', 'Plans the series: question, long arc, per-book roadmap.'],
    contractAuditor: ['Ending contract audit', 'Checks a book closed and kept open what its contract says.'],
    secretLeakJudge: ['Secret leak judge', 'Reads a finished scene for a secret told before its planned reveal.'],
    serialEpisodePlanner: ['Serial episode planner', 'Sent to the scene planner with each episode plan of a serial: how to use the plan.'],
    serialEpisodeWriter: ['Serial episode writer', "Sent to the Writer with the plan of the scene's episode."],
    serialContinuity: ['Serial thread tracking', 'Asks the Archivist to report threads put on hold or kept warm in a scene.'],
    bookRecap: ['Book recap', 'Writes the recap the next book starts from.']
};

function humanize(key: string): string {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface EditableEntry {
    key: string;
    group: string;
    label: string;
    description: string;
    default: string;
    /** Every object a pipeline call may read this prompt from. */
    homes: PromptTable[];
}

function buildEntries(): Map<string, EditableEntry> {
    const registry = PROMPTS as unknown as PromptTable;
    const entries = new Map<string, EditableEntry>();
    const add = (key: string, group: string, table: PromptTable | null) => {
        const value = table ? table[key] : registry[key];
        if (typeof value !== 'string' || !value.trim() || entries.has(key)) return;
        const [label, description] = DESCRIPTIONS[key] || [humanize(key), ''];
        const homes = [registry, ...(table ? [table] : [])].filter(
            (home) => Object.getOwnPropertyDescriptor(home, key)?.writable
        );
        entries.set(key, { key, group, label, description, default: value, homes });
    };
    add('writingAgent', 'Writing and revision', null);
    GROUPS.forEach(([group, table]) => Object.keys(table).forEach((key) => add(key, group, table)));
    return entries;
}

/** Built once at load, before any override is applied, so `default` is always the shipped wording. */
const ENTRIES = buildEntries();

const CLOSING_TAG = /<\/([A-Za-z_][\w-]*)\s*>/g;
const SELF_CLOSING_TAG = /<([A-Za-z_][\w-]*)\b[^<>]*\/>/g;

/** XML tags the default shows the model writing: any it closes, or writes self-closed. */
export function requiredTagsOf(defaultText: string): string[] {
    const found = new Set<string>();
    for (const match of defaultText.matchAll(CLOSING_TAG)) found.add(match[1]);
    for (const match of defaultText.matchAll(SELF_CLOSING_TAG)) found.add(match[1]);
    return Array.from(found).sort();
}

const JSON_FIELD = /"([A-Za-z_]\w*)"\s*:/g;

/** JSON field names the default shows the model writing (`"name": ...`). */
export function requiredFieldsOf(defaultText: string): string[] {
    const found = new Set<string>();
    for (const match of defaultText.matchAll(JSON_FIELD)) found.add(match[1]);
    return Array.from(found).sort();
}

/** Why the wording would break the prompt, in words the user can act on, or null. */
export function promptProblems(defaultText: string, wording: string): string | null {
    if (!wording.trim()) return 'The prompt is empty. Use Reset to default to go back to the shipped wording.';
    const missing = requiredTagsOf(defaultText).filter(
        (tag) => !new RegExp(`</?${tag}(?![\\w-])`).test(wording)
    );
    if (missing.length > 0) {
        const marks = missing.slice(0, 8).map((tag) => `<${tag}>`).join(', ');
        const more = missing.length > 8 ? ` and ${missing.length - 8} more` : '';
        return `Keep these tags in the prompt, because the app reads the model's reply by them: ${marks}${more}.`;
    }
    const missingFields = requiredFieldsOf(defaultText).filter((name) => !wording.includes(`"${name}"`));
    if (missingFields.length > 0) {
        const marks = missingFields.slice(0, 8).map((name) => `"${name}"`).join(', ');
        const more = missingFields.length > 8 ? ` and ${missingFields.length - 8} more` : '';
        return `Keep these JSON fields in the prompt, because the app reads the model's reply by them: ${marks}${more}.`;
    }
    return null;
}

export function isEditablePrompt(key: string): boolean {
    return ENTRIES.has(key);
}

export function viewPrompt(key: string, overrides: PromptOverrides): EditablePromptView | null {
    const entry = ENTRIES.get(key);
    if (!entry) return null;
    const saved = overrides[key];
    const problem = saved ? promptProblems(entry.default, saved.text) : null;
    return {
        key,
        group: entry.group,
        label: entry.label,
        description: entry.description,
        text: saved ? saved.text : entry.default,
        default: entry.default,
        customized: Boolean(saved),
        outdated: Boolean(saved && saved.defaultHash !== promptFingerprint(entry.default)),
        problem,
        requiredTags: requiredTagsOf(entry.default),
        requiredFields: requiredFieldsOf(entry.default)
    };
}

export function listEditablePrompts(overrides: PromptOverrides): EditablePromptView[] {
    return Array.from(ENTRIES.keys()).map((key) => viewPrompt(key, overrides) as EditablePromptView);
}

export type SavePromptResult = { ok: true; overrides: PromptOverrides } | { ok: false; error: string };

/** Saves a wording after checking it. Saving the default wording removes the override. */
export function savePromptOverride(overrides: PromptOverrides, key: string, wording: string, now = Date.now()): SavePromptResult {
    const entry = ENTRIES.get(key);
    if (!entry) return { ok: false, error: `There is no editable prompt named "${key}".` };
    const problem = promptProblems(entry.default, wording);
    if (problem) return { ok: false, error: problem };
    const next = { ...overrides };
    if (wording === entry.default) delete next[key];
    else next[key] = { text: wording, defaultHash: promptFingerprint(entry.default), updatedAt: now };
    return { ok: true, overrides: next };
}

export function resetPromptOverride(overrides: PromptOverrides, key: string): PromptOverrides {
    const next = { ...overrides };
    delete next[key];
    return next;
}

/** Stored overrides from JSON, dropping anything that is not one. */
export function parsePromptOverrides(raw: unknown): PromptOverrides {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        } catch {
            return {};
        }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const found: PromptOverrides = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const row = item as Partial<PromptOverride> | null;
        if (!ENTRIES.has(key) || !row || typeof row.text !== 'string' || !row.text.trim()) return;
        found[key] = {
            text: row.text,
            defaultHash: typeof row.defaultHash === 'string' ? row.defaultHash : '',
            updatedAt: Number(row.updatedAt) || 0
        };
    });
    return found;
}

/**
 * Puts the wording in use into the live registry: the user's where it still fits the current
 * default, the shipped wording everywhere else. Safe to call again whenever overrides change.
 */
export function applyPromptOverrides(overrides: PromptOverrides): void {
    const registry = PROMPTS as unknown as PromptTable;
    ENTRIES.forEach((entry) => {
        const saved = overrides[entry.key];
        const text = saved && !promptProblems(entry.default, saved.text) ? saved.text : entry.default;
        entry.homes.forEach((home) => {
            home[entry.key] = text;
        });
        (ALIASES[entry.key] || []).forEach((alias) => {
            registry[alias] = text;
        });
    });
}
