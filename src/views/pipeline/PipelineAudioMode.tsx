/**
 * @module views/pipeline/PipelineAudioMode
 * Mode 2 of PipelineView: Dedicated Audio Production Studio showing overall progress,
 * 5 audio stages, scene-by-scene offline audio matrix, latest mastered artifact, and telemetry.
 */

import React from 'react';
import {
    AlertTriangle,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    Clock,
    FileText,
    Headphones,
    History,
    Layers,
    Loader2,
    Mic,
    Pause,
    PenTool,
    Play,
    Radio,
    Save,
    Settings,
    Sliders,
    Sparkles,
    Terminal,
    Volume2,
    X,
    XCircle
} from '@/components';
import { formatAudioDuration, formatBytesCompact } from '@/domain/story';
import type { PipelineAudioModeProps } from './types';

function audioStageBadgeInfo(stageState: string): { text: string; cls: string } {
    if (stageState === 'active') return { text: 'Running', cls: 'bg-gold-tint border-gold-edge text-gold-ink animate-pulse' };
    if (stageState === 'done') return { text: 'Complete', cls: 'bg-sage-tint border-sage-edge text-sage-800' };
    if (stageState === 'in_progress') return { text: 'In Progress', cls: 'bg-gold-tint border-gold-edge text-gold-ink' };
    if (stageState === 'pending') return { text: 'Queued', cls: 'bg-mist-100 border-edge text-ink-500' };
    return { text: 'Standby', cls: 'bg-mist-100 border-edge text-ink-500' };
}

export const PipelineAudioMode: React.FC<PipelineAudioModeProps> = ({
    story,
    audioProgress,
    isAudioAutopilotRunning,
    isAudioAutopilotQueued,
    audioAutopilotProgress,
    continuousAutopilot,
    promptLog,
    isAnyAudioPlaying,
    handleToggleAudioAutopilot,
    enterReaderMode,
    playSceneAudio,
    stopAllAudioPlayback,
    setPipelineDisplayMode,
    setSelectedSequence,
    setSelectedScene,
    setSettingsTab,
    setView
}) => {
    const audioStagesMeta = [
        {
            id: 'parsing',
            num: 1,
            title: 'Script Parsing & Dialogue Cues',
            icon: FileText,
            desc:
                story.writing_mode === 'audio_drama'
                    ? 'Mode: Audio Drama Script — speaker turns, breath units, and inline acting cues.'
                    : 'Mode: Novel Prose — dialogue vs. narrator segmentation and cue extraction.',
            footerLeft: story.writing_mode === 'audio_drama' ? 'Audio Drama Format' : 'Novel Prose Format',
            actionLabel: 'Story Structure',
            onAction: () => setView('structure')
        },
        {
            id: 'casting',
            num: 2,
            title: 'Voice Casting & Master Anchors',
            icon: Mic,
            desc: `${audioProgress.voicedCastCount} of ${audioProgress.castCount} cast voice profile(s) configured${
                audioProgress.narratorReady ? ' · Narrator voice anchored.' : ' · Narrator standing by.'
            }`,
            footerLeft: `${audioProgress.voicedCastCount}/${audioProgress.castCount} Cast Voiced`,
            actionLabel: 'Cast Bible',
            onAction: () => setView('cast')
        },
        {
            id: 'synthesis',
            num: 3,
            title: 'Multi-Voice Neural Synthesis',
            icon: Volume2,
            desc: `Engine: ${audioProgress.backendLabel}. Synthesizing character dialogue and narration chunks.`,
            footerLeft:
                isAudioAutopilotRunning && audioAutopilotProgress?.activeSpeaker
                    ? `Speaker: ${audioAutopilotProgress.activeSpeaker}`
                    : audioProgress.backendLabel,
            actionLabel: 'Audio Settings',
            onAction: () => {
                setSettingsTab('audio_drama');
                setView('settings');
            }
        },
        {
            id: 'mastering',
            num: 4,
            title: 'Studio Mastering & Broadcast Encoding',
            icon: Sliders,
            desc: '75Hz high-pass cleanup, LUFS loudness leveling, room-tone bed, peak limiter, and 128kbps MP3 assembly.',
            footerLeft: '128kbps Master DSP',
            actionLabel: null,
            onAction: null
        },
        {
            id: 'archiving',
            num: 5,
            title: 'Offline Audio Library & Cue Sync',
            icon: Save,
            desc: 'Persists mastered scene audio and word/turn cue timelines into IndexedDB for instant offline playback and EPUB bundling.',
            footerLeft: `${audioProgress.readyCount}/${audioProgress.totalDrafted} Scenes Cached`,
            actionLabel: 'Reading Room',
            onAction: () => enterReaderMode()
        }
    ];

    const latestAudioArtifact = audioAutopilotProgress?.lastCompletedScene || audioProgress.latestSavedAudio;
    const audioLogEntries = promptLog.filter((e) => e && (e.isAudio || e.stepId === 22)).slice(0, 10);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Audio Production Hero Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-edge shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                <span
                                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                                        isAudioAutopilotRunning ? 'bg-gold opacity-75' : 'bg-emerald-500 opacity-30'
                                    }`}
                                />
                                <span
                                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                        isAudioAutopilotRunning ? 'bg-gold' : 'bg-emerald-500'
                                    }`}
                                />
                            </div>
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-600">
                                {isAudioAutopilotRunning
                                    ? 'Audio Autopilot Active'
                                    : isAudioAutopilotQueued
                                      ? 'Audio Autopilot Queued Behind Novel Autopilot'
                                      : audioProgress.allAudioComplete
                                        ? 'Full Audio Library Ready'
                                        : 'Audio Studio Standing By'}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-plum-tint border border-plum-edge text-plum-800">
                                {audioProgress.backendLabel}
                            </span>
                        </div>
                        <h3 className="font-serif font-bold text-xl sm:text-2xl text-ink-900 tracking-tight">
                            Multi-Voice Audio Drama Production
                        </h3>
                    </div>

                    <div className="flex items-baseline gap-2 bg-inset border border-edge-strong rounded-2xl px-4 py-3 shrink-0">
                        <span className="text-3xl sm:text-4xl font-serif font-bold text-gold-ink tabular-nums">
                            {audioProgress.overallPct}%
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500 font-semibold">
                            Mastered
                        </span>
                    </div>
                </div>

                {/* Overall Audio Progress Bar & KPI Row */}
                <div className="space-y-2">
                    <div className="w-full h-2.5 bg-mist-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
                            style={{
                                width: `${Math.max(audioProgress.overallPct, audioProgress.overallPct > 0 ? 3 : 0)}%`
                            }}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Scenes Ready
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {audioProgress.readyCount} / {audioProgress.totalDrafted}
                            </div>
                        </div>
                        <div
                            className={`p-3 rounded-xl border ${
                                audioProgress.staleCount > 0
                                    ? 'bg-ember-tint/60 border-ember-edge'
                                    : 'bg-inset border-edge'
                            }`}
                        >
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Needs Refresh
                            </div>
                            <div
                                className={`text-sm font-serif font-bold mt-0.5 tabular-nums ${
                                    audioProgress.staleCount > 0 ? 'text-ember-800' : 'text-ink-900'
                                }`}
                            >
                                {audioProgress.staleCount} stale
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-inset border border-edge">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold">
                                Total Runtime
                            </div>
                            <div className="text-sm font-serif font-bold text-ink-900 mt-0.5 tabular-nums">
                                {formatAudioDuration(audioProgress.totalDurationSec)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Currently Producing Focus Panel */}
                {isAudioAutopilotRunning && audioAutopilotProgress ? (
                    <div className="p-4 rounded-xl bg-gold-tint/35 border border-gold-edge space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold-tint text-gold-ink border border-gold-edge">
                                    <Radio size={10} className="animate-pulse" />
                                    Synthesizing Now
                                </span>
                                {(audioAutopilotProgress.currentSceneOrder || 0) > 0 && (
                                    <span className="text-xs font-mono font-bold text-ink-700">
                                        Scene {audioAutopilotProgress.currentSceneOrder} of{' '}
                                        {audioAutopilotProgress.totalEligibleScenes}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs font-mono font-bold text-gold-ink">
                                {audioAutopilotProgress.stageLabel} · {audioAutopilotProgress.stagePct || 0}%
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-serif font-bold text-base text-ink-900">
                                {audioAutopilotProgress.currentSeqIdx !== null &&
                                audioAutopilotProgress.currentSeqIdx !== undefined
                                    ? `Seq ${audioAutopilotProgress.currentSeqIdx + 1}: ${audioAutopilotProgress.currentSeqTitle} › ${audioAutopilotProgress.currentSceneLabel}: ${audioAutopilotProgress.currentSceneTitle}`
                                    : 'Scanning Story Scenes...'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {audioAutopilotProgress.activeSpeaker && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-surface border border-gold-edge text-ink-800">
                                        <Mic size={11} className="text-gold-ink" />
                                        <span>{audioAutopilotProgress.activeSpeaker}</span>
                                    </span>
                                )}
                                {audioAutopilotProgress.chunkCurrent && audioAutopilotProgress.chunkTotal && (
                                    <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-surface border border-edge-strong text-ink-700">
                                        Chunk {audioAutopilotProgress.chunkCurrent}/{audioAutopilotProgress.chunkTotal}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="w-full h-1.5 bg-mist-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gold rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(audioAutopilotProgress.stagePct || 0, 5)}%` }}
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
                            <span className="truncate">
                                {audioAutopilotProgress.stageMessage || 'Synthesizing scene audio...'}
                            </span>
                            <span className="font-mono text-[11px] text-ink-500 shrink-0">
                                {audioAutopilotProgress.generatedScenes} newly mastered ·{' '}
                                {audioAutopilotProgress.alreadyCachedScenes} cached skipped
                                {(audioAutopilotProgress.failedScenes || 0) > 0
                                    ? ` · ${audioAutopilotProgress.failedScenes} error(s)`
                                    : ''}
                            </span>
                        </div>
                    </div>
                ) : isAudioAutopilotQueued ? (
                    <div className="p-4 rounded-xl bg-ember-tint/50 border border-ember-edge flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-ember-800">
                                Queued
                            </div>
                            <div className="font-serif font-bold text-base text-ink-900">
                                Audio Autopilot Will Begin Automatically
                            </div>
                            <div className="text-xs text-ink-600">
                                Waiting for Novel Autopilot to finish drafting and polishing remaining scenes before
                                generating scene MP3s.
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                            audioProgress.allAudioComplete
                                ? 'bg-sage-tint/40 border-sage-edge'
                                : 'bg-inset border-edge-strong'
                        }`}
                    >
                        <div className="space-y-1 min-w-0">
                            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink-500">
                                {audioProgress.totalDrafted === 0
                                    ? 'Awaiting Drafted Prose'
                                    : audioProgress.allAudioComplete
                                      ? 'Audio Production Complete'
                                      : 'Next Scene for Audio'}
                            </div>
                            <div className="font-serif font-bold text-base text-ink-900 truncate">
                                {audioProgress.totalDrafted === 0
                                    ? 'Draft at least one scene before running Audio Autopilot'
                                    : audioProgress.allAudioComplete
                                      ? `All ${audioProgress.totalDrafted} drafted scenes ready for offline playback`
                                      : audioProgress.nextAudioScene
                                        ? `${audioProgress.nextAudioScene.label}: ${audioProgress.nextAudioScene.title} (${
                                              audioProgress.nextAudioScene.status === 'stale'
                                                  ? 'Needs refresh'
                                                  : 'Pending'
                                          })`
                                        : 'All drafted scenes processed'}
                            </div>
                            {audioProgress.nextAudioScene && (
                                <div className="text-xs text-ink-500">
                                    Seq {audioProgress.nextAudioScene.seqIdx + 1}:{' '}
                                    {audioProgress.nextAudioScene.seqTitle}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Audio Controls Bar */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-edge-subtle">
                    <button
                        type="button"
                        onClick={handleToggleAudioAutopilot}
                        disabled={
                            !isAudioAutopilotRunning &&
                            !isAudioAutopilotQueued &&
                            !continuousAutopilot &&
                            audioProgress.totalDrafted === 0
                        }
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isAudioAutopilotRunning
                                ? 'bg-blush-tint border border-blush-edge text-blush-800'
                                : 'bg-btn hover:bg-btn-hover text-btn-ink'
                        }`}
                    >
                        {isAudioAutopilotRunning ? (
                            <>
                                <Pause size={13} className="text-blush-600" />
                                <span>Pause Audio Autopilot</span>
                            </>
                        ) : isAudioAutopilotQueued ? (
                            <>
                                <X size={13} />
                                <span>Cancel Queued Audio</span>
                            </>
                        ) : continuousAutopilot ? (
                            <>
                                <Clock size={13} className="text-amber-300" />
                                <span>Queue Audio After Novel</span>
                            </>
                        ) : (
                            <>
                                <Headphones size={13} className="text-amber-300" />
                                <span>
                                    {audioProgress.readyCount > 0 && !audioProgress.allAudioComplete
                                        ? 'Resume Audio Autopilot'
                                        : 'Start Audio Autopilot'}
                                </span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => enterReaderMode()}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface hover:bg-wash border border-edge-strong text-ink-800 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                        <BookOpen size={13} />
                        <span>Listen in Reading Room</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setSettingsTab('audio_drama');
                            setView('settings');
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface hover:bg-wash border border-edge-strong text-ink-700 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                        <Settings size={13} />
                        <span>Audio Settings</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPipelineDisplayMode('stage')}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors ml-auto flex items-center gap-1 cursor-pointer"
                    >
                        <Sparkles size={13} />
                        <span>Novel Control Center</span>
                    </button>
                </div>
            </div>

            {/* 2-Column Audio Studio Detail Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (5 Cols): 5 Unique Audio Production Stages */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-500">
                            Audio Production Pipeline
                        </span>
                        <span className="text-xs font-mono font-semibold text-gold-ink">5 Audio Stages</span>
                    </div>

                    {audioStagesMeta.map((st) => {
                        const stState = audioProgress.stages[st.id] || 'standby';
                        const badge = audioStageBadgeInfo(stState);
                        const IconComp = st.icon;
                        const isActive = stState === 'active';
                        const chunkPct =
                            isActive &&
                            st.id === 'synthesis' &&
                            audioAutopilotProgress?.chunkCurrent &&
                            audioAutopilotProgress?.chunkTotal
                                ? Math.round(
                                      (audioAutopilotProgress.chunkCurrent / audioAutopilotProgress.chunkTotal) * 100
                                  )
                                : null;

                        return (
                            <div
                                key={st.id}
                                className={`p-4 rounded-2xl border transition-all shadow-2xs ${
                                    isActive
                                        ? 'border-gold bg-gold-tint/20 ring-2 ring-gold/20'
                                        : stState === 'done'
                                          ? 'bg-surface border-sage-edge/70'
                                          : 'bg-surface border-edge'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-6 h-6 rounded-full font-mono font-bold text-xs flex items-center justify-center border shrink-0 ${
                                                stState === 'done'
                                                    ? 'bg-sage-tint text-sage-800 border-sage-edge'
                                                    : 'bg-gold-tint text-gold-ink border-gold-edge'
                                            }`}
                                        >
                                            {stState === 'done' ? <CheckCircle2 size={13} /> : st.num}
                                        </span>
                                        <IconComp size={14} className="text-gold-ink shrink-0" />
                                        <h4 className="font-serif font-bold text-sm text-ink-900 truncate">
                                            {st.title}
                                        </h4>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border shrink-0 ${badge.cls}`}
                                    >
                                        {badge.text}
                                    </span>
                                </div>

                                <p className="text-xs text-ink-600 mb-2.5 leading-relaxed">{st.desc}</p>

                                {chunkPct !== null && audioAutopilotProgress && (
                                    <div className="space-y-1 mb-2.5">
                                        <div className="flex items-center justify-between text-[11px] font-mono text-ink-500">
                                            <span>
                                                Chunk {audioAutopilotProgress.chunkCurrent}/
                                                {audioAutopilotProgress.chunkTotal}
                                            </span>
                                            <span className="text-gold-ink font-bold">{chunkPct}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-mist-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gold rounded-full transition-all duration-300"
                                                style={{ width: `${chunkPct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {st.id === 'archiving' && audioProgress.totalDrafted > 0 && (
                                    <div className="w-full h-1.5 bg-mist-200 rounded-full overflow-hidden mb-2.5">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                audioProgress.allAudioComplete ? 'bg-emerald-500' : 'bg-gold'
                                            }`}
                                            style={{ width: `${audioProgress.overallPct}%` }}
                                        />
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs pt-2 border-t border-edge-subtle/50">
                                    <span className="text-ink-400 font-mono text-[11px] truncate">
                                        {st.footerLeft}
                                    </span>
                                    {st.actionLabel && st.onAction && (
                                        <button
                                            type="button"
                                            onClick={st.onAction}
                                            className="text-gold-ink hover:underline font-semibold flex items-center gap-1 text-[11px] cursor-pointer shrink-0"
                                        >
                                            <span>{st.actionLabel}</span>
                                            <ChevronRight size={11} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Column (7 Cols): Scene-by-Scene Audio Matrix, Latest Mastered Audio, & Audio Telemetry */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Scene-by-Scene Audio Production Matrix */}
                    <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Layers size={14} className="text-gold-ink" />
                                <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700">
                                    Scene-by-Scene Audio Matrix
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-ink-500">
                                <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-gold" /> Rendering
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Stale
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-mist-300" /> Pending
                                </span>
                            </div>
                        </div>

                        {audioProgress.sequences.length === 0 ? (
                            <div className="p-6 rounded-xl bg-inset border border-edge text-center space-y-1">
                                <p className="font-serif text-sm text-ink-700 italic">No drafted scenes yet.</p>
                                <p className="text-xs text-ink-400">
                                    Once scenes are drafted, each scene will appear here with its offline audio status.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                                {audioProgress.sequences.map((seqGrp) => (
                                    <div key={seqGrp.seqIdx} className="p-3 rounded-xl bg-inset border border-edge space-y-2">
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                            <span className="font-serif font-bold text-ink-900 truncate">
                                                Seq {seqGrp.number}: {seqGrp.title}
                                            </span>
                                            <span className="font-mono text-[11px] text-ink-500 shrink-0">
                                                {seqGrp.scenes.filter((s) => s.status === 'ready').length}/
                                                {seqGrp.scenes.length} ready
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {seqGrp.scenes.map((sc) => {
                                                const chipCls =
                                                    sc.status === 'rendering'
                                                        ? 'bg-gold-tint border-gold text-gold-ink ring-2 ring-gold/25 animate-pulse'
                                                        : sc.status === 'ready'
                                                          ? 'bg-sage-tint border-sage-edge text-sage-800 hover:brightness-95'
                                                          : sc.status === 'stale'
                                                            ? 'bg-ember-tint border-ember-edge text-ember-800 hover:brightness-95'
                                                            : sc.status === 'error'
                                                              ? 'bg-blush-tint border-blush-edge text-blush-800'
                                                              : 'bg-surface border-edge-strong text-ink-600 hover:border-gold-edge';

                                                return (
                                                    <button
                                                        key={`${sc.seqIdx}-${sc.sceneIdx}`}
                                                        type="button"
                                                        onClick={() => {
                                                            if (sc.status === 'ready') {
                                                                if (isAnyAudioPlaying) {
                                                                    stopAllAudioPlayback();
                                                                } else {
                                                                    playSceneAudio(sc.seqIdx, sc.sceneIdx, {
                                                                        autoplay: true,
                                                                        follow: false
                                                                    });
                                                                }
                                                            } else {
                                                                setSelectedSequence(sc.seqIdx);
                                                                setSelectedScene(sc.sceneIdx);
                                                                setView('writer');
                                                            }
                                                        }}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${chipCls}`}
                                                        title={
                                                            sc.status === 'ready'
                                                                ? isAnyAudioPlaying
                                                                    ? 'Pause / Stop playing audio'
                                                                    : `${sc.label} ${sc.title} (${formatAudioDuration(sc.durationSec)}) — Click to preview audio`
                                                                : `${sc.label} ${sc.title} (${sc.status}) — Click to open scene in Studio`
                                                        }
                                                    >
                                                        {sc.status === 'rendering' ? (
                                                            <Loader2 size={11} className="animate-spin shrink-0" />
                                                        ) : sc.status === 'ready' ? (
                                                            isAnyAudioPlaying ? (
                                                                <Pause size={10} className="fill-current shrink-0" />
                                                            ) : (
                                                                <Play size={10} className="fill-current shrink-0" />
                                                            )
                                                        ) : sc.status === 'stale' ? (
                                                            <AlertTriangle size={10} className="shrink-0" />
                                                        ) : sc.status === 'error' ? (
                                                            <XCircle size={10} className="shrink-0" />
                                                        ) : (
                                                            <span className="w-1.5 h-1.5 rounded-full bg-mist-300 shrink-0" />
                                                        )}
                                                        <span className="font-bold">{sc.label}</span>
                                                        {sc.durationSec > 0 && (
                                                            <span className="text-[10px] opacity-80">
                                                                {formatAudioDuration(sc.durationSec)}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Latest Mastered Scene Audio Artifact */}
                    {latestAudioArtifact && (
                        <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-sage-800 font-bold shrink-0">
                                        Latest Mastered Audio
                                    </span>
                                    <span className="font-serif font-bold text-ink-900 text-sm truncate">
                                        Scene {latestAudioArtifact.label}: {latestAudioArtifact.sceneTitle}
                                    </span>
                                </div>
                                <span className="text-xs font-mono text-ink-500 shrink-0">
                                    {formatAudioDuration(latestAudioArtifact.durationSec)} ·{' '}
                                    {formatBytesCompact(latestAudioArtifact.sizeBytes)}
                                </span>
                            </div>

                            <div className="text-xs text-ink-600 font-mono">
                                {latestAudioArtifact.seqTitle}
                                {latestAudioArtifact.cueCount > 0
                                    ? ` · ${latestAudioArtifact.cueCount} synchronized cues`
                                    : ''}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() =>
                                        isAnyAudioPlaying
                                            ? stopAllAudioPlayback()
                                            : playSceneAudio(latestAudioArtifact.seqIdx, latestAudioArtifact.sceneIdx, {
                                                  autoplay: true,
                                                  follow: false
                                              })
                                    }
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-gold-ink bg-gold-tint hover:bg-gold-tint-strong border border-gold-edge flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                    title={
                                        isAnyAudioPlaying
                                            ? 'Pause / Stop playing audio'
                                            : 'Preview mastered scene audio'
                                    }
                                >
                                    {isAnyAudioPlaying ? (
                                        <>
                                            <Pause size={12} className="fill-current" />
                                            <span>Pause Audio</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play size={12} className="fill-current" />
                                            <span>Preview Audio</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedSequence(latestAudioArtifact.seqIdx);
                                        setSelectedScene(latestAudioArtifact.sceneIdx);
                                        setView('writer');
                                    }}
                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-700 bg-surface hover:bg-wash border border-edge-strong flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <PenTool size={12} />
                                    <span>Open Scene</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Audio Errors & Telemetry Feed */}
                    <div className="p-5 rounded-2xl bg-surface border border-edge shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Terminal size={14} className="text-gold-ink" />
                                <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700">
                                    Audio Stage Telemetry
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setView('logs')}
                                className="text-xs text-gold-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                                <span>Full Log</span>
                                <History size={12} />
                            </button>
                        </div>

                        {audioAutopilotProgress?.recentErrors && audioAutopilotProgress.recentErrors.length > 0 && (
                            <div className="space-y-1.5">
                                {audioAutopilotProgress.recentErrors.map((errItem, idx) => (
                                    <div
                                        key={idx}
                                        className="px-3 py-2 rounded-xl bg-blush-tint border border-blush-edge text-xs text-blush-800 flex items-center justify-between gap-2"
                                    >
                                        <span className="font-mono font-bold truncate">
                                            {errItem.sceneLabel}: {errItem.message}
                                        </span>
                                        <span className="text-[10px] font-mono shrink-0">{errItem.timestamp}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {audioLogEntries.length === 0 ? (
                            <div className="text-xs text-ink-400 italic py-4 text-center bg-inset rounded-xl border border-edge">
                                No audio synthesis telemetry recorded in this session yet.
                            </div>
                        ) : (
                            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                {audioLogEntries.map((entry) => (
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
                                        <span
                                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                                entry.status === 'success'
                                                    ? 'bg-sage-tint border-sage-edge text-sage-800'
                                                    : entry.status === 'error'
                                                      ? 'bg-blush-tint border-blush-edge text-blush-800'
                                                      : 'bg-gold-tint border-gold-edge text-gold-ink'
                                            }`}
                                        >
                                            {entry.status === 'success'
                                                ? 'DONE'
                                                : entry.status === 'error'
                                                  ? 'FAIL'
                                                  : 'RUN'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
