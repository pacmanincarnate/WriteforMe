import { describe, expect, it } from 'vitest';
import {
    ARCH_CONCEPTS,
    ARCH_GENRES,
    ARCH_STYLES,
    BANNED_CHARACTER_NAMES,
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_READER_SETTINGS,
    ELEVENLABS_VOICES,
    GEMINI_PREBUILT_VOICES,
    KOKORO_VOICES,
    KOKORO_VOICE_GROUPS,
    NARRATIVE_MODES,
    PIPELINE_STEPS_META,
    PIPELINE_STEP_SPEC,
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
});
