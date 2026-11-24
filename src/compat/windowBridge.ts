/**
 * Controlled global compatibility bridge for E2E suites, MCP tools,
 * and incremental Strangler-Fig migration of legacy modules.
 */
export function registerWindowGlobals(entries: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const win = window as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(entries)) {
        win[key] = value;
    }
}
