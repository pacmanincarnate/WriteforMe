/**
 * @module services/audio/synthesizer
 * Multi-backend Audio Drama TTS synthesizer routing across Audio.cpp (Breeze 2 &
 * Fish Drama-3), OpenRouter (ElevenLabs v4), Gemini 3.8 Flash TTS, and Kokoro Web Worker.
 */

import {
    APP_HTTP_HEADERS,
    CLOUD_API_URLS,
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_SERVICE_URLS,
    DEFAULT_TTS_MODELS,
    migrateAudioDramaSettings,
    type AudioDramaSettings
} from '@/config';
import {
    RAIN_SENTENCE,
    applyHighPass75Hz,
    applyRaisedCosineFades,
    cleanCharacterNameFromVoiceProfile,
    cleanDialogueSpokenText,
    computeRmsDb,
    computeSpeakersVoiceSignatureHash,
    encodeFloat32PcmToWavBlob,
    estimateReferenceTextSeconds,
    extractSpokenAndTags,
    getDeterministicVoiceSeed,
    getLiveStoryForAudio,
    getVoiceDescriptionForCharacter,
    getVoiceReferenceTextForCharacter,
    isValidVoiceRefPath,
    levelSamplesToLufs,
    mapCharacterToElevenLabsVoice,
    mapCharacterToGeminiVoice,
    mapCharacterToKokoroVoice,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import { resolveCharacter } from '@/domain/story';
import { fetchWithTimeout } from '@/services/http';
import { studioCacheStore } from '@/services/storage';
import {
    activateAudioCppWave,
    enqueueAudioCppTask,
    liveAudioCppWaveState
} from './audiocppQueue';
import {
    base64AudioToBlob,
    decodeAudioBlobToSamples,
    decodeWavBlobDirect,
    encodeFloat32PcmToMp3Blob,
    sanitizeAudioBlob,
    stitchAudioBlobsWithPause
} from './codec';
import { logAudioStageComplete, logAudioStageError, logAudioStageStart } from './logger';
import {
    buildDrama3Payload,
    ensureSpeakerMasterVoice,
    resolveSpeakersMasterMap,
    toDrama3HttpBody,
    type Drama3ChunkInput
} from './masterVoices';

export interface TtsChunkInput extends Drama3ChunkInput {
    chunkId?: string;
    engine?: string;
    spokenText?: string;
    text?: string;
    rawSpoken?: string;
    cleanText?: string;
    breezeText?: string;
    drama3Text?: string;
    speaker?: string;
    speakerObj?: VoiceCastMember;
    emotion?: string | null;
    wordCount?: number;
    pauseAfterMs?: number;
    model?: string;
    modelId?: string;
    audioUrl?: string;
    splitReason?: string;
    isSequenceIntro?: boolean;
    _sceneNumber?: string | null;
}

export interface SynthesizeDrama3SegmentParams {
    chunk: TtsChunkInput;
    chunkIndex?: number;
    totalChunks?: number;
    story?: AudioStoryLike | null;
    settings?: Partial<AudioDramaSettings> | Record<string, unknown>;
    signal?: AbortSignal | null;
}

export interface SynthesizeChunkParams {
    chunk: TtsChunkInput;
    chunkIndex?: number;
    totalChunks?: number;
    backend?: string;
    story?: AudioStoryLike | null;
    settings?: Partial<AudioDramaSettings> | Record<string, unknown>;
    mainApiKey?: string;
    mainOpenRouterKey?: string;
    kokoroWorkerRef?: { current: Worker | null } | null;
    signal?: AbortSignal | null;
}

interface KokoroWindowHooks {
    StudioPipeline?: unknown;
    _ellipsisGetOrCreateTtsWorker?: () => Worker;
    _ellipsisInitTtsEngine?: () => void;
    _ellipsisKokoroModelReady?: boolean;
    _ellipsisKokoroInitializing?: boolean;
}

const getKokoroHooks = (): KokoroWindowHooks | undefined =>
    typeof window !== 'undefined' ? (window as unknown as KokoroWindowHooks) : undefined;

export function hashLiveSegmentSig(str: string): string {
    let h = 2166136261;
    const s = String(str || '');
    for (let k = 0; k < s.length; k++) {
        h ^= s.charCodeAt(k);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

/**
 * Synthesizes a 1-to-2 minute multi-character Drama-3 scene segment for Live Reader playback,
 * reusing Wave 1 cached Master Voices when available and falling back to per-turn Breeze 2.
 */
export async function synthesizeDrama3SegmentChunk({
    chunk,
    chunkIndex = 0,
    totalChunks = 1,
    story,
    settings,
    signal = null
}: SynthesizeDrama3SegmentParams): Promise<string> {
    const startTime = performance.now();
    const effectiveSettings = migrateAudioDramaSettings(
        settings || DEFAULT_AUDIO_DRAMA_SETTINGS
    ) as Partial<AudioDramaSettings> & Record<string, unknown>;
    let bridgeUrl = String(
        effectiveSettings.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
    ).trim();
    if (!/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = 'http://' + bridgeUrl;
    bridgeUrl = bridgeUrl.replace(/\/+$/, '');

    let audioCppUrl = String(
        effectiveSettings.audioCppUrl || DEFAULT_SERVICE_URLS.audioCpp
    ).trim();
    if (!/^https?:\/\//i.test(audioCppUrl)) audioCppUrl = 'http://' + audioCppUrl;
    audioCppUrl = audioCppUrl.replace(/\/+$/, '');

    const storyId = String(story?.id || story?.title || 'story').replace(/[^a-zA-Z0-9_-]/g, '_');
    const turns = Array.isArray(chunk?.turns) ? chunk.turns : [];
    const uniqueSpeakersForSig = Array.from(
        new Set(turns.map((t) => String(t.speakerKey || t.speaker || 'Narrator')))
    ).filter(Boolean);
    const liveStoryForSig = getLiveStoryForAudio(story);
    const voiceSig = computeSpeakersVoiceSignatureHash(
        uniqueSpeakersForSig,
        liveStoryForSig,
        effectiveSettings
    );
    const sig =
        turns
            .map(
                (t) =>
                    `${String(t.speakerKey || t.speaker || 'Narrator')}:${String(
                        t.drama3Text || t.spokenText || t.cleanText || ''
                    )}`
            )
            .join('|') + `||voices:${voiceSig}`;
    const cacheId = `${storyId}_live_${chunk?.chunkId || chunkIndex}_w${
        chunk?.wordCount || 0
    }_h${hashLiveSegmentSig(sig)}`;

    if (!effectiveSettings.bypassCache && !effectiveSettings.forceRerender) {
        try {
            const cached = await studioCacheStore.getRender(cacheId);
            if (cached && cached.audioBlob && cached.engine === 'drama3_multi') {
                const dec = await decodeAudioBlobToSamples(cached.audioBlob).catch(() => null);
                if (dec && dec.samples && dec.samples.length > 0 && computeRmsDb(dec.samples) > -55.0) {
                    console.log(
                        `[Audio Drama Live] Reusing cached Drama-3 Segment ${
                            chunkIndex + 1
                        }/${totalChunks} (${cacheId}).`
                    );
                    return URL.createObjectURL(cached.audioBlob);
                }
            }
        } catch {
            // Fall through to live synthesis on cache read failure
        }
    }

    const uniqueSpeakers = Array.from(
        new Set(turns.map((t) => String(t.speakerKey || t.speaker || 'Narrator')))
    ).filter(Boolean);
    const breezeModelId =
        typeof effectiveSettings.breezeModelId === 'string' &&
        effectiveSettings.breezeModelId &&
        effectiveSettings.breezeModelId !== 'breeze_director'
            ? effectiveSettings.breezeModelId
            : 'breeze-tts';

    return enqueueAudioCppTask(async () => {
        if (signal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
        }

        const activateBridgeWave = (waveNum: number, timeoutMs = 60000): Promise<boolean> =>
            activateAudioCppWave(bridgeUrl, waveNum, signal, timeoutMs, effectiveSettings);

        const { anchorsMap } = await resolveSpeakersMasterMap(
            uniqueSpeakers,
            story,
            effectiveSettings,
            bridgeUrl,
            signal,
            () => activateBridgeWave(1, 30000)
        );

        await activateBridgeWave(2, 60000);
        let activeDramaId = liveAudioCppWaveState.dramaModelId;
        const probeFresh = Date.now() - liveAudioCppWaveState.checkedAt > 15000;
        if (!activeDramaId || probeFresh) {
            activeDramaId = null;
            const probeInit: RequestInit = { method: 'GET', ...(signal ? { signal } : {}) };
            const mRes = await fetchWithTimeout(`${bridgeUrl}/v1/models`, probeInit, 4000)
                .catch(() => fetchWithTimeout(`${audioCppUrl}/v1/models`, probeInit, 4000))
                .catch(() => null);
            if (mRes && mRes.ok) {
                const mJson = (await mRes.json().catch(() => null)) as {
                    data?: Array<{ id?: string; family?: string }>;
                } | null;
                const list = Array.isArray(mJson?.data)
                    ? mJson.data
                    : Array.isArray(mJson)
                      ? (mJson as Array<{ id?: string; family?: string }>)
                      : [];
                const targetId = String(effectiveSettings.dramaModelId || 'drama-3');
                const match =
                    list.find((m) => m?.id === targetId) ||
                    list.find((m) => m?.id === 'drama-3') ||
                    list.find((m) => m?.id === 'fish-drama3') ||
                    list.find((m) => m?.family === 'fish_drama3') ||
                    list.find(
                        (m) => typeof m?.id === 'string' && m.id.toLowerCase().includes('drama')
                    );
                if (match && match.id) activeDramaId = match.id;
            }
            liveAudioCppWaveState.dramaModelId = activeDramaId;
            liveAudioCppWaveState.checkedAt = Date.now();
        }

        let rawDramaBlob: Blob | null = null;
        let lastErr: Error | null = null;

        if (activeDramaId) {
            for (let attempt = 0; attempt < 2; attempt++) {
                const dramaPayload = buildDrama3Payload(
                    chunk,
                    anchorsMap,
                    effectiveSettings,
                    attempt,
                    activeDramaId
                );
                if (
                    dramaPayload.speaker_slots.length > 1 &&
                    dramaPayload.references_meta.length === 0
                ) {
                    lastErr = new Error(
                        `Missing valid voice references for [${(
                            dramaPayload.missing_ref_speakers || []
                        ).join(', ')}]`
                    );
                    console.warn(
                        `[Audio Drama Live] Segment ${chunkIndex + 1}/${totalChunks} has ${
                            dramaPayload.speaker_slots.length
                        } speakers but lacks valid voice references; skipping single-voice Drama-3 tts and falling back to per-turn Breeze 2 synthesis.`
                    );
                    break;
                }
                const wireBody = toDrama3HttpBody(dramaPayload);
                console.log(
                    `[Audio Drama Live] Dispatching Segment ${chunkIndex + 1}/${totalChunks} to Drama-3 [${dramaPayload.model}] | ` +
                        `~${chunk.estimatedDurationSec || 60}s (${chunk.wordCount} words, ${turns.length} turns, split=${
                            chunk.splitReason || 'auto'
                        }) | Speakers (${dramaPayload.speaker_slots.length}): ${dramaPayload.speaker_slots.join(
                            ', '
                        )} | max_tokens=${dramaPayload.max_tokens}, attempt=${attempt + 1}`
                );
                try {
                    const postInit: RequestInit = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(wireBody),
                        ...(signal ? { signal } : {})
                    };
                    let res = await fetchWithTimeout(
                        `${bridgeUrl}/v1/audio/speech`,
                        postInit,
                        600000
                    ).catch(() => null);

                    if (!res || res.status === 502 || res.status === 404) {
                        if (!res || res.status === 502) liveAudioCppWaveState.activeWave = 0;
                        res = await fetchWithTimeout(
                            `${audioCppUrl}/v1/audio/speech`,
                            postInit,
                            600000
                        ).catch(() => null);
                    }

                    if (res && res.ok) {
                        rawDramaBlob = await res.blob();
                        break;
                    } else if (res) {
                        const errTxt = await res.text().catch(() => '');
                        lastErr = new Error(`Drama-3 HTTP ${res.status}: ${errTxt || res.statusText}`);
                        if (
                            res.status === 400 &&
                            /context_length|max_tokens/i.test(errTxt) &&
                            attempt === 0
                        ) {
                            console.warn(
                                `[Audio Drama Live] Retrying Segment ${chunkIndex + 1}/${totalChunks} with tighter max_tokens cap for server context window...`
                            );
                            continue;
                        }
                        if (
                            res.status >= 500 &&
                            /could not open WAV input/i.test(errTxt) &&
                            attempt === 0
                        ) {
                            console.warn(
                                `[Audio Drama Live] Missing reference WAV on disk for Segment ${
                                    chunkIndex + 1
                                }/${totalChunks}; checking & recalibrating missing speaker(s) in Wave 1...`
                            );
                            const liveStoryNow = getLiveStoryForAudio(story);
                            const segSpeakers = dramaPayload.speaker_slots || uniqueSpeakers;
                            const missingSegSpeakers: string[] = [];
                            for (const segSpk of segSpeakers) {
                                const curRec = (anchorsMap.get(segSpk) ||
                                    anchorsMap.get(segSpk + '_master')) as
                                    | { uploadKey?: string }
                                    | undefined;
                                let okOnDisk = false;
                                if (
                                    curRec?.uploadKey &&
                                    !(errTxt && errTxt.includes(curRec.uploadKey))
                                ) {
                                    const hRes = await fetchWithTimeout(
                                        `${bridgeUrl}/voices/${encodeURIComponent(
                                            curRec.uploadKey
                                        )}`,
                                        { method: 'HEAD', ...(signal ? { signal } : {}) },
                                        2000
                                    ).catch(() => null);
                                    okOnDisk = Boolean(hRes && hRes.ok);
                                }
                                if (!okOnDisk) missingSegSpeakers.push(segSpk);
                            }
                            if (missingSegSpeakers.length > 0) {
                                await activateBridgeWave(1, 30000);
                                for (const segSpk of missingSegSpeakers) {
                                    try {
                                        const rec = await ensureSpeakerMasterVoice(
                                            segSpk,
                                            liveStoryNow,
                                            { ...effectiveSettings, forceRecalibrate: true },
                                            bridgeUrl,
                                            signal
                                        );
                                        const lowerSpk = String(segSpk).trim().toLowerCase();
                                        anchorsMap.set(segSpk + '_master', rec);
                                        anchorsMap.set(segSpk, rec);
                                        if (lowerSpk) {
                                            anchorsMap.set(lowerSpk + '_master', rec);
                                            anchorsMap.set(lowerSpk, rec);
                                        }
                                    } catch {
                                        // Continue calibrating other missing speakers
                                    }
                                }
                                await activateBridgeWave(2, 60000);
                                continue;
                            }
                        }
                    } else {
                        lastErr = new Error(
                            `Could not reach Audio Studio Bridge (${bridgeUrl}) or Audio.cpp (${audioCppUrl}).`
                        );
                    }
                } catch (reqErr) {
                    if (
                        signal?.aborted ||
                        (reqErr instanceof Error && reqErr.name === 'AbortError')
                    ) {
                        throw reqErr;
                    }
                    lastErr = reqErr instanceof Error ? reqErr : new Error(String(reqErr));
                }
                break;
            }
        }

        if (rawDramaBlob) {
            const decoded = await decodeWavBlobDirect(rawDramaBlob);
            if (
                decoded &&
                decoded.samples &&
                decoded.samples.length > 0 &&
                computeRmsDb(decoded.samples) > -55.0
            ) {
                applyHighPass75Hz(decoded.samples, decoded.sampleRate);
                applyRaisedCosineFades(decoded.samples, decoded.sampleRate, 15);
                levelSamplesToLufs(decoded.samples, decoded.sampleRate, -18.0, -1.5);
                let masteredBlob: Blob;
                try {
                    masteredBlob = await encodeFloat32PcmToMp3Blob(
                        decoded.samples,
                        decoded.sampleRate,
                        128
                    );
                } catch {
                    masteredBlob = encodeFloat32PcmToWavBlob(decoded.samples, decoded.sampleRate);
                }
                try {
                    await studioCacheStore.putRender(cacheId, {
                        audioBlob: masteredBlob,
                        transcript: null,
                        engine: 'drama3_multi',
                        textHash: hashLiveSegmentSig(sig)
                    });
                } catch {
                    // Cache write failures are non-fatal for live playback
                }
                const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
                const actualDurNum = decoded.samples.length / (decoded.sampleRate || 44100);
                const actualDur = actualDurNum.toFixed(1);
                const segRtX = (actualDurNum / elapsedSec).toFixed(2);
                const fmtLabel = masteredBlob.type === 'audio/mpeg' ? 'MP3' : 'WAV';
                console.log(
                    `[Audio Drama Live] Completed Drama-3 Segment ${
                        chunkIndex + 1
                    }/${totalChunks} (${actualDur}s audio, ${(masteredBlob.size / 1024).toFixed(
                        1
                    )} KB ${fmtLabel}) in ${elapsedSec.toFixed(1)}s (${segRtX}x realtime).`
                );
                return URL.createObjectURL(masteredBlob);
            }
            lastErr = new Error('Drama-3 returned silent or empty WAV output.');
        }

        console.warn(
            `[Audio Drama Live] Drama-3 unavailable for Segment ${
                chunkIndex + 1
            }/${totalChunks} (${
                lastErr?.message || 'no model'
            }); attempting Breeze 2 Wave 1 fallback...`
        );
        await activateBridgeWave(1, 30000);
        const turnBlobs: Blob[] = [];
        for (const turn of turns) {
            if (signal?.aborted) {
                const abortErr = new Error('Aborted');
                abortErr.name = 'AbortError';
                throw abortErr;
            }
            const spk = String(turn.speakerKey || turn.speaker || 'NARRATOR');
            const anchor = anchorsMap.get(spk + '_master') || anchorsMap.get(spk);
            const turnText = String(
                turn.breezeText || turn.spokenText || turn.cleanText || turn.text || ''
            );
            const isRefValid = isValidVoiceRefPath(anchor?.refPath);
            const turnDirs = turn.actingDirections as string[] | undefined;
            const turnStyle =
                Array.isArray(turnDirs) && turnDirs.length > 0
                    ? `Speaking style: ${turnDirs.join(', ')}.`
                    : 'Speak clearly and naturally.';
            const turnPayload = {
                model: breezeModelId,
                task: isRefValid ? 'clone' : 'tts',
                input: turnText,
                ...(isRefValid && anchor
                    ? {
                          voice_ref: anchor.refPath,
                          reference_text: anchor.referenceText || RAIN_SENTENCE
                      }
                    : {}),
                instruction: turnStyle,
                instruct: turnStyle,
                instructions: turnStyle,
                temperature: 0.35,
                seed: getDeterministicVoiceSeed(spk, story) || chunk.baseSeed || 42,
                response_format: 'wav'
            };
            const turnInit: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(turnPayload),
                ...(signal ? { signal } : {})
            };
            let tRes = await fetchWithTimeout(
                `${bridgeUrl}/v1/audio/speech`,
                turnInit,
                45000
            ).catch(() => null);
            if (!tRes || tRes.status === 502 || tRes.status === 404) {
                tRes = await fetchWithTimeout(
                    `${audioCppUrl}/v1/audio/speech`,
                    turnInit,
                    45000
                ).catch(() => null);
            }
            if (tRes && tRes.ok) {
                turnBlobs.push(await tRes.blob());
            }
        }
        if (turnBlobs.length > 0) {
            const stitched = await stitchAudioBlobsWithPause(turnBlobs, 0.15, -18.0);
            if (stitched) return URL.createObjectURL(stitched);
        }

        throw (
            lastErr ||
            new Error('Could not reach Audio.cpp Hybrid Studio for Drama-3 or Breeze 2 synthesis.')
        );
    });
}

/**
 * Core backend dispatcher for synthesizing a single Audio Drama turn or multi-character
 * Drama-3 segment into an Object URL.
 */
export async function _rawSynthesizeAudioDramaChunk({
    chunk,
    chunkIndex = 0,
    totalChunks = 1,
    backend = 'audiocpp',
    story = null,
    settings = {},
    mainApiKey = '',
    mainOpenRouterKey = '',
    kokoroWorkerRef = null,
    signal = null
}: SynthesizeChunkParams): Promise<string> {
    if (
        !chunk ||
        (!chunk.spokenText && !chunk.text && !(Array.isArray(chunk.turns) && chunk.turns.length > 0))
    ) {
        throw new Error('No spoken text provided for audio synthesis chunk.');
    }

    if (chunk.engine === 'drama3_multi' && Array.isArray(chunk.turns) && chunk.turns.length > 0) {
        if (backend === 'hybrid' || backend === 'audiocpp') {
            return synthesizeDrama3SegmentChunk({
                chunk,
                chunkIndex,
                totalChunks,
                story,
                settings,
                signal
            });
        }
        if (chunk.turns.length > 1 && backend !== 'system') {
            const turnBlobs: Blob[] = [];
            for (let tIdx = 0; tIdx < chunk.turns.length; tIdx++) {
                if (signal?.aborted) {
                    const abortErr = new Error('Aborted');
                    abortErr.name = 'AbortError';
                    throw abortErr;
                }
                const t = chunk.turns[tIdx];
                const subChunk: TtsChunkInput = {
                    ...t,
                    speaker: String(t.speaker || 'Narrator'),
                    spokenText: String(t.cleanText || t.spokenText || t.text || ''),
                    rawSpoken: String(t.rawSpoken || t.drama3Text || t.text || ''),
                    breezeText: String(t.breezeText || t.cleanText || t.text || '')
                };
                const turnUrl = await _rawSynthesizeAudioDramaChunk({
                    chunk: subChunk,
                    chunkIndex: tIdx,
                    totalChunks: chunk.turns.length,
                    backend,
                    story,
                    settings,
                    mainApiKey,
                    mainOpenRouterKey,
                    kokoroWorkerRef,
                    signal
                });
                try {
                    const resp = await fetch(turnUrl);
                    turnBlobs.push(await resp.blob());
                } finally {
                    try {
                        URL.revokeObjectURL(turnUrl);
                    } catch {
                        // Ignore revoke failure
                    }
                }
            }
            const stitched = await stitchAudioBlobsWithPause(turnBlobs, 0.15, -18.0);
            if (!stitched) throw new Error('Failed stitching multi-turn fallback audio.');
            return URL.createObjectURL(stitched);
        }
    }

    const synthStartTime = performance.now();
    const cleanText = String(chunk.spokenText || chunk.text || '').trim();
    const spokenTextOnly = cleanDialogueSpokenText(cleanText);
    const spokenWordCount = (spokenTextOnly.match(/\b\w+\b/g) || []).length || 1;
    const rawSourceText = String(chunk.rawSpoken || chunk.text || chunk.spokenText || cleanText);
    const tagData = extractSpokenAndTags(rawSourceText);
    const breezeSpokenText = String(chunk.breezeText || tagData?.breezeText || cleanText).trim();

    const isAudioCppOrBreeze =
        backend === 'hybrid' || backend === 'audiocpp' || backend === 'breeze';
    const hasSpeakableWords = Boolean(spokenTextOnly && /[a-zA-Z0-9]/.test(spokenTextOnly));
    const hasVocalEvents = Boolean(breezeSpokenText && /\([a-z\s]+\)/i.test(breezeSpokenText));

    if (!hasSpeakableWords && (!isAudioCppOrBreeze || !hasVocalEvents)) {
        throw new Error('Chunk contains no speakable words after stripping stage directions.');
    }

    const speakerLabel = chunk.speaker || 'Narrator';
    const voiceDescription = getVoiceDescriptionForCharacter(speakerLabel, story);
    const lineTag = `Line ${chunkIndex + 1}/${totalChunks}`;
    const effSettingsRec = settings as Partial<AudioDramaSettings> & Record<string, unknown>;

    // Backend 1: Audio.cpp (Breeze 2 Single-Line Previews / Expressive Narration / Drama-3 Previews)
    if (backend === 'hybrid' || backend === 'audiocpp' || backend === 'breeze') {
        const effectiveSettings = migrateAudioDramaSettings(settings) as Partial<AudioDramaSettings> &
            Record<string, unknown>;
        let targetUrl = String(
            effectiveSettings.studioBridgeUrl ||
                effectiveSettings.audioCppUrl ||
                DEFAULT_SERVICE_URLS.audioStudioBridge
        ).trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'http://' + targetUrl;
        }
        targetUrl = targetUrl.replace(/\/+$/, '');

        const modelId =
            backend === 'breeze'
                ? typeof effectiveSettings.breezeModelId === 'string' &&
                  effectiveSettings.breezeModelId &&
                  effectiveSettings.breezeModelId !== 'breeze_director'
                    ? effectiveSettings.breezeModelId
                    : 'breeze-tts'
                : chunk.model ||
                  chunk.modelId ||
                  (typeof effectiveSettings.breezeModelId === 'string' &&
                  effectiveSettings.breezeModelId &&
                  effectiveSettings.breezeModelId !== 'breeze_director'
                      ? effectiveSettings.breezeModelId
                      : 'breeze-tts');
        const castList = Array.isArray(story?.cast) ? story.cast : [];
        const matchedChar = resolveCharacter(speakerLabel, castList) as VoiceCastMember | null;

        const baseDesc = cleanCharacterNameFromVoiceProfile(voiceDescription, [
            speakerLabel,
            matchedChar?.name
        ]).replace(/\.+$/, '');
        const dirParts: string[] = [];
        if (chunk.emotion && chunk.emotion.trim()) {
            const cleanedEmo = chunk.emotion
                .trim()
                .replace(/^[[(*]+|[\])*]+$/g, '')
                .replace(/^(?:speaking style|speaking-style|style|tone|emotional delivery|delivery)\s*:\s*/i, '')
                .trim()
                .replace(/\.+$/, '');
            if (cleanedEmo) dirParts.push(cleanedEmo);
        }
        if (tagData && Array.isArray(tagData.actingDirections)) {
            for (const d of tagData.actingDirections) {
                const dt = String(d || '').trim().replace(/\.+$/, '');
                if (dt && !dirParts.some((p) => p.toLowerCase() === dt.toLowerCase())) {
                    dirParts.push(dt);
                }
            }
        }
        const expressionText = dirParts.join(', ');

        let promptInstruction = baseDesc
            ? expressionText
                ? `${baseDesc}. speaking style: ${expressionText}.`
                : `${baseDesc}.`
            : expressionText
              ? `speaking style: ${expressionText}.`
              : '';
        if (promptInstruction.length > 2048) {
            promptInstruction = promptInstruction.substring(0, 2045).trim() + '...';
        }

        const enableSeed = effSettingsRec?.enableDeterministicSeed !== false;
        const speakerSeed = enableSeed ? getDeterministicVoiceSeed(speakerLabel, story) : undefined;
        const isDramaModel = /drama/i.test(String(modelId));
        const dramaRawText = String(chunk.drama3Text || tagData?.drama3Text || cleanText).trim();
        const finalInput = isDramaModel
            ? dramaRawText
            : (breezeSpokenText || spokenTextOnly || '').trim();

        const rawCppTemp = effSettingsRec?.audioCppTemperature;
        const effectiveTemp = isDramaModel
            ? typeof effectiveSettings.dramaAudioTemperature === 'number'
                ? effectiveSettings.dramaAudioTemperature
                : 0.9
            : typeof effectiveSettings.breezeAudioTemperature === 'number'
              ? effectiveSettings.breezeAudioTemperature
              : typeof rawCppTemp === 'number' && Number.isFinite(rawCppTemp)
                ? Math.max(0.1, Math.min(1.0, rawCppTemp))
                : 0.35;

        const wordCount = (finalInput.match(/\b\w+\b/g) || []).length || 1;
        const tokenCap = Math.min(2048, Math.max(64, Math.ceil(wordCount * 20) + 48));

        return enqueueAudioCppTask(async () => {
            if (signal?.aborted) {
                const abortErr = new Error('Aborted');
                abortErr.name = 'AbortError';
                throw abortErr;
            }

            if (!isDramaModel) {
                await activateAudioCppWave(targetUrl, 1, signal, 30000);
            }

            let anchorRecord = null;
            try {
                anchorRecord = await ensureSpeakerMasterVoice(
                    chunk.speakerObj || speakerLabel,
                    story,
                    effectiveSettings,
                    targetUrl,
                    signal
                );
            } catch (anchorErr) {
                console.warn(
                    `[Audio Drama TTS] Master voice calibration error for "${speakerLabel}":`,
                    anchorErr instanceof Error ? anchorErr.message : anchorErr
                );
            }

            const isAnchored = isValidVoiceRefPath(anchorRecord?.refPath);
            const refText =
                anchorRecord?.referenceText ||
                getVoiceReferenceTextForCharacter(chunk.speakerObj || speakerLabel, story) ||
                RAIN_SENTENCE;
            const dramaRefsJson =
                isDramaModel && isAnchored && anchorRecord
                    ? JSON.stringify([
                          {
                              text: `<|speaker:0|> ${refText}`,
                              audio_path: String(anchorRecord.refPath).replace(/\\/g, '/')
                          }
                      ])
                    : null;
            const dramaTopP =
                typeof effectiveSettings.dramaAudioTopP === 'number'
                    ? effectiveSettings.dramaAudioTopP
                    : 0.9;
            const dramaTopK =
                typeof effectiveSettings.dramaAudioTopK === 'number'
                    ? effectiveSettings.dramaAudioTopK
                    : 30;
            const payload = isDramaModel
                ? {
                      model: modelId,
                      task: isAnchored ? 'clon' : 'tts',
                      input: isAnchored ? `<|speaker:0|> ${finalInput}` : finalInput,
                      temperature: effectiveTemp,
                      top_p: dramaTopP,
                      top_k: dramaTopK,
                      max_tokens: tokenCap,
                      ...(speakerSeed !== undefined ? { seed: speakerSeed } : {}),
                      response_format: 'wav',
                      options: {
                          ...(dramaRefsJson ? { references: dramaRefsJson } : {}),
                          text_chunk_size: '4000',
                          max_tokens: String(tokenCap),
                          temperature: String(effectiveTemp),
                          top_p: String(dramaTopP),
                          top_k: String(dramaTopK)
                      }
                  }
                : {
                      model: modelId,
                      task: isAnchored ? 'clone' : 'tts',
                      input: finalInput,
                      ...(isAnchored && anchorRecord
                          ? {
                                voice_ref: anchorRecord.refPath,
                                reference_text: refText
                            }
                          : {}),
                      instruct: promptInstruction,
                      instructions: promptInstruction,
                      instruction: promptInstruction,
                      max_tokens: tokenCap,
                      max_new_tokens: tokenCap,
                      ...(speakerSeed !== undefined ? { seed: speakerSeed } : {}),
                      temperature: effectiveTemp,
                      response_format: 'wav'
                  };

            console.log(
                `[Audio Drama TTS] Dispatching ${lineTag} to Audio.cpp Studio [${modelId}] (${targetUrl}/v1/audio/speech) | Speaker: "${speakerLabel}" (Seed #${
                    speakerSeed ?? 'none'
                }, Temp ${effectiveTemp}) [Acoustic Anchor: ${
                    isAnchored
                        ? `LOCKED (Master, Ref ~${estimateReferenceTextSeconds(refText)}s)`
                        : 'UNLOCKED'
                }]${expressionText ? ` | Delivery: [${expressionText}]` : ''}\n` +
                    `  -> Spoken Input (${finalInput.length} chars, ${wordCount} words): "${finalInput.substring(
                        0,
                        120
                    )}${finalInput.length > 120 ? '...' : ''}"` +
                    (isAnchored
                        ? `\n  -> Reference Text (${refText.length} chars): "${refText.substring(
                              0,
                              120
                          )}${refText.length > 120 ? '...' : ''}"`
                        : '')
            );

            let res: Response;
            const dynamicTimeoutMs = Math.min(90000, Math.max(30000, wordCount * 1200 + 10000));
            try {
                res = await fetchWithTimeout(
                    `${targetUrl}/v1/audio/speech`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        ...(signal ? { signal } : {})
                    },
                    dynamicTimeoutMs
                );
            } catch (fetchErr) {
                if (signal?.aborted || (fetchErr instanceof Error && fetchErr.name === 'AbortError')) {
                    throw fetchErr;
                }
                let errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
                if (/failed to fetch|networkerror/i.test(errMsg)) {
                    errMsg = `Could not reach Audio Studio Bridge or Audio.cpp at ${targetUrl}. Ensure 'Start Backends.bat' or 'node audio-studio-bridge.js' is running.`;
                }
                throw new Error(errMsg, { cause: fetchErr });
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(
                    `Audio.cpp Hybrid Studio TTS error (${res.status}): ${errText || res.statusText}`
                );
            }

            const rawBlob = await res.blob();
            const sanitized = await sanitizeAudioBlob(rawBlob, wordCount);
            const finalBlob = sanitized.blob;

            const elapsedMs = Math.round(performance.now() - synthStartTime);
            console.log(
                `[Audio Drama TTS] Completed ${lineTag} (${speakerLabel}) in ${elapsedMs}ms — ready (${(
                    finalBlob.size / 1024
                ).toFixed(1)} KB WAV).`
            );
            return URL.createObjectURL(finalBlob);
        });
    }

    // Backend 2: OpenRouter (ElevenLabs v4 with inline tag & voice auto-mapping)
    if (backend === 'openrouter') {
        const effectiveKey = String(
            effSettingsRec.openRouterApiKey || mainOpenRouterKey || ''
        ).trim();
        if (!effectiveKey) {
            throw new Error(
                'OpenRouter API Key is missing. Please configure it in Settings under Audio Drama or Model Options.'
            );
        }

        const modelId = String(effSettingsRec.openRouterModel || 'elevenlabs/eleven-v4');
        const mappedVoice = mapCharacterToElevenLabsVoice(
            voiceDescription,
            chunk.speaker || speakerLabel
        );

        let formattedInput = spokenTextOnly;
        if (chunk.emotion) {
            const cleanEmo = chunk.emotion.trim().replace(/^[[(*]+|[\])*]+$/g, '');
            if (
                /^(whispering|whisper|sighs|sigh|laughs|laughing|gasp|gasps|shouting|crying|sobbing)$/i.test(
                    cleanEmo
                )
            ) {
                formattedInput = `[${cleanEmo.toLowerCase()}] ${spokenTextOnly}`;
            }
        }

        const payload = {
            model: modelId,
            input: formattedInput,
            voice: mappedVoice,
            response_format: 'mp3'
        };

        let res: Response;
        try {
            res = await fetchWithTimeout(
                CLOUD_API_URLS.openRouterAudioSpeech,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${effectiveKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': APP_HTTP_HEADERS.referer,
                        'X-Title': APP_HTTP_HEADERS.audioDramaTitle
                    },
                    body: JSON.stringify(payload),
                    ...(signal ? { signal } : {})
                },
                45000
            );
        } catch (netErr) {
            if (signal?.aborted || (netErr instanceof Error && netErr.name === 'AbortError')) {
                throw netErr;
            }
            throw new Error(
                `OpenRouter network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
                { cause: netErr }
            );
        }

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`OpenRouter TTS error (${res.status}): ${errText || res.statusText}`);
        }

        const blob = await res.blob();
        const cleanBlob = (await sanitizeAudioBlob(blob, spokenWordCount)).blob;
        return URL.createObjectURL(cleanBlob);
    }

    // Backend 3: Gemini API (Google 3.8 Flash TTS / Interactions endpoint)
    if (backend === 'gemini') {
        const effectiveKey = String(effSettingsRec.geminiApiKey || mainApiKey || '').trim();
        if (!effectiveKey) {
            throw new Error(
                'Gemini API Key is missing. Please configure it in Settings under Audio Drama or Model Options.'
            );
        }

        const modelId = String(effSettingsRec.geminiModel || DEFAULT_TTS_MODELS.geminiTts);
        const mappedVoice = mapCharacterToGeminiVoice(
            voiceDescription,
            chunk.speaker || speakerLabel
        );

        const payload = {
            model: modelId,
            input: [
                {
                    type: 'user_input',
                    content: [
                        {
                            type: 'text',
                            text: spokenTextOnly,
                            annotations: chunk.emotion
                                ? [
                                      {
                                          type: 'speech_metadata',
                                          style: chunk.emotion
                                      }
                                  ]
                                : []
                        }
                    ]
                }
            ],
            response_format: { type: 'audio' },
            generation_config: {
                speech_config: [{ voice: mappedVoice }]
            }
        };

        let res: Response;
        try {
            res = await fetchWithTimeout(
                CLOUD_API_URLS.geminiInteractions,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': effectiveKey
                    },
                    body: JSON.stringify(payload),
                    ...(signal ? { signal } : {})
                },
                45000
            );
        } catch (netErr) {
            if (signal?.aborted || (netErr instanceof Error && netErr.name === 'AbortError')) {
                throw netErr;
            }
            throw new Error(
                `Gemini network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
                { cause: netErr }
            );
        }

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Gemini TTS API error (${res.status}): ${errText || res.statusText}`);
        }

        const json = (await res.json()) as {
            output_audio?: { data?: string };
            steps?: Array<{ content?: Array<{ type?: string; data?: string }> }>;
            candidates?: Array<{
                content?: { parts?: Array<{ inlineData?: { data?: string } }> };
            }>;
        };
        let b64Audio: string | null = null;

        if (json.output_audio && json.output_audio.data) {
            b64Audio = json.output_audio.data;
        } else if (Array.isArray(json.steps)) {
            for (const step of json.steps) {
                if (Array.isArray(step.content)) {
                    for (const c of step.content) {
                        if (c.type === 'audio' && c.data) {
                            b64Audio = c.data;
                            break;
                        }
                    }
                }
                if (b64Audio) break;
            }
        } else if (Array.isArray(json.candidates) && json.candidates[0]?.content?.parts) {
            for (const part of json.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    b64Audio = part.inlineData.data;
                    break;
                }
            }
        }

        if (!b64Audio) {
            throw new Error('Gemini TTS response did not contain expected audio payload.');
        }

        const blob = base64AudioToBlob(b64Audio, 'audio/wav');
        const cleanBlob = (await sanitizeAudioBlob(blob, spokenWordCount)).blob;
        return URL.createObjectURL(cleanBlob);
    }

    // Backend 4: In-Browser (Kokoro Neural Worker with Character Voice Mapping)
    if (backend === 'kokoro' || backend === 'browser') {
        const mappedVoice = mapCharacterToKokoroVoice(
            voiceDescription,
            chunk.speaker || speakerLabel
        );
        const hooks = getKokoroHooks();
        if (!kokoroWorkerRef || !kokoroWorkerRef.current) {
            if (hooks?._ellipsisGetOrCreateTtsWorker) {
                try {
                    const w = hooks._ellipsisGetOrCreateTtsWorker();
                    if (kokoroWorkerRef) kokoroWorkerRef.current = w;
                    if (hooks._ellipsisInitTtsEngine) hooks._ellipsisInitTtsEngine();
                } catch {
                    // Checked immediately below
                }
            }
        } else if (
            hooks &&
            !hooks._ellipsisKokoroModelReady &&
            !hooks._ellipsisKokoroInitializing &&
            hooks._ellipsisInitTtsEngine
        ) {
            try {
                hooks._ellipsisInitTtsEngine();
            } catch {
                // Non-fatal init trigger guard
            }
        }
        if (!kokoroWorkerRef || !kokoroWorkerRef.current) {
            throw new Error('Kokoro Neural Web Worker is not initialized.');
        }

        const worker = kokoroWorkerRef.current;
        return new Promise<string>((resolve, reject) => {
            const reqId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const waitMs = hooks?._ellipsisKokoroModelReady ? 45000 : 120000;
            const timeout = setTimeout(() => {
                worker.removeEventListener('message', handleWorkerMessage);
                reject(
                    new Error(
                        `Kokoro synthesis timed out on line: "${spokenTextOnly.substring(0, 30)}..."`
                    )
                );
            }, waitMs);

            const handleWorkerMessage = (
                e: MessageEvent<{
                    id?: string;
                    type?: string;
                    payload?: { wavBuffer?: ArrayBuffer };
                    audioData?: ArrayBuffer;
                    wavBuffer?: ArrayBuffer;
                    audioUrl?: string;
                    error?: string;
                }>
            ): void => {
                const msg = e.data;
                if (!msg || msg.id !== reqId) return;

                if (msg.type === 'chunk_audio' || msg.type === 'chunk' || msg.type === 'audio') {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', handleWorkerMessage);
                    const wavBuf = msg.payload?.wavBuffer || msg.audioData || msg.wavBuffer;
                    if (wavBuf) {
                        const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
                        sanitizeAudioBlob(wavBlob, spokenWordCount)
                            .then((res) => {
                                resolve(URL.createObjectURL(res.blob));
                            })
                            .catch(() => {
                                resolve(URL.createObjectURL(wavBlob));
                            });
                    } else if (msg.audioUrl) {
                        resolve(msg.audioUrl);
                    } else {
                        reject(new Error('Worker returned audio message without data.'));
                    }
                } else if (msg.type === 'error') {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', handleWorkerMessage);
                    reject(new Error(msg.error || 'Kokoro Worker synthesis failed.'));
                }
            };

            if (signal) {
                signal.addEventListener(
                    'abort',
                    () => {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', handleWorkerMessage);
                        const abortErr = new Error('Aborted');
                        abortErr.name = 'AbortError';
                        reject(abortErr);
                    },
                    { once: true }
                );
            }

            worker.addEventListener('message', handleWorkerMessage);
            worker.postMessage({
                type: 'generate',
                id: reqId,
                payload: {
                    text: spokenTextOnly,
                    voice: mappedVoice,
                    speed: 1.0
                },
                text: spokenTextOnly,
                voice: mappedVoice,
                speed: 1.0
            });
        });
    }

    if (backend === 'system') {
        throw new Error('System Voices use device speech synthesis directly for playback.');
    }

    throw new Error(`Unsupported Audio Drama TTS backend: "${backend}"`);
}

/** Public TTS synthesis entry point wrapped with pipeline stage activity telemetry. */
export async function synthesizeAudioDramaChunk(params: SynthesizeChunkParams): Promise<string> {
    const synthStartTime = performance.now();
    const { chunk, chunkIndex = 0, totalChunks = 1, backend = 'audiocpp' } = params || {};
    const speakerLabel = chunk?.speaker || 'Narrator';
    const cleanText = String(chunk?.spokenText || chunk?.text || '').trim();
    const spokenTextOnly = cleanDialogueSpokenText(cleanText);
    const isBreezeTarget =
        backend === 'breeze' || backend === 'audiocpp' || backend === 'hybrid';
    const displayPreview = isBreezeTarget && chunk?.breezeText ? chunk.breezeText : spokenTextOnly;

    logAudioStageStart(
        'chunk_synthesis',
        `[Running] Synthesizing Chunk ${chunkIndex + 1}/${totalChunks} (${speakerLabel}) via ${backend}`,
        {
            chunkIndex: chunkIndex + 1,
            totalChunks,
            speaker: speakerLabel,
            backend,
            preview: displayPreview.slice(0, 70) + (displayPreview.length > 70 ? '...' : '')
        }
    );

    try {
        const url = await _rawSynthesizeAudioDramaChunk(params);
        const durationSec = ((performance.now() - synthStartTime) / 1000).toFixed(2);
        logAudioStageComplete(
            'chunk_synthesis',
            `[Completed] Synthesized Chunk ${chunkIndex + 1}/${totalChunks} (${speakerLabel}) via ${backend} in ${durationSec}s`,
            {
                chunkIndex: chunkIndex + 1,
                totalChunks,
                speaker: speakerLabel,
                backend,
                durationSec
            }
        );
        return url;
    } catch (err) {
        const durationSec = ((performance.now() - synthStartTime) / 1000).toFixed(2);
        logAudioStageError(
            'chunk_synthesis',
            `[Failed] Synthesis Error on Chunk ${chunkIndex + 1}/${totalChunks} (${speakerLabel}) via ${backend}`,
            err,
            {
                chunkIndex: chunkIndex + 1,
                totalChunks,
                speaker: speakerLabel,
                backend,
                durationSec
            }
        );
        throw err;
    }
}
