import { describe, expect, it } from 'vitest';
import {
    actForSequence,
    buildCharacterArcsBlock,
    buildDirectiveActionPreview,
    buildGenreToneBlocks,
    buildGenreToneStyleBlocks,
    buildLengthMandateBlock,
    buildRelationshipFrictionBlock,
    buildSceneCountTargetBlock,
    buildStoryInfoBlock,
    calculateTargetWordCount,
    computeAudioProductionEstimate,
    computeDirectiveStoryStats,
    computeNovelProgressEstimate,
    computePacingRanges,
    computeSceneWordTarget,
    computeSequenceLengthPlan,
    computeStoryProgressMetrics,
    ensureCharacter,
    extractCharacterBrief,
    extractRelationship,
    extractStoryProseText,
    formatAudioDuration,
    formatBytesCompact,
    formatLoreForPrompt,
    formatSceneSummary,
    getActiveClueDirectivesForScene,
    getAuthorNoteXml,
    getDirectiveActionScopeMeta,
    getRecentStoryArtifacts,
    getSecretRevealDirectiveForScene,
    insertTargetWordCount,
    isActionBlockedByProtection,
    LENGTH_CONTROL,
    mapAudioStageToCanonical,
    measureNovelLength,
    normalizeBeatsForScene,
    normalizeIntentionalOverrides,
    normalizeScenesForSequence,
    normalizeSceneBlueprint,
    normalizeSecretVault,
    normalizeSequences,
    normalizeStoryArcObject,
    parseActNumber,
    parseLegacyDescriptionFields,
    parseSequencesXML,
    parseStoryArcXml,
    parseStructuredGenre,
    parseStructuredStyle,
    parseStructuredTone,
    parseValueShiftInput,
    reindexStoryForSequenceDelete,
    reindexStoryForSequenceInsert,
    resolveCharacter,
    resolveDirectiveTargetLabel,
    sanitizeStoryContextForPosition,
    translateLoadingStepToHuman
} from '@/domain/story';

describe('Story Domain: clues', () => {
    it('normalizes raw secrets and synthesizes secret from plot twists when vault empty', () => {
        const normalized = normalizeSecretVault([
            {
                id: 'sec_1',
                title: 'Forged Ledger',
                category: 'plot_mystery',
                truth: 'The treasurer embezzled the funds.',
                known_by: 'Marcus Cole',
                concealed_from: 'Elena Vance',
                reveal_target_act: 2,
                reveal_target_sequence: 5,
                clue_schedule: [
                    { sequence_number: 2, behavioral_directive: 'Avoid audit questions', benign_reason: 'Busy with logistics' }
                ]
            }
        ]);
        expect(normalized).toHaveLength(1);
        expect(normalized[0].reveal_anchor.act_number).toBe(2);
        expect(normalized[0].reveal_anchor.sequence_number).toBe(5);
        expect(normalized[0].known_by_characters).toContain('Marcus Cole');

        const synthesized = normalizeSecretVault([], {
            majorSurprisesAndTwists: 'The archivist burned the real map ten years ago.',
            characterArcs: [{ char_id: 'char_1' }]
        });
        expect(synthesized.length).toBeGreaterThanOrEqual(1);
        expect(synthesized[0].truth).toContain('archivist');
    });

    it('returns active clue directives and reveal triggers for matching sequences', () => {
        const story = {
            secret_vault: [
                {
                    id: 'sec_1',
                    title: 'Hidden Heir',
                    truth: 'Julian is the general’s son.',
                    status: 'active',
                    reveal_anchor: { act_number: 2, sequence_number: 4, trigger_condition: 'Confrontation at the pier' },
                    clue_schedule: [
                        { sequence_number: 2, behavioral_directive: 'Flashes a signet ring subconsciously', benign_reason: 'Old family heirloom' }
                    ]
                }
            ]
        };

        const clues = getActiveClueDirectivesForScene(story, 2);
        expect(clues).toHaveLength(1);
        expect(clues[0].secret_id).toBe('sec_1');

        expect(getSecretRevealDirectiveForScene(story, 2, 1)).toBeNull();
        const reveal = getSecretRevealDirectiveForScene(story, 4, 2);
        expect(reveal).not.toBeNull();
        expect(reveal?.truth).toContain('Julian');
    });
});

describe('Story Domain: entities', () => {
    it('extracts character briefs, relationships, resolves honorifics, and ensures missing characters', () => {
        const xmlBlock = `<name>Dr. Elena Vance</name><brief_role>Investigator</brief_role><core_flaw>Refuses help</core_flaw><core_desire>Find the truth</core_desire><vocal_cadence>Crisp alto</vocal_cadence>`;
        const brief = extractCharacterBrief(xmlBlock);
        expect(brief.name).toBe('Dr. Elena Vance');
        expect(brief.role).toBe('Investigator');
        expect(brief.vocal_cadence).toBe('Crisp alto');

        const rel = extractRelationship(`<source_id>Elena</source_id><target_id>Marcus</target_id><dynamic_summary>Wary respect</dynamic_summary><trust_level>4</trust_level>`);
        expect(rel.from).toBe('Elena');
        expect(rel.trust_level).toBe(4);

        const story = {
            title: 'Glass Harbor',
            genre: 'Mystery',
            concept: 'A submerged archive holds a century-old fraud.',
            cast: [{ id: 'c1', name: 'Dr. Elena Vance', role: 'Lead', vocal_cadence: 'Calm alto' }],
            lore: [{ topic: 'Harbor Act', detail: 'Passed in 1922.' }],
            relationships: { 'Dr. Elena Vance->Marcus Cole': { from: 'Dr. Elena Vance', to: 'Marcus Cole', feeling: 'Guarded' } }
        };

        expect(buildStoryInfoBlock(story)).toContain('submerged archive');
        expect(resolveCharacter('elena vance', story.cast)?.id).toBe('c1');
        expect(resolveCharacter('Dr. Elena Vance', story.cast)?.id).toBe('c1');

        const ensured = ensureCharacter('Marcus Cole', story.cast);
        expect(ensured?.name).toBe('Marcus Cole');
        expect(story.cast).toHaveLength(2);
    });

    it('sanitizes secret truth before reveal anchor and exposes it at/after reveal', () => {
        const story = {
            cast: [{ id: 'c1', name: 'Marcus Cole', core_flaw: 'Paranoia', core_desire: 'Safety' }],
            character_arcs: [{ char_id: 'c1', corner_role: 'PROTAGONIST', description: 'Learns trust' }],
            secret_vault: [
                {
                    id: 's1',
                    title: 'Double Agent',
                    truth: 'Marcus reports directly to the syndicate.',
                    status: 'active',
                    reveal_anchor: { act_number: 2, sequence_number: 5 },
                    cover_story: {
                        public_belief: 'Loyal dock inspector',
                        character_masks: {
                            c1: { public_facade: 'Methodical inspector' }
                        }
                    }
                }
            ]
        };

        const masked = sanitizeStoryContextForPosition(story, 1, 2);
        expect(JSON.stringify(masked.cast)).not.toContain('reports directly to the syndicate');

        const unmasked = sanitizeStoryContextForPosition(story, 2, 5);
        expect(JSON.stringify(unmasked.secret_vault)).toContain('reports directly to the syndicate');

        const arcsBlock = buildCharacterArcsBlock(story);
        expect(arcsBlock).toContain('Marcus Cole');
        expect(arcsBlock).toContain('Learns trust');

        const frictionBlock = buildRelationshipFrictionBlock([
            { name: 'Elena Vance', role: 'Protagonist', core_flaw: 'Stubborn', core_desire: 'Closure' },
            { name: 'Marcus Cole', role: 'Deuteragonist', core_flaw: 'Secretive', core_desire: 'Survival' }
        ]);
        expect(frictionBlock).toContain('Elena Vance');
        expect(frictionBlock).toContain('Marcus Cole');
    });
});

describe('Story Domain: length', () => {
    it('measures novel length, plans sequences, computes scene word targets, and builds mandates', () => {
        const proseOne = Array.from({ length: 400 }, () => 'word').join(' ');
        const story = {
            book_type: 'popular',
            target_word_count: LENGTH_CONTROL.DEFAULT_TARGET_WORDS,
            concept: 'A noir mystery on an icebound train.',
            acts: [{ number: 1, title: 'Departure' }],
            sequences: [{ number: 1, title: 'Boarding' }, { number: 2, title: 'The Body' }],
            scenes: {
                '0': [{ title: 'Platform 9', scene_type: 'PROACTIVE' }, { title: 'Berth 4', scene_type: 'REACTIVE' }],
                '1': [{ title: 'Locked Compartment', scene_type: 'PROACTIVE' }]
            },
            prose: {
                '0-0': { final: proseOne, target_words: 1500 },
                '0-1': { draft: 'Short draft here.' }
            },
            cast: [{ name: 'Detective Hale' }],
            lore: [{ topic: 'Trans-Boreal Line', detail: 'Sleeper train.' }]
        };

        const measured = measureNovelLength(story);
        expect(measured.scenesWritten).toBe(2);
        expect(measured.wordsWritten).toBeGreaterThan(400);

        const plan = computeSequenceLengthPlan(story, 1);
        expect(plan.seqIdx).toBe(1);
        expect(plan.floor).toBeGreaterThanOrEqual(2);

        const target = computeSceneWordTarget(story, 1, 0);
        expect(target.targetWords).toBeGreaterThanOrEqual(LENGTH_CONTROL.WORDS_ABS_MIN);
        expect(target.targetWords).toBeLessThanOrEqual(LENGTH_CONTROL.WORDS_ABS_MAX);

        expect(buildSceneCountTargetBlock(plan, 1, { number: 2, title: 'The Body' })).toContain('scenes');
        expect(buildLengthMandateBlock(target, { isAudioDrama: false })).toContain(target.targetWords.toLocaleString());
        expect(computePacingRanges('popular', 80000, 0)).toHaveProperty('scenes_per_sequence');

        const calculated = calculateTargetWordCount({ pacing: 'fast', targetWords: 1600 });
        expect(calculated).toBeGreaterThan(0);
        expect(insertTargetWordCount('Write ~1,200 words (around 120–200 words per beat).', null, 1800)).toContain('1,800');
        expect(extractStoryProseText({ final: 'Hello world' })).toBe('Hello world');

        const metrics = computeStoryProgressMetrics(story);
        expect(metrics.draftedScenes).toBe(2);
        expect(metrics.hasConcept).toBe(true);
    });
});

describe('Story Domain: structure', () => {
    it('handles sequence act mapping, insert/delete reindexing, arcs, styles, sequences, and scenes', () => {
        expect(actForSequence(1)).toBe(1);
        expect(actForSequence(4)).toBe(2);
        expect(actForSequence(8)).toBe(3);

        expect(parseActNumber(2)).toBe(2);
        expect(parseActNumber('Act III')).toBe(3);
        expect(parseActNumber('ii')).toBe(2);

        const baseStory = {
            sequences: [{ number: 1, parent_act: 1, title: 'S1' }, { number: 2, parent_act: 1, title: 'S2' }],
            scenes: { '0': [{ title: 'A' }], '1': [{ title: 'B' }] },
            beats: { '0-0': [{ id: 'b1' }], '1-0': [{ id: 'b2' }] },
            prose: { '0-0': { final: 'text A' }, '1-0': { final: 'text B' } }
        };

        const inserted = reindexStoryForSequenceInsert(baseStory, 1, { title: 'Inserted' });
        expect(inserted.sequences).toHaveLength(3);
        expect((inserted.prose as Record<string, { final: string }>)['2-0']?.final).toBe('text B');

        const deleted = reindexStoryForSequenceDelete(inserted, 1);
        expect(deleted.sequences).toHaveLength(2);
        expect((deleted.prose as Record<string, { final: string }>)['1-0']?.final).toBe('text B');

        const arcObj = normalizeStoryArcObject({ inciting_incident: 'Storm hits', core_thematic_argument: 'Dawn' });
        expect(arcObj.inciting_incident).toBe('Storm hits');

        const parsedArc = parseStoryArcXml('<story_arc><inciting_incident>Hook</inciting_incident><major_surprises_and_twists>Twist</major_surprises_and_twists></story_arc>');
        expect(parsedArc.inciting_incident).toBe('Hook');
        expect(parsedArc.major_surprises_and_twists).toBe('Twist');

        expect(parseStructuredGenre('<primary_engine>Noir</primary_engine>').primaryEngine).toBe('Noir');
        expect(parseStructuredTone('<authorial_triangulation>Rainy</authorial_triangulation>').authorialTriangulation).toBe('Rainy');
        expect(parseStructuredStyle('<focalizer_bias>Close third</focalizer_bias>').focalizerBias).toBe('Close third');

        expect(buildGenreToneStyleBlocks({ genre: 'Noir', mood: 'Dark', writing_guide: 'Spare' })).toContain('<genre_classification>');
        expect(buildGenreToneBlocks({ genre: 'Noir', mood: 'Dark' })).toContain('<tone_and_atmosphere>');

        const loreText = formatLoreForPrompt('Iron Pier harbor town', [{ topic: 'Gate', detail: 'Locked at dusk' }]);
        expect(loreText).toContain('Gate');
        expect(getAuthorNoteXml({ author_note: 'Keep scenes taut.' })).toContain('<author_note>');

        const seqs = normalizeSequences([{ title: 'Opening', dramatic_question: 'Will she board?' }]);
        expect(seqs).toHaveLength(8);
        expect(seqs[0].number).toBe(1);

        const xmlSeqs = parseSequencesXML('<sequences><sequence number="1"><title>Arrival</title><dramatic_question>Who waits?</dramatic_question></sequence></sequences>');
        expect(xmlSeqs).toHaveLength(8);
        expect(xmlSeqs[0].title).toBe('Arrival');

        const shift = parseValueShiftInput('ignorance -> truth');
        expect(shift.start_state).toBe('ignorance');
        expect(shift.end_state).toBe('truth');

        const legacyFields = parseLegacyDescriptionFields('Setting: Pier\nGoal: Escape');
        expect(legacyFields.setting).toBe('Pier');
        expect(legacyFields.objective).toBe('Escape');
        expect(formatSceneSummary({ objective: 'Run', scene_events: 'Caught at pier' })).toContain('Run');

        const sceneBp = normalizeSceneBlueprint({ title: 'Dockside', value_shift: 'hope -> dread' }, 0, 1);
        expect(sceneBp.number).toBe('1.1');
        expect(normalizeScenesForSequence([sceneBp], 1)).toHaveLength(1);

        const beats = normalizeBeatsForScene([{ beat_type: 'Action', initiator: 'Elena', action: 'Runs' }]);
        expect(beats).toHaveLength(1);

        const overrides = normalizeIntentionalOverrides([{ target: 'chapter-length', reason: 'Coda' }]);
        expect(overrides).toHaveLength(1);
    });
});

describe('Story Domain: directives and progress', () => {
    it('checks written-prose protection, computes directive stats/previews, and formats progress estimates', () => {
        const story = {
            acts: [{ number: 1, title: 'Act 1' }, { number: 2, title: 'Act 2' }],
            sequences: [
                { number: 1, title: 'Seq 1', dramatic_question: 'Q1' },
                { number: 2, title: 'Seq 2', dramatic_question: 'Q2' }
            ],
            scenes: {
                '0': [{ id: 's0', title: 'Opening' }],
                '1': [{ id: 's1', title: 'Next Scene' }]
            },
            prose: {
                '0-0': { final: 'Completed opening prose words here.' }
            },
            cast: [{ id: 'c1', name: 'Elena', details: { deep_profile: 'Interview complete' } }],
            editorial_harness: { enabled: false }
        };

        expect(isActionBlockedByProtection({ action_type: 'DELETE_SCENE', target_seq_idx: 0, target_scene_idx: 0 }, story, true)).toBe(true);
        expect(isActionBlockedByProtection({ action_type: 'SURGICAL_PATCH_PROSE', target_seq_idx: 0, target_scene_idx: 0 }, story, true)).toBe(false);

        const meta = getDirectiveActionScopeMeta({ action_type: 'MODIFY_SCENE' });
        expect(meta.targetMode).toBe('scene');

        const dStats = computeDirectiveStoryStats(story);
        expect(dStats.writtenSceneCount).toBe(1);
        expect(dStats.firstCastName).toBe('Elena');

        expect(resolveDirectiveTargetLabel({ action_type: 'MODIFY_SCENE', target_seq_idx: 0, target_scene_idx: 0 }, story)).toContain('Opening');
        const diff = buildDirectiveActionPreview({ action_type: 'MODIFY_STORY_METADATA', details: { title: 'New Title' } }, story);
        expect(Array.isArray(diff)).toBe(true);

        expect(formatAudioDuration(0)).toBe('0s');
        expect(formatAudioDuration(125)).toBe('2m 05s');
        expect(formatAudioDuration(3665)).toBe('1h 01m');
        expect(formatBytesCompact(2048)).toBe('2 KB');
        expect(formatBytesCompact(2 * 1024 * 1024)).toBe('2.0 MB');
        expect(mapAudioStageToCanonical('synthesizing', 'Chunk 2')).toBe('synthesis');

        const stepStatus = translateLoadingStepToHuman('Prose Drafting', { sceneIndex: 0, totalScenes: 4 });
        expect(stepStatus.humanHeadline.length).toBeGreaterThan(0);

        const estimate = computeNovelProgressEstimate(story);
        expect(estimate.completedScenes).toBe(1);
        expect(estimate.overallPct).toBeGreaterThan(0);

        const audioEst = computeAudioProductionEstimate(story, { '0-0': { duration: 42, size: 4096 } });
        expect(audioEst.readyCount).toBe(1);

        const artifacts = getRecentStoryArtifacts(story);
        expect(artifacts.latestProse?.wordCount).toBe(5);
        expect(artifacts.latestCharacter?.name).toBe('Elena');
    });
});
