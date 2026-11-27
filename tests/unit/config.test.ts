import { describe, expect, it } from 'vitest';
import {
    APP_VERSION,
    ARCH_CONCEPTS,
    ARCH_GENRES,
    ARCH_STYLES,
    BANNED_CHARACTER_NAMES,
    DEFAULT_API_TIMEOUT_SEC,
    DEFAULT_AUDIO_DRAMA_SETTINGS,
    DEFAULT_BANNED_PHRASES,
    DEFAULT_GEMINI_IMAGE_MODELS,
    DEFAULT_IMAGE_STYLES,
    DEFAULT_LLM_MODELS,
    DEFAULT_READER_SETTINGS,
    DEFAULT_SAVED_MODELS,
    DEFAULT_SERVICE_URLS,
    ELEVENLABS_VOICES,
    GEMINI_PREBUILT_VOICES,
    IMAGE_STYLE_CATEGORIES,
    KOKORO_VOICES,
    KOKORO_VOICE_GROUPS,
    LOCAL_PORTS,
    NARRATIVE_ACTS,
    NARRATIVE_MODES,
    NARRATIVE_MODE_CATEGORIES,
    NARRATIVE_MODE_ICONS,
    NARRATIVE_MODE_SHARED_GUARDRAILS,
    NARRATIVE_SEQUENCES,
    PIPELINE_STEPS_META,
    PIPELINE_STEP_SPEC,
    STORAGE_KEYS,
    STRUCTURAL_MODALITIES,
    TTS_PIPELINE_TIERS,
    VIEW_LABELS,
    appendImageStylePrompt,
    formatActFunctionGuideXml,
    formatActiveActAndSequenceXml,
    formatModalityHand,
    formatSequenceCraftGuideXml,
    generateRandomArchetypes,
    getPipelineStepInfo,
    groupNarrativeModesForSelect,
    inferNarrativeModeForScene,
    mapLogNameToStepId,
    migrateAudioDramaSettings,
    resolveNarrativeActForSequence,
    resolveNarrativeModeId,
    resolveNarrativeSequenceForIndex,
    resolveStoredApiTimeout
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
        const expectedIds = [
            'BASELINE_NEUTRAL',
            'MONTAGE_SUMMARY',
            'QUIET_SLICE_OF_LIFE',
            'KINETIC_ACTION',
            'ATMOSPHERIC_SUSPENSE',
            'GRAND_SCALE',
            'COVER_AND_BLUFF',
            'CRAFT_AND_PROCESS',
            'VERBAL_SPARRING',
            'SOCIAL_INTRIGUE',
            'LIGHTHEARTED',
            'PROCEDURAL_MYSTERY',
            'WORLD_BUILDING',
            'ENVIRONMENTAL_IMMERSION',
            'UNCERTAINTY',
            'REFLECTION',
            'MORAL_DILEMMA',
            'EMOTIONAL_RUPTURE',
            'ALTERED_STATE',
            'RELATIONAL',
            'BUILDING_ROMANCE',
            'INTIMACY_COORDINATOR'
        ];
        expect(Object.keys(NARRATIVE_MODES)).toHaveLength(22);
        expect(Object.keys(NARRATIVE_MODES)).toEqual(expectedIds);
        for (const retiredId of ['ORGANIC_EXPOSITION', 'REVELATION', 'CATHARTIC_INTIMACY']) {
            expect(NARRATIVE_MODES[retiredId]).toBeUndefined();
        }
        for (const id of expectedIds) {
            const def = NARRATIVE_MODES[id];
            expect(NARRATIVE_MODE_CATEGORIES).toContain(def.category);
            expect(def.context.trim().length).toBeGreaterThan(20);
            expect(def.prompt.trim().length).toBeGreaterThan(80);
            expect(NARRATIVE_MODE_ICONS[id]).toBeTruthy();
        }
        for (const boundaryId of [
            'BUILDING_ROMANCE',
            'ATMOSPHERIC_SUSPENSE',
            'VERBAL_SPARRING',
            'WORLD_BUILDING',
            'UNCERTAINTY',
            'INTIMACY_COORDINATOR'
        ]) {
            expect(NARRATIVE_MODES[boundaryId].boundaryNote).toBeTruthy();
        }

        expect(Object.keys(STRUCTURAL_MODALITIES)).toHaveLength(11);
        expect(inferNarrativeModeForScene({ goal: 'Interrogate the suspect in verbal sparring' })).toBe('VERBAL_SPARRING');
        expect(inferNarrativeModeForScene({ title: 'Quiet morning' })).toBe('REFLECTION');
        expect(inferNarrativeModeForScene({ title: 'Breakfast at the diner' })).toBe('BASELINE_NEUTRAL');
        expect(inferNarrativeModeForScene({ scene_events: 'Over the next few weeks, a time skip montage of training.' })).toBe('MONTAGE_SUMMARY');
        expect(inferNarrativeModeForScene({ scene_events: 'Sharing a meal during a calm breather of domestic normalcy.' })).toBe('QUIET_SLICE_OF_LIFE');
        expect(inferNarrativeModeForScene({ goal: 'Maintain a fragile cover and bluff past the checkpoint.' })).toBe('COVER_AND_BLUFF');
        expect(inferNarrativeModeForScene({ scene_events: 'Precise surgical repair of the cracked fuel manifold.' })).toBe('CRAFT_AND_PROCESS');
        expect(inferNarrativeModeForScene({ scene_events: 'Court politics at the royal gala behind polite etiquette.' })).toBe('SOCIAL_INTRIGUE');
        expect(inferNarrativeModeForScene({ scene_events: 'A raw confrontation and bitter breakup after betrayal.' })).toBe('EMOTIONAL_RUPTURE');
        expect(inferNarrativeModeForScene({ scene_events: 'Trapped in a fever dream and panic spiral.' })).toBe('ALTERED_STATE');
        expect(inferNarrativeModeForScene({ scene_events: 'Their romance deepens into consensual physical intimacy.' })).toBe('INTIMACY_COORDINATOR');

        expect(resolveNarrativeModeId('CATHARTIC_INTIMACY', NARRATIVE_MODES)).toBe('INTIMACY_COORDINATOR');
        expect(resolveNarrativeModeId('ORGANIC_EXPOSITION', NARRATIVE_MODES)).toBe('BASELINE_NEUTRAL');
        expect(resolveNarrativeModeId('REVELATION', NARRATIVE_MODES)).toBe('EMOTIONAL_RUPTURE');
        expect(resolveNarrativeModeId('KINETIC_ACTION', NARRATIVE_MODES)).toBe('KINETIC_ACTION');

        const grouped = groupNarrativeModesForSelect({
            ...NARRATIVE_MODES,
            CUSTOM_NOIR: { id: 'CUSTOM_NOIR', context: 'Noir', prompt: 'Rain' }
        });
        expect(grouped.hasCategories).toBe(true);
        expect(grouped.grouped).toHaveLength(6);
        expect(grouped.uncategorized).toEqual(['CUSTOM_NOIR']);

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

        expect(DEFAULT_API_TIMEOUT_SEC).toBe(300);
        expect(resolveStoredApiTimeout(null, null)).toEqual({ value: 300, didMigrate: false });
        expect(resolveStoredApiTimeout('120', null)).toEqual({ value: 300, didMigrate: true });
        expect(resolveStoredApiTimeout('120', 'true')).toEqual({ value: 120, didMigrate: false });
        expect(resolveStoredApiTimeout('60', null)).toEqual({ value: 60, didMigrate: false });
        expect(resolveStoredApiTimeout('600', null)).toEqual({ value: 600, didMigrate: false });
        expect(resolveStoredApiTimeout('invalid', null)).toEqual({ value: 300, didMigrate: false });
        expect(resolveStoredApiTimeout('2', null)).toEqual({ value: 300, didMigrate: false });
    });

    it('defines 4 Act Functions, 8 Sequence Craft lenses, refined Canon Guardrail #2, and dynamic Act 2A/2B routing', () => {
        expect(Object.keys(NARRATIVE_ACTS)).toEqual(['ACT_1', 'ACT_2A', 'ACT_2B', 'ACT_3']);
        expect(Object.keys(NARRATIVE_SEQUENCES)).toEqual([
            'SEQUENCE_1',
            'SEQUENCE_2',
            'SEQUENCE_3',
            'SEQUENCE_4',
            'SEQUENCE_5',
            'SEQUENCE_6',
            'SEQUENCE_7',
            'SEQUENCE_8'
        ]);
        for (const act of Object.values(NARRATIVE_ACTS)) {
            expect(act.context.trim().length).toBeGreaterThan(30);
            expect(act.prompt.trim().length).toBeGreaterThan(100);
        }
        for (const seq of Object.values(NARRATIVE_SEQUENCES)) {
            expect(seq.aiPitfallAddressed.trim().length).toBeGreaterThan(10);
            expect(seq.keyCraftElevation.trim().length).toBeGreaterThan(10);
            expect(seq.context.trim().length).toBeGreaterThan(30);
            expect(seq.prompt.trim().length).toBeGreaterThan(100);
        }
        expect(NARRATIVE_MODE_SHARED_GUARDRAILS).toContain('minor, setting-authentic sensory and everyday details');

        const eightSeqs = [1, 1, 2, 2, 2, 2, 3, 3].map((parent_act, i) => ({
            number: i + 1,
            parent_act
        }));
        expect(eightSeqs.map((_, i) => resolveNarrativeActForSequence(i, eightSeqs).id)).toEqual([
            'ACT_1',
            'ACT_1',
            'ACT_2A',
            'ACT_2A',
            'ACT_2B',
            'ACT_2B',
            'ACT_3',
            'ACT_3'
        ]);
        expect(eightSeqs.map((_, i) => resolveNarrativeSequenceForIndex(i, eightSeqs).id)).toEqual([
            'SEQUENCE_1',
            'SEQUENCE_2',
            'SEQUENCE_3',
            'SEQUENCE_4',
            'SEQUENCE_5',
            'SEQUENCE_6',
            'SEQUENCE_7',
            'SEQUENCE_8'
        ]);

        const customTenSeqs = [1, 1, 2, 2, 2, 2, 2, 2, 3, 3].map((parent_act, i) => ({
            number: i + 1,
            parent_act
        }));
        expect(customTenSeqs.map((_, i) => resolveNarrativeActForSequence(i, customTenSeqs).id)).toEqual([
            'ACT_1',
            'ACT_1',
            'ACT_2A',
            'ACT_2A',
            'ACT_2A',
            'ACT_2B',
            'ACT_2B',
            'ACT_2B',
            'ACT_3',
            'ACT_3'
        ]);
        expect(resolveNarrativeSequenceForIndex(4, customTenSeqs).id).toBe('SEQUENCE_4');
        expect(resolveNarrativeSequenceForIndex(5, customTenSeqs).id).toBe('SEQUENCE_5');
        expect(resolveNarrativeSequenceForIndex(7, customTenSeqs).id).toBe('SEQUENCE_6');

        const overridden = [{ number: 1, parent_act: 1, narrative_act_id: 'ACT_2B', narrative_sequence_id: 'SEQUENCE_6' }];
        expect(resolveNarrativeActForSequence(0, overridden).id).toBe('ACT_2B');
        expect(resolveNarrativeSequenceForIndex(0, overridden).id).toBe('SEQUENCE_6');

        const layeredXml = formatActiveActAndSequenceXml(NARRATIVE_ACTS.ACT_2A, NARRATIVE_SEQUENCES.SEQUENCE_3, {
            sceneIndex: 1,
            totalScenes: 5
        });
        expect(layeredXml).toContain('<active_act_function>');
        expect(layeredXml).toContain('ACT_2A');
        expect(layeredXml).toContain('<active_sequence_craft>');
        expect(layeredXml).toContain('Scene 2 of 5');
        expect(formatActFunctionGuideXml()).toContain('<act_function_craft_guide>');
        expect(formatSequenceCraftGuideXml()).toContain('<sequence_craft_elevation_guide>');
    });

    it('provides the 14 curated image style presets across 4 categories and joins prompts cleanly', () => {
        expect(IMAGE_STYLE_CATEGORIES).toEqual([
            'Painting & Fine Art',
            'Illustration & Printmaking',
            'Animation & Retro-Digital',
            'Photography & Cinema'
        ]);
        expect(DEFAULT_IMAGE_STYLES[0]).toEqual({
            id: 'none',
            name: 'None (No added style)',
            description: ''
        });
        const curated = DEFAULT_IMAGE_STYLES.slice(1);
        expect(curated).toHaveLength(14);
        expect(new Set(DEFAULT_IMAGE_STYLES.map((s) => s.id)).size).toBe(DEFAULT_IMAGE_STYLES.length);
        for (const style of curated) {
            expect(IMAGE_STYLE_CATEGORIES).toContain(style.category);
            expect(style.description.trim().length).toBeGreaterThan(200);
        }

        expect(appendImageStylePrompt('A lone knight in the rain.', 'Executed as an oil painting.')).toBe(
            'A lone knight in the rain. Executed as an oil painting.'
        );
        expect(appendImageStylePrompt('A lone knight in the rain', 'Executed as an oil painting.')).toBe(
            'A lone knight in the rain. Executed as an oil painting.'
        );
        expect(appendImageStylePrompt('A lone knight in the rain', 'high contrast, neon colors')).toBe(
            'A lone knight in the rain, high contrast, neon colors'
        );
        expect(appendImageStylePrompt('A lone knight in the rain.', '')).toBe('A lone knight in the rain.');
    });
});
