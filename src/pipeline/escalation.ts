/**
 * @module pipeline/escalation
 * Multi-tier agent execution, structural validation gate, RSI/surgical auto-repair,
 * 3-attempt escalation loop, and human-in-the-loop intervention handling.
 */

import { RETRY_LIMITS } from '@/config';
import {
    cleanCharacterNameFromVoiceProfile,
    isAudioDramaScriptText,
    isValidQwenVoiceProfile,
    synthesizeQwenVoiceDesignProfile,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import {
    applyCascadingNameReplacements as domainApplyCascadingNameReplacements,
    auditEntityNamesAndPlaces as domainAuditEntityNamesAndPlaces
} from '@/domain/slop';
import {
    ensureActOutputCompleteness,
    ensureSequenceOutputCompleteness,
    ensureStoryArcOutputCompleteness,
    extractReviewStatus,
    findFlatValueShiftScenes,
    parseIssuesFromReview,
    parseWritingOutput,
    surgicallyRepairValueShifts,
    validateStructuralOutput,
    type CompletenessContext,
    type DefectiveValueShiftEntry,
    type StructuralRepairCallAIFn,
    type ValidationContext
} from '@/domain/validation';
import { AUDIO_DRAMA_SYNTAX_CONTRACT_CARD, PROMPTS, stripNarrativeLensSchemaLine } from '@/prompts';
import type { CastMember, Story } from '@/types';
import {
    decodeXmlEntities,
    extractReasoningAndContent,
    extractTag,
    extractTagList
} from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    asStringArray,
    extractErrorMessage,
    type PipelineRuntimeContext
} from './context';
import {
    checkAndExecuteRSI,
    computeSpawnedCharacterVoiceSeed,
    repairBannedEntitiesWithAI
} from './continuityPipeline';
import { ensureNameBanks } from './nameBank';
import { triggerLoreExtraction } from './lorePipeline';
import { applySurgicalEditsWithRetry } from './surgicalPatch';

export interface EscalationCharacterBrief {
    id?: string;
    name?: string;
    role?: string;
    core_flaw?: string;
    core_desire?: string;
    vocal_cadence?: string;
}

export interface EscalationParams<TParsed = Record<string, unknown>> {
    tierName: string;
    generatorPromptFn: () => string;
    systemPrompt: string;
    reviewerSystemPrompt?: string | null;
    reviewerPromptFn?: ((genOutput: string) => string) | null;
    parserFn?: (raw: string) => TParsed;
    validateFn?: (data: TParsed) => { valid: boolean; errors?: string[] };
    /**
     * Optional extra gate, run after structural validation passes. Returned strings are fed
     * back as revision reasons and the tier is regenerated, like a structural failure.
     * The final attempt is never blocked, so a stubborn gate cannot stall the pipeline.
     */
    gateFn?: ((genOutput: string, parsedData: TParsed) => Promise<string[]> | string[]) | null;
    modelSize?: string;
    spawningContext?: string;
    parentTierFailFn?: ((reasons: string[]) => void) | null;
    activeActNum?: number;
    activeChapNum?: number;
    activeSceneNum?: number;
    isAutopilot?: boolean;
    context?: Record<string, unknown> | null;
    chunkContext?: string;
    initialGenOutput?: string;
}

export interface EscalationResult<TParsed = Record<string, unknown>> {
    genOutput: string;
    parsedData: TParsed;
    spawnedBriefs: EscalationCharacterBrief[];
    failed?: boolean;
    critique?: string;
}

interface EscalationHistoryEntry {
    attempt: number;
    reasons: string[];
    critique: string;
}

/**
 * Executes an AI pipeline agent with structural validation, surgical auto-repair,
 * up to 3 escalation attempts, and optional interactive InterventionModal fallback.
 */
export async function runAgentWithEscalation<TParsed = Record<string, unknown>>(
    ctx: PipelineRuntimeContext,
    params: EscalationParams<TParsed>
): Promise<EscalationResult<TParsed>> {
    const {
        tierName,
        generatorPromptFn,
        systemPrompt,
        reviewerSystemPrompt = null,
        reviewerPromptFn = null,
        parserFn = (raw: string) => ({ raw, genOutput: raw }) as unknown as TParsed,
        modelSize = 'dev',
        spawningContext = '',
        parentTierFailFn = null,
        activeActNum = 1,
        activeChapNum = 0,
        activeSceneNum = 1,
        isAutopilot = false,
        context = null,
        chunkContext = '',
        initialGenOutput = '',
        gateFn = null
    } = params;

    let attempt = 1;
    let rsiAttemptsCount = 0;
    let isRsiRedo = false;
    const currentModelSize = tierName === 'Writing Agent' ? 'prose' : modelSize;
    let deviationReasons: string[] = [];
    let lastCritique = '';
    let lastGenOutput = '';
    let lastParsedData: TParsed | null = null;
    const spawnedBriefs: EscalationCharacterBrief[] = [];
    const escalationHistory: EscalationHistoryEntry[] = [];

    await ensureNameBanks(ctx);
    const auditFn = ctx.auditEntityNamesAndPlaces || domainAuditEntityNamesAndPlaces;
    const cascadeFn = ctx.applyCascadingNameReplacements || domainApplyCascadingNameReplacements;

    const spawnNewCharacters = async (briefs: EscalationCharacterBrief[]): Promise<void> => {
        if (!briefs || briefs.length === 0) return;
        const currentStory = ctx.getStory();
        const updatedCast = [...asArray<CastMember & Record<string, unknown>>(currentStory.cast)];
        const newlySpawned: Array<CastMember & Record<string, unknown>> = [];
        const slopConfig = ctx.getSlopConfig();

        let spawnRenameMap: Record<string, string> = {};
        if (slopConfig?.enableSlopAudit !== false && slopConfig?.enableUpstreamNameAudit !== false) {
            try {
                const spawnAudit = auditFn({
                    characters: briefs.map(
                        (b) => ({ id: b.id, name: b.name || b.id, role: b.role }) as CastMember
                    ),
                    existingCast: updatedCast,
                    slopConfig,
                    story: currentStory as Partial<Story>
                });
                if (!spawnAudit.valid && spawnAudit.violations.length > 0) {
                    const existingNames = updatedCast
                        .map((c) => c.name)
                        .concat(briefs.map((b) => b.name || b.id || '').filter(Boolean));
                    const res = await repairBannedEntitiesWithAI(ctx, {
                        violations: spawnAudit.violations,
                        existingNames,
                        storyContext: asString(currentStory.concept) || spawningContext || '',
                        story: currentStory
                    });
                    spawnRenameMap = res.renameMap || {};
                }
            } catch (spawnAuditErr) {
                console.warn('[spawnNewCharacters] Entity name audit warning:', spawnAuditErr);
            }
        }

        for (const rawBrief of briefs) {
            const rawName = rawBrief.name || rawBrief.id || '';
            const briefName = spawnRenameMap[rawName] || rawName;
            const brief: EscalationCharacterBrief =
                Object.keys(spawnRenameMap).length > 0
                    ? {
                          ...rawBrief,
                          name: briefName,
                          role: cascadeFn(rawBrief.role || '', spawnRenameMap),
                          core_flaw: cascadeFn(rawBrief.core_flaw || '', spawnRenameMap),
                          core_desire: cascadeFn(rawBrief.core_desire || '', spawnRenameMap),
                          vocal_cadence: cascadeFn(rawBrief.vocal_cadence || '', spawnRenameMap)
                      }
                    : rawBrief;
            if (!briefName) continue;
            const existing = updatedCast.find(
                (c) =>
                    c.name.toLowerCase() === briefName.toLowerCase() ||
                    (brief.id && c.id === brief.id)
            );
            if (existing) continue;

            const rawBriefCadence = cleanCharacterNameFromVoiceProfile(brief.vocal_cadence || '', [
                briefName
            ]);
            const validBriefCadence = isValidQwenVoiceProfile(rawBriefCadence)
                ? rawBriefCadence
                : synthesizeQwenVoiceDesignProfile(
                      {
                          id: brief.id,
                          name: briefName,
                          role: brief.role,
                          core_flaw: brief.core_flaw,
                          core_desire: brief.core_desire
                      } as VoiceCastMember,
                      briefName,
                      { ...currentStory, cast: updatedCast } as AudioStoryLike
                  );
            const newChar: CastMember & Record<string, unknown> = {
                id: brief.id || `C_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                name: briefName,
                role: brief.role || 'Minor Character',
                core_flaw: brief.core_flaw || 'Unspecified',
                core_desire: brief.core_desire || 'Unspecified',
                vocal_cadence: validBriefCadence,
                voice_seed: computeSpawnedCharacterVoiceSeed(briefName, currentStory),
                details: {
                    history: `Introduced dynamically in ${spawningContext || 'the narrative'}.`,
                    goals: brief.core_desire || 'Quiet yearning yet to unfold',
                    story_events: `Spawned during ${spawningContext || 'generation'}.`
                }
            };
            updatedCast.push(newChar);
            newlySpawned.push(newChar);
            spawnedBriefs.push(brief);
        }

        if (newlySpawned.length > 0) {
            const seqIdx = activeChapNum;
            const sceneIdx = activeSceneNum - 1;
            const spawnSceneKey = `${seqIdx}`;
            ctx.setStory((prev) => {
                const nextScenes = { ...asRecord(prev.scenes) };
                const sceneList = asArray<Record<string, unknown>>(nextScenes[spawnSceneKey]);
                if (sceneList[sceneIdx]) {
                    const updatedList = [...sceneList];
                    const scene = { ...updatedList[sceneIdx] };
                    const castIds = asStringArray(scene.cast_ids);
                    const castNames = asStringArray(scene.cast_names ?? scene.characters_present);
                    const charsPresent = [...castNames];
                    for (const char of newlySpawned) {
                        if (char.id && !castIds.includes(char.id)) castIds.push(char.id);
                        if (!castNames.includes(char.name)) {
                            castNames.push(char.name);
                            charsPresent.push(char.name);
                        }
                    }
                    scene.cast_ids = castIds;
                    scene.cast_names = castNames;
                    scene.characters_present = charsPresent;
                    updatedList[sceneIdx] = scene;
                    nextScenes[spawnSceneKey] = updatedList;
                }
                return { ...prev, cast: updatedCast, scenes: nextScenes };
            });
            currentStory.cast = updatedCast;
        }
    };

    const chunkPrefix = chunkContext ? ` [${chunkContext}]` : '';
    const repairCallAI: StructuralRepairCallAIFn = (userPrompt, sysPrompt, useJson, label, role) =>
        ctx.callAI(userPrompt, sysPrompt, useJson, label, role);

    while (attempt <= 3) {
        const rsiSuffix = isRsiRedo ? ' (RSI Re-attempt)' : '';
        console.group(`[Pipeline - ${tierName}${chunkPrefix}] Attempt ${attempt}${rsiSuffix} Started`);
        console.log('Model Size Target:', currentModelSize);

        if (deviationReasons.length > 0) {
            deviationReasons = [...new Set(deviationReasons)]
                .filter((r) => r && r.length >= 10 && r.length <= 500)
                .slice(0, 5);
            console.log('Previous Deviation Reasons (Sanitized):', deviationReasons);
        }

        if (lastCritique) {
            console.log('Previous Critique:', lastCritique);
        }

        ctx.setLoadingStep(`Running ${tierName}${chunkPrefix}${rsiSuffix} (Attempt ${attempt}/3)...`);

        if (attempt === 3) {
            ctx.showToast(`Final attempt for ${tierName}...`, 'info');
        }

        const currentStory = ctx.getStory();
        let genOutput: string;
        let userPrompt = generatorPromptFn();

        if (tierName === 'Writing Agent') {
            const isAudioDramaRevision =
                asString(context?.writing_mode) === 'audio_drama' ||
                asString(currentStory.writing_mode) === 'audio_drama';
            if (attempt > 1 && lastGenOutput) {
                const cleanedLastOutput = extractReasoningAndContent(lastGenOutput).text;
                const previousDraft =
                    extractTag(cleanedLastOutput, 'prose_text') ||
                    extractTag(cleanedLastOutput, 'polished_prose') ||
                    parseWritingOutput(cleanedLastOutput).prose ||
                    cleanedLastOutput ||
                    asString(context?.existingProseText);

                if (attempt === 2) {
                    userPrompt += `\n\n=== DRAFT FOR REVISION (ATTEMPT 2/3 - EDITORIAL PASS) ===
The following is a previous draft of this scene's ${isAudioDramaRevision ? 'audio drama script' : 'prose'}. It has been evaluated by the Editorial Reviewer and requires targeted editorial revision to resolve the cited defects while preserving strong existing dialogue, sensory details, pacing, and emotional resonance.

<draft_to_revise>
${previousDraft}
</draft_to_revise>

<critical_issues_to_fix>
${deviationReasons.map((r) => `- ${r}`).join('\n')}
</critical_issues_to_fix>${lastCritique ? `\n\n<reviewer_critique>\n${lastCritique}\n</reviewer_critique>` : ''}

REVISION INSTRUCTIONS:
1. Retain working spoken dialogue, ${isAudioDramaRevision ? 'Narrator staging' : 'physical blocking'}, and sensory descriptions from <draft_to_revise> that advance the scene.
2. Directly overhaul every section flagged in <critical_issues_to_fix> and <reviewer_critique>.
3. Deliver the complete, revised ${isAudioDramaRevision ? 'audio drama script' : 'scene'} inside <prose_text> and </prose_text> tags.${isAudioDramaRevision ? `\n\n${AUDIO_DRAMA_SYNTAX_CONTRACT_CARD}` : ''}`;
                } else if (attempt === 3) {
                    const priorAttemptsSummary = escalationHistory
                        .map(
                            (h) =>
                                `Pass ${h.attempt} Failure Reasons:\n${(h.reasons || []).map((r) => `  - ${r}`).join('\n')}${h.critique ? `\nEditorial Critique:\n${h.critique}` : ''}`
                        )
                        .join('\n\n');

                    userPrompt += `\n\n=== DRAFT FOR REVISION (ATTEMPT 3/3 - FINAL ESCALATION PASS) ===
ALERT: This is your FINAL automated revision attempt for this scene. Resolve the persistent critical issues below decisively while preserving the strongest writing, dramatic momentum, and emotional clarity from the current draft.

<draft_to_revise>
${previousDraft}
</draft_to_revise>

${priorAttemptsSummary ? `<prior_attempt_history>\n${priorAttemptsSummary}\n</prior_attempt_history>\n\n` : ''}<persistent_critical_issues>
${deviationReasons.map((r) => `- ${r}`).join('\n')}
</persistent_critical_issues>${lastCritique ? `\n\n<reviewer_critique>\n${lastCritique}\n</reviewer_critique>` : ''}

FINAL ESCALATION PROTOCOL:
1. Resolve every item listed in <persistent_critical_issues> and <reviewer_critique> cleanly.
2. Prioritize blueprint choreography, physical continuity, and exact formatting compliance.
3. Consult <prior_attempt_history> so every defect from Attempt 1 and Attempt 2 stays resolved.
4. Output the complete, definitive ${isAudioDramaRevision ? 'audio drama script' : 'scene'} inside <prose_text> and </prose_text> tags.${isAudioDramaRevision ? `\n\n${AUDIO_DRAMA_SYNTAX_CONTRACT_CARD}` : ''}`;
                }
            }
        } else if (attempt > 1 && lastGenOutput) {
            const cleanedLastOutput = extractReasoningAndContent(lastGenOutput).text;
            const passLabel =
                attempt === 2
                    ? 'ATTEMPT 2/3 - EDITORIAL STRUCTURAL REVISION'
                    : 'ATTEMPT 3/3 - FINAL ESCALATION PASS';

            if (attempt === 2) {
                userPrompt += `\n\n=== STRUCTURAL DRAFT FOR REVISION (${passLabel}) ===
The previous generated structure for ${tierName} was evaluated by the Editorial Reviewer / Structural Gate and requires an editorial revision to meet narrative and schema standards.

CRITICAL DIRECTIVE: Do NOT discard your previous work or start over blindly from scratch. The draft below contains approved macro concepts, world-building, and character arcs. Your task is to REVISE and ENHANCE this draft into a cohesive, structurally compliant output. Preserve what works, directly fix all cited defects, and satisfy all required headings, fields, and XML tags.

<draft_to_revise>
${cleanedLastOutput}
</draft_to_revise>

<critical_issues_to_fix>
${deviationReasons.map((r) => `- ${r}`).join('\n')}
</critical_issues_to_fix>${lastCritique ? `\n\n<reviewer_critique>\n${lastCritique}\n</reviewer_critique>` : ''}

REVISION INSTRUCTIONS:
1. Retain all sound narrative developments, act/sequence foundations, and character moments from <draft_to_revise>.
2. Overhaul the specific sections cited in <critical_issues_to_fix> and <reviewer_critique>.
3. For Story Arc: Ensure <core_thematic_argument>, <starting_value_state>, <ending_value_state>, <inciting_incident>, <major_surprises_and_twists>, at least 3 threads in <narrative_threads> (T1, T2, T3), and distinct <arc> blocks for EVERY character in the cast roster (each with lie_believed, truth_needed, arc_catalyst, arc_description) are fully specified.
4. For Act Structure: Ensure all 5 required act mandate headings are explicitly present in each act, and every thread ID has a declared status in <thread_statuses_at_end>.
5. Output the complete, revised structure strictly inside the required XML tags without markdown fences around the root XML.`;
            } else if (attempt === 3) {
                const priorAttemptsSummary = escalationHistory
                    .map(
                        (h) =>
                            `Pass ${h.attempt} Failure Reasons:\n${(h.reasons || []).map((r) => `  - ${r}`).join('\n')}${h.critique ? `\nReviewer Critique:\n${h.critique}` : ''}`
                    )
                    .join('\n\n');

                userPrompt += `\n\n=== STRUCTURAL DRAFT FOR REVISION (ATTEMPT 3/3 - FINAL ESCALATION PASS) ===
ALERT: This is your FINAL automated revision attempt for ${tierName}. The review gate is operating under relaxed standards for this pass to permit narrative flexibility while eliminating critical structural and schema defects.

CRITICAL DIRECTIVE: Prior attempts have failed review. You MUST resolve the persistent issues below without oscillating back to earlier defects. Preserve the best elements from the current draft while decisively fixing recurring issues.

<draft_to_revise>
${cleanedLastOutput}
</draft_to_revise>

${priorAttemptsSummary ? `<prior_attempt_history>\n${priorAttemptsSummary}\n</prior_attempt_history>\n\n` : ''}<persistent_critical_issues>
${deviationReasons.map((r) => `- ${r}`).join('\n')}
</persistent_critical_issues>${lastCritique ? `\n\n<reviewer_critique>\n${lastCritique}\n</reviewer_critique>` : ''}

FINAL ESCALATION PROTOCOL:
1. Fix all items listed in <persistent_critical_issues> and <reviewer_critique> with zero ambiguity.
2. For Story Arc: Ensure core thematic argument, inciting incident, 3 narrative threads, and full-cast character arcs are completely specified. For Acts: Ensure all 5 required mandate headings and thread statuses are present.
3. Review <prior_attempt_history> to avoid repeating errors from Attempt 1 or Attempt 2.
4. Output the complete, definitive structure strictly inside the required XML tags without markdown fences.`;
            }
        } else if (deviationReasons.length > 0) {
            userPrompt += `\n\n=== REVISION REQUESTED FROM PREVIOUS ATTEMPT ===\nPlease address the following validation failures:\n${deviationReasons.map((r) => `- ${r}`).join('\n')}\n`;
        }

        const feedbackLedger = ctx.getFeedbackLedger();
        const parentFeedback = feedbackLedger[tierName];
        if (parentFeedback && parentFeedback.length > 0) {
            userPrompt += `\n\n=== REVISIONS REQUIRED FROM DOWNSTREAM FAILURE ===\nYour previous output caused downstream generation to fail. Please adjust your generation to resolve the following issues:\n${parentFeedback.map((r) => `- ${r}`).join('\n')}\n`;
        }

        if (attempt === 1 && !isRsiRedo && initialGenOutput && String(initialGenOutput).trim().length > 100) {
            console.log(
                `[Pipeline - ${tierName}${chunkPrefix}] Routing initial agentic draft (${String(initialGenOutput).length} chars) through structural validation & review.`
            );
            genOutput = String(initialGenOutput);
        } else {
            const generatorLogName = `${tierName} (Attempt ${attempt}/3)${chunkPrefix}${rsiSuffix}`;
            genOutput = await ctx.callAI(
                userPrompt,
                systemPrompt,
                false,
                generatorLogName,
                currentModelSize
            );
        }
        lastGenOutput = genOutput;
        console.log('Generator output size:', genOutput.length, 'chars');

        let parsedData: TParsed;
        const effectiveParser =
            typeof parserFn === 'function'
                ? parserFn
                : (raw: string) => ({ raw, genOutput: raw }) as unknown as TParsed;
        try {
            parsedData = effectiveParser(genOutput);
            if (!parsedData) throw new Error('Parser returned null output.');
            const parsedRec = asRecord(parsedData);
            if (
                tierName === 'Writing Agent' &&
                parsedRec.prose &&
                (asString(context?.writing_mode) === 'audio_drama' ||
                    asString(currentStory.writing_mode) === 'audio_drama')
            ) {
                genOutput = `<prose_text>\n${asString(parsedRec.prose)}\n</prose_text>`;
                lastGenOutput = genOutput;
            }
            lastParsedData = parsedData;
        } catch (parseError) {
            const msg = extractErrorMessage(parseError);
            console.error(`XML/Data Parser failed on ${tierName}:`, parseError);
            const nextAction =
                attempt < 3
                    ? `Retrying generation (Attempt ${attempt + 1}/3) with XML schema feedback`
                    : 'Maximum attempts reached. Escalating to intervention/fallback';
            ctx.logPipelineError(
                `${tierName} Parser Failure (Attempt ${attempt}/3)${chunkPrefix}`,
                `XML/Data parsing error: ${msg}`,
                `Parser failed to extract required tags from generator response.\nError: ${msg}\nRaw Output Snippet:\n${genOutput ? `${genOutput.slice(0, 500)}...` : '(No output)'}`,
                {
                    attempt,
                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                    tierName,
                    actionTaken: nextAction,
                    rawOutputSnippet: genOutput ? genOutput.slice(0, 500) : null
                }
            );
            escalationHistory.push({
                attempt,
                reasons: [`Failed to generate valid XML tags structure. Error: ${msg}.`],
                critique: 'Parser failed to extract required tags from generator response.'
            });
            attempt++;
            deviationReasons = [
                `Failed to generate valid XML tags structure. Error: ${msg}. Make sure all required tags are correctly opened and closed.`
            ];
            console.groupEnd();
            continue;
        }

        // PRE-REVIEW STRUCTURAL VALIDATION GATE (B5)
        const validationContext = (context || currentStory) as ValidationContext;

        if (tierName === 'Act Agent' || tierName === 'Act Planner') {
            const actFix = ensureActOutputCompleteness(genOutput, validationContext as CompletenessContext);
            if (actFix.repaired) {
                console.log(
                    '[Act Agent] Auto-completed missing fields/headings in generator output:',
                    actFix.repairs
                );
                genOutput = actFix.rawOutput;
                lastGenOutput = genOutput;
                try {
                    const reparsed = effectiveParser(genOutput);
                    if (reparsed) {
                        parsedData = reparsed;
                        lastParsedData = reparsed;
                    }
                } catch (e) {
                    console.warn('[Act Agent] Failed to re-parse completed output:', e);
                }
            }
        }

        if (tierName === 'Story Arc Agent') {
            const arcFix = ensureStoryArcOutputCompleteness(
                genOutput,
                validationContext as CompletenessContext
            );
            if (arcFix.repaired) {
                console.log(
                    '[Story Arc Agent] Auto-completed missing fields/threads/arcs in generator output:',
                    arcFix.repairs
                );
                genOutput = arcFix.rawOutput;
                lastGenOutput = genOutput;
                try {
                    const reparsed = effectiveParser(genOutput);
                    if (reparsed) {
                        parsedData = reparsed;
                        lastParsedData = reparsed;
                    }
                } catch (e) {
                    console.warn('[Story Arc Agent] Failed to re-parse completed output:', e);
                }
            }
        }

        if (tierName === 'Sequence Agent') {
            const seqFix = ensureSequenceOutputCompleteness(genOutput);
            if (seqFix.repaired) {
                console.log(
                    '[Sequence Agent] Auto-completed missing sequences/fields in generator output:',
                    seqFix.repairs
                );
                genOutput = seqFix.rawOutput;
                lastGenOutput = genOutput;
                try {
                    const reparsed = effectiveParser(genOutput);
                    if (reparsed) {
                        parsedData = reparsed;
                        lastParsedData = reparsed;
                    }
                } catch (e) {
                    console.warn('[Sequence Agent] Failed to re-parse completed output:', e);
                }
            }
        }

        const structuralValidation = validateStructuralOutput(
            tierName,
            parsedData,
            validationContext
        );
        if (!structuralValidation.valid) {
            console.warn(
                `[${tierName}] Structural validation failed (bypassing Reviewer LLM):`,
                structuralValidation.errors
            );

            if (
                tierName === 'Scene Agent' &&
                structuralValidation.errors.some((e) => e.includes('has flat value shift'))
            ) {
                const parsedRec = asRecord(parsedData);
                const scenes = asArray<Record<string, unknown>>(
                    parsedRec.scenes || (Array.isArray(parsedData) ? parsedData : [])
                );
                const defectiveScenes = findFlatValueShiftScenes(
                    scenes
                ) as DefectiveValueShiftEntry[];
                if (defectiveScenes.length > 0) {
                    ctx.showToast(
                        `Surgically repairing ${defectiveScenes.length} flat value shifts...`,
                        'info'
                    );
                    ctx.logPipelineValidation(
                        `${tierName} Structural Validation Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                        false,
                        structuralValidation.errors,
                        null,
                        {
                            attempt,
                            maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                            tierName,
                            type: 'pre_review_gate',
                            actionTaken: `Intercepted ${defectiveScenes.length} flat value shifts for surgical repair`
                        }
                    );
                    const repairResult = await surgicallyRepairValueShifts(
                        defectiveScenes,
                        scenes,
                        validationContext as Record<string, unknown>,
                        genOutput,
                        repairCallAI
                    );
                    if (repairResult.success) {
                        ctx.showToast('Surgical repair successful!', 'success');
                        if (repairResult.genOutput) {
                            genOutput = repairResult.genOutput;
                            try {
                                const reparsed = effectiveParser(repairResult.genOutput);
                                if (reparsed) {
                                    parsedData = reparsed;
                                    lastParsedData = reparsed;
                                }
                            } catch (e) {
                                console.warn('[Scene Agent] Failed to re-parse repaired output:', e);
                            }
                        }
                        const revalidation = validateStructuralOutput(
                            tierName,
                            parsedData,
                            validationContext
                        );
                        if (revalidation.valid) {
                            console.log(
                                `[${tierName}] Structural validation passed after surgical repair.`
                            );
                            structuralValidation.valid = true;
                            structuralValidation.errors = [];
                            ctx.logPipelineValidation(
                                `${tierName} Surgical Value Shift Repair (Attempt ${attempt}/3)${chunkPrefix}`,
                                true,
                                `Successfully repaired ${defectiveScenes.length} flat value shifts.`,
                                null,
                                {
                                    attempt,
                                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                    tierName,
                                    type: 'surgical_repair',
                                    actionTaken: 'Proceeding to Reviewer LLM'
                                }
                            );
                        }
                    } else {
                        ctx.logPipelineError(
                            `${tierName} Surgical Value Shift Repair (Attempt ${attempt}/3)${chunkPrefix}`,
                            'Surgical value shift repair failed',
                            'Repair could not resolve flat value shifts.',
                            {
                                attempt,
                                maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                tierName,
                                actionTaken:
                                    attempt < 3
                                        ? `Retrying generation (Attempt ${attempt + 1}/3)`
                                        : 'Escalation failure'
                            }
                        );
                    }
                }
            }

            if (!structuralValidation.valid) {
                ctx.showToast(`Validation Gate: ${structuralValidation.errors[0]}`, 'warning');
                const nextAction =
                    attempt < 3
                        ? `Bypassing Reviewer LLM. Retrying generation (Attempt ${attempt + 1}/3) with structural error feedback`
                        : 'Maximum attempts reached. Escalating to intervention/fallback';
                ctx.logPipelineValidation(
                    `${tierName} Structural Validation Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                    false,
                    structuralValidation.errors,
                    null,
                    {
                        attempt,
                        maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                        tierName,
                        type: 'structural_gate',
                        actionTaken: nextAction,
                        errors: structuralValidation.errors
                    }
                );
                escalationHistory.push({
                    attempt,
                    reasons: [...structuralValidation.errors],
                    critique: 'Automated structural validation gate failed.'
                });
                attempt++;
                deviationReasons = structuralValidation.errors;
                console.groupEnd();
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }
        } else {
            ctx.logPipelineValidation(
                `${tierName} Structural Validation Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                true,
                `Structural checks passed successfully (${Array.isArray(parsedData) ? `${parsedData.length} items` : 'valid structure'}).`,
                null,
                {
                    attempt,
                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                    tierName,
                    type: 'structural_gate',
                    actionTaken:
                        !reviewerPromptFn || !reviewerSystemPrompt
                            ? 'Accepting output (no reviewer required)'
                            : 'Proceeding to Reviewer LLM'
                }
            );
        }

        if (gateFn && attempt < RETRY_LIMITS.escalationMaxAttempts) {
            let gateErrors: string[] = [];
            try {
                gateErrors = (await gateFn(genOutput, parsedData)) || [];
            } catch (gateErr) {
                console.warn(`[${tierName}] Extra gate failed to run, skipping:`, gateErr);
            }
            if (gateErrors.length > 0) {
                ctx.showToast(`${tierName}: ${gateErrors[0]}`, 'warning');
                ctx.logPipelineValidation(
                    `${tierName} Contract Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                    false,
                    gateErrors,
                    null,
                    {
                        attempt,
                        maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                        tierName,
                        type: 'structural_gate',
                        actionTaken: `Retrying generation (Attempt ${attempt + 1}/3) with the contract violations named`,
                        errors: gateErrors
                    }
                );
                escalationHistory.push({
                    attempt,
                    reasons: [...gateErrors],
                    critique: 'Series ending contract gate failed.'
                });
                attempt++;
                deviationReasons = gateErrors;
                console.groupEnd();
                continue;
            }
        }

        let briefs: EscalationCharacterBrief[] = [];
        const parsedRec = asOptionalRecord(parsedData);
        if (parsedRec && Array.isArray(parsedRec.new_character_briefs)) {
            briefs = parsedRec.new_character_briefs as EscalationCharacterBrief[];
        } else if (
            genOutput.includes('<new_character_briefs>') ||
            genOutput.includes('new_character_briefs:')
        ) {
            const briefsBlock = extractTag(genOutput, 'new_character_briefs');
            if (briefsBlock) {
                const briefBlocks = extractTagList(briefsBlock, 'brief');
                briefs = briefBlocks.map((b) => ({
                    id: extractTag(b, 'id') || undefined,
                    name: decodeXmlEntities(extractTag(b, 'name') || ''),
                    role: decodeXmlEntities(extractTag(b, 'role') || ''),
                    core_flaw: decodeXmlEntities(extractTag(b, 'core_flaw') || ''),
                    core_desire: decodeXmlEntities(extractTag(b, 'core_desire') || ''),
                    vocal_cadence: decodeXmlEntities(extractTag(b, 'vocal_cadence') || '')
                }));
            }
        }
        await spawnNewCharacters(briefs);

        const clearFeedbackForTier = () => {
            ctx.setFeedbackLedger((prev) => {
                const next = { ...prev };
                delete next[tierName];
                return next;
            });
        };

        const runPostAcceptLore = async (acceptedText: string) => {
            const provider = ctx.getApiProvider();
            if (provider === 'koboldcpp' || provider === 'ollama') {
                await triggerLoreExtraction(ctx, acceptedText, activeActNum, activeSceneNum);
            } else {
                triggerLoreExtraction(ctx, acceptedText, activeActNum, activeSceneNum).catch(
                    (err) => console.warn('Background lore extraction failed:', err)
                );
            }
        };

        if (!reviewerPromptFn || !reviewerSystemPrompt) {
            console.log(
                `[Pipeline - ${tierName}${chunkPrefix}] No reviewer configured - accepting output on attempt ${attempt}`
            );
            clearFeedbackForTier();
            console.groupEnd();
            return { genOutput, parsedData, spawnedBriefs };
        }

        if (!ctx.getEnableReview()) {
            console.log(
                `[Pipeline - ${tierName}${chunkPrefix}] Review bypassed via settings - accepting output directly on attempt ${attempt}`
            );
            ctx.logPipelineValidation(
                `${tierName} Review Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                true,
                'Review bypassed via user settings. Generator output accepted directly.',
                null,
                {
                    attempt,
                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                    tierName,
                    type: 'review_gate',
                    actionTaken: 'Review bypassed; advancing to next pipeline step'
                }
            );
            clearFeedbackForTier();
            await runPostAcceptLore(genOutput);
            console.groupEnd();
            return { genOutput, parsedData, spawnedBriefs };
        }

        ctx.setLoadingStep(`Reviewing ${tierName}${chunkPrefix} output (Attempt ${attempt}/3)...`);
        const reviewPrompt = reviewerPromptFn(genOutput);
        let activeReviewerPrompt = reviewerSystemPrompt;
        const enableNarrativeLenses = ctx.getEnableNarrativeLenses();
        if (
            tierName === 'Writing Agent' &&
            attempt === 3 &&
            asString(currentStory.writing_mode) !== 'audio_drama'
        ) {
            activeReviewerPrompt = enableNarrativeLenses
                ? PROMPTS.writingReviewRelaxed
                : stripNarrativeLensSchemaLine(PROMPTS.writingReviewRelaxed);
            ctx.showToast('Using relaxed Writing Review Agent for final attempt...', 'info');
        }

        let reviewOutput = await ctx.callAI(
            reviewPrompt,
            activeReviewerPrompt,
            false,
            `${tierName} Reviewer (Attempt ${attempt}/3)${chunkPrefix}`,
            'review'
        );
        let reviewResult = extractReviewStatus(reviewOutput);

        if (!reviewResult.isValid) {
            console.warn(`[${tierName}] Review output anomalous. Retrying review...`);
            ctx.showToast('Review output anomalous. Retrying review...', 'info');
            reviewOutput = await ctx.callAI(
                reviewPrompt,
                activeReviewerPrompt,
                false,
                `${tierName} Reviewer (Attempt ${attempt}/3, Retry)${chunkPrefix}`,
                'review'
            );
            reviewResult = extractReviewStatus(reviewOutput);
        }

        const reviewStatus = reviewResult.status || 'FAIL';
        let reasons = reviewResult.reasons || [];
        let critique = reviewResult.critique || '';

        console.log('Review Status:', reviewStatus);
        console.log('Review Critique:', critique);
        console.log('Review reasons:', reasons);

        const reviewBriefs = reviewResult.briefs || [];
        await spawnNewCharacters(reviewBriefs);

        if (reviewStatus.trim().toUpperCase() === 'PASS') {
            ctx.showToast(`${tierName} passed review!`);
            console.log(`[Pipeline - ${tierName}${chunkPrefix}] PASS on attempt ${attempt}`);
            ctx.logPipelineValidation(
                `${tierName} Review Gate (Attempt ${attempt}/3)${chunkPrefix}`,
                true,
                critique || 'Reviewer approved output without deviation reasons.',
                null,
                {
                    attempt,
                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                    tierName,
                    type: 'review_gate',
                    actionTaken: 'Advancing to next pipeline step'
                }
            );
            clearFeedbackForTier();
            await runPostAcceptLore(genOutput);
            console.groupEnd();
            return { genOutput, parsedData, spawnedBriefs };
        }

        ctx.logPipelineValidation(
            `${tierName} Review Gate (Attempt ${attempt}/3)${chunkPrefix}`,
            false,
            reasons.length > 0 ? reasons : [critique || 'Reviewer rejected output.'],
            null,
            {
                attempt,
                maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                tierName,
                type: 'review_gate',
                actionTaken: 'Checking RSI context and surgical editor repair options',
                errors: reasons,
                errorDetails: critique
            }
        );

        let rsiExecuted = false;
        for (const reason of reasons) {
            const rsiResult = await checkAndExecuteRSI(ctx, reason, currentStory);
            if (rsiResult) {
                rsiExecuted = true;
                break;
            }
        }

        if (rsiExecuted) {
            rsiAttemptsCount++;
            console.log(`[RSI Executed] Count: ${rsiAttemptsCount}`);
            ctx.showToast(
                `RSI auto-injected missing story context. Retrying ${tierName}...`,
                'info'
            );
            const nextAction =
                rsiAttemptsCount > 2
                    ? `Exceeded RSI patch limit. Escalating to Attempt ${attempt + 1}/3`
                    : `Auto-injected missing story context into world/character state. Re-attempting ${tierName} (Attempt ${attempt}/3)`;
            ctx.logPipelineValidation(
                `${tierName} RSI Auto-Context (Attempt ${attempt}/3)${chunkPrefix}`,
                true,
                'RSI automatically resolved missing world or character context from review feedback.',
                null,
                {
                    attempt,
                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                    tierName,
                    type: 'rsi_patch',
                    actionTaken: nextAction
                }
            );
            if (rsiAttemptsCount > 2) {
                console.warn(`${tierName} review failed repeatedly with RSI. Escalating.`);
                attempt++;
                isRsiRedo = false;
                deviationReasons =
                    reasons.length > 0
                        ? reasons
                        : ['Repeated validation failure after multiple RSI patches.'];
                lastCritique = critique;
            } else {
                isRsiRedo = true;
                attempt = Math.max(1, attempt - 1);
            }
            console.groupEnd();
            continue;
        }
        isRsiRedo = false;

        const parsedIssues =
            reviewResult.issues && reviewResult.issues.length > 0
                ? reviewResult.issues
                : parseIssuesFromReview(reviewOutput);
        console.log('Parsed issues for editing:', parsedIssues);

        if (tierName === 'Writing Agent') {
            let innerPass = 1;
            let currentDraft = genOutput;
            let innerIssues = parsedIssues;
            let innerCritique = critique;

            console.groupCollapsed(`[Surgical Inner Loop - ${tierName}${chunkPrefix}] Attempt ${attempt}`);

            while (innerPass <= 2) {
                console.groupCollapsed(`Pass ${innerPass}/2`);
                ctx.setLoadingStep(
                    `Surgical Editor: Patching ${tierName}${chunkPrefix} (Inner Pass ${innerPass}/2, Attempt ${attempt}/3)...`
                );
                ctx.showToast(`Surgical Editor running (Pass ${innerPass}/2)...`, 'info');

                const issuesText = innerIssues
                    .map(
                        (iss, idx) => `Issue #${idx + 1} [${iss.severity} - ${iss.category}]:
- Description: ${iss.description}
${iss.location ? `- Location in text: "${iss.location}"` : ''}
${iss.fixSuggestion ? `- Suggestion: ${iss.fixSuggestion}` : ''}`
                    )
                    .join('\n\n');

                const isAudioDramaSurgical =
                    asString(context?.writing_mode) === 'audio_drama' ||
                    asString(currentStory.writing_mode) === 'audio_drama' ||
                    isAudioDramaScriptText(currentDraft);
                const surgicalPrompt = isAudioDramaSurgical
                    ? PROMPTS.audioDramaSurgicalEditorProse
                    : PROMPTS.surgicalEditorProse;

                const surgicalUserPrompt = `
<original_text>
${currentDraft}
</original_text>

<reviewer_feedback>
${issuesText}
</reviewer_feedback>
${innerCritique ? `\n<critique_analysis>\n${innerCritique}\n</critique_analysis>\n` : ''}
`;
                try {
                    const surgicalOutput = await ctx.callAI(
                        surgicalUserPrompt,
                        surgicalPrompt,
                        false,
                        `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                        'review'
                    );
                    const surgicalReport = await applySurgicalEditsWithRetry(ctx, {
                        originalText: currentDraft,
                        blocksText: surgicalOutput,
                        systemPrompt: surgicalPrompt,
                        logName: `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                        modelSize: 'review'
                    });
                    let patchedOutput = surgicalReport.text;
                    ctx.showToast(
                        surgicalReport.summary,
                        surgicalReport.failed.length
                            ? 'warning'
                            : surgicalReport.applied.length
                              ? 'success'
                              : 'info'
                    );

                    if (patchedOutput !== currentDraft) {
                        let innerParsed: TParsed;
                        try {
                            innerParsed = effectiveParser(patchedOutput);
                            if (!innerParsed) throw new Error('Parser returned null.');
                            const innerParsedRec = asRecord(innerParsed);
                            if (isAudioDramaSurgical && innerParsedRec.prose) {
                                patchedOutput = currentDraft.includes('<prose_text>')
                                    ? `<prose_text>\n${asString(innerParsedRec.prose)}\n</prose_text>`
                                    : asString(innerParsedRec.prose);
                            }
                            lastParsedData = innerParsed;
                        } catch (parseError) {
                            const msg = extractErrorMessage(parseError);
                            console.error('Surgical edit produced unparseable output:', parseError);
                            ctx.logPipelineError(
                                `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                `Surgical edit produced unparseable output: ${msg}`,
                                parseError instanceof Error ? parseError.stack || msg : msg,
                                {
                                    attempt,
                                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                    tierName,
                                    actionTaken: 'Aborting surgical loop and escalating attempt'
                                }
                            );
                            console.groupEnd();
                            break;
                        }

                        ctx.setLoadingStep(
                            `Reviewing patched ${tierName}${chunkPrefix} output (Inner Pass ${innerPass}/2, Attempt ${attempt}/3)...`
                        );
                        const innerReviewUserPrompt = reviewerPromptFn(patchedOutput);
                        let innerReviewerSysPrompt = reviewerSystemPrompt;
                        if (
                            tierName === 'Writing Agent' &&
                            attempt === 3 &&
                            asString(currentStory.writing_mode) !== 'audio_drama'
                        ) {
                            innerReviewerSysPrompt = enableNarrativeLenses
                                ? PROMPTS.writingReviewRelaxed
                                : stripNarrativeLensSchemaLine(PROMPTS.writingReviewRelaxed);
                        }
                        const innerReviewOutput = await ctx.callAI(
                            innerReviewUserPrompt,
                            innerReviewerSysPrompt,
                            false,
                            `${tierName} Reviewer (Post-Surgical Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            'review'
                        );
                        const reviewResultVal = extractReviewStatus(innerReviewOutput);
                        const reviewStatusVal = reviewResultVal.status;
                        const reasonsVal = reviewResultVal.reasons;
                        const critiqueVal = reviewResultVal.critique;
                        await spawnNewCharacters(reviewResultVal.briefs || []);

                        if (reviewStatusVal.trim().toUpperCase() === 'PASS') {
                            ctx.showToast(`${tierName} passed review after surgical edits!`);
                            console.log(
                                `[Pipeline - ${tierName}${chunkPrefix}] PASS after surgical edits on inner pass ${innerPass}`
                            );
                            ctx.logPipelineValidation(
                                `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                true,
                                'Surgical edits successfully resolved all issues and passed re-review.',
                                null,
                                {
                                    attempt,
                                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                    tierName,
                                    type: 'surgical_repair',
                                    actionTaken: 'Advancing to next pipeline step'
                                }
                            );
                            clearFeedbackForTier();
                            await runPostAcceptLore(patchedOutput);
                            console.groupEnd();
                            console.groupEnd();
                            console.groupEnd();
                            return { genOutput: patchedOutput, parsedData: innerParsed, spawnedBriefs };
                        }

                        innerIssues =
                            reviewResultVal.issues && reviewResultVal.issues.length > 0
                                ? reviewResultVal.issues
                                : parseIssuesFromReview(innerReviewOutput);
                        deviationReasons =
                            reasonsVal.length > 0 ? reasonsVal : ['Failing after surgical edit'];
                        innerCritique = critiqueVal;
                        currentDraft = patchedOutput;
                        lastGenOutput = patchedOutput;

                        console.log('Remaining issues after pass:', innerIssues);
                        ctx.logPipelineValidation(
                            `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            false,
                            innerIssues.map((i) => i.description || String(i)),
                            null,
                            {
                                attempt,
                                maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                tierName,
                                type: 'surgical_repair',
                                actionTaken:
                                    innerPass < 2
                                        ? 'Attempting inner surgical pass 2/2'
                                        : attempt < 3
                                          ? `Surgical passes exhausted. Retrying generation (Attempt ${attempt + 1}/3)`
                                          : 'Surgical passes exhausted. Escalating to intervention/fallback',
                                errors: innerIssues.map((i) => i.description || String(i)),
                                errorDetails: innerCritique
                            }
                        );
                    } else {
                        ctx.showToast(
                            `Surgical Editor: No matches found in inner pass ${innerPass}.`,
                            'warning'
                        );
                        ctx.logPipelineValidation(
                            `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            false,
                            'No patch matches could be applied to prose draft.',
                            null,
                            {
                                attempt,
                                maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                tierName,
                                type: 'surgical_repair',
                                actionTaken: 'Aborting surgical passes for this attempt.'
                            }
                        );
                        console.groupEnd();
                        break;
                    }
                } catch (surgicalError) {
                    const msg = extractErrorMessage(surgicalError);
                    console.error(`Surgical editor failed in inner pass ${innerPass}:`, surgicalError);
                    ctx.logPipelineError(
                        `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                        `Surgical editor execution error: ${msg}`,
                        surgicalError instanceof Error ? surgicalError.stack || msg : msg,
                        {
                            attempt,
                            maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                            tierName,
                            actionTaken: 'Aborting surgical loop for this attempt'
                        }
                    );
                    console.groupEnd();
                    break;
                }
                console.groupEnd();
                innerPass++;
            }
            console.groupEnd();
            if (innerIssues && innerIssues.length > 0) {
                reasons = innerIssues.map((i) => i.description || String(i));
                critique = innerCritique;
            }
        } else if (!['Story Arc Agent', 'Act Agent', 'Act Planner', 'Sequence Agent'].includes(tierName)) {
            if (!parsedIssues.some((i) => i.severity === 'CRITICAL')) {
                let innerPass = 1;
                let currentDraft = genOutput;
                let innerIssues = parsedIssues;
                let innerCritique = critique;

                console.groupCollapsed(
                    `[Surgical Inner Loop - ${tierName}${chunkPrefix}] Attempt ${attempt}`
                );

                while (innerPass <= 2) {
                    console.groupCollapsed(`Pass ${innerPass}/2`);
                    ctx.setLoadingStep(
                        `Surgical Editor: Patching ${tierName}${chunkPrefix} (Inner Pass ${innerPass}/2, Attempt ${attempt}/3)...`
                    );
                    let issuesText = innerIssues
                        .map(
                            (iss, idx) => `Issue #${idx + 1} [${iss.severity} - ${iss.category}]:
- Description: ${iss.description}
${iss.location ? `- Location in structure: "${iss.location}"` : ''}
${iss.fixSuggestion || iss.fix_suggestion ? `- Suggestion: ${iss.fixSuggestion || iss.fix_suggestion}` : ''}`
                        )
                        .join('\n\n');

                    if (!issuesText || issuesText.trim().length === 0) {
                        issuesText = reasons.map((r) => `- ${r}`).join('\n');
                    }

                    const surgicalPrompt = PROMPTS.surgicalEditorStructural;
                    const surgicalUserPrompt = `
<original_text>
${currentDraft}
</original_text>

<reviewer_feedback>
${issuesText}
</reviewer_feedback>
${innerCritique ? `\n<critique_analysis>\n${innerCritique}\n</critique_analysis>\n` : ''}
`;
                    try {
                        const surgicalOutput = await ctx.callAI(
                            surgicalUserPrompt,
                            surgicalPrompt,
                            false,
                            `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            'review'
                        );
                        const surgicalReport = await applySurgicalEditsWithRetry(ctx, {
                            originalText: currentDraft,
                            blocksText: surgicalOutput,
                            systemPrompt: surgicalPrompt,
                            logName: `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            modelSize: 'review'
                        });
                        const patchedOutput = surgicalReport.text;
                        ctx.showToast(
                            surgicalReport.summary,
                            surgicalReport.failed.length
                                ? 'warning'
                                : surgicalReport.applied.length
                                  ? 'success'
                                  : 'info'
                        );
                        if (patchedOutput && patchedOutput !== currentDraft) {
                            let innerParsed: TParsed;
                            try {
                                innerParsed = effectiveParser(patchedOutput);
                                if (!innerParsed) throw new Error('Parser returned null.');
                                lastParsedData = innerParsed;
                            } catch (parseError) {
                                const msg = extractErrorMessage(parseError);
                                console.error(
                                    `Surgical edit produced unparseable output for ${tierName}:`,
                                    parseError
                                );
                                ctx.logPipelineError(
                                    `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                    `Surgical edit produced unparseable output: ${msg}`,
                                    parseError instanceof Error ? parseError.stack || msg : msg,
                                    {
                                        attempt,
                                        maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                        tierName,
                                        actionTaken:
                                            'Aborting structural surgical loop and escalating attempt'
                                    }
                                );
                                console.groupEnd();
                                break;
                            }

                            ctx.setLoadingStep(
                                `Reviewing patched ${tierName}${chunkPrefix} output (Inner Pass ${innerPass}/2, Attempt ${attempt}/3)...`
                            );
                            const innerReviewPrompt = reviewerPromptFn(patchedOutput);
                            const innerReviewOutput = await ctx.callAI(
                                innerReviewPrompt,
                                reviewerSystemPrompt,
                                false,
                                `${tierName} Reviewer (Post-Surgical Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                'review'
                            );
                            const reviewResultVal = extractReviewStatus(innerReviewOutput);
                            const reviewStatusVal = reviewResultVal.status;
                            const reasonsVal = reviewResultVal.reasons;
                            const critiqueVal = reviewResultVal.critique;
                            await spawnNewCharacters(reviewResultVal.briefs || []);

                            if (reviewStatusVal.trim().toUpperCase() === 'PASS') {
                                ctx.showToast(`${tierName} passed review after surgical edits!`);
                                console.log(
                                    `[Pipeline - ${tierName}${chunkPrefix}] PASS after surgical edit on inner pass ${innerPass}`
                                );
                                ctx.logPipelineValidation(
                                    `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                    true,
                                    'Structural surgical edits successfully resolved issues and passed review.',
                                    null,
                                    {
                                        attempt,
                                        maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                        tierName,
                                        type: 'surgical_repair',
                                        actionTaken: 'Advancing to next pipeline step'
                                    }
                                );
                                clearFeedbackForTier();
                                await runPostAcceptLore(patchedOutput);
                                console.groupEnd();
                                console.groupEnd();
                                console.groupEnd();
                                return {
                                    genOutput: patchedOutput,
                                    parsedData: innerParsed,
                                    spawnedBriefs
                                };
                            }

                            innerIssues =
                                reviewResultVal.issues && reviewResultVal.issues.length > 0
                                    ? reviewResultVal.issues
                                    : parseIssuesFromReview(innerReviewOutput);
                            deviationReasons =
                                reasonsVal.length > 0
                                    ? reasonsVal
                                    : ['Failing after surgical edit'];
                            innerCritique = critiqueVal;
                            currentDraft = patchedOutput;
                            lastGenOutput = patchedOutput;

                            ctx.logPipelineValidation(
                                `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                false,
                                innerIssues.map((i) => i.description || String(i)),
                                null,
                                {
                                    attempt,
                                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                    tierName,
                                    type: 'surgical_repair',
                                    actionTaken:
                                        innerPass < 2
                                            ? 'Attempting inner structural pass 2/2'
                                            : attempt < 3
                                              ? `Surgical passes exhausted. Retrying generation (Attempt ${attempt + 1}/3)`
                                              : 'Surgical passes exhausted. Escalating to intervention/fallback',
                                    errors: innerIssues.map((i) => i.description || String(i)),
                                    errorDetails: innerCritique
                                }
                            );

                            if (innerIssues.some((i) => i.severity === 'CRITICAL')) {
                                console.log('Critical issue encountered, aborting inner loop.');
                                console.groupEnd();
                                break;
                            }
                        } else {
                            ctx.showToast(
                                `Surgical Editor: No patches matched for ${tierName} in pass ${innerPass}.`,
                                'warning'
                            );
                            ctx.logPipelineValidation(
                                `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                                false,
                                'No structural patch matches could be applied.',
                                null,
                                {
                                    attempt,
                                    maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                    tierName,
                                    type: 'surgical_repair',
                                    actionTaken: 'Aborting surgical passes for this attempt.'
                                }
                            );
                            console.groupEnd();
                            break;
                        }
                    } catch (surgicalError) {
                        const msg = extractErrorMessage(surgicalError);
                        console.error(
                            `Surgical editor failed for ${tierName} in inner pass ${innerPass}:`,
                            surgicalError
                        );
                        ctx.logPipelineError(
                            `Surgical Editor (${tierName}) (Pass ${innerPass}/2, Attempt ${attempt}/3)`,
                            `Structural surgical editor error: ${msg}`,
                            surgicalError instanceof Error ? surgicalError.stack || msg : msg,
                            {
                                attempt,
                                maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
                                tierName,
                                actionTaken: 'Aborting surgical loop for this attempt'
                            }
                        );
                        console.groupEnd();
                        break;
                    }
                    console.groupEnd();
                    innerPass++;
                }
                console.groupEnd();
                if (innerIssues && innerIssues.length > 0) {
                    reasons = innerIssues.map((i) => i.description || String(i));
                    critique = innerCritique;
                }
            } else {
                console.log('Critical issue exists, bypassing surgical inner loop.');
            }
        }

        console.warn(`${tierName} review failed:`, reasons);
        if (tierName === 'Writing Agent' && reasons && reasons.length > 0) {
            ctx.setFailedReviewCritiques((prev) => {
                const updated = [...prev];
                reasons.forEach((r) => {
                    if (r && !updated.includes(r)) updated.push(r);
                });
                return updated;
            });
        }
        escalationHistory.push({
            attempt,
            reasons: reasons.length > 0 ? [...reasons] : ['General validation failure.'],
            critique: critique || ''
        });
        attempt++;
        deviationReasons = reasons.length > 0 ? reasons : ['General validation failure.'];
        lastCritique = critique;
        console.groupEnd();
    }

    // All 3 attempts failed.
    console.error(`Escalation failed at ${tierName}. Last deviation reasons:`, deviationReasons);
    const finalAction = isAutopilot
        ? lastParsedData
            ? 'Autopilot: proceeding with last valid draft'
            : tierName === 'Writing Agent'
              ? 'Autopilot: falling back to raw prose draft'
              : 'Autopilot: aborting pipeline with preserved story state'
        : 'Opening Intervention Modal for user decision (Retry, Edit, or Accept)';
    ctx.logPipelineError(
        `${tierName} Escalation Failure (All 3 Attempts Exhausted)${chunkPrefix}`,
        'Agent failed after 3 escalation attempts.',
        `Cumulative deviation reasons:\n${deviationReasons.map((r) => `- ${r}`).join('\n')}\n\nLast Critique:\n${lastCritique || '(None)'}`,
        {
            attempt: 3,
            maxAttempts: RETRY_LIMITS.escalationMaxAttempts,
            tierName,
            actionTaken: finalAction,
            errors: deviationReasons
        }
    );

    if (isAutopilot) {
        if (lastParsedData) {
            ctx.showToast(
                `Autopilot: Proceeding with last valid ${tierName} despite validation warnings.`,
                'warning'
            );
            return { genOutput: lastGenOutput, parsedData: lastParsedData, spawnedBriefs };
        }
        if (tierName === 'Writing Agent') {
            ctx.showToast(
                'Writing Agent failed. Fallback: using last version of prose.',
                'warning'
            );
            const fallbackProse = extractTag(lastGenOutput, 'prose_text') || lastGenOutput;
            return {
                genOutput: lastGenOutput,
                parsedData: { prose: fallbackProse } as unknown as TParsed,
                failed: true,
                critique: lastCritique,
                spawnedBriefs
            };
        }
        ctx.showToast(`Generation failed at ${tierName}. Story state preserved.`, 'error');
        throw new Error(`Generation failed at ${tierName} after max retry attempts.`);
    }

    ctx.showToast(`Verification failed at ${tierName}. Awaiting intervention...`, 'warning');
    return new Promise<EscalationResult<TParsed>>((resolve, reject) => {
        ctx.setInterventionState({
            isOpen: true,
            tierName,
            deviationReasons,
            rawOutput: lastGenOutput || deviationReasons.join('\n'),
            onResolve: async (action, editedText) => {
                ctx.setInterventionState((prev) => ({ ...prev, isOpen: false }));
                if (action === 'accept') {
                    const textToParse = editedText || lastGenOutput;
                    try {
                        const effectiveParser =
                            typeof parserFn === 'function'
                                ? parserFn
                                : (raw: string) => ({ raw, genOutput: raw }) as unknown as TParsed;
                        const resolvedData = effectiveParser(textToParse);
                        ctx.showToast(`Proceeding with selected draft for ${tierName}.`, 'success');
                        resolve({ genOutput: textToParse, parsedData: resolvedData, spawnedBriefs });
                    } catch (err) {
                        ctx.showToast(
                            `Parser failed on edited text: ${extractErrorMessage(err)}`,
                            'error'
                        );
                        reject(err);
                    }
                } else if (action === 'retry') {
                    ctx.showToast(`Restarting generation for ${tierName}...`, 'info');
                    try {
                        const res = await runAgentWithEscalation<TParsed>(ctx, {
                            tierName,
                            generatorPromptFn,
                            systemPrompt,
                            reviewerSystemPrompt,
                            reviewerPromptFn,
                            parserFn,
                            modelSize,
                            spawningContext,
                            parentTierFailFn,
                            activeActNum,
                            activeSceneNum,
                            isAutopilot
                        });
                        resolve(res);
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    if (tierName === 'Writing Agent') {
                        ctx.showToast(
                            'Writing Agent failed. Fallback: using last version of prose.',
                            'warning'
                        );
                        const fallbackProse =
                            extractTag(lastGenOutput, 'prose_text') || lastGenOutput;
                        resolve({
                            genOutput: lastGenOutput,
                            parsedData: { prose: fallbackProse } as unknown as TParsed,
                            failed: true,
                            critique: lastCritique,
                            spawnedBriefs
                        });
                        return;
                    }
                    ctx.showToast(
                        `Generation cancelled at ${tierName}. Story state preserved.`,
                        'warning'
                    );
                    reject(new Error(`Generation cancelled at ${tierName}.`));
                }
            }
        });
    });
}
