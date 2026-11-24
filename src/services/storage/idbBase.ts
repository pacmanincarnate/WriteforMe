/**
 * @module services/storage/idbBase
 * Resilient IndexedDB store base class with lifecycle listeners, auto-reopen,
 * stale-handle retry logic, and quota-exceeded error classification.
 */

/** Detects transient/closing IndexedDB errors caused by closed, closing, or invalidated handles. */
export function isRecoverableIdbConnectionError(err: unknown): boolean {
    if (!err) return false;
    const errObj = err as { name?: unknown; message?: unknown };
    const name = String(errObj.name || '');
    const msg = String(errObj.message || err || '').toLowerCase();
    if (name === 'InvalidStateError') return true;
    if (
        msg.includes('connection is closing') ||
        msg.includes('connection has been closed') ||
        msg.includes('database connection is closed')
    ) {
        return true;
    }
    if (name === 'UnknownError' && msg.includes('backing store')) return true;
    return false;
}

/** Returns true when an IndexedDB write failed because origin browser quota was exceeded. */
export function isQuotaExceededIdbError(err: unknown): boolean {
    if (!err) return false;
    const errObj = err as { name?: unknown; message?: unknown; code?: unknown };
    const name = String(errObj.name || '');
    const msg = String(errObj.message || '');
    return (
        name === 'QuotaExceededError' ||
        errObj.code === 22 ||
        errObj.code === 1014 ||
        /QuotaExceededError|quota/i.test(msg)
    );
}

/** Resilient IndexedDB store base class with automatic connection recovery and transaction safety. */
export class ResilientIdbStore {
    public dbName: string;
    public version: number;
    public db: IDBDatabase | null;
    public ready: Promise<IDBDatabase> | null;

    constructor(dbName: string, version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.ready = null;
        this.ready = this.init();
        this.ready.catch(() => {});
    }

    onUpgrade(_db: IDBDatabase, _event: IDBVersionChangeEvent): void {
        void _db;
        void _event;
    }

    onOpened(_db: IDBDatabase): void | Promise<void> {
        void _db;
    }

    init(): Promise<IDBDatabase> {
        if (this.ready) return this.ready;
        const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(
                    new Error(
                        `IndexedDB is not available in this environment for '${this.dbName}'.`
                    )
                );
                return;
            }
            let request: IDBOpenDBRequest;
            try {
                request = indexedDB.open(this.dbName, this.version);
            } catch (openErr) {
                reject(openErr);
                return;
            }
            request.onupgradeneeded = (event) => {
                try {
                    const target = event.target as IDBOpenDBRequest;
                    this.onUpgrade(target.result, event);
                } catch (upgErr) {
                    console.error(`[${this.dbName}] IndexedDB upgrade error:`, upgErr);
                }
            };
            request.onblocked = () => {
                console.warn(
                    `[${this.dbName}] IndexedDB open blocked by another tab or pending connection close.`
                );
            };
            request.onsuccess = async (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.db = db;
                db.onclose = () => {
                    console.warn(
                        `[${this.dbName}] IndexedDB connection closed unexpectedly; will reopen on next operation.`
                    );
                    if (this.db === db) {
                        this.db = null;
                        this.ready = null;
                    }
                };
                db.onversionchange = () => {
                    console.warn(
                        `[${this.dbName}] IndexedDB versionchange detected; closing handle.`
                    );
                    if (this.db === db) {
                        this.db = null;
                        this.ready = null;
                    }
                    try {
                        db.close();
                    } catch {
                        // Ignore close errors during versionchange
                    }
                };
                db.onabort = (abortEv) => {
                    console.warn(
                        `[${this.dbName}] IndexedDB database abort:`,
                        (abortEv?.target as { error?: unknown } | null)?.error
                    );
                };
                try {
                    if (typeof this.onOpened === 'function') {
                        await this.onOpened(db);
                    }
                } catch (openedErr) {
                    console.warn(`[${this.dbName}] Post-open hook warning:`, openedErr);
                }
                resolve(db);
            };
            request.onerror = (event) => {
                if (this.ready === openPromise) {
                    this.ready = null;
                }
                reject(
                    (event.target as IDBOpenDBRequest).error ||
                        new Error(`Failed to open IndexedDB '${this.dbName}'`)
                );
            };
        });
        this.ready = openPromise;
        return openPromise;
    }

    resetConnection(failedDb: IDBDatabase | null = null): void {
        if (failedDb) {
            if (this.db === failedDb) {
                this.db = null;
                this.ready = null;
            }
            try {
                failedDb.close();
            } catch {
                // Ignore close error on stale handle
            }
            return;
        }
        const targetDb = this.db;
        this.db = null;
        this.ready = null;
        if (targetDb) {
            try {
                targetDb.close();
            } catch {
                // Ignore close error
            }
        }
    }

    async ensureOpen(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        const pending = this.ready || this.init();
        try {
            const db = await pending;
            if (this.db) return this.db;
            if (db && db === this.db) return db;
            if (this.ready === pending) {
                this.ready = null;
            }
            return await this.init();
        } catch (err) {
            if (this.ready === pending) {
                this.db = null;
                this.ready = null;
            }
            throw err;
        }
    }

    async withDatabase<T>(
        operationFn: (db: IDBDatabase) => Promise<T> | T,
        { maxRetries = 1 }: { maxRetries?: number } = {}
    ): Promise<T> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let db: IDBDatabase | null = null;
            try {
                db = await this.ensureOpen();
                return await operationFn(db);
            } catch (err) {
                if (attempt < maxRetries && isRecoverableIdbConnectionError(err)) {
                    const errObj = err as { name?: unknown; message?: unknown };
                    console.warn(
                        `[${this.dbName}] Recoverable IndexedDB connection error (${String(errObj?.name || 'Error')}: ${String(errObj?.message || err)}); reopening and retrying (attempt ${attempt + 1}/${maxRetries})...`
                    );
                    this.resetConnection(db);
                    await new Promise((r) => setTimeout(r, 50));
                    continue;
                }
                throw err;
            }
        }
        throw new Error(`[${this.dbName}] Unreachable retry exhaustion`);
    }

    runTransaction<T>(
        storeNames: string | string[] | ((db: IDBDatabase) => string | string[]),
        mode: IDBTransactionMode,
        workFn: (
            tx: IDBTransaction,
            db: IDBDatabase,
            resolve: (val: T) => void,
            reject: (err?: unknown) => void
        ) => void,
        {
            maxRetries = 1,
            skipIfMissing = false,
            fallbackValue = null as unknown as T
        }: {
            maxRetries?: number;
            skipIfMissing?: boolean;
            fallbackValue?: T;
        } = {}
    ): Promise<T> {
        return this.withDatabase(
            (db) => {
                const resolvedStores =
                    typeof storeNames === 'function' ? storeNames(db) : storeNames;
                const requiredStores = Array.isArray(resolvedStores)
                    ? resolvedStores
                    : [resolvedStores];
                if (
                    skipIfMissing &&
                    requiredStores.some((s) => !db.objectStoreNames.contains(s))
                ) {
                    return fallbackValue;
                }
                return new Promise<T>((resolve, reject) => {
                    let settled = false;
                    const doneResolve = (val: T): void => {
                        if (!settled) {
                            settled = true;
                            resolve(val);
                        }
                    };
                    const doneReject = (err?: unknown): void => {
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    };
                    const tx = db.transaction(resolvedStores, mode);
                    tx.onerror = () =>
                        doneReject(
                            tx.error ||
                                new Error(`IndexedDB transaction error in '${this.dbName}'`)
                        );
                    tx.onabort = () =>
                        doneReject(
                            tx.error ||
                                new DOMException(
                                    `IndexedDB transaction aborted in '${this.dbName}'`,
                                    'AbortError'
                                )
                        );
                    workFn(tx, db, doneResolve, doneReject);
                });
            },
            { maxRetries }
        );
    }
}
