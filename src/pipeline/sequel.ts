/**
 * @module pipeline/sequel
 * Starts the next book of a series from a finished (or partly drafted) story: writes the recap,
 * builds the new story document from what carries over, makes it the active story and runs the
 * normal bible initialization on it.
 */

import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import { buildSequelSeed, createSeriesOpener, isSeriesStory } from '@/domain/series';
import type { Story } from '@/types';
import { asString, type PipelineRuntimeContext, type PipelineStory } from './context';
import { activateCreatedStory, initStory } from './initStory';
import { generateBookRecap } from './series';

export interface StartNextBookInput {
    title?: string;
    concept: string;
    authorNote?: string;
    /** Used as the series title when the source story is not part of a series yet. */
    seriesTitle?: string;
}

/**
 * Creates the next book and generates its story bible. Returns the new story, or undefined when
 * there is no concept or no saved source story.
 */
export async function startNextBook(
    ctx: PipelineRuntimeContext,
    input: StartNextBookInput,
    isAutopilot = false
): Promise<PipelineStory | undefined> {
    const concept = asString(input?.concept).trim();
    let source = ctx.getStory();
    const sourceId = asString(source?.id);
    if (!concept || !sourceId || sourceId === 'story_default') return undefined;

    // A standalone story becomes Book 1 the moment a sequel is started from it.
    if (!isSeriesStory(source as Partial<Story>)) {
        const header = createSeriesOpener(asString(input.seriesTitle), asString(source.title));
        const patched = await ctx.updateStoryById(sourceId, (prev) => ({
            ...prev,
            series: header,
            open_threads: Array.isArray(prev.open_threads) ? prev.open_threads : []
        }));
        source = patched || { ...source, series: header };
    }

    ctx.setLoadingStep('Writing the recap of the previous book...');
    const recap = await generateBookRecap(ctx, source);

    const newStoryId = `story_${Date.now()}`;
    const seed = buildSequelSeed(
        source as Partial<Story>,
        { newStoryId, title: asString(input.title), concept, recap, authorNote: input.authorNote },
        createDefaultStoryTemplate(newStoryId) as unknown as Record<string, unknown>
    ) as PipelineStory;

    await activateCreatedStory(ctx, newStoryId, seed);
    ctx.setWorldPrimer(asString(seed.world_primer) || null);
    ctx.refreshLibrary?.().catch((err) => {
        console.warn('Failed refreshing library after starting the next book:', err);
    });
    return initStory(ctx, isAutopilot, { existingStory: seed });
}
