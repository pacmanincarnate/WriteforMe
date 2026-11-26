/**
 * @module services/storage/storyLibrary
 * Story Library operations that span several stores: listing with covers and audio counts,
 * duplicating a story with its images and audio, and deleting a story with everything attached.
 * React-free; the stores are passed in so the functions can be tested without IndexedDB.
 */

import type { StoryRecord } from './storyStore';

type StoryData = Record<string, unknown> & { id?: string; title?: string };

interface SceneAudioLike {
    seqIdx: number;
    sceneIdx: number;
    blob: Blob;
    mimeType?: string;
    durationSec?: number;
    textHash?: string;
    cueCount?: number;
}

interface SequenceAudioLike {
    seqIdx: number;
    blob: Blob;
    mimeType?: string;
    durationSec?: number;
    includedSceneIndices?: number[];
    totalScenesInStructure?: number;
    sceneHashes?: unknown;
}

export interface LibraryStores {
    storyStore: {
        listStories(): Promise<StoryRecord[]>;
        loadStory(id: string): Promise<Record<string, unknown> | null>;
        saveStory(id: string, data: Record<string, unknown>): Promise<unknown>;
        deleteStory(id: string): Promise<void>;
    };
    imageStore: {
        getImage(id: string): Promise<string | null>;
        saveImage(id: string, dataUrl: string): Promise<void>;
        deleteImage(id: string): Promise<void>;
        getImagesByPrefix(prefix: string): Promise<Array<{ id: string; dataUrl?: string | null } | null>>;
    };
    logStore: { clearLogs(storyId: string): Promise<void> };
    /** Optional: the library still works when offline audio storage is unavailable. */
    audioStore?: {
        countStoryAudio?(storyId: string): Promise<number>;
        getAllStoryAudioRecords(storyId: string): Promise<SceneAudioLike[]>;
        saveSceneAudio(config: SceneAudioLike & { storyId: string }): Promise<unknown>;
        getAllStorySequenceAudioRecords?(storyId: string): Promise<SequenceAudioLike[]>;
        saveSequenceAudio(config: SequenceAudioLike & { storyId: string }): Promise<unknown>;
        deleteStoryAudio(storyId: string): Promise<void>;
    } | null;
}

import { LEGACY_STORY_RECORD_ID } from '@/config';

/** Legacy single-story record id from before the library existed; never shown. */
export { LEGACY_STORY_RECORD_ID };

/**
 * Lists saved stories for the library. The story open in the editor is always included, with its
 * in-memory data, so unsaved edits show up. A failing story database yields just that story.
 */
export async function listLibraryStories(
    stores: Pick<LibraryStores, 'storyStore'>,
    activeStory: StoryData | null | undefined,
    now: () => number = Date.now
): Promise<StoryRecord[]> {
    let list: StoryRecord[] = [];
    try {
        list = await stores.storyStore.listStories();
    } catch (idbErr) {
        console.warn('Failed to read from IndexedDB, falling back to active story.', idbErr);
    }
    const filtered = list.filter((s) => s.id !== LEGACY_STORY_RECORD_ID);
    if (activeStory && activeStory.id) {
        const existing = filtered.find((s) => s.id === activeStory.id);
        if (existing) existing.data = activeStory;
        else filtered.push({ id: activeStory.id, data: activeStory, timestamp: now() });
    }
    return filtered;
}

/** Cover images and saved-audio scene counts for the listed stories. Failures skip that story. */
export async function loadLibraryExtras(
    stores: Pick<LibraryStores, 'imageStore' | 'audioStore'>,
    stories: ReadonlyArray<{ id: string }>
): Promise<{ covers: Record<string, string>; audioCounts: Record<string, number> }> {
    const covers: Record<string, string> = {};
    const audioCounts: Record<string, number> = {};
    for (const item of stories) {
        try {
            const coverData = await stores.imageStore.getImage(`cover_${item.id}`);
            if (coverData) covers[item.id] = coverData;
        } catch (err) {
            console.warn('Failed to load cover for', item.id, err);
        }
        if (stores.audioStore && typeof stores.audioStore.countStoryAudio === 'function') {
            try {
                audioCounts[item.id] = await stores.audioStore.countStoryAudio(item.id);
            } catch (err) {
                console.warn('Failed to count saved audio for', item.id, err);
            }
        }
    }
    return { covers, audioCounts };
}

export function generateStoryId(now: () => number = Date.now, random: () => number = Math.random): string {
    return `story_${now()}_${random().toString(36).substring(2, 7)}`;
}

/**
 * Saves a deep copy of a story under `newId`, titled "<title> (Copy)", and copies its cover,
 * portraits and saved audio. Image and audio copy failures are logged and do not fail the
 * duplication. Returns the copy.
 */
export async function duplicateStoryRecord(
    stores: LibraryStores,
    storyItem: { id: string; data: StoryData },
    newId: string
): Promise<StoryData> {
    const cloned = JSON.parse(JSON.stringify(storyItem.data)) as StoryData;
    cloned.id = newId;
    cloned.title = `${cloned.title || 'Untitled'} (Copy)`;
    await stores.storyStore.saveStory(newId, cloned);

    try {
        const existingCover = await stores.imageStore.getImage(`cover_${storyItem.id}`);
        if (existingCover) await stores.imageStore.saveImage(`cover_${newId}`, existingCover);
        const portraitPrefix = `portrait_${storyItem.id}_`;
        const sourcePortraits = await stores.imageStore.getImagesByPrefix(portraitPrefix);
        for (const p of sourcePortraits) {
            if (p && p.dataUrl) {
                const charSuffix = p.id.slice(portraitPrefix.length);
                await stores.imageStore.saveImage(`portrait_${newId}_${charSuffix}`, p.dataUrl);
            }
        }
    } catch (coverErr) {
        console.warn('Cover/portrait copy skipped:', coverErr);
    }

    try {
        const audio = stores.audioStore;
        if (audio) {
            const audioRecords = await audio.getAllStoryAudioRecords(storyItem.id);
            for (const rec of audioRecords) {
                await audio.saveSceneAudio({
                    storyId: newId,
                    seqIdx: rec.seqIdx,
                    sceneIdx: rec.sceneIdx,
                    blob: rec.blob,
                    mimeType: rec.mimeType,
                    durationSec: rec.durationSec,
                    textHash: rec.textHash,
                    cueCount: rec.cueCount
                });
            }
            if (typeof audio.getAllStorySequenceAudioRecords === 'function') {
                const seqAudioRecords = await audio.getAllStorySequenceAudioRecords(storyItem.id);
                for (const srec of seqAudioRecords) {
                    await audio.saveSequenceAudio({
                        storyId: newId,
                        seqIdx: srec.seqIdx,
                        blob: srec.blob,
                        mimeType: srec.mimeType,
                        durationSec: srec.durationSec,
                        includedSceneIndices: srec.includedSceneIndices,
                        totalScenesInStructure: srec.totalScenesInStructure,
                        sceneHashes: srec.sceneHashes
                    });
                }
            }
        }
    } catch (audioCopyErr) {
        console.warn('Audio copy skipped on story duplication:', audioCopyErr);
    }

    return cloned;
}

/** Deletes a story with its logs, cover and saved audio. Cover and audio failures are logged. */
export async function deleteStoryRecord(stores: LibraryStores, storyId: string): Promise<void> {
    await stores.storyStore.deleteStory(storyId);
    await stores.logStore.clearLogs(storyId);
    try {
        await stores.imageStore.deleteImage(`cover_${storyId}`);
    } catch (imgErr) {
        console.warn('Cover deletion skipped:', imgErr);
    }
    try {
        if (stores.audioStore) await stores.audioStore.deleteStoryAudio(storyId);
    } catch (audioDelErr) {
        console.warn('Story audio deletion skipped:', audioDelErr);
    }
}

/** The most recently saved story other than `deletedId`, to open after the active one is deleted. */
export function pickMostRecentStory(
    stories: ReadonlyArray<StoryRecord>,
    deletedId: string
): StoryRecord | null {
    const remaining = stories.filter((s) => s.id !== LEGACY_STORY_RECORD_ID && s.id !== deletedId);
    if (!remaining.length) return null;
    return [...remaining].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
}
