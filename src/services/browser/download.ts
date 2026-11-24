/**
 * @module services/browser/download
 * Browser file download triggers and clipboard copy helpers for exported audio, manuscripts, and logs.
 */

/** Triggers a browser file download for a generated `Blob` and schedules object URL revocation. */
export function downloadBlob(blob: Blob, fileName: string): void {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
    }, 2000);
}

/** Downloads verbose text or JSON log contents as a file in the browser. */
export function downloadVerboseLogFile(
    filename: string,
    content: string,
    mimeType = 'text/plain;charset=utf-8'
): void {
    try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Failed to download verbose log:', err);
        throw err;
    }
}

/** Copies text to the system clipboard using Clipboard API with textarea fallback. */
export async function copyVerboseLogToClipboard(
    text: string,
    showToast?: ((msg: string, variant?: 'success' | 'error' | 'info' | 'warning') => void) | null,
    successMsg = 'Copied verbose log to clipboard!'
): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        if (showToast) showToast(successMsg, 'success');
        return true;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        if (showToast) {
            const msg = err instanceof Error ? err.message : String(err);
            showToast(`Failed to copy to clipboard: ${msg}`, 'error');
        }
        return false;
    }
}
