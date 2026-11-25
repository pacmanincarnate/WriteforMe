import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import {
    cleanJson,
    decodeXmlEntities,
    DRAMA_SPEAKER_HUE_COUNT,
    escapeXml,
    extractAllTags,
    extractReasoningAndContent,
    extractTag,
    extractTagAttribute,
    extractTagList,
    formatAudioDramaScriptHtml,
    formatObjectToXml,
    formatReaderProse,
    getAudioDramaSpeakerClass,
    isSerializationPlaceholder,
    normalizeMarkdownIndentation,
    parseMarkdown,
    safeJsonStringify,
    safeLocalStorageSet,
    safeSessionStorageSet,
    sanitizeHtml,
    SERIALIZATION_PLACEHOLDER_REGEX,
    stripXmlTags
} from '@/utils';
import {
    ARCH_CONCEPTS,
    ARCH_GENRES,
    ARCH_STYLES,
    AVAILABLE_ICONS,
    BANNED_CHARACTER_NAMES,
    BANNED_NAMES_PROMPT_INSTRUCTION,
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_GEMINI_IMAGE_MODELS,
    DEFAULT_IMAGE_STYLES,
    DEFAULT_OPENROUTER_IMAGE_MODELS,
    DEFAULT_READER_SETTINGS,
    ELEVENLABS_VOICES,
    formatModalityHand,
    GEMINI_PREBUILT_VOICES,
    generateRandomArchetypes,
    getPipelineStepInfo,
    inferNarrativeModeForScene,
    KOKORO_VOICE_GROUPS,
    KOKORO_VOICES,
    mapLogNameToStepId,
    migrateAudioDramaSettings,
    NANO_GPT_DEFAULT_MODELS,
    NARRATIVE_MODE_ICONS,
    NARRATIVE_MODES,
    PIPELINE_STEP_SPEC,
    PIPELINE_STEPS_META,
    SILENT_WAV_DATA_URI,
    STRUCTURAL_MODALITIES,
    TTS_PIPELINE_TIERS,
    VIEW_LABELS
} from '@/config';
import {
    AUDIO_DRAMA_SURGICAL_MANDATE,
    AUDIO_DRAMA_SYNTAX_CONTRACT_CARD,
    buildWritingSystemPrompt,
    getSurgicalPromptForMode,
    PROMPTS,
    stripNarrativeLensSchemaLine,
    STRUCTURAL_EDIT_PROTOCOL,
    SURGICAL_EDIT_PROTOCOL
} from '@/prompts';
import { countWords, escapeRegExp, parseNum, readingMinutes, safeEscapeRegex, STOPWORDS, tokenMatch } from '@/utils';
import {
    actForSequence,
    AUDIO_PRODUCTION_STAGE_ORDER,
    buildCharacterArcsBlock,
    buildDirectiveActionPreview,
    buildGenreToneBlocks,
    buildGenreToneStyleBlocks,
    buildLengthMandateBlock,
    buildRelationshipFrictionBlock,
    buildSceneCountTargetBlock,
    buildStoryInfoBlock,
    calculateTargetWordCount,
    computeAudioProductionEstimate,
    computeDirectiveStoryStats,
    computeNovelProgressEstimate,
    computePacingRanges,
    computeSceneWordTarget,
    computeSequenceLengthPlan,
    computeStoryProgressMetrics,
    DIRECTIVE_ACTION_META,
    DIRECTIVE_PROSE_SAFE_ACTIONS,
    DIRECTIVE_STRUCTURAL_ACTIONS,
    ensureCharacter,
    extractCharacterBrief,
    extractRelationship,
    extractStoryProseText,
    formatAudioDuration,
    formatBytesCompact,
    formatLoreForPrompt,
    formatSceneSummary,
    getActiveClueDirectivesForScene,
    getAuthorNoteXml,
    getDirectiveActionScopeMeta,
    getRecentStoryArtifacts,
    getSecretRevealDirectiveForScene,
    insertTargetWordCount,
    isActionBlockedByProtection,
    isLegacyValenceEntry,
    LENGTH_CONTROL,
    mapAudioStageToCanonical,
    measureNovelLength,
    normalizeBeatsForScene,
    normalizeIntentionalOverrides,
    normalizeScenesForSequence,
    normalizeSceneBlueprint,
    normalizeSecretVault,
    normalizeSequences,
    normalizeStoryArcObject,
    parseActNumber,
    parseLegacyDescriptionFields,
    parseSequencesXML,
    parseStoryArcXml,
    parseStructuredGenre,
    parseStructuredStyle,
    parseStructuredTone,
    parseValueShiftInput,
    reindexStoryForSequenceDelete,
    reindexStoryForSequenceInsert,
    resolveCharacter,
    resolveDirectiveTargetLabel,
    sanitizeStoryContextForPosition,
    SEQUENCE_ACT_MAP,
    SEQUENCE_DEFAULT_FUNCTIONS,
    translateLoadingStepToHuman,
    getAdaptiveCoverTypography,
    getCoverStyleIndex,
    formatAllVerboseLogs,
    formatVerboseLogEntry
} from '@/domain/story';
import {
    analyzeAudioDramaExpressiveness,
    analyzeAudioDramaScriptFormatting,
    analyzeAudioPcmData,
    applyHighPass75Hz,
    applyRaisedCosineFades,
    bisectChunk,
    BREEZE_MASTER_GUIDANCE_SCALE,
    buildEstimatedCueTimeline,
    buildStoryAudioExportPlan,
    CANONICAL_AUDIO_DRAMA_VOCAL_TAGS,
    CANONICAL_VOCAL_EVENTS,
    checkBoundaryTruncation,
    chunkAudioDramaTurns,
    chunkNovelProseForDrama3,
    chunkProseForTts,
    classifyParentheticalTag,
    cleanCharacterNameFromVoiceProfile,
    cleanDialogueSpokenText,
    combineAdjacentNarratorScriptBlocks,
    combineAdjacentNarratorSegments,
    computeCueTextWeight,
    computeRmsDb,
    computeSceneProseHash,
    computeSceneVoiceSignatureHash,
    computeSpeakersVoiceSignatureHash,
    computeVoiceVarietyHash,
    computeWordErrorRate,
    detectMetaWordLeakage,
    DRAMA3_SCOPED_TAGS,
    drama3ToBreezeStore,
    Drama3ToBreezeVectorStore,
    encodeFloat32PcmToWavBlob,
    estimateDramaTurnSeconds,
    estimateReferenceTextSeconds,
    expandSegmentTurnsToCues,
    extractDialogueStats,
    extractPersonalizedReferenceTextFromInterview,
    extractSpokenAndTags,
    formatMissingAudioSlotsSummary,
    generatePinkNoiseRoomTone,
    getDeterministicVoiceSeed,
    getHumanReadableTtsError,
    getLiveStoryForAudio,
    setLiveStoryProviderForAudio,
    getVoiceDescriptionForCharacter,
    getVoiceReferenceTextForCharacter,
    integerToEnglishWords,
    isAudioDramaScriptText,
    isLegacyBoilerplateVoiceProfile,
    isMasterVoiceRecordMatching,
    isMetaCommentaryText,
    isUsableVocalDescription,
    isValidQwenVoiceProfile,
    isValidVoiceDesignProfile,
    isValidVoiceRefPath,
    levelSamplesToLufs,
    mapCharacterToAudioCppVoice,
    mapCharacterToElevenLabsVoice,
    mapCharacterToGeminiVoice,
    mapCharacterToKokoroVoice,
    measureIntegratedLufs,
    META_TOKENS,
    normalizeAudioDramaScript,
    normalizeAudioDramaScriptWithReport,
    normalizeAudioDramaText,
    normalizeAudioDramaTextPreservingTags,
    normalizeDirectionKey,
    NUM_WORDS_ONES,
    NUM_WORDS_TENS,
    ordinalToEnglishWords,
    parseAudioDramaScript,
    RAIN_SENTENCE,
    resolveCastMemberForSpeaker,
    resolveSequenceAudioPlan,
    resolveSpeakerVoiceIdentity,
    sanitizeVoiceReferenceText,
    splitIntoSpokenSubTurns,
    splitLongCueText,
    splitReferenceTextIntoSentences,
    splitSpokenTextIntoTtsSubchunks,
    stripProseToPlainText,
    studioTargetF0Band,
    synthesizeQwenVoiceDesignProfile,
    synthesizeVoiceDesignProfile,
    verifyChunkQuality,
    VOCAL_EVENT_SYNONYMS,
    VOICE_REFERENCE_MIN_SECONDS,
    VOICE_REFERENCE_TARGET_MAX_SECONDS
} from '@/domain/audio';
import {
    _parseSurgicalEditXmlBlocks,
    applyParsedEdits,
    applyStructuralEdits,
    applySurgicalEditsDetailed,
    applyVoiceDirectorSurgicalEdits,
    computeChangeRatio,
    locateNeedle,
    SURGICAL_MAX_CHANGE_RATIO
} from '@/domain/editing';
import {
    buildUploadLoreChunks,
    chunkLoreText,
    computeLoreFingerprint,
    cosineSimilarity,
    deriveLoreTitle,
    deriveSectionTitle,
    deriveSemanticChunkTopic,
    expandQueryLocally,
    extractLeadingHeading,
    GraphManager,
    migrateLoreTitles,
    normalizeLoreRelations,
    partitionLoreIntoSemanticSections,
    splitParagraphIntoSentenceChunks,
    splitTextIntoBoundaryAwareChunks,
    STOP_WORDS
} from '@/domain/lore';
import {
    analyzeProseQuality,
    computeRollingDialogueStatus,
    ensureActOutputCompleteness,
    ensureSequenceOutputCompleteness,
    ensureStoryArcOutputCompleteness,
    extractReviewStatus,
    findFlatValueShiftScenes,
    findTrivialMRUBeats,
    getDynamicBannedPhrases,
    parseIssuesFromReview,
    parseValenceState,
    parseWritingOutput,
    validatePromptCacheOrder,
    validateStructuralOutput,
    surgicallyRepairBeatMRUs,
    surgicallyRepairValueShifts
} from '@/domain/validation';
import {
    archiveRevealedSecretBeliefs,
    buildScenePlannerContinuityBlock,
    buildSequencePromptContext,
    buildUpcomingBoundaryGuardInfo,
    cascadeInvalidateSourceAgent,
    commitEpistemicSceneDeltas,
    compareSceneCoordinates,
    compileActiveState,
    compileEpistemicAsymmetryAndIrony,
    ensureEpistemicGraph,
    ensureEpistemicGraphAccessors,
    extractProseTextTail,
    findIntersectingBeliefsForConsolidation,
    formatArchivistBlueprintContext,
    formatChoreographedBeatHistory,
    formatContinuityLedgerForPrompt,
    formatSceneCharactersList,
    formatSceneCoord,
    formatSequenceCastProfiles,
    getContinuityContext,
    getSequenceScenesList,
    ingestSceneContinuityData,
    initEpistemicGraph,
    initKnowledgeGraph,
    isBeliefActiveAt,
    isFactKnownAt,
    logSemanticEvent,
    normalizeEntityId,
    normalizeEpistemicPropositionsMap,
    parseSceneCoordinates,
    projectFocalizedSubgraph,
    querySemanticEventLog,
    resolveEntityDisplayName,
    resolvePropositionMatch,
    rollbackEpistemicStateForScene,
    runContinuityAuditor,
    runEpistemicSleepCycle,
    updateKnowledgeGraph
} from '@/domain/continuity';
import {
    buildRolledBackStoryState,
    cleanPreservedCastMember,
    cleanRelationshipsForRollback,
    cleanScenesForProseRollback,
    isGeneratedCastMemberForStage,
    isPreservedPreWritingLoreItem,
    migrateStoryToSequences,
    rebuildBaselineCharacterStates,
    resetSecretVaultForRollback,
    restorePreservedLoreItem,
    STORY_RESET_STAGES
} from '@/domain/lifecycle';
import {
    applyManuscriptPatchToScene,
    buildDeterministicSurgicalRepair,
    compileAestheticConstitution,
    compileGateFailureFeedback,
    compileNarrativeStateGraph,
    compileThreeWaveEditPlan,
    computeCharacter8DVoiceVector,
    computeEbbinghausMemoryDecay,
    computeVoiceDriftDistance,
    conveneAdversarialTribunal,
    createHarnessInspectionTools,
    denormalizeSceneFromXml,
    escapeHarnessXml,
    evaluateSceneLayer0AndDivergence,
    extractAuthorVoiceDNA,
    extractEditorialPatchPayload,
    getDraftedStoryScenesList,
    HARNESS_FILTER_VERBS,
    HARNESS_FORBIDDEN_SLOP_LEXICON,
    HARNESS_SOMATIC_PATTERNS,
    hasBalancedQuotes,
    inferSpeakerForSentence,
    normalizePreservingNewlines,
    normalizeSceneToXml,
    runAutonomousInvestigationStage,
    runFourGateVerificationSuite,
    runFullManuscriptNlpTelemetry,
    runSceneNlpTelemetry,
    splitProseIntoSentences
} from '@/domain/editorial';
import { fetchWithTimeout } from '@/services/http';
import {
    copyVerboseLogToClipboard,
    downloadBlob,
    downloadVerboseLogFile,
    ensureCoverFontsLoaded,
    getBestTtsDevice,
    getDeviceCapabilityTier,
    isMobileDevice
} from '@/services/browser';
import {
    convertHtmlToMarkdown,
    ensureJSZip,
    ensureLameJs,
    ensureMammoth,
    ensurePdfJs,
    extractDocumentText,
    extractTextFromCsv,
    extractTextFromDocx,
    extractTextFromEpub,
    extractTextFromFile,
    extractTextFromJson,
    extractTextFromPdf,
    extractTextFromPlainText,
    yieldToMain
} from '@/services/documents';
import {
    audioStore,
    AudioStore,
    DISK_SETTINGS_API_KEY_NAMES,
    DISK_SETTINGS_EXCLUDED_KEYS,
    diskSettingsVault,
    imageStore,
    ImageStore,
    isLocalStorageVaultAvailable,
    isPersistableSettingsKey,
    isQuotaExceededIdbError,
    isRecoverableIdbConnectionError,
    logStore,
    LogStore,
    ResilientIdbStore,
    storyStore,
    StoryStore,
    studioCacheStore,
    StudioCacheStore,
    toAsciiHeaderJson
} from '@/services/storage';
import { EmbeddingService, VectorStore } from '@/services/rag';
import {
    callAgenticLoop,
    callGemini,
    callKoboldCPP,
    callNanoGPT,
    callOpenRouter,
    checkKoboldCPPStatus,
    clearOpenRouterRoutingState,
    computeOpenRouterSmartRoutingProfile,
    executeLocalTool,
    fetchNanoGPTModels,
    fetchOpenRouterModels,
    filterModelsClientSide,
    formatOpenAITools,
    getOpenRouterModelLimits,
    getOpenRouterSmartRouting,
    isCloudModelName,
    OPENROUTER_PREFERRED_MIN_THROUGHPUT,
    parseNanoGPTModelMetadata,
    searchNanoGPTModels,
    supportsExplicitOpenRouterCacheControl,
    WRITING_AGENT_TOOLS
} from '@/services/llm';
import {
    _rawSynthesizeAudioDramaChunk,
    activateAudioCppWave,
    base64AudioToBlob,
    blobToBase64,
    buildDrama3Payload,
    buildWave2ActivateBody,
    cleanAndTrimAudioBuffer,
    clearKokoroModelCache,
    createKokoroWorker,
    decodeAudioBlobToSamples,
    decodeWavBlobDirect,
    encodeAudioBufferToWavBlob,
    encodeFloat32PcmToMp3Blob,
    enqueueAudioCppTask,
    ensureAudioDramaVoicesRegistered,
    ensureMp3AudioBlob,
    ensureSpeakerMasterVoice,
    exportSceneAudioMp3,
    exportSequenceAudioMp3,
    getCachedSpeakerMasterVoice,
    hashLiveSegmentSig as _hashLiveSegmentSig,
    isAudioCppQueueBusy,
    liveAudioCppWaveState as _liveAudioCppWaveState,
    resolveSpeakersMasterMap,
    runStudioRenderJob,
    sanitizeAudioBlob,
    stitchAndEncodeChunksToMp3,
    stitchAudioBlobsToMp3,
    stitchAudioBlobsWithPause,
    StudioPipeline,
    synthesizeAudioDramaChunk,
    synthesizeDrama3SegmentChunk,
    toDrama3HttpBody,
    trimTrailingAudioStatic
} from '@/services/audio';
import { findCastIndexForChar, useAudioProduction, useCustomNarrativeModes, useDebounce, useDirectivePlanEditors, useEpistemicEditors, useLogDetailModal, useMcpBridge, useModelCatalog, useNovelIgnoreRules, useOutlineExpansion, useReaderController, useSlopConfig, useStoryEditors, useStoryImages, useStoryLibrary, useStoryReset, useStoryTransfer, useTtsPlayback, useVoiceManagement } from '@/hooks';
import {
    distillLore as orchestrateDistillLore,
    ingestLore as orchestrateIngestLore,
    ingestLoreBatch as orchestrateIngestLoreBatch,
    rebuildRagIndex as orchestrateRebuildRagIndex,
    triggerLoreExtraction as orchestrateTriggerLoreExtraction,
    handleWorldUpdates as orchestrateHandleWorldUpdates,
    checkAndExecuteRSI as orchestrateCheckAndExecuteRSI,
    retroactivelyInjectClue as orchestrateRetroactivelyInjectClue,
    repairBannedEntitiesWithAI as orchestrateRepairBannedEntitiesWithAI,
    runArchivistForScene as orchestrateRunArchivistForScene,
    generateCharacterProfile as orchestrateGenerateCharacterProfile,
    getCharacterDetails as orchestrateGetCharacterDetails,
    retryFailedSurgicalEdits as orchestrateRetryFailedSurgicalEdits,
    applySurgicalEditsWithRetry as orchestrateApplySurgicalEditsWithRetry,
    runAgentWithEscalation as orchestrateRunAgentWithEscalation,
    updateStorySoFar as orchestrateUpdateStorySoFar,
    createStoryEntityFromSetup as orchestrateCreateStoryEntityFromSetup,
    initStory as orchestrateInitStory,
    generateStoryArc as orchestrateGenerateStoryArc,
    generateActsAndSequences as orchestrateGenerateActsAndSequences,
    generateSequences as orchestrateGenerateSequences,
    generateScenes as orchestrateGenerateScenes,
    applySurgicalProsePatch as orchestrateApplySurgicalProsePatch,
    handleRunManualSlopClean as orchestrateHandleRunManualSlopClean,
    handleCascadeSceneToProse as orchestrateHandleCascadeSceneToProse,
    runAudioDramaVoiceDirectorPass as orchestrateRunAudioDramaVoiceDirectorPass,
    writeSceneProse as orchestrateWriteSceneProse,
    handleAutoGenerateScene as orchestrateHandleAutoGenerateScene,
    handleDirectSceneVoices as orchestrateHandleDirectSceneVoices,
    verifyAndArchiveDirectiveScene as orchestrateVerifyAndArchiveDirectiveScene,
    reviewDirectiveConsistency as orchestrateReviewDirectiveConsistency,
    handleFixDirectiveReview as orchestrateHandleFixDirectiveReview,
    runDirectivePlanner as orchestrateRunDirectivePlanner,
    executeDirectivePlan as orchestrateExecuteDirectivePlan,
    runAutonomousEditorialHarness as orchestrateRunAutonomousEditorialHarness,
    executeSingleHarnessTransaction as orchestrateExecuteSingleHarnessTransaction,
    revertHarnessTransaction as orchestrateRevertHarnessTransaction,
    revertAllHarnessTransactions as orchestrateRevertAllHarnessTransactions,
    handleAutopilot as orchestrateHandleAutopilot,
    runContinuousAutopilotStep as orchestrateRunContinuousAutopilotStep
} from '@/pipeline';
import {
    Icon,
    Book,
    Layers,
    Film,
    Feather,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Save,
    RefreshCw,
    Edit3,
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    XCircle,
    AlertOctagon,
    FileText,
    Settings,
    AlertCircle,
    Menu,
    X,
    Users,
    User,
    Target,
    Brain,
    Globe,
    PenTool,
    GitBranch,
    Workflow,
    Clock,
    Terminal,
    ShieldCheck,
    Zap,
    Trash2,
    Download,
    Upload,
    Activity,
    History,
    Play,
    Pause,
    Headphones,
    Mic,
    Volume2,
    VolumeX,
    Radio,
    SkipBack,
    SkipForward,
    Cpu,
    Loader2,
    Square,
    Copy,
    MessageSquare,
    Eye,
    CheckCircle2,
    Sliders,
    Minus,
    Scroll,
    Search,
    Plus,
    Heart,
    AlertTriangle,
    RotateCcw,
    RotateCw,
    CheckCircle,
    Wand2,
    Image,
    BookOpen,
    Library,
    Bookmark,
    Paintbrush,
    Sun,
    Moon,
    ChevronLeft,
    Type,
    List,
    Maximize2,
    Minimize2,
    AlignLeft,
    AlignJustify,
    Check,
    SlidersHorizontal,
    MoreHorizontal,
    ListPlus,
    Compass,
    Shuffle,
    Anchor,
    MapPin,
    TrendingUp,
    LogOut,
    Lock,
    Key,
    EyeOff,
    Unlock,
    Shield,
    Share2,
    GitCommit,
    Scale,
    Gavel,
    Microscope,
    Fingerprint,
    GitMerge,
    CheckSquare,
    EditButton,
    LoreFileCard,
    BufferedTextarea,
    LoreCard,
    SceneRow,
    CharacterCard,
    HumanStructuredValue,
    EditModal,
    StudioConfirmModal,
    StudioFormModal,
    LiveCreationIsland,
    EditorialSubNav,
    StoryResetDropdown,
    InterventionModal,
    CritiqueModal,
    LogDetailModal,
    UniversalModelSearch,
    AUDIO_DRAMA_RIPPLE_RADII,
    BookCoverAudioArt,
    AudioDramaRipples,
    StylizedBlankCover,
    ToastNotification,
    PIPELINE_STEPS,
    StudioSidebar,
    StudioHeader,
    GesmPropositionModal,
    GesmBeliefModal,
    IconPickerModal
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
    measureReaderPages,
    PipelineView,
    ReaderView,
    RelationshipsView,
    SettingsView,
    SetupView,
    StructureView,
    WriterView
} from '@/views';

const ReactDOM = ReactDOMClient;
        const { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } = React;


        // --- 1. API CONFIGURATION ---
        // API Key is now managed via UI/LocalStorage in the component





        function EllipsisProsef() {
            const [activeStoryId, setActiveStoryId] = useState(() => localStorage.getItem("ellipsisprose_active_story_id") || "story_default");

            const [story, setStoryRaw] = useState(() => createDefaultStoryTemplate(activeStoryId));
            const storyRef = useRef(story);
            // storyRef is written ONLY by setStory below (and the few handlers that pre-seed it before calling
            // setStory). Do NOT re-sync it from `story` during render: Zustand store updates re-render this
            // component synchronously (useSyncExternalStore) BEFORE a pending setStoryRaw has been applied, so a
            // render-time `storyRef.current = story` rolls the ref back one update and the next functional
            // setStory(prev => ...) silently drops it (observed: freshly written scene prose discarded).
            const setStory = useCallback((updaterOrValue) => {
                const prev = storyRef.current;
                const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
                storyRef.current = next;
                setStoryRaw(next);
                return next;
            }, []);
            const hasHydratedStory = useRef(false);
            const skipNextIdbHydrationIdRef = useRef(null);
            const [initializingStoryId, setInitializingStoryId] = useState(null);
            const initializingStoryIdRef = useRef(null);
            const storySnapshotsByIdRef = useRef({});
            const pendingSetupLoreRef = useRef({});
            const deletedStoryIdsRef = useRef(new Set());

            // ImageStore initialized inside useStoryImages below
            window.createDefaultStoryTemplate = createDefaultStoryTemplate;
            window.hasHydratedStory = hasHydratedStory;
            window.storyRef = storyRef;
            setLiveStoryProviderForAudio(() => storyRef.current);
            window.setStory = setStory;

            // Inspector Mode State (Toggled in Sidebar Footer)
            const isInspectorMode = useUiStore(s => s.isInspectorMode);
            const toggleInspectorMode = useUiStore(s => s.toggleInspectorMode);
            window.isInspectorMode = isInspectorMode;

            // Custom Editorial Dialog States (replacing window.confirm and window.prompt)
            const confirmModalState = useUiStore(s => s.confirmModalState);
            const requestConfirm = useUiStore(s => s.requestConfirm);
            window.requestConfirm = requestConfirm;

            const formModalState = useUiStore(s => s.formModalState);
            const openFormModal = useUiStore(s => s.openFormModal);

            const [toast, setToast] = useState(null);
            const toastTimerRef = useRef(null);
            const showToast = useCallback((message, type = 'success', options = null) => {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                const toastId = Date.now();
                const opts = (options && typeof options === 'object') ? options : {};
                setToast({ id: toastId, message, type, ...opts });
                const durationMs = typeof opts.durationMs === 'number'
                    ? opts.durationMs
                    : (opts.bookCard ? 14000 : (type === 'error' ? 5000 : 3500));
                if (durationMs > 0) {
                    toastTimerRef.current = setTimeout(() => {
                        setToast(prev => (prev && prev.id === toastId ? null : prev));
                    }, durationMs);
                }
            }, []);

            const [selectedAct, setSelectedAct] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_selectedAct");
                return saved !== null ? parseInt(saved, 10) : null;
            });
            const [selectedSequence, setSelectedSequence] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_selectedSequence") || localStorage.getItem("ellipsisprose_selectedChapter");
                return saved !== null ? parseInt(saved, 10) : null;
            });
            const [selectedScene, setSelectedScene] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_selectedScene");
                return saved !== null ? parseInt(saved, 10) : null;
            });

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
            window.logAudioDramaPipelineStageStart = logAudioDramaPipelineStageStart;
            window.logAudioDramaPipelineStageComplete = logAudioDramaPipelineStageComplete;
            window.logAudioDramaPipelineStageError = logAudioDramaPipelineStageError;
            window.logPipelineValidation = logPipelineValidation;
            window.logPipelineError = logPipelineError;
            window.openFormModal = openFormModal;

            // Declared before useStoryLibrary, which reads it.
            const [view, setViewRaw] = useState(() => localStorage.getItem("ellipsisprose_view") || 'setup');
            const viewRef = useRef(view);
            const setView = useCallback((nextView) => {
                const resolved = typeof nextView === 'function' ? nextView(viewRef.current) : nextView;
                viewRef.current = resolved;
                setViewRaw(resolved);
            }, []);
            useEffect(() => {
                viewRef.current = view;
            }, [view]);
            window.setView = setView;
            // Views where autonomous background generation must NEVER pull the user away
            const isAutopilotProtectedView = (v = viewRef.current) => v === 'reader' || v === 'pipeline';
            window.isAutopilotProtectedView = isAutopilotProtectedView;

            // Story Library (Phase 6E-3): list, covers, preferences and duplicate / delete / cover-style actions.
            const {
                libraryStories, setLibraryStories,
                libraryCovers, setLibraryCovers,
                libraryAudioCounts,
                librarySearchQuery, setLibrarySearchQuery,
                libraryViewMode, setLibraryViewMode,
                librarySortBy, setLibrarySortBy,
                refreshLibrary,
                handleUpdateStoryCoverStyle,
                handleDuplicateStory,
                handleDeleteLibraryStory
            } = useStoryLibrary({
                getActiveStory: () => storyRef.current || story,
                setStory, activeStoryId, setActiveStoryId, view, deletedStoryIdsRef, showToast, requestConfirm
            });

            // Sync activeStoryId to localStorage
            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_active_story_id", activeStoryId);
            }, [activeStoryId]);

            // Load active story from IndexedDB on startup and when activeStoryId changes
            useEffect(() => {
                let isMounted = true;
                let loreSyncTimer = null;
                if (skipNextIdbHydrationIdRef.current && skipNextIdbHydrationIdRef.current === activeStoryId) {
                    skipNextIdbHydrationIdRef.current = null;
                    isInitialMount.current = false;
                    hasHydratedStory.current = true;
                    return () => {
                        isMounted = false;
                        clearTimeout(loreSyncTimer);
                    };
                }
                hasHydratedStory.current = false;
                const loadActiveStory = async () => {
                    if (!activeStoryId) {
                        // In new story setup mode; keep fresh default template without loading old stories
                        return;
                    }
                    try {
                        const wasInitialMount = isInitialMount.current;
                        let resolvedId = activeStoryId;
                        let idbStory = await storyStore.loadStory(activeStoryId);
                        if (!isMounted) return;

                        if (wasInitialMount && (!idbStory || computeStoryProgressMetrics(idbStory).score === 0)) {
                            const allStories = await storyStore.listStories();
                            if (!isMounted) return;
                            const nonEmptyStories = allStories
                                .filter(s => s.id !== 'current_story' && s.data && computeStoryProgressMetrics(s.data).score > 0)
                                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                            if (nonEmptyStories.length > 0) {
                                const recovered = nonEmptyStories[0];
                                resolvedId = recovered.id;
                                idbStory = recovered.data;
                                if (resolvedId !== activeStoryId) {
                                    skipNextIdbHydrationIdRef.current = resolvedId;
                                    setActiveStoryId(resolvedId);
                                }
                                console.log(`[StoryStore] Recovered non-empty story '${resolvedId}' on startup instead of blank '${activeStoryId}'.`);
                            }
                        }

                        if (idbStory) {
                            isInitialMount.current = false;
                            const migrated = migrateStoryToSequences(idbStory);
                            if (migrated && migrated.scenes) {
                                Object.keys(migrated.scenes).forEach(seqKey => {
                                    if (Array.isArray(migrated.scenes[seqKey])) {
                                        migrated.scenes[seqKey].forEach(scene => {
                                            if (scene.valence === undefined) {
                                                scene.valence = parseInt(scene.end_valence, 10) || 0;
                                            }
                                            if (!scene.dominant_narrative_mode || scene.dominant_narrative_mode === "BASELINE_NEUTRAL") {
                                                const inferred = inferNarrativeModeForScene(scene);
                                                if (inferred && inferred !== "BASELINE_NEUTRAL") {
                                                    scene.dominant_narrative_mode = inferred;
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                            setStory({
                                relationships: {},
                                graph_edges: [],
                                ...migrated,
                                world_primer: idbStory.world_primer || migrated?.world_primer || null,
                                continuity_ledger: Array.isArray(migrated?.continuity_ledger) ? migrated.continuity_ledger : [],
                                secret_vault: Array.isArray(migrated?.secret_vault) ? migrated.secret_vault : [],
                                epistemic_graph: ensureEpistemicGraph(migrated),
                                id: resolvedId
                            });
                            setWorldPrimer(idbStory.world_primer || migrated?.world_primer || null);
                            hasHydratedStory.current = true;
                            console.log(`Loaded active story '${resolvedId}' from storage.`);

                            // Defer lore indexing until hydration has returned and the story can render.
                            if (migrated && Array.isArray(migrated.lore) && vectorStore.current) {
                                loreSyncTimer = setTimeout(async () => {
                                    if (!isMounted) return;
                                    try {
                                        const service = embeddingService.current;
                                        const fingerprint = computeLoreFingerprint(resolvedId, migrated.lore, service?.getProviderLabel());
                                        if (fingerprint === localStorage.getItem('ellipsisprose_rag_fingerprint')) {
                                            console.info(`[RAG] index up to date for story ${resolvedId}`);
                                        } else if (!service?.isConfigured()) {
                                            console.info('[RAG] skipping lore index: no embedding credentials configured');
                                        } else {
                                            await ingestLoreBatch(migrated.lore, {
                                                clearExisting: true,
                                                deduplicate: false,
                                                storyId: resolvedId,
                                                isCurrent: () => isMounted,
                                                status: 'indexing',
                                                throwOnError: true
                                            });
                                        }
                                    } catch (loreSyncErr) {
                                        console.warn('[RAG] lore sync stopped:', loreSyncErr);
                                    }
                                }, 0);
                            }

                            if (view === 'library') {
                                refreshLibrary();
                            }
                        } else if (wasInitialMount) {
                            // Only perform fallback on initial app load if the saved ID doesn't exist
                            isInitialMount.current = false;
                            const allStories = await storyStore.listStories();
                            if (!isMounted) return;
                            const validStories = allStories.filter(s => s.id !== 'current_story');
                            if (validStories.length > 0) {
                                const nonEmpty = validStories.filter(s => s.data && computeStoryProgressMetrics(s.data).score > 0);
                                const pool = nonEmpty.length > 0 ? nonEmpty : validStories;
                                const mostRecent = pool.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                                const migrated = migrateStoryToSequences(mostRecent.data);
                                skipNextIdbHydrationIdRef.current = mostRecent.id;
                                setActiveStoryId(mostRecent.id);
                                setStory({
                                    relationships: {},
                                    graph_edges: [],
                                    ...migrated,
                                    world_primer: mostRecent.data?.world_primer || migrated?.world_primer || null,
                                    continuity_ledger: Array.isArray(migrated?.continuity_ledger) ? migrated.continuity_ledger : [],
                                    secret_vault: Array.isArray(migrated?.secret_vault) ? migrated.secret_vault : [],
                                    epistemic_graph: ensureEpistemicGraph(mostRecent.data || migrated),
                                    id: mostRecent.id
                                });
                                setWorldPrimer(mostRecent.data?.world_primer || migrated?.world_primer || null);
                                hasHydratedStory.current = true;
                            } else {
                                const defaultStory = createDefaultStoryTemplate('story_default');
                                await storyStore.saveStory('story_default', defaultStory);
                                setActiveStoryId('story_default');
                                setStory(defaultStory);
                                setWorldPrimer(null);
                                hasHydratedStory.current = true;
                                setView('setup');
                            }

                            if (view === 'library') {
                                refreshLibrary();
                            }
                        }
                    } catch (e) {
                        console.error("Failed to load active story from storage:", e);
                    }
                };
                loadActiveStory();
                return () => {
                    isMounted = false;
                    clearTimeout(loreSyncTimer);
                };
            }, [activeStoryId]);
            const callAIRef = useRef(async (..._args) => '');
            const llmKeysRef = useRef({ apiKey: '', openRouterKey: '' });
            const {
                imageStore,
                imageProvider, setImageProvider,
                imageModel, setImageModel,
                geminiImageModelsList, setGeminiImageModelsList,
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

            const isInitialMount = useRef(true);


            // Settings & Model Catalog Hook
            const [isDirectingVoices, setIsDirectingVoices] = useState(false);

            const {
                enableReview, setEnableReview,
                enableStylePolish, setEnableStylePolish,
                enableAudioDramaDirectionPass, setEnableAudioDramaDirectionPass,
                apiProvider, setApiProvider,
                embeddingProvider, setEmbeddingProvider,
                apiKey, setApiKey,
                apiTimeout, setApiTimeout,
                geminiModel, setGeminiModel,
                geminiModelsList,
                openRouterKey, setOpenRouterKey,
                openRouterModel, setOpenRouterModel,
                openRouterMaxTokens, setOpenRouterMaxTokens,
                nanoGptKey, setNanoGptKey,
                nanoGptModel, setNanoGptModel,
                koboldUrl, setKoboldUrl,
                koboldModel, setKoboldModel,
                codexUrl, setCodexUrl,
                codexModel, setCodexModel,
                codexModelsList,
                codexStatus,
                codexEmbeddingStatus,
                savedModels,
                openRouterModelsList,
                nanoGptModelsList,
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
                searchResults, setSearchResults,
                isModelDropdownOpen, setIsModelDropdownOpen,
                reviewModelSearchQuery, setReviewModelSearchQuery,
                isSearchingReviewModels,
                reviewSearchResults, setReviewSearchResults,
                isReviewModelDropdownOpen, setIsReviewModelDropdownOpen,
                proseModelSearchQuery, setProseModelSearchQuery,
                isSearchingProseModels,
                proseSearchResults, setProseSearchResults,
                isProseModelDropdownOpen, setIsProseModelDropdownOpen,
                useProseModel, setUseProseModel,
                geminiProseModel, setGeminiProseModel,
                openRouterProseModel, setOpenRouterProseModel,
                nanoGptProseModel, setNanoGptProseModel,
                koboldProseModel, setKoboldProseModel,
                codexProseModel, setCodexProseModel,
                enableThinkingAct, setEnableThinkingAct,
                enableThinkingScene, setEnableThinkingScene,
                enableThinkingWriting, setEnableThinkingWriting,
                thinkingBudgetStoryArc, setThinkingBudgetStoryArc,
                thinkingBudgetAct, setThinkingBudgetAct,
                thinkingBudgetScene, setThinkingBudgetScene,
                thinkingBudgetWriting, setThinkingBudgetWriting,
                getModelSettingsSnapshot,
                getDefaultModelForProvider,
                sanitizeLocalKoboldModel,
                getEffectiveModelConfig,
                saveModel,
                deleteModel,
                fetchGeminiModels,
                fetchGeminiImageModels,
                refreshOpenRouterModels,
                refreshNanoGptModels,
                checkKoboldStatus,
                refreshCodexModels,
                refreshComfyInfo,
                handleCatalogRefresh,
                callAI
            } = useModelCatalog({
                view,
                story,
                storyRef,
                setCurrentPipelineStep,
                setPromptLog,
                showToast,
                logPipelineDelay,
                imageProvider,
                imageApiKey,
                geminiImageModelsList,
                setGeminiImageModelsList,
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
            const [failedReviewCritiques, setFailedReviewCritiques] = useState([]);

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

            // Master Toggle for Narrative Lenses (defaults to true so narrative styles actively shape scene drafting)
            const [enableNarrativeLenses, setEnableNarrativeLenses] = useState(() => {
                const v2 = localStorage.getItem("ellipsisprose_enable_narrative_lenses_v2");
                if (v2 !== null) return v2 === "true";
                return true;
            });


            // AI Slop & Naming configuration (Phase 6E-3): state, persistence and editor handlers.
            const {
                bannedPhrases, setBannedPhrases,
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
            const [slopAuditDrawerOpen, setSlopAuditDrawerOpen] = useState(false);
            const [slopAuditFilter, setSlopAuditFilter] = useState('all'); // 'all' | 'hard' | 'flag' | 'closer' | 'rhetoric'
            const [isRunningManualSlopClean, setIsRunningManualSlopClean] = useState(false);
            const [slopAllowlistExpanded, setSlopAllowlistExpanded] = useState(false);

            // Selected relationship for editing
            const [selectedRel, setSelectedRel] = useState(null);
            const [matrixView, setMatrixView] = useState(() => {
                try {
                    const saved = localStorage.getItem('ellipsisprose_matrix_view');
                    if (saved === 'grid' || saved === 'list') return saved;
                } catch { /* Use the viewport default when storage is unavailable. */ }
                return window.matchMedia('(max-width: 767px)').matches ? 'list' : 'grid';
            });
            const [matrixScroll, setMatrixScroll] = useState({ left: false, right: false });
            const matrixScrollRef = useRef(null);
            const measureMatrixScroll = () => {
                const el = matrixScrollRef.current;
                const overflow = !!el && el.scrollWidth > el.clientWidth + 1;
                const left = overflow && el.scrollLeft > 1;
                const right = overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
                setMatrixScroll(prev => prev.left === left && prev.right === right ? prev : { left, right });
            };
            const selectMatrixRelationship = (fromChar, toChar) => {
                const relKey = `${fromChar.name}->${toChar.name}`;
                const rel = story.relationships?.[relKey];
                setSelectedRel({
                    from: fromChar.name,
                    to: toChar.name,
                    key: relKey,
                    current: rel?.current || "",
                    hidden_tension: rel?.hidden_tension || "",
                    trust_level: parseInt(rel?.trust_level, 10) || 5,
                    history: rel?.history || []
                });
            };

            // Directive Agent State
            const [directiveInput, setDirectiveInput] = useState("");
            const [directivePlan, setDirectivePlan] = useState(null);
            const [isPlanningDirective, setIsPlanningDirective] = useState(false);
            const [directivePlanPhase, setDirectivePlanPhase] = useState(null);
            const [directiveUndoSnapshot, setDirectiveUndoSnapshot] = useState(null);
            const [isExecutingDirective, setIsExecutingDirective] = useState(false);
            const [directiveExecutionLogs, setDirectiveExecutionLogs] = useState([]);
            const [directiveProgress, setDirectiveProgress] = useState(0);
            const [protectWrittenProse, setProtectWrittenProse] = useState(true);
            const [cascadeSceneChanges, setCascadeSceneChanges] = useState(() => {
                try { return localStorage.getItem('ellipsisprose_directive_cascade') !== 'false'; }
                catch { return true; }
            });
            useEffect(() => {
                try { localStorage.setItem('ellipsisprose_directive_cascade', String(cascadeSceneChanges)); }
                catch (err) { console.warn('Could not save directive cascade preference:', err); }
            }, [cascadeSceneChanges]);

            const [verifyDirectiveEdits, setVerifyDirectiveEdits] = useState(() => {
                try { return localStorage.getItem('ellipsisprose_directive_verify') !== 'false'; }
                catch { return true; }
            });
            useEffect(() => {
                try { localStorage.setItem('ellipsisprose_directive_verify', String(verifyDirectiveEdits)); }
                catch (err) { console.warn('Could not save directive verification preference:', err); }
            }, [verifyDirectiveEdits]);
            const [directiveRefinement, setDirectiveRefinement] = useState('');
            const [directivePlanHistory, setDirectivePlanHistory] = useState([]);
            const [expandedDirectiveActions, setExpandedDirectiveActions] = useState({});

            // Autonomous Editorial Harness (Tier 6.0 Literary CI/CD) State
            const [isRunningEditorialHarness, setIsRunningEditorialHarness] = useState(false);
            const [editorialHarnessPhase, setEditorialHarnessPhase] = useState('');
            const [editorialHarnessProgress, setEditorialHarnessProgress] = useState(0);
            const [editorialHarnessTab, setEditorialHarnessTab] = useState('overview'); // 'overview' | 'telemetry' | 'tribunal' | 'waves' | 'tools'
            const [editorialScopeSceneId, setEditorialScopeSceneId] = useState('ALL');
            const [editorialUseDeepLLM, setEditorialUseDeepLLM] = useState(() => {
                try { return localStorage.getItem('ellipsisprose_editorial_deep_llm') === 'true'; }
                catch { return false; }
            });
            useEffect(() => {
                try { localStorage.setItem('ellipsisprose_editorial_deep_llm', String(editorialUseDeepLLM)); }
                catch (err) { console.warn('Could not save editorial deep LLM preference:', err); }
            }, [editorialUseDeepLLM]);

            const [enableEditorialHarnessAutopilot, setEnableEditorialHarnessAutopilot] = useState(() => {
                try { return localStorage.getItem('ellipsisprose_editorial_autopilot') !== 'false'; }
                catch { return true; }
            });
            useEffect(() => {
                try { localStorage.setItem('ellipsisprose_editorial_autopilot', String(enableEditorialHarnessAutopilot)); }
                catch (err) { console.warn('Could not save editorial autopilot preference:', err); }
            }, [enableEditorialHarnessAutopilot]);

            const [editorialToolName, setEditorialToolName] = useState('inspect_narrative_hierarchy');
            const [editorialToolArgs, setEditorialToolArgs] = useState({ scene_id: 'sc_0_0', pattern: '', query: '', character_id: '', topic_or_entity_id: '' });
            const [editorialToolOutput, setEditorialToolOutput] = useState(null);
            // .novelignore rule form and handlers (Phase 6E-3).
            const {
                novelIgnoreDraftRule, setNovelIgnoreDraftRule,
                handleAddNovelIgnoreRule,
                handleRemoveNovelIgnoreRule
            } = useNovelIgnoreRules({
                setStory, showToast,
                saveStory: storyStore?.saveStory ? (id, value) => storyStore.saveStory(id, value) : undefined
            });

            // Archetype State
            const [archetypeOptions, setArchetypeOptions] = useState([]);

            // Initialize Archetypes on Mount
            useEffect(() => {
                setArchetypeOptions(generateRandomArchetypes(20));
            }, []);

            useEffect(() => {
                const el = matrixScrollRef.current;
                measureMatrixScroll();
                if (!el || view !== 'relationships' || matrixView !== 'grid') return;
                const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureMatrixScroll);
                observer?.observe(el);
                if (el.firstElementChild) observer?.observe(el.firstElementChild);
                window.addEventListener('resize', measureMatrixScroll);
                return () => {
                    observer?.disconnect();
                    window.removeEventListener('resize', measureMatrixScroll);
                };
            }, [view, matrixView, story?.id, story?.cast?.length]);
            const theme = useSettingsStore(s => s.theme);
            const setTheme = useSettingsStore(s => s.setTheme);

            useEffect(() => {
                applyThemeToDom(theme);
                localStorage.setItem("ellipsisprose_theme", theme);
            }, [theme]);

            const toggleTheme = useSettingsStore(s => s.toggleTheme);

            const [settingsTab, setSettingsTab] = useState(() => localStorage.getItem("ellipsisprose_settings_tab") || 'models');
            useEffect(() => {
                try { localStorage.setItem("ellipsisprose_settings_tab", settingsTab); } catch (e) {}
            }, [settingsTab]);

            // Streamlined Settings UX disclosures
            const [showAdvancedModelRouting, setShowAdvancedModelRouting] = useState(() => Boolean(
                (typeof reviewModel === 'string' && reviewModel.length > 0) ||
                (typeof proseModel === 'string' && proseModel.length > 0) ||
                (typeof reviewProvider === 'string' && reviewProvider.length > 0) ||
                (typeof proseProvider === 'string' && proseProvider.length > 0)
            ));
            const [showOtherApiKeys, setShowOtherApiKeys] = useState(false);

            const [loading, setLoading] = useState(false);
            const [loadingStep, setLoadingStep] = useState("");
            const isSidebarOpen = useUiStore(s => s.isSidebarOpen);
            const setIsSidebarOpen = useUiStore(s => s.setIsSidebarOpen);
            const isSidebarCollapsed = useUiStore(s => s.isSidebarCollapsed);
            const setIsSidebarCollapsed = useUiStore(s => s.setIsSidebarCollapsed);
            const [isWriterFocusMode, setIsWriterFocusMode] = useState(false);
            const [isEditingProseInline, setIsEditingProseInline] = useState(false);
            const [inlineProseDraft, setInlineProseDraft] = useState("");

            useEffect(() => {
                try { localStorage.setItem('ellipsisprose_sidebar_collapsed', String(isSidebarCollapsed)); }
                catch { /* Keep the toggle usable when storage is unavailable. */ }
            }, [isSidebarCollapsed]);

            useEffect(() => {
                const handleSidebarShortcut = (event) => {
                    const focused = document.activeElement;
                    if (!(event.ctrlKey || event.metaKey) || event.key !== '\\' || event.repeat) return;
                    if (!window.matchMedia('(min-width: 768px)').matches) return;
                    if (focused?.matches('input, textarea') || focused?.isContentEditable) return;
                    event.preventDefault();
                    setIsSidebarCollapsed(prev => !prev);
                };
                window.addEventListener('keydown', handleSidebarShortcut);
                return () => window.removeEventListener('keydown', handleSidebarShortcut);
            }, []);

            const [continuousAutopilot, setContinuousAutopilot] = useState(false);
            const [activeActTab, setActiveActTab] = useState(0);
            const continuousAutopilotRef = useRef(false);
            const isAutopilotStepRunningRef = useRef(false);
            const prefetchCacheRef = useRef(new Map());
            useEffect(() => {
                continuousAutopilotRef.current = continuousAutopilot;
                if (!continuousAutopilot) {
                    isAutopilotStepRunningRef.current = false;
                    setLoading(false);
                    prefetchCacheRef.current.clear();
                }
            }, [continuousAutopilot]);



            const [blueprintActiveTab, setBlueprintActiveTab] = useState('narrative'); // 'narrative' | 'sandbox' | 'atmosphere' | 'continuity'
            const [isBlueprintCollapsed, setIsBlueprintCollapsed] = useState(false);
            const [isEditingSceneBlueprint, setIsEditingSceneBlueprint] = useState(false);
            const [sceneBlueprintDraft, setSceneBlueprintDraft] = useState(null);
            const [sceneWorkspaceTab, setSceneWorkspaceTab] = useState('blueprint'); // 'blueprint' | 'manuscript'
            const [isSceneSplitView, setIsSceneSplitView] = useState(false); // Desktop side-by-side Split View
            const [activeSceneDropdown, setActiveSceneDropdown] = useState(null); // 'write' | 'audio' | null

            useEffect(() => {
                setIsEditingProseInline(false);
                setIsEditingSceneBlueprint(false);
                setSceneBlueprintDraft(null);
                setActiveSceneDropdown(null);
                setSlopAuditDrawerOpen(false);
            }, [selectedSequence, selectedScene, view]);

            // Live scene slop audit for Writer Manuscript pane (computed top-level to obey Rules of Hooks)
            const writerSlopAudit = useMemo(() => {
                if (view !== 'writer' || selectedSequence === null || selectedScene === null) return null;
                if (slopConfig?.enableSlopAudit === false) return null;
                const sId = `${selectedSequence}-${selectedScene}`;
                const scProse = story?.prose?.[sId];
                const proseText = scProse?.final || scProse?.draft || "";
                if (!proseText || !proseText.trim() || typeof window.scanTextForSlop !== 'function') return null;
                const isAudioDramaScene = story?.writing_mode === 'audio_drama' ||
                    (typeof isAudioDramaScriptText === 'function' && isAudioDramaScriptText(proseText));
                return window.scanTextForSlop(proseText, {
                    slopConfig,
                    customBannedPhrases: bannedPhrases,
                    story,
                    isAudioDrama: isAudioDramaScene
                });
            }, [view, selectedSequence, selectedScene, story?.prose, story?.slop_allowlist, story?.writing_mode, story?.cast, story?.concept, slopConfig, bannedPhrases]);

            useEffect(() => {
                if (!activeSceneDropdown) return;
                const handleOutsideClick = (e) => {
                    if (!e.target.closest('.scene-action-tiles-wrap')) {
                        setActiveSceneDropdown(null);
                    }
                };
                const handleKeyDown = (e) => {
                    if (e.key === 'Escape') setActiveSceneDropdown(null);
                };
                document.addEventListener('mousedown', handleOutsideClick);
                document.addEventListener('keydown', handleKeyDown);
                return () => {
                    document.removeEventListener('mousedown', handleOutsideClick);
                    document.removeEventListener('keydown', handleKeyDown);
                };
            }, [activeSceneDropdown]);

            const [inputTitle, setInputTitle] = useState(() => {
                try { return localStorage.getItem("ellipsisprose_draft_title") || ""; } catch (_) { return ""; }
            });
            const [inputConcept, setInputConcept] = useState(() => {
                try { return localStorage.getItem("ellipsisprose_draft_concept") || ""; } catch (_) { return ""; }
            });
            const [inputAuthorNote, setInputAuthorNote] = useState(() => {
                try { return localStorage.getItem("ellipsisprose_draft_author_note") || ""; } catch (_) { return ""; }
            });
            const [inputWritingMode, setInputWritingMode] = useState(() => {
                try {
                    const saved = localStorage.getItem("ellipsisprose_draft_writing_mode");
                    return saved === "audio_drama" ? "audio_drama" : "novel";
                } catch (_) { return "novel"; }
            });
            const [inputBookType, setInputBookType] = useState(() => {
                try { return localStorage.getItem("ellipsisprose_draft_book_type") || "popular"; } catch (_) { return "popular"; }
            });
            const [inputCustomWords, setInputCustomWords] = useState(() => {
                try {
                    const parsed = parseInt(localStorage.getItem("ellipsisprose_draft_custom_words"), 10);
                    return (Number.isFinite(parsed) && parsed >= 1000) ? parsed : 80000;
                } catch (_) { return 80000; }
            });
            const [importedLoreFiles, setImportedLoreFiles] = useState(() => {
                try {
                    const raw = localStorage.getItem("ellipsisprose_draft_lore_files");
                    if (!raw) return [];
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (_) { return []; }
            });
            const [importingLore, setImportingLore] = useState(false);
            const [isDraggingSetupLore, setIsDraggingSetupLore] = useState(false);
            const [isDraggingLoreTab, setIsDraggingLoreTab] = useState(false);
            const [loreSearch, setLoreSearch] = useState('');
            const [lorePage, setLorePage] = useState(1);
            const LORE_PAGE_SIZE = 25;

            useEffect(() => {
                try {
                    if (inputTitle) safeLocalStorageSet("ellipsisprose_draft_title", inputTitle);
                    else localStorage.removeItem("ellipsisprose_draft_title");
                } catch (_) {}
            }, [inputTitle]);
            useEffect(() => {
                try {
                    if (inputConcept) safeLocalStorageSet("ellipsisprose_draft_concept", inputConcept);
                    else localStorage.removeItem("ellipsisprose_draft_concept");
                } catch (_) {}
            }, [inputConcept]);
            useEffect(() => {
                try {
                    if (inputAuthorNote) safeLocalStorageSet("ellipsisprose_draft_author_note", inputAuthorNote);
                    else localStorage.removeItem("ellipsisprose_draft_author_note");
                } catch (_) {}
            }, [inputAuthorNote]);
            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_draft_writing_mode", inputWritingMode || "novel");
            }, [inputWritingMode]);
            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_draft_book_type", inputBookType || "popular");
            }, [inputBookType]);
            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_draft_custom_words", inputCustomWords);
            }, [inputCustomWords]);
            useEffect(() => {
                try {
                    if (!importedLoreFiles || importedLoreFiles.length === 0) {
                        localStorage.removeItem("ellipsisprose_draft_lore_files");
                    } else {
                        const serialized = JSON.stringify(importedLoreFiles);
                        if (serialized.length <= 1500000) {
                            safeLocalStorageSet("ellipsisprose_draft_lore_files", serialized);
                        }
                    }
                } catch (_) {}
            }, [importedLoreFiles]);

            const handleUpdateLoreFile = useCallback((fileId, newText) => {
                setImportedLoreFiles(previous => previous.map(item => item.id === fileId ? { ...item, text: newText } : item));
                setWorldPrimer(null);
            }, []);

            const handleRemoveLoreFile = useCallback((fileId) => {
                setImportedLoreFiles(previous => previous.filter(item => item.id !== fileId));
                setWorldPrimer(null);
            }, []);

            const loreImportVersionRef = useRef(0);
            const importedLoreText = useMemo(() => importedLoreFiles.map(file =>
                importedLoreFiles.length === 1 ? file.text : `## Source: ${file.name}\n\n${file.text}`
            ).join('\n\n'), [importedLoreFiles]);
            const [worldPrimer, setWorldPrimer] = useState(null);
            const loreInputRef = useRef(null);
            const coverUploadInputRef = useRef(null);


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
                        let savedLogs = await logStore.loadLogs(targetId);
                        if (!isMounted) return;

                        // Auto-recovery guard: If this story is missing early setup logs (Conceptual Development
                        // or Character Developer), check if they were left in 'story_default' during initialization.
                        if (targetId !== 'story_default' && Array.isArray(savedLogs) && savedLogs.length > 0 && !savedLogs.some(l => l && l.function && l.function.includes('Character Developer'))) {
                            try {
                                const orphanLogs = await logStore.loadLogs('story_default');
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


            const [inspectedStepId, setInspectedStepId] = useState(null);
            const generatingSceneKey = usePipelineStore(s => s.generatingSceneKey);
            const setGeneratingSceneKey = usePipelineStore(s => s.setGeneratingSceneKey);
            const [pipelineViewMode, setPipelineViewMode] = useState('detailed');
            const [pipelineDisplayMode, setPipelineDisplayMode] = useState('stage'); // 'stage' (Novel Control Center) | 'audio' (Audio Production) | 'graph' (Technical Flowchart)
            const [activePipelineWork, setActivePipelineWork] = useState(null);
            const [audioAutopilotProgress, setAudioAutopilotProgress] = useState(null);
            const [logFilter, setLogFilter] = useState('all');

            // --- EBOOK READER & AUDIO REFS ---
            const ttsStatusRef = useRef('idle');

            // --- AUDIO DRAMA STUDIO, VOICE MANAGEMENT & OFFLINE AUDIO PRODUCTION (extracted hooks) ---
            const ttsPlayingSceneRef = useRef(null);
            const [isFollowingAudio, setIsFollowingAudio] = useState(true);
            const isFollowingAudioRef = useRef(true);
            const [returnToAudioNonce, setReturnToAudioNonce] = useState(0);
            const ttsQueueRef = useRef([]);
            const ttsWorkerRef = useRef(null);
            const ttsAudioRef = useRef(null);
            const availableSceneAudioMapRef = useRef({});

            // Late-bound bridges so acyclic hooks can call into later-declared siblings
            const setTtsQueueAndRefRef = useRef(() => {});
            const stopTtsPlaybackRef = useRef(() => {});
            const getOrCreateTtsWorkerRef = useRef(() => null);
            const initTtsEngineRef = useRef(async () => false);
            const isTtsBusyOrPlayingRef = useRef(false);
            const openEditModalRef = useRef(() => {});
            const setAvailableSceneAudioMapRef = useRef(() => {});
            const setAvailableSequenceAudioMapRef = useRef(() => {});
            const refreshAvailableSceneAudioRef = useRef(async () => {});
            const getLlmKeys = useCallback(() => llmKeysRef.current, []);
            const openEditModalStable = useCallback((title, value, onConfirm, fieldKey) => openEditModalRef.current(title, value, onConfirm, fieldKey), []);

            const {
                audioDramaSettings, setAudioDramaSettings, audioDramaSettingsRef,
                sessionTtsTierCapRef, ttsProbeCacheRef, updateAudioDramaSetting,
                isAuditioningVoice, setIsAuditioningVoice, auditioningTarget, setAuditioningTarget,
                collectSpeakerAliases, invalidateSpeakerVoiceCache, commitVoiceEditUpdate,
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
                setStory,
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
                isAudioAutopilotRunning, setIsAudioAutopilotRunning, isAudioAutopilotRunningRef,
                isAudioAutopilotQueued, setIsAudioAutopilotQueued, isAudioAutopilotQueuedRef,
                generateAndStoreSceneAudio, handleDownloadSceneAudio, handleRegenerateSceneAudio,
                handleDownloadSequenceAudio, handleDownloadStoryAudio,
                clearStoryTtsArtifacts, handleToggleAudioAutopilot
            } = useAudioProduction({
                story,
                storyRef,
                setStory,
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
                availableSceneAudioMap,
                getSceneAudioStatus,
                audioAutopilotProgress,
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
                const map = {};
                const acts = story?.acts || [];
                const sequences = story?.sequences || [];
                acts.forEach((a, aIdx) => {
                    const actNum = parseActNumber(a.number, aIdx + 1);
                    const list = [];
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

            // Memoized search filtering & pagination for Lore Tab
            const filteredLore = useMemo(() => {
                const allLore = story?.lore || [];
                if (!loreSearch || !loreSearch.trim()) return allLore;
                const q = loreSearch.toLowerCase().trim();
                return allLore.filter(l => (l.topic || '').toLowerCase().includes(q) || (l.detail || '').toLowerCase().includes(q));
            }, [story?.lore, loreSearch]);

            const totalLorePages = Math.ceil(filteredLore.length / LORE_PAGE_SIZE) || 1;

            const paginatedLore = useMemo(() => {
                const start = (lorePage - 1) * LORE_PAGE_SIZE;
                return filteredLore.slice(start, start + LORE_PAGE_SIZE);
            }, [filteredLore, lorePage, LORE_PAGE_SIZE]);

            useEffect(() => {
                setLorePage(1);
            }, [loreSearch]);



            // --- LIVE TTS PLAYBACK & OFFLINE SCENE AUDIO PLAYER (extracted hook) ---
            const {
                ttsStatus, setTtsStatus, isTtsBusyOrPlaying, isAnyAudioPlaying,
                ttsProgress, ttsStatusMessage, ttsActiveDevice, ttsError, setTtsError, setTtsCurrentTime, requestChunkAudio,
                ttsIsMiniPlayerVisible, setTtsIsMiniPlayerVisible,
                ttsQueue, setTtsQueueAndRef,
                ttsCurrentChunkIndex, ttsCurrentTime, ttsDuration, ttsGeneratingElapsedSec,
                audioDramaActiveSpeaker, audioDramaActiveEmotion, isAudioDramaModeActive,
                audioPlaybackScope, setAudioPlaybackScope, isPlayingMasterSceneMp3,
                ttsPlayingScene, ttsResolvedSource,
                getOrCreateTtsWorker, initTtsEngine, startTtsFromProse, toggleTtsPlayPause,
                stopTtsPlayback, skipTtsChunk, changeTtsVoice,
                playSceneAudio, skipAudioScene, playStoredOrLiveSceneAudio
            } = useTtsPlayback({
                story,
                storyRef,
                setStory,
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



            const fileInputRef = useRef(null);

            // RAG & Graph State
            // useRef's initial-value argument is evaluated on EVERY render - useRef(new VectorStore())
            // constructed (and discarded) a fresh instance, including an IndexedDB open, per render.
            const vectorStore = useRef(null);
            if (!vectorStore.current) vectorStore.current = new VectorStore();
            const graphManager = useRef(null);
            if (!graphManager.current) graphManager.current = new GraphManager();
            const embeddingService = useRef(null);
            const ragIndexRevision = useRef(0);
            const [ragStatus, setRagStatus] = useState("idle"); // idle, indexing, ready
            const [isRebuildingRag, setIsRebuildingRag] = useState(false);

            // RAG Inspector State
            const [ragTestQuery, setRagTestQuery] = useState("");
            const [ragTestResults, setRagTestResults] = useState([]);
            const [ragTestLoading, setRagTestLoading] = useState(false);

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

            // Global Edit Modal State
            const [editingState, setEditingState] = useState({
                isOpen: false,
                title: "",
                value: "",
                onConfirm: null
            });

            // Feedback Ledger State for Rollbacks
            const [feedbackLedger, setFeedbackLedger] = useState({});

            // Intervention Modal State for Escalation Failures
            const [interventionState, setInterventionState] = useState({
                isOpen: false,
                tierName: "",
                deviationReasons: [],
                rawOutput: "",
                onResolve: null
            });

            // Critique Modal State for failed beats
            const [critiqueState, setCritiqueState] = useState({
                isOpen: false,
                beatNumber: null,
                critique: ""
            });

            // Prompt-log detail dialog (Phase 6E-3).
            const { logModalState, setLogModalState, openLogDetailModal } = useLogDetailModal({ promptLog });

            const openCritiqueModal = (beatNumber, critique) => {
                setCritiqueState({
                    isOpen: true,
                    beatNumber,
                    critique: critique || "No critique available."
                });
            };

            const openEditModal = (title, value, onConfirm) => {
                setEditingState({
                    isOpen: true,
                    title,
                    value: value || "",
                    onConfirm: (newValue) => {
                        onConfirm(newValue);
                        setEditingState(prev => ({ ...prev, isOpen: false }));
                        showToast(`${title} updated!`, "success");
                    }
                });
            };

            openEditModalRef.current = openEditModal;

            // ============================================================================
            // HELPER: ISOLATED STORY STATE UPDATER (SUPPORTS BACKGROUND INITIALIZATION)
            // Updates React state + snapshot when targetStoryId is active, or updates
            // snapshot + IndexedDB directly without clobbering another active story.
            // ============================================================================
            const updateStoryById = async (targetStoryId, updaterOrPatch) => {
                if (!targetStoryId || deletedStoryIdsRef.current.has(targetStoryId)) return null;
                const applyUpdate = (base) => (
                    typeof updaterOrPatch === 'function'
                        ? updaterOrPatch(base)
                        : { ...base, ...updaterOrPatch }
                );

                let nextStory = null;
                if (storyRef.current?.id === targetStoryId) {
                    nextStory = setStory(prev => {
                        const base = (prev && prev.id === targetStoryId)
                            ? prev
                            : (storySnapshotsByIdRef.current[targetStoryId] || createDefaultStoryTemplate(targetStoryId));
                        const updated = applyUpdate(base);
                        storySnapshotsByIdRef.current[targetStoryId] = updated;
                        return updated;
                    });
                } else {
                    const base = storySnapshotsByIdRef.current[targetStoryId]
                        || (await storyStore.loadStory(targetStoryId))
                        || createDefaultStoryTemplate(targetStoryId);
                    nextStory = applyUpdate(base);
                    storySnapshotsByIdRef.current[targetStoryId] = nextStory;
                }

                if (nextStory && nextStory.id && !deletedStoryIdsRef.current.has(targetStoryId)) {
                    await storyStore.saveStory(targetStoryId, nextStory).catch(err => {
                        console.warn(`[updateStoryById] Failed saving story '${targetStoryId}':`, err);
                    });
                }
                return nextStory;
            };

            const feedbackLedgerRef = useRef(null);
            feedbackLedgerRef.current = feedbackLedger;
            const ragStatusRef = useRef(ragStatus);
            ragStatusRef.current = ragStatus;
            const isRebuildingRagRef = useRef(isRebuildingRag);
            isRebuildingRagRef.current = isRebuildingRag;

            const getPipelineCtx = () => ({
                getStory: () => storyRef.current || story,
                setStory,
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
                setInterventionState,
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
                retrieveContext: (...args) => retrieveContext(...args),
                callAI: (...args) => callAI(...args),
                applyWorldUpdates: typeof applyWorldUpdates === 'function' ? applyWorldUpdates : undefined,
                auditEntityNamesAndPlaces: typeof window !== 'undefined' && typeof window.auditEntityNamesAndPlaces === 'function' ? window.auditEntityNamesAndPlaces : undefined,
                applyCascadingNameReplacements: typeof window !== 'undefined' && typeof window.applyCascadingNameReplacements === 'function' ? window.applyCascadingNameReplacements : undefined,
                extractCandidatePlaceNames: typeof window !== 'undefined' && typeof window.extractCandidatePlaceNames === 'function' ? window.extractCandidatePlaceNames : undefined,
                getSetupDraft: () => ({
                    inputConcept,
                    inputTitle,
                    inputAuthorNote,
                    inputWritingMode,
                    inputBookType,
                    inputCustomWords,
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
                setPromptLog,
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
                    koboldUrl,
                    codexUrl,
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
            const distillLore = (text, options = {}) => orchestrateDistillLore(getPipelineCtx(), text, options);
            window.distillLore = distillLore;

            const clearImportedLore = () => {
                // Ignore pending reads if the user clears the files or starts another story.
                loreImportVersionRef.current++;
                setImportedLoreFiles([]);
                setImportingLore(false);
                setWorldPrimer(null);
                if (loreInputRef.current) loreInputRef.current.value = '';
            };

            const clearSetupDraft = () => {
                setInputTitle("");
                setInputConcept("");
                setInputAuthorNote("");
                setInputWritingMode("novel");
                setInputBookType("popular");
                setInputCustomWords(80000);
                // Clear imported lore files without wiping the newly created story's active worldPrimer
                loreImportVersionRef.current++;
                setImportedLoreFiles([]);
                setImportingLore(false);
                if (loreInputRef.current) loreInputRef.current.value = '';
                try {
                    localStorage.removeItem("ellipsisprose_draft_title");
                    localStorage.removeItem("ellipsisprose_draft_concept");
                    localStorage.removeItem("ellipsisprose_draft_author_note");
                    localStorage.removeItem("ellipsisprose_draft_writing_mode");
                    localStorage.removeItem("ellipsisprose_draft_book_type");
                    localStorage.removeItem("ellipsisprose_draft_custom_words");
                    localStorage.removeItem("ellipsisprose_draft_lore_files");
                } catch (_) {}
            };

            const handleLoreImport = async (eventOrFiles) => {
                const files = eventOrFiles?.target
                    ? Array.from(eventOrFiles.target.files || [])
                    : Array.from(eventOrFiles || []);
                if (eventOrFiles?.target) eventOrFiles.target.value = ''; // Allow adding the same file again after removal.
                if (!files.length) return;
                const importVersion = ++loreImportVersionRef.current;
                setImportingLore(true);
                try {
                    const results = await Promise.allSettled(files.map(async (file, index) => {
                        const text = await extractTextFromFile(file, (p) => {
                            if (p?.message) setLoadingStep(p.message);
                        });
                        if (!text || !text.trim()) throw new Error('Document contains no extractable text');
                        return {
                            id: `${importVersion}-${index}`,
                            name: file.name || `Document ${index + 1}`,
                            size: file.size || text.length,
                            text: text.trim()
                        };
                    }));
                    if (importVersion !== loreImportVersionRef.current) return;
                    const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
                    const failedNames = files.filter((file, index) => results[index].status === 'rejected').map(file => file.name || 'file');
                    if (loaded.length) {
                        setImportedLoreFiles(previous => [...previous, ...loaded]);
                        setWorldPrimer(null);
                    }
                    if (failedNames.length) {
                        showToast(`Added ${loaded.length} file${loaded.length === 1 ? '' : 's'}. Could not load: ${failedNames.join(', ')}. Supported formats: .txt, .md, .docx, .pdf, .epub, .json, .csv.`, 'error');
                    } else {
                        showToast(`${loaded.length} document${loaded.length === 1 ? '' : 's'} imported successfully!`, 'success');
                    }
                } catch (err) {
                    showToast(`Document import error: ${err.message}`, 'error');
                } finally {
                    if (importVersion === loreImportVersionRef.current) setImportingLore(false);
                }
            };

            // Handle Post-Generation Lore Document Import into RAG
            const handlePostGenLoreImport = async (fileOrFiles) => {
                const files = fileOrFiles?.target
                    ? Array.from(fileOrFiles.target.files || [])
                    : (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).filter(Boolean);
                if (fileOrFiles?.target) fileOrFiles.target.value = null;
                if (!files.length) return;

                setLoading(true);
                try {
                    let totalChunksAdded = 0;
                    const newChunks = [];

                    for (const file of files) {
                        const filename = file.name || "Document";
                        setLoadingStep(`Extracting text from '${filename}'...`);
                        showToast(`Reading and parsing '${filename}'...`, "info");
                        const text = await extractTextFromFile(file, (p) => {
                            if (p?.message) setLoadingStep(p.message);
                        });

                        if (!text || !text.trim()) {
                            showToast(`Document '${filename}' contains no readable text.`, "warn");
                            continue;
                        }

                        setLoadingStep(`Chunking and indexing '${filename}' for vector memory...`);
                        const docName = filename.replace(/\.[^/.]+$/, "");
                        const chunks = chunkLoreText(text, null, null, `Imported from ${filename}`, docName);
                        newChunks.push(...chunks);
                        totalChunksAdded += chunks.length;
                    }

                    if (newChunks.length === 0) {
                        showToast("No readable text found in selected document(s).", "warn");
                        return;
                    }

                    setLoadingStep(`Indexing ${totalChunksAdded} segments into RAG vector store...`);
                    const currentLore = story.lore || [];
                    const combinedList = [...currentLore, ...newChunks];
                    const processedList = await ingestLoreBatch(combinedList, { clearExisting: true, fingerprintProcessed: true });

                    const finalLore = processedList && processedList.length > 0 ? processedList : combinedList;
                    setStory(prev => {
                        const updated = { ...prev, lore: finalLore };
                        if (storyStore?.saveStory && updated.id) {
                            storyStore.saveStory(updated.id, updated).catch(err => console.warn("Failed saving post-gen lore import to storyStore:", err));
                        }
                        return updated;
                    });

                    showToast(`Successfully ingested ${files.length} document${files.length === 1 ? '' : 's'} (${totalChunksAdded} RAG segments) into World Lore!`, "success");
                } catch (err) {
                    console.error("Failed to import lore document:", err);
                    showToast(`Document ingestion failed: ${err.message}`, "error");
                } finally {
                    setLoading(false);
                }
            };

            // ============================================================================
            // TIER 6.3: RETROACTIVE STATE INJECTION (RSI) AGENT
            // Associated Prompt: PROMPTS.rsiPrompt
            // ============================================================================
            const checkAndExecuteRSI = (reason, currentStory) => orchestrateCheckAndExecuteRSI(getPipelineCtx(), reason, currentStory);

            /**
             * Retroactively Injects a Clue Directive into Preceding Drafted Scene Prose via RSI
             */
            const retroactivelyInjectClue = (secretId, clueIdx, currentStory = story) => orchestrateRetroactivelyInjectClue(getPipelineCtx(), secretId, clueIdx, currentStory);
            window.retroactivelyInjectClue = retroactivelyInjectClue;


            // 2A: Upstream AI Slop Entity Name & Place Repair Helper
            const repairBannedEntitiesWithAI = (opts = {}) => orchestrateRepairBannedEntitiesWithAI(getPipelineCtx(), opts);

            // TIER 6.4: Shared scene archivist, used after writing and directive verification.
            const runArchivistForScene = (storyState, seqIdx, sceneIdx) => orchestrateRunArchivistForScene(getPipelineCtx(), storyState, seqIdx, sceneIdx);


            const verifyAndArchiveDirectiveScene = (storyState, sId, logMessage) => orchestrateVerifyAndArchiveDirectiveScene(getPipelineCtx(), storyState, sId, logMessage);

            const reviewDirectiveConsistency = (storyState, sceneIds, consistencyNotes, logMessage) => orchestrateReviewDirectiveConsistency(getPipelineCtx(), storyState, sceneIds, consistencyNotes, logMessage);

            const handleFixDirectiveReview = (actionIdx) => orchestrateHandleFixDirectiveReview(getPipelineCtx(), actionIdx);


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


            const applySurgicalProsePatch = (opts) => orchestrateApplySurgicalProsePatch(getPipelineCtx(), opts);

            const handleRunManualSlopClean = (seqIdx, sceneIdx) => orchestrateHandleRunManualSlopClean(getPipelineCtx(), seqIdx, sceneIdx);

            const executeDirectivePlan = (planActions) => orchestrateExecuteDirectivePlan(getPipelineCtx(), planActions);

            // ============================================================================
            // TIER 6.1: DIRECTIVE PLANNER AGENT
            // Associated Prompt: PROMPTS.directivePlanner
            // ============================================================================
            const runDirectivePlanner = (refinementRequest = '') => orchestrateRunDirectivePlanner(getPipelineCtx(), refinementRequest);

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

            const retryFailedSurgicalEdits = (opts) => orchestrateRetryFailedSurgicalEdits(getPipelineCtx(), opts);

            const applySurgicalEditsWithRetry = (opts) => orchestrateApplySurgicalEditsWithRetry(getPipelineCtx(), opts);

            // ============================================================================
            // TIER 6.0: AUTONOMOUS EDITORIAL HARNESS & LITERARY CI/CD ORCHESTRATOR
            // Executes Phases 1–5 across any drafted scene or the entire manuscript:
            //   - mode = 'full_pipeline': Runs Phases 1–3 (Review & Plan) + Phases 4–5 (3-Wave Surgical Execution & 4-Gate CI/CD)
            //   - mode = 'review_only': Runs Phases 1–3 only (Diagnostic Review, Tribunal, & 3-Wave Plan compilation)
            //   - mode = 'execute_plan': Executes pending transactions in the compiled 3-Wave Edit Plan through the 4-Gate CI/CD suite
            // ============================================================================
            const runAutonomousEditorialHarness = (opts = {}) => orchestrateRunAutonomousEditorialHarness(getPipelineCtx(), opts);

            const executeSingleHarnessTransaction = (transactionId) => orchestrateExecuteSingleHarnessTransaction(getPipelineCtx(), transactionId);

            const revertHarnessTransaction = (transactionId) => orchestrateRevertHarnessTransaction(getPipelineCtx(), transactionId);

            const revertAllHarnessTransactions = () => orchestrateRevertAllHarnessTransactions(getPipelineCtx());

            const handleRunHarnessInspectorTool = () => {
                const currentStory = storyRef.current || story;
                const fullTelemetry = currentStory.editorial_harness?.fullTelemetry || runFullManuscriptNlpTelemetry(currentStory, bannedPhrases, slopConfig);
                const nsg = currentStory.editorial_harness?.nsg || compileNarrativeStateGraph(currentStory, fullTelemetry);
                const layer0Map = currentStory.editorial_harness?.layer0Map || {};
                const tools = createHarnessInspectionTools(currentStory, nsg, fullTelemetry, layer0Map);
                const fn = tools[editorialToolName];
                if (typeof fn !== 'function') {
                    setEditorialToolOutput({ error: `Unknown tool: ${editorialToolName}` });
                    return;
                }
                const result = fn(editorialToolArgs);
                setEditorialToolOutput(result);
            };

            window.runAutonomousEditorialHarness = runAutonomousEditorialHarness;
            window.executeSingleHarnessTransaction = executeSingleHarnessTransaction;
            window.revertHarnessTransaction = revertHarnessTransaction;
            window.revertAllHarnessTransactions = revertAllHarnessTransactions;

            const runAgentWithEscalation = (params) => orchestrateRunAgentWithEscalation(getPipelineCtx(), params);

            const createStoryEntityFromSetup = (opts = {}) => orchestrateCreateStoryEntityFromSetup(getPipelineCtx(), opts);

            const initStory = (isAutopilotOrEvent = false, options = {}) => orchestrateInitStory(getPipelineCtx(), isAutopilotOrEvent, options);

            // ============================================================================
            // TIER 1.1: STORY ARC PLANNER & TIER 1.2: STORY ARC REVIEWER
            // Associated Prompts: PROMPTS.storyArc, PROMPTS.arcReview
            // ============================================================================
            const generateStoryArc = (currentStory = story, isAutopilot = false) => orchestrateGenerateStoryArc(getPipelineCtx(), currentStory, isAutopilot);

            const generateActsAndSequences = (currentStory = story, isAutopilot = false) => orchestrateGenerateActsAndSequences(getPipelineCtx(), currentStory, isAutopilot);



            // Single Item Ingest with Redundancy Check (3-Tier Lore Merger - A4)
            const ingestLore = (item, rebuild = null) => orchestrateIngestLore(getPipelineCtx(), item, rebuild);

            // Batch Ingest (for Init or Import)
            const ingestLoreBatch = (loreList, options = {}) => orchestrateIngestLoreBatch(getPipelineCtx(), loreList, options);

            const rebuildRagIndex = () => orchestrateRebuildRagIndex(getPipelineCtx());

            // Build Graph on Load/Change
            useEffect(() => {
                if (story.lore) {
                    graphManager.current.buildGraph(story.lore);
                }
            }, [story.lore]);

            // UI State
            const [collapsedActs, setCollapsedActs] = useState({});
            const [collapsedBeats, setCollapsedBeats] = useState({});
            const [expandedBeatAnalysis, setExpandedBeatAnalysis] = useState({});



            const toggleAct = (idx) => {
                setCollapsedActs(prev => ({ ...prev, [idx]: !prev[idx] }));
            };

            const toggleBeats = (bId) => {
                setCollapsedBeats(prev => ({ ...prev, [bId]: !prev[bId] }));
            };

            const toggleBeatAnalysis = (bId) => {
                setExpandedBeatAnalysis(prev => ({ ...prev, [bId]: !prev[bId] }));
            };

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_enable_narrative_lenses_v2", enableNarrativeLenses);
                safeLocalStorageSet("ellipsisprose_enable_narrative_lenses", enableNarrativeLenses);
            }, [enableNarrativeLenses]);



            // Story persistence solely via IndexedDB (handles gigabytes, no quota limits, non-blocking)
            useEffect(() => {
                if (!hasHydratedStory.current) return;
                if (!story || !story.id || !activeStoryId || story.id !== activeStoryId) return;
                storyStore.saveStory(story.id, story).catch(err => {
                    console.warn("IndexedDB story save failed:", err);
                });
            }, [story, activeStoryId]);

            // Instantiate/Update Embedding Service
            useEffect(() => {
                let key = "";
                if (embeddingProvider === 'gemini') key = apiKey;
                else if (embeddingProvider === 'openrouter') key = openRouterKey;
                else if (embeddingProvider === 'nanogpt') key = nanoGptKey;
                else if (embeddingProvider === 'koboldcpp' || embeddingProvider === 'codex') key = "";

                embeddingService.current = new EmbeddingService(key, embeddingProvider, koboldUrl, codexUrl);
            }, [apiKey, openRouterKey, nanoGptKey, koboldUrl, codexUrl, embeddingProvider]);

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_view", view);
            }, [view]);

            useEffect(() => {
                if (selectedAct !== null) safeLocalStorageSet("ellipsisprose_selectedAct", selectedAct);
                else { try { localStorage.removeItem("ellipsisprose_selectedAct"); } catch (_) { } }
            }, [selectedAct]);

            useEffect(() => {
                if (selectedSequence !== null) safeLocalStorageSet("ellipsisprose_selectedSequence", selectedSequence);
                else { try { localStorage.removeItem("ellipsisprose_selectedSequence"); } catch (_) { } }
            }, [selectedSequence]);

            useEffect(() => {
                if (selectedScene !== null) safeLocalStorageSet("ellipsisprose_selectedScene", selectedScene);
                else { try { localStorage.removeItem("ellipsisprose_selectedScene"); } catch (_) { } }
            }, [selectedScene]);



            // Ensure story has a unique ID and sync activeStoryId
            useEffect(() => {
                if (story && !story.id) {
                    const newId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    setActiveStoryId(newId);
                    setStory(prev => {
                        if (prev && prev.id) return prev;
                        return {
                            ...prev,
                            id: newId
                        };
                    });
                }
            }, [story]);



            // ============================================================================
            // TIER 6.5: LORE EXTRACTION AGENT
            // Associated Prompt: PROMPTS.loreExtraction
            // ============================================================================
            const triggerLoreExtraction = (payload, activeActNum = 1, activeSceneNum = 1) => orchestrateTriggerLoreExtraction(getPipelineCtx(), payload, activeActNum, activeSceneNum);


            const handleWorldUpdates = (updates, activeActNum = 1, activeSceneNum = 1, targetStory = null, sceneObj = null) => orchestrateHandleWorldUpdates(getPipelineCtx(), updates, activeActNum, activeSceneNum, targetStory, sceneObj);
            window.handleWorldUpdates = handleWorldUpdates;
            window.applyWorldUpdates = applyWorldUpdates;



            // Stage reset and factory reset (Phase 6E-3).
            const { handleResetStoryStage, handleDeleteStory } = useStoryReset({
                story, storyRef, setStory, setActiveStoryId, requestConfirm, showToast,
                clearStoryTtsArtifacts, setContinuousAutopilot, setReadingProgress, prefetchCacheRef,
                setLoadedImages, setFeedbackLedger,
                setSelectedAct, setSelectedSequence, setSelectedScene, setActiveActTab, setCollapsedActs,
                view, viewRef, setView,
                graphManager, vectorStore, embeddingService, ingestLoreBatch,
                refreshLibrary, setLibraryStories, setLibraryCovers, clearSetupDraft
            });
            window.handleResetStoryStage = handleResetStoryStage;

            // Export (JSON, audio-drama script, EPUB) and file import (Phase 6E-3).
            const { handleExport, handleExportAudioDramaTxt, handleExportEpub, handleImport } = useStoryTransfer({
                story, storyRef, setStory, setActiveStoryId, setLoadedImages, setPortraitReload, setView,
                refreshLibrary, refreshAvailableSceneAudio, showToast, requestConfirm,
                dismissToast: () => {
                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                    setToast(null);
                },
                enterReaderMode, playSceneAudio
            });
            window.handleImport = handleImport;

            // RAG Retrieval Engine with BM25 Lexical Fallback & Knowledge Graph Traversal (delegated to src/services/rag)
            const retrieveContext = (query, threshold = 0.5, filterFn = null, loreList = null) =>
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
            window.retrieveContext = retrieveContext;

            // RAG Inspector Handler
            const handleRagTest = async () => {
                if (!ragTestQuery.trim()) return;
                setRagTestLoading(true);
                try {
                    // Test retrieval NO FILTER
                    const results = await retrieveContext(ragTestQuery, 0.0); // 0.0 threshold to see everything
                    setRagTestResults(results);
                } catch (e) {
                    alert("RAG Test Failed: " + e.message);
                } finally {
                    setRagTestLoading(false);
                }
            };



            // ============================================================================
            // TIER 0.2: CHARACTER DEVELOPMENT AGENT - ON DEMAND
            // Associated Prompt: PROMPTS.characterDevelopment
            // ============================================================================
            const generateCharacterProfile = (...args) => orchestrateGenerateCharacterProfile(getPipelineCtx(), ...args);

            const getCharacterDetails = (charName, mutableCastList) => orchestrateGetCharacterDetails(getPipelineCtx(), charName, mutableCastList);

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
            window.updateSceneBlueprint = updateSceneBlueprint;

            const handleCascadeSceneToProse = (seqIdx, sceneIdx, options = {}) => orchestrateHandleCascadeSceneToProse(getPipelineCtx(), seqIdx, sceneIdx, options);
            window.handleCascadeSceneToProse = handleCascadeSceneToProse;

            window.handleAddScene = handleAddScene;

            window.handleMoveScene = handleMoveScene;

            const updateCharacterStateForScene = (charName, stateUpdates = {}) => {
                if (!charName) return;
                const cleanName = String(charName).trim();
                if (!cleanName) return;

                const updatedStory = setStory(prev => {
                    const prevStates = { ...(prev.character_states || {}) };
                    const matchedKey = Object.keys(prevStates).find(k => k.toLowerCase() === cleanName.toLowerCase()) || cleanName;
                    const origState = prevStates[matchedKey] || {};
                    const nextPatch = { ...(stateUpdates || {}) };
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
            window.updateCharacterStateForScene = updateCharacterStateForScene;

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
            const updateStorySoFar = (currentStory, isAutopilot = false) => orchestrateUpdateStorySoFar(getPipelineCtx(), currentStory, isAutopilot);

            // ============================================================================
            // TIER 3.1 & 3.2: SEQUENCE AGENT (LARGE)
            // Associated Prompts: PROMPTS.sequenceAgent, PROMPTS.sequenceReview
            // ============================================================================
            const generateSequences = (currentStory = story, isAutopilot = false) => orchestrateGenerateSequences(getPipelineCtx(), currentStory, isAutopilot);

            const requestSceneWeaving = (seqIdx) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                if (story.scenes[`${sIdx}`]?.length > 0) {
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

            const generateScenes = (sequenceIndex, currentStory = story, isAutopilot = false, isPrefetch = false) => orchestrateGenerateScenes(getPipelineCtx(), sequenceIndex, currentStory, isAutopilot, isPrefetch);

            // ============================================================================

            const runAudioDramaVoiceDirectorPass = (opts = {}) => orchestrateRunAudioDramaVoiceDirectorPass(getPipelineCtx(), opts);

            const writeSceneProse = (...args) => orchestrateWriteSceneProse(getPipelineCtx(), ...args);

            window.writeSceneProse = writeSceneProse;
            window.runAudioDramaVoiceDirectorPass = runAudioDramaVoiceDirectorPass;
            window.runAgentWithEscalation = runAgentWithEscalation;
            window.generateStoryArc = generateStoryArc;
            window.generateActsAndSequences = generateActsAndSequences;
            window.generateCharacterProfile = generateCharacterProfile;
            window.generateScenes = generateScenes;
            window.triggerLoreExtraction = triggerLoreExtraction;
            window.PROMPTS = PROMPTS;
            window.callAI = callAI;

            const copyFullScene = () => {
                const seq = selectedSequence !== null ? selectedSequence : 0;
                const sc = selectedScene !== null ? selectedScene : 0;
                if (!story.scenes || !story.scenes[`${seq}`] || !story.scenes[`${seq}`][sc]) return;
                const scene = story.scenes[`${seq}`][sc];
                const sId = `${seq}-${sc}`;
                let text = `SCENE ${scene.number}: ${(scene.title || "").toUpperCase()}\n\n`;
                if (story.prose[sId]?.final) {
                    text += story.prose[sId].final + "\n\n";
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
                        showToast("Export failed: " + err.message, "error");
                    }
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-9999px";
                    document.body.appendChild(textArea);
                    textArea.select();
                    try { document.execCommand('copy'); showToast("Copied to clipboard!"); } catch (err) { alert("Copy failed."); }
                    document.body.removeChild(textArea);
                }
            };

            const handleAutopilot = (options = {}) => orchestrateHandleAutopilot(getPipelineCtx(), options);

            const runContinuousAutopilotStep = () => orchestrateRunContinuousAutopilotStep(getPipelineCtx());

            const toggleContinuousAutopilot = () => {
                setContinuousAutopilot(prev => {
                    const next = !prev;
                    continuousAutopilotRef.current = next;
                    if (!next) {
                        isAutopilotStepRunningRef.current = false;
                        setLoading(false);
                        prefetchCacheRef.current.clear();
                    }
                    return next;
                });
            };

            window.runContinuousAutopilotStep = runContinuousAutopilotStep;
            window.toggleContinuousAutopilot = toggleContinuousAutopilot;
            window.handleAutopilot = handleAutopilot;

            useEffect(() => {
                let cancelled = false;
                const runLoop = async () => {
                    if (!continuousAutopilot) return;
                    continuousAutopilotRef.current = true;

                    // Pre-flight connectivity check for local endpoints (e.g. KoboldCPP)
                    if (apiProvider === 'koboldcpp') {
                        const targetUrl = (koboldUrl || 'http://localhost:5001').replace(/\/+$/, '');
                        try {
                            const testCtrl = new AbortController();
                            const testTimer = setTimeout(() => testCtrl.abort(), 2000);
                            const pingResp = await fetch(`${targetUrl}/v1/models`, { method: 'GET', signal: testCtrl.signal });
                            clearTimeout(testTimer);
                            if (!pingResp.ok) throw new Error(`HTTP ${pingResp.status}`);
                        } catch (connErr) {
                            showToast(`Could not connect to KoboldCPP at ${targetUrl}. Please ensure KoboldCPP is running locally before starting Autopilot.`, 'error');
                            setContinuousAutopilot(false);
                            continuousAutopilotRef.current = false;
                            return;
                        }
                    }

                    while (!cancelled && continuousAutopilotRef.current) {
                        if (isAutopilotStepRunningRef.current) {
                            await new Promise(r => setTimeout(r, 200));
                            continue;
                        }
                        isAutopilotStepRunningRef.current = true;
                        let hasMore = false;
                        try {
                            hasMore = await runContinuousAutopilotStep();
                        } catch (err) {
                            console.error("Continuous Autopilot error:", err);
                            showToast(`Autopilot error: ${err.message}`, "error");
                            setContinuousAutopilot(false);
                            continuousAutopilotRef.current = false;
                            break;
                        } finally {
                            isAutopilotStepRunningRef.current = false;
                            setLoading(false);
                        }

                        if (!hasMore || !continuousAutopilotRef.current || cancelled) {
                            break;
                        }

                        // Brief non-blocking yield between steps
                        await new Promise(r => setTimeout(r, 500));
                    }

                    // Autopilot has halted or completed; reset active state so UI is never stuck
                    setContinuousAutopilot(false);
                    continuousAutopilotRef.current = false;
                    isAutopilotStepRunningRef.current = false;
                    setLoading(false);

                    if (isAudioAutopilotQueuedRef.current) {
                        isAudioAutopilotQueuedRef.current = false;
                        setIsAudioAutopilotQueued(false);
                        showToast("Story generation complete! Starting queued Audio Drama Autopilot...", "success");
                        setIsAudioAutopilotRunning(true);
                    }
                };

                if (continuousAutopilot) {
                    runLoop();
                } else {
                    continuousAutopilotRef.current = false;
                    isAutopilotStepRunningRef.current = false;
                    prefetchCacheRef.current.clear();
                }

                return () => {
                    cancelled = true;
                };
            }, [continuousAutopilot]);


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
                    story,
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
                    koboldModel,
                    codexModel,
                    apiKey,
                    openRouterKey,
                    nanoGptKey,
                    koboldUrl,
                    codexUrl,
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
                    setKoboldModel,
                    setCodexModel,
                    setApiKey,
                    setOpenRouterKey,
                    setNanoGptKey,
                    setKoboldUrl,
                    setCodexUrl,
                    setInputTitle,
                    setInputConcept,
                    setInputAuthorNote,
                    setInputWritingMode,
                    setActiveStoryId,
                    setStory,
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
                storyStore
            });

            const handleAutoGenerateScene = (seqIdx, sceneIdx, options = {}) => orchestrateHandleAutoGenerateScene(getPipelineCtx(), seqIdx, sceneIdx, options);

            const handleDirectSceneVoices = (seqIdx = selectedSequence, sceneIdx = selectedScene) => orchestrateHandleDirectSceneVoices(getPipelineCtx(), seqIdx, sceneIdx);



            const handleSelectLibraryStory = (targetItem, targetView = 'dashboard') => {
                if (!targetItem) return;
                const liveInitData = (initializingStoryIdRef.current === targetItem.id && storySnapshotsByIdRef.current[targetItem.id])
                    ? storySnapshotsByIdRef.current[targetItem.id]
                    : null;
                const targetData = liveInitData || targetItem.data || {};
                const migrated = migrateStoryToSequences(targetData);
                if (liveInitData) {
                    skipNextIdbHydrationIdRef.current = targetItem.id;
                }
                setActiveStoryId(targetItem.id);
                setStory({
                    relationships: {},
                    graph_edges: [],
                    ...migrated,
                    continuity_ledger: Array.isArray(migrated?.continuity_ledger) ? migrated.continuity_ledger : [],
                    secret_vault: Array.isArray(migrated?.secret_vault) ? migrated.secret_vault : [],
                    id: targetItem.id
                });
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
                        storyAudioSummary={storyAudioSummary}
                        refreshLibrary={refreshLibrary}
                        handleAutopilot={handleAutopilot}
                        handleToggleAudioAutopilot={handleToggleAudioAutopilot}
                        enterReaderMode={enterReaderMode}
                        getSceneProseText={getSceneProseText}
                        getSceneAudioStatus={getSceneAudioStatus}
                        handleExportEpub={handleExportEpub}
                        handleExportAudioDramaTxt={handleExportAudioDramaTxt}
                        handleImport={handleImport}
                        fileInputRef={fileInputRef}
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
                            enterReaderMode={enterReaderMode}
                            loading={loading}
                            loadingStep={loadingStep}
                            continuousAutopilot={continuousAutopilot}
                            setContinuousAutopilot={setContinuousAutopilot}
                            handleAutopilot={handleAutopilot}
                            isAudioAutopilotRunning={isAudioAutopilotRunning}
                            isMcpConnected={isMcpConnected}
                            activePipelineWork={activePipelineWork}
                            novelProgress={novelProgress}
                            audioAutopilotProgress={audioAutopilotProgress}
                            audioProgress={audioProgress}
                            setPipelineDisplayMode={setPipelineDisplayMode}
                        />

                        <main className={`flex-1 overflow-y-auto overflow-x-hidden ${view === 'reader' ? 'p-0 overflow-hidden' : 'p-4 md:p-8'}`}>
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
                                    jumpToReaderChapter={jumpToReaderChapter}
                                    goToNextReaderChapter={goToNextReaderChapter}
                                    goToPrevReaderChapter={goToPrevReaderChapter}
                                    readerSettings={readerSettings}
                                    updateReaderSetting={updateReaderSetting}
                                    readerPageIndex={readerPageIndex}
                                    readerPageIndexRef={readerPageIndexRef}
                                    readerTotalPages={readerTotalPages}
                                    readerContainerWidth={readerContainerWidth}
                                    readingProgress={readingProgress}
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
                                    jumpToReaderScene={jumpToReaderScene}
                                    goToNextReaderScene={goToNextReaderScene}
                                    setView={setView}
                                    ttsStatus={ttsStatus}
                                    ttsProgress={ttsProgress}
                                    ttsStatusMessage={ttsStatusMessage}
                                    ttsActiveDevice={ttsActiveDevice}
                                    ttsError={ttsError}
                                    setTtsError={setTtsError}
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
                                    playStoredOrLiveSceneAudio={playStoredOrLiveSceneAudio}
                                    playSceneAudio={playSceneAudio}
                                    ttsPlayingScene={ttsPlayingScene}
                                    ttsResolvedSource={ttsResolvedSource}
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
                                    inputWritingMode={inputWritingMode}
                                    setInputWritingMode={setInputWritingMode}
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
                                    initStory={initStory}
                                    handleAutopilot={handleAutopilot}
                                />
                            )}

                            {view === 'dashboard' && (
                                <DashboardView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    setStory={setStory}
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
                                    readingProgress={readingProgress}
                                    enterReaderMode={enterReaderMode}
                                    loading={loading}
                                    loadingStep={loadingStep}
                                    initializingStoryId={initializingStoryId}
                                    continuousAutopilot={continuousAutopilot}
                                    isRunningEditorialHarness={isRunningEditorialHarness}
                                    setEditorialScopeSceneId={setEditorialScopeSceneId}
                                    runAutonomousEditorialHarness={runAutonomousEditorialHarness}
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
                                    initStory={initStory}
                                    generateStoryArc={generateStoryArc}
                                    epistemicViewTab={epistemicViewTab}
                                    setEpistemicViewTab={setEpistemicViewTab}
                                    epistemicScrubberCoord={epistemicScrubberCoord}
                                    setEpistemicScrubberCoord={setEpistemicScrubberCoord}
                                    epistemicFilterChar={epistemicFilterChar}
                                    setEpistemicFilterChar={setEpistemicFilterChar}
                                    epistemicSearchQuery={epistemicSearchQuery}
                                    setEpistemicSearchQuery={setEpistemicSearchQuery}
                                    setEditingPropModal={setEditingPropModal}
                                    setEditingBeliefModal={setEditingBeliefModal}
                                    handleDeleteProposition={handleDeleteProposition}
                                    handleInvalidateBelief={handleInvalidateBelief}
                                    retroactivelyInjectClue={retroactivelyInjectClue}
                                    openEditModal={openEditModal}
                                    openFormModal={openFormModal}
                                    requestConfirm={requestConfirm}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'cast' && (
                                <CastView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    storyRef={storyRef}
                                    setStory={setStory}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loadedImages={loadedImages}
                                    portraitLoading={portraitLoading}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    isAuditioningVoice={isAuditioningVoice}
                                    openEditModal={openEditModal}
                                    openFormModal={openFormModal}
                                    showToast={showToast}
                                    findCastIndexForChar={findCastIndexForChar}
                                    commitVoiceEditUpdate={commitVoiceEditUpdate}
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
                                    setStory={setStory}
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
                                    scenesByAct={scenesByAct}
                                    isDraggingLoreTab={isDraggingLoreTab}
                                    setIsDraggingLoreTab={setIsDraggingLoreTab}
                                    ragStatus={ragStatus}
                                    isRebuildingRag={isRebuildingRag}
                                    rebuildRagIndex={rebuildRagIndex}
                                    handlePostGenLoreImport={handlePostGenLoreImport}
                                    ingestLore={ingestLore}
                                    handleDeleteLore={handleDeleteLore}
                                    openEditModal={openEditModal}
                                    openFormModal={openFormModal}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'relationships' && (
                                <RelationshipsView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    setStory={setStory}
                                    isInspectorMode={isInspectorMode}
                                    selectedSequence={selectedSequence}
                                    selectedScene={selectedScene}
                                    loadedImages={loadedImages}
                                    matrixView={matrixView}
                                    setMatrixView={setMatrixView}
                                    matrixScroll={matrixScroll}
                                    matrixScrollRef={matrixScrollRef}
                                    measureMatrixScroll={measureMatrixScroll}
                                    selectedRel={selectedRel}
                                    setSelectedRel={setSelectedRel}
                                    selectMatrixRelationship={selectMatrixRelationship}
                                    openFormModal={openFormModal}
                                    requestConfirm={requestConfirm}
                                    showToast={showToast}
                                />
                            )}

                            {view === 'directive' && (
                                <DirectiveView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    setStory={setStory}
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
                                    directivePlanPhase={directivePlanPhase}
                                    directivePlan={directivePlan}
                                    setDirectivePlan={setDirectivePlan}
                                    directivePlanHistory={directivePlanHistory}
                                    setDirectivePlanHistory={setDirectivePlanHistory}
                                    directiveRefinement={directiveRefinement}
                                    setDirectiveRefinement={setDirectiveRefinement}
                                    expandedDirectiveActions={expandedDirectiveActions}
                                    setExpandedDirectiveActions={setExpandedDirectiveActions}
                                    directiveExecutionLogs={directiveExecutionLogs}
                                    setDirectiveExecutionLogs={setDirectiveExecutionLogs}
                                    directiveProgress={directiveProgress}
                                    directiveUndoSnapshot={directiveUndoSnapshot}
                                    setDirectiveUndoSnapshot={setDirectiveUndoSnapshot}
                                    runDirectivePlanner={runDirectivePlanner}
                                    restorePreviousDirectivePlan={restorePreviousDirectivePlan}
                                    executeDirectivePlan={executeDirectivePlan}
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
                                    runAutonomousEditorialHarness={runAutonomousEditorialHarness}
                                    revertAllHarnessTransactions={revertAllHarnessTransactions}
                                    executeSingleHarnessTransaction={executeSingleHarnessTransaction}
                                    revertHarnessTransaction={revertHarnessTransaction}
                                    novelIgnoreDraftRule={novelIgnoreDraftRule}
                                    setNovelIgnoreDraftRule={setNovelIgnoreDraftRule}
                                    handleAddNovelIgnoreRule={handleAddNovelIgnoreRule}
                                    handleRemoveNovelIgnoreRule={handleRemoveNovelIgnoreRule}
                                    editorialToolName={editorialToolName}
                                    setEditorialToolName={setEditorialToolName}
                                    editorialToolArgs={editorialToolArgs}
                                    setEditorialToolArgs={setEditorialToolArgs}
                                    editorialToolOutput={editorialToolOutput}
                                    handleRunHarnessInspectorTool={handleRunHarnessInspectorTool}
                                />
                            )}

                            {(view === 'structure' || view === 'sequence_dashboard' || view === 'chapter_dashboard') && (
                                <StructureView
                                    view={view}
                                    setView={setView}
                                    story={story}
                                    setStory={setStory}
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
                                    getSceneProseText={getSceneProseText}
                                    getSceneAudioStatus={getSceneAudioStatus}
                                    availableSceneAudioMap={availableSceneAudioMap}
                                    availableSequenceAudioMap={availableSequenceAudioMap}
                                    isAnyAudioPlaying={isAnyAudioPlaying}
                                    isExportingSceneAudio={isExportingSceneAudio}
                                    isExportingSequenceAudio={isExportingSequenceAudio}
                                    isExportingStoryAudio={isExportingStoryAudio}
                                    enterReaderMode={enterReaderMode}
                                    generateActsAndSequences={generateActsAndSequences}
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
                                sceneBlueprintDraft={sceneBlueprintDraft}
                                setSceneBlueprintDraft={setSceneBlueprintDraft}
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
                                loadedImages={loadedImages}
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
                                getSceneAudioStatus={getSceneAudioStatus}
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
                                runAutonomousEditorialHarness={runAutonomousEditorialHarness}
                                setEditorialScopeSceneId={setEditorialScopeSceneId}
                                handleRunManualSlopClean={handleRunManualSlopClean}
                                handleAddStoryAllowlistItem={handleAddStoryAllowlistItem}
                                handleRemoveStoryAllowlistItem={handleRemoveStoryAllowlistItem}
                                openEditModal={openEditModal}
                                openCritiqueModal={openCritiqueModal}
                                showToast={showToast}
                            />

                            {view === 'logs' && (
                                <LogsView
                                    promptLog={promptLog}
                                    setPromptLog={setPromptLog}
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
                                inspectedStepId={inspectedStepId}
                                setInspectedStepId={setInspectedStepId}
                                pipelineViewMode={pipelineViewMode}
                                setPipelineViewMode={setPipelineViewMode}
                                pipelineDisplayMode={pipelineDisplayMode}
                                setPipelineDisplayMode={setPipelineDisplayMode}
                                activePipelineWork={activePipelineWork}
                                promptLog={promptLog}
                                continuousAutopilot={continuousAutopilot}
                                handleAutopilot={handleAutopilot}
                                toggleContinuousAutopilot={toggleContinuousAutopilot}
                                novelProgress={novelProgress}
                                audioProgress={audioProgress}
                                isAudioAutopilotRunning={isAudioAutopilotRunning}
                                isAudioAutopilotQueued={isAudioAutopilotQueued}
                                audioAutopilotProgress={audioAutopilotProgress}
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
                                    ragTestResults={ragTestResults}
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
                                    handleDeleteLibraryStory={handleDeleteLibraryStory}
                                    handleDuplicateStory={handleDuplicateStory}
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
                                showOtherApiKeys={showOtherApiKeys}
                                setShowOtherApiKeys={setShowOtherApiKeys}
                                savedModels={savedModels}
                                saveModel={saveModel}
                                deleteModel={deleteModel}
                                modelSearchQuery={modelSearchQuery}
                                setModelSearchQuery={setModelSearchQuery}
                                isSearchingModels={isSearchingModels}
                                searchResults={searchResults}
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
                                reviewSearchResults={reviewSearchResults}
                                isReviewModelDropdownOpen={isReviewModelDropdownOpen}
                                setIsReviewModelDropdownOpen={setIsReviewModelDropdownOpen}
                                proseProvider={proseProvider}
                                setProseProvider={setProseProvider}
                                proseModel={proseModel}
                                setProseModel={setProseModel}
                                proseModelSearchQuery={proseModelSearchQuery}
                                setProseModelSearchQuery={setProseModelSearchQuery}
                                isSearchingProseModels={isSearchingProseModels}
                                proseSearchResults={proseSearchResults}
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
                                fetchGeminiImageModels={fetchGeminiImageModels}
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
                                customModes={customModes}
                                editingModeId={editingModeId}
                                newModeId={newModeId}
                                setNewModeId={setNewModeId}
                                newModeContext={newModeContext}
                                setNewModeContext={setNewModeContext}
                                newModeIcon={newModeIcon}
                                newModePrompt={newModePrompt}
                                setNewModePrompt={setNewModePrompt}
                                setIsIconPickerOpen={setIsIconPickerOpen}
                                handleStartEditCustomMode={handleStartEditCustomMode}
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
                                ttsActiveDevice={ttsActiveDevice}
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
                                handleResetStoryStage={handleResetStoryStage}
                                handleDeleteStory={handleDeleteStory}
                                showToast={showToast}
                            />
                        </main>
                        {/* TOAST NOTIFICATION */}
                        <ToastNotification toast={toast} theme={theme} position={view === 'reader' && ttsIsMiniPlayerVisible && !toast?.bookCard ? 'top' : 'bottom'} onDismiss={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null); }} />
                    </div >
                    {/* GLOBAL EDIT MODAL */}
                    <EditModal
                        isOpen={editingState.isOpen}
                        title={editingState.title}
                        value={editingState.value}
                        onConfirm={editingState.onConfirm}
                        onCancel={() => setEditingState(prev => ({ ...prev, isOpen: false }))}
                    />
                    {/* INTERVENTION MODAL */}
                    <InterventionModal
                        isOpen={interventionState.isOpen}
                        tierName={interventionState.tierName}
                        deviationReasons={interventionState.deviationReasons}
                        rawOutput={interventionState.rawOutput}
                        onResolve={interventionState.onResolve}
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
                        onConfirm={confirmModalState.onConfirm}
                        onSecondary={confirmModalState.onSecondary}
                        onCancel={confirmModalState.onCancel}
                    />
                    {/* CUSTOM EDITORIAL FORM MODAL */}
                    <StudioFormModal
                        isOpen={formModalState.isOpen}
                        title={formModalState.title}
                        subtitle={formModalState.subtitle}
                        fields={formModalState.fields}
                        submitLabel={formModalState.submitLabel}
                        cancelLabel={formModalState.cancelLabel}
                        onSubmit={formModalState.onSubmit}
                        onCancel={formModalState.onCancel}
                    />
                    <GesmPropositionModal
                        editingPropModal={editingPropModal}
                        setEditingPropModal={setEditingPropModal}
                        handleSaveProposition={handleSaveProposition}
                    />
                    <GesmBeliefModal
                        editingBeliefModal={editingBeliefModal}
                        setEditingBeliefModal={setEditingBeliefModal}
                        handleSaveBelief={handleSaveBelief}
                        story={story}
                    />
                    <IconPickerModal
                        isIconPickerOpen={isIconPickerOpen}
                        setIsIconPickerOpen={setIsIconPickerOpen}
                        newModeIcon={newModeIcon}
                        setNewModeIcon={setNewModeIcon}
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
            if (!window.reactRoot) {
                window.reactRoot = ReactDOM.createRoot(container);
            }
            window.reactRoot.render(<EllipsisProsef />);
        })();
