/**
 * @module views/settings/SettingsModelsTab
 * Model Options tab (`settingsTab === 'models'`): Primary AI Provider credentials,
 * Master Model search, 3-role multi-model routing, API timeout, and Image Generation settings.
 */

import React from 'react';
import { ChevronDown, RefreshCw, RotateCcw, UniversalModelSearch } from '@/components';
import {
    API_TIMEOUT_BOUNDS,
    CLOUD_API_URLS,
    DEFAULT_API_TIMEOUT_SEC,
    DEFAULT_GEMINI_IMAGE_MODELS,
    DEFAULT_IMAGE_MODELS,
    DEFAULT_OPENROUTER_IMAGE_MODELS,
    DEFAULT_SERVICE_URLS,
    DEFAULT_TOKEN_LIMITS
} from '@/config';
import { getKoboldLoadedModelName } from '@/services/llm';
import { CLI_BRIDGE_DEFAULT_URLS, isCliBridgeProvider } from '@/types';
import type { SettingsModelsTabProps } from './types';
import { OpenAiImageModel } from './OpenAiImageModel';

function readKoboldGlobalModel(): string | undefined {
    return getKoboldLoadedModelName() || undefined;
}

const PROVIDER_TABS = [
    { id: 'gemini', label: 'Gemini' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'nanogpt', label: 'nano-GPT' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'koboldcpp', label: 'KoboldCPP' },
    { id: 'codex', label: 'Codex Bridge' },
    { id: 'claude', label: 'Claude Code' }
] as const;

/** Anthropic and Claude Code have no embedding endpoint, so they are not offered for RAG. */
const EMBEDDING_PROVIDER_TABS = PROVIDER_TABS.filter(
    (p) => p.id !== 'claude' && p.id !== 'anthropic'
);

const OVERRIDE_PROVIDER_TABS = [
    { id: '', label: 'Inherit (Primary)' },
    ...PROVIDER_TABS
] as const;

export const SettingsModelsTab: React.FC<SettingsModelsTabProps> = ({
    devProvider,
    setDevProvider,
    setApiProvider,
    devModel,
    setDevModel,
    apiKey,
    setApiKey,
    geminiModel,
    setGeminiModel,
    openRouterKey,
    setOpenRouterKey,
    openRouterModel,
    setOpenRouterModel,
    openRouterMaxTokens,
    setOpenRouterMaxTokens,
    nanoGptKey,
    setNanoGptKey,
    nanoGptModel,
    setNanoGptModel,
    anthropicKey,
    setAnthropicKey,
    anthropicModel,
    setAnthropicModel,
    koboldUrl,
    setKoboldUrl,
    koboldModel,
    setKoboldModel,
    koboldStatus,
    koboldError,
    koboldLoadedModel,
    codexUrl,
    setCodexUrl,
    codexModel,
    setCodexModel,
    codexModelsList,
    codexStatus,
    codexEmbeddingStatus,
    refreshCodexModels,
    claudeUrl,
    setClaudeUrl,
    claudeModel,
    setClaudeModel,
    claudeModelsList,
    claudeStatus,
    refreshClaudeModels,
    showOtherApiKeys,
    setShowOtherApiKeys,
    savedModels,
    saveModel,
    deleteModel,
    modelSearchQuery,
    setModelSearchQuery,
    isSearchingModels,
    searchResults,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    showAdvancedModelRouting,
    setShowAdvancedModelRouting,
    getEffectiveModelConfig,
    reviewProvider,
    setReviewProvider,
    reviewModel,
    setReviewModel,
    reviewModelSearchQuery,
    setReviewModelSearchQuery,
    isSearchingReviewModels,
    reviewSearchResults,
    isReviewModelDropdownOpen,
    setIsReviewModelDropdownOpen,
    proseProvider,
    setProseProvider,
    proseModel,
    setProseModel,
    proseModelSearchQuery,
    setProseModelSearchQuery,
    isSearchingProseModels,
    proseSearchResults,
    isProseModelDropdownOpen,
    setIsProseModelDropdownOpen,
    handleCatalogRefresh,
    embeddingProvider,
    setEmbeddingProvider,
    apiTimeout,
    setApiTimeout,
    imageProvider,
    setImageProvider,
    imageModel,
    setImageModel,
    imageApiKey,
    setImageApiKey,
    geminiImageModelsList,
    fetchGeminiImageModels,
    openRouterImageModelsList,
    fetchOpenRouterImageModels,
    isFetchingImageModels,
    comfyUrl,
    setComfyUrl,
    comfyRefreshId,
    comfyStatus,
    comfyOptions,
    refreshComfyInfo,
    comfyUnet,
    setComfyUnet,
    comfyClip,
    setComfyClip,
    comfyVae,
    setComfyVae,
    comfyLora,
    setComfyLora,
    comfySampler,
    setComfySampler,
    comfyScheduler,
    setComfyScheduler,
    comfyLoraStrength,
    setComfyLoraStrength,
    comfySteps,
    setComfySteps,
    comfyCfg,
    setComfyCfg,
    comfyTimeoutSec,
    setComfyTimeoutSec,
    setSettingsTab
}) => {
    const revConfig = getEffectiveModelConfig('review');
    const effRevProv = reviewProvider || devProvider || 'gemini';
    const isRevInherited = !reviewModel && !reviewProvider;

    const prsConfig = getEffectiveModelConfig('prose');
    const effPrsProv = proseProvider || devProvider || 'gemini';

    /** The Codex and Claude Code bridges share one model picker; this is what differs between them. */
    const cliBridgeFor = (provider: string) =>
        provider === 'claude'
            ? {
                  name: 'Claude Code Bridge',
                  cli: 'Claude Code',
                  model: claudeModel,
                  setModel: setClaudeModel,
                  models: claudeModelsList,
                  status: claudeStatus
              }
            : {
                  name: 'Codex Bridge',
                  cli: 'Codex CLI',
                  model: codexModel,
                  setModel: setCodexModel,
                  models: codexModelsList,
                  status: codexStatus
              };
    const devBridge = cliBridgeFor(devProvider);
    const revBridge = cliBridgeFor(effRevProv);
    const prsBridge = cliBridgeFor(effPrsProv);
    const isPrsInherited = !proseModel && !proseProvider;

    const availableGeminiImageModels =
        geminiImageModelsList.length > 0 ? geminiImageModelsList : DEFAULT_GEMINI_IMAGE_MODELS;
    const isKnownGeminiImageModel = availableGeminiImageModels.some((m) => m.id === imageModel);
    const availableOpenRouterImageModels =
        openRouterImageModelsList.length > 0
            ? openRouterImageModelsList
            : DEFAULT_OPENROUTER_IMAGE_MODELS;
    const isKnownOpenRouterImageModel = availableOpenRouterImageModels.some(
        (m) => m.id === imageModel
    );
    const selectedOpenRouterImageModel =
        openRouterImageModelsList.find((m) => m.id === imageModel) || null;

    const comfySelectFields: Array<{
        id: 'unet' | 'clip' | 'vae' | 'lora' | 'sampler' | 'scheduler';
        label: string;
        value: string;
        set: (v: string) => void;
    }> = [
        { id: 'unet', label: 'Diffusion model', value: comfyUnet, set: setComfyUnet },
        { id: 'clip', label: 'Text encoder', value: comfyClip, set: setComfyClip },
        { id: 'vae', label: 'VAE', value: comfyVae, set: setComfyVae },
        { id: 'lora', label: 'LoRA', value: comfyLora, set: setComfyLora },
        { id: 'sampler', label: 'Sampler', value: comfySampler, set: setComfySampler },
        { id: 'scheduler', label: 'Scheduler', value: comfyScheduler, set: setComfyScheduler }
    ];

    const comfyNumberFields = [
        { id: 'lora-strength', label: 'LoRA strength', value: comfyLoraStrength, set: setComfyLoraStrength, min: undefined, step: 0.1 },
        { id: 'steps', label: 'Steps', value: comfySteps, set: setComfySteps, min: 1, step: 1 },
        { id: 'cfg', label: 'CFG', value: comfyCfg, set: setComfyCfg, min: 0, step: 0.1 },
        { id: 'timeout', label: 'Timeout (seconds)', value: comfyTimeoutSec, set: setComfyTimeoutSec, min: 1, step: 1 }
    ];

    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-6 shadow-sm animate-fade-in">
            {/* Step 1: Choose AI Provider & Active Credentials */}
            <div className="space-y-4">
                <div>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-ink-900 font-serif tracking-tight">
                            1. Choose AI Provider &amp; Credentials
                        </h3>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                        Select your primary AI service and enter your API key or local endpoint. Credentials remain
                        stored locally in your browser.
                    </p>
                </div>

                {/* Provider Switcher */}
                <div>
                    <div className="flex flex-wrap gap-1.5 bg-mist-100 p-1 rounded-xl border border-edge-strong">
                        {PROVIDER_TABS.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                    setDevProvider(p.id);
                                    setApiProvider(p.id);
                                    if (p.id === 'koboldcpp') {
                                        const km =
                                            koboldLoadedModel ||
                                            readKoboldGlobalModel() ||
                                            koboldModel ||
                                            'koboldcpp';
                                        setDevModel(km);
                                        setKoboldModel(km);
                                    }
                                    // Another provider's model id means nothing to the Claude CLI.
                                    if (p.id === 'claude' && devProvider !== 'claude') setDevModel(claudeModel);
                                    // Nor to the Anthropic API, which only serves Claude models.
                                    if (p.id === 'anthropic' && devProvider !== 'anthropic') {
                                        setDevModel(anthropicModel);
                                    }
                                }}
                                className={`py-2 px-3 min-h-[38px] flex-1 whitespace-nowrap flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    devProvider === p.id
                                        ? 'bg-btn text-btn-ink shadow-2xs'
                                        : 'text-ink-600 hover:text-ink-900'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Prominent Active Provider Credential Box */}
                <div className="p-4 bg-inset border border-edge-strong rounded-xl space-y-3 shadow-2xs">
                    {devProvider === 'gemini' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    Google Gemini API Key
                                </span>
                            </div>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder="AIzaSy..."
                            />
                            <p className="text-[11px] text-ink-500">
                                Get your key from{' '}
                                <a
                                    href={CLOUD_API_URLS.geminiApiKeysPage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-gold-ink hover:underline font-medium"
                                >
                                    Google AI Studio
                                </a>
                                . Free tier available.
                            </p>
                        </div>
                    )}

                    {devProvider === 'openrouter' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    OpenRouter API Key
                                </span>
                            </div>
                            <input
                                type="password"
                                value={openRouterKey}
                                onChange={(e) => setOpenRouterKey(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder="sk-or-..."
                            />
                            <p className="text-[11px] text-ink-500">
                                Get your key from{' '}
                                <a
                                    href={CLOUD_API_URLS.openRouterKeysPage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-gold-ink hover:underline font-medium"
                                >
                                    OpenRouter.ai
                                </a>
                                .
                            </p>
                            <div className="pt-2 border-t border-edge-strong space-y-1">
                                <div className="flex items-center justify-between">
                                    <label
                                        htmlFor="openrouter-max-tokens"
                                        className="block text-xs font-bold text-ink-500 uppercase font-mono"
                                    >
                                        Max Output Tokens
                                    </label>
                                    <span className="text-xs font-mono font-bold text-gold-ink">
                                        {(
                                            openRouterMaxTokens ||
                                            DEFAULT_TOKEN_LIMITS.openRouterMaxTokens
                                        ).toLocaleString()}{' '}
                                        tok
                                    </span>
                                </div>
                                <select
                                    id="openrouter-max-tokens"
                                    value={
                                        openRouterMaxTokens ||
                                        DEFAULT_TOKEN_LIMITS.openRouterMaxTokens
                                    }
                                    onChange={(e) => setOpenRouterMaxTokens(parseInt(e.target.value, 10))}
                                    className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-gold transition-colors font-mono"
                                >
                                    <option value={32768}>32,768 (32k)</option>
                                    <option value={65536}>65,536 (64k - Default &amp; Recommended)</option>
                                    <option value={98304}>98,304 (96k - Extended)</option>
                                    <option value={131072}>131,072 (128k - Maximum Headroom)</option>
                                </select>
                                <p className="text-[11px] text-ink-500">
                                    Guarantees ample output token ceiling so reasoning models (Claude 3.7, DeepSeek
                                    R1, Gemini 3.8, o1/o3-mini) do not exhaust their token budget during thinking.
                                </p>
                            </div>
                        </div>
                    )}

                    {devProvider === 'nanogpt' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    nano-GPT API Key
                                </span>
                            </div>
                            <input
                                type="password"
                                value={nanoGptKey}
                                onChange={(e) => setNanoGptKey(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder="sk-nano-..."
                            />
                            <p className="text-[11px] text-ink-500">
                                Get your key from{' '}
                                <a
                                    href={CLOUD_API_URLS.nanoGptHomePage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-gold-ink hover:underline font-medium"
                                >
                                    nano-gpt.com
                                </a>
                                .
                            </p>
                        </div>
                    )}

                    {devProvider === 'anthropic' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    Anthropic API Key
                                </span>
                            </div>
                            <input
                                type="password"
                                value={anthropicKey}
                                onChange={(e) => setAnthropicKey(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder="sk-ant-..."
                            />
                            <p className="text-[11px] text-ink-500">
                                Get your key from the{' '}
                                <a
                                    href={CLOUD_API_URLS.anthropicKeysPage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-gold-ink hover:underline font-medium"
                                >
                                    Anthropic Console
                                </a>
                                . Calls go straight from this browser to Anthropic and are billed to that key.
                            </p>
                        </div>
                    )}

                    {devProvider === 'koboldcpp' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    KoboldCPP Endpoint (Local)
                                </span>
                            </div>
                            <input
                                type="text"
                                value={koboldUrl}
                                onChange={(e) => setKoboldUrl(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder={DEFAULT_SERVICE_URLS.koboldcpp}
                            />
                            <p className="text-[11px] text-ink-500">
                                Default URL:{' '}
                                <code className="text-ink-700 font-semibold font-mono">
                                    {DEFAULT_SERVICE_URLS.koboldcpp}
                                </code>
                                .
                                KoboldCPP must be running locally.
                            </p>
                        </div>
                    )}

                    {devProvider === 'codex' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    Codex CLI Bridge Endpoint (Local)
                                </span>
                            </div>
                            <input
                                type="text"
                                value={codexUrl}
                                onChange={(e) => setCodexUrl(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder={CLI_BRIDGE_DEFAULT_URLS.codex}
                            />
                            <div className="flex items-center justify-between gap-3 pt-1">
                                <p className="text-[11px] text-ink-500 font-mono" role="status">
                                    {codexStatus.online
                                        ? `Online (model: ${codexStatus.model})`
                                        : codexStatus.error || 'Checking bridge...'}
                                </p>
                                <button
                                    type="button"
                                    onClick={refreshCodexModels}
                                    className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <RefreshCw size={11} /> Refresh
                                </button>
                            </div>
                            <p className="text-[11px] text-ink-500" role="status">
                                {codexEmbeddingStatus?.available === true
                                    ? `Local embeddings: ready (${(
                                          codexEmbeddingStatus.model || 'Xenova/bge-small-en-v1.5'
                                      )
                                          .split('/')
                                          .pop()})`
                                    : codexEmbeddingStatus?.available === false
                                      ? 'Local embeddings: package not installed — run npm install'
                                      : 'Local embeddings: unknown'}
                            </p>
                            <p className="text-[11px] text-ink-400">
                                Run <code className="text-ink-700 font-semibold font-mono">npm run codex-bridge</code>{' '}
                                in the project folder first. Uses your local Codex CLI login.
                            </p>
                        </div>
                    )}

                    {devProvider === 'claude' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono">
                                    Claude Code Bridge Endpoint (Local)
                                </span>
                            </div>
                            <input
                                type="text"
                                value={claudeUrl}
                                onChange={(e) => setClaudeUrl(e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder={CLI_BRIDGE_DEFAULT_URLS.claude}
                            />
                            <div className="flex items-center justify-between gap-3 pt-1">
                                <p className="text-[11px] text-ink-500 font-mono" role="status">
                                    {claudeStatus.online
                                        ? 'Online (signed in)'
                                        : claudeStatus.error || 'Checking bridge...'}
                                </p>
                                <button
                                    type="button"
                                    onClick={refreshClaudeModels}
                                    className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <RefreshCw size={11} /> Refresh
                                </button>
                            </div>
                            <p className="text-[11px] text-ink-400">
                                Run <code className="text-ink-700 font-semibold font-mono">npm run claude-bridge</code>{' '}
                                in the project folder first. Uses your local Claude Code login (
                                <code className="text-ink-700 font-semibold font-mono">claude -p</code>), so usage
                                counts against your Claude plan.
                            </p>
                        </div>
                    )}
                </div>

                {/* Expandable Other Provider Keys Disclosure */}
                <div>
                    <button
                        type="button"
                        onClick={() => setShowOtherApiKeys((prev) => !prev)}
                        className="text-xs text-ink-600 hover:text-ink-900 flex items-center gap-1.5 font-medium py-1 cursor-pointer transition-colors"
                    >
                        <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${showOtherApiKeys ? 'rotate-180' : ''}`}
                        />
                        <span>
                            {showOtherApiKeys
                                ? 'Hide Other Provider Credentials'
                                : 'Configure Other Providers & Backup Keys'}
                        </span>
                    </button>

                    {showOtherApiKeys && (
                        <div className="mt-3 space-y-3 pt-3 border-t border-edge-strong animate-fade-in">
                            {devProvider !== 'gemini' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        Google Gemini API Key
                                    </span>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder="AIzaSy..."
                                    />
                                </div>
                            )}
                            {devProvider !== 'openrouter' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        OpenRouter API Key
                                    </span>
                                    <input
                                        type="password"
                                        value={openRouterKey}
                                        onChange={(e) => setOpenRouterKey(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder="sk-or-..."
                                    />
                                </div>
                            )}
                            {devProvider !== 'nanogpt' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        nano-GPT API Key
                                    </span>
                                    <input
                                        type="password"
                                        value={nanoGptKey}
                                        onChange={(e) => setNanoGptKey(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder="sk-nano-..."
                                    />
                                </div>
                            )}
                            {devProvider !== 'anthropic' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        Anthropic API Key
                                    </span>
                                    <input
                                        type="password"
                                        value={anthropicKey}
                                        onChange={(e) => setAnthropicKey(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder="sk-ant-..."
                                    />
                                </div>
                            )}
                            {devProvider !== 'koboldcpp' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        KoboldCPP URL
                                    </span>
                                    <input
                                        type="text"
                                        value={koboldUrl}
                                        onChange={(e) => setKoboldUrl(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder={DEFAULT_SERVICE_URLS.koboldcpp}
                                    />
                                </div>
                            )}
                            {devProvider !== 'codex' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        Codex Bridge URL
                                    </span>
                                    <input
                                        type="text"
                                        value={codexUrl}
                                        onChange={(e) => setCodexUrl(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder={CLI_BRIDGE_DEFAULT_URLS.codex}
                                    />
                                </div>
                            )}
                            {devProvider !== 'claude' && (
                                <div className="p-3 bg-inset border border-edge-strong rounded-xl space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700 font-mono block">
                                        Claude Code Bridge URL
                                    </span>
                                    <input
                                        type="text"
                                        value={claudeUrl}
                                        onChange={(e) => setClaudeUrl(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-lg px-3 py-1.5 text-xs text-ink-800 focus:border-gold outline-none font-mono"
                                        placeholder={CLI_BRIDGE_DEFAULT_URLS.claude}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Step 2: Primary AI Model Selection */}
            <div className="pt-5 border-t border-edge-strong space-y-4">
                <div>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-ink-900 font-serif tracking-tight">
                            2. Primary AI Model
                        </h3>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                        Powers story concept, character creation, act architecture, sequence outlines, scene blueprints,
                        and manuscript prose.
                    </p>
                </div>

                {/* Primary Model Card */}
                <div className="p-4 rounded-xl border border-edge-strong bg-surface space-y-3 shadow-2xs">
                    {!isCliBridgeProvider(devProvider) ? (
                        <UniversalModelSearch
                            label="Primary Model Selection"
                            apiProvider={devProvider}
                            activeModel={
                                devModel ||
                                (devProvider === 'gemini'
                                    ? geminiModel
                                    : devProvider === 'openrouter'
                                      ? openRouterModel
                                      : devProvider === 'nanogpt'
                                        ? nanoGptModel
                                        : devProvider === 'anthropic'
                                          ? anthropicModel
                                        : devProvider === 'koboldcpp'
                                          ? koboldModel
                                          : '')
                            }
                            onSelectModel={(id) => {
                                setDevModel(id);
                                if (devProvider === 'gemini') setGeminiModel(id);
                                else if (devProvider === 'openrouter') setOpenRouterModel(id);
                                else if (devProvider === 'nanogpt') setNanoGptModel(id);
                                else if (devProvider === 'anthropic') setAnthropicModel(id);
                                else if (devProvider === 'koboldcpp') setKoboldModel(id);
                            }}
                            savedModels={savedModels}
                            onSaveModel={(id) => saveModel(id)}
                            onDeleteModel={(id) => deleteModel(id)}
                            searchQuery={modelSearchQuery}
                            setSearchQuery={setModelSearchQuery}
                            isSearching={isSearchingModels}
                            searchResults={searchResults}
                            isDropdownOpen={isModelDropdownOpen}
                            setIsDropdownOpen={setIsModelDropdownOpen}
                            koboldStatus={koboldStatus}
                            koboldError={koboldError}
                            koboldLoadedModel={koboldLoadedModel}
                            onRefreshCatalog={() => handleCatalogRefresh(devProvider)}
                        />
                    ) : (
                        <div className="space-y-2">
                            <label
                                htmlFor={`${devProvider}-dev-model`}
                                className="block text-xs font-bold uppercase tracking-wider text-ink-600 font-mono"
                            >
                                Primary Model ({devBridge.name})
                            </label>
                            <select
                                id={`${devProvider}-dev-model`}
                                value={devModel || devBridge.model || ''}
                                onChange={(e) => {
                                    setDevModel(e.target.value);
                                    devBridge.setModel(e.target.value);
                                }}
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                            >
                                <option value="">Bridge default ({devBridge.status.model || 'Default'})</option>
                                {devModel && !devBridge.models.some((m) => m.id === devModel) && (
                                    <option value={devModel}>{devModel}</option>
                                )}
                                {devBridge.models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {String(m.display_name || m.id)}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-ink-400">Uses your local {devBridge.cli} bridge session.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Step 3: Multi-Model Pipeline Routing (Expandable Disclosure) */}
            <div className="pt-5 border-t border-edge-strong">
                <button
                    type="button"
                    onClick={() => setShowAdvancedModelRouting((prev) => !prev)}
                    className="w-full p-4 rounded-xl border border-edge-strong bg-inset hover:bg-wash transition-colors flex items-center justify-between text-left cursor-pointer group"
                >
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                                Advanced: Multi-Model Pipeline Routing
                            </span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1">
                            Assign specialized models for Review, Prose, and RAG Embeddings. By default, all stages
                            inherit from the Primary Model.
                        </p>
                    </div>
                    <ChevronDown
                        size={18}
                        className={`text-ink-400 group-hover:text-ink-900 transition-transform duration-200 shrink-0 ml-3 ${
                            showAdvancedModelRouting ? 'rotate-180' : ''
                        }`}
                    />
                </button>

                {showAdvancedModelRouting && (
                    <div className="mt-4 space-y-4 animate-fade-in">
                        {/* Card 2: Review Model */}
                        <div className="p-4 rounded-xl border border-edge-strong bg-surface space-y-3 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                                            Review Model
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-ink-500 mt-0.5">
                                        Evaluates structure &amp; beats, runs surgical editors (banned words), and
                                        archives scene memory.
                                    </p>
                                </div>
                                {!isRevInherited && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReviewModel('');
                                            setReviewProvider('');
                                        }}
                                        className="text-[11px] font-mono text-ink-500 hover:text-ink-900 flex items-center gap-1 underline flex-shrink-0 cursor-pointer"
                                        title="Reset to inherit Primary model"
                                    >
                                        <RotateCcw size={11} /> Reset to Primary Default
                                    </button>
                                )}
                            </div>

                            <div>
                                <div className="flex flex-wrap gap-1 bg-mist-100 p-1 rounded-xl border border-edge-strong">
                                    {OVERRIDE_PROVIDER_TABS.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                setReviewProvider(p.id);
                                                if (p.id === 'koboldcpp') {
                                                    const km =
                                                        koboldLoadedModel ||
                                                        readKoboldGlobalModel() ||
                                                        koboldModel ||
                                                        'koboldcpp';
                                                    setReviewModel(km);
                                                }
                                                if (
                                                    (p.id === 'claude' || p.id === 'anthropic') &&
                                                    reviewProvider !== p.id
                                                ) {
                                                    setReviewModel('');
                                                }
                                            }}
                                            className={`py-2 min-h-[38px] flex items-center justify-center rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap flex-1 px-3 cursor-pointer ${
                                                reviewProvider === p.id
                                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                                    : 'text-ink-600 hover:text-ink-900'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isRevInherited ? (
                                <div className="flex items-center justify-between px-3.5 py-2.5 bg-mist-100/80 border border-edge-soft rounded-xl text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-ink-600">
                                            Inheriting Primary:{' '}
                                            <strong className="font-mono text-ink-800">{revConfig.model}</strong> (
                                            {revConfig.provider})
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between px-3.5 py-2 bg-gold-tint/40 border border-gold-edge/50 rounded-xl text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-ink-700">
                                            Dedicated review model:{' '}
                                            <strong className="font-mono text-ink-800">{revConfig.model}</strong> (
                                            {revConfig.provider})
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isCliBridgeProvider(effRevProv) ? (
                                <UniversalModelSearch
                                    label="Review Model Selection"
                                    apiProvider={effRevProv}
                                    activeModel={reviewModel}
                                    onSelectModel={(id) => setReviewModel(id)}
                                    savedModels={savedModels}
                                    onSaveModel={(id) => saveModel(id)}
                                    onDeleteModel={(id) => deleteModel(id)}
                                    searchQuery={reviewModelSearchQuery}
                                    setSearchQuery={setReviewModelSearchQuery}
                                    isSearching={isSearchingReviewModels}
                                    searchResults={reviewSearchResults}
                                    isDropdownOpen={isReviewModelDropdownOpen}
                                    setIsDropdownOpen={setIsReviewModelDropdownOpen}
                                    koboldStatus={koboldStatus}
                                    koboldError={koboldError}
                                    koboldLoadedModel={koboldLoadedModel}
                                    onRefreshCatalog={() => handleCatalogRefresh(effRevProv)}
                                />
                            ) : (
                                <div className="space-y-2">
                                    <label
                                        htmlFor={`${effRevProv}-review-model`}
                                        className="block text-xs font-bold uppercase tracking-wider text-ink-600 font-mono"
                                    >
                                        Review Model ({revBridge.name})
                                    </label>
                                    <select
                                        id={`${effRevProv}-review-model`}
                                        value={reviewModel || ''}
                                        onChange={(e) => setReviewModel(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                    >
                                        <option value="">Inherit Primary Default ({revConfig.model})</option>
                                        {reviewModel && !revBridge.models.some((m) => m.id === reviewModel) && (
                                            <option value={reviewModel}>{reviewModel}</option>
                                        )}
                                        {revBridge.models.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {String(m.display_name || m.id)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Card 3: Prose Model */}
                        <div className="p-4 rounded-xl border border-edge-strong bg-surface space-y-3 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-ink-900 uppercase tracking-wider font-mono">
                                            Prose Model
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-ink-500 mt-0.5">
                                        Generates novel manuscript prose scene by scene directly from choreographed
                                        beats.
                                    </p>
                                </div>
                                {!isPrsInherited && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setProseModel('');
                                            setProseProvider('');
                                        }}
                                        className="text-[11px] font-mono text-ink-500 hover:text-ink-900 flex items-center gap-1 underline flex-shrink-0 cursor-pointer"
                                        title="Reset to inherit Primary model"
                                    >
                                        <RotateCcw size={11} /> Reset to Primary Default
                                    </button>
                                )}
                            </div>

                            <div>
                                <div className="flex flex-wrap gap-1 bg-mist-100 p-1 rounded-xl border border-edge-strong">
                                    {OVERRIDE_PROVIDER_TABS.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                setProseProvider(p.id);
                                                if (p.id === 'koboldcpp') {
                                                    const km =
                                                        koboldLoadedModel ||
                                                        readKoboldGlobalModel() ||
                                                        koboldModel ||
                                                        'koboldcpp';
                                                    setProseModel(km);
                                                }
                                                if (
                                                    (p.id === 'claude' || p.id === 'anthropic') &&
                                                    proseProvider !== p.id
                                                ) {
                                                    setProseModel('');
                                                }
                                            }}
                                            className={`py-2 min-h-[38px] flex items-center justify-center rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap flex-1 px-3 cursor-pointer ${
                                                proseProvider === p.id
                                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                                    : 'text-ink-600 hover:text-ink-900'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isPrsInherited ? (
                                <div className="flex items-center justify-between px-3.5 py-2.5 bg-mist-100/80 border border-edge-soft rounded-xl text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-ink-600">
                                            Inheriting Primary:{' '}
                                            <strong className="font-mono text-ink-800">{prsConfig.model}</strong> (
                                            {prsConfig.provider})
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between px-3.5 py-2 bg-gold-tint/40 border border-gold-edge/50 rounded-xl text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-ink-700">
                                            Dedicated prose model:{' '}
                                            <strong className="font-mono text-ink-800">{prsConfig.model}</strong> (
                                            {prsConfig.provider})
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isCliBridgeProvider(effPrsProv) ? (
                                <UniversalModelSearch
                                    label="Prose Model Selection"
                                    apiProvider={effPrsProv}
                                    activeModel={proseModel}
                                    onSelectModel={(id) => setProseModel(id)}
                                    savedModels={savedModels}
                                    onSaveModel={(id) => saveModel(id)}
                                    onDeleteModel={(id) => deleteModel(id)}
                                    searchQuery={proseModelSearchQuery}
                                    setSearchQuery={setProseModelSearchQuery}
                                    isSearching={isSearchingProseModels}
                                    searchResults={proseSearchResults}
                                    isDropdownOpen={isProseModelDropdownOpen}
                                    setIsDropdownOpen={setIsProseModelDropdownOpen}
                                    koboldStatus={koboldStatus}
                                    koboldError={koboldError}
                                    koboldLoadedModel={koboldLoadedModel}
                                    onRefreshCatalog={() => handleCatalogRefresh(effPrsProv)}
                                />
                            ) : (
                                <div className="space-y-2">
                                    <label
                                        htmlFor={`${effPrsProv}-prose-model`}
                                        className="block text-xs font-bold uppercase tracking-wider text-ink-600 font-mono"
                                    >
                                        Prose Model ({prsBridge.name})
                                    </label>
                                    <select
                                        id={`${effPrsProv}-prose-model`}
                                        value={proseModel || ''}
                                        onChange={(e) => setProseModel(e.target.value)}
                                        className="w-full bg-surface border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                    >
                                        <option value="">Inherit Primary Default ({prsConfig.model})</option>
                                        {proseModel && !prsBridge.models.some((m) => m.id === proseModel) && (
                                            <option value={proseModel}>{proseModel}</option>
                                        )}
                                        {prsBridge.models.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {String(m.display_name || m.id)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Card 4: Embedding Provider Toggle */}
                        <div className="p-4 rounded-xl border border-edge-strong bg-surface space-y-3 shadow-2xs">
                            <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                                Embedding Provider (RAG)
                            </label>
                            <div className="flex flex-wrap gap-1.5 bg-mist-100 p-1 rounded-xl border border-edge-strong">
                                {EMBEDDING_PROVIDER_TABS.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setEmbeddingProvider(p.id)}
                                        className={`py-2 px-3 min-h-[38px] flex-1 whitespace-nowrap flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            embeddingProvider === p.id
                                                ? 'bg-btn text-btn-ink shadow-2xs'
                                                : 'text-ink-600 hover:text-ink-900'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-ink-500 mt-2">
                                After switching providers, use &quot;Rebuild RAG index&quot; in World Lore.
                            </p>
                            <p className="text-xs text-ink-500 mt-1">
                                The lore index is rebuilt only when the story&apos;s lore or the embedding provider
                                changes.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* API Request Timeout Setting */}
            <div className="pt-5 border-t border-edge-strong space-y-2">
                <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                    API Request Timeout
                </label>
                <p className="text-xs text-ink-500 mb-2">
                    The maximum time to wait for a model response (or idle gap between streamed tokens/thinking) before cleanly terminating a stalled request.
                </p>
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <input
                            type="number"
                            value={apiTimeout}
                            onChange={(e) =>
                                setApiTimeout(
                                    Math.max(
                                        API_TIMEOUT_BOUNDS.min,
                                        Math.min(
                                            API_TIMEOUT_BOUNDS.max,
                                            parseInt(e.target.value, 10) || DEFAULT_API_TIMEOUT_SEC
                                        )
                                    )
                                )
                            }
                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                            placeholder={String(DEFAULT_API_TIMEOUT_SEC)}
                            min={API_TIMEOUT_BOUNDS.min}
                            max={API_TIMEOUT_BOUNDS.max}
                        />
                    </div>
                    <span className="text-xs text-ink-500 font-semibold font-mono">
                        Seconds (Default: {DEFAULT_API_TIMEOUT_SEC})
                    </span>
                </div>
            </div>

            {/* Image Generation Settings */}
            <div className="pt-6 border-t border-edge-strong space-y-4">
                <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider font-mono">
                        Image Generation Settings
                    </label>
                </div>
                <p className="text-xs text-ink-500">
                    Configure your image generation API, models, and story art style.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="flex items-center min-h-[36px] text-xs font-bold text-ink-700 mb-1 font-mono">
                            Image API Provider
                        </label>
                        <div className="relative">
                            <select
                                value={imageProvider}
                                onChange={(e) => {
                                    const prov = e.target.value;
                                    setImageProvider(prov);
                                    if (prov === 'gemini') {
                                        const geminiDefault =
                                            geminiImageModelsList[0]?.id || DEFAULT_IMAGE_MODELS.gemini;
                                        setImageModel(geminiDefault);
                                    } else if (prov === 'openrouter') {
                                        setImageModel(
                                            openRouterImageModelsList[0]?.id ||
                                                DEFAULT_IMAGE_MODELS.openrouter
                                        );
                                    } else if (prov === 'openai') {
                                        setImageModel(DEFAULT_IMAGE_MODELS.openai);
                                    }
                                }}
                                className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none appearance-none transition-colors cursor-pointer"
                            >
                                <option value="gemini">Gemini (Nano Banana / Native Image)</option>
                                <option value="openrouter">OpenRouter (SDXL/Flux/etc.)</option>
                                <option value="openai">OpenAI (GPT Image)</option>
                                <option value="comfyui">ComfyUI (local, Krea 2)</option>
                            </select>
                            <ChevronDown
                                className="absolute right-3 top-2.5 text-ink-400 pointer-events-none"
                                size={14}
                            />
                        </div>
                    </div>

                    {imageProvider !== 'comfyui' && (
                        <div>
                            <div className="flex items-center justify-between min-h-[36px] mb-1">
                                <label className="block text-xs font-bold text-ink-700 font-mono">Image Model</label>
                                {(imageProvider === 'gemini' || imageProvider === 'openrouter') && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            imageProvider === 'gemini'
                                                ? fetchGeminiImageModels(true)
                                                : fetchOpenRouterImageModels(true)
                                        }
                                        disabled={isFetchingImageModels}
                                        className="text-xs text-gold-ink hover:text-gold flex items-center gap-1 font-mono cursor-pointer transition-colors min-h-[36px] py-1 px-2.5 rounded-lg hover:bg-gold-tint/50"
                                        title={
                                            imageProvider === 'gemini'
                                                ? 'Fetch available image models on the fly from Gemini API'
                                                : 'Fetch live text-to-image models and pricing from OpenRouter'
                                        }
                                    >
                                        <RefreshCw
                                            size={11}
                                            className={isFetchingImageModels ? 'animate-spin text-gold-ink' : ''}
                                        />
                                        <span>{isFetchingImageModels ? 'Fetching...' : 'Fetch Models'}</span>
                                    </button>
                                )}
                            </div>

                            {imageProvider === 'gemini' ? (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <select
                                            value={isKnownGeminiImageModel ? imageModel : '__custom__'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val !== '__custom__') {
                                                    setImageModel(val);
                                                }
                                            }}
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none appearance-none transition-colors cursor-pointer"
                                        >
                                            {availableGeminiImageModels.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name || m.id}
                                                </option>
                                            ))}
                                            <option value="__custom__">Custom / Other Model ID...</option>
                                        </select>
                                        <ChevronDown
                                            className="absolute right-3 top-2.5 text-ink-400 pointer-events-none"
                                            size={14}
                                        />
                                    </div>
                                    {(!isKnownGeminiImageModel || imageModel === '__custom__') && (
                                        <input
                                            type="text"
                                            value={imageModel === '__custom__' ? '' : imageModel}
                                            onChange={(e) => setImageModel(e.target.value)}
                                            placeholder={`Enter custom Gemini model ID (e.g. ${DEFAULT_IMAGE_MODELS.gemini})`}
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                        />
                                    )}
                                </div>
                            ) : imageProvider === 'openai' ? (
                                <OpenAiImageModel imageModel={imageModel} setImageModel={setImageModel} />
                            ) : (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <select
                                            value={isKnownOpenRouterImageModel ? imageModel : '__custom__'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val !== '__custom__') {
                                                    setImageModel(val);
                                                }
                                            }}
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none appearance-none transition-colors cursor-pointer"
                                        >
                                            {availableOpenRouterImageModels.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {'costLabel' in m && m.costLabel
                                                        ? `${m.name} — ${m.costLabel}`
                                                        : m.name}
                                                </option>
                                            ))}
                                            <option value="__custom__">Custom / Other Model ID...</option>
                                        </select>
                                        <ChevronDown
                                            className="absolute right-3 top-2.5 text-ink-400 pointer-events-none"
                                            size={14}
                                        />
                                    </div>
                                    {isFetchingImageModels && openRouterImageModelsList.length === 0 ? (
                                        <p className="text-[11px] text-ink-500">
                                            Fetching live OpenRouter text-to-image models &amp; pricing...
                                        </p>
                                    ) : selectedOpenRouterImageModel ? (
                                        <div className="text-[11px] bg-inset/70 border border-edge rounded-lg px-3 py-2 space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-ink-600 truncate">
                                                    {selectedOpenRouterImageModel.id}
                                                </span>
                                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-mist-100 border border-edge text-[10px] font-mono text-ink-600">
                                                    {selectedOpenRouterImageModel.modality.replace(
                                                        '->',
                                                        ' → '
                                                    )}
                                                </span>
                                            </div>
                                            <p
                                                className={
                                                    selectedOpenRouterImageModel.isFree
                                                        ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                                        : 'text-ink-600'
                                                }
                                            >
                                                {selectedOpenRouterImageModel.costDetail}
                                            </p>
                                        </div>
                                    ) : openRouterImageModelsList.length === 0 ? (
                                        <p className="text-[11px] text-ink-500">
                                            Click Fetch Models to load live OpenRouter text-to-image
                                            models and pricing.
                                        </p>
                                    ) : null}
                                    {(!isKnownOpenRouterImageModel || imageModel === '__custom__') && (
                                        <input
                                            type="text"
                                            value={imageModel === '__custom__' ? '' : imageModel}
                                            onChange={(e) => setImageModel(e.target.value)}
                                            placeholder={`e.g. ${DEFAULT_IMAGE_MODELS.openrouter}`}
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {imageProvider !== 'comfyui' && (
                    <div>
                        <label className="block text-xs font-bold text-ink-700 mb-1 font-mono">
                            {imageProvider === 'openai' ? 'OpenAI API Key' : 'Dedicated Image API Key (Optional)'}
                        </label>
                        <input
                            type="password"
                            value={imageApiKey}
                            onChange={(e) => setImageApiKey(e.target.value)}
                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors"
                            placeholder={
                                imageProvider === 'openai'
                                    ? 'sk-...'
                                    : 'If blank, uses text provider key (Gemini/OpenRouter)'
                            }
                        />
                    </div>
                )}

                {imageProvider === 'comfyui' && (
                    <div className="p-4 bg-inset border border-edge-strong rounded-xl space-y-4">
                        <div>
                            <label htmlFor="comfy-url" className="block text-xs font-bold text-ink-700 mb-1 font-mono">
                                ComfyUI URL
                            </label>
                            <input
                                id="comfy-url"
                                type="text"
                                value={comfyUrl}
                                onChange={(e) => {
                                    comfyRefreshId.current++;
                                    setComfyUrl(e.target.value);
                                }}
                                className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                placeholder={DEFAULT_SERVICE_URLS.comfyui}
                            />
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <p role="status" className="text-xs text-ink-500 break-words">
                                {comfyStatus.online
                                    ? `Online. ComfyUI ${comfyStatus.version} on ${comfyStatus.device}`
                                    : comfyStatus.error || 'Press Refresh to connect to ComfyUI.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => void refreshComfyInfo({ startIfNeeded: true })}
                                className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                            >
                                Refresh
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {comfySelectFields.map((field) => (
                                <div key={field.id}>
                                    <label
                                        htmlFor={`comfy-${field.id}`}
                                        className="block text-xs font-bold text-ink-700 mb-1 font-mono"
                                    >
                                        {field.label}
                                    </label>
                                    <div className="relative">
                                        <select
                                            id={`comfy-${field.id}`}
                                            value={field.value}
                                            onChange={(e) => field.set(e.target.value)}
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none appearance-none transition-colors cursor-pointer"
                                        >
                                            <option value="">{field.id === 'lora' ? 'None' : 'Choose...'}</option>
                                            {field.value && !comfyOptions[field.id].includes(field.value) && (
                                                <option value={field.value}>{field.value} (saved)</option>
                                            )}
                                            {comfyOptions[field.id].map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            className="absolute right-3 top-2.5 text-ink-400 pointer-events-none"
                                            size={14}
                                        />
                                    </div>
                                </div>
                            ))}
                            {comfyNumberFields.map((field) => (
                                <div key={field.id}>
                                    <label
                                        htmlFor={`comfy-${field.id}`}
                                        className="block text-xs font-bold text-ink-700 mb-1 font-mono"
                                    >
                                        {field.label}
                                    </label>
                                    <input
                                        id={`comfy-${field.id}`}
                                        type="number"
                                        value={field.value}
                                        min={field.min}
                                        step={field.step}
                                        onChange={(e) => field.set(Number(e.target.value))}
                                        className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-ink-500">
                            Start ComfyUI with --enable-cors-header (loopback listen is fine). Uses Krea 2 Turbo:
                            diffusion model + Qwen3-VL text encoder + Qwen VAE.
                        </p>
                    </div>
                )}
                <p className="text-xs text-ink-400 mt-2">
                    Looking for story art styles or custom visual presets? Manage them under the{' '}
                    <button
                        type="button"
                        onClick={() => setSettingsTab('appearance')}
                        className="text-gold-ink hover:underline font-semibold cursor-pointer"
                    >
                        Appearance
                    </button>{' '}
                    tab.
                </p>
            </div>
        </div>
    );
};
