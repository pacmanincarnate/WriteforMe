/**
 * Which step Continuous Autopilot takes next, for each state a story can be in. The generators
 * themselves are mocked: this file is about the order of work and the stop conditions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineRuntimeContext, PipelineStory } from '@/pipeline';

vi.mock('@/pipeline/initStory', () => ({ initStory: vi.fn(), createStoryEntityFromSetup: vi.fn() }));
vi.mock('@/pipeline/arcAndActs', () => ({
    generateStoryArc: vi.fn(),
    generateActsAndSequences: vi.fn(),
    generateSequences: vi.fn()
}));
vi.mock('@/pipeline/sceneBlueprints', () => ({ generateScenes: vi.fn() }));
vi.mock('@/pipeline/prosePipeline', () => ({ writeSceneProse: vi.fn() }));
vi.mock('@/pipeline/editorialHarness', () => ({ runAutonomousEditorialHarness: vi.fn() }));
vi.mock('@/services/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/storage')>();
    return { ...actual, storyStore: { ...actual.storyStore, saveStory: vi.fn(async () => undefined) } };
});

import { handleAutopilot, runContinuousAutopilotStep } from '@/pipeline/autopilot';
import { createStoryEntityFromSetup, initStory } from '@/pipeline/initStory';
import { generateActsAndSequences, generateSequences, generateStoryArc } from '@/pipeline/arcAndActs';
import { generateScenes } from '@/pipeline/sceneBlueprints';
import { writeSceneProse } from '@/pipeline/prosePipeline';
import { runAutonomousEditorialHarness } from '@/pipeline/editorialHarness';

const EIGHT_SEQUENCES = Array.from({ length: 8 }, (_, i) => ({ number: i + 1, title: `Seq ${i + 1}` }));
const THREE_SCENES = [{ number: '1.1' }, { number: '1.2' }, { number: '1.3' }];

/** A story with the bible, arc and all eight sequences in place. */
function structuredStory(extra: PipelineStory = {}): PipelineStory {
    return {
        id: 's1',
        concept: 'A lighthouse keeper finds a door in the sea.',
        cast: [{ name: 'Ana' }],
        core_thematic_argument: 'Duty outlasts fear.',
        acts: [{ number: 1 }, { number: 2 }, { number: 3 }],
        sequences: EIGHT_SEQUENCES,
        length_control: { sequences: Object.fromEntries(EIGHT_SEQUENCES.map((_, i) => [`${i}`, { floor: 3 }])) },
        ...extra
    };
}

/** Every sequence woven with three scenes and every scene drafted. */
function finishedStory(extra: PipelineStory = {}): PipelineStory {
    const scenes: Record<string, unknown> = {};
    const prose: Record<string, unknown> = {};
    EIGHT_SEQUENCES.forEach((_, s) => {
        scenes[`${s}`] = THREE_SCENES;
        THREE_SCENES.forEach((__, c) => { prose[`${s}-${c}`] = { final: 'Drafted.' }; });
    });
    return structuredStory({ scenes, prose, ...extra });
}

function makeCtx(initial: PipelineStory, overrides: Partial<PipelineRuntimeContext> = {}) {
    let story = initial;
    const running = { current: true };
    const prefetch = { current: new Map<string, Promise<PipelineStory | null>>() };
    const toasts: string[] = [];
    const views: string[] = [];
    const setContinuousAutopilot = vi.fn();
    const ctx = {
        getStory: () => story,
        setStory: (u: PipelineStory | ((p: PipelineStory) => PipelineStory)) => {
            story = typeof u === 'function' ? u(story) : u;
            return story;
        },
        getApiProvider: () => 'gemini',
        getSetupDraft: () => ({ inputConcept: '' }),
        getContinuousAutopilotRef: () => running,
        getPrefetchCacheRef: () => prefetch,
        setContinuousAutopilot,
        setLoading: vi.fn(),
        setLoadingStep: vi.fn(),
        setView: (v: string) => { views.push(v); },
        setSelectedSequence: vi.fn(),
        setSelectedScene: vi.fn(),
        showToast: (message: string) => { toasts.push(message); },
        logPipelineError: vi.fn(),
        logPipelineDelay: vi.fn(),
        ...overrides
    } as unknown as PipelineRuntimeContext;
    return { ctx, running, prefetch, toasts, views, setContinuousAutopilot, setStoryDirect: (s: PipelineStory) => { story = s; } };
}

/** Runs one step, letting its cooldown timers elapse. */
async function step(ctx: PipelineRuntimeContext): Promise<boolean> {
    const pending = runContinuousAutopilotStep(ctx);
    await vi.runAllTimersAsync();
    return pending;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('runContinuousAutopilotStep: what comes next', () => {
    it('stops and asks for a concept when there is none', async () => {
        const h = makeCtx({ id: 's1' });
        expect(await step(h.ctx)).toBe(false);
        expect(h.toasts).toEqual(['Please enter a story concept first!']);
        expect(h.setContinuousAutopilot).toHaveBeenCalledWith(false);
        expect(h.running.current).toBe(false);
        expect(initStory).not.toHaveBeenCalled();
    });

    it('1. builds the story bible first', async () => {
        const h = makeCtx({ id: 's1', concept: 'A door in the sea.' });
        vi.mocked(initStory).mockResolvedValue({ id: 's1', concept: 'A door in the sea.', cast: [{ name: 'Ana' }] });
        expect(await step(h.ctx)).toBe(true);
        expect(initStory).toHaveBeenCalledTimes(1);
        expect(generateStoryArc).not.toHaveBeenCalled();
    });

    it('2. then the story arc', async () => {
        const h = makeCtx(structuredStory({ core_thematic_argument: undefined, sequences: [] }));
        vi.mocked(generateStoryArc).mockResolvedValue(structuredStory({ sequences: [] }));
        expect(await step(h.ctx)).toBe(true);
        expect(generateStoryArc).toHaveBeenCalledTimes(1);
        expect(h.views).toEqual(['dashboard']);
        expect(generateActsAndSequences).not.toHaveBeenCalled();
    });

    it('pauses when the story arc comes back without a thematic argument', async () => {
        const h = makeCtx(structuredStory({ core_thematic_argument: undefined }));
        vi.mocked(generateStoryArc).mockResolvedValue({ id: 's1' });
        expect(await step(h.ctx)).toBe(false);
        expect(h.toasts[0]).toContain('Story Arc could not be generated');
        expect(h.running.current).toBe(false);
    });

    it('3. then acts and sequences when there are no acts yet', async () => {
        const h = makeCtx(structuredStory({ acts: [], sequences: [] }));
        vi.mocked(generateActsAndSequences).mockResolvedValue(structuredStory());
        expect(await step(h.ctx)).toBe(true);
        expect(generateActsAndSequences).toHaveBeenCalledTimes(1);
        expect(generateSequences).not.toHaveBeenCalled();
        expect(h.views).toEqual(['structure']);
    });

    it('3b. or only the sequences when three acts already exist', async () => {
        const h = makeCtx(structuredStory({ sequences: [] }));
        vi.mocked(generateSequences).mockResolvedValue(structuredStory());
        expect(await step(h.ctx)).toBe(true);
        expect(generateSequences).toHaveBeenCalledTimes(1);
        expect(generateActsAndSequences).not.toHaveBeenCalled();
    });

    it('pads a partial sequence list back to eight before going on', async () => {
        const h = makeCtx(structuredStory({ sequences: EIGHT_SEQUENCES.slice(0, 5) }));
        vi.mocked(generateScenes).mockResolvedValue(undefined as never);
        await step(h.ctx);
        expect((h.ctx.getStory().sequences as unknown[]).length).toBe(8);
        expect(h.toasts[0]).toBe('Restored full sequence framework (padded from 5 to 8).');
    });

    it('4. weaves scenes for the first sequence that has none', async () => {
        const scenes = { '0': THREE_SCENES };
        const prose = { '0-0': { final: 'x' }, '0-1': { final: 'x' }, '0-2': { final: 'x' } };
        const h = makeCtx(structuredStory({ scenes, prose }));
        vi.mocked(generateScenes).mockResolvedValue(undefined as never);
        expect(await step(h.ctx)).toBe(true);
        expect(generateScenes).toHaveBeenCalledTimes(1);
        expect(vi.mocked(generateScenes).mock.calls[0][1]).toBe(1);
        expect(writeSceneProse).not.toHaveBeenCalled();
        expect(h.views).toEqual(['sequence_dashboard']);
    });

    it('re-weaves a sequence that is under its scene floor and has no prose yet', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': [{ number: '1.1' }] } }));
        vi.mocked(generateScenes).mockResolvedValue(undefined as never);
        expect(await step(h.ctx)).toBe(true);
        expect(vi.mocked(generateScenes).mock.calls[0][1]).toBe(0);
        expect(h.toasts[0]).toContain('Re-weaving Sequence 1');
    });

    it('does not re-weave an under-floor sequence once it has prose', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': [{ number: '1.1' }] }, prose: { '0-0': { final: 'Kept.' } } }));
        vi.mocked(generateScenes).mockResolvedValue(undefined as never);
        await step(h.ctx);
        // Sequence 1 is left alone; the next thing to weave is sequence 2.
        expect(vi.mocked(generateScenes).mock.calls[0][1]).toBe(1);
    });

    it('5. drafts the first scene that has no prose', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES }, prose: { '0-0': { final: 'Done.' } } }));
        vi.mocked(writeSceneProse).mockResolvedValue(h.ctx.getStory() as never);
        expect(await step(h.ctx)).toBe(true);
        expect(writeSceneProse).toHaveBeenCalledTimes(1);
        expect(vi.mocked(writeSceneProse).mock.calls[0].slice(1, 3)).toEqual([0, 1]);
        expect(h.views).toEqual(['writer']);
        expect(generateScenes).not.toHaveBeenCalled();
    });

    it('treats a plain-string prose entry as drafted', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES }, prose: { '0-0': 'Old format.', '0-1': { final: 'x' } } }));
        vi.mocked(writeSceneProse).mockResolvedValue(h.ctx.getStory() as never);
        await step(h.ctx);
        expect(vi.mocked(writeSceneProse).mock.calls[0].slice(1, 3)).toEqual([0, 2]);
    });

    it('starts weaving the next sequence in the background after a sequence\'s last scene', async () => {
        const prose = { '0-0': { final: 'x' }, '0-1': { final: 'x' } };
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES }, prose }));
        vi.mocked(writeSceneProse).mockResolvedValue(h.ctx.getStory() as never);
        vi.mocked(generateScenes).mockResolvedValue(undefined as never);
        await step(h.ctx);
        expect(h.prefetch.current.has('scenes:1')).toBe(true);
        expect(vi.mocked(generateScenes).mock.calls[0].slice(1)).toEqual([1, expect.anything(), true, true]);
    });

    it('does not prefetch for local providers, which run one request at a time', async () => {
        const prose = { '0-0': { final: 'x' }, '0-1': { final: 'x' } };
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES }, prose }), { getApiProvider: () => 'koboldcpp' });
        vi.mocked(writeSceneProse).mockResolvedValue(h.ctx.getStory() as never);
        await step(h.ctx);
        expect(h.prefetch.current.size).toBe(0);
        expect(generateScenes).not.toHaveBeenCalled();
    });

    it('uses prefetched scenes instead of weaving again', async () => {
        const prose = { '0-0': { final: 'x' }, '0-1': { final: 'x' }, '0-2': { final: 'x' }, '1-0': { final: 'stale' } };
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES }, prose, beats: { '1-0': ['stale'] } }));
        h.prefetch.current.set('scenes:1', Promise.resolve({ scenes: { '1': [{ number: '2.1' }, { number: '2.2' }, { number: '2.3' }] } }));
        expect(await step(h.ctx)).toBe(true);
        const story = h.ctx.getStory();
        expect((story.scenes as Record<string, unknown[]>)['1']).toHaveLength(3);
        expect(story.prose).not.toHaveProperty('1-0');
        expect(story.beats).not.toHaveProperty('1-0');
        expect(story.prose).toHaveProperty('0-0');
        expect(h.prefetch.current.has('scenes:1')).toBe(false);
        expect(generateScenes).not.toHaveBeenCalled();
    });

    it('6. runs the editorial harness once everything is drafted', async () => {
        const h = makeCtx(finishedStory());
        expect(await step(h.ctx)).toBe(true);
        expect(runAutonomousEditorialHarness).toHaveBeenCalledTimes(1);
        expect(vi.mocked(runAutonomousEditorialHarness).mock.calls[0][1]).toMatchObject({
            mode: 'full_pipeline',
            scopeSceneId: 'ALL',
            isAutopilot: true
        });
    });

    it('7. finishes: switches itself off and says so', async () => {
        const h = makeCtx(finishedStory({ editorial_harness: { autopilotCompleted: true } }));
        h.prefetch.current.set('scenes:9', Promise.resolve(null));
        expect(await step(h.ctx)).toBe(false);
        expect(h.setContinuousAutopilot).toHaveBeenCalledWith(false);
        expect(h.running.current).toBe(false);
        expect(h.prefetch.current.size).toBe(0);
        expect(h.toasts[0]).toContain('Continuous Autopilot Complete');
        expect(runAutonomousEditorialHarness).not.toHaveBeenCalled();
    });

    it('skips the editorial harness when it is turned off', async () => {
        const h = makeCtx(finishedStory(), { getEnableEditorialHarnessAutopilot: () => false });
        expect(await step(h.ctx)).toBe(false);
        expect(runAutonomousEditorialHarness).not.toHaveBeenCalled();
        expect(h.toasts[0]).toContain('Continuous Autopilot Complete');
    });
});

describe('runContinuousAutopilotStep: failures and stops', () => {
    it('pauses with the scene named when drafting throws', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES } }));
        vi.mocked(writeSceneProse).mockRejectedValue(new Error('rate limited'));
        expect(await step(h.ctx)).toBe(false);
        expect(h.toasts[0]).toBe('Autopilot paused at Sequence 1, Scene 1: rate limited');
        expect(h.running.current).toBe(false);
    });

    it('pauses when drafting returns no story', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES } }));
        vi.mocked(writeSceneProse).mockResolvedValue(null as never);
        expect(await step(h.ctx)).toBe(false);
        expect(h.toasts[0]).toContain('invalid story state after Sequence 1, Scene 1');
    });

    it('pauses and logs when scene weaving throws', async () => {
        const h = makeCtx(structuredStory());
        vi.mocked(generateScenes).mockRejectedValue(new Error('bad outline'));
        expect(await step(h.ctx)).toBe(false);
        expect(h.toasts[0]).toBe('Autopilot scene planning failed for Sequence 1: bad outline');
        expect(h.ctx.logPipelineError).toHaveBeenCalledWith('Autopilot Scene Planner (Sequence 1)', 'bad outline', expect.anything());
    });

    it('does nothing more once the user has stopped it', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES } }));
        h.running.current = false;
        expect(await step(h.ctx)).toBe(false);
        expect(writeSceneProse).not.toHaveBeenCalled();
        expect(generateScenes).not.toHaveBeenCalled();
    });

    it('leaves the user on a protected view', async () => {
        const h = makeCtx(structuredStory({ scenes: { '0': THREE_SCENES } }), { isAutopilotProtectedView: () => true });
        vi.mocked(writeSceneProse).mockResolvedValue(h.ctx.getStory() as never);
        await step(h.ctx);
        expect(h.views).toEqual([]);
        expect(h.ctx.setSelectedScene).not.toHaveBeenCalled();
    });

    it('a harness error does not stop the run', async () => {
        const h = makeCtx(finishedStory());
        vi.mocked(runAutonomousEditorialHarness).mockRejectedValue(new Error('harness crashed'));
        expect(await step(h.ctx)).toBe(true);
        expect(h.running.current).toBe(true);
    });
});

describe('handleAutopilot: starting and stopping', () => {
    it('toggles off when autopilot is already running', async () => {
        const toggleContinuousAutopilot = vi.fn();
        const h = makeCtx(structuredStory(), { getContinuousAutopilot: () => true, toggleContinuousAutopilot });
        await handleAutopilot(h.ctx);
        expect(toggleContinuousAutopilot).toHaveBeenCalledTimes(1);
        expect(h.setContinuousAutopilot).not.toHaveBeenCalled();
    });

    it('does nothing while lore is importing', async () => {
        const h = makeCtx(structuredStory(), { getImportingLore: () => true });
        h.running.current = false;
        await handleAutopilot(h.ctx);
        expect(h.setContinuousAutopilot).not.toHaveBeenCalled();
    });

    it('asks for a concept when there is none', async () => {
        const h = makeCtx({ id: 's1' });
        await handleAutopilot(h.ctx);
        expect(h.toasts).toEqual(['Please enter a story concept first!']);
    });

    it('starts straight away when there is no confirm dialog', async () => {
        const h = makeCtx(structuredStory());
        h.running.current = false;
        await handleAutopilot(h.ctx);
        expect(h.setContinuousAutopilot).toHaveBeenCalledWith(true);
        expect(h.running.current).toBe(true);
        expect(createStoryEntityFromSetup).not.toHaveBeenCalled();
    });

    it('waits for the user to confirm when a dialog is available', async () => {
        const requestConfirm = vi.fn();
        const h = makeCtx(structuredStory(), { requestConfirm } as never);
        h.running.current = false;
        await handleAutopilot(h.ctx);
        expect(h.setContinuousAutopilot).not.toHaveBeenCalled();
        expect(requestConfirm.mock.calls[0][0].title).toBe('Activate Autonomous Autopilot?');
        await requestConfirm.mock.calls[0][0].onConfirm();
        expect(h.setContinuousAutopilot).toHaveBeenCalledWith(true);
    });

    it('from Setup, creates the story first and does not start if that fails', async () => {
        const h = makeCtx({ id: 's1' }, { getSetupDraft: () => ({ inputConcept: 'A new idea' }), getView: () => 'setup' } as never);
        h.running.current = false;
        vi.mocked(createStoryEntityFromSetup).mockResolvedValue(null as never);
        await handleAutopilot(h.ctx);
        expect(createStoryEntityFromSetup).toHaveBeenCalledTimes(1);
        expect(h.setContinuousAutopilot).not.toHaveBeenCalled();

        vi.mocked(createStoryEntityFromSetup).mockResolvedValue({ id: 's2' } as never);
        await handleAutopilot(h.ctx);
        expect(h.setContinuousAutopilot).toHaveBeenCalledWith(true);
    });
});
