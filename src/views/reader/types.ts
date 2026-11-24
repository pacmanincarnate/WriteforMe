/**
 * @module views/reader/types
 * Strictly typed interfaces shared across ReaderView and its sub-components
 * (audio mini-player, Table of Contents drawer, and appearance drawer).
 */

import type React from 'react';
import type { AudioStoryLike, DramaTurnLike } from '@/domain/audio';

export interface ReaderSettings {
    readerTheme: 'light' | 'sepia' | 'dark' | 'oled' | string;
    readingMode: 'paginated' | 'scroll' | string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    contentWidth: 'compact' | 'standard' | 'wide' | 'full' | string;
    textAlign: 'left' | 'justify' | string;
    paragraphStyle?: 'indented' | 'block' | string;
    ttsSpeed?: number;
    ttsAutoFollow?: boolean;
    ttsVoice?: string;
    [key: string]: unknown;
}

export interface ReaderSceneEntry {
    sceneKey: string;
    seqIdx: number;
    sceneIdx: number;
    hasProse?: boolean;
    proseText?: string;
    title?: string;
    wordCount: number;
    scene?: {
        title?: string;
        [key: string]: unknown;
    } | null;
}

export interface ReaderChapterEntry {
    chapterIndex: number;
    chapterNumber: number | string;
    seqIdx: number;
    title: string;
    summary?: string;
    hasAnyProse?: boolean;
    totalWords: number;
    totalReadingTime?: number;
    scenes: ReaderSceneEntry[];
}

export interface ReaderTtsQueueChunk {
    text?: string;
    speaker?: string;
    seqIdx?: number;
    sceneIdx?: number;
    turns?: DramaTurnLike[];
    [key: string]: unknown;
}

export interface ReaderProgressState {
    completedScenes?: Record<string, boolean>;
    [key: string]: unknown;
}

export interface ReaderPlayingSceneRef {
    seqIdx?: number;
    sceneIdx?: number;
}

export interface ReaderResolvedAudioSource {
    mode?: string;
    tier?: number;
    engineLabel?: string;
}

export interface ReaderSceneAudioStatusResult {
    status: string;
}

export interface ReaderTtsErrorObject {
    title: string;
    message: string;
    suggestedAction?: string;
    actionLabel?: string;
    allowSettings?: boolean;
}

export type ReaderPlayStoredOrLiveFn = (
    seqIdx: number,
    sceneIdx: number,
    scopeOrOpts?: string | { enterReader?: boolean; syncView?: boolean }
) => void;

export type ReaderPlaySceneAudioFn = (
    seqIdx: number,
    sceneIdx: number,
    opts?: { autoplay?: boolean; follow?: boolean }
) => void;

export interface ReaderViewProps {
    story: AudioStoryLike & { title?: string; writing_mode?: string };
    selectedSequence: number | null;
    selectedScene: number | null;
    currentReaderSceneItem?: ReaderSceneEntry | null;
    flatStoryScenes?: ReaderSceneEntry[];
    currentFlatSceneIndex?: number;
    storyChapters?: ReaderChapterEntry[];
    currentChapterIndex?: number;
    currentChapter?: ReaderChapterEntry | null;
    visibleScrollChapter?: number;
    setVisibleScrollChapter?: (seqIdx: number) => void;
    jumpToReaderChapter: (
        chapterIdx: number,
        initialPage?: number,
        dir?: string,
        isProgrammatic?: boolean
    ) => void;
    goToNextReaderChapter: () => void;
    goToPrevReaderChapter?: () => void;
    readerSettings: ReaderSettings;
    updateReaderSetting: (key: string, val: unknown) => void;
    readerPageIndex: number;
    readerPageIndexRef?: React.MutableRefObject<number>;
    readerTotalPages: number;
    readerContainerWidth: number;
    readingProgress: ReaderProgressState;
    saveReadingProgress: (
        seqIdx: number,
        sceneIdx: number,
        pageIdx?: number,
        scrollRatio?: number
    ) => void;
    isReaderHudVisible: boolean;
    toggleReaderHud: (forceState?: boolean) => void;
    resetReaderHudTimer?: () => void;
    isTocOpen: boolean;
    setIsTocOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isAppearanceOpen: boolean;
    setIsAppearanceOpen: React.Dispatch<React.SetStateAction<boolean>>;
    tocSearchQuery: string;
    setTocSearchQuery: (query: string) => void;
    isFullscreen: boolean;
    toggleFullscreen: () => void;
    pageSlideDirection: 'next' | 'prev' | null | string;
    isSceneTransitioning: boolean;
    readerColumnsContainerRef: React.RefObject<HTMLDivElement>;
    readerScrollContainerRef: React.RefObject<HTMLDivElement>;
    handleReaderTouchStart?: React.TouchEventHandler<HTMLDivElement>;
    handleReaderTouchMove?: React.TouchEventHandler<HTMLDivElement>;
    handleReaderTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
    touchDragOffset?: number;
    isTouchDragging?: boolean;
    touchHasDraggedRef?: React.MutableRefObject<boolean>;
    justTappedRef?: React.MutableRefObject<boolean>;
    turnReaderPage: (delta: number, isProgrammatic?: boolean) => void;
    jumpToReaderScene: (
        seqIdx: number,
        sceneIdx: number,
        dir?: string,
        isProgrammatic?: boolean
    ) => void;
    goToNextReaderScene?: () => void;
    setView: (view: string) => void;
    ttsStatus: string;
    ttsProgress: number;
    ttsStatusMessage?: string;
    ttsActiveDevice?: string;
    ttsError?: string | ReaderTtsErrorObject | null;
    setTtsError?: (err: string | ReaderTtsErrorObject | null) => void;
    ttsIsMiniPlayerVisible: boolean;
    setTtsIsMiniPlayerVisible?: (visible: boolean) => void;
    ttsQueue: ReaderTtsQueueChunk[];
    ttsCurrentChunkIndex: number;
    ttsCurrentTime: number;
    ttsDuration: number;
    setTtsCurrentTime?: (t: number) => void;
    ttsGeneratingElapsedSec?: number;
    toggleTtsPlayPause: (proseOverride?: string | null) => void;
    stopTtsPlayback: () => void;
    skipTtsChunk: (delta: number) => void;
    initTtsEngine?: (forceDevice?: string | null) => void;
    showToast?: (message: string, type?: string) => void;
    changeTtsVoice?: (voiceId: string) => void;
    scrollReaderToElement?: (targetEl: HTMLElement, smooth?: boolean) => void;
    visibleScrollSceneRef?: React.MutableRefObject<{ seqIdx: number; sceneIdx: number } | null>;
    isProgrammaticScrollRef?: React.MutableRefObject<boolean>;
    audioDramaSettings?: {
        pipelineTier?: number;
        backend?: string;
        [key: string]: unknown;
    } | null;
    updateAudioDramaSetting?: (key: string, val: unknown) => void;
    audioDramaActiveSpeaker?: string | null;
    audioDramaActiveEmotion?: string | null;
    isAudioDramaModeActive?: boolean;
    startTtsFromProse?: (
        proseText: string,
        startChunkIdx?: number,
        sceneOverride?: ReaderPlayingSceneRef | null
    ) => void;
    requestChunkAudio?: (chunkIdx: number, directQueue?: null, forceAutoPlay?: boolean) => void;
    setSettingsTab?: (tab: string) => void;
    handleDownloadSceneAudio?: (seqIdx?: number, sceneIdx?: number) => void;
    isExportingSceneAudio?: boolean;
    handleDownloadSequenceAudio?: (seqIdx?: number) => void;
    isExportingSequenceAudio?: boolean;
    availableSceneAudioMap?: Record<string, unknown>;
    playStoredOrLiveSceneAudio?: ReaderPlayStoredOrLiveFn;
    playSceneAudio?: ReaderPlaySceneAudioFn;
    ttsPlayingScene?: ReaderPlayingSceneRef | null;
    ttsResolvedSource?: ReaderResolvedAudioSource | null;
    isFollowingAudio?: boolean;
    setIsFollowingAudio?: (follow: boolean) => void;
    returnToActiveAudio?: () => void;
    returnToAudioNonce?: number;
    skipAudioScene?: (delta: number) => void;
    getSceneAudioStatus?: (seqIdx: number, sceneIdx: number) => ReaderSceneAudioStatusResult;
    storyAudioSummary?: unknown;
    isPlayingMasterSceneMp3?: boolean;
    ttsAudioRef?: React.RefObject<HTMLAudioElement>;
    handleToggleAudioAutopilot?: () => void;
    isAudioAutopilotRunning?: boolean;
    isAudioAutopilotQueued?: boolean;
    setStory?: unknown;
    isAuditioningVoice?: boolean;
    isAnyAudioPlaying?: boolean;
    stopAllAudioPlayback?: () => void;
}
