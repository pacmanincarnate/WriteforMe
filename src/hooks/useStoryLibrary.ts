/**
 * @module hooks/useStoryLibrary
 * Story Library state and actions (Phase 6E-3, persistence half): the story list with covers and
 * audio counts, search / view / sort preferences, and cover-style, duplicate and delete actions.
 * Multi-store work is done by `@/services/storage/storyLibrary`.
 */

import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import {
    audioStore,
    deleteStoryRecord,
    duplicateStoryRecord,
    generateStoryId,
    imageStore,
    listLibraryStories,
    loadLibraryExtras,
    logStore,
    pickMostRecentStory,
    storyStore,
    type LibraryStores,
    type StoryRecord
} from '@/services/storage';
import { safeLocalStorageSet } from '@/utils';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type LibraryStory = Record<string, unknown> & { id?: string; title?: string };

export const ACTIVE_STORY_ID_STORAGE_KEY = 'ellipsisprose_active_story_id';
export const LIBRARY_VIEW_MODE_STORAGE_KEY = 'ellipsisprose_library_view_mode';
export const LIBRARY_SORT_BY_STORAGE_KEY = 'ellipsisprose_library_sort_by';

export interface UseStoryLibraryParams<TStory extends LibraryStory = LibraryStory> {
    /** The story open in the editor, read at call time (latest value, not the render snapshot). */
    getActiveStory: () => TStory | null | undefined;
    setStory: (updaterOrValue: TStory | ((prev: TStory) => TStory)) => unknown;
    activeStoryId: string;
    setActiveStoryId: (id: string) => void;
    /** Current app view; the library reloads whenever it is shown. */
    view: string;
    /** Ids deleted this session, so late background saves do not resurrect them. */
    deletedStoryIdsRef: MutableRefObject<Set<string>>;
    showToast: (message: string, variant?: ToastVariant) => void;
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void | Promise<void>;
    }) => void;
    /** Test seam; defaults to the app's stores. */
    stores?: LibraryStores;
}

export interface UseStoryLibraryResult {
    libraryStories: StoryRecord[];
    setLibraryStories: Dispatch<SetStateAction<StoryRecord[]>>;
    libraryCovers: Record<string, string>;
    setLibraryCovers: Dispatch<SetStateAction<Record<string, string>>>;
    libraryAudioCounts: Record<string, number>;
    librarySearchQuery: string;
    setLibrarySearchQuery: Dispatch<SetStateAction<string>>;
    libraryViewMode: string;
    setLibraryViewMode: Dispatch<SetStateAction<string>>;
    librarySortBy: string;
    setLibrarySortBy: Dispatch<SetStateAction<string>>;
    refreshLibrary: () => Promise<void>;
    handleUpdateStoryCoverStyle: (storyId: string, nextStyleIdx: number) => Promise<void>;
    handleDuplicateStory: (storyItem: StoryRecord | null | undefined) => Promise<void>;
    handleDeleteLibraryStory: (
        storyItem: StoryRecord | null | undefined,
        event?: { stopPropagation: () => void } | null
    ) => Promise<void>;
}

const defaultStores: LibraryStores = { storyStore, imageStore, logStore, audioStore };
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useStoryLibrary<TStory extends LibraryStory = LibraryStory>({
    getActiveStory,
    setStory,
    activeStoryId,
    setActiveStoryId,
    view,
    deletedStoryIdsRef,
    showToast,
    requestConfirm,
    stores = defaultStores
}: UseStoryLibraryParams<TStory>): UseStoryLibraryResult {
    const [libraryStories, setLibraryStories] = useState<StoryRecord[]>([]);
    const [libraryCovers, setLibraryCovers] = useState<Record<string, string>>({});
    const [libraryAudioCounts, setLibraryAudioCounts] = useState<Record<string, number>>({});
    const [librarySearchQuery, setLibrarySearchQuery] = useState('');
    const [libraryViewMode, setLibraryViewMode] = useState(
        () => localStorage.getItem(LIBRARY_VIEW_MODE_STORAGE_KEY) || 'grid'
    );
    const [librarySortBy, setLibrarySortBy] = useState(
        () => localStorage.getItem(LIBRARY_SORT_BY_STORAGE_KEY) || 'recent'
    );

    const refreshLibrary = async (): Promise<void> => {
        try {
            const list = await listLibraryStories(stores, getActiveStory());
            // Show the list first; covers and audio counts follow.
            setLibraryStories(list);
            const { covers, audioCounts } = await loadLibraryExtras(stores, list);
            setLibraryCovers(covers);
            setLibraryAudioCounts(audioCounts);
        } catch (e) {
            console.warn('Failed to update library list:', e);
        }
    };

    useEffect(() => {
        if (view === 'library') {
            void refreshLibrary();
        }
        // Deliberately keyed on view and story switches only.
    }, [view, activeStoryId]);

    useEffect(() => {
        safeLocalStorageSet(LIBRARY_VIEW_MODE_STORAGE_KEY, libraryViewMode);
    }, [libraryViewMode]);

    useEffect(() => {
        safeLocalStorageSet(LIBRARY_SORT_BY_STORAGE_KEY, librarySortBy);
    }, [librarySortBy]);

    /** Cycles the typographic cover style used when a story has no cover image. */
    const handleUpdateStoryCoverStyle = async (storyId: string, nextStyleIdx: number): Promise<void> => {
        try {
            const fullStory = await stores.storyStore.loadStory(storyId);
            if (fullStory) {
                fullStory.coverStyle = nextStyleIdx;
                await stores.storyStore.saveStory(storyId, fullStory);
                if (activeStoryId === storyId) {
                    setStory((prev) => ({ ...prev, coverStyle: nextStyleIdx }));
                }
                await refreshLibrary();
            }
        } catch (e) {
            console.error('Failed to update cover style', e);
        }
    };

    const handleDuplicateStory: UseStoryLibraryResult['handleDuplicateStory'] = async (storyItem) => {
        if (!storyItem || !storyItem.data) return;
        try {
            const cloned = await duplicateStoryRecord(stores, storyItem, generateStoryId());
            await refreshLibrary();
            showToast(`Duplicated as "${cloned.title}"`, 'success');
        } catch (err) {
            console.error('Failed to duplicate story:', err);
            showToast('Failed to duplicate story: ' + errorMessage(err), 'error');
        }
    };

    const handleDeleteLibraryStory: UseStoryLibraryResult['handleDeleteLibraryStory'] = async (
        storyItem,
        event
    ) => {
        if (event) event.stopPropagation();
        if (!storyItem || !storyItem.id) return;
        const storyTitle = (storyItem.data?.title as string | undefined) || 'Untitled Story';

        requestConfirm({
            title: `Permanently delete "${storyTitle}"?`,
            message:
                "This will erase this story's configuration, characters, outline, and generated prose from your library. This action cannot be undone.",
            confirmLabel: 'Delete Story',
            danger: true,
            onConfirm: async () => {
                try {
                    const deletedId = storyItem.id;
                    deletedStoryIdsRef.current.add(deletedId);
                    await deleteStoryRecord(stores, deletedId);

                    if (activeStoryId === deletedId) {
                        // The open story is gone: open the most recent remaining one, or a blank story.
                        const nextStory = pickMostRecentStory(await stores.storyStore.listStories(), deletedId);
                        if (nextStory) {
                            setActiveStoryId(nextStory.id);
                            setStory(nextStory.data as TStory);
                            localStorage.setItem(ACTIVE_STORY_ID_STORAGE_KEY, nextStory.id);
                        } else {
                            const defaultTemplate = createDefaultStoryTemplate('story_default');
                            setActiveStoryId('story_default');
                            setStory(defaultTemplate as unknown as TStory);
                            localStorage.setItem(ACTIVE_STORY_ID_STORAGE_KEY, 'story_default');
                            await stores.storyStore.saveStory(
                                'story_default',
                                defaultTemplate as unknown as Record<string, unknown>
                            );
                        }
                    }

                    await refreshLibrary();
                    showToast(`Deleted "${storyTitle}"`, 'success');
                } catch (err) {
                    console.error('Failed to delete story:', err);
                    showToast('Failed to delete story: ' + errorMessage(err), 'error');
                }
            }
        });
    };

    return {
        libraryStories,
        setLibraryStories,
        libraryCovers,
        setLibraryCovers,
        libraryAudioCounts,
        librarySearchQuery,
        setLibrarySearchQuery,
        libraryViewMode,
        setLibraryViewMode,
        librarySortBy,
        setLibrarySortBy,
        refreshLibrary,
        handleUpdateStoryCoverStyle,
        handleDuplicateStory,
        handleDeleteLibraryStory
    };
}
