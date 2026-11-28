/**
 * @module pipeline/autopilotLimits
 * Reads the Autopilot limits the user set and the run's usage so far, and says whether the run
 * should pause. The token count comes from the usage meter. Money comes from the provider's own
 * account figures, read before the first step and again between steps, so it is what the
 * provider will really bill and not an estimate. Providers that report no such figure have no
 * money cap; the token cap covers them.
 */

import {
    capPause,
    checkpointPause,
    type SceneJustWritten
} from '@/domain/autopilot/limits';
import {
    fetchProviderBalance,
    getEffectiveModelConfig,
    getUsageMeter,
    providerHasBalance,
    setSpendBaseline
} from '@/services/llm';
import { getFeatureOptions, useSettingsStore } from '@/stores';

/** The providers this run can spend money with that also report what was spent, with their keys. */
export function billedProviders(): Array<{ provider: string; key: string }> {
    const settings = useSettingsStore.getState();
    const snapshot = settings.getModelSettingsSnapshot();
    const keys: Record<string, string> = {
        openrouter: settings.openRouterKey || '',
        nanogpt: settings.nanoGptKey || ''
    };
    const seen = new Set<string>();
    const found: Array<{ provider: string; key: string }> = [];
    for (const role of ['dev', 'prose', 'review'] as const) {
        const provider = getEffectiveModelConfig(role, snapshot).provider;
        if (seen.has(provider) || !providerHasBalance(provider) || !keys[provider]?.trim()) continue;
        seen.add(provider);
        found.push({ provider, key: keys[provider] });
    }
    return found;
}

/** Total spent so far across the billed providers, or null when none of them could be read. */
async function readSpentSoFar(): Promise<number | null> {
    const readings = await Promise.all(
        billedProviders().map(({ provider, key }) => fetchProviderBalance(provider, key, { fresh: true }))
    );
    const amounts = readings.map((r) => r?.spentSoFar).filter((n): n is number => typeof n === 'number');
    return amounts.length > 0 ? amounts.reduce((sum, n) => sum + n, 0) : null;
}

/**
 * Why the run should stop before its next step, or '' to keep going. The first call of a run
 * only records where the account stood.
 */
export async function autopilotCapPause(): Promise<string> {
    const options = getFeatureOptions();
    const meter = getUsageMeter();
    let spent: number | null = null;
    if (options.autopilotSpendCap > 0) {
        const soFar = await readSpentSoFar();
        if (soFar !== null) {
            if (meter.spendBaseline === null) setSpendBaseline(soFar);
            else spent = Math.max(0, soFar - meter.spendBaseline);
        }
    }
    return capPause(
        { tokenCapK: options.autopilotTokenCap, spendCap: options.autopilotSpendCap },
        { tokens: meter.tokens, spent }
    );
}

/** Why the run should pause after the scene it just wrote, or '' to keep going. */
export function autopilotCheckpointPause(written: SceneJustWritten): string {
    return checkpointPause(getFeatureOptions().autopilotPauseAt, written);
}
