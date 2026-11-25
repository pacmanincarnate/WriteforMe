/**
 * @module services/storage/studioCacheStore
 * IndexedDB cache for Audio Drama Studio cloned/designed voices (`voices` store)
 * and rendered audio segments (`renders` store) with LRU RAM caching and quota pruning.
 */

import { ensureMp3AudioBlob } from '@/services/audio/codec';
import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';

export interface StudioVoiceRecord {
    key: string;
    speakerKey?: string;
    timestamp: number;
    [prop: string]: unknown;
}

export interface StudioRenderRecord {
    id: string;
    audioBlob?: Blob;
    timestamp: number;
    [prop: string]: unknown;
}

interface RenderMetaEntry {
    id: string;
    timestamp: number;
    size: number;
}

/** IndexedDB cache for hybrid studio masters, anchors, and rendered chunks. */
export class StudioCacheStore extends ResilientIdbStore {
    private _memRenders: Map<string, StudioRenderRecord>;

    constructor(dbName = 'EllipsisStudioCache') {
        super(dbName, 1);
        this._memRenders = new Map();
    }

    private _setMemRender(id: string, record: StudioRenderRecord): void {
        if (this._memRenders.has(id)) this._memRenders.delete(id);
        this._memRenders.set(id, record);
        while (this._memRenders.size > 6) {
            const oldestKey = this._memRenders.keys().next().value;
            if (oldestKey === undefined) break;
            this._memRenders.delete(oldestKey);
        }
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains('voices')) {
            db.createObjectStore('voices', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('renders')) {
            db.createObjectStore('renders', { keyPath: 'id' });
        }
    }

    async getVoice(key: string): Promise<StudioVoiceRecord | null> {
        try {
            return await this.runTransaction<StudioVoiceRecord | null>(
                'voices',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const req = tx.objectStore('voices').get(key);
                    req.onsuccess = () =>
                        resolve((req.result as StudioVoiceRecord | undefined) || null);
                    req.onerror = () => reject(req.error);
                }
            );
        } catch (err) {
            console.warn('[StudioCacheStore] getVoice failed:', err);
            return null;
        }
    }

    async putVoice(key: string, data: Record<string, unknown>): Promise<void> {
        const writeVoice = (): Promise<void> =>
            this.runTransaction<void>('voices', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('voices').put({ key, ...data, timestamp: Date.now() });
                tx.oncomplete = () => resolve();
            });
        try {
            await writeVoice();
        } catch (err) {
            if (isQuotaExceededIdbError(err)) {
                const freed = await this.evictOldestRenders(20 * 1024 * 1024, 0.5);
                if (freed > 0) {
                    try {
                        await writeVoice();
                        return;
                    } catch (retryErr) {
                        console.warn('[StudioCacheStore] putVoice retry failed:', retryErr);
                        return;
                    }
                }
            }
            console.warn('[StudioCacheStore] putVoice failed:', err);
        }
    }

    async getRender(id: string): Promise<StudioRenderRecord | null> {
        if (this._memRenders.has(id)) {
            return this._memRenders.get(id) ?? null;
        }
        try {
            return await this.runTransaction<StudioRenderRecord | null>(
                'renders',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const req = tx.objectStore('renders').get(id);
                    req.onsuccess = () =>
                        resolve((req.result as StudioRenderRecord | undefined) || null);
                    req.onerror = () => reject(req.error);
                }
            );
        } catch (err) {
            console.warn('[StudioCacheStore] getRender failed:', err);
            return null;
        }
    }

    private async _listRenderMeta(): Promise<RenderMetaEntry[]> {
        return this.runTransaction<RenderMetaEntry[]>(
            'renders',
            'readonly',
            (tx, _db, resolve, reject) => {
                const entries: RenderMetaEntry[] = [];
                const req = tx.objectStore('renders').openCursor();
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (cursor) {
                        const val = cursor.value as StudioRenderRecord | undefined;
                        entries.push({
                            id: String(cursor.key),
                            timestamp: Number(val?.timestamp) || 0,
                            size: Number(val?.audioBlob?.size) || 0
                        });
                        cursor.continue();
                    } else {
                        resolve(entries);
                    }
                };
                req.onerror = () => reject(req.error);
            }
        );
    }

    private async _deleteRenderIds(ids: string[]): Promise<number> {
        if (!Array.isArray(ids) || ids.length === 0) return 0;
        await this.runTransaction<void>('renders', 'readwrite', (tx, _db, resolve) => {
            const store = tx.objectStore('renders');
            for (const id of ids) {
                store.delete(id);
            }
            tx.oncomplete = () => resolve();
        });
        return ids.length;
    }

    async deleteRenderIds(ids: string[]): Promise<number> {
        if (!Array.isArray(ids) || ids.length === 0) return 0;
        for (const id of ids) {
            this._memRenders.delete(id);
        }
        try {
            return await this._deleteRenderIds(ids);
        } catch (err) {
            console.warn('[StudioCacheStore] deleteRenderIds failed:', err);
            return 0;
        }
    }

    async evictOldestRenders(
        targetFreeBytes = 40 * 1024 * 1024,
        minFraction = 0.5,
        excludeId: string | null = null
    ): Promise<number> {
        try {
            const entries = (await this._listRenderMeta()).filter((e) => e.id !== excludeId);
            if (entries.length === 0) return 0;
            entries.sort((a, b) => a.timestamp - b.timestamp);
            const minCount = Math.max(1, Math.ceil(entries.length * minFraction));
            const toDelete: string[] = [];
            let freedBytes = 0;
            for (const entry of entries) {
                if (toDelete.length >= minCount && freedBytes >= targetFreeBytes) break;
                toDelete.push(entry.id);
                freedBytes += entry.size;
            }
            if (toDelete.length > 0) {
                await this._deleteRenderIds(toDelete);
                console.log(
                    `[StudioCacheStore] Evicted ${toDelete.length} oldest cached segment(s) (~${(
                        freedBytes /
                        (1024 * 1024)
                    ).toFixed(1)} MB) to free IndexedDB quota.`
                );
            }
            return toDelete.length;
        } catch (err) {
            console.warn('[StudioCacheStore] evictOldestRenders failed:', err);
            return 0;
        }
    }

    async pruneRenders({
        maxEntries = 16,
        maxBytes = 45 * 1024 * 1024,
        excludeId = null
    }: { maxEntries?: number; maxBytes?: number; excludeId?: string | null } = {}): Promise<number> {
        try {
            const entries = await this._listRenderMeta();
            let totalBytes = entries.reduce((acc, e) => acc + e.size, 0);
            let remainingCount = entries.length;
            if (remainingCount <= maxEntries && totalBytes <= maxBytes) return 0;

            entries.sort((a, b) => a.timestamp - b.timestamp);
            const toDelete: string[] = [];
            for (const entry of entries) {
                if (remainingCount <= maxEntries && totalBytes <= maxBytes) break;
                if (entry.id === excludeId) continue;
                toDelete.push(entry.id);
                remainingCount--;
                totalBytes -= entry.size;
            }
            if (toDelete.length > 0) {
                await this._deleteRenderIds(toDelete);
            }
            return toDelete.length;
        } catch (err) {
            console.warn('[StudioCacheStore] pruneRenders failed:', err);
            return 0;
        }
    }

    async putRender(id: string, data: Record<string, unknown>): Promise<void> {
        let preparedData = data;
        const rawBlob = preparedData?.audioBlob;
        if (rawBlob instanceof Blob && rawBlob.size > 0 && rawBlob.type !== 'audio/mpeg') {
            const mp3Blob = await ensureMp3AudioBlob(rawBlob, 128);
            preparedData = { ...preparedData, audioBlob: mp3Blob };
        }
        const record: StudioRenderRecord = { id, ...preparedData, timestamp: Date.now() };
        this._setMemRender(id, record);

        // Proactive origin quota guard: if browser storage is tight, avoid pushing IndexedDB into best-effort eviction
        try {
            if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
                const est = await navigator.storage.estimate();
                const quota = Number(est?.quota) || 0;
                const usage = Number(est?.usage) || 0;
                if (quota > 0 && (usage / quota > 0.55 || quota - usage < 120 * 1024 * 1024)) {
                    await this.clearAllRenders({ keepMemory: true });
                    return;
                }
            }
        } catch {
            // Ignore navigator.storage.estimate errors
        }

        const writeOnce = (): Promise<void> =>
            this.runTransaction<void>('renders', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('renders').put(record);
                tx.oncomplete = () => resolve();
            });

        try {
            await writeOnce();
            await this.pruneRenders({
                maxEntries: 16,
                maxBytes: 45 * 1024 * 1024,
                excludeId: id
            });
        } catch (err) {
            if (isQuotaExceededIdbError(err)) {
                const blobBytes =
                    data?.audioBlob instanceof Blob ? Number(data.audioBlob.size) || 0 : 0;
                const evicted = await this.evictOldestRenders(
                    Math.max(40 * 1024 * 1024, blobBytes * 3),
                    0.5,
                    id
                );
                if (evicted > 0) {
                    try {
                        await writeOnce();
                        return;
                    } catch (retryErr) {
                        console.warn(
                            '[StudioCacheStore] putRender retry after eviction failed (kept in RAM):',
                            retryErr
                        );
                        return;
                    }
                }
            }
            console.warn('[StudioCacheStore] putRender failed (kept in RAM):', err);
        }
    }

    async clearVoicesForStory(storyId: string): Promise<void> {
        try {
            await this.runTransaction<void>('voices', 'readwrite', (tx, _db, resolve, reject) => {
                const store = tx.objectStore('voices');
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (cursor) {
                        if (String(cursor.key).startsWith(storyId + '_')) {
                            cursor.delete();
                        }
                        cursor.continue();
                    }
                };
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[StudioCacheStore] clearVoicesForStory failed:', err);
        }
    }

    async clearVoicesForSpeaker(
        storyId: string,
        speakerKey: string,
        aliases: string[] = []
    ): Promise<void> {
        const cleanStoryId = String(storyId || 'story').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanStoryLower = cleanStoryId.toLowerCase();
        const aliasSet = new Set<string>();
        for (const item of [speakerKey, ...(Array.isArray(aliases) ? aliases : [])]) {
            const raw = String(item || '').trim();
            if (!raw) continue;
            const lower = raw.toLowerCase();
            aliasSet.add(lower);
            aliasSet.add(lower.replace(/\s+/g, '_'));
            aliasSet.add(raw.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase());
            if (lower === 'narrator') aliasSet.add('narrator');
        }
        const lowerPrefixes = Array.from(aliasSet).map((a) => `${cleanStoryLower}_${a}_`);
        try {
            await this.runTransaction<void>('voices', 'readwrite', (tx, _db, resolve, reject) => {
                const store = tx.objectStore('voices');
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (cursor) {
                        const kLower = String(cursor.key || '').toLowerCase();
                        const val = cursor.value as StudioVoiceRecord | undefined;
                        const recSpkLower = String(val?.speakerKey || '').trim().toLowerCase();
                        const matchesPrefix = lowerPrefixes.some((p) => kLower.startsWith(p));
                        const matchesSpeakerVal =
                            kLower.startsWith(cleanStoryLower + '_') &&
                            (aliasSet.has(recSpkLower) ||
                                aliasSet.has(recSpkLower.replace(/\s+/g, '_')));
                        if (matchesPrefix || matchesSpeakerVal) {
                            cursor.delete();
                        }
                        cursor.continue();
                    }
                };
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[StudioCacheStore] clearVoicesForSpeaker failed:', err);
        }
    }

    async clearAllRenders({ keepMemory = false }: { keepMemory?: boolean } = {}): Promise<void> {
        if (!keepMemory) this._memRenders.clear();
        try {
            await this.runTransaction<void>('renders', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('renders').clear();
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[StudioCacheStore] clearAllRenders failed:', err);
        }
    }

    async clearRendersForStory(storyId: string): Promise<void> {
        if (!storyId) return;
        const rawPrefix = String(storyId) + '_';
        const cleanPrefix = String(storyId).replace(/[^a-zA-Z0-9_-]/g, '_') + '_';
        const matchesStory = (idStr: string): boolean => {
            const s = String(idStr || '');
            return (
                s.startsWith(rawPrefix) || (cleanPrefix !== rawPrefix && s.startsWith(cleanPrefix))
            );
        };
        for (const key of Array.from(this._memRenders.keys())) {
            if (matchesStory(key)) this._memRenders.delete(key);
        }
        try {
            await this.runTransaction<void>('renders', 'readwrite', (tx, _db, resolve, reject) => {
                const store = tx.objectStore('renders');
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (cursor) {
                        const val = cursor.value as { id?: unknown } | undefined;
                        const renderId = String(
                            cursor.key || cursor.primaryKey || val?.id || ''
                        );
                        if (matchesStory(renderId)) {
                            cursor.delete();
                        }
                        cursor.continue();
                    }
                };
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[StudioCacheStore] clearRendersForStory failed:', err);
        }
    }
}

export const studioCacheStore = new StudioCacheStore();
