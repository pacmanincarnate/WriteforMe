/**
 * @module services/bridge/mcpBridge
 * Antigravity MCP Live Bridge: the action dispatcher behind `window.EllipsisProseBridge` and the
 * WebSocket client that relays the same actions from the local MCP server (`mcp-server/`, port 3002).
 *
 * This module is React-free. All application state is reached through injected callbacks
 * (`getState`, `getActions`), which the caller must resolve to the *latest* render's values on every
 * call. The dispatcher re-reads them after every `await`, so a long-lived consumer such as the
 * WebSocket connection never acts on a stale closure.
 */

import { countStoryWords } from '@/domain/story';
import { migrateStoryToSequences } from '@/domain/lifecycle';
import { safeLocalStorageSet } from '@/utils';

export const BRIDGE_VERSION = '2.1.1';
export const DEFAULT_MCP_BRIDGE_URL = 'ws://127.0.0.1:3002';
export const MCP_BRIDGE_MAX_RETRIES = 3;

export const BRIDGE_PROVIDERS = ['gemini', 'openrouter', 'nanogpt', 'koboldcpp', 'codex', 'claude'] as const;
export type BridgeProvider = (typeof BRIDGE_PROVIDERS)[number];

/** Sub-actions accepted by `triggerPipelineStep`. Keep in sync with the enum in `mcp-server/index.mjs`. */
export const BRIDGE_PIPELINE_STEPS = [
    'step',
    'autopilot_toggle',
    'story_arc',
    'acts_sequences',
    'sequences',
    'scenes',
    'prose'
] as const;
export type BridgePipelineStep = (typeof BRIDGE_PIPELINE_STEPS)[number];

export const BRIDGE_ACTIONS = [
    'getStatus',
    'getModelConfig',
    'setModelConfig',
    'startNewStory',
    'getActiveStory',
    'listStories',
    'switchStory',
    'getPipelineStatus',
    'triggerPipelineStep',
    'getChapter',
    'injectFeedback',
    'getLogs'
] as const;
export type BridgeAction = (typeof BRIDGE_ACTIONS)[number];

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface BridgeScene {
    scene_number?: number | string;
    number?: number | string;
    title?: unknown;
    summary?: unknown;
    conflict?: unknown;
    setting?: unknown;
    characterIds?: unknown[];
    prose?: string;
    [key: string]: unknown;
}

export interface BridgeSequence {
    sequence_number?: number | string;
    number?: number | string;
    title?: unknown;
    parent_act?: unknown;
    act?: unknown;
    dramatic_question?: unknown;
    scenes?: BridgeScene[];
    [key: string]: unknown;
}

export interface BridgeStory {
    title?: string;
    concept?: string;
    writingMode?: string;
    acts?: unknown[];
    characters?: Array<{
        name?: unknown;
        role?: unknown;
        archetype?: unknown;
        summary?: unknown;
        bio?: unknown;
        [key: string]: unknown;
    }>;
    sequences?: BridgeSequence[];
    prose?: Record<string, string>;
    beats?: Record<string, unknown>;
    [key: string]: unknown;
}

/** Read-only snapshot of the app state the bridge reports on. */
export interface BridgeState {
    story: BridgeStory | null | undefined;
    activeStoryId: string | null | undefined;
    apiProvider: string;
    devProvider: string;
    devModel: string;
    reviewProvider: string;
    reviewModel: string;
    proseProvider: string;
    proseModel: string;
    geminiModel: string;
    openRouterModel: string;
    nanoGptModel: string;
    koboldModel: string;
    codexModel: string;
    claudeModel: string;
    apiKey: string;
    openRouterKey: string;
    nanoGptKey: string;
    koboldUrl: string;
    codexUrl: string;
    claudeUrl: string;
    loading: boolean;
    loadingStep: string;
    continuousAutopilot: boolean;
    view: string;
    inputTitle: string;
    inputConcept: string;
    inputWritingMode: string;
    promptLog: unknown[];
    feedbackLedger: Record<string, unknown> | null | undefined;
}

export interface BridgeStoryStoreRecord {
    id: string;
    title?: string;
    concept?: string;
    wordCount?: number;
    lastModified?: unknown;
    data?: BridgeStory & { lastModified?: unknown };
    [key: string]: unknown;
}

export interface BridgeStoryStore {
    listStories: () => Promise<BridgeStoryStoreRecord[]>;
    loadStory: (id: string) => Promise<(BridgeStory & Record<string, unknown>) | null>;
}

type Setter<T = string> = (value: T) => void;

/** Everything the bridge is allowed to do to the app. */
export interface BridgeActions {
    setApiProvider: Setter;
    setDevProvider: Setter;
    setDevModel: Setter;
    setReviewProvider: Setter;
    setReviewModel: Setter;
    setProseProvider: Setter;
    setProseModel: Setter;
    setGeminiModel: Setter;
    setOpenRouterModel: Setter;
    setNanoGptModel: Setter;
    setKoboldModel: Setter;
    setCodexModel: Setter;
    setClaudeModel: Setter;
    setApiKey: Setter;
    setOpenRouterKey: Setter;
    setNanoGptKey: Setter;
    setKoboldUrl: Setter;
    setCodexUrl: Setter;
    setClaudeUrl: Setter;
    setInputTitle: Setter;
    setInputConcept: Setter;
    setInputAuthorNote: Setter;
    setInputWritingMode: Setter;
    setActiveStoryId: Setter;
    setStory: (story: Record<string, unknown>) => void;
    setView: Setter;
    clearImportedLore: () => void;
    showToast: (message: string, variant?: ToastVariant) => void;
    getDefaultModelForProvider: (provider: string) => string;
    initStory: (isAutopilot: boolean, options: { fromSetup: boolean }) => Promise<unknown>;
    runContinuousAutopilotStep: () => Promise<unknown>;
    toggleContinuousAutopilot: () => void;
    generateStoryArc: (story: BridgeStory | null | undefined, isAutopilot: boolean) => Promise<unknown>;
    generateActsAndSequences: (story: BridgeStory | null | undefined, isAutopilot: boolean) => Promise<unknown>;
    generateSequences: (story: BridgeStory | null | undefined, isAutopilot: boolean) => Promise<unknown>;
    generateScenes: (
        sequenceIndex: number,
        story: BridgeStory | null | undefined,
        isAutopilot: boolean
    ) => Promise<unknown>;
    writeSceneProse: (sequenceIndex: number, sceneIndex: number) => Promise<unknown>;
}

export interface BridgeDeps {
    /** Must return the latest state on every call. */
    getState: () => BridgeState;
    /** Must return the latest callbacks on every call (they close over render state). */
    getActions: () => BridgeActions;
    /** Story library. When it resolves to nothing, library actions fail with a clear error. */
    getStoryStore: () => BridgeStoryStore | null | undefined;
    /** Delay between filling the Setup form and starting generation, so the app can re-render. */
    setupSettleMs?: number;
    now?: () => number;
}

export type BridgeParams = Record<string, unknown>;
export type BridgeDispatch = (action: string, params?: BridgeParams | null) => Promise<unknown>;

const wordCountOf = (prose: string): number => (prose ? prose.trim().split(/\s+/).length : 0);

const sceneKey = (seq: BridgeSequence, scene: BridgeScene): string =>
    `${seq.sequence_number || seq.number}-${scene.scene_number || scene.number}`;

const sceneProse = (story: BridgeStory, seq: BridgeSequence, scene: BridgeScene): string =>
    scene.prose || (story.prose && story.prose[sceneKey(seq, scene)]) || '';

/**
 * Builds the bridge action dispatcher. Behaviour (result shapes, error messages, toasts and
 * localStorage writes) is the public contract used by `mcp-server/` and the golden suite.
 */
export function createBridgeDispatcher(deps: BridgeDeps): BridgeDispatch {
    const now = deps.now || (() => Date.now());
    const setupSettleMs = deps.setupSettleMs ?? 120;

    return async function handleBridgeAction(action, rawParams) {
        const params: BridgeParams = rawParams || {};
        const s = deps.getState();
        const a = deps.getActions();

        switch (action) {
            case 'getStatus': {
                return {
                    connected: true,
                    activeStoryId: s.activeStoryId || null,
                    storyTitle: s.story?.title || s.inputTitle || 'Untitled Story',
                    view: s.view,
                    apiProvider: s.apiProvider,
                    devModel: s.devModel || s.geminiModel,
                    loading: s.loading,
                    loadingStep: s.loadingStep,
                    continuousAutopilot: s.continuousAutopilot,
                    totalWords: countStoryWords(s.story),
                    sequencesCount: (s.story?.sequences || []).length,
                    chaptersCount: (s.story?.sequences || []).reduce(
                        (acc, sq) => acc + (sq.scenes || []).length,
                        0
                    ),
                    timestamp: now()
                };
            }

            case 'getModelConfig': {
                return {
                    apiProvider: s.apiProvider,
                    devProvider: s.devProvider || s.apiProvider,
                    devModel: s.devModel || a.getDefaultModelForProvider(s.devProvider || s.apiProvider),
                    reviewProvider: s.reviewProvider || '',
                    reviewModel: s.reviewModel || '',
                    proseProvider: s.proseProvider || '',
                    proseModel: s.proseModel || '',
                    geminiModel: s.geminiModel,
                    openRouterModel: s.openRouterModel,
                    nanoGptModel: s.nanoGptModel,
                    koboldModel: s.koboldModel,
                    codexModel: s.codexModel,
                    claudeModel: s.claudeModel,
                    hasGeminiKey: Boolean(s.apiKey),
                    hasOpenRouterKey: Boolean(s.openRouterKey),
                    hasNanoGptKey: Boolean(s.nanoGptKey),
                    koboldUrl: s.koboldUrl,
                    codexUrl: s.codexUrl,
                    claudeUrl: s.claudeUrl
                };
            }

            case 'setModelConfig': {
                const provider = params.provider as string | undefined;
                const model = params.model as string | undefined;
                const role = (params.role as string | undefined) ?? 'all';
                const newApiKey = params.apiKey as string | undefined;
                const baseUrl = params.baseUrl as string | undefined;
                if (!provider) throw new Error("Missing 'provider' in setModelConfig.");

                if (!(BRIDGE_PROVIDERS as readonly string[]).includes(provider)) {
                    throw new Error(
                        `Invalid provider '${provider}'. Must be one of: ${BRIDGE_PROVIDERS.join(', ')}`
                    );
                }

                // Apply provider & role logic
                if (role === 'all' || role === 'dev') {
                    a.setApiProvider(provider);
                    safeLocalStorageSet('ellipsisprose_api_provider', provider);
                    a.setDevProvider(provider);
                    safeLocalStorageSet('ellipsisprose_dev_provider', provider);
                    if (model) {
                        a.setDevModel(model);
                        safeLocalStorageSet('ellipsisprose_dev_model', model);
                    }
                }
                if (role === 'review') {
                    a.setReviewProvider(provider);
                    safeLocalStorageSet('ellipsisprose_review_provider', provider);
                    if (model) {
                        a.setReviewModel(model);
                        safeLocalStorageSet('ellipsisprose_review_model', model);
                    }
                }
                if (role === 'prose') {
                    a.setProseProvider(provider);
                    safeLocalStorageSet('ellipsisprose_prose_provider', provider);
                    if (model) {
                        a.setProseModel(model);
                        safeLocalStorageSet('ellipsisprose_prose_model', model);
                    }
                }

                // Provider-specific model defaults
                if (model) {
                    if (provider === 'gemini') {
                        a.setGeminiModel(model);
                        safeLocalStorageSet('ellipsisprose_gemini_model', model);
                    }
                    if (provider === 'openrouter') {
                        a.setOpenRouterModel(model);
                        safeLocalStorageSet('ellipsisprose_openrouter_model', model);
                    }
                    if (provider === 'nanogpt') {
                        a.setNanoGptModel(model);
                        safeLocalStorageSet('ellipsisprose_nanogpt_model', model);
                    }
                    if (provider === 'koboldcpp') {
                        a.setKoboldModel(model);
                        safeLocalStorageSet('ellipsisprose_kobold_model', model);
                    }
                    if (provider === 'codex') {
                        a.setCodexModel(model);
                        safeLocalStorageSet('ellipsisprose_codex_model', model);
                    }
                    if (provider === 'claude') {
                        a.setClaudeModel(model);
                        safeLocalStorageSet('ellipsisprose_claude_model', model);
                    }
                }

                // API keys
                if (newApiKey) {
                    if (provider === 'gemini') {
                        a.setApiKey(newApiKey);
                        safeLocalStorageSet('gemini_api_key', newApiKey);
                    }
                    if (provider === 'openrouter') {
                        a.setOpenRouterKey(newApiKey);
                        safeLocalStorageSet('ellipsisprose_openrouter_key', newApiKey);
                    }
                    if (provider === 'nanogpt') {
                        a.setNanoGptKey(newApiKey);
                        safeLocalStorageSet('ellipsisprose_nanogpt_key', newApiKey);
                    }
                }

                // Base URLs
                if (baseUrl) {
                    if (provider === 'koboldcpp') {
                        a.setKoboldUrl(baseUrl);
                        safeLocalStorageSet('ellipsisprose_kobold_url', baseUrl);
                    }
                    if (provider === 'codex') {
                        a.setCodexUrl(baseUrl);
                        safeLocalStorageSet('ellipsisprose_codex_url', baseUrl);
                    }
                    if (provider === 'claude') {
                        a.setClaudeUrl(baseUrl);
                        safeLocalStorageSet('ellipsisprose_claude_url', baseUrl);
                    }
                }

                a.showToast(
                    `API configuration updated: ${provider.toUpperCase()}${model ? ' (' + model + ')' : ''} for ${role.toUpperCase()}`,
                    'success'
                );

                return {
                    success: true,
                    provider,
                    model: model || a.getDefaultModelForProvider(provider),
                    role,
                    message: `Successfully set ${provider} as ${role} provider.`
                };
            }

            case 'startNewStory': {
                const title = (params.title as string | undefined) ?? '';
                const concept = params.concept as string | undefined;
                const writingMode = (params.writingMode as string | undefined) ?? 'novel';
                const autoStart = (params.autoStart as boolean | undefined) ?? true;
                const isAutopilot = (params.isAutopilot as boolean | undefined) ?? false;
                if (!concept || !concept.trim()) {
                    throw new Error("Missing 'concept' parameter for startNewStory.");
                }

                const cleanConcept = concept.trim();
                const cleanTitle = (title && title.trim()) || 'Untitled Novel';

                a.setInputTitle(cleanTitle);
                a.setInputConcept(cleanConcept);
                a.setInputAuthorNote('');
                a.setInputWritingMode(writingMode);
                a.clearImportedLore();
                a.setView('setup');

                if (autoStart) {
                    await new Promise((r) => setTimeout(r, setupSettleMs));
                    // Launch story initialization pipeline. `initStory` reads the Setup form through
                    // render state, so it MUST be the callback from the render that followed the
                    // setters above, not the one captured before the wait.
                    deps
                        .getActions()
                        .initStory(Boolean(isAutopilot), { fromSetup: true })
                        .catch((err: unknown) => {
                            console.error('[Antigravity Bridge] initStory error:', err);
                        });
                    return {
                        success: true,
                        status: 'started',
                        title: cleanTitle,
                        writingMode,
                        autoStart: true,
                        isAutopilot: Boolean(isAutopilot),
                        message: `Initialized and started generation for "${cleanTitle}".`
                    };
                }

                return {
                    success: true,
                    status: 'ready',
                    title: cleanTitle,
                    writingMode,
                    autoStart: false,
                    message: `Prepared story canvas for "${cleanTitle}". Ready for pipeline execution.`
                };
            }

            case 'getActiveStory': {
                const includeFullProse = (params.includeFullProse as boolean | undefined) ?? false;
                const currStory = s.story;
                if (!currStory) {
                    return { story: null, message: 'No active story loaded.' };
                }

                return {
                    id: s.activeStoryId,
                    title: currStory.title || s.inputTitle || 'Untitled Story',
                    concept: currStory.concept || s.inputConcept || '',
                    writingMode: currStory.writingMode || 'novel',
                    acts: currStory.acts || [],
                    characters: (currStory.characters || []).map((c) => ({
                        name: c.name,
                        role: c.role,
                        archetype: c.archetype,
                        summary: c.summary || c.bio || ''
                    })),
                    sequences: (currStory.sequences || []).map((seq) => ({
                        number: seq.sequence_number || seq.number,
                        title: seq.title,
                        act: seq.parent_act || seq.act,
                        dramatic_question: seq.dramatic_question,
                        scenes: (seq.scenes || []).map((sc) => {
                            const prose = sceneProse(currStory, seq, sc);
                            return {
                                number: sc.scene_number || sc.number,
                                title: sc.title,
                                summary: sc.summary,
                                wordCount: wordCountOf(prose),
                                hasProse: Boolean(prose),
                                prose: includeFullProse ? prose : undefined
                            };
                        })
                    })),
                    totalWords: countStoryWords(currStory)
                };
            }

            case 'listStories': {
                const store = deps.getStoryStore();
                if (!store) {
                    throw new Error('StoryStore persistence is unavailable.');
                }
                const rawStories = await store.listStories();
                const list = (rawStories || []).map((item) => ({
                    id: item.id,
                    title: item.title || item.data?.title || 'Untitled',
                    concept: (item.concept || item.data?.concept || '').slice(0, 200),
                    wordCount: item.wordCount || (item.data ? countStoryWords(item.data) : 0),
                    lastModified: item.lastModified || item.data?.lastModified || null
                }));
                return { count: list.length, stories: list };
            }

            case 'switchStory': {
                const storyId = params.storyId as string | undefined;
                if (!storyId) throw new Error("Missing 'storyId' to switch.");
                const store = deps.getStoryStore();
                if (!store) throw new Error('StoryStore persistence is unavailable.');

                const targetData = await store.loadStory(storyId);
                if (!targetData) {
                    throw new Error(`Story with ID '${storyId}' not found in library.`);
                }

                const migrated = migrateStoryToSequences(targetData) as Record<string, unknown>;
                const after = deps.getActions();
                after.setActiveStoryId(storyId);
                after.setStory({
                    relationships: {},
                    graph_edges: [],
                    ...migrated,
                    continuity_ledger: Array.isArray(migrated?.continuity_ledger)
                        ? migrated.continuity_ledger
                        : [],
                    secret_vault: Array.isArray(migrated?.secret_vault) ? migrated.secret_vault : [],
                    id: storyId
                });
                after.setView('dashboard');
                after.showToast(`Switched active story to "${targetData.title || storyId}"`, 'success');

                return {
                    success: true,
                    storyId,
                    title: targetData.title || 'Untitled',
                    message: `Successfully loaded story "${targetData.title || storyId}".`
                };
            }

            case 'getPipelineStatus': {
                return {
                    loading: s.loading,
                    loadingStep: s.loadingStep,
                    continuousAutopilot: s.continuousAutopilot,
                    activeStoryId: s.activeStoryId,
                    storyTitle: s.story?.title || 'Untitled'
                };
            }

            case 'triggerPipelineStep': {
                const subAction = params.action as string | undefined;
                const sequenceIndex = (params.sequenceIndex as number | undefined) ?? 0;
                const sceneIndex = (params.sceneIndex as number | undefined) ?? 0;
                if (subAction === 'step') {
                    const hasMore = await a.runContinuousAutopilotStep();
                    return { success: true, action: 'step', hasMore };
                } else if (subAction === 'autopilot_toggle') {
                    a.toggleContinuousAutopilot();
                    return { success: true, continuousAutopilot: !s.continuousAutopilot };
                } else if (subAction === 'story_arc') {
                    await a.generateStoryArc(s.story, false);
                    return { success: true, action: 'story_arc' };
                } else if (subAction === 'acts_sequences') {
                    await a.generateActsAndSequences(s.story, false);
                    return { success: true, action: 'acts_sequences' };
                } else if (subAction === 'sequences') {
                    await a.generateSequences(s.story, false);
                    return { success: true, action: 'sequences' };
                } else if (subAction === 'scenes') {
                    await a.generateScenes(sequenceIndex, s.story, false);
                    return { success: true, action: 'scenes', sequenceIndex };
                } else if (subAction === 'prose') {
                    await a.writeSceneProse(sequenceIndex, sceneIndex);
                    return { success: true, action: 'prose', sequenceIndex, sceneIndex };
                }
                throw new Error(`Unknown pipeline step action: '${subAction}'`);
            }

            case 'getChapter': {
                const sequenceIndex = (params.sequenceIndex as number | undefined) ?? 0;
                const sceneIndex = (params.sceneIndex as number | undefined) ?? 0;
                const story = s.story;
                const seq = story?.sequences?.[sequenceIndex];
                if (!story || !seq) throw new Error(`Sequence ${sequenceIndex} not found in active story.`);
                const scene = seq.scenes?.[sceneIndex];
                if (!scene) throw new Error(`Scene ${sceneIndex} in sequence ${sequenceIndex} not found.`);

                const sKey = sceneKey(seq, scene);
                const prose = sceneProse(story, seq, scene);
                const beats = story.beats?.[sKey] || [];
                const feedback = s.feedbackLedger?.[sKey] || null;

                return {
                    sequenceNumber: seq.sequence_number || seq.number,
                    sequenceTitle: seq.title,
                    sceneNumber: scene.scene_number || scene.number,
                    sceneTitle: scene.title,
                    summary: scene.summary,
                    conflict: scene.conflict,
                    setting: scene.setting,
                    characterIds: scene.characterIds || [],
                    wordCount: wordCountOf(prose),
                    beats,
                    feedback,
                    prose
                };
            }

            case 'injectFeedback': {
                const feedback = params.feedback as string | undefined;
                if (!feedback) throw new Error("Missing 'feedback' text.");
                a.showToast(`Directive received from Antigravity: "${feedback.slice(0, 60)}..."`, 'info');
                return { success: true, message: 'Feedback acknowledged by EllipsisProse.' };
            }

            case 'getLogs': {
                const limit = (params.limit as number | undefined) ?? 20;
                const logs = (s.promptLog || []).slice(-limit);
                return { count: logs.length, logs };
            }

            default:
                throw new Error(`Unrecognized bridge action: '${action}'`);
        }
    };
}

/** The object published as `window.EllipsisProseBridge` (DevTools and external automation). */
export interface EllipsisProseBridgeApi {
    version: string;
    getStatus: () => Promise<unknown>;
    getModelConfig: () => Promise<unknown>;
    setModelConfig: (params?: BridgeParams) => Promise<unknown>;
    startNewStory: (params?: BridgeParams) => Promise<unknown>;
    getActiveStory: (params?: BridgeParams) => Promise<unknown>;
    listStories: () => Promise<unknown>;
    switchStory: (storyId: string) => Promise<unknown>;
    getPipelineStatus: () => Promise<unknown>;
    triggerPipelineStep: (action: string, opts?: BridgeParams) => Promise<unknown>;
    getChapter: (sequenceIndex?: number, sceneIndex?: number) => Promise<unknown>;
    injectFeedback: (feedback: string) => Promise<unknown>;
    getLogs: (limit?: number) => Promise<unknown>;
}

export function createBridgeApi(dispatch: BridgeDispatch): EllipsisProseBridgeApi {
    return {
        version: BRIDGE_VERSION,
        getStatus: () => dispatch('getStatus'),
        getModelConfig: () => dispatch('getModelConfig'),
        setModelConfig: (p) => dispatch('setModelConfig', p),
        startNewStory: (p) => dispatch('startNewStory', p),
        getActiveStory: (p) => dispatch('getActiveStory', p),
        listStories: () => dispatch('listStories'),
        switchStory: (id) => dispatch('switchStory', { storyId: id }),
        getPipelineStatus: () => dispatch('getPipelineStatus'),
        triggerPipelineStep: (a, opts) => dispatch('triggerPipelineStep', { action: a, ...opts }),
        getChapter: (sq, sc) => dispatch('getChapter', { sequenceIndex: sq, sceneIndex: sc }),
        injectFeedback: (fb) => dispatch('injectFeedback', { feedback: fb }),
        getLogs: (l) => dispatch('getLogs', { limit: l })
    };
}

/** Minimal WebSocket surface the bridge client needs (lets tests inject a fake). */
export interface BridgeSocket {
    readyState: number;
    send: (data: string) => void;
    close: () => void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
}

export interface McpBridgeConnectionOptions {
    dispatch: BridgeDispatch;
    onConnectedChange: (connected: boolean) => void;
    url?: string;
    maxRetries?: number;
    createSocket?: (url: string) => BridgeSocket;
    logger?: Pick<Console, 'log' | 'info'>;
}

const SOCKET_OPEN = 1;

/**
 * Opens the WebSocket to the local MCP relay, answers `{ id, action, params }` requests with
 * `{ id, success, result | error }`, and reconnects with backoff (3 attempts, then pauses until
 * the caller reconnects). Returns a dispose function.
 */
export function connectMcpBridge(options: McpBridgeConnectionOptions): () => void {
    const {
        dispatch,
        onConnectedChange,
        url = DEFAULT_MCP_BRIDGE_URL,
        maxRetries = MCP_BRIDGE_MAX_RETRIES,
        createSocket = (target: string) => new WebSocket(target) as unknown as BridgeSocket,
        logger = console
    } = options;

    let ws: BridgeSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let retryCount = 0;

    const connect = (): void => {
        if (isDisposed) return;
        try {
            const socket = createSocket(url);
            ws = socket;

            socket.onopen = async () => {
                if (isDisposed) {
                    try {
                        socket.close();
                    } catch {
                        /* already closed */
                    }
                    return;
                }
                logger.log('[Antigravity Bridge] Connected to MCP server on port 3002');
                onConnectedChange(true);
                retryCount = 0;
                try {
                    const status = await dispatch('getStatus');
                    socket.send(JSON.stringify({ type: 'status', payload: status }));
                } catch {
                    /* status push is best-effort */
                }
            };

            socket.onmessage = async (evt) => {
                let msg: { id?: unknown; action?: unknown; params?: unknown };
                try {
                    msg = JSON.parse(String(evt.data));
                } catch {
                    return;
                }
                const { id, action, params } = msg || {};
                if (!id) return;

                try {
                    const result = await dispatch(String(action), params as BridgeParams | undefined);
                    if (ws && ws.readyState === SOCKET_OPEN) {
                        ws.send(JSON.stringify({ id, success: true, result }));
                    }
                } catch (err) {
                    if (ws && ws.readyState === SOCKET_OPEN) {
                        ws.send(
                            JSON.stringify({
                                id,
                                success: false,
                                error: (err as { message?: string } | null)?.message || String(err)
                            })
                        );
                    }
                }
            };

            socket.onclose = () => {
                onConnectedChange(false);
                ws = null;
                if (!isDisposed) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        const delay = Math.min(3000 * Math.pow(2, retryCount - 1), 15000);
                        reconnectTimer = setTimeout(connect, delay);
                    } else {
                        logger.info(
                            '[Antigravity Bridge] MCP server on port 3002 not reachable. Polling paused. Use Settings -> Pipeline to reconnect.'
                        );
                    }
                }
            };

            socket.onerror = () => {
                // Silently close on error so onclose manages backoff
                try {
                    socket.close();
                } catch {
                    /* already closed */
                }
            };
        } catch {
            onConnectedChange(false);
            if (!isDisposed) {
                retryCount++;
                if (retryCount <= maxRetries) {
                    reconnectTimer = setTimeout(connect, 3000 * retryCount);
                }
            }
        }
    };

    connect();

    return () => {
        isDisposed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) {
            try {
                ws.close();
            } catch {
                /* already closed */
            }
        }
        onConnectedChange(false);
    };
}
