/**
 * @module components/modals/LogDetailModal
 * Multi-tab Author's Log inspector modal (verbose dossier, sent prompts, reasoning trace, response).
 */

import { useEffect, useState } from 'react';
import { ArrowUpRight, Brain, Copy, Download, FileText, Layers, MessageSquare, X } from '@/components/icons';
import { formatVerboseLogEntry, type VerboseLogEntry } from '@/domain/story';
import { copyVerboseLogToClipboard, downloadVerboseLogFile } from '@/services/browser';

export type LogDetailTab = 'verbose' | 'prompt' | 'thinking' | 'response';

export interface LogDetailModalEntry extends VerboseLogEntry {
    responseSnippet?: string;
}

export interface LogDetailModalProps {
    isOpen: boolean;
    type?: LogDetailTab | string;
    title?: string;
    functionName?: string;
    timestamp?: string;
    model?: string;
    tokens?: number | null;
    content?: string;
    entry?: LogDetailModalEntry | null;
    onClose: () => void;
    showToast?: (message: string, type?: string) => void;
}

export function LogDetailModal({
    isOpen,
    type,
    title,
    functionName,
    timestamp,
    model,
    tokens,
    content,
    entry,
    onClose,
    showToast
}: LogDetailModalProps) {
    const [activeTab, setActiveTab] = useState<string>(type || 'verbose');

    useEffect(() => {
        if (isOpen) {
            setActiveTab(type || 'verbose');
        }
    }, [isOpen, type]);

    if (!isOpen) return null;

    const getTabContent = (tabKey: string): string => {
        if (tabKey === 'verbose') {
            return entry
                ? formatVerboseLogEntry(entry)
                : type === 'verbose'
                  ? content || ''
                  : formatVerboseLogEntry({
                        function: functionName,
                        timestamp,
                        modelUsed: model,
                        response: content,
                        validationSummary: title
                    });
        }
        if (tabKey === 'prompt') {
            if (entry) {
                let p = '';
                if (entry.finalSystemPrompt && entry.finalSystemPrompt.trim()) {
                    p += `=== SYSTEM PROMPT (Final With Directives) ===\n\n${entry.finalSystemPrompt.trim()}\n\n`;
                } else if (entry.systemPrompt && entry.systemPrompt.trim()) {
                    p += `=== SYSTEM PROMPT ===\n\n${entry.systemPrompt.trim()}\n\n`;
                }
                if (entry.prompt && entry.prompt.trim()) {
                    p += `=== USER PROMPT & INPUT DATA ===\n\n${entry.prompt.trim()}`;
                }
                return p || '(No prompt context recorded for this step.)';
            }
            return type === 'prompt' ? content || '' : '(No prompt context recorded for this step.)';
        }
        if (tabKey === 'thinking') {
            return (
                entry?.reasoningText ||
                (type === 'thinking'
                    ? content || ''
                    : '(No internal thinking/reasoning trace was returned for this prompt execution.)')
            );
        }
        if (tabKey === 'response') {
            return (
                entry?.response ||
                entry?.responseSnippet ||
                (type === 'response' ? content || '' : '(No response output recorded.)')
            );
        }
        return content || '';
    };

    const displayContent = getTabContent(activeTab);
    const isVerbose = activeTab === 'verbose';
    const isThinking = activeTab === 'thinking';
    const isPrompt = activeTab === 'prompt';
    const charCount = (displayContent || '').length;
    const wordCount = (displayContent || '').trim() ? (displayContent || '').trim().split(/\s+/).length : 0;

    const handleCopyCurrent = () => {
        if (displayContent) {
            const label = isVerbose
                ? 'verbose dossier'
                : isThinking
                  ? 'thinking trace'
                  : isPrompt
                    ? 'sent prompt context'
                    : 'response';
            copyVerboseLogToClipboard(displayContent, showToast, `Copied ${label} to clipboard!`);
        }
    };

    const handleCopyVerboseAll = () => {
        const verboseText = entry
            ? formatVerboseLogEntry(entry)
            : type === 'verbose'
              ? content || ''
              : formatVerboseLogEntry({
                    function: functionName,
                    timestamp,
                    modelUsed: model,
                    response: content,
                    validationSummary: title
                });
        copyVerboseLogToClipboard(
            verboseText,
            showToast,
            `Copied full verbose dossier for "${functionName || 'step'}"!`
        );
    };

    const handleExportSingle = () => {
        const verboseText = entry ? formatVerboseLogEntry(entry) : displayContent;
        const safeName = (functionName || 'step').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
        downloadVerboseLogFile(
            `ellipsis_log_${safeName}_${Date.now()}.txt`,
            verboseText,
            'text/plain;charset=utf-8'
        );
        if (showToast) showToast(`Exported verbose log for "${functionName || 'step'}"`, 'success');
    };

    const getHeaderTheme = () => {
        if (isVerbose) return 'bg-gold-tint border-gold-edge text-gold-ink';
        if (isThinking) return 'bg-plum-tint border-plum-edge text-plum-950';
        if (isPrompt) return 'bg-sage-tint border-sage-edge text-sage-950';
        return 'bg-azure-tint border-azure-edge text-blue-950';
    };

    const params = (entry?.parameters || {}) as Record<string, unknown>;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="glass-modal w-full max-w-5xl rounded-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden bg-surface border border-edge-strong"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className={`p-4 sm:p-5 border-b border-edge-strong flex flex-wrap justify-between items-center gap-3 ${getHeaderTheme()}`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className={`p-2.5 rounded-xl border shrink-0 ${
                                isVerbose
                                    ? 'bg-gold-tint-strong border-gold-edge text-gold-ink'
                                    : isThinking
                                      ? 'bg-plum-tint-strong border-plum-edge text-plum-700'
                                      : isPrompt
                                        ? 'bg-sage-tint-strong border-sage-edge text-sage-800'
                                        : 'bg-blue-100 border-azure-edge text-blue-700'
                            }`}
                        >
                            {isVerbose ? (
                                <FileText size={20} />
                            ) : isThinking ? (
                                <Brain size={20} />
                            ) : isPrompt ? (
                                <ArrowUpRight size={20} />
                            ) : (
                                <MessageSquare size={20} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-bold font-serif truncate">
                                    {isVerbose ? 'Complete Verbose Dossier' : title || 'Pipeline Step Inspector'}
                                </h3>
                                {(entry?.stepTier || entry?.stepId) && (
                                    <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-gold-tint text-gold-ink border border-gold-edge flex items-center gap-1 shrink-0">
                                        <Layers size={11} className="text-gold-ink" />
                                        {entry.stepTier || `Step ${entry.stepId}`}
                                        {entry.stepId && <span className="opacity-70 font-normal">#{entry.stepId}</span>}
                                    </span>
                                )}
                                <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-mist-200/90 text-ink-800 border border-edge-300 shrink-0">
                                    {functionName || 'AI Step'}
                                </span>
                                {entry?.stepTitle && (
                                    <span className="text-xs text-ink-500 font-sans italic truncate">
                                        {entry.stepTitle}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-600 mt-1 font-mono">
                                {timestamp && <span>🕒 {timestamp}</span>}
                                {entry?.provider && <span>🏢 {entry.provider.toUpperCase()}</span>}
                                {model && <span>🤖 {model}</span>}
                                {params.maxTokens !== undefined && params.maxTokens !== null && (
                                    <span>📦 Max: {String(params.maxTokens)} tok</span>
                                )}
                                {tokens !== null && tokens !== undefined && (
                                    <span
                                        className={`font-bold px-2 py-0.5 rounded border ${
                                            isVerbose
                                                ? 'bg-gold-tint-strong text-gold-ink border-gold-edge'
                                                : isThinking
                                                  ? 'bg-plum-tint-strong text-plum-800 border-plum-edge'
                                                  : isPrompt
                                                    ? 'bg-sage-tint-strong text-sage-800 border-sage-edge'
                                                    : 'bg-blue-100 text-blue-800 border-blue-300'
                                        }`}
                                    >
                                        {isVerbose
                                            ? 'Total'
                                            : isThinking
                                              ? 'Thinking'
                                              : isPrompt
                                                ? 'Sent'
                                                : 'Response'}{' '}
                                        Tokens: {tokens.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleCopyCurrent}
                            className="px-3 py-1.5 rounded-xl bg-surface hover:bg-wash border border-edge-300 text-ink-700 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                            title="Copy visible text"
                        >
                            <Copy size={13} /> Copy Tab
                        </button>
                        <button
                            onClick={handleCopyVerboseAll}
                            className="px-3 py-1.5 rounded-xl bg-gold-tint hover:bg-gold/25 border border-gold-edge text-gold-ink text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                            title="Copy full verbose dossier (all context, parameters, and responses)"
                        >
                            <Copy size={13} /> Copy Verbose Log
                        </button>
                        <button
                            onClick={handleExportSingle}
                            className="p-1.5 text-ink-600 hover:text-ink-900 bg-surface hover:bg-wash rounded-xl border border-edge-300 transition-colors cursor-pointer"
                            title="Export full log as .txt"
                        >
                            <Download size={15} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-ink-400 hover:text-ink-800 hover:bg-wash rounded-xl transition-colors cursor-pointer ml-1"
                            title="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2 bg-surface border-b border-edge-strong overflow-x-auto text-xs font-sans">
                    <button
                        onClick={() => setActiveTab('verbose')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            activeTab === 'verbose'
                                ? 'bg-gold-tint text-gold-ink border border-gold-edge shadow-2xs'
                                : 'text-ink-600 hover:text-ink-900 hover:bg-lift'
                        }`}
                    >
                        <FileText size={13} />
                        <span>Full Dossier &amp; Parameters</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('prompt')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            activeTab === 'prompt'
                                ? 'bg-sage-tint text-sage-900 border border-sage-edge shadow-2xs'
                                : 'text-ink-600 hover:text-ink-900 hover:bg-lift'
                        }`}
                    >
                        <ArrowUpRight size={13} />
                        <span>Sent Context &amp; Prompts</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('thinking')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            activeTab === 'thinking'
                                ? 'bg-plum-tint text-plum-900 border border-plum-edge shadow-2xs'
                                : 'text-ink-600 hover:text-ink-900 hover:bg-lift'
                        }`}
                    >
                        <Brain size={13} />
                        <span>Thinking Trace</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('response')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            activeTab === 'response'
                                ? 'bg-azure-tint text-blue-900 border border-azure-edge shadow-2xs'
                                : 'text-ink-600 hover:text-ink-900 hover:bg-lift'
                        }`}
                    >
                        <MessageSquare size={13} />
                        <span>AI Response Output</span>
                    </button>
                </div>

                <div className="flex-1 p-5 sm:p-6 overflow-y-auto font-mono text-xs text-ink-800 whitespace-pre-wrap bg-inset leading-relaxed custom-scrollbar border-b border-edge-strong select-text">
                    {displayContent}
                </div>

                <div className="p-3.5 sm:p-4 bg-mist-50 border-t border-edge-strong flex flex-wrap justify-between items-center gap-3 text-xs text-ink-500 font-mono">
                    <div className="flex items-center gap-4">
                        <span>
                            Words: <strong className="text-ink-800">{wordCount.toLocaleString()}</strong>
                        </span>
                        <span>
                            Characters: <strong className="text-ink-800">{charCount.toLocaleString()}</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopyCurrent}
                            className="px-3.5 py-1.5 rounded-xl bg-surface hover:bg-wash border border-edge-300 text-ink-700 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 font-sans cursor-pointer"
                        >
                            <Copy size={13} /> Copy Tab
                        </button>
                        <button
                            onClick={handleCopyVerboseAll}
                            className="px-4 py-1.5 rounded-xl bg-gold-tint hover:bg-gold/25 border border-gold-edge text-gold-ink text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 font-sans cursor-pointer"
                        >
                            <Copy size={13} /> Copy Verbose Log
                        </button>
                        <button
                            onClick={onClose}
                            className="px-5 py-1.5 rounded-xl text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover shadow-sm transition-all font-sans cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
