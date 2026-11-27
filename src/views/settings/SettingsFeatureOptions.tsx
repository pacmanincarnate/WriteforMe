/**
 * @module views/settings/SettingsFeatureOptions
 * Switches for optional pipeline safeguards, shown in the Pipeline tab. They read and write the
 * feature options store directly, so they need no props from the shell.
 */

import React from 'react';
import { useFeatureOptionsStore, type FeatureOptions } from '@/stores';

type BooleanOption = { [K in keyof FeatureOptions]: FeatureOptions[K] extends boolean ? K : never }[keyof FeatureOptions];

const TOGGLES: Array<{ key: BooleanOption; title: string; help: string }> = [
    {
        key: 'secretLeakCheck',
        title: 'Secret Leak Check',
        help: 'After a scene is written, one extra call reads it for a secret told before its planned reveal, and rewrites only the passages that give it away. Runs only while the story has unrevealed secrets. Adds a call per scene.'
    }
];

export const SettingsFeatureOptions: React.FC = () => {
    const options = useFeatureOptionsStore((s) => s.options);
    const setOption = useFeatureOptionsStore((s) => s.setOption);
    return (
        <>
            {TOGGLES.map(({ key, title, help }) => (
                <div key={key} className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                    <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">{title}</span>
                        <p className="text-xs text-ink-500">{help}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOption(key, !options[key])}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            options[key] ? 'bg-btn' : 'bg-mist-300'
                        }`}
                        role="switch"
                        aria-checked={options[key]}
                        aria-label={`Toggle ${title}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                                options[key] ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            ))}
        </>
    );
};
