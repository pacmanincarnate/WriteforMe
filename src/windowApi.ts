/**
 * @module windowApi
 * Publishes the documented `window.*` contract (`src/compat/testApi.ts`): the pure functions,
 * constants and service singletons that the Verification Gate and external tooling call by name.
 * Nothing in `src/` reads these from `window`; modules import each other directly.
 *
 * To expose another name, add it to `TEST_API_MODULE_GLOBALS` first. The `satisfies` clause below
 * then fails to compile until the name is provided here, and
 * `tests/unit/test-api-contract.test.ts` fails if the golden suite uses a name that is not listed.
 */
import { registerWindowGlobals } from '@/compat/windowBridge';
import type { TestApiModuleGlobal } from '@/compat/testApi';
import {
    analyzeAudioDramaExpressiveness,
    buildEstimatedCueTimeline,
    computeSceneVoiceSignatureHash,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    normalizeAudioDramaScriptWithReport,
    parseAudioDramaScript
} from '@/domain/audio';
import {
    commitEpistemicSceneDeltas,
    compileActiveState,
    ensureEpistemicGraph,
    formatContinuityLedgerForPrompt
} from '@/domain/continuity';
import {
    applySurgicalEditsDetailed
} from '@/domain/editing';
import {
    compileAestheticConstitution,
    compileNarrativeStateGraph,
    evaluateSceneLayer0AndDivergence,
    normalizeSceneToXml,
    runFullManuscriptNlpTelemetry,
    runSceneNlpTelemetry
} from '@/domain/editorial';
import {
    buildRolledBackStoryState
} from '@/domain/lifecycle';
import {
    partitionLoreIntoSemanticSections,
    splitTextIntoBoundaryAwareChunks
} from '@/domain/lore';
import {
    applyCascadingNameReplacements,
    auditEntityNamesAndPlaces,
    normalizeSlopConfig,
    scanTextForSlop
} from '@/domain/slop';
import {
    computeSceneWordTarget,
    computeSequenceLengthPlan
} from '@/domain/story';
import {
    extractReviewStatus,
    validateStructuralOutput
} from '@/domain/validation';
import {
    buildProseContext
} from '@/pipeline';
import {
    PROMPTS
} from '@/prompts';
import {
    encodeFloat32PcmToMp3Blob
} from '@/services/audio';
import {
    ensureJSZip,
    extractDocumentText
} from '@/services/documents';
import {
    searchLoreLexical
} from '@/services/rag';
import {
    logStore,
    storyStore
} from '@/services/storage';
import {
    countBannedPhrases,
    decodeXmlEntities,
    escapeXml,
    extractAllTags,
    extractTag,
    formatReaderProse,
    safeJsonStringify
} from '@/utils';

const publicApi = {
    PROMPTS,
    analyzeAudioDramaExpressiveness,
    applyCascadingNameReplacements,
    applySurgicalEditsDetailed,
    auditEntityNamesAndPlaces,
    buildEstimatedCueTimeline,
    buildProseContext,
    buildRolledBackStoryState,
    commitEpistemicSceneDeltas,
    compileActiveState,
    compileAestheticConstitution,
    compileNarrativeStateGraph,
    computeSceneVoiceSignatureHash,
    computeSceneWordTarget,
    computeSequenceLengthPlan,
    countBannedPhrases,
    decodeXmlEntities,
    encodeFloat32PcmToMp3Blob,
    ensureEpistemicGraph,
    ensureJSZip,
    escapeXml,
    evaluateSceneLayer0AndDivergence,
    extractAllTags,
    extractDocumentText,
    extractReviewStatus,
    extractTag,
    formatContinuityLedgerForPrompt,
    formatReaderProse,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    logStore,
    normalizeAudioDramaScriptWithReport,
    normalizeSceneToXml,
    normalizeSlopConfig,
    parseAudioDramaScript,
    partitionLoreIntoSemanticSections,
    runFullManuscriptNlpTelemetry,
    runSceneNlpTelemetry,
    safeJsonStringify,
    scanTextForSlop,
    searchLoreLexical,
    splitTextIntoBoundaryAwareChunks,
    storyStore,
    validateStructuralOutput
} satisfies Record<TestApiModuleGlobal, unknown>;

registerWindowGlobals(publicApi);
