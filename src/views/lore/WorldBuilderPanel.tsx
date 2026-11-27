/**
 * @module views/lore/WorldBuilderPanel
 * "Build a world from a pitch" on the Lore page. The author writes a few sentences and picks a
 * size; the world is written in three checked parts and arrives as lore proposals to approve.
 */

import React, { useState } from 'react';
import { WORLD_PITCH_MAX_CHARS, WORLD_SIZES, type WorldSize } from '@/domain/lore';
import type { WorldBuildRequest, WorldBuildResult } from '@/pipeline/worldBuilder';

export interface WorldBuilderPanelProps {
    buildWorld: (request: WorldBuildRequest) => Promise<WorldBuildResult>;
    showToast: (msg: string, type?: string) => void;
}

const SIZE_LABELS: Record<WorldSize, string> = {
    small: `Small (${WORLD_SIZES.small.places.join(' to ')} places)`,
    medium: `Medium (${WORLD_SIZES.medium.places.join(' to ')} places)`,
    large: `Large (${WORLD_SIZES.large.places.join(' to ')} places)`
};

export function WorldBuilderPanel({ buildWorld, showToast }: WorldBuilderPanelProps) {
    const [pitch, setPitch] = useState('');
    const [size, setSize] = useState<WorldSize>('medium');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState('');

    const build = async (): Promise<void> => {
        setBusy(true);
        setProblem('');
        try {
            const result = await buildWorld({ pitch, size });
            if (result.ok) {
                showToast(
                    result.added > 0
                        ? `The world is drafted: ${result.added} lore items are waiting for your approval below.`
                        : 'The world was drafted, but everything in it was already in your lore or waiting.',
                    result.added > 0 ? 'success' : 'info'
                );
            } else {
                setProblem(result.problem);
            }
        } catch (err) {
            setProblem(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <details className="bg-surface p-5 rounded-2xl border border-edge-soft shadow-sm" data-testid="world-builder">
            <summary className="cursor-pointer text-sm font-bold text-ink-900 font-serif">Build a world from a pitch</summary>
            <div className="mt-3 space-y-3">
                <p className="text-xs text-ink-500">
                    Describe the world in a few sentences. It is written in three parts (the land, then the peoples and
                    factions, then the history and rules), and each part is checked against the ones before it. Nothing
                    is added to the story until you approve it. This makes three model calls, or up to six if a part
                    has to be asked for again.
                </p>
                <textarea
                    value={pitch}
                    onChange={(e) => setPitch(e.target.value.slice(0, WORLD_PITCH_MAX_CHARS))}
                    rows={4}
                    aria-label="World pitch"
                    placeholder="e.g. A drowned archipelago where the tide comes in once a decade and the lighthouse guilds sell the only safe charts."
                    className="w-full px-3 py-2 rounded-lg border border-edge-strong bg-surface text-sm text-ink-900 outline-none focus:ring-1 focus:ring-gold-edge"
                />
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <select
                        value={size}
                        onChange={(e) => setSize(e.target.value as WorldSize)}
                        aria-label="World size"
                        className="px-2.5 py-2 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 outline-none focus:ring-1 focus:ring-gold-edge"
                    >
                        {(Object.keys(SIZE_LABELS) as WorldSize[]).map((value) => (
                            <option key={value} value={value}>
                                {SIZE_LABELS[value]}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={busy || !pitch.trim()}
                        onClick={() => void build()}
                        className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                        {busy ? 'Building…' : 'Build World'}
                    </button>
                </div>
                {problem && (
                    <p role="alert" className="text-xs text-ink-700 border border-edge-strong rounded-lg px-3 py-2 bg-wash">
                        {problem}
                    </p>
                )}
            </div>
        </details>
    );
}
