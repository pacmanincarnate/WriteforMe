/**
 * @module services/storage/storyReset
 * Storage side of story resets: image cleanup after a stage reset, and the application-wide
 * erase. React-free; stores are passed in.
 */

import { STORAGE_KEYS } from '@/config';

interface PrefixImageStore {
    deleteImagesByPrefix(prefix: string): Promise<unknown>;
    deleteImage(id: string): Promise<void>;
}

/** Deletes a story's scene and beat images and the portraits of characters removed by a reset. */
export async function deleteStageResetImages(
    imageStore: PrefixImageStore,
    storyId: string,
    removedCharIds: ReadonlyArray<string>
): Promise<void> {
    await imageStore.deleteImagesByPrefix(`scene_${storyId}_`);
    await imageStore.deleteImagesByPrefix(`beat_${storyId}_`);
    for (const charId of removedCharIds) {
        await imageStore.deleteImage(`portrait_${storyId}_${charId}`);
    }
}

interface Clearable {
    clear(): Promise<unknown>;
}

export interface EraseAllStores {
    storyStore: Clearable & { saveStory(id: string, data: Record<string, unknown>): Promise<unknown> };
    imageStore: Clearable;
    audioStore?: Clearable | null;
    vectorStore?: Clearable | null;
}

/** localStorage keys that point at the open story and selection; removed by a factory reset. */
export const FACTORY_RESET_STORAGE_KEYS = [
    STORAGE_KEYS.story,
    STORAGE_KEYS.activeStoryId,
    STORAGE_KEYS.selectedAct,
    STORAGE_KEYS.selectedSequence,
    STORAGE_KEYS.selectedScene
] as const;

/**
 * Erases every story, image, saved audio file and vector-memory entry, then saves a blank
 * default story. Each store is attempted even if an earlier one fails; failures are logged.
 */
export async function eraseAllStoredData(
    stores: EraseAllStores,
    defaultStory: Record<string, unknown>
): Promise<void> {
    try {
        await stores.storyStore.clear();
        await stores.storyStore.saveStory('story_default', defaultStory);
    } catch (err) {
        console.warn('Failed to clear IndexedDB stories:', err);
    }
    try {
        await stores.imageStore.clear();
    } catch (err) {
        console.warn('Failed to clear IndexedDB images:', err);
    }
    try {
        if (stores.audioStore) await stores.audioStore.clear();
    } catch (err) {
        console.warn('Failed to clear IndexedDB audio store:', err);
    }
    if (stores.vectorStore) {
        try {
            await stores.vectorStore.clear();
        } catch (err) {
            console.warn('Failed to clear RAG vector store:', err);
        }
    }
}
