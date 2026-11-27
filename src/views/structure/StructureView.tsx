/**
 * @module views/structure/StructureView
 * Acts & Sequences outline view (`view === 'structure'`) and Sequence / Chapter Dashboard
 * (`view === 'sequence_dashboard' | 'chapter_dashboard'`), sharing `SceneRow` cards and audio actions.
 */

import type React from 'react';
import { VIEW_LABELS } from '@/config';
import {
    ArrowLeft,
    BookOpen,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Download,
    EditButton,
    EditorialSubNav,
    Headphones,
    Layers,
    Loader2,
    Pause,
    Plus,
    RefreshCw,
    SceneRow,
    Sparkles,
    StoryResetDropdown,
    type EditorialSubNavProps,
    type SceneRowData
} from '@/components';
import type { StoryResetStageKey } from '@/domain/lifecycle';
import { actForSequence, parseActNumber } from '@/domain/story';
import { parseMarkdown } from '@/utils';

export interface StructureActItem {
    number?: number;
    title?: string;
    description?: string;
    act_mandate?: string;
    [key: string]: unknown;
}

export interface StructureSequenceItem {
    number?: number;
    title?: string;
    parent_act?: number | string | null;
    sequence_function?: string;
    tactical_question?: string;
    four_corner_movement?: string;
    description?: string;
    summary?: string;
    [key: string]: unknown;
}

export interface StructureSceneItem extends SceneRowData {
    scene_idx?: number;
    [key: string]: unknown;
}

export interface StructureProseEntry {
    final?: string;
    draft?: string;
    stale?: { reason?: string } | null;
    [key: string]: unknown;
}

export interface StructureStory {
    acts?: StructureActItem[];
    sequences?: StructureSequenceItem[];
    scenes: Record<string, Array<Record<string, unknown>>>;
    prose?: Record<string, StructureProseEntry | string | null | undefined>;
    cast?: unknown[];
    lore?: unknown[];
    [key: string]: unknown;
}

export interface StructureRequestConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm?: () => void;
}

export interface StructureViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: StructureStory;
    setStory: (updater: (prev: StructureStory) => StructureStory) => void;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    setSelectedSequence: (seqIdx: number) => void;
    selectedScene: number | null;
    setSelectedScene: (sceneIdx: number) => void;
    activeActTab: number;
    setActiveActTab: (tabIdx: number) => void;
    expandedSequences: Record<number, boolean>;
    toggleSequence: (seqIdx: number) => void;
    toggleAllSequencesInAct: (
        actIdx: number,
        shouldExpand: boolean,
        seqIndices: number[]
    ) => void;
    loading: boolean;
    enableNarrativeLenses: boolean;
    allNarrativeModes: Record<string, unknown>;
    getModeIcon: (modeKey: string) => string;
    getSceneProseText: (storyObj: StructureStory, seqIdx: number, sceneIdx: number) => string;
    getSceneAudioStatus: (seqIdx: number, sceneIdx: number) => { status?: string };
    availableSceneAudioMap: Record<string, unknown>;
    availableSequenceAudioMap: Record<string, unknown>;
    isAnyAudioPlaying: boolean;
    isExportingSceneAudio: boolean;
    isExportingSequenceAudio: boolean;
    isExportingStoryAudio: boolean;
    enterReaderMode: (seqIdx?: number | null, sceneIdx?: number | null) => void;
    generateActsAndSequences: () => void | Promise<void>;
    handleResetStoryStage: (stage: StoryResetStageKey) => void;
    handleAddScene: (seqIdx: number, insertIdx?: number) => void;
    handleDeleteScene: (seqIdx: number, sceneIdx: number) => void;
    handleMoveScene: (seqIdx: number, sceneIdx: number, delta: number) => void;
    handleDownloadSceneAudio: (seqIdx: number, sceneIdx: number) => void | Promise<void>;
    handleDownloadSequenceAudio: (seqIdx: number) => void | Promise<void>;
    playSceneAudio: (
        targetSeq: number | null,
        targetScene: number | null,
        opts?: Record<string, unknown>
    ) => void | Promise<void>;
    playStoredOrLiveSceneAudio: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { enterReader?: boolean; syncView?: boolean }
    ) => void;
    stopAllAudioPlayback: () => void;
    requestConfirm: (opts: StructureRequestConfirmOptions) => unknown;
    requestSceneWeaving: (seqIdx: number) => void | Promise<void>;
    requestSequenceWeaving: () => void | Promise<void>;
    updateSceneBlueprint: (
        seqIdx: number,
        sceneIdx: number,
        patch: Record<string, unknown>
    ) => void;
    openEditModal: (title: string, initialVal: string, onSave: (val: string) => void) => void;
    showToast: (msg: string, type?: string) => void;
}

function hasSceneProseEntry(
    proseEntry: StructureProseEntry | string | null | undefined
): boolean {
    if (!proseEntry) return false;
    if (typeof proseEntry === 'string') return Boolean(proseEntry);
    return Boolean(proseEntry.final || proseEntry.draft || proseEntry);
}

function getStaleMeta(
    proseEntry: StructureProseEntry | string | null | undefined
): { reason?: string } | null {
    if (!proseEntry || typeof proseEntry === 'string') return null;
    return proseEntry.stale ?? null;
}

export function StructureView({
    view,
    setView,
    story,
    setStory,
    isInspectorMode,
    selectedSequence,
    setSelectedSequence,
    selectedScene,
    setSelectedScene,
    activeActTab,
    setActiveActTab,
    expandedSequences,
    toggleSequence,
    toggleAllSequencesInAct,
    loading,
    enableNarrativeLenses,
    allNarrativeModes,
    getModeIcon,
    getSceneProseText,
    getSceneAudioStatus,
    availableSceneAudioMap,
    availableSequenceAudioMap,
    isAnyAudioPlaying,
    isExportingSceneAudio,
    isExportingSequenceAudio,
    isExportingStoryAudio,
    enterReaderMode,
    generateActsAndSequences,
    handleResetStoryStage,
    handleAddScene,
    handleDeleteScene,
    handleMoveScene,
    handleDownloadSceneAudio,
    handleDownloadSequenceAudio,
    playSceneAudio,
    playStoredOrLiveSceneAudio,
    stopAllAudioPlayback,
    requestConfirm,
    requestSceneWeaving,
    requestSequenceWeaving,
    updateSceneBlueprint,
    openEditModal,
    showToast
}: StructureViewProps) {
    if (view === 'structure') {
        const hasExplicitActs = Array.isArray(story.acts) && story.acts.length > 0;
        const hasSequences = Array.isArray(story.sequences) && story.sequences.length > 0;
        const displayActs: StructureActItem[] = hasExplicitActs
            ? story.acts || []
            : hasSequences
              ? [
                    {
                        number: 1,
                        title: 'Act I — Setup & Inciting Incident',
                        description:
                            'The exposition, inciting incident, and the protagonist taking up the dramatic question.'
                    },
                    {
                        number: 2,
                        title: 'Act II — Confrontation & Midpoint',
                        description:
                            'Rising stakes, trials, the major midpoint reversal, and the dark night of the soul.'
                    },
                    {
                        number: 3,
                        title: 'Act III — Climax & Resolution',
                        description:
                            'The final confrontation, highest tension, resolution of main tension, and aftermath.'
                    }
                ]
              : [];
        const hasStructure = displayActs.length > 0;
        const safeActTab = Math.min(
            Math.max(0, activeActTab || 0),
            Math.max(0, displayActs.length - 1)
        );

        return (
            <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-24">
                <EditorialSubNav
                    activeView={view}
                    onSelectView={setView}
                    story={story as EditorialSubNavProps['story']}
                    isInspectorMode={isInspectorMode}
                    selectedSequence={selectedSequence}
                    selectedScene={selectedScene}
                />
                {/* Page Header */}
                <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                            <Layers className="text-gold-ink" size={22} /> {VIEW_LABELS.structure}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <StoryResetDropdown
                            story={story}
                            onResetStage={handleResetStoryStage}
                            availableSceneAudioMap={availableSceneAudioMap}
                            disabled={loading}
                            compact={true}
                            align="right"
                        />
                        {!hasStructure ? (
                            <button
                                onClick={() => generateActsAndSequences()}
                                disabled={loading}
                                className="px-4 py-2.5 rounded-xl font-bold text-xs bg-btn hover:bg-btn-hover text-btn-ink shadow-sm transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Sparkles size={14} className="text-amber-300 fill-current" />{' '}
                                Generate Acts &amp; Sequences
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        requestConfirm({
                                            title: 'Regenerate Acts & Sequences?',
                                            message:
                                                'Regenerating will overwrite existing acts, sequences, and downstream outline structure. Are you sure you wish to continue?',
                                            confirmLabel: 'Recreate Structure',
                                            danger: true,
                                            onConfirm: () => {
                                                generateActsAndSequences();
                                            }
                                        });
                                    }}
                                    disabled={loading}
                                    className="px-3.5 py-2 rounded-xl font-bold text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <RefreshCw size={12} /> Recreate Acts
                                </button>
                                {(!story.sequences || story.sequences.length < 8) && (
                                    <button
                                        onClick={() => requestSequenceWeaving()}
                                        disabled={loading}
                                        className="px-4 py-2 rounded-xl font-bold text-xs bg-btn hover:bg-btn-hover text-btn-ink shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Sparkles
                                            size={14}
                                            className="text-amber-300 fill-current"
                                        />{' '}
                                        {!story.sequences || story.sequences.length === 0
                                            ? 'Weave Sequences'
                                            : 'Complete Sequences'}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Empty Acts Callout Banner when no acts exist */}
                {!hasStructure && (
                    <div className="p-12 bg-surface rounded-2xl border border-edge text-center space-y-4 shadow-sm animate-fade-in">
                        <div className="w-14 h-14 rounded-2xl bg-gold-tint border border-gold-edge flex items-center justify-center mx-auto text-gold-ink shadow-sm">
                            <Layers size={26} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-bold font-serif text-ink-900">
                                No Acts Structured Yet
                            </h3>
                            <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
                                Your story overview is ready. Generate the 3-Act narrative
                                architecture (Tier 2.1) and sequences (Tier 2.2) to structure the
                                novel.
                            </p>
                        </div>
                        <div className="pt-2">
                            <button
                                onClick={() => generateActsAndSequences()}
                                disabled={loading}
                                className="bg-btn hover:bg-btn-hover text-btn-ink font-bold px-6 py-3 rounded-xl text-xs shadow-md transition-all active:scale-95 inline-flex items-center gap-2 disabled:opacity-50"
                            >
                                <Sparkles size={14} className="text-amber-300 fill-current" />{' '}
                                Generate Acts &amp; Sequences (Tier 2.1 &amp; 2.2)
                            </button>
                        </div>
                    </div>
                )}

                {/* Connected Act Timeline Tabs */}
                {hasStructure && (
                    <div className="act-timeline-track">
                        {displayActs.map((act, idx) => {
                            const actNum = parseActNumber(act.number || idx + 1, idx + 1);
                            const cleanTitle = act.title
                                ? act.title.replace(/^Act\s+[0-9IVXLCDM]+[:\s-]*/i, '').trim()
                                : '';
                            const displayTitle = cleanTitle
                                ? `Act ${actNum}: ${cleanTitle}`
                                : act.title
                                  ? /^Act\s+/i.test(act.title)
                                      ? act.title
                                      : `Act ${actNum}: ${act.title}`
                                  : `Act ${actNum}`;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setActiveActTab(idx)}
                                    className={`act-node-btn ${safeActTab === idx ? 'active' : ''}`}
                                >
                                    <span className="act-node-badge">{actNum}</span>
                                    <span className="truncate font-serif">{displayTitle}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Active Act Content Panel */}
                {hasStructure &&
                    displayActs.map((act, idx) => {
                        if (idx !== safeActTab) return null;
                        const actNum = parseActNumber(act.number || idx + 1, idx + 1);
                        const actSequences = (story.sequences || [])
                            .map((seq, sIdx) => ({ ...seq, origIdx: sIdx }))
                            .filter((seq) => {
                                const pAct = parseActNumber(
                                    seq.parent_act != null
                                        ? seq.parent_act
                                        : actForSequence(seq.number || seq.origIdx + 1),
                                    actForSequence(seq.origIdx + 1)
                                );
                                return pAct === actNum;
                            });
                        const isAllExpanded =
                            actSequences.length > 0 &&
                            actSequences.every((seq) => !!expandedSequences[seq.origIdx]);
                        const actDesc = act.description || act.act_mandate || '';
                        return (
                            <div
                                key={idx}
                                className="bg-surface rounded-2xl border border-edge shadow-sm overflow-hidden animate-fade-in space-y-0"
                            >
                                {/* Act Banner Header */}
                                <div className="p-6 sm:p-7 border-b border-edge bg-inset">
                                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-2xl font-bold font-serif text-ink-900 flex items-center gap-2 text-wrap break-words">
                                                {act.title}
                                                <EditButton
                                                    title={`Act ${actNum} Title`}
                                                    value={act.title || ''}
                                                    onSave={() =>
                                                        openEditModal(
                                                            `Act ${actNum} Title`,
                                                            act.title || '',
                                                            (val) => {
                                                                setStory((prev) => {
                                                                    const newActs = [
                                                                        ...(prev.acts ||
                                                                            displayActs)
                                                                    ];
                                                                    newActs[idx] = {
                                                                        ...(newActs[idx] || {}),
                                                                        title: val
                                                                    };
                                                                    return {
                                                                        ...prev,
                                                                        acts: newActs
                                                                    };
                                                                });
                                                            }
                                                        )
                                                    }
                                                />
                                            </h3>
                                            <div className="text-base text-ink-800 text-wrap break-words mt-3 flex items-start gap-3 leading-relaxed">
                                                <div
                                                    className="prose dark:prose-invert max-w-none flex-1 min-w-0 text-[15px] sm:text-base text-ink-800 font-serif leading-relaxed break-words"
                                                    dangerouslySetInnerHTML={{
                                                        __html: parseMarkdown(actDesc)
                                                    }}
                                                />
                                                <EditButton
                                                    title={`Act ${actNum} Description`}
                                                    value={actDesc}
                                                    onSave={() =>
                                                        openEditModal(
                                                            `Act ${actNum} Description`,
                                                            actDesc,
                                                            (val) => {
                                                                setStory((prev) => {
                                                                    const newActs = [
                                                                        ...(prev.acts ||
                                                                            displayActs)
                                                                    ];
                                                                    newActs[idx] = {
                                                                        ...(newActs[idx] || {}),
                                                                        description: val,
                                                                        act_mandate: val
                                                                    };
                                                                    return {
                                                                        ...prev,
                                                                        acts: newActs
                                                                    };
                                                                });
                                                            }
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => requestSequenceWeaving()}
                                            disabled={loading}
                                            className="shrink-0 bg-btn px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-btn-hover text-btn-ink shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed self-start"
                                        >
                                            <Sparkles
                                                size={12}
                                                className="text-amber-300 fill-current"
                                            />{' '}
                                            {!story.sequences || story.sequences.length === 0
                                                ? 'Weave Sequences'
                                                : story.sequences.length < 8
                                                  ? 'Complete Sequences'
                                                  : 'Re-Weave Sequences'}
                                        </button>
                                    </div>

                                    {/* Single Toggle Button beneath Act description & above Sequence list */}
                                    {actSequences.length > 0 && (
                                        <div className="mt-4 pt-3.5 border-t border-edge-soft flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-xs text-ink-500 font-mono font-medium">
                                                {actSequences.length}{' '}
                                                {actSequences.length === 1
                                                    ? 'Sequence'
                                                    : 'Sequences'}{' '}
                                                in Act {actNum}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label={
                                                    isAllExpanded
                                                        ? `Collapse all sequences in Act ${actNum}`
                                                        : `Expand all sequences in Act ${actNum}`
                                                }
                                                aria-expanded={isAllExpanded}
                                                onClick={() =>
                                                    toggleAllSequencesInAct(
                                                        idx,
                                                        !isAllExpanded,
                                                        actSequences.map((s) => s.origIdx)
                                                    )
                                                }
                                                className="text-xs text-ink-700 hover:text-ink-900 font-semibold px-3 py-1.5 rounded-xl bg-surface border border-edge-strong hover:bg-lift transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                                            >
                                                {isAllExpanded ? (
                                                    <ChevronUp size={14} />
                                                ) : (
                                                    <ChevronDown size={14} />
                                                )}
                                                <span>
                                                    {isAllExpanded ? 'Collapse All' : 'Expand All'}
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Vertical Sequences Stack (Accordion) */}
                                <div className="divide-y divide-edge">
                                    {actSequences.map((sequence) => {
                                        const seqIdx = sequence.origIdx;
                                        const seqScenes = (story.scenes?.[String(seqIdx)] ||
                                            []) as StructureSceneItem[];
                                        const isExpanded = !!expandedSequences[seqIdx];

                                        let seqDrafted = 0;
                                        let seqReady = 0;
                                        seqScenes.forEach((_, sIdx) => {
                                            if (getSceneProseText(story, seqIdx, sIdx))
                                                seqDrafted++;
                                            if (getSceneAudioStatus(seqIdx, sIdx).status === 'ready')
                                                seqReady++;
                                        });
                                        const showSeqAudioBtn =
                                            seqDrafted > 0 ||
                                            seqReady > 0 ||
                                            Boolean(availableSequenceAudioMap?.[String(seqIdx)]);

                                        return (
                                            <div
                                                key={seqIdx}
                                                className={`transition-colors ${
                                                    isExpanded
                                                        ? 'bg-surface border-l-4 border-gold'
                                                        : 'bg-inset hover:bg-lift border-l-4 border-transparent'
                                                }`}
                                            >
                                                <div
                                                    onClick={() => toggleSequence(seqIdx)}
                                                    className="p-5 cursor-pointer flex flex-col md:flex-row md:justify-between md:items-center gap-3 select-none"
                                                >
                                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleSequence(seqIdx);
                                                            }}
                                                            className="text-ink-400 hover:text-ink-800 p-1 rounded-lg hover:bg-wash transition-colors shrink-0 mt-0.5"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronDown size={17} />
                                                            ) : (
                                                                <ChevronRight size={17} />
                                                            )}
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                <span className="text-xs font-bold text-gold-ink uppercase bg-gold-tint border border-gold-edge px-2.5 py-0.5 rounded-full font-mono">
                                                                    Sequence{' '}
                                                                    {sequence.number || seqIdx + 1}
                                                                </span>
                                                                {sequence.sequence_function && (
                                                                    <span className="text-xs font-medium text-ink-600 bg-mist-100 border border-edge-strong px-2.5 py-0.5 rounded-md font-mono">
                                                                        {sequence.sequence_function}
                                                                    </span>
                                                                )}
                                                                {seqScenes.length > 0 && (
                                                                    <span className="text-xs font-semibold bg-mist-100 text-ink-600 px-2.5 py-0.5 rounded-full border border-edge-strong">
                                                                        {seqScenes.length}{' '}
                                                                        {seqScenes.length === 1
                                                                            ? 'scene'
                                                                            : 'scenes'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="font-serif font-bold text-base text-ink-900 flex items-center gap-2">
                                                                {sequence.title}
                                                                <span
                                                                    onClick={(e) =>
                                                                        e.stopPropagation()
                                                                    }
                                                                >
                                                                    <EditButton
                                                                        title={`Sequence ${sequence.number || seqIdx + 1} Title`}
                                                                        value={sequence.title || ''}
                                                                        onSave={() =>
                                                                            openEditModal(
                                                                                `Sequence ${sequence.number || seqIdx + 1} Title`,
                                                                                sequence.title ||
                                                                                    '',
                                                                                (val) => {
                                                                                    setStory(
                                                                                        (prev) => {
                                                                                            const newSeqs =
                                                                                                [
                                                                                                    ...(prev.sequences ||
                                                                                                        [])
                                                                                                ];
                                                                                            newSeqs[
                                                                                                seqIdx
                                                                                            ] = {
                                                                                                ...(newSeqs[
                                                                                                    seqIdx
                                                                                                ] ||
                                                                                                    {}),
                                                                                                title: val
                                                                                            };
                                                                                            return {
                                                                                                ...prev,
                                                                                                sequences:
                                                                                                    newSeqs
                                                                                            };
                                                                                        }
                                                                                    );
                                                                                }
                                                                            )
                                                                        }
                                                                    />
                                                                </span>
                                                            </h4>
                                                            {sequence.tactical_question && (
                                                                <div className="text-xs text-ember-900 bg-ember-tint border border-ember-edge p-2.5 rounded-xl italic mt-1.5">
                                                                    <span className="font-bold uppercase text-xs not-italic text-ember-800 font-mono mr-1.5">
                                                                        Tactical Question:
                                                                    </span>
                                                                    {sequence.tactical_question}
                                                                </div>
                                                            )}
                                                            {sequence.four_corner_movement && (
                                                                <div className="text-xs text-gold-ink bg-gold-tint/40 border border-gold-edge/60 p-2.5 rounded-xl mt-1.5 flex items-start gap-2">
                                                                    <span className="font-bold uppercase text-xs not-italic text-gold-ink font-mono shrink-0">
                                                                        ⚖️ Four-Corner Dialectic:
                                                                    </span>
                                                                    <span className="font-serif italic text-ink-800 flex-1">
                                                                        {
                                                                            sequence.four_corner_movement
                                                                        }
                                                                    </span>
                                                                    <span
                                                                        onClick={(e) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                    >
                                                                        <EditButton
                                                                            title={`Sequence ${sequence.number || seqIdx + 1} Four-Corner Dialectic`}
                                                                            value={
                                                                                sequence.four_corner_movement
                                                                            }
                                                                            onSave={() =>
                                                                                openEditModal(
                                                                                    `Sequence ${sequence.number || seqIdx + 1} Four-Corner Dialectic`,
                                                                                    sequence.four_corner_movement ||
                                                                                        '',
                                                                                    (val) => {
                                                                                        setStory(
                                                                                            (
                                                                                                prev
                                                                                            ) => {
                                                                                                const newSeqs =
                                                                                                    [
                                                                                                        ...(prev.sequences ||
                                                                                                            [])
                                                                                                    ];
                                                                                                newSeqs[
                                                                                                    seqIdx
                                                                                                ] =
                                                                                                    {
                                                                                                        ...(newSeqs[
                                                                                                            seqIdx
                                                                                                        ] ||
                                                                                                            {}),
                                                                                                        four_corner_movement:
                                                                                                            val
                                                                                                    };
                                                                                                return {
                                                                                                    ...prev,
                                                                                                    sequences:
                                                                                                        newSeqs
                                                                                                };
                                                                                            }
                                                                                        );
                                                                                    }
                                                                                )
                                                                            }
                                                                        />
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {(sequence.description ||
                                                                sequence.summary) && (
                                                                <p className="text-sm sm:text-[15px] text-ink-700 mt-2 line-clamp-3 leading-relaxed font-serif">
                                                                    {sequence.description ||
                                                                        sequence.summary}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div
                                                        className="flex items-center gap-2 shrink-0 self-end md:self-auto"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {showSeqAudioBtn && (
                                                            <button
                                                                onClick={() =>
                                                                    handleDownloadSequenceAudio(
                                                                        seqIdx
                                                                    )
                                                                }
                                                                disabled={
                                                                    isExportingSequenceAudio ||
                                                                    isExportingSceneAudio ||
                                                                    isExportingStoryAudio
                                                                }
                                                                className={`flex items-center gap-1 border px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all disabled:opacity-40 cursor-pointer ${
                                                                    seqDrafted > 0 &&
                                                                    seqReady >= seqDrafted
                                                                        ? 'bg-sage-tint hover:bg-sage-tint-strong border-sage-edge text-sage-800'
                                                                        : 'text-ink-600 hover:text-ink-900 bg-surface border-edge-strong hover:border-edge-300'
                                                                }`}
                                                                title={
                                                                    seqReady > 0
                                                                        ? `Stitch saved scene audio (${seqReady}/${seqDrafted || seqScenes.length}) and export Sequence ${sequence.number || seqIdx + 1} MP3`
                                                                        : `Generate & export Sequence ${sequence.number || seqIdx + 1} MP3`
                                                                }
                                                            >
                                                                {isExportingSequenceAudio ? (
                                                                    <Loader2
                                                                        size={12}
                                                                        className="animate-spin text-gold"
                                                                    />
                                                                ) : (
                                                                    <Download
                                                                        size={12}
                                                                        className={
                                                                            seqDrafted > 0 &&
                                                                            seqReady >= seqDrafted
                                                                                ? 'text-sage-700'
                                                                                : 'text-gold'
                                                                        }
                                                                    />
                                                                )}
                                                                <span>
                                                                    {seqReady > 0
                                                                        ? `MP3 ${seqReady}/${seqDrafted || seqScenes.length}`
                                                                        : 'MP3'}
                                                                </span>
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedSequence(seqIdx);
                                                                setView('sequence_dashboard');
                                                            }}
                                                            className="bg-surface hover:bg-wash border border-edge-strong text-ink-700 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer"
                                                        >
                                                            Dashboard
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!isExpanded)
                                                                    toggleSequence(seqIdx);
                                                                handleAddScene(seqIdx);
                                                            }}
                                                            className="bg-surface hover:bg-wash border border-edge-strong text-ink-700 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                                            title="Add a new scene at the end of this sequence"
                                                        >
                                                            <Plus
                                                                size={12}
                                                                className="text-gold-ink"
                                                            />{' '}
                                                            Add Scene
                                                        </button>
                                                        {seqScenes.length === 0 && (
                                                            <button
                                                                onClick={() =>
                                                                    requestSceneWeaving(seqIdx)
                                                                }
                                                                disabled={loading}
                                                                className="shrink-0 bg-[#5B8A72] hover:bg-[#4a725e] px-3.5 py-1.5 rounded-xl font-bold text-xs text-white shadow-2xs transition-all active:scale-95 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                            >
                                                                <Sparkles
                                                                    size={11}
                                                                    fill="currentColor"
                                                                />{' '}
                                                                Weave Scenes
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Expanded Sequence View with Numbered Scene Rows */}
                                                {isExpanded && seqScenes.length > 0 && (
                                                    <div className="animate-fade-in border-t border-edge bg-surface">
                                                        <div className="divide-y divide-edge">
                                                            {seqScenes.map((s, si) => (
                                                                <SceneRow
                                                                    key={si}
                                                                    variant="structure"
                                                                    scene={s}
                                                                    sceneIdx={si}
                                                                    seqIdx={seqIdx}
                                                                    totalScenes={seqScenes.length}
                                                                    proseStale={getStaleMeta(
                                                                        story.prose?.[
                                                                            `${seqIdx}-${si}`
                                                                        ]
                                                                    )}
                                                                    sequence={sequence}
                                                                    getModeIcon={getModeIcon}
                                                                    allNarrativeModes={
                                                                        allNarrativeModes
                                                                    }
                                                                    openEditModal={openEditModal}
                                                                    onUpdateField={
                                                                        updateSceneBlueprint
                                                                    }
                                                                    onMoveScene={handleMoveScene}
                                                                    onAddSceneAfter={handleAddScene}
                                                                    setStory={
                                                                        setStory as unknown as NonNullable<
                                                                            React.ComponentProps<
                                                                                typeof SceneRow
                                                                            >['setStory']
                                                                        >
                                                                    }
                                                                    showToast={showToast}
                                                                    setSelectedSequence={
                                                                        setSelectedSequence
                                                                    }
                                                                    setSelectedScene={
                                                                        setSelectedScene
                                                                    }
                                                                    setView={setView}
                                                                    handleDeleteScene={
                                                                        handleDeleteScene
                                                                    }
                                                                    enableNarrativeLenses={
                                                                        enableNarrativeLenses
                                                                    }
                                                                    handleDownloadSceneAudio={
                                                                        handleDownloadSceneAudio
                                                                    }
                                                                    isExportingSceneAudio={
                                                                        isExportingSceneAudio
                                                                    }
                                                                    hasProse={hasSceneProseEntry(
                                                                        story.prose?.[
                                                                            `${seqIdx}-${si}`
                                                                        ]
                                                                    )}
                                                                    availableSceneAudioMap={
                                                                        availableSceneAudioMap
                                                                    }
                                                                    getSceneAudioStatus={
                                                                        getSceneAudioStatus
                                                                    }
                                                                    playStoredOrLiveSceneAudio={
                                                                        playStoredOrLiveSceneAudio
                                                                    }
                                                                    isAnyAudioPlaying={
                                                                        isAnyAudioPlaying
                                                                    }
                                                                    stopAllAudioPlayback={
                                                                        stopAllAudioPlayback
                                                                    }
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
            </div>
        );
    }

    if (
        (view === 'sequence_dashboard' || view === 'chapter_dashboard') &&
        selectedSequence !== null
    ) {
        const sequence = (story.sequences || [])[selectedSequence];
        if (!sequence) return null;
        const dashScenes = (story.scenes?.[String(selectedSequence)] || []) as StructureSceneItem[];

        let dashDrafted = 0;
        let dashReady = 0;
        let firstPlayableIdx = 0;
        let foundFirst = false;
        dashScenes.forEach((_, sIdx) => {
            const hasP = Boolean(getSceneProseText(story, selectedSequence, sIdx));
            const isR = getSceneAudioStatus(selectedSequence, sIdx).status === 'ready';
            if (hasP) dashDrafted++;
            if (isR) dashReady++;
            if (!foundFirst && (hasP || isR)) {
                firstPlayableIdx = sIdx;
                foundFirst = true;
            }
        });
        const hasAudioOrProse =
            dashDrafted > 0 ||
            dashReady > 0 ||
            Boolean(availableSequenceAudioMap?.[String(selectedSequence)]);
        const allReady = dashDrafted > 0 && dashReady >= dashDrafted;

        return (
            <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
                <EditorialSubNav
                    activeView={view}
                    onSelectView={setView}
                    story={story as EditorialSubNavProps['story']}
                    isInspectorMode={isInspectorMode}
                    selectedSequence={selectedSequence}
                    selectedScene={selectedScene}
                />
                <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm">
                    <button
                        onClick={() => setView('structure')}
                        className="text-xs text-ink-500 flex items-center gap-1.5 mb-4 hover:text-ink-900 transition-colors font-medium"
                    >
                        <ArrowLeft size={13} /> Back to Sequence
                    </button>
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-xs font-mono font-bold text-gold-ink uppercase bg-gold-tint border border-gold-edge px-2.5 py-0.5 rounded-full">
                                    Act{' '}
                                    {parseActNumber(
                                        sequence.parent_act,
                                        actForSequence(sequence.number || selectedSequence + 1)
                                    )}{' '}
                                    — Sequence {sequence.number || selectedSequence + 1}
                                </span>
                                {sequence.sequence_function && (
                                    <span className="text-xs font-bold text-ink-700 bg-mist-100 border border-edge-strong px-2.5 py-0.5 rounded-full">
                                        {sequence.sequence_function}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 flex items-center gap-2 tracking-tight">
                                {sequence.title}
                                <EditButton
                                    title="Sequence Title"
                                    value={sequence.title || ''}
                                    onSave={() =>
                                        openEditModal(
                                            'Sequence Title',
                                            sequence.title || '',
                                            (val) => {
                                                setStory((prev) => {
                                                    const newSeqs = [...(prev.sequences || [])];
                                                    newSeqs[selectedSequence] = {
                                                        ...(newSeqs[selectedSequence] || {}),
                                                        title: val
                                                    };
                                                    return { ...prev, sequences: newSeqs };
                                                });
                                            }
                                        )
                                    }
                                />
                            </h2>
                            {sequence.tactical_question && (
                                <div className="text-xs text-ember-900 bg-ember-tint border border-ember-edge p-3 rounded-xl italic mt-3">
                                    <span className="font-bold uppercase text-xs not-italic text-ember-800 font-mono mr-1.5">
                                        Tactical Question:
                                    </span>
                                    {sequence.tactical_question}
                                </div>
                            )}
                            {sequence.four_corner_movement && (
                                <div className="text-xs text-gold-ink bg-gold-tint/40 border border-gold-edge/60 p-3 rounded-xl mt-3 flex items-start gap-2">
                                    <span className="font-bold uppercase text-xs not-italic text-gold-ink font-mono shrink-0">
                                        ⚖️ Four-Corner Dialectic:
                                    </span>
                                    <span className="font-serif italic text-ink-800 flex-1">
                                        {sequence.four_corner_movement}
                                    </span>
                                    <EditButton
                                        title="Sequence Four-Corner Dialectic"
                                        value={sequence.four_corner_movement}
                                        onSave={() =>
                                            openEditModal(
                                                'Sequence Four-Corner Dialectic',
                                                sequence.four_corner_movement || '',
                                                (val) => {
                                                    setStory((prev) => {
                                                        const newSeqs = [
                                                            ...(prev.sequences || [])
                                                        ];
                                                        newSeqs[selectedSequence] = {
                                                            ...(newSeqs[selectedSequence] || {}),
                                                            four_corner_movement: val
                                                        };
                                                        return { ...prev, sequences: newSeqs };
                                                    });
                                                }
                                            )
                                        }
                                    />
                                </div>
                            )}
                            {(sequence.description || sequence.summary) && (
                                <div className="text-base text-ink-800 mt-4 flex items-start gap-3 leading-relaxed">
                                    <div
                                        className="prose dark:prose-invert max-w-none flex-1 min-w-0 text-[15px] sm:text-base text-ink-800 font-serif leading-relaxed break-words"
                                        dangerouslySetInnerHTML={{
                                            __html: parseMarkdown(
                                                sequence.description || sequence.summary || ''
                                            )
                                        }}
                                    />
                                    <EditButton
                                        title="Sequence Description"
                                        value={sequence.description || sequence.summary || ''}
                                        onSave={() =>
                                            openEditModal(
                                                'Sequence Description',
                                                sequence.description || sequence.summary || '',
                                                (val) => {
                                                    setStory((prev) => {
                                                        const newSeqs = [
                                                            ...(prev.sequences || [])
                                                        ];
                                                        newSeqs[selectedSequence] = {
                                                            ...(newSeqs[selectedSequence] || {}),
                                                            description: val,
                                                            summary: val
                                                        };
                                                        return { ...prev, sequences: newSeqs };
                                                    });
                                                }
                                            )
                                        }
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap self-start">
                            <button
                                onClick={() => enterReaderMode(selectedSequence, 0)}
                                className="bg-surface hover:bg-lift text-ink-800 border border-edge-strong px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                            >
                                <BookOpen size={13} className="text-gold-ink" /> Read Sequence
                            </button>
                            {hasAudioOrProse && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isAnyAudioPlaying) {
                                            stopAllAudioPlayback();
                                            return;
                                        }
                                        enterReaderMode(selectedSequence, firstPlayableIdx);
                                        setTimeout(
                                            () =>
                                                playSceneAudio(selectedSequence, firstPlayableIdx, {
                                                    autoplay: true,
                                                    follow: true
                                                }),
                                            80
                                        );
                                    }}
                                    className={`border px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                                        isAnyAudioPlaying
                                            ? 'bg-gold-tint hover:bg-gold/25 border-gold-edge text-gold-ink'
                                            : dashReady > 0
                                              ? 'bg-sage-tint hover:bg-sage-tint-strong border-sage-edge text-sage-900'
                                              : 'bg-gold-tint hover:bg-gold/25 border-gold-edge text-gold-ink'
                                    }`}
                                    title={
                                        isAnyAudioPlaying
                                            ? 'Pause / Stop playing audio'
                                            : dashReady > 0
                                              ? 'Listen to Sequence starting with saved audio'
                                              : 'Listen to Sequence with live narration'
                                    }
                                >
                                    {isAnyAudioPlaying ? (
                                        <Pause size={13} className="fill-current text-gold-ink" />
                                    ) : (
                                        <Headphones
                                            size={13}
                                            className={
                                                dashReady > 0 ? 'text-sage-800' : 'text-gold-ink'
                                            }
                                        />
                                    )}
                                    <span>{isAnyAudioPlaying ? 'Pause' : 'Listen'}</span>
                                </button>
                            )}
                            {hasAudioOrProse && (
                                <button
                                    onClick={() => handleDownloadSequenceAudio(selectedSequence)}
                                    disabled={
                                        isExportingSequenceAudio ||
                                        isExportingSceneAudio ||
                                        isExportingStoryAudio
                                    }
                                    className={`border px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                                        allReady
                                            ? 'bg-sage-tint hover:bg-sage-tint-strong border-sage-edge text-sage-800'
                                            : 'bg-surface hover:bg-lift text-ink-800 border-edge-strong'
                                    }`}
                                    title={
                                        dashReady > 0
                                            ? `Stitch saved scene audio (${dashReady}/${dashDrafted || dashScenes.length}) into a Sequence MP3`
                                            : 'Generate & export Sequence MP3'
                                    }
                                >
                                    {isExportingSequenceAudio ? (
                                        <Loader2 size={13} className="animate-spin text-gold" />
                                    ) : (
                                        <Download
                                            size={13}
                                            className={allReady ? 'text-sage-700' : 'text-gold'}
                                        />
                                    )}
                                    <span>
                                        {isExportingSequenceAudio
                                            ? 'Exporting MP3...'
                                            : dashReady > 0
                                              ? `Sequence MP3 (${dashReady}/${dashDrafted || dashScenes.length})`
                                              : 'Sequence MP3'}
                                    </span>
                                </button>
                            )}
                            <button
                                onClick={() => requestSceneWeaving(selectedSequence)}
                                disabled={loading}
                                className="shrink-0 bg-btn hover:bg-btn-hover text-btn-ink px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed self-start"
                            >
                                <Sparkles size={13} className="text-btn-accent" />{' '}
                                {dashScenes.length > 0 ? 'Re-Weave Scenes' : 'Weave Scenes'}
                            </button>
                        </div>
                    </div>
                </div>

                {dashScenes.length > 0 && (
                    <div className="bg-surface rounded-2xl border border-edge shadow-sm overflow-hidden">
                        <div className="p-4 sm:p-5 bg-mist-50/60 border-b border-edge-strong flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                                Scenes ({dashScenes.length})
                            </h3>
                            <button
                                type="button"
                                onClick={() => handleAddScene(selectedSequence)}
                                className="bg-surface hover:bg-lift border border-edge-strong text-ink-800 px-3 py-1.5 rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <Plus size={13} className="text-gold-ink" /> Add Scene
                            </button>
                        </div>
                        <div className="divide-y divide-edge-soft">
                            {dashScenes.map((s, si) => (
                                <SceneRow
                                    key={si}
                                    variant="dashboard"
                                    scene={s}
                                    sceneIdx={si}
                                    seqIdx={selectedSequence}
                                    totalScenes={dashScenes.length}
                                    proseStale={getStaleMeta(
                                        story.prose?.[`${selectedSequence}-${si}`]
                                    )}
                                    sequence={sequence}
                                    getModeIcon={getModeIcon}
                                    allNarrativeModes={allNarrativeModes}
                                    openEditModal={openEditModal}
                                    onUpdateField={updateSceneBlueprint}
                                    onMoveScene={handleMoveScene}
                                    onAddSceneAfter={handleAddScene}
                                    setStory={
                                        setStory as unknown as NonNullable<
                                            React.ComponentProps<typeof SceneRow>['setStory']
                                        >
                                    }
                                    showToast={showToast}
                                    setSelectedSequence={setSelectedSequence}
                                    setSelectedScene={setSelectedScene}
                                    setView={setView}
                                    handleDeleteScene={handleDeleteScene}
                                    enableNarrativeLenses={enableNarrativeLenses}
                                    handleDownloadSceneAudio={handleDownloadSceneAudio}
                                    isExportingSceneAudio={isExportingSceneAudio}
                                    hasProse={hasSceneProseEntry(
                                        story.prose?.[`${selectedSequence}-${si}`]
                                    )}
                                    availableSceneAudioMap={availableSceneAudioMap}
                                    getSceneAudioStatus={getSceneAudioStatus}
                                    playStoredOrLiveSceneAudio={playStoredOrLiveSceneAudio}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    stopAllAudioPlayback={stopAllAudioPlayback}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {dashScenes.length === 0 && (
                    <div className="text-center py-20 bg-surface rounded-2xl border border-edge p-8 shadow-sm space-y-4">
                        <Sparkles className="w-12 h-12 text-gold/50 mx-auto" />
                        <div>
                            <p className="font-serif text-lg font-bold text-ink-800">
                                No scenes yet
                            </p>
                            <p className="text-ink-500 text-xs mt-1">
                                Click &quot;Weave Scenes&quot; above to generate 4–12 scenes, or
                                add one manually.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleAddScene(selectedSequence)}
                            className="inline-flex items-center gap-1.5 bg-surface hover:bg-lift border border-edge-strong text-ink-800 px-4 py-2 rounded-xl font-bold text-xs shadow-2xs transition-all cursor-pointer"
                        >
                            <Plus size={14} className="text-gold-ink" /> Add Scene Manually
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return null;
}
