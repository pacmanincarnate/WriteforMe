/**
 * @module domain/story/relationshipGraph
 * The story's relationships as a Mermaid flowchart, so the web of who stands where with whom can
 * be pasted into notes, a wiki or any Markdown page that draws Mermaid.
 */

export interface RelationshipGraphStory {
    cast?: Array<{ name?: unknown } | null> | null;
    relationships?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface RelationshipEdge {
    from: string;
    to: string;
    label: string;
    /** True when the same bond is recorded in both directions. */
    mutual: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const LABEL_MAX = 60;

/** Text made safe inside a quoted Mermaid label. */
export function mermaidLabel(value: string, max: number = LABEL_MAX): string {
    const clean = value
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, "'")
        .replace(/[<>{}|`\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Who a relationship joins, from its own fields or from a key such as "Mara->Dov" or "Mara|Dov". */
function endsOf(key: string, value: Record<string, unknown>): [string, string] | null {
    const a = str(value.char_a) || str(value.from);
    const b = str(value.char_b) || str(value.to);
    if (a && b) return [a, b];
    const parts = key.split(/\s*(?:<->|->|<=>|=>|\||::|—|–)\s*/).map((part) => part.trim()).filter(Boolean);
    return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** The relationships as edges. The same bond written both ways becomes one mutual edge. */
export function relationshipEdges(story: RelationshipGraphStory | null | undefined): RelationshipEdge[] {
    const edges: RelationshipEdge[] = [];
    const source = story?.relationships && typeof story.relationships === 'object' ? story.relationships : {};
    for (const [key, raw] of Object.entries(source)) {
        const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const ends = endsOf(key, value);
        if (!ends || ends[0].toLowerCase() === ends[1].toLowerCase()) continue;
        const label = str(value.dynamic) || str(value.type) || str(value.current) || (typeof raw === 'string' ? raw.trim() : '');
        const back = edges.find(
            (edge) => edge.from.toLowerCase() === ends[1].toLowerCase() && edge.to.toLowerCase() === ends[0].toLowerCase()
        );
        if (back && (!label || !back.label || back.label.toLowerCase() === label.toLowerCase())) {
            back.mutual = true;
            back.label = back.label || label;
            continue;
        }
        if (edges.some((edge) => edge.from.toLowerCase() === ends[0].toLowerCase() && edge.to.toLowerCase() === ends[1].toLowerCase())) {
            continue;
        }
        edges.push({ from: ends[0], to: ends[1], label, mutual: false });
    }
    return edges;
}

/** The relationship web as Mermaid source, or '' when the story has no relationships. */
export function relationshipMermaid(story: RelationshipGraphStory | null | undefined): string {
    const edges = relationshipEdges(story);
    if (edges.length === 0) return '';
    const ids = new Map<string, string>();
    const names: string[] = [];
    const idOf = (name: string): string => {
        const key = name.toLowerCase();
        if (!ids.has(key)) {
            ids.set(key, `c${ids.size + 1}`);
            names.push(name);
        }
        return ids.get(key) as string;
    };
    // Cast order first, so the picture is laid out the way the cast page lists people.
    for (const member of story?.cast || []) {
        const name = str(member?.name);
        if (name && edges.some((e) => e.from.toLowerCase() === name.toLowerCase() || e.to.toLowerCase() === name.toLowerCase())) idOf(name);
    }
    const lines = edges.map((edge) => {
        const arrow = edge.mutual ? '<-->' : '-->';
        const label = mermaidLabel(edge.label);
        return `    ${idOf(edge.from)} ${arrow}${label ? `|"${label}"|` : ''} ${idOf(edge.to)}`;
    });
    const nodes = names.map((name) => `    ${idOf(name)}["${mermaidLabel(name, 80)}"]`);
    return ['flowchart LR', ...nodes, ...lines].join('\n') + '\n';
}
