/**
 * @module components/cards/CharacterSheetPanel
 * The author's own character sheet, as imported, folded under the character card. It is kept
 * apart from the persona interview: the sheet is what the author wrote, the interview is what
 * the model writes from it.
 */

import { useState } from 'react';
import { EditButton } from '../common/EditButton';
import { FileText, Minus } from '../icons';
import { parseMarkdown } from '@/utils';

export interface CharacterSheetPanelProps {
    sheet: string;
    onEdit?: () => void;
}

export function CharacterSheetPanel({ sheet, onEdit }: CharacterSheetPanelProps) {
    const [open, setOpen] = useState(false);
    return (
        <div className="pt-2 border-t border-edge-soft">
            <button
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="w-full text-xs font-semibold text-ink-700 hover:text-ink-900 flex items-center justify-center gap-2 py-2.5 bg-mist-50 rounded-xl border border-edge-strong hover:bg-wash transition-colors"
            >
                {open ? <Minus size={12} /> : <FileText size={12} />}
                {open ? 'Hide Character Sheet' : 'Read Character Sheet'}
            </button>
            {open && (
                <div className="mt-3 p-5 bg-inset rounded-xl border border-edge-strong h-80 overflow-y-auto custom-scrollbar animate-fade-in relative">
                    {onEdit && (
                        <div className="flex justify-end mb-2">
                            <EditButton className="p-1.5 min-w-7 min-h-7 shrink-0" title="Character Sheet" value={sheet} onSave={onEdit} />
                        </div>
                    )}
                    <div
                        className="prose max-w-none text-ink-800 text-xs font-serif leading-loose"
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(sheet) }}
                    />
                </div>
            )}
        </div>
    );
}
