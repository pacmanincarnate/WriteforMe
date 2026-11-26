/**
 * @module compat/testApi
 * The `window.*` names that code OUTSIDE `src/` depends on. This is the whole public contract:
 * `src/windowApi.ts` publishes the module-level names and the app shell publishes its handles.
 * These names must keep resolving or the Verification Gate (tests/e2e/golden_suite.mjs) and
 * external tooling break.
 *
 * `tests/unit/test-api-contract.test.ts` keeps this file honest in both directions: the golden
 * suite may not use a global that is not listed here, and every listed name must still be
 * provided by the app.
 */

/** Pure functions, constants and service singletons published at module load. */
export const TEST_API_MODULE_GLOBALS = [
    'PROMPTS',
    'analyzeAudioDramaExpressiveness',
    'applyCascadingNameReplacements',
    'applySurgicalEditsDetailed',
    'auditEntityNamesAndPlaces',
    'buildEstimatedCueTimeline',
    'buildProseContext',
    'buildRolledBackStoryState',
    'commitEpistemicSceneDeltas',
    'compileActiveState',
    'compileAestheticConstitution',
    'compileNarrativeStateGraph',
    'computeSceneVoiceSignatureHash',
    'computeSceneWordTarget',
    'computeSequenceLengthPlan',
    'countBannedPhrases',
    'decodeXmlEntities',
    'encodeFloat32PcmToMp3Blob',
    'ensureEpistemicGraph',
    'ensureJSZip',
    'escapeXml',
    'evaluateSceneLayer0AndDivergence',
    'extractAllTags',
    'extractDocumentText',
    'extractReviewStatus',
    'extractTag',
    'formatContinuityLedgerForPrompt',
    'formatReaderProse',
    'getDeterministicVoiceSeed',
    'getVoiceDescriptionForCharacter',
    'logStore',
    'normalizeAudioDramaScriptWithReport',
    'normalizeSceneToXml',
    'normalizeSlopConfig',
    'parseAudioDramaScript',
    'partitionLoreIntoSemanticSections',
    'runFullManuscriptNlpTelemetry',
    'runSceneNlpTelemetry',
    'safeJsonStringify',
    'scanTextForSlop',
    'searchLoreLexical',
    'splitTextIntoBoundaryAwareChunks',
    'storyStore',
    'validateStructuralOutput'
] as const;

/**
 * Handles into the running app, published by the app shell (`src/App.tsx`, through
 * `publishAppGlobal`) while it renders, or by the hooks that own them.
 */
export const TEST_API_APP_GLOBALS = [
    'distillLore',
    'handleAddScene',
    'handleImport',
    'handleMoveScene',
    'handleResetStoryStage',
    'setStory',
    'setView',
    'storyRef',
    'toggleContinuousAutopilot',
    'updateSceneBlueprint'
] as const;

/** Contracts with tools that live outside the bundle. */
export const EXTERNAL_CONTRACT_GLOBALS = [
    /** Automation surface used by `mcp-server/` (over WebSocket), DevTools and the golden suite. */
    'EllipsisProseBridge',
    /** Read by `pipeline/aiDispatch` to replace the LLM call; installed by tests, never by the app. */
    '__callAIOverride'
] as const;

export type TestApiModuleGlobal = (typeof TEST_API_MODULE_GLOBALS)[number];
export type TestApiAppGlobal = (typeof TEST_API_APP_GLOBALS)[number];
export type ExternalContractGlobal = (typeof EXTERNAL_CONTRACT_GLOBALS)[number];

/** Every `window.*` name the app must provide (or honour) for code outside `src/`. */
export const PUBLIC_WINDOW_CONTRACT: readonly string[] = [
    ...TEST_API_MODULE_GLOBALS,
    ...TEST_API_APP_GLOBALS,
    ...EXTERNAL_CONTRACT_GLOBALS
];
