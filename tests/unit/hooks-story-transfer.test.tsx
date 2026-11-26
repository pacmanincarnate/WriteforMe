import { act } from 'react';
import type { ChangeEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportMocks = vi.hoisted(() => ({
    exportStoryJson: vi.fn(),
    exportAudioDramaTxt: vi.fn(),
    exportStoryEpub: vi.fn(),
    parseStoryImportFile: vi.fn(),
    persistImportedStory: vi.fn()
}));

vi.mock('@/services/export', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/export')>()),
    ...exportMocks
}));

import { summarizeImportedStory, type PersistImportedStoryResult } from '@/services/export';
import { useStoryTransfer, type UseStoryTransferResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const importResult = (over: Partial<PersistImportedStoryResult> = {}): PersistImportedStoryResult => ({
    storyId: 'imp1',
    story: { id: 'imp1', title: 'Imported Saga' },
    coverUrl: 'data:cover',
    importedAudioCount: 0,
    totalDraftedScenes: 4,
    firstSceneCoord: { seqIdx: 1, sceneIdx: 2 },
    ...over
});

describe('summarizeImportedStory', () => {
    it('describes a text-only import', () => {
        expect(summarizeImportedStory(importResult())).toEqual({
            message: 'Story imported and ready',
            title: 'Imported Saga',
            coverSrc: 'data:cover',
            audioCount: 0,
            totalScenes: 4,
            firstSceneCoord: { seqIdx: 1, sceneIdx: 2 }
        });
    });

    it('counts offline audio scenes and falls back on missing figures', () => {
        expect(summarizeImportedStory(importResult({ importedAudioCount: 1 })).message).toBe('Ready with 1 offline audio scene');
        const many = summarizeImportedStory(importResult({ importedAudioCount: 3, totalDraftedScenes: 0, story: {}, coverUrl: null }));
        expect(many).toMatchObject({ message: 'Ready with 3 offline audio scenes', totalScenes: 3, title: 'Untitled Story', coverSrc: null });
        expect(summarizeImportedStory(importResult({ totalDraftedScenes: 0 })).totalScenes).toBe(0);
    });
});

interface BookCard {
    title: string;
    onRead: () => void;
    onListen: () => void;
    onStudio: () => void;
}

describe('useStoryTransfer', () => {
    const roots: Root[] = [];
    beforeEach(() => {
        Object.values(exportMocks).forEach((m) => m.mockReset());
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function mount() {
        const calls: string[] = [];
        const toasts: Array<[string, string | undefined, { bookCard?: BookCard } | null | undefined]> = [];
        const alerts: string[] = [];
        const storyRef = { current: { id: 'open', title: 'Open' } as Record<string, unknown> };
        const confirmAnswers: boolean[] = [];
        const confirms: Array<Record<string, unknown>> = [];
        const loaded: Array<{ cover: string | null }> = [];
        let portraitReload = 0;
        let latest: UseStoryTransferResult | null = null;
        function Probe(): null {
            latest = useStoryTransfer({
                story: storyRef.current,
                storyRef,
                setStory: (next) => calls.push(`setStory:${String(next.id)}`),
                setActiveStoryId: (id) => calls.push(`active:${id}`),
                setLoadedImages: (images) => loaded.push(images),
                setPortraitReload: (update) => {
                    portraitReload = typeof update === 'function' ? update(portraitReload) : update;
                },
                setView: (view) => calls.push(`view:${view}`),
                refreshLibrary: async () => {
                    calls.push('refreshLibrary');
                },
                refreshAvailableSceneAudio: (id) => calls.push(`audio:${id}`),
                showToast: (m, v, o) => toasts.push([m, v, o as { bookCard?: BookCard } | null | undefined]),
                dismissToast: () => calls.push('dismissToast'),
                requestConfirm: async (options) => {
                    confirms.push(options);
                    return confirmAnswers.shift() ?? false;
                },
                enterReaderMode: (s, c) => calls.push(`reader:${s}-${c}`),
                playSceneAudio: (s, c, o) => calls.push(`play:${s}-${c}:${o.autoplay}:${o.follow}`),
                notifyAlert: (m) => alerts.push(m)
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return {
            api: () => latest as UseStoryTransferResult,
            calls, toasts, alerts, storyRef, confirms, confirmAnswers, loaded,
            portraitReload: () => portraitReload
        };
    }

    const fileEvent = (file: unknown = { name: 'saga.json' }) =>
        ({ target: { files: file ? [file] : [], value: 'C:\\fakepath\\saga.json' } }) as unknown as ChangeEvent<HTMLInputElement>;

    it('exports JSON and alerts on failure', () => {
        const h = mount();
        h.api().handleExport();
        expect(exportMocks.exportStoryJson).toHaveBeenCalledWith(h.storyRef.current);
        exportMocks.exportStoryJson.mockImplementationOnce(() => {
            throw new Error('disk');
        });
        h.api().handleExport();
        expect(h.alerts).toEqual(['Export failed: disk']);
    });

    it('exports the audio drama script and reports the scene count, an empty story or a failure', () => {
        const h = mount();
        exportMocks.exportAudioDramaTxt.mockReturnValueOnce({ sceneCount: 3 });
        h.api().handleExportAudioDramaTxt();
        exportMocks.exportAudioDramaTxt.mockReturnValueOnce({ sceneCount: 0 });
        h.api().handleExportAudioDramaTxt();
        exportMocks.exportAudioDramaTxt.mockImplementationOnce(() => {
            throw new Error('bad');
        });
        h.api().handleExportAudioDramaTxt();
        expect(h.toasts.map(([m, v]) => [m, v])).toEqual([
            ['Exported full audio drama script (3 scenes).', 'success'],
            ['No drafted scenes found to export yet.', 'info'],
            ['Export failed: bad', 'error']
        ]);
    });

    it('exports an EPUB with the image and audio stores and reports failures', async () => {
        const h = mount();
        exportMocks.exportStoryEpub.mockResolvedValueOnce({});
        await h.api().handleExportEpub();
        expect(Object.keys(exportMocks.exportStoryEpub.mock.calls[0][1])).toEqual(['imageStore', 'audioStore']);
        exportMocks.exportStoryEpub.mockRejectedValueOnce(new Error('Could not load the EPUB library (offline).'));
        await h.api().handleExportEpub();
        exportMocks.exportStoryEpub.mockRejectedValueOnce('zip broke');
        await h.api().handleExportEpub();
        expect(h.toasts.map(([m, v]) => [m, v])).toEqual([
            ['Could not load the EPUB library (offline).', 'error'],
            ['EPUB Generation failed: zip broke', 'error']
        ]);
    });

    it('does nothing when no file was chosen', async () => {
        const h = mount();
        await h.api().handleImport(fileEvent(null));
        expect(exportMocks.parseStoryImportFile).not.toHaveBeenCalled();
    });

    it('imports a file, opens the story and shows the book card', async () => {
        const h = mount();
        const payload = { story: {} };
        exportMocks.parseStoryImportFile.mockResolvedValueOnce(payload);
        exportMocks.persistImportedStory.mockImplementationOnce(async (_payload, options) => {
            await options.onAfterAudioImport('imp1');
            h.confirmAnswers.push(true);
            expect(await options.confirmOverwrite({ existingStoryId: 'imp1', mergedStory: {} })).toBe(true);
            return importResult({ importedAudioCount: 2 });
        });
        const event = fileEvent();
        await h.api().handleImport(event);

        expect(exportMocks.persistImportedStory.mock.calls[0][0]).toBe(payload);
        expect(h.confirms[0]).toMatchObject({ title: 'Story Already Exists', confirmLabel: 'Overwrite', cancelLabel: 'Import as Copy' });
        expect(String(h.confirms[0].message)).toContain('"imp1"');
        expect(h.calls).toEqual(['audio:imp1', 'active:imp1', 'setStory:imp1', 'view:dashboard', 'refreshLibrary']);
        expect(h.storyRef.current).toEqual({ id: 'imp1', title: 'Imported Saga' });
        expect(h.loaded).toEqual([{ cover: 'data:cover' }]);
        expect(h.portraitReload()).toBe(1);
        expect(event.target.value).toBe('');

        const [message, variant, options] = h.toasts[0];
        expect([message, variant]).toEqual(['Ready with 2 offline audio scenes', 'success']);
        expect(options?.bookCard).toMatchObject({
            title: 'Imported Saga', coverSrc: 'data:cover', badge: 'Imported to Bookshelf', audioCount: 2, totalScenes: 4
        });
    });

    it('wires the book card buttons to the reader, playback and studio', async () => {
        vi.useFakeTimers();
        const h = mount();
        exportMocks.parseStoryImportFile.mockResolvedValueOnce({});
        exportMocks.persistImportedStory.mockResolvedValueOnce(importResult());
        await h.api().handleImport(fileEvent());
        const card = h.toasts[0][2]?.bookCard as BookCard;
        h.calls.length = 0;
        card.onRead();
        expect(h.calls).toEqual(['dismissToast', 'reader:1-2']);
        h.calls.length = 0;
        card.onListen();
        expect(h.calls).toEqual(['dismissToast', 'reader:1-2']);
        vi.advanceTimersByTime(120);
        expect(h.calls[2]).toBe('play:1-2:true:true');
        h.calls.length = 0;
        card.onStudio();
        expect(h.calls).toEqual(['dismissToast', 'view:dashboard']);
    });

    it('reports a failed import, leaves the open story alone and still resets the input', async () => {
        const h = mount();
        exportMocks.parseStoryImportFile.mockRejectedValueOnce(new Error('Invalid file format.'));
        const event = fileEvent();
        await h.api().handleImport(event);
        expect(h.toasts.map(([m, v]) => [m, v])).toEqual([['Invalid file format.', 'error']]);
        expect(h.calls).toEqual([]);
        expect(h.storyRef.current.id).toBe('open');
        expect(event.target.value).toBe('');
    });
});
