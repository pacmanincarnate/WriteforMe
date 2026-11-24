import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService, VectorStore } from '@/services/rag';
import {
    AudioStore,
    diskSettingsVault,
    getVaultAvailabilityState,
    ImageStore,
    isLocalStorageVaultAvailable,
    isPersistableSettingsKey,
    isQuotaExceededIdbError,
    isRecoverableIdbConnectionError,
    LogStore,
    markLocalVaultUnavailable,
    probeLocalVaultAvailability,
    resetVaultDetectorForTests,
    StoryStore,
    StudioCacheStore
} from '@/services/storage';

const originalFetch = globalThis.fetch;
let dbSeq = 0;
const uniqueDb = (prefix: string): string => `${prefix}_${Date.now()}_${++dbSeq}`;

beforeEach(() => {
    resetVaultDetectorForTests();
    localStorage.clear();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    resetVaultDetectorForTests();
    vi.restoreAllMocks();
});

describe('services/storage vaultDetector & diskSettingsVault', () => {
    it('immediately marks static origins and file:// unavailable without network fetch', async () => {
        const fetchSpy = vi.fn<typeof fetch>();
        globalThis.fetch = fetchSpy;

        expect(
            await probeLocalVaultAvailability({
                protocol: 'https:',
                hostname: 'pacmanincarnate.github.io'
            })
        ).toBe(false);
        expect(isLocalStorageVaultAvailable({ protocol: 'file:', hostname: '' })).toBe(false);
        expect(getVaultAvailabilityState()).toBe('unavailable');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('probes /api/storage/status at most once on localhost 200 JSON vs 404 / HTML fallback', async () => {
        const statusOk = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ ok: true, dataDir: '/tmp/data' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        globalThis.fetch = statusOk;

        const [p1, p2] = await Promise.all([
            probeLocalVaultAvailability({ protocol: 'http:', hostname: '127.0.0.1' }),
            probeLocalVaultAvailability({ protocol: 'http:', hostname: '127.0.0.1' })
        ]);
        expect(p1).toBe(true);
        expect(p2).toBe(true);
        expect(isLocalStorageVaultAvailable({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(
            true
        );
        expect(statusOk).toHaveBeenCalledTimes(1);

        resetVaultDetectorForTests();
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('<html>Not Found</html>', {
                status: 404,
                headers: { 'Content-Type': 'text/html' }
            })
        );
        expect(
            await probeLocalVaultAvailability({ protocol: 'http:', hostname: 'localhost' })
        ).toBe(false);
        // Subsequent probes do not retry once marked unavailable
        expect(
            await probeLocalVaultAvailability({ protocol: 'http:', hostname: 'localhost' })
        ).toBe(false);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        resetVaultDetectorForTests();
        markLocalVaultUnavailable();
        expect(getVaultAvailabilityState()).toBe('unavailable');
    });

    it('filters persistable settings keys and hydrates localStorage from disk vault', async () => {
        expect(isPersistableSettingsKey('gemini_api_key')).toBe(true);
        expect(isPersistableSettingsKey('ellipsisprose_theme')).toBe(true);
        expect(isPersistableSettingsKey('kokoro_voice')).toBe(true);
        expect(isPersistableSettingsKey('ellipsisprose_story')).toBe(false);
        expect(isPersistableSettingsKey('ellipsisprose_rag_fingerprint')).toBe(false);
        expect(isPersistableSettingsKey('unrelated_key')).toBe(false);

        const fetchSpy = vi.fn<typeof fetch>(async (url) => {
            const urlStr = String(url);
            if (urlStr === '/api/storage/status') {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (urlStr === '/api/storage/settings') {
                return new Response(
                    JSON.stringify({
                        ok: true,
                        settings: {
                            ellipsisprose_theme: 'dark',
                            gemini_api_key: 'test-gemini-key'
                        }
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response('Not found', { status: 404 });
        });
        globalThis.fetch = fetchSpy;

        const hydrated = await diskSettingsVault.hydrateBeforeMount();
        expect(hydrated).toBe(true);
        expect(localStorage.getItem('ellipsisprose_theme')).toBe('dark');
        expect(localStorage.getItem('gemini_api_key')).toBe('test-gemini-key');
        expect(diskSettingsVault.isReady()).toBe(true);
    });
});

describe('services/storage IndexedDB stores', () => {
    it('classifies recoverable IDB connection errors and quota errors', () => {
        expect(isRecoverableIdbConnectionError({ name: 'InvalidStateError', message: '' })).toBe(
            true
        );
        expect(
            isRecoverableIdbConnectionError(new Error('The database connection is closing'))
        ).toBe(true);
        expect(isQuotaExceededIdbError({ name: 'QuotaExceededError', message: '' })).toBe(true);
        expect(isQuotaExceededIdbError({ code: 22 })).toBe(true);
        expect(isQuotaExceededIdbError(new Error('Normal error'))).toBe(false);
    });

    it('persists, loads, lists, guards regression, and deletes stories in StoryStore', async () => {
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
        );
        const store = new StoryStore(uniqueDb('TestStoryDB'));

        await store.saveStory('s1', {
            id: 's1',
            title: 'The Salt Clock',
            concept: 'Archivist investigates forged ledgers',
            sequences: [{ title: 'Act 1', summary: 'Intro' }],
            scenes: { '0': [{ title: 'S1', synopsis: 'Ledger inspect' }] },
            prose: { '0-0': { final: 'Maren opened the cellar door slowly.' } }
        });

        const loaded = await store.loadStory('s1');
        expect(loaded?.title).toBe('The Salt Clock');

        // Anti-regression guard should keep rich in-memory story over empty template
        await store.saveStory('s1', { id: 's1', title: '', sequences: [] });
        const afterBlank = await store.loadStory('s1');
        expect(afterBlank?.title).toBe('The Salt Clock');

        const list = await store.listStories();
        expect(list.some((r) => r.id === 's1')).toBe(true);

        await store.deleteStory('s1');
        // After deleting, wait for fresh lookup and clear mem cache path
        expect(await store.loadStory('s1')).toBeNull();
    });

    it('saves, queries by prefix, and deletes images in ImageStore', async () => {
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
        );
        const images = new ImageStore(uniqueDb('TestImageDB'));

        await images.saveImage('s1_cover', 'data:image/png;base64,AAA');
        await images.saveImage('s1_scene_0', 'data:image/png;base64,BBB');
        await images.saveImage('s2_cover', 'data:image/png;base64,CCC');

        expect(await images.getImage('s1_cover')).toBe('data:image/png;base64,AAA');
        const s1Images = await images.getImagesByPrefix('s1_');
        expect(s1Images).toHaveLength(2);

        await images.deleteImagesByPrefix('s1_');
        expect(await images.getImage('s1_cover')).toBeNull();
        expect(await images.getImage('s2_cover')).toBe('data:image/png;base64,CCC');
    });

    it('saves and loads verbose logs in LogStore and compacts oversized payloads', async () => {
        const logs = new LogStore(uniqueDb('TestLogDB'));
        await logs.saveLogs('s1', [{ agent: 'Writer', prompt: 'p', response: 'ok' }]);
        const loaded = await logs.loadLogs('s1');
        expect(loaded).toHaveLength(1);

        const hugeText = 'x'.repeat(3000);
        const compacted = logs._compactLogsForQuota(
            [{ prompt: hugeText, response: hugeText }],
            10,
            100
        ) as Array<{ prompt: string; response: string }>;
        expect(compacted[0].prompt).toContain('[truncated for storage quota]');

        await logs.clearLogs('s1');
        expect(await logs.loadLogs('s1')).toEqual([]);
    });

    it('caches voices and renders in StudioCacheStore and persists audio metadata in AudioStore', async () => {
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
        );

        const cache = new StudioCacheStore(uniqueDb('TestStudioCacheDB'));
        await cache.putVoice('story1_maren_voice', { speakerKey: 'Maren', pitch: 1 });
        const voice = await cache.getVoice('story1_maren_voice');
        expect(voice?.speakerKey).toBe('Maren');

        await cache.putRender('story1_r1', { text: 'Hello' });
        expect((await cache.getRender('story1_r1'))?.text).toBe('Hello');
        await cache.clearRendersForStory('story1');
        expect(await cache.getRender('story1_r1')).toBeNull();

        const audio = new AudioStore(uniqueDb('TestAudioDB'));
        const mp3Blob = new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], {
            type: 'audio/mpeg'
        });
        await audio.saveSceneAudio({
            storyId: 'story_a',
            seqIdx: 0,
            sceneIdx: 0,
            blob: mp3Blob,
            durationSec: 4.5,
            textHash: 'abc123'
        });
        const sceneMeta = await audio.listStoryAudioMeta('story_a');
        expect(sceneMeta).toHaveLength(1);
        expect(sceneMeta[0].textHash).toBe('abc123');
        expect(await audio.countStoryAudio('story_a')).toBe(1);

        await audio.saveSequenceAudio({
            storyId: 'story_a',
            seqIdx: 0,
            blob: mp3Blob,
            durationSec: 12,
            includedSceneIndices: [0]
        });
        const seqMeta = await audio.listStorySequenceAudioMeta('story_a');
        expect(seqMeta).toHaveLength(1);
        expect(seqMeta[0].includedSceneIndices).toEqual([0]);

        await audio.deleteStoryAudio('story_a');
        expect(await audio.countStoryAudio('story_a')).toBe(0);
    });
});

describe('services/rag EmbeddingService & VectorStore', () => {
    it('routes embeddings by provider and executes semantic search in VectorStore', async () => {
        globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ embedding: { values: [1, 0, 0] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );

        const embed = new EmbeddingService('gem-key', 'gemini');
        expect(embed.isConfigured()).toBe(true);
        expect(embed.getProviderLabel()).toBe('gemini|gemini-embedding-001');
        expect(await embed.getEmbedding('   ')).toBeNull();
        expect(await embed.getEmbedding('Salt clock')).toEqual([1, 0, 0]);

        const vectors = new VectorStore(uniqueDb('TestVectorDB'));
        await vectors.add('v1', 'Harbor clock', [1, 0, 0], { act: 1 });
        await vectors.add('v2', 'Desert caravan', [0, 1, 0], { act: 2 });

        const hits = await vectors.search([0.99, 0.05, 0], 2, 0.8);
        expect(hits).toHaveLength(1);
        expect(hits[0].id).toBe('v1');

        const redundant = await vectors.checkRedundancy([1, 0, 0], 0.9);
        expect(redundant?.id).toBe('v1');

        await vectors.clear();
        expect(await vectors.getAll()).toEqual([]);
    });
});
