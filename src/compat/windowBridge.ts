/**
 * The one place that writes app names onto `window`, for the E2E suites, the MCP bridge and
 * DevTools. What may be published is listed in `./testApi`.
 */
export function registerWindowGlobals(entries: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const win = window as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(entries)) {
        win[key] = value;
    }
}

/**
 * Publishes one handle from the running app shell on `window`. The names code outside `src/`
 * relies on are listed in `./testApi`; the rest are kept for DevTools and are free to prune.
 */
export function publishAppGlobal(name: string, value: unknown): void {
    registerWindowGlobals({ [name]: value });
}
