/**
 * @module domain/story/logFormatter
 * Verbose pipeline log formatting utilities for individual log dossiers and full audit exports.
 */

export interface VerboseLogThinkingConfig {
    enabled?: boolean;
    budget?: number;
    effort?: string;
    level?: string;
}

export interface VerboseLogParameters {
    provider?: string;
    model?: string;
    modelSize?: string;
    endpoint?: string;
    maxTokens?: number | string;
    temperature?: number | string;
    isJson?: boolean;
    thinking?: VerboseLogThinkingConfig;
    timeoutSeconds?: number;
    timeoutMs?: number;
}

export interface VerboseLogRetryError {
    error?: string;
    attempt?: number | string;
    timestamp?: string;
}

export interface VerboseLogEntry {
    function?: string;
    stepTier?: string;
    stepId?: string | number;
    stepTitle?: string;
    timestamp?: string;
    isoTimestamp?: string;
    status?: string;
    durationSec?: number | null;
    durationMs?: number | null;
    pipelineAttempt?: number | string;
    pipelineMaxAttempts?: number | string;
    attempts?: number | string;
    maxRetries?: number | string;
    actionTaken?: string;
    isDelay?: boolean;
    isValidation?: boolean;
    validationSummary?: string;
    errors?: Array<string | VerboseLogRetryError>;
    prompt?: string;
    systemPrompt?: string;
    finalSystemPrompt?: string;
    reasoningText?: string;
    response?: string;
    responseSnippet?: string;
    provider?: string;
    modelUsed?: string;
    modelRole?: string;
    modelSize?: string;
    maxTokens?: number | string;
    promptTokens?: number | null;
    thinkingTokens?: number | null;
    reasoningTokensUsed?: number | null;
    responseTokens?: number | null;
    tokensUsed?: number | null;
    error?: string;
    lastError?: string;
    errorDetails?: string;
    parameters?: VerboseLogParameters;
    requestParameters?: VerboseLogParameters;
}

/** Formats a single pipeline or validation log entry into a structured audit dossier block. */
export function formatVerboseLogEntry(entry: VerboseLogEntry | null | undefined): string {
    if (!entry) return '(Empty log entry)';
    const p: VerboseLogParameters = entry.parameters || entry.requestParameters || {};
    const isDelay = Boolean(entry.isDelay || entry.status === 'delay');
    const isValidation = Boolean(entry.isValidation);
    const isError = entry.status === 'error' || entry.status === 'validation_failed';
    const duration =
        entry.durationSec !== null && entry.durationSec !== undefined
            ? `${entry.durationSec}s${entry.durationMs ? ` (${entry.durationMs}ms)` : ''}`
            : 'N/A';

    const lines: string[] = [];
    lines.push('================================================================================');
    lines.push(`STAGE / AGENT: ${entry.function || 'Unknown Step'}`);
    lines.push('================================================================================');
    if (entry.stepTier || entry.stepId) {
        lines.push(
            `Pipeline Tier: [${entry.stepTier || 'N/A'}] Step #${entry.stepId || 'N/A'}${entry.stepTitle ? ` - ${entry.stepTitle}` : ''}`
        );
    }
    lines.push(
        `Timestamp:     ${entry.timestamp || 'N/A'}${entry.isoTimestamp ? ` (${entry.isoTimestamp})` : ''}`
    );
    lines.push(`Status:        ${(entry.status || 'UNKNOWN').toUpperCase()}`);
    lines.push(`Duration:      ${duration}`);
    if (entry.pipelineAttempt) {
        lines.push(`Pipeline Attempt: ${entry.pipelineAttempt} of ${entry.pipelineMaxAttempts || 3}`);
    } else if (entry.attempts) {
        lines.push(`Network Attempts: ${entry.attempts} of ${entry.maxRetries || 3}`);
    }
    if (entry.actionTaken) {
        lines.push(`Action Taken:     ${entry.actionTaken}`);
    }

    if (entry.isValidation || isError) {
        lines.push('');
        lines.push('--- VALIDATION & FAILURE REPORT ---');
        lines.push(`Gate Verdict:     ${isError ? 'FAIL' : 'PASS'}`);
        if (entry.validationSummary) {
            lines.push(`Verdict Summary:  ${entry.validationSummary}`);
        }
        if (entry.actionTaken) {
            lines.push(`Next Action:      ${entry.actionTaken}`);
        }
        if (entry.errors && entry.errors.length > 0) {
            lines.push(`Flagged Deviations / Errors (${entry.errors.length}):`);
            entry.errors.forEach((err, i) => lines.push(`  ${i + 1}. ${String(err)}`));
        }
        if (entry.prompt && (!entry.errors || entry.errors.length === 0)) {
            lines.push(`Validation Notes / Details:\n${entry.prompt}`);
        }
    }

    if (!isDelay && !isValidation) {
        lines.push('');
        lines.push('--- CONFIGURATION & ADDED PARAMETERS ---');
        lines.push(`Provider:      ${entry.provider || p.provider || 'N/A'}`);
        lines.push(`Model Used:    ${entry.modelUsed || p.model || 'N/A'}`);
        lines.push(`Model Role:    ${entry.modelRole || 'dev'}`);
        lines.push(`Model Target:  ${entry.modelSize || p.modelSize || 'default'}`);
        if (p.endpoint) {
            lines.push(`API Endpoint:  ${p.endpoint}`);
        }
        lines.push(`Max Tokens:    ${p.maxTokens ?? (entry.maxTokens || 'N/A')}`);
        lines.push(`Temperature:   ${p.temperature ?? 'N/A'}`);
        lines.push(`Output Format: ${p.isJson ? 'JSON (application/json)' : 'Plain Text / Markdown'}`);
        if (p.thinking) {
            lines.push(
                `Thinking Config: Enabled: ${Boolean(p.thinking.enabled)} | Budget: ${p.thinking.budget || 0} tok | Effort: ${p.thinking.effort || 'none'} | Level: ${p.thinking.level || 'N/A'}`
            );
        }
        const timeoutStr =
            p.timeoutSeconds !== undefined
                ? `${p.timeoutSeconds}s`
                : p.timeoutMs !== undefined
                  ? `${p.timeoutMs / 1000}s`
                  : 'N/A';
        lines.push(`Timeout:       ${timeoutStr}`);

        lines.push('');
        lines.push('--- TOKEN METRICS ---');
        const sentTok =
            entry.promptTokens !== null && entry.promptTokens !== undefined
                ? entry.promptTokens.toLocaleString()
                : 'N/A';
        const thinkTok = entry.thinkingTokens ?? entry.reasoningTokensUsed ?? 0;
        const respTok =
            entry.responseTokens !== null && entry.responseTokens !== undefined
                ? entry.responseTokens.toLocaleString()
                : 'N/A';
        const totalTok =
            entry.tokensUsed !== null && entry.tokensUsed !== undefined
                ? entry.tokensUsed.toLocaleString()
                : 'N/A';
        lines.push(`Sent (Prompt) Tokens:     ${sentTok}`);
        lines.push(`Thinking Tokens:          ${thinkTok.toLocaleString()}`);
        lines.push(`Response Output Tokens:   ${respTok}`);
        lines.push(`Total Tokens Used:        ${totalTok}`);
    }

    if (entry.validationSummary && !entry.isValidation && !isError) {
        lines.push('');
        lines.push('--- STEP SUMMARY / GATE VERDICT ---');
        lines.push(entry.validationSummary);
    }

    if (entry.errors && entry.errors.length > 0 && !entry.isValidation) {
        lines.push('');
        lines.push(`--- RETRY & ERROR HISTORY (${entry.errors.length} retry event(s)) ---`);
        entry.errors.forEach((err, idx) => {
            const errText =
                typeof err === 'object' && err !== null
                    ? err.error || JSON.stringify(err)
                    : String(err);
            const att =
                typeof err === 'object' && err !== null ? err.attempt || idx + 1 : idx + 1;
            const ts = typeof err === 'object' && err !== null ? err.timestamp || 'unknown' : 'unknown';
            lines.push(`[Retry #${att} at ${ts}]: ${errText}`);
        });
    }

    if ((entry.error || entry.errorDetails) && !entry.isValidation) {
        lines.push('');
        lines.push('--- FAILURE DETAILS ---');
        if (entry.error) lines.push(`Error Message: ${entry.error}`);
        if (entry.lastError && entry.lastError !== entry.error) {
            lines.push(`Last Error:    ${entry.lastError}`);
        }
        if (entry.errorDetails && entry.errorDetails !== entry.error) {
            lines.push(`Details / Stack:\n${entry.errorDetails}`);
        }
    }

    if (!isDelay) {
        lines.push('');
        lines.push('--- CONTEXT SENT: SYSTEM PROMPT (Final With Directives) ---');
        const effectiveSys = entry.finalSystemPrompt || entry.systemPrompt || '(None)';
        lines.push(effectiveSys);

        if (
            entry.finalSystemPrompt &&
            entry.systemPrompt &&
            entry.finalSystemPrompt !== entry.systemPrompt
        ) {
            lines.push('');
            lines.push('--- BASE SYSTEM PROMPT (Original Template) ---');
            lines.push(entry.systemPrompt);
        }

        lines.push('');
        lines.push('--- CONTEXT SENT: USER PROMPT & INPUT DATA ---');
        lines.push(entry.prompt || '(No user prompt recorded)');
    } else {
        lines.push('');
        lines.push('--- TIMER DETAILS ---');
        lines.push(entry.prompt || entry.validationSummary || '');
    }

    if (entry.reasoningText) {
        lines.push('');
        lines.push('--- THINKING / REASONING TRACE RECEIVED ---');
        lines.push(entry.reasoningText);
    }

    if (entry.response || entry.responseSnippet) {
        lines.push('');
        lines.push('--- RESPONSE RECEIVED ---');
        lines.push(entry.response || entry.responseSnippet || '');
    }

    lines.push('');
    return lines.join('\n');
}

/** Exports all pipeline logs into a timestamped human-readable chronicle and detailed dossier file. */
export function formatAllVerboseLogs(
    logs: VerboseLogEntry[] = [],
    storyTitle = 'EllipsisProse Project',
    filterName = 'all'
): string {
    if (!logs || logs.length === 0) {
        return `EllipsisProse Verbose Pipeline Log\nStory: ${storyTitle}\nDate: ${new Date().toLocaleString()}\n\nNo log entries found.`;
    }

    const totalSent = logs.reduce((acc, e) => acc + (e.promptTokens || 0), 0);
    const totalThink = logs.reduce(
        (acc, e) => acc + (e.thinkingTokens || e.reasoningTokensUsed || 0),
        0
    );
    const totalResp = logs.reduce((acc, e) => acc + (e.responseTokens || 0), 0);
    const totalAll = totalSent + totalThink + totalResp;
    const errorCount = logs.filter(
        (e) => e.status === 'error' || e.status === 'validation_failed'
    ).length;
    const successCount = logs.filter((e) => e.status === 'success').length;

    const out: string[] = [];
    out.push('================================================================================');
    out.push('ELLIPSISPROSE - FULL VERBOSE PIPELINE & CONTEXT AUDIT LOG');
    out.push('================================================================================');
    out.push(`Project / Story: ${storyTitle}`);
    out.push(`Exported At:     ${new Date().toLocaleString()} (${new Date().toISOString()})`);
    out.push(`Active Filter:   ${String(filterName).toUpperCase()}`);
    out.push(
        `Total Entries:   ${logs.length} (Success: ${successCount}, Failures/Errors: ${errorCount})`
    );
    out.push(`Sent Tokens:     ${totalSent.toLocaleString()} tok`);
    out.push(`Thinking Tokens: ${totalThink.toLocaleString()} tok`);
    out.push(`Response Tokens: ${totalResp.toLocaleString()} tok`);
    out.push(`Grand Total:     ${totalAll.toLocaleString()} tok`);
    out.push('================================================================================');
    out.push('');
    out.push('PIPELINE EXECUTION CHRONOLOGY:');
    logs.forEach((entry, idx) => {
        const dur = entry.durationSec ? `${entry.durationSec}s` : 'N/A';
        const st = (entry.status || 'unknown').toUpperCase();
        out.push(
            ` [${String(idx + 1).padStart(2, '0')}] [${entry.timestamp || 'N/A'}] [${st}] ${entry.function || 'Step'} (${dur})`
        );
    });
    out.push('');
    out.push('DETAILED STEP-BY-STEP CONTEXT & RESPONSE DOSSIERS:');
    out.push('');

    logs.forEach((entry, idx) => {
        out.push(`### STEP ${idx + 1} of ${logs.length}: ${entry.function || 'Step'} ###`);
        out.push(formatVerboseLogEntry(entry));
        out.push('');
    });

    return out.join('\n');
}
