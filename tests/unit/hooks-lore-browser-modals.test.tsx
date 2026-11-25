import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countLorePages, filterLoreEntries, sliceLorePage } from '@/domain/lore';
import {
    LORE_PAGE_SIZE,
    NO_CRITIQUE_TEXT,
    useLoreBrowser,
    useOutlineCollapseState,
    useShellModals,
    type UseLoreBrowserResult
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Lore {
    topic?: string | null;
    detail?: string | null;
}

const roots: Root[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
});

function mountHook<T>(useHook: () => T): () => T {
    let latest: T | null = null;
    function Probe(): null {
        latest = useHook();
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe />));
    return () => latest as T;
}

const lore: Lore[] = [
    { topic: 'Salt Clock', detail: 'Keeps the harbor time.' },
    { topic: 'Oakhaven', detail: 'A town built on SALT flats.' },
    { topic: 'The Vault', detail: null },
    { topic: null, detail: 'Unnamed rumour about clocks.' }
];
const many = (n: number): Lore[] => Array.from({ length: n }, (_, i) => ({ topic: `Entry ${i + 1}`, detail: 'x' }));

describe('lore browsing (pure)', () => {
    it('a blank query returns the same array', () => {
        expect(filterLoreEntries(lore, '')).toBe(lore);
        expect(filterLoreEntries(lore, '   ')).toBe(lore);
        expect(filterLoreEntries(null, 'salt')).toEqual([]);
        expect(filterLoreEntries(undefined, '')).toEqual([]);
    });

    it('matches topic or detail, ignoring case and surrounding spaces', () => {
        expect(filterLoreEntries(lore, '  salt ').map((l) => l.topic)).toEqual(['Salt Clock', 'Oakhaven']);
        expect(filterLoreEntries(lore, 'CLOCK').length).toBe(2);
        expect(filterLoreEntries(lore, 'vault').map((l) => l.topic)).toEqual(['The Vault']);
        expect(filterLoreEntries(lore, 'nothing')).toEqual([]);
    });

    it('counts pages with a minimum of one and slices 1-based pages', () => {
        expect(countLorePages(0, 25)).toBe(1);
        expect(countLorePages(25, 25)).toBe(1);
        expect(countLorePages(26, 25)).toBe(2);
        const entries = many(30);
        expect(sliceLorePage(entries, 1, 25).length).toBe(25);
        expect(sliceLorePage(entries, 2, 25).map((l) => l.topic)).toEqual([
            'Entry 26', 'Entry 27', 'Entry 28', 'Entry 29', 'Entry 30'
        ]);
        expect(sliceLorePage(entries, 3, 25)).toEqual([]);
    });
});

describe('useLoreBrowser', () => {
    function mount(initial: Lore[] | undefined) {
        let latest: UseLoreBrowserResult<Lore> | null = null;
        function Probe({ entries }: { entries: Lore[] | undefined }): null {
            latest = useLoreBrowser(entries);
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe entries={initial} />));
        return {
            current: () => latest as unknown as UseLoreBrowserResult<Lore>,
            rerender: (entries: Lore[] | undefined) => act(() => root.render(<Probe entries={entries} />))
        };
    }

    it('pages the full list and reports the page size', () => {
        const h = mount(many(60));
        expect(h.current()).toMatchObject({ loreSearch: '', lorePage: 1, lorePageSize: LORE_PAGE_SIZE, totalLorePages: 3 });
        expect(h.current().paginatedLore.length).toBe(25);
        act(() => h.current().setLorePage(3));
        expect(h.current().paginatedLore.map((l) => l.topic)).toEqual(many(60).slice(50).map((l) => l.topic));
    });

    it('a new search filters the list and returns to page 1', () => {
        const h = mount(many(60));
        act(() => h.current().setLorePage(2));
        act(() => h.current().setLoreSearch('Entry 6'));
        expect(h.current().lorePage).toBe(1);
        expect(h.current().filteredLore.map((l) => l.topic)).toEqual(['Entry 6', 'Entry 60']);
        expect(h.current().totalLorePages).toBe(1);
    });

    it('follows the story lore as it changes and tolerates a story without lore', () => {
        const h = mount(undefined);
        expect(h.current()).toMatchObject({ filteredLore: [], paginatedLore: [], totalLorePages: 1 });
        h.rerender(lore);
        expect(h.current().filteredLore).toBe(lore);
    });

    it('tracks the two drop-zone drag flags separately', () => {
        const h = mount(lore);
        act(() => h.current().setIsDraggingLoreTab(true));
        expect(h.current()).toMatchObject({ isDraggingLoreTab: true, isDraggingSetupLore: false });
    });
});

describe('useShellModals', () => {
    it('starts with all three dialogs closed', () => {
        const h = mountHook(() => useShellModals({ showToast: vi.fn() }));
        expect(h().editingState).toEqual({ isOpen: false, title: '', value: '', onConfirm: null });
        expect(h().interventionState).toEqual({
            isOpen: false, tierName: '', deviationReasons: [], rawOutput: '', onResolve: null
        });
        expect(h().critiqueState).toEqual({ isOpen: false, beatNumber: null, critique: '' });
    });

    it('the edit dialog confirms, closes and toasts', () => {
        const showToast = vi.fn();
        const onConfirm = vi.fn();
        const h = mountHook(() => useShellModals({ showToast }));
        act(() => h().openEditModal('World Primer', null, onConfirm));
        expect(h().editingState).toMatchObject({ isOpen: true, title: 'World Primer', value: '' });
        act(() => h().editingState.onConfirm?.('New text'));
        expect(onConfirm).toHaveBeenCalledWith('New text');
        expect(h().editingState).toMatchObject({ isOpen: false, title: 'World Primer' });
        expect(showToast).toHaveBeenCalledWith('World Primer updated!', 'success');
    });

    it('the critique dialog falls back to a placeholder text', () => {
        const h = mountHook(() => useShellModals({ showToast: vi.fn() }));
        act(() => h().openCritiqueModal(3, 'Too abrupt.'));
        expect(h().critiqueState).toEqual({ isOpen: true, beatNumber: 3, critique: 'Too abrupt.' });
        act(() => h().openCritiqueModal(4, ''));
        expect(h().critiqueState.critique).toBe(NO_CRITIQUE_TEXT);
    });
});

describe('useOutlineCollapseState', () => {
    it('starts with nothing folded', () => {
        const h = mountHook(useOutlineCollapseState);
        expect(h()).toMatchObject({ collapsedActs: {}, collapsedBeats: {}, expandedBeatAnalysis: {} });
        act(() => h().setCollapsedActs({ 0: true }));
        expect(h().collapsedActs).toEqual({ 0: true });
    });
});
