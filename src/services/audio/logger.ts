/**
 * @module services/audio/logger
 * Pipeline stage logging bridge dispatching structured start/complete/error events
 * to UI activity hooks when mounted, falling back cleanly to console output.
 */

export interface AudioStageLoggerGlobals {
    logAudioDramaPipelineStageStart?: (
        stageKey: string,
        stageTitle: string,
        details?: unknown,
        meta?: Record<string, unknown>
    ) => void;
    logAudioDramaPipelineStageComplete?: (
        stageKey: string,
        stageTitle: string,
        details?: unknown,
        meta?: Record<string, unknown>
    ) => void;
    logAudioDramaPipelineStageError?: (
        stageKey: string,
        stageTitle: string,
        error: unknown,
        details?: unknown,
        meta?: Record<string, unknown>
    ) => void;
}

const getWindowLogger = (): AudioStageLoggerGlobals | undefined =>
    typeof window !== 'undefined' ? (window as unknown as AudioStageLoggerGlobals) : undefined;

/** Installs default console-backed audio pipeline stage loggers on `window` if unset. */
export function installDefaultAudioStageLoggers(): void {
    const win = getWindowLogger();
    if (!win) return;
    if (!win.logAudioDramaPipelineStageStart) {
        win.logAudioDramaPipelineStageStart = (stageKey, stageTitle, details = null) => {
            const ts = new Date().toLocaleTimeString();
            console.log(`[AudioDramaTTS][Running] [${ts}] [${stageKey}] ${stageTitle}`, details || '');
        };
    }
    if (!win.logAudioDramaPipelineStageComplete) {
        win.logAudioDramaPipelineStageComplete = (stageKey, stageTitle, details = null) => {
            const ts = new Date().toLocaleTimeString();
            console.log(
                `[AudioDramaTTS][Completed] [${ts}] [${stageKey}] ${stageTitle}`,
                details || ''
            );
        };
    }
    if (!win.logAudioDramaPipelineStageError) {
        win.logAudioDramaPipelineStageError = (stageKey, stageTitle, error, details = null) => {
            const ts = new Date().toLocaleTimeString();
            console.error(
                `[AudioDramaTTS][Failed] [${ts}] [${stageKey}] ${stageTitle}`,
                error,
                details || ''
            );
        };
    }
}

export function logAudioStageStart(
    stageKey: string,
    stageTitle: string,
    details: unknown = null,
    meta: Record<string, unknown> = {}
): void {
    const win = getWindowLogger();
    if (typeof win?.logAudioDramaPipelineStageStart === 'function') {
        win.logAudioDramaPipelineStageStart(stageKey, stageTitle, details, meta);
        return;
    }
    const ts = new Date().toLocaleTimeString();
    console.log(`[AudioDramaTTS][Running] [${ts}] [${stageKey}] ${stageTitle}`, details || '');
}

export function logAudioStageComplete(
    stageKey: string,
    stageTitle: string,
    details: unknown = null,
    meta: Record<string, unknown> = {}
): void {
    const win = getWindowLogger();
    if (typeof win?.logAudioDramaPipelineStageComplete === 'function') {
        win.logAudioDramaPipelineStageComplete(stageKey, stageTitle, details, meta);
        return;
    }
    const ts = new Date().toLocaleTimeString();
    console.log(`[AudioDramaTTS][Completed] [${ts}] [${stageKey}] ${stageTitle}`, details || '');
}

export function logAudioStageError(
    stageKey: string,
    stageTitle: string,
    error: unknown,
    details: unknown = null,
    meta: Record<string, unknown> = {}
): void {
    const win = getWindowLogger();
    if (typeof win?.logAudioDramaPipelineStageError === 'function') {
        win.logAudioDramaPipelineStageError(stageKey, stageTitle, error, details, meta);
        return;
    }
    const ts = new Date().toLocaleTimeString();
    console.error(
        `[AudioDramaTTS][Failed] [${ts}] [${stageKey}] ${stageTitle}`,
        error,
        details || ''
    );
}
