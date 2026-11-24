/**
 * @module views/reader/measureReaderPages
 * Pagination math and playback timestamp formatting utilities for ReaderView.
 */

export interface ReaderPageMeasurement {
    width: number;
    pages: number;
}

/**
 * Shared page-count math for the paginated reader: the column container is measured
 * against its parent's width, and the column gap must match the inline columnGap
 * style (24px at <=640px, 48px otherwise). Returns null while the container has no
 * measurable width (e.g. mid-layout).
 */
export function measureReaderPages(el: HTMLElement | null | undefined): ReaderPageMeasurement | null {
    if (!el) return null;
    const parentEl = el.parentElement;
    const width = parentEl ? parentEl.clientWidth : el.clientWidth;
    if (width <= 0) return null;
    const gap = typeof window !== 'undefined' && window.innerWidth <= 640 ? 24 : 48;
    const pages = Math.max(1, Math.round((el.scrollWidth + gap) / (width + gap)));
    return { width, pages };
}

/** Formats seconds into `m:ss` (returning `"0:00"` for zero/invalid values). */
export function formatPlaybackTime(sec: number): string {
    if (!sec || !Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
