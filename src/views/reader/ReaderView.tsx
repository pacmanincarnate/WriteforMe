/**
 * @module views/reader/ReaderView
 * Full-screen immersive ebook reader view supporting multi-column paginated reading,
 * continuous infinite chapter scroll, Web CSS Custom Highlight API karaoke sync,
 * auto-hiding HUDs, and the composed audio mini-player + TOC/Appearance drawers.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Headphones,
    List,
    Loader2,
    Maximize2,
    Minimize2,
    Moon,
    Pause,
    PenTool,
    Square,
    Sun,
    Type
} from '@/components/icons';
import { formatReaderProse, readingMinutes } from '@/utils';
import { ReaderAppearanceDrawer } from './ReaderAppearanceDrawer';
import { ReaderAudioPlayer } from './ReaderAudioPlayer';
import { ReaderTocDrawer } from './ReaderTocDrawer';
import type { ReaderViewProps } from './types';

interface HighlightRegistryLike {
    set: (name: string, highlight: unknown) => void;
    delete: (name: string) => void;
}

interface CueCursorState {
    sceneKey: string | null;
    chunkIdx: number;
    subTurnIdx: number;
    startOffset: number;
    nextSearchOffset: number;
}

interface SpokenLocationState {
    seqIdx: number;
    sceneIdx: number;
    chunkIdx: number;
    pageIndex: number;
    inDom: boolean;
    rangeStartEl?: Element | null;
}

function getCssHighlights(): HighlightRegistryLike | null {
    if (typeof CSS === 'undefined') return null;
    const cssObj = CSS as unknown as { highlights?: HighlightRegistryLike };
    return cssObj.highlights || null;
}

function getHighlightCtor(): (new (range: Range) => unknown) | null {
    const g = globalThis as unknown as { Highlight?: new (range: Range) => unknown };
    return typeof g.Highlight === 'function' ? g.Highlight : null;
}

export function ReaderView({
    story,
    selectedSequence,
    selectedScene,
    currentReaderSceneItem,
    flatStoryScenes = [],
    storyChapters = [],
    currentChapterIndex = 0,
    currentChapter = null,
    visibleScrollChapter = 0,
    setVisibleScrollChapter,
    jumpToReaderChapter,
    goToNextReaderChapter,
    readerSettings,
    updateReaderSetting,
    readerPageIndex,
    readerPageIndexRef,
    readerTotalPages,
    readerContainerWidth,
    readingProgress,
    saveReadingProgress,
    isReaderHudVisible,
    toggleReaderHud,
    isTocOpen,
    setIsTocOpen,
    isAppearanceOpen,
    setIsAppearanceOpen,
    tocSearchQuery,
    setTocSearchQuery,
    isFullscreen,
    toggleFullscreen,
    pageSlideDirection,
    isSceneTransitioning,
    readerColumnsContainerRef,
    readerScrollContainerRef,
    handleReaderTouchStart,
    handleReaderTouchMove,
    handleReaderTouchEnd,
    touchDragOffset,
    isTouchDragging,
    touchHasDraggedRef,
    justTappedRef,
    turnReaderPage,
    jumpToReaderScene,
    setView,
    ttsStatus,
    ttsProgress,
    ttsStatusMessage,
    ttsError,
    setTtsError,
    ttsIsMiniPlayerVisible,
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
    scrollReaderToElement,
    visibleScrollSceneRef,
    isProgrammaticScrollRef,
    audioDramaSettings,
    updateAudioDramaSetting,
    audioDramaActiveSpeaker,
    requestChunkAudio,
    setSettingsTab,
    availableSceneAudioMap = {},
    playStoredOrLiveSceneAudio,
    playSceneAudio,
    ttsPlayingScene,
    ttsResolvedSource,
    isFollowingAudio = true,
    setIsFollowingAudio,
    returnToActiveAudio,
    returnToAudioNonce = 0,
    skipAudioScene,
    getSceneAudioStatus,
    isPlayingMasterSceneMp3 = false,
    ttsAudioRef,
    isAuditioningVoice = false,
    isAnyAudioPlaying = false,
    stopAllAudioPlayback
}: ReaderViewProps) {
    const activeChapter =
        currentChapter || storyChapters[currentChapterIndex] || storyChapters[0] || null;
    const activeChapterIdx = activeChapter ? activeChapter.chapterIndex : selectedSequence || 0;
    const activeChapterScenes = activeChapter?.scenes || [];
    const hasAnyChapterProse = activeChapterScenes.some((sc) => sc.hasProse);

    const chaptersWithProse = useMemo(
        () => storyChapters.filter((ch) => ch.hasAnyProse),
        [storyChapters]
    );

    const displayChapter =
        readerSettings.readingMode === 'scroll' && storyChapters[visibleScrollChapter]
            ? storyChapters[visibleScrollChapter]
            : activeChapter;

    const [scrollProgressPct, setScrollProgressPct] = useState(0);
    const lastScrollTopRef = useRef(0);
    const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const playbackSpeed = readerSettings.ttsSpeed || 1.0;
    const lastCueCursorRef = useRef<CueCursorState>({
        sceneKey: null,
        chunkIdx: -1,
        subTurnIdx: -1,
        startOffset: 0,
        nextSearchOffset: 0
    });
    const activeSpokenLocationRef = useRef<SpokenLocationState | null>(null);
    const [spokenFollowTick, setSpokenFollowTick] = useState(0);

    useEffect(() => {
        (window as Window & { _ellipsisTtsPlaybackRate?: number })._ellipsisTtsPlaybackRate =
            playbackSpeed;
        if (ttsAudioRef?.current) {
            try {
                ttsAudioRef.current.playbackRate = playbackSpeed;
            } catch (e) {
                console.warn('Could not set audio playback rate:', e);
            }
        }
    }, [playbackSpeed, ttsAudioRef]);

    const scrollToElement = useCallback(
        (targetEl: HTMLElement, smooth = true) => {
            if (scrollReaderToElement) {
                scrollReaderToElement(targetEl, smooth);
                return;
            }
            const container = readerScrollContainerRef?.current;
            if (!container || !targetEl) return;
            if (isProgrammaticScrollRef) {
                isProgrammaticScrollRef.current = true;
                setTimeout(() => {
                    isProgrammaticScrollRef.current = false;
                }, 650);
            }
            const containerRect = container.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const targetScrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 30;
            container.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: smooth ? 'smooth' : 'auto'
            });
        },
        [scrollReaderToElement, readerScrollContainerRef, isProgrammaticScrollRef]
    );

    useEffect(() => {
        if (isReaderHudVisible && readerScrollContainerRef.current) {
            lastScrollTopRef.current = readerScrollContainerRef.current.scrollTop;
        }
    }, [isReaderHudVisible, readerScrollContainerRef]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (!el) return;
        const maxScroll = el.scrollHeight - el.clientHeight;
        const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
        setScrollProgressPct(Math.round(ratio * 100));

        const lastScroll = lastScrollTopRef.current ?? el.scrollTop;
        if (Math.abs(el.scrollTop - lastScroll) > 18) {
            if (
                !isProgrammaticScrollRef?.current &&
                (ttsStatus === 'playing' || ttsStatus === 'paused') &&
                setIsFollowingAudio
            ) {
                setIsFollowingAudio(false);
            }
            if (Math.abs(el.scrollTop - lastScroll) > 25) {
                if (isReaderHudVisible && !isTocOpen && !isAppearanceOpen) {
                    toggleReaderHud(false);
                }
                lastScrollTopRef.current = el.scrollTop;
            }
        }

        if (chaptersWithProse.length > 0) {
            const containerTop = el.getBoundingClientRect().top;
            let detectedSeq = visibleScrollChapter;
            for (let i = chaptersWithProse.length - 1; i >= 0; i--) {
                const ch = chaptersWithProse[i];
                const chEl = document.getElementById(`reader-chapter-${ch.seqIdx}`);
                if (chEl) {
                    const rect = chEl.getBoundingClientRect();
                    if (rect.top <= containerTop + 200) {
                        detectedSeq = ch.seqIdx;
                        if (setVisibleScrollChapter && visibleScrollChapter !== ch.seqIdx) {
                            setVisibleScrollChapter(ch.seqIdx);
                        }
                        break;
                    }
                }
            }

            let detectedScIdx = 0;
            const curChObj = storyChapters[detectedSeq];
            if (curChObj && curChObj.scenes) {
                for (let sIdx = curChObj.scenes.length - 1; sIdx >= 0; sIdx--) {
                    const sc = curChObj.scenes[sIdx];
                    const scEl = document.getElementById(
                        `reader-scene-${detectedSeq}-${sc.sceneIdx}`
                    );
                    if (scEl) {
                        const scRect = scEl.getBoundingClientRect();
                        if (scRect.top <= containerTop + 260) {
                            detectedScIdx = sc.sceneIdx;
                            break;
                        }
                    }
                }
            }

            if (visibleScrollSceneRef) {
                visibleScrollSceneRef.current = { seqIdx: detectedSeq, sceneIdx: detectedScIdx };
            }

            if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
            scrollSaveTimerRef.current = setTimeout(() => {
                if (saveReadingProgress) {
                    saveReadingProgress(detectedSeq, detectedScIdx, 0, ratio);
                }
            }, 400);
        }
    };

    const overallProgressPct =
        storyChapters.length > 0
            ? Math.min(
                  100,
                  Math.round(
                      ((activeChapterIdx +
                          (readerPageIndex + 1) / Math.max(1, readerTotalPages)) /
                          storyChapters.length) *
                          100
                  )
              )
            : 0;

    const chapterProgressPct =
        readerTotalPages > 1
            ? Math.min(100, Math.round(((readerPageIndex + 1) / readerTotalPages) * 100))
            : 100;

    const totalManuscriptWords = useMemo(
        () => storyChapters.reduce((acc, ch) => acc + ch.totalWords, 0),
        [storyChapters]
    );

    const totalManuscriptMinutes = readingMinutes(totalManuscriptWords);

    const themeClass =
        readerSettings.readerTheme === 'sepia'
            ? 'reader-theme-sepia'
            : readerSettings.readerTheme === 'dark'
              ? 'reader-theme-dark'
              : readerSettings.readerTheme === 'oled'
                ? 'reader-theme-oled'
                : 'reader-theme-light';

    const widthClass =
        readerSettings.contentWidth === 'compact'
            ? 'max-w-xl'
            : readerSettings.contentWidth === 'wide'
              ? 'max-w-4xl'
              : readerSettings.contentWidth === 'full'
                ? 'max-w-full px-4 md:px-12'
                : 'max-w-2xl';

    const textStyle: React.CSSProperties = {
        fontFamily:
            readerSettings.fontFamily === 'Inter'
                ? "'Inter', sans-serif"
                : readerSettings.fontFamily === 'Plus Jakarta Sans'
                  ? "'Plus Jakarta Sans', sans-serif"
                  : readerSettings.fontFamily === 'JetBrains Mono'
                    ? "'JetBrains Mono', monospace"
                    : readerSettings.fontFamily === 'Cormorant Garamond'
                      ? "'Cormorant Garamond', serif"
                      : readerSettings.fontFamily === 'Newsreader'
                        ? "'Newsreader', serif"
                        : readerSettings.fontFamily === 'Playfair Display'
                          ? "'Playfair Display', serif"
                          : "'Merriweather', Georgia, serif",
        fontSize: `${readerSettings.fontSize}px`,
        lineHeight: readerSettings.lineHeight,
        textAlign: readerSettings.textAlign === 'justify' ? 'justify' : 'left',
        hyphens: readerSettings.textAlign === 'justify' ? 'auto' : 'none'
    };

    const currentQueueChunk = (ttsQueue && ttsQueue[ttsCurrentChunkIndex]) || null;
    const activeSubTurnIdx = useMemo(() => {
        if (
            !Array.isArray(currentQueueChunk?.turns) ||
            currentQueueChunk.turns.length <= 1 ||
            !(ttsDuration > 0)
        ) {
            return -1;
        }
        const weights = currentQueueChunk.turns.map((t) =>
            Math.max(12, String(t.text || '').length)
        );
        const totalW = weights.reduce((a, b) => a + b, 0);
        const progressW = Math.min(1, Math.max(0, (ttsCurrentTime || 0) / ttsDuration)) * totalW;
        let accW = 0;
        for (let ti = 0; ti < currentQueueChunk.turns.length; ti++) {
            accW += weights[ti];
            if (progressW <= accW || ti === currentQueueChunk.turns.length - 1) {
                return ti;
            }
        }
        return 0;
    }, [currentQueueChunk, ttsCurrentTime, ttsDuration]);

    const lastReturnNonceRef = useRef(returnToAudioNonce);

    // Effect A: Scene-Scoped Minimal Highlight + Exact Multi-Column Page Calculation (NO page turning)
    useEffect(() => {
        const isKaraokeActive =
            (ttsStatus === 'playing' || ttsStatus === 'paused') &&
            Boolean(ttsQueue) &&
            ttsQueue.length > 0;

        const columnsEl = readerColumnsContainerRef?.current;
        const scrollEl = readerScrollContainerRef?.current;
        const containers = [columnsEl, scrollEl].filter((el): el is HTMLDivElement => Boolean(el));

        containers.forEach((c) => {
            if (isKaraokeActive) {
                c.classList.add('reader-karaoke-active');
            } else {
                c.classList.remove('reader-karaoke-active');
            }
        });

        document
            .querySelectorAll('.reader-karaoke-highlight, .reader-active-cue-block')
            .forEach((el) => {
                el.classList.remove('reader-karaoke-highlight', 'reader-active-cue-block');
            });

        const cssHighlights = getCssHighlights();
        if (cssHighlights) {
            cssHighlights.delete('reader-karaoke');
        }

        if (!isKaraokeActive) {
            activeSpokenLocationRef.current = null;
            lastCueCursorRef.current = {
                sceneKey: null,
                chunkIdx: -1,
                subTurnIdx: -1,
                startOffset: 0,
                nextSearchOffset: 0
            };
            return;
        }

        const currentChunk = ttsQueue[ttsCurrentChunkIndex];
        if (!currentChunk || !currentChunk.text) return;

        const cueSeq =
            typeof currentChunk.seqIdx === 'number'
                ? currentChunk.seqIdx
                : (ttsPlayingScene?.seqIdx ?? activeChapterIdx);
        const cueScene =
            typeof currentChunk.sceneIdx === 'number'
                ? currentChunk.sceneIdx
                : (ttsPlayingScene?.sceneIdx ?? (selectedScene || 0));
        const cueSceneKey = `${cueSeq}-${cueScene}`;

        let targetCueText = currentChunk.text;
        if (
            activeSubTurnIdx >= 0 &&
            Array.isArray(currentChunk.turns) &&
            currentChunk.turns[activeSubTurnIdx]?.text
        ) {
            targetCueText = String(currentChunk.turns[activeSubTurnIdx].text);
        }

        if (readerSettings.readingMode === 'paginated' && cueSeq !== activeChapterIdx) {
            activeSpokenLocationRef.current = {
                seqIdx: cueSeq,
                sceneIdx: cueScene,
                chunkIdx: ttsCurrentChunkIndex,
                pageIndex: 0,
                inDom: false
            };
            return;
        }

        const sceneContainerId =
            readerSettings.readingMode === 'paginated'
                ? `reader-paginated-scene-${cueSeq}-${cueScene}`
                : `reader-scene-${cueSeq}-${cueScene}`;
        const sceneRoot =
            document.getElementById(sceneContainerId) ||
            (readerSettings.readingMode === 'paginated' ? columnsEl : scrollEl);
        if (!sceneRoot) {
            activeSpokenLocationRef.current = {
                seqIdx: cueSeq,
                sceneIdx: cueScene,
                chunkIdx: ttsCurrentChunkIndex,
                pageIndex: 0,
                inDom: false
            };
            return;
        }

        const readerTextEls = sceneRoot.classList?.contains('reader-text')
            ? [sceneRoot]
            : Array.from(sceneRoot.querySelectorAll('.reader-text'));
        if (!readerTextEls || readerTextEls.length === 0) return;

        const textNodes: Text[] = [];
        readerTextEls.forEach((rEl) => {
            const walker = document.createTreeWalker(rEl, NodeFilter.SHOW_TEXT, null);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                textNodes.push(node as Text);
            }
        });
        if (textNodes.length === 0) return;

        let fullText = '';
        const charMap: Array<{ nodeIdx: number; offset: number }> = [];
        textNodes.forEach((tNode, nodeIdx) => {
            const str = tNode.textContent || '';
            for (let i = 0; i < str.length; i++) {
                charMap.push({ nodeIdx, offset: i });
                fullText += str[i];
            }
        });
        if (!fullText) return;

        const rawWords = String(targetCueText)
            .trim()
            .split(/\s+/)
            .map((w) => w.replace(/[^\w]/g, ''))
            .filter(Boolean);
        if (rawWords.length === 0) return;

        const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const buildRegex = (words: string[]) => {
            if (!words.length) return null;
            return new RegExp(words.map((w) => escapeRegex(w)).join('[^\\w]+'), 'i');
        };

        const findMatch = (searchFrom: number) => {
            const hay = searchFrom > 0 ? fullText.slice(searchFrom) : fullText;
            const candidates = [rawWords];
            if (rawWords.length > 6) candidates.push(rawWords.slice(0, 6));
            if (rawWords.length > 3) candidates.push(rawWords.slice(0, 4));
            for (const words of candidates) {
                try {
                    const re = buildRegex(words);
                    const m = re ? re.exec(hay) : null;
                    if (m) return { index: searchFrom + m.index, length: m[0].length };
                } catch {
                    // Ignore malformed candidate pattern
                }
            }
            return null;
        };

        const prevCursor = lastCueCursorRef.current;
        const sameScene = prevCursor.sceneKey === cueSceneKey;
        const isSamePosition =
            sameScene &&
            ttsCurrentChunkIndex === prevCursor.chunkIdx &&
            activeSubTurnIdx === (prevCursor.subTurnIdx ?? -1);
        const isAdvancing =
            sameScene &&
            (ttsCurrentChunkIndex > prevCursor.chunkIdx ||
                (ttsCurrentChunkIndex === prevCursor.chunkIdx &&
                    activeSubTurnIdx > (prevCursor.subTurnIdx ?? -1)));
        const searchOffset = isSamePosition
            ? Math.max(0, prevCursor.startOffset - 4)
            : isAdvancing
              ? Math.max(0, prevCursor.nextSearchOffset - 8)
              : 0;
        let match = findMatch(searchOffset);
        if (!match && searchOffset > 0) {
            match = findMatch(0);
        }

        if (match && match.index < charMap.length) {
            lastCueCursorRef.current = {
                sceneKey: cueSceneKey,
                chunkIdx: ttsCurrentChunkIndex,
                subTurnIdx: activeSubTurnIdx,
                startOffset: match.index,
                nextSearchOffset: match.index + Math.max(1, match.length)
            };

            const startMapping = charMap[match.index];
            const endIdx = Math.min(charMap.length - 1, match.index + match.length - 1);
            const endMapping = charMap[endIdx];

            if (startMapping && endMapping) {
                const startNode = textNodes[startMapping.nodeIdx];
                const endNode = textNodes[endMapping.nodeIdx];
                if (startNode && endNode) {
                    try {
                        const range = document.createRange();
                        range.setStart(startNode, startMapping.offset);
                        range.setEnd(endNode, endMapping.offset + 1);

                        const HighlightCtor = getHighlightCtor();
                        if (cssHighlights && HighlightCtor) {
                            cssHighlights.set('reader-karaoke', new HighlightCtor(range));
                        } else {
                            for (let ni = startMapping.nodeIdx; ni <= endMapping.nodeIdx; ni++) {
                                const p = textNodes[ni]?.parentElement;
                                if (p && !p.classList.contains('reader-text')) {
                                    p.classList.add('reader-karaoke-highlight');
                                }
                            }
                        }

                        const cueBlock =
                            startNode.parentElement?.closest('p, blockquote, h1, h2, h3, h4, li') ||
                            startNode.parentElement;
                        if (cueBlock && !cueBlock.classList.contains('reader-text')) {
                            cueBlock.classList.add('reader-active-cue-block');
                        }

                        let targetPage = 0;
                        if (
                            readerSettings.readingMode === 'paginated' &&
                            readerContainerWidth > 0 &&
                            columnsEl
                        ) {
                            const colGap =
                                typeof window !== 'undefined' && window.innerWidth <= 640 ? 24 : 48;
                            const stride = readerContainerWidth + colGap;
                            const containerRect = columnsEl.getBoundingClientRect();
                            const rects =
                                typeof range.getClientRects === 'function'
                                    ? range.getClientRects()
                                    : null;
                            const firstRect =
                                rects && rects.length > 0 ? rects[0] : range.getBoundingClientRect();
                            if (firstRect && (firstRect.width > 0 || firstRect.height > 0)) {
                                const relLeft = firstRect.left - containerRect.left;
                                targetPage = Math.max(0, Math.floor((relLeft + 4) / stride));
                            } else {
                                const colLeft = startNode.parentElement
                                    ? startNode.parentElement.offsetLeft || 0
                                    : 0;
                                targetPage = Math.max(0, Math.floor((colLeft + 4) / stride));
                            }
                            if (readerTotalPages > 0) {
                                targetPage = Math.min(readerTotalPages - 1, targetPage);
                            }
                        }

                        activeSpokenLocationRef.current = {
                            seqIdx: cueSeq,
                            sceneIdx: cueScene,
                            chunkIdx: ttsCurrentChunkIndex,
                            pageIndex: targetPage,
                            inDom: true,
                            rangeStartEl: cueBlock || startNode.parentElement
                        };
                        setSpokenFollowTick((t) => (t + 1) % 1000000);
                    } catch (err) {
                        console.warn('Karaoke range error:', err);
                    }
                }
            }
        }
    }, [
        ttsStatus,
        ttsCurrentChunkIndex,
        ttsQueue,
        activeSubTurnIdx,
        ttsPlayingScene,
        activeChapterIdx,
        selectedScene,
        readerSettings.readingMode,
        readerContainerWidth,
        readerTotalPages,
        readerColumnsContainerRef,
        readerScrollContainerRef
    ]);

    // Effect B: Auto-Follow Page Flip / Smooth Scroll (decoupled from readerPageIndex)
    useEffect(() => {
        const returnForced = returnToAudioNonce !== lastReturnNonceRef.current;
        if (returnForced) {
            lastReturnNonceRef.current = returnToAudioNonce;
        }
        const isPausedOrLoading = ['paused', 'generating', 'loading-model', 'loading-library'].includes(
            ttsStatus
        );
        if (ttsStatus !== 'playing' && !(returnForced && isPausedOrLoading)) return;
        if (!isFollowingAudio || (!returnForced && readerSettings.ttsAutoFollow === false)) return;
        const loc = activeSpokenLocationRef.current;
        if (!loc || !loc.inDom) return;

        if (readerSettings.readingMode === 'paginated') {
            if (loc.seqIdx === activeChapterIdx && typeof loc.pageIndex === 'number') {
                const currentPage = readerPageIndexRef ? readerPageIndexRef.current : readerPageIndex;
                if (
                    loc.pageIndex !== currentPage &&
                    loc.pageIndex >= 0 &&
                    loc.pageIndex < readerTotalPages
                ) {
                    turnReaderPage(loc.pageIndex - currentPage, true);
                }
            }
        } else {
            const scrollEl = readerScrollContainerRef?.current;
            const targetEl = loc.rangeStartEl;
            if (scrollEl && targetEl) {
                const rect = targetEl.getBoundingClientRect();
                const containerRect = scrollEl.getBoundingClientRect();
                if (
                    returnForced ||
                    rect.top < containerRect.top + 60 ||
                    rect.bottom > containerRect.bottom - 80
                ) {
                    if (isProgrammaticScrollRef) {
                        isProgrammaticScrollRef.current = true;
                        setTimeout(() => {
                            isProgrammaticScrollRef.current = false;
                        }, 650);
                    }
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [
        ttsStatus,
        isFollowingAudio,
        readerSettings.ttsAutoFollow,
        readerSettings.readingMode,
        activeChapterIdx,
        readerTotalPages,
        spokenFollowTick,
        returnToAudioNonce,
        readerPageIndex,
        readerPageIndexRef,
        turnReaderPage,
        readerScrollContainerRef,
        isProgrammaticScrollRef
    ]);

    return (
        <div
            className={`fixed inset-0 z-50 flex flex-col select-none ${themeClass} transition-colors duration-300 overflow-hidden`}
            onTouchStart={handleReaderTouchStart}
            onTouchMove={handleReaderTouchMove}
            onTouchEnd={handleReaderTouchEnd}
            style={{ touchAction: readerSettings.readingMode === 'paginated' ? 'none' : 'pan-y' }}
        >
            {(readerSettings.readerTheme === 'light' || readerSettings.readerTheme === 'sepia') && (
                <div className="reader-paper-texture" aria-hidden="true" />
            )}

            {/* AMBIENT STICKY CHAPTER BREADCRUMB (Scroll Mode - Visible when HUD is hidden) */}
            <div
                className={`fixed top-0 inset-x-0 z-25 transition-all duration-300 pointer-events-auto ${
                    !isReaderHudVisible &&
                    readerSettings.readingMode === 'scroll' &&
                    chaptersWithProse.length > 0
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-full pointer-events-none'
                }`}
                style={{
                    paddingTop: 'max(0.6rem, calc(env(safe-area-inset-top, 0px) + 0.35rem))',
                    paddingLeft: 'max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.5rem))',
                    paddingRight: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.5rem))'
                }}
            >
                <div
                    onClick={() => toggleReaderHud(true)}
                    className="mx-auto max-w-md px-3.5 py-1.5 rounded-full backdrop-blur-md reader-ui-bg/95 border reader-ui-border shadow-xs flex items-center justify-between gap-2.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all group"
                    title="Tap to reveal reading controls"
                >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gold shrink-0">
                            Chapter {displayChapter?.chapterNumber || visibleScrollChapter + 1}
                        </span>
                        <span className="text-ink-300 dark:text-stone-600 text-[10px] shrink-0">
                            •
                        </span>
                        <span className="text-[11.5px] font-serif font-semibold truncate text-ink-800 dark:text-stone-200">
                            {displayChapter?.title || 'Manuscript'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono font-semibold opacity-60 group-hover:opacity-100 transition-opacity">
                        <span>{scrollProgressPct}%</span>
                        <ChevronDown size={11} className="text-gold opacity-75" />
                    </div>
                </div>
            </div>

            {/* TOP FLOATING HUD (Auto-Hides) */}
            <div
                className={`fixed top-0 inset-x-0 z-30 transition-all duration-300 ${
                    isReaderHudVisible
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-full pointer-events-none'
                }`}
            >
                <div
                    className="mx-auto max-w-4xl px-3 sm:px-6 pt-[max(1.25rem,calc(env(safe-area-inset-top,0px)+0.5rem))] pb-2.5 flex items-center justify-between gap-2 backdrop-blur-md reader-ui-bg border-b reader-ui-border rounded-b-2xl shadow-sm"
                    style={{
                        paddingLeft: 'max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.5rem))',
                        paddingRight: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.5rem))'
                    }}
                >
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => {
                                saveReadingProgress(activeChapterIdx, 0, readerPageIndex);
                                setView('writer');
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl reader-ui-card text-xs font-semibold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer border"
                            title="Return to Writer Studio"
                        >
                            <ArrowLeft size={14} />
                            <span className="hidden sm:inline">Studio</span>
                        </button>

                        <button
                            onClick={() => {
                                setIsTocOpen(true);
                                setIsAppearanceOpen(false);
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl reader-ui-card text-xs font-semibold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer border ${
                                isTocOpen ? 'ring-2 ring-gold' : ''
                            }`}
                            title="Table of Contents (T)"
                        >
                            <List size={14} />
                            <span className="hidden sm:inline">Contents</span>
                        </button>
                    </div>

                    <div className="text-center truncate px-2 max-w-[180px] sm:max-w-[320px]">
                        <span className="text-[11px] font-mono font-bold opacity-70 uppercase tracking-wider block truncate">
                            {displayChapter
                                ? `Chapter ${displayChapter.chapterNumber}: ${displayChapter.title}`
                                : story.title || 'Manuscript'}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {(() => {
                            const btnSeq =
                                ttsStatus === 'playing' || ttsStatus === 'paused'
                                    ? (ttsPlayingScene?.seqIdx ?? activeChapterIdx)
                                    : readerSettings.readingMode === 'scroll'
                                      ? visibleScrollChapter
                                      : (selectedSequence ?? 0);
                            const btnSc =
                                ttsStatus === 'playing' || ttsStatus === 'paused'
                                    ? (ttsPlayingScene?.sceneIdx ?? (selectedScene || 0))
                                    : readerSettings.readingMode === 'scroll'
                                      ? (visibleScrollSceneRef?.current?.sceneIdx ?? 0)
                                      : (selectedScene || 0);
                            const btnAudioStatus = getSceneAudioStatus
                                ? getSceneAudioStatus(btnSeq, btnSc)
                                : {
                                      status: availableSceneAudioMap?.[`${btnSeq}-${btnSc}`]
                                          ? 'ready'
                                          : 'none'
                                  };
                            const hasSavedForBtn = btnAudioStatus?.status === 'ready';
                            const isBusy =
                                ttsStatus === 'loading-library' ||
                                ttsStatus === 'loading-model' ||
                                ttsStatus === 'generating';
                            return (
                                <button
                                    onClick={() =>
                                        isAuditioningVoice && stopAllAudioPlayback
                                            ? stopAllAudioPlayback()
                                            : toggleTtsPlayPause()
                                    }
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl reader-ui-card text-xs font-bold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer border ${
                                        ttsStatus === 'playing' || isAuditioningVoice
                                            ? 'ring-2 ring-gold bg-gold-tint/30'
                                            : isBusy
                                              ? 'border-gold bg-gold-tint/20'
                                              : ''
                                    }`}
                                    title={
                                        ttsStatus === 'playing'
                                            ? 'Pause Audio'
                                            : isAuditioningVoice
                                              ? 'Stop Voice Audition'
                                              : ttsStatus === 'paused'
                                                ? 'Resume Audio'
                                                : isBusy
                                                  ? ttsStatusMessage || `Loading Model (${ttsProgress}%)`
                                                  : hasSavedForBtn
                                                    ? 'Listen to Saved Audio'
                                                    : 'Listen with Live Narration'
                                    }
                                >
                                    {isBusy ? (
                                        <Loader2 size={14} className="animate-spin text-gold" />
                                    ) : ttsStatus === 'playing' ? (
                                        <Pause size={14} className="text-gold fill-current" />
                                    ) : isAuditioningVoice ? (
                                        <Square size={12} className="text-gold fill-current" />
                                    ) : (
                                        <Headphones size={14} />
                                    )}
                                    <span className="hidden sm:inline text-[11px] font-mono font-bold">
                                        {ttsStatus === 'playing'
                                            ? 'Pause'
                                            : isAuditioningVoice
                                              ? 'Stop'
                                              : ttsStatus === 'paused'
                                                ? 'Paused'
                                                : ttsStatus === 'generating'
                                                  ? `Preparing${
                                                        ttsGeneratingElapsedSec > 0
                                                            ? ` (${ttsGeneratingElapsedSec}s)`
                                                            : '...'
                                                    }`
                                                  : 'Listen'}
                                    </span>
                                    {hasSavedForBtn && !isBusy && (
                                        <span
                                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                                            title="Offline audio ready"
                                        />
                                    )}
                                    {(ttsStatus === 'loading-library' ||
                                        ttsStatus === 'loading-model') && (
                                        <span className="text-[10px] font-mono text-gold-ink">
                                            {ttsProgress}%
                                        </span>
                                    )}
                                </button>
                            );
                        })()}

                        <button
                            onClick={() => {
                                setIsAppearanceOpen((prev) => !prev);
                                setIsTocOpen(false);
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl reader-ui-card text-xs font-bold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer border ${
                                isAppearanceOpen ? 'ring-2 ring-gold' : ''
                            }`}
                            title="Typography & Appearance (A)"
                        >
                            <Type size={14} />
                            <span>Aa</span>
                        </button>

                        <button
                            onClick={() => {
                                const themes = ['light', 'sepia', 'dark', 'oled'];
                                const currIdx = themes.indexOf(readerSettings.readerTheme);
                                const nextTheme = themes[(currIdx + 1) % themes.length];
                                updateReaderSetting('readerTheme', nextTheme);
                            }}
                            className="p-1.5 rounded-xl reader-ui-card text-xs font-semibold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer border"
                            title={`Theme: ${readerSettings.readerTheme} (Click to change)`}
                        >
                            {readerSettings.readerTheme === 'dark' ||
                            readerSettings.readerTheme === 'oled' ? (
                                <Sun size={15} />
                            ) : (
                                <Moon size={15} />
                            )}
                        </button>

                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 rounded-xl reader-ui-card text-xs font-semibold hover:opacity-80 active:scale-95 transition-all shadow-2xs cursor-pointer hidden sm:flex border"
                            title="Toggle Fullscreen"
                        >
                            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN READING SURFACE */}
            <div
                className={`flex-1 relative w-full h-full overflow-hidden ${
                    readerSettings.readingMode === 'paginated'
                        ? 'flex flex-col justify-center items-center'
                        : 'block min-h-0'
                }`}
            >
                {readerSettings.readingMode === 'paginated' && (
                    <>
                        <div
                            onClick={() => {
                                if (
                                    justTappedRef?.current ||
                                    (touchHasDraggedRef && touchHasDraggedRef.current)
                                ) {
                                    return;
                                }
                                turnReaderPage(-1);
                            }}
                            className="absolute inset-y-0 left-0 w-[22%] sm:w-[18%] z-20 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start pl-2 sm:pl-4 group"
                            title="Previous Page (Left Arrow / Swipe Right)"
                        >
                            <div className="p-2 rounded-full reader-ui-card opacity-0 group-hover:opacity-70 transition-opacity shadow-md border">
                                <ChevronLeft size={20} />
                            </div>
                        </div>

                        <div
                            onClick={() => {
                                if (
                                    justTappedRef?.current ||
                                    (touchHasDraggedRef && touchHasDraggedRef.current)
                                ) {
                                    return;
                                }
                                turnReaderPage(1);
                            }}
                            className="absolute inset-y-0 right-0 w-[22%] sm:w-[18%] z-20 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end pr-2 sm:pr-4 group"
                            title="Next Page (Right Arrow / Space / Swipe Left)"
                        >
                            <div className="p-2 rounded-full reader-ui-card opacity-0 group-hover:opacity-70 transition-opacity shadow-md border">
                                <ChevronRight size={20} />
                            </div>
                        </div>

                        <div
                            onClick={() => {
                                if (
                                    justTappedRef?.current ||
                                    (touchHasDraggedRef && touchHasDraggedRef.current)
                                ) {
                                    return;
                                }
                                toggleReaderHud();
                            }}
                            className="absolute inset-y-0 left-[22%] right-[22%] sm:left-[18%] sm:right-[18%] z-20 cursor-pointer"
                        />
                    </>
                )}

                {readerSettings.readingMode === 'paginated' ? (
                    <div
                        className={`w-full ${widthClass} mx-auto h-full flex flex-col justify-center overflow-hidden relative z-15`}
                        style={{
                            paddingTop: 'max(4.25rem, calc(env(safe-area-inset-top, 0px) + 3rem))',
                            paddingBottom:
                                'max(3.75rem, calc(env(safe-area-inset-bottom, 0px) + 2.5rem))',
                            paddingLeft:
                                'max(1.25rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
                            paddingRight:
                                'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))'
                        }}
                    >
                        <div
                            className={`reader-spine-depth ${
                                (isTouchDragging && (touchDragOffset || 0) < 0) ||
                                pageSlideDirection === 'next'
                                    ? 'opacity-100'
                                    : 'opacity-0'
                            }`}
                        />
                        <div
                            className={`reader-spine-depth-right ${
                                (isTouchDragging && (touchDragOffset || 0) > 0) ||
                                pageSlideDirection === 'prev'
                                    ? 'opacity-100'
                                    : 'opacity-0'
                            }`}
                        />

                        {isSceneTransitioning && activeChapter && (
                            <div className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none transition-opacity duration-300">
                                <div className="px-6 py-4 rounded-2xl reader-ui-card border reader-ui-border shadow-2xl text-center max-w-sm space-y-1.5 animate-scale-in backdrop-blur-md">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold block">
                                        Chapter {activeChapter.chapterNumber}
                                    </span>
                                    <h4 className="font-serif font-bold text-base text-ink-900 dark:text-stone-100">
                                        {activeChapter.title}
                                    </h4>
                                    {activeChapter.summary && (
                                        <p className="text-[11px] font-sans opacity-60 italic line-clamp-2">
                                            {activeChapter.summary}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {hasAnyChapterProse && activeChapter ? (
                            <div
                                className={`w-full h-full overflow-hidden relative ${
                                    pageSlideDirection === 'next'
                                        ? 'reader-page-slide-next'
                                        : pageSlideDirection === 'prev'
                                          ? 'reader-page-slide-prev'
                                          : ''
                                }`}
                            >
                                <div
                                    key={`chapter-${activeChapterIdx}`}
                                    ref={readerColumnsContainerRef}
                                    className={`reader-page-column-container ${
                                        readerSettings.paragraphStyle === 'indented'
                                            ? 'reader-indented'
                                            : ''
                                    } reader-drop-cap reader-prose`}
                                    style={{
                                        ...textStyle,
                                        columnWidth:
                                            readerContainerWidth > 0
                                                ? `${readerContainerWidth}px`
                                                : '100%',
                                        columnGap:
                                            typeof window !== 'undefined' &&
                                            window.innerWidth <= 640
                                                ? '24px'
                                                : '48px',
                                        transform: `translateX(${
                                            -(
                                                readerPageIndex *
                                                ((readerContainerWidth || 600) +
                                                    (typeof window !== 'undefined' &&
                                                    window.innerWidth <= 640
                                                        ? 24
                                                        : 48))
                                            ) + (isTouchDragging ? touchDragOffset || 0 : 0)
                                        }px)`,
                                        transition:
                                            isTouchDragging || isSceneTransitioning
                                                ? 'none'
                                                : typeof window !== 'undefined' &&
                                                    window.innerWidth <= 640
                                                  ? 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)'
                                                  : 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)'
                                    }}
                                >
                                    <div className="reader-chapter-header space-y-1.5 text-center">
                                        <div className="inline-block px-3.5 py-1 rounded-full reader-ui-card border reader-ui-border text-[11px] font-mono font-bold uppercase tracking-widest text-gold shadow-2xs mb-2">
                                            <span className="reader-chapter-number">
                                                Chapter {activeChapter.chapterNumber}
                                            </span>
                                        </div>
                                        <h2 className="reader-chapter-title font-serif font-bold text-2xl sm:text-3xl text-ink-900 dark:text-stone-100 tracking-tight leading-tight">
                                            {activeChapter.title}
                                        </h2>
                                        {activeChapter.summary && (
                                            <p className="text-xs sm:text-sm font-sans italic opacity-70 max-w-md mx-auto pt-1 leading-relaxed">
                                                {activeChapter.summary}
                                            </p>
                                        )}
                                    </div>

                                    {activeChapterScenes.map((sc, scIdx) => {
                                        if (!sc.proseText) return null;
                                        const showDividerBefore =
                                            scIdx > 0 &&
                                            activeChapterScenes
                                                .slice(0, scIdx)
                                                .some((prevSc) => prevSc.hasProse);
                                        return (
                                            <div
                                                key={sc.sceneKey}
                                                id={`reader-paginated-scene-${activeChapterIdx}-${sc.sceneIdx}`}
                                                className="reader-scene-paginated-block"
                                            >
                                                {showDividerBefore && (
                                                    <div
                                                        className="reader-scene-divider-line"
                                                        role="separator"
                                                        aria-label="Scene break"
                                                    />
                                                )}
                                                <div
                                                    className="reader-text"
                                                    dangerouslySetInnerHTML={{
                                                        __html: formatReaderProse(sc.proseText)
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center my-auto p-8 rounded-2xl reader-ui-card max-w-md mx-auto space-y-4 border">
                                <div className="w-12 h-12 rounded-2xl bg-gold-tint text-gold flex items-center justify-center mx-auto">
                                    <PenTool size={22} />
                                </div>
                                <h3 className="text-lg font-bold font-serif">
                                    Prose Not Yet Drafted
                                </h3>
                                <p className="text-xs opacity-70 leading-relaxed">
                                    Chapter {activeChapter?.chapterNumber || 1} has not been written
                                    yet.
                                </p>
                                <div className="flex gap-2 justify-center pt-2">
                                    <button
                                        onClick={() => setView('writer')}
                                        className="px-4 py-2 bg-btn text-btn-ink rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                                    >
                                        Draft in Studio
                                    </button>
                                    {activeChapterIdx < storyChapters.length - 1 && (
                                        <button
                                            onClick={goToNextReaderChapter}
                                            className="px-4 py-2 reader-ui-card rounded-xl text-xs font-bold border shadow-2xs cursor-pointer"
                                        >
                                            Next Chapter
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        ref={readerScrollContainerRef}
                        onScroll={handleScroll}
                        onClick={(e) => {
                            if (
                                justTappedRef?.current ||
                                (touchHasDraggedRef && touchHasDraggedRef.current)
                            ) {
                                return;
                            }
                            if ((e.target as HTMLElement).closest('button, a, input, select')) {
                                return;
                            }
                            const screenW =
                                typeof window !== 'undefined' ? window.innerWidth : 400;
                            const screenH =
                                typeof window !== 'undefined' ? window.innerHeight : 800;
                            if (
                                e.clientX >= screenW * 0.18 &&
                                e.clientX <= screenW * 0.82 &&
                                e.clientY >= screenH * 0.12 &&
                                e.clientY <= screenH * 0.88
                            ) {
                                toggleReaderHud();
                            }
                        }}
                        className={`w-full ${widthClass} mx-auto h-full overflow-y-auto z-10 touch-scroll touch-scroll-y`}
                        style={{
                            WebkitOverflowScrolling: 'touch',
                            touchAction: 'pan-y',
                            paddingTop: 'max(5rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))',
                            paddingBottom:
                                'max(5rem, calc(env(safe-area-inset-bottom, 0px) + 3.5rem))',
                            paddingLeft:
                                'max(1.25rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
                            paddingRight:
                                'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))'
                        }}
                    >
                        {chaptersWithProse.length > 0 ? (
                            <div
                                className={`space-y-16 sm:space-y-24 ${
                                    readerSettings.paragraphStyle === 'indented'
                                        ? 'reader-indented'
                                        : ''
                                } reader-drop-cap reader-prose`}
                                style={textStyle}
                            >
                                {chaptersWithProse.map((ch, chIdx) => (
                                    <article
                                        key={`scroll-ch-${ch.seqIdx}`}
                                        id={`reader-chapter-${ch.seqIdx}`}
                                        className={`reader-chapter-container ${
                                            chIdx > 0
                                                ? 'mt-24 sm:mt-32 pt-16 border-t border-gold/20'
                                                : ''
                                        }`}
                                    >
                                        {chIdx > 0 && (
                                            <div className="flex items-center justify-center gap-3 mb-12 sm:mb-16 opacity-60">
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
                                                <span className="text-gold text-xs tracking-widest font-serif">
                                                    ✦ &nbsp; ✦ &nbsp; ✦
                                                </span>
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
                                            </div>
                                        )}

                                        <div className="reader-chapter-header space-y-2 text-center">
                                            <div className="inline-block px-3.5 py-1 rounded-full reader-ui-card border reader-ui-border text-[11px] font-mono font-bold uppercase tracking-widest text-gold shadow-2xs mb-2">
                                                <span className="reader-chapter-number">
                                                    Chapter {ch.chapterNumber}
                                                </span>
                                            </div>
                                            <h2 className="reader-chapter-title font-serif font-bold text-2xl sm:text-3xl md:text-4xl text-ink-900 dark:text-stone-100 tracking-tight leading-tight">
                                                {ch.title}
                                            </h2>
                                            {ch.summary && (
                                                <p className="text-xs sm:text-sm font-sans italic opacity-70 max-w-md mx-auto pt-1 leading-relaxed">
                                                    {ch.summary}
                                                </p>
                                            )}
                                        </div>

                                        {ch.scenes.map((sc, scIdx) => {
                                            if (!sc.proseText) return null;
                                            const showDividerBefore =
                                                scIdx > 0 &&
                                                ch.scenes
                                                    .slice(0, scIdx)
                                                    .some((prev) => prev.hasProse);
                                            return (
                                                <div
                                                    key={sc.sceneKey}
                                                    id={`reader-scene-${ch.seqIdx}-${sc.sceneIdx}`}
                                                >
                                                    {showDividerBefore && (
                                                        <div
                                                            className="reader-scene-divider-line my-10 sm:my-14"
                                                            role="separator"
                                                            aria-label={`Scene ${scIdx + 1}`}
                                                        >
                                                            <div className="flex items-center justify-center gap-3 opacity-70">
                                                                <div className="h-px w-10 sm:w-16 bg-gold/40" />
                                                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gold">
                                                                    Scene {scIdx + 1}
                                                                    {sc.title
                                                                        ? ` • ${sc.title}`
                                                                        : ''}
                                                                </span>
                                                                <div className="h-px w-10 sm:w-16 bg-gold/40" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div
                                                        className="reader-text"
                                                        dangerouslySetInnerHTML={{
                                                            __html: formatReaderProse(sc.proseText)
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </article>
                                ))}

                                <div className="pt-20 pb-16 text-center text-xs font-mono opacity-50 uppercase tracking-widest">
                                    End of Manuscript
                                </div>
                            </div>
                        ) : (
                            <div className="text-center my-auto p-8 rounded-2xl reader-ui-card max-w-md mx-auto space-y-4 border">
                                <h3 className="text-lg font-bold font-serif">
                                    Prose Not Yet Drafted
                                </h3>
                                <p className="text-xs opacity-70 leading-relaxed">
                                    No chapters have been drafted yet.
                                </p>
                                <button
                                    onClick={() => setView('writer')}
                                    className="px-4 py-2 bg-btn text-btn-ink rounded-xl text-xs font-bold cursor-pointer"
                                >
                                    Draft in Studio
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* FLOATING COMPACT AUDIO MINI-PLAYER */}
            {ttsIsMiniPlayerVisible && (
                <ReaderAudioPlayer
                    isReaderHudVisible={isReaderHudVisible}
                    story={story}
                    activeChapterIdx={activeChapterIdx}
                    selectedScene={selectedScene}
                    currentReaderSceneItem={currentReaderSceneItem}
                    flatStoryScenes={flatStoryScenes}
                    readerSettings={readerSettings}
                    updateReaderSetting={updateReaderSetting}
                    playbackSpeed={playbackSpeed}
                    ttsStatus={ttsStatus}
                    ttsProgress={ttsProgress}
                    ttsStatusMessage={ttsStatusMessage}
                    ttsError={ttsError}
                    setTtsError={setTtsError}
                    ttsQueue={ttsQueue}
                    ttsCurrentChunkIndex={ttsCurrentChunkIndex}
                    ttsCurrentTime={ttsCurrentTime}
                    ttsDuration={ttsDuration}
                    setTtsCurrentTime={setTtsCurrentTime}
                    ttsGeneratingElapsedSec={ttsGeneratingElapsedSec}
                    toggleTtsPlayPause={toggleTtsPlayPause}
                    stopTtsPlayback={stopTtsPlayback}
                    skipTtsChunk={skipTtsChunk}
                    showToast={showToast}
                    changeTtsVoice={changeTtsVoice}
                    audioDramaSettings={audioDramaSettings}
                    updateAudioDramaSetting={updateAudioDramaSetting}
                    audioDramaActiveSpeaker={audioDramaActiveSpeaker}
                    requestChunkAudio={requestChunkAudio}
                    setView={setView}
                    setSettingsTab={setSettingsTab}
                    availableSceneAudioMap={availableSceneAudioMap}
                    playStoredOrLiveSceneAudio={playStoredOrLiveSceneAudio}
                    playSceneAudio={playSceneAudio}
                    jumpToReaderScene={jumpToReaderScene}
                    ttsPlayingScene={ttsPlayingScene}
                    ttsResolvedSource={ttsResolvedSource}
                    isFollowingAudio={isFollowingAudio}
                    returnToActiveAudio={returnToActiveAudio}
                    skipAudioScene={skipAudioScene}
                    getSceneAudioStatus={getSceneAudioStatus}
                    isPlayingMasterSceneMp3={isPlayingMasterSceneMp3}
                    ttsAudioRef={ttsAudioRef}
                    isAuditioningVoice={isAuditioningVoice}
                    stopAllAudioPlayback={stopAllAudioPlayback}
                />
            )}

            {/* ZEN AMBIENT PROGRESS LINE */}
            <div
                className={`fixed bottom-0 inset-x-0 z-20 pointer-events-none transition-opacity duration-500 ${
                    !isReaderHudVisible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ height: '1.5px' }}
            >
                <div
                    className="h-full bg-gold/70 dark:bg-gold/60 transition-all duration-300"
                    style={{
                        width: `${
                            readerSettings.readingMode === 'paginated'
                                ? overallProgressPct
                                : scrollProgressPct
                        }%`
                    }}
                />
            </div>

            {/* BOTTOM FLOATING HUD & PROGRESS BAR */}
            <div
                className={`fixed bottom-0 inset-x-0 z-30 transition-all duration-300 ${
                    isReaderHudVisible
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-full pointer-events-none'
                }`}
            >
                <div
                    className="mx-auto max-w-4xl px-3 sm:px-6 pt-2.5 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] backdrop-blur-md reader-ui-bg border-t reader-ui-border rounded-t-2xl shadow-md space-y-2"
                    style={{
                        paddingLeft: 'max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.5rem))',
                        paddingRight: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.5rem))'
                    }}
                >
                    <div className="space-y-1">
                        <div
                            className="w-full bg-wash-strong h-1 rounded-full overflow-hidden"
                            title={`Overall Progress: ${
                                readerSettings.readingMode === 'paginated'
                                    ? overallProgressPct
                                    : scrollProgressPct
                            }%`}
                        >
                            <div
                                className="h-full bg-gold rounded-full transition-all duration-300"
                                style={{
                                    width: `${
                                        readerSettings.readingMode === 'paginated'
                                            ? overallProgressPct
                                            : scrollProgressPct
                                    }%`
                                }}
                            />
                        </div>

                        {readerSettings.readingMode === 'paginated' && readerTotalPages > 1 && (
                            <div
                                className="w-full bg-wash h-0.5 rounded-full overflow-hidden"
                                title={`Chapter Progress: ${chapterProgressPct}%`}
                            >
                                <div
                                    className="h-full bg-stone-500 dark:bg-stone-300 rounded-full transition-all duration-200"
                                    style={{ width: `${chapterProgressPct}%` }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] font-mono opacity-70">
                        <span className="truncate max-w-[140px] sm:max-w-[240px]">
                            {story.title ? story.title : 'Manuscript'} • Chapter{' '}
                            {displayChapter?.chapterNumber || activeChapterIdx + 1}
                        </span>

                        {readerSettings.readingMode === 'paginated' ? (
                            <span className="font-bold shrink-0 px-2">
                                Page {readerPageIndex + 1} of {readerTotalPages}
                            </span>
                        ) : (
                            <span className="font-bold shrink-0 px-2">
                                {scrollProgressPct}% Read
                            </span>
                        )}

                        <span className="shrink-0 text-right">
                            ~
                            {readerSettings.readingMode === 'paginated'
                                ? activeChapter?.totalReadingTime || 1
                                : totalManuscriptMinutes}{' '}
                            min left
                        </span>
                    </div>
                </div>
            </div>

            <ReaderTocDrawer
                isOpen={isTocOpen}
                onClose={() => setIsTocOpen(false)}
                tocSearchQuery={tocSearchQuery}
                setTocSearchQuery={setTocSearchQuery}
                storyChapters={storyChapters}
                flatStoryScenes={flatStoryScenes}
                readerSettings={readerSettings}
                visibleScrollChapter={visibleScrollChapter}
                setVisibleScrollChapter={setVisibleScrollChapter}
                activeChapterIdx={activeChapterIdx}
                readingProgress={readingProgress}
                saveReadingProgress={saveReadingProgress}
                jumpToReaderChapter={jumpToReaderChapter}
                jumpToReaderScene={jumpToReaderScene}
                scrollToElement={scrollToElement}
                getSceneAudioStatus={getSceneAudioStatus}
                availableSceneAudioMap={availableSceneAudioMap}
                playSceneAudio={playSceneAudio}
                playStoredOrLiveSceneAudio={playStoredOrLiveSceneAudio}
                isAnyAudioPlaying={isAnyAudioPlaying}
                stopAllAudioPlayback={stopAllAudioPlayback}
            />

            <ReaderAppearanceDrawer
                isOpen={isAppearanceOpen}
                onClose={() => setIsAppearanceOpen(false)}
                readerSettings={readerSettings}
                updateReaderSetting={updateReaderSetting}
            />
        </div>
    );
}
