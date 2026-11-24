/**
 * @module components/cards/LoreCard
 * Memoized World & Archives lore entry card with Act/Scene temporal scoping and inline edits.
 */

import React, { useState } from 'react';
import { Trash2 } from '@/components/icons';
import { EditButton } from '../common/EditButton';

export interface LoreEntryItem {
    topic?: string;
    detail?: string;
    valid_from_act?: number;
    valid_from_scene?: number;
}

export interface LoreActOption {
    number?: number;
    title?: string;
}

export interface LoreSceneOption {
    number?: number;
    title?: string;
}

export interface LoreCardProps {
    lore: LoreEntryItem;
    index: number;
    acts?: LoreActOption[];
    scenesForAct?: LoreSceneOption[];
    onUpdateAct?: (index: number, actNumber: number) => void;
    onUpdateScene?: (index: number, sceneNumber: number) => void;
    onEditTopic?: (topic?: string) => void;
    onEditDetail?: (detail: string) => void;
    onDelete?: (index: number) => void;
}

export const LoreCard = React.memo(function LoreCard({
    lore,
    index,
    acts = [],
    scenesForAct = [],
    onUpdateAct,
    onUpdateScene,
    onEditTopic,
    onEditDetail,
    onDelete
}: LoreCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const detailText = lore?.detail || '';
    const isLong = detailText.length > 240;

    return (
        <div className="bg-surface rounded-2xl border border-edge p-5 transition-all hover:border-gold-edge shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start gap-3">
                <h3 className="font-bold text-base font-serif text-ink-900 flex items-start gap-2 min-w-0 max-w-full">
                    <span className="min-w-0 whitespace-normal break-words">{lore.topic}</span>
                    <EditButton
                        title={`Lore: ${lore.topic}`}
                        value={lore.topic}
                        onSave={() => onEditTopic?.(lore.topic)}
                    />
                </h3>
                <div className="flex items-start gap-2 self-start md:self-auto shrink-0">
                    <div className="flex flex-col gap-1 text-xs bg-inset p-2 rounded-xl border border-edge-strong min-w-[200px]">
                        <div className="flex items-center justify-between gap-2 border-b border-edge-strong pb-1 mb-0.5">
                            <span className="text-ink-400 font-mono font-bold uppercase text-[11px]">
                                Valid Act
                            </span>
                            <select
                                className="bg-transparent text-ink-800 text-xs outline-none text-right cursor-pointer font-medium"
                                value={lore.valid_from_act || 1}
                                onChange={(e) => onUpdateAct?.(index, parseInt(e.target.value, 10))}
                            >
                                {acts.map((a) => (
                                    <option key={a.number} value={a.number}>
                                        Act {a.number}: {a.title ? a.title.substring(0, 20) : ''}...
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-ink-400 font-mono font-bold uppercase text-[11px]">
                                Valid Scene
                            </span>
                            <select
                                className="bg-transparent text-ink-800 text-xs outline-none text-right cursor-pointer font-medium"
                                value={lore.valid_from_scene || 1}
                                onChange={(e) => onUpdateScene?.(index, parseInt(e.target.value, 10))}
                            >
                                {scenesForAct.length === 0 ? (
                                    <option value="1">Scene 1</option>
                                ) : (
                                    scenesForAct.map((s) => (
                                        <option key={s.number} value={s.number}>
                                            Sc {s.number}: {s.title ? s.title.substring(0, 20) : ''}...
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onDelete?.(index)}
                        className="p-2 text-ink-400 hover:text-blush-600 hover:bg-blush-tint rounded-lg transition-colors mt-0.5 cursor-pointer"
                        title="Delete Lore Item"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>

            <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2">
                <div className="flex items-start gap-2">
                    <p className="text-xs text-ink-700 leading-relaxed flex-1 whitespace-pre-wrap font-serif">
                        {isLong && !isExpanded ? `${detailText.substring(0, 240)}…` : detailText}
                    </p>
                    <EditButton
                        title={`Lore Detail: ${lore.topic}`}
                        value={detailText}
                        onSave={() => onEditDetail?.(detailText)}
                    />
                </div>
                {isLong && (
                    <button
                        type="button"
                        onClick={() => setIsExpanded((prev) => !prev)}
                        className="text-[11px] font-mono text-gold-ink hover:underline font-semibold block cursor-pointer"
                    >
                        {isExpanded
                            ? 'Show less'
                            : `Show full text (${detailText.length.toLocaleString()} chars)`}
                    </button>
                )}
            </div>
        </div>
    );
});
