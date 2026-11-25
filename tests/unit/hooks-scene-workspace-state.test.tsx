import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
    usePipelineViewState,
    useRagPanelState,
    useSceneWorkspaceState,
    type UseSceneWorkspaceStateParams,
    type UseSceneWorkspaceStateResult
} from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const containers: HTMLElement[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
    while (containers.length) containers.pop()?.remove();
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

function mountWorkspace(initial: UseSceneWorkspaceStateParams) {
    let latest: UseSceneWorkspaceStateResult | null = null;
    function Probe(props: UseSceneWorkspaceStateParams): null {
        latest = useSceneWorkspaceState(props);
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe {...initial} />));
    return {
        current: () => latest as unknown as UseSceneWorkspaceStateResult,
        rerender: (next: UseSceneWorkspaceStateParams) => act(() => root.render(<Probe {...next} />))
    };
}

const at = (selectedSequence: number | null, selectedScene: number | null, view = 'writer') => ({
    selectedSequence,
    selectedScene,
    view
});

function openEverything(h: ReturnType<typeof mountWorkspace>) {
    act(() => {
        h.current().setIsEditingProseInline(true);
        h.current().setInlineProseDraft('half a sentence');
        h.current().setIsEditingSceneBlueprint(true);
        h.current().setSceneBlueprintDraft({ title: 'draft' });
        h.current().setActiveSceneDropdown('write');
        h.current().setSlopAuditDrawerOpen(true);
        h.current().setIsWriterFocusMode(true);
        h.current().setIsSceneSplitView(true);
        h.current().setSceneWorkspaceTab('manuscript');
        h.current().setBlueprintActiveTab('continuity');
        h.current().setSlopAuditFilter('hard');
    });
}

describe('useSceneWorkspaceState', () => {
    it('starts closed on the blueprint tab', () => {
        expect(mountWorkspace(at(0, 0)).current()).toMatchObject({
            isWriterFocusMode: false,
            isEditingProseInline: false,
            inlineProseDraft: '',
            blueprintActiveTab: 'narrative',
            isBlueprintCollapsed: false,
            isEditingSceneBlueprint: false,
            sceneBlueprintDraft: null,
            sceneWorkspaceTab: 'blueprint',
            isSceneSplitView: false,
            activeSceneDropdown: null,
            slopAuditDrawerOpen: false,
            slopAuditFilter: 'all',
            isRunningManualSlopClean: false,
            slopAllowlistExpanded: false
        });
    });

    it.each([
        ['another scene', at(0, 1)],
        ['another sequence', at(1, 0)],
        ['another view', at(0, 0, 'reader')]
    ])('moving to %s closes editors, the dropdown and the drawer but keeps layout choices', (_label, next) => {
        const h = mountWorkspace(at(0, 0));
        openEverything(h);
        h.rerender(next);
        expect(h.current()).toMatchObject({
            isEditingProseInline: false,
            isEditingSceneBlueprint: false,
            sceneBlueprintDraft: null,
            activeSceneDropdown: null,
            slopAuditDrawerOpen: false,
            // Not reset: layout and filter preferences, and the (now unused) inline draft text.
            isWriterFocusMode: true,
            isSceneSplitView: true,
            sceneWorkspaceTab: 'manuscript',
            blueprintActiveTab: 'continuity',
            slopAuditFilter: 'hard',
            inlineProseDraft: 'half a sentence'
        });
    });

    it('re-rendering on the same scene leaves open editors alone', () => {
        const h = mountWorkspace(at(0, 0));
        openEverything(h);
        h.rerender(at(0, 0));
        expect(h.current()).toMatchObject({ isEditingProseInline: true, activeSceneDropdown: 'write', slopAuditDrawerOpen: true });
    });

    it('closes the dropdown on Escape and on a click outside its container, not inside', () => {
        const inside = document.createElement('div');
        inside.className = 'scene-action-tiles-wrap';
        const button = document.createElement('button');
        inside.appendChild(button);
        const outside = document.createElement('div');
        document.body.append(inside, outside);
        containers.push(inside, outside);

        const h = mountWorkspace(at(0, 0));
        act(() => h.current().setActiveSceneDropdown('audio'));
        act(() => {
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(h.current().activeSceneDropdown).toBe('audio');
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        });
        expect(h.current().activeSceneDropdown).toBe('audio');
        act(() => {
            outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(h.current().activeSceneDropdown).toBeNull();

        act(() => h.current().setActiveSceneDropdown('write'));
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(h.current().activeSceneDropdown).toBeNull();
    });
});

describe('panel state hooks', () => {
    it('usePipelineViewState starts on the detailed stage view with no filter', () => {
        const h = mountHook(usePipelineViewState);
        expect(h()).toMatchObject({
            inspectedStepId: null,
            pipelineViewMode: 'detailed',
            pipelineDisplayMode: 'stage',
            activePipelineWork: null,
            audioAutopilotProgress: null,
            logFilter: 'all'
        });
        act(() => h().setPipelineDisplayMode('audio'));
        expect(h().pipelineDisplayMode).toBe('audio');
    });

    it('useRagPanelState starts idle with an empty test query', () => {
        const h = mountHook(useRagPanelState);
        expect(h()).toMatchObject({
            ragStatus: 'idle',
            isRebuildingRag: false,
            ragTestQuery: '',
            ragTestResults: [],
            ragTestLoading: false
        });
        act(() => h().setRagStatus('ready'));
        expect(h().ragStatus).toBe('ready');
    });
});
