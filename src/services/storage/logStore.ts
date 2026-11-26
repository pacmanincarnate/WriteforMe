/**
 * @module services/storage/logStore
 * IndexedDB store for per-story verbose pipeline logs with quota-aware compaction.
 */

import { IDB_DATABASES, STORAGE_KEYS } from '@/config';
import { ResilientIdbStore, isQuotaExceededIdbError } from './idbBase';
import { studioCacheStore } from './studioCacheStore';

const LOG_DB = IDB_DATABASES.log;
const LOGS_STORE = LOG_DB.stores.logs;

interface LogRecord {
    id: string;
    logs: unknown[];
    timestamp: number;
}

/** IndexedDB store for verbose generation logs keyed by story ID. */
export class LogStore extends ResilientIdbStore {
    private _quotaWarned?: boolean;

    constructor(dbName: string = LOG_DB.name) {
        super(dbName, LOG_DB.version);
    }

    override onUpgrade(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(LOGS_STORE)) {
            db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
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
            this.runTransaction<void>(LOGS_STORE, 'readwrite', (tx, _db, resolve) => {
                tx.objectStore(LOGS_STORE).put({ id: storyId, logs: payload, timestamp: Date.now() });
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
            LOGS_STORE,
            'readonly',
            (tx, _db, resolve, reject) => {
                const request = tx.objectStore(LOGS_STORE).get(storyId);
                request.onsuccess = () => {
                    const result = request.result as LogRecord | undefined;
                    resolve(result ? result.logs : []);
                };
                request.onerror = () => reject(request.error);
            }
        );
    }

    async clearLogs(storyId: string): Promise<void> {
        return this.runTransaction<void>(LOGS_STORE, 'readwrite', (tx, _db, resolve) => {
            tx.objectStore(LOGS_STORE).delete(storyId);
            tx.oncomplete = () => resolve();
        });
    }
}

export const logStore = new LogStore();

export interface RecoverableLogEntry {
    id?: string | number;
    function?: string;
    [key: string]: unknown;
}

export interface RecoverOrphanedLogsResult {
    recovered: number;
    message?: string;
    logs?: RecoverableLogEntry[];
    error?: string;
}

/**
 * Recovers orphaned Character Developer / Conceptual Development logs saved under
 * `'story_default'` during setup into the active/target story's log store.
 */
export async function recoverOrphanedLogs(
    targetStoryId: string | null = null
): Promise<RecoverOrphanedLogsResult> {
    let fallbackId = 'story_default';
    try {
        fallbackId = localStorage.getItem(STORAGE_KEYS.activeStoryId) || 'story_default';
    } catch {
        // Ignore restricted storage access
    }
    const destId = targetStoryId || fallbackId;
    try {
        const defaultLogs = (await logStore.loadLogs('story_default')) as RecoverableLogEntry[];
        if (!defaultLogs || defaultLogs.length === 0) {
            console.log("[recoverOrphanedLogs] No logs found in 'story_default'.");
            return { recovered: 0, message: "No logs found in 'story_default'." };
        }
        const currentLogs = (await logStore.loadLogs(destId)) as RecoverableLogEntry[];
        const existingIds = new Set((currentLogs || []).map((l) => l?.id));
        const earlyOrphans = defaultLogs.filter(
            (l) =>
                l &&
                typeof l.function === 'string' &&
                (l.function.includes('Character Developer') ||
                    l.function.includes('Conceptual Development'))
        );
        const toRecover = earlyOrphans.filter((l) => !existingIds.has(l.id));
        if (toRecover.length === 0) {
            console.log(
                `[recoverOrphanedLogs] All early setup logs in 'story_default' already exist in story '${destId}'.`
            );
            return { recovered: 0, message: `All logs already present in '${destId}'.` };
        }
        const merged = [...(currentLogs || []), ...toRecover];
        await logStore.saveLogs(destId, merged);
        console.log(
            `[recoverOrphanedLogs] Successfully recovered ${toRecover.length} orphaned logs into '${destId}'. Reload page or switch stories to view.`
        );
        return { recovered: toRecover.length, logs: toRecover };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[recoverOrphanedLogs] Failed:', err);
        return { recovered: 0, error: message };
    }
}
