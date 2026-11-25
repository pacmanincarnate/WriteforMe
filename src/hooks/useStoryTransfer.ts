/**
 * @module hooks/useStoryTransfer
 * Getting a story out of and into the app (Phase 6E-3, persistence half): JSON, audio-drama
 * script and EPUB export, and file import. File building, parsing and storing are done by
 * `@/services/export`; this hook switches the app to the imported story and reports the result.
 */

import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    exportAudioDramaTxt,
    exportStoryEpub,
    exportStoryJson,
    parseStoryImportFile,
    persistImportedStory,
    summarizeImportedStory
} from '@/services/export';
import { audioStore, imageStore, storyStore } from '@/services/storage';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type TransferStory = Record<string, unknown>;
type ExportableStory = Parameters<typeof exportStoryEpub>[0];

export interface UseStoryTransferParams<TStory extends TransferStory = TransferStory> {
    story: TStory;
    storyRef: MutableRefObject<TStory>;
    setStory: (next: TStory) => unknown;
    setActiveStoryId: (id: string) => void;
    setLoadedImages: (images: { cover: string | null }) => void;
    setPortraitReload: Dispatch<SetStateAction<number>>;
    setView: (view: string) => void;
    refreshLibrary: () => Promise<void>;
    refreshAvailableSceneAudio: (storyId: string) => Promise<unknown> | unknown;
    showToast: (message: string, variant?: ToastVariant, options?: Record<string, unknown> | null) => void;
    /** Closes the current toast immediately (the import toast's buttons use it). */
    dismissToast: () => void;
    /** Resolves true when the user confirms; used for the overwrite-or-copy question. */
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        danger?: boolean;
    }) => Promise<boolean>;
    enterReaderMode: (seqIdx: number, sceneIdx: number) => void;
    playSceneAudio: (seqIdx: number, sceneIdx: number, options: { autoplay: boolean; follow: boolean }) => unknown;
    /** Blocking message for a failed JSON export. Defaults to `window.alert`. */
    notifyAlert?: (message: string) => void;
    /** Delay before audio starts after entering the reader from the import toast. */
    listenDelayMs?: number;
}

export interface UseStoryTransferResult {
    handleExport: () => void;
    handleExportAudioDramaTxt: () => void;
    handleExportEpub: () => Promise<void>;
    handleImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useStoryTransfer<TStory extends TransferStory = TransferStory>({
    story,
    storyRef,
    setStory,
    setActiveStoryId,
    setLoadedImages,
    setPortraitReload,
    setView,
    refreshLibrary,
    refreshAvailableSceneAudio,
    showToast,
    dismissToast,
    requestConfirm,
    enterReaderMode,
    playSceneAudio,
    notifyAlert,
    listenDelayMs = 120
}: UseStoryTransferParams<TStory>): UseStoryTransferResult {
    const handleExport = (): void => {
        try {
            exportStoryJson(story);
        } catch (err) {
            const message = 'Export failed: ' + errorMessage(err);
            if (notifyAlert) notifyAlert(message);
            else window.alert(message);
        }
    };

    const handleExportAudioDramaTxt = (): void => {
        try {
            const result = exportAudioDramaTxt(story as ExportableStory);
            if (result.sceneCount === 0) {
                showToast('No drafted scenes found to export yet.', 'info');
                return;
            }
            showToast(`Exported full audio drama script (${result.sceneCount} scenes).`, 'success');
        } catch (err) {
            console.error('Audio drama export error:', err);
            showToast('Export failed: ' + errorMessage(err), 'error');
        }
    };

    const handleExportEpub = async (): Promise<void> => {
        try {
            await exportStoryEpub(story as ExportableStory, { imageStore, audioStore });
        } catch (e) {
            const msg = errorMessage(e);
            if (msg.startsWith('Could not load the EPUB library')) {
                showToast(msg, 'error');
                return;
            }
            console.error(e);
            showToast('EPUB Generation failed: ' + msg, 'error');
        }
    };

    const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const payload = await parseStoryImportFile(file);
            const result = await persistImportedStory(payload, {
                confirmOverwrite: ({ existingStoryId }) =>
                    requestConfirm({
                        title: 'Story Already Exists',
                        message: `A story with ID "${existingStoryId}" already exists. Do you want to overwrite it, or import it as a new copy?`,
                        confirmLabel: 'Overwrite',
                        cancelLabel: 'Import as Copy',
                        danger: true
                    }),
                storyStore,
                imageStore,
                audioStore,
                onAfterAudioImport: async (newId) => {
                    await refreshAvailableSceneAudio(newId);
                }
            });

            // Make the imported story the open one.
            const importedStory = result.story as TStory;
            storyRef.current = importedStory;
            setActiveStoryId(result.storyId);
            setStory(importedStory);
            setLoadedImages({ cover: result.coverUrl || null });
            setPortraitReload((value) => value + 1);
            setView('dashboard');

            await refreshLibrary();

            const summary = summarizeImportedStory(result);
            const { seqIdx: startSeq, sceneIdx: startSc } = summary.firstSceneCoord;
            showToast(summary.message, 'success', {
                bookCard: {
                    title: summary.title,
                    coverSrc: summary.coverSrc,
                    badge: 'Imported to Bookshelf',
                    story: result.story,
                    audioCount: summary.audioCount,
                    totalScenes: summary.totalScenes,
                    onRead: () => {
                        dismissToast();
                        enterReaderMode(startSeq, startSc);
                    },
                    onListen: () => {
                        dismissToast();
                        enterReaderMode(startSeq, startSc);
                        setTimeout(
                            () => playSceneAudio(startSeq, startSc, { autoplay: true, follow: true }),
                            listenDelayMs
                        );
                    },
                    onStudio: () => {
                        dismissToast();
                        setView('dashboard');
                    }
                }
            });
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            // Let the same file be chosen again.
            event.target.value = '';
        }
    };

    return { handleExport, handleExportAudioDramaTxt, handleExportEpub, handleImport };
}
