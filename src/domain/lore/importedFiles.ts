/**
 * @module domain/lore/importedFiles
 * World-building documents attached on the Setup screen before a story exists: how they are
 * combined into one text, and how an import batch is reported.
 */

export interface ImportedLoreFile {
    id: string;
    name: string;
    size: number;
    text: string;
}

/** One text for the planner: a single file as-is, several files each under a `## Source:` heading. */
export function combineImportedLoreText(files: ReadonlyArray<ImportedLoreFile>): string {
    return files
        .map((file) => (files.length === 1 ? file.text : `## Source: ${file.name}\n\n${file.text}`))
        .join('\n\n');
}

export function updateImportedLoreFile(
    files: ReadonlyArray<ImportedLoreFile>,
    fileId: string,
    newText: string
): ImportedLoreFile[] {
    return files.map((item) => (item.id === fileId ? { ...item, text: newText } : item));
}

export function removeImportedLoreFile(files: ReadonlyArray<ImportedLoreFile>, fileId: string): ImportedLoreFile[] {
    return files.filter((item) => item.id !== fileId);
}

const plural = (count: number): string => (count === 1 ? '' : 's');

/** Toast for a Setup import batch: success, or which files could not be read. */
export function describeLoreFileImport(
    loadedCount: number,
    failedNames: ReadonlyArray<string>
): { message: string; variant: 'success' | 'error' } {
    if (failedNames.length) {
        return {
            message: `Added ${loadedCount} file${plural(loadedCount)}. Could not load: ${failedNames.join(', ')}. Supported formats: .txt, .md, .docx, .pdf, .epub, .json, .csv.`,
            variant: 'error'
        };
    }
    return { message: `${loadedCount} document${plural(loadedCount)} imported successfully!`, variant: 'success' };
}

/** File name without its extension, used as the document title of imported lore chunks. */
export function loreDocumentTitle(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '');
}
