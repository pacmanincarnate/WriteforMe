/**
 * @module domain/lifecycle/migration
 * Legacy chapter-to-8-sequence story migration and schema/voice/blueprint hydration pass.
 */

import type { Act, CastMember, Sequence, Story, StoryMemory } from '@/types';
import type { AudioStoryLike } from '@/domain/audio';
import {
    createEmptyStoryMemory,
    ensureStoryMemory,
    sanitizeScenePlotDelta
} from '@/domain/continuity';
import {
    SEQUENCE_DEFAULT_FUNCTIONS,
    normalizeIntentionalOverrides,
    normalizeSceneBlueprint,
    normalizeSequences,
    parseActNumber
} from '@/domain/story';
import { migrateLoreTitles } from '@/domain/lore';
import {
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    isValidQwenVoiceProfile,
    sanitizeVoiceReferenceText,
    synthesizeVoiceDesignProfile
} from '@/domain/audio';

export interface MigrationCastMember extends CastMember {
    user_edited_cadence?: boolean;
    user_edited_reference_text?: boolean;
    reference_text?: string;
    voice_seed?: number;
    vocal_cadence?: string;
    interview_psychology?: string;
    deep_profile?: string;
    canonical_interview_voice?: string;
    details?: {
        deep_profile?: string;
        goals?: string;
        [key: string]: unknown;
    };
}

export interface LegacyChapterInput {
    title?: string;
    sequence_function?: string;
    dramatic_question?: string;
    tactical_question?: string;
    description?: string;
    chapter_objective?: string;
    sequence_objective?: string;
    threads_advanced?: unknown[];
    characters_in_focus?: unknown[];
    chapter_climax?: string;
    sequence_climax?: string;
    ending_hook?: string;
}

export interface MigratedStory extends Partial<Omit<Story, 'scenes' | 'beats' | 'prose' | 'cast' | 'lore' | 'sequences'>> {
    chapters?: Record<string, LegacyChapterInput[]> | LegacyChapterInput[][];
    continuity_ledger?: Array<Record<string, unknown>>;
    knowledge_graph?: { nodes: unknown[]; edges: unknown[] };
    event_log?: unknown[];
    lore?: Array<Record<string, unknown>>;
    sequences?: Sequence[];
    acts?: Act[];
    scenes?: Record<string, unknown>;
    beats?: Record<string, unknown>;
    prose?: Record<string, unknown>;
    cast?: MigrationCastMember[];
    user_edited?: Record<string, boolean | undefined>;
    narrator_vocal_cadence?: string;
    narrator_voice_seed?: number;
    character_states?: Record<string, Record<string, unknown>>;
    target_word_count?: number;
    book_type?: string;
    length_control?: Record<string, unknown>;
    generation_ranges?: {
        scenes_per_sequence?: { min: number; max: number; justification: string };
        [key: string]: unknown;
    };
    story_so_far?: string;
    story_memory?: StoryMemory;
    slop_allowlist?: string[];
    editorial_harness?: {
        customConstitutionOverrides?: unknown;
        constitution?: {
            intentionalOverrides?: unknown;
            [key: string]: unknown;
        };
        novelignore?: unknown;
        [key: string]: unknown;
    } | null;
    [key: string]: unknown;
}

/** Migrates legacy chaptered or partial stories into normalized 8-sequence schema and voice profiles. */
export function migrateStoryToSequences<TStory>(storyData: TStory): TStory {
    if (!storyData || typeof storyData !== 'object') return storyData;
    const story = { ...(storyData as unknown as MigratedStory) };

    story.continuity_ledger = Array.isArray(story.continuity_ledger)
        ? story.continuity_ledger
        : [];
    story.knowledge_graph =
        story.knowledge_graph &&
        typeof story.knowledge_graph === 'object' &&
        Array.isArray(story.knowledge_graph.nodes) &&
        Array.isArray(story.knowledge_graph.edges)
            ? story.knowledge_graph
            : { nodes: [], edges: [] };
    story.event_log = Array.isArray(story.event_log) ? story.event_log : [];
    if (Array.isArray(story.lore)) {
        story.lore = migrateLoreTitles(story.lore);
    }

    const oldChapters = story.chapters;
    const newSequences: Sequence[] = [];
    const newScenes: Record<string, Array<Record<string, unknown>>> = {};
    const newBeats: Record<string, unknown> = {};
    const newProse: Record<string, unknown> = {};

    let seqCounter = 1;

    if (
        oldChapters &&
        typeof oldChapters === 'object' &&
        (!Array.isArray(story.sequences) || story.sequences.length === 0)
    ) {
        const chaptersRecord = oldChapters as Record<string, LegacyChapterInput[]>;
        const actKeys = Array.isArray(oldChapters)
            ? Object.keys(oldChapters)
            : Object.keys(oldChapters).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        actKeys.forEach((actKey) => {
            const actIdx = parseInt(actKey, 10);
            const chaptersInAct = Array.isArray(chaptersRecord[actKey])
                ? chaptersRecord[actKey]
                : [];
            const parentAct = actIdx + 1;

            chaptersInAct.forEach((chap, chapIdx) => {
                const seqIdx = newSequences.length;
                const seqNumber = seqCounter++;
                const defaultFunc = SEQUENCE_DEFAULT_FUNCTIONS[seqIdx % 8] || `Sequence ${seqNumber}`;

                newSequences.push({
                    number: seqNumber,
                    parent_act: parentAct,
                    title: chap.title || `Sequence ${seqNumber}`,
                    sequence_function: chap.sequence_function || defaultFunc,
                    dramatic_question:
                        chap.dramatic_question ||
                        chap.tactical_question ||
                        `Will the protagonist achieve their objective in ${chap.title || `Sequence ${seqNumber}`}?`,
                    tactical_question:
                        chap.dramatic_question ||
                        chap.tactical_question ||
                        `Will the protagonist achieve their objective in ${chap.title || `Sequence ${seqNumber}`}?`,
                    description: chap.description || '',
                    sequence_objective: chap.chapter_objective || chap.sequence_objective || '',
                    threads_advanced: chap.threads_advanced || [],
                    characters_in_focus: chap.characters_in_focus || [],
                    sequence_climax: chap.chapter_climax || chap.sequence_climax || '',
                    ending_hook: chap.ending_hook || ''
                });

                const oldSceneKey = `${actIdx}-${chapIdx}`;
                const rawSceneList = story.scenes?.[oldSceneKey];
                const chapScenes = Array.isArray(rawSceneList)
                    ? (rawSceneList as Array<Record<string, unknown>>)
                    : [];
                newScenes[`${seqIdx}`] = chapScenes.map((s, sIdx) => {
                    const sceneCopy = normalizeSceneBlueprint(
                        {
                            ...s,
                            id: `${seqNumber}.${sIdx + 1}`,
                            number: `${seqNumber}.${sIdx + 1}`,
                            scene_type: s?.scene_type || (sIdx % 2 === 0 ? 'PROACTIVE' : 'REACTIVE'),
                            transition_jump:
                                s?.transition_jump ||
                                (sIdx === 0
                                    ? 'Sequence opening'
                                    : 'Seamless temporal/spatial continuation')
                        },
                        sIdx,
                        seqNumber,
                        story.cast || []
                    ) as Record<string, unknown>;
                    sceneCopy.id = `${seqNumber}.${sIdx + 1}`;
                    sceneCopy.number = sceneCopy.id;
                    return sceneCopy;
                });

                chapScenes.forEach((_, sIdx) => {
                    const oldBeatKey = `${actIdx}-${chapIdx}-${sIdx}`;
                    const newBeatKey = `${seqIdx}-${sIdx}`;
                    const oldBeat = story.beats?.[oldBeatKey];
                    if (oldBeat) {
                        newBeats[newBeatKey] = Array.isArray(oldBeat)
                            ? oldBeat
                            : ((oldBeat as { beats?: unknown[] })?.beats || []);
                    }
                    if (story.prose?.[oldBeatKey]) {
                        newProse[newBeatKey] = story.prose[oldBeatKey];
                    }
                });
            });
        });

        story.sequences = newSequences;
        delete story.chapters;
        story.scenes = { ...(story.scenes || {}), ...newScenes };
        story.beats = { ...(story.beats || {}), ...newBeats };
        story.prose = { ...(story.prose || {}), ...newProse };
    }

    if (Array.isArray(story.sequences) && story.sequences.length > 0) {
        story.sequences = normalizeSequences(story.sequences) as Sequence[];
    }

    if (Array.isArray(story.acts) && story.acts.length > 0) {
        story.acts = story.acts.map((act, i) => ({
            ...act,
            number: parseActNumber(act.number != null ? act.number : i + 1, i + 1)
        }));
    } else if (Array.isArray(story.sequences) && story.sequences.length > 0) {
        story.acts = [
            {
                number: 1,
                title: 'Act I: Setup & Departure',
                description:
                    'The exposition, inciting incident, and the protagonist taking up the dramatic question.'
            },
            {
                number: 2,
                title: 'Act II: Confrontation & Midpoint',
                description:
                    'Rising stakes, trials, the major midpoint reversal, and the dark night of the soul.'
            },
            {
                number: 3,
                title: 'Act III: Climax & Resolution',
                description:
                    'The final confrontation, highest tension, resolution of main tension, and aftermath.'
            }
        ];
    }

    if (story.beats && typeof story.beats === 'object') {
        const beatsMap = story.beats;
        Object.keys(beatsMap).forEach((key) => {
            const val = beatsMap[key];
            if (!Array.isArray(val)) {
                if (val && typeof val === 'object' && Array.isArray((val as { beats?: unknown[] }).beats)) {
                    beatsMap[key] = (val as { beats: unknown[] }).beats;
                } else if (val && typeof val === 'object') {
                    beatsMap[key] = Object.values(val as Record<string, unknown>).filter(
                        (v) => typeof v === 'object'
                    );
                } else {
                    beatsMap[key] = [];
                }
            }
        });
    } else {
        story.beats = {};
    }

    if (story.scenes && typeof story.scenes === 'object') {
        const scenesMap = story.scenes;
        Object.keys(scenesMap).forEach((key) => {
            const rawVal = scenesMap[key];
            let arr: unknown[];
            if (Array.isArray(rawVal)) {
                arr = rawVal;
            } else if (
                rawVal &&
                typeof rawVal === 'object' &&
                Array.isArray((rawVal as { scenes?: unknown[] }).scenes)
            ) {
                arr = (rawVal as { scenes: unknown[] }).scenes;
            } else if (rawVal && typeof rawVal === 'object') {
                arr = Object.values(rawVal as Record<string, unknown>).filter(
                    (v) => typeof v === 'object'
                );
            } else {
                arr = [];
            }

            const seqIdx = parseInt(key, 10);
            const seqNum =
                (!isNaN(seqIdx) && Number(story.sequences?.[seqIdx]?.number)) ||
                (!isNaN(seqIdx) ? seqIdx + 1 : 1);
            scenesMap[key] = arr
                .filter((sc): sc is Record<string, unknown> => Boolean(sc && typeof sc === 'object'))
                .map((sc, idx) => {
                    const normalized = normalizeSceneBlueprint(
                        sc,
                        idx,
                        seqNum,
                        story.cast || []
                    ) as Record<string, unknown>;
                    normalized.id = `${seqNum}.${idx + 1}`;
                    normalized.number = `${seqNum}.${idx + 1}`;
                    return normalized;
                });
        });
    } else {
        story.scenes = {};
    }

    const audioStory = story as unknown as AudioStoryLike;
    const isUserEditedNarrator = Boolean(story.user_edited?.narrator_vocal_cadence);
    if (
        !story.narrator_vocal_cadence ||
        (!isUserEditedNarrator && !isValidQwenVoiceProfile(story.narrator_vocal_cadence))
    ) {
        story.narrator_vocal_cadence = synthesizeVoiceDesignProfile(
            { name: 'Narrator' },
            'Narrator',
            audioStory
        );
    }
    if (typeof story.narrator_voice_seed !== 'number' || !Number.isFinite(story.narrator_voice_seed)) {
        story.narrator_voice_seed = 718281;
    }

    if (!story.character_states || typeof story.character_states !== 'object') {
        story.character_states = {};
    }
    if (Array.isArray(story.cast)) {
        story.cast.forEach((c, cIdx) => {
            if (!c || !c.name) return;
            const isUserEditedCadence = Boolean(
                c.user_edited_cadence ||
                    story.user_edited?.[`cast.${c.name}.vocal_cadence`] ||
                    story.user_edited?.[`cast.${cIdx}.vocal_cadence`]
            );
            if (!isUserEditedCadence || !String(c.vocal_cadence || '').trim()) {
                c.vocal_cadence = getVoiceDescriptionForCharacter(c, audioStory);
            }
            if (typeof c.voice_seed !== 'number' || !Number.isFinite(c.voice_seed)) {
                c.voice_seed = getDeterministicVoiceSeed(c, audioStory);
            }
            const isUserEditedRefText = Boolean(
                c.user_edited_reference_text ||
                    story.user_edited?.[`cast.${c.name}.reference_text`] ||
                    story.user_edited?.[`cast.${cIdx}.reference_text`]
            );
            if (!isUserEditedRefText) {
                const interviewSrc =
                    c.details?.deep_profile ||
                    c.interview_psychology ||
                    c.deep_profile ||
                    c.canonical_interview_voice ||
                    '';
                const derivedRef = extractPersonalizedReferenceTextFromInterview(interviewSrc);
                if (derivedRef) {
                    c.reference_text = derivedRef;
                } else if (c.reference_text) {
                    delete c.reference_text;
                }
            } else if (c.reference_text) {
                const sanitizedRef = sanitizeVoiceReferenceText(c.reference_text);
                if (sanitizedRef) c.reference_text = sanitizedRef;
            }
            if (!story.character_states![c.name]) {
                story.character_states![c.name] = {
                    name: c.name,
                    role: c.role || 'Character',
                    physical_state: 'Standard active condition',
                    emotional_state: c.core_flaw || 'Baseline tension',
                    unresolved_tension: c.core_flaw || '',
                    location: 'Active scene',
                    goals: c.core_desire || c.details?.goals || '',
                    vocal_cadence: c.vocal_cadence
                };
            } else {
                story.character_states![c.name].vocal_cadence = c.vocal_cadence;
            }
        });
    }

    if (!story.target_word_count) {
        story.target_word_count = 80000;
    }
    if (!story.book_type) {
        story.book_type = 'popular';
    }
    if (!story.length_control || typeof story.length_control !== 'object') {
        story.length_control = { sequences: {} };
    }

    if (!story.generation_ranges || !story.generation_ranges.scenes_per_sequence) {
        story.generation_ranges = {
            scenes_per_sequence: {
                min: 3,
                max: 10,
                justification: 'Calibrated for Popular novel format (80,000 words).'
            }
        };
    }

    const hasDraftedProse = Object.values(story.prose || {}).some((p) => {
        if (!p) return false;
        const txt =
            typeof p === 'string'
                ? p
                : (p as { final?: string; text?: string; draft?: string; prose?: string }).final ||
                  (p as { final?: string; text?: string; draft?: string; prose?: string }).text ||
                  (p as { final?: string; text?: string; draft?: string; prose?: string }).draft ||
                  (p as { final?: string; text?: string; draft?: string; prose?: string }).prose ||
                  '';
        return typeof txt === 'string' && txt.trim().length > 0;
    });
    story.story_memory = ensureStoryMemory(story.story_memory);
    if (!hasDraftedProse) {
        if (story.story_so_far) {
            story.story_so_far = '';
        }
        story.story_memory = createEmptyStoryMemory();
    } else if (
        story.story_so_far &&
        Object.keys(story.story_memory.acts).length === 0 &&
        Object.keys(story.story_memory.sequences).length === 0 &&
        Object.keys(story.story_memory.scenes).length === 0
    ) {
        const cleanedLegacy = sanitizeScenePlotDelta(story.story_so_far);
        if (cleanedLegacy) {
            story.story_memory.manualBaseText = cleanedLegacy;
            story.story_so_far = cleanedLegacy;
        }
    }

    if (!Array.isArray(story.slop_allowlist)) {
        story.slop_allowlist = [];
    } else {
        story.slop_allowlist = Array.from(
            new Set(story.slop_allowlist.map((x) => String(x || '').trim()).filter(Boolean))
        );
    }
    if (story.editorial_harness && typeof story.editorial_harness === 'object') {
        story.editorial_harness.customConstitutionOverrides = normalizeIntentionalOverrides(
            story.editorial_harness.customConstitutionOverrides ||
                story.editorial_harness.constitution?.intentionalOverrides ||
                story.editorial_harness.novelignore
        );
        if (
            story.editorial_harness.constitution &&
            typeof story.editorial_harness.constitution === 'object'
        ) {
            story.editorial_harness.constitution.intentionalOverrides =
                normalizeIntentionalOverrides(
                    story.editorial_harness.constitution.intentionalOverrides
                );
        }
        if (story.editorial_harness.novelignore) {
            story.editorial_harness.novelignore = normalizeIntentionalOverrides(
                story.editorial_harness.novelignore
            );
        }
    }

    return story as unknown as TStory;
}
