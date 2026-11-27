/**
 * @module domain/lore/worldBuilder
 * A world from a pitch, in three parts: the land (regions and places), the powers (peoples and
 * factions), and the past (history and the rules the world runs on). Each part is asked for as one
 * JSON object and checked here, in code, before the next is asked for, so a later part can lean on
 * the names of an earlier one. The finished draft becomes lore proposals the author approves.
 */

export const WORLD_PARTS = ['land', 'powers', 'past'] as const;
export type WorldPart = (typeof WORLD_PARTS)[number];

export const WORLD_PART_LABELS: Record<WorldPart, string> = {
    land: 'the land',
    powers: 'the peoples and factions',
    past: 'the history and rules'
};

export const WORLD_SIZES = {
    small: { places: [4, 6], factions: [2, 3] },
    medium: { places: [6, 10], factions: [3, 5] },
    large: { places: [10, 14], factions: [4, 6] }
} as const;
export type WorldSize = keyof typeof WORLD_SIZES;

export const WORLD_PITCH_MAX_CHARS = 2000;
const NAME_MAX = 80;
const TEXT_MAX = 500;

export interface WorldLand {
    regions: Array<{ name: string; summary: string }>;
    places: Array<{ name: string; region: string; kind: string; summary: string }>;
}
export interface WorldPowers {
    peoples: Array<{ name: string; summary: string }>;
    factions: Array<{ name: string; goal: string; holds: string[]; rivals: string[]; allies: string[] }>;
}
export interface WorldPast {
    history: Array<{ when: string; event: string }>;
    rules: Array<{ name: string; rule: string }>;
}
export interface WorldDraft {
    land?: WorldLand;
    powers?: WorldPowers;
    past?: WorldPast;
}

const SHAPES: Record<WorldPart, string> = {
    land: `{
  "regions": [{ "name": "...", "summary": "what the region is like and who lives there" }],
  "places": [{ "name": "...", "region": "the name of one of the regions", "kind": "city, town, village, ruin, fortress, landmark or the like", "summary": "what it is and why a story would go there" }]
}`,
    powers: `{
  "peoples": [{ "name": "...", "summary": "who they are, how they live, what sets them apart" }],
  "factions": [{ "name": "...", "goal": "what they want and what they will do for it", "holds": ["names of places they run or lean on"], "rivals": ["names of other factions"], "allies": ["names of other factions"] }]
}`,
    past: `{
  "history": [{ "when": "a date, an age or 'forty years ago'", "event": "what happened and what it left behind" }],
  "rules": [{ "name": "...", "rule": "a hard limit of this world: what magic, technology, law or nature allows and what it costs" }]
}`
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const key = (value: unknown): string => str(value).toLowerCase().replace(/\s+/g, ' ');
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const names = (value: unknown): string[] => [...new Set(list(value).map(str).filter(Boolean))];

/** The JSON object in a model's answer, or null. Code fences and stray words around it are ignored. */
export function worldAnswerObject(answer: unknown): Record<string, unknown> | null {
    if (answer && typeof answer === 'object' && !Array.isArray(answer)) return answer as Record<string, unknown>;
    const raw = str(answer);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** One part of an answer, cleaned to its shape. Nothing is checked here; see worldPartProblems. */
export function cleanWorldPart(part: WorldPart, answer: unknown): WorldLand | WorldPowers | WorldPast {
    const source = record(answer);
    const rows = (field: string) => list(source[field]).map(record);
    if (part === 'land') {
        const land: WorldLand = {
            regions: rows('regions').map((r) => ({ name: str(r.name), summary: str(r.summary) })),
            places: rows('places').map((p) => ({
                name: str(p.name),
                region: str(p.region),
                kind: str(p.kind) || 'place',
                summary: str(p.summary)
            }))
        };
        return land;
    }
    if (part === 'powers') {
        const powers: WorldPowers = {
            peoples: rows('peoples').map((p) => ({ name: str(p.name), summary: str(p.summary) })),
            factions: rows('factions').map((f) => ({
                name: str(f.name),
                goal: str(f.goal),
                holds: names(f.holds),
                rivals: names(f.rivals),
                allies: names(f.allies)
            }))
        };
        return powers;
    }
    const past: WorldPast = {
        history: rows('history').map((h) => ({ when: str(h.when), event: str(h.event) })),
        rules: rows('rules').map((r) => ({ name: str(r.name), rule: str(r.rule) }))
    };
    return past;
}

function countProblem(what: string, count: number, low: number, high: number): string[] {
    return count < low || count > high ? [`Give ${low} to ${high} ${what}; there are ${count}.`] : [];
}

function fieldProblems(what: string, rows: ReadonlyArray<Record<string, string | string[]>>, nameField: string, textField: string): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    rows.forEach((row, index) => {
        const name = row[nameField] as string;
        const body = row[textField] as string;
        const label = name || `${what} ${index + 1}`;
        if (!name) problems.push(`${what} ${index + 1} has no "${nameField}".`);
        else if (name.length > NAME_MAX) problems.push(`"${name.slice(0, 30)}…" is too long for a ${nameField} (${NAME_MAX} characters at most).`);
        if (!body) problems.push(`${label} has no "${textField}".`);
        else if (body.length > TEXT_MAX) problems.push(`The ${textField} of ${label} runs past ${TEXT_MAX} characters.`);
        if (name && seen.has(key(name))) problems.push(`${what} "${name}" appears twice.`);
        seen.add(key(name));
    });
    return problems;
}

/**
 * What is wrong with one cleaned part, in sentences the model can act on. `done` holds the parts
 * already accepted: the powers are checked against the land's places.
 */
export function worldPartProblems(part: WorldPart, value: unknown, done: WorldDraft, size: WorldSize): string[] {
    const limits = WORLD_SIZES[size] || WORLD_SIZES.medium;
    if (part === 'land') {
        const land = value as WorldLand;
        const regions = new Set(land.regions.map((r) => key(r.name)));
        const problems = [
            ...countProblem('regions', land.regions.length, 1, 5),
            ...countProblem('places', land.places.length, limits.places[0], limits.places[1]),
            ...fieldProblems('Region', land.regions, 'name', 'summary'),
            ...fieldProblems('Place', land.places, 'name', 'summary')
        ];
        for (const place of land.places) {
            if (place.name && !regions.has(key(place.region))) {
                problems.push(`Place "${place.name}" names a region that is not listed ("${place.region}").`);
            }
            if (place.name && regions.has(key(place.name))) problems.push(`A place and a region share the name "${place.name}".`);
        }
        for (const region of land.regions) {
            if (region.name && !land.places.some((place) => key(place.region) === key(region.name))) {
                problems.push(`Region "${region.name}" has no place in it.`);
            }
        }
        return problems;
    }
    if (part === 'powers') {
        const powers = value as WorldPowers;
        const places = new Set((done.land?.places || []).map((p) => key(p.name)));
        const factions = new Set(powers.factions.map((f) => key(f.name)));
        const problems = [
            ...countProblem('peoples', powers.peoples.length, 1, 5),
            ...countProblem('factions', powers.factions.length, limits.factions[0], limits.factions[1]),
            ...fieldProblems('People', powers.peoples, 'name', 'summary'),
            ...fieldProblems('Faction', powers.factions, 'name', 'goal')
        ];
        for (const faction of powers.factions) {
            if (!faction.name) continue;
            for (const held of faction.holds) {
                if (!places.has(key(held))) problems.push(`Faction "${faction.name}" holds "${held}", which is not one of the places.`);
            }
            for (const other of [...faction.rivals, ...faction.allies]) {
                if (key(other) === key(faction.name)) problems.push(`Faction "${faction.name}" lists itself as a rival or ally.`);
                else if (!factions.has(key(other))) problems.push(`Faction "${faction.name}" names "${other}", which is not one of the factions.`);
            }
            const both = faction.rivals.filter((rival) => faction.allies.some((ally) => key(ally) === key(rival)));
            if (both.length > 0) problems.push(`Faction "${faction.name}" has "${both[0]}" as both rival and ally.`);
        }
        if (powers.factions.length > 1 && powers.factions.every((f) => f.rivals.length === 0)) {
            problems.push('No faction has a rival. Their goals must pull against each other.');
        }
        return problems;
    }
    const past = value as WorldPast;
    return [
        ...countProblem('history entries', past.history.length, 3, 8),
        ...countProblem('rules', past.rules.length, 2, 6),
        ...fieldProblems('History entry', past.history, 'when', 'event').filter((p) => !p.includes('appears twice')),
        ...fieldProblems('Rule', past.rules, 'name', 'rule')
    ];
}

/** The parts already accepted, as plain text for the next ask. */
export function worldSoFarText(done: WorldDraft): string {
    const lines: string[] = [];
    if (done.land) {
        lines.push('Regions:', ...done.land.regions.map((r) => `- ${r.name}: ${r.summary}`));
        lines.push('Places:', ...done.land.places.map((p) => `- ${p.name} (${p.kind}, ${p.region}): ${p.summary}`));
    }
    if (done.powers) {
        lines.push('Peoples:', ...done.powers.peoples.map((p) => `- ${p.name}: ${p.summary}`));
        lines.push('Factions:', ...done.powers.factions.map((f) => `- ${f.name}: ${f.goal}`));
    }
    return lines.join('\n');
}

export interface WorldAskContext {
    pitch: string;
    size: WorldSize;
    /** Facts the story already has (genre, tone, setting), one per line. */
    storyFacts?: string[];
    /** Topics of lore the story already holds, so the new world does not contradict or repeat them. */
    knownTopics?: string[];
}

/** The prompt for one part. `problems` are those of the last refused answer, if any. */
export function worldPartAsk(part: WorldPart, context: WorldAskContext, done: WorldDraft, problems: ReadonlyArray<string> = []): string {
    const limits = WORLD_SIZES[context.size] || WORLD_SIZES.medium;
    const soFar = worldSoFarText(done);
    const facts = (context.storyFacts || []).filter(Boolean);
    const known = (context.knownTopics || []).filter(Boolean).slice(0, 60);
    const ask =
        part === 'land'
            ? `Write the land of this world. Give 1 to 5 regions and ${limits.places[0]} to ${limits.places[1]} places worth setting a scene in, each in one of the regions and every region with at least one place.`
            : part === 'powers'
              ? `Write who lives in this world and who contends for it. Give 1 to 5 peoples and ${limits.factions[0]} to ${limits.factions[1]} factions whose goals pull against each other. "holds" may only name places listed above, exactly as written. "rivals" and "allies" may only name other factions in your answer.`
              : 'Write the past of this world. Give 3 to 8 history entries, oldest first, each one something the places and factions above still live with, and 2 to 6 rules: the hard limits a writer must never break.';
    return [
        `<pitch>\n${context.pitch.trim().slice(0, WORLD_PITCH_MAX_CHARS)}\n</pitch>`,
        facts.length ? `<story>\n${facts.join('\n')}\n</story>` : '',
        known.length ? `<lore_already_in_the_story>\n${known.join('\n')}\n</lore_already_in_the_story>` : '',
        soFar ? `<world_so_far>\n${soFar}\n</world_so_far>` : '',
        `<task>\n${ask}\nKeep every name under ${NAME_MAX} characters and every other text under ${TEXT_MAX}. Answer with one JSON object in exactly this shape:\n${SHAPES[part]}\n</task>`,
        problems.length
            ? `<previous_answer_refused>\nFix these problems:\n${problems.slice(0, 12).map((p) => `- ${p}`).join('\n')}\n</previous_answer_refused>`
            : ''
    ]
        .filter(Boolean)
        .join('\n\n');
}

const sentence = (value: string): string => (/[.!?…"”')\]]$/.test(value) ? value : `${value}.`);

/** The finished draft as lore: one item for each region, place, people, faction, history entry and rule. */
export function worldDraftLore(draft: WorldDraft): Array<{ topic: string; detail: string }> {
    const items: Array<{ topic: string; detail: string }> = [];
    const factions = draft.powers?.factions || [];
    for (const region of draft.land?.regions || []) {
        const within = (draft.land?.places || []).filter((p) => key(p.region) === key(region.name)).map((p) => p.name);
        items.push({
            topic: `Region: ${region.name}`,
            detail: `${sentence(region.summary)}${within.length ? ` Places: ${within.join(', ')}.` : ''}`
        });
    }
    for (const place of draft.land?.places || []) {
        const holders = factions.filter((f) => f.holds.some((held) => key(held) === key(place.name))).map((f) => f.name);
        items.push({
            topic: `Place: ${place.name}`,
            detail: `A ${place.kind} in ${place.region}. ${sentence(place.summary)}${holders.length ? ` Held by: ${holders.join(', ')}.` : ''}`
        });
    }
    for (const people of draft.powers?.peoples || []) {
        items.push({ topic: `People: ${people.name}`, detail: sentence(people.summary) });
    }
    for (const faction of factions) {
        items.push({
            topic: `Faction: ${faction.name}`,
            detail: [
                sentence(faction.goal),
                faction.holds.length ? `Holds: ${faction.holds.join(', ')}.` : '',
                faction.rivals.length ? `Rivals: ${faction.rivals.join(', ')}.` : '',
                faction.allies.length ? `Allies: ${faction.allies.join(', ')}.` : ''
            ]
                .filter(Boolean)
                .join(' ')
        });
    }
    for (const entry of draft.past?.history || []) {
        items.push({ topic: `History: ${entry.when}`, detail: sentence(entry.event) });
    }
    for (const rule of draft.past?.rules || []) {
        items.push({ topic: `Rule of the world: ${rule.name}`, detail: sentence(rule.rule) });
    }
    return items;
}
