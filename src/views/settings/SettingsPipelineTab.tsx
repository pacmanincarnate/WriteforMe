/**
 * @module views/settings/SettingsPipelineTab
 * Pipeline Settings tab (`settingsTab === 'pipeline'`): MCP bridge, pipeline verification passes,
 * thinking token budgets, narrative pacing lenses & custom mode library, and AI Slop & Naming Audit.
 */

import React from 'react';
import {
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    Edit3,
    Icon,
    Plus,
    Search,
    Trash2,
    Upload,
    X
} from '@/components';
import { AVAILABLE_ICONS } from '@/config';
import { DEFAULT_SLOP_CONFIG, buildEffectiveSlopData } from '@/domain/slop';
import { SettingsAutopilotLimits } from './SettingsAutopilotLimits';
import { SettingsFeatureOptions } from './SettingsFeatureOptions';
import type { SlopSeverity } from '@/types';
import type { SettingsPipelineTabProps } from './types';

interface SlopManagerEntry {
    id: string;
    title: string;
    severity: SlopSeverity;
    match: string;
    note?: string;
    isRuleOnly?: boolean;
    items: string[];
}

export const SettingsPipelineTab: React.FC<SettingsPipelineTabProps> = ({
    enableMcpBridge,
    setEnableMcpBridge,
    isMcpConnected,
    setMcpRetryTrigger,
    enableReview,
    setEnableReview,
    enableStylePolish,
    setEnableStylePolish,
    enableAudioDramaDirectionPass,
    setEnableAudioDramaDirectionPass,
    enableEditorialHarnessAutopilot,
    setEnableEditorialHarnessAutopilot,
    thinkingBudgetStoryArc,
    setThinkingBudgetStoryArc,
    thinkingBudgetAct,
    setThinkingBudgetAct,
    setEnableThinkingAct,
    thinkingBudgetScene,
    setThinkingBudgetScene,
    setEnableThinkingScene,
    thinkingBudgetWriting,
    setThinkingBudgetWriting,
    setEnableThinkingWriting,
    enableNarrativeLenses,
    setEnableNarrativeLenses,
    customModes,
    editingModeId,
    newModeId,
    setNewModeId,
    newModeContext,
    setNewModeContext,
    newModeIcon,
    newModePrompt,
    setNewModePrompt,
    setIsIconPickerOpen,
    handleStartEditCustomMode,
    handleDeleteCustomMode,
    handleSaveCustomMode,
    handleCancelEditCustomMode,
    slopConfig,
    setSlopConfig,
    bannedPhrases,
    slopSearchQuery,
    setSlopSearchQuery,
    expandedSlopGroups,
    setExpandedSlopGroups,
    expandedSlopCategories,
    setExpandedSlopCategories,
    newBannedPhraseInput,
    setNewBannedPhraseInput,
    newCategoryItemInputs,
    setNewCategoryItemInputs,
    handleSetSlopCategorySeverity,
    handleAddBannedPhrase,
    handleAddSlopCategoryItem,
    handleRemoveSlopCategoryItem,
    handleImportSlopJson,
    handleExportSlopJson,
    handleResetSlopConfig,
    requestConfirm,
    showToast
}) => {
    const effSlop = buildEffectiveSlopData(slopConfig, bannedPhrases);
    const qLow = slopSearchQuery.trim().toLowerCase();
    const importedPackName =
        typeof slopConfig?.importedPackMeta?.name === 'string' ? slopConfig.importedPackMeta.name : null;

    const groupMeta = [
        {
            id: 'prose_style',
            label: 'Prose & Style Cliches',
            desc: 'Overused slop words, cliché phrases, purple metaphors, and clinical tropes.'
        },
        {
            id: 'names_places',
            label: 'Names & Places',
            desc: 'Stock AI names, surnames, fantasy/sci-fi towns, and overdrawn 1-per-story budgets.'
        },
        {
            id: 'patterns_rhythm',
            label: 'Patterns & Rhythm Rules',
            desc: 'Rhetorical crutches (not X but Y, triads), em-dash density, echo chambers, punctuation, and dialogue.'
        },
        {
            id: 'custom',
            label: 'Custom User Phrases',
            desc: 'Your custom words & phrases filtered across generation, review, and editorial telemetry.'
        }
    ];

    const setEmDashMode = (mode: 'off' | 'density' | 'strict') => {
        const mappedSev: SlopSeverity = mode === 'off' ? 'off' : mode === 'strict' ? 'hard' : 'flag';
        setSlopConfig((prev) => ({
            ...(prev || DEFAULT_SLOP_CONFIG),
            emDashMode: mode,
            categorySeverities: { ...(prev?.categorySeverities || {}), em_dash: mappedSev }
        }));
    };

    const handleSeverityPill = (id: string, sev: SlopSeverity) => {
        if (id === 'em_dash') {
            setEmDashMode(sev === 'off' ? 'off' : sev === 'hard' ? 'strict' : 'density');
            return;
        }
        handleSetSlopCategorySeverity(id, sev);
    };

    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-6 shadow-sm animate-fade-in">
            {/* Antigravity MCP Bridge Toggle */}
            <div className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                            Antigravity MCP Bridge
                        </span>
                        {isMcpConnected ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Connected (:3002)
                            </span>
                        ) : enableMcpBridge ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Disconnected
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-mist-200 text-ink-500 border border-edge">
                                Disabled
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-ink-500">
                        Connects to local MCP relay on port 3002 for live Antigravity pair programming. Disabled by
                        default to prevent connection errors when the server isn&apos;t running.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {enableMcpBridge && !isMcpConnected && (
                        <button
                            type="button"
                            onClick={() => setMcpRetryTrigger((prev) => prev + 1)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-edge hover:bg-mist-200 transition-colors text-ink-700 cursor-pointer"
                            title="Retry connecting to MCP server on port 3002"
                        >
                            Retry
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setEnableMcpBridge(!enableMcpBridge)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                            enableMcpBridge ? 'bg-btn' : 'bg-mist-300'
                        }`}
                        aria-label="Toggle Antigravity MCP Bridge"
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                                enableMcpBridge ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>

            {/* Pipeline Review Agents Toggle */}
            <div className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                <div className="space-y-0.5 pr-4">
                    <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                        Pipeline Review Agents
                    </span>
                    <p className="text-xs text-ink-500">
                        When toggled off, skips all review passes and surgical editors for maximum generation speed,
                        immediately accepting generator drafts.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setEnableReview(!enableReview)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        enableReview ? 'bg-btn' : 'bg-mist-300'
                    }`}
                    aria-label="Toggle Pipeline Review Agents"
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                            enableReview ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {/* Style & Sensory Polish Toggle */}
            <div className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                <div className="space-y-0.5 pr-4">
                    <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                        Style &amp; Sensory Polish Pass
                    </span>
                    <p className="text-xs text-ink-500">
                        When toggled on, runs an additional Phase 4B writing pass to elevate sentence melody and weave
                        sensory anchors. Increases cost/time per scene.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setEnableStylePolish(!enableStylePolish)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        enableStylePolish ? 'bg-btn' : 'bg-mist-300'
                    }`}
                    aria-label="Toggle Style & Sensory Polish Pass"
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                            enableStylePolish ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            <SettingsFeatureOptions />

            <SettingsAutopilotLimits />

            {/* Audio Drama Voice Director Pass (Audit-Gated) Toggle */}
            <div className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                <div className="space-y-0.5 pr-4">
                    <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                        Audio Drama Voice Director Pass (Auto)
                    </span>
                    <p className="text-xs text-ink-500">
                        Runs a fast non-LLM Drama-3 expressiveness audit after scene drafting; if below threshold,
                        invokes the prose-model Voice Director surgical pass to enrich [cues], mid-line [pivots],
                        [pause]/[sigh]/[laugh] sounds, and paired XML word tags without altering spoken words.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setEnableAudioDramaDirectionPass(!enableAudioDramaDirectionPass)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        enableAudioDramaDirectionPass ? 'bg-btn' : 'bg-mist-300'
                    }`}
                    aria-label="Toggle Audio Drama Voice Director Pass"
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                            enableAudioDramaDirectionPass ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {/* Autonomous Editorial Harness (Post-Drafting CI/CD) Toggle */}
            <div className="flex items-center justify-between p-4 bg-inset border border-edge-strong rounded-xl">
                <div className="space-y-0.5 pr-4">
                    <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                        Autonomous Editorial Harness (Post-Drafting CI/CD)
                    </span>
                    <p className="text-xs text-ink-500">
                        When toggled on, Continuous Autopilot automatically runs the 5-Phase Autonomous Novel Review
                        &amp; 3-Wave Surgical Revision Harness (Voice DNA, Layer 0 Blind Reader, 11-Tool Investigator,
                        Adversarial Tribunal, &amp; 4-Gate Literary CI/CD) once all sequences and scenes are drafted.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setEnableEditorialHarnessAutopilot(!enableEditorialHarnessAutopilot)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        enableEditorialHarnessAutopilot ? 'bg-btn' : 'bg-mist-300'
                    }`}
                    aria-label="Toggle Autonomous Editorial Harness on Autopilot"
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm ${
                            enableEditorialHarnessAutopilot ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {/* Reasoning / Thinking Settings */}
            <div className="pt-5 border-t border-edge-strong space-y-4">
                <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                    Reasoning / Thinking Configuration
                </label>
                <p className="text-xs text-ink-500">
                    Configure thinking max tokens and effort levels for key agents in the narrative pipeline. Selecting
                    &apos;Off (0)&apos; turns off thinking for that stage. Headroom for generated output is
                    automatically protected and bounded to each model&apos;s maximum ceiling so thinking never starves or
                    stalls the pipeline.
                </p>

                {/* Story Arc Thinking */}
                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-ink-900 block font-mono">Story Arc Agent</span>
                            <span className="text-[11px] text-ink-500">Early conceptual structuring</span>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-edge-strong">
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Thinking Max Tokens &amp; Effort
                        </label>
                        <select
                            value={thinkingBudgetStoryArc}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setThinkingBudgetStoryArc(val);
                                setEnableThinkingAct(val > 0);
                            }}
                            className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-gold transition-colors"
                        >
                            <option value={0}>Off (0)</option>
                            <option value={2048}>Low (2k)</option>
                            <option value={4096}>Medium (4k)</option>
                            <option value={8192}>High (8k)</option>
                            <option value={16384}>X-High (16k)</option>
                            <option value={32768}>Ultra (32k)</option>
                        </select>
                    </div>
                </div>

                {/* Act Planner Thinking */}
                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-ink-900 block font-mono">
                                Act Planner (Act Agent)
                            </span>
                            <span className="text-[11px] text-ink-500">Deep structural planning</span>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-edge-strong">
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Thinking Max Tokens &amp; Effort
                        </label>
                        <select
                            value={thinkingBudgetAct}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setThinkingBudgetAct(val);
                                setEnableThinkingAct(val > 0);
                            }}
                            className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-gold transition-colors"
                        >
                            <option value={0}>Off (0)</option>
                            <option value={2048}>Low (2k)</option>
                            <option value={4096}>Medium (4k)</option>
                            <option value={8192}>High (8k)</option>
                            <option value={16384}>X-High (16k)</option>
                            <option value={32768}>Ultra (32k)</option>
                        </select>
                    </div>
                </div>

                {/* Scene Agent Thinking */}
                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-ink-900 block font-mono">Scene Agent</span>
                            <span className="text-[11px] text-ink-500">Meso-level outline &amp; causal linking</span>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-edge-strong">
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Thinking Max Tokens &amp; Effort
                        </label>
                        <select
                            value={thinkingBudgetScene}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setThinkingBudgetScene(val);
                                setEnableThinkingScene(val > 0);
                            }}
                            className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-gold transition-colors"
                        >
                            <option value={0}>Off (0)</option>
                            <option value={2048}>Low (2k)</option>
                            <option value={4096}>Medium (4k)</option>
                            <option value={8192}>High (8k)</option>
                            <option value={16384}>X-High (16k)</option>
                            <option value={32768}>Ultra (32k)</option>
                        </select>
                    </div>
                </div>

                {/* Writing Agent Thinking */}
                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-ink-900 block font-mono">Writing Agent</span>
                            <span className="text-[11px] text-ink-500">Visceral prose &amp; continuity alignment</span>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-edge-strong">
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Thinking Max Tokens &amp; Effort
                        </label>
                        <select
                            value={thinkingBudgetWriting}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setThinkingBudgetWriting(val);
                                setEnableThinkingWriting(val > 0);
                            }}
                            className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-gold transition-colors"
                        >
                            <option value={0}>Off (0)</option>
                            <option value={2048}>Low (2k)</option>
                            <option value={4096}>Medium (4k)</option>
                            <option value={8192}>High (8k)</option>
                            <option value={16384}>X-High (16k)</option>
                            <option value={32768}>Ultra (32k)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Custom Narrative Modes Section */}
            <div className="pt-6 border-t border-edge-strong space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                            Narrative Pacing Lenses
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const nextVal = !enableNarrativeLenses;
                            setEnableNarrativeLenses(nextVal);
                            showToast(
                                nextVal
                                    ? 'Narrative lenses enabled.'
                                    : 'Narrative lenses disabled for text generation.',
                                nextVal ? 'success' : 'info'
                            );
                        }}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer p-0.5 ${
                            enableNarrativeLenses ? 'bg-btn' : 'bg-mist-300'
                        }`}
                        title={
                            enableNarrativeLenses
                                ? 'Click to temporarily disable narrative lenses'
                                : 'Click to enable narrative lenses'
                        }
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-surface transition-transform shadow-sm ${
                                enableNarrativeLenses ? 'translate-x-5' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
                <p className="text-xs text-ink-500">
                    {enableNarrativeLenses
                        ? 'When enabled, scenes have mode-specific narrative lenses (such as Action, Romance, Suspense, or Baseline Neutral) injected into beat choreography and prose drafting.'
                        : "Temporarily switched off. Beats and prose draft strictly from your story's core genre, tone, and writing style guide without mode-specific lens overrides."}
                </p>

                <div className="pt-2 border-t border-edge space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="block text-[11px] font-bold text-ink-600 uppercase tracking-wider font-mono">
                            Custom Mode Library
                        </label>
                    </div>
                    <p className="text-xs text-ink-500">
                        Add and modify custom writing styles and lenses. They will be indexable by the structure agents
                        and selectable in the drop-downs.
                    </p>
                </div>

                {/* Custom Mode list */}
                {Object.keys(customModes).length > 0 && (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-ink-400 uppercase font-mono">
                            Existing Custom Modes
                        </label>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {Object.values(customModes).map((mode) => {
                                const isCurrentlyEditing = editingModeId === mode.id;
                                return (
                                    <div
                                        key={mode.id}
                                        className={`p-3.5 rounded-xl border transition-all flex justify-between items-start gap-4 animate-fade-in shadow-2xs ${
                                            isCurrentlyEditing
                                                ? 'bg-inset border-gold-edge ring-1 ring-gold/40'
                                                : 'bg-inset border-edge-strong hover:border-gold-edge'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Icon
                                                    name={mode.icon || 'tag'}
                                                    className="w-3.5 h-3.5 text-gold-ink shrink-0"
                                                />
                                                <span className="text-xs font-bold text-gold-ink font-mono">
                                                    {mode.id}
                                                </span>
                                                {isCurrentlyEditing && (
                                                    <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-gold-tint text-gold-ink font-bold">
                                                        Editing
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-ink-800 font-semibold mb-1 font-serif">
                                                {mode.context}
                                            </p>
                                            <p className="text-xs text-ink-500 line-clamp-2 italic font-mono">
                                                {mode.prompt}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleStartEditCustomMode(mode)}
                                                className={`transition-colors p-1 rounded hover:bg-wash ${
                                                    isCurrentlyEditing
                                                        ? 'text-gold-ink'
                                                        : 'text-ink-400 hover:text-gold-ink'
                                                }`}
                                                title="Edit Narrative Mode"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCustomMode(mode.id)}
                                                className="text-ink-400 hover:text-blush-600 transition-colors p-1 rounded hover:bg-blush-tint"
                                                title="Delete Narrative Mode"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Create / Edit mode form */}
                <div
                    className={`bg-inset p-4 sm:p-5 rounded-2xl border space-y-3.5 transition-all ${
                        editingModeId ? 'border-gold-edge shadow-xs' : 'border-edge-strong'
                    }`}
                >
                    {editingModeId ? (
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gold animate-pulse"></span>
                                <h4 className="text-xs font-bold text-gold-ink font-mono uppercase">
                                    Edit Custom Mode: {editingModeId}
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelEditCustomMode}
                                className="text-xs font-semibold text-ink-500 hover:text-ink-800 transition-colors flex items-center gap-1"
                            >
                                <X size={12} /> Cancel
                            </button>
                        </div>
                    ) : (
                        <h4 className="text-xs font-bold text-ink-800 font-mono uppercase">Create Custom Mode</h4>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Mode ID
                            {editingModeId && (
                                <span className="normal-case font-normal text-ink-400 ml-1.5">
                                    (renaming updates active scene assignments)
                                </span>
                            )}
                        </label>
                        <input
                            type="text"
                            value={newModeId}
                            onChange={(e) => setNewModeId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                            className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-1.5 text-xs font-mono text-gold-ink focus:border-gold outline-none transition-colors"
                            placeholder="e.g. DARK_CYBERPUNK"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Context / Description (for AI Weaver selection)
                        </label>
                        <input
                            type="text"
                            value={newModeContext}
                            onChange={(e) => setNewModeContext(e.target.value)}
                            className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none transition-colors"
                            placeholder="e.g. Gritty neon tech streets, focus on sensory body hacking."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Select Mode Icon
                        </label>
                        <button
                            type="button"
                            onClick={() => setIsIconPickerOpen(true)}
                            className="flex items-center gap-3 w-full bg-surface border border-edge-strong hover:border-edge-300 rounded-xl p-2 text-left transition-all group/btn shadow-2xs"
                        >
                            <div className="w-8 h-8 rounded-lg bg-inset border border-edge-strong flex items-center justify-center text-gold-ink shrink-0 group-hover/btn:border-gold/50 transition-colors">
                                <Icon name={newModeIcon} className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-ink-800 truncate">
                                    {AVAILABLE_ICONS.find((ico) => ico.value === newModeIcon)?.label || newModeIcon}
                                </div>
                                <div className="text-xs text-ink-400 mt-0.5">Click to choose from the icon library</div>
                            </div>
                            <ChevronDown
                                size={14}
                                className="text-ink-400 group-hover/btn:text-ink-600 transition-colors"
                            />
                        </button>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-ink-500 uppercase font-mono mb-1">
                            Prompt Injection Instructions (for Writing Agent)
                        </label>
                        <textarea
                            value={newModePrompt}
                            onChange={(e) => setNewModePrompt(e.target.value)}
                            className="w-full h-20 bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 focus:border-gold outline-none transition-colors resize-none leading-relaxed"
                            placeholder="e.g. CURRENT LENS: DARK CYBERPUNK. Point the camera at mechanical hums, oily rain, and synthetic implants. Sentences should feel metallic..."
                        />
                    </div>
                    {editingModeId ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSaveCustomMode}
                                className="flex-1 bg-btn hover:bg-btn-hover text-btn-ink font-bold py-2 rounded-xl text-xs transition-all shadow-sm flex justify-center items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                                <Check size={14} /> Update Narrative Mode
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelEditCustomMode}
                                className="px-4 bg-surface hover:bg-wash border border-edge-strong text-ink-700 font-semibold py-2 rounded-xl text-xs transition-all shadow-2xs flex justify-center items-center gap-1 cursor-pointer"
                            >
                                <X size={14} /> Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleSaveCustomMode}
                            className="w-full bg-btn hover:bg-btn-hover text-btn-ink font-bold py-2 rounded-xl text-xs transition-all shadow-sm flex justify-center items-center gap-1 active:scale-95 cursor-pointer"
                        >
                            <Plus size={14} /> Add Narrative Mode
                        </button>
                    )}
                </div>
            </div>

            {/* AI Slop & Naming Audit Manager (2D) */}
            <div className="pt-6 border-t border-edge-strong space-y-4" data-testid="slop-settings-manager">
                {/* Header + Import/Export/Reset */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                                AI Slop &amp; Naming Audit
                            </label>
                            <span className="px-2 py-0.5 rounded-full bg-inset border border-edge text-[10px] font-mono text-ink-600">
                                {effSlop.categories.length} categories · {effSlop.patterns.length} patterns · Em-dash:{' '}
                                {slopConfig?.emDashMode === 'strict'
                                    ? 'Strict 0'
                                    : slopConfig?.emDashMode === 'off'
                                      ? 'Off'
                                      : `≤${slopConfig?.emDashMaxPer1k ?? 3}/1k`}
                            </span>
                            {importedPackName && (
                                <span className="px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-[10px] font-mono text-sage-800">
                                    Pack: {importedPackName}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-ink-500 mt-1">
                            Hard defects always trigger surgical cleanup; Flag hits escalate when clustered (2+ in a
                            paragraph or 3+ per scene) or in final 2 scene-closer sentences.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <label className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-surface hover:bg-lift border border-edge-strong text-ink-800 flex items-center gap-1.5 transition-all">
                            <Upload size={12} />
                            <span>Import JSON</span>
                            <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                data-testid="slop-import-input"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImportSlopJson(f);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={handleExportSlopJson}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-surface hover:bg-lift border border-edge-strong text-ink-800 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <Download size={12} />
                            <span>Export JSON</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                requestConfirm({
                                    title: 'Restore Default AI Slop Configuration?',
                                    message:
                                        'This restores the built-in categories, sets Em-Dash policy to Density, Custom User Phrases to Flag, and clears any imported custom JSON pack.',
                                    confirmLabel: 'Restore Defaults',
                                    danger: false,
                                    onConfirm: handleResetSlopConfig
                                });
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gold-ink hover:text-[#6B4F20] border border-edge hover:border-gold/40 bg-inset transition-colors cursor-pointer"
                        >
                            Restore Defaults
                        </button>
                    </div>
                </div>

                {/* Core Pipeline & Em-Dash Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-wash border border-edge cursor-pointer">
                        <input
                            type="checkbox"
                            checked={slopConfig?.enableSlopAudit !== false}
                            onChange={(e) =>
                                setSlopConfig((prev) => ({
                                    ...(prev || DEFAULT_SLOP_CONFIG),
                                    enableSlopAudit: e.target.checked
                                }))
                            }
                            className="mt-0.5 accent-[#9A7432]"
                        />
                        <div>
                            <div className="text-xs font-bold text-ink-900">Enable AI Slop Audit</div>
                            <div className="text-[11px] text-ink-500 mt-0.5">
                                Scan drafts, inject audit into Polish, &amp; gate Surgical Editor.
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-wash border border-edge cursor-pointer">
                        <input
                            type="checkbox"
                            checked={slopConfig?.enableUpstreamNameAudit !== false}
                            onChange={(e) =>
                                setSlopConfig((prev) => ({
                                    ...(prev || DEFAULT_SLOP_CONFIG),
                                    enableUpstreamNameAudit: e.target.checked
                                }))
                            }
                            className="mt-0.5 accent-[#9A7432]"
                        />
                        <div>
                            <div className="text-xs font-bold text-ink-900">Upstream Name &amp; Place Auto-Rename</div>
                            <div className="text-[11px] text-ink-500 mt-0.5">
                                Auto-replace stock/overdrawn names at cast &amp; scene spawn before writing.
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-wash border border-edge cursor-pointer">
                        <input
                            type="checkbox"
                            checked={slopConfig?.enableNameBank !== false}
                            onChange={(e) =>
                                setSlopConfig((prev) => ({
                                    ...(prev || DEFAULT_SLOP_CONFIG),
                                    enableNameBank: e.target.checked
                                }))
                            }
                            className="mt-0.5 accent-[#9A7432]"
                        />
                        <div>
                            <div className="text-xs font-bold text-ink-900">Real-Name Bank</div>
                            <div className="text-[11px] text-ink-500 mt-0.5">
                                Offer real names for the story&apos;s time and place, and flag made-up ones.
                            </div>
                        </div>
                    </label>

                    <div className="p-3 rounded-xl bg-wash border border-edge space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-ink-900">Em-Dash Policy</span>
                            {slopConfig?.emDashMode === 'density' && (
                                <div className="flex items-center gap-1 text-[11px] font-mono text-ink-600">
                                    <span>Max</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={25}
                                        value={slopConfig?.emDashMaxPer1k ?? 3}
                                        onChange={(e) => {
                                            const n = Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 3));
                                            setSlopConfig((prev) => ({
                                                ...(prev || DEFAULT_SLOP_CONFIG),
                                                emDashMaxPer1k: n
                                            }));
                                        }}
                                        className="w-12 bg-surface border border-edge-strong rounded px-1.5 py-0.5 text-center text-xs font-mono text-ink-900"
                                    />
                                    <span>/1k</span>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-1 bg-surface p-1 rounded-lg border border-edge">
                            {([
                                { id: 'off', label: 'Off' },
                                { id: 'density', label: 'Density' },
                                { id: 'strict', label: 'Strict 0' }
                            ] as const).map((opt) => {
                                const active = (slopConfig?.emDashMode || 'density') === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setEmDashMode(opt.id)}
                                        className={`py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                            active ? 'bg-btn text-btn-ink shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Search Filter */}
                <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-2.5 text-ink-400 pointer-events-none" />
                    <input
                        type="text"
                        value={slopSearchQuery}
                        onChange={(e) => setSlopSearchQuery(e.target.value)}
                        placeholder="Filter slop categories or search for a phrase/name..."
                        className="w-full bg-inset border border-edge-strong rounded-xl pl-9 pr-8 py-2 text-xs text-ink-800 focus:border-gold outline-none transition-colors"
                    />
                    {slopSearchQuery && (
                        <button
                            type="button"
                            onClick={() => setSlopSearchQuery('')}
                            className="absolute right-2.5 top-2 text-ink-400 hover:text-ink-800 cursor-pointer"
                            title="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Grouped Category Accordions */}
                <div className="space-y-3">
                    {groupMeta.map((grp) => {
                        const entries: SlopManagerEntry[] =
                            grp.id === 'patterns_rhythm'
                                ? [
                                      ...effSlop.patterns.map((p) => ({
                                          id: p.id,
                                          title: p.title,
                                          severity: p.severity,
                                          note: p.note,
                                          isRuleOnly: true,
                                          items: [],
                                          match: 'pattern'
                                      })),
                                      ...effSlop.density.map((d) => ({
                                          id: d.id,
                                          title: d.title,
                                          severity: d.severity,
                                          isRuleOnly: true,
                                          items: [],
                                          match: 'density'
                                      }))
                                  ]
                                : effSlop.categories
                                      .filter((c) => c.group === grp.id)
                                      .map((c) => ({
                                          id: c.id,
                                          title: c.title,
                                          severity: c.severity || 'flag',
                                          match: c.match || 'phrase',
                                          note: c.note,
                                          items: c.items || []
                                      }));

                        const filteredEntries = qLow
                            ? entries.filter(
                                  (en) =>
                                      en.title.toLowerCase().includes(qLow) ||
                                      en.id.toLowerCase().includes(qLow) ||
                                      en.items.some((it) => it.toLowerCase().includes(qLow))
                              )
                            : entries;
                        if (filteredEntries.length === 0 && qLow) return null;
                        const isGrpOpen = qLow ? true : Boolean(expandedSlopGroups[grp.id]);

                        return (
                            <div key={grp.id} className="rounded-xl border border-edge-strong bg-wash overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedSlopGroups((prev) => ({ ...prev, [grp.id]: !isGrpOpen }))
                                    }
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-inset transition-colors cursor-pointer"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            {isGrpOpen ? (
                                                <ChevronDown size={15} className="text-ink-500 shrink-0" />
                                            ) : (
                                                <ChevronRight size={15} className="text-ink-500 shrink-0" />
                                            )}
                                            <span className="text-xs font-bold text-ink-900">{grp.label}</span>
                                            <span className="text-[10px] font-mono text-ink-500 bg-surface px-1.5 py-0.5 rounded border border-edge">
                                                {filteredEntries.length}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-ink-500 mt-0.5 pl-5 truncate">{grp.desc}</p>
                                    </div>
                                </button>

                                {isGrpOpen && (
                                    <div className="border-t border-edge divide-y divide-edge bg-surface">
                                        {filteredEntries.map((entry) => {
                                            const isCatOpen = qLow ? true : Boolean(expandedSlopCategories[entry.id]);
                                            const matchingItems = qLow
                                                ? entry.items.filter(
                                                      (it) =>
                                                          it.toLowerCase().includes(qLow) ||
                                                          entry.title.toLowerCase().includes(qLow)
                                                  )
                                                : entry.items;

                                            return (
                                                <div key={entry.id} className="p-3 space-y-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="flex items-start gap-2 min-w-0">
                                                            {!entry.isRuleOnly && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setExpandedSlopCategories((prev) => ({
                                                                            ...prev,
                                                                            [entry.id]: !isCatOpen
                                                                        }))
                                                                    }
                                                                    className="mt-0.5 text-ink-400 hover:text-ink-900 cursor-pointer shrink-0"
                                                                    title={isCatOpen ? 'Collapse items' : 'Expand items'}
                                                                >
                                                                    {isCatOpen ? (
                                                                        <ChevronDown size={14} />
                                                                    ) : (
                                                                        <ChevronRight size={14} />
                                                                    )}
                                                                </button>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            !entry.isRuleOnly &&
                                                                            setExpandedSlopCategories((prev) => ({
                                                                                ...prev,
                                                                                [entry.id]: !isCatOpen
                                                                            }))
                                                                        }
                                                                        className={`text-xs font-bold text-ink-800 text-left ${
                                                                            !entry.isRuleOnly
                                                                                ? 'hover:text-gold-ink cursor-pointer'
                                                                                : ''
                                                                        }`}
                                                                    >
                                                                        {entry.title}
                                                                    </button>
                                                                    <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.2 rounded bg-inset border border-edge">
                                                                        {entry.isRuleOnly
                                                                            ? entry.match
                                                                            : `${entry.items.length} · ${entry.match}`}
                                                                    </span>
                                                                </div>
                                                                {entry.note && (
                                                                    <p className="text-[11px] text-ink-500 mt-0.5">
                                                                        {entry.note}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Hard / Flag / Off Severity Toggle */}
                                                        <div className="inline-flex items-center rounded-lg border border-edge bg-inset p-0.5 shrink-0 self-start sm:self-center">
                                                            {(['hard', 'flag', 'off'] as const).map((sevOpt) => {
                                                                const isAct = entry.severity === sevOpt;
                                                                const actClass =
                                                                    sevOpt === 'hard'
                                                                        ? 'bg-blush-tint text-blush-700 border border-blush-edge font-bold'
                                                                        : sevOpt === 'flag'
                                                                          ? 'bg-gold/20 text-gold-ink border border-gold/40 font-bold'
                                                                          : 'bg-surface text-ink-600 border border-edge-strong font-bold';
                                                                return (
                                                                    <button
                                                                        key={sevOpt}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleSeverityPill(entry.id, sevOpt)
                                                                        }
                                                                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase cursor-pointer transition-all ${
                                                                            isAct
                                                                                ? actClass
                                                                                : 'text-ink-400 hover:text-ink-800'
                                                                        }`}
                                                                    >
                                                                        {sevOpt}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {!entry.isRuleOnly && isCatOpen && (
                                                        <div className="pl-5 space-y-2 pt-1">
                                                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto bg-inset p-2.5 rounded-xl border border-edge">
                                                                {matchingItems.length === 0 ? (
                                                                    <span className="text-xs text-ink-400 italic">
                                                                        No phrases in this category.
                                                                    </span>
                                                                ) : (
                                                                    matchingItems.map((phrase, idx) => (
                                                                        <span
                                                                            key={`${phrase}-${idx}`}
                                                                            className="inline-flex items-center gap-1 bg-surface text-ink-800 border border-edge-strong px-2 py-0.5 rounded-full text-[11px] font-mono"
                                                                        >
                                                                            <span>{phrase}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleRemoveSlopCategoryItem(
                                                                                        entry.id,
                                                                                        phrase
                                                                                    )
                                                                                }
                                                                                className="text-ink-400 hover:text-blush-600 transition-colors cursor-pointer"
                                                                                title={`Remove "${phrase}"`}
                                                                            >
                                                                                <X size={11} />
                                                                            </button>
                                                                        </span>
                                                                    ))
                                                                )}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={
                                                                        entry.id === 'custom_user'
                                                                            ? newBannedPhraseInput
                                                                            : newCategoryItemInputs[entry.id] || ''
                                                                    }
                                                                    onChange={(e) =>
                                                                        entry.id === 'custom_user'
                                                                            ? setNewBannedPhraseInput(e.target.value)
                                                                            : setNewCategoryItemInputs((prev) => ({
                                                                                  ...prev,
                                                                                  [entry.id]: e.target.value
                                                                              }))
                                                                    }
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            if (entry.id === 'custom_user') {
                                                                                handleAddBannedPhrase();
                                                                            } else {
                                                                                handleAddSlopCategoryItem(
                                                                                    entry.id,
                                                                                    newCategoryItemInputs[entry.id]
                                                                                );
                                                                            }
                                                                        }
                                                                    }}
                                                                    placeholder={`Add term to ${entry.title}...`}
                                                                    className="flex-1 bg-inset border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        entry.id === 'custom_user'
                                                                            ? handleAddBannedPhrase()
                                                                            : handleAddSlopCategoryItem(
                                                                                  entry.id,
                                                                                  newCategoryItemInputs[entry.id]
                                                                              )
                                                                    }
                                                                    className="bg-btn hover:bg-btn-hover text-btn-ink font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer active:scale-95"
                                                                >
                                                                    <Plus size={13} /> Add
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
