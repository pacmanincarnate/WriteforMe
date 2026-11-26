import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    backfillSceneDefaults,
    hydrateFallbackStory,
    hydrateStoredStory,
    isBlankStory,
    pickRecoverableStory,
    pickStartupFallbackStory,
    prepareLibraryStorySelection
} from '@/domain/lifecycle';
import { updateStoryRecordById, type StoryUpdateDeps } from '@/services/storage';
import {
    shouldAutosaveStory,
    useEnsureStoryId,
    useStoryAutosave,
    useStoryHydration,
    type StoryHydrationLateDeps
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Data = Record<string, unknown> & { id?: string };

const written = (id: string, title = 'Saga'): Data => ({
    id,
    title,
    concept: 'A ferryman keeps a ledger.',
    cast: [{ id: 'char_a', name: 'Ashe' }],
    acts: [{ number: 1, title: 'Act I' }],
    sequences: [{ number: 1, parent_act: 1, title: 'Seq' }],
    scenes: { '0': [{ id: '1.1', number: '1.1', title: 'Scene', end_valence: '3' }] },
    prose: { '0-0': { final: 'Some real prose for the first scene.' } },
    lore: [{ topic: 'Harbour', detail: 'Vey' }]
});
const blank = (id: string): Data => ({ id, title: '' });
const record = (data: Data, timestamp: number) => ({ id: data.id as string, data, timestamp });

describe('story hydration (pure)', () => {
    it('backfills scene valence and leaves existing values alone', () => {
        const story = { scenes: { '0': [{ end_valence: '4' }, { valence: -2, end_valence: '9' }, { end_valence: 'n/a' }], bad: 'x' } };
        backfillSceneDefaults(story);
        expect((story.scenes['0'] as Array<{ valence?: number }>).map((s) => s.valence)).toEqual([4, -2, 0]);
        expect(() => backfillSceneDefaults(null)).not.toThrow();
        expect(() => backfillSceneDefaults({})).not.toThrow();
    });

    it('keeps an explicit narrative mode', () => {
        const story = { scenes: { '0': [{ dominant_narrative_mode: 'REFLECTION', title: 'A chase through the docks' }] } };
        backfillSceneDefaults(story);
        expect(story.scenes['0'][0].dominant_narrative_mode).toBe('REFLECTION');
    });

    it('hydrates a stored story with defaults, the given id and an epistemic graph', () => {
        const stored = { ...written('old-id'), world_primer: 'primer' };
        const { story, worldPrimer, migrated } = hydrateStoredStory(stored, 'resolved');
        expect(story.id).toBe('resolved');
        expect(worldPrimer).toBe('primer');
        expect(story).toMatchObject({ world_primer: 'primer', relationships: {}, graph_edges: [], continuity_ledger: [], secret_vault: [] });
        expect((story.epistemic_graph as { propositions: unknown }).propositions).toBeDefined();
        expect((story.scenes as Record<string, Array<{ valence: number }>>)['0'][0].valence).toBe(3);
        expect(Array.isArray(migrated.lore)).toBe(true);
    });

    it('keeps stored relationships and ledgers, and defaults a missing primer to null', () => {
        const stored = { ...written('a'), relationships: { r: 1 }, continuity_ledger: [{ e: 1 }], secret_vault: 'corrupt' };
        const { story, worldPrimer } = hydrateStoredStory(stored, 'a');
        expect(story.relationships).toEqual({ r: 1 });
        expect(story.continuity_ledger).toEqual([{ e: 1 }]);
        expect(story.secret_vault).toEqual([]);
        expect(worldPrimer).toBeNull();
    });

    it('hydrates a startup fallback record under its own id', () => {
        const { story, worldPrimer } = hydrateFallbackStory(record({ ...written('x'), world_primer: 'wp' }, 1));
        expect(story.id).toBe('x');
        expect(worldPrimer).toBe('wp');
        expect(story.epistemic_graph).toBeDefined();
        expect(hydrateFallbackStory({ id: 'empty', data: null }).story.id).toBe('empty');
    });

    it('prepares a library selection without building a graph or primer', () => {
        const story = prepareLibraryStorySelection(written('a'), 'picked');
        expect(story).toMatchObject({ id: 'picked', relationships: {}, graph_edges: [], continuity_ledger: [], secret_vault: [] });
        expect('world_primer' in story).toBe(false);
    });

    it('recognises blank stories and picks what to open at startup', () => {
        expect(isBlankStory(null)).toBe(true);
        expect(isBlankStory(blank('b'))).toBe(true);
        expect(isBlankStory(written('w'))).toBe(false);

        const records = [record(written('old'), 1), record(blank('newest-blank'), 9), record(written('new'), 5), record(written('current_story'), 99)];
        expect(pickRecoverableStory(records)?.id).toBe('new');
        expect(pickRecoverableStory([record(blank('b'), 1)])).toBeNull();
        expect(pickStartupFallbackStory(records)?.id).toBe('new');
        expect(pickStartupFallbackStory([record(blank('b1'), 1), record(blank('b2'), 2)])?.id).toBe('b2');
        expect(pickStartupFallbackStory([record(written('current_story'), 1)])).toBeNull();
        expect(records.map((r) => r.id)).toEqual(['old', 'newest-blank', 'new', 'current_story']);
    });
});

describe('updateStoryRecordById', () => {
    function setup(active: Data | null = written('open')) {
        const state = { active };
        const saved: Array<[string, Data]> = [];
        const stored: Record<string, Data> = { other: written('other', 'Stored') };
        const deps: StoryUpdateDeps<Data> = {
            deletedStoryIds: new Set<string>(),
            getActiveStory: () => state.active,
            setStory: (updater) => (state.active = updater(state.active as Data)),
            snapshots: {},
            store: {
                loadStory: async (id) => stored[id] ?? null,
                saveStory: async (id, story) => void saved.push([id, story as Data])
            },
            createDefaultStory: (id) => ({ id, title: 'blank' })
        };
        return { deps, state, saved };
    }

    it('patches the open story through app state and saves it', async () => {
        const { deps, state, saved } = setup();
        const result = await updateStoryRecordById(deps, 'open', { title: 'Patched' });
        expect(result?.title).toBe('Patched');
        expect(state.active).toBe(result);
        expect(deps.snapshots.open).toBe(result);
        expect(saved).toEqual([['open', result]]);
    });

    it('updates another story from storage without touching the open one', async () => {
        const { deps, state, saved } = setup();
        const result = await updateStoryRecordById(deps, 'other', (base) => ({ ...base, logline: 'bg' }));
        expect(result).toMatchObject({ id: 'other', title: 'Stored', logline: 'bg' });
        expect(state.active?.id).toBe('open');
        expect(state.active?.logline).toBeUndefined();
        expect(saved[0][0]).toBe('other');
        const again = await updateStoryRecordById(deps, 'other', { step: 2 });
        expect(again).toMatchObject({ logline: 'bg', step: 2 });
    });

    it('starts from a blank template for an unknown story', async () => {
        const { deps } = setup();
        expect(await updateStoryRecordById(deps, 'brand-new', { concept: 'c' })).toEqual({ id: 'brand-new', title: 'blank', concept: 'c' });
    });

    it('drops updates for missing or deleted ids, even when deleted mid-load', async () => {
        const { deps, saved } = setup();
        expect(await updateStoryRecordById(deps, '', { a: 1 })).toBeNull();
        (deps.deletedStoryIds as Set<string>).add('gone');
        expect(await updateStoryRecordById(deps, 'gone', { a: 1 })).toBeNull();
        deps.store.loadStory = async (id) => {
            (deps.deletedStoryIds as Set<string>).add(id);
            return written(id);
        };
        const result = await updateStoryRecordById(deps, 'racing', { a: 1 });
        expect(result?.a).toBe(1);
        expect(saved).toEqual([]);
    });

    it('survives a failed save', async () => {
        const { deps } = setup();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        deps.store.saveStory = async () => {
            throw new Error('quota');
        };
        await expect(updateStoryRecordById(deps, 'open', { title: 'x' })).resolves.toMatchObject({ title: 'x' });
        vi.restoreAllMocks();
    });
});

describe('persistence hooks', () => {
    const roots: Root[] = [];
    beforeEach(() => {
        localStorage.clear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
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

    function mountHydration(options: {
        activeId?: string;
        stored?: Data[];
        skipId?: string | null;
        initial?: boolean;
        view?: string;
        embeddings?: boolean;
        loadFails?: boolean;
    } = {}) {
        const stored = new Map((options.stored ?? []).map((s, i) => [s.id as string, record(s, i + 1)]));
        const state = { activeStoryId: options.activeId ?? 'a', story: null as Data | null };
        const refs = {
            isInitialMount: { current: options.initial ?? true },
            hasHydrated: { current: false },
            skip: { current: options.skipId ?? null }
        };
        const calls: string[] = [];
        const ingests: Array<[unknown[], Record<string, unknown>]> = [];
        const store = {
            loadStory: vi.fn(async (id: string) => {
                if (options.loadFails) throw new Error('idb');
                return stored.get(id)?.data ?? null;
            }),
            listStories: vi.fn(async () => [...stored.values()]),
            saveStory: vi.fn(async (id: string, data: Record<string, unknown>) => {
                stored.set(id, record(data as Data, 100));
            })
        };
        const late: StoryHydrationLateDeps = {
            setWorldPrimer: (p) => calls.push(`primer:${String(p)}`),
            vectorStore: { current: {} },
            embeddingService: { current: { isConfigured: () => !!options.embeddings, getProviderLabel: () => 'test' } },
            ingestLoreBatch: async (lore, opts) => void ingests.push([lore, opts]),
            refreshLibrary: () => calls.push('refreshLibrary'),
            setView: (v) => calls.push(`view:${v}`),
            view: options.view ?? 'dashboard'
        };
        function Probe(): null {
            useStoryHydration({
                activeStoryId: state.activeStoryId,
                setActiveStoryId: (id) => {
                    calls.push(`active:${id}`);
                    state.activeStoryId = id;
                },
                setStory: (story) => {
                    state.story = story as Data;
                },
                isInitialMountRef: refs.isInitialMount,
                hasHydratedStoryRef: refs.hasHydrated,
                skipNextIdbHydrationIdRef: refs.skip,
                getLateDeps: () => late,
                store
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        const render = () => act(async () => root.render(<Probe />));
        return { state, refs, calls, ingests, store, render };
    }

    it('loads the active story, marks it hydrated and remembers the id', async () => {
        const h = mountHydration({ stored: [{ ...written('a'), world_primer: 'wp' }] });
        await h.render();
        expect(h.state.story?.id).toBe('a');
        expect(h.state.story?.epistemic_graph).toBeDefined();
        expect(h.refs.hasHydrated.current).toBe(true);
        expect(h.refs.isInitialMount.current).toBe(false);
        expect(h.calls).toEqual(['primer:wp']);
        expect(localStorage.getItem('ellipsisprose_active_story_id')).toBe('a');
    });

    it('refreshes the library when it is the visible view', async () => {
        const h = mountHydration({ stored: [written('a')], view: 'library' });
        await h.render();
        expect(h.calls).toContain('refreshLibrary');
    });

    it('skips the load once when the story was already put in state', async () => {
        const h = mountHydration({ stored: [written('a')], skipId: 'a' });
        await h.render();
        expect(h.store.loadStory).not.toHaveBeenCalled();
        expect(h.refs.skip.current).toBeNull();
        expect(h.refs.hasHydrated.current).toBe(true);
        expect(h.refs.isInitialMount.current).toBe(false);
    });

    it('at startup, opens the newest story with content instead of a blank active one', async () => {
        const h = mountHydration({ activeId: 'blank', stored: [blank('blank'), written('real-old'), written('real-new')] });
        await h.render();
        expect(h.calls).toContain('active:real-new');
        expect(h.state.story?.id).toBe('real-new');
        expect(h.refs.skip.current === 'real-new' || h.refs.skip.current === null).toBe(true);
    });

    it('keeps a blank active story when nothing better exists', async () => {
        const h = mountHydration({ activeId: 'blank', stored: [blank('blank')] });
        await h.render();
        expect(h.state.story?.id).toBe('blank');
        expect(h.calls.filter((c) => c.startsWith('active:'))).toEqual([]);
    });

    it('at startup with a missing active id, falls back to the most recent story', async () => {
        const h = mountHydration({ activeId: 'missing', stored: [written('one'), blank('two')] });
        await h.render();
        expect(h.calls).toContain('active:one');
        expect(h.state.story?.id).toBe('one');
        expect(h.refs.hasHydrated.current).toBe(true);
    });

    it('on first run creates and saves a blank default story and shows Setup', async () => {
        const h = mountHydration({ activeId: 'missing', stored: [] });
        await h.render();
        expect(h.store.saveStory).toHaveBeenCalledWith('story_default', expect.objectContaining({ id: 'story_default' }));
        expect(h.state.story?.id).toBe('story_default');
        expect(h.calls).toEqual(['active:story_default', 'primer:null', 'view:setup']);
        expect(h.refs.hasHydrated.current).toBe(true);
    });

    it('after startup, a missing story is left alone rather than replaced', async () => {
        const h = mountHydration({ activeId: 'missing', stored: [written('one')], initial: false });
        await h.render();
        expect(h.state.story).toBeNull();
        expect(h.refs.hasHydrated.current).toBe(false);
        expect(h.store.listStories).not.toHaveBeenCalled();
    });

    it('a failed load leaves the story unhydrated so autosave cannot overwrite it', async () => {
        const h = mountHydration({ stored: [written('a')], loadFails: true });
        await h.render();
        expect(h.state.story).toBeNull();
        expect(h.refs.hasHydrated.current).toBe(false);
    });

    it('indexes lore after loading only when embeddings are configured and the index is stale', async () => {
        vi.useFakeTimers();
        const configured = mountHydration({ stored: [written('a')], embeddings: true });
        await configured.render();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(configured.ingests).toHaveLength(1);
        expect(configured.ingests[0][1]).toMatchObject({ clearExisting: true, deduplicate: false, storyId: 'a', status: 'indexing', throwOnError: true });

        const unconfigured = mountHydration({ stored: [written('a')], embeddings: false });
        await unconfigured.render();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(unconfigured.ingests).toEqual([]);
    });

    it('decides when autosave may write', () => {
        expect(shouldAutosaveStory({ id: 'a' }, 'a', true)).toBe(true);
        expect(shouldAutosaveStory({ id: 'a' }, 'a', false)).toBe(false);
        expect(shouldAutosaveStory({ id: 'a' }, 'b', true)).toBe(false);
        expect(shouldAutosaveStory({}, 'a', true)).toBe(false);
        expect(shouldAutosaveStory(null, 'a', true)).toBe(false);
        expect(shouldAutosaveStory({ id: 'a' }, '', true)).toBe(false);
    });

    it('useStoryAutosave saves on change once hydrated, and never before', async () => {
        const saveStory = vi.fn(async () => undefined);
        const hasHydrated = { current: false };
        const state = { story: { id: 'a', title: 'one' } as Data, activeStoryId: 'a' };
        function Probe(): null {
            useStoryAutosave({ story: state.story, activeStoryId: state.activeStoryId, hasHydratedStoryRef: hasHydrated, store: { saveStory } });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        const render = () => act(async () => root.render(<Probe />));
        await render();
        expect(saveStory).not.toHaveBeenCalled();
        hasHydrated.current = true;
        state.story = { id: 'a', title: 'two' };
        await render();
        expect(saveStory).toHaveBeenCalledWith('a', state.story);
        await render();
        expect(saveStory).toHaveBeenCalledTimes(1);
        state.activeStoryId = 'b';
        await render();
        expect(saveStory).toHaveBeenCalledTimes(1);
    });

    it('useEnsureStoryId assigns an id to a story without one', async () => {
        const state = { story: { title: 'no id' } as Data, active: '' };
        function Probe(): null {
            useEnsureStoryId<Data>({
                story: state.story,
                setActiveStoryId: (id) => (state.active = id),
                setStory: (updater) => (state.story = updater(state.story))
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        await act(async () => root.render(<Probe />));
        expect(state.story.id).toMatch(/^story_\d+_/);
        expect(state.active).toBe(state.story.id);
        const assigned = state.story.id;
        await act(async () => root.render(<Probe />));
        expect(state.story.id).toBe(assigned);
    });
});
