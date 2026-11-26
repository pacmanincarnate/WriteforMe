/**
 * @module services/audio/codec
 * Client-side WAV decoding, AudioBuffer VAD trimming/static cleanup, Float32 PCM
 * stitching with LUFS mastering, base64 conversion, and reusable Web Worker + main-thread
 * MP3 encoding via bundled `lamejs`.
 */

import { AUDIO_DSP_DEFAULTS, CDN_URLS, TIMEOUTS_MS } from '@/config';
import {
    applyHighPass75Hz,
    applyRaisedCosineFades,
    encodeFloat32PcmToWavBlob,
    levelSamplesToLufs
} from '@/domain/audio';
import { ensureLameJs } from '@/services/documents';

export type AudioBufferWithFlags = AudioBuffer & {
    _isInvalidSpeech?: boolean;
};

export interface DecodedAudioResult {
    audioBuf: AudioBuffer | null;
    samples: Float32Array;
    sampleRate: number;
    duration: number;
}

export interface SanitizeAudioResult {
    blob: Blob;
    isInvalid: boolean;
}

export interface StudioWorkerTaskResponse {
    id: number;
    ok: boolean;
    error?: string;
    buffers?: ArrayBuffer[];
    timelineSeconds?: number;
}

interface PendingWorkerEntry {
    resolve: (msg: StudioWorkerTaskResponse) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const getAudioContextCtor = (): typeof AudioContext => {
    const win =
        typeof window !== 'undefined'
            ? (window as unknown as {
                  AudioContext?: typeof AudioContext;
                  webkitAudioContext?: typeof AudioContext;
              })
            : undefined;
    const Ctor = win?.AudioContext || win?.webkitAudioContext;
    if (!Ctor) {
        throw new Error('Web Audio API (AudioContext) is not available in this environment.');
    }
    return Ctor;
};

export async function decodeAudioBlobToSamples(audioBlob: Blob): Promise<DecodedAudioResult> {
    const arrayBuf = await audioBlob.arrayBuffer();
    const AudioCtx = getAudioContextCtor();
    const audioCtx = new AudioCtx();
    try {
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        const channelData = audioBuf.getChannelData(0);
        return {
            audioBuf,
            samples: channelData,
            sampleRate: audioBuf.sampleRate,
            duration: audioBuf.duration
        };
    } finally {
        try {
            await audioCtx.close();
        } catch {
            // Ignore AudioContext close error
        }
    }
}

/**
 * Fast zero-WebAudio PCM decoder for uncompressed RIFF WAV blobs (16-bit/32-bit PCM & IEEE Float32).
 * Falls back seamlessly to `AudioContext.decodeAudioData` for compressed formats (MP3/OGG/WebM).
 */
export async function decodeWavBlobDirect(audioBlob: Blob): Promise<DecodedAudioResult> {
    if (!audioBlob || typeof audioBlob.arrayBuffer !== 'function') {
        return decodeAudioBlobToSamples(audioBlob);
    }
    const mime = String(audioBlob.type || '').toLowerCase();
    if (
        mime &&
        !mime.includes('wav') &&
        !mime.includes('wave') &&
        mime !== 'application/octet-stream'
    ) {
        return decodeAudioBlobToSamples(audioBlob);
    }
    const arrayBuf = await audioBlob.arrayBuffer();
    if (arrayBuf.byteLength >= 44) {
        const view = new DataView(arrayBuf);
        const riff = String.fromCharCode(
            view.getUint8(0),
            view.getUint8(1),
            view.getUint8(2),
            view.getUint8(3)
        );
        const wave = String.fromCharCode(
            view.getUint8(8),
            view.getUint8(9),
            view.getUint8(10),
            view.getUint8(11)
        );
        if (riff === 'RIFF' && wave === 'WAVE') {
            let offset = 12;
            let audioFormat = 0;
            let numChannels = 1;
            let sampleRate = 44100;
            let bitsPerSample = 16;
            let dataOffset = -1;
            let dataSize = 0;
            while (offset + 8 <= arrayBuf.byteLength) {
                const chunkId = String.fromCharCode(
                    view.getUint8(offset),
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3)
                );
                const chunkSize = view.getUint32(offset + 4, true);
                const bodyOffset = offset + 8;
                if (chunkId === 'fmt ' && bodyOffset + 16 <= arrayBuf.byteLength) {
                    audioFormat = view.getUint16(bodyOffset, true);
                    numChannels = Math.max(1, view.getUint16(bodyOffset + 2, true));
                    sampleRate = view.getUint32(bodyOffset + 4, true) || 44100;
                    bitsPerSample = view.getUint16(bodyOffset + 14, true);
                } else if (chunkId === 'data') {
                    dataOffset = bodyOffset;
                    dataSize = Math.min(chunkSize, Math.max(0, arrayBuf.byteLength - bodyOffset));
                    break;
                }
                offset = bodyOffset + chunkSize + (chunkSize & 1);
            }
            if (
                dataOffset > 0 &&
                dataSize > 0 &&
                ((audioFormat === 1 && (bitsPerSample === 16 || bitsPerSample === 32)) ||
                    (audioFormat === 3 && bitsPerSample === 32))
            ) {
                const bytesPerFrame = (bitsPerSample / 8) * numChannels;
                const frameCount = Math.floor(dataSize / bytesPerFrame);
                if (frameCount > 0) {
                    const samples = new Float32Array(frameCount);
                    if (audioFormat === 1 && bitsPerSample === 16) {
                        if ((dataOffset & 1) === 0) {
                            const i16 = new Int16Array(
                                arrayBuf,
                                dataOffset,
                                frameCount * numChannels
                            );
                            if (numChannels === 1) {
                                for (let i = 0; i < frameCount; i++) {
                                    samples[i] = i16[i] / 32768;
                                }
                            } else {
                                for (let i = 0; i < frameCount; i++) {
                                    let sum = 0;
                                    const base = i * numChannels;
                                    for (let c = 0; c < numChannels; c++) sum += i16[base + c];
                                    samples[i] = sum / numChannels / 32768;
                                }
                            }
                        } else {
                            let pos = dataOffset;
                            for (let i = 0; i < frameCount; i++) {
                                let sum = 0;
                                for (let c = 0; c < numChannels; c++) {
                                    sum += view.getInt16(pos, true);
                                    pos += 2;
                                }
                                samples[i] = sum / numChannels / 32768;
                            }
                        }
                    } else if (audioFormat === 1 && bitsPerSample === 32) {
                        let pos = dataOffset;
                        for (let i = 0; i < frameCount; i++) {
                            let sum = 0;
                            for (let c = 0; c < numChannels; c++) {
                                sum += view.getInt32(pos, true);
                                pos += 4;
                            }
                            samples[i] = sum / numChannels / 2147483648;
                        }
                    } else {
                        let pos = dataOffset;
                        for (let i = 0; i < frameCount; i++) {
                            let sum = 0;
                            for (let c = 0; c < numChannels; c++) {
                                sum += view.getFloat32(pos, true);
                                pos += 4;
                            }
                            samples[i] = sum / numChannels;
                        }
                    }
                    return {
                        audioBuf: null,
                        samples,
                        sampleRate,
                        duration: frameCount / sampleRate
                    };
                }
            }
        }
    }
    const AudioCtx = getAudioContextCtor();
    const audioCtx = new AudioCtx();
    try {
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        const channelData = audioBuf.getChannelData(0);
        return {
            audioBuf,
            samples: channelData,
            sampleRate: audioBuf.sampleRate,
            duration: audioBuf.duration
        };
    } finally {
        try {
            await audioCtx.close();
        } catch {
            // Ignore AudioContext close error
        }
    }
}

export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = String(reader.result || '');
            const commaIdx = dataUrl.indexOf(',');
            resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed converting Blob to base64'));
        reader.readAsDataURL(blob);
    });
}

export function base64AudioToBlob(base64Str: string, mimeType = 'audio/wav'): Blob {
    const byteChars = atob(base64Str);
    const byteNumbers = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([byteNumbers], { type: mimeType });
}

/** Fast pure-JavaScript PCM 16-bit WAV encoder for Web Audio `AudioBuffer` instances. */
export function encodeAudioBufferToWavBlob(audioBuf: AudioBuffer): Blob {
    const numChannels = audioBuf.numberOfChannels;
    const sampleRate = audioBuf.sampleRate;
    const numSamples = audioBuf.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
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
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    if (numChannels === 1) {
        const data = audioBuf.getChannelData(0);
        for (let i = 0; i < numSamples; i++) {
            const s = Math.max(-1, Math.min(1, data[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }
    } else {
        const channels: Float32Array[] = [];
        for (let c = 0; c < numChannels; c++) {
            channels.push(audioBuf.getChannelData(c));
        }
        for (let i = 0; i < numSamples; i++) {
            for (let c = 0; c < numChannels; c++) {
                const s = Math.max(-1, Math.min(1, channels[c][i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
                offset += 2;
            }
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Joint RMS + ZCR speech/static VAD trimmer that removes leading dead air, trailing silence,
 * and autoregressive decoder static with smooth cosine fades.
 */
export function cleanAndTrimAudioBuffer(
    audioBuf: AudioBufferWithFlags,
    audioCtx: AudioContext | null = null,
    wordCount = 10
): AudioBufferWithFlags {
    if (!audioBuf || audioBuf.duration <= 0.2) return audioBuf;

    const channelCount = audioBuf.numberOfChannels;
    const sampleRate = audioBuf.sampleRate;
    const totalSamples = audioBuf.length;
    const data = audioBuf.getChannelData(0);

    const windowSize = Math.floor(sampleRate * 0.025);
    const hopSize = Math.floor(sampleRate * 0.01);
    if (totalSamples <= windowSize) return audioBuf;

    const safeWords = Math.max(1, wordCount || 1);
    const maxSpeechDurationSec = Math.max(2.5, safeWords / 1.0 + 2.5);
    const maxSpeechSampleLimit = Math.min(
        totalSamples,
        Math.floor(maxSpeechDurationSec * sampleRate)
    );

    const isSpeechWindow = (startIdx: number): boolean => {
        let sumSq = 0;
        let zeroCrossings = 0;
        let prevVal = data[startIdx];

        for (let j = 0; j < windowSize; j++) {
            const val = data[startIdx + j];
            sumSq += val * val;
            if (j > 0 && ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0))) {
                zeroCrossings++;
            }
            prevVal = val;
        }

        const rms = Math.sqrt(sumSq / windowSize);
        const zcr = zeroCrossings / (windowSize - 1);

        if (rms < 0.006) return false;
        if (zcr > 0.42) return false;
        if (zcr > 0.35 && rms < 0.04) return false;
        return true;
    };

    let firstSpeechSample = -1;
    let lastSpeechSample = -1;

    for (let i = 0; i <= totalSamples - windowSize; i += hopSize) {
        if (i > maxSpeechSampleLimit) break;
        if (isSpeechWindow(i)) {
            if (firstSpeechSample === -1) {
                firstSpeechSample = i;
            }
            lastSpeechSample = i + windowSize;
        }
    }

    if (firstSpeechSample === -1 || lastSpeechSample <= firstSpeechSample) {
        console.warn(
            `[Audio Drama] Pure static or silent runaway chunk detected (${audioBuf.duration.toFixed(
                2
            )}s for ${safeWords} words).`
        );
        const AudioCtx = getAudioContextCtor();
        const ctx = audioCtx || new AudioCtx();
        const silenceSamples = Math.floor(sampleRate * 0.25);
        const silenceBuf = ctx.createBuffer(
            channelCount,
            silenceSamples,
            sampleRate
        ) as AudioBufferWithFlags;
        silenceBuf._isInvalidSpeech = true;
        return silenceBuf;
    }

    const prePadSamples = Math.floor(sampleRate * 0.06);
    const targetStartSample = Math.max(0, firstSpeechSample - prePadSamples);
    const postPadSamples = Math.floor(sampleRate * 0.15);
    const targetEndSample = Math.min(totalSamples, lastSpeechSample + postPadSamples);

    const leadingSilenceSec = targetStartSample / sampleRate;
    const trailingSilenceSec = (totalSamples - targetEndSample) / sampleRate;

    if (leadingSilenceSec < 0.12 && trailingSilenceSec < 0.25) {
        return audioBuf;
    }

    const trimmedLength = Math.max(
        Math.floor(sampleRate * 0.2),
        targetEndSample - targetStartSample
    );
    const AudioCtx = getAudioContextCtor();
    const ctx = audioCtx || new AudioCtx();
    const trimmedBuf = ctx.createBuffer(
        channelCount,
        trimmedLength,
        sampleRate
    ) as AudioBufferWithFlags;

    const fadeInLength = Math.min(Math.floor(sampleRate * 0.03), Math.floor(trimmedLength / 4));
    const fadeOutLength = Math.min(Math.floor(sampleRate * 0.04), Math.floor(trimmedLength / 4));
    const fadeOutStart = trimmedLength - fadeOutLength;

    for (let c = 0; c < channelCount; c++) {
        const src = audioBuf.getChannelData(c);
        const dst = trimmedBuf.getChannelData(c);

        const copyLen = Math.min(trimmedLength, totalSamples - targetStartSample);
        dst.set(src.subarray(targetStartSample, targetStartSample + copyLen));

        for (let f = 0; f < fadeInLength; f++) {
            const gain = 0.5 * (1 - Math.cos((Math.PI * f) / fadeInLength));
            dst[f] *= gain;
        }

        for (let f = 0; f < fadeOutLength; f++) {
            const gain = 0.5 * (1 + Math.cos((Math.PI * f) / fadeOutLength));
            dst[fadeOutStart + f] *= gain;
        }
    }

    if (leadingSilenceSec >= 0.15 || trailingSilenceSec >= 0.25) {
        console.log(
            `[Audio Drama] Cleaned & trimmed chunk (${audioBuf.duration.toFixed(
                2
            )}s -> ${trimmedBuf.duration.toFixed(2)}s | -${leadingSilenceSec.toFixed(
                2
            )}s lead, -${trailingSilenceSec.toFixed(2)}s tail).`
        );
    }

    return trimmedBuf;
}

export function trimTrailingAudioStatic(
    audioBuf: AudioBufferWithFlags,
    audioCtx: AudioContext | null = null,
    wordCount = 10
): AudioBufferWithFlags {
    return cleanAndTrimAudioBuffer(audioBuf, audioCtx, wordCount);
}

/** Decodes an audio Blob, trims silence and static, and re-encodes to a clean WAV Blob. */
export async function sanitizeAudioBlob(
    blob: Blob,
    wordCount = 10
): Promise<SanitizeAudioResult> {
    if (!blob || blob.size === 0) return { blob, isInvalid: false };
    const AudioCtx = getAudioContextCtor();
    const tempCtx = new AudioCtx();
    try {
        const ab = await blob.arrayBuffer();
        const rawBuf = await tempCtx.decodeAudioData(ab);
        const cleanedBuf = cleanAndTrimAudioBuffer(rawBuf, tempCtx, wordCount);
        if (cleanedBuf._isInvalidSpeech) {
            return { blob: encodeAudioBufferToWavBlob(cleanedBuf), isInvalid: true };
        }
        const cleanWavBlob = encodeAudioBufferToWavBlob(cleanedBuf);
        return { blob: cleanWavBlob, isInvalid: false };
    } catch (err) {
        console.warn('[Audio Drama] Could not decode/clean audio blob, using raw blob:', err);
        return { blob, isInvalid: false };
    } finally {
        try {
            await tempCtx.close();
        } catch {
            // Ignore close failure
        }
    }
}

// ---------------------------------------------------------------------------
// Reusable Web Worker for Off-Thread Wave 3 DSP & MP3 Encoding
// ---------------------------------------------------------------------------
const _studioWorkerState: {
    worker: Worker | null;
    readyPromise: Promise<boolean> | null;
    disabled: boolean;
    nextId: number;
    pending: Map<number, PendingWorkerEntry>;
} = {
    worker: null,
    readyPromise: null,
    disabled: false,
    nextId: 1,
    pending: new Map()
};

export function getStudioMasteringWorker(): Worker | null {
    if (_studioWorkerState.disabled || typeof Worker === 'undefined' || typeof Blob === 'undefined') {
        return null;
    }
    if (_studioWorkerState.worker) return _studioWorkerState.worker;
    try {
        const workerCode = [
            "'use strict';",
            "if (typeof self.window === 'undefined') { self.window = self; }",
            'var lameLoaded = false;',
            'function ensureWorkerLame() {',
            '  if (lameLoaded && self.lamejs && self.lamejs.Mp3Encoder) return self.lamejs;',
            `  importScripts('${CDN_URLS.lamejs}');`,
            '  var lib = self.lamejs || (self.window && self.window.lamejs);',
            "  if (!lib || !lib.Mp3Encoder) throw new Error('lamejs unavailable inside worker');",
            '  self.lamejs = lib;',
            '  lameLoaded = true;',
            '  return lib;',
            '}',
            'function measureIntegratedLufsW(samples, sampleRate) {',
            '  if (!samples || samples.length === 0) return -100;',
            '  var b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285;',
            '  var a1 = -1.69065929318241, a2 = 0.73248077421585;',
            '  var x1 = 0, x2 = 0, y1 = 0, y2 = 0;',
            '  var stage1 = new Float32Array(samples.length);',
            '  for (var i = 0; i < samples.length; i++) {',
            '    var x = samples[i];',
            '    var y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;',
            '    x2 = x1; x1 = x; y2 = y1; y1 = y;',
            '    stage1[i] = y;',
            '  }',
            '  var c0 = 1.0, c1 = -2.0, c2 = 1.0, d1 = -1.99004745483398, d2 = 0.99007225036621;',
            '  var rx1 = 0, rx2 = 0, ry1 = 0, ry2 = 0, meanSquare = 0;',
            '  for (var j = 0; j < stage1.length; j++) {',
            '    var sx = stage1[j];',
            '    var sy = c0 * sx + c1 * rx1 + c2 * rx2 - d1 * ry1 - d2 * ry2;',
            '    rx2 = rx1; rx1 = sx; ry2 = ry1; ry1 = sy;',
            '    meanSquare += sy * sy;',
            '  }',
            '  meanSquare /= samples.length;',
            '  if (meanSquare <= 1e-12) return -100;',
            '  return Math.round((-0.691 + 10 * Math.log10(meanSquare)) * 10) / 10;',
            '}',
            'function applyHighPass75HzW(samples, sampleRate) {',
            `  var omega = 2 * Math.PI * ${AUDIO_DSP_DEFAULTS.highPassHz} / sampleRate;`,
            '  var cosOmega = Math.cos(omega);',
            '  var alpha = Math.sin(omega) / (2 * Math.SQRT2);',
            '  var a0 = 1 + alpha;',
            '  var b0 = ((1 + cosOmega) / 2) / a0, b1 = (-(1 + cosOmega)) / a0, b2 = ((1 + cosOmega) / 2) / a0;',
            '  var a1 = (-2 * cosOmega) / a0, a2 = (1 - alpha) / a0;',
            '  var x1 = 0, x2 = 0, y1 = 0, y2 = 0;',
            '  for (var i = 0; i < samples.length; i++) {',
            '    var x = samples[i];',
            '    var y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;',
            '    x2 = x1; x1 = x; y2 = y1; y1 = y;',
            '    samples[i] = y;',
            '  }',
            '}',
            'function applyRaisedCosineFadesW(samples, sampleRate, fadeMs) {',
            `  var fadeSamples = Math.min(Math.floor(((fadeMs || ${AUDIO_DSP_DEFAULTS.fadeMs}) / 1000) * sampleRate), Math.floor(samples.length / 2));`,
            '  for (var i = 0; i < fadeSamples; i++) {',
            '    var gain = 0.5 * (1 - Math.cos(Math.PI * (i / fadeSamples)));',
            '    samples[i] *= gain;',
            '    samples[samples.length - 1 - i] *= gain;',
            '  }',
            '}',
            'function levelSamplesToLufsW(samples, sampleRate, targetLufs, peakLimitDb) {',
            '  var currentLufs = measureIntegratedLufsW(samples, sampleRate);',
            `  if (currentLufs <= ${AUDIO_DSP_DEFAULTS.silenceGateLufs}) return samples;`,
            '  var linearGain = Math.pow(10, (targetLufs - currentLufs) / 20);',
            '  var maxPeak = Math.pow(10, peakLimitDb / 20);',
            '  for (var i = 0; i < samples.length; i++) {',
            '    var s = samples[i] * linearGain;',
            '    if (s > maxPeak) s = maxPeak;',
            '    else if (s < -maxPeak) s = -maxPeak;',
            '    samples[i] = s;',
            '  }',
            '  return samples;',
            '}',
            'function encodeMp3ChunksW(samples, sampleRate, kbps) {',
            '  var lib = ensureWorkerLame();',
            `  var rawRate = Number(sampleRate) || ${AUDIO_DSP_DEFAULTS.defaultSampleRate};`,
            `  var standardRates = ${JSON.stringify(AUDIO_DSP_DEFAULTS.standardSampleRates)};`,
            `  var targetRate = standardRates.indexOf(rawRate) >= 0 ? rawRate : ${AUDIO_DSP_DEFAULTS.defaultSampleRate};`,
            '  var pcm = samples;',
            '  if (rawRate !== targetRate) {',
            '    var ratio = rawRate / targetRate;',
            '    var newLength = Math.round(samples.length / ratio);',
            '    var resampled = new Float32Array(newLength);',
            '    for (var i = 0; i < newLength; i++) {',
            '      var srcIdx = i * ratio;',
            '      var idxFloor = Math.floor(srcIdx);',
            '      var idxCeil = Math.min(samples.length - 1, idxFloor + 1);',
            '      var frac = srcIdx - idxFloor;',
            '      resampled[i] = samples[idxFloor] * (1 - frac) + samples[idxCeil] * frac;',
            '    }',
            '    pcm = resampled;',
            '  }',
            `  var mp3encoder = new lib.Mp3Encoder(1, targetRate, kbps || ${AUDIO_DSP_DEFAULTS.mp3BitrateKbps});`,
            '  var mp3Buffers = [];',
            '  var sampleBlockSize = 1152;',
            '  var pcmBlock = new Int16Array(sampleBlockSize);',
            '  var totalSamples = pcm.length;',
            '  for (var pos = 0; pos < totalSamples; pos += sampleBlockSize) {',
            '    var end = Math.min(pos + sampleBlockSize, totalSamples);',
            '    var blockLen = end - pos;',
            '    for (var j = 0; j < blockLen; j++) {',
            '      var s = Math.max(-1, Math.min(1, pcm[pos + j]));',
            '      pcmBlock[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;',
            '    }',
            '    var chunkToEncode = (blockLen === sampleBlockSize) ? pcmBlock : pcmBlock.subarray(0, blockLen);',
            '    var mp3buf = mp3encoder.encodeBuffer(chunkToEncode);',
            '    if (mp3buf && mp3buf.length > 0) {',
            '      var copy = new Uint8Array(mp3buf);',
            '      mp3Buffers.push(copy.buffer);',
            '    }',
            '  }',
            '  var mp3End = mp3encoder.flush();',
            '  if (mp3End && mp3End.length > 0) {',
            '    var copyEnd = new Uint8Array(mp3End);',
            '    mp3Buffers.push(copyEnd.buffer);',
            '  }',
            '  return mp3Buffers;',
            '}',
            'self.onmessage = function(ev) {',
            '  var msg = ev.data || {};',
            '  var id = msg.id;',
            '  try {',
            "    if (msg.type === 'init') {",
            '      ensureWorkerLame();',
            '      self.postMessage({ id: id, ok: true });',
            '      return;',
            '    }',
            "    if (msg.type === 'encode_mp3') {",
            '      var samples = new Float32Array(msg.buffer);',
            '      var buffers = encodeMp3ChunksW(samples, msg.sampleRate, msg.kbps);',
            '      self.postMessage({ id: id, ok: true, buffers: buffers }, buffers);',
            '      return;',
            '    }',
            "    if (msg.type === 'master_timeline') {",
            '      ensureWorkerLame();',
            `      var targetRate = Number(msg.targetRate) || ${AUDIO_DSP_DEFAULTS.defaultSampleRate};`,
            '      var masterTimeline = new Float32Array(msg.totalTimelineSamples);',
            '      var writePos = 0;',
            '      var items = msg.items || [];',
            '      for (var i = 0; i < items.length; i++) {',
            '        var it = items[i];',
            '        var src = new Float32Array(it.buffer);',
            `        var sr = Number(it.sampleRate) || ${AUDIO_DSP_DEFAULTS.defaultSampleRate};`,
            '        applyHighPass75HzW(src, sr);',
            `        applyRaisedCosineFadesW(src, sr, ${AUDIO_DSP_DEFAULTS.fadeMs});`,
            `        levelSamplesToLufsW(src, sr, Number(it.targetLufs), ${AUDIO_DSP_DEFAULTS.peakLimitDb});`,
            '        writePos += it.pauseSamples;',
            '        if (sr === targetRate) {',
            '          var copyLen = Math.min(src.length, masterTimeline.length - writePos);',
            '          masterTimeline.set(src.subarray(0, copyLen), writePos);',
            '          writePos += copyLen;',
            '        } else {',
            '          var ratio = sr / targetRate;',
            '          for (var s = 0; s < it.chunkSamples && (writePos + s) < masterTimeline.length; s++) {',
            '            var srcIdx = s * ratio;',
            '            var idxFloor = Math.floor(srcIdx);',
            '            var idxCeil = Math.min(src.length - 1, idxFloor + 1);',
            '            var frac = srcIdx - idxFloor;',
            '            masterTimeline[writePos + s] = src[idxFloor] * (1 - frac) + src[idxCeil] * frac;',
            '          }',
            '          writePos += it.chunkSamples;',
            '        }',
            '      }',
            '      var b0 = 0, b1 = 0, b2 = 0;',
            '      var linearGain = Math.pow(10, (Number(msg.roomToneDb) || -58.0) / 20);',
            `      var peakLimit = Math.pow(10, ${AUDIO_DSP_DEFAULTS.peakLimitDb} / 20);`,
            '      for (var k = 0; k < masterTimeline.length; k++) {',
            '        var white = Math.random() * 2 - 1;',
            '        b0 = 0.99765 * b0 + white * 0.0990460;',
            '        b1 = 0.96300 * b1 + white * 0.2965164;',
            '        b2 = 0.57000 * b2 + white * 1.0526913;',
            '        var pink = (b0 + b1 + b2 + white * 0.1848) * 0.5 * linearGain;',
            '        var val = masterTimeline[k] + pink;',
            '        if (val > peakLimit) val = peakLimit;',
            '        else if (val < -peakLimit) val = -peakLimit;',
            '        masterTimeline[k] = val;',
            '      }',
            '      var timelineAudioSec = Number((masterTimeline.length / targetRate).toFixed(2));',
            `      var mp3Buffers = encodeMp3ChunksW(masterTimeline, targetRate, msg.kbps || ${AUDIO_DSP_DEFAULTS.mp3BitrateKbps});`,
            '      self.postMessage({ id: id, ok: true, buffers: mp3Buffers, timelineSeconds: timelineAudioSec }, mp3Buffers);',
            '      return;',
            '    }',
            "    throw new Error('Unknown worker task type: ' + msg.type);",
            '  } catch (err) {',
            "    self.postMessage({ id: id, ok: false, error: (err && err.message) ? err.message : String(err) });",
            '  }',
            '};'
        ].join('\n');
        const workerUrl = URL.createObjectURL(
            new Blob([workerCode], { type: 'application/javascript' })
        );
        const worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        worker.onmessage = (ev: MessageEvent<StudioWorkerTaskResponse>) => {
            const msg = ev.data;
            if (!msg) return;
            const entry = _studioWorkerState.pending.get(msg.id);
            if (!entry) return;
            _studioWorkerState.pending.delete(msg.id);
            clearTimeout(entry.timer);
            if (msg.ok) entry.resolve(msg);
            else entry.reject(new Error(msg.error || 'Studio mastering worker error'));
        };
        worker.onerror = (err: ErrorEvent) => {
            _studioWorkerState.disabled = true;
            _studioWorkerState.readyPromise = null;
            _studioWorkerState.worker = null;
            for (const [pendingId, entry] of _studioWorkerState.pending.entries()) {
                clearTimeout(entry.timer);
                entry.reject(new Error(err?.message || 'Studio mastering worker terminated'));
                _studioWorkerState.pending.delete(pendingId);
            }
        };
        _studioWorkerState.worker = worker;
        return worker;
    } catch {
        _studioWorkerState.disabled = true;
        return null;
    }
}

export function postStudioWorkerTask(
    msg: Record<string, unknown>,
    transferList: Transferable[] = [],
    timeoutMs: number = TIMEOUTS_MS.masteringWorker
): Promise<StudioWorkerTaskResponse> {
    const worker = getStudioMasteringWorker();
    if (!worker) return Promise.reject(new Error('Studio mastering worker unavailable'));
    const id = _studioWorkerState.nextId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            _studioWorkerState.pending.delete(id);
            reject(new Error(`Studio mastering worker timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        _studioWorkerState.pending.set(id, { resolve, reject, timer });
        try {
            worker.postMessage({ ...msg, id }, transferList);
        } catch (postErr) {
            clearTimeout(timer);
            _studioWorkerState.pending.delete(id);
            reject(postErr);
        }
    });
}

export function ensureStudioMasteringWorkerReady(): Promise<boolean> {
    if (_studioWorkerState.disabled) return Promise.resolve(false);
    if (!_studioWorkerState.readyPromise) {
        _studioWorkerState.readyPromise = postStudioWorkerTask({ type: 'init' }, [], 15000)
            .then(() => true)
            .catch(() => {
                _studioWorkerState.readyPromise = null;
                return false;
            });
    }
    return _studioWorkerState.readyPromise;
}

export async function encodePcmInMasteringWorker(
    samples: Float32Array,
    sampleRate: number = AUDIO_DSP_DEFAULTS.defaultSampleRate,
    kbps: number = AUDIO_DSP_DEFAULTS.mp3BitrateKbps
): Promise<Blob> {
    const ready = await ensureStudioMasteringWorkerReady();
    if (!ready) throw new Error('Mastering worker lamejs init unavailable');
    const copy = new Float32Array(samples);
    const res = await postStudioWorkerTask(
        { type: 'encode_mp3', buffer: copy.buffer, sampleRate, kbps },
        [copy.buffer],
        TIMEOUTS_MS.masteringWorker
    );
    return new Blob(res.buffers || [], { type: 'audio/mpeg' });
}

/**
 * Encodes Float32 PCM samples into a broadcast-quality MP3 Blob via `lamejs`
 * (runs in a reusable Blob Web Worker when available, falling back to bundled `ensureLameJs`).
 */
export async function encodeFloat32PcmToMp3Blob(
    samples: Float32Array,
    sampleRate: number = AUDIO_DSP_DEFAULTS.defaultSampleRate,
    kbps: number = AUDIO_DSP_DEFAULTS.mp3BitrateKbps
): Promise<Blob> {
    if (!samples || samples.length === 0) {
        return new Blob([], { type: 'audio/mpeg' });
    }

    try {
        const workerBlob = await encodePcmInMasteringWorker(samples, sampleRate, kbps);
        if (workerBlob && workerBlob.size > 0) return workerBlob;
    } catch {
        // Fallback to main-thread bundled lamejs encoder
    }

    const lamejs = await ensureLameJs();
    if (!lamejs || !lamejs.Mp3Encoder) {
        throw new Error('MP3 encoder library failed to initialize.');
    }

    const rawRate = Number(sampleRate) || AUDIO_DSP_DEFAULTS.defaultSampleRate;
    const standardRates = AUDIO_DSP_DEFAULTS.standardSampleRates;
    const targetRate = standardRates.includes(rawRate)
        ? rawRate
        : AUDIO_DSP_DEFAULTS.defaultSampleRate;

    let pcm = samples;
    if (rawRate !== targetRate) {
        const ratio = rawRate / targetRate;
        const newLength = Math.round(samples.length / ratio);
        const resampled = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const srcIdx = i * ratio;
            const idxFloor = Math.floor(srcIdx);
            const idxCeil = Math.min(samples.length - 1, idxFloor + 1);
            const frac = srcIdx - idxFloor;
            resampled[i] = samples[idxFloor] * (1 - frac) + samples[idxCeil] * frac;
        }
        pcm = resampled;
    }

    const mp3encoder = new lamejs.Mp3Encoder(1, targetRate, kbps);
    const mp3Data: BlobPart[] = [];
    const sampleBlockSize = 1152;
    const pcmBlock = new Int16Array(sampleBlockSize);
    const totalSamples = pcm.length;

    for (let i = 0; i < totalSamples; i += sampleBlockSize) {
        const end = Math.min(i + sampleBlockSize, totalSamples);
        const blockLen = end - i;
        for (let j = 0; j < blockLen; j++) {
            const s = Math.max(-1, Math.min(1, pcm[i + j]));
            pcmBlock[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const chunkToEncode =
            blockLen === sampleBlockSize ? pcmBlock : pcmBlock.subarray(0, blockLen);
        const mp3buf = mp3encoder.encodeBuffer(chunkToEncode);
        if (mp3buf && mp3buf.length > 0) {
            const copy = new Uint8Array(mp3buf.length);
            copy.set(mp3buf);
            mp3Data.push(copy);
        }
    }

    const mp3End = mp3encoder.flush();
    if (mp3End && mp3End.length > 0) {
        const copyEnd = new Uint8Array(mp3End.length);
        copyEnd.set(mp3End);
        mp3Data.push(copyEnd);
    }

    return new Blob(mp3Data, { type: 'audio/mpeg' });
}

export async function ensureMp3AudioBlob(
    blob: Blob,
    kbps: number = AUDIO_DSP_DEFAULTS.mp3BitrateKbps
): Promise<Blob> {
    if (!(blob instanceof Blob) || blob.size === 0) return blob;
    if (blob.type === 'audio/mpeg' || blob.type === 'audio/mp3') return blob;
    try {
        const decoded = await decodeWavBlobDirect(blob);
        if (decoded && decoded.samples && decoded.samples.length > 0) {
            const mp3 = await encodeFloat32PcmToMp3Blob(
                decoded.samples,
                decoded.sampleRate || AUDIO_DSP_DEFAULTS.defaultSampleRate,
                kbps
            );
            if (mp3 && mp3.size > 0) return mp3;
        }
    } catch (err) {
        console.warn(
            '[Audio MP3] Failed converting audio blob to MP3, keeping original:',
            err instanceof Error ? err.message : err
        );
    }
    return blob;
}

/** Stitches an array of WAV/audio Blobs sequentially with a short silence gap and optional LUFS mastering. */
export async function stitchAudioBlobsWithPause(
    blobs: Blob[],
    pauseSec = 0.15,
    targetLufs: number | null = AUDIO_DSP_DEFAULTS.dialogueTargetLufs
): Promise<Blob | null> {
    if (!Array.isArray(blobs) || blobs.length === 0) return null;
    if (blobs.length === 1 && targetLufs === null) return blobs[0];

    const decodedList: DecodedAudioResult[] = [];
    for (const b of blobs) {
        try {
            const dec = await decodeAudioBlobToSamples(b);
            if (dec && dec.samples && dec.samples.length > 0) decodedList.push(dec);
        } catch {
            // Skip undecodable chunk
        }
    }
    if (decodedList.length === 0) return blobs[0] || null;

    const targetSr = decodedList[0].sampleRate || AUDIO_DSP_DEFAULTS.defaultSampleRate;
    const pauseSamples = Math.round(pauseSec * targetSr);
    const totalSamples = decodedList.reduce(
        (acc, d, idx) => acc + d.samples.length + (idx < decodedList.length - 1 ? pauseSamples : 0),
        0
    );
    const combined = new Float32Array(totalSamples);
    let offset = 0;

    for (let idx = 0; idx < decodedList.length; idx++) {
        const dt = decodedList[idx];
        if (dt.sampleRate === targetSr) {
            combined.set(dt.samples, offset);
            offset += dt.samples.length;
        } else {
            const outLen = Math.round(dt.samples.length * (targetSr / dt.sampleRate));
            const ratio = dt.sampleRate / targetSr;
            for (let s = 0; s < outLen && offset + s < combined.length; s++) {
                combined[offset + s] = dt.samples[Math.floor(s * ratio)] || 0;
            }
            offset += outLen;
        }
        if (idx < decodedList.length - 1) offset += pauseSamples;
    }

    if (typeof targetLufs === 'number' && Number.isFinite(targetLufs)) {
        applyHighPass75Hz(combined, targetSr);
        applyRaisedCosineFades(combined, targetSr, AUDIO_DSP_DEFAULTS.fadeMs);
        levelSamplesToLufs(combined, targetSr, targetLufs, AUDIO_DSP_DEFAULTS.peakLimitDb);
    }
    try {
        return await encodeFloat32PcmToMp3Blob(combined, targetSr, AUDIO_DSP_DEFAULTS.mp3BitrateKbps);
    } catch {
        return encodeFloat32PcmToWavBlob(combined, targetSr);
    }
}
