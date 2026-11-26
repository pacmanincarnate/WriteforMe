/**
 * @module stores/useStoryStore
 * Zustand store managing the active story state, bookshelf metadata, loaded image caches,
 * world primer, and RAG indexing status.
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/config';
import { createDefaultStoryTemplate, type DefaultStoryTemplate } from '@/domain/lifecycle';
import { readStorageString, writeStorageValue } from './storageHelpers';

export type ActiveStoryDocument = DefaultStoryTemplate | Record<string, unknown>;

export interface LibraryStorySummary {
    id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

export interface StoryStoreState {
    activeStoryId: string;
    story: ActiveStoryDocument;
    libraryStories: LibraryStorySummary[];
    libraryCovers: Record<string, string>;
    libraryAudioCounts: Record<string, number>;
    hasHydratedStory: boolean;
    initializingStoryId: string | null;
    loadedImages: Record<string, string | null>;
    portraitReload: number;
    worldPrimer: string | null;
    ragStatus: string;
    isRebuildingRag: boolean;
}

export interface StoryStoreActions {
    setActiveStoryId: (
        nextOrUpdater: string | ((prev: string) => string)
    ) => void;
    setStory: (
        updaterOrValue:
            | ActiveStoryDocument
            | ((prev: ActiveStoryDocument) => ActiveStoryDocument)
    ) => ActiveStoryDocument;
    setLibraryStories: (
        nextOrUpdater:
            | LibraryStorySummary[]
            | ((prev: LibraryStorySummary[]) => LibraryStorySummary[])
    ) => void;
    setLibraryCovers: (
        nextOrUpdater:
            | Record<string, string>
            | ((prev: Record<string, string>) => Record<string, string>)
    ) => void;
    setLibraryAudioCounts: (
        nextOrUpdater:
            | Record<string, number>
            | ((prev: Record<string, number>) => Record<string, number>)
    ) => void;
    setHasHydratedStory: (hydrated: boolean) => void;
    setInitializingStoryId: (id: string | null) => void;
    setLoadedImages: (
        nextOrUpdater:
            | Record<string, string | null>
            | ((prev: Record<string, string | null>) => Record<string, string | null>)
    ) => void;
    bumpPortraitReload: () => void;
    setWorldPrimer: (primer: string | null) => void;
    setRagStatus: (status: string) => void;
    setIsRebuildingRag: (rebuilding: boolean) => void;
    hydrateFromStorage: () => void;
}

export type StoryStore = StoryStoreState & StoryStoreActions;

function readInitialStoryId(): string {
    return readStorageString(STORAGE_KEYS.activeStoryId, 'story_default') || 'story_default';
}

export const useStoryStore = create<StoryStore>((set, get) => {
    const initialStoryId = readInitialStoryId();
    return {
        activeStoryId: initialStoryId,
        story: createDefaultStoryTemplate(initialStoryId),
        libraryStories: [],
        libraryCovers: {},
        libraryAudioCounts: {},
        hasHydratedStory: false,
        initializingStoryId: null,
        loadedImages: {},
        portraitReload: 0,
        worldPrimer: null,
        ragStatus: 'idle',
        isRebuildingRag: false,

        setActiveStoryId: (nextOrUpdater) => {
            const next =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(get().activeStoryId)
                    : nextOrUpdater;
            set({ activeStoryId: next });
            writeStorageValue(STORAGE_KEYS.activeStoryId, next);
        },

        setStory: (updaterOrValue) => {
            const prev = get().story;
            const next =
                typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
            set({ story: next });
            return next;
        },

        setLibraryStories: (nextOrUpdater) => {
            const next =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(get().libraryStories)
                    : nextOrUpdater;
            set({ libraryStories: next });
        },

        setLibraryCovers: (nextOrUpdater) => {
            const next =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(get().libraryCovers)
                    : nextOrUpdater;
            set({ libraryCovers: next });
        },

        setLibraryAudioCounts: (nextOrUpdater) => {
            const next =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(get().libraryAudioCounts)
                    : nextOrUpdater;
            set({ libraryAudioCounts: next });
        },

        setHasHydratedStory: (hydrated) => set({ hasHydratedStory: hydrated }),
        setInitializingStoryId: (id) => set({ initializingStoryId: id }),

        setLoadedImages: (nextOrUpdater) => {
            const next =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(get().loadedImages)
                    : nextOrUpdater;
            set({ loadedImages: next });
        },

        bumpPortraitReload: () => set((state) => ({ portraitReload: state.portraitReload + 1 })),
        setWorldPrimer: (primer) => set({ worldPrimer: primer }),
        setRagStatus: (status) => set({ ragStatus: status }),
        setIsRebuildingRag: (rebuilding) => set({ isRebuildingRag: rebuilding }),

        hydrateFromStorage: () => {
            const nextId = readInitialStoryId();
            if (nextId !== get().activeStoryId) {
                set({
                    activeStoryId: nextId,
                    story: createDefaultStoryTemplate(nextId)
                });
            }
        }
    };
});
