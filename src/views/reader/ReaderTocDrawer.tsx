/**
 * @module views/reader/ReaderTocDrawer
 * Slide-over Table of Contents drawer for ReaderView with chapter search, offline audio
 * coverage indicators, and direct chapter/scene playback triggers.
 */

import { BookOpen, Check, Headphones, Pause, Play, Search, X } from '@/components/icons';
import type {
    ReaderChapterEntry,
    ReaderPlaySceneAudioFn,
    ReaderPlayStoredOrLiveFn,
    ReaderProgressState,
    ReaderSceneAudioStatusResult,
    ReaderSceneEntry,
    ReaderSettings
} from './types';

export interface ReaderTocDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    tocSearchQuery: string;
    setTocSearchQuery: (query: string) => void;
    storyChapters: ReaderChapterEntry[];
    flatStoryScenes: ReaderSceneEntry[];
    readerSettings: ReaderSettings;
    visibleScrollChapter: number;
    setVisibleScrollChapter?: (seqIdx: number) => void;
    activeChapterIdx: number;
    readingProgress: ReaderProgressState;
    saveReadingProgress: (
        seqIdx: number,
        sceneIdx: number,
        pageIdx?: number,
        scrollRatio?: number
    ) => void;
    jumpToReaderChapter: (
        chapterIdx: number,
        initialPage?: number,
        dir?: string,
        isProgrammatic?: boolean
    ) => void;
    jumpToReaderScene: (
        seqIdx: number,
        sceneIdx: number,
        dir?: string,
        isProgrammatic?: boolean
    ) => void;
    scrollToElement: (targetEl: HTMLElement, smooth?: boolean) => void;
    getSceneAudioStatus?: (seqIdx: number, sceneIdx: number) => ReaderSceneAudioStatusResult;
    availableSceneAudioMap?: Record<string, unknown>;
    playSceneAudio?: ReaderPlaySceneAudioFn;
    playStoredOrLiveSceneAudio?: ReaderPlayStoredOrLiveFn;
    isAnyAudioPlaying?: boolean;
    stopAllAudioPlayback?: () => void;
}

export function ReaderTocDrawer({
    isOpen,
    onClose,
    tocSearchQuery,
    setTocSearchQuery,
    storyChapters,
    flatStoryScenes,
    readerSettings,
    visibleScrollChapter,
    setVisibleScrollChapter,
    activeChapterIdx,
    readingProgress,
    saveReadingProgress,
    jumpToReaderChapter,
    jumpToReaderScene,
    scrollToElement,
    getSceneAudioStatus,
    availableSceneAudioMap = {},
    playSceneAudio,
    playStoredOrLiveSceneAudio,
    isAnyAudioPlaying = false,
    stopAllAudioPlayback
}: ReaderTocDrawerProps) {
    if (!isOpen) return null;

    const playableList = (flatStoryScenes || []).filter((sc) => sc.hasProse);
    const firstPlayable = playableList[0];
    const savedCount = playableList.filter((sc) =>
        getSceneAudioStatus
            ? getSceneAudioStatus(sc.seqIdx, sc.sceneIdx).status === 'ready'
            : Boolean(availableSceneAudioMap?.[`${sc.seqIdx}-${sc.sceneIdx}`])
    ).length;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            />

            <div
                className="relative w-full max-w-sm sm:max-w-md h-full reader-ui-card border-r shadow-2xl flex flex-col z-10 animate-fade-in"
                style={{
                    paddingLeft: 'max(0px, env(safe-area-inset-left, 0px))',
                    paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
                }}
            >
                <div className="p-4 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.5rem))] border-b flex items-center justify-between reader-ui-border">
                    <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-gold" />
                        <h2 className="font-serif font-bold text-base">Table of Contents</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer"
                        aria-label="Close Table of Contents"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-3 border-b reader-ui-border">
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-2.5 opacity-40" />
                        <input
                            type="text"
                            value={tocSearchQuery}
                            onChange={(e) => setTocSearchQuery(e.target.value)}
                            placeholder="Search chapters..."
                            className="w-full bg-wash pl-8 pr-3 py-1.5 rounded-xl text-xs outline-none focus:ring-1 focus:ring-gold"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {firstPlayable && (playSceneAudio || playStoredOrLiveSceneAudio) && (
                        <div className="mb-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isAnyAudioPlaying && stopAllAudioPlayback) {
                                        stopAllAudioPlayback();
                                        return;
                                    }
                                    onClose();
                                    if (playSceneAudio) {
                                        playSceneAudio(
                                            firstPlayable.seqIdx,
                                            firstPlayable.sceneIdx,
                                            { autoplay: true, follow: true }
                                        );
                                    } else {
                                        playStoredOrLiveSceneAudio?.(
                                            firstPlayable.seqIdx,
                                            firstPlayable.sceneIdx,
                                            'story'
                                        );
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gold-tint border border-gold-edge text-gold-ink font-semibold text-xs shadow-xs hover:bg-gold-tint/80 active:scale-98 transition-all cursor-pointer"
                                title={
                                    isAnyAudioPlaying
                                        ? 'Pause / Stop playing audio'
                                        : 'Listen continuously from the beginning of the story'
                                }
                            >
                                {isAnyAudioPlaying ? (
                                    <>
                                        <Pause size={13} className="fill-current text-gold-ink" />
                                        <span>Pause Audio</span>
                                    </>
                                ) : (
                                    <>
                                        <Play size={13} className="fill-current text-gold-ink ml-0.5" />
                                        <span>Listen from Start</span>
                                        {savedCount > 0 && (
                                            <span className="text-[10px] font-mono opacity-75">
                                                ({savedCount}/{playableList.length} saved)
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {storyChapters.map((ch) => {
                        const filteredScenes = ch.scenes.filter(
                            (sc) =>
                                !tocSearchQuery ||
                                (sc.scene?.title || '')
                                    .toLowerCase()
                                    .includes(tocSearchQuery.toLowerCase()) ||
                                (ch.title || '')
                                    .toLowerCase()
                                    .includes(tocSearchQuery.toLowerCase())
                        );

                        if (
                            filteredScenes.length === 0 &&
                            tocSearchQuery &&
                            !(ch.title || '').toLowerCase().includes(tocSearchQuery.toLowerCase())
                        ) {
                            return null;
                        }

                        const isCurrentChapter =
                            (readerSettings.readingMode === 'scroll'
                                ? visibleScrollChapter
                                : activeChapterIdx) === ch.seqIdx;
                        const chProseScenes = ch.scenes.filter((sc) => sc.hasProse);
                        const chSavedCount = chProseScenes.filter((sc) =>
                            getSceneAudioStatus
                                ? getSceneAudioStatus(ch.seqIdx, sc.sceneIdx).status === 'ready'
                                : Boolean(availableSceneAudioMap?.[`${ch.seqIdx}-${sc.sceneIdx}`])
                        ).length;

                        return (
                            <div key={ch.seqIdx} className="space-y-1">
                                <div
                                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                                        isCurrentChapter
                                            ? 'bg-gold-tint text-gold-ink border border-gold-edge'
                                            : 'hover:bg-wash opacity-90'
                                    }`}
                                >
                                    <button
                                        onClick={() => {
                                            onClose();
                                            if (readerSettings.readingMode === 'scroll') {
                                                const targetEl = document.getElementById(
                                                    `reader-chapter-${ch.seqIdx}`
                                                );
                                                if (targetEl) {
                                                    scrollToElement(targetEl, true);
                                                }
                                                if (setVisibleScrollChapter)
                                                    setVisibleScrollChapter(ch.seqIdx);
                                                saveReadingProgress(ch.seqIdx, 0, 0);
                                            } else {
                                                jumpToReaderChapter(ch.seqIdx, 0);
                                            }
                                        }}
                                        className="flex items-center gap-2 truncate flex-1 min-w-0 cursor-pointer text-left"
                                    >
                                        <BookOpen size={13} className="text-gold shrink-0" />
                                        <span className="truncate">
                                            Chapter {ch.chapterNumber}: {ch.title}
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {chSavedCount > 0 && (
                                            <span
                                                className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-sage-tint text-sage-800 border border-sage-edge"
                                                title={`${chSavedCount} of ${chProseScenes.length} scenes saved offline`}
                                            >
                                                {chSavedCount}/{chProseScenes.length}
                                            </span>
                                        )}
                                        {ch.hasAnyProse &&
                                            (playSceneAudio || playStoredOrLiveSceneAudio) && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (
                                                            isAnyAudioPlaying &&
                                                            stopAllAudioPlayback
                                                        ) {
                                                            stopAllAudioPlayback();
                                                            return;
                                                        }
                                                        onClose();
                                                        const firstScene = chProseScenes[0];
                                                        const scIdx = firstScene
                                                            ? firstScene.sceneIdx
                                                            : 0;
                                                        if (playSceneAudio) {
                                                            playSceneAudio(ch.seqIdx, scIdx, {
                                                                autoplay: true,
                                                                follow: true
                                                            });
                                                        } else {
                                                            playStoredOrLiveSceneAudio?.(
                                                                ch.seqIdx,
                                                                scIdx,
                                                                'story'
                                                            );
                                                        }
                                                    }}
                                                    className="p-1 rounded-md hover:bg-wash-strong text-gold-ink hover:text-gold transition-colors opacity-90 hover:opacity-100 cursor-pointer"
                                                    title={
                                                        isAnyAudioPlaying
                                                            ? 'Pause / Stop playing audio'
                                                            : `Listen from Chapter ${ch.chapterNumber}`
                                                    }
                                                >
                                                    {isAnyAudioPlaying ? (
                                                        <Pause
                                                            size={11}
                                                            className="fill-current text-gold-ink"
                                                        />
                                                    ) : (
                                                        <Play
                                                            size={11}
                                                            className="fill-current text-gold-ink"
                                                        />
                                                    )}
                                                </button>
                                            )}
                                        {ch.totalWords > 0 && (
                                            <span className="text-[10px] font-mono opacity-60">
                                                {ch.totalWords.toLocaleString()}w
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-0.5 pl-4">
                                    {ch.scenes.map((sc, scIdx) => {
                                        const sId = sc.sceneKey;
                                        const isCompleted = !!readingProgress.completedScenes?.[sId];
                                        const scAudioStatus = getSceneAudioStatus
                                            ? getSceneAudioStatus(ch.seqIdx, sc.sceneIdx).status
                                            : availableSceneAudioMap?.[`${ch.seqIdx}-${sc.sceneIdx}`]
                                              ? 'ready'
                                              : 'none';
                                        return (
                                            <div
                                                key={scIdx}
                                                className="w-full text-left px-2.5 py-1 rounded-lg text-[11px] flex items-center justify-between hover:bg-wash opacity-80 hover:opacity-100 transition-all group"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onClose();
                                                        if (readerSettings.readingMode === 'scroll') {
                                                            const targetEl =
                                                                document.getElementById(
                                                                    `reader-scene-${ch.seqIdx}-${sc.sceneIdx}`
                                                                ) ||
                                                                document.getElementById(
                                                                    `reader-chapter-${ch.seqIdx}`
                                                                );
                                                            if (targetEl) {
                                                                scrollToElement(targetEl, true);
                                                            }
                                                            if (setVisibleScrollChapter)
                                                                setVisibleScrollChapter(ch.seqIdx);
                                                            saveReadingProgress(
                                                                ch.seqIdx,
                                                                sc.sceneIdx,
                                                                0
                                                            );
                                                        } else {
                                                            jumpToReaderScene(ch.seqIdx, sc.sceneIdx);
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 truncate flex-1 min-w-0 cursor-pointer text-left"
                                                >
                                                    {isCompleted ? (
                                                        <Check
                                                            size={12}
                                                            className="text-emerald-500 shrink-0"
                                                        />
                                                    ) : sc.hasProse ? (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    ) : (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-mist-300 shrink-0" />
                                                    )}
                                                    <span className="truncate">
                                                        {sc.scene?.title || `Scene ${scIdx + 1}`}
                                                    </span>
                                                </button>
                                                <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                                                    {sc.wordCount > 0 && (
                                                        <span className="text-[9.5px] font-mono opacity-50">
                                                            {sc.wordCount.toLocaleString()}w
                                                        </span>
                                                    )}
                                                    {sc.hasProse &&
                                                        (playSceneAudio ||
                                                            playStoredOrLiveSceneAudio) && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (
                                                                        isAnyAudioPlaying &&
                                                                        stopAllAudioPlayback
                                                                    ) {
                                                                        stopAllAudioPlayback();
                                                                        return;
                                                                    }
                                                                    onClose();
                                                                    if (playSceneAudio) {
                                                                        playSceneAudio(
                                                                            ch.seqIdx,
                                                                            sc.sceneIdx,
                                                                            {
                                                                                autoplay: true,
                                                                                follow: true
                                                                            }
                                                                        );
                                                                    } else {
                                                                        playStoredOrLiveSceneAudio?.(
                                                                            ch.seqIdx,
                                                                            sc.sceneIdx,
                                                                            'story'
                                                                        );
                                                                    }
                                                                }}
                                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold transition-all cursor-pointer ${
                                                                    isAnyAudioPlaying
                                                                        ? 'bg-gold-tint text-gold-ink border border-gold-edge hover:bg-gold-tint/80'
                                                                        : scAudioStatus === 'ready'
                                                                          ? 'bg-sage-tint text-sage-800 border border-sage-edge hover:bg-sage-tint-strong'
                                                                          : scAudioStatus ===
                                                                              'stale'
                                                                            ? 'bg-amber-500/10 text-amber-700 border border-amber-500/30 hover:bg-amber-500/20'
                                                                            : 'text-ink-500 hover:text-gold-ink hover:bg-wash-strong opacity-75 group-hover:opacity-100'
                                                                }`}
                                                                title={
                                                                    isAnyAudioPlaying
                                                                        ? 'Pause / Stop playing audio'
                                                                        : scAudioStatus === 'ready'
                                                                          ? 'Play saved scene audio'
                                                                          : scAudioStatus ===
                                                                              'stale'
                                                                            ? 'Play (saved audio outdated vs edited text)'
                                                                            : 'Listen from this scene'
                                                                }
                                                            >
                                                                <Headphones size={10} />
                                                                {isAnyAudioPlaying ? (
                                                                    <Pause
                                                                        size={8}
                                                                        className="fill-current"
                                                                    />
                                                                ) : (
                                                                    <Play
                                                                        size={8}
                                                                        className="fill-current"
                                                                    />
                                                                )}
                                                            </button>
                                                        )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
