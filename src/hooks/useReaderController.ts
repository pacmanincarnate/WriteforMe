/**
 * @module hooks/useReaderController
 * E-book Reader state machine, paginated column/scroll navigation, wake-lock & theme-color
 * blending, ResizeObserver/useLayoutEffect page measurement, keyboard & touch swipe gestures,
 * and Audio-Follow jump/resume synchronization.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction, TouchEvent } from 'react';
import {
    DEFAULT_READER_SETTINGS,
    STORAGE_KEYS,
    UI_DELAYS_MS,
    type ReaderSettings
} from '@/config';
import { countWords, readingMinutes, safeLocalStorageSet } from '@/utils';
import { measureReaderPages } from '@/views/reader';

export interface ReaderSceneItem {
    seqIdx: number;
    sceneIdx: number;
    scene: Record<string, unknown>;
    sceneKey: string;
    hasProse: boolean;
    proseText: string;
    wordCount: number;
    readingTime: number;
}

export interface ReaderChapterItem {
    chapterIndex: number;
    seqIdx: number;
    chapterNumber: string | number;
    title: string;
    summary: string;
    sequence: Record<string, unknown>;
    scenes: ReaderSceneItem[];
    totalWords: number;
    totalReadingTime: number;
    hasAnyProse: boolean;
}

export interface FlatReaderSceneItem extends ReaderSceneItem {
    sequence: Record<string, unknown>;
}

export interface ReadingProgressState {
    storyId?: string;
    sequenceIndex?: number;
    sceneIndex?: number;
    pageIndex?: number;
    scrollRatio?: number;
    timestamp?: string;
    completedScenes?: Record<string, boolean>;
}

export interface UseReaderControllerParams {
    activeStoryId: string;
    story: Record<string, unknown> | null | undefined;
    selectedSequence: number | null;
    setSelectedSequence: (val: number | null) => void;
    selectedScene: number | null;
    setSelectedScene: (val: number | null) => void;
    view: string;
    setView: (nextView: string | ((prev: string) => string)) => void;
    theme: string;
    setIsSidebarOpen: (open: boolean) => void;
    showToast: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
    ttsStatusRef: MutableRefObject<string>;
    ttsPlayingSceneRef: MutableRefObject<{ seqIdx: number; sceneIdx: number } | null>;
    setIsFollowingAudio: (following: boolean) => void;
    isFollowingAudioRef: MutableRefObject<boolean>;
    setReturnToAudioNonce: Dispatch<SetStateAction<number>>;
}

export interface UseReaderControllerResult {
    readerSettings: ReaderSettings;
    setReaderSettings: Dispatch<SetStateAction<ReaderSettings>>;
    readerSettingsRef: MutableRefObject<ReaderSettings>;
    updateReaderSetting: <K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => void;
    readingProgress: ReadingProgressState;
    setReadingProgress: Dispatch<SetStateAction<ReadingProgressState>>;
    readerPageIndex: number;
    setReaderPageIndex: Dispatch<SetStateAction<number>>;
    readerPageIndexRef: MutableRefObject<number>;
    readerTotalPages: number;
    setReaderTotalPages: Dispatch<SetStateAction<number>>;
    isReaderHudVisible: boolean;
    setIsReaderHudVisible: Dispatch<SetStateAction<boolean>>;
    isTocOpen: boolean;
    setIsTocOpen: Dispatch<SetStateAction<boolean>>;
    isAppearanceOpen: boolean;
    setIsAppearanceOpen: Dispatch<SetStateAction<boolean>>;
    tocSearchQuery: string;
    setTocSearchQuery: Dispatch<SetStateAction<string>>;
    isFullscreen: boolean;
    pageSlideDirection: string | null;
    isSceneTransitioning: boolean;
    readerContainerWidth: number;
    visibleScrollChapter: number;
    setVisibleScrollChapter: Dispatch<SetStateAction<number>>;
    readerScrollContainerRef: MutableRefObject<HTMLDivElement | null>;
    readerColumnsContainerRef: MutableRefObject<HTMLDivElement | null>;
    visibleScrollSceneRef: MutableRefObject<{ seqIdx: number; sceneIdx: number }>;
    isProgrammaticScrollRef: MutableRefObject<boolean>;
    flatStoryScenesRef: MutableRefObject<FlatReaderSceneItem[]>;
    touchDragOffset: number;
    isTouchDragging: boolean;
    touchHasDraggedRef: MutableRefObject<boolean>;
    justTappedRef: MutableRefObject<boolean>;
    storyChapters: ReaderChapterItem[];
    currentChapterIndex: number;
    currentChapter: ReaderChapterItem | null;
    flatStoryScenes: FlatReaderSceneItem[];
    currentFlatSceneIndex: number;
    currentReaderSceneItem: FlatReaderSceneItem | null;
    scrollReaderToElement: (targetEl: HTMLElement | null, smooth?: boolean) => void;
    toggleReaderHud: (forceState?: boolean) => void;
    resetReaderHudTimer: () => void;
    saveReadingProgress: (
        seqIdx: number | null,
        sceneIdx: number | null,
        pageIdx?: number,
        scrollRatio?: number
    ) => void;
    triggerMicroHaptic: (pattern: number | number[]) => void;
    jumpToReaderChapter: (
        chapterIdx: number,
        initialPage?: number | 'last',
        dir?: 'next' | 'prev',
        isProgrammatic?: boolean
    ) => void;
    goToNextReaderChapter: (isProgrammatic?: boolean) => void;
    goToPrevReaderChapter: (isProgrammatic?: boolean) => void;
    jumpToReaderScene: (
        seqIdx: number,
        sceneIdx: number,
        dir?: 'next' | 'prev',
        isProgrammatic?: boolean
    ) => void;
    goToNextReaderScene: () => void;
    turnReaderPage: (delta: number, isProgrammatic?: boolean) => void;
    returnToActiveAudio: () => void;
    enterReaderMode: (seqIdx?: number | null, scIdx?: number | null) => void;
    toggleFullscreen: () => void;
    handleReaderTouchStart: (e: TouchEvent<HTMLElement>) => void;
    handleReaderTouchMove: (e: TouchEvent<HTMLElement>) => void;
    handleReaderTouchEnd: (e: TouchEvent<HTMLElement>) => void;
}

/** Manages Reader View typography, paginated/scroll layout, progress, gestures, and wake-lock. */
export function useReaderController({
    activeStoryId,
    story,
    selectedSequence,
    setSelectedSequence,
    selectedScene,
    setSelectedScene,
    view,
    setView,
    theme,
    setIsSidebarOpen,
    showToast,
    ttsStatusRef,
    ttsPlayingSceneRef,
    setIsFollowingAudio,
    isFollowingAudioRef,
    setReturnToAudioNonce
}: UseReaderControllerParams): UseReaderControllerResult {
    const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.readerSettings);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<ReaderSettings>;
                if ((parsed.ttsDevice as string | undefined) === 'auto') {
                    parsed.ttsDevice = 'wasm';
                }
                return { ...DEFAULT_READER_SETTINGS, ...parsed };
            }
            return DEFAULT_READER_SETTINGS;
        } catch {
            return DEFAULT_READER_SETTINGS;
        }
    });

    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.readerSettings, JSON.stringify(readerSettings));
    }, [readerSettings]);
    const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
    readerSettingsRef.current = readerSettings;

    const updateReaderSetting = useCallback(
        <K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]): void => {
            setReaderSettings((prev) => ({ ...prev, [key]: val }));
        },
        []
    );

    const flatStoryScenesRef = useRef<FlatReaderSceneItem[]>([]);

    const [readingProgress, setReadingProgress] = useState<ReadingProgressState>(() => {
        try {
            const key = `ellipsisprose_reader_progress_${activeStoryId}`;
            const saved = localStorage.getItem(key);
            return saved ? (JSON.parse(saved) as ReadingProgressState) : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        try {
            const key = `ellipsisprose_reader_progress_${activeStoryId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                setReadingProgress(JSON.parse(saved) as ReadingProgressState);
            } else {
                setReadingProgress({});
            }
        } catch {
            // Ignore malformed reading progress cache
        }
    }, [activeStoryId]);

    const [readerPageIndex, setReaderPageIndex] = useState(0);
    const readerPageIndexRef = useRef(readerPageIndex);
    readerPageIndexRef.current = readerPageIndex;
    const [readerTotalPages, setReaderTotalPages] = useState(1);
    const [isReaderHudVisible, setIsReaderHudVisible] = useState(true);
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
    const [tocSearchQuery, setTocSearchQuery] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [pageSlideDirection, setPageSlideDirection] = useState<string | null>(null);
    const [isSceneTransitioning, setIsSceneTransitioning] = useState(false);
    const [readerContainerWidth, setReaderContainerWidth] = useState(0);
    const pendingTargetPageRef = useRef<number | 'last' | null>(null);
    const pendingTargetSceneRef = useRef<{ seqIdx: number; sceneIdx: number } | null>(null);
    const pendingScrollTargetRef = useRef<{
        seqIdx: number;
        scIdx: number | null;
        scrollRatio: number;
    } | null>(null);
    const pageSlideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const readerScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const readerColumnsContainerRef = useRef<HTMLDivElement | null>(null);
    const visibleScrollSceneRef = useRef<{ seqIdx: number; sceneIdx: number }>({
        seqIdx: 0,
        sceneIdx: 0
    });
    const isProgrammaticScrollRef = useRef(false);
    const hudTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scrollReaderToElement = useCallback((targetEl: HTMLElement | null, smooth = true) => {
        const container = readerScrollContainerRef.current;
        if (!container || !targetEl) return;
        isProgrammaticScrollRef.current = true;
        setTimeout(() => {
            isProgrammaticScrollRef.current = false;
        }, 650);
        const containerRect = container.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 30;
        container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: smooth ? 'smooth' : 'auto'
        });
    }, []);

    const [touchDragOffset, setTouchDragOffset] = useState(0);
    const [isTouchDragging, setIsTouchDragging] = useState(false);
    const touchHasDraggedRef = useRef(false);
    const touchStartXRef = useRef<number | null>(null);
    const touchStartYRef = useRef<number | null>(null);
    const touchStartTimeRef = useRef(0);
    const justTappedRef = useRef(false);
    const touchLastXRef = useRef(0);
    const touchLastTimeRef = useRef(0);
    const touchVelocityRef = useRef(0);
    const touchIsHorizontalRef = useRef<boolean | null>(null);

    const triggerPageSlide = useCallback((dir: string) => {
        setPageSlideDirection(dir);
        if (pageSlideTimerRef.current) clearTimeout(pageSlideTimerRef.current);
        pageSlideTimerRef.current = setTimeout(() => {
            setPageSlideDirection(null);
        }, 300);
    }, []);

    const toggleReaderHud = useCallback((forceState?: boolean) => {
        if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
        setIsReaderHudVisible((prev) =>
            typeof forceState === 'boolean' ? forceState : !prev
        );
    }, []);

    const resetReaderHudTimer = useCallback(() => {
        if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
        setIsReaderHudVisible(true);
    }, []);

    const saveReadingProgress = useCallback(
        (
            seqIdx: number | null,
            sceneIdx: number | null,
            pageIdx = 0,
            scrollRatio = 0
        ) => {
            if (seqIdx === null || sceneIdx === null) return;
            setReadingProgress((prev) => {
                const updated: ReadingProgressState = {
                    storyId: activeStoryId,
                    sequenceIndex: seqIdx,
                    sceneIndex: sceneIdx,
                    pageIndex: pageIdx,
                    scrollRatio,
                    timestamp: new Date().toISOString(),
                    completedScenes: {
                        ...(prev.completedScenes || {}),
                        [`${seqIdx}-${sceneIdx}`]: true
                    }
                };
                safeLocalStorageSet(
                    `ellipsisprose_reader_progress_${activeStoryId}`,
                    JSON.stringify(updated)
                );
                return updated;
            });
        },
        [activeStoryId]
    );

    const storySequences = story?.sequences;
    const storyScenes = story?.scenes;
    const storyProse = story?.prose;

    const storyChapters = useMemo<ReaderChapterItem[]>(() => {
        const list: ReaderChapterItem[] = [];
        if (!Array.isArray(storySequences)) return list;
        const scenesMap = (storyScenes || {}) as Record<string, Array<Record<string, unknown>>>;
        const proseMap = (storyProse || {}) as Record<
            string,
            { final?: string; draft?: string } | undefined
        >;

        (storySequences as Array<Record<string, unknown>>).forEach((seq, seqIdx) => {
            const seqScenes = scenesMap[`${seqIdx}`] || [];
            const scenesWithData: ReaderSceneItem[] = seqScenes.map((scene, sceneIdx) => {
                const sId = `${seqIdx}-${sceneIdx}`;
                const proseObj = proseMap[sId];
                const proseText =
                    proseObj && (proseObj.final || proseObj.draft)
                        ? String(proseObj.final || proseObj.draft)
                        : '';
                const words = countWords(proseText);
                const readTime = readingMinutes(words);
                return {
                    seqIdx,
                    sceneIdx,
                    scene,
                    sceneKey: sId,
                    hasProse: Boolean(proseText),
                    proseText,
                    wordCount: words,
                    readingTime: readTime
                };
            });

            const totalWords = scenesWithData.reduce((sum, sc) => sum + sc.wordCount, 0);
            const totalReadingTime = scenesWithData.reduce((sum, sc) => sum + sc.readingTime, 0);
            const hasAnyProse = scenesWithData.some((sc) => sc.hasProse);

            list.push({
                chapterIndex: seqIdx,
                seqIdx,
                chapterNumber: (seq.number as string | number) || seqIdx + 1,
                title: String(seq.title || `Chapter ${String(seq.number || seqIdx + 1)}`),
                summary: String(seq.summary || ''),
                sequence: seq,
                scenes: scenesWithData,
                totalWords,
                totalReadingTime,
                hasAnyProse
            });
        });
        return list;
    }, [storySequences, storyScenes, storyProse]);

    const currentChapterIndex = useMemo(() => {
        if (selectedSequence === null || selectedSequence === undefined) return 0;
        return selectedSequence >= 0 && selectedSequence < storyChapters.length
            ? selectedSequence
            : 0;
    }, [selectedSequence, storyChapters]);

    const currentChapter = storyChapters[currentChapterIndex] || storyChapters[0] || null;
    const [visibleScrollChapter, setVisibleScrollChapter] = useState(0);

    const flatStoryScenes = useMemo<FlatReaderSceneItem[]>(() => {
        const list: FlatReaderSceneItem[] = [];
        if (!Array.isArray(storySequences)) return list;
        const scenesMap = (storyScenes || {}) as Record<string, Array<Record<string, unknown>>>;
        const proseMap = (storyProse || {}) as Record<
            string,
            { final?: string; draft?: string } | undefined
        >;

        (storySequences as Array<Record<string, unknown>>).forEach((seq, seqIdx) => {
            const seqScenes = scenesMap[`${seqIdx}`] || [];
            seqScenes.forEach((scene, sceneIdx) => {
                const sId = `${seqIdx}-${sceneIdx}`;
                const proseObj = proseMap[sId];
                const proseText =
                    proseObj && (proseObj.final || proseObj.draft)
                        ? String(proseObj.final || proseObj.draft)
                        : '';
                const words = countWords(proseText);
                const readTime = readingMinutes(words);

                list.push({
                    seqIdx,
                    sceneIdx,
                    scene,
                    sequence: seq,
                    sceneKey: sId,
                    hasProse: Boolean(proseText),
                    proseText,
                    wordCount: words,
                    readingTime: readTime
                });
            });
        });
        return list;
    }, [storySequences, storyScenes, storyProse]);
    flatStoryScenesRef.current = flatStoryScenes;

    const currentFlatSceneIndex = useMemo(() => {
        if (selectedSequence === null || selectedScene === null) return 0;
        const idx = flatStoryScenes.findIndex(
            (s) => s.seqIdx === selectedSequence && s.sceneIdx === selectedScene
        );
        return idx >= 0 ? idx : 0;
    }, [flatStoryScenes, selectedSequence, selectedScene]);

    const currentReaderSceneItem = flatStoryScenes[currentFlatSceneIndex] || null;

    const triggerMicroHaptic = useCallback((pattern: number | number[]) => {
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(pattern);
            }
        } catch {
            // Ignore environments without vibration API support
        }
    }, []);

    // Screen Wake Lock API for Reader Mode
    useEffect(() => {
        if (view !== 'reader') return;
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

        let wakeLockSentinel: WakeLockSentinel | null = null;
        let isMounted = true;

        const requestWakeLock = async (): Promise<void> => {
            try {
                if (document.visibilityState === 'visible' && !wakeLockSentinel && isMounted) {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => {
                        wakeLockSentinel = null;
                    });
                }
            } catch {
                wakeLockSentinel = null;
            }
        };

        void requestWakeLock();

        const handleVisibilityChange = (): void => {
            if (document.visibilityState === 'visible' && view === 'reader') {
                void requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLockSentinel) {
                wakeLockSentinel.release().catch(() => {});
                wakeLockSentinel = null;
            }
        };
    }, [view]);

    // Dynamic <meta name="theme-color"> Status Bar Blending for Reader Mode
    useEffect(() => {
        let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }

        if (view === 'reader') {
            const rt = readerSettings?.readerTheme;
            let color = '#FAF8F5';
            if (rt === 'sepia') color = '#F5EEDB';
            else if (rt === 'dark') color = '#1C1917';
            else if (rt === 'oled') color = '#000000';
            meta.setAttribute('content', color);
        } else {
            const defaultAppColor = theme === 'dark' ? '#141416' : '#F7F5F0';
            meta.setAttribute('content', defaultAppColor);
        }

        return () => {
            if (meta && view === 'reader') {
                meta.setAttribute('content', theme === 'dark' ? '#141416' : '#F7F5F0');
            }
        };
    }, [view, readerSettings?.readerTheme, theme]);

    const isTtsSessionActive = useCallback(
        () =>
            ['playing', 'paused', 'generating', 'loading-model', 'loading-library'].includes(
                ttsStatusRef.current
            ) || Boolean(ttsPlayingSceneRef.current),
        [ttsPlayingSceneRef, ttsStatusRef]
    );

    const jumpToReaderChapter = useCallback(
        (
            chapterIdx: number,
            initialPage: number | 'last' = 0,
            dir: 'next' | 'prev' = 'next',
            isProgrammatic = false
        ) => {
            if (chapterIdx < 0 || chapterIdx >= storyChapters.length) return;
            if (!isProgrammatic && isTtsSessionActive()) {
                setIsFollowingAudio(false);
                isFollowingAudioRef.current = false;
            }
            triggerMicroHaptic([6, 30, 6]);
            setIsSceneTransitioning(true);
            triggerPageSlide(dir);
            setSelectedSequence(chapterIdx);
            setSelectedScene(0);
            setVisibleScrollChapter(chapterIdx);
            setIsTocOpen(false);

            if (readerSettings.readingMode === 'scroll') {
                setTimeout(() => {
                    const targetEl = document.getElementById(`reader-chapter-${chapterIdx}`);
                    if (targetEl) {
                        scrollReaderToElement(targetEl, true);
                    }
                }, UI_DELAYS_MS.scrollRetry);
                saveReadingProgress(chapterIdx, 0, 0);
            } else {
                if (initialPage === -1 || initialPage === 'last') {
                    pendingTargetPageRef.current = 'last';
                } else {
                    pendingTargetPageRef.current = initialPage;
                    readerPageIndexRef.current = initialPage;
                    setReaderPageIndex(initialPage);
                }
                if (initialPage !== -1 && initialPage !== 'last') {
                    saveReadingProgress(chapterIdx, 0, initialPage);
                }
            }
            setTimeout(() => setIsSceneTransitioning(false), UI_DELAYS_MS.sceneTransition);
        },
        [
            isFollowingAudioRef,
            isTtsSessionActive,
            readerSettings.readingMode,
            saveReadingProgress,
            scrollReaderToElement,
            setIsFollowingAudio,
            setSelectedScene,
            setSelectedSequence,
            storyChapters.length,
            triggerMicroHaptic,
            triggerPageSlide
        ]
    );

    const goToNextReaderChapter = useCallback(
        (isProgrammatic = false) => {
            if (currentChapterIndex < storyChapters.length - 1) {
                jumpToReaderChapter(currentChapterIndex + 1, 0, 'next', isProgrammatic);
            } else {
                triggerMicroHaptic([6, 30, 6]);
                showToast("You've reached the end of the manuscript!", 'info');
            }
        },
        [
            currentChapterIndex,
            jumpToReaderChapter,
            showToast,
            storyChapters.length,
            triggerMicroHaptic
        ]
    );

    const goToPrevReaderChapter = useCallback(
        (isProgrammatic = false) => {
            if (currentChapterIndex > 0) {
                jumpToReaderChapter(currentChapterIndex - 1, 'last', 'prev', isProgrammatic);
            } else {
                triggerMicroHaptic([6, 30, 6]);
            }
        },
        [currentChapterIndex, jumpToReaderChapter, triggerMicroHaptic]
    );

    const jumpToReaderScene = useCallback(
        (
            seqIdx: number,
            sceneIdx: number,
            dir: 'next' | 'prev' = 'next',
            isProgrammatic = false
        ) => {
            if (seqIdx < 0 || seqIdx >= storyChapters.length) return;
            if (!isProgrammatic && isTtsSessionActive()) {
                setIsFollowingAudio(false);
                isFollowingAudioRef.current = false;
            }
            triggerMicroHaptic([6, 30, 6]);
            setIsSceneTransitioning(true);
            triggerPageSlide(dir);
            setSelectedSequence(seqIdx);
            setSelectedScene(sceneIdx);
            setVisibleScrollChapter(seqIdx);
            setIsTocOpen(false);

            if (readerSettings.readingMode === 'scroll') {
                setTimeout(() => {
                    const targetEl =
                        document.getElementById(`reader-scene-${seqIdx}-${sceneIdx}`) ||
                        document.getElementById(`reader-chapter-${seqIdx}`);
                    if (targetEl) {
                        scrollReaderToElement(targetEl, true);
                    }
                }, UI_DELAYS_MS.scrollRetry);
                saveReadingProgress(seqIdx, sceneIdx, 0);
            } else {
                if (seqIdx === selectedSequence && readerColumnsContainerRef.current) {
                    const sceneEl = document.getElementById(
                        `reader-paginated-scene-${seqIdx}-${sceneIdx}`
                    );
                    const gap = window.innerWidth <= 640 ? 24 : 48;
                    const width =
                        readerContainerWidth ||
                        measureReaderPages(readerColumnsContainerRef.current)?.width ||
                        600;
                    if (sceneEl && width > 0 && (sceneIdx === 0 || sceneEl.offsetLeft > 0)) {
                        const targetPage = Math.max(
                            0,
                            Math.min(
                                Math.floor(sceneEl.offsetLeft / (width + gap)),
                                Math.max(1, readerTotalPages) - 1
                            )
                        );
                        readerPageIndexRef.current = targetPage;
                        setReaderPageIndex(targetPage);
                        saveReadingProgress(seqIdx, sceneIdx, targetPage);
                    } else {
                        pendingTargetSceneRef.current = { seqIdx, sceneIdx };
                    }
                } else {
                    readerPageIndexRef.current = 0;
                    setReaderPageIndex(0);
                    pendingTargetSceneRef.current = { seqIdx, sceneIdx };
                }
            }
            setTimeout(() => setIsSceneTransitioning(false), UI_DELAYS_MS.sceneTransition);
        },
        [
            isFollowingAudioRef,
            isTtsSessionActive,
            readerContainerWidth,
            readerSettings.readingMode,
            readerTotalPages,
            saveReadingProgress,
            scrollReaderToElement,
            selectedSequence,
            setIsFollowingAudio,
            setSelectedScene,
            setSelectedSequence,
            storyChapters.length,
            triggerMicroHaptic,
            triggerPageSlide
        ]
    );

    const goToNextReaderScene = useCallback(() => {
        goToNextReaderChapter();
    }, [goToNextReaderChapter]);

    const turnReaderPage = useCallback(
        (delta: number, isProgrammatic = false) => {
            if (isReaderHudVisible && !isTocOpen && !isAppearanceOpen && !isProgrammatic) {
                setIsReaderHudVisible(false);
            }
            if (!isProgrammatic && isTtsSessionActive()) {
                setIsFollowingAudio(false);
                isFollowingAudioRef.current = false;
            }
            if (readerSettings.readingMode === 'scroll') {
                if (readerScrollContainerRef.current) {
                    const el = readerScrollContainerRef.current;
                    const scrollAmount = Math.max(150, el.clientHeight - 48);
                    el.scrollBy({
                        top: delta > 0 ? scrollAmount : -scrollAmount,
                        behavior: 'smooth'
                    });
                }
                return;
            }

            const findSceneForPage = (targetPg: number): number => {
                if (!readerColumnsContainerRef.current) return selectedScene || 0;
                const scenes = currentChapter?.scenes || [];
                const gap = window.innerWidth <= 640 ? 24 : 48;
                const width = readerContainerWidth || 600;
                const pageLeft = targetPg * (width + gap);
                let foundSc = 0;
                for (let i = 0; i < scenes.length; i++) {
                    const s = scenes[i];
                    const sEl = document.getElementById(
                        `reader-paginated-scene-${selectedSequence}-${s.sceneIdx}`
                    );
                    if (sEl && sEl.offsetLeft <= pageLeft + width / 2) {
                        foundSc = s.sceneIdx;
                    }
                }
                return foundSc;
            };

            if (isProgrammatic || Math.abs(delta) > 1) {
                const currentPg = readerPageIndexRef.current;
                const nextPg = Math.max(
                    0,
                    Math.min(Math.max(1, readerTotalPages) - 1, currentPg + delta)
                );
                if (nextPg !== currentPg) {
                    triggerMicroHaptic(8);
                    triggerPageSlide(delta > 0 ? 'next' : 'prev');
                    readerPageIndexRef.current = nextPg;
                    setReaderPageIndex(nextPg);
                    const currentSc = findSceneForPage(nextPg);
                    setSelectedScene(currentSc);
                    saveReadingProgress(selectedSequence, currentSc, nextPg);
                }
                return;
            }

            if (delta > 0) {
                if (readerPageIndexRef.current + 1 < readerTotalPages) {
                    triggerMicroHaptic(8);
                    triggerPageSlide('next');
                    const next = readerPageIndexRef.current + 1;
                    readerPageIndexRef.current = next;
                    setReaderPageIndex(next);
                    const currentSc = findSceneForPage(next);
                    setSelectedScene(currentSc);
                    saveReadingProgress(selectedSequence, currentSc, next);
                } else {
                    goToNextReaderChapter(false);
                }
            } else if (delta < 0) {
                if (readerPageIndexRef.current > 0) {
                    triggerMicroHaptic(8);
                    triggerPageSlide('prev');
                    const next = readerPageIndexRef.current - 1;
                    readerPageIndexRef.current = next;
                    setReaderPageIndex(next);
                    const currentSc = findSceneForPage(next);
                    setSelectedScene(currentSc);
                    saveReadingProgress(selectedSequence, currentSc, next);
                } else {
                    goToPrevReaderChapter(false);
                }
            }
        },
        [
            currentChapter?.scenes,
            goToNextReaderChapter,
            goToPrevReaderChapter,
            isAppearanceOpen,
            isFollowingAudioRef,
            isReaderHudVisible,
            isTocOpen,
            isTtsSessionActive,
            readerContainerWidth,
            readerSettings.readingMode,
            readerTotalPages,
            saveReadingProgress,
            selectedScene,
            selectedSequence,
            setIsFollowingAudio,
            setSelectedScene,
            triggerMicroHaptic,
            triggerPageSlide
        ]
    );

    const returnToActiveAudio = useCallback(() => {
        const active = ttsPlayingSceneRef.current;
        setIsFollowingAudio(true);
        isFollowingAudioRef.current = true;
        if (active) {
            if (readerSettingsRef.current?.readingMode === 'paginated') {
                if (active.seqIdx !== selectedSequence) {
                    jumpToReaderScene(active.seqIdx, active.sceneIdx, 'next', true);
                }
            } else {
                const targetEl =
                    document.getElementById(`reader-scene-${active.seqIdx}-${active.sceneIdx}`) ||
                    document.getElementById(`reader-chapter-${active.seqIdx}`);
                if (targetEl) {
                    scrollReaderToElement(targetEl, true);
                }
            }
        }
        setReturnToAudioNonce((n) => n + 1);
    }, [
        isFollowingAudioRef,
        jumpToReaderScene,
        scrollReaderToElement,
        selectedSequence,
        setIsFollowingAudio,
        setReturnToAudioNonce,
        ttsPlayingSceneRef
    ]);

    const enterReaderMode = useCallback(
        (seqIdx: number | null = null, scIdx: number | null = null) => {
            let targetSeq = seqIdx;
            let targetSc = scIdx;
            let targetPage: number | null = null;

            if (targetSeq === null) {
                if (readingProgress.sequenceIndex !== undefined) {
                    targetSeq = readingProgress.sequenceIndex;
                    targetSc =
                        readingProgress.sceneIndex !== undefined ? readingProgress.sceneIndex : 0;
                    targetPage = readingProgress.pageIndex || 0;
                } else if (selectedSequence !== null && selectedSequence !== undefined) {
                    targetSeq = selectedSequence;
                    targetSc =
                        selectedScene !== null && selectedScene !== undefined ? selectedScene : 0;
                    targetPage = readerPageIndex || 0;
                } else {
                    const firstWithProse =
                        storyChapters.find((ch) => ch.hasAnyProse) || storyChapters[0];
                    targetSeq = firstWithProse ? firstWithProse.seqIdx : 0;
                    targetSc = 0;
                    targetPage = 0;
                }
            }

            setSelectedSequence(targetSeq);
            setSelectedScene(targetSc !== null && targetSc !== undefined ? targetSc : 0);
            setVisibleScrollChapter(targetSeq);

            if (readerSettings.readingMode === 'scroll') {
                pendingScrollTargetRef.current = {
                    seqIdx: targetSeq,
                    scIdx: targetSc,
                    scrollRatio:
                        seqIdx === null && readingProgress.scrollRatio
                            ? readingProgress.scrollRatio
                            : 0
                };
            } else if (seqIdx === null) {
                if (targetPage !== null && targetPage !== undefined) {
                    pendingTargetPageRef.current = targetPage;
                    setReaderPageIndex(targetPage);
                } else {
                    pendingTargetPageRef.current = 0;
                    setReaderPageIndex(0);
                }
                pendingTargetSceneRef.current = null;
            } else if (targetSc !== null && targetSc !== undefined && targetSc > 0) {
                pendingTargetSceneRef.current = { seqIdx: targetSeq, sceneIdx: targetSc };
                pendingTargetPageRef.current = null;
            } else if (targetPage !== null && targetPage !== undefined) {
                pendingTargetPageRef.current = targetPage;
                setReaderPageIndex(targetPage);
                pendingTargetSceneRef.current = null;
            } else {
                pendingTargetPageRef.current = 0;
                setReaderPageIndex(0);
                pendingTargetSceneRef.current = null;
            }

            setView('reader');
            setIsSidebarOpen(false);
            resetReaderHudTimer();
        },
        [
            readerPageIndex,
            readerSettings.readingMode,
            readingProgress.pageIndex,
            readingProgress.sceneIndex,
            readingProgress.scrollRatio,
            readingProgress.sequenceIndex,
            resetReaderHudTimer,
            selectedScene,
            selectedSequence,
            setIsSidebarOpen,
            setSelectedScene,
            setSelectedSequence,
            setView,
            storyChapters
        ]
    );

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement
                .requestFullscreen()
                .then(() => setIsFullscreen(true))
                .catch(() => {});
        } else if (document.exitFullscreen) {
            document
                .exitFullscreen()
                .then(() => setIsFullscreen(false))
                .catch(() => {});
        }
    }, []);

    // Scroll Mode position restoration effect
    useEffect(() => {
        if (view !== 'reader') return;
        if (readerSettings.readingMode === 'scroll') {
            let attempts = 0;
            const tryScroll = (): void => {
                if (!pendingScrollTargetRef.current) return;
                const { seqIdx, scIdx, scrollRatio } = pendingScrollTargetRef.current;
                let target: HTMLElement | null = null;
                if (scIdx !== null && scIdx !== undefined) {
                    target = document.getElementById(`reader-scene-${seqIdx}-${scIdx}`);
                }
                if (!target && seqIdx !== null && seqIdx !== undefined) {
                    target = document.getElementById(`reader-chapter-${seqIdx}`);
                }
                if (target) {
                    scrollReaderToElement(target, false);
                    pendingScrollTargetRef.current = null;
                } else if (scrollRatio > 0 && readerScrollContainerRef.current) {
                    const el = readerScrollContainerRef.current;
                    const max = el.scrollHeight - el.clientHeight;
                    if (max > 0) {
                        el.scrollTop = Math.round(scrollRatio * max);
                        pendingScrollTargetRef.current = null;
                    } else if (attempts < 5) {
                        attempts++;
                        setTimeout(tryScroll, UI_DELAYS_MS.scrollRetry);
                    }
                } else if (attempts < 5) {
                    attempts++;
                    setTimeout(tryScroll, UI_DELAYS_MS.scrollRetry);
                }
            };
            const timer = setTimeout(tryScroll, UI_DELAYS_MS.scrollRetry);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [view, readerSettings.readingMode, selectedSequence, scrollReaderToElement]);

    // Dynamic synchronous page count calculation in Paginated Mode
    useLayoutEffect(() => {
        if (view !== 'reader' || readerSettings.readingMode !== 'paginated') return;

        const calculatePages = (): void => {
            if (!readerColumnsContainerRef.current) return;
            const measured = measureReaderPages(readerColumnsContainerRef.current);
            if (!measured) return;
            setReaderContainerWidth(measured.width);
            setReaderTotalPages(measured.pages);
            if (pendingTargetSceneRef.current) {
                const { seqIdx, sceneIdx } = pendingTargetSceneRef.current;
                const sceneEl = document.getElementById(
                    `reader-paginated-scene-${seqIdx}-${sceneIdx}`
                );
                const gap = window.innerWidth <= 640 ? 24 : 48;
                if (sceneEl && measured.width > 0) {
                    if (
                        sceneIdx > 0 &&
                        sceneEl.offsetLeft === 0 &&
                        (measured.pages > 1 || (currentChapter?.totalWords ?? 0) > 150)
                    ) {
                        requestAnimationFrame(() => calculatePages());
                        return;
                    }
                    const targetPage = Math.max(
                        0,
                        Math.min(
                            Math.floor(sceneEl.offsetLeft / (measured.width + gap)),
                            measured.pages - 1
                        )
                    );
                    setReaderPageIndex(targetPage);
                    saveReadingProgress(seqIdx, sceneIdx, targetPage);
                    pendingTargetSceneRef.current = null;
                    pendingTargetPageRef.current = null;
                    return;
                }
            }

            if (pendingTargetPageRef.current === 'last') {
                if (measured.pages <= 1 && (currentChapter?.totalWords ?? 0) > 150) {
                    requestAnimationFrame(() => calculatePages());
                    return;
                }
                const lastIdx = Math.max(0, measured.pages - 1);
                setReaderPageIndex(lastIdx);
                pendingTargetPageRef.current = null;
            } else if (typeof pendingTargetPageRef.current === 'number') {
                if (
                    pendingTargetPageRef.current >= measured.pages &&
                    (currentChapter?.totalWords ?? 0) > 150
                ) {
                    requestAnimationFrame(() => calculatePages());
                    return;
                }
                const targetIdx = Math.max(
                    0,
                    Math.min(pendingTargetPageRef.current, measured.pages - 1)
                );
                setReaderPageIndex(targetIdx);
                pendingTargetPageRef.current = null;
            } else if (readerPageIndex >= measured.pages) {
                if (
                    measured.pages > 1 ||
                    !currentChapter?.totalWords ||
                    currentChapter.totalWords <= 150
                ) {
                    setReaderPageIndex(Math.max(0, measured.pages - 1));
                }
            }
        };

        calculatePages();
    }, [
        view,
        readerSettings,
        selectedSequence,
        currentChapter?.totalWords,
        readerContainerWidth,
        readerPageIndex,
        saveReadingProgress
    ]);

    // Window resize handler for reader mode
    useEffect(() => {
        if (view !== 'reader' || readerSettings.readingMode !== 'paginated') return;
        const handleResize = (): void => {
            if (!readerColumnsContainerRef.current) return;
            const measured = measureReaderPages(readerColumnsContainerRef.current);
            if (!measured) return;
            setReaderContainerWidth(measured.width);
            setReaderTotalPages(measured.pages);
            if (readerPageIndexRef.current >= measured.pages) {
                setReaderPageIndex(Math.max(0, measured.pages - 1));
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        let ro: ResizeObserver | null = null;
        if (
            typeof ResizeObserver !== 'undefined' &&
            readerColumnsContainerRef.current?.parentElement
        ) {
            ro = new ResizeObserver(() => {
                handleResize();
            });
            ro.observe(readerColumnsContainerRef.current.parentElement);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
            if (ro) ro.disconnect();
        };
    }, [view, readerSettings, selectedSequence, currentChapter?.totalWords]);

    // Keyboard listener for reader mode
    useEffect(() => {
        if (view !== 'reader') return;

        const handleKeyDown = (e: KeyboardEvent): void => {
            const targetEl = e.target as HTMLElement | null;
            if (
                targetEl &&
                (targetEl.tagName === 'INPUT' ||
                    targetEl.tagName === 'TEXTAREA' ||
                    targetEl.isContentEditable)
            ) {
                return;
            }

            const isNextPage =
                e.key === 'ArrowRight' ||
                e.key === 'PageDown' ||
                e.key === 'ArrowDown' ||
                (e.key === ' ' && !e.shiftKey) ||
                e.code === 'PageDown' ||
                e.code === 'ArrowRight';
            const isPrevPage =
                e.key === 'ArrowLeft' ||
                e.key === 'PageUp' ||
                e.key === 'ArrowUp' ||
                (e.key === ' ' && e.shiftKey) ||
                e.code === 'PageUp' ||
                e.code === 'ArrowLeft';

            if (isNextPage) {
                e.preventDefault();
                turnReaderPage(1);
            } else if (isPrevPage) {
                e.preventDefault();
                turnReaderPage(-1);
            } else if (e.key === 'Escape') {
                if (isTocOpen) setIsTocOpen(false);
                else if (isAppearanceOpen) setIsAppearanceOpen(false);
                else setView('writer');
            } else if (e.key === 't' || e.key === 'T') {
                setIsTocOpen((prev) => !prev);
                setIsAppearanceOpen(false);
            } else if (e.key === 'a' || e.key === 'A') {
                setIsAppearanceOpen((prev) => !prev);
                setIsTocOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        view,
        readerPageIndex,
        readerTotalPages,
        isTocOpen,
        isAppearanceOpen,
        currentChapterIndex,
        storyChapters,
        readerSettings.readingMode,
        setView,
        turnReaderPage
    ]);

    const handleReaderTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
        if (!e.touches || e.touches.length === 0) return;
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        touchStartXRef.current = clientX;
        touchStartYRef.current = clientY;
        touchStartTimeRef.current = Date.now();
        touchLastXRef.current = clientX;
        touchLastTimeRef.current = Date.now();
        touchVelocityRef.current = 0;
        touchIsHorizontalRef.current = null;
        touchHasDraggedRef.current = false;
    }, []);

    const handleReaderTouchMove = useCallback(
        (e: TouchEvent<HTMLElement>) => {
            if (touchStartXRef.current === null || !e.touches || e.touches.length === 0) return;
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            const diffX = clientX - touchStartXRef.current;
            const diffY = clientY - (touchStartYRef.current ?? clientY);
            const dist = Math.hypot(diffX, diffY);

            if (dist > 8) {
                touchHasDraggedRef.current = true;
            }

            if (touchIsHorizontalRef.current === null) {
                if (dist > 8) {
                    touchIsHorizontalRef.current = Math.abs(diffX) >= Math.abs(diffY);
                    if (
                        touchIsHorizontalRef.current &&
                        readerSettings.readingMode === 'paginated'
                    ) {
                        setIsTouchDragging(true);
                        touchHasDraggedRef.current = true;
                    }
                }
            }

            if (touchIsHorizontalRef.current && readerSettings.readingMode === 'paginated') {
                if (e.cancelable) e.preventDefault();
                touchHasDraggedRef.current = true;

                const width =
                    readerContainerWidth ||
                    (typeof window !== 'undefined' ? window.innerWidth : 600);
                const atStart = readerPageIndex === 0 && currentChapterIndex === 0;
                const atEnd =
                    readerPageIndex >= readerTotalPages - 1 &&
                    currentChapterIndex >= storyChapters.length - 1;

                let offset = diffX;
                if ((diffX > 0 && atStart) || (diffX < 0 && atEnd)) {
                    const constant = 0.35;
                    offset = (diffX * width * constant) / (width + constant * Math.abs(diffX));
                }

                setTouchDragOffset(offset);

                const now = Date.now();
                const dt = Math.max(1, now - touchLastTimeRef.current);
                touchVelocityRef.current = (clientX - touchLastXRef.current) / dt;
                touchLastXRef.current = clientX;
                touchLastTimeRef.current = now;
            }
        },
        [
            currentChapterIndex,
            readerContainerWidth,
            readerPageIndex,
            readerSettings.readingMode,
            readerTotalPages,
            storyChapters.length
        ]
    );

    const handleReaderTouchEnd = useCallback(
        (e: TouchEvent<HTMLElement>) => {
            if (touchStartXRef.current === null) return;
            const endX =
                e.changedTouches && e.changedTouches.length > 0
                    ? e.changedTouches[0].clientX
                    : touchLastXRef.current;
            const endY =
                e.changedTouches && e.changedTouches.length > 0
                    ? e.changedTouches[0].clientY
                    : (touchStartYRef.current ?? 0);
            const diffX = endX - touchStartXRef.current;
            const diffY = endY - (touchStartYRef.current ?? endY);
            const totalDist = Math.hypot(diffX, diffY);
            const dt = Date.now() - (touchStartTimeRef.current || 0);
            const isHorizontal =
                touchIsHorizontalRef.current ??
                (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 20);
            const velocity = touchVelocityRef.current || 0;
            const width =
                readerContainerWidth ||
                (typeof window !== 'undefined' ? window.innerWidth : 600);

            setIsTouchDragging(false);
            setTouchDragOffset(0);

            const wasTap = !touchHasDraggedRef.current && totalDist < 16 && dt < 450;
            const targetEl = e.target as HTMLElement | null;
            const tappedInteractive = Boolean(
                targetEl?.closest?.('button, a, input, select, .reader-ui-card, .studio-top-header')
            );

            if (wasTap && !tappedInteractive) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                const screenW = typeof window !== 'undefined' ? window.innerWidth : 400;
                const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;
                const isMiddleX = endX >= screenW * 0.2 && endX <= screenW * 0.8;
                const isMiddleY = endY >= screenH * 0.12 && endY <= screenH * 0.88;

                justTappedRef.current = true;
                setTimeout(() => {
                    justTappedRef.current = false;
                }, 400);

                if (readerSettings.readingMode === 'paginated') {
                    if (isMiddleX && isMiddleY) {
                        toggleReaderHud();
                    } else if (endX < screenW * 0.2) {
                        turnReaderPage(-1);
                    } else if (endX > screenW * 0.8) {
                        turnReaderPage(1);
                    }
                } else if (isMiddleX && isMiddleY) {
                    toggleReaderHud();
                }
            } else if (!wasTap && readerSettings.readingMode === 'paginated' && isHorizontal) {
                const threshold = Math.min(60, Math.max(35, width * 0.15));
                const isFlickNext = velocity < -0.25 || (diffX < -threshold && velocity <= 0.1);
                const isFlickPrev = velocity > 0.25 || (diffX > threshold && velocity >= -0.1);

                if (isFlickNext) {
                    turnReaderPage(1);
                } else if (isFlickPrev) {
                    turnReaderPage(-1);
                }
            }

            touchStartXRef.current = null;
            touchStartYRef.current = null;
            touchIsHorizontalRef.current = null;
            touchVelocityRef.current = 0;

            setTimeout(() => {
                touchHasDraggedRef.current = false;
            }, 120);
        },
        [readerContainerWidth, readerSettings.readingMode, toggleReaderHud, turnReaderPage]
    );

    return {
        readerSettings,
        setReaderSettings,
        readerSettingsRef,
        updateReaderSetting,
        readingProgress,
        setReadingProgress,
        readerPageIndex,
        setReaderPageIndex,
        readerPageIndexRef,
        readerTotalPages,
        setReaderTotalPages,
        isReaderHudVisible,
        setIsReaderHudVisible,
        isTocOpen,
        setIsTocOpen,
        isAppearanceOpen,
        setIsAppearanceOpen,
        tocSearchQuery,
        setTocSearchQuery,
        isFullscreen,
        pageSlideDirection,
        isSceneTransitioning,
        readerContainerWidth,
        visibleScrollChapter,
        setVisibleScrollChapter,
        readerScrollContainerRef,
        readerColumnsContainerRef,
        visibleScrollSceneRef,
        isProgrammaticScrollRef,
        flatStoryScenesRef,
        touchDragOffset,
        isTouchDragging,
        touchHasDraggedRef,
        justTappedRef,
        storyChapters,
        currentChapterIndex,
        currentChapter,
        flatStoryScenes,
        currentFlatSceneIndex,
        currentReaderSceneItem,
        scrollReaderToElement,
        toggleReaderHud,
        resetReaderHudTimer,
        saveReadingProgress,
        triggerMicroHaptic,
        jumpToReaderChapter,
        goToNextReaderChapter,
        goToPrevReaderChapter,
        jumpToReaderScene,
        goToNextReaderScene,
        turnReaderPage,
        returnToActiveAudio,
        enterReaderMode,
        toggleFullscreen,
        handleReaderTouchStart,
        handleReaderTouchMove,
        handleReaderTouchEnd
    };
}
