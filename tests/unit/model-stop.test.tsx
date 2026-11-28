import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutopilotControl, useAutopilotLoop } from '@/hooks';
import { dispatchAI } from '@/pipeline/aiDispatch';
import { fetchWithTimeout } from '@/services/http';
import {
    ModelStopError,
    callKoboldCPP,
    isModelStop,
    modelCallsStopped,
    modelStopSignal,
    resumeModelCalls,
    sleepUnlessStopped,
    stopModelCalls,
    throwIfModelStopped
} from '@/services/llm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
    resumeModelCalls();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** A model server that never answers: the request ends only when its signal is aborted. */
function hangingFetch() {
    const signals: (AbortSignal | undefined)[] = [];
    const urls: string[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        urls.push(String(url));
        if (String(url).endsWith('/api/extra/abort')) {
            return Promise.resolve(new Response('{}', { status: 200 }));
        }
        signals.push(init?.signal ?? undefined);
        return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const fail = (): void => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
            };
            if (signal?.aborted) fail();
            else signal?.addEventListener('abort', fail);
        });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, signals, urls };
}

const settings = {
    modelSettings: { apiProvider: 'openrouter', proseProvider: 'openrouter', proseModel: 'deepseek/deepseek-chat' },
    thinkingSettings: {},
    openRouterKey: 'sk-test'
};
const request = {
    prompt: 'Draft beat',
    systemPrompt: 'System',
    isJson: false,
    logName: 'Writing Agent Scene 1',
    modelRoleOrSize: 'prose'
};

describe('the stop switch', () => {
    it('aborts the signal in flight and hands out a fresh one', () => {
        const before = modelStopSignal();
        stopModelCalls();
        expect(before.aborted).toBe(true);
        expect(before.reason).toBeInstanceOf(ModelStopError);
        expect(modelStopSignal().aborted).toBe(false);
        expect(modelCallsStopped()).toBe(false);
        expect(() => throwIfModelStopped()).not.toThrow();
    });

    it('with hold, refuses calls until resumed', () => {
        stopModelCalls({ hold: true });
        expect(modelCallsStopped()).toBe(true);
        expect(modelStopSignal().aborted).toBe(true);
        expect(() => throwIfModelStopped()).toThrow(ModelStopError);
        resumeModelCalls();
        expect(modelCallsStopped()).toBe(false);
        expect(modelStopSignal().aborted).toBe(false);
    });

    it('knows a stop through a chain of causes', () => {
        expect(isModelStop(new Error('wrapped', { cause: new ModelStopError() }))).toBe(true);
        expect(isModelStop(new Error('Request timed out after 30 seconds'))).toBe(false);
        expect(isModelStop(null)).toBe(false);
    });

    it('cuts a retry wait short', async () => {
        const wait = sleepUnlessStopped(60_000);
        stopModelCalls();
        await expect(wait).rejects.toBeInstanceOf(ModelStopError);
    });
});

describe('fetchWithTimeout', () => {
    it("reports the caller's own reason, not a timeout, when the caller aborts", async () => {
        hangingFetch();
        const controller = new AbortController();
        const pending = fetchWithTimeout('https://example.test', { signal: controller.signal }, 60_000);
        controller.abort(new ModelStopError());
        await expect(pending).rejects.toBeInstanceOf(ModelStopError);
    });

    it('still reports a timeout when the deadline passes', async () => {
        vi.useFakeTimers();
        hangingFetch();
        const pending = fetchWithTimeout('https://example.test', {}, 1000);
        const seen = expect(pending).rejects.toThrow('Request timed out after 1 seconds');
        await vi.advanceTimersByTimeAsync(1001);
        await seen;
    });
});

describe('a model call that is stopped', () => {
    it('ends at once, is not retried, and is logged as stopped', async () => {
        const { fetchMock, signals } = hangingFetch();
        const showToast = vi.fn();
        let logs: Record<string, unknown>[] = [];
        const setPromptLog = (updater: (prev: never[]) => never[]): void => {
            logs = updater(logs as never[]);
        };
        const pending = dispatchAI(request, settings, { showToast, setPromptLog: setPromptLog as never });
        const outcome = pending.then(
            () => 'finished',
            (err: unknown) => err
        );
        await vi.waitFor(() => expect(signals.length).toBe(1));
        expect(signals[0]).toBeDefined();

        stopModelCalls({ hold: true });
        const err = await outcome;
        expect(isModelStop(err)).toBe(true);
        expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes('/endpoints')).length).toBe(1);
        expect(showToast).not.toHaveBeenCalled();
        expect(logs[0]?.validationSummary).toBe('Stopped by you before the model finished.');

        // While the step unwinds, nothing new reaches a model.
        const callsBefore = fetchMock.mock.calls.length;
        await expect(dispatchAI(request, settings, {})).rejects.toBeInstanceOf(ModelStopError);
        expect(fetchMock.mock.calls.length).toBe(callsBefore);

        resumeModelCalls();
        const again = dispatchAI(request, settings, {}).catch((e: unknown) => e);
        await vi.waitFor(() => expect(signals.length).toBe(2));
        stopModelCalls();
        expect(isModelStop(await again)).toBe(true);
    });

    it('tells a real KoboldCPP to stop generating, but not a CLI bridge', async () => {
        const { urls, signals } = hangingFetch();
        const real = callKoboldCPP('http://localhost:5001', 'local', 'Hi', 'System', false, {}).catch((e: unknown) => e);
        await vi.waitFor(() => expect(signals.length).toBe(1));
        stopModelCalls();
        expect(isModelStop(await real)).toBe(true);
        expect(urls).toContain('http://localhost:5001/api/extra/abort');

        urls.length = 0;
        const bridge = callKoboldCPP('http://localhost:5055', 'sonnet', 'Hi', 'System', false, {
            provider: 'claude'
        }).catch((e: unknown) => e);
        await vi.waitFor(() => expect(signals.length).toBe(2));
        stopModelCalls();
        expect(isModelStop(await bridge)).toBe(true);
        expect(urls.some((url) => url.endsWith('/api/extra/abort'))).toBe(false);
    });
});

describe('Autopilot stop', () => {
    it('cancels the call in flight instead of waiting for it', async () => {
        vi.useFakeTimers();
        const showToast = vi.fn();
        let stepSignal: AbortSignal | null = null;
        // A step that is waiting on a model: it ends only when the call is cancelled.
        const runStep = vi.fn(
            () =>
                new Promise<boolean>((_resolve, reject) => {
                    stepSignal = modelStopSignal();
                    stepSignal.addEventListener('abort', () => reject(stepSignal?.reason));
                })
        );
        let latest: { on: boolean; control: ReturnType<typeof useAutopilotControl> } | null = null;
        function Probe(): null {
            const [on, setOn] = useState(false);
            const setLoading = (): void => {};
            const control = useAutopilotControl({ continuousAutopilot: on, setContinuousAutopilot: setOn, setLoading });
            useAutopilotLoop({
                continuousAutopilot: on,
                setContinuousAutopilot: setOn,
                setLoading,
                ...control,
                apiProvider: 'gemini',
                koboldUrl: '',
                runStep,
                showToast
            });
            latest = { on, control };
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

        act(() => latest!.control.toggleContinuousAutopilot());
        await flush();
        expect(runStep).toHaveBeenCalledTimes(1);
        expect(stepSignal!.aborted).toBe(false);

        act(() => latest!.control.toggleContinuousAutopilot());
        expect(stepSignal!.aborted).toBe(true);
        await flush();

        expect(latest!.on).toBe(false);
        expect(runStep).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith('Autopilot stopped. The call in flight was cancelled.', 'info');
        expect(showToast.mock.calls.some(([, kind]) => kind === 'error')).toBe(false);
        // Once the step has let go, model calls work again.
        expect(modelCallsStopped()).toBe(false);
        expect(modelStopSignal().aborted).toBe(false);
    });
});
