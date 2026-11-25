/**
 * @module pipeline/surgicalPatch
 * Orchestrated surgical patch application with automated AI retry recovery for failed needles.
 */

import {
    applySurgicalEditsDetailed,
    type SurgicalEditReport
} from '@/domain/editing';
import { escapeXml } from '@/utils';
import {
    asString,
    type PipelineRuntimeContext
} from './context';

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
