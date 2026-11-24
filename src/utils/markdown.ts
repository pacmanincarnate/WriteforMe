/**
 * @module utils/markdown
 * Markdown normalization, DOMPurify HTML sanitization, reader prose dialogue
 * highlighting, and Audio Drama Script speaker-cue styling.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { safeJsonStringify } from './json';

let markedConfigured = false;

/**
 * Configures `marked` once at startup: enables GFM line breaks while disabling
 * 4-space indented code blocks so indented narrative prose stays formatted as text.
 */
export function configureMarked(): void {
    if (markedConfigured) return;
    markedConfigured = true;
    try {
        marked.use({
            gfm: true,
            breaks: true,
            tokenizer: {
                code() {
                    return undefined;
                }
            }
        });
    } catch (e) {
        console.warn('marked configuration failed:', e);
    }
}

configureMarked();

/**
 * Normalizes leading and excessive indentation in Markdown strings so XML-indented
 * content renders cleanly as prose or nested lists without overflowing containers.
 */
export function normalizeMarkdownIndentation(text: string): string {
    if (!text || typeof text !== 'string') return '';
    const str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = str.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return '';

    let commonIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length > 0) {
            const match = line.match(/^([ \t]*)/);
            const indentLen = match ? match[1].replace(/\t/g, '  ').length : 0;
            if (indentLen < commonIndent) commonIndent = indentLen;
        }
    }

    let dedentedLines = lines;
    if (commonIndent > 0 && commonIndent !== Infinity) {
        dedentedLines = lines.map((line) => {
            if (line.trim().length === 0) return '';
            let count = 0;
            let i = 0;
            while (i < line.length && count < commonIndent) {
                if (line[i] === '\t') count += 2;
                else count += 1;
                i++;
            }
            return line.slice(i);
        });
    }

    let inFence = false;
    const finalLines = dedentedLines.map((line) => {
        if (/^```/.test(line.trim())) {
            inFence = !inFence;
            return line;
        }
        if (inFence) return line;
        const leadingMatch = line.match(/^(\s+)/);
        if (leadingMatch && leadingMatch[1].length >= 4) {
            return '  ' + line.trim();
        }
        return line;
    });

    return finalLines.join('\n');
}

/** Sanitizes rendered HTML via DOMPurify before `dangerouslySetInnerHTML`. */
export function sanitizeHtml(html: string): string {
    try {
        return DOMPurify.sanitize(html);
    } catch (e) {
        console.warn('DOMPurify sanitization failed:', e);
        return html;
    }
}

/** Parses Markdown (or structured prose object) into sanitized HTML. */
export function parseMarkdown(input: unknown): string {
    if (!input) return '';
    let text: string;
    if (typeof input !== 'string') {
        if (typeof input === 'object') {
            const rec = input as Record<string, unknown>;
            const extracted =
                rec.final ||
                rec.draft ||
                rec.prose ||
                rec.description ||
                rec.text ||
                rec.content ||
                rec.value;
            if (typeof extracted === 'string') {
                text = extracted;
            } else {
                text = safeJsonStringify(input);
            }
        } else {
            text = String(input);
        }
    } else {
        text = input;
    }
    if (!text || typeof text !== 'string') return '';
    text = normalizeMarkdownIndentation(text);
    try {
        configureMarked();
        const parsed = marked.parse(text);
        if (typeof parsed === 'string') {
            return sanitizeHtml(parsed);
        }
    } catch (e) {
        console.error('Failed to parse markdown with marked, falling back:', e);
    }
    try {
        const html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br />');
        return sanitizeHtml(`<p>${html}</p>`);
    } catch {
        return '';
    }
}

export const DRAMA_SPEAKER_HUE_COUNT = 12;

/**
 * Returns the CSS class for an audio drama speaker prefix, assigning each
 * character a deterministic yet collision-free hue within the current script.
 */
export function getAudioDramaSpeakerClass(
    rawName: string,
    speakerColorMap: Map<string, number>,
    usedColorIndices: Set<number>
): string {
    const key = String(rawName || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    if (!key || key === 'narrator' || key === 'narration') {
        return 'drama-speaker-name drama-speaker-narrator';
    }
    const existing = speakerColorMap.get(key);
    if (existing !== undefined) {
        return `drama-speaker-name drama-speaker-hue-${existing}`;
    }
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    let idx = (hash >>> 0) % DRAMA_SPEAKER_HUE_COUNT;
    if (usedColorIndices.size < DRAMA_SPEAKER_HUE_COUNT) {
        while (usedColorIndices.has(idx)) {
            idx = (idx + 1) % DRAMA_SPEAKER_HUE_COUNT;
        }
    }
    usedColorIndices.add(idx);
    speakerColorMap.set(key, idx);
    return `drama-speaker-name drama-speaker-hue-${idx}`;
}

/**
 * Styles speaker names at the front of lines (with per-character hues)
 * and bracketed stage/vocal instructions in rendered audio drama HTML.
 */
export function formatAudioDramaScriptHtml(html: string): string {
    if (!html || typeof html !== 'string') return html || '';
    const speakerColorMap = new Map<string, number>();
    const usedColorIndices = new Set<number>();

    // 1. Style character names at the start of lines (<p>, <li>, <br>, or string start)
    let out = html.replace(
        /(^|<(?:p|li)(?:\s+[^>]*)?>|<br\s*\/?>)(\s*)(?:<(strong|b)>)?([A-Za-z0-9][A-Za-z0-9_'’.\-\s]{0,44}?)(<\/\3>)?(\s*(?:\[[^\]\r\n]{1,60}\]|\([^)\r\n]{1,40}\))?\s*:)(<\/\3>)?/gi,
        (
            match,
            leadTag: string,
            ws: string,
            boldTag: string | undefined,
            rawName: string,
            midClose: string | undefined,
            suffix: string,
            endClose: string | undefined
        ) => {
            const trimmedName = rawName.trim();
            if (!trimmedName || /[.!?]$/.test(trimmedName)) return match;
            const cls = getAudioDramaSpeakerClass(trimmedName, speakerColorMap, usedColorIndices);
            const unclosedOpen = boldTag && !midClose && !endClose ? `<${boldTag}>` : '';
            if (/^\s*:$/.test(suffix)) {
                return `${leadTag}${ws}${unclosedOpen}<span class="${cls}">${trimmedName}${suffix}</span>`;
            }
            return `${leadTag}${ws}${unclosedOpen}<span class="${cls}">${trimmedName}</span>${suffix}`;
        }
    );

    // 2. Style bracketed instructions (tag-aware so HTML attributes are untouched)
    out = out.replace(/(<[^>]+>)|(\[[^\]\r\n]{1,200}\])/g, (match, tag: string | undefined, bracketCue: string | undefined) => {
        if (tag) return tag;
        return `<span class="drama-bracket-cue">${bracketCue}</span>`;
    });

    return out;
}

/**
 * Formats reader prose or audio drama script into HTML with scene-break
 * dividers, dialogue quote highlighting, and Drama-3 vocal tag styling.
 */
export function formatReaderProse(input: unknown): string {
    if (!input) return '';
    let prose: string;
    if (typeof input !== 'string') {
        if (typeof input === 'object') {
            const rec = input as Record<string, unknown>;
            const extracted =
                rec.final ||
                rec.draft ||
                rec.prose ||
                rec.description ||
                rec.text ||
                rec.content ||
                rec.value;
            prose = typeof extracted === 'string' ? extracted : safeJsonStringify(input);
        } else {
            prose = String(input);
        }
    } else {
        prose = input;
    }

    const win =
        typeof window !== 'undefined'
            ? (window as unknown as { isAudioDramaScriptText?: (s: string) => boolean })
            : null;
    const isDramaScript =
        Boolean(win?.isAudioDramaScriptText) && Boolean(win!.isAudioDramaScriptText!(prose));
    const hasDramaTags =
        isDramaScript || /<(whisper|emphasis|stress|soft|fast|slow|forceful)>[\s\S]*?<\/\1>/i.test(prose);
    if (hasDramaTags) {
        prose = prose.replace(
            /<(\/?)(whisper|emphasis|stress|soft|fast|slow|forceful)>/gi,
            (_m, slash: string, tag: string) =>
                `<span class="drama3-xml-tag">&lt;${slash}${tag.toLowerCase()}&gt;</span>`
        );
    }

    let html = parseMarkdown(prose);
    try {
        html = html.replace(
            /<p\s*[^>]*>\s*(?:(?:\.|\*|-|–|—|•|✦|\s)\s*){2,}\s*<\/p>/gi,
            '<div class="reader-scene-divider-line" role="separator" aria-label="Scene break"></div>'
        );
        html = html.replace(
            /<hr\s*\/?>/gi,
            '<div class="reader-scene-divider-line" role="separator" aria-label="Scene break"></div>'
        );
        html = html.replace(
            /<div class="reader-fleuron-divider"[^>]*><\/div>/gi,
            '<div class="reader-scene-divider-line" role="separator" aria-label="Scene break"></div>'
        );

        html = html.replace(
            /(<[^>]+>)|(“[^”\n\r]+”)|(«[^»\n\r]+»)|(„[^“\n\r]+“)|((?<!=)"([^"\r\n]+)")/g,
            (
                match,
                tag: string | undefined,
                curly: string | undefined,
                guillemet: string | undefined,
                german: string | undefined,
                straightAll: string | undefined
            ) => {
                if (tag) return tag;
                const dialogue = curly || guillemet || german || straightAll;
                if (dialogue && dialogue.length > 2) {
                    return `<span class="reader-dialogue">${dialogue}</span>`;
                }
                return match;
            }
        );

        if (isDramaScript) {
            html = formatAudioDramaScriptHtml(html);
        }
    } catch (e) {
        console.warn('formatReaderProse dialogue highlighting error:', e);
    }
    return html;
}
