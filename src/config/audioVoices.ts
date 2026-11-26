/**
 * @module config/audioVoices
 * Static TTS voice catalogs (Kokoro, ElevenLabs, Gemini 3.8 Studio),
 * 4-tier pipeline definitions, default audio studio settings, and migration.
 */

import { DEFAULT_TTS_MODELS } from './defaults';
import { DEFAULT_SERVICE_URLS } from './endpoints';

export interface KokoroVoiceEntry {
    id: string;
    name: string;
    shortName: string;
    group: string;
    lang: string;
    gender?: 'F' | 'M';
    isNative?: boolean;
    isDefault?: boolean;
}

export interface KokoroVoiceGroup {
    label: string;
    voices: KokoroVoiceEntry[];
}

export interface TtsPipelineTier {
    id: 'system' | 'kokoro' | 'breeze' | 'hybrid';
    tier: 0 | 1 | 2 | 3;
    label: string;
    shortLabel: string;
    category: string;
    badge: string;
    desc: string;
    fallbackTo: 'system' | 'kokoro' | 'breeze' | null;
}

export interface AudioDramaSettings {
    enabled: boolean;
    pipelineTier: number;
    backend: 'system' | 'kokoro' | 'breeze' | 'hybrid';
    audioCppUrl: string;
    studioBridgeUrl: string;
    breezeModelId: string;
    breezeAudioTemperature: number;
    dramaModelId: string;
    dramaAudioTemperature: number;
    dramaAudioTopP: number;
    dramaAudioTopK: number;
    dramaOffloadProfile: 'auto' | 'pinned_cache' | 'resident_hybrid' | 'custom';
    dramaCpuExpertLayers: number | null;
    dramaExpertCacheSize: number | null;
    dramaCodecBackend: 'same' | 'cpu';
    dramaContextLength: number;
    dramaThreads: number | null;
    verifierModelId: string;
    studioSwapMode: 'patternA' | 'patternB' | string;
    asrMode: 'auto' | 'server' | 'browser' | 'off';
    dialoguePauseMs: number;
    narratorPauseMs: number;
    scenePauseGapMs: number;
    roomToneDb: number;
    targetLufsDialogue: number;
    targetLufsNarration: number;
    truePeakLimitDb: number;
    geminiApiKey: string;
    geminiModel: string;
    openRouterApiKey: string;
    openRouterModel: string;
    autoFallbackToBrowser: boolean;
    [key: string]: unknown;
}

export interface ElevenLabsVoiceEntry {
    id: string;
    name: string;
    gender: 'male' | 'female' | 'neutral';
    age: string;
    accent: string;
    timbre: string;
    style: string;
}

export interface GeminiPrebuiltVoiceEntry {
    id: string;
    gender: 'male' | 'female';
    tone: string;
}

export const SILENT_WAV_DATA_URI =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export const KOKORO_VOICES: readonly KokoroVoiceEntry[] = [
    { id: 'system_native', name: 'System Voice (Instant / 0MB)', shortName: 'System', group: 'Device Native', lang: 'native', isNative: true },
    { id: 'af_heart', name: 'Heart (Default)', shortName: 'Heart', group: 'American Female', lang: 'en-US', gender: 'F', isDefault: true },
    { id: 'af_bella', name: 'Bella', shortName: 'Bella', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_nicole', name: 'Nicole (Whisper)', shortName: 'Nicole', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_aoede', name: 'Aoede', shortName: 'Aoede', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_kore', name: 'Kore', shortName: 'Kore', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_sarah', name: 'Sarah', shortName: 'Sarah', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_nova', name: 'Nova', shortName: 'Nova', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_sky', name: 'Sky', shortName: 'Sky', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_alloy', name: 'Alloy', shortName: 'Alloy', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_jessica', name: 'Jessica', shortName: 'Jessica', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'af_river', name: 'River', shortName: 'River', group: 'American Female', lang: 'en-US', gender: 'F' },
    { id: 'am_adam', name: 'Adam', shortName: 'Adam', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_echo', name: 'Echo', shortName: 'Echo', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_eric', name: 'Eric', shortName: 'Eric', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_fenrir', name: 'Fenrir', shortName: 'Fenrir', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_liam', name: 'Liam', shortName: 'Liam', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_michael', name: 'Michael', shortName: 'Michael', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_onyx', name: 'Onyx', shortName: 'Onyx', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_puck', name: 'Puck', shortName: 'Puck', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'am_santa', name: 'Santa', shortName: 'Santa', group: 'American Male', lang: 'en-US', gender: 'M' },
    { id: 'bf_alice', name: 'Alice', shortName: 'Alice', group: 'British Female', lang: 'en-GB', gender: 'F' },
    { id: 'bf_emma', name: 'Emma', shortName: 'Emma', group: 'British Female', lang: 'en-GB', gender: 'F' },
    { id: 'bf_isabella', name: 'Isabella', shortName: 'Isabella', group: 'British Female', lang: 'en-GB', gender: 'F' },
    { id: 'bf_lily', name: 'Lily', shortName: 'Lily', group: 'British Female', lang: 'en-GB', gender: 'F' },
    { id: 'bm_daniel', name: 'Daniel', shortName: 'Daniel', group: 'British Male', lang: 'en-GB', gender: 'M' },
    { id: 'bm_fable', name: 'Fable', shortName: 'Fable', group: 'British Male', lang: 'en-GB', gender: 'M' },
    { id: 'bm_george', name: 'George', shortName: 'George', group: 'British Male', lang: 'en-GB', gender: 'M' },
    { id: 'bm_lewis', name: 'Lewis', shortName: 'Lewis', group: 'British Male', lang: 'en-GB', gender: 'M' }
];

export const KOKORO_VOICE_GROUPS: readonly KokoroVoiceGroup[] = [
    { label: 'Device Native (Fast / 0MB)', voices: KOKORO_VOICES.filter((v) => v.group === 'Device Native') },
    { label: 'American Female', voices: KOKORO_VOICES.filter((v) => v.group === 'American Female') },
    { label: 'American Male', voices: KOKORO_VOICES.filter((v) => v.group === 'American Male') },
    { label: 'British Female', voices: KOKORO_VOICES.filter((v) => v.group === 'British Female') },
    { label: 'British Male', voices: KOKORO_VOICES.filter((v) => v.group === 'British Male') }
];

export const TTS_PIPELINE_TIERS: readonly TtsPipelineTier[] = [
    {
        id: 'system',
        tier: 0,
        label: 'Lightweight: System Voices',
        shortLabel: 'System Voices',
        category: 'Lightweight',
        badge: 'Device Native',
        desc: "Instant playback using your device's built-in speech synthesis. 0MB download, 0ms latency, zero server required.",
        fallbackTo: null
    },
    {
        id: 'kokoro',
        tier: 1,
        label: 'CPU-based: Kokoro TTS',
        shortLabel: 'Kokoro TTS',
        category: 'CPU-based',
        badge: 'Neural Ensemble',
        desc: 'Client-side neural speech synthesis running in-browser via WebAssembly / WebGPU with multi-voice character casting.',
        fallbackTo: 'system'
    },
    {
        id: 'breeze',
        tier: 2,
        label: 'Expressive: Breeze 2 TTS',
        shortLabel: 'Breeze 2 TTS',
        category: 'Expressive',
        badge: 'Acoustic Anchoring',
        desc: 'Local high-fidelity Breeze 2 speech model via Audio.cpp with prompt-driven voice design and emotion conditioning.',
        fallbackTo: 'kokoro'
    },
    {
        id: 'hybrid',
        tier: 3,
        label: 'Dramatic Reading: Hybrid Breeze 2 and Drama-3',
        shortLabel: 'Hybrid Breeze 2 & Drama-3',
        category: 'Dramatic Reading',
        badge: 'Full Cast Production',
        desc: 'Dual-engine local studio: Breeze 2 crafts acoustic master identities and solo narration, while Fish Audio Drama-3 synthesizes expressive multi-speaker dialogue.',
        fallbackTo: 'breeze'
    }
];

export const DEFAULT_AUDIO_DRAMA_SETTINGS: AudioDramaSettings = {
    enabled: true,
    pipelineTier: 3,
    backend: 'hybrid',
    audioCppUrl: DEFAULT_SERVICE_URLS.audioCpp,
    studioBridgeUrl: DEFAULT_SERVICE_URLS.audioStudioBridge,
    breezeModelId: 'breeze-tts',
    breezeAudioTemperature: 0.35,
    dramaModelId: 'drama-3',
    dramaAudioTemperature: 0.9,
    dramaAudioTopP: 0.9,
    dramaAudioTopK: 30,
    dramaOffloadProfile: 'auto',
    dramaCpuExpertLayers: null,
    dramaExpertCacheSize: null,
    dramaCodecBackend: 'same',
    dramaContextLength: 8192,
    dramaThreads: null,
    verifierModelId: 'whisper_verifier',
    studioSwapMode: 'patternA',
    asrMode: 'auto',
    dialoguePauseMs: 150,
    narratorPauseMs: 250,
    scenePauseGapMs: 2000,
    roomToneDb: -58.0,
    targetLufsDialogue: -18.0,
    targetLufsNarration: -16.5,
    truePeakLimitDb: -1.5,
    geminiApiKey: '',
    geminiModel: DEFAULT_TTS_MODELS.geminiTts,
    openRouterApiKey: '',
    openRouterModel: 'elevenlabs/eleven-v4',
    autoFallbackToBrowser: true
};

/**
 * Normalizes legacy audio drama settings (`audiocpp`, deprecated `moss*` keys,
 * old port `:8081`, and out-of-range numeric bounds) to the current schema.
 */
export function migrateAudioDramaSettings(saved: Record<string, unknown> | null | undefined): AudioDramaSettings {
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_AUDIO_DRAMA_SETTINGS };
    const migrated: Record<string, unknown> = { ...DEFAULT_AUDIO_DRAMA_SETTINGS, ...saved };

    const tierBackends: Array<'system' | 'kokoro' | 'breeze' | 'hybrid'> = ['system', 'kokoro', 'breeze', 'hybrid'];
    if (typeof saved.pipelineTier === 'number' && saved.pipelineTier >= 0 && saved.pipelineTier <= 3) {
        const tier = Math.round(saved.pipelineTier);
        migrated.pipelineTier = tier;
        migrated.backend = tierBackends[tier];
    } else if (saved.backend === 'audiocpp' || saved.backend === 'hybrid') {
        migrated.pipelineTier = 3;
        migrated.backend = 'hybrid';
    } else if (saved.backend === 'breeze') {
        migrated.pipelineTier = 2;
        migrated.backend = 'breeze';
    } else if (saved.backend === 'browser' || saved.backend === 'kokoro') {
        migrated.pipelineTier = 1;
        migrated.backend = 'kokoro';
    } else if (saved.backend === 'system') {
        migrated.pipelineTier = 0;
        migrated.backend = 'system';
    } else if (typeof migrated.pipelineTier === 'number' && migrated.pipelineTier >= 0 && migrated.pipelineTier <= 3) {
        migrated.backend = tierBackends[migrated.pipelineTier as number];
    } else {
        migrated.pipelineTier = 3;
        migrated.backend = 'hybrid';
    }

    if (!migrated.studioBridgeUrl) migrated.studioBridgeUrl = DEFAULT_SERVICE_URLS.audioStudioBridge;
    if (!migrated.audioCppUrl || migrated.audioCppUrl === 'http://127.0.0.1:8081') {
        migrated.audioCppUrl = DEFAULT_SERVICE_URLS.audioCpp;
    }
    if (!migrated.breezeModelId || migrated.breezeModelId === 'breeze_director') {
        migrated.breezeModelId = 'breeze-tts';
    }
    if (!migrated.dramaModelId) migrated.dramaModelId = 'drama-3';
    if (!migrated.verifierModelId) migrated.verifierModelId = 'whisper_verifier';
    if (!migrated.studioSwapMode) migrated.studioSwapMode = 'patternA';
    if (!migrated.asrMode) migrated.asrMode = 'auto';
    if (migrated.scenePauseGapMs === undefined) migrated.scenePauseGapMs = 2000;
    if (migrated.breezeAudioTemperature === undefined) migrated.breezeAudioTemperature = 0.35;
    if (migrated.dramaAudioTemperature === undefined) migrated.dramaAudioTemperature = 0.9;
    if (migrated.dramaAudioTopP === undefined) migrated.dramaAudioTopP = 0.9;
    if (migrated.dramaAudioTopK === undefined) migrated.dramaAudioTopK = 30;

    const validProfiles = ['auto', 'pinned_cache', 'resident_hybrid', 'custom'];
    migrated.dramaOffloadProfile = validProfiles.includes(String(migrated.dramaOffloadProfile))
        ? migrated.dramaOffloadProfile
        : 'auto';

    migrated.dramaCpuExpertLayers =
        migrated.dramaCpuExpertLayers !== null &&
        migrated.dramaCpuExpertLayers !== undefined &&
        migrated.dramaCpuExpertLayers !== '' &&
        Number.isFinite(Number(migrated.dramaCpuExpertLayers))
            ? Math.max(0, Math.min(40, Math.round(Number(migrated.dramaCpuExpertLayers))))
            : null;

    migrated.dramaExpertCacheSize =
        migrated.dramaExpertCacheSize !== null &&
        migrated.dramaExpertCacheSize !== undefined &&
        migrated.dramaExpertCacheSize !== '' &&
        Number.isFinite(Number(migrated.dramaExpertCacheSize))
            ? Math.max(8, Math.min(256, Math.round(Number(migrated.dramaExpertCacheSize))))
            : null;

    migrated.dramaCodecBackend =
        migrated.dramaCodecBackend === 'cpu' || migrated.dramaCodecBackend === 'same'
            ? migrated.dramaCodecBackend
            : 'same';

    migrated.dramaContextLength =
        migrated.dramaContextLength !== null &&
        migrated.dramaContextLength !== undefined &&
        Number.isFinite(Number(migrated.dramaContextLength))
            ? Math.max(2048, Math.min(32768, Math.round(Number(migrated.dramaContextLength))))
            : 8192;

    migrated.dramaThreads =
        migrated.dramaThreads !== null &&
        migrated.dramaThreads !== undefined &&
        migrated.dramaThreads !== '' &&
        Number.isFinite(Number(migrated.dramaThreads))
            ? Math.max(1, Math.min(32, Math.round(Number(migrated.dramaThreads))))
            : null;

    delete migrated.mossModelId;
    delete migrated.mossAudioTemperature;
    delete migrated.mossAudioTopP;
    delete migrated.mossAudioTopK;
    delete migrated.mossAudioRepetitionPenalty;
    delete migrated.enableMultiExpressionSlots;

    return migrated as AudioDramaSettings;
}

export const ELEVENLABS_VOICES: readonly ElevenLabsVoiceEntry[] = [
    { id: 'george', name: 'George', gender: 'male', age: 'middle', accent: 'british', timbre: 'warm, raspy, articulate', style: 'classic British storytelling narrator' },
    { id: 'sarah', name: 'Sarah', gender: 'female', age: 'young', accent: 'american', timbre: 'soft, expressive, grounded', style: 'intimate, emotional protagonist' },
    { id: 'adam', name: 'Adam', gender: 'male', age: 'middle', accent: 'american', timbre: 'deep, commanding, resonant', style: 'authoritative, decisive, intense' },
    { id: 'alice', name: 'Alice', gender: 'female', age: 'middle', accent: 'british', timbre: 'confident, poised, clear', style: 'dignified, sharp, intellectual' },
    { id: 'bella', name: 'Bella', gender: 'female', age: 'young', accent: 'american', timbre: 'bright, dynamic, emotional', style: 'youthful, spirited, vulnerable' },
    { id: 'bill', name: 'Bill', gender: 'male', age: 'elder', accent: 'american', timbre: 'weathered, raspy, earnest', style: 'grandfatherly, wise, hardened mentor' },
    { id: 'brian', name: 'Brian', gender: 'male', age: 'middle', accent: 'american', timbre: 'deep, cinematic, steady', style: 'epic trailer & literary narration' },
    { id: 'callum', name: 'Callum', gender: 'male', age: 'young', accent: 'transatlantic', timbre: 'edgy, gravelly, intense', style: 'rebellious, anti-hero, troubled' },
    { id: 'charlie', name: 'Charlie', gender: 'male', age: 'middle', accent: 'australian', timbre: 'casual, warm, natural', style: 'easygoing confidante, honest foil' },
    { id: 'chris', name: 'Chris', gender: 'male', age: 'middle', accent: 'american', timbre: 'charming, friendly, modern', style: 'conversational, charismatic ally' },
    { id: 'daniel', name: 'Daniel', gender: 'male', age: 'middle', accent: 'british', timbre: 'refined, measured, formal', style: 'aristocratic, clinical, composed' },
    { id: 'eric', name: 'Eric', gender: 'male', age: 'young', accent: 'american', timbre: 'energetic, crisp, alert', style: 'quick-thinking, sharp, fast-paced' },
    { id: 'harry', name: 'Harry', gender: 'male', age: 'young', accent: 'british', timbre: 'fierce, impassioned, direct', style: 'youthful grit, determined, tense' },
    { id: 'jessica', name: 'Jessica', gender: 'female', age: 'young', accent: 'american', timbre: 'playful, clever, fast', style: 'witty confidante, sharp-tongued ally' },
    { id: 'laura', name: 'Laura', gender: 'female', age: 'middle', accent: 'american', timbre: 'sensual, calm, reflective', style: 'measured, watchful, melancholic' },
    { id: 'liam', name: 'Liam', gender: 'male', age: 'young', accent: 'american', timbre: 'modern, articulate, sincere', style: 'earnest protagonist, searching youth' },
    { id: 'lily', name: 'Lily', gender: 'female', age: 'middle', accent: 'british', timbre: 'velvety, warm, lyrical', style: 'magical, maternal, poetic narration' },
    { id: 'matilda', name: 'Matilda', gender: 'female', age: 'young', accent: 'american', timbre: 'quirky, vibrant, energetic', style: 'eccentric specialist, impulsive spirit' },
    { id: 'river', name: 'River', gender: 'neutral', age: 'young', accent: 'american', timbre: 'calm, androgynous, relaxed', style: 'contemplative, detached observer' },
    { id: 'roger', name: 'Roger', gender: 'male', age: 'elder', accent: 'british', timbre: 'erudite, aristocratic, vintage', style: 'scholarly archivist, ancient authority' },
    { id: 'will', name: 'Will', gender: 'male', age: 'middle', accent: 'american', timbre: 'steady, grounded, trustworthy', style: 'loyal companion, dependable ally' }
];

export const GEMINI_PREBUILT_VOICES: readonly GeminiPrebuiltVoiceEntry[] = [
    { id: 'Puck', gender: 'male', tone: 'Upbeat' },
    { id: 'Charon', gender: 'male', tone: 'Informative' },
    { id: 'Kore', gender: 'female', tone: 'Firm' },
    { id: 'Fenrir', gender: 'male', tone: 'Excitable' },
    { id: 'Aoede', gender: 'female', tone: 'Breezy' },
    { id: 'Leda', gender: 'female', tone: 'Youthful' },
    { id: 'Orus', gender: 'male', tone: 'Firm' },
    { id: 'Zephyr', gender: 'female', tone: 'Bright' },
    { id: 'Callirrhoe', gender: 'female', tone: 'Easy-going' },
    { id: 'Autonoe', gender: 'female', tone: 'Bright' },
    { id: 'Enceladus', gender: 'male', tone: 'Breathy' },
    { id: 'Iapetus', gender: 'male', tone: 'Clear' },
    { id: 'Umbriel', gender: 'male', tone: 'Easy-going' },
    { id: 'Algieba', gender: 'female', tone: 'Smooth' },
    { id: 'Despina', gender: 'female', tone: 'Smooth' },
    { id: 'Erinome', gender: 'female', tone: 'Clear' },
    { id: 'Algenib', gender: 'male', tone: 'Gravelly' },
    { id: 'Rasalgethi', gender: 'male', tone: 'Informative' },
    { id: 'Laomedeia', gender: 'female', tone: 'Upbeat' },
    { id: 'Achernar', gender: 'female', tone: 'Soft' },
    { id: 'Alnilam', gender: 'male', tone: 'Firm' },
    { id: 'Schedar', gender: 'male', tone: 'Even' },
    { id: 'Gacrux', gender: 'male', tone: 'Mature' },
    { id: 'Pulcherrima', gender: 'female', tone: 'Forward' },
    { id: 'Achird', gender: 'male', tone: 'Friendly' },
    { id: 'Zubenelgenubi', gender: 'male', tone: 'Casual' },
    { id: 'Vindemiatrix', gender: 'female', tone: 'Gentle' },
    { id: 'Sadachbia', gender: 'female', tone: 'Lively' },
    { id: 'Sadaltager', gender: 'male', tone: 'Knowledgeable' },
    { id: 'Sulafat', gender: 'female', tone: 'Warm' }
];
