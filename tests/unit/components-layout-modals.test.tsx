import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    GesmBeliefModal,
    GesmPropositionModal,
    IconPickerModal,
    StudioHeader,
    StudioSidebar,
    type GesmBeliefModalState,
    type GesmPropositionModalState
} from '@/components';
import type { Story } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

function findButton(text: string): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(text)
    );
    if (!btn) {
        throw new Error(`Button containing "${text}" not found`);
    }
    return btn;
}

const sampleStory: Story = {
    id: 'story_shell_1',
    title: 'The Salt Observatory',
    writing_mode: 'audio_drama',
    cast: [{ id: 'c1', name: 'Nora Vale', role: 'Protagonist' }],
    acts: [{ number: 1, title: 'Act I: Gathering Storms' }],
    sequences: [{ number: 1, parent_act: 1, title: 'The Cold Pier' }],
    scenes: {
        '0': [{ id: '1.1', number: '1.1', title: 'Signal Fire' }]
    },
    prose: {
        '0-0': { final: 'The harbour bell tolled through the fog.' }
    },
    epistemic_graph: {
        propositions: [
            { id: 'prop_beacon', claim_text: 'The lighthouse beacon was tampered with.' }
        ]
    }
};

describe('Phase 5H: StudioSidebar, StudioHeader, and remaining modals', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
    });

    it('renders StudioSidebar navigation, tree drill-down, and collapse', () => {
        const setView = vi.fn();
        const setSelectedSequence = vi.fn();
        const setSelectedScene = vi.fn();
        const setIsSidebarOpen = vi.fn();
        const setIsSidebarCollapsed = vi.fn();

        const SidebarHarness: React.FC = () => {
            return (
                <StudioSidebar
                    view="dashboard"
                    setView={setView}
                    story={sampleStory}
                    selectedSequence={0}
                    setSelectedSequence={setSelectedSequence}
                    selectedScene={null}
                    setSelectedScene={setSelectedScene}
                    isSidebarOpen={true}
                    setIsSidebarOpen={setIsSidebarOpen}
                    isSidebarCollapsed={false}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                    collapsedActs={{}}
                    toggleAct={vi.fn()}
                    loading={false}
                    continuousAutopilot={false}
                    isAudioAutopilotRunning={false}
                    isAudioAutopilotQueued={false}
                    storyAudioSummary={{ readyCount: 1, totalDrafted: 1 }}
                    refreshLibrary={vi.fn()}
                    handleAutopilot={vi.fn()}
                    handleToggleAudioAutopilot={vi.fn()}
                    enterReaderMode={vi.fn()}
                    getSceneProseText={() => 'prose'}
                    getSceneAudioStatus={() => ({ status: 'ready' })}
                />
            );
        };

        renderIntoRoot(<SidebarHarness />);

        expect(container.textContent).toContain('EllipsisProse');
        expect(container.textContent).toContain('Act 1: Gathering Storms');
        expect(container.textContent).toContain('1.1. Signal Fire');

        // Navigate via Settings button
        act(() => {
            findButton('Settings').click();
        });
        expect(setView).toHaveBeenCalledWith('settings');

        // Drill down to scene via Manuscript Tree
        act(() => {
            findButton('1.1. Signal Fire').click();
        });
        expect(setSelectedSequence).toHaveBeenCalledWith(0);
        expect(setSelectedScene).toHaveBeenCalledWith(0);
        expect(setView).toHaveBeenCalledWith('writer');

        // The sidebar holds places only: no export or import buttons
        expect(container.querySelector('input[type="file"]')).toBeNull();
        expect(
            Array.from(container.querySelectorAll('button')).some((b) => /export|import/i.test(b.textContent || ''))
        ).toBe(false);

        // Collapse toggle
        const collapseBtn = container.querySelector('button[aria-label="Collapse sidebar"]') as HTMLButtonElement;
        act(() => {
            collapseBtn.click();
        });
        expect(setIsSidebarCollapsed).toHaveBeenCalledTimes(1);
    });

    it('renders StudioHeader breadcrumbs, Reader/Autopilot triggers, and Theme switcher', () => {
        const setView = vi.fn();
        const setIsSidebarOpen = vi.fn();
        const toggleTheme = vi.fn();
        const setContinuousAutopilot = vi.fn();

        renderIntoRoot(
            <StudioHeader
                view="dashboard"
                setView={setView}
                story={sampleStory}
                theme="light"
                toggleTheme={toggleTheme}
                setIsSidebarOpen={setIsSidebarOpen}
                refreshLibrary={vi.fn()}
                loading={false}
                loadingStep=""
                continuousAutopilot={false}
                setContinuousAutopilot={setContinuousAutopilot}
                handleAutopilot={vi.fn()}
                isAudioAutopilotRunning={false}
                isMcpConnected={true}
                activePipelineWork={null}
                novelProgress={{ overallPct: 40 }}
                audioAutopilotProgress={null}
                audioProgress={{ overallPct: 0 }}
                setPipelineDisplayMode={vi.fn()}
            />
        );

        expect(container.textContent).toContain('The Salt Observatory');
        expect(container.textContent).toContain('Antigravity MCP');

        const menuBtn = container.querySelector('button[aria-label="Open Navigation Menu"]') as HTMLButtonElement;
        act(() => {
            menuBtn.click();
        });
        expect(setIsSidebarOpen).toHaveBeenCalledWith(true);

        act(() => {
            findButton('Autopilot').click();
        });
        expect(setContinuousAutopilot).toHaveBeenCalledWith(true);

        const themeBtn = container.querySelector('button[aria-label="Toggle Theme"]') as HTMLButtonElement;
        act(() => {
            themeBtn.click();
        });
        expect(toggleTheme).toHaveBeenCalledTimes(1);
    });

    it('renders and submits GesmPropositionModal, GesmBeliefModal, and IconPickerModal', () => {
        const handleSaveProposition = vi.fn();
        const handleSaveBelief = vi.fn();
        const setIsIconPickerOpen = vi.fn();
        const setNewModeIcon = vi.fn();

        const ModalsHarness: React.FC = () => {
            const [propModal, setPropModal] = useState<GesmPropositionModalState>({
                isOpen: true,
                isNew: true,
                id: 'prop_test',
                claim_text: 'The key is missing.',
                subject_id: 'c1',
                predicate: 'LOST',
                object_id: 'brass_key',
                objective_truth: 'TRUE',
                world_valid_from_scene: '1.1'
            });
            const [beliefModal, setBeliefModal] = useState<GesmBeliefModalState>({
                isOpen: true,
                isNew: false,
                holder_id: 'c1',
                proposition_id: 'prop_beacon',
                stance: 'BELIEVES_TRUE',
                confidence: 0.85,
                source_type: 'DIRECT_OBSERVATION',
                acquired_at_scene: '1.1'
            });
            return (
                <>
                    <GesmPropositionModal
                        editingPropModal={propModal}
                        setEditingPropModal={setPropModal}
                        handleSaveProposition={handleSaveProposition}
                    />
                    <GesmBeliefModal
                        editingBeliefModal={beliefModal}
                        setEditingBeliefModal={setBeliefModal}
                        handleSaveBelief={handleSaveBelief}
                        story={sampleStory}
                    />
                    <IconPickerModal
                        isIconPickerOpen={true}
                        setIsIconPickerOpen={setIsIconPickerOpen}
                        newModeIcon="sparkles"
                        setNewModeIcon={setNewModeIcon}
                    />
                </>
            );
        };

        renderIntoRoot(<ModalsHarness />);

        expect(container.textContent).toContain('New Epistemic Proposition');
        expect(container.textContent).toContain('Edit Character Belief Edge');
        expect(container.textContent).toContain('Select Mode Icon');

        act(() => {
            findButton('Save Proposition').click();
        });
        expect(handleSaveProposition).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'prop_test', claim_text: 'The key is missing.' })
        );

        act(() => {
            findButton('Save Belief Edge').click();
        });
        expect(handleSaveBelief).toHaveBeenCalledWith(
            expect.objectContaining({ holder_id: 'c1', proposition_id: 'prop_beacon', confidence: 0.85 })
        );

        const iconButtons = container.querySelectorAll('.grid.grid-cols-9 button');
        expect(iconButtons.length).toBeGreaterThan(5);
        act(() => {
            (iconButtons[0] as HTMLButtonElement).click();
        });
        expect(setNewModeIcon).toHaveBeenCalledTimes(1);
        expect(setIsIconPickerOpen).toHaveBeenCalledWith(false);
    });
});
