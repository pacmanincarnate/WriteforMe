/**
 * @module services/audio/audiocppQueue
 * Serialized execution queue and Wave 1/Wave 2 activation helper for the local
 * Audio.cpp Hybrid Studio backend so concurrent callers never collide.
 */

import { migrateAudioDramaSettings, type AudioDramaSettings } from '@/config';
import { fetchWithTimeout } from '@/services/http';

export interface LiveAudioCppWaveState {
    activeWave: number;
    dramaModelId: string | null;
    wave2Sig: string | null;
    checkedAt: number;
}

export const liveAudioCppWaveState: LiveAudioCppWaveState = {
    activeWave: 0,
    dramaModelId: null,
    wave2Sig: null,
    checkedAt: 0
};

let _audioCppRequestChain: Promise<unknown> = Promise.resolve();
let _audioCppPendingCount = 0;

export function isAudioCppQueueBusy(): boolean {
    return _audioCppPendingCount > 0;
}

export function enqueueAudioCppTask<T>(taskFn: () => Promise<T>): Promise<T> {
    _audioCppPendingCount++;
    const runTask = async (): Promise<T> => {
        try {
            return await taskFn();
        } finally {
            _audioCppPendingCount = Math.max(0, _audioCppPendingCount - 1);
        }
    };
    const next = _audioCppRequestChain.then(runTask, runTask);
    _audioCppRequestChain = next.catch(() => {});
    return next;
}

export interface Wave2ActivateBody {
    offloadProfile: string;
    runMode: 'streaming';
    codecBackend: 'cpu' | 'same';
    contextLength: number;
    cpuExpertLayers?: number;
    expertCacheSize?: number;
    threads?: number;
}

export function buildWave2ActivateBody(
    settings: Partial<AudioDramaSettings> & Record<string, unknown> = {}
): Wave2ActivateBody {
    const eff = migrateAudioDramaSettings(settings) as Partial<AudioDramaSettings> &
        Record<string, unknown>;
    const body: Wave2ActivateBody = {
        offloadProfile: String(eff.dramaOffloadProfile || 'auto'),
        runMode: 'streaming',
        codecBackend: eff.dramaCodecBackend === 'cpu' ? 'cpu' : 'same',
        contextLength: Number.isFinite(Number(eff.dramaContextLength))
            ? Math.max(2048, Math.min(32768, Math.round(Number(eff.dramaContextLength))))
            : 8192
    };
    if (
        eff.dramaCpuExpertLayers !== null &&
        eff.dramaCpuExpertLayers !== undefined &&
        String(eff.dramaCpuExpertLayers).trim() !== ''
    ) {
        const cpuLayers = Number(eff.dramaCpuExpertLayers);
        if (Number.isFinite(cpuLayers)) {
            body.cpuExpertLayers = Math.max(0, Math.min(40, Math.round(cpuLayers)));
        }
    }
    if (
        eff.dramaExpertCacheSize !== null &&
        eff.dramaExpertCacheSize !== undefined &&
        String(eff.dramaExpertCacheSize).trim() !== ''
    ) {
        const cacheSlots = Number(eff.dramaExpertCacheSize);
        if (Number.isFinite(cacheSlots)) {
            body.expertCacheSize = Math.max(8, Math.min(256, Math.round(cacheSlots)));
        }
    }
    if (
        eff.dramaThreads !== null &&
        eff.dramaThreads !== undefined &&
        String(eff.dramaThreads).trim() !== ''
    ) {
        const th = Number(eff.dramaThreads);
        if (Number.isFinite(th)) body.threads = Math.max(1, Math.min(32, Math.round(th)));
    }
    return body;
}

export async function activateAudioCppWave(
    bridgeUrl: string,
    waveNum: number,
    signal: AbortSignal | null = null,
    timeoutMs = 60000,
    settings: (Partial<AudioDramaSettings> & Record<string, unknown>) | null = null
): Promise<boolean> {
    const wave = Number(waveNum);
    const reqInit: RequestInit = {
        method: 'POST',
        ...(signal ? { signal } : {})
    };
    if (wave === 2) {
        const payload = buildWave2ActivateBody(settings || {});
        const reqSig = JSON.stringify(payload);
        if (
            liveAudioCppWaveState.activeWave === 2 &&
            liveAudioCppWaveState.wave2Sig === reqSig
        ) {
            return true;
        }
        try {
            const res = await fetchWithTimeout(
                `${bridgeUrl}/wave/2/activate`,
                {
                    ...reqInit,
                    headers: { 'Content-Type': 'application/json' },
                    body: reqSig
                },
                timeoutMs
            ).catch(() => null);
            if (res && res.ok) {
                liveAudioCppWaveState.activeWave = 2;
                liveAudioCppWaveState.wave2Sig = reqSig;
                return true;
            }
        } catch {
            // Fall through and return false
        }
        return false;
    }
    if (liveAudioCppWaveState.activeWave === wave) return true;
    try {
        const res = await fetchWithTimeout(
            `${bridgeUrl}/wave/${wave}/activate`,
            reqInit,
            timeoutMs
        ).catch(() => null);
        if (res && res.ok) {
            liveAudioCppWaveState.activeWave = wave;
            return true;
        }
    } catch {
        // Fall through and return false
    }
    return false;
}

/** Resets cached Wave 1/2 state (strictly for isolated unit tests). */
export function resetAudioCppStateForTests(): void {
    liveAudioCppWaveState.activeWave = 0;
    liveAudioCppWaveState.dramaModelId = null;
    liveAudioCppWaveState.wave2Sig = null;
    liveAudioCppWaveState.checkedAt = 0;
    _audioCppPendingCount = 0;
    _audioCppRequestChain = Promise.resolve();
}
