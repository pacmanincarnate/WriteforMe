/**
 * @module utils/xml
 * XML escaping, decoding, tag/attribute extraction, and structured
 * object-to-XML serialization helpers used across the agent pipeline.
 */

/** Escapes XML reserved characters (`&`, `<`, `>`, `"`, `'`). */
export function escapeXml(str: unknown): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Decodes standard named, decimal, numeric, and malformed `&amp` XML entities. */
export function decodeXmlEntities(str: unknown): string {
    if (!str) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp(?![a-zA-Z0-9#])/g, '&');
}

/** Strips XML tags and normalizes whitespace for clean plain-text display. */
export function stripXmlTags(str: unknown): string {
    if (!str || typeof str !== 'string') return '';
    return decodeXmlEntities(str)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extracts the trimmed inner content of the first matching `<tag>...</tag>` element. */
export function extractTag(text: string, tag: string): string {
    if (!text || !tag) return '';
    const regex = new RegExp('<' + tag + '(?:\\s+[^>]*)?>([\\s\\S]*?)</' + tag + '\\s*>', 'i');
    const match = text.match(regex);
    return match ? decodeXmlEntities(match[1].trim()) : '';
}

/** Extracts an attribute value from the opening `<tag ... attr="...">` element. */
export function extractTagAttribute(text: string, tag: string, attrName: string): string {
    if (!text || !tag || !attrName) return '';
    const regex = new RegExp('<' + tag + '[^>]*\\b' + attrName + '=["\']([^"\']*)["\'][^>]*>', 'i');
    const match = regex.exec(text);
    return match ? decodeXmlEntities(match[1].trim()) : '';
}

/** Extracts inner content for every matching `<tag>...</tag>` occurrence. */
export function extractAllTags(text: string, tag: string): string[] {
    if (!text || !tag) return [];
    const regex = new RegExp('<' + tag + '(?:\\s+[^>]*)?>([\\s\\S]*?)</' + tag + '\\s*>', 'gi');
    const matches = [...text.matchAll(regex)];
    return matches.map((m) => decodeXmlEntities(m[1].trim()));
}

/**
 * Extracts `<childTag>` elements inside `<parentTag>...</parentTag>`.
 * Supports both 2-argument `(text, childTag)` and 3-argument `(text, parentTag, childTag)` calls.
 */
export function extractTagList(
    text: string,
    parentOrChildTag: string,
    childTag: string | null = null
): string[] {
    if (!text || !parentOrChildTag) return [];
    if (!childTag) {
        return extractAllTags(text, parentOrChildTag);
    }
    const pMatch = new RegExp(
        '<' + parentOrChildTag + '(?:\\s+[^>]*)?>([\\s\\S]*?)</' + parentOrChildTag + '\\s*>',
        'i'
    ).exec(text);
    return pMatch ? extractAllTags(pMatch[1], childTag) : extractAllTags(text, childTag);
}

/**
 * Domain-aware object/array to XML serializer used by agent prompts and reviewers.
 */
export function formatObjectToXml(obj: unknown, itemTag: string | null = null): string {
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

    if (Array.isArray(obj)) {
        if (obj.length === 0) return '';
        return obj
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    const tag = itemTag || 'item';
                    return `  <${tag}>${escapeXml(String(item))}</${tag}>`;
                }
                const rec = item as Record<string, unknown>;
                const details = (rec.details && typeof rec.details === 'object'
                    ? rec.details
                    : null) as Record<string, unknown> | null;

                // Domain: Character profile
                if (
                    rec.id &&
                    (rec.core_flaw !== undefined ||
                        rec.core_desire !== undefined ||
                        rec.vocal_cadence !== undefined ||
                        rec.role !== undefined)
                ) {
                    return `  <character_profile>\n    <id>${escapeXml(rec.id)}</id>\n    <name>${escapeXml(rec.name || 'Unnamed')}</name>\n    <role>${escapeXml(rec.role || '')}</role>\n${rec.corner_role ? `    <corner_role>${escapeXml(rec.corner_role)}</corner_role>\n` : ''}    <core_flaw>${escapeXml(rec.core_flaw || details?.history || '')}</core_flaw>\n    <core_desire>${escapeXml(rec.core_desire || details?.goals || '')}</core_desire>\n    <vocal_cadence>${escapeXml(rec.vocal_cadence || rec.voice_sample || 'Standard')}</vocal_cadence>\n  </character_profile>`;
                }
                // Domain: Thread
                if (rec.id && (rec.name !== undefined || rec.description !== undefined) && !rec.core_flaw) {
                    return `  <thread>\n    <thread_id>${escapeXml(rec.id)}</thread_id>\n    <name>${escapeXml(rec.name || '')}</name>\n    <description>${escapeXml(rec.description || '')}</description>\n  </thread>`;
                }
                // Domain: Character arc
                if (
                    rec.char_id ||
                    rec.lie_believed !== undefined ||
                    rec.truth_needed !== undefined ||
                    rec.arc_catalyst !== undefined
                ) {
                    return `  <arc>\n    <char_id>${escapeXml(rec.char_id || rec.id || '')}</char_id>\n${rec.corner_role ? `    <corner_role>${escapeXml(rec.corner_role)}</corner_role>\n` : ''}    <lie_believed>${escapeXml(rec.lie_believed || '')}</lie_believed>\n    <truth_needed>${escapeXml(rec.truth_needed || '')}</truth_needed>\n    <arc_catalyst>${escapeXml(rec.arc_catalyst || '')}</arc_catalyst>\n    <arc_description>${escapeXml(rec.description || rec.arc_description || '')}</arc_description>\n${rec.web_pressure ? `    <web_pressure>${escapeXml(rec.web_pressure)}</web_pressure>\n` : ''}  </arc>`;
                }
                // Generic object inside array
                const tag = itemTag || 'item';
                const inner = Object.entries(rec)
                    .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'function')
                    .map(
                        ([k, v]) =>
                            `    <${k}>${typeof v === 'object' ? formatObjectToXml(v) : escapeXml(String(v))}</${k}>`
                    )
                    .join('\n');
                return `  <${tag}>\n${inner}\n  </${tag}>`;
            })
            .join('\n');
    }

    if (typeof obj === 'object') {
        const inner = Object.entries(obj as Record<string, unknown>)
            .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'function')
            .map(([k, v]) => {
                if (Array.isArray(v)) {
                    return `  <${k}>\n${formatObjectToXml(v)}\n  </${k}>`;
                }
                if (typeof v === 'object') {
                    return `  <${k}>\n${formatObjectToXml(v)}\n  </${k}>`;
                }
                return `  <${k}>${escapeXml(String(v))}</${k}>`;
            })
            .join('\n');
        return itemTag ? `<${itemTag}>\n${inner}\n</${itemTag}>` : inner;
    }

    return String(obj);
}
