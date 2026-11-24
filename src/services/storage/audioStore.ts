/**
 * @module services/storage/audioStore
 * Hybrid Disk-Vault + IndexedDB store for Audio Drama scene and full-sequence MP3 renders.
 */

import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';
import { toAsciiHeaderJson } from './imageStore';
import { studioCacheStore } from './studioCacheStore';
import { probeLocalVaultAvailability } from './vaultDetector';

export interface SceneAudioConfig {
    storyId: string;
    seqIdx: number;
    sceneIdx: number;
    blob: Blob;
    mimeType?: string;
    durationSec?: number;
    textHash?: string;
    voiceSigHash?: string;
    cueCount?: number;
    cueTimeline?: unknown[] | null;
}

export interface SceneAudioSaveOptions {
    mimeType?: string;
    durationSec?: number;
    textHash?: string;
    voiceSigHash?: string;
    cueCount?: number;
    cueTimeline?: unknown[] | null;
}

export interface SceneAudioRecord {
    id: string;
    storyId: string;
    seqIdx: number;
    sceneIdx: number;
    blob: Blob;
    mimeType: string;
    durationSec: number;
    textHash: string;
    voiceSigHash: string;
    cueCount: number;
    cueTimeline: unknown[] | null;
    sizeBytes: number;
    updatedAt: number;
}

export interface SceneAudioMeta {
    id: string;
    storyId: string;
    seqIdx: number;
    sceneIdx: number;
    sceneId: string;
    mimeType?: string;
    durationSec?: number;
    textHash?: string;
    voiceSigHash?: string;
    cueCount?: number;
    hasCueTimeline: boolean;
    cueTimeline?: unknown[] | null;
    sizeBytes?: number;
    updatedAt?: number;
}

export interface SequenceAudioConfig {
    storyId: string;
    seqIdx: number;
    blob: Blob;
    mimeType?: string;
    durationSec?: number;
    includedSceneIndices?: number[];
    totalScenesInStructure?: number;
    sceneHashes?: Record<string, string>;
}

export interface SequenceAudioRecord {
    id: string;
    storyId: string;
    seqIdx: number;
    blob: Blob;
    mimeType: string;
    durationSec: number;
    includedSceneIndices: number[];
    totalScenesInStructure: number;
    sceneHashes: Record<string, string>;
    sizeBytes: number;
    updatedAt: number;
}

export interface SequenceAudioMeta {
    id: string;
    storyId: string;
    seqIdx: number;
    mimeType?: string;
    durationSec?: number;
    includedSceneIndices: number[];
    totalScenesInStructure: number;
    sceneHashes: Record<string, string>;
    sizeBytes?: number;
    updatedAt?: number;
}

const getWindowMp3Encoder = (): ((blob: Blob, bitrateKbps?: number) => Promise<Blob>) | null => {
    if (typeof window === 'undefined') return null;
    const fn = (window as unknown as { ensureMp3AudioBlob?: unknown }).ensureMp3AudioBlob;
    return typeof fn === 'function'
        ? (fn as (blob: Blob, bitrateKbps?: number) => Promise<Blob>)
        : null;
};

/** Hybrid Disk-Vault + IndexedDB audio drama scene & sequence audio persistence. */
export class AudioStore extends ResilientIdbStore {
    constructor(dbName = 'EllipsisAudioStore') {
        super(dbName, 2);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains('scene_audio')) {
            const store = db.createObjectStore('scene_audio', { keyPath: 'id' });
            store.createIndex('storyId', 'storyId', { unique: false });
            store.createIndex('story_seq_scene', ['storyId', 'seqIdx', 'sceneIdx'], {
                unique: true
            });
        }
        if (!db.objectStoreNames.contains('sequence_audio')) {
            const seqStore = db.createObjectStore('sequence_audio', { keyPath: 'id' });
            seqStore.createIndex('storyId', 'storyId', { unique: false });
            seqStore.createIndex('story_seq', ['storyId', 'seqIdx'], { unique: true });
        }
    }

    private async _uploadAudioToDisk(
        urlPath: string,
        blob: Blob,
        metaObj: Record<string, unknown> & { mimeType?: string }
    ): Promise<boolean> {
        if (!(await probeLocalVaultAvailability())) return false;
        try {
            const headerObj = { ...metaObj };
            let metaStr = toAsciiHeaderJson(headerObj);
            if (metaStr.length > 10240) {
                delete headerObj.cueTimeline;
                metaStr = toAsciiHeaderJson(headerObj);
            }
            const res = await fetch(urlPath, {
                method: 'PUT',
                headers: {
                    'Content-Type': metaObj.mimeType || blob.type || 'audio/mpeg',
                    'x-audio-meta': metaStr
                },
                body: blob
            });
            return Boolean(res && res.ok);
        } catch {
            return false;
        }
    }

    private async _fetchAudioFromDisk<T extends Record<string, unknown>>(
        urlPath: string,
        fallbackMeta: T
    ): Promise<(T & { blob: Blob; mimeType: string; sizeBytes: number }) | null> {
        if (!(await probeLocalVaultAvailability())) return null;
        try {
            const res = await fetch(urlPath, { method: 'GET' });
            if (!res || !res.ok) return null;
            const blob = await res.blob();
            if (!blob || blob.size <= 0) return null;
            let meta: Record<string, unknown> = {};
            const rawMeta = res.headers.get('x-audio-meta');
            if (rawMeta) {
                try {
                    meta = JSON.parse(rawMeta) as Record<string, unknown>;
                } catch {
                    meta = {};
                }
            }
            return {
                ...fallbackMeta,
                ...meta,
                blob,
                mimeType:
                    String(meta.mimeType || '') ||
                    res.headers.get('content-type') ||
                    blob.type ||
                    'audio/mpeg',
                sizeBytes: blob.size
            } as T & { blob: Blob; mimeType: string; sizeBytes: number };
        } catch {
            return null;
        }
    }

    private async _fetchAudioMetaFromDisk(storyId: string): Promise<{
        scenes: Partial<SceneAudioMeta>[];
        sequences: Partial<SequenceAudioMeta>[];
    }> {
        if (!(await probeLocalVaultAvailability()) || !storyId) {
            return { scenes: [], sequences: [] };
        }
        try {
            const res = await fetch(`/api/storage/audio/${encodeURIComponent(storyId)}/meta`, {
                method: 'GET'
            });
            if (!res || !res.ok) return { scenes: [], sequences: [] };
            const json = (await res.json().catch(() => null)) as {
                scenes?: Partial<SceneAudioMeta>[];
                sequences?: Partial<SequenceAudioMeta>[];
            } | null;
            return {
                scenes: Array.isArray(json?.scenes) ? json.scenes : [],
                sequences: Array.isArray(json?.sequences) ? json.sequences : []
            };
        } catch {
            return { scenes: [], sequences: [] };
        }
    }

    private async _evictOldestIdbSceneAudio(countToEvict = 3): Promise<number> {
        try {
            const entries = await this.runTransaction<Array<{ id: string; updatedAt: number }>>(
                'scene_audio',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const list: Array<{ id: string; updatedAt: number }> = [];
                    const req = tx.objectStore('scene_audio').openCursor();
                    req.onsuccess = (e) => {
                        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                        if (cursor) {
                            const val = cursor.value as { updatedAt?: unknown } | undefined;
                            list.push({
                                id: String(cursor.key),
                                updatedAt: Number(val?.updatedAt) || 0
                            });
                            cursor.continue();
                        } else {
                            resolve(list);
                        }
                    };
                    req.onerror = () => reject(req.error);
                }
            );
            if (entries.length === 0) return 0;
            entries.sort((a, b) => a.updatedAt - b.updatedAt);
            const toDelete = entries.slice(0, Math.min(countToEvict, entries.length)).map((e) => e.id);
            await this.runTransaction<void>('scene_audio', 'readwrite', (tx, _db, resolve) => {
                const store = tx.objectStore('scene_audio');
                for (const id of toDelete) store.delete(id);
                tx.oncomplete = () => resolve();
            });
            return toDelete.length;
        } catch {
            return 0;
        }
    }

    async clearLocalIdbCache(): Promise<void> {
        try {
            await this.runTransaction<void>(
                (db) =>
                    db.objectStoreNames.contains('sequence_audio')
                        ? ['scene_audio', 'sequence_audio']
                        : ['scene_audio'],
                'readwrite',
                (tx, _db, resolve) => {
                    Array.from(tx.objectStoreNames).forEach((storeName) =>
                        tx.objectStore(storeName).clear()
                    );
                    tx.oncomplete = () => resolve();
                }
            );
        } catch {
            // Ignore cache clear failures
        }
    }

    async saveSceneAudio(
        storyIdOrConfig: string | SceneAudioConfig,
        argSeqIdx?: number,
        argSceneIdx?: number,
        argBlob?: Blob,
        argOpts: SceneAudioSaveOptions = {}
    ): Promise<SceneAudioRecord> {
        let storyId: string | undefined;
        let seqIdx: number | undefined;
        let sceneIdx: number | undefined;
        let blob: Blob | undefined;
        let configuredMime: string | undefined;
        let durationSec: number;
        let textHash: string;
        let voiceSigHash: string;
        let cueCount: number;
        let cueTimeline: unknown[] | null;

        if (
            typeof storyIdOrConfig === 'object' &&
            storyIdOrConfig !== null &&
            !(storyIdOrConfig instanceof Blob)
        ) {
            storyId = storyIdOrConfig.storyId;
            seqIdx = storyIdOrConfig.seqIdx;
            sceneIdx = storyIdOrConfig.sceneIdx;
            blob = storyIdOrConfig.blob;
            configuredMime = storyIdOrConfig.mimeType;
            durationSec = storyIdOrConfig.durationSec || 0;
            textHash = storyIdOrConfig.textHash || '';
            voiceSigHash = storyIdOrConfig.voiceSigHash || '';
            cueCount = storyIdOrConfig.cueCount || 0;
            cueTimeline = Array.isArray(storyIdOrConfig.cueTimeline)
                ? storyIdOrConfig.cueTimeline
                : null;
        } else {
            storyId = typeof storyIdOrConfig === 'string' ? storyIdOrConfig : undefined;
            seqIdx = argSeqIdx;
            sceneIdx = argSceneIdx;
            blob = argBlob;
            configuredMime = argOpts?.mimeType;
            durationSec = argOpts?.durationSec || 0;
            textHash = argOpts?.textHash || '';
            voiceSigHash = argOpts?.voiceSigHash || '';
            cueCount = argOpts?.cueCount || 0;
            cueTimeline = Array.isArray(argOpts?.cueTimeline) ? argOpts.cueTimeline : null;
        }

        if (!storyId || typeof storyId !== 'string') {
            throw new Error('AudioStore.saveSceneAudio requires a valid storyId.');
        }
        const numSeq = Number(seqIdx);
        const numScene = Number(sceneIdx);
        if (!Number.isFinite(numSeq) || !Number.isFinite(numScene)) {
            throw new Error('AudioStore.saveSceneAudio requires valid seqIdx and sceneIdx.');
        }
        if (!(blob instanceof Blob) || blob.size <= 0) {
            throw new Error('AudioStore.saveSceneAudio requires a non-empty audio Blob.');
        }

        const mp3Encoder = getWindowMp3Encoder();
        if (blob.type !== 'audio/mpeg' && blob.type !== 'audio/mp3' && mp3Encoder) {
            blob = await mp3Encoder(blob, 128);
        }

        const mimeType = blob.type || configuredMime || 'audio/mpeg';
        const id = `${storyId}:${numSeq}:${numScene}`;
        const updatedAt = Date.now();
        const record: SceneAudioRecord = {
            id,
            storyId,
            seqIdx: numSeq,
            sceneIdx: numScene,
            blob,
            mimeType,
            durationSec: Number(durationSec) || 0,
            textHash: String(textHash || ''),
            voiceSigHash: String(voiceSigHash || ''),
            cueCount: Number(cueCount) || (cueTimeline ? cueTimeline.length : 0),
            cueTimeline,
            sizeBytes: blob.size,
            updatedAt
        };

        const diskOk = await this._uploadAudioToDisk(
            `/api/storage/audio/${encodeURIComponent(storyId)}/scene/${numSeq}/${numScene}`,
            blob,
            {
                id,
                storyId,
                seqIdx: numSeq,
                sceneIdx: numScene,
                mimeType,
                durationSec: record.durationSec,
                textHash: record.textHash,
                voiceSigHash: record.voiceSigHash,
                cueCount: record.cueCount,
                cueTimeline: record.cueTimeline,
                updatedAt
            }
        );

        const writeOnce = (): Promise<SceneAudioRecord> =>
            this.runTransaction<SceneAudioRecord>('scene_audio', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('scene_audio').put(record);
                tx.oncomplete = () => resolve(record);
            });
        try {
            return await writeOnce();
        } catch (err) {
            if (isQuotaExceededIdbError(err)) {
                console.warn(
                    '[AudioStore] QuotaExceededError saving scene audio — clearing disposable segment cache and retrying...'
                );
                await studioCacheStore.clearAllRenders();
                try {
                    return await writeOnce();
                } catch {
                    // Retry failed; evict oldest scene audio below
                }
                const evicted = await this._evictOldestIdbSceneAudio(3);
                if (evicted > 0) {
                    try {
                        return await writeOnce();
                    } catch {
                        // Retry after eviction failed
                    }
                }
                if (diskOk) {
                    console.warn(
                        '[AudioStore] Browser IndexedDB quota full; scene audio safely saved to Local Disk Vault.'
                    );
                    return record;
                }
            }
            if (diskOk) return record;
            throw err;
        }
    }

    async getSceneAudio(
        storyId: string,
        seqIdx: number,
        sceneIdx: number
    ): Promise<SceneAudioRecord | null> {
        if (!storyId) return null;
        const numSeq = Number(seqIdx);
        const numScene = Number(sceneIdx);
        const id = `${storyId}:${numSeq}:${numScene}`;
        let idbRec: SceneAudioRecord | null;
        try {
            idbRec = await this.runTransaction<SceneAudioRecord | null>(
                'scene_audio',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore('scene_audio').get(id);
                    request.onsuccess = () =>
                        resolve((request.result as SceneAudioRecord | undefined) || null);
                    request.onerror = () => reject(request.error);
                }
            );
        } catch {
            idbRec = null;
        }
        if (idbRec && idbRec.blob) return idbRec;

        const diskRec = await this._fetchAudioFromDisk(
            `/api/storage/audio/${encodeURIComponent(storyId)}/scene/${numSeq}/${numScene}`,
            { id, storyId, seqIdx: numSeq, sceneIdx: numScene }
        );
        return (diskRec as SceneAudioRecord | null) || idbRec;
    }

    async listStoryAudioMeta(storyId: string): Promise<SceneAudioMeta[]> {
        if (!storyId) return [];
        const [idbMeta, diskMeta] = await Promise.all([
            this.runTransaction<SceneAudioMeta[]>(
                'scene_audio',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const index = tx.objectStore('scene_audio').index('storyId');
                    const metaList: SceneAudioMeta[] = [];
                    // Stream via cursor so metadata refreshes never hold all multi-MB scene blobs in RAM at once
                    const request = index.openCursor(IDBKeyRange.only(storyId));
                    request.onsuccess = (event) => {
                        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
                            .result;
                        if (cursor) {
                            const r = cursor.value as SceneAudioRecord | undefined;
                            if (r) {
                                metaList.push({
                                    id: r.id,
                                    storyId: r.storyId,
                                    seqIdx: r.seqIdx,
                                    sceneIdx: r.sceneIdx,
                                    sceneId: `${r.seqIdx}-${r.sceneIdx}`,
                                    mimeType: r.mimeType,
                                    durationSec: r.durationSec,
                                    textHash: r.textHash,
                                    voiceSigHash: r.voiceSigHash || '',
                                    cueCount: r.cueCount,
                                    hasCueTimeline:
                                        Array.isArray(r.cueTimeline) && r.cueTimeline.length > 0,
                                    sizeBytes: r.sizeBytes,
                                    updatedAt: r.updatedAt
                                });
                            }
                            cursor.continue();
                        } else {
                            resolve(metaList);
                        }
                    };
                    request.onerror = () => reject(request.error);
                }
            ).catch(() => []),
            this._fetchAudioMetaFromDisk(storyId)
        ]);

        const bySceneId = new Map<string, SceneAudioMeta>();
        for (const m of idbMeta) {
            if (m && m.sceneId) bySceneId.set(m.sceneId, m);
        }
        for (const m of diskMeta?.scenes || []) {
            const seqIdx = Number(m.seqIdx);
            const sceneIdx = Number(m.sceneIdx);
            const sceneId = m.sceneId || `${seqIdx}-${sceneIdx}`;
            const normalized: SceneAudioMeta = {
                ...m,
                id: m.id || `${storyId}:${seqIdx}:${sceneIdx}`,
                storyId,
                seqIdx,
                sceneIdx,
                sceneId,
                hasCueTimeline: Boolean(
                    m.hasCueTimeline || (Array.isArray(m.cueTimeline) && m.cueTimeline.length > 0)
                )
            };
            const prev = bySceneId.get(sceneId);
            if (!prev || (Number(normalized.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                bySceneId.set(sceneId, normalized);
            }
        }
        return Array.from(bySceneId.values());
    }

    async countStoryAudio(storyId: string): Promise<number> {
        if (!storyId) return 0;
        const meta = await this.listStoryAudioMeta(storyId);
        return meta.length;
    }

    async getAllStoryAudioRecords(storyId: string): Promise<SceneAudioRecord[]> {
        if (!storyId) return [];
        const idbRecords = await this.runTransaction<SceneAudioRecord[]>(
            'scene_audio',
            'readonly',
            (tx, _db, resolve, reject) => {
                const index = tx.objectStore('scene_audio').index('storyId');
                const request = index.getAll(storyId);
                request.onsuccess = () =>
                    resolve((request.result as SceneAudioRecord[] | undefined) || []);
                request.onerror = () => reject(request.error);
            }
        ).catch(() => []);

        const bySceneId = new Map<string, SceneAudioRecord>();
        for (const r of idbRecords) {
            if (r && r.blob) bySceneId.set(`${r.seqIdx}-${r.sceneIdx}`, r);
        }

        const diskMeta = await this._fetchAudioMetaFromDisk(storyId);
        for (const m of diskMeta?.scenes || []) {
            const seqIdx = Number(m.seqIdx);
            const sceneIdx = Number(m.sceneIdx);
            const key = `${seqIdx}-${sceneIdx}`;
            if (!bySceneId.has(key)) {
                const diskRec = await this.getSceneAudio(storyId, seqIdx, sceneIdx);
                if (diskRec && diskRec.blob) bySceneId.set(key, diskRec);
            }
        }
        return Array.from(bySceneId.values());
    }

    async deleteSceneAudio(storyId: string, seqIdx: number, sceneIdx: number): Promise<void> {
        if (!storyId) return;
        const numSeq = Number(seqIdx);
        const numScene = Number(sceneIdx);
        const id = `${storyId}:${numSeq}:${numScene}`;
        const vaultAvailable = await probeLocalVaultAvailability();
        await Promise.all([
            vaultAvailable
                ? fetch(
                      `/api/storage/audio/${encodeURIComponent(storyId)}/scene/${numSeq}/${numScene}`,
                      { method: 'DELETE' }
                  ).catch(() => null)
                : Promise.resolve(null),
            this.runTransaction<void>('scene_audio', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('scene_audio').delete(id);
                tx.oncomplete = () => resolve();
            }).catch(() => {})
        ]);
    }

    async saveSequenceAudio({
        storyId,
        seqIdx,
        blob,
        mimeType,
        durationSec = 0,
        includedSceneIndices = [],
        totalScenesInStructure = 0,
        sceneHashes = {}
    }: SequenceAudioConfig): Promise<SequenceAudioRecord | null> {
        if (!storyId || typeof storyId !== 'string') {
            throw new Error('AudioStore.saveSequenceAudio requires a valid storyId.');
        }
        const safeSeqIdx = Number(seqIdx);
        if (!Number.isFinite(safeSeqIdx)) {
            throw new Error('AudioStore.saveSequenceAudio requires a valid seqIdx.');
        }
        if (!(blob instanceof Blob) || blob.size <= 0) {
            throw new Error('AudioStore.saveSequenceAudio requires a non-empty audio Blob.');
        }
        const mp3Encoder = getWindowMp3Encoder();
        if (blob.type !== 'audio/mpeg' && blob.type !== 'audio/mp3' && mp3Encoder) {
            blob = await mp3Encoder(blob, 128);
        }
        const resolvedMime = blob.type || mimeType || 'audio/mpeg';
        const id = `${storyId}:seq:${safeSeqIdx}`;
        const cleanIndices = Array.from(
            new Set((includedSceneIndices || []).map(Number).filter((n) => !isNaN(n) && n >= 0))
        ).sort((a, b) => a - b);
        const updatedAt = Date.now();
        const record: SequenceAudioRecord = {
            id,
            storyId,
            seqIdx: safeSeqIdx,
            blob,
            mimeType: resolvedMime,
            durationSec: Number(durationSec) || 0,
            includedSceneIndices: cleanIndices,
            totalScenesInStructure: Number(totalScenesInStructure) || 0,
            sceneHashes: sceneHashes || {},
            sizeBytes: blob.size,
            updatedAt
        };

        const diskOk = await this._uploadAudioToDisk(
            `/api/storage/audio/${encodeURIComponent(storyId)}/sequence/${safeSeqIdx}`,
            blob,
            {
                id,
                storyId,
                seqIdx: safeSeqIdx,
                mimeType: resolvedMime,
                durationSec: record.durationSec,
                includedSceneIndices: cleanIndices,
                totalScenesInStructure: record.totalScenesInStructure,
                sceneHashes: record.sceneHashes,
                updatedAt
            }
        );

        const writeOnce = (): Promise<SequenceAudioRecord | null> =>
            this.runTransaction<SequenceAudioRecord | null>(
                'sequence_audio',
                'readwrite',
                (tx, _db, resolve) => {
                    tx.objectStore('sequence_audio').put(record);
                    tx.oncomplete = () => resolve(record);
                },
                { skipIfMissing: true, fallbackValue: null }
            );
        try {
            return await writeOnce();
        } catch (err) {
            if (isQuotaExceededIdbError(err)) {
                console.warn(
                    '[AudioStore] QuotaExceededError saving sequence audio — clearing disposable segment cache and retrying...'
                );
                await studioCacheStore.clearAllRenders();
                try {
                    return await writeOnce();
                } catch {
                    // Fallback below
                }
                if (diskOk) {
                    console.warn(
                        '[AudioStore] Browser IndexedDB quota full; sequence audio safely saved to Local Disk Vault.'
                    );
                    return record;
                }
            }
            if (diskOk) return record;
            throw err;
        }
    }

    async getSequenceAudio(
        storyId: string,
        seqIdx: number
    ): Promise<SequenceAudioRecord | null> {
        if (!storyId) return null;
        const safeSeqIdx = Number(seqIdx);
        const id = `${storyId}:seq:${safeSeqIdx}`;
        let idbRec: SequenceAudioRecord | null;
        try {
            idbRec = await this.runTransaction<SequenceAudioRecord | null>(
                'sequence_audio',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const request = tx.objectStore('sequence_audio').get(id);
                    request.onsuccess = () =>
                        resolve((request.result as SequenceAudioRecord | undefined) || null);
                    request.onerror = () => reject(request.error);
                },
                { skipIfMissing: true, fallbackValue: null }
            );
        } catch {
            idbRec = null;
        }
        if (idbRec && idbRec.blob) return idbRec;

        const diskRec = await this._fetchAudioFromDisk(
            `/api/storage/audio/${encodeURIComponent(storyId)}/sequence/${safeSeqIdx}`,
            { id, storyId, seqIdx: safeSeqIdx }
        );
        return (diskRec as SequenceAudioRecord | null) || idbRec;
    }

    async listStorySequenceAudioMeta(storyId: string): Promise<SequenceAudioMeta[]> {
        if (!storyId) return [];
        const [idbMeta, diskMeta] = await Promise.all([
            this.runTransaction<SequenceAudioMeta[]>(
                'sequence_audio',
                'readonly',
                (tx, _db, resolve, reject) => {
                    const index = tx.objectStore('sequence_audio').index('storyId');
                    const metaList: SequenceAudioMeta[] = [];
                    const request = index.openCursor(IDBKeyRange.only(storyId));
                    request.onsuccess = (event) => {
                        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
                            .result;
                        if (cursor) {
                            const r = cursor.value as SequenceAudioRecord | undefined;
                            if (r) {
                                metaList.push({
                                    id: r.id,
                                    storyId: r.storyId,
                                    seqIdx: r.seqIdx,
                                    mimeType: r.mimeType,
                                    durationSec: r.durationSec,
                                    includedSceneIndices: Array.isArray(r.includedSceneIndices)
                                        ? r.includedSceneIndices
                                        : [],
                                    totalScenesInStructure: r.totalScenesInStructure || 0,
                                    sceneHashes: r.sceneHashes || {},
                                    sizeBytes: r.sizeBytes,
                                    updatedAt: r.updatedAt
                                });
                            }
                            cursor.continue();
                        } else {
                            resolve(metaList);
                        }
                    };
                    request.onerror = () => reject(request.error);
                },
                { skipIfMissing: true, fallbackValue: [] }
            ).catch(() => []),
            this._fetchAudioMetaFromDisk(storyId)
        ]);

        const bySeq = new Map<number, SequenceAudioMeta>();
        for (const m of idbMeta) {
            if (m && m.seqIdx !== undefined) bySeq.set(Number(m.seqIdx), m);
        }
        for (const m of diskMeta?.sequences || []) {
            const seqNum = Number(m.seqIdx);
            const normalized: SequenceAudioMeta = {
                ...m,
                id: m.id || `${storyId}:seq:${seqNum}`,
                storyId,
                seqIdx: seqNum,
                includedSceneIndices: Array.isArray(m.includedSceneIndices)
                    ? m.includedSceneIndices
                    : [],
                totalScenesInStructure: m.totalScenesInStructure || 0,
                sceneHashes: m.sceneHashes || {}
            };
            const prev = bySeq.get(seqNum);
            if (!prev || (Number(normalized.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                bySeq.set(seqNum, normalized);
            }
        }
        return Array.from(bySeq.values());
    }

    async getAllStorySequenceAudioRecords(storyId: string): Promise<SequenceAudioRecord[]> {
        if (!storyId) return [];
        const idbRecords = await this.runTransaction<SequenceAudioRecord[]>(
            'sequence_audio',
            'readonly',
            (tx, _db, resolve, reject) => {
                const index = tx.objectStore('sequence_audio').index('storyId');
                const request = index.getAll(storyId);
                request.onsuccess = () =>
                    resolve((request.result as SequenceAudioRecord[] | undefined) || []);
                request.onerror = () => reject(request.error);
            },
            { skipIfMissing: true, fallbackValue: [] }
        ).catch(() => []);

        const bySeq = new Map<number, SequenceAudioRecord>();
        for (const r of idbRecords) {
            if (r && r.blob) bySeq.set(Number(r.seqIdx), r);
        }

        const diskMeta = await this._fetchAudioMetaFromDisk(storyId);
        for (const m of diskMeta?.sequences || []) {
            const seqNum = Number(m.seqIdx);
            if (!bySeq.has(seqNum)) {
                const diskRec = await this.getSequenceAudio(storyId, seqNum);
                if (diskRec && diskRec.blob) bySeq.set(seqNum, diskRec);
            }
        }
        return Array.from(bySeq.values());
    }

    async deleteSequenceAudio(storyId: string, seqIdx: number): Promise<void> {
        if (!storyId) return;
        const safeSeqIdx = Number(seqIdx);
        const id = `${storyId}:seq:${safeSeqIdx}`;
        const vaultAvailable = await probeLocalVaultAvailability();
        await Promise.all([
            vaultAvailable
                ? fetch(
                      `/api/storage/audio/${encodeURIComponent(storyId)}/sequence/${safeSeqIdx}`,
                      { method: 'DELETE' }
                  ).catch(() => null)
                : Promise.resolve(null),
            this.runTransaction<void>(
                'sequence_audio',
                'readwrite',
                (tx, _db, resolve) => {
                    tx.objectStore('sequence_audio').delete(id);
                    tx.oncomplete = () => resolve();
                },
                { skipIfMissing: true, fallbackValue: undefined }
            ).catch(() => {})
        ]);
    }

    async deleteStoryAudio(storyId: string): Promise<void> {
        if (!storyId) return;
        const vaultAvailable = await probeLocalVaultAvailability();
        await Promise.all([
            vaultAvailable
                ? fetch(`/api/storage/audio/${encodeURIComponent(storyId)}`, {
                      method: 'DELETE'
                  }).catch(() => null)
                : Promise.resolve(null),
            this.runTransaction<void>(
                (db) =>
                    db.objectStoreNames.contains('sequence_audio')
                        ? ['scene_audio', 'sequence_audio']
                        : ['scene_audio'],
                'readwrite',
                (tx, _db, resolve, reject) => {
                    Array.from(tx.objectStoreNames).forEach((storeName) => {
                        const store = tx.objectStore(storeName);
                        const index = store.index('storyId');
                        const request = index.openKeyCursor(IDBKeyRange.only(storyId));
                        request.onsuccess = (event) => {
                            const cursor = (event.target as IDBRequest<IDBCursor | null>).result;
                            if (cursor) {
                                store.delete(cursor.primaryKey);
                                cursor.continue();
                            }
                        };
                        request.onerror = () => reject(request.error);
                    });
                    tx.oncomplete = () => resolve();
                }
            ).catch(() => {})
        ]);
    }

    async clear(): Promise<void> {
        return this.runTransaction<void>(
            (db) =>
                db.objectStoreNames.contains('sequence_audio')
                    ? ['scene_audio', 'sequence_audio']
                    : ['scene_audio'],
            'readwrite',
            (tx, _db, resolve) => {
                Array.from(tx.objectStoreNames).forEach((storeName) =>
                    tx.objectStore(storeName).clear()
                );
                tx.oncomplete = () => resolve();
            }
        );
    }
}

export const audioStore = new AudioStore();
