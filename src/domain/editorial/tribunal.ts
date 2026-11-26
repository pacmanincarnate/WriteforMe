/**
 * @module domain/editorial/tribunal
 * Stage 2C/2D & Phase 3 of the Autonomous Editorial Harness:
 * 11 read-only manuscript inspection tools, Autonomous Investigation dossier synthesis,
 * Adversarial Tribunal rubric scoring, and 3-Wave Edit Plan compilation.
 */

import { PROMPTS } from '@/prompts';
import { escapeRegExp, extractTag } from '@/utils';
import { normalizeIntentionalOverrides } from '@/domain/story';
import { escapeHarnessXml, getDraftedStoryScenesList } from './xmlNormalization';
import type { EditorialStoryInput } from './xmlNormalization';
import type {
    AestheticConstitution,
    AuthorVoiceDNA,
    EditorialCallAIFn,
    FullManuscriptTelemetryReport,
    SlopViolationItem
} from './nlpTelemetry';
import type { Layer0EvaluationReport, NarrativeStateGraph } from './stateGraph';

export type EditorialWaveKey = 'WAVE_1_MACRO' | 'WAVE_2_MESO' | 'WAVE_3_MICRO';

export interface InvestigationDossier {
    id: string;
    hypothesisId: string;
    category: string;
    proposedWave: EditorialWaveKey;
    sceneId: string;
    displayCoord: string;
    startAnchor: string;
    endAnchor: string;
    rootCauseAnalysis: string;
    citedEvidence: Array<{ sourceTool: string; anchor: string; verbatimQuote: string }>;
    proposedRemediation: string;
    layer0Divergence: number;
}

export interface EditorialTicket {
    id: string;
    dossierId: string;
    wave: EditorialWaveKey;
    category: string;
    sceneId: string;
    displayCoord: string;
    startAnchor: string;
    endAnchor: string;
    verbatimOriginal: string;
    problemStatement: string;
    surgicalDirective: string;
    rubricScores: { E: number; I: number; D: number; C: number; R: number };
    priorityScore: number;
    verdict: string;
}

export interface TribunalCase {
    dossierId: string;
    prosecutorArgument: string;
    defenseArgument: string;
    judicialRationale: string;
    rubricScores: { E: number; I: number; D: number; C: number; R: number };
    priorityScore: number;
    verdict: string;
    ticket: EditorialTicket;
}

export interface EditPlanTransaction {
    transactionId: string;
    wave: EditorialWaveKey;
    sceneId: string;
    displayCoord: string;
    startAnchor: string;
    endAnchor: string;
    verbatimOriginal: string;
    priorityScore: number;
    tickets: EditorialTicket[];
    combinedDirective: string;
    combinedProblem: string;
    status: string;
    gateResults: unknown;
    patchedXml: unknown;
    patchedProseSpan: unknown;
}

export interface CompiledThreeWaveEditPlan {
    waves: Array<{
        waveId: number;
        waveKey: EditorialWaveKey;
        name: string;
        specialistAgent: string;
        transactions: EditPlanTransaction[];
    }>;
    allTransactions: EditPlanTransaction[];
    xml: string;
}

/** Creates the 11 read-only manuscript inspection tools for Autonomous Investigation workers. */
export function createHarnessInspectionTools(
    story: EditorialStoryInput | null | undefined,
    nsg: NarrativeStateGraph | null | undefined,
    fullTelemetry: FullManuscriptTelemetryReport | null | undefined,
    layer0Map: Record<string, Layer0EvaluationReport> | null | undefined
) {
    const scenesList = fullTelemetry?.scenesList || getDraftedStoryScenesList(story);
    const telemetryMap = fullTelemetry?.sceneTelemetryMap || {};

    return {
        inspect_narrative_hierarchy: ({
            target_id = null
        }: { scope?: string; target_id?: string | null } = {}) => {
            if (target_id) {
                const sc = (nsg?.sceneContracts || []).find(
                    (s) => s.id === target_id || s.displayCoord === target_id
                );
                return sc ? JSON.stringify(sc, null, 2) : `No scene found for ${target_id}`;
            }
            return JSON.stringify(
                (nsg?.sceneContracts || []).map((s) => ({
                    id: s.id,
                    coord: s.displayCoord,
                    title: s.title,
                    pov: s.pov,
                    valueShift: s.valueShift
                })),
                null,
                2
            );
        },
        get_epistemic_ledger: ({
            character_id = 'ALL'
        }: { character_id?: string; scene_id?: string | null } = {}) => {
            const chars = (nsg?.characterEntities || []).filter(
                (c) => character_id === 'ALL' || c.id === character_id || c.name === character_id
            );
            return JSON.stringify(
                chars.map((c) => ({ id: c.id, name: c.name, beliefs: c.epistemicBeliefs })),
                null,
                2
            );
        },
        trace_thread_or_motif: ({ thread_id = null }: { thread_id?: string | null } = {}) => {
            const threads = (nsg?.threadsLedger || []).filter(
                (t) =>
                    !thread_id ||
                    t.id === thread_id ||
                    t.name.toLowerCase().includes(String(thread_id).toLowerCase())
            );
            return JSON.stringify(threads, null, 2);
        },
        query_lore_contract: ({ query = '' }: { query?: string } = {}) => {
            const q = String(query || '').toLowerCase();
            const matches = (nsg?.loreContracts || []).filter(
                (l) => !q || l.topic.toLowerCase().includes(q) || l.invariant.toLowerCase().includes(q)
            );
            return JSON.stringify(matches.slice(0, 8), null, 2);
        },
        grep_manuscript: ({ pattern = '' }: { pattern?: string } = {}) => {
            if (!pattern) return '[]';
            const rgx = new RegExp(escapeRegExp(pattern), 'i');
            const hits: Array<{ anchor: string; text: string }> = [];
            scenesList.forEach((sc) => {
                sc.normalized.paragraphs.forEach((p) => {
                    p.sentences.forEach((s) => {
                        if (rgx.test(s.text)) {
                            hits.push({ anchor: s.id, text: s.text });
                        }
                    });
                });
            });
            return JSON.stringify(hits.slice(0, 15), null, 2);
        },
        semantic_passage_search: ({
            query = '',
            top_k = 5
        }: { query?: string; top_k?: number } = {}) => {
            const tokens = String(query || '')
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length >= 4);
            const scored: Array<{ anchor: string; score: number; text: string }> = [];
            scenesList.forEach((sc) => {
                sc.normalized.paragraphs.forEach((p) => {
                    const lower = p.text.toLowerCase();
                    const score = tokens.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
                    if (score > 0) scored.push({ anchor: p.id, score, text: p.text.slice(0, 260) });
                });
            });
            scored.sort((a, b) => b.score - a.score);
            return JSON.stringify(scored.slice(0, top_k), null, 2);
        },
        read_scene_span: ({
            start_anchor = 'sc_0_0:p1',
            end_anchor = null,
            context_paragraphs = 1
        }: {
            start_anchor?: string;
            end_anchor?: string | null;
            context_paragraphs?: number;
        } = {}) => {
            const scenePrefix = String(start_anchor).split(':')[0];
            const sc = scenesList.find((s) => s.sceneId === scenePrefix) || scenesList[0];
            if (!sc) return 'No scene available.';
            const pMatch = String(start_anchor).match(/:p(\d+)/);
            const endPMatch = end_anchor ? String(end_anchor).match(/:p(\d+)/) : pMatch;
            const startIdx = Math.max(
                0,
                (pMatch ? parseInt(pMatch[1], 10) - 1 : 0) - context_paragraphs
            );
            const endIdx = Math.min(
                sc.normalized.paragraphs.length - 1,
                (endPMatch ? parseInt(endPMatch[1], 10) - 1 : startIdx) + context_paragraphs
            );
            return sc.normalized.paragraphs
                .slice(startIdx, endIdx + 1)
                .map((p) => `[${p.id}] ${p.text}`)
                .join('\n\n');
        },
        extract_dialogue_slice: ({
            character_id = '',
            scene_id = null
        }: { character_id?: string; scene_id?: string | null } = {}) => {
            const turns: Array<{ anchor: string; speaker: string; text: string }> = [];
            scenesList.forEach((sc) => {
                if (scene_id && sc.sceneId !== scene_id) return;
                sc.normalized.paragraphs.forEach((p) => {
                    p.sentences.forEach((s) => {
                        if (
                            s.speaker_ref &&
                            (!character_id ||
                                s.speaker_ref.toLowerCase().includes(character_id.toLowerCase()))
                        ) {
                            turns.push({ anchor: s.id, speaker: s.speaker_ref, text: s.text });
                        }
                    });
                });
            });
            return JSON.stringify(turns.slice(0, 20), null, 2);
        },
        diff_intent_vs_naive_reader: ({ scene_id = 'sc_0_0' }: { scene_id?: string } = {}) => {
            const l0 = layer0Map?.[scene_id];
            return l0 ? JSON.stringify(l0, null, 2) : `No Layer 0 log for ${scene_id}`;
        },
        run_prose_telemetry: ({ scene_id = 'sc_0_0' }: { scene_id?: string } = {}) => {
            const t = telemetryMap[scene_id];
            return t ? t.xml : `No telemetry for ${scene_id}`;
        },
        simulate_blast_radius: ({
            scene_id = 'sc_0_0',
            proposed_change = ''
        }: { scene_id?: string; proposed_change?: string } = {}) => {
            const downstreamEdges = (nsg?.causalEdges || []).filter((e) => e.from_scene === scene_id);
            return JSON.stringify(
                {
                    targetScene: scene_id,
                    proposedChange: proposed_change,
                    affectedDownstreamEdges: downstreamEdges,
                    blastRadiusRisk: downstreamEdges.length > 2 ? 'MODERATE' : 'LOW_CONTAINED'
                },
                null,
                2
            );
        }
    };
}

/** Synthesizes grounded `<InvestigationDossier>` packets from NSG, telemetry, and Layer 0 logs. */
export async function runAutonomousInvestigationStage(
    story: EditorialStoryInput | null | undefined,
    nsg: NarrativeStateGraph | null | undefined,
    fullTelemetry: FullManuscriptTelemetryReport | null | undefined,
    layer0Map: Record<string, Layer0EvaluationReport> | null | undefined,
    _callAIFn: EditorialCallAIFn | null = null,
    _useLLM = true
) {
    void _callAIFn;
    void _useLLM;
    const scenesList = fullTelemetry?.scenesList || [];
    const telemetryMap = fullTelemetry?.sceneTelemetryMap || {};
    const tools = createHarnessInspectionTools(story, nsg, fullTelemetry, layer0Map);
    const dossiers: InvestigationDossier[] = [];

    scenesList.forEach((sc) => {
        const scId = sc.sceneId;
        const tel = telemetryMap[scId];
        const l0 = layer0Map?.[scId];
        const contract = (nsg?.sceneContracts || []).find((c) => c.id === scId);

        const evaporatedClues = (l0?.memoryTraces || []).filter(
            (m) => m.type === 'CHEKHOV_CLUE' && m.toScene === scId && m.evaporated
        );
        if (evaporatedClues.length > 0) {
            const clue = evaporatedClues[0];
            const setupSc = scenesList.find((s) => s.sceneId === clue.fromScene) || sc;
            const setupPara = setupSc.normalized.paragraphs[0] || sc.normalized.paragraphs[0];
            if (setupPara) {
                dossiers.push({
                    id: `dos_macro_${setupSc.sceneId}_clue`,
                    hypothesisId: `hyp_macro_${setupSc.sceneId}`,
                    category: 'CAUSAL_OR_SETUP_DEFECT',
                    proposedWave: 'WAVE_1_MACRO',
                    sceneId: setupSc.sceneId,
                    displayCoord: setupSc.displayCoord,
                    startAnchor: setupPara.id,
                    endAnchor: setupPara.id,
                    rootCauseAnalysis: `Chekhov payoff in ${sc.displayCoord} ("${clue.label}") has low reader memory retention (salience=${clue.salience}). The upstream setup in ${setupSc.displayCoord} requires a tactile or behavioral clue anchor.`,
                    citedEvidence: [
                        {
                            sourceTool: 'get_epistemic_ledger',
                            anchor: setupPara.id,
                            verbatimQuote: setupPara.text
                        }
                    ],
                    proposedRemediation: `Weave a subtle, concrete sensory or behavioral setup for "${clue.label}" into ${setupPara.id} without breaking POV or spoiling the reveal.`,
                    layer0Divergence: l0?.dTotal || 0.35
                });
            }
        }

        if (l0 && (l0.dTotal >= 0.26 || l0.frictionEvents.length > 0)) {
            const primaryFriction = l0.frictionEvents[0];
            const targetAnchor =
                primaryFriction?.anchor || contract?.valueShift?.turningPointAnchor || `${scId}:p1`;
            const paraPrefix = targetAnchor.split(':s')[0];
            const targetPara =
                sc.normalized.paragraphs.find((p) => p.id === paraPrefix) ||
                sc.normalized.paragraphs[Math.min(1, sc.normalized.paragraphs.length - 1)] ||
                sc.normalized.paragraphs[0];
            if (targetPara) {
                dossiers.push({
                    id: `dos_meso_${scId}_${dossiers.length + 1}`,
                    hypothesisId: `hyp_meso_${scId}`,
                    category: primaryFriction?.type || 'SUBTEXT_OR_EARNEDNESS_DEFECT',
                    proposedWave: 'WAVE_2_MESO',
                    sceneId: scId,
                    displayCoord: sc.displayCoord,
                    startAnchor: targetPara.id,
                    endAnchor: targetPara.id,
                    rootCauseAnalysis: primaryFriction
                        ? `Layer 0 Reader Sandbox flagged ${primaryFriction.type} at ${primaryFriction.anchor} (Scene D_total=${l0.dTotal}): "${primaryFriction.readerThought}"`
                        : `Intent-Execution Divergence is elevated (D_total=${l0.dTotal}) across the scene's value shift (${contract?.valueShift?.startValence} -> ${contract?.valueShift?.endValence}).`,
                    citedEvidence: [
                        {
                            sourceTool: 'diff_intent_vs_naive_reader',
                            anchor: targetPara.id,
                            verbatimQuote: targetPara.text
                        }
                    ],
                    proposedRemediation: `Dramatize the interpersonal tension and value shift (${contract?.valueShift?.startValence} -> ${contract?.valueShift?.endValence}) through physical micro-actions, environmental friction, and subtextual dialogue in ${targetPara.id}.`,
                    layer0Divergence: l0.dTotal
                });
            }
        }

        Object.entries(tel?.characterVoiceMetrics || {}).forEach(([spkId, vMetric]) => {
            if ((vMetric.driftDistance || 0) > 1.35) {
                const spkPara = sc.normalized.paragraphs.find((p) =>
                    p.sentences.some((s) => s.speaker_ref === spkId)
                );
                if (spkPara) {
                    dossiers.push({
                        id: `dos_voice_${scId}_${spkId}`,
                        hypothesisId: `hyp_voice_${scId}`,
                        category: 'VOICE_DRIFT',
                        proposedWave: 'WAVE_2_MESO',
                        sceneId: scId,
                        displayCoord: sc.displayCoord,
                        startAnchor: spkPara.id,
                        endAnchor: spkPara.id,
                        rootCauseAnalysis: `Character "${spkId}" exhibits stylometric voice drift D_self=${vMetric.driftDistance} (> 1.35 threshold) in ${sc.displayCoord}.`,
                        citedEvidence: [
                            {
                                sourceTool: 'extract_dialogue_slice',
                                anchor: spkPara.id,
                                verbatimQuote: spkPara.text
                            }
                        ],
                        proposedRemediation: `Adjust "${spkId}" dialogue cadence in ${spkPara.id} to match their 8D VoiceSignatureContract without altering plot meaning.`,
                        layer0Divergence: l0?.dTotal || 0.22
                    });
                }
            }
        });

        const slopParaMap = new Map<
            string,
            {
                para: (typeof sc.normalized.paragraphs)[number];
                priorityRank: number;
                items: SlopViolationItem[];
            }
        >();
        const addSlopToPara = (sv: SlopViolationItem, priorityRank: number): void => {
            const paraId = sv.paragraphId || String(sv.anchor || `${scId}:p1`).split(':s')[0];
            const targetPara =
                sc.normalized.paragraphs.find((p) => p.id === paraId) ||
                sc.normalized.paragraphs[0];
            if (!targetPara) return;
            if (!slopParaMap.has(targetPara.id)) {
                slopParaMap.set(targetPara.id, { para: targetPara, priorityRank, items: [] });
            }
            const entry = slopParaMap.get(targetPara.id)!;
            entry.priorityRank = Math.min(entry.priorityRank, priorityRank);
            if (
                !entry.items.some(
                    (it) => it.phrase.toLowerCase() === String(sv.phrase || '').toLowerCase()
                )
            ) {
                entry.items.push(sv);
            }
        };

        (tel?.hardSlopViolations || []).forEach((sv) => addSlopToPara(sv, 1));
        (tel?.closerViolations || []).forEach((sv) => addSlopToPara(sv, 2));
        (tel?.slopViolations || []).forEach((sv) => {
            if (sv.severity !== 'hard' && !sv.isTrailingCloser) addSlopToPara(sv, 3);
        });

        const sortedSlopParas = Array.from(slopParaMap.values()).sort(
            (a, b) => a.priorityRank - b.priorityRank || b.items.length - a.items.length
        );
        sortedSlopParas.slice(0, 4).forEach((group) => {
            const hasCloser = group.items.some((it) => it.isTrailingCloser);
            const hasHard = group.items.some((it) => it.severity === 'hard');
            const phraseSummary = group.items
                .map((it) => `"${it.phrase}" [${it.category}]`)
                .join(', ');
            const cat = hasCloser ? 'SCENE_CLOSER_SLOP' : 'FORBIDDEN_SLOP_PHRASE';
            dossiers.push({
                id: `dos_micro_slop_${scId}_${group.para.id}_${dossiers.length + 1}`,
                hypothesisId: `hyp_micro_slop_${scId}_${group.para.id}`,
                category: cat,
                proposedWave: 'WAVE_3_MICRO',
                sceneId: scId,
                displayCoord: sc.displayCoord,
                startAnchor: group.para.id,
                endAnchor: group.para.id,
                rootCauseAnalysis: hasCloser
                    ? `Scene-closing tell(s) detected in final sentences (${phraseSummary}) at ${group.para.id}.`
                    : `AI slop scanner detected ${hasHard ? 'hard defect(s)' : 'clustered cliché(s)'} (${phraseSummary}) at ${group.para.id}.`,
                citedEvidence: [
                    {
                        sourceTool: 'run_prose_telemetry',
                        anchor: group.items[0].anchor || group.para.id,
                        verbatimQuote: group.para.text
                    }
                ],
                proposedRemediation: hasCloser
                    ? `Replace the generic scene-closing tell(s) (${group.items.map((it) => `"${it.phrase}"`).join(', ')}) in ${group.para.id} with grounded physical action, concrete sensory detail, or unresolved tension.`
                    : `Replace ${group.items.map((it) => `"${it.phrase}"`).join(', ')} in ${group.para.id} with fresh, concrete, POV-grounded detail adhering to AuthorVoiceDNA.`,
                layer0Divergence: l0?.dTotal || (hasHard || hasCloser ? 0.25 : 0.18)
            });
        });

        const somaticTotal = (tel?.somaticCrutches || []).reduce((acc, c) => acc + (c.count || 0), 0);
        const repeatedSomatic =
            (tel?.somaticCrutches || []).find((c) => c.count >= 2) ||
            (somaticTotal >= 3 ? (tel?.somaticCrutches || [])[0] : null);
        if (repeatedSomatic && repeatedSomatic.anchors?.length > 0) {
            const targetAnchor = repeatedSomatic.anchors[repeatedSomatic.anchors.length - 1];
            const paraId = String(targetAnchor).split(':s')[0];
            const targetPara =
                sc.normalized.paragraphs.find((p) => p.id === paraId) || sc.normalized.paragraphs[0];
            if (targetPara && !slopParaMap.has(targetPara.id)) {
                dossiers.push({
                    id: `dos_micro_somatic_${scId}_${dossiers.length + 1}`,
                    hypothesisId: `hyp_micro_somatic_${scId}`,
                    category: 'SOMATIC_CRUTCH_CLUSTER',
                    proposedWave: 'WAVE_3_MICRO',
                    sceneId: scId,
                    displayCoord: sc.displayCoord,
                    startAnchor: targetPara.id,
                    endAnchor: targetPara.id,
                    rootCauseAnalysis: `Repeated somatic cliché "${repeatedSomatic.label}" (${repeatedSomatic.count}x in scene; ${somaticTotal} total somatic crutch hits) at ${targetAnchor}.`,
                    citedEvidence: [
                        {
                            sourceTool: 'run_prose_telemetry',
                            anchor: targetAnchor,
                            verbatimQuote: targetPara.text
                        }
                    ],
                    proposedRemediation: `Replace the repeated "${repeatedSomatic.label}" crutch in ${targetPara.id} with an idiosyncratic physical behavior, environmental interaction, or vocal shift.`,
                    layer0Divergence: l0?.dTotal || 0.19
                });
            }
        }

        const nxbHits = (tel?.rhetoricalViolations || []).filter(
            (r) => r.categoryId === 'not_x_but_y'
        );
        const triHits = (tel?.rhetoricalViolations || []).filter((r) => r.categoryId === 'triad');
        const targetRhet = triHits[0] || (nxbHits.length >= 2 ? nxbHits[0] : null);
        if (targetRhet) {
            const paraId =
                targetRhet.paragraphId || String(targetRhet.anchor || '').split(':s')[0];
            const targetPara = sc.normalized.paragraphs.find((p) => p.id === paraId);
            if (targetPara && !slopParaMap.has(targetPara.id)) {
                dossiers.push({
                    id: `dos_micro_rhet_${scId}_${dossiers.length + 1}`,
                    hypothesisId: `hyp_micro_rhet_${scId}`,
                    category: 'RHETORICAL_SLOP',
                    proposedWave: 'WAVE_3_MICRO',
                    sceneId: scId,
                    displayCoord: sc.displayCoord,
                    startAnchor: targetPara.id,
                    endAnchor: targetPara.id,
                    rootCauseAnalysis:
                        targetRhet.categoryId === 'triad'
                            ? `Repetitive 3-beat triad anaphora "${targetRhet.phrase}" detected at ${targetRhet.anchor}.`
                            : `Repeated "Not X, but Y" antithesis crutch (${nxbHits.length}x in scene, e.g. "${targetRhet.phrase}") at ${targetRhet.anchor}.`,
                    citedEvidence: [
                        {
                            sourceTool: 'run_prose_telemetry',
                            anchor: targetRhet.anchor,
                            verbatimQuote: targetPara.text
                        }
                    ],
                    proposedRemediation: `Restructure ${targetPara.id} to replace mechanical antithesis/triad symmetry with direct concrete statement or action.`,
                    layer0Divergence: l0?.dTotal || 0.17
                });
            }
        }

        if ((tel?.povHeadHops || []).length > 0) {
            const hh = tel!.povHeadHops[0];
            const paraId = hh.anchor.split(':s')[0];
            const targetPara =
                sc.normalized.paragraphs.find((p) => p.id === paraId) || sc.normalized.paragraphs[0];
            if (targetPara) {
                dossiers.push({
                    id: `dos_micro_pov_${scId}_${dossiers.length + 1}`,
                    hypothesisId: `hyp_micro_pov_${scId}`,
                    category: 'POV_HEAD_HOP',
                    proposedWave: 'WAVE_3_MICRO',
                    sceneId: scId,
                    displayCoord: sc.displayCoord,
                    startAnchor: targetPara.id,
                    endAnchor: targetPara.id,
                    rootCauseAnalysis: `POV Head-Hop violation at ${hh.anchor}: non-POV character "${hh.non_pov_character}" is given direct internal mental access in "${hh.pov_character}"'s close POV.`,
                    citedEvidence: [
                        {
                            sourceTool: 'run_prose_telemetry',
                            anchor: hh.anchor,
                            verbatimQuote: targetPara.text
                        }
                    ],
                    proposedRemediation: `Externalize "${hh.non_pov_character}"'s internal state in ${targetPara.id} into observable physical cues perceived through "${hh.pov_character}"'s lens.`,
                    layer0Divergence: l0?.dTotal || 0.25
                });
            }
        }

        if (
            (tel?.filterWordMatches || []).length >= 2 ||
            (tel?.lexicalEchoes || []).length > 0 ||
            (tel?.monotonousClusters || []).length > 0 ||
            (tel?.punctuationCollapse || []).length > 0 ||
            (tel?.questionFreeDialogue || []).length > 0
        ) {
            const targetEcho = (tel?.lexicalEchoes || [])[0];
            const targetMonotonous = (tel?.monotonousClusters || [])[0];
            const targetFilter = (tel?.filterWordMatches || [])[0];
            const targetPunct = (tel?.punctuationCollapse || [])[0];
            const targetQfd = (tel?.questionFreeDialogue || [])[0];

            const rawAnc =
                targetEcho?.second_anchor ||
                targetMonotonous?.start_anchor ||
                targetFilter?.anchor ||
                targetPunct?.anchor ||
                targetQfd?.anchor ||
                `${scId}:p1`;
            const paraId = rawAnc.split(':s')[0];
            const targetPara =
                sc.normalized.paragraphs.find((p) => p.id === paraId) || sc.normalized.paragraphs[0];
            if (targetPara) {
                const desc = targetEcho?.lemma
                    ? `High-salience lexical echo "${targetEcho.lemma}" (S_echo=${targetEcho.echo_salience_score}, distance=${targetEcho.token_distance} tokens)`
                    : targetMonotonous?.window_cv !== undefined
                      ? `Monotonous sentence rhythm cluster (5-sentence CV=${targetMonotonous.window_cv} < 0.22)`
                      : targetPunct?.categoryId === 'punctuation_collapse'
                        ? '500-word span lacks punctuation variety (no semicolon, colon, ellipsis, or question mark)'
                        : targetQfd?.categoryId === 'question_free_dialogue'
                          ? 'Dialogue scene contains no questions ("?") — characters are declaring without probing each other'
                          : `Elevated perceptual filter-word density (${tel?.filterWordDensityPer1k}/1k words, e.g. "${targetFilter?.verb}") inflating psychic distance (PD=${tel?.meanPsychicDistance})`;
                dossiers.push({
                    id: `dos_micro_craft_${scId}_${dossiers.length + 1}`,
                    hypothesisId: `hyp_micro_craft_${scId}`,
                    category: 'CADENCE_OR_ECHO_DEFECT',
                    proposedWave: 'WAVE_3_MICRO',
                    sceneId: scId,
                    displayCoord: sc.displayCoord,
                    startAnchor: targetPara.id,
                    endAnchor: targetPara.id,
                    rootCauseAnalysis: desc,
                    citedEvidence: [
                        {
                            sourceTool: 'run_prose_telemetry',
                            anchor: targetPara.id,
                            verbatimQuote: targetPara.text
                        }
                    ],
                    proposedRemediation: `Polish syntax and diction in ${targetPara.id} to eliminate filter verbs/echoes and restore sentence rhythm variation while keeping plot and dialogue invariant.`,
                    layer0Divergence: l0?.dTotal || 0.16
                });
            }
        }
    });

    if (dossiers.length === 0 && scenesList.length > 0) {
        const sc0 = scenesList[0];
        const p0 = sc0.normalized.paragraphs[0];
        if (p0) {
            dossiers.push({
                id: `dos_micro_polish_${sc0.sceneId}`,
                hypothesisId: `hyp_micro_polish_${sc0.sceneId}`,
                category: 'CADENCE_OR_ECHO_DEFECT',
                proposedWave: 'WAVE_3_MICRO',
                sceneId: sc0.sceneId,
                displayCoord: sc0.displayCoord,
                startAnchor: p0.id,
                endAnchor: p0.id,
                rootCauseAnalysis: `Opening paragraph cadence and sensory immediacy audit in ${sc0.displayCoord} (baseline PD=${telemetryMap[sc0.sceneId]?.meanPsychicDistance || 2.1}).`,
                citedEvidence: [
                    { sourceTool: 'read_scene_span', anchor: p0.id, verbatimQuote: p0.text }
                ],
                proposedRemediation: `Sharpen sensory immediacy and syntactic cadence in ${p0.id} while strictly preserving all narrative facts and AuthorVoiceDNA.`,
                layer0Divergence: layer0Map?.[sc0.sceneId]?.dTotal || 0.15
            });
        }
    }

    return { dossiers, tools };
}

/** Stage 2D Adversarial Editorial Tribunal scoring the 5-Axis Rubric across dossiers. */
export async function conveneAdversarialTribunal(
    dossiers: InvestigationDossier[],
    constitution?: Partial<AestheticConstitution> | null,
    _voiceDna?: AuthorVoiceDNA | null,
    _nsg?: NarrativeStateGraph | null,
    callAIFn: EditorialCallAIFn | null = null,
    useLLM = true
): Promise<{ tribunalCases: TribunalCase[]; verifiedTickets: EditorialTicket[] }> {
    void _voiceDna;
    void _nsg;
    const tribunalCases: TribunalCase[] = [];
    const verifiedTickets: EditorialTicket[] = [];
    const overrides = normalizeIntentionalOverrides(constitution?.intentionalOverrides) as Array<{
        scope?: string;
        rule_type?: string;
    }>;

    for (let i = 0; i < dossiers.length; i++) {
        const dos = dossiers[i];
        const isIgnored = overrides.some(
            (ov) =>
                (ov.scope === 'GLOBAL' || ov.scope === dos.sceneId || ov.scope === dos.startAnchor) &&
                (ov.rule_type === 'ALL' || dos.category.includes(String(ov.rule_type || '')))
        );

        let E =
            dos.citedEvidence && dos.citedEvidence.length > 0 && dos.citedEvidence[0].verbatimQuote
                ? 5
                : 3;
        let I = dos.proposedWave === 'WAVE_1_MACRO' ? 5 : dos.proposedWave === 'WAVE_2_MESO' ? 4 : 3;
        let D =
            (dos.layer0Divergence || 0) >= 0.35
                ? 5
                : (dos.layer0Divergence || 0) >= 0.22
                  ? 4
                  : 3;
        let C = isIgnored ? 1 : 5;
        let R = 4;
        let judgeVerdict = '';
        let judgeProblem = '';
        let judgeDirective = '';

        let prosecutorArg = `Grounded evidence at ${dos.startAnchor} confirms ${dos.category}: ${dos.rootCauseAnalysis}`;
        let defenseArg = isIgnored
            ? `Span ${dos.startAnchor} is explicitly protected by a .novelignore authorial override.`
            : `The passage in ${dos.displayCoord} carries established narrative context; any surgical edit must preserve the existing POV cadence and avoid over-explaining.`;
        let judicialRationale = isIgnored
            ? 'Constitutional Veto triggered: Span is protected by .novelignore.'
            : `Multi-layer evidence confirms a genuine craft/narrative defect at ${dos.startAnchor} that can be surgically repaired without voice flattening.`;

        if (useLLM && typeof callAIFn === 'function' && !isIgnored) {
            try {
                const tribPrompt = `<AestheticConstitutionSummary pov="${constitution?.narrativePOVContract?.globalType}" />\n<InvestigationDossier id="${dos.id}" category="${dos.category}" wave="${dos.proposedWave}" scene_id="${dos.sceneId}" start_anchor="${dos.startAnchor}" end_anchor="${dos.endAnchor}">\n  <RootCauseAnalysis>${escapeHarnessXml(dos.rootCauseAnalysis)}</RootCauseAnalysis>\n  <VerbatimQuote><![CDATA[${dos.citedEvidence?.[0]?.verbatimQuote || ''}]]></VerbatimQuote>\n  <ProposedRemediation>${escapeHarnessXml(dos.proposedRemediation)}</ProposedRemediation>\n</InvestigationDossier>\nDeliberate as Prosecutor, Defense, and ManagingEditorJudge and emit <TribunalDeliberationList>.`;
                const tribRaw = await callAIFn(
                    tribPrompt,
                    PROMPTS.editorialTribunalAgent,
                    false,
                    `Editorial Harness: Tribunal (${dos.id})`,
                    'review'
                );
                const pArg = extractTag(tribRaw, 'ProsecutorArgument') || '';
                const dArg = extractTag(tribRaw, 'DefenseArgument') || '';
                const jRat = extractTag(tribRaw, 'JudicialRationale') || '';
                if (pArg) prosecutorArg = pArg.trim();
                if (dArg) defenseArg = dArg.trim();
                if (jRat) judicialRationale = jRat.trim();

                const rubric = parseTribunalRubric(tribRaw);
                if (rubric) ({ E, I, D, C, R } = rubric);
                judgeVerdict = (tribRaw.match(
                    /<JudgeRuling[^>]*\bverdict=["'](APPROVED_FOR_COMPILATION|INFORMATIONAL_ONLY|VETOED_FALSE_POSITIVE|VETOED_LOW_PRIORITY)["']/i
                )?.[1] || '').toUpperCase();
                judgeProblem = (extractTag(tribRaw, 'ProblemStatement') || '').trim();
                judgeDirective = (extractTag(tribRaw, 'SurgicalDirective') || '').trim();
            } catch (e) {
                console.warn(`[Tribunal] Using deterministic rubric scoring for ${dos.id}:`, e);
            }
        }

        const priorityScore = Number(
            (5 * (1.5 * E + 1.5 * I + 1.2 * D + 0.8 * C + 1.0 * R - 6)).toFixed(1)
        );
        let verdict = 'APPROVED_FOR_COMPILATION';
        if (C <= 1 || E <= 2 || isIgnored) {
            verdict = 'VETOED_FALSE_POSITIVE';
        } else if (priorityScore < 35.0) {
            verdict = 'VETOED_LOW_PRIORITY';
        } else if (priorityScore < 45.0) {
            verdict = 'INFORMATIONAL_ONLY';
        }
        // The judge's own ruling can only make the outcome stricter: a judge who vetoes a case or
        // marks it informational is not overruled by scores that happen to add up to 45.
        if (
            verdict === 'APPROVED_FOR_COMPILATION' &&
            judgeVerdict &&
            judgeVerdict !== 'APPROVED_FOR_COMPILATION'
        ) {
            verdict = judgeVerdict;
        }

        const ticket: EditorialTicket = {
            id: `tkt_${i + 1}_${dos.sceneId}`,
            dossierId: dos.id,
            wave: dos.proposedWave,
            category: dos.category,
            sceneId: dos.sceneId,
            displayCoord: dos.displayCoord,
            startAnchor: dos.startAnchor,
            endAnchor: dos.endAnchor,
            verbatimOriginal: dos.citedEvidence?.[0]?.verbatimQuote || '',
            // The judge's ticket text is written for the editor and says what must be preserved;
            // the investigator's analysis is the fallback when the judge gave none.
            problemStatement: judgeProblem || dos.rootCauseAnalysis,
            surgicalDirective: judgeDirective || dos.proposedRemediation,
            rubricScores: { E, I, D, C, R },
            priorityScore,
            verdict
        };

        tribunalCases.push({
            dossierId: dos.id,
            prosecutorArgument: prosecutorArg,
            defenseArgument: defenseArg,
            judicialRationale,
            rubricScores: { E, I, D, C, R },
            priorityScore,
            verdict,
            ticket
        });

        if (verdict === 'APPROVED_FOR_COMPILATION') {
            verifiedTickets.push(ticket);
        }
    }

    return { tribunalCases, verifiedTickets };
}

/**
 * Reads the five tribunal rubric scores from <RubricScores>, in any attribute order and with
 * single or double quotes. The old pattern needed E, I, D, C, R in exactly that order, so a judge
 * that wrote them differently was silently replaced by the deterministic all-high scores.
 */
export function parseTribunalRubric(
    raw: unknown
): { E: number; I: number; D: number; C: number; R: number } | null {
    const tag = (typeof raw === 'string' ? raw : '').match(/<RubricScores\b[^>]*>/i)?.[0];
    if (!tag) return null;
    const read = (axis: string): number | null => {
        const m = tag.match(new RegExp(`\\b${axis}=["'](\\d+(?:\\.\\d+)?)["']`));
        return m ? Math.max(1, Math.min(5, Math.round(Number(m[1])))) : null;
    };
    const E = read('E');
    const I = read('I');
    const D = read('D');
    const C = read('C');
    const R = read('R');
    if (E === null || I === null || D === null || C === null || R === null) return null;
    return { E, I, D, C, R };
}

/** Phase 3 Compiler: merges overlapping paragraph tickets into Wave 1/2/3 transactions with 35% churn cap. */
export function compileThreeWaveEditPlan(
    verifiedTickets: EditorialTicket[],
    _nsg?: NarrativeStateGraph | null,
    fullTelemetry?: FullManuscriptTelemetryReport | null
): CompiledThreeWaveEditPlan {
    void _nsg;
    const sorted = [...(verifiedTickets || [])].sort((a, b) => b.priorityScore - a.priorityScore);
    const spanMap = new Map<string, EditPlanTransaction>();

    const waveRank: Record<EditorialWaveKey, number> = {
        WAVE_1_MACRO: 1,
        WAVE_2_MESO: 2,
        WAVE_3_MICRO: 3
    };
    sorted.forEach((tkt) => {
        const key = `${tkt.sceneId}::${tkt.startAnchor}`;
        if (!spanMap.has(key)) {
            spanMap.set(key, {
                transactionId: `tx_${tkt.wave.toLowerCase()}_${tkt.sceneId}_${spanMap.size + 1}`,
                wave: tkt.wave,
                sceneId: tkt.sceneId,
                displayCoord: tkt.displayCoord,
                startAnchor: tkt.startAnchor,
                endAnchor: tkt.endAnchor,
                verbatimOriginal: tkt.verbatimOriginal,
                priorityScore: tkt.priorityScore,
                tickets: [tkt],
                combinedDirective: tkt.surgicalDirective,
                combinedProblem: tkt.problemStatement,
                status: 'PENDING',
                gateResults: null,
                patchedXml: null,
                patchedProseSpan: null
            });
        } else {
            const existing = spanMap.get(key)!;
            existing.tickets.push(tkt);
            if ((waveRank[tkt.wave] || 3) < (waveRank[existing.wave] || 3)) {
                existing.wave = tkt.wave;
            }
            existing.priorityScore = Math.max(existing.priorityScore, tkt.priorityScore);
            if (!existing.combinedDirective.includes(tkt.surgicalDirective)) {
                existing.combinedDirective += ` ALSO: ${tkt.surgicalDirective}`;
                existing.combinedProblem += ` | ${tkt.problemStatement}`;
            }
        }
    });

    const allTransactions = Array.from(spanMap.values());
    const wave1 = allTransactions.filter((tx) => tx.wave === 'WAVE_1_MACRO');
    const wave2 = allTransactions.filter((tx) => tx.wave === 'WAVE_2_MESO');
    let wave3 = allTransactions.filter((tx) => tx.wave === 'WAVE_3_MICRO');

    const sceneParaCounts: Record<string, number> = {};
    (fullTelemetry?.scenesList || []).forEach((sc) => {
        sceneParaCounts[sc.sceneId] = Math.max(1, sc.normalized.paragraphs.length);
    });
    const sceneTouchedCount: Record<string, number> = {};
    wave1.concat(wave2).forEach((tx) => {
        sceneTouchedCount[tx.sceneId] = (sceneTouchedCount[tx.sceneId] || 0) + 1;
    });
    wave3 = wave3.filter((tx) => {
        const totalP = sceneParaCounts[tx.sceneId] || 10;
        const currentTouched = sceneTouchedCount[tx.sceneId] || 0;
        if ((currentTouched + 1) / totalP <= 0.35 || currentTouched === 0) {
            sceneTouchedCount[tx.sceneId] = currentTouched + 1;
            return true;
        }
        return false;
    });

    const xml = `<CompiledEditPlan total_transactions="${wave1.length + wave2.length + wave3.length}">
  <ExecutionWave wave_id="1" name="MACRO_AND_CAUSAL_WIRING" specialist_agent="MacroStructuralArchitectAgent" transaction_count="${wave1.length}">
${wave1.map((tx) => `    <AtomicEditTransaction id="${tx.transactionId}" scene_id="${tx.sceneId}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}" priority="${tx.priorityScore}">\n      <Directive>${escapeHarnessXml(tx.combinedDirective)}</Directive>\n    </AtomicEditTransaction>`).join('\n')}
  </ExecutionWave>
  <ExecutionWave wave_id="2" name="MESO_SCENE_SURGERY" specialist_agent="MesoSceneSurgeonAgent" transaction_count="${wave2.length}">
${wave2.map((tx) => `    <AtomicEditTransaction id="${tx.transactionId}" scene_id="${tx.sceneId}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}" priority="${tx.priorityScore}">\n      <Directive>${escapeHarnessXml(tx.combinedDirective)}</Directive>\n    </AtomicEditTransaction>`).join('\n')}
  </ExecutionWave>
  <ExecutionWave wave_id="3" name="MICRO_PROSE_POLISH" specialist_agent="MicroLineStylistAgent" transaction_count="${wave3.length}">
${wave3.map((tx) => `    <AtomicEditTransaction id="${tx.transactionId}" scene_id="${tx.sceneId}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}" priority="${tx.priorityScore}">\n      <Directive>${escapeHarnessXml(tx.combinedDirective)}</Directive>\n    </AtomicEditTransaction>`).join('\n')}
  </ExecutionWave>
</CompiledEditPlan>`;

    return {
        waves: [
            {
                waveId: 1,
                waveKey: 'WAVE_1_MACRO',
                name: 'MACRO_AND_CAUSAL_WIRING',
                specialistAgent: 'MacroStructuralArchitectAgent',
                transactions: wave1
            },
            {
                waveId: 2,
                waveKey: 'WAVE_2_MESO',
                name: 'MESO_SCENE_SURGERY',
                specialistAgent: 'MesoSceneSurgeonAgent',
                transactions: wave2
            },
            {
                waveId: 3,
                waveKey: 'WAVE_3_MICRO',
                name: 'MICRO_PROSE_POLISH',
                specialistAgent: 'MicroLineStylistAgent',
                transactions: wave3
            }
        ],
        allTransactions: [...wave1, ...wave2, ...wave3],
        xml
    };
}
