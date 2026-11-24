/**
 * @module domain/lifecycle/templates
 * Default story document factory for newly initialized or fallback projects.
 */

import { initEpistemicGraph, type EpistemicGraph } from '@/domain/continuity';

export interface DefaultStoryTemplate extends Record<string, unknown> {
    id: string;
    title: string;
    world_primer: string | null;
    writing_mode: string;
    book_type: string;
    target_word_count: number;
    length_control: { sequences: Record<string, unknown> };
    concept: string;
    story_so_far: string;
    status_quo: string;
    inciting_incident: string;
    themes: string;
    style: { genre: string; mood: string; writing_guide: string };
    threads: unknown[];
    lore: unknown[];
    cast: unknown[];
    acts: unknown[];
    sequences: unknown[];
    scenes: Record<string, unknown[]>;
    beats: Record<string, unknown[]>;
    prose: Record<string, unknown>;
    continuity_ledger: unknown[];
    relationships: Record<string, unknown>;
    graph_edges: unknown[];
    knowledge_graph: { nodes: unknown[]; edges: unknown[] };
    secret_vault: unknown[];
    epistemic_graph: EpistemicGraph;
    editorial_harness: unknown | null;
    slop_allowlist: unknown[];
    event_log: unknown[];
    generation_ranges: {
        scenes_per_sequence: {
            min: number;
            max: number;
            justification: string;
        };
    };
}

/** Creates a blank canonical 8-sequence story object initialized with an empty GESM graph. */
export function createDefaultStoryTemplate(id = 'story_default'): DefaultStoryTemplate {
    return {
        id: id || 'story_default',
        title: 'Untitled Story',
        world_primer: null,
        writing_mode: 'novel',
        book_type: 'popular',
        target_word_count: 80000,
        length_control: { sequences: {} },
        concept: '',
        story_so_far: '',
        status_quo: '',
        inciting_incident: '',
        themes: '',
        style: { genre: '', mood: '', writing_guide: '' },
        threads: [],
        lore: [],
        cast: [],
        acts: [],
        sequences: [],
        scenes: {},
        beats: {},
        prose: {},
        continuity_ledger: [],
        relationships: {},
        graph_edges: [],
        knowledge_graph: { nodes: [], edges: [] },
        secret_vault: [],
        epistemic_graph: initEpistemicGraph(),
        editorial_harness: null,
        slop_allowlist: [],
        event_log: [],
        generation_ranges: {
            scenes_per_sequence: {
                min: 3,
                max: 10,
                justification: 'Calibrated for Popular novel format (80,000 words).'
            }
        }
    };
}
