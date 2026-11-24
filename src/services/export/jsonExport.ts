/**
 * @module services/export/jsonExport
 * Downloads a canonical JSON snapshot of the active story.
 */

/** Serializes a story document and triggers a `.json` browser download. */
export function exportStoryJson(story: unknown): void {
    const jsonString = JSON.stringify(story);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ellipsisprose_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
