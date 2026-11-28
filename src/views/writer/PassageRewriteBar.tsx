/**
 * @module views/writer/PassageRewriteBar
 * Sits under the inline editor: select a passage in the text box, say what you want (or nothing),
 * and only that passage is rewritten. The result lands in the draft, not the story, so Save
 * Changes keeps it and Undo Rewrite or Cancel throws it away.
 */

import React, { useState } from 'react';
import { Loader2, RotateCcw, Wand2 } from '@/components';
import type { PassageRewriteRequest, PassageRewriteResult } from '@/pipeline/passageRewrite';
import { countWords } from '@/utils';

export interface PassageRewriteBarProps {
    seqIdx: number;
    sceneIdx: number;
    draft: string;
    setDraft: (text: string) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onRewrite: (request: PassageRewriteRequest) => Promise<PassageRewriteResult>;
    disabled?: boolean;
}

export const PassageRewriteBar: React.FC<PassageRewriteBarProps> = ({
    seqIdx,
    sceneIdx,
    draft,
    setDraft,
    textareaRef,
    onRewrite,
    disabled = false
}) => {
    const [instruction, setInstruction] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    /** The draft before the last rewrite and the draft it produced, for Undo Rewrite. */
    const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);

    const run = async (): Promise<void> => {
        const box = textareaRef.current;
        if (!box || busy) return;
        const start = box.selectionStart ?? 0;
        const end = box.selectionEnd ?? 0;
        setBusy(true);
        setMessage('');
        setIsError(false);
        try {
            const result = await onRewrite({ seqIdx, sceneIdx, text: draft, start, end, instruction });
            if (!result.ok) {
                setIsError(true);
                setMessage(result.problem);
                return;
            }
            setUndo({ before: draft, after: result.text });
            setDraft(result.text);
            setMessage(
                `Rewrote ${countWords(result.original).toLocaleString()} words as ${countWords(result.rewrite).toLocaleString()}. Save Changes keeps it.`
            );
            // Show what changed once the new text is in the box.
            setTimeout(() => {
                const current = textareaRef.current;
                if (!current) return;
                current.focus();
                current.setSelectionRange(result.start, result.end);
            }, 0);
        } finally {
            setBusy(false);
        }
    };

    const canUndo = Boolean(undo && undo.after === draft);

    return (
        <div className="border border-edge rounded-xl bg-inset p-3 space-y-2" data-testid="passage-rewrite-bar">
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void run();
                        }
                    }}
                    maxLength={600}
                    placeholder="Select a passage above, then say how to change it (optional): tenser, shorter, more of her fear..."
                    aria-label="How to rewrite the selected passage"
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 outline-none focus:ring-1 focus:ring-gold-edge"
                />
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void run()}
                        disabled={busy || disabled}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface hover:bg-wash border border-edge-strong text-ink-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        {busy ? 'Rewriting...' : 'Rewrite Selection'}
                    </button>
                    {canUndo && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!undo) return;
                                setDraft(undo.before);
                                setUndo(null);
                                setMessage('Rewrite undone.');
                                setIsError(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-edge-strong text-ink-700 hover:bg-wash flex items-center gap-1.5 cursor-pointer"
                        >
                            <RotateCcw size={12} />
                            Undo Rewrite
                        </button>
                    )}
                </div>
            </div>
            {message && (
                <p className={`text-xs ${isError ? 'text-rose-700' : 'text-ink-500'}`} role="status">
                    {message}
                </p>
            )}
        </div>
    );
};
