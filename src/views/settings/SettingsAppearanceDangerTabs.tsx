/**
 * @module views/settings/SettingsAppearanceDangerTabs
 * Appearance (`settingsTab === 'appearance'`) and Danger Zone (`settingsTab === 'danger'`) tabs.
 */

import React from 'react';
import { ChevronDown, Download, Moon, Plus, StoryResetDropdown, Sun, Trash2 } from '@/components';
import { DEFAULT_IMAGE_STYLES, IMAGE_STYLE_CATEGORIES } from '@/config';
import { SettingsRestorePoints } from './SettingsRestorePoints';
import type { SettingsAppearanceTabProps, SettingsDangerTabProps } from './types';

export const SettingsAppearanceTab: React.FC<SettingsAppearanceTabProps> = ({
    theme,
    setTheme,
    story,
    setStory,
    customImageStyles,
    setCustomImageStyles,
    newStyleName,
    setNewStyleName,
    newStyleDesc,
    setNewStyleDesc,
    showToast
}) => {
    const allImageStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
    const resolvedStyleId = allImageStyles.some((c) => c.id === story.imageStyle)
        ? story.imageStyle || 'none'
        : 'none';
    const selectedStyleDescription =
        allImageStyles.find((c) => c.id === resolvedStyleId)?.description || '';
    const uncategorizedDefaultStyles = DEFAULT_IMAGE_STYLES.filter((s) => !s.category);

    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-6 shadow-sm animate-fade-in">
            {/* Theme Appearance Selector */}
            <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2 font-mono">
                    Theme &amp; Reading Atmosphere
                </label>
                <div className="grid grid-cols-2 gap-2 bg-mist-100 p-1 rounded-xl border border-edge-strong">
                    <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            theme === 'light' ? 'bg-btn text-btn-ink shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                        }`}
                    >
                        <Sun size={14} className={theme === 'light' ? 'text-amber-300' : ''} />
                        Folio Bianca (Light)
                    </button>
                    <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            theme === 'dark' ? 'bg-btn text-btn-ink shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                        }`}
                    >
                        <Moon size={14} className={theme === 'dark' ? 'text-[#C9A96E]' : ''} />
                        Atelier Nuit (Dark)
                    </button>
                </div>
            </div>

            {/* Story Art Style & Visual Aesthetics */}
            <div className="pt-6 border-t border-edge-strong space-y-4">
                <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                        Story Art Style &amp; Visual Aesthetics
                    </label>
                </div>
                <p className="text-xs text-ink-500">
                    Configure the artistic style applied to book covers, character portraits, and scene illustrations
                    throughout your story.
                </p>

                {/* Story Style Dropdown */}
                <div className="pt-2">
                    <label className="block text-xs font-bold text-ink-700 mb-1 font-mono">Story Art Style</label>
                    <div className="relative">
                        <select
                            value={resolvedStyleId}
                            onChange={(e) => {
                                const val = e.target.value;
                                setStory((prev) => ({ ...prev, imageStyle: val }));
                            }}
                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none appearance-none transition-colors font-semibold cursor-pointer"
                        >
                            {uncategorizedDefaultStyles.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                            {IMAGE_STYLE_CATEGORIES.map((category) => {
                                const categoryStyles = DEFAULT_IMAGE_STYLES.filter((s) => s.category === category);
                                if (categoryStyles.length === 0) return null;
                                return (
                                    <optgroup key={category} label={category}>
                                        {categoryStyles.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                            {customImageStyles.length > 0 && (
                                <optgroup label="Custom Styles">
                                    {customImageStyles.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} (Custom)
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                        <ChevronDown
                            className="absolute right-3 top-2.5 text-ink-400 pointer-events-none"
                            size={14}
                        />
                    </div>
                    {resolvedStyleId !== 'none' && selectedStyleDescription && (
                        <p className="text-xs text-ink-500 italic mt-2 leading-relaxed font-serif">
                            Style description: {selectedStyleDescription}
                        </p>
                    )}
                </div>

                {/* Custom Styles Manager */}
                <div className="pt-2 space-y-3">
                    <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                        Add Custom Image Style
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                            type="text"
                            placeholder="Style Name (e.g. Modern Retro)"
                            value={newStyleName}
                            onChange={(e) => setNewStyleName(e.target.value)}
                            className="bg-inset border border-edge-strong rounded-xl px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none placeholder-stone-400"
                        />
                        <input
                            type="text"
                            placeholder="Description (e.g. high contrast, neon colors)"
                            value={newStyleDesc}
                            onChange={(e) => setNewStyleDesc(e.target.value)}
                            className="bg-inset border border-edge-strong rounded-xl px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none placeholder-stone-400"
                        />
                    </div>
                    <button
                        onClick={() => {
                            if (!newStyleName.trim() || !newStyleDesc.trim()) {
                                alert('Please enter both style name and description.');
                                return;
                            }
                            const id = `custom_${Date.now()}`;
                            const newStyle = { id, name: newStyleName.trim(), description: newStyleDesc.trim() };
                            setCustomImageStyles([...customImageStyles, newStyle]);
                            setStory((prev) => ({ ...prev, imageStyle: id }));
                            setNewStyleName('');
                            setNewStyleDesc('');
                            showToast(`Custom image style "${newStyle.name}" added!`);
                        }}
                        className="w-full bg-btn hover:bg-btn-hover text-btn-ink text-xs py-2 rounded-xl font-bold flex justify-center items-center gap-1 transition-all shadow-sm active:scale-95"
                    >
                        <Plus size={13} /> Add Style
                    </button>
                    {customImageStyles.length > 0 && (
                        <div className="space-y-1.5 pt-2">
                            <label className="text-[10px] font-bold text-ink-400 uppercase font-mono">
                                Manage Custom Styles
                            </label>
                            <div className="flex flex-col gap-1.5">
                                {customImageStyles.map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex justify-between items-center bg-inset p-2.5 rounded-xl border border-edge-strong text-xs"
                                    >
                                        <div className="truncate pr-4 text-ink-600">
                                            <span className="font-semibold text-ink-900">{s.name}:</span>{' '}
                                            <span className="italic font-serif">{s.description}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setCustomImageStyles(customImageStyles.filter((c) => c.id !== s.id));
                                                if (story.imageStyle === s.id) {
                                                    setStory((prev) => ({ ...prev, imageStyle: 'none' }));
                                                }
                                                showToast(`Custom image style "${s.name}" deleted.`, 'info');
                                            }}
                                            className="text-ink-400 hover:text-blush-600 p-0.5 rounded transition-colors shrink-0"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const SettingsDangerTab: React.FC<SettingsDangerTabProps> = ({
    story,
    setStory,
    showToast,
    availableSceneAudioMap,
    loading,
    handleExport,
    handleResetStoryStage,
    handleDeleteStory
}) => {
    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-6 shadow-sm animate-fade-in">
            {/* Danger Zone & Data Export */}
            <div className="space-y-4">
                <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider font-mono mb-2">
                    Database Backup &amp; Danger Zone
                </label>
                <div className="bg-surface border border-edge rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-sm font-bold text-ink-900 font-serif">
                            Export Complete Database (JSON Backup)
                        </h4>
                        <p className="text-xs text-ink-500 mt-1">
                            Download a full uncompressed JSON backup of your current story, characters, lore,
                            blueprints, prose, and metadata.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="px-4 py-2.5 bg-surface hover:bg-wash border border-edge-strong text-ink-800 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto shrink-0 cursor-pointer"
                    >
                        <Download size={14} />
                        Export Database JSON
                    </button>
                </div>
                <SettingsRestorePoints story={story} setStory={setStory} showToast={showToast} loading={loading} />
                <div className="bg-surface border border-edge rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-sm font-bold text-ink-900 font-serif">
                            Reset Current Story Stage (Rollback)
                        </h4>
                        <p className="text-xs text-ink-500 mt-1">
                            Roll back &ldquo;{story.title || 'Untitled Story'}&rdquo; by deleting generated scene TTS
                            audio, prose, scenes, sequences, or acts along with their downstream data, while preserving
                            your initial concept, starting cast, and processed document uploads.
                        </p>
                    </div>
                    <div className="self-start sm:self-auto shrink-0">
                        <StoryResetDropdown
                            story={story}
                            onResetStage={handleResetStoryStage}
                            availableSceneAudioMap={availableSceneAudioMap}
                            disabled={loading}
                            align="right"
                        />
                    </div>
                </div>
                <div className="bg-blush-tint border border-blush-edge rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-sm font-bold text-blush-900 font-serif">
                            Factory Reset &amp; Erase All Stories
                        </h4>
                        <p className="text-xs text-blush-700 mt-1">
                            Permanently erase ALL stories in your library, story bible, cast, lore, generated prose,
                            covers, and local storage. This resets the entire application to factory defaults and cannot
                            be undone.
                        </p>
                    </div>
                    <button
                        onClick={handleDeleteStory}
                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto shrink-0"
                    >
                        <Trash2 size={14} />
                        Erase All App Data
                    </button>
                </div>
            </div>
        </div>
    );
};
