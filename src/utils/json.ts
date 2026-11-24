/**
 * @module utils/json
 * Safe JSON serialization, storage guards, reasoning-block extraction, and
 * resilient LLM JSON output extraction.
 */

/** Regex matching placeholder strings emitted when circular/DOM objects are stringified. */
export const SERIALIZATION_PLACEHOLDER_REGEX = /^\[(?:circular|dom\/window object|object object)\]$/i;

/** Checks whether a value is a non-data serialization placeholder string. */
export function isSerializationPlaceholder(val: unknown): boolean {
    return typeof val === 'string' && SERIALIZATION_PLACEHOLDER_REGEX.test(val.trim());
}

/**
 * Circular- and DOM-safe JSON.stringify wrapper.
 * Strings are returned directly; null/undefined return `""`.
 */
export function safeJsonStringify(obj: unknown, space?: string | number): string {
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj;
    try {
        const ancestors: object[] = [];
        return (
            JSON.stringify(
                obj,
                function (this: unknown, _key: string, value: unknown) {
                    if (typeof value !== 'object' || value === null) {
                        return value;
                    }
                    if (
                        typeof window !== 'undefined' &&
                        (value === window ||
                            (typeof Node !== 'undefined' && value instanceof Node) ||
                            (typeof Event !== 'undefined' && value instanceof Event))
                    ) {
                        return '[DOM/Window Object]';
                    }
                    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
                        ancestors.pop();
                    }
                    if (ancestors.includes(value)) {
                        return '[Circular]';
                    }
                    ancestors.push(value);
                    return value;
                },
                space
            ) || ''
        );
    } catch {
        return '';
    }
}

/** Safely writes a string or JSON-serialized value to `localStorage`. */
export function safeLocalStorageSet(key: string, value: unknown): void {
    try {
        if (typeof value === 'object' && value !== null) {
            localStorage.setItem(key, JSON.stringify(value));
        } else {
            localStorage.setItem(key, String(value));
        }
    } catch (e) {
        console.warn(`safeLocalStorageSet: failed to write key "${key}":`, e);
    }
}

/** Safely writes a string or JSON-serialized value to `sessionStorage`. */
export function safeSessionStorageSet(key: string, value: unknown): void {
    try {
        if (typeof value === 'object' && value !== null) {
            sessionStorage.setItem(key, JSON.stringify(value));
        } else {
            sessionStorage.setItem(key, String(value));
        }
    } catch (e) {
        console.warn(`safeSessionStorageSet: failed to write key "${key}":`, e);
    }
}

export interface ExtractedReasoningResult {
    text: string;
    reasoningText: string;
}

/**
 * Separates `<think>`, `<reasoning>`, `<thought>`, and `<analysis>` blocks
 * (including unclosed or pre-filled implicit opening tags) from model output.
 */
export function extractReasoningAndContent(
    rawText: unknown,
    initialReasoning = ''
): ExtractedReasoningResult {
    let text = rawText !== null && rawText !== undefined ? String(rawText) : '';
    const reasoningParts: string[] = [];

    if (initialReasoning && String(initialReasoning).trim()) {
        reasoningParts.push(String(initialReasoning).trim());
    }

    if (!text) {
        return {
            text: '',
            reasoningText: reasoningParts.join('\n\n')
        };
    }

    // 1. Paired tags: <think>...</think>, <reasoning>...</reasoning>, <thought>...</thought>, <analysis>...</analysis>
    const pairedTagRegex = /<(think|reasoning|thought|analysis)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = pairedTagRegex.exec(text)) !== null) {
        if (match[2] && match[2].trim()) {
            reasoningParts.push(match[2].trim());
        }
    }
    text = text.replace(pairedTagRegex, '');

    // 2. Implicit opening tag (e.g. KoboldCPP / Qwen 3 / DeepSeek R1 pre-filled <think> header)
    const closingOnlyRegex = /^([\s\S]*?)<\/(think|reasoning|thought|analysis)>/i;
    const closingMatch = text.match(closingOnlyRegex);
    if (closingMatch) {
        if (closingMatch[1] && closingMatch[1].trim()) {
            reasoningParts.push(closingMatch[1].trim());
        }
        text = text.substring(closingMatch[0].length);
    }

    // 3. Unclosed thinking tag
    const openingOnlyRegex = /<(think|reasoning|thought|analysis)>([\s\S]*)$/i;
    const openingMatch = text.match(openingOnlyRegex);
    if (openingMatch) {
        const tagIndex = text.search(/<(think|reasoning|thought|analysis)>/i);
        if (openingMatch[2] && openingMatch[2].trim()) {
            reasoningParts.push(openingMatch[2].trim());
        }
        text = text.substring(0, tagIndex);
    }

    // 4. Standalone leftover closing tags
    text = text.replace(/<\/(think|reasoning|thought|analysis)>/gi, '');

    return {
        text: text.trim(),
        reasoningText: reasoningParts.join('\n\n')
    };
}

/**
 * Strips chain-of-thought wrappers and Markdown code fences from LLM text
 * and extracts the cleanest valid JSON object or array substring.
 */
export function cleanJson(text: string): string {
    if (!text) return '';

    const extracted = extractReasoningAndContent(text);
    const contentToClean =
        extracted.text && extracted.text.trim() ? extracted.text.trim() : String(text).trim();

    const match = contentToClean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const cleaned = match ? match[1].trim() : contentToClean.trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = cleaned.substring(firstBrace, lastBrace + 1);
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            // Fall through to array / raw tracking
        }
    }

    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const candidate = cleaned.substring(firstBracket, lastBracket + 1);
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            // Fall through to fallback boundary tracking
        }
    }

    const startObj = cleaned.indexOf('{');
    const endObj = cleaned.lastIndexOf('}');
    const startArr = cleaned.indexOf('[');
    const endArr = cleaned.lastIndexOf(']');

    let start: number;
    let end: number;

    if (startObj !== -1 && startArr !== -1) {
        if (startObj < startArr) {
            start = startObj;
            end = endObj;
        } else {
            start = startArr;
            end = endArr;
        }
    } else {
        start = startObj !== -1 ? startObj : startArr;
        end = endObj !== -1 ? endObj : endArr;
    }

    if (start !== -1 && end !== -1 && end > start) {
        return cleaned.substring(start, end + 1);
    }
    return cleaned;
}
