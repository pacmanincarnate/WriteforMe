/**
 * @module services/http/fetchWithTimeout
 * AbortController-backed fetch wrapper protecting request initiation and streaming body reads.
 */

import { TIMEOUTS_MS } from '@/config';

export type FetchTimeoutOptions = RequestInit;

export interface FetchIdleTimeoutHandle {
    response: Response;
    resetIdle: () => void;
    clear: () => void;
    mapError: (err: unknown) => unknown;
}

/**
 * Executes `fetch` with both an activity-resetting idle timeout and a hard total stream ceiling.
 * Callers reading a streaming body invoke `resetIdle()` on each meaningful token/delta and
 * must invoke `clear()` in a `finally` block once consumption finishes or fails.
 */
export async function fetchWithIdleTimeout(
    url: RequestInfo | URL,
    options: FetchTimeoutOptions = {},
    idleTimeoutMs: number | false | null = TIMEOUTS_MS.defaultFetch,
    maxTotalTimeoutMs?: number
): Promise<FetchIdleTimeoutHandle> {
    if (idleTimeoutMs === 0 || idleTimeoutMs === false || idleTimeoutMs === null) {
        const response = await fetch(url, options);
        return {
            response,
            resetIdle: () => {},
            clear: () => {},
            mapError: (err: unknown) => err
        };
    }

    const finalIdleTimeout =
        idleTimeoutMs !== undefined && idleTimeoutMs !== null && idleTimeoutMs > 0
            ? idleTimeoutMs
            : TIMEOUTS_MS.defaultFetch;
    const finalTotalTimeout =
        maxTotalTimeoutMs && maxTotalTimeoutMs > 0
            ? Math.max(maxTotalTimeoutMs, finalIdleTimeout)
            : Math.min(30 * 60 * 1000, Math.max(finalIdleTimeout * 3, 15 * 60 * 1000));

    const controller = new AbortController();
    let abortReason: 'idle' | 'total' | 'external' | null = null;
    let cleared = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const armIdleTimer = (): void => {
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
        }
        idleTimer = setTimeout(() => {
            if (!cleared) {
                abortReason = 'idle';
                controller.abort();
            }
        }, finalIdleTimeout);
    };

    armIdleTimer();

    const totalTimer = setTimeout(() => {
        if (!cleared) {
            abortReason = 'total';
            controller.abort();
        }
    }, finalTotalTimeout);

    const onExternalAbort = (): void => {
        abortReason = 'external';
        clear();
        controller.abort();
    };

    const clear = (): void => {
        if (cleared) return;
        cleared = true;
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        clearTimeout(totalTimer);
        if (options.signal) {
            options.signal.removeEventListener('abort', onExternalAbort);
        }
    };

    const resetIdle = (): void => {
        if (cleared || controller.signal.aborted) return;
        armIdleTimer();
    };

    const mapError = (err: unknown): unknown => {
        if (abortReason === 'external') {
            return err;
        }
        if ((err instanceof Error && err.name === 'AbortError') || controller.signal.aborted) {
            if (abortReason === 'total') {
                return new Error(
                    `Request timed out after ${finalTotalTimeout / 1000} seconds (stream ceiling)`,
                    { cause: err }
                );
            }
            return new Error(`Request timed out after ${finalIdleTimeout / 1000} seconds`, {
                cause: err
            });
        }
        return err;
    };

    if (options.signal) {
        if (options.signal.aborted) {
            onExternalAbort();
        } else {
            options.signal.addEventListener('abort', onExternalAbort);
        }
    }

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return { response, resetIdle, clear, mapError };
    } catch (error) {
        clear();
        throw mapError(error);
    }
}

/** Executes `fetch` with a deadline across both connection setup and response body consumption. */
export async function fetchWithTimeout(
    url: RequestInfo | URL,
    options: FetchTimeoutOptions = {},
    timeoutMs: number | false | null = TIMEOUTS_MS.defaultFetch
): Promise<Response> {
    if (timeoutMs === 0 || timeoutMs === false || timeoutMs === null) {
        return await fetch(url, options);
    }
    const finalTimeout =
        timeoutMs !== undefined && timeoutMs !== null && timeoutMs > 0
            ? timeoutMs
            : TIMEOUTS_MS.defaultFetch;
    const controller = new AbortController();
    let isCompleted = false;
    const id = setTimeout(() => {
        if (!isCompleted) {
            controller.abort();
        }
    }, finalTimeout);

    if (options.signal) {
        if (options.signal.aborted) {
            clearTimeout(id);
            controller.abort();
        } else {
            options.signal.addEventListener('abort', () => {
                clearTimeout(id);
                controller.abort();
            });
        }
    }

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const originalText = response.text.bind(response);
        const originalJson = response.json.bind(response);
        const originalBlob = response.blob ? response.blob.bind(response) : null;

        const wrapBodyReader = <T>(reader: () => Promise<T>): (() => Promise<T>) => {
            return async (): Promise<T> => {
                try {
                    const result = await reader();
                    isCompleted = true;
                    clearTimeout(id);
                    return result;
                } catch (err) {
                    clearTimeout(id);
                    if (
                        (err instanceof Error && err.name === 'AbortError') ||
                        controller.signal.aborted
                    ) {
                        throw new Error(`Request timed out after ${finalTimeout / 1000} seconds`, {
                            cause: err
                        });
                    }
                    throw err;
                }
            };
        };

        response.text = wrapBodyReader(originalText);
        response.json = wrapBodyReader(originalJson);
        if (originalBlob) {
            response.blob = wrapBodyReader(originalBlob);
        }

        return response;
    } catch (error) {
        clearTimeout(id);
        if (
            (error instanceof Error && error.name === 'AbortError') ||
            controller.signal.aborted
        ) {
            throw new Error(`Request timed out after ${finalTimeout / 1000} seconds`, {
                cause: error
            });
        }
        throw error;
    }
}
