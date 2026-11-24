import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getBestTtsDevice,
    getDeviceCapabilityTier,
    isMobileDevice
} from '@/services/browser';
import {
    convertHtmlToMarkdown,
    ensureJSZip,
    ensureLameJs,
    ensureMammoth,
    ensurePdfJs,
    extractDocumentText,
    extractTextFromCsv,
    extractTextFromEpub,
    extractTextFromFile,
    extractTextFromJson,
    extractTextFromPlainText,
    yieldToMain
} from '@/services/documents';
import { fetchWithTimeout } from '@/services/http';

const originalFetch = globalThis.fetch;
const originalUserAgentDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
const originalMaxTouchDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'maxTouchPoints');

function setNavigatorProp(prop: 'userAgent' | 'maxTouchPoints', value: string | number): void {
    Object.defineProperty(navigator, prop, {
        configurable: true,
        get: () => value
    });
}

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUserAgentDesc) {
        Object.defineProperty(Navigator.prototype, 'userAgent', originalUserAgentDesc);
    }
    delete (navigator as unknown as { userAgent?: unknown }).userAgent;
    if (originalMaxTouchDesc) {
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', originalMaxTouchDesc);
    }
    delete (navigator as unknown as { maxTouchPoints?: unknown }).maxTouchPoints;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('services/http fetchWithTimeout', () => {
    it('passes through directly when timeoutMs is 0, false, or null', async () => {
        const mockRes = new Response('ok', { status: 200 });
        const spy = vi.fn<typeof fetch>().mockResolvedValue(mockRes);
        globalThis.fetch = spy;

        const r1 = await fetchWithTimeout('https://example.test/1', {}, 0);
        const r2 = await fetchWithTimeout('https://example.test/2', {}, false);
        const r3 = await fetchWithTimeout('https://example.test/3', {}, null);

        expect(r1).toBe(mockRes);
        expect(r2).toBe(mockRes);
        expect(r3).toBe(mockRes);
        expect(spy).toHaveBeenCalledTimes(3);
    });

    it('wraps text() and json() and aborts when request exceeds timeout', async () => {
        const jsonSpy = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ hello: 'world' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        globalThis.fetch = jsonSpy;
        const okRes = await fetchWithTimeout('https://example.test/data', {}, 5000);
        await expect(okRes.json()).resolves.toEqual({ hello: 'world' });

        vi.useFakeTimers();
        globalThis.fetch = vi.fn<typeof fetch>((_url, init) => {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        });

        const slowPromise = fetchWithTimeout('https://example.test/slow', {}, 2500);
        const rejectionCheck = expect(slowPromise).rejects.toThrow(
            'Request timed out after 2.5 seconds'
        );
        await vi.advanceTimersByTimeAsync(2600);
        await rejectionCheck;
    });
});

describe('services/browser device capability helpers', () => {
    it('detects desktop vs mobile devices accurately', () => {
        setNavigatorProp(
            'userAgent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0'
        );
        setNavigatorProp('maxTouchPoints', 0);
        expect(isMobileDevice()).toBe(false);
        expect(getDeviceCapabilityTier()).toBe('desktop');
        expect(['wasm', 'webnn-npu']).toContain(getBestTtsDevice());

        setNavigatorProp(
            'userAgent',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15'
        );
        expect(isMobileDevice()).toBe(true);
        expect(getDeviceCapabilityTier()).toBe('mobile-constrained');
    });
});

describe('services/documents loaders & extractors', () => {
    it('loads bundled JSZip, Mammoth, PdfJs, and LameJs without CDN scripts', async () => {
        await yieldToMain();
        const [JSZip, mammoth, pdfjs, lamejs] = await Promise.all([
            ensureJSZip(),
            ensureMammoth(),
            ensurePdfJs(),
            ensureLameJs()
        ]);
        expect(typeof JSZip).toBe('function');
        expect(typeof mammoth.convertToHtml).toBe('function');
        expect(typeof mammoth.extractRawText).toBe('function');
        expect(typeof pdfjs.getDocument).toBe('function');
        expect(typeof lamejs.Mp3Encoder).toBe('function');
    });

    it('converts HTML headings, formatting, lists, and blockquotes cleanly to Markdown', () => {
        const md = convertHtmlToMarkdown(
            '<h1>Chapter One</h1><p>He saw <strong>iron</strong> and <em>salt</em>.</p><blockquote><p>Keep the ledger dry.</p></blockquote><ul><li>First</li><li>Second</li></ul>'
        );
        expect(md).toContain('# Chapter One');
        expect(md).toContain('**iron**');
        expect(md).toContain('*salt*');
        expect(md).toContain('> Keep the ledger dry.');
        expect(md).toContain('- First');
        expect(md).toContain('- Second');
    });

    it('extracts JSON, CSV, plain text, and synthetic EPUB files', async () => {
        const jsonOut = await extractTextFromJson(
            new File([JSON.stringify({ harbor: 'Oakhaven', cast: ['Maren', 'Tomas'] })], 'lore.json', {
                type: 'application/json'
            })
        );
        expect(jsonOut).toContain('Oakhaven');
        expect(jsonOut).toContain('Maren');

        const csvOut = await extractTextFromCsv(
            new File(['Name,Role\nMaren,Archivist\nTomas,Warden'], 'cast.csv', {
                type: 'text/csv'
            })
        );
        expect(csvOut).toContain('**Name**: Maren');
        expect(csvOut).toContain('**Role**: Archivist');

        const txtOut = await extractTextFromPlainText(
            new File(['Salt clocks tick below the pier.'], 'note.txt', { type: 'text/plain' })
        );
        expect(txtOut).toBe('Salt clocks tick below the pier.');

        const JSZip = await ensureJSZip();
        const zip = new JSZip();
        zip.file(
            'META-INF/container.xml',
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
        );
        zip.file(
            'OEBPS/content.opf',
            '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Harbor Archive</dc:title><dc:creator>C. Hale</dc:creator></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>'
        );
        zip.file(
            'OEBPS/ch1.xhtml',
            '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Act I</h1><p>Lanterns burned along Pier Four.</p></body></html>'
        );
        const epubArrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
        const epubOut = await extractTextFromEpub(epubArrayBuffer);
        expect(epubOut).toContain('# Harbor Archive');
        expect(epubOut).toContain('# Act I');
        expect(epubOut).toContain('Lanterns burned along Pier Four.');

        const viaAlias = await extractDocumentText(
            new File(['Harbor Bible Entry'], 'bible.md', { type: 'text/markdown' })
        );
        expect(viaAlias).toBe('Harbor Bible Entry');

        await expect(
            extractTextFromFile(new File(['abc'], 'archive.rar', { type: 'application/octet-stream' }))
        ).rejects.toThrow("Unsupported document format '.rar'");
    });
});
