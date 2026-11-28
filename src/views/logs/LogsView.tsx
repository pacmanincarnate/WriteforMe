/**
 * @module views/logs/LogsView
 * Pipeline & prompt telemetry log inspector view with token totals, category/status filters,
 * verbose dossier pop-ups, and clipboard / .txt / .json exports.
 */

import React, { useState } from 'react';
import { VIEW_LABELS } from '@/config';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    Brain,
    CheckCircle2,
    ChevronDown,
    Copy,
    Clock,
    Download,
    FileText,
    History,
    Layers,
    Maximize2,
    MessageSquare,
    RefreshCw,
    Sparkles,
    Trash2,
    XCircle
} from '@/components/icons';
import { formatAllVerboseLogs, formatVerboseLogEntry, type VerboseLogEntry } from '@/domain/story';
import { copyVerboseLogToClipboard, downloadVerboseLogFile } from '@/services/browser';

export type LogFilterKey = 'all' | 'calls' | 'validations' | 'delays' | 'audio' | 'errors' | string;

export interface LogsViewEntry extends VerboseLogEntry {
    id?: string | number;
    attempt?: number | string;
    isError?: boolean;
    isDelay?: boolean;
    isValidation?: boolean;
    isAudio?: boolean;
    category?: string;
    tierName?: string;
    actionTaken?: string;
    cachedTokens?: number;
    routedProvider?: string;
    modelRole?: string;
    modelSize?: string;
    tokensUsed?: number | null;
    responseSnippet?: string;
    [key: string]: unknown;
}

export interface LogsViewProps {
    promptLog: LogsViewEntry[];
    setPromptLog: React.Dispatch<React.SetStateAction<LogsViewEntry[]>> | ((next: LogsViewEntry[]) => void);
    logFilter: LogFilterKey;
    setLogFilter: (filter: LogFilterKey) => void;
    openLogDetailModal: (tab: 'verbose' | 'prompt' | 'thinking' | 'response', entry: LogsViewEntry) => void;
    showToast?: (message: string, type?: string) => void;
    storyTitle?: string;
}

export function LogsView({
    promptLog,
    setPromptLog,
    logFilter,
    setLogFilter,
    openLogDetailModal,
    showToast,
    storyTitle = 'EllipsisProse Project'
}: LogsViewProps) {
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    const totalSentTokens = promptLog.reduce((acc, e) => acc + (e.promptTokens || 0), 0);
    const totalThinkingTokens = promptLog.reduce(
        (acc, e) => acc + (e.thinkingTokens || e.reasoningTokensUsed || 0),
        0
    );
    const totalResponseTokens = promptLog.reduce((acc, e) => acc + (e.responseTokens || 0), 0);
    const totalAllTokens = totalSentTokens + totalThinkingTokens + totalResponseTokens;

    const visibleLogs = promptLog.filter((entry) => {
        const isErr =
            entry.status === 'error' || entry.status === 'validation_failed' || entry.isError;
        if (logFilter === 'calls') {
            return !entry.isDelay && !entry.isValidation && !entry.isAudio && !isErr;
        }
        if (logFilter === 'validations') return Boolean(entry.isValidation);
        if (logFilter === 'delays') return Boolean(entry.isDelay);
        if (logFilter === 'audio') {
            return Boolean(
                entry.isAudio ||
                    entry.category === 'audio' ||
                    entry.stepId === 22 ||
                    entry.tierName === 'Tier 7.0: Audio Drama'
            );
        }
        if (logFilter === 'errors') return Boolean(isErr);
        return true;
    });

    const handleCopyAllVerbose = () => {
        if (visibleLogs.length === 0) return;
        const text = formatAllVerboseLogs(visibleLogs, storyTitle, logFilter);
        copyVerboseLogToClipboard(
            text,
            showToast,
            `Copied verbose log (${visibleLogs.length} entries) to clipboard!`
        );
    };

    const handleExportText = () => {
        if (visibleLogs.length === 0) return;
        const text = formatAllVerboseLogs(visibleLogs, storyTitle, logFilter);
        const filterSuffix = logFilter !== 'all' ? `_${logFilter}` : '';
        const safeTitle = (storyTitle || 'ellipsis')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .slice(0, 30);
        downloadVerboseLogFile(
            `${safeTitle}_verbose_log${filterSuffix}_${Date.now()}.txt`,
            text,
            'text/plain;charset=utf-8'
        );
        if (showToast) {
            showToast(`Exported verbose log (${visibleLogs.length} entries) as .txt`, 'success');
        }
    };

    const handleExportJson = () => {
        if (visibleLogs.length === 0) return;
        const jsonStr = JSON.stringify(visibleLogs, null, 2);
        const filterSuffix = logFilter !== 'all' ? `_${logFilter}` : '';
        const safeTitle = (storyTitle || 'ellipsis')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .slice(0, 30);
        downloadVerboseLogFile(
            `${safeTitle}_verbose_log${filterSuffix}_${Date.now()}.json`,
            jsonStr,
            'application/json;charset=utf-8'
        );
        if (showToast) {
            showToast(`Exported verbose JSON (${visibleLogs.length} entries) as .json`, 'success');
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
                <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 flex items-center gap-2.5">
                        <History className="text-gold-ink" /> {VIEW_LABELS.logs}
                    </h2>
                    <span className="text-xs font-mono font-bold text-ink-500 bg-mist-100 px-3 py-1 rounded-full border border-edge-strong">
                        {promptLog.length} entries
                    </span>
                    {totalSentTokens > 0 && (
                        <span
                            className="text-xs font-mono font-bold text-sage-800 bg-sage-tint px-2.5 py-1 rounded-full border border-sage-edge flex items-center gap-1"
                            title="Total tokens sent to AI across all steps"
                        >
                            <ArrowUpRight size={11} className="text-sage-600" /> Sent:{' '}
                            {totalSentTokens.toLocaleString()} tok
                        </span>
                    )}
                    {totalThinkingTokens > 0 && (
                        <span
                            className="text-xs font-mono font-bold text-plum-800 bg-plum-tint px-2.5 py-1 rounded-full border border-plum-edge flex items-center gap-1"
                            title="Total thinking / reasoning tokens generated"
                        >
                            <Brain size={11} className="text-plum-600" /> Think:{' '}
                            {totalThinkingTokens.toLocaleString()} tok
                        </span>
                    )}
                    {totalResponseTokens > 0 && (
                        <span
                            className="text-xs font-mono font-bold text-blue-800 bg-azure-tint px-2.5 py-1 rounded-full border border-azure-edge flex items-center gap-1"
                            title="Total response tokens generated"
                        >
                            <MessageSquare size={11} className="text-blue-600" /> Resp:{' '}
                            {totalResponseTokens.toLocaleString()} tok
                        </span>
                    )}
                    {totalAllTokens > 0 && (
                        <span
                            className="text-xs font-mono font-bold text-ink-700 bg-inset px-2.5 py-1 rounded-full border border-edge-strong flex items-center gap-1"
                            title="Total context & generation tokens (Sent + Think + Resp)"
                        >
                            Total: {totalAllTokens.toLocaleString()} tok
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Quick Verbose Copy & Export Toolbar */}
                    <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-edge-strong shadow-2xs">
                        <button
                            onClick={handleCopyAllVerbose}
                            disabled={visibleLogs.length === 0}
                            className="px-3 py-1.5 rounded-lg font-bold font-sans text-xs bg-gold-tint hover:bg-gold/25 text-gold-ink border border-gold-edge shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            title="Copy full verbose log with all context, parameters, and responses for troubleshooting"
                        >
                            <Copy size={13} />
                            <span>Copy Verbose Log</span>
                            {visibleLogs.length > 0 && (
                                <span className="text-[10px] font-mono bg-surface/80 px-1.5 py-0.2 rounded border border-gold-edge/50">
                                    {visibleLogs.length}
                                </span>
                            )}
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                disabled={visibleLogs.length === 0}
                                className="px-3 py-1.5 rounded-lg font-bold font-sans text-xs bg-surface hover:bg-wash text-ink-800 border border-edge-strong shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title="Export verbose logs to file"
                            >
                                <Download size={13} />
                                <span>Export Log</span>
                                <ChevronDown
                                    size={11}
                                    className={`transition-transform duration-200 ${
                                        isExportMenuOpen ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>
                            {isExportMenuOpen && (
                                <div className="absolute right-0 mt-1.5 w-60 bg-surface border border-edge-strong rounded-xl shadow-xl z-30 py-1 text-xs animate-fade-in">
                                    <button
                                        onClick={() => {
                                            handleExportText();
                                            setIsExportMenuOpen(false);
                                        }}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-mist-100 flex items-center gap-2 text-ink-800 transition-colors cursor-pointer"
                                    >
                                        <FileText size={15} className="text-sage-700 shrink-0" />
                                        <div>
                                            <div className="font-bold">Formatted Text (.txt)</div>
                                            <div className="text-[10px] text-ink-500">
                                                Full verbose report for troubleshooting
                                            </div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleExportJson();
                                            setIsExportMenuOpen(false);
                                        }}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-mist-100 flex items-center gap-2 text-ink-800 transition-colors border-t border-edge-soft cursor-pointer"
                                    >
                                        <Download size={15} className="text-azure-700 shrink-0" />
                                        <div>
                                            <div className="font-bold">Raw JSON (.json)</div>
                                            <div className="text-[10px] text-ink-500">
                                                Full telemetry and parameter objects
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Log Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-surface p-1 rounded-xl border border-edge-strong shadow-2xs text-xs">
                        {(['all', 'calls', 'validations', 'delays', 'audio', 'errors'] as const).map(
                            (filterKey) => {
                                const errCount = promptLog.filter(
                                    (e) =>
                                        e.status === 'error' ||
                                        e.status === 'validation_failed' ||
                                        e.isError
                                ).length;
                                const valCount = promptLog.filter((e) => e.isValidation).length;
                                const audioCount = promptLog.filter(
                                    (e) =>
                                        e.isAudio || e.category === 'audio' || e.stepId === 22
                                ).length;
                                return (
                                    <button
                                        key={filterKey}
                                        onClick={() => setLogFilter(filterKey)}
                                        className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer flex items-center gap-1.5 ${
                                            logFilter === filterKey
                                                ? 'bg-btn text-btn-ink shadow-2xs'
                                                : 'text-ink-600 hover:text-ink-900 hover:bg-lift'
                                        }`}
                                    >
                                        <span>{filterKey}</span>
                                        {filterKey === 'errors' && errCount > 0 && (
                                            <span className="text-[10px] font-mono font-bold bg-rose-600 text-white px-1.5 py-0.2 rounded-full shadow-2xs">
                                                {errCount}
                                            </span>
                                        )}
                                        {filterKey === 'validations' && valCount > 0 && (
                                            <span className="text-[10px] font-mono text-ink-500 bg-mist-200/80 px-1.5 py-0.2 rounded-full">
                                                {valCount}
                                            </span>
                                        )}
                                        {filterKey === 'audio' && audioCount > 0 && (
                                            <span className="text-[10px] font-mono text-plum-700 bg-plum-tint px-1.5 py-0.2 rounded-full border border-plum-edge">
                                                {audioCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            }
                        )}
                        {promptLog.length > 0 && (
                            <button
                                onClick={() => setPromptLog([])}
                                className="px-2.5 py-1.5 rounded-lg text-ink-400 hover:text-blush-600 hover:bg-blush-tint transition-colors ml-1 cursor-pointer"
                                title="Clear logs"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {promptLog.length === 0 ? (
                    <div className="text-center text-ink-400 py-20 italic bg-surface rounded-2xl border border-edge shadow-sm">
                        No pipeline logs or prompt dispatches yet. Start generating!
                    </div>
                ) : visibleLogs.length === 0 ? (
                    <div className="text-center text-ink-400 py-16 italic bg-surface rounded-2xl border border-edge shadow-sm">
                        No entries match the selected filter &quot;{logFilter}&quot;.
                    </div>
                ) : (
                    visibleLogs.map((entry, idx) => {
                        const isSuccess = entry.status === 'success';
                        const isDelay = entry.isDelay || entry.status === 'delay';
                        const isValidation = Boolean(entry.isValidation);
                        const isError =
                            entry.status === 'error' ||
                            entry.status === 'validation_failed' ||
                            Boolean(entry.isError);
                        const isAudio =
                            entry.isAudio || entry.category === 'audio' || entry.stepId === 22;
                        const p = entry.parameters || {};

                        const rawAttempt =
                            entry.pipelineAttempt ||
                            entry.attempt ||
                            (entry.function && entry.function.match(/Attempt\s+(\d+)/i)?.[1]);
                        const attemptNum =
                            rawAttempt !== undefined && rawAttempt !== null && rawAttempt !== ''
                                ? Number(rawAttempt)
                                : null;
                        const maxAttempts = entry.pipelineMaxAttempts || 3;

                        return (
                            <div
                                key={entry.id ?? idx}
                                className={`bg-surface rounded-2xl border shadow-sm overflow-hidden transition-all ${
                                    isError
                                        ? 'border-2 border-rose-300 dark:border-rose-800/80 border-l-[6px] border-l-rose-600 shadow-md bg-gradient-to-b from-rose-50/50 via-surface to-surface dark:from-rose-950/25 dark:via-surface dark:to-surface'
                                        : isAudio
                                          ? 'border-plum-edge/80 border-l-[5px] border-l-plum-600 bg-gradient-to-b from-plum-tint/25 to-surface shadow-xs'
                                          : isDelay
                                            ? 'border-azure-edge bg-gradient-to-b from-blue-50/20 to-surface'
                                            : isValidation
                                              ? isSuccess
                                                  ? 'border-sage-edge bg-gradient-to-b from-emerald-50/20 to-surface'
                                                  : 'border-rose-300'
                                              : 'border-edge'
                                }`}
                            >
                                <div
                                    className={`p-4 sm:p-5 border-b flex flex-wrap justify-between items-center gap-2 ${
                                        isError
                                            ? 'bg-rose-50/90 dark:bg-rose-950/45 border-rose-200 dark:border-rose-900/60'
                                            : 'bg-mist-50/70 border-edge-strong'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <span className="text-xs font-mono text-ink-500">
                                            {entry.timestamp}
                                        </span>

                                        {(entry.stepTier || entry.stepId) && (
                                            <span
                                                className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border bg-gold-tint text-gold-ink border-gold-edge flex items-center gap-1 shadow-2xs shrink-0"
                                                title={
                                                    entry.stepTitle
                                                        ? `Step ${entry.stepId || ''}: ${entry.stepTitle}`
                                                        : `Pipeline Step ${entry.stepId || ''}`
                                                }
                                            >
                                                <Layers size={11} className="text-gold-ink shrink-0" />
                                                <span>{entry.stepTier || `Step ${entry.stepId}`}</span>
                                                {entry.stepId && (
                                                    <span className="opacity-70 font-normal">
                                                        #{entry.stepId}
                                                    </span>
                                                )}
                                            </span>
                                        )}

                                        <span
                                            className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border font-mono flex items-center gap-1.5 ${
                                                isError
                                                    ? 'text-rose-950 dark:text-rose-100 bg-rose-100/90 dark:bg-rose-900/60 border-rose-300 dark:border-rose-700'
                                                    : 'text-ink-800 bg-mist-200/80 border-edge-300'
                                            }`}
                                            title={
                                                entry.stepTitle
                                                    ? `Step ${entry.stepId || ''}: ${entry.stepTitle}`
                                                    : entry.function
                                            }
                                        >
                                            {isError && (
                                                <AlertTriangle
                                                    size={12}
                                                    className="text-rose-600 shrink-0"
                                                />
                                            )}
                                            {entry.function}
                                        </span>

                                        {attemptNum !== null && !Number.isNaN(attemptNum) && (
                                            <span
                                                className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                                                    attemptNum === 1
                                                        ? 'text-ink-700 bg-mist-200/90 border-edge-300'
                                                        : attemptNum === 2
                                                          ? 'text-amber-900 bg-amber-100 border-amber-300'
                                                          : 'text-rose-950 bg-rose-100 border-rose-300'
                                                }`}
                                            >
                                                {attemptNum === 2 && (
                                                    <RefreshCw size={10} className="text-amber-700" />
                                                )}
                                                {attemptNum >= 3 && (
                                                    <Sparkles size={10} className="text-rose-600" />
                                                )}
                                                Attempt {attemptNum}/{maxAttempts}{' '}
                                                {attemptNum === 2
                                                    ? '(Retry)'
                                                    : attemptNum >= 3
                                                      ? '(Escalated)'
                                                      : ''}
                                            </span>
                                        )}

                                        {entry.durationSec !== null &&
                                            entry.durationSec !== undefined && (
                                                <span className="text-xs font-mono text-sage-800 bg-sage-tint px-2.5 py-0.5 rounded-full border border-sage-edge flex items-center gap-1 font-bold">
                                                    <Clock size={11} /> {entry.durationSec}s{' '}
                                                    {entry.durationMs ? `(${entry.durationMs}ms)` : ''}
                                                </span>
                                            )}

                                        {Number(entry.attempts) > 1 && (
                                            <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300">
                                                API Retry {entry.attempts}/{entry.maxRetries || 3}
                                            </span>
                                        )}

                                        {isDelay && (
                                            <span className="text-[11px] font-bold text-azure-800 bg-azure-tint px-2.5 py-0.5 rounded-full border border-azure-edge font-mono">
                                                ⏱️ DELAY TIMER
                                            </span>
                                        )}

                                        {isValidation && (
                                            <span
                                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-mono flex items-center gap-1 ${
                                                    isSuccess
                                                        ? 'text-sage-800 bg-sage-tint border-sage-edge'
                                                        : 'text-white bg-rose-600 border-rose-700 shadow-2xs'
                                                }`}
                                            >
                                                {isSuccess ? (
                                                    <CheckCircle2 size={11} />
                                                ) : (
                                                    <XCircle size={11} />
                                                )}
                                                {isSuccess ? '✓ PASS GATE' : '✗ FAIL GATE'}
                                            </span>
                                        )}

                                        {!isDelay && !isValidation && (
                                            <span
                                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-mono flex items-center gap-1 ${
                                                    entry.status === 'pending'
                                                        ? 'text-ember-800 bg-ember-tint border-ember-edge'
                                                        : isError
                                                          ? 'text-white bg-rose-600 border-rose-700 shadow-2xs'
                                                          : 'text-sage-800 bg-sage-tint border-sage-edge'
                                                }`}
                                            >
                                                {isError && <XCircle size={11} />}
                                                {entry.status === 'pending'
                                                    ? 'RUNNING...'
                                                    : isError
                                                      ? 'ERROR'
                                                      : 'VALID RESPONSE'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                            onClick={() => openLogDetailModal('verbose', entry)}
                                            className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold font-sans transition-all border shadow-2xs bg-gold-tint hover:bg-gold/25 text-gold-ink border-gold-edge cursor-pointer"
                                            title="Open Complete Verbose Dossier (Context Sent, Parameters & Response) in Pop-up Window"
                                        >
                                            <FileText size={12} className="text-gold-ink" />
                                            <span>Full Dossier</span>
                                        </button>

                                        {!isDelay && (
                                            <React.Fragment>
                                                <button
                                                    onClick={() => openLogDetailModal('prompt', entry)}
                                                    className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold font-sans transition-all border shadow-2xs cursor-pointer ${
                                                        entry.prompt || entry.systemPrompt
                                                            ? 'bg-sage-tint hover:bg-emerald-100 text-sage-900 border-sage-edge hover:border-emerald-300'
                                                            : 'bg-mist-100 text-ink-500 border-edge-strong hover:bg-mist-200/80 hover:text-ink-700'
                                                    }`}
                                                    title="View Full Prompt & Context Sent to AI in Pop-up Window"
                                                >
                                                    <ArrowUpRight
                                                        size={12}
                                                        className={
                                                            entry.prompt || entry.systemPrompt
                                                                ? 'text-sage-700'
                                                                : 'text-ink-400'
                                                        }
                                                    />
                                                    <span>Sent Prompt</span>
                                                    {entry.promptTokens !== null &&
                                                        entry.promptTokens !== undefined && (
                                                            <span className="text-[10px] font-mono font-normal opacity-85">
                                                                ({entry.promptTokens.toLocaleString()} tok)
                                                            </span>
                                                        )}
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        openLogDetailModal('thinking', entry)
                                                    }
                                                    className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold font-sans transition-all border shadow-2xs cursor-pointer ${
                                                        entry.reasoningText ||
                                                        (entry.thinkingTokens &&
                                                            entry.thinkingTokens > 0)
                                                            ? 'bg-plum-tint hover:bg-plum-tint-strong text-plum-900 border-plum-edge hover:border-plum-edge'
                                                            : 'bg-mist-100 text-ink-500 border-edge-strong hover:bg-mist-200/80 hover:text-ink-700'
                                                    }`}
                                                    title="View AI Thinking Trace in Pop-up Window"
                                                >
                                                    <Brain
                                                        size={12}
                                                        className={
                                                            entry.reasoningText ||
                                                            (entry.thinkingTokens &&
                                                                entry.thinkingTokens > 0)
                                                                ? 'text-plum-600'
                                                                : 'text-ink-400'
                                                        }
                                                    />
                                                    <span>Thinking</span>
                                                    {entry.thinkingTokens !== null &&
                                                        entry.thinkingTokens !== undefined &&
                                                        entry.thinkingTokens > 0 && (
                                                            <span className="text-[10px] font-mono font-normal opacity-85">
                                                                ({entry.thinkingTokens} tok)
                                                            </span>
                                                        )}
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        openLogDetailModal('response', entry)
                                                    }
                                                    className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold font-sans transition-all border shadow-2xs cursor-pointer ${
                                                        entry.response || entry.responseSnippet
                                                            ? 'bg-azure-tint hover:bg-blue-100 text-blue-900 border-azure-edge hover:border-blue-300'
                                                            : 'bg-mist-100 text-ink-500 border-edge-strong hover:bg-mist-200/80 hover:text-ink-700'
                                                    }`}
                                                    title="View Full AI Response in Pop-up Window"
                                                >
                                                    <MessageSquare
                                                        size={12}
                                                        className={
                                                            entry.response || entry.responseSnippet
                                                                ? 'text-blue-600'
                                                                : 'text-ink-400'
                                                        }
                                                    />
                                                    <span>Response</span>
                                                    {entry.responseTokens !== null &&
                                                        entry.responseTokens !== undefined && (
                                                            <span className="text-[10px] font-mono font-normal opacity-85">
                                                                ({entry.responseTokens} tok)
                                                            </span>
                                                        )}
                                                </button>
                                            </React.Fragment>
                                        )}

                                        <button
                                            onClick={() => {
                                                const text = formatVerboseLogEntry(entry);
                                                copyVerboseLogToClipboard(
                                                    text,
                                                    showToast,
                                                    `Copied verbose log for "${entry.function}"!`
                                                );
                                            }}
                                            className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors font-semibold border border-edge-strong hover:border-ink-400 cursor-pointer"
                                            title="Copy Full Verbose Log (Context Sent, Added Parameters, and Response Received) for Troubleshooting"
                                        >
                                            <Copy size={12} />
                                            <span>Copy Verbose</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                const text = formatVerboseLogEntry(entry);
                                                const safeName = (entry.function || 'step')
                                                    .toLowerCase()
                                                    .replace(/[^a-z0-9]/g, '_')
                                                    .slice(0, 30);
                                                downloadVerboseLogFile(
                                                    `ellipsis_log_${safeName}_${Date.now()}.txt`,
                                                    text,
                                                    'text/plain;charset=utf-8'
                                                );
                                                if (showToast) {
                                                    showToast(
                                                        `Exported verbose log for "${entry.function}"`,
                                                        'success'
                                                    );
                                                }
                                            }}
                                            className="text-xs p-1.5 rounded-xl text-ink-500 hover:text-ink-900 hover:bg-wash transition-colors border border-edge-strong hover:border-ink-400 cursor-pointer"
                                            title="Download Single Step Verbose Log as .txt"
                                        >
                                            <Download size={13} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 sm:p-5 space-y-3 text-xs font-mono leading-relaxed">
                                    {isError && (
                                        <div className="bg-rose-50/90 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 rounded-xl p-3.5 sm:p-4 text-xs font-sans space-y-2.5 text-rose-950 dark:text-rose-100 shadow-2xs">
                                            <div className="flex items-center gap-1.5 font-bold font-mono text-rose-800 dark:text-rose-300 uppercase tracking-wider text-[11px]">
                                                <AlertOctagon
                                                    size={14}
                                                    className="text-rose-600 shrink-0"
                                                />
                                                <span>Failure / Error Detected</span>
                                            </div>
                                            <div className="font-mono text-xs whitespace-pre-wrap leading-relaxed bg-white/85 dark:bg-black/40 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200">
                                                {entry.validationSummary || entry.error || entry.prompt}
                                            </div>
                                            {entry.actionTaken && (
                                                <div className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/70 p-2.5 rounded-lg font-sans font-medium">
                                                    <ArrowRight
                                                        size={14}
                                                        className="text-amber-600 shrink-0 mt-0.5"
                                                    />
                                                    <div>
                                                        <span className="font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider text-[10px] font-mono mr-1">
                                                            [Next Pipeline Action]
                                                        </span>
                                                        {entry.actionTaken}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isValidation && isSuccess && (
                                        <div className="bg-sage-tint/60 border border-sage-edge rounded-xl p-3.5 text-xs font-sans text-sage-950 space-y-1.5 shadow-2xs">
                                            <div className="flex items-center gap-1.5 font-bold font-mono text-sage-800 uppercase tracking-wider text-[11px]">
                                                <CheckCircle2
                                                    size={13}
                                                    className="text-sage-600 shrink-0"
                                                />
                                                <span>Validation Gate Passed</span>
                                            </div>
                                            <div className="font-sans text-sage-900 text-xs">
                                                {entry.validationSummary || entry.prompt}
                                            </div>
                                            {entry.actionTaken && (
                                                <div className="text-[11px] font-mono text-sage-700 pt-0.5 flex items-center gap-1">
                                                    <ArrowRight
                                                        size={11}
                                                        className="text-sage-600 shrink-0"
                                                    />
                                                    <span>
                                                        <strong>Next Action:</strong> {entry.actionTaken}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!isError && !isValidation && entry.validationSummary && (
                                        <div
                                            className={`p-3 rounded-xl border text-xs font-sans ${
                                                isDelay
                                                    ? 'bg-azure-tint border-azure-edge text-azure-900'
                                                    : 'bg-inset border-edge-strong text-ink-800'
                                            }`}
                                        >
                                            <span className="font-bold uppercase tracking-wider text-[10px] opacity-75 mr-2 font-mono">
                                                [Step Status]
                                            </span>
                                            {entry.validationSummary}
                                        </div>
                                    )}

                                    {entry.errors && entry.errors.length > 0 && (
                                        <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3 text-xs font-sans text-amber-950 space-y-1">
                                            <div className="font-bold flex items-center gap-1 text-[11px] text-amber-900 font-mono">
                                                <AlertTriangle size={13} className="text-amber-700" />
                                                <span>
                                                    Retry History ({entry.errors.length} retry backoff
                                                    event{entry.errors.length > 1 ? 's' : ''}):
                                                </span>
                                            </div>
                                            {entry.errors.map((errItem, eIdx) => {
                                                const normalizedErr =
                                                    typeof errItem === 'string'
                                                        ? { error: errItem }
                                                        : errItem;
                                                return (
                                                    <div
                                                        key={eIdx}
                                                        className="font-mono text-[11px] pl-4 text-amber-800"
                                                    >
                                                        • Attempt #{normalizedErr.attempt || eIdx + 1}{' '}
                                                        [{normalizedErr.timestamp || 'retry'}]:{' '}
                                                        {normalizedErr.error}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {entry.modelUsed && (
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-600 bg-inset p-3 rounded-xl border border-edge-strong font-sans">
                                            <div>
                                                Model:{' '}
                                                <span className="text-ink-900 font-bold font-mono">
                                                    {entry.modelUsed}
                                                </span>
                                            </div>
                                            {entry.modelRole && (
                                                <div>
                                                    Role:{' '}
                                                    <span className="text-gold-ink font-bold uppercase font-mono">
                                                        {entry.modelRole}
                                                    </span>
                                                </div>
                                            )}
                                            {entry.modelSize && (
                                                <div>
                                                    Size Target:{' '}
                                                    <span className="text-gold-ink font-bold uppercase font-mono">
                                                        {entry.modelSize}
                                                    </span>
                                                </div>
                                            )}
                                            {entry.provider && (
                                                <div>
                                                    Provider:{' '}
                                                    <span className="text-ink-800 uppercase font-bold">
                                                        {entry.provider}
                                                    </span>
                                                </div>
                                            )}
                                            {entry.stepTier && (
                                                <div>
                                                    Tier:{' '}
                                                    <span className="text-gold-ink font-bold font-mono">
                                                        {entry.stepTier}
                                                    </span>
                                                </div>
                                            )}
                                            {entry.stepId && (
                                                <div>
                                                    Step:{' '}
                                                    <span className="text-ink-900 font-bold font-mono">
                                                        #{entry.stepId}
                                                        {entry.stepTitle ? ` (${entry.stepTitle})` : ''}
                                                    </span>
                                                </div>
                                            )}
                                            {Boolean(p.maxTokens) && (
                                                <div>
                                                    Max Output:{' '}
                                                    <span className="font-mono font-bold text-ink-800">
                                                        {p.maxTokens?.toLocaleString()} tok
                                                    </span>
                                                </div>
                                            )}
                                            {p.temperature !== undefined && (
                                                <div>
                                                    Temp:{' '}
                                                    <span className="font-mono font-bold text-ink-800">
                                                        {p.temperature}
                                                    </span>
                                                </div>
                                            )}
                                            {p.timeoutSeconds !== undefined &&
                                                p.timeoutSeconds > 0 && (
                                                    <div>
                                                        Timeout:{' '}
                                                        <span className="font-mono font-bold text-ink-800">
                                                            {p.timeoutSeconds}s
                                                        </span>
                                                    </div>
                                                )}
                                            {p.thinking && p.thinking.enabled && (
                                                <div className="text-plum-900 font-medium">
                                                    Thinking:{' '}
                                                    <span className="font-mono font-bold text-plum-800">
                                                        {p.thinking.budget} tok ({p.thinking.effort})
                                                    </span>
                                                </div>
                                            )}
                                            {entry.promptTokens !== null &&
                                                entry.promptTokens !== undefined && (
                                                    <div className="flex items-center gap-1 text-sage-900 font-bold">
                                                        <ArrowUpRight
                                                            size={12}
                                                            className="text-sage-700"
                                                        />
                                                        Sent Tokens:{' '}
                                                        <span className="font-mono text-sage-800">
                                                            {entry.promptTokens.toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            {entry.cachedTokens !== undefined &&
                                                entry.cachedTokens > 0 && (
                                                    <div className="flex items-center gap-1 text-sage-800 font-bold bg-sage-tint px-2 py-0.5 rounded-md border border-sage-edge">
                                                        Cached:{' '}
                                                        <span className="font-mono">
                                                            {entry.cachedTokens.toLocaleString()} (
                                                            {entry.promptTokens && entry.promptTokens > 0
                                                                ? Math.min(
                                                                      100,
                                                                      Math.round(
                                                                          (entry.cachedTokens /
                                                                              entry.promptTokens) *
                                                                              100
                                                                      )
                                                                  )
                                                                : 0}
                                                            %)
                                                        </span>
                                                        {entry.routedProvider && (
                                                            <span className="text-ink-500 font-normal font-sans ml-0.5">
                                                                via {entry.routedProvider}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            {entry.thinkingTokens !== null &&
                                            entry.thinkingTokens !== undefined ? (
                                                <div className="flex items-center gap-1 text-plum-900 font-bold">
                                                    <Brain size={12} className="text-plum-600" />
                                                    Thinking Tokens:{' '}
                                                    <span className="font-mono text-plum-800">
                                                        {entry.thinkingTokens.toLocaleString()}
                                                    </span>
                                                </div>
                                            ) : entry.reasoningTokensUsed !== null &&
                                              entry.reasoningTokensUsed !== undefined ? (
                                                <div className="flex items-center gap-1 text-plum-900 font-bold">
                                                    <Brain size={12} className="text-plum-600" />
                                                    Thinking Tokens:{' '}
                                                    <span className="font-mono text-plum-800">
                                                        {entry.reasoningTokensUsed.toLocaleString()}
                                                    </span>
                                                </div>
                                            ) : null}
                                            {entry.responseTokens !== null &&
                                                entry.responseTokens !== undefined && (
                                                    <div className="flex items-center gap-1 text-blue-900 font-bold">
                                                        <MessageSquare
                                                            size={12}
                                                            className="text-blue-600"
                                                        />
                                                        Response Tokens:{' '}
                                                        <span className="font-mono text-blue-800">
                                                            {entry.responseTokens.toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            {((entry.promptTokens !== null &&
                                                entry.promptTokens !== undefined) ||
                                                (entry.tokensUsed !== null &&
                                                    entry.tokensUsed !== undefined)) && (
                                                <div className="flex items-center gap-1 text-ink-700 font-bold sm:ml-auto">
                                                    <span className="text-ink-500 font-normal">
                                                        Total:
                                                    </span>{' '}
                                                    <span className="font-mono text-ink-900 font-bold">
                                                        {(
                                                            entry.tokensUsed ??
                                                            (entry.promptTokens || 0) +
                                                                (entry.thinkingTokens ||
                                                                    entry.reasoningTokensUsed ||
                                                                    0) +
                                                                (entry.responseTokens || 0)
                                                        ).toLocaleString()}{' '}
                                                        tok
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(entry.response || entry.responseSnippet) && (
                                        <div>
                                            <div className="text-[10px] text-ink-400 font-bold uppercase mb-1 flex items-center justify-between font-mono">
                                                <div className="flex items-center gap-1">
                                                    <CheckCircle2
                                                        size={11}
                                                        className="text-sage-600"
                                                    />{' '}
                                                    Response Output Preview
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        openLogDetailModal('response', entry)
                                                    }
                                                    className="text-[11px] text-blue-700 hover:text-blue-900 flex items-center gap-1 font-sans font-bold hover:underline cursor-pointer"
                                                >
                                                    Pop-up Response Window <Maximize2 size={11} />
                                                </button>
                                            </div>
                                            <div className="text-ink-800 text-xs bg-inset p-3 rounded-xl border border-edge-strong whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar">
                                                {entry.responseSnippet || entry.response}
                                            </div>
                                        </div>
                                    )}

                                    {entry.reasoningText && (
                                        <div>
                                            <div className="text-[10px] text-ink-400 font-bold uppercase mb-1 flex items-center justify-between font-mono">
                                                <div className="flex items-center gap-1">
                                                    <Brain size={11} className="text-gold-ink" />{' '}
                                                    Model Reasoning / Thoughts
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        openLogDetailModal('thinking', entry)
                                                    }
                                                    className="text-[11px] text-plum-700 hover:text-plum-900 flex items-center gap-1 font-sans font-bold hover:underline cursor-pointer"
                                                >
                                                    Pop-up Thinking Window <Maximize2 size={11} />
                                                </button>
                                            </div>
                                            <details className="group bg-inset p-3 rounded-xl border border-edge-strong">
                                                <summary className="text-xs text-ink-600 cursor-pointer select-none outline-none group-open:mb-2 hover:text-ink-900 transition-colors flex items-center gap-1 justify-between font-sans">
                                                    <span>
                                                        Click to expand inline thoughts (
                                                        {entry.reasoningText.split(/\s+/).length}{' '}
                                                        words)
                                                    </span>
                                                    <ChevronDown
                                                        size={14}
                                                        className="transform transition-transform group-open:rotate-180 text-ink-400"
                                                    />
                                                </summary>
                                                <div className="text-ink-700 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar border-t border-edge-strong pt-2 leading-relaxed font-mono">
                                                    {entry.reasoningText}
                                                </div>
                                            </details>
                                        </div>
                                    )}

                                    {!isDelay && (entry.prompt || entry.systemPrompt) && (
                                        <div className="space-y-2 pt-1 border-t border-edge-strong">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] text-ink-400 font-bold uppercase font-mono flex items-center gap-1">
                                                    <ArrowUpRight
                                                        size={11}
                                                        className="text-sage-600"
                                                    />{' '}
                                                    Sent Context &amp; Prompts
                                                    {entry.promptTokens !== null &&
                                                        entry.promptTokens !== undefined && (
                                                            <span className="text-sage-800 font-bold ml-1">
                                                                ({entry.promptTokens.toLocaleString()}{' '}
                                                                tok)
                                                            </span>
                                                        )}
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        openLogDetailModal('prompt', entry)
                                                    }
                                                    className="text-[11px] text-sage-700 hover:text-sage-900 flex items-center gap-1 font-sans font-bold hover:underline cursor-pointer"
                                                >
                                                    Pop-up Prompt Window <Maximize2 size={11} />
                                                </button>
                                            </div>
                                            {entry.finalSystemPrompt &&
                                                entry.finalSystemPrompt !== entry.systemPrompt && (
                                                    <div>
                                                        <div className="text-[10px] text-ink-400 font-bold uppercase mb-1 font-mono">
                                                            Effective System Prompt (With Injected
                                                            Directives)
                                                        </div>
                                                        <div className="text-ink-700 whitespace-pre-wrap max-h-28 overflow-y-auto bg-inset p-3 rounded-xl border border-edge-strong custom-scrollbar text-xs leading-relaxed">
                                                            {entry.finalSystemPrompt}
                                                        </div>
                                                    </div>
                                                )}
                                            {entry.systemPrompt &&
                                                (!entry.finalSystemPrompt ||
                                                    entry.finalSystemPrompt ===
                                                        entry.systemPrompt) && (
                                                    <div>
                                                        <div className="text-[10px] text-ink-400 font-bold uppercase mb-1 font-mono">
                                                            System Prompt
                                                        </div>
                                                        <div className="text-ink-700 whitespace-pre-wrap max-h-28 overflow-y-auto bg-inset p-3 rounded-xl border border-edge-strong custom-scrollbar text-xs leading-relaxed">
                                                            {entry.systemPrompt}
                                                        </div>
                                                    </div>
                                                )}
                                            {entry.prompt && (
                                                <div>
                                                    <div className="text-[10px] text-ink-400 font-bold uppercase mb-1 font-mono">
                                                        User Prompt
                                                    </div>
                                                    <div className="text-ink-800 whitespace-pre-wrap max-h-40 overflow-y-auto bg-inset p-3 rounded-xl border border-edge-strong text-xs custom-scrollbar leading-relaxed">
                                                        {entry.prompt}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
