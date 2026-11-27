/**
 * @module hooks/useLoreImport
 * Importing world-building documents (Phase 6E-3, persistence half).
 *
 * - Setup screen: files are read to text and held as a draft (kept in localStorage) until a
 *   story is created from them.
 * - Lore tab of an existing story: files are chunked, indexed into vector memory and added to
 *   the story's lore.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { STORAGE_KEYS } from '@/config';
import {
    chunkLoreText,
    combineImportedLoreText,
    describeLoreFileImport,
    loreDocumentTitle,
    removeImportedLoreFile,
    updateImportedLoreFile,
    type ImportedLoreFile
} from '@/domain/lore';
import { lorebookToLoreItems } from '@/domain/imports';
import { extractTextFromFile, openLorebookFile } from '@/services/documents';
import { storyStore } from '@/services/storage';
import { safeLocalStorageSet } from '@/utils';

export const DRAFT_LORE_FILES_STORAGE_KEY = STORAGE_KEYS.draftLoreFiles;
/** Larger drafts are kept in memory only; localStorage quotas are small. */
const MAX_PERSISTED_DRAFT_CHARS = 1500000;

type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'warn';
type LoreStory = { id?: string; lore?: unknown[] };
type FileLike = File & { name?: string; size?: number };
type FileInputEvent = { target: { files?: ArrayLike<FileLike> | null; value: string | null } };
type FilesInput = FileInputEvent | ArrayLike<FileLike> | FileLike | null | undefined;

export interface UseLoreImportParams<TStory extends LoreStory = LoreStory> {
    /** Lore of the open story, read when a post-generation import starts. */
    story: TStory;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    /** The distilled world primer is stale once the source documents change. */
    setWorldPrimer: (primer: string | null) => void;
    showToast: (message: string, variant?: ToastVariant) => void;
    setLoading: (loading: boolean) => void;
    setLoadingStep: (step: string) => void;
    /** Indexes lore into vector memory; returns the processed list (may be empty). */
    ingestLoreBatch: (lore: unknown[], options: Record<string, unknown>) => Promise<unknown[] | null | undefined>;
}

export interface UseLoreImportResult {
    importedLoreFiles: ImportedLoreFile[];
    setImportedLoreFiles: Dispatch<SetStateAction<ImportedLoreFile[]>>;
    importingLore: boolean;
    setImportingLore: Dispatch<SetStateAction<boolean>>;
    /** All Setup documents as one text. */
    importedLoreText: string;
    /** Bumped whenever the Setup documents are replaced or discarded; stale reads are ignored. */
    loreImportVersionRef: MutableRefObject<number>;
    /** Drops the Setup documents and cancels reads still in flight. */
    discardImportedLore: () => void;
    handleUpdateLoreFile: (fileId: string, newText: string) => void;
    handleRemoveLoreFile: (fileId: string) => void;
    /** Setup screen: read files (input change event or a file list) into the draft. */
    handleLoreImport: (eventOrFiles: FilesInput) => Promise<void>;
    /** Existing story: chunk, index and append files to the story's lore. */
    handlePostGenLoreImport: (fileOrFiles: FilesInput) => Promise<void>;
    handleLorebookImport: (file: File) => Promise<void>;
}

const isInputEvent = (value: FilesInput): value is FileInputEvent =>
    Boolean(value && typeof value === 'object' && 'target' in value && value.target);
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function readStoredDraft(): ImportedLoreFile[] {
    try {
        const raw = localStorage.getItem(DRAFT_LORE_FILES_STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ImportedLoreFile[]) : [];
    } catch {
        return [];
    }
}

export function useLoreImport<TStory extends LoreStory = LoreStory>({
    story,
    setStory,
    setWorldPrimer,
    showToast,
    setLoading,
    setLoadingStep,
    ingestLoreBatch
}: UseLoreImportParams<TStory>): UseLoreImportResult {
    const [importedLoreFiles, setImportedLoreFiles] = useState<ImportedLoreFile[]>(readStoredDraft);
    const [importingLore, setImportingLore] = useState(false);
    const loreImportVersionRef = useRef(0);

    useEffect(() => {
        try {
            if (!importedLoreFiles || importedLoreFiles.length === 0) {
                localStorage.removeItem(DRAFT_LORE_FILES_STORAGE_KEY);
            } else {
                const serialized = JSON.stringify(importedLoreFiles);
                if (serialized.length <= MAX_PERSISTED_DRAFT_CHARS) {
                    safeLocalStorageSet(DRAFT_LORE_FILES_STORAGE_KEY, serialized);
                }
            }
        } catch {
            // Draft persistence is best effort.
        }
    }, [importedLoreFiles]);

    const importedLoreText = useMemo(() => combineImportedLoreText(importedLoreFiles), [importedLoreFiles]);

    const handleUpdateLoreFile = useCallback(
        (fileId: string, newText: string) => {
            setImportedLoreFiles((previous) => updateImportedLoreFile(previous, fileId, newText));
            setWorldPrimer(null);
        },
        // setWorldPrimer is a stable state setter.
        []
    );

    const handleRemoveLoreFile = useCallback(
        (fileId: string) => {
            setImportedLoreFiles((previous) => removeImportedLoreFile(previous, fileId));
            setWorldPrimer(null);
        },
        // setWorldPrimer is a stable state setter.
        []
    );

    const discardImportedLore = (): void => {
        loreImportVersionRef.current++;
        setImportedLoreFiles([]);
        setImportingLore(false);
    };

    const reportProgress = (p?: { message?: string } | null): void => {
        if (p?.message) setLoadingStep(p.message);
    };

    const handleLoreImport = async (eventOrFiles: FilesInput): Promise<void> => {
        const files: FileLike[] = isInputEvent(eventOrFiles)
            ? Array.from(eventOrFiles.target.files || [])
            : Array.from((eventOrFiles as ArrayLike<FileLike> | null | undefined) || []);
        if (isInputEvent(eventOrFiles)) eventOrFiles.target.value = ''; // Allow adding the same file again after removal.
        if (!files.length) return;
        const importVersion = ++loreImportVersionRef.current;
        setImportingLore(true);
        try {
            const results = await Promise.allSettled(
                files.map(async (file, index): Promise<ImportedLoreFile> => {
                    const text = await extractTextFromFile(file, reportProgress);
                    if (!text || !text.trim()) throw new Error('Document contains no extractable text');
                    return {
                        id: `${importVersion}-${index}`,
                        name: file.name || `Document ${index + 1}`,
                        size: file.size || text.length,
                        text: text.trim()
                    };
                })
            );
            // The documents were cleared or replaced while these were being read.
            if (importVersion !== loreImportVersionRef.current) return;
            const loaded = results
                .filter((r): r is PromiseFulfilledResult<ImportedLoreFile> => r.status === 'fulfilled')
                .map((r) => r.value);
            const failedNames = files
                .filter((_file, index) => results[index].status === 'rejected')
                .map((file) => file.name || 'file');
            if (loaded.length) {
                setImportedLoreFiles((previous) => [...previous, ...loaded]);
                setWorldPrimer(null);
            }
            const report = describeLoreFileImport(loaded.length, failedNames);
            showToast(report.message, report.variant);
        } catch (err) {
            showToast(`Document import error: ${errorMessage(err)}`, 'error');
        } finally {
            if (importVersion === loreImportVersionRef.current) setImportingLore(false);
        }
    };

    const handlePostGenLoreImport = async (fileOrFiles: FilesInput): Promise<void> => {
        const files: FileLike[] = isInputEvent(fileOrFiles)
            ? Array.from(fileOrFiles.target.files || [])
            : (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles as FileLike]).filter(Boolean);
        if (isInputEvent(fileOrFiles)) fileOrFiles.target.value = null;
        if (!files.length) return;

        setLoading(true);
        try {
            let totalChunksAdded = 0;
            const newChunks: unknown[] = [];

            for (const file of files) {
                const filename = file.name || 'Document';
                setLoadingStep(`Extracting text from '${filename}'...`);
                showToast(`Reading and parsing '${filename}'...`, 'info');
                const text = await extractTextFromFile(file, reportProgress);

                if (!text || !text.trim()) {
                    showToast(`Document '${filename}' contains no readable text.`, 'warn');
                    continue;
                }

                setLoadingStep(`Chunking and indexing '${filename}' for vector memory...`);
                const chunks = chunkLoreText(text, null, null, `Imported from ${filename}`, loreDocumentTitle(filename));
                newChunks.push(...chunks);
                totalChunksAdded += chunks.length;
            }

            if (newChunks.length === 0) {
                showToast('No readable text found in selected document(s).', 'warn');
                return;
            }

            setLoadingStep(`Indexing ${totalChunksAdded} segments into RAG vector store...`);
            const combinedList = [...(story.lore || []), ...newChunks];
            const processedList = await ingestLoreBatch(combinedList, {
                clearExisting: true,
                fingerprintProcessed: true
            });

            const finalLore = processedList && processedList.length > 0 ? processedList : combinedList;
            setStory((prev) => {
                const updated = { ...prev, lore: finalLore };
                if (updated.id) {
                    storyStore
                        .saveStory(updated.id, updated as Record<string, unknown>)
                        .catch((err) => console.warn('Failed saving post-gen lore import to storyStore:', err));
                }
                return updated;
            });

            showToast(
                `Successfully ingested ${files.length} document${files.length === 1 ? '' : 's'} (${totalChunksAdded} RAG segments) into World Lore!`,
                'success'
            );
        } catch (err) {
            console.error('Failed to import lore document:', err);
            showToast(`Document ingestion failed: ${errorMessage(err)}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    /** A lorebook from another app (or the one inside a character card): each entry becomes a lore item. */
    const handleLorebookImport = async (file: File): Promise<void> => {
        if (!file) return;
        setLoading(true);
        try {
            setLoadingStep(`Reading lorebook '${file.name}'...`);
            const book = await openLorebookFile(file);
            const items = lorebookToLoreItems(book);
            if (items.length === 0) {
                showToast(`"${book.name}" has no entries that are switched on and have text.`, 'warn');
                return;
            }
            setLoadingStep(`Indexing ${items.length} lorebook entries into RAG vector store...`);
            const combinedList = [...(story.lore || []), ...items];
            const processedList = await ingestLoreBatch(combinedList, {
                clearExisting: true,
                fingerprintProcessed: true
            });
            const finalLore = processedList && processedList.length > 0 ? processedList : combinedList;
            setStory((prev) => {
                const updated = { ...prev, lore: finalLore };
                if (updated.id) {
                    storyStore
                        .saveStory(updated.id, updated as Record<string, unknown>)
                        .catch((err) => console.warn('Failed saving lorebook import to storyStore:', err));
                }
                return updated;
            });
            const left = book.skipped > 0 ? ` ${book.skipped} switched-off or empty ${book.skipped === 1 ? 'entry was' : 'entries were'} left out.` : '';
            showToast(
                `Imported ${items.length} ${items.length === 1 ? 'entry' : 'entries'} from "${book.name}" (${book.format}).${left}`,
                'success'
            );
        } catch (err) {
            showToast(`Lorebook import failed: ${errorMessage(err)}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    return {
        importedLoreFiles,
        setImportedLoreFiles,
        importingLore,
        setImportingLore,
        importedLoreText,
        loreImportVersionRef,
        discardImportedLore,
        handleUpdateLoreFile,
        handleRemoveLoreFile,
        handleLoreImport,
        handlePostGenLoreImport,
        handleLorebookImport
    };
}
