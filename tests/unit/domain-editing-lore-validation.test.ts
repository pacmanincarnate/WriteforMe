import { describe, expect, it } from 'vitest';
import {
    _parseSurgicalEditXmlBlocks,
    applyParsedEdits,
    applyStructuralEdits,
    applySurgicalEditsDetailed,
    applyVoiceDirectorSurgicalEdits,
    computeChangeRatio,
    locateNeedle,
    SURGICAL_MAX_CHANGE_RATIO
} from '@/domain/editing';
import {
    buildUploadLoreChunks,
    chunkLoreText,
    computeLoreFingerprint,
    cosineSimilarity,
    deriveLoreTitle,
    deriveSectionTitle,
    deriveSemanticChunkTopic,
    expandQueryLocally,
    extractLeadingHeading,
    GraphManager,
    migrateLoreTitles,
    normalizeLoreRelations,
    partitionLoreIntoSemanticSections,
    splitParagraphIntoSentenceChunks,
    splitTextIntoBoundaryAwareChunks
} from '@/domain/lore';
import {
    analyzeProseQuality,
    computeRollingDialogueStatus,
    ensureActOutputCompleteness,
    ensureSequenceOutputCompleteness,
    ensureStoryArcOutputCompleteness,
    extractReviewStatus,
    findFlatValueShiftScenes,
    getDynamicBannedPhrases,
    parseIssuesFromReview,
    parseValenceState,
    parseWritingOutput,
    validatePromptCacheOrder,
    validateStructuralOutput
} from '@/domain/validation';
import { getAdaptiveCoverTypography, getCoverStyleIndex } from '@/domain/story';

describe('Story Domain: coverTypography', () => {
    it('deterministically maps seeds to style index 0..7 and scales typography by title length', () => {
        expect(getCoverStyleIndex(null)).toBe(0);
        const idxA = getCoverStyleIndex('story_alpha_123');
        const idxB = getCoverStyleIndex('story_alpha_123');
        expect(idxA).toBe(idxB);
        expect(idxA).toBeGreaterThanOrEqual(0);
        expect(idxA).toBeLessThan(8);

        const shortTypo = getAdaptiveCoverTypography(0, 'Ash', false);
        const longTypo = getAdaptiveCoverTypography(0, 'The Extraordinary Chronology of Unbelievably Endless Midnight Shadows', true);
        expect(shortTypo.fontSize).toBe('1.125rem');
        expect(longTypo.fontSize).toBe('0.75rem');
        expect(longTypo.letterSpacing).toBe('0.06em');

        const style4Large = getAdaptiveCoverTypography(4, 'A', true);
        expect(style4Large.lineHeight).toBeTruthy();
    });
});

describe('Editing Domain: surgicalEdits', () => {
    it('locates exact, normalized typography, whitespace, and anchored needles', () => {
        const text = 'Elena stepped into   the dimly-lit hall.\u2014No turning back now.';
        expect(locateNeedle(text, 'stepped into')).toMatchObject({ via: 'exact' });
        expect(locateNeedle(text, 'hall.\u2014No')).toMatchObject({ via: 'exact' });
        expect(locateNeedle('She whispered, \u201CHold still.\u201D', 'She whispered, "Hold still."')).toMatchObject({
            via: 'normalized'
        });
        expect(locateNeedle('First sentence. Second   line\nhere. End.', 'Second line here.')).toMatchObject({
            via: 'whitespace'
        });
        expect(
            locateNeedle(
                'The antique brass lantern flickered wildly above the dark pier while wind tore across the rain-slick cobblestone courtyard outside the northern gate.',
                'The antique brass lantern flickered wildly somewhere far away while wind tore differently across the rain-slick cobblestone courtyard outside the northern gate.',
                true
            )
        ).toMatchObject({ via: 'anchored' });
    });

    it('computes change ratios and applies parsed XML surgical edits with spacing protection', () => {
        expect(SURGICAL_MAX_CHANGE_RATIO).toBe(0.6);
        expect(computeChangeRatio('Hello world', 'Hello world')).toBe(0);
        expect(computeChangeRatio('abc', 'xyz')).toBe(1);

        const prose = 'Marcus checked his watch. Rain hammered the cab roof. He opened the door.';
        const xml = `
<surgical_edits>
  <edit>
    <type>rewrite_passage</type>
    <original>Rain hammered the cab roof.</original>
    <rewritten>Cold sleet pelted the taxi roof.</rewritten>
  </edit>
  <edit>
    <type>insert_after</type>
    <anchor>Marcus checked his watch.</anchor>
    <content>It was nearly midnight.</content>
  </edit>
</surgical_edits>`;

        const parsed = _parseSurgicalEditXmlBlocks(xml);
        expect(parsed).toHaveLength(2);
        const parsedReport = applyParsedEdits(prose, parsed);
        expect(parsedReport.applied).toHaveLength(2);
        expect(parsedReport.failed).toHaveLength(0);
        expect(parsedReport.text).toContain('Marcus checked his watch. It was nearly midnight.');
        expect(parsedReport.text).toContain('Cold sleet pelted the taxi roof.');

        const detailed = applySurgicalEditsDetailed(prose, xml);
        expect(detailed.applied).toHaveLength(2);
    });

    it('applies structural XML edits and enforces Voice Director safety gates', () => {
        const outline = '<sequence><scene><number>1</number><brief>Old brief</brief></scene><scene><number>2</number><brief>Second</brief></scene></sequence>';
        const structRes = applyStructuralEdits(
            outline,
            `<structural_edit><action>replace</action><target_tag>scene</target_tag><target_identifier_tag>number</target_identifier_tag><target_identifier_value>1</target_identifier_value><new_content><scene><number>1</number><brief>Updated brief</brief></scene></new_content></structural_edit>`
        );
        expect(structRes.applied).toHaveLength(1);
        expect(structRes.text).toContain('Updated brief');

        const script = [
            'Narrator: [calmly] The rain fell over the harbor docks as ships groaned against pilings.',
            'Elena: [quietly] We leave at dawn before the harbor patrol wakes.'
        ].join('\n\n');

        const safeVoiceXml = `
<surgical_edits>
  <edit>
    <search>Elena: [quietly] We leave at dawn before the harbor patrol wakes.</search>
    <replace>Elena: [hushed, urgently] We leave at dawn before the harbor patrol wakes.</replace>
  </edit>
</surgical_edits>`;
        const safeReport = applyVoiceDirectorSurgicalEdits(script, safeVoiceXml);
        expect(safeReport.applied).toHaveLength(1);
        expect(safeReport.rejected).toHaveLength(0);

        const unsafeVoiceXml = `
<surgical_edits>
  <edit>
    <original>We leave at dawn before the harbor patrol wakes.</original>
    <rewritten>Totally different plot twist about baking cinnamon bread in Paris tomorrow afternoon.</rewritten>
  </edit>
</surgical_edits>`;
        const unsafeReport = applyVoiceDirectorSurgicalEdits(script, unsafeVoiceXml);
        expect(unsafeReport.rejected.length).toBeGreaterThan(0);
    });
});

describe('Lore Domain: queryExpansion, chunking, vectorMath, and GraphManager', () => {
    it('expands queries locally, chunks lore documents, and computes similarity fingerprints', () => {
        const expanded = expandQueryLocally('elena secret forged ledger vault');
        expect(expanded).toContain('elena');
        expect(expanded).toContain('ledger');

        const heading = extractLeadingHeading('## The Glass Citadel\nA fortress built over magma.');
        expect(heading).toContain('Glass Citadel');
        expect(deriveLoreTitle('### Obsidian Archives\nAncient scrolls reside here.')).toContain('Obsidian Archives');

        const migrated = migrateLoreTitles([{ id: '1', topic: 'Old title...', detail: 'Iron Harbor ships dock at dusk. Everything smells of brine.' }]);
        expect(migrated[0].topic).toBe('Iron Harbor ships dock at dusk');

        const sentenceChunks = splitParagraphIntoSentenceChunks(
            'First sentence about glass. Second sentence about ash. Third sentence about wind.',
            60
        );
        expect(sentenceChunks.length).toBeGreaterThanOrEqual(2);

        const longDoc = [
            '# House Veyra',
            'House Veyra controls the eastern salt roads and maintains three fortified toll towers along the river basin.',
            '',
            '# The Silver Pact',
            'Signed two centuries ago between merchant guilds and coastal magistrates to regulate obsidian ore shipments.'
        ].join('\n');

        const boundaryChunks = splitTextIntoBoundaryAwareChunks(longDoc, 60, 110, 20);
        expect(boundaryChunks.length).toBeGreaterThanOrEqual(2);
        expect(deriveSemanticChunkTopic(boundaryChunks[0].text, boundaryChunks[0].heading, 'Lore')).toBeTruthy();

        const multiPartDoc = [
            '# House Veyra',
            'House Veyra controls the eastern salt roads and maintains fortified toll towers across the basin. '.repeat(22),
            '',
            '# The Silver Pact',
            'Signed centuries ago between coastal guilds and magistrates to govern obsidian ore shipments. '.repeat(22)
        ].join('\n\n');
        const loreChunks = chunkLoreText(multiPartDoc, (partNum) => `Part ${partNum}`, null, 'World Bible');
        expect(loreChunks.length).toBeGreaterThanOrEqual(2);
        const uploadChunks = buildUploadLoreChunks(multiPartDoc, 'Bible.txt');
        expect(uploadChunks.length).toBeGreaterThan(0);

        expect(deriveSectionTitle('# Section Alpha\nDetails here.', 1)).toBe('Section Alpha');
        const sections = partitionLoreIntoSemanticSections(longDoc, 120);
        expect(sections.length).toBeGreaterThanOrEqual(1);

        expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
        expect(
            computeLoreFingerprint('story_1', [{ topic: 'Veyra', detail: 'Salt roads' }], 'gemini')
        ).toBe(
            computeLoreFingerprint('story_1', [{ topic: 'Veyra', detail: 'Salt roads' }], 'gemini')
        );
    });

    it('normalizes relations and builds undirected topic graph', () => {
        expect(normalizeLoreRelations('Citadel')).toEqual(['Citadel']);
        expect(normalizeLoreRelations([' Citadel ', '', 42])).toEqual(['Citadel']);

        const gm = new GraphManager();
        gm.buildGraph([
            { topic: 'Citadel', related_to: ['Order of Ash'] },
            { topic: 'Harbor', related_to: ['Citadel'] }
        ]);
        expect(gm.getNeighbors('Citadel')).toEqual(['Order of Ash', 'Harbor']);
        expect(gm.getNeighbors('Order of Ash')).toEqual(['Citadel']);
    });
});

describe('Validation Domain: structuralValidator, completenessNormalizers, proseQuality', () => {
    it('validates structural outputs, extracts review verdicts, and flags flat value shifts', () => {
        const storyArcRes = validateStructuralOutput(
            'Story Arc Agent',
            {
                core_thematic_argument: 'mercy beats vengeance',
                starting_value_state: 'guarded',
                ending_value_state: 'forgiving',
                inciting_incident: 'A stolen relic surfaces'
            },
            { concept: 'Noir mystery', cast: [{ name: 'Elena', role: 'Detective' }] }
        );
        expect(storyArcRes.valid).toBe(true);
        expect(storyArcRes.warnings.length).toBeGreaterThan(0);

        const reviewXml = `
<status>FAIL</status>
<critique_analysis>Scene opening skips spatial entry.</critique_analysis>
<issues>
  <issue>
    <severity>CRITICAL</severity>
    <category>CONTINUITY</category>
    <description>Elena enters without unlocking the sealed door.</description>
    <location>Paragraph 1</location>
    <fix_suggestion>Show Elena picking the rusted padlock.</fix_suggestion>
  </issue>
</issues>`;
        const status = extractReviewStatus(reviewXml);
        expect(status.status).toBe('FAIL');
        expect(status.issues).toHaveLength(1);
        expect(parseIssuesFromReview(reviewXml)).toHaveLength(1);

        const flat = findFlatValueShiftScenes([
            { scene_type: 'PROACTIVE', value_shift: { start_state: 'Trust', end_state: 'Trust' } },
            { scene_type: 'REACTIVE', value_shift: { start_state: 'Grief', end_state: 'Grief' } }
        ]);
        expect(flat).toHaveLength(1);
        expect(flat[0].index).toBe(0);
    });

    it('normalizes Act, StoryArc, and Sequence completeness', () => {
        const acts = ensureActOutputCompleteness(
            '<act number="1" title="Setup">Initial setup.</act>',
            { core_thematic_argument: 'Mercy outlasts vengeance' }
        );
        expect(typeof acts.rawOutput).toBe('string');
        expect(typeof acts.repaired).toBe('boolean');

        const arc = ensureStoryArcOutputCompleteness(
            '<story_arc><core_thematic_argument>Truth endures</core_thematic_argument></story_arc>',
            { cast: [{ name: 'Elena', role: 'Detective' }] }
        );
        expect(arc.rawOutput).toContain('Truth endures');

        const seq = ensureSequenceOutputCompleteness(
            `<sequences><sequence number="1" title="Arrival"><summary>Elena arrives at the fogged pier under cover of darkness to inspect the burned freighter.</summary></sequence></sequences>`,
            {}
        );
        expect(seq.rawOutput).toContain('Arrival');
    });

    it('analyzes prose quality, dynamic banned phrases, rolling dialogue, output parsing, and prompt cache ordering', () => {
        const repetitive = 'The amber lantern flickered. Cold iron echoed. The amber lantern flickered again over the amber lantern.';
        expect(getDynamicBannedPhrases(repetitive)).toContain('amber lantern');

        const rolling = computeRollingDialogueStatus(
            '"Stay quiet," Elena whispered. "Check the lock."',
            [{ wordCount: 200, dialogueWords: 80 }]
        );
        expect(rolling.windowSceneCount).toBe(2);
        expect(rolling.totalWindowWords).toBeGreaterThan(200);

        const analysis = analyzeProseQuality(
            'Rain drummed against the iron hull. "We move now," Elena said sharply. Cold salt stung her lips as waves crashed.'
        );
        expect(analysis.wordCount).toBeGreaterThan(10);
        expect(analysis.dialogueRatio).toBeGreaterThan(0);

        expect(parseWritingOutput('<prose_text>Clean prose output.</prose_text>')).toEqual({
            prose: 'Clean prose output.'
        });
        expect(parseValenceState('+2')).toBe(2);
        expect(parseValenceState('Dread')).toBe('Dread');

        expect(
            validatePromptCacheOrder('<story_details>ok</story_details>\n<draft_to_revise>bad</draft_to_revise>').valid
        ).toBe(true);
        expect(
            validatePromptCacheOrder('<draft_to_revise>bad</draft_to_revise>\n<story_details>late</story_details>').valid
        ).toBe(false);
    });
});
