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
import { useDebounce } from '@/hooks';
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
    handleDirectSceneVoices as orchestrateHandleDirectSceneVoices
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

            // Image Store & States
            const imageStore = useMemo(() => new ImageStore(), []);
            window.imageStore = imageStore;
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
            const [imageProvider, setImageProvider] = useState(() => localStorage.getItem("ellipsisprose_image_provider") || 'gemini');
            const [imageModel, setImageModel] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_image_model");
                if (saved && saved !== 'imagen-3.0-generate-002') return saved;
                return 'gemini-3.1-flash-image';
            });
            const [geminiImageModelsList, setGeminiImageModelsList] = useState(() => {
                try {
                    const cached = sessionStorage.getItem("ellipsisprose_gemini_image_models_cache");
                    return cached ? JSON.parse(cached) : [];
                } catch (_) {
                    return [];
                }
            });
            const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
            const [imageApiKey, setImageApiKey] = useState(() => localStorage.getItem("ellipsisprose_image_api_key") || '');
            const [comfyUrl, setComfyUrl] = useState(() => localStorage.getItem("ellipsisprose_comfy_url") || 'http://127.0.0.1:8188');
            const [comfyUnet, setComfyUnet] = useState(() => localStorage.getItem("ellipsisprose_comfy_unet") || '');
            const [comfyClip, setComfyClip] = useState(() => localStorage.getItem("ellipsisprose_comfy_clip") || '');
            const [comfyVae, setComfyVae] = useState(() => localStorage.getItem("ellipsisprose_comfy_vae") || '');
            const [comfyLora, setComfyLora] = useState(() => localStorage.getItem("ellipsisprose_comfy_lora") || '');
            const [comfyLoraStrength, setComfyLoraStrength] = useState(() => Number(localStorage.getItem("ellipsisprose_comfy_lora_strength") ?? 0.8));
            const [comfySteps, setComfySteps] = useState(() => Number(localStorage.getItem("ellipsisprose_comfy_steps") ?? 8));
            const [comfyCfg, setComfyCfg] = useState(() => Number(localStorage.getItem("ellipsisprose_comfy_cfg") ?? 1));
            const [comfySampler, setComfySampler] = useState(() => localStorage.getItem("ellipsisprose_comfy_sampler") || 'euler');
            const [comfyScheduler, setComfyScheduler] = useState(() => localStorage.getItem("ellipsisprose_comfy_scheduler") || 'simple');
            const [comfyTimeoutSec, setComfyTimeoutSec] = useState(() => Number(localStorage.getItem("ellipsisprose_comfy_timeout_sec") ?? 600));
            const [comfyStatus, setComfyStatus] = useState({ online: false, version: '', device: '', error: '' });
            const [comfyOptions, setComfyOptions] = useState({ unet: [], clip: [], vae: [], lora: [], sampler: [], scheduler: [] });
            const comfyRefreshId = useRef(0);
            const [customImageStyles, setCustomImageStyles] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_custom_image_styles");
                return saved ? JSON.parse(saved) : [];
            });
            const [loadedImages, setLoadedImages] = useState({});
            const [portraitLoading, setPortraitLoading] = useState({});
            const [portraitReload, setPortraitReload] = useState(0);
            const portraitOperations = useRef(new Set());
            const portraitRevisions = useRef(new Map());
            const portraitStoryId = useRef(story?.id);
            portraitStoryId.current = story?.id;
            const [loadingCover, setLoadingCover] = useState(false);
            const [loadingImages, setLoadingImages] = useState({});
            const [newStyleName, setNewStyleName] = useState("");
            const [newStyleDesc, setNewStyleDesc] = useState("");

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
            // Settings State
            const [enableReview, setEnableReview] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_review");
                return val !== null ? val === 'true' : true;
            });
            const [enableStylePolish, setEnableStylePolish] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_style_polish");
                return val !== null ? val === 'true' : true;
            });
            const [enableAudioDramaDirectionPass, setEnableAudioDramaDirectionPass] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_audio_drama_direction");
                return val !== null ? val === 'true' : true;
            });
            const [isDirectingVoices, setIsDirectingVoices] = useState(false);
            const [apiProvider, setApiProvider] = useState(() => localStorage.getItem("ellipsisprose_api_provider") || 'gemini');
            const [embeddingProvider, setEmbeddingProvider] = useState(() => localStorage.getItem("ellipsisprose_embedding_provider") || (apiProvider === 'codex' ? 'gemini' : apiProvider));
            const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
            const [apiTimeout, setApiTimeout] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_api_timeout");
                const parsed = val !== null ? parseInt(val, 10) : 120;
                return (!isNaN(parsed) && parsed >= 5 && parsed <= 1800) ? parsed : 120;
            });
            const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem("ellipsisprose_gemini_model") || "gemini-2.0-flash");
            const [geminiModelsList, setGeminiModelsList] = useState([]);
            const [openRouterKey, setOpenRouterKey] = useState(() => localStorage.getItem("ellipsisprose_openrouter_key") || "");
            const [openRouterModel, setOpenRouterModel] = useState(() => localStorage.getItem("ellipsisprose_openrouter_model") || "google/gemini-2.0-flash-001");
            const [openRouterMaxTokens, setOpenRouterMaxTokens] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_openrouter_max_tokens");
                return val !== null ? parseInt(val, 10) : 65536;
            });
            const [nanoGptKey, setNanoGptKey] = useState(() => localStorage.getItem("ellipsisprose_nanogpt_key") || "");
            const [nanoGptModel, setNanoGptModel] = useState(() => localStorage.getItem("ellipsisprose_nanogpt_model") || "gpt-4o");
            const [koboldUrl, setKoboldUrl] = useState(() => localStorage.getItem("ellipsisprose_kobold_url") || "http://localhost:5001");
            const [koboldModel, setKoboldModel] = useState(() => localStorage.getItem("ellipsisprose_kobold_model") || "koboldcpp");
            const [codexUrl, setCodexUrl] = useState(() => localStorage.getItem("ellipsisprose_codex_url") || "http://localhost:5010");
            const [codexModel, setCodexModel] = useState(() => localStorage.getItem("ellipsisprose_codex_model") ?? "gpt-5.6-luna");
            const [codexModelsList, setCodexModelsList] = useState([]);
            const [codexStatus, setCodexStatus] = useState({ online: false, model: null, error: null });
            const [codexEmbeddingStatus, setCodexEmbeddingStatus] = useState(null);
            const codexRefreshId = useRef(0);
            const [savedModels, setSavedModels] = useState(() => {
                const saved = localStorage.getItem("ellipsisprose_saved_models");
                return saved ? JSON.parse(saved) : ["google/gemini-2.0-flash-001"];
            });

            // Model Catalog & Universal Search State
            const [openRouterModelsList, setOpenRouterModelsList] = useState(() => {
                const cached = localStorage.getItem("ellipsisprose_openrouter_models_cache");
                return cached ? JSON.parse(cached) : [];
            });
            const [nanoGptModelsList, setNanoGptModelsList] = useState(() => {
                const cached = localStorage.getItem("ellipsisprose_nanogpt_models_cache");
                return cached ? JSON.parse(cached) : NANO_GPT_DEFAULT_MODELS;
            });
            const [koboldStatus, setKoboldStatus] = useState('idle');
            const [koboldLoadedModel, setKoboldLoadedModel] = useState(koboldModel || "koboldcpp");
            const [koboldError, setKoboldError] = useState(null);

            // Three-Model System State: Development (Default/Master), Review, and Prose
            const [devProvider, setDevProvider] = useState(() => localStorage.getItem("ellipsisprose_dev_provider") || localStorage.getItem("ellipsisprose_api_provider") || 'gemini');
            const [devModel, setDevModel] = useState(() => localStorage.getItem("ellipsisprose_dev_model") || localStorage.getItem("ellipsisprose_gemini_model") || "gemini-2.0-flash");

            const [reviewProvider, setReviewProvider] = useState(() => localStorage.getItem("ellipsisprose_review_provider") || "");
            const [reviewModel, setReviewModel] = useState(() => localStorage.getItem("ellipsisprose_review_model") || "");

            const [proseProvider, setProseProvider] = useState(() => localStorage.getItem("ellipsisprose_prose_provider") || "");
            const [proseModel, setProseModel] = useState(() => localStorage.getItem("ellipsisprose_prose_model") || "");
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

            // Effective Model Config Resolver
            // Effective Model Config Resolver (delegated to src/services/llm/roleConfig)
            const getModelSettingsSnapshot = () => ({
                apiProvider, devProvider, devModel, reviewProvider, reviewModel,
                proseProvider, proseModel, geminiModel, openRouterModel,
                nanoGptModel, codexModel, koboldModel, koboldLoadedModel
            });
            const getDefaultModelForProvider = (prov) => resolveDefaultModelForProvider(prov, getModelSettingsSnapshot());
            const sanitizeLocalKoboldModel = (candidate) => sanitizeKoboldModelName(candidate, getModelSettingsSnapshot());
            const getEffectiveModelConfig = (role = "dev") => resolveEffectiveModelConfig(role, getModelSettingsSnapshot());
            window.getEffectiveModelConfig = getEffectiveModelConfig;

            // Debounced model-search hook per picker (dev, review, prose)
            const useModelSearch = (label, targetProvider) => {
                const [query, setQuery] = useState("");
                const debouncedQuery = useDebounce(query, 300);
                const [isSearching, setIsSearching] = useState(false);
                const [results, setResults] = useState([]);
                const [isDropdownOpen, setIsDropdownOpen] = useState(false);

                useEffect(() => {
                    let active = true;

                    const runSearch = async () => {
                        const providerToUse = targetProvider || devProvider || 'gemini';
                        if (providerToUse === 'koboldcpp' || providerToUse === 'codex') {
                            setResults([]);
                            setIsSearching(false);
                            return;
                        }

                        setIsSearching(true);
                        const q = debouncedQuery.trim();

                        try {
                            if (providerToUse === 'gemini') {
                                let catalog = geminiModelsList;
                                if (catalog.length === 0 && apiKey) {
                                    await fetchGeminiModels();
                                    catalog = geminiModelsList;
                                }
                                const formattedCatalog = catalog.map(m => (typeof m === 'string' ? { id: m, name: m } : m));
                                if (active) setResults(filterModelsClientSide(formattedCatalog, q));
                            } else if (providerToUse === 'openrouter') {
                                let catalog = openRouterModelsList;
                                if (catalog.length === 0) {
                                    catalog = await fetchOpenRouterModels(openRouterKey).catch(() => []);
                                }
                                if (active) setResults(filterModelsClientSide(catalog, q));
                            } else if (providerToUse === 'nanogpt') {
                                const { results: found } = await searchNanoGPTModels(q, nanoGptKey, nanoGptModelsList);
                                if (active) setResults(found);
                            }
                        } catch (e) {
                            console.error(`${label} model search error:`, e);
                            if (active) setResults([]);
                        } finally {
                            if (active) setIsSearching(false);
                        }
                    };

                    runSearch();
                    return () => { active = false; };
                }, [debouncedQuery, targetProvider, devProvider, apiKey, openRouterKey, nanoGptKey, geminiModelsList, openRouterModelsList, nanoGptModelsList]);

                return { query, setQuery, isSearching, results, setResults, isDropdownOpen, setIsDropdownOpen };
            };

            const devSearch = useModelSearch("Development", devProvider);
            const reviewSearch = useModelSearch("Review", reviewProvider || devProvider);
            const proseSearch = useModelSearch("Prose", proseProvider || devProvider);

            const {
                query: modelSearchQuery, setQuery: setModelSearchQuery,
                isSearching: isSearchingModels, results: searchResults, setResults: setSearchResults,
                isDropdownOpen: isModelDropdownOpen, setIsDropdownOpen: setIsModelDropdownOpen
            } = devSearch;

            const {
                query: reviewModelSearchQuery, setQuery: setReviewModelSearchQuery,
                isSearching: isSearchingReviewModels, results: reviewSearchResults, setResults: setReviewSearchResults,
                isDropdownOpen: isReviewModelDropdownOpen, setIsDropdownOpen: setIsReviewModelDropdownOpen
            } = reviewSearch;

            const {
                query: proseModelSearchQuery, setQuery: setProseModelSearchQuery,
                isSearching: isSearchingProseModels, results: proseSearchResults, setResults: setProseSearchResults,
                isDropdownOpen: isProseModelDropdownOpen, setIsDropdownOpen: setIsProseModelDropdownOpen
            } = proseSearch;

            // Legacy dual-model compatibility state (preserved for backward compatibility)
            const [useProseModel, setUseProseModel] = useState(() => localStorage.getItem("ellipsisprose_use_prose_model") === 'true');
            const [geminiProseModel, setGeminiProseModel] = useState(() => localStorage.getItem("ellipsisprose_gemini_prose_model") || "");
            const [openRouterProseModel, setOpenRouterProseModel] = useState(() => localStorage.getItem("ellipsisprose_openrouter_prose_model") || "");
            const [nanoGptProseModel, setNanoGptProseModel] = useState(() => localStorage.getItem("ellipsisprose_nanogpt_prose_model") || "");
            const [koboldProseModel, setKoboldProseModel] = useState(() => localStorage.getItem("ellipsisprose_kobold_prose_model") || "");
            const [codexProseModel, setCodexProseModel] = useState(() => localStorage.getItem("ellipsisprose_codex_prose_model") || "");

            // Thinking / Reasoning State variables
            const [enableThinkingAct, setEnableThinkingAct] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_thinking_act");
                return val !== null ? val === 'true' : true;
            });
            const [enableThinkingScene, setEnableThinkingScene] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_thinking_scene");
                return val !== null ? val === 'true' : true;
            });
            const [enableThinkingWriting, setEnableThinkingWriting] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_enable_thinking_writing");
                return val !== null ? val === 'true' : true;
            });

            const [thinkingBudgetStoryArc, setThinkingBudgetStoryArc] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_thinking_budget_story_arc");
                return val !== null ? parseInt(val, 10) : 16384;
            });
            const [thinkingBudgetAct, setThinkingBudgetAct] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_thinking_budget_act");
                return val !== null ? parseInt(val, 10) : 16384;
            });
            const [thinkingBudgetScene, setThinkingBudgetScene] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_thinking_budget_scene");
                return val !== null ? parseInt(val, 10) : 16384;
            });
            const [thinkingBudgetWriting, setThinkingBudgetWriting] = useState(() => {
                const val = localStorage.getItem("ellipsisprose_thinking_budget_writing");
                return val !== null ? parseInt(val, 10) : 16384;
            });
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

            const promptLog = usePipelineStore(s => s.promptLog);
            const setPromptLog = usePipelineStore(s => s.setPromptLog);
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

            const currentPipelineStep = usePipelineStore(s => s.currentPipelineStep);
            const setCurrentPipelineStep = usePipelineStore(s => s.setCurrentPipelineStep);
            const [inspectedStepId, setInspectedStepId] = useState(null);
            const generatingSceneKey = usePipelineStore(s => s.generatingSceneKey);
            const setGeneratingSceneKey = usePipelineStore(s => s.setGeneratingSceneKey);
            const [pipelineViewMode, setPipelineViewMode] = useState('detailed');
            const [pipelineDisplayMode, setPipelineDisplayMode] = useState('stage'); // 'stage' (Novel Control Center) | 'audio' (Audio Production) | 'graph' (Technical Flowchart)
            const [activePipelineWork, setActivePipelineWork] = useState(null);
            const [audioAutopilotProgress, setAudioAutopilotProgress] = useState(null);
            const [logFilter, setLogFilter] = useState('all');

            // --- EBOOK READER STATE & SETTINGS ---

            const [readerSettings, setReaderSettings] = useState(() => {
                try {
                    const saved = localStorage.getItem("ellipsisprose_reader_settings");
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        // Migrate legacy 'auto' setting to 'wasm' so existing desktop sessions (Opera/Chrome) don't stay corrupted on WebGPU
                        if (parsed.ttsDevice === 'auto') {
                            parsed.ttsDevice = 'wasm';
                        }
                        return { ...DEFAULT_READER_SETTINGS, ...parsed };
                    }
                    return DEFAULT_READER_SETTINGS;
                } catch (e) {
                    return DEFAULT_READER_SETTINGS;
                }
            });

            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_reader_settings", JSON.stringify(readerSettings));
            }, [readerSettings]);
            const readerSettingsRef = useRef(readerSettings);
            readerSettingsRef.current = readerSettings;

            const updateReaderSetting = (key, val) => {
                setReaderSettings(prev => ({ ...prev, [key]: val }));
            };

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
            const flatStoryScenesRef = useRef([]);

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

            // Reading Progress per Story
            const [readingProgress, setReadingProgress] = useState(() => {
                try {
                    const key = `ellipsisprose_reader_progress_${activeStoryId}`;
                    const saved = localStorage.getItem(key);
                    return saved ? JSON.parse(saved) : {};
                } catch (e) {
                    return {};
                }
            });

            // Reload reading progress when activeStoryId changes
            useEffect(() => {
                try {
                    const key = `ellipsisprose_reader_progress_${activeStoryId}`;
                    const saved = localStorage.getItem(key);
                    if (saved) {
                        setReadingProgress(JSON.parse(saved));
                    } else {
                        setReadingProgress({});
                    }
                } catch (e) { }
            }, [activeStoryId]);

            const [readerPageIndex, setReaderPageIndex] = useState(0);
            const readerPageIndexRef = useRef(readerPageIndex);
            readerPageIndexRef.current = readerPageIndex;
            const [readerTotalPages, setReaderTotalPages] = useState(1);
            const [isReaderHudVisible, setIsReaderHudVisible] = useState(true);
            const [isTocOpen, setIsTocOpen] = useState(false);
            const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
            const [tocSearchQuery, setTocSearchQuery] = useState("");
            const [isFullscreen, setIsFullscreen] = useState(false);
            const [pageSlideDirection, setPageSlideDirection] = useState(null);
            const [isSceneTransitioning, setIsSceneTransitioning] = useState(false);
            const [readerContainerWidth, setReaderContainerWidth] = useState(0);
            const pendingTargetPageRef = useRef(null);
            const pendingTargetSceneRef = useRef(null);
            const pendingScrollTargetRef = useRef(null);
            const pageSlideTimerRef = useRef(null);
            const readerScrollContainerRef = useRef(null);
            const readerColumnsContainerRef = useRef(null);
            const visibleScrollSceneRef = useRef({ seqIdx: 0, sceneIdx: 0 });
            const isProgrammaticScrollRef = useRef(false);
            const hudTimeoutRef = useRef(null);

            const scrollReaderToElement = useCallback((targetEl, smooth = true) => {
                const container = readerScrollContainerRef.current;
                if (!container || !targetEl) return;
                isProgrammaticScrollRef.current = true;
                setTimeout(() => { isProgrammaticScrollRef.current = false; }, 650);
                const containerRect = container.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const targetScrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 30;
                container.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }, []);
            const [touchDragOffset, setTouchDragOffset] = useState(0);
            const [isTouchDragging, setIsTouchDragging] = useState(false);
            const touchHasDraggedRef = useRef(false);
            const touchStartXRef = useRef(null);
            const touchStartYRef = useRef(null);
            const touchStartTimeRef = useRef(0);
            const justTappedRef = useRef(false);
            const touchLastXRef = useRef(0);
            const touchLastTimeRef = useRef(0);
            const touchVelocityRef = useRef(0);
            const touchIsHorizontalRef = useRef(null);

            const triggerPageSlide = (dir) => {
                setPageSlideDirection(dir);
                if (pageSlideTimerRef.current) clearTimeout(pageSlideTimerRef.current);
                pageSlideTimerRef.current = setTimeout(() => {
                    setPageSlideDirection(null);
                }, 300);
            };

            const toggleReaderHud = (forceState) => {
                if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
                setIsReaderHudVisible(prev => {
                    const next = typeof forceState === 'boolean' ? forceState : !prev;
                    return next;
                });
            };

            const resetReaderHudTimer = () => {
                if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
                setIsReaderHudVisible(true);
            };

            const saveReadingProgress = (seqIdx, sceneIdx, pageIdx = 0, scrollRatio = 0) => {
                if (seqIdx === null || sceneIdx === null) return;
                const updated = {
                    storyId: activeStoryId,
                    sequenceIndex: seqIdx,
                    sceneIndex: sceneIdx,
                    pageIndex: pageIdx,
                    scrollRatio: scrollRatio,
                    timestamp: new Date().toISOString(),
                    completedScenes: {
                        ...(readingProgress.completedScenes || {}),
                        [`${seqIdx}-${sceneIdx}`]: true
                    }
                };
                setReadingProgress(updated);
                safeLocalStorageSet(`ellipsisprose_reader_progress_${activeStoryId}`, JSON.stringify(updated));
            };

            const storyChapters = useMemo(() => {
                const list = [];
                if (!story || !Array.isArray(story.sequences)) return list;

                story.sequences.forEach((seq, seqIdx) => {
                    const seqScenes = story.scenes?.[`${seqIdx}`] || [];
                    const scenesWithData = seqScenes.map((scene, sceneIdx) => {
                        const sId = `${seqIdx}-${sceneIdx}`;
                        const proseObj = story.prose?.[sId];
                        const proseText = (proseObj && (proseObj.final || proseObj.draft)) ? (proseObj.final || proseObj.draft) : "";
                        const words = countWords(proseText);
                        const readTime = readingMinutes(words);
                        return {
                            sceneIdx,
                            scene,
                            sceneKey: sId,
                            hasProse: !!proseText,
                            proseText,
                            wordCount: words,
                            readingTime: readTime
                        };
                    });

                    const totalWords = scenesWithData.reduce((sum, sc) => sum + sc.wordCount, 0);
                    const totalReadingTime = scenesWithData.reduce((sum, sc) => sum + sc.readingTime, 0);
                    const hasAnyProse = scenesWithData.some(sc => sc.hasProse);

                    list.push({
                        chapterIndex: seqIdx,
                        seqIdx,
                        chapterNumber: seq.number || (seqIdx + 1),
                        title: seq.title || `Chapter ${seq.number || (seqIdx + 1)}`,
                        summary: seq.summary || "",
                        sequence: seq,
                        scenes: scenesWithData,
                        totalWords,
                        totalReadingTime,
                        hasAnyProse
                    });
                });
                return list;
            }, [story?.sequences, story?.scenes, story?.prose]);

            const currentChapterIndex = useMemo(() => {
                if (selectedSequence === null || selectedSequence === undefined) return 0;
                return (selectedSequence >= 0 && selectedSequence < storyChapters.length) ? selectedSequence : 0;
            }, [selectedSequence, storyChapters]);

            const currentChapter = storyChapters[currentChapterIndex] || storyChapters[0] || null;

            const [visibleScrollChapter, setVisibleScrollChapter] = useState(0);

            const flatStoryScenes = useMemo(() => {
                const list = [];
                if (!story || !Array.isArray(story.sequences)) return list;

                story.sequences.forEach((seq, seqIdx) => {
                    const seqScenes = story.scenes?.[`${seqIdx}`] || [];
                    seqScenes.forEach((scene, sceneIdx) => {
                        const sId = `${seqIdx}-${sceneIdx}`;
                        const proseObj = story.prose?.[sId];
                        const proseText = (proseObj && (proseObj.final || proseObj.draft)) ? (proseObj.final || proseObj.draft) : "";
                        const words = countWords(proseText);
                        const readTime = readingMinutes(words);

                        list.push({
                            seqIdx,
                            sceneIdx,
                            scene,
                            sequence: seq,
                            sceneKey: sId,
                            hasProse: !!proseText,
                            proseText,
                            wordCount: words,
                            readingTime: readTime
                        });
                    });
                });
                return list;
            }, [story?.sequences, story?.scenes, story?.prose]);
            flatStoryScenesRef.current = flatStoryScenes;

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

            const currentFlatSceneIndex = useMemo(() => {
                if (selectedSequence === null || selectedScene === null) return 0;
                const idx = flatStoryScenes.findIndex(s => s.seqIdx === selectedSequence && s.sceneIdx === selectedScene);
                return idx >= 0 ? idx : 0;
            }, [flatStoryScenes, selectedSequence, selectedScene]);

            const currentReaderSceneItem = flatStoryScenes[currentFlatSceneIndex] || null;

            // Micro-Haptic Feedback Helper
            const triggerMicroHaptic = (pattern) => {
                try {
                    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                        navigator.vibrate(pattern);
                    }
                } catch (e) { }
            };

            // Screen Wake Lock API for Reader Mode
            useEffect(() => {
                if (view !== 'reader') return;
                if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

                let wakeLockSentinel = null;
                let isMounted = true;

                const requestWakeLock = async () => {
                    try {
                        if (document.visibilityState === 'visible' && !wakeLockSentinel && isMounted) {
                            wakeLockSentinel = await navigator.wakeLock.request('screen');
                            wakeLockSentinel.addEventListener('release', () => {
                                wakeLockSentinel = null;
                            });
                        }
                    } catch (err) {
                        wakeLockSentinel = null;
                    }
                };

                requestWakeLock();

                const handleVisibilityChange = () => {
                    if (document.visibilityState === 'visible' && view === 'reader') {
                        requestWakeLock();
                    }
                };

                document.addEventListener('visibilitychange', handleVisibilityChange);

                return () => {
                    isMounted = false;
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    if (wakeLockSentinel) {
                        wakeLockSentinel.release().catch(() => { });
                        wakeLockSentinel = null;
                    }
                };
            }, [view]);

            // Dynamic <meta name="theme-color"> Status Bar Blending for Reader Mode
            useEffect(() => {
                let meta = document.querySelector('meta[name="theme-color"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'theme-color';
                    document.head.appendChild(meta);
                }

                if (view === 'reader') {
                    const rt = readerSettings?.readerTheme;
                    let color = '#FAF8F5'; // Folio (Light)
                    if (rt === 'sepia') color = '#F5EEDB';
                    else if (rt === 'dark') color = '#1C1917';
                    else if (rt === 'oled') color = '#000000';
                    meta.setAttribute('content', color);
                } else {
                    const defaultAppColor = theme === 'dark' ? '#141416' : '#F7F5F0';
                    meta.setAttribute('content', defaultAppColor);
                }

                return () => {
                    if (meta && view === 'reader') {
                        meta.setAttribute('content', theme === 'dark' ? '#141416' : '#F7F5F0');
                    }
                };
            }, [view, readerSettings?.readerTheme, theme]);

            const isTtsSessionActive = () => (
                ['playing', 'paused', 'generating', 'loading-model', 'loading-library'].includes(ttsStatusRef.current)
                || Boolean(ttsPlayingSceneRef.current)
            );

            const jumpToReaderChapter = (chapterIdx, initialPage = 0, dir = 'next', isProgrammatic = false) => {
                if (chapterIdx < 0 || chapterIdx >= storyChapters.length) return;
                if (!isProgrammatic && isTtsSessionActive()) {
                    setIsFollowingAudio(false);
                    isFollowingAudioRef.current = false;
                }
                triggerMicroHaptic([6, 30, 6]);
                setIsSceneTransitioning(true);
                triggerPageSlide(dir);
                setSelectedSequence(chapterIdx);
                setSelectedScene(0);
                setVisibleScrollChapter(chapterIdx);
                setIsTocOpen(false);

                if (readerSettings.readingMode === 'scroll') {
                    setTimeout(() => {
                        const targetEl = document.getElementById(`reader-chapter-${chapterIdx}`);
                        if (targetEl) {
                            scrollReaderToElement(targetEl, true);
                        }
                    }, 60);
                    saveReadingProgress(chapterIdx, 0, 0);
                } else {
                    if (initialPage === -1 || initialPage === 'last') {
                        pendingTargetPageRef.current = 'last';
                    } else {
                        pendingTargetPageRef.current = initialPage;
                        readerPageIndexRef.current = initialPage;
                        setReaderPageIndex(initialPage);
                    }
                    if (initialPage !== -1 && initialPage !== 'last') {
                        saveReadingProgress(chapterIdx, 0, initialPage);
                    }
                }
                setTimeout(() => setIsSceneTransitioning(false), 420);
            };

            const goToNextReaderChapter = (isProgrammatic = false) => {
                if (currentChapterIndex < storyChapters.length - 1) {
                    jumpToReaderChapter(currentChapterIndex + 1, 0, 'next', isProgrammatic);
                } else {
                    triggerMicroHaptic([6, 30, 6]);
                    showToast("You've reached the end of the manuscript!", "info");
                }
            };

            const goToPrevReaderChapter = (isProgrammatic = false) => {
                if (currentChapterIndex > 0) {
                    jumpToReaderChapter(currentChapterIndex - 1, 'last', 'prev', isProgrammatic);
                } else {
                    triggerMicroHaptic([6, 30, 6]);
                }
            };

            const jumpToReaderScene = (seqIdx, sceneIdx, dir = 'next', isProgrammatic = false) => {
                if (seqIdx < 0 || seqIdx >= storyChapters.length) return;
                if (!isProgrammatic && isTtsSessionActive()) {
                    setIsFollowingAudio(false);
                    isFollowingAudioRef.current = false;
                }
                triggerMicroHaptic([6, 30, 6]);
                setIsSceneTransitioning(true);
                triggerPageSlide(dir);
                setSelectedSequence(seqIdx);
                setSelectedScene(sceneIdx);
                setVisibleScrollChapter(seqIdx);
                setIsTocOpen(false);

                if (readerSettings.readingMode === 'scroll') {
                    setTimeout(() => {
                        const targetEl = document.getElementById(`reader-scene-${seqIdx}-${sceneIdx}`) || document.getElementById(`reader-chapter-${seqIdx}`);
                        if (targetEl) {
                            scrollReaderToElement(targetEl, true);
                        }
                    }, 60);
                    saveReadingProgress(seqIdx, sceneIdx, 0);
                } else {
                    if (seqIdx === selectedSequence && readerColumnsContainerRef.current) {
                        const sceneEl = document.getElementById(`reader-paginated-scene-${seqIdx}-${sceneIdx}`);
                        const gap = window.innerWidth <= 640 ? 24 : 48;
                        const width = readerContainerWidth || measureReaderPages(readerColumnsContainerRef.current)?.width || 600;
                        if (sceneEl && width > 0 && (sceneIdx === 0 || sceneEl.offsetLeft > 0)) {
                            const targetPage = Math.max(0, Math.min(Math.floor(sceneEl.offsetLeft / (width + gap)), Math.max(1, readerTotalPages) - 1));
                            readerPageIndexRef.current = targetPage;
                            setReaderPageIndex(targetPage);
                            saveReadingProgress(seqIdx, sceneIdx, targetPage);
                        } else {
                            pendingTargetSceneRef.current = { seqIdx, sceneIdx };
                        }
                    } else {
                        readerPageIndexRef.current = 0;
                        setReaderPageIndex(0);
                        pendingTargetSceneRef.current = { seqIdx, sceneIdx };
                    }
                }
                setTimeout(() => setIsSceneTransitioning(false), 420);
            };

            const goToNextReaderScene = () => {
                goToNextReaderChapter();
            };

            const turnReaderPage = (delta, isProgrammatic = false) => {
                if (isReaderHudVisible && !isTocOpen && !isAppearanceOpen && !isProgrammatic) {
                    setIsReaderHudVisible(false);
                }
                if (!isProgrammatic && isTtsSessionActive()) {
                    setIsFollowingAudio(false);
                    isFollowingAudioRef.current = false;
                }
                if (readerSettings.readingMode === 'scroll') {
                    if (readerScrollContainerRef.current) {
                        const el = readerScrollContainerRef.current;
                        const scrollAmount = Math.max(150, el.clientHeight - 48);
                        if (delta > 0) {
                            el.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                        } else {
                            el.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
                        }
                    }
                    return;
                }

                // Paginated Mode
                const findSceneForPage = (targetPg) => {
                    if (!readerColumnsContainerRef.current) return selectedScene || 0;
                    const scenes = currentChapter?.scenes || [];
                    const gap = window.innerWidth <= 640 ? 24 : 48;
                    const width = readerContainerWidth || 600;
                    const pageLeft = targetPg * (width + gap);
                    let foundSc = 0;
                    for (let i = 0; i < scenes.length; i++) {
                        const s = scenes[i];
                        const sEl = document.getElementById(`reader-paginated-scene-${selectedSequence}-${s.sceneIdx}`);
                        if (sEl && sEl.offsetLeft <= pageLeft + (width / 2)) {
                            foundSc = s.sceneIdx;
                        }
                    }
                    return foundSc;
                };

                if (isProgrammatic || Math.abs(delta) > 1) {
                    const currentPg = readerPageIndexRef.current;
                    const nextPg = Math.max(0, Math.min(Math.max(1, readerTotalPages) - 1, currentPg + delta));
                    if (nextPg !== currentPg) {
                        triggerMicroHaptic(8);
                        triggerPageSlide(delta > 0 ? 'next' : 'prev');
                        readerPageIndexRef.current = nextPg;
                        setReaderPageIndex(nextPg);
                        const currentSc = findSceneForPage(nextPg);
                        setSelectedScene(currentSc);
                        saveReadingProgress(selectedSequence, currentSc, nextPg);
                    }
                    return;
                }

                if (delta > 0) {
                    if (readerPageIndexRef.current + 1 < readerTotalPages) {
                        triggerMicroHaptic(8);
                        triggerPageSlide('next');
                        const next = readerPageIndexRef.current + 1;
                        readerPageIndexRef.current = next;
                        setReaderPageIndex(next);
                        const currentSc = findSceneForPage(next);
                        setSelectedScene(currentSc);
                        saveReadingProgress(selectedSequence, currentSc, next);
                    } else {
                        goToNextReaderChapter(false);
                    }
                } else if (delta < 0) {
                    if (readerPageIndexRef.current > 0) {
                        triggerMicroHaptic(8);
                        triggerPageSlide('prev');
                        const next = readerPageIndexRef.current - 1;
                        readerPageIndexRef.current = next;
                        setReaderPageIndex(next);
                        const currentSc = findSceneForPage(next);
                        setSelectedScene(currentSc);
                        saveReadingProgress(selectedSequence, currentSc, next);
                    } else {
                        goToPrevReaderChapter(false);
                    }
                }
            };

            const returnToActiveAudio = () => {
                const active = ttsPlayingSceneRef.current;
                setIsFollowingAudio(true);
                isFollowingAudioRef.current = true;
                if (active) {
                    if (readerSettingsRef.current?.readingMode === 'paginated') {
                        if (active.seqIdx !== selectedSequence) {
                            jumpToReaderScene(active.seqIdx, active.sceneIdx, 'next', true);
                        }
                    } else {
                        const targetEl = document.getElementById(`reader-scene-${active.seqIdx}-${active.sceneIdx}`)
                            || document.getElementById(`reader-chapter-${active.seqIdx}`);
                        if (targetEl) {
                            scrollReaderToElement(targetEl, true);
                        }
                    }
                }
                setReturnToAudioNonce(n => n + 1);
            };

            const enterReaderMode = (seqIdx = null, scIdx = null) => {
                let targetSeq = seqIdx;
                let targetSc = scIdx;
                let targetPage = null;

                if (targetSeq === null) {
                    if (readingProgress.sequenceIndex !== undefined) {
                        targetSeq = readingProgress.sequenceIndex;
                        targetSc = readingProgress.sceneIndex !== undefined ? readingProgress.sceneIndex : 0;
                        targetPage = readingProgress.pageIndex || 0;
                    } else if (selectedSequence !== null && selectedSequence !== undefined) {
                        targetSeq = selectedSequence;
                        targetSc = selectedScene !== null && selectedScene !== undefined ? selectedScene : 0;
                        targetPage = readerPageIndex || 0;
                    } else {
                        const firstWithProse = storyChapters.find(ch => ch.hasAnyProse) || storyChapters[0];
                        targetSeq = firstWithProse ? firstWithProse.seqIdx : 0;
                        targetSc = 0;
                        targetPage = 0;
                    }
                }

                setSelectedSequence(targetSeq);
                setSelectedScene(targetSc !== null && targetSc !== undefined ? targetSc : 0);
                setVisibleScrollChapter(targetSeq);

                if (readerSettings.readingMode === 'scroll') {
                    pendingScrollTargetRef.current = {
                        seqIdx: targetSeq,
                        scIdx: targetSc,
                        scrollRatio: (seqIdx === null && readingProgress.scrollRatio) ? readingProgress.scrollRatio : 0
                    };
                } else {
                    if (seqIdx === null) {
                        // Resuming reading or general ReaderView entry: prioritize saved page
                        if (targetPage !== null && targetPage !== undefined) {
                            pendingTargetPageRef.current = targetPage;
                            setReaderPageIndex(targetPage);
                        } else {
                            pendingTargetPageRef.current = 0;
                            setReaderPageIndex(0);
                        }
                        pendingTargetSceneRef.current = null;
                    } else {
                        // Explicit navigation to specific sequence / scene
                        if (targetSc !== null && targetSc !== undefined && targetSc > 0) {
                            pendingTargetSceneRef.current = { seqIdx: targetSeq, sceneIdx: targetSc };
                            pendingTargetPageRef.current = null;
                        } else if (targetPage !== null && targetPage !== undefined) {
                            pendingTargetPageRef.current = targetPage;
                            setReaderPageIndex(targetPage);
                            pendingTargetSceneRef.current = null;
                        } else {
                            pendingTargetPageRef.current = 0;
                            setReaderPageIndex(0);
                            pendingTargetSceneRef.current = null;
                        }
                    }
                }

                setView('reader');
                setIsSidebarOpen(false);
                resetReaderHudTimer();
            };

            const toggleFullscreen = () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
                    }
                }
            };

            // Scroll Mode position restoration effect
            useEffect(() => {
                if (view !== 'reader') return;
                if (readerSettings.readingMode === 'scroll') {
                    let attempts = 0;
                    const tryScroll = () => {
                        if (!pendingScrollTargetRef.current) return;
                        const { seqIdx, scIdx, scrollRatio } = pendingScrollTargetRef.current;
                        let target = null;
                        if (scIdx !== null && scIdx !== undefined) {
                            target = document.getElementById(`reader-scene-${seqIdx}-${scIdx}`);
                        }
                        if (!target && seqIdx !== null && seqIdx !== undefined) {
                            target = document.getElementById(`reader-chapter-${seqIdx}`);
                        }
                        if (target) {
                            scrollReaderToElement(target, false);
                            pendingScrollTargetRef.current = null;
                        } else if (scrollRatio > 0 && readerScrollContainerRef.current) {
                            const el = readerScrollContainerRef.current;
                            const max = el.scrollHeight - el.clientHeight;
                            if (max > 0) {
                                el.scrollTop = Math.round(scrollRatio * max);
                                pendingScrollTargetRef.current = null;
                            } else if (attempts < 5) {
                                attempts++;
                                setTimeout(tryScroll, 60);
                            }
                        } else if (attempts < 5) {
                            attempts++;
                            setTimeout(tryScroll, 60);
                        }
                    };
                    const timer = setTimeout(tryScroll, 60);
                    return () => clearTimeout(timer);
                }
            }, [view, readerSettings.readingMode, selectedSequence]);

            // Dynamic synchronous page count calculation in Paginated Mode (runs before browser paint)
            useLayoutEffect(() => {
                if (view !== 'reader' || readerSettings.readingMode !== 'paginated') return;

                const calculatePages = () => {
                    if (!readerColumnsContainerRef.current) return;
                    const measured = measureReaderPages(readerColumnsContainerRef.current);
                    if (!measured) return;
                    setReaderContainerWidth(measured.width);
                    setReaderTotalPages(measured.pages);
                    if (pendingTargetSceneRef.current) {
                        const { seqIdx, sceneIdx } = pendingTargetSceneRef.current;
                        const sceneEl = document.getElementById(`reader-paginated-scene-${seqIdx}-${sceneIdx}`);
                        const gap = window.innerWidth <= 640 ? 24 : 48;
                        if (sceneEl && measured.width > 0) {
                            if (sceneIdx > 0 && sceneEl.offsetLeft === 0 && (measured.pages > 1 || currentChapter?.totalWords > 150)) {
                                requestAnimationFrame(() => calculatePages());
                                return;
                            }
                            const targetPage = Math.max(0, Math.min(Math.floor(sceneEl.offsetLeft / (measured.width + gap)), measured.pages - 1));
                            setReaderPageIndex(targetPage);
                            saveReadingProgress(seqIdx, sceneIdx, targetPage);
                            pendingTargetSceneRef.current = null;
                            pendingTargetPageRef.current = null;
                            return;
                        }
                    }

                    if (pendingTargetPageRef.current === 'last') {
                        if (measured.pages <= 1 && currentChapter?.totalWords > 150) {
                            requestAnimationFrame(() => calculatePages());
                            return;
                        }
                        const lastIdx = Math.max(0, measured.pages - 1);
                        setReaderPageIndex(lastIdx);
                        pendingTargetPageRef.current = null;
                    } else if (typeof pendingTargetPageRef.current === 'number') {
                        if (pendingTargetPageRef.current >= measured.pages && currentChapter?.totalWords > 150) {
                            requestAnimationFrame(() => calculatePages());
                            return;
                        }
                        const targetIdx = Math.max(0, Math.min(pendingTargetPageRef.current, measured.pages - 1));
                        setReaderPageIndex(targetIdx);
                        pendingTargetPageRef.current = null;
                    } else if (readerPageIndex >= measured.pages) {
                        if (measured.pages > 1 || !currentChapter?.totalWords || currentChapter.totalWords <= 150) {
                            setReaderPageIndex(Math.max(0, measured.pages - 1));
                        }
                    }
                };

                calculatePages();
            }, [view, readerSettings, selectedSequence, currentChapter?.totalWords, readerContainerWidth]);

            // Window resize handler for reader mode
            useEffect(() => {
                if (view !== 'reader' || readerSettings.readingMode !== 'paginated') return;
                const handleResize = () => {
                    if (!readerColumnsContainerRef.current) return;
                    const measured = measureReaderPages(readerColumnsContainerRef.current);
                    if (!measured) return;
                    setReaderContainerWidth(measured.width);
                    setReaderTotalPages(measured.pages);
                    if (readerPageIndex >= measured.pages) {
                        setReaderPageIndex(Math.max(0, measured.pages - 1));
                    }
                };

                window.addEventListener('resize', handleResize);
                window.addEventListener('orientationchange', handleResize);

                let ro = null;
                if (typeof ResizeObserver !== 'undefined' && readerColumnsContainerRef.current?.parentElement) {
                    ro = new ResizeObserver(() => {
                        handleResize();
                    });
                    ro.observe(readerColumnsContainerRef.current.parentElement);
                }

                return () => {
                    window.removeEventListener('resize', handleResize);
                    window.removeEventListener('orientationchange', handleResize);
                    if (ro) ro.disconnect();
                };
            }, [view, readerSettings, selectedSequence, currentChapter?.totalWords]);

            // Keyboard listener for reader mode
            useEffect(() => {
                if (view !== 'reader') return;

                const handleKeyDown = (e) => {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

                    const isNextPage = e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown' || (e.key === ' ' && !e.shiftKey) || e.code === 'PageDown' || e.code === 'ArrowRight';
                    const isPrevPage = e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp' || (e.key === ' ' && e.shiftKey) || e.code === 'PageUp' || e.code === 'ArrowLeft';

                    if (isNextPage) {
                        e.preventDefault();
                        turnReaderPage(1);
                    } else if (isPrevPage) {
                        e.preventDefault();
                        turnReaderPage(-1);
                    } else if (e.key === 'Escape') {
                        if (isTocOpen) setIsTocOpen(false);
                        else if (isAppearanceOpen) setIsAppearanceOpen(false);
                        else setView('writer');
                    } else if (e.key === 't' || e.key === 'T') {
                        setIsTocOpen(prev => !prev);
                        setIsAppearanceOpen(false);
                    } else if (e.key === 'a' || e.key === 'A') {
                        setIsAppearanceOpen(prev => !prev);
                        setIsTocOpen(false);
                    }
                };

                window.addEventListener('keydown', handleKeyDown);
                return () => window.removeEventListener('keydown', handleKeyDown);
            }, [view, readerPageIndex, readerTotalPages, isTocOpen, isAppearanceOpen, currentChapterIndex, storyChapters, readerSettings.readingMode]);

            // Touch Swipe & Direct Manipulation Gestures
            const handleReaderTouchStart = (e) => {
                if (!e.touches || e.touches.length === 0) return;
                const clientX = e.touches[0].clientX;
                const clientY = e.touches[0].clientY;
                touchStartXRef.current = clientX;
                touchStartYRef.current = clientY;
                touchStartTimeRef.current = Date.now();
                touchLastXRef.current = clientX;
                touchLastTimeRef.current = Date.now();
                touchVelocityRef.current = 0;
                touchIsHorizontalRef.current = null;
                touchHasDraggedRef.current = false;
            };

            const handleReaderTouchMove = (e) => {
                if (touchStartXRef.current === null || !e.touches || e.touches.length === 0) return;
                const clientX = e.touches[0].clientX;
                const clientY = e.touches[0].clientY;
                const diffX = clientX - touchStartXRef.current;
                const diffY = clientY - touchStartYRef.current;
                const dist = Math.hypot(diffX, diffY);

                if (dist > 8) {
                    touchHasDraggedRef.current = true;
                }

                if (touchIsHorizontalRef.current === null) {
                    if (dist > 8) {
                        touchIsHorizontalRef.current = Math.abs(diffX) >= Math.abs(diffY);
                        if (touchIsHorizontalRef.current && readerSettings.readingMode === 'paginated') {
                            setIsTouchDragging(true);
                            touchHasDraggedRef.current = true;
                        }
                    }
                }

                if (touchIsHorizontalRef.current && readerSettings.readingMode === 'paginated') {
                    if (e.cancelable) e.preventDefault();
                    touchHasDraggedRef.current = true;

                    const width = readerContainerWidth || (typeof window !== 'undefined' ? window.innerWidth : 600);
                    const atStart = readerPageIndex === 0 && currentChapterIndex === 0;
                    const atEnd = readerPageIndex >= readerTotalPages - 1 && currentChapterIndex >= storyChapters.length - 1;

                    let offset = diffX;
                    if ((diffX > 0 && atStart) || (diffX < 0 && atEnd)) {
                        // Apple progressive resistance rubber-band formula
                        const constant = 0.35;
                        offset = (diffX * width * constant) / (width + constant * Math.abs(diffX));
                    }

                    setTouchDragOffset(offset);

                    const now = Date.now();
                    const dt = Math.max(1, now - touchLastTimeRef.current);
                    touchVelocityRef.current = (clientX - touchLastXRef.current) / dt;
                    touchLastXRef.current = clientX;
                    touchLastTimeRef.current = now;
                }
            };

            const handleReaderTouchEnd = (e) => {
                if (touchStartXRef.current === null) return;
                const endX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX : touchLastXRef.current;
                const endY = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientY : touchStartYRef.current;
                const diffX = endX - touchStartXRef.current;
                const diffY = endY - (touchStartYRef.current || endY);
                const totalDist = Math.hypot(diffX, diffY);
                const dt = Date.now() - (touchStartTimeRef.current || 0);
                const isHorizontal = touchIsHorizontalRef.current ?? (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 20);
                const velocity = touchVelocityRef.current || 0;
                const width = readerContainerWidth || (typeof window !== 'undefined' ? window.innerWidth : 600);

                setIsTouchDragging(false);
                setTouchDragOffset(0);

                // Tap detection: minimal movement (< 16px) and short duration (< 450ms)
                const wasTap = !touchHasDraggedRef.current && totalDist < 16 && dt < 450;
                const tappedInteractive = e.target && e.target.closest && e.target.closest('button, a, input, select, .reader-ui-card, .studio-top-header');

                if (wasTap && !tappedInteractive) {
                    if (e.cancelable) {
                        e.preventDefault();
                    }
                    const screenW = (typeof window !== 'undefined' ? window.innerWidth : 400);
                    const screenH = (typeof window !== 'undefined' ? window.innerHeight : 800);
                    const isMiddleX = endX >= screenW * 0.20 && endX <= screenW * 0.80;
                    const isMiddleY = endY >= screenH * 0.12 && endY <= screenH * 0.88;

                    justTappedRef.current = true;
                    setTimeout(() => { justTappedRef.current = false; }, 400);

                    if (readerSettings.readingMode === 'paginated') {
                        if (isMiddleX && isMiddleY) {
                            toggleReaderHud();
                        } else if (endX < screenW * 0.20) {
                            turnReaderPage(-1);
                        } else if (endX > screenW * 0.80) {
                            turnReaderPage(1);
                        }
                    } else {
                        // Continuous Scroll Mode: single tap in middle portion brings up HUD consistently
                        if (isMiddleX && isMiddleY) {
                            toggleReaderHud();
                        }
                    }
                } else if (!wasTap) {
                    if (readerSettings.readingMode === 'paginated' && isHorizontal) {
                        // Paginated Mode: flick detection or drag distance threshold
                        const threshold = Math.min(60, Math.max(35, width * 0.15));
                        const isFlickNext = velocity < -0.25 || (diffX < -threshold && velocity <= 0.1);
                        const isFlickPrev = velocity > 0.25 || (diffX > threshold && velocity >= -0.1);

                        if (isFlickNext) {
                            turnReaderPage(1);
                        } else if (isFlickPrev) {
                            turnReaderPage(-1);
                        }
                    }
                    // In continuous scroll mode, sideways swipes DO NOT jump chapters.
                }

                touchStartXRef.current = null;
                touchStartYRef.current = null;
                touchIsHorizontalRef.current = null;
                touchVelocityRef.current = 0;

                setTimeout(() => {
                    touchHasDraggedRef.current = false;
                }, 120);
            };

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
            const ttsStatusRef = useRef('idle');
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
                })
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


            const verifyAndArchiveDirectiveScene = async (storyState, sId, logMessage) => {
                const [seqIdx, sceneIdx] = sId.split('-').map(Number);
                const label = `${seqIdx + 1}.${sceneIdx + 1}`;
                let review;
                if (!enableReview) {
                    review = { status: 'PASS', critique: 'Review bypassed via settings', issues: [], error: false };
                    logMessage(`[Verify] Scene ${label}: PASS (bypassed via settings)`, 'success');
                } else {
                    try {
                        const isAudioMode = storyState?.writing_mode === 'audio_drama' ||
                            (typeof isAudioDramaScriptText === 'function' && isAudioDramaScriptText(storyState?.prose?.[sId]?.final || ''));
                        const reviewSysPrompt = isAudioMode ? PROMPTS.audioDramaWritingReview : PROMPTS.writingReview;
                        const output = await callAI(buildDirectiveReviewContext(storyState, seqIdx, sceneIdx), reviewSysPrompt, false, 'Directive Prose Reviewer', 'review');
                        review = parseDirectiveReview(output);
                    } catch (err) {
                        console.warn('Directive prose verification failed:', err);
                        review = directiveReviewFailure(err);
                    }
                    logMessage(`[Verify] Scene ${label}: ${review.status === 'PASS' ? 'PASS' : `FAIL (${review.issues.length} issues)`}`, review.status === 'PASS' ? 'success' : 'error');
                }
                if (!review.issues.some(issue => issue.severity === 'CRITICAL')) {
                    const archived = await runArchivistForScene(storyState, seqIdx, sceneIdx);
                    logMessage(`[Archive] Scene ${label}: ${archived !== storyState ? 'updated continuity' : 'no updates returned'}`, archived !== storyState ? 'success' : 'pending');
                    storyState = archived;
                }
                return { story: storyState, review };
            };

            const reviewDirectiveConsistency = async (storyState, sceneIds, consistencyNotes, logMessage) => {
                let review;
                if (!enableReview) {
                    review = { status: 'PASS', critique: 'Consistency review bypassed via settings', issues: [], error: false };
                    logMessage(`[Consistency] Cross-scene consistency: PASS (bypassed via settings)`, 'success');
                    return review;
                }
                try {
                    const excerpts = sceneIds.map(sId => {
                        const [seqIdx, sceneIdx] = sId.split('-').map(Number);
                        const scene = storyState.scenes?.[`${seqIdx}`]?.[sceneIdx];
                        const prose = storyState.prose?.[sId]?.final || '';
                        return `<scene><number>${seqIdx + 1}.${sceneIdx + 1}</number><title>${escapeXml(scene?.title || '')}</title><first>${escapeXml(prose.slice(0, 600))}</first><last>${escapeXml(prose.slice(-600))}</last></scene>`;
                    }).join('\n');
                    const output = await callAI(`<consistency_notes>\n${escapeXml(consistencyNotes || '')}\n</consistency_notes>\n<scene_excerpts>\n${excerpts}\n</scene_excerpts>`, PROMPTS.directiveConsistencyReview, false, 'Directive Consistency Reviewer', 'review');
                    review = parseDirectiveReview(output);
                } catch (err) {
                    console.warn('Directive cross-scene review failed:', err);
                    review = directiveReviewFailure(err);
                }
                logMessage(`[Consistency] Cross-scene consistency: ${review.status === 'PASS' ? 'PASS' : `FAIL (${review.issues.length} issues)`}`, review.status === 'PASS' ? 'success' : 'error');
                return review;
            };

            const handleFixDirectiveReview = async (actionIdx) => {
                if (isPlanningDirective || isExecutingDirective) return;
                const action = directivePlan?.actions[actionIdx];
                const result = action?.result;
                if (!result?.review?.issues?.length || result.review.error || result.reviewFixAttempted || !result.proseSceneId) return;
                const sId = result.proseSceneId;
                const currentProse = story.prose?.[sId]?.final || '';
                if (!currentProse.trim()) return;
                setIsExecutingDirective(true);
                const updateResult = (updates) => setDirectivePlan(prev => prev ? {
                    ...prev, actions: prev.actions.map((item, idx) => idx === actionIdx ? { ...item, result: { ...item.result, ...updates } } : item)
                } : prev);
                const logMessage = (text, status = 'pending') => setDirectiveExecutionLogs(prev => [...prev, { id: Date.now() + Math.random(), text, status }]);
                updateResult({ reviewFixAttempted: true });
                try {
                    const isAudioMode = story?.writing_mode === 'audio_drama' ||
                        (typeof isAudioDramaScriptText === 'function' && isAudioDramaScriptText(currentProse));
                    const surgicalSysPrompt = isAudioMode ? PROMPTS.audioDramaSurgicalEditorProse : PROMPTS.surgicalEditorProse;
                    const output = await callAI(`<original_text>\n${currentProse}\n</original_text>\n<reviewer_feedback>\n${escapeXml(JSON.stringify(result.review.issues, null, 2))}\n</reviewer_feedback>`, surgicalSysPrompt, false, 'Directive Surgical Review Fix', 'review');
                    // This shared wrapper applies detailed edits and retries failed anchors at most once.
                    const report = await applySurgicalEditsWithRetry({ originalText: currentProse, blocksText: output, systemPrompt: surgicalSysPrompt, logName: 'Directive Surgical Review Fix', modelSize: 'review' });
                    if (!report.applied.length) throw new Error(report.summary || 'No surgical edits could be applied.');
                    const changeRatio = computeChangeRatio(currentProse, report.text);
                    if (changeRatio > SURGICAL_MAX_CHANGE_RATIO && action.allow_large_change !== true) {
                        throw new Error(`Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`);
                    }
                    const finalFixedText = (isAudioMode && typeof normalizeAudioDramaScript === 'function')
                        ? normalizeAudioDramaScript(report.text)
                        : report.text;
                    let nextStory = setStory(prev => {
                        const prose = { ...(prev.prose?.[sId] || {}), final: finalFixedText };
                        delete prose.stale;
                        return { ...prev, prose: { ...(prev.prose || {}), [sId]: prose } };
                    });
                    updateResult({ appliedEdits: [...(result.appliedEdits || []), ...report.applied], review: undefined });
                    setDirectivePlan(prev => prev ? { ...prev, consistencyReview: undefined } : prev);
                    logMessage(`[Fix] ${report.summary}`, report.failed.length ? 'error' : 'success');
                    const verified = await verifyAndArchiveDirectiveScene(nextStory, sId, logMessage);
                    nextStory = setStory(() => verified.story);
                    updateResult({ review: verified.review });
                    logMessage(`[Fix] Scene ${sId.split('-').map(n => Number(n) + 1).join('.')}: ${verified.review.status}`, verified.review.status === 'PASS' ? 'success' : 'error');
                } catch (err) {
                    console.warn('Directive surgical review fix failed:', err);
                    logMessage(`[Fix] Failed: ${err?.message || String(err)}`, 'error');
                } finally {
                    setIsExecutingDirective(false);
                }
            };


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

            const executeDirectivePlan = async (planActions) => {
                if (isPlanningDirective || isExecutingDirective) return;
                const snapshot = JSON.parse(JSON.stringify(story));
                try {
                    setDirectiveUndoSnapshot(snapshot);
                    setIsExecutingDirective(true);
                    setDirectiveProgress(0);
                    setDirectiveExecutionLogs([]);

                    let currentStory = JSON.parse(JSON.stringify(snapshot));
                    const results = [];
                    const touchedProseScenes = new Set();
                    let lastProseActions = new Map();
                    // Keep prior edit undo targets attached to their scenes as later structural actions shift keys.
                    const rekeyResultScenes = (mapKey) => {
                        results.forEach(result => {
                            if (result.proseSceneId) result.proseSceneId = mapKey(result.proseSceneId);
                        });
                        lastProseActions = new Map([...lastProseActions].map(([key, idx]) => [mapKey(key), idx]).filter(([key]) => key !== null));
                        touchedProseScenes.clear();
                        lastProseActions.forEach((idx, key) => touchedProseScenes.add(key));
                    };
                    setDirectivePlan(prev => prev ? {
                        ...prev, consistencyReview: undefined, actions: prev.actions.map(action => ({ ...action, result: undefined }))
                    } : prev);

                    const logMessage = (text, status = 'pending') => {
                        setDirectiveExecutionLogs(prev => {
                            if (prev.length > 0 && prev[prev.length - 1].status === 'running' && (status === 'success' || status === 'error')) {
                                const next = [...prev];
                                next[next.length - 1] = { ...next[next.length - 1], status, text: text || next[next.length - 1].text };
                                return next;
                            }
                            return [...prev, { id: Date.now() + Math.random(), text, status }];
                        });
                    };

                    for (let i = 0; i < planActions.length; i++) {
                        const action = planActions[i];
                        const actionNum = i + 1;
                        const totalActions = planActions.length;
                        let resultMessage = '';
                        let appliedEditsForAction;
                        let cascadeInstructions = '';
                        let cascadeResult;

                        try {
                            if (action.skipped === true) {
                                const message = 'Skipped by author before execution.';
                                results[i] = { status: 'skipped', message };
                                logMessage(`[Action ${actionNum}/${totalActions}] Skipped by author: ${action.description || action.action_type}`, 'pending');
                                continue;
                            }
                            const blockedByProtection = isActionBlockedByProtection(action, currentStory, protectWrittenProse);
                            if (blockedByProtection && action.allow_protected !== true) {
                                const message = 'Protect Written Prose is enabled. Target is in a locked section.';
                                results[i] = { status: 'skipped', message };
                                logMessage(`[Action ${actionNum}/${totalActions}] Skipped: ${message}`, 'pending');
                                continue;
                            }

                            logMessage(`[Action ${actionNum}/${totalActions}] Running: ${action.description}`, 'running');

                            const actIdx = action.target_act_idx !== undefined && action.target_act_idx !== null ? parseInt(action.target_act_idx, 10) : 0;
                            const seqIdx = action.target_sequence_idx !== undefined && action.target_sequence_idx !== null ? parseInt(action.target_sequence_idx, 10) : (action.target_seq_idx !== undefined && action.target_seq_idx !== null ? parseInt(action.target_seq_idx, 10) : 0);
                            const sceneIdx = action.target_scene_idx !== null && action.target_scene_idx !== undefined ? parseInt(action.target_scene_idx, 10) : 0;
                            const sceneKey = `${seqIdx}`;
                            const sId = `${seqIdx}-${sceneIdx}`;
                            const proseBeforeAction = currentStory.prose?.[sId]?.final;

                            // SCALE 0: STORY & METADATA OPERATIONS
                            if (action.action_type === 'MODIFY_STORY_METADATA') {
                                const style = { ...(currentStory.style || {}) };
                                if (action.details.title !== undefined) currentStory.title = action.details.title;
                                if (action.details.concept !== undefined) currentStory.concept = action.details.concept;
                                if (action.details.heart_of_the_dilemma !== undefined) currentStory.heart_of_the_dilemma = action.details.heart_of_the_dilemma;
                                if (action.details.status_quo !== undefined) currentStory.status_quo = action.details.status_quo;
                                if (action.details.inciting_incident !== undefined) currentStory.inciting_incident = action.details.inciting_incident;
                                if (action.details.themes !== undefined) currentStory.themes = action.details.themes;
                                if (action.details.core_thematic_argument !== undefined) currentStory.core_thematic_argument = action.details.core_thematic_argument;
                                if (action.details.starting_value_state !== undefined) currentStory.starting_value_state = action.details.starting_value_state;
                                if (action.details.ending_value_state !== undefined) currentStory.ending_value_state = action.details.ending_value_state;
                                if (action.details.major_surprises_and_twists !== undefined) currentStory.major_surprises_and_twists = action.details.major_surprises_and_twists;
                                if (action.details.author_note !== undefined) currentStory.author_note = action.details.author_note;
                                if (action.details.genre !== undefined) style.genre = action.details.genre;
                                if (action.details.mood !== undefined) style.mood = action.details.mood;
                                if (action.details.writing_guide !== undefined) style.writing_guide = action.details.writing_guide;
                                if (action.details.synthesized_authorial_persona !== undefined) {
                                    currentStory.synthesized_authorial_persona = action.details.synthesized_authorial_persona;
                                    style.synthesized_authorial_persona = action.details.synthesized_authorial_persona;
                                }
                                if (action.details.genre_pacing_and_dialogue_rules !== undefined) {
                                    currentStory.genre_pacing_and_dialogue_rules = action.details.genre_pacing_and_dialogue_rules;
                                    style.genre_pacing_and_dialogue_rules = action.details.genre_pacing_and_dialogue_rules;
                                }
                                if (action.details.strict_anti_patterns !== undefined) {
                                    currentStory.strict_anti_patterns = action.details.strict_anti_patterns;
                                    style.strict_anti_patterns = action.details.strict_anti_patterns;
                                }
                                currentStory.style = style;

                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: Surgically modified story metadata.`, 'success');
                            }
                            else if (action.action_type === 'ADD_CHARACTER') {
                                let charNameToAdd = action.details.name || "Unnamed Character";
                                let auditedDetails = { ...(action.details || {}) };
                                if (
                                    slopConfig?.enableSlopAudit !== false && slopConfig?.enableUpstreamNameAudit !== false &&
                                    typeof window.auditEntityNamesAndPlaces === 'function' && charNameToAdd !== "Unnamed Character"
                                ) {
                                    try {
                                        const directiveConceptStory = {
                                            ...(currentStory || {}),
                                            concept: `${currentStory?.concept || ''}\n${directiveInput || ''}`
                                        };
                                        const dirAudit = window.auditEntityNamesAndPlaces({
                                            characters: [{ name: charNameToAdd, role: action.details.role || "Minor Character" }],
                                            existingCast: currentStory.cast || [],
                                            slopConfig,
                                            story: directiveConceptStory
                                        });
                                        if (!dirAudit.valid && dirAudit.violations.length > 0) {
                                            const { renameMap } = await repairBannedEntitiesWithAI({
                                                violations: dirAudit.violations,
                                                existingNames: (currentStory.cast || []).map(c => c.name).concat([charNameToAdd]),
                                                storyContext: currentStory.concept || '',
                                                story: directiveConceptStory
                                            });
                                            if (renameMap[charNameToAdd]) {
                                                charNameToAdd = renameMap[charNameToAdd];
                                                Object.keys(auditedDetails).forEach(dk => {
                                                    if (typeof auditedDetails[dk] === 'string') {
                                                        auditedDetails[dk] = window.applyCascadingNameReplacements(auditedDetails[dk], renameMap);
                                                    }
                                                });
                                                auditedDetails.name = charNameToAdd;
                                                logMessage(`[Action ${actionNum}/${totalActions}] Upstream Name Audit renamed ${action.details.name} → ${charNameToAdd}.`, 'info');
                                            }
                                        }
                                    } catch (dirAuditErr) {
                                        console.warn("[Directive ADD_CHARACTER] Name audit warning:", dirAuditErr);
                                    }
                                }
                                const rawAddedCadence = cleanCharacterNameFromVoiceProfile(auditedDetails.vocal_cadence || "", [charNameToAdd]);
                                const newChar = {
                                    id: `C_dyn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                                    name: charNameToAdd,
                                    role: auditedDetails.role || "Minor Character",
                                    ...(auditedDetails.corner_role ? { corner_role: auditedDetails.corner_role } : {}),
                                    core_flaw: auditedDetails.core_flaw || "Unspecified flaw",
                                    core_desire: auditedDetails.core_desire || "Unspecified desire",
                                    vocal_cadence: isValidQwenVoiceProfile(rawAddedCadence)
                                        ? rawAddedCadence
                                        : synthesizeQwenVoiceDesignProfile(auditedDetails, charNameToAdd, currentStory),
                                    ...(auditedDetails.deep_profile ? { details: { deep_profile: auditedDetails.deep_profile } } : {})
                                };
                                ['why_it_makes_sense', 'what_it_costs_them', 'way_of_living', 'why_it_is_appealing', 'shared_outlook',
                                    'the_hidden_trap', 'how_they_ended_up', 'human_sympathy', 'the_wake_up_call'].forEach(field => {
                                        if (auditedDetails[field]) newChar[field] = auditedDetails[field];
                                    });
                                newChar.voice_seed = getDeterministicVoiceSeed(newChar, currentStory);
                                if (newChar.details?.deep_profile && !newChar.reference_text) {
                                    const extractedRef = extractPersonalizedReferenceTextFromInterview(newChar.details.deep_profile);
                                    if (extractedRef) newChar.reference_text = extractedRef;
                                }
                                currentStory.cast = [...(currentStory.cast || []), newChar];
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: Added new character ${newChar.name}.`, 'success');
                            }
                            else if (action.action_type === 'MODIFY_CHARACTER') {
                                let castList = [...(currentStory.cast || [])];
                                let charIdx = castList.findIndex(c => c.id === action.target_character_id);
                                if (charIdx === -1 && action.details.name) {
                                    charIdx = castList.findIndex(c => c.name.toLowerCase() === action.details.name.toLowerCase());
                                }

                                if (charIdx > -1) {
                                    const char = { ...castList[charIdx], details: { ...(castList[charIdx].details || {}) } };
                                    if (action.details.name) char.name = action.details.name;
                                    if (action.details.role) char.role = action.details.role;
                                    if (action.details.corner_role) char.corner_role = action.details.corner_role;
                                    ['why_it_makes_sense', 'what_it_costs_them', 'way_of_living', 'why_it_is_appealing', 'shared_outlook',
                                        'the_hidden_trap', 'how_they_ended_up', 'human_sympathy', 'the_wake_up_call'].forEach(field => {
                                            if (action.details[field] !== undefined) char[field] = action.details[field];
                                        });
                                    if (action.details.core_flaw !== undefined) char.core_flaw = action.details.core_flaw;
                                    if (action.details.core_desire !== undefined) char.core_desire = action.details.core_desire;
                                    if (action.details.deep_profile !== undefined) char.details.deep_profile = action.details.deep_profile;
                                    if (action.details.aliases !== undefined) {
                                        char.aliases = Array.isArray(action.details.aliases)
                                            ? action.details.aliases
                                            : String(action.details.aliases).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                                    }
                                    if (action.details.vocal_cadence) {
                                        const cleanedModCadence = cleanCharacterNameFromVoiceProfile(action.details.vocal_cadence, [char.name]);
                                        char.vocal_cadence = isValidQwenVoiceProfile(cleanedModCadence)
                                            ? cleanedModCadence
                                            : synthesizeQwenVoiceDesignProfile({ ...char, vocal_cadence: cleanedModCadence }, char.name, currentStory);
                                    }
                                    if (!char.voice_seed) char.voice_seed = getDeterministicVoiceSeed(char, currentStory);
                                    if (action.details.deep_profile !== undefined && !char.user_edited_reference_text && !currentStory.user_edited?.[`cast.${char.name}.reference_text`]) {
                                        const extractedModRef = extractPersonalizedReferenceTextFromInterview(char.details.deep_profile);
                                        if (extractedModRef) char.reference_text = extractedModRef;
                                    }

                                    castList[charIdx] = char;
                                    currentStory = { ...currentStory, cast: castList };
                                    setStory(currentStory);
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: Surgically modified character ${char.name}.`, 'success');
                                } else {
                                    throw new Error(`Character ${action.target_character_id || action.details.name} not found.`);
                                }
                            }
                            else if (action.action_type === 'DELETE_CHARACTER') {
                                let castList = [...(currentStory.cast || [])];
                                let charIdx = castList.findIndex(c => c.id === action.target_character_id);
                                if (charIdx === -1 && action.details.name) {
                                    charIdx = castList.findIndex(c => c.name.toLowerCase() === action.details.name.toLowerCase());
                                }

                                if (charIdx > -1) {
                                    const deletedName = castList[charIdx].name;
                                    castList.splice(charIdx, 1);
                                    currentStory = { ...currentStory, cast: castList };
                                    setStory(currentStory);
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: Deleted character ${deletedName}.`, 'success');
                                } else {
                                    throw new Error(`Character ${action.target_character_id || action.details.name} not found to delete.`);
                                }
                            }

                            else if (action.action_type === 'MODIFY_RELATIONSHIP') {
                                const details = action.details;
                                const names = details.relationship_key ? details.relationship_key.split('->') : [details.from_name, details.to_name];
                                if (names.length !== 2) throw new Error('relationship_key must use NameA->NameB.');
                                const resolveName = (name) => {
                                    const character = (currentStory.cast || []).find(c => c.name.toLowerCase() === String(name || '').trim().toLowerCase());
                                    if (!character) throw new Error(`Unknown relationship character: ${name || '(missing name)'}.`);
                                    return character.name;
                                };
                                const from = resolveName(names[0]);
                                const to = resolveName(names[1]);
                                const relationships = { ...(currentStory.relationships || {}) };
                                const key = Object.keys(relationships).find(key => key.split('->').map(name => name.trim().toLowerCase()).join('->') === `${from}->${to}`.toLowerCase()) || `${from}->${to}`;
                                const entry = { current: '', hidden_tension: '', trust_level: 5, ...relationships[key] };
                                ['current', 'hidden_tension'].forEach(field => {
                                    if (details[field] !== undefined) entry[field] = details[field];
                                });
                                if (details.trust_level !== undefined && details.trust_level !== '') {
                                    const trust = Number(details.trust_level);
                                    if (!Number.isFinite(trust) || trust < 1 || trust > 10) throw new Error('trust_level must be between 1 and 10.');
                                    entry.trust_level = trust;
                                }
                                entry.history = [...(entry.history || []), { chapter: 'Directive', change: details.current || `Updated relationship ${from}->${to}.` }];
                                relationships[key] = entry;
                                currentStory = { ...currentStory, relationships };
                                resultMessage = `Updated relationship ${from}->${to}.`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'ADD_THREAD' || action.action_type === 'MODIFY_THREAD' || action.action_type === 'DELETE_THREAD') {
                                const threads = [...(currentStory.threads || [])];
                                const reqId = String(action.details.thread_id || action.details.id || '').trim();
                                const matchIdx = threads.findIndex(t => (reqId && String(t.id || '').toLowerCase() === reqId.toLowerCase()) ||
                                    (action.details.name && String(t.name || '').toLowerCase() === action.details.name.toLowerCase()));
                                if (action.action_type === 'ADD_THREAD') {
                                    const nextId = reqId || `T${threads.length + 1}`;
                                    if (!action.details.name && !action.details.description) throw new Error('ADD_THREAD requires name or description.');
                                    const entry = {
                                        id: nextId,
                                        name: action.details.name || `Thread ${nextId}`,
                                        description: action.details.description || ''
                                    };
                                    if (matchIdx > -1) threads[matchIdx] = { ...threads[matchIdx], ...entry };
                                    else threads.push(entry);
                                    resultMessage = `Added narrative thread ${entry.id}: ${entry.name}.`;
                                } else if (action.action_type === 'MODIFY_THREAD') {
                                    if (matchIdx === -1) throw new Error(`Thread "${reqId || action.details.name || '(missing)'}" not found.`);
                                    const updated = { ...threads[matchIdx] };
                                    if (action.details.name !== undefined) updated.name = action.details.name;
                                    if (action.details.description !== undefined) updated.description = action.details.description;
                                    threads[matchIdx] = updated;
                                    resultMessage = `Updated narrative thread ${updated.id}: ${updated.name}.`;
                                } else {
                                    if (matchIdx === -1) throw new Error(`Thread "${reqId || action.details.name || '(missing)'}" not found to delete.`);
                                    const removed = threads.splice(matchIdx, 1)[0];
                                    resultMessage = `Deleted narrative thread ${removed.id}: ${removed.name}.`;
                                }
                                currentStory = { ...currentStory, threads };
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'MODIFY_CHARACTER_ARC') {
                                const arcs = [...(currentStory.character_arcs || [])];
                                const lookup = String(action.details.char_id || action.details.name || action.target_character_id || '').trim();
                                const resolvedChar = lookup ? resolveCharacter(lookup, currentStory.cast || []) : null;
                                const matchNames = [lookup.toLowerCase(), resolvedChar?.name?.toLowerCase(), resolvedChar?.id?.toLowerCase()].filter(Boolean);
                                const arcIdx = arcs.findIndex(a => matchNames.includes(String(a.char_id || '').trim().toLowerCase()));
                                const baseArc = arcIdx > -1 ? { ...arcs[arcIdx] } : {
                                    char_id: resolvedChar?.name || lookup || 'Protagonist',
                                    corner_role: resolvedChar?.corner_role || '',
                                    lie_believed: '', truth_needed: '', arc_catalyst: '', description: '', web_pressure: ''
                                };
                                ['corner_role', 'lie_believed', 'truth_needed', 'arc_catalyst', 'description', 'web_pressure'].forEach(field => {
                                    if (action.details[field] !== undefined) baseArc[field] = action.details[field];
                                });
                                if (arcIdx > -1) arcs[arcIdx] = baseArc;
                                else arcs.push(baseArc);
                                currentStory = { ...currentStory, character_arcs: arcs };
                                resultMessage = `Updated character arc for ${baseArc.char_id}.`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'ADD_SECRET' || action.action_type === 'MODIFY_SECRET') {
                                const vault = [...(currentStory.secret_vault || [])];
                                const secretId = String(action.details.secret_id || action.details.id || '').trim();
                                const title = String(action.details.title || '').trim();
                                const parseNames = (val) => Array.isArray(val) ? val : (typeof val === 'string' ? val.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : []);
                                const idx = vault.findIndex(s => (secretId && s.id === secretId) || (title && String(s.title || '').toLowerCase() === title.toLowerCase()));
                                if (action.action_type === 'ADD_SECRET') {
                                    if (!title && !action.details.truth) throw new Error('ADD_SECRET requires title or truth.');
                                    const revAct = parseInt(action.details.reveal_target_act || '3', 10) || 3;
                                    const revSeq = parseInt(action.details.reveal_target_sequence || '7', 10) || 7;
                                    const publicBelief = action.details.public_cover_story || '';
                                    const knownArr = parseNames(action.details.known_by);
                                    const concealedArr = parseNames(action.details.concealed_from);
                                    const newSecret = {
                                        id: secretId || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                        title: title || 'New Secret',
                                        category: action.details.category || 'plot_mystery',
                                        truth: action.details.truth || '',
                                        cover_story: { public_belief: publicBelief, character_masks: {} },
                                        public_cover_story: publicBelief,
                                        known_by_characters: knownArr,
                                        known_by: knownArr,
                                        concealed_from_characters: concealedArr,
                                        concealed_from: concealedArr,
                                        reveal_target_act: revAct,
                                        reveal_target_sequence: revSeq,
                                        reveal_anchor: { act_number: revAct, sequence_number: revSeq },
                                        status: 'dormant',
                                        clue_schedule: []
                                    };
                                    if (idx > -1) vault[idx] = { ...vault[idx], ...newSecret };
                                    else vault.push(newSecret);
                                    resultMessage = `Added secret "${newSecret.title}".`;
                                } else {
                                    if (idx === -1) throw new Error(`Secret "${secretId || title || '(missing)'}" not found.`);
                                    const sec = { ...vault[idx] };
                                    if (title) sec.title = title;
                                    if (action.details.category !== undefined) sec.category = action.details.category;
                                    if (action.details.truth !== undefined) sec.truth = action.details.truth;
                                    if (action.details.public_cover_story !== undefined) {
                                        sec.public_cover_story = action.details.public_cover_story;
                                        sec.cover_story = {
                                            ...(sec.cover_story && typeof sec.cover_story === 'object' ? sec.cover_story : { character_masks: {} }),
                                            public_belief: action.details.public_cover_story
                                        };
                                    }
                                    if (action.details.known_by !== undefined) {
                                        const knownArr = parseNames(action.details.known_by);
                                        sec.known_by = knownArr;
                                        sec.known_by_characters = knownArr;
                                    }
                                    if (action.details.concealed_from !== undefined) {
                                        const concealedArr = parseNames(action.details.concealed_from);
                                        sec.concealed_from = concealedArr;
                                        sec.concealed_from_characters = concealedArr;
                                    }
                                    if (action.details.reveal_target_act !== undefined && action.details.reveal_target_act !== '') {
                                        const ra = parseInt(action.details.reveal_target_act, 10);
                                        if (Number.isFinite(ra)) {
                                            sec.reveal_target_act = ra;
                                            sec.reveal_anchor = { ...(sec.reveal_anchor || {}), act_number: ra };
                                        }
                                    }
                                    if (action.details.reveal_target_sequence !== undefined && action.details.reveal_target_sequence !== '') {
                                        const rs = parseInt(action.details.reveal_target_sequence, 10);
                                        if (Number.isFinite(rs)) {
                                            sec.reveal_target_sequence = rs;
                                            sec.reveal_anchor = { ...(sec.reveal_anchor || {}), sequence_number: rs };
                                        }
                                    }
                                    vault[idx] = sec;
                                    resultMessage = `Updated secret "${sec.title}".`;
                                }
                                currentStory = { ...currentStory, secret_vault: vault };
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'ADD_LORE' || action.action_type === 'MODIFY_LORE') {
                                const topic = String(action.details.topic || '').trim();
                                const detail = action.details.detail;
                                if (!topic || detail === undefined) throw new Error('Lore requires topic and detail.');
                                const lore = [...(currentStory.lore || [])];
                                const loreIdx = lore.findIndex(item => item.topic.toLowerCase() === topic.toLowerCase());
                                if (action.action_type === 'ADD_LORE') {
                                    const processed = await ingestLore({ topic, detail });
                                    if (loreIdx === -1) lore.push(processed);
                                    else lore[loreIdx] = { ...lore[loreIdx], detail: processed.detail };
                                    currentStory = { ...currentStory, lore };
                                    setStory(currentStory);
                                } else {
                                    if (loreIdx === -1) throw new Error(`Lore topic "${topic}" not found.`);
                                    lore[loreIdx] = { ...lore[loreIdx], detail };
                                    currentStory = { ...currentStory, lore };
                                    setStory(currentStory);
                                    try { await ingestLore(lore[loreIdx]); }
                                    catch (err) { console.warn('[Directive] Lore updated; vector indexing failed:', err); }
                                }
                                resultMessage = `Updated lore topic "${topic}".`;
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'ADD_CONTINUITY_FACT') {
                                const key = String(action.details.key || '').trim();
                                const value = String(action.details.value ?? '').trim();
                                const category = String(action.details.category || 'Directive').trim() || 'Directive';
                                if (!key || !value) throw new Error('Continuity fact requires key and value.');
                                const entityName = String(action.details.entity_name || '').trim();
                                const entity = entityName ? (currentStory.cast || []).find(c => c.name.toLowerCase() === entityName.toLowerCase()) : null;
                                if (entityName && !entity) throw new Error(`Unknown continuity character: ${entityName}.`);
                                if (![actIdx, seqIdx, sceneIdx].every(idx => Number.isInteger(idx) && idx >= 0)) throw new Error('Continuity target indices must be non-negative integers.');
                                const tag = `fact:${category}:${key}`.toLowerCase().replace(/\s+/g, '_');
                                const entry = {
                                    key, value, category, source_scene: 'Directive',
                                    valid_from_act: actIdx + 1, valid_from_sequence: seqIdx + 1, valid_from_scene: sceneIdx + 1,
                                    entity_id: entity?.id || '', tracking_tag: tag, created_at: Date.now(), status: 'active'
                                };
                                const ledger = [...(currentStory.continuity_ledger || [])];
                                const existingIdx = ledger.findIndex(item => item.tracking_tag === tag);
                                if (existingIdx !== -1) ledger.splice(existingIdx, 1);
                                ledger.push(entry);
                                currentStory = { ...currentStory, continuity_ledger: ledger };
                                resultMessage = `Recorded continuity fact "${key}".`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }

                            // SCALE 1: ACT LEVEL SURGICAL OPERATIONS
                            else if (action.action_type === 'MODIFY_ACT') {
                                const actsList = [...(currentStory.acts || [])];
                                if (actsList[actIdx]) {
                                    const act = { ...actsList[actIdx] };
                                    if (action.details.title) act.title = action.details.title;
                                    if (action.details.act_mandate !== undefined) {
                                        act.act_mandate = action.details.act_mandate;
                                        act.description = action.details.act_mandate;
                                    }
                                    if (action.details.core_tension !== undefined) act.core_tension = action.details.core_tension;
                                    if (action.details.thematic_reversal !== undefined) act.thematic_reversal = action.details.thematic_reversal;
                                    if (action.details.world_building_developments !== undefined) act.world_building_developments = action.details.world_building_developments;

                                    actsList[actIdx] = act;
                                    currentStory = { ...currentStory, acts: actsList };
                                    setStory(currentStory);
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: Surgically modified Act ${act.number || actIdx + 1} mandate.`, 'success');
                                } else {
                                    throw new Error(`Act at index ${actIdx} not found.`);
                                }
                            }

                            // SCALE 2: SEQUENCE LEVEL & PERSISTED FUTURE MANDATE OPERATIONS
                            else if (action.action_type === 'PERSIST_FUTURE_MANDATE') {
                                const mandateText = String(action.details.mandate_text || action.details.instructions || action.details.description || action.description || '').trim();
                                if (!mandateText) throw new Error('PERSIST_FUTURE_MANDATE requires mandate_text.');
                                const label = String(action.details.mandate_label || '').trim();
                                const scopePref = String(action.details.target_scope || 'auto').trim().toLowerCase();
                                const seqList = [...(currentStory.sequences || [])];
                                const actsList = [...(currentStory.acts || [])];

                                if ((scopePref === 'sequence' || scopePref === 'auto') && seqList[seqIdx]) {
                                    const seq = { ...seqList[seqIdx] };
                                    const updatedDesc = appendPersistedMandate(seq.description || seq.summary || '', mandateText, label);
                                    seq.description = updatedDesc;
                                    seq.summary = updatedDesc;
                                    seqList[seqIdx] = seq;
                                    currentStory = { ...currentStory, sequences: seqList };
                                    resultMessage = `Persisted future mandate onto Sequence ${seq.number || seqIdx + 1} (${seq.title || 'Sequence'}).`;
                                } else if ((scopePref === 'act' || scopePref === 'auto') && actsList[actIdx]) {
                                    const act = { ...actsList[actIdx] };
                                    const updatedMandate = appendPersistedMandate(act.act_mandate || act.description || '', mandateText, label);
                                    act.act_mandate = updatedMandate;
                                    act.description = updatedMandate;
                                    actsList[actIdx] = act;
                                    currentStory = { ...currentStory, acts: actsList };
                                    resultMessage = `Persisted future mandate onto Act ${act.number || actIdx + 1} (${act.title || 'Act'}).`;
                                } else {
                                    currentStory = {
                                        ...currentStory,
                                        author_note: appendPersistedMandate(currentStory.author_note || '', mandateText, label)
                                    };
                                    resultMessage = `Persisted future mandate onto Story Author's Note.`;
                                }
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'MODIFY_SEQUENCE') {
                                const seqList = [...(currentStory.sequences || [])];
                                if (seqList[seqIdx]) {
                                    const seq = { ...seqList[seqIdx] };
                                    if (action.details.title) seq.title = action.details.title;
                                    if (action.details.sequence_function !== undefined) seq.sequence_function = action.details.sequence_function;
                                    if (action.details.dramatic_question !== undefined) {
                                        seq.dramatic_question = action.details.dramatic_question;
                                        seq.tactical_question = action.details.dramatic_question;
                                    }
                                    if (action.details.starting_state !== undefined) seq.starting_state = action.details.starting_state;
                                    if (action.details.description !== undefined) {
                                        seq.description = action.details.description;
                                        seq.summary = action.details.description;
                                    }
                                    if (action.details.sequence_objective !== undefined) seq.sequence_objective = action.details.sequence_objective;
                                    if (action.details.four_corner_movement !== undefined) seq.four_corner_movement = action.details.four_corner_movement;
                                    if (action.details.sequence_climax !== undefined) seq.sequence_climax = action.details.sequence_climax;
                                    if (action.details.ending_hook !== undefined) seq.ending_hook = action.details.ending_hook;
                                    if (action.details.next_sequence_boundary_guard !== undefined) seq.next_sequence_boundary_guard = action.details.next_sequence_boundary_guard;
                                    if (action.details.threads_advanced !== undefined) {
                                        seq.threads_advanced = Array.isArray(action.details.threads_advanced)
                                            ? action.details.threads_advanced
                                            : String(action.details.threads_advanced).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                                    }
                                    if (action.details.characters_in_focus !== undefined) {
                                        seq.characters_in_focus = Array.isArray(action.details.characters_in_focus)
                                            ? action.details.characters_in_focus
                                            : String(action.details.characters_in_focus).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                                    }

                                    seqList[seqIdx] = seq;
                                    currentStory = { ...currentStory, sequences: seqList };
                                    setStory(currentStory);
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: Surgically modified Sequence ${seq.number || seqIdx + 1}.`, 'success');
                                } else {
                                    throw new Error(`Sequence at index ${seqIdx} not found.`);
                                }
                            }

                            else if (action.action_type === 'ADD_SEQUENCE') {
                                if (!currentStory.acts?.[actIdx]) throw new Error(`Act at index ${actIdx} not found.`);
                                const parentAct = actIdx + 1;
                                const sequences = currentStory.sequences || [];
                                const firstIdx = sequences.findIndex((seq, idx) => (seq.parent_act || actForSequence(idx + 1)) >= parentAct);
                                const nextActIdx = sequences.findIndex((seq, idx) => (seq.parent_act || actForSequence(idx + 1)) > parentAct);
                                const startIdx = firstIdx === -1 ? sequences.length : firstIdx;
                                const endIdx = nextActIdx === -1 ? sequences.length : nextActIdx;
                                const requestedIdx = action.details.insert_at_idx;
                                const insertIdx = requestedIdx !== undefined && requestedIdx !== null && requestedIdx !== '' ? Number(requestedIdx) : endIdx;
                                if (!Number.isInteger(insertIdx) || insertIdx < startIdx || insertIdx > endIdx) throw new Error('ADD_SEQUENCE insertion index must be within the target act.');
                                currentStory = reindexStoryForSequenceInsert(currentStory, insertIdx, {
                                    title: action.details.title || 'New Sequence',
                                    parent_act: parentAct,
                                    sequence_function: action.details.sequence_function || '',
                                    dramatic_question: action.details.dramatic_question || '',
                                    tactical_question: action.details.dramatic_question || '',
                                    starting_state: action.details.starting_state || '',
                                    description: action.details.description || '',
                                    summary: action.details.description || '',
                                    sequence_objective: action.details.sequence_objective || '',
                                    four_corner_movement: action.details.four_corner_movement || '',
                                    next_sequence_boundary_guard: action.details.next_sequence_boundary_guard || ''
                                });
                                rekeyResultScenes(key => key.replace(/^(\d+)-/, (_, seq) => `${Number(seq) >= insertIdx ? Number(seq) + 1 : Number(seq)}-`));
                                resultMessage = `Added Sequence ${insertIdx + 1} in Act ${parentAct}.`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }
                            else if (action.action_type === 'DELETE_SEQUENCE') {
                                currentStory = reindexStoryForSequenceDelete(currentStory, seqIdx);
                                rekeyResultScenes(key => Number(key.split('-')[0]) === seqIdx ? null : key.replace(/^(\d+)-/, (_, seq) => `${Number(seq) > seqIdx ? Number(seq) - 1 : Number(seq)}-`));
                                resultMessage = `Deleted Sequence ${seqIdx + 1}.`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }

                            // SCALE 3: DEVELOPED SCENE BLUEPRINT OPERATIONS
                            else if (action.action_type === 'MODIFY_SCENE') {
                                const seqScenes = [...(currentStory.scenes[sceneKey] || [])];
                                if (seqScenes[sceneIdx]) {
                                    const origScene = seqScenes[sceneIdx];
                                    const scene = { ...origScene };
                                    if (action.details.title !== undefined && action.details.title !== '') scene.title = action.details.title;
                                    if (action.details.objective !== undefined) {
                                        scene.objective = action.details.objective;
                                        scene.goal = action.details.objective;
                                    }
                                    if (action.details.scene_type) scene.scene_type = action.details.scene_type;

                                    const modeToUse = action.details.dominant_narrative_mode || action.details.mode_override;
                                    if (modeToUse) scene.dominant_narrative_mode = modeToUse;

                                    [
                                        'pov_character', 'setting', 'scene_events', 'atmospheric_overview',
                                        'surface_activity', 'main_character_heart', 'other_character_heart', 'the_hinge_moment',
                                        'exit_hook', 'transition_jump', 'entrance_conditions', 'exit_conditions',
                                        'micro_conflict_and_tactic', 'sensory_palette', 'scene_pacing_tempo', 'character_voice_directives',
                                        'epistemic_friction_level', 'activation_contexts'
                                    ].forEach(field => {
                                        if (action.details[field] !== undefined) scene[field] = action.details[field];
                                    });

                                    if (action.details.modality_hand !== undefined) {
                                        scene.modality_hand = canonicalizeModalityHand(action.details.modality_hand, origScene.modality_hand || []);
                                    }
                                    if (action.details.value_shift !== undefined) {
                                        scene.value_shift = parseValueShiftInput(action.details.value_shift);
                                    }
                                    if (action.details.plot_commitments !== undefined) {
                                        scene.plot_commitments = Array.isArray(action.details.plot_commitments)
                                            ? action.details.plot_commitments
                                            : (typeof action.details.plot_commitments === 'string'
                                                ? action.details.plot_commitments.split(";").map(s => s.trim()).filter(Boolean)
                                                : []);
                                    }
                                    if (action.details.cast_names !== undefined) {
                                        const resolvedCast = resolveSceneCastFields(action.details.cast_names, currentStory.cast || []);
                                        scene.cast_names = resolvedCast.cast_names;
                                        scene.characters_present = resolvedCast.characters_present;
                                        scene.cast_ids = resolvedCast.cast_ids;
                                    }
                                    if (action.details.description !== undefined && action.details.description !== '' && !action.details.scene_events && !scene.scene_events) {
                                        scene.scene_events = action.details.description;
                                    }

                                    const sequenceNum = (currentStory.sequences?.[seqIdx]?.number) || (seqIdx + 1);
                                    const normalizedScene = normalizeSceneBlueprint(scene, sceneIdx, sequenceNum, currentStory.cast || []);
                                    normalizedScene.id = origScene.id || `${sequenceNum}.${sceneIdx + 1}`;
                                    normalizedScene.number = origScene.number || `${sequenceNum}.${sceneIdx + 1}`;

                                    const blueprintDiffFields = [
                                        'title', 'pov_character', 'setting', 'dominant_narrative_mode', 'scene_type',
                                        'transition_jump', 'entrance_conditions', 'exit_conditions',
                                        'objective', 'scene_events', 'atmospheric_overview', 'modality_hand',
                                        'micro_conflict_and_tactic', 'sensory_palette', 'scene_pacing_tempo', 'character_voice_directives',
                                        'surface_activity', 'main_character_heart', 'other_character_heart', 'the_hinge_moment',
                                        'value_shift', 'exit_hook', 'cast_names', 'plot_commitments'
                                    ].filter(field => JSON.stringify(normalizedScene[field] ?? '') !== JSON.stringify(origScene[field] ?? ''));

                                    const hasExplicitProseActionLater = planActions.slice(i + 1).some(nextAct => {
                                        const nextSeq = parseInt(nextAct.target_sequence_idx ?? nextAct.target_seq_idx ?? 0, 10);
                                        const nextScene = parseInt(nextAct.target_scene_idx ?? 0, 10);
                                        return `${nextSeq}-${nextScene}` === sId && ['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE', 'REWRITE_PROSE'].includes(nextAct.action_type);
                                    });

                                    if (blueprintDiffFields.length > 0 && currentStory.prose?.[sId]?.final && !hasExplicitProseActionLater) {
                                        cascadeInstructions = `Modify Scene ${seqIdx + 1}.${sceneIdx + 1} prose to reflect these updated Scene Blueprint fields:\n${JSON.stringify(blueprintDiffFields.map(field => ({ field, before: origScene[field] ?? '', after: normalizedScene[field] })), null, 2)}`;
                                    }

                                    seqScenes[sceneIdx] = normalizedScene;
                                    currentStory = {
                                        ...currentStory,
                                        scenes: { ...currentStory.scenes, [sceneKey]: seqScenes }
                                    };
                                    setStory(currentStory);
                                    resultMessage = `Modified Scene ${seqIdx + 1}.${sceneIdx + 1} ("${normalizedScene.title}") blueprint.`;
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                                } else {
                                    throw new Error(`Scene at index ${sceneIdx} in Sequence ${seqIdx + 1} not found.`);
                                }
                            } else if (action.action_type === 'ADD_SCENE') {
                                const seqScenes = [...(currentStory.scenes[sceneKey] || [])];
                                const rawInsertIdx = action.details.insert_at_idx !== undefined && action.details.insert_at_idx !== '' ? parseInt(action.details.insert_at_idx, 10) : seqScenes.length;
                                const insertIdx = Number.isFinite(rawInsertIdx) ? Math.max(0, Math.min(seqScenes.length, rawInsertIdx)) : seqScenes.length;

                                // Shift subsequent keys in prose (and any legacy beats on older stories)
                                const nextBeats = { ...currentStory.beats };
                                const nextProse = { ...currentStory.prose };
                                const numScenes = seqScenes.length;

                                for (let idx = numScenes - 1; idx >= insertIdx; idx--) {
                                    const oldKey = `${seqIdx}-${idx}`;
                                    const newKey = `${seqIdx}-${idx + 1}`;

                                    if (nextBeats[oldKey]) {
                                        nextBeats[newKey] = nextBeats[oldKey];
                                        delete nextBeats[oldKey];
                                    }

                                    if (nextProse[oldKey]) {
                                        nextProse[newKey] = nextProse[oldKey];
                                        delete nextProse[oldKey];
                                    }
                                }

                                const sequenceNum = (currentStory.sequences?.[seqIdx]?.number) || (seqIdx + 1);
                                const newSceneNum = `${sequenceNum}.${insertIdx + 1}`;
                                const resolvedCast = resolveSceneCastFields(action.details.cast_names || "", currentStory.cast || []);
                                const parsedValueShift = parseValueShiftInput(action.details.value_shift);
                                const prevHand = insertIdx > 0 ? (seqScenes[insertIdx - 1]?.modality_hand || []) : [];
                                const allModalities = Object.values(STRUCTURAL_MODALITIES || {}).map(m => m.name);
                                const defaultHand = allModalities.filter(m => !prevHand.includes(m)).slice(0, 3);
                                const modalityHand = canonicalizeModalityHand(action.details.modality_hand, defaultHand);

                                const newSceneDraft = {
                                    id: newSceneNum,
                                    number: newSceneNum,
                                    title: action.details.title || "New Scene",
                                    pov_character: action.details.pov_character || resolvedCast.cast_names[0] || "",
                                    setting: action.details.setting || "",
                                    goal: action.details.objective || "",
                                    objective: action.details.objective || "",
                                    scene_events: action.details.scene_events || action.details.description || "",
                                    atmospheric_overview: action.details.atmospheric_overview || "",
                                    modality_hand: modalityHand,
                                    surface_activity: action.details.surface_activity || "",
                                    main_character_heart: action.details.main_character_heart || "",
                                    other_character_heart: action.details.other_character_heart || "",
                                    the_hinge_moment: action.details.the_hinge_moment || "",
                                    exit_hook: action.details.exit_hook || "",
                                    micro_conflict_and_tactic: action.details.micro_conflict_and_tactic || "",
                                    sensory_palette: action.details.sensory_palette || "",
                                    scene_pacing_tempo: action.details.scene_pacing_tempo || "",
                                    character_voice_directives: action.details.character_voice_directives || "",
                                    epistemic_friction_level: action.details.epistemic_friction_level || "MODERATE",
                                    activation_contexts: action.details.activation_contexts || "",
                                    entrance_conditions: action.details.entrance_conditions || "",
                                    exit_conditions: action.details.exit_conditions || "",
                                    scene_type: action.details.scene_type || (insertIdx % 2 === 0 ? "PROACTIVE" : "REACTIVE"),
                                    transition_jump: action.details.transition_jump || (insertIdx === 0 ? "Sequence opening" : "Seamless temporal/spatial continuation"),
                                    dominant_narrative_mode: action.details.dominant_narrative_mode || action.details.mode_override || "BASELINE_NEUTRAL",
                                    cast_ids: resolvedCast.cast_ids,
                                    cast_names: resolvedCast.cast_names,
                                    characters_present: resolvedCast.characters_present,
                                    thread_ids: ["T1"],
                                    active_thread_ids: ["T1"],
                                    value_shift: parsedValueShift,
                                    relationship_shifts: [],
                                    relationship_changes: [],
                                    state_changes_introduced: []
                                };
                                if (action.details.plot_commitments) {
                                    newSceneDraft.plot_commitments = Array.isArray(action.details.plot_commitments)
                                        ? action.details.plot_commitments
                                        : String(action.details.plot_commitments).split(";").map(s => s.trim()).filter(Boolean);
                                }
                                const newScene = normalizeSceneBlueprint(newSceneDraft, insertIdx, sequenceNum, currentStory.cast || []);

                                seqScenes.splice(insertIdx, 0, newScene);

                                // Re-index all scenes in this sequence
                                seqScenes.forEach((s, idx) => {
                                    s.id = `${sequenceNum}.${idx + 1}`;
                                    s.number = s.id;
                                });

                                currentStory = {
                                    ...currentStory,
                                    scenes: { ...currentStory.scenes, [sceneKey]: seqScenes },
                                    beats: nextBeats,
                                    prose: nextProse
                                };
                                rekeyResultScenes(key => {
                                    const [seq, scene] = key.split('-').map(Number);
                                    return seq === seqIdx && scene >= insertIdx ? `${seq}-${scene + 1}` : key;
                                });
                                resultMessage = `Added Scene ${sequenceNum}.${insertIdx + 1} ("${newScene.title}").`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            } else if (action.action_type === 'DELETE_SCENE') {
                                const seqScenes = [...(currentStory.scenes[sceneKey] || [])];

                                if (seqScenes[sceneIdx]) {
                                    const deletedSceneTitle = seqScenes[sceneIdx].title;

                                    const nextBeats = { ...currentStory.beats };
                                    const nextProse = { ...currentStory.prose };
                                    const numScenes = seqScenes.length;

                                    const delKey = `${seqIdx}-${sceneIdx}`;
                                    delete nextBeats[delKey];
                                    delete nextProse[delKey];

                                    for (let idx = sceneIdx + 1; idx < numScenes; idx++) {
                                        const oldKey = `${seqIdx}-${idx}`;
                                        const newKey = `${seqIdx}-${idx - 1}`;

                                        if (nextBeats[oldKey]) {
                                            nextBeats[newKey] = nextBeats[oldKey];
                                            delete nextBeats[oldKey];
                                        }

                                        if (nextProse[oldKey]) {
                                            nextProse[newKey] = nextProse[oldKey];
                                            delete nextProse[oldKey];
                                        }
                                    }

                                    seqScenes.splice(sceneIdx, 1);

                                    const sequenceNum = (currentStory.sequences?.[seqIdx]?.number) || (seqIdx + 1);
                                    seqScenes.forEach((s, idx) => {
                                        s.id = `${sequenceNum}.${idx + 1}`;
                                        s.number = s.id;
                                    });

                                    currentStory = {
                                        ...currentStory,
                                        scenes: { ...currentStory.scenes, [sceneKey]: seqScenes },
                                        beats: nextBeats,
                                        prose: nextProse
                                    };
                                    rekeyResultScenes(key => {
                                        const [seq, scene] = key.split('-').map(Number);
                                        return seq !== seqIdx ? key : scene === sceneIdx ? null : scene > sceneIdx ? `${seq}-${scene - 1}` : key;
                                    });
                                    setStory(currentStory);
                                    logMessage(`[Action ${actionNum}/${totalActions}] Success: Deleted Scene "${deletedSceneTitle}" at index ${sceneIdx}.`, 'success');
                                } else {
                                    throw new Error(`Scene at index ${sceneIdx} in Sequence ${seqIdx + 1} not found.`);
                                }
                            }

                            else if (action.action_type === 'MOVE_SCENE') {
                                const destinations = [action.to_sequence_idx, action.details.to_sequence_idx, action.details.target_sequence_idx, action.details.target_seq_idx];
                                if (destinations.some(idx => idx !== undefined && idx !== null && idx !== '' && Number(idx) !== seqIdx) ||
                                    !/^\d+$/.test(String(action.details.to_idx ?? ''))) {
                                    throw new Error('MOVE_SCENE only supports moves within a sequence');
                                }
                                const toIdx = Number(action.details.to_idx);
                                const seqScenes = currentStory.scenes?.[sceneKey] || [];
                                if (!seqScenes[sceneIdx] || toIdx >= seqScenes.length) throw new Error('MOVE_SCENE source and destination must be existing scenes in the sequence.');
                                const order = seqScenes.map((_, idx) => idx);
                                order.splice(toIdx, 0, order.splice(sceneIdx, 1)[0]);
                                const nextBeats = { ...currentStory.beats };
                                const nextProse = { ...currentStory.prose };
                                const sequenceNum = currentStory.sequences?.[seqIdx]?.number || seqIdx + 1;
                                const scenes = order.map((oldIdx, newIdx) => {
                                    const oldKey = `${seqIdx}-${oldIdx}`;
                                    const newKey = `${seqIdx}-${newIdx}`;
                                    delete nextBeats[newKey];
                                    delete nextProse[newKey];
                                    if (Object.prototype.hasOwnProperty.call(currentStory.beats || {}, oldKey)) nextBeats[newKey] = currentStory.beats[oldKey];
                                    if (Object.prototype.hasOwnProperty.call(currentStory.prose || {}, oldKey)) nextProse[newKey] = currentStory.prose[oldKey];
                                    return { ...seqScenes[oldIdx], id: `${sequenceNum}.${newIdx + 1}`, number: `${sequenceNum}.${newIdx + 1}` };
                                });
                                currentStory = { ...currentStory, scenes: { ...currentStory.scenes, [sceneKey]: scenes }, beats: nextBeats, prose: nextProse };
                                rekeyResultScenes(key => {
                                    const [seq, scene] = key.split('-').map(Number);
                                    return seq === seqIdx ? `${seq}-${order.indexOf(scene)}` : key;
                                });
                                resultMessage = `Moved Scene ${sceneIdx + 1} to position ${toIdx + 1} in Sequence ${seqIdx + 1}.`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            }

                            // SCALE 4: WRITTEN PROSE SURGICAL PATCHING, LINE EDITING & REWRITING
                            else if (action.action_type === 'SURGICAL_PATCH_PROSE') {
                                logMessage(`[Action ${actionNum}/${totalActions}] Applying surgical prose patch to Scene ${sceneIdx + 1}...`, 'running');
                                if (action.details.find_text && !action.details.instructions) {
                                    const proseObj = currentStory.prose[sId];
                                    const currentProse = proseObj?.final || '';
                                    if (!currentProse.trim()) throw new Error(`Scene ${sceneIdx + 1} has no written prose yet. Generate prose first or use Write Prose.`);
                                    const report = applyParsedEdits(currentProse, [{
                                        index: 0, type: 'search_replace', search: action.details.find_text, replace: action.details.replace_text || ''
                                    }]);
                                    if (!report.applied.length) throw new Error(`find_text not found in Scene ${sceneIdx + 1} prose: "${action.details.find_text.slice(0, 60)}"`);
                                    const changeRatio = computeChangeRatio(currentProse, report.text);
                                    if (changeRatio > SURGICAL_MAX_CHANGE_RATIO && action.allow_large_change !== true) {
                                        throw new Error(`Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`);
                                    }
                                    const prose = { ...proseObj, final: report.text };
                                    delete prose.stale;
                                    currentStory = { ...currentStory, prose: { ...currentStory.prose, [sId]: prose } };
                                    appliedEditsForAction = report.applied;
                                    resultMessage = report.summary || `Applied direct patch to Scene ${sceneIdx + 1} prose.`;
                                } else {
                                    const patched = await applySurgicalProsePatch({
                                        story: currentStory, seqIdx, sceneIdx,
                                        instructions: action.details.instructions || action.description || 'Apply surgical edits seamlessly.',
                                        allowLargeChange: action.allow_large_change, logName: 'Surgical Prose Editor'
                                    });
                                    currentStory = patched.story;
                                    appliedEditsForAction = patched.appliedEdits;
                                    resultMessage = patched.message;
                                }
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            } else if (action.action_type === 'LINE_EDIT_PROSE') {
                                const proseObj = currentStory.prose[sId];
                                let currentProse = proseObj?.final || "";

                                if (!currentProse.trim()) {
                                    throw new Error(`Scene ${sceneIdx + 1} has no written prose yet to line-edit.`);
                                }

                                const edits = [
                                    ...(action.details.find_text ? [{ find: action.details.find_text, replace: action.details.replace_text || "" }] : []),
                                    ...(Array.isArray(action.details.line_edits) ? action.details.line_edits : [])
                                ];
                                const misses = [];
                                let appliedEdits = 0;
                                appliedEditsForAction = [];
                                for (const [index, edit] of edits.entries()) {
                                    const report = applyParsedEdits(currentProse, [{ index, type: 'search_replace', search: edit.find, replace: edit.replace || "" }]);
                                    if (!report.applied.length) {
                                        misses.push(`find_text not found in Scene ${sceneIdx + 1} prose: "${(edit.find || '').slice(0, 60)}"`);
                                        continue;
                                    }
                                    currentProse = report.text;
                                    appliedEditsForAction.push(...report.applied);
                                    appliedEdits++;
                                }
                                if (appliedEdits === 0) {
                                    throw new Error(misses.join('; ') || `No line edits provided for Scene ${sceneIdx + 1} prose.`);
                                }
                                resultMessage = `Applied ${appliedEdits} line edit(s) to Scene ${sceneIdx + 1} prose.${misses.length ? ' Misses: ' + misses.join('; ') : ''}`;

                                currentStory = {
                                    ...currentStory,
                                    prose: {
                                        ...currentStory.prose,
                                        [sId]: { ...proseObj, final: currentProse }
                                    }
                                };
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            } else if (action.action_type === 'REWRITE_PROSE') {
                                logMessage(`[Action ${actionNum}/${totalActions}] Running Writing Agent for Scene ${sceneIdx + 1}...`, 'running');

                                const modeToUse = action.details.mode_override || action.details.dominant_narrative_mode;
                                if (modeToUse !== undefined) {
                                    const scenesList = [...(currentStory.scenes[sceneKey] || [])];
                                    if (scenesList[sceneIdx]) {
                                        scenesList[sceneIdx] = {
                                            ...scenesList[sceneIdx],
                                            dominant_narrative_mode: modeToUse === "" ? null : modeToUse
                                        };
                                        currentStory = {
                                            ...currentStory,
                                            scenes: { ...currentStory.scenes, [sceneKey]: scenesList }
                                        };
                                        setStory(currentStory);
                                    }
                                }

                                currentStory = await writeSceneProse(
                                    seqIdx,
                                    sceneIdx,
                                    currentStory,
                                    true, // Autopilot
                                    action.details.instructions,
                                    { forceFullRewrite: true }
                                );
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: Rewrote prose for Scene ${sceneIdx + 1}.`, 'success');
                            } else if (action.action_type === 'ADD_PROPOSITION') {
                                currentStory.epistemic_graph = ensureEpistemicGraph(currentStory);
                                const details = action.details || {};
                                const propId = details.id ? String(details.id).trim() : `prop_${Date.now()}`;
                                const newProp = {
                                    id: propId,
                                    claim_text: details.claim_text || action.description || "Unspecified proposition",
                                    subject_id: normalizeEntityId(details.subject_id || "world"),
                                    predicate: (details.predicate || "FACT").toUpperCase().trim(),
                                    object_id: normalizeEntityId(details.object_id || ""),
                                    objective_truth: (['TRUE', 'FALSE', 'UNRESOLVED'].includes(details.objective_truth) ? details.objective_truth : 'TRUE'),
                                    world_valid_from_scene: details.world_valid_from || "0.0",
                                    world_valid_to_scene: details.world_valid_to || null
                                };
                                currentStory.epistemic_graph.propositions = normalizeEpistemicPropositionsMap(currentStory.epistemic_graph.propositions);
                                currentStory.epistemic_graph.propositions[propId] = {
                                    ...(currentStory.epistemic_graph.propositions[propId] || {}),
                                    ...newProp
                                };
                                resultMessage = `Added proposition "${newProp.id}": "${newProp.claim_text}".`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            } else if (action.action_type === 'MODIFY_EPISTEMIC_BELIEF') {
                                currentStory.epistemic_graph = ensureEpistemicGraph(currentStory);
                                const details = action.details || {};
                                const targetProp = resolvePropositionMatch(details.proposition_id || details.claim_text || "", currentStory.epistemic_graph);
                                if (!targetProp) {
                                    throw new Error(`Proposition matching "${details.proposition_id || details.claim_text}" not found in epistemic graph.`);
                                }
                                const holderId = normalizeEntityId(details.holder_id || action.target_character_id || "meta_reader");
                                const targetCoord = details.target_scene || details.scene_coord || "1.1";
                                const stance = (details.stance || 'BELIEVES_TRUE').toUpperCase().trim();
                                const parsedConf = Number(details.confidence);
                                const conf = Number.isFinite(parsedConf) && details.confidence !== '' ? Math.max(0, Math.min(1, parsedConf)) : 0.85;
                                const srcType = details.source_type || 'INFERRED';
                                const srcAgent = details.told_by ? normalizeEntityId(details.told_by) : null;

                                // Close prior open edges for this holder and proposition
                                currentStory.epistemic_graph.first_order_edges = (currentStory.epistemic_graph.first_order_edges || []).map(e => {
                                    if (e.holder_id === holderId && e.proposition_id === targetProp.id && (!e.invalidated_at_scene || compareSceneCoordinates(e.invalidated_at_scene, targetCoord, currentStory) > 0)) {
                                        return { ...e, invalidated_at_scene: targetCoord };
                                    }
                                    return e;
                                });

                                if (stance !== 'UNAWARE') {
                                    currentStory.epistemic_graph.first_order_edges.push({
                                        holder_id: holderId,
                                        proposition_id: targetProp.id,
                                        stance,
                                        confidence: conf,
                                        source_type: srcType,
                                        source_agent_id: srcAgent,
                                        acquired_at_scene: targetCoord,
                                        invalidated_at_scene: null,
                                        emotional_charge: 0.5
                                    });
                                }

                                resultMessage = `Updated ${holderId} belief on "${targetProp.id}" to ${stance} (${Math.round(conf * 100)}%).`;
                                setStory(currentStory);
                                logMessage(`[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`, 'success');
                            } else {
                                throw new Error(`Unsupported directive action: ${action.action_type}`);
                            }

                            if (['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE', 'REWRITE_PROSE'].includes(action.action_type) && currentStory.prose?.[sId]?.stale) {
                                const prose = { ...currentStory.prose[sId] };
                                delete prose.stale;
                                currentStory = { ...currentStory, prose: { ...currentStory.prose, [sId]: prose } };
                                setStory(currentStory);
                            }
                            if (cascadeInstructions && currentStory.prose?.[sId]?.final) {
                                const cascadeLabel = `[Action ${actionNum}/${totalActions} · cascade]`;
                                if (cascadeSceneChanges) {
                                    logMessage(`${cascadeLabel} Applying scene blueprint changes to written prose...`, 'running');
                                    try {
                                        const patched = await applySurgicalProsePatch({
                                            story: currentStory, seqIdx, sceneIdx,
                                            instructions: `The scene's blueprint has changed. Apply the following change to the written prose with minimal edits.\n${cascadeInstructions}`,
                                            allowLargeChange: action.allow_large_change, logName: 'Surgical Prose Editor (Scene Cascade)'
                                        });
                                        currentStory = patched.story;
                                        cascadeResult = { status: 'applied', message: patched.message, appliedEdits: patched.appliedEdits };
                                        logMessage(`${cascadeLabel} Success: ${patched.message}`, 'success');
                                    } catch (err) {
                                        const message = err?.message || String(err);
                                        cascadeResult = { status: 'failed', message, appliedEdits: [] };
                                        logMessage(`${cascadeLabel} Failed: ${message}`, 'error');
                                    }
                                } else {
                                    cascadeResult = { status: 'skipped', message: 'Scene blueprint changes applied; prose cascade is disabled.', appliedEdits: [] };
                                    logMessage(`${cascadeLabel} Skipped: ${cascadeResult.message}`, 'pending');
                                }
                                if (cascadeResult.status !== 'applied') {
                                    currentStory = {
                                        ...currentStory, prose: {
                                            ...currentStory.prose, [sId]: {
                                                ...currentStory.prose[sId], stale: { reason: cascadeResult.status === 'failed' ? 'Scene-to-prose cascade failed.' : 'Scene blueprint changed with prose cascade disabled.', at: Date.now() }
                                            }
                                        }
                                    };
                                }
                                setStory(currentStory);
                            }
                            results[i] = {
                                status: 'applied', message: resultMessage || action.description || action.action_type,
                                ...(appliedEditsForAction ? { appliedEdits: appliedEditsForAction, proseSceneId: sId } : {}),
                                ...(cascadeResult ? { cascade: cascadeResult, proseSceneId: sId } : {})
                            };
                            if (action.action_type === 'REWRITE_PROSE') {
                                // The full writing pipeline already reviewed and archived the replacement.
                                touchedProseScenes.delete(sId);
                                lastProseActions.delete(sId);
                            } else if ((['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE'].includes(action.action_type) || cascadeResult?.status === 'applied') && currentStory.prose?.[sId]?.final !== proseBeforeAction) {
                                touchedProseScenes.add(sId);
                                lastProseActions.set(sId, i);
                            }
                        } catch (err) {
                            const message = err?.message || String(err);
                            console.error(`Directive action ${actionNum} failed:`, err);
                            results[i] = { status: 'failed', message };
                            logMessage(`[Action ${actionNum}/${totalActions}] Failed: ${message}`, 'error');
                            continue;
                        } finally {
                            setDirectiveProgress(Math.round(((i + 1) / totalActions) * 100));
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    const touchedInOrder = [...touchedProseScenes].sort((a, b) => {
                        const [aSeq, aScene] = a.split('-').map(Number), [bSeq, bScene] = b.split('-').map(Number);
                        return aSeq - bSeq || aScene - bScene;
                    });
                    if (verifyDirectiveEdits) {
                        for (const sId of touchedInOrder) {
                            const verified = await verifyAndArchiveDirectiveScene(currentStory, sId, logMessage);
                            currentStory = verified.story;
                            results[lastProseActions.get(sId)].review = verified.review;
                            setStory(currentStory);
                        }
                    }
                    const consistencyReview = directivePlan?.scope_kind === 'arc' && touchedInOrder.length >= 2
                        ? await reviewDirectiveConsistency(currentStory, touchedInOrder, directivePlan.consistency_notes, logMessage) : undefined;
                    setDirectivePlan(prev => prev ? {
                        ...prev,
                        consistencyReview,
                        actions: prev.actions.map((action, i) => results[i] ? { ...action, result: results[i] } : action)
                    } : prev);
                    const counts = results.reduce((totals, result) => {
                        totals[result.status]++;
                        return totals;
                    }, { applied: 0, failed: 0, skipped: 0 });
                    if (counts.applied > 0 && prefetchCacheRef?.current) {
                        prefetchCacheRef.current.clear();
                    }
                    const summary = `Directive complete: ${counts.applied} applied, ${counts.failed} failed, ${counts.skipped} skipped.`;
                    logMessage(summary, 'complete');
                    showToast(summary, counts.failed || counts.skipped ? 'info' : 'success');
                } finally {
                    setIsExecutingDirective(false);
                }
            };

            // ============================================================================
            // TIER 6.1: DIRECTIVE PLANNER AGENT
            // Associated Prompt: PROMPTS.directivePlanner
            // ============================================================================
            const runDirectivePlanner = async (refinementRequest = '') => {
                if (isPlanningDirective || isExecutingDirective) return;
                const isRefinement = typeof refinementRequest === 'string' && !!refinementRequest.trim() && !!directivePlan;
                const previousPlan = isRefinement ? clearDirectivePlanResults(directivePlan) : null;
                const refinementContext = isRefinement ? `\n<previous_plan>\n${serializeDirectivePlan(previousPlan)}\n</previous_plan>\n<refinement_request>\n${escapeXml(refinementRequest)}\n</refinement_request>` : '';
                if (!directiveInput.trim()) {
                    showToast("Please enter a directive instruction.", "warning");
                    return;
                }
                setIsPlanningDirective(true);
                setDirectivePlanPhase('scoping');
                if (!isRefinement) {
                    setDirectivePlan(null);
                    setDirectivePlanHistory([]);
                    setDirectiveRefinement('');
                    setDirectiveUndoSnapshot(null);
                    setDirectiveExecutionLogs([]);
                    setDirectiveProgress(0);
                }

                try {
                    let latestWrittenSequence = -1;
                    let latestWrittenScene = -1;
                    if (protectWrittenProse) {
                        (story.sequences || []).forEach((seq, seqIdx) => {
                            (story.scenes[`${seqIdx}`] || []).forEach((scene, sceneIdx) => {
                                const sId = `${seqIdx}-${sceneIdx}`;
                                if (story.prose[sId] && story.prose[sId].final) {
                                    if (seqIdx > latestWrittenSequence) {
                                        latestWrittenSequence = seqIdx;
                                        latestWrittenScene = sceneIdx;
                                    } else if (seqIdx === latestWrittenSequence && sceneIdx > latestWrittenScene) {
                                        latestWrittenScene = sceneIdx;
                                    }
                                }
                            });
                        });
                    }

                    let protectionNote = "";
                    if (protectWrittenProse && latestWrittenSequence > -1) {
                        protectionNote = `\n<protect_written_prose>\nThe story has been written up to Sequence ${latestWrittenSequence + 1}, Scene ${latestWrittenScene + 1}.\nThe user has enabled 'Protect Written Prose'. SURGICAL_PATCH_PROSE and LINE_EDIT_PROSE may edit written scenes. Structural changes (including REWRITE_PROSE) at or before this written boundary are forbidden unless the directive clearly requires them. Emit any such required actions and explain in <evaluation> that the user must override protection for those actions.\n</protect_written_prose>\n`;
                    }

                    const seqs = story.sequences || [];
                    const developedSeqIndices = [];
                    const undevelopedSeqIndices = [];
                    seqs.forEach((_, seqIdx) => {
                        if ((story.scenes?.[`${seqIdx}`] || []).length > 0) developedSeqIndices.push(seqIdx);
                        else undevelopedSeqIndices.push(seqIdx);
                    });

                    const structureOverview = {
                        title: story.title,
                        concept: story.concept,
                        heart_of_the_dilemma: story.heart_of_the_dilemma || "",
                        status_quo: story.status_quo,
                        inciting_incident: story.inciting_incident,
                        themes: story.themes,
                        core_thematic_argument: story.core_thematic_argument || "",
                        starting_value_state: story.starting_value_state || "",
                        ending_value_state: story.ending_value_state || "",
                        major_surprises_and_twists: story.major_surprises_and_twists || "",
                        author_note: story.author_note || "",
                        style: {
                            ...(story.style || {}),
                            synthesized_authorial_persona: story.synthesized_authorial_persona || story.style?.synthesized_authorial_persona || "",
                            genre_pacing_and_dialogue_rules: story.genre_pacing_and_dialogue_rules || story.style?.genre_pacing_and_dialogue_rules || "",
                            strict_anti_patterns: story.strict_anti_patterns || story.style?.strict_anti_patterns || ""
                        },
                        development_status: {
                            acts_count: (story.acts || []).length,
                            sequences_count: seqs.length,
                            developed_sequence_indices: developedSeqIndices,
                            undeveloped_sequence_indices: undevelopedSeqIndices,
                            written_scenes_count: Object.values(story.prose || {}).filter(p => p && p.final).length
                        },
                        threads: (story.threads || []).map(t => ({ id: t.id, name: t.name, description: t.description })),
                        character_arcs: (story.character_arcs || []).map(a => ({
                            char_id: a.char_id, corner_role: a.corner_role || "",
                            lie_believed: a.lie_believed || "", truth_needed: a.truth_needed || "",
                            arc_catalyst: a.arc_catalyst || "", description: a.description || "",
                            web_pressure: a.web_pressure || ""
                        })),
                        secret_vault: (story.secret_vault || []).map(s => ({
                            id: s.id, title: s.title, category: s.category,
                            truth: s.truth,
                            public_cover_story: typeof s.cover_story === 'string' ? s.cover_story : (s.cover_story?.public_belief || s.public_cover_story || ''),
                            known_by: s.known_by_characters || s.known_by || [],
                            concealed_from: s.concealed_from_characters || s.concealed_from || [],
                            reveal_target_act: s.reveal_anchor?.act_number || s.reveal_target_act || 3,
                            reveal_target_sequence: s.reveal_anchor?.sequence_number || s.reveal_target_sequence || 7
                        })),
                        cast: (story.cast || []).map(c => ({
                            id: c.id, name: c.name, role: c.role, corner_role: c.corner_role || "",
                            core_flaw: c.core_flaw, core_desire: c.core_desire, vocal_cadence: c.vocal_cadence
                        })),
                        relationships: story.relationships || {},
                        lore: (story.lore || []).map(l => ({ topic: l.topic, detail: String(l.detail || "").slice(0, 200) })),
                        continuity_ledger: story.continuity_ledger || [],
                        cascade_scene_changes: cascadeSceneChanges,
                        acts: (story.acts || []).map((act, actIdx) => {
                            const actNum = parseActNumber(act.number, actIdx + 1);
                            const hasSequences = seqs.some((sq, sIdx) => parseActNumber(sq.parent_act, actForSequence(sIdx + 1)) === actNum);
                            return {
                                index: actIdx,
                                number: act.number,
                                title: act.title,
                                mandate: act.act_mandate || act.description || "",
                                core_tension: act.core_tension || "",
                                thematic_reversal: act.thematic_reversal || "",
                                world_building_developments: act.world_building_developments || "",
                                knots: act.knots || [],
                                has_sequences: hasSequences
                            };
                        }),
                        sequences: seqs.map((seq, seqIdx) => {
                            const seqScenes = story.scenes?.[`${seqIdx}`] || [];
                            return {
                                index: seqIdx,
                                number: seq.number,
                                parent_act: seq.parent_act,
                                title: seq.title,
                                sequence_function: seq.sequence_function || "",
                                dramatic_question: seq.dramatic_question || "",
                                starting_state: seq.starting_state || "",
                                sequence_objective: seq.sequence_objective || "",
                                description: seq.description || "",
                                four_corner_movement: seq.four_corner_movement || "",
                                threads_advanced: seq.threads_advanced || [],
                                characters_in_focus: seq.characters_in_focus || [],
                                sequence_climax: seq.sequence_climax || "",
                                ending_hook: seq.ending_hook || "",
                                next_sequence_boundary_guard: seq.next_sequence_boundary_guard || "",
                                is_developed: seqScenes.length > 0,
                                scenes_count: seqScenes.length
                            };
                        }),
                        scenes: seqs.flatMap((seq, seqIdx) => {
                            return (story.scenes?.[`${seqIdx}`] || []).map((scene, sceneIdx) => {
                                const sId = `${seqIdx}-${sceneIdx}`;
                                const proseFinal = story.prose?.[sId]?.final || "";
                                return {
                                    sequence_idx: seqIdx,
                                    scene_idx: sceneIdx,
                                    number: scene.number || `${seqIdx + 1}.${sceneIdx + 1}`,
                                    title: scene.title,
                                    pov_character: scene.pov_character || "",
                                    setting: scene.setting || "",
                                    scene_type: scene.scene_type || "PROACTIVE",
                                    dominant_narrative_mode: scene.dominant_narrative_mode || "BASELINE_NEUTRAL",
                                    objective: scene.objective || scene.goal || "",
                                    scene_events: String(scene.scene_events || "").slice(0, 320),
                                    surface_activity: scene.surface_activity || "",
                                    the_hinge_moment: scene.the_hinge_moment || "",
                                    value_shift: scene.value_shift || "",
                                    exit_hook: scene.exit_hook || "",
                                    cast_names: scene.cast_names || scene.characters_present || [],
                                    has_written_prose: Boolean(proseFinal),
                                    prose_word_count: proseFinal ? countWords(proseFinal) : 0
                                };
                            });
                        })
                    };

                    let targetSceneDetails = '';
                    let scopeKind = previousPlan?.scope_kind || 'local';
                    let consistencyNotes = previousPlan?.consistency_notes || '';
                    try {
                        const scopePrompt = `<user_directive>
${directiveInput}
</user_directive>

<current_story_structure>
${JSON.stringify(structureOverview, null, 2)}
</current_story_structure>${refinementContext}`;
                        const scopeResponse = await callAI(scopePrompt, PROMPTS.directiveScoper, false, "Directive Scoper", "dev");
                        if (!extractTag(scopeResponse, 'response') && !/<target_scenes>/i.test(scopeResponse || '')) {
                            throw new Error('Scoper response missing expected XML.');
                        }
                        scopeKind = extractTag(scopeResponse, 'scope_kind').toLowerCase() === 'arc' ? 'arc' : 'local';
                        consistencyNotes = scopeKind === 'arc' ? decodeXmlEntities(extractTag(scopeResponse, 'consistency_notes') || '') : '';
                        const seenTargets = new Set();
                        const targetScenes = extractTagList(extractTag(scopeResponse, 'target_scenes'), 'scene').map(block => {
                            const sequenceText = extractTag(block, 'sequence_idx');
                            const sceneText = extractTag(block, 'scene_idx');
                            if (!/^\d+$/.test(sequenceText) || !/^\d+$/.test(sceneText)) return null;
                            const sequenceIdx = Number(sequenceText);
                            const sceneIdx = Number(sceneText);
                            if (!Number.isSafeInteger(sequenceIdx) || !Number.isSafeInteger(sceneIdx) ||
                                !story.sequences?.[sequenceIdx] || !story.scenes?.[`${sequenceIdx}`]?.[sceneIdx]) return null;
                            return { sequence_idx: sequenceIdx, scene_idx: sceneIdx, reason: extractTag(block, 'reason') };
                        }).filter(target => {
                            if (!target) return false;
                            const key = `${target.sequence_idx}-${target.scene_idx}`;
                            if (seenTargets.has(key)) return false;
                            seenTargets.add(key);
                            return true;
                        }).slice(0, scopeKind === 'arc' ? 12 : 6);
                        const needsProse = extractTag(scopeResponse, 'needs_prose').toLowerCase() === 'true';
                        if (targetScenes.length > 0) {
                            const details = targetScenes.map(target => {
                                const sId = `${target.sequence_idx}-${target.scene_idx}`;
                                return {
                                    ...target,
                                    scene: story.scenes[`${target.sequence_idx}`][target.scene_idx],
                                    ...(needsProse && story.prose?.[sId]?.final ? { prose: { final: story.prose[sId].final } } : {})
                                };
                            });
                            targetSceneDetails = `\n\n<target_scene_details>\n${JSON.stringify(details, null, 2)}\n</target_scene_details>`;
                        }
                    } catch (scopeError) {
                        console.warn('Directive scoping failed; planning with the structure overview only:', scopeError);
                    }

                    const availableModesXml = `<available_narrative_modes>\n${Object.values(allNarrativeModes || {}).map(m => `  <mode id="${m.id}" name="${escapeXml(m.name || m.title || m.id)}">${escapeXml(m.context || '')}</mode>`).join('\n')}\n</available_narrative_modes>`;
                    const availableModalitiesXml = `<available_modalities>\n${Object.values(STRUCTURAL_MODALITIES || {}).map(m => `- ${m.name} (${m.category}): ${m.summary}`).join('\n')}\n</available_modalities>`;

                    setDirectivePlanPhase('planning');
                    const prompt = `${protectionNote}
<user_directive>
${directiveInput}
</user_directive>

<current_story_structure>
${JSON.stringify(structureOverview, null, 2)}
</current_story_structure>

${availableModesXml}

${availableModalitiesXml}${targetSceneDetails}${refinementContext}
<scope_kind>${scopeKind}</scope_kind>
${scopeKind === 'arc' ? `<consistency_notes>\n${escapeXml(consistencyNotes)}\n</consistency_notes>` : ''}

<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <evaluation>A detailed developmental explanation of the surgical strategy across developed and/or undeveloped regions to address the user_directive.</evaluation>
  <scope_kind>${scopeKind}</scope_kind>
  <consistency_notes>For arc scope, return refined invariants across the scenes.</consistency_notes>
  <actions>
    <action>
      <action_type>MODIFY_SCENE</action_type>
      <target_act_idx>0</target_act_idx>
      <target_sequence_idx>0</target_sequence_idx>
      <target_scene_idx>0</target_scene_idx>
      <target_character_id>Optional (only used for character actions)</target_character_id>
      <description>Brief summary of what this action does.</description>
      <details>
        <!-- Use the appropriate XML tags inside <details> for the chosen action_type: -->
        <!-- PERSIST_FUTURE_MANDATE (for undeveloped/future regions): <target_scope>auto</target_scope> (auto|sequence|act|story_author_note) <mandate_label>Optional short label</mandate_label><mandate_text>Clear persisted mandate appended to the closest generated container (sequence.description, act.act_mandate, or story.author_note).</mandate_text> -->
        <!-- MODIFY_STORY_METADATA: <title/><concept/><heart_of_the_dilemma/><status_quo/><inciting_incident/><themes/><core_thematic_argument/><starting_value_state/><ending_value_state/><major_surprises_and_twists/><author_note/><genre/><mood/><writing_guide/><synthesized_authorial_persona/><genre_pacing_and_dialogue_rules/><strict_anti_patterns/> -->
        <!-- ADD_CHARACTER / MODIFY_CHARACTER: <name/><role/><corner_role/><core_flaw/><core_desire/><vocal_cadence/><deep_profile/><aliases/> (plus optional Truby fields: why_it_makes_sense, what_it_costs_them, way_of_living, why_it_is_appealing, shared_outlook, the_hidden_trap, how_they_ended_up, human_sympathy, the_wake_up_call) -->
        <!-- MODIFY_RELATIONSHIP: <relationship_key>A-&gt;B</relationship_key> or <from_name>A</from_name><to_name>B</to_name>; <current/><hidden_tension/><trust_level>1-10</trust_level> -->
        <!-- ADD_THREAD / MODIFY_THREAD / DELETE_THREAD: <thread_id>T4</thread_id><name/><description/> -->
        <!-- MODIFY_CHARACTER_ARC: <char_id>Character Name</char_id><corner_role/><lie_believed/><truth_needed/><arc_catalyst/><description/><web_pressure/> -->
        <!-- ADD_SECRET / MODIFY_SECRET: <secret_id/><title/><category/><truth/><public_cover_story/><known_by/><concealed_from/><reveal_target_act/><reveal_target_sequence/> -->
        <!-- ADD_LORE / MODIFY_LORE: <topic/><detail/> | ADD_CONTINUITY_FACT: <key/><value/><category/><entity_name/> -->
        <!-- ADD_PROPOSITION: <id/><claim_text/><objective_truth/><subject_id/><predicate/><object_id/><world_valid_from/> | MODIFY_EPISTEMIC_BELIEF: <holder_id/><proposition_id/><stance/><confidence>0.0-1.0</confidence><target_scene>1.1</target_scene> -->
        <!-- MODIFY_ACT: <title/><act_mandate/><core_tension/><thematic_reversal/><world_building_developments/> -->
        <!-- MODIFY_SEQUENCE: <title/><sequence_function/><dramatic_question/><starting_state/><description/><sequence_objective/><four_corner_movement/><threads_advanced/><characters_in_focus/><sequence_climax/><ending_hook/><next_sequence_boundary_guard/> -->
        <!-- ADD_SEQUENCE: <title/><sequence_function/><dramatic_question/><starting_state/><description/><sequence_objective/><four_corner_movement/><next_sequence_boundary_guard/><insert_at_idx>2</insert_at_idx> | DELETE_SEQUENCE: no details needed -->
        <!-- MODIFY_SCENE / ADD_SCENE (for developed sequences; include full Scene Blueprint fields): <insert_at_idx/><title/><pov_character/><setting/><dominant_narrative_mode/><scene_type>PROACTIVE</scene_type><objective/><scene_events/><atmospheric_overview/><modality_hand/><surface_activity/><main_character_heart/><other_character_heart/><the_hinge_moment/><value_shift>Start -&gt; End</value_shift><exit_hook/><transition_jump/><entrance_conditions/><exit_conditions/><epistemic_friction_level/><activation_contexts/><cast_names>A, B</cast_names><plot_commitments/><description/> -->
        <!-- MOVE_SCENE: <to_idx>1</to_idx> within the target sequence only. | DELETE_SCENE: no details needed -->
        <!-- SURGICAL_PATCH_PROSE: <instructions>...</instructions> (or exact <find_text>/<replace_text> copied verbatim from target_scene_details) -->
        <!-- LINE_EDIT_PROSE: <find_text/><replace_text/> or <line_edits><edit><find/><replace/></edit></line_edits> copied verbatim from target_scene_details -->
        <!-- REWRITE_PROSE: <instructions>...</instructions><mode_override>Optional style ID</mode_override> -->
      </details>
    </action>
    <!-- Add more <action> blocks as needed -->
  </actions>
</response>
</output_format_description>

BEGIN DEVELOPING SURGICAL DIRECTIVES
`;

                    const response = await callAI(prompt, PROMPTS.directivePlanner, false, "Directive Planner", "dev");
                    const parsed = parseDirectivePlan(response);
                    parsed.scope_kind = scopeKind;
                    if (scopeKind === 'arc' && !parsed.consistency_notes) parsed.consistency_notes = consistencyNotes;

                    if (!parsed.evaluation && parsed.actions.length === 0) {
                        throw new Error("Failed to parse plan. Response did not contain expected XML format.");
                    }

                    if (isRefinement) {
                        setDirectivePlanHistory(prev => [...prev, previousPlan].slice(-5));
                        setDirectiveUndoSnapshot(null);
                        setDirectiveExecutionLogs([]);
                        setDirectiveProgress(0);
                        setDirectiveRefinement('');
                    }
                    setDirectivePlan(parsed);
                    setExpandedDirectiveActions(parsed.actions.length === 1 ? { 0: true } : {});
                    showToast(isRefinement ? "Directive plan refined successfully!" : "Directive plan generated successfully!", "success");
                } catch (err) {
                    console.error("Directive planning failed:", err);
                    alert("Planning failed: " + err.message);
                } finally {
                    setDirectivePlanPhase(null);
                    setIsPlanningDirective(false);
                }
            };

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
            const runAutonomousEditorialHarness = async ({
                mode = 'full_pipeline',
                scopeSceneId = editorialScopeSceneId || 'ALL',
                useLLM = editorialUseDeepLLM,
                storyOverride = null,
                isAutopilot = false
            } = {}) => {
                const baseStory = storyOverride || storyRef.current || story;
                const allDrafted = getDraftedStoryScenesList(baseStory);
                if (allDrafted.length === 0) {
                    showToast("No drafted prose scenes found. Write at least one scene before running the Autonomous Editorial Harness.", "warning");
                    return null;
                }

                setIsRunningEditorialHarness(true);
                setLoading(true);
                setCurrentPipelineStep(21);
                setEditorialHarnessProgress(5);

                const runLogs = [...(baseStory.editorial_harness?.logs || [])];
                const appendHarnessLog = (phase, message, status = 'info') => {
                    const entry = {
                        id: `hlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: new Date().toLocaleTimeString(),
                        phase,
                        message,
                        status
                    };
                    runLogs.push(entry);
                    console.log(`[EditorialHarness][${phase}] ${message}`);
                };

                try {
                    let workingStory = JSON.parse(JSON.stringify(baseStory));
                    const existingHarness = workingStory.editorial_harness || {};
                    const callAIIfEnabled = useLLM ? callAI : null;
                    const customOverrides = normalizeIntentionalOverrides(
                        existingHarness.customConstitutionOverrides || 
                        existingHarness.constitution?.intentionalOverrides || 
                        existingHarness.novelignore
                    );

                    let constitution = existingHarness.constitution ? {
                        ...existingHarness.constitution,
                        intentionalOverrides: normalizeIntentionalOverrides(existingHarness.constitution.intentionalOverrides)
                    } : null;
                    let fullTelemetry = existingHarness.fullTelemetry;
                    let voiceDna = existingHarness.voiceDna;
                    let nsg = existingHarness.nsg;
                    let layer0Map = existingHarness.layer0Map || {};
                    let dossiers = existingHarness.dossiers || [];
                    let tribunalResult = existingHarness.tribunalResult || null;
                    let editPlan = existingHarness.editPlan || null;

                    if (mode !== 'execute_plan' || !editPlan) {
                        // ── PHASE 1: CANONICAL XML NORMALIZATION, CONSTITUTION, VOICE DNA & NSG ──
                        setEditorialHarnessPhase("Phase 1: Compiling Aesthetic Constitution, Voice DNA & Narrative State Graph...");
                        setActivePipelineWork({
                            mode: 'novel',
                            phase: 5,
                            elementType: 'editorial',
                            title: 'Autonomous Editorial Harness',
                            itemIndex: 1,
                            itemTotal: 5,
                            subStep: 'Phase 1: Voice DNA & Narrative State Graph',
                            startedAt: Date.now()
                        });
                        setLoadingStep("Editorial Harness Phase 1: Voice DNA & NSG...");
                        setEditorialHarnessProgress(15);
                        appendHarnessLog("Phase 1", `Normalizing ${allDrafted.length} drafted scene(s) into canonical XML with <p> and <s> coordinates...`, "running");

                        constitution = compileAestheticConstitution(workingStory, customOverrides);
                        fullTelemetry = runFullManuscriptNlpTelemetry(workingStory, bannedPhrases, slopConfig);
                        voiceDna = await extractAuthorVoiceDNA(workingStory, fullTelemetry, callAIIfEnabled, bannedPhrases, slopConfig);
                        nsg = compileNarrativeStateGraph(workingStory, fullTelemetry);

                        appendHarnessLog(
                            "Phase 1",
                            `Compiled <AuthorVoiceDNA> (Sentence Mean: ${voiceDna.syntacticCadence?.meanWords}w, CV: ${voiceDna.syntacticCadence?.coeffOfVariation}, Psychic Distance: ${voiceDna.perceptualProfile?.baselinePsychicDistance}) and <NarrativeStateGraph> (${nsg.sceneContracts?.length || 0} scene contracts, ${nsg.threadsLedger?.length || 0} plot threads).`,
                            "success"
                        );

                        // ── PHASE 2A & 2B: LAYER 0 BLIND READER SANDBOX & 5-AXIS DIVERGENCE ──
                        setEditorialHarnessPhase("Phase 2A–2B: Running Deterministic NLP Telemetry & Layer 0 Blind Reader Simulation...");
                        setLoadingStep("Editorial Harness Phase 2B: Layer 0 Blind Reader...");
                        setEditorialHarnessProgress(35);

                        const targetScenes = (scopeSceneId && scopeSceneId !== 'ALL')
                            ? allDrafted.filter(s => s.sceneId === scopeSceneId || s.proseKey === scopeSceneId || s.displayCoord === scopeSceneId)
                            : allDrafted;

                        layer0Map = { ...(existingHarness.layer0Map || {}) };
                        for (let i = 0; i < targetScenes.length; i++) {
                            const sc = targetScenes[i];
                            setActivePipelineWork(prev => ({
                                ...(prev || { mode: 'novel', phase: 5, elementType: 'editorial', startedAt: Date.now() }),
                                title: sc.title || sc.displayCoord || 'Editorial Review',
                                sceneLabel: sc.displayCoord,
                                itemIndex: i + 1,
                                itemTotal: targetScenes.length,
                                subStep: 'Phase 2B: Layer 0 Blind Reader'
                            }));
                            const scTelemetry = fullTelemetry.sceneTelemetryMap[sc.sceneId];
                            const scContract = (nsg.sceneContracts || []).find(c => c.id === sc.sceneId) || {
                                id: sc.sceneId,
                                displayCoord: sc.displayCoord,
                                pov: sc.normalized.pov,
                                title: sc.title,
                                dramaticMode: "SCENE_PROACTIVE",
                                objective: sc.sceneMeta?.objective || "Advance sequence dramatic question",
                                valueShift: { startValence: "Baseline", endValence: "Transformed", turningPointAnchor: `${sc.sceneId}:p1` },
                                scheduledClues: [],
                                endWordOffset: sc.endWordOffset
                            };
                            const l0 = await evaluateSceneLayer0AndDivergence(scContract, sc, nsg, scTelemetry, callAIIfEnabled, useLLM);
                            layer0Map[sc.sceneId] = l0;
                        }

                        const meanDivergence = Object.values(layer0Map).length > 0
                            ? Number((Object.values(layer0Map).reduce((s, r) => s + (r.dTotal ?? r.divergence?.d_total ?? 0), 0) / Object.values(layer0Map).length).toFixed(3))
                            : 0;
                        appendHarnessLog(
                            "Phase 2B",
                            `Completed Layer 0 Blind Reader Sandbox across ${targetScenes.length} scene(s). Mean 5-Axis Intent-vs-Execution Divergence D_total = ${meanDivergence}.`,
                            "success"
                        );

                        // ── PHASE 2C: 11-TOOL AUTONOMOUS INVESTIGATION ──
                        setEditorialHarnessPhase("Phase 2C: Running 11-Tool Autonomous Investigation...");
                        setActivePipelineWork(prev => prev ? { ...prev, title: 'Autonomous Editorial Harness', subStep: 'Phase 2C: 11-Tool Autonomous Investigation' } : prev);
                        setLoadingStep("Editorial Harness Phase 2C: 11-Tool Investigation...");
                        setEditorialHarnessProgress(50);

                        const invRes = await runAutonomousInvestigationStage(
                            workingStory,
                            nsg,
                            fullTelemetry,
                            layer0Map,
                            callAIIfEnabled,
                            useLLM
                        );
                        const allDossiers = invRes?.dossiers || [];
                        dossiers = (scopeSceneId && scopeSceneId !== 'ALL')
                            ? allDossiers.filter(d => d.sceneId === scopeSceneId || d.displayCoord === scopeSceneId)
                            : allDossiers;

                        appendHarnessLog(
                            "Phase 2C",
                            `Compiled ${dossiers.length} <InvestigationDossier> evidence packet(s) using the 11 read-only XML inspection tools.`,
                            "success"
                        );

                        // ── PHASE 2D: ADVERSARIAL EDITORIAL TRIBUNAL ──
                        setEditorialHarnessPhase("Phase 2D: Convening Adversarial Editorial Tribunal (Prosecutor vs. Defense -> Judge)...");
                        setActivePipelineWork(prev => prev ? { ...prev, subStep: 'Phase 2D: Adversarial Editorial Tribunal' } : prev);
                        setLoadingStep("Editorial Harness Phase 2D: Adversarial Tribunal...");
                        setEditorialHarnessProgress(65);

                        tribunalResult = await conveneAdversarialTribunal(
                            dossiers,
                            constitution,
                            voiceDna,
                            nsg,
                            callAIIfEnabled,
                            useLLM
                        );
                        const dismissedCount = Math.max(0, (tribunalResult.tribunalCases?.length || 0) - (tribunalResult.verifiedTickets?.length || 0));
                        tribunalResult.dismissedCount = dismissedCount;
                        appendHarnessLog(
                            "Phase 2D",
                            `Tribunal adjudicated ${tribunalResult.tribunalCases?.length || 0} dossier(s): ${tribunalResult.verifiedTickets?.length || 0} verified ticket(s) queued (Priority >= 35), ${dismissedCount} dismissed/vetoed.`,
                            "success"
                        );

                        // ── PHASE 3: ROOT-CAUSE SYNTHESIS & 3-WAVE EDIT PLAN COMPILER ──
                        setEditorialHarnessPhase("Phase 3: Compiling Dependency-Ordered 3-Wave Edit Plan...");
                        setActivePipelineWork(prev => prev ? { ...prev, subStep: 'Phase 3: 3-Wave Edit Plan Compiler' } : prev);
                        setLoadingStep("Editorial Harness Phase 3: 3-Wave Edit Plan Compiler...");
                        setEditorialHarnessProgress(75);

                        editPlan = compileThreeWaveEditPlan(tribunalResult.verifiedTickets || [], nsg, fullTelemetry);
                        appendHarnessLog(
                            "Phase 3",
                            `Compiled <CompiledEditPlan> (${editPlan.allTransactions?.length || 0} atomic transaction(s): Wave 1 Macro=${editPlan.waves[0]?.transactions?.length || 0}, Wave 2 Meso=${editPlan.waves[1]?.transactions?.length || 0}, Wave 3 Micro=${editPlan.waves[2]?.transactions?.length || 0}).`,
                            "success"
                        );
                    }

                    // Snapshot prose before any Wave execution so user can revert all or individual transactions
                    const preRunProseSnapshot = existingHarness.preRunProseSnapshot || JSON.parse(JSON.stringify(workingStory.prose || {}));
                    let committedCount = 0;
                    let rejectedCount = 0;

                    if ((mode === 'full_pipeline' || mode === 'execute_plan') && editPlan && Array.isArray(editPlan.waves)) {
                        setEditorialHarnessPhase("Phase 4 & 5: Executing 3-Wave Surgical Patches & 4-Gate Literary CI/CD Suite...");
                        setLoadingStep("Editorial Harness Phases 4–5: 3-Wave Patches & 4-Gate CI/CD...");
                        setEditorialHarnessProgress(85);

                        for (const wave of editPlan.waves) {
                            for (let tIdx = 0; tIdx < (wave.transactions || []).length; tIdx++) {
                                const tx = wave.transactions[tIdx];
                                if (tx.status === 'COMMITTED') continue;
                                if (scopeSceneId && scopeSceneId !== 'ALL' && tx.sceneId !== scopeSceneId && tx.displayCoord !== scopeSceneId) {
                                    continue;
                                }

                                const currentSceneList = getDraftedStoryScenesList(workingStory);
                                const sceneItem = currentSceneList.find(s => s.sceneId === tx.sceneId || s.proseKey === tx.sceneId || s.displayCoord === tx.displayCoord);
                                if (!sceneItem) continue;

                                setActivePipelineWork(prev => ({
                                    ...(prev || { mode: 'novel', phase: 5, elementType: 'editorial', startedAt: Date.now() }),
                                    sceneLabel: sceneItem.displayCoord,
                                    title: sceneItem.title || sceneItem.displayCoord,
                                    subStep: 'Phases 4–5: Surgical Patch & 4-Gate CI/CD'
                                }));

                                const beforeProse = sceneItem.proseText;
                                const preTelemetry = runSceneNlpTelemetry(sceneItem, workingStory, bannedPhrases, slopConfig);

                                let attempt = 1;
                                const maxAttempts = 3;
                                let lastGateSuite = null;
                                let lastPatchRes = null;
                                const attemptHistory = [];

                                while (attempt <= maxAttempts) {
                                    let rawPatchOutput = null;
                                    if (useLLM && typeof callAIIfEnabled === "function") {
                                        try {
                                            const isWave1 = wave.waveId === 1 || wave.waveId === "WAVE_1_MACRO" || wave.waveKey === "WAVE_1_MACRO" || tx.wave === "WAVE_1_MACRO" || tx.wave === 1;
                                            const isWave2 = wave.waveId === 2 || wave.waveId === "WAVE_2_MESO" || wave.waveKey === "WAVE_2_MESO" || tx.wave === "WAVE_2_MESO" || tx.wave === 2;
                                            const agentPromptKey = isWave1
                                                ? "macroStructuralArchitectAgent"
                                                : isWave2
                                                    ? "mesoSceneSurgeonAgent"
                                                    : "microLineStylistAgent";
                                            const sysPrompt = PROMPTS[agentPromptKey] || PROMPTS.microLineStylistAgent;

                                            // Extract surrounding context from sceneItem for seam-continuous editing
                                            const startParaId = String(tx.startAnchor || "").split(":s")[0];
                                            const pList = sceneItem.normalized?.paragraphs || [];
                                            const pIdx = pList.findIndex(p => p.id === startParaId);
                                            const prevParaText = pIdx > 0 ? (pList[pIdx - 1]?.text || "") : "";
                                            const nextParaText = (pIdx >= 0 && pIdx < pList.length - 1) ? (pList[pIdx + 1]?.text || "") : "";

                                            // Compile structured feedback from prior failed rounds for rounds 2 and 3
                                            let feedbackXml = "";
                                            if (attemptHistory.length > 0) {
                                                feedbackXml = `<FeedbackFromPriorRounds current_round="${attempt}" max_rounds="${maxAttempts}">\n` +
                                                    attemptHistory.map(h => `  <PriorAttempt round="${h.attempt}">\n    <RejectedSpan><![CDATA[${h.proposedSpan}]]></RejectedSpan>\n    <FailureDiagnostic>${escapeHarnessXml(h.feedback?.diagnostic || "")}</FailureDiagnostic>\n    <RequiredCorrectionDirective>${escapeHarnessXml(h.feedback?.correction || "")}</RequiredCorrectionDirective>\n  </PriorAttempt>`).join("\n") +
                                                    `\n  <Round${attempt}Directive>Do NOT repeat or closely paraphrase any rejected replacement above. You MUST take a fundamentally fresh craft approach that satisfies the RequiredCorrectionDirective while strictly preserving <AuthorVoiceDNA>.</Round${attempt}Directive>\n</FeedbackFromPriorRounds>`;
                                            }

                                            const userPrompt = `${voiceDna?.xml || ""}\n${constitution?.xml || ""}\n<TargetScene id="${tx.sceneId}">
  <PrecedingContext><![CDATA[${prevParaText}]]></PrecedingContext>
  <AtomicEditTransaction id="${tx.transactionId}" wave="${tx.wave}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <Problem>${escapeHarnessXml(tx.combinedProblem)}</Problem>
    <SurgicalDirective>${escapeHarnessXml(tx.combinedDirective)}</SurgicalDirective>
    <OriginalSpanVerifier><![CDATA[${tx.verbatimOriginal}]]></OriginalSpanVerifier>
  </AtomicEditTransaction>
  <FollowingContext><![CDATA[${nextParaText}]]></FollowingContext>
</TargetScene>
${feedbackXml ? `${feedbackXml}\n` : ""}Emit a <ManuscriptPatchTransaction transaction_id="${tx.transactionId}" target_scene="${tx.sceneId}">
  <PatchOperation type="REPLACE_SPAN" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <OriginalSpanVerifier><![CDATA[${tx.verbatimOriginal}]]></OriginalSpanVerifier>
    <ReplacementSpan>
      <!-- Fresh revised prose resolving the ticket and satisfying Round ${attempt} feedback -->
    </ReplacementSpan>
  </PatchOperation>
</ManuscriptPatchTransaction>`;
                                            rawPatchOutput = await callAIIfEnabled(userPrompt, sysPrompt, false, `Editorial Harness ${wave.name || wave.waveId} (${tx.transactionId} - R${attempt}/${maxAttempts})`, "Polish");
                                        } catch (llmErr) {
                                            console.warn(`[EditorialHarness] Specialist LLM fallback to deterministic surgical repair for ${tx.transactionId} round ${attempt}:`, llmErr);
                                        }
                                    }

                                    const patchRes = applyManuscriptPatchToScene(
                                        sceneItem,
                                        tx,
                                        rawPatchOutput,
                                        workingStory,
                                        attempt,
                                        attemptHistory[attemptHistory.length - 1]?.feedback
                                    );
                                    lastPatchRes = patchRes;

                                    const gateSuite = await runFourGateVerificationSuite({
                                        sceneItem,
                                        patchedResult: patchRes,
                                        transaction: tx,
                                        baselineTelemetry: preTelemetry,
                                        nsg,
                                        constitution,
                                        voiceDna,
                                        story: workingStory,
                                        slopConfig,
                                        callAIFn: callAIIfEnabled,
                                        useLLM
                                    });
                                    lastGateSuite = gateSuite;

                                    if (gateSuite.allPassed && patchRes.updatedFullProse.trim() !== beforeProse.trim()) {
                                        const sKey = sceneItem.proseKey;
                                        const prevProseEntry = workingStory.prose[sKey] || {};
                                        workingStory.prose[sKey] = {
                                            ...(typeof prevProseEntry === 'object' ? prevProseEntry : {}),
                                            final: patchRes.updatedFullProse,
                                            draft: patchRes.updatedFullProse,
                                            editorial_harness_patched: true,
                                            last_patch_tx: tx.transactionId
                                        };
                                        tx.status = 'COMMITTED';
                                        tx.attempts_used = attempt;
                                        tx.attemptHistory = attemptHistory;
                                        tx.proseKey = sKey;
                                        tx.beforeProse = beforeProse;
                                        tx.afterProse = patchRes.updatedFullProse;
                                        tx.beforeSpan = patchRes.beforeSpan;
                                        tx.afterSpan = patchRes.afterSpan;
                                        tx.gateResults = gateSuite.gates;
                                        committedCount++;

                                        fullTelemetry.sceneTelemetryMap[sceneItem.sceneId] = gateSuite.postTelemetry;
                                        appendHarnessLog(
                                            `${wave.waveId} CI/CD`,
                                            `COMMITTED [${tx.transactionId}] (${wave.specialistAgent}) on ${tx.sceneId}: All 4 Literary CI/CD Gates PASSED on round ${attempt}/${maxAttempts}${attempt > 1 ? ` (Feedback loop resolved prior failures)` : ''}.`,
                                            "success"
                                        );
                                        break;
                                    } else {
                                        const feedback = typeof compileGateFailureFeedback === "function"
                                            ? compileGateFailureFeedback(gateSuite, patchRes, attempt)
                                            : { diagnostic: gateSuite.retryDirective || "Quality gates rejected candidate replacement.", correction: "Provide a fresh surgical replacement." };
                                        attemptHistory.push({
                                            attempt,
                                            proposedSpan: patchRes.afterSpan,
                                            failedGates: (gateSuite.gates || []).filter(g => !g.passed).map(g => g.gate),
                                            feedback,
                                            gateResults: gateSuite.gates
                                        });

                                        appendHarnessLog(
                                            `${wave.waveId} CI/CD`,
                                            `Round ${attempt}/${maxAttempts} REJECTED for [${tx.transactionId}] (${feedback.diagnostic}). Initiating feedback loop retry...`,
                                            "warning"
                                        );
                                        attempt++;
                                    }
                                }

                                if (tx.status !== 'COMMITTED') {
                                    const candidateFull = lastPatchRes?.updatedFullProse || beforeProse;
                                    tx.status = candidateFull.trim() === beforeProse.trim() ? 'NO_OP_CLEAN' : 'ROLLED_BACK';
                                    tx.attempts_used = maxAttempts;
                                    tx.attemptHistory = attemptHistory;
                                    tx.proseKey = sceneItem.proseKey;
                                    tx.beforeProse = beforeProse;
                                    tx.afterProse = beforeProse;
                                    tx.beforeSpan = lastPatchRes?.beforeSpan || tx.verbatimOriginal;
                                    tx.afterSpan = lastPatchRes?.afterSpan || tx.verbatimOriginal;
                                    tx.gateResults = lastGateSuite ? lastGateSuite.gates : [];
                                    if (tx.status === 'ROLLED_BACK') {
                                        rejectedCount++;
                                        const lastReason = attemptHistory[attemptHistory.length - 1]?.feedback?.diagnostic || "Failed verification gates";
                                        appendHarnessLog(
                                            `${wave.waveId} CI/CD`,
                                            `ROLLED BACK [${tx.transactionId}] on ${tx.sceneId}: Worktree discarded after ${maxAttempts} feedback rounds (${lastReason}) to protect manuscript integrity.`,
                                            "warning"
                                        );
                                    }
                                }
                            }
                        }

                        // Recompute manuscript-wide telemetry & NSG after wave commits
                        fullTelemetry = runFullManuscriptNlpTelemetry(workingStory, bannedPhrases, slopConfig);
                        nsg = compileNarrativeStateGraph(workingStory, fullTelemetry);
                    }

                    const postMeanDivergence = Object.values(layer0Map).length > 0
                        ? Number((Object.values(layer0Map).reduce((s, r) => s + (r.dTotal ?? r.divergence?.d_total ?? 0), 0) / Object.values(layer0Map).length).toFixed(3))
                        : 0;

                    const harnessState = {
                        lastRunAt: new Date().toISOString(),
                        mode,
                        scopeSceneId,
                        autopilotCompleted: isAutopilot ? true : Boolean(existingHarness.autopilotCompleted),
                        customConstitutionOverrides: normalizeIntentionalOverrides(constitution?.intentionalOverrides),
                        constitution: constitution ? {
                            ...constitution,
                            intentionalOverrides: normalizeIntentionalOverrides(constitution.intentionalOverrides)
                        } : null,
                        voiceDna,
                        nsg,
                        fullTelemetry,
                        layer0Map,
                        dossiers,
                        tribunalResult,
                        editPlan,
                        preRunProseSnapshot,
                        summary: {
                            scenesEvaluated: Object.keys(layer0Map).length,
                            meanDivergence: postMeanDivergence,
                            dossiersCompiled: dossiers.length,
                            verifiedTicketsCount: tribunalResult?.verifiedTickets?.length || 0,
                            dismissedTicketsCount: Math.max(0, (tribunalResult?.tribunalCases?.length || 0) - (tribunalResult?.verifiedTickets?.length || 0)),
                            totalTransactions: editPlan?.allTransactions?.length || 0,
                            committedTransactions: committedCount,
                            rolledBackTransactions: rejectedCount
                        },
                        logs: runLogs.slice(-100)
                    };

                    const committedProseKeys = new Set();
                    (editPlan?.waves || []).forEach(w => {
                        (w.transactions || []).forEach(tx => {
                            if (tx.status === 'COMMITTED' && tx.proseKey) {
                                committedProseKeys.add(tx.proseKey);
                            }
                        });
                    });

                    const finalHarnessStory = setStory(prev => {
                        const mergedProse = { ...(prev.prose || {}) };
                        committedProseKeys.forEach(sKey => {
                            if (workingStory.prose && workingStory.prose[sKey]) {
                                const currentEntry = prev.prose?.[sKey];
                                const currentFinal = typeof currentEntry === 'string' ? currentEntry : (currentEntry?.final || currentEntry?.prose || '');
                                const preRunEntry = preRunProseSnapshot?.[sKey];
                                const preRunFinal = typeof preRunEntry === 'string' ? preRunEntry : (preRunEntry?.final || preRunEntry?.prose || '');
                                // Only apply the harness patch if the user did not manually edit this scene's prose while the harness was running
                                if (!preRunFinal || currentFinal === preRunFinal) {
                                    mergedProse[sKey] = {
                                        ...(typeof currentEntry === 'object' ? currentEntry : {}),
                                        ...workingStory.prose[sKey]
                                    };
                                }
                            }
                        });
                        return {
                            ...prev,
                            prose: mergedProse,
                            editorial_harness: harnessState
                        };
                    });
                    if (storyStore?.saveStory && finalHarnessStory.id) {
                        await storyStore.saveStory(finalHarnessStory.id, finalHarnessStory);
                    }

                    setEditorialHarnessProgress(100);
                    setEditorialHarnessPhase("Complete: 5-Phase Autonomous Editorial Harness Finished.");

                    const toastSummary = mode === 'review_only'
                        ? `Editorial Review complete! ${harnessState.summary.verifiedTicketsCount} verified tickets queued across 3 waves.`
                        : `Editorial Harness complete! ${committedCount} surgical revision(s) passed all 4 CI/CD gates.`;
                    showToast(toastSummary, "success");
                    return harnessState;
                } catch (err) {
                    console.error("[runAutonomousEditorialHarness] Error:", err);
                    appendHarnessLog("Error", `Editorial Harness failed: ${err.message}`, "error");
                    showToast(`Editorial Harness error: ${err.message}`, "error");
                    return null;
                } finally {
                    setIsRunningEditorialHarness(false);
                    if (!isAutopilot) {
                        setLoading(false);
                        setLoadingStep("");
                    }
                }
            };

            const executeSingleHarnessTransaction = async (transactionId) => {
                const currentHarness = story.editorial_harness;
                if (!currentHarness || !currentHarness.editPlan) return;
                setIsRunningEditorialHarness(true);
                setEditorialHarnessPhase(`Executing transaction ${transactionId} through 4-Gate CI/CD...`);
                try {
                    let workingStory = JSON.parse(JSON.stringify(story));
                    const harness = workingStory.editorial_harness;
                    let targetTx = null;
                    let targetWave = null;
                    for (const w of (harness.editPlan?.waves || [])) {
                        const found = (w.transactions || []).find(t => (t.transactionId || t.transaction_id) === transactionId);
                        if (found) {
                            targetTx = found;
                            targetWave = w;
                            break;
                        }
                    }
                    if (!targetTx) {
                        showToast(`Transaction ${transactionId} not found.`, "warning");
                        return;
                    }

                    const scenesList = getDraftedStoryScenesList(workingStory);
                    const sceneItem = scenesList.find(s => s.sceneId === targetTx.sceneId || s.proseKey === targetTx.proseKey);
                    if (!sceneItem) {
                        showToast(`Target scene ${targetTx.sceneId} has no drafted prose.`, "warning");
                        return;
                    }

                    const beforeProse = sceneItem.proseText;
                    const preTelemetry = runSceneNlpTelemetry(sceneItem, workingStory, bannedPhrases, slopConfig);

                    let attempt = 1;
                    const maxAttempts = 3;
                    let lastGateSuite = null;
                    let lastPatchRes = null;
                    const attemptHistory = [];

                    while (attempt <= maxAttempts) {
                        let rawPatchOutput = null;
                        if (editorialUseDeepLLM && typeof callAI === "function") {
                            try {
                                const isWave1 = targetWave?.waveId === 1 || targetWave?.waveId === "WAVE_1_MACRO" || targetWave?.waveKey === "WAVE_1_MACRO" || targetTx.wave === "WAVE_1_MACRO" || targetTx.wave === 1;
                                const isWave2 = targetWave?.waveId === 2 || targetWave?.waveId === "WAVE_2_MESO" || targetWave?.waveKey === "WAVE_2_MESO" || targetTx.wave === "WAVE_2_MESO" || targetTx.wave === 2;
                                const agentPromptKey = isWave1
                                    ? "macroStructuralArchitectAgent"
                                    : isWave2
                                        ? "mesoSceneSurgeonAgent"
                                        : "microLineStylistAgent";
                                const sysPrompt = PROMPTS[agentPromptKey] || PROMPTS.microLineStylistAgent;

                                const startParaId = String(targetTx.startAnchor || "").split(":s")[0];
                                const pList = sceneItem.normalized?.paragraphs || [];
                                const pIdx = pList.findIndex(p => p.id === startParaId);
                                const prevParaText = pIdx > 0 ? (pList[pIdx - 1]?.text || "") : "";
                                const nextParaText = (pIdx >= 0 && pIdx < pList.length - 1) ? (pList[pIdx + 1]?.text || "") : "";

                                let feedbackXml = "";
                                if (attemptHistory.length > 0) {
                                    feedbackXml = `<FeedbackFromPriorRounds current_round="${attempt}" max_rounds="${maxAttempts}">\n` +
                                        attemptHistory.map(h => `  <PriorAttempt round="${h.attempt}">\n    <RejectedSpan><![CDATA[${h.proposedSpan}]]></RejectedSpan>\n    <FailureDiagnostic>${escapeHarnessXml(h.feedback?.diagnostic || "")}</FailureDiagnostic>\n    <RequiredCorrectionDirective>${escapeHarnessXml(h.feedback?.correction || "")}</RequiredCorrectionDirective>\n  </PriorAttempt>`).join("\n") +
                                        `\n  <Round${attempt}Directive>Do NOT repeat or closely paraphrase any rejected replacement above. You MUST take a fundamentally fresh craft approach that satisfies the RequiredCorrectionDirective while strictly preserving <AuthorVoiceDNA>.</Round${attempt}Directive>\n</FeedbackFromPriorRounds>`;
                                }

                                const userPrompt = `${harness.voiceDna?.xml || ""}\n${harness.constitution?.xml || ""}\n<TargetScene id="${targetTx.sceneId}">
  <PrecedingContext><![CDATA[${prevParaText}]]></PrecedingContext>
  <AtomicEditTransaction id="${targetTx.transactionId}" wave="${targetTx.wave}" start_anchor="${targetTx.startAnchor}" end_anchor="${targetTx.endAnchor}">
    <Problem>${escapeHarnessXml(targetTx.combinedProblem)}</Problem>
    <SurgicalDirective>${escapeHarnessXml(targetTx.combinedDirective)}</SurgicalDirective>
    <OriginalSpanVerifier><![CDATA[${targetTx.verbatimOriginal}]]></OriginalSpanVerifier>
  </AtomicEditTransaction>
  <FollowingContext><![CDATA[${nextParaText}]]></FollowingContext>
</TargetScene>
${feedbackXml ? `${feedbackXml}\n` : ""}Emit a <ManuscriptPatchTransaction transaction_id="${targetTx.transactionId}" target_scene="${targetTx.sceneId}">
  <PatchOperation type="REPLACE_SPAN" start_anchor="${targetTx.startAnchor}" end_anchor="${targetTx.endAnchor}">
    <OriginalSpanVerifier><![CDATA[${targetTx.verbatimOriginal}]]></OriginalSpanVerifier>
    <ReplacementSpan>
      <!-- Revised prose resolving the ticket and satisfying Round ${attempt} feedback -->
    </ReplacementSpan>
  </PatchOperation>
</ManuscriptPatchTransaction>`;
                                rawPatchOutput = await callAI(userPrompt, sysPrompt, false, `Editorial Harness Single Tx (${targetTx.transactionId} - R${attempt}/${maxAttempts})`, "Polish");
                            } catch (llmErr) {
                                console.warn(`[executeSingleHarnessTransaction] LLM fallback for ${targetTx.transactionId} round ${attempt}:`, llmErr);
                            }
                        }

                        const patchRes = applyManuscriptPatchToScene(
                            sceneItem,
                            targetTx,
                            rawPatchOutput,
                            workingStory,
                            attempt,
                            attemptHistory[attemptHistory.length - 1]?.feedback
                        );
                        lastPatchRes = patchRes;

                        const gateSuite = await runFourGateVerificationSuite({
                            sceneItem,
                            patchedResult: patchRes,
                            transaction: targetTx,
                            baselineTelemetry: preTelemetry,
                            nsg: harness.nsg,
                            constitution: harness.constitution,
                            voiceDna: harness.voiceDna,
                            story: workingStory,
                            slopConfig,
                            callAIFn: editorialUseDeepLLM ? callAI : null,
                            useLLM: editorialUseDeepLLM
                        });
                        lastGateSuite = gateSuite;

                        if (gateSuite.allPassed && patchRes.updatedFullProse.trim() !== beforeProse.trim()) {
                            const sKey = sceneItem.proseKey;
                            workingStory.prose[sKey] = {
                                ...(typeof workingStory.prose[sKey] === 'object' ? workingStory.prose[sKey] : {}),
                                final: patchRes.updatedFullProse,
                                draft: patchRes.updatedFullProse,
                                editorial_harness_patched: true,
                                last_patch_tx: targetTx.transactionId
                            };
                            targetTx.status = 'COMMITTED';
                            targetTx.attempts_used = attempt;
                            targetTx.attemptHistory = attemptHistory;
                            targetTx.proseKey = sceneItem.proseKey;
                            targetTx.beforeProse = beforeProse;
                            targetTx.afterProse = patchRes.updatedFullProse;
                            targetTx.beforeSpan = patchRes.beforeSpan;
                            targetTx.afterSpan = patchRes.afterSpan;
                            targetTx.gateResults = gateSuite.gates;
                            harness.fullTelemetry = runFullManuscriptNlpTelemetry(workingStory, bannedPhrases, slopConfig);
                            harness.nsg = compileNarrativeStateGraph(workingStory, harness.fullTelemetry);
                            harness.summary.committedTransactions = (harness.summary.committedTransactions || 0) + 1;
                            showToast(`Transaction ${transactionId} PASSED all 4 CI/CD gates on round ${attempt}/${maxAttempts}!`, "success");
                            break;
                        } else {
                            const feedback = typeof compileGateFailureFeedback === "function"
                                ? compileGateFailureFeedback(gateSuite, patchRes, attempt)
                                : { diagnostic: gateSuite.retryDirective || "Rejected by quality gates.", correction: "Provide alternative phrasing." };
                            attemptHistory.push({
                                attempt,
                                proposedSpan: patchRes.afterSpan,
                                failedGates: (gateSuite.gates || []).filter(g => !g.passed).map(g => g.gate),
                                feedback,
                                gateResults: gateSuite.gates
                            });
                            attempt++;
                        }
                    }

                    if (targetTx.status !== 'COMMITTED') {
                        targetTx.status = (lastPatchRes?.updatedFullProse || beforeProse).trim() === beforeProse.trim() ? 'NO_OP_CLEAN' : 'ROLLED_BACK';
                        targetTx.attempts_used = maxAttempts;
                        targetTx.attemptHistory = attemptHistory;
                        targetTx.proseKey = sceneItem.proseKey;
                        targetTx.beforeProse = beforeProse;
                        targetTx.afterProse = beforeProse;
                        targetTx.beforeSpan = lastPatchRes?.beforeSpan || targetTx.verbatimOriginal;
                        targetTx.afterSpan = lastPatchRes?.afterSpan || targetTx.verbatimOriginal;
                        targetTx.gateResults = lastGateSuite ? lastGateSuite.gates : [];
                        const lastReason = attemptHistory[attemptHistory.length - 1]?.feedback?.diagnostic || "Verification gates failed";
                        showToast(`Transaction ${transactionId} was rolled back after 3 feedback rounds (${lastReason}).`, "warning");
                    }

                    const finalTxStory = setStory(prev => {
                        const sKey = sceneItem.proseKey;
                        const nextProse = { ...(prev.prose || {}) };
                        if (targetTx.status === 'COMMITTED' && sKey && workingStory.prose?.[sKey]) {
                            nextProse[sKey] = {
                                ...(typeof prev.prose?.[sKey] === 'object' ? prev.prose[sKey] : {}),
                                ...workingStory.prose[sKey]
                            };
                        }
                        return {
                            ...prev,
                            prose: nextProse,
                            editorial_harness: harness
                        };
                    });
                    if (storyStore?.saveStory && finalTxStory.id) {
                        await storyStore.saveStory(finalTxStory.id, finalTxStory);
                    }
                } catch (err) {
                    console.error("[executeSingleHarnessTransaction] Error:", err);
                    showToast(`Failed to execute transaction: ${err.message}`, "error");
                } finally {
                    setIsRunningEditorialHarness(false);
                    setEditorialHarnessPhase("");
                }
            };

            const revertHarnessTransaction = async (transactionId) => {
                if (!story.editorial_harness?.editPlan) return;
                let workingStory = JSON.parse(JSON.stringify(story));
                const harness = workingStory.editorial_harness;
                let targetTx = null;
                for (const w of (harness.editPlan?.waves || [])) {
                    const found = (w.transactions || []).find(t => (t.transactionId || t.transaction_id) === transactionId);
                    if (found) {
                        targetTx = found;
                        break;
                    }
                }
                if (!targetTx) {
                    showToast("Transaction not found.", "warning");
                    return;
                }
                const sKey = targetTx.proseKey || targetTx.sceneKey;
                if (!sKey || !workingStory.prose?.[sKey]) {
                    showToast("Target scene prose not found.", "warning");
                    return;
                }

                const currentEntry = workingStory.prose[sKey];
                const currentProse = typeof currentEntry === 'string' ? currentEntry : (currentEntry?.final || currentEntry?.draft || currentEntry?.prose || "");

                let revertedProse = null;
                let revertedVia = "snapshot";

                // Attempt surgical rollback first if we have afterSpan and beforeSpan
                if (targetTx.afterSpan && targetTx.beforeSpan && currentProse) {
                    const match = locateNeedle(currentProse, targetTx.afterSpan, true);
                    if (match) {
                        const pre = currentProse.slice(0, match.start);
                        const post = currentProse.slice(match.end);
                        revertedProse = pre + targetTx.beforeSpan + post;
                        revertedVia = "surgical";
                    }
                }

                // Fallback to full beforeProse snapshot if surgical match not found
                if (!revertedProse && targetTx.beforeProse) {
                    revertedProse = targetTx.beforeProse;
                    revertedVia = "full_snapshot";
                }

                if (!revertedProse) {
                    showToast("No pre-transaction prose snapshot available to revert.", "warning");
                    return;
                }

                workingStory.prose[sKey] = {
                    ...(typeof currentEntry === 'object' ? currentEntry : {}),
                    final: revertedProse,
                    draft: revertedProse
                };

                targetTx.status = 'REVERTED';
                harness.fullTelemetry = runFullManuscriptNlpTelemetry(workingStory, bannedPhrases, slopConfig);
                harness.nsg = compileNarrativeStateGraph(workingStory, harness.fullTelemetry);
                storyRef.current = workingStory;
                setStory(workingStory);
                if (storyStore?.saveStory && workingStory.id) {
                    await storyStore.saveStory(workingStory.id, workingStory);
                }
                showToast(
                    revertedVia === "surgical"
                        ? `Surgically reverted transaction ${transactionId} (preserved other scene edits).`
                        : `Reverted transaction ${transactionId} and restored scene snapshot.`,
                    "info"
                );
            };

            const revertAllHarnessTransactions = async () => {
                const snapshot = story.editorial_harness?.preRunProseSnapshot;
                if (!snapshot) {
                    showToast("No pre-run manuscript snapshot found to restore.", "warning");
                    return;
                }
                let workingStory = JSON.parse(JSON.stringify(story));
                workingStory.prose = JSON.parse(JSON.stringify(snapshot));
                if (workingStory.editorial_harness?.editPlan?.waves) {
                    workingStory.editorial_harness.editPlan.waves.forEach(w => {
                        (w.transactions || []).forEach(tx => {
                            if (tx.status === 'COMMITTED') tx.status = 'REVERTED';
                        });
                    });
                }
                workingStory.editorial_harness.fullTelemetry = runFullManuscriptNlpTelemetry(workingStory, bannedPhrases, slopConfig);
                workingStory.editorial_harness.nsg = compileNarrativeStateGraph(workingStory, workingStory.editorial_harness.fullTelemetry);
                storyRef.current = workingStory;
                setStory(workingStory);
                if (storyStore?.saveStory && workingStory.id) {
                    await storyStore.saveStory(workingStory.id, workingStory);
                }
                showToast("Restored full manuscript prose to pre-harness snapshot.", "info");
            };

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
            const [toast, setToast] = useState(null); // { id, message, type: 'success'|'error'|'warning'|'info', bookCard?, actionLabel?, onAction? }
            const toastTimerRef = useRef(null);

            const showToast = (message, type = 'success', options = null) => {
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
            };


            const toggleAct = (idx) => {
                setCollapsedActs(prev => ({ ...prev, [idx]: !prev[idx] }));
            };

            const toggleBeats = (bId) => {
                setCollapsedBeats(prev => ({ ...prev, [bId]: !prev[bId] }));
            };

            const toggleBeatAnalysis = (bId) => {
                setExpandedBeatAnalysis(prev => ({ ...prev, [bId]: !prev[bId] }));
            };

            // Persistence Effects
            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_review", enableReview); }, [enableReview]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_style_polish", enableStylePolish); }, [enableStylePolish]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_audio_drama_direction", enableAudioDramaDirectionPass); }, [enableAudioDramaDirectionPass]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_dev_provider", devProvider); }, [devProvider]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_dev_model", devModel); }, [devModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_review_provider", reviewProvider); }, [reviewProvider]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_review_model", reviewModel); }, [reviewModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_prose_provider", proseProvider); }, [proseProvider]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_prose_model", proseModel); }, [proseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_api_provider", apiProvider); }, [apiProvider]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_embedding_provider", embeddingProvider); }, [embeddingProvider]);
            useEffect(() => { safeLocalStorageSet("gemini_api_key", apiKey); }, [apiKey]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_api_timeout", apiTimeout); }, [apiTimeout]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_gemini_model", geminiModel); }, [geminiModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_openrouter_key", openRouterKey); }, [openRouterKey]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_openrouter_model", openRouterModel); }, [openRouterModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_openrouter_max_tokens", openRouterMaxTokens); }, [openRouterMaxTokens]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_nanogpt_key", nanoGptKey); }, [nanoGptKey]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_nanogpt_model", nanoGptModel); }, [nanoGptModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_nanogpt_prose_model", nanoGptProseModel); }, [nanoGptProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_kobold_url", koboldUrl); }, [koboldUrl]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_kobold_model", koboldModel); }, [koboldModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_codex_url", codexUrl); }, [codexUrl]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_codex_model", codexModel); }, [codexModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_codex_prose_model", codexProseModel); }, [codexProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_saved_models", savedModels); }, [savedModels]);
            useEffect(() => {
                if (openRouterModelsList.length > 0) {
                    safeSessionStorageSet("ellipsisprose_openrouter_models_cache", openRouterModelsList);
                }
            }, [openRouterModelsList]);
            useEffect(() => {
                if (nanoGptModelsList.length > 0) {
                    safeSessionStorageSet("ellipsisprose_nanogpt_models_cache", nanoGptModelsList);
                }
            }, [nanoGptModelsList]);

            useEffect(() => { safeLocalStorageSet("ellipsisprose_use_prose_model", useProseModel); }, [useProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_gemini_prose_model", geminiProseModel); }, [geminiProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_openrouter_prose_model", openRouterProseModel); }, [openRouterProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_kobold_prose_model", koboldProseModel); }, [koboldProseModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_custom_modes", customModes); }, [customModes]);
            useEffect(() => {
                safeLocalStorageSet("ellipsisprose_enable_narrative_lenses_v2", enableNarrativeLenses);
                safeLocalStorageSet("ellipsisprose_enable_narrative_lenses", enableNarrativeLenses);
            }, [enableNarrativeLenses]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_banned_phrases", bannedPhrases); }, [bannedPhrases]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_slop_config_v1", slopConfig); }, [slopConfig]);

            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_thinking_act", enableThinkingAct); }, [enableThinkingAct]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_thinking_scene", enableThinkingScene); }, [enableThinkingScene]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_enable_thinking_writing", enableThinkingWriting); }, [enableThinkingWriting]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_thinking_budget_story_arc", thinkingBudgetStoryArc); }, [thinkingBudgetStoryArc]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_thinking_budget_act", thinkingBudgetAct); }, [thinkingBudgetAct]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_thinking_budget_scene", thinkingBudgetScene); }, [thinkingBudgetScene]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_thinking_budget_writing", thinkingBudgetWriting); }, [thinkingBudgetWriting]);

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

            // Image Persistence Effects
            useEffect(() => { safeLocalStorageSet("ellipsisprose_image_provider", imageProvider); }, [imageProvider]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_image_model", imageModel); }, [imageModel]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_image_api_key", imageApiKey); }, [imageApiKey]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_url", comfyUrl); }, [comfyUrl]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_unet", comfyUnet); }, [comfyUnet]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_clip", comfyClip); }, [comfyClip]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_vae", comfyVae); }, [comfyVae]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_lora", comfyLora); }, [comfyLora]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_lora_strength", comfyLoraStrength); }, [comfyLoraStrength]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_steps", comfySteps); }, [comfySteps]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_cfg", comfyCfg); }, [comfyCfg]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_sampler", comfySampler); }, [comfySampler]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_scheduler", comfyScheduler); }, [comfyScheduler]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_comfy_timeout_sec", comfyTimeoutSec); }, [comfyTimeoutSec]);
            useEffect(() => { safeLocalStorageSet("ellipsisprose_custom_image_styles", customImageStyles); }, [customImageStyles]);

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

            // Load Cover Image from IndexedDB
            useEffect(() => {
                if (story && story.id) {
                    imageStore.getImage(`cover_${story.id}`).then(dataUrl => {
                        setLoadedImages(prev => ({ ...prev, cover: dataUrl }));
                    }).catch(err => console.error("Error loading cover image:", err));
                } else {
                    setLoadedImages(prev => {
                        const copy = { ...prev };
                        delete copy.cover;
                        return copy;
                    });
                }
            }, [story?.id]);

            // Clear portraits on story switches, then load the cast after story hydration.
            useEffect(() => {
                setLoadedImages(prev => ({ ...prev, portraits: {} }));
                const pending = {};
                (story?.cast || []).forEach(c => {
                    if (portraitOperations.current.has(`portrait_${story.id}_${c.id}`)) pending[c.id] = true;
                });
                setPortraitLoading(pending);
            }, [story?.id]);

            const portraitCastIds = JSON.stringify((story?.cast || []).map(c => c.id).filter(id => id != null));
            useEffect(() => {
                if (!story?.id) return;
                let cancelled = false;
                const storyId = story.id;
                const ids = JSON.parse(portraitCastIds);
                Promise.all(ids.map(async id => {
                    const key = `portrait_${storyId}_${id}`;
                    const revision = portraitRevisions.current.get(key) || 0;
                    const dataUrl = await imageStore.getImage(key);
                    return { id, key, revision, dataUrl };
                })).then(results => {
                    if (cancelled || portraitStoryId.current !== storyId) return;
                    setLoadedImages(prev => {
                        if (cancelled || portraitStoryId.current !== storyId) return prev;
                        const portraits = { ...prev.portraits };
                        results.forEach(({ id, key, revision, dataUrl }) => {
                            if (portraitOperations.current.has(key) || revision !== (portraitRevisions.current.get(key) || 0)) return;
                            if (dataUrl) portraits[id] = dataUrl;
                            else delete portraits[id];
                        });
                        return { ...prev, portraits };
                    });
                }).catch(err => {
                    if (!cancelled) showToast('Failed to load character portraits: ' + err.message, 'error');
                });
                return () => { cancelled = true; };
            }, [story?.id, portraitCastIds, portraitReload, imageStore]);

            // Load Beat Images and Scene Illustration for the active scene from IndexedDB
            const activeBeatsKey = `${selectedSequence !== null && selectedSequence !== undefined ? selectedSequence : 0}-${selectedScene !== null && selectedScene !== undefined ? selectedScene : 0}`;
            const activeBeatsLength = Array.isArray(story?.beats?.[activeBeatsKey]) ? story.beats[activeBeatsKey].length : 0;
            useEffect(() => {
                if (story && story.id && selectedSequence !== null && selectedScene !== null) {
                    const sId = `${selectedSequence}-${selectedScene}`;
                    const beats = Array.isArray(story?.beats?.[sId]) ? story.beats[sId] : [];

                    const promises = beats.map((_, bi) => {
                        const imgKey = `beat_${story.id}_${sId}_${bi}`;
                        return imageStore.getImage(imgKey).then(dataUrl => ({ type: 'beat', idx: bi, dataUrl }));
                    });

                    // Also fetch scene illustration
                    const sceneImgPromise = imageStore.getImage(`scene_${story.id}_${sId}`).then(dataUrl => ({ type: 'scene', sId, dataUrl }));
                    promises.push(sceneImgPromise);

                    Promise.all(promises).then(results => {
                        const newLoaded = {};
                        results.forEach(res => {
                            if (!res.dataUrl) return;
                            if (res.type === 'beat') {
                                newLoaded[`${sId}-${res.idx}`] = res.dataUrl;
                            } else if (res.type === 'scene') {
                                newLoaded[`scene_${res.sId}`] = res.dataUrl;
                            }
                        });
                        setLoadedImages(prev => {
                            const cleared = { cover: prev.cover, portraits: prev.portraits };
                            Object.keys(prev).forEach(k => {
                                if (k.startsWith('scene_') && k !== `scene_${sId}`) {
                                    cleared[k] = prev[k];
                                }
                            });
                            Object.keys(newLoaded).forEach(key => {
                                cleared[key] = newLoaded[key];
                            });
                            return cleared;
                        });
                    }).catch(err => console.error("Error loading scene/beat images:", err));
                }
            }, [story?.id, selectedSequence, selectedScene, activeBeatsLength]);

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

            const callImageAPI = (prompt, aspectRatio = "1:1") => generateImage(prompt, aspectRatio, {
                provider: imageProvider,
                model: imageModel,
                apiKey: imageApiKey,
                fallbackGeminiKey: apiKey,
                fallbackOpenRouterKey: openRouterKey,
                onModelMigrated: setImageModel,
                comfy: {
                    url: comfyUrl,
                    unet: comfyUnet,
                    clip: comfyClip,
                    vae: comfyVae,
                    lora: comfyLora,
                    loraStrength: comfyLoraStrength,
                    steps: comfySteps,
                    cfg: comfyCfg,
                    sampler: comfySampler,
                    scheduler: comfyScheduler,
                    timeoutSec: comfyTimeoutSec
                }
            });

            const generateCoverImage = async () => {
                if (loadingCover) return;
                setLoadingCover(true);
                try {
                    const sysPrompt = `You are an expert graphic designer and book cover artist. Your task is to design a distinctive, professional book cover design concept.
You will take a novel's title, concept, status quo, inciting incident, and genre, and create a single highly detailed and symbolic image generation prompt for a book cover.
Focus on composition, central imagery, symbolic representations of the themes, lighting, and mood. The cover image should be designed for a vertical format.
Do not ask the image generator to print text on the cover (like the title or author name) to avoid scrambled AI text. Focus on the artwork itself.

## Input Schema Definition
You will receive the following novel information:
- Title: The novel title
- Genre: The genre
- Concept: The novel concept
- Status Quo: The world baseline
- Inciting Incident: The disruption

Output ONLY the raw image generation prompt itself. Do not include any intros or explanations. Wrap prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

                    const userPrompt = `NOVEL INFORMATION:
Title: ${story.title || "Untitled Novel"}
Genre: ${story.style?.genre || "Not specified"}
Concept: ${story.concept || "Not specified"}
Status Quo: ${story.status_quo || "Not specified"}
Inciting Incident: ${story.inciting_incident || "Not specified"}

Please write a highly detailed and symbolic cover art image generation prompt. It must be optimized for a vertical aspect ratio. Describe the scene, layout, central motif, atmospheric colors, lighting, and symbolic imagery. Return ONLY the prompt text.

BEGIN GENERATING IMAGE PROMPT`;

                    const promptBase = await callAI(userPrompt, sysPrompt, false, "Cover Image Prompt Agent", "dev");

                    const selectedStyleId = story.imageStyle || 'none';
                    const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                    const styleObj = combinedStyles.find(s => s.id === selectedStyleId);
                    const styleDescription = styleObj ? styleObj.description : "";
                    const finalPrompt = cleanImagePrompt(promptBase) + (styleDescription ? ", " + styleDescription : "");

                    const dataUrl = await callImageAPI(finalPrompt, "3:4");
                    await imageStore.saveImage(`cover_${story.id}`, dataUrl);
                    setLoadedImages(prev => ({ ...prev, cover: dataUrl }));
                    showToast("Cover image generated successfully!");
                } catch (err) {
                    console.error(err);
                    alert("Cover Image Generation failed: " + err.message);
                } finally {
                    setLoadingCover(false);
                }
            };

            // Serialize portrait edits per story/character and keep late results in their own story.
            const updateCharacterPortrait = async (c, createDataUrl, successMessage, errorPrefix) => {
                if (!story?.id || !c?.id) {
                    showToast('A saved story and character are required for portraits.', 'error');
                    return;
                }
                const storyId = story.id;
                const key = `portrait_${storyId}_${c.id}`;
                if (portraitOperations.current.has(key)) return;
                portraitOperations.current.add(key);
                portraitRevisions.current.set(key, (portraitRevisions.current.get(key) || 0) + 1);
                setPortraitLoading(prev => ({ ...prev, [c.id]: true }));
                try {
                    const dataUrl = await createDataUrl();
                    if (dataUrl === null) await imageStore.deleteImage(key);
                    else await imageStore.saveImage(key, dataUrl);
                    if (portraitStoryId.current === storyId) {
                        setLoadedImages(prev => {
                            if (portraitStoryId.current !== storyId) return prev;
                            const portraits = { ...prev.portraits };
                            if (dataUrl === null) delete portraits[c.id];
                            else portraits[c.id] = dataUrl;
                            return { ...prev, portraits };
                        });
                        showToast(successMessage, 'success');
                    }
                } catch (err) {
                    showToast(errorPrefix + err.message, 'error');
                } finally {
                    portraitOperations.current.delete(key);
                    if (portraitStoryId.current === storyId) {
                        setPortraitLoading(prev => {
                            if (portraitStoryId.current !== storyId) return prev;
                            const next = { ...prev };
                            delete next[c.id];
                            return next;
                        });
                    }
                }
            };

            const generateCharacterPortrait = async (c) => {
                return updateCharacterPortrait(c, async () => {
                    const sysPrompt = `You are a character portrait artist. Write a detailed image generation prompt grounded in the supplied character's appearance, role and temperament.
Describe a waist-up, three-quarter view portrait, an expression that fits the character's temperament, and a plain softly lit background. Preserve any supplied physical traits. No text, no watermark.
Output only <response><image_prompt>...</image_prompt></response>.`;
                    const characterInfo = ['name', 'role', 'description', 'appearance', 'history', 'core_flaw', 'core_desire', 'vocal_cadence', 'voice_sample']
                        .map(field => `${field}: ${c[field] || c.details?.[field] || 'Not specified'}`).join('\n');
                    const userPrompt = `CHARACTER INFORMATION:
${characterInfo}
STORY GENRE: ${story.style?.genre || 'Not specified'}
STORY MOOD: ${story.style?.mood || 'Not specified'}
Create a waist-up, three-quarter view portrait prompt with an expression that fits this character's temperament, a plain softly lit background, no text, and no watermark.`;
                    const promptBase = await callAI(userPrompt, sysPrompt, false, "Character Portrait Prompt Agent", "dev");
                    const selectedStyleId = story.imageStyle || 'none';
                    const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                    const styleObj = combinedStyles.find(s => s.id === selectedStyleId);
                    const styleDescription = styleObj ? styleObj.description : "";
                    const finalPrompt = cleanImagePrompt(promptBase) + (styleDescription ? ", " + styleDescription : "");
                    return callImageAPI(finalPrompt, "3:4");
                }, `Portrait generated for ${c?.name || 'character'}.`, 'Character portrait generation failed: ');
            };

            const uploadCharacterPortrait = async (c, file) => {
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    showToast('Please select an image file.', 'error');
                    return;
                }
                return updateCharacterPortrait(c, () => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
                    reader.onabort = () => reject(new Error('Image upload was cancelled.'));
                    reader.readAsDataURL(file);
                }), `Portrait uploaded for ${c?.name || 'character'}.`, 'Character portrait upload failed: ');
            };

            const removeCharacterPortrait = async (c) => updateCharacterPortrait(c, async () => null,
                `Portrait removed for ${c?.name || 'character'}.`, 'Failed to remove character portrait: ');

            const deleteCoverImage = async () => {
                requestConfirm({
                    title: "Remove Cover Image?",
                    message: "Are you sure you want to remove the cover illustration?",
                    confirmLabel: "Remove Cover",
                    danger: true,
                    onConfirm: async () => {
                        try {
                            await imageStore.deleteImage(`cover_${story.id}`);
                            setLoadedImages(prev => {
                                const copy = { ...prev };
                                delete copy.cover;
                                return copy;
                            });
                            showToast("Cover image removed.");
                        } catch (err) {
                            console.error(err);
                            showToast("Failed to delete cover image: " + err.message, "error");
                        }
                    }
                });
            };

            const handleCoverUpload = (event) => {
                const file = event.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    alert('Please select an image file.');
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const dataUrl = e.target.result;
                    try {
                        await imageStore.saveImage(`cover_${story.id}`, dataUrl);
                        setLoadedImages(prev => ({ ...prev, cover: dataUrl }));
                        showToast("Cover image uploaded successfully!");
                        event.target.value = '';
                    } catch (err) {
                        alert("Failed to save uploaded cover image: " + err.message);
                    }
                };
                reader.onerror = () => {
                    alert("Failed to read the selected file.");
                };
                reader.readAsDataURL(file);
            };

            const generateBeatImage = async (seqIdx, sceneIdx, beatIdx) => {
                let seq = seqIdx, s = sceneIdx, b = beatIdx;
                if (b === undefined && typeof seq === 'number' && typeof s === 'number') {
                    b = s;
                    s = seq;
                    seq = selectedSequence !== null ? selectedSequence : 0;
                }
                if (seq === undefined || seq === null) seq = selectedSequence !== null ? selectedSequence : 0;
                if (s === undefined || s === null) s = selectedScene !== null ? selectedScene : 0;

                const sId = `${seq}-${s}`;
                const bId = `${sId}-${b}`;

                setLoadingImages(prev => ({ ...prev, [bId]: true }));
                try {
                    const scene = (story.scenes[`${seq}`] || [])[s];
                    const beats = story.beats[sId] || [];
                    const beat = beats[b];
                    if (!beat) throw new Error("Beat not found.");

                    const sceneCast = (scene.cast_ids || []).map(id => (story.cast || []).find(c => c.id === id)).filter(Boolean);
                    const castInfo = sceneCast.map(c => `- ${c.name}: ${c.role || 'No role details'}. Core Desire: ${c.core_desire || 'Unknown'}. Core Flaw: ${c.core_flaw || 'Unknown'}.`).join('\n');

                    const sysPrompt = `You are a visual design agent. Your task is to take a narrative beat description and details about the characters present in the scene, and create a highly detailed, evocative, and specific image generation prompt.
Focus on describing the visual scene: composition, characters (appearance, clothing, expression, posture), setting, lighting, and mood.
Do not use buzzwords like "photorealistic", "ultra realistic", "8k", etc. Instead, write descriptive sentences that imply high quality and style.
Avoid long-winded meta-explanations.

## Input Schema Definition
You will receive the following context blocks:
- SCENE CONTEXT: Title and description of the scene.
- CHARACTERS PRESENT IN SCENE: Details of characters present.
- NARRATIVE BEAT TO VISUALIZE: Description and emotional subtext of the beat.

Output ONLY the raw image generation prompt itself. Do not include any intro or wrap in JSON. Wrap prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

                    const userPrompt = `SCENE CONTEXT:
Title: ${scene.title}
Blueprint Summary:
${formatSceneSummary(scene) || scene.scene_events || scene.objective || ''}

CHARACTERS PRESENT IN SCENE:
${castInfo}

NARRATIVE BEAT TO VISUALIZE:
Description: ${beat.description}
Emotional Subtext: ${beat.emotional_shift || 'None'}

Please write a highly descriptive and specific image generation prompt focusing on the visual elements of this beat. Make it a single paragraph, rich in sensory details, character details, composition, and lighting. Do not include style-specific instructions, as a style will be appended later. Return ONLY the description.

BEGIN GENERATING IMAGE PROMPT`;

                    const promptBase = await callAI(userPrompt, sysPrompt, false, "Beat Image Prompt Agent", "dev");

                    const selectedStyleId = story.imageStyle || 'none';
                    const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                    const styleObj = combinedStyles.find(s => s.id === selectedStyleId);
                    const styleDescription = styleObj ? styleObj.description : "";
                    const finalPrompt = cleanImagePrompt(promptBase) + (styleDescription ? ", " + styleDescription : "");

                    const dataUrl = await callImageAPI(finalPrompt, "1:1");
                    await imageStore.saveImage(`beat_${story.id}_${sId}_${b}`, dataUrl);
                    setLoadedImages(prev => ({ ...prev, [bId]: dataUrl }));
                    showToast(`Beat ${b + 1} image generated successfully!`);
                } catch (err) {
                    console.error(err);
                    alert(`Beat Image Generation failed: ` + err.message);
                } finally {
                    setLoadingImages(prev => ({ ...prev, [bId]: false }));
                }
            };

            const deleteBeatImage = async (seqIdx, sceneIdx, beatIdx) => {
                let seq = seqIdx, s = sceneIdx, b = beatIdx;
                if (b === undefined && typeof seq === 'number' && typeof s === 'number') {
                    b = s;
                    s = seq;
                    seq = selectedSequence !== null ? selectedSequence : 0;
                }
                if (seq === undefined || seq === null) seq = selectedSequence !== null ? selectedSequence : 0;
                if (s === undefined || s === null) s = selectedScene !== null ? selectedScene : 0;
                requestConfirm({
                    title: `Remove Image for Beat ${b + 1}?`,
                    message: "Are you sure you want to remove this beat illustration?",
                    confirmLabel: "Remove Image",
                    danger: true,
                    onConfirm: async () => {
                        const sId = `${seq}-${s}`;
                        const bId = `${sId}-${b}`;
                        try {
                            await imageStore.deleteImage(`beat_${story.id}_${sId}_${b}`);
                            setLoadedImages(prev => {
                                const copy = { ...prev };
                                delete copy[bId];
                                return copy;
                            });
                            showToast(`Beat ${b + 1} image removed.`);
                        } catch (err) {
                            console.error(err);
                            showToast("Failed to delete beat image: " + err.message, "error");
                        }
                    }
                });
            };

            const generateSceneImage = async (seqIdx, sceneIdx) => {
                let seq = seqIdx !== undefined && seqIdx !== null ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                let s = sceneIdx !== undefined && sceneIdx !== null ? sceneIdx : (selectedScene !== null ? selectedScene : 0);
                const sId = `${seq}-${s}`;

                if (!story?.id) {
                    showToast("Please save your story project before generating illustrations.", "error");
                    return;
                }

                const sceneProse = story.prose?.[sId];
                const proseText = (sceneProse?.final || sceneProse?.draft || "").trim();
                if (!proseText) {
                    showToast("Scene narrative prose is required to generate an illustration. Draft or write the scene first.", "error");
                    return;
                }

                const sceneKey = `scene_${sId}`;
                setLoadingImages(prev => ({ ...prev, [sceneKey]: true }));

                try {
                    const scene = (story.scenes?.[`${seq}`] || [])[s];
                    const sceneTitle = scene?.title || `Scene ${s + 1}`;
                    const sceneDesc = scene ? (formatSceneSummary(scene) || "No description provided") : "No description provided";

                    const resolvedCast = scene ? getSceneActiveCast(scene, story) : [];
                    const sceneCast = resolvedCast.length > 0
                        ? resolvedCast
                        : (scene?.cast_ids || []).map(id => (story.cast || []).find(c => c.id === id)).filter(Boolean);
                    const castInfo = sceneCast.length > 0
                        ? sceneCast.map(c => `- ${c.name}: ${c.role || 'No role details'}. Visual traits: ${c.visual_description || c.appearance || 'Not specified'}.`).join('\n')
                        : "No specific cast defined for this scene.";

                    // Supply up to 3500 chars of narrative prose for rich visual grounding
                    const proseExcerpt = proseText.length > 3500 ? proseText.slice(0, 3500) + "..." : proseText;

                    const sysPrompt = `You are a master cinematic concept artist and visual design agent for publishing. Your task is to analyze the narrative prose of a scene, along with the scene setting and characters, and create a highly detailed, evocative, cinematic image generation prompt capturing the scene's key dramatic climax or most visually striking moment.
Focus on describing the visual scene: composition, camera angle, character positioning, facial expressions, attire, environment/setting, atmosphere, dramatic lighting, color palette, and mood.
Do not use buzzwords like "photorealistic", "ultra realistic", "8k", or "trending on artstation". Instead, write vivid descriptive sentences that establish cinematic texture, depth, and emotional gravity.
Avoid long-winded meta-explanations.

## Input Schema Definition
You will receive:
- SCENE CONTEXT: Title, sequence, and narrative purpose.
- CHARACTERS PRESENT: Cast details and visual traits.
- SCENE NARRATIVE PROSE: The actual prose text from the manuscript.

Output ONLY the raw image generation prompt itself. Wrap the prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

                    const userPrompt = `SCENE CONTEXT:
Title: ${sceneTitle}
Description: ${sceneDesc}

CHARACTERS IN SCENE:
${castInfo}

SCENE NARRATIVE PROSE:
${proseExcerpt}

Please craft a single, highly evocative and descriptive widescreen (16:9) cinematic concept art prompt that captures the dramatic peak and visual atmosphere of this scene. Focus on concrete visuals, environment details, character actions/expressions, and lighting. Do not include style-specific instructions as a global art style will be appended. Return ONLY the prompt wrapped in <response><image_prompt>...</image_prompt></response>.

BEGIN GENERATING IMAGE PROMPT`;

                    const promptBase = await callAI(userPrompt, sysPrompt, false, "Scene Image Prompt Agent", "dev");

                    const selectedStyleId = story.imageStyle || 'none';
                    const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                    const styleObj = combinedStyles.find(st => st.id === selectedStyleId);
                    const styleDescription = styleObj ? styleObj.description : "";
                    const finalPrompt = cleanImagePrompt(promptBase) + (styleDescription ? ", " + styleDescription : "");

                    const dataUrl = await callImageAPI(finalPrompt, "16:9");
                    await imageStore.saveImage(`scene_${story.id}_${sId}`, dataUrl);
                    setLoadedImages(prev => ({ ...prev, [sceneKey]: dataUrl }));
                    showToast(`${sceneTitle} illustration generated successfully!`);
                } catch (err) {
                    console.error(err);
                    alert(`Scene Illustration Generation failed: ` + err.message);
                } finally {
                    setLoadingImages(prev => ({ ...prev, [sceneKey]: false }));
                }
            };

            const deleteSceneImage = async (seqIdx, sceneIdx) => {
                let seq = seqIdx !== undefined && seqIdx !== null ? seqIdx : (selectedSequence !== null ? selectedSequence : 0);
                let s = sceneIdx !== undefined && sceneIdx !== null ? sceneIdx : (selectedScene !== null ? selectedScene : 0);
                const sId = `${seq}-${s}`;
                const sceneKey = `scene_${sId}`;

                requestConfirm({
                    title: "Remove Scene Illustration?",
                    message: "Are you sure you want to remove the illustration for this scene?",
                    confirmLabel: "Remove Illustration",
                    danger: true,
                    onConfirm: async () => {
                        try {
                            await imageStore.deleteImage(`scene_${story.id}_${sId}`);
                            setLoadedImages(prev => {
                                const copy = { ...prev };
                                delete copy[sceneKey];
                                return copy;
                            });
                            showToast("Scene illustration removed.");
                        } catch (err) {
                            console.error(err);
                            showToast("Failed to delete scene illustration: " + err.message, "error");
                        }
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

            // Note: mapLogNameToStepId is hoisted to top-level scope alongside PIPELINE_STEPS
            const callAI = async (prompt, systemPrompt, isJson = true, logName = "AI Task", modelRoleOrSize = "dev") => {
                if (typeof window.callAI === 'function' && window.callAI !== callAI) {
                    return await window.callAI(prompt, systemPrompt, isJson, logName, modelRoleOrSize);
                }
                return dispatchAI(
                    { prompt, systemPrompt, isJson, logName, modelRoleOrSize },
                    {
                        modelSettings: {
                            apiProvider, devProvider, devModel, reviewProvider, reviewModel,
                            proseProvider, proseModel, geminiModel, openRouterModel,
                            nanoGptModel, codexModel, koboldModel, koboldLoadedModel
                        },
                        thinkingSettings: {
                            enableThinkingAct, enableThinkingScene, enableThinkingWriting,
                            thinkingBudgetAct, thinkingBudgetStoryArc, thinkingBudgetScene, thinkingBudgetWriting
                        },
                        apiKey, openRouterKey, nanoGptKey, koboldUrl, codexUrl,
                        openRouterMaxTokens, apiTimeout,
                        activeStory: (typeof storyRef !== 'undefined' && storyRef?.current) ? storyRef.current : story
                    },
                    {
                        setCurrentPipelineStep,
                        setPromptLog,
                        showToast,
                        logPipelineDelay
                    }
                );
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

            const handleAutopilot = async (options = {}) => {
                if (continuousAutopilot) {
                    toggleContinuousAutopilot();
                    return;
                }
                if (importingLore) return;
                const isFromSetup = Boolean(options && options.fromSetup) || (viewRef.current === 'setup' && Boolean(inputConcept && inputConcept.trim()));
                const conceptToUse = isFromSetup
                    ? (inputConcept || "").trim()
                    : (storyRef.current?.concept || story?.concept || inputConcept);
                if (!conceptToUse) {
                    showToast("Please enter a story concept first!", "warning");
                    return;
                }

                requestConfirm({
                    title: "Activate Autonomous Autopilot?",
                    message: "Autopilot will autonomously generate your story bible, structure acts and sequences, weave scenes, and write novel prose continuously until complete or stopped.",
                    confirmLabel: "Start Autopilot",
                    danger: false,
                    onConfirm: async () => {
                        if (isFromSetup) {
                            const created = await createStoryEntityFromSetup({ navigateToOverview: true });
                            if (!created) return;
                        }
                        continuousAutopilotRef.current = true;
                        setContinuousAutopilot(true);
                    }
                });
            };

            // Parallelization prefetch helpers
            const prefetchScenesForSequence = (seqIdx, currentStory) => {
                if (apiProvider === 'koboldcpp' || apiProvider === 'codex') return;
                const key = `scenes:${seqIdx}`;
                if (prefetchCacheRef.current.has(key)) return;

                const prefetchPromise = (async () => {
                    try {
                        if (!continuousAutopilotRef.current) throw new Error("Autopilot stopped");
                        logPipelineDelay("Pipeline", 0, `[Prefetch] Starting scene generation for Sequence ${seqIdx + 1}`);
                        const updatedStory = await generateScenes(seqIdx, currentStory, true, true);
                        if (continuousAutopilotRef.current) {
                            logPipelineDelay("Pipeline", 0, `[Prefetch] Finished scene generation for Sequence ${seqIdx + 1}`);
                            return updatedStory;
                        }
                        throw new Error("Autopilot stopped");
                    } catch (err) {
                        console.warn(`[Prefetch] Scene generation failed for Sequence ${seqIdx + 1}:`, err);
                        return null;
                    }
                })();

                prefetchCacheRef.current.set(key, prefetchPromise);
            };

            const consumePrefetch = (key) => {
                if (prefetchCacheRef.current.has(key)) {
                    const data = prefetchCacheRef.current.get(key);
                    prefetchCacheRef.current.delete(key);
                    return data;
                }
                return null;
            };

            const runContinuousAutopilotStep = async () => {
                let currentStory = storyRef.current || story;
                const conceptToUse = currentStory?.concept || story?.concept || inputConcept;
                if (!conceptToUse) {
                    showToast("Please enter a story concept first!");
                    setContinuousAutopilot(false);
                    continuousAutopilotRef.current = false;
                    return false;
                }

                const isBibleInitialized = !!(
                    currentStory.status_quo ||
                    (currentStory.cast && currentStory.cast.length > 0) ||
                    currentStory.starting_value_state ||
                    (currentStory.acts && currentStory.acts.length > 0) ||
                    (currentStory.sequences && currentStory.sequences.length > 0)
                );

                // Check if story bible is initialized (only run if completely uninitialized)
                if (!isBibleInitialized) {
                    setLoadingStep("Autopilot: Initializing Story Bible...");
                    const initResult = await initStory(true, { existingStory: currentStory });
                    if (initResult) {
                        currentStory = initResult;
                        storyRef.current = initResult;
                    }
                    if (!continuousAutopilotRef.current) return false;
                    logPipelineDelay("Autopilot Cooldown", 2000, "Initialization cooldown delay before structuring acts and sequences");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return true;
                }

                // Check if Story Arc & Thematic Thesis are established before structuring acts and sequences
                if (!currentStory.core_thematic_argument) {
                    if (!isAutopilotProtectedView()) setView('dashboard');
                    setLoadingStep("Autopilot: Establishing Story Arc & Thematic Thesis...");
                    const arcStory = await generateStoryArc(currentStory, true);
                    if (arcStory && arcStory.core_thematic_argument) {
                        currentStory = arcStory;
                        storyRef.current = arcStory;
                    } else {
                        console.error("[Autopilot] Story Arc generation failed to yield core_thematic_argument.");
                        showToast("Autopilot paused: Story Arc could not be generated. Please run Story Arc Agent manually.", "error");
                        setContinuousAutopilot(false);
                        continuousAutopilotRef.current = false;
                        setLoading(false);
                        return false;
                    }
                    if (!continuousAutopilotRef.current) return false;
                    logPipelineDelay("Autopilot Cooldown", 2000, "Cooldown delay after generating story arc");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return true;
                }

                // Check if Acts and Sequences are structured
                if (!currentStory.sequences || currentStory.sequences.length === 0) {
                    if (!isAutopilotProtectedView()) setView('structure');
                    if (currentStory.acts && currentStory.acts.length >= 3) {
                        setLoadingStep("Autopilot: Weaving Sequences...");
                        currentStory = await generateSequences(currentStory, true);
                    } else {
                        setLoadingStep("Autopilot: Structuring Acts & Sequences...");
                        currentStory = await generateActsAndSequences(currentStory, true);
                    }
                    if (currentStory) storyRef.current = currentStory;
                    if (!continuousAutopilotRef.current) {
                        setLoading(false);
                        return false;
                    }
                    showToast("Acts & Sequences structured! Cooling down...");
                    logPipelineDelay("Autopilot Cooldown", 3000, "Inter-step delay after structuring acts and sequences");
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    setLoading(false);
                    return true;
                } else if (currentStory.sequences.length < 8) {
                    // Non-destructive padding: ensure all 8 Frank Daniel sequences exist without overwriting existing sequence progress
                    const prevSeqLen = currentStory.sequences.length;
                    currentStory = setStory(prev => ({
                        ...prev,
                        sequences: normalizeSequences(prev.sequences || currentStory.sequences)
                    }));
                    if (currentStory.id) {
                        await storyStore.saveStory(currentStory.id, currentStory);
                    }
                    showToast(`Restored full sequence framework (padded from ${prevSeqLen} to 8).`);
                }

                // Iterate sequences across the novel (0..7)
                for (let seqIdx = 0; seqIdx < currentStory.sequences.length; seqIdx++) {
                    if (!continuousAutopilotRef.current) return false;
                    currentStory = storyRef.current || currentStory;

                    const sequence = currentStory.sequences[seqIdx];
                    const scenes = (currentStory.scenes && (currentStory.scenes[`${seqIdx}`] || currentStory.scenes[seqIdx])) || [];
                    const activeThreadsCount = (currentStory.thread_statuses || []).filter(t => t && t.status !== 'resolved').length;
                    const pacingRanges = computePacingRanges(currentStory.target_word_count || 80000, seqIdx, activeThreadsCount);
                    const seqFloor = currentStory?.length_control?.sequences?.[seqIdx]?.floor
                        || (pacingRanges && pacingRanges.scenes_per_sequence && pacingRanges.scenes_per_sequence.min)
                        || (LENGTH_CONTROL.BOOK_TYPES[currentStory.book_type || 'popular']?.sceneFloor || 3);
                    const minRequiredScenes = seqFloor;
                    const hasProseForSequence = Object.keys(currentStory.prose || {}).some(k => (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) && currentStory.prose[k]);
                    const needsSceneWeaving = (!scenes || scenes.length === 0) || (scenes.length < minRequiredScenes && !hasProseForSequence);

                    // Gap 1: Scenes are not wove for this Sequence OR sequence is under-planned (< minRequiredScenes) and has no prose written yet
                    if (needsSceneWeaving) {
                        if (scenes && scenes.length > 0 && scenes.length < minRequiredScenes && !hasProseForSequence) {
                            console.log(`[Autopilot] Sequence ${seqIdx + 1} has only ${scenes.length} scenes (min ${minRequiredScenes} required). Re-weaving scenes for full novel length.`);
                            showToast(`Re-weaving Sequence ${seqIdx + 1} to meet novel-length scene count (${minRequiredScenes}+ scenes)...`, "info");
                        }
                        const prefetchKey = `scenes:${seqIdx}`;
                        if (prefetchCacheRef.current.has(prefetchKey)) {
                            const prefetchPromise = consumePrefetch(prefetchKey);
                            logPipelineDelay("Pipeline", 0, `[Prefetch HIT] Awaiting prefetched scenes for Sequence ${seqIdx + 1}`);
                            const resolvedStory = await prefetchPromise;
                            if (resolvedStory && resolvedStory.scenes && (resolvedStory.scenes[`${seqIdx}`] || resolvedStory.scenes[seqIdx])) {
                                currentStory = setStory(prev => {
                                    const cleanedBeats = { ...(prev.beats || {}) };
                                    const cleanedProse = { ...(prev.prose || {}) };
                                    Object.keys(cleanedBeats).forEach(k => {
                                        if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) delete cleanedBeats[k];
                                    });
                                    Object.keys(cleanedProse).forEach(k => {
                                        if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) delete cleanedProse[k];
                                    });
                                    const prefetchedLengthSeq = resolvedStory.length_control?.sequences?.[`${seqIdx}`] || resolvedStory.length_control?.sequences?.[seqIdx];
                                    const updatedLengthControl = prefetchedLengthSeq ? {
                                        ...(prev.length_control || {}),
                                        sequences: {
                                            ...((prev.length_control && prev.length_control.sequences) || {}),
                                            [`${seqIdx}`]: prefetchedLengthSeq
                                        }
                                    } : prev.length_control;

                                    const updated = {
                                        ...prev,
                                        ...(updatedLengthControl ? { length_control: updatedLengthControl } : {}),
                                        scenes: {
                                            ...(prev.scenes || {}),
                                            [`${seqIdx}`]: resolvedStory.scenes[`${seqIdx}`] || resolvedStory.scenes[seqIdx]
                                        },
                                        beats: cleanedBeats,
                                        prose: cleanedProse
                                    };
                                    if (updated.id) {
                                        storyStore.saveStory(updated.id, updated).catch(err => console.warn("Failed saving prefetch scenes to store:", err));
                                    }
                                    return updated;
                                });
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                setLoading(false);
                                return true;
                            }
                        }

                        if (!isAutopilotProtectedView()) {
                            setSelectedSequence(seqIdx);
                            setView('sequence_dashboard');
                        }
                        setLoadingStep(`Autopilot: Weaving scenes for Sequence ${seqIdx + 1} (${sequence.title})...`);
                        try {
                            currentStory = await generateScenes(seqIdx, storyRef.current || currentStory, true);
                        } catch (err) {
                            console.error("Autopilot scene generation error:", err);
                            showToast(`Autopilot scene planning failed for Sequence ${seqIdx + 1}: ${err.message}`, "error");
                            logPipelineError(`Autopilot Scene Planner (Sequence ${seqIdx + 1})`, err.message, err.stack);
                            setContinuousAutopilot(false);
                            continuousAutopilotRef.current = false;
                            setLoading(false);
                            return false;
                        }
                        if (!continuousAutopilotRef.current) {
                            setLoading(false);
                            return false;
                        }
                        showToast(`Sequence ${seqIdx + 1} scenes wove! Cooling down...`);
                        logPipelineDelay("Autopilot Cooldown", 3000, `Inter-step delay after weaving scenes for Sequence ${seqIdx + 1}`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        setLoading(false);
                        return true;
                    }

                    // Iterate scenes in this sequence (Streamlined 4-Phase Architecture)
                    for (let sceneIdx = 0; sceneIdx < ((currentStory.scenes && (currentStory.scenes[`${seqIdx}`] || currentStory.scenes[seqIdx])) || []).length; sceneIdx++) {
                        if (!continuousAutopilotRef.current) return false;
                        currentStory = storyRef.current || currentStory;

                        const scenes = (currentStory.scenes && (currentStory.scenes[`${seqIdx}`] || currentStory.scenes[seqIdx])) || [];
                        const scene = scenes[sceneIdx];
                        const sId = `${seqIdx}-${sceneIdx}`;

                        // Phase 4: Prose Generation via Agentic Writing Loop
                        const prose = currentStory.prose?.[sId];
                        let missingProse = !prose || (!prose.final && typeof prose !== 'string');

                        if (missingProse) {
                            if (!isAutopilotProtectedView()) {
                                setSelectedSequence(seqIdx);
                                setSelectedScene(sceneIdx);
                                setView('writer');
                            }

                            if (!continuousAutopilotRef.current) {
                                setLoading(false);
                                return false;
                            }

                            setLoading(true);
                            setLoadingStep(`Autopilot: Drafting prose for Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}...`);
                            try {
                                currentStory = await writeSceneProse(seqIdx, sceneIdx, storyRef.current || currentStory, true);
                            } catch (err) {
                                console.error("Autopilot scene prose error:", err);
                                showToast(`Autopilot paused at Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}: ${err.message}`, "error");
                                setContinuousAutopilot(false);
                                continuousAutopilotRef.current = false;
                                setLoading(false);
                                return false;
                            }

                            if (!currentStory) {
                                console.error("[Autopilot] writeSceneProse returned null or undefined story state.");
                                showToast(`Autopilot paused: invalid story state after Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}.`, "error");
                                setContinuousAutopilot(false);
                                continuousAutopilotRef.current = false;
                                setLoading(false);
                                return false;
                            }
                            currentStory = storyRef.current || currentStory;

                            // Prefetch scenes for next sequence if this is the last scene
                            if (sceneIdx === scenes.length - 1 && seqIdx + 1 < currentStory.sequences.length) {
                                const nextScenes = currentStory.scenes?.[`${seqIdx + 1}`] || currentStory.scenes?.[seqIdx + 1];
                                if (!nextScenes || nextScenes.length === 0) {
                                    prefetchScenesForSequence(seqIdx + 1, currentStory);
                                }
                            }

                            if (continuousAutopilotRef.current) {
                                showToast(`Scene ${sceneIdx + 1} completed! Taking a short breath...`);
                                logPipelineDelay("Autopilot Cooldown", 3000, `Inter-step delay after drafting prose for Scene ${sceneIdx + 1}`);
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                            setLoading(false);
                            return true;
                        }
                    }
                }

                // Guard against premature completion: must have all sequences
                if (!currentStory.sequences || currentStory.sequences.length < 8) {
                    console.warn("[Autopilot] Completion halted: sequences length is " + (currentStory.sequences?.length || 0));
                    setContinuousAutopilot(false);
                    continuousAutopilotRef.current = false;
                    setLoading(false);
                    showToast("Autopilot paused: Structure contains incomplete sequences. Please weave all sequences.", "warning");
                    return false;
                }

                // Tier 6.0: Autonomous Editorial Harness & 3-Wave Literary CI/CD Post-Drafting Pass
                if (enableEditorialHarnessAutopilot && !currentStory.editorial_harness?.autopilotCompleted) {
                    if (!continuousAutopilotRef.current) { setLoading(false); return false; }
                    setLoadingStep("Autopilot: Running Autonomous Editorial Harness & 3-Wave Literary CI/CD...");
                    showToast("All scenes drafted! Autopilot is now running the 5-Phase Autonomous Editorial Harness...", "info");
                    try {
                        await runAutonomousEditorialHarness({
                            mode: 'full_pipeline',
                            scopeSceneId: 'ALL',
                            useLLM: editorialUseDeepLLM,
                            storyOverride: currentStory,
                            isAutopilot: true
                        });
                    } catch (harnessErr) {
                        console.warn("[Autopilot] Editorial Harness pass encountered an error:", harnessErr);
                    }
                    setLoading(false);
                    return true;
                }

                // Done with all sequences, scenes, beats, prose, and editorial harness
                setContinuousAutopilot(false);
                continuousAutopilotRef.current = false;
                prefetchCacheRef.current.clear();
                setLoading(false);
                showToast("✨ Continuous Autopilot Complete! The entire novel has been woven, written, and verified by the Editorial Harness!");
                return false;
            };

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

            const saveModel = (modelToSave) => {
                const target = typeof modelToSave === 'string' ? modelToSave : (openRouterModel || geminiModel || nanoGptModel);
                if (target && typeof target === 'string' && !savedModels.includes(target.trim())) {
                    setSavedModels([...savedModels, target.trim()]);
                }
            };

            const deleteModel = (modelToDelete) => {
                setSavedModels(savedModels.filter(m => m !== modelToDelete));
            };

            const fetchGeminiModels = async () => {
                if (!apiKey) return;
                try {
                    const { models, imageModels } = await fetchGeminiCatalog(apiKey);
                    setGeminiModelsList(models);
                    if (imageModels.length > 0) {
                        setGeminiImageModelsList(imageModels);
                        safeSessionStorageSet("ellipsisprose_gemini_image_models_cache", imageModels);
                    }
                } catch (e) {
                    console.error("Error fetching Gemini models:", e);
                }
            };

            const fetchGeminiImageModels = async (showFeedback = false) => {
                const keyToUse = (imageApiKey || apiKey || '').trim();
                if (!keyToUse) {
                    if (showFeedback) showToast("Please configure your Gemini API Key first.", "info");
                    return [];
                }
                setIsFetchingImageModels(true);
                try {
                    const imgModels = await fetchGeminiImageModelsCatalog(keyToUse);
                    if (imgModels.length > 0) {
                        setGeminiImageModelsList(imgModels);
                        safeSessionStorageSet("ellipsisprose_gemini_image_models_cache", imgModels);
                        if (showFeedback) showToast(`Loaded ${imgModels.length} Gemini image models on the fly!`, "success");
                        return imgModels;
                    } else if (showFeedback) {
                        showToast("No dedicated image models found for this API key.", "info");
                    }
                } catch (err) {
                    console.error("Error fetching Gemini image models:", err);
                    if (showFeedback) showToast(`Failed to fetch image models: ${err.message}`, "error");
                } finally {
                    setIsFetchingImageModels(false);
                }
                return [];
            };

            const refreshOpenRouterModels = async (force = false) => {
                try {
                    const models = await fetchOpenRouterModels(openRouterKey);
                    if (models && models.length > 0) {
                        setOpenRouterModelsList(models);
                        safeSessionStorageSet("ellipsisprose_openrouter_models_cache", models);
                        try { localStorage.removeItem("ellipsisprose_openrouter_models_cache"); } catch (_) { }
                    }
                } catch (e) {
                    console.warn("Failed to fetch OpenRouter model catalog:", e);
                }
            };

            const refreshNanoGptModels = async (force = false) => {
                try {
                    const models = await fetchNanoGPTModels(nanoGptKey);
                    if (models && models.length > 0) {
                        setNanoGptModelsList(models);
                        safeSessionStorageSet("ellipsisprose_nanogpt_models_cache", models);
                        try { localStorage.removeItem("ellipsisprose_nanogpt_models_cache"); } catch (_) { }
                    }
                } catch (e) {
                    console.warn("Failed to fetch nano-GPT model catalog:", e);
                }
            };

            const checkKoboldStatus = async () => {
                setKoboldStatus('checking');
                setKoboldError(null);
                try {
                    const res = await checkKoboldCPPStatus(koboldUrl);
                    if (res.online) {
                        setKoboldStatus('connected');
                        const mName = res.model || "KoboldCPP Loaded Model";
                        setKoboldLoadedModel(mName);
                        setKoboldModel(mName);
                        window.koboldLoadedModelGlobal = mName;
                    } else {
                        setKoboldStatus('offline');
                        setKoboldError(res.error || "Connection Refused / Server Offline");
                    }
                } catch (err) {
                    setKoboldStatus('offline');
                    setKoboldError(err.message || "Failed to connect to KoboldCPP");
                }
            };

            const refreshCodexModels = async () => {
                const refreshId = ++codexRefreshId.current;
                setCodexStatus({ online: false, model: null, error: null });
                setCodexEmbeddingStatus(null);
                setCodexModelsList([]);
                const result = await fetchCodexCatalog(codexUrl);
                if (refreshId !== codexRefreshId.current) return;
                setCodexEmbeddingStatus(result.embeddingStatus);
                setCodexModelsList(result.models);
                setCodexStatus(result.status);
            };

            const refreshComfyInfo = async () => {
                const refreshId = ++comfyRefreshId.current;
                setComfyStatus({ online: false, version: '', device: '', error: 'Checking ComfyUI...' });
                setComfyOptions({ unet: [], clip: [], vae: [], lora: [], sampler: [], scheduler: [] });
                const result = await fetchComfyInfoCatalog(comfyUrl);
                if (refreshId !== comfyRefreshId.current) return;
                if (result.status.online) {
                    setComfyOptions(result.options);
                    if (result.defaults.unet) setComfyUnet(value => value || result.defaults.unet);
                    if (result.defaults.clip) setComfyClip(value => value || result.defaults.clip);
                    if (result.defaults.vae) setComfyVae(value => value || result.defaults.vae);
                }
                setComfyStatus(result.status);
            };

            const handleCatalogRefresh = async (targetProvider = null) => {
                const prov = targetProvider || devProvider || apiProvider;
                if (prov === 'gemini') {
                    await fetchGeminiModels();
                    await fetchGeminiImageModels(false);
                } else if (prov === 'openrouter') {
                    await refreshOpenRouterModels(true);
                } else if (prov === 'nanogpt') {
                    await refreshNanoGptModels(true);
                } else if (prov === 'codex') {
                    await refreshCodexModels();
                } else if (prov === 'koboldcpp') {
                    await checkKoboldStatus();
                }
            };

            // Trigger catalog fetch when entering settings or changing provider/key
            useEffect(() => {
                if (view === 'settings') {
                    const activeProviders = new Set([
                        devProvider || apiProvider,
                        reviewProvider || devProvider || apiProvider,
                        proseProvider || devProvider || apiProvider,
                        embeddingProvider
                    ]);
                    if (activeProviders.has('gemini') && apiKey && geminiModelsList.length === 0) {
                        fetchGeminiModels();
                    }
                    if (imageProvider === 'gemini' && (imageApiKey || apiKey) && geminiImageModelsList.length === 0) {
                        fetchGeminiImageModels(false);
                    }
                    if (activeProviders.has('openrouter') && openRouterModelsList.length === 0) {
                        refreshOpenRouterModels();
                    }
                    if (activeProviders.has('nanogpt') && nanoGptModelsList.length === 0) {
                        refreshNanoGptModels();
                    }
                    if (activeProviders.has('koboldcpp')) {
                        checkKoboldStatus();
                    }
                    if (activeProviders.has('codex') || embeddingProvider === 'codex') refreshCodexModels();
                    if (imageProvider === 'comfyui') refreshComfyInfo();
                }
                return () => { codexRefreshId.current++; comfyRefreshId.current++; };
            }, [view, devProvider, reviewProvider, proseProvider, apiProvider, embeddingProvider, apiKey, imageApiKey, openRouterKey, nanoGptKey, koboldUrl, codexUrl, imageProvider, comfyUrl]);

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
