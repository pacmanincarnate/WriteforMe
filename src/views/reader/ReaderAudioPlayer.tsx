/**
 * @module views/reader/ReaderAudioPlayer
 * Floating unified Novel & Audio Drama mini-player inside ReaderView,
 * including scene-jump popover, timeline scrubber, speed cycle, and error recovery card.
 */

import type React from 'react';
import { useState } from 'react';
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Headphones,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Settings,
    SkipBack,
    SkipForward,
    SlidersHorizontal,
    Volume2,
    X
} from '@/components/icons';
import { KOKORO_VOICE_GROUPS } from '@/config';
import { getHumanReadableTtsError } from '@/domain/audio';
import { formatPlaybackTime } from './measureReaderPages';
import type {
    ReaderPlaySceneAudioFn,
    ReaderPlayStoredOrLiveFn,
    ReaderPlayingSceneRef,
    ReaderResolvedAudioSource,
    ReaderSceneAudioStatusResult,
    ReaderSceneEntry,
    ReaderSettings,
    ReaderTtsErrorObject,
    ReaderTtsQueueChunk
} from './types';

export interface ReaderAudioPlayerProps {
    isReaderHudVisible: boolean;
    story?: { writing_mode?: string } | null;
    activeChapterIdx: number;
    selectedScene: number | null;
    currentReaderSceneItem?: ReaderSceneEntry | null;
    flatStoryScenes?: ReaderSceneEntry[];
    readerSettings: ReaderSettings;
    updateReaderSetting: (key: string, val: unknown) => void;
    playbackSpeed: number;
    ttsStatus: string;
    ttsProgress: number;
    ttsStatusMessage?: string;
    ttsError?: string | ReaderTtsErrorObject | null;
    setTtsError?: (err: string | ReaderTtsErrorObject | null) => void;
    ttsQueue: ReaderTtsQueueChunk[];
    ttsCurrentChunkIndex: number;
    ttsCurrentTime: number;
    ttsDuration: number;
    setTtsCurrentTime?: (t: number) => void;
    ttsGeneratingElapsedSec?: number;
    toggleTtsPlayPause: (proseOverride?: string | null) => void;
    stopTtsPlayback: () => void;
    skipTtsChunk: (delta: number) => void;
    showToast?: (message: string, type?: string) => void;
    changeTtsVoice?: (voiceId: string) => void;
    audioDramaSettings?: {
        pipelineTier?: number;
        backend?: string;
        [key: string]: unknown;
    } | null;
    updateAudioDramaSetting?: (key: string, val: unknown) => void;
    audioDramaActiveSpeaker?: string | null;
    requestChunkAudio?: (chunkIdx: number, directQueue?: null, forceAutoPlay?: boolean) => void;
    setView: (view: string) => void;
    setSettingsTab?: (tab: string) => void;
    availableSceneAudioMap?: Record<string, unknown>;
    playStoredOrLiveSceneAudio?: ReaderPlayStoredOrLiveFn;
    playSceneAudio?: ReaderPlaySceneAudioFn;
    jumpToReaderScene?: (seqIdx: number, sceneIdx: number) => void;
    ttsPlayingScene?: ReaderPlayingSceneRef | null;
    ttsResolvedSource?: ReaderResolvedAudioSource | null;
    isFollowingAudio?: boolean;
    returnToActiveAudio?: () => void;
    skipAudioScene?: (delta: number) => void;
    getSceneAudioStatus?: (seqIdx: number, sceneIdx: number) => ReaderSceneAudioStatusResult;
    isPlayingMasterSceneMp3?: boolean;
    ttsAudioRef?: React.RefObject<HTMLAudioElement>;
    isAuditioningVoice?: boolean;
    stopAllAudioPlayback?: () => void;
}

export function ReaderAudioPlayer({
    isReaderHudVisible,
    story,
    activeChapterIdx,
    selectedScene,
    currentReaderSceneItem,
    flatStoryScenes = [],
    readerSettings,
    updateReaderSetting,
    playbackSpeed,
    ttsStatus,
    ttsProgress,
    ttsStatusMessage,
    ttsError,
    setTtsError,
    ttsQueue,
    ttsCurrentChunkIndex,
    ttsCurrentTime,
    ttsDuration,
    setTtsCurrentTime,
    ttsGeneratingElapsedSec = 0,
    toggleTtsPlayPause,
    stopTtsPlayback,
    skipTtsChunk,
    showToast,
    changeTtsVoice,
    audioDramaSettings,
    updateAudioDramaSetting,
    audioDramaActiveSpeaker,
    requestChunkAudio,
    setView,
    setSettingsTab,
    availableSceneAudioMap = {},
    playStoredOrLiveSceneAudio,
    playSceneAudio,
    jumpToReaderScene,
    ttsPlayingScene,
    ttsResolvedSource,
    isFollowingAudio = true,
    returnToActiveAudio,
    skipAudioScene,
    getSceneAudioStatus,
    isPlayingMasterSceneMp3 = false,
    ttsAudioRef,
    isAuditioningVoice = false,
    stopAllAudioPlayback
}: ReaderAudioPlayerProps) {
    const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);

    const activeQueueItem = ttsQueue[ttsCurrentChunkIndex] || null;
    const playingSeq = ttsPlayingScene?.seqIdx ?? activeChapterIdx;
    const playingScIdx = ttsPlayingScene?.sceneIdx ?? (selectedScene || 0);
    const playableScenes = (flatStoryScenes || []).filter((sc) => sc.hasProse);
    const playingPlayableIdx = playableScenes.findIndex(
        (sc) => sc.seqIdx === playingSeq && sc.sceneIdx === playingScIdx
    );
    const playingFlatIdx = (flatStoryScenes || []).findIndex(
        (sc) => sc.seqIdx === playingSeq && sc.sceneIdx === playingScIdx
    );
    const playingSceneObj = (flatStoryScenes || [])[playingFlatIdx] || currentReaderSceneItem;
    const playingTitle =
        playingSceneObj?.scene?.title || `Chapter ${playingSeq + 1} · Scene ${playingScIdx + 1}`;

    const isBusy =
        ttsStatus === 'loading-library' ||
        ttsStatus === 'loading-model' ||
        ttsStatus === 'generating';
    const isStoredAudio = isPlayingMasterSceneMp3 || ttsResolvedSource?.mode === 'stored';
    const tierIdx = ttsResolvedSource?.tier ?? (audioDramaSettings?.pipelineTier ?? 3);
    const defaultTierLabel =
        tierIdx === 3
            ? 'Drama-3'
            : tierIdx === 2
              ? 'Breeze 2'
              : tierIdx === 1
                ? 'Kokoro'
                : 'Device Voice';
    const engineLabel = ttsResolvedSource?.engineLabel || defaultTierLabel;
    const activeSpeaker =
        activeQueueItem?.speaker ||
        (audioDramaActiveSpeaker && audioDramaActiveSpeaker !== 'Narrator'
            ? audioDramaActiveSpeaker
            : null);

    const statusSubtitle =
        ttsStatus === 'loading-library' || ttsStatus === 'loading-model'
            ? ttsStatusMessage || `Loading voice model · ${ttsProgress}%`
            : ttsStatus === 'generating'
              ? `Generating audio${ttsGeneratingElapsedSec > 0 ? ` · ${ttsGeneratingElapsedSec}s` : '...'}`
              : isStoredAudio
                ? `Saved Audio · ${formatPlaybackTime(ttsCurrentTime)} / ${formatPlaybackTime(ttsDuration)}`
                : `Live · ${engineLabel}${activeSpeaker ? ` · ${activeSpeaker}` : ''}${
                      ttsDuration > 0
                          ? ` · ${formatPlaybackTime(ttsCurrentTime)} / ${formatPlaybackTime(ttsDuration)}`
                          : ttsQueue.length > 1
                            ? ` · ${ttsCurrentChunkIndex + 1}/${ttsQueue.length}`
                            : ''
                  }`;

    const jumpToRelativeScene = (delta: number) => {
        if (skipAudioScene) {
            skipAudioScene(delta);
            return;
        }
        if (!playableScenes.length) return;
        const baseIdx = playingPlayableIdx >= 0 ? playingPlayableIdx : 0;
        const target = playableScenes[baseIdx + delta];
        if (!target) return;
        if (playSceneAudio) {
            playSceneAudio(target.seqIdx, target.sceneIdx, { autoplay: true, follow: true });
        } else if (playStoredOrLiveSceneAudio) {
            jumpToReaderScene?.(target.seqIdx, target.sceneIdx);
            playStoredOrLiveSceneAudio(target.seqIdx, target.sceneIdx, 'story');
        }
    };

    const hasPrevScene = playingPlayableIdx > 0;
    const hasNextScene =
        playingPlayableIdx >= 0
            ? playingPlayableIdx < playableScenes.length - 1
            : playableScenes.some(
                  (sc) =>
                      sc.seqIdx > playingSeq ||
                      (sc.seqIdx === playingSeq && sc.sceneIdx > playingScIdx)
              );

    return (
        <div
            className={`reader-tts-floating-bar rounded-2xl p-2.5 sm:px-3.5 sm:py-2.5 shadow-xl space-y-2 animate-fade-in ${
                !isReaderHudVisible ? 'opacity-95 hover:opacity-100' : ''
            }`}
            onClick={(e) => e.stopPropagation()}
        >
            {isAudioSettingsOpen && (
                <div className="pb-2.5 mb-1 border-b reader-ui-border text-xs space-y-2.5 max-h-[52vh] overflow-y-auto animate-fade-in">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-500">
                            Jump &amp; Fast-Forward
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsAudioSettingsOpen(false)}
                            className="text-ink-400 hover:text-ink-800 p-1 rounded-lg cursor-pointer"
                            aria-label="Close playback popover"
                        >
                            <X size={13} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 bg-wash p-1 rounded-xl border reader-ui-border">
                        <button
                            type="button"
                            onClick={() => jumpToRelativeScene(-1)}
                            disabled={!hasPrevScene}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 bg-surface border reader-ui-border hover:bg-lift disabled:opacity-35 cursor-pointer transition-colors"
                            title="Play previous scene"
                        >
                            <SkipBack size={12} />
                            <span>Prev Scene</span>
                        </button>
                        <span className="text-[10px] font-mono font-bold text-ink-600 px-1.5 truncate">
                            {playingPlayableIdx >= 0
                                ? `Scene ${playingPlayableIdx + 1} of ${playableScenes.length}`
                                : `${playableScenes.length} Scenes`}
                        </span>
                        <button
                            type="button"
                            onClick={() => jumpToRelativeScene(1)}
                            disabled={!hasNextScene}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 bg-surface border reader-ui-border hover:bg-lift disabled:opacity-35 cursor-pointer transition-colors"
                            title="Fast-forward to next scene"
                        >
                            <span>Next Scene</span>
                            <SkipForward size={12} />
                        </button>
                    </div>

                    {playableScenes.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-xl border reader-ui-border bg-wash/70 divide-y divide-edge/50">
                            {playableScenes.map((sc) => {
                                const isCurrent =
                                    sc.seqIdx === playingSeq && sc.sceneIdx === playingScIdx;
                                const scAudioState = getSceneAudioStatus
                                    ? getSceneAudioStatus(sc.seqIdx, sc.sceneIdx)
                                    : {
                                          status: availableSceneAudioMap?.[
                                              `${sc.seqIdx}-${sc.sceneIdx}`
                                          ]
                                              ? 'ready'
                                              : 'none'
                                      };
                                return (
                                    <button
                                        key={`jump-${sc.seqIdx}-${sc.sceneIdx}`}
                                        type="button"
                                        onClick={() => {
                                            setIsAudioSettingsOpen(false);
                                            if (playSceneAudio) {
                                                playSceneAudio(sc.seqIdx, sc.sceneIdx, {
                                                    autoplay: true,
                                                    follow: true
                                                });
                                            } else if (playStoredOrLiveSceneAudio) {
                                                jumpToReaderScene?.(sc.seqIdx, sc.sceneIdx);
                                                playStoredOrLiveSceneAudio(
                                                    sc.seqIdx,
                                                    sc.sceneIdx,
                                                    'story'
                                                );
                                            }
                                        }}
                                        className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-[11px] transition-colors cursor-pointer ${
                                            isCurrent
                                                ? 'bg-gold-tint text-gold-ink font-bold'
                                                : 'hover:bg-surface/80 text-ink-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span
                                                className={`w-2 h-2 rounded-full shrink-0 ${
                                                    scAudioState.status === 'ready'
                                                        ? 'bg-emerald-500'
                                                        : scAudioState.status === 'stale'
                                                          ? 'bg-amber-500'
                                                          : 'border border-ink-400/50'
                                                }`}
                                                title={
                                                    scAudioState.status === 'ready'
                                                        ? 'Saved offline audio'
                                                        : scAudioState.status === 'stale'
                                                          ? 'Audio outdated'
                                                          : 'Live narration'
                                                }
                                            />
                                            <span className="font-mono text-[10px] opacity-65 shrink-0">
                                                Ch {sc.seqIdx + 1}.{sc.sceneIdx + 1}
                                            </span>
                                            <span className="truncate">
                                                {sc.scene?.title || `Scene ${sc.sceneIdx + 1}`}
                                            </span>
                                        </div>
                                        {isCurrent && (
                                            <span className="text-[9.5px] font-mono uppercase tracking-wider text-gold-ink shrink-0">
                                                Playing
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium text-ink-700">
                            <input
                                type="checkbox"
                                checked={readerSettings.ttsAutoFollow !== false}
                                onChange={() =>
                                    updateReaderSetting(
                                        'ttsAutoFollow',
                                        readerSettings.ttsAutoFollow === false
                                    )
                                }
                                className="rounded accent-gold cursor-pointer"
                            />
                            <span>Auto-turn pages</span>
                        </label>

                        <button
                            type="button"
                            onClick={() => {
                                setIsAudioSettingsOpen(false);
                                setView('settings');
                                if (setSettingsTab) setSettingsTab('audio_drama');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-surface hover:bg-lift border reader-ui-border text-[11px] font-semibold text-ink-700 flex items-center gap-1.5 cursor-pointer"
                        >
                            <Settings size={11} className="text-gold-ink" />
                            <span>Audio Settings…</span>
                        </button>
                    </div>

                    {tierIdx === 1 && story?.writing_mode !== 'audio_drama' && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono font-bold uppercase text-ink-400 block">
                                Kokoro Narrator Voice
                            </label>
                            <select
                                value={
                                    !readerSettings.ttsVoice ||
                                    readerSettings.ttsVoice === 'system_native'
                                        ? 'af_heart'
                                        : readerSettings.ttsVoice
                                }
                                onChange={(e) =>
                                    changeTtsVoice
                                        ? changeTtsVoice(e.target.value)
                                        : updateReaderSetting('ttsVoice', e.target.value)
                                }
                                className="w-full bg-surface border reader-ui-border rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-serif outline-none cursor-pointer"
                                aria-label="Kokoro Narrator Voice"
                            >
                                {KOKORO_VOICE_GROUPS.map((grp) => {
                                    const kokoroVoices = (grp.voices || []).filter(
                                        (v) => v.id !== 'system_native'
                                    );
                                    if (kokoroVoices.length === 0) return null;
                                    return (
                                        <optgroup key={grp.label} label={grp.label}>
                                            {kokoroVoices.map((v) => (
                                                <option key={v.id} value={v.id}>
                                                    {v.name}
                                                </option>
                                            ))}
                                        </optgroup>
                                    );
                                })}
                            </select>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => jumpToRelativeScene(-1)}
                        disabled={!hasPrevScene}
                        className="p-1.5 rounded-lg hover:bg-wash active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
                        title="Previous Scene"
                    >
                        <SkipBack size={14} />
                    </button>

                    {isStoredAudio ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (ttsAudioRef?.current) {
                                    const nextT = Math.max(
                                        0,
                                        (ttsAudioRef.current.currentTime || 0) - 15
                                    );
                                    ttsAudioRef.current.currentTime = nextT;
                                    if (setTtsCurrentTime) setTtsCurrentTime(nextT);
                                }
                            }}
                            className="p-1.5 rounded-lg hover:bg-wash active:scale-95 transition-all cursor-pointer"
                            title="Rewind 15s"
                        >
                            <RotateCcw size={13} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => skipTtsChunk(-1)}
                            disabled={ttsCurrentChunkIndex === 0}
                            className="p-1.5 rounded-lg hover:bg-wash active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
                            title="Previous Line"
                        >
                            <ChevronLeft size={14} />
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            isAuditioningVoice && stopAllAudioPlayback
                                ? stopAllAudioPlayback()
                                : toggleTtsPlayPause()
                        }
                        className="w-8 h-8 rounded-full bg-gold text-white flex items-center justify-center shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer mx-0.5"
                        title={
                            ttsStatus === 'playing'
                                ? 'Pause'
                                : isBusy || isAuditioningVoice
                                  ? 'Stop'
                                  : 'Play'
                        }
                    >
                        {isBusy ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : ttsStatus === 'playing' ? (
                            <Pause size={15} />
                        ) : (
                            <Play size={15} className="ml-0.5" />
                        )}
                    </button>

                    {isStoredAudio ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (ttsAudioRef?.current) {
                                    const durLimit =
                                        Number.isFinite(ttsDuration) && ttsDuration > 0
                                            ? ttsDuration
                                            : 99999;
                                    const nextT = Math.min(
                                        durLimit,
                                        (ttsAudioRef.current.currentTime || 0) + 15
                                    );
                                    ttsAudioRef.current.currentTime = nextT;
                                    if (setTtsCurrentTime) setTtsCurrentTime(nextT);
                                }
                            }}
                            className="p-1.5 rounded-lg hover:bg-wash active:scale-95 transition-all cursor-pointer"
                            title="Forward 15s"
                        >
                            <RotateCw size={13} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => skipTtsChunk(1)}
                            disabled={!ttsQueue.length || ttsCurrentChunkIndex >= ttsQueue.length - 1}
                            className="p-1.5 rounded-lg hover:bg-wash active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
                            title="Next Line"
                        >
                            <ChevronRight size={14} />
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => jumpToRelativeScene(1)}
                        disabled={!hasNextScene}
                        className="p-1.5 rounded-lg hover:bg-wash active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
                        title="Next Scene (Fast-Forward)"
                    >
                        <SkipForward size={14} />
                    </button>
                </div>

                <div className="flex-1 min-w-0 px-1 sm:px-2 text-center">
                    <div className="text-[11px] font-serif font-semibold truncate flex items-center justify-center gap-1.5">
                        <span className="truncate">{playingTitle}</span>
                        {ttsStatus === 'playing' && (
                            <span
                                className="inline-flex items-center gap-0.5 text-gold-ink shrink-0"
                                aria-hidden="true"
                            >
                                <span className="reader-tts-wave-bar" />
                                <span className="reader-tts-wave-bar" />
                                <span className="reader-tts-wave-bar" />
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] font-mono opacity-65 truncate">{statusSubtitle}</div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {!isFollowingAudio && returnToActiveAudio && (
                        <button
                            type="button"
                            onClick={returnToActiveAudio}
                            className="px-2 py-1 rounded-full bg-gold-tint hover:bg-gold-tint/80 border border-gold-edge text-[10.5px] font-mono font-bold text-gold-ink flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                            title="Jump back to currently spoken passage"
                        >
                            <Headphones size={11} />
                            <span className="hidden sm:inline">Return to audio</span>
                            <span className="sm:hidden">Sync</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            const speeds = [1.0, 1.25, 1.5, 0.8];
                            const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                            const nextSpeed = speeds[nextIdx];
                            updateReaderSetting('ttsSpeed', nextSpeed);
                            if (showToast) showToast(`Playback speed: ${nextSpeed}×`, 'info');
                        }}
                        className="px-2 py-1 rounded-xl bg-wash hover:bg-wash-strong border reader-ui-border text-[11px] font-mono font-bold text-ink-800 transition-colors cursor-pointer"
                        title="Cycle playback speed"
                    >
                        {playbackSpeed}×
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsAudioSettingsOpen((prev) => !prev)}
                        aria-expanded={isAudioSettingsOpen}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                            isAudioSettingsOpen
                                ? 'bg-gold-tint border-gold-edge text-gold-ink font-bold'
                                : 'hover:bg-wash border-transparent text-ink-500 hover:text-ink-800'
                        }`}
                        title="Jump to scene & audio controls"
                    >
                        <SlidersHorizontal size={14} />
                    </button>

                    <button
                        type="button"
                        onClick={stopTtsPlayback}
                        className="p-1.5 rounded-lg hover:bg-wash text-ink-400 hover:text-ink-800 transition-colors cursor-pointer"
                        title="Close Audio Player"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {isStoredAudio && Number.isFinite(ttsDuration) && ttsDuration > 0 ? (
                <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-mono opacity-60 w-8 text-right shrink-0">
                        {formatPlaybackTime(ttsCurrentTime)}
                    </span>
                    <input
                        type="range"
                        min={0}
                        max={ttsDuration}
                        value={Math.min(
                            ttsDuration,
                            Number.isFinite(ttsCurrentTime) ? ttsCurrentTime : 0
                        )}
                        step="0.5"
                        onChange={(e) => {
                            const val = Number(e.target.value);
                            if (ttsAudioRef?.current) {
                                ttsAudioRef.current.currentTime = val;
                            }
                            if (setTtsCurrentTime) setTtsCurrentTime(val);
                        }}
                        className="flex-1 h-1 bg-wash rounded cursor-pointer accent-gold"
                        title="Scrub audio timeline"
                        aria-label="Audio scrubber"
                    />
                    <span className="text-[9.5px] font-mono opacity-60 w-8 shrink-0">
                        {formatPlaybackTime(ttsDuration)}
                    </span>
                </div>
            ) : ttsStatus === 'generating' ? (
                <div className="w-full bg-wash h-1 rounded-full overflow-hidden">
                    <div className="h-full bg-gold/80 animate-pulse w-1/3 rounded-full" />
                </div>
            ) : ttsQueue.length > 0 ? (
                <div className="w-full bg-wash h-1 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gold transition-all duration-150"
                        style={{
                            width: `${Math.min(100, ((ttsCurrentChunkIndex + 1) / ttsQueue.length) * 100)}%`
                        }}
                    />
                </div>
            ) : null}

            {ttsError &&
                (() => {
                    const errObj: ReaderTtsErrorObject =
                        typeof ttsError === 'object' && ttsError !== null
                            ? ttsError
                            : getHumanReadableTtsError(
                                  ttsError,
                                  audioDramaSettings?.backend || 'audiocpp'
                              );

                    return (
                        <div className="bg-amber-500/10 border border-amber-500/30 text-ink-900 p-2.5 rounded-xl text-left space-y-2 animate-fade-in shadow-xs">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <AlertCircle size={15} className="text-amber-600 shrink-0" />
                                    <span className="text-xs font-bold font-serif text-ink-900 truncate">
                                        {errObj.title}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (setTtsError) setTtsError(null);
                                    }}
                                    className="text-ink-400 hover:text-ink-700 p-0.5 rounded cursor-pointer transition-colors"
                                    title="Dismiss"
                                    aria-label="Dismiss error notice"
                                >
                                    <X size={13} />
                                </button>
                            </div>

                            <p className="text-[11px] text-ink-600 leading-relaxed font-sans">
                                {errObj.message}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {errObj.suggestedAction === 'switch_to_browser' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (updateAudioDramaSetting)
                                                updateAudioDramaSetting('pipelineTier', 1);
                                            if (setTtsError) setTtsError(null);
                                            if (showToast)
                                                showToast('Switched to Kokoro neural voice', 'info');
                                            if (playSceneAudio)
                                                playSceneAudio(playingSeq, playingScIdx, {
                                                    autoplay: true
                                                });
                                            else if (requestChunkAudio)
                                                requestChunkAudio(ttsCurrentChunkIndex, null, true);
                                        }}
                                        className="px-2.5 py-1 bg-gold text-white text-[11px] font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                    >
                                        <Volume2 size={12} /> {errObj.actionLabel || 'Use Kokoro Voice'}
                                    </button>
                                )}

                                {errObj.suggestedAction === 'switch_to_system' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (updateAudioDramaSetting)
                                                updateAudioDramaSetting('pipelineTier', 0);
                                            if (setTtsError) setTtsError(null);
                                            if (showToast)
                                                showToast('Switched to device native voice', 'info');
                                            if (playSceneAudio)
                                                playSceneAudio(playingSeq, playingScIdx, {
                                                    autoplay: true
                                                });
                                        }}
                                        className="px-2.5 py-1 bg-gold text-white text-[11px] font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                    >
                                        <Volume2 size={12} /> {errObj.actionLabel || 'Use Device Voice'}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (setTtsError) setTtsError(null);
                                        if (skipTtsChunk && ttsQueue.length > 1) skipTtsChunk(1);
                                        else jumpToRelativeScene(1);
                                    }}
                                    className="px-2.5 py-1 bg-surface border border-edge-strong hover:bg-wash text-ink-700 text-[11px] font-semibold rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                                    title="Skip forward"
                                >
                                    <SkipForward size={12} /> Skip
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (setTtsError) setTtsError(null);
                                        if (requestChunkAudio && ttsQueue.length > 0)
                                            requestChunkAudio(ttsCurrentChunkIndex, null, true);
                                        else if (playSceneAudio)
                                            playSceneAudio(playingSeq, playingScIdx, {
                                                autoplay: true
                                            });
                                    }}
                                    className="px-2.5 py-1 bg-surface border border-edge-strong hover:bg-wash text-ink-700 text-[11px] font-semibold rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                                    title="Try again"
                                >
                                    <RefreshCw size={12} /> Try Again
                                </button>

                                {errObj.allowSettings && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (setTtsError) setTtsError(null);
                                            setView('settings');
                                            if (setSettingsTab) setSettingsTab('audio_drama');
                                        }}
                                        className="px-2 py-1 text-ink-500 hover:text-ink-800 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ml-auto"
                                    >
                                        <Settings size={12} /> Audio Settings
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}
        </div>
    );
}
