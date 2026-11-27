/**
 * @module views/writer/WriterManuscriptPane
 * Manuscript workspace pane: Dramatic Beats drawer, Slop Audit drawer,
 * scene illustrations, inline serif editor, and formatted prose canvas.
 */

import React, { useRef } from 'react';
import {
    AlertTriangle,
    Anchor,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Edit3,
    Image,
    Layers,
    Loader2,
    Paintbrush,
    PenTool,
    Plus,
    RefreshCw,
    Sparkles,
    Trash2,
    Wand2,
    X,
    Feather,
    EditButton,
    HumanStructuredValue
} from '@/components';
import { PassageRewriteBar } from './PassageRewriteBar';
import { storyStore } from '@/services/storage';
import { countWords, formatReaderProse, readingMinutes } from '@/utils';
import type {
    WriterBeatRecord,
    WriterManuscriptPaneProps,
    WriterProseRecord
} from './types';

const STRUCTURAL_SLOP_IDS = new Set([
    'not_x_but_y',
    'triad',
    'em_dash',
    'smart_quotes',
    'echo_chamber',
    'punctuation_collapse',
    'question_free_dialogue'
]);

function formatBeatAnalysisBlock(raw: unknown): string {
    if (!raw) return '';
    if (typeof raw === 'object') {
        try {
            return JSON.stringify(raw, null, 2);
        } catch {
            return String(raw);
        }
    }
    return String(raw).trim();
}

function formatBeatAtmosphere(raw: WriterBeatRecord['atmosphere_and_feel']): string {
    if (!raw) return '';
    if (typeof raw === 'object') {
        const anchorsSource = Array.isArray(raw.cognitive_sensory_filters)
            ? raw.cognitive_sensory_filters.join('\n- ')
            : Array.isArray(raw.sensory_anchors)
              ? raw.sensory_anchors.join('\n- ')
              : String(raw.sensory_anchors || raw.cognitive_sensory_filters || '');
        const parts: string[] = [];
        if (raw.mood) parts.push(`Mood: ${raw.mood}`);
        if (anchorsSource) parts.push(`Sensory Filters:\n- ${anchorsSource}`);
        if (raw.subtext) parts.push(`Subtext: ${raw.subtext}`);
        return parts.join('\n\n');
    }
    return String(raw).trim();
}

function getBeatPivotText(beat: WriterBeatRecord): string {
    if (beat.beat_structure && typeof beat.beat_structure === 'object') {
        return String(beat.beat_structure.pivot || beat.beat_structure.start || '');
    }
    if (beat.pivot) return String(beat.pivot);
    if (beat.beat_structure) return String(beat.beat_structure);
    return '';
}

export const WriterManuscriptPane: React.FC<WriterManuscriptPaneProps> = ({
    isVisible,
    writerBeatKey,
    selectedSequence,
    selectedScene,
    story,
    storyRef,
    setStory,
    isInspectorMode,
    collapsedBeats,
    toggleBeats,
    expandedBeatAnalysis,
    toggleBeatAnalysis,
    loading,
    loadingImages,
    loadedImages,
    isRunningManualSlopClean,
    writerSlopAudit,
    slopAuditDrawerOpen,
    setSlopAuditDrawerOpen,
    slopAuditFilter,
    setSlopAuditFilter,
    slopAllowlistExpanded,
    setSlopAllowlistExpanded,
    isEditingProseInline,
    setIsEditingProseInline,
    inlineProseDraft,
    setInlineProseDraft,
    handleAutoGenerateScene,
    handleAddBeat,
    handleBeatChange,
    handleDeleteBeat,
    generateSceneImage,
    generateBeatImage,
    deleteSceneImage,
    deleteBeatImage,
    handleRunManualSlopClean,
    handleRewritePassage,
    handleAddStoryAllowlistItem,
    handleRemoveStoryAllowlistItem,
    openEditModal,
    openCritiqueModal,
    showToast
}) => {
    const inlineProseBoxRef = useRef<HTMLTextAreaElement | null>(null);
    const rawBeats = story.beats?.[writerBeatKey];
    const beatsList: WriterBeatRecord[] = Array.isArray(rawBeats)
        ? (rawBeats as WriterBeatRecord[])
        : [];
    const isBeatsCollapsed = Boolean(collapsedBeats[writerBeatKey]);

    const rawSceneProse = story.prose?.[writerBeatKey];
    const sceneProseObj: WriterProseRecord | null =
        rawSceneProse && typeof rawSceneProse === 'object'
            ? (rawSceneProse as WriterProseRecord)
            : typeof rawSceneProse === 'string' && rawSceneProse.trim()
              ? { final: rawSceneProse }
              : null;

    const commitInlineProse = () => {
        setStory((prev) => {
            const existing = prev.prose?.[writerBeatKey];
            const baseObj: WriterProseRecord =
                existing && typeof existing === 'object' ? { ...(existing as WriterProseRecord) } : {};
            const updatedEntry: WriterProseRecord = {
                ...baseObj,
                final: inlineProseDraft,
                user_edited: true
            };
            delete updatedEntry.stale;
            const nextState = {
                ...prev,
                prose: {
                    ...(prev.prose || {}),
                    [writerBeatKey]: updatedEntry
                }
            };
            storyRef.current = nextState;
            if (storyStore?.saveStory && prev.id) {
                storyStore.saveStory(prev.id, nextState).catch(console.warn);
            }
            return nextState;
        });
        setIsEditingProseInline(false);
        showToast('Scene prose updated and saved.', 'success');
    };

    return (
        <div className={isVisible ? 'block min-w-0' : 'hidden'}>
            <div className="space-y-4">
                {beatsList.length > 0 && (
                    <div className="px-4 sm:px-6 pt-4">
                        {isBeatsCollapsed ? (
                            <button
                                onClick={() => toggleBeats(writerBeatKey)}
                                className="w-full flex items-center justify-between gap-3 bg-inset hover:border-gold/50 border border-edge-strong px-4 py-2.5 rounded-xl transition-all group cursor-pointer"
                                title="Expand Beats panel"
                            >
                                <div className="flex items-center gap-2">
                                    <Layers
                                        size={15}
                                        className="text-gold-ink group-hover:scale-110 transition-transform"
                                    />
                                    <span className="text-xs font-bold uppercase tracking-wider font-mono text-ink-800">
                                        Dramatic Beats ({beatsList.length})
                                    </span>
                                </div>
                                <span className="text-xs text-gold-ink bg-gold-tint border border-gold-edge px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                    <ChevronRight size={12} /> Show
                                </span>
                            </button>
                        ) : (
                            <div className="bg-inset p-4 rounded-xl border border-edge-strong flex flex-col space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-edge-strong">
                                    <div className="flex items-center gap-2">
                                        <Layers size={14} className="text-gold-ink" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                            Dramatic Beats ({beatsList.length})
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleBeats(writerBeatKey)}
                                        className="text-xs text-ink-500 hover:text-ink-900 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface hover:bg-lift border border-edge-strong transition-colors font-medium cursor-pointer shadow-2xs"
                                        title="Collapse Beats panel"
                                    >
                                        <ChevronDown size={12} /> Collapse
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {beatsList.map((beat, bi) => {
                                        const bId = `${writerBeatKey}-${bi}`;
                                        const pivotText = getBeatPivotText(beat);
                                        const charIntentFormatted = formatBeatAnalysisBlock(beat.character_intent);
                                        const atmosphereFormatted = formatBeatAtmosphere(beat.atmosphere_and_feel);
                                        const epistemicFormatted = formatBeatAnalysisBlock(beat.epistemic_boundaries);
                                        const authorialFormatted = formatBeatAnalysisBlock(beat.authorial_intent);
                                        const hasAnalysisDetails = Boolean(
                                            charIntentFormatted ||
                                                atmosphereFormatted ||
                                                epistemicFormatted ||
                                                authorialFormatted
                                        );
                                        const isAnalysisExpanded = Boolean(expandedBeatAnalysis[bId]);

                                        return (
                                            <React.Fragment key={bi}>
                                                <div className="p-4 rounded-2xl border bg-surface border-edge transition-all shadow-sm space-y-2.5">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-bold font-mono text-gold-ink">
                                                                BEAT {bi + 1}
                                                            </span>
                                                            {beat.beat_type && (
                                                                <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-mist-100 border border-edge-strong text-ink-700 font-mono">
                                                                    {beat.beat_type}
                                                                </span>
                                                            )}
                                                            {beat.tactic && (
                                                                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-iris-tint border border-iris-edge text-iris-700 font-mono">
                                                                    <span className="font-bold">Tactic:</span>{' '}
                                                                    {beat.tactic}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                onClick={() =>
                                                                    generateBeatImage(
                                                                        selectedSequence,
                                                                        selectedScene,
                                                                        bi
                                                                    )
                                                                }
                                                                disabled={Boolean(loadingImages[bId] || loading)}
                                                                className="w-6 h-6 rounded-lg bg-mist-50 hover:bg-wash text-ink-500 hover:text-ink-900 border border-edge-strong flex items-center justify-center transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                                                                title={
                                                                    loadedImages[bId]
                                                                        ? 'Regenerate Beat Image'
                                                                        : 'Generate Beat Image'
                                                                }
                                                            >
                                                                {loadingImages[bId] ? (
                                                                    <Loader2
                                                                        size={12}
                                                                        className="animate-spin text-gold-ink"
                                                                    />
                                                                ) : (
                                                                    <Paintbrush size={12} />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    handleDeleteBeat(
                                                                        selectedSequence,
                                                                        selectedScene,
                                                                        bi
                                                                    )
                                                                }
                                                                className="w-6 h-6 rounded-lg bg-mist-50 hover:bg-blush-tint text-ink-400 hover:text-blush-600 border border-edge-strong flex items-center justify-center transition-colors p-0.5 cursor-pointer"
                                                                title="Delete Beat"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {(beat.initiator || beat.reactor || beat.participants) && (
                                                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                                            {beat.initiator && (
                                                                <span className="bg-sage-tint border border-sage-edge text-sage-800 px-2 py-0.5 rounded-full font-medium font-mono flex items-center gap-1">
                                                                    <span className="text-ink-500 font-bold uppercase text-xs">
                                                                        Init:
                                                                    </span>{' '}
                                                                    {beat.initiator}
                                                                </span>
                                                            )}
                                                            {beat.reactor && beat.reactor !== '—' && (
                                                                <span className="bg-ember-tint border border-ember-edge text-ember-800 px-2 py-0.5 rounded-full font-medium font-mono flex items-center gap-1">
                                                                    <span className="text-ink-500 font-bold uppercase text-xs">
                                                                        React:
                                                                    </span>{' '}
                                                                    {beat.reactor}
                                                                </span>
                                                            )}
                                                            {beat.reactor === '—' && (
                                                                <span className="bg-mist-100 border border-edge-strong text-ink-600 px-2 py-0.5 rounded-full font-medium font-mono italic">
                                                                    Solo Beat
                                                                </span>
                                                            )}
                                                            {beat.participants && beat.participants !== 'None' && (
                                                                <span className="bg-wash border border-edge text-ink-700 px-2 py-0.5 rounded-full font-medium font-mono flex items-center gap-1">
                                                                    <span className="text-ink-500 font-bold text-xs">
                                                                        +
                                                                    </span>{' '}
                                                                    {beat.participants}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="text-xs font-bold text-sage-800 uppercase block mb-1.5 font-mono">
                                                            Stimulus Action (Motivation):
                                                        </span>
                                                        <textarea
                                                            className="w-full bg-inset text-ink-800 text-sm font-medium p-3 rounded-xl border border-edge-strong hover:border-edge-300 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none resize-y transition-colors min-h-[60px] leading-relaxed shadow-2xs"
                                                            value={
                                                                beat.action !== undefined && beat.action !== null
                                                                    ? beat.action
                                                                    : beat.char_A_action ||
                                                                      (!beat.reaction
                                                                          ? beat.description ||
                                                                            beat.action_description ||
                                                                            ''
                                                                          : '')
                                                            }
                                                            onChange={(e) =>
                                                                handleBeatChange(
                                                                    selectedSequence,
                                                                    selectedScene,
                                                                    bi,
                                                                    'action',
                                                                    e.target.value
                                                                )
                                                            }
                                                            rows={2}
                                                            placeholder="Describe the stimulus action or dialogue..."
                                                        />
                                                    </div>
                                                    {beat.reactor !== '—' ||
                                                    (typeof beat.reaction === 'string' && beat.reaction !== '—') ? (
                                                        <div>
                                                            <span className="text-xs font-bold text-ember-800 uppercase block mb-1.5 font-mono">
                                                                {isInspectorMode
                                                                    ? 'Reaction (Swain MRU):'
                                                                    : 'Emotional Reaction:'}
                                                            </span>
                                                            <textarea
                                                                className="w-full bg-inset text-ink-800 text-sm font-medium p-3 rounded-xl border border-edge-strong hover:border-edge-300 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none resize-y transition-colors min-h-[60px] leading-relaxed shadow-2xs"
                                                                value={
                                                                    beat.reaction && beat.reaction !== '—'
                                                                        ? beat.reaction
                                                                        : beat.char_B_reaction &&
                                                                            beat.char_B_reaction !== '—'
                                                                          ? beat.char_B_reaction
                                                                          : ''
                                                                }
                                                                onChange={(e) =>
                                                                    handleBeatChange(
                                                                        selectedSequence,
                                                                        selectedScene,
                                                                        bi,
                                                                        'reaction',
                                                                        e.target.value
                                                                    )
                                                                }
                                                                rows={2}
                                                                placeholder="Describe visceral reaction (Feeling -> Action -> Speech)..."
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="pt-0.5">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleBeatChange(
                                                                        selectedSequence,
                                                                        selectedScene,
                                                                        bi,
                                                                        'reaction',
                                                                        ''
                                                                    )
                                                                }
                                                                className="text-xs text-ink-500 hover:text-ember-700 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                                                            >
                                                                {isInspectorMode
                                                                    ? '+ Add Reaction (MRU)'
                                                                    : '+ Add Emotional Reaction'}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {beat.anchor && beat.anchor !== '—' && (
                                                        <div className="bg-gold-tint/60 p-3 rounded-xl border border-gold-edge text-xs space-y-1">
                                                            <span className="text-xs font-bold text-gold-ink uppercase font-mono flex items-center gap-1">
                                                                <Anchor size={12} className="text-gold-ink" /> Plot
                                                                Anchor:
                                                            </span>
                                                            <p className="text-sm text-ink-900 font-medium leading-relaxed">
                                                                {beat.anchor}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {(pivotText || beat.power_shift) && (
                                                        <div className="bg-ember-tint p-3 rounded-xl border border-ember-edge text-xs text-ink-800 space-y-2">
                                                            {pivotText && (
                                                                <div>
                                                                    <span className="text-xs font-bold text-ember-900 uppercase font-mono block mb-1">
                                                                        Dramatic Pivot:
                                                                    </span>
                                                                    <p className="text-sm text-ember-950 font-medium leading-relaxed">
                                                                        {pivotText}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {beat.power_shift && (
                                                                <div className="pt-1.5 border-t border-ember-edge flex items-center gap-2 text-xs text-ember-800 font-mono">
                                                                    <span className="font-bold uppercase">
                                                                        Power Shift:
                                                                    </span>
                                                                    <span className="font-sans font-medium text-ink-800">
                                                                        {beat.power_shift}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {hasAnalysisDetails && (
                                                        <div className="border border-edge-strong rounded-xl overflow-hidden bg-mist-50/40">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleBeatAnalysis(bId)}
                                                                className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-bold uppercase font-mono text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors cursor-pointer"
                                                            >
                                                                <span className="flex items-center gap-1.5">
                                                                    <Sparkles size={12} className="text-gold-ink" />{' '}
                                                                    Analysis & Directives
                                                                </span>
                                                                <span className="flex items-center gap-1 text-xs text-gold-ink font-semibold">
                                                                    {isAnalysisExpanded ? (
                                                                        <ChevronDown size={12} />
                                                                    ) : (
                                                                        <ChevronRight size={12} />
                                                                    )}
                                                                    {isAnalysisExpanded ? 'Hide' : 'Show Details'}
                                                                </span>
                                                            </button>
                                                            {isAnalysisExpanded && (
                                                                <div className="p-3.5 pt-2.5 space-y-3 text-xs border-t border-edge-strong bg-surface">
                                                                    {charIntentFormatted && (
                                                                        <div>
                                                                            <span className="text-xs font-bold text-iris-800 uppercase block mb-1 font-mono">
                                                                                Character Intent & Speech Acts:
                                                                            </span>
                                                                            {isInspectorMode ? (
                                                                                <pre className="text-xs sm:text-sm text-ink-800 bg-iris-tint p-2.5 rounded-lg border border-iris-edge font-sans whitespace-pre-wrap leading-relaxed">
                                                                                    {charIntentFormatted}
                                                                                </pre>
                                                                            ) : (
                                                                                <div className="text-xs sm:text-sm text-ink-800 bg-iris-tint p-2.5 rounded-lg border border-iris-edge font-sans leading-relaxed">
                                                                                    <HumanStructuredValue
                                                                                        value={
                                                                                            beat.character_intent ||
                                                                                            charIntentFormatted
                                                                                        }
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {atmosphereFormatted && (
                                                                        <div>
                                                                            <span className="text-xs font-bold text-lagoon-800 uppercase block mb-1 font-mono">
                                                                                Atmosphere & Cognitive Filters:
                                                                            </span>
                                                                            {isInspectorMode ? (
                                                                                <pre className="text-xs sm:text-sm text-ink-800 bg-lagoon-tint p-2.5 rounded-lg border border-lagoon-edge font-sans whitespace-pre-wrap leading-relaxed">
                                                                                    {atmosphereFormatted}
                                                                                </pre>
                                                                            ) : (
                                                                                <div className="text-xs sm:text-sm text-ink-800 bg-lagoon-tint p-2.5 rounded-lg border border-lagoon-edge font-sans leading-relaxed">
                                                                                    <HumanStructuredValue
                                                                                        value={
                                                                                            beat.atmosphere_and_feel ||
                                                                                            atmosphereFormatted
                                                                                        }
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {epistemicFormatted && (
                                                                        <div>
                                                                            <span className="text-xs font-bold text-plum-800 uppercase block mb-1 font-mono">
                                                                                Epistemic Boundaries:
                                                                            </span>
                                                                            {isInspectorMode ? (
                                                                                <pre className="text-xs sm:text-sm text-ink-800 bg-plum-tint p-2.5 rounded-lg border border-plum-edge font-sans whitespace-pre-wrap leading-relaxed">
                                                                                    {epistemicFormatted}
                                                                                </pre>
                                                                            ) : (
                                                                                <div className="text-xs sm:text-sm text-ink-800 bg-plum-tint p-2.5 rounded-lg border border-plum-edge font-sans leading-relaxed">
                                                                                    <HumanStructuredValue
                                                                                        value={
                                                                                            beat.epistemic_boundaries ||
                                                                                            epistemicFormatted
                                                                                        }
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {authorialFormatted && (
                                                                        <div>
                                                                            <span className="text-xs font-bold text-blush-800 uppercase block mb-1 font-mono">
                                                                                Authorial Intent:
                                                                            </span>
                                                                            {isInspectorMode ? (
                                                                                <pre className="text-xs sm:text-sm text-ink-800 bg-blush-tint p-2.5 rounded-lg border border-blush-edge font-sans whitespace-pre-wrap leading-relaxed">
                                                                                    {authorialFormatted}
                                                                                </pre>
                                                                            ) : (
                                                                                <div className="text-xs sm:text-sm text-ink-800 bg-blush-tint p-2.5 rounded-lg border border-blush-edge font-sans leading-relaxed">
                                                                                    <HumanStructuredValue
                                                                                        value={
                                                                                            beat.authorial_intent ||
                                                                                            authorialFormatted
                                                                                        }
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {beat.emotional_shift && (
                                                        <div className="text-xs text-ink-600 uppercase font-mono font-bold italic flex items-center gap-2 pt-1">
                                                            <span>{beat.emotional_shift}</span>
                                                            <EditButton
                                                                title={`Beat ${bi + 1} Subtext`}
                                                                value={beat.emotional_shift}
                                                                onSave={() =>
                                                                    openEditModal(
                                                                        `Beat ${bi + 1} Subtext`,
                                                                        beat.emotional_shift || '',
                                                                        (val) => {
                                                                            setStory((prev) => {
                                                                                const existingBeats = prev.beats?.[
                                                                                    writerBeatKey
                                                                                ];
                                                                                const newBeats = [
                                                                                    ...(Array.isArray(existingBeats)
                                                                                        ? existingBeats
                                                                                        : [])
                                                                                ];
                                                                                newBeats[bi] = {
                                                                                    ...newBeats[bi],
                                                                                    emotional_shift: val
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    beats: {
                                                                                        ...(prev.beats || {}),
                                                                                        [writerBeatKey]: newBeats
                                                                                    }
                                                                                };
                                                                            });
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                                    {loadedImages[bId] && (
                                                        <div className="mt-2 pt-2 border-t border-edge-soft">
                                                            <div className="relative group rounded-xl overflow-hidden border border-edge-strong w-full aspect-video shadow-2xs">
                                                                <img
                                                                    src={loadedImages[bId]}
                                                                    className="w-full h-full object-cover"
                                                                    alt={`Beat ${bi + 1}`}
                                                                />
                                                                <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                    <button
                                                                        onClick={() =>
                                                                            generateBeatImage(
                                                                                selectedSequence,
                                                                                selectedScene,
                                                                                bi
                                                                            )
                                                                        }
                                                                        disabled={Boolean(loadingImages[bId] || loading)}
                                                                        className="bg-surface hover:bg-wash text-ink-900 p-2 rounded-full text-xs font-bold transition-colors shadow cursor-pointer"
                                                                        title="Regenerate Image"
                                                                    >
                                                                        <Paintbrush size={13} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() =>
                                                                            deleteBeatImage(
                                                                                selectedSequence,
                                                                                selectedScene,
                                                                                bi
                                                                            )
                                                                        }
                                                                        className="bg-rose-600 hover:bg-rose-500 text-white p-2 rounded-full text-xs font-bold transition-colors shadow cursor-pointer"
                                                                        title="Delete Image"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-center py-1">
                                                    <div className="flex-1 border-t border-edge-strong"></div>
                                                    <button
                                                        onClick={() =>
                                                            handleAddBeat(selectedSequence, selectedScene, bi)
                                                        }
                                                        className="mx-2 p-1 rounded-full border border-dashed border-edge-300 text-ink-400 hover:text-ink-900 hover:border-stone-400 transition-colors"
                                                        title="Insert beat here"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                    <div className="flex-1 border-t border-edge-strong"></div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Manuscript Prose Area */}
                <div className="w-full min-w-0">
                    {sceneProseObj && (sceneProseObj.final || sceneProseObj.draft) ? (
                        (() => {
                            const proseText = sceneProseObj.final || sceneProseObj.draft || '';
                            const wordCount = countWords(proseText);
                            const readingTime = readingMinutes(wordCount);

                            const allowlist = Array.isArray(story?.slop_allowlist) ? story.slop_allowlist : [];
                            const rawHits = Array.isArray(writerSlopAudit?.allHits)
                                ? writerSlopAudit.allHits
                                : [];
                            const filteredHits = rawHits.filter((h) => {
                                if (slopAuditFilter === 'hard') return h.severity === 'hard';
                                if (slopAuditFilter === 'flag') return h.severity === 'flag' && !h.isTrailingCloser;
                                if (slopAuditFilter === 'closer') {
                                    return Boolean(h.isTrailingCloser || h.severity === 'high_closer');
                                }
                                if (slopAuditFilter === 'rhetoric') return STRUCTURAL_SLOP_IDS.has(h.categoryId);
                                return true;
                            });

                            const hCount = writerSlopAudit?.summary?.hardCount || 0;
                            const cCount = writerSlopAudit?.summary?.closerCount || 0;
                            const fCount = rawHits.filter((h) => h.severity === 'flag').length;
                            const pillClass =
                                hCount > 0 || cCount > 0
                                    ? 'bg-blush-tint border-blush-edge text-blush-700 hover:bg-blush-tint-strong'
                                    : fCount > 0
                                      ? 'bg-surface border-gold/50 text-gold-ink hover:bg-lift'
                                      : 'bg-sage-tint border-sage-edge text-sage-800 hover:opacity-90';
                            const pillLabel =
                                hCount > 0 || cCount > 0
                                    ? `${hCount + cCount} Hard${fCount > 0 ? ` · ${fCount} Flag` : ''}`
                                    : fCount > 0
                                      ? `${fCount} Flag${fCount === 1 ? '' : 's'}`
                                      : 'Slop Clean';

                            return (
                                <div className="relative animate-fade-in min-h-[55vh]">
                                    {/* Clean Manuscript Utility Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-edge bg-inset text-xs">
                                        <div className="flex items-center gap-2.5 font-mono text-[11px] text-ink-500 whitespace-nowrap">
                                            <span className="font-bold text-ink-800">
                                                {wordCount.toLocaleString()} words
                                            </span>
                                            <span className="hidden sm:inline text-ink-300">·</span>
                                            <span className="hidden sm:inline">~{readingTime} min read</span>
                                            {sceneProseObj.final && (
                                                <span className="hidden md:inline-flex px-2 py-0.2 rounded-full bg-sage-tint border border-sage-edge text-sage-800 text-[10px] font-bold uppercase tracking-wider">
                                                    Final Polish
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                            {writerSlopAudit && (
                                                <button
                                                    type="button"
                                                    data-testid="writer-slop-badge"
                                                    onClick={() => setSlopAuditDrawerOpen((v) => !v)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap ${pillClass}`}
                                                    title="Inspect live AI Slop Audit details & run surgical clean"
                                                >
                                                    {hCount > 0 || cCount > 0 || fCount > 0 ? (
                                                        <AlertTriangle size={12} className="w-3 h-3 shrink-0" />
                                                    ) : (
                                                        <CheckCircle2 size={12} className="w-3 h-3 shrink-0" />
                                                    )}
                                                    <span>{pillLabel}</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInlineProseDraft(proseText);
                                                    setIsEditingProseInline(true);
                                                }}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface hover:bg-lift border border-edge-strong hover:border-gold/50 text-ink-800 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                                                title="Edit Prose inline"
                                            >
                                                <Edit3 size={12} className="w-3 h-3 text-gold-ink shrink-0" />
                                                <span>Edit Prose</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => generateSceneImage(selectedSequence, selectedScene)}
                                                disabled={Boolean(loadingImages[`scene_${writerBeatKey}`] || loading)}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface hover:bg-lift border border-edge-strong hover:border-gold/50 text-ink-800 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-45 whitespace-nowrap"
                                                title={
                                                    loadedImages[`scene_${writerBeatKey}`]
                                                        ? 'Regenerate Scene Illustration'
                                                        : 'Generate Scene Illustration'
                                                }
                                            >
                                                {loadingImages[`scene_${writerBeatKey}`] ? (
                                                    <Loader2
                                                        size={12}
                                                        className="w-3 h-3 animate-spin text-gold-ink shrink-0"
                                                    />
                                                ) : (
                                                    <Image size={12} className="w-3 h-3 text-ink-500 shrink-0" />
                                                )}
                                                <span>Art</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline Scene Slop Audit Drawer */}
                                    {slopAuditDrawerOpen && writerSlopAudit && (
                                        <div
                                            data-testid="writer-slop-drawer"
                                            className="border-b border-edge bg-wash px-4 sm:px-6 py-4 space-y-3 animate-fade-in"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-bold text-ink-900 font-mono uppercase tracking-wider">
                                                        Scene Slop Audit
                                                    </span>
                                                    <span className="text-[11px] font-mono text-ink-500">
                                                        {writerSlopAudit.summary?.hardCount || 0} hard ·{' '}
                                                        {writerSlopAudit.summary?.closerCount || 0} closer ·{' '}
                                                        {rawHits.filter((h) => h.severity === 'flag').length} flags ·
                                                        em-dash {writerSlopAudit.summary?.emDashPer1k ?? 0}/1k
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleRunManualSlopClean(selectedSequence, selectedScene)
                                                        }
                                                        disabled={isRunningManualSlopClean || rawHits.length === 0}
                                                        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-btn hover:bg-btn-hover text-btn-ink flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-45 active:scale-95"
                                                    >
                                                        {isRunningManualSlopClean ? (
                                                            <Loader2 size={12} className="animate-spin" />
                                                        ) : (
                                                            <Wand2 size={12} />
                                                        )}
                                                        <span>Surgical Clean</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSlopAuditDrawerOpen(false)}
                                                        className="p-1 text-ink-400 hover:text-ink-800 cursor-pointer"
                                                        title="Close audit drawer"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Filter chips */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {[
                                                    { id: 'all', label: `All (${rawHits.length})` },
                                                    {
                                                        id: 'hard',
                                                        label: `Hard (${rawHits.filter((h) => h.severity === 'hard').length})`
                                                    },
                                                    {
                                                        id: 'closer',
                                                        label: `Closer (${
                                                            rawHits.filter((h) =>
                                                                Boolean(
                                                                    h.isTrailingCloser || h.severity === 'high_closer'
                                                                )
                                                            ).length
                                                        })`
                                                    },
                                                    {
                                                        id: 'flag',
                                                        label: `Flags (${
                                                            rawHits.filter(
                                                                (h) => h.severity === 'flag' && !h.isTrailingCloser
                                                            ).length
                                                        })`
                                                    },
                                                    {
                                                        id: 'rhetoric',
                                                        label: `Rhetoric/Rhythm (${
                                                            rawHits.filter((h) => STRUCTURAL_SLOP_IDS.has(h.categoryId))
                                                                .length
                                                        })`
                                                    }
                                                ].map((fc) => (
                                                    <button
                                                        key={fc.id}
                                                        type="button"
                                                        onClick={() => setSlopAuditFilter(fc.id)}
                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono border cursor-pointer transition-colors ${
                                                            slopAuditFilter === fc.id
                                                                ? 'bg-surface border-gold text-gold-ink font-bold'
                                                                : 'bg-inset border-edge text-ink-500 hover:text-ink-800'
                                                        }`}
                                                    >
                                                        {fc.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Hit Cards */}
                                            {filteredHits.length === 0 ? (
                                                <div className="text-xs text-ink-500 italic bg-surface p-3 rounded-xl border border-edge">
                                                    No hits match the selected filter.
                                                </div>
                                            ) : (
                                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                    {filteredHits.map((hit, hi) => (
                                                        <div
                                                            key={`${hit.categoryId}-${hit.start}-${hi}`}
                                                            className="bg-surface border border-edge-strong rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                                                        >
                                                            <div className="space-y-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span
                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                                                            hit.severity === 'hard' ||
                                                                            hit.severity === 'high_closer'
                                                                                ? 'bg-blush-tint text-blush-700 border border-blush-edge'
                                                                                : 'bg-inset text-gold-ink border border-gold/40'
                                                                        }`}
                                                                    >
                                                                        {hit.severity === 'high_closer'
                                                                            ? 'closer'
                                                                            : hit.severity}
                                                                    </span>
                                                                    {(hit.isTrailingCloser ||
                                                                        hit.severity === 'high_closer') && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-blush-tint text-blush-700 border border-blush-edge">
                                                                            Final 2 Sentences
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[11px] font-bold text-ink-800">
                                                                        {hit.categoryTitle || hit.categoryId}
                                                                    </span>
                                                                    <span className="text-[11px] font-mono text-gold-ink bg-inset px-1.5 py-0.2 rounded border border-edge">
                                                                        {hit.match}
                                                                    </span>
                                                                </div>
                                                                {hit.sentence && (
                                                                    <p className="text-[11px] text-ink-600 leading-snug line-clamp-2">
                                                                        &ldquo;{hit.sentence}&rdquo;
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {hit.match && !STRUCTURAL_SLOP_IDS.has(hit.categoryId) && (
                                                                <button
                                                                    type="button"
                                                                    data-testid="slop-allow-btn"
                                                                    onClick={() => handleAddStoryAllowlistItem(hit.match)}
                                                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-inset hover:bg-lift border border-edge-strong text-ink-700 whitespace-nowrap shrink-0 cursor-pointer"
                                                                    title="Allow this term intentionally in this story"
                                                                >
                                                                    + Allow in Story
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Story Allowlist Strip */}
                                            {allowlist.length > 0 && (
                                                <div className="pt-2 border-t border-edge">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSlopAllowlistExpanded((v) => !v)}
                                                        className="text-[11px] font-mono text-ink-600 hover:text-ink-900 flex items-center gap-1 cursor-pointer"
                                                    >
                                                        {slopAllowlistExpanded ? (
                                                            <ChevronDown size={12} />
                                                        ) : (
                                                            <ChevronRight size={12} />
                                                        )}
                                                        <span>Allowed in This Story ({allowlist.length})</span>
                                                    </button>
                                                    {slopAllowlistExpanded && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {allowlist.map((term, ai) => (
                                                                <span
                                                                    key={`${term}-${ai}`}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-[10px] font-mono text-sage-800"
                                                                >
                                                                    <span>{term}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleRemoveStoryAllowlistItem(term)
                                                                        }
                                                                        className="hover:text-blush-700 cursor-pointer"
                                                                        title="Remove allowlist exemption"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="p-5 sm:p-8">
                                        {sceneProseObj.failed && (
                                            <button
                                                onClick={() =>
                                                    openCritiqueModal('Scene', String(sceneProseObj.critique || ''))
                                                }
                                                className="mb-6 text-xs bg-blush-tint border border-blush-edge text-blush-700 hover:bg-blush-tint-strong px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="View Reviewer Critique"
                                            >
                                                <AlertTriangle size={12} /> Review Validation Warning: View Objections
                                            </button>
                                        )}

                                        {/* Scene Illustration Preview Card */}
                                        {loadedImages[`scene_${writerBeatKey}`] && (
                                            <div className="mb-8 group relative rounded-2xl overflow-hidden border border-edge-strong shadow-md bg-surface/50 max-w-3xl mx-auto">
                                                <div className="relative aspect-video w-full overflow-hidden bg-inset/40">
                                                    <img
                                                        src={loadedImages[`scene_${writerBeatKey}`]}
                                                        alt="Scene Illustration"
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-4">
                                                        <span className="text-xs font-mono text-white/90 bg-black/50 backdrop-blur-xs px-2.5 py-1 rounded-md">
                                                            Scene Illustration (16:9)
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() =>
                                                                    generateSceneImage(selectedSequence, selectedScene)
                                                                }
                                                                disabled={Boolean(
                                                                    loadingImages[`scene_${writerBeatKey}`] || loading
                                                                )}
                                                                className="bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                                                                title="Regenerate Illustration"
                                                            >
                                                                <RefreshCw
                                                                    size={13}
                                                                    className={
                                                                        loadingImages[`scene_${writerBeatKey}`]
                                                                            ? 'animate-spin'
                                                                            : ''
                                                                    }
                                                                />
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    deleteSceneImage(selectedSequence, selectedScene)
                                                                }
                                                                className="bg-rose-950/70 hover:bg-rose-900 text-rose-200 backdrop-blur-xs p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                                                                title="Delete Illustration"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="px-4 py-2 border-t border-edge-subtle bg-surface/80 flex items-center justify-between text-xs text-ink-500 font-serif italic">
                                                    <span>Embedded into EPUB chapter header</span>
                                                    <span className="font-mono text-xs text-ink-400">
                                                        16:9 • High-Fidelity
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Illustration Generating Pulse Indicator */}
                                        {loadingImages[`scene_${writerBeatKey}`] &&
                                            !loadedImages[`scene_${writerBeatKey}`] && (
                                                <div className="mb-8 rounded-2xl border border-dashed border-gold-edge/60 bg-gold-tint/20 p-8 text-center max-w-3xl mx-auto animate-pulse flex flex-col items-center justify-center gap-3">
                                                    <Loader2 size={24} className="animate-spin text-gold-ink" />
                                                    <div className="text-xs font-serif font-medium text-ink-700">
                                                        Drafting image prompt from narrative prose &amp; rendering 16:9
                                                        scene illustration...
                                                    </div>
                                                    <div className="text-xs font-mono text-ink-400">
                                                        Scene Image Prompt Agent • Image Generation API
                                                    </div>
                                                </div>
                                            )}

                                        {/* Publication-Grade Manuscript Canvas & Inline Serif Editor */}
                                        {isEditingProseInline ? (
                                            <div className="space-y-4 max-w-3xl mx-auto animate-fade-in py-2">
                                                <div className="flex items-center justify-between pb-2 border-b border-gold-edge/60 text-xs">
                                                    <span className="font-mono text-gold-ink font-bold flex items-center gap-1.5">
                                                        <Edit3 size={13} /> Inline Serif Editor &mdash; Manuscript Draft
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsEditingProseInline(false);
                                                                setInlineProseDraft('');
                                                            }}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface hover:bg-lift border border-edge-strong text-ink-600 cursor-pointer"
                                                        >
                                                            Cancel (Esc)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={commitInlineProse}
                                                            className="px-3 py-1 rounded-lg text-xs font-bold bg-btn hover:bg-btn-hover text-btn-ink shadow-2xs cursor-pointer flex items-center gap-1"
                                                        >
                                                            <Check size={12} /> Save Changes
                                                        </button>
                                                    </div>
                                                </div>
                                                <textarea
                                                    ref={inlineProseBoxRef}
                                                    value={inlineProseDraft}
                                                    onChange={(e) => setInlineProseDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                                            e.preventDefault();
                                                            commitInlineProse();
                                                        } else if (e.key === 'Escape') {
                                                            setIsEditingProseInline(false);
                                                        }
                                                    }}
                                                    rows={Math.max(16, (inlineProseDraft.split('\n').length || 1) + 2)}
                                                    className="w-full font-serif text-[18px] leading-[1.85] text-ink-900 bg-surface/90 border-l-2 border-gold-edge pl-6 pr-4 py-4 rounded-r-xl border-y border-r border-edge-soft outline-none focus:ring-1 focus:ring-gold-edge transition-all shadow-inner resize-y"
                                                    placeholder="Draft or polish prose directly in publication serif..."
                                                    autoFocus
                                                />
                                                {handleRewritePassage && (
                                                    <PassageRewriteBar
                                                        seqIdx={selectedSequence}
                                                        sceneIdx={selectedScene}
                                                        draft={inlineProseDraft}
                                                        setDraft={setInlineProseDraft}
                                                        textareaRef={inlineProseBoxRef}
                                                        onRewrite={handleRewritePassage}
                                                        disabled={loading}
                                                    />
                                                )}
                                                <div className="flex justify-between items-center text-xs text-ink-400 font-mono">
                                                    <span>{countWords(inlineProseDraft).toLocaleString()} words</span>
                                                    <span>Ctrl + Enter to save &bull; Esc to cancel</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group/prose">
                                                <div
                                                    className="prose prose-stone max-w-3xl mx-auto font-serif text-[18px] leading-[1.85] text-ink-800 tracking-normal reader-prose select-text cursor-text"
                                                    onDoubleClick={() => {
                                                        setInlineProseDraft(proseText);
                                                        setIsEditingProseInline(true);
                                                    }}
                                                    dangerouslySetInnerHTML={{ __html: formatReaderProse(proseText) }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        <div className="p-10 text-center min-h-[45vh] flex flex-col justify-center items-center">
                            <div className="w-14 h-14 rounded-2xl bg-gold-tint border border-gold-edge text-gold-ink flex items-center justify-center mb-4">
                                <PenTool className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold font-serif text-ink-900 mb-2">Manuscript Canvas Empty</h3>
                            <p className="text-ink-500 text-sm max-w-md mx-auto mb-6">
                                Trigger the AI novelist engine to draft publication-ready prose for this scene.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleAutoGenerateScene(selectedSequence, selectedScene)}
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-btn hover:bg-btn-hover text-btn-ink rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                                >
                                    <Feather size={14} className="text-[#C9A96E]" /> Auto-Write Scene Prose
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
