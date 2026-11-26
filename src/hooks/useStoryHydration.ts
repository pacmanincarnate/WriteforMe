/**
 * @module hooks/useStoryHydration
 * Loads the active story from storage at startup and whenever the active story id changes
 * (Phase 6E-3, persistence half), and remembers the active id across sessions.
 *
 * Startup has two recoveries: if the saved active story is missing or blank, the most recent
 * story with content is opened instead; if nothing is stored at all, a blank default story is
 * created and the Setup view shown. Record preparation is in `@/domain/lifecycle/hydration`.
 */

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { STORAGE_KEYS } from '@/config';
import {
    createDefaultStoryTemplate,
    hydrateFallbackStory,
    hydrateStoredStory,
    isBlankStory,
    pickRecoverableStory,
    pickStartupFallbackStory
} from '@/domain/lifecycle';
import { computeLoreFingerprint } from '@/domain/lore';
import { storyStore } from '@/services/storage';
import { safeLocalStorageSet } from '@/utils';

type StoredStory = Record<string, unknown>;

/** Values the load needs that the caller declares after this hook; read when the effect runs. */
export interface StoryHydrationLateDeps {
    setWorldPrimer: (primer: string | null) => void;
    vectorStore: MutableRefObject<unknown>;
    embeddingService: MutableRefObject<{ isConfigured: () => boolean; getProviderLabel: () => string } | null>;
    ingestLoreBatch: (lore: unknown[], options: Record<string, unknown>) => Promise<unknown>;
    refreshLibrary: () => unknown;
    setView: (view: string) => void;
    view: string;
}

export interface UseStoryHydrationParams {
    activeStoryId: string;
    setActiveStoryId: (id: string) => void;
    setStory: (story: StoredStory) => unknown;
    /** True until the first load finishes; only the first load may fall back to another story. */
    isInitialMountRef: MutableRefObject<boolean>;
    /** Set once the open story reflects storage; autosave waits for it. */
    hasHydratedStoryRef: MutableRefObject<boolean>;
    /** When it equals the new active id, the story was already put in state and the load is skipped once. */
    skipNextIdbHydrationIdRef: MutableRefObject<string | null>;
    getLateDeps: () => StoryHydrationLateDeps;
    /** Test seam; defaults to the app's story store. */
    store?: Pick<typeof storyStore, 'loadStory' | 'listStories' | 'saveStory'>;
}

export const ACTIVE_STORY_STORAGE_KEY = STORAGE_KEYS.activeStoryId;
export const RAG_FINGERPRINT_STORAGE_KEY = STORAGE_KEYS.ragFingerprint;

export function useStoryHydration({
    activeStoryId,
    setActiveStoryId,
    setStory,
    isInitialMountRef,
    hasHydratedStoryRef,
    skipNextIdbHydrationIdRef,
    getLateDeps,
    store = storyStore
}: UseStoryHydrationParams): void {
    useEffect(() => {
        safeLocalStorageSet(ACTIVE_STORY_STORAGE_KEY, activeStoryId);
    }, [activeStoryId]);

    useEffect(() => {
        let isMounted = true;
        let loreSyncTimer: ReturnType<typeof setTimeout> | undefined;
        const cleanup = (): void => {
            isMounted = false;
            clearTimeout(loreSyncTimer);
        };

        if (skipNextIdbHydrationIdRef.current && skipNextIdbHydrationIdRef.current === activeStoryId) {
            skipNextIdbHydrationIdRef.current = null;
            isInitialMountRef.current = false;
            hasHydratedStoryRef.current = true;
            return cleanup;
        }
        hasHydratedStoryRef.current = false;
        const deps = getLateDeps();

        /** Indexes the story's lore for retrieval unless the index already matches it. */
        const scheduleLoreSync = (storyId: string, lore: unknown[]): void => {
            loreSyncTimer = setTimeout(async () => {
                if (!isMounted) return;
                try {
                    const service = deps.embeddingService.current;
                    const fingerprint = computeLoreFingerprint(
                        storyId,
                        lore as Parameters<typeof computeLoreFingerprint>[1],
                        service?.getProviderLabel() as string
                    );
                    if (fingerprint === localStorage.getItem(RAG_FINGERPRINT_STORAGE_KEY)) {
                        console.info(`[RAG] index up to date for story ${storyId}`);
                    } else if (!service?.isConfigured()) {
                        console.info('[RAG] skipping lore index: no embedding credentials configured');
                    } else {
                        await deps.ingestLoreBatch(lore, {
                            clearExisting: true,
                            deduplicate: false,
                            storyId,
                            isCurrent: () => isMounted,
                            status: 'indexing',
                            throwOnError: true
                        });
                    }
                } catch (loreSyncErr) {
                    console.warn('[RAG] lore sync stopped:', loreSyncErr);
                }
            }, 0);
        };

        const loadActiveStory = async (): Promise<void> => {
            // No active id: a new story is being set up; keep the fresh template.
            if (!activeStoryId) return;
            try {
                const wasInitialMount = isInitialMountRef.current;
                let resolvedId = activeStoryId;
                let stored = await store.loadStory(activeStoryId);
                if (!isMounted) return;

                if (wasInitialMount && isBlankStory(stored)) {
                    const recovered = pickRecoverableStory(await store.listStories());
                    if (!isMounted) return;
                    if (recovered) {
                        resolvedId = recovered.id;
                        stored = recovered.data as StoredStory;
                        if (resolvedId !== activeStoryId) {
                            skipNextIdbHydrationIdRef.current = resolvedId;
                            setActiveStoryId(resolvedId);
                        }
                        console.log(
                            `[StoryStore] Recovered non-empty story '${resolvedId}' on startup instead of blank '${activeStoryId}'.`
                        );
                    }
                }

                if (stored) {
                    isInitialMountRef.current = false;
                    const hydrated = hydrateStoredStory(stored, resolvedId);
                    setStory(hydrated.story);
                    deps.setWorldPrimer(hydrated.worldPrimer as string | null);
                    hasHydratedStoryRef.current = true;
                    console.log(`Loaded active story '${resolvedId}' from storage.`);

                    // Defer lore indexing until hydration has returned and the story can render.
                    const lore = hydrated.migrated?.lore;
                    if (Array.isArray(lore) && deps.vectorStore.current) {
                        scheduleLoreSync(resolvedId, lore);
                    }

                    if (deps.view === 'library') deps.refreshLibrary();
                } else if (wasInitialMount) {
                    // The saved id does not exist. Only the first load falls back to another story.
                    isInitialMountRef.current = false;
                    const fallback = pickStartupFallbackStory(await store.listStories());
                    if (!isMounted) return;
                    if (fallback) {
                        const hydrated = hydrateFallbackStory(fallback);
                        skipNextIdbHydrationIdRef.current = fallback.id;
                        setActiveStoryId(fallback.id);
                        setStory(hydrated.story);
                        deps.setWorldPrimer(hydrated.worldPrimer as string | null);
                        hasHydratedStoryRef.current = true;
                    } else {
                        const defaultStory = createDefaultStoryTemplate('story_default') as unknown as StoredStory;
                        await store.saveStory('story_default', defaultStory);
                        setActiveStoryId('story_default');
                        setStory(defaultStory);
                        deps.setWorldPrimer(null);
                        hasHydratedStoryRef.current = true;
                        deps.setView('setup');
                    }

                    if (deps.view === 'library') deps.refreshLibrary();
                }
            } catch (e) {
                console.error('Failed to load active story from storage:', e);
            }
        };
        void loadActiveStory();
        return cleanup;
        // Runs on story switches only; everything else is read fresh through refs and getLateDeps.
    }, [activeStoryId]);
}
