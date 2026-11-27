/**
 * @module pipeline/restorePoint
 * Takes a restore point of the open story just before a pipeline step rewrites part of it,
 * so that step can be undone from Settings. Never throws and never blocks the step for long.
 */

import { restorePointStore } from '@/services/storage';
import type { PipelineRuntimeContext, PipelineStory } from './context';

/** Saves the story as it is now under `label` ("Before rewriting Scene 2.3"). */
export async function markRestorePoint(
    ctx: PipelineRuntimeContext,
    label: string,
    story?: PipelineStory | null
): Promise<void> {
    try {
        const current = story || ctx.getStory();
        const id = typeof current?.id === 'string' ? current.id : '';
        if (!id) return;
        await restorePointStore.add(id, current as Record<string, unknown>, 'before', label);
    } catch (err) {
        console.warn('[RestorePoints] Skipped a restore point:', err);
    }
}
