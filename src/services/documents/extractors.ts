/**
 * @module services/documents/extractors
 * Client-side document extraction pipelines for `.docx`, `.pdf`, `.epub`, `.json`, `.csv`, `.md`, and `.txt`.
 */

import { ensureJSZip, ensureMammoth, ensurePdfJs, yieldToMain } from './loaders';

export interface ExtractionProgress {
    stage: string;
    message: string;
    page?: number;
    total?: number;
    current?: number;
}

export type ExtractionProgressCallback = (progress: ExtractionProgress) => void;

export interface ExtractableFileInput {
    name?: string;
    size?: number;
    type?: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    text?: () => Promise<string>;
}

/** Converts sanitized HTML fragments (Mammoth/EPUB) into clean structured Markdown. */
export function convertHtmlToMarkdown(htmlContent: string): string {
    if (!htmlContent || typeof htmlContent !== 'string') return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');

    const toRemove = doc.querySelectorAll('script, style, head, nav, svg');
    toRemove.forEach((el) => el.remove());

    const formatHtmlTable = (tableNode: Element): string => {
        const rows = Array.from(tableNode.querySelectorAll('tr'));
        if (!rows.length) return '';
        const matrix = rows.map((r) =>
            Array.from(r.querySelectorAll('th, td')).map((c) =>
                (c.textContent || '').trim().replace(/\|/g, '\\|')
            )
        );
        if (!matrix.length) return '';
        const maxCols = Math.max(...matrix.map((r) => r.length));
        if (maxCols === 0) return '';

        let md =
            '| ' +
            (matrix[0] || [])
                .concat(Array<string>(maxCols - (matrix[0]?.length || 0)).fill(''))
                .join(' | ') +
            ' |\n';
        md += '| ' + Array<string>(maxCols).fill('---').join(' | ') + ' |\n';
        for (let i = 1; i < matrix.length; i++) {
            const row = matrix[i];
            md +=
                '| ' +
                row.concat(Array<string>(maxCols - row.length).fill('')).join(' | ') +
                ' |\n';
        }
        return md;
    };

    const walk = (node: Node | null): string => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.nodeValue || '').replace(/\s+/g, ' ');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        let inner = '';
        for (const child of Array.from(el.childNodes)) {
            inner += walk(child);
        }

        switch (tag) {
            case 'h1':
                return `\n\n# ${inner.trim()}\n\n`;
            case 'h2':
                return `\n\n## ${inner.trim()}\n\n`;
            case 'h3':
                return `\n\n### ${inner.trim()}\n\n`;
            case 'h4':
                return `\n\n#### ${inner.trim()}\n\n`;
            case 'h5':
            case 'h6':
                return `\n\n##### ${inner.trim()}\n\n`;
            case 'p':
                return `\n\n${inner.trim()}\n\n`;
            case 'br':
                return '\n';
            case 'hr':
                return '\n\n---\n\n';
            case 'strong':
            case 'b':
                return inner.trim() ? `**${inner.trim()}**` : '';
            case 'em':
            case 'i':
                return inner.trim() ? `*${inner.trim()}*` : '';
            case 'code':
                return `\`${inner.trim()}\``;
            case 'pre':
                return `\n\n\`\`\`\n${(el.textContent || '').trim()}\n\`\`\`\n\n`;
            case 'blockquote':
                return `\n\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`;
            case 'li':
                return `\n- ${inner.trim()}`;
            case 'ul':
            case 'ol':
                return `\n${inner}\n`;
            case 'table':
                return `\n\n${formatHtmlTable(el)}\n\n`;
            default:
                return inner;
        }
    };

    const rawMd = walk(doc.body.firstChild || doc.body);
    return rawMd.replace(/\n{3,}/g, '\n\n').trim();
}

/** Extracts structured Markdown text from a `.docx` File, Blob, or ArrayBuffer. */
export async function extractTextFromDocx(
    fileOrBuffer: ArrayBuffer | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'loading', message: 'Loading Word document parser...' });
    const mammoth = await ensureMammoth();

    let arrayBuffer: ArrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
        arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
        arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
        throw new Error('Invalid input: expected File, Blob, or ArrayBuffer for .docx parsing.');
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Word document (.docx) file is empty (0 bytes).');
    }

    onProgress?.({ stage: 'parsing', message: 'Converting Word styles and headings...' });
    await yieldToMain();

    try {
        const options = {
            convertImage: mammoth.images.inline(() => Promise.resolve({ src: '' })),
            ignoreEmptyParagraphs: true
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        const html = result.value || '';

        onProgress?.({ stage: 'converting', message: 'Generating Markdown hierarchy...' });
        await yieldToMain();

        let md = convertHtmlToMarkdown(html);
        if (!md || !md.trim()) {
            const raw = await mammoth.extractRawText({ arrayBuffer });
            md = (raw.value || '').trim();
        }

        if (!md || !md.trim()) {
            throw new Error('Word document (.docx) contains no readable text.');
        }

        return md;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Can't find end of central directory")) {
            throw new Error('Corrupted or invalid .docx file (zip directory missing).', {
                cause: err
            });
        }
        throw new Error(`Word (.docx) extraction failed: ${msg}`, { cause: err });
    }
}

/** Extracts coordinate-aware Markdown text from a `.pdf` File, Blob, or ArrayBuffer. */
export async function extractTextFromPdf(
    fileOrBuffer: ArrayBuffer | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'loading', message: 'Loading PDF engine...' });
    const pdfjsLib = await ensurePdfJs();

    let arrayBuffer: ArrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
        arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
        arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
        throw new Error('Invalid input: expected File, Blob, or ArrayBuffer for .pdf parsing.');
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('PDF file is empty (0 bytes).');
    }

    onProgress?.({ stage: 'opening', message: 'Opening PDF document...' });
    await yieldToMain();

    let pdfDoc;
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
    } catch (err) {
        const name = err instanceof Error ? err.name : '';
        const msg = err instanceof Error ? err.message : String(err);
        if (name === 'PasswordException') {
            throw new Error(
                'This PDF is password-protected. Please provide an unlocked document.',
                { cause: err }
            );
        }
        if (name === 'InvalidPDFException') {
            throw new Error('The file is not a valid PDF or has been corrupted.', { cause: err });
        }
        throw new Error(`Failed to open PDF: ${msg}`, { cause: err });
    }

    const totalPages = pdfDoc.numPages;
    if (totalPages === 0) {
        throw new Error('PDF document has 0 pages.');
    }

    const pageTexts: string[] = [];
    const modalFontSize = 12;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress?.({
            stage: 'reading',
            page: pageNum,
            total: totalPages,
            message: `Extracting text from page ${pageNum} of ${totalPages}...`
        });

        await yieldToMain();

        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        const items = content.items || [];

        if (!items.length) {
            continue;
        }

        items.sort((a, b) => {
            const yDelta = b.transform[5] - a.transform[5];
            if (Math.abs(yDelta) > 3) return yDelta;
            return a.transform[4] - b.transform[4];
        });

        let pageStr = '';
        let lastY: number | null = null;

        for (const item of items) {
            const str = item.str;
            if (!str) continue;

            const y = item.transform[5];
            const height = item.height || Math.abs(item.transform[0]) || 12;
            const isLargeFont = height >= modalFontSize * 1.35;

            if (lastY === null) {
                if (isLargeFont) pageStr += `## ${str}`;
                else pageStr += str;
            } else {
                const yDiff = lastY - y;
                if (yDiff > height * 1.6) {
                    pageStr += '\n\n';
                    if (isLargeFont) pageStr += `## ${str}`;
                    else pageStr += str;
                } else if (yDiff > height * 0.5) {
                    pageStr += '\n' + str;
                } else {
                    const needsSpace =
                        !pageStr.endsWith(' ') && !pageStr.endsWith('-') && !str.startsWith(' ');
                    pageStr += (needsSpace ? ' ' : '') + str;
                }
            }
            lastY = y;
        }

        const trimmedPage = pageStr.trim();
        if (trimmedPage) {
            pageTexts.push(`[Page ${pageNum}]\n\n${trimmedPage}`);
        }
    }

    const combinedText = pageTexts.join('\n\n---\n\n').trim();
    if (!combinedText) {
        throw new Error(
            'This PDF contains no selectable text (it may be a scanned image or photo). Please run an OCR tool on it before uploading.'
        );
    }

    return combinedText;
}

/** Extracts chapter-ordered Markdown text from an `.epub` archive using bundled `JSZip`. */
export async function extractTextFromEpub(
    fileOrBuffer: ArrayBuffer | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'loading', message: 'Loading EPUB parser...' });
    const JSZip = await ensureJSZip();

    let zipData: ArrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
        zipData = fileOrBuffer;
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
        zipData = await fileOrBuffer.arrayBuffer();
    } else {
        throw new Error('Invalid input: expected File, Blob, or ArrayBuffer for .epub parsing.');
    }

    onProgress?.({ stage: 'unpacking', message: 'Reading EPUB container...' });
    await yieldToMain();

    let zip;
    try {
        zip = await JSZip.loadAsync(zipData);
    } catch (err) {
        throw new Error(
            `Corrupted EPUB archive: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }

    let opfPath = '';
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
        const containerXml = await containerFile.async('text');
        const doc = new DOMParser().parseFromString(containerXml, 'application/xml');
        const rootfile = doc.querySelector('rootfile');
        if (rootfile) opfPath = rootfile.getAttribute('full-path') || '';
    }

    if (!opfPath) {
        const opfFiles = zip.file(/\.opf$/i);
        if (opfFiles.length > 0) opfPath = opfFiles[0].name;
    }

    if (!opfPath) {
        throw new Error(
            'Invalid EPUB: Missing package document (container.xml and .opf not found).'
        );
    }

    const opfDir = opfPath.includes('/')
        ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
        : '';
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error(`Could not find OPF file at path '${opfPath}'.`);

    onProgress?.({ stage: 'manifest', message: 'Reading table of contents and reading spine...' });
    await yieldToMain();

    const opfXml = await opfFile.async('text');
    const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

    const titleEl = opfDoc.querySelector('title') || opfDoc.querySelector('dc\\:title');
    const bookTitle = titleEl ? (titleEl.textContent || '').trim() : 'EPUB Document';

    const manifestItems: Record<string, string> = {};
    const itemEls = Array.from(opfDoc.querySelectorAll('manifest > item'));
    for (const item of itemEls) {
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        if (id && href) {
            const cleanHref = href.split('#')[0];
            const fullPath = (opfDir + cleanHref).replace(/^\//, '');
            manifestItems[id] = fullPath;
        }
    }

    const spineRefEls = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    let chapterPaths = spineRefEls
        .map((ref) => manifestItems[ref.getAttribute('idref') || ''])
        .filter(Boolean);

    if (!chapterPaths.length) {
        chapterPaths = Object.values(manifestItems)
            .filter((p) => /\.(x?html|xml)$/i.test(p))
            .sort();
    }

    if (!chapterPaths.length) {
        throw new Error('No readable chapter files found inside this EPUB archive.');
    }

    const chapterTexts: string[] = [];
    const totalChapters = chapterPaths.length;

    for (let i = 0; i < totalChapters; i++) {
        const chapterPath = chapterPaths[i];
        onProgress?.({
            stage: 'extracting',
            current: i + 1,
            total: totalChapters,
            message: `Reading chapter ${i + 1} of ${totalChapters}...`
        });
        await yieldToMain();

        let file = zip.file(chapterPath) || zip.file(decodeURIComponent(chapterPath));
        if (!file) {
            const match = zip.file(
                new RegExp(
                    '^' + chapterPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
                    'i'
                )
            );
            if (match && match.length) file = match[0];
        }

        if (!file) continue;

        const rawHtml = await file.async('text');
        const md = convertHtmlToMarkdown(rawHtml);
        if (md && md.trim().length > 30) {
            chapterTexts.push(md.trim());
        }
    }

    if (!chapterTexts.length) {
        throw new Error('Could not extract any readable chapter text from this EPUB.');
    }

    return `# ${bookTitle}\n\n` + chapterTexts.join('\n\n---\n\n');
}

/** Extracts and formats JSON documents or story backups into Markdown records. */
export async function extractTextFromJson(
    fileOrString: string | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'parsing', message: 'Parsing JSON data...' });
    await yieldToMain();

    let jsonString: string;
    if (typeof fileOrString === 'string') {
        jsonString = fileOrString;
    } else if (fileOrString && typeof fileOrString.text === 'function') {
        jsonString = await fileOrString.text();
    } else {
        throw new Error('Invalid input: expected string or File for JSON parsing.');
    }

    if (!jsonString || !jsonString.trim()) {
        throw new Error('JSON file is empty.');
    }

    let data: unknown;
    try {
        data = JSON.parse(jsonString);
    } catch (err) {
        try {
            const sanitized = jsonString.replace(/,\s*([\]}])/g, '$1');
            data = JSON.parse(sanitized);
        } catch {
            throw new Error(
                `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    onProgress?.({ stage: 'formatting', message: 'Synthesizing semantic Markdown records...' });
    await yieldToMain();

    if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        ((data as { story?: unknown }).story || Array.isArray((data as { lore?: unknown }).lore))
    ) {
        const obj = data as {
            story?: {
                title?: string;
                world_primer?: string;
                lore?: Array<{ topic?: string; title?: string; detail?: string; text?: string; description?: string }>;
            };
            world_primer?: string;
            lore?: Array<{ topic?: string; title?: string; detail?: string; text?: string; description?: string }>;
        };
        const parts: string[] = [];
        const storyObj = obj.story || {};
        if (storyObj.title) parts.push(`# Story World Lore: ${storyObj.title}\n`);
        if (storyObj.world_primer || obj.world_primer) {
            parts.push(`## World Primer\n\n${storyObj.world_primer || obj.world_primer}\n`);
        }
        const loreList = obj.lore || storyObj.lore || [];
        if (Array.isArray(loreList) && loreList.length > 0) {
            parts.push(`## Lore Entries (${loreList.length} items)\n`);
            for (const item of loreList) {
                const topic = item.topic || item.title || 'World Fact';
                const detail = item.detail || item.text || item.description || '';
                parts.push(`### ${topic}\n\n${detail}\n`);
            }
        }
        if (parts.length > 0) {
            return parts.join('\n\n').trim();
        }
    }

    if (Array.isArray(data)) {
        if (!data.length) throw new Error('JSON array is empty.');
        const records = data.map((item, idx) => {
            if (typeof item !== 'object' || item === null) {
                return `- ${String(item)}`;
            }
            const rec = item as Record<string, unknown>;
            const nameKey = Object.keys(rec).find((k) =>
                /^(name|title|topic|id|character|location)$/i.test(k)
            );
            const recordTitle = nameKey ? String(rec[nameKey]) : `Record ${idx + 1}`;
            let card = `### ${recordTitle}\n`;
            for (const [k, v] of Object.entries(rec)) {
                if (k === nameKey) continue;
                const valStr = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
                card += `- **${k}**: ${valStr}\n`;
            }
            return card;
        });
        return `# Structured Lore Records (${data.length} entries)\n\n` + records.join('\n\n');
    }

    if (typeof data === 'object' && data !== null) {
        const walkJson = (obj: Record<string, unknown>, depth = 1): string => {
            const h = '#'.repeat(Math.min(depth + 1, 5));
            let out = '';
            for (const [k, v] of Object.entries(obj)) {
                if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                    out += `\n\n${h} ${k}\n\n` + walkJson(v as Record<string, unknown>, depth + 1);
                } else if (Array.isArray(v)) {
                    out += `\n\n${h} ${k}\n\n`;
                    v.forEach((elem) => {
                        out +=
                            typeof elem === 'object'
                                ? `\n- ${JSON.stringify(elem)}`
                                : `\n- ${String(elem)}`;
                    });
                } else {
                    out += `- **${k}**: ${String(v)}\n`;
                }
            }
            return out;
        };

        return `# World Lore Dictionary\n\n` + walkJson(data as Record<string, unknown>).trim();
    }

    return String(data);
}

/** Parses RFC-4180 CSV/TSV files into a Markdown summary table and entity cards. */
export async function extractTextFromCsv(
    fileOrString: string | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'reading', message: 'Reading CSV data...' });
    await yieldToMain();

    let rawCsv: string;
    if (typeof fileOrString === 'string') {
        rawCsv = fileOrString;
    } else if (fileOrString && typeof fileOrString.text === 'function') {
        rawCsv = await fileOrString.text();
    } else {
        throw new Error('Invalid input: expected string or File for CSV parsing.');
    }

    if (!rawCsv || !rawCsv.trim()) {
        throw new Error('CSV file is empty.');
    }

    const firstLine = rawCsv.split(/\r?\n/)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter =
        tabCount > commaCount && tabCount > semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

    onProgress?.({ stage: 'parsing', message: 'Parsing CSV records...' });
    await yieldToMain();

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    const chars = rawCsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        const next = chars[i + 1];

        if (c === '"') {
            if (insideQuotes && next === '"') {
                currentField += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (c === delimiter && !insideQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if (c === '\n' && !insideQuotes) {
            currentRow.push(currentField.trim());
            if (currentRow.some((f) => f.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            currentField += c;
        }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
            rows.push(currentRow);
        }
    }

    if (!rows.length) {
        throw new Error('CSV contains no data rows.');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    if (!dataRows.length) {
        throw new Error('CSV contains only a header line with no data rows.');
    }

    onProgress?.({ stage: 'synthesizing', message: 'Generating entity cards and tables...' });
    await yieldToMain();

    const tableHeader = '| ' + headers.map((h) => h.replace(/\|/g, '\\|')).join(' | ') + ' |';
    const tableDivider = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const tableRows = dataRows.slice(0, 50).map((row) => {
        return '| ' + headers.map((_, idx) => (row[idx] || '').replace(/\|/g, '\\|')).join(' | ') + ' |';
    });
    const tableMd = [tableHeader, tableDivider, ...tableRows].join('\n');

    const cards = dataRows.map((row, rowIdx) => {
        const titleField = row[0] || `Row ${rowIdx + 1}`;
        let card = `### [Entry ${rowIdx + 1}] ${titleField}\n`;
        headers.forEach((h, colIdx) => {
            const val = row[colIdx];
            if (val !== undefined && val !== '') {
                card += `- **${h}**: ${val}\n`;
            }
        });
        return card;
    });

    return (
        `# Tabular Lore Ingestion (${dataRows.length} records)\n\n` +
        `## Quick Reference Table\n\n${tableMd}\n\n` +
        `## Entity Details\n\n` +
        cards.join('\n\n')
    );
}

/** Normalizes `.txt` and `.md` plain text files, stripping BOM and ASCII control bytes. */
export async function extractTextFromPlainText(
    fileOrText: string | ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    onProgress?.({ stage: 'reading', message: 'Reading text file...' });
    await yieldToMain();

    let text: string;
    if (typeof fileOrText === 'string') {
        text = fileOrText;
    } else if (fileOrText && typeof fileOrText.text === 'function') {
        text = await fileOrText.text();
    } else {
        throw new Error('Invalid input: expected string or File for plain text.');
    }

    if (!text || !text.trim()) {
        throw new Error('Text file is empty.');
    }

    let cleaned = text.replace(/^\uFEFF/, '');
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    return cleaned.trim();
}

/** Master client-side document extraction dispatcher across all supported upload formats. */
export async function extractTextFromFile(
    file: ExtractableFileInput,
    onProgress?: ExtractionProgressCallback
): Promise<string> {
    if (!file) throw new Error('No file provided for document extraction.');
    const filename = (file.name || 'document.txt').trim();
    const ext = filename.toLowerCase().split('.').pop();

    if (file.size === 0) {
        throw new Error(`The file '${filename}' is empty (0 bytes).`);
    }

    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (file.size && file.size > MAX_FILE_SIZE) {
        throw new Error(
            `File '${filename}' is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum supported upload size is 100 MB.`
        );
    }

    switch (ext) {
        case 'docx':
            return await extractTextFromDocx(file, onProgress);
        case 'pdf':
            return await extractTextFromPdf(file, onProgress);
        case 'epub':
            return await extractTextFromEpub(file, onProgress);
        case 'json':
            return await extractTextFromJson(file, onProgress);
        case 'csv':
            return await extractTextFromCsv(file, onProgress);
        case 'txt':
        case 'text':
        case 'md':
        case 'markdown':
            return await extractTextFromPlainText(file, onProgress);
        default:
            if (file.type === 'application/pdf') return await extractTextFromPdf(file, onProgress);
            if (file.type === 'application/json') return await extractTextFromJson(file, onProgress);
            if (file.type === 'text/csv') return await extractTextFromCsv(file, onProgress);
            if (file.type && file.type.startsWith('text/')) {
                return await extractTextFromPlainText(file, onProgress);
            }

            throw new Error(
                `Unsupported document format '.${ext}'. Supported formats: .txt, .md, .docx, .pdf, .epub, .json, .csv.`
            );
    }
}

export const extractDocumentText = extractTextFromFile;
