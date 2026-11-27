/**
 * @module views/settings/SettingsView
 * Main Settings view (`view === 'settings'`) with 6-tab navigation:
 * Model Options, Pipeline Settings, Prompts, Audio Drama, Appearance, and Danger.
 */

import React from 'react';
import { VIEW_LABELS } from '@/config';
import { AlertTriangle, Cpu, FileText, Radio, Settings, Sparkles, Workflow } from '@/components';
import { SettingsAppearanceTab, SettingsDangerTab } from './SettingsAppearanceDangerTabs';
import { SettingsAudioDramaTab } from './SettingsAudioDramaTab';
import { SettingsModelsTab } from './SettingsModelsTab';
import { SettingsPipelineTab } from './SettingsPipelineTab';
import { SettingsPromptsTab } from './SettingsPromptsTab';
import type { SettingsViewProps } from './types';

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
    const { view, settingsTab, setSettingsTab } = props;

    if (view !== 'settings') {
        return null;
    }

    return (
        <div className="max-w-2xl mx-auto py-8 animate-fade-in pb-24">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-gold-tint border border-gold-edge text-gold-ink">
                    <Settings size={22} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold font-serif text-ink-900 tracking-tight">
                        {VIEW_LABELS.settings}
                    </h2>
                </div>
            </div>

            {/* Settings Navigation Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 p-1.5 bg-mist-100 border border-edge-strong rounded-2xl mb-6 shadow-2xs">
                <button
                    type="button"
                    onClick={() => setSettingsTab('models')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'models'
                            ? 'bg-btn text-btn-ink shadow-2xs'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-mist-200/60'
                    }`}
                >
                    <Cpu size={14} />
                    <span>Model Options</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSettingsTab('pipeline')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'pipeline'
                            ? 'bg-btn text-btn-ink shadow-2xs'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-mist-200/60'
                    }`}
                >
                    <Workflow size={14} />
                    <span>Pipeline Settings</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSettingsTab('prompts')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'prompts'
                            ? 'bg-btn text-btn-ink shadow-2xs'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-mist-200/60'
                    }`}
                >
                    <FileText size={14} />
                    <span>Prompts</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSettingsTab('audio_drama')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'audio_drama'
                            ? 'bg-btn text-btn-ink shadow-2xs'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-mist-200/60'
                    }`}
                >
                    <Radio size={14} className={settingsTab === 'audio_drama' ? 'text-amber-300' : 'text-gold-ink'} />
                    <span>Audio Drama</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSettingsTab('appearance')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'appearance'
                            ? 'bg-btn text-btn-ink shadow-2xs'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-mist-200/60'
                    }`}
                >
                    <Sparkles size={14} />
                    <span>Appearance</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSettingsTab('danger')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        settingsTab === 'danger'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'text-blush-700 hover:text-blush-900 hover:bg-blush-tint/60'
                    }`}
                >
                    <AlertTriangle size={14} />
                    <span>Danger</span>
                </button>
            </div>

            {settingsTab === 'models' && <SettingsModelsTab {...props} />}
            {settingsTab === 'pipeline' && <SettingsPipelineTab {...props} />}
            {settingsTab === 'prompts' && <SettingsPromptsTab />}
            {settingsTab === 'audio_drama' && <SettingsAudioDramaTab {...props} />}
            {settingsTab === 'appearance' && <SettingsAppearanceTab {...props} />}
            {settingsTab === 'danger' && <SettingsDangerTab {...props} />}
        </div>
    );
};
