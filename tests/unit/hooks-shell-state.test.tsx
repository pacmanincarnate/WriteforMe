import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ACTIVE_STORY_ID_STORAGE_KEY,
    DEFAULT_STORY_ID,
    NARRATIVE_LENSES_LEGACY_STORAGE_KEY,
    NARRATIVE_LENSES_STORAGE_KEY,
    hasModelRoutingOverrides,
    readScrollEdges,
    toSelectedRelationship,
    useActiveStory,
    useArchetypeOptions,
    useAudioFollowState,
    useGenerationStatus,
    useNarrativeLensesToggle,
    useOutlineCollapseState,
    useRelationshipMatrix,
    useSettingsDisclosures
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
    vi.restoreAllMocks();
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

describe('useActiveStory', () => {
    it('starts on the default story with a blank template', () => {
        const get = mountHook(useActiveStory);
        expect(get().activeStoryId).toBe(DEFAULT_STORY_ID);
        expect(get().story.id).toBe(DEFAULT_STORY_ID);
        expect(get().storyRef.current).toBe(get().story);
        expect(get().hasHydratedStoryRef.current).toBe(false);
        expect(get().isInitialMountRef.current).toBe(true);
    });

    it('restores the last open story id', () => {
        localStorage.setItem(ACTIVE_STORY_ID_STORAGE_KEY, 'story_42');
        const get = mountHook(useActiveStory);
        expect(get().activeStoryId).toBe('story_42');
        expect(get().story.id).toBe('story_42');
    });

    it('setStory returns the new story and updates the ref before the next render', () => {
        const get = mountHook(useActiveStory);
        let returned: unknown;
        let refDuringCall: unknown;
        act(() => {
            returned = get().setStory((prev) => ({ ...prev, title: 'First' }));
            refDuringCall = get().storyRef.current;
        });
        expect((returned as { title: string }).title).toBe('First');
        expect(refDuringCall).toBe(returned);
        expect(get().story.title).toBe('First');
    });

    it('two functional updates in one tick both apply', () => {
        // The regression this hook exists to prevent: the second updater must see the first.
        const get = mountHook(useActiveStory);
        act(() => {
            get().setStory((prev) => ({ ...prev, title: 'A' }));
            get().setStory((prev) => ({ ...prev, genre: `${prev.title}-genre` }));
        });
        expect(get().story.title).toBe('A');
        expect(get().story.genre).toBe('A-genre');
    });

    it('accepts a whole story value and keeps a stable setter', () => {
        const get = mountHook(useActiveStory);
        const setter = get().setStory;
        act(() => {
            get().setStory({ id: 'x', title: 'Whole' });
        });
        expect(get().story).toEqual({ id: 'x', title: 'Whole' });
        expect(get().setStory).toBe(setter);
    });
});

describe('useGenerationStatus', () => {
    it('starts idle with nothing recorded', () => {
        const get = mountHook(useGenerationStatus);
        expect(get().loading).toBe(false);
        expect(get().loadingStep).toBe('');
        expect(get().continuousAutopilot).toBe(false);
        expect(get().isDirectingVoices).toBe(false);
        expect(get().failedReviewCritiques).toEqual([]);
        expect(get().feedbackLedger).toEqual({});
        expect(get().worldPrimer).toBeNull();
    });

    it('keeps the ledger ref in step with the ledger', () => {
        const get = mountHook(useGenerationStatus);
        act(() => get().setFeedbackLedger({ '0-0': ['tighten the opening'] }));
        expect(get().feedbackLedgerRef.current).toEqual({ '0-0': ['tighten the opening'] });
        expect(get().feedbackLedgerRef.current).toBe(get().feedbackLedger);
    });
});

describe('relationship matrix', () => {
    const relationships = {
        'Ana->Ben': { current: 'Wary allies', hidden_tension: 'Debt', trust_level: '7', history: [{ chapter: '1', change: 'Met' }] }
    };

    it('flattens a stored relationship for the editor', () => {
        expect(toSelectedRelationship(relationships, 'Ana', 'Ben')).toEqual({
            from: 'Ana',
            to: 'Ben',
            key: 'Ana->Ben',
            current: 'Wary allies',
            hidden_tension: 'Debt',
            trust_level: 7,
            history: [{ chapter: '1', change: 'Met' }]
        });
    });

    it('gives a blank editor state with trust 5 when nothing is stored', () => {
        expect(toSelectedRelationship(relationships, 'Ben', 'Ana')).toEqual({
            from: 'Ben',
            to: 'Ana',
            key: 'Ben->Ana',
            current: '',
            hidden_tension: '',
            trust_level: 5,
            history: []
        });
        expect(toSelectedRelationship(undefined, 'A', 'B').trust_level).toBe(5);
    });

    it('reports which edges still have content', () => {
        expect(readScrollEdges(null)).toEqual({ left: false, right: false });
        expect(readScrollEdges({ scrollWidth: 100, clientWidth: 100, scrollLeft: 0 })).toEqual({ left: false, right: false });
        expect(readScrollEdges({ scrollWidth: 300, clientWidth: 100, scrollLeft: 0 })).toEqual({ left: false, right: true });
        expect(readScrollEdges({ scrollWidth: 300, clientWidth: 100, scrollLeft: 50 })).toEqual({ left: true, right: true });
        expect(readScrollEdges({ scrollWidth: 300, clientWidth: 100, scrollLeft: 200 })).toEqual({ left: true, right: false });
    });

    it('selects a relationship through the hook', () => {
        const get = mountHook(() =>
            useRelationshipMatrix({ relationships, view: 'dashboard', matrixView: 'grid', storyId: 's', castCount: 2 })
        );
        expect(get().selectedRel).toBeNull();
        expect(get().matrixScroll).toEqual({ left: false, right: false });
        act(() => get().selectMatrixRelationship({ name: 'Ana' }, { name: 'Ben' }));
        expect(get().selectedRel?.key).toBe('Ana->Ben');
        expect(get().selectedRel?.trust_level).toBe(7);
    });
});

describe('shell view state', () => {
    it('narrative lenses default to on and write both storage keys', () => {
        const get = mountHook(useNarrativeLensesToggle);
        expect(get()[0]).toBe(true);
        expect(localStorage.getItem(NARRATIVE_LENSES_STORAGE_KEY)).toBe('true');
        expect(localStorage.getItem(NARRATIVE_LENSES_LEGACY_STORAGE_KEY)).toBe('true');
        act(() => get()[1](false));
        expect(localStorage.getItem(NARRATIVE_LENSES_STORAGE_KEY)).toBe('false');
        expect(localStorage.getItem(NARRATIVE_LENSES_LEGACY_STORAGE_KEY)).toBe('false');
    });

    it('narrative lenses restore an explicit off, and ignore the legacy key', () => {
        localStorage.setItem(NARRATIVE_LENSES_LEGACY_STORAGE_KEY, 'false');
        expect(mountHook(useNarrativeLensesToggle)()[0]).toBe(true);
        localStorage.setItem(NARRATIVE_LENSES_STORAGE_KEY, 'false');
        expect(mountHook(useNarrativeLensesToggle)()[0]).toBe(false);
    });

    it('draws archetype options after mount', () => {
        const get = mountHook(() => useArchetypeOptions(5));
        expect(get()[0]).toHaveLength(5);
    });

    it('opens advanced model routing only when an override is set', () => {
        expect(hasModelRoutingOverrides({})).toBe(false);
        expect(hasModelRoutingOverrides({ reviewModel: '', proseProvider: null })).toBe(false);
        expect(hasModelRoutingOverrides({ proseModel: 'some-model' })).toBe(true);
        expect(mountHook(() => useSettingsDisclosures({}))().showAdvancedModelRouting).toBe(false);
        const open = mountHook(() => useSettingsDisclosures({ reviewProvider: 'openrouter' }));
        expect(open().showAdvancedModelRouting).toBe(true);
        expect(open().showOtherApiKeys).toBe(false);
    });

    it('audio follow starts on', () => {
        const get = mountHook(useAudioFollowState);
        expect(get().isFollowingAudio).toBe(true);
        expect(get().isFollowingAudioRef.current).toBe(true);
        expect(get().returnToAudioNonce).toBe(0);
        act(() => get().setReturnToAudioNonce((n) => n + 1));
        expect(get().returnToAudioNonce).toBe(1);
    });

    it('the Structure act tab starts on the first act', () => {
        const get = mountHook(useOutlineCollapseState);
        expect(get().activeActTab).toBe(0);
        act(() => get().setActiveActTab(2));
        expect(get().activeActTab).toBe(2);
    });
});
