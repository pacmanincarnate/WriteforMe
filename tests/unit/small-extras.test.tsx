import { afterEach, describe, expect, it, vi } from 'vitest';
import { mermaidLabel, relationshipEdges, relationshipMermaid } from '@/domain/story';
import {
    buildStoryMarkdown,
    buildStoryPrintHtml,
    exportRelationshipMermaid,
    exportStoryMarkdown,
    manuscriptChapters,
    printStory
} from '@/services/export';
import { loadOpenDyslexic } from '@/views/reader/openDyslexic';

const story = () => ({
    title: 'The Tide & the Lamp',
    author: 'A. Writer',
    acts: [
        { number: 1, title: 'Low Water' },
        { number: 2, title: 'Flood' }
    ],
    sequences: [
        { number: 1, title: 'The Causeway', parent_act: 1 },
        { number: 2, title: 'Nothing Yet', parent_act: 1 },
        { number: 3, title: 'The Lamp <Lit>', parent_act: 2 }
    ],
    scenes: { '0': [{ title: 'Toll' }, { title: 'Crossing' }], '1': [{ title: 'Unwritten' }], '2': [{ title: 'Keeper' }] },
    prose: {
        '0-0': { draft: 'Mara paid the toll.', final: 'Mara paid the toll twice.' },
        '0-1': 'The water came in.\n\nShe ran.',
        '1-0': { draft: '   ' },
        '2-0': { draft: 'The lamp was *dark*.' },
        '2-3': 'A scene the plan no longer lists.'
    },
    cast: [{ name: 'Dov Hale' }, { name: 'Mara Vance' }, { name: 'Pell' }],
    relationships: {
        'Mara Vance->Dov Hale': { dynamic: 'Old "friend"\nwho lies', hidden_tension: 'x' },
        'Dov Hale->Mara Vance': { dynamic: 'old "friend"\nwho lies' },
        'Mara Vance->Pell': { current: 'Wary' },
        'Pell->Mara Vance': { current: 'Devoted' },
        'Pell->Pell': { current: 'Self' },
        broken: { current: 'No ends' },
        'Ines|Pell': 'Sister'
    }
});

describe('the manuscript as Markdown', () => {
    it('keeps the written scenes in reading order under their acts and sequences', () => {
        expect(manuscriptChapters(story()).map((c) => [c.act, c.title, c.scenes.length])).toEqual([
            [1, 'The Causeway', 2],
            [2, 'The Lamp <Lit>', 2]
        ]);
        const result = buildStoryMarkdown(story());
        expect(result.filename).toBe('the_tide_the_lamp.md');
        expect(result.sceneCount).toBe(4);
        expect(result.content).toBe(
            [
                '# The Tide & the Lamp',
                '',
                '*A. Writer*',
                '',
                '## Act 1: Low Water',
                '',
                '### The Causeway',
                '',
                'Mara paid the toll twice.',
                '',
                '* * *',
                '',
                'The water came in.',
                '',
                'She ran.',
                '',
                '## Act 2: Flood',
                '',
                '### The Lamp <Lit>',
                '',
                'The lamp was *dark*.',
                '',
                '* * *',
                '',
                'A scene the plan no longer lists.',
                ''
            ].join('\n')
        );
    });

    it('drops act headings for a single act and copes with a bare story', () => {
        const one = story();
        one.sequences[2].parent_act = 1;
        const text = buildStoryMarkdown(one).content;
        expect(text).not.toContain('Act 1');
        expect(text).toContain('## The Causeway');
        expect(buildStoryMarkdown({})).toEqual({ content: '# Untitled\n', filename: 'untitled.md', sceneCount: 0 });
        expect(buildStoryMarkdown({ prose: { intro: 'Loose text.' } }).content).toBe('# Untitled\n\nLoose text.\n');
    });

    it('downloads only when something is written', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        expect(exportStoryMarkdown({ title: 'Empty' }).sceneCount).toBe(0);
        expect(click).not.toHaveBeenCalled();
        expect(exportStoryMarkdown(story()).sceneCount).toBe(4);
        expect(click).toHaveBeenCalledTimes(1);
    });
});

describe('the manuscript for print', () => {
    afterEach(() => {
        document.querySelectorAll('iframe').forEach((frame) => frame.remove());
        vi.restoreAllMocks();
    });

    it('builds a page with escaped headings and each sequence on its own page', () => {
        const page = buildStoryPrintHtml(story()).content;
        expect(page).toContain('<title>The Tide &amp; the Lamp</title>');
        expect(page).toContain('<h2 class="act">Act 2: Flood</h2><h3>The Lamp &lt;Lit&gt;</h3>');
        expect(page).toContain('page-break-before: always');
        expect(page).toContain('<em>dark</em>');
        expect(page.match(/<section>/g)).toHaveLength(2);
    });

    it('prints from a hidden frame and removes it afterwards', () => {
        expect(printStory({ title: 'Empty' }).sceneCount).toBe(0);
        expect(document.querySelector('iframe')).toBeNull();
        expect(printStory(story()).sceneCount).toBe(4);
        const frame = document.querySelector('iframe') as HTMLIFrameElement;
        expect(frame.srcdoc).toContain('Mara paid the toll twice.');
        const view = frame.contentWindow as Window;
        const print = vi.fn();
        Object.defineProperty(view, 'print', { value: print, configurable: true });
        Object.defineProperty(view, 'focus', { value: vi.fn(), configurable: true });
        frame.onload?.(new Event('load'));
        expect(print).toHaveBeenCalledTimes(1);
        view.dispatchEvent(new Event('afterprint'));
        expect(document.querySelector('iframe')).toBeNull();
    });
});

describe('the relationship web as Mermaid', () => {
    it('reads the ends, merges a bond written both ways, and keeps two different views apart', () => {
        expect(relationshipEdges(story())).toEqual([
            { from: 'Mara Vance', to: 'Dov Hale', label: 'Old "friend"\nwho lies', mutual: true },
            { from: 'Mara Vance', to: 'Pell', label: 'Wary', mutual: false },
            { from: 'Pell', to: 'Mara Vance', label: 'Devoted', mutual: false },
            { from: 'Ines', to: 'Pell', label: 'Sister', mutual: false }
        ]);
        expect(relationshipEdges({ relationships: { x: { char_a: 'A', char_b: 'B', type: 'Rivals' } } })).toEqual([
            { from: 'A', to: 'B', label: 'Rivals', mutual: false }
        ]);
        expect(relationshipEdges(null)).toEqual([]);
    });

    it('writes a flowchart with safe labels, cast first', () => {
        expect(mermaidLabel('a "b" <c>|d\ne')).toBe("a 'b' c d e");
        expect(mermaidLabel('x'.repeat(100))).toHaveLength(60);
        expect(relationshipMermaid(story())).toBe(
            [
                'flowchart LR',
                '    c1["Dov Hale"]',
                '    c2["Mara Vance"]',
                '    c3["Pell"]',
                '    c4["Ines"]',
                `    c2 <-->|"Old 'friend' who lies"| c1`,
                '    c2 -->|"Wary"| c3',
                '    c3 -->|"Devoted"| c2',
                '    c4 -->|"Sister"| c3',
                ''
            ].join('\n')
        );
        expect(relationshipMermaid({ relationships: { 'A->B': {} } })).toBe('flowchart LR\n    c1["A"]\n    c2["B"]\n    c1 --> c2\n');
        expect(relationshipMermaid({ cast: [{ name: 'A' }] })).toBe('');
    });

    it('downloads the diagram, or nothing when there is none', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        expect(exportRelationshipMermaid({ title: 'Empty' })).toBe('');
        expect(click).not.toHaveBeenCalled();
        expect(exportRelationshipMermaid(story())).toContain('flowchart LR');
        expect(click).toHaveBeenCalledTimes(1);
        vi.restoreAllMocks();
    });
});

describe('OpenDyslexic', () => {
    it('does nothing where fonts cannot be loaded', async () => {
        expect(typeof FontFace).toBe('undefined');
        expect(await loadOpenDyslexic()).toBe(false);
    });
});
