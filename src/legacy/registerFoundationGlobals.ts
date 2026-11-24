import { registerWindowGlobals } from '@/compat/windowBridge';
import {
    countBannedPhrases,
    decodeXmlEntities,
    escapeXml,
    extractAllTags,
    extractTag,
    extractTagAttribute,
    extractTagList,
    formatObjectToXml,
    formatReaderProse,
    isSerializationPlaceholder,
    normalizeMarkdownIndentation,
    safeJsonStringify,
    stripXmlTags
} from '@/utils';
import {
    NARRATIVE_MODES,
    PIPELINE_STEP_SPEC,
    STRUCTURAL_MODALITIES,
    VIEW_LABELS,
    formatModalityHand,
    getPipelineStepInfo,
    inferNarrativeModeForScene,
    mapLogNameToStepId
} from '@/config';
import { AUDIO_DRAMA_SYNTAX_CONTRACT_CARD, PROMPTS } from '@/prompts';
import {
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    FALLBACK_GROUNDED_NAMES,
    FALLBACK_GROUNDED_PLACES,
    applyCascadingNameReplacements,
    auditEntityNamesAndPlaces,
    buildEffectiveSlopData,
    buildStoryGrandfatherSet,
    exportSlopConfigAsJson,
    extractCandidatePlaceNames,
    formatSlopAuditForPrompt,
    normalizeSlopConfig,
    scanTextForSlop,
    validateImportedSlopJson
} from '@/domain/slop';

registerWindowGlobals({
    // Utils
    countBannedPhrases,
    safeJsonStringify,
    isSerializationPlaceholder,
    normalizeMarkdownIndentation,
    formatReaderProse,
    escapeXml,
    decodeXmlEntities,
    extractTag,
    extractTagAttribute,
    extractAllTags,
    extractTagList,
    formatObjectToXml,
    stripXmlTags,

    // Config
    NARRATIVE_MODES,
    inferNarrativeModeForScene,
    STRUCTURAL_MODALITIES,
    formatModalityHand,
    VIEW_LABELS,
    PIPELINE_STEP_SPEC,
    mapLogNameToStepId,
    getPipelineStepInfo,

    // Prompts
    AUDIO_DRAMA_SYNTAX_CONTRACT_CARD,
    PROMPTS,

    // Slop & Name Audit Engine
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    FALLBACK_GROUNDED_NAMES,
    FALLBACK_GROUNDED_PLACES,
    normalizeSlopConfig,
    validateImportedSlopJson,
    buildEffectiveSlopData,
    exportSlopConfigAsJson,
    buildStoryGrandfatherSet,
    scanTextForSlop,
    formatSlopAuditForPrompt,
    extractCandidatePlaceNames,
    auditEntityNamesAndPlaces,
    applyCascadingNameReplacements
});
