/**
 * @module components/cover/fitCoverTitle
 * Shrinks a cover title until its longest word fits on one line, so a word is never
 * broken in the middle. Titles size themselves with `calc(<size> * var(--cover-fit, 1))`.
 */

export const COVER_FIT_MIN_SCALE = 0.4;
const COVER_FIT_STEP = 0.05;

/** A word too long for its line spills along the line: sideways, or downwards on a spine. */
function overflows(el: HTMLElement): boolean {
    const upright = getComputedStyle(el).writingMode.startsWith('vertical');
    return upright ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
}

/** Returns the scale applied. Breaks inside a word only when the smallest size still overflows. */
export function fitCoverTitle(el: HTMLElement): number {
    el.style.overflowWrap = 'normal';
    let scale = 1;
    el.style.setProperty('--cover-fit', '1');
    while (overflows(el) && scale - COVER_FIT_STEP >= COVER_FIT_MIN_SCALE - 1e-9) {
        scale = Math.round((scale - COVER_FIT_STEP) * 100) / 100;
        el.style.setProperty('--cover-fit', String(scale));
    }
    if (overflows(el)) el.style.overflowWrap = 'anywhere';
    return scale;
}
