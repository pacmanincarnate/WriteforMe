import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ extractTextFromFile: vi.fn(), saveStory: vi.fn() }));

vi.mock('@/services/documents', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/documents')>()),
    extractTextFromFile: mocks.extractTextFromFile
}));
vi.mock('@/services/storage', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/services/storage')>();
    return { ...original, storyStore: { saveStory: mocks.saveStory } };
});

import {
    combineImportedLoreText,
    describeLoreFileImport,
    loreDocumentTitle,
    removeImportedLoreFile,
    updateImportedLoreFile
} from '@/domain/lore';
import { useLoreImport, type UseLoreImportResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DRAFT_KEY = 'ellipsisprose_draft_lore_files';
const file = (name: string, size = 10) => ({ name, size }) as unknown as File;
const draft = (id: string, name: string, text: string) => ({ id, name, size: text.length, text });

describe('imported lore files (pure)', () => {
    it('combines one file as-is and several under source headings', () => {
        expect(combineImportedLoreText([])).toBe('');
        expect(combineImportedLoreText([draft('1', 'a.txt', 'Alpha')])).toBe('Alpha');
        expect(combineImportedLoreText([draft('1', 'a.txt', 'Alpha'), draft('2', 'b.md', 'Beta')])).toBe(
            '## Source: a.txt\n\nAlpha\n\n## Source: b.md\n\nBeta'
        );
    });

    it('updates and removes by id without mutating', () => {
        const files = [draft('1', 'a', 'x'), draft('2', 'b', 'y')];
        expect(updateImportedLoreFile(files, '2', 'z').map((f) => f.text)).toEqual(['x', 'z']);
        expect(removeImportedLoreFile(files, '1').map((f) => f.id)).toEqual(['2']);
        expect(files.map((f) => f.text)).toEqual(['x', 'y']);
    });

    it('describes an import batch', () => {
        expect(describeLoreFileImport(1, [])).toEqual({ message: '1 document imported successfully!', variant: 'success' });
        expect(describeLoreFileImport(3, []).message).toBe('3 documents imported successfully!');
        const partial = describeLoreFileImport(1, ['bad.xyz', 'empty.txt']);
        expect(partial.variant).toBe('error');
        expect(partial.message).toMatch(/^Added 1 file\. Could not load: bad\.xyz, empty\.txt\. Supported formats:/);
        expect(describeLoreFileImport(0, ['x']).message).toMatch(/^Added 0 files\./);
    });

    it('strips the extension for a document title', () => {
        expect(loreDocumentTitle('World Bible v2.docx')).toBe('World Bible v2');
        expect(loreDocumentTitle('notes')).toBe('notes');
    });
});

type TestStory = { id?: string; lore?: unknown[] };

describe('useLoreImport', () => {
    const roots: Root[] = [];
    beforeEach(() => {
        localStorage.clear();
        mocks.extractTextFromFile.mockReset();
        mocks.saveStory.mockReset().mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        vi.restoreAllMocks();
    });

    function mount(options: { story?: TestStory; ingestResult?: unknown[] | null; ingestFails?: boolean } = {}) {
        const toasts: Array<[string, string | undefined]> = [];
        const steps: string[] = [];
        const loading: boolean[] = [];
        const ingests: Array<[unknown[], Record<string, unknown>]> = [];
        const box = { story: options.story ?? ({ id: 's1', lore: [{ topic: 'existing' }] } as TestStory), primerResets: 0 };
        let latest: UseLoreImportResult | null = null;
        function Probe(): null {
            latest = useLoreImport<TestStory>({
                story: box.story,
                setStory: (updater) => {
                    box.story = updater(box.story);
                },
                setWorldPrimer: () => {
                    box.primerResets++;
                },
                showToast: (m, v) => toasts.push([m, v]),
                setLoading: (v) => loading.push(v),
                setLoadingStep: (s) => steps.push(s),
                ingestLoreBatch: async (lore, opts) => {
                    ingests.push([lore, opts]);
                    if (options.ingestFails) throw new Error('embeddings offline');
                    return options.ingestResult;
                }
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return { api: () => latest as UseLoreImportResult, toasts, steps, loading, ingests, box };
    }

    it('restores a saved draft and ignores a corrupt one', () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify([draft('1', 'a.txt', 'Alpha')]));
        expect(mount().api().importedLoreText).toBe('Alpha');
        localStorage.setItem(DRAFT_KEY, '{broken');
        expect(mount().api().importedLoreFiles).toEqual([]);
        localStorage.setItem(DRAFT_KEY, '{"not":"a list"}');
        expect(mount().api().importedLoreFiles).toEqual([]);
    });

    it('reads Setup files into the draft, persists it and clears the input', async () => {
        const h = mount();
        mocks.extractTextFromFile.mockImplementation(async (f: File, onProgress: (p: { message: string }) => void) => {
            onProgress({ message: `parsing ${f.name}` });
            return `  text of ${f.name}  `;
        });
        const event = { target: { files: [file('a.txt', 12), file('b.md', 0)], value: 'C:\\fakepath\\a.txt' } };
        await act(() => h.api().handleLoreImport(event));
        expect(event.target.value).toBe('');
        expect(h.api().importedLoreFiles).toEqual([
            { id: '1-0', name: 'a.txt', size: 12, text: 'text of a.txt' },
            { id: '1-1', name: 'b.md', size: 'text of b.md'.length + 4, text: 'text of b.md' }
        ]);
        expect(h.api().importingLore).toBe(false);
        expect(h.steps).toEqual(['parsing a.txt', 'parsing b.md']);
        expect(h.box.primerResets).toBe(1);
        expect(h.toasts).toEqual([['2 documents imported successfully!', 'success']]);
        expect(JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]')).toHaveLength(2);
    });

    it('keeps the files that loaded and names the ones that did not', async () => {
        const h = mount();
        mocks.extractTextFromFile.mockResolvedValueOnce('good').mockResolvedValueOnce('   ').mockRejectedValueOnce(new Error('unsupported'));
        await act(() => h.api().handleLoreImport([file('ok.txt'), file('blank.txt'), file('bad.xyz')]));
        expect(h.api().importedLoreFiles.map((f) => f.name)).toEqual(['ok.txt']);
        expect(h.toasts[0][1]).toBe('error');
        expect(h.toasts[0][0]).toContain('Could not load: blank.txt, bad.xyz');
    });

    it('does nothing for an empty selection', async () => {
        const h = mount();
        await act(() => h.api().handleLoreImport([]));
        await act(() => h.api().handleLoreImport(null));
        expect(mocks.extractTextFromFile).not.toHaveBeenCalled();
        expect(h.toasts).toEqual([]);
    });

    it('ignores reads that finish after the documents were discarded', async () => {
        const h = mount();
        let finish: (text: string) => void = () => {};
        mocks.extractTextFromFile.mockReturnValueOnce(new Promise<string>((resolve) => (finish = resolve)));
        let pending: Promise<void> = Promise.resolve();
        act(() => {
            pending = h.api().handleLoreImport([file('slow.pdf')]);
        });
        expect(h.api().importingLore).toBe(true);
        act(() => h.api().discardImportedLore());
        expect(h.api().importingLore).toBe(false);
        await act(async () => {
            finish('late text');
            await pending;
        });
        expect(h.api().importedLoreFiles).toEqual([]);
        expect(h.toasts).toEqual([]);
    });

    it('edits and removes draft files, resetting the world primer and the saved draft', async () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify([draft('1', 'a.txt', 'Alpha'), draft('2', 'b.txt', 'Beta')]));
        const h = mount();
        act(() => h.api().handleUpdateLoreFile('1', 'Alpha 2'));
        expect(h.api().importedLoreText).toContain('Alpha 2');
        act(() => h.api().handleRemoveLoreFile('2'));
        expect(h.api().importedLoreText).toBe('Alpha 2');
        expect(h.box.primerResets).toBe(2);
        act(() => h.api().handleRemoveLoreFile('1'));
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('adds documents to an existing story: chunks, indexes, appends and saves', async () => {
        const h = mount({ ingestResult: [] });
        mocks.extractTextFromFile.mockResolvedValue('The harbour town of Vey keeps a ledger of tides. '.repeat(20));
        const event = { target: { files: [file('World Bible.docx')], value: 'x' as string | null } };
        await act(() => h.api().handlePostGenLoreImport(event));
        expect(event.target.value).toBeNull();
        const [combined, opts] = h.ingests[0];
        expect(opts).toEqual({ clearExisting: true, fingerprintProcessed: true });
        expect(combined[0]).toEqual({ topic: 'existing' });
        expect(combined.length).toBeGreaterThan(1);
        expect(combined[1]).toMatchObject({ description: 'Imported from World Bible.docx', docTitle: 'World Bible' });
        expect(h.box.story.lore).toBe(combined);
        expect(mocks.saveStory).toHaveBeenCalledWith('s1', h.box.story);
        expect(h.loading).toEqual([true, false]);
        expect(h.toasts[0]).toEqual(["Reading and parsing 'World Bible.docx'...", 'info']);
        expect(h.toasts[1][0]).toMatch(/^Successfully ingested 1 document \(\d+ RAG segments\) into World Lore!$/);
    });

    it('uses the processed list when indexing returns one', async () => {
        const processed = [{ topic: 'deduplicated' }];
        const h = mount({ ingestResult: processed });
        mocks.extractTextFromFile.mockResolvedValue('Some lore text that is long enough to keep.');
        await act(() => h.api().handlePostGenLoreImport(file('a.txt')));
        expect(h.box.story.lore).toBe(processed);
    });

    it('skips unreadable documents and stops when nothing was readable', async () => {
        const h = mount();
        mocks.extractTextFromFile.mockResolvedValue('   ');
        await act(() => h.api().handlePostGenLoreImport([file('blank.txt')]));
        expect(h.ingests).toEqual([]);
        expect(h.toasts.map((t) => t[0])).toEqual([
            "Reading and parsing 'blank.txt'...",
            "Document 'blank.txt' contains no readable text.",
            'No readable text found in selected document(s).'
        ]);
        expect(h.loading).toEqual([true, false]);
    });

    it('reports an indexing failure and leaves the story unchanged', async () => {
        const h = mount({ ingestFails: true });
        mocks.extractTextFromFile.mockResolvedValue('Some lore text that is long enough to keep.');
        await act(() => h.api().handlePostGenLoreImport(file('a.txt')));
        expect(h.box.story.lore).toEqual([{ topic: 'existing' }]);
        expect(h.toasts.at(-1)).toEqual(['Document ingestion failed: embeddings offline', 'error']);
        expect(h.loading).toEqual([true, false]);
    });
});
