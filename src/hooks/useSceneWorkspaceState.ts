/**
 * @module hooks/useSceneWorkspaceState
 * UI state of the Writer scene workspace: focus mode, inline prose editing, the blueprint panel
 * (tab, collapse, edit draft), the blueprint / manuscript tab and split view, the scene action
 * dropdown, and the slop audit drawer. Open editors, the dropdown and the drawer are closed
 * whenever the user moves to another scene or view. Extracted from the legacy shell in Phase 7.
 */

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type Setter<T> = Dispatch<SetStateAction<T>>;

/** 'write' | 'audio' | null */
export type SceneActionDropdown = string | null;

/** The dropdown stays open for clicks inside an element with this class. */
export const SCENE_ACTION_DROPDOWN_CONTAINER_SELECTOR = '.scene-action-tiles-wrap';

export interface UseSceneWorkspaceStateParams {
    selectedSequence: number | null;
    selectedScene: number | null;
    view: string;
}

export interface UseSceneWorkspaceStateResult {
    isWriterFocusMode: boolean;
    setIsWriterFocusMode: Setter<boolean>;
    isEditingProseInline: boolean;
    setIsEditingProseInline: Setter<boolean>;
    inlineProseDraft: string;
    setInlineProseDraft: Setter<string>;
    /** 'narrative' | 'sandbox' | 'atmosphere' | 'continuity' */
    blueprintActiveTab: string;
    setBlueprintActiveTab: Setter<string>;
    isBlueprintCollapsed: boolean;
    setIsBlueprintCollapsed: Setter<boolean>;
    isEditingSceneBlueprint: boolean;
    setIsEditingSceneBlueprint: Setter<boolean>;
    sceneBlueprintDraft: Record<string, unknown> | null;
    setSceneBlueprintDraft: Setter<Record<string, unknown> | null>;
    /** 'blueprint' | 'manuscript' */
    sceneWorkspaceTab: string;
    setSceneWorkspaceTab: Setter<string>;
    /** Desktop side-by-side view of blueprint and manuscript. */
    isSceneSplitView: boolean;
    setIsSceneSplitView: Setter<boolean>;
    activeSceneDropdown: SceneActionDropdown;
    setActiveSceneDropdown: Setter<SceneActionDropdown>;
    slopAuditDrawerOpen: boolean;
    setSlopAuditDrawerOpen: Setter<boolean>;
    /** 'all' | 'hard' | 'flag' | 'closer' | 'rhetoric' */
    slopAuditFilter: string;
    setSlopAuditFilter: Setter<string>;
    isRunningManualSlopClean: boolean;
    setIsRunningManualSlopClean: Setter<boolean>;
    slopAllowlistExpanded: boolean;
    setSlopAllowlistExpanded: Setter<boolean>;
}

export function useSceneWorkspaceState({
    selectedSequence,
    selectedScene,
    view
}: UseSceneWorkspaceStateParams): UseSceneWorkspaceStateResult {
    const [slopAuditDrawerOpen, setSlopAuditDrawerOpen] = useState(false);
    const [slopAuditFilter, setSlopAuditFilter] = useState('all');
    const [isRunningManualSlopClean, setIsRunningManualSlopClean] = useState(false);
    const [slopAllowlistExpanded, setSlopAllowlistExpanded] = useState(false);

    const [isWriterFocusMode, setIsWriterFocusMode] = useState(false);
    const [isEditingProseInline, setIsEditingProseInline] = useState(false);
    const [inlineProseDraft, setInlineProseDraft] = useState('');

    const [blueprintActiveTab, setBlueprintActiveTab] = useState('narrative');
    const [isBlueprintCollapsed, setIsBlueprintCollapsed] = useState(false);
    const [isEditingSceneBlueprint, setIsEditingSceneBlueprint] = useState(false);
    const [sceneBlueprintDraft, setSceneBlueprintDraft] = useState<Record<string, unknown> | null>(null);
    const [sceneWorkspaceTab, setSceneWorkspaceTab] = useState('blueprint');
    const [isSceneSplitView, setIsSceneSplitView] = useState(false);
    const [activeSceneDropdown, setActiveSceneDropdown] = useState<SceneActionDropdown>(null);

    // Leaving a scene or view abandons unsaved inline edits and closes transient panels.
    useEffect(() => {
        setIsEditingProseInline(false);
        setIsEditingSceneBlueprint(false);
        setSceneBlueprintDraft(null);
        setActiveSceneDropdown(null);
        setSlopAuditDrawerOpen(false);
    }, [selectedSequence, selectedScene, view]);

    // An open scene action dropdown closes on Escape or a click outside its container.
    useEffect(() => {
        if (!activeSceneDropdown) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target?.closest?.(SCENE_ACTION_DROPDOWN_CONTAINER_SELECTOR)) {
                setActiveSceneDropdown(null);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setActiveSceneDropdown(null);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeSceneDropdown]);

    return {
        isWriterFocusMode,
        setIsWriterFocusMode,
        isEditingProseInline,
        setIsEditingProseInline,
        inlineProseDraft,
        setInlineProseDraft,
        blueprintActiveTab,
        setBlueprintActiveTab,
        isBlueprintCollapsed,
        setIsBlueprintCollapsed,
        isEditingSceneBlueprint,
        setIsEditingSceneBlueprint,
        sceneBlueprintDraft,
        setSceneBlueprintDraft,
        sceneWorkspaceTab,
        setSceneWorkspaceTab,
        isSceneSplitView,
        setIsSceneSplitView,
        activeSceneDropdown,
        setActiveSceneDropdown,
        slopAuditDrawerOpen,
        setSlopAuditDrawerOpen,
        slopAuditFilter,
        setSlopAuditFilter,
        isRunningManualSlopClean,
        setIsRunningManualSlopClean,
        slopAllowlistExpanded,
        setSlopAllowlistExpanded
    };
}
