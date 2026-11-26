/**
 * @module hooks/useStoryReset
 * Destructive resets (Phase 6E-3, persistence half): rolling the open story back to an earlier
 * stage, and the application-wide factory reset. The rollback itself is
 * `buildRolledBackStoryState`; storage cleanup is `@/services/storage/storyReset`. This hook
 * sequences them and resets the UI state that pointed at deleted content.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { STORAGE_KEYS } from '@/config';
import {
    STORY_RESET_STAGES,
    buildRolledBackStoryState,
    createDefaultStoryTemplate,
    loadedImagesAfterStageReset,
    viewAfterStageReset,
    type LoadedStoryImages,
    type RollbackStoryState,
    type StoryResetStageKey
} from '@/domain/lifecycle';
import {
    FACTORY_RESET_STORAGE_KEYS,
    audioStore,
    deleteStageResetImages,
    eraseAllStoredData,
    imageStore,
    storyStore
} from '@/services/storage';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type ResetStory = RollbackStoryState & { id?: string; lore?: unknown[] };

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
}

export interface UseStoryResetParams<TStory extends ResetStory = ResetStory> {
    story: TStory;
    storyRef: MutableRefObject<TStory>;
    setStory: (next: TStory) => unknown;
    setActiveStoryId: (id: string) => void;
    requestConfirm: (options: ConfirmOptions) => unknown;
    showToast: (message: string, variant?: ToastVariant) => void;

    /** Deletes a story's generated audio and cached TTS renders. */
    clearStoryTtsArtifacts: (storyId: string | undefined) => Promise<unknown>;
    setContinuousAutopilot: (running: boolean) => void;
    setReadingProgress: (progress: Record<string, unknown>) => void;
    prefetchCacheRef?: MutableRefObject<{ clear: () => void } | null>;
    setLoadedImages: Dispatch<SetStateAction<LoadedStoryImages>>;
    setFeedbackLedger: (ledger: Record<string, unknown>) => void;

    /** Outline selection and expansion state that may point at deleted acts, sequences or scenes. */
    setSelectedAct: (idx: number | null) => void;
    setSelectedSequence: (idx: number | null) => void;
    setSelectedScene: (idx: number | null) => void;
    setActiveActTab: (idx: number) => void;
    setCollapsedActs: (collapsed: Record<string, boolean>) => void;

    view: string;
    viewRef?: MutableRefObject<string>;
    setView: (view: string) => void;

    /** World-memory indexes rebuilt from the lore that survives a reset. */
    graphManager?: MutableRefObject<{ buildGraph: (lore: unknown[]) => void } | null>;
    vectorStore?: MutableRefObject<{ clear: () => Promise<unknown> } | null>;
    embeddingService?: MutableRefObject<{ isConfigured: () => boolean } | null>;
    ingestLoreBatch: (lore: unknown[], options: Record<string, unknown>) => Promise<unknown>;

    refreshLibrary: () => Promise<void>;
    setLibraryStories: (stories: never[]) => void;
    setLibraryCovers: (covers: Record<string, string>) => void;
    clearSetupDraft: () => void;
}

export interface UseStoryResetResult<TStory extends ResetStory = ResetStory> {
    /**
     * Asks for confirmation, then rolls the story back to `stage` ('tts' only deletes audio).
     * Returns what `requestConfirm` returns, or a promise of false for an unknown stage.
     */
    handleResetStoryStage: (stage: string, targetStoryObj?: TStory | null) => unknown;
    /** Asks for confirmation, then erases every story and all stored data. */
    handleDeleteStory: () => Promise<void>;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const removeStorageKey = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch {
        // Storage unavailable: nothing to remove.
    }
};

export function useStoryReset<TStory extends ResetStory = ResetStory>(
    params: UseStoryResetParams<TStory>
): UseStoryResetResult<TStory> {
    const { story, storyRef, setStory, requestConfirm, showToast } = params;

    const resetStage = async (stage: StoryResetStageKey, targetStoryObj: TStory | null): Promise<void> => {
        const cfg = STORY_RESET_STAGES[stage];
        const sourceStory = targetStoryObj || storyRef.current || story;
        if (cfg.ttsOnly || stage === 'tts') {
            if (!sourceStory || typeof sourceStory !== 'object') {
                throw new Error('Cannot reset an empty story object.');
            }
            await params.clearStoryTtsArtifacts(sourceStory.id);
            showToast(cfg.toastMessage, 'success');
            return;
        }

        params.setContinuousAutopilot(false);
        const { nextStory, removedCharIds, flags } = buildRolledBackStoryState(sourceStory, stage);

        storyRef.current = nextStory;
        setStory(nextStory);

        if (nextStory.id) {
            try {
                // A reset shrinks the story on purpose; bypass the store's regression guard.
                await storyStore.saveStory(nextStory.id, nextStory as Record<string, unknown>, {
                    allowRegression: true
                });
            } catch (saveErr) {
                console.warn('[handleResetStoryStage] Failed saving reset story to storyStore:', saveErr);
            }
        }

        params.setReadingProgress({});
        if (nextStory.id) removeStorageKey(`ellipsisprose_reading_progress_${nextStory.id}`);
        params.prefetchCacheRef?.current?.clear();

        if (nextStory.id) {
            try {
                await deleteStageResetImages(imageStore, nextStory.id, removedCharIds);
            } catch (imgErr) {
                console.warn('[handleResetStoryStage] Scene/beat/portrait image cleanup warning:', imgErr);
            }
        }
        params.setLoadedImages((prev) => loadedImagesAfterStageReset(prev, removedCharIds));

        await params.clearStoryTtsArtifacts(nextStory.id);

        if (flags.clearScenes) params.setSelectedScene(null);
        if (flags.clearSequences) params.setSelectedSequence(null);
        if (flags.clearActs) {
            params.setSelectedAct(null);
            params.setActiveActTab(0);
            params.setCollapsedActs({});
        }
        params.setFeedbackLedger({});

        const nextView = viewAfterStageReset(params.viewRef?.current || params.view, flags);
        if (nextView) params.setView(nextView);

        // Rebuild world memory from the lore that survived.
        params.graphManager?.current?.buildGraph(nextStory.lore || []);
        removeStorageKey(STORAGE_KEYS.ragFingerprint);
        const vectors = params.vectorStore?.current;
        if (vectors) {
            try {
                await vectors.clear();
                if (nextStory.lore && nextStory.lore.length > 0 && params.embeddingService?.current?.isConfigured()) {
                    params
                        .ingestLoreBatch(nextStory.lore, {
                            clearExisting: true,
                            deduplicate: false,
                            storyId: nextStory.id,
                            fingerprintProcessed: false
                        })
                        .catch((err) => console.warn('[handleResetStoryStage] Async RAG rebuild warning:', err));
                }
            } catch (ragErr) {
                console.warn('[handleResetStoryStage] Vector store cleanup warning:', ragErr);
            }
        }

        params.refreshLibrary().catch(() => {});
        showToast(cfg.toastMessage, 'success');
    };

    const handleResetStoryStage = (stage: string, targetStoryObj: TStory | null = null): unknown => {
        const cfg = STORY_RESET_STAGES[stage as StoryResetStageKey];
        if (!cfg) {
            showToast(`Unknown reset stage: ${stage}`, 'error');
            return Promise.resolve(false);
        }
        return requestConfirm({
            title: cfg.title,
            message: cfg.message,
            confirmLabel: cfg.confirmLabel,
            danger: true,
            onConfirm: async () => {
                try {
                    await resetStage(stage as StoryResetStageKey, targetStoryObj);
                } catch (err) {
                    console.error('[handleResetStoryStage] Failed:', err);
                    showToast(`Story reset failed: ${errorMessage(err)}`, 'error');
                }
            }
        });
    };

    const handleDeleteStory = async (): Promise<void> => {
        requestConfirm({
            title: 'Factory Reset: Erase All Stories & Library?',
            message:
                'WARNING: This will permanently delete ALL stories in your library, world lore, cast characters, outlines, generated prose, vector memory index, and custom covers from the entire app!\n\nThis application-wide reset cannot be undone. Are you absolutely sure you want to erase everything?',
            confirmLabel: 'Erase All Data',
            danger: true,
            onConfirm: async () => {
                const defaultStory = createDefaultStoryTemplate('story_default');
                setStory(defaultStory as unknown as TStory);
                params.setActiveStoryId('story_default');
                FACTORY_RESET_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
                await eraseAllStoredData(
                    { storyStore, imageStore, audioStore, vectorStore: params.vectorStore?.current },
                    defaultStory as unknown as Record<string, unknown>
                );
                params.setSelectedAct(null);
                params.setSelectedSequence(null);
                params.setSelectedScene(null);
                params.clearSetupDraft();
                params.setLibraryStories([]);
                params.setLibraryCovers({});
                params.setView('setup');
                showToast('All application data and stories erased.', 'success');
            }
        });
    };

    return { handleResetStoryStage, handleDeleteStory };
}
