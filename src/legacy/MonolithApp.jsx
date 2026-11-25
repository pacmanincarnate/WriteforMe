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
import { useDebounce, useModelCatalog, useReaderController, useStoryImages } from '@/hooks';
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
            const [libraryStories, setLibraryStories] = useState([]);

            const [story, setStoryRaw] = useState(() => createDefaultStoryTemplate(activeStoryId));
            const storyRef = useRef(story);
            storyRef.current = story;
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

            // Helper to list stories and update library metadata state
            const refreshLibrary = async () => {
                try {
                    let list = [];
                    try {
                        list = await storyStore.listStories();
                    } catch (idbErr) {
                        console.warn("Failed to read from IndexedDB, falling back to active story.", idbErr);
                    }

                    // Filter out legacy "current_story" to keep library clean
                    let filtered = list.filter(s => s.id !== 'current_story');

                    // Always ensure the currently active story is in the list
                    const activeInMemStory = storyRef.current || story;
                    if (activeInMemStory && activeInMemStory.id) {
                        const exists = filtered.find(s => s.id === activeInMemStory.id);
                        if (!exists) {
                            filtered.push({
                                id: activeInMemStory.id,
                                data: activeInMemStory,
                                timestamp: Date.now()
                            });
                        } else {
                            // Update it with the latest in-memory data just in case
                            exists.data = activeInMemStory;
                        }
                    }

                    setLibraryStories(filtered);

                    // Fetch cover images and saved offline audio scene counts for the library
                    const covers = {};
                    const audioCounts = {};
                    for (const item of filtered) {
                        try {
                            const coverData = await imageStore.getImage(`cover_${item.id}`);
                            if (coverData) {
                                covers[item.id] = coverData;
                            }
                        } catch (err) {
                            console.warn("Failed to load cover for", item.id, err);
                        }
                        if (window.audioStore && typeof window.audioStore.countStoryAudio === 'function') {
                            try {
                                audioCounts[item.id] = await window.audioStore.countStoryAudio(item.id);
                            } catch (err) {
                                console.warn("Failed to count saved audio for", item.id, err);
                            }
                        }
                    }
                    setLibraryCovers(covers);
                    setLibraryAudioCounts(audioCounts);
                } catch (e) {
                    console.warn("Failed to update library list:", e);
                }
            };

            // Declared here because the library effect below reads it; with native const this is a TDZ otherwise.
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

            // Fetch library when viewing library or activeStoryId changes
            useEffect(() => {
                if (view === 'library') {
                    refreshLibrary();
                }
            }, [view, activeStoryId]);

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

            // Story Library Extended State
            const [librarySearchQuery, setLibrarySearchQuery] = useState("");
            const [libraryCovers, setLibraryCovers] = useState({});
            const [libraryAudioCounts, setLibraryAudioCounts] = useState({});
            const [libraryViewMode, setLibraryViewMode] = useState(() => localStorage.getItem("ellipsisprose_library_view_mode") || 'grid');
            const [librarySortBy, setLibrarySortBy] = useState(() => localStorage.getItem("ellipsisprose_library_sort_by") || 'recent');
            const isInitialMount = useRef(true);

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_library_view_mode", libraryViewMode);
            }, [libraryViewMode]);

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_library_sort_by", librarySortBy);
            }, [librarySortBy]);


            // Helper to cycle/update typographic cover style on blank covers
            const handleUpdateStoryCoverStyle = async (storyId, nextStyleIdx) => {
                try {
                    const fullStory = await storyStore.loadStory(storyId);
                    if (fullStory) {
                        fullStory.coverStyle = nextStyleIdx;
                        await storyStore.saveStory(storyId, fullStory);
                        if (activeStoryId === storyId) {
                            setStory(prev => ({ ...prev, coverStyle: nextStyleIdx }));
                        }
                        await refreshLibrary();
                    }
                } catch (e) {
                    console.error("Failed to update cover style", e);
                }
            };

            // Helper to duplicate a story (scenario branching)
            const handleDuplicateStory = async (storyItem) => {
                if (!storyItem || !storyItem.data) return;
                try {
                    const original = storyItem.data;
                    const newId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                    const cloned = JSON.parse(JSON.stringify(original));
                    cloned.id = newId;
                    cloned.title = `${cloned.title || "Untitled"} (Copy)`;
                    await storyStore.saveStory(newId, cloned);
                    try {
                        const existingCover = await imageStore.getImage(`cover_${storyItem.id}`);
                        if (existingCover) {
                            await imageStore.saveImage(`cover_${newId}`, existingCover);
                        }
                        const sourcePortraits = await imageStore.getImagesByPrefix(`portrait_${storyItem.id}_`);
                        for (const p of sourcePortraits) {
                            if (p && p.dataUrl) {
                                const charSuffix = p.id.slice(`portrait_${storyItem.id}_`.length);
                                await imageStore.saveImage(`portrait_${newId}_${charSuffix}`, p.dataUrl);
                            }
                        }
                    } catch (coverErr) {
                        console.warn("Cover/portrait copy skipped:", coverErr);
                    }
                    try {
                        if (window.audioStore) {
                            const audioRecords = await window.audioStore.getAllStoryAudioRecords(storyItem.id);
                            for (const rec of audioRecords) {
                                await window.audioStore.saveSceneAudio({
                                    storyId: newId,
                                    seqIdx: rec.seqIdx,
                                    sceneIdx: rec.sceneIdx,
                                    blob: rec.blob,
                                    mimeType: rec.mimeType,
                                    durationSec: rec.durationSec,
                                    textHash: rec.textHash,
                                    cueCount: rec.cueCount
                                });
                            }
                            if (typeof window.audioStore.getAllStorySequenceAudioRecords === 'function') {
                                const seqAudioRecords = await window.audioStore.getAllStorySequenceAudioRecords(storyItem.id);
                                for (const srec of seqAudioRecords) {
                                    await window.audioStore.saveSequenceAudio({
                                        storyId: newId,
                                        seqIdx: srec.seqIdx,
                                        blob: srec.blob,
                                        mimeType: srec.mimeType,
                                        durationSec: srec.durationSec,
                                        includedSceneIndices: srec.includedSceneIndices,
                                        totalScenesInStructure: srec.totalScenesInStructure,
                                        sceneHashes: srec.sceneHashes
                                    });
                                }
                            }
                        }
                    } catch (audioCopyErr) {
                        console.warn("Audio copy skipped on story duplication:", audioCopyErr);
                    }
                    await refreshLibrary();
                    showToast(`Duplicated as "${cloned.title}"`, "success");
                } catch (err) {
                    console.error("Failed to duplicate story:", err);
                    showToast("Failed to duplicate story: " + err.message, "error");
                }
            };

            // Helper to delete an individual story from the library
            const handleDeleteLibraryStory = async (storyItem, e) => {
                if (e) e.stopPropagation();
                if (!storyItem || !storyItem.id) return;
                const storyTitle = storyItem.data?.title || "Untitled Story";

                requestConfirm({
                    title: `Permanently delete "${storyTitle}"?`,
                    message: "This will erase this story's configuration, characters, outline, and generated prose from your library. This action cannot be undone.",
                    confirmLabel: "Delete Story",
                    danger: true,
                    onConfirm: async () => {
                        try {
                            const deletedId = storyItem.id;
                            deletedStoryIdsRef.current.add(deletedId);
                            await storyStore.deleteStory(deletedId);
                            await logStore.clearLogs(deletedId);
                            try {
                                await imageStore.deleteImage(`cover_${deletedId}`);
                            } catch (imgErr) {
                                console.warn("Cover deletion skipped:", imgErr);
                            }
                            try {
                                if (window.audioStore) await window.audioStore.deleteStoryAudio(deletedId);
                            } catch (audioDelErr) {
                                console.warn("Story audio deletion skipped:", audioDelErr);
                            }

                            if (activeStoryId === deletedId) {
                                const allStories = await storyStore.listStories();
                                const validRemaining = allStories.filter(s => s.id !== 'current_story' && s.id !== deletedId);
                                if (validRemaining.length > 0) {
                                    validRemaining.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                                    const nextStory = validRemaining[0];
                                    setActiveStoryId(nextStory.id);
                                    setStory(nextStory.data);
                                    localStorage.setItem("ellipsisprose_active_story_id", nextStory.id);
                                } else {
                                    const defaultTemplate = createDefaultStoryTemplate('story_default');
                                    setActiveStoryId('story_default');
                                    setStory(defaultTemplate);
                                    localStorage.setItem("ellipsisprose_active_story_id", 'story_default');
                                    await storyStore.saveStory('story_default', defaultTemplate);
                                }
                            }

                            await refreshLibrary();
                            showToast(`Deleted "${storyTitle}"`, "success");
                        } catch (err) {
                            console.error("Failed to delete story:", err);
                            showToast("Failed to delete story: " + err.message, "error");
                        }
                    }
                });
            };
            // Settings & Model Catalog Hook
            const [isDirectingVoices, setIsDirectingVoices] = useState(false);
            const [isMcpConnected, setIsMcpConnected] = useState(false);
            const [enableMcpBridge, setEnableMcpBridge] = useState(() => {
                try {
                    return localStorage.getItem("ellipsisprose_enable_mcp_bridge") === 'true';
                } catch (e) {
                    return false;
                }
            });
            const [mcpRetryTrigger, setMcpRetryTrigger] = useState(0);

            useEffect(() => {
                try {
                    localStorage.setItem("ellipsisprose_enable_mcp_bridge", String(enableMcpBridge));
                } catch (e) {}
            }, [enableMcpBridge]);

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

            // Custom Narrative Modes State
            const [customModes, setCustomModes] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_custom_modes");
                return saved ? JSON.parse(saved) : {};
            });
            const [editingModeId, setEditingModeId] = useState(null);
            const [newModeId, setNewModeId] = useState("");
            const [newModeContext, setNewModeContext] = useState("");
            const [newModePrompt, setNewModePrompt] = useState("");
            const [newModeIcon, setNewModeIcon] = useState("tag");
            const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

            // Master Toggle for Narrative Lenses (defaults to true so narrative styles actively shape scene drafting)
            const [enableNarrativeLenses, setEnableNarrativeLenses] = useState(() => {
                const v2 = localStorage.getItem("ellipsisprose_enable_narrative_lenses_v2");
                if (v2 !== null) return v2 === "true";
                return true;
            });


            const [bannedPhrases, setBannedPhrases] = useState(() => {
                try {
                    const saved = localStorage.getItem("ellipsisprose_banned_phrases");
                    return saved ? JSON.parse(saved) : DEFAULT_BANNED_PHRASES;
                } catch (_) {
                    return DEFAULT_BANNED_PHRASES;
                }
            });
            const [slopConfig, setSlopConfig] = useState(() => {
                try {
                    const rawSlop = localStorage.getItem("ellipsisprose_slop_config_v1");
                    const rawLegacy = localStorage.getItem("ellipsisprose_banned_phrases");
                    const parsedSlop = rawSlop ? JSON.parse(rawSlop) : null;
                    const parsedLegacy = rawLegacy ? JSON.parse(rawLegacy) : null;
                    if (typeof window.normalizeSlopConfig === 'function') {
                        return window.normalizeSlopConfig(parsedSlop, parsedLegacy);
                    }
                } catch (err) {
                    console.warn("Failed loading slopConfig, using defaults:", err);
                }
                return typeof window.normalizeSlopConfig === 'function'
                    ? window.normalizeSlopConfig(null, DEFAULT_BANNED_PHRASES)
                    : { schemaVersion: 1, enableSlopAudit: true, enableUpstreamNameAudit: true, emDashMode: 'density', emDashMaxPer1k: 3, categorySeverities: { smart_quotes: 'off', custom_user: 'flag' }, customItemsByCategory: { custom_user: [] }, removedDefaultItems: {}, importedPack: null, importedPackMeta: null };
            });
            const [newBannedPhraseInput, setNewBannedPhraseInput] = useState("");
            const [slopSearchQuery, setSlopSearchQuery] = useState("");
            const [expandedSlopGroups, setExpandedSlopGroups] = useState({ prose_style: true, names_places: false, patterns_rhythm: false, custom: true });
            const [expandedSlopCategories, setExpandedSlopCategories] = useState({ custom_user: true });
            const [newCategoryItemInputs, setNewCategoryItemInputs] = useState({});
            const [slopAuditDrawerOpen, setSlopAuditDrawerOpen] = useState(false);
            const [slopAuditFilter, setSlopAuditFilter] = useState('all'); // 'all' | 'hard' | 'flag' | 'closer' | 'rhetoric'
            const [isRunningManualSlopClean, setIsRunningManualSlopClean] = useState(false);
            const [slopAllowlistExpanded, setSlopAllowlistExpanded] = useState(false);

            const handleAddBannedPhrase = () => {
                const val = newBannedPhraseInput.trim();
                if (!val) return;
                if (bannedPhrases.some(p => p.toLowerCase() === val.toLowerCase())) {
                    showToast(`"${val}" is already in custom phrases.`, "info");
                    return;
                }
                setBannedPhrases(prev => [...prev, val]);
                setSlopConfig(prev => {
                    const existing = Array.isArray(prev?.customItemsByCategory?.custom_user) ? prev.customItemsByCategory.custom_user : [];
                    if (existing.some(p => p.toLowerCase() === val.toLowerCase())) return prev;
                    return {
                        ...prev,
                        customItemsByCategory: {
                            ...(prev?.customItemsByCategory || {}),
                            custom_user: [...existing, val]
                        }
                    };
                });
                setNewBannedPhraseInput("");
                showToast(`Added "${val}" to custom phrases.`, "success");
            };

            const handleSetSlopCategorySeverity = (catId, severity) => {
                if (!['hard', 'flag', 'off'].includes(severity)) return;
                setSlopConfig(prev => ({
                    ...prev,
                    categorySeverities: {
                        ...(prev?.categorySeverities || {}),
                        [catId]: severity
                    }
                }));
            };

            const handleAddSlopCategoryItem = (catId, rawVal) => {
                const val = String(rawVal || '').trim();
                if (!val) return;
                const valLow = val.toLowerCase();
                if (catId === 'custom_user') {
                    setBannedPhrases(prev => prev.some(p => p.toLowerCase() === valLow) ? prev : [...prev, val]);
                }
                setSlopConfig(prev => {
                    const customList = Array.isArray(prev?.customItemsByCategory?.[catId]) ? prev.customItemsByCategory[catId] : [];
                    const removedList = Array.isArray(prev?.removedDefaultItems?.[catId]) ? prev.removedDefaultItems[catId] : [];
                    const nextRemoved = removedList.filter(x => x.toLowerCase() !== valLow);
                    const nextCustom = customList.some(x => x.toLowerCase() === valLow) ? customList : [...customList, val];
                    return {
                        ...prev,
                        customItemsByCategory: { ...(prev?.customItemsByCategory || {}), [catId]: nextCustom },
                        removedDefaultItems: { ...(prev?.removedDefaultItems || {}), [catId]: nextRemoved }
                    };
                });
                setNewCategoryItemInputs(prev => ({ ...prev, [catId]: '' }));
                showToast(`Added "${val}" to ${catId.replace(/_/g, ' ')}.`, "success");
            };

            const handleRemoveSlopCategoryItem = (catId, itemText) => {
                const targetLow = String(itemText || '').trim().toLowerCase();
                if (!targetLow) return;
                if (catId === 'custom_user') {
                    setBannedPhrases(prev => prev.filter(p => p.toLowerCase() !== targetLow));
                }
                setSlopConfig(prev => {
                    const customList = Array.isArray(prev?.customItemsByCategory?.[catId]) ? prev.customItemsByCategory[catId] : [];
                    const nextCustom = customList.filter(x => x.toLowerCase() !== targetLow);
                    const removedList = Array.isArray(prev?.removedDefaultItems?.[catId]) ? prev.removedDefaultItems[catId] : [];
                    const isBuiltIn = Boolean(window.AI_SLOP_REGISTRY?.categories?.find(c => c.id === catId)?.items?.some(i => i.toLowerCase() === targetLow));
                    const nextRemoved = isBuiltIn && !removedList.some(x => x.toLowerCase() === targetLow)
                        ? [...removedList, itemText]
                        : removedList;
                    return {
                        ...prev,
                        customItemsByCategory: { ...(prev?.customItemsByCategory || {}), [catId]: nextCustom },
                        removedDefaultItems: { ...(prev?.removedDefaultItems || {}), [catId]: nextRemoved }
                    };
                });
            };

            const handleResetSlopConfig = () => {
                const reset = typeof window.normalizeSlopConfig === 'function'
                    ? window.normalizeSlopConfig(null, DEFAULT_BANNED_PHRASES)
                    : { ...window.DEFAULT_SLOP_CONFIG, _migratedLegacy: true };
                setSlopConfig(reset);
                setBannedPhrases(DEFAULT_BANNED_PHRASES);
                showToast("Restored default AI Slop & Naming configuration.", "info");
            };

            const handleImportSlopJson = async (file) => {
                if (!file) return;
                try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    const validation = typeof window.validateImportedSlopJson === 'function'
                        ? window.validateImportedSlopJson(parsed)
                        : { valid: true };
                    if (!validation.valid) {
                        showToast(validation.error || "Invalid ai-slop JSON file.", "error");
                        return;
                    }
                    setSlopConfig(prev => ({
                        ...(prev || window.DEFAULT_SLOP_CONFIG),
                        importedPack: parsed,
                        importedPackMeta: {
                            name: parsed.name || file.name,
                            version: parsed.version || '',
                            importedAt: Date.now(),
                            categoryCount: (parsed.categories || []).length
                        }
                    }));
                    showToast(`Imported slop dictionary "${parsed.name || file.name}" (${(parsed.categories || []).length} categories).`, "success");
                } catch (err) {
                    showToast(`Failed to import slop JSON: ${err.message}`, "error");
                }
            };

            const handleExportSlopJson = () => {
                try {
                    const payload = typeof window.exportSlopConfigAsJson === 'function'
                        ? window.exportSlopConfigAsJson(slopConfig)
                        : slopConfig;
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ellipsisprose-ai-slop-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    showToast("Exported AI Slop dictionary JSON.", "success");
                } catch (err) {
                    showToast(`Export failed: ${err.message}`, "error");
                }
            };

            const handleAddStoryAllowlistItem = (term) => {
                const clean = String(term || '').trim();
                if (!clean) return;
                setStory(prev => {
                    const existing = Array.isArray(prev.slop_allowlist) ? prev.slop_allowlist : [];
                    if (existing.some(x => x.toLowerCase() === clean.toLowerCase())) return prev;
                    const next = { ...prev, slop_allowlist: [...existing, clean] };
                    if (storyStore?.saveStory && next.id) {
                        storyStore.saveStory(next.id, next).catch(() => {});
                    }
                    return next;
                });
                showToast(`Allowed "${clean}" in this story.`, "info");
            };

            const handleRemoveStoryAllowlistItem = (term) => {
                const targetLow = String(term || '').trim().toLowerCase();
                setStory(prev => {
                    const existing = Array.isArray(prev.slop_allowlist) ? prev.slop_allowlist : [];
                    const next = { ...prev, slop_allowlist: existing.filter(x => x.toLowerCase() !== targetLow) };
                    if (storyStore?.saveStory && next.id) {
                        storyStore.saveStory(next.id, next).catch(() => {});
                    }
                    return next;
                });
            };

            const allNarrativeModes = useMemo(() => ({
                ...NARRATIVE_MODES,
                ...customModes
            }), [customModes]);

            const getModeIcon = (modeId) => {
                const modeObj = allNarrativeModes[modeId];
                if (modeObj && modeObj.icon) {
                    return modeObj.icon;
                }
                return NARRATIVE_MODE_ICONS[modeId] || "tag";
            };

            const allNarrativeModesXml = useMemo(() => {
                let xml = `<narrative_modes>\n`;
                Object.values(allNarrativeModes).forEach(mode => {
                    xml += `  <mode>\n`;
                    xml += `    <id>${mode.id}</id>\n`;
                    xml += `    <context>${mode.context}</context>\n`;
                    xml += `  </mode>\n`;
                });
                xml += `</narrative_modes>`;
                return xml;
            }, [allNarrativeModes]);

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
            const [novelIgnoreDraftRule, setNovelIgnoreDraftRule] = useState({ rule_type: 'ALLOW_PHRASE', pattern: '', scope: 'GLOBAL', reason: 'Intentional stylistic choice' });

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

            // --- AUDIO DRAMA MULTI-VOICE ENGINE STATE & SETTINGS ---
            const [audioDramaSettings, setAudioDramaSettings] = useState(() => {
                try {
                    const saved = localStorage.getItem("ellipsisprose_audio_drama_settings");
                    if (saved) {
                        return migrateAudioDramaSettings(JSON.parse(saved));
                    }
                    return DEFAULT_AUDIO_DRAMA_SETTINGS;
                } catch (e) {
                    return DEFAULT_AUDIO_DRAMA_SETTINGS;
                }
            });

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_audio_drama_settings", JSON.stringify(audioDramaSettings));
            }, [audioDramaSettings]);
            const audioDramaSettingsRef = useRef(audioDramaSettings);
            audioDramaSettingsRef.current = audioDramaSettings;

            const sessionTtsTierCapRef = useRef(null);
            const ttsProbeCacheRef = useRef(null);


            const updateAudioDramaSetting = (key, val) => {
                if (key === 'pipelineTier' || key === 'backend' || key === 'studioBridgeUrl' || key === 'endpoint') {
                    sessionTtsTierCapRef.current = null;
                    ttsProbeCacheRef.current = null;
                }
                setAudioDramaSettings(prev => {
                    const next = { ...prev, [key]: val };
                    if (key === 'pipelineTier') {
                        const tierIdx = Number(val);
                        const tierObj = (typeof TTS_PIPELINE_TIERS !== 'undefined' && TTS_PIPELINE_TIERS[tierIdx]) || null;
                        if (tierObj) next.backend = tierObj.id;
                    } else if (key === 'backend') {
                        next.pipelineTier = val === 'system' ? 0 : (val === 'kokoro' || val === 'browser') ? 1 : val === 'breeze' ? 2 : 3;
                    }
                    audioDramaSettingsRef.current = next;
                    return next;
                });
            };

            const [audioDramaActiveSpeaker, setAudioDramaActiveSpeaker] = useState(null);
            const [audioDramaActiveEmotion, setAudioDramaActiveEmotion] = useState(null);
            const [isAudioDramaModeActive, setIsAudioDramaModeActive] = useState(false);
            const [isAuditioningVoice, setIsAuditioningVoice] = useState(false);
            const [auditioningTarget, setAuditioningTarget] = useState(null);
            const auditionAudioRef = useRef(null);
            const auditionBlobUrlRef = useRef(null);
            const auditionSessionIdRef = useRef(0);
            const voiceInvalidationPromiseRef = useRef(Promise.resolve());

            // Audio Drama Scene Audio Store state & continuous playback tracking
            const [availableSceneAudioMap, setAvailableSceneAudioMap] = useState({});
            const availableSceneAudioMapRef = useRef(availableSceneAudioMap);
            availableSceneAudioMapRef.current = availableSceneAudioMap;
            const [availableSequenceAudioMap, setAvailableSequenceAudioMap] = useState({});
            const [isAudioAutopilotRunning, setIsAudioAutopilotRunning] = useState(false);
            const [isAudioAutopilotQueued, setIsAudioAutopilotQueued] = useState(false);
            const isAudioAutopilotRunningRef = useRef(false);
            const isAudioAutopilotQueuedRef = useRef(false);
            const audioAutopilotAbortRef = useRef(null);
            useEffect(() => { isAudioAutopilotRunningRef.current = isAudioAutopilotRunning; }, [isAudioAutopilotRunning]);
            useEffect(() => { isAudioAutopilotQueuedRef.current = isAudioAutopilotQueued; }, [isAudioAutopilotQueued]);

            const [audioPlaybackScope, setAudioPlaybackScope] = useState('story'); // Default continuous story playback
            const audioPlaybackScopeRef = useRef('story');
            useEffect(() => { audioPlaybackScopeRef.current = audioPlaybackScope; }, [audioPlaybackScope]);

            const [isPlayingMasterSceneMp3, setIsPlayingMasterSceneMp3] = useState(false);
            const isPlayingMasterSceneMp3Ref = useRef(false);
            useEffect(() => { isPlayingMasterSceneMp3Ref.current = isPlayingMasterSceneMp3; }, [isPlayingMasterSceneMp3]);
            const currentMasterAudioBlobUrlRef = useRef(null);

            const [ttsPlayingScene, setTtsPlayingScene] = useState(null);
            const ttsPlayingSceneRef = useRef(null);
            const [ttsResolvedSource, setTtsResolvedSource] = useState(null);
            const ttsResolvedSourceRef = useRef(null);
            const [isFollowingAudio, setIsFollowingAudio] = useState(true);
            const isFollowingAudioRef = useRef(true);
            const [returnToAudioNonce, setReturnToAudioNonce] = useState(0);

            const refreshAvailableSceneAudio = useCallback(async (targetStoryId = (storyRef.current || story)?.id) => {
                if (!targetStoryId || !window.audioStore) return;
                try {
                    const metaList = await window.audioStore.listStoryAudioMeta(targetStoryId);
                    const activeIdAfterMeta = (storyRef.current || story)?.id;
                    if (activeIdAfterMeta && activeIdAfterMeta !== targetStoryId) return;
                    const map = {};
                    (metaList || []).forEach(m => {
                        map[`${m.seqIdx}-${m.sceneIdx}`] = m;
                    });
                    availableSceneAudioMapRef.current = map;
                    setAvailableSceneAudioMap(map);

                    if (typeof window.audioStore.listStorySequenceAudioMeta === 'function') {
                        const seqMetaList = await window.audioStore.listStorySequenceAudioMeta(targetStoryId);
                        const activeIdAfterSeq = (storyRef.current || story)?.id;
                        if (activeIdAfterSeq && activeIdAfterSeq !== targetStoryId) return;
                        const seqMap = {};
                        (seqMetaList || []).forEach(m => {
                            seqMap[String(m.seqIdx)] = m;
                        });
                        setAvailableSequenceAudioMap(seqMap);
                    }
                } catch (err) {
                    console.warn('[AudioStore] Failed to list story audio meta:', err);
                }
            }, [story?.id]);

            useEffect(() => {
                if (story?.id) {
                    refreshAvailableSceneAudio(story.id);
                } else {
                    availableSceneAudioMapRef.current = {};
                    setAvailableSceneAudioMap({});
                    setAvailableSequenceAudioMap({});
                }
            }, [story?.id, refreshAvailableSceneAudio]);

            // Shared Helpers: Scene Prose Extraction, Audio Readiness Status (Ready / Stale / None) & Summary
            const getSceneProseText = useCallback((storyObj, seqIdx, sceneIdx) => {
                const sObj = storyObj || storyRef.current || story;
                if (!sObj || !sObj.prose) return "";
                const raw = sObj.prose[`${seqIdx}-${sceneIdx}`];
                if (!raw) return "";
                const str = typeof raw === 'string' ? raw : (raw.final || raw.draft || raw.text || raw.content || "");
                return typeof str === 'string' ? str.trim() : "";
            }, [story]);

            const isStoredSceneAudioFresh = useCallback((metaOrRecord, proseText, storyObj = story, settingsObj = audioDramaSettings) => {
                if (!metaOrRecord) return { fresh: false, reason: 'missing' };
                const cleanProse = String(proseText || '').trim();
                if (metaOrRecord.textHash && cleanProse && typeof computeSceneProseHash === 'function') {
                    const currentHash = computeSceneProseHash(cleanProse);
                    if (currentHash && metaOrRecord.textHash !== currentHash) {
                        return { fresh: false, reason: 'prose_changed' };
                    }
                }
                if (storyObj?.audio_cast_updated_at && metaOrRecord.updatedAt && Number(metaOrRecord.updatedAt) < Number(storyObj.audio_cast_updated_at)) {
                    return { fresh: false, reason: 'voice_changed' };
                }
                if (metaOrRecord.voiceSigHash && typeof computeSceneVoiceSignatureHash === 'function') {
                    const curVoiceSig = computeSceneVoiceSignatureHash(cleanProse, storyObj, settingsObj);
                    if (curVoiceSig && metaOrRecord.voiceSigHash !== curVoiceSig) {
                        return { fresh: false, reason: 'voice_changed' };
                    }
                }
                return { fresh: true, reason: null };
            }, [story, audioDramaSettings]);

            const getSceneAudioStatus = useCallback((seqIdx, sceneIdx) => {
                const sId = `${seqIdx}-${sceneIdx}`;
                const meta = availableSceneAudioMap?.[sId];
                if (!meta) return { status: 'none', meta: null };
                const proseText = getSceneProseText(story, seqIdx, sceneIdx);
                const check = isStoredSceneAudioFresh(meta, proseText, story, audioDramaSettings);
                if (!check.fresh) {
                    return { status: 'stale', meta, reason: check.reason };
                }
                return { status: 'ready', meta };
            }, [availableSceneAudioMap, story, getSceneProseText, audioDramaSettings, isStoredSceneAudioFresh]);

            const storyAudioSummary = useMemo(() => {
                let readyCount = 0;
                let staleCount = 0;
                let totalDrafted = 0;
                let totalScenes = 0;
                const seqs = Array.isArray(story?.sequences) ? story.sequences : [];
                seqs.forEach((_, qIdx) => {
                    const scList = story?.scenes?.[`${qIdx}`] || story?.scenes?.[qIdx] || [];
                    (Array.isArray(scList) ? scList : []).forEach((__, sIdx) => {
                        totalScenes++;
                        const sId = `${qIdx}-${sIdx}`;
                        const proseText = getSceneProseText(story, qIdx, sIdx);
                        if (proseText) {
                            totalDrafted++;
                            const st = getSceneAudioStatus(qIdx, sIdx);
                            if (st.status === 'ready') readyCount++;
                            else if (st.status === 'stale') staleCount++;
                        } else if (availableSceneAudioMap?.[sId]) {
                            readyCount++;
                        }
                    });
                });
                return { readyCount, staleCount, totalDrafted, totalScenes };
            }, [story, availableSceneAudioMap, getSceneProseText, getSceneAudioStatus]);

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



            // --- KOKORO TTS ENGINE CONTROLLER & STREAMING AUDIO QUEUE ---
            const [ttsStatus, setTtsStatus] = useState('idle'); // 'idle' | 'loading-library' | 'loading-model' | 'initializing-hardware' | 'ready' | 'generating' | 'playing' | 'paused' | 'error'
            const isTtsBusyOrPlaying = ttsStatus === 'playing' || ttsStatus === 'generating' || ttsStatus === 'loading-library' || ttsStatus === 'loading-model' || ttsStatus === 'initializing-hardware';
            const isAnyAudioPlaying = isTtsBusyOrPlaying || isAuditioningVoice;
            const [ttsProgress, setTtsProgress] = useState(0);
            const [ttsStatusMessage, setTtsStatusMessage] = useState("");
            const [ttsActiveDevice, setTtsActiveDevice] = useState(null); // 'wasm' | 'webgpu' | 'webnn-npu'
            const [ttsError, setTtsError] = useState(null);
            const [ttsIsMiniPlayerVisible, setTtsIsMiniPlayerVisible] = useState(false);
            const [ttsQueue, setTtsQueue] = useState([]);
            const [ttsCurrentChunkIndex, setTtsCurrentChunkIndex] = useState(0);
            const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
            const [ttsDuration, setTtsDuration] = useState(0);
            const [ttsGeneratingElapsedSec, setTtsGeneratingElapsedSec] = useState(0);
            const [isExportingSceneAudio, setIsExportingSceneAudio] = useState(false);
            const [isExportingSequenceAudio, setIsExportingSequenceAudio] = useState(false);
            const [isExportingStoryAudio, setIsExportingStoryAudio] = useState(false);
            const [isRegeneratingSceneAudio, setIsRegeneratingSceneAudio] = useState(false);

            const ttsWorkerRef = useRef(null);
            const ttsAudioRef = useRef(null);
            const ttsQueueRef = useRef([]);
            const ttsCurrentChunkIndexRef = useRef(0);
            const isAudioDramaModeActiveRef = useRef(false);
            const ttsSuppressSceneEffectRef = useRef(false);
            const ttsPendingRequestsRef = useRef(new Set());
            const ttsAbortControllersRef = useRef(new Map());
            const ttsSessionIdRef = useRef(0);
            const ttsAutoPlayNextRef = useRef(false);
            const ttsWatchdogRef = useRef(null);
            const ttsAwaitedChunkRef = useRef(null);
            const ttsCadenceTimerRef = useRef(null);

            // Refs are the single source of truth for async callbacks (Promises, timers, audio events).
            // ttsQueueRef is written ONLY by setTtsQueueAndRef (never re-synced from render state), so a
            // re-render (e.g. the elapsed-seconds ticker) can never overwrite it with an older queue snapshot.
            useEffect(() => { ttsCurrentChunkIndexRef.current = ttsCurrentChunkIndex; }, [ttsCurrentChunkIndex]);
            useEffect(() => { ttsStatusRef.current = ttsStatus; }, [ttsStatus]);
            useEffect(() => { isAudioDramaModeActiveRef.current = isAudioDramaModeActive; }, [isAudioDramaModeActive]);

            // Live elapsed seconds counter while synthesizing audio so users see active progress
            useEffect(() => {
                if (ttsStatus !== 'generating') {
                    setTtsGeneratingElapsedSec(0);
                    return;
                }
                setTtsGeneratingElapsedSec(0);
                const interval = setInterval(() => {
                    setTtsGeneratingElapsedSec(prev => prev + 1);
                }, 1000);
                return () => clearInterval(interval);
            }, [ttsStatus, ttsCurrentChunkIndex]);

            // Helper: compute next queue state synchronously against ttsQueueRef.current
            // so synchronous readers in Promises/timers always see the latest queue immediately.
            const setTtsQueueAndRef = (valOrFn) => {
                const next = typeof valOrFn === 'function' ? valOrFn(ttsQueueRef.current) : valOrFn;
                ttsQueueRef.current = next;
                setTtsQueue(next);
            };
            const setTtsCurrentChunkIndexAndRef = (val) => {
                ttsCurrentChunkIndexRef.current = val;
                setTtsCurrentChunkIndex(val);
            };
            const setTtsStatusAndRef = (val) => {
                ttsStatusRef.current = val;
                setTtsStatus(val);
            };
            const setIsAudioDramaModeActiveAndRef = (val) => {
                isAudioDramaModeActiveRef.current = val;
                setIsAudioDramaModeActive(val);
            };

            // Aborts in-flight HTTP synthesis requests (optionally preserving a specific target chunk index)
            // and resets aborted chunks from 'loading' back to 'idle' so they never deadlock.
            const abortPendingTtsRequests = (keepChunkIdx = null) => {
                const abortedIndices = [];
                ttsAbortControllersRef.current.forEach((ctrl, idx) => {
                    if (keepChunkIdx !== null && idx === keepChunkIdx) return;
                    try { ctrl.abort(); } catch (e) { }
                    ttsAbortControllersRef.current.delete(idx);
                    ttsPendingRequestsRef.current.delete(idx);
                    abortedIndices.push(idx);
                });
                ttsPendingRequestsRef.current.forEach(idx => {
                    if (keepChunkIdx !== null && idx === keepChunkIdx) return;
                    ttsPendingRequestsRef.current.delete(idx);
                    abortedIndices.push(idx);
                });
                if (abortedIndices.length > 0 && Array.isArray(ttsQueueRef.current) && ttsQueueRef.current.length > 0) {
                    setTtsQueueAndRef(prev => prev.map((c, idx) => (
                        abortedIndices.includes(idx) && !c.audioUrl
                            ? { ...c, status: 'idle' }
                            : c
                    )));
                }
            };

            const unlockBrowserAudioElement = () => {
                try {
                    if (window.AudioContext || window.webkitAudioContext) {
                        if (!window._ellipsisAudioCtx) {
                            window._ellipsisAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        }
                        if (window._ellipsisAudioCtx.state === 'suspended') {
                            window._ellipsisAudioCtx.resume().catch(() => { });
                        }
                    }
                } catch (e) { }

                try {
                    if (!ttsAudioRef.current) {
                        const primedAudio = new Audio();
                        primedAudio.preload = 'auto';
                        ttsAudioRef.current = primedAudio;
                    }
                    if (!window._ellipsisAudioUnlocked
                        && (!ttsAudioRef.current.src || ttsAudioRef.current.src === SILENT_WAV_DATA_URI)
                        && !isPlayingMasterSceneMp3Ref.current) {
                        ttsAudioRef.current.loop = true;
                        ttsAudioRef.current.src = SILENT_WAV_DATA_URI;
                        const p = ttsAudioRef.current.play();
                        if (p && typeof p.then === 'function') {
                            p.then(() => {
                                window._ellipsisAudioUnlocked = true;
                            }).catch(() => { });
                        }
                    }
                } catch (unlockErr) { }
            };

            // Dedicated generation watchdog that tracks the specific chunk being awaited.
            // Avoids the previous bug where lookahead calls overwrote window._ellipsisTtsTimeout,
            // resulting in mismatched chunkIdx comparisons that allowed hangs to sit indefinitely.
            const startTtsWatchdog = (awaitedIdx) => {
                if (ttsWatchdogRef.current) {
                    clearTimeout(ttsWatchdogRef.current);
                    ttsWatchdogRef.current = null;
                }
                ttsAwaitedChunkRef.current = awaitedIdx;
                const awaitedChunk = ttsQueueRef.current && ttsQueueRef.current[awaitedIdx];
                const curBackend = audioDramaSettings?.backend || 'hybrid';
                const isLocalHybridOrStudio = isAudioDramaModeActiveRef.current && (curBackend === 'hybrid' || curBackend === 'audiocpp');
                const isMultiTurnSeg = awaitedChunk?.engine === 'drama3_multi' || (Array.isArray(awaitedChunk?.turns) && awaitedChunk.turns.length > 1);
                // 600s for local Drama-3 1-2 min segment generation + cold model load; 180s for Breeze 2 / multi-turn fallback; 45s for single-line cloud.
                const timeoutMs = isMobileDevice()
                    ? (isMultiTurnSeg ? 120000 : 25000)
                    : (isLocalHybridOrStudio ? 600000 : ((curBackend === 'breeze' || isMultiTurnSeg) ? 180000 : 45000));

                // On mobile, show a "still working" heartbeat after 8s so the user knows it hasn't frozen
                if (isMobileDevice()) {
                    setTimeout(() => {
                        if (ttsStatusRef.current === 'generating' && ttsCurrentChunkIndexRef.current === awaitedIdx) {
                            setTtsStatusMessage("Neural synthesis in progress \u2014 this can take 10-20s on mobile...");
                        }
                    }, 8000);
                }

                ttsWatchdogRef.current = setTimeout(() => {
                    if (ttsStatusRef.current === 'generating' && ttsCurrentChunkIndexRef.current === awaitedIdx) {
                        // Guard: Audio Drama network backends (Hybrid/Drama-3, Breeze 2, Gemini, OpenRouter) are HTTP requests,
                        // not an in-browser Kokoro worker hang. Do not terminate worker or demote reader voice!
                        if (isAudioDramaModeActiveRef.current && curBackend !== 'browser' && curBackend !== 'kokoro') {
                            console.error(`Audio Drama backend timeout on chunk ${awaitedIdx} (${curBackend})`);
                            const ctrl = ttsAbortControllersRef.current.get(awaitedIdx);
                            if (ctrl) {
                                try { ctrl.abort(); } catch (e) { }
                                ttsAbortControllersRef.current.delete(awaitedIdx);
                            }
                            ttsPendingRequestsRef.current.delete(awaitedIdx);
                            setTtsQueueAndRef(prev => {
                                const nextQ = [...prev];
                                if (nextQ[awaitedIdx]) nextQ[awaitedIdx] = { ...nextQ[awaitedIdx], status: 'error' };
                                return nextQ;
                            });
                            setTtsStatusAndRef('error');
                            setTtsError(`Audio Drama synthesis timed out for ${(audioDramaSettings?.backend || 'audiocpp').toUpperCase()}. Verify your backend server or API connection.`);
                            return;
                        }

                        // Send a ping before declaring death
                        if (ttsWorkerRef.current) {
                            const pingTimeout = setTimeout(() => {
                                console.error(`TTS Generation watchdog timeout on chunk ${awaitedIdx} (device: ${isMobileDevice() ? 'mobile' : 'desktop'})`);

                                // If the worker died silently under memory pressure, kill the dead handle
                                if (ttsWorkerRef.current) {
                                    try { ttsWorkerRef.current.terminate(); } catch (e) { }
                                    ttsWorkerRef.current = null;
                                }

                                ttsPendingRequestsRef.current.delete(awaitedIdx);
                                setTtsQueueAndRef(prev => {
                                    const nextQ = [...prev];
                                    if (nextQ[awaitedIdx]) nextQ[awaitedIdx] = { ...nextQ[awaitedIdx], status: 'error' };
                                    return nextQ;
                                });

                                if (isMobileDevice() && readerSettings.ttsVoice !== 'system_native') {
                                    changeTtsVoice('system_native');
                                    setTtsError("Switched to System Voice (neural engine unavailable on this device)");
                                    setTtsStatusAndRef('error');
                                    if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[awaitedIdx]) {
                                        speakChunkWithSpeechSynthesis(awaitedIdx);
                                    } else {
                                        setTtsIsMiniPlayerVisible(false);
                                    }
                                } else {
                                    setTtsStatusAndRef('error');
                                    const msg = isMobileDevice()
                                        ? "Neural speech generation timed out on mobile. Tap 'Switch to System Voice' for instant playback."
                                        : "Audio generation timed out. Your device may be low on memory.";
                                    setTtsError(msg);
                                }
                            }, 3000);

                            const onPong = (e) => {
                                if (e.data?.type === 'pong') {
                                    clearTimeout(pingTimeout);
                                    // Worker is alive but slow, restart watchdog
                                    startTtsWatchdog(awaitedIdx);
                                }
                            };
                            ttsWorkerRef.current.addEventListener('message', onPong, { once: true });
                            ttsWorkerRef.current.postMessage({ type: 'ping' });
                        }
                    }
                }, timeoutMs);
            };

            const clearTtsWatchdog = (resolvedIdx = null) => {
                if (resolvedIdx === null || resolvedIdx === ttsAwaitedChunkRef.current) {
                    if (ttsWatchdogRef.current) {
                        clearTimeout(ttsWatchdogRef.current);
                        ttsWatchdogRef.current = null;
                    }
                    ttsAwaitedChunkRef.current = null;
                }
            };

            useEffect(() => {
                return () => {
                    abortPendingTtsRequests();
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        try { window.speechSynthesis.cancel(); } catch (e) { }
                    }
                    if (ttsCadenceTimerRef.current) {
                        clearTimeout(ttsCadenceTimerRef.current);
                        ttsCadenceTimerRef.current = null;
                    }
                    if (ttsWatchdogRef.current) {
                        clearTimeout(ttsWatchdogRef.current);
                        ttsWatchdogRef.current = null;
                    }
                    if (currentMasterAudioBlobUrlRef.current) {
                    try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                    currentMasterAudioBlobUrlRef.current = null;
                }
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                if (ttsAudioRef.current) {
                        ttsAudioRef.current.pause();
                        ttsAudioRef.current = null;
                    }
                    if (ttsQueueRef.current) {
                        ttsQueueRef.current.forEach(c => {
                            if (c.audioUrl) try { URL.revokeObjectURL(c.audioUrl); } catch (e) { }
                        });
                    }
                    if (ttsWorkerRef.current) {
                        if (ttsWorkerRef.current._blobUrl) try { URL.revokeObjectURL(ttsWorkerRef.current._blobUrl); } catch (e) { }
                        ttsWorkerRef.current.terminate();
                        ttsWorkerRef.current = null;
                    }
                };
            }, []);

            // Native Web Speech API execution for mobile devices and instant 0MB fallback
            const speakChunkWithSpeechSynthesis = (chunkIdx) => {
                if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
                    setTtsStatusAndRef('error');
                    setTtsError("System speech synthesis is not supported on this browser.");
                    return;
                }
                const mySessionId = ttsSessionIdRef.current;
                try {
                    window.speechSynthesis.cancel();
                } catch (e) { }

                const q = ttsQueueRef.current;
                const chunk = q && q[chunkIdx];
                if (!chunk || !chunk.text) {
                    setTtsStatusAndRef('ready');
                    return;
                }

                const utterance = new SpeechSynthesisUtterance(chunk.text);
                const activeSpeed = readerSettingsRef.current?.ttsSpeed || window._ellipsisTtsPlaybackRate || 1.0;
                utterance.rate = Math.max(0.5, Math.min(2.0, Number(activeSpeed) || 1.0));

                try {
                    const voices = window.speechSynthesis.getVoices();
                    if (voices && voices.length > 0) {
                        const pref = voices.find(v => (v.lang.startsWith('en') || v.lang.startsWith('en-US')) && (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Enhanced') || v.name.includes('Google')))
                            || voices.find(v => v.lang.startsWith('en'))
                            || voices[0];
                        if (pref) utterance.voice = pref;
                    }
                } catch (vErr) { }

                utterance.onstart = () => {
                    if (mySessionId !== ttsSessionIdRef.current) return;
                    setTtsStatusAndRef('playing');
                    setTtsError(null);
                    setTtsCurrentChunkIndexAndRef(chunkIdx);
                    setAudioDramaActiveSpeaker(chunk.speaker || null);
                    setAudioDramaActiveEmotion(chunk.emotion || null);
                    setTtsCurrentTime(0);
                    setTtsDuration(Math.max(1, Math.round(chunk.text.length / 15)));
                };

                utterance.onend = () => {
                    if (mySessionId !== ttsSessionIdRef.current) return;
                    const nextIdx = chunkIdx + 1;
                    if (nextIdx < ttsQueueRef.current.length) {
                        setTtsCurrentChunkIndexAndRef(nextIdx);
                        speakChunkWithSpeechSynthesis(nextIdx);
                    } else {
                        const activeSc = ttsPlayingSceneRef.current;
                        advanceToNextAudioScene(
                            activeSc ? activeSc.seqIdx : selectedSequence,
                            activeSc ? activeSc.sceneIdx : selectedScene,
                            'live'
                        );
                    }
                };

                utterance.onerror = (uErr) => {
                    if (mySessionId !== ttsSessionIdRef.current) return;
                    if (uErr.error === 'interrupted' || uErr.error === 'canceled') return;
                    console.error("SpeechSynthesis utterance error:", uErr);
                    setTtsStatusAndRef('error');
                    setTtsError("System speech error: " + (uErr.error || 'unknown'));
                };

                window.speechSynthesis.speak(utterance);
            };

            const getOrCreateTtsWorker = () => {
                if (ttsWorkerRef.current) return ttsWorkerRef.current;
                try {
                    const worker = createKokoroWorker();
                    worker.onmessage = (e) => {
                        // Audio drama chunks synthesized via synthesizeAudioDramaChunk have IDs starting with 'ad_'
                        if (e.data?.id && String(e.data.id).startsWith('ad_')) return;

                        const { type, payload, error, status, progress, message, device } = e.data || {};
                        if (type === 'status') {
                            setTtsStatusAndRef(status);
                            if (typeof progress === 'number') setTtsProgress(progress);
                            if (message) setTtsStatusMessage(message);
                        } else if (type === 'progress') {
                            if (typeof progress === 'number') setTtsProgress(progress);
                            if (message) setTtsStatusMessage(message);
                        } else if (type === 'pong') {
                            // Worker responded to health check ping
                        } else if (type === 'ready') {
                            window._ellipsisKokoroModelReady = true;
                            window._ellipsisKokoroInitializing = false;
                            setTtsProgress(100);
                            setTtsActiveDevice(device || 'wasm');
                            setTtsStatusMessage(message || `Kokoro TTS ready (${(device || 'wasm').toUpperCase()})`);
                            setTtsError(null);
                            if (ttsAutoPlayNextRef.current) {
                                setTtsStatusAndRef('generating');
                                setTtsStatusMessage("Synthesizing audio...");
                                // Engine just loaded — now safe to request audio generation
                                const idx = ttsCurrentChunkIndexRef.current;
                                requestChunkAudio(idx);
                                primeLookaheadBuffer(idx);
                            } else {
                                setTtsStatusAndRef('ready');
                            }
                        } else if (type === 'chunk_audio') {
                            const { chunkIndex, wavBuffer } = payload || {};
                            clearTtsWatchdog(chunkIndex);
                            ttsPendingRequestsRef.current.delete(chunkIndex);
                            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                            const audioUrl = URL.createObjectURL(blob);

                            setTtsQueueAndRef(prev => {
                                const nextQ = [...prev];
                                if (nextQ[chunkIndex]) {
                                    nextQ[chunkIndex] = {
                                        ...nextQ[chunkIndex],
                                        audioUrl,
                                        blob,
                                        status: 'ready'
                                    };
                                }
                                return nextQ;
                            });

                            if (chunkIndex === ttsCurrentChunkIndexRef.current &&
                                (ttsStatusRef.current === 'generating' || ttsAutoPlayNextRef.current) &&
                                !ttsCadenceTimerRef.current) {
                                ttsAutoPlayNextRef.current = false;
                                playAudioChunk(chunkIndex, audioUrl);
                            }
                        } else if (type === 'error') {
                            window._ellipsisKokoroInitializing = false;
                            clearTtsWatchdog();
                            console.error("Kokoro TTS Worker error:", error);
                            const fallbackIdx = ttsCurrentChunkIndexRef.current;
                            if (isMobileDevice() && readerSettings.ttsVoice !== 'system_native') {
                                changeTtsVoice('system_native');
                                setTtsError("Switched to System Voice (neural engine unavailable on this device)");
                                setTtsStatusAndRef('error');
                                // Only attempt speech synthesis fallback if the queue has content for this chunk
                                if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[fallbackIdx]) {
                                    speakChunkWithSpeechSynthesis(fallbackIdx);
                                } else {
                                    setTtsIsMiniPlayerVisible(false);
                                }
                            } else {
                                setTtsError(error || "Kokoro TTS inference error");
                                setTtsStatusAndRef('error');
                            }
                        }
                    };
                    worker.onerror = (wErr) => {
                        window._ellipsisKokoroInitializing = false;
                        clearTtsWatchdog();
                        console.error("Worker lifecycle error:", wErr);
                        if (isMobileDevice() && readerSettings.ttsVoice !== 'system_native') {
                            changeTtsVoice('system_native');
                            setTtsError("Switched to System Voice (neural engine unavailable on this device)");
                            setTtsStatusAndRef('error');
                            const fallbackIdx = ttsCurrentChunkIndexRef.current;
                            if (ttsQueueRef.current.length > 0 && ttsQueueRef.current[fallbackIdx]) {
                                speakChunkWithSpeechSynthesis(fallbackIdx);
                            } else {
                                setTtsIsMiniPlayerVisible(false);
                            }
                        } else {
                            const msg = (wErr && wErr.message) ? wErr.message : "TTS Worker error. If running directly from file://, consider using a local server (e.g. node server.js or Live Server).";
                            setTtsError(msg);
                            setTtsStatusAndRef('error');
                        }
                    };
                    ttsWorkerRef.current = worker;
                    return worker;
                } catch (err) {
                    console.error("Failed to create Kokoro Worker:", err);
                    setTtsError(err.message || "Worker initialization failed");
                    setTtsStatusAndRef('error');
                    return null;
                }
            };

            const initTtsEngine = async (forceDevice = null) => {
                if (readerSettings.ttsVoice === 'system_native') {
                    setTtsError(null);
                    setTtsActiveDevice('system');
                    setTtsProgress(100);
                    setTtsStatusMessage("System Voice ready (Device Native)");
                    setTtsStatusAndRef('ready');
                    return true;
                }

                const targetDevice = forceDevice || getBestTtsDevice();
                const tier = getDeviceCapabilityTier();
                const targetDtype = (tier === 'mobile-constrained') ? 'q4' : (readerSettings.ttsDtype || 'q8');

                // To prevent wasting storage (e.g., leaving an 86MB q8 model on an iPhone when switching to q4),
                // we detect dtype changes and wipe the old cache before proceeding.
                if (typeof window !== 'undefined' && window.localStorage) {
                    const lastDtype = window.localStorage.getItem('kokoro_last_dtype');
                    if (lastDtype !== targetDtype) {
                        try { await clearKokoroModelCache(); } catch (e) { }
                        window.localStorage.setItem('kokoro_last_dtype', targetDtype);
                    }
                }

                setTtsError(null);
                setTtsStatusAndRef('loading-library');
                setTtsProgress(5);
                setTtsStatusMessage("Initializing Kokoro ML environment...");

                const worker = getOrCreateTtsWorker();
                if (!worker) return false;

                worker.postMessage({
                    type: 'init',
                    payload: {
                        modelId: "onnx-community/Kokoro-82M-v1.0-ONNX",
                        dtype: targetDtype,
                        device: targetDevice,
                        voice: readerSettings.ttsVoice || 'af_heart'
                    }
                });
                return true;
            };

            if (typeof window !== 'undefined') {
                window._ellipsisGetOrCreateTtsWorker = getOrCreateTtsWorker;
                window._ellipsisInitTtsEngine = initTtsEngine;
            }

            const resolveLiveTtsTier = async (desiredTierOverride = null) => {
                const s = audioDramaSettingsRef.current || DEFAULT_AUDIO_DRAMA_SETTINGS;
                let tier = typeof desiredTierOverride === 'number'
                    ? desiredTierOverride
                    : (typeof s.pipelineTier === 'number'
                        ? s.pipelineTier
                        : (s.backend === 'system' ? 0 : (s.backend === 'kokoro' || s.backend === 'browser') ? 1 : s.backend === 'breeze' ? 2 : 3));

                const TIER_NAMES = { 3: 'Drama-3', 2: 'Breeze 2', 1: 'Kokoro', 0: 'Device Voice' };
                const desiredTier = tier;
                let demotedFrom = null;
                let demotedFromLabel = null;

                if (typeof sessionTtsTierCapRef.current === 'number' && sessionTtsTierCapRef.current < tier) {
                    demotedFrom = desiredTier;
                    demotedFromLabel = TIER_NAMES[desiredTier] || 'Selected Engine';
                    tier = sessionTtsTierCapRef.current;
                }

                if (tier >= 2) {
                    const bridgeUrl = String(s.studioBridgeUrl || 'http://127.0.0.1:5020').replace(/\/+$/, '');
                    const isLocalhost = /:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(bridgeUrl);

                    if (isMobileDevice() && isLocalhost) {
                        demotedFrom = demotedFrom ?? desiredTier;
                        demotedFromLabel = demotedFromLabel || TIER_NAMES[desiredTier];
                        tier = 1;
                        sessionTtsTierCapRef.current = 1;
                    } else {
                        const now = Date.now();
                        let probe = ttsProbeCacheRef.current;
                        if (!probe || probe.url !== bridgeUrl || (now - probe.ts) > 15000) {
                            const ctrl = new AbortController();
                            const timer = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, 1200);
                            try {
                                const res = await fetch(`${bridgeUrl}/health`, { method: 'GET', signal: ctrl.signal });
                                clearTimeout(timer);
                                if (res.ok) {
                                    const data = await res.json().catch(() => ({}));
                                    probe = {
                                        url: bridgeUrl,
                                        ts: Date.now(),
                                        ok: true,
                                        availableWaves: Array.isArray(data?.available_waves) ? data.available_waves : null
                                    };
                                } else {
                                    probe = { url: bridgeUrl, ts: Date.now(), ok: false, availableWaves: null };
                                }
                            } catch (_) {
                                clearTimeout(timer);
                                probe = { url: bridgeUrl, ts: Date.now(), ok: false, availableWaves: null };
                            }
                            ttsProbeCacheRef.current = probe;
                        }

                        if (!probe.ok) {
                            demotedFrom = demotedFrom ?? desiredTier;
                            demotedFromLabel = demotedFromLabel || TIER_NAMES[desiredTier];
                            tier = 1;
                            sessionTtsTierCapRef.current = 1;
                        } else if (Array.isArray(probe.availableWaves)) {
                            if (tier === 3 && !probe.availableWaves.includes(2)) {
                                demotedFrom = demotedFrom ?? 3;
                                demotedFromLabel = demotedFromLabel || 'Drama-3';
                                tier = probe.availableWaves.includes(1) ? 2 : 1;
                                sessionTtsTierCapRef.current = tier;
                            }
                            if (tier === 2 && !probe.availableWaves.includes(1)) {
                                demotedFrom = demotedFrom ?? 2;
                                demotedFromLabel = demotedFromLabel || 'Breeze 2';
                                tier = 1;
                                sessionTtsTierCapRef.current = 1;
                            }
                        }
                    }
                }

                if (tier === 1 && isMobileDevice() && getDeviceCapabilityTier() === 'mobile-constrained') {
                    const hasOptedIn = typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('kokoro_opt_in') === 'true';
                    if (!hasOptedIn) {
                        demotedFrom = demotedFrom ?? desiredTier;
                        demotedFromLabel = demotedFromLabel || TIER_NAMES[tier];
                        tier = 0;
                    }
                }

                const tierObj = (typeof TTS_PIPELINE_TIERS !== 'undefined' && TTS_PIPELINE_TIERS[tier])
                    ? TTS_PIPELINE_TIERS[tier]
                    : { id: tier === 0 ? 'system' : tier === 1 ? 'kokoro' : tier === 2 ? 'breeze' : 'hybrid' };

                return {
                    tier,
                    backend: tierObj.id,
                    engineLabel: TIER_NAMES[tier] || 'Audio Engine',
                    demotedFrom,
                    demotedFromLabel
                };
            };

            const updateAwaitedChunkTelemetry = (chunkIdx, queueArr = null) => {
                const q = queueArr || ttsQueueRef.current;
                const targetChunk = q && q[chunkIdx];
                if (!targetChunk) return;
                const curBackend = targetChunk.resolvedBackend || ttsResolvedSourceRef.current?.backend || audioDramaSettingsRef.current?.backend || 'hybrid';
                if (targetChunk.speaker || targetChunk.engine === 'drama3_multi' || isAudioDramaModeActiveRef.current || curBackend === 'hybrid' || curBackend === 'breeze' || curBackend === 'audiocpp') {
                    const backendLabel = (curBackend === 'hybrid' || curBackend === 'audiocpp')
                        ? 'Drama-3'
                        : (curBackend === 'breeze' ? 'Breeze 2' : (curBackend === 'kokoro' || curBackend === 'browser' ? 'Kokoro' : 'Device Voice'));

                    if (targetChunk.engine === 'drama3_multi' && Array.isArray(targetChunk.turns)) {
                        const spkLabel = targetChunk.speaker || 'Narrator';
                        const estSec = targetChunk.estimatedDurationSec || Math.max(15, Math.round((targetChunk.wordCount || 60) / 2.1));
                        const metaLabel = `~${estSec}s \u2022 ${targetChunk.turns.length} lines`;
                        setAudioDramaActiveSpeaker(spkLabel);
                        setAudioDramaActiveEmotion(metaLabel);
                        setTtsStatusMessage(`Generating Segment ${chunkIdx + 1}/${q.length} (${metaLabel}) \u2014 ${spkLabel} (${backendLabel})...`);
                    } else {
                        const spkLabel = targetChunk.speaker || null;
                        setAudioDramaActiveSpeaker(spkLabel);
                        setAudioDramaActiveEmotion(targetChunk.emotion || null);
                        setTtsStatusMessage(`Generating ${chunkIdx + 1}/${q.length}${spkLabel ? ` \u2014 ${spkLabel}` : ''} (${backendLabel})...`);
                    }
                } else {
                    setTtsStatusMessage(`Synthesizing chunk ${chunkIdx + 1} of ${q.length}...`);
                }
            };

            const requestChunkAudio = (chunkIdx, directQueue = null, forceAutoPlay = false) => {
                const q = directQueue || ttsQueueRef.current;
                if (!q || !q[chunkIdx]) return;
                const targetChunk = q[chunkIdx];

                if (forceAutoPlay || (chunkIdx === ttsCurrentChunkIndexRef.current && ttsStatusRef.current === 'error')) {
                    setTtsError(null);
                    setTtsStatusAndRef('generating');
                    ttsAutoPlayNextRef.current = true;
                }

                // If audio blob URL is already synthesized and cached, play immediately if awaited
                if (targetChunk.audioUrl && !forceAutoPlay) {
                    if (chunkIdx === ttsCurrentChunkIndexRef.current &&
                        (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                        !ttsCadenceTimerRef.current) {
                        ttsAutoPlayNextRef.current = false;
                        playAudioChunk(chunkIdx, targetChunk.audioUrl);
                    }
                    return;
                }

                // If this chunk is already in flight, do not dispatch a duplicate request—just update telemetry/watchdog if awaited
                if (ttsPendingRequestsRef.current.has(chunkIdx)) {
                    if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                        updateAwaitedChunkTelemetry(chunkIdx, q);
                        startTtsWatchdog(chunkIdx);
                    }
                    return;
                }

                const reqSessionId = ttsSessionIdRef.current;
                const resolvedBackend = targetChunk.resolvedBackend || ttsResolvedSourceRef.current?.backend || audioDramaSettingsRef.current?.backend || 'hybrid';

                // Stop 0: Lightweight System Voices (Direct Web Speech API playback)
                if (resolvedBackend === 'system') {
                    speakChunkWithSpeechSynthesis(chunkIdx);
                    return;
                }

                // --- UNIFIED AUDIO DRAMA / NARRATIVE ENGINE SYNTHESIS PATH ---
                if (targetChunk.speaker || isAudioDramaModeActiveRef.current || resolvedBackend === 'hybrid' || resolvedBackend === 'audiocpp' || resolvedBackend === 'breeze') {
                    const abortCtrl = new AbortController();
                    ttsAbortControllersRef.current.set(chunkIdx, abortCtrl);
                    ttsPendingRequestsRef.current.add(chunkIdx);

                    setTtsQueueAndRef(prev => {
                        const nextQ = [...prev];
                        if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'loading' };
                        return nextQ;
                    });

                    if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                        updateAwaitedChunkTelemetry(chunkIdx, q);
                    }

                    const activeStoryForTts = storyRef.current || story;
                    synthesizeAudioDramaChunk({
                        chunk: targetChunk,
                        chunkIndex: chunkIdx,
                        totalChunks: q.length,
                        backend: resolvedBackend,
                        story: activeStoryForTts,
                        settings: audioDramaSettingsRef.current || audioDramaSettings,
                        mainApiKey: apiKey,
                        mainOpenRouterKey: openRouterKey,
                        kokoroWorkerRef: ttsWorkerRef,
                        signal: abortCtrl.signal
                    }).then(audioUrl => {
                        if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) {
                            if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) { } }
                            return;
                        }
                        clearTtsWatchdog(chunkIdx);
                        ttsAbortControllersRef.current.delete(chunkIdx);
                        ttsPendingRequestsRef.current.delete(chunkIdx);

                        setTtsQueueAndRef(prev => {
                            const nextQ = [...prev];
                            if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'ready', audioUrl };
                            return nextQ;
                        });

                        if (chunkIdx === ttsCurrentChunkIndexRef.current &&
                            (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                            !ttsCadenceTimerRef.current) {
                            ttsAutoPlayNextRef.current = false;
                            playAudioChunk(chunkIdx, audioUrl);
                        }
                    }).catch(async (err) => {
                        if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted || err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
                            ttsAbortControllersRef.current.delete(chunkIdx);
                            ttsPendingRequestsRef.current.delete(chunkIdx);
                            return;
                        }
                        const curBackend = resolvedBackend;
                        console.warn(`[Audio TTS] ${curBackend} failed on chunk ${chunkIdx}:`, err.message || err);

                        const BACKEND_TO_TIER = { 'hybrid': 3, 'audiocpp': 3, 'breeze': 2, 'kokoro': 1, 'browser': 1, 'system': 0 };
                        const TIER_LABELS = { 3: 'Drama-3', 2: 'Breeze 2', 1: 'Kokoro', 0: 'Device Voice' };
                        const FALLBACK_CHAIN = {
                            'hybrid': 'breeze',
                            'audiocpp': 'breeze',
                            'breeze': 'kokoro',
                            'kokoro': 'system',
                            'browser': 'system'
                        };

                        let fallbackBackend = FALLBACK_CHAIN[curBackend];
                        let fallbackSuccess = false;
                        let fallbackUrl = null;
                        let workingChunk = targetChunk;

                        while (fallbackBackend && !fallbackSuccess) {
                            if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) return;

                            const fbTier = BACKEND_TO_TIER[fallbackBackend] ?? 1;
                            const fbLabel = TIER_LABELS[fbTier] || fallbackBackend;
                            sessionTtsTierCapRef.current = Math.min(sessionTtsTierCapRef.current ?? 3, fbTier);

                            const nextSrc = {
                                ...(ttsResolvedSourceRef.current || {}),
                                mode: 'live',
                                tier: fbTier,
                                backend: fallbackBackend,
                                engineLabel: fbLabel
                            };
                            ttsResolvedSourceRef.current = nextSrc;
                            setTtsResolvedSource(nextSrc);

                            // Splice any multi-turn Drama-3 segment blocks from chunkIdx onward into individual turns for immediate playback
                            const latestQ = ttsQueueRef.current || [];
                            if (latestQ.some((c, i) => i >= chunkIdx && c?.engine === 'drama3_multi' && Array.isArray(c.turns) && c.turns.length > 0)) {
                                const expandedQ = [];
                                latestQ.forEach((item, idx) => {
                                    if (idx >= chunkIdx && item?.engine === 'drama3_multi' && Array.isArray(item.turns) && item.turns.length > 0) {
                                        item.turns.forEach((turn, tIdx) => {
                                            const resolvedSpoken = turn.cleanText || turn.spokenText || turn.text || '';
                                            expandedQ.push({
                                                ...turn,
                                                speaker: turn.speaker || 'Narrator',
                                                spokenText: resolvedSpoken,
                                                text: turn.text || resolvedSpoken,
                                                rawSpoken: turn.rawSpoken || turn.drama3Text || resolvedSpoken,
                                                breezeText: turn.breezeText || resolvedSpoken,
                                                seqIdx: item.seqIdx,
                                                sceneIdx: item.sceneIdx,
                                                resolvedTier: fbTier,
                                                resolvedBackend: fallbackBackend,
                                                status: 'idle',
                                                audioUrl: null,
                                                isContinuation: tIdx > 0 && turn.speaker === item.turns[tIdx - 1]?.speaker
                                            });
                                        });
                                    } else if (idx >= chunkIdx) {
                                        expandedQ.push({ ...item, resolvedTier: fbTier, resolvedBackend: fallbackBackend });
                                    } else {
                                        expandedQ.push(item);
                                    }
                                });
                                setTtsQueueAndRef(expandedQ);
                                workingChunk = expandedQ[chunkIdx] || workingChunk;
                            } else {
                                setTtsQueueAndRef(prev => prev.map((item, idx) => (
                                    idx >= chunkIdx ? { ...item, resolvedTier: fbTier, resolvedBackend: fallbackBackend } : item
                                )));
                                workingChunk = { ...workingChunk, resolvedTier: fbTier, resolvedBackend: fallbackBackend };
                            }

                            if (fallbackBackend === 'system') {
                                showToast(`${TIER_LABELS[BACKEND_TO_TIER[curBackend] ?? 1]} unavailable — switched to Device Voice.`, "info");
                                clearTtsWatchdog(chunkIdx);
                                ttsAbortControllersRef.current.delete(chunkIdx);
                                ttsPendingRequestsRef.current.delete(chunkIdx);
                                speakChunkWithSpeechSynthesis(chunkIdx);
                                return;
                            }

                            try {
                                showToast(`${TIER_LABELS[BACKEND_TO_TIER[curBackend] ?? 2] || 'Audio server'} unavailable — using ${fbLabel}`, "info");
                                fallbackUrl = await synthesizeAudioDramaChunk({
                                    chunk: workingChunk,
                                    chunkIndex: chunkIdx,
                                    totalChunks: (ttsQueueRef.current || q).length,
                                    backend: fallbackBackend,
                                    story: storyRef.current || story,
                                    settings: audioDramaSettingsRef.current || audioDramaSettings,
                                    mainApiKey: apiKey,
                                    mainOpenRouterKey: openRouterKey,
                                    kokoroWorkerRef: ttsWorkerRef,
                                    signal: abortCtrl.signal
                                });
                                if (fallbackUrl) {
                                    fallbackSuccess = true;
                                    break;
                                }
                            } catch (fbErr) {
                                console.warn(`[Audio TTS] Fallback to ${fallbackBackend} failed:`, fbErr);
                                fallbackBackend = FALLBACK_CHAIN[fallbackBackend];
                            }
                        }

                        if (fallbackSuccess && fallbackUrl) {
                            if (reqSessionId !== ttsSessionIdRef.current || abortCtrl.signal.aborted) {
                                if (fallbackUrl) { try { URL.revokeObjectURL(fallbackUrl); } catch (e) { } }
                                return;
                            }
                            clearTtsWatchdog(chunkIdx);
                            ttsAbortControllersRef.current.delete(chunkIdx);
                            ttsPendingRequestsRef.current.delete(chunkIdx);
                            setTtsQueueAndRef(prev => {
                                const nextQ = [...prev];
                                if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'ready', audioUrl: fallbackUrl };
                                return nextQ;
                            });
                            if (chunkIdx === ttsCurrentChunkIndexRef.current &&
                                (ttsAutoPlayNextRef.current || ttsStatusRef.current === 'generating') &&
                                !ttsCadenceTimerRef.current) {
                                ttsAutoPlayNextRef.current = false;
                                playAudioChunk(chunkIdx, fallbackUrl);
                            }
                            return;
                        }

                        clearTtsWatchdog(chunkIdx);
                        ttsAbortControllersRef.current.delete(chunkIdx);
                        ttsPendingRequestsRef.current.delete(chunkIdx);
                        const humanErr = getHumanReadableTtsError(err, curBackend, workingChunk);
                        setTtsQueueAndRef(prev => {
                            const nextQ = [...prev];
                            if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'error' };
                            return nextQ;
                        });
                        if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                            setTtsError(humanErr);
                            setTtsStatusAndRef('error');
                            showToast(humanErr.title, "warning");
                        }
                    });

                    if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                        startTtsWatchdog(chunkIdx);
                    }
                    return;
                }

                // --- STANDARD NARRATIVE PROSE (KOKORO WORKER) PATH ---
                const worker = getOrCreateTtsWorker();
                if (!worker) return;

                ttsPendingRequestsRef.current.add(chunkIdx);
                setTtsQueueAndRef(prev => {
                    const nextQ = [...prev];
                    if (nextQ[chunkIdx]) nextQ[chunkIdx] = { ...nextQ[chunkIdx], status: 'loading' };
                    return nextQ;
                });

                const selectedVoice = readerSettingsRef.current?.ttsVoice;
                const kokoroVoice = (!selectedVoice || selectedVoice === 'system_native') ? 'af_heart' : selectedVoice;

                worker.postMessage({
                    type: 'generate',
                    payload: {
                        chunkIndex: chunkIdx,
                        text: targetChunk.text,
                        voice: kokoroVoice,
                        speed: readerSettingsRef.current?.ttsSpeed || 1.0
                    }
                });

                if (chunkIdx === ttsCurrentChunkIndexRef.current) {
                    startTtsWatchdog(chunkIdx);
                }
            };

            const primeLookaheadBuffer = (centerIdx, directQueue = null) => {
                const resolvedBackend = ttsResolvedSourceRef.current?.backend;
                if (resolvedBackend === 'system' || (readerSettingsRef.current?.ttsVoice === 'system_native' && !isAudioDramaModeActiveRef.current && resolvedBackend !== 'kokoro')) return;
                // Crucial for mobile stability: On mobile (iOS/Android), disable multi-chunk lookahead.
                if (isMobileDevice()) return;
                const q = directQueue || ttsQueueRef.current;
                if (!q || centerIdx + 1 >= q.length) return;

                // Buffer 1 segment ahead for 1-2 minute Drama-3 segments, or 2 lines ahead for line-by-line engines.
                requestChunkAudio(centerIdx + 1, q);
                if (q[centerIdx]?.engine !== 'drama3_multi' && centerIdx + 2 < q.length) {
                    requestChunkAudio(centerIdx + 2, q);
                }
            };

            const playAudioChunk = (chunkIdx, directUrl = null) => {
                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }
                const q = ttsQueueRef.current;
                if (!q || !q[chunkIdx]) return;
                const chunk = q[chunkIdx];

                if ((chunk.resolvedBackend === 'system') || (ttsResolvedSourceRef.current?.backend === 'system') || (readerSettingsRef.current?.ttsVoice === 'system_native' && !isAudioDramaModeActiveRef.current && !chunk?.speaker && chunk.resolvedBackend !== 'kokoro')) {
                    speakChunkWithSpeechSynthesis(chunkIdx);
                    return;
                }

                const urlToPlay = directUrl || (chunk && chunk.audioUrl);

                if (!urlToPlay) {
                    setTtsStatusAndRef('generating');
                    ttsAutoPlayNextRef.current = true;
                    updateAwaitedChunkTelemetry(chunkIdx, q);
                    if (ttsPendingRequestsRef.current.has(chunkIdx)) {
                        startTtsWatchdog(chunkIdx);
                        return;
                    }
                    requestChunkAudio(chunkIdx);
                    return;
                }

                ttsAutoPlayNextRef.current = false;
                clearTtsWatchdog();
                if (ttsCurrentChunkIndexRef.current !== chunkIdx) {
                    setTtsCurrentChunkIndexAndRef(chunkIdx);
                }

                if (chunk && chunk.engine === 'drama3_multi' && Array.isArray(chunk.turns)) {
                    setAudioDramaActiveSpeaker(chunk.speaker || 'Narrator');
                    setAudioDramaActiveEmotion(chunk.estimatedDurationSec ? `~${chunk.estimatedDurationSec}s \u2022 ${chunk.turns.length} lines` : null);
                } else if (chunk && chunk.speaker) {
                    setAudioDramaActiveSpeaker(chunk.speaker);
                    setAudioDramaActiveEmotion(chunk.emotion || null);
                } else {
                    setAudioDramaActiveSpeaker(null);
                    setAudioDramaActiveEmotion(null);
                }

                let audio = ttsAudioRef.current;
                if (!audio) {
                    audio = new Audio();
                    audio.preload = 'auto';
                    ttsAudioRef.current = audio;
                }

                audio.loop = false;
                const speedVal = readerSettingsRef.current?.ttsSpeed || window._ellipsisTtsPlaybackRate || 1.0;
                audio.playbackRate = Number(speedVal) || 1.0;
                audio.src = urlToPlay;

                audio.ontimeupdate = () => {
                    setTtsCurrentTime(audio.currentTime);
                    if (Number.isFinite(audio.duration) && audio.duration > 0) {
                        setTtsDuration(audio.duration);
                    }
                };

                audio.onloadedmetadata = () => {
                    if (Number.isFinite(audio.duration) && audio.duration > 0) {
                        setTtsDuration(audio.duration);
                    }
                };

                audio.onended = () => {
                    if (isMobileDevice()) {
                        audio.loop = true;
                        audio.src = SILENT_WAV_DATA_URI;
                        audio.play().catch(() => { });
                    } else {
                        try { audio.pause(); } catch (e) { }
                    }

                    const latestQ = ttsQueueRef.current;
                    const nextIdx = chunkIdx + 1;
                    if (nextIdx < latestQ.length) {
                        setTtsCurrentChunkIndexAndRef(nextIdx);
                        ttsAutoPlayNextRef.current = true;

                        const nextChunk = latestQ[nextIdx];
                        if (nextChunk && !nextChunk.audioUrl && !ttsPendingRequestsRef.current.has(nextIdx)) {
                            requestChunkAudio(nextIdx, latestQ);
                        }

                        const isDrama = (chunk && chunk.speaker) || isAudioDramaModeActiveRef.current;
                        if (ttsCadenceTimerRef.current) {
                            clearTimeout(ttsCadenceTimerRef.current);
                            ttsCadenceTimerRef.current = null;
                        }

                        if (isDrama) {
                            const activeAdSettings = audioDramaSettingsRef.current || audioDramaSettings;
                            const isNarrator = !chunk || !chunk.speaker || chunk.speaker.toLowerCase() === 'narrator';
                            const basePauseMs = isNarrator
                                ? (typeof activeAdSettings.narratorPauseMs === 'number' ? Math.max(0, activeAdSettings.narratorPauseMs) : 440)
                                : (typeof activeAdSettings.dialoguePauseMs === 'number' ? Math.max(0, activeAdSettings.dialoguePauseMs) : 240);
                            const pauseMs = nextChunk?.isContinuation ? Math.min(120, basePauseMs) : basePauseMs;

                            ttsCadenceTimerRef.current = setTimeout(() => {
                                ttsCadenceTimerRef.current = null;
                                playAudioChunk(nextIdx);
                            }, pauseMs);
                        } else {
                            playAudioChunk(nextIdx);
                        }
                    } else {
                        ttsAutoPlayNextRef.current = false;
                        const activeSc = ttsPlayingSceneRef.current;
                        advanceToNextAudioScene(
                            activeSc ? activeSc.seqIdx : selectedSequence,
                            activeSc ? activeSc.sceneIdx : selectedScene,
                            'live'
                        );
                    }
                };

                audio.onerror = (e) => {
                    if (!audio.src || audio.src === 'about:blank' || audio.src === window.location.href) {
                        return;
                    }
                    console.error("Audio playback error on line", chunkIdx, e);
                    const nextIdx = chunkIdx + 1;
                    if (nextIdx < ttsQueueRef.current.length) {
                        showToast(`Playback issue on line ${chunkIdx + 1}. Continuing with next line...`, "info");
                        setTimeout(() => {
                            setTtsCurrentChunkIndexAndRef(nextIdx);
                            playAudioChunk(nextIdx);
                        }, 700);
                    } else {
                        const humanErr = getHumanReadableTtsError(new Error("Playback stream error"), ttsResolvedSourceRef.current?.backend || audioDramaSettingsRef.current?.backend || 'hybrid', chunk);
                        setTtsStatusAndRef('error');
                        setTtsError(humanErr);
                    }
                };

                audio.play().then(() => {
                    window._ellipsisAudioUnlocked = true;
                    setTtsStatusAndRef('playing');
                    setTtsError(null);
                    console.log(`[Audio TTS] Playing Chunk ${chunkIdx + 1}/${q.length} (${chunk?.speaker || 'Narrator'}).`);
                    primeLookaheadBuffer(chunkIdx, q);
                }).catch(playErr => {
                    console.warn("audio.play() paused/interrupted:", playErr);
                    setTtsStatusAndRef('paused');
                    if (playErr && playErr.name === 'NotAllowedError') {
                        showToast("Tap Play to resume listening", "info");
                    }
                });
            };

            const startTtsFromProse = async (proseText, startChunkIdx = 0, sceneOverride = null) => {
                // Unlock HTMLAudioElement and AudioContext synchronously if invoked from a click handler
                unlockBrowserAudioElement();
                stopAuditionPlayback();

                if (!proseText) {
                    showToast("This scene doesn't have any text written yet. Write or generate prose first to listen.", "info");
                    return;
                }
                let textToUse = proseText;
                if (typeof textToUse === 'object') {
                    textToUse = textToUse.final || textToUse.draft || textToUse.text || textToUse.content || "";
                }
                if (typeof textToUse !== 'string' || !textToUse.trim()) {
                    showToast("This scene doesn't have any text written yet. Write or generate prose first to listen.", "info");
                    return;
                }

                const targetSeq = typeof sceneOverride?.seqIdx === 'number' ? sceneOverride.seqIdx : (selectedSequence ?? 0);
                const targetSc = typeof sceneOverride?.sceneIdx === 'number' ? sceneOverride.sceneIdx : (selectedScene ?? 0);
                const myReqToken = ttsSessionIdRef.current + 1;
                ttsSessionIdRef.current = myReqToken;
                abortPendingTtsRequests();

                const resolved = sceneOverride?.resolvedTierInfo || await resolveLiveTtsTier();
                if (myReqToken !== ttsSessionIdRef.current) return;

                if (sceneOverride?.isAutoAdvance && sceneOverride?.prevSourceMode === 'stored') {
                    showToast(`Saved audio ended — continuing with live ${resolved.engineLabel} narration`, "info", { durationMs: 5500 });
                } else if (resolved.demotedFrom !== null && resolved.demotedFrom !== resolved.tier && !sceneOverride?.suppressDemoteToast) {
                    showToast(`${resolved.demotedFromLabel} unavailable — using ${resolved.engineLabel}`, "info", { durationMs: 4500 });
                }

                const currentStory = storyRef.current || story;
                const parsedDrama = parseAudioDramaScript(textToUse, { collapseNarrator: resolved.backend === 'breeze' });
                const hasExplicitCharacterDialogue = parsedDrama && parsedDrama.some(c => c.speaker && c.speaker.toLowerCase() !== 'narrator');
                const isDrama = (currentStory?.writing_mode === 'audio_drama') || (hasExplicitCharacterDialogue && parsedDrama.length >= 2);
                const sceneSeed = (typeof getDeterministicVoiceSeed === 'function')
                    ? getDeterministicVoiceSeed(`scene_${targetSeq}_${targetSc}`, currentStory)
                    : 42;

                let chunks = [];
                let turnsForVoiceRegistration = parsedDrama;
                if (isDrama && parsedDrama && parsedDrama.length > 0) {
                    if (resolved.tier === 3 && typeof chunkAudioDramaTurns === 'function') {
                        const rawTurns = parseAudioDramaScript(textToUse, { raw: true, collapseNarrator: false });
                        const baseTurns = (rawTurns && rawTurns.length > 0) ? rawTurns : parsedDrama;
                        turnsForVoiceRegistration = baseTurns;
                        chunks = chunkAudioDramaTurns(baseTurns, {
                            maxSpeakersPerChunk: 16,
                            sceneSeed
                        });
                    } else {
                        chunks = parsedDrama;
                    }
                    setIsAudioDramaModeActiveAndRef(true);
                } else {
                    if (resolved.tier === 3 && typeof window.chunkNovelProseForDrama3 === 'function') {
                        chunks = window.chunkNovelProseForDrama3(textToUse, { sceneSeed });
                        turnsForVoiceRegistration = chunks.flatMap(c => Array.isArray(c.turns) ? c.turns : [c]);
                    } else if (resolved.tier === 2) {
                        chunks = chunkProseForTts(textToUse).map(c => ({
                            ...c,
                            speaker: 'Narrator',
                            spokenText: c.text
                        }));
                        turnsForVoiceRegistration = chunks;
                    } else {
                        chunks = chunkProseForTts(textToUse);
                    }
                    setIsAudioDramaModeActiveAndRef(false);
                }

                if (!chunks || chunks.length === 0) return;

                chunks = chunks.map(c => ({
                    ...c,
                    seqIdx: targetSeq,
                    sceneIdx: targetSc,
                    resolvedTier: resolved.tier,
                    resolvedBackend: resolved.backend
                }));

                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }
                if (currentMasterAudioBlobUrlRef.current) {
                    try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                    currentMasterAudioBlobUrlRef.current = null;
                }
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                if (ttsAudioRef.current) {
                    ttsAudioRef.current.pause();
                    if (!isMobileDevice()) {
                        try { ttsAudioRef.current.removeAttribute('src'); } catch (e) { }
                    }
                }
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try { window.speechSynthesis.cancel(); } catch (e) { }
                }
                if (ttsWorkerRef.current) {
                    try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                }
                clearTtsWatchdog();
                ttsQueueRef.current.forEach(c => {
                    if (c.audioUrl) try { URL.revokeObjectURL(c.audioUrl); } catch (e) { }
                });
                ttsPendingRequestsRef.current.clear();

                const sourceMeta = {
                    mode: 'live',
                    tier: resolved.tier,
                    backend: resolved.backend,
                    engineLabel: resolved.engineLabel,
                    sceneKey: `${targetSeq}-${targetSc}`
                };
                ttsResolvedSourceRef.current = sourceMeta;
                setTtsResolvedSource(sourceMeta);

                const playingLoc = { seqIdx: targetSeq, sceneIdx: targetSc };
                ttsPlayingSceneRef.current = playingLoc;
                setTtsPlayingScene(playingLoc);

                const clampedStartIdx = Math.max(0, Math.min(chunks.length - 1, startChunkIdx || 0));
                setTtsQueueAndRef(chunks);
                setTtsCurrentChunkIndexAndRef(clampedStartIdx);
                setTtsCurrentTime(0);
                setTtsDuration(0);
                setTtsIsMiniPlayerVisible(true);
                setTtsError(null);

                if (isDrama || resolved.tier >= 2) {
                    const latestForReg = storyRef.current || currentStory;
                    const registeredStory = ensureAudioDramaVoicesRegistered(turnsForVoiceRegistration, latestForReg, setStory);
                    if (registeredStory && storyRef.current === latestForReg) {
                        storyRef.current = registeredStory;
                    }
                }

                if (resolved.tier === 0) {
                    setTtsStatusAndRef('playing');
                    setTtsActiveDevice('system');
                    setTtsStatusMessage("Using Device Voice");
                    speakChunkWithSpeechSynthesis(clampedStartIdx);
                    return;
                }

                const firstChunk = chunks[clampedStartIdx] || chunks[0];
                setAudioDramaActiveSpeaker(firstChunk?.speaker || null);
                setAudioDramaActiveEmotion(
                    firstChunk?.engine === 'drama3_multi' && firstChunk?.turns
                        ? `~${firstChunk.estimatedDurationSec || 60}s \u2022 ${firstChunk.turns.length} lines`
                        : (firstChunk?.emotion || null)
                );
                setTtsActiveDevice(resolved.backend);
                setTtsStatusAndRef('generating');
                ttsAutoPlayNextRef.current = true;

                if (resolved.tier === 1) {
                    if (!isDrama && isMobileDevice() && !window._ellipsisTtsMobileWarned) {
                        window._ellipsisTtsMobileWarned = true;
                        showToast("Kokoro TTS uses an ~85MB neural model. Fast Wi-Fi recommended on mobile.", "info");
                    }
                    getOrCreateTtsWorker();
                    if (!isDrama) {
                        if (!window._ellipsisKokoroModelReady && ttsStatusRef.current !== 'ready') {
                            setTtsStatusMessage("Initializing neural voice...");
                            initTtsEngine();
                        } else {
                            setTtsStatusMessage("Synthesizing audio...");
                            requestChunkAudio(clampedStartIdx, chunks);
                            primeLookaheadBuffer(clampedStartIdx, chunks);
                        }
                        return;
                    }
                }

                requestChunkAudio(clampedStartIdx, chunks);
            };

            const toggleTtsPlayPause = (proseOverride = null) => {
                // Ensure audio context and HTMLAudioElement playback permission are unlocked during user gesture
                unlockBrowserAudioElement();

                if (isAuditioningVoice) {
                    stopAllAudioPlayback();
                    return;
                }

                if (ttsStatus === 'playing') {
                    if (ttsCadenceTimerRef.current) {
                        clearTimeout(ttsCadenceTimerRef.current);
                        ttsCadenceTimerRef.current = null;
                    }
                    ttsAutoPlayNextRef.current = false;
                    if (ttsResolvedSourceRef.current?.backend === 'system' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        try { window.speechSynthesis.pause(); } catch (e) { }
                    }
                    if (ttsAudioRef.current) ttsAudioRef.current.pause();
                    setTtsStatusAndRef('paused');
                    return;
                }

                if (ttsStatus === 'paused') {
                    if (ttsResolvedSourceRef.current?.backend === 'system' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        try {
                            if (window.speechSynthesis.paused) {
                                window.speechSynthesis.resume();
                                setTtsStatusAndRef('playing');
                                return;
                            }
                        } catch (e) { }
                        speakChunkWithSpeechSynthesis(ttsCurrentChunkIndexRef.current);
                        return;
                    }

                    const audioEl = ttsAudioRef.current;
                    if (isPlayingMasterSceneMp3Ref.current && audioEl) {
                        audioEl.play().then(() => {
                            setTtsStatusAndRef('playing');
                        }).catch(() => { });
                        return;
                    }

                    const canResumeCurrentAudio = audioEl &&
                        audioEl.src &&
                        audioEl.src !== SILENT_WAV_DATA_URI &&
                        !audioEl.ended &&
                        audioEl.currentTime > 0 &&
                        (!audioEl.duration || audioEl.currentTime < audioEl.duration);

                    if (canResumeCurrentAudio) {
                        audioEl.play().then(() => {
                            setTtsStatusAndRef('playing');
                        }).catch(() => {
                            playAudioChunk(ttsCurrentChunkIndexRef.current);
                        });
                    } else {
                        playAudioChunk(ttsCurrentChunkIndexRef.current);
                    }
                    return;
                }

                if (ttsStatus === 'error' && ttsQueueRef.current && ttsQueueRef.current.length > 0 && !proseOverride) {
                    setTtsError(null);
                    playAudioChunk(ttsCurrentChunkIndexRef.current);
                    return;
                }

                if (ttsStatus === 'loading-library' || ttsStatus === 'loading-model' || ttsStatus === 'generating') {
                    stopTtsPlayback();
                    showToast("Playback canceled");
                    return;
                }

                // Idle/ready: ALWAYS check stored MP3 first for the resolved scene via unified playSceneAudio
                let targetSeq = selectedSequence ?? 0;
                let targetSc = selectedScene ?? 0;
                if (viewRef.current === 'reader' && readerSettingsRef.current?.readingMode === 'scroll' && visibleScrollSceneRef.current) {
                    targetSeq = visibleScrollSceneRef.current.seqIdx ?? targetSeq;
                    targetSc = visibleScrollSceneRef.current.sceneIdx ?? targetSc;
                }
                playSceneAudio(targetSeq, targetSc, { autoplay: true, follow: true });
            };

            const stopTtsPlayback = () => {
                ttsSessionIdRef.current += 1;
                abortPendingTtsRequests();

                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try { window.speechSynthesis.cancel(); } catch (e) { }
                }
                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }
                clearTtsWatchdog();
                if (currentMasterAudioBlobUrlRef.current) {
                    try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                    currentMasterAudioBlobUrlRef.current = null;
                }
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                if (ttsAudioRef.current) {
                    ttsAudioRef.current.loop = false;
                    ttsAudioRef.current.pause();
                    try {
                        ttsAudioRef.current.removeAttribute('src');
                        ttsAudioRef.current.load();
                    } catch (e) { }
                }
                if (ttsWorkerRef.current) {
                    try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                }
                ttsQueueRef.current.forEach(c => {
                    if (c.audioUrl) try { URL.revokeObjectURL(c.audioUrl); } catch (e) { }
                });
                ttsPendingRequestsRef.current.clear();
                ttsAutoPlayNextRef.current = false;
                ttsPlayingSceneRef.current = null;
                setTtsPlayingScene(null);
                ttsResolvedSourceRef.current = null;
                setTtsResolvedSource(null);
                isFollowingAudioRef.current = true;
                setIsFollowingAudio(true);
                setTtsError(null);
                setTtsQueueAndRef([]);
                setTtsCurrentChunkIndexAndRef(0);
                setTtsCurrentTime(0);
                setTtsDuration(0);
                setTtsIsMiniPlayerVisible(false);
                setIsAudioDramaModeActiveAndRef(false);
                setAudioDramaActiveSpeaker(null);
                setAudioDramaActiveEmotion(null);
                if (ttsStatusRef.current === 'playing' || ttsStatusRef.current === 'paused' || ttsStatusRef.current === 'generating' || ttsStatusRef.current === 'error') {
                    setTtsStatusAndRef('ready');
                }
            };

            const stopAuditionPlayback = () => {
                auditionSessionIdRef.current += 1;
                if (auditionAudioRef.current) {
                    try {
                        auditionAudioRef.current.onended = null;
                        auditionAudioRef.current.onerror = null;
                        auditionAudioRef.current.pause();
                        auditionAudioRef.current.removeAttribute('src');
                        auditionAudioRef.current.load();
                    } catch (e) { }
                    auditionAudioRef.current = null;
                }
                if (auditionBlobUrlRef.current) {
                    try { URL.revokeObjectURL(auditionBlobUrlRef.current); } catch (e) { }
                    auditionBlobUrlRef.current = null;
                }
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try { window.speechSynthesis.cancel(); } catch (e) { }
                }
                setIsAuditioningVoice(false);
                setAuditioningTarget(null);
            };

            const stopAllAudioPlayback = () => {
                stopAuditionPlayback();
                stopTtsPlayback();
            };

            const collectSpeakerAliases = (speakerName, activeStory) => {
                const rawSpk = (typeof speakerName === 'object' && speakerName !== null)
                    ? String(speakerName.name || '').trim()
                    : String(speakerName || '').trim();
                if (!rawSpk || rawSpk.toLowerCase() === 'narrator') {
                    return { canonicalSpeaker: 'NARRATOR', matchedChar: null, aliases: ['Narrator', 'NARRATOR'] };
                }
                const { found: matchedChar } = resolveCastMemberForSpeaker(speakerName, activeStory);
                const aliasSet = new Set();
                const addAlias = (val) => {
                    const s = String(val || '').trim();
                    if (s) aliasSet.add(s);
                };
                addAlias(rawSpk);
                addAlias(matchedChar?.name);
                for (const a of (Array.isArray(matchedChar?.aliases) ? matchedChar.aliases : [])) addAlias(a);
                for (const a of (Array.isArray(matchedChar?.details?.aliases) ? matchedChar.details.aliases : [])) addAlias(a);

                const honorificRx = /^(?:(?:Vice|Assistant|Deputy)\s+President|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Capt\.?|Captain|Det\.?|Detective|Cmdr\.?|Commander|Prof\.?|Professor|President|Lord|Lady|Sir|Dame|Senator|Agent|Officer|Sergeant|Sgt\.?|Major|General|Colonel|Lieutenant|Lt\.?|Rev\.?|Reverend|Father|Sister|Brother|Mother)\s+/i;
                for (const baseName of [rawSpk, matchedChar?.name].filter(Boolean)) {
                    const trimmed = String(baseName).trim();
                    const rawParts = trimmed.split(/\s+/).filter(Boolean);
                    if (rawParts.length >= 2 && rawParts[0].length >= 2) {
                        addAlias(rawParts[0]);
                    }
                    let stripped = trimmed;
                    for (let p = 0; p < 2; p++) {
                        stripped = stripped.replace(honorificRx, '').trim();
                    }
                    if (stripped && stripped !== trimmed) {
                        addAlias(stripped);
                    }
                    const sParts = (stripped || trimmed).split(/\s+/).filter(Boolean);
                    if (sParts.length >= 1 && sParts[0].length >= 2) {
                        addAlias(sParts[0]);
                    }
                    if (sParts.length >= 2 && sParts[sParts.length - 1].length >= 3) {
                        addAlias(sParts[sParts.length - 1]);
                    }
                }
                return {
                    canonicalSpeaker: String(matchedChar?.name || rawSpk).trim() || rawSpk,
                    matchedChar: matchedChar || null,
                    aliases: Array.from(aliasSet)
                };
            };

            const invalidateSpeakerVoiceCache = (speakerName, storyObj = null, opts = {}) => {
                const clearBridgeWav = opts?.clearBridgeWav !== false;
                const clearVoiceIdb = opts?.clearVoiceIdb !== false;
                const activeStory = storyObj || storyRef.current || story;
                if (storyObj && typeof storyObj === 'object') {
                    storyObj.audio_cast_updated_at = Date.now();
                }
                const rawStoryId = activeStory?.id || activeStory?.title || 'story';
                const storyId = String(rawStoryId).replace(/[^a-zA-Z0-9_-]/g, '_');
                const { canonicalSpeaker, matchedChar, aliases } = collectSpeakerAliases(speakerName, activeStory);
                const aliasLowerSet = new Set(aliases.map(a => a.toLowerCase()));
                const isNarratorEdit = canonicalSpeaker.toUpperCase() === 'NARRATOR';
                const castList = (Array.isArray(activeStory?.cast) && activeStory.cast.length > 0)
                    ? activeStory.cast
                    : (Array.isArray(activeStory?.characters) ? activeStory.characters : []);

                const matchesSpeakerOrAlias = (nameVal) => {
                    const val = String(nameVal || '').trim();
                    if (!val) return false;
                    const lower = val.toLowerCase();
                    if (aliasLowerSet.has(lower)) return true;
                    if (!isNarratorEdit && matchedChar && typeof resolveCharacter === 'function') {
                        const res = resolveCharacter(val, castList);
                        if (res && ((matchedChar.id && res.id === matchedChar.id) || (matchedChar.name && res.name?.toLowerCase() === matchedChar.name.toLowerCase()))) {
                            return true;
                        }
                    }
                    return aliases.some(a => {
                        const al = a.toLowerCase();
                        return lower === al || lower.startsWith(al + ' ') || al.startsWith(lower + ' ');
                    });
                };

                // Clear any pre-buffered audioUrl in ttsQueueRef mentioning this speaker/alias immediately
                if (ttsQueueRef?.current && Array.isArray(ttsQueueRef.current)) {
                    let didClearChunk = false;
                    const updatedQ = ttsQueueRef.current.map(ch => {
                        const hitLead = matchesSpeakerOrAlias(ch?.speaker || 'Narrator');
                        const hitMulti = Array.isArray(ch?.speakers) && ch.speakers.some(matchesSpeakerOrAlias);
                        const hitTurns = Array.isArray(ch?.turns) && ch.turns.some(t => matchesSpeakerOrAlias(t?.speakerKey || t?.speaker));
                        if (ch && ch.audioUrl && (hitLead || hitMulti || hitTurns)) {
                            try { URL.revokeObjectURL(ch.audioUrl); } catch (_) {}
                            didClearChunk = true;
                            return { ...ch, audioUrl: null, status: 'pending' };
                        }
                        return ch;
                    });
                    if (didClearChunk) {
                        setTtsQueueAndRef(updatedQ);
                    }
                }

                const runInvalidation = async () => {
                    try {
                        const cacheTasks = [];
                        if (typeof studioCacheStore !== 'undefined' && studioCacheStore) {
                            if (clearVoiceIdb && typeof studioCacheStore.clearVoicesForSpeaker === 'function') {
                                cacheTasks.push(studioCacheStore.clearVoicesForSpeaker(storyId, canonicalSpeaker, aliases).catch(() => {}));
                            }
                            if (typeof studioCacheStore.clearRendersForStory === 'function') {
                                cacheTasks.push(studioCacheStore.clearRendersForStory(storyId).catch(() => {}));
                            }
                        }
                        if (clearBridgeWav) {
                            const effCfg = audioDramaSettingsRef.current || audioDramaSettings;
                            let bridgeUrl = String(effCfg?.studioBridgeUrl || 'http://127.0.0.1:5020').trim().replace(/\/+$/, '');
                            if (bridgeUrl) {
                                if (!/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = 'http://' + bridgeUrl;
                                cacheTasks.push(
                                    fetchWithTimeout(`${bridgeUrl}/voices/invalidate`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ storyId, speakerAliases: aliases })
                                    }, 3000).catch(() => null)
                                );
                            }
                        }
                        await Promise.all(cacheTasks);

                        // Invalidate stored scene & sequence audio affected by this speaker (parsing script speakers + alias word-boundaries)
                        if (typeof window !== 'undefined' && window.audioStore && rawStoryId) {
                            const aliasRegexes = aliases
                                .filter(a => a.length >= 2)
                                .map(a => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
                            const sceneAudioSnapshot = { ...(availableSceneAudioMapRef.current || {}) };
                            const metaList = await window.audioStore.listStoryAudioMeta(rawStoryId).catch(() => []);
                            const affectedSeqs = new Set();

                            for (const m of (metaList || [])) {
                                const seqIdxNum = Number(m?.seqIdx);
                                const sceneIdxNum = Number(m?.sceneIdx);
                                if (!Number.isFinite(seqIdxNum) || !Number.isFinite(sceneIdxNum)) continue;
                                let touchesSpeaker = isNarratorEdit;
                                if (!touchesSpeaker) {
                                    const proseObj = activeStory?.prose?.[`${seqIdxNum}-${sceneIdxNum}`];
                                    const proseText = (typeof proseObj === 'object' && proseObj !== null)
                                        ? (proseObj.final || proseObj.draft || '')
                                        : String(proseObj || '');
                                    if (!proseText) {
                                        touchesSpeaker = true;
                                    } else {
                                        if (typeof parseAudioDramaScript === 'function') {
                                            try {
                                                const turns = parseAudioDramaScript(proseText, { raw: true, collapseNarrator: false });
                                                if (Array.isArray(turns) && turns.some(t => matchesSpeakerOrAlias(t?.speakerKey || t?.speaker))) {
                                                    touchesSpeaker = true;
                                                }
                                            } catch (_) {}
                                        }
                                        if (!touchesSpeaker && aliasRegexes.some(rx => rx.test(proseText))) {
                                            touchesSpeaker = true;
                                        }
                                    }
                                }
                                if (touchesSpeaker) {
                                    affectedSeqs.add(seqIdxNum);
                                    delete sceneAudioSnapshot[`${seqIdxNum}-${sceneIdxNum}`];
                                    if (typeof window.audioStore.deleteSceneAudio === 'function') {
                                        await window.audioStore.deleteSceneAudio(rawStoryId, seqIdxNum, sceneIdxNum).catch(() => {});
                                    }
                                }
                            }

                            if (typeof window.audioStore.deleteSequenceAudio === 'function') {
                                const seqMetas = typeof window.audioStore.listStorySequenceAudioMeta === 'function'
                                    ? await window.audioStore.listStorySequenceAudioMeta(rawStoryId).catch(() => [])
                                    : [];
                                for (const sm of (seqMetas || [])) {
                                    const sIdx = Number(sm?.seqIdx);
                                    if (Number.isFinite(sIdx) && (isNarratorEdit || affectedSeqs.has(sIdx))) {
                                        await window.audioStore.deleteSequenceAudio(rawStoryId, sIdx).catch(() => {});
                                    }
                                }
                            }

                            if ((storyRef.current || story)?.id === rawStoryId) {
                                availableSceneAudioMapRef.current = sceneAudioSnapshot;
                                setAvailableSceneAudioMap(sceneAudioSnapshot);
                                if (typeof refreshAvailableSceneAudio === 'function') {
                                    await refreshAvailableSceneAudio(rawStoryId);
                                }
                            }
                        }
                    } catch (invErr) {
                        console.warn('[invalidateSpeakerVoiceCache] Cache invalidation warning:', invErr);
                    }
                };

                const nextChain = (voiceInvalidationPromiseRef.current || Promise.resolve())
                    .catch(() => {})
                    .then(runInvalidation);
                voiceInvalidationPromiseRef.current = nextChain;
                return nextChain;
            };

            /**
             * Atomically applies a voice edit outside React state updaters: updates storyRef & React state,
             * dispatches multi-layer cache invalidation, and eagerly flushes StoryStore persistence.
             */
            const commitVoiceEditUpdate = (speakerName, updaterFn) => {
                const baseStory = storyRef.current || story;
                const draftNext = updaterFn(baseStory);
                if (!draftNext || draftNext === baseStory) return null;
                const nextState = { ...draftNext, audio_cast_updated_at: Date.now() };
                storyRef.current = nextState;
                setStory(nextState);
                invalidateSpeakerVoiceCache(speakerName, nextState);
                if (nextState.id && typeof storyStore !== 'undefined' && storyStore?.saveStory) {
                    storyStore.saveStory(nextState.id, nextState).catch(err => {
                        console.warn('[commitVoiceEditUpdate] Story save warning:', err);
                    });
                }
                return nextState;
            };

            const findCastIndexForChar = (castList, char) => {
                const charName = typeof char === 'object' ? (char?.name || '') : String(char || '');
                return (castList || []).findIndex(c => c && ((c.id && char?.id && c.id === char.id) || (c.name && charName && c.name.toLowerCase() === charName.toLowerCase())));
            };

            const testAuditionCharacterVoice = async (charOrName, options = {}) => {
                const forceRecalibrate = Boolean(options?.forceRecalibrate);
                const charName = typeof charOrName === 'object' ? (charOrName.name || "Character") : String(charOrName);
                if (isAnyAudioPlaying) {
                    stopAllAudioPlayback();
                    if (!forceRecalibrate) return;
                }

                const myAuditionSession = auditionSessionIdRef.current + 1;
                auditionSessionIdRef.current = myAuditionSession;

                // Ensure any pending edit-triggered cache clears finish before checking or calibrating Master WAVs
                await (voiceInvalidationPromiseRef.current || Promise.resolve()).catch(() => {});
                if (auditionSessionIdRef.current !== myAuditionSession) return;

                const activeStory = storyRef.current || story;
                const activeCastList = (Array.isArray(activeStory?.cast) && activeStory.cast.length > 0)
                    ? activeStory.cast
                    : (Array.isArray(activeStory?.characters) ? activeStory.characters : []);
                const passedCharObj = (typeof charOrName === 'object' && charOrName !== null) ? charOrName : null;
                const freshCharObj = (passedCharObj?.id ? activeCastList.find(c => c && c.id === passedCharObj.id) : null)
                    || (typeof resolveCharacter === 'function' ? resolveCharacter(charName, activeCastList) : null)
                    || passedCharObj;
                const goldStandardRefText = (typeof getVoiceReferenceTextForCharacter === 'function'
                    ? getVoiceReferenceTextForCharacter(freshCharObj || charName, activeStory)
                    : '') || RAIN_SENTENCE;

                const backend = audioDramaSettings.backend || 'hybrid';
                if (backend === 'system') {
                    setIsAuditioningVoice(true);
                    setAuditioningTarget(charName);
                    showToast(`Auditioning ${charName} via System Voice...`, "info");
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        try { window.speechSynthesis.cancel(); } catch (e) { }
                        const u = new SpeechSynthesisUtterance(goldStandardRefText);
                        try {
                            const voices = window.speechSynthesis.getVoices();
                            if (voices && voices.length > 0) {
                                const pref = voices.find(v => (v.lang.startsWith('en') || v.lang.startsWith('en-US')) && (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Enhanced') || v.name.includes('Google')))
                                    || voices.find(v => v.lang.startsWith('en'))
                                    || voices[0];
                                if (pref) u.voice = pref;
                            }
                        } catch (vErr) { }
                        u.onend = () => {
                            if (auditionSessionIdRef.current !== myAuditionSession) return;
                            setIsAuditioningVoice(false);
                            setAuditioningTarget(null);
                        };
                        u.onerror = () => {
                            if (auditionSessionIdRef.current !== myAuditionSession) return;
                            setIsAuditioningVoice(false);
                            setAuditioningTarget(null);
                        };
                        window.speechSynthesis.speak(u);
                        return;
                    }
                    setIsAuditioningVoice(false);
                    setAuditioningTarget(null);
                    return;
                }

                if (backend === 'kokoro' || backend === 'browser') {
                    getOrCreateTtsWorker();
                    if (ttsStatusRef.current !== 'ready' && ttsStatusRef.current !== 'playing' && ttsStatusRef.current !== 'paused') {
                        initTtsEngine();
                    }
                }

                setIsAuditioningVoice(true);
                setAuditioningTarget(charName);
                showToast(
                    forceRecalibrate
                        ? `Recalibrating Master Voice for ${charName} via ${backend.toUpperCase()}...`
                        : `Auditioning ${charName} master voice via ${backend.toUpperCase()}...`,
                    "info"
                );

                let auditionUrl = null;
                let wasFreshCalibration = false;
                let calibratedSigHash = '';
                try {
                    if (backend === 'hybrid' || backend === 'audiocpp' || backend === 'breeze') {
                        const effectiveSettings = migrateAudioDramaSettings(audioDramaSettings);
                        let targetUrl = (effectiveSettings.studioBridgeUrl || effectiveSettings.audioCppUrl || 'http://127.0.0.1:5020').trim();
                        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'http://' + targetUrl;
                        targetUrl = targetUrl.replace(/\/+$/, '');

                        // Play existing saved Master WAV immediately unless explicit forceRecalibrate or edit invalidation occurred
                        let masterRec = forceRecalibrate
                            ? null
                            : await getCachedSpeakerMasterVoice(freshCharObj || charName, activeStory, effectiveSettings, targetUrl, null);
                        if (!masterRec) {
                            if (typeof isAudioCppQueueBusy === 'function' && isAudioCppQueueBusy()) {
                                showToast(`Studio GPU is busy rendering scene audio — ${charName} audition is queued next...`, 'info', { durationMs: 6000 });
                            }
                            masterRec = await enqueueAudioCppTask(async () => {
                                if (auditionSessionIdRef.current !== myAuditionSession) return null;
                                const latestStory = storyRef.current || activeStory;
                                const latestCast = (Array.isArray(latestStory?.cast) && latestStory.cast.length > 0)
                                    ? latestStory.cast
                                    : (Array.isArray(latestStory?.characters) ? latestStory.characters : []);
                                const latestChar = (passedCharObj?.id ? latestCast.find(c => c && c.id === passedCharObj.id) : null)
                                    || (typeof resolveCharacter === 'function' ? resolveCharacter(charName, latestCast) : null)
                                    || freshCharObj;
                                await activateAudioCppWave(targetUrl, 1, null, 30000);
                                return await ensureSpeakerMasterVoice(
                                    latestChar || charName,
                                    latestStory,
                                    { ...effectiveSettings, forceRecalibrate },
                                    targetUrl,
                                    null
                                );
                            });
                        }
                        if (auditionSessionIdRef.current !== myAuditionSession) return;

                        wasFreshCalibration = Boolean(masterRec?._freshAudioBlob);
                        calibratedSigHash = masterRec?.signatureHash || '';
                        if (wasFreshCalibration) {
                            // Clear stale Drama-3 renders and stored scene MP3s so Regen Audio uses this newly anchored Master WAV
                            invalidateSpeakerVoiceCache(charName, storyRef.current || activeStory, {
                                clearBridgeWav: false,
                                clearVoiceIdb: false
                            });
                        }

                        let masterBlob = (masterRec?._freshAudioBlob && masterRec._freshAudioBlob.size > 44)
                            ? masterRec._freshAudioBlob
                            : null;
                        if (!masterBlob && masterRec?.uploadKey) {
                            const voiceRes = await fetchWithTimeout(`${targetUrl}/voices/${encodeURIComponent(masterRec.uploadKey)}`, { method: 'GET' }, 15000).catch(() => null);
                            if (voiceRes && voiceRes.ok) {
                                const fetchedBlob = await voiceRes.blob();
                                if (fetchedBlob && fetchedBlob.size > 44) masterBlob = fetchedBlob;
                            }
                        }
                        if (masterBlob) {
                            auditionUrl = URL.createObjectURL(masterBlob);
                        }
                    }

                    if (!auditionUrl) {
                        const testChunk = {
                            speaker: charName,
                            speakerObj: freshCharObj || null,
                            emotion: "warm and expressive",
                            spokenText: goldStandardRefText
                        };
                        auditionUrl = await synthesizeAudioDramaChunk({
                            chunk: testChunk,
                            backend: backend,
                            story: activeStory,
                            settings: audioDramaSettings,
                            mainApiKey: apiKey,
                            mainOpenRouterKey: openRouterKey,
                            kokoroWorkerRef: ttsWorkerRef
                        });
                    }
                    if (auditionSessionIdRef.current !== myAuditionSession) {
                        if (auditionUrl) { try { URL.revokeObjectURL(auditionUrl); } catch (e) { } }
                        return;
                    }
                    const aud = new Audio(auditionUrl);
                    auditionAudioRef.current = aud;
                    auditionBlobUrlRef.current = auditionUrl;
                    aud.onended = () => {
                        if (auditionSessionIdRef.current !== myAuditionSession) return;
                        if (auditionBlobUrlRef.current) { try { URL.revokeObjectURL(auditionBlobUrlRef.current); } catch (e) { } auditionBlobUrlRef.current = null; }
                        auditionAudioRef.current = null;
                        setIsAuditioningVoice(false);
                        setAuditioningTarget(null);
                    };
                    aud.onerror = () => {
                        if (auditionSessionIdRef.current !== myAuditionSession) return;
                        if (auditionBlobUrlRef.current) { try { URL.revokeObjectURL(auditionBlobUrlRef.current); } catch (e) { } auditionBlobUrlRef.current = null; }
                        auditionAudioRef.current = null;
                        setIsAuditioningVoice(false);
                        setAuditioningTarget(null);
                        showToast("Audio playback failed for test audition", "warning");
                    };
                    await aud.play();
                    if (auditionSessionIdRef.current === myAuditionSession) {
                        const sigNote = calibratedSigHash ? ` (Sig: ${calibratedSigHash})` : '';
                        showToast(
                            wasFreshCalibration
                                ? `Calibrated & saved Master Voice for ${charName}${sigNote}`
                                : `Playing saved Master Voice for ${charName}${sigNote}`,
                            "success"
                        );
                    }
                } catch (err) {
                    if (auditionUrl) { try { URL.revokeObjectURL(auditionUrl); } catch (e) { } }
                    if (auditionSessionIdRef.current === myAuditionSession) {
                        auditionAudioRef.current = null;
                        auditionBlobUrlRef.current = null;
                        setIsAuditioningVoice(false);
                        setAuditioningTarget(null);
                        showToast(`Audition failed: ${err.message}`, "error");
                    }
                }
            };

            const handleRerollCharacterSeed = (char) => {
                const charName = typeof char === 'object' ? (char.name || "Character") : String(char);
                const newSeed = Math.floor(Math.random() * 900000) + 100000;
                const updated = commitVoiceEditUpdate(charName, prev => {
                    const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                    const baseList = hasCast ? prev.cast : (Array.isArray(prev.characters) ? prev.characters : []);
                    const newCast = [...baseList];
                    const idx = findCastIndexForChar(newCast, char);
                    if (idx === -1) return null;
                    newCast[idx] = { ...newCast[idx], voice_seed: newSeed };
                    return hasCast ? { ...prev, cast: newCast } : { ...prev, cast: newCast, characters: newCast };
                });
                if (updated) {
                    showToast(`Re-rolled voice seed for ${charName}: #${newSeed}`, "info");
                }
            };

            const handleRerollNarratorSeed = () => {
                const newSeed = Math.floor(Math.random() * 900000) + 100000;
                commitVoiceEditUpdate('Narrator', prev => ({
                    ...prev,
                    narrator_voice_seed: newSeed,
                    user_edited: { ...(prev.user_edited || {}), narrator_voice_seed: true }
                }));
                showToast(`Re-rolled Narrator voice seed: #${newSeed}`, "info");
            };

            const handleEditNarratorVoiceProfile = () => {
                const currentProfile = getVoiceDescriptionForCharacter('Narrator', storyRef.current || story);
                openEditModal(
                    'Narrator Voice Profile (Breeze 2 Instruct Prompt)',
                    currentProfile,
                    (newValue) => {
                        const cleaned = cleanCharacterNameFromVoiceProfile(String(newValue || '').trim(), ['Narrator', 'The Narrator']);
                        if (!cleaned) return;
                        commitVoiceEditUpdate('Narrator', prev => ({
                            ...prev,
                            narrator_vocal_cadence: cleaned,
                            narrator_voice_profile: cleaned,
                            user_edited: { ...(prev.user_edited || {}), narrator_vocal_cadence: true }
                        }));
                        showToast('Updated Narrator voice profile', 'success');
                    },
                    'narrator_vocal_cadence'
                );
            };

            const handleEditNarratorSeed = () => {
                const currentSeed = getDeterministicVoiceSeed('Narrator', storyRef.current || story);
                openEditModal(
                    'Narrator Deterministic Voice Seed (Integer)',
                    String(currentSeed),
                    (newValue) => {
                        const parsed = parseInt(String(newValue || '').replace(/[^0-9]/g, ''), 10);
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                            showToast('Please enter a valid positive integer seed', 'warning');
                            return;
                        }
                        commitVoiceEditUpdate('Narrator', prev => ({
                            ...prev,
                            narrator_voice_seed: parsed,
                            user_edited: { ...(prev.user_edited || {}), narrator_voice_seed: true }
                        }));
                        showToast(`Updated Narrator voice seed: #${parsed}`, 'success');
                    },
                    'narrator_voice_seed'
                );
            };

            const handleEditCharacterVoiceProfile = (char) => {
                const charName = typeof char === 'object' ? (char.name || 'Character') : String(char);
                const currentProfile = getVoiceDescriptionForCharacter(charName, storyRef.current || story);
                const charKey = `cast.${charName}.vocal_cadence`;
                openEditModal(
                    `Voice Profile for ${charName} (Breeze 2 Instruct Prompt)`,
                    currentProfile,
                    (newValue) => {
                        const cleaned = cleanCharacterNameFromVoiceProfile(String(newValue || '').trim(), [charName]);
                        if (!cleaned) return;
                        commitVoiceEditUpdate(charName, prev => {
                            const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                            const baseList = hasCast ? prev.cast : (Array.isArray(prev.characters) ? prev.characters : []);
                            const newCast = [...baseList];
                            const idx = findCastIndexForChar(newCast, char);
                            if (idx === -1) return null;
                            const updatedChar = {
                                ...newCast[idx],
                                vocal_cadence: cleaned,
                                vocal_profile: cleaned,
                                voice_profile: cleaned,
                                voice_description: cleaned,
                                user_edited_cadence: true,
                                is_user_edited: true,
                                user_edited: true
                            };
                            if (updatedChar.details && typeof updatedChar.details === 'object') {
                                updatedChar.details = { ...updatedChar.details, vocal_profile: cleaned };
                            }
                            newCast[idx] = updatedChar;
                            const nextCharacterStates = { ...(prev.character_states || {}) };
                            if (nextCharacterStates[charName]) {
                                nextCharacterStates[charName] = { ...nextCharacterStates[charName], vocal_cadence: cleaned };
                            }
                            return {
                                ...prev,
                                cast: newCast,
                                ...(hasCast ? {} : { characters: newCast }),
                                character_states: nextCharacterStates,
                                user_edited: {
                                    ...(prev.user_edited || {}),
                                    [charKey]: true,
                                    [`cast.${idx}.vocal_cadence`]: true,
                                    [`cast.${charName}`]: true
                                }
                            };
                        });
                        showToast(`Updated voice profile for ${charName}`, 'success');
                    },
                    charKey
                );
            };

            const handleEditCharacterSeed = (char) => {
                const charName = typeof char === 'object' ? (char.name || 'Character') : String(char);
                const currentSeed = getDeterministicVoiceSeed(charName, storyRef.current || story);
                const charKey = `cast.${charName}.voice_seed`;
                openEditModal(
                    `Deterministic Voice Seed for ${charName} (Integer)`,
                    String(currentSeed),
                    (newValue) => {
                        const parsed = parseInt(String(newValue || '').replace(/[^0-9]/g, ''), 10);
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                            showToast('Please enter a valid positive integer seed', 'warning');
                            return;
                        }
                        commitVoiceEditUpdate(charName, prev => {
                            const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                            const baseList = hasCast ? prev.cast : (Array.isArray(prev.characters) ? prev.characters : []);
                            const newCast = [...baseList];
                            const idx = findCastIndexForChar(newCast, char);
                            if (idx === -1) return null;
                            newCast[idx] = { ...newCast[idx], voice_seed: parsed };
                            return {
                                ...prev,
                                cast: newCast,
                                ...(hasCast ? {} : { characters: newCast }),
                                user_edited: {
                                    ...(prev.user_edited || {}),
                                    [charKey]: true
                                }
                            };
                        });
                        showToast(`Updated voice seed for ${charName}: #${parsed}`, 'success');
                    },
                    charKey
                );
            };

            const handleEditNarratorReferenceText = () => {
                const currentRef = getVoiceReferenceTextForCharacter('Narrator', storyRef.current || story);
                openEditModal(
                    'Narrator Voice Reference Transcript (TTS Anchor)',
                    currentRef,
                    (newValue) => {
                        const cleaned = sanitizeVoiceReferenceText(String(newValue || '').trim());
                        if (!cleaned) {
                            showToast('Reference text cannot be empty', 'warning');
                            return;
                        }
                        commitVoiceEditUpdate('Narrator', prev => ({
                            ...prev,
                            narrator_reference_text: cleaned,
                            user_edited: { ...(prev.user_edited || {}), narrator_reference_text: true }
                        }));
                        showToast('Updated Narrator voice reference transcript', 'success');
                    },
                    'narrator_reference_text'
                );
            };

            const handleResetNarratorReferenceText = () => {
                commitVoiceEditUpdate('Narrator', prev => {
                    const next = { ...prev };
                    delete next.narrator_reference_text;
                    if (next.user_edited && typeof next.user_edited === 'object') {
                        const nextUE = { ...next.user_edited };
                        delete nextUE.narrator_reference_text;
                        next.user_edited = nextUE;
                    }
                    return next;
                });
                showToast('Reset Narrator reference transcript to default (~17s passage)', 'info');
            };

            const handleEditCharacterReferenceText = (char) => {
                const charName = typeof char === 'object' ? (char.name || 'Character') : String(char);
                const currentRef = getVoiceReferenceTextForCharacter(char, storyRef.current || story);
                const charKey = `cast.${charName}.reference_text`;
                openEditModal(
                    `Voice Reference Transcript for ${charName} (TTS Anchor)`,
                    currentRef,
                    (newValue) => {
                        const cleaned = sanitizeVoiceReferenceText(String(newValue || '').trim());
                        if (!cleaned) {
                            showToast('Reference text cannot be empty', 'warning');
                            return;
                        }
                        commitVoiceEditUpdate(charName, prev => {
                            const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                            const baseList = hasCast ? prev.cast : (Array.isArray(prev.characters) ? prev.characters : []);
                            const newCast = [...baseList];
                            const idx = findCastIndexForChar(newCast, char);
                            if (idx === -1) return null;
                            newCast[idx] = {
                                ...newCast[idx],
                                reference_text: cleaned,
                                user_edited_reference_text: true,
                                is_user_edited: true,
                                user_edited: true
                            };
                            return {
                                ...prev,
                                cast: newCast,
                                ...(hasCast ? {} : { characters: newCast }),
                                user_edited: {
                                    ...(prev.user_edited || {}),
                                    [charKey]: true,
                                    [`cast.${idx}.reference_text`]: true,
                                    [`cast.${charName}`]: true
                                }
                            };
                        });
                        showToast(`Updated voice reference transcript for ${charName}`, 'success');
                    },
                    charKey
                );
            };

            const handleResetCharacterReferenceText = (char) => {
                const charName = typeof char === 'object' ? (char.name || 'Character') : String(char);
                let hasExtractedInterview = false;
                commitVoiceEditUpdate(charName, prev => {
                    const hasCast = Array.isArray(prev.cast) && prev.cast.length > 0;
                    const baseList = hasCast ? prev.cast : (Array.isArray(prev.characters) ? prev.characters : []);
                    const newCast = [...baseList];
                    const idx = findCastIndexForChar(newCast, char);
                    if (idx === -1) return null;
                    const target = { ...newCast[idx] };
                    const interviewSrc = target.details?.deep_profile || target.interview_psychology || target.deep_profile || target.canonical_interview_voice || '';
                    const autoExtracted = extractPersonalizedReferenceTextFromInterview(interviewSrc);
                    hasExtractedInterview = Boolean(autoExtracted);
                    if (autoExtracted) {
                        target.reference_text = autoExtracted;
                    } else {
                        delete target.reference_text;
                    }
                    target.user_edited_reference_text = false;
                    newCast[idx] = target;
                    const nextUserEdited = { ...(prev.user_edited || {}) };
                    delete nextUserEdited[`cast.${charName}.reference_text`];
                    delete nextUserEdited[`cast.${idx}.reference_text`];
                    return {
                        ...prev,
                        cast: newCast,
                        ...(hasCast ? {} : { characters: newCast }),
                        user_edited: nextUserEdited
                    };
                });
                showToast(
                    hasExtractedInterview
                        ? `Reset ${charName}'s reference transcript to interview excerpt`
                        : `Reset ${charName}'s reference transcript to default (~17s passage)`,
                    'info'
                );
            };

            const handleResetAllVoiceAndAudioCaches = () => {
                const activeStory = storyRef.current || story;
                const rawStoryId = activeStory?.id || activeStory?.title || 'story';
                const storyId = String(rawStoryId).replace(/[^a-zA-Z0-9_-]/g, '_');
                requestConfirm({
                    title: 'Reset All Voice & Audio Caches?',
                    message: 'This clears all calibrated Master Voice WAVs on the Audio Studio Bridge, cached voice metadata, Studio segment renders, and saved scene/sequence MP3s for the active story. Next audition or render will calibrate fresh voices.',
                    confirmLabel: 'Reset All Audio Caches',
                    danger: true,
                    onConfirm: async () => {
                        stopAllAudioPlayback();
                        try {
                            const effCfg = audioDramaSettingsRef.current || audioDramaSettings;
                            let bridgeUrl = String(effCfg?.studioBridgeUrl || 'http://127.0.0.1:5020').trim().replace(/\/+$/, '');
                            if (bridgeUrl && !/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = 'http://' + bridgeUrl;
                            await Promise.all([
                                window.studioCacheStore?.clearVoicesForStory ? window.studioCacheStore.clearVoicesForStory(storyId) : Promise.resolve(),
                                (rawStoryId !== storyId && window.studioCacheStore?.clearVoicesForStory) ? window.studioCacheStore.clearVoicesForStory(rawStoryId) : Promise.resolve(),
                                window.studioCacheStore?.clearRendersForStory ? window.studioCacheStore.clearRendersForStory(rawStoryId) : Promise.resolve(),
                                (rawStoryId !== storyId && window.studioCacheStore?.clearRendersForStory) ? window.studioCacheStore.clearRendersForStory(storyId) : Promise.resolve(),
                                bridgeUrl ? fetchWithTimeout(`${bridgeUrl}/voices/prune`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ deleteAll: true })
                                }, 4000).catch(() => null) : Promise.resolve(),
                                (rawStoryId && window.audioStore?.deleteStoryAudio) ? window.audioStore.deleteStoryAudio(rawStoryId).catch(() => {}) : Promise.resolve()
                            ]);
                            availableSceneAudioMapRef.current = {};
                            setAvailableSceneAudioMap({});
                            setAvailableSequenceAudioMap({});
                            const base = storyRef.current || story;
                            if (base && typeof base === 'object') {
                                const bumped = { ...base, audio_cast_updated_at: Date.now() };
                                storyRef.current = bumped;
                                setStory(bumped);
                                if (bumped.id && typeof storyStore !== 'undefined' && storyStore?.saveStory) {
                                    storyStore.saveStory(bumped.id, bumped).catch(() => {});
                                }
                            }
                            showToast('Cleared all Master Voices, Studio renders, and saved scene audio for this story.', 'success');
                        } catch (err) {
                            showToast(`Failed clearing all voice/audio caches: ${err.message}`, 'error');
                        }
                    }
                });
            };

            const skipTtsChunk = (delta) => {
                unlockBrowserAudioElement();
                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }
                const targetIdx = ttsCurrentChunkIndexRef.current + delta;
                if (targetIdx >= 0 && targetIdx < ttsQueueRef.current.length) {
                    setTtsError(null);
                    if ((ttsResolvedSourceRef.current?.backend === 'system') || (readerSettingsRef.current?.ttsVoice === 'system_native' && !isAudioDramaModeActiveRef.current)) {
                        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                            try { window.speechSynthesis.cancel(); } catch (e) { }
                        }
                        setTtsCurrentChunkIndexAndRef(targetIdx);
                        setTtsCurrentTime(0);
                        speakChunkWithSpeechSynthesis(targetIdx);
                        return;
                    }

                    if (currentMasterAudioBlobUrlRef.current) {
                    try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                    currentMasterAudioBlobUrlRef.current = null;
                }
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                if (ttsAudioRef.current) {
                        ttsAudioRef.current.pause();
                        if (!isMobileDevice()) {
                            try { ttsAudioRef.current.removeAttribute('src'); } catch (e) { }
                        }
                    }
                    if (ttsWorkerRef.current && !isAudioDramaModeActiveRef.current) {
                        try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                    }
                    clearTtsWatchdog();
                    // Abort any in-flight requests EXCEPT targetIdx (so if targetIdx was already being prefetched, we keep it!)
                    abortPendingTtsRequests(targetIdx);
                    ttsAutoPlayNextRef.current = true;
                    setTtsCurrentChunkIndexAndRef(targetIdx);
                    setTtsCurrentTime(0);
                    setTtsDuration(0);
                    playAudioChunk(targetIdx);
                }
            };

            const changeTtsVoice = (newVoiceId) => {
                updateReaderSetting('ttsVoice', newVoiceId);
                const voiceObj = KOKORO_VOICES.find(v => v.id === newVoiceId) || KOKORO_VOICES[0];
                showToast(`Voice set to ${voiceObj.shortName || voiceObj.name}`);

                if (newVoiceId !== 'system_native' && typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem('kokoro_opt_in', 'true');
                }

                clearTtsWatchdog();
                if (newVoiceId === 'system_native') {
                    if (ttsAudioRef.current) ttsAudioRef.current.pause();
                    if (ttsWorkerRef.current) {
                        try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                    }
                    ttsPendingRequestsRef.current.clear();
                    setTtsActiveDevice('system');
                    if (ttsStatusRef.current === 'playing') {
                        speakChunkWithSpeechSynthesis(ttsCurrentChunkIndexRef.current);
                    }
                    return;
                }

                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    try { window.speechSynthesis.cancel(); } catch (e) { }
                }
                if (ttsWorkerRef.current) {
                    try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                }
                ttsPendingRequestsRef.current.clear();

                // Invalidate pre-buffered lookahead chunks so subsequent chunks use the newly selected voice
                setTtsQueueAndRef(prev => {
                    if (!prev || prev.length === 0) return prev;
                    return prev.map((chunk, idx) => {
                        // Preserve the active playing chunk to prevent cutting off mid-word
                        if (idx === ttsCurrentChunkIndexRef.current && ttsStatusRef.current === 'playing') {
                            return chunk;
                        }
                        if (chunk.audioUrl) {
                            try { URL.revokeObjectURL(chunk.audioUrl); } catch (e) { }
                        }
                        return {
                            ...chunk,
                            status: 'idle',
                            audioUrl: null,
                            duration: 0
                        };
                    });
                });

                // Re-prime lookahead buffer with new voice if queue is populated and not mobile
                setTimeout(() => {
                    if (ttsQueueRef.current && ttsQueueRef.current.length > 0 && !isMobileDevice()) {
                        primeLookaheadBuffer(ttsCurrentChunkIndexRef.current);
                    }
                }, 50);
            };

            const generateAndStoreSceneAudio = async (seqIdx, sceneIdx, { triggerDownload = false, forceRegenerate = false, forceRerender = false, forceRecalibrate = false, deferFinalize = false, onProgress = null, signal = null, storyOverride = null } = {}) => {
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                const targetSeq = Number(seqIdx);
                const targetScene = Number(sceneIdx);
                const sId = `${targetSeq}-${targetScene}`;
                const liveActiveStory = storyRef.current || story;
                const useOverride = Boolean(storyOverride && (!liveActiveStory?.id || storyOverride.id !== liveActiveStory.id));
                const currentStory = useOverride ? storyOverride : liveActiveStory;
                const targetStoryId = currentStory?.id;
                if (!targetStoryId) {
                    throw new Error('Cannot generate scene audio without an active story ID.');
                }
                const proseObj = currentStory?.prose?.[sId];
                const proseText = (typeof proseObj === 'object' && proseObj !== null)
                    ? (proseObj.final || proseObj.draft || "")
                    : String(proseObj || "");

                if (!proseText || !proseText.trim()) {
                    throw new Error(`No prose drafted for Scene ${targetSeq + 1}.${targetScene + 1}`);
                }

                // Check if current target scene matches active TTS queue in memory to reuse synthesized audio
                const isCurrentActiveScene = (!useOverride || (storyRef.current || story)?.id === targetStoryId) && (targetSeq === Number(selectedSequence) && targetScene === Number(selectedScene));
                let activeQueueToReuse = null;
                if (!forceRegenerate && !forceRerender && isCurrentActiveScene && Array.isArray(ttsQueueRef.current) && ttsQueueRef.current.length > 0 && ttsQueueRef.current[0]?.engine !== 'stored_mp3') {
                    const firstQueueText = ttsQueueRef.current[0]?.spokenText || ttsQueueRef.current[0]?.text || "";
                    if (firstQueueText && proseText.includes(firstQueueText.slice(0, 20))) {
                        activeQueueToReuse = ttsQueueRef.current;
                    }
                }

                if (onProgress) onProgress({ current: 5, total: 100, stage: 'parsing_turns', message: 'Parsing script & dialogue cues...' });
                const parsedDramaForExport = parseAudioDramaScript(proseText);
                const isSameActiveStory = (storyRef.current || story)?.id === targetStoryId;
                const storyForExport = ensureAudioDramaVoicesRegistered(
                    parsedDramaForExport,
                    currentStory,
                    isSameActiveStory ? setStory : null
                );
                if (storyForExport && isSameActiveStory && storyRef.current === currentStory) {
                    storyRef.current = storyForExport;
                }
                if (onProgress) onProgress({ current: 18, total: 100, stage: 'voice_alignment', message: 'Voice profiles & acoustic seeds registered.' });

                const latestExportStory = (!useOverride && storyRef.current?.id === targetStoryId)
                    ? storyRef.current
                    : (storyForExport || currentStory);

                const exportRes = await exportSceneAudioMp3({
                    story: latestExportStory,
                    seqIdx: targetSeq,
                    sceneIdx: targetScene,
                    settings: audioDramaSettingsRef.current || audioDramaSettings,
                    mainApiKey: apiKey,
                    mainOpenRouterKey: openRouterKey,
                    kokoroWorkerRef: ttsWorkerRef,
                    activeQueue: activeQueueToReuse,
                    triggerDownload,
                    forceRerender: Boolean(forceRerender || forceRegenerate),
                    forceRecalibrate: Boolean(forceRecalibrate),
                    deferFinalize: Boolean(deferFinalize),
                    onProgress,
                    signal
                });

                const persistRenderedResult = async (result, notifyProgress = true) => {
                    if (signal?.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    const outBlob = result?.mp3Blob || result?.blob;
                    if (!window.audioStore) {
                        throw new Error(`AudioStore is unavailable to persist Scene ${targetSeq + 1}.${targetScene + 1}.`);
                    }
                    if (!(outBlob instanceof Blob) || outBlob.size <= 0) {
                        throw new Error(`Scene ${targetSeq + 1}.${targetScene + 1} audio render produced an empty blob.`);
                    }

                    // Persist into IndexedDB AudioStore including exact cueTimeline for synchronized highlights & scrubbing
                    try {
                        if (notifyProgress && onProgress) onProgress({ current: 95, total: 100, stage: 'saving', message: 'Saving master audio & cue timeline to offline store...' });
                        const liveStoryForSig = (!useOverride && storyRef.current?.id === targetStoryId)
                            ? storyRef.current
                            : latestExportStory;
                        const savedRecord = await window.audioStore.saveSceneAudio({
                            storyId: targetStoryId,
                            seqIdx: targetSeq,
                            sceneIdx: targetScene,
                            blob: outBlob,
                            mimeType: result?.mimeType || outBlob.type || 'audio/mpeg',
                            durationSec: result.durationSec || 0,
                            textHash: result.textHash || computeSceneProseHash(proseText),
                            voiceSigHash: result.voiceSigHash || (typeof computeSceneVoiceSignatureHash === 'function'
                                ? computeSceneVoiceSignatureHash(proseText, liveStoryForSig, audioDramaSettingsRef.current || audioDramaSettings)
                                : ''),
                            cueCount: (Array.isArray(result.cueTimeline) && result.cueTimeline.length) || result.totalChunks || (parsedDramaForExport?.length || 1),
                            cueTimeline: Array.isArray(result.cueTimeline) ? result.cueTimeline : null
                        });
                        if (typeof window.logAudioDramaPipelineStageComplete === 'function') {
                            window.logAudioDramaPipelineStageComplete(
                                'scene_audio_save',
                                `[Completed] Saved Scene ${targetSeq + 1}.${targetScene + 1} Audio to IndexedDB (${((savedRecord?.sizeBytes || outBlob.size) / 1024 / 1024).toFixed(2)} MB)`,
                                {
                                    storyId: targetStoryId,
                                    seqIdx: targetSeq,
                                    sceneIdx: targetScene,
                                    sizeBytes: savedRecord?.sizeBytes || outBlob.size,
                                    durationSec: savedRecord?.durationSec || result.durationSec || 0,
                                    mimeType: savedRecord?.mimeType || result?.mimeType || outBlob.type || 'audio/mpeg'
                                }
                            );
                        }
                        if ((storyRef.current || story)?.id === targetStoryId) {
                            await refreshAvailableSceneAudio(targetStoryId);
                        }
                        if (notifyProgress && onProgress) onProgress({ current: 100, total: 100, stage: 'done', message: 'Saved to offline audio library.' });
                    } catch (saveErr) {
                        if (typeof window.logAudioDramaPipelineStageError === 'function') {
                            window.logAudioDramaPipelineStageError(
                                'scene_audio_save',
                                `Failed saving Scene ${targetSeq + 1}.${targetScene + 1} Audio to IndexedDB`,
                                saveErr,
                                {
                                    storyId: targetStoryId,
                                    seqIdx: targetSeq,
                                    sceneIdx: targetScene,
                                    sizeBytes: outBlob.size
                                }
                            );
                        }
                        throw saveErr;
                    }

                    return result;
                };

                if (deferFinalize && exportRes && typeof exportRes.finalize === 'function') {
                    return {
                        deferred: true,
                        totalChunks: exportRes.totalChunks || 1,
                        finalize: async () => {
                            const finalizedRes = await exportRes.finalize();
                            return await persistRenderedResult(finalizedRes, false);
                        }
                    };
                }

                return await persistRenderedResult(exportRes, true);
            };

            const handleDownloadSceneAudio = async (seqIdx = selectedSequence, sceneIdx = selectedScene) => {
                if (isExportingSceneAudio) return;

                const targetSeq = (seqIdx !== undefined && seqIdx !== null) ? Number(seqIdx) : Number(selectedSequence);
                const targetScene = (sceneIdx !== undefined && sceneIdx !== null) ? Number(sceneIdx) : Number(selectedScene);
                const currentStory = storyRef.current || story;

                const sId = `${targetSeq}-${targetScene}`;
                const proseObj = currentStory?.prose?.[sId];
                const proseText = (typeof proseObj === 'object' && proseObj !== null)
                    ? (proseObj.final || proseObj.draft || "")
                    : String(proseObj || "");

                // Check if stored MP3 already exists and is still fresh (matches both prose and current cast voices)
                if (window.audioStore && currentStory?.id) {
                    try {
                        const storedRecord = await window.audioStore.getSceneAudio(currentStory.id, targetSeq, targetScene);
                        const freshness = isStoredSceneAudioFresh(storedRecord, proseText, currentStory, audioDramaSettingsRef.current || audioDramaSettings);
                        if (storedRecord && storedRecord.blob && freshness.fresh) {
                            setIsExportingSceneAudio(true);
                            try {
                                const cleanStory = String(currentStory?.title || "Novel").replace(/[^a-zA-Z0-9_\-]/g, '_');
                                const scenesForSeq = (currentStory.scenes && (currentStory.scenes[targetSeq] || currentStory.scenes[String(targetSeq)])) || [];
                                const sceneItem = Array.isArray(scenesForSeq) ? scenesForSeq[targetScene] : null;
                                const cleanSceneTitle = String(sceneItem?.title || `Scene_${targetScene + 1}`).replace(/[^a-zA-Z0-9_\-]/g, '_');
                                const fileName = `${cleanStory}_Scene_${targetSeq + 1}.${targetScene + 1}_${cleanSceneTitle}.mp3`.replace(/\s+/g, '_');
                                downloadBlob(storedRecord.blob, fileName);
                                showToast(`Downloaded saved MP3: ${fileName}`, "success");
                                return;
                            } finally {
                                setIsExportingSceneAudio(false);
                            }
                        }
                    } catch (storeErr) {
                        console.warn("Failed checking AudioStore for saved MP3 download:", storeErr);
                    }
                }

                if (!proseText || !proseText.trim()) {
                    showToast("No prose drafted for this scene to generate audio.", "warning");
                    return;
                }

                setIsExportingSceneAudio(true);
                showToast(`Preparing MP3 export for Scene ${targetSeq + 1}.${targetScene + 1}...`, "info");

                try {
                    const result = await generateAndStoreSceneAudio(targetSeq, targetScene, {
                        triggerDownload: true,
                        forceRegenerate: true,
                        forceRerender: true,
                        forceRecalibrate: false,
                        onProgress: ({ current, total, stage, speaker }) => {
                            if (stage === 'synthesizing') {
                                showToast(`Synthesizing ${speaker || 'audio'} (${current}/${total})...`, "info");
                            } else if (stage === 'encoding') {
                                showToast("Encoding master MP3...", "info");
                            }
                        }
                    });
                    showToast(`MP3 downloaded: ${result.fileName}`, "success");
                } catch (err) {
                    console.error("Failed to export scene MP3:", err);
                    showToast(`Audio export failed: ${err.message || 'Unknown error'}`, "error");
                } finally {
                    setIsExportingSceneAudio(false);
                }
            };

            const handleRegenerateSceneAudio = async (seqIdx = selectedSequence, sceneIdx = selectedScene) => {
                if (isExportingSceneAudio || isRegeneratingSceneAudio) return;

                const targetSeq = (seqIdx !== undefined && seqIdx !== null) ? Number(seqIdx) : Number(selectedSequence);
                const targetScene = (sceneIdx !== undefined && sceneIdx !== null) ? Number(sceneIdx) : Number(selectedScene);
                const currentStory = storyRef.current || story;
                const sId = `${targetSeq}-${targetScene}`;
                const proseObj = currentStory?.prose?.[sId];
                const proseText = (typeof proseObj === "object" && proseObj !== null)
                    ? (proseObj.final || proseObj.draft || "")
                    : String(proseObj || "");

                if (!proseText || !proseText.trim()) {
                    showToast("No prose drafted for this scene to regenerate audio.", "warning");
                    return;
                }

                setIsRegeneratingSceneAudio(true);
                const tierName = audioDramaSettings?.backend || "selected";
                showToast(`Regenerating audio for Scene ${targetSeq + 1}.${targetScene + 1} (${tierName} pipeline)...`, "info");

                try {
                    const result = await generateAndStoreSceneAudio(targetSeq, targetScene, {
                        triggerDownload: false,
                        forceRegenerate: true,
                        forceRerender: true,
                        forceRecalibrate: false,
                        onProgress: ({ current, total, stage, speaker }) => {
                            if (stage === "synthesizing") {
                                showToast(`Synthesizing ${speaker || "audio"} (${current}/${total})...`, "info");
                            } else if (stage === "encoding") {
                                showToast("Encoding regenerated master MP3...", "info");
                            }
                        }
                    });
                    showToast(`Audio regenerated & saved for Scene ${targetSeq + 1}.${targetScene + 1}!`, "success");
                } catch (err) {
                    console.error("Failed to regenerate scene audio:", err);
                    showToast(`Audio regeneration failed: ${err.message || "Unknown error"}`, "error");
                } finally {
                    setIsRegeneratingSceneAudio(false);
                }
            };

            const handleDownloadSequenceAudio = async (seqIdx = selectedSequence) => {
                if (isExportingSequenceAudio || isExportingSceneAudio || isExportingStoryAudio) return;

                const currentStory = storyRef.current || story;
                const targetSeq = (seqIdx !== undefined && seqIdx !== null) ? Number(seqIdx) : Number(selectedSequence);
                const seq = (currentStory?.sequences || [])[targetSeq];
                const seqNum = seq?.number || (targetSeq + 1);
                const rawScenes = (currentStory?.scenes && (currentStory.scenes[targetSeq] || currentStory.scenes[String(targetSeq)])) || [];
                const sceneList = Array.isArray(rawScenes) ? rawScenes : [];

                let storedSceneRecords = [];
                let storedSeqRecord = null;
                if (window.audioStore && currentStory?.id) {
                    try {
                        storedSceneRecords = await window.audioStore.getAllStoryAudioRecords(currentStory.id);
                        if (typeof window.audioStore.getSequenceAudio === 'function') {
                            storedSeqRecord = await window.audioStore.getSequenceAudio(currentStory.id, targetSeq);
                        }
                    } catch (storeErr) {
                        console.warn("Failed checking AudioStore for sequence audio:", storeErr);
                    }
                }

                let plan = resolveSequenceAudioPlan(currentStory, targetSeq, storedSceneRecords, storedSeqRecord);

                if (plan.items.length > 0) {
                    const coveredSet = new Set(plan.coveredSceneIndices || []);
                    const missingDraftedIndices = [];
                    sceneList.forEach((_, sIdx) => {
                        if (!coveredSet.has(sIdx) && getSceneProseText(currentStory, targetSeq, sIdx)) {
                            missingDraftedIndices.push(sIdx);
                        }
                    });

                    let shouldGenerateMissing = false;
                    if (plan.status === 'missing_in_structure' || plan.status === 'incomplete') {
                        const missingList = [...(plan.internalMissingIndices || []), ...(plan.trailingMissingIndices || [])]
                            .map(i => `${plan.seqNum}.${i + 1}`);
                        const msg = plan.status === 'missing_in_structure'
                            ? `Scene(s) ${missingList.join(', ')} are missing saved audio in Sequence ${plan.seqNum} (${plan.coveredSceneIndices.length}/${plan.totalScenes} ready).\n\n${missingDraftedIndices.length > 0 ? 'Would you like to generate the missing drafted scenes first, or stitch only the currently available scenes?' : 'Exporting now will stitch only the generated scenes into an MP3.'}`
                            : `Sequence ${plan.seqNum} MP3 is incomplete: audio is saved for ${plan.coveredSceneIndices.length} of ${plan.totalScenes} scenes.\n\nMissing scene(s): ${missingList.join(', ')}.\n\n${missingDraftedIndices.length > 0 ? 'Generate missing drafted scenes before stitching, or export the currently saved scenes only?' : 'Stitch and export the saved scenes now?'}`;

                        const choice = await requestConfirm({
                            title: plan.status === 'missing_in_structure'
                                ? `Missing Scenes in Sequence ${plan.seqNum}`
                                : `Incomplete Sequence ${plan.seqNum} Audio`,
                            message: msg,
                            confirmLabel: missingDraftedIndices.length > 0 ? 'Generate Missing & Export' : 'Export Available Audio',
                            secondaryLabel: missingDraftedIndices.length > 0 ? 'Export Available Only' : null,
                            cancelLabel: 'Cancel',
                            warning: true
                        });
                        if (!choice) return;
                        if (choice === true && missingDraftedIndices.length > 0) {
                            shouldGenerateMissing = true;
                        }
                    }

                    setIsExportingSequenceAudio(true);
                    try {
                        if (shouldGenerateMissing) {
                            for (let mi = 0; mi < missingDraftedIndices.length; mi++) {
                                const mIdx = missingDraftedIndices[mi];
                                showToast(`Sequence ${plan.seqNum}: Generating Scene ${plan.seqNum}.${mIdx + 1} (${mi + 1}/${missingDraftedIndices.length})...`, "info");
                                await generateAndStoreSceneAudio(targetSeq, mIdx, {
                                    triggerDownload: false,
                                    forceRegenerate: true,
                                    onProgress: ({ current, total, stage, speaker }) => {
                                        if (stage === 'synthesizing' && total > 0) {
                                            showToast(`[Scene ${plan.seqNum}.${mIdx + 1}] ${speaker || 'Synthesizing'} (${current}/${total})...`, "info");
                                        }
                                    }
                                });
                            }
                            if (window.audioStore && currentStory?.id) {
                                storedSceneRecords = await window.audioStore.getAllStoryAudioRecords(currentStory.id);
                                plan = resolveSequenceAudioPlan(currentStory, targetSeq, storedSceneRecords, storedSeqRecord);
                            }
                        }

                        showToast(`Stitching ${plan.items.length} scene audio track(s) for Sequence ${plan.seqNum}...`, "info");
                        const mp3Blob = await stitchAudioBlobsToMp3(plan.items, {
                            kbps: 128,
                            defaultPauseMs: 2000,
                            onProgress: ({ current, total, label }) => {
                                if (total > 1) {
                                    showToast(`Stitching Sequence ${plan.seqNum} MP3 (${current}/${total}: ${label})...`, "info");
                                }
                            }
                        });

                        const cleanStory = String(currentStory?.title || "Story").replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || "Story";
                        const cleanSeqTitle = String(plan.seqTitle || `Sequence_${plan.seqNum}`).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || `Sequence_${plan.seqNum}`;
                        const fileName = `${cleanStory}_Sequence_${plan.seqNum}_${cleanSeqTitle}.mp3`.replace(/\s+/g, '_');

                        downloadBlob(mp3Blob, fileName);
                        showToast(`Sequence MP3 downloaded: ${fileName}`, "success");
                    } catch (err) {
                        console.error("Failed to stitch sequence MP3:", err);
                        showToast(`Sequence audio stitching failed: ${err.message || 'Unknown error'}`, "error");
                    } finally {
                        setIsExportingSequenceAudio(false);
                    }
                    return;
                }

                // No scenes generated yet: generate & store each drafted scene individually first, then stitch & download
                const draftedIndices = [];
                sceneList.forEach((_, sIdx) => {
                    if (getSceneProseText(currentStory, targetSeq, sIdx)) {
                        draftedIndices.push(sIdx);
                    }
                });

                if (draftedIndices.length === 0) {
                    showToast(`No prose drafted in Sequence ${seqNum} to generate audio.`, "warning");
                    return;
                }

                setIsExportingSequenceAudio(true);
                showToast(`Generating ${draftedIndices.length} scene(s) for Sequence ${seqNum}...`, "info");

                try {
                    const generatedItems = [];
                    const sceneHashes = {};
                    let totalDurationSec = 0;
                    for (let di = 0; di < draftedIndices.length; di++) {
                        const sIdx = draftedIndices[di];
                        showToast(`Sequence ${seqNum}: Generating Scene ${seqNum}.${sIdx + 1} (${di + 1}/${draftedIndices.length})...`, "info");
                        const scResult = await generateAndStoreSceneAudio(targetSeq, sIdx, {
                            triggerDownload: false,
                            forceRegenerate: false,
                            onProgress: ({ current, total, stage, speaker }) => {
                                if (stage === 'synthesizing' && total > 0) {
                                    showToast(`[Scene ${seqNum}.${sIdx + 1}] ${speaker || 'Synthesizing'} (${current}/${total})...`, "info");
                                }
                            }
                        });
                        const blob = scResult?.mp3Blob || scResult?.blob;
                        if (blob) {
                            generatedItems.push({ blob, label: `Scene ${seqNum}.${sIdx + 1}` });
                            totalDurationSec += Number(scResult?.durationSec || 0);
                            sceneHashes[String(sIdx)] = scResult?.textHash || computeSceneProseHash(getSceneProseText(currentStory, targetSeq, sIdx));
                        }
                    }

                    if (generatedItems.length === 0) {
                        throw new Error("No scene audio tracks were produced.");
                    }

                    showToast(`Sequence ${seqNum}: Stitching ${generatedItems.length} scenes into master MP3...`, "info");
                    const stitchedBlob = await stitchAudioBlobsToMp3(generatedItems, {
                        kbps: 128,
                        defaultPauseMs: 2000,
                        onProgress: ({ current, total, label }) => {
                            if (total > 1) {
                                showToast(`Stitching Sequence ${seqNum} MP3 (${current}/${total}: ${label})...`, "info");
                            }
                        }
                    });

                    const cleanStory = String(currentStory?.title || "Story").replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || "Story";
                    const cleanSeqTitle = String(seq?.title || `Sequence_${seqNum}`).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || `Sequence_${seqNum}`;
                    const fileName = `${cleanStory}_Sequence_${seqNum}_${cleanSeqTitle}.mp3`.replace(/\s+/g, '_');
                    downloadBlob(stitchedBlob, fileName);

                    if (window.audioStore && typeof window.audioStore.saveSequenceAudio === 'function' && currentStory?.id) {
                        try {
                            await window.audioStore.saveSequenceAudio({
                                storyId: currentStory.id,
                                seqIdx: targetSeq,
                                blob: stitchedBlob,
                                durationSec: totalDurationSec,
                                includedSceneIndices: draftedIndices,
                                totalScenesInStructure: sceneList.length,
                                sceneHashes
                            });
                            await refreshAvailableSceneAudio(currentStory.id);
                        } catch (saveErr) {
                            console.warn("Failed saving sequence audio cache:", saveErr);
                        }
                    }

                    showToast(`Sequence MP3 downloaded: ${fileName}`, "success");
                } catch (err) {
                    console.error("Failed to export sequence MP3:", err);
                    showToast(`Sequence audio export failed: ${err.message || 'Unknown error'}`, "error");
                } finally {
                    setIsExportingSequenceAudio(false);
                }
            };

            const handleDownloadStoryAudio = async () => {
                if (isExportingStoryAudio || isExportingSequenceAudio || isExportingSceneAudio) return;

                const currentStory = storyRef.current || story;
                if (!currentStory?.id || !window.audioStore) {
                    showToast("No story audio storage available.", "warning");
                    return;
                }

                let allSceneRecords = [];
                let allSeqRecords = [];
                try {
                    allSceneRecords = await window.audioStore.getAllStoryAudioRecords(currentStory.id);
                    if (typeof window.audioStore.getAllStorySequenceAudioRecords === 'function') {
                        allSeqRecords = await window.audioStore.getAllStorySequenceAudioRecords(currentStory.id);
                    }
                } catch (err) {
                    console.error("Failed reading AudioStore for full novel export:", err);
                    showToast(`Failed reading stored audio: ${err.message || 'Unknown error'}`, "error");
                    return;
                }

                const plan = buildStoryAudioExportPlan(currentStory, allSceneRecords, allSeqRecords);

                if (plan.items.length === 0) {
                    showToast("No generated scene or sequence audio found yet. Run Audio Autopilot or generate scene/sequence audio first.", "warning");
                    return;
                }

                if (plan.status === 'missing_in_structure') {
                    let msg = `Audio is missing within the story structure for: ${plan.missingBeforeSummary}.`;
                    if (plan.missingAfterLast.length > 0 && plan.missingAfterSummary) {
                        msg += `\n\nTrailing item(s) without audio: ${plan.missingAfterSummary}.`;
                    }
                    msg += `\n\nCurrently ${plan.coveredSceneCount} of ${plan.totalOutlinedScenes} scenes (${plan.coveredSeqCount} of ${plan.totalSeqs} sequences) have audio. Exporting will skip the missing scenes/sequences without duplicating overlapping audio. Continue?`;
                    const confirmed = await requestConfirm({
                        title: 'Missing Scenes in Story Structure',
                        message: msg,
                        confirmLabel: 'Export Available Audio',
                        cancelLabel: 'Cancel',
                        warning: true
                    });
                    if (!confirmed) return;
                } else if (plan.status === 'incomplete') {
                    const msg = `Story MP3 is incomplete: audio is available for ${plan.coveredSceneCount} of ${plan.totalOutlinedScenes} scenes (${plan.coveredSeqCount} of ${plan.totalSeqs} sequences).\n\nNot yet generated: ${plan.missingAfterSummary}.\n\nDo you want to stitch and export the available audio as an incomplete Story MP3?`;
                    const confirmed = await requestConfirm({
                        title: 'Incomplete Story MP3',
                        message: msg,
                        confirmLabel: 'Export Incomplete MP3',
                        cancelLabel: 'Cancel',
                        warning: true
                    });
                    if (!confirmed) return;
                }

                setIsExportingStoryAudio(true);
                showToast(`Stitching full story MP3 (${plan.items.length} audio clip${plan.items.length === 1 ? '' : 's'})...`, "info");

                try {
                    const mp3Blob = await stitchAudioBlobsToMp3(plan.items, {
                        kbps: 128,
                        defaultPauseMs: 2000,
                        onProgress: ({ current, total, label }) => {
                            if (total > 1) {
                                showToast(`Stitching Novel MP3 (${current}/${total}: ${label})...`, "info");
                            }
                        }
                    });

                    const cleanStory = String(currentStory?.title || "Novel").replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || "Novel";
                    const suffix = currentStory?.writing_mode === 'audio_drama' ? 'Full_AudioDrama' : 'Full_Novel';
                    const fileName = `${cleanStory}_${suffix}.mp3`.replace(/\s+/g, '_');

                    downloadBlob(mp3Blob, fileName);
                    showToast(`Full story MP3 downloaded: ${fileName}`, "success");
                } catch (err) {
                    console.error("Failed to export full story MP3:", err);
                    showToast(`Story MP3 export failed: ${err.message || 'Unknown error'}`, "error");
                } finally {
                    setIsExportingStoryAudio(false);
                }
            };

            const advanceToNextAudioScene = (fromSeq, fromScene, prevSourceMode = null) => {
                const flatList = flatStoryScenesRef.current || [];
                const audioMap = availableSceneAudioMapRef.current || {};
                const currentStory = storyRef.current || story;
                const curIdx = flatList.findIndex(s => s.seqIdx === Number(fromSeq) && s.sceneIdx === Number(fromScene));

                let nextFlatItem = null;
                if (curIdx >= 0) {
                    for (let i = curIdx + 1; i < flatList.length; i++) {
                        const it = flatList[i];
                        const nextId = `${it.seqIdx}-${it.sceneIdx}`;
                        if (getSceneProseText(currentStory, it.seqIdx, it.sceneIdx) || audioMap[nextId]) {
                            nextFlatItem = it;
                            break;
                        }
                    }
                }

                if (nextFlatItem) {
                    setTtsStatusMessage(`Next: Scene ${nextFlatItem.seqIdx + 1}.${nextFlatItem.sceneIdx + 1}...`);
                    if (ttsCadenceTimerRef.current) clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = setTimeout(() => {
                        ttsCadenceTimerRef.current = null;
                        playSceneAudio(nextFlatItem.seqIdx, nextFlatItem.sceneIdx, {
                            autoplay: true,
                            follow: isFollowingAudioRef.current,
                            isAutoAdvance: true,
                            prevSourceMode
                        });
                    }, 1200);
                } else {
                    setIsPlayingMasterSceneMp3(false);
                    isPlayingMasterSceneMp3Ref.current = false;
                    setTtsStatusAndRef('ready');
                    setTtsStatusMessage("Finished listening");
                    setTtsCurrentTime(0);
                    setAudioDramaActiveSpeaker(null);
                    setAudioDramaActiveEmotion(null);
                }
            };

            const playSceneAudio = async (targetSeq = selectedSequence, targetScene = selectedScene, opts = {}) => {
                stopAuditionPlayback();
                const sSeq = Number(targetSeq ?? 0);
                const sSc = Number(targetScene ?? 0);
                const sId = `${sSeq}-${sSc}`;
                const follow = opts?.follow !== false;
                const autoplay = opts?.autoplay !== false;

                if (ttsCadenceTimerRef.current) {
                    clearTimeout(ttsCadenceTimerRef.current);
                    ttsCadenceTimerRef.current = null;
                }

                unlockBrowserAudioElement();

                const myPlaySession = ttsSessionIdRef.current + 1;
                ttsSessionIdRef.current = myPlaySession;
                abortPendingTtsRequests();

                const nextLoc = { seqIdx: sSeq, sceneIdx: sSc };
                ttsPlayingSceneRef.current = nextLoc;
                setTtsPlayingScene(nextLoc);

                if (follow) {
                    isFollowingAudioRef.current = true;
                    setIsFollowingAudio(true);
                    if (viewRef.current === 'reader' && (sSeq !== selectedSequence || sSc !== selectedScene)) {
                        jumpToReaderScene(sSeq, sSc, 'next', true);
                    }
                }

                const currentStory = storyRef.current || story;
                const liveProseForCheck = getSceneProseText(currentStory, sSeq, sSc);
                let storedRecord = null;
                try {
                    if (window.audioStore && currentStory?.id) {
                        const candidateRecord = await window.audioStore.getSceneAudio(currentStory.id, sSeq, sSc);
                        if (candidateRecord && candidateRecord.blob) {
                            const freshness = isStoredSceneAudioFresh(candidateRecord, liveProseForCheck, currentStory, audioDramaSettingsRef.current || audioDramaSettings);
                            if (freshness.fresh) {
                                storedRecord = candidateRecord;
                            } else {
                                console.log(`[Audio Playback] Bypassing stale stored scene audio for Scene ${sSeq + 1}.${sSc + 1} (reason: ${freshness.reason}); synthesizing with updated voice/prose.`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Failed to check AudioStore for scene audio:", e);
                }
                if (myPlaySession !== ttsSessionIdRef.current) return;

                if (storedRecord && storedRecord.blob) {
                    if (opts?.isAutoAdvance && opts?.prevSourceMode === 'live') {
                        showToast(`Switched back to saved audio for Scene ${sSeq + 1}.${sSc + 1}`, "info", { durationMs: 4500 });
                    }

                    if (currentMasterAudioBlobUrlRef.current) {
                        try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                        currentMasterAudioBlobUrlRef.current = null;
                    }
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        try { window.speechSynthesis.cancel(); } catch (e) { }
                    }
                    if (ttsWorkerRef.current) {
                        try { ttsWorkerRef.current.postMessage({ type: 'clear' }); } catch (e) { }
                    }
                    clearTtsWatchdog();
                    ttsQueueRef.current.forEach(c => {
                        if (c.audioUrl) try { URL.revokeObjectURL(c.audioUrl); } catch (e) { }
                    });
                    ttsPendingRequestsRef.current.clear();

                    const proseText = getSceneProseText(currentStory, sSeq, sSc);
                    const isDramaStory = currentStory?.writing_mode === 'audio_drama';
                    let timelineWasEstimated = !(Array.isArray(storedRecord.cueTimeline) && storedRecord.cueTimeline.length > 0);
                    const rawTimeline = timelineWasEstimated
                        ? (typeof window.buildEstimatedCueTimeline === 'function'
                            ? window.buildEstimatedCueTimeline(proseText, storedRecord.durationSec || 60, isDramaStory)
                            : [])
                        : storedRecord.cueTimeline;

                    const cueQueue = (rawTimeline || []).map(cue => ({
                        ...cue,
                        seqIdx: sSeq,
                        sceneIdx: sSc,
                        engine: 'stored_mp3',
                        speaker: cue.speaker || null
                    }));

                    setIsPlayingMasterSceneMp3(true);
                    isPlayingMasterSceneMp3Ref.current = true;
                    setIsAudioDramaModeActiveAndRef(isDramaStory);

                    const srcMeta = { mode: 'stored', tier: null, backend: 'stored_mp3', engineLabel: 'Saved Audio', sceneKey: sId };
                    ttsResolvedSourceRef.current = srcMeta;
                    setTtsResolvedSource(srcMeta);

                    setTtsQueueAndRef(cueQueue);
                    setTtsCurrentChunkIndexAndRef(0);
                    setTtsCurrentTime(0);
                    setTtsDuration(storedRecord.durationSec || 0);
                    setTtsIsMiniPlayerVisible(true);
                    setTtsError(null);
                    setTtsStatusMessage("");
                    setAudioDramaActiveSpeaker(null);
                    setAudioDramaActiveEmotion(null);

                    const blobUrl = URL.createObjectURL(storedRecord.blob);
                    currentMasterAudioBlobUrlRef.current = blobUrl;

                    let audio = ttsAudioRef.current;
                    if (!audio) {
                        audio = new Audio();
                        audio.preload = 'auto';
                        ttsAudioRef.current = audio;
                    }

                    audio.loop = false;
                    const activeSpeed = readerSettingsRef.current?.ttsSpeed || window._ellipsisTtsPlaybackRate || 1.0;
                    audio.playbackRate = Number(activeSpeed) || 1.0;
                    audio.src = blobUrl;

                    audio.onloadedmetadata = () => {
                        if (myPlaySession !== ttsSessionIdRef.current) return;
                        if (Number.isFinite(audio.duration) && audio.duration > 0) {
                            setTtsDuration(audio.duration);
                            if (timelineWasEstimated && Array.isArray(ttsQueueRef.current) && ttsQueueRef.current.length > 0) {
                                timelineWasEstimated = false;
                                const estTotal = ttsQueueRef.current[ttsQueueRef.current.length - 1]?.endSec || 60;
                                if (estTotal > 0) {
                                    const scale = audio.duration / estTotal;
                                    const rescaled = ttsQueueRef.current.map(item => ({
                                        ...item,
                                        startSec: Number(((item.startSec || 0) * scale).toFixed(2)),
                                        endSec: Number(((item.endSec || 0) * scale).toFixed(2))
                                    }));
                                    setTtsQueueAndRef(rescaled);
                                }
                            }
                        }
                    };

                    audio.ontimeupdate = () => {
                        if (myPlaySession !== ttsSessionIdRef.current) return;
                        const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
                        setTtsCurrentTime(t);
                        if (Number.isFinite(audio.duration) && audio.duration > 0) {
                            setTtsDuration(audio.duration);
                        }
                        const q = ttsQueueRef.current;
                        if (q && q.length > 0 && q[0]?.startSec !== undefined) {
                            let lo = 0, hi = q.length - 1, best = 0;
                            while (lo <= hi) {
                                const mid = (lo + hi) >> 1;
                                if ((q[mid].startSec ?? 0) <= t + 0.05) {
                                    best = mid;
                                    lo = mid + 1;
                                } else {
                                    hi = mid - 1;
                                }
                            }
                            if (best !== ttsCurrentChunkIndexRef.current) {
                                setTtsCurrentChunkIndexAndRef(best);
                            }
                        }
                    };

                    audio.onended = () => {
                        if (myPlaySession !== ttsSessionIdRef.current) return;
                        if (currentMasterAudioBlobUrlRef.current) {
                            try { URL.revokeObjectURL(currentMasterAudioBlobUrlRef.current); } catch (e) { }
                            currentMasterAudioBlobUrlRef.current = null;
                        }
                        advanceToNextAudioScene(sSeq, sSc, 'stored');
                    };

                    audio.onerror = (e) => {
                        if (myPlaySession !== ttsSessionIdRef.current) return;
                        if (!audio.src || audio.src === 'about:blank' || audio.src === window.location.href || audio.src === SILENT_WAV_DATA_URI) return;
                        console.error("Master MP3 playback error:", JSON.stringify({ code: audio.error?.code, message: audio.error?.message, readyState: audio.readyState, networkState: audio.networkState }), e);
                        setIsPlayingMasterSceneMp3(false);
                        isPlayingMasterSceneMp3Ref.current = false;
                        setTtsStatusAndRef('error');
                        setTtsError({ title: "Playback Error", message: "Failed to play saved scene audio." });
                    };

                    if (autoplay) {
                        setTtsStatusAndRef('playing');
                        audio.play().then(() => {
                            window._ellipsisAudioUnlocked = true;
                            if (myPlaySession === ttsSessionIdRef.current) setTtsStatusAndRef('playing');
                        }).catch(err => {
                            console.warn("audio.play() paused/interrupted:", err);
                            if (myPlaySession === ttsSessionIdRef.current) setTtsStatusAndRef('paused');
                        });
                    } else {
                        setTtsStatusAndRef('paused');
                    }
                    return;
                }

                // Fallback to unified 4-tier live TTS for this scene
                setIsPlayingMasterSceneMp3(false);
                isPlayingMasterSceneMp3Ref.current = false;
                const proseText = getSceneProseText(currentStory, sSeq, sSc);
                if (proseText) {
                    startTtsFromProse(proseText, 0, {
                        seqIdx: sSeq,
                        sceneIdx: sSc,
                        isAutoAdvance: Boolean(opts?.isAutoAdvance),
                        prevSourceMode: opts?.prevSourceMode || null
                    });
                } else if (opts?.isAutoAdvance) {
                    advanceToNextAudioScene(sSeq, sSc, opts?.prevSourceMode || null);
                } else {
                    showToast("No audio or drafted prose found for this scene.", "warning");
                }
            };

            const skipAudioScene = (delta) => {
                const currentStory = storyRef.current || story;
                const audioMap = availableSceneAudioMapRef.current || {};
                const playable = (flatStoryScenesRef.current || []).filter(sc =>
                    Boolean(getSceneProseText(currentStory, sc.seqIdx, sc.sceneIdx) || audioMap[`${sc.seqIdx}-${sc.sceneIdx}`])
                );
                if (!playable.length) return;
                const activeLoc = ttsPlayingSceneRef.current || { seqIdx: selectedSequence ?? 0, sceneIdx: selectedScene ?? 0 };
                let baseIdx = playable.findIndex(sc => sc.seqIdx === Number(activeLoc.seqIdx) && sc.sceneIdx === Number(activeLoc.sceneIdx));
                if (baseIdx < 0) baseIdx = 0;
                const target = playable[baseIdx + delta];
                if (!target) return;
                playSceneAudio(target.seqIdx, target.sceneIdx, { autoplay: true, follow: true });
            };

            const playStoredOrLiveSceneAudio = async (targetSeq = selectedSequence, targetScene = selectedScene, scopeOrOpts = null) => {
                const opts = (scopeOrOpts && typeof scopeOrOpts === 'object') ? scopeOrOpts : {};
                if (opts.enterReader) {
                    enterReaderMode(Number(targetSeq ?? 0), Number(targetScene ?? 0));
                }
                return playSceneAudio(Number(targetSeq ?? 0), Number(targetScene ?? 0), {
                    autoplay: opts.autoplay !== false,
                    follow: opts.follow !== false
                });
            };

            const [expandedSequences, setExpandedSequences] = useState({});

            const toggleSequence = (seqIdx) => {
                setExpandedSequences(prev => ({
                    ...prev,
                    [seqIdx]: !prev[seqIdx]
                }));
            };

            const toggleAllSequencesInAct = (actIdx, expand = true, targetSeqIndices = null) => {
                if (Array.isArray(targetSeqIndices)) {
                    setExpandedSequences(prev => {
                        const next = { ...prev };
                        targetSeqIndices.forEach(sIdx => {
                            next[sIdx] = expand;
                        });
                        return next;
                    });
                    return;
                }
                const actNumber = (story.acts && story.acts[actIdx] && parseActNumber(story.acts[actIdx].number, actIdx + 1)) || (actIdx + 1);
                setExpandedSequences(prev => {
                    const next = { ...prev };
                    (story.sequences || []).forEach((seq, sIdx) => {
                        const seqNum = seq.number != null ? seq.number : (sIdx + 1);
                        if (parseActNumber(seq.parent_act != null ? seq.parent_act : actForSequence(seqNum), actForSequence(seqNum)) === actNumber) {
                            next[sIdx] = expand;
                        }
                    });
                    return next;
                });
            };

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

            // GESM (Graph-Based Epistemic State Machine) UI States & Handlers
            const [epistemicViewTab, setEpistemicViewTab] = useState('gesm'); // 'gesm' | 'vault' | 'log'
            const [epistemicScrubberCoord, setEpistemicScrubberCoord] = useState('1.1');
            const [epistemicFilterChar, setEpistemicFilterChar] = useState('ALL');
            const [epistemicSearchQuery, setEpistemicSearchQuery] = useState('');
            const [editingPropModal, setEditingPropModal] = useState({
                isOpen: false,
                isNew: false,
                id: '',
                claim_text: '',
                subject_id: '',
                predicate: 'FACT',
                object_id: '',
                objective_truth: 'TRUE',
                world_valid_from_scene: '0.0',
                world_valid_to_scene: ''
            });
            const [editingBeliefModal, setEditingBeliefModal] = useState({
                isOpen: false,
                isNew: false,
                holder_id: '',
                proposition_id: '',
                stance: 'BELIEVES_TRUE',
                confidence: 0.85,
                source_type: 'DIRECT_OBSERVATION',
                source_agent_id: '',
                acquired_at_scene: '1.1',
                invalidated_at_scene: ''
            });

            const handleSaveProposition = (propData) => {
                setStory(prev => {
                    const currentGraph = ensureEpistemicGraph(prev);
                    const propId = propData.id ? String(propData.id).trim() : `prop_${Date.now()}`;
                    const nextProp = {
                        id: propId,
                        claim_text: propData.claim_text || "Unspecified proposition",
                        subject_id: normalizeEntityId(propData.subject_id || "world"),
                        predicate: (propData.predicate || "FACT").toUpperCase().trim(),
                        object_id: normalizeEntityId(propData.object_id || ""),
                        objective_truth: propData.objective_truth || "TRUE",
                        world_valid_from_scene: propData.world_valid_from_scene || "0.0",
                        world_valid_to_scene: propData.world_valid_to_scene || null
                    };
                    const nextProps = normalizeEpistemicPropositionsMap(currentGraph.propositions);
                    nextProps[propId] = { ...(nextProps[propId] || {}), ...nextProp };
                    return {
                        ...prev,
                        epistemic_graph: ensureEpistemicGraphAccessors({
                            ...currentGraph,
                            propositions: nextProps
                        })
                    };
                });
                setEditingPropModal(prev => ({ ...prev, isOpen: false }));
                showToast("Proposition saved to Epistemic Graph.", "success");
            };

            const handleDeleteProposition = (propId) => {
                requestConfirm({
                    title: `Delete Proposition "${propId}"?`,
                    message: `Are you sure you want to delete proposition "${propId}" and its associated character beliefs?`,
                    confirmLabel: "Delete Proposition",
                    danger: true,
                    onConfirm: () => {
                        setStory(prev => {
                            const currentGraph = ensureEpistemicGraph(prev);
                            const nextProps = normalizeEpistemicPropositionsMap(currentGraph.propositions);
                            delete nextProps[propId];
                            const sourceHolds = Array.isArray(currentGraph.holds_belief_edges)
                                ? currentGraph.holds_belief_edges
                                : (Array.isArray(currentGraph.first_order_edges) ? currentGraph.first_order_edges : []);
                            const nextFirstOrder = sourceHolds.filter(e => e.proposition_id !== propId);
                            const nextSecondOrder = (currentGraph.second_order_edges || []).filter(e => e.proposition_id !== propId);
                            return {
                                ...prev,
                                epistemic_graph: ensureEpistemicGraphAccessors({
                                    ...currentGraph,
                                    propositions: nextProps,
                                    holds_belief_edges: nextFirstOrder,
                                    second_order_edges: nextSecondOrder
                                })
                            };
                        });
                        showToast(`Proposition "${propId}" deleted.`, "info");
                    }
                });
            };

            const handleSaveBelief = (beliefData) => {
                setStory(prev => {
                    const currentGraph = ensureEpistemicGraph(prev);
                    const holderId = normalizeEntityId(beliefData.holder_id || "meta_reader");
                    const propId = beliefData.proposition_id;
                    const acquiredAt = beliefData.acquired_at_scene || "1.1";
                    const stance = beliefData.stance || "BELIEVES_TRUE";
                    const conf = typeof beliefData.confidence === 'number' ? Math.max(0, Math.min(1, beliefData.confidence)) : 0.85;

                    const sourceEdges = Array.isArray(currentGraph.holds_belief_edges)
                        ? currentGraph.holds_belief_edges
                        : (Array.isArray(currentGraph.first_order_edges) ? currentGraph.first_order_edges : []);
                    // Close any active edges for this holder and prop
                    const nextEdges = sourceEdges.map(e => {
                        if (e.holder_id === holderId && e.proposition_id === propId && (!e.invalidated_at_scene || compareSceneCoordinates(e.invalidated_at_scene, acquiredAt, prev) > 0)) {
                            return { ...e, invalidated_at_scene: acquiredAt };
                        }
                        return e;
                    });

                    if (stance !== 'UNAWARE') {
                        nextEdges.push({
                            holder_id: holderId,
                            proposition_id: propId,
                            stance,
                            confidence: conf,
                            source_type: beliefData.source_type || 'DIRECT_OBSERVATION',
                            source_agent_id: beliefData.source_agent_id ? normalizeEntityId(beliefData.source_agent_id) : null,
                            acquired_at_scene: acquiredAt,
                            invalidated_at_scene: beliefData.invalidated_at_scene || null,
                            emotional_charge: 0.5
                        });
                    }

                    return {
                        ...prev,
                        epistemic_graph: ensureEpistemicGraphAccessors({
                            ...currentGraph,
                            holds_belief_edges: nextEdges
                        })
                    };
                });
                setEditingBeliefModal(prev => ({ ...prev, isOpen: false }));
                showToast("Character belief saved to Epistemic Graph.", "success");
            };

            const handleInvalidateBelief = (edge, sceneCoord) => {
                setStory(prev => {
                    const currentGraph = ensureEpistemicGraph(prev);
                    const sourceEdges = Array.isArray(currentGraph.holds_belief_edges)
                        ? currentGraph.holds_belief_edges
                        : (Array.isArray(currentGraph.first_order_edges) ? currentGraph.first_order_edges : []);
                    const nextEdges = sourceEdges.map(e => {
                        if (e === edge || (e.holder_id === edge.holder_id && e.proposition_id === edge.proposition_id && e.acquired_at_scene === edge.acquired_at_scene)) {
                            return { ...e, invalidated_at_scene: sceneCoord };
                        }
                        return e;
                    });
                    return {
                        ...prev,
                        epistemic_graph: ensureEpistemicGraphAccessors({
                            ...currentGraph,
                            holds_belief_edges: nextEdges
                        })
                    };
                });
                showToast(`Belief invalidated at Scene ${sceneCoord}.`, "info");
            };

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

            // Prompt Log Detail Modal State (for Verbose Dossier, Thinking, and Response)
            const [logModalState, setLogModalState] = useState({
                isOpen: false,
                type: 'verbose', // 'verbose' | 'prompt' | 'thinking' | 'response'
                title: '',
                functionName: '',
                timestamp: '',
                model: '',
                tokens: null,
                content: '',
                entry: null
            });

            const openLogDetailModal = (typeOrEntry, maybeEntry) => {
                let type = typeOrEntry;
                let entry = maybeEntry;
                if (typeof typeOrEntry === 'object' && typeOrEntry !== null) {
                    entry = typeOrEntry;
                    type = typeof maybeEntry === 'string' ? maybeEntry : 'verbose';
                } else if (typeof maybeEntry === 'object' && maybeEntry !== null) {
                    entry = maybeEntry;
                    type = typeof typeOrEntry === 'string' ? typeOrEntry : 'verbose';
                } else if (typeof typeOrEntry === 'string' && typeof maybeEntry === 'string') {
                    entry = promptLog.find(l => l && (String(l.id) === String(typeOrEntry) || String(l.id) === String(maybeEntry))) || null;
                    type = (typeOrEntry === 'verbose' || typeOrEntry === 'thinking' || typeOrEntry === 'prompt' || typeOrEntry === 'response') ? typeOrEntry : (maybeEntry || 'verbose');
                }
                if (!entry) return;
                if (type === 'verbose') {
                    const verboseContent = formatVerboseLogEntry(entry);
                    setLogModalState({
                        isOpen: true,
                        type: 'verbose',
                        title: 'Complete Verbose Dossier & Parameters',
                        functionName: entry.function,
                        timestamp: entry.timestamp,
                        model: entry.modelUsed || '',
                        tokens: entry.tokensUsed,
                        content: verboseContent,
                        entry: entry
                    });
                } else if (type === 'thinking') {
                    const thinkingContent = entry.reasoningText || "(No internal thinking/reasoning trace was returned for this prompt execution.)";
                    const tokens = entry.thinkingTokens ?? entry.reasoningTokensUsed ?? 0;
                    setLogModalState({
                        isOpen: true,
                        type: 'thinking',
                        title: 'AI Thinking & Reasoning Trace',
                        functionName: entry.function,
                        timestamp: entry.timestamp,
                        model: entry.modelUsed || '',
                        tokens: tokens,
                        content: thinkingContent,
                        entry: entry
                    });
                } else if (type === 'prompt') {
                    let promptContent = "";
                    const effectiveSys = entry.finalSystemPrompt || entry.systemPrompt || "";
                    if (effectiveSys.trim()) {
                        promptContent += `=== SYSTEM PROMPT ===\n\n${effectiveSys.trim()}\n\n`;
                    }
                    if (entry.prompt && entry.prompt.trim()) {
                        promptContent += `=== USER PROMPT & INPUT DATA ===\n\n${entry.prompt.trim()}`;
                    }
                    if (!promptContent.trim()) {
                        promptContent = "(No prompt context recorded for this step.)";
                    }
                    const tokens = entry.promptTokens ?? (promptContent ? Math.round(promptContent.trim().split(/\s+/).length * 1.33) : null);
                    setLogModalState({
                        isOpen: true,
                        type: 'prompt',
                        title: 'Sent Prompt & Input Context',
                        functionName: entry.function,
                        timestamp: entry.timestamp,
                        model: entry.modelUsed || '',
                        tokens: tokens,
                        content: promptContent,
                        entry: entry
                    });
                } else {
                    const respContent = entry.response || entry.responseSnippet || "(No response output recorded.)";
                    const tokens = entry.responseTokens ?? (entry.tokensUsed ? Math.max(0, entry.tokensUsed - (entry.thinkingTokens || 0)) : null);
                    setLogModalState({
                        isOpen: true,
                        type: 'response',
                        title: 'AI Generated Response Output',
                        functionName: entry.function,
                        timestamp: entry.timestamp,
                        model: entry.modelUsed || '',
                        tokens: tokens,
                        content: respContent,
                        entry: entry
                    });
                }
            };

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

            const handleUpdateActionField = (actionIdx, field, value) => {
                setDirectivePlan(prev => {
                    if (!prev) return prev;
                    const nextActions = [...prev.actions];
                    if (nextActions[actionIdx]) {
                        nextActions[actionIdx] = {
                            ...nextActions[actionIdx],
                            [field]: value,
                            ...(['target_seq_idx', 'target_sequence_idx'].includes(field)
                                ? { target_seq_idx: value, target_sequence_idx: value } : {})
                        };
                    }
                    return { ...prev, actions: nextActions };
                });
            };

            const handleUpdateActionDetail = (actionIdx, detailField, value) => {
                setDirectivePlan(prev => {
                    if (!prev) return prev;
                    const nextActions = [...prev.actions];
                    if (nextActions[actionIdx]) {
                        nextActions[actionIdx] = {
                            ...nextActions[actionIdx],
                            details: {
                                ...(nextActions[actionIdx].details || {}),
                                [detailField]: value
                            }
                        };
                    }
                    return { ...prev, actions: nextActions };
                });
            };

            const handleUpdateAppliedEdit = (actionIdx, editIdx, updates, isCascade = false) => {
                setDirectivePlan(prev => prev ? {
                    ...prev,
                    actions: prev.actions.map((action, index) => index === actionIdx && action.result ? {
                        ...action,
                        result: {
                            ...action.result,
                            ...(isCascade ? {
                                cascade: { ...action.result.cascade, appliedEdits: action.result.cascade.appliedEdits.map((edit, index) => index === editIdx ? { ...edit, ...updates } : edit) }
                            } : {
                                appliedEdits: action.result.appliedEdits.map((edit, index) => index === editIdx ? { ...edit, ...updates } : edit)
                            })
                        }
                    } : action)
                } : prev);
            };

            const handleToggleDirectiveActionSkip = (actionIdx) => {
                setDirectivePlan(prev => prev ? {
                    ...prev,
                    actions: prev.actions.map((action, idx) => idx === actionIdx ? { ...action, skipped: !action.skipped } : action)
                } : prev);
            };

            const handleRemoveDirectiveAction = (actionIdx) => {
                setDirectivePlan(prev => {
                    if (!prev) return prev;
                    const nextActions = prev.actions.filter((_, idx) => idx !== actionIdx);
                    return { ...prev, actions: nextActions };
                });
                setExpandedDirectiveActions(prev => {
                    const next = {};
                    Object.entries(prev || {}).forEach(([k, v]) => {
                        const n = parseInt(k, 10);
                        if (n < actionIdx && v) next[n] = true;
                        else if (n > actionIdx && v) next[n - 1] = true;
                    });
                    return next;
                });
            };

            const handleAddManualDirectiveAction = () => {
                if (isPlanningDirective || isExecutingDirective) return;
                const stats = computeDirectiveStoryStats(story);
                const newAction = stats.firstUnwrittenSeq
                    ? {
                        action_type: 'PERSIST_FUTURE_MANDATE',
                        target_act_idx: Math.max(0, parseActNumber(story.sequences?.[stats.firstUnwrittenSeq.seqIdx]?.parent_act, 1) - 1),
                        target_seq_idx: stats.firstUnwrittenSeq.seqIdx,
                        target_sequence_idx: stats.firstUnwrittenSeq.seqIdx,
                        target_scene_idx: 0,
                        description: `Guide future scenes in Sequence ${stats.firstUnwrittenSeq.number}`,
                        details: { target_scope: 'sequence', mandate_label: 'Direction', mandate_text: '' }
                    }
                    : stats.hasOutline
                        ? {
                            action_type: 'ADD_SCENE',
                            target_act_idx: 0,
                            target_seq_idx: 0,
                            target_sequence_idx: 0,
                            target_scene_idx: 0,
                            description: 'Add new scene blueprint to Sequence 1',
                            details: { title: '', scene_type: 'PROACTIVE', pov_character: stats.firstCastName || '', objective: '', scene_events: '' }
                        }
                        : {
                            action_type: 'MODIFY_STORY_METADATA',
                            target_act_idx: 0,
                            target_seq_idx: 0,
                            target_sequence_idx: 0,
                            target_scene_idx: 0,
                            description: "Update global Author's Note",
                            details: { author_note: story.author_note || '' }
                        };
                const nextIdx = directivePlan?.actions?.length || 0;
                setExpandedDirectiveActions(exp => ({ ...exp, [nextIdx]: true }));
                setDirectivePlan(prev => {
                    const base = prev || { evaluation: 'Custom manual directive plan.', scope_kind: 'local', consistency_notes: '', actions: [] };
                    return { ...base, actions: [...base.actions, newAction] };
                });
            };

            const handleUndoSurgicalEdit = (actionIdx, editIdx, isCascade = false) => {
                if (isPlanningDirective || isExecutingDirective) return;
                const result = directivePlan?.actions[actionIdx]?.result;
                const edit = (isCascade ? result?.cascade : result)?.appliedEdits?.[editIdx];
                if (!edit || edit.undone) return;
                // Keep the scene used at execution, even if the action's target controls were later edited.
                const sId = result.proseSceneId;
                if (!sId) return;
                const currentProse = story.prose?.[sId]?.final || '';
                const match = locateNeedle(currentProse, edit.after);
                if (!match) return;
                const restored = currentProse.slice(0, match.start) + edit.before + currentProse.slice(match.end);
                setStory(prev => ({
                    ...prev,
                    prose: {
                        ...prev.prose, [sId]: {
                            ...prev.prose[sId], final: restored,
                            ...(isCascade ? { stale: { reason: 'A scene-to-prose cascade edit was undone.', at: Date.now() } } : {})
                        }
                    }
                }));
                handleUpdateAppliedEdit(actionIdx, editIdx, { undone: true }, isCascade);
                // User-driven undo never launches verification; prior verdicts no longer describe this prose.
                setDirectivePlan(prev => prev ? {
                    ...prev, consistencyReview: undefined,
                    actions: prev.actions.map(action => action.result?.proseSceneId === sId ? {
                        ...action, result: { ...action.result, review: undefined }
                    } : action)
                } : prev);
            };

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

            const handleAddNovelIgnoreRule = () => {
                if (!novelIgnoreDraftRule.pattern.trim()) {
                    showToast("Enter a phrase or rule pattern for .novelignore.", "warning");
                    return;
                }
                setStory(prev => {
                    const existingRules = normalizeIntentionalOverrides(
                        prev.editorial_harness?.constitution?.intentionalOverrides || 
                        prev.editorial_harness?.customConstitutionOverrides || 
                        prev.editorial_harness?.novelignore
                    );
                    const nextRules = [...existingRules, {
                        rule_type: novelIgnoreDraftRule.rule_type || "ALLOW_PHRASE",
                        scope: novelIgnoreDraftRule.scope || "GLOBAL",
                        pattern: novelIgnoreDraftRule.pattern.trim(),
                        reason: novelIgnoreDraftRule.reason || "Intentional stylistic exemption"
                    }];
                    const nextConstitution = compileAestheticConstitution(prev, nextRules);
                    const nextHarness = {
                        ...(prev.editorial_harness || {}),
                        customConstitutionOverrides: nextRules,
                        constitution: nextConstitution
                    };
                    const updated = { ...prev, editorial_harness: nextHarness };
                    if (storyStore?.saveStory && updated.id) {
                        storyStore.saveStory(updated.id, updated).catch(() => {});
                    }
                    return updated;
                });
                setNovelIgnoreDraftRule(prev => ({ ...prev, pattern: '' }));
                showToast("Added rule to .novelignore constitution.", "success");
            };

            const handleRemoveNovelIgnoreRule = (idx) => {
                setStory(prev => {
                    const existingRules = normalizeIntentionalOverrides(
                        prev.editorial_harness?.constitution?.intentionalOverrides || 
                        prev.editorial_harness?.customConstitutionOverrides || 
                        prev.editorial_harness?.novelignore
                    );
                    const nextRules = existingRules.filter((_, i) => i !== idx);
                    const nextConstitution = compileAestheticConstitution(prev, nextRules);
                    const nextHarness = {
                        ...(prev.editorial_harness || {}),
                        customConstitutionOverrides: nextRules,
                        constitution: nextConstitution
                    };
                    const updated = { ...prev, editorial_harness: nextHarness };
                    if (storyStore?.saveStory && updated.id) {
                        storyStore.saveStory(updated.id, updated).catch(() => {});
                    }
                    return updated;
                });
                showToast("Removed .novelignore exemption rule.", "info");
            };

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
            useEffect(() => { safeLocalStorageSet("ellipsisprose_banned_phrases", bannedPhrases); }, [bannedPhrases]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_slop_config_v1", slopConfig); }, [slopConfig]);



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

            const handleDeleteLore = (index) => {
                requestConfirm({
                    title: "Delete Lore Item?",
                    message: "Are you sure you want to delete this lore item from world memory?",
                    confirmLabel: "Delete Lore",
                    danger: true,
                    onConfirm: () => {
                        setStory(prev => {
                            const newLore = [...prev.lore];
                            newLore.splice(index, 1);
                            return { ...prev, lore: newLore };
                        });
                        showToast("Lore item deleted.", "info");
                    }
                });
            };

            const clearStoryTtsArtifacts = async (targetStoryId) => {
                if (typeof stopTtsPlayback === 'function') {
                    stopTtsPlayback();
                }
                setIsAudioAutopilotRunning(false);
                isAudioAutopilotRunningRef.current = false;
                setIsAudioAutopilotQueued(false);
                isAudioAutopilotQueuedRef.current = false;
                if (audioAutopilotAbortRef.current) {
                    try { audioAutopilotAbortRef.current.abort(); } catch (_) {}
                    audioAutopilotAbortRef.current = null;
                }
                setAudioAutopilotProgress(null);

                if (targetStoryId && window.audioStore && typeof window.audioStore.deleteStoryAudio === 'function') {
                    try {
                        await window.audioStore.deleteStoryAudio(targetStoryId);
                    } catch (audioErr) {
                        console.warn('[handleResetStoryStage] Audio store cleanup warning:', audioErr);
                    }
                }
                if (targetStoryId && window.studioCacheStore && typeof window.studioCacheStore.clearRendersForStory === 'function') {
                    try {
                        await window.studioCacheStore.clearRendersForStory(targetStoryId);
                    } catch (cacheErr) {
                        console.warn('[handleResetStoryStage] Studio render cache cleanup warning:', cacheErr);
                    }
                }
                availableSceneAudioMapRef.current = {};
                setAvailableSceneAudioMap({});
                setAvailableSequenceAudioMap({});
            };

            const handleResetStoryStage = (stage, targetStoryObj = null) => {
                const cfg = STORY_RESET_STAGES[stage];
                if (!cfg) {
                    showToast(`Unknown reset stage: ${stage}`, 'error');
                    return Promise.resolve(false);
                }

                return requestConfirm({
                    title: cfg.title,
                    message: cfg.message,
                    confirmLabel: cfg.confirmLabel,
                    danger: true,
                    onConfirm: async () => {
                        try {
                            const sourceStory = targetStoryObj || storyRef.current || story;
                            if (cfg.ttsOnly || stage === 'tts') {
                                if (!sourceStory || typeof sourceStory !== 'object') {
                                    throw new Error('Cannot reset an empty story object.');
                                }
                                await clearStoryTtsArtifacts(sourceStory.id);
                                showToast(cfg.toastMessage, 'success');
                                return;
                            }

                            setContinuousAutopilot(false);
                            const { nextStory, removedCharIds, flags } = buildRolledBackStoryState(sourceStory, stage);

                            storyRef.current = nextStory;
                            setStory(nextStory);

                            if (nextStory.id && storyStore?.saveStory) {
                                try {
                                    await storyStore.saveStory(nextStory.id, nextStory, { allowRegression: true });
                                } catch (saveErr) {
                                    console.warn('[handleResetStoryStage] Failed saving reset story to storyStore:', saveErr);
                                }
                            }

                            setReadingProgress({});
                            if (nextStory.id) {
                                try {
                                    localStorage.removeItem(`ellipsisprose_reading_progress_${nextStory.id}`);
                                } catch (_) {}
                            }
                            if (prefetchCacheRef?.current) {
                                prefetchCacheRef.current.clear();
                            }

                            if (nextStory.id && imageStore) {
                                try {
                                    await imageStore.deleteImagesByPrefix(`scene_${nextStory.id}_`);
                                    await imageStore.deleteImagesByPrefix(`beat_${nextStory.id}_`);
                                    for (const charId of removedCharIds) {
                                        await imageStore.deleteImage(`portrait_${nextStory.id}_${charId}`);
                                    }
                                } catch (imgErr) {
                                    console.warn('[handleResetStoryStage] Scene/beat/portrait image cleanup warning:', imgErr);
                                }
                            }

                            setLoadedImages(prev => {
                                const nextPortraits = { ...(prev?.portraits || {}) };
                                removedCharIds.forEach(charId => { delete nextPortraits[charId]; });
                                return {
                                    ...(prev?.cover !== undefined ? { cover: prev.cover } : {}),
                                    portraits: nextPortraits
                                };
                            });

                            await clearStoryTtsArtifacts(nextStory.id);

                            if (flags.clearScenes) setSelectedScene(null);
                            if (flags.clearSequences) setSelectedSequence(null);
                            if (flags.clearActs) {
                                setSelectedAct(null);
                                setActiveActTab(0);
                                setCollapsedActs({});
                            }

                            setFeedbackLedger({});

                            const currentView = viewRef?.current || view;
                            if (flags.clearScenes && ['writer', 'chapter_dashboard', 'reader'].includes(currentView)) {
                                setView('structure');
                            } else if (flags.clearSequences && ['sequence_dashboard', 'chapter_dashboard', 'writer', 'reader'].includes(currentView)) {
                                setView('structure');
                            } else if (flags.clearActs && ['sequence_dashboard', 'chapter_dashboard', 'writer', 'reader', 'editorial'].includes(currentView)) {
                                setView('structure');
                            } else if (currentView === 'reader') {
                                setView('dashboard');
                            }

                            if (graphManager?.current) {
                                graphManager.current.buildGraph(nextStory.lore || []);
                            }
                            try {
                                localStorage.removeItem('ellipsisprose_rag_fingerprint');
                            } catch (_) {}

                            if (vectorStore?.current) {
                                try {
                                    await vectorStore.current.clear();
                                    if (nextStory.lore && nextStory.lore.length > 0 && embeddingService?.current?.isConfigured()) {
                                        ingestLoreBatch(nextStory.lore, {
                                            clearExisting: true,
                                            deduplicate: false,
                                            storyId: nextStory.id,
                                            fingerprintProcessed: false
                                        }).catch(err => console.warn('[handleResetStoryStage] Async RAG rebuild warning:', err));
                                    }
                                } catch (ragErr) {
                                    console.warn('[handleResetStoryStage] Vector store cleanup warning:', ragErr);
                                }
                            }

                            if (typeof refreshLibrary === 'function') {
                                refreshLibrary().catch(() => {});
                            }

                            showToast(cfg.toastMessage, 'success');
                        } catch (err) {
                            console.error('[handleResetStoryStage] Failed:', err);
                            showToast(`Story reset failed: ${err.message}`, 'error');
                        }
                    }
                });
            };
            window.handleResetStoryStage = handleResetStoryStage;

            const handleDeleteStory = async () => {
                requestConfirm({
                    title: "Factory Reset: Erase All Stories & Library?",
                    message: "WARNING: This will permanently delete ALL stories in your library, world lore, cast characters, outlines, generated prose, vector memory index, and custom covers from the entire app!\n\nThis application-wide reset cannot be undone. Are you absolutely sure you want to erase everything?",
                    confirmLabel: "Erase All Data",
                    danger: true,
                    onConfirm: async () => {
                        const defaultStory = createDefaultStoryTemplate('story_default');
                        setStory(defaultStory);
                        setActiveStoryId('story_default');
                        localStorage.removeItem("ellipsisprose_story");
                        localStorage.removeItem("ellipsisprose_active_story_id");
                        localStorage.removeItem("ellipsisprose_selectedAct");
                        localStorage.removeItem("ellipsisprose_selectedSequence");
                        localStorage.removeItem("ellipsisprose_selectedScene");
                        try {
                            await storyStore.clear();
                            await storyStore.saveStory('story_default', defaultStory);
                        } catch (err) {
                            console.warn("Failed to clear IndexedDB stories:", err);
                        }
                        try {
                            await imageStore.clear();
                        } catch (err) {
                            console.warn("Failed to clear IndexedDB images:", err);
                        }
                        try {
                            if (window.audioStore) await window.audioStore.clear();
                        } catch (err) {
                            console.warn("Failed to clear IndexedDB audio store:", err);
                        }
                        if (vectorStore.current) {
                            try {
                                await vectorStore.current.clear();
                            } catch (err) {
                                console.warn("Failed to clear RAG vector store:", err);
                            }
                        }
                        setSelectedAct(null);
                        setSelectedSequence(null);
                        setSelectedScene(null);
                        clearSetupDraft();
                        setLibraryStories([]);
                        setLibraryCovers({});
                        setView("setup");
                        showToast("All application data and stories erased.", "success");
                    }
                });
            };

            const handleStartEditCustomMode = (mode) => {
                setEditingModeId(mode.id);
                setNewModeId(mode.id);
                setNewModeContext(mode.context || "");
                setNewModePrompt(mode.prompt || "");
                setNewModeIcon(mode.icon || "tag");
            };

            const handleCancelEditCustomMode = () => {
                setEditingModeId(null);
                setNewModeId("");
                setNewModeContext("");
                setNewModePrompt("");
                setNewModeIcon("tag");
            };

            const handleSaveCustomMode = () => {
                const rawId = newModeId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
                if (!rawId) {
                    alert("Please enter a valid Mode ID.");
                    return;
                }
                if (NARRATIVE_MODES[rawId]) {
                    alert("This Mode ID conflicts with a built-in narrative mode.");
                    return;
                }
                if (editingModeId) {
                    if (rawId !== editingModeId && customModes[rawId]) {
                        alert("Another custom narrative mode with this ID already exists.");
                        return;
                    }
                } else {
                    if (customModes[rawId]) {
                        alert("A narrative mode with this ID already exists.");
                        return;
                    }
                }
                if (!newModeContext.trim()) {
                    alert("Please enter a description context for the mode.");
                    return;
                }
                if (!newModePrompt.trim()) {
                    alert("Please enter prompt instructions for the mode.");
                    return;
                }

                const updatedModeObj = {
                    id: rawId,
                    context: newModeContext.trim(),
                    prompt: newModePrompt.trim(),
                    icon: newModeIcon
                };

                if (editingModeId && editingModeId !== rawId) {
                    // Renaming mode ID: update customModes and cascade to story scenes
                    setCustomModes(prev => {
                        const next = { ...prev };
                        delete next[editingModeId];
                        next[rawId] = updatedModeObj;
                        return next;
                    });

                    setStory(prev => {
                        if (!prev || !prev.scenes) return prev;
                        let changed = false;
                        const updatedScenes = {};
                        Object.keys(prev.scenes).forEach(seqKey => {
                            const sceneList = prev.scenes[seqKey];
                            if (Array.isArray(sceneList)) {
                                updatedScenes[seqKey] = sceneList.map(s => {
                                    if (s && s.dominant_narrative_mode === editingModeId) {
                                        changed = true;
                                        return { ...s, dominant_narrative_mode: rawId };
                                    }
                                    return s;
                                });
                            } else {
                                updatedScenes[seqKey] = sceneList;
                            }
                        });
                        return changed ? { ...prev, scenes: updatedScenes } : prev;
                    });

                    showToast(`Custom mode updated to ${rawId}!`, 'success');
                } else {
                    // Adding new or updating in-place
                    setCustomModes(prev => ({
                        ...prev,
                        [rawId]: updatedModeObj
                    }));
                    showToast(editingModeId ? `Custom mode ${rawId} updated!` : `Custom mode ${rawId} added!`, 'success');
                }

                // Reset form
                handleCancelEditCustomMode();
            };

            const handleDeleteCustomMode = (modeId) => {
                requestConfirm({
                    title: `Delete Custom Mode "${modeId}"?`,
                    message: "Are you sure you want to delete this custom narrative mode?",
                    confirmLabel: "Delete Mode",
                    danger: true,
                    onConfirm: () => {
                        setCustomModes(prev => {
                            const next = { ...prev };
                            delete next[modeId];
                            return next;
                        });
                        if (editingModeId === modeId) {
                            handleCancelEditCustomMode();
                        }
                        showToast(`Custom mode ${modeId} deleted.`, 'info');
                    }
                });
            };




            const handleExport = () => {
                try {
                    exportStoryJson(story);
                } catch (err) { alert("Export failed: " + err.message); }
            };

            const handleExportAudioDramaTxt = () => {
                try {
                    const result = exportAudioDramaTxt(story);
                    if (result.sceneCount === 0) {
                        showToast("No drafted scenes found to export yet.", "info");
                        return;
                    }
                    showToast(`Exported full audio drama script (${result.sceneCount} scenes).`, "success");
                } catch (err) {
                    console.error("Audio drama export error:", err);
                    showToast("Export failed: " + err.message, "error");
                }
            };

            const handleExportEpub = async () => {
                try {
                    await exportStoryEpub(story, { imageStore, audioStore: window.audioStore });
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (msg.startsWith('Could not load the EPUB library')) {
                        showToast(msg, 'error');
                        return;
                    }
                    console.error(e);
                    showToast("EPUB Generation failed: " + msg, "error");
                }
            };

            const handleImport = async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                    const payload = await parseStoryImportFile(file);
                    const result = await persistImportedStory(payload, {
                        confirmOverwrite: ({ existingStoryId }) => requestConfirm({
                            title: "Story Already Exists",
                            message: `A story with ID "${existingStoryId}" already exists. Do you want to overwrite it, or import it as a new copy?`,
                            confirmLabel: "Overwrite",
                            cancelLabel: "Import as Copy",
                            danger: true
                        }),
                        storyStore,
                        imageStore,
                        audioStore: window.audioStore,
                        onAfterAudioImport: (newId) => refreshAvailableSceneAudio(newId)
                    });

                    storyRef.current = result.story;
                    setActiveStoryId(result.storyId);
                    setStory(result.story);
                    setLoadedImages({ cover: result.coverUrl || null });
                    setPortraitReload(value => value + 1);
                    setView('dashboard');

                    await refreshLibrary();

                    const { seqIdx: startSeq, sceneIdx: startSc } = result.firstSceneCoord;
                    showToast(
                        result.importedAudioCount > 0
                            ? `Ready with ${result.importedAudioCount} offline audio scene${result.importedAudioCount === 1 ? '' : 's'}`
                            : "Story imported and ready",
                        "success",
                        {
                            bookCard: {
                                title: result.story.title || 'Untitled Story',
                                coverSrc: result.coverUrl,
                                badge: 'Imported to Bookshelf',
                                story: result.story,
                                audioCount: result.importedAudioCount,
                                totalScenes: result.totalDraftedScenes || result.importedAudioCount || 0,
                                onRead: () => {
                                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                                    setToast(null);
                                    enterReaderMode(startSeq, startSc);
                                },
                                onListen: () => {
                                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                                    setToast(null);
                                    enterReaderMode(startSeq, startSc);
                                    setTimeout(() => playSceneAudio(startSeq, startSc, { autoplay: true, follow: true }), 120);
                                },
                                onStudio: () => {
                                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                                    setToast(null);
                                    setView('dashboard');
                                }
                            }
                        }
                    );
                } catch (error) {
                    showToast(error instanceof Error ? error.message : String(error), "error");
                } finally {
                    event.target.value = null;
                }
            };
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

            const handleBeatChange = (seqIdx, sceneIdx, beatIdx, fieldOrText, maybeText) => {
                let seq = seqIdx, s = sceneIdx, b = beatIdx;
                let field = 'action';
                let txt = '';

                if (maybeText !== undefined) {
                    seq = seqIdx;
                    s = sceneIdx;
                    b = beatIdx;
                    field = fieldOrText;
                    txt = maybeText;
                } else if (typeof fieldOrText === 'string') {
                    if (beatIdx !== undefined && typeof beatIdx === 'string') {
                        seq = selectedSequence !== null ? selectedSequence : 0;
                        s = seqIdx;
                        b = sceneIdx;
                        txt = beatIdx;
                        field = 'description';
                    } else {
                        txt = fieldOrText;
                        field = 'action';
                    }
                }

                const sId = `${seq}-${s}`;
                setStory(prev => {
                    const beatsList = prev.beats[sId] ? [...prev.beats[sId]] : [];
                    if (beatsList[b]) {
                        const existingBeat = beatsList[b];
                        const updatedBeat = { ...existingBeat };

                        if (field === 'action') {
                            updatedBeat.action = txt;
                            updatedBeat.char_A_action = txt;
                            const tactic = updatedBeat.char_A_tactic || updatedBeat.tactic || '';
                            const reaction = updatedBeat.char_B_reaction || updatedBeat.reaction || '';
                            const combined = `${tactic ? `[${tactic}] ` : ''}${txt}${reaction && reaction !== '—' ? ` -> ${reaction}` : ''}`.trim();
                            updatedBeat.description = combined;
                            updatedBeat.action_description = combined;
                        } else if (field === 'reaction') {
                            updatedBeat.reaction = txt;
                            updatedBeat.char_B_reaction = txt;
                            const tactic = updatedBeat.char_A_tactic || updatedBeat.tactic || '';
                            const action = updatedBeat.char_A_action || updatedBeat.action || '';
                            const combined = `${tactic ? `[${tactic}] ` : ''}${action}${txt && txt !== '—' ? ` -> ${txt}` : ''}`.trim();
                            updatedBeat.description = combined;
                            updatedBeat.action_description = combined;
                        } else {
                            updatedBeat[field] = txt;
                            updatedBeat.description = txt;
                            updatedBeat.action_description = txt;
                            if (!updatedBeat.action) {
                                updatedBeat.action = txt;
                                updatedBeat.char_A_action = txt;
                            }
                        }

                        beatsList[b] = updatedBeat;
                    }
                    return {
                        ...prev,
                        beats: {
                            ...prev.beats,
                            [sId]: beatsList
                        }
                    };
                });
            };


            const handleAddBeat = (seqIdx, sceneIdx, insertAfterIdx) => {
                let seq = seqIdx, s = sceneIdx, ins = insertAfterIdx;
                if (insertAfterIdx === undefined) {
                    seq = selectedSequence !== null ? selectedSequence : 0;
                    s = seqIdx;
                    ins = sceneIdx;
                }
                const sId = `${seq}-${s}`;
                setStory(prev => {
                    const currentBeats = prev.beats[sId] ? [...prev.beats[sId]] : [];
                    const newBeat = {
                        number: ins + 2,
                        beat_type: "DRAMATIC",
                        action: "",
                        reaction: "",
                        tactic: "",
                        description: "",
                        emotional_shift: "",
                        valence: 0
                    };
                    currentBeats.splice(ins + 1, 0, newBeat);
                    // Renumber all beats
                    const renumbered = currentBeats.map((bItem, i) => ({ ...bItem, number: i + 1 }));
                    return { ...prev, beats: { ...prev.beats, [sId]: renumbered } };
                });
                showToast(`Beat added after Beat ${ins + 1}`);
            };

            const handleDeleteBeat = (seqIdx, sceneIdx, beatIdx) => {
                let seq = seqIdx, s = sceneIdx, b = beatIdx;
                if (b === undefined) {
                    seq = selectedSequence !== null ? selectedSequence : 0;
                    s = seqIdx;
                    b = sceneIdx;
                }
                requestConfirm({
                    title: `Delete Beat ${b + 1}?`,
                    message: "This will remove the beat and its generated prose. This action cannot be undone.",
                    confirmLabel: "Delete Beat",
                    danger: true,
                    onConfirm: () => {
                        const sId = `${seq}-${s}`;
                        setStory(prev => {
                            const currentBeats = prev.beats[sId] ? [...prev.beats[sId]] : [];
                            if (currentBeats.length > b) {
                                currentBeats.splice(b, 1);
                            }
                            // Renumber remaining beats
                            const renumbered = currentBeats.map((bItem, i) => ({ ...bItem, number: i + 1 }));
                            return { ...prev, beats: { ...prev.beats, [sId]: renumbered } };
                        });
                        showToast(`Beat ${b + 1} deleted`);
                    }
                });
            };

            const handleDeleteScene = (seqIdx, sceneIdx) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                const sceneKey = `${sIdx}`;
                const seqScenes = story.scenes[sceneKey] || [];
                const scene = seqScenes[sceneIdx];
                if (!scene) return;

                requestConfirm({
                    title: `Delete Scene "${scene.title || `Scene ${sceneIdx + 1}`}"?`,
                    message: "This will remove all its beats and prose, and shift subsequent scenes. This cannot be undone.",
                    confirmLabel: "Delete Scene",
                    danger: true,
                    onConfirm: () => {
                        setStory(prev => {
                            const nextScenes = [...(prev.scenes[sceneKey] || [])];
                            const nextBeats = { ...prev.beats };
                            const nextProse = { ...prev.prose };
                            const numScenes = nextScenes.length;

                            const delKey = `${sIdx}-${sceneIdx}`;
                            delete nextBeats[delKey];
                            delete nextProse[delKey];

                            for (let idx = sceneIdx + 1; idx < numScenes; idx++) {
                                const oldKey = `${sIdx}-${idx}`;
                                const newKey = `${sIdx}-${idx - 1}`;

                                if (nextBeats[oldKey]) {
                                    nextBeats[newKey] = nextBeats[oldKey];
                                    delete nextBeats[oldKey];
                                }

                                if (nextProse[oldKey]) {
                                    nextProse[newKey] = nextProse[oldKey];
                                    delete nextProse[oldKey];
                                }
                            }

                            nextScenes.splice(sceneIdx, 1);

                            const sequenceNum = (prev.sequences?.[sIdx]?.number) || (sIdx + 1);
                            nextScenes.forEach((s, idx) => {
                                s.id = `${sequenceNum}.${idx + 1}`;
                                s.number = s.id;
                            });

                            return {
                                ...prev,
                                scenes: { ...prev.scenes, [sceneKey]: nextScenes },
                                beats: nextBeats,
                                prose: nextProse
                            };
                        });
                        showToast(`Deleted Scene "${scene.title || `Scene ${sceneIdx + 1}`}"`);
                    }
                });
                return;
                setStory(prev => {
                    const nextScenes = [...(prev.scenes[sceneKey] || [])];
                    const nextBeats = { ...prev.beats };
                    const nextProse = { ...prev.prose };
                    const numScenes = nextScenes.length;

                    const delKey = `${sIdx}-${sceneIdx}`;
                    delete nextBeats[delKey];
                    delete nextProse[delKey];

                    for (let idx = sceneIdx + 1; idx < numScenes; idx++) {
                        const oldKey = `${sIdx}-${idx}`;
                        const newKey = `${sIdx}-${idx - 1}`;

                        if (nextBeats[oldKey]) {
                            nextBeats[newKey] = nextBeats[oldKey];
                            delete nextBeats[oldKey];
                        }

                        if (nextProse[oldKey]) {
                            nextProse[newKey] = nextProse[oldKey];
                            delete nextProse[oldKey];
                        }
                    }

                    nextScenes.splice(sceneIdx, 1);

                    const sequenceNum = (prev.sequences?.[sIdx]?.number) || (sIdx + 1);
                    nextScenes.forEach((s, idx) => {
                        s.id = `${sequenceNum}.${idx + 1}`;
                        s.number = s.id;
                    });

                    return {
                        ...prev,
                        scenes: { ...prev.scenes, [sceneKey]: nextScenes },
                        beats: nextBeats,
                        prose: nextProse
                    };
                });
                showToast(`Deleted Scene "${scene.title || `Scene ${sceneIdx + 1}`}"`);
            };

            const updateSceneBlueprint = (seqIdx, sceneIdx, fieldUpdates = {}, options = {}) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                const scIdx = typeof sceneIdx === 'number' ? sceneIdx : (selectedScene !== null ? selectedScene : 0);
                const sceneKey = `${sIdx}`;
                const sId = `${sIdx}-${scIdx}`;
                let changedFieldsList = [];

                const updatedStory = setStory(prev => {
                    const prevSeqScenes = [...(prev.scenes?.[sceneKey] || [])];
                    const origScene = prevSeqScenes[scIdx];
                    if (!origScene) return prev;

                    const seqNum = (prev.sequences?.[sIdx]?.number) || (sIdx + 1);
                    const mergedUpdates = { ...(fieldUpdates || {}) };

                    if ('objective' in mergedUpdates && !('goal' in mergedUpdates)) {
                        mergedUpdates.goal = mergedUpdates.objective;
                    } else if ('goal' in mergedUpdates && !('objective' in mergedUpdates)) {
                        mergedUpdates.objective = mergedUpdates.goal;
                    }

                    if ('relationship_changes' in mergedUpdates && !('relationship_shifts' in mergedUpdates)) {
                        mergedUpdates.relationship_shifts = Array.isArray(mergedUpdates.relationship_changes) ? [...mergedUpdates.relationship_changes] : mergedUpdates.relationship_changes;
                    } else if ('relationship_shifts' in mergedUpdates && !('relationship_changes' in mergedUpdates)) {
                        mergedUpdates.relationship_changes = Array.isArray(mergedUpdates.relationship_shifts) ? [...mergedUpdates.relationship_shifts] : mergedUpdates.relationship_shifts;
                    }

                    if ('value_shift' in mergedUpdates) {
                        mergedUpdates.value_shift = parseValueShiftInput(mergedUpdates.value_shift);
                    }

                    if ('cast_names' in mergedUpdates || 'characters_present' in mergedUpdates || 'cast_ids' in mergedUpdates) {
                        const parseRawCastArr = (rawVal) => (Array.isArray(rawVal)
                            ? rawVal.map(x => typeof x === 'string' ? x.trim() : (x?.name || String(x || '')).trim())
                            : (typeof rawVal === 'string' ? rawVal.split(/[,;\n]+/).map(s => s.trim().replace(/^-\s*/, '')) : [])
                        ).filter(x => x && !isSerializationPlaceholder(x));
                        let parsedCastNames = 'cast_names' in mergedUpdates
                            ? parseRawCastArr(mergedUpdates.cast_names)
                            : ('characters_present' in mergedUpdates ? parseRawCastArr(mergedUpdates.characters_present) : parseRawCastArr(mergedUpdates.cast_ids));
                        if (parsedCastNames.length === 0 && 'cast_names' in mergedUpdates && 'characters_present' in mergedUpdates) {
                            parsedCastNames = parseRawCastArr(mergedUpdates.characters_present);
                        }
                        const castList = Array.isArray(prev.cast) ? prev.cast : [];
                        const deduped = [];
                        const seen = new Set();
                        parsedCastNames.forEach(entry => {
                            const matched = castList.find(c => c.id === entry || c.name?.toLowerCase() === entry.toLowerCase());
                            const displayName = matched ? matched.name : entry;
                            const key = displayName.toLowerCase();
                            if (!seen.has(key)) {
                                seen.add(key);
                                deduped.push(displayName);
                            }
                        });
                        mergedUpdates.cast_names = [...deduped];
                        mergedUpdates.characters_present = [...deduped];
                        mergedUpdates.cast_ids = deduped.map(name => {
                            const matched = castList.find(c => c.name?.toLowerCase() === name.toLowerCase());
                            return matched ? matched.id : name;
                        });
                    }

                    const normalized = normalizeSceneBlueprint({ ...origScene, ...mergedUpdates }, scIdx, seqNum, prev.cast || []);
                    normalized.id = origScene.id || `${seqNum}.${scIdx + 1}`;
                    normalized.number = origScene.number || `${seqNum}.${scIdx + 1}`;
                    normalized.user_edited = options.markUserEdited === false ? Boolean(origScene.user_edited) : true;

                    const origNormalized = normalizeSceneBlueprint(origScene, scIdx, seqNum, prev.cast || []);
                    const trackedFields = [
                        'title', 'pov_character', 'setting', 'scene_type', 'transition_jump',
                        'dominant_narrative_mode', 'objective', 'scene_events', 'value_shift', 'exit_hook',
                        'surface_activity', 'the_hinge_moment', 'main_character_heart', 'other_character_heart',
                        'atmospheric_overview', 'modality_hand', 'entrance_conditions', 'exit_conditions',
                        'micro_conflict_and_tactic', 'sensory_palette', 'scene_pacing_tempo', 'character_voice_directives',
                        'characters_present', 'epistemic_friction_level', 'activation_contexts',
                        'target_epistemic_deltas', 'plot_commitments', 'relationship_changes'
                    ];
                    changedFieldsList = trackedFields.filter(field =>
                        JSON.stringify(normalized[field] ?? '') !== JSON.stringify(origNormalized[field] ?? '')
                    );

                    prevSeqScenes[scIdx] = normalized;
                    const nextProse = { ...(prev.prose || {}) };
                    const existingProse = nextProse[sId];
                    if (changedFieldsList.length > 0 && options.markStale !== false && existingProse && (existingProse.final || existingProse.prose || existingProse.draft)) {
                        nextProse[sId] = {
                            ...(typeof existingProse === 'object' ? existingProse : { final: String(existingProse) }),
                            stale: {
                                reason: 'Scene blueprint was manually edited.',
                                changedFields: changedFieldsList,
                                at: Date.now()
                            }
                        };
                    }

                    return {
                        ...prev,
                        scenes: { ...(prev.scenes || {}), [sceneKey]: prevSeqScenes },
                        prose: nextProse
                    };
                });

                if (updatedStory?.id) {
                    storyStore.saveStory(updatedStory.id, updatedStory).catch(err => console.warn("Failed saving blueprint update:", err));
                }
                return updatedStory;
            };
            window.updateSceneBlueprint = updateSceneBlueprint;

            const handleCascadeSceneToProse = (seqIdx, sceneIdx, options = {}) => orchestrateHandleCascadeSceneToProse(getPipelineCtx(), seqIdx, sceneIdx, options);
            window.handleCascadeSceneToProse = handleCascadeSceneToProse;

            const handleDismissStaleProse = (seqIdx, sceneIdx) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                const scIdx = typeof sceneIdx === 'number' ? sceneIdx : (selectedScene !== null ? selectedScene : 0);
                const sId = `${sIdx}-${scIdx}`;
                const updated = setStory(prev => {
                    if (!prev.prose?.[sId]?.stale) return prev;
                    const cleanedEntry = { ...(prev.prose[sId] || {}) };
                    delete cleanedEntry.stale;
                    return {
                        ...prev,
                        prose: {
                            ...(prev.prose || {}),
                            [sId]: cleanedEntry
                        }
                    };
                });
                if (updated?.id) {
                    storyStore.saveStory(updated.id, updated).catch(err => console.warn("Failed saving dismissed stale banner:", err));
                }
            };

            const handleAddScene = (seqIdx, insertAtIdx = null) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                const sceneKey = `${sIdx}`;
                let resolvedInsertIdx = 0;
                let createdTitle = "New Scene";

                const updatedStory = setStory(prev => {
                    const prevSeqScenes = [...(prev.scenes?.[sceneKey] || [])];
                    const insertIdx = (insertAtIdx === null || insertAtIdx === undefined)
                        ? prevSeqScenes.length
                        : Math.max(0, Math.min(prevSeqScenes.length, Number(insertAtIdx)));
                    resolvedInsertIdx = insertIdx;

                    const nextBeats = { ...(prev.beats || {}) };
                    const nextProse = { ...(prev.prose || {}) };
                    for (let idx = prevSeqScenes.length - 1; idx >= insertIdx; idx--) {
                        const oldKey = `${sIdx}-${idx}`;
                        const newKey = `${sIdx}-${idx + 1}`;
                        if (nextBeats[oldKey] !== undefined) {
                            nextBeats[newKey] = nextBeats[oldKey];
                            delete nextBeats[oldKey];
                        }
                        if (nextProse[oldKey] !== undefined) {
                            nextProse[newKey] = nextProse[oldKey];
                            delete nextProse[oldKey];
                        }
                        const legacyOld = `${sIdx}-0-${idx}`;
                        const legacyNew = `${sIdx}-0-${idx + 1}`;
                        if (nextBeats[legacyOld] !== undefined) {
                            nextBeats[legacyNew] = nextBeats[legacyOld];
                            delete nextBeats[legacyOld];
                        }
                        if (nextProse[legacyOld] !== undefined) {
                            nextProse[legacyNew] = nextProse[legacyOld];
                            delete nextProse[legacyOld];
                        }
                    }

                    const seqNum = (prev.sequences?.[sIdx]?.number) || (sIdx + 1);
                    const prevScene = insertIdx > 0 ? prevSeqScenes[insertIdx - 1] : null;
                    const prevHand = Array.isArray(prevScene?.modality_hand) ? prevScene.modality_hand : [];
                    const allModalities = Object.values(STRUCTURAL_MODALITIES || {}).map(m => m.name);
                    const defaultHand = allModalities.filter(m => !prevHand.includes(m)).slice(0, 3);
                    const defaultPov = prevScene?.pov_character || prev.cast?.[0]?.name || "";
                    const defaultCast = prevScene?.characters_present?.length ? [...prevScene.characters_present] : (defaultPov ? [defaultPov] : []);

                    const newNum = `${seqNum}.${insertIdx + 1}`;
                    createdTitle = `Scene ${newNum}`;
                    const newScene = normalizeSceneBlueprint({
                        id: newNum,
                        number: newNum,
                        title: createdTitle,
                        scene_type: insertIdx % 2 === 0 ? "PROACTIVE" : "REACTIVE",
                        pov_character: defaultPov,
                        setting: prevScene?.setting || "",
                        transition_jump: insertIdx === 0 ? "Sequence opening" : "Seamless temporal/spatial continuation",
                        modality_hand: defaultHand,
                        characters_present: [...defaultCast],
                        cast_names: [...defaultCast],
                        epistemic_friction_level: "MODERATE",
                        value_shift: { start_state: "", end_state: "" },
                        user_edited: true
                    }, insertIdx, seqNum, prev.cast || []);

                    prevSeqScenes.splice(insertIdx, 0, newScene);
                    const reindexed = prevSeqScenes.map((sc, i) => ({
                        ...sc,
                        id: `${seqNum}.${i + 1}`,
                        number: `${seqNum}.${i + 1}`
                    }));

                    return {
                        ...prev,
                        scenes: { ...(prev.scenes || {}), [sceneKey]: reindexed },
                        beats: nextBeats,
                        prose: nextProse
                    };
                });

                setSelectedSequence(sIdx);
                setSelectedScene(resolvedInsertIdx);
                if (updatedStory?.id) {
                    storyStore.saveStory(updatedStory.id, updatedStory).catch(err => console.warn("Failed saving added scene:", err));
                }
                showToast(`Added "${createdTitle}"`, "success");
            };
            window.handleAddScene = handleAddScene;

            const handleMoveScene = (seqIdx, fromIdx, direction) => {
                const sIdx = typeof seqIdx === 'number' ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                const sceneKey = `${sIdx}`;
                const toIdx = fromIdx + direction;
                let movedTitle = "";
                let didMove = false;

                const updatedStory = setStory(prev => {
                    const prevSeqScenes = [...(prev.scenes?.[sceneKey] || [])];
                    if (fromIdx < 0 || fromIdx >= prevSeqScenes.length || toIdx < 0 || toIdx >= prevSeqScenes.length || fromIdx === toIdx) {
                        return prev;
                    }
                    didMove = true;
                    movedTitle = prevSeqScenes[fromIdx]?.title || `Scene ${fromIdx + 1}`;

                    const nextScenes = [...prevSeqScenes];
                    const tempScene = nextScenes[fromIdx];
                    nextScenes[fromIdx] = nextScenes[toIdx];
                    nextScenes[toIdx] = tempScene;

                    const seqNum = (prev.sequences?.[sIdx]?.number) || (sIdx + 1);
                    const reindexed = nextScenes.map((sc, i) => ({
                        ...sc,
                        id: `${seqNum}.${i + 1}`,
                        number: `${seqNum}.${i + 1}`
                    }));

                    const swapMapKeys = (mapObj) => {
                        const nextMap = { ...(mapObj || {}) };
                        const swapPair = (kA, kB) => {
                            const hasA = Object.prototype.hasOwnProperty.call(nextMap, kA);
                            const hasB = Object.prototype.hasOwnProperty.call(nextMap, kB);
                            const valA = nextMap[kA];
                            const valB = nextMap[kB];
                            if (hasB) nextMap[kA] = valB; else delete nextMap[kA];
                            if (hasA) nextMap[kB] = valA; else delete nextMap[kB];
                        };
                        swapPair(`${sIdx}-${fromIdx}`, `${sIdx}-${toIdx}`);
                        swapPair(`${sIdx}-0-${fromIdx}`, `${sIdx}-0-${toIdx}`);
                        return nextMap;
                    };

                    return {
                        ...prev,
                        scenes: { ...(prev.scenes || {}), [sceneKey]: reindexed },
                        beats: swapMapKeys(prev.beats),
                        prose: swapMapKeys(prev.prose)
                    };
                });

                if (!didMove) return;
                if (selectedSequence === sIdx) {
                    if (selectedScene === fromIdx) setSelectedScene(toIdx);
                    else if (selectedScene === toIdx) setSelectedScene(fromIdx);
                }
                if (updatedStory?.id) {
                    storyStore.saveStory(updatedStory.id, updatedStory).catch(err => console.warn("Failed saving scene reorder:", err));
                }
                showToast(`Moved "${movedTitle}" ${direction < 0 ? 'up' : 'down'}`, "info");
            };
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

            const handleToggleAudioAutopilot = () => {
                if (isAudioAutopilotRunning) {
                    setIsAudioAutopilotRunning(false);
                    isAudioAutopilotRunningRef.current = false;
                    if (audioAutopilotAbortRef.current) {
                        try { audioAutopilotAbortRef.current.abort(); } catch (_) {}
                        audioAutopilotAbortRef.current = null;
                    }
                    showToast("Audio Drama Autopilot paused.", "info");
                    return;
                }
                if (continuousAutopilot) {
                    setIsAudioAutopilotQueued(prev => {
                        const next = !prev;
                        isAudioAutopilotQueuedRef.current = next;
                        showToast(next
                            ? "Audio Drama Autopilot queued: will run automatically after story autopilot completes."
                            : "Audio Drama Autopilot unqueued.", "info");
                        return next;
                    });
                    return;
                }
                setIsAudioAutopilotRunning(true);
            };

            // Audio Drama Autopilot scene-by-scene background loop
            useEffect(() => {
                let cancelled = false;
                if (!isAudioAutopilotRunning) {
                    isAudioAutopilotRunningRef.current = false;
                    return;
                }
                isAudioAutopilotRunningRef.current = true;
                const abortController = new AbortController();
                audioAutopilotAbortRef.current = abortController;

                const runAudioLoop = async () => {
                    showToast("Audio Drama Autopilot started. Synthesizing scenes scene-by-scene...", "info");
                    setLoading(true);
                    const tiers = (typeof TTS_PIPELINE_TIERS !== 'undefined' && Array.isArray(TTS_PIPELINE_TIERS)) ? TTS_PIPELINE_TIERS : [];
                    const currentAudioCfg = audioDramaSettingsRef.current || audioDramaSettings;
                    const resolvedTier = tiers.find(t => t.id === currentAudioCfg?.backend) || tiers[Number(currentAudioCfg?.pipelineTier)] || { shortLabel: 'Hybrid Breeze 2 & Drama-3' };
                    const backendLabel = resolvedTier.shortLabel || 'Hybrid Breeze 2 & Drama-3';
                    let loopWasCompleted = false;

                    try {
                        const targetStoryId = (storyRef.current || story)?.id;
                        const getFreshStory = () => ((storyRef.current?.id === targetStoryId ? storyRef.current : null) || story);
                        const initialStory = getFreshStory();
                        const seqCount = (initialStory?.sequences || []).length;
                        let processedScenes = 0;
                        let skippedScenes = 0;
                        let failedScenes = 0;
                        let totalEligibleScenes = 0;

                        // Count eligible scenes with drafted prose
                        for (let sIdx = 0; sIdx < seqCount; sIdx++) {
                            const rawScenes = (initialStory?.scenes && (initialStory.scenes[sIdx] || initialStory.scenes[String(sIdx)])) || [];
                            const sceneList = Array.isArray(rawScenes) ? rawScenes : [];
                            for (let scIdx = 0; scIdx < sceneList.length; scIdx++) {
                                const sId = `${sIdx}-${scIdx}`;
                                const proseObj = initialStory?.prose?.[sId];
                                const proseText = (typeof proseObj === 'object' && proseObj !== null)
                                    ? (proseObj.final || proseObj.draft || "")
                                    : String(proseObj || "");
                                if (proseText && proseText.trim()) {
                                    totalEligibleScenes++;
                                }
                            }
                        }

                        if (totalEligibleScenes === 0) {
                            showToast("No drafted scenes found in story to generate audio for.", "warning");
                            setIsAudioAutopilotRunning(false);
                            isAudioAutopilotRunningRef.current = false;
                            setLoading(false);
                            return;
                        }

                        setAudioAutopilotProgress({
                            status: 'running',
                            startedAt: Date.now(),
                            totalEligibleScenes,
                            alreadyCachedScenes: 0,
                            generatedScenes: 0,
                            failedScenes: 0,
                            currentSceneOrder: 0,
                            currentSeqIdx: null,
                            currentSceneIdx: null,
                            currentSeqTitle: null,
                            currentSceneTitle: null,
                            currentSceneLabel: null,
                            activeStageId: 'parsing',
                            stageLabel: 'Scanning Story Scenes',
                            stageMessage: 'Checking cached offline audio...',
                            stagePct: 0,
                            chunkCurrent: null,
                            chunkTotal: null,
                            activeSpeaker: null,
                            backendLabel,
                            lastCompletedScene: null,
                            recentErrors: [],
                            errorSceneIds: []
                        });

                        // Overlap Scene N Wave 3 Worker mastering & IndexedDB save with Scene N+1 Wave 2 GPU synthesis
                        let pendingFinalize = null;
                        const flushPendingFinalize = async (markAsDone = false) => {
                            if (!pendingFinalize) return;
                            const job = pendingFinalize;
                            pendingFinalize = null;
                            try {
                                const audioRes = await job.promise;
                                processedScenes++;
                                const completedBlobSize = (audioRes?.mp3Blob || audioRes?.blob)?.size || 0;
                                const completedCueCount = (Array.isArray(audioRes?.cueTimeline) && audioRes.cueTimeline.length) || audioRes?.totalChunks || 0;
                                setAudioAutopilotProgress(prev => prev ? {
                                    ...prev,
                                    generatedScenes: processedScenes,
                                    ...(markAsDone ? {
                                        activeStageId: 'done',
                                        stageLabel: 'Scene Audio Mastered',
                                        stageMessage: `Saved ${job.sceneLabel} (${formatAudioDuration(audioRes?.durationSec || 0)})`,
                                        stagePct: 100,
                                        activeSpeaker: null
                                    } : {}),
                                    lastCompletedScene: {
                                        seqIdx: job.seqIdx,
                                        sceneIdx: job.sceneIdx,
                                        label: job.shortLabel,
                                        seqTitle: job.seqTitle,
                                        sceneTitle: job.sceneTitle,
                                        durationSec: Number(audioRes?.durationSec) || 0,
                                        sizeBytes: completedBlobSize,
                                        cueCount: completedCueCount,
                                        updatedAt: Date.now()
                                    }
                                } : prev);
                            } catch (finErr) {
                                if (finErr?.name === 'AbortError' || finErr?.message === 'Aborted') {
                                    return;
                                }
                                failedScenes++;
                                setAudioAutopilotProgress(prev => prev ? {
                                    ...prev,
                                    failedScenes,
                                    errorSceneIds: prev.errorSceneIds.includes(job.sId) ? prev.errorSceneIds : [...prev.errorSceneIds, job.sId],
                                    recentErrors: [
                                        {
                                            sceneLabel: job.sceneLabel,
                                            message: finErr?.message || String(finErr),
                                            timestamp: new Date().toLocaleTimeString()
                                        },
                                        ...(prev.recentErrors || [])
                                    ].slice(0, 6)
                                } : prev);
                                console.error(`[Audio Autopilot] Error finalizing Scene ${job.seqIdx + 1}.${job.sceneIdx + 1}:`, finErr);
                                if (typeof window.logAudioDramaPipelineStageError === 'function') {
                                    window.logAudioDramaPipelineStageError(
                                        'audio_autopilot_scene',
                                        `Audio Autopilot failed on Scene ${job.seqIdx + 1}.${job.sceneIdx + 1}`,
                                        finErr,
                                        { storyId: getFreshStory()?.id, seqIdx: job.seqIdx, sceneIdx: job.sceneIdx }
                                    );
                                }
                                showToast(`Audio Autopilot: Scene ${job.seqIdx + 1}.${job.sceneIdx + 1} error: ${finErr.message || finErr}`, "warning");
                            }
                        };

                        // Iterate scenes, always reading the latest live story snapshot so voice edits take effect immediately
                        const liveSeqCount = ((getFreshStory()?.sequences) || []).length;
                        for (let sIdx = 0; sIdx < liveSeqCount; sIdx++) {
                            if (cancelled || !isAudioAutopilotRunningRef.current || abortController.signal.aborted) break;
                            const seqStory = getFreshStory();
                            const seqMetaObj = seqStory?.sequences?.[sIdx] || {};
                            const seqNumDisplay = seqMetaObj?.number || (sIdx + 1);
                            const seqTitleDisplay = seqMetaObj?.title || `Sequence ${sIdx + 1}`;
                            const rawScenes = (seqStory?.scenes && (seqStory.scenes[sIdx] || seqStory.scenes[String(sIdx)])) || [];
                            const sceneList = Array.isArray(rawScenes) ? rawScenes : [];

                            for (let scIdx = 0; scIdx < sceneList.length; scIdx++) {
                                if (cancelled || !isAudioAutopilotRunningRef.current || abortController.signal.aborted) break;
                                const liveStory = getFreshStory();
                                const sId = `${sIdx}-${scIdx}`;
                                const proseObj = liveStory?.prose?.[sId];
                                const proseText = (typeof proseObj === 'object' && proseObj !== null)
                                    ? (proseObj.final || proseObj.draft || "")
                                    : String(proseObj || "");

                                if (!proseText || !proseText.trim()) continue;

                                const currentProseHash = computeSceneProseHash(proseText);
                                let existingMeta = null;
                                if (window.audioStore && liveStory?.id) {
                                    try {
                                        existingMeta = await window.audioStore.getSceneAudio(liveStory.id, sIdx, scIdx);
                                    } catch (metaErr) {
                                        console.warn(`[Audio Autopilot] Could not read existing audio for Scene ${sIdx + 1}.${scIdx + 1}:`, metaErr);
                                    }
                                }

                                // Skip if already generated with matching prose hash AND current cast voice signatures
                                const postCheckStory = getFreshStory();
                                const apFreshness = isStoredSceneAudioFresh(existingMeta, proseText, postCheckStory, audioDramaSettingsRef.current || audioDramaSettings);
                                if (existingMeta && existingMeta.textHash === currentProseHash && apFreshness.fresh) {
                                    skippedScenes++;
                                    setAudioAutopilotProgress(prev => prev ? { ...prev, alreadyCachedScenes: skippedScenes } : prev);
                                    continue;
                                }

                                const sceneMetaObj = (postCheckStory?.scenes?.[sIdx] || postCheckStory?.scenes?.[String(sIdx)] || sceneList)[scIdx] || {};
                                const curSceneTitle = sceneMetaObj?.title || `Scene ${scIdx + 1}`;
                                const curSceneLabel = `Scene ${seqNumDisplay}.${scIdx + 1}`;
                                const curOrder = processedScenes + skippedScenes + failedScenes + (pendingFinalize ? 1 : 0) + 1;

                                setAudioAutopilotProgress(prev => prev ? {
                                    ...prev,
                                    currentSceneOrder: curOrder,
                                    currentSeqIdx: sIdx,
                                    currentSceneIdx: scIdx,
                                    currentSeqTitle: seqTitleDisplay,
                                    currentSceneTitle: curSceneTitle,
                                    currentSceneLabel: curSceneLabel,
                                    activeStageId: 'parsing',
                                    stageLabel: 'Script Parsing & Dialogue Cues',
                                    stageMessage: 'Preparing scene script...',
                                    stagePct: 5,
                                    chunkCurrent: null,
                                    chunkTotal: null,
                                    activeSpeaker: null
                                } : prev);

                                setLoadingStep(`Audio Autopilot: Generating Scene ${sIdx + 1}.${scIdx + 1} (${curOrder}/${totalEligibleScenes})...`);
                                try {
                                    const audioRes = await generateAndStoreSceneAudio(sIdx, scIdx, {
                                        triggerDownload: false,
                                        forceRegenerate: true,
                                        forceRerender: true,
                                        forceRecalibrate: false,
                                        deferFinalize: true,
                                        signal: abortController.signal,
                                        onProgress: ({ current, total, stage, speaker, message, chunkCurrent, chunkTotal }) => {
                                            if (cancelled || abortController.signal.aborted) return;
                                            const sceneLabel = `Audio Autopilot [Scene ${sIdx + 1}.${scIdx + 1}]`;
                                            const mappedStageId = mapAudioStageToCanonical(stage, message);
                                            const stageTitles = {
                                                parsing: 'Script Parsing & Dialogue Cues',
                                                casting: 'Voice Casting & Master Anchors',
                                                synthesis: 'Multi-Voice Neural Synthesis',
                                                mastering: 'Studio Mastering & Broadcast Encoding',
                                                archiving: 'Offline Audio Library & Cue Sync',
                                                done: 'Scene Audio Mastered'
                                            };
                                            let computedStagePct = 50;
                                            if (mappedStageId === 'done') computedStagePct = 100;
                                            else if (mappedStageId === 'archiving') computedStagePct = 95;
                                            else if (mappedStageId === 'mastering') computedStagePct = 86;
                                            else if (mappedStageId === 'casting') computedStagePct = 20;
                                            else if (mappedStageId === 'parsing') computedStagePct = 8;
                                            else if (stage === 'synthesizing' && total > 0) {
                                                computedStagePct = Math.min(82, Math.max(25, Math.round(25 + (current / total) * 55)));
                                            } else if (typeof current === 'number' && total > 0 && current <= total) {
                                                computedStagePct = Math.min(95, Math.max(10, Math.round((current / total) * 100)));
                                            }

                                            const resolvedChunkCur = (typeof chunkCurrent === 'number')
                                                ? chunkCurrent
                                                : (stage === 'synthesizing' && typeof current === 'number' ? current : null);
                                            const resolvedChunkTot = (typeof chunkTotal === 'number')
                                                ? chunkTotal
                                                : (stage === 'synthesizing' && typeof total === 'number' ? total : null);

                                            setAudioAutopilotProgress(prev => prev ? {
                                                ...prev,
                                                activeStageId: mappedStageId,
                                                stageLabel: stageTitles[mappedStageId] || 'Audio Production',
                                                stageMessage: message || (stage === 'synthesizing' ? `Synthesizing ${speaker || 'voice'} (${current}/${total})...` : (stage === 'encoding' ? 'Encoding 128kbps broadcast MP3...' : `${stage} (${current || 0}/${total || 100})`)),
                                                stagePct: computedStagePct,
                                                chunkCurrent: resolvedChunkCur !== null ? resolvedChunkCur : prev.chunkCurrent,
                                                chunkTotal: resolvedChunkTot !== null ? resolvedChunkTot : prev.chunkTotal,
                                                activeSpeaker: speaker || (mappedStageId === 'synthesis' ? prev.activeSpeaker : null)
                                            } : prev);

                                            if (stage === 'synthesizing') {
                                                setLoadingStep(`${sceneLabel}: Synthesizing ${speaker || 'audio'} (${current}/${total})...`);
                                            } else if (stage === 'encoding') {
                                                setLoadingStep(`${sceneLabel}: Encoding 128kbps master MP3...`);
                                            } else if (
                                                stage === 'rendering' ||
                                                stage === 'parsing_turns' ||
                                                stage === 'voice_tournaments' ||
                                                stage === 'chunk_synthesis' ||
                                                stage === 'audiomastering' ||
                                                stage === 'audio_mastering' ||
                                                stage === 'saving' ||
                                                stage === 'done'
                                            ) {
                                                setLoadingStep(`${sceneLabel}: ${message || `${stage} (${current || 0}/${total || 100})`}`);
                                            }
                                        }
                                    });
                                    await flushPendingFinalize(false);
                                    const finalizeJob = {
                                        seqIdx: sIdx,
                                        sceneIdx: scIdx,
                                        sId,
                                        sceneLabel: curSceneLabel,
                                        shortLabel: `${seqNumDisplay}.${scIdx + 1}`,
                                        seqTitle: seqTitleDisplay,
                                        sceneTitle: curSceneTitle,
                                        promise: (audioRes && typeof audioRes.finalize === 'function')
                                            ? audioRes.finalize()
                                            : Promise.resolve(audioRes)
                                    };
                                    pendingFinalize = finalizeJob;
                                    if (!(audioRes && typeof audioRes.finalize === 'function')) {
                                        await flushPendingFinalize(false);
                                    }
                                } catch (sceneErr) {
                                    if (cancelled || abortController.signal.aborted || sceneErr?.name === 'AbortError' || sceneErr?.message === 'Aborted') {
                                        break;
                                    }
                                    failedScenes++;
                                    setAudioAutopilotProgress(prev => prev ? {
                                        ...prev,
                                        failedScenes,
                                        errorSceneIds: prev.errorSceneIds.includes(sId) ? prev.errorSceneIds : [...prev.errorSceneIds, sId],
                                        recentErrors: [
                                            {
                                                sceneLabel: curSceneLabel,
                                                message: sceneErr?.message || String(sceneErr),
                                                timestamp: new Date().toLocaleTimeString()
                                            },
                                            ...(prev.recentErrors || [])
                                        ].slice(0, 6)
                                    } : prev);
                                    console.error(`[Audio Autopilot] Error in Scene ${sIdx + 1}.${scIdx + 1}:`, sceneErr);
                                    if (typeof window.logAudioDramaPipelineStageError === 'function') {
                                        window.logAudioDramaPipelineStageError(
                                            'audio_autopilot_scene',
                                            `Audio Autopilot failed on Scene ${sIdx + 1}.${scIdx + 1}`,
                                            sceneErr,
                                            { storyId: getFreshStory()?.id, seqIdx: sIdx, sceneIdx: scIdx }
                                        );
                                    }
                                    showToast(`Audio Autopilot: Scene ${sIdx + 1}.${scIdx + 1} error: ${sceneErr.message || sceneErr}`, "warning");
                                }
                            }
                        }

                        await flushPendingFinalize(true);

                        if (!cancelled && isAudioAutopilotRunningRef.current && !abortController.signal.aborted) {
                            loopWasCompleted = true;
                            if (failedScenes > 0) {
                                showToast(`Audio Drama Autopilot finished with ${failedScenes} error(s): ${processedScenes} saved, ${skippedScenes} previously cached.`, "warning");
                            } else {
                                showToast(`🎉 Audio Drama Autopilot Complete! Generated ${processedScenes} scene MP3s (${skippedScenes} previously cached).`, "success");
                            }
                        }
                    } catch (loopErr) {
                        if (!(cancelled || abortController.signal.aborted || loopErr?.name === 'AbortError' || loopErr?.message === 'Aborted')) {
                            console.error("[Audio Autopilot] Loop error:", loopErr);
                            if (typeof window.logAudioDramaPipelineStageError === 'function') {
                                window.logAudioDramaPipelineStageError('audio_autopilot_loop', 'Audio Drama Autopilot halted', loopErr);
                            }
                            showToast(`Audio Autopilot halted: ${loopErr.message}`, "error");
                        }
                    } finally {
                        if (audioAutopilotAbortRef.current === abortController) {
                            audioAutopilotAbortRef.current = null;
                        }
                        setAudioAutopilotProgress(prev => prev ? {
                            ...prev,
                            status: loopWasCompleted ? 'complete' : 'paused',
                            activeSpeaker: null
                        } : prev);
                        setIsAudioAutopilotRunning(false);
                        isAudioAutopilotRunningRef.current = false;
                        setLoading(false);
                        setLoadingStep("");
                    }
                };

                runAudioLoop();

                return () => {
                    cancelled = true;
                    isAudioAutopilotRunningRef.current = false;
                    try { abortController.abort(); } catch (_) {}
                    if (audioAutopilotAbortRef.current === abortController) {
                        audioAutopilotAbortRef.current = null;
                    }
                };
            }, [isAudioAutopilotRunning]);

            // ─────────────────────────────────────────────────────────────────────────────
            // Antigravity MCP Live Bridge
            // Connects to local MCP WebSocket relay on port 3002 (or custom port).
            // Enables bi-directional communication, state queries, model configuration,
            // new story initialization, and pipeline control from Antigravity.
            // ─────────────────────────────────────────────────────────────────────────────

            const bridgeStateRef = useRef({});
            bridgeStateRef.current = {
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
                promptLog
            };

            const handleBridgeAction = async (action, params = {}) => {
                const s = bridgeStateRef.current;
                switch (action) {
                    case 'getStatus': {
                        return {
                            connected: true,
                            activeStoryId: s.activeStoryId || null,
                            storyTitle: s.story?.title || s.inputTitle || "Untitled Story",
                            view: s.view,
                            apiProvider: s.apiProvider,
                            devModel: s.devModel || s.geminiModel,
                            loading: s.loading,
                            loadingStep: s.loadingStep,
                            continuousAutopilot: s.continuousAutopilot,
                            totalWords: countStoryWords(s.story),
                            sequencesCount: (s.story?.sequences || []).length,
                            chaptersCount: (s.story?.sequences || []).reduce((acc, sq) => acc + (sq.scenes || []).length, 0),
                            timestamp: Date.now()
                        };
                    }

                    case 'getModelConfig': {
                        return {
                            apiProvider: s.apiProvider,
                            devProvider: s.devProvider || s.apiProvider,
                            devModel: s.devModel || getDefaultModelForProvider(s.devProvider || s.apiProvider),
                            reviewProvider: s.reviewProvider || "",
                            reviewModel: s.reviewModel || "",
                            proseProvider: s.proseProvider || "",
                            proseModel: s.proseModel || "",
                            geminiModel: s.geminiModel,
                            openRouterModel: s.openRouterModel,
                            nanoGptModel: s.nanoGptModel,
                            koboldModel: s.koboldModel,
                            codexModel: s.codexModel,
                            hasGeminiKey: Boolean(s.apiKey),
                            hasOpenRouterKey: Boolean(s.openRouterKey),
                            hasNanoGptKey: Boolean(s.nanoGptKey),
                            koboldUrl: s.koboldUrl,
                            codexUrl: s.codexUrl
                        };
                    }

                    case 'setModelConfig': {
                        const { provider, model, role = 'all', apiKey: newApiKey, baseUrl } = params;
                        if (!provider) throw new Error("Missing 'provider' in setModelConfig.");

                        const validProviders = ['gemini', 'openrouter', 'nanogpt', 'koboldcpp', 'codex'];
                        if (!validProviders.includes(provider)) {
                            throw new Error(`Invalid provider '${provider}'. Must be one of: ${validProviders.join(', ')}`);
                        }

                        // Apply provider & role logic
                        if (role === 'all' || role === 'dev') {
                            setApiProvider(provider);
                            safeLocalStorageSet("ellipsisprose_api_provider", provider);
                            setDevProvider(provider);
                            safeLocalStorageSet("ellipsisprose_dev_provider", provider);
                            if (model) {
                                setDevModel(model);
                                safeLocalStorageSet("ellipsisprose_dev_model", model);
                            }
                        }
                        if (role === 'review') {
                            setReviewProvider(provider);
                            safeLocalStorageSet("ellipsisprose_review_provider", provider);
                            if (model) {
                                setReviewModel(model);
                                safeLocalStorageSet("ellipsisprose_review_model", model);
                            }
                        }
                        if (role === 'prose') {
                            setProseProvider(provider);
                            safeLocalStorageSet("ellipsisprose_prose_provider", provider);
                            if (model) {
                                setProseModel(model);
                                safeLocalStorageSet("ellipsisprose_prose_model", model);
                            }
                        }

                        // Provider-specific model defaults
                        if (model) {
                            if (provider === 'gemini') { setGeminiModel(model); safeLocalStorageSet("ellipsisprose_gemini_model", model); }
                            if (provider === 'openrouter') { setOpenRouterModel(model); safeLocalStorageSet("ellipsisprose_openrouter_model", model); }
                            if (provider === 'nanogpt') { setNanoGptModel(model); safeLocalStorageSet("ellipsisprose_nanogpt_model", model); }
                            if (provider === 'koboldcpp') { setKoboldModel(model); safeLocalStorageSet("ellipsisprose_kobold_model", model); }
                            if (provider === 'codex') { setCodexModel(model); safeLocalStorageSet("ellipsisprose_codex_model", model); }
                        }

                        // API keys
                        if (newApiKey) {
                            if (provider === 'gemini') { setApiKey(newApiKey); safeLocalStorageSet("gemini_api_key", newApiKey); }
                            if (provider === 'openrouter') { setOpenRouterKey(newApiKey); safeLocalStorageSet("ellipsisprose_openrouter_key", newApiKey); }
                            if (provider === 'nanogpt') { setNanoGptKey(newApiKey); safeLocalStorageSet("ellipsisprose_nanogpt_key", newApiKey); }
                        }

                        // Base URLs
                        if (baseUrl) {
                            if (provider === 'koboldcpp') { setKoboldUrl(baseUrl); safeLocalStorageSet("ellipsisprose_kobold_url", baseUrl); }
                            if (provider === 'codex') { setCodexUrl(baseUrl); safeLocalStorageSet("ellipsisprose_codex_url", baseUrl); }
                        }

                        showToast(`API configuration updated: ${provider.toUpperCase()}${model ? ' (' + model + ')' : ''} for ${role.toUpperCase()}`, 'success');

                        return {
                            success: true,
                            provider,
                            model: model || getDefaultModelForProvider(provider),
                            role,
                            message: `Successfully set ${provider} as ${role} provider.`
                        };
                    }

                    case 'startNewStory': {
                        const { title = "", concept, writingMode = "novel", autoStart = true, isAutopilot = false } = params;
                        if (!concept || !concept.trim()) {
                            throw new Error("Missing 'concept' parameter for startNewStory.");
                        }

                        const cleanConcept = concept.trim();
                        const cleanTitle = (title && title.trim()) || "Untitled Novel";

                        setInputTitle(cleanTitle);
                        setInputConcept(cleanConcept);
                        setInputAuthorNote("");
                        setInputWritingMode(writingMode);
                        clearImportedLore();
                        setView('setup');

                        if (autoStart) {
                            await new Promise(r => setTimeout(r, 120));
                            // Launch story initialization pipeline
                            initStory(Boolean(isAutopilot), { fromSetup: true }).catch(err => {
                                console.error("[Antigravity Bridge] initStory error:", err);
                            });
                            return {
                                success: true,
                                status: "started",
                                title: cleanTitle,
                                writingMode,
                                autoStart: true,
                                isAutopilot: Boolean(isAutopilot),
                                message: `Initialized and started generation for "${cleanTitle}".`
                            };
                        }

                        return {
                            success: true,
                            status: "ready",
                            title: cleanTitle,
                            writingMode,
                            autoStart: false,
                            message: `Prepared story canvas for "${cleanTitle}". Ready for pipeline execution.`
                        };
                    }

                    case 'getActiveStory': {
                        const { includeFullProse = false } = params;
                        const currStory = s.story;
                        if (!currStory) {
                            return { story: null, message: "No active story loaded." };
                        }

                        const sanitizedStory = {
                            id: s.activeStoryId,
                            title: currStory.title || s.inputTitle || "Untitled Story",
                            concept: currStory.concept || s.inputConcept || "",
                            writingMode: currStory.writingMode || "novel",
                            acts: currStory.acts || [],
                            characters: (currStory.characters || []).map(c => ({
                                name: c.name,
                                role: c.role,
                                archetype: c.archetype,
                                summary: c.summary || c.bio || ""
                            })),
                            sequences: (currStory.sequences || []).map(seq => ({
                                number: seq.sequence_number || seq.number,
                                title: seq.title,
                                act: seq.parent_act || seq.act,
                                dramatic_question: seq.dramatic_question,
                                scenes: (seq.scenes || []).map(sc => {
                                    const sKey = `${seq.sequence_number || seq.number}-${sc.scene_number || sc.number}`;
                                    const prose = sc.prose || (currStory.prose && currStory.prose[sKey]) || "";
                                    const wordCount = prose ? prose.trim().split(/\s+/).length : 0;
                                    return {
                                        number: sc.scene_number || sc.number,
                                        title: sc.title,
                                        summary: sc.summary,
                                        wordCount,
                                        hasProse: Boolean(prose),
                                        prose: includeFullProse ? prose : undefined
                                    };
                                })
                            })),
                            totalWords: countStoryWords(currStory)
                        };

                        return sanitizedStory;
                    }

                    case 'listStories': {
                        if (!window.storyStore) {
                            throw new Error("StoryStore persistence is unavailable.");
                        }
                        const rawStories = await window.storyStore.listStories();
                        const list = (rawStories || []).map(item => ({
                            id: item.id,
                            title: item.title || item.data?.title || "Untitled",
                            concept: (item.concept || item.data?.concept || "").slice(0, 200),
                            wordCount: item.wordCount || (item.data ? countStoryWords(item.data) : 0),
                            lastModified: item.lastModified || item.data?.lastModified || null
                        }));
                        return { count: list.length, stories: list };
                    }

                    case 'switchStory': {
                        const { storyId } = params;
                        if (!storyId) throw new Error("Missing 'storyId' to switch.");
                        if (!window.storyStore) throw new Error("StoryStore persistence is unavailable.");

                        const targetData = await window.storyStore.loadStory(storyId);
                        if (!targetData) {
                            throw new Error(`Story with ID '${storyId}' not found in library.`);
                        }

                        const migrated = migrateStoryToSequences(targetData);
                        setActiveStoryId(storyId);
                        setStory({
                            relationships: {},
                            graph_edges: [],
                            ...migrated,
                            continuity_ledger: Array.isArray(migrated?.continuity_ledger) ? migrated.continuity_ledger : [],
                            secret_vault: Array.isArray(migrated?.secret_vault) ? migrated.secret_vault : [],
                            id: storyId
                        });
                        setView('dashboard');
                        showToast(`Switched active story to "${targetData.title || storyId}"`, 'success');

                        return {
                            success: true,
                            storyId,
                            title: targetData.title || "Untitled",
                            message: `Successfully loaded story "${targetData.title || storyId}".`
                        };
                    }

                    case 'getPipelineStatus': {
                        return {
                            loading: s.loading,
                            loadingStep: s.loadingStep,
                            continuousAutopilot: s.continuousAutopilot,
                            activeStoryId: s.activeStoryId,
                            storyTitle: s.story?.title || "Untitled"
                        };
                    }

                    case 'triggerPipelineStep': {
                        const { action: subAction, sequenceIndex = 0, sceneIndex = 0 } = params;
                        if (subAction === 'step') {
                            const hasMore = await runContinuousAutopilotStep();
                            return { success: true, action: 'step', hasMore };
                        } else if (subAction === 'autopilot_toggle') {
                            toggleContinuousAutopilot();
                            return { success: true, continuousAutopilot: !s.continuousAutopilot };
                        } else if (subAction === 'story_arc') {
                            await generateStoryArc(s.story, false);
                            return { success: true, action: 'story_arc' };
                        } else if (subAction === 'acts_sequences') {
                            await generateActsAndSequences(s.story, false);
                            return { success: true, action: 'acts_sequences' };
                        } else if (subAction === 'sequences') {
                            await generateSequences(s.story, false);
                            return { success: true, action: 'sequences' };
                        } else if (subAction === 'scenes') {
                            await generateScenes(sequenceIndex, s.story, false);
                            return { success: true, action: 'scenes', sequenceIndex };
                        } else if (subAction === 'prose') {
                            await writeSceneProse(sequenceIndex, sceneIndex);
                            return { success: true, action: 'prose', sequenceIndex, sceneIndex };
                        }
                        throw new Error(`Unknown pipeline step action: '${subAction}'`);
                    }

                    case 'getChapter': {
                        const { sequenceIndex = 0, sceneIndex = 0 } = params;
                        const seq = s.story?.sequences?.[sequenceIndex];
                        if (!seq) throw new Error(`Sequence ${sequenceIndex} not found in active story.`);
                        const scene = seq.scenes?.[sceneIndex];
                        if (!scene) throw new Error(`Scene ${sceneIndex} in sequence ${sequenceIndex} not found.`);

                        const sKey = `${seq.sequence_number || seq.number}-${scene.scene_number || scene.number}`;
                        const prose = scene.prose || (s.story.prose && s.story.prose[sKey]) || "";
                        const beats = s.story.beats?.[sKey] || [];
                        const feedback = feedbackLedger?.[sKey] || null;

                        return {
                            sequenceNumber: seq.sequence_number || seq.number,
                            sequenceTitle: seq.title,
                            sceneNumber: scene.scene_number || scene.number,
                            sceneTitle: scene.title,
                            summary: scene.summary,
                            conflict: scene.conflict,
                            setting: scene.setting,
                            characterIds: scene.characterIds || [],
                            wordCount: prose ? prose.trim().split(/\s+/).length : 0,
                            beats,
                            feedback,
                            prose
                        };
                    }

                    case 'injectFeedback': {
                        const { feedback } = params;
                        if (!feedback) throw new Error("Missing 'feedback' text.");
                        showToast(`Directive received from Antigravity: "${feedback.slice(0, 60)}..."`, 'info');
                        return { success: true, message: "Feedback acknowledged by EllipsisProse." };
                    }

                    case 'getLogs': {
                        const { limit = 20 } = params;
                        const logs = (s.promptLog || []).slice(-limit);
                        return { count: logs.length, logs };
                    }

                    default:
                        throw new Error(`Unrecognized bridge action: '${action}'`);
                }
            };

            // Global DevTools & External Bridge Access
            window.EllipsisProseBridge = {
                version: "2.1.1",
                getStatus: () => handleBridgeAction('getStatus'),
                getModelConfig: () => handleBridgeAction('getModelConfig'),
                setModelConfig: (p) => handleBridgeAction('setModelConfig', p),
                startNewStory: (p) => handleBridgeAction('startNewStory', p),
                getActiveStory: (p) => handleBridgeAction('getActiveStory', p),
                listStories: () => handleBridgeAction('listStories'),
                switchStory: (id) => handleBridgeAction('switchStory', { storyId: id }),
                getPipelineStatus: () => handleBridgeAction('getPipelineStatus'),
                triggerPipelineStep: (a, opts) => handleBridgeAction('triggerPipelineStep', { action: a, ...opts }),
                getChapter: (sq, sc) => handleBridgeAction('getChapter', { sequenceIndex: sq, sceneIndex: sc }),
                injectFeedback: (fb) => handleBridgeAction('injectFeedback', { feedback: fb }),
                getLogs: (l) => handleBridgeAction('getLogs', { limit: l })
            };

            // WebSocket Connection Effect (Antigravity MCP Live Bridge)
            useEffect(() => {
                let ws = null;
                let reconnectTimer = null;
                let isDisposed = false;
                let retryCount = 0;
                const MAX_RETRIES = 3;

                // Stop polling and do not open WebSockets if bridge is disabled
                if (!enableMcpBridge) {
                    setIsMcpConnected(false);
                    return;
                }

                const connect = () => {
                    if (isDisposed || !enableMcpBridge) return;
                    try {
                        ws = new WebSocket('ws://127.0.0.1:3002');

                        ws.onopen = async () => {
                            if (isDisposed) { try { ws.close(); } catch(e){} return; }
                            console.log('[Antigravity Bridge] Connected to MCP server on port 3002');
                            setIsMcpConnected(true);
                            retryCount = 0;
                            try {
                                const status = await handleBridgeAction('getStatus');
                                ws.send(JSON.stringify({ type: 'status', payload: status }));
                            } catch(e) {}
                        };

                        ws.onmessage = async (evt) => {
                            let msg;
                            try {
                                msg = JSON.parse(evt.data);
                            } catch (e) {
                                return;
                            }
                            const { id, action, params } = msg;
                            if (!id) return;

                            try {
                                const result = await handleBridgeAction(action, params);
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ id, success: true, result }));
                                }
                            } catch (err) {
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ id, success: false, error: err?.message || String(err) }));
                                }
                            }
                        };

                        ws.onclose = () => {
                            setIsMcpConnected(false);
                            ws = null;
                            if (!isDisposed && enableMcpBridge) {
                                retryCount++;
                                if (retryCount <= MAX_RETRIES) {
                                    const delay = Math.min(3000 * Math.pow(2, retryCount - 1), 15000);
                                    reconnectTimer = setTimeout(connect, delay);
                                } else {
                                    console.info('[Antigravity Bridge] MCP server on port 3002 not reachable. Polling paused. Use Settings -> Pipeline to reconnect.');
                                }
                            }
                        };

                        ws.onerror = () => {
                            // Silently close on error so onclose manages backoff
                            try { ws.close(); } catch(e) {}
                        };
                    } catch(e) {
                        setIsMcpConnected(false);
                        if (!isDisposed && enableMcpBridge) {
                            retryCount++;
                            if (retryCount <= MAX_RETRIES) {
                                reconnectTimer = setTimeout(connect, 3000 * retryCount);
                            }
                        }
                    }
                };

                connect();

                return () => {
                    isDisposed = true;
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    if (ws) {
                        try { ws.close(); } catch(e) {}
                    }
                    setIsMcpConnected(false);
                };
            }, [enableMcpBridge, mcpRetryTrigger]);

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
