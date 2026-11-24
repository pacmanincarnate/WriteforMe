/**
 * @module services/documents/loaders
 * Lazy Vite dynamic-import loaders for client-side document parsing and MP3 encoding
 * (`jszip`, `mammoth`, `pdfjs-dist`, `@breezystack/lamejs`), replacing legacy CDN script tags.
 */

export interface JSZipFileEntry {
    name: string;
    async(type: 'text'): Promise<string>;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
    async(type: 'blob'): Promise<Blob>;
}

export interface JSZipArchive {
    file(path: string): JSZipFileEntry | null;
    file(pattern: RegExp): JSZipFileEntry[];
    file(
        path: string,
        data: string | ArrayBuffer | Uint8Array | Blob,
        options?: { compression?: string }
    ): JSZipArchive;
    folder(name: string): JSZipArchive | null;
    loadAsync(data: ArrayBuffer | Uint8Array | Blob | string): Promise<JSZipArchive>;
    generateAsync(options: { type: 'arraybuffer' }): Promise<ArrayBuffer>;
    generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

export interface JSZipStatic {
    new (): JSZipArchive;
    loadAsync(data: ArrayBuffer | Uint8Array | Blob | string): Promise<JSZipArchive>;
}

export interface MammothLib {
    convertToHtml(
        input: { arrayBuffer: ArrayBuffer },
        options?: { convertImage?: unknown; ignoreEmptyParagraphs?: boolean }
    ): Promise<{ value: string }>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
    images: {
        inline(fn: () => Promise<{ src: string }>): unknown;
    };
}

export interface PdfJsTextItem {
    str: string;
    height?: number;
    transform: number[];
}

export interface PdfJsPage {
    getTextContent(): Promise<{ items?: PdfJsTextItem[] }>;
}

export interface PdfJsDocument {
    numPages: number;
    getPage(pageNum: number): Promise<PdfJsPage>;
}

export interface PdfJsLib {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(src: { data: ArrayBuffer } | ArrayBuffer): { promise: Promise<PdfJsDocument> };
}

export interface LameJsLib {
    Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
        encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
        flush(): Uint8Array;
    };
    WavHeader: unknown;
}

interface WindowWithThirdPartyLibs extends Window {
    JSZip?: JSZipStatic;
    mammoth?: MammothLib;
    pdfjsLib?: PdfJsLib;
    lamejs?: LameJsLib;
}

let jsZipPromise: Promise<JSZipStatic> | null = null;
let mammothPromise: Promise<MammothLib> | null = null;
let pdfjsPromise: Promise<PdfJsLib> | null = null;
let lameJsPromise: Promise<LameJsLib> | null = null;

/** Non-blocking macro-task yield helper to keep long document parsing passes at 60fps. */
export function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        } else {
            setTimeout(resolve, 0);
        }
    });
}

/** Lazily loads bundled `jszip` (reusing preloaded `window.JSZip` when present). */
export async function ensureJSZip(): Promise<JSZipStatic> {
    const win = typeof window !== 'undefined' ? (window as WindowWithThirdPartyLibs) : undefined;
    if (win?.JSZip) return win.JSZip;
    if (!jsZipPromise) {
        jsZipPromise = import('jszip')
            .then((mod) => {
                const resolved = ((mod as unknown as { default?: JSZipStatic }).default ||
                    mod) as unknown as JSZipStatic;
                if (win && !win.JSZip) win.JSZip = resolved;
                return resolved;
            })
            .catch((err) => {
                jsZipPromise = null;
                throw new Error(
                    `Could not load the EPUB library (JSZip): ${err instanceof Error ? err.message : String(err)}`
                );
            });
    }
    return jsZipPromise;
}

/** Lazily loads bundled `mammoth` browser build for `.docx` extraction. */
export async function ensureMammoth(): Promise<MammothLib> {
    const win = typeof window !== 'undefined' ? (window as WindowWithThirdPartyLibs) : undefined;
    if (win?.mammoth) return win.mammoth;
    if (!mammothPromise) {
        mammothPromise = import('mammoth/mammoth.browser.min.js')
            .then((mod) => {
                const candidate = ((mod as unknown as { default?: MammothLib }).default ||
                    mod) as unknown as Partial<MammothLib>;
                const resolved =
                    typeof candidate?.convertToHtml === 'function'
                        ? (candidate as MammothLib)
                        : win?.mammoth;
                if (!resolved || typeof resolved.convertToHtml !== 'function') {
                    throw new Error('Mammoth browser parser failed to expose convertToHtml().');
                }
                if (win && !win.mammoth) win.mammoth = resolved;
                return resolved;
            })
            .catch((err) => {
                mammothPromise = null;
                throw new Error(
                    `Failed to load Word (.docx) parser library (Mammoth): ${err instanceof Error ? err.message : String(err)}`
                );
            });
    }
    return mammothPromise;
}

/** Lazily loads bundled `pdfjs-dist` and configures its local Vite worker URL. */
export async function ensurePdfJs(): Promise<PdfJsLib> {
    const win = typeof window !== 'undefined' ? (window as WindowWithThirdPartyLibs) : undefined;
    if (win?.pdfjsLib) return win.pdfjsLib;
    if (!pdfjsPromise) {
        pdfjsPromise = Promise.all([
            import('pdfjs-dist'),
            import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ])
            .then(([pdfMod, workerUrlMod]) => {
                const resolved = pdfMod as unknown as PdfJsLib;
                if (
                    resolved.GlobalWorkerOptions &&
                    !resolved.GlobalWorkerOptions.workerSrc &&
                    workerUrlMod?.default
                ) {
                    resolved.GlobalWorkerOptions.workerSrc = workerUrlMod.default;
                }
                if (win && !win.pdfjsLib) win.pdfjsLib = resolved;
                return resolved;
            })
            .catch((err) => {
                pdfjsPromise = null;
                throw new Error(
                    `Failed to load PDF parser library (PDF.js): ${err instanceof Error ? err.message : String(err)}`
                );
            });
    }
    return pdfjsPromise;
}

/** Lazily loads bundled `@breezystack/lamejs` and registers `window.lamejs`. */
export async function ensureLameJs(): Promise<LameJsLib> {
    const win = typeof window !== 'undefined' ? (window as WindowWithThirdPartyLibs) : undefined;
    if (win?.lamejs) return win.lamejs;
    if (!lameJsPromise) {
        lameJsPromise = import('@breezystack/lamejs')
            .then((mod) => {
                const resolved: LameJsLib = {
                    Mp3Encoder: mod.Mp3Encoder,
                    WavHeader: mod.WavHeader
                };
                if (win && !win.lamejs) win.lamejs = resolved;
                return resolved;
            })
            .catch((err) => {
                lameJsPromise = null;
                throw new Error(
                    `Could not load MP3 encoder library (lamejs): ${err instanceof Error ? err.message : String(err)}`
                );
            });
    }
    return lameJsPromise;
}
