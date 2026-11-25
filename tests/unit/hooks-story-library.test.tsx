import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    deleteStoryRecord,
    duplicateStoryRecord,
    generateStoryId,
    listLibraryStories,
    loadLibraryExtras,
    pickMostRecentStory,
    type LibraryStores,
    type StoryRecord
} from '@/services/storage';
import { useStoryLibrary, type UseStoryLibraryResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Data = Record<string, unknown> & { id?: string; title?: string };

/** In-memory stand-ins for the four stores, recording what was written. */
function fakeStores(initial: StoryRecord[] = []) {
    const stories = new Map(initial.map((s) => [s.id, s]));
    const images = new Map<string, string>();
    const sceneAudio: Array<Record<string, unknown>> = [];
    const sequenceAudio: Array<Record<string, unknown>> = [];
    const clearedLogs: string[] = [];
    const deletedAudio: string[] = [];
    let clock = 1000;
    const stores = {
        storyStore: {
            listStories: vi.fn(async () => [...stories.values()].map((s) => ({ ...s }))),
            loadStory: vi.fn(async (id: string) => (stories.get(id)?.data as Record<string, unknown>) ?? null),
            saveStory: vi.fn(async (id: string, data: Record<string, unknown>) => {
                stories.set(id, { id, data, timestamp: ++clock });
            }),
            deleteStory: vi.fn(async (id: string) => {
                stories.delete(id);
            })
        },
        imageStore: {
            getImage: vi.fn(async (id: string) => images.get(id) ?? null),
            saveImage: vi.fn(async (id: string, dataUrl: string) => {
                images.set(id, dataUrl);
            }),
            deleteImage: vi.fn(async (id: string) => {
                images.delete(id);
            }),
            getImagesByPrefix: vi.fn(async (prefix: string) =>
                [...images.entries()].filter(([id]) => id.startsWith(prefix)).map(([id, dataUrl]) => ({ id, dataUrl }))
            )
        },
        logStore: {
            clearLogs: vi.fn(async (id: string) => {
                clearedLogs.push(id);
            })
        },
        audioStore: {
            countStoryAudio: vi.fn(async (id: string) => sceneAudio.filter((r) => r.storyId === id).length),
            getAllStoryAudioRecords: vi.fn(async (id: string) => sceneAudio.filter((r) => r.storyId === id)),
            saveSceneAudio: vi.fn(async (config: Record<string, unknown>) => {
                sceneAudio.push(config);
            }),
            getAllStorySequenceAudioRecords: vi.fn(async (id: string) => sequenceAudio.filter((r) => r.storyId === id)),
            saveSequenceAudio: vi.fn(async (config: Record<string, unknown>) => {
                sequenceAudio.push(config);
            }),
            deleteStoryAudio: vi.fn(async (id: string) => {
                deletedAudio.push(id);
            })
        }
    };
    return { stores: stores as unknown as LibraryStores, raw: stores, stories, images, sceneAudio, sequenceAudio, clearedLogs, deletedAudio };
}

const record = (id: string, title: string, timestamp = 1): StoryRecord => ({ id, data: { id, title }, timestamp });

describe('story library service', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('lists stories without the legacy record and overlays the open story', async () => {
        const f = fakeStores([record('current_story', 'legacy'), record('a', 'saved A'), record('b', 'B')]);
        const active = { id: 'a', title: 'unsaved A' };
        const list = await listLibraryStories(f.stores, active);
        expect(list.map((s) => s.id)).toEqual(['a', 'b']);
        expect(list[0].data).toBe(active);
    });

    it('adds the open story when it has never been saved, and survives a failing database', async () => {
        const f = fakeStores([record('a', 'A')]);
        const added = await listLibraryStories(f.stores, { id: 'new', title: 'N' }, () => 77);
        expect(added[1]).toEqual({ id: 'new', data: { id: 'new', title: 'N' }, timestamp: 77 });
        f.raw.storyStore.listStories.mockRejectedValueOnce(new Error('idb down'));
        expect((await listLibraryStories(f.stores, { id: 'new' })).map((s) => s.id)).toEqual(['new']);
        f.raw.storyStore.listStories.mockRejectedValueOnce(new Error('idb down'));
        expect(await listLibraryStories(f.stores, null)).toEqual([]);
    });

    it('loads covers and audio counts, skipping stories whose lookups fail', async () => {
        const f = fakeStores();
        f.images.set('cover_a', 'data:a');
        f.sceneAudio.push({ storyId: 'a' }, { storyId: 'a' });
        f.raw.imageStore.getImage.mockImplementationOnce(async () => {
            throw new Error('boom');
        });
        const extras = await loadLibraryExtras(f.stores, [{ id: 'broken' }, { id: 'a' }]);
        expect(extras).toEqual({ covers: { a: 'data:a' }, audioCounts: { broken: 0, a: 2 } });
        const noAudio = await loadLibraryExtras({ imageStore: f.stores.imageStore, audioStore: null }, [{ id: 'a' }]);
        expect(noAudio.audioCounts).toEqual({});
    });

    it('generates ids in the story_<time>_<random> form', () => {
        expect(generateStoryId(() => 5, () => 0.5)).toMatch(/^story_5_[a-z0-9]{1,5}$/);
    });

    it('duplicates a story with its cover, portraits and audio', async () => {
        const f = fakeStores([record('a', 'Saga')]);
        f.images.set('cover_a', 'data:cover');
        f.images.set('portrait_a_ashe', 'data:ashe');
        f.images.set('portrait_ab_other', 'data:other');
        f.sceneAudio.push({ storyId: 'a', seqIdx: 0, sceneIdx: 1, blob: 'blob', textHash: 'h', extra: 'dropped' });
        f.sequenceAudio.push({ storyId: 'a', seqIdx: 0, blob: 'seq', sceneHashes: ['h'] });
        const original = f.stories.get('a')!;
        const cloned = await duplicateStoryRecord(f.stores, original as { id: string; data: Data }, 'copy1');
        expect(cloned).toEqual({ id: 'copy1', title: 'Saga (Copy)' });
        expect(cloned).not.toBe(original.data);
        expect(f.stories.get('copy1')?.data).toEqual(cloned);
        expect(f.images.get('cover_copy1')).toBe('data:cover');
        expect(f.images.get('portrait_copy1_ashe')).toBe('data:ashe');
        expect([...f.images.keys()].filter((k) => k.includes('copy1'))).toHaveLength(2);
        expect(f.sceneAudio[1]).toEqual({
            storyId: 'copy1', seqIdx: 0, sceneIdx: 1, blob: 'blob', mimeType: undefined,
            durationSec: undefined, textHash: 'h', cueCount: undefined
        });
        expect(f.sequenceAudio[1]).toMatchObject({ storyId: 'copy1', blob: 'seq', sceneHashes: ['h'] });
    });

    it('titles an untitled copy and tolerates image or audio copy failures', async () => {
        const f = fakeStores();
        f.raw.imageStore.getImage.mockRejectedValue(new Error('no images'));
        f.raw.audioStore.getAllStoryAudioRecords.mockRejectedValue(new Error('no audio'));
        const cloned = await duplicateStoryRecord(f.stores, { id: 'a', data: { id: 'a' } }, 'copy2');
        expect(cloned.title).toBe('Untitled (Copy)');
        expect(f.stories.has('copy2')).toBe(true);
    });

    it('fails the duplication when the story itself cannot be saved', async () => {
        const f = fakeStores();
        f.raw.storyStore.saveStory.mockRejectedValueOnce(new Error('quota'));
        await expect(duplicateStoryRecord(f.stores, { id: 'a', data: { id: 'a' } }, 'c')).rejects.toThrow('quota');
    });

    it('deletes a story with logs, cover and audio, tolerating cover and audio failures', async () => {
        const f = fakeStores([record('a', 'A')]);
        f.images.set('cover_a', 'data:a');
        await deleteStoryRecord(f.stores, 'a');
        expect(f.stories.has('a')).toBe(false);
        expect(f.clearedLogs).toEqual(['a']);
        expect(f.images.has('cover_a')).toBe(false);
        expect(f.deletedAudio).toEqual(['a']);

        f.raw.imageStore.deleteImage.mockRejectedValueOnce(new Error('x'));
        f.raw.audioStore.deleteStoryAudio.mockRejectedValueOnce(new Error('y'));
        await expect(deleteStoryRecord(f.stores, 'b')).resolves.toBeUndefined();
    });

    it('picks the most recently saved remaining story', () => {
        const list = [record('current_story', 'legacy', 99), record('a', 'A', 5), record('b', 'B', 9), record('gone', 'G', 50)];
        expect(pickMostRecentStory(list, 'gone')?.id).toBe('b');
        expect(pickMostRecentStory([record('gone', 'G')], 'gone')).toBeNull();
        expect(list.map((s) => s.id)).toEqual(['current_story', 'a', 'b', 'gone']);
    });
});

describe('useStoryLibrary', () => {
    const roots: Root[] = [];
    beforeEach(() => {
        localStorage.clear();
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

    async function mount(options: { stories?: StoryRecord[]; activeId?: string; view?: string } = {}) {
        const f = fakeStores(options.stories ?? [record('a', 'A', 1), record('b', 'B', 2)]);
        const state = {
            story: { id: options.activeId ?? 'a', title: 'A (open)' } as Data,
            activeStoryId: options.activeId ?? 'a',
            view: options.view ?? 'library'
        };
        const deleted = { current: new Set<string>() };
        const toasts: Array<[string, string | undefined]> = [];
        const confirms: Array<{ title: string; onConfirm: () => void | Promise<void> }> = [];
        let latest: UseStoryLibraryResult | null = null;
        function Probe(): null {
            latest = useStoryLibrary<Data>({
                getActiveStory: () => state.story,
                setStory: (next) => {
                    state.story = typeof next === 'function' ? next(state.story) : next;
                },
                activeStoryId: state.activeStoryId,
                setActiveStoryId: (id) => {
                    state.activeStoryId = id;
                },
                view: state.view,
                deletedStoryIdsRef: deleted,
                showToast: (m, v) => toasts.push([m, v]),
                requestConfirm: (o) => confirms.push(o),
                stores: f.stores
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        await act(async () => root.render(<Probe />));
        const rerender = () => act(async () => root.render(<Probe />));
        return { f, state, deleted, toasts, confirms, current: () => latest as UseStoryLibraryResult, rerender };
    }

    it('loads the library when the library view is shown, with the open story overlaid', async () => {
        const h = await mount();
        expect(h.current().libraryStories.map((s) => s.id)).toEqual(['a', 'b']);
        expect(h.current().libraryStories[0].data.title).toBe('A (open)');
        expect(h.current().libraryAudioCounts).toEqual({ a: 0, b: 0 });
    });

    it('does not load on other views until the library is opened', async () => {
        const h = await mount({ view: 'writer' });
        expect(h.f.raw.storyStore.listStories).not.toHaveBeenCalled();
        h.state.view = 'library';
        await h.rerender();
        expect(h.current().libraryStories).toHaveLength(2);
    });

    it('persists view mode and sort order, and restores them', async () => {
        localStorage.setItem('ellipsisprose_library_sort_by', 'title');
        const h = await mount();
        expect(h.current().libraryViewMode).toBe('grid');
        expect(h.current().librarySortBy).toBe('title');
        await act(async () => h.current().setLibraryViewMode('list'));
        expect(localStorage.getItem('ellipsisprose_library_view_mode')).toBe('list');
    });

    it('updates the cover style in storage and, for the open story, in memory', async () => {
        const h = await mount();
        await act(() => h.current().handleUpdateStoryCoverStyle('a', 3));
        expect(h.f.stories.get('a')?.data.coverStyle).toBe(3);
        expect(h.state.story.coverStyle).toBe(3);
        await act(() => h.current().handleUpdateStoryCoverStyle('b', 2));
        expect(h.f.stories.get('b')?.data.coverStyle).toBe(2);
        expect(h.state.story.coverStyle).toBe(3);
        await act(() => h.current().handleUpdateStoryCoverStyle('missing', 1));
        expect(h.f.stories.has('missing')).toBe(false);
    });

    it('duplicates a story, refreshes and toasts; reports a failure', async () => {
        const h = await mount();
        await act(() => h.current().handleDuplicateStory(h.current().libraryStories[1]));
        expect(h.current().libraryStories).toHaveLength(3);
        expect(h.toasts).toEqual([['Duplicated as "B (Copy)"', 'success']]);
        h.f.raw.storyStore.saveStory.mockRejectedValueOnce(new Error('quota'));
        await act(() => h.current().handleDuplicateStory(h.current().libraryStories[1]));
        expect(h.toasts[1]).toEqual(['Failed to duplicate story: quota', 'error']);
        await act(() => h.current().handleDuplicateStory(null));
        expect(h.toasts).toHaveLength(2);
    });

    it('deleting another story needs confirmation and leaves the open story alone', async () => {
        const h = await mount();
        const stop = vi.fn();
        await act(() => h.current().handleDeleteLibraryStory(h.current().libraryStories[1], { stopPropagation: stop }));
        expect(stop).toHaveBeenCalled();
        expect(h.confirms[0].title).toBe('Permanently delete "B"?');
        expect(h.f.stories.has('b')).toBe(true);
        await act(async () => {
            await h.confirms[0].onConfirm();
        });
        expect(h.f.stories.has('b')).toBe(false);
        expect(h.deleted.current.has('b')).toBe(true);
        expect(h.state.activeStoryId).toBe('a');
        expect(h.current().libraryStories.map((s) => s.id)).toEqual(['a']);
        expect(h.toasts).toEqual([['Deleted "B"', 'success']]);
    });

    it('deleting the open story opens the most recent remaining one', async () => {
        const h = await mount({ stories: [record('a', 'A', 1), record('b', 'B', 2), record('c', 'C', 9)] });
        await act(() => h.current().handleDeleteLibraryStory(h.current().libraryStories[0]));
        await act(async () => {
            await h.confirms[0].onConfirm();
        });
        expect(h.state.activeStoryId).toBe('c');
        expect(h.state.story).toEqual({ id: 'c', title: 'C' });
        expect(localStorage.getItem('ellipsisprose_active_story_id')).toBe('c');
    });

    it('deleting the last story falls back to a saved blank default story', async () => {
        const h = await mount({ stories: [record('a', 'A', 1)] });
        await act(() => h.current().handleDeleteLibraryStory(h.current().libraryStories[0]));
        await act(async () => {
            await h.confirms[0].onConfirm();
        });
        expect(h.state.activeStoryId).toBe('story_default');
        expect(h.state.story.id).toBe('story_default');
        expect(h.f.stories.has('story_default')).toBe(true);
        expect(localStorage.getItem('ellipsisprose_active_story_id')).toBe('story_default');
    });

    it('reports a failed delete', async () => {
        const h = await mount();
        h.f.raw.storyStore.deleteStory.mockRejectedValueOnce(new Error('locked'));
        await act(() => h.current().handleDeleteLibraryStory(h.current().libraryStories[1]));
        await act(async () => {
            await h.confirms[0].onConfirm();
        });
        expect(h.toasts).toEqual([['Failed to delete story: locked', 'error']]);
    });
});
