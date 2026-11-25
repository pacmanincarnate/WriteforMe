/**
 * @module pipeline/editorialHarness
 * Autonomous Editorial Harness & Literary CI/CD Orchestrator (Tier 6.0):
 * Runs Phases 1-3 (Voice DNA, NSG, NLP Telemetry, Layer 0 Blind Reader, 11-Tool Investigation,
 * Adversarial Tribunal, 3-Wave Edit Plan compilation) and Phases 4-5 (3-Wave Surgical Execution
 * & 4-Gate CI/CD verification), plus single-transaction execution and surgical/full rollback.
 */

import {
    applyManuscriptPatchToScene,
    compileAestheticConstitution,
    compileGateFailureFeedback,
    compileNarrativeStateGraph,
    compileThreeWaveEditPlan,
    conveneAdversarialTribunal,
    escapeHarnessXml,
    evaluateSceneLayer0AndDivergence,
    extractAuthorVoiceDNA,
    getDraftedStoryScenesList,
    runAutonomousInvestigationStage,
    runFourGateVerificationSuite,
    runFullManuscriptNlpTelemetry,
    runSceneNlpTelemetry,
    type AestheticConstitution,
    type AuthorVoiceDNA,
    type CompiledThreeWaveEditPlan,
    type EditPlanTransaction,
    type EditorialStoryInput,
    type FullManuscriptTelemetryReport,
    type InvestigationDossier,
    type Layer0EvaluationReport,
    type ManuscriptPatchResult,
    type NarrativeStateGraph,
    type TribunalCase,
    type VerificationGateReport
} from '@/domain/editorial';
import { locateNeedle } from '@/domain/editing';
import { normalizeIntentionalOverrides } from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import {
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';

export interface RunEditorialHarnessOptions {
    mode?: 'full_pipeline' | 'review_only' | 'execute_plan';
    scopeSceneId?: string;
    useLLM?: boolean;
    storyOverride?: PipelineStory | null;
    isAutopilot?: boolean;
}

export interface EditorialHarnessSummary {
    scenesEvaluated: number;
    meanDivergence: number;
    dossiersCompiled: number;
    verifiedTicketsCount: number;
    dismissedTicketsCount: number;
    totalTransactions: number;
    committedTransactions: number;
    rolledBackTransactions: number;
}

export interface HarnessAttemptHistoryEntry {
    attempt: number;
    proposedSpan: string | undefined;
    failedGates: string[];
    feedback: { diagnostic: string; correction: string };
    gateResults: VerificationGateReport[];
}

export interface ExtendedEditPlanTransaction
    extends EditPlanTransaction,
        Record<string, unknown> {
    transaction_id?: string;
    sceneKey?: string;
    proseKey?: string;
    attempts_used?: number;
    attemptHistory?: HarnessAttemptHistoryEntry[];
    beforeProse?: string;
    afterProse?: string;
    beforeSpan?: string;
    afterSpan?: string;
}

export interface EditorialHarnessState extends Record<string, unknown> {
    lastRunAt: string;
    mode: string;
    scopeSceneId: string;
    autopilotCompleted: boolean;
    customConstitutionOverrides: unknown;
    constitution: AestheticConstitution | null;
    voiceDna: AuthorVoiceDNA | undefined;
    nsg: NarrativeStateGraph | undefined;
    fullTelemetry: FullManuscriptTelemetryReport | undefined;
    layer0Map: Record<string, Layer0EvaluationReport>;
    dossiers: InvestigationDossier[];
    tribunalResult: {
        tribunalCases?: TribunalCase[];
        verifiedTickets?: unknown[];
        dismissedCount?: number;
    } | null;
    editPlan: CompiledThreeWaveEditPlan | null;
    preRunProseSnapshot: Record<string, unknown>;
    summary: EditorialHarnessSummary;
    logs: Array<{
        id: string;
        timestamp: string;
        phase: string;
        message: string;
        status: string;
    }>;
}

function resolveWaveAgentPrompt(
    wave: { waveId?: unknown; waveKey?: unknown; name?: unknown },
    tx: { wave?: unknown }
): string {
    const wId = String(wave.waveId ?? '');
    const wKey = String(wave.waveKey ?? '');
    const txWave = String(tx.wave ?? '');
    const isWave1 =
        wId === '1' ||
        wId === 'WAVE_1_MACRO' ||
        wKey === 'WAVE_1_MACRO' ||
        txWave === 'WAVE_1_MACRO' ||
        txWave === '1';
    const isWave2 =
        wId === '2' ||
        wId === 'WAVE_2_MESO' ||
        wKey === 'WAVE_2_MESO' ||
        txWave === 'WAVE_2_MESO' ||
        txWave === '2';
    const agentPromptKey = isWave1
        ? 'macroStructuralArchitectAgent'
        : isWave2
          ? 'mesoSceneSurgeonAgent'
          : 'microLineStylistAgent';
    return PROMPTS[agentPromptKey] || PROMPTS.microLineStylistAgent;
}

/** Runs the 5-Phase Autonomous Editorial Harness across one scene or the full manuscript. */
export async function runAutonomousEditorialHarness(
    ctx: PipelineRuntimeContext,
    {
        mode = 'full_pipeline',
        scopeSceneId = ctx.getEditorialScopeSceneId?.() || 'ALL',
        useLLM = ctx.getEditorialUseDeepLLM?.() ?? true,
        storyOverride = null,
        isAutopilot = false
    }: RunEditorialHarnessOptions = {}
): Promise<EditorialHarnessState | null> {
    const baseStory = storyOverride || ctx.getStory();
    const allDrafted = getDraftedStoryScenesList(baseStory as unknown as EditorialStoryInput);
    if (allDrafted.length === 0) {
        ctx.showToast(
            'No drafted prose scenes found. Write at least one scene before running the Autonomous Editorial Harness.',
            'warning'
        );
        return null;
    }

    ctx.setIsRunningEditorialHarness?.(true);
    ctx.setLoading(true);
    ctx.setCurrentPipelineStep?.(21);
    ctx.setEditorialHarnessProgress?.(5);

    const existingHarness = asRecord(baseStory.editorial_harness);
    const runLogs = [
        ...(Array.isArray(existingHarness.logs)
            ? (existingHarness.logs as EditorialHarnessState['logs'])
            : [])
    ];
    const appendHarnessLog = (phase: string, message: string, status = 'info'): void => {
        runLogs.push({
            id: `hlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toLocaleTimeString(),
            phase,
            message,
            status
        });
        console.log(`[EditorialHarness][${phase}] ${message}`);
    };

    const bannedPhrases = ctx.getBannedPhrases();
    const slopConfig = ctx.getSlopConfig();

    try {
        const workingStory = JSON.parse(JSON.stringify(baseStory)) as PipelineStory;
        const workingHarness = asRecord(workingStory.editorial_harness);
        const callAIIfEnabled = useLLM ? ctx.callAI : null;
        const customOverrides = normalizeIntentionalOverrides(
            workingHarness.customConstitutionOverrides ||
                asOptionalRecord(workingHarness.constitution)?.intentionalOverrides ||
                workingHarness.novelignore
        );

        let constitution: AestheticConstitution | null = workingHarness.constitution
            ? ({
                  ...(workingHarness.constitution as AestheticConstitution),
                  intentionalOverrides: normalizeIntentionalOverrides(
                      (workingHarness.constitution as AestheticConstitution).intentionalOverrides
                  )
              } as AestheticConstitution)
            : null;
        let fullTelemetry = workingHarness.fullTelemetry as
            | FullManuscriptTelemetryReport
            | undefined;
        let voiceDna = workingHarness.voiceDna as AuthorVoiceDNA | undefined;
        let nsg = workingHarness.nsg as NarrativeStateGraph | undefined;
        let layer0Map = (workingHarness.layer0Map || {}) as Record<string, Layer0EvaluationReport>;
        let dossiers = (workingHarness.dossiers || []) as InvestigationDossier[];
        let tribunalResult = (workingHarness.tribunalResult || null) as EditorialHarnessState['tribunalResult'];
        let editPlan = (workingHarness.editPlan || null) as CompiledThreeWaveEditPlan | null;

        if (mode !== 'execute_plan' || !editPlan) {
            ctx.setEditorialHarnessPhase?.(
                'Phase 1: Compiling Aesthetic Constitution, Voice DNA & Narrative State Graph...'
            );
            ctx.setActivePipelineWork?.({
                mode: 'novel',
                phase: 5,
                elementType: 'editorial',
                title: 'Autonomous Editorial Harness',
                itemIndex: 1,
                itemTotal: 5,
                subStep: 'Phase 1: Voice DNA & Narrative State Graph',
                startedAt: Date.now()
            });
            ctx.setLoadingStep('Editorial Harness Phase 1: Voice DNA & NSG...');
            ctx.setEditorialHarnessProgress?.(15);
            appendHarnessLog(
                'Phase 1',
                `Normalizing ${allDrafted.length} drafted scene(s) into canonical XML with <p> and <s> coordinates...`,
                'running'
            );

            constitution = compileAestheticConstitution(
                workingStory as unknown as EditorialStoryInput,
                customOverrides
            );
            fullTelemetry = runFullManuscriptNlpTelemetry(
                workingStory as unknown as EditorialStoryInput,
                bannedPhrases,
                slopConfig
            );
            voiceDna = await extractAuthorVoiceDNA(
                workingStory as unknown as EditorialStoryInput,
                fullTelemetry,
                callAIIfEnabled,
                bannedPhrases
            );
            nsg = compileNarrativeStateGraph(
                workingStory as unknown as EditorialStoryInput,
                fullTelemetry
            );

            appendHarnessLog(
                'Phase 1',
                `Compiled <AuthorVoiceDNA> (Sentence Mean: ${voiceDna.syntacticCadence?.meanWords}w, CV: ${voiceDna.syntacticCadence?.coeffOfVariation}, Psychic Distance: ${voiceDna.perceptualProfile?.baselinePsychicDistance}) and <NarrativeStateGraph> (${nsg.sceneContracts?.length || 0} scene contracts, ${nsg.threadsLedger?.length || 0} plot threads).`,
                'success'
            );

            // Phase 2A & 2B: Layer 0 Blind Reader Simulation
            ctx.setEditorialHarnessPhase?.(
                'Phase 2A–2B: Running Deterministic NLP Telemetry & Layer 0 Blind Reader Simulation...'
            );
            ctx.setLoadingStep('Editorial Harness Phase 2B: Layer 0 Blind Reader...');
            ctx.setEditorialHarnessProgress?.(35);

            const targetScenes =
                scopeSceneId && scopeSceneId !== 'ALL'
                    ? allDrafted.filter(
                          (s) =>
                              s.sceneId === scopeSceneId ||
                              s.proseKey === scopeSceneId ||
                              s.displayCoord === scopeSceneId
                      )
                    : allDrafted;

            layer0Map = { ...((workingHarness.layer0Map || {}) as Record<string, Layer0EvaluationReport>) };
            for (let i = 0; i < targetScenes.length; i++) {
                const sc = targetScenes[i];
                ctx.setActivePipelineWork?.({
                    mode: 'novel',
                    phase: 5,
                    elementType: 'editorial',
                    startedAt: Date.now(),
                    title: sc.title || sc.displayCoord || 'Editorial Review',
                    sceneLabel: sc.displayCoord,
                    itemIndex: i + 1,
                    itemTotal: targetScenes.length,
                    subStep: 'Phase 2B: Layer 0 Blind Reader'
                });
                const scTelemetry = fullTelemetry.sceneTelemetryMap[sc.sceneId];
                const scContract = (nsg.sceneContracts || []).find(
                    (c) => c.id === sc.sceneId
                ) || {
                    id: sc.sceneId,
                    proseKey: sc.proseKey,
                    displayCoord: sc.displayCoord,
                    seqIdx: sc.seqIdx,
                    sceneIdx: sc.sceneIdx,
                    actNum: 1,
                    seqNum: sc.seqIdx + 1,
                    pov: sc.normalized.pov,
                    title: sc.title,
                    wordCount: sc.normalized.wordCount,
                    startWordOffset: 0,
                    endWordOffset: sc.endWordOffset || sc.normalized.wordCount,
                    dramaticMode: 'SCENE_PROACTIVE',
                    narrativeLens: 'BASELINE_NEUTRAL',
                    objective: asString(sc.sceneMeta?.objective) || 'Advance sequence dramatic question',
                    hingeMoment: asString(sc.sceneMeta?.the_hinge_moment),
                    valueShift: {
                        startValence: 'Baseline',
                        endValence: 'Transformed',
                        turningPointAnchor: `${sc.sceneId}:p1`
                    },
                    scheduledClues: [],
                    scheduledReveal: null
                };
                const l0 = await evaluateSceneLayer0AndDivergence(
                    scContract,
                    sc,
                    nsg,
                    scTelemetry,
                    callAIIfEnabled,
                    useLLM
                );
                layer0Map[sc.sceneId] = l0;
            }

            const l0Values = Object.values(layer0Map);
            const meanDivergence =
                l0Values.length > 0
                    ? Number(
                          (
                              l0Values.reduce(
                                  (sum, r) => sum + (r.dTotal ?? 0),
                                  0
                              ) / l0Values.length
                          ).toFixed(3)
                      )
                    : 0;
            appendHarnessLog(
                'Phase 2B',
                `Completed Layer 0 Blind Reader Sandbox across ${targetScenes.length} scene(s). Mean 5-Axis Intent-vs-Execution Divergence D_total = ${meanDivergence}.`,
                'success'
            );

            // Phase 2C: 11-Tool Autonomous Investigation
            ctx.setEditorialHarnessPhase?.(
                'Phase 2C: Running 11-Tool Autonomous Investigation...'
            );
            ctx.setActivePipelineWork?.({
                mode: 'novel',
                phase: 5,
                elementType: 'editorial',
                title: 'Autonomous Editorial Harness',
                itemIndex: 3,
                itemTotal: 5,
                subStep: 'Phase 2C: 11-Tool Autonomous Investigation',
                startedAt: Date.now()
            });
            ctx.setLoadingStep('Editorial Harness Phase 2C: 11-Tool Investigation...');
            ctx.setEditorialHarnessProgress?.(50);

            const invRes = await runAutonomousInvestigationStage(
                workingStory as unknown as EditorialStoryInput,
                nsg,
                fullTelemetry,
                layer0Map,
                callAIIfEnabled,
                useLLM
            );
            const allDossiers = invRes?.dossiers || [];
            dossiers =
                scopeSceneId && scopeSceneId !== 'ALL'
                    ? allDossiers.filter(
                          (d) => d.sceneId === scopeSceneId || d.displayCoord === scopeSceneId
                      )
                    : allDossiers;

            appendHarnessLog(
                'Phase 2C',
                `Compiled ${dossiers.length} <InvestigationDossier> evidence packet(s) using the 11 read-only XML inspection tools.`,
                'success'
            );

            // Phase 2D: Adversarial Editorial Tribunal
            ctx.setEditorialHarnessPhase?.(
                'Phase 2D: Convening Adversarial Editorial Tribunal (Prosecutor vs. Defense -> Judge)...'
            );
            ctx.setActivePipelineWork?.({
                mode: 'novel',
                phase: 5,
                elementType: 'editorial',
                title: 'Autonomous Editorial Harness',
                itemIndex: 4,
                itemTotal: 5,
                subStep: 'Phase 2D: Adversarial Editorial Tribunal',
                startedAt: Date.now()
            });
            ctx.setLoadingStep('Editorial Harness Phase 2D: Adversarial Tribunal...');
            ctx.setEditorialHarnessProgress?.(65);

            const convened = await conveneAdversarialTribunal(
                dossiers,
                constitution,
                voiceDna,
                nsg,
                callAIIfEnabled,
                useLLM
            );
            const dismissedCount = Math.max(
                0,
                (convened.tribunalCases?.length || 0) - (convened.verifiedTickets?.length || 0)
            );
            tribunalResult = {
                ...convened,
                dismissedCount
            };
            appendHarnessLog(
                'Phase 2D',
                `Tribunal adjudicated ${convened.tribunalCases?.length || 0} dossier(s): ${convened.verifiedTickets?.length || 0} verified ticket(s) queued (Priority >= 35), ${dismissedCount} dismissed/vetoed.`,
                'success'
            );

            // Phase 3: 3-Wave Edit Plan Compiler
            ctx.setEditorialHarnessPhase?.(
                'Phase 3: Compiling Dependency-Ordered 3-Wave Edit Plan...'
            );
            ctx.setActivePipelineWork?.({
                mode: 'novel',
                phase: 5,
                elementType: 'editorial',
                title: 'Autonomous Editorial Harness',
                itemIndex: 5,
                itemTotal: 5,
                subStep: 'Phase 3: 3-Wave Edit Plan Compiler',
                startedAt: Date.now()
            });
            ctx.setLoadingStep('Editorial Harness Phase 3: 3-Wave Edit Plan Compiler...');
            ctx.setEditorialHarnessProgress?.(75);

            editPlan = compileThreeWaveEditPlan(convened.verifiedTickets || [], nsg, fullTelemetry);
            appendHarnessLog(
                'Phase 3',
                `Compiled <CompiledEditPlan> (${editPlan.allTransactions?.length || 0} atomic transaction(s): Wave 1 Macro=${editPlan.waves[0]?.transactions?.length || 0}, Wave 2 Meso=${editPlan.waves[1]?.transactions?.length || 0}, Wave 3 Micro=${editPlan.waves[2]?.transactions?.length || 0}).`,
                'success'
            );
        }

        const preRunProseSnapshot = (workingHarness.preRunProseSnapshot ||
            JSON.parse(JSON.stringify(workingStory.prose || {}))) as Record<string, unknown>;
        let committedCount = 0;
        let rejectedCount = 0;

        if (
            (mode === 'full_pipeline' || mode === 'execute_plan') &&
            editPlan &&
            Array.isArray(editPlan.waves)
        ) {
            ctx.setEditorialHarnessPhase?.(
                'Phase 4 & 5: Executing 3-Wave Surgical Patches & 4-Gate Literary CI/CD Suite...'
            );
            ctx.setLoadingStep('Editorial Harness Phases 4–5: 3-Wave Patches & 4-Gate CI/CD...');
            ctx.setEditorialHarnessProgress?.(85);

            for (const wave of editPlan.waves) {
                for (let tIdx = 0; tIdx < (wave.transactions || []).length; tIdx++) {
                    const tx = wave.transactions[tIdx] as ExtendedEditPlanTransaction;
                    if (tx.status === 'COMMITTED') continue;
                    if (
                        scopeSceneId &&
                        scopeSceneId !== 'ALL' &&
                        tx.sceneId !== scopeSceneId &&
                        tx.displayCoord !== scopeSceneId
                    ) {
                        continue;
                    }

                    const currentSceneList = getDraftedStoryScenesList(
                        workingStory as unknown as EditorialStoryInput
                    );
                    const sceneItem = currentSceneList.find(
                        (s) =>
                            s.sceneId === tx.sceneId ||
                            s.proseKey === tx.sceneId ||
                            s.displayCoord === tx.displayCoord
                    );
                    if (!sceneItem) continue;

                    ctx.setActivePipelineWork?.({
                        mode: 'novel',
                        phase: 5,
                        elementType: 'editorial',
                        startedAt: Date.now(),
                        sceneLabel: sceneItem.displayCoord,
                        title: sceneItem.title || sceneItem.displayCoord,
                        subStep: 'Phases 4–5: Surgical Patch & 4-Gate CI/CD'
                    });

                    const beforeProse = sceneItem.proseText;
                    const preTelemetry = runSceneNlpTelemetry(
                        sceneItem,
                        workingStory as unknown as EditorialStoryInput,
                        bannedPhrases,
                        slopConfig
                    );

                    let attempt = 1;
                    const maxAttempts = 3;
                    let lastGateSuite:
                        | Awaited<ReturnType<typeof runFourGateVerificationSuite>>
                        | null = null;
                    let lastPatchRes: ManuscriptPatchResult | null = null;
                    const attemptHistory: HarnessAttemptHistoryEntry[] = [];

                    while (attempt <= maxAttempts) {
                        let rawPatchOutput: string | null = null;
                        if (useLLM && typeof callAIIfEnabled === 'function') {
                            try {
                                const sysPrompt = resolveWaveAgentPrompt(wave, tx);
                                const startParaId = String(tx.startAnchor || '').split(':s')[0];
                                const pList = sceneItem.normalized?.paragraphs || [];
                                const pIdx = pList.findIndex((p) => p.id === startParaId);
                                const prevParaText = pIdx > 0 ? pList[pIdx - 1]?.text || '' : '';
                                const nextParaText =
                                    pIdx >= 0 && pIdx < pList.length - 1
                                        ? pList[pIdx + 1]?.text || ''
                                        : '';

                                let feedbackXml = '';
                                if (attemptHistory.length > 0) {
                                    feedbackXml =
                                        `<FeedbackFromPriorRounds current_round="${attempt}" max_rounds="${maxAttempts}">\n` +
                                        attemptHistory
                                            .map(
                                                (h) =>
                                                    `  <PriorAttempt round="${h.attempt}">\n    <RejectedSpan><![CDATA[${h.proposedSpan || ''}]]></RejectedSpan>\n    <FailureDiagnostic>${escapeHarnessXml(h.feedback?.diagnostic || '')}</FailureDiagnostic>\n    <RequiredCorrectionDirective>${escapeHarnessXml(h.feedback?.correction || '')}</RequiredCorrectionDirective>\n  </PriorAttempt>`
                                            )
                                            .join('\n') +
                                        `\n  <Round${attempt}Directive>Do NOT repeat or closely paraphrase any rejected replacement above. You MUST take a fundamentally fresh craft approach that satisfies the RequiredCorrectionDirective while strictly preserving <AuthorVoiceDNA>.</Round${attempt}Directive>\n</FeedbackFromPriorRounds>`;
                                }

                                const userPrompt = `${voiceDna?.xml || ''}\n${constitution?.xml || ''}\n<TargetScene id="${tx.sceneId}">
  <PrecedingContext><![CDATA[${prevParaText}]]></PrecedingContext>
  <AtomicEditTransaction id="${tx.transactionId}" wave="${tx.wave}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <Problem>${escapeHarnessXml(tx.combinedProblem)}</Problem>
    <SurgicalDirective>${escapeHarnessXml(tx.combinedDirective)}</SurgicalDirective>
    <OriginalSpanVerifier><![CDATA[${tx.verbatimOriginal}]]></OriginalSpanVerifier>
  </AtomicEditTransaction>
  <FollowingContext><![CDATA[${nextParaText}]]></FollowingContext>
</TargetScene>
${feedbackXml ? `${feedbackXml}\n` : ''}Emit a <ManuscriptPatchTransaction transaction_id="${tx.transactionId}" target_scene="${tx.sceneId}">
  <PatchOperation type="REPLACE_SPAN" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <OriginalSpanVerifier><![CDATA[${tx.verbatimOriginal}]]></OriginalSpanVerifier>
    <ReplacementSpan>
      <!-- Fresh revised prose resolving the ticket and satisfying Round ${attempt} feedback -->
    </ReplacementSpan>
  </PatchOperation>
</ManuscriptPatchTransaction>`;
                                rawPatchOutput = await callAIIfEnabled(
                                    userPrompt,
                                    sysPrompt,
                                    false,
                                    `Editorial Harness ${wave.name || wave.waveId} (${tx.transactionId} - R${attempt}/${maxAttempts})`,
                                    'Polish'
                                );
                            } catch (llmErr) {
                                console.warn(
                                    `[EditorialHarness] Specialist LLM fallback to deterministic surgical repair for ${tx.transactionId} round ${attempt}:`,
                                    llmErr
                                );
                            }
                        }

                        const patchRes = applyManuscriptPatchToScene(
                            sceneItem,
                            tx,
                            rawPatchOutput,
                            workingStory as unknown as EditorialStoryInput,
                            attempt,
                            attemptHistory[attemptHistory.length - 1]?.feedback
                        );
                        lastPatchRes = patchRes;

                        const gateSuite = await runFourGateVerificationSuite({
                            sceneItem,
                            patchedResult: patchRes,
                            transaction: tx,
                            baselineTelemetry: preTelemetry,
                            nsg,
                            constitution,
                            voiceDna,
                            story: workingStory as unknown as EditorialStoryInput,
                            slopConfig,
                            callAIFn: callAIIfEnabled,
                            useLLM
                        });
                        lastGateSuite = gateSuite;

                        if (
                            gateSuite.allPassed &&
                            asString(patchRes.updatedFullProse).trim() !== beforeProse.trim()
                        ) {
                            const sKey = sceneItem.proseKey;
                            const workingProseMap = asRecord(workingStory.prose);
                            const prevProseEntry = workingProseMap[sKey];
                            workingProseMap[sKey] = {
                                ...asRecord(prevProseEntry),
                                final: patchRes.updatedFullProse,
                                draft: patchRes.updatedFullProse,
                                editorial_harness_patched: true,
                                last_patch_tx: tx.transactionId
                            };
                            workingStory.prose = workingProseMap;
                            tx.status = 'COMMITTED';
                            tx.attempts_used = attempt;
                            tx.attemptHistory = attemptHistory;
                            tx.proseKey = sKey;
                            tx.beforeProse = beforeProse;
                            tx.afterProse = patchRes.updatedFullProse;
                            tx.beforeSpan = patchRes.beforeSpan;
                            tx.afterSpan = patchRes.afterSpan;
                            tx.gateResults = gateSuite.gates;
                            committedCount++;

                            if (fullTelemetry) {
                                fullTelemetry.sceneTelemetryMap[sceneItem.sceneId] =
                                    gateSuite.postTelemetry;
                            }
                            appendHarnessLog(
                                `${wave.waveId} CI/CD`,
                                `COMMITTED [${tx.transactionId}] (${wave.specialistAgent}) on ${tx.sceneId}: All 4 Literary CI/CD Gates PASSED on round ${attempt}/${maxAttempts}${attempt > 1 ? ' (Feedback loop resolved prior failures)' : ''}.`,
                                'success'
                            );
                            break;
                        } else {
                            const feedback = compileGateFailureFeedback(gateSuite, patchRes, attempt);
                            attemptHistory.push({
                                attempt,
                                proposedSpan: patchRes.afterSpan,
                                failedGates: (gateSuite.gates || [])
                                    .filter((g) => !g.passed)
                                    .map((g) => g.gate),
                                feedback,
                                gateResults: gateSuite.gates
                            });

                            appendHarnessLog(
                                `${wave.waveId} CI/CD`,
                                `Round ${attempt}/${maxAttempts} REJECTED for [${tx.transactionId}] (${feedback.diagnostic}). Initiating feedback loop retry...`,
                                'warning'
                            );
                            attempt++;
                        }
                    }

                    if (tx.status !== 'COMMITTED') {
                        const candidateFull = lastPatchRes?.updatedFullProse || beforeProse;
                        tx.status =
                            candidateFull.trim() === beforeProse.trim()
                                ? 'NO_OP_CLEAN'
                                : 'ROLLED_BACK';
                        tx.attempts_used = maxAttempts;
                        tx.attemptHistory = attemptHistory;
                        tx.proseKey = sceneItem.proseKey;
                        tx.beforeProse = beforeProse;
                        tx.afterProse = beforeProse;
                        tx.beforeSpan = lastPatchRes?.beforeSpan || tx.verbatimOriginal;
                        tx.afterSpan = lastPatchRes?.afterSpan || tx.verbatimOriginal;
                        tx.gateResults = lastGateSuite ? lastGateSuite.gates : [];
                        if (tx.status === 'ROLLED_BACK') {
                            rejectedCount++;
                            const lastReason =
                                attemptHistory[attemptHistory.length - 1]?.feedback?.diagnostic ||
                                'Failed verification gates';
                            appendHarnessLog(
                                `${wave.waveId} CI/CD`,
                                `ROLLED BACK [${tx.transactionId}] on ${tx.sceneId}: Worktree discarded after ${maxAttempts} feedback rounds (${lastReason}) to protect manuscript integrity.`,
                                'warning'
                            );
                        }
                    }
                }
            }

            fullTelemetry = runFullManuscriptNlpTelemetry(
                workingStory as unknown as EditorialStoryInput,
                bannedPhrases,
                slopConfig
            );
            nsg = compileNarrativeStateGraph(
                workingStory as unknown as EditorialStoryInput,
                fullTelemetry
            );
        }

        const postL0Values = Object.values(layer0Map);
        const postMeanDivergence =
            postL0Values.length > 0
                ? Number(
                      (
                          postL0Values.reduce(
                              (sum, r) => sum + (r.dTotal ?? 0),
                              0
                          ) / postL0Values.length
                      ).toFixed(3)
                  )
                : 0;

        const harnessState: EditorialHarnessState = {
            lastRunAt: new Date().toISOString(),
            mode,
            scopeSceneId,
            autopilotCompleted: isAutopilot ? true : Boolean(workingHarness.autopilotCompleted),
            customConstitutionOverrides: normalizeIntentionalOverrides(
                constitution?.intentionalOverrides
            ),
            constitution: constitution
                ? {
                      ...constitution,
                      intentionalOverrides: normalizeIntentionalOverrides(
                          constitution.intentionalOverrides
                      )
                  }
                : null,
            voiceDna,
            nsg,
            fullTelemetry,
            layer0Map,
            dossiers,
            tribunalResult,
            editPlan,
            preRunProseSnapshot,
            summary: {
                scenesEvaluated: Object.keys(layer0Map).length,
                meanDivergence: postMeanDivergence,
                dossiersCompiled: dossiers.length,
                verifiedTicketsCount: tribunalResult?.verifiedTickets?.length || 0,
                dismissedTicketsCount: Math.max(
                    0,
                    (tribunalResult?.tribunalCases?.length || 0) -
                        (tribunalResult?.verifiedTickets?.length || 0)
                ),
                totalTransactions: editPlan?.allTransactions?.length || 0,
                committedTransactions: committedCount,
                rolledBackTransactions: rejectedCount
            },
            logs: runLogs.slice(-100)
        };

        const committedProseKeys = new Set<string>();
        (editPlan?.waves || []).forEach((w) => {
            (w.transactions || []).forEach((tx) => {
                const extTx = tx as ExtendedEditPlanTransaction;
                if (extTx.status === 'COMMITTED' && extTx.proseKey) {
                    committedProseKeys.add(extTx.proseKey);
                }
            });
        });

        const finalHarnessStory = ctx.setStory((prev) => {
            const prevProseMap = asRecord(prev.prose);
            const mergedProse: Record<string, unknown> = { ...prevProseMap };
            const workingProseMap = asRecord(workingStory.prose);
            committedProseKeys.forEach((sKey) => {
                if (workingProseMap[sKey]) {
                    const currentEntry = prevProseMap[sKey];
                    const currentRec = asOptionalRecord(currentEntry);
                    const currentFinal =
                        typeof currentEntry === 'string'
                            ? currentEntry
                            : asString(currentRec?.final || currentRec?.prose);
                    const preRunEntry = preRunProseSnapshot[sKey];
                    const preRunRec = asOptionalRecord(preRunEntry);
                    const preRunFinal =
                        typeof preRunEntry === 'string'
                            ? preRunEntry
                            : asString(preRunRec?.final || preRunRec?.prose);
                    if (!preRunFinal || currentFinal === preRunFinal) {
                        mergedProse[sKey] = {
                            ...asRecord(currentEntry),
                            ...asRecord(workingProseMap[sKey])
                        };
                    }
                }
            });
            return {
                ...prev,
                prose: mergedProse,
                editorial_harness: harnessState
            };
        });
        const savedId = asString(finalHarnessStory?.id);
        if (savedId) {
            await storyStore.saveStory(savedId, finalHarnessStory);
        }

        ctx.setEditorialHarnessProgress?.(100);
        ctx.setEditorialHarnessPhase?.('Complete: 5-Phase Autonomous Editorial Harness Finished.');

        const toastSummary =
            mode === 'review_only'
                ? `Editorial Review complete! ${harnessState.summary.verifiedTicketsCount} verified tickets queued across 3 waves.`
                : `Editorial Harness complete! ${committedCount} surgical revision(s) passed all 4 CI/CD gates.`;
        ctx.showToast(toastSummary, 'success');
        return harnessState;
    } catch (err) {
        const msg = extractErrorMessage(err);
        console.error('[runAutonomousEditorialHarness] Error:', err);
        appendHarnessLog('Error', `Editorial Harness failed: ${msg}`, 'error');
        ctx.showToast(`Editorial Harness error: ${msg}`, 'error');
        return null;
    } finally {
        ctx.setIsRunningEditorialHarness?.(false);
        if (!isAutopilot) {
            ctx.setLoading(false);
            ctx.setLoadingStep('');
        }
    }
}

/** Executes a single pending transaction from the compiled 3-Wave Edit Plan via 4-Gate CI/CD. */
export async function executeSingleHarnessTransaction(
    ctx: PipelineRuntimeContext,
    transactionId: string
): Promise<void> {
    const story = ctx.getStory();
    const currentHarness = asOptionalRecord(story.editorial_harness);
    if (!currentHarness || !currentHarness.editPlan) return;

    ctx.setIsRunningEditorialHarness?.(true);
    ctx.setEditorialHarnessPhase?.(
        `Executing transaction ${transactionId} through 4-Gate CI/CD...`
    );

    const editorialUseDeepLLM = ctx.getEditorialUseDeepLLM?.() ?? true;
    const bannedPhrases = ctx.getBannedPhrases();
    const slopConfig = ctx.getSlopConfig();

    try {
        const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
        const harness = asRecord(workingStory.editorial_harness);
        const editPlan = harness.editPlan as CompiledThreeWaveEditPlan;
        let targetTx: ExtendedEditPlanTransaction | null = null;
        let targetWave: CompiledThreeWaveEditPlan['waves'][number] | null = null;

        for (const w of editPlan?.waves || []) {
            const found = (w.transactions || []).find(
                (t) =>
                    ((t as ExtendedEditPlanTransaction).transactionId ||
                        (t as ExtendedEditPlanTransaction).transaction_id) === transactionId
            ) as ExtendedEditPlanTransaction | undefined;
            if (found) {
                targetTx = found;
                targetWave = w;
                break;
            }
        }
        if (!targetTx) {
            ctx.showToast(`Transaction ${transactionId} not found.`, 'warning');
            return;
        }

        const scenesList = getDraftedStoryScenesList(workingStory as unknown as EditorialStoryInput);
        const sceneItem = scenesList.find(
            (s) => s.sceneId === targetTx.sceneId || s.proseKey === targetTx.proseKey
        );
        if (!sceneItem) {
            ctx.showToast(`Target scene ${targetTx.sceneId} has no drafted prose.`, 'warning');
            return;
        }

        const beforeProse = sceneItem.proseText;
        const preTelemetry = runSceneNlpTelemetry(
            sceneItem,
            workingStory as unknown as EditorialStoryInput,
            bannedPhrases,
            slopConfig
        );

        let attempt = 1;
        const maxAttempts = 3;
        let lastGateSuite: Awaited<ReturnType<typeof runFourGateVerificationSuite>> | null = null;
        let lastPatchRes: ManuscriptPatchResult | null = null;
        const attemptHistory: HarnessAttemptHistoryEntry[] = [];

        while (attempt <= maxAttempts) {
            let rawPatchOutput: string | null = null;
            if (editorialUseDeepLLM) {
                try {
                    const sysPrompt = resolveWaveAgentPrompt(targetWave || {}, targetTx);
                    const startParaId = String(targetTx.startAnchor || '').split(':s')[0];
                    const pList = sceneItem.normalized?.paragraphs || [];
                    const pIdx = pList.findIndex((p) => p.id === startParaId);
                    const prevParaText = pIdx > 0 ? pList[pIdx - 1]?.text || '' : '';
                    const nextParaText =
                        pIdx >= 0 && pIdx < pList.length - 1 ? pList[pIdx + 1]?.text || '' : '';

                    let feedbackXml = '';
                    if (attemptHistory.length > 0) {
                        feedbackXml =
                            `<FeedbackFromPriorRounds current_round="${attempt}" max_rounds="${maxAttempts}">\n` +
                            attemptHistory
                                .map(
                                    (h) =>
                                        `  <PriorAttempt round="${h.attempt}">\n    <RejectedSpan><![CDATA[${h.proposedSpan || ''}]]></RejectedSpan>\n    <FailureDiagnostic>${escapeHarnessXml(h.feedback?.diagnostic || '')}</FailureDiagnostic>\n    <RequiredCorrectionDirective>${escapeHarnessXml(h.feedback?.correction || '')}</RequiredCorrectionDirective>\n  </PriorAttempt>`
                                )
                                .join('\n') +
                            `\n  <Round${attempt}Directive>Do NOT repeat or closely paraphrase any rejected replacement above. You MUST take a fundamentally fresh craft approach that satisfies the RequiredCorrectionDirective while strictly preserving <AuthorVoiceDNA>.</Round${attempt}Directive>\n</FeedbackFromPriorRounds>`;
                    }

                    const voiceXml = asString(asOptionalRecord(harness.voiceDna)?.xml);
                    const constitutionXml = asString(asOptionalRecord(harness.constitution)?.xml);
                    const userPrompt = `${voiceXml}\n${constitutionXml}\n<TargetScene id="${targetTx.sceneId}">
  <PrecedingContext><![CDATA[${prevParaText}]]></PrecedingContext>
  <AtomicEditTransaction id="${targetTx.transactionId}" wave="${targetTx.wave}" start_anchor="${targetTx.startAnchor}" end_anchor="${targetTx.endAnchor}">
    <Problem>${escapeHarnessXml(targetTx.combinedProblem)}</Problem>
    <SurgicalDirective>${escapeHarnessXml(targetTx.combinedDirective)}</SurgicalDirective>
    <OriginalSpanVerifier><![CDATA[${targetTx.verbatimOriginal}]]></OriginalSpanVerifier>
  </AtomicEditTransaction>
  <FollowingContext><![CDATA[${nextParaText}]]></FollowingContext>
</TargetScene>
${feedbackXml ? `${feedbackXml}\n` : ''}Emit a <ManuscriptPatchTransaction transaction_id="${targetTx.transactionId}" target_scene="${targetTx.sceneId}">
  <PatchOperation type="REPLACE_SPAN" start_anchor="${targetTx.startAnchor}" end_anchor="${targetTx.endAnchor}">
    <OriginalSpanVerifier><![CDATA[${targetTx.verbatimOriginal}]]></OriginalSpanVerifier>
    <ReplacementSpan>
      <!-- Revised prose resolving the ticket and satisfying Round ${attempt} feedback -->
    </ReplacementSpan>
  </PatchOperation>
</ManuscriptPatchTransaction>`;
                    rawPatchOutput = await ctx.callAI(
                        userPrompt,
                        sysPrompt,
                        false,
                        `Editorial Harness Single Tx (${targetTx.transactionId} - R${attempt}/${maxAttempts})`,
                        'Polish'
                    );
                } catch (llmErr) {
                    console.warn(
                        `[executeSingleHarnessTransaction] LLM fallback for ${targetTx.transactionId} round ${attempt}:`,
                        llmErr
                    );
                }
            }

            const patchRes = applyManuscriptPatchToScene(
                sceneItem,
                targetTx,
                rawPatchOutput,
                workingStory as unknown as EditorialStoryInput,
                attempt,
                attemptHistory[attemptHistory.length - 1]?.feedback
            );
            lastPatchRes = patchRes;

            const gateSuite = await runFourGateVerificationSuite({
                sceneItem,
                patchedResult: patchRes,
                transaction: targetTx,
                baselineTelemetry: preTelemetry,
                nsg: harness.nsg as NarrativeStateGraph | undefined,
                constitution: harness.constitution as AestheticConstitution | undefined,
                voiceDna: harness.voiceDna as AuthorVoiceDNA | undefined,
                story: workingStory as unknown as EditorialStoryInput,
                slopConfig,
                callAIFn: editorialUseDeepLLM ? ctx.callAI : null,
                useLLM: editorialUseDeepLLM
            });
            lastGateSuite = gateSuite;

            if (
                gateSuite.allPassed &&
                asString(patchRes.updatedFullProse).trim() !== beforeProse.trim()
            ) {
                const sKey = sceneItem.proseKey;
                const proseMap = asRecord(workingStory.prose);
                proseMap[sKey] = {
                    ...asRecord(proseMap[sKey]),
                    final: patchRes.updatedFullProse,
                    draft: patchRes.updatedFullProse,
                    editorial_harness_patched: true,
                    last_patch_tx: targetTx.transactionId
                };
                workingStory.prose = proseMap;
                targetTx.status = 'COMMITTED';
                targetTx.attempts_used = attempt;
                targetTx.attemptHistory = attemptHistory;
                targetTx.proseKey = sceneItem.proseKey;
                targetTx.beforeProse = beforeProse;
                targetTx.afterProse = patchRes.updatedFullProse;
                targetTx.beforeSpan = patchRes.beforeSpan;
                targetTx.afterSpan = patchRes.afterSpan;
                targetTx.gateResults = gateSuite.gates;

                const updatedTelemetry = runFullManuscriptNlpTelemetry(
                    workingStory as unknown as EditorialStoryInput,
                    bannedPhrases,
                    slopConfig
                );
                harness.fullTelemetry = updatedTelemetry;
                harness.nsg = compileNarrativeStateGraph(
                    workingStory as unknown as EditorialStoryInput,
                    updatedTelemetry
                );
                const summaryRec = asRecord(harness.summary);
                summaryRec.committedTransactions =
                    Number(summaryRec.committedTransactions || 0) + 1;
                harness.summary = summaryRec;

                ctx.showToast(
                    `Transaction ${transactionId} PASSED all 4 CI/CD gates on round ${attempt}/${maxAttempts}!`,
                    'success'
                );
                break;
            } else {
                const feedback = compileGateFailureFeedback(gateSuite, patchRes, attempt);
                attemptHistory.push({
                    attempt,
                    proposedSpan: patchRes.afterSpan,
                    failedGates: (gateSuite.gates || [])
                        .filter((g) => !g.passed)
                        .map((g) => g.gate),
                    feedback,
                    gateResults: gateSuite.gates
                });
                attempt++;
            }
        }

        if (targetTx.status !== 'COMMITTED') {
            targetTx.status =
                asString(lastPatchRes?.updatedFullProse || beforeProse).trim() === beforeProse.trim()
                    ? 'NO_OP_CLEAN'
                    : 'ROLLED_BACK';
            targetTx.attempts_used = maxAttempts;
            targetTx.attemptHistory = attemptHistory;
            targetTx.proseKey = sceneItem.proseKey;
            targetTx.beforeProse = beforeProse;
            targetTx.afterProse = beforeProse;
            targetTx.beforeSpan = lastPatchRes?.beforeSpan || targetTx.verbatimOriginal;
            targetTx.afterSpan = lastPatchRes?.afterSpan || targetTx.verbatimOriginal;
            targetTx.gateResults = lastGateSuite ? lastGateSuite.gates : [];
            const lastReason =
                attemptHistory[attemptHistory.length - 1]?.feedback?.diagnostic ||
                'Verification gates failed';
            ctx.showToast(
                `Transaction ${transactionId} was rolled back after 3 feedback rounds (${lastReason}).`,
                'warning'
            );
        }

        const finalTxStory = ctx.setStory((prev) => {
            const sKey = sceneItem.proseKey;
            const prevProseMap = asRecord(prev.prose);
            const nextProse = { ...prevProseMap };
            const workingProseMap = asRecord(workingStory.prose);
            if (targetTx.status === 'COMMITTED' && sKey && workingProseMap[sKey]) {
                nextProse[sKey] = {
                    ...asRecord(prevProseMap[sKey]),
                    ...asRecord(workingProseMap[sKey])
                };
            }
            return {
                ...prev,
                prose: nextProse,
                editorial_harness: harness
            };
        });
        const savedId = asString(finalTxStory?.id);
        if (savedId) {
            await storyStore.saveStory(savedId, finalTxStory);
        }
    } catch (err) {
        console.error('[executeSingleHarnessTransaction] Error:', err);
        ctx.showToast(`Failed to execute transaction: ${extractErrorMessage(err)}`, 'error');
    } finally {
        ctx.setIsRunningEditorialHarness?.(false);
        ctx.setEditorialHarnessPhase?.('');
    }
}

/** Reverts a single committed Editorial Harness transaction surgically (or via scene snapshot). */
export async function revertHarnessTransaction(
    ctx: PipelineRuntimeContext,
    transactionId: string
): Promise<void> {
    const story = ctx.getStory();
    if (!asOptionalRecord(story.editorial_harness)?.editPlan) return;

    const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
    const harness = asRecord(workingStory.editorial_harness);
    const editPlan = harness.editPlan as CompiledThreeWaveEditPlan;

    let targetTx: ExtendedEditPlanTransaction | null = null;
    for (const w of editPlan?.waves || []) {
        const found = (w.transactions || []).find(
            (t) =>
                ((t as ExtendedEditPlanTransaction).transactionId ||
                    (t as ExtendedEditPlanTransaction).transaction_id) === transactionId
        ) as ExtendedEditPlanTransaction | undefined;
        if (found) {
            targetTx = found;
            break;
        }
    }
    if (!targetTx) {
        ctx.showToast('Transaction not found.', 'warning');
        return;
    }

    const sKey = targetTx.proseKey || targetTx.sceneKey;
    const proseMap = asRecord(workingStory.prose);
    if (!sKey || !proseMap[sKey]) {
        ctx.showToast('Target scene prose not found.', 'warning');
        return;
    }

    const currentEntry = proseMap[sKey];
    const entryRec = asOptionalRecord(currentEntry);
    const currentProse =
        typeof currentEntry === 'string'
            ? currentEntry
            : asString(entryRec?.final || entryRec?.draft || entryRec?.prose);

    let revertedProse: string | null = null;
    let revertedVia: 'surgical' | 'full_snapshot' = 'full_snapshot';

    if (targetTx.afterSpan && targetTx.beforeSpan && currentProse) {
        const match = locateNeedle(currentProse, targetTx.afterSpan, true);
        if (match) {
            const pre = currentProse.slice(0, match.start);
            const post = currentProse.slice(match.end);
            revertedProse = pre + targetTx.beforeSpan + post;
            revertedVia = 'surgical';
        }
    }

    if (!revertedProse && targetTx.beforeProse) {
        revertedProse = targetTx.beforeProse;
        revertedVia = 'full_snapshot';
    }

    if (!revertedProse) {
        ctx.showToast('No pre-transaction prose snapshot available to revert.', 'warning');
        return;
    }

    proseMap[sKey] = {
        ...asRecord(currentEntry),
        final: revertedProse,
        draft: revertedProse
    };
    workingStory.prose = proseMap;
    targetTx.status = 'REVERTED';

    const bannedPhrases = ctx.getBannedPhrases();
    const slopConfig = ctx.getSlopConfig();
    const updatedTelemetry = runFullManuscriptNlpTelemetry(
        workingStory as unknown as EditorialStoryInput,
        bannedPhrases,
        slopConfig
    );
    harness.fullTelemetry = updatedTelemetry;
    harness.nsg = compileNarrativeStateGraph(
        workingStory as unknown as EditorialStoryInput,
        updatedTelemetry
    );

    ctx.setStory(workingStory);
    const savedId = asString(workingStory.id);
    if (savedId) {
        await storyStore.saveStory(savedId, workingStory);
    }
    ctx.showToast(
        revertedVia === 'surgical'
            ? `Surgically reverted transaction ${transactionId} (preserved other scene edits).`
            : `Reverted transaction ${transactionId} and restored scene snapshot.`,
        'info'
    );
}

/** Restores all manuscript prose to the pre-harness snapshot and marks committed transactions reverted. */
export async function revertAllHarnessTransactions(
    ctx: PipelineRuntimeContext
): Promise<void> {
    const story = ctx.getStory();
    const snapshot = asOptionalRecord(story.editorial_harness)?.preRunProseSnapshot;
    if (!snapshot) {
        ctx.showToast('No pre-run manuscript snapshot found to restore.', 'warning');
        return;
    }

    const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
    workingStory.prose = JSON.parse(JSON.stringify(snapshot));
    const harness = asRecord(workingStory.editorial_harness);
    const editPlan = harness.editPlan as CompiledThreeWaveEditPlan | undefined;
    if (editPlan?.waves) {
        editPlan.waves.forEach((w) => {
            (w.transactions || []).forEach((tx) => {
                if (tx.status === 'COMMITTED') tx.status = 'REVERTED';
            });
        });
    }

    const bannedPhrases = ctx.getBannedPhrases();
    const slopConfig = ctx.getSlopConfig();
    const updatedTelemetry = runFullManuscriptNlpTelemetry(
        workingStory as unknown as EditorialStoryInput,
        bannedPhrases,
        slopConfig
    );
    harness.fullTelemetry = updatedTelemetry;
    harness.nsg = compileNarrativeStateGraph(
        workingStory as unknown as EditorialStoryInput,
        updatedTelemetry
    );

    ctx.setStory(workingStory);
    const savedId = asString(workingStory.id);
    if (savedId) {
        await storyStore.saveStory(savedId, workingStory);
    }
    ctx.showToast('Restored full manuscript prose to pre-harness snapshot.', 'info');
}
