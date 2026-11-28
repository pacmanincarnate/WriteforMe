import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import {
    DashboardView,
    DirectiveView,
    EditorialView,
    type DashboardStory,
    type DirectiveStory,
    type EditorialStory
} from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

describe('Phase 5E: Dashboard, Directive, and Editorial views', () => {
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

    it('renders DashboardView stats, launches Reading Mode and Editorial Harness, and switches Epistemic tabs', () => {
        const setView = vi.fn();
        const enterReaderMode = vi.fn();
        const runAutonomousEditorialHarness = vi.fn();
        const setEpistemicViewTab = vi.fn();
        const handleExportEpub = vi.fn();
        const story: DashboardStory = {
            id: 'story_dash_1',
            title: 'The Salt Observatory',
            concept: 'An astronomer tracks ghost tides above an underwater city.',
            writing_mode: 'novel',
            acts: [{ number: 1, title: 'Act I' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Seq 1' }],
            scenes: { '0': [{ id: 'sc_0_0', number: 1, title: 'Signal Fire' }] },
            prose: {
                '0-0': { final: 'Brass sextants glinted beneath the sodium lamps of the pier.' }
            },
            cast: [{ id: 'c1', name: 'Nora Vale', role: 'Protagonist' }],
            threads: [{ id: 'T1', name: 'Bell Frequency', description: 'Tide bell mystery' }],
            secret_vault: [
                {
                    id: 'sec_1',
                    title: 'Submerged Relay',
                    truth: 'The tower broadcasts backwards in time.',
                    status: 'dormant'
                }
            ]
        };

        renderIntoRoot(
            <DashboardView
                view="dashboard"
                setView={setView}
                story={story}
                setStory={vi.fn()}
                theme="light"
                isInspectorMode={false}
                selectedSequence={0}
                selectedScene={0}
                loadedImages={{}}
                loadingCover={false}
                coverUploadInputRef={createRef<HTMLInputElement>()}
                generateCoverImage={vi.fn()}
                handleCoverUpload={vi.fn()}
                deleteCoverImage={vi.fn()}
                storyAudioSummary={{ readyCount: 0, totalDrafted: 1, staleCount: 0 }}
                availableSceneAudioMap={{}}
                readingProgress={{}}
                enterReaderMode={enterReaderMode}
                loading={false}
                loadingStep=""
                initializingStoryId={null}
                continuousAutopilot={false}
                isRunningEditorialHarness={false}
                setEditorialScopeSceneId={vi.fn()}
                runAutonomousEditorialHarness={runAutonomousEditorialHarness}
                handleExportEpub={handleExportEpub}
                handleDownloadStoryAudio={vi.fn()}
                handleExportAudioDramaTxt={vi.fn()}
                isExportingStoryAudio={false}
                isExportingSequenceAudio={false}
                isExportingSceneAudio={false}
                isAudioAutopilotRunning={false}
                isAudioAutopilotQueued={false}
                handleToggleAudioAutopilot={vi.fn()}
                handleResetStoryStage={vi.fn()}
                initStory={vi.fn()}
                generateStoryArc={vi.fn()}
                epistemicViewTab="gesm"
                setEpistemicViewTab={setEpistemicViewTab}
                epistemicScrubberCoord="0.0"
                setEpistemicScrubberCoord={vi.fn()}
                epistemicFilterChar="ALL"
                setEpistemicFilterChar={vi.fn()}
                epistemicSearchQuery=""
                setEpistemicSearchQuery={vi.fn()}
                setEditingPropModal={vi.fn()}
                setEditingBeliefModal={vi.fn()}
                handleDeleteProposition={vi.fn()}
                handleInvalidateBelief={vi.fn()}
                retroactivelyInjectClue={vi.fn()}
                openEditModal={vi.fn()}
                openFormModal={vi.fn()}
                requestConfirm={vi.fn()}
                showToast={vi.fn()}
            />
        );

        expect(container.textContent).toContain('The Salt Observatory');
        expect(container.textContent).toContain('Start Reading Mode');
        expect(container.textContent).toContain('Secret Vault (1)');

        const readBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Start Reading Mode')
        );
        const polishBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Review & Polish Manuscript')
        );
        const epubBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Export EPUB')
        );
        const vaultTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Secret Vault (1)')
        );

        act(() => {
            readBtn?.click();
            polishBtn?.click();
            epubBtn?.click();
            vaultTabBtn?.click();
        });

        expect(enterReaderMode).toHaveBeenCalledTimes(1);
        expect(runAutonomousEditorialHarness).toHaveBeenCalledWith({
            mode: 'full_pipeline',
            scopeSceneId: 'ALL'
        });
        expect(handleExportEpub).toHaveBeenCalledTimes(1);
        expect(setEpistemicViewTab).toHaveBeenCalledWith('vault');
    });

    it('renders DirectiveView safeguards, plan checklist, and Apply & Execute button', () => {
        const setProtectWrittenProse = vi.fn();
        const runDirectivePlanner = vi.fn();
        const executeDirectivePlan = vi.fn();
        const handleToggleDirectiveActionSkip = vi.fn();
        const story: DirectiveStory = {
            title: 'The Salt Observatory',
            acts: [{ number: 1, title: 'Act I' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Harbor Arrival' }],
            scenes: { '0': [{ number: 1, title: 'Signal Fire' }] },
            prose: {},
            cast: [{ id: 'c1', name: 'Nora Vale' }]
        };
        const actions = [
            {
                action_type: 'MODIFY_SCENE',
                description: 'Raise lighting tension on the pier.',
                target_act_idx: 0,
                target_seq_idx: 0,
                target_scene_idx: 0,
                details: { title: 'Signal Fire' }
            }
        ];

        renderIntoRoot(
            <DirectiveView
                view="directive"
                setView={vi.fn()}
                story={story}
                setStory={vi.fn()}
                isInspectorMode={false}
                selectedSequence={0}
                selectedScene={0}
                allNarrativeModes={{ DRAMATIC: {} }}
                directiveInput="Deepen tension in Scene 1"
                setDirectiveInput={vi.fn()}
                protectWrittenProse={true}
                setProtectWrittenProse={setProtectWrittenProse}
                cascadeSceneChanges={true}
                setCascadeSceneChanges={vi.fn()}
                verifyDirectiveEdits={true}
                setVerifyDirectiveEdits={vi.fn()}
                isPlanningDirective={false}
                isExecutingDirective={false}
                directivePlanPhase=""
                directivePlan={{
                    evaluation: 'Tighten Scene 1 lighting.',
                    actions
                }}
                setDirectivePlan={vi.fn()}
                directivePlanHistory={[]}
                setDirectivePlanHistory={vi.fn()}
                directiveRefinement=""
                setDirectiveRefinement={vi.fn()}
                expandedDirectiveActions={{ 0: true }}
                setExpandedDirectiveActions={vi.fn()}
                directiveExecutionLogs={[
                    { id: 1, text: 'Completed Scene 1 revision.', status: 'complete' }
                ]}
                setDirectiveExecutionLogs={vi.fn()}
                directiveProgress={100}
                directiveUndoSnapshot={null}
                setDirectiveUndoSnapshot={vi.fn()}
                runDirectivePlanner={runDirectivePlanner}
                restorePreviousDirectivePlan={vi.fn()}
                executeDirectivePlan={executeDirectivePlan}
                handleAddManualDirectiveAction={vi.fn()}
                handleToggleDirectiveActionSkip={handleToggleDirectiveActionSkip}
                handleRemoveDirectiveAction={vi.fn()}
                handleUpdateActionField={vi.fn()}
                handleUpdateActionDetail={vi.fn()}
                handleUpdateAppliedEdit={vi.fn()}
                handleUndoSurgicalEdit={vi.fn()}
                handleFixDirectiveReview={vi.fn()}
                showToast={vi.fn()}
            />
        );

        expect(container.textContent).toContain('Request Change');
        expect(container.textContent).toContain('Tighten Scene 1 lighting.');
        expect(container.textContent).toContain('Completed Scene 1 revision.');

        const protectCheckbox = container.querySelector('#protectWrittenProse') as HTMLInputElement;
        const skipBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Skip'
        );
        const evalBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Evaluate Directive')
        );
        const execBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Apply & Execute Plan')
        );

        act(() => {
            protectCheckbox?.click();
            skipBtn?.click();
            evalBtn?.click();
            execBtn?.click();
        });

        expect(setProtectWrittenProse).toHaveBeenCalledWith(false);
        expect(handleToggleDirectiveActionSkip).toHaveBeenCalledWith(0);
        expect(runDirectivePlanner).toHaveBeenCalledTimes(1);
        expect(executeDirectivePlan).toHaveBeenCalledWith(actions);
    });

    it('renders EditorialView 5-tab suite, .novelignore rule manager, and XML inspector tool runner', () => {
        const setEditorialHarnessTab = vi.fn();
        const handleAddNovelIgnoreRule = vi.fn();
        const handleRunHarnessInspectorTool = vi.fn();
        const runAutonomousEditorialHarness = vi.fn();

        const story: EditorialStory = {
            sequences: [{ number: 1, title: 'Harbor Arrival' }],
            scenes: { '0': [{ id: 'sc_0_0', number: 1, title: 'Signal Fire' }] },
            prose: {
                '0-0': {
                    final: 'Lantern glow spilled across damp granite while the foghorn answered from outside the breakwater.'
                }
            },
            editorial_harness: {
                summary: { meanDivergence: 0.14, verifiedTicketsCount: 1, committedTransactions: 1 },
                logs: [{ id: 'l1', phase: 'PHASE 1', timestamp: '12:00:00', message: 'Voice DNA extracted' }]
            }
        };

        const baseProps = {
            view: 'editorial',
            setView: vi.fn(),
            story,
            isInspectorMode: true,
            selectedSequence: 0,
            selectedScene: 0,
            bannedPhrases: [] as string[],
            slopConfig: DEFAULT_SLOP_CONFIG,
            editorialScopeSceneId: 'ALL',
            setEditorialScopeSceneId: vi.fn(),
            editorialUseDeepLLM: false,
            setEditorialUseDeepLLM: vi.fn(),
            enableEditorialHarnessAutopilot: true,
            setEnableEditorialHarnessAutopilot: vi.fn(),
            isRunningEditorialHarness: false,
            editorialHarnessPhase: 'Ready',
            editorialHarnessProgress: 100,
            runAutonomousEditorialHarness,
            revertAllHarnessTransactions: vi.fn(),
            executeSingleHarnessTransaction: vi.fn(),
            revertHarnessTransaction: vi.fn(),
            novelIgnoreDraftRule: { rule_type: 'ALLOW_PHRASE', pattern: 'salt glass' },
            setNovelIgnoreDraftRule: vi.fn(),
            handleAddNovelIgnoreRule,
            handleRemoveNovelIgnoreRule: vi.fn(),
            editorialToolName: 'grep_manuscript',
            setEditorialToolName: vi.fn(),
            editorialToolArgs: { scene_id: 'sc_0_0', query: 'lantern' },
            setEditorialToolArgs: vi.fn(),
            editorialToolOutput: { matches: 1 },
            handleRunHarnessInspectorTool
        };

        renderIntoRoot(
            <EditorialView
                {...baseProps}
                editorialHarnessTab="overview"
                setEditorialHarnessTab={setEditorialHarnessTab}
            />
        );
        expect(container.textContent).toContain('Developmental Polish');
        expect(container.textContent).toContain('Voice DNA extracted');

        const addExemptionBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Add Exemption')
        );
        const toolsTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('11-Tool XML Manuscript Inspector')
        );
        const diagBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Diagnostic Review Only')
        );

        act(() => {
            addExemptionBtn?.click();
            toolsTabBtn?.click();
            diagBtn?.click();
        });

        expect(handleAddNovelIgnoreRule).toHaveBeenCalledTimes(1);
        expect(setEditorialHarnessTab).toHaveBeenCalledWith('tools');
        expect(runAutonomousEditorialHarness).toHaveBeenCalledWith({
            mode: 'review_only',
            scopeSceneId: 'ALL',
            useLLM: false
        });

        // Verify Tab 5 tool inspector renders output and runs tool
        renderIntoRoot(
            <EditorialView
                {...baseProps}
                editorialHarnessTab="tools"
                setEditorialHarnessTab={setEditorialHarnessTab}
            />
        );
        expect(container.textContent).toContain('"matches": 1');
        const runToolBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Run Tool')
        );
        act(() => {
            runToolBtn?.click();
        });
        expect(handleRunHarnessInspectorTool).toHaveBeenCalledTimes(1);
    });
});
