/**
 * @module domain/story/logDetail
 * Builds the content of the prompt-log detail dialog (verbose dossier, sent prompt, thinking
 * trace, or response) from a pipeline log entry.
 */

import { formatVerboseLogEntry, type VerboseLogEntry } from './logFormatter';

export type LogDetailType = 'verbose' | 'prompt' | 'thinking' | 'response';

export type LogDetailEntry = VerboseLogEntry & { id?: string | number };

export interface LogDetailModalState {
    isOpen: boolean;
    type: LogDetailType;
    title: string;
    functionName: string | undefined;
    timestamp: string | undefined;
    model: string;
    tokens: number | null | undefined;
    content: string;
    entry: LogDetailEntry | null;
}

export const CLOSED_LOG_DETAIL_MODAL: LogDetailModalState = {
    isOpen: false,
    type: 'verbose',
    title: '',
    functionName: '',
    timestamp: '',
    model: '',
    tokens: null,
    content: '',
    entry: null
};

const KNOWN_TYPES = ['verbose', 'thinking', 'prompt', 'response'];
const isEntry = (value: unknown): value is LogDetailEntry => typeof value === 'object' && value !== null;

/**
 * Works out which entry and view a call refers to. Callers pass `(type, entry)`,
 * `(entry, type)`, or two strings where either is a log id and the first may be the view type.
 * An unrecognised type falls through to the response view. Null when no entry is found.
 */
export function resolveLogDetailRequest(
    typeOrEntry: unknown,
    maybeEntry: unknown,
    promptLog: ReadonlyArray<LogDetailEntry | null | undefined> = []
): { type: string; entry: LogDetailEntry } | null {
    let type: unknown = typeOrEntry;
    let entry: unknown = maybeEntry;
    if (isEntry(typeOrEntry)) {
        entry = typeOrEntry;
        type = typeof maybeEntry === 'string' ? maybeEntry : 'verbose';
    } else if (isEntry(maybeEntry)) {
        entry = maybeEntry;
        type = typeof typeOrEntry === 'string' ? typeOrEntry : 'verbose';
    } else if (typeof typeOrEntry === 'string' && typeof maybeEntry === 'string') {
        entry =
            promptLog.find(
                (l) => l && (String(l.id) === String(typeOrEntry) || String(l.id) === String(maybeEntry))
            ) || null;
        type = KNOWN_TYPES.includes(typeOrEntry) ? typeOrEntry : maybeEntry || 'verbose';
    }
    if (!entry) return null;
    return { type: String(type), entry: entry as LogDetailEntry };
}

/** The open dialog state for one view of a log entry. Token counts are estimated when absent. */
export function buildLogDetailModal(type: string, entry: LogDetailEntry): LogDetailModalState {
    const shared = {
        isOpen: true,
        functionName: entry.function,
        timestamp: entry.timestamp,
        model: entry.modelUsed || '',
        entry
    };
    if (type === 'verbose') {
        return {
            ...shared,
            type: 'verbose',
            title: 'Complete Verbose Dossier & Parameters',
            tokens: entry.tokensUsed,
            content: formatVerboseLogEntry(entry)
        };
    }
    if (type === 'thinking') {
        return {
            ...shared,
            type: 'thinking',
            title: 'AI Thinking & Reasoning Trace',
            tokens: entry.thinkingTokens ?? entry.reasoningTokensUsed ?? 0,
            content:
                entry.reasoningText ||
                '(No internal thinking/reasoning trace was returned for this prompt execution.)'
        };
    }
    if (type === 'prompt') {
        let promptContent = '';
        const effectiveSys = entry.finalSystemPrompt || entry.systemPrompt || '';
        if (effectiveSys.trim()) {
            promptContent += `=== SYSTEM PROMPT ===\n\n${effectiveSys.trim()}\n\n`;
        }
        if (entry.prompt && entry.prompt.trim()) {
            promptContent += `=== USER PROMPT & INPUT DATA ===\n\n${entry.prompt.trim()}`;
        }
        if (!promptContent.trim()) {
            promptContent = '(No prompt context recorded for this step.)';
        }
        return {
            ...shared,
            type: 'prompt',
            title: 'Sent Prompt & Input Context',
            tokens:
                entry.promptTokens ??
                (promptContent ? Math.round(promptContent.trim().split(/\s+/).length * 1.33) : null),
            content: promptContent
        };
    }
    return {
        ...shared,
        type: 'response',
        title: 'AI Generated Response Output',
        tokens:
            entry.responseTokens ??
            (entry.tokensUsed ? Math.max(0, entry.tokensUsed - (entry.thinkingTokens || 0)) : null),
        content: entry.response || entry.responseSnippet || '(No response output recorded.)'
    };
}
