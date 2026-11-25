/**
 * @module components/modals/GesmBeliefModal
 * Modal dialog for creating or editing a GESM character belief edge.
 */

import React from 'react';
import { User, X } from '@/components/icons';
import type { Story } from '@/types';

export interface GesmBeliefModalState {
    isOpen: boolean;
    isNew?: boolean;
    holder_id: string;
    proposition_id: string;
    stance: string;
    confidence: number;
    source_type: string;
    source_agent_id?: string;
    acquired_at_scene: string;
    invalidated_at_scene?: string;
    [key: string]: unknown;
}

export interface GesmPropositionListEntry {
    id: string;
    claim_text?: string;
}

export interface GesmBeliefModalProps {
    editingBeliefModal: GesmBeliefModalState;
    setEditingBeliefModal: React.Dispatch<React.SetStateAction<GesmBeliefModalState>>;
    handleSaveBelief: (modalState: GesmBeliefModalState) => void;
    story: Story;
}

export const GesmBeliefModal: React.FC<GesmBeliefModalProps> = ({
    editingBeliefModal,
    setEditingBeliefModal,
    handleSaveBelief,
    story
}) => {
    if (!editingBeliefModal.isOpen) return null;

    const rawProps = story.epistemic_graph?.propositions;
    const propositionsList: GesmPropositionListEntry[] = Array.isArray(rawProps)
        ? (rawProps as GesmPropositionListEntry[])
        : (Object.values(rawProps || {}) as GesmPropositionListEntry[]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface border border-edge-strong w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-edge-strong flex justify-between items-center bg-mist-50/80">
                    <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2 font-serif">
                        <User size={16} className="text-gold-ink" />
                        {editingBeliefModal.isNew ? 'Add Character Belief Edge' : 'Edit Character Belief Edge'}
                    </h3>
                    <button
                        onClick={() => setEditingBeliefModal((prev) => ({ ...prev, isOpen: false }))}
                        className="text-ink-400 hover:text-ink-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Holder Agent
                            </label>
                            <select
                                value={editingBeliefModal.holder_id}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({ ...prev, holder_id: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                <option value="meta_reader">Reader (Dramatic Irony)</option>
                                {(story.cast || []).map((c) => (
                                    <option key={c.id || c.name} value={c.id || c.name}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Proposition
                            </label>
                            <select
                                value={editingBeliefModal.proposition_id}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({ ...prev, proposition_id: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                {propositionsList.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.id}: {String(p.claim_text || '').slice(0, 40)}...
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Epistemic Stance
                            </label>
                            <select
                                value={editingBeliefModal.stance}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({ ...prev, stance: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                <option value="BELIEVES_TRUE">BELIEVES_TRUE (Firm Conviction)</option>
                                <option value="SUSPECTS_TRUE">SUSPECTS_TRUE (Leaning / Gut Feeling)</option>
                                <option value="DOUBTS">DOUBTS (Questioning / Hesitant)</option>
                                <option value="BELIEVES_FALSE">BELIEVES_FALSE (Firm Rejection / Deceived)</option>
                                <option value="UNAWARE">UNAWARE (Invalidate / Blind)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Confidence: {Math.round(editingBeliefModal.confidence * 100)}%
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={editingBeliefModal.confidence}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({
                                        ...prev,
                                        confidence: parseFloat(e.target.value)
                                    }))
                                }
                                className="w-full accent-gold-ink cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Source Type
                            </label>
                            <select
                                value={editingBeliefModal.source_type}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({ ...prev, source_type: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                <option value="DIRECT_OBSERVATION">DIRECT_OBSERVATION (Witnessed directly)</option>
                                <option value="TOLD_BY_AGENT">TOLD_BY_AGENT (Hearsay / Confession)</option>
                                <option value="INFERRED">INFERRED (Deduction / Clues)</option>
                                <option value="CORE_LIE">CORE_LIE (Psychological Trauma Anchor)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Source Agent (if told)
                            </label>
                            <select
                                value={editingBeliefModal.source_agent_id || ''}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({ ...prev, source_agent_id: e.target.value }))
                                }
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            >
                                <option value="">None / Direct</option>
                                {(story.cast || []).map((c) => (
                                    <option key={c.id || c.name} value={c.id || c.name}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Acquired At Scene
                            </label>
                            <input
                                type="text"
                                value={editingBeliefModal.acquired_at_scene}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({
                                        ...prev,
                                        acquired_at_scene: e.target.value
                                    }))
                                }
                                placeholder="1.1"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-ink-600 font-bold">
                                Invalidated At (Optional)
                            </label>
                            <input
                                type="text"
                                value={editingBeliefModal.invalidated_at_scene || ''}
                                onChange={(e) =>
                                    setEditingBeliefModal((prev) => ({
                                        ...prev,
                                        invalidated_at_scene: e.target.value
                                    }))
                                }
                                placeholder="leave blank if active"
                                className="w-full text-xs font-mono bg-inset border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                            />
                        </div>
                    </div>
                </div>
                <div className="p-3.5 border-t border-edge-strong bg-mist-50/80 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setEditingBeliefModal((prev) => ({ ...prev, isOpen: false }))}
                        className="px-4 py-1.5 rounded-xl bg-surface hover:bg-wash border border-edge-strong text-ink-700 text-xs font-bold transition-all shadow-2xs"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSaveBelief(editingBeliefModal)}
                        className="px-4 py-1.5 rounded-xl bg-btn text-btn-ink hover:opacity-90 text-xs font-bold transition-all shadow-2xs"
                    >
                        Save Belief Edge
                    </button>
                </div>
            </div>
        </div>
    );
};
