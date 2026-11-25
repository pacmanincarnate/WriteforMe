/**
 * @module views/pipeline/types
 * Shared TypeScript interfaces for the Production Pipeline & Control Center (`view === 'pipeline'`).
 */

import type {
    HumanLoadingStepStatus,
    NovelProgressEstimate,
    RecentStoryArtifacts,
    StoryStats,
    VerboseLogEntry
} from '@/domain/story';
import type { CastMember, Story } from '@/types';

export interface PipelineActiveWork {
    phase?: number;
    actNumber?: number;
    seqNumber?: number;
    seqTitle?: string;
    seqIdx?: number;
    sceneLabel?: string;
    sceneTitle?: string;
    sceneIdx?: number;
    characterName?: string;
    itemIndex?: number;
    itemTotal?: number;
    title?: string;
    subStep?: string;
    elementType?: string;
    [key: string]: unknown;
}

export interface PipelineNextUp {
    elementType?: string;
    seqIdx?: number;
    sceneIdx?: number;
    title?: string;
    detail?: string;
    [key: string]: unknown;
}

export interface PipelinePromptLogEntry extends VerboseLogEntry {
    id: string | number;
    isAudio?: boolean;
    prompt?: string;
    thinkingTokens?: number | null;
    reasoningTokensUsed?: number | null;
    responseTokens?: number | null;
}

export interface AudioSceneMatrixItem {
    seqIdx: number;
    sceneIdx: number;
    label: string;
    title: string;
    status: string;
    durationSec: number;
}

export interface AudioSequenceGroup {
    seqIdx: number;
    number: number;
    title: string;
    scenes: AudioSceneMatrixItem[];
}

export interface AudioCompletedArtifact {
    seqIdx: number;
    sceneIdx: number;
    seqTitle: string;
    label: string;
    sceneTitle: string;
    durationSec: number;
    sizeBytes: number;
    cueCount: number;
}

export interface AudioAutopilotErrorItem {
    sceneLabel?: string;
    message?: string;
    timestamp?: string;
}

export interface AudioAutopilotProgressState {
    currentSceneLabel?: string;
    stageLabel?: string;
    stagePct?: number;
    stageMessage?: string;
    currentSceneOrder?: number;
    totalEligibleScenes?: number;
    currentSeqIdx?: number | null;
    currentSeqTitle?: string;
    currentSceneTitle?: string;
    activeSpeaker?: string;
    chunkCurrent?: number;
    chunkTotal?: number;
    generatedScenes?: number;
    alreadyCachedScenes?: number;
    failedScenes?: number;
    lastCompletedScene?: AudioCompletedArtifact | null;
    recentErrors?: AudioAutopilotErrorItem[];
    [key: string]: unknown;
}

export interface PipelineAudioProgress {
    overallPct: number;
    totalDrafted: number;
    readyCount: number;
    staleCount: number;
    totalDurationSec: number;
    backendLabel: string;
    castCount: number;
    voicedCastCount: number;
    narratorReady: boolean;
    allAudioComplete: boolean;
    nextAudioScene?: {
        seqIdx: number;
        seqTitle: string;
        label: string;
        title: string;
        status: string;
    } | null;
    latestSavedAudio?: AudioCompletedArtifact | null;
    sequences: AudioSequenceGroup[];
    stages: Record<string, string>;
}

export interface PipelineStory extends Story {
    core_thematic_argument?: string;
    status_quo?: string;
    [key: string]: unknown;
}

export interface ExtendedCastArtifact extends CastMember {
    story_role?: string;
    corner_role?: string;
    archetype?: string;
    voice_sample?: string;
    sample_dialogue?: string;
}

export interface PipelineViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: PipelineStory;
    setSelectedSequence: (seqIdx: number | null) => void;
    setSelectedScene: (sceneIdx: number | null) => void;
    setSettingsTab: (tab: string) => void;
    loading: boolean;
    loadingStep: string;
    currentPipelineStep: number | null;
    inspectedStepId: number | null;
    setInspectedStepId: (stepId: number | null) => void;
    pipelineViewMode: 'detailed' | 'simplified' | string;
    setPipelineViewMode: (mode: string) => void;
    pipelineDisplayMode: 'stage' | 'audio' | 'graph' | string;
    setPipelineDisplayMode: (mode: string) => void;
    activePipelineWork: PipelineActiveWork | null;
    promptLog: PipelinePromptLogEntry[];
    continuousAutopilot: boolean;
    handleAutopilot: (opts?: { fromSetup?: boolean }) => void | Promise<void>;
    toggleContinuousAutopilot: () => void;
    novelProgress: NovelProgressEstimate;
    audioProgress: PipelineAudioProgress;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    audioAutopilotProgress: AudioAutopilotProgressState | null;
    handleToggleAudioAutopilot: () => void;
    isAnyAudioPlaying: boolean;
    playSceneAudio: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { autoplay?: boolean; follow?: boolean }
    ) => void | Promise<void>;
    stopAllAudioPlayback: () => void;
    enterReaderMode: (seqIdx?: number, sceneIdx?: number) => void;
    openLogDetailModal: (kind: string, entry: PipelinePromptLogEntry) => void;
    copyVerboseLogToClipboard: (formatted: string, showToast: (msg: string, type?: string) => void) => void;
    showToast: (message: string, type?: string) => void;
}

export interface PipelineNovelModeProps {
    story: PipelineStory;
    activeInfo: HumanLoadingStepStatus;
    stats: StoryStats;
    artifacts: RecentStoryArtifacts;
    activeWorkBreadcrumb: string;
    isNovelGenerating: boolean;
    activePhaseNum: number;
    loadingStep: string;
    activePipelineWork: PipelineActiveWork | null;
    promptLog: PipelinePromptLogEntry[];
    continuousAutopilot: boolean;
    novelProgress: NovelProgressEstimate;
    audioProgress: PipelineAudioProgress;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    inspectActiveElement: () => void;
    inspectNextUpElement: () => void;
    handleAutopilot: (opts?: { fromSetup?: boolean }) => void | Promise<void>;
    toggleContinuousAutopilot: () => void;
    handleToggleAudioAutopilot: () => void;
    enterReaderMode: (seqIdx?: number, sceneIdx?: number) => void;
    setPipelineDisplayMode: (mode: string) => void;
    setSelectedSequence: (seqIdx: number | null) => void;
    setSelectedScene: (sceneIdx: number | null) => void;
    setView: (viewId: string) => void;
}

export interface PipelineAudioModeProps {
    story: PipelineStory;
    audioProgress: PipelineAudioProgress;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    audioAutopilotProgress: AudioAutopilotProgressState | null;
    continuousAutopilot: boolean;
    promptLog: PipelinePromptLogEntry[];
    isAnyAudioPlaying: boolean;
    handleToggleAudioAutopilot: () => void;
    enterReaderMode: (seqIdx?: number, sceneIdx?: number) => void;
    playSceneAudio: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { autoplay?: boolean; follow?: boolean }
    ) => void | Promise<void>;
    stopAllAudioPlayback: () => void;
    setPipelineDisplayMode: (mode: string) => void;
    setSelectedSequence: (seqIdx: number | null) => void;
    setSelectedScene: (sceneIdx: number | null) => void;
    setSettingsTab: (tab: string) => void;
    setView: (viewId: string) => void;
}

export interface PipelineGraphModeProps {
    loading: boolean;
    currentPipelineStep: number | null;
    inspectedStepId: number | null;
    setInspectedStepId: (stepId: number | null) => void;
    pipelineViewMode: string;
    promptLog: PipelinePromptLogEntry[];
    setView: (viewId: string) => void;
    openLogDetailModal: (kind: string, entry: PipelinePromptLogEntry) => void;
    copyVerboseLogToClipboard: (formatted: string, showToast: (msg: string, type?: string) => void) => void;
    showToast: (message: string, type?: string) => void;
}
