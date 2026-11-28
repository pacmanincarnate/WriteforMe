/**
 * @module views/reader/measureReaderPages
 * Pagination math, audio clearance measurement, and playback timestamp formatting utilities for ReaderView.
 */

export const DEFAULT_AUDIO_BAR_CLEARANCE = 'calc(env(safe-area-inset-bottom, 0px) + 9.75rem)';

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

/**
 * Measures how many pixels from the bottom edge of the viewport are occupied by
 * the floating audio mini-player (plus breathing gap), capped at 55% of viewport
 * height. Returns null when the element is absent, unmeasured (zero-height in jsdom),
 * or outside the viewport.
 */
export function measureFloatingBarClearance(
    barEl: HTMLElement | null | undefined,
    viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
    gapPx = 12
): number | null {
    if (!barEl || viewportHeight <= 0) return null;
    const rect = barEl.getBoundingClientRect();
    if (rect.height <= 0) return null;
    const occupiedFromBottom = Math.ceil(viewportHeight - rect.top);
    if (occupiedFromBottom <= 0 || occupiedFromBottom >= viewportHeight) return null;
    const maxReserve = Math.floor(viewportHeight * 0.55);
    return Math.min(occupiedFromBottom + Math.max(0, gapPx), maxReserve);
}

/** Formats seconds into `m:ss` (returning `"0:00"` for zero/invalid values). */
export function formatPlaybackTime(sec: number): string {
    if (!sec || !Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
