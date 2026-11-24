/**
 * @module domain/lifecycle/rollback
 * Pure, immutable stage rollback engine for resetting prose, scenes, sequences, acts, or TTS
 * while preserving initial concept, starting cast, story arc, and user-uploaded world lore.
 */

import type { Act, CastMember, LoreItem, Relationship, SecretEntry, Sequence } from '@/types';
import { computePacingRanges } from '@/domain/story';
import { ensureEpistemicGraph } from '@/domain/continuity';
import type { ContinuityStoryState } from '@/domain/continuity';

export type StoryResetStageKey = 'tts' | 'prose' | 'scenes' | 'sequences' | 'acts';

export interface StoryResetStageConfig {
    stage: StoryResetStageKey;
    ttsOnly?: boolean;
    label: string;
    title: string;
    message: string;
    confirmLabel: string;
    toastMessage: string;
}

export interface RollbackCharacterArc {
    char_id?: string;
    id?: string;
    character_name?: string;
    [key: string]: unknown;
}

export interface RollbackRelationshipHistoryEntry {
    chapter?: string;
    change?: string;
    [key: string]: unknown;
}

export interface RollbackRelationshipEntry extends Relationship {
    initial_feeling?: string;
    current?: string;
    history?: RollbackRelationshipHistoryEntry[];
}

export interface RollbackStoryState
    extends Omit<
        ContinuityStoryState,
        'relationships' | 'secret_vault' | 'scenes' | 'sequences' | 'acts' | 'cast' | 'lore' | 'user_edited'
    > {
    status_quo?: string;
    cast?: RollbackCastMember[];
    lore?: RollbackLoreItem[];
    character_arcs?: RollbackCharacterArc[];
    user_edited?: Record<string, unknown>;
    relationships?: Record<string, RollbackRelationshipEntry>;
    secret_vault?: SecretEntry[];
    scenes?: Record<string, Array<Record<string, unknown>>>;
    sequences?: Sequence[];
    acts?: Act[];
    thread_statuses?: unknown[];
    length_control?: { sequences?: Record<string, unknown>; [key: string]: unknown };
    generation_ranges?: Record<string, unknown>;
    target_word_count?: number;
    editorial_harness?: Record<string, unknown> | null;
    event_log?: unknown[];
    knowledge_graph?: { nodes: unknown[]; edges: unknown[] };
    graph_edges?: unknown[];
}

export interface RollbackCastMember extends CastMember {
    is_initial_cast?: boolean;
    corner_role?: string;
    user_edited_goals?: boolean;
    details?: {
        story_events?: string;
        history?: string;
        deep_profile?: string;
        goals?: string;
        [key: string]: unknown;
    };
}

export interface RollbackLoreItem extends Partial<LoreItem> {
    merged_from_topic?: string;
    text?: string;
    is_merged?: boolean;
    title?: string;
    docTitle?: string;
    sectionTitle?: string;
    valid_from_act?: number;
    valid_from_scene?: number;
}

export interface RollbackFlags {
    clearTtsOnly?: boolean;
    clearProse: boolean;
    clearScenes: boolean;
    clearSequences: boolean;
    clearActs: boolean;
}

export interface RollbackResult<TStory extends RollbackStoryState = RollbackStoryState> {
    nextStory: TStory;
    removedCharIds: string[];
    removedCharNames: string[];
    flags: RollbackFlags;
}

export const STORY_RESET_STAGES: Record<StoryResetStageKey, StoryResetStageConfig> = {
    tts: {
        stage: 'tts',
        ttsOnly: true,
        label: 'Delete All Scene TTS',
        title: 'Reset Story: Delete All Scene TTS Audio?',
        message:
            'This will permanently delete all generated and stored scene and sequence TTS audio files, along with cached TTS segment renders for this story.\n\nPreserved: All written prose, beats, scenes, sequences, acts, cast, voice profiles, lore, and uploaded documents.',
        confirmLabel: 'Delete All Scene TTS',
        toastMessage:
            'All generated and stored scene TTS audio deleted. Story prose and structure preserved.'
    },
    prose: {
        stage: 'prose',
        label: 'Delete All Prose',
        title: 'Reset Story: Delete All Prose?',
        message:
            'This will delete all drafted and final scene prose, beats, bridge scenes, scene audio/images, writing-generated characters, extracted story lore, and continuity tracking.\n\nPreserved: Initial concept, starting cast, story arc, uploaded document lore, Acts, Sequences, and planned Scenes.',
        confirmLabel: 'Delete All Prose',
        toastMessage: 'All prose and writing-time data deleted. Planned scenes preserved.'
    },
    scenes: {
        stage: 'scenes',
        label: 'Delete All Scenes',
        title: 'Reset Story: Delete All Scenes & Prose?',
        message:
            'This will delete all planned scenes, beats, prose, scene audio/images, writing-generated characters, extracted story lore, and continuity tracking.\n\nPreserved: Initial concept, starting cast, story arc, uploaded document lore, Acts, and Sequences.',
        confirmLabel: 'Delete All Scenes',
        toastMessage: 'All scenes, prose, and downstream data deleted. Acts & Sequences preserved.'
    },
    sequences: {
        stage: 'sequences',
        label: 'Delete All Sequences',
        title: 'Reset Story: Delete All Sequences, Scenes & Prose?',
        message:
            'This will delete all sequences, scenes, beats, prose, scene audio/images, writing-generated characters, extracted story lore, and continuity tracking.\n\nPreserved: Initial concept, starting cast, story arc, uploaded document lore, and Acts.',
        confirmLabel: 'Delete All Sequences',
        toastMessage:
            'All sequences, scenes, and prose deleted. Acts & initial structure preserved.'
    },
    acts: {
        stage: 'acts',
        label: 'Delete All Acts',
        title: 'Reset Story to Initial Structure (Delete All Acts)?',
        message:
            'This will roll the story back to immediately prior to Act Creation — deleting all acts, sequences, scenes, beats, prose, scene audio/images, characters generated during writing, and lore saved during story generation.\n\nPreserved: Initial concept, starting cast, story arc, and processed document upload data.',
        confirmLabel: 'Delete All Acts & Reset',
        toastMessage:
            'Story reset to initial structure prior to Act creation. Initial concept, starting cast & uploaded docs preserved.'
    }
};

/** Returns true when a lore item belongs to initial setup or uploaded docs that survive rollback. */
export function isPreservedPreWritingLoreItem(item: RollbackLoreItem | null | undefined): boolean {
    if (!item || typeof item !== 'object') return false;
    const topic = String(item.topic || '').trim();
    const mergedFrom = String(item.merged_from_topic || '').trim();
    const desc = String(item.description || '').trim();
    const rels = Array.isArray(item.related_to) ? item.related_to : [];
    const rawText = String(item.text || item.detail || '');
    if (
        topic === 'Status Quo Setting' ||
        topic === 'World Bible Setting' ||
        mergedFrom === 'Status Quo Setting'
    ) {
        return true;
    }
    if (
        desc === 'World Bible Setting' ||
        desc === 'Imported Lore Segment' ||
        desc === 'User Added Lore'
    ) {
        return true;
    }
    if (desc.startsWith('Imported from ')) return true;
    if (Boolean(item.docTitle) || Boolean(item.sectionTitle)) return true;
    if (rawText.startsWith('[Document: ')) return true;
    if (rels.includes('Manual Entry')) return true;
    return false;
}

/** Restores a merged/compacted pre-writing lore entry to its clean initial baseline. */
export function restorePreservedLoreItem(
    item: RollbackLoreItem,
    sourceStory?: RollbackStoryState | null
): RollbackLoreItem {
    const cloned: RollbackLoreItem = { ...item };
    if (cloned.is_merged) {
        if (cloned.text && String(cloned.text).startsWith('[Document: ')) {
            cloned.detail = cloned.text;
            if (cloned.title) cloned.topic = cloned.title;
        } else if (
            (cloned.topic === 'Status Quo Setting' ||
                cloned.merged_from_topic === 'Status Quo Setting') &&
            sourceStory?.status_quo
        ) {
            cloned.topic = 'Status Quo Setting';
            cloned.detail = sourceStory.status_quo;
        }
    }
    delete cloned.is_merged;
    delete cloned.merged_from_topic;
    cloned.valid_from_act = 1;
    cloned.valid_from_scene = 1;
    return cloned;
}

/** Returns true if a cast member was dynamically spawned at or after the target reset stage. */
export function isGeneratedCastMemberForStage(
    char: RollbackCastMember | null | undefined,
    stage: StoryResetStageKey | string,
    sourceStory?: RollbackStoryState | null
): boolean {
    if (!char || typeof char !== 'object') return true;
    if (char.is_initial_cast) return false;
    const id = String(char.id || '').trim();
    if (id.startsWith('char_')) return false;
    if (id.startsWith('C_dyn_')) return true;
    if (/^C_.+_\d{10,}/.test(id)) return true;

    const eventsText = String(char.details?.story_events || '');
    const historyText = String(char.details?.history || '');
    if (eventsText.startsWith('Identified in conceptual worldbuilding')) return false;
    if (eventsText.startsWith('Newly added to cast.')) return false;

    const isActSpawn =
        eventsText.includes('Act division and pacing') ||
        historyText.includes('Act division and pacing');
    const isSeqSpawn =
        eventsText.includes('Novel Sequence Architecture') ||
        historyText.includes('Novel Sequence Architecture');
    const isArcSpawn =
        eventsText.includes('Story Arc planning') || historyText.includes('Story Arc planning');
    if (isArcSpawn) return false;
    if (isActSpawn) return stage === 'acts';
    if (isSeqSpawn) return stage === 'sequences' || stage === 'acts';
    if (eventsText.startsWith('Spawned during ')) return true;

    const hasDeepProfile = Boolean(
        char.details &&
            typeof char.details === 'object' &&
            typeof char.details.deep_profile === 'string' &&
            char.details.deep_profile.trim().length > 0
    );
    const nameLower = String(char.name || '')
        .trim()
        .toLowerCase();
    const inArcs = (sourceStory?.character_arcs || []).some(
        (arc) =>
            arc &&
            [arc.char_id, arc.id, arc.character_name].some(
                (v) => v && String(v).trim().toLowerCase() === nameLower
            )
    );
    if (/^C\d+$/i.test(id) || hasDeepProfile || Boolean(char.corner_role) || inArcs) return false;
    return true;
}

/** Strips prose-time `[New]:` mutations and post-setup event bullets from preserved cast profiles. */
export function cleanPreservedCastMember(
    char: RollbackCastMember,
    idx: number,
    sourceStory?: RollbackStoryState | null
): RollbackCastMember {
    const nextChar: RollbackCastMember = { ...char };
    const prevDetails =
        char.details && typeof char.details === 'object' ? { ...char.details } : null;
    if (prevDetails) {
        if (typeof prevDetails.history === 'string') {
            const strippedHistory = prevDetails.history
                .replace(/(?:^|\n)\[New\]:[\s\S]*$/m, '')
                .trim();
            prevDetails.history = strippedHistory || char.core_flaw || '';
        }
        if (typeof prevDetails.story_events === 'string') {
            if (prevDetails.story_events.startsWith('Identified in conceptual worldbuilding')) {
                prevDetails.story_events = 'Identified in conceptual worldbuilding';
            } else if (prevDetails.story_events.startsWith('Newly added to cast.')) {
                prevDetails.story_events = 'Newly added to cast.';
            } else {
                prevDetails.story_events = prevDetails.story_events
                    .replace(/(?:^|\n)-\s[\s\S]*$/m, '')
                    .trim();
            }
        }
        const userEdited = sourceStory?.user_edited || {};
        const isGoalsUserEdited = Boolean(
            char.user_edited_goals ||
                userEdited[`cast.${idx}.goals`] ||
                userEdited[`cast.${char.name}.goals`] ||
                userEdited[`cast.${idx}.core_desire`] ||
                userEdited[`cast.${char.name}.core_desire`]
        );
        if (!isGoalsUserEdited && char.core_desire) {
            prevDetails.goals = char.core_desire;
        }
        nextChar.details = prevDetails;
    }
    return nextChar;
}

/** Rebuilds baseline runtime character state entries for surviving cast members. */
export function rebuildBaselineCharacterStates(
    castList: ReadonlyArray<RollbackCastMember> = []
): Record<string, Record<string, unknown>> {
    const nextStates: Record<string, Record<string, unknown>> = {};
    (castList || []).forEach((c) => {
        if (!c || !c.name) return;
        nextStates[c.name] = {
            name: c.name,
            role: c.role || '',
            physical_state: 'Baseline active condition',
            emotional_state: c.core_flaw || 'Baseline tension',
            location: 'Starting status quo',
            goals: c.core_desire || '',
            unresolved_tension: c.core_flaw || '',
            held_items: [],
            vocal_cadence: c.vocal_cadence || '',
            relationships_status: {}
        };
    });
    return nextStates;
}

/** Rewinds relationship dynamics and prunes dynamically spawned character pairs. */
export function cleanRelationshipsForRollback(
    sourceRels: Record<string, RollbackRelationshipEntry> | null | undefined,
    preservedCast: ReadonlyArray<RollbackCastMember>,
    clearActs: boolean
): Record<string, RollbackRelationshipEntry> {
    const castNamesLower = new Set(
        (preservedCast || [])
            .map((c) => String(c?.name || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const nextRels: Record<string, RollbackRelationshipEntry> = {};
    Object.entries(sourceRels || {}).forEach(([key, rel]) => {
        if (!rel || typeof rel !== 'object') return;
        const parts = key.split('->');
        if (parts.length === 2) {
            const fromLower = parts[0].trim().toLowerCase();
            const toLower = parts[1].trim().toLowerCase();
            if (
                castNamesLower.size > 0 &&
                (!castNamesLower.has(fromLower) || !castNamesLower.has(toLower))
            ) {
                return;
            }
        }
        const origHistory = Array.isArray(rel.history) ? rel.history : [];
        const keptHistory = origHistory.filter((h) => {
            if (!h) return false;
            const chap = String(h.chapter || '').trim();
            if (chap === 'Act 1, Starting' || chap === 'Manual' || chap === 'Initial') return true;
            if (!clearActs && chap === 'Act Structure planning') return true;
            return false;
        });
        if (origHistory.length > 0 && keptHistory.length === 0) {
            return;
        }
        let restoredCurrent = rel.current || '';
        if (keptHistory.length > 0) {
            const lastEntry = keptHistory[keptHistory.length - 1];
            const lastChap = String(lastEntry.chapter || '').trim();
            const lastChange = String(lastEntry.change || '').trim();
            if (!clearActs && lastChap === 'Act Structure planning') {
                restoredCurrent =
                    lastChange.replace(/\s*\(Structured shift\)\s*$/i, '').trim() ||
                    restoredCurrent;
            } else if (rel.initial_feeling) {
                restoredCurrent = rel.initial_feeling;
            } else if (/\((Initial Dynamic|Created manually)\)\s*$/i.test(lastChange)) {
                restoredCurrent = lastChange
                    .replace(/\s*\((Initial Dynamic|Created manually)\)\s*$/i, '')
                    .trim();
            } else if (origHistory.length > keptHistory.length) {
                restoredCurrent = 'Initial dynamic established in status quo';
            }
        } else if (rel.initial_feeling) {
            restoredCurrent = rel.initial_feeling;
        }
        nextRels[key] = {
            ...rel,
            current: restoredCurrent,
            history: keptHistory.map((h) => ({ ...h }))
        };
    });
    return nextRels;
}

/** Resets all secret vault entries and scheduled clue flags back to `dormant`. */
export function resetSecretVaultForRollback(
    sourceVault: SecretEntry[] | null | undefined
): SecretEntry[] {
    if (!Array.isArray(sourceVault)) return [];
    return sourceVault.map((sec) => {
        if (!sec || typeof sec !== 'object') return sec;
        const nextSec: SecretEntry = {
            ...sec,
            status: 'dormant',
            clue_schedule: Array.isArray(sec.clue_schedule)
                ? sec.clue_schedule.map((clue: Record<string, unknown>) => ({
                      ...clue,
                      seeded_in_prose: false
                  }))
                : []
        };
        delete nextSec.revealed_in_scene;
        return nextSec;
    });
}

/** Filters bridge scenes and removed characters out of surviving scene outlines after prose reset. */
export function cleanScenesForProseRollback(
    sourceScenes: Record<string, Array<Record<string, unknown>>> | null | undefined,
    sequences: Sequence[] | Array<Record<string, unknown>> | null | undefined,
    removedCharIds: string[],
    removedCharNames: string[]
): Record<string, Array<Record<string, unknown>>> {
    const removedIdSet = new Set(
        (removedCharIds || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    );
    const removedNameSet = new Set(
        (removedCharNames || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    );
    const filterCastArr = (val: unknown, isIdList = false): unknown => {
        if (!Array.isArray(val)) return val;
        const targetSet = isIdList ? removedIdSet : removedNameSet;
        return val.filter((item) => {
            const str =
                typeof item === 'object' && item !== null
                    ? String(
                          (item as { id?: unknown; name?: unknown }).id ||
                              (item as { id?: unknown; name?: unknown }).name ||
                              ''
                      )
                    : String(item || '');
            return !targetSet.has(str.trim().toLowerCase());
        });
    };
    const nextScenes: Record<string, Array<Record<string, unknown>>> = {};
    Object.entries(sourceScenes || {}).forEach(([seqKey, list]) => {
        if (!Array.isArray(list)) return;
        const seqIdx = parseInt(seqKey, 10);
        const seqNum =
            Array.isArray(sequences) && Number.isInteger(seqIdx) && sequences[seqIdx]?.number
                ? Number(sequences[seqIdx].number)
                : Number.isInteger(seqIdx)
                  ? seqIdx + 1
                  : 1;
        nextScenes[seqKey] = list
            .filter((sc) => sc && !sc.is_bridge_scene)
            .map((sc, idx) => {
                const numStr = `${seqNum}.${idx + 1}`;
                return {
                    ...sc,
                    id: numStr,
                    number: numStr,
                    ...(Array.isArray(sc.cast_ids)
                        ? { cast_ids: filterCastArr(sc.cast_ids, true) }
                        : {}),
                    ...(Array.isArray(sc.cast_names)
                        ? { cast_names: filterCastArr(sc.cast_names, false) }
                        : {}),
                    ...(Array.isArray(sc.characters_present)
                        ? { characters_present: filterCastArr(sc.characters_present, false) }
                        : {})
                };
            });
    });
    return nextScenes;
}

/** Builds a clean rolled-back copy of `sourceStory` for the specified reset stage. */
export function buildRolledBackStoryState<TStory extends RollbackStoryState>(
    sourceStory: TStory,
    stage: StoryResetStageKey
): RollbackResult<TStory> {
    if (!sourceStory || typeof sourceStory !== 'object') {
        throw new Error('Cannot reset an empty story object.');
    }
    if (!STORY_RESET_STAGES[stage]) {
        throw new Error(`Invalid story reset stage: ${String(stage)}`);
    }
    if (stage === 'tts') {
        return {
            nextStory: sourceStory,
            removedCharIds: [],
            removedCharNames: [],
            flags: {
                clearTtsOnly: true,
                clearProse: false,
                clearScenes: false,
                clearSequences: false,
                clearActs: false
            }
        };
    }

    const clearProse = true;
    const clearScenes = stage === 'scenes' || stage === 'sequences' || stage === 'acts';
    const clearSequences = stage === 'sequences' || stage === 'acts';
    const clearActs = stage === 'acts';

    const removedCharIds: string[] = [];
    const removedCharNames: string[] = [];
    const preservedCast: RollbackCastMember[] = [];

    (Array.isArray(sourceStory.cast) ? (sourceStory.cast as RollbackCastMember[]) : []).forEach(
        (char, idx) => {
            if (isGeneratedCastMemberForStage(char, stage, sourceStory)) {
                if (char?.id) removedCharIds.push(char.id);
                if (char?.name) removedCharNames.push(char.name);
            } else {
                preservedCast.push(cleanPreservedCastMember(char, idx, sourceStory));
            }
        }
    );

    const preservedLore = (
        Array.isArray(sourceStory.lore) ? (sourceStory.lore as RollbackLoreItem[]) : []
    )
        .filter(isPreservedPreWritingLoreItem)
        .map((item) => restorePreservedLoreItem(item, sourceStory));

    const cleanedRelationships = cleanRelationshipsForRollback(
        sourceStory.relationships,
        preservedCast,
        clearActs
    );
    const resetVault = resetSecretVaultForRollback(sourceStory.secret_vault);
    const resetCharStates = rebuildBaselineCharacterStates(preservedCast);

    const nextScenes = clearScenes
        ? {}
        : cleanScenesForProseRollback(
              sourceStory.scenes,
              sourceStory.sequences,
              removedCharIds,
              removedCharNames
          );
    const nextLengthControl = clearScenes
        ? { sequences: {} }
        : sourceStory.length_control || { sequences: {} };

    const nextSequences = clearSequences
        ? []
        : Array.isArray(sourceStory.sequences)
          ? sourceStory.sequences
          : [];

    const baselineRanges = computePacingRanges(sourceStory.target_word_count || 80000, 0);
    const seqPacingRange = (baselineRanges.scenes_per_sequence || {}) as {
        min?: number;
        max?: number;
        justification?: string;
    };
    const nextGenerationRanges = clearSequences
        ? {
              scenes_per_sequence: {
                  min: seqPacingRange.min ?? 4,
                  max: seqPacingRange.max ?? 12,
                  justification: seqPacingRange.justification ?? 'Baseline pacing range'
              }
          }
        : sourceStory.generation_ranges;

    const nextActs = clearActs
        ? []
        : Array.isArray(sourceStory.acts)
          ? sourceStory.acts
          : [];
    const nextThreadStatuses = clearActs
        ? []
        : Array.isArray(sourceStory.thread_statuses)
          ? sourceStory.thread_statuses
          : [];

    const nextUserEdited: Record<string, unknown> = { ...(sourceStory.user_edited || {}) };
    removedCharNames.forEach((name) => {
        if (!name) return;
        delete nextUserEdited[`cast.${name}`];
        Object.keys(nextUserEdited).forEach((k) => {
            if (k.startsWith(`cast.${name}.`)) delete nextUserEdited[k];
        });
    });

    const draftResetStory = {
        ...sourceStory,
        cast: preservedCast,
        character_states: resetCharStates,
        lore: preservedLore,
        relationships: cleanedRelationships,
        secret_vault: resetVault,
        acts: nextActs,
        thread_statuses: nextThreadStatuses,
        sequences: nextSequences,
        generation_ranges: nextGenerationRanges,
        scenes: nextScenes,
        length_control: nextLengthControl,
        beats: {},
        prose: {},
        story_so_far: '',
        editorial_harness: null,
        continuity_ledger: [],
        event_log: [],
        knowledge_graph: { nodes: [], edges: [] },
        graph_edges: [],
        user_edited: nextUserEdited,
        epistemic_graph: null
    } as TStory;

    (draftResetStory as RollbackStoryState).epistemic_graph = ensureEpistemicGraph(
        draftResetStory as unknown as ContinuityStoryState
    );

    return {
        nextStory: draftResetStory,
        removedCharIds,
        removedCharNames,
        flags: { clearProse, clearScenes, clearSequences, clearActs }
    };
}
