/**
 * @module pipeline/editorialHarness
 * Autonomous Editorial Harness & Literary CI/CD Orchestrator (Tier 6.0):
 * Runs Phases 1-3 (Voice DNA, NSG, NLP Telemetry, Layer 0 Blind Reader, 11-Tool Investigation,
 * Adversarial Tribunal, 3-Wave Edit Plan compilation) and Phases 4-5 (3-Wave Surgical Execution
 * & 4-Gate CI/CD verification), plus single-transaction execution and surgical/full rollback.
 */

import { RETRY_LIMITS } from '@/config';
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
    type DraftedStorySceneItem,
    type EditPlanTransaction,
    type EditorialStoryInput,
    type FullManuscriptTelemetryReport,
    type InvestigationDossier,
    type Layer0EvaluationReport,
    type ManuscriptPatchResult,
    type NarrativeStateGraph,
    type SceneTelemetryReport,
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
import { markRestorePoint } from './restorePoint';

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
    /** Edits skipped because their target text changed before they ran. */
    skippedTransactions: number;
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
    /** Why the last run did not commit this edit (stale span, conflict, failed gates). */
    skipReason?: string;
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
    /** Scenes with harness edits that "Revert all" still has to undo. */
    touchedProseKeys: string[];
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

/** Feedback rounds an edit gets before it is rolled back. */
export const HARNESS_MAX_ATTEMPTS = RETRY_LIMITS.editorialHarnessMaxAttempts;

export type HarnessTransactionStatus =
    | 'COMMITTED'
    | 'ROLLED_BACK'
    | 'NO_OP_CLEAN'
    | 'SKIPPED_STALE'
    | 'SKIPPED_CONFLICT';

/** Wraps text in CDATA, splitting any "]]>" inside it so prose can never close the section early. */
function cdata(text: unknown): string {
    return `<![CDATA[${String(text ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Builds the editor prompt for one round of one transaction. Shared by full runs and single runs. */
export function buildEditorPatchPrompt({
    tx,
    sceneItem,
    voiceXml,
    constitutionXml,
    attempt,
    maxAttempts = HARNESS_MAX_ATTEMPTS,
    attemptHistory
}: {
    tx: ExtendedEditPlanTransaction;
    sceneItem: DraftedStorySceneItem;
    voiceXml: string;
    constitutionXml: string;
    attempt: number;
    maxAttempts?: number;
    attemptHistory: HarnessAttemptHistoryEntry[];
}): string {
    const startParaId = String(tx.startAnchor || '').split(':s')[0];
    const pList = sceneItem.normalized?.paragraphs || [];
    const pIdx = pList.findIndex((p) => p.id === startParaId);
    const prevParaText = pIdx > 0 ? pList[pIdx - 1]?.text || '' : '';
    const nextParaText = pIdx >= 0 && pIdx < pList.length - 1 ? pList[pIdx + 1]?.text || '' : '';

    let feedbackXml = '';
    if (attemptHistory.length > 0) {
        feedbackXml =
            `<FeedbackFromPriorRounds current_round="${attempt}" max_rounds="${maxAttempts}">\n` +
            attemptHistory
                .map(
                    (h) =>
                        `  <PriorAttempt round="${h.attempt}">\n    <RejectedSpan>${cdata(h.proposedSpan || '')}</RejectedSpan>\n    <FailureDiagnostic>${escapeHarnessXml(h.feedback?.diagnostic || '')}</FailureDiagnostic>\n    <RequiredCorrectionDirective>${escapeHarnessXml(h.feedback?.correction || '')}</RequiredCorrectionDirective>\n  </PriorAttempt>`
                )
                .join('\n') +
            `\n  <Round${attempt}Directive>Do NOT repeat or closely paraphrase any rejected replacement above. You MUST take a fundamentally fresh craft approach that satisfies the RequiredCorrectionDirective while strictly preserving <AuthorVoiceDNA>.</Round${attempt}Directive>\n</FeedbackFromPriorRounds>`;
    }

    return `${voiceXml}\n${constitutionXml}\n<TargetScene id="${tx.sceneId}">
  <PrecedingContext>${cdata(prevParaText)}</PrecedingContext>
  <AtomicEditTransaction id="${tx.transactionId}" wave="${tx.wave}" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <Problem>${escapeHarnessXml(tx.combinedProblem)}</Problem>
    <SurgicalDirective>${escapeHarnessXml(tx.combinedDirective)}</SurgicalDirective>
    <OriginalSpanVerifier>${cdata(tx.verbatimOriginal)}</OriginalSpanVerifier>
  </AtomicEditTransaction>
  <FollowingContext>${cdata(nextParaText)}</FollowingContext>
</TargetScene>
${feedbackXml ? `${feedbackXml}\n` : ''}Emit a <ManuscriptPatchTransaction transaction_id="${tx.transactionId}" target_scene="${tx.sceneId}">
  <PatchOperation type="REPLACE_SPAN" start_anchor="${tx.startAnchor}" end_anchor="${tx.endAnchor}">
    <OriginalSpanVerifier>${cdata(tx.verbatimOriginal)}</OriginalSpanVerifier>
    <ReplacementSpan>
      <!-- Fresh revised prose resolving the ticket and satisfying Round ${attempt} feedback -->
    </ReplacementSpan>
  </PatchOperation>
</ManuscriptPatchTransaction>`;
}

export interface HarnessTransactionOutcome {
    status: HarnessTransactionStatus;
    attemptsUsed: number;
    attemptHistory: HarnessAttemptHistoryEntry[];
    beforeProse: string;
    /** The patched scene prose when committed; otherwise the unchanged prose. */
    afterProse: string;
    beforeSpan: string;
    afterSpan: string;
    gateResults: VerificationGateReport[];
    postTelemetry?: SceneTelemetryReport;
    /** Why the edit did not commit, in one line. Empty when committed. */
    reason: string;
}

/**
 * Runs one transaction through edit -> 4 gates -> feedback, up to HARNESS_MAX_ATTEMPTS rounds.
 * Pure with respect to the story: it never writes prose, it only reports what should happen.
 */
export async function runHarnessTransaction({
    tx,
    wave,
    sceneItem,
    story,
    voiceDna,
    constitution,
    nsg,
    callAI,
    useLLM,
    bannedPhrases,
    slopConfig,
    label
}: {
    tx: ExtendedEditPlanTransaction;
    wave: { waveId?: unknown; waveKey?: unknown; name?: unknown };
    sceneItem: DraftedStorySceneItem;
    story: EditorialStoryInput;
    voiceDna?: AuthorVoiceDNA | null;
    constitution?: AestheticConstitution | null;
    nsg?: NarrativeStateGraph | null;
    callAI: PipelineRuntimeContext['callAI'] | null;
    useLLM: boolean;
    bannedPhrases: string[];
    slopConfig: ReturnType<PipelineRuntimeContext['getSlopConfig']>;
    label: string;
}): Promise<HarnessTransactionOutcome> {
    const beforeProse = sceneItem.proseText;
    const preTelemetry = runSceneNlpTelemetry(sceneItem, story, bannedPhrases, slopConfig);
    const canCallLLM = useLLM && typeof callAI === 'function';
    const attemptHistory: HarnessAttemptHistoryEntry[] = [];
    let lastPatchRes: ManuscriptPatchResult | null = null;
    let lastGates: VerificationGateReport[] = [];

    for (let attempt = 1; attempt <= HARNESS_MAX_ATTEMPTS; attempt++) {
        let rawPatchOutput: string | null = null;
        if (canCallLLM) {
            try {
                rawPatchOutput = await callAI(
                    buildEditorPatchPrompt({
                        tx,
                        sceneItem,
                        voiceXml: asString(voiceDna?.xml),
                        constitutionXml: asString(constitution?.xml),
                        attempt,
                        attemptHistory
                    }),
                    resolveWaveAgentPrompt(wave, tx),
                    false,
                    `${label} (${tx.transactionId} - R${attempt}/${HARNESS_MAX_ATTEMPTS})`,
                    'Polish'
                );
            } catch (llmErr) {
                // The model is unreachable: fall back to the offline repair for this round.
                console.warn(
                    `[EditorialHarness] Editor call failed for ${tx.transactionId} round ${attempt}; using the offline repair:`,
                    llmErr
                );
            }
        }

        const patchRes = applyManuscriptPatchToScene(
            sceneItem,
            tx,
            rawPatchOutput,
            story,
            attempt,
            attemptHistory[attemptHistory.length - 1]?.feedback
        );
        lastPatchRes = patchRes;

        if (patchRes.stale) {
            // The text this edit was planned against is gone. Another round cannot fix that, and
            // the old behaviour (overwrite the whole paragraph) destroyed text nobody reviewed.
            return {
                status: 'SKIPPED_STALE',
                attemptsUsed: attempt,
                attemptHistory,
                beforeProse,
                afterProse: beforeProse,
                beforeSpan: tx.verbatimOriginal,
                afterSpan: tx.verbatimOriginal,
                gateResults: [],
                reason: patchRes.error || 'Target span changed since the plan was compiled.'
            };
        }

        const gateSuite = await runFourGateVerificationSuite({
            sceneItem,
            patchedResult: patchRes,
            transaction: tx,
            baselineTelemetry: preTelemetry,
            nsg,
            constitution,
            voiceDna,
            story,
            slopConfig,
            callAIFn: canCallLLM ? callAI : null,
            useLLM
        });
        lastGates = gateSuite.gates;

        if (gateSuite.allPassed && asString(patchRes.updatedFullProse).trim() !== beforeProse.trim()) {
            return {
                status: 'COMMITTED',
                attemptsUsed: attempt,
                attemptHistory,
                beforeProse,
                afterProse: asString(patchRes.updatedFullProse),
                beforeSpan: asString(patchRes.beforeSpan),
                afterSpan: asString(patchRes.afterSpan),
                gateResults: gateSuite.gates,
                postTelemetry: gateSuite.postTelemetry,
                reason: ''
            };
        }

        const feedback = compileGateFailureFeedback(gateSuite, patchRes, attempt);
        attemptHistory.push({
            attempt,
            proposedSpan: patchRes.afterSpan,
            failedGates: gateSuite.gates.filter((g) => !g.passed).map((g) => g.gate),
            feedback,
            gateResults: gateSuite.gates
        });

        // Without a model, every round of the offline repair is the same edit, so once the
        // gates reject it twice with nothing new to try there is no point in a third round.
        const sameAsLastRound =
            !canCallLLM &&
            attemptHistory.length >= 2 &&
            attemptHistory[attemptHistory.length - 1].proposedSpan ===
                attemptHistory[attemptHistory.length - 2].proposedSpan;
        if (sameAsLastRound) break;
    }

    const candidateFull = lastPatchRes?.updatedFullProse || beforeProse;
    return {
        status: candidateFull.trim() === beforeProse.trim() ? 'NO_OP_CLEAN' : 'ROLLED_BACK',
        attemptsUsed: attemptHistory.length,
        attemptHistory,
        beforeProse,
        afterProse: beforeProse,
        beforeSpan: lastPatchRes?.beforeSpan || tx.verbatimOriginal,
        afterSpan: lastPatchRes?.afterSpan || tx.verbatimOriginal,
        gateResults: lastGates,
        reason:
            attemptHistory[attemptHistory.length - 1]?.feedback?.diagnostic ||
            'Failed verification gates'
    };
}

/** Copies an outcome onto the stored transaction so the Editorial view can show it. */
function recordOutcome(
    tx: ExtendedEditPlanTransaction,
    outcome: HarnessTransactionOutcome,
    proseKey: string
): void {
    tx.status = outcome.status;
    tx.attempts_used = outcome.attemptsUsed;
    tx.attemptHistory = outcome.attemptHistory;
    tx.proseKey = proseKey;
    tx.beforeProse = outcome.beforeProse;
    tx.afterProse = outcome.afterProse;
    tx.beforeSpan = outcome.beforeSpan;
    tx.afterSpan = outcome.afterSpan;
    tx.gateResults = outcome.gateResults;
    if (outcome.reason) tx.skipReason = outcome.reason;
    else delete tx.skipReason;
}

/** Reads the text of a prose entry, whether it is stored as a string or as { final, draft }. */
function proseEntryText(entry: unknown): string {
    if (typeof entry === 'string') return entry;
    const rec = asOptionalRecord(entry);
    return asString(rec?.final || rec?.draft || rec?.prose);
}

/** Writes patched prose into a prose map, keeping the entry's other fields. */
function writePatchedProse(
    proseMap: Record<string, unknown>,
    proseKey: string,
    text: string,
    transactionId: string
): void {
    proseMap[proseKey] = {
        ...asRecord(proseMap[proseKey]),
        final: text,
        draft: text,
        editorial_harness_patched: true,
        last_patch_tx: transactionId
    };
}

/** Finds a transaction in a plan by id (either spelling of the id field). */
function findPlanTransaction(
    editPlan: CompiledThreeWaveEditPlan | undefined,
    transactionId: string
): { tx: ExtendedEditPlanTransaction; wave: CompiledThreeWaveEditPlan['waves'][number] } | null {
    for (const w of editPlan?.waves || []) {
        const found = (w.transactions || []).find(
            (t) =>
                ((t as ExtendedEditPlanTransaction).transactionId ||
                    (t as ExtendedEditPlanTransaction).transaction_id) === transactionId
        ) as ExtendedEditPlanTransaction | undefined;
        if (found) return { tx: found, wave: w };
    }
    return null;
}

/**
 * The snapshot "Revert all" restores. A scene keeps its old entry only while harness edits from an
 * earlier run are still live in it; every other scene is snapshotted as it is now. Before, the
 * first run's snapshot was kept forever, so "Revert all" could restore a months-old version of a
 * scene the author had rewritten by hand, and scenes written later had no entry at all.
 */
export function buildPreRunProseSnapshot(
    existingSnapshot: unknown,
    touchedProseKeys: readonly string[],
    currentProse: unknown
): Record<string, unknown> {
    const previous = asRecord(existingSnapshot);
    const snapshot = JSON.parse(JSON.stringify(currentProse || {})) as Record<string, unknown>;
    for (const key of touchedProseKeys) {
        if (key in previous) snapshot[key] = previous[key];
    }
    return snapshot;
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

    await markRestorePoint(ctx, 'Before the editorial pass', baseStory);
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

        const previouslyTouched = Array.isArray(workingHarness.touchedProseKeys)
            ? (workingHarness.touchedProseKeys as string[])
            : [];
        const preRunProseSnapshot = buildPreRunProseSnapshot(
            workingHarness.preRunProseSnapshot,
            previouslyTouched,
            workingStory.prose
        );
        // Prose as it was when this run started. Commits are merged back only into scenes that
        // still match it, so an author's edit made while the harness ran is never overwritten.
        const runStartProse = JSON.parse(JSON.stringify(baseStory.prose || {})) as Record<
            string,
            unknown
        >;
        // Which scenes this run changed, and which transactions did it.
        const committedThisRun = new Map<string, ExtendedEditPlanTransaction[]>();

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

                    const outcome = await runHarnessTransaction({
                        tx,
                        wave,
                        sceneItem,
                        story: workingStory as unknown as EditorialStoryInput,
                        voiceDna,
                        constitution,
                        nsg,
                        callAI: callAIIfEnabled,
                        useLLM,
                        bannedPhrases,
                        slopConfig,
                        label: `Editorial Harness ${wave.name || wave.waveId}`
                    });
                    recordOutcome(tx, outcome, sceneItem.proseKey);

                    if (outcome.status === 'COMMITTED') {
                        const workingProseMap = asRecord(workingStory.prose);
                        writePatchedProse(
                            workingProseMap,
                            sceneItem.proseKey,
                            outcome.afterProse,
                            tx.transactionId
                        );
                        workingStory.prose = workingProseMap;
                        committedThisRun.set(sceneItem.proseKey, [
                            ...(committedThisRun.get(sceneItem.proseKey) || []),
                            tx
                        ]);
                        if (fullTelemetry && outcome.postTelemetry) {
                            fullTelemetry.sceneTelemetryMap[sceneItem.sceneId] =
                                outcome.postTelemetry;
                        }
                        appendHarnessLog(
                            `${wave.waveId} CI/CD`,
                            `COMMITTED [${tx.transactionId}] (${wave.specialistAgent}) on ${tx.sceneId}: All 4 Literary CI/CD Gates PASSED on round ${outcome.attemptsUsed}/${HARNESS_MAX_ATTEMPTS}${outcome.attemptsUsed > 1 ? ' (Feedback loop resolved prior failures)' : ''}.`,
                            'success'
                        );
                    } else if (outcome.status === 'SKIPPED_STALE') {
                        appendHarnessLog(
                            `${wave.waveId} CI/CD`,
                            `SKIPPED [${tx.transactionId}] on ${tx.sceneId}: ${outcome.reason} Run the review again to plan against the current text.`,
                            'warning'
                        );
                    } else {
                        outcome.attemptHistory.forEach((h) =>
                            appendHarnessLog(
                                `${wave.waveId} CI/CD`,
                                `Round ${h.attempt}/${HARNESS_MAX_ATTEMPTS} REJECTED for [${tx.transactionId}] (${h.feedback.diagnostic}).`,
                                'warning'
                            )
                        );
                        if (outcome.status === 'ROLLED_BACK') {
                            appendHarnessLog(
                                `${wave.waveId} CI/CD`,
                                `ROLLED BACK [${tx.transactionId}] on ${tx.sceneId}: Worktree discarded after ${outcome.attemptsUsed} feedback round(s) (${outcome.reason}) to protect manuscript integrity.`,
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

        // If the author opened another story while this ran, the results belong to the story the
        // run started on, not the one now open.
        const runStoryId = asString(baseStory.id);
        const liveStory = ctx.getStory();
        const switchedStory = Boolean(runStoryId) && asString(liveStory?.id) !== runStoryId;
        // A scene the author edited while the harness was running keeps the author's text. Its
        // edits are marked as conflicts instead of being counted as committed and then dropped.
        const liveProse = asRecord(switchedStory ? baseStory.prose : liveStory.prose);
        const conflictedKeys = new Set<string>();
        committedThisRun.forEach((txs, key) => {
            if (proseEntryText(liveProse[key]) === proseEntryText(runStartProse[key])) return;
            conflictedKeys.add(key);
            txs.forEach((tx) => {
                tx.status = 'SKIPPED_CONFLICT';
                tx.afterProse = tx.beforeProse;
                tx.skipReason = 'The scene was edited while the harness ran; your edit was kept.';
                appendHarnessLog(
                    'Merge',
                    `SKIPPED [${tx.transactionId}] on ${tx.sceneId}: the scene changed while the harness ran, so your version was kept.`,
                    'warning'
                );
            });
        });
        const mergedKeys = Array.from(committedThisRun.keys()).filter((k) => !conflictedKeys.has(k));

        const planTxs = (editPlan?.waves || []).flatMap(
            (w) => (w.transactions || []) as ExtendedEditPlanTransaction[]
        );
        const countStatus = (...statuses: string[]): number =>
            planTxs.filter((tx) => statuses.includes(String(tx.status))).length;
        const touchedProseKeys = Array.from(new Set([...previouslyTouched, ...mergedKeys]));

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
            touchedProseKeys,
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
                // Counted from the plan, so "Execute plan" after a review reports the whole plan
                // rather than only what this click changed.
                committedTransactions: countStatus('COMMITTED'),
                rolledBackTransactions: countStatus('ROLLED_BACK'),
                skippedTransactions: countStatus('SKIPPED_STALE', 'SKIPPED_CONFLICT')
            },
            logs: runLogs.slice(-100)
        };
        const committedNow = Array.from(committedThisRun.entries())
            .filter(([key]) => !conflictedKeys.has(key))
            .reduce((n, [, txs]) => n + txs.length, 0);

        const mergeInto = (prev: PipelineStory): PipelineStory => {
            const prevProseMap = asRecord(prev.prose);
            const mergedProse: Record<string, unknown> = { ...prevProseMap };
            const workingProseMap = asRecord(workingStory.prose);
            mergedKeys.forEach((sKey) => {
                // Same guard as above, re-checked against the state the update actually sees.
                if (proseEntryText(prevProseMap[sKey]) !== proseEntryText(runStartProse[sKey])) return;
                mergedProse[sKey] = {
                    ...asRecord(prevProseMap[sKey]),
                    ...asRecord(workingProseMap[sKey])
                };
            });
            return {
                ...prev,
                prose: mergedProse,
                editorial_harness: harnessState
            };
        };
        const finalHarnessStory = switchedStory
            ? mergeInto(baseStory)
            : ctx.setStory((prev) =>
                  runStoryId && asString(prev?.id) !== runStoryId ? prev : mergeInto(prev)
              );
        const savedId = asString(finalHarnessStory?.id);
        if (savedId) {
            await storyStore.saveStory(savedId, finalHarnessStory);
        }

        ctx.setEditorialHarnessProgress?.(100);
        ctx.setEditorialHarnessPhase?.('Complete: 5-Phase Autonomous Editorial Harness Finished.');

        const toastSummary =
            mode === 'review_only'
                ? `Editorial Review complete! ${harnessState.summary.verifiedTicketsCount} verified tickets queued across 3 waves.`
                : `Editorial Harness complete! ${committedNow} surgical revision(s) passed all 4 CI/CD gates.${harnessState.summary.skippedTransactions ? ` ${harnessState.summary.skippedTransactions} skipped because their text had changed.` : ''}`;
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

/**
 * Undoes one committed edit in `text`. Works when the scene is exactly as the edit left it, or when
 * the edit's replacement text appears exactly once (so other edits to the scene survive). Returns
 * null when neither holds: restoring the whole-scene snapshot then would silently throw away every
 * later change to the scene, which the old revert did.
 */
export function undoCommittedSpan(
    text: string,
    tx: Pick<ExtendedEditPlanTransaction, 'beforeProse' | 'afterProse' | 'beforeSpan' | 'afterSpan'>
): string | null {
    if (tx.afterProse && tx.beforeProse !== undefined && text.trim() === tx.afterProse.trim()) {
        return tx.beforeProse;
    }
    const after = tx.afterSpan || '';
    if (!after.trim() || tx.beforeSpan === undefined) return null;
    const match = locateNeedle(text, after, true);
    if (!match) return null;
    const again = locateNeedle(text.slice(match.end), after, true);
    if (again) return null; // ambiguous: the replacement text occurs more than once
    return text.slice(0, match.start) + tx.beforeSpan + text.slice(match.end);
}

/** Recomputes telemetry and the narrative graph after prose changed outside a full run. */
function refreshHarnessAnalysis(
    ctx: PipelineRuntimeContext,
    harness: Record<string, unknown>,
    workingStory: PipelineStory
): void {
    const updatedTelemetry = runFullManuscriptNlpTelemetry(
        workingStory as unknown as EditorialStoryInput,
        ctx.getBannedPhrases(),
        ctx.getSlopConfig()
    );
    harness.fullTelemetry = updatedTelemetry;
    harness.nsg = compileNarrativeStateGraph(
        workingStory as unknown as EditorialStoryInput,
        updatedTelemetry
    );
}

/** Recounts the plan's committed / rolled back / skipped totals into the stored summary. */
function recountSummary(harness: Record<string, unknown>): void {
    const plan = harness.editPlan as CompiledThreeWaveEditPlan | undefined;
    const txs = (plan?.waves || []).flatMap((w) => (w.transactions || []) as ExtendedEditPlanTransaction[]);
    const count = (...statuses: string[]): number =>
        txs.filter((tx) => statuses.includes(String(tx.status))).length;
    harness.summary = {
        ...asRecord(harness.summary),
        committedTransactions: count('COMMITTED'),
        rolledBackTransactions: count('ROLLED_BACK'),
        skippedTransactions: count('SKIPPED_STALE', 'SKIPPED_CONFLICT')
    };
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

    const useLLM = ctx.getEditorialUseDeepLLM?.() ?? true;

    try {
        const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
        const harness = asRecord(workingStory.editorial_harness);
        const editPlan = harness.editPlan as CompiledThreeWaveEditPlan;
        const found = findPlanTransaction(editPlan, transactionId);
        if (!found) {
            ctx.showToast(`Transaction ${transactionId} not found.`, 'warning');
            return;
        }
        const { tx: targetTx, wave: targetWave } = found;

        const findScene = (s: PipelineStory): DraftedStorySceneItem | undefined =>
            getDraftedStoryScenesList(s as unknown as EditorialStoryInput).find(
                (sc) => sc.sceneId === targetTx.sceneId || sc.proseKey === targetTx.proseKey
            );
        const liveScene = findScene(workingStory);
        if (!liveScene) {
            ctx.showToast(`Target scene ${targetTx.sceneId} has no drafted prose.`, 'warning');
            return;
        }
        const sKey = liveScene.proseKey;
        const liveText = liveScene.proseText;

        // "Re-Run Patch" on a committed edit tries again from the text before that edit. The old
        // code searched the already-edited scene for the original span, found nothing, and then
        // replaced the whole paragraph.
        const previousTx = targetTx.status === 'COMMITTED'
            ? (JSON.parse(JSON.stringify(targetTx)) as ExtendedEditPlanTransaction)
            : null;
        let evalStory = workingStory;
        let sceneItem = liveScene;
        if (previousTx) {
            const restored = undoCommittedSpan(liveText, targetTx);
            if (restored === null) {
                ctx.showToast(
                    `Transaction ${transactionId} can't be re-run: its scene has changed since the edit. Run the review again to plan against the current text.`,
                    'warning'
                );
                return;
            }
            evalStory = JSON.parse(JSON.stringify(workingStory)) as PipelineStory;
            const evalProse = asRecord(evalStory.prose);
            evalProse[sKey] = { ...asRecord(evalProse[sKey]), final: restored, draft: restored };
            evalStory.prose = evalProse;
            sceneItem = findScene(evalStory) || liveScene;
        }

        const outcome = await runHarnessTransaction({
            tx: targetTx,
            wave: targetWave,
            sceneItem,
            story: evalStory as unknown as EditorialStoryInput,
            voiceDna: harness.voiceDna as AuthorVoiceDNA | undefined,
            constitution: harness.constitution as AestheticConstitution | undefined,
            nsg: harness.nsg as NarrativeStateGraph | undefined,
            callAI: useLLM ? ctx.callAI : null,
            useLLM,
            bannedPhrases: ctx.getBannedPhrases(),
            slopConfig: ctx.getSlopConfig(),
            label: 'Editorial Harness Single Tx'
        });

        let proseChanged = false;
        if (outcome.status === 'COMMITTED') {
            recordOutcome(targetTx, outcome, sKey);
            const proseMap = asRecord(workingStory.prose);
            writePatchedProse(proseMap, sKey, outcome.afterProse, targetTx.transactionId);
            workingStory.prose = proseMap;
            proseChanged = true;

            const touched = Array.isArray(harness.touchedProseKeys)
                ? (harness.touchedProseKeys as string[])
                : [];
            if (!touched.includes(sKey)) {
                harness.preRunProseSnapshot = {
                    ...asRecord(harness.preRunProseSnapshot),
                    [sKey]: { ...asRecord(asRecord(story.prose)[sKey]), final: outcome.beforeProse, draft: outcome.beforeProse }
                };
                harness.touchedProseKeys = [...touched, sKey];
            }
            refreshHarnessAnalysis(ctx, harness, workingStory);
            ctx.showToast(
                `Transaction ${transactionId} PASSED all 4 CI/CD gates on round ${outcome.attemptsUsed}/${HARNESS_MAX_ATTEMPTS}!`,
                'success'
            );
        } else if (previousTx) {
            // The retry did not beat the gates; the edit that was already committed stays.
            Object.keys(targetTx).forEach((k) => delete (targetTx as Record<string, unknown>)[k]);
            Object.assign(targetTx, previousTx);
            ctx.showToast(
                `The re-run of ${transactionId} did not pass the gates (${outcome.reason}). The earlier committed edit was kept.`,
                'warning'
            );
        } else {
            recordOutcome(targetTx, outcome, sKey);
            ctx.showToast(
                outcome.status === 'SKIPPED_STALE'
                    ? `Transaction ${transactionId} was skipped: ${outcome.reason}`
                    : outcome.status === 'NO_OP_CLEAN'
                      ? `Transaction ${transactionId} produced no change.`
                      : `Transaction ${transactionId} was rolled back after ${outcome.attemptsUsed} feedback round(s) (${outcome.reason}).`,
                'warning'
            );
        }
        recountSummary(harness);

        const storyId = asString(story.id);
        let conflicted = false;
        const finalTxStory = ctx.setStory((prev) => {
            if (storyId && asString(prev?.id) !== storyId) return prev;
            const prevProseMap = asRecord(prev.prose);
            const nextProse = { ...prevProseMap };
            if (proseChanged) {
                if (proseEntryText(prevProseMap[sKey]) === liveText) {
                    nextProse[sKey] = {
                        ...asRecord(prevProseMap[sKey]),
                        ...asRecord(asRecord(workingStory.prose)[sKey])
                    };
                } else {
                    conflicted = true;
                }
            }
            return { ...prev, prose: nextProse, editorial_harness: harness };
        });
        if (conflicted) {
            ctx.showToast(
                `The scene changed while ${transactionId} ran, so your version was kept and the edit was not applied.`,
                'warning'
            );
        }
        const savedId = asString(finalTxStory?.id);
        if (savedId && savedId === storyId) {
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

/** Reverts a single committed Editorial Harness transaction, leaving the rest of the scene alone. */
export async function revertHarnessTransaction(
    ctx: PipelineRuntimeContext,
    transactionId: string
): Promise<void> {
    const story = ctx.getStory();
    if (!asOptionalRecord(story.editorial_harness)?.editPlan) return;

    const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
    const harness = asRecord(workingStory.editorial_harness);
    const found = findPlanTransaction(harness.editPlan as CompiledThreeWaveEditPlan, transactionId);
    if (!found) {
        ctx.showToast('Transaction not found.', 'warning');
        return;
    }
    const targetTx = found.tx;

    const sKey = targetTx.proseKey || targetTx.sceneKey;
    const proseMap = asRecord(workingStory.prose);
    if (!sKey || !proseMap[sKey]) {
        ctx.showToast('Target scene prose not found.', 'warning');
        return;
    }

    const currentEntry = proseMap[sKey];
    const revertedProse = undoCommittedSpan(proseEntryText(currentEntry), targetTx);
    if (revertedProse === null) {
        ctx.showToast(
            `Can't revert ${transactionId} safely: the scene has changed since the edit and its text can't be found exactly once. Your current text was left as it is.`,
            'warning'
        );
        return;
    }

    proseMap[sKey] = {
        ...asRecord(currentEntry),
        final: revertedProse,
        draft: revertedProse
    };
    workingStory.prose = proseMap;
    targetTx.status = 'REVERTED';
    recountSummary(harness);
    refreshHarnessAnalysis(ctx, harness, workingStory);

    ctx.setStory(workingStory);
    const savedId = asString(workingStory.id);
    if (savedId) {
        await storyStore.saveStory(savedId, workingStory);
    }
    ctx.showToast(`Reverted transaction ${transactionId}; the rest of the scene was kept.`, 'info');
}

/**
 * Restores every scene the harness edited to its pre-harness text and marks committed
 * transactions reverted. Scenes the harness never touched, including ones written after it ran,
 * are left alone; the old version replaced the whole prose map and deleted those.
 */
export async function revertAllHarnessTransactions(
    ctx: PipelineRuntimeContext
): Promise<void> {
    const story = ctx.getStory();
    const storedHarness = asOptionalRecord(story.editorial_harness);
    const snapshot = asOptionalRecord(storedHarness?.preRunProseSnapshot);
    if (!snapshot) {
        ctx.showToast('No pre-run manuscript snapshot found to restore.', 'warning');
        return;
    }

    const workingStory = JSON.parse(JSON.stringify(story)) as PipelineStory;
    const harness = asRecord(workingStory.editorial_harness);
    const editPlan = harness.editPlan as CompiledThreeWaveEditPlan | undefined;
    const planTxs = (editPlan?.waves || []).flatMap(
        (w) => (w.transactions || []) as ExtendedEditPlanTransaction[]
    );
    // Stories saved before touchedProseKeys existed also count scenes the plan edited (committed
    // or individually reverted since) and scenes whose prose carries the harness's patch flag.
    const touched = new Set<string>(
        Array.isArray(harness.touchedProseKeys) ? (harness.touchedProseKeys as string[]) : []
    );
    planTxs.forEach((tx) => {
        if ((tx.status === 'COMMITTED' || tx.status === 'REVERTED') && tx.proseKey) {
            touched.add(tx.proseKey);
        }
    });
    const proseMap = asRecord(workingStory.prose);
    Object.entries(proseMap).forEach(([key, entry]) => {
        if (asOptionalRecord(entry)?.editorial_harness_patched) touched.add(key);
    });

    let restored = 0;
    touched.forEach((key) => {
        if (!(key in snapshot)) return;
        proseMap[key] = JSON.parse(JSON.stringify(snapshot[key]));
        restored++;
    });
    workingStory.prose = proseMap;
    planTxs.forEach((tx) => {
        if (tx.status === 'COMMITTED') tx.status = 'REVERTED';
    });
    harness.touchedProseKeys = [];
    recountSummary(harness);
    refreshHarnessAnalysis(ctx, harness, workingStory);

    ctx.setStory(workingStory);
    const savedId = asString(workingStory.id);
    if (savedId) {
        await storyStore.saveStory(savedId, workingStory);
    }
    ctx.showToast(
        `Restored ${restored} scene(s) to their pre-harness text. Other scenes were left as they are.`,
        'info'
    );
}
