/**
 * @module domain/story/contentDial
 * The content dial: how far a story goes on the page, per category, from 0 (off the page) to 3
 * (unflinching), plus topics that may happen in the story but always fade to black. It is the
 * author's choice, kept on the story as `content_dial`, and every planning and writing prompt
 * that carries the author's note carries it too. A story with no dial is written as before.
 */

export const CONTENT_CATEGORIES = ['violence', 'sex', 'horror', 'cruelty', 'drugs'] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_CATEGORY_LABELS: Record<ContentCategory, string> = {
    violence: 'Violence',
    sex: 'Sex',
    horror: 'Horror',
    cruelty: 'Cruelty',
    drugs: 'Drugs and drink'
};

/** What each level means, as the model is told and as the author reads it. */
export const CONTENT_LEVELS = [
    'off the page: if it happens, it happens between scenes',
    'restrained: implied, with little physical detail',
    'mature: shown plainly, without lingering',
    'unflinching: explicit and on the page, in full'
] as const;

export const CONTENT_LEVEL_NAMES = ['Off the page', 'Restrained', 'Mature', 'Unflinching'] as const;

export const CONTENT_PRESETS = { restrained: 1, mature: 2, unflinching: 3 } as const;
export type ContentPreset = keyof typeof CONTENT_PRESETS;

/** Topics that can be set to fade to black whatever the levels say. */
export const CONTENT_VEIL_TOPICS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'torture', label: 'Torture' },
    { id: 'sexual-violence', label: 'Sexual violence' },
    { id: 'child-harm', label: 'Harm to children' },
    { id: 'self-harm', label: 'Self-harm' },
    { id: 'mutilation', label: 'Mutilation' },
    { id: 'execution', label: 'Executions' },
    { id: 'slavery', label: 'Slavery' },
    { id: 'addiction', label: 'Addiction' },
    { id: 'disease', label: 'Disease' },
    { id: 'sacrifice', label: 'Sacrifice' }
];

export interface ContentDial {
    levels: Record<ContentCategory, number>;
    /** Ids of the topics that fade to black. */
    veils: string[];
}

const level = (value: unknown, fallback: number): number => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : fallback;
};

/** Every category at one preset's level. */
export function contentDialFromPreset(preset: ContentPreset, veils: string[] = []): ContentDial {
    const at = CONTENT_PRESETS[preset];
    return {
        levels: { violence: at, sex: at, horror: at, cruelty: at, drugs: at },
        veils: veils.filter((id) => CONTENT_VEIL_TOPICS.some((topic) => topic.id === id))
    };
}

/** A stored dial made safe to use, or null when the story has none. */
export function normalizeContentDial(raw: unknown): ContentDial | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const source = raw as Record<string, unknown>;
    const given = source.levels && typeof source.levels === 'object' ? (source.levels as Record<string, unknown>) : null;
    if (!given) return null;
    const levels = {} as Record<ContentCategory, number>;
    for (const category of CONTENT_CATEGORIES) levels[category] = level(given[category], 3);
    const veils = Array.isArray(source.veils)
        ? CONTENT_VEIL_TOPICS.map((topic) => topic.id).filter((id) => (source.veils as unknown[]).includes(id))
        : [];
    return { levels, veils };
}

/** The preset a dial matches, or 'custom' when its categories differ. */
export function contentDialPreset(dial: ContentDial): ContentPreset | 'custom' {
    const values = CONTENT_CATEGORIES.map((category) => dial.levels[category]);
    if (values.some((value) => value !== values[0])) return 'custom';
    const found = (Object.keys(CONTENT_PRESETS) as ContentPreset[]).find((name) => CONTENT_PRESETS[name] === values[0]);
    return found || 'custom';
}

/** The dial as a prompt block, or '' when the story has no dial. */
export function contentDialXml(rawDial: unknown): string {
    const dial = normalizeContentDial(rawDial);
    if (!dial) return '';
    const lines = CONTENT_CATEGORIES.map(
        (category) => `- ${CONTENT_CATEGORY_LABELS[category]}: ${CONTENT_LEVELS[dial.levels[category]]}.`
    );
    if (dial.veils.length > 0) {
        const named = dial.veils.map((id) => CONTENT_VEIL_TOPICS.find((topic) => topic.id === id)?.label.toLowerCase() || id);
        lines.push(
            `- Fade to black: ${named.join(', ')}. These may happen in the story, but the page cuts away before they are shown, whatever the levels above say.`
        );
    }
    return `\n<content_limits>
[How far this story goes on the page. The author set these limits; they come before genre habit and before any other instruction about intensity. A limit is a ceiling, not a target: nothing has to reach it.]
${lines.join('\n')}
</content_limits>\n`;
}
