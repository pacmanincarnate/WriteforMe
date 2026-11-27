/**
 * @module views/settings/types
 * Shared TypeScript interfaces for the Studio & LLM Settings view (`view === 'settings'`).
 */

import type React from 'react';
import type { SearchableModelEntry } from '@/components';
import type { AudioDramaSettings } from '@/config';
import type { StoryResetStageKey } from '@/domain/lifecycle';
import type { ComfyOptionsCatalog, ComfyStatusInfo } from '@/services/images';
import type {
    CodexModelInfo,
    GeminiImageModelInfo,
    OpenRouterImageModelInfo
} from '@/services/llm';
import type { CastMember, SlopConfig, SlopSeverity, Story } from '@/types';

export interface SettingsCustomMode {
    id: string;
    context?: string;
    prompt?: string;
    icon?: string;
    [key: string]: unknown;
}

export interface SettingsCustomImageStyle {
    id: string;
    name: string;
    description: string;
}

export interface SettingsCastMember extends CastMember {
    interview_psychology?: string;
    deep_profile?: string;
    canonical_interview_voice?: string;
    user_edited_reference_text?: boolean;
}

export interface SettingsStory extends Story {
    imageStyle?: string;
    narrator_vocal_cadence?: string;
    narrator_voice_seed?: number;
    narrator_reference_text?: string;
    user_edited?: Record<string, boolean | undefined>;
}

export interface SettingsCodexStatus {
    online?: boolean;
    model?: string | null;
    error?: string | null;
}

export interface SettingsCodexEmbeddingStatus {
    available?: boolean;
    model?: string;
    [key: string]: unknown;
}

export interface SettingsEffectiveModelConfig {
    provider: string;
    model: string;
}

export interface SettingsConfirmRequest {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
}

export type SettingsShowToastFn = (message: string, type?: string) => void;

export interface SettingsModelsTabProps {
    devProvider: string;
    setDevProvider: (provider: string) => void;
    setApiProvider: (provider: string) => void;
    devModel: string;
    setDevModel: (model: string) => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    geminiModel: string;
    setGeminiModel: (model: string) => void;
    openRouterKey: string;
    setOpenRouterKey: (key: string) => void;
    openRouterModel: string;
    setOpenRouterModel: (model: string) => void;
    openRouterMaxTokens: number;
    setOpenRouterMaxTokens: (tokens: number) => void;
    nanoGptKey: string;
    setNanoGptKey: (key: string) => void;
    nanoGptModel: string;
    setNanoGptModel: (model: string) => void;
    koboldUrl: string;
    setKoboldUrl: (url: string) => void;
    koboldModel: string;
    setKoboldModel: (model: string) => void;
    koboldStatus: string;
    koboldError: string | null;
    koboldLoadedModel: string;
    codexUrl: string;
    setCodexUrl: (url: string) => void;
    codexModel: string;
    setCodexModel: (model: string) => void;
    codexModelsList: CodexModelInfo[];
    codexStatus: SettingsCodexStatus;
    codexEmbeddingStatus: SettingsCodexEmbeddingStatus | null;
    refreshCodexModels: () => void | Promise<void>;
    claudeUrl: string;
    setClaudeUrl: (url: string) => void;
    claudeModel: string;
    setClaudeModel: (model: string) => void;
    claudeModelsList: CodexModelInfo[];
    claudeStatus: SettingsCodexStatus;
    refreshClaudeModels: () => void | Promise<void>;
    showOtherApiKeys: boolean;
    setShowOtherApiKeys: React.Dispatch<React.SetStateAction<boolean>>;
    savedModels: string[];
    saveModel: (modelId: string) => void;
    deleteModel: (modelId: string) => void;
    modelSearchQuery: string;
    setModelSearchQuery: (query: string) => void;
    isSearchingModels: boolean;
    searchResults: SearchableModelEntry[];
    isModelDropdownOpen: boolean;
    setIsModelDropdownOpen: (open: boolean) => void;
    showAdvancedModelRouting: boolean;
    setShowAdvancedModelRouting: React.Dispatch<React.SetStateAction<boolean>>;
    getEffectiveModelConfig: (role: 'review' | 'prose' | string) => SettingsEffectiveModelConfig;
    reviewProvider: string;
    setReviewProvider: (provider: string) => void;
    reviewModel: string;
    setReviewModel: (model: string) => void;
    reviewModelSearchQuery: string;
    setReviewModelSearchQuery: (query: string) => void;
    isSearchingReviewModels: boolean;
    reviewSearchResults: SearchableModelEntry[];
    isReviewModelDropdownOpen: boolean;
    setIsReviewModelDropdownOpen: (open: boolean) => void;
    proseProvider: string;
    setProseProvider: (provider: string) => void;
    proseModel: string;
    setProseModel: (model: string) => void;
    proseModelSearchQuery: string;
    setProseModelSearchQuery: (query: string) => void;
    isSearchingProseModels: boolean;
    proseSearchResults: SearchableModelEntry[];
    isProseModelDropdownOpen: boolean;
    setIsProseModelDropdownOpen: (open: boolean) => void;
    handleCatalogRefresh: (provider: string) => void | Promise<void>;
    embeddingProvider: string;
    setEmbeddingProvider: (provider: string) => void;
    apiTimeout: number;
    setApiTimeout: (timeoutSec: number) => void;
    imageProvider: string;
    setImageProvider: (provider: string) => void;
    imageModel: string;
    setImageModel: (model: string) => void;
    imageApiKey: string;
    setImageApiKey: (key: string) => void;
    geminiImageModelsList: GeminiImageModelInfo[];
    fetchGeminiImageModels: (force?: boolean) => void | Promise<void>;
    openRouterImageModelsList: OpenRouterImageModelInfo[];
    fetchOpenRouterImageModels: (force?: boolean) => void | Promise<unknown>;
    isFetchingImageModels: boolean;
    comfyUrl: string;
    setComfyUrl: (url: string) => void;
    comfyRefreshId: React.MutableRefObject<number>;
    comfyStatus: ComfyStatusInfo;
    comfyOptions: ComfyOptionsCatalog;
    refreshComfyInfo: (opts?: { startIfNeeded?: boolean }) => void | Promise<void>;
    comfyUnet: string;
    setComfyUnet: (unet: string) => void;
    comfyClip: string;
    setComfyClip: (clip: string) => void;
    comfyVae: string;
    setComfyVae: (vae: string) => void;
    comfyLora: string;
    setComfyLora: (lora: string) => void;
    comfySampler: string;
    setComfySampler: (sampler: string) => void;
    comfyScheduler: string;
    setComfyScheduler: (scheduler: string) => void;
    comfyLoraStrength: number;
    setComfyLoraStrength: (strength: number) => void;
    comfySteps: number;
    setComfySteps: (steps: number) => void;
    comfyCfg: number;
    setComfyCfg: (cfg: number) => void;
    comfyTimeoutSec: number;
    setComfyTimeoutSec: (sec: number) => void;
    setSettingsTab: (tab: string) => void;
}

export interface SettingsPipelineTabProps {
    enableMcpBridge: boolean;
    setEnableMcpBridge: (enabled: boolean) => void;
    isMcpConnected: boolean;
    setMcpRetryTrigger: React.Dispatch<React.SetStateAction<number>>;
    enableReview: boolean;
    setEnableReview: (enabled: boolean) => void;
    enableStylePolish: boolean;
    setEnableStylePolish: (enabled: boolean) => void;
    enableAudioDramaDirectionPass: boolean;
    setEnableAudioDramaDirectionPass: (enabled: boolean) => void;
    enableEditorialHarnessAutopilot: boolean;
    setEnableEditorialHarnessAutopilot: (enabled: boolean) => void;
    thinkingBudgetStoryArc: number;
    setThinkingBudgetStoryArc: (budget: number) => void;
    thinkingBudgetAct: number;
    setThinkingBudgetAct: (budget: number) => void;
    setEnableThinkingAct: (enabled: boolean) => void;
    thinkingBudgetScene: number;
    setThinkingBudgetScene: (budget: number) => void;
    setEnableThinkingScene: (enabled: boolean) => void;
    thinkingBudgetWriting: number;
    setThinkingBudgetWriting: (budget: number) => void;
    setEnableThinkingWriting: (enabled: boolean) => void;
    enableNarrativeLenses: boolean;
    setEnableNarrativeLenses: (enabled: boolean) => void;
    customModes: Record<string, SettingsCustomMode>;
    editingModeId: string | null;
    newModeId: string;
    setNewModeId: (id: string) => void;
    newModeContext: string;
    setNewModeContext: (context: string) => void;
    newModeIcon: string;
    newModePrompt: string;
    setNewModePrompt: (prompt: string) => void;
    setIsIconPickerOpen: (open: boolean) => void;
    handleStartEditCustomMode: (mode: SettingsCustomMode) => void;
    handleDeleteCustomMode: (modeId: string) => void;
    handleSaveCustomMode: () => void;
    handleCancelEditCustomMode: () => void;
    slopConfig: SlopConfig;
    setSlopConfig: React.Dispatch<React.SetStateAction<SlopConfig>>;
    bannedPhrases: string[];
    slopSearchQuery: string;
    setSlopSearchQuery: (query: string) => void;
    expandedSlopGroups: Record<string, boolean>;
    setExpandedSlopGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    expandedSlopCategories: Record<string, boolean>;
    setExpandedSlopCategories: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    newBannedPhraseInput: string;
    setNewBannedPhraseInput: (val: string) => void;
    newCategoryItemInputs: Record<string, string>;
    setNewCategoryItemInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    handleSetSlopCategorySeverity: (categoryId: string, severity: SlopSeverity) => void;
    handleAddBannedPhrase: () => void;
    handleAddSlopCategoryItem: (categoryId: string, item?: string) => void;
    handleRemoveSlopCategoryItem: (categoryId: string, item: string) => void;
    handleImportSlopJson: (file: File) => void | Promise<void>;
    handleExportSlopJson: () => void;
    handleResetSlopConfig: () => void;
    requestConfirm: (req: SettingsConfirmRequest) => void;
    showToast: SettingsShowToastFn;
}

export interface SettingsAudioDramaTabProps {
    story: SettingsStory;
    apiKey: string;
    openRouterKey: string;
    audioDramaSettings: AudioDramaSettings;
    updateAudioDramaSetting: <K extends keyof AudioDramaSettings>(
        key: K,
        value: AudioDramaSettings[K]
    ) => void;
    ttsActiveDevice: string;
    isAuditioningVoice: boolean;
    isAnyAudioPlaying: boolean;
    stopAllAudioPlayback: () => void;
    testAuditionCharacterVoice: (
        target: SettingsCastMember | string,
        opts?: { forceRecalibrate?: boolean }
    ) => void | Promise<void>;
    handleResetAllVoiceAndAudioCaches: () => void | Promise<void>;
    handleEditNarratorSeed: () => void;
    handleRerollNarratorSeed: () => void;
    handleEditNarratorVoiceProfile: () => void;
    handleEditNarratorReferenceText: () => void;
    handleResetNarratorReferenceText: () => void;
    handleEditCharacterSeed: (char: SettingsCastMember) => void;
    handleRerollCharacterSeed: (char: SettingsCastMember) => void;
    handleEditCharacterVoiceProfile: (char: SettingsCastMember) => void;
    handleEditCharacterReferenceText: (char: SettingsCastMember) => void;
    handleResetCharacterReferenceText: (char: SettingsCastMember) => void;
    showToast: SettingsShowToastFn;
}

export interface SettingsAppearanceTabProps {
    theme: string;
    setTheme: (theme: string) => void;
    story: SettingsStory;
    setStory: React.Dispatch<React.SetStateAction<SettingsStory>>;
    customImageStyles: SettingsCustomImageStyle[];
    setCustomImageStyles: (styles: SettingsCustomImageStyle[]) => void;
    newStyleName: string;
    setNewStyleName: (name: string) => void;
    newStyleDesc: string;
    setNewStyleDesc: (desc: string) => void;
    showToast: SettingsShowToastFn;
}

export interface SettingsDangerTabProps {
    story: SettingsStory;
    availableSceneAudioMap: Record<string, unknown>;
    loading: boolean;
    handleExport: () => void;
    handleResetStoryStage: (stage: StoryResetStageKey) => void | Promise<void>;
    handleDeleteStory: () => void | Promise<void>;
}

export interface SettingsViewProps
    extends SettingsModelsTabProps,
        SettingsPipelineTabProps,
        SettingsAudioDramaTabProps,
        SettingsAppearanceTabProps,
        SettingsDangerTabProps {
    view: string;
    settingsTab: string;
}
