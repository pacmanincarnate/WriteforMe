import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capPause, checkpointPause, cleanSpendCap, cleanTokenCapK } from '@/domain/autopilot/limits';
import { autopilotCapPause, autopilotCheckpointPause, billedProviders } from '@/pipeline/autopilotLimits';
import {
    clearBalanceCache,
    fetchProviderBalance,
    formatBalanceItem,
    getUsageMeter,
    noteModelUsage,
    noteModelUsageFrom,
    resetUsageMeter
} from '@/services/llm';
import { normalizeFeatureOptions, useFeatureOptionsStore, useSettingsStore } from '@/stores';
import { SettingsAutopilotLimits } from '@/views/settings/SettingsAutopilotLimits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** An OpenRouter account whose usage figure can be moved between readings. */
function openRouterAccount(start: { total: number; used: number }) {
    const account = { ...start };
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith('/credits')) return json({ data: { total_credits: account.total, total_usage: account.used } });
        if (u.endsWith('/key')) return json({ data: { limit: 20, limit_remaining: 12.5, usage_daily: 1.2 } });
        if (u.endsWith('/api/check-balance')) return json({ usd_balance: '7.25' });
        return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { account, fetchMock };
}

const setOptions = (patch: Record<string, unknown>): void => {
    const store = useFeatureOptionsStore.getState();
    for (const [key, value] of Object.entries(patch)) store.setOption(key as never, value as never);
};

beforeEach(() => {
    clearBalanceCache();
    resetUsageMeter();
    setOptions({ autopilotPauseAt: 'never', autopilotTokenCap: 0, autopilotSpendCap: 0 });
    useSettingsStore.setState({
        apiProvider: 'openrouter',
        devProvider: '',
        proseProvider: '',
        reviewProvider: '',
        openRouterKey: 'sk-or-test',
        nanoGptKey: ''
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('checkpoints', () => {
    const acts = [1, 1, 2, 2, 2, 2, 3, 3];
    const at = (seqIdx: number, sceneIdx: number, scenesInSequence = 3) => ({ seqIdx, sceneIdx, scenesInSequence, sequenceActs: acts });

    it('never pauses unless asked', () => {
        expect(checkpointPause('never', at(1, 2))).toBe('');
    });

    it('pauses after every scene, sequence or act as set', () => {
        expect(checkpointPause('scene', at(0, 0))).toContain('paused after Sequence 1, Scene 1');
        expect(checkpointPause('sequence', at(0, 1))).toBe('');
        expect(checkpointPause('sequence', at(0, 2))).toContain('end of Sequence 1');
        // Sequence 1 ends but Act 1 goes on into Sequence 2.
        expect(checkpointPause('act', at(0, 2))).toBe('');
        expect(checkpointPause('act', at(1, 2))).toContain('end of Act 1');
        expect(checkpointPause('act', at(7, 2))).toContain('end of Act 3');
        expect(checkpointPause('act', at(7, 1))).toBe('');
    });

    it('reads the setting from the options store', () => {
        setOptions({ autopilotPauseAt: 'sequence' });
        expect(autopilotCheckpointPause(at(2, 2))).toContain('end of Sequence 3');
        expect(autopilotCheckpointPause(at(2, 0))).toBe('');
    });
});

describe('caps', () => {
    it('pauses on tokens or money, whichever is passed first', () => {
        expect(capPause({ tokenCapK: 0, spendCap: 0 }, { tokens: 9_000_000, spent: 99 })).toBe('');
        expect(capPause({ tokenCapK: 200, spendCap: 0 }, { tokens: 199_999, spent: null })).toBe('');
        expect(capPause({ tokenCapK: 200, spendCap: 0 }, { tokens: 200_000, spent: null })).toContain('200,000 tokens');
        expect(capPause({ tokenCapK: 0, spendCap: 2 }, { tokens: 5, spent: 1.99 })).toBe('');
        expect(capPause({ tokenCapK: 0, spendCap: 2 }, { tokens: 5, spent: 2.004 })).toContain('spent $2.00, past your cap of $2.00');
        // A provider that reports no spending cannot trip the money cap.
        expect(capPause({ tokenCapK: 0, spendCap: 2 }, { tokens: 5, spent: null })).toBe('');
    });

    it('cleans what is typed into the settings fields', () => {
        expect(cleanTokenCapK('250')).toBe(250);
        expect(cleanTokenCapK('-5')).toBe(0);
        expect(cleanTokenCapK('abc')).toBe(0);
        expect(cleanSpendCap('2.499')).toBe(2.5);
        expect(cleanSpendCap('')).toBe(0);
        const stored = normalizeFeatureOptions({ autopilotPauseAt: 'chapter', autopilotTokenCap: -3, autopilotSpendCap: 1.239 });
        expect(stored.autopilotPauseAt).toBe('never');
        expect(stored.autopilotTokenCap).toBe(0);
        expect(stored.autopilotSpendCap).toBe(1.24);
    });

    it('counts tokens from finished calls', () => {
        noteModelUsage(1200);
        noteModelUsageFrom({ promptTokens: 300, responseTokens: 500 });
        noteModelUsageFrom({ tokensUsed: 1000, promptTokens: 300, responseTokens: 500 });
        noteModelUsage(null);
        expect(getUsageMeter().tokens).toBe(3000);
        expect(getUsageMeter().calls).toBe(4);
        resetUsageMeter();
        expect(getUsageMeter().tokens).toBe(0);
    });

    it('stops a run that has used its tokens, without asking any provider', async () => {
        const { fetchMock } = openRouterAccount({ total: 50, used: 10 });
        setOptions({ autopilotTokenCap: 2 });
        expect(await autopilotCapPause()).toBe('');
        noteModelUsage(2500);
        expect(await autopilotCapPause()).toContain('2,500 tokens');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("measures money by the provider's own figures, from the start of the run", async () => {
        const { account } = openRouterAccount({ total: 50, used: 10 });
        setOptions({ autopilotSpendCap: 1.5 });
        // The first check only records where the account stood.
        expect(await autopilotCapPause()).toBe('');
        expect(getUsageMeter().spendBaseline).toBe(10);
        account.used = 11.2;
        expect(await autopilotCapPause()).toBe('');
        account.used = 11.63;
        expect(await autopilotCapPause()).toContain('spent $1.63, past your cap of $1.50');
        // A new run counts from where the account stands now.
        resetUsageMeter();
        expect(await autopilotCapPause()).toBe('');
    });

    it('has no money cap for a provider that reports no spending', async () => {
        const { fetchMock } = openRouterAccount({ total: 50, used: 10 });
        useSettingsStore.setState({ apiProvider: 'gemini', devProvider: '', proseProvider: '', reviewProvider: '' });
        setOptions({ autopilotSpendCap: 1 });
        expect(billedProviders()).toEqual([]);
        expect(await autopilotCapPause()).toBe('');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('the balance readout', () => {
    it('reads OpenRouter credits, key limit and today, and keeps the reading for a while', async () => {
        const { fetchMock } = openRouterAccount({ total: 50, used: 37.66 });
        const balance = await fetchProviderBalance('openrouter', 'sk-or-test', { now: 1000 });
        expect(balance?.items).toEqual([
            { label: 'Credits left', amount: 12.34, of: 50 },
            { label: 'Key limit left', amount: 12.5, of: 20 },
            { label: 'Used today', amount: 1.2, spent: true }
        ]);
        expect(balance?.spentSoFar).toBe(37.66);
        expect(balance?.items.map(formatBalanceItem)).toEqual(['$12.34 of $50.00', '$12.50 of $20.00', '$1.20']);
        await fetchProviderBalance('openrouter', 'sk-or-test', { now: 2000 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await fetchProviderBalance('openrouter', 'sk-or-test', { now: 3000, fresh: true });
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('reads a nano-GPT balance, and gives nothing for other providers, no key, or a failure', async () => {
        openRouterAccount({ total: 1, used: 0 });
        expect((await fetchProviderBalance('nanogpt', 'nano-key'))?.items).toEqual([{ label: 'Balance', amount: 7.25 }]);
        expect(await fetchProviderBalance('gemini', 'key')).toBeNull();
        expect(await fetchProviderBalance('openrouter', '  ')).toBeNull();
        clearBalanceCache();
        vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'no' }, 401)));
        expect(await fetchProviderBalance('openrouter', 'bad-key')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        expect(await fetchProviderBalance('nanogpt', 'nano-key', { fresh: true })).toBeNull();
    });
});

describe('the limits panel', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        document.body.innerHTML = '';
    });

    it('shows the balance and the run so far, and saves what is set', async () => {
        openRouterAccount({ total: 50, used: 37.66 });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () => { root.render(<SettingsAutopilotLimits />); });
        await vi.waitFor(() => expect(host.textContent).toContain('OpenRouter: Credits left $12.34 of $50.00'));

        act(() => noteModelUsage(4321));
        expect(host.textContent).toContain('This run so far: 4,321 tokens in 1 call');

        const select = host.querySelector('select')!;
        act(() => {
            select.value = 'act';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(useFeatureOptionsStore.getState().options.autopilotPauseAt).toBe('act');
        const stored = JSON.parse(localStorage.getItem('ellipsisprose_feature_options_v1') || '{}') as { autopilotPauseAt?: string };
        expect(stored.autopilotPauseAt).toBe('act');
    });
});
