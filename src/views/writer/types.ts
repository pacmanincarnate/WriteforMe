/**
 * @module views/writer/types
 * Shared TypeScript interfaces for the Scene Studio (`view === 'writer'`).
 */

import type React from 'react';
import type {
    BeatItem,
    ProseEntry,
    SceneBlueprint,
    SlopAuditReport,
    Story
} from '@/types';

export interface WriterTargetEpistemicDelta {
    holder: string;
    proposition_id: string;
    operation: string;
    to_stance: string;
    to_confidence: number;
    trigger_clue: string;
    proposition?: string;
}

export interface WriterPlotCommitmentObject {
    description?: string;
    exact_terms?: string;
    consequence?: string;
    [key: string]: unknown;
}

export type WriterPlotCommitment = string | WriterPlotCommitmentObject;

export interface WriterRelationshipChange {
    from?: string;
    to?: string;
    feeling?: string;
    trigger?: string;
    [key: string]: unknown;
}

export interface WriterCharacterStateFields {
    name?: string;
    character?: string;
    location?: string;
    emotional_state?: string;
    physical_state?: string;
    unresolved_tension?: string;
    holding?: string;
    immediate_objective?: string;
    epistemic_knowledge?: string;
    [key: string]: unknown;
}

export interface WriterActiveCharacterState {
    name: string;
    state: WriterCharacterStateFields;
}

export interface WriterSceneRecord extends SceneBlueprint {
    user_edited?: boolean;
    is_bridge_scene?: boolean;
    transition_jump?: string;
    scene_events?: string;
    exit_hook?: string;
    surface_activity?: string;
    the_hinge_moment?: string;
    main_character_heart?: string;
    other_character_heart?: string;
    atmospheric_overview?: string;
    modality_hand?: string[];
    entrance_conditions?: string;
    entrance_condition?: string;
    exit_conditions?: string;
    exit_condition?: string;
    micro_conflict_and_tactic?: string;
    sensory_palette?: string;
    scene_pacing_tempo?: string;
    character_voice_directives?: string;
    epistemic_friction_level?: string;
    activation_contexts?: string[] | string;
    target_epistemic_deltas?: Array<Partial<WriterTargetEpistemicDelta>>;
    plot_commitments?: WriterPlotCommitment[] | string;
    relationship_changes?: Array<WriterRelationshipChange | string>;
    relationship_shifts?: Array<WriterRelationshipChange | string>;
}

export interface WriterProseStaleInfo {
    reason?: string;
    changedFields?: string[];
}

export interface WriterProseRecord extends ProseEntry {
    failed?: boolean;
    critique?: string;
    user_edited?: boolean;
    staleInfo?: WriterProseStaleInfo;
}

export interface WriterBeatRecord extends BeatItem {
    beat_structure?: { pivot?: string; start?: string; [key: string]: unknown } | string;
    pivot?: string;
    character_intent?: unknown;
    atmosphere_and_feel?:
        | string
        | {
              mood?: string;
              sensory_anchors?: string[] | string;
              cognitive_sensory_filters?: string[] | string;
              subtext?: string;
              [key: string]: unknown;
          };
    epistemic_boundaries?: unknown;
    authorial_intent?: unknown;
    tactic?: string;
    reactor?: string;
    participants?: string;
    char_A_action?: string;
    char_B_reaction?: string;
    description?: string;
    action_description?: string;
    anchor?: string;
    power_shift?: string;
    emotional_shift?: string;
    character?: string;
    target_character?: string;
    characters_involved?: string[];
}

export interface WriterStory extends Story {
    character_states?: Record<string, WriterCharacterStateFields>;
    slop_allowlist?: string[];
}

export interface SceneBlueprintDraft {
    title: string;
    scene_type: string;
    pov_character: string;
    setting: string;
    transition_jump: string;
    dominant_narrative_mode: string;
    characters_present: string[];
    objective: string;
    scene_events: string;
    value_shift_start: string;
    value_shift_end: string;
    exit_hook: string;
    surface_activity: string;
    the_hinge_moment: string;
    main_character_heart: string;
    other_character_heart: string;
    atmospheric_overview: string;
    modality_hand: string[];
    entrance_conditions: string;
    exit_conditions: string;
    micro_conflict_and_tactic: string;
    sensory_palette: string;
    scene_pacing_tempo: string;
    character_voice_directives: string;
    epistemic_friction_level: string;
    activation_contexts_text: string;
    target_epistemic_deltas: WriterTargetEpistemicDelta[];
    plot_commitments: WriterPlotCommitment[];
    relationship_changes: WriterRelationshipChange[];
}

export interface WriterAudioStatus {
    status: 'none' | 'ready' | 'stale' | 'error' | string;
    [key: string]: unknown;
}

export type WriterOpenEditModalFn = (
    title: string,
    currentValue: string,
    onSave: (val: string) => void
) => void;

export type WriterShowToastFn = (message: string, type?: string) => void;

export interface WriterViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: WriterStory;
    storyRef: React.MutableRefObject<WriterStory>;
    setStory: React.Dispatch<React.SetStateAction<WriterStory>>;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    setSelectedScene: (sceneIdx: number | null) => void;
    activeSceneDropdown: string | null;
    setActiveSceneDropdown: React.Dispatch<React.SetStateAction<string | null>>;
    sceneWorkspaceTab: string;
    setSceneWorkspaceTab: (tab: string) => void;
    isSceneSplitView: boolean;
    setIsSceneSplitView: React.Dispatch<React.SetStateAction<boolean>>;
    setIsBlueprintCollapsed: (collapsed: boolean) => void;
    blueprintActiveTab: string;
    setBlueprintActiveTab: (tab: string) => void;
    isEditingSceneBlueprint: boolean;
    setIsEditingSceneBlueprint: (editing: boolean) => void;
    sceneBlueprintDraft: SceneBlueprintDraft | null;
    setSceneBlueprintDraft: React.Dispatch<React.SetStateAction<SceneBlueprintDraft | null>>;
    isEditingProseInline: boolean;
    setIsEditingProseInline: (editing: boolean) => void;
    inlineProseDraft: string;
    setInlineProseDraft: (draft: string) => void;
    allNarrativeModes: Record<string, unknown>;
    enableNarrativeLenses: boolean;
    setEnableNarrativeLenses: (enabled: boolean) => void;
    collapsedBeats: Record<string, boolean>;
    toggleBeats: (beatKey: string) => void;
    expandedBeatAnalysis: Record<string, boolean>;
    toggleBeatAnalysis: (beatId: string) => void;
    loading: boolean;
    loadingImages: Record<string, boolean>;
    loadedImages: Record<string, string>;
    isExportingSceneAudio: boolean;
    isRegeneratingSceneAudio: boolean;
    isDirectingVoices: boolean;
    isAnyAudioPlaying: boolean;
    isRunningEditorialHarness: boolean;
    isRunningManualSlopClean: boolean;
    writerSlopAudit: SlopAuditReport | null;
    slopAuditDrawerOpen: boolean;
    setSlopAuditDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    slopAuditFilter: string;
    setSlopAuditFilter: (filter: string) => void;
    slopAllowlistExpanded: boolean;
    setSlopAllowlistExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    getSceneAudioStatus: (seqIdx: number, sceneIdx: number) => WriterAudioStatus;
    updateSceneBlueprint: (seqIdx: number, sceneIdx: number, updates: Record<string, unknown>) => void;
    updateCharacterStateForScene: (charName: string, updates: Record<string, unknown>) => void;
    handleAutoGenerateScene: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { forceFullRewrite?: boolean }
    ) => void | Promise<void>;
    handleCascadeSceneToProse: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleDismissStaleProse: (seqIdx: number, sceneIdx: number) => void;
    handleDownloadSceneAudio: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleRegenerateSceneAudio: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleDirectSceneVoices: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleAddBeat: (seqIdx: number, sceneIdx: number, insertAfterIndex?: number) => void;
    handleBeatChange: (
        seqIdx: number,
        sceneIdx: number,
        beatIdx: number,
        field: string,
        val: string
    ) => void;
    handleDeleteBeat: (seqIdx: number, sceneIdx: number, beatIdx: number) => void;
    generateSceneImage: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    generateBeatImage: (seqIdx: number, sceneIdx: number, beatIdx: number) => void | Promise<void>;
    deleteSceneImage: (seqIdx: number, sceneIdx: number) => void;
    deleteBeatImage: (seqIdx: number, sceneIdx: number, beatIdx: number) => void;
    copyFullScene: () => void;
    enterReaderMode: (seqIdx?: number, sceneIdx?: number) => void;
    playSceneAudio: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { autoplay?: boolean; follow?: boolean }
    ) => void | Promise<void>;
    stopAllAudioPlayback: () => void;
    runAutonomousEditorialHarness: (opts: {
        mode: string;
        scopeSceneId: string;
        useLLM?: boolean;
    }) => void | Promise<void>;
    setEditorialScopeSceneId: (sceneId: string) => void;
    handleRunManualSlopClean: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleAddStoryAllowlistItem: (term: string) => void;
    handleRemoveStoryAllowlistItem: (term: string) => void;
    openEditModal: WriterOpenEditModalFn;
    openCritiqueModal: (title: string, critique: string) => void;
    showToast: WriterShowToastFn;
}

export interface WriterBlueprintPaneProps {
    isVisible: boolean;
    selectedSequence: number;
    selectedScene: number;
    currentScene: WriterSceneRecord;
    activeStates: WriterActiveCharacterState[];
    allModalityNames: string[];
    parsedVS: { start_state: string; end_state: string };
    blueprintActiveTab: string;
    setBlueprintActiveTab: (tab: string) => void;
    isEditingSceneBlueprint: boolean;
    setIsEditingSceneBlueprint: (editing: boolean) => void;
    sceneBlueprintDraft: SceneBlueprintDraft | null;
    setSceneBlueprintDraft: React.Dispatch<React.SetStateAction<SceneBlueprintDraft | null>>;
    enterBlueprintEditMode: (
        targetTab?: string | null,
        mutateDraft?: ((base: SceneBlueprintDraft) => SceneBlueprintDraft) | null
    ) => void;
    handleSaveBlueprintDraft: () => void;
    updateSceneBlueprint: (seqIdx: number, sceneIdx: number, updates: Record<string, unknown>) => void;
    updateCharacterStateForScene: (charName: string, updates: Record<string, unknown>) => void;
    openEditModal: WriterOpenEditModalFn;
}

export interface WriterManuscriptPaneProps {
    isVisible: boolean;
    writerBeatKey: string;
    selectedSequence: number;
    selectedScene: number;
    story: WriterStory;
    storyRef: React.MutableRefObject<WriterStory>;
    setStory: React.Dispatch<React.SetStateAction<WriterStory>>;
    isInspectorMode: boolean;
    collapsedBeats: Record<string, boolean>;
    toggleBeats: (beatKey: string) => void;
    expandedBeatAnalysis: Record<string, boolean>;
    toggleBeatAnalysis: (beatId: string) => void;
    loading: boolean;
    loadingImages: Record<string, boolean>;
    loadedImages: Record<string, string>;
    isRunningManualSlopClean: boolean;
    writerSlopAudit: SlopAuditReport | null;
    slopAuditDrawerOpen: boolean;
    setSlopAuditDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    slopAuditFilter: string;
    setSlopAuditFilter: (filter: string) => void;
    slopAllowlistExpanded: boolean;
    setSlopAllowlistExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    isEditingProseInline: boolean;
    setIsEditingProseInline: (editing: boolean) => void;
    inlineProseDraft: string;
    setInlineProseDraft: (draft: string) => void;
    handleAutoGenerateScene: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { forceFullRewrite?: boolean }
    ) => void | Promise<void>;
    handleAddBeat: (seqIdx: number, sceneIdx: number, insertAfterIndex?: number) => void;
    handleBeatChange: (
        seqIdx: number,
        sceneIdx: number,
        beatIdx: number,
        field: string,
        val: string
    ) => void;
    handleDeleteBeat: (seqIdx: number, sceneIdx: number, beatIdx: number) => void;
    generateSceneImage: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    generateBeatImage: (seqIdx: number, sceneIdx: number, beatIdx: number) => void | Promise<void>;
    deleteSceneImage: (seqIdx: number, sceneIdx: number) => void;
    deleteBeatImage: (seqIdx: number, sceneIdx: number, beatIdx: number) => void;
    handleRunManualSlopClean: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleAddStoryAllowlistItem: (term: string) => void;
    handleRemoveStoryAllowlistItem: (term: string) => void;
    openEditModal: WriterOpenEditModalFn;
    openCritiqueModal: (title: string, critique: string) => void;
    showToast: WriterShowToastFn;
}
