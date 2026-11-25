export {
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    FALLBACK_GROUNDED_NAMES,
    FALLBACK_GROUNDED_PLACES
} from './registry';
export {
    normalizeSlopConfig,
    validateImportedSlopJson,
    buildEffectiveSlopData,
    exportSlopConfigAsJson,
    buildStoryGrandfatherSet
} from './config';
export {
    scanTextForSlop,
    formatSlopAuditForPrompt
} from './scanner';
export {
    extractCandidatePlaceNames,
    auditEntityNamesAndPlaces,
    applyCascadingNameReplacements
} from './nameAudit';
export {
    isSlopSeverity,
    setSlopCategorySeverity,
    addCustomSlopPhrase,
    addSlopCategoryItem,
    removeSlopCategoryItem,
    withImportedSlopPack,
    addStoryAllowlistTerm,
    removeStoryAllowlistTerm,
    type SlopAllowlistStory
} from './configEditing';
