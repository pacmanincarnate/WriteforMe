/**
 * @module views/pipeline/PipelineNovelMode
 * Mode 1 of PipelineView: Novel Creation Control Center with hero completion card,
 * 3-Act / 8-Sequence production map, 5 creative phases, recent telemetry, and artifact feed.
 */

import React from 'react';
import {
    Activity,
    ArrowUpRight,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    Compass,
    GitBranch,
    Headphones,
    History,
    Layers,
    Loader2,
    Pause,
    PenTool,
    Sparkles,
    Users,
    Feather
} from '@/components';
import type { ExtendedCastArtifact, PipelineNextUp, PipelineNovelModeProps } from './types';

export const PipelineNovelMode: React.FC<PipelineNovelModeProps> = ({
    story,
    activeInfo,
    stats,
    artifacts,
    activeWorkBreadcrumb,
    isNovelGenerating,
    activePhaseNum,
    loadingStep,
    activePipelineWork,
    promptLog,
    continuousAutopilot,
    novelProgress,
    audioProgress,
    isAudioAutopilotRunning,
    isAudioAutopilotQueued,
    inspectActiveElement,
    inspectNextUpElement,
    handleAutopilot,
    toggleContinuousAutopilot,
    handleToggleAudioAutopilot,
    enterReaderMode,
    setPipelineDisplayMode,
    setSelectedSequence,
    setSelectedScene,
    setView
}) => {
    const nextUp = novelProgress.nextUp as PipelineNextUp | undefined;
    const latestChar = artifacts.latestCharacter as ExtendedCastArtifact | null;
    const latestSeq = artifacts.latestSequence as {
        title?: string;
        number?: number | string;
        plannedScenesCount?: number;
        summary?: string;
        dramatic_question?: string;
    } | null;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Hero Control Card: Full Novel Progress + Working On Right Now + Controls */}
            <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-edge shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                <span
                                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                                        isNovelGenerating ? 'bg-gold opacity-75' : 'bg-emerald-500 opacity-30'
                                    }`}
                                />
                                <span
                                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                        isNovelGenerating ? 'bg-gold' : 'bg-emerald-500'
                                    }`}
                                />
                            </div>
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-600">
                                {continuousAutopilot
                                    ? 'Novel Autopilot Running · View Locked Here'
                                    : isNovelGenerating
                                      ? 'Generation Step Active'
                                      : novelProgress.overallPct >= 100
                                        ? 'Novel Complete'
                                        : 'Control Center Standing By'}
                            </span>
                        </div>
                        <h3 className="font-serif font-bold text-xl sm:text-2xl text-ink-900 tracking-tight">
                            {story.title || 'Untitled Novel'}
                        </h3>
                        <p className="text-xs text-ink-500">
                            Estimated Full Novel Completion — weighted across Concept &amp; Arc, Cast Bible, Story
                            Architecture, Scene Drafting
                            {novelProgress.enableEditorialHarness ? ', and Editorial Polish' : ''}.
                        </p>
                    </div>

                    <div className="flex items-baseline gap-2 bg-inset border border-edge-strong rounded-2xl px-4 py-3 shrink-0">
                        <span className="text-3xl sm:text-4xl font-serif font-bold text-gold-ink tabular-nums">
                            {novelProgress.overallPct}%
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500 font-semibold">
                            Complete
                        </span>
                    </div>
                </div>

                {/* Overall Novel Progress Bar */}
                <div className="space-y-2">
                    <div className="w-full h-2.5 bg-mist-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
                            style={{
                                width: `${Math.max(novelProgress.overallPct, novelProgress.overallPct > 0 ? 3 : 0)}%`
                            }}
                        />
                    </div>

                    {/* 4 KPI Summary Pills */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Scenes Drafted
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {novelProgress.completedScenes} / {novelProgress.isSceneCountEstimated ? '~' : ''}
                                {novelProgress.estimatedTotalScenes}
                            </div>
                            <div className="text-[11px] text-ink-500 font-mono">
                                {novelProgress.plannedTotalScenes} planned
                                {novelProgress.isSceneCountEstimated ? ' · est. total' : ''}
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Manuscript Words
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {novelProgress.wordsWritten.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-ink-500 font-mono">
                                of {novelProgress.targetWords.toLocaleString()} target
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Story Sequences
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {novelProgress.wovenSeqCount} / 8 woven
                            </div>
                            <div className="text-[11px] text-ink-500 font-mono">
                                {novelProgress.actsCount} Acts · {novelProgress.seqCount}/8 mapped
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Cast &amp; Bible
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {novelProgress.castCount} Cast
                            </div>
                            <div className="text-[11px] text-ink-500 font-mono">
                                {novelProgress.interviewedCount} profiled · {(story.lore || []).length} lore
                            </div>
                        </div>
                    </div>
                </div>

                {/* Working On Right Now / Next Up Focus Box */}
                {isNovelGenerating ? (
                    <div className="p-4 rounded-xl bg-gold-tint/35 border border-gold-edge flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold-tint text-gold-ink border border-gold-edge">
                                    <Loader2 size={10} className="animate-spin" />
                                    Working On Right Now
                                </span>
                                <span className="text-[11px] font-mono font-semibold text-gold-ink">
                                    {activeInfo.phaseLabel}
                                </span>
                            </div>
                            <div className="font-serif font-bold text-base text-ink-900 truncate">
                                {activeWorkBreadcrumb}
                            </div>
                            <div className="text-xs text-ink-600 flex flex-wrap items-center gap-2">
                                {activePipelineWork?.subStep && (
                                    <span className="font-semibold text-ink-800">{activePipelineWork.subStep}</span>
                                )}
                                {loadingStep && <span className="text-ink-500 truncate">{loadingStep}</span>}
                            </div>
                        </div>
                        {activePipelineWork && (
                            <button
                                type="button"
                                onClick={inspectActiveElement}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-wash border border-gold-edge text-gold-ink flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
                            >
                                <span>Inspect Element</span>
                                <ArrowUpRight size={12} />
                            </button>
                        )}
                    </div>
                ) : (
                    <div
                        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                            nextUp?.elementType === 'complete'
                                ? 'bg-sage-tint/40 border-sage-edge'
                                : 'bg-inset border-edge-strong'
                        }`}
                    >
                        <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span
                                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                        nextUp?.elementType === 'complete'
                                            ? 'bg-sage-tint text-sage-800 border-sage-edge'
                                            : 'bg-surface text-ink-600 border-edge-strong'
                                    }`}
                                >
                                    {nextUp?.elementType === 'complete' ? 'All Stages Finished' : 'Next Up in Autopilot'}
                                </span>
                            </div>
                            <div className="font-serif font-bold text-base text-ink-900 truncate">
                                {nextUp?.title || 'Ready to Draft'}
                            </div>
                            <div className="text-xs text-ink-500">
                                {nextUp?.detail ||
                                    'Start Autopilot to continue generating from the current checkpoint.'}
                            </div>
                        </div>
                        {nextUp?.elementType !== 'complete' && (
                            <button
                                type="button"
                                onClick={inspectNextUpElement}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-wash border border-edge-strong text-ink-700 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
                            >
                                <span>Open Target</span>
                                <ChevronRight size={12} />
                            </button>
                        )}
                    </div>
                )}

                {/* Primary Control Actions */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-edge-subtle">
                    <button
                        type="button"
                        onClick={() =>
                            continuousAutopilot ? toggleContinuousAutopilot() : handleAutopilot({ fromSetup: false })
                        }
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs active:scale-95 cursor-pointer ${
                            continuousAutopilot
                                ? 'bg-blush-tint border border-blush-edge text-blush-800'
                                : 'bg-btn hover:bg-btn-hover text-btn-ink'
                        }`}
                    >
                        {continuousAutopilot ? (
                            <>
                                <Pause size={13} className="text-blush-600" />
                                <span>Pause Autopilot</span>
                            </>
                        ) : (
                            <>
                                <Feather size={13} className="text-amber-300" />
                                <span>
                                    {novelProgress.overallPct > 0 && novelProgress.overallPct < 100
                                        ? 'Resume Autopilot'
                                        : 'Start Continuous Autopilot'}
                                </span>
                            </>
                        )}
                    </button>

                    {isAudioAutopilotRunning ? (
                        <button
                            type="button"
                            onClick={() => setPipelineDisplayMode('audio')}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-gold-tint hover:bg-gold-tint-strong border border-gold-edge text-gold-ink transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                            <Headphones size={13} />
                            <span>Watch Audio Production</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleToggleAudioAutopilot}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                                isAudioAutopilotQueued
                                    ? 'bg-ember-tint border-ember-edge text-ember-800'
                                    : 'bg-surface hover:bg-wash border-edge-strong text-ink-800'
                            }`}
                        >
                            <Headphones size={13} className="text-plum-600" />
                            <span>
                                {isAudioAutopilotQueued
                                    ? 'Audio Queued (Click to Cancel)'
                                    : continuousAutopilot
                                      ? 'Queue Audio After Novel'
                                      : 'Audio Autopilot'}
                            </span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => enterReaderMode()}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface hover:bg-wash border border-edge-strong text-ink-800 transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs cursor-pointer"
                    >
                        <BookOpen size={13} />
                        <span>Reading Room</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPipelineDisplayMode('graph')}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors ml-auto flex items-center gap-1 cursor-pointer"
                    >
                        <GitBranch size={13} />
                        <span>View 22-Step Graph</span>
                    </button>
                </div>
            </div>

            {/* 3-Act / 8-Sequence Production Map */}
            <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Compass size={15} className="text-gold-ink" />
                        <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700">
                            Novel Structure Map · 3 Acts · 8 Sequences
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-ink-500">
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Complete
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-gold" /> Working
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-mist-300" /> Planned / Pending
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                    {novelProgress.sequences.map((seqItem) => {
                        const isWorkingSeq = Boolean(isNovelGenerating && activePipelineWork?.seqIdx === seqItem.index);
                        const tileBorder = isWorkingSeq
                            ? 'border-gold bg-gold-tint/25 ring-2 ring-gold/25'
                            : seqItem.status === 'complete'
                              ? 'border-sage-edge bg-sage-tint/30 hover:border-sage-600'
                              : seqItem.status === 'in_progress'
                                ? 'border-gold-edge bg-gold-tint/15 hover:border-gold'
                                : seqItem.status === 'planned'
                                  ? 'border-edge-strong bg-inset hover:border-gold-edge'
                                  : 'border-edge bg-canvas/60 opacity-75';

                        return (
                            <button
                                key={seqItem.index}
                                type="button"
                                onClick={() => {
                                    if (seqItem.isWoven || seqItem.index < novelProgress.seqCount) {
                                        setSelectedSequence(seqItem.index);
                                        setView('sequence_dashboard');
                                    } else {
                                        setView('structure');
                                    }
                                }}
                                className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-2 cursor-pointer ${tileBorder}`}
                                title={`Act ${seqItem.actNumber} · Seq ${seqItem.number}: ${seqItem.title}`}
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-[10px] font-mono font-bold text-ink-500">
                                            Act {seqItem.actNumber} · S{seqItem.number}
                                        </span>
                                        {isWorkingSeq ? (
                                            <span className="w-2 h-2 rounded-full bg-gold animate-ping shrink-0" />
                                        ) : seqItem.status === 'complete' ? (
                                            <CheckCircle2 size={12} className="text-sage-700 shrink-0" />
                                        ) : null}
                                    </div>
                                    <div className="font-serif font-bold text-xs text-ink-900 truncate">
                                        {seqItem.title}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-mono text-ink-600">
                                        <span>
                                            {seqItem.completedScenes}/
                                            {seqItem.isWoven ? seqItem.plannedScenes : `~${seqItem.estimatedScenes}`}
                                        </span>
                                        {isWorkingSeq && activePipelineWork?.sceneLabel ? (
                                            <span className="text-gold-ink font-bold">
                                                Sc {activePipelineWork.sceneLabel}
                                            </span>
                                        ) : (
                                            <span>{seqItem.pct}%</span>
                                        )}
                                    </div>
                                    <div className="w-full h-1 bg-mist-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                seqItem.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                            }`}
                                            style={{
                                                width: `${seqItem.pct > 0 ? Math.max(seqItem.pct, 8) : isWorkingSeq ? 15 : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2-Column Detail Grid: 5 Creation Phases + Activity & Live Artifacts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (5 Cols): The 5 Creative Journey Phases */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-500">
                            Story Creation Phases
                        </span>
                        <span className="text-xs font-mono font-semibold text-gold-ink">5 Editorial Stages</span>
                    </div>

                    {/* Phase 1: Concept & Thematic Arc */}
                    {(() => {
                        const ph = novelProgress.phases[1];
                        const isActive = isNovelGenerating && activePhaseNum === 1;
                        return (
                            <div
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gold-tint text-gold-ink font-mono font-bold text-xs flex items-center justify-center border border-gold-edge shrink-0">
                                            1
                                        </span>
                                        <h4 className="font-serif font-bold text-sm text-ink-900">
                                            Concept &amp; Thematic Heart
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                            isActive
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                                : ph.status === 'complete'
                                                  ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                  : ph.status === 'in_progress'
                                                    ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                                    : 'bg-mist-100 border-edge text-ink-500'
                                        }`}
                                    >
                                        {isActive ? 'Active' : `${ph.pct}% · ${ph.label}`}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-600 line-clamp-2 mb-2.5">
                                    {story.core_thematic_argument ||
                                        story.concept ||
                                        'Initial premise, status quo, and thematic thesis guiding the novel.'}
                                </p>
                                <div className="w-full h-1 bg-mist-200 rounded-full overflow-hidden mb-2.5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            ph.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                        }`}
                                        style={{ width: `${ph.pct}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-xs pt-2 border-t border-edge-subtle/50">
                                    <span className="text-ink-400 font-mono text-[11px]">
                                        {story.core_thematic_argument
                                            ? 'Story Arc Established'
                                            : story.status_quo
                                              ? 'Bible Initialized'
                                              : 'Awaiting Initialization'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setView('dashboard')}
                                        className="text-gold-ink hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                        <span>Overview</span>
                                        <ChevronRight size={11} />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase 2: Cast & World Bible */}
                    {(() => {
                        const ph = novelProgress.phases[2];
                        const isActive = isNovelGenerating && activePhaseNum === 2;
                        return (
                            <div
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gold-tint text-gold-ink font-mono font-bold text-xs flex items-center justify-center border border-gold-edge shrink-0">
                                            2
                                        </span>
                                        <h4 className="font-serif font-bold text-sm text-ink-900">
                                            Cast &amp; World Bible
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                            isActive
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                                : ph.status === 'complete'
                                                  ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                  : ph.status === 'in_progress'
                                                    ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                                    : 'bg-mist-100 border-edge text-ink-500'
                                        }`}
                                    >
                                        {isActive ? 'Active' : `${ph.pct}% · ${ph.label}`}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-600 mb-2.5">
                                    {novelProgress.castCount > 0
                                        ? `${novelProgress.castCount} cast member(s) (${novelProgress.interviewedCount} interviewed), ${Object.keys(story.relationships || {}).length} dynamic axes & ${(story.lore || []).length} world archives.`
                                        : 'Cast development, four-corner role allocation, voice profiles, and world archives.'}
                                </p>
                                <div className="w-full h-1 bg-mist-200 rounded-full overflow-hidden mb-2.5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            ph.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                        }`}
                                        style={{ width: `${ph.pct}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-xs pt-2 border-t border-edge-subtle/50">
                                    <span className="text-ink-400 font-mono text-[11px]">
                                        {(story.lore || []).length} Lore Archives
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setView('cast')}
                                        className="text-gold-ink hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                        <span>Cast Bible</span>
                                        <ChevronRight size={11} />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase 3: Story Architecture */}
                    {(() => {
                        const ph = novelProgress.phases[3];
                        const isActive = isNovelGenerating && activePhaseNum === 3;
                        return (
                            <div
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gold-tint text-gold-ink font-mono font-bold text-xs flex items-center justify-center border border-gold-edge shrink-0">
                                            3
                                        </span>
                                        <h4 className="font-serif font-bold text-sm text-ink-900">
                                            Story Architecture
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                            isActive
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                                : ph.status === 'complete'
                                                  ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                  : ph.status === 'in_progress'
                                                    ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                                    : 'bg-mist-100 border-edge text-ink-500'
                                        }`}
                                    >
                                        {isActive ? 'Active' : `${ph.pct}% · ${ph.label}`}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-600 mb-2.5">
                                    {novelProgress.actsCount > 0 || novelProgress.seqCount > 0
                                        ? `${novelProgress.actsCount} acts, ${novelProgress.seqCount}/8 sequences mapped, and ${novelProgress.wovenSeqCount}/8 sequences woven (${novelProgress.plannedTotalScenes} scene blueprints).`
                                        : 'Act milestones, 8 chapter sequences, and rich scene-by-scene blueprints.'}
                                </p>
                                <div className="w-full h-1 bg-mist-200 rounded-full overflow-hidden mb-2.5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            ph.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                        }`}
                                        style={{ width: `${ph.pct}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-xs pt-2 border-t border-edge-subtle/50">
                                    <span className="text-ink-400 font-mono text-[11px]">
                                        {novelProgress.plannedTotalScenes} Planned Scenes
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setView('structure')}
                                        className="text-gold-ink hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                        <span>Story Outline</span>
                                        <ChevronRight size={11} />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase 4: Drafting the Manuscript */}
                    {(() => {
                        const ph = novelProgress.phases[4];
                        const isActive = isNovelGenerating && activePhaseNum === 4;
                        return (
                            <div
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gold-tint text-gold-ink font-mono font-bold text-xs flex items-center justify-center border border-gold-edge shrink-0">
                                            4
                                        </span>
                                        <h4 className="font-serif font-bold text-sm text-ink-900">
                                            Drafting the Manuscript
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                            isActive
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                                : ph.status === 'complete'
                                                  ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                  : stats.words > 0
                                                    ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                                    : 'bg-mist-100 border-edge text-ink-500'
                                        }`}
                                    >
                                        {isActive ? 'Drafting' : `${novelProgress.wordsWritten.toLocaleString()} Words`}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-600 mb-2.5">
                                    {novelProgress.completedScenes > 0
                                        ? `${novelProgress.completedScenes} of ${novelProgress.isSceneCountEstimated ? '~' : ''}${novelProgress.estimatedTotalScenes} estimated scenes fully drafted (${novelProgress.plannedTotalScenes} planned so far).`
                                        : 'Scene-by-scene prose drafting with Continuity Bridge, Style Polish, and Continuity Auditor.'}
                                </p>
                                <div className="space-y-1.5 pt-2 border-t border-edge-subtle/50">
                                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-500">
                                        <span>Estimated Prose Completion</span>
                                        <span>{ph.pct}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-mist-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                ph.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                            }`}
                                            style={{ width: `${ph.pct > 0 ? Math.max(ph.pct, 3) : 0}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase 5: Editorial Polish & Audio */}
                    {(() => {
                        const ph = novelProgress.phases[5];
                        const isActive = isNovelGenerating && activePhaseNum === 5;
                        return (
                            <div
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gold-tint text-gold-ink font-mono font-bold text-xs flex items-center justify-center border border-gold-edge shrink-0">
                                            5
                                        </span>
                                        <h4 className="font-serif font-bold text-sm text-ink-900">
                                            Editorial Polish &amp; Audio
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                            isActive
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse'
                                                : ph.status === 'complete'
                                                  ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                  : 'bg-mist-100 border-edge text-ink-500'
                                        }`}
                                    >
                                        {isActive ? `${ph.pct}% Running` : ph.label}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-600 mb-2.5">
                                    5-Phase Autonomous Editorial Harness &amp; 3-Wave Literary CI/CD, plus optional
                                    Multi-Voice Audio Production.
                                </p>
                                <div className="w-full h-1 bg-mist-200 rounded-full overflow-hidden mb-2.5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            ph.status === 'complete' ? 'bg-emerald-500' : 'bg-gold'
                                        }`}
                                        style={{ width: `${ph.pct}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-edge-subtle/50">
                                    <button
                                        type="button"
                                        onClick={() => setPipelineDisplayMode('audio')}
                                        className="text-plum-700 hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                        <Headphones size={11} />
                                        <span>
                                            Audio Studio ({audioProgress.readyCount}/{audioProgress.totalDrafted})
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('editorial')}
                                        className="text-gold-ink hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                        <span>Editorial Studio</span>
                                        <ChevronRight size={11} />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Right Column (7 Cols): Recent Pipeline Activity & Live Artifact Feed */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Compact Recent Pipeline Activity */}
                    <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity size={14} className="text-gold-ink" />
                                <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700">
                                    Recent Pipeline Activity
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setView('logs')}
                                className="text-xs text-gold-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                                <span>Author&apos;s Log</span>
                                <History size={12} />
                            </button>
                        </div>

                        {promptLog.length === 0 ? (
                            <div className="text-xs text-ink-400 italic py-3 text-center bg-inset rounded-xl border border-edge">
                                No step telemetry recorded yet. Start Autopilot or run any step to track live progress
                                here.
                            </div>
                        ) : (
                            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                {promptLog.slice(0, 6).map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-inset border border-edge text-xs"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[11px] font-mono text-ink-400 shrink-0">
                                                {entry.timestamp}
                                            </span>
                                            <span className="font-mono font-bold text-ink-800 truncate">
                                                {entry.function}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {entry.durationSec && (
                                                <span className="text-[10px] font-mono text-ink-500">
                                                    {entry.durationSec}s
                                                </span>
                                            )}
                                            <span
                                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                                    entry.status === 'success'
                                                        ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                        : entry.status === 'error' ||
                                                            entry.status === 'validation_failed'
                                                          ? 'bg-blush-tint border-blush-edge text-blush-800'
                                                          : entry.status === 'delay'
                                                            ? 'bg-mist-100 border-edge text-ink-500'
                                                            : 'bg-ember-tint border-ember-edge text-ember-800'
                                                }`}
                                            >
                                                {entry.status === 'success'
                                                    ? 'PASS'
                                                    : entry.status === 'error'
                                                      ? 'FAIL'
                                                      : entry.status === 'validation_failed'
                                                        ? 'RETRY'
                                                        : entry.status === 'delay'
                                                          ? 'WAIT'
                                                          : 'RUN'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Live Artifact Feed Heading */}
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-gold-ink" />
                            <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700">
                                Live Artifact Feed
                            </span>
                        </div>
                        <span className="text-xs text-ink-400 font-sans">Newest creations in this story</span>
                    </div>

                    {/* Artifact 1: Latest Scene Manuscript Prose */}
                    {artifacts.latestProse ? (
                        <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink font-bold shrink-0">
                                        Latest Scene Prose
                                    </span>
                                    <span className="text-xs text-ink-500 font-mono font-medium truncate">
                                        {artifacts.latestProse.seqTitle} &middot; {artifacts.latestProse.sceneTitle}
                                    </span>
                                </div>
                                <span className="text-xs font-mono text-ink-500 font-semibold shrink-0">
                                    {artifacts.latestProse.wordCount.toLocaleString()} words
                                </span>
                            </div>

                            <div className="p-4 rounded-xl bg-canvas border border-edge-subtle">
                                <p className="font-serif text-ink-900 text-sm leading-relaxed italic line-clamp-4">
                                    &ldquo;{artifacts.latestProse.text.slice(0, 320)}...&rdquo;
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!artifacts.latestProse) return;
                                        setSelectedSequence(artifacts.latestProse.seqIdx);
                                        setSelectedScene(artifacts.latestProse.sceneIdx);
                                        setView('writer');
                                    }}
                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-700 bg-surface hover:bg-wash border border-edge-strong flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <PenTool size={12} />
                                    <span>Open in Studio</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => enterReaderMode()}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-gold-ink bg-gold-tint hover:bg-gold-tint-strong border border-gold-edge flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                >
                                    <BookOpen size={12} />
                                    <span>Read in Reading Room</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 rounded-2xl bg-surface border border-edge text-center space-y-2">
                            <p className="font-serif text-ink-700 text-sm italic">No novel prose drafted yet.</p>
                            <p className="text-xs text-ink-400">
                                Launch Autopilot or draft scenes in Novel Structure to see live prose excerpts here.
                            </p>
                        </div>
                    )}

                    {/* Artifact 2: Newest Cast Member Profile */}
                    {latestChar && (
                        <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-sage-800 font-bold shrink-0">
                                        Cast Member
                                    </span>
                                    <span className="font-serif font-bold text-ink-900 text-sm truncate">
                                        {latestChar.name}
                                    </span>
                                </div>
                                <span className="text-xs text-ink-500 font-mono truncate">
                                    {latestChar.role || latestChar.story_role || 'Character'}
                                </span>
                            </div>

                            {(latestChar.corner_role || latestChar.archetype) && (
                                <div className="text-xs text-ink-600">
                                    <strong className="text-ink-800 font-semibold">Role / Archetype:</strong>{' '}
                                    {latestChar.corner_role || latestChar.archetype}
                                </div>
                            )}

                            {(latestChar.voice_sample || latestChar.sample_dialogue || latestChar.vocal_cadence) && (
                                <div className="p-3.5 rounded-xl bg-canvas border border-edge-subtle">
                                    <div className="text-[10px] uppercase font-mono text-ink-400 mb-1">
                                        {latestChar.voice_sample || latestChar.sample_dialogue
                                            ? 'Dramatized Voice Sample'
                                            : 'Vocal Cadence Profile'}
                                    </div>
                                    <p className="font-serif text-ink-800 text-xs italic leading-relaxed">
                                        &ldquo;
                                        {latestChar.voice_sample ||
                                            latestChar.sample_dialogue ||
                                            latestChar.vocal_cadence}
                                        &rdquo;
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => setView('cast')}
                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-700 bg-surface hover:bg-wash border border-edge-strong flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <Users size={12} />
                                    <span>View All Characters ({artifacts.totalCharacters})</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Artifact 3: Newest Sequence Blueprint */}
                    {latestSeq && (
                        <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-mist-200 border border-edge-strong text-ink-700 font-bold shrink-0">
                                        Sequence Blueprint
                                    </span>
                                    <span className="font-serif font-bold text-ink-900 text-sm truncate">
                                        {latestSeq.title || `Sequence ${latestSeq.number ?? ''}`}
                                    </span>
                                </div>
                                <span className="text-xs text-ink-500 font-mono shrink-0">
                                    {latestSeq.plannedScenesCount || 0} Scenes Planned
                                </span>
                            </div>

                            {(latestSeq.summary || latestSeq.dramatic_question) && (
                                <p className="text-xs text-ink-600 leading-relaxed font-sans line-clamp-3">
                                    {latestSeq.summary || latestSeq.dramatic_question}
                                </p>
                            )}

                            <div className="flex items-center justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => setView('structure')}
                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-700 bg-surface hover:bg-wash border border-edge-strong flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <Layers size={12} />
                                    <span>View Full Outline</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
