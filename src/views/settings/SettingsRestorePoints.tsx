/**
 * @module views/settings/SettingsRestorePoints
 * The open story's restore points: copies taken before something rewrote it, plus daily backups.
 * Restoring one first saves the story as it is now, so a restore can itself be undone.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, Trash2 } from '@/components';
import { restorePointAge, type RestorePointMeta } from '@/domain/story';
import { restorePointStore, storyStore } from '@/services/storage';
import type { SettingsShowToastFn, SettingsStory } from './types';

export interface SettingsRestorePointsProps {
    story: SettingsStory;
    setStory: React.Dispatch<React.SetStateAction<SettingsStory>>;
    showToast: SettingsShowToastFn;
    loading: boolean;
}

const KIND_LABEL: Record<RestorePointMeta['kind'], string> = {
    before: 'Undo point',
    auto: 'Daily backup',
    manual: 'Saved by you'
};

export const SettingsRestorePoints: React.FC<SettingsRestorePointsProps> = ({
    story,
    setStory,
    showToast,
    loading
}) => {
    const storyId = typeof story?.id === 'string' ? story.id : '';
    const [points, setPoints] = useState<RestorePointMeta[]>([]);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async (): Promise<void> => {
        setPoints(storyId ? await restorePointStore.list(storyId) : []);
    }, [storyId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const saveNow = async (): Promise<void> => {
        if (!storyId || busy) return;
        setBusy(true);
        try {
            const made = await restorePointStore.add(
                storyId,
                story as unknown as Record<string, unknown>,
                'manual',
                'Saved by you'
            );
            showToast(
                made ? 'Restore point saved.' : 'Nothing to save yet: this story is still empty.',
                made ? 'success' : 'info'
            );
            await refresh();
        } finally {
            setBusy(false);
        }
    };

    const restore = async (point: RestorePointMeta): Promise<void> => {
        if (busy || loading) return;
        setBusy(true);
        try {
            const data = await restorePointStore.load(point.id);
            if (!data) {
                showToast('That restore point could not be read. Nothing was changed.', 'error');
                return;
            }
            await restorePointStore.add(
                storyId,
                story as unknown as Record<string, unknown>,
                'before',
                'Before restoring an earlier version'
            );
            const restored = { ...data, id: storyId } as unknown as SettingsStory;
            setStory(restored);
            // Going back can shrink the story on purpose; bypass the store's regression guard.
            await storyStore.saveStory(storyId, restored as unknown as Record<string, unknown>, {
                allowRegression: true
            });
            showToast(`Restored the story to "${point.label}".`, 'success');
        } catch (err) {
            showToast(`Restore failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            setConfirmId(null);
            setBusy(false);
            await refresh();
        }
    };

    const remove = async (point: RestorePointMeta): Promise<void> => {
        await restorePointStore.remove([point.id]);
        await refresh();
    };

    const now = Date.now();
    return (
        <div className="bg-surface border border-edge rounded-2xl p-5 space-y-4" data-testid="restore-points">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h4 className="text-sm font-bold text-ink-900 font-serif">Restore Points &amp; Daily Backups</h4>
                    <p className="text-xs text-ink-500 mt-1">
                        A copy of &ldquo;{story.title || 'Untitled Story'}&rdquo; is kept before a scene is rewritten,
                        scenes are re-planned, an editorial pass or directive plan runs, or a stage is reset. One backup
                        a day is kept for a week, then one a week for a month. They live in this browser.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void saveNow()}
                    disabled={!storyId || busy}
                    className="px-4 py-2.5 bg-surface hover:bg-wash border border-edge-strong text-ink-800 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto shrink-0 cursor-pointer disabled:opacity-50"
                >
                    <History size={14} />
                    Save A Restore Point
                </button>
            </div>
            {points.length === 0 ? (
                <p className="text-xs text-ink-500 italic">No restore points for this story yet.</p>
            ) : (
                <ul className="divide-y divide-edge border border-edge rounded-xl overflow-hidden">
                    {points.map((point) => (
                        <li key={point.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-inset">
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-ink-900 truncate">{point.label}</div>
                                <div className="text-[11px] text-ink-500 font-mono">
                                    {KIND_LABEL[point.kind]} · {restorePointAge(point.timestamp, now)} ·{' '}
                                    {point.words.toLocaleString()} words · {point.scenes} scene
                                    {point.scenes === 1 ? '' : 's'} written
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {confirmId === point.id ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void restore(point)}
                                            disabled={busy || loading}
                                            className="px-3 py-1.5 bg-btn text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
                                        >
                                            Yes, Restore
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmId(null)}
                                            className="px-3 py-1.5 border border-edge-strong text-ink-800 rounded-lg text-xs font-bold cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmId(point.id)}
                                            disabled={busy || loading}
                                            aria-label={`Restore ${point.label}`}
                                            className="px-3 py-1.5 border border-edge-strong text-ink-800 hover:bg-wash rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                        >
                                            <RotateCcw size={12} />
                                            Restore
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void remove(point)}
                                            aria-label={`Delete ${point.label}`}
                                            className="p-1.5 text-ink-500 hover:text-rose-600 rounded-lg cursor-pointer"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
