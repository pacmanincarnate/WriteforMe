import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUTOPILOT_STEP_GAP_MS,
    isKoboldReachable,
    normalizeKoboldUrl,
    useAutopilotControl,
    useAutopilotLoop
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

interface HarnessOptions {
    runStep: () => Promise<unknown>;
    apiProvider?: string;
    koboldUrl?: string;
}

function mountAutopilot(options: HarnessOptions) {
    const showToast = vi.fn();
    const setLoading = vi.fn();
    const onRunEnded = vi.fn();
    let latest: {
        on: boolean;
        control: ReturnType<typeof useAutopilotControl>;
    } | null = null;
    function Probe(): null {
        const [on, setOn] = useState(false);
        const control = useAutopilotControl({ continuousAutopilot: on, setContinuousAutopilot: setOn, setLoading });
        useAutopilotLoop({
            continuousAutopilot: on,
            setContinuousAutopilot: setOn,
            setLoading,
            ...control,
            apiProvider: options.apiProvider || 'gemini',
            koboldUrl: options.koboldUrl,
            runStep: options.runStep,
            showToast,
            onRunEnded
        });
        latest = { on, control };
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe />));
    return { get: () => latest!, showToast, setLoading, onRunEnded };
}

const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useAutopilotControl', () => {
    it('toggling on flips the ref at once; toggling off clears run state', async () => {
        const h = mountAutopilot({ runStep: () => new Promise(() => {}) });
        expect(h.get().on).toBe(false);
        act(() => h.get().control.toggleContinuousAutopilot());
        expect(h.get().on).toBe(true);
        expect(h.get().control.continuousAutopilotRef.current).toBe(true);

        h.get().control.prefetchCacheRef.current.set('0-1', 'pending');
        h.setLoading.mockClear();
        act(() => h.get().control.toggleContinuousAutopilot());
        expect(h.get().on).toBe(false);
        expect(h.get().control.continuousAutopilotRef.current).toBe(false);
        expect(h.get().control.isAutopilotStepRunningRef.current).toBe(false);
        expect(h.get().control.prefetchCacheRef.current.size).toBe(0);
        expect(h.setLoading).toHaveBeenCalledWith(false);
    });
});

describe('useAutopilotLoop', () => {
    it('runs steps until one reports nothing left, then switches itself off', async () => {
        const runStep = vi.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const h = mountAutopilot({ runStep });
        act(() => h.get().control.toggleContinuousAutopilot());
        await flush();
        expect(runStep).toHaveBeenCalledTimes(1);
        await flush(AUTOPILOT_STEP_GAP_MS);
        expect(runStep).toHaveBeenCalledTimes(2);
        await flush(AUTOPILOT_STEP_GAP_MS);
        expect(runStep).toHaveBeenCalledTimes(3);
        await flush();
        expect(h.get().on).toBe(false);
        expect(h.get().control.continuousAutopilotRef.current).toBe(false);
        expect(h.onRunEnded).toHaveBeenCalledTimes(1);
        expect(h.showToast).not.toHaveBeenCalled();
    });

    it('stops after the current step when the user switches it off', async () => {
        let finishStep: (value: boolean) => void = () => {};
        const runStep = vi.fn(() => new Promise<boolean>((resolve) => { finishStep = resolve; }));
        const h = mountAutopilot({ runStep });
        act(() => h.get().control.toggleContinuousAutopilot());
        await flush();
        expect(runStep).toHaveBeenCalledTimes(1);
        act(() => h.get().control.toggleContinuousAutopilot());
        await act(async () => { finishStep(true); await vi.advanceTimersByTimeAsync(AUTOPILOT_STEP_GAP_MS * 2); });
        expect(runStep).toHaveBeenCalledTimes(1);
        expect(h.get().on).toBe(false);
    });

    it('a failing step stops the run and tells the user', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const runStep = vi.fn().mockRejectedValue(new Error('model timed out'));
        const h = mountAutopilot({ runStep });
        act(() => h.get().control.toggleContinuousAutopilot());
        await flush();
        expect(runStep).toHaveBeenCalledTimes(1);
        expect(h.showToast).toHaveBeenCalledWith('Autopilot error: model timed out', 'error');
        expect(h.get().on).toBe(false);
        expect(h.get().control.isAutopilotStepRunningRef.current).toBe(false);
        expect(h.onRunEnded).toHaveBeenCalledTimes(1);
    });

    it('does not start against an unreachable KoboldCPP server', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')));
        const runStep = vi.fn().mockResolvedValue(false);
        const h = mountAutopilot({ runStep, apiProvider: 'koboldcpp', koboldUrl: 'http://localhost:5001/' });
        act(() => h.get().control.toggleContinuousAutopilot());
        await flush();
        expect(runStep).not.toHaveBeenCalled();
        expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5001.'), 'error');
        expect(h.get().on).toBe(false);
        expect(h.onRunEnded).not.toHaveBeenCalled();
    });

    it('starts once KoboldCPP answers', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        const runStep = vi.fn().mockResolvedValue(false);
        const h = mountAutopilot({ runStep, apiProvider: 'koboldcpp', koboldUrl: 'http://box:5001//' });
        act(() => h.get().control.toggleContinuousAutopilot());
        await flush();
        expect(fetchMock).toHaveBeenCalledWith('http://box:5001/v1/models', expect.objectContaining({ method: 'GET' }));
        expect(runStep).toHaveBeenCalledTimes(1);
    });
});

describe('KoboldCPP preflight', () => {
    it('normalises the server address', () => {
        expect(normalizeKoboldUrl(undefined)).toBe('http://localhost:5001');
        expect(normalizeKoboldUrl('http://host:7000///')).toBe('http://host:7000');
    });

    it('treats an error status as unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
        expect(await isKoboldReachable('http://host')).toBe(false);
    });
});
