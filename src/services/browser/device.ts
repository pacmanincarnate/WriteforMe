/**
 * @module services/browser/device
 * Client device capability detection for mobile UX responsiveness and Kokoro TTS accelerator routing.
 */

export type DeviceCapabilityTier = 'desktop' | 'mobile-capable' | 'mobile-constrained';
export type TtsAcceleratorDevice = 'wasm';

interface NavigatorWithMemory extends Navigator {
    deviceMemory?: number;
}

/** Detects iOS, iPadOS (desktop-UA Touch Safari), and Android mobile devices. */
export function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
        (navigator.maxTouchPoints > 1 && /Macintosh|Mac/i.test(navigator.userAgent || ''))
    );
}

/** Classifies runtime hardware into desktop, mobile-capable, or mobile-constrained tiers. */
export function getDeviceCapabilityTier(): DeviceCapabilityTier {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent || '';
    const isIOS =
        /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.maxTouchPoints > 1 && /Macintosh|Mac/i.test(ua));
    const isAndroid = /Android/i.test(ua);

    if (!isIOS && !isAndroid) return 'desktop';

    const deviceMemoryGB = (navigator as NavigatorWithMemory).deviceMemory || null;

    if (isIOS) {
        return 'mobile-constrained';
    }

    if (isAndroid) {
        if (deviceMemoryGB && deviceMemoryGB >= 6) return 'mobile-capable';
        return 'mobile-constrained';
    }

    return 'desktop';
}

/** Returns the safe default client TTS compute device (`wasm`) for in-browser Kokoro execution. */
export function getBestTtsDevice(): TtsAcceleratorDevice {
    return 'wasm';
}
