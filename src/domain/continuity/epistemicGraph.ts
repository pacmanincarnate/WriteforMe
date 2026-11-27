/**
 * @module domain/continuity/epistemicGraph
 * Generalized Epistemic State Machine (GESM): bi-temporal belief graph,
 * focalized subgraph projection, irony/asymmetry compilation, liar-cascade invalidation,
 * neuro-symbolic sleep-cycle consolidation, and scene delta commits.
 */

import { STOPWORDS } from '@/utils';
import { PROMPTS } from '@/prompts';
import { getActiveClueDirectivesForScene, getSecretRevealDirectiveForScene } from '@/domain/story';
import {
    compareSceneCoordinates,
    formatSceneCoord,
    isBeliefActiveAt,
    parseSceneCoordinates
} from './ledger';
import type { BeliefEdgeLike, ContinuityStoryState } from './ledger';

export interface EpistemicEntity {
    id: string;
    name: string;
    type: string;
    role?: string;
    status: string;
    attributes: Record<string, unknown>;
}

export interface EpistemicProposition {
    id: string;
    subject_id: string;
    predicate: string;
    object_id: string;
    claim_text: string;
    benign_behavioral_tell: string;
    benign_cover_interpretation: string;
    objective_truth: string;
    world_valid_from_scene: string;
    world_valid_to_scene: string | null;
    secret_id?: string;
    activation_context: string[];
    tell_seeded_scenes: string[];
}

export interface EpistemicBeliefEdge extends BeliefEdgeLike {
    id: string;
    holder_id: string;
    proposition_id: string;
    stance: string;
    confidence: number;
    source_type: string;
    source_agent_id?: string | null;
    acquired_at_scene: string;
    invalidated_at_scene: string | null;
    emotional_charge: number;
}

export interface EpistemicSecondOrderEdge extends BeliefEdgeLike {
    id: string;
    observer_id: string;
    target_agent_id: string;
    proposition_id: string;
    assumed_stance: string;
    acquired_at_scene: string;
    invalidated_at_scene: string | null;
    archived: boolean;
}

export interface EpistemicGraph {
    version: number;
    entities: Record<string, EpistemicEntity>;
    propositions: Record<string, EpistemicProposition>;
    holds_belief_edges: EpistemicBeliefEdge[];
    second_order_edges: EpistemicSecondOrderEdge[];
    cascade_log: Array<Record<string, unknown>>;
    first_order_edges?: EpistemicBeliefEdge[];
    provenance_log?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

export interface FocalizedSubgraphProjection {
    cleanPov: string;
    cleanPartners: string[];
    sceneCoord: string;
    propositions: EpistemicProposition[];
    povBeliefs: Record<string, EpistemicBeliefEdge>;
    partnerBeliefs: Record<string, Record<string, EpistemicBeliefEdge>>;
    readerBeliefs: Record<string, EpistemicBeliefEdge>;
    secondOrder: Record<string, EpistemicSecondOrderEdge>;
}

export interface CompiledEpistemicResult {
    frictionLevel?: string;
    topItems?: Array<Record<string, unknown>>;
    directivesBlock?: string;
    activeStateSnippet?: string;
    tension_vectors?: unknown[];
    directives_block?: string;
    active_state_snippet?: string;
}

export type EpistemicCallAIFn = (
    prompt: string,
    sysPrompt: string,
    useSchema: boolean,
    label: string,
    tier: string
) => Promise<string>;

/** Normalizes any entity name or ID into a canonical `char_*` / `obj_*` / `loc_*` / `meta_*` ID. */
export function normalizeEntityId(rawIdOrName: unknown): string {
    if (!rawIdOrName) return 'entity_unknown';
    const clean = String(rawIdOrName).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    return clean.startsWith('char_') ||
        clean.startsWith('obj_') ||
        clean.startsWith('loc_') ||
        clean.startsWith('meta_')
        ? clean
        : `char_${clean}`;
}

/** Resolves a graph entity ID back to its human-readable character or Reader name. */
export function resolveEntityDisplayName(
    entityIdOrName: unknown,
    storyState: ContinuityStoryState = {}
): string {
    if (!entityIdOrName) return 'Character';
    const raw = String(entityIdOrName).trim();
    if (raw === 'meta_reader') return 'The Reader';
    const cleanId = normalizeEntityId(raw);
    const graphEntities =
        ((storyState?.epistemic_graph as EpistemicGraph | undefined)?.entities) || {};
    if (graphEntities[cleanId] && graphEntities[cleanId].name) {
        return graphEntities[cleanId].name;
    }
    const castList = Array.isArray(storyState?.cast) ? storyState.cast : [];
    const foundCast = castList.find(
        (c) =>
            c &&
            (normalizeEntityId(c.id || c.name) === cleanId ||
                (c.name && c.name.toLowerCase() === raw.toLowerCase()))
    );
    if (foundCast && foundCast.name) return foundCast.name;
    if (!raw.startsWith('char_') && !raw.startsWith('obj_') && !raw.startsWith('loc_')) return raw;
    return raw
        .replace(/^(?:char|obj|loc)_/i, '')
        .split('_')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/** Normalizes array- or map-shaped proposition collections into an ID-keyed lookup map. */
export function normalizeEpistemicPropositionsMap(
    rawProps: unknown
): Record<string, EpistemicProposition> {
    if (Array.isArray(rawProps)) {
        return (rawProps as EpistemicProposition[]).reduce<Record<string, EpistemicProposition>>(
            (acc, p) => {
                if (p && p.id) acc[p.id] = p;
                return acc;
            },
            {}
        );
    }
    return rawProps && typeof rawProps === 'object'
        ? { ...(rawProps as Record<string, EpistemicProposition>) }
        : {};
}

/** Defines compatibility accessor aliases (`first_order_edges`, `provenance_log`) on an EpistemicGraph. */
export function ensureEpistemicGraphAccessors<T extends Record<string, unknown>>(target: T): T {
    if (!target || typeof target !== 'object') return target;
    const initialHolds = Array.isArray(target.holds_belief_edges)
        ? target.holds_belief_edges
        : Array.isArray(target.first_order_edges)
          ? target.first_order_edges
          : [];
    (target as Record<string, unknown>).holds_belief_edges = initialHolds;

    if (!Array.isArray(target.second_order_edges)) {
        (target as Record<string, unknown>).second_order_edges = [];
    }

    const initialCascade = Array.isArray(target.cascade_log)
        ? target.cascade_log
        : Array.isArray(target.provenance_log)
          ? target.provenance_log
          : [];
    (target as Record<string, unknown>).cascade_log = initialCascade;

    try {
        delete target.first_order_edges;
    } catch {
        // Ignore non-configurable property errors
    }
    try {
        delete target.provenance_log;
    } catch {
        // Ignore non-configurable property errors
    }

    Object.defineProperty(target, 'first_order_edges', {
        get() {
            if (!Array.isArray(this.holds_belief_edges)) this.holds_belief_edges = [];
            return this.holds_belief_edges;
        },
        set(val: unknown) {
            this.holds_belief_edges = Array.isArray(val) ? val : [];
        },
        enumerable: true,
        configurable: true
    });

    Object.defineProperty(target, 'provenance_log', {
        get() {
            if (!Array.isArray(this.cascade_log)) this.cascade_log = [];
            return this.cascade_log;
        },
        set(val: unknown) {
            this.cascade_log = Array.isArray(val) ? val : [];
        },
        enumerable: true,
        configurable: true
    });

    return target;
}

/** Returns existing `storyState.epistemic_graph` with accessors or initializes a fresh GESM graph. */
export function initEpistemicGraph(storyState: ContinuityStoryState = {}): EpistemicGraph {
    if (
        storyState &&
        storyState.epistemic_graph &&
        typeof storyState.epistemic_graph === 'object' &&
        (storyState.epistemic_graph as EpistemicGraph).propositions
    ) {
        return ensureEpistemicGraphAccessors(storyState.epistemic_graph as EpistemicGraph);
    }
    const newGraph: EpistemicGraph = {
        version: 1,
        entities: {
            meta_reader: {
                id: 'meta_reader',
                name: 'The Reader',
                type: 'meta_reader',
                status: 'active',
                attributes: { role: 'Audience Narrative Witness' }
            }
        },
        propositions: {},
        holds_belief_edges: [],
        second_order_edges: [],
        cascade_log: []
    };
    return ensureEpistemicGraphAccessors(newGraph);
}

/** Synchronizes cast, character arcs, secret vault, and opinion ledger entries into `epistemic_graph`. */
export function ensureEpistemicGraph(storyState: ContinuityStoryState = {}): EpistemicGraph {
    const graph = initEpistemicGraph(storyState);
    const entities = graph.entities || {};
    const propositions = graph.propositions || {};
    const holds = Array.isArray(graph.holds_belief_edges) ? graph.holds_belief_edges : [];
    const secondOrder = Array.isArray(graph.second_order_edges) ? graph.second_order_edges : [];

    if (!entities.meta_reader) {
        entities.meta_reader = {
            id: 'meta_reader',
            name: 'The Reader',
            type: 'meta_reader',
            status: 'active',
            attributes: { role: 'Audience Narrative Witness' }
        };
    }

    const castList = Array.isArray(storyState.cast) ? storyState.cast : [];
    castList.forEach((c) => {
        if (!c || !c.name) return;
        const cId = normalizeEntityId(c.id || c.name);
        if (!entities[cId]) {
            entities[cId] = {
                id: cId,
                name: c.name,
                type: 'character',
                role: c.role || 'Character',
                status: c.core_flaw || 'Active',
                attributes: {
                    core_flaw: c.core_flaw || '',
                    core_desire: c.core_desire || '',
                    vocal_cadence: c.vocal_cadence || '',
                    corner_role: c.corner_role || ''
                }
            };
        }
    });

    const arcs = Array.isArray(storyState.character_arcs)
        ? (storyState.character_arcs as Array<Record<string, unknown>>)
        : [];
    arcs.forEach((arc, aIdx) => {
        const charNameOrId =
            arc.char_id || arc.id || arc.character_name || castList[aIdx]?.name;
        if (!charNameOrId) return;
        const cId = normalizeEntityId(charNameOrId);
        const lieText = String(arc.lie_believed || arc.believed_truth || '').trim();
        const truthNeeded = String(arc.truth_needed || arc.revealed_truth || '').trim();

        if (lieText) {
            const propLieId = `prop_core_lie_${cId}`;
            if (!propositions[propLieId]) {
                propositions[propLieId] = {
                    id: propLieId,
                    subject_id: cId,
                    predicate: 'HOLDS_ROOT_LIE',
                    object_id: cId,
                    claim_text: lieText,
                    benign_behavioral_tell: `Defensive emotional rationalization or avoidance regarding: "${lieText.slice(0, 80)}"`,
                    benign_cover_interpretation: 'Natural personal defensiveness and psychological habit.',
                    objective_truth: 'FALSE',
                    world_valid_from_scene: '0.0',
                    world_valid_to_scene: null,
                    activation_context: ['PSYCHOLOGICAL_CORE', 'DECISION_MAKING', 'INTERPERSONAL_CONFLICT'],
                    tell_seeded_scenes: []
                };
            }
            if (!holds.some((e) => e.holder_id === cId && e.proposition_id === propLieId)) {
                holds.push({
                    id: `hb_core_lie_${cId}`,
                    holder_id: cId,
                    proposition_id: propLieId,
                    stance: 'BELIEVES_TRUE',
                    confidence: 0.95,
                    source_type: 'CORE_LIE',
                    acquired_at_scene: '0.0',
                    invalidated_at_scene: null,
                    emotional_charge: -0.95
                });
            }
        }

        if (truthNeeded) {
            const propTruthId = `prop_truth_needed_${cId}`;
            if (!propositions[propTruthId]) {
                propositions[propTruthId] = {
                    id: propTruthId,
                    subject_id: cId,
                    predicate: 'NEEDS_TRUTH',
                    object_id: cId,
                    claim_text: truthNeeded,
                    benign_behavioral_tell:
                        'Moments of uncharacteristic vulnerability, hesitation, or searching contemplation.',
                    benign_cover_interpretation: 'Quiet moment of introspective thought.',
                    objective_truth: 'TRUE',
                    world_valid_from_scene: '0.0',
                    world_valid_to_scene: null,
                    activation_context: ['ARC_TRANSFORMATION', 'CLIMAX_EPIPHANY'],
                    tell_seeded_scenes: []
                };
            }
        }
    });

    const vault = Array.isArray(storyState.secret_vault) ? storyState.secret_vault : [];
    vault.forEach((rawSec) => {
        const sec = rawSec as Record<string, unknown>;
        if (!sec || !sec.id) return;
        const sId = String(sec.id);
        const truthText = String(sec.truth || sec.description || sec.title || '');
        const rawCoverObj =
            typeof sec.cover_story === 'object' && sec.cover_story !== null
                ? (sec.cover_story as Record<string, unknown>)
                : null;
        const coverText =
            (typeof sec.cover_story === 'string' ? sec.cover_story.trim() : '') ||
            (typeof rawCoverObj?.public_belief === 'string'
                ? rawCoverObj.public_belief.trim()
                : '') ||
            (typeof sec.public_cover_story === 'string' ? sec.public_cover_story.trim() : '') ||
            'Standard baseline circumstances.';
        const knownChars = (
            Array.isArray(sec.known_by_characters)
                ? sec.known_by_characters
                : Array.isArray(sec.known_by)
                  ? sec.known_by
                  : []
        ) as unknown[];
        const primaryHolder = knownChars[0] ? normalizeEntityId(knownChars[0]) : 'entity_world';

        const propTruthId = `prop_${sId}_truth`;
        const propCoverId = `prop_${sId}_cover`;

        const clueSched = (sec.clue_schedule || sec.clues || []) as Array<Record<string, unknown>>;
        const firstClue = clueSched[0] || {};
        const tell = String(
            firstClue.behavioral_directive ||
                `Guarded physical demeanor, evasive glance, or change of subject regarding ${sec.title}.`
        );
        const coverReason = String(
            firstClue.benign_reason || coverText || 'Plausible situational stress or distraction.'
        );

        if (!propositions[propTruthId] && truthText) {
            propositions[propTruthId] = {
                id: propTruthId,
                subject_id: primaryHolder,
                predicate: 'SECRET_TRUTH',
                object_id: `sec_${sId}`,
                claim_text: truthText,
                benign_behavioral_tell: tell,
                benign_cover_interpretation: coverReason,
                objective_truth: sec.category === 'red_herring' ? 'FALSE' : 'TRUE',
                world_valid_from_scene: '0.0',
                world_valid_to_scene: null,
                secret_id: sId,
                activation_context: ['INVESTIGATION', 'HIGH_STAKES_DIALOGUE', 'CONFRONTATION', 'REVELATION'],
                tell_seeded_scenes: []
            };
        }

        if (!propositions[propCoverId] && coverText) {
            propositions[propCoverId] = {
                id: propCoverId,
                subject_id: primaryHolder,
                predicate: 'PUBLIC_COVER',
                object_id: `sec_${sId}`,
                claim_text: coverText,
                benign_behavioral_tell: 'Normal everyday routine and public demeanor.',
                benign_cover_interpretation: 'Baseline reality accepted by the community.',
                objective_truth: 'FALSE',
                world_valid_from_scene: '0.0',
                world_valid_to_scene: null,
                secret_id: sId,
                activation_context: ['BASELINE_STATUS_QUO'],
                tell_seeded_scenes: []
            };
        }

        knownChars.forEach((ch) => {
            const cId = normalizeEntityId(ch);
            if (!holds.some((e) => e.holder_id === cId && e.proposition_id === propTruthId)) {
                holds.push({
                    id: `hb_${sId}_truth_${cId}`,
                    holder_id: cId,
                    proposition_id: propTruthId,
                    stance: 'BELIEVES_TRUE',
                    confidence: 1.0,
                    source_type: 'DIRECT_OBSERVATION',
                    source_agent_id: null,
                    acquired_at_scene: '0.0',
                    invalidated_at_scene: null,
                    emotional_charge: 0.85
                });
            }
        });

        const rawConcealed = (
            Array.isArray(sec.concealed_from_characters)
                ? sec.concealed_from_characters
                : Array.isArray(sec.concealed_from)
                  ? sec.concealed_from
                  : []
        ) as unknown[];
        const concealedChars =
            rawConcealed.length > 0
                ? rawConcealed
                : castList
                      .filter((c) => !knownChars.includes(c.id) && !knownChars.includes(c.name))
                      .map((c) => c.id || c.name);
        concealedChars.forEach((ch) => {
            const cId = normalizeEntityId(ch);
            if (!holds.some((e) => e.holder_id === cId && e.proposition_id === propCoverId)) {
                holds.push({
                    id: `hb_${sId}_cover_${cId}`,
                    holder_id: cId,
                    proposition_id: propCoverId,
                    stance: 'BELIEVES_TRUE',
                    confidence: 0.85,
                    source_type: 'TOLD_BY_AGENT',
                    source_agent_id: primaryHolder,
                    acquired_at_scene: '0.0',
                    invalidated_at_scene: null,
                    emotional_charge: -0.5
                });
            }
        });

        if (sec.reader_status === 'aware') {
            if (
                !holds.some((e) => e.holder_id === 'meta_reader' && e.proposition_id === propTruthId)
            ) {
                holds.push({
                    id: `hb_${sId}_reader_truth`,
                    holder_id: 'meta_reader',
                    proposition_id: propTruthId,
                    stance: 'BELIEVES_TRUE',
                    confidence: 1.0,
                    source_type: 'DIRECT_OBSERVATION',
                    source_agent_id: null,
                    acquired_at_scene: '0.0',
                    invalidated_at_scene: null,
                    emotional_charge: 0.9
                });
            }
        }

        knownChars.forEach((kCh) => {
            const kId = normalizeEntityId(kCh);
            concealedChars.forEach((cCh) => {
                const cId = normalizeEntityId(cCh);
                if (
                    !secondOrder.some(
                        (so) =>
                            so.observer_id === kId &&
                            so.target_agent_id === cId &&
                            so.proposition_id === propTruthId
                    )
                ) {
                    secondOrder.push({
                        id: `sob_${sId}_${kId}_${cId}`,
                        observer_id: kId,
                        target_agent_id: cId,
                        proposition_id: propTruthId,
                        assumed_stance: 'UNAWARE',
                        acquired_at_scene: '0.0',
                        invalidated_at_scene: null,
                        archived: false
                    });
                }
            });
        });
    });

    const ledger = Array.isArray(storyState.continuity_ledger) ? storyState.continuity_ledger : [];
    ledger.forEach((entry, lIdx) => {
        if (!entry || typeof entry !== 'object' || entry.status === 'resolved') return;
        const cat = String(entry.category || '').trim().toLowerCase();
        if (cat !== 'opinion') return;
        const claimText = String(entry.value ?? entry.detail ?? entry.description ?? '').trim();
        if (!claimText) return;
        const rawHolder =
            entry.character ||
            entry.entity_id ||
            entry.from_character ||
            castList[0]?.name ||
            'Protagonist';
        const holderId = normalizeEntityId(rawHolder);
        const slug = String(entry.key || `op_${lIdx}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 36);
        const propOpId = `prop_opinion_${slug}`;
        const parsedCoord = parseSceneCoordinates(entry.source_scene || entry, storyState);
        const acquiredCoord =
            parsedCoord && parsedCoord.sequence > 0
                ? formatSceneCoord(parsedCoord.sequence, parsedCoord.scene || 1)
                : '0.0';

        if (!propositions[propOpId]) {
            propositions[propOpId] = {
                id: propOpId,
                subject_id: holderId,
                predicate: 'HOLDS_OPINION',
                object_id: entry.to_character ? normalizeEntityId(entry.to_character) : 'entity_world',
                claim_text: claimText,
                benign_behavioral_tell: '',
                benign_cover_interpretation: '',
                objective_truth: 'UNRESOLVED',
                world_valid_from_scene: acquiredCoord,
                world_valid_to_scene: null,
                activation_context: ['INTERPERSONAL_CONFLICT', 'DIALOGUE'],
                tell_seeded_scenes: []
            };
        }
        if (!holds.some((e) => e.holder_id === holderId && e.proposition_id === propOpId)) {
            holds.push({
                id: `hb_opinion_${slug}_${holderId}`,
                holder_id: holderId,
                proposition_id: propOpId,
                stance: 'BELIEVES_TRUE',
                confidence: 0.8,
                source_type: 'INFERRED',
                source_agent_id: null,
                acquired_at_scene: acquiredCoord,
                invalidated_at_scene: null,
                emotional_charge: 0.6
            });
        }
    });

    graph.entities = entities;
    graph.propositions = propositions;
    graph.holds_belief_edges = holds;
    graph.second_order_edges = secondOrder;
    ensureEpistemicGraphAccessors(graph);
    storyState.epistemic_graph = graph;
    return graph;
}

/** Archives second-order deception edges once a secret is revealed on page. */
export function archiveRevealedSecretBeliefs(
    epistemicGraph: EpistemicGraph | null | undefined,
    secretId: string,
    sceneCoord = '1.1'
): void {
    if (!epistemicGraph || !Array.isArray(epistemicGraph.second_order_edges)) return;
    const targetPropId = `prop_${secretId}_truth`;
    epistemicGraph.second_order_edges.forEach((edge) => {
        if (edge.proposition_id === targetPropId || edge.proposition_id.includes(secretId)) {
            if (edge.invalidated_at_scene === null) {
                edge.invalidated_at_scene = sceneCoord;
            }
            edge.archived = true;
        }
    });
}

/** Reverts bi-temporal belief edges, second-order edges, and cascade entries committed at `sceneCoord`. */
export function rollbackEpistemicStateForScene(
    epistemicGraph: EpistemicGraph | null | undefined,
    sceneCoord: string
): void {
    if (!epistemicGraph) return;
    if (!sceneCoord || sceneCoord === '0.0') return;

    if (Array.isArray(epistemicGraph.holds_belief_edges)) {
        epistemicGraph.holds_belief_edges = epistemicGraph.holds_belief_edges.filter(
            (e) => e.acquired_at_scene !== sceneCoord
        );
        epistemicGraph.holds_belief_edges.forEach((e) => {
            if (e.invalidated_at_scene === sceneCoord) {
                e.invalidated_at_scene = null;
            }
        });
    }

    if (Array.isArray(epistemicGraph.second_order_edges)) {
        epistemicGraph.second_order_edges = epistemicGraph.second_order_edges.filter(
            (e) => e.acquired_at_scene !== sceneCoord
        );
        epistemicGraph.second_order_edges.forEach((e) => {
            if (e.invalidated_at_scene === sceneCoord) {
                e.invalidated_at_scene = null;
                e.archived = false;
            }
        });
    }

    if (Array.isArray(epistemicGraph.cascade_log)) {
        epistemicGraph.cascade_log = epistemicGraph.cascade_log.filter(
            (entry) => entry.scene !== sceneCoord
        );
    }
}

/** Downgrades confidence across all beliefs sourced from an exposed liar agent. */
export function cascadeInvalidateSourceAgent(
    epistemicGraph: EpistemicGraph | null | undefined,
    holderId: string,
    liarAgentId: string,
    sceneCoord = '1.1',
    storyState: ContinuityStoryState = {}
): Array<Record<string, unknown>> {
    if (!epistemicGraph || !holderId || !liarAgentId) return [];
    const cleanHolder = normalizeEntityId(holderId);
    const cleanLiar = normalizeEntityId(liarAgentId);
    const holds = Array.isArray(epistemicGraph.holds_belief_edges)
        ? epistemicGraph.holds_belief_edges
        : [];
    const affectedTransitions: Array<Record<string, unknown>> = [];

    holds.forEach((edge) => {
        if (
            edge.holder_id === cleanHolder &&
            edge.source_agent_id === cleanLiar &&
            isBeliefActiveAt(edge, sceneCoord, storyState)
        ) {
            edge.invalidated_at_scene = sceneCoord;

            const oldConf = edge.confidence || 0.8;
            const newConf = Math.max(0.15, Math.round(oldConf * 0.45 * 100) / 100);
            const newStance = edge.stance === 'BELIEVES_TRUE' ? 'DOUBTS' : edge.stance;

            const downgradedEdge: EpistemicBeliefEdge = {
                id: `hb_cascade_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                holder_id: cleanHolder,
                proposition_id: edge.proposition_id,
                stance: newStance,
                confidence: newConf,
                source_type: 'INFERRED',
                source_agent_id: cleanLiar,
                acquired_at_scene: sceneCoord,
                invalidated_at_scene: null,
                emotional_charge: -0.85
            };
            holds.push(downgradedEdge);
            affectedTransitions.push({
                proposition_id: edge.proposition_id,
                old_stance: edge.stance,
                new_stance: newStance,
                old_confidence: oldConf,
                new_confidence: newConf
            });
        }
    });

    if (affectedTransitions.length > 0) {
        if (!Array.isArray(epistemicGraph.cascade_log)) epistemicGraph.cascade_log = [];
        epistemicGraph.cascade_log.push({
            scene: sceneCoord,
            timestamp: Date.now(),
            holder_id: cleanHolder,
            exposed_liar_id: cleanLiar,
            affected_count: affectedTransitions.length,
            transitions: affectedTransitions
        });
    }

    return affectedTransitions;
}

/** Matches a query string, secret ID, or proposition ID against the GESM proposition store. */
export function resolvePropositionMatch(
    queryOrId: unknown,
    epistemicGraph: EpistemicGraph | null | undefined
): EpistemicProposition | null {
    if (!epistemicGraph || !queryOrId) return null;
    const props = epistemicGraph.propositions || {};
    const cleanQ = String(queryOrId).trim();

    if (props[cleanQ]) return props[cleanQ];

    const bySecret = Object.values(props).find((p) => p.secret_id === cleanQ);
    if (bySecret) return bySecret;

    const lowerQ = cleanQ.toLowerCase();
    const byKey = Object.values(props).find(
        (p) => p.id.toLowerCase().includes(lowerQ) || lowerQ.includes(p.id.toLowerCase())
    );
    if (byKey) return byKey;

    let bestMatch: EpistemicProposition | null = null;
    let bestScore = 0;
    Object.values(props).forEach((p) => {
        if (!p.claim_text) return;
        const pText = p.claim_text.toLowerCase();
        const tokens = lowerQ.split(/\s+/).filter((t) => t.length > 3 && !STOPWORDS.has(t));
        let hits = 0;
        tokens.forEach((t) => {
            if (pText.includes(t)) hits++;
        });
        if (hits > bestScore) {
            bestScore = hits;
            bestMatch = p;
        }
    });

    return bestScore >= 2 ? bestMatch : null;
}

/** Phase 1 GESM projection: filters propositions and beliefs relevant to the scene's POV and partners. */
export function projectFocalizedSubgraph(
    storyState: ContinuityStoryState = {},
    {
        povCharId = '',
        partnerCharIds = [],
        sceneEntityIds = [],
        sceneCoord = '1.1'
    }: {
        povCharId?: string;
        partnerCharIds?: string[];
        sceneEntityIds?: string[];
        sceneCoord?: string;
    } = {}
): FocalizedSubgraphProjection {
    const graph = ensureEpistemicGraph(storyState);
    const cleanPov = normalizeEntityId(povCharId);
    const cleanPartners = (partnerCharIds || []).map((p) => normalizeEntityId(p));
    const allSceneEntities = new Set([
        cleanPov,
        ...cleanPartners,
        ...(sceneEntityIds || []).map((e) => normalizeEntityId(e))
    ]);

    const holds = Array.isArray(graph.holds_belief_edges) ? graph.holds_belief_edges : [];
    const secondOrder = Array.isArray(graph.second_order_edges) ? graph.second_order_edges : [];
    const propositions = graph.propositions || {};

    const relevantProps: EpistemicProposition[] = [];
    Object.values(propositions).forEach((p) => {
        if (compareSceneCoordinates(p.world_valid_from_scene || '0.0', sceneCoord, storyState) > 0) {
            return;
        }
        if (
            p.world_valid_to_scene &&
            compareSceneCoordinates(p.world_valid_to_scene, sceneCoord, storyState) <= 0
        ) {
            return;
        }

        const isEntityMatch =
            allSceneEntities.has(p.subject_id) || allSceneEntities.has(p.object_id);
        const isSecret = Boolean(p.secret_id);
        const isCoreLie =
            Boolean(p.id && p.id.startsWith('prop_core_lie_')) &&
            allSceneEntities.has(p.subject_id);

        if (isEntityMatch || isSecret || isCoreLie) {
            relevantProps.push(p);
        }
    });

    const povBeliefs: Record<string, EpistemicBeliefEdge> = {};
    const partnerBeliefs: Record<string, Record<string, EpistemicBeliefEdge>> = {};
    const readerBeliefs: Record<string, EpistemicBeliefEdge> = {};

    holds.forEach((edge) => {
        if (!isBeliefActiveAt(edge, sceneCoord, storyState)) return;
        const pId = edge.proposition_id;

        if (edge.holder_id === cleanPov) {
            povBeliefs[pId] = edge;
        } else if (cleanPartners.includes(edge.holder_id)) {
            if (!partnerBeliefs[edge.holder_id]) partnerBeliefs[edge.holder_id] = {};
            partnerBeliefs[edge.holder_id][pId] = edge;
        } else if (edge.holder_id === 'meta_reader') {
            readerBeliefs[pId] = edge;
        }
    });

    const secondOrderMap: Record<string, EpistemicSecondOrderEdge> = {};
    secondOrder.forEach((so) => {
        if (!isBeliefActiveAt(so, sceneCoord, storyState)) return;
        if (so.observer_id === cleanPov || cleanPartners.includes(so.observer_id)) {
            const key = `${so.observer_id}->${so.target_agent_id}:${so.proposition_id}`;
            secondOrderMap[key] = so;
        }
    });

    return {
        cleanPov,
        cleanPartners,
        sceneCoord,
        propositions: relevantProps,
        povBeliefs,
        partnerBeliefs,
        readerBeliefs,
        secondOrder: secondOrderMap
    };
}

/** Phase 2 GESM compiler: converts epistemic asymmetry into externalized surface directives & POV stances. */
export function compileEpistemicAsymmetryAndIrony(
    projection: FocalizedSubgraphProjection | null | undefined,
    scene: Record<string, unknown> = {},
    storyState: ContinuityStoryState = {},
    sceneCoord = '1.1'
): CompiledEpistemicResult {
    if (!projection || !Array.isArray(projection.propositions)) {
        return { tension_vectors: [], directives_block: '', active_state_snippet: '' };
    }

    const { cleanPov, cleanPartners, propositions, povBeliefs, partnerBeliefs, readerBeliefs } =
        projection;

    const declaredFriction = String(scene.epistemic_friction_level || '').toUpperCase();
    const sceneType = String(scene.scene_type || '').toUpperCase();
    const narrativeMode = String(scene.dominant_narrative_mode || '').toUpperCase();

    let frictionLevel = declaredFriction || 'MODERATE';
    if (!declaredFriction) {
        if (
            narrativeMode.includes('SUSPENSE') ||
            narrativeMode.includes('CONFRONTATION') ||
            narrativeMode.includes('MYSTERY') ||
            narrativeMode.includes('ACTION') ||
            narrativeMode.includes('COVER_AND_BLUFF') ||
            narrativeMode.includes('SOCIAL_INTRIGUE') ||
            narrativeMode.includes('EMOTIONAL_RUPTURE') ||
            narrativeMode.includes('VERBAL_SPARRING')
        ) {
            frictionLevel = 'HIGH';
        } else if (
            narrativeMode.includes('ROMANCE') ||
            narrativeMode.includes('INTIMACY') ||
            narrativeMode.includes('REFLECTION') ||
            narrativeMode.includes('BONDING') ||
            narrativeMode.includes('RELATIONAL') ||
            narrativeMode.includes('SLICE_OF_LIFE') ||
            narrativeMode.includes('MONTAGE') ||
            sceneType === 'REACTIVE'
        ) {
            frictionLevel = 'LOW';
        }
    }

    const scheduledDeltas = (
        Array.isArray(scene.target_epistemic_deltas) ? scene.target_epistemic_deltas : []
    ) as Array<Record<string, unknown>>;
    const contractPropIds = new Set(
        scheduledDeltas.map((d) => String(d.proposition_id || d.proposition || '')).filter(Boolean)
    );

    interface ClassifiedItem {
        prop: EpistemicProposition;
        povStance: string;
        povConf: number;
        partnerStance: string;
        primaryPartnerId: string | null;
        readerStance: string;
        objTruth: string;
        tensionVector: string | null;
        narrativeRole: string;
        salienceScore: number;
        isContractDelta: boolean;
    }

    const classifiedItems: ClassifiedItem[] = [];

    propositions.forEach((prop) => {
        const pId = prop.id;
        const objTruth = prop.objective_truth || 'UNRESOLVED';
        const povEdge = povBeliefs[pId];
        const povStance = povEdge ? povEdge.stance : 'UNAWARE';
        const povConf = povEdge ? povEdge.confidence || 0 : 0;

        const readerEdge = readerBeliefs[pId];
        const readerStance = readerEdge ? readerEdge.stance : 'UNAWARE';

        let primaryPartnerId = cleanPartners[0] || null;
        let partnerEdge: EpistemicBeliefEdge | null = null;
        for (const ptId of cleanPartners) {
            if (partnerBeliefs[ptId] && partnerBeliefs[ptId][pId]) {
                primaryPartnerId = ptId;
                partnerEdge = partnerBeliefs[ptId][pId];
                break;
            }
        }
        const partnerStance = partnerEdge ? partnerEdge.stance : 'UNAWARE';

        let tensionVector: string | null = null;
        let narrativeRole = '';

        const povKnowsTruth =
            (povStance === 'BELIEVES_TRUE' && objTruth === 'TRUE') ||
            (povStance === 'BELIEVES_FALSE' && objTruth === 'FALSE');
        const partnerKnowsTruth =
            (partnerStance === 'BELIEVES_TRUE' && objTruth === 'TRUE') ||
            (partnerStance === 'BELIEVES_FALSE' && objTruth === 'FALSE');
        const readerKnowsTruth =
            (readerStance === 'BELIEVES_TRUE' && objTruth === 'TRUE') ||
            (readerStance === 'BELIEVES_FALSE' && objTruth === 'FALSE');

        if (povStance !== partnerStance && partnerKnowsTruth && !povKnowsTruth) {
            tensionVector = 'DECEPTION_WITHHOLDING';
            narrativeRole =
                'Partner knows the objective truth and is withholding it; portray externalized behavioral tells without leaking the secret.';
        } else if (
            povStance !== partnerStance &&
            !povKnowsTruth &&
            !partnerKnowsTruth &&
            partnerStance !== 'UNAWARE' &&
            povStance !== 'UNAWARE'
        ) {
            tensionVector = 'COLLISION_OF_DELUSIONS';
            narrativeRole =
                'Both characters operate on incompatible false assumptions; dialogue should talk past each other without resolving.';
        } else if (readerKnowsTruth && !povKnowsTruth) {
            tensionVector = 'DRAMATIC_IRONY';
            narrativeRole =
                'The reader knows the danger/truth that the POV is blind to; linger on tangible sensory details whose ominous weight the reader recognizes.';
        } else if (!readerKnowsTruth && !povKnowsTruth && objTruth !== 'UNRESOLVED') {
            tensionVector = 'PURE_MYSTERY';
            narrativeRole =
                'Neither the POV nor the reader knows the truth; plant subtle physical clues with a plausible everyday explanation.';
        }

        const isContractDelta =
            contractPropIds.has(pId) ||
            (Boolean(prop.secret_id) && contractPropIds.has(prop.secret_id!));
        const emotionalCharge = Math.abs(povEdge?.emotional_charge || 0.5);
        const salienceScore =
            (isContractDelta ? 100 : 0) + emotionalCharge * 10 + (tensionVector ? 5 : 0) + povConf;

        if (
            frictionLevel === 'LOW' &&
            !isContractDelta &&
            (!prop.activation_context || !prop.activation_context.includes('PSYCHOLOGICAL_CORE'))
        ) {
            return;
        }

        classifiedItems.push({
            prop,
            povStance,
            povConf,
            partnerStance,
            primaryPartnerId,
            readerStance,
            objTruth,
            tensionVector,
            narrativeRole,
            salienceScore,
            isContractDelta
        });
    });

    classifiedItems.sort((a, b) => b.salienceScore - a.salienceScore);
    const topItems = classifiedItems.slice(0, 5);

    const directiveLines: string[] = [];
    const activeStateBeliefLines: string[] = [];
    const povDisplayName = resolveEntityDisplayName(cleanPov, storyState);
    const handledSecretIds = new Set<string>();

    const describeProseModality = (stance: string, conf: number): string => {
        const pct = Math.round((conf || 0) * 100);
        if (stance === 'BELIEVES_TRUE' && conf >= 0.8) {
            return `Firm Conviction (${pct}% confidence — frame as accepted reality within ${povDisplayName}'s perspective)`;
        }
        if (stance === 'BELIEVES_TRUE' || stance === 'SUSPECTS_TRUE') {
            return `Emerging Suspicion (${pct}% confidence — express through attentive observation, measured questioning, and subtextual testing)`;
        }
        if (stance === 'DOUBTS') {
            return `Active Skepticism (${pct}% confidence — frame with guarded reservation and second-guessing)`;
        }
        if (stance === 'BELIEVES_FALSE') {
            return `Contrary Assumption (${pct}% confidence — act naturally on the premise that this claim is untrue)`;
        }
        return `Active Stance: ${stance} (${pct}% confidence)`;
    };

    topItems.forEach((item) => {
        const p = item.prop;
        const partnerDisplayName = resolveEntityDisplayName(
            item.primaryPartnerId || 'partner',
            storyState
        );

        if (item.povStance !== 'UNAWARE') {
            activeStateBeliefLines.push(
                `- [${povDisplayName}'s Epistemic Stance]: "${p.claim_text}" | Modality: ${describeProseModality(item.povStance, item.povConf)}`
            );
        }

        if (item.tensionVector === 'DECEPTION_WITHHOLDING') {
            const seededScenes = Array.isArray(p.tell_seeded_scenes) ? p.tell_seeded_scenes : [];
            const alreadyUsedRecently = seededScenes.slice(-2).includes(sceneCoord);

            if (!alreadyUsedRecently && p.benign_behavioral_tell) {
                const cleanTell = String(p.benign_behavioral_tell).trim().replace(/\.+$/, '');
                const cleanCover = String(
                    p.benign_cover_interpretation || 'routine situational distraction'
                )
                    .trim()
                    .replace(/\.+$/, '');
                directiveLines.push(
                    `- OBSERVABLE SURFACE BEHAVIOR: When interaction touches on this subject, portray ${partnerDisplayName} exhibiting concrete outward behavior: "${cleanTell}." Anchor ${povDisplayName}'s immediate interpretation in the everyday explanation: "${cleanCover}."`
                );
                if (p.secret_id) handledSecretIds.add(p.secret_id);
                if (!p.tell_seeded_scenes) p.tell_seeded_scenes = [];
                p.tell_seeded_scenes.push(sceneCoord);
            }
        } else if (item.tensionVector === 'DRAMATIC_IRONY') {
            directiveLines.push(
                `- DRAMATIC IRONY FOCUS: Ground the interaction in concrete physical and environmental details whose weight the audience recognizes, while keeping ${povDisplayName}'s internal narration authentically anchored in their immediate, unalarmed perspective.`
            );
        } else if (item.tensionVector === 'COLLISION_OF_DELUSIONS') {
            directiveLines.push(
                `- SUBTEXTUAL MISALIGNMENT: Dramatize ${povDisplayName} and ${partnerDisplayName} speaking from incompatible unspoken premises, allowing the friction of their mismatched assumptions to play out naturally in dialogue.`
            );
        }
    });

    if (scheduledDeltas.length > 0) {
        const graphRef = storyState.epistemic_graph as EpistemicGraph | undefined;
        scheduledDeltas.forEach((d) => {
            const holderDisplay = resolveEntityDisplayName(d.holder || cleanPov, storyState);
            const matchedProp = resolvePropositionMatch(
                d.proposition_id || d.proposition,
                graphRef
            );
            if (matchedProp && matchedProp.secret_id) handledSecretIds.add(matchedProp.secret_id);
            const targetConf = Number(d.to_confidence || 0.45);
            const targetPct = Math.round(targetConf * 100);
            const isFullReveal =
                targetConf >= 0.8 || d.operation === 'ACQUIRE' || d.to_stance === 'BELIEVES_TRUE';

            let propDescription = String(
                d.proposition_id || d.proposition || 'the active situation'
            );
            if (matchedProp) {
                if (matchedProp.predicate === 'SECRET_TRUTH' && !isFullReveal) {
                    const coverProp = graphRef?.propositions?.[`prop_${matchedProp.secret_id}_cover`];
                    const subjectName = resolveEntityDisplayName(matchedProp.subject_id, storyState);
                    propDescription =
                        coverProp && coverProp.claim_text
                            ? `the accepted account ("${coverProp.claim_text.replace(/\.+$/, '')}") involving ${subjectName}`
                            : `${subjectName}'s concealed motives`;
                } else {
                    propDescription = `"${matchedProp.claim_text.replace(/\.+$/, '')}"`;
                }
            }

            const trig = String(
                d.trigger_clue || 'Observed concrete physical evidence or conversational shift'
            )
                .trim()
                .replace(/\.+$/, '');
            const targetModality = isFullReveal
                ? 'Dramatize a decisive, on-page realization supported by direct evidence.'
                : `Advance ${holderDisplay} to tentative suspicion (${targetPct}% confidence) grounded strictly in the observable trigger without naming or deducing the unrevealed secret.`;
            directiveLines.push(
                `- SCHEDULED EPISTEMIC SHIFT: Transition ${holderDisplay}'s stance regarding ${propDescription} toward ${d.to_stance || 'SUSPECTS_TRUE'} (${targetPct}% confidence) via trigger: "${trig}." ${targetModality}`
            );
        });
    }

    const parsedCoordObj = parseSceneCoordinates(sceneCoord, storyState);
    const curSeqNum = parsedCoordObj.sequence || 1;
    const curScnNum = parsedCoordObj.scene || 1;
    const extraClues = getActiveClueDirectivesForScene(storyState, curSeqNum, curScnNum);
    extraClues.forEach((cl) => {
        if (cl.secret_id && handledSecretIds.has(cl.secret_id)) return;
        if (cl.secret_id) handledSecretIds.add(cl.secret_id);
        directiveLines.push(
            `- OBSERVABLE CLUE DIRECTIVE: Weave the following physical or conversational detail organically into the scene: "${cl.directive}" (Contextual grounding: ${cl.reason || 'Natural situational moment'}).`
        );
    });
    const revDir = getSecretRevealDirectiveForScene(storyState, curSeqNum, curScnNum, scene);
    if (revDir && (!revDir.secret_id || !handledSecretIds.has(revDir.secret_id))) {
        directiveLines.push(
            `- MANDATORY REVELATION EVENT: Dramatize the on-page revelation of "${revDir.title || 'Core Truth'}": ${revDir.truth} (Trigger condition: ${revDir.trigger_condition}). Portray the immediate emotional and interpersonal reckoning across participating characters.`
        );
    }

    const directivesBlock =
        directiveLines.length > 0
            ? `<epistemic_tension_and_behavioral_directives>\n${directiveLines.join('\n')}\n</epistemic_tension_and_behavioral_directives>`
            : '';

    const activeStateSnippet =
        activeStateBeliefLines.length > 0
            ? `<focalized_epistemic_projection>\n${activeStateBeliefLines.join('\n')}\n</focalized_epistemic_projection>`
            : '';

    return {
        frictionLevel,
        topItems: topItems as unknown as Array<Record<string, unknown>>,
        directivesBlock,
        activeStateSnippet
    };
}

/** Finds 2-hop intersecting existing beliefs for newly acquired proposition IDs. */
export function findIntersectingBeliefsForConsolidation(
    epistemicGraph: EpistemicGraph | null | undefined,
    charId: string,
    newPropIds: string[] = [],
    sceneCoord = '1.1',
    storyState: ContinuityStoryState = {}
): Array<{
    newProp: EpistemicProposition;
    existingProp: EpistemicProposition;
    existingEdge: EpistemicBeliefEdge;
    sharedEntity: string | undefined;
}> {
    if (!epistemicGraph || !charId || !newPropIds.length) return [];
    const cleanChar = normalizeEntityId(charId);
    const props = epistemicGraph.propositions || {};
    const holds = Array.isArray(epistemicGraph.holds_belief_edges)
        ? epistemicGraph.holds_belief_edges
        : [];

    const activeEdges = holds.filter(
        (e) => e.holder_id === cleanChar && isBeliefActiveAt(e, sceneCoord, storyState)
    );
    const intersections: Array<{
        newProp: EpistemicProposition;
        existingProp: EpistemicProposition;
        existingEdge: EpistemicBeliefEdge;
        sharedEntity: string | undefined;
    }> = [];

    newPropIds.forEach((newId) => {
        const pNew = props[newId];
        if (!pNew) return;
        const newEntities = [pNew.subject_id, pNew.object_id].filter(Boolean);

        activeEdges.forEach((edge) => {
            if (edge.proposition_id === newId) return;
            const pOld = props[edge.proposition_id];
            if (!pOld) return;

            const hasEntityOverlap = newEntities.some(
                (ent) => ent === pOld.subject_id || ent === pOld.object_id
            );
            if (hasEntityOverlap) {
                intersections.push({
                    newProp: pNew,
                    existingProp: pOld,
                    existingEdge: edge,
                    sharedEntity: newEntities.find(
                        (ent) => ent === pOld.subject_id || ent === pOld.object_id
                    )
                });
            }
        });
    });

    return intersections;
}

/** Runs 2-hop deductive consolidation or cognitive-dissonance rationalization via injected `callAIFn`. */
export async function runEpistemicSleepCycle(
    storyState: ContinuityStoryState = {},
    charId = '',
    newPropIds: string[] = [],
    sceneCoord = '1.1',
    callAIFn: EpistemicCallAIFn | null = null
): Promise<Record<string, unknown> | null> {
    if (!storyState || !charId || !newPropIds.length) return null;
    const graph = ensureEpistemicGraph(storyState);
    const cleanChar = normalizeEntityId(charId);

    const intersections = findIntersectingBeliefsForConsolidation(
        graph,
        cleanChar,
        newPropIds,
        sceneCoord,
        storyState
    );
    if (intersections.length === 0) return null;

    const coreLieProp = graph.propositions[`prop_core_lie_${cleanChar}`];
    const coreLieText = coreLieProp ? coreLieProp.claim_text : 'None';

    const pair = intersections[0];
    const charDisplayName = resolveEntityDisplayName(cleanChar, storyState);
    const sharedEntityDisplay = resolveEntityDisplayName(pair.sharedEntity, storyState);
    const sleepPrompt = `<character_name>${charDisplayName}</character_name>
<character_root_lie>${coreLieText}</character_root_lie>
<previously_held_belief>
  <claim>${pair.existingProp.claim_text}</claim>
  <stance>${pair.existingEdge.stance}</stance>
  <confidence>${pair.existingEdge.confidence}</confidence>
</previously_held_belief>
<newly_observed_fact>
  <claim>${pair.newProp.claim_text}</claim>
  <evidence>${pair.newProp.benign_behavioral_tell || 'Direct observation in scene'}</evidence>
</newly_observed_fact>
<shared_entity_anchor>${sharedEntityDisplay}</shared_entity_anchor>

<output_format_description>
Evaluate how ${charDisplayName} integrates <newly_observed_fact> with <previously_held_belief> across <shared_entity_anchor>, filtered through <character_root_lie>. Return strictly valid JSON starting with '{' and ending with '}':
{
  "operation": "DEDUCE_PROPOSITION" | "COGNITIVE_DISSONANCE_RATIONALIZATION",
  "deduced_claim": "Clear, character-voiced statement of the newly inferred belief or the protective rationalization",
  "stance": "SUSPECTS_TRUE" | "BELIEVES_TRUE" | "DOUBTS",
  "confidence": 0.45,
  "modality_rationalization": "Brief description of how the character's internal perspective frames this conclusion",
  "evidence_summary": "Connection between the shared entity anchor and the character's ongoing personal stakes"
}
</output_format_description>`;

    if (typeof callAIFn !== 'function') return null;

    try {
        const consolidationSysPrompt =
            (PROMPTS as Record<string, string | undefined>)?.epistemicConsolidationAgent ||
            "You are a master psychological dramatist and epistemic continuity analyst. Given a character's existing beliefs, their root psychological flaw/lie, and a newly acquired observation, determine whether they deduce a new truth or construct an organic psychological rationalization.";
        const rawOutput = await callAIFn(
            sleepPrompt,
            consolidationSysPrompt,
            false,
            'Epistemic Consolidation (Sleep Cycle)',
            'review'
        );
        let result: Record<string, unknown> | null = null;
        if (rawOutput) {
            const cleaned = rawOutput
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
            const firstB = cleaned.indexOf('{');
            const lastB = cleaned.lastIndexOf('}');
            if (firstB !== -1 && lastB !== -1) {
                result = JSON.parse(cleaned.substring(firstB, lastB + 1)) as Record<string, unknown>;
            }
        }
        if (result && result.deduced_claim) {
            if (result.operation === 'DEDUCE_PROPOSITION') {
                const deducedId = `prop_inferred_${cleanChar}_${Date.now()}`;
                graph.propositions[deducedId] = {
                    id: deducedId,
                    subject_id: cleanChar,
                    predicate: 'INFERRED_TRUTH',
                    object_id: pair.sharedEntity || 'entity_world',
                    claim_text: String(result.deduced_claim),
                    benign_behavioral_tell: 'Internalized deduction guiding future wariness.',
                    benign_cover_interpretation: 'Natural observant habit.',
                    objective_truth: 'UNRESOLVED',
                    world_valid_from_scene: sceneCoord,
                    world_valid_to_scene: null,
                    activation_context: ['INVESTIGATION', 'DECISION_MAKING'],
                    tell_seeded_scenes: []
                };
                graph.holds_belief_edges.push({
                    id: `hb_inferred_${cleanChar}_${Date.now()}`,
                    holder_id: cleanChar,
                    proposition_id: deducedId,
                    stance: String(result.stance || 'SUSPECTS_TRUE'),
                    confidence: Number(result.confidence || 0.45),
                    source_type: 'INFERRED',
                    source_agent_id: null,
                    acquired_at_scene: sceneCoord,
                    invalidated_at_scene: null,
                    emotional_charge: 0.7
                });
            }

            if (!Array.isArray(graph.cascade_log)) graph.cascade_log = [];
            graph.cascade_log.push({
                scene: sceneCoord,
                timestamp: Date.now(),
                type: 'SLEEP_CYCLE_CONSOLIDATION',
                character: cleanChar,
                operation: result.operation,
                claim: result.deduced_claim,
                rationalization: result.modality_rationalization
            });

            return result;
        }
    } catch (err) {
        console.warn('[Sleep Cycle] Consolidation pass skipped or failed:', err);
    }
    return null;
}

/** Phase 4 GESM bi-temporal commit engine: rolls back scene deltas, applies new transitions, and runs consolidation. */
export async function commitEpistemicSceneDeltas(
    storyState: ContinuityStoryState = {},
    transitions: Array<Record<string, unknown>> = [],
    sceneCoord = '1.1',
    scene: Record<string, unknown> = {},
    callAIFn: EpistemicCallAIFn | null = null
): Promise<EpistemicGraph> {
    const graph = ensureEpistemicGraph(storyState);

    rollbackEpistemicStateForScene(graph, sceneCoord);

    const activeTransitions: Array<Record<string, unknown>> = Array.isArray(transitions)
        ? [...transitions]
        : [];
    const scheduledDeltas = Array.isArray(scene.target_epistemic_deltas)
        ? (scene.target_epistemic_deltas as Array<Record<string, unknown>>)
        : [];
    if (activeTransitions.length === 0 && scheduledDeltas.length > 0) {
        scheduledDeltas.forEach((d) => {
            activeTransitions.push({
                operation: d.operation || 'ELEVATE_SUSPICION',
                holder_id: d.holder || scene.pov_character || 'Protagonist',
                proposition_id: d.proposition_id || d.proposition,
                stance: d.to_stance || 'SUSPECTS_TRUE',
                confidence: Number(d.to_confidence || 0.45),
                source_type: 'DIRECT_OBSERVATION',
                evidence_summary: d.trigger_clue || 'Dramatized scene interaction'
            });
        });
    }

    const newlyAcquiredPropsByChar: Record<string, string[]> = {};

    for (const t of activeTransitions) {
        const holderId = normalizeEntityId(t.holder_id || scene.pov_character || 'Protagonist');
        const matchedProp = resolvePropositionMatch(t.proposition_id || t.new_claim_text, graph);

        let propId = matchedProp ? matchedProp.id : null;
        if (!propId && t.new_claim_text) {
            propId = `prop_emergent_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
            graph.propositions[propId] = {
                id: propId,
                subject_id: holderId,
                predicate: 'ESTABLISHED_FACT',
                object_id: 'entity_world',
                claim_text: String(t.new_claim_text),
                benign_behavioral_tell: 'Observable interaction established in scene prose.',
                benign_cover_interpretation: 'Natural narrative circumstance.',
                objective_truth: 'TRUE',
                world_valid_from_scene: sceneCoord,
                world_valid_to_scene: null,
                activation_context: ['NARRATIVE_DEVELOPMENT'],
                tell_seeded_scenes: []
            };
        }

        if (!propId) continue;

        const existingEdge = graph.holds_belief_edges.find(
            (e) =>
                e.holder_id === holderId &&
                e.proposition_id === propId &&
                isBeliefActiveAt(e, sceneCoord, storyState)
        );
        if (existingEdge) {
            existingEdge.invalidated_at_scene = sceneCoord;
        }

        const newEdge: EpistemicBeliefEdge = {
            id: `hb_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            holder_id: holderId,
            proposition_id: propId,
            stance: String(t.stance || 'BELIEVES_TRUE'),
            confidence: Number(t.confidence ?? (t.stance === 'BELIEVES_TRUE' ? 0.9 : 0.5)),
            source_type: String(t.source_type || 'DIRECT_OBSERVATION'),
            source_agent_id: t.source_agent_id ? normalizeEntityId(t.source_agent_id) : null,
            acquired_at_scene: sceneCoord,
            invalidated_at_scene: null,
            emotional_charge: Number(t.emotional_charge ?? 0.5)
        };
        graph.holds_belief_edges.push(newEdge);

        if (!newlyAcquiredPropsByChar[holderId]) newlyAcquiredPropsByChar[holderId] = [];
        newlyAcquiredPropsByChar[holderId].push(propId);

        if (
            t.exposed_liar_agent_id ||
            (t.operation === 'INVALIDATE' &&
                existingEdge &&
                existingEdge.source_type === 'TOLD_BY_AGENT' &&
                existingEdge.source_agent_id)
        ) {
            const liarId = String(t.exposed_liar_agent_id || existingEdge?.source_agent_id || '');
            cascadeInvalidateSourceAgent(graph, holderId, liarId, sceneCoord, storyState);
        }

        if (
            matchedProp &&
            matchedProp.secret_id &&
            t.stance === 'BELIEVES_TRUE' &&
            Number(t.confidence || 0) >= 0.85
        ) {
            archiveRevealedSecretBeliefs(graph, matchedProp.secret_id, sceneCoord);
        }
    }

    for (const [cId, propIds] of Object.entries(newlyAcquiredPropsByChar)) {
        await runEpistemicSleepCycle(storyState, cId, propIds, sceneCoord, callAIFn);
    }

    storyState.epistemic_graph = graph;
    return graph;
}
