/**
 * @module views/dashboard/DashboardFolioSidebar
 * Left sticky folio column on the Dashboard view: book cover artwork & upload/generate
 * actions, manuscript stats telemetry, reading mode launcher, editorial review launcher,
 * EPUB/MP3/script exports, Audio Autopilot status bar, and Story Reset dropdown.
 */

import type React from 'react';
import {
    Book,
    BookCoverAudioArt,
    BookOpen,
    Download,
    FileText,
    Headphones,
    Image,
    Loader2,
    RefreshCw,
    Scale,
    StoryResetDropdown,
    StylizedBlankCover,
    Trash2,
    Upload,
    type StylizedBlankCoverProps
} from '@/components';
import type { StoryResetStageKey } from '@/domain/lifecycle';
import { findNextUnwrittenScene, getCoverStyleIndex } from '@/domain/story';
import { useUiStore } from '@/stores';
import { storyStore } from '@/services/storage';
import type { DashboardAudioSummary, DashboardStory } from './types';

export interface DashboardFolioSidebarProps {
    story: DashboardStory;
    setStory: (updaterOrValue: DashboardStory | ((prev: DashboardStory) => DashboardStory)) => void;
    theme: string;
    isInspectorMode: boolean;
    loadedImages: {
        cover?: string | null;
        [key: string]: unknown;
    };
    loadingCover: boolean;
    coverUploadInputRef: React.RefObject<HTMLInputElement>;
    generateCoverImage: () => void | Promise<void>;
    handleCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    deleteCoverImage: () => void | Promise<void>;
    storyAudioSummary: DashboardAudioSummary;
    availableSceneAudioMap: Record<string, unknown>;
    readingProgress: {
        sequenceIndex?: number;
        [key: string]: unknown;
    };
    enterReaderMode: () => void;
    loading: boolean;
    isRunningEditorialHarness: boolean;
    setView: (viewId: string) => void;
    setEditorialScopeSceneId: (sceneId: string) => void;
    runAutonomousEditorialHarness: (opts: {
        mode: string;
        scopeSceneId: string;
        useLLM?: boolean;
    }) => void | Promise<void>;
    handleExportEpub: () => void | Promise<void>;
    handleDownloadStoryAudio: () => void | Promise<void>;
    handleExportAudioDramaTxt: () => void | Promise<void>;
    isExportingStoryAudio: boolean;
    isExportingSequenceAudio: boolean;
    isExportingSceneAudio: boolean;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    handleToggleAudioAutopilot: () => void;
    handleResetStoryStage: (stage: StoryResetStageKey) => void;
    showToast: (msg: string, type?: string) => void;
    progressPercent: number;
    draftedScenesCount: number;
    allScenesCount: number;
    totalWords: number;
    readingTimeDisplay: string;
}

export function DashboardFolioSidebar({
    story,
    setStory,
    theme,
    isInspectorMode,
    loadedImages,
    loadingCover,
    coverUploadInputRef,
    generateCoverImage,
    handleCoverUpload,
    deleteCoverImage,
    storyAudioSummary,
    availableSceneAudioMap,
    readingProgress,
    enterReaderMode,
    loading,
    isRunningEditorialHarness,
    setView,
    setEditorialScopeSceneId,
    runAutonomousEditorialHarness,
    handleExportEpub,
    handleDownloadStoryAudio,
    handleExportAudioDramaTxt,
    isExportingStoryAudio,
    isExportingSequenceAudio,
    isExportingSceneAudio,
    isAudioAutopilotRunning,
    isAudioAutopilotQueued,
    handleToggleAudioAutopilot,
    handleResetStoryStage,
    showToast,
    progressPercent,
    draftedScenesCount,
    allScenesCount,
    totalWords,
    readingTimeDisplay
}: DashboardFolioSidebarProps) {
    const setSelectedSequence = useUiStore((s) => s.setSelectedSequence);
    const setSelectedScene = useUiStore((s) => s.setSelectedScene);
    const nextScene = findNextUnwrittenScene(
        story as unknown as Parameters<typeof findNextUnwrittenScene>[0]
    );

    return (
        <div className="contents lg:block lg:w-[360px] xl:w-[400px] shrink-0 lg:space-y-6 lg:sticky lg:top-24">
            {/* Tactile Book Cover Frame */}
            <div className="-order-5 lg:order-none bg-surface p-4 pb-1 sm:p-5 rounded-2xl border border-edge shadow-sm">
                <div className="book-cover-frame mx-auto max-w-[168px] sm:max-w-[220px] lg:max-w-[280px]">
                    {/* Spine crease & shading overlays */}
                    <div className="book-spine-shadow" />
                    <div className="book-spine-crease" />
                    <div className="book-edge-trim" />

                    {loadedImages.cover ? (
                        <div className="relative group w-full h-full">
                            <img
                                src={loadedImages.cover}
                                className="w-full h-full object-cover"
                                alt="Novel Cover"
                            />
                            <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-xs">
                                <button
                                    onClick={generateCoverImage}
                                    disabled={loadingCover}
                                    className="bg-surface/90 hover:bg-surface text-ink-900 p-2.5 rounded-full shadow-lg transition-transform hover:scale-105"
                                    title="Regenerate Cover"
                                >
                                    <RefreshCw
                                        size={15}
                                        className={
                                            loadingCover
                                                ? 'animate-spin text-gold-ink'
                                                : 'text-ink-800'
                                        }
                                    />
                                </button>
                                <button
                                    onClick={() => coverUploadInputRef.current?.click()}
                                    className="bg-surface/90 hover:bg-surface text-ink-900 p-2.5 rounded-full shadow-lg transition-transform hover:scale-105"
                                    title="Upload Custom Image"
                                >
                                    <Upload size={15} className="text-ink-800" />
                                </button>
                                <button
                                    onClick={deleteCoverImage}
                                    className="bg-surface/90 hover:bg-surface text-blush-600 p-2.5 rounded-full shadow-lg transition-transform hover:scale-105"
                                    title="Remove Cover"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <StylizedBlankCover
                            story={story as StylizedBlankCoverProps['story']}
                            theme={theme}
                            isLarge={true}
                            onCycleStyle={(e) => {
                                e.stopPropagation();
                                const currentStyle =
                                    typeof story.coverStyle === 'number'
                                        ? story.coverStyle
                                        : getCoverStyleIndex(story.id || story.title);
                                const nextStyle = (currentStyle + 1) % 8;
                                setStory((prev) => ({ ...prev, coverStyle: nextStyle }));
                                storyStore.saveStory(story.id, {
                                    ...story,
                                    coverStyle: nextStyle
                                } as unknown as Parameters<typeof storyStore.saveStory>[1]);
                                showToast('Cover typography updated', 'info');
                            }}
                        />
                    )}

                    {/* Compositional Cover Art: Audio Drama Rings + Offline Audio Progress Arc */}
                    <BookCoverAudioArt
                        story={story}
                        audioCount={storyAudioSummary.readyCount}
                        totalScenes={storyAudioSummary.totalDrafted || allScenesCount}
                    />
                </div>

                <input
                    type="file"
                    ref={coverUploadInputRef}
                    onChange={handleCoverUpload}
                    className="hidden"
                    accept="image/*"
                />

                {/* Action Controls for Cover */}
                <div className="flex justify-center gap-5 mt-3">
                    <button
                        onClick={generateCoverImage}
                        disabled={loadingCover}
                        className="min-h-[44px] lg:min-h-0 text-ink-500 hover:text-ink-900 px-1 text-xs flex items-center gap-1.5 transition-colors font-semibold disabled:opacity-50"
                    >
                        {loadingCover ? (
                            <>
                                <Loader2 size={13} className="animate-spin text-gold-ink" />{' '}
                                Generating…
                            </>
                        ) : (
                            <>
                                <Image size={13} /> Generate cover
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => coverUploadInputRef.current?.click()}
                        disabled={loadingCover}
                        className="min-h-[44px] lg:min-h-0 text-ink-500 hover:text-ink-900 px-1 text-xs flex items-center gap-1.5 transition-colors font-semibold disabled:opacity-50"
                    >
                        <Upload size={13} /> Upload cover
                    </button>
                </div>
            </div>

            {/* Progress card: on a phone it sits right under the title once scenes exist */}
            <div
                className={`${allScenesCount > 0 ? '-order-2' : ''} lg:order-none bg-surface p-5 rounded-2xl border border-edge shadow-sm space-y-4`}
            >
                <div className="text-sm text-ink-600">
                    <strong className="text-ink-900">{progressPercent}%</strong> written ·{' '}
                    {draftedScenesCount} of {allScenesCount} scenes
                </div>

                <div className="w-full bg-mist-100 h-2 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gold rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-600">
                    <span>
                        <strong className="text-ink-900">{totalWords.toLocaleString()}</strong>{' '}
                        words
                    </span>
                    <span>
                        <strong className="text-ink-900">{readingTimeDisplay}</strong> to read
                    </span>
                    <span>
                        <strong className="text-ink-900">{story.cast?.length || 0}</strong> cast
                    </span>
                </div>

                {/* Enter Reading Mode Button */}
                <button
                    onClick={() => enterReaderMode()}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-btn hover:bg-btn-hover text-btn-ink font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                    <BookOpen size={14} className="text-btn-accent" />
                    <span>
                        {readingProgress.sequenceIndex !== undefined
                            ? 'Resume reading'
                            : 'Start reading'}
                    </span>
                </button>

                {nextScene && (
                    <div className="pt-4 border-t border-edge-soft space-y-3">
                        <div>
                            <span className="block text-[13px] text-ink-500">Next</span>
                            <span className="block text-base leading-snug font-bold font-serif text-ink-900">
                                Scene {nextScene.label}
                                {nextScene.title ? ` · ${nextScene.title}` : ''}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSequence(nextScene.sequenceIndex);
                                setSelectedScene(nextScene.sceneIndex);
                                setView('writer');
                            }}
                            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-surface hover:bg-lift border border-edge-strong text-ink-800 font-bold text-xs shadow-2xs flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                        >
                            Continue writing
                        </button>
                    </div>
                )}

                {/* 1-Click Autonomous Editorial Harness Action */}
                <div className="pt-2 border-t border-edge-soft space-y-2">
                    <button
                        onClick={() => {
                            setEditorialScopeSceneId('ALL');
                            setView('editorial');
                            if (draftedScenesCount > 0 && !isRunningEditorialHarness) {
                                runAutonomousEditorialHarness({
                                    mode: 'full_pipeline',
                                    scopeSceneId: 'ALL'
                                });
                            }
                        }}
                        disabled={isRunningEditorialHarness}
                        className="w-full py-2.5 px-3 rounded-xl bg-gold-tint hover:bg-gold/20 border border-gold-edge text-gold-ink font-bold text-xs shadow-2xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        title="Run Developmental Novel Review & Automated Manuscript Polish"
                    >
                        {isRunningEditorialHarness ? (
                            <>
                                <Loader2 size={14} className="animate-spin text-gold-ink" />
                                <span>Running Novel Review…</span>
                            </>
                        ) : (
                            <>
                                <Scale size={14} className="text-gold-ink" />
                                <span>
                                    {isInspectorMode
                                        ? 'Review & Revise Novel (CI/CD)'
                                        : 'Review & Polish Manuscript'}
                                </span>
                            </>
                        )}
                    </button>
                    {story.editorial_harness?.summary && (
                        <div
                            onClick={() => setView('editorial')}
                            className="p-2.5 rounded-xl bg-inset border border-edge-soft flex items-center justify-between text-[11px] font-mono text-ink-600 cursor-pointer hover:border-gold transition-colors"
                        >
                            <span>
                                {isInspectorMode ? 'D_total:' : 'Divergence:'}{' '}
                                <strong className="text-ink-900">
                                    {story.editorial_harness.summary.meanDivergence}
                                </strong>
                            </span>
                            <span>
                                {isInspectorMode ? 'Tickets:' : 'Notes:'}{' '}
                                <strong className="text-gold-ink">
                                    {story.editorial_harness.summary.verifiedTicketsCount}
                                </strong>
                            </span>
                            <span>
                                {isInspectorMode ? 'Patched:' : 'Refined:'}{' '}
                                <strong className="text-sage-800">
                                    {story.editorial_harness.summary.committedTransactions}
                                </strong>
                            </span>
                        </div>
                    )}
                </div>

                {/* Manuscript & Audio Export Actions */}
                <div className="pt-2 border-t border-edge-soft space-y-2.5">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleExportEpub}
                            className="flex-1 min-w-[115px] py-2 px-3 rounded-xl bg-gold-tint hover:bg-gold/20 border border-gold-edge text-gold-ink hover:text-gold-ink-deep font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                            title={
                                storyAudioSummary.readyCount > 0
                                    ? `Export Formatted EPUB (${storyAudioSummary.readyCount} audio scenes bundled)`
                                    : 'Export Formatted EPUB'
                            }
                        >
                            <Book size={13} className="text-gold-ink" />
                            <span>Export EPUB</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadStoryAudio}
                            disabled={
                                isExportingStoryAudio ||
                                isExportingSequenceAudio ||
                                isExportingSceneAudio
                            }
                            data-testid="export-story-mp3-btn"
                            className="flex-1 min-w-[115px] py-2 px-3 rounded-xl bg-surface hover:bg-lift border border-edge-strong hover:border-gold/50 text-ink-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-40"
                            title="Stitch generated scene audio into a full story MP3"
                        >
                            {isExportingStoryAudio ? (
                                <>
                                    <Loader2 size={13} className="animate-spin text-gold-ink" />
                                    <span>Exporting MP3…</span>
                                </>
                            ) : (
                                <>
                                    <Download size={13} className="text-gold-ink" />
                                    <span>Export MP3</span>
                                </>
                            )}
                        </button>
                        {story.writing_mode === 'audio_drama' && (
                            <button
                                onClick={handleExportAudioDramaTxt}
                                className="w-full py-1.5 px-3 rounded-xl bg-surface hover:bg-wash border border-edge-strong text-ink-700 hover:text-ink-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                                title="Export Full Audio Drama Script (.txt) formatted for Qwen 3 TTS"
                            >
                                <FileText size={13} className="text-ink-500" />
                                <span>Script (.txt)</span>
                            </button>
                        )}
                    </div>

                    {(storyAudioSummary.totalDrafted > 0 || storyAudioSummary.readyCount > 0) && (
                        <div className="bg-inset p-2.5 rounded-xl border border-edge-soft space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                <span className="text-ink-600 font-semibold truncate">
                                    Audio:{' '}
                                    <strong className="text-ink-900">
                                        {storyAudioSummary.readyCount}/
                                        {storyAudioSummary.totalDrafted ||
                                            storyAudioSummary.readyCount}
                                    </strong>{' '}
                                    Ready
                                    {storyAudioSummary.staleCount > 0 && (
                                        <span className="text-amber-600 font-semibold">
                                            {' '}
                                            · {storyAudioSummary.staleCount} Outdated
                                        </span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleToggleAudioAutopilot}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                                        isAudioAutopilotRunning
                                            ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                            : 'bg-surface hover:bg-wash border-edge-strong text-ink-700'
                                    }`}
                                    title={
                                        isAudioAutopilotRunning
                                            ? 'Stop Audio Autopilot'
                                            : 'Generate missing scene MP3s autonomously'
                                    }
                                >
                                    <Headphones size={10} />
                                    <span>
                                        {isAudioAutopilotRunning
                                            ? 'Stop Autopilot'
                                            : isAudioAutopilotQueued
                                              ? 'Queued'
                                              : 'Audio Autopilot'}
                                    </span>
                                </button>
                            </div>
                            <div className="w-full bg-mist-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        storyAudioSummary.totalDrafted > 0 &&
                                        storyAudioSummary.readyCount >=
                                            storyAudioSummary.totalDrafted
                                            ? 'bg-emerald-500'
                                            : 'bg-gold'
                                    }`}
                                    style={{
                                        width: `${
                                            storyAudioSummary.totalDrafted > 0
                                                ? Math.min(
                                                      100,
                                                      Math.round(
                                                          (storyAudioSummary.readyCount /
                                                              storyAudioSummary.totalDrafted) *
                                                              100
                                                      )
                                                  )
                                                : storyAudioSummary.readyCount > 0
                                                  ? 100
                                                  : 0
                                        }%`
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Stage-Level Story Reset Dropdown */}
                <div className="pt-2 border-t border-edge-soft flex justify-start">
                    <StoryResetDropdown
                        story={story}
                        onResetStage={handleResetStoryStage}
                        availableSceneAudioMap={availableSceneAudioMap}
                        disabled={loading}
                        align="left"
                        fullWidth={false}
                        dropUp={true}
                    />
                </div>
            </div>
        </div>
    );
}
