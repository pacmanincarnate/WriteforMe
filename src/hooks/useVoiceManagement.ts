/**
 * @module hooks/useVoiceManagement
 * Audio Drama Studio settings persistence, cast speaker alias resolution, multi-layer
 * voice/audio cache invalidation (IDB + Studio Bridge + AudioStore + live queue),
 * Master Identity Voice auditioning & calibration, and voice profile / seed / anchor editors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_SERVICE_URLS,
    STORAGE_KEYS,
    TTS_PIPELINE_TIERS,
    migrateAudioDramaSettings,
    type AudioDramaSettings
} from '@/config';
import {
    cleanCharacterNameFromVoiceProfile,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    getVoiceReferenceTextForCharacter,
    RAIN_SENTENCE,
    parseAudioDramaScript,
    resolveCastMemberForSpeaker,
    sanitizeVoiceReferenceText,
    type AudioStoryLike,
    type MasterVoiceRecordLike,
    type VoiceCastMember
} from '@/domain/audio';
import { resolveCharacter } from '@/domain/story';
import {
    activateAudioCppWave,
    enqueueAudioCppTask,
    getCachedSpeakerMasterVoice,
    isAudioCppQueueBusy,
    synthesizeAudioDramaChunk,
    ensureSpeakerMasterVoice,
    type KokoroWorkerHandle,
    type MasterVoiceRecord
} from '@/services/audio';
import { fetchWithTimeout } from '@/services/http';
import {
    audioStore,
    storyStore,
    studioCacheStore,
    type AudioStore,
    type SceneAudioMeta,
    type SequenceAudioMeta
} from '@/services/storage';
import type { CastMember } from '@/types';
import { safeLocalStorageSet } from '@/utils';

export interface TtsProbeCacheEntry {
    url: string;
    ts: number;
    ok: boolean;
    availableWaves: number[] | null;
}

export interface CollectSpeakerAliasesResult {
    canonicalSpeaker: string;
    matchedChar: VoiceCastMember | null;
    aliases: string[];
}

export interface SharedTtsQueueItem {
    speaker?: string;
    speakers?: string[];
    turns?: Array<{ speaker?: string; speakerKey?: string; [key: string]: unknown }>;
    audioUrl?: string;
    blob?: Blob;
    status?: string;
    emotion?: string | null;
    spokenText?: string;
    text?: string;
    rawSpoken?: string;
    cleanText?: string;
    breezeText?: string;
    drama3Text?: string;
    engine?: string;
    estimatedDurationSec?: number;
    wordCount?: number;
    seqIdx?: number;
    sceneIdx?: number;
    resolvedTier?: number;
    resolvedBackend?: string;
    duration?: number;
    startSec?: number;
    endSec?: number;
    isContinuation?: boolean;
    [key: string]: unknown;
}

export type AudioStoryRecord = AudioStoryLike &
    Record<string, unknown> & {
        id?: string;
        title?: string;
        writing_mode?: string;
        prose?: Record<
            string,
            string | { final?: string; draft?: string; text?: string; content?: string }
        >;
        sequences?: Array<Record<string, unknown>>;
        scenes?: Record<string | number, Array<Record<string, unknown>>>;
        audio_cast_updated_at?: number;
        narrator_voice_seed?: number;
        narrator_vocal_cadence?: string;
        narrator_voice_profile?: string;
        narrator_reference_text?: string;
        character_states?: Record<string, Record<string, unknown>>;
        user_edited?: Record<string, unknown>;
    };

export interface ToastOptionsLike {
    durationMs?: number;
    [key: string]: unknown;
}

export interface RequestConfirmDialogOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    secondaryLabel?: string | null;
    danger?: boolean;
    warning?: boolean;
    onConfirm?: () => void | Promise<void>;
    onSecondary?: () => void;
}

export interface UseVoiceManagementParams {
    story: AudioStoryRecord | null | undefined;
    storyRef: MutableRefObject<AudioStoryRecord | null>;
    setStory: Dispatch<SetStateAction<AudioStoryRecord | null>>;
    getLlmKeys: () => { apiKey: string; openRouterKey: string };
    showToast: (
        message: string,
        variant?: 'success' | 'error' | 'info' | 'warning',
        options?: ToastOptionsLike | null
    ) => void;
    requestConfirm: (options: RequestConfirmDialogOptions) => Promise<boolean | string> | void;
    openEditModal: (
        title: string,
        value: string,
        onConfirm: (newValue: string) => void,
        fieldKey?: string
    ) => void;
    ttsQueueRef: MutableRefObject<SharedTtsQueueItem[]>;
    setTtsQueueAndRefRef: MutableRefObject<
        (
            valOrFn:
                | SharedTtsQueueItem[]
                | ((prev: SharedTtsQueueItem[]) => SharedTtsQueueItem[])
        ) => void
    >;
    ttsWorkerRef: MutableRefObject<KokoroWorkerHandle | null>;
    ttsStatusRef: MutableRefObject<string>;
    isTtsBusyOrPlayingRef: MutableRefObject<boolean>;
    stopTtsPlaybackRef: MutableRefObject<() => void>;
    getOrCreateTtsWorkerRef: MutableRefObject<() => KokoroWorkerHandle | null>;
    initTtsEngineRef: MutableRefObject<(forceDevice?: string | null) => Promise<boolean>>;
    availableSceneAudioMapRef: MutableRefObject<Record<string, SceneAudioMeta>>;
    setAvailableSceneAudioMapRef: MutableRefObject<
        Dispatch<SetStateAction<Record<string, SceneAudioMeta>>>
    >;
    setAvailableSequenceAudioMapRef: MutableRefObject<
        Dispatch<SetStateAction<Record<string, SequenceAudioMeta>>>
    >;
    refreshAvailableSceneAudioRef: MutableRefObject<
        (targetStoryId?: string) => Promise<void>
    >;
}

export interface UseVoiceManagementResult {
    audioDramaSettings: AudioDramaSettings;
    setAudioDramaSettings: Dispatch<SetStateAction<AudioDramaSettings>>;
    audioDramaSettingsRef: MutableRefObject<AudioDramaSettings>;
    sessionTtsTierCapRef: MutableRefObject<number | null>;
    ttsProbeCacheRef: MutableRefObject<TtsProbeCacheEntry | null>;
    updateAudioDramaSetting: <K extends keyof AudioDramaSettings>(
        key: K,
        val: AudioDramaSettings[K]
    ) => void;
    isAuditioningVoice: boolean;
    setIsAuditioningVoice: Dispatch<SetStateAction<boolean>>;
    auditioningTarget: string | null;
    setAuditioningTarget: Dispatch<SetStateAction<string | null>>;
    collectSpeakerAliases: (
        speakerName: VoiceCastMember | string | null | undefined,
        activeStory: AudioStoryRecord | null | undefined
    ) => CollectSpeakerAliasesResult;
    invalidateSpeakerVoiceCache: (
        speakerName: VoiceCastMember | string,
        storyObj?: AudioStoryRecord | null,
        opts?: { clearBridgeWav?: boolean; clearVoiceIdb?: boolean }
    ) => Promise<void>;
    commitVoiceEditUpdate: (
        speakerName: VoiceCastMember | string,
        updaterFn: (prev: AudioStoryRecord) => AudioStoryRecord | null | undefined
    ) => AudioStoryRecord | null;
    stopAuditionPlayback: () => void;
    stopAllAudioPlayback: () => void;
    testAuditionCharacterVoice: (
        charOrName: VoiceCastMember | string,
        options?: { forceRecalibrate?: boolean }
    ) => Promise<void>;
    handleRerollCharacterSeed: (char: VoiceCastMember | string) => void;
    handleRerollNarratorSeed: () => void;
    handleEditNarratorVoiceProfile: () => void;
    handleEditNarratorSeed: () => void;
    handleEditCharacterVoiceProfile: (char: VoiceCastMember | string) => void;
    handleEditCharacterSeed: (char: VoiceCastMember | string) => void;
    handleEditNarratorReferenceText: () => void;
    handleResetNarratorReferenceText: () => void;
    handleEditCharacterReferenceText: (char: VoiceCastMember | string) => void;
    handleResetCharacterReferenceText: (char: VoiceCastMember | string) => void;
    handleResetAllVoiceAndAudioCaches: () => void;
}

const getWindowStores = (): {
    audioStore?: AudioStore;
    studioCacheStore?: typeof studioCacheStore;
} => {
    if (typeof window === 'undefined') return {};
    return window as unknown as {
        audioStore?: AudioStore;
        studioCacheStore?: typeof studioCacheStore;
    };
};

/** Resolves all name variations and honorific-stripped aliases for a speaker/cast member. */
export function collectSpeakerAliases(
    speakerName: VoiceCastMember | string | null | undefined,
    activeStory: AudioStoryRecord | null | undefined
): CollectSpeakerAliasesResult {
    const rawSpk =
        typeof speakerName === 'object' && speakerName !== null
            ? String(speakerName.name || '').trim()
            : String(speakerName || '').trim();
    if (!rawSpk || rawSpk.toLowerCase() === 'narrator') {
        return {
            canonicalSpeaker: 'NARRATOR',
            matchedChar: null,
            aliases: ['Narrator', 'NARRATOR']
        };
    }

    const { found: matchedChar } = resolveCastMemberForSpeaker(speakerName, activeStory);
    const aliasSet = new Set<string>();
    const addAlias = (val: unknown) => {
        const s = String(val || '').trim();
        if (s) aliasSet.add(s);
    };

    addAlias(rawSpk);
    addAlias(matchedChar?.name);
    for (const a of Array.isArray(matchedChar?.aliases) ? matchedChar.aliases : []) addAlias(a);
    const details = matchedChar?.details as Record<string, unknown> | undefined;
    for (const a of Array.isArray(details?.aliases) ? details.aliases : []) addAlias(a);

    const honorificRx =
        /^(?:(?:Vice|Assistant|Deputy)\s+President|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Capt\.?|Captain|Det\.?|Detective|Cmdr\.?|Commander|Prof\.?|Professor|President|Lord|Lady|Sir|Dame|Senator|Agent|Officer|Sergeant|Sgt\.?|Major|General|Colonel|Lieutenant|Lt\.?|Rev\.?|Reverend|Father|Sister|Brother|Mother)\s+/i;
    for (const baseName of [rawSpk, matchedChar?.name].filter(Boolean)) {
        const trimmed = String(baseName).trim();
        const rawParts = trimmed.split(/\s+/).filter(Boolean);
        if (rawParts.length >= 2 && rawParts[0].length >= 2) {
            addAlias(rawParts[0]);
        }
        let stripped = trimmed;
        for (let p = 0; p < 2; p++) {
            stripped = stripped.replace(honorificRx, '').trim();
        }
        if (stripped && stripped !== trimmed) {
            addAlias(stripped);
        }
        const sParts = (stripped || trimmed).split(/\s+/).filter(Boolean);
        if (sParts.length >= 1 && sParts[0].length >= 2) {
            addAlias(sParts[0]);
        }
        if (sParts.length >= 2 && sParts[sParts.length - 1].length >= 3) {
            addAlias(sParts[sParts.length - 1]);
        }
    }

    return {
        canonicalSpeaker: String(matchedChar?.name || rawSpk).trim() || rawSpk,
        matchedChar: matchedChar || null,
        aliases: Array.from(aliasSet)
    };
}

export function findCastIndexForChar(
    castList: VoiceCastMember[],
    char: VoiceCastMember | string
): number {
    const charObj = typeof char === 'object' && char !== null ? char : null;
    const charName = charObj ? charObj.name || '' : String(char || '');
    return (castList || []).findIndex(
        (c) =>
            Boolean(c) &&
            ((Boolean(c.id) && Boolean(charObj?.id) && c.id === charObj?.id) ||
                (Boolean(c.name) &&
                    Boolean(charName) &&
                    String(c.name).toLowerCase() === charName.toLowerCase()))
    );
}

/** Manages Audio Drama settings, cast voice profiles, seeds, anchors, and cache invalidation. */
export function useVoiceManagement(
    params: UseVoiceManagementParams
): UseVoiceManagementResult {
    const {
        story,
        storyRef,
        setStory,
        getLlmKeys,
        showToast,
        requestConfirm,
        openEditModal,
        ttsQueueRef,
        setTtsQueueAndRefRef,
        ttsWorkerRef,
        ttsStatusRef,
        isTtsBusyOrPlayingRef,
        stopTtsPlaybackRef,
        getOrCreateTtsWorkerRef,
        initTtsEngineRef,
        availableSceneAudioMapRef,
        setAvailableSceneAudioMapRef,
        setAvailableSequenceAudioMapRef,
        refreshAvailableSceneAudioRef
    } = params;

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const getLlmKeysRef = useRef(getLlmKeys);
    getLlmKeysRef.current = getLlmKeys;

    const [audioDramaSettings, setAudioDramaSettings] = useState<AudioDramaSettings>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.audioDramaSettings);
            if (saved) {
                return migrateAudioDramaSettings(JSON.parse(saved) as Record<string, unknown>);
            }
            return DEFAULT_AUDIO_DRAMA_SETTINGS;
        } catch {
            return DEFAULT_AUDIO_DRAMA_SETTINGS;
        }
    });

    useEffect(() => {
        safeLocalStorageSet(
            STORAGE_KEYS.audioDramaSettings,
            JSON.stringify(audioDramaSettings)
        );
    }, [audioDramaSettings]);

    const audioDramaSettingsRef = useRef<AudioDramaSettings>(audioDramaSettings);
    audioDramaSettingsRef.current = audioDramaSettings;

    const sessionTtsTierCapRef = useRef<number | null>(null);
    const ttsProbeCacheRef = useRef<TtsProbeCacheEntry | null>(null);

    const updateAudioDramaSetting = useCallback(
        <K extends keyof AudioDramaSettings>(key: K, val: AudioDramaSettings[K]) => {
            if (
                key === 'pipelineTier' ||
                key === 'backend' ||
                key === 'studioBridgeUrl' ||
                key === 'endpoint'
            ) {
                sessionTtsTierCapRef.current = null;
                ttsProbeCacheRef.current = null;
            }
            setAudioDramaSettings((prev) => {
                const next: AudioDramaSettings = { ...prev, [key]: val };
                if (key === 'pipelineTier') {
                    const tierIdx = Number(val);
                    const tierObj = TTS_PIPELINE_TIERS[tierIdx] || null;
                    if (tierObj) next.backend = tierObj.id;
                } else if (key === 'backend') {
                    next.pipelineTier =
                        val === 'system'
                            ? 0
                            : val === 'kokoro' || val === 'browser'
                              ? 1
                              : val === 'breeze'
                                ? 2
                                : 3;
                }
                audioDramaSettingsRef.current = next;
                return next;
            });
        },
        []
    );

    const [isAuditioningVoice, setIsAuditioningVoice] = useState(false);
    const [auditioningTarget, setAuditioningTarget] = useState<string | null>(null);
    const isAuditioningVoiceRef = useRef(isAuditioningVoice);
    isAuditioningVoiceRef.current = isAuditioningVoice;
    const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
    const auditionBlobUrlRef = useRef<string | null>(null);
    const auditionSessionIdRef = useRef(0);
    const voiceInvalidationPromiseRef = useRef<Promise<void>>(Promise.resolve());

    const stopAuditionPlayback = useCallback(() => {
        auditionSessionIdRef.current += 1;
        if (auditionAudioRef.current) {
            try {
                auditionAudioRef.current.onended = null;
                auditionAudioRef.current.onerror = null;
                auditionAudioRef.current.pause();
                auditionAudioRef.current.removeAttribute('src');
                auditionAudioRef.current.load();
            } catch {
                // Ignore HTMLAudio teardown failures
            }
            auditionAudioRef.current = null;
        }
        if (auditionBlobUrlRef.current) {
            try {
                URL.revokeObjectURL(auditionBlobUrlRef.current);
            } catch {
                // Ignore URL revoke errors
            }
            auditionBlobUrlRef.current = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Ignore speechSynthesis cancel errors
            }
        }
        setIsAuditioningVoice(false);
        setAuditioningTarget(null);
    }, []);

    const stopAllAudioPlayback = useCallback(() => {
        stopAuditionPlayback();
        stopTtsPlaybackRef.current();
    }, [stopAuditionPlayback, stopTtsPlaybackRef]);

    const invalidateSpeakerVoiceCache = useCallback(
        (
            speakerName: VoiceCastMember | string,
            storyObj: AudioStoryRecord | null = null,
            opts: { clearBridgeWav?: boolean; clearVoiceIdb?: boolean } = {}
        ): Promise<void> => {
            const clearBridgeWav = opts?.clearBridgeWav !== false;
            const clearVoiceIdb = opts?.clearVoiceIdb !== false;
            const activeStory = storyObj || storyRef.current || story || null;
            if (storyObj && typeof storyObj === 'object') {
                storyObj.audio_cast_updated_at = Date.now();
            }
            const rawStoryId = String(activeStory?.id || activeStory?.title || 'story');
            const cleanStoryId = rawStoryId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const { canonicalSpeaker, matchedChar, aliases } = collectSpeakerAliases(
                speakerName,
                activeStory
            );
            const aliasLowerSet = new Set(aliases.map((a) => a.toLowerCase()));
            const isNarratorEdit = canonicalSpeaker.toUpperCase() === 'NARRATOR';
            const castList: VoiceCastMember[] =
                Array.isArray(activeStory?.cast) && activeStory.cast.length > 0
                    ? activeStory.cast
                    : Array.isArray(activeStory?.characters)
                      ? activeStory.characters
                      : [];

            const matchesSpeakerOrAlias = (nameVal: unknown): boolean => {
                const val = String(nameVal || '').trim();
                if (!val) return false;
                const lower = val.toLowerCase();
                if (aliasLowerSet.has(lower)) return true;
                if (!isNarratorEdit && matchedChar) {
                    const res = resolveCharacter(val, castList as unknown as CastMember[]);
                    if (
                        res &&
                        ((matchedChar.id && res.id === matchedChar.id) ||
                            (matchedChar.name &&
                                res.name?.toLowerCase() === String(matchedChar.name).toLowerCase()))
                    ) {
                        return true;
                    }
                }
                return aliases.some((a) => {
                    const al = a.toLowerCase();
                    return lower === al || lower.startsWith(`${al} `) || al.startsWith(`${lower} `);
                });
            };

            if (ttsQueueRef?.current && Array.isArray(ttsQueueRef.current)) {
                let didClearChunk = false;
                const updatedQ = ttsQueueRef.current.map((ch) => {
                    const hitLead = matchesSpeakerOrAlias(ch?.speaker || 'Narrator');
                    const hitMulti =
                        Array.isArray(ch?.speakers) && ch.speakers.some(matchesSpeakerOrAlias);
                    const hitTurns =
                        Array.isArray(ch?.turns) &&
                        ch.turns.some((t) => matchesSpeakerOrAlias(t?.speakerKey || t?.speaker));
                    if (ch && ch.audioUrl && (hitLead || hitMulti || hitTurns)) {
                        try {
                            URL.revokeObjectURL(ch.audioUrl);
                        } catch {
                            // Ignore revoke failure
                        }
                        didClearChunk = true;
                        return { ...ch, audioUrl: undefined, status: 'pending' };
                    }
                    return ch;
                });
                if (didClearChunk) {
                    setTtsQueueAndRefRef.current(updatedQ);
                }
            }

            const runInvalidation = async (): Promise<void> => {
                try {
                    const cacheTasks: Array<Promise<unknown>> = [];
                    const winStores = getWindowStores();
                    const activeStudioCache = winStores.studioCacheStore || studioCacheStore;
                    if (activeStudioCache) {
                        if (
                            clearVoiceIdb &&
                            typeof activeStudioCache.clearVoicesForSpeaker === 'function'
                        ) {
                            cacheTasks.push(
                                activeStudioCache
                                    .clearVoicesForSpeaker(cleanStoryId, canonicalSpeaker, aliases)
                                    .catch(() => {})
                            );
                        }
                        if (typeof activeStudioCache.clearRendersForStory === 'function') {
                            cacheTasks.push(
                                activeStudioCache.clearRendersForStory(cleanStoryId).catch(() => {})
                            );
                        }
                    }

                    if (clearBridgeWav) {
                        const effCfg = audioDramaSettingsRef.current;
                        let bridgeUrl = String(
                            effCfg?.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
                        )
                            .trim()
                            .replace(/\/+$/, '');
                        if (bridgeUrl) {
                            if (!/^https?:\/\//i.test(bridgeUrl)) {
                                bridgeUrl = `http://${bridgeUrl}`;
                            }
                            cacheTasks.push(
                                fetchWithTimeout(
                                    `${bridgeUrl}/voices/invalidate`,
                                    {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            storyId: cleanStoryId,
                                            speakerAliases: aliases
                                        })
                                    },
                                    3000
                                ).catch(() => null)
                            );
                        }
                    }

                    await Promise.all(cacheTasks);

                    const activeAudioStore = winStores.audioStore || audioStore;
                    if (activeAudioStore && rawStoryId) {
                        const aliasRegexes = aliases
                            .filter((a) => a.length >= 2)
                            .map(
                                (a) =>
                                    new RegExp(
                                        `\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
                                        'i'
                                    )
                            );
                        const sceneAudioSnapshot = { ...(availableSceneAudioMapRef.current || {}) };
                        const metaList = await activeAudioStore
                            .listStoryAudioMeta(rawStoryId)
                            .catch(() => []);
                        const affectedSeqs = new Set<number>();

                        for (const m of metaList || []) {
                            const seqIdxNum = Number(m?.seqIdx);
                            const sceneIdxNum = Number(m?.sceneIdx);
                            if (!Number.isFinite(seqIdxNum) || !Number.isFinite(sceneIdxNum)) {
                                continue;
                            }
                            let touchesSpeaker = isNarratorEdit;
                            if (!touchesSpeaker) {
                                const proseObj =
                                    activeStory?.prose?.[`${seqIdxNum}-${sceneIdxNum}`];
                                const proseText =
                                    typeof proseObj === 'object' && proseObj !== null
                                        ? String(proseObj.final || proseObj.draft || '')
                                        : String(proseObj || '');
                                if (!proseText) {
                                    touchesSpeaker = true;
                                } else {
                                    try {
                                        const turns = parseAudioDramaScript(proseText, {
                                            raw: true,
                                            collapseNarrator: false
                                        });
                                        if (
                                            Array.isArray(turns) &&
                                            turns.some((t) => {
                                                const rec = t as unknown as Record<string, unknown>;
                                                return matchesSpeakerOrAlias(
                                                    rec?.speakerKey || t?.speaker
                                                );
                                            })
                                        ) {
                                            touchesSpeaker = true;
                                        }
                                    } catch {
                                        // Fallback to regex matching below
                                    }
                                    if (
                                        !touchesSpeaker &&
                                        aliasRegexes.some((rx) => rx.test(proseText))
                                    ) {
                                        touchesSpeaker = true;
                                    }
                                }
                            }
                            if (touchesSpeaker) {
                                affectedSeqs.add(seqIdxNum);
                                delete sceneAudioSnapshot[`${seqIdxNum}-${sceneIdxNum}`];
                                if (typeof activeAudioStore.deleteSceneAudio === 'function') {
                                    await activeAudioStore
                                        .deleteSceneAudio(rawStoryId, seqIdxNum, sceneIdxNum)
                                        .catch(() => {});
                                }
                            }
                        }

                        if (typeof activeAudioStore.deleteSequenceAudio === 'function') {
                            const seqMetas =
                                typeof activeAudioStore.listStorySequenceAudioMeta === 'function'
                                    ? await activeAudioStore
                                          .listStorySequenceAudioMeta(rawStoryId)
                                          .catch(() => [])
                                    : [];
                            for (const sm of seqMetas || []) {
                                const sIdx = Number(sm?.seqIdx);
                                if (
                                    Number.isFinite(sIdx) &&
                                    (isNarratorEdit || affectedSeqs.has(sIdx))
                                ) {
                                    await activeAudioStore
                                        .deleteSequenceAudio(rawStoryId, sIdx)
                                        .catch(() => {});
                                }
                            }
                        }

                        if ((storyRef.current || story)?.id === rawStoryId) {
                            availableSceneAudioMapRef.current = sceneAudioSnapshot;
                            setAvailableSceneAudioMapRef.current(sceneAudioSnapshot);
                            if (typeof refreshAvailableSceneAudioRef.current === 'function') {
                                await refreshAvailableSceneAudioRef.current(rawStoryId);
                            }
                        }
                    }
                } catch (invErr) {
                    console.warn(
                        '[invalidateSpeakerVoiceCache] Cache invalidation warning:',
                        invErr
                    );
                }
            };

            const nextChain = (voiceInvalidationPromiseRef.current || Promise.resolve())
                .catch(() => {})
                .then(runInvalidation);
            voiceInvalidationPromiseRef.current = nextChain;
            return nextChain;
        },
        [
            story,
            storyRef,
            ttsQueueRef,
            setTtsQueueAndRefRef,
            availableSceneAudioMapRef,
            setAvailableSceneAudioMapRef,
            refreshAvailableSceneAudioRef
        ]
    );

    const commitVoiceEditUpdate = useCallback(
        (
            speakerName: VoiceCastMember | string,
            updaterFn: (prev: AudioStoryRecord) => AudioStoryRecord | null | undefined
        ): AudioStoryRecord | null => {
            const baseStory = storyRef.current || story;
            if (!baseStory) return null;
            const draftNext = updaterFn(baseStory);
            if (!draftNext || draftNext === baseStory) return null;
            const nextState: AudioStoryRecord = { ...draftNext, audio_cast_updated_at: Date.now() };
            storyRef.current = nextState;
            setStory(nextState);
            void invalidateSpeakerVoiceCache(speakerName, nextState);
            if (nextState.id && typeof storyStore?.saveStory === 'function') {
                storyStore.saveStory(nextState.id, nextState).catch((err) => {
                    console.warn('[commitVoiceEditUpdate] Story save warning:', err);
                });
            }
            return nextState;
        },
        [story, storyRef, setStory, invalidateSpeakerVoiceCache]
    );

    const testAuditionCharacterVoice = useCallback(
        async (
            charOrName: VoiceCastMember | string,
            options: { forceRecalibrate?: boolean } = {}
        ): Promise<void> => {
            const forceRecalibrate = Boolean(options?.forceRecalibrate);
            const charName =
                typeof charOrName === 'object' && charOrName !== null
                    ? charOrName.name || 'Character'
                    : String(charOrName);
            const anyPlaying = isTtsBusyOrPlayingRef.current || isAuditioningVoiceRef.current;
            if (anyPlaying) {
                stopAllAudioPlayback();
                if (!forceRecalibrate) return;
            }

            const myAuditionSession = auditionSessionIdRef.current + 1;
            auditionSessionIdRef.current = myAuditionSession;

            await (voiceInvalidationPromiseRef.current || Promise.resolve()).catch(() => {});
            if (auditionSessionIdRef.current !== myAuditionSession) return;

            const activeStory = storyRef.current || story || null;
            const activeCastList: VoiceCastMember[] =
                Array.isArray(activeStory?.cast) && activeStory.cast.length > 0
                    ? activeStory.cast
                    : Array.isArray(activeStory?.characters)
                      ? activeStory.characters
                      : [];
            const passedCharObj =
                typeof charOrName === 'object' && charOrName !== null ? charOrName : null;
            const freshCharObj =
                (passedCharObj?.id
                    ? activeCastList.find((c) => c && c.id === passedCharObj.id)
                    : null) ||
                resolveCharacter(charName, activeCastList as unknown as CastMember[]) ||
                passedCharObj;
            const goldStandardRefText =
                getVoiceReferenceTextForCharacter(
                    (freshCharObj as VoiceCastMember | null) || charName,
                    activeStory
                ) || RAIN_SENTENCE;

            const effAudioSettings = audioDramaSettingsRef.current;
            const backend: string = effAudioSettings.backend || 'hybrid';

            if (backend === 'system') {
                setIsAuditioningVoice(true);
                setAuditioningTarget(charName);
                showToastRef.current(`Auditioning ${charName} via System Voice...`, 'info');
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try {
                        window.speechSynthesis.cancel();
                    } catch {
                        // Ignore cancel failures
                    }
                    const u = new SpeechSynthesisUtterance(goldStandardRefText);
                    try {
                        const voices = window.speechSynthesis.getVoices();
                        if (voices && voices.length > 0) {
                            const pref =
                                voices.find(
                                    (v) =>
                                        (v.lang.startsWith('en') || v.lang.startsWith('en-US')) &&
                                        (v.name.includes('Natural') ||
                                            v.name.includes('Siri') ||
                                            v.name.includes('Enhanced') ||
                                            v.name.includes('Google'))
                                ) ||
                                voices.find((v) => v.lang.startsWith('en')) ||
                                voices[0];
                            if (pref) u.voice = pref;
                        }
                    } catch {
                        // Ignore voice enumeration errors
                    }
                    u.onend = () => {
                        if (auditionSessionIdRef.current !== myAuditionSession) return;
                        setIsAuditioningVoice(false);
                        setAuditioningTarget(null);
                    };
                    u.onerror = () => {
                        if (auditionSessionIdRef.current !== myAuditionSession) return;
                        setIsAuditioningVoice(false);
                        setAuditioningTarget(null);
                    };
                    window.speechSynthesis.speak(u);
                    return;
                }
                setIsAuditioningVoice(false);
                setAuditioningTarget(null);
                return;
            }

            if (backend === 'kokoro' || backend === 'browser') {
                getOrCreateTtsWorkerRef.current();
                if (
                    ttsStatusRef.current !== 'ready' &&
                    ttsStatusRef.current !== 'playing' &&
                    ttsStatusRef.current !== 'paused'
                ) {
                    void initTtsEngineRef.current();
                }
            }

            setIsAuditioningVoice(true);
            setAuditioningTarget(charName);
            showToastRef.current(
                forceRecalibrate
                    ? `Recalibrating Master Voice for ${charName} via ${backend.toUpperCase()}...`
                    : `Auditioning ${charName} master voice via ${backend.toUpperCase()}...`,
                'info'
            );

            let auditionUrl: string | null = null;
            let wasFreshCalibration = false;
            let calibratedSigHash = '';
            try {
                if (backend === 'hybrid' || backend === 'audiocpp' || backend === 'breeze') {
                    const effectiveSettings = migrateAudioDramaSettings(effAudioSettings);
                    let targetUrl = String(
                        effectiveSettings.studioBridgeUrl ||
                            effectiveSettings.audioCppUrl ||
                            DEFAULT_SERVICE_URLS.audioStudioBridge
                    ).trim();
                    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `http://${targetUrl}`;
                    targetUrl = targetUrl.replace(/\/+$/, '');

                    let masterRec: MasterVoiceRecordLike | null = forceRecalibrate
                        ? null
                        : await getCachedSpeakerMasterVoice(
                              (freshCharObj as VoiceCastMember | null) || charName,
                              activeStory,
                              effectiveSettings,
                              targetUrl
                          );
                    if (!masterRec) {
                        if (isAudioCppQueueBusy()) {
                            showToastRef.current(
                                `Studio GPU is busy rendering scene audio — ${charName} audition is queued next...`,
                                'info',
                                { durationMs: 6000 }
                            );
                        }
                        masterRec = await enqueueAudioCppTask(async () => {
                            if (auditionSessionIdRef.current !== myAuditionSession) return null;
                            const latestStory = storyRef.current || activeStory;
                            const latestCast: VoiceCastMember[] =
                                Array.isArray(latestStory?.cast) && latestStory.cast.length > 0
                                    ? latestStory.cast
                                    : Array.isArray(latestStory?.characters)
                                      ? latestStory.characters
                                      : [];
                            const latestChar =
                                (passedCharObj?.id
                                    ? latestCast.find((c) => c && c.id === passedCharObj.id)
                                    : null) ||
                                resolveCharacter(
                                    charName,
                                    latestCast as unknown as CastMember[]
                                ) ||
                                freshCharObj;
                            await activateAudioCppWave(targetUrl, 1, undefined, 30000);
                            return await ensureSpeakerMasterVoice(
                                (latestChar as VoiceCastMember | null) || charName,
                                latestStory,
                                { ...effectiveSettings, forceRecalibrate },
                                targetUrl,
                                null
                            );
                        });
                    }
                    if (auditionSessionIdRef.current !== myAuditionSession) return;

                    const masterVoice = masterRec as MasterVoiceRecord | null;
                    wasFreshCalibration = Boolean(masterVoice?._freshAudioBlob);
                    calibratedSigHash = masterVoice?.signatureHash || '';
                    if (wasFreshCalibration) {
                        void invalidateSpeakerVoiceCache(
                            charName,
                            storyRef.current || activeStory,
                            {
                                clearBridgeWav: false,
                                clearVoiceIdb: false
                            }
                        );
                    }

                    let masterBlob: Blob | null =
                        masterVoice?._freshAudioBlob && masterVoice._freshAudioBlob.size > 44
                            ? masterVoice._freshAudioBlob
                            : null;
                    if (!masterBlob && masterVoice?.uploadKey) {
                        const voiceRes = await fetchWithTimeout(
                            `${targetUrl}/voices/${encodeURIComponent(masterVoice.uploadKey)}`,
                            { method: 'GET' },
                            15000
                        ).catch(() => null);
                        if (voiceRes && voiceRes.ok) {
                            const fetchedBlob = await voiceRes.blob();
                            if (fetchedBlob && fetchedBlob.size > 44) masterBlob = fetchedBlob;
                        }
                    }
                    if (masterBlob) {
                        auditionUrl = URL.createObjectURL(masterBlob);
                    }
                }

                if (!auditionUrl) {
                    const { apiKey, openRouterKey } = getLlmKeysRef.current();
                    auditionUrl = await synthesizeAudioDramaChunk({
                        chunk: {
                            speaker: charName,
                            speakerObj: (freshCharObj as VoiceCastMember | null) || undefined,
                            emotion: 'warm and expressive',
                            spokenText: goldStandardRefText
                        },
                        backend,
                        story: activeStory,
                        settings: effAudioSettings,
                        mainApiKey: apiKey,
                        mainOpenRouterKey: openRouterKey,
                        kokoroWorkerRef: ttsWorkerRef
                    });
                }

                if (auditionSessionIdRef.current !== myAuditionSession) {
                    if (auditionUrl) {
                        try {
                            URL.revokeObjectURL(auditionUrl);
                        } catch {
                            // Ignore revoke failure
                        }
                    }
                    return;
                }

                const aud = new Audio(auditionUrl);
                auditionAudioRef.current = aud;
                auditionBlobUrlRef.current = auditionUrl;
                aud.onended = () => {
                    if (auditionSessionIdRef.current !== myAuditionSession) return;
                    if (auditionBlobUrlRef.current) {
                        try {
                            URL.revokeObjectURL(auditionBlobUrlRef.current);
                        } catch {
                            // Ignore revoke error
                        }
                        auditionBlobUrlRef.current = null;
                    }
                    auditionAudioRef.current = null;
                    setIsAuditioningVoice(false);
                    setAuditioningTarget(null);
                };
                aud.onerror = () => {
                    if (auditionSessionIdRef.current !== myAuditionSession) return;
                    if (auditionBlobUrlRef.current) {
                        try {
                            URL.revokeObjectURL(auditionBlobUrlRef.current);
                        } catch {
                            // Ignore revoke error
                        }
                        auditionBlobUrlRef.current = null;
                    }
                    auditionAudioRef.current = null;
                    setIsAuditioningVoice(false);
                    setAuditioningTarget(null);
                    showToastRef.current('Audio playback failed for test audition', 'warning');
                };
                await aud.play();
                if (auditionSessionIdRef.current === myAuditionSession) {
                    const sigNote = calibratedSigHash ? ` (Sig: ${calibratedSigHash})` : '';
                    showToastRef.current(
                        wasFreshCalibration
                            ? `Calibrated & saved Master Voice for ${charName}${sigNote}`
                            : `Playing saved Master Voice for ${charName}${sigNote}`,
                        'success'
                    );
                }
            } catch (err) {
                if (auditionUrl) {
                    try {
                        URL.revokeObjectURL(auditionUrl);
                    } catch {
                        // Ignore revoke failure
                    }
                }
                if (auditionSessionIdRef.current === myAuditionSession) {
                    auditionAudioRef.current = null;
                    auditionBlobUrlRef.current = null;
                    setIsAuditioningVoice(false);
                    setAuditioningTarget(null);
                    const message = err instanceof Error ? err.message : String(err);
                    showToastRef.current(`Audition failed: ${message}`, 'error');
                }
            }
        },
        [
            story,
            storyRef,
            ttsWorkerRef,
            ttsStatusRef,
            isTtsBusyOrPlayingRef,
            getOrCreateTtsWorkerRef,
            initTtsEngineRef,
            stopAllAudioPlayback,
            invalidateSpeakerVoiceCache
        ]
    );

    const handleRerollCharacterSeed = useCallback(
        (char: VoiceCastMember | string) => {
            const charName =
                typeof char === 'object' && char !== null ? char.name || 'Character' : String(char);
            const newSeed = Math.floor(Math.random() * 900000) + 100000;
            const updated = commitVoiceEditUpdate(charName, (prev) => {
                const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                const baseList = hasCast
                    ? prev.cast || []
                    : Array.isArray(prev.characters)
                      ? prev.characters
                      : [];
                const newCast = [...baseList];
                const idx = findCastIndexForChar(newCast, char);
                if (idx === -1) return null;
                newCast[idx] = { ...newCast[idx], voice_seed: newSeed };
                return hasCast
                    ? { ...prev, cast: newCast }
                    : { ...prev, cast: newCast, characters: newCast };
            });
            if (updated) {
                showToastRef.current(`Re-rolled voice seed for ${charName}: #${newSeed}`, 'info');
            }
        },
        [commitVoiceEditUpdate]
    );

    const handleRerollNarratorSeed = useCallback(() => {
        const newSeed = Math.floor(Math.random() * 900000) + 100000;
        commitVoiceEditUpdate('Narrator', (prev) => ({
            ...prev,
            narrator_voice_seed: newSeed,
            user_edited: { ...(prev.user_edited || {}), narrator_voice_seed: true }
        }));
        showToastRef.current(`Re-rolled Narrator voice seed: #${newSeed}`, 'info');
    }, [commitVoiceEditUpdate]);

    const handleEditNarratorVoiceProfile = useCallback(() => {
        const currentProfile = getVoiceDescriptionForCharacter(
            'Narrator',
            storyRef.current || story
        );
        openEditModal(
            'Narrator Voice Profile (Breeze 2 Instruct Prompt)',
            currentProfile,
            (newValue) => {
                const cleaned = cleanCharacterNameFromVoiceProfile(String(newValue || '').trim(), [
                    'Narrator',
                    'The Narrator'
                ]);
                if (!cleaned) return;
                commitVoiceEditUpdate('Narrator', (prev) => ({
                    ...prev,
                    narrator_vocal_cadence: cleaned,
                    narrator_voice_profile: cleaned,
                    user_edited: { ...(prev.user_edited || {}), narrator_vocal_cadence: true }
                }));
                showToastRef.current('Updated Narrator voice profile', 'success');
            },
            'narrator_vocal_cadence'
        );
    }, [story, storyRef, openEditModal, commitVoiceEditUpdate]);

    const handleEditNarratorSeed = useCallback(() => {
        const currentSeed = getDeterministicVoiceSeed('Narrator', storyRef.current || story);
        openEditModal(
            'Narrator Deterministic Voice Seed (Integer)',
            String(currentSeed),
            (newValue) => {
                const parsed = parseInt(String(newValue || '').replace(/[^0-9]/g, ''), 10);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    showToastRef.current('Please enter a valid positive integer seed', 'warning');
                    return;
                }
                commitVoiceEditUpdate('Narrator', (prev) => ({
                    ...prev,
                    narrator_voice_seed: parsed,
                    user_edited: { ...(prev.user_edited || {}), narrator_voice_seed: true }
                }));
                showToastRef.current(`Updated Narrator voice seed: #${parsed}`, 'success');
            },
            'narrator_voice_seed'
        );
    }, [story, storyRef, openEditModal, commitVoiceEditUpdate]);

    const handleEditCharacterVoiceProfile = useCallback(
        (char: VoiceCastMember | string) => {
            const charName =
                typeof char === 'object' && char !== null
                    ? char.name || 'Character'
                    : String(char);
            const currentProfile = getVoiceDescriptionForCharacter(
                charName,
                storyRef.current || story
            );
            const charKey = `cast.${charName}.vocal_cadence`;
            openEditModal(
                `Voice Profile for ${charName} (Breeze 2 Instruct Prompt)`,
                currentProfile,
                (newValue) => {
                    const cleaned = cleanCharacterNameFromVoiceProfile(
                        String(newValue || '').trim(),
                        [charName]
                    );
                    if (!cleaned) return;
                    commitVoiceEditUpdate(charName, (prev) => {
                        const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                        const baseList = hasCast
                            ? prev.cast || []
                            : Array.isArray(prev.characters)
                              ? prev.characters
                              : [];
                        const newCast = [...baseList];
                        const idx = findCastIndexForChar(newCast, char);
                        if (idx === -1) return null;
                        const prevDetails = newCast[idx].details;
                        const updatedChar = {
                            ...newCast[idx],
                            vocal_cadence: cleaned,
                            vocal_profile: cleaned,
                            voice_profile: cleaned,
                            voice_description: cleaned,
                            user_edited_cadence: true,
                            is_user_edited: true,
                            user_edited: true
                        };
                        if (prevDetails && typeof prevDetails === 'object') {
                            updatedChar.details = { ...prevDetails, vocal_profile: cleaned };
                        }
                        newCast[idx] = updatedChar;
                        const nextCharacterStates = { ...(prev.character_states || {}) };
                        if (nextCharacterStates[charName]) {
                            nextCharacterStates[charName] = {
                                ...nextCharacterStates[charName],
                                vocal_cadence: cleaned
                            };
                        }
                        return {
                            ...prev,
                            cast: newCast,
                            ...(hasCast ? {} : { characters: newCast }),
                            character_states: nextCharacterStates,
                            user_edited: {
                                ...(prev.user_edited || {}),
                                [charKey]: true,
                                [`cast.${idx}.vocal_cadence`]: true,
                                [`cast.${charName}`]: true
                            }
                        };
                    });
                    showToastRef.current(`Updated voice profile for ${charName}`, 'success');
                },
                charKey
            );
        },
        [story, storyRef, openEditModal, commitVoiceEditUpdate]
    );

    const handleEditCharacterSeed = useCallback(
        (char: VoiceCastMember | string) => {
            const charName =
                typeof char === 'object' && char !== null
                    ? char.name || 'Character'
                    : String(char);
            const currentSeed = getDeterministicVoiceSeed(charName, storyRef.current || story);
            const charKey = `cast.${charName}.voice_seed`;
            openEditModal(
                `Deterministic Voice Seed for ${charName} (Integer)`,
                String(currentSeed),
                (newValue) => {
                    const parsed = parseInt(String(newValue || '').replace(/[^0-9]/g, ''), 10);
                    if (!Number.isFinite(parsed) || parsed <= 0) {
                        showToastRef.current(
                            'Please enter a valid positive integer seed',
                            'warning'
                        );
                        return;
                    }
                    commitVoiceEditUpdate(charName, (prev) => {
                        const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                        const baseList = hasCast
                            ? prev.cast || []
                            : Array.isArray(prev.characters)
                              ? prev.characters
                              : [];
                        const newCast = [...baseList];
                        const idx = findCastIndexForChar(newCast, char);
                        if (idx === -1) return null;
                        newCast[idx] = { ...newCast[idx], voice_seed: parsed };
                        return {
                            ...prev,
                            cast: newCast,
                            ...(hasCast ? {} : { characters: newCast }),
                            user_edited: {
                                ...(prev.user_edited || {}),
                                [charKey]: true
                            }
                        };
                    });
                    showToastRef.current(`Updated voice seed for ${charName}: #${parsed}`, 'success');
                },
                charKey
            );
        },
        [story, storyRef, openEditModal, commitVoiceEditUpdate]
    );

    const handleEditNarratorReferenceText = useCallback(() => {
        const currentRef = getVoiceReferenceTextForCharacter(
            'Narrator',
            storyRef.current || story
        );
        openEditModal(
            'Narrator Voice Reference Transcript (TTS Anchor)',
            currentRef,
            (newValue) => {
                const cleaned = sanitizeVoiceReferenceText(String(newValue || '').trim());
                if (!cleaned) {
                    showToastRef.current('Reference text cannot be empty', 'warning');
                    return;
                }
                commitVoiceEditUpdate('Narrator', (prev) => ({
                    ...prev,
                    narrator_reference_text: cleaned,
                    user_edited: { ...(prev.user_edited || {}), narrator_reference_text: true }
                }));
                showToastRef.current('Updated Narrator voice reference transcript', 'success');
            },
            'narrator_reference_text'
        );
    }, [story, storyRef, openEditModal, commitVoiceEditUpdate]);

    const handleResetNarratorReferenceText = useCallback(() => {
        commitVoiceEditUpdate('Narrator', (prev) => {
            const next = { ...prev };
            delete next.narrator_reference_text;
            if (next.user_edited && typeof next.user_edited === 'object') {
                const nextUE = { ...next.user_edited };
                delete nextUE.narrator_reference_text;
                next.user_edited = nextUE;
            }
            return next;
        });
        showToastRef.current(
            'Reset Narrator reference transcript to default (~17s passage)',
            'info'
        );
    }, [commitVoiceEditUpdate]);

    const handleEditCharacterReferenceText = useCallback(
        (char: VoiceCastMember | string) => {
            const charName =
                typeof char === 'object' && char !== null
                    ? char.name || 'Character'
                    : String(char);
            const currentRef = getVoiceReferenceTextForCharacter(char, storyRef.current || story);
            const charKey = `cast.${charName}.reference_text`;
            openEditModal(
                `Voice Reference Transcript for ${charName} (TTS Anchor)`,
                currentRef,
                (newValue) => {
                    const cleaned = sanitizeVoiceReferenceText(String(newValue || '').trim());
                    if (!cleaned) {
                        showToastRef.current('Reference text cannot be empty', 'warning');
                        return;
                    }
                    commitVoiceEditUpdate(charName, (prev) => {
                        const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                        const baseList = hasCast
                            ? prev.cast || []
                            : Array.isArray(prev.characters)
                              ? prev.characters
                              : [];
                        const newCast = [...baseList];
                        const idx = findCastIndexForChar(newCast, char);
                        if (idx === -1) return null;
                        newCast[idx] = {
                            ...newCast[idx],
                            reference_text: cleaned,
                            user_edited_reference_text: true,
                            is_user_edited: true,
                            user_edited: true
                        };
                        return {
                            ...prev,
                            cast: newCast,
                            ...(hasCast ? {} : { characters: newCast }),
                            user_edited: {
                                ...(prev.user_edited || {}),
                                [charKey]: true,
                                [`cast.${idx}.reference_text`]: true,
                                [`cast.${charName}`]: true
                            }
                        };
                    });
                    showToastRef.current(
                        `Updated voice reference transcript for ${charName}`,
                        'success'
                    );
                },
                charKey
            );
        },
        [story, storyRef, openEditModal, commitVoiceEditUpdate]
    );

    const handleResetCharacterReferenceText = useCallback(
        (char: VoiceCastMember | string) => {
            const charName =
                typeof char === 'object' && char !== null
                    ? char.name || 'Character'
                    : String(char);
            let hasExtractedInterview = false;
            commitVoiceEditUpdate(charName, (prev) => {
                const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                const baseList = hasCast
                    ? prev.cast || []
                    : Array.isArray(prev.characters)
                      ? prev.characters
                      : [];
                const newCast = [...baseList];
                const idx = findCastIndexForChar(newCast, char);
                if (idx === -1) return null;
                const target = { ...newCast[idx] };
                const targetRec = target as Record<string, unknown>;
                const detailsRec = target.details as Record<string, unknown> | undefined;
                const interviewSrc = String(
                    detailsRec?.deep_profile ||
                        targetRec.interview_psychology ||
                        targetRec.deep_profile ||
                        targetRec.canonical_interview_voice ||
                        ''
                );
                const autoExtracted = extractPersonalizedReferenceTextFromInterview(interviewSrc);
                hasExtractedInterview = Boolean(autoExtracted);
                if (autoExtracted) {
                    target.reference_text = autoExtracted;
                } else {
                    delete target.reference_text;
                }
                target.user_edited_reference_text = false;
                newCast[idx] = target;
                const nextUserEdited = { ...(prev.user_edited || {}) };
                delete nextUserEdited[`cast.${charName}.reference_text`];
                delete nextUserEdited[`cast.${idx}.reference_text`];
                return {
                    ...prev,
                    cast: newCast,
                    ...(hasCast ? {} : { characters: newCast }),
                    user_edited: nextUserEdited
                };
            });
            showToastRef.current(
                hasExtractedInterview
                    ? `Reset ${charName}'s reference transcript to interview excerpt`
                    : `Reset ${charName}'s reference transcript to default (~17s passage)`,
                'info'
            );
        },
        [commitVoiceEditUpdate]
    );

    const handleResetAllVoiceAndAudioCaches = useCallback(() => {
        const activeStory = storyRef.current || story;
        const rawStoryId = String(activeStory?.id || activeStory?.title || 'story');
        const cleanStoryId = rawStoryId.replace(/[^a-zA-Z0-9_-]/g, '_');
        void requestConfirm({
            title: 'Reset All Voice & Audio Caches?',
            message:
                'This clears all calibrated Master Voice WAVs on the Audio Studio Bridge, cached voice metadata, Studio segment renders, and saved scene/sequence MP3s for the active story. Next audition or render will calibrate fresh voices.',
            confirmLabel: 'Reset All Audio Caches',
            danger: true,
            onConfirm: async () => {
                stopAllAudioPlayback();
                try {
                    const effCfg = audioDramaSettingsRef.current;
                    let bridgeUrl = String(
                        effCfg?.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
                    )
                        .trim()
                        .replace(/\/+$/, '');
                    if (bridgeUrl && !/^https?:\/\//i.test(bridgeUrl)) {
                        bridgeUrl = `http://${bridgeUrl}`;
                    }
                    const winStores = getWindowStores();
                    const activeStudioCache = winStores.studioCacheStore || studioCacheStore;
                    const activeAudioStore = winStores.audioStore || audioStore;
                    await Promise.all([
                        activeStudioCache?.clearVoicesForStory
                            ? activeStudioCache.clearVoicesForStory(cleanStoryId)
                            : Promise.resolve(),
                        rawStoryId !== cleanStoryId && activeStudioCache?.clearVoicesForStory
                            ? activeStudioCache.clearVoicesForStory(rawStoryId)
                            : Promise.resolve(),
                        activeStudioCache?.clearRendersForStory
                            ? activeStudioCache.clearRendersForStory(rawStoryId)
                            : Promise.resolve(),
                        rawStoryId !== cleanStoryId && activeStudioCache?.clearRendersForStory
                            ? activeStudioCache.clearRendersForStory(cleanStoryId)
                            : Promise.resolve(),
                        bridgeUrl
                            ? fetchWithTimeout(
                                  `${bridgeUrl}/voices/prune`,
                                  {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ deleteAll: true })
                                  },
                                  4000
                              ).catch(() => null)
                            : Promise.resolve(),
                        rawStoryId && activeAudioStore?.deleteStoryAudio
                            ? activeAudioStore.deleteStoryAudio(rawStoryId).catch(() => {})
                            : Promise.resolve()
                    ]);
                    availableSceneAudioMapRef.current = {};
                    setAvailableSceneAudioMapRef.current({});
                    setAvailableSequenceAudioMapRef.current({});
                    const base = storyRef.current || story;
                    if (base && typeof base === 'object') {
                        const bumped: AudioStoryRecord = {
                            ...base,
                            audio_cast_updated_at: Date.now()
                        };
                        storyRef.current = bumped;
                        setStory(bumped);
                        if (bumped.id && typeof storyStore?.saveStory === 'function') {
                            storyStore.saveStory(bumped.id, bumped).catch(() => {});
                        }
                    }
                    showToastRef.current(
                        'Cleared all Master Voices, Studio renders, and saved scene audio for this story.',
                        'success'
                    );
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    showToastRef.current(
                        `Failed clearing all voice/audio caches: ${message}`,
                        'error'
                    );
                }
            }
        });
    }, [
        story,
        storyRef,
        setStory,
        requestConfirm,
        stopAllAudioPlayback,
        availableSceneAudioMapRef,
        setAvailableSceneAudioMapRef,
        setAvailableSequenceAudioMapRef
    ]);

    return {
        audioDramaSettings,
        setAudioDramaSettings,
        audioDramaSettingsRef,
        sessionTtsTierCapRef,
        ttsProbeCacheRef,
        updateAudioDramaSetting,
        isAuditioningVoice,
        setIsAuditioningVoice,
        auditioningTarget,
        setAuditioningTarget,
        collectSpeakerAliases,
        invalidateSpeakerVoiceCache,
        commitVoiceEditUpdate,
        stopAuditionPlayback,
        stopAllAudioPlayback,
        testAuditionCharacterVoice,
        handleRerollCharacterSeed,
        handleRerollNarratorSeed,
        handleEditNarratorVoiceProfile,
        handleEditNarratorSeed,
        handleEditCharacterVoiceProfile,
        handleEditCharacterSeed,
        handleEditNarratorReferenceText,
        handleResetNarratorReferenceText,
        handleEditCharacterReferenceText,
        handleResetCharacterReferenceText,
        handleResetAllVoiceAndAudioCaches
    };
}
