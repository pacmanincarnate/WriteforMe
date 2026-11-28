/**
 * @module views/settings/SettingsPromptsTab
 * Prompts tab (`settingsTab === 'prompts'`): reword the core system prompts, with guard rails.
 */

import React, { useMemo, useState } from 'react';
import { RotateCcw, Search } from '@/components';
import { usePromptOverrides } from '@/hooks';
import type { EditablePromptView } from '@/prompts/overrides';

interface PromptEditorProps {
    prompt: EditablePromptView;
    onSave: (key: string, wording: string) => string | null;
    onReset: (key: string) => void;
}

const PromptEditor: React.FC<PromptEditorProps> = ({ prompt, onSave, onReset }) => {
    const [draft, setDraft] = useState(prompt.text);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [showDefault, setShowDefault] = useState(false);
    const dirty = draft !== prompt.text;

    const save = () => {
        const problem = onSave(prompt.key, draft);
        setError(problem);
        setSaved(!problem);
    };
    const reset = () => {
        onReset(prompt.key);
        setDraft(prompt.default);
        setError(null);
        setSaved(false);
    };

    return (
        <div className="space-y-2 pt-2">
            {prompt.description && <p className="text-[11px] text-ink-500">{prompt.description}</p>}
            {prompt.problem && (
                <p role="alert" className="text-[11px] text-blush-700 bg-blush-tint/60 border border-edge rounded-lg p-2">
                    Your wording is not in use, and the default is. {prompt.problem}
                </p>
            )}
            {prompt.outdated && !prompt.problem && (
                <p className="text-[11px] text-gold-ink bg-gold-tint border border-gold-edge rounded-lg p-2">
                    The default wording changed in an update. Yours is still in use. Compare it with the new default below.
                </p>
            )}
            <textarea
                aria-label={`${prompt.label} prompt`}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    setSaved(false);
                }}
                rows={12}
                spellCheck={false}
                className="w-full p-3 rounded-xl border border-edge-strong bg-surface text-xs font-mono text-ink-900 leading-relaxed"
            />
            {prompt.requiredTags.length > 0 && (
                <p className="text-[10px] text-ink-400 font-mono break-words">
                    Tags to keep: {prompt.requiredTags.map((tag) => `<${tag}>`).join(' ')}
                </p>
            )}
            {prompt.requiredFields.length > 0 && (
                <p className="text-[10px] text-ink-400 font-mono break-words">
                    JSON fields to keep: {prompt.requiredFields.map((name) => `"${name}"`).join(' ')}
                </p>
            )}
            {error && (
                <p role="alert" className="text-[11px] text-blush-700">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold bg-btn text-btn-ink disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={reset}
                    disabled={!prompt.customized && !dirty}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold border border-edge-strong text-ink-700 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer disabled:cursor-default"
                >
                    <RotateCcw size={12} />
                    Reset to default
                </button>
                {prompt.customized && (
                    <button
                        type="button"
                        onClick={() => setShowDefault((v) => !v)}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-ink-600 hover:text-ink-900 cursor-pointer"
                    >
                        {showDefault ? 'Hide default' : 'Show default'}
                    </button>
                )}
                {saved && !dirty && <span className="text-[11px] text-ink-500">Saved. The next call uses it.</span>}
            </div>
            {showDefault && prompt.customized && (
                <pre className="p-3 rounded-xl border border-edge bg-wash text-[11px] font-mono text-ink-600 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {prompt.default}
                </pre>
            )}
        </div>
    );
};

export const SettingsPromptsTab: React.FC = () => {
    const { prompts, savePrompt, resetPrompt } = usePromptOverrides();
    const [query, setQuery] = useState('');
    const [openKey, setOpenKey] = useState<string | null>(null);

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const shown = needle
            ? prompts.filter((p) => `${p.label} ${p.key} ${p.description} ${p.group}`.toLowerCase().includes(needle))
            : prompts;
        const byGroup = new Map<string, EditablePromptView[]>();
        shown.forEach((p) => byGroup.set(p.group, [...(byGroup.get(p.group) || []), p]));
        return Array.from(byGroup.entries());
    }, [prompts, query]);

    const edited = prompts.filter((p) => p.customized).length;

    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-5 shadow-sm animate-fade-in">
            <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2 font-mono">
                    Core Prompts
                </label>
                <p className="text-[11px] text-ink-500">
                    Reword the instructions each agent gets. Your wording is kept through updates. A save that drops a tag
                    the app reads replies by is refused.{edited > 0 ? ` ${edited} edited.` : ''}
                </p>
            </div>
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                    type="search"
                    aria-label="Search prompts"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search prompts"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-edge-strong bg-surface text-xs text-ink-900"
                />
            </div>
            {groups.length === 0 && <p className="text-xs text-ink-500">No prompt matches.</p>}
            {groups.map(([group, items]) => (
                <div key={group} className="space-y-1.5">
                    <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wider font-mono">{group}</div>
                    {items.map((prompt) => {
                        const open = openKey === prompt.key;
                        return (
                            <div key={prompt.key} className="p-3 rounded-xl bg-wash border border-edge">
                                <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() => setOpenKey(open ? null : prompt.key)}
                                    className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                                >
                                    <span className="text-xs font-bold text-ink-900">{prompt.label}</span>
                                    <span className="flex items-center gap-1.5">
                                        {prompt.problem && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blush-tint text-blush-700">
                                                Not in use
                                            </span>
                                        )}
                                        {prompt.outdated && !prompt.problem && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold-tint text-gold-ink">
                                                New default
                                            </span>
                                        )}
                                        {prompt.customized && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-mist-200 text-ink-700">
                                                Edited
                                            </span>
                                        )}
                                    </span>
                                </button>
                                {open && <PromptEditor prompt={prompt} onSave={savePrompt} onReset={resetPrompt} />}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
