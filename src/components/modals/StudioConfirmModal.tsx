/**
 * @module components/modals/StudioConfirmModal
 * Accessible editorial confirmation modal supporting danger, warning, and optional secondary action.
 */

import { useEffect } from 'react';
import { AlertTriangle, X } from '@/components/icons';

export interface StudioConfirmModalProps {
    isOpen: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    secondaryLabel?: string | null;
    danger?: boolean;
    warning?: boolean;
    onConfirm?: () => void;
    onSecondary?: () => void;
    onCancel?: () => void;
}

export function StudioConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    secondaryLabel = null,
    danger = false,
    warning = false,
    onConfirm,
    onSecondary,
    onCancel
}: StudioConfirmModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (onCancel) onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (onConfirm) onConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onConfirm, onCancel]);

    if (!isOpen) return null;

    return (
        <div
            className="studio-confirm-modal fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/40 backdrop-blur-md p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
        >
            <div className="glass-modal w-full max-w-md rounded-2xl p-6 shadow-2xl border border-edge/60 bg-surface/98 flex flex-col space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h3 className="text-lg font-serif font-bold text-ink-900 tracking-tight flex items-center gap-2">
                            {danger ? (
                                <AlertTriangle size={18} className="text-crimson-600 shrink-0" />
                            ) : warning ? (
                                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                            ) : null}
                            {title}
                        </h3>
                        {message && (
                            <div className="text-xs text-ink-600 leading-relaxed font-sans whitespace-pre-line pt-1">
                                {message}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-wash transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="flex flex-wrap justify-end items-center gap-2 pt-2 border-t border-edge-subtle/50">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    {secondaryLabel && onSecondary && (
                        <button
                            type="button"
                            onClick={onSecondary}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-800 bg-surface hover:bg-wash border border-edge-strong transition-colors shadow-2xs"
                        >
                            {secondaryLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ${
                            danger
                                ? 'text-white bg-crimson-600 hover:bg-crimson-700 active:scale-95'
                                : 'text-btn-ink bg-btn hover:bg-btn-hover active:scale-95'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
