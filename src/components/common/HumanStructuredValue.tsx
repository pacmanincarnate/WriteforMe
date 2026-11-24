/**
 * @module components/common/HumanStructuredValue
 * Recursive human-readable renderer for arbitrary structured JSON/object values.
 */

export interface HumanStructuredValueProps {
    value: unknown;
}

const LABEL_MAP: Readonly<Record<string, string>> = {
    subtext_vector: 'Subtext',
    surface_action: 'Surface Action',
    allowed_knowledge: 'What They Know',
    forbidden_knowledge: 'Kept in the Dark',
    secret_intent: 'Hidden Motivation',
    cognitive_bias: 'Perceptual Bias',
    tone: 'Tone',
    diction: 'Diction',
    habits: 'Habits',
    speech_acts: 'Speech Acts',
    sensory_anchors: 'Sensory Filters',
    anchors: 'Sensory Filters',
    subtext: 'Subtext'
};

export function HumanStructuredValue({ value }: HumanStructuredValueProps) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return <span>{String(value)}</span>;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="italic text-ink-400">None</span>;
        return (
            <ul className="list-disc list-inside space-y-1">
                {value.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                        <HumanStructuredValue value={item} />
                    </li>
                ))}
            </ul>
        );
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return <span className="italic text-ink-400">Empty</span>;
        return (
            <div className="space-y-1.5">
                {entries.map(([k, v]) => (
                    <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-1 text-xs">
                        <span className="font-semibold text-ink-700 capitalize shrink-0 font-sans">
                            {LABEL_MAP[k] || k.replace(/_/g, ' ')}:
                        </span>
                        <span className="text-ink-900 font-sans">
                            <HumanStructuredValue value={v} />
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return <span>{String(value)}</span>;
}
