/**
 * @module components/common/BackToTop
 * A floating button that returns a long page to its top. Place it once inside the element that
 * scrolls; it stays hidden until the reader is about a screen down, so short pages never show it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp } from '@/components/icons';

/** The button appears once the page has scrolled this many pixels. */
export const BACK_TO_TOP_AFTER_PX = 600;

/** Nearest ancestor that scrolls vertically, which is what the button watches and rewinds. */
function findScroller(node: HTMLElement | null): HTMLElement | null {
    for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
    }
    return null;
}

export function BackToTop() {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const scroller = findScroller(anchorRef.current);
        scrollerRef.current = scroller;
        if (!scroller) return undefined;

        const update = () => setIsVisible(scroller.scrollTop > BACK_TO_TOP_AFTER_PX);
        update();
        scroller.addEventListener('scroll', update, { passive: true });
        return () => scroller.removeEventListener('scroll', update);
    }, []);

    const scrollToTop = () => {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scrollerRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    return (
        <>
            <span ref={anchorRef} hidden />
            {isVisible && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="Back to top"
                    title="Back to top"
                    className="fixed z-30 right-4 md:right-8 bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-8 w-11 h-11 rounded-full bg-surface/95 backdrop-blur border border-edge-strong text-ink-700 hover:text-ink-900 hover:border-gold/50 shadow-lg flex items-center justify-center transition-colors animate-fade-in cursor-pointer"
                >
                    <ChevronUp size={20} aria-hidden="true" />
                </button>
            )}
        </>
    );
}
