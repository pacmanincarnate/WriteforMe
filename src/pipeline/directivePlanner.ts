/**
 * @module pipeline/directivePlanner
 * Directive Agent planning orchestrator (Tier 6.1) plus post-edit prose verification,
 * archivist synchronization, cross-scene consistency checks, and single-action review repair.
 */

import { STRUCTURAL_MODALITIES } from '@/config';
import { isAudioDramaScriptText, normalizeAudioDramaScript } from '@/domain/audio';
import {
    computeChangeRatio,
    SURGICAL_MAX_CHANGE_RATIO,
    type AppliedSurgicalEdit
} from '@/domain/editing';
import {
    actForSequence,
    clearDirectivePlanResults,
    parseActNumber,
    parseDirectivePlan,
    serializeDirectivePlan,
    type DirectiveActionItem,
    type DirectivePlan
} from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { countWords, decodeXmlEntities, escapeXml, extractTag, extractTagList } from '@/utils';
import { runArchivistForScene } from './continuityPipeline';
import { syncStorySoFarAfterScene } from './storySoFar';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import {
    buildDirectiveReviewContext,
    directiveReviewFailure,
    parseDirectiveReview,
    type DirectiveReviewResult,
    type DirectiveReviewStoryState
} from './directiveReview';
import { applySurgicalEditsWithRetry } from './surgicalPatch';

export type DirectiveLogFn = (text: string, status?: string) => void;

export interface DirectiveActionExecutionResult extends Record<string, unknown> {
    status: 'applied' | 'failed' | 'skipped';
    message: string;
    proseSceneId?: string;
    appliedEdits?: AppliedSurgicalEdit[];
    review?: DirectiveReviewResult;
    reviewFixAttempted?: boolean;
    cascade?: {
        status: 'applied' | 'failed' | 'skipped';
        message: string;
        appliedEdits: AppliedSurgicalEdit[];
    };
}

/** Verifies directive-modified prose against the scene blueprint & runs the Continuity Archivist. */
export async function verifyAndArchiveDirectiveScene(
    ctx: PipelineRuntimeContext,
    storyState: PipelineStory,
    sId: string,
    logMessage: DirectiveLogFn
): Promise<{ story: PipelineStory; review: DirectiveReviewResult }> {
    const [seqIdx, sceneIdx] = sId.split('-').map(Number);
    const label = `${seqIdx + 1}.${sceneIdx + 1}`;
    const enableReview = ctx.getEnableReview();
    let workingStory = storyState;
    let review: DirectiveReviewResult;

    if (!enableReview) {
        review = {
            status: 'PASS',
            critique: 'Review bypassed via settings',
            issues: [],
            error: false
        };
        logMessage(`[Verify] Scene ${label}: PASS (bypassed via settings)`, 'success');
    } else {
        try {
            const proseEntry = asOptionalRecord(asRecord(workingStory.prose)[sId]);
            const proseText =
                typeof asRecord(workingStory.prose)[sId] === 'string'
                    ? asString(asRecord(workingStory.prose)[sId])
                    : asString(proseEntry?.final);
            const isAudioMode =
                asString(workingStory.writing_mode) === 'audio_drama' ||
                isAudioDramaScriptText(proseText);
            const reviewSysPrompt = isAudioMode
                ? PROMPTS.audioDramaWritingReview
                : PROMPTS.writingReview;
            const output = await ctx.callAI(
                buildDirectiveReviewContext(
                    workingStory as unknown as DirectiveReviewStoryState,
                    seqIdx,
                    sceneIdx
                ),
                reviewSysPrompt,
                false,
                'Directive Prose Reviewer',
                'review'
            );
            review = parseDirectiveReview(output);
        } catch (err) {
            console.warn('Directive prose verification failed:', err);
            review = directiveReviewFailure(err);
        }
        logMessage(
            `[Verify] Scene ${label}: ${review.status === 'PASS' ? 'PASS' : `FAIL (${review.issues.length} issues)`}`,
            review.status === 'PASS' ? 'success' : 'error'
        );
    }

    if (!review.issues.some((issue) => issue.severity === 'CRITICAL')) {
        const archived = await runArchivistForScene(ctx, workingStory, seqIdx, sceneIdx);
        const synced = await syncStorySoFarAfterScene(ctx, archived, seqIdx, sceneIdx, {
            isAutopilot: true
        });
        logMessage(
            `[Archive] Scene ${label}: ${synced !== workingStory ? 'updated continuity' : 'no updates returned'}`,
            synced !== workingStory ? 'success' : 'pending'
        );
        workingStory = synced;
    }

    return { story: workingStory, review };
}

/** Runs cross-scene consistency verification across all arc-scoped touched scenes. */
export async function reviewDirectiveConsistency(
    ctx: PipelineRuntimeContext,
    storyState: PipelineStory,
    sceneIds: string[],
    consistencyNotes: string,
    logMessage: DirectiveLogFn
): Promise<DirectiveReviewResult> {
    if (!ctx.getEnableReview()) {
        const review: DirectiveReviewResult = {
            status: 'PASS',
            critique: 'Consistency review bypassed via settings',
            issues: [],
            error: false
        };
        logMessage('[Consistency] Cross-scene consistency: PASS (bypassed via settings)', 'success');
        return review;
    }

    let review: DirectiveReviewResult;
    try {
        const scenesMap = asRecord(storyState.scenes);
        const proseMap = asRecord(storyState.prose);
        const excerpts = sceneIds
            .map((sId) => {
                const [seqIdx, sceneIdx] = sId.split('-').map(Number);
                const scene = asOptionalRecord(asArray(scenesMap[`${seqIdx}`])[sceneIdx]);
                const rawProse = proseMap[sId];
                const proseRec = asOptionalRecord(rawProse);
                const prose =
                    typeof rawProse === 'string' ? rawProse : asString(proseRec?.final);
                return `<scene><number>${seqIdx + 1}.${sceneIdx + 1}</number><title>${escapeXml(asString(scene?.title))}</title><first>${escapeXml(prose.slice(0, 600))}</first><last>${escapeXml(prose.slice(-600))}</last></scene>`;
            })
            .join('\n');
        const output = await ctx.callAI(
            `<consistency_notes>\n${escapeXml(consistencyNotes || '')}\n</consistency_notes>\n<scene_excerpts>\n${excerpts}\n</scene_excerpts>`,
            PROMPTS.directiveConsistencyReview,
            false,
            'Directive Consistency Reviewer',
            'review'
        );
        review = parseDirectiveReview(output);
    } catch (err) {
        console.warn('Directive cross-scene review failed:', err);
        review = directiveReviewFailure(err);
    }

    logMessage(
        `[Consistency] Cross-scene consistency: ${review.status === 'PASS' ? 'PASS' : `FAIL (${review.issues.length} issues)`}`,
        review.status === 'PASS' ? 'success' : 'error'
    );
    return review;
}

/** Applies a targeted surgical prose repair for an action whose review verification flagged issues. */
export async function handleFixDirectiveReview(
    ctx: PipelineRuntimeContext,
    actionIdx: number
): Promise<void> {
    if (ctx.getIsPlanningDirective?.() || ctx.getIsExecutingDirective?.()) return;
    const directivePlan = ctx.getDirectivePlan?.() || null;
    const action = directivePlan?.actions[actionIdx];
    const result = action?.result as DirectiveActionExecutionResult | undefined;
    if (
        !result?.review?.issues?.length ||
        result.review.error ||
        result.reviewFixAttempted ||
        !result.proseSceneId
    ) {
        return;
    }

    const story = ctx.getStory();
    const sId = result.proseSceneId;
    const rawEntry = asRecord(story.prose)[sId];
    const entryRec = asOptionalRecord(rawEntry);
    const currentProse = typeof rawEntry === 'string' ? rawEntry : asString(entryRec?.final);
    if (!currentProse.trim()) return;

    ctx.setIsExecutingDirective?.(true);
    const updateResult = (updates: Partial<DirectiveActionExecutionResult>): void => {
        ctx.setDirectivePlan?.((prev) =>
            prev
                ? {
                      ...prev,
                      actions: prev.actions.map((item, idx) =>
                          idx === actionIdx
                              ? {
                                    ...item,
                                    result: {
                                        ...asRecord(item.result),
                                        ...updates
                                    }
                                }
                              : item
                      )
                  }
                : prev
        );
    };
    const logMessage: DirectiveLogFn = (text, status = 'pending') => {
        ctx.setDirectiveExecutionLogs?.((prev) => [
            ...prev,
            { id: Date.now() + Math.random(), text, status }
        ]);
    };

    updateResult({ reviewFixAttempted: true });
    try {
        const isAudioMode =
            asString(story.writing_mode) === 'audio_drama' ||
            isAudioDramaScriptText(currentProse);
        const surgicalSysPrompt = isAudioMode
            ? PROMPTS.audioDramaSurgicalEditorProse
            : PROMPTS.surgicalEditorProse;
        const output = await ctx.callAI(
            `<original_text>\n${currentProse}\n</original_text>\n<reviewer_feedback>\n${escapeXml(JSON.stringify(result.review.issues, null, 2))}\n</reviewer_feedback>`,
            surgicalSysPrompt,
            false,
            'Directive Surgical Review Fix',
            'review'
        );
        const report = await applySurgicalEditsWithRetry(ctx, {
            originalText: currentProse,
            blocksText: output,
            systemPrompt: surgicalSysPrompt,
            logName: 'Directive Surgical Review Fix',
            modelSize: 'review'
        });
        if (!report.applied.length) {
            throw new Error(report.summary || 'No surgical edits could be applied.');
        }
        const changeRatio = computeChangeRatio(currentProse, report.text);
        if (changeRatio > SURGICAL_MAX_CHANGE_RATIO && action?.allow_large_change !== true) {
            throw new Error(
                `Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`
            );
        }
        const finalFixedText = isAudioMode
            ? normalizeAudioDramaScript(report.text)
            : report.text;

        const nextStory = ctx.setStory((prev) => {
            const prevProseMap = asRecord(prev.prose);
            const prose: Record<string, unknown> = {
                ...asRecord(prevProseMap[sId]),
                final: finalFixedText
            };
            delete prose.stale;
            return { ...prev, prose: { ...prevProseMap, [sId]: prose } };
        });

        updateResult({
            appliedEdits: [...(result.appliedEdits || []), ...report.applied],
            review: undefined
        });
        ctx.setDirectivePlan?.((prev) =>
            prev ? { ...prev, consistencyReview: undefined } : prev
        );
        logMessage(`[Fix] ${report.summary}`, report.failed.length ? 'error' : 'success');

        const verified = await verifyAndArchiveDirectiveScene(ctx, nextStory, sId, logMessage);
        ctx.setStory(() => verified.story);
        updateResult({ review: verified.review });
        logMessage(
            `[Fix] Scene ${sId.split('-').map((n) => Number(n) + 1).join('.')}: ${verified.review.status}`,
            verified.review.status === 'PASS' ? 'success' : 'error'
        );
    } catch (err) {
        console.warn('Directive surgical review fix failed:', err);
        logMessage(`[Fix] Failed: ${extractErrorMessage(err)}`, 'error');
    } finally {
        ctx.setIsExecutingDirective?.(false);
    }
}

/** Runs Directive Scoper + Directive Planner (Tier 6.1) to compile or refine an action plan. */
export async function runDirectivePlanner(
    ctx: PipelineRuntimeContext,
    refinementRequest = ''
): Promise<void> {
    if (ctx.getIsPlanningDirective?.() || ctx.getIsExecutingDirective?.()) return;

    const currentPlan = ctx.getDirectivePlan?.() || null;
    const isRefinement =
        typeof refinementRequest === 'string' &&
        Boolean(refinementRequest.trim()) &&
        Boolean(currentPlan);
    const previousPlan =
        isRefinement && currentPlan ? clearDirectivePlanResults(currentPlan) : null;
    const refinementContext = isRefinement
        ? `\n<previous_plan>\n${serializeDirectivePlan(previousPlan)}\n</previous_plan>\n<refinement_request>\n${escapeXml(refinementRequest)}\n</refinement_request>`
        : '';

    const directiveInput = ctx.getDirectiveInput?.() || '';
    if (!directiveInput.trim()) {
        ctx.showToast('Please enter a directive instruction.', 'warning');
        return;
    }

    ctx.setIsPlanningDirective?.(true);
    ctx.setDirectivePlanPhase?.('scoping');
    if (!isRefinement) {
        ctx.setDirectivePlan?.(null);
        ctx.setDirectivePlanHistory?.([]);
        ctx.setDirectiveRefinement?.('');
        ctx.setDirectiveUndoSnapshot?.(null);
        ctx.setDirectiveExecutionLogs?.([]);
        ctx.setDirectiveProgress?.(0);
    }

    try {
        const story = ctx.getStory();
        const protectWrittenProse = ctx.getProtectWrittenProse?.() ?? true;
        const cascadeSceneChanges = ctx.getCascadeSceneChanges?.() ?? true;
        const allNarrativeModes = ctx.getAllNarrativeModes?.() || {};

        let latestWrittenSequence = -1;
        let latestWrittenScene = -1;
        const seqs = asArray<Record<string, unknown>>(story.sequences);
        const scenesMap = asRecord(story.scenes);
        const proseMap = asRecord(story.prose);

        if (protectWrittenProse) {
            seqs.forEach((_seq, seqIdx) => {
                asArray<Record<string, unknown>>(scenesMap[`${seqIdx}`]).forEach(
                    (_scene, sceneIdx) => {
                        const sId = `${seqIdx}-${sceneIdx}`;
                        const proseEntry = asOptionalRecord(proseMap[sId]);
                        if (proseEntry && proseEntry.final) {
                            if (seqIdx > latestWrittenSequence) {
                                latestWrittenSequence = seqIdx;
                                latestWrittenScene = sceneIdx;
                            } else if (
                                seqIdx === latestWrittenSequence &&
                                sceneIdx > latestWrittenScene
                            ) {
                                latestWrittenScene = sceneIdx;
                            }
                        }
                    }
                );
            });
        }

        let protectionNote = '';
        if (protectWrittenProse && latestWrittenSequence > -1) {
            protectionNote = `\n<protect_written_prose>\nThe story has been written up to Sequence ${latestWrittenSequence + 1}, Scene ${latestWrittenScene + 1}.\nThe user has enabled 'Protect Written Prose'. SURGICAL_PATCH_PROSE and LINE_EDIT_PROSE may edit written scenes. Structural changes (including REWRITE_PROSE) at or before this written boundary are forbidden unless the directive clearly requires them. Emit any such required actions and explain in <evaluation> that the user must override protection for those actions.\n</protect_written_prose>\n`;
        }

        const developedSeqIndices: number[] = [];
        const undevelopedSeqIndices: number[] = [];
        seqs.forEach((_, seqIdx) => {
            if (asArray(scenesMap[`${seqIdx}`]).length > 0) developedSeqIndices.push(seqIdx);
            else undevelopedSeqIndices.push(seqIdx);
        });

        const storyStyle = asRecord(story.style);
        const structureOverview = {
            title: story.title,
            concept: story.concept,
            heart_of_the_dilemma: asString(story.heart_of_the_dilemma),
            status_quo: story.status_quo,
            inciting_incident: story.inciting_incident,
            themes: story.themes,
            core_thematic_argument: asString(story.core_thematic_argument),
            starting_value_state: asString(story.starting_value_state),
            ending_value_state: asString(story.ending_value_state),
            major_surprises_and_twists: asString(story.major_surprises_and_twists),
            author_note: asString(story.author_note),
            style: {
                ...storyStyle,
                synthesized_authorial_persona:
                    asString(story.synthesized_authorial_persona) ||
                    asString(storyStyle.synthesized_authorial_persona),
                genre_pacing_and_dialogue_rules:
                    asString(story.genre_pacing_and_dialogue_rules) ||
                    asString(storyStyle.genre_pacing_and_dialogue_rules),
                strict_anti_patterns:
                    asString(story.strict_anti_patterns) ||
                    asString(storyStyle.strict_anti_patterns)
            },
            development_status: {
                acts_count: asArray(story.acts).length,
                sequences_count: seqs.length,
                developed_sequence_indices: developedSeqIndices,
                undeveloped_sequence_indices: undevelopedSeqIndices,
                written_scenes_count: Object.values(proseMap).filter(
                    (p) => Boolean(asOptionalRecord(p)?.final)
                ).length
            },
            threads: asArray<Record<string, unknown>>(story.threads).map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description
            })),
            character_arcs: asArray<Record<string, unknown>>(story.character_arcs).map((a) => ({
                char_id: a.char_id,
                corner_role: asString(a.corner_role),
                lie_believed: asString(a.lie_believed),
                truth_needed: asString(a.truth_needed),
                arc_catalyst: asString(a.arc_catalyst),
                description: asString(a.description),
                web_pressure: asString(a.web_pressure)
            })),
            secret_vault: asArray<Record<string, unknown>>(story.secret_vault).map((s) => {
                const coverObj = asOptionalRecord(s.cover_story);
                const revealAnchor = asOptionalRecord(s.reveal_anchor);
                return {
                    id: s.id,
                    title: s.title,
                    category: s.category,
                    truth: s.truth,
                    public_cover_story:
                        typeof s.cover_story === 'string'
                            ? s.cover_story
                            : asString(coverObj?.public_belief) || asString(s.public_cover_story),
                    known_by: s.known_by_characters || s.known_by || [],
                    concealed_from: s.concealed_from_characters || s.concealed_from || [],
                    reveal_target_act: revealAnchor?.act_number || s.reveal_target_act || 3,
                    reveal_target_sequence:
                        revealAnchor?.sequence_number || s.reveal_target_sequence || 7
                };
            }),
            cast: asArray<Record<string, unknown>>(story.cast).map((c) => ({
                id: c.id,
                name: c.name,
                role: c.role,
                corner_role: asString(c.corner_role),
                core_flaw: c.core_flaw,
                core_desire: c.core_desire,
                vocal_cadence: c.vocal_cadence
            })),
            relationships: story.relationships || {},
            lore: asArray<Record<string, unknown>>(story.lore).map((l) => ({
                topic: l.topic,
                detail: asString(l.detail).slice(0, 200)
            })),
            continuity_ledger: story.continuity_ledger || [],
            cascade_scene_changes: cascadeSceneChanges,
            acts: asArray<Record<string, unknown>>(story.acts).map((act, actIdx) => {
                const actNum = parseActNumber(
                    typeof act.number === 'string' || typeof act.number === 'number'
                        ? act.number
                        : undefined,
                    actIdx + 1
                );
                const hasSequences = seqs.some(
                    (sq, sIdx) =>
                        parseActNumber(
                            typeof sq.parent_act === 'string' || typeof sq.parent_act === 'number'
                                ? sq.parent_act
                                : undefined,
                            actForSequence(sIdx + 1)
                        ) === actNum
                );
                return {
                    index: actIdx,
                    number: act.number,
                    title: act.title,
                    mandate: asString(act.act_mandate) || asString(act.description),
                    core_tension: asString(act.core_tension),
                    thematic_reversal: asString(act.thematic_reversal),
                    world_building_developments: asString(act.world_building_developments),
                    knots: act.knots || [],
                    has_sequences: hasSequences
                };
            }),
            sequences: seqs.map((seq, seqIdx) => {
                const seqScenes = asArray(scenesMap[`${seqIdx}`]);
                return {
                    index: seqIdx,
                    number: seq.number,
                    parent_act: seq.parent_act,
                    title: seq.title,
                    sequence_function: asString(seq.sequence_function),
                    dramatic_question: asString(seq.dramatic_question),
                    starting_state: asString(seq.starting_state),
                    sequence_objective: asString(seq.sequence_objective),
                    description: asString(seq.description),
                    four_corner_movement: asString(seq.four_corner_movement),
                    threads_advanced: seq.threads_advanced || [],
                    characters_in_focus: seq.characters_in_focus || [],
                    sequence_climax: asString(seq.sequence_climax),
                    ending_hook: asString(seq.ending_hook),
                    next_sequence_boundary_guard: asString(seq.next_sequence_boundary_guard),
                    is_developed: seqScenes.length > 0,
                    scenes_count: seqScenes.length
                };
            }),
            scenes: seqs.flatMap((_seq, seqIdx) =>
                asArray<Record<string, unknown>>(scenesMap[`${seqIdx}`]).map((scene, sceneIdx) => {
                    const sId = `${seqIdx}-${sceneIdx}`;
                    const proseEntry = asOptionalRecord(proseMap[sId]);
                    const proseFinal = asString(proseEntry?.final);
                    return {
                        sequence_idx: seqIdx,
                        scene_idx: sceneIdx,
                        number: scene.number || `${seqIdx + 1}.${sceneIdx + 1}`,
                        title: scene.title,
                        pov_character: asString(scene.pov_character),
                        setting: asString(scene.setting),
                        scene_type: asString(scene.scene_type) || 'PROACTIVE',
                        dominant_narrative_mode:
                            asString(scene.dominant_narrative_mode) || 'BASELINE_NEUTRAL',
                        objective: asString(scene.objective) || asString(scene.goal),
                        scene_events: asString(scene.scene_events).slice(0, 320),
                        surface_activity: asString(scene.surface_activity),
                        the_hinge_moment: asString(scene.the_hinge_moment),
                        value_shift: asString(scene.value_shift),
                        exit_hook: asString(scene.exit_hook),
                        cast_names: scene.cast_names || scene.characters_present || [],
                        has_written_prose: Boolean(proseFinal),
                        prose_word_count: proseFinal ? countWords(proseFinal) : 0
                    };
                })
            )
        };

        let targetSceneDetails = '';
        let scopeKind = previousPlan?.scope_kind || 'local';
        let consistencyNotes = previousPlan?.consistency_notes || '';
        try {
            const scopePrompt = `<user_directive>
${directiveInput}
</user_directive>

<current_story_structure>
${JSON.stringify(structureOverview, null, 2)}
</current_story_structure>${refinementContext}`;
            const scopeResponse = await ctx.callAI(
                scopePrompt,
                PROMPTS.directiveScoper,
                false,
                'Directive Scoper',
                'dev'
            );
            if (
                !extractTag(scopeResponse, 'response') &&
                !/<target_scenes>/i.test(scopeResponse || '')
            ) {
                throw new Error('Scoper response missing expected XML.');
            }
            scopeKind =
                extractTag(scopeResponse, 'scope_kind').toLowerCase() === 'arc' ? 'arc' : 'local';
            consistencyNotes =
                scopeKind === 'arc'
                    ? decodeXmlEntities(extractTag(scopeResponse, 'consistency_notes') || '')
                    : '';
            const seenTargets = new Set<string>();
            const targetScenes = extractTagList(
                extractTag(scopeResponse, 'target_scenes'),
                'scene'
            )
                .map((block) => {
                    const sequenceText = extractTag(block, 'sequence_idx');
                    const sceneText = extractTag(block, 'scene_idx');
                    if (!/^\d+$/.test(sequenceText) || !/^\d+$/.test(sceneText)) return null;
                    const sequenceIdx = Number(sequenceText);
                    const sceneIdx = Number(sceneText);
                    if (
                        !Number.isSafeInteger(sequenceIdx) ||
                        !Number.isSafeInteger(sceneIdx) ||
                        !seqs[sequenceIdx] ||
                        !asArray(scenesMap[`${sequenceIdx}`])[sceneIdx]
                    ) {
                        return null;
                    }
                    return {
                        sequence_idx: sequenceIdx,
                        scene_idx: sceneIdx,
                        reason: extractTag(block, 'reason')
                    };
                })
                .filter(
                    (
                        target
                    ): target is { sequence_idx: number; scene_idx: number; reason: string } => {
                        if (!target) return false;
                        const key = `${target.sequence_idx}-${target.scene_idx}`;
                        if (seenTargets.has(key)) return false;
                        seenTargets.add(key);
                        return true;
                    }
                )
                .slice(0, scopeKind === 'arc' ? 12 : 6);

            const needsProse = extractTag(scopeResponse, 'needs_prose').toLowerCase() === 'true';
            if (targetScenes.length > 0) {
                const details = targetScenes.map((target) => {
                    const sId = `${target.sequence_idx}-${target.scene_idx}`;
                    const proseFinal = asString(asOptionalRecord(proseMap[sId])?.final);
                    return {
                        ...target,
                        scene: asArray(scenesMap[`${target.sequence_idx}`])[target.scene_idx],
                        ...(needsProse && proseFinal ? { prose: { final: proseFinal } } : {})
                    };
                });
                targetSceneDetails = `\n\n<target_scene_details>\n${JSON.stringify(details, null, 2)}\n</target_scene_details>`;
            }
        } catch (scopeError) {
            console.warn(
                'Directive scoping failed; planning with the structure overview only:',
                scopeError
            );
        }

        const availableModesXml = `<available_narrative_modes>\n${Object.values(allNarrativeModes)
            .map((m) => {
                const rec = m as unknown as Record<string, unknown>;
                const displayName = asString(rec.name) || asString(rec.title) || asString(rec.id);
                const categoryAttr = rec.category
                    ? ` category="${escapeXml(asString(rec.category))}"`
                    : '';
                const desc = [
                    asString(rec.context),
                    rec.boundaryNote ? `Boundary Note: ${asString(rec.boundaryNote)}` : ''
                ]
                    .filter(Boolean)
                    .join(' ');
                return `  <mode id="${escapeXml(asString(rec.id))}" name="${escapeXml(displayName)}"${categoryAttr}>${escapeXml(desc)}</mode>`;
            })
            .join('\n')}\n</available_narrative_modes>`;
        const availableModalitiesXml = `<available_modalities>\n${Object.values(
            STRUCTURAL_MODALITIES || {}
        )
            .map((m) => `- ${m.name} (${m.category}): ${m.summary}`)
            .join('\n')}\n</available_modalities>`;

        ctx.setDirectivePlanPhase?.('planning');
        const prompt = `${protectionNote}
<user_directive>
${directiveInput}
</user_directive>

<current_story_structure>
${JSON.stringify(structureOverview, null, 2)}
</current_story_structure>

${availableModesXml}

${availableModalitiesXml}${targetSceneDetails}${refinementContext}
<scope_kind>${scopeKind}</scope_kind>
${scopeKind === 'arc' ? `<consistency_notes>\n${escapeXml(consistencyNotes)}\n</consistency_notes>` : ''}

<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <evaluation>A detailed developmental explanation of the surgical strategy across developed and/or undeveloped regions to address the user_directive.</evaluation>
  <scope_kind>${scopeKind}</scope_kind>
  <consistency_notes>For arc scope, return refined invariants across the scenes.</consistency_notes>
  <actions>
    <action>
      <action_type>MODIFY_SCENE</action_type>
      <target_act_idx>0</target_act_idx>
      <target_sequence_idx>0</target_sequence_idx>
      <target_scene_idx>0</target_scene_idx>
      <target_character_id>Optional (only used for character actions)</target_character_id>
      <description>Brief summary of what this action does.</description>
      <details>
        <!-- Use the appropriate XML tags inside <details> for the chosen action_type: -->
        <!-- PERSIST_FUTURE_MANDATE (for undeveloped/future regions): <target_scope>auto</target_scope> (auto|sequence|act|story_author_note) <mandate_label>Optional short label</mandate_label><mandate_text>Clear persisted mandate appended to the closest generated container (sequence.description, act.act_mandate, or story.author_note).</mandate_text> -->
        <!-- MODIFY_STORY_METADATA: <title/><concept/><heart_of_the_dilemma/><status_quo/><inciting_incident/><themes/><core_thematic_argument/><starting_value_state/><ending_value_state/><major_surprises_and_twists/><author_note/><genre/><mood/><writing_guide/><synthesized_authorial_persona/><genre_pacing_and_dialogue_rules/><strict_anti_patterns/> -->
        <!-- ADD_CHARACTER / MODIFY_CHARACTER: <name/><role/><corner_role/><core_flaw/><core_desire/><vocal_cadence/><deep_profile/><aliases/> (plus optional Truby fields: why_it_makes_sense, what_it_costs_them, way_of_living, why_it_is_appealing, shared_outlook, the_hidden_trap, how_they_ended_up, human_sympathy, the_wake_up_call) -->
        <!-- MODIFY_RELATIONSHIP: <relationship_key>A-&gt;B</relationship_key> or <from_name>A</from_name><to_name>B</to_name>; <current/><hidden_tension/><trust_level>1-10</trust_level> -->
        <!-- ADD_THREAD / MODIFY_THREAD / DELETE_THREAD: <thread_id>T4</thread_id><name/><description/> -->
        <!-- MODIFY_CHARACTER_ARC: <char_id>Character Name</char_id><corner_role/><lie_believed/><truth_needed/><arc_catalyst/><description/><web_pressure/> -->
        <!-- ADD_SECRET / MODIFY_SECRET: <secret_id/><title/><category/><truth/><public_cover_story/><known_by/><concealed_from/><reveal_target_act/><reveal_target_sequence/> -->
        <!-- ADD_LORE / MODIFY_LORE: <topic/><detail/> | ADD_CONTINUITY_FACT: <key/><value/><category/><entity_name/> -->
        <!-- ADD_PROPOSITION: <id/><claim_text/><objective_truth/><subject_id/><predicate/><object_id/><world_valid_from/> | MODIFY_EPISTEMIC_BELIEF: <holder_id/><proposition_id/><stance/><confidence>0.0-1.0</confidence><target_scene>1.1</target_scene> -->
        <!-- MODIFY_ACT: <title/><act_mandate/><core_tension/><thematic_reversal/><world_building_developments/> -->
        <!-- MODIFY_SEQUENCE: <title/><sequence_function/><dramatic_question/><starting_state/><description/><sequence_objective/><four_corner_movement/><threads_advanced/><characters_in_focus/><sequence_climax/><ending_hook/><next_sequence_boundary_guard/> -->
        <!-- ADD_SEQUENCE: <title/><sequence_function/><dramatic_question/><starting_state/><description/><sequence_objective/><four_corner_movement/><next_sequence_boundary_guard/><insert_at_idx>2</insert_at_idx> | DELETE_SEQUENCE: no details needed -->
        <!-- MODIFY_SCENE / ADD_SCENE (for developed sequences; include full Scene Blueprint fields): <insert_at_idx/><title/><pov_character/><setting/><dominant_narrative_mode/><scene_type>PROACTIVE</scene_type><objective/><scene_events/><atmospheric_overview/><modality_hand/><surface_activity/><main_character_heart/><other_character_heart/><the_hinge_moment/><value_shift>Start -&gt; End</value_shift><exit_hook/><transition_jump/><entrance_conditions/><exit_conditions/><epistemic_friction_level/><activation_contexts/><cast_names>A, B</cast_names><plot_commitments/><description/> -->
        <!-- MOVE_SCENE: <to_idx>1</to_idx> within the target sequence only. | DELETE_SCENE: no details needed -->
        <!-- SURGICAL_PATCH_PROSE: <instructions>...</instructions> (or exact <find_text>/<replace_text> copied verbatim from target_scene_details) -->
        <!-- LINE_EDIT_PROSE: <find_text/><replace_text/> or <line_edits><edit><find/><replace/></edit></line_edits> copied verbatim from target_scene_details -->
        <!-- REWRITE_PROSE: <instructions>...</instructions><mode_override>Optional style ID</mode_override> -->
      </details>
    </action>
    <!-- Add more <action> blocks as needed -->
  </actions>
</response>
</output_format_description>

BEGIN DEVELOPING SURGICAL DIRECTIVES
`;

        const response = await ctx.callAI(
            prompt,
            PROMPTS.directivePlanner,
            false,
            'Directive Planner',
            'dev'
        );
        const parsed = parseDirectivePlan(response);
        parsed.scope_kind = scopeKind;
        if (scopeKind === 'arc' && !parsed.consistency_notes) {
            parsed.consistency_notes = consistencyNotes;
        }

        if (!parsed.evaluation && parsed.actions.length === 0) {
            throw new Error(
                'Failed to parse plan. Response did not contain expected XML format.'
            );
        }

        if (isRefinement && previousPlan) {
            ctx.setDirectivePlanHistory?.((prev) => [...prev, previousPlan].slice(-5));
            ctx.setDirectiveUndoSnapshot?.(null);
            ctx.setDirectiveExecutionLogs?.([]);
            ctx.setDirectiveProgress?.(0);
            ctx.setDirectiveRefinement?.('');
        }
        ctx.setDirectivePlan?.(parsed);
        ctx.setExpandedDirectiveActions?.(parsed.actions.length === 1 ? { 0: true } : {});
        ctx.showToast(
            isRefinement
                ? 'Directive plan refined successfully!'
                : 'Directive plan generated successfully!',
            'success'
        );
    } catch (err) {
        console.error('Directive planning failed:', err);
        const msg = `Planning failed: ${extractErrorMessage(err)}`;
        if (typeof ctx.notifyAlert === 'function') {
            ctx.notifyAlert(msg);
        } else {
            ctx.showToast(msg, 'error');
        }
    } finally {
        ctx.setDirectivePlanPhase?.(null);
        ctx.setIsPlanningDirective?.(false);
    }
}

export type { DirectiveActionItem, DirectivePlan };
