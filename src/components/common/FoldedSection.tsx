/**
 * @module components/common/FoldedSection
 * A card that starts as one row: its name and a one-line summary of what is inside. Opening the
 * row shows the full section. Used where a page holds many sections that each keep growing, so
 * the page stays a short list on a phone however long the story gets.
 */

import React from 'react';
import { ChevronDown } from '@/components/icons';

export interface FoldedSectionProps {
    title: string;
    /** One line shown under the title while the section is closed. */
    summary?: string;
    defaultOpen?: boolean;
    className?: string;
    children: React.ReactNode;
}

export function FoldedSection({
    title,
    summary,
    defaultOpen = false,
    className = '',
    children
}: FoldedSectionProps) {
    // Summaries are often the first line of stored markdown; show the words, not the marks.
    const summaryLine = summary
        ?.replace(/[*_#>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return (
        <details
            open={defaultOpen}
            className={`group bg-surface rounded-2xl border border-edge shadow-sm ${className}`}
        >
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[64px] px-5 sm:px-8 py-3 flex items-center gap-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-ink-900">{title}</span>
                    {summaryLine && (
                        <span className="block text-[13px] text-ink-500 truncate group-open:hidden">
                            {summaryLine}
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="px-5 sm:px-8 pb-6 sm:pb-8 space-y-5">{children}</div>
        </details>
    );
}
