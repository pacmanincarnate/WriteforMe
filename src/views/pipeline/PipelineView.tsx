/**
 * @module views/pipeline/PipelineView
 * Control Center & Visual Pipeline view (`view === 'pipeline'`) with 3-way segmented mode
 * switcher: Novel Creation (`stage`), Audio Production (`audio`), and Technical Graph (`graph`).
 */

import React from 'react';
import { GitBranch, Headphones, Sparkles, Workflow } from '@/components';
import {
    calculateStoryStats,
    getRecentStoryArtifacts,
    translateLoadingStepToHuman
} from '@/domain/story';
import { PipelineAudioMode } from './PipelineAudioMode';
import { PipelineGraphMode } from './PipelineGraphMode';
import { PipelineNovelMode } from './PipelineNovelMode';
import type { PipelineNextUp, PipelineViewProps } from './types';

export const PipelineView: React.FC<PipelineViewProps> = ({
    view,
    setView,
    story,
    setSelectedSequence,
    setSelectedScene,
    setSettingsTab,
    loading,
    loadingStep,
    currentPipelineStep,
    inspectedStepId,
    setInspectedStepId,
    pipelineViewMode,
    setPipelineViewMode,
    pipelineDisplayMode,
    setPipelineDisplayMode,
    activePipelineWork,
    promptLog,
    continuousAutopilot,
    handleAutopilot,
    toggleContinuousAutopilot,
    novelProgress,
    audioProgress,
    isAudioAutopilotRunning,
    isAudioAutopilotQueued,
    audioAutopilotProgress,
    handleToggleAudioAutopilot,
    isAnyAudioPlaying,
    playSceneAudio,
    stopAllAudioPlayback,
    enterReaderMode,
    openLogDetailModal,
    copyVerboseLogToClipboard,
    showToast
}) => {
    if (view !== 'pipeline') return null;

    const activeInfo = translateLoadingStepToHuman(loadingStep, story, activePipelineWork);
    const stats = calculateStoryStats(story);
    const artifacts = getRecentStoryArtifacts(story);
    const isGenerating = Boolean(loading || continuousAutopilot || isAudioAutopilotRunning);
    const isNovelGenerating = Boolean(continuousAutopilot || (loading && !isAudioAutopilotRunning));

    const activeWorkBreadcrumb = (() => {
        if (!activePipelineWork) return activeInfo.humanHeadline;
        const parts: string[] = [];
        if (activePipelineWork.actNumber) parts.push(`Act ${activePipelineWork.actNumber}`);
        if (activePipelineWork.seqNumber) {
            parts.push(
                `Seq ${activePipelineWork.seqNumber}${
                    activePipelineWork.seqTitle ? `: ${activePipelineWork.seqTitle}` : ''
                }`
            );
        }
        if (activePipelineWork.sceneLabel) {
            parts.push(
                `Scene ${activePipelineWork.sceneLabel}${
                    activePipelineWork.sceneTitle ? `: ${activePipelineWork.sceneTitle}` : ''
                }`
            );
        } else if (activePipelineWork.characterName) {
            parts.push(
                `Character: ${activePipelineWork.characterName}${
                    activePipelineWork.itemTotal ? ` (${activePipelineWork.itemIndex || 1}/${activePipelineWork.itemTotal})` : ''
                }`
            );
        } else if (activePipelineWork.title && parts.length === 0) {
            parts.push(activePipelineWork.title);
        }
        return parts.length > 0 ? parts.join(' › ') : activeInfo.humanHeadline;
    })();

    const navigateTarget = (target: {
        elementType?: string;
        seqIdx?: number;
        sceneIdx?: number;
    }) => {
        if (target.elementType === 'scene' && target.seqIdx !== undefined && target.sceneIdx !== undefined) {
            setSelectedSequence(target.seqIdx);
            setSelectedScene(target.sceneIdx);
            setView('writer');
        } else if (target.elementType === 'sequence' && target.seqIdx !== undefined) {
            setSelectedSequence(target.seqIdx);
            setView('sequence_dashboard');
        } else if (target.elementType === 'character') {
            setView('cast');
        } else if (target.elementType === 'editorial') {
            setView('editorial');
        } else if (target.elementType === 'act') {
            setView('structure');
        } else {
            setView('dashboard');
        }
    };

    const inspectActiveElement = () => {
        if (!activePipelineWork) return;
        navigateTarget(activePipelineWork);
    };

    const inspectNextUpElement = () => {
        const nu = novelProgress.nextUp as PipelineNextUp | undefined;
        if (!nu) return;
        navigateTarget(nu);
    };

    const activePhaseNum = activePipelineWork?.phase || (isNovelGenerating ? activeInfo.phaseNumber : 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            {/* Live Progress Control Center Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6 bg-surface rounded-2xl border border-edge shadow-sm">
                <div className="space-y-1 min-w-0">
                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 flex items-center gap-2.5">
                        <Workflow className="text-gold-ink shrink-0" />
                        <span>
                            {pipelineDisplayMode === 'audio'
                                ? 'Live Progress · Audio Production Studio'
                                : pipelineDisplayMode === 'graph'
                                  ? 'Narrative Generation Visual Pipeline'
                                  : 'Live Progress · Novel Control Center'}
                        </span>
                    </h2>
                    {pipelineDisplayMode !== 'audio' && (
                        <p className="text-xs text-ink-500">
                            {pipelineDisplayMode === 'graph'
                                ? 'Interactive 22-step cascading multi-agent workflow architecture & real-time log inspector.'
                                : 'Real-time novel creation control center — watch progress across every phase without losing your place.'}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Live Generation Indicator Badge */}
                    <div
                        className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono flex items-center gap-2 border max-w-full ${
                            isGenerating
                                ? 'bg-gold-tint text-gold-ink border-gold-edge'
                                : 'bg-mist-100 text-ink-500 border-edge-strong'
                        }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                                isGenerating ? 'bg-gold animate-ping' : 'bg-stone-400'
                            }`}
                        ></span>
                        <span className="truncate max-w-[260px]">
                            {isAudioAutopilotRunning
                                ? `${audioAutopilotProgress?.currentSceneLabel || 'Audio'} · ${
                                      audioAutopilotProgress?.stageLabel || activeInfo.humanHeadline
                                  }`
                                : isGenerating
                                  ? activePipelineWork?.sceneLabel
                                      ? `Scene ${activePipelineWork.sceneLabel} · ${
                                            activePipelineWork.subStep || activeInfo.humanHeadline
                                        }`
                                      : activePipelineWork?.subStep || activeInfo.humanHeadline
                                  : 'Control Center Ready'}
                        </span>
                    </div>

                    {/* 3-Way Segmented Switcher: Novel Creation | Audio Production | Technical Graph */}
                    <div className="flex flex-wrap bg-mist-100 p-1 rounded-xl border border-edge-strong gap-0.5">
                        <button
                            type="button"
                            onClick={() => setPipelineDisplayMode('stage')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                pipelineDisplayMode === 'stage'
                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900'
                            }`}
                        >
                            <Sparkles
                                size={13}
                                className={pipelineDisplayMode === 'stage' ? 'text-amber-300' : 'text-gold-ink'}
                            />
                            <span>Novel Creation</span>
                            {isNovelGenerating && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping ml-0.5" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPipelineDisplayMode('audio')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                pipelineDisplayMode === 'audio'
                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900'
                            }`}
                        >
                            <Headphones
                                size={13}
                                className={pipelineDisplayMode === 'audio' ? 'text-amber-300' : 'text-plum-600'}
                            />
                            <span>Audio Production</span>
                            {isAudioAutopilotRunning ? (
                                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full bg-gold text-white animate-pulse">
                                    LIVE
                                </span>
                            ) : isAudioAutopilotQueued ? (
                                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full bg-ember-tint text-ember-800 border border-ember-edge">
                                    QUEUED
                                </span>
                            ) : audioProgress.totalDrafted > 0 ? (
                                <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                                        pipelineDisplayMode === 'audio'
                                            ? 'bg-white/15 text-btn-ink'
                                            : 'bg-surface text-ink-600 border border-edge'
                                    }`}
                                >
                                    {audioProgress.readyCount}/{audioProgress.totalDrafted}
                                </span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPipelineDisplayMode('graph')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                pipelineDisplayMode === 'graph'
                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900'
                            }`}
                        >
                            <GitBranch size={13} />
                            <span>Technical Graph</span>
                        </button>
                    </div>

                    {/* Flowchart Detailed/Simplified toggle (Visible only in graph mode) */}
                    {pipelineDisplayMode === 'graph' && (
                        <div className="flex bg-mist-100 p-1 rounded-xl border border-edge-strong">
                            <button
                                type="button"
                                onClick={() => setPipelineViewMode('detailed')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    pipelineViewMode === 'detailed'
                                        ? 'bg-btn text-btn-ink shadow-2xs'
                                        : 'text-ink-600 hover:text-ink-900'
                                }`}
                            >
                                Detailed
                            </button>
                            <button
                                type="button"
                                onClick={() => setPipelineViewMode('simplified')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    pipelineViewMode === 'simplified'
                                        ? 'bg-btn text-btn-ink shadow-2xs'
                                        : 'text-ink-600 hover:text-ink-900'
                                }`}
                            >
                                Simplified
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {pipelineDisplayMode === 'stage' && (
                <PipelineNovelMode
                    story={story}
                    activeInfo={activeInfo}
                    stats={stats}
                    artifacts={artifacts}
                    activeWorkBreadcrumb={activeWorkBreadcrumb}
                    isNovelGenerating={isNovelGenerating}
                    activePhaseNum={activePhaseNum}
                    loadingStep={loadingStep}
                    activePipelineWork={activePipelineWork}
                    promptLog={promptLog}
                    continuousAutopilot={continuousAutopilot}
                    novelProgress={novelProgress}
                    audioProgress={audioProgress}
                    isAudioAutopilotRunning={isAudioAutopilotRunning}
                    isAudioAutopilotQueued={isAudioAutopilotQueued}
                    inspectActiveElement={inspectActiveElement}
                    inspectNextUpElement={inspectNextUpElement}
                    handleAutopilot={handleAutopilot}
                    toggleContinuousAutopilot={toggleContinuousAutopilot}
                    handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                    enterReaderMode={enterReaderMode}
                    setPipelineDisplayMode={setPipelineDisplayMode}
                    setSelectedSequence={setSelectedSequence}
                    setSelectedScene={setSelectedScene}
                    setView={setView}
                />
            )}

            {pipelineDisplayMode === 'audio' && (
                <PipelineAudioMode
                    story={story}
                    audioProgress={audioProgress}
                    isAudioAutopilotRunning={isAudioAutopilotRunning}
                    isAudioAutopilotQueued={isAudioAutopilotQueued}
                    audioAutopilotProgress={audioAutopilotProgress}
                    continuousAutopilot={continuousAutopilot}
                    promptLog={promptLog}
                    isAnyAudioPlaying={isAnyAudioPlaying}
                    handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                    enterReaderMode={enterReaderMode}
                    playSceneAudio={playSceneAudio}
                    stopAllAudioPlayback={stopAllAudioPlayback}
                    setPipelineDisplayMode={setPipelineDisplayMode}
                    setSelectedSequence={setSelectedSequence}
                    setSelectedScene={setSelectedScene}
                    setSettingsTab={setSettingsTab}
                    setView={setView}
                />
            )}

            {pipelineDisplayMode === 'graph' && (
                <PipelineGraphMode
                    loading={loading}
                    currentPipelineStep={currentPipelineStep}
                    inspectedStepId={inspectedStepId}
                    setInspectedStepId={setInspectedStepId}
                    pipelineViewMode={pipelineViewMode}
                    promptLog={promptLog}
                    setView={setView}
                    openLogDetailModal={openLogDetailModal}
                    copyVerboseLogToClipboard={copyVerboseLogToClipboard}
                    showToast={showToast}
                />
            )}
        </div>
    );
};
