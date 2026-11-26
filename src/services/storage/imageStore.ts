/**
 * @module services/storage/imageStore
 * Hybrid Disk-Vault + IndexedDB store for story covers, scene illustrations, and character images.
 */

import { IDB_DATABASES } from '@/config';
import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';
import { studioCacheStore } from './studioCacheStore';
import { probeLocalVaultAvailability } from './vaultDetector';

const IMAGE_DB = IDB_DATABASES.image;
const IMAGES_STORE = IMAGE_DB.stores.images;

/** Escapes non-ASCII characters as `\uXXXX` so JSON metadata is safe in HTTP headers. */
export function toAsciiHeaderJson(obj: unknown): string {
    return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (ch) => {
        return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
    });
}

export interface StoredImageItem {
    id: string;
    dataUrl: string | null;
}

interface ImageDiskFetchResult {
    ok: boolean;
    status: number;
    data: {
        ids?: unknown[];
        images?: Array<{ id?: string; dataUrl?: string }>;
        record?: { dataUrl?: string; timestamp?: number };
        deletedCount?: number;
    } | null;
}

interface ImageIdbRecord {
    id: string;
    dataUrl: string;
    timestamp: number;
}

/** Hybrid Disk-Vault + IndexedDB store for image data URLs keyed by ID or prefix. */
export class ImageStore extends ResilientIdbStore {
    private _diskImageIds: Set<string> | null;
    private _diskKeysPromise: Promise<Set<string> | null> | null;

    constructor(dbName: string = IMAGE_DB.name) {
        super(dbName, IMAGE_DB.version);
        this._diskImageIds = null;
        this._diskKeysPromise = null;
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
            db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
        }
    }

    private async _fetchImageVault(
        pathSuffix: string,
        options: RequestInit = {}
    ): Promise<ImageDiskFetchResult | null> {
        if (!(await probeLocalVaultAvailability())) return null;
        try {
            const res = await fetch(`/api/storage/images${pathSuffix}`, options);
            let data: ImageDiskFetchResult['data'] = null;
            try {
                data = (await res.json()) as ImageDiskFetchResult['data'];
            } catch {
                data = null;
            }
            return { ok: res.ok, status: res.status, data };
        } catch {
            return null;
        }
    }

    /**
     * Loads and caches the set of image IDs currently stored in the local disk vault
     * so missing images return null without triggering per-key 404 requests.
     */
    private async _ensureDiskImageKeys(): Promise<Set<string> | null> {
        if (!(await probeLocalVaultAvailability())) return null;
        if (this._diskImageIds instanceof Set) return this._diskImageIds;
        if (this._diskKeysPromise) return this._diskKeysPromise;

        this._diskKeysPromise = (async () => {
            try {
                const res = await this._fetchImageVault('?keysOnly=1', { method: 'GET' });
                if (res && res.ok && res.data) {
                    if (Array.isArray(res.data.ids)) {
                        this._diskImageIds = new Set(
                            res.data.ids.filter((id): id is string => typeof id === 'string')
                        );
                    } else if (Array.isArray(res.data.images)) {
                        this._diskImageIds = new Set(
                            res.data.images
                                .filter(
                                    (rec): rec is { id: string; dataUrl: string } =>
                                        Boolean(rec && typeof rec.id === 'string' && rec.dataUrl)
                                )
                                .map((rec) => rec.id)
                        );
                    }
                }
                return this._diskImageIds;
            } finally {
                this._diskKeysPromise = null;
            }
        })();

        return this._diskKeysPromise;
    }

    private async _updateDiskKeyCache(mutator: (ids: Set<string>) => void): Promise<void> {
        if (this._diskKeysPromise) {
            try {
                await this._diskKeysPromise;
            } catch {
                // Ignore pending key-load failures
            }
        }
        if (this._diskImageIds instanceof Set) {
            mutator(this._diskImageIds);
        }
    }

    async saveImage(id: string, dataUrl: string): Promise<void> {
        const timestamp = Date.now();
        const diskPromise = this._fetchImageVault(`/${encodeURIComponent(id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, dataUrl, timestamp })
        });
        const writeIdb = (): Promise<void> =>
            this.runTransaction<void>(IMAGES_STORE, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(IMAGES_STORE).put({ id, dataUrl, timestamp });
                tx.oncomplete = () => resolve();
            });

        const diskRes = await diskPromise;
        if (diskRes && diskRes.ok) {
            await this._updateDiskKeyCache((ids) => ids.add(id));
        }
        try {
            await writeIdb();
        } catch (err) {
            if (isQuotaExceededIdbError(err)) {
                await studioCacheStore.clearAllRenders();
                try {
                    await writeIdb();
                    return;
                } catch (retryErr) {
                    if (diskRes && diskRes.ok) return;
                    throw retryErr;
                }
            }
            if (diskRes && diskRes.ok) return;
            throw err;
        }
    }

    async getImage(id: string): Promise<string | null> {
        let idbVal: string | null;
        try {
            idbVal = await this.runTransaction<string | null>(
                IMAGES_STORE,
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore(IMAGES_STORE).get(id);
                    request.onsuccess = () => {
                        const result = request.result as ImageIdbRecord | undefined;
                        resolve(result ? result.dataUrl : null);
                    };
                    request.onerror = () => reject(request.error);
                }
            );
        } catch {
            idbVal = null;
        }
        if (idbVal) return idbVal;

        const diskIds = await this._ensureDiskImageKeys();
        if (diskIds instanceof Set && !diskIds.has(id)) {
            return null;
        }

        const diskRes = await this._fetchImageVault(`/${encodeURIComponent(id)}`, { method: 'GET' });
        if (diskRes?.status === 404 && this._diskImageIds instanceof Set) {
            this._diskImageIds.delete(id);
        }
        const diskUrl = diskRes?.ok ? diskRes.data?.record?.dataUrl || null : null;
        if (diskUrl) {
            this.runTransaction<void>(IMAGES_STORE, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(IMAGES_STORE).put({
                    id,
                    dataUrl: diskUrl,
                    timestamp: diskRes?.data?.record?.timestamp || Date.now()
                });
                tx.oncomplete = () => resolve();
            }).catch(() => {});
            return diskUrl;
        }
        return null;
    }

    async deleteImage(id: string): Promise<void> {
        const [diskRes] = await Promise.all([
            this._fetchImageVault(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
            this.runTransaction<void>(IMAGES_STORE, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(IMAGES_STORE).delete(id);
                tx.oncomplete = () => resolve();
            }).catch(() => {})
        ]);
        if (diskRes && (diskRes.ok || diskRes.status === 404)) {
            await this._updateDiskKeyCache((ids) => ids.delete(id));
        }
    }

    async getImagesByPrefix(prefix: string): Promise<StoredImageItem[]> {
        if (!prefix) return [];
        const merged = new Map<string, StoredImageItem>();
        try {
            const idbItems = await this.runTransaction<StoredImageItem[]>(
                IMAGES_STORE,
                'readonly',
                (tx, _db, resolve, reject) => {
                    const store = tx.objectStore(IMAGES_STORE);
                    const results: StoredImageItem[] = [];
                    const req = store.openCursor();
                    req.onsuccess = (event) => {
                        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
                            .result;
                        if (cursor) {
                            if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
                                const val = cursor.value as ImageIdbRecord | undefined;
                                results.push({
                                    id: cursor.key,
                                    dataUrl: val?.dataUrl || null
                                });
                            }
                            cursor.continue();
                        } else {
                            resolve(results);
                        }
                    };
                    req.onerror = () => reject(req.error);
                }
            );
            for (const item of idbItems) {
                if (item && item.id) merged.set(item.id, item);
            }
        } catch {
            // Ignore IndexedDB prefix cursor failures and fall through to disk vault
        }

        const diskIds = await this._ensureDiskImageKeys();
        let hasDiskMatch = true;
        if (diskIds instanceof Set) {
            hasDiskMatch = false;
            for (const k of diskIds) {
                if (k.startsWith(prefix)) {
                    hasDiskMatch = true;
                    break;
                }
            }
        }
        if (!hasDiskMatch) {
            return Array.from(merged.values());
        }

        const diskRes = await this._fetchImageVault(`?prefix=${encodeURIComponent(prefix)}`, {
            method: 'GET'
        });
        const diskImages =
            diskRes?.ok && Array.isArray(diskRes.data?.images) ? diskRes.data.images : [];
        for (const rec of diskImages) {
            if (rec && rec.id && rec.dataUrl && !merged.has(rec.id)) {
                merged.set(rec.id, { id: rec.id, dataUrl: rec.dataUrl });
            }
        }
        return Array.from(merged.values());
    }

    async deleteImagesByPrefix(prefix: string): Promise<number> {
        if (!prefix) return 0;
        const [diskRes, idbCount] = await Promise.all([
            this._fetchImageVault(`?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' }),
            this.runTransaction<number>(IMAGES_STORE, 'readwrite', (tx, _db, resolve, reject) => {
                const store = tx.objectStore(IMAGES_STORE);
                let deletedCount = 0;
                const req = store.openCursor();
                req.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                    if (cursor) {
                        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
                            cursor.delete();
                            deletedCount++;
                        }
                        cursor.continue();
                    }
                };
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => resolve(deletedCount);
            }).catch(() => 0)
        ]);
        if (diskRes && diskRes.ok) {
            await this._updateDiskKeyCache((ids) => {
                for (const k of Array.from(ids)) {
                    if (k.startsWith(prefix)) ids.delete(k);
                }
            });
        }
        return Math.max(Number(idbCount) || 0, Number(diskRes?.data?.deletedCount) || 0);
    }

    async clear(): Promise<void> {
        const [diskRes] = await Promise.all([
            this._fetchImageVault('', { method: 'DELETE' }),
            this.runTransaction<void>(IMAGES_STORE, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(IMAGES_STORE).clear();
                tx.oncomplete = () => resolve();
            }).catch(() => {})
        ]);
        if (diskRes && diskRes.ok) {
            await this._updateDiskKeyCache((ids) => ids.clear());
        }
    }
}

export const imageStore = new ImageStore();
