/**
 * @module services/audio/exporter
 * Broadcast MP3 stitching, scene-level MP3 export, sequence-level MP3 export
 * (with Hybrid Studio delegation + smart backend fallback), and streaming full-novel stitcher.
 */

import { AUDIO_DSP_DEFAULTS, DEFAULT_AUDIO_DRAMA_SETTINGS, type AudioDramaSettings } from '@/config';
import {
    applyHighPass75Hz,
    applyRaisedCosineFades,
    chunkProseForTts,
    computeSceneProseHash,
    computeSceneVoiceSignatureHash,
    generatePinkNoiseRoomTone,
    getLiveStoryForAudio,
    levelSamplesToLufs,
    parseAudioDramaScript,
    type AudioStoryLike
} from '@/domain/audio';
import { downloadBlob } from '@/services/browser';
import { ensureLameJs } from '@/services/documents';
import { cleanAndTrimAudioBuffer } from './codec';
import { logAudioStageComplete, logAudioStageError, logAudioStageStart } from './logger';
import { runStudioRenderJob, type StudioRenderJobResult } from './studioPipeline';
import { synthesizeAudioDramaChunk, type TtsChunkInput } from './synthesizer';

export interface StitchChunksOptions {
    dialoguePauseMs?: number;
    narratorPauseMs?: number;
    kbps?: number;
    returnMeta?: boolean;
}

export interface StitchedAudioWithMeta {
    blob: Blob;
    durationSec: number;
    cueTimeline: Array<{
        index: number;
        startSec: number;
        endSec: number;
        text: string;
        spokenText: string;
        speaker: string;
    }>;
}

export interface ExportSceneAudioParams {
    story: AudioStoryLike;
    seqIdx: number;
    sceneIdx: number;
    settings?: Partial<AudioDramaSettings> | Record<string, unknown>;
    mainApiKey?: string;
    mainOpenRouterKey?: string;
    kokoroWorkerRef?: { current: Worker | null } | null;
    activeQueue?: TtsChunkInput[];
    onProgress?: ((event: Record<string, unknown>) => void) | null;
    triggerDownload?: boolean;
    forceRerender?: boolean;
    forceRecalibrate?: boolean;
    deferFinalize?: boolean;
    signal?: AbortSignal | null;
}

export interface ExportedSceneAudioResult {
    fileName: string;
    blob: Blob;
    mp3Blob: Blob;
    mimeType: string;
    masterWavBlob?: null;
    durationSec: number;
    realtimeFactor?: number | null;
    wallSeconds?: number | null;
    cueTimeline: Array<Record<string, unknown>>;
    textHash: string;
    voiceSigHash: string;
    totalChunks: number;
}

export interface DeferredSceneExportResult {
    totalChunks: number;
    finalize: () => Promise<ExportedSceneAudioResult>;
}

export interface ExportSequenceAudioParams {
    story: AudioStoryLike;
    seqIdx: number;
    settings?: Partial<AudioDramaSettings> | Record<string, unknown>;
    mainApiKey?: string;
    mainOpenRouterKey?: string;
    kokoroWorkerRef?: { current: Worker | null } | null;
    activeQueue?: TtsChunkInput[];
    onProgress?: ((event: Record<string, unknown>) => void) | null;
    triggerDownload?: boolean;
}

export interface ExportedSequenceAudioResult {
    fileName: string;
    blob: Blob;
    mp3Blob: Blob;
    masterWavBlob?: null;
    durationSec: number;
    totalChunks: number;
    includedSceneIndices: number[];
    totalScenesInStructure: number;
    sceneHashes: Record<number, string>;
}

export interface StitchAudioClipItem {
    blob: Blob;
    label?: string;
    pauseAfterMs?: number | null;
}

export interface StitchBlobsOptions {
    kbps?: number;
    defaultPauseMs?: number;
    endPaddingMs?: number;
    onProgress?: ((info: { current: number; total: number; label: string }) => void) | null;
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

const getWindowStudioRenderJob = (): typeof runStudioRenderJob => {
    if (typeof window !== 'undefined') {
        const win = window as unknown as {
            StudioPipeline?: { runStudioRenderJob?: typeof runStudioRenderJob };
        };
        if (typeof win.StudioPipeline?.runStudioRenderJob === 'function') {
            return win.StudioPipeline.runStudioRenderJob;
        }
    }
    return runStudioRenderJob;
};

const getExportFallbackBackend = (backend: string): string | undefined => {
    const map: Record<string, string> = {
        hybrid: 'breeze',
        audiocpp: 'breeze',
        breeze: 'kokoro'
    };
    return map[backend];
};

/**
 * Stitches an array of synthesized audio chunks (`audioUrl` Blobs) with dramatic cadence
 * pauses and encodes the combined master audio stream into a broadcast-quality MP3 Blob.
 */
export async function stitchAndEncodeChunksToMp3(
    chunks: TtsChunkInput[],
    options: StitchChunksOptions & { returnMeta: true }
): Promise<StitchedAudioWithMeta>;
export async function stitchAndEncodeChunksToMp3(
    chunks: TtsChunkInput[],
    options?: StitchChunksOptions
): Promise<Blob | StitchedAudioWithMeta>;
export async function stitchAndEncodeChunksToMp3(
    chunks: TtsChunkInput[],
    options: StitchChunksOptions = {}
): Promise<Blob | StitchedAudioWithMeta> {
    const lamejs = await ensureLameJs();
    if (!lamejs || !lamejs.Mp3Encoder) {
        throw new Error('MP3 encoder library failed to initialize.');
    }

    const validChunks = (chunks || []).filter((c) => c && c.audioUrl);
    if (validChunks.length === 0) {
        throw new Error('No synthesized audio chunks available to encode.');
    }

    const dialoguePauseMs = options.dialoguePauseMs ?? 240;
    const narratorPauseMs = options.narratorPauseMs ?? 440;
    const kbps = options.kbps || AUDIO_DSP_DEFAULTS.mp3BitrateKbps;

    const AudioCtx = getAudioContextCtor();
    const tempCtx = new AudioCtx();
    const decodedItems: Array<{
        audioBuf: AudioBuffer;
        speaker: string;
        isNarrator: boolean;
        text: string;
        pauseAfterMs: number | undefined;
    }> = [];

    try {
        for (let i = 0; i < validChunks.length; i++) {
            const ch = validChunks[i];
            let ab: ArrayBuffer;
            try {
                const resp = await fetch(String(ch.audioUrl));
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                ab = await resp.arrayBuffer();
            } catch (fetchErr) {
                console.warn(
                    `[Audio Drama] Could not fetch audio blob for line ${i + 1} (${
                        ch.speaker || 'Narrator'
                    }):`,
                    fetchErr
                );
                continue;
            }
            if (!ab || ab.byteLength === 0) continue;

            const rawAudioBuf = await tempCtx.decodeAudioData(ab);
            const wordCount =
                ch.wordCount ||
                (ch.spokenText
                    ? (ch.spokenText.match(/\b\w+\b/g) || []).length
                    : ch.text
                      ? (ch.text.match(/\b\w+\b/g) || []).length
                      : 10);
            const audioBuf = cleanAndTrimAudioBuffer(rawAudioBuf, tempCtx, wordCount);

            decodedItems.push({
                audioBuf,
                speaker: ch.speaker || 'Narrator',
                isNarrator: !ch.speaker || String(ch.speaker).toLowerCase() === 'narrator',
                text: ch.cleanText || ch.spokenText || ch.text || '',
                pauseAfterMs: ch.pauseAfterMs
            });
        }
    } finally {
        try {
            await tempCtx.close();
        } catch {
            // Ignore AudioContext close error
        }
    }

    if (decodedItems.length === 0) {
        throw new Error('Failed to decode audio chunks.');
    }

    const rawSampleRate =
        decodedItems[0].audioBuf.sampleRate || AUDIO_DSP_DEFAULTS.fallbackTtsSampleRate;
    const targetSampleRate =
        rawSampleRate >= 16000 && rawSampleRate <= 48000
            ? rawSampleRate
            : AUDIO_DSP_DEFAULTS.fallbackTtsSampleRate;

    let totalLengthSamples = 0;
    const itemLayouts: Array<{
        item: (typeof decodedItems)[number];
        rawChannel: Float32Array;
        srcRate: number;
        chunkSamples: number;
        pauseSamples: number;
    }> = [];

    for (let i = 0; i < decodedItems.length; i++) {
        const item = decodedItems[i];
        const buf = item.audioBuf;

        const rawChannel = new Float32Array(buf.getChannelData(0));
        applyHighPass75Hz(rawChannel, buf.sampleRate);
        applyRaisedCosineFades(rawChannel, buf.sampleRate, AUDIO_DSP_DEFAULTS.fadeMs);
        const targetLufs = item.isNarrator
            ? AUDIO_DSP_DEFAULTS.narratorTargetLufs
            : AUDIO_DSP_DEFAULTS.dialogueTargetLufs;
        levelSamplesToLufs(rawChannel, buf.sampleRate, targetLufs, AUDIO_DSP_DEFAULTS.peakLimitDb);

        const chunkSamples = Math.round(buf.duration * targetSampleRate);
        let pauseSamples = 0;
        if (i < decodedItems.length - 1) {
            const currentIsNarrator = item.isNarrator;
            const nextIsNarrator = decodedItems[i + 1].isNarrator;
            const pauseMs =
                item.pauseAfterMs !== undefined && item.pauseAfterMs !== null
                    ? item.pauseAfterMs
                    : currentIsNarrator || nextIsNarrator
                      ? narratorPauseMs
                      : dialoguePauseMs;
            pauseSamples = Math.round((Math.max(0, pauseMs) / 1000) * targetSampleRate);
        }
        itemLayouts.push({
            item,
            rawChannel,
            srcRate: buf.sampleRate,
            chunkSamples,
            pauseSamples
        });
        totalLengthSamples += chunkSamples + pauseSamples;
    }

    const endPaddingSamples = Math.round(0.5 * targetSampleRate);
    totalLengthSamples += endPaddingSamples;

    const masterPcm = new Float32Array(totalLengthSamples);
    let writePos = 0;
    const cueTimeline: StitchedAudioWithMeta['cueTimeline'] = [];

    for (let i = 0; i < itemLayouts.length; i++) {
        const { item, rawChannel, srcRate, chunkSamples, pauseSamples } = itemLayouts[i];
        const chunkStartSamples = writePos;

        if (srcRate === targetSampleRate) {
            const copyLen = Math.min(rawChannel.length, masterPcm.length - writePos);
            masterPcm.set(rawChannel.subarray(0, copyLen), writePos);
            writePos += copyLen;
        } else {
            const ratio = srcRate / targetSampleRate;
            for (let s = 0; s < chunkSamples && writePos + s < masterPcm.length; s++) {
                const srcIdx = s * ratio;
                const idxFloor = Math.floor(srcIdx);
                const idxCeil = Math.min(rawChannel.length - 1, idxFloor + 1);
                const frac = srcIdx - idxFloor;
                masterPcm[writePos + s] =
                    rawChannel[idxFloor] * (1 - frac) + rawChannel[idxCeil] * frac;
            }
            writePos += chunkSamples;
        }

        const chunkEndSamples = writePos;
        const chunkStartSec = Number((chunkStartSamples / targetSampleRate).toFixed(3));
        const chunkEndSec = Number(
            Math.max(chunkStartSec + 0.05, chunkEndSamples / targetSampleRate).toFixed(3)
        );
        if (item.text) {
            cueTimeline.push({
                index: cueTimeline.length,
                startSec: chunkStartSec,
                endSec: chunkEndSec,
                text: item.text,
                spokenText: item.text,
                speaker: item.speaker || 'Narrator'
            });
        }

        writePos += pauseSamples;
    }

    const pinkBed = generatePinkNoiseRoomTone(masterPcm.length, -58.0);
    for (let k = 0; k < masterPcm.length; k++) {
        masterPcm[k] += pinkBed[k];
    }

    const mp3encoder = new lamejs.Mp3Encoder(1, targetSampleRate, kbps);
    const mp3Data: BlobPart[] = [];
    const sampleBlockSize = 1152;
    const pcmBlock = new Int16Array(sampleBlockSize);
    const totalSamples = masterPcm.length;

    for (let i = 0; i < totalSamples; i += sampleBlockSize) {
        const end = Math.min(i + sampleBlockSize, totalSamples);
        const blockLen = end - i;
        for (let j = 0; j < blockLen; j++) {
            const s = Math.max(-1, Math.min(1, masterPcm[i + j]));
            pcmBlock[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const chunkToEncode =
            blockLen === sampleBlockSize ? pcmBlock : pcmBlock.subarray(0, blockLen);
        const mp3buf = mp3encoder.encodeBuffer(chunkToEncode);
        if (mp3buf.length > 0) {
            const copy = new Uint8Array(mp3buf.length);
            copy.set(mp3buf);
            mp3Data.push(copy);
        }
    }

    const mp3End = mp3encoder.flush();
    if (mp3End.length > 0) {
        const copyEnd = new Uint8Array(mp3End.length);
        copyEnd.set(mp3End);
        mp3Data.push(copyEnd);
    }

    const outBlob = new Blob(mp3Data, { type: 'audio/mp3' });
    const durationSec = Number((totalLengthSamples / targetSampleRate).toFixed(2));
    if (options.returnMeta) {
        return { blob: outBlob, durationSec, cueTimeline };
    }
    return outBlob;
}

export async function exportSceneAudioMp3({
    story: initialStory,
    seqIdx,
    sceneIdx,
    settings,
    mainApiKey,
    mainOpenRouterKey,
    kokoroWorkerRef,
    activeQueue,
    onProgress,
    triggerDownload = true,
    forceRerender = false,
    forceRecalibrate = false,
    deferFinalize = false,
    signal = null
}: ExportSceneAudioParams): Promise<ExportedSceneAudioResult | DeferredSceneExportResult> {
    const isAbortErr = (err: unknown): boolean =>
        Boolean(
            signal?.aborted ||
                (err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted'))
        );
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }
    const story = (getLiveStoryForAudio(initialStory) || initialStory) as AudioStoryLike;
    const sceneAudioStartTime = performance.now();
    const sId = `${seqIdx}-${sceneIdx}`;
    logAudioStageStart(
        'scene_audio_export',
        `[Running] Export Scene Audio: Stage 1/5 Parsing Script & Dialogue Cues (Scene ${
            Number(seqIdx) + 1
        }.${Number(sceneIdx) + 1})`,
        { seqIdx, sceneIdx }
    );

    const proseObj = story?.prose?.[sId];
    const proseText =
        typeof proseObj === 'object' && proseObj !== null
            ? proseObj.final || proseObj.draft || ''
            : String(proseObj || '');

    if (!proseText.trim()) {
        throw new Error('No drafted prose or script found for this scene.');
    }

    const runSettings: Partial<AudioDramaSettings> & Record<string, unknown> = {
        ...(settings || DEFAULT_AUDIO_DRAMA_SETTINGS),
        ...(forceRerender ? { bypassCache: true, forceRerender: true } : {}),
        ...(forceRecalibrate ? { forceRecalibrate: true } : {})
    };
    const backend = String(runSettings.backend || 'audiocpp');

    if (backend === 'hybrid' || backend === 'audiocpp') {
        if (onProgress) {
            onProgress({
                current: 0,
                total: 100,
                stage: 'rendering',
                message: 'Starting Scene Audio Studio render job...'
            });
        }
        try {
            const renderRunner = getWindowStudioRenderJob();
            const jobRes = await renderRunner({
                story,
                scope: 'scene',
                seqIdx: Number(seqIdx),
                sceneIdx: Number(sceneIdx),
                settings: runSettings,
                deferMastering: Boolean(deferFinalize),
                signal,
                onProgress: ({
                    done,
                    total: rTotal,
                    step,
                    message,
                    chunkCurrent,
                    chunkTotal,
                    speaker
                }) => {
                    if (onProgress) {
                        onProgress({
                            current: done,
                            total: rTotal || 100,
                            stage: step,
                            message,
                            chunkCurrent,
                            chunkTotal,
                            speaker
                        });
                    }
                }
            });
            const buildExportFromRender = (
                renderRes: StudioRenderJobResult | null | undefined
            ): ExportedSceneAudioResult | null => {
                if (renderRes?.masterAudioUrl) {
                    try {
                        URL.revokeObjectURL(renderRes.masterAudioUrl);
                    } catch {
                        // Ignore revoke failure
                    }
                }
                const masterBlob =
                    renderRes?.masterMp3Blob ||
                    renderRes?.mp3Blob ||
                    renderRes?.blob ||
                    renderRes?.masterWavBlob;
                if (!renderRes || !masterBlob) return null;
                const liveAfterRender = (getLiveStoryForAudio(story) || story) as AudioStoryLike;
                const cleanStory = String(liveAfterRender?.title || 'Novel').replace(
                    /[^a-zA-Z0-9_-]/g,
                    '_'
                );
                const resolvedMime = masterBlob.type || 'audio/mpeg';
                const ext = resolvedMime.includes('wav') ? 'wav' : 'mp3';
                const fileName = `${cleanStory}_Seq${Number(seqIdx) + 1}_Scene${
                    Number(sceneIdx) + 1
                }_AudioDrama.${ext}`;
                if (triggerDownload !== false) {
                    downloadBlob(masterBlob, fileName);
                }
                const durationSec =
                    Number(renderRes.timelineSeconds) ||
                    Number(((performance.now() - sceneAudioStartTime) / 1000).toFixed(2)) ||
                    0;
                const textHash = computeSceneProseHash(proseText);
                const voiceSigHash = computeSceneVoiceSignatureHash(
                    proseText,
                    liveAfterRender,
                    runSettings
                );
                return {
                    fileName,
                    blob: masterBlob,
                    mp3Blob: masterBlob,
                    mimeType: resolvedMime,
                    masterWavBlob: null,
                    durationSec,
                    realtimeFactor: renderRes.realtimeFactor || null,
                    wallSeconds: renderRes.wallSeconds || null,
                    cueTimeline: Array.isArray(renderRes.cueTimeline)
                        ? renderRes.cueTimeline
                        : [],
                    textHash,
                    voiceSigHash,
                    totalChunks: renderRes.totalChunks || 1
                };
            };
            if (
                deferFinalize &&
                jobRes &&
                'deferredMastering' in jobRes &&
                typeof jobRes.deferredMastering === 'function'
            ) {
                return {
                    totalChunks: jobRes.totalChunks || 1,
                    finalize: async (): Promise<ExportedSceneAudioResult> => {
                        const renderRes = await jobRes.deferredMastering();
                        const out = buildExportFromRender(renderRes);
                        if (!out) throw new Error('Scene studio mastering produced empty audio.');
                        return out;
                    }
                };
            }
            const immediateOut = buildExportFromRender(jobRes as StudioRenderJobResult);
            if (immediateOut) return immediateOut;
        } catch (studioErr) {
            if (isAbortErr(studioErr)) {
                throw studioErr;
            }
            console.warn(
                '[Audio Studio] runStudioRenderJob encountered an error for scene, falling back to per-chunk synthesis:',
                studioErr
            );
        }
    }

    const dramaChunks = parseAudioDramaScript(proseText, {
        collapseNarrator: backend === 'breeze'
    }) as unknown as TtsChunkInput[];
    const hasExplicitDialogue = Boolean(
        dramaChunks &&
            dramaChunks.some((c) => c.speaker && c.speaker.toLowerCase() !== 'narrator')
    );
    const isDrama =
        story?.writing_mode === 'audio_drama' ||
        (hasExplicitDialogue && dramaChunks.length >= 2);
    const workingChunks: TtsChunkInput[] = isDrama
        ? dramaChunks
        : (chunkProseForTts(proseText) as unknown as TtsChunkInput[]);

    if (!workingChunks || workingChunks.length === 0) {
        logAudioStageError(
            'scene_audio_export',
            'No dialogue or narration lines found in this scene to export.',
            undefined,
            { seqIdx, sceneIdx }
        );
        throw new Error('No dialogue or narration lines found in this scene to export.');
    }

    logAudioStageComplete(
        'scene_audio_export',
        `[Completed] Export Scene Audio: Stage 1/5 Parsed ${workingChunks.length} Audio Drama Chunks`,
        {
            chunksCount: workingChunks.length,
            isDrama,
            hasExplicitDialogue
        }
    );

    logAudioStageStart(
        'scene_audio_export',
        '[Running] Export Scene Audio: Stage 2/5 Reusing In-Memory Blobs & Voice Alignment',
        {
            totalChunks: workingChunks.length,
            hasActiveQueue: Array.isArray(activeQueue) && activeQueue.length > 0
        }
    );

    if (Array.isArray(activeQueue) && activeQueue.length > 0) {
        workingChunks.forEach((targetChunk) => {
            const match = activeQueue.find(
                (qChunk) =>
                    qChunk &&
                    qChunk.audioUrl &&
                    (qChunk.spokenText || qChunk.text) ===
                        (targetChunk.spokenText || targetChunk.text) &&
                    (qChunk.speaker || 'Narrator').toLowerCase() ===
                        (targetChunk.speaker || 'Narrator').toLowerCase()
            );
            if (match && match.audioUrl) {
                targetChunk.audioUrl = match.audioUrl;
            }
        });
    }

    const total = workingChunks.length;
    const reusedCount = workingChunks.filter((c) => c.audioUrl).length;

    logAudioStageComplete(
        'scene_audio_export',
        `[Completed] Export Scene Audio: Stage 2/5 Voice Alignment Complete (${reusedCount}/${total} Chunks Reused from Memory)`,
        { reusedCount, pendingSynthesisCount: total - reusedCount, backend }
    );

    logAudioStageStart(
        'scene_audio_export',
        `[Running] Export Scene Audio: Stage 3/5 Multi-Voice Synthesis for ${
            total - reusedCount
        } Chunks`,
        { totalChunks: total, neededChunks: total - reusedCount, backend }
    );

    let effectiveBackend = backend;
    for (let i = 0; i < total; i++) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const chunk = workingChunks[i];
        if (!chunk.audioUrl) {
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total,
                    stage: 'synthesizing',
                    speaker: chunk.speaker || 'Narrator'
                });
            }
            try {
                if (effectiveBackend === 'system') effectiveBackend = 'kokoro';
                const audioUrl = await synthesizeAudioDramaChunk({
                    chunk,
                    chunkIndex: i,
                    totalChunks: total,
                    backend: effectiveBackend,
                    story,
                    settings: runSettings,
                    mainApiKey,
                    mainOpenRouterKey,
                    kokoroWorkerRef
                });
                chunk.audioUrl = audioUrl;
            } catch (synthErr) {
                if (isAbortErr(synthErr)) {
                    throw synthErr;
                }
                let fallbackSucceeded = false;
                let nextFb = getExportFallbackBackend(effectiveBackend);
                while (nextFb && !fallbackSucceeded) {
                    if (signal?.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    try {
                        console.warn(
                            `[Audio Drama] ${effectiveBackend} export failed on chunk ${
                                i + 1
                            }, falling back to ${nextFb}:`,
                            synthErr
                        );
                        effectiveBackend = nextFb;
                        const fallbackUrl = await synthesizeAudioDramaChunk({
                            chunk,
                            chunkIndex: i,
                            totalChunks: total,
                            backend: effectiveBackend,
                            story,
                            settings: runSettings,
                            mainApiKey,
                            mainOpenRouterKey,
                            kokoroWorkerRef
                        });
                        chunk.audioUrl = fallbackUrl;
                        fallbackSucceeded = true;
                    } catch (fbErr) {
                        if (isAbortErr(fbErr)) {
                            throw fbErr;
                        }
                        nextFb = getExportFallbackBackend(nextFb);
                    }
                }
                if (!fallbackSucceeded) throw synthErr;
            }
        }
    }

    logAudioStageComplete(
        'scene_audio_export',
        `[Completed] Export Scene Audio: Stage 3/5 All ${total} Chunks Synthesized & Ready`,
        { totalChunks: total, backend: effectiveBackend }
    );

    if (onProgress) onProgress({ current: total, total, stage: 'encoding' });

    const dialoguePauseMs = Number(runSettings?.dialoguePauseMs ?? 240);
    const narratorPauseMs = Number(runSettings?.narratorPauseMs ?? 440);
    logAudioStageStart(
        'scene_audio_export',
        '[Running] Export Scene Audio: Stage 4/5 Stitching & Encoding Broadcast MP3 (128kbps, DSP leveling)',
        {
            totalChunks: workingChunks.length,
            dialoguePauseMs,
            narratorPauseMs
        }
    );

    const stitchedMeta = await stitchAndEncodeChunksToMp3(workingChunks, {
        dialoguePauseMs,
        narratorPauseMs,
        kbps: AUDIO_DSP_DEFAULTS.mp3BitrateKbps,
        returnMeta: true
    });
    const mp3Blob = stitchedMeta.blob;
    const resolvedFallbackMime = mp3Blob?.type || 'audio/mpeg';
    const fallbackExt = resolvedFallbackMime.includes('wav') ? 'wav' : 'mp3';

    logAudioStageComplete(
        'scene_audio_export',
        `[Completed] Export Scene Audio: Stage 4/5 Master Broadcast MP3 Encoded (${(
            mp3Blob.size /
            1024 /
            1024
        ).toFixed(2)} MB)`,
        { sizeBytes: mp3Blob.size, totalChunks: workingChunks.length }
    );

    const cleanStory =
        String(story?.title || 'Story')
            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
            .trim() || 'Story';
    const scenesMap = story?.scenes as Record<string, Array<{ title?: string }>> | undefined;
    const sceneList = (scenesMap && (scenesMap[String(seqIdx)] || scenesMap[seqIdx])) || [];
    const sceneItem = sceneList[sceneIdx] || {};
    const cleanSceneTitle = String(
        sceneItem.title || `Scene_${seqIdx + 1}.${sceneIdx + 1}`
    )
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim();
    const fileName = `${cleanStory}_Scene_${seqIdx + 1}.${
        sceneIdx + 1
    }_${cleanSceneTitle}.${fallbackExt}`.replace(/\s+/g, '_');

    if (triggerDownload !== false) {
        downloadBlob(mp3Blob, fileName);
    }

    const totalExportSec = ((performance.now() - sceneAudioStartTime) / 1000).toFixed(2);
    logAudioStageComplete(
        'scene_audio_export',
        `[Completed] Export Scene Audio: Stage 5/5 Download Dispatched: ${fileName} (${totalExportSec}s Total)`,
        { fileName, sizeBytes: mp3Blob.size, totalExportSec }
    );

    const durationSec = Number(stitchedMeta.durationSec) || Number(totalExportSec) || 0;
    const textHash = computeSceneProseHash(proseText);
    const voiceSigHash = computeSceneVoiceSignatureHash(proseText, story, runSettings);
    return {
        fileName,
        blob: mp3Blob,
        mp3Blob,
        mimeType: resolvedFallbackMime,
        durationSec,
        cueTimeline: Array.isArray(stitchedMeta.cueTimeline) ? stitchedMeta.cueTimeline : [],
        textHash,
        voiceSigHash,
        totalChunks: workingChunks.length
    };
}

export async function exportSequenceAudioMp3({
    story,
    seqIdx,
    settings,
    mainApiKey,
    mainOpenRouterKey,
    kokoroWorkerRef,
    activeQueue,
    onProgress,
    triggerDownload = true
}: ExportSequenceAudioParams): Promise<ExportedSequenceAudioResult> {
    const seqAudioStartTime = performance.now();
    const safeSeq = parseInt(String(seqIdx), 10);
    logAudioStageStart(
        'sequence_audio_export',
        `[Running] Export Sequence Audio: Stage 1/5 Validating Scenes & Parsing Sequence Timeline (Sequence ${
            safeSeq + 1
        })`,
        { seqIdx: safeSeq }
    );

    if (isNaN(safeSeq) || safeSeq < 0) {
        throw new Error('Invalid sequence specified for export.');
    }

    const sequence = (story?.sequences || [])[safeSeq] || {};
    const seqNum = sequence.number || safeSeq + 1;
    const rawTitle = String(sequence.title || `Sequence ${seqNum}`).trim();
    const seqTitle = rawTitle.replace(/^Sequence\s+\d+[:\s-]*/i, '').trim() || rawTitle;

    const scenesMap = story?.scenes as Record<string, Array<Record<string, unknown>>> | undefined;
    const rawSceneList = (scenesMap && (scenesMap[String(safeSeq)] || scenesMap[safeSeq])) || [];
    const sceneList = Array.isArray(rawSceneList) ? rawSceneList : [];

    if (sceneList.length === 0) {
        throw new Error(`No scenes found in Sequence ${seqNum} to export.`);
    }

    const validScenes: Array<{
        sceneItem: Record<string, unknown>;
        sceneIdx: number;
        proseText: string;
    }> = [];
    sceneList.forEach((sceneItem, sIdx) => {
        const sId = `${safeSeq}-${sIdx}`;
        const proseObj = story?.prose?.[sId];
        const proseText =
            typeof proseObj === 'object' && proseObj !== null
                ? proseObj.final || proseObj.draft || ''
                : String(proseObj || '');
        if (proseText && proseText.trim()) {
            validScenes.push({
                sceneItem,
                sceneIdx: sIdx,
                proseText: proseText.trim()
            });
        }
    });

    if (validScenes.length === 0) {
        throw new Error(`No drafted prose found in any scene of Sequence ${seqNum} to export.`);
    }

    const introSpoken = seqTitle ? `Sequence ${seqNum}: ${seqTitle}.` : `Sequence ${seqNum}.`;
    const allChunks: TtsChunkInput[] = [
        {
            speaker: 'Narrator',
            spokenText: introSpoken,
            text: introSpoken,
            isSequenceIntro: true,
            pauseAfterMs: 1500
        }
    ];

    const settingsRec = (settings || {}) as Partial<AudioDramaSettings> & Record<string, unknown>;
    const backend = String(settingsRec.backend || 'audiocpp');

    validScenes.forEach((vs, idx) => {
        const isLastScene = idx === validScenes.length - 1;
        const dramaChunks = parseAudioDramaScript(vs.proseText, {
            collapseNarrator: backend === 'breeze'
        }) as unknown as TtsChunkInput[];
        const hasExplicitDialogue = Boolean(
            dramaChunks &&
                dramaChunks.some((c) => c.speaker && c.speaker.toLowerCase() !== 'narrator')
        );
        const isDrama =
            story?.writing_mode === 'audio_drama' ||
            (hasExplicitDialogue && dramaChunks.length >= 2);
        const sceneChunks: TtsChunkInput[] = isDrama
            ? dramaChunks
            : (chunkProseForTts(vs.proseText) as unknown as TtsChunkInput[]);

        if (Array.isArray(sceneChunks) && sceneChunks.length > 0) {
            sceneChunks.forEach((c) => {
                c._sceneNumber = `${seqNum}.${vs.sceneIdx + 1}`;
            });
            if (!isLastScene) {
                sceneChunks[sceneChunks.length - 1].pauseAfterMs = 2000;
            }
            allChunks.push(...sceneChunks);
        }
    });

    if (allChunks.length <= 1) {
        throw new Error(`No speakable dialogue or narration found in Sequence ${seqNum} to export.`);
    }

    if (Array.isArray(activeQueue) && activeQueue.length > 0) {
        allChunks.forEach((targetChunk) => {
            if (targetChunk.audioUrl) return;
            const match = activeQueue.find(
                (qChunk) =>
                    qChunk &&
                    qChunk.audioUrl &&
                    (qChunk.spokenText || qChunk.text) ===
                        (targetChunk.spokenText || targetChunk.text) &&
                    (qChunk.speaker || 'Narrator').toLowerCase() ===
                        (targetChunk.speaker || 'Narrator').toLowerCase()
            );
            if (match && match.audioUrl) {
                targetChunk.audioUrl = match.audioUrl;
            }
        });
    }

    const total = allChunks.length;
    const initialCachedCount = allChunks.filter((c) => c.audioUrl).length;

    logAudioStageComplete(
        'sequence_audio_export',
        `[Completed] Export Sequence Audio: Stage 1/5 Parsed ${validScenes.length} Scenes into ${allChunks.length} Broadcast Chunks`,
        { scenesCount: validScenes.length, totalChunks: allChunks.length, seqTitle, seqNum }
    );
    logAudioStageStart(
        'sequence_audio_export',
        '[Running] Export Sequence Audio: Stage 2/5 Voice Assignment & Cache Alignment',
        { totalChunks: allChunks.length, cachedCount: initialCachedCount }
    );
    logAudioStageComplete(
        'sequence_audio_export',
        `[Completed] Export Sequence Audio: Stage 2/5 Voice Assignment & Cache Alignment Ready (${initialCachedCount}/${allChunks.length} Cached)`,
        { cachedCount: initialCachedCount, uncachedCount: allChunks.length - initialCachedCount }
    );

    if (backend === 'hybrid' || backend === 'audiocpp') {
        if (onProgress) {
            onProgress({
                current: 0,
                total: 100,
                stage: 'rendering',
                message: 'Starting Sequence Audio Studio render job...'
            });
        }
        try {
            const renderRunner = getWindowStudioRenderJob();
            const renderRes = (await renderRunner({
                story,
                scope: 'sequence',
                seqIdx: safeSeq,
                settings: settingsRec,
                onProgress: ({
                    done,
                    total: rTotal,
                    step,
                    message,
                    chunkCurrent,
                    chunkTotal,
                    speaker
                }) => {
                    if (onProgress) {
                        onProgress({
                            current: done,
                            total: rTotal || 100,
                            stage: step,
                            message,
                            chunkCurrent,
                            chunkTotal,
                            speaker
                        });
                    }
                }
            })) as StudioRenderJobResult;

            const masterBlob =
                renderRes?.masterMp3Blob ||
                renderRes?.mp3Blob ||
                renderRes?.blob ||
                renderRes?.masterWavBlob;
            if (renderRes && masterBlob) {
                const cleanStory =
                    String(story?.title || 'Story')
                        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                        .trim() || 'Story';
                const seq = (story?.sequences || [])[safeSeq];
                const cleanSeqTitle = String(seq?.title || `Sequence_${safeSeq + 1}`)
                    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                    .trim();
                const fileName = `${cleanStory}_Sequence_${safeSeq + 1}_${cleanSeqTitle}.mp3`.replace(
                    /\s+/g,
                    '_'
                );

                if (triggerDownload !== false) {
                    downloadBlob(masterBlob, fileName);
                }
                const durationSec =
                    Number(renderRes.timelineSeconds) ||
                    Number(((performance.now() - seqAudioStartTime) / 1000).toFixed(2)) ||
                    0;
                return {
                    fileName,
                    blob: masterBlob,
                    mp3Blob: masterBlob,
                    masterWavBlob: null,
                    durationSec,
                    totalChunks: renderRes.totalChunks || 1,
                    includedSceneIndices: validScenes.map((vs) => vs.sceneIdx),
                    totalScenesInStructure: sceneList.length,
                    sceneHashes: Object.fromEntries(
                        validScenes.map((vs) => [vs.sceneIdx, computeSceneProseHash(vs.proseText)])
                    )
                };
            }
        } catch (studioErr) {
            console.warn(
                '[Audio Studio] runStudioRenderJob encountered an error, falling back to per-chunk sequence synthesis:',
                studioErr
            );
        }
    }

    logAudioStageStart(
        'sequence_audio_export',
        `[Running] Export Sequence Audio: Stage 3/5 Multi-Voice Synthesis for ${
            allChunks.length - initialCachedCount
        } Sequence Chunks`,
        {
            totalChunks: allChunks.length,
            uncachedCount: allChunks.length - initialCachedCount,
            backend
        }
    );

    let effectiveSeqBackend = backend;
    for (let i = 0; i < total; i++) {
        const chunk = allChunks[i];
        if (!chunk.audioUrl) {
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total,
                    stage: 'synthesizing',
                    speaker: chunk.speaker || 'Narrator',
                    sceneNumber: chunk._sceneNumber || null,
                    isIntro: Boolean(chunk.isSequenceIntro),
                    spokenText: chunk.spokenText || chunk.text,
                    pauseAfterMs: chunk.pauseAfterMs
                });
            }
            try {
                if (effectiveSeqBackend === 'system') effectiveSeqBackend = 'kokoro';
                const audioUrl = await synthesizeAudioDramaChunk({
                    chunk,
                    chunkIndex: i,
                    totalChunks: total,
                    backend: effectiveSeqBackend,
                    story,
                    settings: settingsRec || DEFAULT_AUDIO_DRAMA_SETTINGS,
                    mainApiKey,
                    mainOpenRouterKey,
                    kokoroWorkerRef
                });
                chunk.audioUrl = audioUrl;
            } catch (synthErr) {
                let fallbackSucceeded = false;
                let nextFb = getExportFallbackBackend(effectiveSeqBackend);
                while (nextFb && !fallbackSucceeded) {
                    try {
                        console.warn(
                            `[Audio Drama] ${effectiveSeqBackend} sequence export failed on chunk ${
                                i + 1
                            }, falling back to ${nextFb}:`,
                            synthErr
                        );
                        effectiveSeqBackend = nextFb;
                        const fallbackUrl = await synthesizeAudioDramaChunk({
                            chunk,
                            chunkIndex: i,
                            totalChunks: total,
                            backend: effectiveSeqBackend,
                            story,
                            settings: settingsRec || DEFAULT_AUDIO_DRAMA_SETTINGS,
                            mainApiKey,
                            mainOpenRouterKey,
                            kokoroWorkerRef
                        });
                        chunk.audioUrl = fallbackUrl;
                        fallbackSucceeded = true;
                    } catch {
                        nextFb = getExportFallbackBackend(nextFb);
                    }
                }
                if (!fallbackSucceeded) throw synthErr;
            }
        }
    }

    logAudioStageComplete(
        'sequence_audio_export',
        `[Completed] Export Sequence Audio: Stage 3/5 All ${total} Sequence Chunks Synthesized`,
        { totalChunks: total, backend: effectiveSeqBackend }
    );

    if (onProgress) onProgress({ current: total, total, stage: 'encoding' });

    logAudioStageStart(
        'sequence_audio_export',
        '[Running] Export Sequence Audio: Stage 4/5 Stitching & Encoding Master Sequence MP3 (128kbps, Inter-Scene Cadence Gaps)',
        { totalChunks: allChunks.length, scenesCount: validScenes.length }
    );

    const mp3Blob = (await stitchAndEncodeChunksToMp3(allChunks, {
        dialoguePauseMs: Number(settingsRec?.dialoguePauseMs ?? 240),
        narratorPauseMs: Number(settingsRec?.narratorPauseMs ?? 440),
        kbps: AUDIO_DSP_DEFAULTS.mp3BitrateKbps
    })) as Blob;

    logAudioStageComplete(
        'sequence_audio_export',
        `[Completed] Export Sequence Audio: Stage 4/5 Master Sequence MP3 Encoded Successfully (${(
            mp3Blob.size /
            1024 /
            1024
        ).toFixed(2)} MB)`,
        { sizeBytes: mp3Blob.size, totalChunks: allChunks.length }
    );

    const cleanStory =
        String(story?.title || 'Story')
            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
            .trim() || 'Story';
    const cleanSeqTitle =
        String(seqTitle).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || `Sequence_${seqNum}`;
    const fileName = `${cleanStory}_Sequence_${seqNum}_${cleanSeqTitle}.mp3`.replace(/\s+/g, '_');

    if (triggerDownload !== false) {
        downloadBlob(mp3Blob, fileName);
    }

    const totalSeqSec = ((performance.now() - seqAudioStartTime) / 1000).toFixed(2);
    logAudioStageComplete(
        'sequence_audio_export',
        `[Completed] Export Sequence Audio: Stage 5/5 Sequence Audio Download Dispatched: ${fileName} (${totalSeqSec}s Total)`,
        { fileName, sizeBytes: mp3Blob.size, totalSeqSec, scenesCount: validScenes.length }
    );

    return {
        fileName,
        blob: mp3Blob,
        mp3Blob,
        durationSec: Number(totalSeqSec) || 0,
        totalChunks: total,
        includedSceneIndices: validScenes.map((vs) => vs.sceneIdx),
        totalScenesInStructure: sceneList.length,
        sceneHashes: Object.fromEntries(
            validScenes.map((vs) => [vs.sceneIdx, computeSceneProseHash(vs.proseText)])
        )
    };
}

/**
 * Stitches an ordered list of existing audio Blobs (scene/sequence MP3/WAV blobs)
 * into a single MP3 Blob using streaming frame-aligned LAME encoding.
 */
export async function stitchAudioBlobsToMp3(
    items: StitchAudioClipItem[],
    options: StitchBlobsOptions = {}
): Promise<Blob> {
    const list = (items || []).filter((it) => it && it.blob);
    if (list.length === 0) {
        throw new Error('No audio clips available to stitch.');
    }

    if (list.length === 1) {
        const singleBlob = list[0].blob;
        const mime = String(singleBlob.type || '').toLowerCase();
        if (mime.includes('mpeg') || mime.includes('mp3')) {
            if (typeof options.onProgress === 'function') {
                options.onProgress({ current: 1, total: 1, label: list[0].label || 'Audio' });
            }
            return singleBlob;
        }
    }

    const lamejs = await ensureLameJs();
    if (!lamejs || !lamejs.Mp3Encoder) {
        throw new Error('MP3 encoder library failed to initialize.');
    }

    const kbps = options.kbps || AUDIO_DSP_DEFAULTS.mp3BitrateKbps;
    const defaultPauseMs = options.defaultPauseMs ?? 2000;
    const endPaddingMs = options.endPaddingMs ?? 500;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    const AudioCtx = getAudioContextCtor();
    const audioCtx = new AudioCtx();
    let mp3encoder: InstanceType<typeof lamejs.Mp3Encoder> | null = null;
    const mp3Data: BlobPart[] = [];
    const sampleBlockSize = 1152;
    const pcmBlock = new Int16Array(sampleBlockSize);
    const zeroBlock = new Int16Array(sampleBlockSize);
    let pcmBlockPos = 0;
    let targetSampleRate: number = AUDIO_DSP_DEFAULTS.defaultSampleRate;

    const pushMp3Frame = (encoder: InstanceType<typeof lamejs.Mp3Encoder>, chunk: Int16Array): void => {
        const mp3buf = encoder.encodeBuffer(chunk);
        if (mp3buf && mp3buf.length > 0) {
            const copy = new Uint8Array(mp3buf.length);
            copy.set(mp3buf);
            mp3Data.push(copy);
        }
    };

    const pushFloatSample = (val: number): void => {
        if (!mp3encoder) return;
        const s = Math.max(-1, Math.min(1, val));
        pcmBlock[pcmBlockPos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (pcmBlockPos === sampleBlockSize) {
            pushMp3Frame(mp3encoder, pcmBlock);
            pcmBlockPos = 0;
        }
    };

    const pushSilenceSamples = (count: number): void => {
        if (!mp3encoder) return;
        let remaining = Math.max(0, Math.round(count));
        if (remaining === 0) return;
        if (pcmBlockPos > 0) {
            const fillCount = Math.min(remaining, sampleBlockSize - pcmBlockPos);
            pcmBlock.fill(0, pcmBlockPos, pcmBlockPos + fillCount);
            pcmBlockPos += fillCount;
            remaining -= fillCount;
            if (pcmBlockPos === sampleBlockSize) {
                pushMp3Frame(mp3encoder, pcmBlock);
                pcmBlockPos = 0;
            }
        }
        while (remaining >= sampleBlockSize) {
            pushMp3Frame(mp3encoder, zeroBlock);
            remaining -= sampleBlockSize;
        }
        if (remaining > 0) {
            pcmBlock.fill(0, 0, remaining);
            pcmBlockPos = remaining;
        }
    };

    try {
        let encodedClipCount = 0;
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: list.length,
                    label: item.label || `Clip ${i + 1}`
                });
            }
            const arrayBuf = await item.blob.arrayBuffer();
            if (!arrayBuf || arrayBuf.byteLength === 0) continue;

            const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
            if (!mp3encoder) {
                const standardRates = [16000, 22050, 24000, 32000, 44100, 48000];
                const rawRate = Number(audioBuf.sampleRate) || 44100;
                targetSampleRate = standardRates.includes(rawRate) ? rawRate : 44100;
                mp3encoder = new lamejs.Mp3Encoder(1, targetSampleRate, kbps);
            }

            const numChannels = audioBuf.numberOfChannels || 1;
            const len = audioBuf.length;
            let monoSamples: Float32Array;
            if (numChannels === 1) {
                monoSamples = audioBuf.getChannelData(0);
            } else {
                monoSamples = new Float32Array(len);
                for (let ch = 0; ch < numChannels; ch++) {
                    const chData = audioBuf.getChannelData(ch);
                    for (let s = 0; s < len; s++) {
                        monoSamples[s] += chData[s] / numChannels;
                    }
                }
            }

            if (audioBuf.sampleRate === targetSampleRate) {
                for (let s = 0; s < monoSamples.length; s++) {
                    pushFloatSample(monoSamples[s]);
                }
            } else {
                const ratio = audioBuf.sampleRate / targetSampleRate;
                const outLen = Math.round(monoSamples.length / ratio);
                for (let s = 0; s < outLen; s++) {
                    const srcIdx = s * ratio;
                    const idxFloor = Math.floor(srcIdx);
                    const idxCeil = Math.min(monoSamples.length - 1, idxFloor + 1);
                    const frac = srcIdx - idxFloor;
                    const sample =
                        monoSamples[idxFloor] * (1 - frac) + monoSamples[idxCeil] * frac;
                    pushFloatSample(sample);
                }
            }

            encodedClipCount++;

            if (i < list.length - 1) {
                const pauseMs =
                    item.pauseAfterMs !== undefined && item.pauseAfterMs !== null
                        ? item.pauseAfterMs
                        : defaultPauseMs;
                pushSilenceSamples((Math.max(0, pauseMs) / 1000) * targetSampleRate);
            }

            await new Promise((r) => setTimeout(r, 0));
        }

        if (encodedClipCount === 0 || !mp3encoder) {
            throw new Error('Failed to decode stored audio clips for MP3 stitching.');
        }

        if (endPaddingMs > 0) {
            pushSilenceSamples((endPaddingMs / 1000) * targetSampleRate);
        }
        if (pcmBlockPos > 0) {
            pushMp3Frame(mp3encoder, pcmBlock.subarray(0, pcmBlockPos));
            pcmBlockPos = 0;
        }
        const mp3End = mp3encoder.flush();
        if (mp3End && mp3End.length > 0) {
            const copyEnd = new Uint8Array(mp3End.length);
            copyEnd.set(mp3End);
            mp3Data.push(copyEnd);
        }

        return new Blob(mp3Data, { type: 'audio/mpeg' });
    } finally {
        try {
            await audioCtx.close();
        } catch {
            // Ignore AudioContext close error
        }
    }
}
