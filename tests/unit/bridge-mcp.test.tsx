import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMcpBridge } from '@/hooks';
import {
    BRIDGE_ACTIONS,
    BRIDGE_PIPELINE_STEPS,
    connectMcpBridge,
    createBridgeApi,
    createBridgeDispatcher,
    type BridgeActions,
    type BridgeSocket,
    type BridgeState,
    type BridgeStoryStore
} from '@/services/bridge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

/** Minimal renderHook: mounts a hook in a throwaway root and exposes its latest return value. */
function renderHook<TProps, TResult>(
    useHookFn: (props: TProps) => TResult,
    options?: { initialProps: TProps }
): { result: { current: TResult }; rerender: (props: TProps) => void } {
    const container = document.createElement('div');
    const root = createRoot(container);
    mountedRoots.push(root);
    const result = { current: undefined as unknown as TResult };
    function Harness({ hookProps }: { hookProps: TProps }): null {
        result.current = useHookFn(hookProps);
        return null;
    }
    const render = (props: TProps): void => {
        act(() => {
            root.render(<Harness hookProps={props} />);
        });
    };
    render(options?.initialProps as TProps);
    return { result, rerender: render };
}

afterEach(() => {
    while (mountedRoots.length) {
        const root = mountedRoots.pop();
        act(() => root?.unmount());
    }
});

const STORY = {
    title: 'The Salt Clock',
    concept: 'A lighthouse keeper sells time.',
    writingMode: 'novel',
    acts: [{ number: 1 }],
    characters: [{ name: 'Mara', role: 'protagonist', archetype: 'keeper', bio: 'Keeps the light.' }],
    sequences: [
        {
            sequence_number: 1,
            title: 'Low Tide',
            parent_act: 1,
            dramatic_question: 'Will she sell?',
            scenes: [
                { scene_number: 1, title: 'Arrival', summary: 'A stranger lands.', prose: 'one two three' },
                { scene_number: 2, title: 'Bargain', summary: 'Terms are set.', characterIds: ['C1'] }
            ]
        }
    ],
    prose: { '1-2': 'four five' },
    beats: { '1-2': ['beat'] }
};

function makeState(overrides: Partial<BridgeState> = {}): BridgeState {
    return {
        story: STORY,
        activeStoryId: 'story_1',
        apiProvider: 'gemini',
        devProvider: '',
        devModel: '',
        reviewProvider: '',
        reviewModel: '',
        proseProvider: '',
        proseModel: '',
        geminiModel: 'gemini-x',
        openRouterModel: 'or-x',
        nanoGptModel: 'nano-x',
        koboldModel: 'kobold-x',
        codexModel: 'codex-x',
        claudeModel: 'claude-x',
        apiKey: 'key',
        openRouterKey: '',
        nanoGptKey: '',
        koboldUrl: 'http://kobold',
        codexUrl: 'http://codex',
        claudeUrl: 'http://claude',
        loading: false,
        loadingStep: '',
        continuousAutopilot: false,
        view: 'dashboard',
        inputTitle: '',
        inputConcept: '',
        inputWritingMode: 'novel',
        promptLog: [{ n: 1 }, { n: 2 }, { n: 3 }],
        feedbackLedger: { '1-2': ['tighten'] },
        ...overrides
    };
}

function makeActions(overrides: Partial<BridgeActions> = {}): BridgeActions {
    const names = [
        'setApiProvider', 'setDevProvider', 'setDevModel', 'setReviewProvider', 'setReviewModel',
        'setProseProvider', 'setProseModel', 'setGeminiModel', 'setOpenRouterModel', 'setNanoGptModel',
        'setKoboldModel', 'setCodexModel', 'setClaudeModel', 'setApiKey', 'setOpenRouterKey', 'setNanoGptKey',
        'setKoboldUrl', 'setCodexUrl', 'setClaudeUrl', 'setInputTitle', 'setInputConcept', 'setInputAuthorNote',
        'setInputWritingMode', 'setActiveStoryId', 'setStory', 'setView', 'clearImportedLore',
        'showToast', 'toggleContinuousAutopilot'
    ] as const;
    const base: Record<string, unknown> = {};
    names.forEach((name) => (base[name] = vi.fn()));
    base.getDefaultModelForProvider = vi.fn((p: string) => `default-${p}`);
    base.initStory = vi.fn(async () => undefined);
    base.runContinuousAutopilotStep = vi.fn(async () => true);
    base.generateStoryArc = vi.fn(async () => undefined);
    base.generateActsAndSequences = vi.fn(async () => undefined);
    base.generateSequences = vi.fn(async () => undefined);
    base.generateScenes = vi.fn(async () => undefined);
    base.writeSceneProse = vi.fn(async () => undefined);
    return { ...(base as unknown as BridgeActions), ...overrides };
}

function makeStore(): BridgeStoryStore {
    return {
        listStories: vi.fn(async () => [
            { id: 'story_1', title: 'The Salt Clock', concept: 'x'.repeat(300), wordCount: 5 },
            { id: 'story_2', data: { title: 'From Data', concept: 'c', sequences: STORY.sequences } }
        ]),
        loadStory: vi.fn(async (id: string) => (id === 'story_2' ? { title: 'Second', sequences: [] } : null))
    };
}

function setup(stateOverrides: Partial<BridgeState> = {}, actionOverrides: Partial<BridgeActions> = {}) {
    const state = makeState(stateOverrides);
    const actions = makeActions(actionOverrides);
    const store = makeStore();
    const dispatch = createBridgeDispatcher({
        getState: () => state,
        getActions: () => actions,
        getStoryStore: () => store,
        setupSettleMs: 0,
        now: () => 1234
    });
    return { state, actions, store, dispatch };
}

beforeEach(() => {
    localStorage.clear();
});

describe('bridge dispatcher: read actions', () => {
    it('getStatus summarises the active story', async () => {
        const { dispatch } = setup();
        expect(await dispatch('getStatus')).toEqual({
            connected: true,
            activeStoryId: 'story_1',
            storyTitle: 'The Salt Clock',
            view: 'dashboard',
            apiProvider: 'gemini',
            devModel: 'gemini-x',
            loading: false,
            loadingStep: '',
            continuousAutopilot: false,
            totalWords: 5,
            sequencesCount: 1,
            chaptersCount: 2,
            timestamp: 1234
        });
    });

    it('getModelConfig reports key presence, never the keys', async () => {
        const { dispatch } = setup();
        const cfg = (await dispatch('getModelConfig')) as Record<string, unknown>;
        expect(cfg.devProvider).toBe('gemini');
        expect(cfg.devModel).toBe('default-gemini');
        expect(cfg.hasGeminiKey).toBe(true);
        expect(cfg.hasOpenRouterKey).toBe(false);
        expect(JSON.stringify(cfg)).not.toContain('"key"');
        expect(cfg).not.toHaveProperty('apiKey');
    });

    it('getActiveStory omits prose unless asked and reads both prose locations', async () => {
        const { dispatch } = setup();
        const lean = (await dispatch('getActiveStory')) as {
            sequences: Array<{ scenes: Array<{ wordCount: number; hasProse: boolean; prose?: string }> }>;
            characters: Array<{ summary: string }>;
            totalWords: number;
        };
        expect(lean.sequences[0].scenes.map((s) => s.wordCount)).toEqual([3, 2]);
        expect(lean.sequences[0].scenes.every((s) => s.prose === undefined)).toBe(true);
        expect(lean.characters[0].summary).toBe('Keeps the light.');
        const full = (await dispatch('getActiveStory', { includeFullProse: true })) as typeof lean;
        expect(full.sequences[0].scenes.map((s) => s.prose)).toEqual(['one two three', 'four five']);
    });

    it('getActiveStory reports a missing story', async () => {
        const { dispatch } = setup({ story: null });
        expect(await dispatch('getActiveStory')).toEqual({ story: null, message: 'No active story loaded.' });
    });

    it('getChapter returns prose, beats and feedback, and validates indexes', async () => {
        const { dispatch } = setup();
        const chapter = (await dispatch('getChapter', { sequenceIndex: 0, sceneIndex: 1 })) as Record<string, unknown>;
        expect(chapter).toMatchObject({
            sequenceNumber: 1,
            sceneNumber: 2,
            sceneTitle: 'Bargain',
            wordCount: 2,
            prose: 'four five',
            beats: ['beat'],
            feedback: ['tighten'],
            characterIds: ['C1']
        });
        await expect(dispatch('getChapter', { sequenceIndex: 4 })).rejects.toThrow(
            'Sequence 4 not found in active story.'
        );
        await expect(dispatch('getChapter', { sequenceIndex: 0, sceneIndex: 9 })).rejects.toThrow(
            'Scene 9 in sequence 0 not found.'
        );
    });

    it('getLogs returns the newest entries', async () => {
        const { dispatch } = setup();
        expect(await dispatch('getLogs', { limit: 2 })).toEqual({ count: 2, logs: [{ n: 2 }, { n: 3 }] });
        expect(((await dispatch('getLogs')) as { count: number }).count).toBe(3);
    });

    it('getPipelineStatus mirrors loading state', async () => {
        const { dispatch } = setup({ loading: true, loadingStep: 'Writing', continuousAutopilot: true });
        expect(await dispatch('getPipelineStatus')).toEqual({
            loading: true,
            loadingStep: 'Writing',
            continuousAutopilot: true,
            activeStoryId: 'story_1',
            storyTitle: 'The Salt Clock'
        });
    });
});

describe('bridge dispatcher: validation and errors', () => {
    it('rejects unknown actions', async () => {
        const { dispatch } = setup();
        await expect(dispatch('nope')).rejects.toThrow("Unrecognized bridge action: 'nope'");
    });

    it('tolerates null params (WebSocket messages may omit them)', async () => {
        const { dispatch } = setup();
        await expect(dispatch('getLogs', null)).resolves.toMatchObject({ count: 3 });
    });

    it('validates setModelConfig', async () => {
        const { dispatch, actions } = setup();
        await expect(dispatch('setModelConfig', {})).rejects.toThrow("Missing 'provider' in setModelConfig.");
        await expect(dispatch('setModelConfig', { provider: 'acme' })).rejects.toThrow(
            "Invalid provider 'acme'. Must be one of: gemini, openrouter, nanogpt, koboldcpp, codex, claude"
        );
        expect(actions.setApiProvider).not.toHaveBeenCalled();
    });

    it('validates startNewStory, switchStory, injectFeedback and pipeline steps', async () => {
        const { dispatch } = setup();
        await expect(dispatch('startNewStory', { concept: '   ' })).rejects.toThrow(
            "Missing 'concept' parameter for startNewStory."
        );
        await expect(dispatch('switchStory', {})).rejects.toThrow("Missing 'storyId' to switch.");
        await expect(dispatch('switchStory', { storyId: 'ghost' })).rejects.toThrow(
            "Story with ID 'ghost' not found in library."
        );
        await expect(dispatch('injectFeedback', {})).rejects.toThrow("Missing 'feedback' text.");
        await expect(dispatch('triggerPipelineStep', { action: 'beats' })).rejects.toThrow(
            "Unknown pipeline step action: 'beats'"
        );
    });

    it('fails library actions clearly when the story store is unavailable', async () => {
        const dispatch = createBridgeDispatcher({
            getState: () => makeState(),
            getActions: () => makeActions(),
            getStoryStore: () => null
        });
        await expect(dispatch('listStories')).rejects.toThrow('StoryStore persistence is unavailable.');
        await expect(dispatch('switchStory', { storyId: 'x' })).rejects.toThrow(
            'StoryStore persistence is unavailable.'
        );
    });
});

describe('bridge dispatcher: write actions', () => {
    it('setModelConfig role=all sets the dev tier, provider model, key and persists them', async () => {
        const { dispatch, actions } = setup();
        const result = await dispatch('setModelConfig', { provider: 'openrouter', model: 'm1', apiKey: 'sk' });
        expect(result).toEqual({
            success: true,
            provider: 'openrouter',
            model: 'm1',
            role: 'all',
            message: 'Successfully set openrouter as all provider.'
        });
        expect(actions.setApiProvider).toHaveBeenCalledWith('openrouter');
        expect(actions.setDevProvider).toHaveBeenCalledWith('openrouter');
        expect(actions.setDevModel).toHaveBeenCalledWith('m1');
        expect(actions.setOpenRouterModel).toHaveBeenCalledWith('m1');
        expect(actions.setOpenRouterKey).toHaveBeenCalledWith('sk');
        expect(actions.setReviewProvider).not.toHaveBeenCalled();
        expect(localStorage.getItem('ellipsisprose_api_provider')).toContain('openrouter');
        expect(localStorage.getItem('ellipsisprose_openrouter_key')).toContain('sk');
        expect(actions.showToast).toHaveBeenCalledWith(
            'API configuration updated: OPENROUTER (m1) for ALL',
            'success'
        );
    });

    it('setModelConfig role=review/prose leaves the primary provider alone', async () => {
        const { dispatch, actions } = setup();
        await dispatch('setModelConfig', { provider: 'koboldcpp', role: 'review', baseUrl: 'http://k' });
        await dispatch('setModelConfig', { provider: 'codex', role: 'prose', model: 'c1' });
        expect(actions.setApiProvider).not.toHaveBeenCalled();
        expect(actions.setReviewProvider).toHaveBeenCalledWith('koboldcpp');
        expect(actions.setReviewModel).not.toHaveBeenCalled();
        expect(actions.setKoboldUrl).toHaveBeenCalledWith('http://k');
        expect(actions.setProseProvider).toHaveBeenCalledWith('codex');
        expect(actions.setProseModel).toHaveBeenCalledWith('c1');
        expect(actions.setCodexModel).toHaveBeenCalledWith('c1');
    });

    it('setModelConfig selects the Claude Code bridge with its own model and URL', async () => {
        const { dispatch, actions } = setup();
        await dispatch('setModelConfig', { provider: 'claude', model: 'opus', baseUrl: 'http://c:5011' });
        expect(actions.setApiProvider).toHaveBeenCalledWith('claude');
        expect(actions.setClaudeModel).toHaveBeenCalledWith('opus');
        expect(actions.setClaudeUrl).toHaveBeenCalledWith('http://c:5011');
        expect(actions.setCodexModel).not.toHaveBeenCalled();
        expect(actions.setCodexUrl).not.toHaveBeenCalled();
        expect(localStorage.getItem('ellipsisprose_claude_model')).toBe('opus');
        expect(localStorage.getItem('ellipsisprose_claude_url')).toBe('http://c:5011');
    });

    it('setModelConfig falls back to the provider default model in its reply', async () => {
        const { dispatch } = setup();
        expect(await dispatch('setModelConfig', { provider: 'nanogpt' })).toMatchObject({ model: 'default-nanogpt' });
    });

    it('startNewStory without autoStart only prepares the Setup form', async () => {
        const { dispatch, actions } = setup();
        const result = await dispatch('startNewStory', { concept: '  A heist.  ', autoStart: false });
        expect(result).toMatchObject({ success: true, status: 'ready', title: 'Untitled Novel', autoStart: false });
        expect(actions.setInputConcept).toHaveBeenCalledWith('A heist.');
        expect(actions.setInputTitle).toHaveBeenCalledWith('Untitled Novel');
        expect(actions.setInputAuthorNote).toHaveBeenCalledWith('');
        expect(actions.clearImportedLore).toHaveBeenCalled();
        expect(actions.setView).toHaveBeenCalledWith('setup');
        expect(actions.initStory).not.toHaveBeenCalled();
    });

    it('startNewStory with autoStart starts generation with the callback from AFTER the form update', async () => {
        // Regression: the app's initStory reads the Setup form from render state. Calling the
        // initStory captured before the setters ran started generation with an empty concept,
        // which silently did nothing.
        const state = makeState();
        const staleInit = vi.fn(async () => undefined);
        const freshInit = vi.fn(async () => undefined);
        let current = makeActions({ initStory: staleInit });
        const dispatch = createBridgeDispatcher({
            getState: () => state,
            getActions: () => current,
            getStoryStore: () => null,
            setupSettleMs: 5
        });
        const pending = dispatch('startNewStory', { title: 'T', concept: 'C', isAutopilot: true });
        current = makeActions({ initStory: freshInit }); // the re-render that follows the setters
        expect(await pending).toMatchObject({ status: 'started', title: 'T', isAutopilot: true });
        expect(staleInit).not.toHaveBeenCalled();
        expect(freshInit).toHaveBeenCalledWith(true, { fromSetup: true });
    });

    it('startNewStory does not reject when generation fails later', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { dispatch } = setup({}, { initStory: vi.fn(async () => Promise.reject(new Error('boom'))) });
        await expect(dispatch('startNewStory', { concept: 'C' })).resolves.toMatchObject({ status: 'started' });
        await Promise.resolve();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('listStories trims concepts and falls back to embedded data', async () => {
        const { dispatch } = setup();
        const result = (await dispatch('listStories')) as {
            count: number;
            stories: Array<{ id: string; title: string; concept: string; wordCount: number }>;
        };
        expect(result.count).toBe(2);
        expect(result.stories[0].concept).toHaveLength(200);
        expect(result.stories[1]).toMatchObject({ id: 'story_2', title: 'From Data', wordCount: 3 });
    });

    it('switchStory loads, normalises and activates the story', async () => {
        const { dispatch, actions } = setup();
        const result = await dispatch('switchStory', { storyId: 'story_2' });
        expect(result).toMatchObject({ success: true, storyId: 'story_2', title: 'Second' });
        expect(actions.setActiveStoryId).toHaveBeenCalledWith('story_2');
        const next = vi.mocked(actions.setStory).mock.calls[0][0];
        expect(next).toMatchObject({
            id: 'story_2',
            title: 'Second',
            relationships: {},
            graph_edges: [],
            continuity_ledger: [],
            secret_vault: []
        });
        expect(actions.setView).toHaveBeenCalledWith('dashboard');
    });

    it('triggerPipelineStep routes every supported step', async () => {
        const { dispatch, actions, state } = setup();
        expect(await dispatch('triggerPipelineStep', { action: 'step' })).toEqual({
            success: true,
            action: 'step',
            hasMore: true
        });
        expect(await dispatch('triggerPipelineStep', { action: 'autopilot_toggle' })).toEqual({
            success: true,
            continuousAutopilot: true
        });
        expect(actions.toggleContinuousAutopilot).toHaveBeenCalledTimes(1);
        await dispatch('triggerPipelineStep', { action: 'story_arc' });
        await dispatch('triggerPipelineStep', { action: 'acts_sequences' });
        await dispatch('triggerPipelineStep', { action: 'sequences' });
        await dispatch('triggerPipelineStep', { action: 'scenes', sequenceIndex: 2 });
        await dispatch('triggerPipelineStep', { action: 'prose', sequenceIndex: 1, sceneIndex: 3 });
        expect(actions.generateStoryArc).toHaveBeenCalledWith(state.story, false);
        expect(actions.generateActsAndSequences).toHaveBeenCalledWith(state.story, false);
        expect(actions.generateSequences).toHaveBeenCalledWith(state.story, false);
        expect(actions.generateScenes).toHaveBeenCalledWith(2, state.story, false);
        expect(actions.writeSceneProse).toHaveBeenCalledWith(1, 3);
    });

    it('accepts every advertised pipeline step', async () => {
        const { dispatch } = setup();
        for (const step of BRIDGE_PIPELINE_STEPS) {
            await expect(dispatch('triggerPipelineStep', { action: step })).resolves.toMatchObject({ success: true });
        }
    });

    it('injectFeedback acknowledges with a toast', async () => {
        const { dispatch, actions } = setup();
        expect(await dispatch('injectFeedback', { feedback: 'More dread.' })).toEqual({
            success: true,
            message: 'Feedback acknowledged by EllipsisProse.'
        });
        expect(actions.showToast).toHaveBeenCalledWith('Directive received from Antigravity: "More dread...."', 'info');
    });
});

describe('window.EllipsisProseBridge surface', () => {
    it('exposes the documented methods and maps positional arguments', async () => {
        const dispatch = vi.fn(async () => 'ok');
        const api = createBridgeApi(dispatch);
        expect(Object.keys(api).sort()).toEqual(['version', ...BRIDGE_ACTIONS].sort());
        expect(api.version).toBe('2.1.1');
        await api.switchStory('s9');
        await api.triggerPipelineStep('scenes', { sequenceIndex: 2 });
        await api.getChapter(1, 2);
        await api.injectFeedback('fb');
        await api.getLogs(5);
        expect(dispatch.mock.calls).toEqual([
            ['switchStory', { storyId: 's9' }],
            ['triggerPipelineStep', { action: 'scenes', sequenceIndex: 2 }],
            ['getChapter', { sequenceIndex: 1, sceneIndex: 2 }],
            ['injectFeedback', { feedback: 'fb' }],
            ['getLogs', { limit: 5 }]
        ]);
    });
});

class FakeSocket implements BridgeSocket {
    static instances: FakeSocket[] = [];
    readyState = 0;
    sent: unknown[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(public url: string) {
        FakeSocket.instances.push(this);
    }
    send(data: string): void {
        this.sent.push(JSON.parse(data));
    }
    close(): void {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({});
    }
    async open(): Promise<void> {
        this.readyState = 1;
        await this.onopen?.({});
    }
    async receive(payload: unknown): Promise<void> {
        await this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    }
}

const quietLogger = { log: () => undefined, info: () => undefined };

describe('MCP WebSocket connection', () => {
    beforeEach(() => {
        FakeSocket.instances = [];
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('pushes status on open and answers requests with results or errors', async () => {
        const { dispatch } = setup();
        const connected: boolean[] = [];
        const dispose = connectMcpBridge({
            dispatch,
            onConnectedChange: (c) => connected.push(c),
            createSocket: (url) => new FakeSocket(url),
            logger: quietLogger
        });
        const socket = FakeSocket.instances[0];
        expect(socket.url).toBe('ws://127.0.0.1:3002');
        await socket.open();
        expect(connected).toEqual([true]);
        expect(socket.sent[0]).toMatchObject({ type: 'status', payload: { storyTitle: 'The Salt Clock' } });

        await socket.receive({ id: 'r1', action: 'getLogs', params: { limit: 1 } });
        await socket.receive({ id: 'r2', action: 'bogus' });
        await socket.receive({ action: 'getStatus' }); // no id: ignored
        await socket.receive('not json'); // ignored
        expect(socket.sent.slice(1)).toEqual([
            { id: 'r1', success: true, result: { count: 1, logs: [{ n: 3 }] } },
            { id: 'r2', success: false, error: "Unrecognized bridge action: 'bogus'" }
        ]);

        dispose();
        expect(connected[connected.length - 1]).toBe(false);
        vi.advanceTimersByTime(60000);
        expect(FakeSocket.instances).toHaveLength(1); // no reconnect after dispose
    });

    it('retries three times with backoff, then pauses', () => {
        const { dispatch } = setup();
        const info = vi.fn();
        connectMcpBridge({
            dispatch,
            onConnectedChange: () => undefined,
            createSocket: (url) => new FakeSocket(url),
            logger: { log: () => undefined, info }
        });
        const delays = [3000, 6000, 12000];
        delays.forEach((delay, i) => {
            FakeSocket.instances[i].onerror?.({});
            vi.advanceTimersByTime(delay - 1);
            expect(FakeSocket.instances).toHaveLength(i + 1);
            vi.advanceTimersByTime(1);
            expect(FakeSocket.instances).toHaveLength(i + 2);
        });
        FakeSocket.instances[3].onerror?.({});
        vi.advanceTimersByTime(60000);
        expect(FakeSocket.instances).toHaveLength(4);
        expect(info).toHaveBeenCalledTimes(1);
    });
});

describe('useMcpBridge', () => {
    beforeEach(() => {
        FakeSocket.instances = [];
        delete (window as unknown as { EllipsisProseBridge?: unknown }).EllipsisProseBridge;
    });

    const createSocket = (url: string): BridgeSocket => new FakeSocket(url);

    it('registers window.EllipsisProseBridge and stays disconnected while disabled', () => {
        const { result } = renderHook(() =>
            useMcpBridge({ state: makeState(), actions: makeActions(), storyStore: makeStore(), createSocket })
        );
        const host = window as unknown as { EllipsisProseBridge?: unknown };
        expect(host.EllipsisProseBridge).toBe(result.current.bridgeApi);
        expect(result.current.enableMcpBridge).toBe(false);
        expect(result.current.isMcpConnected).toBe(false);
        expect(FakeSocket.instances).toHaveLength(0);
    });

    it('persists the toggle, connects when enabled, reconnects on retry and closes when disabled', async () => {
        const { result } = renderHook(() =>
            useMcpBridge({ state: makeState(), actions: makeActions(), storyStore: makeStore(), createSocket })
        );
        act(() => result.current.setEnableMcpBridge(true));
        expect(localStorage.getItem('ellipsisprose_enable_mcp_bridge')).toBe('true');
        expect(FakeSocket.instances).toHaveLength(1);
        await act(async () => {
            await FakeSocket.instances[0].open();
        });
        expect(result.current.isMcpConnected).toBe(true);

        act(() => result.current.setMcpRetryTrigger((n) => n + 1));
        expect(FakeSocket.instances).toHaveLength(2);
        expect(FakeSocket.instances[0].readyState).toBe(3);

        act(() => result.current.setEnableMcpBridge(false));
        expect(FakeSocket.instances[1].readyState).toBe(3);
        expect(result.current.isMcpConnected).toBe(false);
        expect(localStorage.getItem('ellipsisprose_enable_mcp_bridge')).toBe('false');
    });

    it('starts enabled when the stored flag is true', () => {
        localStorage.setItem('ellipsisprose_enable_mcp_bridge', 'true');
        const { result } = renderHook(() =>
            useMcpBridge({ state: makeState(), actions: makeActions(), storyStore: makeStore(), createSocket })
        );
        expect(result.current.enableMcpBridge).toBe(true);
        expect(FakeSocket.instances).toHaveLength(1);
    });

    it('a long-lived WebSocket acts on the latest render, not the one it connected in', async () => {
        // Regression: the connection used to capture the dispatcher (and every pipeline callback
        // and feedbackLedger) from the render in which the effect ran.
        localStorage.setItem('ellipsisprose_enable_mcp_bridge', 'true');
        const firstWrite = vi.fn(async () => undefined);
        const latestWrite = vi.fn(async () => undefined);
        const { rerender } = renderHook((props: { state: BridgeState; actions: BridgeActions }) =>
            useMcpBridge({ ...props, storyStore: makeStore(), createSocket }),
            { initialProps: { state: makeState(), actions: makeActions({ writeSceneProse: firstWrite }) } }
        );
        const socket = FakeSocket.instances[0];
        await act(async () => {
            await socket.open();
        });
        rerender({
            state: makeState({ feedbackLedger: { '1-2': ['newer note'] } }),
            actions: makeActions({ writeSceneProse: latestWrite })
        });
        expect(FakeSocket.instances).toHaveLength(1); // re-render does not reconnect

        await act(async () => {
            await socket.receive({ id: 'a', action: 'triggerPipelineStep', params: { action: 'prose' } });
            await socket.receive({ id: 'b', action: 'getChapter', params: { sequenceIndex: 0, sceneIndex: 1 } });
        });
        expect(firstWrite).not.toHaveBeenCalled();
        expect(latestWrite).toHaveBeenCalledWith(0, 0);
        expect(socket.sent[socket.sent.length - 1]).toMatchObject({
            id: 'b',
            success: true,
            result: { feedback: ['newer note'] }
        });
    });
});

describe('mcp-server contract', () => {
    it('only advertises pipeline steps the app accepts', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const source = fs.readFileSync(path.resolve(process.cwd(), 'mcp-server/index.mjs'), 'utf8');
        const block = source.slice(source.indexOf('"trigger_pipeline_step"'));
        const match = block.match(/action:\s*z\.enum\(\[([^\]]+)\]\)/);
        expect(match).not.toBeNull();
        const advertised = (match?.[1] || '').split(',').map((s) => s.trim().replace(/"/g, ''));
        expect(advertised).toEqual([...BRIDGE_PIPELINE_STEPS]);
        const sent = [...source.matchAll(/sendToBrowser\("([A-Za-z]+)"/g)].map((m) => m[1]);
        sent.forEach((action) => expect(BRIDGE_ACTIONS).toContain(action));
    });
});
