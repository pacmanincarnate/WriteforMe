/**
 * @module views/settings/SettingsAutopilotLimits
 * Autopilot's own brakes, shown in the Pipeline tab: where it pauses, how many tokens or dollars
 * one run may use, and what the account has left. Reads and writes the feature options and
 * settings stores directly, so it needs no props from the shell.
 */

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from '@/components';
import {
    AUTOPILOT_PAUSE_CHOICES,
    cleanSpendCap,
    cleanTokenCapK,
    isAutopilotPauseAt
} from '@/domain/autopilot/limits';
import {
    fetchProviderBalance,
    formatBalanceItem,
    getUsageMeter,
    subscribeUsageMeter,
    type ProviderBalance
} from '@/services/llm';
import { useFeatureOptionsStore, useSettingsStore } from '@/stores';

const PROVIDER_NAMES: Record<string, string> = { openrouter: 'OpenRouter', nanogpt: 'nano-GPT' };

export const SettingsAutopilotLimits: React.FC = () => {
    const options = useFeatureOptionsStore((s) => s.options);
    const setOption = useFeatureOptionsStore((s) => s.setOption);
    const openRouterKey = useSettingsStore((s) => s.openRouterKey);
    const nanoGptKey = useSettingsStore((s) => s.nanoGptKey);
    const meter = useSyncExternalStore(subscribeUsageMeter, getUsageMeter, getUsageMeter);

    const [balances, setBalances] = useState<ProviderBalance[]>([]);
    const [reading, setReading] = useState(false);
    const hasBilledKey = Boolean(openRouterKey?.trim() || nanoGptKey?.trim());

    const readBalances = useCallback(
        async (fresh: boolean): Promise<void> => {
            setReading(true);
            try {
                const found = await Promise.all([
                    fetchProviderBalance('openrouter', openRouterKey || '', { fresh }),
                    fetchProviderBalance('nanogpt', nanoGptKey || '', { fresh })
                ]);
                setBalances(found.filter((b): b is ProviderBalance => Boolean(b)));
            } finally {
                setReading(false);
            }
        },
        [openRouterKey, nanoGptKey]
    );

    useEffect(() => {
        if (hasBilledKey) void readBalances(false);
        else setBalances([]);
    }, [hasBilledKey, readBalances]);

    const field =
        'w-28 px-2.5 py-1.5 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 font-mono outline-none focus:ring-1 focus:ring-gold-edge';

    return (
        <div className="p-4 bg-inset border border-edge-strong rounded-xl space-y-4" data-testid="autopilot-limits">
            <div className="space-y-0.5">
                <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                    Autopilot Limits
                </span>
                <p className="text-xs text-ink-500">
                    Autopilot pauses by itself at the point you choose, or when one run has used this much. A cap is
                    checked between steps, so the step in progress always finishes. Turning Autopilot on again
                    starts a new run and a new count.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 text-xs text-ink-700">
                    <span className="block font-bold">Pause</span>
                    <select
                        value={options.autopilotPauseAt}
                        onChange={(e) => {
                            if (isAutopilotPauseAt(e.target.value)) setOption('autopilotPauseAt', e.target.value);
                        }}
                        aria-label="Where Autopilot pauses"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 outline-none"
                    >
                        {AUTOPILOT_PAUSE_CHOICES.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                                {choice.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-xs text-ink-700">
                    <span className="block font-bold">Token cap per run (thousands)</span>
                    <input
                        type="number"
                        min={0}
                        step={50}
                        value={options.autopilotTokenCap || ''}
                        placeholder="No cap"
                        onChange={(e) => setOption('autopilotTokenCap', cleanTokenCapK(e.target.value))}
                        aria-label="Token cap per run, in thousands"
                        className={field}
                    />
                </label>
                <label className="space-y-1 text-xs text-ink-700">
                    <span className="block font-bold">Spend cap per run (US dollars)</span>
                    <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={options.autopilotSpendCap || ''}
                        placeholder="No cap"
                        onChange={(e) => setOption('autopilotSpendCap', cleanSpendCap(e.target.value))}
                        aria-label="Spend cap per run, in US dollars"
                        className={field}
                    />
                </label>
            </div>
            <p className="text-xs text-ink-500">
                The spend cap uses the provider&rsquo;s own account figures, so it works with OpenRouter and nano-GPT
                only. For any other provider, set a token cap.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-700">
                <span className="font-mono">
                    This run so far: {meter.tokens.toLocaleString()} tokens in {meter.calls.toLocaleString()} call
                    {meter.calls === 1 ? '' : 's'}
                </span>
                {hasBilledKey && (
                    <button
                        type="button"
                        onClick={() => void readBalances(true)}
                        disabled={reading}
                        className="px-2.5 py-1 rounded-lg border border-edge-strong text-ink-700 hover:bg-wash flex items-center gap-1.5 self-start sm:self-auto cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={reading ? 'animate-spin' : ''} />
                        Refresh Balance
                    </button>
                )}
            </div>
            {balances.length > 0 && (
                <ul className="text-xs text-ink-700 space-y-1" aria-label="Account balances">
                    {balances.map((balance) => (
                        <li key={balance.provider}>
                            <span className="font-bold">{PROVIDER_NAMES[balance.provider] || balance.provider}:</span>{' '}
                            {balance.items.map((item) => `${item.label} ${formatBalanceItem(item)}`).join(' · ')}
                        </li>
                    ))}
                </ul>
            )}
            {hasBilledKey && !reading && balances.length === 0 && (
                <p className="text-xs text-ink-500 italic">The account balance could not be read just now.</p>
            )}
        </div>
    );
};
