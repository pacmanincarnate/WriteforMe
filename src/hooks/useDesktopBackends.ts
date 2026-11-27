/**
 * @module hooks/useDesktopBackends
 * Subscribes to Electron desktop backend lifecycle notifications (install completions,
 * errors, and on-demand KoboldCpp startup) and surfaces them as toasts in the main app.
 */

import { useEffect, useRef } from 'react';

export interface UseDesktopBackendsOptions {
    showToast?: (message: string, type?: string) => void;
}

export function useDesktopBackends({ showToast }: UseDesktopBackendsOptions = {}): void {
    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const bridge = window.ellipsisDesktopBackends;
        if (!bridge?.onEvent) return;
        return bridge.onEvent((evt) => {
            if (!evt?.message) return;
            showToastRef.current?.(evt.message, evt.level || 'success');
        });
    }, []);
}
