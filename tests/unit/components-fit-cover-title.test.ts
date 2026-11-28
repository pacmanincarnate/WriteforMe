// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { COVER_FIT_MIN_SCALE, fitCoverTitle } from '@/components/cover/fitCoverTitle';

/** A heading whose longest word is `wordPx` wide at full size, on a line `linePx` wide. */
function heading(wordPx: number, linePx: number): HTMLElement {
    const el = document.createElement('h2');
    Object.defineProperty(el, 'clientWidth', { get: () => linePx });
    Object.defineProperty(el, 'scrollWidth', {
        configurable: true,
        get: () => {
            if (el.style.overflowWrap === 'anywhere') return linePx;
            const scale = Number(el.style.getPropertyValue('--cover-fit') || 1);
            return Math.max(linePx, Math.round(wordPx * scale));
        }
    });
    return el;
}

describe('fitCoverTitle', () => {
    it('leaves a title that already fits at full size', () => {
        const el = heading(180, 220);
        expect(fitCoverTitle(el)).toBe(1);
        expect(el.style.overflowWrap).toBe('normal');
    });

    it('shrinks until the longest word fits on one line instead of breaking it', () => {
        const el = heading(300, 220);
        const scale = fitCoverTitle(el);
        expect(scale).toBeLessThan(1);
        expect(300 * scale).toBeLessThanOrEqual(221);
        expect(el.style.overflowWrap).toBe('normal');
    });

    it('breaks inside a word only when the smallest size still overflows', () => {
        const el = heading(2000, 220);
        expect(fitCoverTitle(el)).toBe(COVER_FIT_MIN_SCALE);
        expect(el.style.overflowWrap).toBe('anywhere');
    });

    it('starts again from full size when the title gets shorter', () => {
        const el = heading(300, 220);
        fitCoverTitle(el);
        Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 220 });
        expect(fitCoverTitle(el)).toBe(1);
    });
});
