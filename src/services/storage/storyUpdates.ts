/**
 * @module services/storage/storyUpdates
 * Updating a story by id whether or not it is the one open in the editor. Background work
 * (a story still initialising while the user has opened another) uses this so it never writes
 * into the wrong story.
 */

type StoryData = Record<string, unknown> & { id?: string };

export type StoryUpdate<TStory extends StoryData> = Partial<TStory> | ((base: TStory) => TStory);

export interface StoryUpdateDeps<TStory extends StoryData> {
    /** Ids deleted this session; updates for them are dropped so they are not resurrected. */
    deletedStoryIds: ReadonlySet<string>;
    /** The story open in the editor right now. */
    getActiveStory: () => TStory | null | undefined;
    /** Applies an update to the open story and returns the result. */
    setStory: (updater: (prev: TStory) => TStory) => TStory;
    /** Latest known state of stories updated in the background, by id. */
    snapshots: Record<string, TStory>;
    store: {
        loadStory: (id: string) => Promise<Record<string, unknown> | null>;
        saveStory: (id: string, story: Record<string, unknown>) => Promise<unknown>;
    };
    createDefaultStory: (id: string) => TStory;
}

/**
 * Applies a patch or updater to story `targetStoryId` and saves it. The open story is updated
 * through app state; any other story is updated from its snapshot (or storage, or a blank
 * template) without touching the open one. Returns the updated story, or null when the id is
 * empty or was deleted.
 */
export async function updateStoryRecordById<TStory extends StoryData>(
    deps: StoryUpdateDeps<TStory>,
    targetStoryId: string | null | undefined,
    updaterOrPatch: StoryUpdate<TStory>
): Promise<TStory | null> {
    if (!targetStoryId || deps.deletedStoryIds.has(targetStoryId)) return null;
    const applyUpdate = (base: TStory): TStory =>
        typeof updaterOrPatch === 'function' ? updaterOrPatch(base) : { ...base, ...updaterOrPatch };

    let nextStory: TStory | null;
    if (deps.getActiveStory()?.id === targetStoryId) {
        nextStory = deps.setStory((prev) => {
            const base =
                prev && prev.id === targetStoryId
                    ? prev
                    : deps.snapshots[targetStoryId] || deps.createDefaultStory(targetStoryId);
            const updated = applyUpdate(base);
            deps.snapshots[targetStoryId] = updated;
            return updated;
        });
    } else {
        const base =
            deps.snapshots[targetStoryId] ||
            ((await deps.store.loadStory(targetStoryId)) as TStory | null) ||
            deps.createDefaultStory(targetStoryId);
        nextStory = applyUpdate(base);
        deps.snapshots[targetStoryId] = nextStory;
    }

    // Re-check: the story may have been deleted while it was being loaded.
    if (nextStory && nextStory.id && !deps.deletedStoryIds.has(targetStoryId)) {
        await deps.store.saveStory(targetStoryId, nextStory).catch((err) => {
            console.warn(`[updateStoryById] Failed saving story '${targetStoryId}':`, err);
        });
    }
    return nextStory;
}
