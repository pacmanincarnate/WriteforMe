import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWaitingWorkerActivates } from '@/services/updates/swTakeover';

class FakeTarget {
    private listeners = new Map<string, Set<() => void>>();
    addEventListener(type: string, fn: () => void) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: () => void) {
        this.listeners.get(type)?.delete(fn);
    }
    emit(type: string) {
        for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
    }
    count(type: string) {
        return this.listeners.get(type)?.size ?? 0;
    }
}

class FakeWorker extends FakeTarget {
    state = 'installing';
    postMessage = vi.fn();
}

class FakeRegistration extends FakeTarget {
    waiting: FakeWorker | null = null;
    installing: FakeWorker | null = null;
}

const watch = (reg: FakeRegistration, opts?: { intervalMs?: number; attempts?: number }) =>
    ensureWaitingWorkerActivates(reg as unknown as ServiceWorkerRegistration, opts);

describe('ensureWaitingWorkerActivates', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('asks a worker that is stuck waiting to take over, and stops once it has', () => {
        const reg = new FakeRegistration();
        const worker = new FakeWorker();
        reg.installing = worker;
        watch(reg, { intervalMs: 1000, attempts: 5 });

        worker.state = 'installed';
        reg.installing = null;
        reg.waiting = worker;
        worker.emit('statechange');
        expect(worker.postMessage).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        vi.advanceTimersByTime(1000);
        expect(worker.postMessage).toHaveBeenCalledTimes(2);

        reg.waiting = null; // it activated
        vi.advanceTimersByTime(10000);
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('sends nothing when the worker takes over by itself', () => {
        const reg = new FakeRegistration();
        const worker = new FakeWorker();
        reg.installing = worker;
        watch(reg, { intervalMs: 1000 });

        worker.state = 'installed';
        reg.waiting = worker;
        worker.emit('statechange');
        worker.state = 'activating';
        reg.waiting = null;
        worker.emit('statechange');

        vi.advanceTimersByTime(10000);
        expect(worker.postMessage).not.toHaveBeenCalled();
    });

    it('handles a worker that was already waiting, and one found later', () => {
        const reg = new FakeRegistration();
        const first = new FakeWorker();
        first.state = 'installed';
        reg.waiting = first;
        watch(reg, { intervalMs: 1000, attempts: 2 });

        vi.advanceTimersByTime(5000);
        expect(first.postMessage).toHaveBeenCalledTimes(2); // gives up after `attempts`

        const second = new FakeWorker();
        reg.waiting = null;
        reg.installing = second;
        reg.emit('updatefound');
        second.state = 'installed';
        reg.waiting = second;
        second.emit('statechange');
        vi.advanceTimersByTime(1000);
        expect(second.postMessage).toHaveBeenCalledTimes(1);
    });

    it('stops everything when the returned function is called', () => {
        const reg = new FakeRegistration();
        const worker = new FakeWorker();
        worker.state = 'installed';
        reg.waiting = worker;
        reg.installing = new FakeWorker();
        const installing = reg.installing;
        const stop = watch(reg, { intervalMs: 1000 });

        stop();
        vi.advanceTimersByTime(10000);
        expect(worker.postMessage).not.toHaveBeenCalled();
        expect(reg.count('updatefound')).toBe(0);
        expect(installing.count('statechange')).toBe(0);
    });
});
