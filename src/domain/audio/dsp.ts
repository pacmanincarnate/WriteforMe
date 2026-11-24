/**
 * @module domain/audio/dsp
 * Pure PCM audio analysis (RMS, YIN F0, jitter, HNR), ASR verification (WER, boundary
 * truncation, meta-token leakage), chunk bisection, LUFS loudness metering & leveling,
 * room tone synthesis, raised-cosine fades, 75Hz high-pass filter, and RIFF WAV encoding.
 */

import { META_TOKENS } from './voiceProfiles';

export interface BisectableChunk<TTurn = Record<string, unknown>> {
    id: string;
    turns: TTurn[];
    boundaryBefore?: string;
    [key: string]: unknown;
}

export interface TargetF0Band {
    min: number;
    max: number;
    label: string;
}

export interface AudioPcmAnalysisResult {
    rmsDb: number;
    medianF0: number;
    jitter: number;
    hnrDb: number;
    isClipping: boolean;
}

export interface VerifyChunkQualityParams {
    expectedText: string;
    transcriptText?: string | null;
    durationSec: number;
    wordCount: number;
    rmsDb: number;
    speechRatio?: number;
}

export interface VerifyChunkQualityResult {
    valid: boolean;
    wer: number | null;
    flags: string[];
}

/** Maps a natural-language voice profile to expected fundamental frequency (F0) bounds. */
export function studioTargetF0Band(profile: unknown): TargetF0Band {
    const text = String(profile || '').toLowerCase();
    if (/\b(bass|deep male|low male|rumbling male|gravelly male)\b/i.test(text)) {
        return { min: 85, max: 135, label: 'deep_bass_male' };
    }
    if (/\b(soprano|child|little girl|little boy|toddler|elderly woman|frail woman)\b/i.test(text)) {
        return { min: 220, max: 350, label: 'high_soprano_child' };
    }
    if (/\b(alto|contralto|mature female|older woman|deep female|low female)\b/i.test(text)) {
        return { min: 160, max: 240, label: 'alto_mature_female' };
    }
    if (/\b(female|woman|lady|mother|sister|girl|young woman|mezzo)\b/i.test(text)) {
        return { min: 185, max: 290, label: 'mezzo_young_female' };
    }
    if (/\b(tenor|young male|teenage boy|boy|youthful male|higher male)\b/i.test(text)) {
        return { min: 130, max: 200, label: 'tenor_young_male' };
    }
    if (/\b(baritone|male|man|gentleman|father|brother|adult male)\b/i.test(text)) {
        return { min: 100, max: 165, label: 'baritone_adult_male' };
    }
    return { min: 85, max: 350, label: 'default_broad' };
}

/** Normalizes a direction cue into a canonical sorted lookup key. */
export function normalizeDirectionKey(direction: unknown): string {
    if (!direction || !String(direction).trim()) return 'neutral';
    const words = String(direction)
        .toLowerCase()
        .replace(/^[[(*]+|[\])*]+$/g, '')
        .split(/[,;\s]+/)
        .map((w) => w.trim())
        .filter((w) => w && !/^(?:a|the|an|with|in|of|and|to)$/i.test(w));
    if (words.length === 0) return 'neutral';
    return words.sort().join('_').replace(/[^a-z0-9_]/g, '');
}

/** Computes overall signal RMS amplitude in dBFS, returning -100 for empty, silent, or non-finite buffers. */
export function computeRmsDb(samples: Float32Array | number[] | null | undefined): number {
    if (!samples || !samples.length) return -100;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / samples.length);
    return Number.isFinite(rms) && rms > 0 ? 20 * Math.log10(rms) : -100;
}

/** Runs RMS, clipping, YIN median F0, period jitter, and harmonic-to-noise ratio (HNR) analysis on PCM audio. */
export function analyzeAudioPcmData(
    samples: Float32Array | number[] | null | undefined,
    sampleRate: number
): AudioPcmAnalysisResult {
    if (!samples || samples.length === 0) {
        return { rmsDb: -100, medianF0: 0, jitter: 0, hnrDb: 0, isClipping: false };
    }

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
        sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / samples.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const isClipping = peak >= 0.9999;

    const frameSize = 1024;
    const hopSize = 512;
    const minPeriod = Math.floor(sampleRate / 400);
    const maxPeriod = Math.floor(sampleRate / 75);
    const f0Values: number[] = [];
    const periods: number[] = [];

    for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
        const d = new Float32Array(maxPeriod + 1);
        for (let tau = 1; tau <= maxPeriod; tau++) {
            let diffSum = 0;
            for (let j = 0; j < frameSize - maxPeriod; j++) {
                const diff = samples[offset + j] - samples[offset + j + tau];
                diffSum += diff * diff;
            }
            d[tau] = diffSum;
        }

        const dPrime = new Float32Array(maxPeriod + 1);
        dPrime[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau <= maxPeriod; tau++) {
            runningSum += d[tau];
            dPrime[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
        }

        let bestTau = -1;
        const thresh = 0.15;
        for (let tau = minPeriod; tau <= maxPeriod; tau++) {
            if (dPrime[tau] < thresh) {
                while (tau + 1 <= maxPeriod && dPrime[tau + 1] < dPrime[tau]) tau++;
                bestTau = tau;
                break;
            }
        }

        if (bestTau > 0) {
            let refinedTau = bestTau;
            if (bestTau > minPeriod && bestTau < maxPeriod) {
                const s0 = dPrime[bestTau - 1];
                const s1 = dPrime[bestTau];
                const s2 = dPrime[bestTau + 1];
                const delta = (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1e-6);
                refinedTau += delta;
            }
            const f0 = sampleRate / refinedTau;
            if (f0 >= 75 && f0 <= 400) {
                f0Values.push(f0);
                periods.push(refinedTau);
            }
        }
    }

    let medianF0 = 0;
    let jitter = 0;
    if (f0Values.length > 0) {
        const sorted = [...f0Values].sort((a, b) => a - b);
        medianF0 = sorted[Math.floor(sorted.length / 2)];

        if (periods.length >= 2) {
            let periodDiffSum = 0;
            let periodSum = 0;
            for (let i = 0; i < periods.length - 1; i++) {
                periodDiffSum += Math.abs(periods[i + 1] - periods[i]);
                periodSum += periods[i];
            }
            const meanPeriod = periodSum / periods.length;
            jitter = meanPeriod > 0 ? periodDiffSum / (periods.length - 1) / meanPeriod : 0;
        }
    }

    let hnrDb = 0;
    if (medianF0 > 0) {
        const periodSamples = Math.round(sampleRate / medianF0);
        let r0 = 0;
        let rPeriod = 0;
        const n = Math.min(samples.length - periodSamples, 4096);
        for (let i = 0; i < n; i++) {
            r0 += samples[i] * samples[i];
            rPeriod += samples[i] * samples[i + periodSamples];
        }
        const normCorr = r0 > 0 ? Math.max(0.001, Math.min(0.999, rPeriod / r0)) : 0.001;
        hnrDb = 10 * Math.log10(normCorr / (1 - normCorr));
    }

    return {
        rmsDb: Math.round(rmsDb * 10) / 10,
        medianF0: Math.round(medianF0 * 10) / 10,
        jitter: Math.round(jitter * 1000) / 1000,
        hnrDb: Math.round(hnrDb * 10) / 10,
        isClipping
    };
}

/** Computes Word Error Rate (WER) via word-level Levenshtein distance. */
export function computeWordErrorRate(referenceText: unknown, hypothesisText: unknown): number {
    const tokenize = (s: unknown): string[] =>
        String(s || '')
            .toLowerCase()
            .replace(/[^\w\s']/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

    const ref = tokenize(referenceText);
    const hyp = tokenize(hypothesisText);

    if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
    if (hyp.length === 0) return 1;

    const d = Array.from({ length: ref.length + 1 }, () => new Uint16Array(hyp.length + 1));
    for (let i = 0; i <= ref.length; i++) d[i][0] = i;
    for (let j = 0; j <= hyp.length; j++) d[0][j] = j;

    for (let i = 1; i <= ref.length; i++) {
        for (let j = 1; j <= hyp.length; j++) {
            const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }

    return Math.round((d[ref.length][hyp.length] / ref.length) * 1000) / 1000;
}

/** Checks that leading and trailing reference words appear near the start and end of the ASR hypothesis. */
export function checkBoundaryTruncation(referenceText: unknown, hypothesisText: unknown): boolean {
    const tokenize = (s: unknown): string[] =>
        String(s || '')
            .toLowerCase()
            .replace(/[^\w\s']/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

    const ref = tokenize(referenceText);
    const hyp = tokenize(hypothesisText);

    if (ref.length < 6 || hyp.length < 4) {
        const hypSet = new Set(hyp);
        const matchCount = ref.filter((w) => hypSet.has(w)).length;
        return matchCount >= Math.min(ref.length, 2);
    }

    const refPrefix = ref.slice(0, 6);
    const hypPrefixSet = new Set(hyp.slice(0, 8));
    const prefixMatches = refPrefix.filter((w) => hypPrefixSet.has(w)).length;

    const refSuffix = ref.slice(-6);
    const hypSuffixSet = new Set(hyp.slice(-8));
    const suffixMatches = refSuffix.filter((w) => hypSuffixSet.has(w)).length;

    return prefixMatches >= 4 && suffixMatches >= 4;
}

/** Detects spoken meta-tokens (e.g., "sigh", "narrator", "breeze") not present in expected text. */
export function detectMetaWordLeakage(expectedText: unknown, transcriptText: unknown): string[] {
    const tokenize = (s: unknown): string[] =>
        String(s || '')
            .toLowerCase()
            .replace(/[^\w\s']/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

    const expTokens = new Set(tokenize(expectedText));
    const transTokens = tokenize(transcriptText);

    const leaked: string[] = [];
    for (const token of transTokens) {
        if (META_TOKENS.has(token) && !expTokens.has(token)) {
            leaked.push(token);
        }
    }
    return leaked;
}

/** Evaluates rendered chunk duration, loudness, speech ratio, WER, truncation, and meta leakage. */
export function verifyChunkQuality({
    expectedText,
    transcriptText,
    durationSec,
    wordCount,
    rmsDb,
    speechRatio
}: VerifyChunkQualityParams): VerifyChunkQualityResult {
    const flags: string[] = [];

    const expectedSec = wordCount / 2.6;
    const durRatio = expectedSec > 0 ? durationSec / expectedSec : 1.0;
    if (durRatio < 0.45 || durRatio > 2.2) {
        flags.push('duration_anomaly');
    }
    if (rmsDb <= -45.0) {
        flags.push('inaudible_or_silent');
    }
    if (speechRatio !== undefined && speechRatio < 0.5) {
        flags.push('insufficient_speech_ratio');
    }

    let wer: number | null = null;
    if (transcriptText) {
        wer = computeWordErrorRate(expectedText, transcriptText);
        if (wer > 0.18) {
            flags.push('high_wer_' + wer);
        }
        if (!checkBoundaryTruncation(expectedText, transcriptText)) {
            flags.push('boundary_truncated');
        }
        const leaks = detectMetaWordLeakage(expectedText, transcriptText);
        if (leaks.length > 0) {
            flags.push('meta_leak_' + leaks.join('_'));
        }
    } else {
        flags.push('asr_unavailable');
    }

    const passes = flags.length === 0 || (flags.length === 1 && flags[0] === 'asr_unavailable');

    return {
        valid: passes,
        wer,
        flags
    };
}

/** Bisects a multi-turn DramaChunk into two child chunks when a render retry requires smaller scope. */
export function bisectChunk<TChunk extends BisectableChunk>(
    chunk: TChunk
): [TChunk, TChunk] | null {
    if (!chunk.turns || chunk.turns.length < 2) return null;
    const mid = Math.floor(chunk.turns.length / 2);
    return [
        {
            ...chunk,
            id: `${chunk.id}_a`,
            turns: chunk.turns.slice(0, mid),
            boundaryBefore: chunk.boundaryBefore
        },
        {
            ...chunk,
            id: `${chunk.id}_b`,
            turns: chunk.turns.slice(mid),
            boundaryBefore: 'dialogue_narration'
        }
    ];
}

/** Measures integrated ITU-R BS.1770 K-weighted LUFS loudness on mono PCM samples. */
export function measureIntegratedLufs(
    samples: Float32Array | number[] | null | undefined,
    sampleRate?: number
): number {
    void sampleRate;
    if (!samples || samples.length === 0) return -100;

    const b0 = 1.53512485958697,
        b1 = -2.69169618940638,
        b2 = 1.19839281085285;
    const a1 = -1.69065929318241,
        a2 = 0.73248077421585;

    let x1 = 0,
        x2 = 0,
        y1 = 0,
        y2 = 0;
    const stage1 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        stage1[i] = y;
    }

    const c0 = 1.0,
        c1 = -2.0,
        c2 = 1.0;
    const d1 = -1.99004745483398,
        d2 = 0.99007225036621;
    let rx1 = 0,
        rx2 = 0,
        ry1 = 0,
        ry2 = 0;
    let meanSquare = 0;
    for (let i = 0; i < stage1.length; i++) {
        const x = stage1[i];
        const y = c0 * x + c1 * rx1 + c2 * rx2 - d1 * ry1 - d2 * ry2;
        rx2 = rx1;
        rx1 = x;
        ry2 = ry1;
        ry1 = y;
        meanSquare += y * y;
    }

    meanSquare /= samples.length;
    if (meanSquare <= 1e-12) return -100;
    return Math.round((-0.691 + 10 * Math.log10(meanSquare)) * 10) / 10;
}

/** Synthesizes low-level pink noise room tone at the requested dBFS level. */
export function generatePinkNoiseRoomTone(numSamples: number, targetDb = -58.0): Float32Array {
    const buffer = new Float32Array(numSamples);
    let b0 = 0,
        b1 = 0,
        b2 = 0;
    const linearGain = Math.pow(10, targetDb / 20);

    for (let i = 0; i < numSamples; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        const pink = (b0 + b1 + b2 + white * 0.1848) * 0.5;
        buffer[i] = pink * linearGain;
    }
    return buffer;
}

/** Applies symmetrical raised-cosine fade-in and fade-out ramps in place. */
export function applyRaisedCosineFades(
    samples: Float32Array | number[],
    sampleRate: number,
    fadeMs = 15
): void {
    const fadeSamples = Math.min(
        Math.floor((fadeMs / 1000) * sampleRate),
        Math.floor(samples.length / 2)
    );
    for (let i = 0; i < fadeSamples; i++) {
        const gain = 0.5 * (1 - Math.cos(Math.PI * (i / fadeSamples)));
        samples[i] *= gain;
        samples[samples.length - 1 - i] *= gain;
    }
}

/** Applies an in-place 2nd-order Butterworth 75Hz high-pass rumble filter. */
export function applyHighPass75Hz(samples: Float32Array | number[], sampleRate: number): void {
    const omega = (2 * Math.PI * 75) / sampleRate;
    const cosOmega = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * Math.SQRT2);

    const a0 = 1 + alpha;
    const b0 = (1 + cosOmega) / 2 / a0;
    const b1 = -(1 + cosOmega) / a0;
    const b2 = (1 + cosOmega) / 2 / a0;
    const a1 = (-2 * cosOmega) / a0;
    const a2 = (1 - alpha) / a0;

    let x1 = 0,
        x2 = 0,
        y1 = 0,
        y2 = 0;
    for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        samples[i] = y;
    }
}

/** Gain-levels PCM samples in place to a target integrated LUFS with peak ceiling protection. */
export function levelSamplesToLufs<T extends Float32Array | number[]>(
    samples: T,
    sampleRate: number,
    targetLufs = -18.0,
    peakLimitDb = -1.5
): T {
    const currentLufs = measureIntegratedLufs(samples, sampleRate);
    if (currentLufs <= -70) return samples;

    const deltaDb = targetLufs - currentLufs;
    const linearGain = Math.pow(10, deltaDb / 20);
    const maxPeak = Math.pow(10, peakLimitDb / 20);

    for (let i = 0; i < samples.length; i++) {
        let s = samples[i] * linearGain;
        if (s > maxPeak) s = maxPeak;
        else if (s < -maxPeak) s = -maxPeak;
        samples[i] = s;
    }
    return samples;
}

/** Encodes mono 32-bit float PCM samples into a 16-bit PCM RIFF/WAVE Blob. */
export function encodeFloat32PcmToWavBlob(
    samples: Float32Array | number[],
    sampleRate: number
): Blob {
    const numSamples = samples.length;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string): void => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}
