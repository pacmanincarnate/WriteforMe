/**
 * @module domain/lore/loreBrowsing
 * Search and paging for the Lore tab list.
 */

export interface BrowsableLoreEntry {
    topic?: string | null;
    detail?: string | null;
}

/** Case-insensitive match on topic or detail. A blank query returns the input array itself. */
export function filterLoreEntries<T extends BrowsableLoreEntry>(lore: T[] | null | undefined, query: string): T[] {
    const all = lore || [];
    if (!query || !query.trim()) return all;
    const q = query.toLowerCase().trim();
    return all.filter(
        (entry) => (entry.topic || '').toLowerCase().includes(q) || (entry.detail || '').toLowerCase().includes(q)
    );
}

/** Number of pages, never less than 1 so an empty list still shows "page 1 of 1". */
export function countLorePages(total: number, pageSize: number): number {
    return Math.ceil(total / pageSize) || 1;
}

/** The entries on a 1-based page. */
export function sliceLorePage<T>(entries: T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return entries.slice(start, start + pageSize);
}
