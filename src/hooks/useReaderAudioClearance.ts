/**
 * @module hooks/useReaderAudioClearance
 * Tracks the bottom viewport clearance occupied by the floating reader audio bar
 * so ReaderView can clip and reflow text above the controls without overlap.
 */

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { measureFloatingBarClearance } from '@/views/reader/measureReaderPages';

/**
 * Observes a floating audio mini-player element and reports the bottom viewport
 * clearance (in pixels) whenever its size or viewport dimensions change.
 * Measurement pauses while `isPaused` is true (e.g. when a transient popover opens).
 */
export function useReaderAudioClearance(
    barRef: RefObject<HTMLDivElement | null>,
    isActive: boolean,
    isPaused: boolean,
    onClearanceChange?: (px: number | null) => void
): void {
    const lastReportedRef = useRef<number | null>(null);

    useLayoutEffect(() => {
        if (!isActive || isPaused || !onClearanceChange) return;

        const measure = (): void => {
            const px = measureFloatingBarClearance(barRef.current);
            if (px !== null && px !== lastReportedRef.current) {
                lastReportedRef.current = px;
                onClearanceChange(px);
            }
        };

        measure();

        const barEl = barRef.current;
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && barEl) {
            ro = new ResizeObserver(() => {
                measure();
            });
            ro.observe(barEl);
        }

        barEl?.addEventListener('animationend', measure);
        barEl?.addEventListener('transitionend', measure);
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);

        return () => {
            if (ro) ro.disconnect();
            barEl?.removeEventListener('animationend', measure);
            barEl?.removeEventListener('transitionend', measure);
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, [barRef, isActive, isPaused, onClearanceChange]);
}
