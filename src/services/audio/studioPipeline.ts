/**
 * @module services/audio/studioPipeline
 * 4-Wave Hybrid Audio Drama Studio render orchestrator (`runStudioRenderJob`) and
 * unified `StudioPipeline` public facade.
 */

import {
    DEFAULT_SERVICE_URLS,
    migrateAudioDramaSettings,
    type AudioDramaSettings
} from '@/config';
import {
    CANONICAL_VOCAL_EVENTS,
    DRAMA3_SCOPED_TAGS,
    META_TOKENS,
    RAIN_SENTENCE,
    VOCAL_EVENT_SYNONYMS,
    VOICE_REFERENCE_MIN_SECONDS,
    VOICE_REFERENCE_TARGET_MAX_SECONDS,
    analyzeAudioDramaExpressiveness,
    analyzeAudioPcmData,
    applyHighPass75Hz,
    applyRaisedCosineFades,
    bisectChunk,
    checkBoundaryTruncation,
    chunkAudioDramaTurns,
    chunkNovelProseForDrama3,
    classifyParentheticalTag,
    computeRmsDb,
    computeSceneVoiceSignatureHash,
    computeSpeakersVoiceSignatureHash,
    computeWordErrorRate,
    detectMetaWordLeakage,
    drama3ToBreezeStore,
    Drama3ToBreezeVectorStore,
    encodeFloat32PcmToWavBlob,
    estimateDramaTurnSeconds,
    estimateReferenceTextSeconds,
    expandSegmentTurnsToCues,
    extractPersonalizedReferenceTextFromInterview,
    extractSpokenAndTags,
    generatePinkNoiseRoomTone,
    getDeterministicVoiceSeed,
    getLiveStoryForAudio,
    getVoiceReferenceTextForCharacter,
    integerToEnglishWords,
    isAudioDramaScriptText,
    isValidVoiceDesignProfile,
    isValidVoiceRefPath,
    levelSamplesToLufs,
    measureIntegratedLufs,
    normalizeAudioDramaScriptWithReport,
    normalizeAudioDramaText,
    normalizeAudioDramaTextPreservingTags,
    normalizeDirectionKey,
    ordinalToEnglishWords,
    parseAudioDramaScript,
    resolveSpeakerVoiceIdentity,
    sanitizeVoiceReferenceText,
    splitIntoSpokenSubTurns,
    splitReferenceTextIntoSentences,
    studioTargetF0Band,
    synthesizeVoiceDesignProfile,
    verifyChunkQuality,
    type AudioStoryLike,
    type Drama3Segment,
    type DramaScriptSegmentLike,
    type DramaTurnLike
} from '@/domain/audio';
import { fetchWithTimeout } from '@/services/http';
import { studioCacheStore } from '@/services/storage';
import {
    activateAudioCppWave,
    buildWave2ActivateBody,
    enqueueAudioCppTask,
    liveAudioCppWaveState
} from './audiocppQueue';
import {
    decodeWavBlobDirect,
    encodeFloat32PcmToMp3Blob,
    ensureStudioMasteringWorkerReady,
    postStudioWorkerTask,
    stitchAudioBlobsWithPause
} from './codec';
import { logAudioStageComplete, logAudioStageError, logAudioStageStart } from './logger';
import {
    buildDrama3Payload,
    ensureSpeakerMasterVoice,
    getCachedSpeakerMasterVoice,
    resolveSpeakersMasterMap,
    toDrama3HttpBody
} from './masterVoices';

export interface StudioProgressEvent {
    wave: number;
    step: string;
    done: number;
    total: number;
    message: string;
    chunkCurrent?: number;
    chunkTotal?: number;
    speaker?: string;
}

export interface StudioRenderJobParams {
    story: AudioStoryLike;
    scope?: 'scene' | 'sequence';
    seqIdx?: number;
    sceneIdx?: number;
    settings?: Partial<AudioDramaSettings> | Record<string, unknown>;
    onProgress?: ((event: StudioProgressEvent) => void) | null;
    signal?: AbortSignal | null;
    deferMastering?: boolean;
}

export interface StudioRenderJobResult {
    masterWavBlob: null;
    masterMp3Blob: Blob;
    blob: Blob;
    mp3Blob: Blob;
    masterAudioUrl: string;
    totalChunks: number;
    timelineSeconds: number;
    realtimeFactor: number;
    wallSeconds: number;
    cueTimeline: Array<Record<string, unknown>>;
    renderedChunks: Array<{
        chunk: ExtendedDramaSegment;
        samples: Float32Array | null;
        audioBuf?: AudioBuffer | null;
        sampleRate: number;
        duration: number;
    }>;
}

export interface DeferredStudioRenderResult {
    deferredMastering: () => Promise<StudioRenderJobResult>;
    totalChunks: number;
}

type ExtendedDramaSegment = Drama3Segment & {
    seqIdx?: number;
    sceneIdx?: number;
    voiceSigHash?: string;
    textHash?: string;
    id?: string;
    boundaryBefore?: string;
    type?: string;
    engine?: string;
};

export async function runStudioRenderJob(
    params: StudioRenderJobParams & { deferMastering: true }
): Promise<DeferredStudioRenderResult>;
export async function runStudioRenderJob(
    params: StudioRenderJobParams
): Promise<StudioRenderJobResult | DeferredStudioRenderResult>;
export async function runStudioRenderJob({
    story: initialStory,
    scope = 'scene',
    seqIdx = 0,
    sceneIdx = 0,
    settings = {},
    onProgress = null,
    signal = null,
    deferMastering = false
}: StudioRenderJobParams): Promise<StudioRenderJobResult | DeferredStudioRenderResult> {
    const story = (getLiveStoryForAudio(initialStory) || initialStory) as AudioStoryLike;
    const jobStartTime = performance.now();
    const targetSeq = Number(seqIdx);
    const targetScene = Number(sceneIdx);

    logAudioStageStart(
        'studio_render_job',
        `[Running] Audio Drama Studio Master Render Job Started (Scope: ${scope.toUpperCase()})`,
        { scope, seqIdx: targetSeq, sceneIdx: targetScene }
    );

    const effectiveSettings = migrateAudioDramaSettings(settings) as Partial<AudioDramaSettings> &
        Record<string, unknown>;
    const bridgeUrl = String(
        effectiveSettings.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
    ).replace(/\/+$/, '');
    const audioCppUrl = String(
        effectiveSettings.audioCppUrl || DEFAULT_SERVICE_URLS.audioCpp
    ).replace(/\/+$/, '');

    if (onProgress) {
        onProgress({
            wave: 0,
            step: 'parsing_turns',
            done: 0,
            total: 100,
            message: 'Parsing audio drama script...'
        });
    }

    const proseTexts: Array<{ seq: number; scene: number; text: string }> = [];
    if (scope === 'scene') {
        const sId = `${targetSeq}-${targetScene}`;
        const pObj = story?.prose?.[sId];
        const pText =
            typeof pObj === 'object' && pObj !== null
                ? pObj.final || pObj.draft || ''
                : String(pObj || '');
        if (pText.trim()) proseTexts.push({ seq: targetSeq, scene: targetScene, text: pText });
    } else {
        const scenesMap = story?.scenes as Record<string, unknown[]> | undefined;
        const rawScenes = (scenesMap && (scenesMap[String(targetSeq)] || scenesMap[targetSeq])) || [];
        rawScenes.forEach((_, sIdx) => {
            const sId = `${targetSeq}-${sIdx}`;
            const pObj = story?.prose?.[sId];
            const pText =
                typeof pObj === 'object' && pObj !== null
                    ? pObj.final || pObj.draft || ''
                    : String(pObj || '');
            if (pText.trim()) proseTexts.push({ seq: targetSeq, scene: sIdx, text: pText });
        });
    }

    if (proseTexts.length === 0) {
        logAudioStageError(
            'parsing_turns',
            'No drafted prose or script found to render audio.',
            undefined,
            { scope, targetSeq, targetScene }
        );
        throw new Error('No drafted prose or script found to render audio.');
    }

    logAudioStageStart(
        'parsing_turns',
        '[Running] Wave 0: Parsing Audio Drama Script & Extracting Dialogue Cues',
        {
            scope,
            seqIdx: targetSeq,
            sceneIdx: targetScene,
            proseItemCount: proseTexts.length
        }
    );

    const storyId = String(story?.id || story?.title || 'story').replace(/[^a-zA-Z0-9_-]/g, '_');
    const hashChunkText = (str: string): string => {
        let h = 2166136261;
        for (let k = 0; k < str.length; k++) {
            h ^= str.charCodeAt(k);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(36);
    };
    const allChunks: ExtendedDramaSegment[] = [];
    for (let itemIdx = 0; itemIdx < proseTexts.length; itemIdx++) {
        const item = proseTexts[itemIdx];
        const isDramaScript =
            story?.writing_mode === 'audio_drama' || isAudioDramaScriptText(item.text);
        const sceneSeed = getDeterministicVoiceSeed(`scene_${item.seq}_${item.scene}`, story);
        let sceneChunks: ExtendedDramaSegment[] = [];
        if (isDramaScript) {
            const rawParsed = parseAudioDramaScript(item.text, {
                raw: true,
                collapseNarrator: false
            }) as unknown as DramaTurnLike[];
            if (rawParsed && rawParsed.length > 0) {
                sceneChunks = chunkAudioDramaTurns(rawParsed, {
                    sceneSeed
                }) as ExtendedDramaSegment[];
            }
        } else {
            sceneChunks = chunkNovelProseForDrama3(item.text, {
                sceneSeed
            }) as unknown as ExtendedDramaSegment[];
        }
        if (sceneChunks && sceneChunks.length > 0) {
            sceneChunks.forEach((c, cIdx) => {
                c.seqIdx = item.seq;
                c.sceneIdx = item.scene;
                const subId = c.chunkId || `chunk_${cIdx}`;
                const chunkSpeakers = Array.from(
                    new Set(
                        (c.turns || []).map((t) =>
                            String(t.speakerKey || t.speaker || 'Narrator')
                        )
                    )
                ).filter(Boolean);
                const chunkVoiceSig = computeSpeakersVoiceSignatureHash(
                    chunkSpeakers,
                    story,
                    effectiveSettings
                );
                const chunkTextSig =
                    (c.turns || [])
                        .map(
                            (t) =>
                                `${String(t.speakerKey || t.speaker || 'Narrator')}:${String(
                                    t.drama3Text || t.spokenText || t.cleanText || t.text || ''
                                )}`
                        )
                        .join('|') + `||voices:${chunkVoiceSig}`;
                c.voiceSigHash = chunkVoiceSig;
                c.textHash = hashChunkText(chunkTextSig);
                c.id = `${storyId}_seq${item.seq}_sc${item.scene}_${subId}_w${
                    c.wordCount || 0
                }_h${c.textHash}`;
                c.boundaryBefore = cIdx === 0 && itemIdx > 0 ? 'scene' : c.boundaryBefore;
                console.log(
                    `[Hybrid Studio] Prepared Segment ${cIdx + 1}/${sceneChunks.length} (Scene ${
                        item.seq + 1
                    }.${item.scene + 1}): ~${c.estimatedDurationSec || 60}s, ${
                        c.wordCount
                    } words, ${c.speakers?.length || 1} speakers [${(c.speakers || []).join(
                        ', '
                    )}], split=${c.splitReason || 'auto'}`
                );
                allChunks.push(c);
            });
        }
    }

    if (allChunks.length === 0) {
        throw new Error('No speakable audio drama chunks generated.');
    }

    const speakersSet = new Set<string>();
    allChunks.forEach((c) =>
        c.turns.forEach((t) => speakersSet.add(String(t.speakerKey || t.speaker || 'Narrator')))
    );
    const uniqueSpeakers = Array.from(speakersSet).filter(Boolean);

    logAudioStageComplete(
        'parsing_turns',
        `[Completed] Wave 0: Parsed ${allChunks.length} Speakable Chunks across ${uniqueSpeakers.length} Character Voices`,
        {
            totalChunks: allChunks.length,
            speakers: uniqueSpeakers,
            proseItemCount: proseTexts.length
        }
    );

    if (onProgress) {
        onProgress({
            wave: 1,
            step: 'voice_tournaments',
            done: 10,
            total: 100,
            message: 'Resolving character master voices...'
        });
    }

    logAudioStageStart('voice_alignment', '[Running] Wave 1: Resolving Character Master Voices', {
        uniqueSpeakersCount: uniqueSpeakers.length,
        speakers: uniqueSpeakers
    });

    const ensureBreezeWaveActive = (): Promise<boolean> =>
        activateAudioCppWave(bridgeUrl, 1, signal, 30000);
    const ensureDramaWaveActive = (): Promise<boolean> =>
        activateAudioCppWave(bridgeUrl, 2, signal, 60000, effectiveSettings);

    const { anchorsMap, calibratedFromCache } = await enqueueAudioCppTask(() =>
        resolveSpeakersMasterMap(
            uniqueSpeakers,
            story,
            effectiveSettings,
            bridgeUrl,
            signal,
            ensureBreezeWaveActive
        )
    );

    logAudioStageComplete(
        'voice_alignment',
        `[Completed] Wave 1: Calibrated Master Voices for ${uniqueSpeakers.length} Cast Members (${
            calibratedFromCache ? 'cached' : 'synthesized'
        })`,
        {
            alignedCastCount: anchorsMap.size,
            uniqueSpeakers,
            calibratedFromCache
        }
    );

    if (onProgress) {
        onProgress({
            wave: 2,
            step: 'chunk_synthesis',
            done: 30,
            total: 100,
            message: 'Synthesizing multi-character segments...'
        });
    }

    logAudioStageStart(
        'chunk_synthesis',
        `[Running] Wave 2: Drama-3 Multi-Character Scene Segments (${allChunks.length} Segments)`,
        { totalChunks: allChunks.length, bridgeUrl, audioCppUrl }
    );

    let isDrama3Available = false;
    let activeDramaModelId: string | null = null;
    await enqueueAudioCppTask(async () => {
        await ensureDramaWaveActive();
        try {
            const reqInit: RequestInit = { method: 'GET', ...(signal ? { signal } : {}) };
            const modelsRes = await fetchWithTimeout(`${bridgeUrl}/v1/models`, reqInit, 4000)
                .catch(() => fetchWithTimeout(`${audioCppUrl}/v1/models`, reqInit, 4000))
                .catch(() => null);
            if (modelsRes && modelsRes.ok) {
                const modelsJson = (await modelsRes.json().catch(() => null)) as {
                    data?: Array<{ id?: string; family?: string }>;
                } | null;
                const modelList = Array.isArray(modelsJson?.data)
                    ? modelsJson.data
                    : Array.isArray(modelsJson)
                      ? (modelsJson as Array<{ id?: string; family?: string }>)
                      : [];
                const targetDramaId = String(effectiveSettings.dramaModelId || 'drama-3');

                const matchedDrama =
                    modelList.find((m) => m?.id && m.id === targetDramaId) ||
                    modelList.find((m) => m?.id === 'drama-3') ||
                    modelList.find((m) => m?.id === 'fish-drama3') ||
                    modelList.find((m) => m?.family === 'fish_drama3') ||
                    modelList.find(
                        (m) => typeof m?.id === 'string' && m.id.toLowerCase().includes('drama')
                    );

                if (matchedDrama && matchedDrama.id) {
                    isDrama3Available = true;
                    activeDramaModelId = matchedDrama.id;
                    console.log(
                        `[Hybrid Studio] Drama-3 dialogue model verified in backend registry: "${activeDramaModelId}"`
                    );
                } else {
                    console.warn(
                        `[Hybrid Studio] Drama-3 model not found in backend registry (target: "${targetDramaId}"). Available models:`,
                        modelList.map((m) => m?.id)
                    );
                }
            } else {
                console.warn(
                    `[Hybrid Studio] Could not probe backend model registry at ${bridgeUrl} or ${audioCppUrl}`
                );
            }
        } catch (probeErr) {
            console.warn('[Hybrid Studio] Model registry probe exception:', probeErr);
        }
    });

    const bypassCache = Boolean(
        effectiveSettings.bypassCache || effectiveSettings.forceRerender
    );
    const synthesizedBlobs: Array<{
        chunk: ExtendedDramaSegment;
        blob: Blob;
        transcript: unknown;
    }> = [];

    for (let i = 0; i < allChunks.length; i++) {
        if (signal?.aborted) throw new Error('Aborted');
        const ch = allChunks[i];
        const pct = 30 + Math.round((i / allChunks.length) * 40);
        const chunkSpeaker =
            Array.isArray(ch.speakers) && ch.speakers.length > 0
                ? ch.speakers.join(', ')
                : String(ch.turns?.[0]?.speaker || 'Narrator');
        if (onProgress) {
            onProgress({
                wave: 2,
                step: 'chunk_synthesis',
                done: pct,
                total: 100,
                chunkCurrent: i + 1,
                chunkTotal: allChunks.length,
                speaker: chunkSpeaker,
                message: `Synthesizing chunk ${i + 1}/${allChunks.length}...`
            });
        }

        const isSolo =
            (ch.engine as string) === 'breeze_solo' ||
            (ch.type as string) === 'breeze_solo' ||
            !ch.turns ||
            ch.turns.length === 0;
        const cachedRender =
            bypassCache || !ch.id ? null : await studioCacheStore.getRender(ch.id);

        let isSilentCache = false;
        if (cachedRender && cachedRender.audioBlob) {
            if (cachedRender.engine === 'silence_fallback') {
                isSilentCache = true;
            } else {
                try {
                    const decCheck = await decodeWavBlobDirect(cachedRender.audioBlob);
                    const rmsCheck = computeRmsDb(decCheck?.samples);
                    if (!decCheck?.samples || decCheck.samples.length === 0 || rmsCheck <= -55.0) {
                        isSilentCache = true;
                    }
                } catch {
                    isSilentCache = true;
                }
            }
        }

        const isStaleFallback =
            !isSolo &&
            isDrama3Available &&
            cachedRender &&
            (cachedRender.engine === 'breeze_solo' ||
                cachedRender.engine === 'moss_multi' ||
                !cachedRender.engine);
        if (cachedRender && cachedRender.audioBlob && !isStaleFallback && !isSilentCache) {
            console.log(
                `[Hybrid Studio] Using cached render for Chunk ${i + 1}/${allChunks.length} (${
                    ch.id
                }, engine: "${String(cachedRender.engine || 'unknown')}")`
            );
            synthesizedBlobs.push({
                chunk: ch,
                blob: cachedRender.audioBlob,
                transcript: cachedRender.transcript || null
            });
            continue;
        }
        if (isSilentCache) {
            console.log(
                `[Hybrid Studio] Chunk ${i + 1}/${
                    allChunks.length
                } cached render is silent (from a prior failed run) — re-synthesizing...`
            );
        } else if (isStaleFallback) {
            console.log(
                `[Hybrid Studio] Chunk ${i + 1}/${
                    allChunks.length
                } has stale fallback cache — re-synthesizing with active Drama-3 engine ("${activeDramaModelId}").`
            );
        }

        let synthBlob: Blob | null = null;
        let actualRenderedEngine: string | null = null;
        const modelId =
            typeof effectiveSettings.breezeModelId === 'string' &&
            effectiveSettings.breezeModelId &&
            effectiveSettings.breezeModelId !== 'breeze_director'
                ? effectiveSettings.breezeModelId
                : 'breeze-tts';

        await enqueueAudioCppTask(async () => {
            if (signal?.aborted) throw new Error('Aborted');
            if (isSolo) {
                await ensureBreezeWaveActive();
                const primarySpk = String(
                    ch.turns?.[0]?.speakerKey || ch.turns?.[0]?.speaker || 'NARRATOR'
                );
                const anchor = anchorsMap.get(primarySpk + '_master') || anchorsMap.get(primarySpk);
                const soloText = (ch.turns || [])
                    .map((t) => String(t.breezeText || t.spokenText || t.cleanText || t.text || ''))
                    .join(' ')
                    .trim();
                const isRefValid = isValidVoiceRefPath(anchor?.refPath);

                const firstTurnDirs = ch.turns?.[0]?.actingDirections as string[] | undefined;
                const firstTurnDir = ch.turns?.[0]?.direction as string | undefined;
                const soloStyle =
                    Array.isArray(firstTurnDirs) && firstTurnDirs.length > 0
                        ? `Speaking style: ${firstTurnDirs.join(', ')}.`
                        : firstTurnDir
                          ? `Speaking style: ${firstTurnDir}.`
                          : 'Speak clearly and naturally.';

                const soloPayload = {
                    model: modelId,
                    task: isRefValid ? 'clone' : 'tts',
                    input: soloText,
                    ...(isRefValid && anchor
                        ? {
                              voice_ref: anchor.refPath,
                              reference_text: anchor.referenceText || RAIN_SENTENCE
                          }
                        : {}),
                    instruction: soloStyle,
                    instruct: soloStyle,
                    instructions: soloStyle,
                    temperature: 0.35,
                    seed: getDeterministicVoiceSeed(primarySpk, story) || ch.baseSeed || 42,
                    response_format: 'wav'
                };

                console.log(
                    `[Hybrid Studio] Dispatching Solo Chunk ${i + 1}/${
                        allChunks.length
                    } to Breeze 2 (${modelId}) | Speaker: "${primarySpk}" | Temp: 0.35`
                );
                try {
                    const postInit: RequestInit = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(soloPayload),
                        ...(signal ? { signal } : {})
                    };
                    let res = await fetchWithTimeout(
                        bridgeUrl + '/v1/audio/speech',
                        postInit,
                        60000
                    ).catch(() => null);
                    if (!res || !res.ok) {
                        if (!res || res.status === 502 || res.status === 503) {
                            liveAudioCppWaveState.activeWave = 0;
                        }
                        res = await fetchWithTimeout(
                            audioCppUrl + '/v1/audio/speech',
                            postInit,
                            60000
                        ).catch(() => null);
                    }
                    if (res && res.ok) {
                        synthBlob = await res.blob();
                        actualRenderedEngine = 'breeze_solo';
                    }
                } catch {
                    // Ignore solo error and allow fallback silence generation
                }
            } else {
                if (isDrama3Available) {
                    await ensureDramaWaveActive();
                    for (let attempt = 0; attempt < 2; attempt++) {
                        const dramaPayload = buildDrama3Payload(
                            ch,
                            anchorsMap,
                            effectiveSettings,
                            attempt,
                            activeDramaModelId
                        );
                        if (
                            dramaPayload.speaker_slots.length > 1 &&
                            dramaPayload.references_meta.length === 0
                        ) {
                            console.warn(
                                `[Hybrid Studio] Segment ${i + 1}/${allChunks.length} has ${
                                    dramaPayload.speaker_slots.length
                                } speakers but lacks valid voice references for [${(
                                    dramaPayload.missing_ref_speakers || []
                                ).join(
                                    ', '
                                )}]; skipping single-voice Drama-3 tts and falling back to per-turn Breeze 2 synthesis.`
                            );
                            break;
                        }
                        const wireBody = toDrama3HttpBody(dramaPayload);
                        const segDispatchTime = performance.now();
                        console.log(
                            `[Hybrid Studio] Dispatching Segment ${i + 1}/${allChunks.length} (~${
                                ch.estimatedDurationSec || 60
                            }s, ${ch.wordCount} words, split=${
                                ch.splitReason || 'auto'
                            }) to Drama-3 (${dramaPayload.model}) | Speakers: ${
                                dramaPayload.speaker_slots.length
                            } | max_tokens=${dramaPayload.max_tokens}, Temp=${
                                dramaPayload.temperature
                            }, attempt=${attempt + 1}`
                        );
                        try {
                            const postInit: RequestInit = {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(wireBody),
                                ...(signal ? { signal } : {})
                            };
                            let res = await fetchWithTimeout(
                                bridgeUrl + '/v1/audio/speech',
                                postInit,
                                900000
                            ).catch(() => null);

                            const shouldRetryDirect =
                                !res || res.status === 502 || res.status === 404;
                            if (shouldRetryDirect) {
                                if (!res || res.status === 502) liveAudioCppWaveState.activeWave = 0;
                                if (res) {
                                    const errTxt = await res.text().catch(() => '');
                                    console.warn(
                                        `[Hybrid Studio] Bridge Drama-3 request returned status ${res.status}: ${errTxt}. Retrying directly on Audio.cpp daemon (${audioCppUrl})...`
                                    );
                                } else {
                                    console.warn(
                                        `[Hybrid Studio] Bridge unreachable at ${bridgeUrl}. Retrying directly on Audio.cpp daemon (${audioCppUrl})...`
                                    );
                                }
                                res = await fetchWithTimeout(
                                    audioCppUrl + '/v1/audio/speech',
                                    postInit,
                                    900000
                                ).catch(() => null);
                            }

                            if (res && res.ok) {
                                synthBlob = await res.blob();
                                actualRenderedEngine = 'drama3_multi';
                                const segWallSec = Math.max(
                                    0.05,
                                    (performance.now() - segDispatchTime) / 1000
                                );
                                let segAudioSec = Number(
                                    res.headers?.get('X-Audio-Duration-Seconds') || 0
                                );
                                if (!(segAudioSec > 0) && synthBlob.size > 44) {
                                    segAudioSec = (synthBlob.size - 44) / 88200;
                                }
                                const segRtX =
                                    segAudioSec > 0 ? (segAudioSec / segWallSec).toFixed(2) : null;
                                console.log(
                                    `[Hybrid Studio] Drama-3 Segment ${i + 1}/${
                                        allChunks.length
                                    } synthesized (${
                                        segAudioSec > 0 ? segAudioSec.toFixed(1) + 's audio in ' : ''
                                    }${segWallSec.toFixed(1)}s${
                                        segRtX ? ` -> ${segRtX}x realtime` : ''
                                    }, ${synthBlob.size} bytes).`
                                );
                                break;
                            } else if (res) {
                                const errTxt = await res.text().catch(() => '');
                                console.warn(
                                    `[Hybrid Studio] Drama-3 request returned status ${res.status}: ${errTxt}`
                                );
                                if (
                                    res.status === 400 &&
                                    /context_length|max_tokens/i.test(errTxt) &&
                                    attempt === 0
                                ) {
                                    console.warn(
                                        `[Hybrid Studio] Retrying Segment ${i + 1}/${
                                            allChunks.length
                                        } with tighter max_tokens cap for server context window...`
                                    );
                                    continue;
                                }
                                if (
                                    res.status >= 500 &&
                                    /could not open WAV input/i.test(errTxt) &&
                                    attempt === 0
                                ) {
                                    console.warn(
                                        `[Hybrid Studio] Missing reference WAV on disk for Segment ${
                                            i + 1
                                        }/${
                                            allChunks.length
                                        }; checking & recalibrating missing speaker(s) in Wave 1...`
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
                                                {
                                                    method: 'HEAD',
                                                    ...(signal ? { signal } : {})
                                                },
                                                2000
                                            ).catch(() => null);
                                            okOnDisk = Boolean(hRes && hRes.ok);
                                        }
                                        if (!okOnDisk) missingSegSpeakers.push(segSpk);
                                    }
                                    if (missingSegSpeakers.length > 0) {
                                        await ensureBreezeWaveActive();
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
                                        await ensureDramaWaveActive();
                                        continue;
                                    }
                                }
                            }
                        } catch (dramaErr) {
                            console.warn(
                                `[Hybrid Studio] Drama-3 Segment ${i + 1} synthesis exception:`,
                                dramaErr
                            );
                        }
                        break;
                    }
                }

                if (!synthBlob) {
                    if (isDrama3Available) {
                        console.warn(
                            `[Hybrid Studio] Drama-3 synthesis yielded no audio for Segment ${
                                i + 1
                            }/${
                                allChunks.length
                            }; engaging seamless fallback to Breeze 2 per-turn dialogue synthesis.`
                        );
                    }
                    await ensureBreezeWaveActive();
                    try {
                        const turnBlobs: Blob[] = [];
                        for (const turn of ch.turns || []) {
                            const spk = String(turn.speakerKey || turn.speaker || 'NARRATOR');
                            const anchor = anchorsMap.get(spk + '_master') || anchorsMap.get(spk);
                            const turnText = String(
                                turn.breezeText || turn.spokenText || turn.cleanText || turn.text || ''
                            );
                            const isRefValid = isValidVoiceRefPath(anchor?.refPath);

                            const turnDirs = turn.actingDirections as string[] | undefined;
                            const turnDir = turn.direction as string | undefined;
                            const turnStyle =
                                Array.isArray(turnDirs) && turnDirs.length > 0
                                    ? `Speaking style: ${turnDirs.join(', ')}.`
                                    : turnDir
                                      ? `Speaking style: ${turnDir}.`
                                      : 'Speak clearly and naturally.';

                            const turnPayload = {
                                model: modelId,
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
                                seed: getDeterministicVoiceSeed(spk, story) || ch.baseSeed || 42,
                                response_format: 'wav'
                            };
                            const turnPost: RequestInit = {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(turnPayload),
                                ...(signal ? { signal } : {})
                            };
                            let tRes = await fetchWithTimeout(
                                bridgeUrl + '/v1/audio/speech',
                                turnPost,
                                45000
                            ).catch(() => null);
                            if (!tRes || !tRes.ok) {
                                if (!tRes || tRes.status === 502 || tRes.status === 503) {
                                    liveAudioCppWaveState.activeWave = 0;
                                }
                                tRes = await fetchWithTimeout(
                                    audioCppUrl + '/v1/audio/speech',
                                    turnPost,
                                    45000
                                ).catch(() => null);
                            }
                            if (tRes && tRes.ok) {
                                turnBlobs.push(await tRes.blob());
                            }
                        }

                        if (turnBlobs.length === 1) {
                            synthBlob = turnBlobs[0];
                            actualRenderedEngine = 'breeze_solo';
                        } else if (turnBlobs.length > 1) {
                            synthBlob = await stitchAudioBlobsWithPause(turnBlobs, 0.15, null);
                            if (synthBlob) actualRenderedEngine = 'breeze_solo';
                        }
                    } catch {
                        // Fall through to silence placeholder below
                    }
                }
            }
        });

        if (synthBlob && actualRenderedEngine) {
            if (!bypassCache && ch.id) {
                await studioCacheStore.putRender(ch.id, {
                    audioBlob: synthBlob,
                    transcript: null,
                    engine: actualRenderedEngine,
                    textHash: ch.textHash,
                    seqIdx: ch.seqIdx,
                    sceneIdx: ch.sceneIdx
                });
            }
        } else if (!synthBlob) {
            console.warn(
                `[Hybrid Studio] Chunk ${i + 1}/${
                    allChunks.length
                } failed synthesis completely — using temporary silence placeholder (NOT caching to IndexedDB).`
            );
            const silenceSamples = Math.round(
                (ch.turns.reduce((acc, t) => acc + (Number(t.wordCount) || 10), 0) / 2.6) * 24000
            );
            const silencePcm = new Float32Array(Math.max(24000, silenceSamples));
            try {
                synthBlob = await encodeFloat32PcmToMp3Blob(silencePcm, 24000, 128);
            } catch {
                synthBlob = encodeFloat32PcmToWavBlob(silencePcm, 24000);
            }
        }

        synthesizedBlobs.push({ chunk: ch, blob: synthBlob, transcript: null });
    }

    logAudioStageComplete(
        'chunk_synthesis',
        `[Completed] Wave 2: Synthesized All ${synthesizedBlobs.length}/${allChunks.length} Dialogue & Narration Chunks`,
        {
            totalSynthesized: synthesizedBlobs.length,
            totalChunks: allChunks.length
        }
    );

    const finalizeMastering = async (): Promise<StudioRenderJobResult> => {
        if (!deferMastering && onProgress) {
            onProgress({
                wave: 3,
                step: 'audiomastering',
                done: 85,
                total: 100,
                message: 'Mastering broadcast timeline...'
            });
        }

        logAudioStageStart(
            'audio_mastering',
            '[Running] Wave 3: Studio Mastering DSP & Dynamic Loudness Normalization',
            { totalChunks: synthesizedBlobs.length, targetRate: 44100 }
        );

        const targetRate = 44100;
        const sceneGapMs = Number(effectiveSettings.scenePauseGapMs) || 2000;
        const roomToneDb = Number(effectiveSettings.roomToneDb) || -58.0;

        const decodedChunks: Array<{
            chunk: ExtendedDramaSegment;
            samples: Float32Array | null;
            audioBuf?: AudioBuffer | null;
            sampleRate: number;
            duration: number;
        }> = [];
        for (const item of synthesizedBlobs) {
            const decoded = await decodeWavBlobDirect(item.blob);
            decodedChunks.push({
                chunk: item.chunk,
                samples: decoded.samples,
                sampleRate: decoded.sampleRate || targetRate,
                duration: decoded.duration
            });
        }

        let totalTimelineSamples = 0;
        const layouts: Array<{
            dc: (typeof decodedChunks)[number];
            chunkSamples: number;
            pauseSamples: number;
        }> = [];
        for (let i = 0; i < decodedChunks.length; i++) {
            const dc = decodedChunks[i];
            const chunkSamples = Math.round(dc.duration * targetRate);
            let pauseMs = 150;
            if (dc.chunk.boundaryBefore === 'scene') pauseMs = sceneGapMs;
            else if (dc.chunk.boundaryBefore === 'narration_paragraph') pauseMs = 450;
            else if (dc.chunk.boundaryBefore === 'dialogue_narration') pauseMs = 280;

            const pauseSamples = Math.round((pauseMs / 1000) * targetRate);
            layouts.push({ dc, chunkSamples, pauseSamples });
            totalTimelineSamples += pauseSamples + chunkSamples;
        }
        totalTimelineSamples += Math.round(0.5 * targetRate);

        let writePos = 0;
        const cueTimeline: Array<Record<string, unknown>> = [];
        for (const lay of layouts) {
            writePos += lay.pauseSamples;
            const chunkStartSamples = writePos;
            writePos += lay.chunkSamples;
            const chunkEndSamples = writePos;
            const chunkStartSec = chunkStartSamples / targetRate;
            const chunkEndSec = Math.max(chunkStartSec + 0.05, chunkEndSamples / targetRate);
            const segCues = expandSegmentTurnsToCues(
                lay.dc.chunk as unknown as DramaScriptSegmentLike,
                chunkStartSec,
                chunkEndSec
            );
            segCues.forEach((c) => cueTimeline.push({ ...c, index: cueTimeline.length }));
        }

        let primaryMasterBlob: Blob | null = null;
        let timelineAudioSec = Number((totalTimelineSamples / targetRate).toFixed(2));
        let masteredInWorker = false;

        try {
            const workerReady = await ensureStudioMasteringWorkerReady();
            if (workerReady && layouts.length > 0) {
                const transferBuffers: Transferable[] = [];
                const workerItems = layouts.map((lay) => {
                    const s = lay.dc.samples;
                    let transferBuf: ArrayBuffer;
                    if (
                        s &&
                        s.buffer instanceof ArrayBuffer &&
                        s.byteOffset === 0 &&
                        s.byteLength === s.buffer.byteLength
                    ) {
                        transferBuf = s.buffer;
                    } else {
                        transferBuf = new Float32Array(s || []).buffer;
                    }
                    transferBuffers.push(transferBuf);
                    lay.dc.samples = null;
                    lay.dc.audioBuf = null;
                    return {
                        buffer: transferBuf,
                        sampleRate: lay.dc.sampleRate || targetRate,
                        targetLufs: (lay.dc.chunk.engine as string) === 'breeze_solo' ? -16.5 : -18.0,
                        pauseSamples: lay.pauseSamples,
                        chunkSamples: lay.chunkSamples
                    };
                });
                const wRes = await postStudioWorkerTask(
                    {
                        type: 'master_timeline',
                        items: workerItems,
                        totalTimelineSamples,
                        targetRate,
                        roomToneDb,
                        kbps: 128
                    },
                    transferBuffers,
                    120000
                );
                if (wRes && Array.isArray(wRes.buffers) && wRes.buffers.length > 0) {
                    primaryMasterBlob = new Blob(wRes.buffers, { type: 'audio/mpeg' });
                    if (Number.isFinite(wRes.timelineSeconds)) {
                        timelineAudioSec = Number(wRes.timelineSeconds);
                    }
                    masteredInWorker = true;
                }
            }
        } catch (workerMasterErr) {
            console.warn(
                '[Hybrid Studio] Worker mastering fallback to main thread:',
                workerMasterErr instanceof Error ? workerMasterErr.message : workerMasterErr
            );
        }

        if (!masteredInWorker) {
            const fallbackLayouts: typeof layouts = [];
            for (let idx = 0; idx < layouts.length; idx++) {
                const lay = layouts[idx];
                let dc = lay.dc;
                if (!dc.samples && synthesizedBlobs[idx]?.blob) {
                    const redec = await decodeWavBlobDirect(synthesizedBlobs[idx].blob);
                    dc = {
                        chunk: dc.chunk,
                        samples: redec.samples,
                        sampleRate: redec.sampleRate || targetRate,
                        duration: redec.duration
                    };
                }
                const samples = dc.samples || new Float32Array(0);
                applyHighPass75Hz(samples, dc.sampleRate);
                applyRaisedCosineFades(samples, dc.sampleRate, 15);
                const targetLufs = (dc.chunk.engine as string) === 'breeze_solo' ? -16.5 : -18.0;
                levelSamplesToLufs(samples, dc.sampleRate, targetLufs, -1.5);
                fallbackLayouts.push({
                    dc: { ...dc, samples },
                    chunkSamples: lay.chunkSamples,
                    pauseSamples: lay.pauseSamples
                });
            }

            const masterTimeline = new Float32Array(totalTimelineSamples);
            let fbWritePos = 0;
            for (const lay of fallbackLayouts) {
                fbWritePos += lay.pauseSamples;
                const srcChannel = lay.dc.samples || new Float32Array(0);
                const srcRate = lay.dc.sampleRate;
                if (srcRate === targetRate) {
                    const copyLen = Math.min(srcChannel.length, masterTimeline.length - fbWritePos);
                    masterTimeline.set(srcChannel.subarray(0, copyLen), fbWritePos);
                    fbWritePos += copyLen;
                } else {
                    const ratio = srcRate / targetRate;
                    for (
                        let s = 0;
                        s < lay.chunkSamples && fbWritePos + s < masterTimeline.length;
                        s++
                    ) {
                        const srcIdx = s * ratio;
                        const idxFloor = Math.floor(srcIdx);
                        const idxCeil = Math.min(srcChannel.length - 1, idxFloor + 1);
                        const frac = srcIdx - idxFloor;
                        masterTimeline[fbWritePos + s] =
                            srcChannel[idxFloor] * (1 - frac) + srcChannel[idxCeil] * frac;
                    }
                    fbWritePos += lay.chunkSamples;
                }
                lay.dc.samples = null;
                lay.dc.audioBuf = null;
            }

            const pinkBed = generatePinkNoiseRoomTone(masterTimeline.length, roomToneDb);
            for (let i = 0; i < masterTimeline.length; i++) {
                masterTimeline[i] += pinkBed[i];
            }
            const peakLimit = Math.pow(10, -1.5 / 20);
            for (let i = 0; i < masterTimeline.length; i++) {
                if (masterTimeline[i] > peakLimit) masterTimeline[i] = peakLimit;
                else if (masterTimeline[i] < -peakLimit) masterTimeline[i] = -peakLimit;
            }
            try {
                primaryMasterBlob = await encodeFloat32PcmToMp3Blob(masterTimeline, targetRate, 128);
            } catch (mp3Err) {
                console.warn('[Hybrid Studio] MP3 encoding fallback to WAV:', mp3Err);
                primaryMasterBlob = encodeFloat32PcmToWavBlob(masterTimeline, targetRate);
            }
            timelineAudioSec = Number((masterTimeline.length / targetRate).toFixed(2));
        }

        synthesizedBlobs.length = 0;
        for (const dc of decodedChunks) {
            dc.samples = null;
            dc.audioBuf = null;
        }

        if (!bypassCache && allChunks.length > 0) {
            const idsToDelete = allChunks.map((c) => c.id).filter((id): id is string => Boolean(id));
            if (idsToDelete.length > 0) {
                await studioCacheStore.deleteRenderIds(idsToDelete);
            }
        }

        const finalBlob = primaryMasterBlob || new Blob([], { type: 'audio/mpeg' });
        const wallSecNum = Math.max(0.05, (performance.now() - jobStartTime) / 1000);
        const totalDurationSec = wallSecNum.toFixed(2);
        const realtimeFactorNum = Number((timelineAudioSec / wallSecNum).toFixed(2));

        logAudioStageComplete(
            'audio_mastering',
            `[Completed] Wave 3: Master Timeline Assembled & Encoded (${timelineAudioSec}s Broadcast MP3${
                masteredInWorker ? ', Worker' : ''
            })`,
            {
                timelineSeconds: timelineAudioSec,
                renderedChunksCount: decodedChunks.length,
                masteredInWorker
            }
        );
        logAudioStageComplete(
            'studio_render_job',
            `[Completed] Audio Drama Studio Master Render Job Finished in ${totalDurationSec}s (${timelineAudioSec}s Audio -> ${realtimeFactorNum}x realtime)`,
            {
                totalDurationSec,
                timelineSeconds: timelineAudioSec,
                realtimeFactor: realtimeFactorNum,
                totalChunks: allChunks.length
            }
        );

        if (!deferMastering && onProgress) {
            onProgress({
                wave: 3,
                step: 'done',
                done: 100,
                total: 100,
                message: 'Master audio render complete!'
            });
        }

        return {
            masterWavBlob: null,
            masterMp3Blob: finalBlob,
            blob: finalBlob,
            mp3Blob: finalBlob,
            masterAudioUrl: URL.createObjectURL(finalBlob),
            totalChunks: allChunks.length,
            timelineSeconds: timelineAudioSec,
            realtimeFactor: realtimeFactorNum,
            wallSeconds: Number(totalDurationSec),
            cueTimeline,
            renderedChunks: decodedChunks
        };
    };

    if (deferMastering) {
        return {
            deferredMastering: finalizeMastering,
            totalChunks: allChunks.length
        };
    }

    return finalizeMastering();
}

/** Public Hybrid Audio Studio API exposed both via ES module imports and `window.StudioPipeline`. */
export const StudioPipeline = {
    CANONICAL_VOCAL_EVENTS,
    VOCAL_EVENT_SYNONYMS,
    DRAMA3_SCOPED_TAGS,
    Drama3ToBreezeVectorStore,
    drama3ToBreezeStore,
    RAIN_SENTENCE,
    VOICE_REFERENCE_MIN_SECONDS,
    VOICE_REFERENCE_TARGET_MAX_SECONDS,
    sanitizeVoiceReferenceText,
    estimateReferenceTextSeconds,
    splitReferenceTextIntoSentences,
    extractPersonalizedReferenceTextFromInterview,
    getVoiceReferenceTextForCharacter,
    META_TOKENS,
    integerToEnglishWords,
    ordinalToEnglishWords,
    normalizeAudioDramaText,
    normalizeAudioDramaTextPreservingTags,
    normalizeAudioDramaScriptWithReport,
    analyzeAudioDramaExpressiveness,
    classifyParentheticalTag,
    extractSpokenAndTags,
    splitIntoSpokenSubTurns,
    estimateDramaTurnSeconds,
    chunkAudioDramaTurns,
    isValidVoiceDesignProfile,
    synthesizeVoiceDesignProfile,
    studioTargetF0Band,
    normalizeDirectionKey,
    computeRmsDb,
    analyzeAudioPcmData,
    resolveSpeakerVoiceIdentity,
    computeSpeakersVoiceSignatureHash,
    computeSceneVoiceSignatureHash,
    getCachedSpeakerMasterVoice,
    ensureSpeakerMasterVoice,
    buildDrama3Payload,
    toDrama3HttpBody,
    stitchAudioBlobsWithPause,
    computeWordErrorRate,
    checkBoundaryTruncation,
    detectMetaWordLeakage,
    verifyChunkQuality,
    bisectChunk,
    measureIntegratedLufs,
    generatePinkNoiseRoomTone,
    applyRaisedCosineFades,
    applyHighPass75Hz,
    levelSamplesToLufs,
    runStudioRenderJob,
    decodeWavBlobDirect,
    buildWave2ActivateBody,
    encodeFloat32PcmToWavBlob,
    encodeFloat32PcmToMp3Blob,
    isValidVoiceRefPath
};
