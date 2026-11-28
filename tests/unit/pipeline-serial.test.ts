import { describe, expect, it, vi } from 'vitest';
import { createSerialInfo } from '@/domain/serial';
import { createSeriesOpener } from '@/domain/series';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import {
    buildProseContext,
    runArchivistForScene,
    startNextBook,
    type CallAiFn,
    type PipelineRuntimeContext,
    type PipelineStory
} from '@/pipeline';
import type { OpenThread, SerialInfo, SeriesInfo } from '@/types';

// The next-arc test stops at the hand-over to bible initialization, which has its own tests.
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

const spine: OpenThread = {
    id: 'S1',
    title: 'The missing ledger',
    description: 'Who took the harbour ledger?',
    promise: 'We will learn who took the ledger.',
    status: 'open',
    origin_book: 1,
    owners: ['Nadia Okafor'],
    intent: 'advance',
    source: 'plan',
    touches: []
};

const serialStory: PipelineStory = {
    id: 'story_serial',
    title: 'Tide Ledger',
    target_word_count: 20000,
    cast: [{ id: 'C1', name: 'Nadia Okafor', role: 'Protagonist', corner_role: 'MAIN_CHARACTER', details: {} }],
    lore: [],
    threads: [{ id: 'T1', name: 'The customs fraud', description: 'Who is skimming the harbour?' }],
    sequences: [{ number: 1, parent_act: 1, title: 'Arrival' }],
    scenes: {
        '0': [
            { number: '1.1', title: 'Dockside', cast_names: ['Nadia Okafor'], pov_character: 'Nadia Okafor' },
            { number: '1.2', title: 'The office', cast_names: ['Nadia Okafor'], pov_character: 'Nadia Okafor' }
        ]
    },
    prose: { '0-0': { final: 'Nadia Okafor tucked the damp ledger under her arm.' } },
    series: createSeriesOpener('The Harbour Serial', 'Tide Ledger', 1),
    serial: createSerialInfo(),
    open_threads: [spine]
};

describe('serial pipeline steps', () => {
    it('asks the continuity pass for serial notes and folds the scene into the serial state', async () => {
        const callAI = vi.fn<CallAiFn>(async () =>
            JSON.stringify({
                cast_updates: [],
                open_thread_updates: [{ id: 'S1', change: 'advanced', note: 'Nadia now holds the ledger.' }],
                new_thread_candidates: [
                    { title: 'The dockmaster knew', promise: 'Who warned him?', owners: ['Nadia Okafor'] },
                    { title: 'A debt to the pilots', promise: 'Will she pay?', owners: ['Nadia Okafor'] }
                ],
                serial_thread_notes: []
            })
        );
        const { ctx, toasts } = makeCtx(serialStory, callAI);
        const merged = await runArchivistForScene(ctx, serialStory, 0, 0);
        const prompt = String(callAI.mock.calls[0][0]);
        expect(prompt).toContain('<series_tracking>');
        expect(prompt).toContain('<serial_tracking>');

        // A 20,000 word book allows two series threads; the serial's own policy lets side threads open.
        const threads = merged.open_threads as OpenThread[];
        expect(threads.map((t) => t.id)).toEqual(['S1', 'S2', 'S3']);
        const serial = merged.serial as SerialInfo;
        expect(serial.thread_meta.S1).toMatchObject({ scope: 'series', moves: 2, last_touched_episode: 1 });
        expect(serial.thread_meta.S2).toMatchObject({ scope: 'side', opened_episode: 1 });
        expect(serial.episodes).toEqual([expect.objectContaining({ number: 1, scene_keys: ['0-0'], pov: 'Nadia Okafor' })]);
        expect(serial.roster).toEqual([expect.objectContaining({ name: 'Nadia Okafor', anchored: true, appearances: 1, last_on_page_episode: 1 })]);
        expect(toasts).toContain('Series thread opened: The dockmaster knew');
    });

    it('does not report a side thread closing as a breach of the ending contract', async () => {
        const side: OpenThread = { ...spine, id: 'S2', title: 'The dockmaster knew', source: 'model' };
        const story: PipelineStory = { ...serialStory, open_threads: [spine, side] };
        const callAI = vi.fn<CallAiFn>(async () =>
            JSON.stringify({ open_thread_updates: [{ id: 'S2', change: 'resolved', note: 'He confesses.' }] })
        );
        const { ctx, toasts } = makeCtx(story, callAI);
        const merged = await runArchivistForScene(ctx, story, 0, 0);
        expect((merged.series as SeriesInfo).contract_violations || []).toEqual([]);
        expect(toasts.some((t) => t.startsWith('Series ending contract'))).toBe(false);
        expect((merged.serial as SerialInfo).thread_meta.S2.closed_episode).toBe(1);
    });

    it("puts the scene's episode plan into the prose prompt, and nothing into a standalone story's", () => {
        const params = {
            sequenceData: (serialStory.sequences as Array<Record<string, unknown>>)[0],
            scene: (serialStory.scenes as Record<string, Array<Record<string, unknown>>>)['0'][1],
            seq: 0,
            s: 1
        } as Parameters<typeof buildProseContext>[0];
        const withSerial = buildProseContext({ ...params, storyToUse: serialStory } as Parameters<typeof buildProseContext>[0]);
        expect(withSerial).toContain('<serial_context arc="1" episode="2"');
        expect(withSerial).toContain('This is the last scene of episode 2');
        const solo: PipelineStory = { ...serialStory, series: undefined, serial: undefined, open_threads: undefined };
        const plain = buildProseContext({ ...params, storyToUse: solo } as Parameters<typeof buildProseContext>[0]);
        expect(plain).not.toContain('serial_context');
    });

    it('carries the serial into the next arc with its episode count and roster', async () => {
        const source: PipelineStory = {
            ...serialStory,
            concept: 'A customs clerk uncovers a fraud.',
            story_so_far: 'Nadia exposed the fraud.',
            secret_vault: [],
            serial: {
                ...createSerialInfo(),
                episodes: [{ number: 1, arc_number: 1, kind: 'main', scene_keys: ['0-0', '0-1'] }, { number: 2, arc_number: 1, kind: 'main', scene_keys: ['0-2'] }]
            }
        };
        const { ctx } = makeCtx(source, vi.fn<CallAiFn>(async () => ''));
        const arc2 = (await startNextBook(ctx, { title: 'Salt Debt', concept: 'The debt comes due.' })) as PipelineStory;
        const serial = arc2.serial as SerialInfo;
        expect((arc2.series as SeriesInfo).book_number).toBe(2);
        expect(serial.arc_first_episode).toBe(3);
        expect(serial.seated?.anchors).toEqual(['Nadia Okafor']);
        expect(serial.roster.map((r) => r.name)).toEqual(['Nadia Okafor']);
        expect(Object.keys(serial.thread_meta)).toEqual(['S1']);
        expect(serial.plans).toEqual({});
    });
});
