/**
 * @module components/modals/CritiqueModal
 * Displays rendered markdown reviewer critique for a beat or scene validation pass.
 */

import { AlertTriangle, X } from '@/components/icons';
import { parseMarkdown } from '@/utils';

export interface CritiqueModalProps {
    isOpen: boolean;
    beatNumber?: number | string | null;
    critique?: string;
    onClose: () => void;
}

export function CritiqueModal({ isOpen, beatNumber, critique, onClose }: CritiqueModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="glass-modal w-full max-w-xl rounded-2xl flex flex-col max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-edge-soft flex justify-between items-center bg-ember-tint">
                    <h3 className="text-sm font-bold text-ember-950 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-ember-600" />
                        Reviewer Objections:{' '}
                        <span className="font-mono text-xs text-ember-800">
                            {beatNumber ? `Beat ${beatNumber}` : 'Scene Validation'}
                        </span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-surface text-xs text-ink-700 leading-relaxed">
                    <div
                        className="prose max-w-none text-xs text-ink-800"
                        dangerouslySetInnerHTML={{
                            __html: parseMarkdown(critique || 'No critique available.')
                        }}
                    />
                </div>
                <div className="p-4 border-t border-edge-soft bg-inset flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover shadow-sm transition-all"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
}
