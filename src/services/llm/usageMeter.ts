/**
 * @module services/llm/usageMeter
 * Counts the tokens model calls have used since the meter was last reset. Autopilot resets it
 * when a run starts and reads it between steps for the token cap. Counting only; it never
 * refuses a call.
 */

export interface UsageMeter {
    /** Tokens reported by providers (prompt plus response) since the reset. */
    tokens: number;
    calls: number;
    startedAt: number;
    /** The provider's own "spent so far" figure when the run began, where one can be read. */
    spendBaseline: number | null;
}

let meter: UsageMeter = { tokens: 0, calls: 0, startedAt: Date.now(), spendBaseline: null };
const listeners = new Set<() => void>();

const announce = (): void => {
    for (const listener of [...listeners]) listener();
};

export function resetUsageMeter(now: number = Date.now()): void {
    meter = { tokens: 0, calls: 0, startedAt: now, spendBaseline: null };
    announce();
}

/** Adds one finished call. Calls that report no token count still count as a call. */
export function noteModelUsage(tokens: number | null | undefined): void {
    const used = Number(tokens);
    meter = {
        ...meter,
        calls: meter.calls + 1,
        tokens: meter.tokens + (Number.isFinite(used) && used > 0 ? Math.round(used) : 0)
    };
    announce();
}

/** Adds a finished call from what its provider reported. */
export function noteModelUsageFrom(metadata: {
    tokensUsed?: number | null;
    promptTokens?: number | null;
    responseTokens?: number | null;
} = {}): void {
    const total = Number(metadata.tokensUsed) || 0;
    const parts = (Number(metadata.promptTokens) || 0) + (Number(metadata.responseTokens) || 0);
    noteModelUsage(Math.max(total, parts));
}

export function setSpendBaseline(amount: number | null): void {
    meter = { ...meter, spendBaseline: amount };
}

export function getUsageMeter(): UsageMeter {
    return meter;
}

export function subscribeUsageMeter(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
