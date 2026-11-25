import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores';

describe('useUiStore navigation selection and toasts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        useUiStore.getState().dismissToast();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('persists the view and resolves updater functions against the current view', () => {
        const ui = useUiStore.getState();
        expect(ui.setView('pipeline')).toBe('pipeline');
        expect(localStorage.getItem('ellipsisprose_view')).toBe('pipeline');
        expect(ui.setView((prev) => (prev === 'pipeline' ? 'reader' : 'setup'))).toBe('reader');
        expect(useUiStore.getState().view).toBe('reader');
        expect(ui.isAutopilotProtectedView()).toBe(true);
        ui.setView('setup');
        expect(ui.isAutopilotProtectedView()).toBe(false);
    });

    it('persists the act / sequence / scene selection and removes the key when cleared', () => {
        const ui = useUiStore.getState();
        ui.setSelectedAct(2);
        ui.setSelectedSequence(1);
        ui.setSelectedScene((prev) => (prev ?? 0) + 4);
        expect(useUiStore.getState()).toMatchObject({ selectedAct: 2, selectedSequence: 1, selectedScene: 4 });
        expect(localStorage.getItem('ellipsisprose_selectedAct')).toBe('2');
        expect(localStorage.getItem('ellipsisprose_selectedSequence')).toBe('1');
        expect(localStorage.getItem('ellipsisprose_selectedScene')).toBe('4');

        ui.setSelectedAct(0);
        expect(localStorage.getItem('ellipsisprose_selectedAct')).toBe('0');
        ui.setSelectedAct(null);
        ui.setSelectedSequence(null);
        ui.setSelectedScene(null);
        expect(localStorage.getItem('ellipsisprose_selectedAct')).toBeNull();
        expect(localStorage.getItem('ellipsisprose_selectedSequence')).toBeNull();
        expect(localStorage.getItem('ellipsisprose_selectedScene')).toBeNull();
    });

    it('shows a success toast for 3.5s and an error toast for 5s', () => {
        const ui = useUiStore.getState();
        ui.showToast('Saved');
        expect(useUiStore.getState().toast).toMatchObject({ message: 'Saved', type: 'success' });
        vi.advanceTimersByTime(3499);
        expect(useUiStore.getState().toast).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(useUiStore.getState().toast).toBeNull();

        ui.showToast('Broke', 'error');
        vi.advanceTimersByTime(4999);
        expect(useUiStore.getState().toast?.message).toBe('Broke');
        vi.advanceTimersByTime(1);
        expect(useUiStore.getState().toast).toBeNull();
    });

    it('keeps book-card toasts for 14s, honours durationMs, and never auto-hides at 0', () => {
        const ui = useUiStore.getState();
        ui.showToast('Done', 'success', { bookCard: { title: 'The Salt Clock' } });
        expect(useUiStore.getState().toast?.bookCard?.title).toBe('The Salt Clock');
        vi.advanceTimersByTime(13999);
        expect(useUiStore.getState().toast).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(useUiStore.getState().toast).toBeNull();

        ui.showToast('Quick', 'info', { durationMs: 100 });
        vi.advanceTimersByTime(100);
        expect(useUiStore.getState().toast).toBeNull();

        ui.showToast('Sticky', 'warning', { durationMs: 0 });
        vi.advanceTimersByTime(60000);
        expect(useUiStore.getState().toast?.message).toBe('Sticky');
    });

    it('a newer toast replaces the old one and is not hidden by the old timer', () => {
        const ui = useUiStore.getState();
        ui.showToast('First');
        vi.advanceTimersByTime(3000);
        ui.showToast('Second');
        vi.advanceTimersByTime(600);
        expect(useUiStore.getState().toast?.message).toBe('Second');
        vi.advanceTimersByTime(2900);
        expect(useUiStore.getState().toast).toBeNull();
    });

    it('dismissToast hides the toast and cancels its timer', () => {
        const ui = useUiStore.getState();
        ui.showToast('Bye');
        ui.dismissToast();
        expect(useUiStore.getState().toast).toBeNull();
        ui.showToast('Sticky', 'info', { durationMs: 0 });
        vi.advanceTimersByTime(10000);
        expect(useUiStore.getState().toast?.message).toBe('Sticky');
    });

    it('ignores a non-object options argument', () => {
        useUiStore.getState().showToast('Plain', 'info', 'oops' as unknown as null);
        expect(useUiStore.getState().toast).toMatchObject({ message: 'Plain', type: 'info' });
    });
});
