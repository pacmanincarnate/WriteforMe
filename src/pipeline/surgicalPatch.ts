/**
 * @module pipeline/surgicalPatch
 * Orchestrated surgical patch application, automated retry recovery,
 * prose blueprint surgical patching, and manual AI-Slop cleaning.
 */

import { isAudioDramaScriptText, normalizeAudioDramaScript } from '@/domain/audio';
import {
    applySurgicalEditsDetailed,
    computeChangeRatio,
    SURGICAL_MAX_CHANGE_RATIO,
    type AppliedSurgicalEdit,
    type SurgicalEditReport
} from '@/domain/editing';
import { formatSlopAuditForPrompt, scanTextForSlop } from '@/domain/slop';
import { getSurgicalPromptForMode, PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type { Story } from '@/types';
import { escapeXml } from '@/utils';
import {
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { markRestorePoint } from './restorePoint';

export interface FailedEditRetryItem {
    index: number;
    type: string;
    needle: string;
    reason: string;
    requestedEdit?: Record<string, unknown>;
}

export interface RetryFailedSurgicalEditsParams {
    currentText: string;
    failed: FailedEditRetryItem[];
    systemPrompt: string;
    logName: string;
    modelSize: string;
}

export interface ApplySurgicalEditsWithRetryParams {
    originalText: string;
    blocksText: string;
    systemPrompt: string;
    logName: string;
    modelSize: string;
}

export interface ApplySurgicalProsePatchParams {
    story: PipelineStory;
    seqIdx: number;
    sceneIdx: number;
    instructions: string;
    allowLargeChange?: boolean;
    logName?: string;
}

export interface ApplySurgicalProsePatchResult {
    story: PipelineStory;
    appliedEdits: AppliedSurgicalEdit[];
    message: string;
}

/** Re-issues unmatched surgical edit needles once against the current text snapshot. */
export async function retryFailedSurgicalEdits(
    ctx: PipelineRuntimeContext,
    {
        currentText,
        failed,
        systemPrompt,
        logName,
        modelSize
    }: RetryFailedSurgicalEditsParams
): Promise<SurgicalEditReport> {
    if (!failed.length) return applySurgicalEditsDetailed(currentText, '');
    const retryPrompt = `<original_text>
${currentText}
</original_text>

<failed_edits>
${failed
    .map(
        (edit) =>
            `<edit><type>${escapeXml(edit.type)}</type><needle>${escapeXml(edit.needle)}</needle><requested_edit>${escapeXml(JSON.stringify(edit.requestedEdit || {}))}</requested_edit></edit>`
    )
    .join('\n')}
</failed_edits>

These did not match; re-issue them quoting the text exactly as it appears in <original_text>.
Return one edit per failure, in listed order, preserving the requested replacement or insertion. Do not re-issue edits that already applied. Output only <edits> blocks.`;
    const output = await ctx.callAI(retryPrompt, systemPrompt, false, `${logName} Retry`, modelSize);
    return applySurgicalEditsDetailed(currentText, asString(output));
}

/** Applies `<edits>` surgical blocks with a single automatic retry pass for failed matches. */
export async function applySurgicalEditsWithRetry(
    ctx: PipelineRuntimeContext,
    {
        originalText,
        blocksText,
        systemPrompt,
        logName,
        modelSize
    }: ApplySurgicalEditsWithRetryParams
): Promise<SurgicalEditReport> {
    const report = applySurgicalEditsDetailed(originalText, blocksText);
    let recovered = 0;
    if (report.failed.length > 0) {
        try {
            const retry = await retryFailedSurgicalEdits(ctx, {
                currentText: report.text,
                failed: report.failed.map((edit) => ({
                    ...edit,
                    requestedEdit: report.edits.find((item) => item.index === edit.index)
                })),
                systemPrompt,
                logName,
                modelSize
            });
            const offset = report.edits.length;
            const omitted = report.failed.slice(retry.edits.length);
            report.text = retry.text;
            report.edits.push(
                ...retry.edits.map((edit) => ({ ...edit, index: Number(edit.index || 0) + offset }))
            );
            report.applied.push(...retry.applied.map((edit) => ({ ...edit, index: edit.index + offset })));
            report.failed = [
                ...retry.failed.map((edit) => ({ ...edit, index: edit.index + offset })),
                ...omitted
            ];
            recovered = retry.applied.length;
        } catch (err) {
            console.warn(`[${logName}] Surgical retry failed:`, err);
        }
    }
    report.summary = `Surgical edits: ${report.applied.length} applied, ${report.failed.length} failed (${recovered} recovered on retry)`;
    console.log(`[${logName}] ${report.summary}`);
    return report;
}

/** Applies targeted surgical edits to existing scene prose based on instructions. */
export async function applySurgicalProsePatch(
    ctx: PipelineRuntimeContext,
    {
        story,
        seqIdx,
        sceneIdx,
        instructions,
        allowLargeChange,
        logName = 'Surgical Prose Editor'
    }: ApplySurgicalProsePatchParams
): Promise<ApplySurgicalProsePatchResult> {
    const sId = `${seqIdx}-${sceneIdx}`;
    const proseMap = asRecord(story.prose);
    const proseObj = asRecord(proseMap[sId]);
    const currentProse = asString(proseObj.final);
    if (!currentProse.trim()) {
        throw new Error(
            `Scene ${sceneIdx + 1} has no written prose yet. Generate prose first or use Write Prose.`
        );
    }

    const patchPrompt = `<original_text>
${currentProse}
</original_text>

<surgical_instructions>
${instructions}
</surgical_instructions>

BEGIN SURGICAL PROSE EDIT`;
    const isAudioMode =
        asString(story.writing_mode) === 'audio_drama' || isAudioDramaScriptText(currentProse);
    const surgicalSysPrompt = getSurgicalPromptForMode(PROMPTS.surgicalProseEditor, isAudioMode);
    const patchOutput = await ctx.callAI(patchPrompt, surgicalSysPrompt, false, logName, 'review');
    const report = await applySurgicalEditsWithRetry(ctx, {
        originalText: currentProse,
        blocksText: patchOutput,
        systemPrompt: surgicalSysPrompt,
        logName,
        modelSize: 'review'
    });
    if (!report.applied.length) {
        throw new Error('no surgical edits could be applied');
    }
    const changeRatio = computeChangeRatio(currentProse, report.text);
    if (changeRatio > SURGICAL_MAX_CHANGE_RATIO && allowLargeChange !== true) {
        throw new Error(
            `Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`
        );
    }
    let finalText = report.text;
    if (asString(story.writing_mode) === 'audio_drama' || isAudioDramaScriptText(finalText)) {
        finalText = normalizeAudioDramaScript(finalText);
    }
    const updatedProse: Record<string, unknown> = { ...proseObj, final: finalText };
    delete updatedProse.stale;
    return {
        story: { ...story, prose: { ...proseMap, [sId]: updatedProse } },
        appliedEdits: report.applied,
        message: report.summary || `Applied prose patch to Scene ${sceneIdx + 1}.`
    };
}

/** Runs an on-demand AI Slop Audit + Surgical Clean pass on the active scene prose. */
export async function handleRunManualSlopClean(
    ctx: PipelineRuntimeContext,
    seqIdx: number,
    sceneIdx: number
): Promise<void> {
    if (ctx.getIsRunningManualSlopClean?.()) return;
    const story = ctx.getStory();
    const sId = `${seqIdx}-${sceneIdx}`;
    const proseObj = asOptionalRecord(asRecord(story.prose)[sId]);
    const currentProse = asString(proseObj?.final) || asString(proseObj?.draft);
    if (!currentProse.trim()) {
        ctx.showToast('No prose to clean in this scene.', 'warning');
        return;
    }

    await markRestorePoint(ctx, `Before cleaning Scene ${seqIdx + 1}.${sceneIdx + 1}`, story);
    ctx.setIsRunningManualSlopClean?.(true);
    try {
        const isAudioMode =
            asString(story.writing_mode) === 'audio_drama' || isAudioDramaScriptText(currentProse);
        const audit = scanTextForSlop(currentProse, {
            slopConfig: ctx.getSlopConfig(),
            customBannedPhrases: ctx.getBannedPhrases(),
            story: story as Partial<Story>,
            isAudioDrama: isAudioMode
        });
        if (!audit || !Array.isArray(audit.allHits) || audit.allHits.length === 0) {
            ctx.showToast('This scene already passed the AI Slop Audit cleanly.', 'success');
            return;
        }
        const auditLines = formatSlopAuditForPrompt(audit, {
            maxItems: 20,
            includeSentences: true
        });
        const surgicalPrompt = `\n<original_text>\n${currentProse}\n</original_text>\n\n<banned_words_detected>\n${auditLines}\n</banned_words_detected>\n`;
        const sysPrompt = getSurgicalPromptForMode(PROMPTS.surgicalEditorBannedWords, isAudioMode);
        const surgicalRes = await ctx.callAI(
            surgicalPrompt,
            sysPrompt,
            false,
            'Surgical Editor (AI Slop - Manual Clean)',
            'review'
        );
        const report = await applySurgicalEditsWithRetry(ctx, {
            originalText: currentProse,
            blocksText: surgicalRes,
            systemPrompt: sysPrompt,
            logName: 'Surgical Editor (AI Slop - Manual Clean)',
            modelSize: 'review'
        });
        const cleanedText = isAudioMode ? normalizeAudioDramaScript(report.text) : report.text;
        if (cleanedText && cleanedText !== currentProse) {
            const updatedStory = ctx.setStory((prev) => {
                const prevProseMap = asRecord(prev.prose);
                const prevEntry = asRecord(prevProseMap[sId]);
                return {
                    ...prev,
                    prose: {
                        ...prevProseMap,
                        [sId]: {
                            ...prevEntry,
                            final: cleanedText,
                            draft:
                                prevEntry.draft && !prevEntry.final ? cleanedText : prevEntry.draft,
                            slop_cleaned_at: Date.now()
                        }
                    }
                };
            });
            const updatedId = asString(updatedStory?.id);
            if (updatedId) {
                await storyStore.saveStory(updatedId, updatedStory);
            }
            ctx.showToast(
                `Surgical Clean applied ${report.applied.length} replacement(s).`,
                'success'
            );
        } else {
            ctx.showToast(report.summary || 'No surgical replacements could be applied.', 'info');
        }
    } catch (err) {
        ctx.showToast(`Surgical Clean failed: ${extractErrorMessage(err)}`, 'error');
    } finally {
        ctx.setIsRunningManualSlopClean?.(false);
    }
}
