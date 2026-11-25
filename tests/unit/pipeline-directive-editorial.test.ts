import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    executeDirectivePlan,
    handleAutopilot,
    revertAllHarnessTransactions,
    revertHarnessTransaction,
    reviewDirectiveConsistency,
    runContinuousAutopilotStep,
    runDirectivePlanner,
    verifyAndArchiveDirectiveScene,
    type CallAiFn,
    type DirectivePlan,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import { storyStore } from '@/services/storage';

interface DirectiveTestHarness {
    ctx: PipelineRuntimeContext;
    getStorySnapshot: () => PipelineStory;
    getDirectivePlanSnapshot: () => DirectivePlan | null;
    getUndoSnapshot: () => PipelineStory | null;
    getLogs: () => Array<{ id: number; text: string; status: string }>;
    toasts: Array<{ message: string; variant?: string }>;
    getConfirmCalled: () => boolean;
    getAutopilotFlag: () => boolean;
}

function makeDirectiveTestContext(
    initialStory: PipelineStory,
    callAiImpl: CallAiFn,
    options: {
        directiveInput?: string;
        enableReview?: boolean;
        editorialHarnessAutopilot?: boolean;
    } = {}
): DirectiveTestHarness {
    let storyState: PipelineStory = { ...initialStory };
    let directivePlan: DirectivePlan | null = null;
    let directivePlanHistory: DirectivePlan[] = [];
    let directiveUndoSnapshot: PipelineStory | null = null;
    let isPlanningDirective = false;
    let isExecutingDirective = false;
    let directiveExecutionLogs: Array<{ id: number; text: string; status: string }> = [];
    let ragStatus = 'idle';
    let isRebuildingRag = false;
    let ragRev = 0;
    let feedbackLedger: Record<string, string[]> = {};
    let continuousAutopilot = false;
    const continuousAutopilotRef = { current: true };
    const prefetchCacheRef = {
        current: new Map<string, Promise<PipelineStory | null>>()
    };
    let confirmCalled = false;
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
        getActiveStoryId: () => String(storyState.id || 'story_directive_test'),
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
        getEnableReview: () => options.enableReview ?? true,
        getEnableNarrativeLenses: () => true,
        getEnableStylePolish: () => false,
        getEnableAudioDramaDirectionPass: () => false,
        getSlopConfig: () => ({ ...DEFAULT_SLOP_CONFIG, enableSlopAudit: false }),
        getBannedPhrases: () => [],
        getFailedReviewCritiques: () => [],
        getApiCredentials: () => ({ apiKey: '' }),
        getFeedbackLedger: () => feedbackLedger,
        setFeedbackLedger: (updater) => {
            feedbackLedger =
                typeof updater === 'function' ? updater(feedbackLedger) : updater;
        },
        setFailedReviewCritiques: vi.fn(),
        setInterventionState: vi.fn(),
        setLoading: vi.fn(),
        setLoadingStep: vi.fn(),
        setCurrentPipelineStep: vi.fn(),
        setActivePipelineWork: vi.fn(),
        setGeneratingSceneKey: vi.fn(),
        setWorldPrimer: vi.fn(),
        setRagStatus: (s) => {
            ragStatus = s;
        },
        getRagStatus: () => ragStatus,
        setIsRebuildingRag: (b) => {
            isRebuildingRag = b;
        },
        getIsRebuildingRag: () => isRebuildingRag,
        setView: vi.fn(),
        setSelectedSequence: vi.fn(),
        setSelectedScene: vi.fn(),
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
        getLoreImportVersion: () => 1,
        retrieveContext: vi.fn(async () => []),
        callAI: callAiImpl,
        getDirectiveInput: () => options.directiveInput ?? 'Tighten tension in Scene 1.1.',
        getDirectivePlan: () => directivePlan,
        setDirectivePlan: (updater) => {
            directivePlan =
                typeof updater === 'function' ? updater(directivePlan) : updater;
        },
        setDirectivePlanHistory: (updater) => {
            directivePlanHistory =
                typeof updater === 'function' ? updater(directivePlanHistory) : updater;
        },
        getIsPlanningDirective: () => isPlanningDirective,
        setIsPlanningDirective: (p) => {
            isPlanningDirective = p;
        },
        setDirectivePlanPhase: vi.fn(),
        getIsExecutingDirective: () => isExecutingDirective,
        setIsExecutingDirective: (e) => {
            isExecutingDirective = e;
        },
        setDirectiveProgress: vi.fn(),
        setDirectiveExecutionLogs: (updater) => {
            directiveExecutionLogs =
                typeof updater === 'function' ? updater(directiveExecutionLogs) : updater;
        },
        setDirectiveUndoSnapshot: (snap) => {
            directiveUndoSnapshot = snap;
        },
        setDirectiveRefinement: vi.fn(),
        setExpandedDirectiveActions: vi.fn(),
        getProtectWrittenProse: () => false,
        getCascadeSceneChanges: () => false,
        getVerifyDirectiveEdits: () => true,
        getEditorialScopeSceneId: () => 'ALL',
        getEditorialUseDeepLLM: () => false,
        getEnableEditorialHarnessAutopilot: () => options.editorialHarnessAutopilot ?? false,
        setIsRunningEditorialHarness: vi.fn(),
        setEditorialHarnessPhase: vi.fn(),
        setEditorialHarnessProgress: vi.fn(),
        getContinuousAutopilot: () => continuousAutopilot,
        setContinuousAutopilot: (r) => {
            continuousAutopilot = r;
        },
        getContinuousAutopilotRef: () => continuousAutopilotRef,
        toggleContinuousAutopilot: () => {
            continuousAutopilot = !continuousAutopilot;
            continuousAutopilotRef.current = continuousAutopilot;
        },
        getPrefetchCacheRef: () => prefetchCacheRef,
        requestConfirm: async (cfg) => {
            confirmCalled = true;
            await cfg.onConfirm?.();
        },
        getSetupDraft: () => ({ inputConcept: String(storyState.concept || '') }),
        getAllNarrativeModes: () => ({}),
        logPipelineDelay: vi.fn(),
        isAutopilotProtectedView: () => false
    };

    return {
        ctx,
        getStorySnapshot: () => storyState,
        getDirectivePlanSnapshot: () => directivePlan,
        getUndoSnapshot: () => directiveUndoSnapshot,
        getLogs: () => directiveExecutionLogs,
        toasts,
        getConfirmCalled: () => confirmCalled,
        getAutopilotFlag: () => continuousAutopilot
    };
}

describe('pipeline directive, editorial harness, and autopilot orchestrators (Phase 6D)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(storyStore, 'saveStory').mockResolvedValue(undefined);
    });

    it('verifyAndArchiveDirectiveScene & reviewDirectiveConsistency validate and run Archivist', async () => {
        const story: PipelineStory = {
            id: 's-verify',
            title: 'Glass Harbor',
            sequences: [{ id: 1, number: 1, title: 'Harbor', parent_act: 1 }],
            scenes: {
                '0': [
                    {
                        id: '1.1',
                        number: '1.1',
                        title: 'Pier Seven',
                        pov_character: 'Mara',
                        setting: 'Pier',
                        objective: 'Recover the ledger'
                    },
                    {
                        id: '1.2',
                        number: '1.2',
                        title: 'Warehouse',
                        pov_character: 'Mara',
                        setting: 'Depot',
                        objective: 'Hide the cipher'
                    }
                ]
            },
            cast: [{ id: 'c1', name: 'Mara', role: 'Protagonist' }],
            prose: {
                '0-0': { final: 'Mara checked the wet rope by the lantern and kept moving.' },
                '0-1': { final: 'Mara bolted the iron door behind her before checking the ledger.' }
            },
            continuity_ledger: []
        };

        const callAI: CallAiFn = vi.fn(async (_prompt, _sys, _isJson, logName) => {
            if (logName === 'Directive Prose Reviewer') {
                return '<response><critique_analysis>Clean blueprint fidelity.</critique_analysis><issues></issues><status>PASS</status></response>';
            }
            if (logName === 'Directive Consistency Reviewer') {
                return '<response><critique_analysis>Both scenes maintain lantern continuity.</critique_analysis><issues></issues><status>PASS</status></response>';
            }
            if (String(logName).includes('Archivist')) {
                return JSON.stringify({
                    new_facts: [{ key: 'ledger_recovered', value: 'yes', category: 'Prop' }]
                });
            }
            return '{}';
        });

        const logs: Array<{ text: string; status: string }> = [];
        const logFn = (text: string, status = 'pending'): void => {
            logs.push({ text, status });
        };

        const harness = makeDirectiveTestContext(story, callAI, { enableReview: true });
        const verified = await verifyAndArchiveDirectiveScene(
            harness.ctx,
            harness.getStorySnapshot(),
            '0-0',
            logFn
        );

        expect(verified.review.status).toBe('PASS');
        expect(verified.review.issues).toHaveLength(0);
        expect(logs.some((l) => l.text.includes('[Verify] Scene 1.1: PASS'))).toBe(true);

        const consistency = await reviewDirectiveConsistency(
            harness.ctx,
            verified.story,
            ['0-0', '0-1'],
            'Keep the wet ledger prop consistent.',
            logFn
        );
        expect(consistency.status).toBe('PASS');
        expect(logs.some((l) => l.text.includes('Cross-scene consistency: PASS'))).toBe(true);
    });

    it('runDirectivePlanner scopes targets and parses XML plan actions', async () => {
        const story: PipelineStory = {
            id: 's-planner',
            title: 'Iron Tide',
            concept: 'An engineer uncovers a flooded vault.',
            acts: [{ number: 1, title: 'Act 1', act_mandate: 'Establish the leak.' }],
            sequences: [{ id: 1, number: 1, parent_act: 1, title: 'Seq 1' }],
            scenes: {
                '0': [
                    {
                        id: '1.1',
                        number: '1.1',
                        title: 'Pump Room',
                        pov_character: 'Vera',
                        objective: 'Seal Valve B'
                    }
                ]
            },
            cast: [{ id: 'c1', name: 'Vera', role: 'Protagonist' }],
            prose: {
                '0-0': { final: 'Vera leaned into the rusted wheel until the gauge dropped.' }
            }
        };

        const callAI: CallAiFn = vi.fn(async (_p, _sys, _j, logName) => {
            if (logName === 'Directive Scoper') {
                return `<response>
                  <scope_kind>local</scope_kind>
                  <needs_prose>true</needs_prose>
                  <target_scenes>
                    <scene><sequence_idx>0</sequence_idx><scene_idx>0</scene_idx><reason>Matches Scene 1.1</reason></scene>
                  </target_scenes>
                </response>`;
            }
            return `<response>
              <evaluation>Tighten the opening line in Scene 1.1.</evaluation>
              <scope_kind>local</scope_kind>
              <actions>
                <action>
                  <action_type>LINE_EDIT_PROSE</action_type>
                  <target_act_idx>0</target_act_idx>
                  <target_sequence_idx>0</target_sequence_idx>
                  <target_scene_idx>0</target_scene_idx>
                  <description>Replace rusted wheel phrasing</description>
                  <details>
                    <find_text>the rusted wheel</find_text>
                    <replace_text>the salt-seized wheel</replace_text>
                  </details>
                </action>
              </actions>
            </response>`;
        });

        const harness = makeDirectiveTestContext(story, callAI, {
            directiveInput: 'Make the wheel salt-seized.'
        });
        await runDirectivePlanner(harness.ctx);

        const plan = harness.getDirectivePlanSnapshot();
        expect(plan).not.toBeNull();
        expect(plan?.scope_kind).toBe('local');
        expect(plan?.actions).toHaveLength(1);
        expect(plan?.actions[0].action_type).toBe('LINE_EDIT_PROSE');
        expect(plan?.actions[0].details.find_text).toBe('the rusted wheel');
        expect(plan?.actions[0].details.replace_text).toBe('the salt-seized wheel');
        expect(harness.toasts.some((t) => t.variant === 'success')).toBe(true);
    });

    it('executeDirectivePlan records undo snapshot, applies edits, verifies, and updates plan results', async () => {
        const story: PipelineStory = {
            id: 's-exec',
            title: 'Old Title',
            sequences: [{ id: 1, number: 1, parent_act: 1, title: 'Seq 1' }],
            scenes: {
                '0': [
                    {
                        id: '1.1',
                        number: '1.1',
                        title: 'Harbor',
                        pov_character: 'Vera'
                    }
                ]
            },
            cast: [{ id: 'c1', name: 'Vera', role: 'Protagonist' }],
            prose: {
                '0-0': { final: 'Vera gripped the rusted wheel as cold spray soaked her coat.' }
            }
        };

        const callAI: CallAiFn = vi.fn(async (_p, _sys, _j, logName) => {
            if (logName === 'Directive Prose Reviewer') {
                return '<response><critique_analysis>Clean revision.</critique_analysis><issues></issues><status>PASS</status></response>';
            }
            return '{}';
        });

        const harness = makeDirectiveTestContext(story, callAI, { enableReview: true });
        const plan: DirectivePlan = {
            evaluation: 'Update title and edit line.',
            scope_kind: 'local',
            consistency_notes: '',
            actions: [
                {
                    action_type: 'MODIFY_STORY_METADATA',
                    target_act_idx: 0,
                    target_sequence_idx: 0,
                    target_scene_idx: 0,
                    target_character_id: null,
                    description: 'Retitle story',
                    details: { title: 'Salt Harbor' }
                },
                {
                    action_type: 'LINE_EDIT_PROSE',
                    target_act_idx: 0,
                    target_sequence_idx: 0,
                    target_scene_idx: 0,
                    target_character_id: null,
                    description: 'Update wheel phrasing',
                    details: {
                        find_text: 'the rusted wheel',
                        replace_text: 'the salt-seized wheel'
                    }
                }
            ]
        };
        harness.ctx.setDirectivePlan?.(plan);

        await executeDirectivePlan(harness.ctx, plan.actions);

        expect(harness.getUndoSnapshot()?.title).toBe('Old Title');
        expect(harness.getStorySnapshot().title).toBe('Salt Harbor');
        const updatedProse = (
            harness.getStorySnapshot().prose as Record<string, { final?: string }>
        )['0-0']?.final;
        expect(updatedProse).toContain('the salt-seized wheel');

        const updatedPlan = harness.getDirectivePlanSnapshot();
        expect(
            (updatedPlan?.actions[0].result as { status?: string } | undefined)?.status
        ).toBe('applied');
        expect(
            (
                updatedPlan?.actions[1].result as
                    | { status?: string; review?: { status?: string } }
                    | undefined
            )?.review?.status
        ).toBe('PASS');
    });

    it('revertHarnessTransaction and revertAllHarnessTransactions restore prose snapshots', async () => {
        const storyWithHarness: PipelineStory = {
            id: 's-revert',
            sequences: [{ id: 1, number: 1, parent_act: 1, title: 'Seq 1' }],
            scenes: {
                '0': [{ id: '1.1', number: '1.1', title: 'Dock' }]
            },
            prose: {
                '0-0': { final: 'Patched sentence A. Patched sentence B.' }
            },
            editorial_harness: {
                preRunProseSnapshot: {
                    '0-0': { final: 'Original sentence A. Original sentence B.' }
                },
                editPlan: {
                    waves: [
                        {
                            waveId: 3,
                            waveKey: 'WAVE_3_MICRO',
                            name: 'MICRO',
                            specialistAgent: 'MicroLineStylistAgent',
                            transactions: [
                                {
                                    transactionId: 'tx_1',
                                    wave: 'WAVE_3_MICRO',
                                    sceneId: 'seq1_sc1',
                                    proseKey: '0-0',
                                    displayCoord: '1.1',
                                    startAnchor: 'seq1_sc1:p1',
                                    endAnchor: 'seq1_sc1:p1',
                                    verbatimOriginal: 'Original sentence A.',
                                    priorityScore: 50,
                                    tickets: [],
                                    combinedDirective: 'Polish sentence A.',
                                    combinedProblem: 'Weak verb.',
                                    status: 'COMMITTED',
                                    gateResults: null,
                                    patchedXml: null,
                                    patchedProseSpan: null,
                                    beforeSpan: 'Original sentence A.',
                                    afterSpan: 'Patched sentence A.',
                                    beforeProse: 'Original sentence A. Patched sentence B.'
                                }
                            ]
                        }
                    ],
                    allTransactions: []
                }
            }
        };

        const harness = makeDirectiveTestContext(storyWithHarness, vi.fn(async () => ''));
        await revertHarnessTransaction(harness.ctx, 'tx_1');

        const afterSingle = (
            harness.getStorySnapshot().prose as Record<string, { final?: string }>
        )['0-0']?.final;
        expect(afterSingle).toBe('Original sentence A. Patched sentence B.');

        await revertAllHarnessTransactions(harness.ctx);
        const afterAll = (
            harness.getStorySnapshot().prose as Record<string, { final?: string }>
        )['0-0']?.final;
        expect(afterAll).toBe('Original sentence A. Original sentence B.');
    });

    it('handleAutopilot confirms startup and runContinuousAutopilotStep routes story arc & completion', async () => {
        const storyMissingArc: PipelineStory = {
            id: 's-auto',
            title: 'Harbor Ghost',
            concept: 'A diver finds a sunken radio station.',
            status_quo: 'Calm harbor town.',
            cast: [{ id: 'c1', name: 'Nora', role: 'Protagonist' }]
        };

        const callAI: CallAiFn = vi.fn(async (_p, _sys, _j, logName) => {
            if (String(logName).includes('Story Arc')) {
                return `<response>
                  <core_thematic_argument>Isolation cannot outrun memory.</core_thematic_argument>
                  <starting_value_state>Disconnected</starting_value_state>
                  <ending_value_state>Reconciled</ending_value_state>
                  <threads><thread><id>T1</id><name>Radio Signal</name><description>Unknown broadcast</description></thread></threads>
                  <character_arcs></character_arcs>
                </response>`;
            }
            return '{}';
        });

        const harness = makeDirectiveTestContext(storyMissingArc, callAI);
        await handleAutopilot(harness.ctx);
        expect(harness.getConfirmCalled()).toBe(true);
        expect(harness.getAutopilotFlag()).toBe(true);

        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
            cb();
            return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);

        const progressed = await runContinuousAutopilotStep(harness.ctx);
        expect(progressed).toBe(true);
        expect(harness.getStorySnapshot().core_thematic_argument).toBe(
            'Isolation cannot outrun memory.'
        );
    });
});
