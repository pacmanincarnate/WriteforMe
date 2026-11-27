/**
 * @module services/storage/restorePointStore
 * IndexedDB store of restore points: whole copies of a story taken before it is rewritten, plus a
 * daily backup. The list (`meta`) is kept apart from the copies (`data`) so listing stays cheap.
 * Saving a restore point must never break the save it protects: every failure here is swallowed.
 */

import { IDB_DATABASES } from '@/config';
import {
    computeStoryProgressMetrics,
    dailyBackupDue,
    restorePointsToDrop,
    type RestorePointKind,
    type RestorePointMeta
} from '@/domain/story';
import { safeJsonStringify } from '@/utils';
import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';

const RESTORE_DB = IDB_DATABASES.restore;
const META_STORE = RESTORE_DB.stores.meta;
const DATA_STORE = RESTORE_DB.stores.data;
const BOTH = [META_STORE, DATA_STORE];

/** A second `before` point with the same label inside this window replaces nothing: it is skipped. */
const SAME_LABEL_WINDOW_MS = 60 * 1000;

interface RestoreDataRecord {
    id: string;
    storyId: string;
    data: Record<string, unknown>;
}

type StoryData = Record<string, unknown>;

export class RestorePointStore extends ResilientIdbStore {
    constructor(dbName: string = RESTORE_DB.name) {
        super(dbName, RESTORE_DB.version);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: 'id' }).createIndex('storyId', 'storyId');
        }
        if (!db.objectStoreNames.contains(DATA_STORE)) {
            db.createObjectStore(DATA_STORE, { keyPath: 'id' }).createIndex('storyId', 'storyId');
        }
    }

    /** The restore points of one story, newest first. */
    async list(storyId: string): Promise<RestorePointMeta[]> {
        if (!storyId) return [];
        try {
            const found = await this.runTransaction<RestorePointMeta[]>(
                META_STORE,
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore(META_STORE).index('storyId').getAll(storyId);
                    request.onsuccess = () => resolve((request.result as RestorePointMeta[]) || []);
                    request.onerror = () => reject(request.error);
                }
            );
            return found.sort((a, b) => b.timestamp - a.timestamp);
        } catch (err) {
            console.warn('[RestorePoints] Could not list restore points:', err);
            return [];
        }
    }

    /** The story as it was at a restore point, or null if the copy is gone. */
    async load(id: string): Promise<StoryData | null> {
        try {
            const record = await this.runTransaction<RestoreDataRecord | null>(
                DATA_STORE,
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore(DATA_STORE).get(id);
                    request.onsuccess = () => resolve((request.result as RestoreDataRecord) || null);
                    request.onerror = () => reject(request.error);
                }
            );
            return record?.data || null;
        } catch (err) {
            console.warn('[RestorePoints] Could not load a restore point:', err);
            return null;
        }
    }

    private _write(meta: RestorePointMeta, data: StoryData): Promise<void> {
        return this.runTransaction<void>(BOTH, 'readwrite', (tx, _db, resolve) => {
            tx.objectStore(META_STORE).put(meta);
            tx.objectStore(DATA_STORE).put({ id: meta.id, storyId: meta.storyId, data });
            tx.oncomplete = () => resolve();
        });
    }

    async remove(ids: readonly string[]): Promise<void> {
        if (ids.length === 0) return;
        try {
            await this.runTransaction<void>(BOTH, 'readwrite', (tx, _db, resolve) => {
                for (const id of ids) {
                    tx.objectStore(META_STORE).delete(id);
                    tx.objectStore(DATA_STORE).delete(id);
                }
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[RestorePoints] Could not remove restore points:', err);
        }
    }

    /**
     * Saves a copy of `story` as a restore point and prunes the ones past keeping.
     * Returns the new point, or null when nothing was saved (empty story, duplicate, or no room).
     */
    async add(
        storyId: string,
        story: StoryData | null | undefined,
        kind: RestorePointKind,
        label: string,
        now: number = Date.now()
    ): Promise<RestorePointMeta | null> {
        if (!storyId || !story || typeof story !== 'object') return null;
        try {
            const json = safeJsonStringify(story);
            if (!json) return null;
            const data = JSON.parse(json) as StoryData;
            const metrics = computeStoryProgressMetrics(data);
            // An untouched template is not worth a restore point.
            if (metrics.score === 0) return null;

            const existing = await this.list(storyId);
            const newest = existing[0];
            if (
                kind === 'before' &&
                newest &&
                newest.kind === 'before' &&
                newest.label === label &&
                now - newest.timestamp < SAME_LABEL_WINDOW_MS
            ) {
                return null;
            }

            const meta: RestorePointMeta = {
                id: `${storyId}:${now}:${Math.random().toString(36).slice(2, 8)}`,
                storyId,
                kind,
                label,
                timestamp: now,
                words: metrics.totalWords,
                scenes: metrics.draftedScenes
            };
            try {
                await this._write(meta, data);
            } catch (err) {
                if (!isQuotaExceededIdbError(err)) throw err;
                // No room: give up the oldest half of this story's points and try once more.
                const oldest = existing.slice(Math.ceil(existing.length / 2)).map((p) => p.id);
                if (oldest.length === 0) return null;
                await this.remove(oldest);
                await this._write(meta, data);
            }
            await this.remove(restorePointsToDrop(await this.list(storyId)));
            return meta;
        } catch (err) {
            console.warn('[RestorePoints] Could not save a restore point:', err);
            return null;
        }
    }

    /** Takes today's backup of a story if none has been taken yet today. */
    async backupIfDue(
        storyId: string,
        story: StoryData | null | undefined,
        now: number = Date.now()
    ): Promise<RestorePointMeta | null> {
        if (!storyId || !story) return null;
        const existing = await this.list(storyId);
        if (!dailyBackupDue(existing, now)) return null;
        return this.add(storyId, story, 'auto', 'Daily backup', now);
    }

    async clearStory(storyId: string): Promise<void> {
        const points = await this.list(storyId);
        await this.remove(points.map((p) => p.id));
    }

    async clear(): Promise<void> {
        try {
            await this.runTransaction<void>(BOTH, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(META_STORE).clear();
                tx.objectStore(DATA_STORE).clear();
                tx.oncomplete = () => resolve();
            });
        } catch (err) {
            console.warn('[RestorePoints] Could not clear restore points:', err);
        }
    }
}

export const restorePointStore = new RestorePointStore();
