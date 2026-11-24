/**
 * @module components/common/LiveCreationIsland
 * Header status pill displaying human-translated progress for novel & audio autopilot runs.
 */

import { Headphones, Workflow } from '@/components/icons';
import { translateLoadingStepToHuman } from '@/domain/story';

export interface ActivePipelineWorkInfo {
    sceneLabel?: string;
    seqNumber?: string | number;
    itemIndex?: number;
    itemTotal?: number;
    elementType?: string;
    subStep?: string;
}

export interface LiveCreationIslandProps {
    loading: boolean;
    loadingStep?: string;
    continuousAutopilot?: boolean;
    isAudioAutopilotRunning?: boolean;
    story?: Record<string, unknown> | null;
    setView?: (view: string) => void;
    activePipelineWork?: ActivePipelineWorkInfo | null;
    novelProgress?: { overallPct?: number } | null;
    audioAutopilotProgress?: {
        currentSceneLabel?: string;
        activeSpeaker?: string;
        stageLabel?: string;
        stageMessage?: string;
    } | null;
    audioProgress?: { overallPct?: number } | null;
    setPipelineDisplayMode?: ((mode: string) => void) | null;
}

export function LiveCreationIsland({
    loading,
    loadingStep,
    continuousAutopilot,
    isAudioAutopilotRunning,
    story,
    setView,
    activePipelineWork = null,
    novelProgress = null,
    audioAutopilotProgress = null,
    audioProgress = null,
    setPipelineDisplayMode = null
}: LiveCreationIslandProps) {
    const isGenerating = Boolean(loading || continuousAutopilot || isAudioAutopilotRunning);
    if (!isGenerating) return null;

    const info = translateLoadingStepToHuman(
        loadingStep,
        story as Parameters<typeof translateLoadingStepToHuman>[1],
        activePipelineWork as Parameters<typeof translateLoadingStepToHuman>[2]
    );
    const isAudioMode = Boolean(isAudioAutopilotRunning);

    let badgeLabel = info.phaseLabel;
    let headline = info.humanHeadline;
    let subtext = info.subtext || 'Drafting and refining story...';
    let pct = info.progressPct;

    if (isAudioMode) {
        const scLabel = audioAutopilotProgress?.currentSceneLabel || 'Studio';
        badgeLabel = `Audio · ${scLabel}`;
        headline = audioAutopilotProgress?.activeSpeaker
            ? `${info.humanHeadline}: ${audioAutopilotProgress.activeSpeaker}`
            : audioAutopilotProgress?.stageLabel || info.humanHeadline;
        subtext =
            audioAutopilotProgress?.stageMessage ||
            info.subtext ||
            'Synthesizing multi-voice audio...';
        pct =
            typeof audioProgress?.overallPct === 'number'
                ? audioProgress.overallPct
                : info.progressPct;
    } else {
        if (activePipelineWork?.sceneLabel) {
            badgeLabel = `Scene ${activePipelineWork.sceneLabel}`;
        } else if (activePipelineWork?.seqNumber) {
            badgeLabel = `Seq ${activePipelineWork.seqNumber}`;
        } else if (
            activePipelineWork?.itemIndex &&
            activePipelineWork?.itemTotal &&
            activePipelineWork?.elementType === 'character'
        ) {
            badgeLabel = `Cast ${activePipelineWork.itemIndex}/${activePipelineWork.itemTotal}`;
        }
        if (activePipelineWork?.subStep) {
            headline = activePipelineWork.subStep;
        }
        if (typeof novelProgress?.overallPct === 'number' && novelProgress.overallPct > 0) {
            pct = novelProgress.overallPct;
        }
    }

    const openControlCenter = () => {
        if (setPipelineDisplayMode) {
            setPipelineDisplayMode(isAudioMode ? 'audio' : 'stage');
        }
        if (setView) setView('pipeline');
    };

    return (
        <div
            onClick={openControlCenter}
            className="live-creation-island flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-surface/90 hover:bg-surface border border-gold-edge/70 shadow-md backdrop-blur-md transition-all cursor-pointer group active:scale-[0.99] max-w-full shrink-0 animate-fade-in"
            title="Click to view Live Progress Control Center"
            role="status"
            aria-live="polite"
        >
            <div className="relative flex items-center justify-center shrink-0 w-3.5 h-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
            </div>

            <span className="hidden sm:inline-block text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold-tint text-gold-ink border border-gold-edge shrink-0">
                {badgeLabel}
            </span>

            <div className="flex flex-col min-w-0 max-w-[170px] sm:max-w-[260px]">
                <span className="font-serif font-bold text-xs text-ink-900 truncate tracking-tight group-hover:text-gold-ink transition-colors">
                    {headline}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-ink-500 font-sans truncate">{subtext}</span>
                    <div className="hidden md:block w-14 h-1 bg-mist-200 rounded-full overflow-hidden shrink-0">
                        <div
                            className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    openControlCenter();
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gold-tint text-gold-ink hover:bg-gold-tint-strong border border-gold-edge flex items-center gap-1 shrink-0 transition-transform active:scale-95 shadow-2xs ml-1 cursor-pointer"
                title="Open Live Progress Control Center"
            >
                {isAudioMode ? (
                    <Headphones size={11} className="text-gold-ink" />
                ) : (
                    <Workflow size={11} className="text-gold-ink" />
                )}
                <span className="hidden sm:inline">Watch Live</span>
            </button>
        </div>
    );
}
