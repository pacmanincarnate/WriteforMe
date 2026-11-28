/**
 * @module components/layout/StudioSidebar
 * Fixed collapsible studio navigation sidebar with workspace links, creative spaces,
 * manuscript hierarchy tree, system/settings links, and EPUB/TXT/JSON import & export actions.
 */

import React from 'react';
import {
    Activity,
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Headphones,
    History,
    Layers,
    Library,
    Play,
    RefreshCw,
    Settings,
    Sparkles,
    Workflow,
    X
} from '@/components/icons';
import { APP_VERSION } from '@/config';
import { actForSequence, parseActNumber } from '@/domain/story';
import type { Act, ProseEntry, SceneBlueprint, Sequence, Story } from '@/types';

export interface SidebarAudioSummary {
    readyCount: number;
    totalDrafted: number;
    [key: string]: unknown;
}

export interface SidebarSceneAudioStatus {
    status: string;
    [key: string]: unknown;
}

export interface StudioSidebarProps {
    view: string;
    setView: (viewId: string) => void;
    story: Story;
    selectedSequence: number | null;
    setSelectedSequence: (seqIdx: number | null) => void;
    selectedScene: number | null;
    setSelectedScene: (sceneIdx: number | null) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    collapsedActs: Record<number, boolean>;
    toggleAct: (actIdx: number) => void;
    loading: boolean;
    continuousAutopilot: boolean;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    storyAudioSummary: SidebarAudioSummary;
    refreshLibrary: () => void | Promise<void>;
    handleAutopilot: (opts?: { fromSetup?: boolean }) => void | Promise<void>;
    handleToggleAudioAutopilot: () => void;
    enterReaderMode: (seqIdx?: number, sceneIdx?: number) => void;
    getSceneProseText: (story: Story, seqIdx: number, sceneIdx: number) => string;
    getSceneAudioStatus: (seqIdx: number, sceneIdx: number) => SidebarSceneAudioStatus;
    hasAvailableUpdate?: boolean;
    availableUpdateVersion?: string | null;
    isCheckingUpdates?: boolean;
    onCheckForUpdates?: () => void;
    onOpenUpdateModal?: () => void;
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
    view,
    setView,
    story,
    selectedSequence,
    setSelectedSequence,
    selectedScene,
    setSelectedScene,
    isSidebarOpen,
    setIsSidebarOpen,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    collapsedActs,
    toggleAct,
    loading,
    continuousAutopilot,
    isAudioAutopilotRunning,
    isAudioAutopilotQueued,
    storyAudioSummary,
    refreshLibrary,
    handleAutopilot,
    handleToggleAudioAutopilot,
    enterReaderMode,
    getSceneProseText,
    getSceneAudioStatus,
    hasAvailableUpdate = false,
    availableUpdateVersion = null,
    isCheckingUpdates = false,
    onCheckForUpdates,
    onOpenUpdateModal
}) => {
    const displayActs: Act[] =
        story.acts && story.acts.length > 0
            ? story.acts
            : story.sequences && story.sequences.length > 0
              ? [
                    { number: 1, title: 'Act I: Setup & Departure', description: 'Beginning' },
                    { number: 2, title: 'Act II: Confrontation & Midpoint', description: 'Middle' },
                    { number: 3, title: 'Act III: Climax & Resolution', description: 'End' }
                ]
              : [];

    const hasTree =
        ((story.acts && story.acts.length > 0) || (story.sequences && story.sequences.length > 0)) &&
        displayActs.length > 0;

    return (
        <>
            {/* Mobile Backdrop Scrim Overlay */}
            {isSidebarOpen && view !== 'reader' && (
                <div
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs md:hidden animate-fade-in"
                    aria-label="Dismiss sidebar overlay"
                />
            )}

            {/* FIXED SIDEBAR NAVIGATION (Light Scandinavian Parchment / Dark Atelier Nuit) */}
            <div
                className={`studio-sidebar ${
                    isSidebarCollapsed ? 'collapsed md:w-16' : ''
                } fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-edge flex flex-col transform transition-all duration-300 md:translate-x-0 ${
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } ${view === 'reader' ? 'hidden md:hidden' : ''} shadow-sm`}
            >
                {/* Studio Logo Header */}
                <div className="sidebar-header relative h-[3.75rem] px-3.5 flex justify-between items-center border-b border-edge bg-surface/70 backdrop-blur-sm">
                    <div className="sidebar-brand flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl overflow-hidden border border-gold-edge shadow-sm flex-shrink-0 bg-btn flex items-center justify-center">
                            <img src="ELPIcon2.jpg" alt="EllipsisProse Icon" className="w-full h-full object-cover" />
                        </div>
                        <div className="nav-label">
                            <h2 className="font-bold text-sm text-ink-900 tracking-tight flex items-center gap-1.5 font-display">
                                EllipsisProse{' '}
                                {hasAvailableUpdate && onOpenUpdateModal ? (
                                    <button
                                        type="button"
                                        onClick={onOpenUpdateModal}
                                        className="text-xs font-mono font-bold bg-gold-tint text-gold-ink border border-gold-edge px-2 py-0.5 rounded-full inline-flex items-center gap-1 hover:brightness-95 transition-all cursor-pointer"
                                        title={`Update v${availableUpdateVersion || ''} available — click to review`}
                                    >
                                        <span>{APP_VERSION}</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                                    </button>
                                ) : (
                                    <span className="text-xs font-mono font-bold bg-mist-200/80 text-ink-700 px-2 py-0.5 rounded-full">
                                        {APP_VERSION}
                                    </span>
                                )}
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                        className="sidebar-toggle hidden md:flex shrink-0 items-center justify-center text-ink-400 hover:text-ink-800 p-1.5 rounded-lg hover:bg-wash transition-colors"
                        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-expanded={!isSidebarCollapsed}
                    >
                        {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="md:hidden text-ink-400 hover:text-ink-800 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-wash transition-colors"
                        aria-label="Close Navigation Menu"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Semantic Grouped Navigation */}
                <div
                    className="sidebar-nav flex-1 overflow-y-auto p-3 space-y-4"
                    onClick={(e) => {
                        // On a phone the sidebar is a drawer over the page: picking a place or toggling an autopilot closes it.
                        if ((e.target as HTMLElement).closest('.nav-btn, .nav-action-btn')) setIsSidebarOpen(false);
                    }}
                >
                    {/* SPACE 1: STUDIO WORKSPACE */}
                    <div className="space-y-0.5">
                        <button
                            onClick={() => {
                                setView('library');
                                refreshLibrary();
                            }}
                            className={`nav-btn ${view === 'library' ? 'active' : ''}`}
                            title="Bookshelf"
                        >
                            <Library size={15} /> <span className="nav-label">Bookshelf</span>
                        </button>
                        <button
                            onClick={() => setView('setup')}
                            className={`nav-btn ${view === 'setup' ? 'active' : ''}`}
                            title="New Story"
                        >
                            <Sparkles size={15} /> <span className="nav-label">New Story</span>
                        </button>
                    </div>

                    {/* SPACES 2, 3, 4: EDITORIAL CREATIVE SPACES */}
                    <div className="space-y-0.5">
                        <button
                            onClick={() => setView('dashboard')}
                            className={`nav-btn ${
                                ['dashboard', 'cast', 'relationships', 'lore'].includes(view) ? 'active' : ''
                            }`}
                            title="Overview & World Bible"
                        >
                            <Activity size={15} /> <span className="nav-label">Overview</span>
                        </button>
                        <button
                            onClick={() => setView('pipeline')}
                            className={`nav-btn ${view === 'pipeline' ? 'active' : ''}`}
                            title="Live Progress"
                        >
                            <div className="relative flex items-center">
                                <Workflow size={15} />
                                {(loading || continuousAutopilot || isAudioAutopilotRunning) && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                )}
                            </div>
                            <span className="nav-label flex items-center justify-between flex-1">
                                <span>Live Progress</span>
                                {(loading || continuousAutopilot || isAudioAutopilotRunning) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ml-1" />
                                )}
                            </span>
                        </button>
                        <button
                            onClick={() => {
                                if (selectedSequence !== null && selectedScene !== null) {
                                    setView('writer');
                                } else {
                                    setView('structure');
                                }
                            }}
                            className={`nav-btn ${
                                [
                                    'structure',
                                    'sequence_dashboard',
                                    'chapter_dashboard',
                                    'writer',
                                    'directive',
                                    'editorial'
                                ].includes(view)
                                    ? 'active'
                                    : ''
                            }`}
                            title="Novel Structure"
                        >
                            <Layers size={15} /> <span className="nav-label">Novel Structure</span>
                        </button>
                        <button
                            onClick={() => enterReaderMode()}
                            className={`nav-btn ${view === 'reader' ? 'active' : ''}`}
                            title="Reading & Listening Room"
                        >
                            <BookOpen size={15} /> <span className="nav-label">Reading Room</span>
                        </button>
                    </div>

                    {/* AUTONOMOUS ACTION CONTROLS */}
                    <div className="pt-2 border-t border-edge/70 space-y-1.5">
                        <button
                            type="button"
                            onClick={() => handleAutopilot({ fromSetup: view === 'setup' })}
                            className={`nav-action-btn ${continuousAutopilot ? 'active' : ''}`}
                            title={
                                continuousAutopilot
                                    ? 'Stop Autonomous Novel Generation'
                                    : 'Start Continuous Novel Autopilot'
                            }
                        >
                            <div className="relative flex items-center shrink-0">
                                <Play
                                    size={15}
                                    className={continuousAutopilot ? 'text-gold-ink fill-current animate-pulse' : 'text-gold-ink'}
                                />
                                {continuousAutopilot && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gold animate-ping" />
                                )}
                            </div>
                            <span className="nav-label flex items-center justify-between flex-1">
                                <span>Autopilot</span>
                                <span
                                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                                        continuousAutopilot
                                            ? 'bg-gold-tint text-gold-ink border-gold-edge'
                                            : 'bg-wash text-ink-500 border-edge'
                                    }`}
                                >
                                    {continuousAutopilot ? 'ON' : 'OFF'}
                                </span>
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleToggleAudioAutopilot}
                            className={`nav-action-btn ${isAudioAutopilotRunning ? 'active' : ''}`}
                            title={
                                isAudioAutopilotRunning
                                    ? 'Stop Audio Autopilot'
                                    : 'Generate scene audio autonomously for offline listening & export'
                            }
                        >
                            <div className="relative flex items-center shrink-0">
                                <Headphones
                                    size={15}
                                    className={isAudioAutopilotRunning ? 'text-gold-ink animate-pulse' : 'text-gold-ink'}
                                />
                                {isAudioAutopilotRunning && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gold animate-ping" />
                                )}
                            </div>
                            <span className="nav-label flex items-center justify-between flex-1 gap-1.5">
                                <span className="truncate">Audio Autopilot</span>
                                {isAudioAutopilotRunning ? (
                                    <span className="text-[10px] font-mono font-bold bg-gold-tint text-gold-ink px-1.5 py-0.5 rounded-full border border-gold-edge shrink-0">
                                        ON · {storyAudioSummary.readyCount}/{storyAudioSummary.totalDrafted}
                                    </span>
                                ) : isAudioAutopilotQueued ? (
                                    <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                                        QUEUED
                                    </span>
                                ) : storyAudioSummary.totalDrafted > 0 ? (
                                    <span
                                        className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${
                                            storyAudioSummary.readyCount === storyAudioSummary.totalDrafted
                                                ? 'bg-sage-tint text-sage-800 border-sage-edge'
                                                : 'bg-wash text-ink-500 border-edge'
                                        }`}
                                    >
                                        {storyAudioSummary.readyCount}/{storyAudioSummary.totalDrafted}
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-mono font-bold bg-wash text-ink-500 px-1.5 py-0.5 rounded-full border border-edge shrink-0">
                                        OFF
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>

                    {/* SECTION 4: STORY HIERARCHY TREE */}
                    {hasTree && (
                        <div className="sidebar-tree space-y-1 pt-2 border-t border-edge">

                            {displayActs.map((act, actIdx) => {
                                const actNum = parseActNumber(
                                    act.number != null ? act.number : actIdx + 1,
                                    actIdx + 1
                                );
                                const actSequences: Array<Sequence & { origIdx: number }> = (story.sequences || [])
                                    .map((seq, sIdx) => ({ ...seq, origIdx: sIdx }))
                                    .filter((seq) => {
                                        const parentAct = parseActNumber(
                                            seq.parent_act != null
                                                ? seq.parent_act
                                                : actForSequence(seq.number != null ? seq.number : seq.origIdx + 1),
                                            actForSequence(seq.origIdx + 1)
                                        );
                                        return parentAct === actNum;
                                    });
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
                                    <div key={actIdx} className="ml-1">
                                        <button
                                            onClick={() => toggleAct(actIdx)}
                                            className="w-full flex items-center justify-between text-xs text-ink-800 font-bold px-2 py-1.5 rounded-lg hover:bg-wash transition-colors"
                                        >
                                            <span className="truncate">{displayTitle}</span>
                                            <div className="text-ink-400 shrink-0">
                                                {collapsedActs[actIdx] ? (
                                                    <ChevronRight size={12} />
                                                ) : (
                                                    <ChevronDown size={12} />
                                                )}
                                            </div>
                                        </button>
                                        {!collapsedActs[actIdx] && (
                                            <div className="ml-2 pl-2 border-l border-edge-300 space-y-1 mt-0.5">
                                                {actSequences.map((sequence) => {
                                                    const seqIdx = sequence.origIdx;
                                                    const sceneList: SceneBlueprint[] =
                                                        (story.scenes &&
                                                            (story.scenes[`${seqIdx}`] || story.scenes[seqIdx])) ||
                                                        (Array.isArray(story.scenes) ? story.scenes[seqIdx] : []) ||
                                                        [];
                                                    let seqReadyCount = 0;
                                                    let seqDraftedCount = 0;
                                                    sceneList.forEach((_, si) => {
                                                        if (getSceneProseText(story, seqIdx, si)) seqDraftedCount++;
                                                        if (getSceneAudioStatus(seqIdx, si).status === 'ready') {
                                                            seqReadyCount++;
                                                        }
                                                    });

                                                    return (
                                                        <div key={seqIdx} className="mt-0.5">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedSequence(seqIdx);
                                                                    setView('sequence_dashboard');
                                                                    setIsSidebarOpen(false);
                                                                }}
                                                                className={`w-full flex items-center justify-between text-xs font-semibold px-2 py-1 rounded text-left transition-colors ${
                                                                    (view === 'sequence_dashboard' ||
                                                                        view === 'chapter_dashboard') &&
                                                                    selectedSequence === seqIdx
                                                                        ? 'text-gold-ink bg-gold-tint font-bold'
                                                                        : 'text-ink-600 hover:text-ink-900 hover:bg-wash'
                                                                }`}
                                                            >
                                                                <span className="truncate">
                                                                    Seq {sequence.number || seqIdx + 1}:{' '}
                                                                    {sequence.title || `Sequence ${seqIdx + 1}`}
                                                                </span>
                                                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                                                    {seqReadyCount > 0 && (
                                                                        <span
                                                                            className="text-[9.5px] font-mono px-1 rounded bg-sage-tint text-sage-800 border border-sage-edge"
                                                                            title={`${seqReadyCount} of ${
                                                                                seqDraftedCount || sceneList.length
                                                                            } scenes have saved offline audio`}
                                                                        >
                                                                            {seqReadyCount}/
                                                                            {seqDraftedCount || sceneList.length}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs font-mono text-ink-400 font-medium">
                                                                        {sceneList.length}
                                                                    </span>
                                                                </div>
                                                            </button>

                                                            {sceneList.map((scene, sIdx) => {
                                                                const sceneKey = `${seqIdx}-${sIdx}`;
                                                                const isSelected =
                                                                    selectedSequence === seqIdx &&
                                                                    selectedScene === sIdx;
                                                                const hasBeats =
                                                                    Array.isArray(story.beats?.[sceneKey]) &&
                                                                    story.beats[sceneKey].length > 0;
                                                                const proseObj = story.prose?.[sceneKey] as
                                                                    | ProseEntry
                                                                    | string
                                                                    | undefined;
                                                                const hasProse =
                                                                    typeof proseObj === 'string'
                                                                        ? Boolean(proseObj.trim())
                                                                        : Boolean(
                                                                              proseObj &&
                                                                                  (proseObj.final || proseObj.draft)
                                                                          );
                                                                const scAudio = getSceneAudioStatus(seqIdx, sIdx);
                                                                const seqNum = sequence.number || seqIdx + 1;
                                                                const sceneDisplayNum = `${seqNum}.${sIdx + 1}`;
                                                                if (scene && scene.number !== sceneDisplayNum) {
                                                                    scene.number = sceneDisplayNum;
                                                                    scene.id = sceneDisplayNum;
                                                                }

                                                                return (
                                                                    <button
                                                                        key={sIdx}
                                                                        onClick={() => {
                                                                            setSelectedSequence(seqIdx);
                                                                            setSelectedScene(sIdx);
                                                                            setView('writer');
                                                                            setIsSidebarOpen(false);
                                                                        }}
                                                                        className={`w-full text-left pl-3 pr-2 py-1 rounded text-xs flex items-center justify-between gap-1 group transition-colors ${
                                                                            isSelected
                                                                                ? 'bg-gold-tint text-gold-ink font-semibold'
                                                                                : 'text-ink-500 hover:text-ink-800 hover:bg-wash'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-1.5 truncate min-w-0">
                                                                            {hasProse ? (
                                                                                <span
                                                                                    className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                                                                                    title="Prose written"
                                                                                />
                                                                            ) : hasBeats ? (
                                                                                <span
                                                                                    className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                                                                                    title="Beats planned"
                                                                                />
                                                                            ) : (
                                                                                <span
                                                                                    className="w-1.5 h-1.5 rounded-full bg-mist-300 shrink-0"
                                                                                    title="Outlined only"
                                                                                />
                                                                            )}
                                                                            <span className="truncate text-xs">
                                                                                {sceneDisplayNum}.{' '}
                                                                                {scene.title || `Scene ${sIdx + 1}`}
                                                                            </span>
                                                                        </div>
                                                                        {scAudio.status === 'ready' ? (
                                                                            <span
                                                                                className="inline-flex shrink-0"
                                                                                title="Saved offline audio ready"
                                                                            >
                                                                                <Headphones
                                                                                    size={11}
                                                                                    className="text-sage-600 shrink-0"
                                                                                />
                                                                            </span>
                                                                        ) : scAudio.status === 'stale' ? (
                                                                            <span
                                                                                className="inline-flex shrink-0"
                                                                                title="Saved audio outdated vs edited text"
                                                                            >
                                                                                <Headphones
                                                                                    size={11}
                                                                                    className="text-amber-500 shrink-0"
                                                                                />
                                                                            </span>
                                                                        ) : null}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* SYSTEM & SETTINGS */}
                    <div className="space-y-0.5 pt-2 border-t border-edge">
                        <button
                            onClick={() => setView('settings')}
                            className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
                            title="Settings"
                        >
                            <Settings size={15} /> <span className="nav-label">Settings</span>
                        </button>
                        <button
                            onClick={() => setView('logs')}
                            className={`nav-btn ${view === 'logs' ? 'active' : ''}`}
                            title="Author's Log (LLM Logs)"
                        >
                            <History size={15} /> <span className="nav-label">Author&apos;s Log</span>
                        </button>
                        {onCheckForUpdates && (
                            <button
                                type="button"
                                onClick={hasAvailableUpdate && onOpenUpdateModal ? onOpenUpdateModal : onCheckForUpdates}
                                disabled={isCheckingUpdates}
                                className="nav-btn"
                                title={
                                    hasAvailableUpdate
                                        ? `Update v${availableUpdateVersion || ''} available — click to view changelog`
                                        : 'Check for EllipsisProse updates'
                                }
                            >
                                <div className="relative flex items-center">
                                    <RefreshCw size={15} className={isCheckingUpdates ? 'animate-spin' : ''} />
                                    {hasAvailableUpdate && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gold animate-pulse" />
                                    )}
                                </div>
                                <span className="nav-label flex items-center justify-between flex-1 gap-1.5">
                                    <span>{isCheckingUpdates ? 'Checking…' : 'Check for Updates'}</span>
                                    {hasAvailableUpdate && (
                                        <span className="text-[10px] font-mono font-bold bg-gold-tint text-gold-ink px-1.5 py-0.5 rounded-full border border-gold-edge shrink-0">
                                            Update
                                        </span>
                                    )}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
