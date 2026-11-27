/**
 * @module views/dashboard/ContentDialPanel
 * The content dial on the story's dashboard: how far violence, sex, horror, cruelty and drugs go
 * on the page, and which topics always fade to black. Until a preset is picked the story has no
 * dial and is written as before.
 */

import React from 'react';
import {
    CONTENT_CATEGORIES,
    CONTENT_CATEGORY_LABELS,
    CONTENT_LEVEL_NAMES,
    CONTENT_LEVELS,
    CONTENT_VEIL_TOPICS,
    contentDialFromPreset,
    contentDialPreset,
    normalizeContentDial,
    type ContentDial,
    type ContentPreset
} from '@/domain/story';

export interface ContentDialStory {
    content_dial?: unknown;
    [key: string]: unknown;
}

export interface ContentDialPanelProps<TStory extends ContentDialStory> {
    story: TStory;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
}

const field =
    'w-full px-2.5 py-1.5 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 outline-none focus:ring-1 focus:ring-gold-edge';

export function ContentDialPanel<TStory extends ContentDialStory>({ story, setStory }: ContentDialPanelProps<TStory>) {
    const dial = normalizeContentDial(story.content_dial);
    const preset = dial ? contentDialPreset(dial) : '';

    const save = (next: ContentDial | null): void => {
        setStory((prev) => {
            const updated = { ...prev };
            if (next) updated.content_dial = next;
            else delete updated.content_dial;
            return updated;
        });
    };

    const choosePreset = (value: string): void => {
        if (!value) return save(null);
        if (value === 'custom') return;
        save(contentDialFromPreset(value as ContentPreset, dial?.veils || []));
    };

    return (
        <div className="pt-4 border-t border-edge-soft space-y-3" data-testid="content-dial">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <span className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">Content Dial</span>
                    <p className="text-xs text-ink-500">
                        How far the story goes on the page. Planning and writing are both told. A limit is a ceiling,
                        not a target.
                    </p>
                </div>
                <select
                    value={preset}
                    onChange={(e) => choosePreset(e.target.value)}
                    aria-label="Content dial preset"
                    className={`${field} sm:w-48`}
                >
                    <option value="">Not set</option>
                    <option value="restrained">Restrained</option>
                    <option value="mature">Mature</option>
                    <option value="unflinching">Unflinching</option>
                    {preset === 'custom' && <option value="custom">Custom</option>}
                </select>
            </div>

            {dial && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {CONTENT_CATEGORIES.map((category) => (
                            <label key={category} className="space-y-1 text-xs text-ink-700">
                                <span className="block font-bold">{CONTENT_CATEGORY_LABELS[category]}</span>
                                <select
                                    value={dial.levels[category]}
                                    onChange={(e) =>
                                        save({ ...dial, levels: { ...dial.levels, [category]: Number(e.target.value) } })
                                    }
                                    aria-label={`${CONTENT_CATEGORY_LABELS[category]} level`}
                                    title={CONTENT_LEVELS[dial.levels[category]]}
                                    className={field}
                                >
                                    {CONTENT_LEVEL_NAMES.map((name, index) => (
                                        <option key={name} value={index}>
                                            {index} · {name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <span className="block text-xs font-bold text-ink-700">Always fade to black</span>
                        <div className="flex flex-wrap gap-1.5">
                            {CONTENT_VEIL_TOPICS.map((topic) => {
                                const on = dial.veils.includes(topic.id);
                                return (
                                    <button
                                        key={topic.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                            save({
                                                ...dial,
                                                veils: on ? dial.veils.filter((id) => id !== topic.id) : [...dial.veils, topic.id]
                                            })
                                        }
                                        className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer ${
                                            on
                                                ? 'bg-btn text-btn-ink border-transparent font-bold'
                                                : 'bg-surface text-ink-500 border-edge-strong hover:bg-wash'
                                        }`}
                                    >
                                        {topic.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-ink-500">
                            A topic picked here can still happen in the story. The page cuts away before it is shown,
                            whatever the levels say.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
