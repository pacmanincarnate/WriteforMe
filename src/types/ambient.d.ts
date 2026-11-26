declare module '@breezystack/lamejs' {
    export class Mp3Encoder {
        constructor(channels: number, sampleRate: number, kbps: number);
        encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
        flush(): Uint8Array;
    }
    const lamejs: {
        Mp3Encoder: typeof Mp3Encoder;
    };
    export default lamejs;
}

interface Window {
    React?: unknown;
    ReactDOM?: unknown;
    marked?: unknown;
    DOMPurify?: unknown;
    deferredPWAInstallPrompt?: Event | null;
}

declare const __APP_VERSION__: string;
