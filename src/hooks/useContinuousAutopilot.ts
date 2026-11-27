/**
 * @module hooks/useContinuousAutopilot
 * Continuous Autopilot: the switch that turns it on and off, and the loop that keeps running
 * pipeline steps until the story is finished, the user stops it, or a step fails.
 *
 * It is two hooks because the shell needs the refs and the toggle before the pipeline context
 * exists, and the loop needs the pipeline step that is built from that context.
 */

import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { DEFAULT_SERVICE_URLS, TIMEOUTS_MS } from '@/config';
import { isLocalKoboldUrl } from '@/services/llm';

type Setter<T> = Dispatch<SetStateAction<T>>;

/** Pause while another step is still finishing, and between steps so the UI can paint. */
export const AUTOPILOT_BUSY_POLL_MS = 200;
export const AUTOPILOT_STEP_GAP_MS = 500;

export interface UseAutopilotControlParams {
    continuousAutopilot: boolean;
    setContinuousAutopilot: Setter<boolean>;
    setLoading: (loading: boolean) => void;
}

export interface UseAutopilotControlResult<TPrefetch = unknown> {
    /** The switch as the running loop sees it; flipped synchronously, ahead of the next render. */
    continuousAutopilotRef: MutableRefObject<boolean>;
    isAutopilotStepRunningRef: MutableRefObject<boolean>;
    /** Scenes generated ahead of time during a run; dropped whenever autopilot stops. */
    prefetchCacheRef: MutableRefObject<Map<string, TPrefetch>>;
    toggleContinuousAutopilot: () => void;
}

export function useAutopilotControl<TPrefetch = unknown>({
    continuousAutopilot,
    setContinuousAutopilot,
    setLoading
}: UseAutopilotControlParams): UseAutopilotControlResult<TPrefetch> {
    const continuousAutopilotRef = useRef(false);
    const isAutopilotStepRunningRef = useRef(false);
    const prefetchCacheRef = useRef(new Map<string, TPrefetch>());

    useEffect(() => {
        continuousAutopilotRef.current = continuousAutopilot;
        if (!continuousAutopilot) {
            isAutopilotStepRunningRef.current = false;
            setLoading(false);
            prefetchCacheRef.current.clear();
        }
        // setLoading is a state setter; only the switch drives this.
    }, [continuousAutopilot]);

    const toggleContinuousAutopilot = (): void => {
        setContinuousAutopilot((prev) => {
            const next = !prev;
            continuousAutopilotRef.current = next;
            if (!next) {
                isAutopilotStepRunningRef.current = false;
                setLoading(false);
                prefetchCacheRef.current.clear();
            }
            return next;
        });
    };

    return { continuousAutopilotRef, isAutopilotStepRunningRef, prefetchCacheRef, toggleContinuousAutopilot };
}

/** Checks that a local KoboldCPP server answers before a long run starts against it. */
export async function isKoboldReachable(koboldUrl: string | null | undefined): Promise<boolean> {
    const targetUrl = normalizeKoboldUrl(koboldUrl);
    if (isLocalKoboldUrl(targetUrl) && typeof window !== 'undefined') {
        const bridge = window.ellipsisDesktopBackends;
        if (bridge?.acquireGpuLease && bridge?.releaseGpuLease) {
            const lease = await bridge.acquireGpuLease('llm', { koboldUrl: targetUrl }).catch(() => null);
            if (lease?.ok && lease.value?.leaseId) {
                await bridge.releaseGpuLease(lease.value.leaseId).catch(() => {});
            }
        } else if (bridge?.ensureKoboldRunning) {
            await bridge.ensureKoboldRunning().catch(() => {});
        }
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUTS_MS.koboldPreflight);
        const response = await fetch(`${targetUrl}/v1/models`, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
    } catch {
        return false;
    }
}

export function normalizeKoboldUrl(koboldUrl: string | null | undefined): string {
    return (koboldUrl || DEFAULT_SERVICE_URLS.koboldcpp).replace(/\/+$/, '');
}

export interface UseAutopilotLoopParams {
    continuousAutopilot: boolean;
    setContinuousAutopilot: Setter<boolean>;
    setLoading: (loading: boolean) => void;
    continuousAutopilotRef: MutableRefObject<boolean>;
    isAutopilotStepRunningRef: MutableRefObject<boolean>;
    prefetchCacheRef: { current: { clear: () => void } };
    apiProvider: string;
    koboldUrl: string | null | undefined;
    /** Runs one pipeline step. Resolves truthy while there is more of the story to generate. */
    runStep: () => Promise<unknown>;
    showToast: (message: string, type?: string) => void;
    /** Called once each time a run ends, however it ended. */
    onRunEnded?: () => void;
}

/**
 * Runs pipeline steps back to back while the switch is on. The values of `runStep`, `apiProvider`,
 * `koboldUrl` and `onRunEnded` are the ones from the render in which the switch was turned on.
 */
export function useAutopilotLoop({
    continuousAutopilot,
    setContinuousAutopilot,
    setLoading,
    continuousAutopilotRef,
    isAutopilotStepRunningRef,
    prefetchCacheRef,
    apiProvider,
    koboldUrl,
    runStep,
    showToast,
    onRunEnded
}: UseAutopilotLoopParams): void {
    useEffect(() => {
        let cancelled = false;
        const runLoop = async (): Promise<void> => {
            if (!continuousAutopilot) return;
            continuousAutopilotRef.current = true;

            if (apiProvider === 'koboldcpp' && !(await isKoboldReachable(koboldUrl))) {
                showToast(
                    `Could not connect to KoboldCPP at ${normalizeKoboldUrl(koboldUrl)}. Please ensure KoboldCPP is running locally before starting Autopilot.`,
                    'error'
                );
                setContinuousAutopilot(false);
                continuousAutopilotRef.current = false;
                return;
            }

            while (!cancelled && continuousAutopilotRef.current) {
                if (isAutopilotStepRunningRef.current) {
                    await new Promise((resolve) => setTimeout(resolve, AUTOPILOT_BUSY_POLL_MS));
                    continue;
                }
                isAutopilotStepRunningRef.current = true;
                let hasMore;
                try {
                    hasMore = await runStep();
                } catch (err) {
                    console.error('Continuous Autopilot error:', err);
                    showToast(`Autopilot error: ${(err as Error).message}`, 'error');
                    setContinuousAutopilot(false);
                    continuousAutopilotRef.current = false;
                    break;
                } finally {
                    isAutopilotStepRunningRef.current = false;
                    setLoading(false);
                }

                if (!hasMore || !continuousAutopilotRef.current || cancelled) break;

                await new Promise((resolve) => setTimeout(resolve, AUTOPILOT_STEP_GAP_MS));
            }

            // Halted or completed: reset so the UI is never left showing a run in progress.
            setContinuousAutopilot(false);
            continuousAutopilotRef.current = false;
            isAutopilotStepRunningRef.current = false;
            setLoading(false);
            onRunEnded?.();
        };

        if (continuousAutopilot) {
            void runLoop();
        } else {
            continuousAutopilotRef.current = false;
            isAutopilotStepRunningRef.current = false;
            prefetchCacheRef.current.clear();
        }

        return () => {
            cancelled = true;
        };
        // Only the switch starts or stops a run; everything else is read as of that render.
    }, [continuousAutopilot]);
}
