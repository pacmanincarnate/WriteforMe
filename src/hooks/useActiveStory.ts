/**
 * @module hooks/useActiveStory
 * The story open in the editor: its id, the document, the setter every module writes through,
 * and the bookkeeping refs used while stories load, initialise in the background or are deleted.
 */

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import type { Story } from '@/types';
import { ACTIVE_STORY_ID_STORAGE_KEY } from './useStoryLibrary';

export const DEFAULT_STORY_ID = 'story_default';

export type SetActiveStory = (updaterOrValue: Story | ((prev: Story) => Story)) => Story;

export interface UseActiveStoryResult {
    activeStoryId: string;
    setActiveStoryId: Dispatch<SetStateAction<string>>;
    story: Story;
    /** Applies a value or updater against the latest story and returns the result synchronously. */
    setStory: SetActiveStory;
    /** Always the latest story, including between a `setStory` call and the next render. */
    storyRef: MutableRefObject<Story>;
    /** True once the open story has been loaded from storage (autosave waits for this). */
    hasHydratedStoryRef: MutableRefObject<boolean>;
    isInitialMountRef: MutableRefObject<boolean>;
    /** Story id whose next load from storage is skipped because a live snapshot was just applied. */
    skipNextIdbHydrationIdRef: MutableRefObject<string | null>;
    /** Story still being generated in the background, if any. */
    initializingStoryId: string | null;
    setInitializingStoryId: Dispatch<SetStateAction<string | null>>;
    initializingStoryIdRef: MutableRefObject<string | null>;
    /** Latest known state of stories updated while not open, by id. */
    storySnapshotsByIdRef: MutableRefObject<Record<string, Story>>;
    pendingSetupLoreRef: MutableRefObject<Record<string, string>>;
    /** Ids deleted this session, so background work does not resurrect them. */
    deletedStoryIdsRef: MutableRefObject<Set<string>>;
}

function readActiveStoryId(): string {
    try {
        return localStorage.getItem(ACTIVE_STORY_ID_STORAGE_KEY) || DEFAULT_STORY_ID;
    } catch {
        return DEFAULT_STORY_ID;
    }
}

export function useActiveStory(): UseActiveStoryResult {
    const [activeStoryId, setActiveStoryId] = useState(readActiveStoryId);
    const [story, setStoryRaw] = useState<Story>(
        () => createDefaultStoryTemplate(activeStoryId) as unknown as Story
    );
    const storyRef = useRef(story);
    // storyRef is written ONLY by setStory (and the few handlers that pre-seed it before calling
    // setStory). Do NOT re-sync it from `story` during render: Zustand store updates re-render the
    // shell synchronously (useSyncExternalStore) BEFORE a pending setStoryRaw has been applied, so a
    // render-time `storyRef.current = story` rolls the ref back one update and the next functional
    // setStory(prev => ...) silently drops it (observed: freshly written scene prose discarded).
    const setStory = useCallback<SetActiveStory>((updaterOrValue) => {
        const prev = storyRef.current;
        const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
        storyRef.current = next;
        setStoryRaw(next);
        return next;
    }, []);

    const hasHydratedStoryRef = useRef(false);
    const isInitialMountRef = useRef(true);
    const skipNextIdbHydrationIdRef = useRef<string | null>(null);
    const [initializingStoryId, setInitializingStoryId] = useState<string | null>(null);
    const initializingStoryIdRef = useRef<string | null>(null);
    const storySnapshotsByIdRef = useRef<Record<string, Story>>({});
    const pendingSetupLoreRef = useRef<Record<string, string>>({});
    const deletedStoryIdsRef = useRef(new Set<string>());

    return {
        activeStoryId,
        setActiveStoryId,
        story,
        setStory,
        storyRef,
        hasHydratedStoryRef,
        isInitialMountRef,
        skipNextIdbHydrationIdRef,
        initializingStoryId,
        setInitializingStoryId,
        initializingStoryIdRef,
        storySnapshotsByIdRef,
        pendingSetupLoreRef,
        deletedStoryIdsRef
    };
}
