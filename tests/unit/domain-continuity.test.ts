import { describe, expect, it, vi } from 'vitest';
import {
    archiveRevealedSecretBeliefs,
    buildScenePlannerContinuityBlock,
    buildSequencePromptContext,
    buildUpcomingBoundaryGuardInfo,
    cascadeInvalidateSourceAgent,
    commitEpistemicSceneDeltas,
    compareSceneCoordinates,
    compileActiveState,
    compileEpistemicAsymmetryAndIrony,
    ensureEpistemicGraph,
    ensureEpistemicGraphAccessors,
    extractProseTextTail,
    findIntersectingBeliefsForConsolidation,
    formatArchivistBlueprintContext,
    formatChoreographedBeatHistory,
    formatContinuityLedgerForPrompt,
    formatSceneCharactersList,
    formatSceneCoord,
    formatSequenceCastProfiles,
    getContinuityContext,
    getSequenceScenesList,
    ingestSceneContinuityData,
    initEpistemicGraph,
    initKnowledgeGraph,
    isBeliefActiveAt,
    isFactKnownAt,
    logSemanticEvent,
    normalizeEntityId,
    normalizeEpistemicPropositionsMap,
    parseSceneCoordinates,
    projectFocalizedSubgraph,
    querySemanticEventLog,
    resolveEntityDisplayName,
    resolvePropositionMatch,
    rollbackEpistemicStateForScene,
    runContinuityAuditor,
    runEpistemicSleepCycle,
    updateKnowledgeGraph,
    type ContinuityStoryState
} from '@/domain/continuity';

function makeSampleStoryState(): ContinuityStoryState {
    return {
        title: 'The Salt Ledger',
        genre: 'Mystery',
        style: { genre: 'Mystery', mood: 'Atmospheric Noir' },
        cast: [
            {
                id: 'char_elena',
                name: 'Elena Vance',
                role: 'Protagonist',
                core_flaw: 'Refuses help after past betrayal',
                core_desire: 'Expose the harbor syndicate'
            },
            {
                id: 'char_marcus',
                name: 'Marcus Cole',
                role: 'Deuteragonist',
                core_flaw: 'Protects compromised allies',
                core_desire: 'Keep the docks peaceful'
            }
        ],
        character_arcs: [
            {
                char_id: 'Elena Vance',
                lie_believed: 'Trust always leads to ambush',
                truth_needed: 'Allies must carry part of the weight'
            }
        ],
        secret_vault: [
            {
                id: 'sec_forged_manifest',
                title: 'Forged Customs Seal',
                category: 'plot_mystery',
                truth: 'Marcus signed the forged manifest under duress.',
                known_by: 'Marcus Cole',
                concealed_from: 'Elena Vance',
                status: 'concealed',
                reveal_anchor: { act_number: 2, sequence_number: 4, scene_number: 1 }
            }
        ],
        acts: [{ number: 1, title: 'Low Tide', description: 'Elena inspects the burned freighter.' }],
        sequences: [
            {
                number: 1,
                parent_act: 1,
                title: 'Pier Four',
                scenes: [
                    { number: '1.1', title: 'Ash on Water', characters_present: ['Elena Vance', 'Marcus Cole'] },
                    { number: '1.2', title: 'Locked Office', characters_present: ['Elena Vance', 'Marcus Cole'] }
                ]
            },
            {
                number: 2,
                parent_act: 1,
                title: 'Customs House',
                scenes: [{ number: '2.1', title: 'Vault Door', characters_present: ['Elena Vance'] }]
            }
        ],
        scenes: {
            '0': [
                { number: '1.1', title: 'Ash on Water', characters_present: ['Elena Vance', 'Marcus Cole'] },
                { number: '1.2', title: 'Locked Office', characters_present: ['Elena Vance', 'Marcus Cole'] }
            ],
            '1': [{ number: '2.1', title: 'Vault Door', characters_present: ['Elena Vance'] }]
        },
        continuity_ledger: []
    };
}

describe('Continuity Domain: ledger', () => {
    it('parses, formats, and compares scene coordinates and evaluates belief/fact visibility', () => {
        expect(parseSceneCoordinates('0.0')).toEqual({ act: 0, sequence: 0, scene: 0 });
        expect(parseSceneCoordinates('2.3')).toEqual({ act: 1, sequence: 2, scene: 3 });
        expect(formatSceneCoord(2, 3)).toBe('2.3');
        expect(compareSceneCoordinates('1.2', '2.1')).toBeLessThan(0);
        expect(compareSceneCoordinates('2.1', '2.1')).toBe(0);

        expect(
            isBeliefActiveAt({ acquired_at_scene: '1.1', invalidated_at_scene: '2.1' }, '1.2')
        ).toBe(true);
        expect(
            isBeliefActiveAt({ acquired_at_scene: '1.1', invalidated_at_scene: '2.1' }, '2.1')
        ).toBe(false);

        expect(
            isFactKnownAt({ valid_from_sequence: 1, valid_from_scene: 1, status: 'active' }, '1.2', makeSampleStoryState())
        ).toBe(true);
    });

    it('ingests continuity data into the ledger and formats prompt context', () => {
        const story = makeSampleStoryState();
        story.continuity_ledger = ingestSceneContinuityData(
            {
                number: '1.1',
                hard_facts_introduced: [
                    {
                        category: 'physical_state',
                        key: 'elena_left_wrist',
                        fact: 'Elena sprained her left wrist climbing the piling.',
                        character: 'Elena Vance'
                    }
                ]
            },
            story
        );
        expect((story.continuity_ledger || []).length).toBeGreaterThan(0);

        const formatted = formatContinuityLedgerForPrompt(story);
        expect(formatted).toContain('Elena');

        const legacyCtx = getContinuityContext(story, '2.1');
        expect(typeof legacyCtx).toBe('string');
    });
});

describe('Continuity Domain: GESM epistemicGraph', () => {
    it('initializes, projects, compiles asymmetry, rolls back, cascades invalidation, and archives secrets', () => {
        expect(normalizeEntityId('Elena Vance')).toBe('char_elena_vance');
        const story = makeSampleStoryState();
        expect(resolveEntityDisplayName('char_elena_vance', story)).toBe('Elena Vance');

        const rawGraph = initEpistemicGraph(story);
        expect(rawGraph.entities.meta_reader).toBeDefined();

        const normalizedProps = normalizeEpistemicPropositionsMap({
            p1: { id: 'p1', claim_text: 'Marcus forged the seal' }
        });
        expect(normalizedProps.p1.claim_text).toBe('Marcus forged the seal');

        const graph = ensureEpistemicGraph(story);
        ensureEpistemicGraphAccessors(graph);
        expect(resolvePropositionMatch('sec_forged_manifest', graph)?.id).toContain('sec_forged_manifest');

        const projection = projectFocalizedSubgraph(story, {
            povCharId: 'Elena Vance',
            partnerCharIds: ['Marcus Cole'],
            sceneCoord: '1.1'
        });
        expect(projection.cleanPov).toBe('char_elena_vance');

        const compiled = compileEpistemicAsymmetryAndIrony(
            projection,
            { dominant_narrative_mode: 'SUSPENSE' },
            story,
            '1.1'
        );
        expect(compiled.frictionLevel).toBe('HIGH');

        graph.holds_belief_edges.push({
            id: 'hb_liar_1',
            holder_id: 'char_elena_vance',
            proposition_id: 'prop_sec_forged_manifest_truth',
            stance: 'BELIEVES_TRUE',
            confidence: 0.9,
            source_type: 'TOLD_BY_AGENT',
            source_agent_id: 'char_marcus_cole',
            acquired_at_scene: '1.1',
            invalidated_at_scene: null,
            emotional_charge: 0.2
        });
        const cascaded = cascadeInvalidateSourceAgent(graph, 'char_elena_vance', 'char_marcus_cole', '1.2', story);
        expect(cascaded.length).toBeGreaterThanOrEqual(1);

        graph.holds_belief_edges.push({
            id: 'hb_test_12',
            holder_id: 'char_elena_vance',
            proposition_id: 'prop_temp',
            stance: 'SUSPECTS_TRUE',
            confidence: 0.5,
            source_type: 'DIRECT_OBSERVATION',
            acquired_at_scene: '1.2',
            invalidated_at_scene: null,
            emotional_charge: 0.1
        });
        rollbackEpistemicStateForScene(graph, '1.2');
        expect(graph.holds_belief_edges.some((e) => e.acquired_at_scene === '1.2')).toBe(false);

        archiveRevealedSecretBeliefs(graph, 'sec_forged_manifest', '2.1');
    });

    it('runs findIntersectingBeliefsForConsolidation, runEpistemicSleepCycle, and commitEpistemicSceneDeltas with mocked callAIFn', async () => {
        const story = makeSampleStoryState();
        const graph = ensureEpistemicGraph(story);
        graph.propositions.prop_marcus_coat = {
            id: 'prop_marcus_coat',
            subject_id: 'char_elena_vance',
            predicate: 'OBSERVED',
            object_id: 'char_marcus_cole',
            claim_text: 'Marcus hid stained dock gloves inside his coat.',
            benign_behavioral_tell: 'Keeps right pocket buttoned.',
            benign_cover_interpretation: 'Cold evening breeze.',
            objective_truth: 'TRUE',
            world_valid_from_scene: '1.1',
            world_valid_to_scene: null,
            activation_context: ['INVESTIGATION'],
            tell_seeded_scenes: []
        };
        graph.holds_belief_edges.push({
            id: 'hb_elena_prev',
            holder_id: 'char_elena_vance',
            proposition_id: 'prop_marcus_coat',
            stance: 'SUSPECTS_TRUE',
            confidence: 0.45,
            source_type: 'DIRECT_OBSERVATION',
            acquired_at_scene: '1.1',
            invalidated_at_scene: null,
            emotional_charge: 0.5
        });
        graph.propositions.prop_marcus_stamp = {
            id: 'prop_marcus_stamp',
            subject_id: 'char_marcus_cole',
            predicate: 'POSSESSED',
            object_id: 'sec_forged_manifest',
            claim_text: 'Marcus carried the brass customs stamp.',
            benign_behavioral_tell: 'Adjusts satchel strap.',
            benign_cover_interpretation: 'Old habit.',
            objective_truth: 'TRUE',
            world_valid_from_scene: '1.2',
            world_valid_to_scene: null,
            activation_context: ['INVESTIGATION'],
            tell_seeded_scenes: []
        };

        const intersections = findIntersectingBeliefsForConsolidation(
            graph,
            'char_elena_vance',
            ['prop_marcus_stamp'],
            '1.2',
            story
        );
        expect(intersections.length).toBeGreaterThan(0);

        const callAIFn = vi.fn(async () =>
            JSON.stringify({
                operation: 'DEDUCE_PROPOSITION',
                deduced_claim: 'Marcus tampered with the customs seal himself.',
                stance: 'SUSPECTS_TRUE',
                confidence: 0.72,
                modality_rationalization: 'Elena connects the coat gloves to the missing stamp.',
                evidence_summary: 'Both relate to Marcus Cole.'
            })
        );

        const sleepResult = await runEpistemicSleepCycle(story, 'elena_vance', ['prop_marcus_stamp'], '1.2', callAIFn);
        expect(sleepResult?.operation).toBe('DEDUCE_PROPOSITION');
        expect(callAIFn).toHaveBeenCalledTimes(1);

        const updatedGraph = await commitEpistemicSceneDeltas(
            story,
            [
                {
                    operation: 'ACQUIRE',
                    holder_id: 'elena_vance',
                    proposition_id: 'prop_marcus_stamp',
                    stance: 'BELIEVES_TRUE',
                    confidence: 0.9
                }
            ],
            '1.2',
            { pov_character: 'Elena Vance' },
            callAIFn
        );
        expect(updatedGraph.holds_belief_edges.some((e) => e.proposition_id === 'prop_marcus_stamp')).toBe(true);
    });
});

describe('Continuity Domain: contextBuilders and activeState', () => {
    it('builds sequence, scene planner, boundary guard, beat history, cast profile, and archivist context', () => {
        const story = makeSampleStoryState();
        const seqCtx = buildSequencePromptContext(story, {}, story.acts as Array<Record<string, unknown>>, 1, []);
        expect(seqCtx).toContain('<continuity_ledger>');

        expect(extractProseTextTail('One two three four five.', 3)).toContain('three four five.');
        expect(getSequenceScenesList(story, 0)).toHaveLength(2);
        expect(formatSceneCharactersList({ characters_present: ['Elena Vance', 'Marcus Cole'] })).toContain('Elena Vance');

        const plannerBlock = buildScenePlannerContinuityBlock(story, 1);
        expect(plannerBlock).toContain('Ash on Water');

        const boundary = buildUpcomingBoundaryGuardInfo({
            storyToUse: story,
            seq: 0,
            s: 0,
            scene: { number: '1.1', title: 'Ash on Water' }
        });
        expect(boundary.isSequenceBoundary).toBe(false);
        expect(boundary.xmlBlock).toContain('Locked Office');

        expect(
            formatChoreographedBeatHistory([
                {
                    initiator: 'Elena',
                    reactor: 'Marcus',
                    action: 'Elena crouches beside the charred hull.',
                    reaction: 'Marcus checks the pier shadows.'
                }
            ])
        ).toContain('Elena crouches');

        expect(formatSequenceCastProfiles(story, { scene_cast: ['Elena Vance'] })).toContain('Elena Vance');
        expect(
            formatArchivistBlueprintContext({
                hard_facts_introduced: [{ category: 'Prop', key: 'Key', fact: 'Brass customs key locked in safe.' }]
            })
        ).toContain('Brass customs key');
    });

    it('updates KnowledgeGraph, queries Semantic Event Log, compiles active state, and runs Continuity Auditor', async () => {
        const story = makeSampleStoryState();
        const kg = initKnowledgeGraph(story);
        expect(kg.nodes.length).toBeGreaterThanOrEqual(2);

        const nextKg = updateKnowledgeGraph(story, {
            nodes: [{ id: 'loc_pier_4', type: 'location', name: 'Pier Four', status: 'soaked' }],
            edges: [{ source: 'Elena Vance', target: 'Marcus Cole', type: 'suspicion', details: 'Guarded trust' }]
        });
        expect(nextKg.nodes.some((n) => n.name === 'Pier Four')).toBe(true);
        story.knowledge_graph = nextKg;

        story.event_log = logSemanticEvent(story, {
            scene_id: '1.1',
            sequence: 1,
            scene: 1,
            summary: 'Elena recovered a soaked shipping tag at Pier Four.',
            entities_involved: ['Elena Vance', 'Pier Four']
        });
        expect(querySemanticEventLog(story, { entityNames: ['Elena Vance'] })).toHaveLength(1);

        const activeState = compileActiveState(story, { setting: 'Pier Four', characters_present: ['Elena Vance', 'Marcus Cole'] }, []);
        expect(activeState).toContain('<active_state>');

        const longDraft =
            'Elena stepped onto the slick timber of Pier Four with her right hand cradling her bruised ribs. The harbor fog curled tightly around the pilings while distant bells tolled midnight across the black inlet.';
        const patchAuditor = vi.fn(
            async () => `<surgical_patch>
<search>right hand cradling her bruised ribs</search>
<replace>right hand gripping the cold iron railing</replace>
</surgical_patch>`
        );

        const auditRes = await runContinuityAuditor({
            proseText: longDraft,
            activeStateBlock: activeState,
            scene: { number: '1.2', title: 'Locked Office', pov_character: 'Elena Vance', setting: 'Pier Four' },
            callAIFn: patchAuditor
        });
        expect(auditRes.status).toBe('PATCHED');
        expect(auditRes.patchesApplied).toBe(1);
        expect(auditRes.prose).toContain('gripping the cold iron railing');
    });
});
