import { describe, expect, it, vi } from 'vitest';
import { createSeriesOpener } from '@/domain/series';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import {
    auditTextAgainstContract,
    generateBookRecap,
    runAgentWithEscalation,
    runArchivistForScene,
    runSeriesArchitect,
    startNextBook,
    updateStorySoFar,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import { storyStore } from '@/services/storage';
import type { OpenThread, SeriesInfo } from '@/types';

// The sequel test stops at the hand-over to bible initialization, which has its own tests.
vi.mock('@/pipeline/initStory', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/pipeline/initStory')>();
    return { ...actual, initStory: vi.fn(async (_ctx, _auto, opts) => opts?.existingStory) };
});

function makeCtx(initial: PipelineStory, callAI: CallAiFn) {
    let story: PipelineStory = { ...initial };
    const toasts: string[] = [];
    const ctx = {
        getStory: () => story,
        setStory: (u: PipelineStory | ((p: PipelineStory) => PipelineStory)) => {
            story = typeof u === 'function' ? u(story) : u;
            return story;
        },
        getActiveStoryId: () => String(story.id || 'story_test'),
        updateStoryById: async (_id: string, u: PipelineStory | ((p: PipelineStory) => PipelineStory)) => {
            story = typeof u === 'function' ? u(story) : { ...story, ...u };
            return story;
        },
        getModelSettings: () => ({ apiProvider: 'gemini' }),
        getEffectiveModelConfig: () => ({ provider: 'gemini', model: 'gemini-2.0-flash', isFallback: false }),
        getApiProvider: () => 'gemini',
        getEnableReview: () => false,
        getEnableNarrativeLenses: () => false,
        getSlopConfig: () => DEFAULT_SLOP_CONFIG,
        getBannedPhrases: () => [],
        getFeedbackLedger: () => ({}),
        setFeedbackLedger: vi.fn(),
        setFailedReviewCritiques: vi.fn(),
        setInterventionState: vi.fn(),
        setLoading: vi.fn(),
        setLoadingStep: vi.fn(),
        setWorldPrimer: vi.fn(),
        setRagStatus: vi.fn(),
        getRagStatus: () => 'idle',
        setIsRebuildingRag: vi.fn(),
        getIsRebuildingRag: () => false,
        showToast: (message: string) => {
            toasts.push(message);
        },
        logPipelineValidation: vi.fn(),
        logPipelineError: vi.fn(),
        getVectorStore: () => null,
        getGraphManager: () => null,
        getEmbeddingService: () => null,
        getRagIndexRevision: () => 0,
        bumpRagIndexRevision: () => 1,
        getLoreImportVersion: () => 0,
        retrieveContext: async () => [],
        callAI
    } as unknown as PipelineRuntimeContext;
    return { ctx, toasts, getStory: () => story };
}

function thread(over: Partial<OpenThread> = {}): OpenThread {
    return {
        id: 'S1',
        title: 'The missing ledger',
        description: 'Who took the harbour ledger?',
        promise: 'We will learn who took the ledger.',
        status: 'open',
        origin_book: 1,
        owners: [],
        intent: 'advance',
        planned_sequences: [3, 6],
        touches: [],
        ...over
    };
}

function seriesHeader(over: Partial<SeriesInfo> = {}): SeriesInfo {
    return { ...createSeriesOpener('The Harbour Books', 'Tide Ledger', 1), ...over };
}

const sceneStory: PipelineStory = {
    id: 'story_arch',
    cast: [{ id: 'C1', name: 'Nadia Okafor', role: 'Protagonist', details: {} }],
    lore: [],
    sequences: [{ number: 1, parent_act: 1, title: 'Arrival' }],
    scenes: { '0': [{ number: '1.1', title: 'Dockside', cast_names: ['Nadia Okafor'] }] },
    prose: { '0-0': { final: 'Nadia Okafor tucked the damp ledger under her arm.' } }
};

describe('series pipeline steps', () => {
    it('keeps the continuity prompt of a standalone story free of series text', async () => {
        const callAI = vi.fn<CallAiFn>(async () => JSON.stringify({ cast_updates: [] }));
        const { ctx } = makeCtx(sceneStory, callAI);
        await runArchivistForScene(ctx, sceneStory, 0, 0);
        const prompt = String(callAI.mock.calls[0][0]);
        expect(prompt).not.toContain('series_tracking');
        expect(prompt).toContain('</output_format_description>\n\n<current_lore_topics>');
    });

    it('tracks threads scene by scene and lets the model open one', async () => {
        const story: PipelineStory = { ...sceneStory, target_word_count: 80000, series: seriesHeader(), open_threads: [thread()] };
        const callAI = vi.fn<CallAiFn>(async () =>
            JSON.stringify({
                cast_updates: [],
                open_thread_updates: [{ id: 'S1', change: 'advanced', note: 'Nadia now holds the ledger.' }],
                new_thread_candidates: [{ title: 'The dockmaster knew', promise: 'Who warned him?', kind: 'mystery' }],
                secret_events: []
            })
        );
        const { ctx, toasts } = makeCtx(story, callAI);
        const merged = await runArchivistForScene(ctx, story, 0, 0);
        expect(String(callAI.mock.calls[0][0])).toContain('<series_tracking>');
        const threads = merged.open_threads as OpenThread[];
        expect(threads.map((t) => [t.id, t.status, t.source])).toEqual([
            ['S1', 'advanced', undefined],
            ['S2', 'open', 'model']
        ]);
        expect(threads[0].touches).toEqual([{ book: 1, scene: '1.1', note: 'Nadia now holds the ledger.' }]);
        expect(toasts).toContain('Series thread opened: The dockmaster knew');
    });

    it('records a contract warning when a scene closes a thread that must stay open', async () => {
        const story: PipelineStory = { ...sceneStory, series: seriesHeader(), open_threads: [thread()] };
        const callAI = vi.fn<CallAiFn>(async () =>
            JSON.stringify({ open_thread_updates: [{ id: 'S1', change: 'resolved', note: 'The thief confesses.' }] })
        );
        const { ctx, toasts } = makeCtx(story, callAI);
        const merged = await runArchivistForScene(ctx, story, 0, 0);
        const series = merged.series as SeriesInfo;
        expect(series.contract_violations).toHaveLength(1);
        expect(series.contract_violations?.[0]).toMatchObject({ rule: 'must_stay_open', subject: 'S1' });
        expect(toasts.some((t) => t.startsWith('Series ending contract (S1)'))).toBe(true);
    });

    it('shows the series threads to the Story So Far step only for a series', async () => {
        const base: PipelineStory = { ...sceneStory, concept: 'A ledger goes missing.', acts: [] };
        const reply = `<response><story_so_far>${'Nadia recovers the ledger at the docks. '.repeat(3)}</story_so_far></response>`;
        const plain = vi.fn<CallAiFn>(async () => reply);
        await updateStorySoFar(makeCtx(base, plain).ctx, base);
        expect(String(plain.mock.calls[0][0])).not.toContain('series_thread_status');

        const withSeries = { ...base, series: seriesHeader(), open_threads: [thread()] };
        const series = vi.fn<CallAiFn>(async () => reply);
        await updateStorySoFar(makeCtx(withSeries, series).ctx, withSeries);
        expect(String(series.mock.calls[0][0])).toContain('S1 "The missing ledger" [open]');
    });

    it('skips the Series Architect for a standalone story', async () => {
        const callAI = vi.fn<CallAiFn>(async () => '');
        const story: PipelineStory = { id: 'solo', concept: 'c' };
        const out = await runSeriesArchitect(makeCtx(story, callAI).ctx, 'solo', story);
        expect(out).toBe(story);
        expect(callAI).not.toHaveBeenCalled();
    });

    it('writes the plan, the threads and the layered secret for a series opener', async () => {
        const reply = `<response>
<series_question>Can the harbour govern itself?</series_question>
<series_thematic_argument>Trust is built by debts honestly kept.</series_thematic_argument>
<endgame_note>The harbour stands alone.</endgame_note>
<lead_long_arc><char_name>Nadia Okafor</char_name><lie>Nobody can be trusted.</lie><truth>Trust is a choice.</truth></lead_long_arc>
<books>
<book number="1" role="opener"><book_question>Will Nadia expose the fraud?</book_question><stakes_scope>Her post.</stakes_scope><lead_name>Nadia Okafor</lead_name><handoff_state>Nadia runs the customs house.</handoff_state><thread_intents><thread_intent id="S1">introduce</thread_intent></thread_intents></book>
<book number="2" role="escalation"><book_question>Who owns the debt?</book_question><stakes_scope>The town.</stakes_scope><handoff_state>Revolt.</handoff_state><thread_intents><thread_intent id="S1">pay_off</thread_intent></thread_intents></book>
</books>
<series_threads><series_thread id="S1" kind="mystery"><title>The missing ledger</title><promise>Who took it?</promise><owners>Nadia Okafor</owners></series_thread></series_threads>
</response>`;
        const callAI = vi.fn<CallAiFn>(async () => reply);
        const story: PipelineStory = {
            ...sceneStory,
            concept: 'A customs clerk uncovers a fraud.',
            target_word_count: 80000,
            sequences: [],
            series: seriesHeader(),
            open_threads: []
        };
        const { ctx, getStory } = makeCtx(story, callAI);
        const out = await runSeriesArchitect(ctx, 'story_arch', story);
        const series = out.series as SeriesInfo;
        expect(callAI.mock.calls[0][3]).toBe('Series Architect');
        expect(series.plan?.series_question).toBe('Can the harbour govern itself?');
        const threads = out.open_threads as OpenThread[];
        expect(threads).toHaveLength(1);
        expect(threads[0]).toMatchObject({ id: 'S1', intent: 'introduce', kind: 'mystery' });
        expect((threads[0].planned_sequences || []).length).toBeGreaterThan(0);
        expect((getStory().series as SeriesInfo).plan?.books).toHaveLength(2);
    });

    it('still produces a usable plan when the Series Architect call fails', async () => {
        const callAI = vi.fn<CallAiFn>(async () => {
            throw new Error('offline');
        });
        const story: PipelineStory = { ...sceneStory, concept: 'c', series: seriesHeader(), open_threads: [] };
        const out = await runSeriesArchitect(makeCtx(story, callAI).ctx, 'story_arch', story);
        expect((out.series as SeriesInfo).plan?.books.some((b) => b.book_number === 1)).toBe(true);
    });

    it('audits text against the ending contract and lets it pass when the audit cannot run', async () => {
        const story: PipelineStory = { ...sceneStory, series: seriesHeader(), open_threads: [thread()] };
        const fail = vi.fn<CallAiFn>(
            async () =>
                '<violations><violation><rule>must_stay_open</rule><subject>S1</subject><evidence>The thief confesses.</evidence></violation></violations>'
        );
        const errors = await auditTextAgainstContract(makeCtx(story, fail).ctx, story, 'The thief confesses.', 'prose');
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('S1');

        const broken = vi.fn<CallAiFn>(async () => {
            throw new Error('offline');
        });
        expect(await auditTextAgainstContract(makeCtx(story, broken).ctx, story, 'text', 'plan')).toEqual([]);

        const idle = vi.fn<CallAiFn>(async () => '');
        expect(await auditTextAgainstContract(makeCtx(sceneStory, idle).ctx, sceneStory, 'text', 'prose')).toEqual([]);
        const nothingHeld = { ...story, open_threads: [thread({ intent: 'pay_off' })] };
        expect(await auditTextAgainstContract(makeCtx(nothingHeld, idle).ctx, nothingHeld, 'text', 'prose')).toEqual([]);
        expect(idle).not.toHaveBeenCalled();
    });

    it('regenerates a tier when the extra gate objects, and never blocks the last attempt', async () => {
        const callAI = vi.fn<CallAiFn>(async () => `<response><story_so_far>${'A long enough summary of events. '.repeat(3)}</story_so_far></response>`);
        const { ctx } = makeCtx({ id: 's' }, callAI);
        const gate = vi.fn(async () => ['A series thread that must stay open was resolved.']);
        const res = await runAgentWithEscalation<{ text: string }>(ctx, {
            tierName: 'Story So Far Agent',
            generatorPromptFn: () => 'Summarize.',
            systemPrompt: 'sys',
            parserFn: (raw) => ({ text: String(raw) }),
            gateFn: gate,
            modelSize: 'review'
        });
        // The gate objects every time: it runs on each attempt except the last, which is accepted.
        expect(gate.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(callAI.mock.calls.length).toBe(gate.mock.calls.length + 1);
        expect(res.failed).toBeFalsy();
        expect(res.parsedData.text).toContain('A long enough summary');
    }, 30000);

    it('uses the running synopsis when the recap call returns nothing useful', async () => {
        const story: PipelineStory = { id: 'b1', title: 'Tide Ledger', story_so_far: 'Nadia exposed the fraud.' };
        expect(await generateBookRecap(makeCtx(story, vi.fn<CallAiFn>(async () => '<recap>too short</recap>')).ctx, story)).toBe('Nadia exposed the fraud.');
        const long = 'Nadia exposed the customs fraud and took the house. '.repeat(6).trim();
        expect(await generateBookRecap(makeCtx(story, vi.fn<CallAiFn>(async () => `<recap>${long}</recap>`)).ctx, story)).toBe(long);
    });

    it('starts the next book from a standalone story and makes it a series', async () => {
        const source: PipelineStory = {
            id: 'story_solo',
            title: 'Tide Ledger',
            concept: 'A customs clerk uncovers a fraud.',
            story_so_far: 'Nadia exposed the fraud.',
            target_word_count: 40000,
            cast: [{ id: 'C1', name: 'Nadia Okafor', role: 'Protagonist', corner_role: 'MAIN_CHARACTER', vocal_cadence: 'Clipped.' }],
            prose: { '0-0': { final: 'Some prose.' } },
            secret_vault: []
        };
        const { ctx, getStory } = makeCtx(source, vi.fn<CallAiFn>(async () => ''));
        expect(await startNextBook(ctx, { concept: '   ' })).toBeUndefined();

        const book2 = (await startNextBook(ctx, { title: 'Salt Debt', concept: 'The debt comes due.', seriesTitle: 'The Harbour Books' })) as PipelineStory;
        const series = book2.series as SeriesInfo;
        expect(book2).toMatchObject({ title: 'Salt Debt', concept: 'The debt comes due.', target_word_count: 40000 });
        expect(series).toMatchObject({ title: 'The Harbour Books', book_number: 2 });
        expect(series.previous_books).toEqual([
            { book_number: 1, story_id: 'story_solo', title: 'Tide Ledger', recap: 'Nadia exposed the fraud.' }
        ]);
        expect(series.returning_cast?.map((c) => c.name)).toEqual(['Nadia Okafor']);
        expect(getStory().id).toBe(book2.id);
        const saved = (await storyStore.loadStory(String(book2.id))) as PipelineStory | null;
        expect((saved?.series as SeriesInfo | undefined)?.id).toBe(series.id);
    });
});
