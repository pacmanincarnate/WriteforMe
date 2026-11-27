/**
 * @module services/export/markdownExport
 * The manuscript as plain files: a Markdown document, a print view (the browser's print dialog
 * saves it as a PDF), and the relationship web as a Mermaid diagram.
 */

import { actForSequence, parseActNumber, relationshipMermaid, type RelationshipGraphStory } from '@/domain/story';
import { escapeXml, parseMarkdown } from '@/utils';

export interface ManuscriptStory extends RelationshipGraphStory {
    title?: unknown;
    author?: unknown;
    acts?: Array<{ number?: unknown; title?: unknown } | null> | null;
    sequences?: Array<{ number?: unknown; title?: unknown; parent_act?: unknown } | null> | null;
    scenes?: Record<string, Array<{ title?: unknown } | null> | undefined> | null;
    prose?: Record<string, unknown> | null;
}

export interface ManuscriptChapter {
    act: number;
    actTitle: string;
    title: string;
    scenes: string[];
}

export interface ManuscriptBuildResult {
    content: string;
    filename: string;
    sceneCount: number;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function proseText(entry: unknown): string {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        return str(rec.final) || str(rec.draft);
    }
    return '';
}

export function manuscriptFileStem(story: ManuscriptStory): string {
    return (
        (str(story.title) || 'untitled')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'story'
    );
}

/** The written scenes in reading order, grouped by sequence. A sequence with nothing written is left out. */
export function manuscriptChapters(story: ManuscriptStory): ManuscriptChapter[] {
    const chapters: ManuscriptChapter[] = [];
    const acts = Array.isArray(story.acts) ? story.acts : [];
    const sequences = Array.isArray(story.sequences) ? story.sequences : [];
    const prose = story.prose && typeof story.prose === 'object' ? story.prose : {};
    const used = new Set<string>();
    sequences.forEach((sequence, seqIdx) => {
        const scenes: string[] = [];
        const planned = story.scenes?.[`${seqIdx}`] || [];
        // Go by the plan, then by any prose the plan no longer lists, so nothing written is lost.
        const count = Math.max(
            planned.length,
            ...Object.keys(prose)
                .map((key) => /^(\d+)-(\d+)$/.exec(key))
                .filter((match): match is RegExpExecArray => Boolean(match) && Number(match?.[1]) === seqIdx)
                .map((match) => Number(match[2]) + 1)
        );
        for (let sceneIdx = 0; sceneIdx < count; sceneIdx++) {
            const key = `${seqIdx}-${sceneIdx}`;
            const text = proseText(prose[key]);
            if (text) {
                scenes.push(text);
                used.add(key);
            }
        }
        if (scenes.length === 0) return;
        const number = Number(sequence?.number) || seqIdx + 1;
        const act = parseActNumber(sequence?.parent_act, actForSequence(number));
        const actRecord = acts.find((entry, index) => parseActNumber(entry?.number, index + 1) === act);
        chapters.push({ act, actTitle: str(actRecord?.title), title: str(sequence?.title) || `Sequence ${number}`, scenes });
    });
    const loose = Object.keys(prose)
        .filter((key) => !used.has(key))
        .map((key) => proseText(prose[key]))
        .filter(Boolean);
    if (chapters.length === 0 && loose.length > 0) chapters.push({ act: 1, actTitle: '', title: '', scenes: loose });
    return chapters;
}

/** The manuscript as one Markdown document: title, acts, sequences, and scenes parted by a rule. */
export function buildStoryMarkdown(story: ManuscriptStory): ManuscriptBuildResult {
    const chapters = manuscriptChapters(story);
    const lines: string[] = [`# ${str(story.title) || 'Untitled'}`];
    if (str(story.author)) lines.push('', `*${str(story.author)}*`);
    const manyActs = new Set(chapters.map((chapter) => chapter.act)).size > 1;
    let act = -1;
    for (const chapter of chapters) {
        if (manyActs && chapter.act !== act) {
            act = chapter.act;
            lines.push('', `## Act ${act}${chapter.actTitle ? `: ${chapter.actTitle}` : ''}`);
        }
        if (chapter.title) lines.push('', `${manyActs ? '###' : '##'} ${chapter.title}`);
        lines.push('', chapter.scenes.join('\n\n* * *\n\n'));
    }
    return {
        content: lines.join('\n') + '\n',
        filename: `${manuscriptFileStem(story)}.md`,
        sceneCount: chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
    };
}

/** The manuscript as a page laid out for print. */
export function buildStoryPrintHtml(story: ManuscriptStory): ManuscriptBuildResult {
    const chapters = manuscriptChapters(story);
    const title = str(story.title) || 'Untitled';
    const manyActs = new Set(chapters.map((chapter) => chapter.act)).size > 1;
    let act = -1;
    const body = chapters
        .map((chapter) => {
            let head = '';
            if (manyActs && chapter.act !== act) {
                act = chapter.act;
                head += `<h2 class="act">Act ${act}${chapter.actTitle ? `: ${escapeXml(chapter.actTitle)}` : ''}</h2>`;
            }
            if (chapter.title) head += `<h3>${escapeXml(chapter.title)}</h3>`;
            const scenes = chapter.scenes.map((scene) => `<div class="scene">${parseMarkdown(scene)}</div>`).join('<p class="break">* * *</p>');
            return `<section>${head}${scenes}</section>`;
        })
        .join('\n');
    const content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>
@page { margin: 22mm 20mm; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; background: #fff; }
h1 { text-align: center; margin: 30vh 0 0.3em; font-size: 26pt; }
.author { text-align: center; font-style: italic; }
section { page-break-before: always; }
h2.act { text-align: center; font-size: 18pt; margin: 0 0 1.5em; }
h3 { font-size: 15pt; margin: 0 0 1.2em; }
p { margin: 0; text-indent: 1.5em; orphans: 2; widows: 2; }
.scene > p:first-child { text-indent: 0; }
.break { text-align: center; text-indent: 0; margin: 1.2em 0; }
</style></head>
<body><h1>${escapeXml(title)}</h1>${str(story.author) ? `<p class="author">${escapeXml(str(story.author))}</p>` : ''}
${body}
</body></html>`;
    return {
        content,
        filename: `${manuscriptFileStem(story)}.html`,
        sceneCount: chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
    };
}

function downloadText(filename: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/** Downloads the manuscript as Markdown, when at least one scene is written. */
export function exportStoryMarkdown(story: ManuscriptStory): ManuscriptBuildResult {
    const result = buildStoryMarkdown(story);
    if (result.sceneCount > 0) downloadText(result.filename, result.content, 'text/markdown;charset=utf-8');
    return result;
}

/**
 * Opens the browser's print dialog on the manuscript, when at least one scene is written. Choosing
 * "Save as PDF" there makes the PDF. The page is printed from a hidden frame, removed afterwards.
 */
export function printStory(story: ManuscriptStory): ManuscriptBuildResult {
    const result = buildStoryPrintHtml(story);
    if (result.sceneCount === 0) return result;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    frame.onload = () => {
        const view = frame.contentWindow;
        if (!view) return;
        const remove = (): void => frame.remove();
        view.addEventListener('afterprint', remove);
        // A browser that never reports the end of printing still gets the frame taken away.
        window.setTimeout(remove, 10 * 60 * 1000);
        view.focus();
        view.print();
    };
    frame.srcdoc = result.content;
    document.body.appendChild(frame);
    return result;
}

/** Downloads the relationship web as a Mermaid file. Returns '' when there is nothing to draw. */
export function exportRelationshipMermaid(story: ManuscriptStory): string {
    const content = relationshipMermaid(story);
    if (content) downloadText(`${manuscriptFileStem(story)}_relationships.mmd`, content, 'text/plain;charset=utf-8');
    return content;
}
