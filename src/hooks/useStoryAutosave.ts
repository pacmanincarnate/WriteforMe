/**
 * @module hooks/useStoryAutosave
 * Saves the open story whenever it changes (Phase 6E-3, persistence half), and gives a story
 * without an id a fresh one. Saving waits until the story has been loaded from storage, so a
 * blank template can never overwrite a stored story during startup or a story switch.
 */

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { generateStoryId, storyStore } from '@/services/storage';

type SavedStory = Record<string, unknown> & { id?: string };

export interface UseStoryAutosaveParams<TStory extends SavedStory = SavedStory> {
    story: TStory;
    activeStoryId: string;
    hasHydratedStoryRef: MutableRefObject<boolean>;
    /** Test seam; defaults to the app's story store. */
    store?: { saveStory: (id: string, story: Record<string, unknown>) => Promise<unknown> };
}

/** Whether the open story may be written to storage right now. */
export function shouldAutosaveStory(
    story: SavedStory | null | undefined,
    activeStoryId: string | null | undefined,
    hasHydrated: boolean
): boolean {
    if (!hasHydrated) return false;
    // Mid-switch the story in state still belongs to the previous id; never save it under the new one.
    return Boolean(story && story.id && activeStoryId && story.id === activeStoryId);
}

export function useStoryAutosave<TStory extends SavedStory = SavedStory>({
    story,
    activeStoryId,
    hasHydratedStoryRef,
    store = storyStore
}: UseStoryAutosaveParams<TStory>): void {
    // Story persistence solely via IndexedDB (handles gigabytes, no quota limits, non-blocking).
    useEffect(() => {
        if (!shouldAutosaveStory(story, activeStoryId, hasHydratedStoryRef.current)) return;
        store.saveStory(story.id as string, story).catch((err) => {
            console.warn('IndexedDB story save failed:', err);
        });
    }, [story, activeStoryId]);
}

/** Gives a story that somehow has no id a new one, and makes it the active story. */
export function useEnsureStoryId<TStory extends SavedStory = SavedStory>({
    story,
    setActiveStoryId,
    setStory
}: {
    story: TStory;
    setActiveStoryId: (id: string) => void;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
}): void {
    useEffect(() => {
        if (story && !story.id) {
            const newId = generateStoryId();
            setActiveStoryId(newId);
            setStory((prev) => (prev && prev.id ? prev : { ...prev, id: newId }));
        }
    }, [story]);
}
