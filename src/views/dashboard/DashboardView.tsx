/**
 * @module views/dashboard/DashboardView
 * Story Overview Dashboard (`view === 'dashboard'`): combines `DashboardFolioSidebar`,
 * live Story Bible initialization banner, Core Blueprint & Macro Story Arc cards,
 * `DashboardEpistemicPanel`, Genre/Tone/Prose style controls, threads, character arcs,
 * and Canonical Continuity Ledger.
 */

import {
    Book,
    CheckCircle2,
    Compass,
    Edit3,
    EditButton,
    EditorialSubNav,
    Feather,
    GitBranch,
    Headphones,
    Layers,
    Loader2,
    Plus,
    RefreshCw,
    Shuffle,
    Sliders,
    Sparkles,
    Trash2,
    Users,
    Workflow,
    type EditorialSubNavProps
} from '@/components';
import {
    STORY_SO_FAR_BLOATED_WORD_THRESHOLD,
    ensureStoryMemory
} from '@/domain/continuity';
import {
    LENGTH_CONTROL,
    calculateStoryStats,
    computeSceneWordTarget,
    computeSequenceLengthPlan,
    isLegacyValenceEntry,
    parseStructuredGenre,
    parseStructuredStyle,
    parseStructuredTone,
    resolveCharacter,
    translateLoadingStepToHuman
} from '@/domain/story';
import { storyStore } from '@/services/storage';
import { countWords, parseMarkdown } from '@/utils';
import { DashboardEpistemicPanel } from './DashboardEpistemicPanel';
import { DashboardFolioSidebar } from './DashboardFolioSidebar';
import { DashboardSerialPanel } from './DashboardSerialPanel';
import { DashboardSeriesPanel } from './DashboardSeriesPanel';
import type { DashboardViewProps } from './types';

export function DashboardView({
    view,
    setView,
    story,
    setStory,
    theme,
    isInspectorMode,
    selectedSequence,
    selectedScene,
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
    loadingStep,
    initializingStoryId,
    continuousAutopilot,
    isRunningEditorialHarness,
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
    initStory,
    generateStoryArc,
    rebuildStorySoFar,
    startNextBook,
    epistemicViewTab,
    setEpistemicViewTab,
    epistemicScrubberCoord,
    setEpistemicScrubberCoord,
    epistemicFilterChar,
    setEpistemicFilterChar,
    epistemicSearchQuery,
    setEpistemicSearchQuery,
    setEditingPropModal,
    setEditingBeliefModal,
    handleDeleteProposition,
    handleInvalidateBelief,
    retroactivelyInjectClue,
    openEditModal,
    openFormModal,
    requestConfirm,
    showToast
}: DashboardViewProps) {
    const stats = calculateStoryStats(
        story as unknown as Parameters<typeof calculateStoryStats>[0]
    );
    const totalWords = stats.words;
    const readingTimeMin = stats.readingTimeMin;
    const allScenesCount = stats.totalScenes;
    const draftedScenesCount = stats.completedScenes + stats.draftedScenes;
    const progressPercent =
        allScenesCount > 0
            ? Math.min(100, Math.round((draftedScenesCount / allScenesCount) * 100))
            : 0;

    const readingHours = Math.floor(readingTimeMin / 60);
    const readingMins = readingTimeMin % 60;
    const readingTimeDisplay =
        readingHours > 0 ? `${readingHours}h ${readingMins}m` : `${readingMins}m`;

    const parsedGenre = parseStructuredGenre(story.style?.genre, story.style);
    const parsedTone = parseStructuredTone(story.style?.mood, story.style);
    const parsedStyle = parseStructuredStyle(story.style?.writing_guide, story.style);
    const thematicLexicon =
        (parsedStyle as unknown as { thematicLexicon?: string }).thematicLexicon || '';

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-16">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            {/* Split Layout: Left Column (Book Cover & Folio Stats), Right Column (Editorial Canvas) */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                <DashboardFolioSidebar
                    story={story}
                    setStory={setStory}
                    theme={theme}
                    isInspectorMode={isInspectorMode}
                    loadedImages={loadedImages}
                    loadingCover={loadingCover}
                    coverUploadInputRef={coverUploadInputRef}
                    generateCoverImage={generateCoverImage}
                    handleCoverUpload={handleCoverUpload}
                    deleteCoverImage={deleteCoverImage}
                    storyAudioSummary={storyAudioSummary}
                    availableSceneAudioMap={availableSceneAudioMap}
                    readingProgress={readingProgress}
                    enterReaderMode={enterReaderMode}
                    loading={loading}
                    isRunningEditorialHarness={isRunningEditorialHarness}
                    setView={setView}
                    setEditorialScopeSceneId={setEditorialScopeSceneId}
                    runAutonomousEditorialHarness={runAutonomousEditorialHarness}
                    handleExportEpub={handleExportEpub}
                    handleDownloadStoryAudio={handleDownloadStoryAudio}
                    handleExportAudioDramaTxt={handleExportAudioDramaTxt}
                    isExportingStoryAudio={isExportingStoryAudio}
                    isExportingSequenceAudio={isExportingSequenceAudio}
                    isExportingSceneAudio={isExportingSceneAudio}
                    isAudioAutopilotRunning={isAudioAutopilotRunning}
                    isAudioAutopilotQueued={isAudioAutopilotQueued}
                    handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                    handleResetStoryStage={handleResetStoryStage}
                    showToast={showToast}
                    progressPercent={progressPercent}
                    draftedScenesCount={draftedScenesCount}
                    allScenesCount={allScenesCount}
                    totalWords={totalWords}
                    readingTimeDisplay={readingTimeDisplay}
                />

                {/* RIGHT COLUMN: Rich Editorial Canvas (Full-Width Stacked Structure) */}
                <div className="flex-1 space-y-6 min-w-0 w-full">
                    {story?.id &&
                        initializingStoryId === story.id &&
                        (() => {
                            const liveInfo = translateLoadingStepToHuman(
                                loadingStep,
                                story as unknown as Parameters<
                                    typeof translateLoadingStepToHuman
                                >[1]
                            );
                            const castTotal = (story.cast || []).length;
                            const interviewedTotal = (story.cast || []).filter((c) =>
                                Boolean(c.voice_sample || c.details?.deep_profile)
                            ).length;
                            const hasLoreSource =
                                (story.lore || []).length > 0 || Boolean(story.world_primer);
                            const isLoreDone =
                                !hasLoreSource ||
                                Boolean(story.world_primer) ||
                                Boolean(story.status_quo);
                            const isConceptDone = Boolean(
                                story.status_quo || story.heart_of_the_dilemma || castTotal > 0
                            );
                            const isCastDone = castTotal > 0 && interviewedTotal >= castTotal;
                            const isArcDone = Boolean(story.core_thematic_argument);
                            return (
                                <div className="bg-surface p-5 sm:p-6 rounded-2xl border border-gold-edge shadow-sm space-y-4 animate-fade-in">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-gold-tint border border-gold-edge text-gold-ink flex items-center justify-center shrink-0">
                                                <Loader2 size={18} className="animate-spin" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono">
                                                    Building Story Bible
                                                    {continuousAutopilot
                                                        ? ' · Autopilot Active'
                                                        : ''}
                                                </div>
                                                <div className="text-sm font-serif font-bold text-ink-900 truncate">
                                                    {liveInfo.humanHeadline}
                                                </div>
                                                {loadingStep && (
                                                    <div className="text-xs text-ink-500 truncate">
                                                        {loadingStep}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setView('pipeline')}
                                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gold-tint hover:bg-gold/20 border border-gold-edge text-gold-ink flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                                        >
                                            <Workflow size={13} />
                                            <span>Watch Live</span>
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                        <div
                                            className={`px-3 py-2 rounded-xl border font-mono flex items-center gap-2 ${isLoreDone ? 'bg-sage-tint/50 border-sage-edge text-sage-800' : 'bg-inset border-edge text-ink-600'}`}
                                        >
                                            {isLoreDone ? (
                                                <CheckCircle2 size={13} className="shrink-0" />
                                            ) : (
                                                <Loader2
                                                    size={13}
                                                    className="animate-spin text-gold-ink shrink-0"
                                                />
                                            )}
                                            <span className="truncate">
                                                {hasLoreSource ? 'Lore Primer' : 'Concept Prep'}
                                            </span>
                                        </div>
                                        <div
                                            className={`px-3 py-2 rounded-xl border font-mono flex items-center gap-2 ${isConceptDone ? 'bg-sage-tint/50 border-sage-edge text-sage-800' : 'bg-inset border-edge text-ink-600'}`}
                                        >
                                            {isConceptDone ? (
                                                <CheckCircle2 size={13} className="shrink-0" />
                                            ) : (
                                                <span className="w-2 h-2 rounded-full bg-gold/60 shrink-0" />
                                            )}
                                            <span className="truncate">World &amp; Style</span>
                                        </div>
                                        <div
                                            className={`px-3 py-2 rounded-xl border font-mono flex items-center gap-2 ${isCastDone ? 'bg-sage-tint/50 border-sage-edge text-sage-800' : 'bg-inset border-edge text-ink-600'}`}
                                        >
                                            {isCastDone ? (
                                                <CheckCircle2 size={13} className="shrink-0" />
                                            ) : (
                                                <span className="w-2 h-2 rounded-full bg-gold/60 shrink-0" />
                                            )}
                                            <span className="truncate">
                                                Cast{' '}
                                                {castTotal > 0
                                                    ? `(${interviewedTotal}/${castTotal})`
                                                    : 'Pending'}
                                            </span>
                                        </div>
                                        <div
                                            className={`px-3 py-2 rounded-xl border font-mono flex items-center gap-2 ${isArcDone ? 'bg-sage-tint/50 border-sage-edge text-sage-800' : 'bg-inset border-edge text-ink-600'}`}
                                        >
                                            {isArcDone ? (
                                                <CheckCircle2 size={13} className="shrink-0" />
                                            ) : (
                                                <span className="w-2 h-2 rounded-full bg-gold/60 shrink-0" />
                                            )}
                                            <span className="truncate">Story Arc</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                    {story?.id &&
                        initializingStoryId !== story.id &&
                        !loading &&
                        story.concept &&
                        !story.status_quo &&
                        (!story.cast || story.cast.length === 0) && (
                            <div className="bg-surface p-5 rounded-2xl border border-edge-strong shadow-sm flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-ink-900 font-serif">
                                        Story Bible Ready to Initialize
                                    </div>
                                    <p className="text-xs text-ink-500 mt-0.5">
                                        Generate your world rules, starting cast, character
                                        interviews, and thematic story arc from this concept.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => initStory(false, { existingStory: story })}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-btn hover:bg-btn-hover text-btn-ink flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                                >
                                    <Sparkles size={13} className="text-amber-300" />
                                    <span>Initialize Story Bible</span>
                                </button>
                            </div>
                        )}

                    {/* Core Story Blueprint Card */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-6">
                        <div>
                            <input
                                aria-label="Story title"
                                className="w-full bg-transparent border-b border-transparent hover:border-edge-strong focus:border-gold outline-none font-bold text-2xl sm:text-3xl font-serif text-ink-900 transition-colors pb-1"
                                value={story.title || ''}
                                onChange={(e) =>
                                    setStory((prev) => ({ ...prev, title: e.target.value }))
                                }
                                placeholder="Untitled Story"
                            />
                        </div>

                        <div className="pt-2 border-t border-edge-soft space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                    {story.writing_mode === 'audio_drama' ? (
                                        <Headphones size={13} className="text-gold-ink" />
                                    ) : (
                                        <Book size={13} className="text-gold-ink" />
                                    )}
                                    <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                        Writing Mode
                                    </span>
                                </div>
                                <span
                                    className={`text-xs font-bold font-mono uppercase px-2.5 py-0.5 rounded-full ${story.writing_mode === 'audio_drama' ? 'bg-gold-tint text-gold-ink border border-gold-edge' : 'bg-mist-100 text-ink-600'}`}
                                >
                                    {story.writing_mode === 'audio_drama' ? 'Audio Drama' : 'Novel'}
                                </span>
                            </div>
                            <div
                                className="grid grid-cols-2 p-1 bg-inset rounded-xl border border-edge gap-1"
                                role="radiogroup"
                                aria-label="Writing Mode"
                            >
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={story.writing_mode !== 'audio_drama'}
                                    onClick={() => {
                                        if (story.writing_mode === 'novel') return;
                                        setStory((prev) => {
                                            const updated = { ...prev, writing_mode: 'novel' };
                                            if (storyStore?.saveStory && updated.id) {
                                                storyStore
                                                    .saveStory(
                                                        updated.id,
                                                        updated as unknown as Parameters<
                                                            typeof storyStore.saveStory
                                                        >[1]
                                                    )
                                                    .catch((err) =>
                                                        console.warn(
                                                            'Failed saving writing mode change:',
                                                            err
                                                        )
                                                    );
                                            }
                                            return updated;
                                        });
                                        showToast('Writing mode switched to Novel', 'info');
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                        story.writing_mode !== 'audio_drama'
                                            ? 'bg-surface text-ink-900 shadow-2xs border border-edge-strong'
                                            : 'text-ink-500 hover:text-ink-800'
                                    }`}
                                >
                                    <Book
                                        size={14}
                                        className={
                                            story.writing_mode !== 'audio_drama'
                                                ? 'text-gold-ink'
                                                : 'text-ink-400'
                                        }
                                    />
                                    <span>Novel</span>
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={story.writing_mode === 'audio_drama'}
                                    onClick={() => {
                                        if (story.writing_mode === 'audio_drama') return;
                                        setStory((prev) => {
                                            const updated = {
                                                ...prev,
                                                writing_mode: 'audio_drama'
                                            };
                                            if (storyStore?.saveStory && updated.id) {
                                                storyStore
                                                    .saveStory(
                                                        updated.id,
                                                        updated as unknown as Parameters<
                                                            typeof storyStore.saveStory
                                                        >[1]
                                                    )
                                                    .catch((err) =>
                                                        console.warn(
                                                            'Failed saving writing mode change:',
                                                            err
                                                        )
                                                    );
                                            }
                                            return updated;
                                        });
                                        showToast('Writing mode switched to Audio Drama', 'info');
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                        story.writing_mode === 'audio_drama'
                                            ? 'bg-surface text-ink-900 shadow-2xs border border-edge-strong'
                                            : 'text-ink-500 hover:text-ink-800'
                                    }`}
                                >
                                    <Headphones
                                        size={14}
                                        className={
                                            story.writing_mode === 'audio_drama'
                                                ? 'text-gold-ink'
                                                : 'text-ink-400'
                                        }
                                    />
                                    <span>Audio Drama</span>
                                </button>
                            </div>
                            <p className="text-xs text-ink-500 italic font-serif">
                                {story.writing_mode === 'audio_drama'
                                    ? 'Generates multi-voice audio drama-style scripts for audio generation.'
                                    : 'Generates standard narrative prose with rich scene description, narrative pacing, and dialogue tags.'}
                            </p>
                        </div>

                        {/* Concept & Logline */}
                        <div className="pt-4 border-t border-edge-soft space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                    Concept &amp; Logline
                                </span>
                                <EditButton
                                    title="Concept"
                                    value={story.concept || ''}
                                    onSave={() =>
                                        openEditModal('Concept', story.concept || '', (val) =>
                                            setStory((prev) => ({ ...prev, concept: val }))
                                        )
                                    }
                                />
                            </div>
                            <div
                                className="font-serif text-[16.5px] text-ink-800 leading-[1.75] prose max-w-none py-1"
                                dangerouslySetInnerHTML={{
                                    __html: parseMarkdown(
                                        story.concept || 'No concept generated yet.'
                                    )
                                }}
                            />
                        </div>

                        {/* Author's Note */}
                        <div className="pt-4 border-t border-edge-soft space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono">
                                    Author&apos;s Note &amp; Editorial Direction
                                </span>
                                <EditButton
                                    title="Author's Note"
                                    value={story.author_note || ''}
                                    onSave={() =>
                                        openEditModal(
                                            "Author's Note",
                                            story.author_note || '',
                                            (val) =>
                                                setStory((prev) => ({ ...prev, author_note: val }))
                                        )
                                    }
                                />
                            </div>
                            <div
                                className="font-serif text-[15.5px] text-ink-800 leading-[1.75] prose max-w-none bg-gold-tint/35 border-l-2 border-gold pl-4 py-2.5 rounded-r-xl"
                                dangerouslySetInnerHTML={{
                                    __html: parseMarkdown(
                                        story.author_note ||
                                            "No author's note set. Click edit to add global creative direction."
                                    )
                                }}
                            />
                        </div>

                        {/* Status Quo */}
                        {story.status_quo && (
                            <div className="pt-4 border-t border-edge-soft space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                        Opening World &amp; Status Quo
                                    </span>
                                    <EditButton
                                        title="Status Quo"
                                        value={story.status_quo}
                                        onSave={() =>
                                            openEditModal(
                                                'Status Quo',
                                                story.status_quo || '',
                                                (val) =>
                                                    setStory((prev) => ({
                                                        ...prev,
                                                        status_quo: val
                                                    }))
                                            )
                                        }
                                    />
                                </div>
                                <div
                                    className="text-[15px] text-ink-700 leading-[1.75] prose max-w-none py-1 font-serif"
                                    dangerouslySetInnerHTML={{
                                        __html: parseMarkdown(story.status_quo)
                                    }}
                                />
                            </div>
                        )}

                        {/* Story So Far */}
                        {(story.story_so_far || stats.draftedScenes > 0) && (() => {
                            const soFarText = String(story.story_so_far || '');
                            const soFarWords = countWords(soFarText);
                            const mem = ensureStoryMemory(story.story_memory);
                            const actSumCount = Object.keys(mem.acts).length;
                            const seqSumCount = Object.keys(mem.sequences).length;
                            const hasLegacySpatialBloat = /\[TERMINAL SPATIAL\s*&?\s*INTERACTION STATE\]/i.test(soFarText);
                            const needsCompression =
                                soFarWords > STORY_SO_FAR_BLOATED_WORD_THRESHOLD || hasLegacySpatialBloat;
                            return (
                                <div className="pt-4 border-t border-edge-soft space-y-2">
                                    <div className="flex flex-wrap justify-between items-center gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                                Story So Far (Continuity Synopsis)
                                            </span>
                                            {soFarWords > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-subtle text-ink-600 border border-edge-soft">
                                                    {soFarWords.toLocaleString()} words
                                                </span>
                                            )}
                                            {(actSumCount > 0 || seqSumCount > 0) && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                                    {actSumCount > 0 ? `${actSumCount} Act${actSumCount > 1 ? 's' : ''}` : ''}
                                                    {actSumCount > 0 && seqSumCount > 0 ? ' · ' : ''}
                                                    {seqSumCount > 0 ? `${seqSumCount} Seq${seqSumCount > 1 ? 's' : ''} compressed` : ''}
                                                </span>
                                            )}
                                            {needsCompression && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                                    Needs Compression
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {rebuildStorySoFar && stats.draftedScenes > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => rebuildStorySoFar()}
                                                    disabled={loading || continuousAutopilot}
                                                    title="Compress completed sequences/acts and rebuild Story So Far from drafted scenes"
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-edge bg-subtle hover:bg-surface text-ink-700 hover:text-ink-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                                                    Compress / Rebuild
                                                </button>
                                            )}
                                            <EditButton
                                                title="Story So Far"
                                                value={soFarText}
                                                onSave={() =>
                                                    openEditModal(
                                                        'Story So Far',
                                                        soFarText,
                                                        (val) =>
                                                            setStory((prev) => {
                                                                const updated = {
                                                                    ...prev,
                                                                    story_so_far: val,
                                                                    story_memory: {
                                                                        ...ensureStoryMemory(prev.story_memory),
                                                                        manualBaseText: val
                                                                    }
                                                                };
                                                                if (updated.id) {
                                                                    storyStore.saveStory(updated.id, updated).catch((err) =>
                                                                        console.warn('Failed saving edited Story So Far:', err)
                                                                    );
                                                                }
                                                                return updated;
                                                            })
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                    {soFarText ? (
                                        <div
                                            className="text-[15px] text-ink-700 leading-[1.75] prose max-w-none py-1 font-serif"
                                            dangerouslySetInnerHTML={{
                                                __html: parseMarkdown(soFarText)
                                            }}
                                        />
                                    ) : (
                                        <p className="text-xs italic text-ink-500 py-1">
                                            Drafted scenes exist without a synthesized synopsis yet. Click &ldquo;Compress / Rebuild&rdquo; to generate one.
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Macro Story Arc & Thematic Thesis Card (Tier 1.1) */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div>
                                <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex gap-2 items-center">
                                    <Sparkles size={15} /> Thematic Heart &amp; Story Arc
                                </h3>
                            </div>
                            <button
                                onClick={() => generateStoryArc()}
                                disabled={loading}
                                className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50 self-start sm:self-auto"
                            >
                                <Sparkles size={13} className="text-amber-300 fill-current" />{' '}
                                {story.core_thematic_argument ||
                                story.starting_value_state ||
                                (story.character_arcs && story.character_arcs.length > 0)
                                    ? 'Refresh Story Arc'
                                    : 'Develop Story Arc'}
                            </button>
                        </div>

                        {!story.core_thematic_argument &&
                        !story.starting_value_state &&
                        (!story.character_arcs || story.character_arcs.length === 0) ? (
                            <div className="text-center py-8 px-4 bg-ember-tint border border-dashed border-ember-edge rounded-xl space-y-2">
                                <p className="text-xs font-semibold text-ember-900">
                                    {initializingStoryId === story.id
                                        ? 'Developing Story Arc…'
                                        : 'Story Arc Not Yet Generated'}
                                </p>
                                <p className="text-xs text-ink-600 max-w-lg mx-auto">
                                    {initializingStoryId === story.id
                                        ? 'This section will populate automatically once the conceptual foundation and cast interviews finish.'
                                        : 'Generate the core philosophical argument, value transformation states, surprises, and character psychological truths.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-5 pt-1">
                                {/* Core Thematic Argument */}
                                {story.core_thematic_argument && (
                                    <div className="p-5 bg-gold-tint/40 rounded-xl border border-gold-edge space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                <Sparkles size={12} className="text-amber-500" /> Core
                                                Thematic Argument (Philosophical Thesis)
                                            </span>
                                            <EditButton
                                                title="Core Thematic Argument"
                                                value={story.core_thematic_argument}
                                                onSave={() =>
                                                    openEditModal(
                                                        'Core Thematic Argument',
                                                        story.core_thematic_argument || '',
                                                        (val) =>
                                                            setStory((prev) => ({
                                                                ...prev,
                                                                core_thematic_argument: val
                                                            }))
                                                    )
                                                }
                                            />
                                        </div>
                                        <p className="text-base sm:text-lg font-serif text-ink-900 font-medium italic leading-relaxed">
                                            &quot;{story.core_thematic_argument}&quot;
                                        </p>
                                    </div>
                                )}

                                {/* Inciting Incident */}
                                {story.inciting_incident && (
                                    <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                                Inciting Incident (Catalytic Disruption)
                                            </span>
                                            <EditButton
                                                title="Inciting Incident"
                                                value={story.inciting_incident}
                                                onSave={() =>
                                                    openEditModal(
                                                        'Inciting Incident',
                                                        story.inciting_incident || '',
                                                        (val) =>
                                                            setStory((prev) => ({
                                                                ...prev,
                                                                inciting_incident: val
                                                            }))
                                                    )
                                                }
                                            />
                                        </div>
                                        <div
                                            className="text-sm text-ink-800 leading-relaxed prose max-w-none font-serif"
                                            dangerouslySetInnerHTML={{
                                                __html: parseMarkdown(story.inciting_incident)
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Starting vs Ending Value State */}
                                {(story.starting_value_state || story.ending_value_state) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {story.starting_value_state && (
                                            <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold text-blush-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-blush-500" />{' '}
                                                        Starting Value State
                                                    </span>
                                                    <EditButton
                                                        title="Starting Value State"
                                                        value={story.starting_value_state}
                                                        onSave={() =>
                                                            openEditModal(
                                                                'Starting Value State',
                                                                story.starting_value_state || '',
                                                                (val) =>
                                                                    setStory((prev) => ({
                                                                        ...prev,
                                                                        starting_value_state: val
                                                                    }))
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <p className="text-xs sm:text-sm text-ink-800 leading-relaxed font-serif">
                                                    {story.starting_value_state}
                                                </p>
                                            </div>
                                        )}
                                        {story.ending_value_state && (
                                            <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold text-sage-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-sage-500" />{' '}
                                                        Ending Value State
                                                    </span>
                                                    <EditButton
                                                        title="Ending Value State"
                                                        value={story.ending_value_state}
                                                        onSave={() =>
                                                            openEditModal(
                                                                'Ending Value State',
                                                                story.ending_value_state || '',
                                                                (val) =>
                                                                    setStory((prev) => ({
                                                                        ...prev,
                                                                        ending_value_state: val
                                                                    }))
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <p className="text-xs sm:text-sm text-ink-800 leading-relaxed font-serif">
                                                    {story.ending_value_state}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Major Surprises & Reversals */}
                                {story.major_surprises_and_twists && (
                                    <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                <Shuffle size={12} className="text-gold-ink" />{' '}
                                                Major Surprises &amp; Reversals
                                            </span>
                                            <EditButton
                                                title="Major Surprises & Reversals"
                                                value={story.major_surprises_and_twists}
                                                onSave={() =>
                                                    openEditModal(
                                                        'Major Surprises & Reversals',
                                                        story.major_surprises_and_twists || '',
                                                        (val) =>
                                                            setStory((prev) => ({
                                                                ...prev,
                                                                major_surprises_and_twists: val
                                                            }))
                                                    )
                                                }
                                            />
                                        </div>
                                        <div
                                            className="text-xs sm:text-sm text-ink-700 leading-relaxed prose max-w-none font-serif"
                                            dangerouslySetInnerHTML={{
                                                __html: parseMarkdown(
                                                    story.major_surprises_and_twists
                                                )
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Series Plan card: only for a series, or to start a sequel */}
                    <DashboardSeriesPanel
                        story={story}
                        setStory={setStory}
                        loading={loading}
                        startNextBook={startNextBook}
                        openEditModal={openEditModal}
                        openFormModal={openFormModal}
                        requestConfirm={requestConfirm}
                    />

                    {/* Serial card: only for a serial */}
                    <DashboardSerialPanel story={story} />

                    {/* Secret Vault & Epistemic State Machine (GESM) Card */}
                    <DashboardEpistemicPanel
                        story={story}
                        setStory={setStory}
                        isInspectorMode={isInspectorMode}
                        epistemicViewTab={epistemicViewTab}
                        setEpistemicViewTab={setEpistemicViewTab}
                        epistemicScrubberCoord={epistemicScrubberCoord}
                        setEpistemicScrubberCoord={setEpistemicScrubberCoord}
                        epistemicFilterChar={epistemicFilterChar}
                        setEpistemicFilterChar={setEpistemicFilterChar}
                        epistemicSearchQuery={epistemicSearchQuery}
                        setEpistemicSearchQuery={setEpistemicSearchQuery}
                        setEditingPropModal={setEditingPropModal}
                        setEditingBeliefModal={setEditingBeliefModal}
                        handleDeleteProposition={handleDeleteProposition}
                        handleInvalidateBelief={handleInvalidateBelief}
                        retroactivelyInjectClue={retroactivelyInjectClue}
                        openEditModal={openEditModal}
                    />

                    {/* Genre Architecture & Universe Rules Card (Tier 0.1) */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div>
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                <Compass size={15} /> Genre Architecture &amp; Universe Rules{' '}
                                {isInspectorMode ? '(Tier 0.1)' : ''}
                            </h3>
                            <p className="text-xs text-ink-500 mt-0.5">
                                Narrative engine, contradiction synthesis, trope subversion, and
                                universe rules/constraints.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* Primary Narrative Engine */}
                            <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                        Primary Narrative Engine / Sub-Genre
                                    </span>
                                    <EditButton
                                        title="Genre / Narrative Engine"
                                        value={parsedGenre.primaryEngine || story.style?.genre || ''}
                                        onSave={() =>
                                            openEditModal(
                                                'Genre / Narrative Engine',
                                                parsedGenre.primaryEngine ||
                                                    story.style?.genre ||
                                                    '',
                                                (val) =>
                                                    setStory((prev) => ({
                                                        ...prev,
                                                        style: {
                                                            ...prev.style,
                                                            genre: val,
                                                            primary_engine: val
                                                        }
                                                    }))
                                            )
                                        }
                                    />
                                </div>
                                <div
                                    className="text-sm text-ink-800 leading-relaxed font-serif prose max-w-none"
                                    dangerouslySetInnerHTML={{
                                        __html: parseMarkdown(
                                            parsedGenre.primaryEngine ||
                                                story.style?.genre ||
                                                'Fiction'
                                        )
                                    }}
                                />
                            </div>

                            {/* Tropes: Played Straight vs Ruthlessly Subverted */}
                            {(parsedGenre.playedStraight || parsedGenre.ruthlesslySubverted) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {parsedGenre.playedStraight && (
                                        <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-sage-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                    🎯 Convention Played Straight
                                                </span>
                                                <EditButton
                                                    title="Convention Played Straight"
                                                    value={parsedGenre.playedStraight}
                                                    onSave={() =>
                                                        openEditModal(
                                                            'Convention Played Straight',
                                                            parsedGenre.playedStraight,
                                                            (val) =>
                                                                setStory((prev) => ({
                                                                    ...prev,
                                                                    style: {
                                                                        ...prev.style,
                                                                        tropes_played_straight: val
                                                                    }
                                                                }))
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div
                                                className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                                dangerouslySetInnerHTML={{
                                                    __html: parseMarkdown(
                                                        parsedGenre.playedStraight
                                                    )
                                                }}
                                            />
                                        </div>
                                    )}
                                    {parsedGenre.ruthlesslySubverted && (
                                        <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                    ⚡ Convention Ruthlessly Subverted
                                                </span>
                                                <EditButton
                                                    title="Convention Ruthlessly Subverted"
                                                    value={parsedGenre.ruthlesslySubverted}
                                                    onSave={() =>
                                                        openEditModal(
                                                            'Convention Ruthlessly Subverted',
                                                            parsedGenre.ruthlesslySubverted,
                                                            (val) =>
                                                                setStory((prev) => ({
                                                                    ...prev,
                                                                    style: {
                                                                        ...prev.style,
                                                                        tropes_subverted: val
                                                                    }
                                                                }))
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div
                                                className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                                dangerouslySetInnerHTML={{
                                                    __html: parseMarkdown(
                                                        parsedGenre.ruthlesslySubverted
                                                    )
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Universe Rules & Constraints */}
                            {parsedGenre.boundaries && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-blush-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                            📐 Universe Rules &amp; Inviolable Constraints
                                        </span>
                                        <EditButton
                                            title="Universe Rules & Constraints"
                                            value={parsedGenre.boundaries}
                                            onSave={() =>
                                                openEditModal(
                                                    'Universe Rules & Constraints',
                                                    parsedGenre.boundaries,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                boundaries: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(parsedGenre.boundaries)
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tone, Atmosphere & Sensory Lens Card (Tier 0.1) */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div>
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                <Feather size={15} /> Tone, Atmosphere &amp; Sensory Lens{' '}
                                {isInspectorMode ? '(Tier 0.1)' : ''}
                            </h3>
                            <p className="text-xs text-ink-500 mt-0.5">
                                Authorial triangulation and perceptual sensory filters.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* Authorial Triangulation */}
                            <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                        Authorial Triangulation (Stylistic Blend)
                                    </span>
                                    <EditButton
                                        title="Authorial Triangulation / Mood"
                                        value={
                                            parsedTone.authorialTriangulation ||
                                            story.style?.mood ||
                                            ''
                                        }
                                        onSave={() =>
                                            openEditModal(
                                                'Authorial Triangulation / Mood',
                                                parsedTone.authorialTriangulation ||
                                                    story.style?.mood ||
                                                    '',
                                                (val) =>
                                                    setStory((prev) => ({
                                                        ...prev,
                                                        style: {
                                                            ...prev.style,
                                                            mood: val,
                                                            authorial_triangulation: val
                                                        }
                                                    }))
                                            )
                                        }
                                    />
                                </div>
                                <div
                                    className="text-sm text-ink-800 leading-relaxed font-serif prose max-w-none"
                                    dangerouslySetInnerHTML={{
                                        __html: parseMarkdown(
                                            parsedTone.authorialTriangulation ||
                                                story.style?.mood ||
                                                'Dramatic'
                                        )
                                    }}
                                />
                            </div>

                            {/* Sensory Directive */}
                            {parsedTone.sensoryDirective && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                            Sensory Directive &amp; Performer&apos;s Lens
                                        </span>
                                        <EditButton
                                            title="Sensory Directive"
                                            value={parsedTone.sensoryDirective}
                                            onSave={() =>
                                                openEditModal(
                                                    'Sensory Directive',
                                                    parsedTone.sensoryDirective,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                sensory_directive: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(parsedTone.sensoryDirective)
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Prose Engineering & Stylistic Mechanics Card (Tier 0.1) */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div>
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                <Sliders size={15} /> Prose Style &amp; Narrative Voice{' '}
                                {isInspectorMode ? '(Tier 0.1)' : ''}
                            </h3>
                            <p className="text-xs text-ink-500 mt-0.5">
                                Camera focalizer bias, thematic vocabulary lexicon, syntactic
                                rhythm, and anti-patterns.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* Focalizer Bias */}
                            {parsedStyle.focalizerBias && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                            Focalizer Bias (Protagonist Camera Filter &amp; Blind
                                            Spots)
                                        </span>
                                        <EditButton
                                            title="Focalizer Bias"
                                            value={parsedStyle.focalizerBias}
                                            onSave={() =>
                                                openEditModal(
                                                    'Focalizer Bias',
                                                    parsedStyle.focalizerBias,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                focalizer_bias: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(parsedStyle.focalizerBias)
                                        }}
                                    />
                                </div>
                            )}

                            {/* Thematic Lexicon */}
                            {thematicLexicon && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                            Thematic Lexicon (Required Prose Vocabulary Domain)
                                        </span>
                                        <EditButton
                                            title="Thematic Lexicon"
                                            value={thematicLexicon}
                                            onSave={() =>
                                                openEditModal(
                                                    'Thematic Lexicon',
                                                    thematicLexicon,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                thematic_lexicon: val,
                                                                writing_guide: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(thematicLexicon)
                                        }}
                                    />
                                </div>
                            )}

                            {/* Syntactic Rhythm */}
                            {parsedStyle.syntacticRhythm && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                                            Syntactic Rhythm (Sentence Structure &amp; Cadence)
                                        </span>
                                        <EditButton
                                            title="Syntactic Rhythm"
                                            value={parsedStyle.syntacticRhythm}
                                            onSave={() =>
                                                openEditModal(
                                                    'Syntactic Rhythm',
                                                    parsedStyle.syntacticRhythm,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                syntactic_rhythm: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(parsedStyle.syntacticRhythm)
                                        }}
                                    />
                                </div>
                            )}

                            {/* Anti-Patterns */}
                            {parsedStyle.antiPatterns && (
                                <div className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-blush-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                            ⚠️ Prose Anti-Patterns (Stylistic Habits to Avoid)
                                        </span>
                                        <EditButton
                                            title="Prose Anti-Patterns"
                                            value={parsedStyle.antiPatterns}
                                            onSave={() =>
                                                openEditModal(
                                                    'Prose Anti-Patterns',
                                                    parsedStyle.antiPatterns,
                                                    (val) =>
                                                        setStory((prev) => ({
                                                            ...prev,
                                                            style: {
                                                                ...prev.style,
                                                                anti_patterns: val
                                                            }
                                                        }))
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(parsedStyle.antiPatterns)
                                        }}
                                    />
                                </div>
                            )}

                            {/* Novel Length Control & Pacing Ranges */}
                            {(() => {
                                const targetTotalWords = story.target_word_count || 80000;
                                const bookTypeKey = (story.book_type || 'popular') as keyof typeof LENGTH_CONTROL.BOOK_TYPES;
                                const bookTypeConfig = LENGTH_CONTROL.BOOK_TYPES[bookTypeKey] || {
                                    label: 'Custom',
                                    words: targetTotalWords,
                                    sceneFloor: 3
                                };
                                const bookTypeLabel = bookTypeConfig.label;

                                let activeSeqIdx = 0;
                                for (let i = 0; i < 8; i++) {
                                    const sScenes = story?.scenes?.[String(i)] || [];
                                    const hasUnwritten = sScenes.some((sc, scIdx) => {
                                        const e1 = story?.prose?.[`${i}-${scIdx}`];
                                        const e2 = story?.prose?.[`${i}-0-${scIdx}`];
                                        const e3 = sc.id ? story?.prose?.[sc.id] : undefined;
                                        const hasF = (
                                            entry:
                                                | string
                                                | { final?: string }
                                                | null
                                                | undefined
                                        ) => Boolean(typeof entry === 'object' && entry?.final);
                                        return !hasF(e1) && !hasF(e2) && !hasF(e3);
                                    });
                                    if (sScenes.length === 0 || hasUnwritten) {
                                        activeSeqIdx = i;
                                        break;
                                    }
                                }
                                const lengthStoryArg = story as unknown as Parameters<
                                    typeof computeSequenceLengthPlan
                                >[0];
                                const activePlan =
                                    story?.length_control?.sequences?.[activeSeqIdx] ||
                                    computeSequenceLengthPlan(lengthStoryArg, activeSeqIdx);
                                const nextSceneTarget = computeSceneWordTarget(
                                    story as unknown as Parameters<
                                        typeof computeSceneWordTarget
                                    >[0],
                                    activeSeqIdx,
                                    0
                                );

                                return (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                        <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-ink-400 uppercase font-mono block">
                                                    Scenes Per Sequence
                                                </span>
                                                <span className="text-xs font-mono text-ink-400">
                                                    Seq {activeSeqIdx + 1} Target
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold font-serif text-ink-900 block">
                                                {activePlan
                                                    ? `${activePlan.rangeMin} – ${activePlan.rangeMax} scenes (${activePlan.floor} floor)`
                                                    : `${story.generation_ranges?.scenes_per_sequence?.min || 3} – ${story.generation_ranges?.scenes_per_sequence?.max || 8} scenes`}
                                            </span>
                                            {activePlan?.justification ? (
                                                <p className="text-xs text-ink-500 italic pt-1.5 border-t border-edge-strong leading-relaxed">
                                                    {activePlan.justification}
                                                </p>
                                            ) : story.generation_ranges?.scenes_per_sequence
                                                  ?.justification ? (
                                                <p className="text-xs text-ink-500 italic pt-1.5 border-t border-edge-strong leading-relaxed">
                                                    {
                                                        story.generation_ranges.scenes_per_sequence
                                                            .justification
                                                    }
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-ink-400 uppercase font-mono block">
                                                    Novel Length &amp; Pacing
                                                </span>
                                                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-gold-tint text-gold-ink">
                                                    {bookTypeLabel}
                                                </span>
                                            </div>
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-sm font-bold font-serif text-ink-900">
                                                    {totalWords.toLocaleString()}{' '}
                                                    <span className="text-xs font-normal text-ink-500">
                                                        / {targetTotalWords.toLocaleString()} words
                                                    </span>
                                                </span>
                                                <span
                                                    className={`text-xs font-semibold ${activePlan?.driftState?.includes('expansive') ? 'text-amber-600' : activePlan?.driftState?.includes('lean') ? 'text-blue-600' : 'text-emerald-600'}`}
                                                >
                                                    {activePlan?.driftState || 'On track'}
                                                </span>
                                            </div>
                                            <div className="pt-1.5 border-t border-edge-strong flex items-center justify-between text-xs text-ink-500">
                                                <span>
                                                    Next Scene Target:{' '}
                                                    <strong className="font-semibold text-ink-800">
                                                        ~
                                                        {nextSceneTarget.targetWords.toLocaleString()}{' '}
                                                        words
                                                    </strong>
                                                </span>
                                                <span className="font-mono text-xs uppercase font-bold text-ink-600">
                                                    [{nextSceneTarget.register.name}]
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Active Narrative Threads Card */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                <GitBranch size={15} /> Active Narrative Threads (
                                {story.threads?.length || 0})
                            </h3>
                        </div>
                        <div className="space-y-3.5">
                            {(story.threads || []).map((t, i) => (
                                <div
                                    key={t.id}
                                    className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2 hover:border-gold-edge transition-colors"
                                >
                                    <div className="font-bold font-serif text-ink-900 text-sm flex justify-between items-center pb-2 border-b border-edge-strong">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-gold" />
                                            <span>{t.name}</span>
                                            <span className="text-xs font-mono text-ink-400 font-bold px-1.5 py-0.5 rounded bg-mist-100">
                                                {t.id}
                                            </span>
                                        </div>
                                        <EditButton
                                            title={`Thread: ${t.name}`}
                                            value={t.description}
                                            onSave={() =>
                                                openEditModal(
                                                    `Thread: ${t.name}`,
                                                    t.description,
                                                    (val) => {
                                                        setStory((prev) => {
                                                            const newThreads = [
                                                                ...(prev.threads || [])
                                                            ];
                                                            newThreads[i] = {
                                                                ...newThreads[i],
                                                                description: val
                                                            };
                                                            return {
                                                                ...prev,
                                                                threads: newThreads
                                                            };
                                                        });
                                                    }
                                                )
                                            }
                                        />
                                    </div>
                                    <div
                                        className="text-xs sm:text-sm text-ink-700 prose max-w-none leading-relaxed font-serif"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(t.description)
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Central Human Dilemma Banner (Truby Four-Corner Character Web) */}
                    {story.heart_of_the_dilemma && (
                        <div className="bg-gold-tint/40 p-6 sm:p-7 rounded-2xl border border-gold-edge shadow-sm space-y-2">
                            <div className="flex justify-between items-center pb-2 border-b border-gold-edge/60">
                                <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                    <Compass size={15} /> Central Human Dilemma{' '}
                                    {isInspectorMode ? '(Four-Corner Web)' : ''}
                                </h3>
                                <EditButton
                                    title="Central Human Dilemma"
                                    value={story.heart_of_the_dilemma}
                                    onSave={() =>
                                        openEditModal(
                                            'Central Human Dilemma',
                                            story.heart_of_the_dilemma || '',
                                            (val) =>
                                                setStory((prev) => ({
                                                    ...prev,
                                                    heart_of_the_dilemma: val
                                                }))
                                        )
                                    }
                                />
                            </div>
                            <p className="text-sm sm:text-base text-ink-900 font-serif leading-relaxed italic">
                                &quot;{story.heart_of_the_dilemma}&quot;
                            </p>
                        </div>
                    )}

                    {/* Character Psychological Arcs Card (Tier 1.1) */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                                <Users size={15} /> Character Psychological Arcs{' '}
                                {isInspectorMode ? '(Tier 1.1)' : ''}
                            </h3>
                        </div>
                        {!story.character_arcs || story.character_arcs.length === 0 ? (
                            <div className="text-center py-6 px-4 bg-ember-tint border border-dashed border-ember-edge rounded-xl">
                                <p className="text-xs text-ink-600">
                                    {initializingStoryId === story.id
                                        ? 'Character psychological arcs will appear here once the Story Arc Agent finishes.'
                                        : 'No character arcs generated yet. Run the Story Arc Agent to build psychological arcs.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {story.character_arcs.map((ca, cIdx) => {
                                    const charObj =
                                        resolveCharacter(
                                            ca.char_id || '',
                                            (story.cast || []) as unknown as Parameters<
                                                typeof resolveCharacter
                                            >[1]
                                        ) || (story.cast || [])[cIdx];
                                    const charDisplayName = charObj
                                        ? charObj.name
                                        : ca.char_id || `Character ${cIdx + 1}`;
                                    const cornerBadge = String(
                                        ca.corner_role || charObj?.corner_role || ''
                                    );
                                    return (
                                        <div
                                            key={cIdx}
                                            className="p-5 bg-inset rounded-xl border border-edge-strong space-y-3"
                                        >
                                            <div className="flex justify-between items-center pb-2 border-b border-edge-strong">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-base font-bold font-serif text-ink-900">
                                                        {charDisplayName}
                                                    </span>
                                                    {Boolean(charObj?.role) && (
                                                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-mist-200/70 text-ink-700">
                                                            {String(charObj.role)}
                                                        </span>
                                                    )}
                                                    {cornerBadge && (
                                                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink">
                                                            {cornerBadge.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <EditButton
                                                    title={`Arc: ${charDisplayName}`}
                                                    value={ca.description || ''}
                                                    onSave={() =>
                                                        openEditModal(
                                                            `Arc: ${charDisplayName}`,
                                                            ca.description || '',
                                                            (val) => {
                                                                setStory((prev) => {
                                                                    const newArcs = [
                                                                        ...(prev.character_arcs ||
                                                                            [])
                                                                    ];
                                                                    newArcs[cIdx] = {
                                                                        ...newArcs[cIdx],
                                                                        description: val
                                                                    };
                                                                    return {
                                                                        ...prev,
                                                                        character_arcs: newArcs
                                                                    };
                                                                });
                                                            }
                                                        )
                                                    }
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-xs">
                                                {ca.lie_believed && (
                                                    <div className="p-2.5 bg-blush-tint/40 border border-blush-edge/60 rounded-lg">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-bold text-blush-800 font-mono text-xs uppercase">
                                                                🔴 Safety Habit / Outlook:
                                                            </span>
                                                            <EditButton
                                                                title={`Safety Habit: ${charDisplayName}`}
                                                                value={ca.lie_believed}
                                                                onSave={() =>
                                                                    openEditModal(
                                                                        `Safety Habit: ${charDisplayName}`,
                                                                        ca.lie_believed || '',
                                                                        (val) => {
                                                                            setStory((prev) => {
                                                                                const newArcs = [
                                                                                    ...(prev.character_arcs ||
                                                                                        [])
                                                                                ];
                                                                                newArcs[cIdx] = {
                                                                                    ...newArcs[
                                                                                        cIdx
                                                                                    ],
                                                                                    lie_believed:
                                                                                        val
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    character_arcs:
                                                                                        newArcs
                                                                                };
                                                                            });
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <span className="text-ink-800 font-serif leading-snug">
                                                            {ca.lie_believed}
                                                        </span>
                                                    </div>
                                                )}
                                                {ca.truth_needed && (
                                                    <div className="p-2.5 bg-sage-tint/40 border border-sage-edge/60 rounded-lg">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-bold text-sage-800 font-mono text-xs uppercase">
                                                                🟢 Realization / Truth:
                                                            </span>
                                                            <EditButton
                                                                title={`Realization / Truth: ${charDisplayName}`}
                                                                value={ca.truth_needed}
                                                                onSave={() =>
                                                                    openEditModal(
                                                                        `Realization / Truth: ${charDisplayName}`,
                                                                        ca.truth_needed || '',
                                                                        (val) => {
                                                                            setStory((prev) => {
                                                                                const newArcs = [
                                                                                    ...(prev.character_arcs ||
                                                                                        [])
                                                                                ];
                                                                                newArcs[cIdx] = {
                                                                                    ...newArcs[
                                                                                        cIdx
                                                                                    ],
                                                                                    truth_needed:
                                                                                        val
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    character_arcs:
                                                                                        newArcs
                                                                                };
                                                                            });
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <span className="text-ink-800 font-serif leading-snug">
                                                            {ca.truth_needed}
                                                        </span>
                                                    </div>
                                                )}
                                                {ca.arc_catalyst && (
                                                    <div className="p-2.5 bg-amber-tint/40 border border-amber-edge/60 rounded-lg">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-bold text-amber-800 font-mono text-xs uppercase">
                                                                ⚡ Catalyst:
                                                            </span>
                                                            <EditButton
                                                                title={`Catalyst: ${charDisplayName}`}
                                                                value={ca.arc_catalyst}
                                                                onSave={() =>
                                                                    openEditModal(
                                                                        `Catalyst: ${charDisplayName}`,
                                                                        ca.arc_catalyst || '',
                                                                        (val) => {
                                                                            setStory((prev) => {
                                                                                const newArcs = [
                                                                                    ...(prev.character_arcs ||
                                                                                        [])
                                                                                ];
                                                                                newArcs[cIdx] = {
                                                                                    ...newArcs[
                                                                                        cIdx
                                                                                    ],
                                                                                    arc_catalyst:
                                                                                        val
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    character_arcs:
                                                                                        newArcs
                                                                                };
                                                                            });
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <span className="text-ink-800 font-serif leading-snug">
                                                            {ca.arc_catalyst}
                                                        </span>
                                                    </div>
                                                )}
                                                {ca.web_pressure && (
                                                    <div className="p-2.5 bg-gold-tint/40 border border-gold-edge/60 rounded-lg md:col-span-3">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-bold text-gold-ink font-mono text-xs uppercase">
                                                                ⚖️ Four-Corner Web Reflection:
                                                            </span>
                                                            <EditButton
                                                                title={`Four-Corner Dynamic: ${charDisplayName}`}
                                                                value={ca.web_pressure}
                                                                onSave={() =>
                                                                    openEditModal(
                                                                        `Four-Corner Dynamic: ${charDisplayName}`,
                                                                        ca.web_pressure || '',
                                                                        (val) => {
                                                                            setStory((prev) => {
                                                                                const newArcs = [
                                                                                    ...(prev.character_arcs ||
                                                                                        [])
                                                                                ];
                                                                                newArcs[cIdx] = {
                                                                                    ...newArcs[
                                                                                        cIdx
                                                                                    ],
                                                                                    web_pressure:
                                                                                        val
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    character_arcs:
                                                                                        newArcs
                                                                                };
                                                                            });
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <span className="text-ink-800 font-serif leading-snug">
                                                            {ca.web_pressure}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {ca.description && (
                                                <div
                                                    className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif prose max-w-none pt-1"
                                                    dangerouslySetInnerHTML={{
                                                        __html: parseMarkdown(ca.description)
                                                    }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Continuity Ledger (Canonical Facts) Card */}
                    <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div>
                                <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex gap-2 items-center">
                                    <Layers size={15} /> Established Story Facts &amp; Continuity
                                </h3>
                                <p className="text-xs text-ink-500 mt-0.5">
                                    Physical traits, key items, locations, opinions, and promises
                                    tracked across scenes.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                                {story.continuity_ledger &&
                                    story.continuity_ledger.some((entry) =>
                                        isLegacyValenceEntry(entry)
                                    ) && (
                                        <button
                                            onClick={() => {
                                                setStory((prev) => ({
                                                    ...prev,
                                                    continuity_ledger: (
                                                        prev.continuity_ledger || []
                                                    ).filter((e) => e && !isLegacyValenceEntry(e))
                                                }));
                                                showToast(
                                                    'Pruned redundant valence shift entries from ledger.',
                                                    'info'
                                                );
                                            }}
                                            className="text-xs bg-ember-tint hover:bg-ember-tint-strong text-ember-800 border border-ember-edge font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition-all shadow-2xs"
                                            title="Remove redundant emotional arc / valence shift items"
                                        >
                                            <Sparkles size={13} /> Clean Redundancies
                                        </button>
                                    )}
                                {story.continuity_ledger && story.continuity_ledger.length > 0 && (
                                    <button
                                        onClick={() => {
                                            requestConfirm({
                                                title: 'Clear Continuity Ledger?',
                                                message:
                                                    "Are you sure you want to clear all facts from this story's continuity ledger? This action cannot be undone.",
                                                confirmLabel: 'Clear Ledger',
                                                danger: true,
                                                onConfirm: () => {
                                                    setStory((prev) => ({
                                                        ...prev,
                                                        continuity_ledger: []
                                                    }));
                                                    showToast(
                                                        'Continuity ledger cleared for this story.',
                                                        'info'
                                                    );
                                                }
                                            });
                                        }}
                                        className="text-xs bg-blush-tint hover:bg-blush-tint-strong text-blush-700 border border-blush-edge font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition-all shadow-2xs"
                                        title="Clear all facts for this story"
                                    >
                                        <Trash2 size={13} /> Clear All
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        openFormModal({
                                            title: 'Record Continuity Fact',
                                            subtitle:
                                                'Add a concrete fact, object, agreement, or trait to maintain story continuity.',
                                            submitLabel: 'Add Fact',
                                            fields: [
                                                {
                                                    key: 'key',
                                                    label: 'Fact Key',
                                                    placeholder:
                                                        'e.g. Silas Hair Color, Vault Key Location, 48-Hour Truce',
                                                    type: 'text',
                                                    required: true
                                                },
                                                {
                                                    key: 'category',
                                                    label: 'Category',
                                                    type: 'select',
                                                    defaultValue: 'Appearance',
                                                    options: [
                                                        'Appearance',
                                                        'Object',
                                                        'Place',
                                                        'Opinion',
                                                        'Agreement',
                                                        'Lore',
                                                        'Setting',
                                                        'Character',
                                                        'Other'
                                                    ]
                                                },
                                                {
                                                    key: 'value',
                                                    label: 'Fact Detail',
                                                    placeholder:
                                                        'e.g. Silas has silver-streaked black hair and a scarred right eyebrow.',
                                                    type: 'textarea',
                                                    rows: 3,
                                                    required: true
                                                }
                                            ],
                                            onSubmit: (data) => {
                                                if (
                                                    !data.key ||
                                                    !data.key.trim() ||
                                                    !data.value ||
                                                    !data.value.trim()
                                                )
                                                    return;
                                                const key = data.key.trim();
                                                const value = data.value.trim();
                                                const category = data.category || 'Appearance';

                                                setStory((prev) => ({
                                                    ...prev,
                                                    continuity_ledger: [
                                                        ...(prev?.continuity_ledger || []),
                                                        {
                                                            key,
                                                            value,
                                                            category,
                                                            source_scene: 'Manual Input',
                                                            status: 'active',
                                                            created_at: Date.now()
                                                        }
                                                    ]
                                                }));
                                                showToast(`Added hard fact "${key}"`, 'success');
                                            }
                                        });
                                    }}
                                    className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-3.5 py-2 rounded-xl flex items-center gap-1 transition-all shadow-sm"
                                >
                                    <Plus size={14} /> Add Fact
                                </button>
                            </div>
                        </div>

                        {!story.continuity_ledger || story.continuity_ledger.length === 0 ? (
                            <div className="text-center py-8 text-ink-400 text-xs italic border border-dashed border-edge-strong rounded-xl bg-mist-50">
                                No continuity facts recorded yet. Facts introduced in scenes (hair
                                color, objects, places, opinions, agreements) will automatically
                                appear here.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {story.continuity_ledger.map((fact, idx) => {
                                    const cat = (fact.category || 'Fact').toLowerCase();
                                    let badgeClass =
                                        'bg-mist-200/80 text-ink-700 border-edge-300';
                                    if (cat === 'appearance')
                                        badgeClass =
                                            'bg-plum-tint-strong text-plum-800 border-plum-edge';
                                    else if (cat === 'object')
                                        badgeClass =
                                            'bg-ember-tint-strong text-ember-800 border-ember-edge';
                                    else if (cat === 'place')
                                        badgeClass =
                                            'bg-sage-tint-strong text-sage-800 border-sage-edge';
                                    else if (cat === 'opinion')
                                        badgeClass =
                                            'bg-blue-100 text-blue-800 border-azure-edge';
                                    else if (cat === 'agreement')
                                        badgeClass =
                                            'bg-iris-tint-strong text-iris-800 border-iris-edge';
                                    else if (cat === 'lore')
                                        badgeClass =
                                            'bg-lagoon-tint-strong text-lagoon-800 border-lagoon-edge';
                                    else if (cat === 'relationship')
                                        badgeClass =
                                            'bg-blush-tint-strong text-blush-800 border-blush-edge';

                                    return (
                                        <div
                                            key={idx}
                                            className="p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2 group hover:border-gold-edge transition-all"
                                        >
                                            <div className="flex justify-between items-start pb-2 border-b border-edge-strong">
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <span
                                                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md font-mono border ${badgeClass}`}
                                                    >
                                                        {fact.category || 'Fact'}
                                                    </span>
                                                    <h4 className="font-bold text-xs text-ink-900 font-serif">
                                                        {fact.key}
                                                    </h4>
                                                    {fact.source_scene && (
                                                        <span className="text-xs font-mono text-ink-400">
                                                            ({fact.source_scene})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex gap-1 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            openEditModal(
                                                                `Ledger Fact: ${fact.key}`,
                                                                fact.value,
                                                                (newVal) => {
                                                                    setStory((prev) => {
                                                                        const newLedger = [
                                                                            ...(prev.continuity_ledger ||
                                                                                [])
                                                                        ];
                                                                        newLedger[idx] = {
                                                                            ...newLedger[idx],
                                                                            value: newVal
                                                                        };
                                                                        return {
                                                                            ...prev,
                                                                            continuity_ledger:
                                                                                newLedger
                                                                        };
                                                                    });
                                                                }
                                                            );
                                                        }}
                                                        className="p-1 hover:bg-mist-200 rounded text-ink-500 hover:text-ink-900 transition-colors"
                                                        title="Edit Value"
                                                    >
                                                        <Edit3 size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            requestConfirm({
                                                                title: `Delete canonical fact "${fact.key}"?`,
                                                                message:
                                                                    'This will remove the fact from your continuity ledger and story memory.',
                                                                confirmLabel: 'Delete Fact',
                                                                danger: true,
                                                                onConfirm: () => {
                                                                    setStory((prev) => {
                                                                        const newLedger = (
                                                                            prev.continuity_ledger ||
                                                                            []
                                                                        ).filter(
                                                                            (_, i) => i !== idx
                                                                        );
                                                                        return {
                                                                            ...prev,
                                                                            continuity_ledger:
                                                                                newLedger
                                                                        };
                                                                    });
                                                                }
                                                            });
                                                        }}
                                                        className="p-1 hover:bg-mist-200 rounded text-ink-500 hover:text-blush-600 transition-colors"
                                                        title="Delete Fact"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-ink-700 leading-relaxed font-serif whitespace-pre-wrap">
                                                {fact.value}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
