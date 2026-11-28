import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createStoryEntityFromSetup,
    generateActsAndSequences,
    generateScenes,
    generateSequences,
    generateStoryArc,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import { storyStore, logStore } from '@/services/storage';

function makeStructureTestContext(
    initialStory: PipelineStory,
    callAiImpl: CallAiFn
): {
    ctx: PipelineRuntimeContext;
    getStorySnapshot: () => PipelineStory;
    toasts: Array<{ message: string; variant?: string }>;
} {
    let storyState: PipelineStory = { ...initialStory };
    let ragStatus = 'idle';
    let isRebuildingRag = false;
    let ragRev = 0;
    let feedbackLedger: Record<string, string[]> = {};
    const pendingSetupLore: Record<string, string> = {};
    const snapshotsById: Record<string, PipelineStory> = {};
    const skipRef = { current: null as string | null };
    const initMountRef = { current: true };
    const logHydratedRef = { current: false };
    const hydratedRef = { current: false };
    const toasts: Array<{ message: string; variant?: string }> = [];

    const ctx: PipelineRuntimeContext = {
        getStory: () => storyState,
        setStory: (updaterOrValue) => {
            storyState =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(storyState)
                    : updaterOrValue;
            return storyState;
        },
        getActiveStoryId: () => String(storyState.id || 'story_struct_test'),
        updateStoryById: async (_id, updaterOrPatch) => {
            storyState =
                typeof updaterOrPatch === 'function'
                    ? updaterOrPatch(storyState)
                    : { ...storyState, ...updaterOrPatch };
            return storyState;
        },
        refreshLibrary: vi.fn(async () => {}),
        getModelSettings: () => ({ apiProvider: 'gemini' }),
        getEffectiveModelConfig: () => ({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            isFallback: false
        }),
        getApiProvider: () => 'gemini',
        getEnableReview: () => true,
        getEnableNarrativeLenses: () => true,
        getSlopConfig: () => ({ ...DEFAULT_SLOP_CONFIG, enableSlopAudit: false }),
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
        setActivePipelineWork: vi.fn(),
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
        setView: vi.fn(),
        setSelectedAct: vi.fn(),
        setSelectedSequence: vi.fn(),
        setSelectedScene: vi.fn(),
        setActiveActTab: vi.fn(),
        setActiveStoryId: vi.fn(),
        setPromptLog: vi.fn(),
        getSelectedSequence: () => 0,
        getPendingSetupLoreMap: () => pendingSetupLore,
        getStorySnapshotsByIdMap: () => snapshotsById,
        getSkipNextIdbHydrationIdRef: () => skipRef,
        getIsInitialMountRef: () => initMountRef,
        getIsLogHydratedRef: () => logHydratedRef,
        getHasHydratedStoryRef: () => hydratedRef,
        getSetupDraft: () => ({
            inputConcept: 'A cartographer maps a sinking coastal prison.',
            inputTitle: 'Salt & Compass',
            inputWritingMode: 'novel',
            inputBookType: 'popular'
        }),
        clearSetupDraft: vi.fn(),
        isAutopilotProtectedView: () => false,
        showToast: (message, variant) => {
            toasts.push({ message, variant });
        },
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
        getStorySnapshot: () => storyState,
        toasts
    };
}

const VALID_ARC_XML = `<response>
  <global_arc>
    <core_thematic_argument>Precision cannot substitute for mercy when institutions break.</core_thematic_argument>
    <starting_value_state>Measures every human risk as geometry.</starting_value_state>
    <ending_value_state>Surrenders his clean ledger to save the floodgate crew.</ending_value_state>
    <inciting_incident>The sea wall fractures beneath Tier Three cellblocks.</inciting_incident>
    <major_surprises_and_twists>1. The warden funded the sabotage. 2. The escape tunnel leads upward into the lighthouse.</major_surprises_and_twists>
  </global_arc>
  <narrative_threads>
    <thread><thread_id>T1</thread_id><name>Wall Collapse</name><description>Race to evacuate before spring tide.</description></thread>
    <thread><thread_id>T2</thread_id><name>Sisterhood Bond</name><description>Repairing estrangement with Nadia.</description></thread>
    <thread><thread_id>T3</thread_id><name>Ledger vs Mercy</name><description>Internal shift from detachment to sacrifice.</description></thread>
  </narrative_threads>
  <character_arcs>
    <arc><char_id>Hannah Mercer</char_id><corner_role>MAIN_CHARACTER</corner_role><lie_believed>Emotion clouds judgment.</lie_believed><truth_needed>Solidarity survives chaos.</truth_needed><arc_catalyst>Sealing Gate Four.</arc_catalyst><arc_description>Moves from clinical distance to shared risk.</arc_description></arc>
  </character_arcs>
</response>`;

function makeActMandate(num: number): string {
    return `- **THEMATIC & STRUCTURAL FUNCTION:** Act ${num} establishes clear structural confrontation and explores core thematic tension with sustained momentum.
- **DRAMATIC ARC & PACING CURVES:** Act ${num} escalates rising conflict cleanly across its assigned narrative sequences.
- **THREAD PROGRESSION & CONVERGENCE:** Threads T1, T2, and T3 interweave directly through irreversible physical choices.
- **CHARACTER & PSYCHOLOGICAL JOURNEY:** Hannah Mercer tests her core lie against real relational cost.
- **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Preserve spatial continuity and tight causal stakes.`;
}

const VALID_ACTS_XML = `<response>
  <acts>
    <act><number>1</number><title>Act I</title><act_mandate>${makeActMandate(1)}</act_mandate></act>
    <act><number>2</number><title>Act II</title><act_mandate>${makeActMandate(2)}</act_mandate></act>
    <act><number>3</number><title>Act III</title><act_mandate>${makeActMandate(3)}</act_mandate></act>
  </acts>
  <thread_statuses_at_end>
    <thread_status><thread_id>T1</thread_id><status>Escalating</status></thread_status>
    <thread_status><thread_id>T2</thread_id><status>Tested</status></thread_status>
    <thread_status><thread_id>T3</thread_id><status>Shifting</status></thread_status>
  </thread_statuses_at_end>
</response>`;

const EIGHT_SEQUENCES_XML = `<response><sequences>${Array.from({ length: 8 }, (_, idx) => {
    const n = idx + 1;
    const act = n <= 2 ? 1 : n <= 6 ? 2 : 3;
    return `<sequence>
      <number>${n}</number>
      <parent_act>${act}</parent_act>
      <title>Sequence ${n}</title>
      <sequence_function>Function ${n}</sequence_function>
      <dramatic_question>Can Hannah hold Section ${n}?</dramatic_question>
      <starting_state>Hannah enters Lock ${n}.</starting_state>
      <description>- **THEMATIC & STRUCTURAL FUNCTION:** Sequence ${n} sharpens the moral wager under rising water.
- **DRAMATIC ARC & PACING CURVES:** Pacing tightens from inspection to rupture across the pier.
- **THREAD PROGRESSION & CONVERGENCE:** T1, T2, and T3 collide at the floodgate valve.
- **CHARACTER & PSYCHOLOGICAL JOURNEY:** Hannah risks her spotless record to warn the crew.
- **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Keep tidal timing consistent.</description>
      <sequence_objective>Secure bulkhead ${n}.</sequence_objective>
      <threads_advanced><thread>T1</thread></threads_advanced>
      <characters_in_focus><character>Hannah Mercer</character></characters_in_focus>
      <sequence_climax>Valve ${n} jams halfway down.</sequence_climax>
      <ending_hook>Water spills toward Lock ${n + 1}.</ending_hook>
    </sequence>`;
}).join('\n')}</sequences></response>`;

describe('pipeline story structure orchestrators (Phase 6B)', () => {
    beforeEach(() => {
        vi.spyOn(storyStore, 'loadStory').mockResolvedValue(null);
        vi.spyOn(storyStore, 'saveStory').mockResolvedValue(undefined);
        vi.spyOn(storyStore, 'deleteStory').mockResolvedValue(undefined);
        vi.spyOn(logStore, 'saveLogs').mockResolvedValue(undefined);
    });

    it('createStoryEntityFromSetup creates and persists a structured story template', async () => {
        const callAI = vi.fn(async () => '');
        const { ctx, getStorySnapshot } = makeStructureTestContext({ id: 'story_default' }, callAI);

        const res = await createStoryEntityFromSetup(ctx);
        expect(res).not.toBeNull();
        expect(res?.story.title).toBe('Salt & Compass');
        expect(res?.story.concept).toContain('sinking coastal prison');
        expect(getStorySnapshot().id).toBe(res?.storyId);
        expect(storyStore.saveStory).toHaveBeenCalled();
    });

    it('createStoryEntityFromSetup makes a serial a series with a serial layer, and leaves other stories without one', async () => {
        const plain = makeStructureTestContext({ id: 'story_default' }, vi.fn(async () => ''));
        const solo = await createStoryEntityFromSetup(plain.ctx);
        expect(solo?.story.series).toBeUndefined();
        expect(solo?.story.serial).toBeUndefined();

        const { ctx } = makeStructureTestContext({ id: 'story_default' }, vi.fn(async () => ''));
        const draft = ctx.getSetupDraft?.() || {};
        ctx.getSetupDraft = () => ({ ...draft, inputSerial: true, inputSerialRotation: 'ensemble' });
        const res = await createStoryEntityFromSetup(ctx);
        expect(res?.story.series).toMatchObject({ book_number: 1 });
        expect(res?.story.open_threads).toEqual([]);
        expect(res?.story.serial).toMatchObject({ arc_first_episode: 1, policy: { cast: { rotation: 'ensemble' }, episodesPerSequence: 2 } });
    });

    it('generateStoryArc updates active story arc fields when review passes', async () => {
        const callAI = vi.fn(async (_p, _s, _j, logName) => {
            if (String(logName).includes('Reviewer')) {
                return '<response><critique_analysis>Solid.</critique_analysis><status>PASS</status><deviation_reasons></deviation_reasons></response>';
            }
            if (String(logName).includes('Lore Extraction')) {
                return '<extracted_lore>NONE</extracted_lore>';
            }
            return VALID_ARC_XML;
        });
        const { ctx, getStorySnapshot } = makeStructureTestContext(
            {
                id: 'story_arc_1',
                concept: 'A cartographer maps a sinking prison.',
                status_quo: 'High tides threaten Tier Three.',
                cast: [{ id: 'C1', name: 'Hannah Mercer', role: 'Protagonist' }],
                lore: []
            },
            callAI
        );

        await generateStoryArc(ctx, null, true);
        const snap = getStorySnapshot();
        expect(snap.core_thematic_argument).toContain('Precision cannot substitute for mercy');
        expect((snap.threads as Array<{ id: string }>).length).toBe(3);
    });

    it('generateActsAndSequences & generateSequences weave 3 acts and 8 sequences', async () => {
        const callAI = vi.fn(async (_p, _s, _j, logName) => {
            if (String(logName).includes('Reviewer')) {
                return '<response><critique_analysis>Passes all checks.</critique_analysis><status>PASS</status><deviation_reasons></deviation_reasons></response>';
            }
            if (String(logName).includes('Lore Extraction')) {
                return '<extracted_lore>NONE</extracted_lore>';
            }
            if (String(logName).includes('Act Agent')) {
                return VALID_ACTS_XML;
            }
            return EIGHT_SEQUENCES_XML;
        });

        const initial: PipelineStory = {
            id: 'story_seq_1',
            concept: 'Sinking coastal prison.',
            status_quo: 'Baseline.',
            target_word_count: 80000,
            cast: [{ id: 'C1', name: 'Hannah Mercer', role: 'Protagonist' }],
            threads: [
                { id: 'T1', name: 'A-Story', description: 'Wall' },
                { id: 'T2', name: 'B-Story', description: 'Bond' },
                { id: 'T3', name: 'C-Story', description: 'Mercy' }
            ],
            lore: []
        };
        const { ctx, getStorySnapshot } = makeStructureTestContext(initial, callAI);

        await generateActsAndSequences(ctx, initial, true);
        expect((getStorySnapshot().acts as unknown[]).length).toBe(3);
        expect((getStorySnapshot().sequences as unknown[]).length).toBe(8);

        await generateSequences(ctx, getStorySnapshot(), true);
        expect((getStorySnapshot().sequences as unknown[]).length).toBe(8);
    });

    it('generateScenes parses scene blueprints and persists length plan', async () => {
        const scenesXml = Array.from({ length: 4 }, (_, i) => `<scene>
  <scene_id>1.${i + 1}</scene_id>
  <title>Floodgate Inspection ${i + 1}</title>
  <dominant_narrative_mode>DRAMATIC_DIALOGUE</dominant_narrative_mode>
  <pov_character>Hannah Mercer</pov_character>
  <setting>Lower Lockhouse</setting>
  <characters_present>Hannah Mercer</characters_present>
  <goal>Measure seepage rate</goal>
  <scene_events>Hannah inspects the warped rivets in section ${i + 1}.</scene_events>
  <value_shift>Confidence -> Alarm</value_shift>
  <exit_hook>Alarm bell rings below deck.</exit_hook>
</scene>`).join('\n');

        const callAI = vi.fn(async (_p, _s, _j, logName) => {
            if (String(logName).includes('Boundary Continuity Auditor')) {
                return '<continuity_status>PASS</continuity_status>';
            }
            return scenesXml;
        });

        const { ctx, getStorySnapshot } = makeStructureTestContext(
            {
                id: 'story_scenes_1',
                concept: 'Sinking coastal prison.',
                target_word_count: 60000,
                cast: [{ id: 'C1', name: 'Hannah Mercer', role: 'Protagonist' }],
                sequences: [
                    { number: 1, parent_act: 1, title: 'Inspection', description: 'Check walls' },
                    { number: 2, parent_act: 1, title: 'Breach', description: 'Wall cracks' }
                ],
                scenes: {},
                lore: []
            },
            callAI
        );

        await generateScenes(ctx, 0, null, true, false);
        const scenesMap = getStorySnapshot().scenes as Record<string, unknown[]>;
        expect(scenesMap['0'].length).toBeGreaterThanOrEqual(4);
    });
});
