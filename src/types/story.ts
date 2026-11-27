export type WritingMode = 'novel' | 'audio_drama' | 'screenplay' | 'short_story' | string;

export interface Act {
    number: number;
    title: string;
    description?: string;
    act_mandate?: string;
    [key: string]: unknown;
}

export interface Sequence {
    number: number;
    parent_act?: number;
    title: string;
    dramatic_question?: string;
    function?: string;
    scenes?: SceneBlueprint[];
    [key: string]: unknown;
}

export interface ValueShift {
    start_state: string;
    end_state: string;
}

export interface SceneBlueprint {
    id?: string;
    number?: string | number;
    title: string;
    scene_type?: string;
    type?: string;
    pov_character?: string;
    characters_present?: string[];
    cast_names?: string[];
    cast_ids?: string[];
    location?: string;
    setting?: string;
    goal?: string;
    objective?: string;
    conflict?: string;
    outcome?: string;
    value_shift?: ValueShift | string;
    synopsis?: string;
    prose?: string;
    dominant_narrative_mode?: string;
    [key: string]: unknown;
}

export interface CastMember {
    id?: string;
    name: string;
    role?: string;
    core_flaw?: string;
    core_desire?: string;
    vocal_cadence?: string;
    voice_seed?: number | string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface LoreItem {
    id?: string;
    topic: string;
    detail: string;
    valid_from_act?: number;
    valid_from_scene?: number;
    related_to?: string[];
    description?: string;
    is_merged?: boolean;
    docTitle?: string;
    sectionTitle?: string;
    [key: string]: unknown;
}

export interface ProseEntry {
    final?: string;
    draft?: string;
    prose?: string;
    text?: string;
    stale?: boolean;
    target_words?: number;
    [key: string]: unknown;
}

export interface BeatItem {
    id?: string;
    beat_type?: string;
    initiator?: string;
    action?: string;
    reaction?: string;
    [key: string]: unknown;
}

export interface Relationship {
    char_a?: string;
    char_b?: string;
    from?: string;
    to?: string;
    type?: string;
    tension?: string;
    dynamic?: string;
    current?: string;
    hidden_tension?: string;
    trust_level?: number | string;
    history?: Array<{ chapter?: string; change?: string; [key: string]: unknown }>;
    [key: string]: unknown;
}

export interface SecretEntry {
    id?: string;
    title?: string;
    truth?: string;
    status?: string;
    reveal_anchor?: {
        act_number?: number;
        sequence_number?: number;
        scene_number?: number;
    };
    cover_story?: {
        character_masks?: Record<string, Record<string, string>>;
    };
    [key: string]: unknown;
}

export interface StoryMemoryActEntry {
    actNumber: number;
    title: string;
    summary: string;
    updatedAt: number;
}

export interface StoryMemorySequenceEntry {
    seqIdx: number;
    seqNumber: number;
    parentAct: number;
    title: string;
    summary: string;
    sceneCount: number;
    updatedAt: number;
}

export interface StoryMemorySceneEntry {
    key: string; // `${seqIdx}-${sceneIdx}`
    seqIdx: number;
    sceneIdx: number;
    sceneNumber: string; // e.g. "1.1"
    title: string;
    synopsis: string;
    updatedAt: number;
}

export interface StoryMemory {
    acts: Record<string, StoryMemoryActEntry>;
    sequences: Record<string, StoryMemorySequenceEntry>;
    scenes: Record<string, StoryMemorySceneEntry>;
    lastHandoffDossier?: string;
    manualBaseText?: string;
}

export interface Story {
    id: string;
    title: string;
    book_type?: string;
    writing_mode?: WritingMode;
    genre?: string;
    tone?: string;
    concept?: string;
    logline?: string;
    world_primer?: string;
    story_so_far?: string;
    story_memory?: StoryMemory;
    author_note?: string;
    style?: {
        genre?: string;
        mood?: string;
        writing_guide?: string;
    };
    cast?: CastMember[];
    characters?: CastMember[];
    acts?: Act[];
    sequences?: Sequence[];
    scenes?: Record<string, SceneBlueprint[]>;
    beats?: Record<string, BeatItem[]>;
    prose?: Record<string, ProseEntry | string>;
    lore?: LoreItem[];
    /** Keyed by `"<from>-><to>"` (see `createDefaultStoryTemplate`). */
    relationships?: Record<string, Relationship>;
    secret_vault?: SecretEntry[];
    epistemic_graph?: Record<string, unknown> | null;
    length_control?: Record<string, unknown>;
    timestamp?: number;
    [key: string]: unknown;
}
