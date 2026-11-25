import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    PipelineView,
    WriterView,
    type PipelineAudioProgress,
    type PipelinePromptLogEntry,
    type PipelineStory,
    type SceneBlueprintDraft,
    type WriterStory
} from '@/views';
import type { NovelProgressEstimate } from '@/domain/story';
import type { SlopAuditReport } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

function buildSampleWriterStory(): WriterStory {
    return {
        id: 'story_writer_1',
        title: 'The Salt Observatory',
        writing_mode: 'novel',
        cast: [
            { id: 'c1', name: 'Nora Vale', role: 'Protagonist', core_flaw: 'Withholds trust' },
            { id: 'c2', name: 'Julian Vance', role: 'Counterpart' }
        ],
        sequences: [{ number: 1, parent_act: 1, title: 'The Cold Pier' }],
        scenes: {
            '0': [
                {
                    id: 'sc_0_0',
                    number: 1,
                    title: 'Signal Fire',
                    scene_type: 'PROACTIVE',
                    pov_character: 'Nora Vale',
                    setting: 'North Jetty, midnight',
                    transition_jump: 'Two hours after the lighthouse blackout',
                    characters_present: ['Nora Vale'],
                    dominant_narrative_mode: 'BASELINE_NEUTRAL',
                    objective: 'Recover the logbook before the tide rises.',
                    scene_events: 'Nora unlatches the brass housing.',
                    value_shift: { start_state: 'Guarded', end_state: 'Exposed' },
                    exit_hook: 'Someone whistles from the foghorn catwalk.',
                    surface_activity: 'Prying open the salt-crusted locker.',
                    the_hinge_moment: 'The ink inside the ledger is still wet.',
                    main_character_heart: 'Afraid the handwriting is hers.',
                    other_character_heart: 'Wait-listed to protect the harbour master.',
                    atmospheric_overview: 'Sodium mist curls around iron pilings.',
                    modality_hand: ['Tight Close Third'],
                    user_edited: true
                },
                {
                    id: 'sc_0_1',
                    number: 2,
                    title: 'Aftermath at Dawn',
                    scene_type: 'REACTIVE',
                    pov_character: 'Nora Vale',
                    setting: 'Chartroom'
                }
            ]
        },
        beats: {
            '0-0': [
                {
                    beat_type: 'Action',
                    initiator: 'Nora Vale',
                    action: 'Pulls the rusted pin free.'
                }
            ]
        },
        prose: {
            '0-0': {
                final: 'Sodium mist curled around the iron pilings as Nora forced the brass latch.',
                stale: { reason: 'Objective modified', changedFields: ['objective'] } as unknown as boolean
            }
        },
        slop_allowlist: ['sodium mist']
    };
}

const sampleSlopAudit: SlopAuditReport = {
    hardHits: [],
    closerHits: [],
    flagHits: [],
    clusteredFlagHits: [],
    patternHits: [],
    densityHits: [],
    allHits: [
        {
            id: 'h1',
            severity: 'hard',
            categoryId: 'cliche_verb',
            categoryTitle: 'Cliche Verb',
            match: 'eyes widened',
            line: 1,
            start: 10,
            end: 22,
            sentence: 'Her eyes widened in the dark.',
            context: 'Her eyes widened in the dark.',
            note: 'Avoid overused physical tell.',
            isTrailingCloser: false,
            isClustered: false
        },
        {
            id: 'h2',
            severity: 'high_closer',
            categoryId: 'trailing_punch',
            categoryTitle: 'Dramatic Trailing Line',
            match: 'Everything would change.',
            line: 4,
            start: 80,
            end: 104,
            sentence: 'Everything would change.',
            context: 'Everything would change.',
            note: 'Trailing summary closer.',
            isTrailingCloser: true,
            isClustered: false
        }
    ],
    phraseCounts: {},
    categoryCounts: {},
    summary: {
        wordCount: 15,
        hardCount: 1,
        closerCount: 1,
        flagCount: 0,
        clusteredFlagCount: 0,
        patternCount: 0,
        densityCount: 0,
        emDashCount: 0,
        emDashPer1k: 0,
        emClusterCount: 0,
        shouldTriggerSurgicalGate: true,
        hasActionableItems: true,
        reasons: []
    }
};

interface HarnessOptions {
    initialWorkspaceTab?: string;
    onUpdateSceneBlueprint?: (seqIdx: number, sceneIdx: number, updates: Record<string, unknown>) => void;
    onCascade?: (seqIdx: number, sceneIdx: number) => void;
    onSlopClean?: (seqIdx: number, sceneIdx: number) => void;
    onAllowlist?: (term: string) => void;
    onEnterReader?: (seqIdx?: number, sceneIdx?: number) => void;
    onAutoGenerate?: (seqIdx: number, sceneIdx: number, opts?: { forceFullRewrite?: boolean }) => void;
    onSetSelectedScene?: (sceneIdx: number | null) => void;
    onToast?: (msg: string, type?: string) => void;
}

const WriterHarness: React.FC<HarnessOptions> = ({
    initialWorkspaceTab = 'blueprint',
    onUpdateSceneBlueprint = vi.fn(),
    onCascade = vi.fn(),
    onSlopClean = vi.fn(),
    onAllowlist = vi.fn(),
    onEnterReader = vi.fn(),
    onAutoGenerate = vi.fn(),
    onSetSelectedScene = vi.fn(),
    onToast = vi.fn()
}) => {
    const [story, setStory] = useState<WriterStory>(() => buildSampleWriterStory());
    const storyRef = useRef<WriterStory>(story);
    storyRef.current = story;

    const [activeSceneDropdown, setActiveSceneDropdown] = useState<string | null>(null);
    const [sceneWorkspaceTab, setSceneWorkspaceTab] = useState<string>(initialWorkspaceTab);
    const [isSceneSplitView, setIsSceneSplitView] = useState<boolean>(false);
    const [, setIsBlueprintCollapsed] = useState<boolean>(false);
    const [blueprintActiveTab, setBlueprintActiveTab] = useState<string>('narrative');
    const [isEditingSceneBlueprint, setIsEditingSceneBlueprint] = useState<boolean>(false);
    const [sceneBlueprintDraft, setSceneBlueprintDraft] = useState<SceneBlueprintDraft | null>(null);
    const [isEditingProseInline, setIsEditingProseInline] = useState<boolean>(false);
    const [inlineProseDraft, setInlineProseDraft] = useState<string>('');
    const [enableNarrativeLenses, setEnableNarrativeLenses] = useState<boolean>(true);
    const [slopAuditDrawerOpen, setSlopAuditDrawerOpen] = useState<boolean>(false);
    const [slopAuditFilter, setSlopAuditFilter] = useState<string>('all');
    const [slopAllowlistExpanded, setSlopAllowlistExpanded] = useState<boolean>(false);

    return (
        <WriterView
            view="writer"
            setView={vi.fn()}
            story={story}
            storyRef={storyRef}
            setStory={setStory}
            isInspectorMode={false}
            selectedSequence={0}
            selectedScene={0}
            setSelectedScene={onSetSelectedScene}
            activeSceneDropdown={activeSceneDropdown}
            setActiveSceneDropdown={setActiveSceneDropdown}
            sceneWorkspaceTab={sceneWorkspaceTab}
            setSceneWorkspaceTab={setSceneWorkspaceTab}
            isSceneSplitView={isSceneSplitView}
            setIsSceneSplitView={setIsSceneSplitView}
            setIsBlueprintCollapsed={setIsBlueprintCollapsed}
            blueprintActiveTab={blueprintActiveTab}
            setBlueprintActiveTab={setBlueprintActiveTab}
            isEditingSceneBlueprint={isEditingSceneBlueprint}
            setIsEditingSceneBlueprint={setIsEditingSceneBlueprint}
            sceneBlueprintDraft={sceneBlueprintDraft}
            setSceneBlueprintDraft={setSceneBlueprintDraft}
            isEditingProseInline={isEditingProseInline}
            setIsEditingProseInline={setIsEditingProseInline}
            inlineProseDraft={inlineProseDraft}
            setInlineProseDraft={setInlineProseDraft}
            allNarrativeModes={{ BASELINE_NEUTRAL: {}, POETIC_LYRICAL: {} }}
            enableNarrativeLenses={enableNarrativeLenses}
            setEnableNarrativeLenses={setEnableNarrativeLenses}
            collapsedBeats={{}}
            toggleBeats={vi.fn()}
            expandedBeatAnalysis={{}}
            toggleBeatAnalysis={vi.fn()}
            loading={false}
            loadingImages={{}}
            loadedImages={{}}
            isExportingSceneAudio={false}
            isRegeneratingSceneAudio={false}
            isDirectingVoices={false}
            isAnyAudioPlaying={false}
            isRunningEditorialHarness={false}
            isRunningManualSlopClean={false}
            writerSlopAudit={sampleSlopAudit}
            slopAuditDrawerOpen={slopAuditDrawerOpen}
            setSlopAuditDrawerOpen={setSlopAuditDrawerOpen}
            slopAuditFilter={slopAuditFilter}
            setSlopAuditFilter={setSlopAuditFilter}
            slopAllowlistExpanded={slopAllowlistExpanded}
            setSlopAllowlistExpanded={setSlopAllowlistExpanded}
            getSceneAudioStatus={() => ({ status: 'ready' })}
            updateSceneBlueprint={onUpdateSceneBlueprint}
            updateCharacterStateForScene={vi.fn()}
            handleAutoGenerateScene={onAutoGenerate}
            handleCascadeSceneToProse={onCascade}
            handleDismissStaleProse={vi.fn()}
            handleDownloadSceneAudio={vi.fn()}
            handleRegenerateSceneAudio={vi.fn()}
            handleDirectSceneVoices={vi.fn()}
            handleAddBeat={vi.fn()}
            handleBeatChange={vi.fn()}
            handleDeleteBeat={vi.fn()}
            generateSceneImage={vi.fn()}
            generateBeatImage={vi.fn()}
            deleteSceneImage={vi.fn()}
            deleteBeatImage={vi.fn()}
            copyFullScene={vi.fn()}
            enterReaderMode={onEnterReader}
            playSceneAudio={vi.fn()}
            stopAllAudioPlayback={vi.fn()}
            runAutonomousEditorialHarness={vi.fn()}
            setEditorialScopeSceneId={vi.fn()}
            handleRunManualSlopClean={onSlopClean}
            handleAddStoryAllowlistItem={onAllowlist}
            handleRemoveStoryAllowlistItem={vi.fn()}
            openEditModal={vi.fn()}
            openCritiqueModal={vi.fn()}
            showToast={onToast}
        />
    );
};

function findButton(text: string): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(text)
    );
    if (!btn) {
        throw new Error(`Button containing "${text}" not found`);
    }
    return btn;
}

describe('Phase 5F: WriterView and PipelineView', () => {
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

    it('renders WriterView Director Card, handles Write/Read actions, Stale bar, and Blueprint Edit save', () => {
        const updateSceneBlueprint = vi.fn();
        const handleCascadeSceneToProse = vi.fn();
        const handleAutoGenerateScene = vi.fn();
        const enterReaderMode = vi.fn();
        const setSelectedScene = vi.fn();
        const showToast = vi.fn();

        renderIntoRoot(
            <WriterHarness
                onUpdateSceneBlueprint={updateSceneBlueprint}
                onCascade={handleCascadeSceneToProse}
                onAutoGenerate={handleAutoGenerateScene}
                onEnterReader={enterReaderMode}
                onSetSelectedScene={setSelectedScene}
                onToast={showToast}
            />
        );

        expect(container.textContent).toContain('Signal Fire');
        expect(container.textContent).toContain('Edited');
        expect(container.textContent).toContain('Recover the logbook before the tide rises.');

        // Next scene button
        const nextBtn = container.querySelector('button[aria-label="Next Scene"]') as HTMLButtonElement;
        act(() => {
            nextBtn.click();
        });
        expect(setSelectedScene).toHaveBeenCalledWith(1);

        // Stale bar Patch Prose
        act(() => {
            findButton('Patch Prose').click();
        });
        expect(handleCascadeSceneToProse).toHaveBeenCalledWith(0, 0);

        // Open Write popover & click Re-Write Prose
        act(() => {
            findButton('Write').click();
        });
        act(() => {
            findButton('Re-Write Prose').click();
        });
        expect(handleAutoGenerateScene).toHaveBeenCalledWith(0, 0, { forceFullRewrite: true });

        // Read button
        act(() => {
            findButton('Read').click();
        });
        expect(enterReaderMode).toHaveBeenCalledWith(0, 0);

        // Blueprint Edit -> modify title -> Save
        act(() => {
            findButton('Edit').click();
        });
        const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
        expect(titleInput).toBeTruthy();
        act(() => {
            findButton('Save').click();
        });
        expect(updateSceneBlueprint).toHaveBeenCalledWith(
            0,
            0,
            expect.objectContaining({
                title: 'Signal Fire',
                pov_character: 'Nora Vale'
            })
        );
        expect(showToast).toHaveBeenCalledWith('Scene Blueprint saved.', 'success');
    });

    it('handles WriterView Manuscript Slop Audit drawer, Allowlist, Surgical Clean, and Inline Serif Editor', () => {
        const handleRunManualSlopClean = vi.fn();
        const handleAddStoryAllowlistItem = vi.fn();
        const showToast = vi.fn();

        renderIntoRoot(
            <WriterHarness
                initialWorkspaceTab="manuscript"
                onSlopClean={handleRunManualSlopClean}
                onAllowlist={handleAddStoryAllowlistItem}
                onToast={showToast}
            />
        );

        expect(container.textContent).toContain('Dramatic Beats (1)');

        // Open Slop Audit Drawer via badge
        const slopBadge = container.querySelector('[data-testid="writer-slop-badge"]') as HTMLButtonElement;
        expect(slopBadge).toBeTruthy();
        act(() => {
            slopBadge.click();
        });
        const drawer = container.querySelector('[data-testid="writer-slop-drawer"]');
        expect(drawer).toBeTruthy();
        expect(drawer?.textContent).toContain('eyes widened');

        // Filter to Closer only
        act(() => {
            findButton('Closer (1)').click();
        });
        expect(drawer?.textContent).toContain('Everything would change.');
        expect(drawer?.textContent).not.toContain('eyes widened');

        // Reset filter to All & allow item + run clean
        act(() => {
            findButton('All (2)').click();
        });
        const allowBtn = container.querySelector('[data-testid="slop-allow-btn"]') as HTMLButtonElement;
        act(() => {
            allowBtn.click();
        });
        expect(handleAddStoryAllowlistItem).toHaveBeenCalledWith('eyes widened');

        act(() => {
            findButton('Surgical Clean').click();
        });
        expect(handleRunManualSlopClean).toHaveBeenCalledWith(0, 0);

        // Inline Serif Editor save
        act(() => {
            findButton('Edit Prose').click();
        });
        act(() => {
            findButton('Save Changes').click();
        });
        expect(showToast).toHaveBeenCalledWith('Scene prose updated and saved.', 'success');
    });

    it('renders PipelineView across Novel Creation, Audio Production, and Technical Graph modes', () => {
        const setView = vi.fn();
        const setSelectedSequence = vi.fn();
        const setSelectedScene = vi.fn();
        const handleAutopilot = vi.fn();
        const playSceneAudio = vi.fn();
        const setInspectedStepId = vi.fn();
        const openLogDetailModal = vi.fn();

        const pipelineStory: PipelineStory = {
            ...buildSampleWriterStory(),
            core_thematic_argument: 'Memory survives only when spoken aloud.'
        };

        const novelProgress: NovelProgressEstimate = {
            overallPct: 48,
            phases: {
                1: { pct: 100, status: 'complete', label: 'Established' },
                2: { pct: 100, status: 'complete', label: '2 Cast Ready' },
                3: { pct: 50, status: 'in_progress', label: 'In Progress' },
                4: { pct: 25, status: 'in_progress', label: '1 Drafted' },
                5: { pct: 0, status: 'pending', label: 'Standing By' }
            },
            sequences: [
                {
                    index: 0,
                    number: 1,
                    actNumber: 1,
                    title: 'The Cold Pier',
                    isWoven: true,
                    plannedScenes: 2,
                    estimatedScenes: 2,
                    completedScenes: 1,
                    draftedOnlyScenes: 1,
                    wordsWritten: 14,
                    pct: 50,
                    status: 'in_progress'
                }
            ],
            plannedTotalScenes: 2,
            estimatedTotalScenes: 16,
            isSceneCountEstimated: true,
            completedScenes: 1,
            draftedOnlyScenes: 1,
            wordsWritten: 14,
            targetWords: 60000,
            castCount: 2,
            interviewedCount: 2,
            actsCount: 1,
            seqCount: 1,
            wovenSeqCount: 1,
            editorialDone: false,
            enableEditorialHarness: true,
            nextUp: {
                elementType: 'scene',
                seqIdx: 0,
                sceneIdx: 1,
                title: 'Scene 2: Aftermath at Dawn',
                detail: 'Continue drafting Scene 2.'
            }
        };

        const audioProgress: PipelineAudioProgress = {
            overallPct: 50,
            totalDrafted: 2,
            readyCount: 1,
            staleCount: 1,
            totalDurationSec: 95,
            backendLabel: 'Kokoro Neural TTS',
            castCount: 2,
            voicedCastCount: 2,
            narratorReady: true,
            allAudioComplete: false,
            nextAudioScene: {
                seqIdx: 0,
                seqTitle: 'The Cold Pier',
                label: 'S1.2',
                title: 'Aftermath at Dawn',
                status: 'stale'
            },
            latestSavedAudio: {
                seqIdx: 0,
                sceneIdx: 0,
                seqTitle: 'The Cold Pier',
                label: 'S1.1',
                sceneTitle: 'Signal Fire',
                durationSec: 95,
                sizeBytes: 1524000,
                cueCount: 12
            },
            sequences: [
                {
                    seqIdx: 0,
                    number: 1,
                    title: 'The Cold Pier',
                    scenes: [
                        {
                            seqIdx: 0,
                            sceneIdx: 0,
                            label: 'S1.1',
                            title: 'Signal Fire',
                            status: 'ready',
                            durationSec: 95
                        },
                        {
                            seqIdx: 0,
                            sceneIdx: 1,
                            label: 'S1.2',
                            title: 'Aftermath at Dawn',
                            status: 'stale',
                            durationSec: 0
                        }
                    ]
                }
            ],
            stages: {
                parsing: 'done',
                casting: 'done',
                synthesis: 'standby',
                mastering: 'standby',
                archiving: 'in_progress'
            }
        };

        const promptLog: PipelinePromptLogEntry[] = [
            {
                id: 'log_1',
                stepId: 1,
                timestamp: '10:05:12',
                function: 'initStory() - Tier 0.1',
                status: 'success',
                durationSec: 4.2,
                thinkingTokens: 120,
                responseTokens: 450,
                prompt: 'Initialize story concept and thematic argument'
            }
        ];

        const PipelineHarness: React.FC = () => {
            const [displayMode, setDisplayMode] = useState<string>('stage');
            const [viewMode, setViewMode] = useState<string>('detailed');
            return (
                <PipelineView
                    view="pipeline"
                    setView={setView}
                    story={pipelineStory}
                    setSelectedSequence={setSelectedSequence}
                    setSelectedScene={setSelectedScene}
                    setSettingsTab={vi.fn()}
                    loading={false}
                    loadingStep=""
                    currentPipelineStep={1}
                    inspectedStepId={1}
                    setInspectedStepId={setInspectedStepId}
                    pipelineViewMode={viewMode}
                    setPipelineViewMode={setViewMode}
                    pipelineDisplayMode={displayMode}
                    setPipelineDisplayMode={setDisplayMode}
                    activePipelineWork={null}
                    promptLog={promptLog}
                    continuousAutopilot={false}
                    handleAutopilot={handleAutopilot}
                    toggleContinuousAutopilot={vi.fn()}
                    novelProgress={novelProgress}
                    audioProgress={audioProgress}
                    isAudioAutopilotRunning={false}
                    isAudioAutopilotQueued={false}
                    audioAutopilotProgress={null}
                    handleToggleAudioAutopilot={vi.fn()}
                    isAnyAudioPlaying={false}
                    playSceneAudio={playSceneAudio}
                    stopAllAudioPlayback={vi.fn()}
                    enterReaderMode={vi.fn()}
                    openLogDetailModal={openLogDetailModal}
                    copyVerboseLogToClipboard={vi.fn()}
                    showToast={vi.fn()}
                />
            );
        };

        renderIntoRoot(<PipelineHarness />);

        // Mode 1: Novel Creation
        expect(container.textContent).toContain('48%');
        expect(container.textContent).toContain('The Cold Pier');
        act(() => {
            findButton('Resume Autopilot').click();
        });
        expect(handleAutopilot).toHaveBeenCalledWith({ fromSetup: false });

        // Switch to Mode 2: Audio Production
        act(() => {
            findButton('Audio Production').click();
        });
        expect(container.textContent).toContain('Multi-Voice Audio Drama Production');
        expect(container.textContent).toContain('Kokoro Neural TTS');

        act(() => {
            findButton('S1.1').click();
        });
        expect(playSceneAudio).toHaveBeenCalledWith(0, 0, { autoplay: true, follow: false });

        // Switch to Mode 3: Technical Graph & toggle Simplified
        act(() => {
            findButton('Technical Graph').click();
        });
        expect(container.textContent).toContain('Conceptual Development Agent');
        expect(container.textContent).toContain('Story Arc Reviewer');

        act(() => {
            findButton('Simplified').click();
        });
        expect(container.textContent).not.toContain('Story Arc Reviewer');

        // Dossier button in Step Inspector
        act(() => {
            findButton('Dossier').click();
        });
        expect(openLogDetailModal).toHaveBeenCalledWith('verbose', promptLog[0]);
    });
});
