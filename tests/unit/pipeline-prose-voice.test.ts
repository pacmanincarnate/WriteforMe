import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applySurgicalProsePatch,
    handleCascadeSceneToProse,
    runAudioDramaVoiceDirectorPass,
    writeSceneProse,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import { storyStore } from '@/services/storage';

function makeProseTestContext(
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
        getActiveStoryId: () => String(storyState.id || 'story_prose_test'),
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
        getEnableStylePolish: () => false,
        getEnableAudioDramaDirectionPass: () => true,
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
        setActivePipelineWork: vi.fn(),
        setGeneratingSceneKey: vi.fn(),
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
        getSelectedSequence: () => 0,
        getSelectedScene: () => 0,
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

describe('pipeline prose, voice director, and surgical patch orchestrators (Phase 6C)', () => {
    beforeEach(() => {
        vi.spyOn(storyStore, 'saveStory').mockResolvedValue(undefined);
    });

    it('applySurgicalProsePatch updates target scene prose and clears stale marker', async () => {
        const callAI = vi.fn(
            async () =>
                `<edits><edit><original>The kerosene stove hissed in the corner.</original><rewritten>The kerosene stove spluttered against the seawall draft.</rewritten></edit></edits>`
        );
        const storyDoc: PipelineStory = {
            id: 'story_patch',
            writing_mode: 'novel',
            prose: {
                '0-0': {
                    final: 'Hannah stepped inside the lockhouse. The kerosene stove hissed in the corner. Rain battered the zinc roof.',
                    stale: { changedFields: ['setting'] }
                }
            }
        };
        const { ctx } = makeProseTestContext(storyDoc, callAI);

        const patched = await applySurgicalProsePatch(ctx, {
            story: storyDoc,
            seqIdx: 0,
            sceneIdx: 0,
            instructions: 'Make the stove fight the seawall draft.'
        });

        const entry = (patched.story.prose as Record<string, Record<string, unknown>>)['0-0'];
        expect(entry.final).toContain('spluttered against the seawall draft');
        expect(entry.stale).toBeUndefined();
    });

    it('handleCascadeSceneToProse persists patched prose back into story state', async () => {
        const callAI = vi.fn(
            async () =>
                `<edits><edit><original>She checked the iron gauge.</original><rewritten>She checked the rusted brass gauge.</rewritten></edit></edits>`
        );
        const initial: PipelineStory = {
            id: 'story_cascade',
            writing_mode: 'novel',
            scenes: {
                '0': [
                    {
                        number: '1.1',
                        title: 'Gauge House',
                        setting: 'Rusty Gatehouse',
                        objective: 'Read pressure',
                        scene_events: 'Hannah reads the brass gauge.'
                    }
                ]
            },
            prose: {
                '0-0': {
                    final: 'Hannah wiped the glass. She checked the iron gauge. Salt crusted the bezel.',
                    stale: { changedFields: ['setting'] }
                }
            }
        };
        const { ctx, getStorySnapshot } = makeProseTestContext(initial, callAI);

        await handleCascadeSceneToProse(ctx, 0, 0);
        const entry = (getStorySnapshot().prose as Record<string, Record<string, unknown>>)['0-0'];
        expect(entry.final).toContain('rusted brass gauge');
        expect(entry.stale).toBeUndefined();
    });

    it('runAudioDramaVoiceDirectorPass enhances flat character dialogue lines', async () => {
        const script = [
            'Narrator: Rain drums across the harbor wharf.',
            'Hannah: We leave before the tide turns.',
            'Thomas: The lower lock is still flooded.',
            'Hannah: Then we haul the chains by hand.',
            'Thomas: Nobody follows us down there tonight.'
        ].join('\n');

        const callAI = vi.fn(
            async () =>
                `<edits><edit><original>Hannah: We leave before the tide turns.</original><rewritten>Hannah: [quiet, urgent] We leave before the tide turns.</rewritten></edit></edits>`
        );

        const { ctx } = makeProseTestContext(
            {
                id: 'story_drama_dir',
                writing_mode: 'audio_drama',
                cast: [
                    { id: 'C1', name: 'Hannah', role: 'Protagonist', vocal_cadence: 'Warm medium soprano' },
                    { id: 'C2', name: 'Thomas', role: 'Ally', vocal_cadence: 'Low deliberate baritone' }
                ]
            },
            callAI
        );

        const res = await runAudioDramaVoiceDirectorPass(ctx, {
            proseText: script,
            scene: { number: '1.1', title: 'Wharf' },
            force: true
        });

        expect(res.appliedCount).toBe(1);
        expect(res.prose).toContain('[quiet, urgent]');
    });

    it('writeSceneProse drafts novel prose through review, continuity audit, and archivist', async () => {
        const draftedProse =
            'Hannah knelt beside the floodgate lever as cold seawater seeped under the iron sill. ' +
            'Every lantern along the lower pier trembled inside its wet glass housing while Thomas hauled the chain block hand over hand.';

        const callAI = vi.fn(async (_p, _s, _j, logName) => {
            const label = String(logName);
            if (label.includes('Writing Agent (Attempt')) {
                return `<prose_text>${draftedProse}</prose_text>`;
            }
            if (label.includes('Writing Agent Reviewer')) {
                return '<response><critique_analysis>Sharp choreography.</critique_analysis><issues></issues><status>PASS</status><deviation_reasons></deviation_reasons></response>';
            }
            if (label.includes('Continuity Auditor')) {
                return '<continuity_audit><status>PASS</status></continuity_audit>';
            }
            if (label.includes('Archivist')) {
                return JSON.stringify({
                    character_state_updates: [
                        {
                            name: 'Hannah Mercer',
                            physical_state: 'Kneeling by the iron sill',
                            emotional_state: 'Resolute',
                            unresolved_tension: 'Sea wall seepage',
                            location: 'Lower Pier'
                        }
                    ]
                });
            }
            return '<extracted_lore>NONE</extracted_lore>';
        });

        const initial: PipelineStory = {
            id: 'story_write_1',
            title: 'Salt & Compass',
            writing_mode: 'novel',
            concept: 'Sinking prison.',
            acts: [{ number: 1, title: 'Act I', description: 'Setup' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Lock Inspection', dramatic_question: 'Will it hold?' }],
            scenes: {
                '0': [
                    {
                        number: '1.1',
                        title: 'Lower Pier',
                        pov_character: 'Hannah Mercer',
                        setting: 'Lower Pier Lockhouse',
                        cast_names: ['Hannah Mercer'],
                        characters_present: ['Hannah Mercer'],
                        goal: 'Inspect seal',
                        scene_events: 'Hannah finds seepage under the iron sill.',
                        value_shift: 'Calm -> Dread',
                        exit_hook: 'Chain block locks tight.'
                    }
                ]
            },
            cast: [
                {
                    id: 'C1',
                    name: 'Hannah Mercer',
                    role: 'Protagonist',
                    details: { deep_profile: 'Built to endure cold weather and silent watches.' }
                }
            ],
            lore: [],
            prose: {}
        };
        const { ctx, getStorySnapshot } = makeProseTestContext(initial, callAI);

        const out = await writeSceneProse(ctx, 0, 0, initial, true, '');
        const proseRec = (out.prose as Record<string, Record<string, unknown>>)['0-0'];
        expect(proseRec.final).toContain('floodgate lever');
        expect(
            (getStorySnapshot().character_states as Record<string, Record<string, unknown>>)[
                'Hannah Mercer'
            ].emotional_state
        ).toBe('Resolute');
    });
});
