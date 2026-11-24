/**
 * @module components/modals/StudioFormModal
 * Config-driven multi-field modal form supporting text/number inputs, textareas, and selects.
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Plus, X } from '@/components/icons';

export type StudioFormFieldOption = string | { value: string; label: string };

export interface StudioFormField {
    key: string;
    label: string;
    type?: 'text' | 'textarea' | 'select' | string;
    defaultValue?: string;
    placeholder?: string;
    required?: boolean;
    rows?: number;
    helpText?: string;
    options?: StudioFormFieldOption[];
}

export interface StudioFormModalProps {
    isOpen: boolean;
    title: string;
    subtitle?: string;
    fields?: StudioFormField[];
    submitLabel?: string;
    cancelLabel?: string;
    onSubmit?: (values: Record<string, string>) => void;
    onCancel?: () => void;
}

export function StudioFormModal({
    isOpen,
    title,
    subtitle,
    fields = [],
    submitLabel = 'Save',
    cancelLabel = 'Cancel',
    onSubmit,
    onCancel
}: StudioFormModalProps) {
    const [values, setValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!isOpen) return;
        const initial: Record<string, string> = {};
        fields.forEach((f) => {
            initial[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
        });
        setValues(initial);
    }, [isOpen, fields]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const targetTag = (e.target as HTMLElement | null)?.tagName;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (onCancel) onCancel();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || targetTag !== 'TEXTAREA')) {
                e.preventDefault();
                if (onSubmit) onSubmit(values);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, values, onSubmit, onCancel]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (onSubmit) onSubmit(values);
    };

    const handleChange = (key: string, val: string) => {
        setValues((prev) => ({ ...prev, [key]: val }));
    };

    return (
        <div
            className="studio-form-modal fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/40 backdrop-blur-md p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
        >
            <form
                onSubmit={handleSubmit}
                className="glass-modal w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-edge/60 bg-surface/98 flex flex-col max-h-[90vh]"
            >
                <div className="p-5 border-b border-edge-subtle flex justify-between items-start bg-surface-elevated/40">
                    <div>
                        <h3 className="text-xl font-serif font-bold text-ink-900 tracking-tight">{title}</h3>
                        {subtitle && (
                            <p className="text-xs text-ink-500 font-sans mt-0.5 leading-relaxed">{subtitle}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-wash transition-colors"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                    {fields.map((f, idx) => {
                        const currentVal = values[f.key] !== undefined ? values[f.key] : '';
                        return (
                            <div key={f.key || idx} className="space-y-1.5">
                                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
                                    {f.label}
                                    {f.required && <span className="text-crimson-500 ml-1">*</span>}
                                </label>
                                {f.type === 'textarea' ? (
                                    <textarea
                                        rows={f.rows || 3}
                                        value={currentVal}
                                        placeholder={f.placeholder || ''}
                                        required={f.required}
                                        onChange={(e) => handleChange(f.key, e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-edge-subtle bg-canvas/60 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all font-sans placeholder:text-ink-400"
                                    />
                                ) : f.type === 'select' ? (
                                    <select
                                        value={currentVal}
                                        required={f.required}
                                        onChange={(e) => handleChange(f.key, e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-edge-subtle bg-canvas/60 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all font-sans cursor-pointer"
                                    >
                                        {(f.options || []).map((opt, oIdx) => {
                                            const val = typeof opt === 'object' ? opt.value : opt;
                                            const lbl = typeof opt === 'object' ? opt.label : opt;
                                            return (
                                                <option key={oIdx} value={val}>
                                                    {lbl}
                                                </option>
                                            );
                                        })}
                                    </select>
                                ) : (
                                    <input
                                        type={f.type || 'text'}
                                        value={currentVal}
                                        placeholder={f.placeholder || ''}
                                        required={f.required}
                                        autoFocus={idx === 0}
                                        onChange={(e) => handleChange(f.key, e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-edge-subtle bg-canvas/60 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all font-sans placeholder:text-ink-400"
                                    />
                                )}
                                {f.helpText && <p className="text-[11px] text-ink-400 mt-1">{f.helpText}</p>}
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-edge-subtle bg-inset/40 flex justify-end items-center gap-2.5">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="submit"
                        className="px-5 py-2 rounded-xl text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        <Plus size={14} />
                        {submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
