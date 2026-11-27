/**
 * @module views/directive/DirectiveActionCard
 * Individual multi-scale proposed directive action card with live before/after diff preview,
 * protection & churn guard overrides, surgical prose undo diffs, and expandable field editors.
 */

import { Eye, EyeOff, SlidersHorizontal, Trash2 } from '@/components';
import { groupNarrativeModesForSelect, resolveNarrativeModeId } from '@/config';
import { locateNeedle } from '@/domain/editing';
import {
    actForSequence,
    buildDirectiveActionPreview,
    getDirectiveActionScopeMeta,
    isActionBlockedByProtection,
    parseActNumber,
    resolveDirectiveTargetLabel
} from '@/domain/story';
import type { DirectiveActionItem, DirectiveLineEditItem, DirectiveStory } from './types';

export interface EntityPickerOption {
    value: string;
    label: string;
}

export interface DirectiveActionCardProps {
    act: DirectiveActionItem;
    actIdx: number;
    story: DirectiveStory;
    allNarrativeModes: Record<string, unknown>;
    protectWrittenProse: boolean;
    cascadeSceneChanges: boolean;
    isPlanningDirective: boolean;
    isExecutingDirective: boolean;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onToggleSkip: (actIdx: number) => void;
    onRemove: (actIdx: number) => void;
    onUpdateField: (actIdx: number, field: string, value: unknown) => void;
    onUpdateDetail: (actIdx: number, field: string, value: unknown) => void;
    onUpdateAppliedEdit: (
        actIdx: number,
        editIdx: number,
        patch: Record<string, unknown>,
        isCascade?: boolean
    ) => void;
    onUndoSurgicalEdit: (actIdx: number, editIdx: number, isCascade?: boolean) => void;
    onFixDirectiveReview: (actIdx: number) => void | Promise<void>;
}

function renderEntityPicker(
    items: EntityPickerOption[],
    onSelectVal: (val: string) => void,
    placeholderLabel: string,
    isExecutingDirective: boolean
) {
    if (items.length === 0) return null;
    return (
        <select
            value=""
            onChange={(e) => {
                if (e.target.value) onSelectVal(e.target.value);
            }}
            disabled={isExecutingDirective}
            className="bg-inset text-ink-600 border border-edge-strong rounded-lg px-2 py-1 text-[11px] font-mono outline-none focus:border-gold cursor-pointer max-w-[165px] shrink-0"
            aria-label={placeholderLabel}
            title={placeholderLabel}
        >
            <option value="">{placeholderLabel}</option>
            {items.map((opt, idx) => (
                <option key={`${opt.value}-${idx}`} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

export function DirectiveActionCard({
    act,
    actIdx,
    story,
    allNarrativeModes,
    protectWrittenProse,
    cascadeSceneChanges,
    isPlanningDirective,
    isExecutingDirective,
    isExpanded,
    onToggleExpand,
    onToggleSkip,
    onRemove,
    onUpdateField,
    onUpdateDetail,
    onUpdateAppliedEdit,
    onUndoSurgicalEdit,
    onFixDirectiveReview
}: DirectiveActionCardProps) {
    const storyArg = story as unknown as NonNullable<
        Parameters<typeof resolveDirectiveTargetLabel>[1]
    >;
    const actArg = act as unknown as NonNullable<
        Parameters<typeof getDirectiveActionScopeMeta>[0]
    >;
    const meta = getDirectiveActionScopeMeta(actArg);
    const targetLabel = resolveDirectiveTargetLabel(actArg, storyArg);
    const previewDiffs = buildDirectiveActionPreview(actArg, storyArg);
    const isSkipped = act.skipped === true;
    const displayedEdits = [
        ...(act.result?.cascade?.appliedEdits || []).map((edit, editIdx) => ({
            edit,
            editIdx,
            editsAreCascade: true
        })),
        ...(act.result?.appliedEdits || []).map((edit, editIdx) => ({
            edit,
            editIdx,
            editsAreCascade: false
        }))
    ];
    const blockedByProtection = isActionBlockedByProtection(
        actArg,
        storyArg,
        protectWrittenProse
    );
    const resultColor =
        act.result?.status === 'applied'
            ? 'bg-sage-tint text-sage-800 border-sage-edge'
            : act.result?.status === 'failed'
              ? 'bg-blush-tint text-blush-800 border-blush-edge'
              : 'bg-mist-100 text-ink-700 border-edge-strong';

    const castNames = (story.cast || []).map((c) => c.name).filter(Boolean);
    const seqList = story.sequences || [];
    const activeSeqIdx =
        act.target_seq_idx !== null && act.target_seq_idx !== undefined ? act.target_seq_idx : 0;
    const activeSceneIdx =
        act.target_scene_idx !== null && act.target_scene_idx !== undefined
            ? act.target_scene_idx
            : 0;
    const activeSeqScenes = story.scenes?.[String(activeSeqIdx)] || [];
    const targetHasProse = Boolean(story.prose?.[`${activeSeqIdx}-${activeSceneIdx}`]?.final);
    const lineEditsList: DirectiveLineEditItem[] = Array.isArray(act.details.line_edits)
        ? act.details.line_edits
        : [];

    return (
        <div
            className={`p-5 sm:p-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start transition-colors ${isSkipped ? 'opacity-60 bg-inset/40' : 'hover:bg-inset/30'}`}
        >
            <div className="flex items-center gap-2.5 sm:block shrink-0 sm:mt-1">
                <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-mono font-bold ${isSkipped ? 'bg-inset border-edge text-ink-400' : 'bg-gold-tint border-gold-edge text-gold-ink'}`}
                >
                    {actIdx + 1}
                </div>
            </div>
            <div className="flex-1 min-w-0 w-full space-y-3">
                {/* Card Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-edge/70">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                            className={`text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${meta.colorClass}`}
                        >
                            {meta.scopeBadge}
                        </span>
                        <select
                            value={act.action_type}
                            onChange={(e) => onUpdateField(actIdx, 'action_type', e.target.value)}
                            aria-label={`Action type for action ${actIdx + 1}`}
                            className="bg-inset text-ink-900 border border-edge-strong text-xs font-bold px-2.5 py-1.5 rounded-lg outline-none focus:border-gold cursor-pointer font-mono max-w-full"
                            disabled={isExecutingDirective}
                        >
                            <optgroup label="Scale 0: Story, Arc, Cast & World">
                                <option value="MODIFY_STORY_METADATA">Modify Story Metadata</option>
                                <option value="ADD_CHARACTER">Add Character</option>
                                <option value="MODIFY_CHARACTER">Modify Character</option>
                                <option value="DELETE_CHARACTER">Delete Character</option>
                                <option value="MODIFY_RELATIONSHIP">Modify Relationship</option>
                                <option value="ADD_THREAD">Add Narrative Thread</option>
                                <option value="MODIFY_THREAD">Modify Narrative Thread</option>
                                <option value="DELETE_THREAD">Delete Narrative Thread</option>
                                <option value="MODIFY_CHARACTER_ARC">Modify Character Arc</option>
                                <option value="ADD_SECRET">Add Secret</option>
                                <option value="MODIFY_SECRET">Modify Secret</option>
                                <option value="ADD_LORE">Add Lore</option>
                                <option value="MODIFY_LORE">Modify Lore</option>
                                <option value="ADD_CONTINUITY_FACT">Add Continuity Fact</option>
                                <option value="ADD_PROPOSITION">Add Epistemic Proposition</option>
                                <option value="MODIFY_EPISTEMIC_BELIEF">
                                    Modify Epistemic Belief
                                </option>
                            </optgroup>
                            <optgroup label="Scale 1: Act Level">
                                <option value="MODIFY_ACT">Modify Act</option>
                            </optgroup>
                            <optgroup label="Scale 2: Sequence & Future Mandates">
                                <option value="PERSIST_FUTURE_MANDATE">
                                    Persist Future Mandate
                                </option>
                                <option value="MODIFY_SEQUENCE">Modify Sequence</option>
                                <option value="ADD_SEQUENCE">Add Sequence</option>
                                <option value="DELETE_SEQUENCE">Delete Sequence</option>
                            </optgroup>
                            <optgroup label="Scale 3: Scene Blueprints (Developed)">
                                <option value="MODIFY_SCENE">Modify Scene Blueprint</option>
                                <option value="ADD_SCENE">Add Scene Blueprint</option>
                                <option value="DELETE_SCENE">Delete Scene</option>
                                <option value="MOVE_SCENE">Move Scene</option>
                            </optgroup>
                            <optgroup label="Scale 4: Written Prose">
                                <option value="SURGICAL_PATCH_PROSE">Surgical Prose Patch</option>
                                <option value="LINE_EDIT_PROSE">Line Edit Prose</option>
                                <option value="REWRITE_PROSE">Write / Rewrite Prose</option>
                            </optgroup>
                        </select>
                        <span
                            className="text-xs font-mono text-ink-600 bg-inset border border-edge px-2.5 py-1 rounded-lg truncate max-w-[260px]"
                            title={targetLabel}
                        >
                            {targetLabel}
                        </span>
                        {isSkipped && (
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-mist-100 border border-edge-strong text-ink-500">
                                Skipped
                            </span>
                        )}
                        {act.result && (
                            <span
                                className={`text-xs font-bold px-2.5 py-0.5 rounded-lg border ${resultColor}`}
                            >
                                {act.result.status === 'applied'
                                    ? 'Applied'
                                    : act.result.status === 'failed'
                                      ? 'Failed'
                                      : 'Skipped'}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        <button
                            type="button"
                            onClick={() => onToggleSkip(actIdx)}
                            disabled={isExecutingDirective}
                            className="px-2.5 py-1 rounded-lg border border-edge-strong bg-surface hover:bg-wash text-ink-600 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title={
                                isSkipped
                                    ? 'Include this action during execution'
                                    : 'Skip this action during execution'
                            }
                        >
                            {isSkipped ? <Eye size={13} /> : <EyeOff size={13} />}
                            <span>{isSkipped ? 'Include' : 'Skip'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${isExpanded ? 'bg-gold-tint border-gold-edge text-gold-ink' : 'bg-surface border-edge-strong text-ink-700 hover:bg-wash'}`}
                        >
                            <SlidersHorizontal size={12} />
                            <span>{isExpanded ? 'Hide Fields' : 'Edit Fields'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onRemove(actIdx)}
                            disabled={isExecutingDirective}
                            aria-label={`Remove action ${actIdx + 1}`}
                            title="Remove action from plan"
                            className="p-1.5 rounded-lg border border-edge-strong bg-surface hover:bg-blush-tint hover:border-blush-edge hover:text-blush-700 text-ink-400 transition-colors cursor-pointer"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>

                {/* Readable Editorial Summary & Live Diff Preview */}
                <div className="space-y-2">
                    <p className="text-xs sm:text-sm font-medium text-ink-800 leading-snug">
                        {act.description || meta.label}
                    </p>
                    {previewDiffs.length > 0 && (
                        <div className="rounded-xl border border-edge bg-inset/80 p-3 space-y-1.5 text-xs">
                            {previewDiffs.map((diff, dIdx) => (
                                <div
                                    key={dIdx}
                                    className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-2 items-baseline"
                                >
                                    <span className="font-mono text-[11px] font-bold text-ink-500 uppercase truncate">
                                        {diff.label}
                                    </span>
                                    <div className="font-mono text-[11px] space-y-0.5 min-w-0 break-words">
                                        {diff.before && (
                                            <div
                                                className={
                                                    diff.mode === 'append'
                                                        ? 'text-ink-500'
                                                        : 'text-blush-700 line-through'
                                                }
                                            >
                                                {diff.mode === 'append'
                                                    ? `Existing: ${diff.before}`
                                                    : `- ${diff.before}`}
                                            </div>
                                        )}
                                        {diff.after && (
                                            <div className="text-sage-800 font-medium">
                                                {diff.after.startsWith('+')
                                                    ? diff.after
                                                    : `+ ${diff.after}`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Protection & Churn Warnings */}
                {blockedByProtection && !isSkipped && (
                    <div className="rounded-xl border border-ember-edge bg-ember-tint/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ember-900">
                        <span>
                            Protected region: target touches already-drafted prose and will be
                            skipped unless overridden.
                        </span>
                        <label className="flex items-center gap-2 font-bold cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={act.allow_protected === true}
                                onChange={(e) =>
                                    onUpdateField(actIdx, 'allow_protected', e.target.checked)
                                }
                                className="rounded border-ember-edge text-gold focus:ring-gold"
                                disabled={isExecutingDirective}
                            />
                            Override protection for this action
                        </label>
                    </div>
                )}
                {(act.action_type === 'SURGICAL_PATCH_PROSE' ||
                    (act.action_type === 'MODIFY_SCENE' &&
                        cascadeSceneChanges &&
                        targetHasProse)) &&
                    !isSkipped && (
                        <label className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-inset border border-edge text-xs text-ink-700 font-medium cursor-pointer">
                            <input
                                type="checkbox"
                                checked={act.allow_large_change === true}
                                onChange={(e) =>
                                    onUpdateField(actIdx, 'allow_large_change', e.target.checked)
                                }
                                className="rounded border-edge-strong text-gold focus:ring-gold"
                                disabled={isExecutingDirective}
                            />
                            Allow large rewrite (&gt;60% prose change)
                        </label>
                    )}

                {/* Post-Execution Results, Reviews & Prose Diffs */}
                {act.result?.cascade && (
                    <div className="space-y-1">
                        <span
                            className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg border ${act.result.cascade.status === 'applied' ? 'bg-sage-tint text-sage-800 border-sage-edge' : act.result.cascade.status === 'failed' ? 'bg-blush-tint text-blush-800 border-blush-edge' : 'bg-tangerine-tint text-tangerine-800 border-tangerine-edge'}`}
                        >
                            Prose cascade:{' '}
                            {act.result.cascade.status === 'applied'
                                ? 'Applied'
                                : act.result.cascade.status === 'failed'
                                  ? 'Failed'
                                  : 'Skipped'}
                        </span>
                        <p className="text-xs text-ink-600 whitespace-pre-wrap break-words">
                            {act.result.cascade.message}
                        </p>
                    </div>
                )}
                {act.result?.review && (
                    <div className="space-y-2 text-xs">
                        <span
                            className={`inline-block rounded-lg border px-2.5 py-1 font-bold ${act.result.review.status === 'PASS' ? 'bg-sage-tint text-sage-800 border-sage-edge' : 'bg-blush-tint text-blush-800 border-blush-edge'}`}
                        >
                            Review:{' '}
                            {act.result.review.status === 'PASS'
                                ? 'PASS'
                                : `${act.result.review.issues.length} issues`}
                        </span>
                        {act.result.review.issues.map((issue, issueIdx) => (
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
                        {act.result.review.issues.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onFixDirectiveReview(actIdx)}
                                disabled={
                                    isPlanningDirective ||
                                    isExecutingDirective ||
                                    act.result.reviewFixAttempted ||
                                    Boolean(act.result.review.error) ||
                                    !act.result.proseSceneId
                                }
                                className="px-3 py-1.5 rounded-lg border border-edge-strong bg-surface text-ink-700 font-semibold disabled:opacity-50 cursor-pointer"
                            >
                                {act.result.reviewFixAttempted
                                    ? 'Surgical fix attempted'
                                    : 'Fix with Surgical Editor'}
                            </button>
                        )}
                    </div>
                )}
                {displayedEdits.map(({ edit, editIdx, editsAreCascade }) => {
                    const proseKey = act.result?.proseSceneId || '';
                    const currentProse = (proseKey && story.prose?.[proseKey]?.final) || '';
                    const canUndo = !edit.undone && Boolean(locateNeedle(currentProse, edit.after));
                    const isLong = edit.before.length > 240 || edit.after.length > 240;
                    const preview = (text: string) =>
                        !edit.showFull && text.length > 240 ? text.slice(0, 237) + '...' : text;
                    return (
                        <div
                            key={`${editsAreCascade ? 'cascade' : 'prose'}-${editIdx}`}
                            className="rounded-lg border border-edge-strong bg-inset p-3 space-y-2 text-xs"
                        >
                            <div className="font-mono whitespace-pre-wrap break-words">
                                <del className="block text-blush-800">
                                    {preview(edit.before) || '(empty)'}
                                </del>
                                <span className="block text-sage-800">
                                    {preview(edit.after) || '(empty)'}
                                </span>
                            </div>
                            <div className="flex gap-3 items-center">
                                {isLong && (
                                    <button
                                        type="button"
                                        className="text-ink-600 underline cursor-pointer"
                                        onClick={() =>
                                            onUpdateAppliedEdit(
                                                actIdx,
                                                editIdx,
                                                { showFull: !edit.showFull },
                                                editsAreCascade
                                            )
                                        }
                                    >
                                        {edit.showFull ? 'show less' : 'show full'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-lg border border-edge-strong bg-surface text-ink-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    onClick={() =>
                                        onUndoSurgicalEdit(actIdx, editIdx, editsAreCascade)
                                    }
                                    disabled={isExecutingDirective || !canUndo}
                                    title={
                                        !edit.undone && !canUndo
                                            ? 'text has since changed'
                                            : undefined
                                    }
                                >
                                    {edit.undone ? 'Undone' : 'Undo this edit'}
                                </button>
                            </div>
                        </div>
                    );
                })}
                {act.result?.status === 'failed' && (
                    <p className="text-xs text-blush-800 whitespace-pre-wrap break-words">
                        {act.result.message}
                    </p>
                )}

                {/* Expandable Exact-Field Editor */}
                {isExpanded && (
                    <div className="pt-2 space-y-4 border-t border-edge/60 animate-fade-in">
                        <div
                            className={`grid grid-cols-1 ${meta.targetMode !== 'none' ? 'md:grid-cols-2' : ''} gap-4`}
                        >
                            <div className="space-y-1">
                                <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                    Action Summary
                                </label>
                                <input
                                    type="text"
                                    value={act.description || ''}
                                    onChange={(e) =>
                                        onUpdateField(actIdx, 'description', e.target.value)
                                    }
                                    className="bg-inset text-ink-900 border border-edge-strong rounded-xl px-3 py-2 outline-none focus:border-gold text-xs w-full font-medium"
                                    disabled={isExecutingDirective}
                                />
                            </div>
                            {meta.targetMode !== 'none' && (
                                <div
                                    className={`grid grid-cols-1 ${meta.targetMode === 'scene' ? 'sm:grid-cols-3' : meta.targetMode === 'sequence' ? 'sm:grid-cols-2' : ''} gap-2`}
                                >
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Target Act
                                        </label>
                                        <select
                                            value={String(act.target_act_idx ?? 0)}
                                            onChange={(e) =>
                                                onUpdateField(
                                                    actIdx,
                                                    'target_act_idx',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-inset text-ink-800 border border-edge-strong rounded-xl px-2.5 py-2 outline-none focus:border-gold text-xs w-full font-mono cursor-pointer"
                                            disabled={isExecutingDirective}
                                        >
                                            {story.acts && story.acts.length > 0 ? (
                                                story.acts.map((a, aIdx) => (
                                                    <option key={aIdx} value={aIdx}>
                                                        Act {a.number}:{' '}
                                                        {(a.title || '').slice(0, 16)}
                                                    </option>
                                                ))
                                            ) : (
                                                <option value={0}>Act 1 (Pending)</option>
                                            )}
                                        </select>
                                    </div>
                                    {(meta.targetMode === 'sequence' ||
                                        meta.targetMode === 'scene') && (
                                        <div className="space-y-1">
                                            <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                                Sequence
                                            </label>
                                            <select
                                                value={activeSeqIdx}
                                                onChange={(e) =>
                                                    onUpdateField(
                                                        actIdx,
                                                        'target_seq_idx',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-inset text-ink-800 border border-edge-strong rounded-xl px-2.5 py-2 outline-none focus:border-gold text-xs w-full font-mono cursor-pointer"
                                                disabled={isExecutingDirective}
                                            >
                                                {(() => {
                                                    const seqOptions = seqList
                                                        .map((seq, sIdx) =>
                                                            parseActNumber(
                                                                seq.parent_act,
                                                                actForSequence(sIdx + 1)
                                                            ) ===
                                                            parseInt(
                                                                String(act.target_act_idx ?? 0),
                                                                10
                                                            ) +
                                                                1 ? (
                                                                <option key={sIdx} value={sIdx}>
                                                                    Seq {seq.number}:{' '}
                                                                    {(seq.title || '').substring(
                                                                        0,
                                                                        20
                                                                    )}
                                                                </option>
                                                            ) : null
                                                        )
                                                        .filter(Boolean);
                                                    return seqOptions.length > 0 ? (
                                                        seqOptions
                                                    ) : (
                                                        <option value={0}>Seq 1 (Pending)</option>
                                                    );
                                                })()}
                                            </select>
                                        </div>
                                    )}
                                    {meta.targetMode === 'scene' && (
                                        <div className="space-y-1">
                                            <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                                Scene
                                            </label>
                                            <select
                                                value={activeSceneIdx}
                                                onChange={(e) =>
                                                    onUpdateField(
                                                        actIdx,
                                                        'target_scene_idx',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-inset text-ink-800 border border-edge-strong rounded-xl px-2.5 py-2 outline-none focus:border-gold text-xs w-full font-mono cursor-pointer"
                                                disabled={isExecutingDirective}
                                            >
                                                {activeSeqScenes.length > 0 ? (
                                                    activeSeqScenes.map((s, sIdx) => (
                                                        <option key={sIdx} value={sIdx}>
                                                            Scene{' '}
                                                            {s.number ||
                                                                `${Number(activeSeqIdx) + 1}.${sIdx + 1}`}
                                                            : {(s.title || '').slice(0, 16)}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value={0}>Scene 1 (Pending)</option>
                                                )}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Action Modification Details Box */}
                        <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                            {act.action_type === 'PERSIST_FUTURE_MANDATE' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="space-y-1 block text-xs text-iris-800 font-bold uppercase font-mono">
                                        Container Scope
                                        <select
                                            value={String(act.details.target_scope || 'auto')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'target_scope',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                            disabled={isExecutingDirective}
                                        >
                                            <option value="auto">
                                                Auto (Closest generated container)
                                            </option>
                                            <option value="sequence">Sequence Description</option>
                                            <option value="act">Act Mandate</option>
                                            <option value="story_author_note">
                                                Story Author&apos;s Note (Global)
                                            </option>
                                        </select>
                                    </label>
                                    <label className="space-y-1 block text-xs text-iris-800 font-bold uppercase font-mono">
                                        Mandate Label (Optional)
                                        <input
                                            type="text"
                                            value={String(act.details.mandate_label || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'mandate_label',
                                                    e.target.value
                                                )
                                            }
                                            placeholder="e.g. Pacing, Investigation, Bonding"
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                    <label className="space-y-1 block md:col-span-2 text-xs text-iris-800 font-bold uppercase font-mono">
                                        Persisted Future Mandate
                                        <textarea
                                            value={String(act.details.mandate_text ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'mandate_text',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-24 resize-none font-normal normal-case leading-relaxed"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                </div>
                            )}

                            {act.action_type === 'MODIFY_RELATIONSHIP' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="space-y-1 block text-xs text-teal-800 font-bold uppercase font-mono">
                                        From Character
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.from_name ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'from_name',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                            {renderEntityPicker(
                                                castNames.map((n) => ({ value: n, label: n })),
                                                (val) => onUpdateDetail(actIdx, 'from_name', val),
                                                'Pick character',
                                                isExecutingDirective
                                            )}
                                        </div>
                                    </label>
                                    <label className="space-y-1 block text-xs text-teal-800 font-bold uppercase font-mono">
                                        To Character
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.to_name ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, 'to_name', e.target.value)
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                            {renderEntityPicker(
                                                castNames.map((n) => ({ value: n, label: n })),
                                                (val) => onUpdateDetail(actIdx, 'to_name', val),
                                                'Pick character',
                                                isExecutingDirective
                                            )}
                                        </div>
                                    </label>
                                    {(
                                        [
                                            ['relationship_key', 'Relationship key (optional A->B)'],
                                            ['current', 'Current relationship'],
                                            ['hidden_tension', 'Hidden tension'],
                                            ['trust_level', 'Trust level (1-10)']
                                        ] as const
                                    ).map(([field, label]) => (
                                        <label
                                            key={field}
                                            className="space-y-1 block text-xs text-teal-800 font-bold uppercase font-mono"
                                        >
                                            {label}
                                            <input
                                                type={field === 'trust_level' ? 'number' : 'text'}
                                                min={field === 'trust_level' ? 1 : undefined}
                                                max={field === 'trust_level' ? 10 : undefined}
                                                value={String(act.details[field] ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, field, e.target.value)
                                                }
                                                className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}

                            {['ADD_THREAD', 'MODIFY_THREAD', 'DELETE_THREAD'].includes(
                                act.action_type
                            ) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                        Thread ID
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.thread_id || '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'thread_id',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                            {renderEntityPicker(
                                                (story.threads || []).map((t) => ({
                                                    value: t.id,
                                                    label: `${t.id}: ${t.name}`
                                                })),
                                                (val) => {
                                                    const found = (story.threads || []).find(
                                                        (t) => t.id === val
                                                    );
                                                    onUpdateDetail(actIdx, 'thread_id', val);
                                                    if (found && !act.details.name) {
                                                        onUpdateDetail(actIdx, 'name', found.name);
                                                    }
                                                },
                                                'Pick existing thread',
                                                isExecutingDirective
                                            )}
                                        </div>
                                    </label>
                                    <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                        Thread Name
                                        <input
                                            type="text"
                                            value={String(act.details.name || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'name', e.target.value)
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                    {act.action_type !== 'DELETE_THREAD' && (
                                        <label className="space-y-1 block md:col-span-2 text-xs text-azure-800 font-bold uppercase font-mono">
                                            Thread Trajectory / Description
                                            <textarea
                                                value={String(act.details.description ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'description',
                                                        e.target.value
                                                    )
                                                }
                                                className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-20 resize-none font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                        </label>
                                    )}
                                </div>
                            )}

                            {act.action_type === 'MODIFY_CHARACTER_ARC' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="space-y-1 block text-xs text-teal-800 font-bold uppercase font-mono">
                                        Character
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.char_id ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, 'char_id', e.target.value)
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                            {renderEntityPicker(
                                                castNames.map((n) => ({ value: n, label: n })),
                                                (val) => onUpdateDetail(actIdx, 'char_id', val),
                                                'Pick cast member',
                                                isExecutingDirective
                                            )}
                                        </div>
                                    </label>
                                    {(
                                        [
                                            ['corner_role', 'Four-Corner Role'],
                                            ['lie_believed', 'Safety Habit / Lie Believed'],
                                            ['truth_needed', 'Realization / Truth Needed'],
                                            ['arc_catalyst', 'Arc Catalyst']
                                        ] as const
                                    ).map(([field, label]) => (
                                        <label
                                            key={field}
                                            className="space-y-1 block text-xs text-teal-800 font-bold uppercase font-mono"
                                        >
                                            {label}
                                            <input
                                                type="text"
                                                value={String(act.details[field] ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, field, e.target.value)
                                                }
                                                className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                        </label>
                                    ))}
                                    <label className="space-y-1 block md:col-span-2 text-xs text-teal-800 font-bold uppercase font-mono">
                                        Arc Trajectory Description
                                        <textarea
                                            value={String(act.details.description ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'description',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                </div>
                            )}

                            {['ADD_SECRET', 'MODIFY_SECRET'].includes(act.action_type) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {act.action_type === 'MODIFY_SECRET' &&
                                        (story.secret_vault || []).length > 0 && (
                                            <label className="space-y-1 block md:col-span-2 text-xs text-purple-800 font-bold uppercase font-mono">
                                                Target Secret from Vault
                                                <select
                                                    value={String(act.details.secret_id || '')}
                                                    onChange={(e) => {
                                                        const sec = (story.secret_vault || []).find(
                                                            (s) => s.id === e.target.value
                                                        );
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'secret_id',
                                                            e.target.value
                                                        );
                                                        if (sec && !act.details.title) {
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'title',
                                                                sec.title
                                                            );
                                                        }
                                                    }}
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                    disabled={isExecutingDirective}
                                                >
                                                    <option value="">
                                                        -- Match by Secret Title below --
                                                    </option>
                                                    {(story.secret_vault || []).map((sec) => (
                                                        <option key={sec.id} value={sec.id}>
                                                            {sec.title} ({sec.id})
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                    <label className="space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono">
                                        Secret Title
                                        <input
                                            type="text"
                                            value={String(act.details.title ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'title', e.target.value)
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                    <label className="space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono">
                                        Category
                                        <select
                                            value={String(act.details.category || 'plot_mystery')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'category', e.target.value)
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                            disabled={isExecutingDirective}
                                        >
                                            <option value="plot_mystery">Plot Mystery</option>
                                            <option value="dramatic_irony">Dramatic Irony</option>
                                            <option value="character_concealment">
                                                Character Concealment
                                            </option>
                                            <option value="red_herring">Red Herring</option>
                                        </select>
                                    </label>
                                    {(
                                        [
                                            ['known_by', 'Known By (Comma separated)'],
                                            ['concealed_from', 'Concealed From (Comma separated)'],
                                            ['reveal_target_act', 'Reveal Target Act'],
                                            ['reveal_target_sequence', 'Reveal Target Sequence']
                                        ] as const
                                    ).map(([field, label]) => (
                                        <label
                                            key={field}
                                            className="space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono"
                                        >
                                            {label}
                                            <input
                                                type="text"
                                                value={String(act.details[field] ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, field, e.target.value)
                                                }
                                                className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                        </label>
                                    ))}
                                    <label className="space-y-1 block md:col-span-2 text-xs text-purple-800 font-bold uppercase font-mono">
                                        Hidden Truth
                                        <textarea
                                            value={String(act.details.truth ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'truth', e.target.value)
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-14 resize-none font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                    <label className="space-y-1 block md:col-span-2 text-xs text-purple-800 font-bold uppercase font-mono">
                                        Public Cover Story
                                        <textarea
                                            value={String(act.details.public_cover_story ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'public_cover_story',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-14 resize-none font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                </div>
                            )}

                            {['ADD_PROPOSITION', 'MODIFY_EPISTEMIC_BELIEF'].includes(
                                act.action_type
                            ) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {act.action_type === 'ADD_PROPOSITION' ? (
                                        <>
                                            <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                                Proposition ID
                                                <input
                                                    type="text"
                                                    value={String(act.details.id ?? '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'id',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                                    disabled={isExecutingDirective}
                                                />
                                            </label>
                                            <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                                Objective Truth
                                                <select
                                                    value={String(
                                                        act.details.objective_truth || 'TRUE'
                                                    )}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'objective_truth',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                                    disabled={isExecutingDirective}
                                                >
                                                    <option value="TRUE">TRUE</option>
                                                    <option value="FALSE">FALSE</option>
                                                    <option value="UNRESOLVED">UNRESOLVED</option>
                                                </select>
                                            </label>
                                            {(
                                                [
                                                    ['subject_id', 'Subject Entity'],
                                                    ['predicate', 'Predicate'],
                                                    ['object_id', 'Object Entity'],
                                                    [
                                                        'world_valid_from',
                                                        'Valid From Scene (e.g. 0.0)'
                                                    ]
                                                ] as const
                                            ).map(([field, label]) => (
                                                <label
                                                    key={field}
                                                    className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono"
                                                >
                                                    {label}
                                                    <input
                                                        type="text"
                                                        value={String(act.details[field] ?? '')}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                field,
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </label>
                                            ))}
                                            <label className="space-y-1 block md:col-span-2 text-xs text-azure-800 font-bold uppercase font-mono">
                                                Claim Text
                                                <textarea
                                                    value={String(act.details.claim_text ?? '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'claim_text',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-14 resize-none font-normal normal-case"
                                                    disabled={isExecutingDirective}
                                                />
                                            </label>
                                        </>
                                    ) : (
                                        <>
                                            <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                                Proposition ID / Claim
                                                <input
                                                    type="text"
                                                    value={String(act.details.proposition_id ?? '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'proposition_id',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                    disabled={isExecutingDirective}
                                                />
                                            </label>
                                            <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                                Holder Character
                                                <div className="flex gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={String(act.details.holder_id ?? '')}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'holder_id',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                        disabled={isExecutingDirective}
                                                    />
                                                    {renderEntityPicker(
                                                        castNames.map((n) => ({
                                                            value: n,
                                                            label: n
                                                        })),
                                                        (val) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'holder_id',
                                                                val
                                                            ),
                                                        'Pick character',
                                                        isExecutingDirective
                                                    )}
                                                </div>
                                            </label>
                                            <label className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono">
                                                Stance
                                                <select
                                                    value={String(
                                                        act.details.stance || 'BELIEVES_TRUE'
                                                    )}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'stance',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                                    disabled={isExecutingDirective}
                                                >
                                                    <option value="BELIEVES_TRUE">
                                                        BELIEVES_TRUE
                                                    </option>
                                                    <option value="SUSPECTS_TRUE">
                                                        SUSPECTS_TRUE
                                                    </option>
                                                    <option value="DOUBTS">DOUBTS</option>
                                                    <option value="BELIEVES_FALSE">
                                                        BELIEVES_FALSE
                                                    </option>
                                                    <option value="UNAWARE">UNAWARE</option>
                                                </select>
                                            </label>
                                            {(
                                                [
                                                    ['confidence', 'Confidence (0.0 - 1.0)'],
                                                    ['target_scene', 'Target Scene (e.g. 1.2)'],
                                                    ['told_by', 'Told By (Optional)']
                                                ] as const
                                            ).map(([field, label]) => (
                                                <label
                                                    key={field}
                                                    className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono"
                                                >
                                                    {label}
                                                    <input
                                                        type="text"
                                                        value={String(act.details[field] ?? '')}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                field,
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </label>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}

                            {['ADD_LORE', 'MODIFY_LORE'].includes(act.action_type) && (
                                <div className="grid grid-cols-1 gap-3">
                                    <label className="space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono">
                                        Topic
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.topic || '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, 'topic', e.target.value)
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                            {act.action_type === 'MODIFY_LORE' &&
                                                renderEntityPicker(
                                                    (story.lore || []).map((l) => ({
                                                        value: l.topic,
                                                        label: l.topic
                                                    })),
                                                    (val) => onUpdateDetail(actIdx, 'topic', val),
                                                    'Pick lore topic',
                                                    isExecutingDirective
                                                )}
                                        </div>
                                    </label>
                                    <label className="space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono">
                                        Detail
                                        <textarea
                                            value={String(act.details.detail ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'detail', e.target.value)
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-24 resize-none font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        />
                                    </label>
                                </div>
                            )}

                            {act.action_type === 'ADD_CONTINUITY_FACT' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(
                                        [
                                            ['key', 'Fact key'],
                                            ['value', 'Fact value'],
                                            ['category', 'Category (default Directive)'],
                                            ['entity_name', 'Character name (optional)']
                                        ] as const
                                    ).map(([field, label]) => (
                                        <label
                                            key={field}
                                            className="space-y-1 block text-xs text-azure-800 font-bold uppercase font-mono"
                                        >
                                            {label}
                                            <input
                                                type="text"
                                                value={String(act.details[field] ?? '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(actIdx, field, e.target.value)
                                                }
                                                className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                                disabled={isExecutingDirective}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}

                            {act.action_type === 'MODIFY_STORY_METADATA' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(
                                        [
                                            ['title', 'Title', 'input'],
                                            ['genre', 'Genre', 'input'],
                                            ['mood', 'Mood', 'input'],
                                            ['themes', 'Themes', 'input'],
                                            ['author_note', "Author's Note (Global Steering)", 'textarea'],
                                            ['concept', 'Concept', 'textarea'],
                                            ['heart_of_the_dilemma', 'Central Human Dilemma', 'textarea'],
                                            ['status_quo', 'Status Quo', 'textarea'],
                                            ['inciting_incident', 'Inciting Incident', 'textarea'],
                                            ['core_thematic_argument', 'Core Thematic Argument', 'textarea'],
                                            ['synthesized_authorial_persona', 'Authorial Persona', 'textarea']
                                        ] as const
                                    )
                                        .filter(
                                            ([field]) =>
                                                act.details[field] !== undefined ||
                                                ['title', 'author_note', 'concept'].includes(field)
                                        )
                                        .map(([field, label, kind]) => (
                                            <label
                                                key={field}
                                                className={`space-y-1 block text-xs text-purple-800 font-bold uppercase font-mono ${kind === 'textarea' ? 'md:col-span-2' : ''}`}
                                            >
                                                {label}
                                                {kind === 'textarea' ? (
                                                    <textarea
                                                        value={String(act.details[field] ?? '')}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                field,
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-normal normal-case"
                                                        disabled={isExecutingDirective}
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={String(act.details[field] ?? '')}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                field,
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono normal-case"
                                                        disabled={isExecutingDirective}
                                                    />
                                                )}
                                            </label>
                                        ))}
                                </div>
                            )}

                            {['ADD_CHARACTER', 'MODIFY_CHARACTER', 'DELETE_CHARACTER'].includes(
                                act.action_type
                            ) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                            Target Character
                                        </label>
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={act.target_character_id || ''}
                                                onChange={(e) =>
                                                    onUpdateField(
                                                        actIdx,
                                                        'target_character_id',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                disabled={
                                                    isExecutingDirective ||
                                                    act.action_type === 'ADD_CHARACTER'
                                                }
                                            />
                                            {act.action_type !== 'ADD_CHARACTER' &&
                                                renderEntityPicker(
                                                    (story.cast || []).map((c) => ({
                                                        value: c.id || c.name,
                                                        label: `${c.name} (${c.id})`
                                                    })),
                                                    (val) => {
                                                        const found = (story.cast || []).find(
                                                            (c) => (c.id || c.name) === val
                                                        );
                                                        onUpdateField(
                                                            actIdx,
                                                            'target_character_id',
                                                            val
                                                        );
                                                        if (found && !act.details.name) {
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'name',
                                                                found.name
                                                            );
                                                        }
                                                    },
                                                    'Pick character',
                                                    isExecutingDirective
                                                )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                            Character Name
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.name || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'name', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    {act.action_type !== 'DELETE_CHARACTER' && (
                                        <>
                                            <div className="space-y-1">
                                                <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                                    Role
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(act.details.role || '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'role',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                                    Core Flaw / Safety Habit
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(act.details.core_flaw || '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'core_flaw',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                                    Core Desire / Yearning
                                                </label>
                                                <textarea
                                                    value={String(act.details.core_desire || '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'core_desire',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-xs text-teal-800 font-bold uppercase font-mono">
                                                    Vocal Cadence
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(act.details.vocal_cadence || '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'vocal_cadence',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {act.action_type === 'MODIFY_ACT' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs text-azure-800 font-bold uppercase font-mono">
                                            Act Title
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.title || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'title', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-medium"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-azure-800 font-bold uppercase font-mono">
                                            Act Mandate / Arc
                                        </label>
                                        <textarea
                                            value={String(act.details.act_mandate || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'act_mandate',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-serif leading-relaxed"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    {act.details.world_building_developments !== undefined && (
                                        <div className="space-y-1 md:col-span-2">
                                            <label className="text-xs text-azure-800 font-bold uppercase font-mono">
                                                World-Building Developments
                                            </label>
                                            <textarea
                                                value={String(
                                                    act.details.world_building_developments || ''
                                                )}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'world_building_developments',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-14 resize-none"
                                                disabled={isExecutingDirective}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {['MODIFY_SEQUENCE', 'ADD_SEQUENCE'].includes(act.action_type) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                            Sequence Title
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.title || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'title', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-medium"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                            Sequence Function
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.sequence_function || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'sequence_function',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                            Dramatic Question
                                        </label>
                                        <textarea
                                            value={String(act.details.dramatic_question || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'dramatic_question',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-14 resize-none"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                            Sequence Description &amp; Mandates
                                        </label>
                                        <textarea
                                            value={String(act.details.description || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'description',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-20 resize-none leading-relaxed"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                            Sequence Objective
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.sequence_objective || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'sequence_objective',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    {(act.details.starting_state !== undefined ||
                                        act.details.four_corner_movement !== undefined ||
                                        act.details.sequence_climax !== undefined ||
                                        act.details.ending_hook !== undefined ||
                                        act.details.next_sequence_boundary_guard !== undefined) && (
                                        <>
                                            {act.details.starting_state !== undefined && (
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                                        Starting State / Entry Anchor
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={String(
                                                            act.details.starting_state || ''
                                                        )}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'starting_state',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </div>
                                            )}
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                                    Four-Corner Movement
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(
                                                        act.details.four_corner_movement || ''
                                                    )}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'four_corner_movement',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                                    Sequence Climax
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(
                                                        act.details.sequence_climax || ''
                                                    )}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'sequence_climax',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                                    Ending Hook
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(act.details.ending_hook || '')}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'ending_hook',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                            {act.details.next_sequence_boundary_guard !==
                                                undefined && (
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="text-xs text-iris-800 font-bold uppercase font-mono">
                                                        Next-Sequence Boundary Guard
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={String(
                                                            act.details
                                                                .next_sequence_boundary_guard || ''
                                                        )}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'next_sequence_boundary_guard',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {act.action_type === 'ADD_SEQUENCE' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="space-y-1 block text-xs text-iris-800 font-bold uppercase font-mono">
                                        Insert Placement
                                        <select
                                            value={String(act.details.insert_at_idx ?? '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'insert_at_idx',
                                                    e.target.value
                                                )
                                            }
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                            disabled={isExecutingDirective}
                                        >
                                            <option value="">
                                                End of Act {Number(act.target_act_idx ?? 0) + 1}
                                            </option>
                                            <option value="0">
                                                Beginning of Novel (Before Seq 1)
                                            </option>
                                            {seqList.map((sq, idx) => (
                                                <option key={idx} value={String(idx + 1)}>
                                                    After Seq {sq.number || idx + 1}:{' '}
                                                    {sq.title || 'Untitled'}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="space-y-1 block text-xs text-iris-800 font-bold uppercase font-mono">
                                        Parent Act (From Target Act)
                                        <input
                                            type="number"
                                            readOnly
                                            value={Number(act.target_act_idx ?? 0) + 1}
                                            className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 text-xs w-full font-normal"
                                        />
                                    </label>
                                </div>
                            )}

                            {act.action_type === 'DELETE_SEQUENCE' && (
                                <p className="text-xs text-blush-800">
                                    Delete the selected sequence and all its scenes and prose. Later
                                    sequences will be renumbered.
                                </p>
                            )}

                            {act.action_type === 'MOVE_SCENE' && (
                                <label className="space-y-1 block text-xs text-gold-ink font-bold uppercase font-mono">
                                    Destination Position (Within Sequence {Number(activeSeqIdx) + 1})
                                    <select
                                        value={String(act.details.to_idx ?? '')}
                                        onChange={(e) =>
                                            onUpdateDetail(actIdx, 'to_idx', e.target.value)
                                        }
                                        className="block bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-normal normal-case"
                                        disabled={isExecutingDirective}
                                    >
                                        {activeSeqScenes.length > 0 ? (
                                            activeSeqScenes.map((sc, idx) => (
                                                <option key={idx} value={String(idx)}>
                                                    Position {idx + 1}
                                                    {idx === 0
                                                        ? ' (First in Sequence)'
                                                        : idx === activeSeqScenes.length - 1
                                                          ? ' (Last in Sequence)'
                                                          : ` (Currently: ${sc.title || 'Scene'})`}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="0">Position 1</option>
                                        )}
                                    </select>
                                </label>
                            )}

                            {(act.action_type === 'MODIFY_SCENE' ||
                                act.action_type === 'ADD_SCENE') && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Scene Title
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.title || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'title', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    {act.action_type === 'ADD_SCENE' ? (
                                        <div className="space-y-1">
                                            <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                                Insert Placement
                                            </label>
                                            <select
                                                value={
                                                    act.details.insert_at_idx !== undefined &&
                                                    act.details.insert_at_idx !== null
                                                        ? String(act.details.insert_at_idx)
                                                        : ''
                                                }
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'insert_at_idx',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                disabled={isExecutingDirective}
                                            >
                                                <option value="">
                                                    End of Sequence (Position{' '}
                                                    {activeSeqScenes.length + 1})
                                                </option>
                                                <option value="0">
                                                    Beginning (Before Scene 1)
                                                </option>
                                                {activeSeqScenes.map((sc, idx) => (
                                                    <option key={idx} value={String(idx + 1)}>
                                                        After Scene {idx + 1} (
                                                        {sc.title || 'Untitled'})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                                Scene Type
                                            </label>
                                            <select
                                                value={String(
                                                    act.details.scene_type || 'PROACTIVE'
                                                )}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'scene_type',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-800 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                disabled={isExecutingDirective}
                                            >
                                                <option value="PROACTIVE">
                                                    PROACTIVE (Action/Goal)
                                                </option>
                                                <option value="REACTIVE">
                                                    REACTIVE (Reaction/Decision)
                                                </option>
                                            </select>
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            POV Character
                                        </label>
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={String(act.details.pov_character || '')}
                                                onChange={(e) =>
                                                    onUpdateDetail(
                                                        actIdx,
                                                        'pov_character',
                                                        e.target.value
                                                    )
                                                }
                                                className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                disabled={isExecutingDirective}
                                            />
                                            {renderEntityPicker(
                                                castNames.map((n) => ({ value: n, label: n })),
                                                (val) =>
                                                    onUpdateDetail(actIdx, 'pov_character', val),
                                                'Pick POV',
                                                isExecutingDirective
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Setting
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.setting || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'setting', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Narrative Mode
                                        </label>
                                        {(() => {
                                            const rawVal = String(
                                                act.details.dominant_narrative_mode ||
                                                    act.details.mode_override ||
                                                    ''
                                            );
                                            const selectVal = rawVal
                                                ? resolveNarrativeModeId(rawVal, allNarrativeModes)
                                                : '';
                                            const { grouped, uncategorized, hasCategories } =
                                                groupNarrativeModesForSelect(allNarrativeModes);
                                            return (
                                                <select
                                                    value={selectVal}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'dominant_narrative_mode',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-800 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                    disabled={isExecutingDirective}
                                                >
                                                    <option value="">
                                                        Keep Existing / Neutral Baseline
                                                    </option>
                                                    {selectVal &&
                                                        !Object.prototype.hasOwnProperty.call(
                                                            allNarrativeModes,
                                                            selectVal
                                                        ) && <option value={selectVal}>{selectVal}</option>}
                                                    {hasCategories ? (
                                                        <>
                                                            {grouped.map((grp) => (
                                                                <optgroup
                                                                    key={grp.category}
                                                                    label={grp.category}
                                                                >
                                                                    {grp.keys.map((modeKey) => (
                                                                        <option
                                                                            key={modeKey}
                                                                            value={modeKey}
                                                                        >
                                                                            {modeKey}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                            {uncategorized.length > 0 && (
                                                                <optgroup label="Custom Modes">
                                                                    {uncategorized.map((modeKey) => (
                                                                        <option
                                                                            key={modeKey}
                                                                            value={modeKey}
                                                                        >
                                                                            {modeKey}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                        </>
                                                    ) : (
                                                        Object.keys(allNarrativeModes).map((modeKey) => (
                                                            <option key={modeKey} value={modeKey}>
                                                                {modeKey}
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                            );
                                        })()}
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Objective / Goal
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.objective || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'objective', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Cast Present (Comma separated)
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.cast_names || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'cast_names', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-3">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Scene Events (Narrative Progression)
                                        </label>
                                        <textarea
                                            value={String(act.details.scene_events || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'scene_events',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-20 resize-none leading-relaxed"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1 md:col-span-3">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Atmospheric Overview
                                        </label>
                                        <textarea
                                            value={String(act.details.atmospheric_overview || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'atmospheric_overview',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none leading-relaxed"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    {(
                                        [
                                            ['surface_activity', 'Surface Activity'],
                                            ['the_hinge_moment', 'The Hinge Moment'],
                                            ['value_shift', 'Value Shift (Start -> End)'],
                                            ['exit_hook', 'Exit Hook'],
                                            ['modality_hand', 'Modality Hand (Comma separated)'],
                                            ['main_character_heart', 'Main Character Heart'],
                                            ['other_character_heart', 'Counterpart Heart'],
                                            [
                                                'plot_commitments',
                                                'Plot Commitments (Semicolon separated)'
                                            ]
                                        ] as const
                                    ).map(([field, label]) => {
                                        const rawVal = act.details[field];
                                        const displayVal =
                                            typeof rawVal === 'object' && rawVal !== null
                                                ? JSON.stringify(rawVal)
                                                : String(rawVal || '');
                                        return (
                                            <div key={field} className="space-y-1">
                                                <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                                    {label}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={displayVal}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            field,
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                                    disabled={isExecutingDirective}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {act.action_type === 'SURGICAL_PATCH_PROSE' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-plum-800 font-bold uppercase font-mono">
                                            Surgical Edit Instructions
                                        </label>
                                        <textarea
                                            value={String(act.details.instructions || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'instructions',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none"
                                            placeholder="Describe what paragraph to modify, detail to insert, or dialogue to alter..."
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Find Text Anchor (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.find_text || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'find_text', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Replacement Text (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={String(act.details.replace_text || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'replace_text',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                </div>
                            )}

                            {act.action_type === 'LINE_EDIT_PROSE' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs text-orchid-800 font-bold uppercase font-mono">
                                            Find Text / Dialogue
                                        </label>
                                        <textarea
                                            value={String(act.details.find_text || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(actIdx, 'find_text', e.target.value)
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-mono"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-orchid-800 font-bold uppercase font-mono">
                                            Replacement Text / Dialogue
                                        </label>
                                        <textarea
                                            value={String(act.details.replace_text || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'replace_text',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-mono"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-3 md:col-span-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-xs text-orchid-800 font-bold uppercase font-mono">
                                                Additional Line Edits
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onUpdateDetail(actIdx, 'line_edits', [
                                                        ...lineEditsList,
                                                        { find: '', replace: '' }
                                                    ])
                                                }
                                                className="px-2.5 py-1 rounded-lg border border-edge-strong bg-surface text-ink-700 text-xs hover:bg-lift transition-colors"
                                                disabled={isExecutingDirective}
                                            >
                                                Add replacement
                                            </button>
                                        </div>
                                        {lineEditsList.map((edit, editIdx) => (
                                            <div
                                                key={editIdx}
                                                className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-edge-strong pt-3"
                                            >
                                                <div className="space-y-1">
                                                    <label className="text-xs text-orchid-800 font-bold uppercase font-mono">
                                                        Find Text {editIdx + 1}
                                                    </label>
                                                    <textarea
                                                        aria-label={`Find text for replacement ${editIdx + 1}`}
                                                        value={edit.find || ''}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'line_edits',
                                                                lineEditsList.map((row, rowIdx) =>
                                                                    rowIdx === editIdx
                                                                        ? {
                                                                              ...row,
                                                                              find: e.target.value
                                                                          }
                                                                        : row
                                                                )
                                                            )
                                                        }
                                                        className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-mono"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-orchid-800 font-bold uppercase font-mono">
                                                        Replacement Text {editIdx + 1}
                                                    </label>
                                                    <textarea
                                                        aria-label={`Replacement text ${editIdx + 1}`}
                                                        value={edit.replace || ''}
                                                        onChange={(e) =>
                                                            onUpdateDetail(
                                                                actIdx,
                                                                'line_edits',
                                                                lineEditsList.map((row, rowIdx) =>
                                                                    rowIdx === editIdx
                                                                        ? {
                                                                              ...row,
                                                                              replace:
                                                                                  e.target.value
                                                                          }
                                                                        : row
                                                                )
                                                            )
                                                        }
                                                        className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none font-mono"
                                                        disabled={isExecutingDirective}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'line_edits',
                                                            lineEditsList.filter(
                                                                (_, rowIdx) => rowIdx !== editIdx
                                                            )
                                                        )
                                                    }
                                                    className="justify-self-start px-2.5 py-1 rounded-lg border border-edge-strong bg-surface text-ink-700 text-xs hover:bg-lift transition-colors"
                                                    disabled={isExecutingDirective}
                                                >
                                                    Remove replacement {editIdx + 1}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {act.action_type === 'REWRITE_PROSE' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-tangerine-800 font-bold uppercase font-mono">
                                            Full Re-generation Instructions
                                        </label>
                                        <textarea
                                            value={String(act.details.instructions || '')}
                                            onChange={(e) =>
                                                onUpdateDetail(
                                                    actIdx,
                                                    'instructions',
                                                    e.target.value
                                                )
                                            }
                                            className="bg-surface text-ink-900 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full h-16 resize-none"
                                            disabled={isExecutingDirective}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-ink-500 font-bold uppercase font-mono">
                                            Mode Override
                                        </label>
                                        {(() => {
                                            const rawVal = String(
                                                act.details.mode_override ||
                                                    act.details.dominant_narrative_mode ||
                                                    ''
                                            );
                                            const selectVal = rawVal
                                                ? resolveNarrativeModeId(rawVal, allNarrativeModes)
                                                : '';
                                            const { grouped, uncategorized, hasCategories } =
                                                groupNarrativeModesForSelect(allNarrativeModes);
                                            return (
                                                <select
                                                    value={selectVal}
                                                    onChange={(e) =>
                                                        onUpdateDetail(
                                                            actIdx,
                                                            'mode_override',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-surface text-ink-800 border border-edge-strong rounded-lg px-2.5 py-1.5 outline-none focus:border-gold text-xs w-full font-mono"
                                                    disabled={isExecutingDirective}
                                                >
                                                    <option value="">None / Keep Existing</option>
                                                    {selectVal &&
                                                        !Object.prototype.hasOwnProperty.call(
                                                            allNarrativeModes,
                                                            selectVal
                                                        ) && <option value={selectVal}>{selectVal}</option>}
                                                    {hasCategories ? (
                                                        <>
                                                            {grouped.map((grp) => (
                                                                <optgroup
                                                                    key={grp.category}
                                                                    label={grp.category}
                                                                >
                                                                    {grp.keys.map((modeKey) => (
                                                                        <option
                                                                            key={modeKey}
                                                                            value={modeKey}
                                                                        >
                                                                            {modeKey}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                            {uncategorized.length > 0 && (
                                                                <optgroup label="Custom Modes">
                                                                    {uncategorized.map((modeKey) => (
                                                                        <option
                                                                            key={modeKey}
                                                                            value={modeKey}
                                                                        >
                                                                            {modeKey}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                        </>
                                                    ) : (
                                                        Object.keys(allNarrativeModes).map((modeKey) => (
                                                            <option key={modeKey} value={modeKey}>
                                                                {modeKey}
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
