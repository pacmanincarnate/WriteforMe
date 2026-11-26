import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
    storyStore: { saveStory: vi.fn(), clear: vi.fn() },
    imageStore: { deleteImagesByPrefix: vi.fn(), deleteImage: vi.fn(), clear: vi.fn() },
    audioStore: { clear: vi.fn() }
}));

vi.mock('@/services/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/storage')>()),
    ...storage
}));

import { loadedImagesAfterStageReset, viewAfterStageReset } from '@/domain/lifecycle';
import { FACTORY_RESET_STORAGE_KEYS, deleteStageResetImages, eraseAllStoredData } from '@/services/storage';
import { useStoryReset, type UseStoryResetParams, type UseStoryResetResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const none = { clearScenes: false, clearSequences: false, clearActs: false };

describe('reset effects (pure)', () => {
    it('leaves views whose content was deleted', () => {
        const proseOnly = none;
        expect(viewAfterStageReset('writer', proseOnly)).toBeNull();
        expect(viewAfterStageReset('reader', proseOnly)).toBe('dashboard');
        const scenes = { ...none, clearScenes: true };
        for (const view of ['writer', 'chapter_dashboard', 'reader']) expect(viewAfterStageReset(view, scenes)).toBe('structure');
        expect(viewAfterStageReset('sequence_dashboard', scenes)).toBeNull();
        const sequences = { ...scenes, clearSequences: true };
        expect(viewAfterStageReset('sequence_dashboard', sequences)).toBe('structure');
        expect(viewAfterStageReset('editorial', sequences)).toBeNull();
        const acts = { ...sequences, clearActs: true };
        expect(viewAfterStageReset('editorial', acts)).toBe('structure');
        expect(viewAfterStageReset('dashboard', acts)).toBeNull();
        expect(viewAfterStageReset('library', acts)).toBeNull();
    });

    it('keeps the cover and surviving portraits, dropping everything else', () => {
        const loaded = { cover: 'c', portraits: { a: 1, b: 2 }, scenes: { x: 1 } };
        expect(loadedImagesAfterStageReset(loaded, ['b'])).toEqual({ cover: 'c', portraits: { a: 1 } });
        expect(loaded.portraits).toEqual({ a: 1, b: 2 });
        expect(loadedImagesAfterStageReset({ cover: null }, [])).toEqual({ cover: null, portraits: {} });
        expect(loadedImagesAfterStageReset(null, ['a'])).toEqual({ portraits: {} });
    });
});

describe('reset storage service', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());

    it('deletes scene and beat images and the removed characters\' portraits', async () => {
        const calls: string[] = [];
        await deleteStageResetImages(
            {
                deleteImagesByPrefix: async (prefix) => void calls.push(`prefix:${prefix}`),
                deleteImage: async (id) => void calls.push(`image:${id}`)
            },
            's1',
            ['c1', 'c2']
        );
        expect(calls).toEqual(['prefix:scene_s1_', 'prefix:beat_s1_', 'image:portrait_s1_c1', 'image:portrait_s1_c2']);
    });

    it('erases every store, saves the blank story, and carries on past failures', async () => {
        const calls: string[] = [];
        const store = (name: string, fail = false) => ({
            clear: async () => {
                calls.push(`clear:${name}`);
                if (fail) throw new Error(name);
            }
        });
        const stories = { ...store('stories'), saveStory: async (id: string) => void calls.push(`save:${id}`) };
        await eraseAllStoredData(
            { storyStore: stories, imageStore: store('images', true), audioStore: store('audio'), vectorStore: store('vectors', true) },
            { id: 'story_default' }
        );
        expect(calls).toEqual(['clear:stories', 'save:story_default', 'clear:images', 'clear:audio', 'clear:vectors']);

        calls.length = 0;
        await eraseAllStoredData({ storyStore: { ...store('stories', true), saveStory: stories.saveStory }, imageStore: store('images') }, {});
        expect(calls).toEqual(['clear:stories', 'clear:images']);
    });
});

type TestStory = Record<string, unknown> & { id?: string; lore?: Array<Record<string, unknown>> };

describe('useStoryReset', () => {
    const roots: Root[] = [];
    beforeEach(() => {
        localStorage.clear();
        [storage.storyStore, storage.imageStore, storage.audioStore].forEach((s) =>
            Object.values(s).forEach((fn) => fn.mockReset().mockResolvedValue(undefined))
        );
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        vi.restoreAllMocks();
    });

    const writtenStory = (): TestStory => ({
        id: 's1',
        title: 'Saga',
        cast: [{ id: 'char_a', name: 'Ashe' }],
        acts: [{ number: 1, title: 'Act I' }],
        sequences: [{ number: 1, parent_act: 1, title: 'Seq' }],
        scenes: { '0': [{ id: '1.1', number: '1.1', title: 'Scene' }] },
        beats: { '0-0': [{ action: 'beat' }] },
        prose: { '0-0': { final: 'Some prose.' } },
        lore: [
            { topic: 'Harbour', description: 'User Added Lore', detail: 'kept' },
            { topic: 'Scene fact', description: 'Extracted during writing', detail: 'dropped' }
        ]
    });

    function mount(options: { view?: string; viewRef?: string; embeddings?: boolean; overrides?: Partial<UseStoryResetParams<TestStory>> } = {}) {
        const calls: string[] = [];
        const toasts: Array<[string, string | undefined]> = [];
        const confirms: Array<{ title: string; confirmLabel?: string; onConfirm: () => void | Promise<void> }> = [];
        const storyRef = { current: writtenStory() };
        let loaded: Record<string, unknown> = { cover: 'c', portraits: { char_a: 'p' }, scenes: { s: 1 } };
        const ingested: Array<[unknown[], Record<string, unknown>]> = [];
        let latest: UseStoryResetResult<TestStory> | null = null;
        const log = (name: string) => (...args: unknown[]) => void calls.push(args.length ? `${name}:${JSON.stringify(args[0])}` : name);
        function Probe(): null {
            latest = useStoryReset<TestStory>({
                story: storyRef.current,
                storyRef,
                setStory: (next) => {
                    calls.push(`setStory:${next.id}`);
                    storyRef.current = next;
                },
                setActiveStoryId: log('active'),
                requestConfirm: (o) => {
                    confirms.push(o);
                    return 'confirm-handle';
                },
                showToast: (m, v) => toasts.push([m, v]),
                clearStoryTtsArtifacts: async (id) => void calls.push(`clearTts:${id}`),
                setContinuousAutopilot: log('autopilot'),
                setReadingProgress: log('readingProgress'),
                prefetchCacheRef: { current: { clear: log('prefetchClear') } },
                setLoadedImages: (update) => {
                    loaded = typeof update === 'function' ? update(loaded) : update;
                },
                setFeedbackLedger: log('feedbackLedger'),
                setSelectedAct: log('selectedAct'),
                setSelectedSequence: log('selectedSequence'),
                setSelectedScene: log('selectedScene'),
                setActiveActTab: log('activeActTab'),
                setCollapsedActs: log('collapsedActs'),
                view: options.view ?? 'writer',
                viewRef: options.viewRef ? { current: options.viewRef } : undefined,
                setView: log('view'),
                graphManager: { current: { buildGraph: (lore) => void calls.push(`graph:${lore.length}`) } },
                vectorStore: { current: { clear: async () => void calls.push('vectorsClear') } },
                embeddingService: { current: { isConfigured: () => !!options.embeddings } },
                ingestLoreBatch: async (lore, opts) => void ingested.push([lore, opts]),
                refreshLibrary: async () => void calls.push('refreshLibrary'),
                setLibraryStories: log('libraryStories'),
                setLibraryCovers: log('libraryCovers'),
                clearSetupDraft: log('clearSetupDraft'),
                ...options.overrides
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        const confirm = (idx = 0) =>
            act(async () => {
                await confirms[idx].onConfirm();
            });
        return { api: () => latest as UseStoryResetResult<TestStory>, calls, toasts, confirms, confirm, storyRef, loaded: () => loaded, ingested };
    }

    it('rejects an unknown stage without asking', async () => {
        const h = mount();
        await expect(h.api().handleResetStoryStage('everything')).resolves.toBe(false);
        expect(h.toasts).toEqual([['Unknown reset stage: everything', 'error']]);
        expect(h.confirms).toEqual([]);
    });

    it('returns the confirmation handle and does nothing until confirmed', () => {
        const h = mount();
        expect(h.api().handleResetStoryStage('prose')).toBe('confirm-handle');
        expect(h.confirms[0]).toMatchObject({ title: 'Reset Story: Delete All Prose?', confirmLabel: 'Delete All Prose' });
        expect(h.calls).toEqual([]);
    });

    it('the tts stage only deletes audio', async () => {
        const h = mount();
        h.api().handleResetStoryStage('tts');
        await h.confirm();
        expect(h.calls).toEqual(['clearTts:s1']);
        expect(h.storyRef.current.prose).toEqual({ '0-0': { final: 'Some prose.' } });
        expect(storage.storyStore.saveStory).not.toHaveBeenCalled();
        expect(h.toasts[0][1]).toBe('success');
    });

    it('a prose reset rolls back, saves past the regression guard and cleans up to completion', async () => {
        localStorage.setItem('ellipsisprose_reading_progress_s1', '{}');
        localStorage.setItem('ellipsisprose_rag_fingerprint', 'x');
        const h = mount({ view: 'writer' });
        h.api().handleResetStoryStage('prose');
        await h.confirm();

        expect(h.storyRef.current.prose).toEqual({});
        expect((h.storyRef.current.scenes as Record<string, unknown[]>)['0']).toHaveLength(1);
        expect(storage.storyStore.saveStory).toHaveBeenCalledWith('s1', h.storyRef.current, { allowRegression: true });
        expect(storage.imageStore.deleteImagesByPrefix.mock.calls.map((c) => c[0])).toEqual(['scene_s1_', 'beat_s1_']);
        expect(h.loaded()).toEqual({ cover: 'c', portraits: { char_a: 'p' } });
        expect(localStorage.getItem('ellipsisprose_reading_progress_s1')).toBeNull();
        expect(localStorage.getItem('ellipsisprose_rag_fingerprint')).toBeNull();
        expect(h.calls).toEqual([
            'autopilot:false',
            'setStory:s1',
            'readingProgress:{}',
            'prefetchClear',
            'clearTts:s1',
            'feedbackLedger:{}',
            'graph:1',
            'vectorsClear',
            'refreshLibrary'
        ]);
        expect(h.ingested).toEqual([]);
        expect(h.toasts).toEqual([['All prose and writing-time data deleted. Planned scenes preserved.', 'success']]);
    });

    it('deeper resets clear selection and leave views that lost their content', async () => {
        const h = mount({ view: 'dashboard', viewRef: 'writer' });
        h.api().handleResetStoryStage('acts');
        await h.confirm();
        expect(h.calls).toEqual(expect.arrayContaining([
            'selectedScene:null', 'selectedSequence:null', 'selectedAct:null', 'activeActTab:0', 'collapsedActs:{}', 'view:"structure"'
        ]));
        expect(h.storyRef.current.acts).toEqual([]);

        const reader = mount({ view: 'reader' });
        reader.api().handleResetStoryStage('prose');
        await reader.confirm();
        expect(reader.calls).toContain('view:"dashboard"');
        expect(reader.calls).not.toContain('selectedScene:null');
    });

    it('re-indexes surviving lore when embeddings are configured', async () => {
        const h = mount({ embeddings: true });
        h.api().handleResetStoryStage('prose');
        await h.confirm();
        expect(h.ingested).toHaveLength(1);
        expect(h.ingested[0][0]).toBe(h.storyRef.current.lore);
        expect(h.ingested[0][1]).toEqual({ clearExisting: true, deduplicate: false, storyId: 's1', fingerprintProcessed: false });
    });

    it('resets a story passed in explicitly instead of the open one', async () => {
        const h = mount();
        const other = { ...writtenStory(), id: 'other' };
        h.api().handleResetStoryStage('prose', other);
        await h.confirm();
        expect(h.calls).toContain('setStory:other');
        expect(h.calls).toContain('clearTts:other');
    });

    it('carries on when the save or the image cleanup fails', async () => {
        storage.storyStore.saveStory.mockRejectedValueOnce(new Error('quota'));
        storage.imageStore.deleteImagesByPrefix.mockRejectedValueOnce(new Error('idb'));
        const h = mount();
        h.api().handleResetStoryStage('prose');
        await h.confirm();
        expect(h.calls).toContain('refreshLibrary');
        expect(h.toasts[0][1]).toBe('success');
    });

    it('reports a reset that fails partway', async () => {
        const h = mount({
            overrides: {
                setReadingProgress: () => {
                    throw new Error('setReadingProgress is not defined');
                }
            }
        });
        h.api().handleResetStoryStage('prose');
        await h.confirm();
        expect(h.toasts).toEqual([['Story reset failed: setReadingProgress is not defined', 'error']]);
    });

    it('factory reset erases everything and returns to setup', async () => {
        FACTORY_RESET_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, 'x'));
        localStorage.setItem('ellipsisprose_theme', 'dark');
        const h = mount();
        await h.api().handleDeleteStory();
        expect(h.confirms[0]).toMatchObject({ title: 'Factory Reset: Erase All Stories & Library?', confirmLabel: 'Erase All Data' });
        expect(storage.storyStore.clear).not.toHaveBeenCalled();
        await h.confirm();

        expect(h.storyRef.current.id).toBe('story_default');
        FACTORY_RESET_STORAGE_KEYS.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
        expect(localStorage.getItem('ellipsisprose_theme')).toBe('dark');
        expect(storage.storyStore.clear).toHaveBeenCalled();
        expect(storage.storyStore.saveStory).toHaveBeenCalledWith('story_default', h.storyRef.current);
        expect(storage.imageStore.clear).toHaveBeenCalled();
        expect(storage.audioStore.clear).toHaveBeenCalled();
        expect(h.calls).toEqual([
            'setStory:story_default',
            'active:"story_default"',
            'vectorsClear',
            'selectedAct:null',
            'selectedSequence:null',
            'selectedScene:null',
            'clearSetupDraft',
            'libraryStories:[]',
            'libraryCovers:{}',
            'view:"setup"'
        ]);
        expect(h.toasts).toEqual([['All application data and stories erased.', 'success']]);
    });
});
