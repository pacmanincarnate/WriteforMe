/**
 * @module views/directive/DirectiveView
 * Editorial Desk / Multi-Scale Request Change view (`view === 'directive'`):
 * prompt form, safeguard toggles, quick suggestions, strategic analysis & plan refinement dock,
 * proposed actions checklist (`DirectiveActionCard`), execution pipeline progress & revert bar.
 */

import {
    Brain,
    EditorialSubNav,
    Loader2,
    Plus,
    RotateCcw,
    Sparkles,
    Wand2,
    Check,
    type EditorialSubNavProps
} from '@/components';
import { VIEW_LABELS } from '@/config';
import { clearDirectivePlanResults, computeDirectiveStoryStats } from '@/domain/story';
import { DirectiveActionCard } from './DirectiveActionCard';
import type { DirectiveViewProps } from './types';

export function DirectiveView({
    view,
    setView,
    story,
    setStory,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    allNarrativeModes,
    directiveInput,
    setDirectiveInput,
    protectWrittenProse,
    setProtectWrittenProse,
    cascadeSceneChanges,
    setCascadeSceneChanges,
    verifyDirectiveEdits,
    setVerifyDirectiveEdits,
    isPlanningDirective,
    isExecutingDirective,
    directivePlanPhase,
    directivePlan,
    setDirectivePlan,
    directivePlanHistory,
    setDirectivePlanHistory,
    directiveRefinement,
    setDirectiveRefinement,
    expandedDirectiveActions,
    setExpandedDirectiveActions,
    directiveExecutionLogs,
    setDirectiveExecutionLogs,
    directiveProgress,
    directiveUndoSnapshot,
    setDirectiveUndoSnapshot,
    runDirectivePlanner,
    restorePreviousDirectivePlan,
    executeDirectivePlan,
    handleAddManualDirectiveAction,
    handleToggleDirectiveActionSkip,
    handleRemoveDirectiveAction,
    handleUpdateActionField,
    handleUpdateActionDetail,
    handleUpdateAppliedEdit,
    handleUndoSurgicalEdit,
    handleFixDirectiveReview,
    showToast
}: DirectiveViewProps) {
    const stats = computeDirectiveStoryStats(
        story as unknown as Parameters<typeof computeDirectiveStoryStats>[0]
    );
    const planActions = directivePlan?.actions || [];
    const activeActions = planActions.filter((a) => a.skipped !== true);
    const allExpanded =
        planActions.length > 0 &&
        planActions.every((_, idx) => Boolean(expandedDirectiveActions[idx]));
    const seqList = story.sequences || [];
    const firstTargetSeqNum = stats.firstDevelopedSeq?.number || seqList[0]?.number || 1;

    const quickSuggestions = [
        {
            label: 'Add scene',
            prompt: `Add a high-stakes confrontation scene to Sequence ${firstTargetSeqNum}.`,
            disabled: !stats.hasOutline
        },
        {
            label: stats.firstUnwrittenSeq
                ? `Steer Seq ${stats.firstUnwrittenSeq.number} (unwritten)`
                : 'Steer unwritten areas',
            prompt: stats.firstUnwrittenSeq
                ? `In unwritten Sequence ${stats.firstUnwrittenSeq.number} (${stats.firstUnwrittenSeq.title}), include more investigative tension and quiet character-bonding moments.`
                : 'Include more investigative mystery scenes and quiet character moments in future unwritten sequences.',
            disabled: false
        },
        {
            label: stats.firstCastName
                ? `Revise ${stats.firstCastName}'s arc`
                : 'Revise character & arc',
            prompt: stats.firstCastName
                ? `Deepen ${stats.firstCastName}'s core flaw and update their character arc and related scenes to reflect higher personal stakes.`
                : "Revise the antagonist's core motivation and update their character arc and existing scenes.",
            disabled: false
        },
        ...(stats.latestWrittenRef
            ? [
                  {
                      label: `Polish ${stats.latestWrittenRef.label} prose`,
                      prompt: `Tighten sensory grounding and sharpen dialogue subtext in ${stats.latestWrittenRef.label} without changing plot events.`,
                      disabled: false
                  }
              ]
            : [])
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-32">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />

            {/* Top Hero & Live Manuscript Scope Strip */}
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            {story.title && (
                                <span className="text-xs font-serif italic text-ink-500">
                                    {story.title}
                                </span>
                            )}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                            <Wand2 className="text-gold-ink" size={24} /> {VIEW_LABELS.directive}
                        </h2>
                        <p className="text-xs text-ink-500 max-w-3xl leading-relaxed">
                            Ask for any change across drafted prose, scene blueprints, cast arcs, or
                            future unwritten sequences. Preview and customize the plan before anything
                            touches your manuscript.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {stats.hasOutline ? (
                            <>
                                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-sage-tint border border-sage-edge text-sage-800">
                                    {stats.writtenSceneCount} Written
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-gold-tint border border-gold-edge text-gold-ink">
                                    {stats.plannedSceneCount} Planned
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-iris-tint border border-iris-edge text-iris-800">
                                    {stats.undevelopedSeqCount} Undeveloped Seq
                                </span>
                            </>
                        ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-inset border border-edge-strong text-ink-600">
                                Pre-Outline Stage · Premise &amp; Author&apos;s Note
                            </span>
                        )}
                    </div>
                </div>
                {!stats.hasOutline && (
                    <div className="px-4 py-2.5 rounded-xl bg-inset border border-edge-strong text-xs text-ink-600 flex flex-wrap items-center justify-between gap-2">
                        <span>
                            No Acts or Sequences are generated yet. Requests now will update Story
                            Premise, Cast, Lore, or your global Author&apos;s Note for upcoming
                            outline generation.
                        </span>
                        <button
                            type="button"
                            onClick={handleAddManualDirectiveAction}
                            disabled={isPlanningDirective || isExecutingDirective}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-edge-strong text-ink-700 hover:bg-wash font-semibold text-xs transition-colors cursor-pointer"
                        >
                            + Add Author&apos;s Note Rule
                        </button>
                    </div>
                )}
            </div>

            {/* Directive Input Form */}
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                        Describe the change you want to make
                    </label>
                    <span className="text-[11px] text-ink-400 font-serif italic">
                        Developed targets edit directly; unwritten areas save persistent mandates
                    </span>
                </div>
                <textarea
                    value={directiveInput}
                    onChange={(e) => setDirectiveInput(e.target.value)}
                    placeholder="E.g., Request more quiet character-bonding scenes in unwritten Sequences 5–6; or add a confrontation scene in Sequence 1; or revise Mara's core flaw and update her arc and existing scenes."
                    className="w-full bg-inset text-ink-900 border border-edge-strong rounded-xl p-4 h-28 text-xs sm:text-sm outline-none focus:border-gold transition-colors placeholder:text-ink-400 resize-none font-normal leading-relaxed"
                    disabled={isPlanningDirective || isExecutingDirective}
                />

                {/* Uniform Safeguard Toggle Pills */}
                <div className="flex flex-wrap items-center gap-2.5">
                    <label
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${protectWrittenProse ? 'bg-gold-tint border-gold-edge text-gold-ink font-semibold' : 'bg-inset border-edge-strong text-ink-600 hover:bg-wash'}`}
                        title="Block structural changes to written regions; allow prose patches and line edits"
                    >
                        <input
                            type="checkbox"
                            id="protectWrittenProse"
                            checked={protectWrittenProse}
                            onChange={(e) => setProtectWrittenProse(e.target.checked)}
                            className="rounded border-edge-strong text-gold focus:ring-gold"
                            disabled={isPlanningDirective || isExecutingDirective}
                        />
                        <span>Protect Written Prose</span>
                    </label>
                    <label
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${cascadeSceneChanges ? 'bg-gold-tint border-gold-edge text-gold-ink font-semibold' : 'bg-inset border-edge-strong text-ink-600 hover:bg-wash'}`}
                    >
                        <input
                            type="checkbox"
                            checked={cascadeSceneChanges}
                            onChange={(e) => setCascadeSceneChanges(e.target.checked)}
                            className="rounded border-edge-strong text-gold focus:ring-gold"
                            disabled={isPlanningDirective || isExecutingDirective}
                        />
                        <span>Cascade scene blueprint changes into written prose</span>
                    </label>
                    <label
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${verifyDirectiveEdits ? 'bg-gold-tint border-gold-edge text-gold-ink font-semibold' : 'bg-inset border-edge-strong text-ink-600 hover:bg-wash'}`}
                    >
                        <input
                            type="checkbox"
                            checked={verifyDirectiveEdits}
                            onChange={(e) => setVerifyDirectiveEdits(e.target.checked)}
                            className="rounded border-edge-strong text-gold focus:ring-gold"
                            disabled={isPlanningDirective || isExecutingDirective}
                        />
                        <span>Verify and archive edited prose</span>
                    </label>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-3 pt-1">
                    <div className="text-xs text-ink-500 space-y-1.5 flex-1 min-w-0">
                        <span className="font-semibold text-ink-400 font-mono uppercase text-[11px] block">
                            Quick Suggestions
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {quickSuggestions.map((sug, sIdx) => (
                                <button
                                    key={sIdx}
                                    type="button"
                                    onClick={() => setDirectiveInput(sug.prompt)}
                                    className="bg-inset hover:bg-wash px-3 py-1.5 rounded-lg border border-edge-strong text-ink-700 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
                                    disabled={
                                        isPlanningDirective || isExecutingDirective || sug.disabled
                                    }
                                >
                                    {sug.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => runDirectivePlanner()}
                        disabled={
                            isPlanningDirective || isExecutingDirective || !directiveInput.trim()
                        }
                        className="bg-btn hover:bg-btn-hover px-6 py-2.5 rounded-xl font-bold text-xs shadow-sm text-btn-ink transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 w-full sm:w-auto cursor-pointer"
                    >
                        {isPlanningDirective ? (
                            <>
                                <Loader2 className="animate-spin text-amber-300" size={14} />
                                {directivePlanPhase === 'scoping' ? 'Scoping…' : 'Planning…'}
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} className="text-amber-300 fill-current" />
                                Evaluate Directive
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Directive Plan Board */}
            {directivePlan && (
                <div className="space-y-6 animate-fade-in">
                    {/* Strategic Evaluation + Accessible Refinement Bar */}
                    <div className="bg-surface border border-edge rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider flex items-center gap-1.5 font-mono">
                                <Brain size={16} /> Strategic Analysis &amp; Strategy
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-inset border border-edge-strong text-[11px] font-mono font-bold text-ink-700">
                                    {activeActions.length} of {planActions.length} Active
                                </span>
                                {directivePlan.scope_kind === 'arc' && (
                                    <span className="px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-[11px] font-mono font-bold text-gold-ink">
                                        Arc-Wide Scope
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className="text-sm text-ink-800 leading-relaxed font-serif whitespace-pre-wrap">
                            {directivePlan.evaluation}
                        </p>
                        {directivePlan.scope_kind === 'arc' && directivePlan.consistency_notes && (
                            <div className="border-t border-edge pt-3 text-xs text-ink-700 whitespace-pre-wrap">
                                <span className="font-bold">Arc consistency notes</span>
                                <p className="mt-1 leading-relaxed">
                                    {directivePlan.consistency_notes}
                                </p>
                            </div>
                        )}
                        {directivePlan.consistencyReview && (
                            <div className="border-t border-edge pt-3 space-y-2 text-xs">
                                <span
                                    className={`inline-block rounded-lg border px-2.5 py-1 font-bold ${directivePlan.consistencyReview.status === 'PASS' ? 'bg-sage-tint text-sage-800 border-sage-edge' : 'bg-blush-tint text-blush-800 border-blush-edge'}`}
                                >
                                    Cross-scene consistency:{' '}
                                    {directivePlan.consistencyReview.status === 'PASS'
                                        ? 'PASS'
                                        : `${directivePlan.consistencyReview.issues.length} issues`}
                                </span>
                                {directivePlan.consistencyReview.issues.map((issue, issueIdx) => (
                                    <div key={issueIdx} className="text-ink-700 whitespace-pre-wrap">
                                        <p>
                                            <strong>
                                                {issue.severity} · {issue.category}
                                            </strong>
                                            : {issue.description}
                                        </p>
                                        {issue.location && <p>{issue.location}</p>}
                                        {issue.fix_suggestion && (
                                            <p>Suggested fix: {issue.fix_suggestion}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Inline Plan Refinement Dock */}
                        <div className="border-t border-edge pt-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label
                                    htmlFor="directiveRefinement"
                                    className="text-xs font-bold text-ink-600 uppercase font-mono"
                                >
                                    Refine this plan
                                </label>
                                {directivePlanHistory.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={restorePreviousDirectivePlan}
                                        disabled={isPlanningDirective || isExecutingDirective}
                                        className="text-xs text-gold-ink hover:underline font-medium disabled:opacity-50 cursor-pointer"
                                    >
                                        Restore previous plan ({directivePlanHistory.length})
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <textarea
                                    id="directiveRefinement"
                                    value={directiveRefinement}
                                    onChange={(e) => setDirectiveRefinement(e.target.value)}
                                    disabled={isPlanningDirective || isExecutingDirective}
                                    placeholder="Describe which actions to change, split, add, or remove..."
                                    className="flex-1 h-12 bg-inset border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-900 outline-none focus:border-gold resize-none leading-relaxed"
                                />
                                <button
                                    type="button"
                                    onClick={() => runDirectivePlanner(directiveRefinement)}
                                    disabled={
                                        isPlanningDirective ||
                                        isExecutingDirective ||
                                        !directiveRefinement.trim()
                                    }
                                    className="bg-surface hover:bg-wash border border-edge-strong text-ink-800 rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-50 shrink-0 transition-colors cursor-pointer"
                                >
                                    Refine this plan
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Proposed Actions Checklist */}
                    <div className="bg-surface border border-edge rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-5 sm:p-6 border-b border-edge bg-inset flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h3 className="text-xs font-bold text-ink-800 uppercase tracking-wider font-mono">
                                    Proposed Changes
                                </h3>
                                <p className="text-xs text-ink-500 mt-0.5">
                                    Preview before/after changes, skip unwanted steps, or expand any
                                    action to edit exact fields.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {planActions.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (allExpanded) setExpandedDirectiveActions({});
                                            else {
                                                const next: Record<number, boolean> = {};
                                                planActions.forEach((_, idx) => {
                                                    next[idx] = true;
                                                });
                                                setExpandedDirectiveActions(next);
                                            }
                                        }}
                                        className="px-3 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-700 text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                        {allExpanded ? 'Collapse All' : 'Expand All Fields'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleAddManualDirectiveAction}
                                    disabled={isPlanningDirective || isExecutingDirective}
                                    className="px-3 py-1.5 rounded-xl border border-gold-edge bg-gold-tint hover:bg-gold/20 text-gold-ink text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    <Plus size={13} /> Add Action
                                </button>
                            </div>
                        </div>
                        <fieldset
                            disabled={isPlanningDirective || isExecutingDirective}
                            className="min-w-0 divide-y divide-edge"
                        >
                            {planActions.length === 0 ? (
                                <div className="p-8 text-center text-xs text-ink-500 space-y-2">
                                    <p>No actions remaining in this plan.</p>
                                    <button
                                        type="button"
                                        onClick={handleAddManualDirectiveAction}
                                        className="px-3.5 py-1.5 rounded-xl bg-gold-tint border border-gold-edge text-gold-ink font-bold text-xs cursor-pointer"
                                    >
                                        + Add Action Manually
                                    </button>
                                </div>
                            ) : (
                                planActions.map((act, actIdx) => (
                                    <DirectiveActionCard
                                        key={actIdx}
                                        act={act}
                                        actIdx={actIdx}
                                        story={story}
                                        allNarrativeModes={allNarrativeModes}
                                        protectWrittenProse={protectWrittenProse}
                                        cascadeSceneChanges={cascadeSceneChanges}
                                        isPlanningDirective={isPlanningDirective}
                                        isExecutingDirective={isExecutingDirective}
                                        isExpanded={Boolean(expandedDirectiveActions[actIdx])}
                                        onToggleExpand={() =>
                                            setExpandedDirectiveActions((prev) => ({
                                                ...prev,
                                                [actIdx]: !prev[actIdx]
                                            }))
                                        }
                                        onToggleSkip={handleToggleDirectiveActionSkip}
                                        onRemove={handleRemoveDirectiveAction}
                                        onUpdateField={handleUpdateActionField}
                                        onUpdateDetail={handleUpdateActionDetail}
                                        onUpdateAppliedEdit={handleUpdateAppliedEdit}
                                        onUndoSurgicalEdit={handleUndoSurgicalEdit}
                                        onFixDirectiveReview={handleFixDirectiveReview}
                                    />
                                ))
                            )}
                        </fieldset>
                        <div className="p-5 sm:p-6 bg-inset border-t border-edge flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <span className="text-xs text-ink-500 font-mono">
                                {activeActions.length === 0
                                    ? 'All actions skipped — include or add an action to execute.'
                                    : `${activeActions.length} action${activeActions.length === 1 ? '' : 's'} queued for execution`}
                            </span>
                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDirectivePlan(null);
                                        setExpandedDirectiveActions({});
                                    }}
                                    className="px-4 py-2 rounded-xl border border-edge-strong bg-surface text-ink-600 hover:text-ink-900 text-xs hover:bg-lift transition-colors shadow-2xs font-semibold cursor-pointer"
                                    disabled={isPlanningDirective || isExecutingDirective}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => executeDirectivePlan(directivePlan.actions)}
                                    className="bg-btn hover:bg-btn-hover px-6 py-2 rounded-xl font-bold text-xs shadow-sm text-btn-ink transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    disabled={
                                        isPlanningDirective ||
                                        isExecutingDirective ||
                                        activeActions.length === 0
                                    }
                                >
                                    <Check size={14} className="text-amber-300" />
                                    Apply &amp; Execute Plan
                                    {activeActions.length > 0 ? ` (${activeActions.length})` : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Directive Execution Log Board */}
            {(isExecutingDirective || directiveExecutionLogs.length > 0) && (
                <div className="bg-surface border border-edge rounded-2xl overflow-hidden shadow-sm animate-fade-in">
                    <div className="p-5 sm:p-6 border-b border-edge bg-inset space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-bold text-ink-800 uppercase tracking-wider font-mono">
                                Execution Pipeline
                            </h3>
                            {!isExecutingDirective && directiveUndoSnapshot && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStory(directiveUndoSnapshot);
                                        setDirectiveUndoSnapshot(null);
                                        setDirectivePlan((prev) =>
                                            prev
                                                ? (clearDirectivePlanResults(
                                                      prev as unknown as Parameters<
                                                          typeof clearDirectivePlanResults
                                                      >[0]
                                                  ) as unknown as typeof prev)
                                                : prev
                                        );
                                        const text = 'Reverted all changes from this directive.';
                                        setDirectiveExecutionLogs((prev) => [
                                            ...prev,
                                            {
                                                id: Date.now() + Math.random(),
                                                text,
                                                status: 'complete'
                                            }
                                        ]);
                                        showToast(text, 'info');
                                    }}
                                    className="px-3 py-1 rounded-lg border border-edge-strong bg-surface hover:bg-lift text-ink-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                                    disabled={isPlanningDirective}
                                >
                                    <RotateCcw size={12} /> Revert This Plan
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 bg-mist-200 h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-gold h-full transition-all duration-300"
                                    style={{ width: `${directiveProgress}%` }}
                                />
                            </div>
                            <span className="text-xs font-mono font-bold text-ink-600">
                                {directiveProgress}%
                            </span>
                        </div>
                    </div>
                    <div className="bg-inset p-5 font-mono text-xs text-ink-700 min-h-45 max-h-60 overflow-y-auto space-y-2 border-b border-edge-strong">
                        {directiveExecutionLogs.map((log) => {
                            let colorClass = 'text-ink-500';
                            if (log.status === 'running')
                                colorClass = 'text-gold-ink font-bold animate-pulse';
                            if (log.status === 'success') colorClass = 'text-sage-700 font-medium';
                            if (log.status === 'error') colorClass = 'text-blush-600 font-bold';
                            if (log.status === 'complete') colorClass = 'text-gold-ink font-bold';

                            return (
                                <div key={log.id} className={`flex gap-2 items-start ${colorClass}`}>
                                    <span>➔</span>
                                    <span className="whitespace-pre-wrap">{log.text}</span>
                                </div>
                            );
                        })}
                    </div>
                    {!isExecutingDirective &&
                        directiveExecutionLogs.some((l) => l.status === 'complete') && (
                            <div className="p-4 bg-surface flex flex-wrap justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDirectivePlan(null);
                                        setExpandedDirectiveActions({});
                                        setDirectivePlanHistory([]);
                                        setDirectiveRefinement('');
                                        setDirectiveExecutionLogs([]);
                                        setDirectiveInput('');
                                    }}
                                    className="px-5 py-2 rounded-xl bg-mist-100 hover:bg-mist-200 text-ink-700 font-bold text-xs transition-colors cursor-pointer"
                                    disabled={isPlanningDirective}
                                >
                                    Clear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setView('structure')}
                                    className="px-5 py-2 rounded-xl bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs transition-all active:scale-95 cursor-pointer"
                                >
                                    Go to Story Outline
                                </button>
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}
