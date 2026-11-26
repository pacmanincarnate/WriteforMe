/**
 * @module hooks/useTtsPlayback
 * Unified 4-tier streaming TTS engine controller (System Voice -> Kokoro Web Worker ->
 * Breeze 2 -> Fish Drama-3), stored offline MP3 synchronized timeline player, lookahead
 * buffering, automatic tier fallback, and scene-to-scene continuous playback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_SERVICE_URLS,
    DEFAULT_TTS_MODELS,
    KOKORO_VOICES,
    SILENT_WAV_DATA_URI,
    STORAGE_KEYS,
    TTS_PIPELINE_TIERS,
    type AudioDramaSettings,
    type ReaderSettings
} from '@/config';
import {
    buildEstimatedCueTimeline,
    chunkAudioDramaTurns,
    chunkNovelProseForDrama3,
    chunkProseForTts,
    getDeterministicVoiceSeed,
    getHumanReadableTtsError,
    parseAudioDramaScript,
    type HumanReadableTtsError
} from '@/domain/audio';
import {
    clearKokoroModelCache,
    createKokoroWorker,
    ensureAudioDramaVoicesRegistered,
    synthesizeAudioDramaChunk,
    type KokoroWorkerHandle
} from '@/services/audio';
import { getBestTtsDevice, getDeviceCapabilityTier, isMobileDevice } from '@/services/browser';
import { audioStore, type AudioStore, type SceneAudioMeta } from '@/services/storage';
import type { SceneAudioFreshnessResult } from './useAudioProduction';
import type { FlatReaderSceneItem } from './useReaderController';
import type {
    AudioStoryRecord,
    SharedTtsQueueItem,
    ToastOptionsLike,
    TtsProbeCacheEntry
} from './useVoiceManagement';

export interface TtsPlayingSceneLocation {
    seqIdx: number;
    sceneIdx: number;
}

export interface TtsResolvedSourceMeta {
    mode: 'live' | 'stored';
    tier: number | null;
    backend: string;
    engineLabel: string;
    sceneKey: string;
}

export interface ResolvedLiveTtsTierInfo {
    tier: number;
    backend: string;
    engineLabel: string;
    demotedFrom: number | null;
    demotedFromLabel: string | null;
}

export interface PlaySceneAudioOptions {
    autoplay?: boolean;
    follow?: boolean;
    isAutoAdvance?: boolean;
    prevSourceMode?: string | null;
    enterReader?: boolean;
}

export interface StartTtsSceneOverride {
    seqIdx?: number;
    sceneIdx?: number;
    resolvedTierInfo?: ResolvedLiveTtsTierInfo;
    isAutoAdvance?: boolean;
    prevSourceMode?: string | null;
    suppressDemoteToast?: boolean;
}

export interface UseTtsPlaybackParams {
    story: AudioStoryRecord | null | undefined;
    storyRef: MutableRefObject<AudioStoryRecord | null>;
    setStory: Dispatch<SetStateAction<AudioStoryRecord | null>>;
    selectedSequence: number | null;
    selectedScene: number | null;
    viewRef: MutableRefObject<string>;
    getLlmKeys: () => { apiKey: string; openRouterKey: string };
    showToast: (
        message: string,
        variant?: 'success' | 'error' | 'info' | 'warning',
        options?: ToastOptionsLike | null
    ) => void;
    readerSettings: ReaderSettings;
    readerSettingsRef: MutableRefObject<ReaderSettings>;
    updateReaderSetting: <K extends keyof ReaderSettings>(
        key: K,
        val: ReaderSettings[K]
    ) => void;
    flatStoryScenesRef: MutableRefObject<FlatReaderSceneItem[]>;
    visibleScrollSceneRef: MutableRefObject<{ seqIdx: number; sceneIdx: number } | null>;
    jumpToReaderScene: (
        seqIdx: number,
        sceneIdx: number,
        direction?: 'next' | 'prev',
        bypassFollowBreak?: boolean
    ) => void;
    enterReaderMode: (seqIdx?: number | null, sceneIdx?: number | null) => void;
    audioDramaSettings: AudioDramaSettings;
    audioDramaSettingsRef: MutableRefObject<AudioDramaSettings>;
    sessionTtsTierCapRef: MutableRefObject<number | null>;
    ttsProbeCacheRef: MutableRefObject<TtsProbeCacheEntry | null>;
    isAuditioningVoice: boolean;
    stopAuditionPlayback: () => void;
    availableSceneAudioMapRef: MutableRefObject<Record<string, SceneAudioMeta>>;
    getSceneProseText: (
        storyObj: AudioStoryRecord | null | undefined,
        seqIdx: number,
        sceneIdx: number
    ) => string;
    isStoredSceneAudioFresh: (
        metaOrRecord:
            | { textHash?: string; voiceSigHash?: string; updatedAt?: number }
            | null
            | undefined,
        proseText: string,
        storyObj?: AudioStoryRecord | null,
        settingsObj?: AudioDramaSettings
    ) => SceneAudioFreshnessResult;
    ttsStatusRef: MutableRefObject<string>;
    ttsPlayingSceneRef: MutableRefObject<TtsPlayingSceneLocation | null>;
    setIsFollowingAudio: Dispatch<SetStateAction<boolean>>;
    isFollowingAudioRef: MutableRefObject<boolean>;
    ttsQueueRef: MutableRefObject<SharedTtsQueueItem[]>;
    ttsWorkerRef: MutableRefObject<KokoroWorkerHandle | null>;
    ttsAudioRef: MutableRefObject<HTMLAudioElement | null>;
}

export interface UseTtsPlaybackResult {
    ttsStatus: string;
    setTtsStatus: Dispatch<SetStateAction<string>>;
    isTtsBusyOrPlaying: boolean;
    isAnyAudioPlaying: boolean;
    ttsProgress: number;
    ttsStatusMessage: string;
    ttsActiveDevice: string | null;
    ttsError: string | HumanReadableTtsError | null;
    setTtsError: Dispatch<SetStateAction<string | HumanReadableTtsError | null>>;
    setTtsCurrentTime: Dispatch<SetStateAction<number>>;
    requestChunkAudio: (
        chunkIdx: number,
        directQueue?: SharedTtsQueueItem[] | null,
        forceAutoPlay?: boolean
    ) => void;
    ttsIsMiniPlayerVisible: boolean;
    setTtsIsMiniPlayerVisible: Dispatch<SetStateAction<boolean>>;
    ttsQueue: SharedTtsQueueItem[];
    setTtsQueueAndRef: (
        valOrFn: SharedTtsQueueItem[] | ((prev: SharedTtsQueueItem[]) => SharedTtsQueueItem[])
    ) => void;
    ttsCurrentChunkIndex: number;
    ttsCurrentTime: number;
    ttsDuration: number;
    ttsGeneratingElapsedSec: number;
    audioDramaActiveSpeaker: string | null;
    audioDramaActiveEmotion: string | null;
    isAudioDramaModeActive: boolean;
    audioPlaybackScope: string;
    setAudioPlaybackScope: Dispatch<SetStateAction<string>>;
    isPlayingMasterSceneMp3: boolean;
    ttsPlayingScene: TtsPlayingSceneLocation | null;
    ttsResolvedSource: TtsResolvedSourceMeta | null;
    getOrCreateTtsWorker: () => KokoroWorkerHandle | null;
    initTtsEngine: (forceDevice?: string | null) => Promise<boolean>;
    startTtsFromProse: (
        proseText: string | Record<string, unknown>,
        startChunkIdx?: number,
        sceneOverride?: StartTtsSceneOverride | null
    ) => Promise<void>;
    toggleTtsPlayPause: (proseOverride?: string | null) => void;
    stopTtsPlayback: () => void;
    skipTtsChunk: (delta: number) => void;
    changeTtsVoice: (newVoiceId: string) => void;
    playSceneAudio: (
        targetSeq?: number | null,
        targetScene?: number | null,
        opts?: PlaySceneAudioOptions
    ) => Promise<void>;
    skipAudioScene: (delta: number) => void;
    playStoredOrLiveSceneAudio: (
        targetSeq?: number | null,
        targetScene?: number | null,
        scopeOrOpts?: PlaySceneAudioOptions | null
    ) => Promise<void>;
}

interface TtsWindowGlobals {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
    _ellipsisAudioCtx?: AudioContext;
    _ellipsisAudioUnlocked?: boolean;
    _ellipsisKokoroModelReady?: boolean;
    _ellipsisKokoroInitializing?: boolean;
    _ellipsisTtsPlaybackRate?: number;
    _ellipsisTtsMobileWarned?: boolean;
    _ellipsisGetOrCreateTtsWorker?: () => KokoroWorkerHandle | null;
    _ellipsisInitTtsEngine?: (forceDevice?: string | null) => Promise<boolean>;
    chunkNovelProseForDrama3?: typeof chunkNovelProseForDrama3;
    buildEstimatedCueTimeline?: typeof buildEstimatedCueTimeline;
    audioStore?: AudioStore;
}

const getTtsWindow = (): TtsWindowGlobals =>
    typeof window !== 'undefined' ? (window as unknown as TtsWindowGlobals) : {};

/** Manages live streaming multi-tier TTS and offline master MP3 scene playback. */
export function useTtsPlayback(params: UseTtsPlaybackParams): UseTtsPlaybackResult {
    const {
        story,
        storyRef,
        setStory,
        selectedSequence,
        selectedScene,
        viewRef,
        getLlmKeys,
        showToast,
        readerSettingsRef,
        updateReaderSetting,
        flatStoryScenesRef,
        visibleScrollSceneRef,
        jumpToReaderScene,
        enterReaderMode,
        audioDramaSettings,
        audioDramaSettingsRef,
        sessionTtsTierCapRef,
        ttsProbeCacheRef,
        isAuditioningVoice,
        stopAuditionPlayback,
        availableSceneAudioMapRef,
        getSceneProseText,
        isStoredSceneAudioFresh,
        ttsStatusRef,
        ttsPlayingSceneRef,
        setIsFollowingAudio,
        isFollowingAudioRef,
        ttsQueueRef,
        ttsWorkerRef,
        ttsAudioRef
    } = params;

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const getLlmKeysRef = useRef(getLlmKeys);
    getLlmKeysRef.current = getLlmKeys;

    const [audioDramaActiveSpeaker, setAudioDramaActiveSpeaker] = useState<string | null>(null);
    const [audioDramaActiveEmotion, setAudioDramaActiveEmotion] = useState<string | null>(null);
    const [isAudioDramaModeActive, setIsAudioDramaModeActive] = useState(false);

    const [audioPlaybackScope, setAudioPlaybackScope] = useState('story');
    const audioPlaybackScopeRef = useRef('story');
    useEffect(() => {
        audioPlaybackScopeRef.current = audioPlaybackScope;
    }, [audioPlaybackScope]);

    const [isPlayingMasterSceneMp3, setIsPlayingMasterSceneMp3] = useState(false);
    const isPlayingMasterSceneMp3Ref = useRef(false);
    useEffect(() => {
        isPlayingMasterSceneMp3Ref.current = isPlayingMasterSceneMp3;
    }, [isPlayingMasterSceneMp3]);
    const currentMasterAudioBlobUrlRef = useRef<string | null>(null);

    const [ttsPlayingScene, setTtsPlayingScene] = useState<TtsPlayingSceneLocation | null>(null);
    const [ttsResolvedSource, setTtsResolvedSource] = useState<TtsResolvedSourceMeta | null>(null);
    const ttsResolvedSourceRef = useRef<TtsResolvedSourceMeta | null>(null);

    const [ttsStatus, setTtsStatus] = useState('idle');
    const isTtsBusyOrPlaying =
        ttsStatus === 'playing' ||
        ttsStatus === 'generating' ||
        ttsStatus === 'loading-library' ||
        ttsStatus === 'loading-model' ||
        ttsStatus === 'initializing-hardware';
    const isAnyAudioPlaying = isTtsBusyOrPlaying || isAuditioningVoice;

    const [ttsProgress, setTtsProgress] = useState(0);
    const [ttsStatusMessage, setTtsStatusMessage] = useState('');
    const [ttsActiveDevice, setTtsActiveDevice] = useState<string | null>(null);
    const [ttsError, setTtsError] = useState<string | HumanReadableTtsError | null>(null);
    const [ttsIsMiniPlayerVisible, setTtsIsMiniPlayerVisible] = useState(false);
    const [ttsQueue, setTtsQueue] = useState<SharedTtsQueueItem[]>([]);
    const [ttsCurrentChunkIndex, setTtsCurrentChunkIndex] = useState(0);
    const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
    const [ttsDuration, setTtsDuration] = useState(0);
    const [ttsGeneratingElapsedSec, setTtsGeneratingElapsedSec] = useState(0);

    const ttsCurrentChunkIndexRef = useRef(0);
    const isAudioDramaModeActiveRef = useRef(false);
    const ttsPendingRequestsRef = useRef(new Set<number>());
    const ttsAbortControllersRef = useRef(new Map<number, AbortController>());
    const ttsSessionIdRef = useRef(0);
    const ttsAutoPlayNextRef = useRef(false);
    const ttsWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ttsAwaitedChunkRef = useRef<number | null>(null);
    const ttsCadenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        ttsCurrentChunkIndexRef.current = ttsCurrentChunkIndex;
    }, [ttsCurrentChunkIndex]);
    useEffect(() => {
        ttsStatusRef.current = ttsStatus;
    }, [ttsStatus, ttsStatusRef]);
    useEffect(() => {
        isAudioDramaModeActiveRef.current = isAudioDramaModeActive;
    }, [isAudioDramaModeActive]);

    useEffect(() => {
        if (ttsStatus !== 'generating') {
            setTtsGeneratingElapsedSec(0);
            return;
        }
        setTtsGeneratingElapsedSec(0);
        const interval = setInterval(() => {
            setTtsGeneratingElapsedSec((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [ttsStatus, ttsCurrentChunkIndex]);

    const setTtsQueueAndRef = useCallback(
        (
            valOrFn:
                | SharedTtsQueueItem[]
                | ((prev: SharedTtsQueueItem[]) => SharedTtsQueueItem[])
        ) => {
            const next =
                typeof valOrFn === 'function' ? valOrFn(ttsQueueRef.current) : valOrFn;
            ttsQueueRef.current = next;
            setTtsQueue(next);
        },
        [ttsQueueRef]
    );
    const setTtsCurrentChunkIndexAndRef = useCallback((val: number) => {
        ttsCurrentChunkIndexRef.current = val;
        setTtsCurrentChunkIndex(val);
    }, []);
    const setTtsStatusAndRef = useCallback(
        (val: string) => {
            ttsStatusRef.current = val;
            setTtsStatus(val);
        },
        [ttsStatusRef]
    );
    const setIsAudioDramaModeActiveAndRef = useCallback((val: boolean) => {
        isAudioDramaModeActiveRef.current = val;
        setIsAudioDramaModeActive(val);
    }, []);

    const abortPendingTtsRequests = useCallback(
        (keepChunkIdx: number | null = null) => {
            const abortedIndices: number[] = [];
            ttsAbortControllersRef.current.forEach((ctrl, idx) => {
                if (keepChunkIdx !== null && idx === keepChunkIdx) return;
                try {
                    ctrl.abort();
                } catch {
                    // Ignore abort failures
                }
                ttsAbortControllersRef.current.delete(idx);
                ttsPendingRequestsRef.current.delete(idx);
                abortedIndices.push(idx);
            });
            ttsPendingRequestsRef.current.forEach((idx) => {
                if (keepChunkIdx !== null && idx === keepChunkIdx) return;
                ttsPendingRequestsRef.current.delete(idx);
                abortedIndices.push(idx);
            });
            if (
                abortedIndices.length > 0 &&
                Array.isArray(ttsQueueRef.current) &&
                ttsQueueRef.current.length > 0
            ) {
                setTtsQueueAndRef((prev) =>
                    prev.map((c, idx) =>
                        abortedIndices.includes(idx) && !c.audioUrl ? { ...c, status: 'idle' } : c
                    )
                );
            }
        },
        [ttsQueueRef, setTtsQueueAndRef]
    );

    const unlockBrowserAudioElement = useCallback(() => {
        const win = getTtsWindow();
        try {
            const Ctor = win.AudioContext || win.webkitAudioContext;
            if (Ctor) {
                if (!win._ellipsisAudioCtx) {
                    win._ellipsisAudioCtx = new Ctor();
                }
                if (win._ellipsisAudioCtx.state === 'suspended') {
                    win._ellipsisAudioCtx.resume().catch(() => {});
                }
            }
        } catch {
            // Ignore AudioContext unlock issues
        }

        try {
            if (!ttsAudioRef.current) {
                const primedAudio = new Audio();
                primedAudio.preload = 'auto';
                ttsAudioRef.current = primedAudio;
            }
            if (
                !win._ellipsisAudioUnlocked &&
                (!ttsAudioRef.current.src || ttsAudioRef.current.src === SILENT_WAV_DATA_URI) &&
                !isPlayingMasterSceneMp3Ref.current
            ) {
                ttsAudioRef.current.loop = true;
                ttsAudioRef.current.src = SILENT_WAV_DATA_URI;
                const p = ttsAudioRef.current.play();
                if (p && typeof p.then === 'function') {
                    p.then(() => {
                        win._ellipsisAudioUnlocked = true;
                    }).catch(() => {});
                }
            }
        } catch {
            // Ignore HTMLAudio unlock issues
        }
    }, [ttsAudioRef]);

    const clearTtsWatchdog = useCallback((resolvedIdx: number | null = null) => {
        if (resolvedIdx === null || resolvedIdx === ttsAwaitedChunkRef.current) {
            if (ttsWatchdogRef.current) {
                clearTimeout(ttsWatchdogRef.current);
                ttsWatchdogRef.current = null;
            }
            ttsAwaitedChunkRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            abortPendingTtsRequests();
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                } catch {
                    // Ignore speechSynthesis cancel failure
                }
            }
            if (ttsCadenceTimerRef.current) {
                clearTimeout(ttsCadenceTimerRef.current);
                ttsCadenceTimerRef.current = null;
            }
            if (ttsWatchdogRef.current) {
                clearTimeout(ttsWatchdogRef.current);
                ttsWatchdogRef.current = null;
            }
            if (currentMasterAudioBlobUrlRef.current) {
                try {
                    URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
                } catch {
                    // Ignore revoke error
                }
                currentMasterAudioBlobUrlRef.current = null;
            }
            setIsPlayingMasterSceneMp3(false);
            isPlayingMasterSceneMp3Ref.current = false;
            if (ttsAudioRef.current) {
                ttsAudioRef.current.pause();
                ttsAudioRef.current = null;
            }
            if (ttsQueueRef.current) {
                ttsQueueRef.current.forEach((c) => {
                    if (c.audioUrl) {
                        try {
                            URL.revokeObjectURL(c.audioUrl);
                        } catch {
                            // Ignore revoke error
                        }
                    }
                });
            }
            if (ttsWorkerRef.current) {
                if (ttsWorkerRef.current._blobUrl) {
                    try {
                        URL.revokeObjectURL(ttsWorkerRef.current._blobUrl);
                    } catch {
                        // Ignore revoke error
                    }
                }
                ttsWorkerRef.current.terminate();
                ttsWorkerRef.current = null;
            }
        };
    }, [abortPendingTtsRequests, ttsAudioRef, ttsQueueRef, ttsWorkerRef]);

    // Late-bound circular call refs between queue playback, worker, watchdog, and scene advancement
    const changeTtsVoiceFnRef = useRef<(voiceId: string) => void>(() => {});
    const speakChunkWithSpeechSynthesisFnRef = useRef<(chunkIdx: number) => void>(() => {});
    const requestChunkAudioFnRef = useRef<
        (
            chunkIdx: number,
            directQueue?: SharedTtsQueueItem[] | null,
            forceAutoPlay?: boolean
        ) => void
    >(() => {});
    const primeLookaheadBufferFnRef = useRef<
        (centerIdx: number, directQueue?: SharedTtsQueueItem[] | null) => void
    >(() => {});
    const playAudioChunkFnRef = useRef<(chunkIdx: number, directUrl?: string | null) => void>(
        () => {}
    );
    const playSceneAudioFnRef = useRef<
        (
            targetSeq?: number | null,
            targetScene?: number | null,
            opts?: PlaySceneAudioOptions
        ) => Promise<void>
    >(async () => {});
    const advanceToNextAudioSceneFnRef = useRef<
        (fromSeq: number, fromScene: number, prevSourceMode?: string | null) => void
    >(() => {});

    const startTtsWatchdog = (awaitedIdx: number) => {
        if (ttsWatchdogRef.current) {
            clearTimeout(ttsWatchdogRef.current);
            ttsWatchdogRef.current = null;
        }
        ttsAwaitedChunkRef.current = awaitedIdx;
        const awaitedChunk = ttsQueueRef.current && ttsQueueRef.current[awaitedIdx];
        const curBackend: string = audioDramaSettingsRef.current?.backend || 'hybrid';
        const isLocalHybridOrStudio =
            isAudioDramaModeActiveRef.current &&
            (curBackend === 'hybrid' || curBackend === 'audiocpp');
        const isMultiTurnSeg =
            awaitedChunk?.engine === 'drama3_multi' ||
            (Array.isArray(awaitedChunk?.turns) && awaitedChunk.turns.length > 1);
        const timeoutMs = isMobileDevice()
            ? isMultiTurnSeg
                ? 120000
                : 25000
            : isLocalHybridOrStudio
              ? 600000
              : curBackend === 'breeze' || isMultiTurnSeg
                ? 180000
                : 45000;

        if (isMobileDevice()) {
            setTimeout(() => {
                if (
                    ttsStatusRef.current === 'generating' &&
                    ttsCurrentChunkIndexRef.current === awaitedIdx
                ) {
                    setTtsStatusMessage(
                        'Neural synthesis in progress \u2014 this can take 10-20s on mobile...'
                    );
                }
            }, 8000);
        }

        ttsWatchdogRef.current = setTimeout(() => {
            if (
                ttsStatusRef.current === 'generating' &&
                ttsCurrentChunkIndexRef.current === awaitedIdx
            ) {
                if (
                    isAudioDramaModeActiveRef.current &&
                    curBackend !== 'browser' &&
                    curBackend !== 'kokoro'
                ) {
                    console.error(
                        `Audio Drama backend timeout on chunk ${awaitedIdx} (${curBackend})`
                    );
                    const ctrl = ttsAbortControllersRef.current.get(awaitedIdx);
                    if (ctrl) {
                        try {
                            ctrl.abort();
                        } catch {
                            // Ignore abort failures
                        }
                        ttsAbortControllersRef.current.delete(awaitedIdx);
                    }
                    ttsPendingRequestsRef.current.delete(awaitedIdx);
                    setTtsQueueAndRef((prev) => {
                        const nextQ = [...prev];
                        if (nextQ[awaitedIdx]) {
                            nextQ[awaitedIdx] = { ...nextQ[awaitedIdx], status: 'error' };
                        }
                        return nextQ;
                    });
                    setTtsStatusAndRef('error');
                    setTtsError(
                        `Audio Drama synthesis timed out for ${(audioDramaSettingsRef.current?.backend || 'audiocpp').toUpperCase()}. Verify your backend server or API connection.`
                    );
                    return;
                }

                if (ttsWorkerRef.current) {
                    const pingTimeout = setTimeout(() => {
                        console.error(
                            `TTS Generation watchdog timeout on chunk ${awaitedIdx} (device: ${isMobileDevice() ? 'mobile' : 'desktop'})`
                        );

                        if (ttsWorkerRef.current) {
                            try {
                                ttsWorkerRef.current.terminate();
                            } catch {
                                // Ignore terminate failure
                            }
                            ttsWorkerRef.current = null;
                        }

                        ttsPendingRequestsRef.current.delete(awaitedIdx);
                        setTtsQueueAndRef((prev) => {
                            const nextQ = [...prev];
                            if (nextQ[awaitedIdx]) {
                                nextQ[awaitedIdx] = { ...nextQ[awaitedIdx], status: 'error' };
                            }
                            return nextQ;
                        });

                        if (isMobileDevice() && readerSettingsRef.current.ttsVoice !== 'system_native') {
                            changeTtsVoiceFnRef.current('system_native');
                            setTtsError('Switched to System Voice (neural engine unavailable on this device)');
                            setTtsStatusAndRef('error');
                            if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[awaitedIdx]) {
                                speakChunkWithSpeechSynthesisFnRef.current(awaitedIdx);
                            } else {
                                setTtsIsMiniPlayerVisible(false);
                            }
                        } else {
                            setTtsStatusAndRef('error');
                            const msg = isMobileDevice()
                                ? "Neural speech generation timed out on mobile. Tap 'Switch to System Voice' for instant playback."
                                : 'Audio generation timed out. Your device may be low on memory.';
                            setTtsError(msg);
                        }
                    }, 3000);

                    const onPong = (e: MessageEvent<{ type?: string }>) => {
                        if (e.data?.type === 'pong') {
                            clearTimeout(pingTimeout);
                            startTtsWatchdog(awaitedIdx);
                        }
                    };
                    ttsWorkerRef.current.addEventListener('message', onPong, { once: true });
                    ttsWorkerRef.current.postMessage({ type: 'ping' });
                }
            }
        }, timeoutMs);
    };

    const speakChunkWithSpeechSynthesis = (chunkIdx: number) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            setTtsStatusAndRef('error');
            setTtsError('System speech synthesis is not supported on this browser.');
            return;
        }
        const win = getTtsWindow();
        const mySessionId = ttsSessionIdRef.current;
        try {
            window.speechSynthesis.cancel();
        } catch {
            // Ignore cancel failure
        }

        const q = ttsQueueRef.current;
        const chunk = q && q[chunkIdx];
        if (!chunk || !chunk.text) {
            setTtsStatusAndRef('ready');
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk.text);
        const activeSpeed =
            readerSettingsRef.current?.ttsSpeed || win._ellipsisTtsPlaybackRate || 1.0;
        utterance.rate = Math.max(0.5, Math.min(2.0, Number(activeSpeed) || 1.0));

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
                if (pref) utterance.voice = pref;
            }
        } catch {
            // Ignore voice lookup issues
        }

        utterance.onstart = () => {
            if (mySessionId !== ttsSessionIdRef.current) return;
            setTtsStatusAndRef('playing');
            setTtsError(null);
            setTtsCurrentChunkIndexAndRef(chunkIdx);
            setAudioDramaActiveSpeaker(chunk.speaker || null);
            setAudioDramaActiveEmotion(chunk.emotion || null);
            setTtsCurrentTime(0);
            setTtsDuration(Math.max(1, Math.round(String(chunk.text || '').length / 15)));
        };

        utterance.onend = () => {
            if (mySessionId !== ttsSessionIdRef.current) return;
            const nextIdx = chunkIdx + 1;
            if (nextIdx < ttsQueueRef.current.length) {
                setTtsCurrentChunkIndexAndRef(nextIdx);
                speakChunkWithSpeechSynthesisFnRef.current(nextIdx);
            } else {
                const activeSc = ttsPlayingSceneRef.current;
                advanceToNextAudioSceneFnRef.current(
                    activeSc ? activeSc.seqIdx : (selectedSequence ?? 0),
                    activeSc ? activeSc.sceneIdx : (selectedScene ?? 0),
                    'live'
                );
            }
        };

        utterance.onerror = (uErr) => {
            if (mySessionId !== ttsSessionIdRef.current) return;
            if (uErr.error === 'interrupted' || uErr.error === 'canceled') return;
            console.error('SpeechSynthesis utterance error:', uErr);
            setTtsStatusAndRef('error');
            setTtsError(`System speech error: ${uErr.error || 'unknown'}`);
        };

        window.speechSynthesis.speak(utterance);
    };
    speakChunkWithSpeechSynthesisFnRef.current = speakChunkWithSpeechSynthesis;

    const getOrCreateTtsWorker = useCallback((): KokoroWorkerHandle | null => {
        if (ttsWorkerRef.current) return ttsWorkerRef.current;
        const win = getTtsWindow();
        try {
            const worker = createKokoroWorker();
            worker.onmessage = (
                e: MessageEvent<{
                    id?: string;
                    type?: string;
                    payload?: { chunkIndex: number; wavBuffer: ArrayBuffer };
                    error?: string;
                    status?: string;
                    progress?: number;
                    message?: string;
                    device?: string;
                }>
            ) => {
                if (e.data?.id && String(e.data.id).startsWith('ad_')) return;

                const { type, payload, error, status, progress, message, device } = e.data || {};
                if (type === 'status') {
                    if (status) setTtsStatusAndRef(status);
                    if (typeof progress === 'number') setTtsProgress(progress);
                    if (message) setTtsStatusMessage(message);
                } else if (type === 'progress') {
                    if (typeof progress === 'number') setTtsProgress(progress);
                    if (message) setTtsStatusMessage(message);
                } else if (type === 'pong') {
                    // Worker responded to health check ping
                } else if (type === 'ready') {
                    win._ellipsisKokoroModelReady = true;
                    win._ellipsisKokoroInitializing = false;
                    setTtsProgress(100);
                    setTtsActiveDevice(device || 'wasm');
                    setTtsStatusMessage(
                        message || `Kokoro TTS ready (${(device || 'wasm').toUpperCase()})`
                    );
                    setTtsError(null);
                    if (ttsAutoPlayNextRef.current) {
                        setTtsStatusAndRef('generating');
                        setTtsStatusMessage('Synthesizing audio...');
                        const idx = ttsCurrentChunkIndexRef.current;
                        requestChunkAudioFnRef.current(idx);
                        primeLookaheadBufferFnRef.current(idx);
                    } else {
                        setTtsStatusAndRef('ready');
                    }
                } else if (type === 'chunk_audio' && payload) {
                    const { chunkIndex, wavBuffer } = payload;
                    clearTtsWatchdog(chunkIndex);
                    ttsPendingRequestsRef.current.delete(chunkIndex);
                    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(blob);

                    setTtsQueueAndRef((prev) => {
                        const nextQ = [...prev];
                        if (nextQ[chunkIndex]) {
                            nextQ[chunkIndex] = {
                                ...nextQ[chunkIndex],
                                audioUrl,
                                blob,
                                status: 'ready'
                            };
                        }
                        return nextQ;
                    });

                    if (
                        chunkIndex === ttsCurrentChunkIndexRef.current &&
                        (ttsStatusRef.current === 'generating' || ttsAutoPlayNextRef.current) &&
                        !ttsCadenceTimerRef.current
                    ) {
                        ttsAutoPlayNextRef.current = false;
                        playAudioChunkFnRef.current(chunkIndex, audioUrl);
                    }
                } else if (type === 'error') {
                    win._ellipsisKokoroInitializing = false;
                    clearTtsWatchdog();
                    console.error('Kokoro TTS Worker error:', error);
                    const fallbackIdx = ttsCurrentChunkIndexRef.current;
                    if (
                        isMobileDevice() &&
                        readerSettingsRef.current.ttsVoice !== 'system_native'
                    ) {
                        changeTtsVoiceFnRef.current('system_native');
                        setTtsError(
                            'Switched to System Voice (neural engine unavailable on this device)'
                        );
                        setTtsStatusAndRef('error');
                        if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[fallbackIdx]) {
                            speakChunkWithSpeechSynthesisFnRef.current(fallbackIdx);
                        } else {
                            setTtsIsMiniPlayerVisible(false);
                        }
                    } else {
                        setTtsError(error || 'Kokoro TTS inference error');
                        setTtsStatusAndRef('error');
                    }
                }
            };
            worker.onerror = (wErr) => {
                win._ellipsisKokoroInitializing = false;
                clearTtsWatchdog();
                console.error('Worker lifecycle error:', wErr);
                if (isMobileDevice() && readerSettingsRef.current.ttsVoice !== 'system_native') {
                    changeTtsVoiceFnRef.current('system_native');
                    setTtsError(
                        'Switched to System Voice (neural engine unavailable on this device)'
                    );
                    setTtsStatusAndRef('error');
                    const fallbackIdx = ttsCurrentChunkIndexRef.current;
                    if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[fallbackIdx]) {
                        speakChunkWithSpeechSynthesisFnRef.current(fallbackIdx);
                    } else {
                        setTtsIsMiniPlayerVisible(false);
                    }
                } else {
                    const msg =
                        wErr && wErr.message
                            ? wErr.message
                            : 'TTS Worker error. If running directly from file://, consider using a local server (e.g. node server.js or Live Server).';
                    setTtsError(msg);
                    setTtsStatusAndRef('error');
                }
            };
            ttsWorkerRef.current = worker;
            return worker;
        } catch (err) {
            console.error('Failed to create Kokoro Worker:', err);
            const message = err instanceof Error ? err.message : 'Worker initialization failed';
            setTtsError(message);
            setTtsStatusAndRef('error');
            return null;
        }
    }, [
        clearTtsWatchdog,
        readerSettingsRef,
        setTtsQueueAndRef,
        setTtsStatusAndRef,
        ttsQueueRef,
        ttsStatusRef,
        ttsWorkerRef
    ]);

    const initTtsEngine = useCallback(
        async (forceDevice: string | null = null): Promise<boolean> => {
            if (readerSettingsRef.current.ttsVoice === 'system_native') {
                setTtsError(null);
                setTtsActiveDevice('system');
                setTtsProgress(100);
                setTtsStatusMessage('System Voice ready (Device Native)');
                setTtsStatusAndRef('ready');
                return true;
            }

            const targetDevice = forceDevice || getBestTtsDevice();
            const tier = getDeviceCapabilityTier();
            const targetDtype =
                tier === 'mobile-constrained' ? 'q4' : readerSettingsRef.current.ttsDtype || 'q8';

            if (typeof window !== 'undefined' && window.localStorage) {
                const lastDtype = window.localStorage.getItem(STORAGE_KEYS.kokoroLastDtype);
                if (lastDtype !== targetDtype) {
                    try {
                        await clearKokoroModelCache();
                    } catch {
                        // Ignore CacheStorage errors
                    }
                    window.localStorage.setItem(STORAGE_KEYS.kokoroLastDtype, targetDtype);
                }
            }

            setTtsError(null);
            setTtsStatusAndRef('loading-library');
            setTtsProgress(5);
            setTtsStatusMessage('Initializing Kokoro ML environment...');

            const worker = getOrCreateTtsWorker();
            if (!worker) return false;

            worker.postMessage({
                type: 'init',
                payload: {
                    modelId: DEFAULT_TTS_MODELS.kokoro,
                    dtype: targetDtype,
                    device: targetDevice,
                    voice: readerSettingsRef.current.ttsVoice || 'af_heart'
                }
            });
            return true;
        },
        [getOrCreateTtsWorker, readerSettingsRef, setTtsStatusAndRef]
    );

    const winBridge = getTtsWindow();
    winBridge._ellipsisGetOrCreateTtsWorker = getOrCreateTtsWorker;
    winBridge._ellipsisInitTtsEngine = initTtsEngine;

    const resolveLiveTtsTier = async (
        desiredTierOverride: number | null = null
    ): Promise<ResolvedLiveTtsTierInfo> => {
        const s = audioDramaSettingsRef.current || DEFAULT_AUDIO_DRAMA_SETTINGS;
        let tier =
            typeof desiredTierOverride === 'number'
                ? desiredTierOverride
                : typeof s.pipelineTier === 'number'
                  ? s.pipelineTier
                  : s.backend === 'system'
                    ? 0
                    : (s.backend as string) === 'kokoro' || (s.backend as string) === 'browser'
                      ? 1
                      : s.backend === 'breeze'
                        ? 2
                        : 3;

        const TIER_NAMES: Record<number, string> = {
            3: 'Drama-3',
            2: 'Breeze 2',
            1: 'Kokoro',
            0: 'Device Voice'
        };
        const desiredTier = tier;
        let demotedFrom: number | null = null;
        let demotedFromLabel: string | null = null;

        if (
            typeof sessionTtsTierCapRef.current === 'number' &&
            sessionTtsTierCapRef.current < tier
        ) {
            demotedFrom = desiredTier;
            demotedFromLabel = TIER_NAMES[desiredTier] || 'Selected Engine';
            tier = sessionTtsTierCapRef.current;
        }

        if (tier >= 2) {
            const bridgeUrl = String(
                s.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
            ).replace(/\/+$/, '');
            const isLocalhost = /:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(
                bridgeUrl
            );

            if (isMobileDevice() && isLocalhost) {
                demotedFrom = demotedFrom ?? desiredTier;
                demotedFromLabel = demotedFromLabel || TIER_NAMES[desiredTier];
                tier = 1;
                sessionTtsTierCapRef.current = 1;
            } else {
                const now = Date.now();
                let probe = ttsProbeCacheRef.current;
                if (!probe || probe.url !== bridgeUrl || now - probe.ts > 15000) {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => {
                        try {
                            ctrl.abort();
                        } catch {
                            // Ignore abort failure
                        }
                    }, 1200);
                    try {
                        const res = await fetch(`${bridgeUrl}/health`, {
                            method: 'GET',
                            signal: ctrl.signal
                        });
                        clearTimeout(timer);
                        if (res.ok) {
                            const data = (await res.json().catch(() => ({}))) as {
                                available_waves?: number[];
                            };
                            probe = {
                                url: bridgeUrl,
                                ts: Date.now(),
                                ok: true,
                                availableWaves: Array.isArray(data?.available_waves)
                                    ? data.available_waves
                                    : null
                            };
                        } else {
                            probe = {
                                url: bridgeUrl,
                                ts: Date.now(),
                                ok: false,
                                availableWaves: null
                            };
                        }
                    } catch {
                        clearTimeout(timer);
                        probe = {
                            url: bridgeUrl,
                            ts: Date.now(),
                            ok: false,
                            availableWaves: null
                        };
                    }
                    ttsProbeCacheRef.current = probe;
                }

                if (!probe.ok) {
                    demotedFrom = demotedFrom ?? desiredTier;
                    demotedFromLabel = demotedFromLabel || TIER_NAMES[desiredTier];
                    tier = 1;
                    sessionTtsTierCapRef.current = 1;
                } else if (Array.isArray(probe.availableWaves)) {
                    if (tier === 3 && !probe.availableWaves.includes(2)) {
                        demotedFrom = demotedFrom ?? 3;
                        demotedFromLabel = demotedFromLabel || 'Drama-3';
                        tier = probe.availableWaves.includes(1) ? 2 : 1;
                        sessionTtsTierCapRef.current = tier;
                    }
                    if (tier === 2 && !probe.availableWaves.includes(1)) {
                        demotedFrom = demotedFrom ?? 2;
                        demotedFromLabel = demotedFromLabel || 'Breeze 2';
                        tier = 1;
                        sessionTtsTierCapRef.current = 1;
                    }
                }
            }
        }

        if (tier === 1 && isMobileDevice() && getDeviceCapabilityTier() === 'mobile-constrained') {
            const hasOptedIn =
                typeof window !== 'undefined' &&
                window.localStorage &&
                window.localStorage.getItem(STORAGE_KEYS.kokoroOptIn) === 'true';
            if (!hasOptedIn) {
                demotedFrom = demotedFrom ?? desiredTier;
                demotedFromLabel = demotedFromLabel || TIER_NAMES[tier];
                tier = 0;
            }
        }

        const tierObj = TTS_PIPELINE_TIERS[tier]
            ? TTS_PIPELINE_TIERS[tier]
            : {
                  id:
                      tier === 0
                          ? 'system'
                          : tier === 1
                            ? 'kokoro'
                            : tier === 2
                              ? 'breeze'
                              : 'hybrid'
              };

        return {
            tier,
            backend: tierObj.id,
            engineLabel: TIER_NAMES[tier] || 'Audio Engine',
            demotedFrom,
            demotedFromLabel
        };
    };

    const updateAwaitedChunkTelemetry = (
        chunkIdx: number,
        queueArr: SharedTtsQueueItem[] | null = null
    ) => {
        const q = queueArr || ttsQueueRef.current;
        const targetChunk = q && q[chunkIdx];
        if (!targetChunk) return;
        const curBackend =
            targetChunk.resolvedBackend ||
            ttsResolvedSourceRef.current?.backend ||
            audioDramaSettingsRef.current?.backend ||
            'hybrid';
        if (
            targetChunk.speaker ||
            targetChunk.engine === 'drama3_multi' ||
            isAudioDramaModeActiveRef.current ||
            curBackend === 'hybrid' ||
            curBackend === 'breeze' ||
            curBackend === 'audiocpp'
        ) {
            const backendLabel =
                curBackend === 'hybrid' || curBackend === 'audiocpp'
                    ? 'Drama-3'
                    : curBackend === 'breeze'
                      ? 'Breeze 2'
                      : curBackend === 'kokoro' || curBackend === 'browser'
                        ? 'Kokoro'
                        : 'Device Voice';

            if (targetChunk.engine === 'drama3_multi' && Array.isArray(targetChunk.turns)) {
                const spkLabel = targetChunk.speaker || 'Narrator';
                const estSec =
                    targetChunk.estimatedDurationSec ||
                    Math.max(15, Math.round((targetChunk.wordCount || 60) / 2.1));
                const metaLabel = `~${estSec}s \u2022 ${targetChunk.turns.length} lines`;
                setAudioDramaActiveSpeaker(spkLabel);
                setAudioDramaActiveEmotion(metaLabel);
                setTtsStatusMessage(
                    `Generating Segment ${chunkIdx + 1}/${q.length} (${metaLabel}) \u2014 ${spkLabel} (${backendLabel})...`
                );
            } else {
                const spkLabel = targetChunk.speaker || null;
                setAudioDramaActiveSpeaker(spkLabel);
                setAudioDramaActiveEmotion(targetChunk.emotion || null);
                setTtsStatusMessage(
                    `Generating ${chunkIdx + 1}/${q.length}${spkLabel ? ` \u2014 ${spkLabel}` : ''} (${backendLabel})...`
                );
            }
        } else {
            setTtsStatusMessage(`Synthesizing chunk ${chunkIdx + 1} of ${q.length}...`);
        }
    };

    const requestChunkAudio = (
        chunkIdx: number,
        directQueue: SharedTtsQueueItem[] | null = null,
        forceAutoPlay = false
    ) => {
        const q = directQueue || ttsQueueRef.current;
        if (!q || !q[chunkIdx]) return;
        const targetChunk = q[chunkIdx];

        if (
            forceAutoPlay ||
            (chunkIdx === ttsCurrentChunkIndexRef.current && ttsStatusRef.current === 'error')
        ) {
            setTtsError(null);
            setTtsStatusAndRef('generating');
            ttsAutoPlayNextRef.current = true;
        }

        if (targetChunk.audioUrl && !forceAutoPlay) {
            if (
                chunkIdx === ttsCurrentChunkIndexRef.current &&
                (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                !ttsCadenceTimerRef.current
            ) {
                ttsAutoPlayNextRef.current = false;
                playAudioChunkFnRef.current(chunkIdx, targetChunk.audioUrl);
            }
            return;
        }

        if (ttsPendingRequestsRef.current.has(chunkIdx)) {
            if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                updateAwaitedChunkTelemetry(chunkIdx, q);
                startTtsWatchdog(chunkIdx);
            }
            return;
        }

        const reqSessionId = ttsSessionIdRef.current;
        const resolvedBackend =
            targetChunk.resolvedBackend ||
            ttsResolvedSourceRef.current?.backend ||
            audioDramaSettingsRef.current?.backend ||
            'hybrid';

        if (resolvedBackend === 'system') {
            speakChunkWithSpeechSynthesisFnRef.current(chunkIdx);
            return;
        }

        if (
            targetChunk.speaker ||
            isAudioDramaModeActiveRef.current ||
            resolvedBackend === 'hybrid' ||
            resolvedBackend === 'audiocpp' ||
            resolvedBackend === 'breeze'
        ) {
            const abortCtrl = new AbortController();
            ttsAbortControllersRef.current.set(chunkIdx, abortCtrl);
            ttsPendingRequestsRef.current.add(chunkIdx);

            setTtsQueueAndRef((prev) => {
                const nextQ = [...prev];
                if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'loading' };
                return nextQ;
            });

            if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                updateAwaitedChunkTelemetry(chunkIdx, q);
            }

            const activeStoryForTts = storyRef.current || story || null;
            const { apiKey, openRouterKey } = getLlmKeysRef.current();
            synthesizeAudioDramaChunk({
                chunk: targetChunk,
                chunkIndex: chunkIdx,
                totalChunks: q.length,
                backend: resolvedBackend,
                story: activeStoryForTts,
                settings: audioDramaSettingsRef.current || audioDramaSettings,
                mainApiKey: apiKey,
                mainOpenRouterKey: openRouterKey,
                kokoroWorkerRef: ttsWorkerRef,
                signal: abortCtrl.signal
            })
                .then((audioUrl) => {
                    if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) {
                        if (audioUrl) {
                            try {
                                URL.revokeObjectURL(audioUrl);
                            } catch {
                                // Ignore revoke failure
                            }
                        }
                        return;
                    }
                    clearTtsWatchdog(chunkIdx);
                    ttsAbortControllersRef.current.delete(chunkIdx);
                    ttsPendingRequestsRef.current.delete(chunkIdx);

                    setTtsQueueAndRef((prev) => {
                        const nextQ = [...prev];
                        if (nextQ[chunkIdx]) {
                            nextQ[chunkIdx] = {
                                ...nextQ[chunkIdx],
                                status: 'ready',
                                audioUrl
                            };
                        }
                        return nextQ;
                    });

                    if (
                        chunkIdx === ttsCurrentChunkIndexRef.current &&
                        (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                        !ttsCadenceTimerRef.current
                    ) {
                        ttsAutoPlayNextRef.current = false;
                        playAudioChunkFnRef.current(chunkIdx, audioUrl);
                    }
                })
                .catch(async (err) => {
                    const errName =
                        err && typeof err === 'object' ? (err as { name?: string }).name : undefined;
                    const errMsg = err instanceof Error ? err.message : String(err || '');
                    if (
                        reqSessionId !== ttsSessionIdRef.current ||
                        abortCtrl.signal.aborted ||
                        errName === 'AbortError' ||
                        /aborted/i.test(errMsg)
                    ) {
                        ttsAbortControllersRef.current.delete(chunkIdx);
                        ttsPendingRequestsRef.current.delete(chunkIdx);
                        return;
                    }
                    const curBackend = resolvedBackend;
                    console.warn(`[Audio TTS] ${curBackend} failed on chunk ${chunkIdx}:`, errMsg);

                    const BACKEND_TO_TIER: Record<string, number> = {
                        hybrid: 3,
                        audiocpp: 3,
                        breeze: 2,
                        kokoro: 1,
                        browser: 1,
                        system: 0
                    };
                    const TIER_LABELS: Record<number, string> = {
                        3: 'Drama-3',
                        2: 'Breeze 2',
                        1: 'Kokoro',
                        0: 'Device Voice'
                    };
                    const FALLBACK_CHAIN: Record<string, string | undefined> = {
                        hybrid: 'breeze',
                        audiocpp: 'breeze',
                        breeze: 'kokoro',
                        kokoro: 'system',
                        browser: 'system'
                    };

                    let fallbackBackend = FALLBACK_CHAIN[curBackend];
                    let fallbackSuccess = false;
                    let fallbackUrl: string | null = null;
                    let workingChunk: SharedTtsQueueItem = targetChunk;

                    while (fallbackBackend && !fallbackSuccess) {
                        if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) {
                            return;
                        }

                        const fbTier = BACKEND_TO_TIER[fallbackBackend] ?? 1;
                        const fbLabel = TIER_LABELS[fbTier] || fallbackBackend;
                        sessionTtsTierCapRef.current = Math.min(
                            sessionTtsTierCapRef.current ?? 3,
                            fbTier
                        );

                        const nextSrc: TtsResolvedSourceMeta = {
                            ...(ttsResolvedSourceRef.current || {
                                sceneKey: `${targetChunk.seqIdx ?? 0}-${targetChunk.sceneIdx ?? 0}`
                            }),
                            mode: 'live',
                            tier: fbTier,
                            backend: fallbackBackend,
                            engineLabel: fbLabel
                        };
                        ttsResolvedSourceRef.current = nextSrc;
                        setTtsResolvedSource(nextSrc);

                        const latestQ = ttsQueueRef.current || [];
                        if (
                            latestQ.some(
                                (c, i) =>
                                    i >= chunkIdx &&
                                    c?.engine === 'drama3_multi' &&
                                    Array.isArray(c.turns) &&
                                    c.turns.length > 0
                            )
                        ) {
                            const expandedQ: SharedTtsQueueItem[] = [];
                            latestQ.forEach((item, idx) => {
                                if (
                                    idx >= chunkIdx &&
                                    item?.engine === 'drama3_multi' &&
                                    Array.isArray(item.turns) &&
                                    item.turns.length > 0
                                ) {
                                    item.turns.forEach((turn, tIdx) => {
                                        const resolvedSpoken = String(
                                            turn.cleanText || turn.spokenText || turn.text || ''
                                        );
                                        const prevTurn = item.turns?.[tIdx - 1];
                                        expandedQ.push({
                                            ...turn,
                                            speaker: String(turn.speaker || 'Narrator'),
                                            spokenText: resolvedSpoken,
                                            text: String(turn.text || resolvedSpoken),
                                            rawSpoken: String(
                                                turn.rawSpoken || turn.drama3Text || resolvedSpoken
                                            ),
                                            breezeText: String(turn.breezeText || resolvedSpoken),
                                            seqIdx: item.seqIdx,
                                            sceneIdx: item.sceneIdx,
                                            resolvedTier: fbTier,
                                            resolvedBackend: fallbackBackend,
                                            status: 'idle',
                                            audioUrl: undefined,
                                            isContinuation:
                                                tIdx > 0 && turn.speaker === prevTurn?.speaker
                                        });
                                    });
                                } else if (idx >= chunkIdx) {
                                    expandedQ.push({
                                        ...item,
                                        resolvedTier: fbTier,
                                        resolvedBackend: fallbackBackend
                                    });
                                } else {
                                    expandedQ.push(item);
                                }
                            });
                            setTtsQueueAndRef(expandedQ);
                            workingChunk = expandedQ[chunkIdx] || workingChunk;
                        } else {
                            setTtsQueueAndRef((prev) =>
                                prev.map((item, idx) =>
                                    idx >= chunkIdx
                                        ? {
                                              ...item,
                                              resolvedTier: fbTier,
                                              resolvedBackend: fallbackBackend
                                          }
                                        : item
                                )
                            );
                            workingChunk = {
                                ...workingChunk,
                                resolvedTier: fbTier,
                                resolvedBackend: fallbackBackend
                            };
                        }

                        if (fallbackBackend === 'system') {
                            showToastRef.current(
                                `${TIER_LABELS[BACKEND_TO_TIER[curBackend] ?? 1]} unavailable — switched to Device Voice.`,
                                'info'
                            );
                            clearTtsWatchdog(chunkIdx);
                            ttsAbortControllersRef.current.delete(chunkIdx);
                            ttsPendingRequestsRef.current.delete(chunkIdx);
                            speakChunkWithSpeechSynthesisFnRef.current(chunkIdx);
                            return;
                        }

                        try {
                            showToastRef.current(
                                `${TIER_LABELS[BACKEND_TO_TIER[curBackend] ?? 2] || 'Audio server'} unavailable — using ${fbLabel}`,
                                'info'
                            );
                            const freshKeys = getLlmKeysRef.current();
                            fallbackUrl = await synthesizeAudioDramaChunk({
                                chunk: workingChunk,
                                chunkIndex: chunkIdx,
                                totalChunks: (ttsQueueRef.current || q).length,
                                backend: fallbackBackend,
                                story: storyRef.current || story || null,
                                settings: audioDramaSettingsRef.current || audioDramaSettings,
                                mainApiKey: freshKeys.apiKey,
                                mainOpenRouterKey: freshKeys.openRouterKey,
                                kokoroWorkerRef: ttsWorkerRef,
                                signal: abortCtrl.signal
                            });
                            if (fallbackUrl) {
                                fallbackSuccess = true;
                                break;
                            }
                        } catch (fbErr) {
                            console.warn(`[Audio TTS] Fallback to ${fallbackBackend} failed:`, fbErr);
                            fallbackBackend = FALLBACK_CHAIN[fallbackBackend];
                        }
                    }

                    if (fallbackSuccess && fallbackUrl) {
                        if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) {
                            try {
                                URL.revokeObjectURL(fallbackUrl);
                            } catch {
                                // Ignore revoke failure
                            }
                            return;
                        }
                        clearTtsWatchdog(chunkIdx);
                        ttsAbortControllersRef.current.delete(chunkIdx);
                        ttsPendingRequestsRef.current.delete(chunkIdx);
                        setTtsQueueAndRef((prev) => {
                            const nextQ = [...prev];
                            if (nextQ[chunkIdx]) {
                                nextQ[chunkIdx] = {
                                    ...nextQ[chunkIdx],
                                    status: 'ready',
                                    audioUrl: fallbackUrl
                                };
                            }
                            return nextQ;
                        });
                        if (
                            chunkIdx === ttsCurrentChunkIndexRef.current &&
                            (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                            !ttsCadenceTimerRef.current
                        ) {
                            ttsAutoPlayNextRef.current = false;
                            playAudioChunkFnRef.current(chunkIdx, fallbackUrl);
                        }
                        return;
                    }

                    clearTtsWatchdog(chunkIdx);
                    ttsAbortControllersRef.current.delete(chunkIdx);
                    ttsPendingRequestsRef.current.delete(chunkIdx);
                    const humanErr = getHumanReadableTtsError(err, curBackend, workingChunk);
                    setTtsQueueAndRef((prev) => {
                        const nextQ = [...prev];
                        if (nextQ[chunkIdx]) {
                            nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'error' };
                        }
                        return nextQ;
                    });
                    if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                        setTtsError(humanErr);
                        setTtsStatusAndRef('error');
                        showToastRef.current(humanErr.title, 'warning');
                    }
                });

            if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                startTtsWatchdog(chunkIdx);
            }
            return;
        }

        const worker = getOrCreateTtsWorker();
        if (!worker) return;

        ttsPendingRequestsRef.current.add(chunkIdx);
        setTtsQueueAndRef((prev) => {
            const nextQ = [...prev];
            if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'loading' };
            return nextQ;
        });

        const selectedVoice = readerSettingsRef.current?.ttsVoice;
        const kokoroVoice =
            !selectedVoice || selectedVoice === 'system_native' ? 'af_heart' : selectedVoice;

        worker.postMessage({
            type: 'generate',
            payload: {
                chunkIndex: chunkIdx,
                text: targetChunk.text,
                voice: kokoroVoice,
                speed: readerSettingsRef.current?.ttsSpeed || 1.0
            }
        });

        if (chunkIdx === ttsCurrentChunkIndexRef.current) {
            startTtsWatchdog(chunkIdx);
        }
    };
    requestChunkAudioFnRef.current = requestChunkAudio;

    const primeLookaheadBuffer = (
        centerIdx: number,
        directQueue: SharedTtsQueueItem[] | null = null
    ) => {
        const resolvedBackend = ttsResolvedSourceRef.current?.backend;
        if (
            resolvedBackend === 'system' ||
            (readerSettingsRef.current?.ttsVoice === 'system_native' &&
                !isAudioDramaModeActiveRef.current &&
                resolvedBackend !== 'kokoro')
        ) {
            return;
        }
        if (isMobileDevice()) return;
        const q = directQueue || ttsQueueRef.current;
        if (!q || centerIdx + 1 >= q.length) return;

        requestChunkAudio(centerIdx + 1, q);
        if (q[centerIdx]?.engine !== 'drama3_multi' && centerIdx + 2 < q.length) {
            requestChunkAudio(centerIdx + 2, q);
        }
    };
    primeLookaheadBufferFnRef.current = primeLookaheadBuffer;

    const playAudioChunk = (chunkIdx: number, directUrl: string | null = null) => {
        if (ttsCadenceTimerRef.current) {
            clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = null;
        }
        const q = ttsQueueRef.current;
        if (!q || !q[chunkIdx]) return;
        const chunk = q[chunkIdx];

        if (
            chunk.resolvedBackend === 'system' ||
            ttsResolvedSourceRef.current?.backend === 'system' ||
            (readerSettingsRef.current?.ttsVoice === 'system_native' &&
                !isAudioDramaModeActiveRef.current &&
                !chunk?.speaker &&
                chunk.resolvedBackend !== 'kokoro')
        ) {
            speakChunkWithSpeechSynthesis(chunkIdx);
            return;
        }

        const urlToPlay = directUrl || (chunk && chunk.audioUrl);

        if (!urlToPlay) {
            setTtsStatusAndRef('generating');
            ttsAutoPlayNextRef.current = true;
            updateAwaitedChunkTelemetry(chunkIdx, q);
            if (ttsPendingRequestsRef.current.has(chunkIdx)) {
                startTtsWatchdog(chunkIdx);
                return;
            }
            requestChunkAudio(chunkIdx);
            return;
        }

        ttsAutoPlayNextRef.current = false;
        clearTtsWatchdog();
        if (ttsCurrentChunkIndexRef.current !== chunkIdx) {
            setTtsCurrentChunkIndexAndRef(chunkIdx);
        }

        if (chunk && chunk.engine === 'drama3_multi' && Array.isArray(chunk.turns)) {
            setAudioDramaActiveSpeaker(chunk.speaker || 'Narrator');
            setAudioDramaActiveEmotion(
                chunk.estimatedDurationSec
                    ? `~${chunk.estimatedDurationSec}s \u2022 ${chunk.turns.length} lines`
                    : null
            );
        } else if (chunk && chunk.speaker) {
            setAudioDramaActiveSpeaker(chunk.speaker);
            setAudioDramaActiveEmotion(chunk.emotion || null);
        } else {
            setAudioDramaActiveSpeaker(null);
            setAudioDramaActiveEmotion(null);
        }

        let audio = ttsAudioRef.current;
        if (!audio) {
            audio = new Audio();
            audio.preload = 'auto';
            ttsAudioRef.current = audio;
        }

        const win = getTtsWindow();
        audio.loop = false;
        const speedVal = readerSettingsRef.current?.ttsSpeed || win._ellipsisTtsPlaybackRate || 1.0;
        audio.playbackRate = Number(speedVal) || 1.0;
        audio.src = urlToPlay;

        audio.ontimeupdate = () => {
            setTtsCurrentTime(audio.currentTime);
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setTtsDuration(audio.duration);
            }
        };

        audio.onloadedmetadata = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setTtsDuration(audio.duration);
            }
        };

        audio.onended = () => {
            if (isMobileDevice()) {
                audio.loop = true;
                audio.src = SILENT_WAV_DATA_URI;
                audio.play().catch(() => {});
            } else {
                try {
                    audio.pause();
                } catch {
                    // Ignore pause errors
                }
            }

            const latestQ = ttsQueueRef.current;
            const nextIdx = chunkIdx + 1;
            if (nextIdx < latestQ.length) {
                setTtsCurrentChunkIndexAndRef(nextIdx);
                ttsAutoPlayNextRef.current = true;

                const nextChunk = latestQ[nextIdx];
                if (
                    nextChunk &&
                    !nextChunk.audioUrl &&
                    !ttsPendingRequestsRef.current.has(nextIdx)
                ) {
                    requestChunkAudio(nextIdx, latestQ);
                }

                const isDrama = Boolean((chunk && chunk.speaker) || isAudioDramaModeActiveRef.current);
                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }

                if (isDrama) {
                    const activeAdSettings = audioDramaSettingsRef.current || audioDramaSettings;
                    const isNarrator = !chunk || !chunk.speaker || chunk.speaker.toLowerCase() === 'narrator';
                    const narratorPause = Number(activeAdSettings.narratorPauseMs);
                    const dialoguePause = Number(activeAdSettings.dialoguePauseMs);
                    const basePauseMs = isNarrator
                        ? Number.isFinite(narratorPause)
                            ? Math.max(0, narratorPause)
                            : 440
                        : Number.isFinite(dialoguePause)
                          ? Math.max(0, dialoguePause)
                          : 240;
                    const pauseMs = nextChunk?.isContinuation ? Math.min(120, basePauseMs) : basePauseMs;

                    ttsCadenceTimerRef.current = setTimeout(() => {
                        ttsCadenceTimerRef.current = null;
                        playAudioChunk(nextIdx);
                    }, pauseMs);
                } else {
                    playAudioChunk(nextIdx);
                }
            } else {
                ttsAutoPlayNextRef.current = false;
                const activeSc = ttsPlayingSceneRef.current;
                advanceToNextAudioSceneFnRef.current(
                    activeSc ? activeSc.seqIdx : (selectedSequence ?? 0),
                    activeSc ? activeSc.sceneIdx : (selectedScene ?? 0),
                    'live'
                );
            }
        };

        audio.onerror = (e) => {
            if (
                !audio.src ||
                audio.src === 'about:blank' ||
                audio.src === window.location.href
            ) {
                return;
            }
            console.error('Audio playback error on line', chunkIdx, e);
            const nextIdx = chunkIdx + 1;
            if (nextIdx < ttsQueueRef.current.length) {
                showToastRef.current(
                    `Playback issue on line ${chunkIdx + 1}. Continuing with next line...`,
                    'info'
                );
                setTimeout(() => {
                    setTtsCurrentChunkIndexAndRef(nextIdx);
                    playAudioChunk(nextIdx);
                }, 700);
            } else {
                const humanErr = getHumanReadableTtsError(
                    new Error('Playback stream error'),
                    ttsResolvedSourceRef.current?.backend ||
                        audioDramaSettingsRef.current?.backend ||
                        'hybrid',
                    chunk
                );
                setTtsStatusAndRef('error');
                setTtsError(humanErr);
            }
        };

        audio
            .play()
            .then(() => {
                win._ellipsisAudioUnlocked = true;
                setTtsStatusAndRef('playing');
                setTtsError(null);
                console.log(
                    `[Audio TTS] Playing Chunk ${chunkIdx + 1}/${q.length} (${chunk?.speaker || 'Narrator'}).`
                );
                primeLookaheadBuffer(chunkIdx, q);
            })
            .catch((playErr: unknown) => {
                console.warn('audio.play() paused/interrupted:', playErr);
                setTtsStatusAndRef('paused');
                const errName =
                    playErr && typeof playErr === 'object'
                        ? (playErr as { name?: string }).name
                        : undefined;
                if (errName === 'NotAllowedError') {
                    showToastRef.current('Tap Play to resume listening', 'info');
                }
            });
    };
    playAudioChunkFnRef.current = playAudioChunk;

    const startTtsFromProse = async (
        proseText: string | Record<string, unknown>,
        startChunkIdx = 0,
        sceneOverride: StartTtsSceneOverride | null = null
    ): Promise<void> => {
        unlockBrowserAudioElement();
        stopAuditionPlayback();

        if (!proseText) {
            showToastRef.current(
                "This scene doesn't have any text written yet. Write or generate prose first to listen.",
                'info'
            );
            return;
        }
        let textToUse: unknown = proseText;
        if (typeof textToUse === 'object' && textToUse !== null) {
            const rec = textToUse as Record<string, unknown>;
            textToUse = rec.final || rec.draft || rec.text || rec.content || '';
        }
        if (typeof textToUse !== 'string' || !textToUse.trim()) {
            showToastRef.current(
                "This scene doesn't have any text written yet. Write or generate prose first to listen.",
                'info'
            );
            return;
        }

        const win = getTtsWindow();
        const targetSeq =
            typeof sceneOverride?.seqIdx === 'number'
                ? sceneOverride.seqIdx
                : (selectedSequence ?? 0);
        const targetSc =
            typeof sceneOverride?.sceneIdx === 'number'
                ? sceneOverride.sceneIdx
                : (selectedScene ?? 0);
        const myReqToken = ttsSessionIdRef.current + 1;
        ttsSessionIdRef.current = myReqToken;
        abortPendingTtsRequests();

        const resolved = sceneOverride?.resolvedTierInfo || (await resolveLiveTtsTier());
        if (myReqToken !== ttsSessionIdRef.current) return;

        if (sceneOverride?.isAutoAdvance && sceneOverride?.prevSourceMode === 'stored') {
            showToastRef.current(
                `Saved audio ended — continuing with live ${resolved.engineLabel} narration`,
                'info',
                { durationMs: 5500 }
            );
        } else if (
            resolved.demotedFrom !== null &&
            resolved.demotedFrom !== resolved.tier &&
            !sceneOverride?.suppressDemoteToast
        ) {
            showToastRef.current(
                `${resolved.demotedFromLabel} unavailable — using ${resolved.engineLabel}`,
                'info',
                { durationMs: 4500 }
            );
        }

        const currentStory = storyRef.current || story || null;
        const parsedDrama = parseAudioDramaScript(textToUse, {
            collapseNarrator: resolved.backend === 'breeze'
        }) as unknown as SharedTtsQueueItem[];
        const hasExplicitCharacterDialogue =
            parsedDrama &&
            parsedDrama.some((c) => c.speaker && c.speaker.toLowerCase() !== 'narrator');
        const isDrama =
            currentStory?.writing_mode === 'audio_drama' ||
            (hasExplicitCharacterDialogue && parsedDrama.length >= 2);
        const sceneSeed = getDeterministicVoiceSeed(`scene_${targetSeq}_${targetSc}`, currentStory);

        let chunks: SharedTtsQueueItem[];
        let turnsForVoiceRegistration: SharedTtsQueueItem[] = parsedDrama;
        if (isDrama && parsedDrama && parsedDrama.length > 0) {
            if (resolved.tier === 3) {
                const rawTurns = parseAudioDramaScript(textToUse, {
                    raw: true,
                    collapseNarrator: false
                }) as unknown as SharedTtsQueueItem[];
                const baseTurns =
                    rawTurns && rawTurns.length > 0 ? rawTurns : parsedDrama;
                turnsForVoiceRegistration = baseTurns;
                chunks = chunkAudioDramaTurns(baseTurns as unknown as never[], {
                    maxSpeakersPerChunk: 16,
                    sceneSeed
                }) as unknown as SharedTtsQueueItem[];
            } else {
                chunks = parsedDrama;
            }
            setIsAudioDramaModeActiveAndRef(true);
        } else {
            if (resolved.tier === 3) {
                const chunker = win.chunkNovelProseForDrama3 || chunkNovelProseForDrama3;
                chunks = chunker(textToUse, { sceneSeed }) as unknown as SharedTtsQueueItem[];
                turnsForVoiceRegistration = chunks.flatMap((c) =>
                    Array.isArray(c.turns) ? (c.turns as SharedTtsQueueItem[]) : [c]
                );
            } else if (resolved.tier === 2) {
                chunks = chunkProseForTts(textToUse).map((c) => ({
                    ...c,
                    speaker: 'Narrator',
                    spokenText: c.text
                }));
                turnsForVoiceRegistration = chunks;
            } else {
                chunks = chunkProseForTts(textToUse).map((c) => ({ ...c }));
            }
            setIsAudioDramaModeActiveAndRef(false);
        }

        if (!chunks || chunks.length === 0) return;

        chunks = chunks.map((c) => ({
            ...c,
            seqIdx: targetSeq,
            sceneIdx: targetSc,
            resolvedTier: resolved.tier,
            resolvedBackend: resolved.backend
        }));

        if (ttsCadenceTimerRef.current) {
            clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = null;
        }
        if (currentMasterAudioBlobUrlRef.current) {
            try {
                URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
            } catch {
                // Ignore revoke failure
            }
            currentMasterAudioBlobUrlRef.current = null;
        }
        setIsPlayingMasterSceneMp3(false);
        isPlayingMasterSceneMp3Ref.current = false;
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            if (!isMobileDevice()) {
                try {
                    ttsAudioRef.current.removeAttribute('src');
                } catch {
                    // Ignore removeAttribute failure
                }
            }
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Ignore cancel failure
            }
        }
        if (ttsWorkerRef.current) {
            try {
                ttsWorkerRef.current.postMessage({ type: 'clear' });
            } catch {
                // Ignore worker clear failure
            }
        }
        clearTtsWatchdog();
        ttsQueueRef.current.forEach((c) => {
            if (c.audioUrl) {
                try {
                    URL.revokeObjectURL(c.audioUrl);
                } catch {
                    // Ignore revoke error
                }
            }
        });
        ttsPendingRequestsRef.current.clear();

        const sourceMeta: TtsResolvedSourceMeta = {
            mode: 'live',
            tier: resolved.tier,
            backend: resolved.backend,
            engineLabel: resolved.engineLabel,
            sceneKey: `${targetSeq}-${targetSc}`
        };
        ttsResolvedSourceRef.current = sourceMeta;
        setTtsResolvedSource(sourceMeta);

        const playingLoc: TtsPlayingSceneLocation = { seqIdx: targetSeq, sceneIdx: targetSc };
        ttsPlayingSceneRef.current = playingLoc;
        setTtsPlayingScene(playingLoc);

        const clampedStartIdx = Math.max(0, Math.min(chunks.length - 1, startChunkIdx || 0));
        setTtsQueueAndRef(chunks);
        setTtsCurrentChunkIndexAndRef(clampedStartIdx);
        setTtsCurrentTime(0);
        setTtsDuration(0);
        setTtsIsMiniPlayerVisible(true);
        setTtsError(null);

        if (isDrama || resolved.tier >= 2) {
            const latestForReg = storyRef.current || currentStory;
            if (latestForReg) {
                const registeredStory = ensureAudioDramaVoicesRegistered(
                    turnsForVoiceRegistration as unknown as never[],
                    latestForReg,
                    setStory as Dispatch<SetStateAction<AudioStoryRecord>>
                );
                if (registeredStory && storyRef.current === latestForReg) {
                    storyRef.current = registeredStory as AudioStoryRecord;
                }
            }
        }

        if (resolved.tier === 0) {
            setTtsStatusAndRef('playing');
            setTtsActiveDevice('system');
            setTtsStatusMessage('Using Device Voice');
            speakChunkWithSpeechSynthesis(clampedStartIdx);
            return;
        }

        const firstChunk = chunks[clampedStartIdx] || chunks[0];
        setAudioDramaActiveSpeaker(firstChunk?.speaker || null);
        setAudioDramaActiveEmotion(
            firstChunk?.engine === 'drama3_multi' && firstChunk?.turns
                ? `~${firstChunk.estimatedDurationSec || 60}s \u2022 ${firstChunk.turns.length} lines`
                : firstChunk?.emotion || null
        );
        setTtsActiveDevice(resolved.backend);
        setTtsStatusAndRef('generating');
        ttsAutoPlayNextRef.current = true;

        if (resolved.tier === 1) {
            if (!isDrama && isMobileDevice() && !win._ellipsisTtsMobileWarned) {
                win._ellipsisTtsMobileWarned = true;
                showToastRef.current(
                    'Kokoro TTS uses an ~85MB neural model. Fast Wi-Fi recommended on mobile.',
                    'info'
                );
            }
            getOrCreateTtsWorker();
            if (!isDrama) {
                if (!win._ellipsisKokoroModelReady && ttsStatusRef.current !== 'ready') {
                    setTtsStatusMessage('Initializing neural voice...');
                    void initTtsEngine();
                } else {
                    setTtsStatusMessage('Synthesizing audio...');
                    requestChunkAudio(clampedStartIdx, chunks);
                    primeLookaheadBuffer(clampedStartIdx, chunks);
                }
                return;
            }
        }

        requestChunkAudio(clampedStartIdx, chunks);
    };

    const stopTtsPlayback = () => {
        ttsSessionIdRef.current += 1;
        abortPendingTtsRequests();

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Ignore cancel failure
            }
        }
        if (ttsCadenceTimerRef.current) {
            clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = null;
        }
        clearTtsWatchdog();
        if (currentMasterAudioBlobUrlRef.current) {
            try {
                URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
            } catch {
                // Ignore revoke failure
            }
            currentMasterAudioBlobUrlRef.current = null;
        }
        setIsPlayingMasterSceneMp3(false);
        isPlayingMasterSceneMp3Ref.current = false;
        if (ttsAudioRef.current) {
            ttsAudioRef.current.loop = false;
            ttsAudioRef.current.pause();
            try {
                ttsAudioRef.current.removeAttribute('src');
                ttsAudioRef.current.load();
            } catch {
                // Ignore media reset failures
            }
        }
        if (ttsWorkerRef.current) {
            try {
                ttsWorkerRef.current.postMessage({ type: 'clear' });
            } catch {
                // Ignore worker clear failure
            }
        }
        ttsQueueRef.current.forEach((c) => {
            if (c.audioUrl) {
                try {
                    URL.revokeObjectURL(c.audioUrl);
                } catch {
                    // Ignore revoke failure
                }
            }
        });
        ttsPendingRequestsRef.current.clear();
        ttsAutoPlayNextRef.current = false;
        ttsPlayingSceneRef.current = null;
        setTtsPlayingScene(null);
        ttsResolvedSourceRef.current = null;
        setTtsResolvedSource(null);
        isFollowingAudioRef.current = true;
        setIsFollowingAudio(true);
        setTtsError(null);
        setTtsQueueAndRef([]);
        setTtsCurrentChunkIndexAndRef(0);
        setTtsCurrentTime(0);
        setTtsDuration(0);
        setTtsIsMiniPlayerVisible(false);
        setIsAudioDramaModeActiveAndRef(false);
        setAudioDramaActiveSpeaker(null);
        setAudioDramaActiveEmotion(null);
        if (
            ttsStatusRef.current === 'playing' ||
            ttsStatusRef.current === 'paused' ||
            ttsStatusRef.current === 'generating' ||
            ttsStatusRef.current === 'error'
        ) {
            setTtsStatusAndRef('ready');
        }
    };

    const toggleTtsPlayPause = (proseOverride: string | null = null) => {
        unlockBrowserAudioElement();

        if (isAuditioningVoice) {
            stopAuditionPlayback();
            stopTtsPlayback();
            return;
        }

        if (ttsStatus === 'playing') {
            if (ttsCadenceTimerRef.current) {
                clearTimeout(ttsCadenceTimerRef.current);
                ttsCadenceTimerRef.current = null;
            }
            ttsAutoPlayNextRef.current = false;
            if (
                ttsResolvedSourceRef.current?.backend === 'system' &&
                typeof window !== 'undefined' &&
                'speechSynthesis' in window
            ) {
                try {
                    window.speechSynthesis.pause();
                } catch {
                    // Ignore pause errors
                }
            }
            if (ttsAudioRef.current) ttsAudioRef.current.pause();
            setTtsStatusAndRef('paused');
            return;
        }

        if (ttsStatus === 'paused') {
            if (
                ttsResolvedSourceRef.current?.backend === 'system' &&
                typeof window !== 'undefined' &&
                'speechSynthesis' in window
            ) {
                try {
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                        setTtsStatusAndRef('playing');
                        return;
                    }
                } catch {
                    // Fallback below
                }
                speakChunkWithSpeechSynthesis(ttsCurrentChunkIndexRef.current);
                return;
            }

            const audioEl = ttsAudioRef.current;
            if (isPlayingMasterSceneMp3Ref.current && audioEl) {
                audioEl
                    .play()
                    .then(() => {
                        setTtsStatusAndRef('playing');
                    })
                    .catch(() => {});
                return;
            }

            const canResumeCurrentAudio =
                audioEl &&
                audioEl.src &&
                audioEl.src !== SILENT_WAV_DATA_URI &&
                !audioEl.ended &&
                audioEl.currentTime > 0 &&
                (!audioEl.duration || audioEl.currentTime < audioEl.duration);

            if (canResumeCurrentAudio) {
                audioEl
                    .play()
                    .then(() => {
                        setTtsStatusAndRef('playing');
                    })
                    .catch(() => {
                        playAudioChunk(ttsCurrentChunkIndexRef.current);
                    });
            } else {
                playAudioChunk(ttsCurrentChunkIndexRef.current);
            }
            return;
        }

        if (
            ttsStatus === 'error' &&
            ttsQueueRef.current &&
            ttsQueueRef.current.length > 0 &&
            !proseOverride
        ) {
            setTtsError(null);
            playAudioChunk(ttsCurrentChunkIndexRef.current);
            return;
        }

        if (
            ttsStatus === 'loading-library' ||
            ttsStatus === 'loading-model' ||
            ttsStatus === 'generating'
        ) {
            stopTtsPlayback();
            showToastRef.current('Playback canceled');
            return;
        }

        let targetSeq = selectedSequence ?? 0;
        let targetSc = selectedScene ?? 0;
        if (
            viewRef.current === 'reader' &&
            readerSettingsRef.current?.readingMode === 'scroll' &&
            visibleScrollSceneRef.current
        ) {
            targetSeq = visibleScrollSceneRef.current.seqIdx ?? targetSeq;
            targetSc = visibleScrollSceneRef.current.sceneIdx ?? targetSc;
        }
        void playSceneAudioFnRef.current(targetSeq, targetSc, { autoplay: true, follow: true });
    };

    const skipTtsChunk = (delta: number) => {
        unlockBrowserAudioElement();
        if (ttsCadenceTimerRef.current) {
            clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = null;
        }
        const targetIdx = ttsCurrentChunkIndexRef.current + delta;
        if (targetIdx >= 0 && targetIdx < ttsQueueRef.current.length) {
            setTtsError(null);
            if (
                ttsResolvedSourceRef.current?.backend === 'system' ||
                (readerSettingsRef.current?.ttsVoice === 'system_native' &&
                    !isAudioDramaModeActiveRef.current)
            ) {
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try {
                        window.speechSynthesis.cancel();
                    } catch {
                        // Ignore cancel failure
                    }
                }
                setTtsCurrentChunkIndexAndRef(targetIdx);
                setTtsCurrentTime(0);
                speakChunkWithSpeechSynthesis(targetIdx);
                return;
            }

            if (currentMasterAudioBlobUrlRef.current) {
                try {
                    URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
                } catch {
                    // Ignore revoke failure
                }
                currentMasterAudioBlobUrlRef.current = null;
            }
            setIsPlayingMasterSceneMp3(false);
            isPlayingMasterSceneMp3Ref.current = false;
            if (ttsAudioRef.current) {
                ttsAudioRef.current.pause();
                if (!isMobileDevice()) {
                    try {
                        ttsAudioRef.current.removeAttribute('src');
                    } catch {
                        // Ignore removeAttribute failure
                    }
                }
            }
            if (ttsWorkerRef.current && !isAudioDramaModeActiveRef.current) {
                try {
                    ttsWorkerRef.current.postMessage({ type: 'clear' });
                } catch {
                    // Ignore worker clear failure
                }
            }
            clearTtsWatchdog();
            abortPendingTtsRequests(targetIdx);
            ttsAutoPlayNextRef.current = true;
            setTtsCurrentChunkIndexAndRef(targetIdx);
            setTtsCurrentTime(0);
            setTtsDuration(0);
            playAudioChunk(targetIdx);
        }
    };

    const changeTtsVoice = (newVoiceId: string) => {
        updateReaderSetting('ttsVoice', newVoiceId);
        const voiceObj = KOKORO_VOICES.find((v) => v.id === newVoiceId) || KOKORO_VOICES[0];
        showToastRef.current(`Voice set to ${voiceObj.shortName || voiceObj.name}`);

        if (
            newVoiceId !== 'system_native' &&
            typeof window !== 'undefined' &&
            window.localStorage
        ) {
            window.localStorage.setItem(STORAGE_KEYS.kokoroOptIn, 'true');
        }

        clearTtsWatchdog();
        if (newVoiceId === 'system_native') {
            if (ttsAudioRef.current) ttsAudioRef.current.pause();
            if (ttsWorkerRef.current) {
                try {
                    ttsWorkerRef.current.postMessage({ type: 'clear' });
                } catch {
                    // Ignore worker clear failure
                }
            }
            ttsPendingRequestsRef.current.clear();
            setTtsActiveDevice('system');
            if (ttsStatusRef.current === 'playing') {
                speakChunkWithSpeechSynthesis(ttsCurrentChunkIndexRef.current);
            }
            return;
        }

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Ignore cancel failure
            }
        }
        if (ttsWorkerRef.current) {
            try {
                ttsWorkerRef.current.postMessage({ type: 'clear' });
            } catch {
                // Ignore worker clear failure
            }
        }
        ttsPendingRequestsRef.current.clear();

        setTtsQueueAndRef((prev) => {
            if (!prev || prev.length === 0) return prev;
            return prev.map((chunk, idx) => {
                if (
                    idx === ttsCurrentChunkIndexRef.current &&
                    ttsStatusRef.current === 'playing'
                ) {
                    return chunk;
                }
                if (chunk.audioUrl) {
                    try {
                        URL.revokeObjectURL(chunk.audioUrl);
                    } catch {
                        // Ignore revoke failure
                    }
                }
                return {
                    ...chunk,
                    status: 'idle',
                    audioUrl: undefined,
                    duration: 0
                };
            });
        });

        setTimeout(() => {
            if (
                ttsQueueRef.current &&
                ttsQueueRef.current.length > 0 &&
                !isMobileDevice()
            ) {
                primeLookaheadBuffer(ttsCurrentChunkIndexRef.current);
            }
        }, 50);
    };
    changeTtsVoiceFnRef.current = changeTtsVoice;

    const advanceToNextAudioScene = (
        fromSeq: number,
        fromScene: number,
        prevSourceMode: string | null = null
    ) => {
        const flatList = flatStoryScenesRef.current || [];
        const audioMap = availableSceneAudioMapRef.current || {};
        const currentStory = storyRef.current || story || null;
        const curIdx = flatList.findIndex(
            (s) => s.seqIdx === Number(fromSeq) && s.sceneIdx === Number(fromScene)
        );

        let nextFlatItem: FlatReaderSceneItem | null = null;
        if (curIdx >= 0) {
            for (let i = curIdx + 1; i < flatList.length; i++) {
                const it = flatList[i];
                const nextId = `${it.seqIdx}-${it.sceneIdx}`;
                if (getSceneProseText(currentStory, it.seqIdx, it.sceneIdx) || audioMap[nextId]) {
                    nextFlatItem = it;
                    break;
                }
            }
        }

        if (nextFlatItem) {
            setTtsStatusMessage(
                `Next: Scene ${nextFlatItem.seqIdx + 1}.${nextFlatItem.sceneIdx + 1}...`
            );
            if (ttsCadenceTimerRef.current) clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = setTimeout(() => {
                ttsCadenceTimerRef.current = null;
                if (nextFlatItem) {
                    void playSceneAudioFnRef.current(
                        nextFlatItem.seqIdx,
                        nextFlatItem.sceneIdx,
                        {
                            autoplay: true,
                            follow: isFollowingAudioRef.current,
                            isAutoAdvance: true,
                            prevSourceMode
                        }
                    );
                }
            }, 1200);
        } else {
            setIsPlayingMasterSceneMp3(false);
            isPlayingMasterSceneMp3Ref.current = false;
            setTtsStatusAndRef('ready');
            setTtsStatusMessage('Finished listening');
            setTtsCurrentTime(0);
            setAudioDramaActiveSpeaker(null);
            setAudioDramaActiveEmotion(null);
        }
    };
    advanceToNextAudioSceneFnRef.current = advanceToNextAudioScene;

    const playSceneAudio = async (
        targetSeq: number | null = selectedSequence,
        targetScene: number | null = selectedScene,
        opts: PlaySceneAudioOptions = {}
    ): Promise<void> => {
        stopAuditionPlayback();
        const sSeq = Number(targetSeq ?? 0);
        const sSc = Number(targetScene ?? 0);
        const sId = `${sSeq}-${sSc}`;
        const follow = opts?.follow !== false;
        const autoplay = opts?.autoplay !== false;

        if (ttsCadenceTimerRef.current) {
            clearTimeout(ttsCadenceTimerRef.current);
            ttsCadenceTimerRef.current = null;
        }

        unlockBrowserAudioElement();

        const myPlaySession = ttsSessionIdRef.current + 1;
        ttsSessionIdRef.current = myPlaySession;
        abortPendingTtsRequests();

        const nextLoc: TtsPlayingSceneLocation = { seqIdx: sSeq, sceneIdx: sSc };
        ttsPlayingSceneRef.current = nextLoc;
        setTtsPlayingScene(nextLoc);

        if (follow) {
            isFollowingAudioRef.current = true;
            setIsFollowingAudio(true);
            if (
                viewRef.current === 'reader' &&
                (sSeq !== selectedSequence || sSc !== selectedScene)
            ) {
                jumpToReaderScene(sSeq, sSc, 'next', true);
            }
        }

        const win = getTtsWindow();
        const activeAudioStore = win.audioStore || audioStore;
        const currentStory = storyRef.current || story || null;
        const liveProseForCheck = getSceneProseText(currentStory, sSeq, sSc);
        let storedRecord = null;
        try {
            if (activeAudioStore && currentStory?.id) {
                const candidateRecord = await activeAudioStore.getSceneAudio(
                    currentStory.id,
                    sSeq,
                    sSc
                );
                if (candidateRecord && candidateRecord.blob) {
                    const freshness = isStoredSceneAudioFresh(
                        candidateRecord,
                        liveProseForCheck,
                        currentStory,
                        audioDramaSettingsRef.current || audioDramaSettings
                    );
                    if (freshness.fresh) {
                        storedRecord = candidateRecord;
                    } else {
                        console.log(
                            `[Audio Playback] Bypassing stale stored scene audio for Scene ${sSeq + 1}.${sSc + 1} (reason: ${freshness.reason}); synthesizing with updated voice/prose.`
                        );
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to check AudioStore for scene audio:', e);
        }
        if (myPlaySession !== ttsSessionIdRef.current) return;

        if (storedRecord && storedRecord.blob) {
            if (opts?.isAutoAdvance && opts?.prevSourceMode === 'live') {
                showToastRef.current(
                    `Switched back to saved audio for Scene ${sSeq + 1}.${sSc + 1}`,
                    'info',
                    { durationMs: 4500 }
                );
            }

            if (currentMasterAudioBlobUrlRef.current) {
                try {
                    URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
                } catch {
                    // Ignore revoke failure
                }
                currentMasterAudioBlobUrlRef.current = null;
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                } catch {
                    // Ignore cancel failure
                }
            }
            if (ttsWorkerRef.current) {
                try {
                    ttsWorkerRef.current.postMessage({ type: 'clear' });
                } catch {
                    // Ignore worker clear failure
                }
            }
            clearTtsWatchdog();
            ttsQueueRef.current.forEach((c) => {
                if (c.audioUrl) {
                    try {
                        URL.revokeObjectURL(c.audioUrl);
                    } catch {
                        // Ignore revoke failure
                    }
                }
            });
            ttsPendingRequestsRef.current.clear();

            const proseText = getSceneProseText(currentStory, sSeq, sSc);
            const isDramaStory = currentStory?.writing_mode === 'audio_drama';
            let timelineWasEstimated = !(
                Array.isArray(storedRecord.cueTimeline) && storedRecord.cueTimeline.length > 0
            );
            const cueBuilder = win.buildEstimatedCueTimeline || buildEstimatedCueTimeline;
            const rawTimeline = timelineWasEstimated
                ? cueBuilder(proseText, storedRecord.durationSec || 60, isDramaStory)
                : (storedRecord.cueTimeline as Array<Record<string, unknown>>);

            const cueQueue: SharedTtsQueueItem[] = (rawTimeline || []).map((cue) => ({
                ...cue,
                seqIdx: sSeq,
                sceneIdx: sSc,
                engine: 'stored_mp3',
                speaker: typeof cue.speaker === 'string' ? cue.speaker : undefined
            }));

            setIsPlayingMasterSceneMp3(true);
            isPlayingMasterSceneMp3Ref.current = true;
            setIsAudioDramaModeActiveAndRef(isDramaStory);

            const srcMeta: TtsResolvedSourceMeta = {
                mode: 'stored',
                tier: null,
                backend: 'stored_mp3',
                engineLabel: 'Saved Audio',
                sceneKey: sId
            };
            ttsResolvedSourceRef.current = srcMeta;
            setTtsResolvedSource(srcMeta);

            setTtsQueueAndRef(cueQueue);
            setTtsCurrentChunkIndexAndRef(0);
            setTtsCurrentTime(0);
            setTtsDuration(storedRecord.durationSec || 0);
            setTtsIsMiniPlayerVisible(true);
            setTtsError(null);
            setTtsStatusMessage('');
            setAudioDramaActiveSpeaker(null);
            setAudioDramaActiveEmotion(null);

            const blobUrl = URL.createObjectURL(storedRecord.blob);
            currentMasterAudioBlobUrlRef.current = blobUrl;

            let audio = ttsAudioRef.current;
            if (!audio) {
                audio = new Audio();
                audio.preload = 'auto';
                ttsAudioRef.current = audio;
            }

            audio.loop = false;
            const activeSpeed =
                readerSettingsRef.current?.ttsSpeed || win._ellipsisTtsPlaybackRate || 1.0;
            audio.playbackRate = Number(activeSpeed) || 1.0;
            audio.src = blobUrl;

            audio.onloadedmetadata = () => {
                if (myPlaySession !== ttsSessionIdRef.current) return;
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    setTtsDuration(audio.duration);
                    if (
                        timelineWasEstimated &&
                        Array.isArray(ttsQueueRef.current) &&
                        ttsQueueRef.current.length > 0
                    ) {
                        timelineWasEstimated = false;
                        const estTotal =
                            ttsQueueRef.current[ttsQueueRef.current.length - 1]?.endSec || 60;
                        if (estTotal > 0) {
                            const scale = audio.duration / estTotal;
                            const rescaled = ttsQueueRef.current.map((item) => ({
                                ...item,
                                startSec: Number(((item.startSec || 0) * scale).toFixed(2)),
                                endSec: Number(((item.endSec || 0) * scale).toFixed(2))
                            }));
                            setTtsQueueAndRef(rescaled);
                        }
                    }
                }
            };

            audio.ontimeupdate = () => {
                if (myPlaySession !== ttsSessionIdRef.current) return;
                const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
                setTtsCurrentTime(t);
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    setTtsDuration(audio.duration);
                }
                const q = ttsQueueRef.current;
                if (q && q.length > 0 && q[0]?.startSec !== undefined) {
                    let lo = 0;
                    let hi = q.length - 1;
                    let best = 0;
                    while (lo <= hi) {
                        const mid = (lo + hi) >> 1;
                        if ((q[mid].startSec ?? 0) <= t + 0.05) {
                            best = mid;
                            lo = mid + 1;
                        } else {
                            hi = mid - 1;
                        }
                    }
                    if (best !== ttsCurrentChunkIndexRef.current) {
                        setTtsCurrentChunkIndexAndRef(best);
                    }
                }
            };

            audio.onended = () => {
                if (myPlaySession !== ttsSessionIdRef.current) return;
                if (currentMasterAudioBlobUrlRef.current) {
                    try {
                        URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current);
                    } catch {
                        // Ignore revoke failure
                    }
                    currentMasterAudioBlobUrlRef.current = null;
                }
                advanceToNextAudioScene(sSeq, sSc, 'stored');
            };

            audio.onerror = (e) => {
                if (myPlaySession !== ttsSessionIdRef.current) return;
                if (
                    !audio.src ||
                    audio.src === 'about:blank' ||
                    audio.src === window.location.href ||
                    audio.src === SILENT_WAV_DATA_URI
                ) {
                    return;
                }
                console.error(
                    'Master MP3 playback error:',
                    JSON.stringify({
                        code: audio.error?.code,
                        message: audio.error?.message,
                        readyState: audio.readyState,
                        networkState: audio.networkState
                    }),
                    e
                );
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                setTtsStatusAndRef('error');
                setTtsError({
                    type: 'PLAYBACK_ERROR',
                    title: 'Playback Error',
                    message: 'Failed to play saved scene audio.',
                    suggestedAction: 'skip_line',
                    actionLabel: 'Skip',
                    secondaryAction: 'close',
                    secondaryLabel: 'Close',
                    allowSettings: false
                });
            };

            if (autoplay) {
                setTtsStatusAndRef('playing');
                audio
                    .play()
                    .then(() => {
                        win._ellipsisAudioUnlocked = true;
                        if (myPlaySession === ttsSessionIdRef.current) {
                            setTtsStatusAndRef('playing');
                        }
                    })
                    .catch((err: unknown) => {
                        console.warn('audio.play() paused/interrupted:', err);
                        if (myPlaySession === ttsSessionIdRef.current) {
                            setTtsStatusAndRef('paused');
                        }
                    });
            } else {
                setTtsStatusAndRef('paused');
            }
            return;
        }

        setIsPlayingMasterSceneMp3(false);
        isPlayingMasterSceneMp3Ref.current = false;
        const proseText = getSceneProseText(currentStory, sSeq, sSc);
        if (proseText) {
            await startTtsFromProse(proseText, 0, {
                seqIdx: sSeq,
                sceneIdx: sSc,
                isAutoAdvance: Boolean(opts?.isAutoAdvance),
                prevSourceMode: opts?.prevSourceMode || null
            });
        } else if (opts?.isAutoAdvance) {
            advanceToNextAudioScene(sSeq, sSc, opts?.prevSourceMode || null);
        } else {
            showToastRef.current('No audio or drafted prose found for this scene.', 'warning');
        }
    };
    playSceneAudioFnRef.current = playSceneAudio;

    const skipAudioScene = (delta: number) => {
        const currentStory = storyRef.current || story || null;
        const audioMap = availableSceneAudioMapRef.current || {};
        const playable = (flatStoryScenesRef.current || []).filter((sc) =>
            Boolean(
                getSceneProseText(currentStory, sc.seqIdx, sc.sceneIdx) ||
                    audioMap[`${sc.seqIdx}-${sc.sceneIdx}`]
            )
        );
        if (!playable.length) return;
        const activeLoc = ttsPlayingSceneRef.current || {
            seqIdx: selectedSequence ?? 0,
            sceneIdx: selectedScene ?? 0
        };
        let baseIdx = playable.findIndex(
            (sc) =>
                sc.seqIdx === Number(activeLoc.seqIdx) && sc.sceneIdx === Number(activeLoc.sceneIdx)
        );
        if (baseIdx < 0) baseIdx = 0;
        const target = playable[baseIdx + delta];
        if (!target) return;
        void playSceneAudio(target.seqIdx, target.sceneIdx, { autoplay: true, follow: true });
    };

    const playStoredOrLiveSceneAudio = async (
        targetSeq: number | null = selectedSequence,
        targetScene: number | null = selectedScene,
        scopeOrOpts: PlaySceneAudioOptions | null = null
    ): Promise<void> => {
        const opts = scopeOrOpts && typeof scopeOrOpts === 'object' ? scopeOrOpts : {};
        if (opts.enterReader) {
            enterReaderMode(Number(targetSeq ?? 0), Number(targetScene ?? 0));
        }
        return playSceneAudio(Number(targetSeq ?? 0), Number(targetScene ?? 0), {
            autoplay: opts.autoplay !== false,
            follow: opts.follow !== false
        });
    };

    return {
        ttsStatus,
        setTtsStatus,
        isTtsBusyOrPlaying,
        isAnyAudioPlaying,
        ttsProgress,
        ttsStatusMessage,
        ttsActiveDevice,
        ttsError,
        setTtsError,
        setTtsCurrentTime,
        requestChunkAudio,
        ttsIsMiniPlayerVisible,
        setTtsIsMiniPlayerVisible,
        ttsQueue,
        setTtsQueueAndRef,
        ttsCurrentChunkIndex,
        ttsCurrentTime,
        ttsDuration,
        ttsGeneratingElapsedSec,
        audioDramaActiveSpeaker,
        audioDramaActiveEmotion,
        isAudioDramaModeActive,
        audioPlaybackScope,
        setAudioPlaybackScope,
        isPlayingMasterSceneMp3,
        ttsPlayingScene,
        ttsResolvedSource,
        getOrCreateTtsWorker,
        initTtsEngine,
        startTtsFromProse,
        toggleTtsPlayPause,
        stopTtsPlayback,
        skipTtsChunk,
        changeTtsVoice,
        playSceneAudio,
        skipAudioScene,
        playStoredOrLiveSceneAudio
    };
}
