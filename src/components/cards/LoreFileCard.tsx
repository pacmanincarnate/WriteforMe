/**
 * @module components/cards/LoreFileCard
 * Memoized card for uploaded document chunks on the Setup screen with debounced editing.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from '@/components/icons';

export interface LoreFileItem {
    id: string;
    name?: string;
    text?: string;
}

export interface LoreFileCardProps {
    file: LoreFileItem;
    onUpdate?: (id: string, nextText: string) => void;
    onRemove?: (id: string) => void;
}

export const LoreFileCard = React.memo(function LoreFileCard({
    file,
    onUpdate,
    onRemove
}: LoreFileCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [localText, setLocalText] = useState(file?.text || '');
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLocalText(file?.text || '');
    }, [file?.text]);

    useEffect(
        () => () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        },
        []
    );

    const charCount = localText.length;
    const wordCount = useMemo(() => {
        const matches = localText.match(/[\w'-]+/g);
        return matches ? matches.length : 0;
    }, [localText]);
    const estTokens = Math.round(charCount / 4);

    const previewSnippet = useMemo(() => {
        const trimmed = localText.trim();
        return trimmed.length > 180 ? trimmed.substring(0, 180) + '…' : trimmed;
    }, [localText]);

    const ext = (file?.name || '').split('.').pop()?.toUpperCase() || '';

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setLocalText(val);

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            onUpdate?.(file.id, val);
        }, 350);
    };

    const handleBlur = () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (localText !== file?.text) {
            onUpdate?.(file.id, localText);
        }
    };

    return (
        <div className="flex flex-col bg-inset border border-edge-strong rounded-xl p-3.5 space-y-2 shadow-2xs transition-all">
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setIsOpen((prev) => !prev)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0 group cursor-pointer"
                    aria-expanded={isOpen}
                >
                    <ChevronDown
                        size={14}
                        className={`text-ink-400 group-hover:text-gold-ink transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180' : ''
                        }`}
                    />
                    <span className="text-xs font-semibold text-ink-900 group-hover:text-gold-ink truncate font-mono">
                        {file.name}
                    </span>
                    {ext && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-edge-strong text-ink-600 font-bold shrink-0">
                            {ext}
                        </span>
                    )}
                    <span className="text-[11px] text-ink-400 font-mono shrink-0 ml-1">
                        ({wordCount.toLocaleString()} words • ~{estTokens.toLocaleString()} tokens)
                    </span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsOpen((prev) => !prev)}
                        className="text-[11px] font-mono text-gold-ink hover:underline px-2 py-0.5 rounded hover:bg-wash cursor-pointer"
                    >
                        {isOpen ? 'Collapse' : 'Edit Text'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onRemove?.(file.id)}
                        className="text-ink-400 hover:text-blush-600 p-1 rounded-md hover:bg-blush-tint transition-colors cursor-pointer"
                        aria-label={`Remove ${file.name}`}
                        title={`Remove ${file.name}`}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {!isOpen && previewSnippet && (
                <p className="text-xs text-ink-500 font-serif italic pl-5 line-clamp-2 leading-relaxed">
                    &quot;{previewSnippet}&quot;
                </p>
            )}

            {isOpen && (
                <div className="pt-1.5 animate-fade-in space-y-1.5">
                    <textarea
                        className="w-full bg-surface border border-edge-strong rounded-lg p-3 h-36 text-xs font-mono text-ink-800 focus:border-gold outline-none resize-y leading-relaxed"
                        aria-label={`Contents of ${file.name}`}
                        value={localText}
                        onChange={handleTextChange}
                        onBlur={handleBlur}
                        placeholder="Lore document contents..."
                    />
                    <div className="flex justify-between items-center text-[10px] text-ink-400 font-mono px-1">
                        <span>Characters: {charCount.toLocaleString()}</span>
                        <span>Auto-saves on pause or blur</span>
                    </div>
                </div>
            )}
        </div>
    );
});
