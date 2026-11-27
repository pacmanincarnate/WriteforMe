/**
 * @module components/layout/StudioHeader
 * Sticky top header with mobile menu trigger, Bookshelf/Story/View breadcrumbs,
 * LiveCreationIsland, Autopilot toggle, and Theme Switcher.
 */

import React from 'react';
import { LiveCreationIsland, type LiveCreationIslandProps } from '@/components/common';
import { ChevronRight, Loader2, Menu, Moon, Sun, Zap } from '@/components/icons';
import type { Story } from '@/types';

export interface StudioHeaderProps {
    view: string;
    setView: (viewId: string) => void;
    story: Story;
    theme: string;
    toggleTheme: () => void;
    setIsSidebarOpen: (open: boolean) => void;
    refreshLibrary: () => void | Promise<void>;
    loading: boolean;
    loadingStep: string;
    continuousAutopilot: boolean;
    setContinuousAutopilot: (active: boolean) => void;
    handleAutopilot: (opts?: { fromSetup?: boolean }) => void | Promise<void>;
    isAudioAutopilotRunning: boolean;
    isMcpConnected: boolean;
    activePipelineWork: LiveCreationIslandProps['activePipelineWork'];
    novelProgress: LiveCreationIslandProps['novelProgress'];
    audioAutopilotProgress: LiveCreationIslandProps['audioAutopilotProgress'];
    audioProgress: LiveCreationIslandProps['audioProgress'];
    setPipelineDisplayMode: (mode: string) => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
    view,
    setView,
    story,
    theme,
    toggleTheme,
    setIsSidebarOpen,
    refreshLibrary,
    loading,
    loadingStep,
    continuousAutopilot,
    setContinuousAutopilot,
    handleAutopilot,
    isAudioAutopilotRunning,
    isMcpConnected,
    activePipelineWork,
    novelProgress,
    audioAutopilotProgress,
    audioProgress,
    setPipelineDisplayMode
}) => {
    if (view === 'reader') return null;

    return (
        <header className="studio-top-header border-b border-edge backdrop-blur-md z-30 sticky top-0 shadow-2xs flex flex-col justify-center transition-all">
            <div
                className="w-full flex items-center justify-between gap-3 overflow-x-auto overflow-y-hidden no-scrollbar touch-scroll touch-scroll-x py-2 px-2 md:px-6 min-w-0"
                style={{
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x pan-y',
                    overscrollBehaviorX: 'contain'
                }}
                onWheel={(e) => {
                    if (e.deltaY && !e.deltaX && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                        e.currentTarget.scrollLeft += e.deltaY;
                    }
                }}
            >
                <div className="flex items-center gap-2.5 shrink-0 min-w-0">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="md:hidden text-ink-600 hover:text-ink-900 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-mist-100 hover:bg-wash border border-edge-strong transition-colors shrink-0 shadow-2xs cursor-pointer active:scale-95"
                        aria-label="Open Navigation Menu"
                    >
                        <Menu size={18} />
                    </button>

                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-xs text-ink-500 shrink-0">
                        <span
                            onClick={() => {
                                setView('library');
                                refreshLibrary();
                            }}
                            className="hover:text-gold-ink cursor-pointer font-medium transition-colors whitespace-nowrap"
                        >
                            Bookshelf
                        </span>
                        <ChevronRight size={12} className="text-ink-300 shrink-0" />
                        <span
                            onClick={() => setView('dashboard')}
                            className="font-serif font-bold text-ink-900 hover:text-gold-ink cursor-pointer max-w-[140px] sm:max-w-[240px] truncate transition-colors whitespace-nowrap"
                        >
                            {story.title || 'Untitled Novel'}
                        </span>
                    </div>

                    <LiveCreationIsland
                        loading={loading}
                        loadingStep={loadingStep}
                        continuousAutopilot={continuousAutopilot}
                        isAudioAutopilotRunning={isAudioAutopilotRunning}
                        story={story}
                        setView={setView}
                        activePipelineWork={activePipelineWork}
                        novelProgress={novelProgress}
                        audioAutopilotProgress={audioAutopilotProgress}
                        audioProgress={audioProgress}
                        setPipelineDisplayMode={setPipelineDisplayMode}
                    />

                    {isMcpConnected && (
                        <span
                            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gold-tint text-gold-ink border border-gold-edge shadow-2xs whitespace-nowrap ml-1"
                            title="Connected to Antigravity MCP Server (port 3002)"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Antigravity MCP
                        </span>
                    )}
                </div>

                {/* Header Actions: Autopilot & Theme Switcher */}
                <div className="flex items-center gap-2 shrink-0 ml-auto pl-2 pr-1">
                    <button
                        onClick={() => {
                            if (!continuousAutopilot && view === 'setup') {
                                handleAutopilot({ fromSetup: true });
                            } else {
                                setContinuousAutopilot(!continuousAutopilot);
                            }
                        }}
                        className={`px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 border shrink-0 ${
                            continuousAutopilot
                                ? 'bg-blush-tint border-blush-edge text-blush-800 hover:bg-blush-tint-strong'
                                : 'bg-surface border-edge-strong hover:border-edge-300 text-ink-800 shadow-2xs'
                        }`}
                        title="Toggle autonomous end-to-end generation across the entire novel"
                    >
                        {continuousAutopilot ? (
                            <>
                                <Loader2 className="animate-spin text-blush-600" size={13} />
                                <span className="whitespace-nowrap">Autopilot Active</span>
                            </>
                        ) : (
                            <>
                                <Zap size={13} className="text-ember-600" />
                                <span className="whitespace-nowrap">Autopilot</span>
                            </>
                        )}
                    </button>

                    {/* THEME SWITCH BUTTON */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 min-h-[38px] min-w-[38px] rounded-full border border-edge-strong hover:border-edge-300 bg-surface text-ink-700 hover:text-ink-900 shadow-2xs hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                        title={
                            theme === 'dark'
                                ? 'Switch to Light Theme (Folio Bianca)'
                                : 'Switch to Dark Theme (Atelier Nuit)'
                        }
                        aria-label="Toggle Theme"
                    >
                        {theme === 'dark' ? (
                            <Sun size={15} className="text-[#C9A96E]" />
                        ) : (
                            <Moon size={15} className="text-ink-600" />
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
};
