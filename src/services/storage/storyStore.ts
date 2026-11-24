/**
 * @module services/storage/storyStore
 * Hybrid Disk-Vault + IndexedDB story persistence with anti-regression guard
 * and automatic legacy migration.
 */

import { computeStoryProgressMetrics } from '@/domain/story';
import { safeJsonStringify } from '@/utils';
import { audioStore } from './audioStore';
import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';
import { studioCacheStore } from './studioCacheStore';
import { probeLocalVaultAvailability } from './vaultDetector';

export interface StoryRecord {
    id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface DiskStoryFetchResult {
    ok: boolean;
    status: number;
    data: {
        record?: StoryRecord;
        stories?: StoryRecord[];
        existingRecord?: StoryRecord;
    } | null;
}

/** Hybrid Disk-Vault + IndexedDB story persistence with anti-regression guard and automatic recovery. */
export class StoryStore extends ResilientIdbStore {
    private _memStories: Map<string, StoryRecord>;
    private _migrated?: boolean;

    constructor(dbName = 'EllipsisStoryStore') {
        super(dbName, 1);
        this._memStories = new Map();
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains('stories')) {
            db.createObjectStore('stories', { keyPath: 'id' });
        }
    }

    private async _fetchDiskJson(
        pathSuffix: string,
        options: RequestInit = {}
    ): Promise<DiskStoryFetchResult | null> {
        if (!(await probeLocalVaultAvailability())) return null;
        try {
            const res = await fetch(`/api/storage${pathSuffix}`, options);
            let data: DiskStoryFetchResult['data'] = null;
            try {
                data = (await res.json()) as DiskStoryFetchResult['data'];
            } catch {
                data = null;
            }
            return { ok: res.ok, status: res.status, data };
        } catch {
            return null;
        }
    }

    private async _putStoryToIdb(
        id: string,
        cleanData: Record<string, unknown>,
        timestamp: number
    ): Promise<boolean> {
        const record: StoryRecord = { id, data: cleanData, timestamp };
        const writeOnce = (): Promise<void> =>
            this.runTransaction<void>('stories', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('stories').put(record);
                tx.oncomplete = () => resolve();
            });
        try {
            await writeOnce();
            return true;
        } catch (err) {
            if (!isQuotaExceededIdbError(err)) throw err;
            await studioCacheStore.clearAllRenders();
            await audioStore.clearLocalIdbCache();
            try {
                await writeOnce();
                return true;
            } catch (retryErr) {
                console.warn(
                    '[StoryStore] IndexedDB quota full after cache eviction; relying on Local Disk Vault:',
                    retryErr
                );
                return false;
            }
        }
    }

    _pickBetterStoryRecord(recA: StoryRecord | null, recB: StoryRecord | null): StoryRecord | null {
        if (!recA || !recA.data) return recB || null;
        if (!recB || !recB.data) return recA || null;
        const mA = computeStoryProgressMetrics(recA.data);
        const mB = computeStoryProgressMetrics(recB.data);
        if (mA.score !== mB.score) {
            return mA.score > mB.score ? recA : recB;
        }
        return (Number(recA.timestamp) || 0) >= (Number(recB.timestamp) || 0) ? recA : recB;
    }

    override async onOpened(db: IDBDatabase): Promise<void> {
        if (this._migrated) return;
        this._migrated = true;
        try {
            await this.migrateLegacyStory(db);
        } catch (e) {
            console.warn('Legacy story migration failed:', e);
        }
    }

    async migrateLegacyStory(db: IDBDatabase | null = this.db): Promise<void> {
        if (!db) return;
        // Use the already-opened handle directly so onOpened never deadlocks awaiting this.ready
        const legacy = await this.rawGet('current_story', db);
        if (legacy) {
            await this.rawPut('story_default', legacy.data, db);
            await this.rawDelete('current_story', db);
            console.log("Legacy story migrated to 'story_default'.");
        }
        try {
            if (typeof localStorage === 'undefined') return;
            const localSaved = localStorage.getItem('ellipsisprose_story');
            if (localSaved) {
                const parsed = JSON.parse(localSaved) as Record<string, unknown> | null;
                if (
                    parsed &&
                    (parsed.title ||
                        parsed.concept ||
                        parsed.logline ||
                        (Array.isArray(parsed.sequences) && parsed.sequences.length > 0) ||
                        parsed.id)
                ) {
                    const targetId =
                        typeof parsed.id === 'string' && parsed.id ? parsed.id : 'story_default';
                    const existing = await this.rawGet(targetId, db);
                    if (!existing) {
                        await this.rawPut(targetId, parsed, db);
                        console.log(
                            `Migrated story '${targetId}' from localStorage to IndexedDB.`
                        );
                    }
                }
                localStorage.removeItem('ellipsisprose_story');
                console.log('Reclaimed localStorage quota by clearing legacy story key.');
            }
        } catch (e) {
            console.warn('Legacy localStorage story migration check failed:', e);
        }
    }

    rawGet(key: string, db: IDBDatabase | null = this.db): Promise<StoryRecord | undefined> {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('IndexedDB database handle is not open for rawGet'));
                return;
            }
            const tx = db.transaction('stories', 'readonly');
            tx.onerror = () => reject(tx.error || new Error('IndexedDB rawGet transaction error'));
            tx.onabort = () =>
                reject(tx.error || new DOMException('IndexedDB rawGet aborted', 'AbortError'));
            const request = tx.objectStore('stories').get(key);
            request.onsuccess = () => resolve(request.result as StoryRecord | undefined);
            request.onerror = () => reject(request.error);
        });
    }

    rawPut(
        id: string,
        storyData: Record<string, unknown>,
        db: IDBDatabase | null = this.db
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('IndexedDB database handle is not open for rawPut'));
                return;
            }
            const tx = db.transaction('stories', 'readwrite');
            tx.objectStore('stories').put({ id, data: storyData, timestamp: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB rawPut transaction error'));
            tx.onabort = () =>
                reject(tx.error || new DOMException('IndexedDB rawPut aborted', 'AbortError'));
        });
    }

    rawDelete(key: string, db: IDBDatabase | null = this.db): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('IndexedDB database handle is not open for rawDelete'));
                return;
            }
            const tx = db.transaction('stories', 'readwrite');
            tx.objectStore('stories').delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB rawDelete transaction error'));
            tx.onabort = () =>
                reject(tx.error || new DOMException('IndexedDB rawDelete aborted', 'AbortError'));
        });
    }

    async saveStory(
        id: string,
        storyData: Record<string, unknown>,
        opts: { allowRegression?: boolean } = {}
    ): Promise<void> {
        if (!id) return;
        let cleanData = storyData;
        try {
            const cleanJson = safeJsonStringify(storyData);
            if (cleanJson) cleanData = JSON.parse(cleanJson) as Record<string, unknown>;
        } catch {
            // Keep original reference if sanitization fails
        }

        const allowRegression = Boolean(opts?.allowRegression);
        const incomingMetrics = computeStoryProgressMetrics(cleanData);
        const existingMem = this._memStories.get(id);
        if (!allowRegression && existingMem && existingMem.data) {
            const memMetrics = computeStoryProgressMetrics(existingMem.data);
            if (memMetrics.score > 0 && incomingMetrics.score === 0) {
                console.warn(
                    `[StoryStore] Blocked blank template from overwriting non-empty story '${id}'.`
                );
                return;
            }
        }

        const now = Date.now();
        this._memStories.set(id, { id, data: cleanData, timestamp: now });
        const [diskRes, idbRes] = await Promise.all([
            this._fetchDiskJson(`/stories/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, data: cleanData, timestamp: now, allowRegression })
            }),
            this._putStoryToIdb(id, cleanData, now)
                .then(() => ({ ok: true as const, err: null as unknown }))
                .catch((err: unknown) => ({ ok: false as const, err }))
        ]);

        if (diskRes && diskRes.status === 409 && diskRes.data?.existingRecord?.data) {
            const recovered = diskRes.data.existingRecord;
            console.warn(
                `[StoryStore] Local Disk Vault blocked regression overwrite on '${id}'; preserving existing story.`
            );
            this._memStories.set(id, recovered);
            await this._putStoryToIdb(id, recovered.data, recovered.timestamp || now).catch(
                () => {}
            );
            return;
        }

        if (!idbRes.ok) {
            if (diskRes && diskRes.ok) {
                console.warn(
                    `[StoryStore] IndexedDB save failed for '${id}', safely persisted to Disk Vault:`,
                    idbRes.err
                );
                return;
            }
            throw idbRes.err;
        }
    }

    async loadStory(id: string): Promise<Record<string, unknown> | null> {
        if (!id) return null;
        const [idbRecord, diskRes] = await Promise.all([
            this.runTransaction<StoryRecord | null>(
                'stories',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore('stories').get(id);
                    request.onsuccess = () =>
                        resolve((request.result as StoryRecord | undefined) || null);
                    request.onerror = () => reject(request.error);
                }
            ).catch(() => null),
            this._fetchDiskJson(`/stories/${encodeURIComponent(id)}`, { method: 'GET' })
        ]);

        const diskRecord =
            diskRes?.ok && diskRes.data?.record?.data ? diskRes.data.record : null;
        const winner = this._pickBetterStoryRecord(diskRecord, idbRecord);
        if (!winner || !winner.data) {
            const mem = this._memStories.get(id);
            return mem ? mem.data : null;
        }

        this._memStories.set(id, winner);

        // Heal whichever layer was missing or stale
        if (winner === diskRecord && diskRecord) {
            const idbScore = idbRecord ? computeStoryProgressMetrics(idbRecord.data).score : -1;
            const diskScore = computeStoryProgressMetrics(diskRecord.data).score;
            if (
                !idbRecord ||
                diskScore > idbScore ||
                (diskScore === idbScore &&
                    (diskRecord.timestamp || 0) > (idbRecord.timestamp || 0))
            ) {
                this._putStoryToIdb(
                    id,
                    diskRecord.data,
                    diskRecord.timestamp || Date.now()
                ).catch(() => {});
            }
        } else if (idbRecord && (!diskRecord || winner !== diskRecord)) {
            this._fetchDiskJson(`/stories/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    data: idbRecord.data,
                    timestamp: idbRecord.timestamp || Date.now()
                })
            }).catch(() => {});
        }

        return winner.data;
    }

    async listStories(): Promise<StoryRecord[]> {
        const [idbList, diskRes] = await Promise.all([
            this.runTransaction<StoryRecord[]>(
                'stories',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const entries: StoryRecord[] = [];
                    const req = tx.objectStore('stories').openCursor();
                    req.onsuccess = (event) => {
                        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
                            .result;
                        if (cursor) {
                            const val = cursor.value as StoryRecord | undefined;
                            if (val && val.id) entries.push(val);
                            cursor.continue();
                        } else {
                            resolve(entries);
                        }
                    };
                    req.onerror = () => reject(req.error);
                }
            ).catch(() => []),
            this._fetchDiskJson('/stories', { method: 'GET' })
        ]);

        const diskList =
            diskRes?.ok && Array.isArray(diskRes.data?.stories) ? diskRes.data.stories : [];
        const idbById = new Map<string, StoryRecord>();
        for (const rec of idbList) {
            if (rec && rec.id) idbById.set(rec.id, rec);
        }
        const diskById = new Map<string, StoryRecord>();
        for (const rec of diskList) {
            if (rec && rec.id) diskById.set(rec.id, rec);
        }

        const allIds = new Set([...idbById.keys(), ...diskById.keys()]);
        const merged: StoryRecord[] = [];
        for (const id of allIds) {
            const idbRec = idbById.get(id) || null;
            const diskRec = diskById.get(id) || null;
            const winner = this._pickBetterStoryRecord(diskRec, idbRec);
            if (!winner || !winner.data) continue;

            this._memStories.set(id, winner);
            merged.push(winner);

            if (
                winner === diskRec &&
                diskRec &&
                (!idbRec ||
                    computeStoryProgressMetrics(diskRec.data).score >
                        computeStoryProgressMetrics(idbRec.data).score)
            ) {
                this._putStoryToIdb(
                    id,
                    diskRec.data,
                    diskRec.timestamp || Date.now()
                ).catch(() => {});
            } else if (
                winner === idbRec &&
                idbRec &&
                (!diskRec ||
                    computeStoryProgressMetrics(idbRec.data).score >
                        computeStoryProgressMetrics(diskRec.data).score)
            ) {
                this._fetchDiskJson(`/stories/${encodeURIComponent(id)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        data: idbRec.data,
                        timestamp: idbRec.timestamp || Date.now()
                    })
                }).catch(() => {});
            }
        }
        return merged;
    }

    async deleteStory(id: string): Promise<void> {
        if (!id) return;
        this._memStories.delete(id);
        await Promise.all([
            this._fetchDiskJson(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
            this.runTransaction<void>('stories', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('stories').delete(id);
                tx.oncomplete = () => resolve();
            }).catch(() => {})
        ]);
    }

    async clear(): Promise<void> {
        this._memStories.clear();
        await Promise.all([
            this._fetchDiskJson('/clear-all', { method: 'POST' }),
            this.runTransaction<void>('stories', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('stories').clear();
                tx.oncomplete = () => resolve();
            }).catch(() => {})
        ]);
    }
}

export const storyStore = new StoryStore();
