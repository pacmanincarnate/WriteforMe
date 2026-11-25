/**
 * @module components/modals/IconPickerModal
 * Icon selection modal for custom narrative mode lenses.
 */

import React from 'react';
import { Icon, Sparkles, X } from '@/components/icons';
import { AVAILABLE_ICONS } from '@/config';

export interface IconPickerModalProps {
    isIconPickerOpen: boolean;
    setIsIconPickerOpen: (open: boolean) => void;
    newModeIcon: string;
    setNewModeIcon: (icon: string) => void;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
    isIconPickerOpen,
    setIsIconPickerOpen,
    newModeIcon,
    setNewModeIcon
}) => {
    if (!isIconPickerOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface border border-edge-strong w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-edge-strong flex justify-between items-center bg-mist-50/80">
                    <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2 font-serif">
                        <Sparkles size={16} className="text-gold-ink" />
                        Select Mode Icon
                    </h3>
                    <button
                        onClick={() => setIsIconPickerOpen(false)}
                        className="text-ink-400 hover:text-ink-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-9 gap-2">
                        {AVAILABLE_ICONS.map((ico) => {
                            const isSelected = newModeIcon === ico.value;
                            return (
                                <button
                                    key={ico.value}
                                    type="button"
                                    onClick={() => {
                                        setNewModeIcon(ico.value);
                                        setIsIconPickerOpen(false);
                                    }}
                                    title={ico.label}
                                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                        isSelected
                                            ? 'bg-btn text-btn-ink scale-110 shadow-sm border border-[#1C1917]'
                                            : 'bg-inset hover:bg-wash text-ink-600 hover:text-ink-900 hover:scale-105 border border-edge-strong'
                                    }`}
                                >
                                    <Icon name={ico.value} className="w-4 h-4" />
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-4 text-center">
                        <p className="text-[10px] text-ink-500 font-medium font-mono">
                            Currently selected:{' '}
                            <span className="text-gold-ink font-bold">
                                {AVAILABLE_ICONS.find((ico) => ico.value === newModeIcon)?.label || newModeIcon}
                            </span>
                        </p>
                    </div>
                </div>
                <div className="p-3.5 border-t border-edge-strong bg-mist-50/80 flex justify-end">
                    <button
                        onClick={() => setIsIconPickerOpen(false)}
                        className="px-4 py-1.5 rounded-xl bg-surface hover:bg-wash border border-edge-strong text-ink-700 text-xs font-bold transition-all shadow-2xs"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
