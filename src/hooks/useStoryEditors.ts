/**
 * @module hooks/useStoryEditors
 * Manual editing handlers for the story (Phase 6E-3): the scene and beat editors and the
 * per-story slop allowlist. The story transforms themselves are pure functions in `@/domain`
 * (`story/sceneEditing`, `slop/configEditing`); this hook adds what React owns: selection,
 * confirmation dialogs, toasts and persistence.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
    applyBeatFieldChange,
    applySceneBlueprintUpdate,
    dismissStaleProse,
    insertBeatAfter,
    insertSceneAt,
    moveSceneBy,
    removeBeatAt,
    removeSceneAt,
    type SceneBlueprintUpdateOptions,
    removeLoreAt,
    type SceneEditableStory
} from '@/domain/story';
import { addStoryAllowlistTerm, removeStoryAllowlistTerm } from '@/domain/slop';
import { storyStore as defaultStoryStore } from '@/services/storage';

export type EditorStory = SceneEditableStory & { id?: string; slop_allowlist?: unknown };

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface UseStoryEditorsParams<TStory extends EditorStory = EditorStory> {
    /** Current story (render state). Used only to read what a confirmation dialog describes. */
    story: TStory;
    /** Applies an update and returns the resulting story synchronously. */
    setStory: (updater: (prev: TStory) => TStory) => TStory;
    selectedSequence: number | null;
    selectedScene: number | null;
    setSelectedSequence: Dispatch<SetStateAction<number | null>>;
    setSelectedScene: Dispatch<SetStateAction<number | null>>;
    showToast: (message: string, variant?: ToastVariant) => void;
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void | Promise<void>;
    }) => void;
    /** Test seam; defaults to the app's story store. */
    storyStoreInstance?: { saveStory: (id: string, data: TStory) => Promise<unknown> };
}

export interface UseStoryEditorsResult<TStory extends EditorStory = EditorStory> {
    /**
     * Accepts `(seqIdx, sceneIdx, beatIdx, field, text)`, `(seqIdx, sceneIdx, beatIdx, text)`
     * (edits `action`), or the legacy `(sceneIdx, beatIdx, text, anyString)` form (a string in
     * third position) that targets the selected sequence and edits `description`.
     */
    handleBeatChange: (
        seqIdx: number,
        sceneIdx: number,
        beatIdx?: number | string,
        fieldOrText?: string,
        maybeText?: string
    ) => void;
    /** `(seqIdx, sceneIdx, insertAfterIdx)` or legacy `(sceneIdx, insertAfterIdx)` on the selected sequence. */
    handleAddBeat: (seqIdx: number, sceneIdx: number, insertAfterIdx?: number) => void;
    /** `(seqIdx, sceneIdx, beatIdx)` or legacy `(sceneIdx, beatIdx)` on the selected sequence. */
    handleDeleteBeat: (seqIdx: number, sceneIdx: number, beatIdx?: number) => void;
    handleDeleteScene: (seqIdx: number | null | undefined, sceneIdx: number) => void;
    updateSceneBlueprint: (
        seqIdx?: number | null,
        sceneIdx?: number | null,
        fieldUpdates?: Record<string, unknown>,
        options?: SceneBlueprintUpdateOptions
    ) => TStory;
    handleDismissStaleProse: (seqIdx?: number | null, sceneIdx?: number | null) => void;
    handleAddScene: (seqIdx?: number | null, insertAtIdx?: number | null) => void;
    handleMoveScene: (seqIdx: number | null | undefined, fromIdx: number, direction: number) => void;
    /** Lets the slop audit ignore a term in this story only. */
    handleAddStoryAllowlistItem: (term: unknown) => void;
    handleRemoveStoryAllowlistItem: (term: unknown) => void;
    /** Asks for confirmation, then removes the lore item at `index` from world memory. */
    handleDeleteLore: (index: number) => void;
}

export function useStoryEditors<TStory extends EditorStory = EditorStory>({
    story,
    setStory,
    selectedSequence,
    selectedScene,
    setSelectedSequence,
    setSelectedScene,
    showToast,
    requestConfirm,
    storyStoreInstance
}: UseStoryEditorsParams<TStory>): UseStoryEditorsResult<TStory> {
    const store = storyStoreInstance || (defaultStoryStore as unknown as NonNullable<typeof storyStoreInstance>);

    const fallbackSequence = (): number => (selectedSequence !== null ? selectedSequence : 0);
    const resolveSequence = (seqIdx: unknown): number =>
        typeof seqIdx === 'number' ? seqIdx : fallbackSequence();
    const resolveScene = (sceneIdx: unknown): number =>
        typeof sceneIdx === 'number' ? sceneIdx : selectedScene !== null ? selectedScene : 0;

    const persist = (updated: TStory | undefined, failureLabel: string): void => {
        if (updated?.id) {
            store.saveStory(updated.id, updated).catch((err) => console.warn(failureLabel, err));
        }
    };

    const handleBeatChange: UseStoryEditorsResult<TStory>['handleBeatChange'] = (
        seqIdx,
        sceneIdx,
        beatIdx,
        fieldOrText,
        maybeText
    ) => {
        let seq = seqIdx;
        let scene = sceneIdx;
        let beat = beatIdx as number;
        let field = 'action';
        let text = '';

        if (maybeText !== undefined) {
            field = fieldOrText as string;
            text = maybeText;
        } else if (typeof fieldOrText === 'string') {
            if (beatIdx !== undefined && typeof beatIdx === 'string') {
                seq = fallbackSequence();
                scene = seqIdx;
                beat = sceneIdx;
                text = beatIdx;
                field = 'description';
            } else {
                text = fieldOrText;
                field = 'action';
            }
        }

        setStory((prev) => applyBeatFieldChange(prev, `${seq}-${scene}`, beat, field, text));
    };

    const handleAddBeat: UseStoryEditorsResult<TStory>['handleAddBeat'] = (seqIdx, sceneIdx, insertAfterIdx) => {
        let seq = seqIdx;
        let scene = sceneIdx;
        let insertAfter = insertAfterIdx as number;
        if (insertAfterIdx === undefined) {
            seq = fallbackSequence();
            scene = seqIdx;
            insertAfter = sceneIdx;
        }
        setStory((prev) => insertBeatAfter(prev, `${seq}-${scene}`, insertAfter));
        showToast(`Beat added after Beat ${insertAfter + 1}`);
    };

    const handleDeleteBeat: UseStoryEditorsResult<TStory>['handleDeleteBeat'] = (seqIdx, sceneIdx, beatIdx) => {
        let seq = seqIdx;
        let scene = sceneIdx;
        let beat = beatIdx as number;
        if (beatIdx === undefined) {
            seq = fallbackSequence();
            scene = seqIdx;
            beat = sceneIdx;
        }
        requestConfirm({
            title: `Delete Beat ${beat + 1}?`,
            message: 'This will remove the beat and its generated prose. This action cannot be undone.',
            confirmLabel: 'Delete Beat',
            danger: true,
            onConfirm: () => {
                setStory((prev) => removeBeatAt(prev, `${seq}-${scene}`, beat));
                showToast(`Beat ${beat + 1} deleted`);
            }
        });
    };

    const handleDeleteScene: UseStoryEditorsResult<TStory>['handleDeleteScene'] = (seqIdx, sceneIdx) => {
        const sIdx = resolveSequence(seqIdx);
        const scene = (story.scenes?.[`${sIdx}`] || [])[sceneIdx];
        if (!scene) return;
        const label = scene.title || `Scene ${sceneIdx + 1}`;

        requestConfirm({
            title: `Delete Scene "${label}"?`,
            message:
                'This will remove all its beats and prose, and shift subsequent scenes. This cannot be undone.',
            confirmLabel: 'Delete Scene',
            danger: true,
            onConfirm: () => {
                setStory((prev) => removeSceneAt(prev, sIdx, sceneIdx));
                showToast(`Deleted Scene "${label}"`);
            }
        });
    };

    const updateSceneBlueprint: UseStoryEditorsResult<TStory>['updateSceneBlueprint'] = (
        seqIdx,
        sceneIdx,
        fieldUpdates = {},
        options = {}
    ) => {
        const sIdx = resolveSequence(seqIdx);
        const scIdx = resolveScene(sceneIdx);
        const updatedStory = setStory(
            (prev) => applySceneBlueprintUpdate(prev, sIdx, scIdx, fieldUpdates, options).story
        );
        persist(updatedStory, 'Failed saving blueprint update:');
        return updatedStory;
    };

    const handleDismissStaleProse: UseStoryEditorsResult<TStory>['handleDismissStaleProse'] = (
        seqIdx,
        sceneIdx
    ) => {
        const sIdx = resolveSequence(seqIdx);
        const scIdx = resolveScene(sceneIdx);
        const updated = setStory((prev) => dismissStaleProse(prev, sIdx, scIdx));
        persist(updated, 'Failed saving dismissed stale banner:');
    };

    const handleAddScene: UseStoryEditorsResult<TStory>['handleAddScene'] = (seqIdx, insertAtIdx = null) => {
        const sIdx = resolveSequence(seqIdx);
        let resolvedInsertIdx = 0;
        let createdTitle = 'New Scene';

        const updatedStory = setStory((prev) => {
            const result = insertSceneAt(prev, sIdx, insertAtIdx);
            resolvedInsertIdx = result.insertIdx;
            createdTitle = result.title;
            return result.story;
        });

        setSelectedSequence(sIdx);
        setSelectedScene(resolvedInsertIdx);
        persist(updatedStory, 'Failed saving added scene:');
        showToast(`Added "${createdTitle}"`, 'success');
    };

    const handleMoveScene: UseStoryEditorsResult<TStory>['handleMoveScene'] = (seqIdx, fromIdx, direction) => {
        const sIdx = resolveSequence(seqIdx);
        const toIdx = fromIdx + direction;
        let movedTitle = '';
        let didMove = false;

        const updatedStory = setStory((prev) => {
            const result = moveSceneBy(prev, sIdx, fromIdx, direction);
            didMove = result.moved;
            movedTitle = result.title;
            return result.story;
        });

        if (!didMove) return;
        if (selectedSequence === sIdx) {
            if (selectedScene === fromIdx) setSelectedScene(toIdx);
            else if (selectedScene === toIdx) setSelectedScene(fromIdx);
        }
        persist(updatedStory, 'Failed saving scene reorder:');
        showToast(`Moved "${movedTitle}" ${direction < 0 ? 'up' : 'down'}`, 'info');
    };

    const handleAddStoryAllowlistItem = (term: unknown): void => {
        const clean = String(term || '').trim();
        if (!clean) return;
        setStory((prev) => {
            const next = addStoryAllowlistTerm(prev, clean);
            if (next !== prev && next.id) store.saveStory(next.id, next).catch(() => undefined);
            return next;
        });
        showToast(`Allowed "${clean}" in this story.`, 'info');
    };

    const handleRemoveStoryAllowlistItem = (term: unknown): void => {
        setStory((prev) => {
            const next = removeStoryAllowlistTerm(prev, String(term || ''));
            if (next.id) store.saveStory(next.id, next).catch(() => undefined);
            return next;
        });
    };

    const handleDeleteLore = (index: number): void => {
        requestConfirm({
            title: 'Delete Lore Item?',
            message: 'Are you sure you want to delete this lore item from world memory?',
            confirmLabel: 'Delete Lore',
            danger: true,
            onConfirm: () => {
                setStory((prev) => removeLoreAt(prev as TStory & { lore?: unknown[] }, index));
                showToast('Lore item deleted.', 'info');
            }
        });
    };

    return {
        handleBeatChange,
        handleAddBeat,
        handleDeleteBeat,
        handleDeleteScene,
        updateSceneBlueprint,
        handleDismissStaleProse,
        handleAddScene,
        handleMoveScene,
        handleAddStoryAllowlistItem,
        handleRemoveStoryAllowlistItem,
        handleDeleteLore
    };
}
