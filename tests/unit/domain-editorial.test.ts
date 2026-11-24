import { describe, expect, it, vi } from 'vitest';
import {
    applyManuscriptPatchToScene,
    buildDeterministicSurgicalRepair,
    compileAestheticConstitution,
    compileGateFailureFeedback,
    compileNarrativeStateGraph,
    compileThreeWaveEditPlan,
    computeCharacter8DVoiceVector,
    computeEbbinghausMemoryDecay,
    computeVoiceDriftDistance,
    conveneAdversarialTribunal,
    createHarnessInspectionTools,
    denormalizeSceneFromXml,
    escapeHarnessXml,
    evaluateSceneLayer0AndDivergence,
    extractAuthorVoiceDNA,
    extractEditorialPatchPayload,
    getDraftedStoryScenesList,
    hasBalancedQuotes,
    inferSpeakerForSentence,
    normalizePreservingNewlines,
    normalizeSceneToXml,
    runAutonomousInvestigationStage,
    runFourGateVerificationSuite,
    runFullManuscriptNlpTelemetry,
    runSceneNlpTelemetry,
    splitProseIntoSentences,
    type EditorialStoryInput
} from '@/domain/editorial';

function makeEditorialStory(): EditorialStoryInput {
    const proseScene0 = [
        'Elena crossed the damp cobblestones toward the harbor lantern while cold wind rattled the iron gate.',
        '"Did Tomas sign the ledger before midnight?" Elena asked briskly, holding up the soaked manifest.',
        '"You know I cannot verify customs dates without the deputy clerk present," Marcus replied calmly. A cold wind still rattled the latch.'
    ].join('\n\n');

    return {
        id: 'ed_story_1',
        writing_mode: 'novel',
        style: { genre: 'Literary Mystery', mood: 'Atmospheric Noir' },
        cast: [
            { id: 'c_elena', name: 'Elena Vance', role: 'Protagonist', core_flaw: 'Obsessive', core_desire: 'Justice' },
            { id: 'c_marcus', name: 'Marcus Cole', role: 'Ally', core_flaw: 'Secretive', core_desire: 'Safety' }
        ],
        acts: [{ number: 1, title: 'Low Tide', description: 'Inquiry begins' }],
        sequences: [{ number: 1, parent_act: 1, title: 'Pier Arrival' }],
        scenes: {
            '0': [
                {
                    number: '1.1',
                    title: 'Lantern at Pier Four',
                    pov_character: 'Elena Vance',
                    objective: 'Obtain signature proof',
                    value_shift: { start_state: 'Curious', end_state: 'Suspicious' }
                }
            ]
        },
        prose: { '0-0': { final: proseScene0 } },
        threads: [{ id: 'T1', name: 'Forged Ledger', description: 'Customs fraud' }]
    };
}

describe('Editorial Domain: Phase 1–5 Autonomous Editorial Harness', () => {
    it('normalizes scene XML, denormalizes back to prose, infers speakers, and enumerates drafted scenes', () => {
        expect(escapeHarnessXml('A & B <"test">')).toBe('A &amp; B &lt;&quot;test&quot;&gt;');
        expect(splitProseIntoSentences('Dr. Vance stepped inside. Cold rain fell.')).toHaveLength(2);
        expect(normalizePreservingNewlines('hello   world\r\n\r\n\r\nnext')).toBe('hello world\n\nnext');

        const story = makeEditorialStory();
        expect(
            inferSpeakerForSentence('"Where is the stamp?" Elena asked.', '', story.cast || [])
        ).toBe('c_elena');

        const scenes = getDraftedStoryScenesList(story);
        expect(scenes).toHaveLength(1);
        const norm = normalizeSceneToXml(0, 0, scenes[0].proseText, story);
        expect(norm.paragraphs).toHaveLength(3);
        expect(norm.xml).toContain('<SceneDocument');
        const roundTrip = denormalizeSceneFromXml(norm.xml);
        expect(roundTrip).toContain('Elena crossed the damp cobblestones');
    });

    it('runs constitution, telemetry, 8D voice drift, NSG, Ebbinghaus decay, and Voice DNA', async () => {
        const story = makeEditorialStory();
        const constitution = compileAestheticConstitution(story, [{ scope: 'GLOBAL', rule_type: 'NONE', reason: 'test' }]);
        expect(constitution.xml).toContain('<AestheticConstitution');

        const fullTel = runFullManuscriptNlpTelemetry(story);
        expect(fullTel.scenesList).toHaveLength(1);
        const tel = runSceneNlpTelemetry(fullTel.scenesList[0], story);
        expect(tel.wordCount).toBeGreaterThan(25);
        expect(tel.xml).toContain('<SceneProseTelemetry');

        const vec = computeCharacter8DVoiceVector([{ text: '"Why hide the key?"' }, { text: '"Don\'t lie to me!"' }]);
        expect(vec.turnCount).toBe(2);
        expect(vec.question_ratio).toBeCloseTo(0.5);
        expect(computeVoiceDriftDistance(vec, { avg_dialogue_turn_words: 15 }, undefined)).toBeGreaterThan(0);

        const voiceMock = vi.fn(async () => '<AuthorVoiceDNA><GoldStandardExemplars></GoldStandardExemplars></AuthorVoiceDNA>');
        const dna = await extractAuthorVoiceDNA(story, fullTel, voiceMock);
        expect(dna.extractedFromScenes).toBe(1);
        expect(dna.xml).toContain('<AuthorVoiceDNA');

        const nsg = compileNarrativeStateGraph(story, fullTel);
        expect(nsg.sceneContracts).toHaveLength(1);
        const traces = computeEbbinghausMemoryDecay(nsg, 100);
        expect(traces.length).toBeGreaterThan(0);
    });

    it('runs Layer 0, inspection tools, tribunal, 3-wave planner, deterministic/LLM patching, and 4-gate verification', async () => {
        const story = makeEditorialStory();
        const fullTel = runFullManuscriptNlpTelemetry(story);
        const scItem = fullTel.scenesList[0];
        const nsg = compileNarrativeStateGraph(story, fullTel);
        const constitution = compileAestheticConstitution(story);

        const blindMock = vi.fn(async (prompt: string) => {
            if (prompt.includes('BlindReaderAgent')) {
                return '<SceneReaderExperienceLog><TakeawaySummary>Tension rises cleanly.</TakeawaySummary></SceneReaderExperienceLog>';
            }
            return '<IntentExecutionDivergenceReport><Axis id="d2_subtext" score="0.32" /></IntentExecutionDivergenceReport>';
        });

        const l0 = await evaluateSceneLayer0AndDivergence(
            nsg.sceneContracts[0],
            scItem,
            nsg,
            fullTel.sceneTelemetryMap[scItem.sceneId],
            blindMock,
            true
        );
        expect(l0.dTotal).toBeGreaterThan(0);

        const layer0Map = { [scItem.sceneId]: l0 };
        const tools = createHarnessInspectionTools(story, nsg, fullTel, layer0Map);
        expect(tools.grep_manuscript({ pattern: 'cobblestones' })).toContain('sc_0_0:p1:s1');

        const { dossiers } = await runAutonomousInvestigationStage(story, nsg, fullTel, layer0Map, null, false);
        expect(dossiers.length).toBeGreaterThan(0);

        const tribMock = vi.fn(
            async () =>
                '<TribunalDeliberationList><ProsecutorArgument>Valid.</ProsecutorArgument><DefenseArgument>Minimal touch.</DefenseArgument><JudicialRationale>Approved.</JudicialRationale><RubricScores E="5" I="4" D="4" C="5" R="4" /></TribunalDeliberationList>'
        );
        const { tribunalCases, verifiedTickets } = await conveneAdversarialTribunal(
            dossiers,
            constitution,
            null,
            nsg,
            tribMock,
            true
        );
        expect(tribunalCases.length).toBe(dossiers.length);
        expect(verifiedTickets.length).toBeGreaterThan(0);

        const editPlan = compileThreeWaveEditPlan(verifiedTickets, nsg, fullTel);
        expect(editPlan.allTransactions.length).toBeGreaterThan(0);

        expect(hasBalancedQuotes('"Hello world."')).toBe(true);
        expect(hasBalancedQuotes('"Unclosed')).toBe(false);
        expect(buildDeterministicSurgicalRepair('That was a testament to his palpable tension.', {}, 2)).not.toContain('testament to');

        const rawPatch = `<ManuscriptPatchTransaction>
  <OriginalSpanVerifier>Elena crossed the damp cobblestones toward the harbor lantern while cold wind rattled the iron gate.</OriginalSpanVerifier>
  <ReplacementSpan>Elena crossed the slick cobblestones toward the brass harbor lantern while sea wind rattled the rusted gate.</ReplacementSpan>
</ManuscriptPatchTransaction>`;
        const extracted = extractEditorialPatchPayload(rawPatch, { verbatimOriginal: '' });
        expect(extracted.parseSuccess).toBe(true);

        const tx = { ...editPlan.allTransactions[0], startAnchor: 'sc_0_0:p1', wave: 'WAVE_3_MICRO' };
        const patchRes = applyManuscriptPatchToScene(scItem, tx, rawPatch, story, 1);
        expect(patchRes.success).toBe(true);
        expect(patchRes.updatedFullProse).toContain('brass harbor lantern');

        const gateRes = await runFourGateVerificationSuite({
            sceneItem: scItem,
            patchedResult: patchRes,
            transaction: tx,
            baselineTelemetry: fullTel.sceneTelemetryMap[scItem.sceneId],
            nsg,
            story,
            useLLM: false
        });
        expect(gateRes.allPassed).toBe(true);

        const feedback = compileGateFailureFeedback({
            gates: [{ gate: 'Gate 2: NLP Stylometric Delta Gate', passed: false, slopCount: 1, remainingSlopPhrases: ['tapestry'], details: 'slop' }]
        });
        expect(feedback.correction).toContain('tapestry');
    });
});
