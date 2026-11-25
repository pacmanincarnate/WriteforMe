/**
 * @module components/modals/GesmPropositionModal
 * Modal dialog for creating or editing a GESM epistemic proposition.
 */

import React from 'react';
import { Share2, X } from '@/components/icons';

export interface GesmPropositionModalState {
    isOpen: boolean;
    isNew?: boolean;
    id: string;
    claim_text: string;
    subject_id: string;
    predicate: string;
    object_id: string;
    objective_truth: string;
    world_valid_from_scene: string;
    world_valid_to_scene?: string;
    [key: string]: unknown;
}

export interface GesmPropositionModalProps {
    editingPropModal: GesmPropositionModalState;
    setEditingPropModal: React.Dispatch<React.SetStateAction<GesmPropositionModalState>>;
    handleSaveProposition: (modalState: GesmPropositionModalState) => void;
}

export const GesmPropositionModal: React.FC<GesmPropositionModalProps> = ({
    editingPropModal,
    setEditingPropModal,
    handleSaveProposition
}) => {
    if (!editingPropModal.isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface border border-edge-strong w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-edge-strong flex justify-between items-center bg-mist-50/80">
                    <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2 font-serif">
                        <Share2 size={16} className="text-gold-ink" />
                        {editingPropModal.isNew ? 'New Epistemic Proposition' : 'Edit Epistemic Proposition'}
                    </h3>
                    <button
                        onClick={() => setEditingPropModal((prev) => ({ ...prev, isOpen: false }))}
                        className="text-ink-400 hover:text-ink-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-1">
                        <label className="text-xs font-mono uppercase text-ink-600 font-bold">Proposition ID</label>
                        <input
                            type="text"
                            value={editingPropModal.id}
                            onChange={(e) => setEditingPropModal((prev) => ({ ...prev, id: e.target.value }))}
                            placeholder="prop_vance_forged_letter"
                            className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-3 py-2 text-ink-900 focus:outline-none focus:border-gold-ink"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-mono uppercase text-ink-600 font-bold">Claim Text</label>
                        <textarea
                            rows={3}
                            value={editingPropModal.claim_text}
                            onChange={(e) => setEditingPropModal((prev) => ({ ...prev, claim_text: e.target.value }))}
                            placeholder="State the atomic claim clearly..."
                            className="w-full text-xs font-serif bg-inset border border-edge rounded-lg px-3 py-2 text-ink-900 focus:outline-none focus:border-gold-ink"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">Subject</label>
                            <input
                                type="text"
                                value={editingPropModal.subject_id}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({ ...prev, subject_id: e.target.value }))
                                }
                                placeholder="char_vance"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">Predicate</label>
                            <input
                                type="text"
                                value={editingPropModal.predicate}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({ ...prev, predicate: e.target.value }))
                                }
                                placeholder="FORGED"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">Object</label>
                            <input
                                type="text"
                                value={editingPropModal.object_id}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({ ...prev, object_id: e.target.value }))
                                }
                                placeholder="royal_decree"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">
                                Objective Truth
                            </label>
                            <select
                                value={editingPropModal.objective_truth}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({ ...prev, objective_truth: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                <option value="TRUE">TRUE</option>
                                <option value="FALSE">FALSE</option>
                                <option value="UNRESOLVED">UNRESOLVED</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">Valid From</label>
                            <input
                                type="text"
                                value={editingPropModal.world_valid_from_scene}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({
                                        ...prev,
                                        world_valid_from_scene: e.target.value
                                    }))
                                }
                                placeholder="0.0"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-500 font-bold">
                                Valid To (Optional)
                            </label>
                            <input
                                type="text"
                                value={editingPropModal.world_valid_to_scene || ''}
                                onChange={(e) =>
                                    setEditingPropModal((prev) => ({ ...prev, world_valid_to_scene: e.target.value }))
                                }
                                placeholder="leave blank"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                    </div>
                </div>
                <div className="p-3.5 border-t border-edge-strong bg-mist-50/80 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setEditingPropModal((prev) => ({ ...prev, isOpen: false }))}
                        className="px-4 py-1.5 rounded-xl bg-surface hover:bg-wash border border-edge-strong text-ink-700 text-xs font-bold transition-all shadow-2xs"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSaveProposition(editingPropModal)}
                        className="px-4 py-1.5 rounded-xl bg-btn text-btn-ink hover:opacity-90 text-xs font-bold transition-all shadow-2xs"
                    >
                        Save Proposition
                    </button>
                </div>
            </div>
        </div>
    );
};
