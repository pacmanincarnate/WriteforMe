/**
 * @module services/audio/masterVoices
 * Master Identity Voice calibration (Wave 1 Breeze 2), cached WAV verification against
 * the local Audio Studio Bridge, Drama-3 multi-speaker payload assembly, and
 * non-destructive cast voice registration.
 */

import { migrateAudioDramaSettings, type AudioDramaSettings } from '@/config';
import {
    BREEZE_MASTER_GUIDANCE_SCALE,
    RAIN_SENTENCE,
    analyzeAudioPcmData,
    cleanCharacterNameFromVoiceProfile,
    estimateReferenceTextSeconds,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    getLiveStoryForAudio,
    getVoiceDescriptionForCharacter,
    isLegacyBoilerplateVoiceProfile,
    isMasterVoiceRecordMatching,
    isUsableVocalDescription,
    isValidVoiceRefPath,
    resolveSpeakerVoiceIdentity,
    sanitizeVoiceReferenceText,
    synthesizeVoiceDesignProfile,
    type AudioStoryLike,
    type DramaTurnLike,
    type MasterVoiceRecordLike,
    type VoiceCastMember
} from '@/domain/audio';
import { resolveCharacter } from '@/domain/story';
import { fetchWithTimeout } from '@/services/http';
import { studioCacheStore } from '@/services/storage';
import type { CastMember } from '@/types';
import { decodeAudioBlobToSamples } from './codec';

export interface MasterVoiceRecord extends MasterVoiceRecordLike {
    key: string;
    uploadKey: string;
    speakerKey: string;
    refPath: string | null;
    f0: number;
    seed: number;
    guidanceScale: number;
    calibratedAt: number;
    promptInstruction: string;
    signatureHash: string;
    referenceText: string;
    _freshAudioBlob?: Blob;
}

export interface Drama3ReferenceEntry {
    text: string;
    audio_path: string;
}

export interface Drama3Payload {
    model: string;
    task: 'clon' | 'tts';
    input: string;
    temperature: number;
    top_p: number;
    top_k: number;
    max_tokens: number;
    seed: number;
    response_format: 'wav';
    options: {
        text_chunk_size: string;
        max_tokens: string;
        temperature: string;
        top_p: string;
        top_k: string;
        references?: string;
    };
    speaker_slots: string[];
    references_meta: Drama3ReferenceEntry[];
    missing_ref_speakers: string[];
    all_refs_valid: boolean;
}

export type Drama3HttpBody = Omit<
    Drama3Payload,
    'speaker_slots' | 'references_meta' | 'missing_ref_speakers' | 'all_refs_valid'
>;

export interface Drama3ChunkInput {
    turns?: Array<Record<string, unknown>>;
    estimatedDurationSec?: number;
    baseSeed?: number;
}

/**
 * Fast read-only check for an existing calibrated Master Identity Voice matching the current
 * voice profile, seed, and referenceText. Safe to run outside the Audio.cpp GPU lock.
 */
export async function getCachedSpeakerMasterVoice(
    speakerKey: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {},
    targetUrl = 'http://127.0.0.1:5020',
    signal: AbortSignal | null = null
): Promise<MasterVoiceRecordLike | null> {
    const identity = resolveSpeakerVoiceIdentity(speakerKey, story, settings);
    const { masterKey, uploadKey } = identity;

    let normalizedTarget = (targetUrl || 'http://127.0.0.1:5020').trim();
    if (!/^https?:\/\//i.test(normalizedTarget)) normalizedTarget = 'http://' + normalizedTarget;
    normalizedTarget = normalizedTarget.replace(/\/+$/, '');

    const cachedRecord = (await studioCacheStore.getVoice(masterKey)) as
        | (MasterVoiceRecordLike & { uploadKey?: string })
        | null;
    if (isMasterVoiceRecordMatching(cachedRecord, identity, settings) && cachedRecord) {
        const checkKey = String(cachedRecord.uploadKey || uploadKey);
        const headRes = await fetchWithTimeout(
            `${normalizedTarget}/voices/${encodeURIComponent(checkKey)}`,
            { method: 'HEAD', ...(signal ? { signal } : {}) },
            2000
        ).catch(() => null);
        if (headRes && headRes.ok) {
            return { ...cachedRecord, uploadKey: checkKey };
        }
    }
    return null;
}

/**
 * Ensures a calibrated Master Identity Voice reference WAV exists for the speaker.
 * Synthesizes via Breeze 2 when missing, uploads to the Audio Studio Bridge cache,
 * and stores metadata in IndexedDB `studioCacheStore`.
 */
export async function ensureSpeakerMasterVoice(
    speakerKey: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {},
    targetUrl = 'http://127.0.0.1:5020',
    signal: AbortSignal | null = null
): Promise<MasterVoiceRecord> {
    const identity = resolveSpeakerVoiceIdentity(speakerKey, story, settings);
    const {
        normalizedSpk,
        masterKey,
        promptInstruction,
        baseSeed,
        guidanceScale = BREEZE_MASTER_GUIDANCE_SCALE,
        expectedReferenceText,
        sigHash,
        uploadKey,
        effectiveSettings
    } = identity;

    const effRec = effectiveSettings as Record<string, unknown>;
    const modelId =
        typeof effRec.breezeModelId === 'string' &&
        effRec.breezeModelId &&
        effRec.breezeModelId !== 'breeze_director'
            ? effRec.breezeModelId
            : 'breeze-tts';

    let normalizedTarget = (targetUrl || 'http://127.0.0.1:5020').trim();
    if (!/^https?:\/\//i.test(normalizedTarget)) normalizedTarget = 'http://' + normalizedTarget;
    normalizedTarget = normalizedTarget.replace(/\/+$/, '');

    const cachedRecord = (await studioCacheStore.getVoice(masterKey)) as MasterVoiceRecord | null;
    if (isMasterVoiceRecordMatching(cachedRecord, identity, settings) && cachedRecord) {
        const checkKey = cachedRecord.uploadKey || uploadKey;
        const headRes = await fetchWithTimeout(
            `${normalizedTarget}/voices/${encodeURIComponent(checkKey)}`,
            { method: 'HEAD', ...(signal ? { signal } : {}) },
            2000
        ).catch(() => null);
        if (headRes && headRes.ok) {
            console.log(
                `[Hybrid Studio] Reusing saved Master Voice for "${normalizedSpk}" (Sig: ${sigHash}, Seed #${baseSeed}, Path: ${cachedRecord.refPath}).`
            );
            return { ...cachedRecord, uploadKey: checkKey };
        }
        console.log(
            `[Hybrid Studio] Saved voice sample for "${normalizedSpk}" was missing on bridge disk — regenerating deterministically from Seed #${baseSeed} (Sig: ${sigHash}).`
        );
    }

    console.log(
        `[Hybrid Studio] Calibrating Master Voice for "${normalizedSpk}" (Sig: ${sigHash}, Seed #${baseSeed}, CFG: ${guidanceScale}, Ref ~${estimateReferenceTextSeconds(
            expectedReferenceText
        )}s, Profile "${promptInstruction.substring(0, 80)}...") via Breeze 2...`
    );

    const synthPayload = {
        model: modelId,
        task: 'tts',
        input: expectedReferenceText,
        instruction: promptInstruction,
        instruct: promptInstruction,
        instructions: promptInstruction,
        guidance_scale: guidanceScale,
        temperature: 0.35,
        seed: baseSeed,
        response_format: 'wav'
    };

    const synthRes = await fetchWithTimeout(
        `${normalizedTarget}/v1/audio/speech`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(synthPayload),
            ...(signal ? { signal } : {})
        },
        90000
    );

    if (!synthRes.ok) {
        const errText = await synthRes.text().catch(() => '');
        throw new Error(
            `Master voice synthesis failed for "${normalizedSpk}": ${errText || synthRes.statusText}`
        );
    }

    const masterBlob = await synthRes.blob();

    let f0 = 150;
    try {
        const decoded = await decodeAudioBlobToSamples(masterBlob);
        const analysis = analyzeAudioPcmData(decoded.samples, decoded.sampleRate);
        if (analysis && analysis.medianF0 > 0) f0 = analysis.medianF0;
    } catch {
        // Keep default fallback F0 when WebAudio decode is unavailable
    }

    let refPath: string | null = null;
    try {
        const uploadRes = await fetchWithTimeout(
            `${normalizedTarget}/voices/${encodeURIComponent(uploadKey)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'audio/wav' },
                body: masterBlob,
                ...(signal ? { signal } : {})
            },
            15000
        );

        if (uploadRes && uploadRes.ok) {
            const uploadData = (await uploadRes.json()) as { refPath?: unknown };
            if (uploadData && typeof uploadData.refPath === 'string' && uploadData.refPath) {
                refPath = uploadData.refPath;
            }
        }
    } catch (upErr) {
        console.warn(
            `[Hybrid Studio] Could not upload master WAV to bridge for "${normalizedSpk}":`,
            upErr instanceof Error ? upErr.message : upErr
        );
    }

    if (!refPath) {
        console.warn(
            `[Hybrid Studio] Bridge did not return a disk refPath for "${normalizedSpk}"; skipping WAV base64 storage in IndexedDB.`
        );
    }

    const record: MasterVoiceRecord = {
        key: masterKey,
        uploadKey,
        speakerKey: normalizedSpk,
        refPath: refPath || null,
        f0,
        seed: baseSeed,
        guidanceScale,
        calibratedAt: Date.now(),
        promptInstruction,
        signatureHash: sigHash,
        referenceText: expectedReferenceText
    };

    await studioCacheStore.putVoice(
        masterKey,
        record as unknown as Record<string, unknown>
    );
    console.log(
        `[Hybrid Studio] Master Voice calibrated and anchored for "${normalizedSpk}" (Sig: ${sigHash}, F0: ${f0}Hz, Path: ${
            refPath || 'unavailable'
        }).`
    );
    return { ...record, _freshAudioBlob: masterBlob };
}

export function buildDrama3Payload(
    chunk: Drama3ChunkInput | null | undefined,
    anchorsMap: Map<string, MasterVoiceRecordLike>,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {},
    attempt = 0,
    overrideModelId: string | null = null
): Drama3Payload {
    const slotOf = new Map<string, number>();
    const slotDisplayNames: string[] = [];
    const segments: Array<{ slot: number; spk: string; text: string; origIndex: unknown }> = [];
    const MAX_SPEAKERS = 16;

    const sanitizeDrama3Segment = (txt: unknown): string =>
        String(txt || '')
            .replace(/<\|(?:im_start|im_end|voice|text|interleave|speaker:\d+|semantic:[^|>]*)\|>/gi, '')
            .replace(/\s*\n+\s*/g, ' ')
            .trim();

    const joinDrama3SegmentText = (a: string, b: string): string => {
        const left = String(a || '').trim();
        const right = String(b || '').trim();
        if (!left) return right;
        if (!right) return left;
        const leftVisible = left
            .replace(/(?:<\/(?:whisper|emphasis|stress|soft|fast|slow|forceful)>\s*)+$/gi, '')
            .trim();
        const hasEndPunct = /[.?!:;…—–"'”’\]]$/.test(leftVisible);
        return left + (hasEndPunct ? ' ' : '. ') + right;
    };

    for (const t of chunk?.turns || []) {
        const turnRec = t as DramaTurnLike & { originalTurn?: { index?: unknown } };
        const spk = String(turnRec.speakerKey || turnRec.speaker || 'Narrator');
        const spkCanonKey = spk.trim().toLowerCase() || 'narrator';
        if (!slotOf.has(spkCanonKey)) {
            if (slotOf.size >= MAX_SPEAKERS) {
                const fallbackKey = [...slotOf.keys()][MAX_SPEAKERS - 1];
                slotOf.set(spkCanonKey, slotOf.get(fallbackKey) ?? 0);
            } else {
                const nextSlot = slotOf.size;
                slotOf.set(spkCanonKey, nextSlot);
                slotDisplayNames[nextSlot] = spk;
            }
        }
        const slot = slotOf.get(spkCanonKey) ?? 0;
        const turnText = sanitizeDrama3Segment(
            turnRec.drama3Text || turnRec.spokenText || turnRec.cleanText || turnRec.text || ''
        );
        if (!turnText) continue;

        const last = segments[segments.length - 1];
        if (last && last.slot === slot) {
            last.text = joinDrama3SegmentText(last.text, turnText);
        } else {
            segments.push({
                slot,
                spk: slotDisplayNames[slot] || spk,
                text: turnText,
                origIndex: turnRec.originalTurn?.index
            });
        }
    }

    const orderedSpeakers: string[] = [];
    for (let i = 0; i < slotDisplayNames.length; i++) {
        if (slotDisplayNames[i]) orderedSpeakers[i] = slotDisplayNames[i];
    }

    const references: Drama3ReferenceEntry[] = [];
    const missingRefSpeakers: string[] = [];
    let allRefsValid = orderedSpeakers.length > 0;
    for (let i = 0; i < orderedSpeakers.length; i++) {
        const spkBase = orderedSpeakers[i];
        const spkLower = String(spkBase).trim().toLowerCase();
        const anchor =
            anchorsMap?.get(`${spkBase}_master`) ||
            anchorsMap?.get(spkBase) ||
            anchorsMap?.get(`${spkLower}_master`) ||
            anchorsMap?.get(spkLower) ||
            (spkLower === 'narrator'
                ? anchorsMap?.get('Narrator_master') || anchorsMap?.get('NARRATOR_master')
                : undefined);
        if (anchor && isValidVoiceRefPath(anchor.refPath)) {
            const normalizedPath = String(anchor.refPath).replace(/\\/g, '/');
            references.push({
                text: `<|speaker:${i}|> ${anchor.referenceText || RAIN_SENTENCE}`,
                audio_path: normalizedPath
            });
        } else {
            allRefsValid = false;
            missingRefSpeakers.push(spkBase);
        }
    }

    if (!allRefsValid && orderedSpeakers.length > 1) {
        console.warn(
            `[Drama-3] Missing valid master voice reference(s) for [${missingRefSpeakers.join(
                ', '
            )}] — cannot run multi-speaker cloning without all speaker anchors.`
        );
    }

    const finalRefs = allRefsValid ? references : [];
    const inputText =
        finalRefs.length > 0
            ? segments.map((s) => `<|speaker:${s.slot}|> ${s.text}`).join('\n').trim()
            : segments.map((s) => s.text).join('\n').trim();

    const effectiveSettings = migrateAudioDramaSettings(settings) as Partial<AudioDramaSettings> &
        Record<string, unknown>;

    const baseTemp =
        typeof effectiveSettings.dramaAudioTemperature === 'number'
            ? effectiveSettings.dramaAudioTemperature
            : 0.9;
    const dramaTemp = attempt >= 1 ? +Math.max(0.1, baseTemp * 0.89).toFixed(2) : baseTemp;
    const dramaTopP =
        typeof effectiveSettings.dramaAudioTopP === 'number'
            ? effectiveSettings.dramaAudioTopP
            : 0.9;
    const dramaTopK =
        typeof effectiveSettings.dramaAudioTopK === 'number'
            ? effectiveSettings.dramaAudioTopK
            : 30;

    const totalWords =
        (inputText.replace(/<\|speaker:\d+\|>/g, '').match(/\b\w+\b/g) || []).length || 1;
    const estSec =
        typeof chunk?.estimatedDurationSec === 'number' && chunk.estimatedDurationSec > 0
            ? chunk.estimatedDurationSec
            : Math.max(10, totalWords / 2.1);
    const desiredFrames = Math.ceil(estSec * 21.533 * 1.38) + 180;
    const estRefTokens = finalRefs.reduce((acc, r) => {
        const refTxt = String(r?.text || '').replace(/<\|speaker:\d+\|>\s*/g, '');
        const refSec = estimateReferenceTextSeconds(refTxt) || 8;
        return acc + Math.max(165, Math.ceil(refSec * 22) + Math.ceil(refTxt.length / 2.4) + 32);
    }, 0);
    const estPromptTokens = estRefTokens + Math.ceil(inputText.length / 2.4) + 140;
    const contextBudget =
        typeof effectiveSettings.dramaContextLength === 'number' &&
        effectiveSettings.dramaContextLength >= 2048
            ? effectiveSettings.dramaContextLength
            : 8192;
    const maxSafeFrames = Math.max(512, contextBudget - estPromptTokens - 96);
    let maxTokens = Math.min(4096, maxSafeFrames, Math.max(512, desiredFrames));
    if (attempt >= 1) {
        maxTokens = Math.min(maxTokens, 1900);
    }
    const resolvedModel =
        overrideModelId || String(effectiveSettings.dramaModelId || '') || 'drama-3';

    const options: Drama3Payload['options'] = {
        text_chunk_size: '8000',
        max_tokens: String(maxTokens),
        temperature: String(dramaTemp),
        top_p: String(dramaTopP),
        top_k: String(dramaTopK)
    };
    if (finalRefs.length > 0) {
        options.references = JSON.stringify(finalRefs);
    }

    return {
        model: resolvedModel,
        task: finalRefs.length > 0 ? 'clon' : 'tts',
        input: inputText,
        temperature: dramaTemp,
        top_p: dramaTopP,
        top_k: dramaTopK,
        max_tokens: maxTokens,
        seed: (chunk?.baseSeed || 42) + 101 * attempt,
        response_format: 'wav',
        options,
        speaker_slots: orderedSpeakers,
        references_meta: finalRefs,
        missing_ref_speakers: missingRefSpeakers,
        all_refs_valid: allRefsValid
    };
}

export function toDrama3HttpBody(payload: Drama3Payload): Drama3HttpBody;
export function toDrama3HttpBody<T>(payload: T): T;
export function toDrama3HttpBody(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return payload;
    const copy = { ...(payload as Record<string, unknown>) };
    delete copy.speaker_slots;
    delete copy.references_meta;
    delete copy.missing_ref_speakers;
    delete copy.all_refs_valid;
    return copy;
}

/**
 * Resolves calibrated Master Voices from IndexedDB first, only hitting Wave 1 (Breeze 2)
 * when at least one speaker lacks a matching cached Master WAV.
 */
export async function resolveSpeakersMasterMap(
    uniqueSpeakers: string[],
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown>,
    bridgeUrl: string,
    signal: AbortSignal | null = null,
    activateWave1Fn: (() => Promise<unknown>) | null = null
): Promise<{ anchorsMap: Map<string, MasterVoiceRecordLike>; calibratedFromCache: boolean }> {
    const liveStory = getLiveStoryForAudio(story);
    const effectiveSettings = migrateAudioDramaSettings(settings) as Partial<AudioDramaSettings> &
        Record<string, unknown>;
    const resolvedSettings: Record<string, unknown> = {
        ...effectiveSettings,
        forceRecalibrate: Boolean(
            (settings as Record<string, unknown>)?.forceRecalibrate ||
                effectiveSettings?.forceRecalibrate
        )
    };
    const anchorsMap = new Map<string, MasterVoiceRecordLike>();
    const speakersList = Array.from(new Set((uniqueSpeakers || []).filter(Boolean)));
    if (speakersList.length === 0) return { anchorsMap, calibratedFromCache: true };

    const missingSpeakers: string[] = [];
    const cleanBridgeUrl = String(bridgeUrl || 'http://127.0.0.1:5020')
        .trim()
        .replace(/\/+$/, '');

    const recordSpeaker = (spk: string, rec: MasterVoiceRecordLike | null | undefined): void => {
        if (!rec) return;
        const trimmed = String(spk || '').trim();
        const lower = trimmed.toLowerCase();
        const isNarratorSpk = lower === 'narrator';
        anchorsMap.set(spk + '_master', rec);
        anchorsMap.set(spk, rec);
        if (lower) {
            anchorsMap.set(lower + '_master', rec);
            anchorsMap.set(lower, rec);
        }
        if (isNarratorSpk) {
            anchorsMap.set('Narrator_master', rec);
            anchorsMap.set('NARRATOR_master', rec);
            anchorsMap.set('Narrator', rec);
            anchorsMap.set('NARRATOR', rec);
        }
    };

    for (const spk of speakersList) {
        if (resolvedSettings.forceRecalibrate) {
            missingSpeakers.push(spk);
            continue;
        }
        const identity = resolveSpeakerVoiceIdentity(spk, liveStory, resolvedSettings);
        let cached: (MasterVoiceRecordLike & { uploadKey?: string }) | null;
        try {
            cached = (await studioCacheStore.getVoice(identity.masterKey)) as
                | (MasterVoiceRecordLike & { uploadKey?: string })
                | null;
        } catch {
            cached = null;
        }
        if (isMasterVoiceRecordMatching(cached, identity, resolvedSettings) && cached) {
            const checkKey = String(cached.uploadKey || identity.uploadKey);
            const headRes = checkKey
                ? await fetchWithTimeout(
                      `${cleanBridgeUrl}/voices/${encodeURIComponent(checkKey)}`,
                      { method: 'HEAD', ...(signal ? { signal } : {}) },
                      2000
                  ).catch(() => null)
                : null;
            const existsOnDisk = Boolean(checkKey && headRes && headRes.ok);
            if (existsOnDisk) {
                recordSpeaker(spk, cached);
            } else {
                missingSpeakers.push(spk);
            }
        } else {
            missingSpeakers.push(spk);
        }
    }

    if (missingSpeakers.length === 0) {
        return { anchorsMap, calibratedFromCache: true };
    }

    if (typeof activateWave1Fn === 'function') {
        await activateWave1Fn();
    }

    for (const spk of speakersList) {
        try {
            const latestStory = getLiveStoryForAudio(liveStory);
            const rec = await ensureSpeakerMasterVoice(
                spk,
                latestStory,
                resolvedSettings,
                bridgeUrl,
                signal
            );
            recordSpeaker(spk, rec);
        } catch (mErr) {
            console.warn(
                '[Hybrid Studio] Wave 1 master voice calibration warning for "' + spk + '":',
                mErr instanceof Error ? mErr.message : mErr
            );
        }
    }

    for (const spk of speakersList) {
        const rec = anchorsMap.get(spk) as (MasterVoiceRecordLike & { uploadKey?: string }) | undefined;
        if (rec?.uploadKey) {
            const recheck = await fetchWithTimeout(
                `${cleanBridgeUrl}/voices/${encodeURIComponent(rec.uploadKey)}`,
                { method: 'HEAD', ...(signal ? { signal } : {}) },
                2000
            ).catch(() => null);
            if (!recheck || !recheck.ok) {
                try {
                    const latestStory = getLiveStoryForAudio(liveStory);
                    const regenerated = await ensureSpeakerMasterVoice(
                        spk,
                        latestStory,
                        { ...resolvedSettings, forceRecalibrate: true },
                        bridgeUrl,
                        signal
                    );
                    recordSpeaker(spk, regenerated);
                } catch (reErr) {
                    console.warn(
                        '[Hybrid Studio] Re-calibration warning for "' + spk + '":',
                        reErr instanceof Error ? reErr.message : reErr
                    );
                }
            }
        }
    }
    return { anchorsMap, calibratedFromCache: false };
}

interface CastFillPatch {
    vocal_cadence?: string;
    voice_seed?: number;
    reference_text?: string;
    clearReferenceText?: boolean;
}

/**
 * Inspects parsed Audio Drama script chunks and ensures Narrator + existing cast +
 * any unlisted script speakers have valid `vocal_cadence`, `voice_seed`, and `reference_text`,
 * merging non-destructively inside `setStoryFn`.
 */
export function ensureAudioDramaVoicesRegistered<TStory extends AudioStoryLike>(
    parsedChunks: DramaTurnLike[] | null | undefined,
    currentStory: TStory,
    setStoryFn: ((updater: (prev: TStory) => TStory) => void) | null = null
): TStory {
    if (!currentStory || typeof currentStory !== 'object') return currentStory;
    const liveBase = (getLiveStoryForAudio(currentStory) || currentStory) as TStory;
    let didMutate = false;
    const nextStory = { ...liveBase };
    const existingCast: VoiceCastMember[] = Array.isArray(nextStory.cast)
        ? [...(nextStory.cast as VoiceCastMember[])]
        : [];

    let filledNarratorProfile: string | null = null;
    let filledNarratorSeed: number | null = null;
    const charFillsById = new Map<string, CastFillPatch>();
    const charFillsByName = new Map<string, CastFillPatch>();
    const newlyAddedSpeakers: VoiceCastMember[] = [];

    // 1. Ensure Narrator has a valid profile and seed
    const isUserEditedNarrator = Boolean(nextStory.user_edited?.narrator_vocal_cadence);
    const expectedNarratorProfile = getVoiceDescriptionForCharacter('Narrator', nextStory);
    if (
        !nextStory.narrator_vocal_cadence ||
        (!isUserEditedNarrator && !isUsableVocalDescription(nextStory.narrator_vocal_cadence))
    ) {
        nextStory.narrator_vocal_cadence = expectedNarratorProfile;
        filledNarratorProfile = expectedNarratorProfile;
        didMutate = true;
    }
    if (
        typeof nextStory.narrator_voice_seed !== 'number' ||
        !Number.isFinite(nextStory.narrator_voice_seed)
    ) {
        const narSeed = getDeterministicVoiceSeed('Narrator', nextStory);
        nextStory.narrator_voice_seed = narSeed;
        filledNarratorSeed = narSeed;
        didMutate = true;
    }

    // 2. Ensure existing cast members have a usable vocal_cadence and seed
    for (let i = 0; i < existingCast.length; i++) {
        const c = existingCast[i];
        if (!c || !c.name) continue;
        let charChanged = false;
        const fillPatch: CastFillPatch = {};
        const updatedChar: VoiceCastMember = { ...c };
        const isUserEditedCadence = Boolean(
            updatedChar.user_edited_cadence ||
                nextStory.user_edited?.[`cast.${updatedChar.name}.vocal_cadence`] ||
                nextStory.user_edited?.[`cast.${i}.vocal_cadence`]
        );
        const hasCustomEditedText =
            isUserEditedCadence && Boolean(String(updatedChar.vocal_cadence || '').trim());
        if (
            !hasCustomEditedText &&
            (!isUsableVocalDescription(updatedChar.vocal_cadence) ||
                isLegacyBoilerplateVoiceProfile(updatedChar.vocal_cadence))
        ) {
            updatedChar.vocal_cadence = getVoiceDescriptionForCharacter(updatedChar, nextStory);
            fillPatch.vocal_cadence = updatedChar.vocal_cadence;
            charChanged = true;
        } else {
            const cleaned = cleanCharacterNameFromVoiceProfile(updatedChar.vocal_cadence, [
                updatedChar.name
            ]);
            if (cleaned && cleaned !== updatedChar.vocal_cadence) {
                updatedChar.vocal_cadence = cleaned;
                fillPatch.vocal_cadence = cleaned;
                charChanged = true;
            }
        }
        if (typeof updatedChar.voice_seed !== 'number' || !Number.isFinite(updatedChar.voice_seed)) {
            updatedChar.voice_seed = getDeterministicVoiceSeed(updatedChar, nextStory);
            fillPatch.voice_seed = updatedChar.voice_seed;
            charChanged = true;
        }
        const isUserEditedRefText = Boolean(
            updatedChar.user_edited_reference_text ||
                nextStory.user_edited?.[`cast.${updatedChar.name}.reference_text`] ||
                nextStory.user_edited?.[`cast.${i}.reference_text`]
        );
        if (!isUserEditedRefText) {
            const interviewSrc =
                updatedChar.details?.deep_profile ||
                updatedChar.interview_psychology ||
                updatedChar.deep_profile ||
                updatedChar.canonical_interview_voice ||
                '';
            const derivedRef = extractPersonalizedReferenceTextFromInterview(interviewSrc);
            if (derivedRef) {
                if (updatedChar.reference_text !== derivedRef) {
                    updatedChar.reference_text = derivedRef;
                    fillPatch.reference_text = derivedRef;
                    charChanged = true;
                }
            } else if (updatedChar.reference_text) {
                delete updatedChar.reference_text;
                fillPatch.clearReferenceText = true;
                charChanged = true;
            }
        } else if (updatedChar.reference_text) {
            const sanitizedRef = sanitizeVoiceReferenceText(updatedChar.reference_text);
            if (sanitizedRef && sanitizedRef !== updatedChar.reference_text) {
                updatedChar.reference_text = sanitizedRef;
                fillPatch.reference_text = sanitizedRef;
                charChanged = true;
            }
        }
        if (charChanged) {
            existingCast[i] = updatedChar;
            if (c.id) charFillsById.set(c.id, fillPatch);
            charFillsByName.set(String(c.name).trim().toLowerCase(), fillPatch);
            didMutate = true;
        }
    }

    // 3. Discover any unlisted speaking characters in parsedChunks and auto-create voice profiles
    if (Array.isArray(parsedChunks) && parsedChunks.length > 0) {
        const speakerStats = new Map<string, { emotions: string[]; lines: string[] }>();
        parsedChunks.forEach((ch) => {
            const spk = String(ch?.speaker || '').trim();
            if (!spk || spk.toLowerCase() === 'narrator') return;
            let entry = speakerStats.get(spk);
            if (!entry) {
                entry = { emotions: [], lines: [] };
                speakerStats.set(spk, entry);
            }
            if (typeof ch.emotion === 'string' && ch.emotion) entry.emotions.push(ch.emotion);
            if (ch.spokenText || ch.text) {
                entry.lines.push(String(ch.spokenText || ch.text));
            }
        });

        speakerStats.forEach((stats, spkName) => {
            let matched = resolveCharacter(
                spkName,
                existingCast as unknown as CastMember[]
            ) as VoiceCastMember | null;
            if (!matched) {
                matched =
                    existingCast.find(
                        (c) =>
                            c &&
                            c.name &&
                            (c.name.toLowerCase() === spkName.toLowerCase() ||
                                c.name.toLowerCase().startsWith(spkName.toLowerCase() + ' ') ||
                                spkName.toLowerCase().startsWith(c.name.toLowerCase() + ' '))
                    ) || null;
            }
            if (!matched) {
                const syntheticContextObj: VoiceCastMember = {
                    name: spkName,
                    role: 'Supporting Cast (Audio Drama)',
                    sceneEmotions: stats.emotions.join(', '),
                    sceneDialogueSample: stats.lines.slice(0, 3).join(' ')
                };
                const autoProfile = synthesizeVoiceDesignProfile(
                    syntheticContextObj,
                    spkName,
                    nextStory
                );
                const autoSeed = getDeterministicVoiceSeed({ name: spkName }, nextStory);
                const newCastMember: VoiceCastMember = {
                    id: `char_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    name: spkName,
                    role: 'Supporting',
                    core_flaw: 'Caught in the unfolding dramatic tension of the scene.',
                    core_desire: 'Seeking resolution within the current conflict.',
                    vocal_cadence: autoProfile,
                    voice_seed: autoSeed,
                    details: {
                        history:
                            'Automatically profiled from scene dialogue for Audio Drama performance.',
                        goals: 'Active participant in the scene.',
                        story_events:
                            stats.emotions.length > 0
                                ? `Vocal delivery notes: ${stats.emotions.slice(0, 4).join(', ')}`
                                : 'Speaking role in Audio Drama.'
                    }
                };
                existingCast.push(newCastMember);
                newlyAddedSpeakers.push(newCastMember);
                didMutate = true;
                console.log(
                    `[Audio Drama Voice Cast] Auto-created 7-dimension voice profile for unlisted speaker "${spkName}" (Seed #${autoSeed}):`,
                    autoProfile
                );
            }
        });
    }

    if (didMutate) {
        nextStory.cast = existingCast as TStory['cast'];
        if (typeof setStoryFn === 'function') {
            setStoryFn((prev) => {
                if (!prev || typeof prev !== 'object') return nextStory;
                const prevEditedNarrator = Boolean(prev.user_edited?.narrator_vocal_cadence);
                const out = { ...prev };
                let prevChanged = false;

                if (
                    filledNarratorProfile &&
                    (!prev.narrator_vocal_cadence ||
                        (!prevEditedNarrator &&
                            !isUsableVocalDescription(prev.narrator_vocal_cadence)))
                ) {
                    out.narrator_vocal_cadence = filledNarratorProfile;
                    prevChanged = true;
                }
                if (
                    filledNarratorSeed !== null &&
                    (typeof prev.narrator_voice_seed !== 'number' ||
                        !Number.isFinite(prev.narrator_voice_seed))
                ) {
                    out.narrator_voice_seed = filledNarratorSeed;
                    prevChanged = true;
                }

                const prevCast: VoiceCastMember[] = Array.isArray(prev.cast)
                    ? [...(prev.cast as VoiceCastMember[])]
                    : [];
                const mergedCast = prevCast.map((pc, pIdx) => {
                    if (!pc || !pc.name) return pc;
                    const fill =
                        (pc.id ? charFillsById.get(pc.id) : undefined) ||
                        charFillsByName.get(String(pc.name).trim().toLowerCase());
                    if (!fill) return pc;
                    const mc = { ...pc };
                    let mcChanged = false;
                    const pEditedCad = Boolean(
                        pc.user_edited_cadence ||
                            prev.user_edited?.[`cast.${pc.name}.vocal_cadence`] ||
                            prev.user_edited?.[`cast.${pIdx}.vocal_cadence`]
                    );
                    if (
                        fill.vocal_cadence &&
                        (!mc.vocal_cadence ||
                            (!pEditedCad &&
                                (!isUsableVocalDescription(mc.vocal_cadence) ||
                                    isLegacyBoilerplateVoiceProfile(mc.vocal_cadence))))
                    ) {
                        mc.vocal_cadence = fill.vocal_cadence;
                        mcChanged = true;
                    }
                    if (
                        fill.voice_seed !== undefined &&
                        (typeof mc.voice_seed !== 'number' || !Number.isFinite(mc.voice_seed))
                    ) {
                        mc.voice_seed = fill.voice_seed;
                        mcChanged = true;
                    }
                    const pEditedRef = Boolean(
                        pc.user_edited_reference_text ||
                            prev.user_edited?.[`cast.${pc.name}.reference_text`] ||
                            prev.user_edited?.[`cast.${pIdx}.reference_text`]
                    );
                    if (!pEditedRef) {
                        if (fill.reference_text && !mc.reference_text) {
                            mc.reference_text = fill.reference_text;
                            mcChanged = true;
                        } else if (fill.clearReferenceText && mc.reference_text) {
                            delete mc.reference_text;
                            mcChanged = true;
                        }
                    }
                    if (mcChanged) prevChanged = true;
                    return mcChanged ? mc : pc;
                });

                for (const newSpk of newlyAddedSpeakers) {
                    const newName = String(newSpk.name || '');
                    const alreadyInPrev =
                        resolveCharacter(newName, mergedCast as unknown as CastMember[]) ||
                        mergedCast.find(
                            (c) => c && c.name && c.name.toLowerCase() === newName.toLowerCase()
                        );
                    if (!alreadyInPrev) {
                        mergedCast.push(newSpk);
                        prevChanged = true;
                    }
                }

                if (!prevChanged) return prev;
                out.cast = mergedCast as TStory['cast'];
                return out;
            });
        }
    }
    return nextStory;
}
