/**
 * @module domain/continuity/worldUpdates
 * Pure post-scene continuity synchronization across cast profiles, world lore, relationships,
 * hard continuity ledger, Knowledge Graph, Semantic Event Log, and living character states.
 */

import {
    cleanCharacterNameFromVoiceProfile,
    getDeterministicVoiceSeed,
    isValidQwenVoiceProfile,
    synthesizeQwenVoiceDesignProfile,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import { isLegacyValenceEntry } from '@/domain/story';
import {
    logSemanticEvent,
    updateKnowledgeGraph,
    type KnowledgeGraph,
    type KnowledgeGraphEdge,
    type KnowledgeGraphNode
} from './activeState';
import { parseSceneCoordinates, type ContinuityStoryState } from './ledger';

export interface CastUpdateDelta {
    name?: string;
    append_history?: string;
    append_story_events?: string;
    update_goals?: string;
}

export interface NewCharacterDelta extends VoiceCastMember {
    description?: string;
    details?: {
        history?: string;
        story_events?: string;
        goals?: string;
        evolution?: string;
        [key: string]: unknown;
    };
}

export interface RelationshipUpdateDelta {
    from?: string;
    to?: string;
    new_feeling?: string;
    trigger?: string;
}

export interface ContinuityFactDelta {
    category?: string;
    key?: string;
    subject?: string;
    name?: string;
    detail?: string;
    fact?: string;
    value?: string;
    description?: string;
    character?: string;
    entity_id?: string;
    character_id?: string;
    tracking_tag?: string;
    source_scene?: string;
    valid_from_act?: number;
    valid_from_sequence?: number;
    valid_from_scene?: number;
}

export interface CharacterStateUpdateDelta {
    name?: string;
    character_name?: string;
    character?: string;
    physical_state?: string;
    emotional_state?: string;
    unresolved_tension?: string;
    location?: string;
}

export interface WorldUpdatesPayload {
    scene_synopsis?: string;
    cast_updates?: CastUpdateDelta[];
    new_characters?: NewCharacterDelta[];
    relationship_updates?: RelationshipUpdateDelta[];
    continuity_facts?: ContinuityFactDelta[];
    continuity_updates?: ContinuityFactDelta[];
    hard_facts?: ContinuityFactDelta[];
    nodes?: Partial<KnowledgeGraphNode>[];
    edges?: Partial<KnowledgeGraphEdge>[];
    event_log?: Record<string, unknown> | Array<Record<string, unknown>>;
    character_state_updates?: CharacterStateUpdateDelta[];
}

export interface ProcessedLoreEntry extends Record<string, unknown> {
    topic?: string;
    detail?: string;
    is_merged?: boolean;
    merged_from_topic?: string;
}

export interface RelationshipRecord {
    current: string;
    history: Array<{ chapter: string; change: string }>;
    [key: string]: unknown;
}

interface CharacterStateEntry {
    name: string;
    role?: string;
    physical_state: string;
    emotional_state: string;
    unresolved_tension: string;
    location: string;
    goals?: string;
    last_updated_scene: string;
}

export interface WorldUpdateStoryState extends Record<string, unknown> {
    cast?: NewCharacterDelta[];
    lore?: ProcessedLoreEntry[];
    relationships?: Record<string, RelationshipRecord>;
    continuity_ledger?: Array<Record<string, unknown>>;
    knowledge_graph?: KnowledgeGraph;
    event_log?: unknown[];
    character_states?: Record<string, CharacterStateEntry>;
    user_edited?: Record<string, boolean | undefined>;
}

/** Applies post-scene Archivist world updates immutably onto a story snapshot. */
export function applyWorldUpdates<TStory extends WorldUpdateStoryState>(
    baseStory: TStory,
    updates: WorldUpdatesPayload | null | undefined,
    processedLoreStart: ReadonlyArray<ProcessedLoreEntry> = [],
    activeActNum: number | string = 1,
    activeSceneNum: number | string = 1
): TStory {
    if (!baseStory || !updates) return baseStory;

    const newCast: NewCharacterDelta[] = [...(baseStory.cast || [])];
    if (updates.cast_updates) {
        updates.cast_updates.forEach((up) => {
            const idx = newCast.findIndex((c) => c.name === up.name);
            if (idx !== -1) {
                const char = { ...newCast[idx] };
                if (!char.details) {
                    char.details = { history: '', story_events: '', goals: '', evolution: '' };
                } else {
                    char.details = { ...char.details };
                }
                if (up.append_history) {
                    char.details.history = `${char.details.history || ''}\n[New]: ${up.append_history}`;
                }
                if (up.append_story_events) {
                    char.details.story_events = `${char.details.story_events || ''}\n- ${up.append_story_events}`;
                }
                const isGoalsUserEdited = Boolean(
                    char.user_edited_goals ||
                        baseStory.user_edited?.[`cast.${idx}.goals`] ||
                        baseStory.user_edited?.[`cast.${char.name}.goals`] ||
                        baseStory.user_edited?.[`cast.${idx}.core_desire`] ||
                        baseStory.user_edited?.[`cast.${char.name}.core_desire`]
                );
                if (up.update_goals && !isGoalsUserEdited) char.details.goals = up.update_goals;
                newCast[idx] = char;
            }
        });
    }

    if (updates.new_characters) {
        updates.new_characters.forEach((nc) => {
            const newChar: NewCharacterDelta = { ...nc };
            if (!newChar.id) {
                newChar.id =
                    'C_' +
                    (newChar.name ? newChar.name.replace(/\s+/g, '_') : 'char') +
                    '_' +
                    Date.now() +
                    '_' +
                    Math.random().toString(36).substr(2, 5);
            }
            if (!newChar.role) newChar.role = 'Supporting Character';
            if (!newChar.details) {
                newChar.details = {
                    history: nc.description || '',
                    story_events: '',
                    goals: '',
                    evolution: ''
                };
            } else if (typeof newChar.details === 'object') {
                newChar.details = {
                    ...newChar.details,
                    history: newChar.details.history || nc.description || '',
                    story_events: newChar.details.story_events || '',
                    goals: newChar.details.goals || '',
                    evolution: newChar.details.evolution || ''
                };
            }
            if (!newChar.core_flaw) {
                newChar.core_flaw = newChar.details?.history || 'Unspecified flaw';
            }
            if (!newChar.core_desire) {
                newChar.core_desire = newChar.details?.goals || 'Unspecified desire';
            }
            const rawNewCadence = cleanCharacterNameFromVoiceProfile(newChar.vocal_cadence || '', [
                newChar.name || ''
            ]);
            const castAugmentedStory = {
                ...baseStory,
                cast: newCast
            } as unknown as AudioStoryLike;
            newChar.vocal_cadence = isValidQwenVoiceProfile(rawNewCadence)
                ? rawNewCadence
                : synthesizeQwenVoiceDesignProfile(
                      newChar,
                      newChar.name || '',
                      castAugmentedStory
                  );
            if (!newChar.voice_seed) {
                newChar.voice_seed = getDeterministicVoiceSeed(
                    newChar,
                    baseStory as unknown as AudioStoryLike
                );
            }
            if (!newCast.find((c) => c.name === newChar.name)) newCast.push(newChar);
        });
    }

    const newLore: ProcessedLoreEntry[] = [...(baseStory.lore || [])];
    if (processedLoreStart && processedLoreStart.length > 0) {
        processedLoreStart.forEach((pItem) => {
            if (pItem.is_merged) {
                const idx = newLore.findIndex(
                    (l) => l.topic === pItem.merged_from_topic || l.topic === pItem.topic
                );
                if (idx !== -1) {
                    newLore[idx] = { ...newLore[idx], ...pItem };
                } else {
                    newLore.push(pItem);
                }
            } else if (!newLore.find((l) => l.topic === pItem.topic)) {
                newLore.push(pItem);
            }
        });
    }

    const newRels: Record<string, RelationshipRecord> = { ...(baseStory.relationships || {}) };
    if (updates.relationship_updates) {
        updates.relationship_updates.forEach((up) => {
            const key = `${up.from}->${up.to}`;
            if (!newRels[key]) {
                newRels[key] = { current: '', history: [] };
            } else {
                newRels[key] = { ...newRels[key], history: [...(newRels[key].history || [])] };
            }
            newRels[key].current = up.new_feeling || '';
            newRels[key].history.push({
                chapter: `Act ${activeActNum}, Scene ${activeSceneNum}`,
                change: `${up.new_feeling || ''} (${up.trigger || ''})`
            });
        });
    }

    // Ingest Hard Facts from Archivist & prune legacy valence shifts
    const newLedger = (baseStory.continuity_ledger || []).filter(
        (e) => e && !isLegacyValenceEntry(e)
    );

    const cFacts =
        updates.continuity_facts || updates.continuity_updates || updates.hard_facts || [];
    if (Array.isArray(cFacts) && cFacts.length > 0) {
        const coords = parseSceneCoordinates(
            activeSceneNum,
            baseStory as unknown as ContinuityStoryState
        );
        const validAct = typeof activeActNum === 'number' ? activeActNum : coords.act || 1;
        const validSeq = coords.sequence || 1;
        const validScn = coords.scene || 1;
        const sceneRef =
            typeof activeSceneNum === 'string' && activeSceneNum.includes('.')
                ? `Scene ${activeSceneNum}`
                : `Act ${validAct}, Scene ${validScn}`;

        cFacts.forEach((cf) => {
            const category = cf.category || 'Fact';
            const key = (cf.key || cf.subject || cf.name || 'Fact').trim();
            const value = (cf.detail || cf.fact || cf.value || cf.description || '').trim();
            if (!key || !value) return;

            const entityId = cf.character || cf.entity_id || cf.character_id || '';
            const tag =
                cf.tracking_tag ||
                (entityId
                    ? `entity:${entityId}:${key.toLowerCase().replace(/\s+/g, '_')}`
                    : `fact:${category.toLowerCase()}:${key.toLowerCase().replace(/\s+/g, '_')}`);
            const src = cf.source_scene || sceneRef;

            const existingIdx = newLedger.findIndex(
                (e) =>
                    (e.tracking_tag && e.tracking_tag === tag) ||
                    (typeof e.key === 'string' &&
                        e.key.toLowerCase() === key.toLowerCase() &&
                        String(e.category || '').toLowerCase() === category.toLowerCase())
            );

            const entry: Record<string, unknown> = {
                key,
                value,
                category,
                source_scene: src,
                valid_from_act: cf.valid_from_act || validAct,
                valid_from_sequence: cf.valid_from_sequence || validSeq,
                valid_from_scene: cf.valid_from_scene || validScn,
                entity_id: entityId,
                tracking_tag: tag,
                created_at: Date.now(),
                status: 'active'
            };

            if (existingIdx !== -1) {
                newLedger.splice(existingIdx, 1);
            }
            newLedger.push(entry);
        });
    }

    // Tier 1: Update Relational Knowledge Graph
    const kgNodes: Partial<KnowledgeGraphNode>[] = Array.isArray(updates.nodes)
        ? [...updates.nodes]
        : [];
    const kgEdges: Partial<KnowledgeGraphEdge>[] = Array.isArray(updates.edges)
        ? [...updates.edges]
        : [];

    if (updates.cast_updates) {
        updates.cast_updates.forEach((up) => {
            if (!up || !up.name) return;
            kgNodes.push({
                name: up.name,
                type: 'character',
                status: up.update_goals || 'active',
                attributes: {
                    ...(up.append_history ? { backstory: up.append_history } : {}),
                    ...(up.append_story_events ? { recent_events: up.append_story_events } : {})
                },
                last_updated_scene: String(activeSceneNum)
            });
        });
    }
    if (updates.new_characters) {
        updates.new_characters.forEach((nc) => {
            if (!nc || !nc.name) return;
            kgNodes.push({
                name: nc.name,
                type: 'character',
                role: nc.role || 'Character',
                status: nc.details?.goals || 'active',
                attributes: {
                    ...(nc.details?.history ? { backstory: nc.details.history } : {}),
                    ...(nc.details?.story_events ? { recent_events: nc.details.story_events } : {})
                },
                last_updated_scene: String(activeSceneNum)
            });
        });
    }
    if (processedLoreStart && processedLoreStart.length > 0) {
        processedLoreStart.forEach((pItem) => {
            if (!pItem || !pItem.topic) return;
            const top = pItem.topic.toLowerCase();
            const type =
                top.includes('location') || top.includes('setting') || top.includes('place')
                    ? 'location'
                    : top.includes('faction') || top.includes('group') || top.includes('guild')
                      ? 'faction'
                      : top.includes('item') || top.includes('object') || top.includes('artifact')
                        ? 'item'
                        : 'concept';
            kgNodes.push({
                name: pItem.topic,
                type,
                status: 'established',
                attributes: { detail: pItem.detail || '' },
                last_updated_scene: String(activeSceneNum)
            });
        });
    }
    if (updates.relationship_updates) {
        updates.relationship_updates.forEach((ru) => {
            if (!ru || !ru.from || !ru.to) return;
            kgEdges.push({
                source: ru.from,
                target: ru.to,
                type: 'relationship',
                relation: ru.new_feeling || 'connected',
                status: 'active',
                details: ru.trigger || '',
                last_updated_scene: String(activeSceneNum)
            });
        });
    }

    const updatedKg = updateKnowledgeGraph(baseStory as unknown as ContinuityStoryState, {
        nodes: kgNodes,
        edges: kgEdges
    });

    // Tier 2: Update Semantic Event Log
    let currentEventLog = Array.isArray(baseStory.event_log) ? [...baseStory.event_log] : [];
    if (updates.event_log) {
        if (Array.isArray(updates.event_log)) {
            updates.event_log.forEach((ev) => {
                currentEventLog = logSemanticEvent({ event_log: currentEventLog }, ev);
            });
        } else if (typeof updates.event_log === 'object') {
            currentEventLog = logSemanticEvent({ event_log: currentEventLog }, updates.event_log);
        }
    } else {
        const involvedEntities: string[] = [];
        const eventSummaries: string[] = [];
        if (updates.cast_updates) {
            updates.cast_updates.forEach((u) => {
                if (u.name && !involvedEntities.includes(u.name)) involvedEntities.push(u.name);
                if (u.append_story_events) {
                    eventSummaries.push(`${u.name}: ${u.append_story_events}`);
                } else if (u.update_goals) {
                    eventSummaries.push(`${u.name}'s goal: ${u.update_goals}`);
                }
            });
        }
        if (updates.relationship_updates) {
            updates.relationship_updates.forEach((r) => {
                if (r.from && !involvedEntities.includes(r.from)) involvedEntities.push(r.from);
                if (r.to && !involvedEntities.includes(r.to)) involvedEntities.push(r.to);
                eventSummaries.push(
                    `${r.from} & ${r.to}: ${r.new_feeling || ''}${r.trigger ? ` (${r.trigger})` : ''}`
                );
            });
        }
        if (eventSummaries.length > 0 || involvedEntities.length > 0) {
            const sceneTag =
                typeof activeSceneNum === 'string' && activeSceneNum.includes('.')
                    ? activeSceneNum
                    : `Scene ${activeSceneNum}`;
            const summaryText =
                eventSummaries.join('; ') || `Events involving ${involvedEntities.join(', ')}`;
            currentEventLog = logSemanticEvent(
                { event_log: currentEventLog },
                {
                    scene_id: sceneTag,
                    summary: summaryText,
                    key_events: eventSummaries,
                    entities_involved: involvedEntities
                }
            );
        }
    }

    // Tier 3: Update Living Character States
    const newCharStates: Record<string, CharacterStateEntry> = {
        ...(baseStory.character_states || {})
    };
    if (updates.character_state_updates && Array.isArray(updates.character_state_updates)) {
        updates.character_state_updates.forEach((csu) => {
            const cName = csu.name || csu.character_name || csu.character;
            if (!cName) return;
            newCharStates[cName] = {
                ...(newCharStates[cName] || {}),
                name: cName,
                physical_state:
                    csu.physical_state || newCharStates[cName]?.physical_state || 'Active condition',
                emotional_state:
                    csu.emotional_state || newCharStates[cName]?.emotional_state || 'Composed',
                unresolved_tension:
                    csu.unresolved_tension || newCharStates[cName]?.unresolved_tension || '',
                location: csu.location || newCharStates[cName]?.location || '',
                last_updated_scene: String(activeSceneNum)
            };
        });
    }
    if (updates.new_characters && Array.isArray(updates.new_characters)) {
        updates.new_characters.forEach((nc) => {
            if (!nc || !nc.name) return;
            if (!newCharStates[nc.name]) {
                newCharStates[nc.name] = {
                    name: nc.name,
                    role: nc.role || 'Supporting Character',
                    physical_state: 'Active condition',
                    emotional_state: nc.core_flaw || 'Composed',
                    unresolved_tension: nc.core_flaw || '',
                    location: 'Active scene',
                    goals: nc.core_desire || nc.details?.goals || '',
                    last_updated_scene: String(activeSceneNum)
                };
            }
        });
    }

    return {
        ...baseStory,
        cast: newCast,
        lore: newLore,
        character_states: newCharStates,
        relationships: newRels,
        continuity_ledger: newLedger,
        knowledge_graph: updatedKg,
        event_log: currentEventLog
    };
}
