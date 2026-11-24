declare module 'mammoth/mammoth.browser.min.js' {
    export interface MammothImageInput {
        contentType: string;
        readAsArrayBuffer?: () => Promise<ArrayBuffer>;
        read?: (encoding?: string) => Promise<string>;
    }
    export interface MammothOptions {
        convertImage?: unknown;
        ignoreEmptyParagraphs?: boolean;
        [key: string]: unknown;
    }
    export interface MammothResult {
        value: string;
        messages: Array<{ type: string; message: string }>;
    }
    export interface MammothModule {
        convertToHtml(
            input: { arrayBuffer: ArrayBuffer },
            options?: MammothOptions
        ): Promise<MammothResult>;
        extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
        images: {
            inline(
                fn: (image: MammothImageInput) => Promise<{ src: string }>
            ): unknown;
        };
    }
    const mammoth: MammothModule;
    export default mammoth;
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
    const workerUrl: string;
    export default workerUrl;
}

declare module '@breezystack/lamejs' {
    export class Mp3Encoder {
        constructor(channels: number, sampleRate: number, kbps: number);
        encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
        flush(): Uint8Array;
    }
    export class WavHeader {
        static readHeader(dataView: DataView): {
            channels: number;
            sampleRate: number;
            bitsPerSample: number;
            dataOffset: number;
            dataLen: number;
        };
    }
}
