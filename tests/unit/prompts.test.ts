import { describe, expect, it } from 'vitest';
import {
    AUDIO_DRAMA_SURGICAL_MANDATE,
    AUDIO_DRAMA_SYNTAX_CONTRACT_CARD,
    PROMPTS,
    STRUCTURAL_EDIT_PROTOCOL,
    SURGICAL_EDIT_PROTOCOL,
    buildWritingSystemPrompt,
    getSurgicalPromptForMode,
    stripNarrativeLensSchemaLine
} from '@/prompts';

describe('Prompt Registry & Protocol Builders', () => {
    it('exports all 60 canonical prompt keys with non-empty strings', () => {
        const keys = Object.keys(PROMPTS);
        expect(keys).toHaveLength(60);
        for (const key of keys) {
            const val = PROMPTS[key as keyof typeof PROMPTS];
            expect(typeof val).toBe('string');
            expect(val.trim().length).toBeGreaterThan(20);
        }
    });

    it('preserves all 6 legacy aliases and mode-specific writing system prompts', () => {
        expect(PROMPTS.writing).toBe(PROMPTS.writingAgent);
        expect(PROMPTS.characterDeveloper).toBe(PROMPTS.characterDevelopment);
        expect(PROMPTS.storyArcPlanner).toBe(PROMPTS.storyArc);
        expect(PROMPTS.actDivisionPlanner).toBe(PROMPTS.actAgent);
        expect(PROMPTS.sequencePlanner).toBe(PROMPTS.sequenceAgent);
        expect(PROMPTS.sceneRosterPlanner).toBe(PROMPTS.scenePlannerAgent);

        const proseSys = buildWritingSystemPrompt({ isAudioDrama: false });
        const dramaSys = buildWritingSystemPrompt({ isAudioDrama: true });
        expect(proseSys).toContain('<prose_text>');
        expect(dramaSys).not.toContain('CONVERSATIONAL COLLISION');
        expect(PROMPTS.audioDramaWritingAgent).toContain(PROMPTS.audioDramaWritingModifier);
    });

    it('exposes protocols, audio drama surgical wrapping, and lens schema stripping', () => {
        expect(SURGICAL_EDIT_PROTOCOL).toContain('<edits>');
        expect(STRUCTURAL_EDIT_PROTOCOL).toContain('<structural_edit>');
        expect(AUDIO_DRAMA_SYNTAX_CONTRACT_CARD).toContain('<audio_drama_syntax_contract>');

        const wrapped = getSurgicalPromptForMode('BASE', true);
        expect(wrapped).toContain(AUDIO_DRAMA_SURGICAL_MANDATE);
        expect(getSurgicalPromptForMode('BASE', false)).toBe('BASE');

        const stripped = stripNarrativeLensSchemaLine(
            '- <foo>: a\n- <active_act_function>: x\n- <active_sequence_craft>: y\n- <active_scene_narrative_style>: b\n- <bar>: c'
        );
        expect(stripped).not.toContain('<active_scene_narrative_style>');
        expect(stripped).toContain('<active_act_function>');
        expect(stripped).toContain('<active_sequence_craft>');
        expect(stripped).toContain('<foo>');
        expect(stripped).toContain('<bar>');

        expect(PROMPTS.writingAgent).toContain('<active_act_function>');
        expect(PROMPTS.writingAgent).toContain('<active_sequence_craft>');
        expect(PROMPTS.audioDramaWritingAgent).toContain('<active_act_function>');
        expect(PROMPTS.audioDramaWritingAgent).toContain('<active_sequence_craft>');
        expect(PROMPTS.writingReview).toContain('<active_act_function>');
        expect(PROMPTS.writingReview).toContain('<active_sequence_craft>');
        expect(PROMPTS.writingReviewRelaxed).toContain('<active_act_function>');
        expect(PROMPTS.writingReviewRelaxed).toContain('<active_sequence_craft>');
        expect(PROMPTS.styleAndSensoryPolish).toContain('<active_act_function>');
        expect(PROMPTS.styleAndSensoryPolish).toContain('<active_sequence_craft>');
        expect(PROMPTS.scenePlannerAgent).toContain('<active_act_function>');
        expect(PROMPTS.scenePlannerAgent).toContain('<active_sequence_craft>');
        expect(PROMPTS.actAgent).toContain('<act_function_craft_guide>');
        expect(PROMPTS.actReview).toContain('<act_function_craft_guide>');
        expect(PROMPTS.sequenceAgent).toContain('<sequence_craft_elevation_guide>');
        expect(PROMPTS.sequenceReview).toContain('<sequence_craft_elevation_guide>');

        const strippedWriting = stripNarrativeLensSchemaLine(PROMPTS.writingAgent);
        expect(strippedWriting).not.toContain('- <active_scene_narrative_style>:');
        expect(strippedWriting).toContain('<active_act_function>');
        expect(strippedWriting).toContain('<active_sequence_craft>');
    });
});
