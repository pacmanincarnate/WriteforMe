/**
 * @module services/llm/stop
 * Lets a Stop press cancel the model call that is in flight instead of waiting for it to finish.
 *
 * Every generation request carries `modelStopSignal()`. `stopModelCalls()` aborts that signal, so
 * the browser drops the request: a hosted API stops streaming (and billing), the Claude Code and
 * Codex bridges end their process, and KoboldCPP is told to abort. With `hold`, further calls are
 * refused until `resumeModelCalls()`, so a pipeline step that is unwinding cannot quietly retry.
 */

export class ModelStopError extends Error {
    constructor(message = 'Stopped before the model finished.') {
        super(message);
        this.name = 'ModelStopError';
    }
}

type StopListener = () => void;

let controller = new AbortController();
let held = false;
const listeners = new Set<StopListener>();

/** The signal every generation request should carry. */
export function modelStopSignal(): AbortSignal {
    return controller.signal;
}

/** True between a held stop and the matching `resumeModelCalls()`. */
export function modelCallsStopped(): boolean {
    return held;
}

/**
 * Cancels every model call in flight. With `hold`, later calls fail at once with
 * `ModelStopError` until `resumeModelCalls()` is called.
 */
export function stopModelCalls(options: { hold?: boolean } = {}): void {
    const stopping = controller;
    held = Boolean(options.hold);
    if (!held) controller = new AbortController();
    if (!stopping.signal.aborted) stopping.abort(new ModelStopError());
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch {
            // A provider's clean-up must never block the stop.
        }
    }
}

/** Lets model calls through again after a held stop. Safe to call at any time. */
export function resumeModelCalls(): void {
    held = false;
    if (controller.signal.aborted) controller = new AbortController();
}

/** Runs `listener` when calls are stopped; returns a function that removes it. */
export function onModelStop(listener: StopListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** True when `error` is, or was caused by, a Stop press. */
export function isModelStop(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 6 && current; depth++) {
        if (current instanceof ModelStopError) return true;
        if (typeof current === 'object' && (current as { name?: unknown }).name === 'ModelStopError') {
            return true;
        }
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}

/** Throws `ModelStopError` while a held stop is in force. */
export function throwIfModelStopped(): void {
    if (held) throw new ModelStopError();
}

/** Waits `ms`, or rejects at once with `ModelStopError` if calls are stopped meanwhile. */
export function sleepUnlessStopped(ms: number): Promise<void> {
    const signal = controller.signal;
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new ModelStopError());
            return;
        }
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(new ModelStopError());
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
