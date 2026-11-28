/**
 * @module views/settings/SettingsView
 * Main Settings view (`view === 'settings'`) with 6-tab navigation:
 * Model Options, Pipeline Settings, Prompts, Audio Drama, Appearance, and Danger.
 */

import React from 'react';
import { VIEW_LABELS } from '@/config';
import { AlertTriangle, Cpu, FileText, Radio, Sparkles, Workflow } from '@/components';
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
        <div className="max-w-4xl mx-auto py-8 animate-fade-in pb-24">
            <h2 className="text-2xl font-bold font-serif text-ink-900 tracking-tight mb-6">
                {VIEW_LABELS.settings}
            </h2>

            {/* Settings Navigation Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1.5 bg-mist-100 border border-edge-strong rounded-2xl mb-6 shadow-2xs">
                <button
                    type="button"
                    onClick={() => setSettingsTab('models')}
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                    className={`flex-1 whitespace-nowrap min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
