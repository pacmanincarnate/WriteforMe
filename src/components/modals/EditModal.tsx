/**
 * @module components/modals/EditModal
 * General-purpose full-height monospace text editor modal with Ctrl/Cmd+Enter confirm shortcut.
 */

import { useEffect, useState } from 'react';
import { Edit3, Save, X } from '@/components/icons';

export interface EditModalProps {
    isOpen: boolean;
    title: string;
    value?: string;
    onConfirm: (nextValue: string) => void;
    onCancel: () => void;
}

export function EditModal({ isOpen, title, value = '', onConfirm, onCancel }: EditModalProps) {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                onConfirm(localValue);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, localValue, onConfirm, onCancel]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onCancel}
        >
            <div
                className="glass-modal w-full max-w-2xl rounded-2xl flex flex-col h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-edge-soft flex justify-between items-center bg-inset">
                    <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
                        <Edit3 size={16} className="text-gold-ink" />
                        Edit: <span className="text-ink-700 font-serif">{title}</span>
                    </h3>
                    <button
                        onClick={onCancel}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-wash transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 p-4 overflow-hidden flex flex-col bg-surface">
                    <textarea
                        className="w-full flex-1 bg-inset text-ink-900 p-4 rounded-xl border border-edge-strong focus:border-gold focus:ring-1 focus:ring-gold outline-none resize-none font-mono text-xs leading-relaxed"
                        value={localValue}
                        onChange={(e) => setLocalValue(e.target.value)}
                        placeholder="Enter text here..."
                        autoFocus
                    />
                    <div className="flex justify-between items-center text-[11px] text-ink-500 mt-2 px-1">
                        <span>Markdown &amp; raw text supported</span>
                        <span className="font-mono text-[10px] text-ink-400">Ctrl+Enter to save</span>
                    </div>
                </div>
                <div className="p-4 border-t border-edge-soft bg-inset flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(localValue)}
                        className="px-5 py-2 rounded-lg text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover shadow-md transition-all flex items-center gap-2"
                    >
                        <Save size={14} />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
