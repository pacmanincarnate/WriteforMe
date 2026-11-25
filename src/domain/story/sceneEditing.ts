/**
 * @module domain/story/sceneEditing
 * Pure story transforms behind the manual scene and beat editors (add / delete / move a scene,
 * edit a scene blueprint, add / edit / delete a beat, dismiss a stale-prose banner).
 *
 * Every function takes a story and returns a new story (or the same reference when nothing
 * changed). Beats and prose are keyed by `"<sequenceIndex>-<sceneIndex>"`, so structural edits
 * must re-key those maps together with the scene list; older stories also carry a legacy
 * `"<sequenceIndex>-0-<sceneIndex>"` key, which insert and move keep in step.
 */

import { STRUCTURAL_MODALITIES } from '@/config';
import type { CastMember, SceneBlueprint } from '@/types';
import { isSerializationPlaceholder } from '@/utils';
import { normalizeSceneBlueprint, parseValueShiftInput } from './structure';

export type EditableBeat = Record<string, unknown>;

/** The slice of a story the scene/beat editors read and write. */
export interface SceneEditableStory {
    sequences?: Array<{ number?: number | string; [key: string]: unknown }>;
    scenes?: Record<string, SceneBlueprint[]>;
    beats?: Record<string, EditableBeat[]>;
    prose?: Record<string, unknown>;
    cast?: CastMember[];
    [key: string]: unknown;
}

/** Scene blueprint fields whose manual edit marks already-written prose as stale. */
export const STALE_TRACKED_SCENE_FIELDS = [
    'title',
    'pov_character',
    'setting',
    'scene_type',
    'transition_jump',
    'dominant_narrative_mode',
    'objective',
    'scene_events',
    'value_shift',
    'exit_hook',
    'surface_activity',
    'the_hinge_moment',
    'main_character_heart',
    'other_character_heart',
    'atmospheric_overview',
    'modality_hand',
    'entrance_conditions',
    'exit_conditions',
    'micro_conflict_and_tactic',
    'sensory_palette',
    'scene_pacing_tempo',
    'character_voice_directives',
    'characters_present',
    'epistemic_friction_level',
    'activation_contexts',
    'target_epistemic_deltas',
    'plot_commitments',
    'relationship_changes'
] as const;

const sequenceNumberOf = (story: SceneEditableStory, seqIdx: number): number =>
    (story.sequences?.[seqIdx]?.number as number | undefined) || seqIdx + 1;

const str = (value: unknown): string => (typeof value === 'string' ? value : value ? String(value) : '');

// ───────────────────────────── Beats ─────────────────────────────

/**
 * Edits one field of a beat. `action` and `reaction` also rebuild the combined
 * `description` / `action_description` line (`[tactic] action -> reaction`); any other field is
 * treated as free text that replaces the description.
 */
export function applyBeatFieldChange<T extends SceneEditableStory>(
    story: T,
    sceneKey: string,
    beatIdx: number,
    field: string,
    text: string
): T {
    const beats = story.beats || {};
    const beatsList = beats[sceneKey] ? [...beats[sceneKey]] : [];
    if (beatsList[beatIdx]) {
        const updatedBeat: EditableBeat = { ...beatsList[beatIdx] };

        if (field === 'action') {
            updatedBeat.action = text;
            updatedBeat.char_A_action = text;
            const tactic = str(updatedBeat.char_A_tactic || updatedBeat.tactic);
            const reaction = str(updatedBeat.char_B_reaction || updatedBeat.reaction);
            const combined =
                `${tactic ? `[${tactic}] ` : ''}${text}${reaction && reaction !== '—' ? ` -> ${reaction}` : ''}`.trim();
            updatedBeat.description = combined;
            updatedBeat.action_description = combined;
        } else if (field === 'reaction') {
            updatedBeat.reaction = text;
            updatedBeat.char_B_reaction = text;
            const tactic = str(updatedBeat.char_A_tactic || updatedBeat.tactic);
            const action = str(updatedBeat.char_A_action || updatedBeat.action);
            const combined =
                `${tactic ? `[${tactic}] ` : ''}${action}${text && text !== '—' ? ` -> ${text}` : ''}`.trim();
            updatedBeat.description = combined;
            updatedBeat.action_description = combined;
        } else {
            updatedBeat[field] = text;
            updatedBeat.description = text;
            updatedBeat.action_description = text;
            if (!updatedBeat.action) {
                updatedBeat.action = text;
                updatedBeat.char_A_action = text;
            }
        }

        beatsList[beatIdx] = updatedBeat;
    }
    return { ...story, beats: { ...beats, [sceneKey]: beatsList } };
}

/** Inserts an empty dramatic beat after `insertAfterIdx` and renumbers the scene's beats. */
export function insertBeatAfter<T extends SceneEditableStory>(
    story: T,
    sceneKey: string,
    insertAfterIdx: number
): T {
    const beats = story.beats || {};
    const currentBeats = beats[sceneKey] ? [...beats[sceneKey]] : [];
    const newBeat: EditableBeat = {
        number: insertAfterIdx + 2,
        beat_type: 'DRAMATIC',
        action: '',
        reaction: '',
        tactic: '',
        description: '',
        emotional_shift: '',
        valence: 0
    };
    currentBeats.splice(insertAfterIdx + 1, 0, newBeat);
    const renumbered = currentBeats.map((beat, i) => ({ ...beat, number: i + 1 }));
    return { ...story, beats: { ...beats, [sceneKey]: renumbered } };
}

/** Removes a beat (no-op when the index is out of range) and renumbers the rest. */
export function removeBeatAt<T extends SceneEditableStory>(story: T, sceneKey: string, beatIdx: number): T {
    const beats = story.beats || {};
    const currentBeats = beats[sceneKey] ? [...beats[sceneKey]] : [];
    if (currentBeats.length > beatIdx) {
        currentBeats.splice(beatIdx, 1);
    }
    const renumbered = currentBeats.map((beat, i) => ({ ...beat, number: i + 1 }));
    return { ...story, beats: { ...beats, [sceneKey]: renumbered } };
}

// ───────────────────────────── Scenes ─────────────────────────────

/**
 * Deletes a scene with its beats and prose, shifts the following scenes' beats/prose keys down
 * by one and renumbers the remaining scenes (`<sequence>.<position>`).
 */
export function removeSceneAt<T extends SceneEditableStory>(story: T, seqIdx: number, sceneIdx: number): T {
    const sequenceKey = `${seqIdx}`;
    const scenes = story.scenes || {};
    const nextScenes = [...(scenes[sequenceKey] || [])];
    const nextBeats = { ...(story.beats || {}) };
    const nextProse = { ...(story.prose || {}) };
    const numScenes = nextScenes.length;

    const deletedKey = `${seqIdx}-${sceneIdx}`;
    delete nextBeats[deletedKey];
    delete nextProse[deletedKey];

    for (let idx = sceneIdx + 1; idx < numScenes; idx++) {
        const oldKey = `${seqIdx}-${idx}`;
        const newKey = `${seqIdx}-${idx - 1}`;
        if (nextBeats[oldKey]) {
            nextBeats[newKey] = nextBeats[oldKey];
            delete nextBeats[oldKey];
        }
        if (nextProse[oldKey]) {
            nextProse[newKey] = nextProse[oldKey];
            delete nextProse[oldKey];
        }
    }

    nextScenes.splice(sceneIdx, 1);

    const sequenceNum = sequenceNumberOf(story, seqIdx);
    const renumbered = nextScenes.map((scene, idx) => ({
        ...scene,
        id: `${sequenceNum}.${idx + 1}`,
        number: `${sequenceNum}.${idx + 1}`
    }));

    return {
        ...story,
        scenes: { ...scenes, [sequenceKey]: renumbered },
        beats: nextBeats,
        prose: nextProse
    };
}

export interface InsertSceneResult<T> {
    story: T;
    /** Index the new scene ended up at (clamped into range). */
    insertIdx: number;
    /** Default title given to the new scene, e.g. `Scene 2.3`. */
    title: string;
}

/**
 * Inserts a blank, user-owned scene at `insertAtIdx` (appends when null), shifting the beats and
 * prose of every later scene up by one and renumbering the sequence. The new scene inherits POV,
 * setting and cast from the scene before it, and gets three modalities the previous scene did not
 * use so the planner's variety rule still holds.
 */
export function insertSceneAt<T extends SceneEditableStory>(
    story: T,
    seqIdx: number,
    insertAtIdx: number | null | undefined = null
): InsertSceneResult<T> {
    const sequenceKey = `${seqIdx}`;
    const prevSeqScenes = [...(story.scenes?.[sequenceKey] || [])];
    const insertIdx =
        insertAtIdx === null || insertAtIdx === undefined
            ? prevSeqScenes.length
            : Math.max(0, Math.min(prevSeqScenes.length, Number(insertAtIdx)));

    const nextBeats = { ...(story.beats || {}) };
    const nextProse = { ...(story.prose || {}) };
    const shiftUp = (map: Record<string, unknown>, oldKey: string, newKey: string): void => {
        if (map[oldKey] !== undefined) {
            map[newKey] = map[oldKey];
            delete map[oldKey];
        }
    };
    for (let idx = prevSeqScenes.length - 1; idx >= insertIdx; idx--) {
        shiftUp(nextBeats, `${seqIdx}-${idx}`, `${seqIdx}-${idx + 1}`);
        shiftUp(nextProse, `${seqIdx}-${idx}`, `${seqIdx}-${idx + 1}`);
        shiftUp(nextBeats, `${seqIdx}-0-${idx}`, `${seqIdx}-0-${idx + 1}`);
        shiftUp(nextProse, `${seqIdx}-0-${idx}`, `${seqIdx}-0-${idx + 1}`);
    }

    const seqNum = sequenceNumberOf(story, seqIdx);
    const prevScene = insertIdx > 0 ? prevSeqScenes[insertIdx - 1] : null;
    const prevHand = Array.isArray(prevScene?.modality_hand) ? (prevScene.modality_hand as unknown[]) : [];
    const allModalities = Object.values(STRUCTURAL_MODALITIES || {}).map((m) => m.name);
    const defaultHand = allModalities.filter((m) => !prevHand.includes(m)).slice(0, 3);
    const defaultPov = prevScene?.pov_character || story.cast?.[0]?.name || '';
    const defaultCast = prevScene?.characters_present?.length
        ? [...prevScene.characters_present]
        : defaultPov
          ? [defaultPov]
          : [];

    const newNum = `${seqNum}.${insertIdx + 1}`;
    const title = `Scene ${newNum}`;
    const newScene = normalizeSceneBlueprint(
        {
            id: newNum,
            number: newNum,
            title,
            scene_type: insertIdx % 2 === 0 ? 'PROACTIVE' : 'REACTIVE',
            pov_character: defaultPov,
            setting: prevScene?.setting || '',
            transition_jump:
                insertIdx === 0 ? 'Sequence opening' : 'Seamless temporal/spatial continuation',
            modality_hand: defaultHand,
            characters_present: [...defaultCast],
            cast_names: [...defaultCast],
            epistemic_friction_level: 'MODERATE',
            value_shift: { start_state: '', end_state: '' },
            user_edited: true
        },
        insertIdx,
        seqNum,
        story.cast || []
    );

    prevSeqScenes.splice(insertIdx, 0, newScene);
    const reindexed = prevSeqScenes.map((scene, i) => ({
        ...scene,
        id: `${seqNum}.${i + 1}`,
        number: `${seqNum}.${i + 1}`
    }));

    return {
        story: {
            ...story,
            scenes: { ...(story.scenes || {}), [sequenceKey]: reindexed },
            beats: nextBeats,
            prose: nextProse
        },
        insertIdx,
        title
    };
}

export interface MoveSceneResult<T> {
    story: T;
    moved: boolean;
    /** Title of the scene that moved ('' when nothing moved). */
    title: string;
    toIdx: number;
}

/** Swaps a scene with its neighbour (`direction` -1 up, +1 down), carrying its beats and prose along. */
export function moveSceneBy<T extends SceneEditableStory>(
    story: T,
    seqIdx: number,
    fromIdx: number,
    direction: number
): MoveSceneResult<T> {
    const sequenceKey = `${seqIdx}`;
    const toIdx = fromIdx + direction;
    const prevSeqScenes = [...(story.scenes?.[sequenceKey] || [])];
    if (
        fromIdx < 0 ||
        fromIdx >= prevSeqScenes.length ||
        toIdx < 0 ||
        toIdx >= prevSeqScenes.length ||
        fromIdx === toIdx
    ) {
        return { story, moved: false, title: '', toIdx };
    }
    const title = prevSeqScenes[fromIdx]?.title || `Scene ${fromIdx + 1}`;

    const nextScenes = [...prevSeqScenes];
    const tempScene = nextScenes[fromIdx];
    nextScenes[fromIdx] = nextScenes[toIdx];
    nextScenes[toIdx] = tempScene;

    const seqNum = sequenceNumberOf(story, seqIdx);
    const reindexed = nextScenes.map((scene, i) => ({
        ...scene,
        id: `${seqNum}.${i + 1}`,
        number: `${seqNum}.${i + 1}`
    }));

    const swapMapKeys = <V>(mapObj: Record<string, V> | undefined): Record<string, V> => {
        const nextMap = { ...(mapObj || {}) } as Record<string, V>;
        const swapPair = (keyA: string, keyB: string): void => {
            const hasA = Object.prototype.hasOwnProperty.call(nextMap, keyA);
            const hasB = Object.prototype.hasOwnProperty.call(nextMap, keyB);
            const valA = nextMap[keyA];
            const valB = nextMap[keyB];
            if (hasB) nextMap[keyA] = valB;
            else delete nextMap[keyA];
            if (hasA) nextMap[keyB] = valA;
            else delete nextMap[keyB];
        };
        swapPair(`${seqIdx}-${fromIdx}`, `${seqIdx}-${toIdx}`);
        swapPair(`${seqIdx}-0-${fromIdx}`, `${seqIdx}-0-${toIdx}`);
        return nextMap;
    };

    return {
        story: {
            ...story,
            scenes: { ...(story.scenes || {}), [sequenceKey]: reindexed },
            beats: swapMapKeys(story.beats),
            prose: swapMapKeys(story.prose)
        },
        moved: true,
        title,
        toIdx
    };
}

// ───────────────────────────── Scene blueprint ─────────────────────────────

export interface SceneBlueprintUpdateOptions {
    /** `false` keeps the scene's existing `user_edited` flag instead of setting it. */
    markUserEdited?: boolean;
    /** `false` never flags existing prose as stale. */
    markStale?: boolean;
}

export interface SceneBlueprintUpdateResult<T> {
    story: T;
    /** Tracked fields whose normalised value changed (see `STALE_TRACKED_SCENE_FIELDS`). */
    changedFields: string[];
}

const parseRawCastList = (rawVal: unknown): string[] =>
    (Array.isArray(rawVal)
        ? rawVal.map((x) =>
              typeof x === 'string' ? x.trim() : str((x as { name?: unknown } | null)?.name || String(x || '')).trim()
          )
        : typeof rawVal === 'string'
          ? rawVal.split(/[,;\n]+/).map((s) => s.trim().replace(/^-\s*/, ''))
          : []
    ).filter((x) => x && !isSerializationPlaceholder(x));

/**
 * Merges manual edits into a scene blueprint: keeps alias fields in sync (`objective`/`goal`,
 * `relationship_changes`/`relationship_shifts`), parses value shifts, resolves cast edits against
 * the story cast (names or ids, de-duplicated), re-normalises the scene, and flags existing prose
 * as stale when a tracked field actually changed. Returns the same story when the scene is missing.
 */
export function applySceneBlueprintUpdate<T extends SceneEditableStory>(
    story: T,
    seqIdx: number,
    sceneIdx: number,
    fieldUpdates: Record<string, unknown> | null | undefined = {},
    options: SceneBlueprintUpdateOptions = {},
    now: number = Date.now()
): SceneBlueprintUpdateResult<T> {
    const sequenceKey = `${seqIdx}`;
    const sceneKey = `${seqIdx}-${sceneIdx}`;
    const prevSeqScenes = [...(story.scenes?.[sequenceKey] || [])];
    const origScene = prevSeqScenes[sceneIdx];
    if (!origScene) return { story, changedFields: [] };

    const seqNum = sequenceNumberOf(story, seqIdx);
    const mergedUpdates: Record<string, unknown> = { ...(fieldUpdates || {}) };

    if ('objective' in mergedUpdates && !('goal' in mergedUpdates)) {
        mergedUpdates.goal = mergedUpdates.objective;
    } else if ('goal' in mergedUpdates && !('objective' in mergedUpdates)) {
        mergedUpdates.objective = mergedUpdates.goal;
    }

    const cloneIfArray = (value: unknown): unknown => (Array.isArray(value) ? [...value] : value);
    if ('relationship_changes' in mergedUpdates && !('relationship_shifts' in mergedUpdates)) {
        mergedUpdates.relationship_shifts = cloneIfArray(mergedUpdates.relationship_changes);
    } else if ('relationship_shifts' in mergedUpdates && !('relationship_changes' in mergedUpdates)) {
        mergedUpdates.relationship_changes = cloneIfArray(mergedUpdates.relationship_shifts);
    }

    if ('value_shift' in mergedUpdates) {
        mergedUpdates.value_shift = parseValueShiftInput(mergedUpdates.value_shift);
    }

    if ('cast_names' in mergedUpdates || 'characters_present' in mergedUpdates || 'cast_ids' in mergedUpdates) {
        let parsedCastNames =
            'cast_names' in mergedUpdates
                ? parseRawCastList(mergedUpdates.cast_names)
                : 'characters_present' in mergedUpdates
                  ? parseRawCastList(mergedUpdates.characters_present)
                  : parseRawCastList(mergedUpdates.cast_ids);
        if (parsedCastNames.length === 0 && 'cast_names' in mergedUpdates && 'characters_present' in mergedUpdates) {
            parsedCastNames = parseRawCastList(mergedUpdates.characters_present);
        }
        const castList: CastMember[] = Array.isArray(story.cast) ? story.cast : [];
        const deduped: string[] = [];
        const seen = new Set<string>();
        parsedCastNames.forEach((entry) => {
            const matched = castList.find(
                (c) => c.id === entry || c.name?.toLowerCase() === entry.toLowerCase()
            );
            const displayName = matched ? matched.name : entry;
            const key = displayName.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(displayName);
            }
        });
        mergedUpdates.cast_names = [...deduped];
        mergedUpdates.characters_present = [...deduped];
        mergedUpdates.cast_ids = deduped.map((name) => {
            const matched = castList.find((c) => c.name?.toLowerCase() === name.toLowerCase());
            return matched ? matched.id : name;
        });
    }

    const normalized = normalizeSceneBlueprint(
        { ...origScene, ...mergedUpdates },
        sceneIdx,
        seqNum,
        story.cast || []
    );
    normalized.id = origScene.id || `${seqNum}.${sceneIdx + 1}`;
    normalized.number = origScene.number || `${seqNum}.${sceneIdx + 1}`;
    normalized.user_edited = options.markUserEdited === false ? Boolean(origScene.user_edited) : true;

    const origNormalized = normalizeSceneBlueprint(origScene, sceneIdx, seqNum, story.cast || []);
    const changedFields = STALE_TRACKED_SCENE_FIELDS.filter(
        (field) => JSON.stringify(normalized[field] ?? '') !== JSON.stringify(origNormalized[field] ?? '')
    );

    prevSeqScenes[sceneIdx] = normalized;
    const nextProse = { ...(story.prose || {}) };
    const existingProse = nextProse[sceneKey] as
        | { final?: unknown; prose?: unknown; draft?: unknown; [key: string]: unknown }
        | string
        | undefined;
    const hasWrittenProse =
        existingProse &&
        ((existingProse as { final?: unknown }).final ||
            (existingProse as { prose?: unknown }).prose ||
            (existingProse as { draft?: unknown }).draft);
    if (changedFields.length > 0 && options.markStale !== false && hasWrittenProse) {
        nextProse[sceneKey] = {
            ...(typeof existingProse === 'object' ? existingProse : { final: String(existingProse) }),
            stale: {
                reason: 'Scene blueprint was manually edited.',
                changedFields,
                at: now
            }
        };
    }

    return {
        story: {
            ...story,
            scenes: { ...(story.scenes || {}), [sequenceKey]: prevSeqScenes },
            prose: nextProse
        },
        changedFields: [...changedFields]
    };
}

/** Clears the stale marker from a scene's prose entry. Returns the same story when there is none. */
export function dismissStaleProse<T extends SceneEditableStory>(story: T, seqIdx: number, sceneIdx: number): T {
    const sceneKey = `${seqIdx}-${sceneIdx}`;
    const entry = story.prose?.[sceneKey] as { stale?: unknown; [key: string]: unknown } | undefined;
    if (!entry?.stale) return story;
    const cleanedEntry = { ...entry };
    delete cleanedEntry.stale;
    return {
        ...story,
        prose: { ...(story.prose || {}), [sceneKey]: cleanedEntry }
    };
}
