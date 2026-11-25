/**
 * @module domain/continuity/epistemicEditing
 * Manual edits to a story's epistemic graph (the GESM tab): save / delete a proposition and
 * save / invalidate a character belief. Each takes a story and returns a new one whose
 * `epistemic_graph` carries the change.
 */

import {
    ensureEpistemicGraph,
    ensureEpistemicGraphAccessors,
    normalizeEntityId,
    normalizeEpistemicPropositionsMap,
    type EpistemicBeliefEdge,
    type EpistemicGraph,
    type EpistemicProposition
} from './epistemicGraph';
import { compareSceneCoordinates, type ContinuityStoryState } from './ledger';

/** Fields of the proposition form; everything is optional and defaulted on save. */
export interface PropositionDraft {
    id?: string | null;
    claim_text?: string;
    subject_id?: string;
    predicate?: string;
    object_id?: string;
    objective_truth?: string;
    world_valid_from_scene?: string;
    world_valid_to_scene?: string | null;
}

/** Fields of the belief form. */
export interface BeliefDraft {
    holder_id?: string;
    proposition_id: string;
    stance?: string;
    confidence?: unknown;
    source_type?: string;
    source_agent_id?: string | null;
    acquired_at_scene?: string;
    invalidated_at_scene?: string | null;
}

type BeliefEdgeRef = Pick<EpistemicBeliefEdge, 'holder_id' | 'proposition_id' | 'acquired_at_scene'>;

function beliefEdgesOf(graph: EpistemicGraph): EpistemicBeliefEdge[] {
    if (Array.isArray(graph.holds_belief_edges)) return graph.holds_belief_edges;
    return Array.isArray(graph.first_order_edges) ? graph.first_order_edges : [];
}

function withGraph<T extends ContinuityStoryState>(story: T, graph: EpistemicGraph): T {
    return { ...story, epistemic_graph: ensureEpistemicGraphAccessors(graph) };
}

/**
 * Adds or updates a proposition. A blank id creates `prop_<now>`; an existing id is merged so
 * fields the form does not edit (tells, activation context) survive.
 */
export function saveProposition<T extends ContinuityStoryState>(
    story: T,
    draft: PropositionDraft,
    now: () => number = Date.now
): T {
    const graph = ensureEpistemicGraph(story);
    const propId = draft.id ? String(draft.id).trim() : `prop_${now()}`;
    const nextProp = {
        id: propId,
        claim_text: draft.claim_text || 'Unspecified proposition',
        subject_id: normalizeEntityId(draft.subject_id || 'world'),
        predicate: (draft.predicate || 'FACT').toUpperCase().trim(),
        object_id: normalizeEntityId(draft.object_id || ''),
        objective_truth: draft.objective_truth || 'TRUE',
        world_valid_from_scene: draft.world_valid_from_scene || '0.0',
        world_valid_to_scene: draft.world_valid_to_scene || null
    };
    const propositions = normalizeEpistemicPropositionsMap(graph.propositions);
    propositions[propId] = { ...(propositions[propId] || {}), ...nextProp } as EpistemicProposition;
    return withGraph(story, { ...graph, propositions });
}

/** Removes a proposition together with every first- and second-order belief about it. */
export function deleteProposition<T extends ContinuityStoryState>(story: T, propId: string): T {
    const graph = ensureEpistemicGraph(story);
    const propositions = normalizeEpistemicPropositionsMap(graph.propositions);
    delete propositions[propId];
    return withGraph(story, {
        ...graph,
        propositions,
        holds_belief_edges: beliefEdgesOf(graph).filter((e) => e.proposition_id !== propId),
        second_order_edges: (graph.second_order_edges || []).filter((e) => e.proposition_id !== propId)
    });
}

/**
 * Records a belief for a holder. Any belief the holder still held about the same proposition at
 * `acquired_at_scene` is closed at that scene; a new edge is added unless the stance is
 * `UNAWARE`, which only closes.
 */
export function saveBelief<T extends ContinuityStoryState>(story: T, draft: BeliefDraft): T {
    const graph = ensureEpistemicGraph(story);
    const holderId = normalizeEntityId(draft.holder_id || 'meta_reader');
    const propId = draft.proposition_id;
    const acquiredAt = draft.acquired_at_scene || '1.1';
    const stance = draft.stance || 'BELIEVES_TRUE';
    const confidence =
        typeof draft.confidence === 'number' ? Math.max(0, Math.min(1, draft.confidence)) : 0.85;

    const nextEdges = beliefEdgesOf(graph).map((e) => {
        const stillOpen =
            !e.invalidated_at_scene || compareSceneCoordinates(e.invalidated_at_scene, acquiredAt, story) > 0;
        return e.holder_id === holderId && e.proposition_id === propId && stillOpen
            ? { ...e, invalidated_at_scene: acquiredAt }
            : e;
    });

    if (stance !== 'UNAWARE') {
        // Manually added edges carry no `id`, as in the original editor.
        nextEdges.push({
            holder_id: holderId,
            proposition_id: propId,
            stance,
            confidence,
            source_type: draft.source_type || 'DIRECT_OBSERVATION',
            source_agent_id: draft.source_agent_id ? normalizeEntityId(draft.source_agent_id) : null,
            acquired_at_scene: acquiredAt,
            invalidated_at_scene: draft.invalidated_at_scene || null,
            emotional_charge: 0.5
        } as EpistemicBeliefEdge);
    }

    return withGraph(story, { ...graph, holds_belief_edges: nextEdges });
}

/** Closes a belief edge (matched by identity, or by holder + proposition + acquisition scene). */
export function invalidateBelief<T extends ContinuityStoryState>(
    story: T,
    edge: BeliefEdgeRef,
    sceneCoord: string
): T {
    const graph = ensureEpistemicGraph(story);
    const nextEdges = beliefEdgesOf(graph).map((e) =>
        e === edge ||
        (e.holder_id === edge.holder_id &&
            e.proposition_id === edge.proposition_id &&
            e.acquired_at_scene === edge.acquired_at_scene)
            ? { ...e, invalidated_at_scene: sceneCoord }
            : e
    );
    return withGraph(story, { ...graph, holds_belief_edges: nextEdges });
}
