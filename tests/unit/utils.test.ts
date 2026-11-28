import { describe, expect, it } from 'vitest';
import {
    cleanJson,
    createAudioDramaSpeakerPalette,
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

    it('color-codes audio drama speaker names and styles bracketed cues without window globals', () => {
        const script = [
            'Narrator: Rain tapped against the skylight.',
            '',
            'Priya: [quietly, hiding panic] Did you hear that?',
            '',
            "**O'Connor:** [sigh] Check the lock.",
            '',
            'Renée [whispering]: Stay back.',
            '',
            'PRIYA: Wait here.'
        ].join('\n');

        const html = formatReaderProse(script);
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const narrator = doc.querySelector('.drama-speaker-narrator');
        expect(narrator?.textContent).toBe('Narrator:');

        const speakers = Array.from(doc.querySelectorAll('.drama-speaker-name'));
        expect(speakers.map((s) => s.textContent)).toEqual([
            'Narrator:',
            'Priya:',
            "O'Connor:",
            'Renée',
            'PRIYA:'
        ]);

        const priyaFirst = speakers[1].className;
        const oconnorCls = speakers[2].className;
        const reneeCls = speakers[3].className;
        const priyaSecond = speakers[4].className;

        expect(priyaFirst).toMatch(/drama-speaker-hue-\d+/);
        expect(priyaSecond).toBe(priyaFirst);
        expect(oconnorCls).not.toBe(priyaFirst);
        expect(reneeCls).not.toBe(priyaFirst);
        expect(reneeCls).not.toBe(oconnorCls);

        const cues = Array.from(doc.querySelectorAll('.drama-bracket-cue'));
        expect(cues.map((c) => c.textContent)).toEqual([
            '[quietly, hiding panic]',
            '[sigh]',
            '[whispering]'
        ]);

        // Preserves exact spoken text without altering spacing or characters
        expect(doc.body.textContent).toContain("O'Connor: [sigh] Check the lock.");
        expect(doc.body.textContent).toContain('Renée [whispering]: Stay back.');
    });

    it('shares cast-seeded speaker hues across scenes and ignores non-drama colons', () => {
        const palette = createAudioDramaSpeakerPalette(['Tomas', 'Priya']);
        const scene1 = formatReaderProse('Priya: [softly] Come inside.', {
            isAudioDrama: true,
            speakerPalette: palette
        });
        const scene2 = formatReaderProse('Tomas: Right behind you.\n\nPriya: Lock it.', {
            speakerPalette: palette
        });

        const doc1 = new DOMParser().parseFromString(scene1, 'text/html');
        const doc2 = new DOMParser().parseFromString(scene2, 'text/html');
        const priya1 = doc1.querySelector('.drama-speaker-name')?.className;
        const priya2 = doc2.querySelectorAll('.drama-speaker-name')[1]?.className;
        const tomas2 = doc2.querySelectorAll('.drama-speaker-name')[0]?.className;

        expect(priya1).toMatch(/drama-speaker-hue-\d+/);
        expect(priya2).toBe(priya1);
        expect(tomas2).not.toBe(priya1);

        const regularProse = formatReaderProse(
            [
                '12:30 was printed on the ticket stub.',
                '',
                'See https://example.com for the full harbor schedule.',
                '',
                'She remembered the warning her father gave her that night: never open the sluice.'
            ].join('\n')
        );
        const proseDoc = new DOMParser().parseFromString(regularProse, 'text/html');
        expect(proseDoc.querySelectorAll('.drama-speaker-name')).toHaveLength(0);
        expect(proseDoc.querySelectorAll('.drama-bracket-cue')).toHaveLength(0);
    });
});
