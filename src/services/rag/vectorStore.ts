/**
 * @module services/rag/vectorStore
 * IndexedDB-backed semantic vector store supporting cosine-similarity search and redundancy checks.
 */

import { IDB_DATABASES } from '@/config';
import { cosineSimilarity } from '@/domain/lore';
import { ResilientIdbStore } from '@/services/storage';

const VECTOR_DB = IDB_DATABASES.vector;
const VECTORS_STORE = VECTOR_DB.stores.vectors;

export interface VectorRecord<TMeta = Record<string, unknown>> {
    id: string;
    text: string;
    vector: number[];
    metadata: TMeta;
    timestamp: number;
}

export interface ScoredVectorRecord<TMeta = Record<string, unknown>> extends VectorRecord<TMeta> {
    score: number;
}

/** IndexedDB semantic vector store backed by `ResilientIdbStore`. */
export class VectorStore extends ResilientIdbStore {
    constructor(dbName: string = VECTOR_DB.name) {
        super(dbName, VECTOR_DB.version);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(VECTORS_STORE)) {
            db.createObjectStore(VECTORS_STORE, { keyPath: 'id' });
        }
    }

    async add<TMeta = Record<string, unknown>>(
        id: string,
        text: string,
        vector: number[],
        metadata: TMeta = {} as TMeta
    ): Promise<void> {
        return this.runTransaction<void>(VECTORS_STORE, 'readwrite', (tx, _db, resolve) => {
            tx.objectStore(VECTORS_STORE).put({ id, text, vector, metadata, timestamp: Date.now() });
            tx.oncomplete = () => resolve();
        });
    }

    async getAll<TMeta = Record<string, unknown>>(): Promise<VectorRecord<TMeta>[]> {
        return this.runTransaction<VectorRecord<TMeta>[]>(
            VECTORS_STORE,
            'readonly',
            (tx, _db, resolve, reject) => {
                const request = tx.objectStore(VECTORS_STORE).getAll();
                request.onsuccess = () =>
                    resolve((request.result as VectorRecord<TMeta>[] | undefined) || []);
                request.onerror = () => reject(request.error);
            }
        );
    }

    async search<TMeta = Record<string, unknown>>(
        queryVector: number[],
        limit = 5,
        threshold = 0.0,
        filterFn: ((metadata: TMeta) => boolean) | null = null
    ): Promise<ScoredVectorRecord<TMeta>[]> {
        const allItems = await this.getAll<TMeta>();
        const scored: ScoredVectorRecord<TMeta>[] = allItems.map((item) => ({
            ...item,
            score: cosineSimilarity(queryVector, item.vector)
        }));

        const filtered = scored.filter(
            (i) => i.score >= threshold && (!filterFn || filterFn(i.metadata))
        );
        filtered.sort((a, b) => b.score - a.score);

        return filtered.slice(0, limit);
    }

    async checkRedundancy<TMeta = Record<string, unknown>>(
        queryVector: number[],
        threshold = 0.85
    ): Promise<ScoredVectorRecord<TMeta> | null> {
        const results = await this.search<TMeta>(queryVector, 1, threshold);
        return results.length > 0 ? results[0] : null;
    }

    async clear(): Promise<void> {
        return this.runTransaction<void>(VECTORS_STORE, 'readwrite', (tx, _db, resolve) => {
            tx.objectStore(VECTORS_STORE).clear();
            tx.oncomplete = () => resolve();
        });
    }
}
