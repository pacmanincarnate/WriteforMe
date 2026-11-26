/**
 * @module views/settings/SettingsAudioDramaTab
 * Audio Drama tab (`settingsTab === 'audio_drama'`): 4-tier TTS slider, Audio.cpp hybrid studio,
 * Gemini/OpenRouter/Kokoro/System configuration panels, cadence timing, and Cast Voice Roster & Auditions.
 */

import React from 'react';
import {
    Cpu,
    Radio,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Sliders,
    Sparkles,
    Square,
    Trash2,
    Volume2,
    EditButton
} from '@/components';
import {
    DEFAULT_SERVICE_URLS,
    DEFAULT_TTS_MODELS,
    KOKORO_VOICES,
    TTS_PIPELINE_TIERS,
    type AudioDramaSettings
} from '@/config';
import {
    RAIN_SENTENCE,
    estimateReferenceTextSeconds,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    getVoiceReferenceTextForCharacter,
    mapCharacterToElevenLabsVoice,
    mapCharacterToGeminiVoice,
    mapCharacterToKokoroVoice,
    resolveSpeakerVoiceIdentity,
    sanitizeVoiceReferenceText
} from '@/domain/audio';
import { fetchWithTimeout } from '@/services/http';
import { studioCacheStore } from '@/services/storage';
import type { SettingsAudioDramaTabProps, SettingsCastMember } from './types';

function formatBackendBadge(
    backend: string,
    voiceDesc: string,
    speakerName: string
): string {
    if (backend === 'hybrid' || backend === 'audiocpp') return '';
    if (backend === 'breeze') return 'Breeze 2 Instruct Profile';
    if (backend === 'system') return 'Device System Voice';
    if (backend === 'openrouter') return `ElevenLabs: ${mapCharacterToElevenLabsVoice(voiceDesc, speakerName)}`;
    if (backend === 'gemini') return `Gemini: ${mapCharacterToGeminiVoice(voiceDesc, speakerName)}`;
    const kokoroId = mapCharacterToKokoroVoice(voiceDesc, speakerName);
    const matched = KOKORO_VOICES.find((v) => v.id === kokoroId);
    return `Kokoro: ${matched?.name || 'Heart'}`;
}

function getCharacterInterviewSource(char: SettingsCastMember): string {
    const detailsDeep =
        char.details && typeof char.details === 'object' ? char.details.deep_profile : undefined;
    return String(
        detailsDeep ||
            char.interview_psychology ||
            char.deep_profile ||
            char.canonical_interview_voice ||
            ''
    );
}

export const SettingsAudioDramaTab: React.FC<SettingsAudioDramaTabProps> = ({
    story,
    apiKey,
    openRouterKey,
    audioDramaSettings,
    updateAudioDramaSetting,
    ttsActiveDevice,
    isAuditioningVoice,
    isAnyAudioPlaying,
    stopAllAudioPlayback,
    testAuditionCharacterVoice,
    handleResetAllVoiceAndAudioCaches,
    handleEditNarratorSeed,
    handleRerollNarratorSeed,
    handleEditNarratorVoiceProfile,
    handleEditNarratorReferenceText,
    handleResetNarratorReferenceText,
    handleEditCharacterSeed,
    handleRerollCharacterSeed,
    handleEditCharacterVoiceProfile,
    handleEditCharacterReferenceText,
    handleResetCharacterReferenceText,
    showToast
}) => {
    const currentBackend = String(audioDramaSettings.backend || 'audiocpp');
    const currentTierIndex =
        typeof audioDramaSettings.pipelineTier === 'number'
            ? audioDramaSettings.pipelineTier
            : currentBackend === 'system'
              ? 0
              : currentBackend === 'breeze'
                ? 2
                : currentBackend === 'browser' || currentBackend === 'kokoro'
                  ? 1
                  : 3;
    const activeTier = TTS_PIPELINE_TIERS[currentTierIndex] || TTS_PIPELINE_TIERS[3];
    const isDeterministic = audioDramaSettings.enableDeterministicSeed !== false;
    const isLocalStudioBackend =
        currentBackend === 'hybrid' || currentBackend === 'breeze' || currentBackend === 'audiocpp';

    // Narrator identity computation
    const narratorDesc = getVoiceDescriptionForCharacter('Narrator', story);
    const narratorSeed = getDeterministicVoiceSeed('Narrator', story);
    const narratorRefText = getVoiceReferenceTextForCharacter('Narrator', story);
    const narratorSigHash = resolveSpeakerVoiceIdentity('Narrator', story, audioDramaSettings)?.sigHash || '';
    const narratorRefSec = Math.round(estimateReferenceTextSeconds(narratorRefText));
    const isNarratorRefCustom = Boolean(
        story?.user_edited?.narrator_reference_text ||
            (story?.narrator_reference_text && sanitizeVoiceReferenceText(story.narrator_reference_text) !== RAIN_SENTENCE)
    );
    const isNarratorRefMatchingProfile = Boolean(
        narratorRefText &&
            narratorDesc &&
            narratorRefText.trim().replace(/[.!?]+$/g, '').toLowerCase() ===
                narratorDesc.trim().replace(/[.!?]+$/g, '').toLowerCase()
    );
    const narratorBadge = formatBackendBadge(currentBackend, narratorDesc, 'Narrator');

    const activeCast: SettingsCastMember[] =
        Array.isArray(story.cast) && story.cast.length > 0
            ? (story.cast as SettingsCastMember[])
            : Array.isArray(story.characters) && story.characters.length > 0
              ? (story.characters as SettingsCastMember[])
              : [];

    const handleTestHybridConnection = async () => {
        const bridgeUrl = String(
            audioDramaSettings.studioBridgeUrl || DEFAULT_SERVICE_URLS.audioStudioBridge
        ).replace(/\/+$/, '');
        const targetUrl = String(
            audioDramaSettings.audioCppUrl || DEFAULT_SERVICE_URLS.audioCpp
        ).replace(/\/+$/, '');
        showToast('Checking Audio Studio Bridge & Audio.cpp...', 'info');
        try {
            const bridgeRes = await fetchWithTimeout(`${bridgeUrl}/health`, { method: 'GET' }, 3000).catch(
                () => null
            );
            const serverRes = await fetchWithTimeout(`${targetUrl}/v1/models`, { method: 'GET' }, 3000)
                .catch(() => fetchWithTimeout(`${targetUrl}/health`, { method: 'GET' }, 3000))
                .catch(() => null);

            if (bridgeRes && bridgeRes.ok) {
                const h = (await bridgeRes.json().catch(() => null)) as {
                    gpu_vram?: { free_mb?: number; total_mb?: number };
                    offload?: {
                        mode?: string;
                        disk_experts?: boolean;
                        expert_cache_size?: number;
                        gpu_expert_layers?: number;
                        run_mode?: string;
                    };
                    perf?: { avgRealtimeX?: number | string };
                } | null;
                const parts = ['Bridge connected (port 5020)'];
                if (h?.gpu_vram?.free_mb) {
                    parts.push(`GPU ${h.gpu_vram.free_mb}/${h.gpu_vram.total_mb} MB free`);
                }
                if (h?.offload?.mode) {
                    const detail = h.offload.disk_experts
                        ? `${h.offload.mode} ${h.offload.expert_cache_size} slots`
                        : `${h.offload.mode} ${h.offload.gpu_expert_layers}/40 GPU`;
                    parts.push(`Wave 2: ${detail} (${h.offload.run_mode || 'streaming'})`);
                }
                if (h?.perf?.avgRealtimeX) {
                    parts.push(`Avg: ${h.perf.avgRealtimeX}x realtime`);
                }
                showToast(parts.join(' · '), 'success');
            } else if (serverRes && serverRes.ok) {
                showToast(`Connected directly to Audio.cpp (${targetUrl})! Ready for batch waves.`, 'success');
            } else if (serverRes) {
                showToast('Audio.cpp server is reachable on port 8080.', 'info');
            } else {
                showToast(
                    "Could not connect to Bridge (5020) or Server (8080). Start backends via 'Start Backends.bat'.",
                    'warning'
                );
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            showToast(`Connection test failed: ${msg}`, 'error');
        }
    };

    const handleClearRenderCache = async () => {
        try {
            if (studioCacheStore) {
                await studioCacheStore.clearAllRenders();
                showToast('Cleared Audio Drama Studio render cache.', 'success');
            } else {
                showToast('Cache store not initialized.', 'warning');
            }
        } catch (cErr: unknown) {
            const msg = cErr instanceof Error ? cErr.message : String(cErr);
            showToast(`Could not clear cache: ${msg}`, 'error');
        }
    };

    return (
        <div className="bg-surface p-6 md:p-8 rounded-2xl border border-edge space-y-6 shadow-sm animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink-900 font-serif tracking-tight">
                            Audio Drama Multi-Voice Production
                        </h3>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                        Direct full-cast audio performances with automatic character voice casting, expressive emotion
                        tags, and broadcast cadence.
                    </p>
                </div>
            </div>

            {/* TTS Generation Pipeline Slider */}
            <div className="p-4 sm:p-5 rounded-2xl border border-edge-strong bg-wash space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-edge pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <Sliders size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 font-mono uppercase tracking-wider">
                                TTS Generation Pipeline
                            </h4>
                        </div>
                        <p className="text-xs text-ink-500 mt-0.5">
                            The engine will synthesize using this tier and automatically cascade to lighter options if
                            unavailable.
                        </p>
                    </div>
                </div>

                {/* Slider Track and Discrete Stops */}
                <div className="space-y-4 pt-1">
                    <div className="relative px-2">
                        <input
                            type="range"
                            min="0"
                            max="3"
                            step="1"
                            value={currentTierIndex}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updateAudioDramaSetting('pipelineTier', val);
                            }}
                            className="w-full accent-[#C9A96E] cursor-pointer h-2 bg-mist-200 rounded-lg appearance-none"
                            aria-label="TTS Generation Pipeline Slider"
                        />
                        <div className="flex justify-between items-center text-[10px] font-mono font-semibold text-ink-500 mt-2 px-1">
                            {TTS_PIPELINE_TIERS.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => updateAudioDramaSetting('pipelineTier', t.tier)}
                                    className={`flex flex-col items-center transition-colors cursor-pointer text-center max-w-[85px] sm:max-w-[140px] ${
                                        t.tier === currentTierIndex
                                            ? 'text-gold-ink font-bold'
                                            : 'text-ink-500 hover:text-ink-800'
                                    }`}
                                >
                                    <span className="text-[11px] font-sans font-bold">{t.label.split(':')[0]}</span>
                                    <span className="text-[9px] text-ink-400 font-mono hidden sm:inline">
                                        {t.shortLabel}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active Tier Summary Card */}
                    <div className="p-3.5 rounded-xl border border-gold-edge bg-gold-tint/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-ink-900 font-serif">{activeTier.label}</span>
                                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface border border-edge text-ink-600 font-semibold">
                                    {activeTier.badge}
                                </span>
                            </div>
                            <p className="text-[11px] text-ink-600">{activeTier.desc}</p>
                        </div>
                        <div className="text-[10px] font-mono text-gold-ink shrink-0 bg-surface/80 px-2 py-1 rounded-md border border-gold-edge/60">
                            {activeTier.tier === 0
                                ? 'Zero setup required'
                                : `Smart fallback → ${TTS_PIPELINE_TIERS[activeTier.tier - 1]?.shortLabel || 'System'}`}
                        </div>
                    </div>
                </div>
            </div>

            {/* PANEL 1: Audio.cpp (Local Qwen 3 TTS) */}
            {(isLocalStudioBackend ||
                (audioDramaSettings.pipelineTier !== undefined && audioDramaSettings.pipelineTier >= 2)) && (
                <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-inset space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Radio size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                                Audio.cpp Hybrid Studio (Breeze 2 + Drama-3)
                            </h4>
                        </div>
                    </div>
                    <p className="text-xs text-ink-500">
                        Powers both <strong>Novels</strong> and <strong>Audio Dramas</strong>:{' '}
                        <strong>Breeze 2 TTS</strong> creates your customizable Narrator voice and character master
                        clips; <strong>Fish Audio Drama-3</strong> synthesizes expressive multi-speaker performance and
                        dialogue-aware novel passages without splitting mid-exchange.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Audio Studio Bridge URL
                            </label>
                            <input
                                type="text"
                                value={
                                    audioDramaSettings.studioBridgeUrl ||
                                    DEFAULT_SERVICE_URLS.audioStudioBridge
                                }
                                onChange={(e) => updateAudioDramaSetting('studioBridgeUrl', e.target.value)}
                                placeholder={DEFAULT_SERVICE_URLS.audioStudioBridge}
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Audio.cpp Server URL
                            </label>
                            <input
                                type="text"
                                value={audioDramaSettings.audioCppUrl || DEFAULT_SERVICE_URLS.audioCpp}
                                onChange={(e) => updateAudioDramaSetting('audioCppUrl', e.target.value)}
                                placeholder={DEFAULT_SERVICE_URLS.audioCpp}
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Breeze Model ID
                            </label>
                            <input
                                type="text"
                                value={audioDramaSettings.breezeModelId || 'breeze-tts'}
                                onChange={(e) => updateAudioDramaSetting('breezeModelId', e.target.value)}
                                placeholder="breeze-tts"
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Drama-3 Model ID
                            </label>
                            <input
                                type="text"
                                value={audioDramaSettings.dramaModelId || 'drama-3'}
                                onChange={(e) => updateAudioDramaSetting('dramaModelId', e.target.value)}
                                placeholder="drama-3"
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Verifier Model ID
                            </label>
                            <input
                                type="text"
                                value={audioDramaSettings.verifierModelId || 'whisper_verifier'}
                                onChange={(e) => updateAudioDramaSetting('verifierModelId', e.target.value)}
                                placeholder="whisper_verifier"
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                    </div>

                    {/* VRAM Swapping & Quality Gate Controls */}
                    <div className="pt-2 border-t border-edge-soft space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck size={14} className="text-gold-ink" />
                                <span className="text-[11px] font-bold text-ink-900 font-mono uppercase tracking-wider">
                                    VRAM Swapping &amp; Quality Gate
                                </span>
                            </div>
                            <span className="text-[10px] font-mono text-gold-ink font-semibold">
                                Wave-Gated Execution
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-ink-800">Model Swap Architecture</span>
                                </div>
                                <select
                                    value={audioDramaSettings.studioSwapMode || 'patternA'}
                                    onChange={(e) => updateAudioDramaSetting('studioSwapMode', e.target.value)}
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold mt-1"
                                >
                                    <option value="patternA">
                                        Pattern A: Process Manager (100% Clean CUDA Teardown)
                                    </option>
                                    <option value="patternB">
                                        Pattern B: Single-Server LRU Eviction (--max-loaded-models 1)
                                    </option>
                                </select>
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    Pattern A guarantees zero CUDA driver fragmentation by managing child daemon
                                    lifetimes.
                                </span>
                            </div>

                            <div className="bg-surface/80 p-3 rounded-xl border border-edge flex flex-col justify-between">
                                <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-ink-800">ASR Verification Gate</span>
                                    <span className="font-mono text-gold-ink font-bold">
                                        {(audioDramaSettings.asrMode || 'auto').toUpperCase()}
                                    </span>
                                </div>
                                <select
                                    value={audioDramaSettings.asrMode || 'auto'}
                                    onChange={(e) =>
                                        updateAudioDramaSetting(
                                            'asrMode',
                                            e.target.value as AudioDramaSettings['asrMode']
                                        )
                                    }
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold mt-1"
                                >
                                    <option value="auto">
                                        Auto (Server Whisper -&gt; Browser -&gt; Acoustic Sanity)
                                    </option>
                                    <option value="server">Server Whisper Only (/v1/audio/transcriptions)</option>
                                    <option value="browser">In-Browser Whisper (transformers.js)</option>
                                    <option value="off">Off (Fast Acoustic Energy / Duration Check Only)</option>
                                </select>
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    Flags autoregressive dropouts or hallucinations (WER threshold: 18%).
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Drama-3 Offload & Performance Controls */}
                    <div className="pt-2 border-t border-edge-soft space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <Cpu size={14} className="text-gold-ink" />
                                <span className="text-[11px] font-bold text-ink-900 font-mono uppercase tracking-wider">
                                    Drama-3 Offload &amp; Performance
                                </span>
                            </div>
                            <span className="text-[10px] font-mono text-gold-ink font-semibold">
                                Streaming Codec + VQ Cache
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                    Offload Profile
                                </label>
                                <select
                                    value={audioDramaSettings.dramaOffloadProfile || 'auto'}
                                    onChange={(e) =>
                                        updateAudioDramaSetting(
                                            'dramaOffloadProfile',
                                            e.target.value as AudioDramaSettings['dramaOffloadProfile']
                                        )
                                    }
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                >
                                    <option value="auto">Auto (VRAM-Tuned Streaming)</option>
                                    <option value="pinned_cache">Pinned Cache (Fastest for 12 GB Q4_K_S)</option>
                                    <option value="resident_hybrid">Resident Hybrid (Split GPU/CPU Layers)</option>
                                    <option value="custom">Custom</option>
                                </select>
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    Auto uses pinned cache + GPU streaming codec on 12–16 GB GPUs (~1.2–1.3x realtime).
                                </span>
                            </div>

                            <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                    Codec Backend
                                </label>
                                <select
                                    value={audioDramaSettings.dramaCodecBackend || 'same'}
                                    onChange={(e) =>
                                        updateAudioDramaSetting(
                                            'dramaCodecBackend',
                                            e.target.value as AudioDramaSettings['dramaCodecBackend']
                                        )
                                    }
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                >
                                    <option value="same">GPU Streaming (Fastest)</option>
                                    <option value="cpu">CPU (Saves ~1.3 GB VRAM)</option>
                                </select>
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    Streaming runs 1-frame codec on GPU without multi-GB offline buffer spikes.
                                </span>
                            </div>

                            <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                    Context Window
                                </label>
                                <select
                                    value={Number(audioDramaSettings.dramaContextLength) || 8192}
                                    onChange={(e) =>
                                        updateAudioDramaSetting('dramaContextLength', Number(e.target.value))
                                    }
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                >
                                    <option value={4096}>4096 (Short scenes)</option>
                                    <option value={6144}>6144 (-136 MB KV)</option>
                                    <option value={8192}>8192 (Recommended)</option>
                                    <option value={12288}>12288 (Long multi-speaker)</option>
                                </select>
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    8192 prevents CapacityError on 6–8 speaker casts with 15–20s refs.
                                </span>
                            </div>

                            <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                    CPU Threads
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={32}
                                    value={audioDramaSettings.dramaThreads ?? ''}
                                    onChange={(e) => {
                                        const raw = e.target.value.trim();
                                        updateAudioDramaSetting(
                                            'dramaThreads',
                                            raw === '' ? null : Math.max(1, Math.min(32, Math.round(Number(raw))))
                                        );
                                    }}
                                    placeholder="Auto (6 P-cores)"
                                    className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                />
                                <span className="text-[10px] text-ink-400 block mt-1">
                                    Blank uses P-core count (6 threads avoids E-core contention).
                                </span>
                            </div>

                            {(audioDramaSettings.dramaOffloadProfile === 'pinned_cache' ||
                                audioDramaSettings.dramaOffloadProfile === 'custom') && (
                                <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                    <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                        Expert Cache Slots (8–256)
                                    </label>
                                    <input
                                        type="number"
                                        min={8}
                                        max={256}
                                        value={audioDramaSettings.dramaExpertCacheSize ?? ''}
                                        onChange={(e) => {
                                            const raw = e.target.value.trim();
                                            updateAudioDramaSetting(
                                                'dramaExpertCacheSize',
                                                raw === '' ? null : Math.max(8, Math.min(256, Math.round(Number(raw))))
                                            );
                                        }}
                                        placeholder="Auto (VRAM-sized)"
                                        className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                    />
                                    <span className="text-[10px] text-ink-400 block mt-1">
                                        Clamped automatically against free GPU VRAM (67.5 MB/slot).
                                    </span>
                                </div>
                            )}

                            {(audioDramaSettings.dramaOffloadProfile === 'resident_hybrid' ||
                                audioDramaSettings.dramaOffloadProfile === 'custom') && (
                                <div className="bg-surface/80 p-3 rounded-xl border border-edge">
                                    <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                        CPU Expert Layers (0–40)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={40}
                                        value={audioDramaSettings.dramaCpuExpertLayers ?? ''}
                                        onChange={(e) => {
                                            const raw = e.target.value.trim();
                                            updateAudioDramaSetting(
                                                'dramaCpuExpertLayers',
                                                raw === '' ? null : Math.max(0, Math.min(40, Math.round(Number(raw))))
                                            );
                                        }}
                                        placeholder="Auto (VRAM-clamped)"
                                        className="w-full bg-surface border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                                    />
                                    <span className="text-[10px] text-ink-400 block mt-1">
                                        Lower means more MoE layers pinned in GPU VRAM (0 = all 40 on GPU).
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                            type="button"
                            onClick={handleTestHybridConnection}
                            className="px-3.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                        >
                            <Radio size={12} className="text-gold-ink" /> Test Hybrid Studio Connection
                        </button>
                        <button
                            type="button"
                            onClick={handleClearRenderCache}
                            className="px-3.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                        >
                            <Trash2 size={12} className="text-amber-600" /> Clear Render Cache
                        </button>
                        <button
                            type="button"
                            onClick={handleResetAllVoiceAndAudioCaches}
                            className="px-3.5 py-1.5 rounded-xl border border-blush-edge bg-blush-tint hover:bg-blush-tint-strong text-blush-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                            title="Clear all Master Voice WAVs, Studio segment renders, and saved scene MP3s for this story"
                        >
                            <RefreshCw size={12} /> Reset All Voice &amp; Audio Caches
                        </button>
                    </div>
                </div>
            )}

            {/* PANEL 2: Gemini API (Google Voice Design & 30 Studio Presets) */}
            {currentBackend === 'gemini' && (
                <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-inset space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                                Gemini 3.8 Flash TTS Configuration
                            </h4>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-sage-800 font-semibold">
                            Google Voice Design &amp; Presets
                        </span>
                    </div>
                    <p className="text-xs text-ink-500">
                        Google Gemini 3.8 Flash TTS synthesizes multi-speaker drama using natural language Voice Design
                        descriptions and 30 curated studio voice presets with style metadata and expressive prosody.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Gemini Dedicated API Key (Optional)
                            </label>
                            <input
                                type="password"
                                value={audioDramaSettings.geminiApiKey || ''}
                                onChange={(e) => updateAudioDramaSetting('geminiApiKey', e.target.value)}
                                placeholder={apiKey ? 'Inheriting master Gemini API key' : 'Paste Gemini API Key...'}
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                            <span className="text-[10px] text-ink-400 mt-1 block">
                                {apiKey ? 'Using main Gemini API key by default.' : 'Requires a Gemini API key.'}
                            </span>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Gemini TTS Model
                            </label>
                            <select
                                value={audioDramaSettings.geminiModel || DEFAULT_TTS_MODELS.geminiTts}
                                onChange={(e) => updateAudioDramaSetting('geminiModel', e.target.value)}
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold cursor-pointer"
                            >
                                <option value={DEFAULT_TTS_MODELS.geminiTts}>
                                    {DEFAULT_TTS_MODELS.geminiTts} (High Fidelity Studio)
                                </option>
                                <option value={DEFAULT_TTS_MODELS.geminiTtsLite}>
                                    {DEFAULT_TTS_MODELS.geminiTtsLite} (Ultra-Fast Flash Lite)
                                </option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* PANEL 3: OpenRouter (ElevenLabs v4 Multi-Voice) */}
            {currentBackend === 'openrouter' && (
                <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-inset space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Volume2 size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                                OpenRouter ElevenLabs v4 Configuration
                            </h4>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300 font-semibold">
                            Automated 21-Voice Mapping
                        </span>
                    </div>
                    <p className="text-xs text-ink-500">
                        Uses OpenRouter&apos;s speech endpoint running <strong>ElevenLabs v4</strong>. Character voice
                        descriptions are automatically mapped to the 21 ElevenLabs studio voices (George, Sarah, Adam,
                        Alice, Bella, etc.) based on gender, age, and timbre, with inline square bracket emotion tags
                        passed automatically.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                OpenRouter Dedicated API Key (Optional)
                            </label>
                            <input
                                type="password"
                                value={audioDramaSettings.openRouterApiKey || ''}
                                onChange={(e) => updateAudioDramaSetting('openRouterApiKey', e.target.value)}
                                placeholder={
                                    openRouterKey ? 'Inheriting master OpenRouter API key' : 'Paste OpenRouter API Key...'
                                }
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                            <span className="text-[10px] text-ink-400 mt-1 block">
                                {openRouterKey
                                    ? 'Using main OpenRouter API key by default.'
                                    : 'Requires an OpenRouter API key.'}
                            </span>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1 font-mono">
                                Model
                            </label>
                            <input
                                type="text"
                                value={audioDramaSettings.openRouterModel || 'elevenlabs/eleven-v4'}
                                onChange={(e) => updateAudioDramaSetting('openRouterModel', e.target.value)}
                                placeholder="elevenlabs/eleven-v4"
                                className="w-full bg-surface border border-edge-strong rounded-xl px-3 py-2 text-xs text-ink-800 font-mono outline-none focus:border-gold"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* PANEL 0: Lightweight System Voices */}
            {(currentBackend === 'system' || audioDramaSettings.pipelineTier === 0) && (
                <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-inset space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Volume2 size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                                Device Native System Voices
                            </h4>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-tint border border-sage-edge text-sage-800 font-semibold">
                            Zero Download • Instant
                        </span>
                    </div>
                    <p className="text-xs text-ink-500">
                        Plays multi-character audio directly using your operating system&apos;s built-in speech
                        synthesis (Web Speech API). Works instantly without downloading any model weights or running a
                        local server.
                    </p>
                </div>
            )}

            {/* PANEL 4: Browser (Kokoro-82M Ensemble) */}
            {(currentBackend === 'kokoro' || currentBackend === 'browser' || audioDramaSettings.pipelineTier === 1) && (
                <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-inset space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu size={16} className="text-gold-ink" />
                            <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                                In-Browser Neural Ensemble (Kokoro-82M)
                            </h4>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-800 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-200 font-semibold">
                            Offline &amp; Free
                        </span>
                    </div>
                    <p className="text-xs text-ink-500">
                        Runs client-side in your browser using Kokoro-82M with WebAssembly / WebGPU acceleration. The
                        cast is automatically distributed across the Kokoro voice ensemble (Heart, Nicole, Sarah, Sky,
                        Adam, Michael, George, Lewis, Emma, Isabella). No API keys or server setup needed.
                    </p>
                    <div className="text-[11px] font-mono text-ink-600 bg-surface p-2.5 rounded-lg border border-edge">
                        Device acceleration:{' '}
                        <span className="uppercase text-gold-ink font-bold">
                            {ttsActiveDevice || 'Auto-Detect (WebGPU / WASM)'}
                        </span>
                    </div>
                </div>
            )}

            {/* Dramatic Cadence & Pause Timing */}
            <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-surface space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                        Dramatic Cadence &amp; Pause Timing
                    </h4>
                </div>
                <p className="text-xs text-ink-500">
                    Control the natural pauses between alternating dialogue lines and descriptive narrative beats to
                    preserve authentic dramatic pacing.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-ink-700">Dialogue Turn Pause</span>
                            <span className="font-mono text-gold-ink font-bold">
                                {audioDramaSettings.dialoguePauseMs || 240} ms
                            </span>
                        </div>
                        <input
                            type="range"
                            min="50"
                            max="800"
                            step="10"
                            value={audioDramaSettings.dialoguePauseMs || 240}
                            onChange={(e) => updateAudioDramaSetting('dialoguePauseMs', parseInt(e.target.value, 10))}
                            className="w-full accent-[#C9A96E] cursor-pointer"
                        />
                        <span className="text-[10px] text-ink-400 block mt-0.5">
                            Cadence pause between rapid character dialogue exchanges.
                        </span>
                    </div>

                    <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-ink-700">Narrator Scene Beat Pause</span>
                            <span className="font-mono text-gold-ink font-bold">
                                {audioDramaSettings.narratorPauseMs || 440} ms
                            </span>
                        </div>
                        <input
                            type="range"
                            min="100"
                            max="1500"
                            step="20"
                            value={audioDramaSettings.narratorPauseMs || 440}
                            onChange={(e) => updateAudioDramaSetting('narratorPauseMs', parseInt(e.target.value, 10))}
                            className="w-full accent-[#C9A96E] cursor-pointer"
                        />
                        <span className="text-[10px] text-ink-400 block mt-0.5">
                            Atmospheric pause between narrative descriptions and character lines.
                        </span>
                    </div>
                </div>
            </div>

            {/* Cast Voice Roster & Automated Voice Profiles with Auditioning */}
            <div className="p-4 sm:p-5 rounded-xl border border-edge-strong bg-surface space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-edge pb-3">
                    <div>
                        <h4 className="text-xs font-bold text-ink-900 uppercase font-mono tracking-wider">
                            Cast Voice Roster &amp; Auditions
                        </h4>
                        <p className="text-xs text-ink-500 mt-0.5">
                            Voices are automatically generated from character traits and mapped directly to the selected
                            audio backend.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* 1. Narrator Entry */}
                    <div className="p-3.5 rounded-xl border border-edge-strong bg-inset/60 flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs font-bold text-ink-900 font-serif">Narrator</span>
                                <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-gold-tint text-gold-ink font-semibold">
                                    Dramatic Storyteller
                                </span>
                                {narratorBadge && (
                                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-mist-200 text-ink-600 font-semibold">
                                        {narratorBadge}
                                    </span>
                                )}
                                {isLocalStudioBackend && (
                                    <button
                                        type="button"
                                        onClick={handleEditNarratorSeed}
                                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold cursor-pointer ${
                                            isDeterministic
                                                ? 'bg-gold-tint border-gold-edge text-gold-ink hover:bg-gold-tint/80'
                                                : 'bg-mist-200 border-edge text-ink-400 line-through'
                                        }`}
                                        title={
                                            isDeterministic
                                                ? `Deterministic seed anchor: #${narratorSeed} (Click to edit seed number)`
                                                : 'Deterministic seed anchoring disabled in settings'
                                        }
                                    >
                                        Seed: #{narratorSeed}
                                    </button>
                                )}
                                {isLocalStudioBackend && narratorSigHash && (
                                    <span
                                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface border border-edge text-ink-600 font-semibold"
                                        title={`Active Voice Signature Hash: ${narratorSigHash} (updates whenever profile, seed, or reference transcript changes)`}
                                    >
                                        Sig: {narratorSigHash}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {isLocalStudioBackend && (
                                    <button
                                        type="button"
                                        onClick={handleRerollNarratorSeed}
                                        className="px-2.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-700 hover:text-ink-900 text-xs font-semibold transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5"
                                        title="Re-roll Narrator Seed"
                                    >
                                        <RotateCcw size={12} className="text-gold-ink" /> Re-roll Seed
                                    </button>
                                )}
                                {isLocalStudioBackend && (
                                    <button
                                        type="button"
                                        disabled={isAuditioningVoice && !isAnyAudioPlaying}
                                        onClick={() => testAuditionCharacterVoice('Narrator', { forceRecalibrate: true })}
                                        className="px-2.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-700 hover:text-ink-900 text-xs font-semibold transition-all shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                        title="Force Breeze 2 to recalibrate a fresh Master WAV for Narrator and play it"
                                    >
                                        <RefreshCw size={12} className="text-gold-ink" /> Recalibrate
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() =>
                                        isAnyAudioPlaying
                                            ? stopAllAudioPlayback()
                                            : testAuditionCharacterVoice('Narrator')
                                    }
                                    className="px-3 py-1.5 rounded-xl border border-gold-edge bg-gold-tint hover:bg-gold-tint/80 text-gold-ink text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                                    title={isAnyAudioPlaying ? 'Stop playing audio' : 'Audition Narrator Master Voice'}
                                >
                                    {isAnyAudioPlaying ? (
                                        <>
                                            <Square size={12} className="fill-current" /> Stop Audio
                                        </>
                                    ) : (
                                        <>
                                            <Volume2 size={13} /> Audition Narrator
                                        </>
                                    )}
                                </button>
                                <EditButton
                                    className="p-1.5 min-w-7 min-h-7 shrink-0"
                                    title="Edit Narrator Voice Profile (Breeze 2 Instruct Prompt)"
                                    value={narratorDesc}
                                    onSave={handleEditNarratorVoiceProfile}
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-ink-600 italic font-serif leading-relaxed">
                            &quot;{narratorDesc}&quot;
                        </p>
                        {isLocalStudioBackend && (
                            <div className="pt-2 border-t border-edge-soft flex items-start justify-between gap-2">
                                <div className="text-[10px] text-ink-500 leading-snug flex-1 min-w-0">
                                    <span className="font-mono font-bold uppercase text-ink-400 mr-1.5">
                                        Ref (~{narratorRefSec}s • {isNarratorRefCustom ? 'Custom' : 'Default'}):
                                    </span>
                                    {isNarratorRefMatchingProfile && (
                                        <span
                                            className="inline-block mr-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-ember-tint border border-ember-edge text-ember-800 font-semibold"
                                            title="Warning: Reference transcript matches the Voice Profile description, so Breeze 2 speaks the description text aloud as the cloning anchor. Click Reset to restore the ~17s default passage."
                                        >
                                            Matches voice profile
                                        </span>
                                    )}
                                    <span className="font-serif text-ink-700 break-words">{narratorRefText}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {(isNarratorRefCustom || narratorRefText !== RAIN_SENTENCE) && (
                                        <button
                                            type="button"
                                            onClick={handleResetNarratorReferenceText}
                                            className="p-1 rounded-md border border-edge bg-surface hover:bg-wash text-ink-500 hover:text-ink-800 cursor-pointer"
                                            title="Reset Narrator reference transcript to default ~17s passage"
                                        >
                                            <RotateCcw size={11} />
                                        </button>
                                    )}
                                    <EditButton
                                        className="p-1 min-w-6 min-h-6 shrink-0"
                                        title="Edit Narrator Voice Reference Transcript (TTS Anchor)"
                                        value={narratorRefText}
                                        onSave={handleEditNarratorReferenceText}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Story Characters */}
                    {activeCast.length > 0 ? (
                        activeCast.map((char, cIdx) => {
                            const charName = char.name || `Character ${cIdx + 1}`;
                            const voiceDesc = getVoiceDescriptionForCharacter(char, story);
                            const charSeed = getDeterministicVoiceSeed(char, story);
                            const charRefText = getVoiceReferenceTextForCharacter(char, story);
                            const charSigHash =
                                resolveSpeakerVoiceIdentity(char, story, audioDramaSettings)?.sigHash || '';
                            const charRefSec = Math.round(estimateReferenceTextSeconds(charRefText));
                            const isCharRefCustom = Boolean(
                                char.user_edited_reference_text ||
                                    story?.user_edited?.[`cast.${charName}.reference_text`]
                            );
                            const isCharRefMatchingProfile = Boolean(
                                charRefText &&
                                    voiceDesc &&
                                    charRefText.trim().replace(/[.!?]+$/g, '').toLowerCase() ===
                                        voiceDesc.trim().replace(/[.!?]+$/g, '').toLowerCase()
                            );
                            const charInterviewSrc = getCharacterInterviewSource(char);
                            const charHasInterview = Boolean(
                                extractPersonalizedReferenceTextFromInterview(charInterviewSrc) || charInterviewSrc
                            );
                            const mappedVoiceBadge = formatBackendBadge(currentBackend, voiceDesc, charName);

                            return (
                                <div
                                    key={char.id || cIdx}
                                    className="p-3.5 rounded-xl border border-edge-strong bg-inset/60 flex flex-col gap-2.5"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                            <span className="text-xs font-bold text-ink-900 font-serif">
                                                {charName}
                                            </span>
                                            {char.role && (
                                                <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-mist-200 text-ink-600 font-semibold">
                                                    {char.role}
                                                </span>
                                            )}
                                            {mappedVoiceBadge && (
                                                <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-gold-tint text-gold-ink font-semibold">
                                                    {mappedVoiceBadge}
                                                </span>
                                            )}
                                            {isLocalStudioBackend && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditCharacterSeed(char)}
                                                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold cursor-pointer ${
                                                        isDeterministic
                                                            ? 'bg-gold-tint border-gold-edge text-gold-ink hover:bg-gold-tint/80'
                                                            : 'bg-mist-200 border-edge text-ink-400 line-through'
                                                    }`}
                                                    title={
                                                        isDeterministic
                                                            ? `Deterministic seed anchor: #${charSeed} (Click to edit seed number)`
                                                            : 'Deterministic seed anchoring disabled in settings'
                                                    }
                                                >
                                                    Seed: #{charSeed}
                                                </button>
                                            )}
                                            {isLocalStudioBackend && charSigHash && (
                                                <span
                                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface border border-edge text-ink-600 font-semibold"
                                                    title={`Active Voice Signature Hash: ${charSigHash} (updates whenever profile, seed, or reference transcript changes)`}
                                                >
                                                    Sig: {charSigHash}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {isLocalStudioBackend && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRerollCharacterSeed(char)}
                                                    className="px-2.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-700 hover:text-ink-900 text-xs font-semibold transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5"
                                                    title={`Re-roll Seed for ${charName}`}
                                                >
                                                    <RotateCcw size={12} className="text-gold-ink" /> Re-roll Seed
                                                </button>
                                            )}
                                            {isLocalStudioBackend && (
                                                <button
                                                    type="button"
                                                    disabled={isAuditioningVoice && !isAnyAudioPlaying}
                                                    onClick={() =>
                                                        testAuditionCharacterVoice(char, { forceRecalibrate: true })
                                                    }
                                                    className="px-2.5 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-700 hover:text-ink-900 text-xs font-semibold transition-all shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                                    title={`Force Breeze 2 to recalibrate a fresh Master WAV for ${charName} and play it`}
                                                >
                                                    <RefreshCw size={12} className="text-gold-ink" /> Recalibrate
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    isAnyAudioPlaying
                                                        ? stopAllAudioPlayback()
                                                        : testAuditionCharacterVoice(char)
                                                }
                                                className="px-3 py-1.5 rounded-xl border border-edge-strong bg-surface hover:bg-wash text-ink-800 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                                                title={
                                                    isAnyAudioPlaying
                                                        ? 'Stop playing audio'
                                                        : `Audition ${charName}'s Master Voice`
                                                }
                                            >
                                                {isAnyAudioPlaying ? (
                                                    <>
                                                        <Square size={12} className="fill-current text-gold-ink" /> Stop
                                                        Audio
                                                    </>
                                                ) : (
                                                    <>
                                                        <Volume2 size={13} className="text-gold-ink" /> Audition Voice
                                                    </>
                                                )}
                                            </button>
                                            <EditButton
                                                className="p-1.5 min-w-7 min-h-7 shrink-0"
                                                title={`Edit Voice Profile for ${charName} (Breeze 2 Instruct Prompt)`}
                                                value={voiceDesc}
                                                onSave={() => handleEditCharacterVoiceProfile(char)}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-ink-600 italic font-serif leading-relaxed">
                                        &quot;{voiceDesc}&quot;
                                    </p>
                                    {isLocalStudioBackend && (
                                        <div className="pt-2 border-t border-edge-soft flex items-start justify-between gap-2">
                                            <div className="text-[10px] text-ink-500 leading-snug flex-1 min-w-0">
                                                <span className="font-mono font-bold uppercase text-ink-400 mr-1.5">
                                                    Ref (~{charRefSec}s
                                                    {isCharRefCustom
                                                        ? ' • Custom'
                                                        : charHasInterview
                                                          ? ' • Interview'
                                                          : ' • Default'}
                                                    ):
                                                </span>
                                                {isCharRefMatchingProfile && (
                                                    <span
                                                        className="inline-block mr-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-ember-tint border border-ember-edge text-ember-800 font-semibold"
                                                        title="Reference transcript is identical to the Voice Profile description, so Breeze 2 speaks the description aloud as the cloning anchor."
                                                    >
                                                        Matches voice profile
                                                    </span>
                                                )}
                                                <span className="font-serif text-ink-700 break-words">{charRefText}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isCharRefCustom && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetCharacterReferenceText(char)}
                                                        className="p-1 rounded-md border border-edge bg-surface hover:bg-wash text-ink-500 hover:text-ink-800 cursor-pointer"
                                                        title={
                                                            charHasInterview
                                                                ? `Reset ${charName}'s reference transcript to interview excerpt`
                                                                : `Reset ${charName}'s reference transcript to default ~17s passage`
                                                        }
                                                    >
                                                        <RotateCcw size={11} />
                                                    </button>
                                                )}
                                                <EditButton
                                                    className="p-1 min-w-6 min-h-6 shrink-0"
                                                    title={`Edit Voice Reference Transcript for ${charName} (TTS Anchor)`}
                                                    value={charRefText}
                                                    onSave={() => handleEditCharacterReferenceText(char)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-6 text-xs text-ink-400 italic font-serif bg-inset/30 rounded-xl border border-edge">
                            No characters created in this story yet. Characters added to your cast will automatically
                            populate here with their unique voice profiles.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
