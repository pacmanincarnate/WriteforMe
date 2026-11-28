/**
 * @module domain/story/structure
 * Story arc XML/JSON normalization, genre/tone/style parsing, sequence & scene
 * normalization, sequence insert/delete reindexing, and intentional overrides.
 */

import type { BeatItem, CastMember, SceneBlueprint, Sequence, Story, ValueShift } from '@/types';
import { inferNarrativeModeForScene } from '@/config';
import {
    STOPWORDS,
    decodeXmlEntities,
    extractTag,
    extractTagList,
    isSerializationPlaceholder,
    stripXmlTags,
    tokenMatch
} from '@/utils';
import { type NormalizedSecretEntry, normalizeSecretVault } from './clues';
import { contentDialXml } from './contentDial';

export interface CharacterArcEntry {
    char_id: string;
    corner_role: string;
    web_pressure: string;
    description: string;
    lie_believed: string;
    truth_needed: string;
    arc_catalyst: string;
}

export interface NarrativeThreadEntry {
    id: string;
    name: string;
    description: string;
}

export interface NormalizedStoryArc {
    starting_value_state: string;
    ending_value_state: string;
    major_surprises_and_twists: string;
    core_thematic_argument: string;
    inciting_incident: string;
    secret_vault: NormalizedSecretEntry[];
    character_arcs: CharacterArcEntry[];
    threads: NarrativeThreadEntry[];
}

export interface StructuredGenre {
    primaryEngine: string;
    playedStraight: string;
    ruthlesslySubverted: string;
    boundaries: string;
    raw: string;
}

export interface StructuredTone {
    authorialTriangulation: string;
    sensoryDirective: string;
    raw: string;
}

export interface StructuredStyle {
    focalizerBias: string;
    syntacticRhythm: string;
    antiPatterns: string;
    raw: string;
}

export interface ThreadStorylineEntry {
    thread_id: string;
    storyline_advancement: string;
    weaving_interaction: string;
}

export interface NormalizedSequence extends Sequence {
    id: string;
    number: number;
    parent_act: number;
    title: string;
    sequence_function: string;
    dramatic_question: string;
    tactical_question: string;
    starting_state: string;
    four_corner_movement?: string;
    description: string;
    summary: string;
    sequence_objective: string;
    threads_advanced: string[];
    thread_storylines: ThreadStorylineEntry[];
    characters_in_focus: string[];
    sequence_climax: string;
    ending_hook: string;
    next_sequence_boundary_guard: string;
}

export interface EpistemicDeltaEntry {
    holder: string;
    proposition_id: string;
    operation: string;
    to_stance: string;
    to_confidence: number;
    trigger_clue: string;
    [key: string]: unknown;
}

export const SEQUENCE_DEFAULT_FUNCTIONS: readonly string[] = [
    'Status Quo & Inciting Disruption',
    'Predicament, Resistance & Lock-In',
    'First Attempt & Early Friction',
    'Escalating Tests & Midpoint Shift',
    'Proactive Push & Counter-Pressure',
    'Compounding Fallout & Lowest Point',
    'Regroup, Renewed Resolve & Climax Threshold',
    'Climax & Resonant Resolution'
];

export const SEQUENCE_ACT_MAP: readonly number[] = [1, 1, 2, 2, 2, 2, 3, 3];

/**
 * Single source of truth for inferring a sequence's act when `parent_act` is absent.
 * Takes the 1-based sequence number; sequences beyond the 8-sequence model default to Act 3.
 */
export function actForSequence(seqNumber: number): number {
    return SEQUENCE_ACT_MAP[seqNumber - 1] || 3;
}

/** Parses and normalizes act numbers from integers, strings, or Roman numerals. */
export function parseActNumber(val: unknown, fallback = 1): number {
    if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
    if (val === null || val === undefined) return fallback;
    const str = String(val).trim();
    if (!str) return fallback;
    const directNum = parseInt(str, 10);
    if (!isNaN(directNum) && directNum > 0 && String(directNum) === str) return directNum;
    const clean = str.toUpperCase().replace(/^ACT\s*/i, '').trim();
    if (/^(?:III\b|3\b)/.test(clean)) return 3;
    if (/^(?:II\b|2\b)/.test(clean)) return 2;
    if (/^(?:IV\b|4\b)/.test(clean)) return 4;
    if (/^(?:V\b|5\b)/.test(clean)) return 5;
    if (/^(?:I\b|1\b)/.test(clean)) return 1;
    const cleanNum = parseInt(clean, 10);
    if (!isNaN(cleanNum) && cleanNum > 0) return cleanNum;
    if (!isNaN(directNum) && directNum > 0) return directNum;
    return fallback;
}

/**
 * Reindexes sequences, scenes, beats, prose, and length-control maps immutably
 * when inserting a new sequence at `insertIdx`.
 */
export function reindexStoryForSequenceInsert<T extends Partial<Story> & Record<string, unknown>>(
    story: T,
    insertIdx: number,
    newSequence: Record<string, unknown>
): T {
    const original = (story.sequences || []) as Array<Record<string, unknown>>;
    if (!Number.isInteger(insertIdx) || insertIdx < 0 || insertIdx > original.length) {
        throw new Error('Invalid sequence insertion index.');
    }
    const sequences: Array<Record<string, unknown> & { parent_act: number }> = original.map((seq, idx) => ({
        ...seq,
        parent_act: parseActNumber(
            seq.parent_act != null ? seq.parent_act : actForSequence(idx + 1),
            actForSequence(idx + 1)
        )
    }));
    sequences.splice(insertIdx, 0, {
        ...newSequence,
        parent_act: parseActNumber(
            newSequence.parent_act != null ? newSequence.parent_act : actForSequence(insertIdx + 1),
            actForSequence(insertIdx + 1)
        )
    });

    const scenes: Record<string, unknown[]> = {};
    Object.entries((story.scenes || {}) as Record<string, Array<Record<string, unknown>>>).forEach(
        ([key, list]) => {
            const oldIdx = Number(key);
            const nextIdx = oldIdx >= insertIdx ? oldIdx + 1 : oldIdx;
            scenes[String(nextIdx)] = list.map((scene, sceneIdx) => ({
                ...scene,
                id: `${nextIdx + 1}.${sceneIdx + 1}`,
                number: `${nextIdx + 1}.${sceneIdx + 1}`,
                ...(scene.parent_sequence !== undefined ? { parent_sequence: nextIdx + 1 } : {})
            }));
        }
    );
    scenes[String(insertIdx)] = [];

    const rekey = (map: Record<string, unknown> | undefined) =>
        Object.fromEntries(
            Object.entries(map || {}).map(([key, value]) => {
                const match = /^(\d+)-(.*)$/.exec(key);
                if (!match) return [key, value];
                const oldIdx = Number(match[1]);
                return [`${oldIdx >= insertIdx ? oldIdx + 1 : oldIdx}-${match[2]}`, value];
            })
        );

    const nextLengthSequences: Record<string, unknown> = {};
    const lcSeqs = (story.length_control as { sequences?: Record<string, unknown> } | undefined)?.sequences;
    Object.entries(lcSeqs || {}).forEach(([key, value]) => {
        const oldIdx = Number(key);
        if (!Number.isInteger(oldIdx)) return;
        nextLengthSequences[String(oldIdx >= insertIdx ? oldIdx + 1 : oldIdx)] = value;
    });

    return {
        ...story,
        sequences: sequences.map((seq, idx) => ({ ...seq, number: idx + 1 })),
        scenes,
        beats: rekey(story.beats as Record<string, unknown> | undefined),
        prose: rekey(story.prose as Record<string, unknown> | undefined),
        ...(story.length_control
            ? { length_control: { ...story.length_control, sequences: nextLengthSequences } }
            : {})
    };
}

/**
 * Reindexes sequences, scenes, beats, prose, and length-control maps immutably
 * when removing a sequence at `deleteIdx`.
 */
export function reindexStoryForSequenceDelete<T extends Partial<Story> & Record<string, unknown>>(
    story: T,
    deleteIdx: number
): T {
    const original = (story.sequences || []) as Array<Record<string, unknown>>;
    if (!Number.isInteger(deleteIdx) || deleteIdx < 0 || deleteIdx >= original.length) {
        throw new Error('Invalid sequence deletion index.');
    }
    const sequences = original.map((seq, idx) => ({
        ...seq,
        parent_act: parseActNumber(seq.parent_act, actForSequence(idx + 1))
    }));
    sequences.splice(deleteIdx, 1);

    const scenes: Record<string, unknown[]> = {};
    Object.entries((story.scenes || {}) as Record<string, Array<Record<string, unknown>>>).forEach(
        ([key, list]) => {
            const oldIdx = Number(key);
            if (oldIdx === deleteIdx) return;
            const nextIdx = oldIdx > deleteIdx ? oldIdx - 1 : oldIdx;
            scenes[String(nextIdx)] = list.map((scene, sceneIdx) => ({
                ...scene,
                id: `${nextIdx + 1}.${sceneIdx + 1}`,
                number: `${nextIdx + 1}.${sceneIdx + 1}`,
                ...(scene.parent_sequence !== undefined ? { parent_sequence: nextIdx + 1 } : {})
            }));
        }
    );

    const rekey = (map: Record<string, unknown> | undefined) =>
        Object.fromEntries(
            Object.entries(map || {}).flatMap(([key, value]) => {
                const match = /^(\d+)-(.*)$/.exec(key);
                if (!match) return [[key, value]];
                const oldIdx = Number(match[1]);
                if (oldIdx === deleteIdx) return [];
                return [[`${oldIdx > deleteIdx ? oldIdx - 1 : oldIdx}-${match[2]}`, value]];
            })
        );

    const nextLengthSequences: Record<string, unknown> = {};
    const lcSeqs = (story.length_control as { sequences?: Record<string, unknown> } | undefined)?.sequences;
    Object.entries(lcSeqs || {}).forEach(([key, value]) => {
        const oldIdx = Number(key);
        if (!Number.isInteger(oldIdx) || oldIdx === deleteIdx) return;
        nextLengthSequences[String(oldIdx > deleteIdx ? oldIdx - 1 : oldIdx)] = value;
    });

    return {
        ...story,
        sequences: sequences.map((seq, idx) => ({ ...seq, number: idx + 1 })),
        scenes,
        beats: rekey(story.beats as Record<string, unknown> | undefined),
        prose: rekey(story.prose as Record<string, unknown> | undefined),
        ...(story.length_control
            ? { length_control: { ...story.length_control, sequences: nextLengthSequences } }
            : {})
    };
}

/** Predicate identifying deprecated Valence Shift / Emotional Arc ledger entries. */
export function isLegacyValenceEntry(e: Record<string, unknown> | null | undefined): boolean {
    return (
        !!e &&
        (e.category === 'Valence Shift' ||
            e.category === 'Emotional Arc' ||
            String(e.key || '').startsWith('Valence (') ||
            String(e.key || '').startsWith('Scene Emotional Trajectory'))
    );
}

/** Normalizes a raw Story Arc object or parsed JSON payload into canonical fields and repairs missing threads. */
export function normalizeStoryArcObject(
    obj: Record<string, unknown>,
    _rawText = ''
): NormalizedStoryArc {
    void _rawText;
    const global = ((obj.global_arc || obj.globalArc || obj) as Record<string, unknown>) || {};
    const coreThematic =
        global.core_thematic_argument ||
        global.thematic_argument ||
        global.thematic_thesis ||
        global.theme ||
        obj.core_thematic_argument ||
        '';
    const startVal =
        global.starting_value_state ||
        global.starting_state ||
        global.initial_value_state ||
        obj.starting_value_state ||
        '';
    const endVal =
        global.ending_value_state ||
        global.ending_state ||
        global.final_value_state ||
        obj.ending_value_state ||
        '';
    const inciting =
        global.inciting_incident ||
        global.inciting_event ||
        global.catalyst ||
        obj.inciting_incident ||
        '';
    const twists =
        global.major_surprises_and_twists ||
        global.twists_and_surprises ||
        global.reversals ||
        global.surprises_and_twists ||
        obj.major_surprises_and_twists ||
        '';

    const rawArcs = obj.character_arcs || obj.characterArcs || obj.arcs || [];
    const charArcs: CharacterArcEntry[] = Array.isArray(rawArcs)
        ? rawArcs.map((item, idx) => {
              const a = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
              return {
                  char_id: String(a.char_id || a.character_id || a.name || a.character || `C${idx + 1}`),
                  corner_role: String(a.corner_role || a.role || ''),
                  web_pressure: String(a.web_pressure || a.pressure || a.four_corner_pressure || ''),
                  description: String(
                      a.arc_description ||
                          a.description ||
                          a.desc ||
                          a.summary ||
                          a.journey ||
                          'Internal psychological shift confronting personal flaws.'
                  ),
                  lie_believed: String(a.lie_believed || a.lie || a.safety_habit || ''),
                  truth_needed: String(a.truth_needed || a.truth || ''),
                  arc_catalyst: String(a.arc_catalyst || a.catalyst || '')
              };
          })
        : [];

    const rawThreads =
        obj.threads || obj.narrative_threads || obj.narrativeThreads || obj.plot_threads || [];
    const threads: NarrativeThreadEntry[] = Array.isArray(rawThreads)
        ? rawThreads.map((item, idx) => {
              const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
              return {
                  id: String(t.id || t.thread_id || `T${idx + 1}`),
                  name: String(t.name || t.thread_name || t.title || `Thread ${idx + 1}`),
                  description: String(
                      t.description ||
                          t.desc ||
                          t.summary ||
                          `Narrative thread exploring ${t.name || 'story stakes'}.`
                  )
              };
          })
        : [];

    if (threads.length < 2) {
        const existingIds = new Set(threads.map((t) => String(t.id).toUpperCase()));
        const synthesized: NarrativeThreadEntry[] = [
            {
                id: 'T1',
                name: 'Main Plot Thread (A-Story)',
                description: inciting
                    ? `External narrative arc catalyzed by: ${inciting}.`
                    : 'Central external conflict driving the main plot.'
            },
            {
                id: 'T2',
                name: 'Relationship / Thematic Mirror (B-Story)',
                description: coreThematic
                    ? `Relationship dynamic testing: "${coreThematic}".`
                    : 'Subplot mirroring the external conflict.'
            },
            {
                id: 'T3',
                name: 'Internal Transformation (C-Story)',
                description:
                    startVal && endVal
                        ? `Protagonist's shift from "${startVal}" to "${endVal}".`
                        : "Protagonist's psychological transformation."
            }
        ];
        for (const synth of synthesized) {
            if (threads.length >= 3) break;
            if (!existingIds.has(synth.id)) {
                threads.push(synth);
                existingIds.add(synth.id);
            }
        }
    }

    return {
        starting_value_state: typeof startVal === 'string' ? startVal : JSON.stringify(startVal),
        ending_value_state: typeof endVal === 'string' ? endVal : JSON.stringify(endVal),
        major_surprises_and_twists: typeof twists === 'string' ? twists : JSON.stringify(twists),
        core_thematic_argument:
            typeof coreThematic === 'string' ? coreThematic : JSON.stringify(coreThematic),
        inciting_incident: typeof inciting === 'string' ? inciting : JSON.stringify(inciting),
        secret_vault: normalizeSecretVault(obj.secret_vault || obj.secrets || [], {
            majorSurprisesAndTwists: typeof twists === 'string' ? twists : '',
            characterArcs: charArcs,
            incitingIncident: typeof inciting === 'string' ? inciting : ''
        }),
        character_arcs: charArcs,
        threads
    };
}

/** Parses the Story Arc agent's XML, JSON, or pre-parsed object response. */
export function parseStoryArcXml(text: unknown): NormalizedStoryArc {
    const defaultResult: NormalizedStoryArc = {
        secret_vault: [],
        starting_value_state: '',
        ending_value_state: '',
        major_surprises_and_twists: '',
        core_thematic_argument: '',
        inciting_incident: '',
        character_arcs: [],
        threads: []
    };

    if (!text) return defaultResult;

    if (typeof text === 'object' && text !== null) {
        return normalizeStoryArcObject(text as Record<string, unknown>);
    }

    if (typeof text !== 'string') return defaultResult;

    const trimmed = text.trim();
    let parsedJson: Record<string, unknown> | null = null;
    if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
        try {
            parsedJson = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            // Fall through
        }
    }
    if (!parsedJson) {
        const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (jsonBlockMatch) {
            try {
                parsedJson = JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>;
            } catch {
                // Fall through
            }
        }
    }
    if (parsedJson && typeof parsedJson === 'object') {
        return normalizeStoryArcObject(parsedJson, text);
    }

    const globalArcMatch = /<global_arc(?:\s+[^>]*)?>([\s\S]*?)<\/global_arc>/i.exec(text);
    const globalArc = globalArcMatch ? globalArcMatch[1] : text;

    const extractField = (...tags: string[]): string => {
        for (const tag of tags) {
            const val = extractTag(globalArc, tag) || extractTag(text, tag);
            if (val && val.trim().length > 0) return val.trim();
        }
        return '';
    };

    const coreThematicArgument = extractField(
        'core_thematic_argument',
        'thematic_argument',
        'thematic_thesis',
        'core_theme',
        'theme'
    );
    const startingValueState = extractField(
        'starting_value_state',
        'starting_state',
        'initial_value_state',
        'start_state'
    );
    const endingValueState = extractField(
        'ending_value_state',
        'ending_state',
        'final_value_state',
        'end_state'
    );
    const incitingIncident = extractField('inciting_incident', 'inciting_event', 'catalyst', 'disruption');
    const majorSurprisesAndTwists = extractField(
        'major_surprises_and_twists',
        'twists_and_surprises',
        'reversals',
        'major_twists',
        'surprises_and_twists',
        'twists'
    );

    const charArcs: CharacterArcEntry[] = [];
    const charArcsContainerMatch =
        /<(?:character_arcs|arcs|characters|char_arcs)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:character_arcs|arcs|characters|char_arcs)>/i.exec(
            text
        );
    const charArcsXML = charArcsContainerMatch ? charArcsContainerMatch[1] : text;
    const arcRegex = /<(?:arc|character_arc|character)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:arc|character_arc|character)>/gi;
    let arcMatch: RegExpExecArray | null;
    let arcIdx = 0;
    while ((arcMatch = arcRegex.exec(charArcsXML)) !== null) {
        const arcBlock = arcMatch[1];
        const fullArcTag = arcMatch[0];
        const charIdMatch = fullArcTag.match(/\b(?:id|character|char_id|name)=["']([^"']+)["']/i);
        const charId =
            extractTag(arcBlock, 'char_id') ||
            extractTag(arcBlock, 'character_id') ||
            extractTag(arcBlock, 'name') ||
            extractTag(arcBlock, 'character') ||
            (charIdMatch ? charIdMatch[1] : null) ||
            `C${arcIdx + 1}`;
        const description =
            extractTag(arcBlock, 'arc_description') ||
            extractTag(arcBlock, 'description') ||
            extractTag(arcBlock, 'desc') ||
            extractTag(arcBlock, 'summary') ||
            extractTag(arcBlock, 'journey') ||
            '';
        const lieBelieved =
            extractTag(arcBlock, 'lie_believed') ||
            extractTag(arcBlock, 'lie') ||
            extractTag(arcBlock, 'safety_habit') ||
            '';
        const truthNeeded = extractTag(arcBlock, 'truth_needed') || extractTag(arcBlock, 'truth') || '';
        const arcCatalyst = extractTag(arcBlock, 'arc_catalyst') || extractTag(arcBlock, 'catalyst') || '';
        const cornerRole = extractTag(arcBlock, 'corner_role') || extractTag(arcBlock, 'corner') || '';
        const webPressure =
            extractTag(arcBlock, 'web_pressure') ||
            extractTag(arcBlock, 'pressure') ||
            extractTag(arcBlock, 'four_corner_pressure') ||
            '';

        if (charId || description || lieBelieved || truthNeeded) {
            charArcs.push({
                char_id: charId,
                corner_role: cornerRole,
                web_pressure: webPressure,
                description:
                    description || 'Internal psychological shift confronting personal flaws and thematic tensions.',
                lie_believed: lieBelieved,
                truth_needed: truthNeeded,
                arc_catalyst: arcCatalyst
            });
            arcIdx++;
        }
    }

    const threads: NarrativeThreadEntry[] = [];
    const threadsContainerMatch =
        /<(?:narrative_threads|threads|plot_threads|story_threads|narrative_thread_list)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:narrative_threads|threads|plot_threads|story_threads|narrative_thread_list)>/i.exec(
            text
        );
    const threadsSearchArea = threadsContainerMatch ? threadsContainerMatch[1] : text;

    const threadRegex = /<thread(?:\s+[^>]*)?>([\s\S]*?)<\/thread>/gi;
    let threadMatch: RegExpExecArray | null;
    let threadIdx = 0;
    while ((threadMatch = threadRegex.exec(threadsSearchArea)) !== null) {
        const threadBlock = threadMatch[1];
        const fullThreadTag = threadMatch[0];
        const idAttr = fullThreadTag.match(/\bid=["']([^"']+)["']/i);
        const nameAttr = fullThreadTag.match(/\b(?:name|title)=["']([^"']+)["']/i);

        const id =
            extractTag(threadBlock, 'thread_id') ||
            extractTag(threadBlock, 'id') ||
            (idAttr ? idAttr[1] : null) ||
            `T${threadIdx + 1}`;
        const name =
            extractTag(threadBlock, 'name') ||
            extractTag(threadBlock, 'thread_name') ||
            extractTag(threadBlock, 'title') ||
            (nameAttr ? nameAttr[1] : null) ||
            (threadIdx === 0
                ? 'Main Plot Thread (A-Story)'
                : threadIdx === 1
                  ? 'Relationship / Thematic Mirror (B-Story)'
                  : threadIdx === 2
                    ? 'Internal Arc (C-Story)'
                    : `Narrative Thread ${threadIdx + 1}`);
        const description =
            extractTag(threadBlock, 'description') ||
            extractTag(threadBlock, 'desc') ||
            extractTag(threadBlock, 'summary') ||
            extractTag(threadBlock, 'content') ||
            extractTag(threadBlock, 'details') ||
            stripXmlTags(threadBlock).trim();

        threads.push({
            id: id.trim(),
            name: name.trim(),
            description: description.trim()
        });
        threadIdx++;
    }

    if (threads.length === 0) {
        const storyTagPatterns = [
            {
                pattern:
                    /<(?:a_story|a_plot|main_plot|main_thread)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:a_story|a_plot|main_plot|main_thread)>/i,
                defaultId: 'T1',
                defaultName: 'Main Plot Thread (A-Story)'
            },
            {
                pattern:
                    /<(?:b_story|b_plot|relationship_subplot|thematic_mirror)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:b_story|b_plot|relationship_subplot|thematic_mirror)>/i,
                defaultId: 'T2',
                defaultName: 'Relationship / Thematic Mirror (B-Story)'
            },
            {
                pattern:
                    /<(?:c_story|c_plot|internal_arc|character_thread)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:c_story|c_plot|internal_arc|character_thread)>/i,
                defaultId: 'T3',
                defaultName: 'Internal Arc (C-Story)'
            },
            {
                pattern: /<(?:d_story|d_plot|foil_arc|subplot)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:d_story|d_plot|foil_arc|subplot)>/i,
                defaultId: 'T4',
                defaultName: 'Foil / Subplot (D-Story)'
            }
        ];
        for (const item of storyTagPatterns) {
            const m = item.pattern.exec(text);
            if (m) {
                const inner = m[1];
                const name = extractTag(inner, 'name') || extractTag(inner, 'title') || item.defaultName;
                const desc =
                    extractTag(inner, 'description') ||
                    extractTag(inner, 'desc') ||
                    stripXmlTags(inner).trim();
                threads.push({
                    id: item.defaultId,
                    name: name.trim(),
                    description: desc.trim() || `${item.defaultName} driving key narrative dynamics.`
                });
            }
        }
    }

    if (threads.length === 0) {
        const numberedThreadRegex = /<thread[_-]?(\d+)(?:\s+[^>]*)?>([\s\S]*?)<\/thread[_-]?\1>/gi;
        let numMatch: RegExpExecArray | null;
        while ((numMatch = numberedThreadRegex.exec(threadsSearchArea)) !== null) {
            const num = numMatch[1];
            const inner = numMatch[2];
            const id = extractTag(inner, 'thread_id') || extractTag(inner, 'id') || `T${num}`;
            const name = extractTag(inner, 'name') || extractTag(inner, 'title') || `Thread ${num}`;
            const desc =
                extractTag(inner, 'description') || extractTag(inner, 'desc') || stripXmlTags(inner).trim();
            threads.push({
                id: id.trim(),
                name: name.trim(),
                description: desc.trim()
            });
        }
    }

    if (threads.length === 0 && threadsContainerMatch) {
        const listText = threadsContainerMatch[1];
        const lines = listText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        let listIdx = 0;
        for (const line of lines) {
            const lineMatch = line.match(
                /^(?:[-*•]|\d+[.)]|[A-D][.:-])\s*(?:\[?(T\d+)\]?[:\s-]*)?(?:([^:\n-]+)[:\s-]+)?\s*(.+)$/i
            );
            if (lineMatch && lineMatch[3] && lineMatch[3].length > 10) {
                const id = lineMatch[1] || `T${listIdx + 1}`;
                const name = lineMatch[2] ? lineMatch[2].trim() : `Thread ${listIdx + 1}`;
                const desc = lineMatch[3].trim();
                threads.push({ id, name, description: desc });
                listIdx++;
            }
        }
    }

    if (threads.length < 2) {
        const existingIds = new Set(threads.map((t) => String(t.id).toUpperCase()));
        const synthesized: NarrativeThreadEntry[] = [
            {
                id: 'T1',
                name: 'Main Plot Thread (A-Story)',
                description: incitingIncident
                    ? `External narrative arc catalyzed by: ${incitingIncident}. Stakes escalate toward the resolution of the core conflict.`
                    : 'Central external conflict and physical stakes driving the main plot forward.'
            },
            {
                id: 'T2',
                name: 'Relationship / Thematic Mirror (B-Story)',
                description: coreThematicArgument
                    ? `Interpersonal dynamics and relationship conflicts directly testing the thematic argument: "${coreThematicArgument}".`
                    : 'Key relationship subplot mirroring and complicating the external conflict through personal vulnerability.'
            },
            {
                id: 'T3',
                name: 'Internal Transformation (C-Story)',
                description:
                    startingValueState && endingValueState
                        ? `The protagonist's internal psychological shift from "${startingValueState}" to "${endingValueState}".`
                        : "The protagonist's internal psychological evolution from their core flaw/lie to hard-won truth."
            }
        ];

        for (const synthThread of synthesized) {
            if (threads.length >= 3) break;
            if (!existingIds.has(synthThread.id)) {
                threads.push(synthThread);
                existingIds.add(synthThread.id);
            }
        }
    }

    for (let i = 0; i < threads.length; i++) {
        if (!threads[i].id) threads[i].id = `T${i + 1}`;
        if (!threads[i].name) threads[i].name = `Thread ${i + 1}`;
        if (!threads[i].description) {
            threads[i].description = `Narrative progression for ${threads[i].name} advancing the dramatic tension and story arc.`;
        }
    }

    const rawSecrets: Array<Record<string, unknown>> = [];
    const vaultContainerMatch =
        /<(?:secret_vault|epistemic_ledger|secrets|vault)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:secret_vault|epistemic_ledger|secrets|vault)>/i.exec(
            text
        );
    const vaultSearchArea = vaultContainerMatch ? vaultContainerMatch[1] : text;
    const secretRegex = /<(?:secret|mystery|twist_secret)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:secret|mystery|twist_secret)>/gi;
    let secMatch: RegExpExecArray | null;
    let secIdx = 0;
    while ((secMatch = secretRegex.exec(vaultSearchArea)) !== null) {
        const sBlock = secMatch[1];
        const fullSecTag = secMatch[0];
        const idAttr = fullSecTag.match(/\bid=["']([^"']+)["']/i);
        const title = extractTag(sBlock, 'title') || extractTag(sBlock, 'name') || `Secret ${secIdx + 1}`;
        const category = extractTag(sBlock, 'category') || extractTag(sBlock, 'type') || 'plot_mystery';
        const truth =
            extractTag(sBlock, 'truth') ||
            extractTag(sBlock, 'revelation') ||
            extractTag(sBlock, 'description') ||
            title;
        const publicBelief =
            extractTag(sBlock, 'public_cover_story') ||
            extractTag(sBlock, 'cover_story') ||
            extractTag(sBlock, 'public_belief') ||
            'Established normal baseline belief.';
        const knownBy = extractTag(sBlock, 'known_by') || extractTag(sBlock, 'known_by_characters') || '';
        const concealedFrom =
            extractTag(sBlock, 'concealed_from') || extractTag(sBlock, 'concealed_from_characters') || '';
        const targetAct = extractTag(sBlock, 'reveal_target_act') || extractTag(sBlock, 'act') || '3';
        const targetSeq = extractTag(sBlock, 'reveal_target_sequence') || extractTag(sBlock, 'sequence') || '7';

        const clueSchedule: Array<Record<string, unknown>> = [];
        const clueRegex = /<clue(?:\s+[^>]*)?>([\s\S]*?)<\/clue>/gi;
        let clueMatch: RegExpExecArray | null;
        while ((clueMatch = clueRegex.exec(sBlock)) !== null) {
            const cBlock = clueMatch[1];
            const fullClueTag = clueMatch[0];
            const seqAttr = fullClueTag.match(/\bsequence=["']?(\d+)["']?/i);
            const clueSeq = seqAttr ? Number(seqAttr[1]) : Number(extractTag(cBlock, 'sequence') || 2);
            const directive =
                extractTag(cBlock, 'behavioral_directive') ||
                extractTag(cBlock, 'directive') ||
                extractTag(cBlock, 'action') ||
                '';
            const reason =
                extractTag(cBlock, 'benign_reason') ||
                extractTag(cBlock, 'reason') ||
                extractTag(cBlock, 'rationale') ||
                'Everyday routine circumstance.';
            if (directive) {
                clueSchedule.push({
                    sequence_number: clueSeq,
                    behavioral_directive: directive,
                    benign_reason: reason,
                    seeded_in_prose: false
                });
            }
        }

        rawSecrets.push({
            id: (idAttr ? idAttr[1] : null) || `sec_${secIdx + 1}`,
            title,
            category,
            truth,
            public_cover_story: publicBelief,
            known_by: knownBy,
            concealed_from: concealedFrom,
            reveal_target_act: targetAct,
            reveal_target_sequence: targetSeq,
            clue_schedule: clueSchedule
        });
        secIdx++;
    }

    const secretVault = normalizeSecretVault(rawSecrets, {
        majorSurprisesAndTwists,
        characterArcs: charArcs,
        incitingIncident
    });

    return {
        starting_value_state: startingValueState,
        ending_value_state: endingValueState,
        major_surprises_and_twists: majorSurprisesAndTwists,
        core_thematic_argument: coreThematicArgument,
        inciting_incident: incitingIncident,
        character_arcs: charArcs,
        threads,
        secret_vault: secretVault
    };
}

/** Structured extractor for Genre Classification (Tier 0.1). */
export function parseStructuredGenre(
    rawGenre: unknown,
    fallbackObj: Record<string, unknown> = {}
): StructuredGenre {
    if (!rawGenre && !fallbackObj) {
        return { primaryEngine: '', playedStraight: '', ruthlesslySubverted: '', boundaries: '', raw: '' };
    }
    const obj = (
        typeof rawGenre === 'object' && rawGenre !== null
            ? rawGenre
            : typeof fallbackObj === 'object' && fallbackObj !== null
              ? fallbackObj
              : {}
    ) as Record<string, unknown>;
    const text =
        typeof rawGenre === 'string'
            ? rawGenre
            : String(obj.genre_raw || obj.genre || '');

    const primaryEngine = String(
        obj.primary_engine ||
            obj.primaryEngine ||
            extractTag(text, 'primary_engine') ||
            extractTag(text, 'contradiction_synthesis') ||
            extractTag(text, 'sub_genre') ||
            extractTag(text, 'engine') ||
            ''
    );
    const tropesBlock = extractTag(text, 'tropes') || text;
    const playedStraight = String(
        obj.tropes_played_straight ||
            obj.played_straight ||
            obj.playedStraight ||
            extractTag(tropesBlock, 'played_straight') ||
            ''
    );
    const ruthlesslySubverted = String(
        obj.tropes_subverted ||
            obj.ruthlessly_subverted ||
            obj.ruthlesslySubverted ||
            extractTag(tropesBlock, 'ruthlessly_subverted') ||
            extractTag(tropesBlock, 'subverted') ||
            ''
    );
    const boundaries = String(obj.boundaries || extractTag(text, 'boundaries') || '');

    const cleanFallback =
        !primaryEngine && !playedStraight && !ruthlesslySubverted && !boundaries && text
            ? stripXmlTags(text)
            : '';

    return {
        primaryEngine: primaryEngine ? decodeXmlEntities(primaryEngine).trim() : cleanFallback,
        playedStraight: playedStraight ? decodeXmlEntities(playedStraight).trim() : '',
        ruthlesslySubverted: ruthlesslySubverted ? decodeXmlEntities(ruthlesslySubverted).trim() : '',
        boundaries: boundaries ? decodeXmlEntities(boundaries).trim() : '',
        raw: text
    };
}

/** Structured extractor for Tone & Atmosphere (Tier 0.1). */
export function parseStructuredTone(
    rawTone: unknown,
    fallbackObj: Record<string, unknown> = {}
): StructuredTone {
    if (!rawTone && !fallbackObj) {
        return { authorialTriangulation: '', sensoryDirective: '', raw: '' };
    }
    const obj = (
        typeof rawTone === 'object' && rawTone !== null
            ? rawTone
            : typeof fallbackObj === 'object' && fallbackObj !== null
              ? fallbackObj
              : {}
    ) as Record<string, unknown>;
    const text =
        typeof rawTone === 'string'
            ? rawTone
            : String(obj.tone_raw || obj.mood || '');

    const authorialTriangulation = String(
        obj.authorial_triangulation ||
            obj.authorialTriangulation ||
            extractTag(text, 'authorial_triangulation') ||
            extractTag(text, 'author_triangulation') ||
            ''
    );
    const sensoryDirective = String(
        obj.sensory_directive ||
            obj.sensoryDirective ||
            extractTag(text, 'sensory_directive') ||
            extractTag(text, 'sensory_lens') ||
            ''
    );

    const cleanFallback = !authorialTriangulation && !sensoryDirective && text ? stripXmlTags(text) : '';

    return {
        authorialTriangulation: authorialTriangulation
            ? decodeXmlEntities(authorialTriangulation).trim()
            : cleanFallback,
        sensoryDirective: sensoryDirective ? decodeXmlEntities(sensoryDirective).trim() : '',
        raw: text
    };
}

/** Structured extractor for Writing Style Description (Tier 0.1). */
export function parseStructuredStyle(
    rawStyle: unknown,
    fallbackObj: Record<string, unknown> = {}
): StructuredStyle {
    if (!rawStyle && !fallbackObj) {
        return { focalizerBias: '', syntacticRhythm: '', antiPatterns: '', raw: '' };
    }
    const obj = (
        typeof rawStyle === 'object' && rawStyle !== null
            ? rawStyle
            : typeof fallbackObj === 'object' && fallbackObj !== null
              ? fallbackObj
              : {}
    ) as Record<string, unknown>;
    const text =
        typeof rawStyle === 'string'
            ? rawStyle
            : String(obj.style_raw || obj.writing_guide || '');

    const focalizerBias = String(
        obj.focalizer_bias ||
            obj.focalizerBias ||
            extractTag(text, 'focalizer_bias') ||
            extractTag(text, 'bias') ||
            ''
    );
    const syntacticRhythm = String(
        obj.syntactic_rhythm ||
            obj.syntacticRhythm ||
            extractTag(text, 'syntactic_rhythm') ||
            extractTag(text, 'rhythm') ||
            ''
    );

    const antiPatternTags = extractTagList(text, 'anti_patterns');
    let antiPatterns: string;
    if (obj.anti_patterns || obj.antiPatterns) {
        antiPatterns = String(obj.anti_patterns || obj.antiPatterns);
    } else if (antiPatternTags && antiPatternTags.length > 0) {
        antiPatterns = antiPatternTags.map((ap) => decodeXmlEntities(ap).trim()).join('\n\n');
    } else {
        antiPatterns = extractTag(text, 'anti_patterns') || extractTag(text, 'anti_pattern');
    }

    const cleanFallback = !focalizerBias && !syntacticRhythm && !antiPatterns && text ? stripXmlTags(text) : '';

    return {
        focalizerBias: focalizerBias ? decodeXmlEntities(focalizerBias).trim() : cleanFallback,
        syntacticRhythm: syntacticRhythm ? decodeXmlEntities(syntacticRhythm).trim() : '',
        antiPatterns: antiPatterns ? decodeXmlEntities(antiPatterns).trim() : '',
        raw: text
    };
}

/** Builds standardized `<genre_classification>`, `<tone_and_atmosphere>`, and `<writing_style_description>` blocks. */
export function buildGenreToneStyleBlocks(
    styleObj: Record<string, unknown> = {},
    { includeTechnicalSpecs = false }: { includeTechnicalSpecs?: boolean } = {}
): string {
    const style = ((styleObj?.style as Record<string, unknown> | undefined) || styleObj || {}) as Record<
        string,
        unknown
    >;
    const parsedGenre = parseStructuredGenre(style.genre_raw || style.genre, style);
    const parsedTone = parseStructuredTone(style.tone_raw || style.mood, style);
    const parsedStyle = parseStructuredStyle(style.style_raw || style.writing_guide, style);

    const primaryEngine = parsedGenre.primaryEngine || (style.genre ? stripXmlTags(style.genre) : 'Fiction');
    const playedStraight = parsedGenre.playedStraight || 'Standard genre conventions';
    const ruthlesslySubverted = parsedGenre.ruthlesslySubverted || 'Subvert predictable clichés';
    const boundaries = parsedGenre.boundaries || 'No arbitrary immersion breaks';

    const authorialTriangulation =
        parsedTone.authorialTriangulation || (style.mood ? stripXmlTags(style.mood) : 'Evocative and grounded');
    const sensoryDirective =
        parsedTone.sensoryDirective ||
        "Filter physical details through the focalizer character's emotional state and worldview";

    const focalizerBias =
        parsedStyle.focalizerBias || "Distort descriptions through the protagonist's biases and psychological blind spots";
    const syntacticRhythm = parsedStyle.syntacticRhythm || 'Dynamic sentence cadence matching scene pacing and tension';
    const antiPatterns =
        parsedStyle.antiPatterns || 'Avoid melodrama, purple prose, empty exposition, and redundant adverbs';

    const genreBlock = `<genre_classification>
  <primary_engine>${primaryEngine}</primary_engine>
  <played_straight>${playedStraight}</played_straight>
  <ruthlessly_subverted>${ruthlesslySubverted}</ruthlessly_subverted>
  <boundaries>${boundaries}</boundaries>
</genre_classification>`;

    const toneBlock = `<tone_and_atmosphere>
  <authorial_triangulation>${authorialTriangulation}</authorial_triangulation>
  <sensory_directive>${sensoryDirective}</sensory_directive>
</tone_and_atmosphere>`;

    let techLines = '';
    if (includeTechnicalSpecs) {
        techLines = `\n  <narrative_pov>${style.pov || 'Third-Person Limited'}</narrative_pov>\n  <narrative_tense>${style.tense || 'Present Tense'}</narrative_tense>`;
    }

    const styleBlock = `<writing_style_description>
  <focalizer_bias>${focalizerBias}</focalizer_bias>
  <syntactic_rhythm>${syntacticRhythm}</syntactic_rhythm>
  <anti_patterns>${antiPatterns}</anti_patterns>${techLines}
</writing_style_description>`;

    return `${genreBlock}\n\n${toneBlock}\n\n${styleBlock}`;
}

/** Builds standardized `<genre_classification>` and `<tone_and_atmosphere>` blocks without writing style block. */
export function buildGenreToneBlocks(styleObj: Record<string, unknown> = {}): string {
    const style = ((styleObj?.style as Record<string, unknown> | undefined) || styleObj || {}) as Record<
        string,
        unknown
    >;
    const parsedGenre = parseStructuredGenre(style.genre_raw || style.genre, style);
    const parsedTone = parseStructuredTone(style.tone_raw || style.mood, style);

    const primaryEngine = parsedGenre.primaryEngine || (style.genre ? stripXmlTags(style.genre) : 'Fiction');
    const playedStraight = parsedGenre.playedStraight || 'Standard genre conventions';
    const ruthlesslySubverted = parsedGenre.ruthlesslySubverted || 'Subvert predictable clichés';
    const boundaries = parsedGenre.boundaries || 'No arbitrary immersion breaks';

    const authorialTriangulation =
        parsedTone.authorialTriangulation || (style.mood ? stripXmlTags(style.mood) : 'Evocative and grounded');
    const sensoryDirective =
        parsedTone.sensoryDirective ||
        "Filter physical details through the focalizer character's emotional state and worldview";

    const genreBlock = `<genre_classification>
  <primary_engine>${primaryEngine}</primary_engine>
  <played_straight>${playedStraight}</played_straight>
  <ruthlessly_subverted>${ruthlesslySubverted}</ruthlessly_subverted>
  <boundaries>${boundaries}</boundaries>
</genre_classification>`;

    const toneBlock = `<tone_and_atmosphere>
  <authorial_triangulation>${authorialTriangulation}</authorial_triangulation>
  <sensory_directive>${sensoryDirective}</sensory_directive>
</tone_and_atmosphere>`;

    return `${genreBlock}\n\n${toneBlock}`;
}

/** Formats `<world_primer>` and `<relevant_lore>` XML blocks for prompt insertion. */
export function formatLoreForPrompt(
    worldPrimer: string | null | undefined,
    relevantLore: unknown
): string {
    const parts: string[] = [];
    if (worldPrimer && typeof worldPrimer === 'string' && worldPrimer.trim()) {
        parts.push(`<world_primer>${worldPrimer.trim()}</world_primer>`);
    }
    if (relevantLore) {
        let loreText = '';
        if (Array.isArray(relevantLore)) {
            loreText = relevantLore
                .map((rawItem) => {
                    if (!rawItem) return '';
                    if (typeof rawItem === 'string') return rawItem.trim();
                    if (typeof rawItem !== 'object') return String(rawItem);
                    const item = rawItem as Record<string, unknown>;
                    if (typeof item.text === 'string' && item.text) return item.text.trim();
                    if (item.topic) {
                        const heading = `### ${item.topic}`;
                        const body = String(item.detail || item.content || item.description || '');
                        return body ? `${heading}\n${body}`.trim() : heading;
                    }
                    if (item.title) {
                        const heading = `### ${item.title}`;
                        const body = String(item.content || item.detail || item.description || '');
                        return body ? `${heading}\n${body}`.trim() : heading;
                    }
                    if (item.content) return String(item.content).trim();
                    if (item.detail) return String(item.detail).trim();
                    return JSON.stringify(item);
                })
                .filter(Boolean)
                .join('\n\n');
        } else if (typeof relevantLore === 'string' && relevantLore.trim()) {
            loreText = relevantLore.trim();
        }
        if (loreText) {
            parts.push(`<relevant_lore>\n${loreText}\n</relevant_lore>`);
        }
    }
    return parts.join('\n\n');
}

/**
 * Wraps `story.author_note` into `<author_note>...</author_note>` if present, followed by the
 * story's content dial as `<content_limits>` when it has one. Both are the author's standing
 * direction, so every prompt that carries one carries the other.
 */
export function getAuthorNoteXml(story: (Partial<Story> & Record<string, unknown>) | null | undefined): string {
    if (!story) return '';
    const note =
        story.author_note && String(story.author_note).trim()
            ? `\n<author_note>\n${String(story.author_note).trim()}\n</author_note>\n`
            : '';
    return note + contentDialXml(story.content_dial);
}

/** Normalizes raw sequence array into a complete 8-sequence Frank Daniel structure. */
export function normalizeSequences(rawSequences: unknown): NormalizedSequence[] {
    if (!rawSequences || !Array.isArray(rawSequences) || rawSequences.length === 0) {
        return [];
    }
    const result: NormalizedSequence[] = [];
    for (let idx = 0; idx < 8; idx++) {
        const seqNum = idx + 1;
        const defaultAct = actForSequence(seqNum);
        const defaultFn = SEQUENCE_DEFAULT_FUNCTIONS[idx % 8] || `Sequence ${seqNum}`;

        let seq = rawSequences.find(
            (s) =>
                s &&
                typeof s === 'object' &&
                (parseInt(String((s as Record<string, unknown>).number), 10) === seqNum ||
                    parseInt(String((s as Record<string, unknown>).id), 10) === seqNum)
        ) as Record<string, unknown> | undefined;

        const atIdx = rawSequences[idx] as Record<string, unknown> | undefined;
        if (!seq && atIdx && (!atIdx.number || parseInt(String(atIdx.number), 10) === seqNum)) {
            seq = atIdx;
        }

        if (seq) {
            const parentAct = parseActNumber(
                seq.parent_act != null ? seq.parent_act : defaultAct,
                defaultAct
            );
            const desc =
                String(seq.description || seq.summary || '') ||
                `Narrative developments for Sequence ${seqNum} (${defaultFn}) in Act ${parentAct}.`;
            const summ =
                String(seq.summary || seq.description || '') ||
                `Narrative developments for Sequence ${seqNum} (${defaultFn}) in Act ${parentAct}.`;

            result.push({
                ...seq,
                id: String(seqNum),
                number: seqNum,
                parent_act: parentAct,
                title: String(seq.title || `Sequence ${seqNum}: ${defaultFn}`),
                sequence_function: String(seq.sequence_function || defaultFn),
                dramatic_question: String(
                    seq.dramatic_question ||
                        seq.tactical_question ||
                        `Will the protagonist navigate the challenges of Sequence ${seqNum}?`
                ),
                tactical_question: String(
                    seq.dramatic_question ||
                        seq.tactical_question ||
                        `Will the protagonist navigate the challenges of Sequence ${seqNum}?`
                ),
                starting_state: String(seq.starting_state || seq.entry_anchor || ''),
                four_corner_movement: String(seq.four_corner_movement || seq.web_movement || ''),
                description: desc,
                summary: summ,
                sequence_objective: String(
                    seq.sequence_objective || `Advance the narrative through Sequence ${seqNum} in Act ${parentAct}.`
                ),
                threads_advanced: Array.isArray(seq.threads_advanced)
                    ? (seq.threads_advanced as string[])
                    : [],
                thread_storylines: Array.isArray(seq.thread_storylines)
                    ? (seq.thread_storylines as ThreadStorylineEntry[])
                    : [],
                characters_in_focus: Array.isArray(seq.characters_in_focus)
                    ? (seq.characters_in_focus as string[])
                    : [],
                sequence_climax: String(seq.sequence_climax || ''),
                ending_hook: String(seq.ending_hook || ''),
                next_sequence_boundary_guard: String(
                    seq.next_sequence_boundary_guard || seq.boundary_guard || ''
                )
            });
        } else {
            result.push({
                id: String(seqNum),
                number: seqNum,
                parent_act: defaultAct,
                title: `Sequence ${seqNum}: ${defaultFn}`,
                sequence_function: defaultFn,
                dramatic_question: `Will the protagonist navigate the challenges of Sequence ${seqNum} in Act ${defaultAct}?`,
                tactical_question: `Will the protagonist navigate the challenges of Sequence ${seqNum} in Act ${defaultAct}?`,
                starting_state: '',
                description: `Narrative developments for Sequence ${seqNum} (${defaultFn}) in Act ${defaultAct}.`,
                summary: `Narrative developments for Sequence ${seqNum} (${defaultFn}) in Act ${defaultAct}.`,
                sequence_objective: `Advance the narrative through Sequence ${seqNum} in Act ${defaultAct}.`,
                threads_advanced: [],
                thread_storylines: [],
                characters_in_focus: [],
                sequence_climax: '',
                ending_hook: '',
                next_sequence_boundary_guard: ''
            });
        }
    }
    return result;
}

/** Parses Sequence Agent XML output and normalizes it to 8 sequences. */
export function parseSequencesXML(text: string): NormalizedSequence[] {
    if (!text || typeof text !== 'string') return [];
    const sequencesMatch = /<sequences(?:\s+[^>]*)?>([\s\S]*?)<\/sequences>/i.exec(text);
    const sequencesXML = sequencesMatch ? sequencesMatch[1] : text;

    const seqRegex = /<(?:sequence|seq)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:sequence|seq)>/gi;
    const parsedSequences: Array<Record<string, unknown>> = [];
    let match: RegExpExecArray | null;
    let idx = 0;

    const parseSingleSeq = (seqData: string, seqNumHint: number) => {
        const threadStorylinesMatch = /<thread_storylines(?:\s+[^>]*)?>([\s\S]*?)<\/thread_storylines>/i.exec(
            seqData
        );
        const parsedThreadStorylines: ThreadStorylineEntry[] = [];
        if (threadStorylinesMatch) {
            const tsRegex = /<thread_storyline(?:\s+[^>]*)?>([\s\S]*?)<\/thread_storyline>/gi;
            let tsMatch: RegExpExecArray | null;
            while ((tsMatch = tsRegex.exec(threadStorylinesMatch[1])) !== null) {
                parsedThreadStorylines.push({
                    thread_id: extractTag(tsMatch[1], 'thread_id') || '',
                    storyline_advancement: extractTag(tsMatch[1], 'storyline_advancement') || '',
                    weaving_interaction: extractTag(tsMatch[1], 'weaving_interaction') || ''
                });
            }
        }
        let threadsAdvanced = extractTagList(seqData, 'threads_advanced', 'thread');
        if (threadsAdvanced.length === 0 && parsedThreadStorylines.length > 0) {
            threadsAdvanced = parsedThreadStorylines.map((ts) => ts.thread_id).filter(Boolean);
        }

        const parsedNum = parseInt(extractTag(seqData, 'number'), 10) || seqNumHint;
        const defaultAct = actForSequence(parsedNum);
        const parsedAct = parseActNumber(extractTag(seqData, 'parent_act'), defaultAct);
        const defaultFn = SEQUENCE_DEFAULT_FUNCTIONS[(parsedNum - 1) % 8] || `Sequence ${parsedNum}`;

        return {
            id: String(parsedNum),
            number: parsedNum,
            parent_act: parsedAct,
            title: extractTag(seqData, 'title') || `Sequence ${parsedNum}: ${defaultFn}`,
            sequence_function: extractTag(seqData, 'sequence_function') || defaultFn,
            dramatic_question:
                extractTag(seqData, 'dramatic_question') || extractTag(seqData, 'tactical_question') || '',
            tactical_question:
                extractTag(seqData, 'dramatic_question') || extractTag(seqData, 'tactical_question') || '',
            starting_state: extractTag(seqData, 'starting_state') || extractTag(seqData, 'entry_anchor') || '',
            description: extractTag(seqData, 'description') || '',
            sequence_objective: extractTag(seqData, 'sequence_objective') || '',
            threads_advanced: threadsAdvanced,
            thread_storylines: parsedThreadStorylines,
            characters_in_focus: extractTagList(seqData, 'characters_in_focus', 'character'),
            four_corner_movement:
                extractTag(seqData, 'four_corner_movement') || extractTag(seqData, 'web_movement') || '',
            sequence_climax: extractTag(seqData, 'sequence_climax') || '',
            ending_hook: extractTag(seqData, 'ending_hook') || '',
            next_sequence_boundary_guard:
                extractTag(seqData, 'next_sequence_boundary_guard') ||
                extractTag(seqData, 'boundary_guard') ||
                ''
        };
    };

    while ((match = seqRegex.exec(sequencesXML)) !== null) {
        parsedSequences.push(parseSingleSeq(match[1], idx + 1));
        idx++;
    }

    if (parsedSequences.length === 0) {
        const numberedRegex = /<(?:sequence|seq)_?(\d+)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:sequence|seq)_?\1>/gi;
        while ((match = numberedRegex.exec(sequencesXML)) !== null) {
            const numHint = parseInt(match[1], 10) || idx + 1;
            parsedSequences.push(parseSingleSeq(match[2], numHint));
            idx++;
        }
    }

    return normalizeSequences(parsedSequences);
}

/** Parses string/object value shifts (`"Calm -> Panic"`, JSON string, or `{ start_state, end_state }`). */
export function parseValueShiftInput(rawVal: unknown): ValueShift {
    if (!rawVal) return { start_state: '', end_state: '' };
    if (typeof rawVal === 'object' && rawVal !== null) {
        const rec = rawVal as Record<string, unknown>;
        const start = String(rec.start_state ?? rec.start ?? '').trim();
        const end = String(rec.end_state ?? rec.end ?? '').trim();
        if (!end && start && /\s*(?:->|➔|→)\s*/.test(start)) {
            const parts = start.split(/\s*(?:->|➔|→)\s*/);
            return {
                start_state: parts[0].trim(),
                end_state: parts.slice(1).join(' -> ').trim()
            };
        }
        return { start_state: start, end_state: end };
    }
    const str = String(rawVal).trim();
    if (!str) return { start_state: '', end_state: '' };
    if (str.startsWith('{')) {
        try {
            const obj = JSON.parse(str);
            if (obj && typeof obj === 'object') {
                return parseValueShiftInput(obj);
            }
        } catch {
            // Fall through
        }
    }
    const parts = str.split(/\s*(?:->|➔|→)\s*/);
    if (parts.length >= 2) {
        return { start_state: parts[0].trim(), end_state: parts.slice(1).join(' -> ').trim() };
    }
    return { start_state: str, end_state: '' };
}

/** Parses labeled legacy scene description text into structured blueprint fields. */
export function parseLegacyDescriptionFields(descStr: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    if (!descStr || typeof descStr !== 'string') return result;
    const labelMap: Record<string, string> = {
        setting: 'setting',
        goal: 'objective',
        objective: 'objective',
        'scene events': 'scene_events',
        events: 'scene_events',
        'value shift': 'value_shift',
        'exit hook': 'exit_hook',
        'surface activity': 'surface_activity',
        'the hinge moment': 'the_hinge_moment',
        'hinge moment': 'the_hinge_moment',
        'atmospheric overview': 'atmospheric_overview',
        atmosphere: 'atmospheric_overview',
        'entrance conditions': 'entrance_conditions',
        'exit conditions': 'exit_conditions',
        pov: 'pov_character',
        'pov character': 'pov_character',
        'transition jump': 'transition_jump'
    };
    const lines = descStr.replace(/\r\n/g, '\n').split('\n');
    let currentKey: string | null = null;
    const looseLines: string[] = [];
    const mdHeaderRegex = /^\s*\*\*([^*:]+):\*\*\s*(.*)$/;
    const plainHeaderRegex =
        /^\s*(Setting|Goal|Objective|Scene Events|Value Shift|Exit Hook|Surface Activity|The Hinge Moment|Hinge Moment|Atmospheric Overview|Entrance Conditions|Exit Conditions|POV Character|Transition Jump):\s*(.*)$/i;

    for (const line of lines) {
        const match = line.match(mdHeaderRegex) || line.match(plainHeaderRegex);
        if (match) {
            const rawLabel = match[1].trim().toLowerCase();
            const mappedKey = labelMap[rawLabel];
            if (mappedKey) {
                currentKey = mappedKey;
                const firstVal = (match[2] || '').trim();
                if (firstVal) {
                    result[currentKey] = result[currentKey] ? `${result[currentKey]}\n${firstVal}` : firstVal;
                }
                continue;
            }
        }
        if (currentKey) {
            result[currentKey] = result[currentKey] ? `${result[currentKey]}\n${line}` : line;
        } else if (line.trim()) {
            looseLines.push(line.trim());
        }
    }

    Object.keys(result).forEach((k) => {
        if (typeof result[k] === 'string') {
            result[k] = result[k].trim();
        }
    });
    if (looseLines.length > 0) {
        result._loose_text = looseLines.join('\n').trim();
    }
    return result;
}

/** Formats a scene blueprint object into a concise markdown summary. */
export function formatSceneSummary(scene: Partial<SceneBlueprint> & Record<string, unknown> = {}): string {
    if (!scene || typeof scene !== 'object') return '';
    const vsObj = parseValueShiftInput(scene.value_shift);
    const vsText = vsObj.start_state
        ? vsObj.end_state
            ? `${vsObj.start_state} -> ${vsObj.end_state}`
            : vsObj.start_state
        : vsObj.end_state || '';
    const parts: string[] = [];
    if (scene.setting) parts.push(`**Setting:** ${scene.setting}`);
    if (scene.pov_character) parts.push(`**POV:** ${scene.pov_character}`);
    const objText = scene.objective || scene.goal || '';
    if (objText) parts.push(`**Goal:** ${objText}`);
    if (scene.scene_events) parts.push(`**Scene Events:** ${scene.scene_events}`);
    if (vsText) parts.push(`**Value Shift:** ${vsText}`);
    if (scene.exit_hook) parts.push(`**Exit Hook:** ${scene.exit_hook}`);
    if (scene.surface_activity) parts.push(`**Surface Activity:** ${scene.surface_activity}`);
    const hingeVal = scene.the_hinge_moment || scene.hinge_moment || '';
    if (hingeVal) parts.push(`**The Hinge Moment:** ${hingeVal}`);
    if (scene.atmospheric_overview) parts.push(`**Atmospheric Overview:** ${scene.atmospheric_overview}`);
    return parts.join('\n');
}

/** Normalizes a raw scene blueprint object into strict canonical fields, resolving cast references and mode. */
export function normalizeSceneBlueprint(
    rawScene: Record<string, unknown> = {},
    idx = 0,
    sequenceNumber = 1,
    storyCast: CastMember[] = []
): SceneBlueprint {
    const safeRaw = rawScene && typeof rawScene === 'object' ? rawScene : {};
    const {
        description: legacyDesc,
        hinge_moment: legacyHingeAlias,
        mc_heart: legacyMcHeartAlias,
        counterpart_heart: legacyOtherHeartAlias,
        micro_conflict: legacyMicroAlias,
        pacing_tempo: legacyTempoAlias,
        ...restScene
    } = safeRaw;
    const legacy = parseLegacyDescriptionFields(legacyDesc);
    const sceneNum = `${sequenceNumber}.${idx + 1}`;
    const rawType = String(restScene.scene_type || restScene.type || '').toUpperCase();
    let sceneType: string;

    if (rawType.includes('REACTIVE') || rawType.includes('SEQUEL')) {
        sceneType = 'REACTIVE';
    } else if (rawType.includes('PROACTIVE') || rawType.includes('SCENE')) {
        sceneType = 'PROACTIVE';
    } else {
        sceneType = idx % 2 === 0 ? 'PROACTIVE' : 'REACTIVE';
    }

    const parseStrList = (val: unknown): string[] => {
        if (Array.isArray(val)) {
            return val
                .map((x) =>
                    typeof x === 'string'
                        ? x.trim()
                        : ((x as Record<string, unknown>)?.name || String(x || '')).toString().trim()
                )
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        if (typeof val === 'string') {
            return val
                .split(/[,;\n]+/)
                .map((s) => s.trim().replace(/^-\s*/, ''))
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        return [];
    };

    const containsPlaceholder = (val: unknown): boolean => {
        if (typeof val === 'string') {
            return val
                .split(/[,;\n]+/)
                .some((s) => isSerializationPlaceholder(s.replace(/^-\s*/, '').trim()));
        }
        if (Array.isArray(val)) {
            return val.some((x) =>
                isSerializationPlaceholder(
                    typeof x === 'string'
                        ? x
                        : String((x as Record<string, unknown>)?.name || x || '')
                )
            );
        }
        return false;
    };

    const resolveCast = () => {
        const castList = Array.isArray(storyCast) ? storyCast : [];
        const presNames = parseStrList(restScene.characters_present);
        const castNamesRaw = parseStrList(restScene.cast_names);
        const rawIds = parseStrList(restScene.cast_ids);
        let rawNames = [...presNames, ...castNamesRaw];
        if (rawNames.length === 0 && rawIds.length > 0) {
            rawNames = rawIds.map((id) => {
                const found = castList.find(
                    (c) => c.id === id || c.name?.toLowerCase() === id.toLowerCase()
                );
                return found ? found.name : id;
            });
        }
        const hadCastPlaceholder =
            containsPlaceholder(restScene.cast_names) ||
            containsPlaceholder(restScene.characters_present) ||
            containsPlaceholder(restScene.cast_ids);
        if (rawNames.length === 0 && hadCastPlaceholder) {
            if (
                typeof restScene.pov_character === 'string' &&
                restScene.pov_character.trim() &&
                !isSerializationPlaceholder(restScene.pov_character)
            ) {
                rawNames.push(restScene.pov_character.trim());
            }
            if (Array.isArray(restScene.target_epistemic_deltas)) {
                restScene.target_epistemic_deltas.forEach((rawDelta) => {
                    const d = rawDelta as Record<string, unknown> | null;
                    if (
                        typeof d?.holder === 'string' &&
                        d.holder.trim() &&
                        !isSerializationPlaceholder(d.holder)
                    ) {
                        rawNames.push(d.holder.trim());
                    }
                });
            }
            const searchText = [
                restScene.title,
                restScene.pov_character,
                restScene.scene_events,
                restScene.objective,
                restScene.goal,
                restScene.entrance_conditions,
                restScene.entrance_condition,
                restScene.exit_conditions,
                restScene.exit_condition,
                restScene.exit_hook,
                restScene.surface_activity,
                restScene.main_character_heart,
                restScene.other_character_heart,
                restScene.the_hinge_moment,
                restScene.atmospheric_overview,
                legacyDesc
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (searchText && castList.length > 0) {
                castList.forEach((ch) => {
                    if (!ch || !ch.name) return;
                    const cName = String(ch.name).trim().toLowerCase();
                    const cAliases = (
                        Array.isArray(ch.aliases)
                            ? (ch.aliases as unknown[])
                            : Array.isArray(ch.details?.aliases)
                              ? (ch.details!.aliases as unknown[])
                              : []
                    )
                        .map((a) => String(a).trim().toLowerCase())
                        .filter(Boolean);
                    const parts = cName.split(/\s+/);
                    const matched =
                        tokenMatch(searchText, cName) ||
                        cAliases.some((a) => tokenMatch(searchText, a)) ||
                        parts.some(
                            (p) => p.length >= 2 && !STOPWORDS.has(p) && tokenMatch(searchText, p)
                        );
                    if (matched) rawNames.push(ch.name);
                });
            }
        }
        const seen = new Set<string>();
        const uniqueInputs: string[] = [];
        for (const item of rawNames) {
            const key = item.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueInputs.push(item);
            }
        }
        if (castList.length > 0) {
            const castIds: string[] = [];
            const castNames: string[] = [];
            uniqueInputs.forEach((entry) => {
                const found = castList.find(
                    (c) => c.id === entry || c.name?.toLowerCase() === entry.toLowerCase()
                );
                if (found) {
                    castIds.push(found.id || entry);
                    castNames.push(found.name);
                } else {
                    castIds.push(entry);
                    castNames.push(entry);
                }
            });
            return {
                cast_ids: [...castIds],
                cast_names: [...castNames],
                characters_present: [...castNames]
            };
        }
        return {
            cast_ids: rawIds.length > 0 ? [...rawIds] : [...uniqueInputs],
            cast_names: [...uniqueInputs],
            characters_present: [...uniqueInputs]
        };
    };

    const castFields = resolveCast();
    const canonicalObjective = String(
        restScene.objective || restScene.goal || legacy.objective || ''
    ).trim();
    const canonicalEvents = String(
        restScene.scene_events || legacy.scene_events || legacy._loose_text || restScene.summary || ''
    ).trim();
    const canonicalAtmos = String(
        restScene.atmospheric_overview ||
            (legacy.atmospheric_overview && !legacy.atmospheric_overview.endsWith('...')
                ? legacy.atmospheric_overview
                : '') ||
            legacy.atmospheric_overview ||
            ''
    ).trim();
    const parsedVS = parseValueShiftInput(restScene.value_shift || legacy.value_shift);
    const modalityHand = parseStrList(restScene.modality_hand);

    const normalizeDeltas = (rawDeltas: unknown): EpistemicDeltaEntry[] => {
        if (!Array.isArray(rawDeltas)) return [];
        return rawDeltas
            .map((d) => {
                if (typeof d === 'object' && d !== null) {
                    const rec = d as Record<string, unknown>;
                    const conf = parseFloat(String(rec.to_confidence));
                    return {
                        ...rec,
                        holder: String(rec.holder || rec.character || rec.char || '').trim(),
                        proposition_id: String(
                            rec.proposition_id || rec.proposition || rec.delta || ''
                        ).trim(),
                        operation: String(rec.operation || 'ELEVATE_SUSPICION').trim(),
                        to_stance: String(rec.to_stance || rec.status || 'SUSPECTS_TRUE').trim(),
                        to_confidence: Number.isFinite(conf) ? conf : 0.45,
                        trigger_clue: String(
                            rec.trigger_clue || rec.trigger || rec.change || ''
                        ).trim()
                    };
                }
                const txt = String(d || '').trim();
                const colonIdx = txt.indexOf(':');
                if (colonIdx > 0 && colonIdx < 40) {
                    return {
                        holder: txt.slice(0, colonIdx).trim(),
                        proposition_id: '',
                        operation: 'ELEVATE_SUSPICION',
                        to_stance: 'SUSPECTS_TRUE',
                        to_confidence: 0.45,
                        trigger_clue: txt.slice(colonIdx + 1).trim()
                    };
                }
                return {
                    holder: '',
                    proposition_id: '',
                    operation: 'ELEVATE_SUSPICION',
                    to_stance: 'SUSPECTS_TRUE',
                    to_confidence: 0.45,
                    trigger_clue: txt
                };
            })
            .filter((d) => Boolean(d.holder || d.proposition_id || d.trigger_clue));
    };

    const parseCommitmentList = (val: unknown): string[] => {
        if (Array.isArray(val)) {
            return val
                .map((x) => (typeof x === 'string' ? x.trim() : String(x || '').trim()))
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        if (typeof val === 'string' && val.trim()) {
            return val
                .split(/\n+/)
                .map((s) => s.replace(/^[-*]\s*/, '').trim())
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        return [];
    };

    const rawRelChanges = Array.isArray(restScene.relationship_changes)
        ? restScene.relationship_changes.filter((rc) => rc && !isSerializationPlaceholder(rc))
        : [];
    const rawRelShifts = Array.isArray(restScene.relationship_shifts)
        ? restScene.relationship_shifts.filter((rc) => rc && !isSerializationPlaceholder(rc))
        : [];
    const relChanges =
        rawRelChanges.length > 0
            ? rawRelChanges
            : rawRelShifts.length > 0
              ? rawRelShifts
              : parseCommitmentList(restScene.relationship_changes || restScene.relationship_shifts);

    const rawPov = String(restScene.pov_character || legacy.pov_character || '').trim();
    const cleanPov = isSerializationPlaceholder(rawPov) ? '' : rawPov;

    const rawBridgeSnap = restScene.bridged_to_scene_snapshot as Record<string, unknown> | undefined;
    const sanitizedBridgeSnapshot =
        rawBridgeSnap && typeof rawBridgeSnap === 'object'
            ? {
                  ...rawBridgeSnap,
                  characters_present: (() => {
                      const snapPres = parseStrList(rawBridgeSnap.characters_present);
                      return snapPres.length > 0 ? snapPres : parseStrList(rawBridgeSnap.cast_names);
                  })()
              }
            : rawBridgeSnap;

    const normalized: SceneBlueprint = {
        ...restScene,
        id: (restScene.id as string | undefined) || sceneNum,
        number: (restScene.number as string | number | undefined) || sceneNum,
        title: String(restScene.title || `Scene ${idx + 1}`).trim(),
        scene_type: sceneType,
        pov_character: cleanPov,
        setting: String(restScene.setting || legacy.setting || '').trim(),
        transition_jump: String(restScene.transition_jump || legacy.transition_jump || '').trim(),
        objective: canonicalObjective,
        goal: canonicalObjective,
        scene_events: canonicalEvents,
        value_shift: parsedVS,
        exit_hook: String(restScene.exit_hook || legacy.exit_hook || '').trim(),
        surface_activity: String(restScene.surface_activity || legacy.surface_activity || '').trim(),
        the_hinge_moment: String(
            restScene.the_hinge_moment || legacyHingeAlias || legacy.the_hinge_moment || ''
        ).trim(),
        main_character_heart: String(restScene.main_character_heart || legacyMcHeartAlias || '').trim(),
        other_character_heart: String(
            restScene.other_character_heart || legacyOtherHeartAlias || ''
        ).trim(),
        atmospheric_overview: canonicalAtmos,
        entrance_conditions: String(
            restScene.entrance_conditions ||
                restScene.entrance_condition ||
                legacy.entrance_conditions ||
                ''
        ).trim(),
        exit_conditions: String(
            restScene.exit_conditions || restScene.exit_condition || legacy.exit_conditions || ''
        ).trim(),
        micro_conflict_and_tactic: String(
            restScene.micro_conflict_and_tactic || legacyMicroAlias || ''
        ).trim(),
        sensory_palette: String(restScene.sensory_palette || '').trim(),
        scene_pacing_tempo: String(restScene.scene_pacing_tempo || legacyTempoAlias || '').trim(),
        character_voice_directives: String(restScene.character_voice_directives || '').trim(),
        modality_hand: modalityHand,
        characters_present: castFields.characters_present,
        cast_names: castFields.cast_names,
        cast_ids: castFields.cast_ids,
        epistemic_friction_level: String(restScene.epistemic_friction_level || '').trim(),
        activation_contexts: parseStrList(restScene.activation_contexts),
        target_epistemic_deltas: normalizeDeltas(restScene.target_epistemic_deltas),
        plot_commitments: parseCommitmentList(restScene.plot_commitments),
        relationship_changes: [...relChanges],
        relationship_shifts: [...relChanges],
        ...(sanitizedBridgeSnapshot !== undefined
            ? { bridged_to_scene_snapshot: sanitizedBridgeSnapshot }
            : {}),
        user_edited: Boolean(restScene.user_edited),
        is_bridge_scene: Boolean(restScene.is_bridge_scene)
    };

    normalized.dominant_narrative_mode =
        normalized.dominant_narrative_mode || inferNarrativeModeForScene(normalized);
    return normalized;
}

/** Normalizes every scene blueprint in a sequence array. */
export function normalizeScenesForSequence(
    rawScenes: unknown,
    sequenceNumber = 1,
    storyCast: CastMember[] = []
): SceneBlueprint[] {
    const scenes = Array.isArray(rawScenes) ? rawScenes : [];
    return scenes.map((scene, idx) =>
        normalizeSceneBlueprint((scene as Record<string, unknown>) || {}, idx, sequenceNumber, storyCast)
    );
}

/** Normalizes beats for a scene. */
export function normalizeBeatsForScene(rawBeats: unknown, sceneNumber = '1.1'): BeatItem[] {
    const beats = Array.isArray(rawBeats) ? rawBeats : [];
    return beats.map((rawBeat, idx) => {
        const beat = (rawBeat && typeof rawBeat === 'object' ? rawBeat : {}) as Record<string, unknown>;
        const beatId = `${sceneNumber}.b${idx + 1}`;
        return {
            ...beat,
            id: String(beat.id || beatId),
            scene_id: String(beat.scene_id || sceneNumber),
            action: String(beat.action || beat.char_A_action || 'Physical action unfolds.'),
            reaction: String(beat.reaction || beat.char_B_reaction || 'Immediate reaction follows.'),
            beat_type: beat.beat_type ? String(beat.beat_type).toUpperCase().trim() : 'DRAMATIC',
            initiator: String(beat.initiator || ''),
            reactor: String(beat.reactor || ''),
            participants: String(beat.participants || ''),
            anchor: String(beat.anchor || '—')
        };
    });
}

/** Normalizes intentional style/override rules from array, wrapper object, or JSON string. */
export function normalizeIntentionalOverrides(overrides: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(overrides)) return overrides as Array<Record<string, unknown>>;
    if (!overrides) return [];
    if (typeof overrides === 'string') {
        try {
            const parsed = JSON.parse(overrides);
            return normalizeIntentionalOverrides(parsed);
        } catch {
            return [];
        }
    }
    if (typeof overrides === 'object') {
        const rec = overrides as Record<string, unknown>;
        if (Array.isArray(rec.novelignore_rules)) {
            return rec.novelignore_rules as Array<Record<string, unknown>>;
        }
        if (Array.isArray(rec.rules)) return rec.rules as Array<Record<string, unknown>>;
        if (Array.isArray(rec.intentionalOverrides)) {
            return rec.intentionalOverrides as Array<Record<string, unknown>>;
        }
        if (Array.isArray(rec.overrides)) return rec.overrides as Array<Record<string, unknown>>;
        if (rec.rule_type || rec.pattern || rec.scope) {
            return [rec];
        }
        const values = Object.values(rec);
        if (
            values.length > 0 &&
            values.every(
                (v) =>
                    Boolean(v) &&
                    typeof v === 'object' &&
                    Boolean(
                        (v as Record<string, unknown>).rule_type ||
                            (v as Record<string, unknown>).pattern ||
                            (v as Record<string, unknown>).scope
                    )
            )
        ) {
            return values as Array<Record<string, unknown>>;
        }
    }
    return [];
}
