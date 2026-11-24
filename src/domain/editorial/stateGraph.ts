/**
 * @module domain/editorial/stateGraph
 * Stage 1C & 2B of the Autonomous Editorial Harness:
 * Unified NarrativeStateGraph compiler, Ebbinghaus memory retention curve,
 * and Layer 0 Blind Reader / 5-Axis Intent-Execution Divergence evaluator.
 */

import { PROMPTS } from '@/prompts';
import { extractTag, extractTagList } from '@/utils';
import { getActiveClueDirectivesForScene, getSecretRevealDirectiveForScene } from '@/domain/story';
import { escapeHarnessXml, getDraftedStoryScenesList } from './xmlNormalization';
import type { DraftedStorySceneItem, EditorialStoryInput } from './xmlNormalization';
import type {
    EditorialCallAIFn,
    FullManuscriptTelemetryReport,
    SceneTelemetryReport
} from './nlpTelemetry';

export interface SceneContract {
    id: string;
    proseKey: string;
    displayCoord: string;
    seqIdx: number;
    sceneIdx: number;
    actNum: number;
    seqNum: number;
    title: string;
    pov: string;
    wordCount: number;
    startWordOffset: number;
    endWordOffset: number;
    dramaticMode: string;
    narrativeLens: string;
    objective: string;
    hingeMoment: string;
    valueShift: {
        startValence: string;
        endValence: string;
        turningPointAnchor: string;
    };
    scheduledClues: unknown[];
    scheduledReveal: unknown;
}

export interface CausalGraphEdge {
    id: string;
    type: string;
    from_scene: string;
    from_anchor: string;
    to_scene: string;
    to_anchor: string;
    setup_element_id: string;
    word_distance: number;
    seeded?: boolean;
    description: string;
}

export interface NarrativeStateGraph {
    manuscriptId: string;
    totalWords: number;
    actsHierarchy: Array<{ id: string; number: number; title: string; description: string }>;
    sceneContracts: SceneContract[];
    causalEdges: CausalGraphEdge[];
    characterEntities: Array<{
        id: string;
        name: string;
        role: string;
        coreFlaw: string;
        coreDesire: string;
        vocalCadence: string;
        voiceSignatureContract: Record<string, number>;
        epistemicBeliefs: Array<{
            proposition_id: string;
            claim: string;
            stance: string;
            confidence: number;
            acquired_at_scene: string;
            invalidated_at_scene: string | null;
        }>;
    }>;
    propositionsList: Array<Record<string, unknown>>;
    beliefEdges: Array<Record<string, unknown>>;
    loreContracts: Array<{ id: string; topic: string; invariant: string }>;
    continuityLedgerItems: Array<{ id: string; category: string; name: string; state: string }>;
    threadsLedger: Array<{
        id: string;
        name: string;
        description: string;
        mentions: Array<{ sceneId: string; wordOffset: number }>;
        dormantWarning: boolean;
    }>;
    xml: string;
}

export interface MemoryTraceEntry {
    id: string;
    type: 'PLOT_THREAD' | 'CHEKHOV_CLUE';
    label: string;
    fromScene?: string;
    toScene?: string;
    salience: number;
    wordsSinceLastReinforcement: number;
    evaporated: boolean;
}

export interface FrictionEventEntry {
    type: string;
    anchor: string;
    severity: string;
    readerThought: string;
}

export interface Layer0EvaluationReport {
    sceneId: string;
    displayCoord: string;
    beatWindowsCount: number;
    axisScores: Record<string, number>;
    dWeighted: number;
    dMax: number;
    dTotal: number;
    frictionEvents: FrictionEventEntry[];
    takeawaySummary: string;
    memoryTraces: MemoryTraceEntry[];
}

/** Compiles the unified `<NarrativeStateGraph>` across acts, scenes, cast, GESM, vault, and lore. */
export function compileNarrativeStateGraph(
    story: EditorialStoryInput | null | undefined,
    fullTelemetry: FullManuscriptTelemetryReport | null = null
): NarrativeStateGraph {
    const scenesList = fullTelemetry?.scenesList || getDraftedStoryScenesList(story);
    const characterCentroids = fullTelemetry?.characterCentroids || {};
    const totalWords = scenesList.reduce((acc, s) => acc + s.normalized.wordCount, 0);

    const actsHierarchy = (story?.acts || []).map((act, aIdx) => ({
        id: `act_${aIdx + 1}`,
        number: aIdx + 1,
        title: String(act.title || `Act ${aIdx + 1}`),
        description: String(act.description || '')
    }));

    const sceneContracts: SceneContract[] = scenesList.map((sc, idx) => {
        const sm = sc.sceneMeta || {};
        const valShift = (sm.value_shift || {
            start_state: sm.start_valence || 'Neutral',
            end_state: sm.end_valence || 'Shifted'
        }) as { start_state?: string; end_state?: string };
        const cluesForScene = getActiveClueDirectivesForScene(
            story as Record<string, unknown>,
            sc.seqNum,
            sc.sceneIdx + 1
        );
        const revealForScene = getSecretRevealDirectiveForScene(
            story as Record<string, unknown>,
            sc.seqNum,
            sc.sceneIdx + 1,
            sm
        );

        return {
            id: sc.sceneId,
            proseKey: sc.proseKey,
            displayCoord: sc.displayCoord,
            seqIdx: sc.seqIdx,
            sceneIdx: sc.sceneIdx,
            actNum: sc.actNum,
            seqNum: sc.seqNum,
            title: sc.title,
            pov: sc.normalized.pov,
            wordCount: sc.normalized.wordCount,
            startWordOffset: sc.startWordOffset,
            endWordOffset: sc.endWordOffset,
            dramaticMode: String(
                sm.scene_type || (idx % 2 === 0 ? 'SCENE_PROACTIVE' : 'SEQUEL_REACTIVE')
            ),
            narrativeLens: String(sm.dominant_narrative_mode || 'BASELINE_NEUTRAL'),
            objective: String(sm.objective || sm.description || 'Advance sequence dramatic question'),
            hingeMoment: String(sm.the_hinge_moment || sm.exit_hook || ''),
            valueShift: {
                startValence: String(valShift.start_state || 'Baseline'),
                endValence: String(valShift.end_state || 'Transformed'),
                turningPointAnchor: `${sc.sceneId}:p${Math.max(1, Math.ceil(sc.normalized.paragraphs.length * 0.7))}`
            },
            scheduledClues: cluesForScene,
            scheduledReveal: revealForScene
        };
    });

    const causalEdges: CausalGraphEdge[] = [];
    for (let i = 0; i < sceneContracts.length - 1; i++) {
        const curr = sceneContracts[i];
        const next = sceneContracts[i + 1];
        const edgeType = String(next.dramaticMode).toUpperCase().includes('SEQUEL')
            ? 'CAUSAL_THEREFORE'
            : 'ANTAGONISTIC_BUT';
        causalEdges.push({
            id: `edge_${curr.id}_to_${next.id}`,
            type: edgeType,
            from_scene: curr.id,
            from_anchor: `${curr.id}:p${Math.max(1, scenesList[i].normalized.paragraphs.length)}`,
            to_scene: next.id,
            to_anchor: `${next.id}:p1`,
            setup_element_id: `transition_${curr.displayCoord}`,
            word_distance: next.startWordOffset - curr.startWordOffset,
            description: `${curr.title} -> ${next.title}`
        });
    }

    (story?.secret_vault || []).forEach((sec, sIdx) => {
        const revealAnchor = (sec.reveal_anchor || {}) as { sequence_number?: number };
        const revealSeq = Number(revealAnchor.sequence_number || 7);
        const payoffScene =
            sceneContracts.find((sc) => sc.seqNum === revealSeq) ||
            sceneContracts[sceneContracts.length - 1];
        const clueSchedule = (Array.isArray(sec.clue_schedule)
            ? sec.clue_schedule
            : []) as Array<Record<string, unknown>>;
        clueSchedule.forEach((clue, cIdx) => {
            const setupSeq = Number(clue.sequence_number || 1);
            const setupScene =
                sceneContracts.find((sc) => sc.seqNum === setupSeq) || sceneContracts[0];
            if (setupScene && payoffScene) {
                causalEdges.push({
                    id: `chekhov_secret_${sIdx}_clue_${cIdx}`,
                    type: 'CHEKHOV_SETUP_PAYOFF',
                    from_scene: setupScene.id,
                    from_anchor: `${setupScene.id}:p1`,
                    to_scene: payoffScene.id,
                    to_anchor: `${payoffScene.id}:p1`,
                    setup_element_id: String(sec.id || `secret_${sIdx + 1}`),
                    word_distance: Math.max(0, payoffScene.startWordOffset - setupScene.startWordOffset),
                    seeded: Boolean(clue.seeded_in_prose),
                    description: `Clue for "${String(sec.title || '')}": ${String(clue.behavioral_directive || '')}`
                });
            }
        });
    });

    const epistemicGraph = (story?.epistemic_graph || {
        propositions: [],
        first_order_edges: []
    }) as Record<string, unknown>;
    const propositionsList = (
        Array.isArray(epistemicGraph.propositions)
            ? epistemicGraph.propositions
            : Object.values((epistemicGraph.propositions || {}) as Record<string, unknown>)
    ) as Array<Record<string, unknown>>;
    const beliefEdges = (
        Array.isArray(epistemicGraph.first_order_edges) ? epistemicGraph.first_order_edges : []
    ) as Array<Record<string, unknown>>;

    const characterEntities = (story?.cast || []).map((c, cIdx) => {
        const charId = String(c.id || `char_${cIdx + 1}`);
        const arcObj =
            (story?.character_arcs || []).find(
                (a) => a.char_id === c.id || a.char_id === c.name
            ) || {};
        const voiceCentroid = characterCentroids[charId]?.centroid ||
            characterCentroids[String(c.name || '')]?.centroid || {
                avg_dialogue_turn_words: 11.5,
                contraction_rate: 0.06,
                question_ratio: 0.16,
                exclamation_ratio: 0.05,
                lexical_diversity: 0.72,
                latinate_ratio: 0.14,
                subordinate_clause_rate: 0.18,
                colloquial_marker_rate: 0.09
            };
        const charBeliefs = beliefEdges.filter(
            (b) => b.holder_id === c.id || b.holder_id === c.name
        );
        return {
            id: charId,
            name: String(c.name || `Character ${cIdx + 1}`),
            role: String(c.role || 'Cast'),
            coreFlaw: String(c.core_flaw || arcObj.lie_believed || ''),
            coreDesire: String(c.core_desire || arcObj.truth_needed || ''),
            vocalCadence: String(c.vocal_cadence || 'Distinctive cadence'),
            voiceSignatureContract: voiceCentroid,
            epistemicBeliefs: charBeliefs.map((b) => {
                const prop = propositionsList.find((p) => p.id === b.proposition_id);
                return {
                    proposition_id: String(b.proposition_id || ''),
                    claim: String(prop?.claim_text || b.proposition_id || ''),
                    stance: String(b.stance || 'BELIEVES_TRUE'),
                    confidence: Number(b.confidence ?? 0.85),
                    acquired_at_scene: String(b.acquired_at_scene || '1.1'),
                    invalidated_at_scene: (b.invalidated_at_scene as string | null) || null
                };
            })
        };
    });

    const loreContracts = (story?.lore || []).slice(0, 30).map((l, lIdx) => ({
        id: `lore_${lIdx + 1}`,
        topic: String(l.topic || l.title || `World Rule ${lIdx + 1}`),
        invariant: String(l.detail || l.text || '').slice(0, 280)
    }));
    const continuityLedgerItems = (story?.continuity_ledger || []).map((item, idx) => ({
        id: String(item.id || `ledger_${idx + 1}`),
        category: String(item.category || 'Object'),
        name: String(item.name || item.title || `Item ${idx + 1}`),
        state: String(item.current_state || item.status || item.description || 'Active')
    }));

    const threadsLedger = (story?.threads || []).map((th, tIdx) => {
        const mentions: Array<{ sceneId: string; wordOffset: number }> = [];
        scenesList.forEach((sc) => {
            const scThreads = sc.sceneMeta?.threads || [];
            const mentionedInMeta =
                Array.isArray(scThreads) &&
                scThreads.some(
                    (t) =>
                        String(t).includes(String(th.id || '')) ||
                        String(t).includes(String(th.name || ''))
                );
            const nameTokens = String(th.name || '')
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length >= 4);
            const mentionedInProse =
                nameTokens.length > 0 &&
                nameTokens.some((tok) => sc.proseText.toLowerCase().includes(tok));
            if (mentionedInMeta || mentionedInProse) {
                mentions.push({ sceneId: sc.sceneId, wordOffset: sc.endWordOffset });
            }
        });
        return {
            id: String(th.id || `thread_${tIdx + 1}`),
            name: String(th.name || `Thread ${tIdx + 1}`),
            description: String(th.description || ''),
            mentions,
            dormantWarning: mentions.length === 0 && scenesList.length > 2
        };
    });

    const xml = `<NarrativeStateGraph manuscript_id="${escapeHarnessXml(story?.id || 'story_default')}" total_words="${totalWords}" scene_count="${sceneContracts.length}">
  <StructuralHierarchy>
${sceneContracts.map((sc) => `    <SceneContract id="${sc.id}" display_coord="${escapeHarnessXml(sc.displayCoord)}" title="${escapeHarnessXml(sc.title)}" pov="${escapeHarnessXml(sc.pov)}" mode="${escapeHarnessXml(sc.dramaticMode)}" words="${sc.wordCount}">\n      <Objective>${escapeHarnessXml(sc.objective)}</Objective>\n      <ValueShift start="${escapeHarnessXml(sc.valueShift.startValence)}" end="${escapeHarnessXml(sc.valueShift.endValence)}" turning_point_anchor="${sc.valueShift.turningPointAnchor}" />\n    </SceneContract>`).join('\n')}
  </StructuralHierarchy>
  <CausalAndSetupGraph>
${causalEdges.map((e) => `    <CausalEdge id="${escapeHarnessXml(e.id)}" type="${e.type}" from_scene="${e.from_scene}" to_scene="${e.to_scene}" word_distance="${e.word_distance}" />`).join('\n')}
  </CausalAndSetupGraph>
  <EntityStateRegistry>
${characterEntities.map((ce) => `    <CharacterEntity id="${escapeHarnessXml(ce.id)}" name="${escapeHarnessXml(ce.name)}" role="${escapeHarnessXml(ce.role)}">\n      <VoiceSignatureContract avg_turn_words="${ce.voiceSignatureContract.avg_dialogue_turn_words}" contraction_rate="${ce.voiceSignatureContract.contraction_rate}" question_ratio="${ce.voiceSignatureContract.question_ratio}" latinate_ratio="${ce.voiceSignatureContract.latinate_ratio}" />\n      <EpistemicLedger belief_count="${ce.epistemicBeliefs.length}" />\n    </CharacterEntity>`).join('\n')}
  </EntityStateRegistry>
  <LoreAndWorldContracts lore_count="${loreContracts.length}" continuity_ledger_count="${continuityLedgerItems.length}" />
  <ThematicAndMotifLedger core_thesis="${escapeHarnessXml(story?.core_thematic_argument || story?.themes || '')}" thread_count="${threadsLedger.length}" />
</NarrativeStateGraph>`;

    return {
        manuscriptId: String(story?.id || 'story_default'),
        totalWords,
        actsHierarchy,
        sceneContracts,
        causalEdges,
        characterEntities,
        propositionsList,
        beliefEdges,
        loreContracts,
        continuityLedgerItems,
        threadsLedger,
        xml
    };
}

/** Computes Ebbinghaus reader memory retention `S(W)` for setups, clues, and threads. */
export function computeEbbinghausMemoryDecay(
    nsg: NarrativeStateGraph | null | undefined,
    currentWordOffset = 0
): MemoryTraceEntry[] {
    const lambda = 0.35;
    const memoryTraces: MemoryTraceEntry[] = [];

    (nsg?.threadsLedger || []).forEach((th) => {
        let sLast = 0.65;
        let lastWord = 0;
        (th.mentions || []).forEach((m) => {
            if (m.wordOffset <= currentWordOffset) {
                const deltaW = Math.max(0, m.wordOffset - lastWord);
                sLast = Math.min(1.0, sLast * Math.exp(-lambda * (deltaW / 10000)) + 0.3);
                lastWord = m.wordOffset;
            }
        });
        const finalDeltaW = Math.max(0, currentWordOffset - lastWord);
        const currentSalience = Number((sLast * Math.exp(-lambda * (finalDeltaW / 10000))).toFixed(3));
        memoryTraces.push({
            id: th.id,
            type: 'PLOT_THREAD',
            label: th.name,
            salience: currentSalience,
            wordsSinceLastReinforcement: finalDeltaW,
            evaporated: currentSalience < 0.22 && finalDeltaW > 8000
        });
    });

    (nsg?.causalEdges || [])
        .filter((e) => e.type === 'CHEKHOV_SETUP_PAYOFF')
        .forEach((edge) => {
            const fromSc = (nsg?.sceneContracts || []).find((s) => s.id === edge.from_scene);
            const toSc = (nsg?.sceneContracts || []).find((s) => s.id === edge.to_scene);
            const setupOffset = fromSc ? fromSc.endWordOffset : 0;
            const payoffOffset = toSc ? toSc.startWordOffset : currentWordOffset;
            const deltaW = Math.max(0, payoffOffset - setupOffset);
            const sInit = edge.seeded ? 0.8 : 0.35;
            const salienceAtPayoff = Number((sInit * Math.exp(-lambda * (deltaW / 10000))).toFixed(3));
            memoryTraces.push({
                id: edge.id,
                type: 'CHEKHOV_CLUE',
                label: edge.description,
                fromScene: edge.from_scene,
                toScene: edge.to_scene,
                salience: salienceAtPayoff,
                wordsSinceLastReinforcement: deltaW,
                evaporated: salienceAtPayoff < 0.22 || !edge.seeded
            });
        });

    return memoryTraces;
}

/** Runs Layer 0 Blind Reader simulation & 5-axis Intent-Execution Divergence scoring. */
export async function evaluateSceneLayer0AndDivergence(
    sceneContract: SceneContract,
    sceneItem: Pick<DraftedStorySceneItem, 'normalized' | 'proseText' | 'sceneId'>,
    nsg: NarrativeStateGraph | null | undefined,
    telemetry: Partial<SceneTelemetryReport> | null | undefined,
    callAIFn: EditorialCallAIFn | null = null,
    useLLM = true
): Promise<Layer0EvaluationReport> {
    const norm = sceneItem.normalized;
    const beatWindows: Array<{
        windowId: number;
        startAnchor: string;
        endAnchor: string;
        wordCount: number;
        text: string;
    }> = [];
    let currParas = [] as typeof norm.paragraphs;
    let currWords = 0;
    norm.paragraphs.forEach((p) => {
        currParas.push(p);
        currWords += p.wordCount;
        if (currWords >= 380) {
            beatWindows.push({
                windowId: beatWindows.length + 1,
                startAnchor: currParas[0].id,
                endAnchor: currParas[currParas.length - 1].id,
                wordCount: currWords,
                text: currParas.map((x) => x.text).join('\n\n')
            });
            currParas = [];
            currWords = 0;
        }
    });
    if (currParas.length > 0) {
        beatWindows.push({
            windowId: beatWindows.length + 1,
            startAnchor: currParas[0].id,
            endAnchor: currParas[currParas.length - 1].id,
            wordCount: currWords,
            text: currParas.map((x) => x.text).join('\n\n')
        });
    }

    const memoryTraces = computeEbbinghausMemoryDecay(nsg, sceneContract.endWordOffset);
    const frictionEvents: FrictionEventEntry[] = [];

    if ((telemetry?.whiteRoomSpans || []).length > 0) {
        (telemetry?.whiteRoomSpans || []).forEach((wr) => {
            frictionEvents.push({
                type: 'WHITE_ROOM_DISORIENTATION',
                anchor: wr.start_anchor,
                severity: 'MEDIUM',
                readerThought: `Physical environment and sensory grounding vanish for ${wr.word_span} words starting at ${wr.start_anchor}.`
            });
        });
    }
    if (
        sceneContract.valueShift.startValence === sceneContract.valueShift.endValence &&
        !String(sceneContract.dramaticMode).includes('SEQUEL')
    ) {
        frictionEvents.push({
            type: 'UNEARNED_CAPITULATION',
            anchor: sceneContract.valueShift.turningPointAnchor,
            severity: 'MEDIUM',
            readerThought: `Scene value state remains flat (${sceneContract.valueShift.startValence}); the dramatic hinge feels under-dramatized.`
        });
    }

    norm.paragraphs.forEach((p) => {
        p.sentences.forEach((s) => {
            if (
                s.speaker_ref &&
                /\b(?:i\s+feel\s+so\s+betrayed|you\s+know\s+as\s+well\s+as\s+i\s+do|as\s+you\s+know|i\s+am\s+afraid\s+because|my\s+secret\s+is)\b/i.test(
                    s.text
                )
            ) {
                frictionEvents.push({
                    type: 'SUBTEXT_UNDER_RENDERED',
                    anchor: s.id,
                    severity: 'HIGH',
                    readerThought: `Dialogue states subtext or known exposition directly on the nose at ${s.id}.`
                });
            }
        });
    });

    const axisScores: Record<string, number> = {
        d1_causal: frictionEvents.some((f) => f.type === 'UNEARNED_CAPITULATION') ? 0.34 : 0.12,
        d2_subtext: frictionEvents.some((f) => f.type === 'SUBTEXT_UNDER_RENDERED')
            ? 0.38
            : (telemetry?.hardSlopViolations?.length || 0) > 0 ||
                (telemetry?.closerViolations?.length || 0) > 0
              ? 0.31
              : (telemetry?.slopViolations?.length || 0) > 0
                ? 0.26
                : 0.14,
        d3_value_shift:
            sceneContract.valueShift.startValence === sceneContract.valueShift.endValence ? 0.32 : 0.11,
        d4_epistemic: (sceneContract.scheduledClues || []).length > 0 ? 0.24 : 0.1,
        d5_pacing:
            frictionEvents.some((f) => f.type === 'WHITE_ROOM_DISORIENTATION') ||
            (telemetry?.monotonousClusters?.length || 0) > 1
                ? 0.29
                : 0.12
    };
    if ((telemetry?.closerViolations || []).length > 0) {
        const cl = telemetry!.closerViolations![0];
        frictionEvents.push({
            type: 'SCENE_CLOSER_CLICHE',
            anchor: cl.anchor || `${sceneContract.id}:p${Math.max(1, norm.paragraphs.length)}`,
            severity: 'HIGH',
            readerThought: `Final sentences rely on a generic scene-closing tell ("${cl.phrase}") instead of grounded action or unresolved tension.`
        });
    }
    let takeawaySummary = `Reader followed ${sceneContract.pov} through "${sceneContract.title}" (${sceneContract.valueShift.startValence} -> ${sceneContract.valueShift.endValence}).`;

    if (useLLM && typeof callAIFn === 'function') {
        try {
            const windowsXml = beatWindows
                .map(
                    (w) =>
                        `<BeatWindow id="${w.windowId}" start_anchor="${w.startAnchor}" end_anchor="${w.endAnchor}">\n<![CDATA[${w.text}]]>\n</BeatWindow>`
                )
                .join('\n');
            const blindPrompt = `<SceneBeatWindows scene_id="${sceneContract.id}">\n${windowsXml}\n</SceneBeatWindows>\n<PriorReaderMemoryState>\n${memoryTraces.slice(0, 6).map((m) => `<MemoryTrace label="${escapeHarnessXml(m.label)}" salience="${m.salience}" />`).join('\n')}\n</PriorReaderMemoryState>\nExperience this scene cold as the BlindReaderAgent and emit <SceneReaderExperienceLog>.`;
            const blindRaw = await callAIFn(
                blindPrompt,
                PROMPTS.blindReaderAgent,
                false,
                `Editorial Harness: Layer 0 Blind Reader (${sceneContract.displayCoord})`,
                'review'
            );

            const fBlocks = extractTagList(blindRaw, 'ReaderFrictionEvent') || [];
            fBlocks.forEach((fb) => {
                const typeMatch = fb.match(/type="([^"]+)"/i);
                const anchorMatch = fb.match(/anchor="([^"]+)"/i);
                const sevMatch = fb.match(/severity="([^"]+)"/i);
                const thought =
                    extractTag(fb, 'ReaderThought') || fb.replace(/<[^>]+>/g, '').trim();
                if (thought) {
                    frictionEvents.push({
                        type: typeMatch ? typeMatch[1] : 'SUBTEXT_UNDER_RENDERED',
                        anchor: anchorMatch ? anchorMatch[1] : `${sceneContract.id}:p1`,
                        severity: sevMatch ? sevMatch[1] : 'MEDIUM',
                        readerThought: thought
                    });
                }
            });
            const parsedTakeaway = extractTag(blindRaw, 'TakeawaySummary') || '';
            if (parsedTakeaway) takeawaySummary = parsedTakeaway.trim();

            const compPrompt = `<AuthorIntent scene_id="${sceneContract.id}">
  <Objective>${escapeHarnessXml(sceneContract.objective)}</Objective>
  <PlannedValueShift start="${escapeHarnessXml(sceneContract.valueShift.startValence)}" end="${escapeHarnessXml(sceneContract.valueShift.endValence)}" />
  <ScheduledClues count="${(sceneContract.scheduledClues || []).length}" />
</AuthorIntent>
<SceneReaderExperienceLog>
${blindRaw}
</SceneReaderExperienceLog>
Compare <AuthorIntent> against <SceneReaderExperienceLog> and emit <IntentExecutionDivergenceReport>.`;
            const compRaw = await callAIFn(
                compPrompt,
                PROMPTS.intentExecutionComparatorAgent,
                false,
                `Editorial Harness: Intent-Execution Comparator (${sceneContract.displayCoord})`,
                'review'
            );
            const axisBlocks = extractTagList(compRaw, 'Axis') || [];
            axisBlocks.forEach((ab) => {
                const idMatch = ab.match(/id="([^"]+)"/i);
                const scoreMatch = ab.match(/score="([0-9.]+)"/i);
                if (idMatch && scoreMatch && axisScores[idMatch[1]] !== undefined) {
                    const val = parseFloat(scoreMatch[1]);
                    if (!isNaN(val)) axisScores[idMatch[1]] = Math.max(0, Math.min(1, val));
                }
            });
        } catch (err) {
            console.warn(
                `[Layer0BlindReader] Fallback to deterministic divergence on ${sceneContract.id}:`,
                err
            );
        }
    }

    const weights: Record<string, number> = {
        d1_causal: 0.25,
        d2_subtext: 0.2,
        d3_value_shift: 0.2,
        d4_epistemic: 0.2,
        d5_pacing: 0.15
    };
    const dWeighted = Object.entries(weights).reduce(
        (acc, [k, w]) => acc + (axisScores[k] || 0) * w,
        0
    );
    const dMax = Math.max(...Object.values(axisScores));
    const dTotal = Number(Math.max(0.0, Math.min(1.0, 0.65 * dWeighted + 0.35 * dMax)).toFixed(3));

    return {
        sceneId: sceneContract.id,
        displayCoord: sceneContract.displayCoord,
        beatWindowsCount: beatWindows.length,
        axisScores,
        dWeighted: Number(dWeighted.toFixed(3)),
        dMax: Number(dMax.toFixed(3)),
        dTotal,
        frictionEvents,
        takeawaySummary,
        memoryTraces
    };
}
