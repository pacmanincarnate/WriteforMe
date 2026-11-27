/**
 * @module components/common/CollapsibleProse
 * Rendered markdown that folds to a few lines once it is long. Used for story text that keeps
 * growing as the book is written (the running synopsis, the concept), so it cannot push the rest
 * of a page off a phone screen.
 */

import React, { useState } from 'react';

/** Rendered HTML longer than this many characters starts folded. */
export const COLLAPSE_AFTER_CHARS = 700;

export interface CollapsibleProseProps {
    /** Sanitised HTML, as returned by `parseMarkdown`. */
    html: string;
    className?: string;
}

export function CollapsibleProse({ html, className = '' }: CollapsibleProseProps) {
    const [isOpen, setIsOpen] = useState(false);
    const isLong = html.length > COLLAPSE_AFTER_CHARS;

    return (
        <div>
            <div
                className={`${className} ${isLong && !isOpen ? 'max-h-44 overflow-hidden' : ''}`}
                dangerouslySetInnerHTML={{ __html: html }}
            />
            {isLong && (
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-expanded={isOpen}
                    className="mt-1 min-h-[44px] sm:min-h-0 text-xs font-bold text-gold-ink hover:underline cursor-pointer"
                >
                    {isOpen ? 'Show less' : 'Show all'}
                </button>
            )}
        </div>
    );
}
