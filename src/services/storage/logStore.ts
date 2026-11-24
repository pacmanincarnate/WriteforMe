/**
 * @module services/storage/logStore
 * IndexedDB store for per-story verbose pipeline logs with quota-aware compaction.
 */

import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';
import { studioCacheStore } from './studioCacheStore';

interface LogRecord {
    id: string;
    logs: unknown[];
    timestamp: number;
}

/** IndexedDB store for verbose generation logs keyed by story ID. */
export class LogStore extends ResilientIdbStore {
    private _quotaWarned?: boolean;

    constructor(dbName = 'EllipsisLogStore') {
        super(dbName, 1);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains('logs')) {
            db.createObjectStore('logs', { keyPath: 'id' });
        }
    }

    _compactLogsForQuota(
        logsArray: unknown[],
        maxEntries = 30,
        maxFieldLen = 1500
    ): unknown[] {
        if (!Array.isArray(logsArray)) return [];
        return logsArray.slice(0, maxEntries).map((entry) => {
            if (!entry || typeof entry !== 'object') return entry;
            const compact = { ...(entry as Record<string, unknown>) };
            for (const key of ['prompt', 'response', 'rawResponse', 'systemPrompt']) {
                const val = compact[key];
                if (typeof val === 'string' && val.length > maxFieldLen) {
                    compact[key] = val.slice(0, maxFieldLen) + '\n... [truncated for storage quota]';
                }
            }
            return compact;
        });
    }

    async saveLogs(storyId: string, logsArray: unknown[]): Promise<void> {
        const writeOnce = (payload: unknown[]): Promise<void> =>
            this.runTransaction<void>('logs', 'readwrite', (tx, _db, resolve) => {
                tx.objectStore('logs').put({ id: storyId, logs: payload, timestamp: Date.now() });
                tx.oncomplete = () => resolve();
            });
        try {
            return await writeOnce(logsArray);
        } catch (err) {
            if (!isQuotaExceededIdbError(err)) throw err;
            try {
                console.warn(
                    '[LogStore] QuotaExceededError while saving logs — clearing disposable segment cache and retrying...'
                );
                await studioCacheStore.clearAllRenders();
                return await writeOnce(logsArray);
            } catch (retryErr) {
                if (!isQuotaExceededIdbError(retryErr)) throw retryErr;
            }
            try {
                const compact = this._compactLogsForQuota(logsArray, 30, 1500);
                return await writeOnce(compact);
            } catch (compactErr) {
                if (isQuotaExceededIdbError(compactErr)) {
                    if (!this._quotaWarned) {
                        this._quotaWarned = true;
                        console.warn(
                            '[LogStore] Browser IndexedDB quota is full; skipping log persistence for this session to protect story and audio data.'
                        );
                    }
                    return;
                }
                throw compactErr;
            }
        }
    }

    async loadLogs(storyId: string): Promise<unknown[]> {
        return this.runTransaction<unknown[]>(
            'logs',
            'readonly',
            (tx, _db, resolve, reject) => {
                const request = tx.objectStore('logs').get(storyId);
                request.onsuccess = () => {
                    const result = request.result as LogRecord | undefined;
                    resolve(result ? result.logs : []);
                };
                request.onerror = () => reject(request.error);
            }
        );
    }

    async clearLogs(storyId: string): Promise<void> {
        return this.runTransaction<void>('logs', 'readwrite', (tx, _db, resolve) => {
            tx.objectStore('logs').delete(storyId);
            tx.oncomplete = () => resolve();
        });
    }
}

export const logStore = new LogStore();
