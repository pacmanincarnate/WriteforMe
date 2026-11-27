/**
 * Keeps a freshly installed service worker from being left in the "waiting" state.
 *
 * src/sw.ts calls skipWaiting() while it installs, so a new worker is meant to take over at
 * once. Chrome postpones that takeover while the old worker is still answering a request, and it
 * does not always try again afterwards. A page request made at the wrong moment (the update
 * check does one) could leave the new worker waiting until every tab was closed, which also left
 * the previous worker's cache behind. Asking the waiting worker to skip waiting again finishes
 * the takeover, so this asks a few times until it has happened.
 */

export interface WorkerTakeoverOptions {
    /** Time between requests, and before the first one. */
    intervalMs?: number;
    /** How many times to ask before giving up. The worker then activates on the next visit. */
    attempts?: number;
}

type RegistrationLike = Pick<ServiceWorkerRegistration, 'waiting' | 'installing' | 'addEventListener' | 'removeEventListener'>;

/** Starts watching `registration`. Returns a function that stops it. */
export function ensureWaitingWorkerActivates(
    registration: RegistrationLike,
    { intervalMs = 1500, attempts = 6 }: WorkerTakeoverOptions = {}
): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const workerCleanups: Array<() => void> = [];

    const nudge = (remaining: number) => {
        if (stopped || timer !== null) return;
        timer = setTimeout(() => {
            timer = null;
            const waiting = registration.waiting;
            if (stopped || !waiting) return;
            try {
                waiting.postMessage({ type: 'SKIP_WAITING' });
            } catch {
                // The worker went away between the check and the message.
            }
            if (remaining > 1) nudge(remaining - 1);
        }, intervalMs);
    };

    const watch = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const onStateChange = () => {
            if (worker.state === 'installed') nudge(attempts);
        };
        worker.addEventListener('statechange', onStateChange);
        workerCleanups.push(() => worker.removeEventListener('statechange', onStateChange));
    };

    const onUpdateFound = () => watch(registration.installing);
    registration.addEventListener('updatefound', onUpdateFound);
    watch(registration.installing);
    if (registration.waiting) nudge(attempts);

    return () => {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        registration.removeEventListener('updatefound', onUpdateFound);
        for (const cleanup of workerCleanups) cleanup();
    };
}
