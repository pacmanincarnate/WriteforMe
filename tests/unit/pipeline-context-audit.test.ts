import { describe, expect, it, vi } from 'vitest';
import {
    ensureEpistemicGraph
} from '@/domain/continuity';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import {
    getSecretRevealDirectiveForScene,
    isSecretRevealScene,
    normalizeSecretVault
} from '@/domain/story';
import { getDynamicBannedPhrases } from '@/domain/validation';
import {
    buildDirectiveReviewContext,
    buildStoryArcGeneratorPrompt,
    buildStoryArcReviewerPrompt,
    handleWorldUpdates,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { executeLocalTool } from '@/services/llm';

function makeTestContext(
    initialStory: PipelineStory,
    callAiImpl: CallAiFn
): {
    ctx: PipelineRuntimeContext;
    getStorySnapshot: () => PipelineStory;
} {
    let storyState: PipelineStory = { ...initialStory };
    let ragStatus = 'idle';
    let isRebuildingRag = false;
    let ragRev = 0;
    let feedbackLedger: Record<string, string[]> = {};

    const ctx: PipelineRuntimeContext = {
        getStory: () => storyState,
        setStory: (updaterOrValue) => {
            storyState =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(storyState)
                    : updaterOrValue;
            return storyState;
        },
        getActiveStoryId: () => String(storyState.id || 'story_audit_test'),
        updateStoryById: async (_id, updaterOrPatch) => {
            storyState =
                typeof updaterOrPatch === 'function'
                    ? updaterOrPatch(storyState)
                    : { ...storyState, ...updaterOrPatch };
            return storyState;
        },
        getModelSettings: () => ({ apiProvider: 'gemini' }),
        getEffectiveModelConfig: () => ({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            isFallback: false
        }),
        getApiProvider: () => 'gemini',
        getEnableReview: () => true,
        getEnableNarrativeLenses: () => true,
        getSlopConfig: () => DEFAULT_SLOP_CONFIG,
        getBannedPhrases: () => [],
        getFeedbackLedger: () => feedbackLedger,
        setFeedbackLedger: (updater) => {
            feedbackLedger =
                typeof updater === 'function' ? updater(feedbackLedger) : updater;
        },
        setFailedReviewCritiques: vi.fn(),
        setInterventionState: vi.fn(),
        setLoading: vi.fn(),
        setLoadingStep: vi.fn(),
        setWorldPrimer: (primer) => {
            storyState = { ...storyState, world_primer: primer };
        },
        setRagStatus: (s) => {
            ragStatus = s;
        },
        getRagStatus: () => ragStatus,
        setIsRebuildingRag: (b) => {
            isRebuildingRag = b;
        },
        getIsRebuildingRag: () => isRebuildingRag,
        showToast: vi.fn(),
        logPipelineValidation: vi.fn(),
        logPipelineError: vi.fn(),
        getVectorStore: () => null,
        getGraphManager: () => null,
        getEmbeddingService: () => null,
        getRagIndexRevision: () => ragRev,
        bumpRagIndexRevision: () => {
            ragRev += 1;
            return ragRev;
        },
        getLoreImportVersion: () => 0,
        retrieveContext: async () => [],
        callAI: callAiImpl
    };

    return {
        ctx,
        getStorySnapshot: () => storyState
    };
}

describe('pipeline context audit regressions', () => {
    it('aligns secret reveal directive injection and state transition on the climax scene', () => {
        const [normalized] = normalizeSecretVault([
            {
                id: 'sec_harbor_arson',
                title: 'Burned Customs Warehouse',
                truth: 'Inspector Vane ordered the pier fire.',
                reveal_target_act: 3,
                reveal_target_sequence: 7
            }
        ]);

        // Must NOT invent a default scene_number: 1 when none was supplied
        expect(normalized.reveal_anchor.scene_number).toBeUndefined();

        const story = {
            secret_vault: [normalized],
            scenes: {
                '6': [
                    { number: '7.1', title: 'Ash Along the Berth' },
                    { number: '7.2', title: 'Following the Oil Trail' },
                    { number: '7.3', title: 'Showdown Inside Customs Vault' }
                ]
            }
        };

        // Sequence 7 scenes 7.1 and 7.2 must NOT fire or prematurely reveal the secret
        expect(isSecretRevealScene(normalized, 7, 1, story.scenes['6'][0], 3)).toBe(false);
        expect(getSecretRevealDirectiveForScene(story, 7, 1, story.scenes['6'][0])).toBeNull();

        expect(isSecretRevealScene(normalized, 7, 2, story.scenes['6'][1], 3)).toBe(false);
        expect(getSecretRevealDirectiveForScene(story, 7, 2, story.scenes['6'][1])).toBeNull();

        // Sequence 7 climax scene 7.3 MUST both inject the directive and consume the reveal
        expect(isSecretRevealScene(normalized, 7, 3, story.scenes['6'][2], 3)).toBe(true);
        const directive = getSecretRevealDirectiveForScene(story, 7, 3, story.scenes['6'][2]);
        expect(directive?.truth).toContain('Inspector Vane ordered the pier fire');

        // Explicit scene_number override matches that exact scene only
        const [explicitSceneSecret] = normalizeSecretVault([
            {
                id: 'sec_explicit',
                title: 'Key in Boot',
                truth: 'Kael pocketed the brass cipher key.',
                reveal_anchor: { act_number: 2, sequence_number: 5, scene_number: 2 }
            }
        ]);
        expect(explicitSceneSecret.reveal_anchor.scene_number).toBe(2);
        expect(isSecretRevealScene(explicitSceneSecret, 5, 1, {}, 4)).toBe(false);
        expect(isSecretRevealScene(explicitSceneSecret, 5, 2, {}, 4)).toBe(true);

        // Explicit scene_hint title match fires on the hinted scene
        const [hintSecret] = normalizeSecretVault([
            {
                id: 'sec_hint',
                title: 'Forged Treaty',
                truth: 'The chancellor forged the border accord.',
                reveal_anchor: {
                    act_number: 2,
                    sequence_number: 5,
                    scene_hint: 'Oil Trail'
                }
            }
        ]);
        expect(isSecretRevealScene(hintSecret, 5, 2, { number: '5.2', title: 'Following the Oil Trail' }, 4)).toBe(true);
    });

    it('records canonical seq.scn GESM coordinates and valid_from_scene in handleWorldUpdates for Act 2/3 scenes', async () => {
        const story: PipelineStory = {
            id: 'story_world_coord',
            title: 'Salt Ledger',
            cast: [
                { id: 'c_elena', name: 'Elena Vance', role: 'Lead' },
                { id: 'c_marcus', name: 'Marcus Cole', role: 'Ally' }
            ],
            lore: [],
            continuity_ledger: [],
            sequences: [
                { number: 1, parent_act: 1, title: 'Seq 1' },
                { number: 2, parent_act: 1, title: 'Seq 2' },
                { number: 3, parent_act: 2, title: 'Seq 3' },
                { number: 4, parent_act: 2, title: 'Seq 4' },
                { number: 5, parent_act: 2, title: 'Seq 5' }
            ]
        };
        const graph = ensureEpistemicGraph(story);
        graph.propositions.prop_customs_seal = {
            id: 'prop_customs_seal',
            subject_id: 'char_marcus_cole',
            predicate: 'FORGED',
            object_id: 'customs_seal',
            claim_text: 'Marcus forged the customs seal.',
            benign_behavioral_tell: 'Touches wrist',
            benign_cover_interpretation: 'Cold pier air',
            objective_truth: 'TRUE',
            world_valid_from_scene: '1.1',
            world_valid_to_scene: null,
            activation_context: [],
            tell_seeded_scenes: []
        };

        const callAI = vi.fn(async () => '');
        const { ctx } = makeTestContext(story, callAI);

        // Pass Act 2 ("2") and numeric scene 2 in Sequence 5 via sceneObj
        const updated = await handleWorldUpdates(
            ctx,
            {
                lore_updates: [
                    {
                        topic: 'Sunken Drydock Seal',
                        detail: 'Old brass stamp recovered under Berth 5.'
                    }
                ],
                epistemic_transitions: [
                    {
                        operation: 'ACQUIRE',
                        holder_id: 'Elena Vance',
                        proposition_id: 'prop_customs_seal',
                        stance: 'BELIEVES_TRUE',
                        confidence: 0.92
                    }
                ]
            },
            2,
            '5.2',
            story,
            { number: '5.2', sequence_number: 5, pov_character: 'Elena Vance' }
        );

        const updatedGraph = ensureEpistemicGraph(updated || {});
        const acquiredEdge = updatedGraph.holds_belief_edges.find(
            (e) => e.proposition_id === 'prop_customs_seal'
        );
        expect(acquiredEdge?.acquired_at_scene).toBe('5.2');
        expect((updated?.lore as Array<Record<string, unknown>>)?.[0]?.valid_from_act).toBe(2);
        expect((updated?.lore as Array<Record<string, unknown>>)?.[0]?.valid_from_scene).toBe(2);

        // Also check numeric activeSceneNum with sceneObj.sequence_number = 5 (never uses actNum as seq!)
        const updatedNumeric = await handleWorldUpdates(
            ctx,
            {
                epistemic_transitions: [
                    {
                        operation: 'ACQUIRE',
                        holder_id: 'Marcus Cole',
                        proposition_id: 'prop_customs_seal',
                        stance: 'SUSPECTS_TRUE',
                        confidence: 0.55
                    }
                ]
            },
            2,
            3,
            story,
            { sequence_number: 5, pov_character: 'Marcus Cole' }
        );
        const numericGraph = ensureEpistemicGraph(updatedNumeric || {});
        const marcusEdge = numericGraph.holds_belief_edges.find(
            (e) => e.holder_id === 'char_marcus_cole' && e.proposition_id === 'prop_customs_seal'
        );
        expect(marcusEdge?.acquired_at_scene).toBe('5.3');
    });

    it('includes heart_of_the_dilemma, world_primer, and author_note in Story Arc generator and reviewer prompts', () => {
        const params = {
            concept: 'An archivist uncovers forged maritime treaties.',
            heartOfTheDilemma: 'Loyalty to her brother vs. exposing the harbor flood cover-up.',
            arcLoreBlocks: '<world_primer>\nOakhaven floats on tidal pilings.\n</world_primer>',
            pillarsBlock: '<synthesized_authorial_persona>\nSharp maritime noir\n</synthesized_authorial_persona>\n\n',
            style: { genre: 'Noir Mystery', mood: 'Salt and dread' },
            statusQuo: 'Elena audits customs ledgers before dawn.',
            castList: [{ name: 'Elena Vance', role: 'Protagonist', core_flaw: 'Isolation', core_desire: 'Truth' }],
            authorNoteStory: { author_note: 'Keep scenes sensory and grounded.' }
        };

        const genPrompt = buildStoryArcGeneratorPrompt(params);
        expect(genPrompt).toContain('<heart_of_the_dilemma>');
        expect(genPrompt).toContain('<world_primer>');
        expect(genPrompt).toContain('<author_note>');
        expect(genPrompt).toContain('Keep scenes sensory and grounded.');

        const revPrompt = buildStoryArcReviewerPrompt({
            ...params,
            genOutput: '<response><global_arc/></response>'
        });
        expect(revPrompt).toContain('<heart_of_the_dilemma>');
        expect(revPrompt).toContain('harbor flood cover-up');
        expect(revPrompt).toContain('<world_primer>');
        expect(revPrompt).toContain('Oakhaven floats on tidal pilings.');
    });

    it('includes genre/tone/style, world_primer, and story_so_far in buildDirectiveReviewContext', () => {
        const prompt = buildDirectiveReviewContext(
            {
                title: 'Salt Ledger',
                world_primer: 'Customs guilds govern every berth in Oakhaven.',
                story_so_far: 'Elena inspected Berth 4 and found the scorched manifest.',
                style: { genre: 'Maritime Noir', mood: 'Tense fog' },
                cast: [{ id: 'c1', name: 'Elena Vance', role: 'Protagonist' }],
                sequences: [{ number: 1, parent_act: 1, title: 'Harbor Fog' }],
                scenes: {
                    '0': [{ number: '1.1', title: 'Pier Check', pov_character: 'Elena Vance', characters_present: ['Elena Vance'] }]
                },
                prose: { '0-0': { final: 'Rain slicked the oak pilings while Elena checked the lock.' } }
            },
            0,
            0
        );

        expect(prompt).toContain('<genre_classification>');
        expect(prompt).toContain('<tone_and_atmosphere>');
        expect(prompt).toContain('<writing_style_description>');
        expect(prompt).toContain('<world_primer>');
        expect(prompt).toContain('Customs guilds govern every berth in Oakhaven.');
        expect(prompt).toContain('<story_so_far>');
        expect(prompt).toContain('scorched manifest');
    });

    it('excludes LoreItem.topic proper nouns from dynamic banned phrases and derives query_archivist sceneCoord', () => {
        const loreItems = [{ id: 'l1', topic: 'Vespera', detail: 'Tidal lantern guild.' }];
        const recentProse =
            'Vespera bells tolled across the harbor. Vespera bells rang twice. Vespera bells echoed loudly. Vespera bells shook the timber.';
        const dynamicExclusions = [
            'Elena Vance',
            ...loreItems.map((l) => String(l.topic || '')).filter(Boolean)
        ];

        const withoutTopicExclusion = getDynamicBannedPhrases(recentProse, ['Elena Vance']);
        expect(withoutTopicExclusion.map((w) => w.toLowerCase())).toContain('vespera bells');

        const withTopicExclusion = getDynamicBannedPhrases(recentProse, dynamicExclusions);
        expect(withTopicExclusion.map((w) => w.toLowerCase())).not.toContain('vespera bells');

        const story: PipelineStory = {
            id: 'story_archivist_tool',
            title: 'Salt Ledger',
            cast: [{ id: 'c1', name: 'Elena Vance', role: 'Lead' }],
            knowledge_graph: { nodes: [], edges: [] }
        };
        const graph = ensureEpistemicGraph(story);
        graph.propositions.prop_late = {
            id: 'prop_late',
            subject_id: 'char_elena_vance',
            predicate: 'KNEW',
            object_id: 'cipher_key',
            claim_text: 'The cipher key unlocks Berth 5.',
            benign_behavioral_tell: 'None',
            benign_cover_interpretation: 'None',
            objective_truth: 'TRUE',
            world_valid_from_scene: '4.1',
            world_valid_to_scene: null,
            activation_context: [],
            tell_seeded_scenes: []
        };
        graph.holds_belief_edges.push({
            id: 'hb_4_1',
            holder_id: 'char_elena_vance',
            proposition_id: 'prop_late',
            stance: 'BELIEVES_TRUE',
            confidence: 0.9,
            source_type: 'DIRECT_OBSERVATION',
            acquired_at_scene: '4.1',
            invalidated_at_scene: null,
            emotional_charge: 0.3
        });

        const toolResult = executeLocalTool(
            'query_archivist',
            { query: 'cipher key' },
            {
                story,
                sequenceData: { number: 4 },
                sceneNumber: 2,
                currentScene: { pov_character: 'Elena Vance', title: 'Undated Bridge Scene' },
                activeCast: [{ name: 'Elena Vance', id: 'c1' }]
            }
        );
        const truth = toolResult.historical_ground_truth as {
            focalized_character_beliefs?: Array<{ claim: string }>;
        };
        const matches = truth?.focalized_character_beliefs || [];
        expect(matches.some((m) => m.claim.includes('Berth 5'))).toBe(true);
    });
});
