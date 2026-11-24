/**
 * @module components/common/EditButton
 * Compact pencil edit trigger used inline next to editable headings and metadata badges.
 */

import { Edit3 } from '@/components/icons';

export interface EditButtonProps {
    title: string;
    value?: unknown;
    onSave?: () => void;
    className?: string;
}

export function EditButton({ title, onSave, className = '' }: EditButtonProps) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (onSave) onSave();
            }}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors text-ink-400 hover:text-ember-800 hover:bg-ember-tint-strong ${className}`}
            title={`Edit ${title}`}
        >
            <Edit3 size={11} />
        </button>
    );
}
