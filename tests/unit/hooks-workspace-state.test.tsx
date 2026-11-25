import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_EDITORIAL_TOOL_ARGS,
    DIRECTIVE_CASCADE_STORAGE_KEY,
    DIRECTIVE_VERIFY_STORAGE_KEY,
    EDITORIAL_AUTOPILOT_STORAGE_KEY,
    EDITORIAL_DEEP_LLM_STORAGE_KEY,
    readPersistedBoolean,
    useDirectiveWorkspaceState,
    useEditorialHarnessState,
    usePersistedBoolean
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

describe('usePersistedBoolean', () => {
    it('a default-true preference is only off when stored as "false"', () => {
        expect(readPersistedBoolean('k', true)).toBe(true);
        localStorage.setItem('k', 'garbage');
        expect(readPersistedBoolean('k', true)).toBe(true);
        localStorage.setItem('k', 'false');
        expect(readPersistedBoolean('k', true)).toBe(false);
    });

    it('a default-false preference is only on when stored as "true"', () => {
        expect(readPersistedBoolean('k', false)).toBe(false);
        localStorage.setItem('k', 'garbage');
        expect(readPersistedBoolean('k', false)).toBe(false);
        localStorage.setItem('k', 'true');
        expect(readPersistedBoolean('k', false)).toBe(true);
    });

    it('stores the value on mount and on every change', () => {
        const h = mountHook(() => usePersistedBoolean('pref', true));
        expect(h()[0]).toBe(true);
        expect(localStorage.getItem('pref')).toBe('true');
        act(() => h()[1](false));
        expect(h()[0]).toBe(false);
        expect(localStorage.getItem('pref')).toBe('false');
        act(() => h()[1]((prev) => !prev));
        expect(localStorage.getItem('pref')).toBe('true');
    });

    it('keeps working and warns when storage rejects the write', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        const h = mountHook(() => usePersistedBoolean('pref', false, 'test'));
        act(() => h()[1](true));
        expect(h()[0]).toBe(true);
        expect(warn).toHaveBeenCalledWith('Could not save test preference:', expect.any(Error));
    });
});

describe('useDirectiveWorkspaceState', () => {
    it('starts empty with both options on', () => {
        const h = mountHook(useDirectiveWorkspaceState);
        expect(h()).toMatchObject({
            directiveInput: '',
            directivePlan: null,
            isPlanningDirective: false,
            directivePlanPhase: null,
            directiveUndoSnapshot: null,
            isExecutingDirective: false,
            directiveExecutionLogs: [],
            directiveProgress: 0,
            protectWrittenProse: true,
            cascadeSceneChanges: true,
            verifyDirectiveEdits: true,
            directiveRefinement: '',
            directivePlanHistory: [],
            expandedDirectiveActions: {}
        });
    });

    it('restores and persists the cascade and verify options', () => {
        localStorage.setItem(DIRECTIVE_CASCADE_STORAGE_KEY, 'false');
        const h = mountHook(useDirectiveWorkspaceState);
        expect(h().cascadeSceneChanges).toBe(false);
        expect(h().verifyDirectiveEdits).toBe(true);
        act(() => {
            h().setCascadeSceneChanges(true);
            h().setVerifyDirectiveEdits(false);
        });
        expect(localStorage.getItem(DIRECTIVE_CASCADE_STORAGE_KEY)).toBe('true');
        expect(localStorage.getItem(DIRECTIVE_VERIFY_STORAGE_KEY)).toBe('false');
    });

    it('does not persist protectWrittenProse', () => {
        const h = mountHook(useDirectiveWorkspaceState);
        act(() => h().setProtectWrittenProse(false));
        expect(h().protectWrittenProse).toBe(false);
        expect(Object.keys(localStorage).sort()).toEqual(
            [DIRECTIVE_CASCADE_STORAGE_KEY, DIRECTIVE_VERIFY_STORAGE_KEY].sort()
        );
    });
});

describe('useEditorialHarnessState', () => {
    it('starts idle on the overview tab with deep LLM off and autopilot on', () => {
        const h = mountHook(useEditorialHarnessState);
        expect(h()).toMatchObject({
            isRunningEditorialHarness: false,
            editorialHarnessPhase: '',
            editorialHarnessProgress: 0,
            editorialHarnessTab: 'overview',
            editorialScopeSceneId: 'ALL',
            editorialUseDeepLLM: false,
            enableEditorialHarnessAutopilot: true,
            editorialToolName: 'inspect_narrative_hierarchy',
            editorialToolOutput: null
        });
        expect(h().editorialToolArgs).toEqual(DEFAULT_EDITORIAL_TOOL_ARGS);
        expect(h().editorialToolArgs).not.toBe(DEFAULT_EDITORIAL_TOOL_ARGS);
    });

    it('restores and persists the deep LLM and autopilot options', () => {
        localStorage.setItem(EDITORIAL_DEEP_LLM_STORAGE_KEY, 'true');
        localStorage.setItem(EDITORIAL_AUTOPILOT_STORAGE_KEY, 'false');
        const h = mountHook(useEditorialHarnessState);
        expect(h().editorialUseDeepLLM).toBe(true);
        expect(h().enableEditorialHarnessAutopilot).toBe(false);
        act(() => {
            h().setEditorialUseDeepLLM(false);
            h().setEnableEditorialHarnessAutopilot(true);
        });
        expect(localStorage.getItem(EDITORIAL_DEEP_LLM_STORAGE_KEY)).toBe('false');
        expect(localStorage.getItem(EDITORIAL_AUTOPILOT_STORAGE_KEY)).toBe('true');
    });
});
