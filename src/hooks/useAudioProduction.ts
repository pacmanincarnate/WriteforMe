/**
 * @module hooks/useAudioProduction
 * Offline AudioStore synchronization, scene audio freshness/readiness calculation,
 * Scene/Sequence/Full-Novel MP3 export & stitching, story audio teardown, and the
 * sequential Audio Drama Autopilot production pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { TTS_PIPELINE_TIERS, type AudioDramaSettings } from '@/config';
import {
    buildStoryAudioExportPlan,
    computeSceneProseHash,
    computeSceneVoiceSignatureHash,
    parseAudioDramaScript,
    resolveSequenceAudioPlan,
    type AudioStorageRecordLike
} from '@/domain/audio';
import { formatAudioDuration, mapAudioStageToCanonical } from '@/domain/story';
import {
    ensureAudioDramaVoicesRegistered,
    exportSceneAudioMp3,
    stitchAudioBlobsToMp3,
    type DeferredSceneExportResult,
    type ExportedSceneAudioResult,
    type KokoroWorkerHandle
} from '@/services/audio';
import { downloadBlob } from '@/services/browser';
import {
    audioStore,
    studioCacheStore,
    type AudioStore,
    type SceneAudioMeta,
    type SequenceAudioMeta
} from '@/services/storage';
import type {
    AudioStoryRecord,
    RequestConfirmDialogOptions,
    SharedTtsQueueItem,
    ToastOptionsLike
} from './useVoiceManagement';

export interface SceneAudioFreshnessResult {
    fresh: boolean;
    reason: string | null;
}

export interface SceneAudioStatusInfo {
    status: 'none' | 'stale' | 'ready';
    meta: SceneAudioMeta | null;
    reason?: string | null;
}

export interface StoryAudioSummaryInfo {
    readyCount: number;
    staleCount: number;
    totalDrafted: number;
    totalScenes: number;
}

export interface AudioAutopilotErrorEntry {
    sceneLabel: string;
    message: string;
    timestamp: string;
}

export interface AudioAutopilotLastCompletedScene {
    seqIdx: number;
    sceneIdx: number;
    label: string;
    seqTitle: string;
    sceneTitle: string;
    durationSec: number;
    sizeBytes: number;
    cueCount: number;
    updatedAt: number;
}

export interface AudioAutopilotProgressState {
    status: 'running' | 'paused' | 'complete';
    startedAt: number;
    totalEligibleScenes: number;
    alreadyCachedScenes: number;
    generatedScenes: number;
    failedScenes: number;
    currentSceneOrder: number;
    currentSeqIdx: number | null;
    currentSceneIdx: number | null;
    currentSeqTitle: string | null;
    currentSceneTitle: string | null;
    currentSceneLabel: string | null;
    activeStageId: string;
    stageLabel: string;
    stageMessage: string;
    stagePct: number;
    chunkCurrent: number | null;
    chunkTotal: number | null;
    activeSpeaker: string | null;
    backendLabel: string;
    lastCompletedScene: AudioAutopilotLastCompletedScene | null;
    recentErrors: AudioAutopilotErrorEntry[];
    errorSceneIds: string[];
}

export interface GenerateAndStoreSceneAudioOptions {
    triggerDownload?: boolean;
    forceRegenerate?: boolean;
    forceRerender?: boolean;
    forceRecalibrate?: boolean;
    deferFinalize?: boolean;
    onProgress?: ((event: Record<string, unknown>) => void) | null;
    signal?: AbortSignal | null;
    storyOverride?: AudioStoryRecord | null;
}

export interface DeferredGenerateSceneAudioResult {
    deferred: true;
    totalChunks: number;
    finalize: () => Promise<ExportedSceneAudioResult>;
}

export interface UseAudioProductionParams {
    story: AudioStoryRecord | null | undefined;
    storyRef: MutableRefObject<AudioStoryRecord | null>;
    setStory: Dispatch<SetStateAction<AudioStoryRecord | null>>;
    selectedSequence: number | null;
    selectedScene: number | null;
    audioDramaSettings: AudioDramaSettings;
    audioDramaSettingsRef: MutableRefObject<AudioDramaSettings>;
    getLlmKeys: () => { apiKey: string; openRouterKey: string };
    showToast: (
        message: string,
        variant?: 'success' | 'error' | 'info' | 'warning',
        options?: ToastOptionsLike | null
    ) => void;
    requestConfirm: (options: RequestConfirmDialogOptions) => Promise<boolean | string> | boolean;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setLoadingStep: Dispatch<SetStateAction<string>>;
    continuousAutopilot: boolean;
    ttsWorkerRef: MutableRefObject<KokoroWorkerHandle | null>;
    ttsQueueRef: MutableRefObject<SharedTtsQueueItem[]>;
    stopTtsPlaybackRef: MutableRefObject<() => void>;
    availableSceneAudioMapRef: MutableRefObject<Record<string, SceneAudioMeta>>;
    audioAutopilotProgress: AudioAutopilotProgressState | null;
    setAudioAutopilotProgress: Dispatch<SetStateAction<AudioAutopilotProgressState | null>>;
}

export interface UseAudioProductionResult {
    availableSceneAudioMap: Record<string, SceneAudioMeta>;
    setAvailableSceneAudioMap: Dispatch<SetStateAction<Record<string, SceneAudioMeta>>>;
    availableSceneAudioMapRef: MutableRefObject<Record<string, SceneAudioMeta>>;
    availableSequenceAudioMap: Record<string, SequenceAudioMeta>;
    setAvailableSequenceAudioMap: Dispatch<SetStateAction<Record<string, SequenceAudioMeta>>>;
    refreshAvailableSceneAudio: (targetStoryId?: string) => Promise<void>;
    getSceneProseText: (
        storyObj: AudioStoryRecord | null | undefined,
        seqIdx: number,
        sceneIdx: number
    ) => string;
    isStoredSceneAudioFresh: (
        metaOrRecord: { textHash?: string; voiceSigHash?: string; updatedAt?: number } | null | undefined,
        proseText: string,
        storyObj?: AudioStoryRecord | null,
        settingsObj?: AudioDramaSettings
    ) => SceneAudioFreshnessResult;
    getSceneAudioStatus: (seqIdx: number, sceneIdx: number) => SceneAudioStatusInfo;
    storyAudioSummary: StoryAudioSummaryInfo;
    isExportingSceneAudio: boolean;
    isExportingSequenceAudio: boolean;
    isExportingStoryAudio: boolean;
    isRegeneratingSceneAudio: boolean;
    isAudioAutopilotRunning: boolean;
    setIsAudioAutopilotRunning: Dispatch<SetStateAction<boolean>>;
    isAudioAutopilotRunningRef: MutableRefObject<boolean>;
    isAudioAutopilotQueued: boolean;
    setIsAudioAutopilotQueued: Dispatch<SetStateAction<boolean>>;
    isAudioAutopilotQueuedRef: MutableRefObject<boolean>;
    generateAndStoreSceneAudio: (
        seqIdx: number,
        sceneIdx: number,
        options?: GenerateAndStoreSceneAudioOptions
    ) => Promise<ExportedSceneAudioResult | DeferredGenerateSceneAudioResult>;
    handleDownloadSceneAudio: (seqIdx?: number | null, sceneIdx?: number | null) => Promise<void>;
    handleRegenerateSceneAudio: (
        seqIdx?: number | null,
        sceneIdx?: number | null
    ) => Promise<void>;
    handleDownloadSequenceAudio: (seqIdx?: number | null) => Promise<void>;
    handleDownloadStoryAudio: () => Promise<void>;
    clearStoryTtsArtifacts: (targetStoryId: string) => Promise<void>;
    handleToggleAudioAutopilot: () => void;
}

interface AudioPipelineWindowGlobals {
    audioStore?: AudioStore;
    studioCacheStore?: typeof studioCacheStore;
    logAudioDramaPipelineStageComplete?: (
        stageKey: string,
        stageTitle: string,
        details?: unknown,
        meta?: Record<string, unknown>
    ) => void;
    logAudioDramaPipelineStageError?: (
        stageKey: string,
        stageTitle: string,
        error: unknown,
        details?: unknown,
        meta?: Record<string, unknown>
    ) => void;
}

const getWindowGlobals = (): AudioPipelineWindowGlobals =>
    typeof window !== 'undefined' ? (window as unknown as AudioPipelineWindowGlobals) : {};

/** Extracts plain prose text from string or object prose entry on a story. */
export function extractSceneProseText(
    storyObj: AudioStoryRecord | null | undefined,
    seqIdx: number,
    sceneIdx: number
): string {
    if (!storyObj || !storyObj.prose) return '';
    const raw = storyObj.prose[`${seqIdx}-${sceneIdx}`];
    if (!raw) return '';
    const str =
        typeof raw === 'string' ? raw : raw.final || raw.draft || raw.text || raw.content || '';
    return typeof str === 'string' ? str.trim() : '';
}

/** Checks whether stored offline scene audio still matches current prose hash and voice signatures. */
export function checkStoredSceneAudioFreshness(
    metaOrRecord:
        | { textHash?: string; voiceSigHash?: string; updatedAt?: number }
        | null
        | undefined,
    proseText: string,
    storyObj?: AudioStoryRecord | null,
    settingsObj?: AudioDramaSettings
): SceneAudioFreshnessResult {
    if (!metaOrRecord) return { fresh: false, reason: 'missing' };
    const cleanProse = String(proseText || '').trim();
    if (metaOrRecord.textHash && cleanProse) {
        const currentHash = computeSceneProseHash(cleanProse);
        if (currentHash && metaOrRecord.textHash !== currentHash) {
            return { fresh: false, reason: 'prose_changed' };
        }
    }
    if (
        storyObj?.audio_cast_updated_at &&
        metaOrRecord.updatedAt &&
        Number(metaOrRecord.updatedAt) < Number(storyObj.audio_cast_updated_at)
    ) {
        return { fresh: false, reason: 'voice_changed' };
    }
    if (metaOrRecord.voiceSigHash) {
        const curVoiceSig = computeSceneVoiceSignatureHash(cleanProse, storyObj, settingsObj);
        if (curVoiceSig && metaOrRecord.voiceSigHash !== curVoiceSig) {
            return { fresh: false, reason: 'voice_changed' };
        }
    }
    return { fresh: true, reason: null };
}

/** Manages offline AudioStore hydration, MP3 scene/sequence/novel export, and Audio Autopilot. */
export function useAudioProduction(params: UseAudioProductionParams): UseAudioProductionResult {
    const {
        story,
        storyRef,
        setStory,
        selectedSequence,
        selectedScene,
        audioDramaSettings,
        audioDramaSettingsRef,
        getLlmKeys,
        showToast,
        requestConfirm,
        setLoading,
        setLoadingStep,
        continuousAutopilot,
        ttsWorkerRef,
        ttsQueueRef,
        stopTtsPlaybackRef,
        availableSceneAudioMapRef,
        audioAutopilotProgress,
        setAudioAutopilotProgress
    } = params;

    void audioAutopilotProgress;

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const getLlmKeysRef = useRef(getLlmKeys);
    getLlmKeysRef.current = getLlmKeys;
    const continuousAutopilotRef = useRef(continuousAutopilot);
    continuousAutopilotRef.current = continuousAutopilot;

    const storyId = story?.id ?? '';

    const [availableSceneAudioMap, setAvailableSceneAudioMap] = useState<
        Record<string, SceneAudioMeta>
    >({});
    availableSceneAudioMapRef.current = availableSceneAudioMap;
    const [availableSequenceAudioMap, setAvailableSequenceAudioMap] = useState<
        Record<string, SequenceAudioMeta>
    >({});

    const [isAudioAutopilotRunning, setIsAudioAutopilotRunning] = useState(false);
    const [isAudioAutopilotQueued, setIsAudioAutopilotQueued] = useState(false);
    const isAudioAutopilotRunningRef = useRef(false);
    const isAudioAutopilotQueuedRef = useRef(false);
    const audioAutopilotAbortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        isAudioAutopilotRunningRef.current = isAudioAutopilotRunning;
    }, [isAudioAutopilotRunning]);
    useEffect(() => {
        isAudioAutopilotQueuedRef.current = isAudioAutopilotQueued;
    }, [isAudioAutopilotQueued]);

    const [isExportingSceneAudio, setIsExportingSceneAudio] = useState(false);
    const [isExportingSequenceAudio, setIsExportingSequenceAudio] = useState(false);
    const [isExportingStoryAudio, setIsExportingStoryAudio] = useState(false);
    const [isRegeneratingSceneAudio, setIsRegeneratingSceneAudio] = useState(false);

    const refreshAvailableSceneAudio = useCallback(
        async (targetStoryId?: string) => {
            const resolvedTargetId = targetStoryId || (storyRef.current || story)?.id;
            const activeAudioStore = getWindowGlobals().audioStore || audioStore;
            if (!resolvedTargetId || !activeAudioStore) return;
            try {
                const metaList = await activeAudioStore.listStoryAudioMeta(resolvedTargetId);
                const activeIdAfterMeta = (storyRef.current || story)?.id;
                if (activeIdAfterMeta && activeIdAfterMeta !== resolvedTargetId) return;
                const map: Record<string, SceneAudioMeta> = {};
                (metaList || []).forEach((m) => {
                    map[`${m.seqIdx}-${m.sceneIdx}`] = m;
                });
                availableSceneAudioMapRef.current = map;
                setAvailableSceneAudioMap(map);

                if (typeof activeAudioStore.listStorySequenceAudioMeta === 'function') {
                    const seqMetaList =
                        await activeAudioStore.listStorySequenceAudioMeta(resolvedTargetId);
                    const activeIdAfterSeq = (storyRef.current || story)?.id;
                    if (activeIdAfterSeq && activeIdAfterSeq !== resolvedTargetId) return;
                    const seqMap: Record<string, SequenceAudioMeta> = {};
                    (seqMetaList || []).forEach((m) => {
                        seqMap[String(m.seqIdx)] = m;
                    });
                    setAvailableSequenceAudioMap(seqMap);
                }
            } catch (err) {
                console.warn('[AudioStore] Failed to list story audio meta:', err);
            }
        },
        [story, storyRef, availableSceneAudioMapRef]
    );

    const refreshAvailableSceneAudioRef = useRef(refreshAvailableSceneAudio);
    refreshAvailableSceneAudioRef.current = refreshAvailableSceneAudio;

    useEffect(() => {
        if (storyId) {
            void refreshAvailableSceneAudioRef.current(storyId);
        } else {
            availableSceneAudioMapRef.current = {};
            setAvailableSceneAudioMap({});
            setAvailableSequenceAudioMap({});
        }
    }, [storyId, availableSceneAudioMapRef]);

    const getSceneProseText = useCallback(
        (storyObj: AudioStoryRecord | null | undefined, seqIdx: number, sceneIdx: number) =>
            extractSceneProseText(storyObj || storyRef.current || story, seqIdx, sceneIdx),
        [story, storyRef]
    );

    const isStoredSceneAudioFresh = useCallback(
        (
            metaOrRecord:
                | { textHash?: string; voiceSigHash?: string; updatedAt?: number }
                | null
                | undefined,
            proseText: string,
            storyObj: AudioStoryRecord | null = story || null,
            settingsObj: AudioDramaSettings = audioDramaSettings
        ) => checkStoredSceneAudioFreshness(metaOrRecord, proseText, storyObj, settingsObj),
        [story, audioDramaSettings]
    );

    const getSceneAudioStatus = useCallback(
        (seqIdx: number, sceneIdx: number): SceneAudioStatusInfo => {
            const sId = `${seqIdx}-${sceneIdx}`;
            const meta = availableSceneAudioMap?.[sId];
            if (!meta) return { status: 'none', meta: null };
            const proseText = getSceneProseText(story, seqIdx, sceneIdx);
            const check = isStoredSceneAudioFresh(meta, proseText, story, audioDramaSettings);
            if (!check.fresh) {
                return { status: 'stale', meta, reason: check.reason };
            }
            return { status: 'ready', meta };
        },
        [
            availableSceneAudioMap,
            story,
            getSceneProseText,
            audioDramaSettings,
            isStoredSceneAudioFresh
        ]
    );

    const storyAudioSummary = useMemo((): StoryAudioSummaryInfo => {
        let readyCount = 0;
        let staleCount = 0;
        let totalDrafted = 0;
        let totalScenes = 0;
        const seqs = Array.isArray(story?.sequences) ? story.sequences : [];
        seqs.forEach((_, qIdx) => {
            const scList = story?.scenes?.[`${qIdx}`] || story?.scenes?.[qIdx] || [];
            (Array.isArray(scList) ? scList : []).forEach((__, sIdx) => {
                totalScenes++;
                const sId = `${qIdx}-${sIdx}`;
                const proseText = getSceneProseText(story, qIdx, sIdx);
                if (proseText) {
                    totalDrafted++;
                    const st = getSceneAudioStatus(qIdx, sIdx);
                    if (st.status === 'ready') readyCount++;
                    else if (st.status === 'stale') staleCount++;
                } else if (availableSceneAudioMap?.[sId]) {
                    readyCount++;
                }
            });
        });
        return { readyCount, staleCount, totalDrafted, totalScenes };
    }, [story, availableSceneAudioMap, getSceneProseText, getSceneAudioStatus]);

    const generateAndStoreSceneAudio = useCallback(
        async (
            seqIdx: number,
            sceneIdx: number,
            {
                triggerDownload = false,
                forceRegenerate = false,
                forceRerender = false,
                forceRecalibrate = false,
                deferFinalize = false,
                onProgress = null,
                signal = null,
                storyOverride = null
            }: GenerateAndStoreSceneAudioOptions = {}
        ): Promise<ExportedSceneAudioResult | DeferredGenerateSceneAudioResult> => {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            const targetSeq = Number(seqIdx);
            const targetScene = Number(sceneIdx);
            const sId = `${targetSeq}-${targetScene}`;
            const liveActiveStory = storyRef.current || story || null;
            const useOverride = Boolean(
                storyOverride && (!liveActiveStory?.id || storyOverride.id !== liveActiveStory.id)
            );
            const currentStory = useOverride ? storyOverride : liveActiveStory;
            const targetStoryId = currentStory?.id;
            if (!targetStoryId || !currentStory) {
                throw new Error('Cannot generate scene audio without an active story ID.');
            }
            const proseObj = currentStory?.prose?.[sId];
            const proseText =
                typeof proseObj === 'object' && proseObj !== null
                    ? String(proseObj.final || proseObj.draft || '')
                    : String(proseObj || '');

            if (!proseText || !proseText.trim()) {
                throw new Error(
                    `No prose drafted for Scene ${targetSeq + 1}.${targetScene + 1}`
                );
            }

            const isCurrentActiveScene =
                (!useOverride || (storyRef.current || story)?.id === targetStoryId) &&
                targetSeq === Number(selectedSequence) &&
                targetScene === Number(selectedScene);
            let activeQueueToReuse: SharedTtsQueueItem[] | undefined;
            if (
                !forceRegenerate &&
                !forceRerender &&
                isCurrentActiveScene &&
                Array.isArray(ttsQueueRef.current) &&
                ttsQueueRef.current.length > 0 &&
                ttsQueueRef.current[0]?.engine !== 'stored_mp3'
            ) {
                const firstQueueText =
                    ttsQueueRef.current[0]?.spokenText || ttsQueueRef.current[0]?.text || '';
                if (firstQueueText && proseText.includes(firstQueueText.slice(0, 20))) {
                    activeQueueToReuse = ttsQueueRef.current;
                }
            }

            if (onProgress) {
                onProgress({
                    current: 5,
                    total: 100,
                    stage: 'parsing_turns',
                    message: 'Parsing script & dialogue cues...'
                });
            }
            const parsedDramaForExport = parseAudioDramaScript(proseText);
            const isSameActiveStory = (storyRef.current || story)?.id === targetStoryId;
            const storyForExport = ensureAudioDramaVoicesRegistered(
                parsedDramaForExport,
                currentStory,
                isSameActiveStory
                    ? (setStory as Dispatch<SetStateAction<AudioStoryRecord>>)
                    : null
            );
            if (storyForExport && isSameActiveStory && storyRef.current === currentStory) {
                storyRef.current = storyForExport as AudioStoryRecord;
            }
            if (onProgress) {
                onProgress({
                    current: 18,
                    total: 100,
                    stage: 'voice_alignment',
                    message: 'Voice profiles & acoustic seeds registered.'
                });
            }

            const latestExportStory =
                !useOverride && storyRef.current?.id === targetStoryId
                    ? storyRef.current
                    : (storyForExport as AudioStoryRecord) || currentStory;

            const { apiKey, openRouterKey } = getLlmKeysRef.current();
            const exportRes = await exportSceneAudioMp3({
                story: latestExportStory,
                seqIdx: targetSeq,
                sceneIdx: targetScene,
                settings: audioDramaSettingsRef.current || audioDramaSettings,
                mainApiKey: apiKey,
                mainOpenRouterKey: openRouterKey,
                kokoroWorkerRef: ttsWorkerRef,
                activeQueue: activeQueueToReuse,
                triggerDownload,
                forceRerender: Boolean(forceRerender || forceRegenerate),
                forceRecalibrate: Boolean(forceRecalibrate),
                deferFinalize: Boolean(deferFinalize),
                onProgress,
                signal
            });

            const persistRenderedResult = async (
                result: ExportedSceneAudioResult,
                notifyProgress = true
            ): Promise<ExportedSceneAudioResult> => {
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                const win = getWindowGlobals();
                const activeAudioStore = win.audioStore || audioStore;
                const outBlob = result?.mp3Blob || result?.blob;
                if (!activeAudioStore) {
                    throw new Error(
                        `AudioStore is unavailable to persist Scene ${targetSeq + 1}.${targetScene + 1}.`
                    );
                }
                if (!(outBlob instanceof Blob) || outBlob.size <= 0) {
                    throw new Error(
                        `Scene ${targetSeq + 1}.${targetScene + 1} audio render produced an empty blob.`
                    );
                }

                try {
                    if (notifyProgress && onProgress) {
                        onProgress({
                            current: 95,
                            total: 100,
                            stage: 'saving',
                            message: 'Saving master audio & cue timeline to offline store...'
                        });
                    }
                    const liveStoryForSig =
                        !useOverride && storyRef.current?.id === targetStoryId
                            ? storyRef.current
                            : latestExportStory;
                    const savedRecord = await activeAudioStore.saveSceneAudio({
                        storyId: targetStoryId,
                        seqIdx: targetSeq,
                        sceneIdx: targetScene,
                        blob: outBlob,
                        mimeType: result?.mimeType || outBlob.type || 'audio/mpeg',
                        durationSec: result.durationSec || 0,
                        textHash: result.textHash || computeSceneProseHash(proseText),
                        voiceSigHash:
                            result.voiceSigHash ||
                            computeSceneVoiceSignatureHash(
                                proseText,
                                liveStoryForSig,
                                audioDramaSettingsRef.current || audioDramaSettings
                            ),
                        cueCount:
                            (Array.isArray(result.cueTimeline) && result.cueTimeline.length) ||
                            result.totalChunks ||
                            parsedDramaForExport?.length ||
                            1,
                        cueTimeline: Array.isArray(result.cueTimeline) ? result.cueTimeline : null
                    });
                    if (typeof win.logAudioDramaPipelineStageComplete === 'function') {
                        win.logAudioDramaPipelineStageComplete(
                            'scene_audio_save',
                            `[Completed] Saved Scene ${targetSeq + 1}.${targetScene + 1} Audio to IndexedDB (${(((savedRecord?.sizeBytes || outBlob.size) as number) / 1024 / 1024).toFixed(2)} MB)`,
                            {
                                storyId: targetStoryId,
                                seqIdx: targetSeq,
                                sceneIdx: targetScene,
                                sizeBytes: savedRecord?.sizeBytes || outBlob.size,
                                durationSec: savedRecord?.durationSec || result.durationSec || 0,
                                mimeType:
                                    savedRecord?.mimeType ||
                                    result?.mimeType ||
                                    outBlob.type ||
                                    'audio/mpeg'
                            }
                        );
                    }
                    if ((storyRef.current || story)?.id === targetStoryId) {
                        await refreshAvailableSceneAudioRef.current(targetStoryId);
                    }
                    if (notifyProgress && onProgress) {
                        onProgress({
                            current: 100,
                            total: 100,
                            stage: 'done',
                            message: 'Saved to offline audio library.'
                        });
                    }
                } catch (saveErr) {
                    if (typeof win.logAudioDramaPipelineStageError === 'function') {
                        win.logAudioDramaPipelineStageError(
                            'scene_audio_save',
                            `Failed saving Scene ${targetSeq + 1}.${targetScene + 1} Audio to IndexedDB`,
                            saveErr,
                            {
                                storyId: targetStoryId,
                                seqIdx: targetSeq,
                                sceneIdx: targetScene,
                                sizeBytes: outBlob.size
                            }
                        );
                    }
                    throw saveErr;
                }

                return result;
            };

            if (
                deferFinalize &&
                exportRes &&
                'finalize' in exportRes &&
                typeof (exportRes as DeferredSceneExportResult).finalize === 'function'
            ) {
                const deferred = exportRes as DeferredSceneExportResult;
                return {
                    deferred: true,
                    totalChunks: deferred.totalChunks || 1,
                    finalize: async () => {
                        const finalizedRes = await deferred.finalize();
                        return await persistRenderedResult(finalizedRes, false);
                    }
                };
            }

            if (!exportRes || 'finalize' in exportRes) {
                throw new Error(
                    `Scene ${targetSeq + 1}.${targetScene + 1} audio render returned no result.`
                );
            }

            return await persistRenderedResult(exportRes as ExportedSceneAudioResult, true);
        },
        [
            story,
            storyRef,
            setStory,
            selectedSequence,
            selectedScene,
            audioDramaSettings,
            audioDramaSettingsRef,
            ttsWorkerRef,
            ttsQueueRef
        ]
    );

    const handleDownloadSceneAudio = useCallback(
        async (seqIdx: number | null = selectedSequence, sceneIdx: number | null = selectedScene) => {
            if (isExportingSceneAudio) return;

            const targetSeq =
                seqIdx !== undefined && seqIdx !== null
                    ? Number(seqIdx)
                    : Number(selectedSequence ?? 0);
            const targetScene =
                sceneIdx !== undefined && sceneIdx !== null
                    ? Number(sceneIdx)
                    : Number(selectedScene ?? 0);
            const currentStory = storyRef.current || story;

            const sId = `${targetSeq}-${targetScene}`;
            const proseObj = currentStory?.prose?.[sId];
            const proseText =
                typeof proseObj === 'object' && proseObj !== null
                    ? String(proseObj.final || proseObj.draft || '')
                    : String(proseObj || '');

            const activeAudioStore = getWindowGlobals().audioStore || audioStore;
            if (activeAudioStore && currentStory?.id) {
                try {
                    const storedRecord = await activeAudioStore.getSceneAudio(
                        currentStory.id,
                        targetSeq,
                        targetScene
                    );
                    const freshness = isStoredSceneAudioFresh(
                        storedRecord,
                        proseText,
                        currentStory,
                        audioDramaSettingsRef.current || audioDramaSettings
                    );
                    if (storedRecord && storedRecord.blob && freshness.fresh) {
                        setIsExportingSceneAudio(true);
                        try {
                            const cleanStory = String(currentStory?.title || 'Novel').replace(
                                /[^a-zA-Z0-9_-]/g,
                                '_'
                            );
                            const scenesForSeq =
                                (currentStory.scenes &&
                                    (currentStory.scenes[targetSeq] ||
                                        currentStory.scenes[String(targetSeq)])) ||
                                [];
                            const sceneItem = Array.isArray(scenesForSeq)
                                ? scenesForSeq[targetScene]
                                : null;
                            const cleanSceneTitle = String(
                                (sceneItem as { title?: string } | null)?.title ||
                                    `Scene_${targetScene + 1}`
                            ).replace(/[^a-zA-Z0-9_-]/g, '_');
                            const fileName =
                                `${cleanStory}_Scene_${targetSeq + 1}.${targetScene + 1}_${cleanSceneTitle}.mp3`.replace(
                                    /\s+/g,
                                    '_'
                                );
                            downloadBlob(storedRecord.blob, fileName);
                            showToastRef.current(`Downloaded saved MP3: ${fileName}`, 'success');
                            return;
                        } finally {
                            setIsExportingSceneAudio(false);
                        }
                    }
                } catch (storeErr) {
                    console.warn('Failed checking AudioStore for saved MP3 download:', storeErr);
                }
            }

            if (!proseText || !proseText.trim()) {
                showToastRef.current('No prose drafted for this scene to generate audio.', 'warning');
                return;
            }

            setIsExportingSceneAudio(true);
            showToastRef.current(
                `Preparing MP3 export for Scene ${targetSeq + 1}.${targetScene + 1}...`,
                'info'
            );

            try {
                const rawResult = await generateAndStoreSceneAudio(targetSeq, targetScene, {
                    triggerDownload: true,
                    forceRegenerate: true,
                    forceRerender: true,
                    forceRecalibrate: false,
                    onProgress: ({ current, total, stage, speaker }) => {
                        if (stage === 'synthesizing') {
                            showToastRef.current(
                                `Synthesizing ${String(speaker || 'audio')} (${String(current)}/${String(total)})...`,
                                'info'
                            );
                        } else if (stage === 'encoding') {
                            showToastRef.current('Encoding master MP3...', 'info');
                        }
                    }
                });
                const result =
                    'deferred' in rawResult ? await rawResult.finalize() : rawResult;
                showToastRef.current(`MP3 downloaded: ${result.fileName}`, 'success');
            } catch (err) {
                console.error('Failed to export scene MP3:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                showToastRef.current(`Audio export failed: ${message}`, 'error');
            } finally {
                setIsExportingSceneAudio(false);
            }
        },
        [
            isExportingSceneAudio,
            selectedSequence,
            selectedScene,
            story,
            storyRef,
            audioDramaSettings,
            audioDramaSettingsRef,
            isStoredSceneAudioFresh,
            generateAndStoreSceneAudio
        ]
    );

    const handleRegenerateSceneAudio = useCallback(
        async (seqIdx: number | null = selectedSequence, sceneIdx: number | null = selectedScene) => {
            if (isExportingSceneAudio || isRegeneratingSceneAudio) return;

            const targetSeq =
                seqIdx !== undefined && seqIdx !== null
                    ? Number(seqIdx)
                    : Number(selectedSequence ?? 0);
            const targetScene =
                sceneIdx !== undefined && sceneIdx !== null
                    ? Number(sceneIdx)
                    : Number(selectedScene ?? 0);
            const currentStory = storyRef.current || story;
            const sId = `${targetSeq}-${targetScene}`;
            const proseObj = currentStory?.prose?.[sId];
            const proseText =
                typeof proseObj === 'object' && proseObj !== null
                    ? String(proseObj.final || proseObj.draft || '')
                    : String(proseObj || '');

            if (!proseText || !proseText.trim()) {
                showToastRef.current(
                    'No prose drafted for this scene to regenerate audio.',
                    'warning'
                );
                return;
            }

            setIsRegeneratingSceneAudio(true);
            const tierName = audioDramaSettings?.backend || 'selected';
            showToastRef.current(
                `Regenerating audio for Scene ${targetSeq + 1}.${targetScene + 1} (${tierName} pipeline)...`,
                'info'
            );

            try {
                const rawResult = await generateAndStoreSceneAudio(targetSeq, targetScene, {
                    triggerDownload: false,
                    forceRegenerate: true,
                    forceRerender: true,
                    forceRecalibrate: false,
                    onProgress: ({ current, total, stage, speaker }) => {
                        if (stage === 'synthesizing') {
                            showToastRef.current(
                                `Synthesizing ${String(speaker || 'audio')} (${String(current)}/${String(total)})...`,
                                'info'
                            );
                        } else if (stage === 'encoding') {
                            showToastRef.current('Encoding regenerated master MP3...', 'info');
                        }
                    }
                });
                if ('deferred' in rawResult) {
                    await rawResult.finalize();
                }
                showToastRef.current(
                    `Audio regenerated & saved for Scene ${targetSeq + 1}.${targetScene + 1}!`,
                    'success'
                );
            } catch (err) {
                console.error('Failed to regenerate scene audio:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                showToastRef.current(`Audio regeneration failed: ${message}`, 'error');
            } finally {
                setIsRegeneratingSceneAudio(false);
            }
        },
        [
            isExportingSceneAudio,
            isRegeneratingSceneAudio,
            selectedSequence,
            selectedScene,
            story,
            storyRef,
            audioDramaSettings,
            generateAndStoreSceneAudio
        ]
    );

    const handleDownloadSequenceAudio = useCallback(
        async (seqIdx: number | null = selectedSequence) => {
            if (isExportingSequenceAudio || isExportingSceneAudio || isExportingStoryAudio) return;

            const currentStory = storyRef.current || story;
            const targetSeq =
                seqIdx !== undefined && seqIdx !== null
                    ? Number(seqIdx)
                    : Number(selectedSequence ?? 0);
            const seq = (currentStory?.sequences || [])[targetSeq] as
                | { number?: number | string; title?: string }
                | undefined;
            const seqNum = seq?.number || targetSeq + 1;
            const rawScenes =
                (currentStory?.scenes &&
                    (currentStory.scenes[targetSeq] || currentStory.scenes[String(targetSeq)])) ||
                [];
            const sceneList = Array.isArray(rawScenes) ? rawScenes : [];

            let storedSceneRecords: AudioStorageRecordLike[] = [];
            let storedSeqRecord: AudioStorageRecordLike | null = null;
            const activeAudioStore = getWindowGlobals().audioStore || audioStore;
            if (activeAudioStore && currentStory?.id) {
                try {
                    storedSceneRecords = (await activeAudioStore.getAllStoryAudioRecords(
                        currentStory.id
                    )) as unknown as AudioStorageRecordLike[];
                    if (typeof activeAudioStore.getSequenceAudio === 'function') {
                        storedSeqRecord = (await activeAudioStore.getSequenceAudio(
                            currentStory.id,
                            targetSeq
                        )) as unknown as AudioStorageRecordLike | null;
                    }
                } catch (storeErr) {
                    console.warn('Failed checking AudioStore for sequence audio:', storeErr);
                }
            }

            let plan = resolveSequenceAudioPlan(
                currentStory,
                targetSeq,
                storedSceneRecords,
                storedSeqRecord
            );

            if (plan.items.length > 0) {
                const coveredSet = new Set(plan.coveredSceneIndices || []);
                const missingDraftedIndices: number[] = [];
                sceneList.forEach((_, sIdx) => {
                    if (!coveredSet.has(sIdx) && getSceneProseText(currentStory, targetSeq, sIdx)) {
                        missingDraftedIndices.push(sIdx);
                    }
                });

                let shouldGenerateMissing = false;
                if (plan.status === 'missing_in_structure' || plan.status === 'incomplete') {
                    const missingList = [
                        ...(plan.internalMissingIndices || []),
                        ...(plan.trailingMissingIndices || [])
                    ].map((i) => `${plan.seqNum}.${i + 1}`);
                    const msg =
                        plan.status === 'missing_in_structure'
                            ? `Scene(s) ${missingList.join(', ')} are missing saved audio in Sequence ${plan.seqNum} (${plan.coveredSceneIndices.length}/${plan.totalScenes} ready).\n\n${missingDraftedIndices.length > 0 ? 'Would you like to generate the missing drafted scenes first, or stitch only the currently available scenes?' : 'Exporting now will stitch only the generated scenes into an MP3.'}`
                            : `Sequence ${plan.seqNum} MP3 is incomplete: audio is saved for ${plan.coveredSceneIndices.length} of ${plan.totalScenes} scenes.\n\nMissing scene(s): ${missingList.join(', ')}.\n\n${missingDraftedIndices.length > 0 ? 'Generate missing drafted scenes before stitching, or export the currently saved scenes only?' : 'Stitch and export the saved scenes now?'}`;

                    const choice = await requestConfirm({
                        title:
                            plan.status === 'missing_in_structure'
                                ? `Missing Scenes in Sequence ${plan.seqNum}`
                                : `Incomplete Sequence ${plan.seqNum} Audio`,
                        message: msg,
                        confirmLabel:
                            missingDraftedIndices.length > 0
                                ? 'Generate Missing & Export'
                                : 'Export Available Audio',
                        secondaryLabel:
                            missingDraftedIndices.length > 0 ? 'Export Available Only' : null,
                        cancelLabel: 'Cancel',
                        warning: true
                    });
                    if (!choice) return;
                    if (choice === true && missingDraftedIndices.length > 0) {
                        shouldGenerateMissing = true;
                    }
                }

                setIsExportingSequenceAudio(true);
                try {
                    if (shouldGenerateMissing) {
                        for (let mi = 0; mi < missingDraftedIndices.length; mi++) {
                            const mIdx = missingDraftedIndices[mi];
                            showToastRef.current(
                                `Sequence ${plan.seqNum}: Generating Scene ${plan.seqNum}.${mIdx + 1} (${mi + 1}/${missingDraftedIndices.length})...`,
                                'info'
                            );
                            const genRes = await generateAndStoreSceneAudio(targetSeq, mIdx, {
                                triggerDownload: false,
                                forceRegenerate: true,
                                onProgress: ({ current, total, stage, speaker }) => {
                                    if (stage === 'synthesizing' && Number(total) > 0) {
                                        showToastRef.current(
                                            `[Scene ${plan.seqNum}.${mIdx + 1}] ${String(speaker || 'Synthesizing')} (${String(current)}/${String(total)})...`,
                                            'info'
                                        );
                                    }
                                }
                            });
                            if ('deferred' in genRes) {
                                await genRes.finalize();
                            }
                        }
                        if (activeAudioStore && currentStory?.id) {
                            storedSceneRecords = (await activeAudioStore.getAllStoryAudioRecords(
                                currentStory.id
                            )) as unknown as AudioStorageRecordLike[];
                            plan = resolveSequenceAudioPlan(
                                currentStory,
                                targetSeq,
                                storedSceneRecords,
                                storedSeqRecord
                            );
                        }
                    }

                    showToastRef.current(
                        `Stitching ${plan.items.length} scene audio track(s) for Sequence ${plan.seqNum}...`,
                        'info'
                    );
                    const mp3Blob = await stitchAudioBlobsToMp3(plan.items, {
                        kbps: 128,
                        defaultPauseMs: 2000,
                        onProgress: ({ current, total, label }) => {
                            if (total > 1) {
                                showToastRef.current(
                                    `Stitching Sequence ${plan.seqNum} MP3 (${current}/${total}: ${label})...`,
                                    'info'
                                );
                            }
                        }
                    });

                    const cleanStory =
                        String(currentStory?.title || 'Story')
                            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                            .trim() || 'Story';
                    const cleanSeqTitle =
                        String(plan.seqTitle || `Sequence_${plan.seqNum}`)
                            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                            .trim() || `Sequence_${plan.seqNum}`;
                    const fileName =
                        `${cleanStory}_Sequence_${plan.seqNum}_${cleanSeqTitle}.mp3`.replace(
                            /\s+/g,
                            '_'
                        );

                    downloadBlob(mp3Blob, fileName);
                    showToastRef.current(`Sequence MP3 downloaded: ${fileName}`, 'success');
                } catch (err) {
                    console.error('Failed to stitch sequence MP3:', err);
                    const message = err instanceof Error ? err.message : 'Unknown error';
                    showToastRef.current(`Sequence audio stitching failed: ${message}`, 'error');
                } finally {
                    setIsExportingSequenceAudio(false);
                }
                return;
            }

            const draftedIndices: number[] = [];
            sceneList.forEach((_, sIdx) => {
                if (getSceneProseText(currentStory, targetSeq, sIdx)) {
                    draftedIndices.push(sIdx);
                }
            });

            if (draftedIndices.length === 0) {
                showToastRef.current(
                    `No prose drafted in Sequence ${seqNum} to generate audio.`,
                    'warning'
                );
                return;
            }

            setIsExportingSequenceAudio(true);
            showToastRef.current(
                `Generating ${draftedIndices.length} scene(s) for Sequence ${seqNum}...`,
                'info'
            );

            try {
                const generatedItems: Array<{ blob: Blob; label: string }> = [];
                const sceneHashes: Record<string, string> = {};
                let totalDurationSec = 0;
                for (let di = 0; di < draftedIndices.length; di++) {
                    const sIdx = draftedIndices[di];
                    showToastRef.current(
                        `Sequence ${seqNum}: Generating Scene ${seqNum}.${sIdx + 1} (${di + 1}/${draftedIndices.length})...`,
                        'info'
                    );
                    const rawScResult = await generateAndStoreSceneAudio(targetSeq, sIdx, {
                        triggerDownload: false,
                        forceRegenerate: false,
                        onProgress: ({ current, total, stage, speaker }) => {
                            if (stage === 'synthesizing' && Number(total) > 0) {
                                showToastRef.current(
                                    `[Scene ${seqNum}.${sIdx + 1}] ${String(speaker || 'Synthesizing')} (${String(current)}/${String(total)})...`,
                                    'info'
                                );
                            }
                        }
                    });
                    const scResult =
                        'deferred' in rawScResult ? await rawScResult.finalize() : rawScResult;
                    const blob = scResult?.mp3Blob || scResult?.blob;
                    if (blob) {
                        generatedItems.push({ blob, label: `Scene ${seqNum}.${sIdx + 1}` });
                        totalDurationSec += Number(scResult?.durationSec || 0);
                        sceneHashes[String(sIdx)] =
                            scResult?.textHash ||
                            computeSceneProseHash(getSceneProseText(currentStory, targetSeq, sIdx));
                    }
                }

                if (generatedItems.length === 0) {
                    throw new Error('No scene audio tracks were produced.');
                }

                showToastRef.current(
                    `Sequence ${seqNum}: Stitching ${generatedItems.length} scenes into master MP3...`,
                    'info'
                );
                const stitchedBlob = await stitchAudioBlobsToMp3(generatedItems, {
                    kbps: 128,
                    defaultPauseMs: 2000,
                    onProgress: ({ current, total, label }) => {
                        if (total > 1) {
                            showToastRef.current(
                                `Stitching Sequence ${seqNum} MP3 (${current}/${total}: ${label})...`,
                                'info'
                            );
                        }
                    }
                });

                const cleanStory =
                    String(currentStory?.title || 'Story')
                        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                        .trim() || 'Story';
                const cleanSeqTitle =
                    String(seq?.title || `Sequence_${seqNum}`)
                        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                        .trim() || `Sequence_${seqNum}`;
                const fileName = `${cleanStory}_Sequence_${seqNum}_${cleanSeqTitle}.mp3`.replace(
                    /\s+/g,
                    '_'
                );
                downloadBlob(stitchedBlob, fileName);

                if (
                    activeAudioStore &&
                    typeof activeAudioStore.saveSequenceAudio === 'function' &&
                    currentStory?.id
                ) {
                    try {
                        await activeAudioStore.saveSequenceAudio({
                            storyId: currentStory.id,
                            seqIdx: targetSeq,
                            blob: stitchedBlob,
                            durationSec: totalDurationSec,
                            includedSceneIndices: draftedIndices,
                            totalScenesInStructure: sceneList.length,
                            sceneHashes
                        });
                        await refreshAvailableSceneAudioRef.current(currentStory.id);
                    } catch (saveErr) {
                        console.warn('Failed saving sequence audio cache:', saveErr);
                    }
                }

                showToastRef.current(`Sequence MP3 downloaded: ${fileName}`, 'success');
            } catch (err) {
                console.error('Failed to export sequence MP3:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                showToastRef.current(`Sequence audio export failed: ${message}`, 'error');
            } finally {
                setIsExportingSequenceAudio(false);
            }
        },
        [
            isExportingSequenceAudio,
            isExportingSceneAudio,
            isExportingStoryAudio,
            selectedSequence,
            story,
            storyRef,
            requestConfirm,
            getSceneProseText,
            generateAndStoreSceneAudio
        ]
    );

    const handleDownloadStoryAudio = useCallback(async () => {
        if (isExportingStoryAudio || isExportingSequenceAudio || isExportingSceneAudio) return;

        const currentStory = storyRef.current || story;
        const activeAudioStore = getWindowGlobals().audioStore || audioStore;
        if (!currentStory?.id || !activeAudioStore) {
            showToastRef.current('No story audio storage available.', 'warning');
            return;
        }

        let allSceneRecords: AudioStorageRecordLike[];
        let allSeqRecords: AudioStorageRecordLike[] = [];
        try {
            allSceneRecords = (await activeAudioStore.getAllStoryAudioRecords(
                currentStory.id
            )) as unknown as AudioStorageRecordLike[];
            if (typeof activeAudioStore.getAllStorySequenceAudioRecords === 'function') {
                allSeqRecords = (await activeAudioStore.getAllStorySequenceAudioRecords(
                    currentStory.id
                )) as unknown as AudioStorageRecordLike[];
            }
        } catch (err) {
            console.error('Failed reading AudioStore for full novel export:', err);
            const message = err instanceof Error ? err.message : 'Unknown error';
            showToastRef.current(`Failed reading stored audio: ${message}`, 'error');
            return;
        }

        const plan = buildStoryAudioExportPlan(currentStory, allSceneRecords, allSeqRecords);

        if (plan.items.length === 0) {
            showToastRef.current(
                'No generated scene or sequence audio found yet. Run Audio Autopilot or generate scene/sequence audio first.',
                'warning'
            );
            return;
        }

        if (plan.status === 'missing_in_structure') {
            let msg = `Audio is missing within the story structure for: ${plan.missingBeforeSummary}.`;
            if (plan.missingAfterLast.length > 0 && plan.missingAfterSummary) {
                msg += `\n\nTrailing item(s) without audio: ${plan.missingAfterSummary}.`;
            }
            msg += `\n\nCurrently ${plan.coveredSceneCount} of ${plan.totalOutlinedScenes} scenes (${plan.coveredSeqCount} of ${plan.totalSeqs} sequences) have audio. Exporting will skip the missing scenes/sequences without duplicating overlapping audio. Continue?`;
            const confirmed = await requestConfirm({
                title: 'Missing Scenes in Story Structure',
                message: msg,
                confirmLabel: 'Export Available Audio',
                cancelLabel: 'Cancel',
                warning: true
            });
            if (!confirmed) return;
        } else if (plan.status === 'incomplete') {
            const msg = `Story MP3 is incomplete: audio is available for ${plan.coveredSceneCount} of ${plan.totalOutlinedScenes} scenes (${plan.coveredSeqCount} of ${plan.totalSeqs} sequences).\n\nNot yet generated: ${plan.missingAfterSummary}.\n\nDo you want to stitch and export the available audio as an incomplete Story MP3?`;
            const confirmed = await requestConfirm({
                title: 'Incomplete Story MP3',
                message: msg,
                confirmLabel: 'Export Incomplete MP3',
                cancelLabel: 'Cancel',
                warning: true
            });
            if (!confirmed) return;
        }

        setIsExportingStoryAudio(true);
        showToastRef.current(
            `Stitching full story MP3 (${plan.items.length} audio clip${plan.items.length === 1 ? '' : 's'})...`,
            'info'
        );

        try {
            const mp3Blob = await stitchAudioBlobsToMp3(plan.items, {
                kbps: 128,
                defaultPauseMs: 2000,
                onProgress: ({ current, total, label }) => {
                    if (total > 1) {
                        showToastRef.current(
                            `Stitching Novel MP3 (${current}/${total}: ${label})...`,
                            'info'
                        );
                    }
                }
            });

            const cleanStory =
                String(currentStory?.title || 'Novel')
                    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                    .trim() || 'Novel';
            const suffix =
                currentStory?.writing_mode === 'audio_drama' ? 'Full_AudioDrama' : 'Full_Novel';
            const fileName = `${cleanStory}_${suffix}.mp3`.replace(/\s+/g, '_');

            downloadBlob(mp3Blob, fileName);
            showToastRef.current(`Full story MP3 downloaded: ${fileName}`, 'success');
        } catch (err) {
            console.error('Failed to export full story MP3:', err);
            const message = err instanceof Error ? err.message : 'Unknown error';
            showToastRef.current(`Story MP3 export failed: ${message}`, 'error');
        } finally {
            setIsExportingStoryAudio(false);
        }
    }, [
        isExportingStoryAudio,
        isExportingSequenceAudio,
        isExportingSceneAudio,
        story,
        storyRef,
        requestConfirm
    ]);

    const clearStoryTtsArtifacts = useCallback(
        async (targetStoryId: string) => {
            if (typeof stopTtsPlaybackRef.current === 'function') {
                stopTtsPlaybackRef.current();
            }
            setIsAudioAutopilotRunning(false);
            isAudioAutopilotRunningRef.current = false;
            setIsAudioAutopilotQueued(false);
            isAudioAutopilotQueuedRef.current = false;
            if (audioAutopilotAbortRef.current) {
                try {
                    audioAutopilotAbortRef.current.abort();
                } catch {
                    // Ignore abort errors
                }
                audioAutopilotAbortRef.current = null;
            }
            setAudioAutopilotProgress(null);

            const win = getWindowGlobals();
            const activeAudioStore = win.audioStore || audioStore;
            const activeStudioCache = win.studioCacheStore || studioCacheStore;

            if (targetStoryId && activeAudioStore && typeof activeAudioStore.deleteStoryAudio === 'function') {
                try {
                    await activeAudioStore.deleteStoryAudio(targetStoryId);
                } catch (audioErr) {
                    console.warn('[handleResetStoryStage] Audio store cleanup warning:', audioErr);
                }
            }
            if (
                targetStoryId &&
                activeStudioCache &&
                typeof activeStudioCache.clearRendersForStory === 'function'
            ) {
                try {
                    await activeStudioCache.clearRendersForStory(targetStoryId);
                } catch (cacheErr) {
                    console.warn(
                        '[handleResetStoryStage] Studio render cache cleanup warning:',
                        cacheErr
                    );
                }
            }
            availableSceneAudioMapRef.current = {};
            setAvailableSceneAudioMap({});
            setAvailableSequenceAudioMap({});
        },
        [stopTtsPlaybackRef, setAudioAutopilotProgress, availableSceneAudioMapRef]
    );

    const handleToggleAudioAutopilot = useCallback(() => {
        if (isAudioAutopilotRunning) {
            setIsAudioAutopilotRunning(false);
            isAudioAutopilotRunningRef.current = false;
            if (audioAutopilotAbortRef.current) {
                try {
                    audioAutopilotAbortRef.current.abort();
                } catch {
                    // Ignore abort errors
                }
                audioAutopilotAbortRef.current = null;
            }
            showToastRef.current('Audio Drama Autopilot paused.', 'info');
            return;
        }
        if (continuousAutopilotRef.current) {
            setIsAudioAutopilotQueued((prev) => {
                const next = !prev;
                isAudioAutopilotQueuedRef.current = next;
                showToastRef.current(
                    next
                        ? 'Audio Drama Autopilot queued: will run automatically after story autopilot completes.'
                        : 'Audio Drama Autopilot unqueued.',
                    'info'
                );
                return next;
            });
            return;
        }
        setIsAudioAutopilotRunning(true);
    }, [isAudioAutopilotRunning]);

    const generateAndStoreSceneAudioRef = useRef(generateAndStoreSceneAudio);
    generateAndStoreSceneAudioRef.current = generateAndStoreSceneAudio;
    const isStoredSceneAudioFreshRef = useRef(isStoredSceneAudioFresh);
    isStoredSceneAudioFreshRef.current = isStoredSceneAudioFresh;
    const setLoadingRef = useRef(setLoading);
    setLoadingRef.current = setLoading;
    const setLoadingStepRef = useRef(setLoadingStep);
    setLoadingStepRef.current = setLoadingStep;
    const setAudioAutopilotProgressRef = useRef(setAudioAutopilotProgress);
    setAudioAutopilotProgressRef.current = setAudioAutopilotProgress;

    useEffect(() => {
        let cancelled = false;
        if (!isAudioAutopilotRunning) {
            isAudioAutopilotRunningRef.current = false;
            return;
        }
        isAudioAutopilotRunningRef.current = true;
        const abortController = new AbortController();
        audioAutopilotAbortRef.current = abortController;

        const runAudioLoop = async () => {
            showToastRef.current(
                'Audio Drama Autopilot started. Synthesizing scenes scene-by-scene...',
                'info'
            );
            setLoadingRef.current(true);
            const tiers = Array.isArray(TTS_PIPELINE_TIERS) ? TTS_PIPELINE_TIERS : [];
            const currentAudioCfg = audioDramaSettingsRef.current;
            const resolvedTier = tiers.find((t) => t.id === currentAudioCfg?.backend) ||
                tiers[Number(currentAudioCfg?.pipelineTier)] || {
                    shortLabel: 'Hybrid Breeze 2 & Drama-3'
                };
            const backendLabel = resolvedTier.shortLabel || 'Hybrid Breeze 2 & Drama-3';
            let loopWasCompleted = false;
            const win = getWindowGlobals();
            const activeAudioStore = win.audioStore || audioStore;

            try {
                const targetStoryId = storyRef.current?.id;
                const getFreshStory = (): AudioStoryRecord | null =>
                    storyRef.current?.id === targetStoryId ? storyRef.current : null;
                const initialStory = getFreshStory();
                const seqCount = (initialStory?.sequences || []).length;
                let processedScenes = 0;
                let skippedScenes = 0;
                let failedScenes = 0;
                let totalEligibleScenes = 0;

                for (let sIdx = 0; sIdx < seqCount; sIdx++) {
                    const rawScenes =
                        (initialStory?.scenes &&
                            (initialStory.scenes[sIdx] || initialStory.scenes[String(sIdx)])) ||
                        [];
                    const sceneList = Array.isArray(rawScenes) ? rawScenes : [];
                    for (let scIdx = 0; scIdx < sceneList.length; scIdx++) {
                        const sId = `${sIdx}-${scIdx}`;
                        const proseObj = initialStory?.prose?.[sId];
                        const proseText =
                            typeof proseObj === 'object' && proseObj !== null
                                ? String(proseObj.final || proseObj.draft || '')
                                : String(proseObj || '');
                        if (proseText && proseText.trim()) {
                            totalEligibleScenes++;
                        }
                    }
                }

                if (totalEligibleScenes === 0) {
                    showToastRef.current(
                        'No drafted scenes found in story to generate audio for.',
                        'warning'
                    );
                    setIsAudioAutopilotRunning(false);
                    isAudioAutopilotRunningRef.current = false;
                    setLoadingRef.current(false);
                    return;
                }

                setAudioAutopilotProgressRef.current({
                    status: 'running',
                    startedAt: Date.now(),
                    totalEligibleScenes,
                    alreadyCachedScenes: 0,
                    generatedScenes: 0,
                    failedScenes: 0,
                    currentSceneOrder: 0,
                    currentSeqIdx: null,
                    currentSceneIdx: null,
                    currentSeqTitle: null,
                    currentSceneTitle: null,
                    currentSceneLabel: null,
                    activeStageId: 'parsing',
                    stageLabel: 'Scanning Story Scenes',
                    stageMessage: 'Checking cached offline audio...',
                    stagePct: 0,
                    chunkCurrent: null,
                    chunkTotal: null,
                    activeSpeaker: null,
                    backendLabel,
                    lastCompletedScene: null,
                    recentErrors: [],
                    errorSceneIds: []
                });

                interface PendingFinalizeJob {
                    seqIdx: number;
                    sceneIdx: number;
                    sId: string;
                    sceneLabel: string;
                    shortLabel: string;
                    seqTitle: string;
                    sceneTitle: string;
                    promise: Promise<ExportedSceneAudioResult>;
                }

                let pendingFinalize: PendingFinalizeJob | null = null;
                const flushPendingFinalize = async (markAsDone = false): Promise<void> => {
                    if (!pendingFinalize) return;
                    const job = pendingFinalize;
                    pendingFinalize = null;
                    try {
                        const audioRes = await job.promise;
                        processedScenes++;
                        const completedBlobSize =
                            (audioRes?.mp3Blob || audioRes?.blob)?.size || 0;
                        const completedCueCount =
                            (Array.isArray(audioRes?.cueTimeline) &&
                                audioRes.cueTimeline.length) ||
                            audioRes?.totalChunks ||
                            0;
                        setAudioAutopilotProgressRef.current((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      generatedScenes: processedScenes,
                                      ...(markAsDone
                                          ? {
                                                activeStageId: 'done',
                                                stageLabel: 'Scene Audio Mastered',
                                                stageMessage: `Saved ${job.sceneLabel} (${formatAudioDuration(audioRes?.durationSec || 0)})`,
                                                stagePct: 100,
                                                activeSpeaker: null
                                            }
                                          : {}),
                                      lastCompletedScene: {
                                          seqIdx: job.seqIdx,
                                          sceneIdx: job.sceneIdx,
                                          label: job.shortLabel,
                                          seqTitle: job.seqTitle,
                                          sceneTitle: job.sceneTitle,
                                          durationSec: Number(audioRes?.durationSec) || 0,
                                          sizeBytes: completedBlobSize,
                                          cueCount: completedCueCount,
                                          updatedAt: Date.now()
                                      }
                                  }
                                : prev
                        );
                    } catch (finErr) {
                        const errName =
                            finErr && typeof finErr === 'object'
                                ? (finErr as { name?: string }).name
                                : undefined;
                        const errMessage =
                            finErr instanceof Error ? finErr.message : String(finErr);
                        if (errName === 'AbortError' || errMessage === 'Aborted') {
                            return;
                        }
                        failedScenes++;
                        setAudioAutopilotProgressRef.current((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      failedScenes,
                                      errorSceneIds: prev.errorSceneIds.includes(job.sId)
                                          ? prev.errorSceneIds
                                          : [...prev.errorSceneIds, job.sId],
                                      recentErrors: [
                                          {
                                              sceneLabel: job.sceneLabel,
                                              message: errMessage,
                                              timestamp: new Date().toLocaleTimeString()
                                          },
                                          ...(prev.recentErrors || [])
                                      ].slice(0, 6)
                                  }
                                : prev
                        );
                        console.error(
                            `[Audio Autopilot] Error finalizing Scene ${job.seqIdx + 1}.${job.sceneIdx + 1}:`,
                            finErr
                        );
                        if (typeof win.logAudioDramaPipelineStageError === 'function') {
                            win.logAudioDramaPipelineStageError(
                                'audio_autopilot_scene',
                                `Audio Autopilot failed on Scene ${job.seqIdx + 1}.${job.sceneIdx + 1}`,
                                finErr,
                                {
                                    storyId: getFreshStory()?.id,
                                    seqIdx: job.seqIdx,
                                    sceneIdx: job.sceneIdx
                                }
                            );
                        }
                        showToastRef.current(
                            `Audio Autopilot: Scene ${job.seqIdx + 1}.${job.sceneIdx + 1} error: ${errMessage}`,
                            'warning'
                        );
                    }
                };

                const liveSeqCount = (getFreshStory()?.sequences || []).length;
                for (let sIdx = 0; sIdx < liveSeqCount; sIdx++) {
                    if (
                        cancelled ||
                        !isAudioAutopilotRunningRef.current ||
                        abortController.signal.aborted
                    ) {
                        break;
                    }
                    const seqStory = getFreshStory();
                    const seqMetaObj = (seqStory?.sequences?.[sIdx] || {}) as {
                        number?: number | string;
                        title?: string;
                    };
                    const seqNumDisplay = seqMetaObj?.number || sIdx + 1;
                    const seqTitleDisplay = seqMetaObj?.title || `Sequence ${sIdx + 1}`;
                    const rawScenes =
                        (seqStory?.scenes &&
                            (seqStory.scenes[sIdx] || seqStory.scenes[String(sIdx)])) ||
                        [];
                    const sceneList = Array.isArray(rawScenes) ? rawScenes : [];

                    for (let scIdx = 0; scIdx < sceneList.length; scIdx++) {
                        if (
                            cancelled ||
                            !isAudioAutopilotRunningRef.current ||
                            abortController.signal.aborted
                        ) {
                            break;
                        }
                        const liveStory = getFreshStory();
                        const sId = `${sIdx}-${scIdx}`;
                        const proseObj = liveStory?.prose?.[sId];
                        const proseText =
                            typeof proseObj === 'object' && proseObj !== null
                                ? String(proseObj.final || proseObj.draft || '')
                                : String(proseObj || '');

                        if (!proseText || !proseText.trim()) continue;

                        const currentProseHash = computeSceneProseHash(proseText);
                        let existingMeta = null;
                        if (activeAudioStore && liveStory?.id) {
                            try {
                                existingMeta = await activeAudioStore.getSceneAudio(
                                    liveStory.id,
                                    sIdx,
                                    scIdx
                                );
                            } catch (metaErr) {
                                console.warn(
                                    `[Audio Autopilot] Could not read existing audio for Scene ${sIdx + 1}.${scIdx + 1}:`,
                                    metaErr
                                );
                            }
                        }

                        const postCheckStory = getFreshStory();
                        const apFreshness = isStoredSceneAudioFreshRef.current(
                            existingMeta,
                            proseText,
                            postCheckStory,
                            audioDramaSettingsRef.current
                        );
                        if (
                            existingMeta &&
                            existingMeta.textHash === currentProseHash &&
                            apFreshness.fresh
                        ) {
                            skippedScenes++;
                            setAudioAutopilotProgressRef.current((prev) =>
                                prev ? { ...prev, alreadyCachedScenes: skippedScenes } : prev
                            );
                            continue;
                        }

                        const sceneMetaObj = ((postCheckStory?.scenes?.[sIdx] ||
                            postCheckStory?.scenes?.[String(sIdx)] ||
                            sceneList)[scIdx] || {}) as { title?: string };
                        const curSceneTitle = sceneMetaObj?.title || `Scene ${scIdx + 1}`;
                        const curSceneLabel = `Scene ${seqNumDisplay}.${scIdx + 1}`;
                        const curOrder =
                            processedScenes +
                            skippedScenes +
                            failedScenes +
                            (pendingFinalize ? 1 : 0) +
                            1;

                        setAudioAutopilotProgressRef.current((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      currentSceneOrder: curOrder,
                                      currentSeqIdx: sIdx,
                                      currentSceneIdx: scIdx,
                                      currentSeqTitle: seqTitleDisplay,
                                      currentSceneTitle: curSceneTitle,
                                      currentSceneLabel: curSceneLabel,
                                      activeStageId: 'parsing',
                                      stageLabel: 'Script Parsing & Dialogue Cues',
                                      stageMessage: 'Preparing scene script...',
                                      stagePct: 5,
                                      chunkCurrent: null,
                                      chunkTotal: null,
                                      activeSpeaker: null
                                  }
                                : prev
                        );

                        setLoadingStepRef.current(
                            `Audio Autopilot: Generating Scene ${sIdx + 1}.${scIdx + 1} (${curOrder}/${totalEligibleScenes})...`
                        );
                        try {
                            const audioRes = await generateAndStoreSceneAudioRef.current(
                                sIdx,
                                scIdx,
                                {
                                    triggerDownload: false,
                                    forceRegenerate: true,
                                    forceRerender: true,
                                    forceRecalibrate: false,
                                    deferFinalize: true,
                                    signal: abortController.signal,
                                    onProgress: ({
                                        current,
                                        total,
                                        stage,
                                        speaker,
                                        message,
                                        chunkCurrent,
                                        chunkTotal
                                    }) => {
                                        if (cancelled || abortController.signal.aborted) return;
                                        const sceneLabel = `Audio Autopilot [Scene ${sIdx + 1}.${scIdx + 1}]`;
                                        const stageStr = String(stage || '');
                                        const msgStr = message ? String(message) : '';
                                        const speakerStr = speaker ? String(speaker) : '';
                                        const curNum =
                                            typeof current === 'number' ? current : 0;
                                        const totNum = typeof total === 'number' ? total : 0;
                                        const mappedStageId = mapAudioStageToCanonical(
                                            stageStr,
                                            msgStr
                                        );
                                        const stageTitles: Record<string, string> = {
                                            parsing: 'Script Parsing & Dialogue Cues',
                                            casting: 'Voice Casting & Master Anchors',
                                            synthesis: 'Multi-Voice Neural Synthesis',
                                            mastering: 'Studio Mastering & Broadcast Encoding',
                                            archiving: 'Offline Audio Library & Cue Sync',
                                            done: 'Scene Audio Mastered'
                                        };
                                        let computedStagePct = 50;
                                        if (mappedStageId === 'done') computedStagePct = 100;
                                        else if (mappedStageId === 'archiving')
                                            computedStagePct = 95;
                                        else if (mappedStageId === 'mastering')
                                            computedStagePct = 86;
                                        else if (mappedStageId === 'casting')
                                            computedStagePct = 20;
                                        else if (mappedStageId === 'parsing')
                                            computedStagePct = 8;
                                        else if (stageStr === 'synthesizing' && totNum > 0) {
                                            computedStagePct = Math.min(
                                                82,
                                                Math.max(25, Math.round(25 + (curNum / totNum) * 55))
                                            );
                                        } else if (
                                            typeof current === 'number' &&
                                            totNum > 0 &&
                                            curNum <= totNum
                                        ) {
                                            computedStagePct = Math.min(
                                                95,
                                                Math.max(10, Math.round((curNum / totNum) * 100))
                                            );
                                        }

                                        const resolvedChunkCur =
                                            typeof chunkCurrent === 'number'
                                                ? chunkCurrent
                                                : stageStr === 'synthesizing' &&
                                                    typeof current === 'number'
                                                  ? current
                                                  : null;
                                        const resolvedChunkTot =
                                            typeof chunkTotal === 'number'
                                                ? chunkTotal
                                                : stageStr === 'synthesizing' &&
                                                    typeof total === 'number'
                                                  ? total
                                                  : null;

                                        setAudioAutopilotProgressRef.current((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      activeStageId: mappedStageId,
                                                      stageLabel:
                                                          stageTitles[mappedStageId] ||
                                                          'Audio Production',
                                                      stageMessage:
                                                          msgStr ||
                                                          (stageStr === 'synthesizing'
                                                              ? `Synthesizing ${speakerStr || 'voice'} (${curNum}/${totNum})...`
                                                              : stageStr === 'encoding'
                                                                ? 'Encoding 128kbps broadcast MP3...'
                                                                : `${stageStr} (${curNum}/${totNum || 100})`),
                                                      stagePct: computedStagePct,
                                                      chunkCurrent:
                                                          resolvedChunkCur !== null
                                                              ? resolvedChunkCur
                                                              : prev.chunkCurrent,
                                                      chunkTotal:
                                                          resolvedChunkTot !== null
                                                              ? resolvedChunkTot
                                                              : prev.chunkTotal,
                                                      activeSpeaker:
                                                          speakerStr ||
                                                          (mappedStageId === 'synthesis'
                                                              ? prev.activeSpeaker
                                                              : null)
                                                  }
                                                : prev
                                        );

                                        if (stageStr === 'synthesizing') {
                                            setLoadingStepRef.current(
                                                `${sceneLabel}: Synthesizing ${speakerStr || 'audio'} (${curNum}/${totNum})...`
                                            );
                                        } else if (stageStr === 'encoding') {
                                            setLoadingStepRef.current(
                                                `${sceneLabel}: Encoding 128kbps master MP3...`
                                            );
                                        } else if (
                                            stageStr === 'rendering' ||
                                            stageStr === 'parsing_turns' ||
                                            stageStr === 'voice_tournaments' ||
                                            stageStr === 'chunk_synthesis' ||
                                            stageStr === 'audiomastering' ||
                                            stageStr === 'audio_mastering' ||
                                            stageStr === 'saving' ||
                                            stageStr === 'done'
                                        ) {
                                            setLoadingStepRef.current(
                                                `${sceneLabel}: ${msgStr || `${stageStr} (${curNum}/${totNum || 100})`}`
                                            );
                                        }
                                    }
                                }
                            );
                            await flushPendingFinalize(false);
                            const finalizeJob: PendingFinalizeJob = {
                                seqIdx: sIdx,
                                sceneIdx: scIdx,
                                sId,
                                sceneLabel: curSceneLabel,
                                shortLabel: `${seqNumDisplay}.${scIdx + 1}`,
                                seqTitle: seqTitleDisplay,
                                sceneTitle: curSceneTitle,
                                promise:
                                    'finalize' in audioRes &&
                                    typeof audioRes.finalize === 'function'
                                        ? audioRes.finalize()
                                        : Promise.resolve(audioRes as ExportedSceneAudioResult)
                            };
                            pendingFinalize = finalizeJob;
                            if (!('finalize' in audioRes)) {
                                await flushPendingFinalize(false);
                            }
                        } catch (sceneErr) {
                            const errName =
                                sceneErr && typeof sceneErr === 'object'
                                    ? (sceneErr as { name?: string }).name
                                    : undefined;
                            const errMessage =
                                sceneErr instanceof Error ? sceneErr.message : String(sceneErr);
                            if (
                                cancelled ||
                                abortController.signal.aborted ||
                                errName === 'AbortError' ||
                                errMessage === 'Aborted'
                            ) {
                                break;
                            }
                            failedScenes++;
                            setAudioAutopilotProgressRef.current((prev) =>
                                prev
                                    ? {
                                          ...prev,
                                          failedScenes,
                                          errorSceneIds: prev.errorSceneIds.includes(sId)
                                              ? prev.errorSceneIds
                                              : [...prev.errorSceneIds, sId],
                                          recentErrors: [
                                              {
                                                  sceneLabel: curSceneLabel,
                                                  message: errMessage,
                                                  timestamp: new Date().toLocaleTimeString()
                                              },
                                              ...(prev.recentErrors || [])
                                          ].slice(0, 6)
                                      }
                                    : prev
                            );
                            console.error(
                                `[Audio Autopilot] Error in Scene ${sIdx + 1}.${scIdx + 1}:`,
                                sceneErr
                            );
                            if (typeof win.logAudioDramaPipelineStageError === 'function') {
                                win.logAudioDramaPipelineStageError(
                                    'audio_autopilot_scene',
                                    `Audio Autopilot failed on Scene ${sIdx + 1}.${scIdx + 1}`,
                                    sceneErr,
                                    {
                                        storyId: getFreshStory()?.id,
                                        seqIdx: sIdx,
                                        sceneIdx: scIdx
                                    }
                                );
                            }
                            showToastRef.current(
                                `Audio Autopilot: Scene ${sIdx + 1}.${scIdx + 1} error: ${errMessage}`,
                                'warning'
                            );
                        }
                    }
                }

                await flushPendingFinalize(true);

                if (
                    !cancelled &&
                    isAudioAutopilotRunningRef.current &&
                    !abortController.signal.aborted
                ) {
                    loopWasCompleted = true;
                    if (failedScenes > 0) {
                        showToastRef.current(
                            `Audio Drama Autopilot finished with ${failedScenes} error(s): ${processedScenes} saved, ${skippedScenes} previously cached.`,
                            'warning'
                        );
                    } else {
                        showToastRef.current(
                            `🎉 Audio Drama Autopilot Complete! Generated ${processedScenes} scene MP3s (${skippedScenes} previously cached).`,
                            'success'
                        );
                    }
                }
            } catch (loopErr) {
                const errName =
                    loopErr && typeof loopErr === 'object'
                        ? (loopErr as { name?: string }).name
                        : undefined;
                const errMessage = loopErr instanceof Error ? loopErr.message : String(loopErr);
                if (
                    !(
                        cancelled ||
                        abortController.signal.aborted ||
                        errName === 'AbortError' ||
                        errMessage === 'Aborted'
                    )
                ) {
                    console.error('[Audio Autopilot] Loop error:', loopErr);
                    if (typeof win.logAudioDramaPipelineStageError === 'function') {
                        win.logAudioDramaPipelineStageError(
                            'audio_autopilot_loop',
                            'Audio Drama Autopilot halted',
                            loopErr
                        );
                    }
                    showToastRef.current(`Audio Autopilot halted: ${errMessage}`, 'error');
                }
            } finally {
                if (audioAutopilotAbortRef.current === abortController) {
                    audioAutopilotAbortRef.current = null;
                }
                setAudioAutopilotProgressRef.current((prev) =>
                    prev
                        ? {
                              ...prev,
                              status: loopWasCompleted ? 'complete' : 'paused',
                              activeSpeaker: null
                          }
                        : prev
                );
                setIsAudioAutopilotRunning(false);
                isAudioAutopilotRunningRef.current = false;
                setLoadingRef.current(false);
                setLoadingStepRef.current('');
            }
        };

        void runAudioLoop();

        return () => {
            cancelled = true;
            isAudioAutopilotRunningRef.current = false;
            try {
                abortController.abort();
            } catch {
                // Ignore abort failures
            }
            if (audioAutopilotAbortRef.current === abortController) {
                audioAutopilotAbortRef.current = null;
            }
        };
    }, [isAudioAutopilotRunning, storyRef, audioDramaSettingsRef]);

    return {
        availableSceneAudioMap,
        setAvailableSceneAudioMap,
        availableSceneAudioMapRef,
        availableSequenceAudioMap,
        setAvailableSequenceAudioMap,
        refreshAvailableSceneAudio,
        getSceneProseText,
        isStoredSceneAudioFresh,
        getSceneAudioStatus,
        storyAudioSummary,
        isExportingSceneAudio,
        isExportingSequenceAudio,
        isExportingStoryAudio,
        isRegeneratingSceneAudio,
        isAudioAutopilotRunning,
        setIsAudioAutopilotRunning,
        isAudioAutopilotRunningRef,
        isAudioAutopilotQueued,
        setIsAudioAutopilotQueued,
        isAudioAutopilotQueuedRef,
        generateAndStoreSceneAudio,
        handleDownloadSceneAudio,
        handleRegenerateSceneAudio,
        handleDownloadSequenceAudio,
        handleDownloadStoryAudio,
        clearStoryTtsArtifacts,
        handleToggleAudioAutopilot
    };
}
