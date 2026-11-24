import { describe, expect, it, vi } from 'vitest';
import {
    buildRolledBackStoryState,
    cleanPreservedCastMember,
    cleanRelationshipsForRollback,
    cleanScenesForProseRollback,
    isGeneratedCastMemberForStage,
    isPreservedPreWritingLoreItem,
    migrateStoryToSequences,
    rebuildBaselineCharacterStates,
    resetSecretVaultForRollback,
    restorePreservedLoreItem,
    STORY_RESET_STAGES,
    type RollbackCastMember,
    type RollbackStoryState
} from '@/domain/lifecycle';
import { formatAllVerboseLogs, formatVerboseLogEntry } from '@/domain/story';
import { surgicallyRepairBeatMRUs, surgicallyRepairValueShifts } from '@/domain/validation';

function makeLifecycleStory(): RollbackStoryState {
    return {
        id: 'story_life_1',
        title: 'Tide Ledger',
        status_quo: 'Storms lash the northern customs dock.',
        target_word_count: 80000,
        cast: [
            {
                id: 'C1',
                name: 'Elena Vance',
                role: 'Protagonist',
                is_initial_cast: true,
                core_flaw: 'Trusts nobody',
                core_desire: 'Uncover the truth',
                details: {
                    history: 'Worked in customs.\n[New]: broke into warehouse.',
                    story_events: 'Identified in conceptual worldbuilding\n- Saw Marcus flee.'
                }
            },
            {
                id: 'C_dyn_999',
                name: 'Dockhand Pete',
                role: 'Minor',
                details: { story_events: 'Spawned during Scene 1.2' }
            }
        ],
        lore: [
            { id: 'L1', topic: 'Status Quo Setting', detail: 'Rainy pier.', is_merged: true },
            { id: 'L2', topic: 'Dynamic Scene Detail', detail: 'A temporary lantern.', description: 'Scene Extraction' }
        ],
        relationships: {
            'Elena Vance->Dockhand Pete': { current: 'Brief encounter', history: [{ chapter: 'Scene 1.2', change: 'Met' }] },
            'Elena Vance->Elena Vance': {
                initial_feeling: 'Self-reliant',
                current: 'Shaken by betrayal',
                history: [
                    { chapter: 'Act 1, Starting', change: 'Self-reliant' },
                    { chapter: 'Scene 1.2', change: 'Shaken' }
                ]
            }
        },
        secret_vault: [
            {
                id: 'sec_1',
                title: 'Forged Seal',
                status: 'revealed',
                revealed_in_scene: '1.2',
                clue_schedule: [{ sequence_number: 1, behavioral_directive: 'Guard stamp', seeded_in_prose: true }]
            }
        ],
        acts: [{ number: 1, title: 'Act I', description: 'Setup' }],
        sequences: [{ number: 1, parent_act: 1, title: 'Seq 1' }],
        scenes: {
            '0': [
                { number: '1.1', title: 'Dock Arrival', cast_ids: ['C1', 'C_dyn_999'], characters_present: ['Elena Vance', 'Dockhand Pete'] },
                { number: '1.2', title: 'Bridge Transition', is_bridge_scene: true }
            ]
        },
        prose: { '0-0': { final: 'Old prose text.' } },
        beats: { '0-0': [{ id: '1' }] },
        story_so_far: 'Elena checked the vault.',
        continuity_ledger: [{ key: 'wrist', value: 'sprained' }],
        user_edited: { 'cast.Dockhand Pete.goals': true, 'cast.Elena Vance.goals': true }
    };
}

describe('Lifecycle Domain: rollback and migration', () => {
    it('evaluates preservation helpers and builds stage-accurate rolled-back stories', () => {
        expect(Object.keys(STORY_RESET_STAGES)).toEqual(['tts', 'prose', 'scenes', 'sequences', 'acts']);
        expect(isPreservedPreWritingLoreItem({ topic: 'World Bible Setting', detail: 'harbor' })).toBe(true);
        expect(isPreservedPreWritingLoreItem({ topic: 'Runtime', description: 'Scene Extraction' })).toBe(false);

        const story = makeLifecycleStory();
        const restoredLore = restorePreservedLoreItem(story.lore![0], story);
        expect(restoredLore.detail).toBe(story.status_quo);
        expect(restoredLore.is_merged).toBeUndefined();

        expect(isGeneratedCastMemberForStage(story.cast![0], 'prose', story)).toBe(false);
        expect(isGeneratedCastMemberForStage(story.cast![1], 'prose', story)).toBe(true);

        const cleanedChar = cleanPreservedCastMember(story.cast![0], 0, story);
        expect(cleanedChar.details?.history).toBe('Worked in customs.');
        expect(cleanedChar.details?.story_events).toBe('Identified in conceptual worldbuilding');

        const states = rebuildBaselineCharacterStates([story.cast![0] as RollbackCastMember]);
        expect(states['Elena Vance'].physical_state).toBe('Baseline active condition');

        const cleanedRels = cleanRelationshipsForRollback(story.relationships, [story.cast![0]], false);
        expect(cleanedRels['Elena Vance->Dockhand Pete']).toBeUndefined();
        expect(cleanedRels['Elena Vance->Elena Vance'].current).toBe('Self-reliant');

        const resetVault = resetSecretVaultForRollback(story.secret_vault);
        expect(resetVault[0].status).toBe('dormant');
        expect(resetVault[0].revealed_in_scene).toBeUndefined();
        expect((resetVault[0].clue_schedule as Array<{ seeded_in_prose?: boolean }> | undefined)?.[0]?.seeded_in_prose).toBe(false);

        const cleanedScenes = cleanScenesForProseRollback(story.scenes, story.sequences, ['C_dyn_999'], ['Dockhand Pete']);
        expect(cleanedScenes['0']).toHaveLength(1);
        expect(cleanedScenes['0'][0].characters_present).toEqual(['Elena Vance']);

        const ttsRes = buildRolledBackStoryState(story, 'tts');
        expect(ttsRes.flags.clearTtsOnly).toBe(true);

        const actsRes = buildRolledBackStoryState(story, 'acts');
        expect(actsRes.flags.clearActs).toBe(true);
        expect(actsRes.nextStory.acts).toEqual([]);
        expect(actsRes.nextStory.sequences).toEqual([]);
        expect(actsRes.nextStory.scenes).toEqual({});
        expect(actsRes.nextStory.prose).toEqual({});
        expect(actsRes.removedCharNames).toEqual(['Dockhand Pete']);
        expect(actsRes.nextStory.lore).toHaveLength(1);
    });

    it('migrates legacy chaptered stories into 8-sequence normalized structures and voice profiles', () => {
        const legacy = {
            id: 'leg_1',
            title: 'Legacy Tale',
            chapters: {
                '0': [
                    { title: 'Opening Chapter', chapter_objective: 'Search the wreck' }
                ]
            },
            scenes: {
                '0-0': [{ title: 'Pier Check' }]
            },
            prose: { '0-0-0': '' },
            story_so_far: 'Premature summary',
            cast: [{ name: 'Maren', role: 'Lead', details: { deep_profile: 'She speaks with brisk harbor cadence.' } }],
            lore: [{ topic: 'Harbor...', detail: 'Oakhaven is built on timber pilings.' }]
        };

        const migrated = migrateStoryToSequences(legacy) as unknown as Record<string, unknown>;
        expect(Array.isArray(migrated.sequences)).toBe(true);
        expect((migrated.sequences as unknown[]).length).toBe(8);
        expect(migrated.chapters).toBeUndefined();
        expect(migrated.story_so_far).toBe('');
        expect(typeof migrated.narrator_vocal_cadence).toBe('string');
        expect((migrated.lore as Array<{ topic: string }>)[0].topic).toContain('Oakhaven');
    });
});

describe('Story Domain: logFormatter', () => {
    it('formats individual log entries and chronological summaries', () => {
        expect(formatVerboseLogEntry(null)).toBe('(Empty log entry)');
        const formattedSingle = formatVerboseLogEntry({
            function: 'Writing Agent',
            status: 'success',
            durationSec: 2.5,
            promptTokens: 1200,
            responseTokens: 450,
            tokensUsed: 1650,
            provider: 'gemini',
            modelUsed: 'gemini-2.5-flash',
            prompt: 'Write Scene 1.1',
            response: 'Rain drummed the pier.'
        });
        expect(formattedSingle).toContain('Writing Agent');
        expect(formattedSingle).toContain('1,650');

        const exported = formatAllVerboseLogs(
            [{ function: 'Story Arc', status: 'error', error: 'Timeout' }],
            'Salt Clock',
            'error'
        );
        expect(exported).toContain('Salt Clock');
        expect(exported).toContain('Failures/Errors: 1');
    });
});

describe('Validation Domain: structuralRepair', () => {
    it('repairs defective MRU beats and flat scene value shifts via injected callAIFn', async () => {
        const beatMock = vi.fn(async () => `<response><repaired_beats><beat>
<beat_id>1</beat_id>
<char_A_tactic>Confront the gatekeeper with the torn ledger page.</char_A_tactic>
<char_A_action>Elena slams the salt-stained ledger down beside Kell's tea mug, forcing the ink column into his lamplight.</char_A_action>
<char_B_reaction>Kell's fingers stiffen around the mug handle while his jaw works silently over the missing tally dates.</char_B_reaction>
<power_shift>Elena seizes conversational leverage.</power_shift>
</beat></repaired_beats></response>`);

        const beats = [{ beat_id: '1', char_A_action: 'Talks.', char_B_reaction: 'Nods.' }];
        const beatRes = await surgicallyRepairBeatMRUs(
            [{ index: 0, beat: beats[0] }],
            beats,
            { title: 'Customs Desk' },
            '<beats><beat><beat_id>1</beat_id><char_A_action>Talks.</char_A_action></beat></beats>',
            beatMock
        );
        expect(beatRes.success).toBe(true);
        expect(beatRes.repairedCount).toBe(1);
        expect(beats[0].char_A_action).toContain('slams the salt-stained ledger');

        const vsMock = vi.fn(async () => `<response><repaired_scenes><scene>
<number>1.1</number>
<value_shift><start_state>Guarded curiosity</start_state><end_state>Cornered suspicion</end_state></value_shift>
</scene></repaired_scenes></response>`);
        const scenes = [{ number: '1.1', scene_type: 'PROACTIVE', value_shift: { start_state: 'Calm', end_state: 'Calm' } }];
        const vsRes = await surgicallyRepairValueShifts(
            [{ index: 0, scene: scenes[0] }],
            scenes,
            { sequence: { number: 1, title: 'Opening' } },
            '<scenes><scene><number>1.1</number><start_state>Calm</start_state><end_state>Calm</end_state></scene></scenes>',
            vsMock
        );
        expect(vsRes.success).toBe(true);
        expect(scenes[0].value_shift.end_state).toBe('Cornered suspicion');
    });
});
