import { describe, expect, it } from 'vitest';
import {
    cleanJson,
    decodeXmlEntities,
    escapeXml,
    extractAllTags,
    extractReasoningAndContent,
    extractTag,
    extractTagAttribute,
    extractTagList,
    formatObjectToXml,
    formatReaderProse,
    isSerializationPlaceholder,
    normalizeMarkdownIndentation,
    parseMarkdown,
    safeJsonStringify,
    stripXmlTags
} from '@/utils';

describe('JSON, Reasoning & Storage Utilities', () => {
    it('stringifies safely with circular references and placeholder detection', () => {
        const circular: Record<string, unknown> = { ok: true };
        circular.self = circular;
        const json = safeJsonStringify(circular);
        expect(json).toContain('"[Circular]"');
        expect(isSerializationPlaceholder('[Circular]')).toBe(true);
        expect(isSerializationPlaceholder('[DOM/Window Object]')).toBe(true);
        expect(isSerializationPlaceholder('actual prose')).toBe(false);
    });

    it('separates paired, implicit closing, and unclosed reasoning blocks', () => {
        const paired = extractReasoningAndContent('<think>internal plan</think>\nFinal answer');
        expect(paired.text).toBe('Final answer');
        expect(paired.reasoningText).toBe('internal plan');

        const implicit = extractReasoningAndContent('prefilled thoughts</think>\nVisible output');
        expect(implicit.text).toBe('Visible output');
        expect(implicit.reasoningText).toBe('prefilled thoughts');

        const unclosed = extractReasoningAndContent('Visible prefix<reasoning>trailing thoughts');
        expect(unclosed.text).toBe('Visible prefix');
        expect(unclosed.reasoningText).toBe('trailing thoughts');
    });

    it('extracts valid JSON from reasoning-wrapped fenced responses', () => {
        const raw = `<think>Evaluating scene</think>\nHere is the payload:\n\`\`\`json\n{"status": "PASS", "score": 9}\n\`\`\`\nDone.`;
        expect(JSON.parse(cleanJson(raw))).toEqual({ status: 'PASS', score: 9 });
    });
});

describe('XML Parser & Serializer Utilities', () => {
    it('escapes and decodes named, decimal, hex, and malformed &amp entities', () => {
        const escaped = escapeXml(`A & B < "C" > 'D'`);
        expect(escaped).toBe('A &amp; B &lt; &quot;C&quot; &gt; &apos;D&apos;');
        expect(decodeXmlEntities(`${escaped} &#39; &#x2A; &amp amperage &amperage`)).toBe(
            `A & B < "C" > 'D' ' * & amperage &amperage`
        );
        expect(stripXmlTags('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('extracts single tags, attributes, repeated tags, and scoped lists', () => {
        const xml = `
            <review status="PASS" id='r1'>
                <reasons>
                    <reason>Tight pacing</reason>
                    <reason>Clear subtext</reason>
                </reasons>
                <notes>No blockers</notes>
            </review>
            <extra><reason>Outside reason</reason></extra>
        `;
        expect(extractTagAttribute(xml, 'review', 'status')).toBe('PASS');
        expect(extractTag(xml, 'notes')).toBe('No blockers');
        expect(extractAllTags(xml, 'reason')).toHaveLength(3);
        expect(extractTagList(xml, 'reasons', 'reason')).toEqual(['Tight pacing', 'Clear subtext']);
    });

    it('formats characters, threads, and arcs to structured XML', () => {
        const charXml = formatObjectToXml([{ id: 'C1', name: 'Maren', role: 'Lead', core_flaw: 'Pride' }]);
        expect(charXml).toContain('<character_profile>');
        expect(charXml).toContain('<name>Maren</name>');

        const threadXml = formatObjectToXml([{ id: 'T1', name: 'Relic', description: 'Find the key' }]);
        expect(threadXml).toContain('<thread_id>T1</thread_id>');
    });
});

describe('Markdown & Reader Prose Utilities', () => {
    it('dedents XML-indented markdown without breaking fenced code blocks', () => {
        const md = `    Paragraph one\n\n    \`\`\`\n      kept\n    \`\`\`\n        - nested`;
        const norm = normalizeMarkdownIndentation(md);
        expect(norm.startsWith('Paragraph one')).toBe(true);
        expect(norm).toContain('  - nested');
    });

    it('sanitizes HTML and renders scene dividers, dialogue spans, and drama tags', () => {
        expect(parseMarkdown('Hello **world** <script>alert(1)</script>')).not.toContain('<script>');
        const formatted = formatReaderProse('***\n\n"Stay low," she whispered.\n\n<whisper>Now.</whisper>');
        expect(formatted).toContain('reader-scene-divider-line');
        expect(formatted).toContain('<span class="reader-dialogue">"Stay low,"</span>');
        expect(formatted).toContain('<span class="drama3-xml-tag">&lt;whisper&gt;</span>');
    });
});
