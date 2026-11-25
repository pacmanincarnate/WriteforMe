/**
 * @module views/pipeline/PipelineGraphMode
 * Mode 3 of PipelineView: 22-step cascading multi-agent technical graph,
 * step inspector sidebar, and bottom console event feed.
 */

import React from 'react';
import {
    Brain,
    Copy,
    FileText,
    History,
    MessageSquare,
    Terminal,
    Workflow
} from '@/components';
import { PIPELINE_STEPS } from '@/components';
import { PIPELINE_STEP_SPEC } from '@/config';
import { formatVerboseLogEntry } from '@/domain/story';
import type { PipelineGraphModeProps, PipelinePromptLogEntry } from './types';

const GRAPH_PHASES: Array<{ phaseName: string; stepRange: [number, number] }> = [
    { phaseName: 'Phase 1: Story Conception & Worldbuilding', stepRange: [1, 4] },
    { phaseName: 'Phase 2: Structural Outlining', stepRange: [5, 8] },
    { phaseName: 'Phase 3: Sequence & Scene Blueprint Outlining', stepRange: [9, 14] },
    { phaseName: 'Phase 4: Prose Generation & Review', stepRange: [17, 20] },
    { phaseName: 'Phase 5: Post-Drafting Autonomous Editorial Harness & Literary CI/CD', stepRange: [21, 21] },
    { phaseName: 'Phase 6: Audio Drama Multi-Voice Production', stepRange: [22, 22] }
];

const REVIEW_STEP_IDS = [4, 6, 10, 12, 14, 16, 17, 19];

function findRecentLogForStep(
    promptLog: PipelinePromptLogEntry[],
    stepId: number,
    tier?: string,
    title?: string,
    fnSpec?: string
): PipelinePromptLogEntry | undefined {
    return promptLog.find(
        (e) =>
            e &&
            (e.stepId === stepId ||
                (e.stepTier && tier && e.stepTier.toLowerCase() === tier.toLowerCase()) ||
                (e.function &&
                    typeof e.function === 'string' &&
                    ((title && e.function.toLowerCase().includes(title.toLowerCase())) ||
                        (tier && e.function.toLowerCase().includes(tier.toLowerCase())) ||
                        (fnSpec && e.function.toLowerCase().includes(fnSpec.replace(/\(\)/g, '').toLowerCase())))))
    );
}

export const PipelineGraphMode: React.FC<PipelineGraphModeProps> = ({
    loading,
    currentPipelineStep,
    inspectedStepId,
    setInspectedStepId,
    pipelineViewMode,
    promptLog,
    setView,
    openLogDetailModal,
    copyVerboseLogToClipboard,
    showToast
}) => {
    const activeStepId = inspectedStepId || currentPipelineStep || 1;
    const isFollowingLive = loading && currentPipelineStep !== null && inspectedStepId === null;
    const isInspectingDifferent =
        loading && currentPipelineStep !== null && inspectedStepId !== null && inspectedStepId !== currentPipelineStep;
    const spec = PIPELINE_STEP_SPEC[activeStepId];
    const activeStepDef = Array.isArray(PIPELINE_STEPS)
        ? PIPELINE_STEPS.find((s) => s.id === activeStepId) || null
        : null;
    const stepRecentLog = spec
        ? findRecentLogForStep(promptLog, activeStepId, activeStepDef?.tier, spec.title, spec.function)
        : undefined;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Columns: Flowchart Cards */}
                <div className="lg:col-span-2 space-y-6">
                    {GRAPH_PHASES.map((phase, phaseIdx) => {
                        const phaseSteps = PIPELINE_STEPS.filter(
                            (s) => s.id >= phase.stepRange[0] && s.id <= phase.stepRange[1]
                        );

                        let visibleSteps = phaseSteps;
                        if (pipelineViewMode === 'simplified') {
                            visibleSteps = phaseSteps.filter((s) => !REVIEW_STEP_IDS.includes(s.id));
                            if (visibleSteps.length === 0) return null;
                        }

                        return (
                            <div key={phaseIdx} className="space-y-3">
                                <div className="text-xs font-bold tracking-widest text-gold-ink uppercase bg-inset border border-edge-strong px-4 py-2 rounded-xl font-mono">
                                    {phase.phaseName}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    {visibleSteps.map((step) => {
                                        const IconComp = step.icon;
                                        const isActiveStep = loading && currentPipelineStep === step.id;
                                        const isInspected = activeStepId === step.id;
                                        const recentLog = findRecentLogForStep(
                                            promptLog,
                                            step.id,
                                            step.tier,
                                            step.title
                                        );

                                        return (
                                            <div
                                                key={step.id}
                                                onClick={() =>
                                                    setInspectedStepId(inspectedStepId === step.id ? null : step.id)
                                                }
                                                className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                                                    isActiveStep
                                                        ? 'border-gold bg-inset ring-2 ring-gold/20'
                                                        : isInspected
                                                          ? 'border-stone-400 bg-surface ring-1 ring-edge-strong'
                                                          : 'bg-surface border-edge hover:border-edge-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <span className="step-num text-[11px] font-bold text-gold-ink bg-gold-tint px-2.5 py-0.5 rounded-full border border-gold-edge font-mono">
                                                        Step {step.id}
                                                    </span>
                                                    <span className="step-tier text-[11px] text-ink-500 font-semibold flex items-center gap-1 font-mono">
                                                        {step.tier}
                                                    </span>
                                                </div>

                                                <div className="font-bold text-sm text-ink-900 flex items-center gap-2 mb-1.5 font-serif">
                                                    <IconComp size={16} className={step.iconColor} />
                                                    <span>{step.title}</span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                                    <span className="text-xs font-bold uppercase font-mono px-2.5 py-0.5 rounded-full bg-mist-100 border border-edge-strong text-ink-700">
                                                        {step.badge}
                                                    </span>
                                                    {recentLog && recentLog.durationSec && (
                                                        <span className="text-xs font-mono text-sage-800 bg-sage-tint px-2.5 py-0.5 rounded-full border border-sage-edge font-bold">
                                                            ⏱️ {recentLog.durationSec}s
                                                        </span>
                                                    )}
                                                    {recentLog && (
                                                        <span
                                                            className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border ${
                                                                recentLog.status === 'success'
                                                                    ? 'text-sage-800 bg-sage-tint border-sage-edge'
                                                                    : recentLog.status === 'error'
                                                                      ? 'text-blush-800 bg-blush-tint border-blush-edge'
                                                                      : 'text-ember-800 bg-ember-tint border-ember-edge'
                                                            }`}
                                                        >
                                                            {recentLog.status === 'success'
                                                                ? 'PASS'
                                                                : recentLog.status === 'error'
                                                                  ? 'FAIL'
                                                                  : 'RUNNING'}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="text-xs text-ink-600 line-clamp-2 mb-2">
                                                    <strong className="text-ink-800 font-semibold">Inputs:</strong>{' '}
                                                    {step.inputs}
                                                </div>

                                                <div className="text-[11px] text-ember-900 font-semibold bg-ember-tint border border-ember-edge px-2.5 py-1 rounded-xl font-mono">
                                                    Gate: {step.gate}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Column: Step Inspector Sidebar */}
                <div className="lg:col-span-1">
                    {spec && (
                        <div className="bg-surface rounded-2xl border border-edge p-5 sm:p-6 space-y-4 sticky top-6 shadow-sm">
                            <div className="border-b border-edge-strong pb-3.5 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gold-ink bg-gold-tint border border-gold-edge px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                                            Step {activeStepId}
                                        </span>
                                        {activeStepDef?.tier && (
                                            <span className="text-xs font-bold text-ink-600 bg-mist-100 border border-edge-strong px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                                                {activeStepDef.tier}
                                            </span>
                                        )}
                                        {isFollowingLive && (
                                            <span className="text-xs font-bold text-sage-800 bg-sage-tint border border-sage-edge px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 animate-pulse font-mono">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>{' '}
                                                Live Execution
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-serif font-bold text-ink-900 text-lg mt-1.5">{spec.title}</h3>
                                </div>
                                {isInspectingDifferent ? (
                                    <button
                                        onClick={() => setInspectedStepId(null)}
                                        className="px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-bold bg-gold-tint text-gold-ink border border-gold-edge hover:bg-gold/25 transition-colors flex items-center gap-1"
                                        title="Snap back to tracking current running pipeline stage"
                                    >
                                        <Workflow size={13} className="animate-spin text-gold-ink" />
                                        Live Stage ({currentPipelineStep})
                                    </button>
                                ) : (
                                    <button
                                        onClick={() =>
                                            setInspectedStepId(inspectedStepId === activeStepId ? null : activeStepId)
                                        }
                                        className={`px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-bold transition-all flex items-center gap-1 border ${
                                            inspectedStepId === activeStepId
                                                ? 'bg-btn text-btn-ink border-[#1C1917]'
                                                : 'bg-surface text-ink-700 border-edge-strong hover:bg-lift'
                                        }`}
                                    >
                                        <Workflow size={13} />
                                        {inspectedStepId === activeStepId ? 'Inspected' : 'Inspect'}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 text-xs">
                                <div>
                                    <div className="text-xs font-bold uppercase text-ink-500 font-mono mb-1">
                                        Function Signature
                                    </div>
                                    <code className="text-gold-ink bg-inset border border-edge-strong p-2 rounded-xl block text-[11px] font-mono">
                                        {spec.function}
                                    </code>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-ink-500 font-mono mb-1">
                                        Target Model &amp; Provider
                                    </div>
                                    <div className="text-ink-800 font-semibold">{spec.model}</div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-ink-500 font-mono mb-1">
                                        Passed Context &amp; Inputs
                                    </div>
                                    <div className="text-ink-700 leading-relaxed bg-inset p-2.5 rounded-xl border border-edge-strong">
                                        {spec.inputs}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-ink-500 font-mono mb-1">
                                        Expected Output Format
                                    </div>
                                    <div className="text-ink-700 leading-relaxed bg-inset p-2.5 rounded-xl border border-edge-strong">
                                        {spec.output}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-ember-800 font-mono mb-1">
                                        Gate Condition to Advance
                                    </div>
                                    <div className="text-ember-900 font-semibold bg-ember-tint p-2.5 rounded-xl border border-ember-edge">
                                        {spec.gate}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-blush-800 font-mono mb-1">
                                        Retry &amp; Escalation Mechanics
                                    </div>
                                    <div className="text-ink-700 leading-relaxed bg-inset p-2.5 rounded-xl border border-edge-strong">
                                        {spec.retries}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold uppercase text-gold-ink font-mono mb-1">
                                        Critical Constraints
                                    </div>
                                    <div className="text-ink-700 leading-relaxed bg-inset p-2.5 rounded-xl border border-edge-strong">
                                        {spec.constraints}
                                    </div>
                                </div>

                                {!stepRecentLog ? (
                                    <div className="pt-2 border-t border-edge-strong text-[11px] text-ink-400 italic">
                                        No execution logs captured for Step {activeStepId} in this session yet.
                                    </div>
                                ) : (
                                    <div className="pt-3 border-t border-edge-strong space-y-2">
                                        <div className="text-xs font-bold uppercase text-ink-500 font-mono flex items-center justify-between">
                                            <span>Latest Step Telemetry</span>
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded font-bold ${
                                                    stepRecentLog.status === 'error'
                                                        ? 'bg-blush-tint text-blush-800'
                                                        : 'bg-sage-tint text-sage-800'
                                                }`}
                                            >
                                                {stepRecentLog.status === 'error' ? 'Failed' : 'Captured'}
                                            </span>
                                        </div>
                                        <div className="bg-inset p-2 rounded-xl border border-edge-strong text-[11px] font-mono text-ink-600 truncate">
                                            {stepRecentLog.function} • {stepRecentLog.timestamp}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const formatted = formatVerboseLogEntry(stepRecentLog);
                                                    copyVerboseLogToClipboard(formatted, showToast);
                                                }}
                                                className="flex-1 py-2 px-2.5 min-h-[38px] bg-surface hover:bg-lift border border-edge-strong rounded-xl text-xs font-semibold text-ink-700 hover:text-ink-900 transition-colors flex items-center justify-center gap-1 shadow-2xs"
                                                title="Copy full verbose dossier for this step"
                                            >
                                                <Copy size={13} className="text-gold-ink" />
                                                <span>Copy Verbose Log</span>
                                            </button>
                                            <button
                                                onClick={() => openLogDetailModal('verbose', stepRecentLog)}
                                                className="py-2 px-3 min-h-[38px] bg-gold-tint hover:bg-gold/25 border border-gold-edge rounded-xl text-xs font-semibold text-gold-ink transition-colors flex items-center justify-center gap-1 shadow-2xs"
                                                title="Inspect complete request and response parameters in full modal"
                                            >
                                                <FileText size={13} />
                                                <span>Dossier</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Console Feed */}
            <div className="bg-surface rounded-2xl border border-edge p-6 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-edge-strong pb-3">
                    <h3 className="font-bold text-sm text-ink-900 flex items-center gap-2">
                        <Terminal className="text-gold-ink" size={16} /> Live Pipeline Stream &amp; Event Feed
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('logs')}
                            className="text-xs text-gold-ink hover:underline flex items-center gap-1 font-semibold"
                        >
                            Open Prompt Log <History size={12} />
                        </button>
                    </div>
                </div>

                <div className="bg-inset rounded-xl p-4 font-mono text-xs max-h-64 overflow-y-auto space-y-2 border border-edge-strong custom-scrollbar text-ink-700">
                    {promptLog.length === 0 ? (
                        <div className="text-ink-400 italic text-center py-6">
                            No stream events recorded yet. Run Autopilot or a generation step to see real-time pipeline
                            telemetry.
                        </div>
                    ) : (
                        promptLog.slice(0, 15).map((entry) => (
                            <div
                                key={entry.id}
                                className="flex flex-wrap items-center gap-2 border-b border-edge-strong pb-1.5 text-xs"
                            >
                                <span className="text-ink-400 font-mono">[{entry.timestamp}]</span>
                                <span className="text-gold-ink font-bold font-mono">[{entry.function}]</span>
                                {entry.durationSec && (
                                    <span className="text-sage-800 font-bold font-mono bg-sage-tint px-2 py-0.5 rounded border border-sage-edge text-[11px]">
                                        ⏱️ {entry.durationSec}s
                                    </span>
                                )}
                                {!entry.isDelay && !entry.isValidation && (
                                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                        {entry.thinkingTokens !== null && entry.thinkingTokens !== undefined ? (
                                            <span className="text-plum-800 bg-plum-tint px-2 py-0.5 rounded border border-plum-edge font-bold flex items-center gap-1">
                                                <Brain size={11} className="text-plum-600" />
                                                Think: {entry.thinkingTokens} tok
                                            </span>
                                        ) : entry.reasoningTokensUsed !== null &&
                                          entry.reasoningTokensUsed !== undefined ? (
                                            <span className="text-plum-800 bg-plum-tint px-2 py-0.5 rounded border border-plum-edge font-bold flex items-center gap-1">
                                                <Brain size={11} className="text-plum-600" />
                                                Think: {entry.reasoningTokensUsed} tok
                                            </span>
                                        ) : null}
                                        {entry.responseTokens !== null && entry.responseTokens !== undefined && (
                                            <span className="text-blue-800 bg-azure-tint px-2 py-0.5 rounded border border-azure-edge font-bold flex items-center gap-1">
                                                <MessageSquare size={11} className="text-blue-600" />
                                                Resp: {entry.responseTokens} tok
                                            </span>
                                        )}
                                    </div>
                                )}
                                <span
                                    className={`font-mono text-xs ${
                                        entry.status === 'error'
                                            ? 'text-blush-700 font-bold'
                                            : entry.isDelay
                                              ? 'text-azure-700 font-bold'
                                              : entry.isValidation
                                                ? 'text-ember-800'
                                                : 'text-ink-700'
                                    }`}
                                >
                                    {entry.validationSummary || entry.prompt?.slice(0, 100)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
