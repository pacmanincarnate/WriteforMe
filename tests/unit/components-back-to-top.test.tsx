// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACK_TO_TOP_AFTER_PX, BackToTop } from '@/components/common';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('BackToTop', () => {
    let scroller: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        document.body.appendChild(scroller);
        root = createRoot(scroller);
    });

    afterEach(() => {
        act(() => root.unmount());
        scroller.remove();
    });

    const scrollTo = (top: number) => {
        act(() => {
            scroller.scrollTop = top;
            scroller.dispatchEvent(new Event('scroll'));
        });
    };

    it('stays hidden near the top of the page', () => {
        act(() => root.render(<BackToTop />));
        expect(scroller.querySelector('button')).toBeNull();
        scrollTo(BACK_TO_TOP_AFTER_PX);
        expect(scroller.querySelector('button')).toBeNull();
    });

    it('appears once the page is scrolled and rewinds its scroller', () => {
        const scrollToSpy = vi.fn();
        scroller.scrollTo = scrollToSpy as unknown as typeof scroller.scrollTo;
        act(() => root.render(<BackToTop />));

        scrollTo(BACK_TO_TOP_AFTER_PX + 1);
        const button = scroller.querySelector('button') as HTMLButtonElement;
        expect(button.getAttribute('aria-label')).toBe('Back to top');

        act(() => button.click());
        expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));

        scrollTo(0);
        expect(scroller.querySelector('button')).toBeNull();
    });
});
