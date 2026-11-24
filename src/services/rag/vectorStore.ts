/**
 * @module services/rag/vectorStore
 * IndexedDB-backed semantic vector store supporting cosine-similarity search and redundancy checks.
 */

import { cosineSimilarity } from '@/domain/lore';
import { ResilientIdbStore } from '@/services/storage';

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
    constructor(dbName = 'EllipsisVectorStore') {
        super(dbName, 1);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains('vectors')) {
            db.createObjectStore('vectors', { keyPath: 'id' });
        }
    }

    async add<TMeta = Record<string, unknown>>(
        id: string,
        text: string,
        vector: number[],
        metadata: TMeta = {} as TMeta
    ): Promise<void> {
        return this.runTransaction<void>('vectors', 'readwrite', (tx, _db, resolve) => {
            tx.objectStore('vectors').put({ id, text, vector, metadata, timestamp: Date.now() });
            tx.oncomplete = () => resolve();
        });
    }

    async getAll<TMeta = Record<string, unknown>>(): Promise<VectorRecord<TMeta>[]> {
        return this.runTransaction<VectorRecord<TMeta>[]>(
            'vectors',
            'readonly',
            (tx, _db, resolve, reject) => {
                const request = tx.objectStore('vectors').getAll();
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
        return this.runTransaction<void>('vectors', 'readwrite', (tx, _db, resolve) => {
            tx.objectStore('vectors').clear();
            tx.oncomplete = () => resolve();
        });
    }
}
