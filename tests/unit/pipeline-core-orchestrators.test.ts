import { describe, expect, it, vi } from 'vitest';
import {
    applySurgicalEditsWithRetry,
    checkAndExecuteRSI,
    distillLore,
    rebuildStorySoFar,
    repairBannedEntitiesWithAI,
    runAgentWithEscalation,
    runArchivistForScene,
    syncStorySoFarAfterScene,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import type { StoryMemory } from '@/types';
import { buildConceptNameBankBlock } from '@/pipeline/nameBank';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import * as validation from '@/domain/validation';

// Wraps one validation helper in a spy (same behaviour) so a test can check what the pipeline passes to it.
vi.mock('@/domain/validation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/domain/validation')>();
    return { ...actual, ensureActOutputCompleteness: vi.fn(actual.ensureActOutputCompleteness) };
});

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

    it('repairBannedEntitiesWithAI offers bank names to the model and draws from the bank when it fails', async () => {
        const prompts: string[] = [];
        const callAI = vi.fn(async (prompt: string) => {
            prompts.push(prompt);
            return '<replacements><replace old="Elara Voss" new="Lyra Thorne" /></replacements>';
        });
        const { ctx } = makeTestContext({ id: 'story_bank', cast: [] }, callAI);

        const res = await repairBannedEntitiesWithAI(ctx, {
            violations: [
                { name: 'Elara Voss', categoryId: 'names_stock_full', entityType: 'character', severity: 'hard', reason: 'Stock name' }
            ],
            existingNames: ['Thomas Callahan'],
            storyContext: 'A Victorian London mystery.',
            story: { id: 'story_bank', concept: 'A Victorian London mystery.' }
        });

        expect(prompts[0]).toContain('<name_bank>');
        expect(res.usedFallback).toBe(true);
        const drawn = res.renameMap['Elara Voss'];
        expect(drawn.split(' ').length).toBeGreaterThanOrEqual(2);
        // Not one of the six fixed stand-ins: it came from the Victorian bank.
        expect(['Hannah Mercer', 'Thomas Callahan', 'Nadia Okafor', 'David Kowalski', 'Miriam Delgado', 'Samuel Lindqvist']).not.toContain(drawn);

        const again = await repairBannedEntitiesWithAI(ctx, {
            violations: [
                { name: 'Elara Voss', categoryId: 'names_stock_full', entityType: 'character', severity: 'hard', reason: 'Stock name' }
            ],
            existingNames: ['Thomas Callahan'],
            storyContext: 'A Victorian London mystery.',
            story: { id: 'story_bank', concept: 'A Victorian London mystery.' }
        });
        expect(again.renameMap['Elara Voss']).toBe(drawn);
    });

    it('buildConceptNameBankBlock follows the Real-Name Bank setting', async () => {
        const { ctx } = makeTestContext({ id: 'story_block', cast: [] }, vi.fn(async () => ''));
        const on = await buildConceptNameBankBlock(ctx, { story: { id: 'story_block' }, setting: 'A diner in Ohio' });
        expect(on).toMatch(/^<name_bank>[\s\S]*- Women: [\s\S]*- Men: [\s\S]*<\/name_bank>$/);

        const offCtx = { ...ctx, getSlopConfig: () => ({ ...DEFAULT_SLOP_CONFIG, enableNameBank: false }) };
        expect(await buildConceptNameBankBlock(offCtx, { story: { id: 'story_block' }, setting: 'A diner in Ohio' })).toBe('');
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

    it('runAgentWithEscalation passes the story context to the Act Agent completeness repair', async () => {
        // Regression: escalation called ensureActOutputCompleteness(genOutput) without the
        // validation context that the legacy app passes. Missing act headings were then filled
        // with "the central thematic argument" / "the protagonist" instead of the story's own.
        const spy = vi.mocked(validation.ensureActOutputCompleteness);
        spy.mockClear();
        const stop = new Error('stop after the first generation');
        let calls = 0;
        const callAI = vi.fn(async () => {
            calls++;
            if (calls > 1) throw stop;
            return '<acts><act><number>1</number><title>Low Tide</title></act></acts>';
        });
        const { ctx } = makeTestContext({ id: 'story_acts', writing_mode: 'novel', cast: [], lore: [] }, callAI);
        const context = {
            writing_mode: 'novel',
            slopConfig: { ...DEFAULT_SLOP_CONFIG, enableSlopAudit: false },
            cast: [],
            core_thematic_argument: 'Time sold is never bought back'
        };

        await runAgentWithEscalation(ctx, {
            tierName: 'Act Agent',
            generatorPromptFn: () => 'Plan the three acts.',
            systemPrompt: 'Act system prompt',
            parserFn: (raw) => ({ raw }),
            context
        }).catch(() => undefined);

        expect(spy).toHaveBeenCalled();
        const [output, passedContext] = spy.mock.calls[0];
        expect(String(output)).toContain('Low Tide');
        expect(passedContext).toBe(context);
        const repaired = spy.mock.results[0].value as { rawOutput: string };
        expect(repaired.rawOutput).toContain('Time sold is never bought back');
    }, 30000);

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

    it('runArchivistForScene records scene_synopsis into story_memory and overwrites rewrites without duplication', async () => {
        let rewrite = false;
        const callAI = vi.fn(async () =>
            JSON.stringify({
                scene_synopsis: rewrite
                    ? 'Nadia Okafor burned the forged ledger at the pier and fled before the bells rang.'
                    : 'Nadia Okafor recovered the damp ledger from the customs locker and spotted Tomas watching.'
            })
        );
        const initial: PipelineStory = {
            id: 'story_arch_mem',
            cast: [{ id: 'C1', name: 'Nadia Okafor', role: 'Protagonist', details: {} }],
            lore: [],
            sequences: [{ number: 1, parent_act: 1, title: 'Arrival' }],
            scenes: {
                '0': [
                    { number: '1.1', title: 'Dockside', cast_names: ['Nadia Okafor'] },
                    { number: '1.2', title: 'Watchtower', cast_names: ['Nadia Okafor'] }
                ]
            },
            prose: {
                '0-0': { final: 'Nadia Okafor tucked the damp ledger under her arm.' }
            }
        };
        const { ctx } = makeTestContext(initial, callAI);

        const firstPass = await runArchivistForScene(ctx, initial, 0, 0);
        expect((firstPass.story_memory as StoryMemory).scenes['0-0'].synopsis).toContain(
            'recovered the damp ledger'
        );
        expect(firstPass.story_so_far).toContain('recovered the damp ledger');

        rewrite = true;
        const secondPass = await runArchivistForScene(ctx, firstPass, 0, 0);
        expect((secondPass.story_memory as StoryMemory).scenes['0-0'].synopsis).toContain(
            'burned the forged ledger'
        );
        expect(secondPass.story_so_far).not.toContain('recovered the damp ledger');
        expect(secondPass.story_so_far).toContain('burned the forged ledger');
    });

    it('runArchivistForScene falls back to deterministic blueprint delta when Archivist returns empty JSON', async () => {
        const callAI = vi.fn(async () => '{}');
        const initial: PipelineStory = {
            id: 'story_arch_fallback',
            cast: [{ id: 'C1', name: 'Maren', role: 'Lead', details: {} }],
            lore: [],
            sequences: [{ number: 1, parent_act: 1, title: 'Harbor' }],
            scenes: {
                '0': [
                    {
                        number: '1.1',
                        title: 'Low Tide',
                        pov_character: 'Maren',
                        objective: 'Inspect the cracked sea wall',
                        exit_hook: 'She discovers three missing weeks in the tide tally'
                    },
                    { number: '1.2', title: 'Next Scene', pov_character: 'Maren' }
                ]
            },
            prose: {
                '0-0': { final: 'Maren knelt beside the wet stones.' }
            }
        };
        const { ctx } = makeTestContext(initial, callAI);

        const merged = await runArchivistForScene(ctx, initial, 0, 0);
        const mem = merged.story_memory as StoryMemory;
        expect(mem.scenes['0-0'].synopsis).toContain('Inspect the cracked sea wall');
        expect(merged.story_so_far).toContain('Low Tide');
    });

    it('syncStorySoFarAfterScene compresses completed sequences and completed acts in a telescoping pyramid', async () => {
        const callAI = vi.fn(async (_prompt, _sys, _json, logName) => {
            const name = String(logName || '');
            if (name.includes('Sequence Compressor')) {
                return '<response><compressed_sequence_summary>Maren uncovered the forged winter tallies and survived Tomas Kell\'s warning at the pier, locking her into investigating the vanished keeper.</compressed_sequence_summary></response>';
            }
            if (name.includes('Act Compressor')) {
                return '<response><compressed_summary>Across Act I, Maren exposed the falsified tide ledgers, forged an uneasy alliance with the harbor pilot, and committed to crossing the sound despite Tomas Kell\'s blockade.</compressed_summary></response>';
            }
            return '';
        });

        const baseStory: PipelineStory = {
            id: 'story_telescope',
            concept: 'A coastal archivist uncovers forged tide ledgers.',
            core_thematic_argument: 'Memory survives what paper hides.',
            threads: [{ id: 'T1', name: 'Main Mystery', description: 'Find the vanished keeper.' }],
            acts: [
                { number: 1, title: 'Setup', act_mandate: 'Establish the harbor and lock Maren in.' },
                { number: 2, title: 'Confrontation', act_mandate: 'Escalate across the sound.' }
            ],
            sequences: [
                { number: 1, parent_act: 1, title: 'Status Quo & Discovery', dramatic_question: 'Are the ledgers forged?' },
                { number: 2, parent_act: 1, title: 'Lock-In', dramatic_question: 'Will Maren cross the sound?' },
                { number: 3, parent_act: 2, title: 'New Territory', dramatic_question: 'Who runs the lighthouse?' }
            ],
            scenes: {
                '0': [
                    { number: '1.1', title: 'Tally Room', pov_character: 'Maren', objective: 'Audit ledgers' },
                    { number: '1.2', title: 'Pier Warning', pov_character: 'Maren', objective: 'Confront Tomas' }
                ],
                '1': [
                    { number: '2.1', title: 'Boat Slip', pov_character: 'Maren', objective: 'Secure passage' }
                ],
                '2': [
                    { number: '3.1', title: 'Outer Shoal', pov_character: 'Maren', objective: 'Reach the light' }
                ]
            },
            prose: {
                '0-0': { final: 'Scene 1.1 prose.' },
                '0-1': { final: 'Scene 1.2 prose.' }
            }
        };

        const { ctx } = makeTestContext(baseStory, callAI);

        // Completing Sequence 1 (Act 1 still has Sequence 2 unwritten) -> Sequence Compressor fires, Act Compressor does not.
        const afterSeq1 = await syncStorySoFarAfterScene(ctx, baseStory, 0, 1, {
            isAutopilot: true,
            sceneSynopsis: 'Tomas warned Maren off the dock, confirming the ledger forgery matters.'
        });
        expect((afterSeq1.story_memory as StoryMemory).sequences['0'].summary).toContain('forged winter tallies');
        expect((afterSeq1.story_memory as StoryMemory).acts['1']).toBeUndefined();
        expect(afterSeq1.story_so_far).toContain('[Sequence 1 — Status Quo & Discovery]:');
        expect(afterSeq1.story_so_far).not.toContain('Scene 1.1 (Tally Room):');

        // Completing Sequence 2 (completes all sequences in Act 1) -> Sequence Compressor + Act Compressor fire!
        const withSeq2Prose: PipelineStory = {
            ...afterSeq1,
            prose: {
                ...(afterSeq1.prose as Record<string, unknown>),
                '1-0': { final: 'Scene 2.1 prose.' }
            }
        };
        const afterAct1 = await syncStorySoFarAfterScene(ctx, withSeq2Prose, 1, 0, {
            isAutopilot: true,
            sceneSynopsis: 'Maren bribed the pilot and sailed past the breakwater at midnight.'
        });
        expect((afterAct1.story_memory as StoryMemory).acts['1'].summary).toContain('Across Act I');
        expect(afterAct1.story_so_far).toContain('[Act 1 — Setup]:');
        expect(afterAct1.story_so_far).not.toContain('[Sequence 1 — Status Quo & Discovery]:');
    });

    it('rebuildStorySoFar compresses bloated legacy story_so_far with spatial handoff tags', async () => {
        const callAI = vi.fn(async (_prompt, _sys, _json, logName) => {
            if (String(logName).includes('Sequence Compressor')) {
                return '<response><compressed_sequence_summary>Maren verified the missing tally weeks and escaped the flooded cellar with the brass seal.</compressed_sequence_summary></response>';
            }
            return '';
        });

        const legacyBloated: PipelineStory = {
            id: 'story_bloated',
            concept: 'Harbor mystery.',
            story_so_far:
                '- Maren walked in.\n- [TERMINAL SPATIAL & INTERACTION STATE]: Maren in tally room holding inkwell.\n\n' +
                Array(20).fill('Detailed tactical handoff paragraph with repetitive blocking.').join('\n\n'),
            acts: [{ number: 1, title: 'Setup' }],
            sequences: [
                { number: 1, parent_act: 1, title: 'Opening' },
                { number: 2, parent_act: 1, title: 'Second Seq' }
            ],
            scenes: {
                '0': [{ number: '1.1', title: 'Cellar', pov_character: 'Maren', objective: 'Find seal' }],
                '1': [{ number: '2.1', title: 'Quay', pov_character: 'Maren', objective: 'Board skiff' }]
            },
            prose: {
                '0-0': { final: 'Maren pried open the grate.' }
            }
        };

        const { ctx, toasts } = makeTestContext(legacyBloated, callAI);
        const rebuilt = await rebuildStorySoFar(ctx, legacyBloated, true);

        expect(rebuilt.story_so_far).toContain('[Sequence 1 — Opening]:');
        expect(rebuilt.story_so_far).not.toContain('TERMINAL SPATIAL & INTERACTION STATE');
        expect(String(rebuilt.story_so_far).length).toBeLessThan(String(legacyBloated.story_so_far).length);
        expect(toasts.some((t) => t.message.includes('Compressed Story So Far'))).toBe(true);
    });
});
