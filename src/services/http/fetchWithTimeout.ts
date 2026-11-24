/**
 * @module services/http/fetchWithTimeout
 * AbortController-backed fetch wrapper protecting request initiation and streaming body reads.
 */

export type FetchTimeoutOptions = RequestInit;

/** Executes `fetch` with a deadline across both connection setup and response body consumption. */
export async function fetchWithTimeout(
    url: RequestInfo | URL,
    options: FetchTimeoutOptions = {},
    timeoutMs: number | false | null = 120000
): Promise<Response> {
    if (timeoutMs === 0 || timeoutMs === false || timeoutMs === null) {
        return await fetch(url, options);
    }
    const finalTimeout =
        timeoutMs !== undefined && timeoutMs !== null && timeoutMs > 0 ? timeoutMs : 120000;
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
