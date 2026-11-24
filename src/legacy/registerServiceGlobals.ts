import { registerWindowGlobals } from '@/compat/windowBridge';
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
import { fetchWithTimeout } from '@/services/http';
import { EmbeddingService, VectorStore } from '@/services/rag';
import {
    audioStore,
    AudioStore,
    DISK_SETTINGS_API_KEY_NAMES,
    DISK_SETTINGS_EXCLUDED_KEYS,
    diskSettingsVault,
    getVaultAvailabilityState,
    imageStore,
    ImageStore,
    isLocalStorageVaultAvailable,
    isPersistableSettingsKey,
    isQuotaExceededIdbError,
    isRecoverableIdbConnectionError,
    logStore,
    LogStore,
    markLocalVaultUnavailable,
    probeLocalVaultAvailability,
    ResilientIdbStore,
    storyStore,
    StoryStore,
    studioCacheStore,
    StudioCacheStore,
    toAsciiHeaderJson
} from '@/services/storage';

registerWindowGlobals({
    // HTTP
    fetchWithTimeout,

    // Browser utilities & cover fonts
    isMobileDevice,
    getDeviceCapabilityTier,
    getBestTtsDevice,
    downloadBlob,
    downloadVerboseLogFile,
    copyVerboseLogToClipboard,
    ensureCoverFontsLoaded,

    // Document loaders & extractors
    yieldToMain,
    ensureJSZip,
    ensureMammoth,
    ensurePdfJs,
    ensureLameJs,
    convertHtmlToMarkdown,
    extractTextFromDocx,
    extractTextFromPdf,
    extractTextFromEpub,
    extractTextFromJson,
    extractTextFromCsv,
    extractTextFromPlainText,
    extractTextFromFile,
    extractDocumentText,

    // Storage vault, IDB stores & settings sync
    isLocalStorageVaultAvailable,
    probeLocalVaultAvailability,
    markLocalVaultUnavailable,
    getVaultAvailabilityState,
    isRecoverableIdbConnectionError,
    isQuotaExceededIdbError,
    ResilientIdbStore,
    DISK_SETTINGS_EXCLUDED_KEYS,
    DISK_SETTINGS_API_KEY_NAMES,
    isPersistableSettingsKey,
    diskSettingsVault,
    StudioCacheStore,
    studioCacheStore,
    toAsciiHeaderJson,
    ImageStore,
    imageStore,
    StoryStore,
    storyStore,
    LogStore,
    logStore,
    AudioStore,
    audioStore,

    // RAG embedding & vector store
    EmbeddingService,
    VectorStore
});
