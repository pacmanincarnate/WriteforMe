/**
 * @module domain/lifecycle/hydration
 * Turning a stored story record into the story the app works with: migration to the current
 * shape, defaults for fields older saves lack, and the choice of which story to open at startup.
 */

import { inferNarrativeModeForScene, LEGACY_STORY_RECORD_ID } from '@/config';
import { ensureEpistemicGraph, type ContinuityStoryState } from '@/domain/continuity';
import { computeStoryProgressMetrics } from '@/domain/story';
import { migrateStoryToSequences } from './migration';

type StoredStory = Record<string, unknown>;

interface StoredSceneLike {
    valence?: unknown;
    end_valence?: unknown;
    dominant_narrative_mode?: string;
    [key: string]: unknown;
}

export interface StoryRecordLike {
    id: string;
    data?: StoredStory | null;
    timestamp?: number;
}

/**
 * Fills per-scene fields older saves lack: `valence` (from `end_valence`) and a narrative mode
 * inferred from the scene's content when it has none or only the neutral baseline. Mutates the
 * scenes in place.
 */
export function backfillSceneDefaults(story: { scenes?: unknown } | null | undefined): void {
    const scenes = story?.scenes as Record<string, unknown> | undefined;
    if (!scenes) return;
    Object.keys(scenes).forEach((seqKey) => {
        const list = scenes[seqKey];
        if (!Array.isArray(list)) return;
        (list as StoredSceneLike[]).forEach((scene) => {
            if (scene.valence === undefined) {
                scene.valence = parseInt(String(scene.end_valence), 10) || 0;
            }
            if (!scene.dominant_narrative_mode || scene.dominant_narrative_mode === 'BASELINE_NEUTRAL') {
                const inferred = inferNarrativeModeForScene(scene as Parameters<typeof inferNarrativeModeForScene>[0]);
                if (inferred && inferred !== 'BASELINE_NEUTRAL') {
                    scene.dominant_narrative_mode = inferred;
                }
            }
        });
    });
}

const listOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export interface HydratedStory {
    /** The story to put in app state. */
    story: StoredStory;
    worldPrimer: unknown;
    /** The migrated record before defaults were layered on (its `lore` drives the RAG sync). */
    migrated: StoredStory;
}

/**
 * Prepares the stored story for `id` to become the open story: migrate, backfill scene defaults,
 * guarantee the collection fields exist and build the epistemic graph.
 */
export function hydrateStoredStory(stored: StoredStory, id: string): HydratedStory {
    const migrated = migrateStoryToSequences(stored);
    backfillSceneDefaults(migrated);
    const worldPrimer = stored.world_primer || migrated?.world_primer || null;
    return {
        migrated,
        worldPrimer,
        story: {
            relationships: {},
            graph_edges: [],
            ...migrated,
            world_primer: worldPrimer,
            continuity_ledger: listOrEmpty(migrated?.continuity_ledger),
            secret_vault: listOrEmpty(migrated?.secret_vault),
            epistemic_graph: ensureEpistemicGraph(migrated as ContinuityStoryState),
            id
        }
    };
}

/**
 * Prepares a fallback record chosen at startup (the saved active id no longer exists). Unlike
 * `hydrateStoredStory` this does not backfill scene defaults, and the epistemic graph is built
 * from the stored data rather than the migrated copy, as the startup path always has.
 */
export function hydrateFallbackStory(record: StoryRecordLike): HydratedStory {
    const data = record.data || {};
    const migrated = migrateStoryToSequences(data);
    const worldPrimer = record.data?.world_primer || migrated?.world_primer || null;
    return {
        migrated,
        worldPrimer,
        story: {
            relationships: {},
            graph_edges: [],
            ...migrated,
            world_primer: worldPrimer,
            continuity_ledger: listOrEmpty(migrated?.continuity_ledger),
            secret_vault: listOrEmpty(migrated?.secret_vault),
            epistemic_graph: ensureEpistemicGraph((record.data || migrated) as ContinuityStoryState),
            id: record.id
        }
    };
}

/**
 * Prepares a story picked in the library. Its epistemic graph and world primer are left as
 * stored; the regular load that follows the switch fills them in.
 */
export function prepareLibraryStorySelection(data: StoredStory, id: string): StoredStory {
    const migrated = migrateStoryToSequences(data);
    return {
        relationships: {},
        graph_edges: [],
        ...migrated,
        continuity_ledger: listOrEmpty(migrated?.continuity_ledger),
        secret_vault: listOrEmpty(migrated?.secret_vault),
        id
    };
}

const hasProgress = (data: StoredStory | null | undefined): boolean =>
    Boolean(data) && computeStoryProgressMetrics(data).score > 0;
const newestFirst = (a: StoryRecordLike, b: StoryRecordLike): number => (b.timestamp || 0) - (a.timestamp || 0);

/** True when the saved active story is missing or blank, so startup should look for a better one. */
export function isBlankStory(data: StoredStory | null | undefined): boolean {
    return !data || computeStoryProgressMetrics(data).score === 0;
}

/** The most recently saved story that has any content, or null. */
export function pickRecoverableStory(records: ReadonlyArray<StoryRecordLike>): StoryRecordLike | null {
    const nonEmpty = records.filter((s) => s.id !== LEGACY_STORY_RECORD_ID && hasProgress(s.data)).sort(newestFirst);
    return nonEmpty[0] || null;
}

/**
 * The story to open when the saved active id does not exist: the newest story with content,
 * else the newest story of any kind, else null (first run).
 */
export function pickStartupFallbackStory(records: ReadonlyArray<StoryRecordLike>): StoryRecordLike | null {
    const valid = records.filter((s) => s.id !== LEGACY_STORY_RECORD_ID);
    if (!valid.length) return null;
    const nonEmpty = valid.filter((s) => hasProgress(s.data));
    const pool = nonEmpty.length > 0 ? nonEmpty : valid;
    return [...pool].sort(newestFirst)[0];
}
