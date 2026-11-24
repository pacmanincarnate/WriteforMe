/**
 * @module components/modals/InterventionModal
 * Human-in-the-loop escalation modal displayed after reviewer retry exhaustion.
 */

import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, RotateCcw, Trash2, X } from '@/components/icons';

export interface InterventionModalProps {
    isOpen: boolean;
    tierName: string;
    deviationReasons?: string[];
    rawOutput?: string;
    onResolve: (action: 'abort' | 'retry' | 'accept', editedOutput?: string) => void;
    onCancel: () => void;
}

export function InterventionModal({
    isOpen,
    tierName,
    deviationReasons = [],
    rawOutput = '',
    onResolve,
    onCancel
}: InterventionModalProps) {
    const [editedOutput, setEditedOutput] = useState(rawOutput);
    const [showEditor, setShowEditor] = useState(false);

    useEffect(() => {
        setEditedOutput(rawOutput);
        setShowEditor(false);
    }, [rawOutput, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 animate-fade-in">
            <div className="glass-modal w-full max-w-3xl rounded-2xl flex flex-col h-[90vh] overflow-hidden">
                <div className="p-4 border-b border-blush-edge flex justify-between items-center bg-blush-tint">
                    <h3 className="text-base font-bold text-blush-950 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-ember-600 animate-pulse" />
                        Review Intervention: <span className="text-blush-700 font-mono text-xs">{tierName} Failed</span>
                    </h3>
                    <button
                        onClick={onCancel}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-5 text-sm text-ink-700 bg-surface">
                    <div className="bg-ember-tint border border-ember-edge p-4 rounded-xl">
                        <p className="text-ember-900 font-semibold mb-1 text-xs uppercase tracking-wider">
                            Escalation Threshold Reached
                        </p>
                        <p className="text-xs text-ember-800 leading-relaxed">
                            The generative agent failed to pass the reviewer&apos;s validation after 4 attempts (including model escalation).
                            To maintain narrative integrity, you can review the objections below and choose how to proceed.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-ink-800 mb-2 flex items-center gap-1.5">
                            <AlertCircle size={14} className="text-blush-600" />
                            Reviewer Objections:
                        </h4>
                        <ul className="space-y-2 bg-inset p-4 rounded-xl border border-edge-strong text-xs font-light max-h-48 overflow-y-auto">
                            {deviationReasons && deviationReasons.length > 0 ? (
                                deviationReasons.map((reason, idx) => (
                                    <li
                                        key={idx}
                                        className="flex gap-2 text-ink-800 leading-relaxed border-b border-edge-strong pb-2 last:border-b-0 last:pb-0"
                                    >
                                        <span className="text-blush-600 font-bold">•</span>
                                        <span>{reason}</span>
                                    </li>
                                ))
                            ) : (
                                <li className="text-ink-500 italic">No specific deviation reasons returned.</li>
                            )}
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-ink-800">
                                Generated XML Output
                            </h4>
                            <button
                                onClick={() => setShowEditor(!showEditor)}
                                className="text-xs text-gold-ink hover:underline font-medium flex items-center gap-1"
                            >
                                {showEditor ? 'Hide Editor' : 'Edit XML Manually'}
                            </button>
                        </div>

                        {showEditor ? (
                            <div className="flex flex-col h-72">
                                <textarea
                                    className="w-full flex-1 bg-inset text-ink-900 p-3.5 rounded-xl border border-edge-300 focus:border-gold focus:ring-1 focus:ring-gold outline-none resize-none font-mono text-xs leading-relaxed"
                                    value={editedOutput}
                                    onChange={(e) => setEditedOutput(e.target.value)}
                                    placeholder="Paste or edit XML here..."
                                />
                                <span className="text-[10px] text-ink-500 mt-1 italic font-mono">
                                    Warning: Ensure XML tag structure matches expectations.
                                </span>
                            </div>
                        ) : (
                            <pre className="bg-inset text-ink-800 p-4 rounded-xl border border-edge-strong text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                {editedOutput || 'No output generated.'}
                            </pre>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-edge-soft bg-inset flex justify-between gap-3">
                    <button
                        onClick={() => onResolve('abort')}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-blush-700 hover:bg-blush-tint border border-blush-edge transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={14} />
                        {tierName === 'Writing Agent' ? 'Use Last Draft & Flag Failed' : 'Abort & Rollback'}
                    </button>

                    <div className="flex gap-2.5">
                        <button
                            onClick={() => onResolve('retry')}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-700 hover:bg-wash border border-edge-300 transition-colors flex items-center gap-2"
                        >
                            <RotateCcw size={14} />
                            Force Retry
                        </button>
                        <button
                            onClick={() => onResolve('accept', editedOutput)}
                            className="px-5 py-2 rounded-xl text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover shadow-md transition-all flex items-center gap-2"
                        >
                            <CheckCircle size={14} />
                            {showEditor ? 'Save & Proceed' : 'Proceed Anyway'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
