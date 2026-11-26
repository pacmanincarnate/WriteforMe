import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_AUDIO_DRAMA_SETTINGS, type AudioDramaSettings } from '@/config';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';
import { SettingsView, type SettingsStory } from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

function findButton(text: string): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(text)
    );
    if (!btn) {
        throw new Error(`Button containing "${text}" not found`);
    }
    return btn;
}

describe('Phase 5G: SettingsView across all 5 tabs', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
    });

    it('switches all 5 tabs and drives Models, Pipeline, Audio Drama, Appearance, and Danger actions', () => {
        const setApiKey = vi.fn();
        const setImageProvider = vi.fn();
        const setEnableReview = vi.fn();
        const setEnableMcpBridge = vi.fn();
        const handleAddBannedPhrase = vi.fn();
        const updateAudioDramaSetting = vi.fn();
        const testAuditionCharacterVoice = vi.fn();
        const handleRerollCharacterSeed = vi.fn();
        const setTheme = vi.fn();
        const handleExport = vi.fn();
        const handleDeleteStory = vi.fn();

        const sampleStory: SettingsStory = {
            id: 'story_settings_1',
            title: 'The Salt Observatory',
            cast: [
                {
                    id: 'char_1',
                    name: 'Nora Vale',
                    role: 'Protagonist',
                    vocal_cadence: 'Measured, crisp sea-air alto'
                }
            ]
        };

        const SettingsHarness: React.FC = () => {
            const [tab, setTab] = useState<string>('models');
            const [showRouting, setShowRouting] = useState<boolean>(false);
            const [slopConfig, setSlopConfig] = useState(DEFAULT_SLOP_CONFIG);
            const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
            const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
            const [story, setStory] = useState<SettingsStory>(sampleStory);
            const comfyRefreshId = useRef<number>(0);

            return (
                <SettingsView
                    view="settings"
                    settingsTab={tab}
                    setSettingsTab={setTab}
                    devProvider="gemini"
                    setDevProvider={vi.fn()}
                    setApiProvider={vi.fn()}
                    devModel="gemini-2.5-pro"
                    setDevModel={vi.fn()}
                    apiKey="AIzaTest"
                    setApiKey={setApiKey}
                    geminiModel="gemini-2.5-pro"
                    setGeminiModel={vi.fn()}
                    openRouterKey=""
                    setOpenRouterKey={vi.fn()}
                    openRouterModel="openai/gpt-4o"
                    setOpenRouterModel={vi.fn()}
                    openRouterMaxTokens={65536}
                    setOpenRouterMaxTokens={vi.fn()}
                    nanoGptKey=""
                    setNanoGptKey={vi.fn()}
                    nanoGptModel=""
                    setNanoGptModel={vi.fn()}
                    koboldUrl="http://localhost:5001"
                    setKoboldUrl={vi.fn()}
                    koboldModel=""
                    setKoboldModel={vi.fn()}
                    koboldStatus="idle"
                    koboldError={null}
                    koboldLoadedModel=""
                    codexUrl="http://localhost:5010"
                    setCodexUrl={vi.fn()}
                    codexModel=""
                    setCodexModel={vi.fn()}
                    codexModelsList={[]}
                    codexStatus={{ online: false }}
                    codexEmbeddingStatus={null}
                    refreshCodexModels={vi.fn()}
                    claudeUrl="http://localhost:5011"
                    setClaudeUrl={vi.fn()}
                    claudeModel="sonnet"
                    setClaudeModel={vi.fn()}
                    claudeModelsList={[]}
                    claudeStatus={{ online: false }}
                    refreshClaudeModels={vi.fn()}
                    showOtherApiKeys={false}
                    setShowOtherApiKeys={vi.fn()}
                    savedModels={[]}
                    saveModel={vi.fn()}
                    deleteModel={vi.fn()}
                    modelSearchQuery=""
                    setModelSearchQuery={vi.fn()}
                    isSearchingModels={false}
                    searchResults={[]}
                    isModelDropdownOpen={false}
                    setIsModelDropdownOpen={vi.fn()}
                    showAdvancedModelRouting={showRouting}
                    setShowAdvancedModelRouting={setShowRouting}
                    getEffectiveModelConfig={() => ({ provider: 'gemini', model: 'gemini-2.5-pro' })}
                    reviewProvider=""
                    setReviewProvider={vi.fn()}
                    reviewModel=""
                    setReviewModel={vi.fn()}
                    reviewModelSearchQuery=""
                    setReviewModelSearchQuery={vi.fn()}
                    isSearchingReviewModels={false}
                    reviewSearchResults={[]}
                    isReviewModelDropdownOpen={false}
                    setIsReviewModelDropdownOpen={vi.fn()}
                    proseProvider=""
                    setProseProvider={vi.fn()}
                    proseModel=""
                    setProseModel={vi.fn()}
                    proseModelSearchQuery=""
                    setProseModelSearchQuery={vi.fn()}
                    isSearchingProseModels={false}
                    proseSearchResults={[]}
                    isProseModelDropdownOpen={false}
                    setIsProseModelDropdownOpen={vi.fn()}
                    handleCatalogRefresh={vi.fn()}
                    embeddingProvider="gemini"
                    setEmbeddingProvider={vi.fn()}
                    apiTimeout={120}
                    setApiTimeout={vi.fn()}
                    imageProvider="gemini"
                    setImageProvider={setImageProvider}
                    imageModel="gemini-3.1-flash-image"
                    setImageModel={vi.fn()}
                    imageApiKey=""
                    setImageApiKey={vi.fn()}
                    geminiImageModelsList={[]}
                    fetchGeminiImageModels={vi.fn()}
                    isFetchingImageModels={false}
                    comfyUrl="http://127.0.0.1:8188"
                    setComfyUrl={vi.fn()}
                    comfyRefreshId={comfyRefreshId}
                    comfyStatus={{ online: false, version: '', device: '', error: '' }}
                    comfyOptions={{ unet: [], clip: [], vae: [], lora: [], sampler: [], scheduler: [] }}
                    refreshComfyInfo={vi.fn()}
                    comfyUnet=""
                    setComfyUnet={vi.fn()}
                    comfyClip=""
                    setComfyClip={vi.fn()}
                    comfyVae=""
                    setComfyVae={vi.fn()}
                    comfyLora=""
                    setComfyLora={vi.fn()}
                    comfySampler=""
                    setComfySampler={vi.fn()}
                    comfyScheduler=""
                    setComfyScheduler={vi.fn()}
                    comfyLoraStrength={1}
                    setComfyLoraStrength={vi.fn()}
                    comfySteps={20}
                    setComfySteps={vi.fn()}
                    comfyCfg={1}
                    setComfyCfg={vi.fn()}
                    comfyTimeoutSec={120}
                    setComfyTimeoutSec={vi.fn()}
                    enableMcpBridge={false}
                    setEnableMcpBridge={setEnableMcpBridge}
                    isMcpConnected={false}
                    setMcpRetryTrigger={vi.fn()}
                    enableReview={true}
                    setEnableReview={setEnableReview}
                    enableStylePolish={true}
                    setEnableStylePolish={vi.fn()}
                    enableAudioDramaDirectionPass={true}
                    setEnableAudioDramaDirectionPass={vi.fn()}
                    enableEditorialHarnessAutopilot={false}
                    setEnableEditorialHarnessAutopilot={vi.fn()}
                    thinkingBudgetStoryArc={4096}
                    setThinkingBudgetStoryArc={vi.fn()}
                    thinkingBudgetAct={4096}
                    setThinkingBudgetAct={vi.fn()}
                    setEnableThinkingAct={vi.fn()}
                    thinkingBudgetScene={4096}
                    setThinkingBudgetScene={vi.fn()}
                    setEnableThinkingScene={vi.fn()}
                    thinkingBudgetWriting={4096}
                    setThinkingBudgetWriting={vi.fn()}
                    setEnableThinkingWriting={vi.fn()}
                    enableNarrativeLenses={true}
                    setEnableNarrativeLenses={vi.fn()}
                    customModes={{}}
                    editingModeId={null}
                    newModeId=""
                    setNewModeId={vi.fn()}
                    newModeContext=""
                    setNewModeContext={vi.fn()}
                    newModeIcon="tag"
                    newModePrompt=""
                    setNewModePrompt={vi.fn()}
                    setIsIconPickerOpen={vi.fn()}
                    handleStartEditCustomMode={vi.fn()}
                    handleDeleteCustomMode={vi.fn()}
                    handleSaveCustomMode={vi.fn()}
                    handleCancelEditCustomMode={vi.fn()}
                    slopConfig={slopConfig}
                    setSlopConfig={setSlopConfig}
                    bannedPhrases={['crimson orb']}
                    slopSearchQuery=""
                    setSlopSearchQuery={vi.fn()}
                    expandedSlopGroups={expandedGroups}
                    setExpandedSlopGroups={setExpandedGroups}
                    expandedSlopCategories={expandedCats}
                    setExpandedSlopCategories={setExpandedCats}
                    newBannedPhraseInput=""
                    setNewBannedPhraseInput={vi.fn()}
                    newCategoryItemInputs={{}}
                    setNewCategoryItemInputs={vi.fn()}
                    handleSetSlopCategorySeverity={vi.fn()}
                    handleAddBannedPhrase={handleAddBannedPhrase}
                    handleAddSlopCategoryItem={vi.fn()}
                    handleRemoveSlopCategoryItem={vi.fn()}
                    handleImportSlopJson={vi.fn()}
                    handleExportSlopJson={vi.fn()}
                    handleResetSlopConfig={vi.fn()}
                    requestConfirm={vi.fn()}
                    story={story}
                    setStory={setStory}
                    audioDramaSettings={{ ...DEFAULT_AUDIO_DRAMA_SETTINGS, backend: 'hybrid', pipelineTier: 3 } as AudioDramaSettings}
                    updateAudioDramaSetting={updateAudioDramaSetting}
                    ttsActiveDevice="wasm"
                    isAuditioningVoice={false}
                    isAnyAudioPlaying={false}
                    stopAllAudioPlayback={vi.fn()}
                    testAuditionCharacterVoice={testAuditionCharacterVoice}
                    handleResetAllVoiceAndAudioCaches={vi.fn()}
                    handleEditNarratorSeed={vi.fn()}
                    handleRerollNarratorSeed={vi.fn()}
                    handleEditNarratorVoiceProfile={vi.fn()}
                    handleEditNarratorReferenceText={vi.fn()}
                    handleResetNarratorReferenceText={vi.fn()}
                    handleEditCharacterSeed={vi.fn()}
                    handleRerollCharacterSeed={handleRerollCharacterSeed}
                    handleEditCharacterVoiceProfile={vi.fn()}
                    handleEditCharacterReferenceText={vi.fn()}
                    handleResetCharacterReferenceText={vi.fn()}
                    theme="light"
                    setTheme={setTheme}
                    customImageStyles={[]}
                    setCustomImageStyles={vi.fn()}
                    newStyleName=""
                    setNewStyleName={vi.fn()}
                    newStyleDesc=""
                    setNewStyleDesc={vi.fn()}
                    availableSceneAudioMap={{}}
                    loading={false}
                    handleExport={handleExport}
                    handleResetStoryStage={vi.fn()}
                    handleDeleteStory={handleDeleteStory}
                    showToast={vi.fn()}
                />
            );
        };

        renderIntoRoot(<SettingsHarness />);

        // Tab 1: Model Options
        expect(container.textContent).toContain('Studio & LLM Settings');
        expect(container.textContent).toContain('1. Choose AI Provider');
        act(() => {
            findButton('Advanced: Multi-Model Pipeline Routing').click();
        });
        expect(container.textContent).toContain('Embedding Provider (RAG)');

        // Tab 2: Pipeline Settings
        act(() => {
            findButton('Pipeline Settings').click();
        });
        expect(container.textContent).toContain('AI Slop & Naming Audit');
        const reviewToggle = container.querySelector('button[aria-label="Toggle Pipeline Review Agents"]') as HTMLButtonElement;
        act(() => {
            reviewToggle.click();
        });
        expect(setEnableReview).toHaveBeenCalledWith(false);

        const mcpToggle = container.querySelector('button[aria-label="Toggle Antigravity MCP Bridge"]') as HTMLButtonElement;
        act(() => {
            mcpToggle.click();
        });
        expect(setEnableMcpBridge).toHaveBeenCalledWith(true);

        // Expand Custom User Phrases in Slop Audit & trigger Add
        act(() => {
            findButton('Custom User Phrases').click();
        });
        act(() => {
            findButton('Custom User Rules').click();
        });
        const addPhraseBtns = Array.from(container.querySelectorAll('button')).filter(
            (b) => b.textContent?.trim() === 'Add'
        );
        expect(addPhraseBtns.length).toBeGreaterThan(0);
        act(() => {
            addPhraseBtns[addPhraseBtns.length - 1].click();
        });
        expect(handleAddBannedPhrase).toHaveBeenCalledTimes(1);

        // Tab 3: Audio Drama
        act(() => {
            findButton('Audio Drama').click();
        });
        expect(container.textContent).toContain('Audio Drama Multi-Voice Production');
        expect(container.textContent).toContain('Nora Vale');
        act(() => {
            findButton('Audition Voice').click();
        });
        expect(testAuditionCharacterVoice).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Nora Vale' })
        );
        const charReroll = container.querySelector('button[title="Re-roll Seed for Nora Vale"]') as HTMLButtonElement;
        act(() => {
            charReroll.click();
        });
        expect(handleRerollCharacterSeed).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Nora Vale' })
        );

        // Tab 4: Appearance
        act(() => {
            findButton('Appearance').click();
        });
        act(() => {
            findButton('Atelier Nuit (Dark)').click();
        });
        expect(setTheme).toHaveBeenCalledWith('dark');

        // Tab 5: Danger
        act(() => {
            findButton('Danger').click();
        });
        act(() => {
            findButton('Export Database JSON').click();
        });
        expect(handleExport).toHaveBeenCalledTimes(1);
        act(() => {
            findButton('Erase All App Data').click();
        });
        expect(handleDeleteStory).toHaveBeenCalledTimes(1);
    });
});
