/**
 * @module domain/lifecycle/resetEffects
 * What the UI has to adjust after a story stage reset: which view to leave, and which loaded
 * images to forget.
 */

import type { RollbackFlags } from './rollback';

const VIEWS_NEEDING_SCENES = ['writer', 'chapter_dashboard', 'reader'];
const VIEWS_NEEDING_SEQUENCES = ['sequence_dashboard', 'chapter_dashboard', 'writer', 'reader'];
const VIEWS_NEEDING_ACTS = ['sequence_dashboard', 'chapter_dashboard', 'writer', 'reader', 'editorial'];

/**
 * The view to switch to after a reset, or null to stay. A view whose content was just deleted
 * falls back to the structure view; the reader, with nothing left to read, to the dashboard.
 */
export function viewAfterStageReset(
    currentView: string,
    flags: Pick<RollbackFlags, 'clearScenes' | 'clearSequences' | 'clearActs'>
): string | null {
    if (flags.clearScenes && VIEWS_NEEDING_SCENES.includes(currentView)) return 'structure';
    if (flags.clearSequences && VIEWS_NEEDING_SEQUENCES.includes(currentView)) return 'structure';
    if (flags.clearActs && VIEWS_NEEDING_ACTS.includes(currentView)) return 'structure';
    if (currentView === 'reader') return 'dashboard';
    return null;
}

export interface LoadedStoryImages {
    cover?: string | null;
    portraits?: Record<string, unknown>;
    [key: string]: unknown;
}

/**
 * Loaded images to keep after a reset: the cover (if one was loaded) and the portraits of
 * characters that still exist. Scene and beat images are dropped.
 */
export function loadedImagesAfterStageReset(
    loaded: LoadedStoryImages | null | undefined,
    removedCharIds: ReadonlyArray<string>
): LoadedStoryImages {
    const portraits = { ...(loaded?.portraits || {}) };
    removedCharIds.forEach((charId) => {
        delete portraits[charId];
    });
    return { ...(loaded?.cover !== undefined ? { cover: loaded.cover } : {}), portraits };
}
