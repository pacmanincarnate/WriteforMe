import { describe, expect, it, vi } from 'vitest';
import {
    applySurgicalEditsWithRetry,
    checkAndExecuteRSI,
    distillLore,
    repairBannedEntitiesWithAI,
    runAgentWithEscalation,
    runArchivistForScene,
    updateStorySoFar,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';

function makeTestContext(
    initialStory: PipelineStory,
    callAiImpl: CallAiFn
): {
    ctx: PipelineRuntimeContext;
    getStorySnapshot: () => PipelineStory;
    toasts: Array<{ message: string; variant?: string }>;
    validations: Array<{ stageName: string; isPassed: boolean }>;
    errors: Array<{ stageName: string; errorMsg: string }>;
} {
    let storyState: PipelineStory = { ...initialStory };
    let ragStatus = 'idle';
    let isRebuildingRag = false;
    let ragRev = 0;
    let feedbackLedger: Record<string, string[]> = {};
    const toasts: Array<{ message: string; variant?: string }> = [];
    const validations: Array<{ stageName: string; isPassed: boolean }> = [];
    const errors: Array<{ stageName: string; errorMsg: string }> = [];

    const ctx: PipelineRuntimeContext = {
        getStory: () => storyState,
        setStory: (updaterOrValue) => {
            storyState =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(storyState)
                    : updaterOrValue;
            return storyState;
        },
        getActiveStoryId: () => String(storyState.id || 'story_test'),
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
        showToast: (message, variant) => {
            toasts.push({ message, variant });
        },
        logPipelineValidation: (stageName, isPassed) => {
            validations.push({ stageName, isPassed });
        },
        logPipelineError: (stageName, errorMsg) => {
            errors.push({ stageName, errorMsg });
        },
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
        toasts,
        validations,
        errors
    };
}

describe('pipeline core orchestrators (Phase 6A)', () => {
    it('applySurgicalEditsWithRetry recovers missed needle on retry pass', async () => {
        const callAI = vi.fn(async () => {
            return `<edits><edit><original>The lantern flickered once.</original><rewritten>The lantern guttered in the draft.</rewritten></edit></edits>`;
        });
        const { ctx } = makeTestContext({ id: 's1' }, callAI);
        const badBlocks = `<edits><edit><original>Nonexistent line</original><rewritten>New line</rewritten></edit></edits>`;

        const report = await applySurgicalEditsWithRetry(ctx, {
            originalText: 'Mara stepped inside. The lantern flickered once. Rain lashed the glass.',
            blocksText: badBlocks,
            systemPrompt: 'sys',
            logName: 'Test Surgical',
            modelSize: 'review'
        });

        expect(callAI).toHaveBeenCalledTimes(1);
        expect(report.applied.length).toBe(1);
        expect(report.failed.length).toBe(0);
        expect(report.text).toContain('The lantern guttered in the draft.');
    });

    it('distillLore fast-path updates world_primer on short world bible', async () => {
        const callAI = vi.fn(async () => '# WORLD PRIMER\n\nClockwork guilds govern the delta.');
        const { ctx, getStorySnapshot } = makeTestContext({ id: 'story_lore' }, callAI);

        const result = await distillLore(ctx, 'The Clockwork Guilds govern every lock along the river delta.');

        expect(callAI).toHaveBeenCalledTimes(1);
        expect(result).toBe('# WORLD PRIMER\n\nClockwork guilds govern the delta.');
        expect(getStorySnapshot().world_primer).toBe('# WORLD PRIMER\n\nClockwork guilds govern the delta.');
    });

    it('repairBannedEntitiesWithAI parses valid XML replacements', async () => {
        const callAI = vi.fn(
            async () => '<replacements><replace old="Elena Vance" new="Hannah Mercer" /></replacements>'
        );
        const { ctx } = makeTestContext({ id: 'story_names', cast: [] }, callAI);

        const res = await repairBannedEntitiesWithAI(ctx, {
            violations: [
                {
                    name: 'Elena Vance',
                    categoryId: 'banned_names',
                    entityType: 'character',
                    severity: 'hard',
                    reason: 'Overused AI cliché name'
                }
            ],
            existingNames: ['Thomas Callahan'],
            storyContext: 'A quiet coastal town mystery.'
        });

        expect(res.renameMap['Elena Vance']).toBe('Hannah Mercer');
        expect(res.usedFallback).toBe(false);
    });

    it('checkAndExecuteRSI surgically injects missing item and updates graph edges', async () => {
        const callAI = vi.fn(
            async () =>
                `<edits><edit><original>Nadia checked her coat pockets and stepped into the stairwell.</original><rewritten>Nadia checked her coat pockets, slipped the brass key inside, and stepped into the stairwell.</rewritten></edit></edits>`
        );
        const { ctx, getStorySnapshot } = makeTestContext(
            {
                id: 'story_rsi',
                sequences: [{ number: 1, title: 'Opening' }],
                scenes: {
                    '0': [{ title: 'Stairwell', cast_names: ['Nadia'] }]
                },
                prose: {
                    '0-0': {
                        final: 'Nadia checked her coat pockets and stepped into the stairwell. The bulb overhead buzzed.'
                    }
                },
                beats: {
                    '0-0': [{ description: 'Nadia enters the stairwell.' }]
                },
                graph_edges: []
            },
            callAI
        );

        const res = await checkAndExecuteRSI(
            ctx,
            'Nadia lacks [brass key] in Sequence 2',
            getStorySnapshot()
        );

        expect(res).not.toBeNull();
        expect(res?.item).toBe('brass key');
        const next = getStorySnapshot() as {
            prose: Record<string, { final: string }>;
            graph_edges: Array<{ source: string; target: string; relation: string }>;
        };
        expect(next.prose['0-0'].final).toContain('slipped the brass key inside');
        expect(next.graph_edges).toHaveLength(1);
        expect(next.graph_edges[0]).toMatchObject({
            source: 'Nadia',
            target: 'brass key',
            relation: 'HAS'
        });
    });

    it('runArchivistForScene merges JSON updates onto story state', async () => {
        const archivistJson = JSON.stringify({
            cast_updates: [
                {
                    name: 'Nadia Okafor',
                    append_story_events: 'Recovered the harbour ledger.'
                }
            ],
            character_state_updates: [
                {
                    name: 'Nadia Okafor',
                    physical_state: 'Dry coat, cold hands',
                    emotional_state: 'Alert',
                    unresolved_tension: 'Who tipped off the dockmaster?',
                    location: 'Eastgate Station'
                }
            ]
        });
        const callAI = vi.fn(async () => archivistJson);
        const initial: PipelineStory = {
            id: 'story_arch',
            cast: [{ id: 'C1', name: 'Nadia Okafor', role: 'Protagonist', details: {} }],
            lore: [],
            sequences: [{ number: 1, parent_act: 1, title: 'Arrival' }],
            scenes: {
                '0': [{ number: '1.1', title: 'Dockside', cast_names: ['Nadia Okafor'] }]
            },
            prose: {
                '0-0': { final: 'Nadia Okafor tucked the damp ledger under her arm.' }
            }
        };
        const { ctx } = makeTestContext(initial, callAI);

        const merged = await runArchivistForScene(ctx, initial, 0, 0);
        const charStates = merged.character_states as Record<
            string,
            { emotional_state: string; location: string }
        >;
        expect(charStates['Nadia Okafor'].emotional_state).toBe('Alert');
        expect(charStates['Nadia Okafor'].location).toBe('Eastgate Station');
    });

    it('runAgentWithEscalation retries review FAIL via surgical editor and passes on re-review', async () => {
        const proseV1 =
            'Mara crossed the bridge at dusk while rain hammered the iron railings.\n\n' +
            'The harbor bell tolled twice across the flat black water.';
        const proseEdit = `<edits><edit><original>The harbor bell tolled twice across the flat black water.</original><rewritten>The harbor bell tolled twice as Mara clutched the sealed dispatch to her ribs.</rewritten></edit></edits>`;

        let step = 0;
        const callAI = vi.fn(async (_prompt, _sys, _json, logName) => {
            step++;
            if (String(logName).startsWith('Writing Agent (Attempt 1')) {
                return `<prose_text>${proseV1}</prose_text>`;
            }
            if (String(logName).includes('Writing Agent Reviewer (Attempt 1/3)')) {
                return `<response><critique_analysis>Needs physical dispatch detail.</critique_analysis><issues><issue><severity>MAJOR</severity><category>CHOREOGRAPHY</category><description>Show the dispatch</description><location>harbor bell</location><fix_suggestion>Add dispatch action</fix_suggestion></issue></issues><status>FAIL</status><deviation_reasons><reason>Missing dispatch prop</reason></deviation_reasons></response>`;
            }
            if (String(logName).startsWith('Surgical Editor')) {
                return proseEdit;
            }
            if (String(logName).includes('Post-Surgical Pass 1/2')) {
                return `<response><critique_analysis>Cleanly fixed.</critique_analysis><issues></issues><status>PASS</status><deviation_reasons></deviation_reasons></response>`;
            }
            // Background lore extraction
            return '<extracted_lore>NONE</extracted_lore>';
        });

        const { ctx } = makeTestContext(
            {
                id: 'story_esc',
                writing_mode: 'novel',
                cast: [],
                lore: []
            },
            callAI
        );

        const res = await runAgentWithEscalation<{ prose: string }>(ctx, {
            tierName: 'Writing Agent',
            generatorPromptFn: () => 'Write the bridge crossing scene.',
            systemPrompt: 'Writer system prompt',
            reviewerSystemPrompt: 'Reviewer system prompt',
            reviewerPromptFn: (out) => `Review: ${out}`,
            parserFn: (raw) => {
                const m = raw.match(/<prose_text>([\s\S]*?)<\/prose_text>/i);
                return { prose: m ? m[1].trim() : raw };
            },
            context: {
                writing_mode: 'novel',
                slopConfig: { ...DEFAULT_SLOP_CONFIG, enableSlopAudit: false },
                cast: []
            }
        });

        expect(step).toBeGreaterThanOrEqual(4);
        expect(res.parsedData.prose).toContain('sealed dispatch to her ribs');
    });

    it('updateStorySoFar returns early when no drafted prose exists', async () => {
        const callAI = vi.fn(async () => '');
        const { ctx, getStorySnapshot } = makeTestContext({ id: 'empty', prose: {} }, callAI);

        const out = await updateStorySoFar(ctx, getStorySnapshot(), true);
        expect(out).toBe('');
        expect(callAI).not.toHaveBeenCalled();
    });
});
