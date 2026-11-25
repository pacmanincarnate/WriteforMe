import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchAI, type PromptLogEntry } from '@/pipeline';
import {
    CLAUDE_BRIDGE_CLI_MISSING,
    CLAUDE_BRIDGE_SIGNED_OUT,
    callKoboldCPP,
    fetchClaudeCatalog,
    getDefaultModelForProvider,
    getEffectiveModelConfig
} from '@/services/llm';
import { readInitialSettingsState } from '@/stores';
import { CLI_BRIDGE_DEFAULT_URLS, isCliBridgeProvider, isLocalProvider } from '@/types';

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A Claude Code bridge on its default port, with a configurable /health body. */
function stubBridge(health: Record<string, unknown> | null): Array<{ url: string; body: Record<string, unknown> }> {
    const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (!url.startsWith('http://localhost:5011')) return json({}, 404);
            if (url.endsWith('/v1/models')) return json({ data: [{ id: 'sonnet' }, { id: 'opus' }] });
            if (url.endsWith('/health')) return health ? json(health) : json({}, 500);
            if (url.endsWith('/v1/chat/completions')) {
                const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
                sent.push({ url, body });
                return json({
                    model: body.model,
                    choices: [{ finish_reason: 'stop', message: { content: 'Prose.' } }],
                    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
                });
            }
            return json({}, 404);
        })
    );
    return sent;
}

describe('Claude Code provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('is a local CLI bridge provider with its own port and default model', () => {
        expect(isCliBridgeProvider('claude')).toBe(true);
        expect(isCliBridgeProvider('codex')).toBe(true);
        expect(isCliBridgeProvider('koboldcpp')).toBe(false);
        expect(isLocalProvider('claude')).toBe(true);
        expect(isLocalProvider('koboldcpp')).toBe(true);
        expect(isLocalProvider('gemini')).toBe(false);
        expect(CLI_BRIDGE_DEFAULT_URLS).toEqual({ codex: 'http://localhost:5010', claude: 'http://localhost:5011' });

        expect(getDefaultModelForProvider('claude')).toBe('sonnet');
        expect(getDefaultModelForProvider('claude', { claudeModel: 'opus' })).toBe('opus');
        expect(getEffectiveModelConfig('prose', { apiProvider: 'gemini', proseProvider: 'claude' })).toEqual({
            provider: 'claude',
            model: 'sonnet',
            isFallback: true
        });
    });

    it('never defaults the embedding provider to Claude Code, which cannot embed', () => {
        localStorage.setItem('ellipsisprose_api_provider', 'claude');
        const state = readInitialSettingsState();
        expect(state.apiProvider).toBe('claude');
        expect(state.embeddingProvider).toBe('gemini');
        expect(state.claudeUrl).toBe('http://localhost:5011');
        expect(state.claudeModel).toBe('sonnet');
    });

    it('reports the bridge online only when the CLI behind it is installed and signed in', async () => {
        stubBridge({ ok: true, claude: '2.1.0 (Claude Code)', login: { loggedIn: true, method: 'claude.ai' } });
        const online = await fetchClaudeCatalog('');
        expect(online.status).toEqual({ online: true, model: 'sonnet', error: null });
        expect(online.models.map((m) => m.id)).toEqual(['sonnet', 'opus']);

        stubBridge({ ok: true, claude: '2.1.0 (Claude Code)', login: { loggedIn: false, method: '' } });
        expect((await fetchClaudeCatalog('http://localhost:5011/')).status).toEqual({
            online: false,
            model: null,
            error: CLAUDE_BRIDGE_SIGNED_OUT
        });

        stubBridge({ ok: true, claude: null, login: { loggedIn: false, method: '' } });
        expect((await fetchClaudeCatalog('http://localhost:5011')).status.error).toBe(CLAUDE_BRIDGE_CLI_MISSING);

        // A bridge that predates /health login reporting still counts as online.
        stubBridge(null);
        expect((await fetchClaudeCatalog('http://localhost:5011')).status.online).toBe(true);

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
        const offline = await fetchClaudeCatalog('http://localhost:5011');
        expect(offline.status.online).toBe(false);
        expect(offline.models).toEqual([]);
    });

    it('sends the chosen alias untouched instead of the loaded KoboldCPP model', async () => {
        const sent = stubBridge(null);
        const text = await callKoboldCPP('http://localhost:5011', 'opus', 'p', 's', false, { provider: 'claude' });
        expect(text).toBe('Prose.');
        expect(sent[0].url).toBe('http://localhost:5011/v1/chat/completions');
        expect(sent[0].body.model).toBe('opus');
        expect(sent[0].body.messages).toEqual([
            { role: 'system', content: 's' },
            { role: 'user', content: 'p' }
        ]);
    });

    it('dispatches a pipeline call to the Claude Code bridge', async () => {
        const sent = stubBridge(null);
        const logs: PromptLogEntry[] = [];
        const setPromptLog = (updater: (prev: PromptLogEntry[]) => PromptLogEntry[]): void => {
            const next = updater(logs);
            logs.splice(0, logs.length, ...next);
        };

        const res = await dispatchAI(
            {
                prompt: 'Draft beat',
                systemPrompt: 'System',
                isJson: false,
                logName: 'Writing Agent Scene 1',
                modelRoleOrSize: 'prose'
            },
            {
                modelSettings: { apiProvider: 'claude', devProvider: 'claude', claudeModel: 'opus' },
                thinkingSettings: {}
            },
            {
                setCurrentPipelineStep: vi.fn(),
                setPromptLog,
                showToast: vi.fn(),
                sleepFn: async () => {}
            }
        );

        expect(res).toBe('Prose.');
        expect(sent).toHaveLength(1);
        expect(sent[0].url).toBe('http://localhost:5011/v1/chat/completions');
        expect(sent[0].body.model).toBe('opus');
        expect(logs[0]?.status).toBe('success');
        expect(logs[0]?.modelUsed).toBe('opus');
        expect(logs[0]?.parameters).toMatchObject({
            provider: 'claude',
            endpoint: 'http://localhost:5011/v1/chat/completions',
            timeoutSeconds: 900
        });
    });

    it('honours a custom bridge URL from settings', async () => {
        const seen: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                seen.push(String(input));
                return json({ model: 'sonnet', choices: [{ message: { content: 'ok' } }] });
            })
        );
        await dispatchAI(
            { prompt: 'p', systemPrompt: 's', isJson: false, logName: 'Scene Agent', modelRoleOrSize: 'dev' },
            { modelSettings: { apiProvider: 'claude' }, thinkingSettings: {}, claudeUrl: 'http://127.0.0.1:7000' },
            { setCurrentPipelineStep: vi.fn(), setPromptLog: vi.fn(), showToast: vi.fn(), sleepFn: async () => {} }
        );
        expect(seen).toEqual(['http://127.0.0.1:7000/v1/chat/completions']);
    });
});
