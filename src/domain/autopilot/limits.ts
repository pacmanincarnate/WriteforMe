/**
 * @module domain/autopilot/limits
 * When an Autopilot run should pause by itself: at a chosen checkpoint (after each scene,
 * sequence or act), when it has used a set number of tokens, or when it has spent a set amount.
 * A cap is only checked between steps, so a step that has started always finishes.
 */

export type AutopilotPauseAt = 'never' | 'scene' | 'sequence' | 'act';

export const AUTOPILOT_PAUSE_CHOICES: ReadonlyArray<{ value: AutopilotPauseAt; label: string }> = [
    { value: 'never', label: 'Never (run to the end)' },
    { value: 'scene', label: 'After every scene' },
    { value: 'sequence', label: 'After every sequence' },
    { value: 'act', label: 'After every act' }
];

export function isAutopilotPauseAt(value: unknown): value is AutopilotPauseAt {
    return AUTOPILOT_PAUSE_CHOICES.some((choice) => choice.value === value);
}

export interface SceneJustWritten {
    seqIdx: number;
    sceneIdx: number;
    /** Scenes planned for this sequence. */
    scenesInSequence: number;
    /** The act each sequence belongs to, in order. */
    sequenceActs: ReadonlyArray<number | string | null | undefined>;
}

/** Why Autopilot should pause after the scene it just wrote, or '' to keep going. */
export function checkpointPause(pauseAt: AutopilotPauseAt, written: SceneJustWritten): string {
    if (pauseAt === 'never') return '';
    const scene = `Sequence ${written.seqIdx + 1}, Scene ${written.sceneIdx + 1}`;
    if (pauseAt === 'scene') return `Autopilot paused after ${scene}, as set. Turn it on again to continue.`;

    const lastSceneOfSequence = written.sceneIdx >= written.scenesInSequence - 1;
    if (!lastSceneOfSequence) return '';
    if (pauseAt === 'sequence') {
        return `Autopilot paused at the end of Sequence ${written.seqIdx + 1}, as set. Turn it on again to continue.`;
    }

    const act = written.sequenceActs[written.seqIdx];
    const nextAct = written.sequenceActs[written.seqIdx + 1];
    const lastSequence = written.seqIdx >= written.sequenceActs.length - 1;
    if (lastSequence || String(act ?? '') !== String(nextAct ?? '')) {
        return `Autopilot paused at the end of Act ${act ?? '?'}, as set. Turn it on again to continue.`;
    }
    return '';
}

export interface RunCaps {
    /** Thousands of tokens a run may use; 0 means no cap. */
    tokenCapK: number;
    /** Dollars a run may spend; 0 means no cap. */
    spendCap: number;
}

export interface RunUsage {
    tokens: number;
    /** Dollars spent since the run began, or null when the provider cannot say. */
    spent: number | null;
}

/** Why Autopilot should stop before its next step, or '' to keep going. */
export function capPause(caps: RunCaps, usage: RunUsage): string {
    const tokenCap = Math.max(0, Number(caps.tokenCapK) || 0) * 1000;
    if (tokenCap > 0 && usage.tokens >= tokenCap) {
        return `Autopilot paused: this run has used ${usage.tokens.toLocaleString()} tokens, past your cap of ${tokenCap.toLocaleString()}. Turn it on again to start a new run.`;
    }
    const spendCap = Math.max(0, Number(caps.spendCap) || 0);
    if (spendCap > 0 && usage.spent !== null && usage.spent >= spendCap) {
        return `Autopilot paused: this run has spent $${usage.spent.toFixed(2)}, past your cap of $${spendCap.toFixed(2)}. Turn it on again to start a new run.`;
    }
    return '';
}

/** A whole number of thousands of tokens from a settings field, never negative. */
export function cleanTokenCapK(value: unknown): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
}

/** Dollars from a settings field, to the cent, never negative. */
export function cleanSpendCap(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 100_000) : 0;
}
