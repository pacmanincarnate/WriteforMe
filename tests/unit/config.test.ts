import { describe, expect, it } from 'vitest';
import {
    APP_VERSION,
    ARCH_CONCEPTS,
    ARCH_GENRES,
    ARCH_STYLES,
    BANNED_CHARACTER_NAMES,
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_GEMINI_IMAGE_MODELS,
    DEFAULT_LLM_MODELS,
    DEFAULT_READER_SETTINGS,
    DEFAULT_SAVED_MODELS,
    DEFAULT_SERVICE_URLS,
    ELEVENLABS_VOICES,
    GEMINI_PREBUILT_VOICES,
    KOKORO_VOICES,
    KOKORO_VOICE_GROUPS,
    LOCAL_PORTS,
    NARRATIVE_MODES,
    PIPELINE_STEPS_META,
    PIPELINE_STEP_SPEC,
    STORAGE_KEYS,
    STRUCTURAL_MODALITIES,
    TTS_PIPELINE_TIERS,
    VIEW_LABELS,
    formatModalityHand,
    generateRandomArchetypes,
    getPipelineStepInfo,
    inferNarrativeModeForScene,
    mapLogNameToStepId,
    migrateAudioDramaSettings
} from '@/config';

describe('Config Banks & Audio Settings Migration', () => {
    it('exports complete voice catalogs and migrates legacy audio drama settings cleanly', () => {
        expect(KOKORO_VOICES.length).toBeGreaterThanOrEqual(29);
        expect(KOKORO_VOICE_GROUPS).toHaveLength(5);
        expect(TTS_PIPELINE_TIERS).toHaveLength(4);
        expect(ELEVENLABS_VOICES).toHaveLength(21);
        expect(GEMINI_PREBUILT_VOICES).toHaveLength(30);

        const migrated = migrateAudioDramaSettings({
            backend: 'audiocpp',
            audioCppUrl: 'http://127.0.0.1:8081',
            breezeModelId: 'breeze_director',
            dramaCpuExpertLayers: 99,
            mossModelId: 'legacy'
        });
        expect(migrated.pipelineTier).toBe(3);
        expect(migrated.backend).toBe('hybrid');
        expect(migrated.audioCppUrl).toBe('http://127.0.0.1:8080');
        expect(migrated.breezeModelId).toBe('breeze-tts');
        expect(migrated.dramaCpuExpertLayers).toBe(40);
        expect('mossModelId' in migrated).toBe(false);
        expect(DEFAULT_AUDIO_DRAMA_SETTINGS.pipelineTier).toBe(3);
    });

    it('infers narrative modes and formats structural modality hands', () => {
        expect(Object.keys(NARRATIVE_MODES).length).toBeGreaterThanOrEqual(17);
        expect(Object.keys(STRUCTURAL_MODALITIES)).toHaveLength(11);
        expect(inferNarrativeModeForScene({ goal: 'Interrogate the suspect in verbal sparring' })).toBe('VERBAL_SPARRING');
        expect(inferNarrativeModeForScene({ title: 'Quiet morning' })).toBe('REFLECTION');
        expect(inferNarrativeModeForScene({ title: 'Breakfast at the diner' })).toBe('BASELINE_NEUTRAL');

        const hand = formatModalityHand(['SUBTEXTUAL_EVASION', 'CUSTOM_MODE']);
        expect(hand).toContain('[Interpersonal Dynamics: Subtextual Evasion]');
        expect(hand).toContain('[Structural Movement: CUSTOM_MODE]');
    });

    it('maps pipeline step names, archetypes, banned defaults, and view labels', () => {
        expect(ARCH_GENRES.length).toBeGreaterThanOrEqual(40);
        expect(ARCH_STYLES.length).toBeGreaterThanOrEqual(24);
        expect(ARCH_CONCEPTS.length).toBeGreaterThanOrEqual(50);
        expect(generateRandomArchetypes(5)).toHaveLength(5);

        expect(DEFAULT_BANNED_PHRASES).toContain('ozone');
        expect(BANNED_CHARACTER_NAMES).toContain('Elara');
        expect(DEFAULT_READER_SETTINGS.fontFamily).toBe('Merriweather');
        expect(VIEW_LABELS.library).toBe('Bookshelf');

        expect(PIPELINE_STEPS_META).toHaveLength(20);
        expect(Object.keys(PIPELINE_STEP_SPEC)).toHaveLength(20);
        expect(mapLogNameToStepId('Tier 3.2 Sequence Reviewer')).toBe(10);
        expect(mapLogNameToStepId('Tier 7.0 Audio Drama')).toBe(22);
        expect(getPipelineStepInfo('Archivist')?.stepTitle).toBe('Archivist (End of Scene)');
    });

    it('matches the root package.json version', async () => {
        const rootPkg = (await import('../../package.json')).default;
        expect(APP_VERSION).toBe(rootPkg.version);
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('centralizes default models, local ports/service URLs, and storage keys without deprecated Gemini 2.5 defaults', () => {
        expect(DEFAULT_LLM_MODELS.gemini).toBe('gemini-3.8-flash');
        expect(DEFAULT_LLM_MODELS.openrouter).toBe('deepseek/deepseek-flash-latest');
        expect(DEFAULT_SAVED_MODELS).toContain('deepseek/deepseek-flash-latest');
        expect(DEFAULT_GEMINI_IMAGE_MODELS.some((m) => m.id === 'gemini-2.5-flash-image')).toBe(false);

        expect(DEFAULT_SERVICE_URLS.web).toBe(`http://localhost:${LOCAL_PORTS.web}`);
        expect(DEFAULT_SERVICE_URLS.koboldcpp).toBe(`http://localhost:${LOCAL_PORTS.koboldcpp}`);
        expect(DEFAULT_SERVICE_URLS.codexBridge).toBe(`http://localhost:${LOCAL_PORTS.codexBridge}`);
        expect(DEFAULT_SERVICE_URLS.claudeBridge).toBe(`http://localhost:${LOCAL_PORTS.claudeBridge}`);
        expect(DEFAULT_SERVICE_URLS.audioStudioBridge).toBe(`http://127.0.0.1:${LOCAL_PORTS.audioStudioBridge}`);
        expect(DEFAULT_SERVICE_URLS.audioCpp).toBe(`http://127.0.0.1:${LOCAL_PORTS.audioCpp}`);
        expect(DEFAULT_SERVICE_URLS.comfyui).toBe(`http://127.0.0.1:${LOCAL_PORTS.comfyui}`);
        expect(DEFAULT_SERVICE_URLS.mcpBridge).toBe(`ws://127.0.0.1:${LOCAL_PORTS.mcpBridge}`);

        const keyValues = Object.values(STORAGE_KEYS);
        expect(new Set(keyValues).size).toBe(keyValues.length);
    });
});
