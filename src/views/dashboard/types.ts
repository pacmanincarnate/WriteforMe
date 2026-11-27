/**
 * @module views/dashboard/types
 * Shared TypeScript interfaces for the Story Overview Dashboard (`view === 'dashboard'`).
 */

import type React from 'react';
import type { StoryResetStageKey } from '@/domain/lifecycle';
import type { StoryMemory } from '@/types';

export interface DashboardCastMember {
    id?: string;
    name: string;
    role?: string;
    corner_role?: string;
    voice_sample?: string;
    details?: {
        deep_profile?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface DashboardThreadItem {
    id: string;
    name: string;
    description: string;
    [key: string]: unknown;
}

export interface DashboardCharacterArc {
    char_id?: string;
    corner_role?: string;
    description?: string;
    lie_believed?: string;
    truth_needed?: string;
    arc_catalyst?: string;
    web_pressure?: string;
    [key: string]: unknown;
}

export interface DashboardContinuityFact {
    key: string;
    value: string;
    category?: string;
    source_scene?: string;
    status?: string;
    created_at?: number;
    [key: string]: unknown;
}

export interface DashboardClueEntry {
    id?: string;
    sequence_number?: number;
    behavioral_directive?: string;
    directive?: string;
    seeded_in_prose?: boolean;
    [key: string]: unknown;
}

export interface DashboardSecretEntry {
    id?: string;
    title?: unknown;
    truth?: unknown;
    description?: unknown;
    status?: string;
    category?: string;
    reveal_anchor?: {
        act_number?: number;
        sequence_number?: number;
    };
    reveal_target_act?: number;
    reveal_target_sequence?: number;
    cover_story?:
        | string
        | {
              public_belief?: string;
              character_masks?: Record<
                  string,
                  | string
                  | {
                        apparent_flaw?: string;
                        trait_mask?: string;
                        history_mask?: string;
                        public_interview_voice?: string;
                    }
                  | null
                  | undefined
              >;
          };
    public_cover_story?: string;
    clue_schedule?: DashboardClueEntry[];
    clues?: DashboardClueEntry[];
    [key: string]: unknown;
}

export interface DashboardEpistemicProposition {
    id: string;
    claim_text?: string;
    subject_id?: string;
    predicate?: string;
    object_id?: string;
    objective_truth?: string;
    world_valid_from_scene?: string;
    world_valid_to_scene?: string;
    [key: string]: unknown;
}

export interface DashboardEpistemicBeliefEdge {
    holder_id: string;
    proposition_id: string;
    stance?: string;
    confidence?: number;
    source_type?: string;
    source_agent_id?: string;
    acquired_at_scene?: string;
    invalidated_at_scene?: string;
    [key: string]: unknown;
}

export interface DashboardStory {
    id: string;
    title?: string;
    concept?: string;
    author_note?: string;
    status_quo?: string;
    story_so_far?: string;
    story_memory?: StoryMemory;
    writing_mode?: string;
    coverStyle?: number;
    book_type?: string;
    target_word_count?: number;
    core_thematic_argument?: string;
    inciting_incident?: string;
    starting_value_state?: string;
    ending_value_state?: string;
    major_surprises_and_twists?: string;
    heart_of_the_dilemma?: string;
    world_primer?: string | null;
    style?: {
        genre?: string;
        primary_engine?: string;
        tropes_played_straight?: string;
        tropes_subverted?: string;
        boundaries?: string;
        mood?: string;
        authorial_triangulation?: string;
        sensory_directive?: string;
        writing_guide?: string;
        focalizer_bias?: string;
        thematic_lexicon?: string;
        syntactic_rhythm?: string;
        anti_patterns?: string;
        [key: string]: unknown;
    };
    acts?: Array<Record<string, unknown>>;
    sequences?: Array<{ number?: number; [key: string]: unknown }>;
    scenes?: Record<string, Array<{ id?: string; [key: string]: unknown }>>;
    prose?: Record<
        string,
        | string
        | { final?: string; draft?: string; prose?: string; [key: string]: unknown }
        | null
        | undefined
    >;
    cast?: DashboardCastMember[];
    threads?: DashboardThreadItem[];
    character_arcs?: DashboardCharacterArc[];
    continuity_ledger?: DashboardContinuityFact[];
    secret_vault?: DashboardSecretEntry[];
    lore?: unknown[];
    epistemic_graph?: {
        propositions?: DashboardEpistemicProposition[] | Record<string, DashboardEpistemicProposition>;
        first_order_edges?: DashboardEpistemicBeliefEdge[];
        holds_belief_edges?: DashboardEpistemicBeliefEdge[];
        cascade_log?: Array<Record<string, unknown>>;
        provenance_log?: Array<Record<string, unknown>>;
        sleep_cycle_log?: Array<Record<string, unknown>>;
        [key: string]: unknown;
    };
    length_control?: {
        sequences?: Record<
            number,
            {
                rangeMin?: number;
                rangeMax?: number;
                floor?: number;
                justification?: string;
                driftState?: string;
            }
        >;
    };
    generation_ranges?: {
        scenes_per_sequence?: {
            min?: number;
            max?: number;
            justification?: string;
        };
    };
    editorial_harness?: {
        summary?: {
            meanDivergence?: number | string;
            verifiedTicketsCount?: number;
            committedTransactions?: number;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface DashboardRequestConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm?: () => void;
}

export interface DashboardFormField {
    key: string;
    label: string;
    placeholder?: string;
    type?: string;
    defaultValue?: string;
    options?: string[];
    rows?: number;
    required?: boolean;
}

export interface DashboardOpenFormOptions {
    title: string;
    subtitle?: string;
    submitLabel?: string;
    fields: DashboardFormField[];
    onSubmit?: (data: Record<string, string>) => void;
}

export interface DashboardAudioSummary {
    readyCount: number;
    totalDrafted: number;
    staleCount: number;
}

export interface DashboardViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: DashboardStory;
    setStory: (updaterOrValue: DashboardStory | ((prev: DashboardStory) => DashboardStory)) => void;
    theme: string;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    loadedImages: {
        cover?: string | null;
        portraits?: Record<string, string | null>;
        [key: string]: unknown;
    };
    loadingCover: boolean;
    coverUploadInputRef: React.RefObject<HTMLInputElement>;
    generateCoverImage: () => void | Promise<void>;
    handleCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    deleteCoverImage: () => void | Promise<void>;
    storyAudioSummary: DashboardAudioSummary;
    availableSceneAudioMap: Record<string, unknown>;
    readingProgress: {
        sequenceIndex?: number;
        [key: string]: unknown;
    };
    enterReaderMode: () => void;
    loading: boolean;
    loadingStep: string;
    initializingStoryId: string | null;
    continuousAutopilot: boolean;
    isRunningEditorialHarness: boolean;
    setEditorialScopeSceneId: (sceneId: string) => void;
    runAutonomousEditorialHarness: (opts: {
        mode: string;
        scopeSceneId: string;
        useLLM?: boolean;
    }) => void | Promise<void>;
    handleExportEpub: () => void | Promise<void>;
    handleDownloadStoryAudio: () => void | Promise<void>;
    handleExportAudioDramaTxt: () => void | Promise<void>;
    isExportingStoryAudio: boolean;
    isExportingSequenceAudio: boolean;
    isExportingSceneAudio: boolean;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    handleToggleAudioAutopilot: () => void;
    handleResetStoryStage: (stage: StoryResetStageKey) => void;
    initStory: (
        isAutopilotOrEvent?: boolean,
        options?: Record<string, unknown>
    ) => void | Promise<void>;
    generateStoryArc: () => void | Promise<void>;
    rebuildStorySoFar?: () => void | Promise<void>;
    /** Starts the next book of the series from this story. Absent hides the action. */
    startNextBook?: (input: { title?: string; concept: string; seriesTitle?: string }) => void | Promise<unknown>;
    epistemicViewTab: string;
    setEpistemicViewTab: (tab: string) => void;
    epistemicScrubberCoord: string;
    setEpistemicScrubberCoord: (coord: string) => void;
    epistemicFilterChar: string;
    setEpistemicFilterChar: (charId: string) => void;
    epistemicSearchQuery: string;
    setEpistemicSearchQuery: (query: string) => void;
    setEditingPropModal: (modalState: Record<string, unknown>) => void;
    setEditingBeliefModal: (modalState: Record<string, unknown>) => void;
    handleDeleteProposition: (propId: string) => void;
    handleInvalidateBelief: (belief: DashboardEpistemicBeliefEdge, coord: string) => void;
    retroactivelyInjectClue: (
        secretId: string | undefined,
        clueIdx: number,
        currentStory: DashboardStory
    ) => void | Promise<void>;
    openEditModal: (title: string, initialVal: string, onSave: (val: string) => void) => void;
    openFormModal: (opts: DashboardOpenFormOptions) => unknown;
    requestConfirm: (opts: DashboardRequestConfirmOptions) => unknown;
    showToast: (msg: string, type?: string) => void;
}
