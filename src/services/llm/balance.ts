/**
 * @module services/llm/balance
 * Reads what an account has left from the services that report it for free: no model is called
 * and no tokens are spent. OpenRouter (credits and key limits) and nano-GPT (balance). Any
 * other provider, a missing key or any failure gives null, and the app simply shows nothing.
 */

import { CLOUD_API_URLS } from '@/config';
import { fetchWithTimeout } from '@/services/http';

export interface BalanceItem {
    label: string;
    amount: number;
    /** The total this amount is out of, when the service gives one. */
    of?: number;
    /** True for a "used" figure rather than a "left" figure. */
    spent?: boolean;
}

export interface ProviderBalance {
    provider: string;
    items: BalanceItem[];
    /**
     * Money spent on this account so far, in dollars, as a figure that only ever grows. The
     * difference between two readings is what was spent in between. Null when not known.
     */
    spentSoFar: number | null;
    readAt: number;
}

const TIMEOUT_MS = 10_000;
/** A reading is reused this long, so opening Settings again does not ask the service again. */
export const BALANCE_KEPT_MS = 5 * 60 * 1000;
const kept = new Map<string, ProviderBalance>();

const money = (value: unknown): number | null => {
    const n = typeof value === 'number' ? value : Number.NaN;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export function providerHasBalance(provider: string): boolean {
    return provider === 'openrouter' || provider === 'nanogpt';
}

async function getJson(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    try {
        const res = await fetchWithTimeout(url, init, TIMEOUT_MS);
        if (!res.ok) return null;
        const data = (await res.json()) as unknown;
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

type Reading = Omit<ProviderBalance, 'provider' | 'readAt'>;

async function openRouterBalance(key: string): Promise<Reading | null> {
    const headers = { Authorization: `Bearer ${key}` };
    const [account, thisKey] = await Promise.all([
        getJson(`${CLOUD_API_URLS.openRouterBase}/credits`, { method: 'GET', headers }),
        getJson(`${CLOUD_API_URLS.openRouterBase}/key`, { method: 'GET', headers })
    ]);
    const items: BalanceItem[] = [];
    let spentSoFar: number | null = null;
    const credits = account?.data as Record<string, unknown> | undefined;
    if (credits) {
        const total = money(credits.total_credits);
        const used = money(credits.total_usage);
        if (total !== null && used !== null) {
            items.push({ label: 'Credits left', amount: Math.round((total - used) * 100) / 100, of: total });
            spentSoFar = typeof credits.total_usage === 'number' ? credits.total_usage : used;
        }
    }
    const keyData = thisKey?.data as Record<string, unknown> | undefined;
    if (keyData) {
        const limit = money(keyData.limit);
        const left = money(keyData.limit_remaining);
        if (limit !== null && left !== null) items.push({ label: 'Key limit left', amount: left, of: limit });
        const today = money(keyData.usage_daily);
        if (today !== null) items.push({ label: 'Used today', amount: today, spent: true });
        if (spentSoFar === null && typeof keyData.usage === 'number') spentSoFar = keyData.usage;
    }
    return items.length > 0 ? { items, spentSoFar } : null;
}

async function nanoGptBalance(key: string): Promise<Reading | null> {
    const origin = new URL(CLOUD_API_URLS.nanoGptBase).origin;
    const data = await getJson(`${origin}/api/check-balance`, {
        method: 'POST',
        headers: { 'x-api-key': key }
    });
    const raw = data?.usd_balance;
    const left = money(typeof raw === 'string' ? Number(raw) : raw);
    if (left === null) return null;
    // Only a balance is reported, so "spent" is counted downwards from it.
    return { items: [{ label: 'Balance', amount: left }], spentSoFar: -left };
}

/** What the account has left, or null when this provider or key cannot say. */
export async function fetchProviderBalance(
    provider: string,
    key: string,
    options: { fresh?: boolean; now?: number } = {}
): Promise<ProviderBalance | null> {
    const cleanKey = String(key || '').trim();
    if (!providerHasBalance(provider) || !cleanKey) return null;
    const now = options.now ?? Date.now();
    const cacheKey = `${provider}:${cleanKey}`;
    const previous = kept.get(cacheKey);
    if (!options.fresh && previous && now - previous.readAt < BALANCE_KEPT_MS) return previous;

    const read = provider === 'openrouter' ? await openRouterBalance(cleanKey) : await nanoGptBalance(cleanKey);
    if (!read) return null;
    const balance: ProviderBalance = { provider, ...read, readAt: now };
    kept.set(cacheKey, balance);
    return balance;
}

export function clearBalanceCache(): void {
    kept.clear();
}

/** "$12.34 of $50.00" or "$1.20". */
export function formatBalanceItem(item: BalanceItem): string {
    const dollars = (n: number): string => `$${n.toFixed(2)}`;
    return item.of !== undefined ? `${dollars(item.amount)} of ${dollars(item.of)}` : dollars(item.amount);
}
