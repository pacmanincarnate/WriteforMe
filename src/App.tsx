import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
// Explicit imports for names this file used to pick up from window globals (Phase 7).
import { applyThemeToDom, hydrateAllStoresFromStorage, usePipelineStore, useSettingsStore, useUiStore } from '@/stores';
import { STORAGE_KEYS } from '@/config';
import { PROMPT_LOG_CAP } from '@/pipeline';
import type { CallAiFn, PipelineRuntimeContext } from '@/pipeline';
import { applyWorldUpdates } from '@/domain/continuity';
import { clearDirectivePlanResults } from '@/domain/story';
import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import { retrieveLoreContext } from '@/services/rag';
import { PROMPTS } from '@/prompts';
import type { SceneBlueprint, Story } from '@/types';
import type { SceneAudioMeta, SequenceAudioMeta } from '@/services/storage';
import type { KokoroWorkerHandle } from '@/services/audio';
import type { SharedTtsQueueItem, UseShellModalsResult } from '@/hooks';
import { publishAppGlobal } from '@/compat/windowBridge';
import { handOff, setStoryFor, storyFor, storyRefFor } from '@/compat/shellBoundary';
import type { PipelineLogEntry } from '@/stores';
import { applyCascadingNameReplacements, auditEntityNamesAndPlaces, extractCandidatePlaceNames, scanTextForSlop } from '@/domain/slop';

import {
    actForSequence,
    computeAudioProductionEstimate,
    computeNovelProgressEstimate,
    normalizeSequences,
    parseActNumber
} from '@/domain/story';
import { setLiveStoryProviderForAudio, isAudioDramaScriptText } from '@/domain/audio';

import { GraphManager } from '@/domain/lore';

import { prepareLibraryStorySelection } from '@/domain/lifecycle';
import { compileNarrativeStateGraph, createHarnessInspectionTools, runFullManuscriptNlpTelemetry } from '@/domain/editorial';

import { copyVerboseLogToClipboard } from '@/services/browser';

import {
    diskSettingsVault,
    logStore,
    storyStore,
    updateStoryRecordById
} from '@/services/storage';
import { EmbeddingService, VectorStore } from '@/services/rag';

import { findCastIndexForChar, useActiveStory, useAppUpdates, useAutopilotControl, useAutopilotLoop, useDesktopBackends, useArchetypeOptions, useAudioFollowState, useGenerationStatus, useNarrativeLensesToggle, useRelationshipMatrix, useSettingsDisclosures, useAudioProduction, useCustomNarrativeModes, useDirectivePlanEditors, useDirectiveWorkspaceState, useEditorialHarnessState, useEpistemicEditors, useLogDetailModal, useLoreBrowser, useLoreImport, useMcpBridge, useModelCatalog, useNovelIgnoreRules, useOutlineCollapseState, useOutlineExpansion, usePipelineViewState, useRagPanelState, useReaderController, useSceneWorkspaceState, useSetupDraft, useShellModals, useSlopConfig, useStoryEditors, useEnsureStoryId, useStoryAutosave, useStoryHydration, useStoryImages, useStoryLibrary, useStoryReset, useStoryTransfer, useTtsPlayback, useVoiceManagement } from '@/hooks';
import {
    distillLore as orchestrateDistillLore,
    ingestLore as orchestrateIngestLore,
    ingestLoreBatch as orchestrateIngestLoreBatch,
    rebuildRagIndex as orchestrateRebuildRagIndex,
    triggerLoreExtraction as orchestrateTriggerLoreExtraction,
    handleWorldUpdates as orchestrateHandleWorldUpdates,
    retroactivelyInjectClue as orchestrateRetroactivelyInjectClue,
    generateCharacterProfile as orchestrateGenerateCharacterProfile,
    runAgentWithEscalation as orchestrateRunAgentWithEscalation,
    initStory as orchestrateInitStory,
    startNextBook as orchestrateStartNextBook,
    generateStoryArc as orchestrateGenerateStoryArc,
    generateActsAndSequences as orchestrateGenerateActsAndSequences,
    generateSequences as orchestrateGenerateSequences,
    generateScenes as orchestrateGenerateScenes,
    handleRunManualSlopClean as orchestrateHandleRunManualSlopClean,
    rewritePassage as orchestrateRewritePassage,
    handleCascadeSceneToProse as orchestrateHandleCascadeSceneToProse,
    runAudioDramaVoiceDirectorPass as orchestrateRunAudioDramaVoiceDirectorPass,
    writeSceneProse as orchestrateWriteSceneProse,
    handleAutoGenerateScene as orchestrateHandleAutoGenerateScene,
    handleDirectSceneVoices as orchestrateHandleDirectSceneVoices,
    handleFixDirectiveReview as orchestrateHandleFixDirectiveReview,
    runDirectivePlanner as orchestrateRunDirectivePlanner,
    executeDirectivePlan as orchestrateExecuteDirectivePlan,
    runAutonomousEditorialHarness as orchestrateRunAutonomousEditorialHarness,
    executeSingleHarnessTransaction as orchestrateExecuteSingleHarnessTransaction,
    revertHarnessTransaction as orchestrateRevertHarnessTransaction,
    revertAllHarnessTransactions as orchestrateRevertAllHarnessTransactions,
    handleAutopilot as orchestrateHandleAutopilot,
    runContinuousAutopilotStep as orchestrateRunContinuousAutopilotStep,
    rebuildStorySoFar as orchestrateRebuildStorySoFar
} from '@/pipeline';
import {
    EditModal,
    StudioConfirmModal,
    StudioFormModal,
    InterventionModal,
    CritiqueModal,
    LogDetailModal,
    BackToTop,
    ToastNotification,
    StudioSidebar,
    StudioHeader,
    GesmPropositionModal,
    GesmBeliefModal,
    IconPickerModal,
    UpdateModal
} from '@/components';
import {
    CastView,
    DashboardView,
    DirectiveView,
    EditorialView,
    InspectorView,
    LibraryView,
    LogsView,
    LoreView,
    PipelineView,
    ReaderView,
    RelationshipsView,
    SettingsView,
    SetupView,
    StructureView,
    WriterView
} from '@/views';

        const { useEffect, useRef, useMemo, useCallback } = React;


        // --- 1. API CONFIGURATION ---
        // API Key is now managed via UI/LocalStorage in the component





        /** Argument list of a pipeline orchestrator after its leading runtime context. */
        type CtxArgs<F> = F extends (ctx: PipelineRuntimeContext, ...rest: infer R) => unknown ? R : never;

        type ResetStory = Parameters<typeof useStoryReset>[0]['story'];
        type RetrieveArgs = Parameters<typeof retrieveLoreContext>;

        function EllipsisProsef() {
            // The open story, its setter and the load / background-init bookkeeping (Phase 7).
            const {
                activeStoryId, setActiveStoryId,
                story, setStory, storyRef,
                hasHydratedStoryRef: hasHydratedStory,
                isInitialMountRef: isInitialMount,
                skipNextIdbHydrationIdRef,
                initializingStoryId, setInitializingStoryId, initializingStoryIdRef,
                storySnapshotsByIdRef, pendingSetupLoreRef, deletedStoryIdsRef
            } = useActiveStory();
            // Busy flag, autopilot switch and review feedback (Phase 7).
            const {
                loading, setLoading,
                loadingStep, setLoadingStep,
                continuousAutopilot, setContinuousAutopilot,
                isDirectingVoices, setIsDirectingVoices,
                failedReviewCritiques, setFailedReviewCritiques,
                feedbackLedger, setFeedbackLedger, feedbackLedgerRef,
                worldPrimer, setWorldPrimer
            } = useGenerationStatus();

            // ImageStore initialized inside useStoryImages below
            publishAppGlobal('createDefaultStoryTemplate', createDefaultStoryTemplate);
            publishAppGlobal('hasHydratedStory', hasHydratedStory);
            publishAppGlobal('storyRef', storyRef);
            setLiveStoryProviderForAudio(() => storyRef.current);
            publishAppGlobal('setStory', setStory);

            // Inspector Mode State (Toggled in Sidebar Footer)
            const isInspectorMode = useUiStore(s => s.isInspectorMode);
            publishAppGlobal('isInspectorMode', isInspectorMode);

            // Custom Editorial Dialog States (replacing window.confirm and window.prompt)
            const confirmModalState = useUiStore(s => s.confirmModalState);
            const requestConfirm = useUiStore(s => s.requestConfirm);
            publishAppGlobal('requestConfirm', requestConfirm);

            const formModalState = useUiStore(s => s.formModalState);
            const openFormModal = useUiStore(s => s.openFormModal);

            // Toasts and the Act / Sequence / Scene selection live in the UI store (Phase 7).
            const toast = useUiStore(s => s.toast);
            const showToast = useUiStore(s => s.showToast);
            const dismissToast = useUiStore(s => s.dismissToast);

            // Automatic launch update check + Web hard-reload / Desktop download & install modal
            const {
                updateInfo,
                isModalOpen: isUpdateModalOpen,
                openModal: openUpdateModal,
                closeModal: closeUpdateModal,
                isChecking: isCheckingUpdates,
                isApplying: isApplyingUpdate,
                desktopState: desktopUpdaterState,
                error: updateError,
                hasAvailableUpdate,
                checkForUpdates,
                confirmUpdate,
                cancelDownload: cancelUpdateDownload,
                skipCurrentUpdate,
                openReleaseNotes
            } = useAppUpdates({ showToast });
            useDesktopBackends({ showToast });

            const setSelectedAct = useUiStore(s => s.setSelectedAct);
            const selectedSequence = useUiStore(s => s.selectedSequence);
            const setSelectedSequence = useUiStore(s => s.setSelectedSequence);
            const selectedScene = useUiStore(s => s.selectedScene);
            const setSelectedScene = useUiStore(s => s.setSelectedScene);

            const promptLog = usePipelineStore(s => s.promptLog);
            const setPromptLog = usePipelineStore(s => s.setPromptLog);
            const currentPipelineStep = usePipelineStore(s => s.currentPipelineStep);
            const setCurrentPipelineStep = usePipelineStore(s => s.setCurrentPipelineStep);
            const logPipelineDelay = usePipelineStore(s => s.logPipelineDelay);
            const logPipelineValidation = usePipelineStore(s => s.logPipelineValidation);
            const logPipelineError = usePipelineStore(s => s.logPipelineError);
            const logAudioDramaPipelineStageStart = usePipelineStore(s => s.logAudioDramaPipelineStageStart);
            const logAudioDramaPipelineStageComplete = usePipelineStore(s => s.logAudioDramaPipelineStageComplete);
            const logAudioDramaPipelineStageError = usePipelineStore(s => s.logAudioDramaPipelineStageError);
            publishAppGlobal('logAudioDramaPipelineStageStart', logAudioDramaPipelineStageStart);
            publishAppGlobal('logAudioDramaPipelineStageComplete', logAudioDramaPipelineStageComplete);
            publishAppGlobal('logAudioDramaPipelineStageError', logAudioDramaPipelineStageError);
            publishAppGlobal('logPipelineValidation', logPipelineValidation);
            publishAppGlobal('logPipelineError', logPipelineError);
            publishAppGlobal('openFormModal', openFormModal);

            // Declared before useStoryLibrary, which reads it.
            const view = useUiStore(s => s.view);
            const setView = useUiStore(s => s.setView);
            // Always the store's current view, including between a setView call and the next render.
            const viewRef = useMemo(() => ({
                get current() { return useUiStore.getState().view; },
                set current(_next) { /* the store is the source of truth */ }
            }), []);
            publishAppGlobal('setView', setView);
            // Views where autonomous background generation must NEVER pull the user away
            const isAutopilotProtectedView = useUiStore(s => s.isAutopilotProtectedView);
            publishAppGlobal('isAutopilotProtectedView', isAutopilotProtectedView);

            // Story Library (Phase 6E-3): list, covers, preferences and duplicate / delete / cover-style actions.
            const {
                libraryStories, setLibraryStories,
                libraryCovers, setLibraryCovers,
                libraryAudioCounts,
                librarySearchQuery, setLibrarySearchQuery,
                refreshLibrary,
                handleUpdateStoryCoverStyle,
                handleDuplicateStory,
                handleDeleteLibraryStory
            } = useStoryLibrary({
                getActiveStory: () => storyRef.current || story,
                setStory, activeStoryId, setActiveStoryId, view, deletedStoryIdsRef, showToast, requestConfirm
            });

            // Load the active story at startup and on story switches; remember the active id (Phase 6E-3).
            useStoryHydration({
                activeStoryId, setActiveStoryId, setStory: setStoryFor(setStory),
                isInitialMountRef: isInitialMount,
                hasHydratedStoryRef: hasHydratedStory,
                skipNextIdbHydrationIdRef,
                // Declared further down; read when the load runs.
                getLateDeps: () => ({ setWorldPrimer, vectorStore, embeddingService, ingestLoreBatch: handOff(ingestLoreBatch), refreshLibrary, setView, view })
            });
            const callAIRef = useRef<CallAiFn>(async () => '');
            const llmKeysRef = useRef({ apiKey: '', openRouterKey: '' });
            const {
                imageProvider, setImageProvider,
                imageModel, setImageModel,
                geminiImageModelsList, setGeminiImageModelsList,
                openRouterImageModelsList, setOpenRouterImageModelsList,
                isFetchingImageModels, setIsFetchingImageModels,
                imageApiKey, setImageApiKey,
                comfyUrl, setComfyUrl,
                comfyUnet, setComfyUnet,
                comfyClip, setComfyClip,
                comfyVae, setComfyVae,
                comfyLora, setComfyLora,
                comfyLoraStrength, setComfyLoraStrength,
                comfySteps, setComfySteps,
                comfyCfg, setComfyCfg,
                comfySampler, setComfySampler,
                comfyScheduler, setComfyScheduler,
                comfyTimeoutSec, setComfyTimeoutSec,
                comfyStatus, setComfyStatus,
                comfyOptions, setComfyOptions,
                comfyRefreshId,
                customImageStyles, setCustomImageStyles,
                loadedImages, setLoadedImages,
                portraitLoading,
                setPortraitReload,
                loadingCover,
                loadingImages,
                newStyleName, setNewStyleName,
                newStyleDesc, setNewStyleDesc,
                generateCoverImage,
                generateCharacterPortrait,
                uploadCharacterPortrait,
                removeCharacterPortrait,
                deleteCoverImage,
                handleCoverUpload,
                generateBeatImage,
                deleteBeatImage,
                generateSceneImage,
                deleteSceneImage
            } = useStoryImages({
                story,
                selectedSequence,
                selectedScene,
                getLlmKeys: () => llmKeysRef.current,
                callAI: (...args) => callAIRef.current(...args),
                showToast,
                requestConfirm
            });



            // Settings & Model Catalog Hook

            const {
                enableReview, setEnableReview,
                enableStylePolish, setEnableStylePolish,
                enableAudioDramaDirectionPass, setEnableAudioDramaDirectionPass,
                apiProvider, setApiProvider,
                embeddingProvider, setEmbeddingProvider,
                apiKey, setApiKey,
                apiTimeout, setApiTimeout,
                geminiModel, setGeminiModel,
                openRouterKey, setOpenRouterKey,
                openRouterModel, setOpenRouterModel,
                openRouterMaxTokens, setOpenRouterMaxTokens,
                nanoGptKey, setNanoGptKey,
                nanoGptModel, setNanoGptModel,
                anthropicKey, setAnthropicKey,
                anthropicModel, setAnthropicModel,
                koboldUrl, setKoboldUrl,
                koboldModel, setKoboldModel,
                codexUrl, setCodexUrl,
                codexModel, setCodexModel,
                codexModelsList,
                codexStatus,
                codexEmbeddingStatus,
                claudeUrl, setClaudeUrl,
                claudeModel, setClaudeModel,
                claudeModelsList,
                claudeStatus,
                savedModels,
                koboldStatus,
                koboldLoadedModel,
                koboldError,
                devProvider, setDevProvider,
                devModel, setDevModel,
                reviewProvider, setReviewProvider,
                reviewModel, setReviewModel,
                proseProvider, setProseProvider,
                proseModel, setProseModel,
                modelSearchQuery, setModelSearchQuery,
                isSearchingModels,
                searchResults,
                isModelDropdownOpen, setIsModelDropdownOpen,
                reviewModelSearchQuery, setReviewModelSearchQuery,
                isSearchingReviewModels,
                reviewSearchResults,
                isReviewModelDropdownOpen, setIsReviewModelDropdownOpen,
                proseModelSearchQuery, setProseModelSearchQuery,
                isSearchingProseModels,
                proseSearchResults,
                isProseModelDropdownOpen, setIsProseModelDropdownOpen,
                setEnableThinkingAct,
                setEnableThinkingScene,
                setEnableThinkingWriting,
                thinkingBudgetStoryArc, setThinkingBudgetStoryArc,
                thinkingBudgetAct, setThinkingBudgetAct,
                thinkingBudgetScene, setThinkingBudgetScene,
                thinkingBudgetWriting, setThinkingBudgetWriting,
                getModelSettingsSnapshot,
                getDefaultModelForProvider,
                getEffectiveModelConfig,
                saveModel,
                deleteModel,
                fetchGeminiImageModels,
                fetchOpenRouterImageModels,
                refreshCodexModels,
                refreshClaudeModels,
                refreshComfyInfo,
                handleCatalogRefresh,
                callAI
            } = useModelCatalog({
                view,
                story,
                storyRef,
                setCurrentPipelineStep,
                setPromptLog: handOff(setPromptLog),
                showToast,
                logPipelineDelay,
                imageProvider,
                imageApiKey,
                geminiImageModelsList,
                setGeminiImageModelsList,
                openRouterImageModelsList,
                setOpenRouterImageModelsList,
                setIsFetchingImageModels,
                comfyUrl,
                setComfyStatus,
                setComfyOptions,
                setComfyUnet,
                setComfyClip,
                setComfyVae,
                comfyRefreshId
            });
            callAIRef.current = callAI;
            llmKeysRef.current = { apiKey, openRouterKey };

            // Custom narrative modes (Phase 6E-3): saved modes, Settings form state and handlers.
            const {
                customModes,
                allNarrativeModes,
                getModeIcon,
                editingModeId,
                newModeId, setNewModeId,
                newModeContext, setNewModeContext,
                newModePrompt, setNewModePrompt,
                newModeIcon, setNewModeIcon,
                isIconPickerOpen, setIsIconPickerOpen,
                handleStartEditCustomMode,
                handleCancelEditCustomMode,
                handleSaveCustomMode,
                handleDeleteCustomMode
            } = useCustomNarrativeModes({ setStory, showToast, requestConfirm });

            // Master toggle for Narrative Lenses, persisted (Phase 7).
            const [enableNarrativeLenses, setEnableNarrativeLenses] = useNarrativeLensesToggle();

            // AI Slop & Naming configuration (Phase 6E-3): state, persistence and editor handlers.
            const {
                bannedPhrases,
                slopConfig, setSlopConfig,
                newBannedPhraseInput, setNewBannedPhraseInput,
                slopSearchQuery, setSlopSearchQuery,
                expandedSlopGroups, setExpandedSlopGroups,
                expandedSlopCategories, setExpandedSlopCategories,
                newCategoryItemInputs, setNewCategoryItemInputs,
                handleAddBannedPhrase,
                handleSetSlopCategorySeverity,
                handleAddSlopCategoryItem,
                handleRemoveSlopCategoryItem,
                handleResetSlopConfig,
                handleImportSlopJson,
                handleExportSlopJson
            } = useSlopConfig({ showToast });
            // Writer scene workspace UI state, closed/reset on scene or view change (Phase 7).
            const {
                isEditingProseInline, setIsEditingProseInline,
                inlineProseDraft, setInlineProseDraft,
                blueprintActiveTab, setBlueprintActiveTab,
                setIsBlueprintCollapsed,
                isEditingSceneBlueprint, setIsEditingSceneBlueprint,
                sceneBlueprintDraft, setSceneBlueprintDraft,
                sceneWorkspaceTab, setSceneWorkspaceTab,
                isSceneSplitView, setIsSceneSplitView,
                activeSceneDropdown, setActiveSceneDropdown,
                slopAuditDrawerOpen, setSlopAuditDrawerOpen,
                slopAuditFilter, setSlopAuditFilter,
                isRunningManualSlopClean, setIsRunningManualSlopClean,
                slopAllowlistExpanded, setSlopAllowlistExpanded
            } = useSceneWorkspaceState({ selectedSequence, selectedScene, view });

            // Relationship editor selection and grid scroll edges (Phase 7).
            const matrixView = useUiStore(s => s.matrixView);
            const setMatrixView = useUiStore(s => s.setMatrixView);
            const {
                selectedRel, setSelectedRel,
                matrixScroll, matrixScrollRef, measureMatrixScroll, selectMatrixRelationship
            } = useRelationshipMatrix({
                relationships: story.relationships, view, matrixView,
                storyId: story?.id, castCount: story?.cast?.length
            });

            // Directive Agent workspace state (Phase 7).
            const {
                directiveInput, setDirectiveInput,
                directivePlan, setDirectivePlan,
                isPlanningDirective, setIsPlanningDirective,
                directivePlanPhase, setDirectivePlanPhase,
                directiveUndoSnapshot, setDirectiveUndoSnapshot,
                isExecutingDirective, setIsExecutingDirective,
                directiveExecutionLogs, setDirectiveExecutionLogs,
                directiveProgress, setDirectiveProgress,
                protectWrittenProse, setProtectWrittenProse,
                cascadeSceneChanges, setCascadeSceneChanges,
                verifyDirectiveEdits, setVerifyDirectiveEdits,
                directiveRefinement, setDirectiveRefinement,
                directivePlanHistory, setDirectivePlanHistory,
                expandedDirectiveActions, setExpandedDirectiveActions
            } = useDirectiveWorkspaceState();

            // Autonomous Editorial Harness (Tier 6.0 Literary CI/CD) panel state (Phase 7).
            const {
                isRunningEditorialHarness, setIsRunningEditorialHarness,
                editorialHarnessPhase, setEditorialHarnessPhase,
                editorialHarnessProgress, setEditorialHarnessProgress,
                editorialHarnessTab, setEditorialHarnessTab,
                editorialScopeSceneId, setEditorialScopeSceneId,
                editorialUseDeepLLM, setEditorialUseDeepLLM,
                enableEditorialHarnessAutopilot, setEnableEditorialHarnessAutopilot,
                editorialToolName, setEditorialToolName,
                editorialToolArgs, setEditorialToolArgs,
                editorialToolOutput, setEditorialToolOutput
            } = useEditorialHarnessState();
            // .novelignore rule form and handlers (Phase 6E-3).
            const {
                novelIgnoreDraftRule, setNovelIgnoreDraftRule,
                handleAddNovelIgnoreRule,
                handleRemoveNovelIgnoreRule
            } = useNovelIgnoreRules({
                setStory, showToast,
                saveStory: storyStore?.saveStory ? (id, value) => storyStore.saveStory(id, value) : undefined
            });

            // Setup archetype suggestions, drawn once per app start (Phase 7).
            const [archetypeOptions, setArchetypeOptions] = useArchetypeOptions();

            const theme = useSettingsStore(s => s.theme);
            const setTheme = useSettingsStore(s => s.setTheme);

            useEffect(() => {
                applyThemeToDom(theme);
                localStorage.setItem(STORAGE_KEYS.theme, theme);
            }, [theme]);

            const toggleTheme = useSettingsStore(s => s.toggleTheme);

            const settingsTab = useUiStore(s => s.settingsTab);
            const setSettingsTab = useUiStore(s => s.setSettingsTab);

            // Which collapsible Settings sections are open (Phase 7).
            const {
                showAdvancedModelRouting, setShowAdvancedModelRouting,
                showOtherApiKeys, setShowOtherApiKeys
            } = useSettingsDisclosures({ reviewModel, proseModel, reviewProvider, proseProvider });

            const isSidebarOpen = useUiStore(s => s.isSidebarOpen);
            const setIsSidebarOpen = useUiStore(s => s.setIsSidebarOpen);
            const isSidebarCollapsed = useUiStore(s => s.isSidebarCollapsed);
            const setIsSidebarCollapsed = useUiStore(s => s.setIsSidebarCollapsed);
            // Sidebar collapse is persisted by the UI store.

            useEffect(() => {
                const handleSidebarShortcut = (event: KeyboardEvent) => {
                    const focused = document.activeElement;
                    if (!(event.ctrlKey || event.metaKey) || event.key !== '\\' || event.repeat) return;
                    if (!window.matchMedia('(min-width: 768px)').matches) return;
                    if (focused?.matches('input, textarea') || (focused instanceof HTMLElement && focused.isContentEditable)) return;
                    event.preventDefault();
                    setIsSidebarCollapsed(prev => !prev);
                };
                window.addEventListener('keydown', handleSidebarShortcut);
                return () => window.removeEventListener('keydown', handleSidebarShortcut);
            }, []);

            // Outline folding and the Structure act tab (Phase 7).
            const {
                collapsedActs, setCollapsedActs,
                collapsedBeats, setCollapsedBeats,
                expandedBeatAnalysis, setExpandedBeatAnalysis,
                activeActTab, setActiveActTab
            } = useOutlineCollapseState();
            // Continuous Autopilot switch and run bookkeeping (Phase 7); the loop itself starts further down.
            const {
                continuousAutopilotRef, isAutopilotStepRunningRef, prefetchCacheRef, toggleContinuousAutopilot
            } = useAutopilotControl<Promise<Record<string, unknown> | null>>({ continuousAutopilot, setContinuousAutopilot, setLoading });



            // Live scene slop audit for Writer Manuscript pane (computed top-level to obey Rules of Hooks)
            const writerSlopAudit = useMemo(() => {
                if (view !== 'writer' || selectedSequence === null || selectedScene === null) return null;
                if (slopConfig?.enableSlopAudit === false) return null;
                const sId = `${selectedSequence}-${selectedScene}`;
                const scProse = story?.prose?.[sId];
                const proseText = (scProse && typeof scProse === 'object' ? scProse.final || scProse.draft : "") || "";
                if (!proseText || !proseText.trim()) return null;
                const isAudioDramaScene = story?.writing_mode === 'audio_drama' ||
                    (typeof isAudioDramaScriptText === 'function' && isAudioDramaScriptText(proseText));
                return scanTextForSlop(proseText, {
                    slopConfig,
                    customBannedPhrases: bannedPhrases,
                    story,
                    isAudioDrama: isAudioDramaScene
                });
            }, [view, selectedSequence, selectedScene, story?.prose, story?.slop_allowlist, story?.writing_mode, story?.cast, story?.concept, slopConfig, bannedPhrases]);


            // Unsaved Setup form fields, restored from and written to localStorage (Phase 7).
            const {
                inputTitle, setInputTitle,
                inputConcept, setInputConcept,
                inputAuthorNote, setInputAuthorNote,
                inputWritingMode, setInputWritingMode,
                inputBookType, setInputBookType,
                inputCustomWords, setInputCustomWords,
                inputSeriesOpener, setInputSeriesOpener,
                inputSeriesTitle, setInputSeriesTitle,
                inputSerial, setInputSerial,
                inputSerialRotation, setInputSerialRotation,
                resetSetupDraftFields
            } = useSetupDraft();
            // World-building document import: Setup drafts and post-generation lore (Phase 6E-3).
            const {
                importedLoreFiles,
                importingLore,
                importedLoreText,
                loreImportVersionRef,
                discardImportedLore,
                handleUpdateLoreFile,
                handleRemoveLoreFile,
                handleLoreImport,
                handlePostGenLoreImport
            } = useLoreImport({
                story, setStory, setWorldPrimer, showToast, setLoading, setLoadingStep,
                ingestLoreBatch: (loreList, options) => ingestLoreBatch(handOff(loreList), options)
            });
            // Lore tab search, paging and drop-zone flags (Phase 7).
            const {
                loreSearch, setLoreSearch,
                lorePage, setLorePage,
                lorePageSize: LORE_PAGE_SIZE,
                filteredLore, paginatedLore, totalLorePages,
                isDraggingSetupLore, setIsDraggingSetupLore,
                isDraggingLoreTab, setIsDraggingLoreTab
            } = useLoreBrowser(story?.lore);

            const loreInputRef = useRef<HTMLInputElement>(null);
            const coverUploadInputRef = useRef<HTMLInputElement>(null);


            const isLogHydrated = useRef(false);

            useEffect(() => {
                let isMounted = true;
                const loadLogs = async () => {
                    if (!activeStoryId) {
                        setPromptLog([]);
                        isLogHydrated.current = true;
                        return;
                    }
                    try {
                        const targetId = activeStoryId;
                        let savedLogs = (await logStore.loadLogs(targetId)) as PipelineLogEntry[];
                        if (!isMounted) return;

                        // Auto-recovery guard: If this story is missing early setup logs (Conceptual Development
                        // or Character Developer), check if they were left in 'story_default' during initialization.
                        if (targetId !== 'story_default' && Array.isArray(savedLogs) && savedLogs.length > 0 && !savedLogs.some(l => l && l.function && l.function.includes('Character Developer'))) {
                            try {
                                const orphanLogs = (await logStore.loadLogs('story_default')) as PipelineLogEntry[];
                                if (Array.isArray(orphanLogs) && orphanLogs.length > 0) {
                                    const earlyOrphans = orphanLogs.filter(l => l && l.function && (l.function.includes('Character Developer') || l.function.includes('Conceptual Development')));
                                    if (earlyOrphans.length > 0) {
                                        const existingIds = new Set(savedLogs.map(l => l.id));
                                        const needed = earlyOrphans.filter(l => !existingIds.has(l.id));
                                        if (needed.length > 0) {
                                            console.log(`[logStore] Auto-recovered ${needed.length} early setup log(s) from 'story_default' into active story '${targetId}'`);
                                            // Append older setup logs to the end of promptLog array (descending chronological order)
                                            savedLogs = [...savedLogs, ...needed];
                                            await logStore.saveLogs(targetId, savedLogs);
                                        }
                                    }
                                }
                            } catch (recoveryErr) {
                                console.warn("[logStore] Orphaned setup log recovery check failed:", recoveryErr);
                            }
                        }

                        setPromptLog(prev => {
                            if (!savedLogs || savedLogs.length === 0) {
                                return prev || [];
                            }
                            const existingIds = new Set(savedLogs.map(l => l.id));
                            const inFlight = (prev || []).filter(l => l && l.id && !existingIds.has(l.id));
                            return [...inFlight, ...savedLogs].slice(0, PROMPT_LOG_CAP);
                        });
                        isLogHydrated.current = true;
                    } catch (e) {
                        console.error("Failed to load logs:", e);
                        isLogHydrated.current = true;
                    }
                };
                isLogHydrated.current = false;
                loadLogs();
                return () => { isMounted = false; };
            }, [activeStoryId]);

            useEffect(() => {
                if (activeStoryId && isLogHydrated.current) {
                    logStore.saveLogs(activeStoryId, promptLog).catch(e => console.error("Failed to save logs:", e));
                }
            }, [promptLog, activeStoryId]);


            // Pipeline view UI state (Phase 7).
            const {
                inspectedStepId, setInspectedStepId,
                pipelineViewMode, setPipelineViewMode,
                pipelineDisplayMode, setPipelineDisplayMode,
                activePipelineWork, setActivePipelineWork,
                audioAutopilotProgress, setAudioAutopilotProgress,
                logFilter, setLogFilter
            } = usePipelineViewState();
            const setGeneratingSceneKey = usePipelineStore(s => s.setGeneratingSceneKey);

            // --- EBOOK READER & AUDIO REFS ---
            const ttsStatusRef = useRef('idle');

            // --- AUDIO DRAMA STUDIO, VOICE MANAGEMENT & OFFLINE AUDIO PRODUCTION (extracted hooks) ---
            const ttsPlayingSceneRef = useRef(null);
            const {
                isFollowingAudio, setIsFollowingAudio, isFollowingAudioRef,
                returnToAudioNonce, setReturnToAudioNonce
            } = useAudioFollowState();
            const ttsQueueRef = useRef([]);
            const ttsWorkerRef = useRef(null);
            const ttsAudioRef = useRef(null);
            const availableSceneAudioMapRef = useRef({});

            // Late-bound bridges so acyclic hooks can call into later-declared siblings
            const setTtsQueueAndRefRef = useRef<(valOrFn: SharedTtsQueueItem[] | ((prev: SharedTtsQueueItem[]) => SharedTtsQueueItem[])) => void>(() => {});
            const stopTtsPlaybackRef = useRef(() => {});
            const getOrCreateTtsWorkerRef = useRef<() => KokoroWorkerHandle | null>(() => null);
            const initTtsEngineRef = useRef(async () => false);
            const isTtsBusyOrPlayingRef = useRef(false);
            const openEditModalRef = useRef<UseShellModalsResult['openEditModal']>(() => {});
            const setAvailableSceneAudioMapRef = useRef<React.Dispatch<React.SetStateAction<Record<string, SceneAudioMeta>>>>(() => {});
            const setAvailableSequenceAudioMapRef = useRef<React.Dispatch<React.SetStateAction<Record<string, SequenceAudioMeta>>>>(() => {});
            const refreshAvailableSceneAudioRef = useRef(async () => {});
            const getLlmKeys = useCallback(() => llmKeysRef.current, []);
            const openEditModalStable = useCallback<UseShellModalsResult['openEditModal']>((title, value, onConfirm) => openEditModalRef.current(title, value, onConfirm), []);

            const {
                audioDramaSettings, audioDramaSettingsRef,
                sessionTtsTierCapRef, ttsProbeCacheRef, updateAudioDramaSetting,
                isAuditioningVoice,
                commitVoiceEditUpdate,
                stopAuditionPlayback, stopAllAudioPlayback, testAuditionCharacterVoice,
                handleRerollCharacterSeed, handleRerollNarratorSeed,
                handleEditNarratorVoiceProfile, handleEditNarratorSeed,
                handleEditCharacterVoiceProfile, handleEditCharacterSeed,
                handleEditNarratorReferenceText, handleResetNarratorReferenceText,
                handleEditCharacterReferenceText, handleResetCharacterReferenceText,
                handleResetAllVoiceAndAudioCaches
            } = useVoiceManagement({
                story,
                storyRef,
                setStory: setStoryFor(setStory),
                getLlmKeys,
                showToast,
                requestConfirm,
                openEditModal: openEditModalStable,
                ttsQueueRef,
                setTtsQueueAndRefRef,
                ttsWorkerRef,
                ttsStatusRef,
                isTtsBusyOrPlayingRef,
                stopTtsPlaybackRef,
                getOrCreateTtsWorkerRef,
                initTtsEngineRef,
                availableSceneAudioMapRef,
                setAvailableSceneAudioMapRef,
                setAvailableSequenceAudioMapRef,
                refreshAvailableSceneAudioRef
            });

            const {
                availableSceneAudioMap, setAvailableSceneAudioMap,
                availableSequenceAudioMap, setAvailableSequenceAudioMap,
                refreshAvailableSceneAudio, getSceneProseText, isStoredSceneAudioFresh,
                getSceneAudioStatus, storyAudioSummary,
                isExportingSceneAudio, isExportingSequenceAudio, isExportingStoryAudio,
                isRegeneratingSceneAudio,
                isAudioAutopilotRunning, setIsAudioAutopilotRunning,
                isAudioAutopilotQueued, setIsAudioAutopilotQueued, isAudioAutopilotQueuedRef,
                handleDownloadSceneAudio, handleRegenerateSceneAudio,
                handleDownloadSequenceAudio, handleDownloadStoryAudio,
                clearStoryTtsArtifacts, handleToggleAudioAutopilot
            } = useAudioProduction({
                story,
                storyRef,
                setStory: setStoryFor(setStory),
                selectedSequence,
                selectedScene,
                audioDramaSettings,
                audioDramaSettingsRef,
                getLlmKeys,
                showToast,
                requestConfirm,
                setLoading,
                setLoadingStep,
                continuousAutopilot,
                ttsWorkerRef,
                ttsQueueRef,
                stopTtsPlaybackRef,
                availableSceneAudioMapRef,
                audioAutopilotProgress,
                setAudioAutopilotProgress
            });
            setAvailableSceneAudioMapRef.current = setAvailableSceneAudioMap;
            setAvailableSequenceAudioMapRef.current = setAvailableSequenceAudioMap;
            refreshAvailableSceneAudioRef.current = refreshAvailableSceneAudio;

            // Live Progress Control Center state synchronization & memoized estimates
            const prevAudioAutopilotRunningRef = useRef(false);
            const prevContinuousAutopilotRunningRef = useRef(false);
            useEffect(() => {
                if (!prevAudioAutopilotRunningRef.current && isAudioAutopilotRunning) {
                    setPipelineDisplayMode('audio');
                }
                prevAudioAutopilotRunningRef.current = isAudioAutopilotRunning;
            }, [isAudioAutopilotRunning]);
            useEffect(() => {
                if (!prevContinuousAutopilotRunningRef.current && continuousAutopilot) {
                    setPipelineDisplayMode(prev => prev === 'audio' ? 'stage' : prev);
                }
                prevContinuousAutopilotRunningRef.current = continuousAutopilot;
            }, [continuousAutopilot]);
            useEffect(() => {
                if (!loading && !continuousAutopilot && !isAudioAutopilotRunning) {
                    setActivePipelineWork(null);
                }
            }, [loading, continuousAutopilot, isAudioAutopilotRunning]);
            useEffect(() => {
                setActivePipelineWork(null);
                setAudioAutopilotProgress(null);
            }, [activeStoryId]);

            const novelProgress = useMemo(() => computeNovelProgressEstimate(story, {
                enableEditorialHarness: enableEditorialHarnessAutopilot,
                isRunningEditorialHarness,
                editorialHarnessProgress
            }), [story, enableEditorialHarnessAutopilot, isRunningEditorialHarness, editorialHarnessProgress]);

            const audioProgress = useMemo(() => computeAudioProductionEstimate(
                story,
                handOff(availableSceneAudioMap),
                getSceneAudioStatus,
                handOff(audioAutopilotProgress),
                audioDramaSettings,
                isAudioAutopilotRunning
            ), [story, availableSceneAudioMap, getSceneAudioStatus, audioAutopilotProgress, audioDramaSettings, isAudioAutopilotRunning]);

            const {
                readerSettings,
                readerSettingsRef,
                updateReaderSetting,
                readingProgress,
                setReadingProgress,
                readerPageIndex,
                readerPageIndexRef,
                readerTotalPages,
                isReaderHudVisible,
                isTocOpen, setIsTocOpen,
                isAppearanceOpen, setIsAppearanceOpen,
                tocSearchQuery, setTocSearchQuery,
                isFullscreen,
                pageSlideDirection,
                isSceneTransitioning,
                readerContainerWidth,
                visibleScrollChapter, setVisibleScrollChapter,
                readerScrollContainerRef,
                readerColumnsContainerRef,
                visibleScrollSceneRef,
                isProgrammaticScrollRef,
                flatStoryScenesRef,
                touchDragOffset,
                isTouchDragging,
                touchHasDraggedRef,
                justTappedRef,
                storyChapters,
                currentChapterIndex,
                currentChapter,
                flatStoryScenes,
                currentFlatSceneIndex,
                currentReaderSceneItem,
                scrollReaderToElement,
                toggleReaderHud,
                resetReaderHudTimer,
                saveReadingProgress,
                jumpToReaderChapter,
                goToNextReaderChapter,
                goToPrevReaderChapter,
                jumpToReaderScene,
                goToNextReaderScene,
                turnReaderPage,
                returnToActiveAudio,
                enterReaderMode,
                toggleFullscreen,
                handleReaderTouchStart,
                handleReaderTouchMove,
                handleReaderTouchEnd
            } = useReaderController({
                activeStoryId,
                story,
                selectedSequence,
                setSelectedSequence,
                selectedScene,
                setSelectedScene,
                view,
                setView,
                theme,
                setIsSidebarOpen,
                showToast,
                ttsStatusRef,
                ttsPlayingSceneRef,
                setIsFollowingAudio,
                isFollowingAudioRef,
                setReturnToAudioNonce
            });



            // Precompute O(1) act-to-scenes lookup map to eliminate combinatorial DOM bloat
            const scenesByAct = useMemo(() => {
                const map: Record<number, SceneBlueprint[]> = {};
                const acts = story?.acts || [];
                const sequences = story?.sequences || [];
                acts.forEach((a, aIdx) => {
                    const actNum = parseActNumber(a.number, aIdx + 1);
                    const list: SceneBlueprint[] = [];
                    sequences.forEach((seq, sIdx) => {
                        if (parseActNumber(seq.parent_act, actForSequence(sIdx + 1)) === actNum) {
                            const seqScenes = story?.scenes?.[`${sIdx}`] || [];
                            seqScenes.forEach(sc => list.push(sc));
                        }
                    });
                    map[actNum] = list;
                });
                return map;
            }, [story?.acts, story?.sequences, story?.scenes]);




            // --- LIVE TTS PLAYBACK & OFFLINE SCENE AUDIO PLAYER (extracted hook) ---
            const {
                ttsStatus, isTtsBusyOrPlaying, isAnyAudioPlaying,
                ttsProgress, ttsStatusMessage, ttsActiveDevice, ttsError, setTtsError, setTtsCurrentTime, requestChunkAudio,
                ttsIsMiniPlayerVisible, setTtsIsMiniPlayerVisible,
                ttsQueue, setTtsQueueAndRef,
                ttsCurrentChunkIndex, ttsCurrentTime, ttsDuration, ttsGeneratingElapsedSec,
                audioDramaActiveSpeaker, audioDramaActiveEmotion, isAudioDramaModeActive,
                isPlayingMasterSceneMp3,
                ttsPlayingScene, ttsResolvedSource,
                getOrCreateTtsWorker, initTtsEngine, startTtsFromProse, toggleTtsPlayPause,
                stopTtsPlayback, skipTtsChunk, changeTtsVoice,
                playSceneAudio, skipAudioScene, playStoredOrLiveSceneAudio
            } = useTtsPlayback({
                story,
                storyRef,
                setStory: setStoryFor(setStory),
                selectedSequence,
                selectedScene,
                viewRef,
                getLlmKeys,
                showToast,
                readerSettings,
                readerSettingsRef,
                updateReaderSetting,
                flatStoryScenesRef,
                visibleScrollSceneRef,
                jumpToReaderScene,
                enterReaderMode,
                audioDramaSettings,
                audioDramaSettingsRef,
                sessionTtsTierCapRef,
                ttsProbeCacheRef,
                isAuditioningVoice,
                stopAuditionPlayback,
                availableSceneAudioMapRef,
                getSceneProseText,
                isStoredSceneAudioFresh,
                ttsStatusRef,
                ttsPlayingSceneRef,
                setIsFollowingAudio,
                isFollowingAudioRef,
                ttsQueueRef,
                ttsWorkerRef,
                ttsAudioRef
            });
            setTtsQueueAndRefRef.current = setTtsQueueAndRef;
            stopTtsPlaybackRef.current = stopTtsPlayback;
            getOrCreateTtsWorkerRef.current = getOrCreateTtsWorker;
            initTtsEngineRef.current = initTtsEngine;
            isTtsBusyOrPlayingRef.current = isTtsBusyOrPlaying || isAuditioningVoice;

            // Outline expand / collapse state (Phase 6E-3).
            const { expandedSequences, toggleSequence, toggleAllSequencesInAct } = useOutlineExpansion({ story });

            useEffect(() => {
                if (!loading) {
                    setGeneratingSceneKey(null);
                }
            }, [loading]);



            const fileInputRef = useRef<HTMLInputElement>(null);

            // RAG & Graph State
            // useRef's initial-value argument is evaluated on EVERY render - useRef(new VectorStore())
            // constructed (and discarded) a fresh instance, including an IndexedDB open, per render.
            const vectorStore = useRef<VectorStore | null>(null);
            if (!vectorStore.current) vectorStore.current = new VectorStore();
            const graphManager = useRef<GraphManager | null>(null);
            if (!graphManager.current) graphManager.current = new GraphManager();
            const embeddingService = useRef<EmbeddingService | null>(null);
            const ragIndexRevision = useRef(0);
            // RAG index status and RAG inspector test query (Phase 7).
            const {
                ragStatus, setRagStatus,
                isRebuildingRag, setIsRebuildingRag,
                ragTestQuery, setRagTestQuery,
                ragTestResults, setRagTestResults,
                ragTestLoading, setRagTestLoading
            } = useRagPanelState();

            // GESM (Graph-Based Epistemic State Machine) tab state and manual editors (Phase 6E-3).
            const {
                epistemicViewTab, setEpistemicViewTab,
                epistemicScrubberCoord, setEpistemicScrubberCoord,
                epistemicFilterChar, setEpistemicFilterChar,
                epistemicSearchQuery, setEpistemicSearchQuery,
                editingPropModal, setEditingPropModal,
                editingBeliefModal, setEditingBeliefModal,
                handleSaveProposition,
                handleDeleteProposition,
                handleSaveBelief,
                handleInvalidateBelief
            } = useEpistemicEditors({ setStory, showToast, requestConfirm });

            // Edit, escalation-intervention and critique dialogs (Phase 7).
            const {
                editingState, setEditingState,
                interventionState, setInterventionState,
                critiqueState, setCritiqueState,
                openEditModal, openCritiqueModal
            } = useShellModals({ showToast });


            // Prompt-log detail dialog (Phase 6E-3).
            const { logModalState, setLogModalState, openLogDetailModal } = useLogDetailModal({ promptLog: handOff(promptLog) });

            openEditModalRef.current = openEditModal;

            // ============================================================================
            // HELPER: ISOLATED STORY STATE UPDATER (SUPPORTS BACKGROUND INITIALIZATION)
            // Updates React state + snapshot when targetStoryId is active, or updates
            // snapshot + IndexedDB directly without clobbering another active story.
            // ============================================================================
            const updateStoryById = (targetStoryId: string, updaterOrPatch: Parameters<PipelineRuntimeContext['updateStoryById']>[1]) => updateStoryRecordById<Story>({
                deletedStoryIds: deletedStoryIdsRef.current,
                getActiveStory: () => storyRef.current,
                setStory,
                snapshots: storySnapshotsByIdRef.current,
                store: storyStore,
                createDefaultStory: (id) => storyFor(handOff(createDefaultStoryTemplate(id)))
            }, targetStoryId, handOff(updaterOrPatch));

            const ragStatusRef = useRef(ragStatus);
            ragStatusRef.current = ragStatus;
            const isRebuildingRagRef = useRef(isRebuildingRag);
            isRebuildingRagRef.current = isRebuildingRag;

            const getPipelineCtx = (): PipelineRuntimeContext => ({
                getStory: () => storyRef.current || story,
                setStory: setStoryFor(setStory),
                getActiveStoryId: () => storyRef.current?.id || activeStoryId,
                updateStoryById,
                refreshLibrary,
                getModelSettings: () => getModelSettingsSnapshot(),
                getEffectiveModelConfig: (role = 'dev') => getEffectiveModelConfig(role),
                getApiProvider: () => apiProvider,
                getEnableReview: () => enableReview,
                getEnableNarrativeLenses: () => enableNarrativeLenses,
                getEnableStylePolish: () => enableStylePolish,
                getEnableAudioDramaDirectionPass: () => enableAudioDramaDirectionPass,
                getSlopConfig: () => slopConfig,
                getBannedPhrases: () => bannedPhrases,
                getFeedbackLedger: () => feedbackLedgerRef.current || {},
                setFeedbackLedger,
                setFailedReviewCritiques,
                setInterventionState: handOff(setInterventionState),
                setLoading,
                setLoadingStep,
                setCurrentPipelineStep,
                setActivePipelineWork,
                setGeneratingSceneKey,
                setWorldPrimer,
                setRagStatus: (s) => { ragStatusRef.current = s; setRagStatus(s); },
                getRagStatus: () => ragStatusRef.current,
                setIsRebuildingRag: (b) => { isRebuildingRagRef.current = b; setIsRebuildingRag(b); },
                getIsRebuildingRag: () => isRebuildingRagRef.current,
                setView,
                setSelectedSequence,
                setSelectedScene,
                showToast,
                logPipelineValidation,
                logPipelineError,
                getVectorStore: () => vectorStore.current,
                getGraphManager: () => graphManager.current,
                getEmbeddingService: () => embeddingService.current,
                getRagIndexRevision: () => ragIndexRevision.current,
                bumpRagIndexRevision: () => { ragIndexRevision.current += 1; return ragIndexRevision.current; },
                getLoreImportVersion: () => loreImportVersionRef.current,
                retrieveContext: (...args: Parameters<typeof retrieveContext>) => retrieveContext(...args),
                callAI: (...args) => callAI(...args),
                applyWorldUpdates: typeof applyWorldUpdates === 'function' ? applyWorldUpdates : undefined,
                auditEntityNamesAndPlaces,
                applyCascadingNameReplacements,
                extractCandidatePlaceNames,
                getSetupDraft: () => ({
                    inputConcept,
                    inputTitle,
                    inputAuthorNote,
                    inputWritingMode,
                    inputBookType,
                    inputCustomWords,
                    inputSeriesOpener,
                    inputSeriesTitle,
                    inputSerial,
                    inputSerialRotation,
                    importedLoreText
                }),
                clearSetupDraft,
                getPendingSetupLoreMap: () => pendingSetupLoreRef.current,
                getStorySnapshotsByIdMap: () => storySnapshotsByIdRef.current,
                getInitializingStoryIdRef: () => initializingStoryIdRef,
                setInitializingStoryId,
                getSkipNextIdbHydrationIdRef: () => skipNextIdbHydrationIdRef,
                getIsInitialMountRef: () => isInitialMount,
                getIsLogHydratedRef: () => isLogHydrated,
                getHasHydratedStoryRef: () => hasHydratedStory,
                getImportingLore: () => importingLore,
                setActiveStoryId,
                setPromptLog: handOff(setPromptLog),
                setSelectedAct,
                setActiveActTab,
                getSelectedSequence: () => selectedSequence,
                getView: () => viewRef.current,
                isAutopilotProtectedView,
                logPipelineDelay,
                getAllNarrativeModes: () => allNarrativeModes,
                getSelectedScene: () => selectedScene,
                getLoading: () => loading,
                getIsRunningManualSlopClean: () => isRunningManualSlopClean,
                setIsRunningManualSlopClean,
                getIsDirectingVoices: () => isDirectingVoices,
                setIsDirectingVoices,
                getFailedReviewCritiques: () => failedReviewCritiques,
                getApiCredentials: () => ({
                    apiKey,
                    openRouterKey,
                    nanoGptKey,
                    anthropicKey,
                    koboldUrl,
                    codexUrl,
                    claudeUrl,
                    openRouterMaxTokens
                }),
                getDirectiveInput: () => directiveInput,
                getDirectivePlan: () => directivePlan,
                setDirectivePlan,
                setDirectivePlanHistory,
                getIsPlanningDirective: () => isPlanningDirective,
                setIsPlanningDirective,
                setDirectivePlanPhase,
                getIsExecutingDirective: () => isExecutingDirective,
                setIsExecutingDirective,
                setDirectiveProgress,
                setDirectiveExecutionLogs,
                setDirectiveUndoSnapshot,
                setDirectiveRefinement,
                setExpandedDirectiveActions,
                getProtectWrittenProse: () => protectWrittenProse,
                getCascadeSceneChanges: () => cascadeSceneChanges,
                getVerifyDirectiveEdits: () => verifyDirectiveEdits,
                getEditorialScopeSceneId: () => editorialScopeSceneId,
                getEditorialUseDeepLLM: () => editorialUseDeepLLM,
                getEnableEditorialHarnessAutopilot: () => enableEditorialHarnessAutopilot,
                setIsRunningEditorialHarness,
                setEditorialHarnessPhase,
                setEditorialHarnessProgress,
                getContinuousAutopilot: () => continuousAutopilot,
                setContinuousAutopilot,
                getContinuousAutopilotRef: () => continuousAutopilotRef,
                toggleContinuousAutopilot,
                getPrefetchCacheRef: () => prefetchCacheRef,
                requestConfirm,
                notifyAlert: (msg) => { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg); }
            });

            // ============================================================================
            // HELPER: SCALABLE MAP-REDUCE WORLD BIBLE DISTILLER
            // Handles world bibles of arbitrary length (5k to 500k+ characters)
            // without truncation cliffs, using Fast-Path (<=28k), Sequential Map-Reduce,
            // and Hierarchical Tree-Reduction (>20k briefings).
            // ============================================================================
            const distillLore = (text: CtxArgs<typeof orchestrateDistillLore>[0], options: CtxArgs<typeof orchestrateDistillLore>[1] = {}) => orchestrateDistillLore(getPipelineCtx(), text, options);
            publishAppGlobal('distillLore', distillLore);

            const clearImportedLore = () => {
                // Ignore pending reads if the user clears the files or starts another story.
                discardImportedLore();
                setWorldPrimer(null);
                if (loreInputRef.current) loreInputRef.current.value = '';
            };

            const clearSetupDraft = () => {
                resetSetupDraftFields();
                // Clear imported lore files without wiping the newly created story's active worldPrimer
                discardImportedLore();
                if (loreInputRef.current) loreInputRef.current.value = '';
                try {
                    localStorage.removeItem(STORAGE_KEYS.draftLoreFiles);
                } catch {
                    // Storage unavailable; nothing to remove.
                }
            };

            // ============================================================================
            // TIER 6.3: RETROACTIVE STATE INJECTION (RSI) AGENT
            // Associated Prompt: PROMPTS.rsiPrompt
            // ============================================================================

            /**
             * Retroactively Injects a Clue Directive into Preceding Drafted Scene Prose via RSI
             */
            const retroactivelyInjectClue = (secretId: CtxArgs<typeof orchestrateRetroactivelyInjectClue>[0], clueIdx: CtxArgs<typeof orchestrateRetroactivelyInjectClue>[1], currentStory: CtxArgs<typeof orchestrateRetroactivelyInjectClue>[2] = story) => orchestrateRetroactivelyInjectClue(getPipelineCtx(), secretId, clueIdx, currentStory);
            publishAppGlobal('retroactivelyInjectClue', retroactivelyInjectClue);


            // 2A: Upstream AI Slop Entity Name & Place Repair Helper

            // TIER 6.4: Shared scene archivist, used after writing and directive verification.




            const handleFixDirectiveReview = (actionIdx: CtxArgs<typeof orchestrateHandleFixDirectiveReview>[0]) => orchestrateHandleFixDirectiveReview(getPipelineCtx(), actionIdx);


            const restorePreviousDirectivePlan = () => {
                if (isPlanningDirective || isExecutingDirective || !directivePlanHistory.length) return;
                const restored = clearDirectivePlanResults(directivePlanHistory[directivePlanHistory.length - 1]);
                setDirectivePlan(restored);
                setExpandedDirectiveActions(restored?.actions?.length === 1 ? { 0: true } : {});
                setDirectivePlanHistory(prev => prev.slice(0, -1));
                setDirectiveRefinement('');
                setDirectiveExecutionLogs([]);
                setDirectiveProgress(0);
                setDirectiveUndoSnapshot(null);
            };



            const handleRunManualSlopClean = (seqIdx: CtxArgs<typeof orchestrateHandleRunManualSlopClean>[0], sceneIdx: CtxArgs<typeof orchestrateHandleRunManualSlopClean>[1]) => orchestrateHandleRunManualSlopClean(getPipelineCtx(), seqIdx, sceneIdx);

            const handleRewritePassage = (request: CtxArgs<typeof orchestrateRewritePassage>[0]) => orchestrateRewritePassage(getPipelineCtx(), request);

            const executeDirectivePlan = (planActions: CtxArgs<typeof orchestrateExecuteDirectivePlan>[0]) => orchestrateExecuteDirectivePlan(getPipelineCtx(), planActions);

            // ============================================================================
            // TIER 6.1: DIRECTIVE PLANNER AGENT
            // Associated Prompt: PROMPTS.directivePlanner
            // ============================================================================
            const runDirectivePlanner = (refinementRequest: CtxArgs<typeof orchestrateRunDirectivePlanner>[0] = '') => orchestrateRunDirectivePlanner(getPipelineCtx(), refinementRequest);

            // Manual edits to the directive plan (Phase 6E-3).
            const {
                handleUpdateActionField,
                handleUpdateActionDetail,
                handleUpdateAppliedEdit,
                handleToggleDirectiveActionSkip,
                handleRemoveDirectiveAction,
                handleAddManualDirectiveAction,
                handleUndoSurgicalEdit
            } = useDirectivePlanEditors({
                story, setStory, directivePlan, setDirectivePlan, setExpandedDirectiveActions,
                isPlanningDirective, isExecutingDirective
            });



            // ============================================================================
            // TIER 6.0: AUTONOMOUS EDITORIAL HARNESS & LITERARY CI/CD ORCHESTRATOR
            // Executes Phases 1–5 across any drafted scene or the entire manuscript:
            //   - mode = 'full_pipeline': Runs Phases 1–3 (Review & Plan) + Phases 4–5 (3-Wave Surgical Execution & 4-Gate CI/CD)
            //   - mode = 'review_only': Runs Phases 1–3 only (Diagnostic Review, Tribunal, & 3-Wave Plan compilation)
            //   - mode = 'execute_plan': Executes pending transactions in the compiled 3-Wave Edit Plan through the 4-Gate CI/CD suite
            // ============================================================================
            const runAutonomousEditorialHarness = (opts: CtxArgs<typeof orchestrateRunAutonomousEditorialHarness>[0] = {}) => orchestrateRunAutonomousEditorialHarness(getPipelineCtx(), opts);

            const executeSingleHarnessTransaction = (transactionId: CtxArgs<typeof orchestrateExecuteSingleHarnessTransaction>[0]) => orchestrateExecuteSingleHarnessTransaction(getPipelineCtx(), transactionId);

            const revertHarnessTransaction = (transactionId: CtxArgs<typeof orchestrateRevertHarnessTransaction>[0]) => orchestrateRevertHarnessTransaction(getPipelineCtx(), transactionId);

            const revertAllHarnessTransactions = () => orchestrateRevertAllHarnessTransactions(getPipelineCtx());

            const handleRunHarnessInspectorTool = () => {
                const currentStory = storyRef.current || story;
                const harness = (currentStory.editorial_harness || {}) as Partial<{
                    fullTelemetry: ReturnType<typeof runFullManuscriptNlpTelemetry>;
                    nsg: ReturnType<typeof compileNarrativeStateGraph>;
                    layer0Map: Parameters<typeof createHarnessInspectionTools>[3];
                }>;
                const fullTelemetry = harness.fullTelemetry || runFullManuscriptNlpTelemetry(storyFor(currentStory), bannedPhrases, slopConfig);
                const nsg = harness.nsg || compileNarrativeStateGraph(storyFor(currentStory), fullTelemetry);
                const layer0Map = harness.layer0Map || {};
                const tools = createHarnessInspectionTools(storyFor(currentStory), nsg, fullTelemetry, layer0Map);
                const fn = (tools as Record<string, ((args: unknown) => unknown) | undefined>)[editorialToolName];
                if (typeof fn !== 'function') {
                    setEditorialToolOutput({ error: `Unknown tool: ${editorialToolName}` });
                    return;
                }
                const result = fn(editorialToolArgs);
                setEditorialToolOutput(result);
            };

            publishAppGlobal('runAutonomousEditorialHarness', runAutonomousEditorialHarness);
            publishAppGlobal('executeSingleHarnessTransaction', executeSingleHarnessTransaction);
            publishAppGlobal('revertHarnessTransaction', revertHarnessTransaction);
            publishAppGlobal('revertAllHarnessTransactions', revertAllHarnessTransactions);

            const runAgentWithEscalation = (params: CtxArgs<typeof orchestrateRunAgentWithEscalation>[0]) => orchestrateRunAgentWithEscalation(getPipelineCtx(), params);


            const initStory = (isAutopilotOrEvent: CtxArgs<typeof orchestrateInitStory>[0] = false, options: CtxArgs<typeof orchestrateInitStory>[1] = {}) => orchestrateInitStory(getPipelineCtx(), isAutopilotOrEvent, options);
            // Book series: creates the next book from the active story and builds its bible.
            const startNextBook = (input: CtxArgs<typeof orchestrateStartNextBook>[0]) => orchestrateStartNextBook(getPipelineCtx(), input);

            // ============================================================================
            // TIER 1.1: STORY ARC PLANNER & TIER 1.2: STORY ARC REVIEWER
            // Associated Prompts: PROMPTS.storyArc, PROMPTS.arcReview
            // ============================================================================
            const generateStoryArc = (currentStory: CtxArgs<typeof orchestrateGenerateStoryArc>[0] = story, isAutopilot: CtxArgs<typeof orchestrateGenerateStoryArc>[1] = false) => orchestrateGenerateStoryArc(getPipelineCtx(), currentStory, isAutopilot);

            const generateActsAndSequences = (currentStory: CtxArgs<typeof orchestrateGenerateActsAndSequences>[0] = story, isAutopilot: CtxArgs<typeof orchestrateGenerateActsAndSequences>[1] = false) => orchestrateGenerateActsAndSequences(getPipelineCtx(), currentStory, isAutopilot);



            // Single Item Ingest with Redundancy Check (3-Tier Lore Merger - A4)
            const ingestLore = (item: CtxArgs<typeof orchestrateIngestLore>[0], rebuild: CtxArgs<typeof orchestrateIngestLore>[1] = null) => orchestrateIngestLore(getPipelineCtx(), item, rebuild);

            // Batch Ingest (for Init or Import)
            const ingestLoreBatch = (loreList: CtxArgs<typeof orchestrateIngestLoreBatch>[0], options: CtxArgs<typeof orchestrateIngestLoreBatch>[1] = {}) => orchestrateIngestLoreBatch(getPipelineCtx(), loreList, options);

            const rebuildRagIndex = () => orchestrateRebuildRagIndex(getPipelineCtx());

            // Build Graph on Load/Change
            useEffect(() => {
                if (story.lore) {
                    graphManager.current?.buildGraph(story.lore);
                }
            }, [story.lore]);




            const toggleAct = (idx: number | string) => {
                setCollapsedActs(prev => ({ ...prev, [idx]: !prev[idx] }));
            };

            const toggleBeats = (bId: string) => {
                setCollapsedBeats(prev => ({ ...prev, [bId]: !prev[bId] }));
            };

            const toggleBeatAnalysis = (bId: string) => {
                setExpandedBeatAnalysis(prev => ({ ...prev, [bId]: !prev[bId] }));
            };




            // Autosave the open story once it has been loaded from storage (Phase 6E-3).
            useStoryAutosave({ story, activeStoryId, hasHydratedStoryRef: hasHydratedStory });

            // Instantiate/Update Embedding Service
            useEffect(() => {
                let key = "";
                if (embeddingProvider === 'gemini') key = apiKey;
                else if (embeddingProvider === 'openrouter') key = openRouterKey;
                else if (embeddingProvider === 'nanogpt') key = nanoGptKey;
                else if (embeddingProvider === 'koboldcpp' || embeddingProvider === 'codex') key = "";

                embeddingService.current = new EmbeddingService(key, embeddingProvider, koboldUrl, codexUrl);
            }, [apiKey, openRouterKey, nanoGptKey, koboldUrl, codexUrl, embeddingProvider]);




            // A story without an id gets one and becomes the active story.
            useEnsureStoryId({ story, setActiveStoryId, setStory });



            // ============================================================================
            // TIER 6.5: LORE EXTRACTION AGENT
            // Associated Prompt: PROMPTS.loreExtraction
            // ============================================================================
            const triggerLoreExtraction = (payload: CtxArgs<typeof orchestrateTriggerLoreExtraction>[0], activeActNum: CtxArgs<typeof orchestrateTriggerLoreExtraction>[1] = 1, activeSceneNum: CtxArgs<typeof orchestrateTriggerLoreExtraction>[2] = 1) => orchestrateTriggerLoreExtraction(getPipelineCtx(), payload, activeActNum, activeSceneNum);


            const handleWorldUpdates = (updates: CtxArgs<typeof orchestrateHandleWorldUpdates>[0], activeActNum: CtxArgs<typeof orchestrateHandleWorldUpdates>[1] = 1, activeSceneNum: CtxArgs<typeof orchestrateHandleWorldUpdates>[2] = 1, targetStory: CtxArgs<typeof orchestrateHandleWorldUpdates>[3] = null, sceneObj: CtxArgs<typeof orchestrateHandleWorldUpdates>[4] = null) => orchestrateHandleWorldUpdates(getPipelineCtx(), updates, activeActNum, activeSceneNum, targetStory, sceneObj);
            publishAppGlobal('handleWorldUpdates', handleWorldUpdates);
            publishAppGlobal('applyWorldUpdates', applyWorldUpdates);



            // Stage reset and factory reset (Phase 6E-3).
            const { handleResetStoryStage, handleDeleteStory } = useStoryReset({
                story: storyFor<ResetStory>(story), storyRef: storyRefFor<ResetStory>(storyRef), setStory: setStoryFor<(next: ResetStory) => unknown>(setStory), setActiveStoryId, requestConfirm, showToast,
                clearStoryTtsArtifacts: handOff(clearStoryTtsArtifacts), setContinuousAutopilot, setReadingProgress, prefetchCacheRef,
                setLoadedImages: handOff(setLoadedImages), setFeedbackLedger: handOff(setFeedbackLedger),
                setSelectedAct, setSelectedSequence, setSelectedScene, setActiveActTab, setCollapsedActs,
                view, viewRef, setView,
                graphManager: handOff(graphManager), vectorStore, embeddingService, ingestLoreBatch: handOff(ingestLoreBatch),
                refreshLibrary, setLibraryStories, setLibraryCovers, clearSetupDraft
            });
            publishAppGlobal('handleResetStoryStage', handleResetStoryStage);

            // Export (JSON, audio-drama script, EPUB) and file import (Phase 6E-3).
            const { handleExport, handleExportAudioDramaTxt, handleExportEpub, handleExportMarkdown, handleExportPdf, handleImport } = useStoryTransfer({
                story, storyRef, setStory, setActiveStoryId, setLoadedImages, setPortraitReload, setView,
                refreshLibrary, refreshAvailableSceneAudio, showToast, requestConfirm: handOff(requestConfirm),
                dismissToast,
                enterReaderMode, playSceneAudio
            });
            publishAppGlobal('handleImport', handleImport);

            // RAG Retrieval Engine with BM25 Lexical Fallback & Knowledge Graph Traversal (delegated to src/services/rag)
            const retrieveContext = (query: RetrieveArgs[0], threshold: RetrieveArgs[2] = 0.5, filterFn: RetrieveArgs[3] = null, loreList: RetrieveArgs[4] = null) =>
                retrieveLoreContext(
                    query,
                    {
                        embeddingService: embeddingService.current,
                        vectorStore: vectorStore.current,
                        graphManager: graphManager.current,
                        fallbackLoreList: (story && story.lore) || []
                    },
                    threshold,
                    filterFn,
                    loreList
                );
            publishAppGlobal('retrieveContext', retrieveContext);

            // RAG Inspector Handler
            const handleRagTest = async () => {
                if (!ragTestQuery.trim()) return;
                setRagTestLoading(true);
                try {
                    // Test retrieval NO FILTER
                    const results = await retrieveContext(ragTestQuery, 0.0); // 0.0 threshold to see everything
                    setRagTestResults(results);
                } catch (e) {
                    alert("RAG Test Failed: " + (e as Error).message);
                } finally {
                    setRagTestLoading(false);
                }
            };



            // ============================================================================
            // TIER 0.2: CHARACTER DEVELOPMENT AGENT - ON DEMAND
            // Associated Prompt: PROMPTS.characterDevelopment
            // ============================================================================
            const generateCharacterProfile = (...args: CtxArgs<typeof orchestrateGenerateCharacterProfile>) => orchestrateGenerateCharacterProfile(getPipelineCtx(), ...args);


            // Scene & beat editors (Phase 6E-3): pure transforms live in @/domain/story/sceneEditing.
            const {
                handleBeatChange,
                handleAddBeat,
                handleDeleteBeat,
                handleDeleteScene,
                updateSceneBlueprint,
                handleDismissStaleProse,
                handleAddScene,
                handleMoveScene,
                handleAddStoryAllowlistItem,
                handleRemoveStoryAllowlistItem,
                handleDeleteLore
            } = useStoryEditors({
                story,
                setStory,
                selectedSequence,
                selectedScene,
                setSelectedSequence,
                setSelectedScene,
                showToast,
                requestConfirm
            });
            publishAppGlobal('updateSceneBlueprint', updateSceneBlueprint);

            const handleCascadeSceneToProse = (seqIdx: CtxArgs<typeof orchestrateHandleCascadeSceneToProse>[0], sceneIdx: CtxArgs<typeof orchestrateHandleCascadeSceneToProse>[1], options: CtxArgs<typeof orchestrateHandleCascadeSceneToProse>[2] = {}) => orchestrateHandleCascadeSceneToProse(getPipelineCtx(), seqIdx, sceneIdx, options);
            publishAppGlobal('handleCascadeSceneToProse', handleCascadeSceneToProse);

            publishAppGlobal('handleAddScene', handleAddScene);

            publishAppGlobal('handleMoveScene', handleMoveScene);

            const updateCharacterStateForScene = (charName: string, stateUpdates: Record<string, unknown> = {}) => {
                if (!charName) return;
                const cleanName = String(charName).trim();
                if (!cleanName) return;

                const updatedStory = setStory(prev => {
                    const prevStates: Record<string, Record<string, unknown>> = { ...((prev.character_states as Record<string, Record<string, unknown>> | undefined) || {}) };
                    const matchedKey = Object.keys(prevStates).find(k => k.toLowerCase() === cleanName.toLowerCase()) || cleanName;
                    const origState = prevStates[matchedKey] || {};
                    const nextPatch: Record<string, unknown> = { ...(stateUpdates || {}) };
                    if ('physical_state' in nextPatch && !('physical_status' in nextPatch)) {
                        nextPatch.physical_status = nextPatch.physical_state;
                    } else if ('physical_status' in nextPatch && !('physical_state' in nextPatch)) {
                        nextPatch.physical_state = nextPatch.physical_status;
                    }
                    prevStates[matchedKey] = {
                        ...origState,
                        name: origState.name || cleanName,
                        character: origState.character || cleanName,
                        ...nextPatch,
                        user_edited: true
                    };
                    return {
                        ...prev,
                        character_states: prevStates
                    };
                });

                if (updatedStory?.id) {
                    storyStore.saveStory(updatedStory.id, updatedStory).catch(err => console.warn("Failed saving character state update:", err));
                }
            };
            publishAppGlobal('updateCharacterStateForScene', updateCharacterStateForScene);

            const requestSequenceWeaving = () => {
                if (!story.acts || story.acts.length === 0) {
                    generateActsAndSequences();
                    return;
                }
                if (story.sequences && story.sequences.length > 0 && story.sequences.length < 8) {
                    const padded = normalizeSequences(story.sequences);
                    const updated = {
                        ...story,
                        sequences: padded
                    };
                    setStory(updated);
                    storyRef.current = updated;
                    if (updated.id) {
                        storyStore.saveStory(updated.id, updated).catch(err => console.warn("Failed saving padded sequences:", err));
                    }
                    showToast("Restored all sequences without overwriting existing scenes!", "success");
                    return;
                }
                if (story.sequences && story.sequences.length >= 8) {
                    requestConfirm({
                        title: "Rerun Sequence Weaver?",
                        message: "Rerunning the Sequence Weaver will overwrite ALL sequences and subsequent scenes/beats. This cannot be undone.",
                        confirmLabel: "Rerun Weaver",
                        danger: true,
                        onConfirm: () => generateSequences()
                    });
                    return;
                }
                generateSequences();
            };

            // ============================================================================
            // STORY SO FAR UPDATER
            // ============================================================================
            const rebuildStorySoFar = async (): Promise<void> => {
                await orchestrateRebuildStorySoFar(getPipelineCtx());
            };

            // ============================================================================
            // TIER 3.1 & 3.2: SEQUENCE AGENT (LARGE)
            // Associated Prompts: PROMPTS.sequenceAgent, PROMPTS.sequenceReview
            // ============================================================================
            const generateSequences = (currentStory: CtxArgs<typeof orchestrateGenerateSequences>[0] = story, isAutopilot: CtxArgs<typeof orchestrateGenerateSequences>[1] = false) => orchestrateGenerateSequences(getPipelineCtx(), currentStory, isAutopilot);

            const requestSceneWeaving = (seqIdx?: unknown) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                if ((story.scenes?.[`${sIdx}`]?.length ?? 0) > 0) {
                    requestConfirm({
                        title: `Rerun Scene Weaver for Sequence ${sIdx + 1}?`,
                        message: `Rerunning the Scene Weaver will overwrite ALL existing scenes, beats, and drafted prose for Sequence ${sIdx + 1}. This cannot be undone.`,
                        confirmLabel: "Rerun Weaver",
                        danger: true,
                        onConfirm: () => generateScenes(sIdx)
                    });
                    return;
                }
                generateScenes(sIdx);
            };

            const generateScenes = (sequenceIndex: CtxArgs<typeof orchestrateGenerateScenes>[0], currentStory: CtxArgs<typeof orchestrateGenerateScenes>[1] = story, isAutopilot: CtxArgs<typeof orchestrateGenerateScenes>[2] = false, isPrefetch: CtxArgs<typeof orchestrateGenerateScenes>[3] = false) => orchestrateGenerateScenes(getPipelineCtx(), sequenceIndex, currentStory, isAutopilot, isPrefetch);

            // ============================================================================

            const runAudioDramaVoiceDirectorPass = (opts: CtxArgs<typeof orchestrateRunAudioDramaVoiceDirectorPass>[0] = {}) => orchestrateRunAudioDramaVoiceDirectorPass(getPipelineCtx(), opts);

            const writeSceneProse = (...args: CtxArgs<typeof orchestrateWriteSceneProse>) => orchestrateWriteSceneProse(getPipelineCtx(), ...args);

            publishAppGlobal('writeSceneProse', writeSceneProse);
            publishAppGlobal('runAudioDramaVoiceDirectorPass', runAudioDramaVoiceDirectorPass);
            publishAppGlobal('runAgentWithEscalation', runAgentWithEscalation);
            publishAppGlobal('generateStoryArc', generateStoryArc);
            publishAppGlobal('generateActsAndSequences', generateActsAndSequences);
            publishAppGlobal('generateCharacterProfile', generateCharacterProfile);
            publishAppGlobal('generateScenes', generateScenes);
            publishAppGlobal('triggerLoreExtraction', triggerLoreExtraction);
            publishAppGlobal('PROMPTS', PROMPTS);
            publishAppGlobal('callAI', callAI);

            const copyFullScene = () => {
                const seq = selectedSequence !== null ? selectedSequence : 0;
                const sc = selectedScene !== null ? selectedScene : 0;
                if (!story.scenes || !story.scenes[`${seq}`] || !story.scenes[`${seq}`][sc]) return;
                const scene = story.scenes[`${seq}`][sc];
                const sId = `${seq}-${sc}`;
                let text = `SCENE ${scene.number}: ${(scene.title || "").toUpperCase()}\n\n`;
                const sceneProse = story.prose?.[sId];
                if (sceneProse && typeof sceneProse === 'object' && sceneProse.final) {
                    text += sceneProse.final + "\n\n";
                }

                if (story.writing_mode === 'audio_drama') {
                    try {
                        const blob = new Blob([text.trim()], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${story.title ? story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'untitled'}_scene_${scene.number}_drama.txt`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                        showToast("Scene exported as Audio Drama txt.", "success");
                    } catch (err) {
                        showToast("Export failed: " + (err as Error).message, "error");
                    }
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-9999px";
                    document.body.appendChild(textArea);
                    textArea.select();
                    try { document.execCommand('copy'); showToast("Copied to clipboard!"); } catch { alert("Copy failed."); }
                    document.body.removeChild(textArea);
                }
            };

            const handleAutopilot = (options: CtxArgs<typeof orchestrateHandleAutopilot>[0] = {}) => orchestrateHandleAutopilot(getPipelineCtx(), options);

            const runContinuousAutopilotStep = () => orchestrateRunContinuousAutopilotStep(getPipelineCtx());

            publishAppGlobal('runContinuousAutopilotStep', runContinuousAutopilotStep);
            publishAppGlobal('toggleContinuousAutopilot', toggleContinuousAutopilot);
            publishAppGlobal('handleAutopilot', handleAutopilot);

            // Keeps running pipeline steps while Continuous Autopilot is on (Phase 7).
            useAutopilotLoop({
                continuousAutopilot, setContinuousAutopilot, setLoading,
                continuousAutopilotRef, isAutopilotStepRunningRef, prefetchCacheRef,
                apiProvider, koboldUrl, showToast,
                runStep: runContinuousAutopilotStep,
                onRunEnded: () => {
                    if (isAudioAutopilotQueuedRef.current) {
                        isAudioAutopilotQueuedRef.current = false;
                        setIsAudioAutopilotQueued(false);
                        showToast("Story generation complete! Starting queued Audio Drama Autopilot...", "success");
                        setIsAudioAutopilotRunning(true);
                    }
                }
            });


            // ─────────────────────────────────────────────────────────────────────────────
            // Antigravity MCP Live Bridge
            // Connects to local MCP WebSocket relay on port 3002 (or custom port).
            // Enables bi-directional communication, state queries, model configuration,
            // new story initialization, and pipeline control from Antigravity.
            // ─────────────────────────────────────────────────────────────────────────────

            const {
                isMcpConnected,
                enableMcpBridge,
                setEnableMcpBridge,
                setMcpRetryTrigger
            } = useMcpBridge({
                state: {
                    story: storyFor(story),
                    activeStoryId,
                    apiProvider,
                    devProvider,
                    devModel,
                    reviewProvider,
                    reviewModel,
                    proseProvider,
                    proseModel,
                    geminiModel,
                    openRouterModel,
                    nanoGptModel,
                    anthropicModel,
                    koboldModel,
                    codexModel,
                    claudeModel,
                    apiKey,
                    openRouterKey,
                    nanoGptKey,
                    anthropicKey,
                    koboldUrl,
                    codexUrl,
                    claudeUrl,
                    loading,
                    loadingStep,
                    continuousAutopilot,
                    view,
                    inputTitle,
                    inputConcept,
                    inputWritingMode,
                    promptLog,
                    feedbackLedger
                },
                actions: {
                    setApiProvider,
                    setDevProvider,
                    setDevModel,
                    setReviewProvider,
                    setReviewModel,
                    setProseProvider,
                    setProseModel,
                    setGeminiModel,
                    setOpenRouterModel,
                    setNanoGptModel,
                    setAnthropicModel,
                    setKoboldModel,
                    setCodexModel,
                    setClaudeModel,
                    setApiKey,
                    setOpenRouterKey,
                    setNanoGptKey,
                    setAnthropicKey,
                    setKoboldUrl,
                    setCodexUrl,
                    setClaudeUrl,
                    setInputTitle,
                    setInputConcept,
                    setInputAuthorNote,
                    setInputWritingMode: handOff(setInputWritingMode),
                    setActiveStoryId,
                    setStory: setStoryFor(setStory),
                    setView,
                    clearImportedLore,
                    showToast,
                    getDefaultModelForProvider,
                    initStory,
                    runContinuousAutopilotStep,
                    toggleContinuousAutopilot,
                    generateStoryArc,
                    generateActsAndSequences,
                    generateSequences,
                    generateScenes,
                    writeSceneProse
                },
                storyStore: handOff(storyStore)
            });

            const handleAutoGenerateScene = (seqIdx: CtxArgs<typeof orchestrateHandleAutoGenerateScene>[0], sceneIdx: CtxArgs<typeof orchestrateHandleAutoGenerateScene>[1], options: CtxArgs<typeof orchestrateHandleAutoGenerateScene>[2] = {}) => orchestrateHandleAutoGenerateScene(getPipelineCtx(), seqIdx, sceneIdx, options);

            const handleDirectSceneVoices = (seqIdx: CtxArgs<typeof orchestrateHandleDirectSceneVoices>[0] = selectedSequence, sceneIdx: CtxArgs<typeof orchestrateHandleDirectSceneVoices>[1] = selectedScene) => orchestrateHandleDirectSceneVoices(getPipelineCtx(), seqIdx, sceneIdx);



            const handleSelectLibraryStory = (targetItem: { id: string; data?: unknown } | null | undefined, targetView = 'dashboard') => {
                if (!targetItem) return;
                const liveInitData = (initializingStoryIdRef.current === targetItem.id && storySnapshotsByIdRef.current[targetItem.id])
                    ? storySnapshotsByIdRef.current[targetItem.id]
                    : null;
                const targetData = liveInitData || targetItem.data || {};
                if (liveInitData) {
                    skipNextIdbHydrationIdRef.current = targetItem.id;
                }
                setActiveStoryId(targetItem.id);
                setStory(handOff(prepareLibraryStorySelection(handOff(targetData), targetItem.id)));
                if (targetView === 'reader') {
                    enterReaderMode();
                } else {
                    setView(targetView);
                }
            };

            return (
                <div className={`flex h-screen overflow-hidden font-sans ${theme === 'dark' ? 'dark bg-[#141416] text-[#F5F0E8]' : 'bg-void text-ink-900'}`} data-theme={theme}>
                    <StudioSidebar
                        view={view}
                        setView={setView}
                        story={story}
                        selectedSequence={selectedSequence}
                        setSelectedSequence={setSelectedSequence}
                        selectedScene={selectedScene}
                        setSelectedScene={setSelectedScene}
                        isSidebarOpen={isSidebarOpen}
                        setIsSidebarOpen={setIsSidebarOpen}
                        isSidebarCollapsed={isSidebarCollapsed}
                        setIsSidebarCollapsed={setIsSidebarCollapsed}
                        collapsedActs={collapsedActs}
                        toggleAct={toggleAct}
                        loading={loading}
                        continuousAutopilot={continuousAutopilot}
                        isAudioAutopilotRunning={isAudioAutopilotRunning}
                        isAudioAutopilotQueued={isAudioAutopilotQueued}
                        storyAudioSummary={handOff(storyAudioSummary)}
                        refreshLibrary={refreshLibrary}
                        handleAutopilot={handleAutopilot}
                        handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                        enterReaderMode={enterReaderMode}
                        getSceneProseText={getSceneProseText}
                        getSceneAudioStatus={handOff(getSceneAudioStatus)}
                        handleExportEpub={handleExportEpub}
                        handleExportAudioDramaTxt={handleExportAudioDramaTxt}
                        handleExportMarkdown={handleExportMarkdown}
                        handleExportPdf={handleExportPdf}
                        handleImport={handleImport}
                        fileInputRef={fileInputRef}
                        hasAvailableUpdate={hasAvailableUpdate}
                        availableUpdateVersion={updateInfo?.latestVersion ?? null}
                        isCheckingUpdates={isCheckingUpdates}
                        onCheckForUpdates={() => { void checkForUpdates({ manual: true }); }}
                        onOpenUpdateModal={openUpdateModal}
                    />

                    {/* MAIN CONTENT WORKSPACE */}
                    <div className={`studio-main-workspace flex-1 flex flex-col h-full relative w-full min-w-0 max-w-full transition-all duration-300 ${view === 'reader' ? 'md:ml-0' : isSidebarCollapsed ? 'md:ml-16' : 'md:ml-72'} bg-void`}>
                        <StudioHeader
                            view={view}
                            setView={setView}
                            story={story}
                            theme={theme}
                            toggleTheme={toggleTheme}
                            setIsSidebarOpen={setIsSidebarOpen}
                            refreshLibrary={refreshLibrary}
                            loading={loading}
                            loadingStep={loadingStep}
                            continuousAutopilot={continuousAutopilot}
                            setContinuousAutopilot={setContinuousAutopilot}
                            handleAutopilot={handleAutopilot}
                            isAudioAutopilotRunning={isAudioAutopilotRunning}
                            isMcpConnected={isMcpConnected}
                            activePipelineWork={handOff(activePipelineWork)}
                            novelProgress={novelProgress}
                            audioAutopilotProgress={handOff(audioAutopilotProgress)}
                            audioProgress={audioProgress}
                            setPipelineDisplayMode={setPipelineDisplayMode}
                        />

                        <main className={`flex-1 overflow-y-auto overflow-x-hidden ${view === 'reader' ? 'p-0 overflow-hidden' : 'p-4 md:p-8'}`}>
                            <BackToTop />
                            {view === 'reader' && (
                                <ReaderView
                                    story={story}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    currentReaderSceneItem={currentReaderSceneItem}
                                    flatStoryScenes={flatStoryScenes}
                                    currentFlatSceneIndex={currentFlatSceneIndex}
                                    storyChapters={storyChapters}
                                    currentChapterIndex={currentChapterIndex}
                                    currentChapter={currentChapter}
                                    visibleScrollChapter={visibleScrollChapter}
                                    setVisibleScrollChapter={setVisibleScrollChapter}
                                    jumpToReaderChapter={handOff(jumpToReaderChapter)}
                                    goToNextReaderChapter={goToNextReaderChapter}
                                    goToPrevReaderChapter={goToPrevReaderChapter}
                                    readerSettings={handOff(readerSettings)}
                                    updateReaderSetting={handOff(updateReaderSetting)}
                                    readerPageIndex={readerPageIndex}
                                    readerPageIndexRef={readerPageIndexRef}
                                    readerTotalPages={readerTotalPages}
                                    readerContainerWidth={readerContainerWidth}
                                    readingProgress={handOff(readingProgress)}
                                    saveReadingProgress={saveReadingProgress}
                                    isReaderHudVisible={isReaderHudVisible}
                                    toggleReaderHud={toggleReaderHud}
                                    resetReaderHudTimer={resetReaderHudTimer}
                                    isTocOpen={isTocOpen}
                                    setIsTocOpen={setIsTocOpen}
                                    isAppearanceOpen={isAppearanceOpen}
                                    setIsAppearanceOpen={setIsAppearanceOpen}
                                    tocSearchQuery={tocSearchQuery}
                                    setTocSearchQuery={setTocSearchQuery}
                                    isFullscreen={isFullscreen}
                                    toggleFullscreen={toggleFullscreen}
                                    pageSlideDirection={pageSlideDirection}
                                    isSceneTransitioning={isSceneTransitioning}
                                    readerColumnsContainerRef={readerColumnsContainerRef}
                                    readerScrollContainerRef={readerScrollContainerRef}
                                    handleReaderTouchStart={handleReaderTouchStart}
                                    handleReaderTouchMove={handleReaderTouchMove}
                                    handleReaderTouchEnd={handleReaderTouchEnd}
                                    touchDragOffset={touchDragOffset}
                                    isTouchDragging={isTouchDragging}
                                    touchHasDraggedRef={touchHasDraggedRef}
                                    justTappedRef={justTappedRef}
                                    turnReaderPage={turnReaderPage}
                                    jumpToReaderScene={handOff(jumpToReaderScene)}
                                    goToNextReaderScene={goToNextReaderScene}
                                    setView={setView}
                                    ttsStatus={ttsStatus}
                                    ttsProgress={ttsProgress}
                                    ttsStatusMessage={ttsStatusMessage}
                                    ttsActiveDevice={handOff(ttsActiveDevice)}
                                    ttsError={ttsError}
                                    setTtsError={handOff(setTtsError)}
                                    startTtsFromProse={startTtsFromProse}
                                    requestChunkAudio={requestChunkAudio}
                                    setSettingsTab={setSettingsTab}
                                    ttsIsMiniPlayerVisible={ttsIsMiniPlayerVisible}
                                    setTtsIsMiniPlayerVisible={setTtsIsMiniPlayerVisible}
                                    ttsQueue={ttsQueue}
                                    ttsCurrentChunkIndex={ttsCurrentChunkIndex}
                                    ttsCurrentTime={ttsCurrentTime}
                                    ttsDuration={ttsDuration}
                                    setTtsCurrentTime={setTtsCurrentTime}
                                    toggleTtsPlayPause={toggleTtsPlayPause}
                                    stopTtsPlayback={stopTtsPlayback}
                                    skipTtsChunk={skipTtsChunk}
                                    initTtsEngine={initTtsEngine}
                                    showToast={showToast}
                                    changeTtsVoice={changeTtsVoice}
                                    scrollReaderToElement={scrollReaderToElement}
                                    visibleScrollSceneRef={visibleScrollSceneRef}
                                    isProgrammaticScrollRef={isProgrammaticScrollRef}
                                    audioDramaSettings={audioDramaSettings}
                                    updateAudioDramaSetting={updateAudioDramaSetting}
                                    audioDramaActiveSpeaker={audioDramaActiveSpeaker}
                                    audioDramaActiveEmotion={audioDramaActiveEmotion}
                                    isAudioDramaModeActive={isAudioDramaModeActive}
                                    handleDownloadSceneAudio={handleDownloadSceneAudio}
                                    isExportingSceneAudio={isExportingSceneAudio}
                                    handleDownloadSequenceAudio={handleDownloadSequenceAudio}
                                    isExportingSequenceAudio={isExportingSequenceAudio}
                                    ttsGeneratingElapsedSec={ttsGeneratingElapsedSec}
                                    availableSceneAudioMap={availableSceneAudioMap}
                                    playStoredOrLiveSceneAudio={handOff(playStoredOrLiveSceneAudio)}
                                    playSceneAudio={playSceneAudio}
                                    ttsPlayingScene={ttsPlayingScene}
                                    ttsResolvedSource={handOff(ttsResolvedSource)}
                                    isFollowingAudio={isFollowingAudio}
                                    setIsFollowingAudio={setIsFollowingAudio}
                                    returnToActiveAudio={returnToActiveAudio}
                                    returnToAudioNonce={returnToAudioNonce}
                                    skipAudioScene={skipAudioScene}
                                    getSceneAudioStatus={getSceneAudioStatus}
                                    storyAudioSummary={storyAudioSummary}
                                    isPlayingMasterSceneMp3={isPlayingMasterSceneMp3}
                                    ttsAudioRef={ttsAudioRef}
                                    isAudioAutopilotRunning={isAudioAutopilotRunning}
                                    isAudioAutopilotQueued={isAudioAutopilotQueued}
                                    handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                                    setStory={setStory}
                                    isAuditioningVoice={isAuditioningVoice}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    stopAllAudioPlayback={stopAllAudioPlayback}
                                />
                            )}

                            {view === 'setup' && (
                                <SetupView
                                    inputTitle={inputTitle}
                                    setInputTitle={setInputTitle}
                                    inputConcept={inputConcept}
                                    setInputConcept={setInputConcept}
                                    inputAuthorNote={inputAuthorNote}
                                    setInputAuthorNote={setInputAuthorNote}
                                    inputBookType={inputBookType}
                                    setInputBookType={setInputBookType}
                                    inputCustomWords={inputCustomWords}
                                    setInputCustomWords={setInputCustomWords}
                                    inputSeriesOpener={inputSeriesOpener}
                                    setInputSeriesOpener={setInputSeriesOpener}
                                    inputSeriesTitle={inputSeriesTitle}
                                    setInputSeriesTitle={setInputSeriesTitle}
                                    inputSerial={inputSerial}
                                    setInputSerial={setInputSerial}
                                    inputSerialRotation={inputSerialRotation}
                                    setInputSerialRotation={setInputSerialRotation}
                                    inputWritingMode={inputWritingMode}
                                    setInputWritingMode={handOff(setInputWritingMode)}
                                    archetypeOptions={archetypeOptions}
                                    setArchetypeOptions={setArchetypeOptions}
                                    importedLoreFiles={importedLoreFiles}
                                    importingLore={importingLore}
                                    isDraggingSetupLore={isDraggingSetupLore}
                                    setIsDraggingSetupLore={setIsDraggingSetupLore}
                                    loreInputRef={loreInputRef}
                                    handleLoreImport={handleLoreImport}
                                    handleUpdateLoreFile={handleUpdateLoreFile}
                                    handleRemoveLoreFile={handleRemoveLoreFile}
                                    clearImportedLore={clearImportedLore}
                                    loading={loading}
                                    continuousAutopilot={continuousAutopilot}
                                    initStory={handOff(initStory)}
                                    handleAutopilot={handleAutopilot}
                                />
                            )}

                            {view === 'dashboard' && (
                                <DashboardView
                                    view={view}
                                    setView={setView}
                                    story={storyFor(story)}
                                    setStory={setStoryFor(setStory)}
                                    theme={theme}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loadedImages={loadedImages}
                                    loadingCover={loadingCover}
                                    coverUploadInputRef={coverUploadInputRef}
                                    generateCoverImage={generateCoverImage}
                                    handleCoverUpload={handleCoverUpload}
                                    deleteCoverImage={deleteCoverImage}
                                    storyAudioSummary={storyAudioSummary}
                                    availableSceneAudioMap={availableSceneAudioMap}
                                    readingProgress={handOff(readingProgress)}
                                    enterReaderMode={enterReaderMode}
                                    loading={loading}
                                    loadingStep={loadingStep}
                                    initializingStoryId={initializingStoryId}
                                    continuousAutopilot={continuousAutopilot}
                                    isRunningEditorialHarness={isRunningEditorialHarness}
                                    setEditorialScopeSceneId={setEditorialScopeSceneId}
                                    runAutonomousEditorialHarness={handOff(runAutonomousEditorialHarness)}
                                    handleExportEpub={handleExportEpub}
                                    handleDownloadStoryAudio={handleDownloadStoryAudio}
                                    handleExportAudioDramaTxt={handleExportAudioDramaTxt}
                                    isExportingStoryAudio={isExportingStoryAudio}
                                    isExportingSequenceAudio={isExportingSequenceAudio}
                                    isExportingSceneAudio={isExportingSceneAudio}
                                    isAudioAutopilotRunning={isAudioAutopilotRunning}
                                    isAudioAutopilotQueued={isAudioAutopilotQueued}
                                    handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                                    handleResetStoryStage={handleResetStoryStage}
                                    initStory={handOff(initStory)}
                                    generateStoryArc={handOff(generateStoryArc)}
                                    rebuildStorySoFar={rebuildStorySoFar}
                                    startNextBook={startNextBook}
                                    epistemicViewTab={epistemicViewTab}
                                    setEpistemicViewTab={setEpistemicViewTab}
                                    epistemicScrubberCoord={epistemicScrubberCoord}
                                    setEpistemicScrubberCoord={setEpistemicScrubberCoord}
                                    epistemicFilterChar={epistemicFilterChar}
                                    setEpistemicFilterChar={setEpistemicFilterChar}
                                    epistemicSearchQuery={epistemicSearchQuery}
                                    setEpistemicSearchQuery={setEpistemicSearchQuery}
                                    setEditingPropModal={handOff(setEditingPropModal)}
                                    setEditingBeliefModal={handOff(setEditingBeliefModal)}
                                    handleDeleteProposition={handleDeleteProposition}
                                    handleInvalidateBelief={handOff(handleInvalidateBelief)}
                                    retroactivelyInjectClue={handOff(retroactivelyInjectClue)}
                                    openEditModal={openEditModal}
                                    openFormModal={handOff(openFormModal)}
                                    requestConfirm={requestConfirm}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'cast' && (
                                <CastView
                                    view={view}
                                    setView={setView}
                                    story={storyFor(story)}
                                    storyRef={storyRefFor(storyRef)}
                                    setStory={setStoryFor(setStory)}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loadedImages={loadedImages}
                                    portraitLoading={portraitLoading}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    isAuditioningVoice={isAuditioningVoice}
                                    openEditModal={openEditModal}
                                    openFormModal={handOff(openFormModal)}
                                    showToast={showToast}
                                    findCastIndexForChar={findCastIndexForChar}
                                    commitVoiceEditUpdate={handOff(commitVoiceEditUpdate)}
                                    generateCharacterPortrait={generateCharacterPortrait}
                                    uploadCharacterPortrait={uploadCharacterPortrait}
                                    removeCharacterPortrait={removeCharacterPortrait}
                                    handleRerollCharacterSeed={handleRerollCharacterSeed}
                                    handleResetCharacterReferenceText={handleResetCharacterReferenceText}
                                    testAuditionCharacterVoice={testAuditionCharacterVoice}
                                    stopAllAudioPlayback={stopAllAudioPlayback}
                                />
                            )}

                            {view === 'lore' && (
                                <LoreView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    setStory={setStoryFor(setStory)}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loreSearch={loreSearch}
                                    setLoreSearch={setLoreSearch}
                                    lorePage={lorePage}
                                    setLorePage={setLorePage}
                                    lorePageSize={LORE_PAGE_SIZE}
                                    filteredLore={filteredLore}
                                    paginatedLore={paginatedLore}
                                    totalLorePages={totalLorePages}
                                    scenesByAct={handOff(scenesByAct)}
                                    isDraggingLoreTab={isDraggingLoreTab}
                                    setIsDraggingLoreTab={setIsDraggingLoreTab}
                                    ragStatus={ragStatus}
                                    isRebuildingRag={isRebuildingRag}
                                    rebuildRagIndex={rebuildRagIndex}
                                    handlePostGenLoreImport={handlePostGenLoreImport}
                                    ingestLore={ingestLore}
                                    handleDeleteLore={handleDeleteLore}
                                    openEditModal={openEditModal}
                                    openFormModal={handOff(openFormModal)}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'relationships' && (
                                <RelationshipsView
                                    view={view}
                                    setView={setView}
                                    story={storyFor(story)}
                                    setStory={setStoryFor(setStory)}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loadedImages={loadedImages}
                                    matrixView={matrixView}
                                    setMatrixView={handOff(setMatrixView)}
                                    matrixScroll={matrixScroll}
                                    matrixScrollRef={matrixScrollRef}
                                    measureMatrixScroll={measureMatrixScroll}
                                    selectedRel={selectedRel}
                                    setSelectedRel={setSelectedRel}
                                    selectMatrixRelationship={selectMatrixRelationship}
                                    openFormModal={handOff(openFormModal)}
                                    requestConfirm={requestConfirm}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'directive' && (
                                <DirectiveView
                                    view={view}
                                    setView={setView}
                                    story={storyFor(story)}
                                    setStory={setStoryFor(setStory)}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    allNarrativeModes={allNarrativeModes}
                                    directiveInput={directiveInput}
                                    setDirectiveInput={setDirectiveInput}
                                    protectWrittenProse={protectWrittenProse}
                                    setProtectWrittenProse={setProtectWrittenProse}
                                    cascadeSceneChanges={cascadeSceneChanges}
                                    setCascadeSceneChanges={setCascadeSceneChanges}
                                    verifyDirectiveEdits={verifyDirectiveEdits}
                                    setVerifyDirectiveEdits={setVerifyDirectiveEdits}
                                    isPlanningDirective={isPlanningDirective}
                                    isExecutingDirective={isExecutingDirective}
                                    directivePlanPhase={handOff(directivePlanPhase)}
                                    directivePlan={handOff(directivePlan)}
                                    setDirectivePlan={handOff(setDirectivePlan)}
                                    directivePlanHistory={handOff(directivePlanHistory)}
                                    setDirectivePlanHistory={handOff(setDirectivePlanHistory)}
                                    directiveRefinement={directiveRefinement}
                                    setDirectiveRefinement={setDirectiveRefinement}
                                    expandedDirectiveActions={expandedDirectiveActions}
                                    setExpandedDirectiveActions={setExpandedDirectiveActions}
                                    directiveExecutionLogs={handOff(directiveExecutionLogs)}
                                    setDirectiveExecutionLogs={handOff(setDirectiveExecutionLogs)}
                                    directiveProgress={directiveProgress}
                                    directiveUndoSnapshot={handOff(directiveUndoSnapshot)}
                                    setDirectiveUndoSnapshot={setDirectiveUndoSnapshot}
                                    runDirectivePlanner={runDirectivePlanner}
                                    restorePreviousDirectivePlan={restorePreviousDirectivePlan}
                                    executeDirectivePlan={handOff(executeDirectivePlan)}
                                    handleAddManualDirectiveAction={handleAddManualDirectiveAction}
                                    handleToggleDirectiveActionSkip={handleToggleDirectiveActionSkip}
                                    handleRemoveDirectiveAction={handleRemoveDirectiveAction}
                                    handleUpdateActionField={handleUpdateActionField}
                                    handleUpdateActionDetail={handleUpdateActionDetail}
                                    handleUpdateAppliedEdit={handleUpdateAppliedEdit}
                                    handleUndoSurgicalEdit={handleUndoSurgicalEdit}
                                    handleFixDirectiveReview={handleFixDirectiveReview}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'editorial' && (
                                <EditorialView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    bannedPhrases={bannedPhrases}
                                    slopConfig={slopConfig}
                                    editorialHarnessTab={editorialHarnessTab}
                                    setEditorialHarnessTab={setEditorialHarnessTab}
                                    editorialScopeSceneId={editorialScopeSceneId}
                                    setEditorialScopeSceneId={setEditorialScopeSceneId}
                                    editorialUseDeepLLM={editorialUseDeepLLM}
                                    setEditorialUseDeepLLM={setEditorialUseDeepLLM}
                                    enableEditorialHarnessAutopilot={enableEditorialHarnessAutopilot}
                                    setEnableEditorialHarnessAutopilot={setEnableEditorialHarnessAutopilot}
                                    isRunningEditorialHarness={isRunningEditorialHarness}
                                    editorialHarnessPhase={editorialHarnessPhase}
                                    editorialHarnessProgress={editorialHarnessProgress}
                                    runAutonomousEditorialHarness={handOff(runAutonomousEditorialHarness)}
                                    revertAllHarnessTransactions={revertAllHarnessTransactions}
                                    executeSingleHarnessTransaction={executeSingleHarnessTransaction}
                                    revertHarnessTransaction={revertHarnessTransaction}
                                    novelIgnoreDraftRule={novelIgnoreDraftRule}
                                    setNovelIgnoreDraftRule={handOff(setNovelIgnoreDraftRule)}
                                    handleAddNovelIgnoreRule={handleAddNovelIgnoreRule}
                                    handleRemoveNovelIgnoreRule={handleRemoveNovelIgnoreRule}
                                    editorialToolName={editorialToolName}
                                    setEditorialToolName={setEditorialToolName}
                                    editorialToolArgs={editorialToolArgs}
                                    setEditorialToolArgs={handOff(setEditorialToolArgs)}
                                    editorialToolOutput={editorialToolOutput}
                                    handleRunHarnessInspectorTool={handleRunHarnessInspectorTool}
                                />
                            )}

                            {(view === 'structure' || view === 'sequence_dashboard' || view === 'chapter_dashboard') && (
                                <StructureView
                                    view={view}
                                    setView={setView}
                                    story={storyFor(story)}
                                    setStory={setStoryFor(setStory)}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    setSelectedSequence={setSelectedSequence}
                                    selectedScene={selectedScene}
                                    setSelectedScene={setSelectedScene}
                                    activeActTab={activeActTab}
                                    setActiveActTab={setActiveActTab}
                                    expandedSequences={expandedSequences}
                                    toggleSequence={toggleSequence}
                                    toggleAllSequencesInAct={toggleAllSequencesInAct}
                                    loading={loading}
                                    enableNarrativeLenses={enableNarrativeLenses}
                                    allNarrativeModes={allNarrativeModes}
                                    getModeIcon={getModeIcon}
                                    getSceneProseText={handOff(getSceneProseText)}
                                    getSceneAudioStatus={getSceneAudioStatus}
                                    availableSceneAudioMap={availableSceneAudioMap}
                                    availableSequenceAudioMap={availableSequenceAudioMap}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    isExportingSceneAudio={isExportingSceneAudio}
                                    isExportingSequenceAudio={isExportingSequenceAudio}
                                    isExportingStoryAudio={isExportingStoryAudio}
                                    enterReaderMode={enterReaderMode}
                                    generateActsAndSequences={handOff(generateActsAndSequences)}
                                    handleResetStoryStage={handleResetStoryStage}
                                    handleAddScene={handleAddScene}
                                    handleDeleteScene={handleDeleteScene}
                                    handleMoveScene={handleMoveScene}
                                    handleDownloadSceneAudio={handleDownloadSceneAudio}
                                    handleDownloadSequenceAudio={handleDownloadSequenceAudio}
                                    playSceneAudio={playSceneAudio}
                                    playStoredOrLiveSceneAudio={playStoredOrLiveSceneAudio}
                                    stopAllAudioPlayback={stopAllAudioPlayback}
                                    requestConfirm={requestConfirm}
                                    requestSceneWeaving={requestSceneWeaving}
                                    requestSequenceWeaving={requestSequenceWeaving}
                                    updateSceneBlueprint={updateSceneBlueprint}
                                    openEditModal={openEditModal}
                                    showToast={showToast}
                                />
                            )}

                            <WriterView
                                view={view}
                                setView={setView}
                                story={story}
                                storyRef={storyRef}
                                setStory={setStory}
                                isInspectorMode={isInspectorMode}
                                selectedSequence={selectedSequence}
                                selectedScene={selectedScene}
                                setSelectedScene={setSelectedScene}
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
                                sceneBlueprintDraft={handOff(sceneBlueprintDraft)}
                                setSceneBlueprintDraft={handOff(setSceneBlueprintDraft)}
                                isEditingProseInline={isEditingProseInline}
                                setIsEditingProseInline={setIsEditingProseInline}
                                inlineProseDraft={inlineProseDraft}
                                setInlineProseDraft={setInlineProseDraft}
                                allNarrativeModes={allNarrativeModes}
                                enableNarrativeLenses={enableNarrativeLenses}
                                setEnableNarrativeLenses={setEnableNarrativeLenses}
                                collapsedBeats={collapsedBeats}
                                toggleBeats={toggleBeats}
                                expandedBeatAnalysis={expandedBeatAnalysis}
                                toggleBeatAnalysis={toggleBeatAnalysis}
                                loading={loading}
                                loadingImages={loadingImages}
                                loadedImages={handOff(loadedImages)}
                                isExportingSceneAudio={isExportingSceneAudio}
                                isRegeneratingSceneAudio={isRegeneratingSceneAudio}
                                isDirectingVoices={isDirectingVoices}
                                isAnyAudioPlaying={isAnyAudioPlaying}
                                isRunningEditorialHarness={isRunningEditorialHarness}
                                isRunningManualSlopClean={isRunningManualSlopClean}
                                writerSlopAudit={writerSlopAudit}
                                slopAuditDrawerOpen={slopAuditDrawerOpen}
                                setSlopAuditDrawerOpen={setSlopAuditDrawerOpen}
                                slopAuditFilter={slopAuditFilter}
                                setSlopAuditFilter={setSlopAuditFilter}
                                slopAllowlistExpanded={slopAllowlistExpanded}
                                setSlopAllowlistExpanded={setSlopAllowlistExpanded}
                                getSceneAudioStatus={handOff(getSceneAudioStatus)}
                                updateSceneBlueprint={updateSceneBlueprint}
                                updateCharacterStateForScene={updateCharacterStateForScene}
                                handleAutoGenerateScene={handleAutoGenerateScene}
                                handleCascadeSceneToProse={handleCascadeSceneToProse}
                                handleDismissStaleProse={handleDismissStaleProse}
                                handleDownloadSceneAudio={handleDownloadSceneAudio}
                                handleRegenerateSceneAudio={handleRegenerateSceneAudio}
                                handleDirectSceneVoices={handleDirectSceneVoices}
                                handleAddBeat={handleAddBeat}
                                handleBeatChange={handleBeatChange}
                                handleDeleteBeat={handleDeleteBeat}
                                generateSceneImage={generateSceneImage}
                                generateBeatImage={generateBeatImage}
                                deleteSceneImage={deleteSceneImage}
                                deleteBeatImage={deleteBeatImage}
                                copyFullScene={copyFullScene}
                                enterReaderMode={enterReaderMode}
                                playSceneAudio={playSceneAudio}
                                stopAllAudioPlayback={stopAllAudioPlayback}
                                runAutonomousEditorialHarness={handOff(runAutonomousEditorialHarness)}
                                setEditorialScopeSceneId={setEditorialScopeSceneId}
                                handleRunManualSlopClean={handleRunManualSlopClean}
                                handleRewritePassage={handleRewritePassage}
                                handleAddStoryAllowlistItem={handleAddStoryAllowlistItem}
                                handleRemoveStoryAllowlistItem={handleRemoveStoryAllowlistItem}
                                openEditModal={openEditModal}
                                openCritiqueModal={openCritiqueModal}
                                showToast={showToast}
                            />

                            {view === 'logs' && (
                                <LogsView
                                    promptLog={handOff(promptLog)}
                                    setPromptLog={handOff(setPromptLog)}
                                    logFilter={logFilter}
                                    setLogFilter={setLogFilter}
                                    openLogDetailModal={openLogDetailModal}
                                    showToast={showToast}
                                    storyTitle={story?.title || "EllipsisProse Project"}
                                />
                            )}

                            <PipelineView
                                view={view}
                                setView={setView}
                                story={story}
                                setSelectedSequence={setSelectedSequence}
                                setSelectedScene={setSelectedScene}
                                setSettingsTab={setSettingsTab}
                                loading={loading}
                                loadingStep={loadingStep}
                                currentPipelineStep={currentPipelineStep}
                                inspectedStepId={handOff(inspectedStepId)}
                                setInspectedStepId={handOff(setInspectedStepId)}
                                pipelineViewMode={pipelineViewMode}
                                setPipelineViewMode={setPipelineViewMode}
                                pipelineDisplayMode={pipelineDisplayMode}
                                setPipelineDisplayMode={setPipelineDisplayMode}
                                activePipelineWork={handOff(activePipelineWork)}
                                promptLog={handOff(promptLog)}
                                continuousAutopilot={continuousAutopilot}
                                handleAutopilot={handleAutopilot}
                                toggleContinuousAutopilot={toggleContinuousAutopilot}
                                novelProgress={novelProgress}
                                audioProgress={handOff(audioProgress)}
                                isAudioAutopilotRunning={isAudioAutopilotRunning}
                                isAudioAutopilotQueued={isAudioAutopilotQueued}
                                audioAutopilotProgress={handOff(audioAutopilotProgress)}
                                handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                                isAnyAudioPlaying={isAnyAudioPlaying}
                                playSceneAudio={playSceneAudio}
                                stopAllAudioPlayback={stopAllAudioPlayback}
                                enterReaderMode={enterReaderMode}
                                openLogDetailModal={openLogDetailModal}
                                copyVerboseLogToClipboard={copyVerboseLogToClipboard}
                                showToast={showToast}
                            />

                            {view === 'inspector' && (
                                <InspectorView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    worldPrimer={worldPrimer}
                                    ragTestQuery={ragTestQuery}
                                    setRagTestQuery={setRagTestQuery}
                                    ragTestLoading={ragTestLoading}
                                    ragTestResults={handOff(ragTestResults)}
                                    handleRagTest={handleRagTest}
                                />
                            )}

                            {view === 'library' && (
                                <LibraryView
                                    activeStoryId={activeStoryId}
                                    theme={theme}
                                    libraryStories={libraryStories}
                                    libraryCovers={libraryCovers}
                                    libraryAudioCounts={libraryAudioCounts}
                                    librarySearchQuery={librarySearchQuery}
                                    setLibrarySearchQuery={setLibrarySearchQuery}
                                    initializingStoryId={initializingStoryId}
                                    setView={setView}
                                    handleImport={handleImport}
                                    handleDeleteLibraryStory={handOff(handleDeleteLibraryStory)}
                                    handleDuplicateStory={handOff(handleDuplicateStory)}
                                    handleUpdateStoryCoverStyle={handleUpdateStoryCoverStyle}
                                    onSelectStory={handleSelectLibraryStory}
                                />
                            )}

                            <SettingsView
                                view={view}
                                settingsTab={settingsTab}
                                setSettingsTab={setSettingsTab}
                                devProvider={devProvider}
                                setDevProvider={setDevProvider}
                                setApiProvider={setApiProvider}
                                devModel={devModel}
                                setDevModel={setDevModel}
                                apiKey={apiKey}
                                setApiKey={setApiKey}
                                geminiModel={geminiModel}
                                setGeminiModel={setGeminiModel}
                                openRouterKey={openRouterKey}
                                setOpenRouterKey={setOpenRouterKey}
                                openRouterModel={openRouterModel}
                                setOpenRouterModel={setOpenRouterModel}
                                openRouterMaxTokens={openRouterMaxTokens}
                                setOpenRouterMaxTokens={setOpenRouterMaxTokens}
                                nanoGptKey={nanoGptKey}
                                setNanoGptKey={setNanoGptKey}
                                nanoGptModel={nanoGptModel}
                                setNanoGptModel={setNanoGptModel}
                                anthropicKey={anthropicKey}
                                setAnthropicKey={setAnthropicKey}
                                anthropicModel={anthropicModel}
                                setAnthropicModel={setAnthropicModel}
                                koboldUrl={koboldUrl}
                                setKoboldUrl={setKoboldUrl}
                                koboldModel={koboldModel}
                                setKoboldModel={setKoboldModel}
                                koboldStatus={koboldStatus}
                                koboldError={koboldError}
                                koboldLoadedModel={koboldLoadedModel}
                                codexUrl={codexUrl}
                                setCodexUrl={setCodexUrl}
                                codexModel={codexModel}
                                setCodexModel={setCodexModel}
                                codexModelsList={codexModelsList}
                                codexStatus={codexStatus}
                                codexEmbeddingStatus={codexEmbeddingStatus}
                                refreshCodexModels={refreshCodexModels}
                                claudeUrl={claudeUrl}
                                setClaudeUrl={setClaudeUrl}
                                claudeModel={claudeModel}
                                setClaudeModel={setClaudeModel}
                                claudeModelsList={claudeModelsList}
                                claudeStatus={claudeStatus}
                                refreshClaudeModels={refreshClaudeModels}
                                showOtherApiKeys={showOtherApiKeys}
                                setShowOtherApiKeys={setShowOtherApiKeys}
                                savedModels={savedModels}
                                saveModel={saveModel}
                                deleteModel={deleteModel}
                                modelSearchQuery={modelSearchQuery}
                                setModelSearchQuery={setModelSearchQuery}
                                isSearchingModels={isSearchingModels}
                                searchResults={handOff(searchResults)}
                                isModelDropdownOpen={isModelDropdownOpen}
                                setIsModelDropdownOpen={setIsModelDropdownOpen}
                                showAdvancedModelRouting={showAdvancedModelRouting}
                                setShowAdvancedModelRouting={setShowAdvancedModelRouting}
                                getEffectiveModelConfig={getEffectiveModelConfig}
                                reviewProvider={reviewProvider}
                                setReviewProvider={setReviewProvider}
                                reviewModel={reviewModel}
                                setReviewModel={setReviewModel}
                                reviewModelSearchQuery={reviewModelSearchQuery}
                                setReviewModelSearchQuery={setReviewModelSearchQuery}
                                isSearchingReviewModels={isSearchingReviewModels}
                                reviewSearchResults={handOff(reviewSearchResults)}
                                isReviewModelDropdownOpen={isReviewModelDropdownOpen}
                                setIsReviewModelDropdownOpen={setIsReviewModelDropdownOpen}
                                proseProvider={proseProvider}
                                setProseProvider={setProseProvider}
                                proseModel={proseModel}
                                setProseModel={setProseModel}
                                proseModelSearchQuery={proseModelSearchQuery}
                                setProseModelSearchQuery={setProseModelSearchQuery}
                                isSearchingProseModels={isSearchingProseModels}
                                proseSearchResults={handOff(proseSearchResults)}
                                isProseModelDropdownOpen={isProseModelDropdownOpen}
                                setIsProseModelDropdownOpen={setIsProseModelDropdownOpen}
                                handleCatalogRefresh={handleCatalogRefresh}
                                embeddingProvider={embeddingProvider}
                                setEmbeddingProvider={setEmbeddingProvider}
                                apiTimeout={apiTimeout}
                                setApiTimeout={setApiTimeout}
                                imageProvider={imageProvider}
                                setImageProvider={setImageProvider}
                                imageModel={imageModel}
                                setImageModel={setImageModel}
                                imageApiKey={imageApiKey}
                                setImageApiKey={setImageApiKey}
                                geminiImageModelsList={geminiImageModelsList}
                                fetchGeminiImageModels={handOff(fetchGeminiImageModels)}
                                openRouterImageModelsList={openRouterImageModelsList}
                                fetchOpenRouterImageModels={fetchOpenRouterImageModels}
                                isFetchingImageModels={isFetchingImageModels}
                                comfyUrl={comfyUrl}
                                setComfyUrl={setComfyUrl}
                                comfyRefreshId={comfyRefreshId}
                                comfyStatus={comfyStatus}
                                comfyOptions={comfyOptions}
                                refreshComfyInfo={refreshComfyInfo}
                                comfyUnet={comfyUnet}
                                setComfyUnet={setComfyUnet}
                                comfyClip={comfyClip}
                                setComfyClip={setComfyClip}
                                comfyVae={comfyVae}
                                setComfyVae={setComfyVae}
                                comfyLora={comfyLora}
                                setComfyLora={setComfyLora}
                                comfySampler={comfySampler}
                                setComfySampler={setComfySampler}
                                comfyScheduler={comfyScheduler}
                                setComfyScheduler={setComfyScheduler}
                                comfyLoraStrength={comfyLoraStrength}
                                setComfyLoraStrength={setComfyLoraStrength}
                                comfySteps={comfySteps}
                                setComfySteps={setComfySteps}
                                comfyCfg={comfyCfg}
                                setComfyCfg={setComfyCfg}
                                comfyTimeoutSec={comfyTimeoutSec}
                                setComfyTimeoutSec={setComfyTimeoutSec}
                                enableMcpBridge={enableMcpBridge}
                                setEnableMcpBridge={setEnableMcpBridge}
                                isMcpConnected={isMcpConnected}
                                setMcpRetryTrigger={setMcpRetryTrigger}
                                enableReview={enableReview}
                                setEnableReview={setEnableReview}
                                enableStylePolish={enableStylePolish}
                                setEnableStylePolish={setEnableStylePolish}
                                enableAudioDramaDirectionPass={enableAudioDramaDirectionPass}
                                setEnableAudioDramaDirectionPass={setEnableAudioDramaDirectionPass}
                                enableEditorialHarnessAutopilot={enableEditorialHarnessAutopilot}
                                setEnableEditorialHarnessAutopilot={setEnableEditorialHarnessAutopilot}
                                thinkingBudgetStoryArc={thinkingBudgetStoryArc}
                                setThinkingBudgetStoryArc={setThinkingBudgetStoryArc}
                                thinkingBudgetAct={thinkingBudgetAct}
                                setThinkingBudgetAct={setThinkingBudgetAct}
                                setEnableThinkingAct={setEnableThinkingAct}
                                thinkingBudgetScene={thinkingBudgetScene}
                                setThinkingBudgetScene={setThinkingBudgetScene}
                                setEnableThinkingScene={setEnableThinkingScene}
                                thinkingBudgetWriting={thinkingBudgetWriting}
                                setThinkingBudgetWriting={setThinkingBudgetWriting}
                                setEnableThinkingWriting={setEnableThinkingWriting}
                                enableNarrativeLenses={enableNarrativeLenses}
                                setEnableNarrativeLenses={setEnableNarrativeLenses}
                                customModes={handOff(customModes)}
                                editingModeId={editingModeId}
                                newModeId={newModeId}
                                setNewModeId={setNewModeId}
                                newModeContext={newModeContext}
                                setNewModeContext={setNewModeContext}
                                newModeIcon={newModeIcon}
                                newModePrompt={newModePrompt}
                                setNewModePrompt={setNewModePrompt}
                                setIsIconPickerOpen={setIsIconPickerOpen}
                                handleStartEditCustomMode={handOff(handleStartEditCustomMode)}
                                handleDeleteCustomMode={handleDeleteCustomMode}
                                handleSaveCustomMode={handleSaveCustomMode}
                                handleCancelEditCustomMode={handleCancelEditCustomMode}
                                slopConfig={slopConfig}
                                setSlopConfig={setSlopConfig}
                                bannedPhrases={bannedPhrases}
                                slopSearchQuery={slopSearchQuery}
                                setSlopSearchQuery={setSlopSearchQuery}
                                expandedSlopGroups={expandedSlopGroups}
                                setExpandedSlopGroups={setExpandedSlopGroups}
                                expandedSlopCategories={expandedSlopCategories}
                                setExpandedSlopCategories={setExpandedSlopCategories}
                                newBannedPhraseInput={newBannedPhraseInput}
                                setNewBannedPhraseInput={setNewBannedPhraseInput}
                                newCategoryItemInputs={newCategoryItemInputs}
                                setNewCategoryItemInputs={setNewCategoryItemInputs}
                                handleSetSlopCategorySeverity={handleSetSlopCategorySeverity}
                                handleAddBannedPhrase={handleAddBannedPhrase}
                                handleAddSlopCategoryItem={handleAddSlopCategoryItem}
                                handleRemoveSlopCategoryItem={handleRemoveSlopCategoryItem}
                                handleImportSlopJson={handleImportSlopJson}
                                handleExportSlopJson={handleExportSlopJson}
                                handleResetSlopConfig={handleResetSlopConfig}
                                requestConfirm={requestConfirm}
                                story={story}
                                setStory={setStory}
                                audioDramaSettings={audioDramaSettings}
                                updateAudioDramaSetting={updateAudioDramaSetting}
                                ttsActiveDevice={handOff(ttsActiveDevice)}
                                isAuditioningVoice={isAuditioningVoice}
                                isAnyAudioPlaying={isAnyAudioPlaying}
                                stopAllAudioPlayback={stopAllAudioPlayback}
                                testAuditionCharacterVoice={testAuditionCharacterVoice}
                                handleResetAllVoiceAndAudioCaches={handleResetAllVoiceAndAudioCaches}
                                handleEditNarratorSeed={handleEditNarratorSeed}
                                handleRerollNarratorSeed={handleRerollNarratorSeed}
                                handleEditNarratorVoiceProfile={handleEditNarratorVoiceProfile}
                                handleEditNarratorReferenceText={handleEditNarratorReferenceText}
                                handleResetNarratorReferenceText={handleResetNarratorReferenceText}
                                handleEditCharacterSeed={handleEditCharacterSeed}
                                handleRerollCharacterSeed={handleRerollCharacterSeed}
                                handleEditCharacterVoiceProfile={handleEditCharacterVoiceProfile}
                                handleEditCharacterReferenceText={handleEditCharacterReferenceText}
                                handleResetCharacterReferenceText={handleResetCharacterReferenceText}
                                theme={theme}
                                setTheme={setTheme}
                                customImageStyles={customImageStyles}
                                setCustomImageStyles={setCustomImageStyles}
                                newStyleName={newStyleName}
                                setNewStyleName={setNewStyleName}
                                newStyleDesc={newStyleDesc}
                                setNewStyleDesc={setNewStyleDesc}
                                availableSceneAudioMap={availableSceneAudioMap}
                                loading={loading}
                                handleExport={handleExport}
                                handleResetStoryStage={handOff(handleResetStoryStage)}
                                handleDeleteStory={handleDeleteStory}
                                showToast={showToast}
                            />
                        </main>
                        {/* TOAST NOTIFICATION */}
                        <ToastNotification toast={handOff(toast)} theme={theme} position={view === 'reader' && ttsIsMiniPlayerVisible && !toast?.bookCard ? 'top' : 'bottom'} onDismiss={dismissToast} />
                    </div >
                    {/* GLOBAL EDIT MODAL */}
                    <EditModal
                        isOpen={editingState.isOpen}
                        title={editingState.title}
                        value={editingState.value}
                        onConfirm={handOff(editingState.onConfirm)}
                        onCancel={() => setEditingState(prev => ({ ...prev, isOpen: false }))}
                    />
                    {/* INTERVENTION MODAL */}
                    <InterventionModal
                        isOpen={interventionState.isOpen}
                        tierName={interventionState.tierName}
                        deviationReasons={handOff(interventionState.deviationReasons)}
                        rawOutput={interventionState.rawOutput}
                        onResolve={handOff(interventionState.onResolve)}
                        onCancel={() => {
                            if (interventionState.onResolve) interventionState.onResolve('abort');
                            setInterventionState(prev => ({ ...prev, isOpen: false }));
                        }}
                    />
                    {/* CRITIQUE MODAL */}
                    <CritiqueModal
                        isOpen={critiqueState.isOpen}
                        beatNumber={critiqueState.beatNumber}
                        critique={critiqueState.critique}
                        onClose={() => setCritiqueState(prev => ({ ...prev, isOpen: false }))}
                    />
                    {/* PROMPT LOG DETAIL MODAL (THINKING & RESPONSE POP-UP WINDOW) */}
                    <LogDetailModal
                        isOpen={logModalState.isOpen}
                        type={logModalState.type}
                        title={logModalState.title}
                        functionName={logModalState.functionName}
                        timestamp={logModalState.timestamp}
                        model={logModalState.model}
                        tokens={logModalState.tokens}
                        content={logModalState.content}
                        entry={logModalState.entry}
                        onClose={() => setLogModalState(prev => ({ ...prev, isOpen: false }))}
                        showToast={showToast}
                    />
                    {/* CUSTOM EDITORIAL CONFIRM MODAL */}
                    <StudioConfirmModal
                        isOpen={confirmModalState.isOpen}
                        title={confirmModalState.title}
                        message={confirmModalState.message}
                        confirmLabel={confirmModalState.confirmLabel}
                        cancelLabel={confirmModalState.cancelLabel}
                        secondaryLabel={confirmModalState.secondaryLabel}
                        danger={confirmModalState.danger}
                        warning={confirmModalState.warning}
                        onConfirm={handOff(confirmModalState.onConfirm)}
                        onSecondary={handOff(confirmModalState.onSecondary)}
                        onCancel={handOff(confirmModalState.onCancel)}
                    />
                    {/* CUSTOM EDITORIAL FORM MODAL */}
                    <StudioFormModal
                        isOpen={formModalState.isOpen}
                        title={formModalState.title}
                        subtitle={formModalState.subtitle}
                        fields={handOff(formModalState.fields)}
                        submitLabel={formModalState.submitLabel}
                        cancelLabel={formModalState.cancelLabel}
                        onSubmit={handOff(formModalState.onSubmit)}
                        onCancel={handOff(formModalState.onCancel)}
                    />
                    <GesmPropositionModal
                        editingPropModal={handOff(editingPropModal)}
                        setEditingPropModal={handOff(setEditingPropModal)}
                        handleSaveProposition={handleSaveProposition}
                    />
                    <GesmBeliefModal
                        editingBeliefModal={handOff(editingBeliefModal)}
                        setEditingBeliefModal={handOff(setEditingBeliefModal)}
                        handleSaveBelief={handleSaveBelief}
                        story={story}
                    />
                    <IconPickerModal
                        isIconPickerOpen={isIconPickerOpen}
                        setIsIconPickerOpen={setIsIconPickerOpen}
                        newModeIcon={newModeIcon}
                        setNewModeIcon={setNewModeIcon}
                    />
                    <UpdateModal
                        isOpen={isUpdateModalOpen}
                        updateInfo={updateInfo}
                        desktopState={desktopUpdaterState}
                        isApplying={isApplyingUpdate}
                        error={updateError}
                        isBusyGenerating={loading || continuousAutopilot}
                        onConfirm={() => { void confirmUpdate(); }}
                        onCancelDownload={() => { void cancelUpdateDownload(); }}
                        onSkip={() => { void skipCurrentUpdate(); }}
                        onClose={closeUpdateModal}
                        onOpenReleaseNotes={openReleaseNotes}
                    />
                </div>
            );
        }

        (async () => {
            try {
                await diskSettingsVault.hydrateBeforeMount();
            } catch (err) {
                console.warn('[DiskSettingsVault] Pre-mount hydration failed:', err);
            }
            if (typeof hydrateAllStoresFromStorage === 'function') {
                hydrateAllStoresFromStorage();
            }
            const container = document.getElementById('root');
            if (!container) throw new Error('EllipsisProse: #root element is missing from index.html');
            // Kept on window so a hot reload reuses the root instead of mounting a second one.
            const host = window as Window & { reactRoot?: ReactDOMClient.Root };
            if (!host.reactRoot) {
                host.reactRoot = ReactDOMClient.createRoot(container);
            }
            host.reactRoot.render(<EllipsisProsef />);
        })();
