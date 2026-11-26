/**
 * @module pipeline/prosePipeline
 * Scene prose synthesis orchestrator: Continuity Bridge handoff, Act Compressor,
 * Tier 5.1 Agentic Writer & Escalation Reviewer, Style & Sensory Polish (Phase 4B),
 * AI-Slop surgical gate, Continuity Auditor, Audio Drama Voice Director (Phase 4C),
 * Archivist commit, blueprint cascade patching, and single-scene auto-write.
 */

import { NARRATIVE_MODES, STRUCTURAL_MODALITIES, type NarrativeModeDefinition } from '@/config';
import {
    extractDialogueStats,
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    isAudioDramaScriptText,
    normalizeAudioDramaScript,
    parseAudioDramaScript,
    type AudioStoryLike
} from '@/domain/audio';
import {
    buildUpcomingBoundaryGuardInfo,
    compileActiveState,
    formatContinuityLedgerForPrompt,
    runContinuityAuditor,
    type ContinuityStoryState
} from '@/domain/continuity';
import { formatSlopAuditForPrompt, scanTextForSlop } from '@/domain/slop';
import {
    actForSequence,
    buildLengthMandateBlock,
    computeSceneWordTarget,
    formatSceneSummary,
    getSceneActiveCast,
    insertTargetWordCount,
    normalizeSceneBlueprint,
    parseActNumber,
    parseValueShiftInput,
    type ActiveCastMember
} from '@/domain/story';
import {
    analyzeProseQuality,
    getDynamicBannedPhrases,
    parseWritingOutput,
    validateStructuralOutput
} from '@/domain/validation';
import {
    AUDIO_DRAMA_SYNTAX_CONTRACT_CARD,
    getSurgicalPromptForMode,
    PROMPTS,
    stripNarrativeLensSchemaLine
} from '@/prompts';
import { ensureAudioDramaVoicesRegistered } from '@/services/audio';
import { callAgenticLoop, resolveRole } from '@/services/llm';
import { storyStore } from '@/services/storage';
import {
    CLI_BRIDGE_DEFAULT_URLS,
    isLocalProvider,
    type Act,
    type CastMember,
    type LoreItem,
    type SceneBlueprint,
    type Sequence,
    type Story
} from '@/types';
import {
    decodeXmlEntities,
    extractTag,
    isSerializationPlaceholder,
    safeEscapeRegex,
    safeJsonStringify,
    tokenMatch
} from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { getCharacterDetails, runArchivistForScene } from './continuityPipeline';
import { DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA } from './directiveReview';
import { runAgentWithEscalation } from './escalation';
import { buildProseContext, type ProseContextCastMember } from './proseContext';
import { generateScenes } from './sceneBlueprints';
import { applySurgicalEditsWithRetry, applySurgicalProsePatch } from './surgicalPatch';
import { runAudioDramaVoiceDirectorPass } from './voiceDirector';

export interface CascadeSceneOptions {
    allowLargeChange?: boolean;
}

export interface AutoGenerateSceneOptions {
    forceFullRewrite?: boolean;
}

interface ParsedWriteSceneArgs {
    seq: number;
    s: number;
    cStory: PipelineStory | null;
    autoP: boolean;
    dInst: string;
    forceFullRewrite: boolean;
}

function parseWriteSceneArgs(
    args: unknown[],
    ctx: PipelineRuntimeContext
): ParsedWriteSceneArgs {
    let seq = 0;
    let s = 0;
    let cStory: PipelineStory | null = null;
    let autoP = false;
    let dInst = '';
    let forceFullRewrite = false;

    const optsArg = args.find((a) => {
        const rec = asOptionalRecord(a);
        return (
            rec &&
            (rec.forceFullRewrite !== undefined ||
                rec.fullRewrite !== undefined ||
                rec.forceRewrite !== undefined)
        );
    });
    if (optsArg) {
        const optsRec = asRecord(optsArg);
        forceFullRewrite = Boolean(
            optsRec.forceFullRewrite || optsRec.fullRewrite || optsRec.forceRewrite
        );
    }

    const storyArgIdx = args.findIndex((a) => {
        const rec = asOptionalRecord(a);
        return rec && (rec.beats || rec.scenes || rec.acts || rec.title);
    });
    if (storyArgIdx !== -1) {
        cStory = args[storyArgIdx] as PipelineStory;
        const numArgs = args.slice(0, storyArgIdx).filter((a): a is number => typeof a === 'number');
        if (numArgs.length >= 3) {
            seq = numArgs[1];
            s = numArgs[2];
        } else if (numArgs.length === 2) {
            seq = numArgs[0];
            s = numArgs[1];
        } else if (numArgs.length === 1) {
            seq = numArgs[0];
            s = 0;
        }
        const remainingArgs = args.slice(storyArgIdx + 1);
        remainingArgs.forEach((arg) => {
            if (typeof arg === 'boolean') {
                if (!autoP) autoP = arg;
                else forceFullRewrite = arg;
            } else if (typeof arg === 'string') {
                dInst = arg;
            } else {
                const rec = asOptionalRecord(arg);
                if (
                    rec &&
                    (rec.forceFullRewrite !== undefined ||
                        rec.fullRewrite !== undefined ||
                        rec.forceRewrite !== undefined)
                ) {
                    forceFullRewrite = Boolean(
                        rec.forceFullRewrite || rec.fullRewrite || rec.forceRewrite
                    );
                }
            }
        });
    } else {
        const numArgs = args.filter((a): a is number => typeof a === 'number');
        if (numArgs.length >= 3) {
            seq = numArgs[1];
            s = numArgs[2];
        } else if (numArgs.length === 2) {
            seq = numArgs[0];
            s = numArgs[1];
        } else if (numArgs.length === 1) {
            seq = numArgs[0];
            s = 0;
        }
        args.forEach((arg) => {
            if (typeof arg === 'boolean') {
                if (!autoP) autoP = arg;
                else forceFullRewrite = arg;
            } else if (typeof arg === 'string') {
                dInst = arg;
            } else {
                const rec = asOptionalRecord(arg);
                if (
                    rec &&
                    (rec.forceFullRewrite !== undefined ||
                        rec.fullRewrite !== undefined ||
                        rec.forceRewrite !== undefined)
                ) {
                    forceFullRewrite = Boolean(
                        rec.forceFullRewrite || rec.fullRewrite || rec.forceRewrite
                    );
                }
            }
        });
    }

    if (seq === undefined || seq === null) {
        const selSeq = ctx.getSelectedSequence?.() ?? null;
        seq = selSeq !== null ? selSeq : 0;
    }
    if (s === undefined || s === null) {
        const selSc = ctx.getSelectedScene?.() ?? null;
        s = selSc !== null ? selSc : 0;
    }

    return { seq, s, cStory, autoP, dInst, forceFullRewrite };
}

/** Cascades manual scene blueprint changes surgically into existing written prose. */
export async function handleCascadeSceneToProse(
    ctx: PipelineRuntimeContext,
    seqIdx?: number | null,
    sceneIdx?: number | null,
    options: CascadeSceneOptions = {}
): Promise<void> {
    const selSeq = ctx.getSelectedSequence?.() ?? 0;
    const selSc = ctx.getSelectedScene?.() ?? 0;
    const sIdx = typeof seqIdx === 'number' ? seqIdx : selSeq !== null ? selSeq : 0;
    const scIdx = typeof sceneIdx === 'number' ? sceneIdx : selSc !== null ? selSc : 0;
    const liveStory = ctx.getStory();
    const sId = `${sIdx}-${scIdx}`;
    const scenesArr = asArray<Record<string, unknown>>(asRecord(liveStory.scenes)[`${sIdx}`]);
    const sceneObj = asOptionalRecord(scenesArr[scIdx]);
    const proseEntry = asOptionalRecord(asRecord(liveStory.prose)[sId]);
    if (
        !sceneObj ||
        !(
            asString(proseEntry?.final) ||
            asString(proseEntry?.prose) ||
            asString(proseEntry?.draft)
        )
    ) {
        ctx.showToast('No written prose found for this scene to patch.', 'warning');
        return;
    }

    const staleInfo = asOptionalRecord(proseEntry?.stale);
    const changedFields = asArray<string>(staleInfo?.changedFields);
    const fieldDetails =
        changedFields.length > 0
            ? changedFields
                  .map((f) => {
                      const val = sceneObj[f];
                      const formatted =
                          val && typeof val === 'object'
                              ? JSON.stringify(val)
                              : String(val || '');
                      return `- ${f}: ${formatted}`;
                  })
                  .join('\n')
            : formatSceneSummary(sceneObj as unknown as SceneBlueprint);

    const instructions = `The user manually updated this Scene Blueprint. Surgically update the written prose so every edited blueprint detail below is faithfully dramatized with minimal disruption to unrelated passages:\n\nUpdated / Active Scene Blueprint (${asString(sceneObj.number) || `${sIdx + 1}.${scIdx + 1}`}: "${asString(sceneObj.title) || 'Scene'}"):\n${fieldDetails}\n\nPOV Character: ${asString(sceneObj.pov_character) || 'Unspecified'}\nSetting: ${asString(sceneObj.setting) || 'Unspecified'}\nObjective: ${asString(sceneObj.objective || sceneObj.goal)}\nScene Events:\n${asString(sceneObj.scene_events)}\nEntrance Conditions: ${asString(sceneObj.entrance_conditions)}\nExit Conditions: ${asString(sceneObj.exit_conditions)}\nExit Hook: ${asString(sceneObj.exit_hook)}`;

    ctx.setLoading(true);
    ctx.setLoadingStep(
        `Surgical Editor: Cascading blueprint changes to Scene ${asString(sceneObj.number) || `${sIdx + 1}.${scIdx + 1}`} prose...`
    );
    try {
        const patched = await applySurgicalProsePatch(ctx, {
            story: liveStory,
            seqIdx: sIdx,
            sceneIdx: scIdx,
            instructions,
            allowLargeChange: Boolean(options.allowLargeChange),
            logName: 'Surgical Prose Editor (Scene Blueprint Cascade)'
        });
        const patchedProseMap = asRecord(patched.story.prose);
        const nextProseEntry: Record<string, unknown> = { ...asRecord(patchedProseMap[sId]) };
        delete nextProseEntry.stale;
        const finalStory: PipelineStory = {
            ...patched.story,
            prose: {
                ...patchedProseMap,
                [sId]: nextProseEntry
            }
        };
        ctx.setStory(finalStory);
        const finalId = asString(finalStory.id);
        if (finalId) {
            await storyStore.saveStory(finalId, finalStory);
        }
        ctx.showToast(
            patched.message || 'Scene prose updated to match blueprint changes!',
            'success'
        );
    } catch (err) {
        console.error('Cascade scene-to-prose error:', err);
        ctx.showToast(
            `Failed cascading blueprint changes to prose: ${extractErrorMessage(err)}`,
            'error'
        );
    } finally {
        ctx.setLoading(false);
        ctx.setLoadingStep('');
    }
}

/**
 * Full Tier 5+6 scene drafting pipeline:
 * Continuity Bridge, Act Compressor, Cast Interview Pre-fetch, Agentic Writing Loop,
 * Escalation Review & Surgical Loop, Style & Sensory Polish, Slop Gate, Continuity Auditor,
 * Audio Drama Voice Director, and Scene Archivist commit.
 */
export async function writeSceneProse(
    ctx: PipelineRuntimeContext,
    ...args: unknown[]
): Promise<PipelineStory> {
    const { seq, s, cStory, autoP, dInst, forceFullRewrite } = parseWriteSceneArgs(args, ctx);

    const storyToUse: PipelineStory = { ...(ctx.getStory() || cStory || {}) };
    const scenesMap = asRecord(storyToUse.scenes);
    let scenesList = [
        ...asArray<Record<string, unknown>>(
            scenesMap[`${seq}`] ||
                scenesMap[`${seq}-0`] ||
                scenesMap[`0-${seq}`] ||
                scenesMap['0-0']
        )
    ];
    let scene: Record<string, unknown> = scenesList[s]
        ? { ...scenesList[s] }
        : scenesList[0]
          ? { ...scenesList[0] }
          : { title: 'Scene', scene_events: '', objective: '', cast_names: [] };

    const isManualOrForceRewrite = Boolean(forceFullRewrite || scene.user_edited);
    const initialSceneObj = asString(scene.objective);
    const initialSceneSetting = asString(scene.setting);
    const initialSceneTransitionJump = asString(scene.transition_jump);
    const initialSceneEntrance = asString(scene.entrance_conditions);
    const initialSceneEvents = asString(scene.scene_events);

    const sequencesArr = asArray<Record<string, unknown>>(storyToUse.sequences);
    const sequenceData = sequencesArr[seq] || {
        number: seq + 1,
        parent_act: actForSequence(seq + 1)
    };
    const actsArr = asArray<Record<string, unknown>>(storyToUse.acts);
    const actData =
        actsArr.find(
            (a) => parseActNumber(a.number) === parseActNumber(sequenceData.parent_act || 1)
        ) || null;

    ctx.setGeneratingSceneKey?.(`${seq}-${s}`);
    const initSeqNum = Number(sequenceData?.number || seq + 1);
    const initSceneLabel = `${initSeqNum}.${s + 1}`;
    const initSceneTitle = asString(scene?.title) || `Scene ${s + 1}`;
    ctx.setActivePipelineWork?.({
        mode: 'novel',
        phase: 4,
        elementType: 'scene',
        actNumber: parseActNumber(sequenceData?.parent_act, actForSequence(seq + 1)),
        seqIdx: seq,
        seqNumber: initSeqNum,
        seqTitle: asString(sequenceData?.title) || `Sequence ${seq + 1}`,
        sceneIdx: s,
        sceneLabel: initSceneLabel,
        sceneTitle: initSceneTitle,
        title: `Scene ${initSceneLabel}: ${initSceneTitle}`,
        subStep: 'Preparing Scene Context',
        startedAt: Date.now()
    });

    const allNarrativeModes: Record<string, NarrativeModeDefinition> =
        ctx.getAllNarrativeModes?.() || NARRATIVE_MODES;
    const enableNarrativeLenses = ctx.getEnableNarrativeLenses();
    const enableReview = ctx.getEnableReview();
    const enableStylePolish = ctx.getEnableStylePolish?.() ?? true;
    const enableAudioDramaDirectionPass = ctx.getEnableAudioDramaDirectionPass?.() ?? true;
    const slopConfig = ctx.getSlopConfig();
    const bannedPhrases = ctx.getBannedPhrases();

    // Continuity Bridge Logic
    let previousScene: Record<string, unknown> | null = null;
    let previousSceneProseRaw: unknown = null;
    const proseMap = asRecord(storyToUse.prose);

    if (s > 0) {
        previousScene = scenesList[s - 1] || null;
        previousSceneProseRaw = proseMap[`${seq}-${s - 1}`] || proseMap[`${seq}-0-${s - 1}`];
    } else if (seq > 0) {
        const prevSeqScenes = asArray<Record<string, unknown>>(
            scenesMap[`${seq - 1}`] || scenesMap[`${seq - 1}-0`] || scenesMap[`0-${seq - 1}`]
        );
        if (prevSeqScenes.length > 0) {
            previousScene = prevSeqScenes[prevSeqScenes.length - 1];
            previousSceneProseRaw =
                proseMap[`${seq - 1}-${prevSeqScenes.length - 1}`] ||
                proseMap[`${seq - 1}-0-${prevSeqScenes.length - 1}`];
        }
    }

    let previousSceneProseText: string | null = null;
    if (typeof previousSceneProseRaw === 'string') {
        previousSceneProseText = previousSceneProseRaw;
    } else {
        const rawRec = asOptionalRecord(previousSceneProseRaw);
        if (rawRec) {
            previousSceneProseText = asString(rawRec.prose || rawRec.final || rawRec.draft) || null;
        }
    }

    const fullPreviousSceneProseText = previousSceneProseText;

    if (previousSceneProseText && typeof previousSceneProseText === 'string') {
        const words = previousSceneProseText.split(/\s+/);
        if (words.length > 500) {
            previousSceneProseText = `...${words.slice(-500).join(' ')}`;
        }

        if (
            previousScene &&
            scene &&
            previousScene.pov_character &&
            scene.pov_character &&
            previousScene.pov_character !== scene.pov_character
        ) {
            const currentPov = asString(scene.pov_character);
            const unrevealedSecrets = asArray<Record<string, unknown>>(storyToUse.secret_vault).filter(
                (sec) =>
                    sec.status !== 'revealed' &&
                    Array.isArray(sec.concealed_from_characters) &&
                    sec.concealed_from_characters.some((ch) => tokenMatch(currentPov, asString(ch)))
            );
            unrevealedSecrets.forEach((sec) => {
                const truthStr = asString(sec.truth);
                if (truthStr.length > 5) {
                    const rx = new RegExp(safeEscapeRegex(truthStr), 'gi');
                    previousSceneProseText = (previousSceneProseText || '').replace(
                        rx,
                        '[Internal revelation redacted across POV boundary]'
                    );
                }
            });
        }
    }

    if (fullPreviousSceneProseText) {
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 4,
            elementType: 'scene',
            seqIdx: seq,
            sceneIdx: s,
            title: `Scene ${initSceneLabel}: ${initSceneTitle}`,
            subStep: 'Continuity Bridge Handoff'
        });
        ctx.setLoadingStep('Continuity Bridge: Generating scene handoff dossier...');
        const preSynopsisSoFar = asString(ctx.getStory().story_so_far || storyToUse.story_so_far);
        const prevWasBridge = Boolean(previousScene?.is_bridge_scene);
        const upcomingCastStr = Array.isArray(scene.characters_present)
            ? asArray(scene.characters_present).join(', ')
            : asString(scene.characters_present) ||
              (Array.isArray(scene.cast_names)
                  ? asArray(scene.cast_names).join(', ')
                  : asString(scene.cast_names));
        const rawBridgeCast = Array.isArray(scene.characters_present)
            ? asArray(scene.characters_present)
            : Array.isArray(scene.cast_names)
              ? asArray(scene.cast_names)
              : upcomingCastStr
                ? upcomingCastStr
                      .split(/[,;]+/)
                      .map((x) => x.trim())
                      .filter(Boolean)
                : [];
        const bridgeCharStatesObj = asRecord(storyToUse.character_states);
        const bridgeStateEntries: string[] = [];
        const seenBridgeNames = new Set<string>();

        rawBridgeCast.forEach((cn) => {
            const nameStr =
                typeof cn === 'string' ? cn.trim() : asString(asOptionalRecord(cn)?.name);
            if (!nameStr) return;
            const cs =
                asOptionalRecord(bridgeCharStatesObj[nameStr]) ||
                asOptionalRecord(
                    Object.values(bridgeCharStatesObj).find((st) => {
                        const stRec = asOptionalRecord(st);
                        return (
                            stRec &&
                            (asString(stRec.name).toLowerCase() === nameStr.toLowerCase() ||
                                asString(stRec.character).toLowerCase() === nameStr.toLowerCase())
                        );
                    })
                );
            if (cs) {
                seenBridgeNames.add(nameStr.toLowerCase());
                bridgeStateEntries.push(
                    `- ${asString(cs.name || cs.character) || nameStr}: Location: ${asString(cs.location) || 'Unspecified'} | Physical: ${asString(cs.physical_state) || 'Active'} | Emotional: ${asString(cs.emotional_state) || 'Baseline'}${cs.unresolved_tension ? ` | Tension: ${asString(cs.unresolved_tension)}` : ''}`
                );
            }
        });
        Object.entries(bridgeCharStatesObj).forEach(([k, csVal]) => {
            const cs = asOptionalRecord(csVal);
            if (!cs) return;
            const cName = asString(cs.name || cs.character) || k;
            if (!seenBridgeNames.has(cName.toLowerCase())) {
                seenBridgeNames.add(cName.toLowerCase());
                bridgeStateEntries.push(
                    `- ${cName}: Location: ${asString(cs.location) || 'Unspecified'} | Physical: ${asString(cs.physical_state) || 'Active'} | Emotional: ${asString(cs.emotional_state) || 'Baseline'}`
                );
            }
        });

        const bridgeCharStatesBlock = `<living_character_states>\n${bridgeStateEntries.length > 0 ? bridgeStateEntries.join('\n') : 'No tracked character state snapshots recorded yet.'}\n</living_character_states>`;
        const rawBridgeLedger = formatContinuityLedgerForPrompt(
            storyToUse as ContinuityStoryState,
            {
                sequence: seq + 1,
                scene: s + 1,
                act: asString(sequenceData.parent_act),
                sceneObj: scene
            }
        );
        const bridgeLedgerBlock = rawBridgeLedger
            ? `<continuity_ledger>\n${rawBridgeLedger}\n</continuity_ledger>`
            : '';
        const prevSeqForBridge =
            s === 0 && seq > 0 && Array.isArray(storyToUse.sequences)
                ? asOptionalRecord(sequencesArr[seq - 1])
                : null;
        const crossSeqHandoffNotice =
            s === 0 && seq > 0
                ? `\n<cross_sequence_handoff_notice>\n[CROSS-SEQUENCE BOUNDARY ACTIVE: Transitioning from Sequence ${seq} (${asString(prevSeqForBridge?.title) || 'Previous Sequence'}) -> Sequence ${asString(sequenceData?.number) || seq + 1} (${asString(sequenceData?.title) || 'Current Sequence'})]\n- Previous Sequence Ending Hook: ${asString(prevSeqForBridge?.ending_hook || prevSeqForBridge?.closing_image_or_cliffhanger) || 'Follow immediately from previous scene prose'}\n- Previous Sequence Boundary Guard: ${asString(prevSeqForBridge?.next_sequence_boundary_guard) || 'None recorded'}\n- Current Sequence Planned Starting State: ${asString(sequenceData?.starting_state) || 'Direct continuation from previous sequence'}\nCRITICAL INSTRUCTION: Check whether the previous scene ended in a location or character interaction/introduction that conflicts with the upcoming scene blueprint. Never allow Scene ${asString(sequenceData?.number) || seq + 1}.1 to teleport characters without transition or re-introduce an already-met character as a stranger. Reconcile in <revised_blueprint> if solvable cleanly, or trigger a bridge scene only if structurally impossible.\n</cross_sequence_handoff_notice>`
                : '';

        const continuityPrompt = `
<act_mandate>
Act ${parseActNumber(sequenceData.parent_act || 1)}
${actData ? asString(actData.description) : ''}
</act_mandate>

<sequence_objective>
${asString(sequenceData.title)}
${asString(sequenceData.dramatic_question || sequenceData.tactical_question || sequenceData.description)}
</sequence_objective>

<story_so_far>
${asString(storyToUse.story_so_far) || 'The story is just beginning (no prior scene prose).'}
</story_so_far>

${bridgeLedgerBlock}

${bridgeCharStatesBlock}
${crossSeqHandoffNotice}

<remaining_scenes_in_sequence>
${scenesList
    .slice(s)
    .map(
        (sc, idx) =>
            `[Scene ${s + idx + 1}] Title: ${asString(sc.title)}\nSetting: ${asString(sc.setting)}\nGoal: ${asString(sc.objective || sc.goal)}\n`
    )
    .join('\n')}
</remaining_scenes_in_sequence>

<previous_scene_was_bridge>${prevWasBridge ? 'true' : 'false'}</previous_scene_was_bridge>

<previous_scene_prose>
${fullPreviousSceneProseText}
</previous_scene_prose>

<upcoming_scene_blueprint>
Title: ${asString(scene.title)}
POV Character: ${asString(scene.pov_character)}
Setting: ${asString(scene.setting)}
Transition Jump: ${asString(scene.transition_jump)}
Entrance Conditions: ${asString(scene.entrance_conditions)}
Characters Present: ${upcomingCastStr}
Goal/Objective: ${asString(scene.objective || scene.goal)}
Scene Events: ${asString(scene.scene_events)}
Exit Hook: ${asString(scene.exit_hook)}
</upcoming_scene_blueprint>
`;
        const continuityResult = await runAgentWithEscalation(ctx, {
            tierName: 'Continuity Bridge Agent',
            modelSize: 'review',
            isAutopilot: autoP,
            context: {},
            generatorPromptFn: () => continuityPrompt,
            systemPrompt:
                PROMPTS.continuityBridgeAgent ||
                'You are the Continuity Bridge Agent. Output strictly in the requested XML format.',
            parserFn: (raw) => {
                const rawStr = String(raw || '');
                return {
                    raw: rawStr,
                    synopsis: extractTag(rawStr, 'synopsis'),
                    narrative_gap_detected: extractTag(rawStr, 'narrative_gap_detected'),
                    gap_reasoning: extractTag(rawStr, 'gap_reasoning')
                };
            }
        });
        const continuityResultXML = continuityResult?.genOutput || '';

        const synopsisMatch = continuityResultXML.match(/<synopsis>([\s\S]*?)<\/synopsis>/);
        let synopsisText = '';
        if (synopsisMatch && synopsisMatch[1]) {
            synopsisText = synopsisMatch[1].trim();
            const updatedWithSynopsis = ctx.setStory((prev) => {
                const currentSoFar = asString(prev.story_so_far).trim();
                let nextSoFar = currentSoFar;
                if (!currentSoFar) {
                    nextSoFar = synopsisText;
                } else if (!currentSoFar.includes(synopsisText)) {
                    nextSoFar = `${currentSoFar}\n\n${synopsisText}`;
                }
                return { ...prev, story_so_far: nextSoFar };
            });
            storyToUse.story_so_far = updatedWithSynopsis.story_so_far;
        }

        const gapDetectedMatch = continuityResultXML.match(
            /<narrative_gap_detected>(true|false)<\/narrative_gap_detected>/i
        );
        const rawGapDetected =
            Boolean(gapDetectedMatch) && gapDetectedMatch?.[1]?.toLowerCase() === 'true';
        const gapDetected = rawGapDetected && !prevWasBridge && !isManualOrForceRewrite;

        if (gapDetected) {
            const gapReasoningMatch = continuityResultXML.match(
                /<gap_reasoning>([\s\S]*?)<\/gap_reasoning>/
            );
            const gapReasoning = gapReasoningMatch
                ? gapReasoningMatch[1].trim()
                : 'Narrative gap detected.';

            const availableStylesXml =
                `<available_narrative_styles>\n` +
                Object.values(allNarrativeModes)
                    .map((m) => {
                        const mRec = m as unknown as Record<string, unknown>;
                        const name = asString(mRec.name) || asString(mRec.title) || m.id;
                        return `  <style id="${m.id}" name="${name}">\n    <context>${m.context || ''}</context>\n  </style>`;
                    })
                    .join('\n') +
                `\n</available_narrative_styles>`;

            const castRosterBlock = `<cast_roster>\n${asArray<CastMember>(storyToUse.cast).map((c) => `- ${c.name} (${c.role || 'Character'}): Wound/Flaw: ${c.core_flaw || 'None'}, Yearning/Desire: ${c.core_desire || 'None'}`).join('\n')}\n</cast_roster>`;

            const prevSceneLens = asString(previousScene?.dominant_narrative_mode) || 'BASELINE_NEUTRAL';
            const upcomingSceneLens = asString(scene?.dominant_narrative_mode) || 'BASELINE_NEUTRAL';

            const bridgePrompt = `
<story_so_far>
${asString(storyToUse.story_so_far) || 'The story is just beginning (no prior scene prose).'}
</story_so_far>

<act_mandate>
Act ${parseActNumber(sequenceData.parent_act || 1)}
${actData ? asString(actData.description) : ''}
</act_mandate>

<sequence_objective>
${asString(sequenceData.title)}
${asString(sequenceData.dramatic_question || sequenceData.tactical_question || sequenceData.description)}
</sequence_objective>

${castRosterBlock}

${availableStylesXml}

<transition_endpoints>
- POINT A (Previous Scene Just Completed): Title: "${asString(previousScene?.title) || 'Previous Scene'}" | Setting: ${asString(previousScene?.setting) || 'Prior location'} | POV: ${asString(previousScene?.pov_character) || 'Prior POV'} | Narrative Lens: ${prevSceneLens}
- POINT B (Upcoming Target Scene to Bridge Into): Title: "${asString(scene.title) || 'Upcoming Scene'}" | Setting: ${asString(scene.setting) || 'Target location'} | POV: ${asString(scene.pov_character) || 'Target POV'} | Characters Present: ${upcomingCastStr} | Narrative Lens: ${upcomingSceneLens}
</transition_endpoints>

<previous_scene_ending_prose>
${previousSceneProseText || fullPreviousSceneProseText}
</previous_scene_ending_prose>

<synopsis>
${synopsisText}
</synopsis>

<gap_reasoning>
${gapReasoning}
</gap_reasoning>

<upcoming_scene_blueprint>
[TARGET DESTINATION (POINT B) — Your bridge scene MUST conclude by placing the characters into the exact opening conditions of this scene so it can begin immediately]:
Title: ${asString(scene.title)}
POV Character: ${asString(scene.pov_character)}
Setting (Required Arrival Location): ${asString(scene.setting)}
Characters Present: ${upcomingCastStr}
Dominant Narrative Mode: ${upcomingSceneLens}
Opening Goal/Objective: ${asString(scene.objective || scene.goal)}
Scene Events (What happens in the upcoming scene after your bridge ends): ${asString(scene.scene_events)}
</upcoming_scene_blueprint>

${PROMPTS.bridgeSceneGeneratorAgent}
`;

            const bridgeGenResult = await runAgentWithEscalation(ctx, {
                tierName: 'Bridge Generator Agent',
                modelSize: 'dev',
                isAutopilot: autoP,
                context: {},
                generatorPromptFn: () => bridgePrompt,
                systemPrompt:
                    PROMPTS.bridgeSceneGeneratorAgent ||
                    'You are the Bridge Scene Generator Agent. Output strictly in the requested XML format.',
                parserFn: (raw) => {
                    const rawStr = String(raw || '');
                    return {
                        raw: rawStr,
                        insert_scene: extractTag(rawStr, 'insert_scene')
                    };
                }
            });
            const bridgeGenResultXML = bridgeGenResult?.genOutput || '';
            const insertSceneMatch = bridgeGenResultXML.match(
                /<insert_scene>([\s\S]*?)<\/insert_scene>/
            );

            if (insertSceneMatch && insertSceneMatch[1]) {
                const xmlStr = insertSceneMatch[1];
                const extractXML = (tag: string): string => {
                    const m = xmlStr.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
                    return m ? decodeXmlEntities(m[1].trim()) : '';
                };

                const insertedTitle = extractXML('title') || 'Bridge Scene';
                const insertedPov =
                    extractXML('pov_character') ||
                    asString(scene.pov_character || previousScene?.pov_character);
                const insertedSetting =
                    extractXML('setting') || asString(scene.setting || previousScene?.setting);
                const insertedSceneEvents = extractXML('scene_events');
                const insertedAtmosphericOverview = extractXML('atmospheric_overview');
                const insertedGoal = extractXML('goal') || extractXML('objective');
                const insertedValueShift = extractXML('value_shift');
                const insertedExitHook = extractXML('exit_hook');
                const insertedRawDesc = extractXML('description');

                const rawCharactersPresent = extractXML('characters_present');
                const parsedBridgeTokens = rawCharactersPresent
                    ? rawCharactersPresent
                          .split(/[,;\n]+|(?:\band\b)/i)
                          .map((cs) => cs.trim().replace(/^-\s*/, ''))
                          .filter(Boolean)
                    : [];
                const bridgeHadPlaceholder = parsedBridgeTokens.some((cs) =>
                    isSerializationPlaceholder(cs)
                );
                const cleanBridgeTokens = parsedBridgeTokens.filter(
                    (cs) => !isSerializationPlaceholder(cs)
                );
                const fallbackSceneCast = (
                    Array.isArray(scene.characters_present) && scene.characters_present.length > 0
                        ? asArray(scene.characters_present)
                        : asArray(scene.cast_names)
                )
                    .map((cs) =>
                        typeof cs === 'string'
                            ? cs.trim()
                            : asString(asOptionalRecord(cs)?.name || cs).trim()
                    )
                    .filter((cs) => cs && !isSerializationPlaceholder(cs));
                const charList =
                    cleanBridgeTokens.length > 0
                        ? cleanBridgeTokens
                        : fallbackSceneCast.length > 0
                          ? fallbackSceneCast
                          : bridgeHadPlaceholder
                            ? ['[Circular]']
                            : [];

                const allModalities = Object.values(STRUCTURAL_MODALITIES).map((m) => m.name);
                const rawModalityHand = extractXML('modality_hand');
                const modalityHandList = rawModalityHand
                    ? rawModalityHand
                          .split(/[,;\n]+/)
                          .map((ms) => ms.trim().replace(/^-\s*/, ''))
                          .filter(Boolean)
                    : [];
                const canonicalHand: string[] = [];
                modalityHandList.forEach((mStr) => {
                    const clean = String(mStr).trim().toLowerCase();
                    const matched = allModalities.find(
                        (am) =>
                            am.toLowerCase() === clean ||
                            am.toLowerCase().includes(clean) ||
                            clean.includes(am.toLowerCase())
                    );
                    if (matched && !canonicalHand.includes(matched)) {
                        canonicalHand.push(matched);
                    }
                });
                const prevHand = asArray<string>(previousScene?.modality_hand);
                const prevSet = new Set(prevHand.map((m) => String(m).toLowerCase()));
                if (
                    canonicalHand.length < 3 ||
                    (canonicalHand.length > 0 &&
                        canonicalHand.every((m) => prevSet.has(m.toLowerCase())))
                ) {
                    const candidates = allModalities.filter(
                        (m) => !prevSet.has(m.toLowerCase()) && !canonicalHand.includes(m)
                    );
                    const pool =
                        candidates.length > 0
                            ? candidates
                            : allModalities.filter((m) => !canonicalHand.includes(m));
                    const shuffled = [...pool].sort(() => 0.5 - Math.random());
                    while (canonicalHand.length < 3 && shuffled.length > 0) {
                        const popped = shuffled.pop();
                        if (popped) canonicalHand.push(popped);
                    }
                }
                const finalModalityHand = canonicalHand.slice(0, 5);

                const rawDominantMode =
                    extractXML('dominant_narrative_mode') ||
                    extractXML('narrative_mode') ||
                    extractXML('dominant_mode') ||
                    '';
                let matchedModeId: string | null = null;
                if (rawDominantMode) {
                    const cleanMode = String(rawDominantMode)
                        .trim()
                        .toUpperCase()
                        .replace(/[\s-]+/g, '_');
                    if (allNarrativeModes[cleanMode]) {
                        matchedModeId = cleanMode;
                    } else {
                        const found = Object.values(allNarrativeModes).find((m) => {
                            const mRec = m as unknown as Record<string, unknown>;
                            const mName = asString(mRec.name);
                            const mTitle = asString(mRec.title);
                            return (
                                m.id.toUpperCase() === cleanMode ||
                                (mName &&
                                    mName.toLowerCase() === rawDominantMode.trim().toLowerCase()) ||
                                (mTitle &&
                                    mTitle.toLowerCase() === rawDominantMode.trim().toLowerCase()) ||
                                cleanMode.includes(m.id.toUpperCase())
                            );
                        });
                        if (found) matchedModeId = found.id;
                    }
                }

                const resolvedBridgeSceneEvents = insertedSceneEvents || insertedRawDesc || '';
                const parsedBridgeVS = parseValueShiftInput(
                    insertedValueShift || 'Transition -> Arrived at next scene threshold'
                );
                const { inferNarrativeModeForScene } = await import('@/config');
                const inferredBridgeMode = inferNarrativeModeForScene(
                    {
                        title: insertedTitle,
                        scene_events: resolvedBridgeSceneEvents,
                        atmospheric_overview: insertedAtmosphericOverview,
                        modality_hand: finalModalityHand,
                        goal: insertedGoal,
                        objective: insertedGoal
                    },
                    allNarrativeModes
                );

                if (
                    !matchedModeId ||
                    (matchedModeId === 'BASELINE_NEUTRAL' &&
                        inferredBridgeMode &&
                        inferredBridgeMode !== 'BASELINE_NEUTRAL')
                ) {
                    matchedModeId = inferredBridgeMode;
                }
                if (!matchedModeId || matchedModeId === 'BASELINE_NEUTRAL') {
                    if (
                        scene.dominant_narrative_mode &&
                        scene.dominant_narrative_mode !== 'BASELINE_NEUTRAL'
                    ) {
                        matchedModeId = asString(scene.dominant_narrative_mode);
                    } else if (
                        previousScene?.dominant_narrative_mode &&
                        previousScene.dominant_narrative_mode !== 'BASELINE_NEUTRAL'
                    ) {
                        matchedModeId = asString(previousScene.dominant_narrative_mode);
                    } else {
                        matchedModeId = 'BASELINE_NEUTRAL';
                    }
                }

                const snapshotCast = (
                    Array.isArray(scene.characters_present) && scene.characters_present.length > 0
                        ? asArray(scene.characters_present)
                        : asArray(scene.cast_names)
                )
                    .map((cs) =>
                        typeof cs === 'string'
                            ? cs.trim()
                            : asString(asOptionalRecord(cs)?.name || cs).trim()
                    )
                    .filter((cs) => cs && !isSerializationPlaceholder(cs));
                const targetSceneSnapshot = {
                    id: scene.id,
                    title: scene.title,
                    pov_character: scene.pov_character,
                    setting: scene.setting,
                    characters_present: [...snapshotCast],
                    objective: scene.objective || scene.goal,
                    scene_events: scene.scene_events
                };

                const seqNum = Number(sequenceData?.number || seq + 1);
                const insertedScene = normalizeSceneBlueprint(
                    {
                        scene_id: extractXML('scene_id') || `inserted-${Date.now()}`,
                        id: `${seqNum}.${s + 1}`,
                        number: `${seqNum}.${s + 1}`,
                        title: insertedTitle,
                        pov_character: insertedPov,
                        setting: insertedSetting,
                        scene_events: resolvedBridgeSceneEvents,
                        dominant_narrative_mode: matchedModeId,
                        atmospheric_overview: insertedAtmosphericOverview,
                        modality_hand: finalModalityHand,
                        characters_present: [...charList],
                        cast_names: [...charList],
                        goal: insertedGoal,
                        objective: insertedGoal,
                        value_shift: parsedBridgeVS,
                        exit_hook: insertedExitHook,
                        is_bridge_scene: true,
                        bridged_to_scene_snapshot: targetSceneSnapshot
                    },
                    s,
                    seqNum,
                    asArray<CastMember>(storyToUse.cast)
                ) as unknown as Record<string, unknown>;
                insertedScene.id = `${seqNum}.${s + 1}`;
                insertedScene.number = `${seqNum}.${s + 1}`;

                const shiftKeysClone = (sourceObj: unknown): Record<string, unknown> => {
                    if (!sourceObj) return {};
                    const obj = { ...asRecord(sourceObj) };
                    const keysToShift = Object.keys(obj)
                        .map((key) => {
                            const parts = key.split('-');
                            const kSeq = parseInt(parts[0], 10);
                            if (kSeq !== seq) return null;
                            let scIdxPos = 1;
                            if (
                                parts.length >= 3 &&
                                parts[1] === '0' &&
                                !Number.isNaN(parseInt(parts[2], 10))
                            ) {
                                scIdxPos = 2;
                            }
                            const scIdx = parseInt(parts[scIdxPos], 10);
                            if (Number.isNaN(scIdx)) return null;
                            return { key, parts, scIdxPos, scIdx };
                        })
                        .filter(
                            (
                                item
                            ): item is {
                                key: string;
                                parts: string[];
                                scIdxPos: number;
                                scIdx: number;
                            } => Boolean(item)
                        )
                        .sort((a, b) => b.scIdx - a.scIdx);

                    for (const item of keysToShift) {
                        if (item.scIdx >= s) {
                            item.parts[item.scIdxPos] = (item.scIdx + 1).toString();
                            const newKey = item.parts.join('-');
                            obj[newKey] = obj[item.key];
                            delete obj[item.key];
                        }
                    }
                    return obj;
                };

                const bridgedStory = ctx.setStory((prev) => {
                    const prevSeqScenes = [
                        ...(asArray<Record<string, unknown>>(asRecord(prev.scenes)[`${seq}`])
                            .length > 0
                            ? asArray<Record<string, unknown>>(asRecord(prev.scenes)[`${seq}`])
                            : scenesList)
                    ];
                    prevSeqScenes.splice(s, 0, insertedScene);
                    prevSeqScenes.forEach((sc, idx) => {
                        prevSeqScenes[idx] = {
                            ...sc,
                            id: `${seqNum}.${idx + 1}`,
                            number: `${seqNum}.${idx + 1}`
                        };
                    });
                    scenesList = prevSeqScenes;
                    scene = prevSeqScenes[s] || insertedScene;
                    return {
                        ...prev,
                        scenes: {
                            ...asRecord(prev.scenes),
                            [`${seq}`]: prevSeqScenes
                        },
                        beats: shiftKeysClone(prev.beats),
                        prose: shiftKeysClone(prev.prose)
                    };
                });
                storyToUse.scenes = bridgedStory.scenes;
                storyToUse.beats = bridgedStory.beats;
                storyToUse.prose = bridgedStory.prose;
                if (!autoP || !ctx.isAutopilotProtectedView?.()) {
                    ctx.setSelectedSequence?.(seq);
                    ctx.setSelectedScene?.(s);
                }
                ctx.setLoadingStep(
                    `Bridge Scene inserted: Sequence ${seq + 1}, Scene ${s + 1} ("${asString(insertedScene.title) || 'Bridge Scene'}"). Drafting prose...`
                );
                ctx.showToast(
                    `Bridge Scene inserted: Sequence ${seq + 1}, Scene ${s + 1}`,
                    'info'
                );
            }
        } else if (!isManualOrForceRewrite) {
            const revisedBlockMatch = continuityResultXML.match(
                /<revised_blueprint(?:\s+[^>]*)?>([\s\S]*?)<\/revised_blueprint>/i
            );
            const revisedXML = revisedBlockMatch ? revisedBlockMatch[1] : continuityResultXML;
            const isBridgeMetaReasoning = (txt: string) =>
                /^(?:this\s+(?:bridging\s+)?scene\s+(?:serves|is|resolves|functions|establishes)|given\s+the\s+blueprint|the\s+blueprint\s+is\s+retained|this\s+scene\s+resolves|the\s+goal\s+is\s+to\s+resolve|resolves\s+continuity|no\s+changes?\s+(?:are\s+)?needed|return\s+(?:the\s+)?original)/i.test(
                    String(txt || '').trim()
                );

            let newSetting: string | null = null;
            let newTransitionJump: string | null = null;
            let newEntranceConditions: string | null = null;
            let newSceneEvents: string | null = null;
            let newGoal: string | null = null;

            const settingMatch = revisedXML.match(/<setting>([\s\S]*?)<\/setting>/i);
            if (settingMatch && settingMatch[1]) {
                const candidateSetting = settingMatch[1].trim();
                if (
                    candidateSetting.length > 2 &&
                    candidateSetting !== asString(scene.setting) &&
                    !isBridgeMetaReasoning(candidateSetting)
                ) {
                    newSetting = candidateSetting;
                    scene.setting = candidateSetting;
                }
            }

            const tjMatch = revisedXML.match(/<transition_jump>([\s\S]*?)<\/transition_jump>/i);
            if (tjMatch && tjMatch[1]) {
                const candidateTJ = tjMatch[1].trim();
                if (
                    candidateTJ.length > 2 &&
                    candidateTJ !== asString(scene.transition_jump) &&
                    !isBridgeMetaReasoning(candidateTJ)
                ) {
                    newTransitionJump = candidateTJ;
                    scene.transition_jump = candidateTJ;
                }
            }

            const entMatch = revisedXML.match(
                /<entrance_conditions>([\s\S]*?)<\/entrance_conditions>/i
            );
            if (entMatch && entMatch[1]) {
                const candidateEnt = entMatch[1].trim();
                if (
                    candidateEnt.length > 5 &&
                    candidateEnt !== asString(scene.entrance_conditions) &&
                    !isBridgeMetaReasoning(candidateEnt)
                ) {
                    newEntranceConditions = candidateEnt;
                    scene.entrance_conditions = candidateEnt;
                }
            }

            const evMatch = revisedXML.match(/<scene_events>([\s\S]*?)<\/scene_events>/i);
            if (evMatch && evMatch[1]) {
                const candidateEv = evMatch[1].trim();
                if (
                    candidateEv.length > 10 &&
                    candidateEv !== asString(scene.scene_events) &&
                    !isBridgeMetaReasoning(candidateEv)
                ) {
                    newSceneEvents = candidateEv;
                    scene.scene_events = candidateEv;
                }
            }

            const goalMatch = revisedXML.match(/<goal>([\s\S]*?)<\/goal>/i);
            if (
                goalMatch &&
                goalMatch[1] &&
                goalMatch[1].trim() !== asString(scene.objective || scene.goal)
            ) {
                const candidateGoal = goalMatch[1].trim();
                if (candidateGoal.length > 5 && !isBridgeMetaReasoning(candidateGoal)) {
                    newGoal = candidateGoal;
                    scene.objective = candidateGoal;
                    scene.goal = candidateGoal;
                }
            }

            if (newSetting || newTransitionJump || newEntranceConditions || newSceneEvents || newGoal) {
                const updatedBlueprintStory = ctx.setStory((prev) => {
                    const prevSeqScenes = [
                        ...asArray<Record<string, unknown>>(asRecord(prev.scenes)[`${seq}`])
                    ];
                    if (prevSeqScenes[s]) {
                        const currentSc = prevSeqScenes[s];
                        const userEditedSetting = asString(currentSc.setting) !== initialSceneSetting;
                        const userEditedTJ =
                            asString(currentSc.transition_jump) !== initialSceneTransitionJump;
                        const userEditedEnt =
                            asString(currentSc.entrance_conditions) !== initialSceneEntrance;
                        const userEditedEv = asString(currentSc.scene_events) !== initialSceneEvents;
                        const userEditedObj = asString(currentSc.objective) !== initialSceneObj;
                        prevSeqScenes[s] = {
                            ...currentSc,
                            ...(newSetting && !userEditedSetting ? { setting: newSetting } : {}),
                            ...(newTransitionJump && !userEditedTJ
                                ? { transition_jump: newTransitionJump }
                                : {}),
                            ...(newEntranceConditions && !userEditedEnt
                                ? { entrance_conditions: newEntranceConditions }
                                : {}),
                            ...(newSceneEvents && !userEditedEv
                                ? { scene_events: newSceneEvents }
                                : {}),
                            ...(newGoal && !userEditedObj
                                ? { objective: newGoal, goal: newGoal }
                                : {})
                        };
                        scene = prevSeqScenes[s];
                    }
                    return {
                        ...prev,
                        scenes: {
                            ...asRecord(prev.scenes),
                            [`${seq}`]: prevSeqScenes
                        }
                    };
                });
                storyToUse.scenes = updatedBlueprintStory.scenes;
            }
        }

        let crossedActBoundary = false;
        if (seq > 0 && s === 0) {
            const prevSeq = sequencesArr[seq - 1];
            if (
                prevSeq &&
                prevSeq.parent_act &&
                sequenceData.parent_act &&
                parseActNumber(prevSeq.parent_act) !== parseActNumber(sequenceData.parent_act)
            ) {
                crossedActBoundary = true;
            }
        }

        if (crossedActBoundary) {
            const preCompressorSoFar = asString(ctx.getStory().story_so_far || storyToUse.story_so_far);
            const compressorInputSoFar = preSynopsisSoFar || preCompressorSoFar;
            ctx.setLoadingStep('Act Compressor: Summarizing previous act...');
            const compressorPrompt = `
${PROMPTS.actCompressorAgent}

<story_so_far>
${compressorInputSoFar}
</story_so_far>
`;
            const compressorResult = await runAgentWithEscalation(ctx, {
                tierName: 'Act Compressor Agent',
                modelSize: 'review',
                isAutopilot: autoP,
                context: {},
                generatorPromptFn: () => compressorPrompt,
                systemPrompt:
                    PROMPTS.actCompressorAgent ||
                    'You are the Act Summary Compressor. Output strictly in the requested XML format.',
                parserFn: (raw) => {
                    const rawStr = String(raw || '');
                    return {
                        raw: rawStr,
                        compressed_summary: extractTag(rawStr, 'compressed_summary')
                    };
                }
            });
            const compressorResultXML = compressorResult?.genOutput || '';
            const compressedMatch = compressorResultXML.match(
                /<compressed_summary>([\s\S]*?)<\/compressed_summary>/
            );
            if (compressedMatch && compressedMatch[1]) {
                const compressedText = compressedMatch[1].trim();
                const prevSceneLabel =
                    asString(previousScene?.number) ||
                    (seq > 0 ? `Seq ${seq} Final Scene` : 'Prior Scene');
                const finalCompressedSoFar =
                    synopsisText && !compressedText.includes(synopsisText)
                        ? `${compressedText}\n\n[Immediate Preceding Scene Handoff (${prevSceneLabel}: ${asString(previousScene?.title) || 'Previous Scene'})]:\n${synopsisText}`
                        : compressedText;
                const afterCompressorStory = ctx.setStory((prev) => {
                    const userEditedDuringCompressor =
                        asString(prev.story_so_far) !== preCompressorSoFar;
                    return {
                        ...prev,
                        story_so_far: userEditedDuringCompressor
                            ? prev.story_so_far
                            : finalCompressedSoFar
                    };
                });
                storyToUse.story_so_far = afterCompressorStory.story_so_far;
            }
        }
    }

    const sId = `${seq}-${s}`;
    const beatsMap = asRecord(storyToUse.beats);
    const beats = asArray(beatsMap[sId] || beatsMap[`${sId}-0`]);

    const currentProseMap = asRecord(storyToUse.prose);
    const rawExistingProseEntry = currentProseMap[sId] || currentProseMap[`${seq}-0-${s}`] || null;
    let existingProseText = '';
    let existingCritique = '';
    if (!forceFullRewrite && rawExistingProseEntry) {
        if (typeof rawExistingProseEntry === 'string') {
            existingProseText = rawExistingProseEntry.trim();
        } else {
            const entryRec = asRecord(rawExistingProseEntry);
            existingProseText = asString(entryRec.final || entryRec.prose || entryRec.draft).trim();
            existingCritique = asString(entryRec.critique).trim();
        }
    }

    // STEP 1: Character Profile Pre-fetching
    let castWasUpdated = false;
    const mutableCast =
        (JSON.parse(safeJsonStringify(storyToUse.cast || [])) as Array<
            CastMember & Record<string, unknown>
        >) || [];
    const activeCast = getSceneActiveCast(
        scene as SceneBlueprint & Record<string, unknown>,
        mutableCast as Array<ActiveCastMember>
    ) as Array<ActiveCastMember & Record<string, unknown>>;

    if (asString(storyToUse.writing_mode) === 'audio_drama') {
        const narratorProfile = getVoiceDescriptionForCharacter(
            'Narrator',
            storyToUse as AudioStoryLike
        );
        activeCast.push({
            name: 'Narrator',
            vocal_cadence: narratorProfile,
            voice_seed: getDeterministicVoiceSeed('Narrator', storyToUse as AudioStoryLike),
            deep_profile: `The omnipresent Narrator of this audio drama. Voice Profile (Breeze 2 Instruct): "${narratorProfile}". Responsible for setting the scene, bridging dialogue, describing physical actions, and establishing atmosphere aloud.`
        });
    }

    for (const ch of activeCast) {
        const chDetails = asOptionalRecord(ch?.details);
        if (
            ch &&
            ch.name &&
            ch.name !== 'Narrator' &&
            !chDetails?.deep_profile &&
            !ch.interview_psychology &&
            !ch.deep_profile
        ) {
            ctx.setLoadingStep(`Pre-fetching profile for ${ch.name}...`);
            await getCharacterDetails(ctx, ch.name, mutableCast);
            castWasUpdated = true;
        }
    }
    if (castWasUpdated) {
        ctx.setStory((prev) => {
            const nextCast = asArray<CastMember & Record<string, unknown>>(prev.cast).map((pc) => {
                const updatedCh = mutableCast.find((mc) => mc.name === pc.name);
                if (!updatedCh) return pc;
                const pcDetails = asRecord(pc.details);
                const updDetails = asRecord(updatedCh.details);
                return {
                    ...pc,
                    voice_sample: pc.voice_sample || updatedCh.voice_sample,
                    vocal_cadence: pc.user_edited_cadence
                        ? pc.vocal_cadence
                        : updatedCh.vocal_cadence || pc.vocal_cadence,
                    core_desire: pc.user_edited_goals
                        ? pc.core_desire
                        : pc.core_desire || updatedCh.core_desire,
                    details: {
                        ...pcDetails,
                        deep_profile:
                            asString(pcDetails.deep_profile) || asString(updDetails.deep_profile),
                        goals: pc.user_edited_goals
                            ? asString(pcDetails.goals) || pc.core_desire
                            : asString(pcDetails.goals) || asString(updDetails.goals)
                    }
                };
            });
            return { ...prev, cast: nextCast };
        });
    }

    try {
        // STEP 2: Full-Scene Drafting (One Pass)
        ctx.setLoadingStep('Drafting Scene: Writing full scene prose...');

        const activeModeId = asString(scene.dominant_narrative_mode) || 'BASELINE_NEUTRAL';
        const narrativeModeObj =
            allNarrativeModes[activeModeId] || allNarrativeModes.BASELINE_NEUTRAL;
        const injectionPrompt = enableNarrativeLenses ? narrativeModeObj?.prompt || '' : '';

        const isAudioDramaStory = asString(storyToUse.writing_mode) === 'audio_drama';
        let basePrompt = isAudioDramaStory ? PROMPTS.audioDramaWritingAgent : PROMPTS.writingAgent;
        if (!enableNarrativeLenses) {
            basePrompt = stripNarrativeLensSchemaLine(basePrompt);
        }
        const failedReviewCritiques = ctx.getFailedReviewCritiques?.() || [];
        const dynamicStyleText =
            failedReviewCritiques.length > 0
                ? `=== DYNAMIC STYLE WARNINGS FROM PREVIOUS BEAT FAILURES ===\nAvoid these specific issues highlighted in recent reviews:\n${failedReviewCritiques.map((crit) => `- ${crit}`).join('\n')}\n`
                : '';
        basePrompt = basePrompt.replace('[DYNAMIC_STYLE_WARNINGS]', () => dynamicStyleText);
        const sceneTarget = computeSceneWordTarget(
            storyToUse as unknown as Partial<Story> & Record<string, unknown>,
            seq,
            s
        );
        const targetSceneWords = sceneTarget.targetWords;
        const lengthMandateBlock = buildLengthMandateBlock(sceneTarget, {
            isAudioDrama: isAudioDramaStory
        });
        basePrompt = insertTargetWordCount(basePrompt, 1, targetSceneWords);
        const finalWritingSystemPrompt = basePrompt;

        const sceneQuery =
            `Scene Action: ${asString(scene.title)} — ${asString(scene.objective || scene.goal)} ${asString(scene.scene_events)} ${asString(scene.setting)}`.trim();
        const ragLoreDocs = await ctx.retrieveContext(
            sceneQuery,
            0.65,
            (meta) =>
                !meta.valid_from_act ||
                Number(meta.valid_from_act) <= Number(sequenceData.parent_act || 1),
            asArray<LoreItem>(storyToUse.lore)
        );
        const loreContext =
            ragLoreDocs.length > 0
                ? ragLoreDocs
                      .map((d) => `### ${asString(asRecord(d.metadata).topic)}\n${d.text}`)
                      .join('\n\n')
                : 'No specific relevant world lore found for this moment.';

        const dynamicExclusions = [
            ...activeCast.map((c) => c.name),
            ...asArray<Record<string, unknown>>(storyToUse.lore).map((l) => l.keyword)
        ];
        let recentProseCombined = '';
        let scenesFound = 0;
        const rollingDialogueStats: Array<{
            id: string;
            wordCount: number;
            dialogueWords: number;
            density: number;
        }> = [];
        for (let bSeq = seq; bSeq >= 0; bSeq--) {
            const seqScenes = asArray(asRecord(storyToUse.scenes)[`${bSeq}`]);
            for (let bSc = bSeq === seq ? s - 1 : seqScenes.length - 1; bSc >= 0; bSc--) {
                const scProse =
                    asRecord(storyToUse.prose)[`${bSeq}-${bSc}`] ||
                    asRecord(storyToUse.prose)[`${bSeq}-0-${bSc}`];
                if (scProse) {
                    const scRec = asOptionalRecord(scProse);
                    const proseText =
                        typeof scProse === 'string'
                            ? scProse
                            : asString(scRec?.final || scRec?.prose || scRec?.draft);
                    recentProseCombined += ` ${proseText}`;
                    if (rollingDialogueStats.length < 3) {
                        const dStats = extractDialogueStats(proseText, {
                            isAudioDrama: isAudioDramaStory
                        });
                        rollingDialogueStats.push({
                            id: `Sequence ${bSeq + 1} Scene ${bSc + 1}`,
                            wordCount: dStats.totalWords,
                            dialogueWords: dStats.dialogueWords,
                            density: dStats.dialogueRatio
                        });
                    }
                    scenesFound++;
                }
                if (scenesFound >= 3) break;
            }
            if (scenesFound >= 3) break;
        }

        let priorWords = 0;
        let priorDialogue = 0;
        rollingDialogueStats.forEach((ps) => {
            priorWords += ps.wordCount || 0;
            priorDialogue += ps.dialogueWords || 0;
        });
        const priorDensity = priorWords > 0 ? priorDialogue / priorWords : 0.25;
        let targetPacingMode: string | null = 'BALANCED';
        if (isAudioDramaStory) {
            targetPacingMode = null;
        } else if (priorDensity > 0.4) {
            targetPacingMode = 'PHYSICAL_IMMEDIACY';
        } else if (priorDensity < 0.15 && priorWords > 0) {
            targetPacingMode = 'CONVERSATIONAL_COLLISION';
        }

        const dynamicBannedList = getDynamicBannedPhrases(recentProseCombined, dynamicExclusions);

        const getProseContext = () => {
            const liveStory = ctx.getStory() || storyToUse;
            const liveScenesMap = asRecord(liveStory.scenes);
            const liveSeqScenes = asArray<Record<string, unknown>>(
                liveScenesMap[`${seq}`] ||
                    liveScenesMap[`${seq}-0`] ||
                    liveScenesMap[`0-${seq}`] ||
                    liveScenesMap['0-0']
            );
            const liveScene = liveSeqScenes[s] || scene;
            const liveSequenceData = asArray<Record<string, unknown>>(liveStory.sequences)[seq] || sequenceData;
            const liveActData = liveStory.acts
                ? asArray<Record<string, unknown>>(liveStory.acts).find(
                      (a) =>
                          parseActNumber(a.number) ===
                          parseActNumber(liveSequenceData.parent_act || 1)
                  ) || null
                : actData;
            const liveActiveCast = getSceneActiveCast(
                liveScene as SceneBlueprint & Record<string, unknown>,
                asArray<ActiveCastMember>(liveStory.cast || mutableCast)
            );
            return (
                buildProseContext({
                    storyToUse: liveStory,
                    scene: liveScene as SceneBlueprint & Record<string, unknown>,
                    sequenceData: liveSequenceData as Sequence & Record<string, unknown>,
                    s,
                    seq,
                    actData: liveActData as (Act & Record<string, unknown>) | null,
                    activeCast: (liveActiveCast.length > 0
                        ? liveActiveCast
                        : activeCast) as unknown as ProseContextCastMember[],
                    loreContext,
                    previousScene: previousScene as (SceneBlueprint & Record<string, unknown>) | null,
                    previousSceneProseText,
                    enableNarrativeLenses,
                    activeModeId,
                    narrativeModeObj: narrativeModeObj as unknown as Record<string, unknown>,
                    injectionPrompt,
                    dInst,
                    rollingDialogueStats,
                    existingProseText: forceFullRewrite ? '' : existingProseText,
                    existingCritique: forceFullRewrite ? '' : existingCritique,
                    forceFullRewrite
                }) +
                (dynamicBannedList.length > 0
                    ? `
<dynamic_banned_phrases>
CRITICAL DIRECTIVE: The following phrases have been heavily overused in the previous recent scenes. You are STRICTLY FORBIDDEN from using any of these exact phrases in this scene:
${dynamicBannedList.map((p) => `- ${p}`).join('\n')}
</dynamic_banned_phrases>
`
                    : '')
            );
        };

        const activeRole = resolveRole('prose', 'Writing Agent');
        const effectiveConfig = ctx.getEffectiveModelConfig(activeRole);
        const targetProvider = effectiveConfig.provider;
        const modelToUse = effectiveConfig.model;

        const creds = ctx.getApiCredentials?.() || {};
        let effectiveApiKey = '';
        let effectiveBaseUrl = '';
        if (targetProvider === 'gemini') effectiveApiKey = creds.apiKey || '';
        else if (targetProvider === 'openrouter') effectiveApiKey = creds.openRouterKey || '';
        else if (targetProvider === 'nanogpt') effectiveApiKey = creds.nanoGptKey || '';
        else if (targetProvider === 'koboldcpp') {
            effectiveBaseUrl = creds.koboldUrl || 'http://localhost:5001';
        } else if (targetProvider === 'codex') {
            effectiveBaseUrl = creds.codexUrl || CLI_BRIDGE_DEFAULT_URLS.codex;
        } else if (targetProvider === 'claude') {
            effectiveBaseUrl = creds.claudeUrl || CLI_BRIDGE_DEFAULT_URLS.claude;
        }

        const toolContext = {
            story: storyToUse as Partial<Story> & Record<string, unknown>,
            writing_mode: asString(storyToUse.writing_mode),
            currentScene: scene,
            previousScene: previousScene || undefined,
            previousSceneProseText: previousSceneProseText || undefined,
            activeCast,
            currentSceneProseText: forceFullRewrite ? '' : existingProseText,
            currentSceneCritique: forceFullRewrite ? '' : existingCritique,
            sequenceData,
            forceFullRewrite,
            slopConfig,
            bannedPhrases
        };

        let initialAgenticOutput = '';
        let characterStateUpdates: Array<Record<string, unknown>> = [];
        let sceneExitHook = '';
        let finalProseText = '';
        let rawDraft = '';

        try {
            ctx.setLoadingStep(`Agentic Writer: Crafting scene prose via ${targetProvider}...`);
            const agenticResult = await callAgenticLoop({
                provider: targetProvider,
                model: modelToUse,
                apiKey: effectiveApiKey,
                baseUrl: effectiveBaseUrl,
                prompt: `${getProseContext()}

<output_format_description>
${
    isAudioDramaStory
        ? `ACOUSTIC SCRIPT CADENCE RULE: Write spoken clauses in breath-unit syntax (8–15 words per clause, with 1–4+ sentences per character turn as dramatic stakes require) to fulfill the full TARGET LENGTH following the formatting contract below.\n${AUDIO_DRAMA_SYNTAX_CONTRACT_CARD}`
        : 'SYNTACTIC CADENCE RULE: Write in flowing, varied, and musical sentences. Blend actions, sensory observations, and dialogue into rhythmic compound sentences, avoiding staccato fragment chains.'
}
${lengthMandateBlock}
AGENTIC TOOLS: Inspect character states, query world lore, query the historical archivist (query_archivist), roll the narrative oracle for lateral micro-frictions (roll_narrative_oracle), or verify previous scene exit state as needed. When satisfied with the scene draft, evaluate it against anti-patterns and call commit_scene_prose with final_prose, character_state_updates, and scene_exit_hook (or enclose output inside <prose_text>...</prose_text>).
</output_format_description>

${isAudioDramaStory ? 'Begin writing current scene audio drama script.' : 'Begin writing current scene prose.'}
`,
                systemPrompt: finalWritingSystemPrompt,
                context: toolContext,
                maxTurns: 5,
                options: {
                    isWritingAgent: true,
                    agentType: 'writing',
                    isAudioDrama: isAudioDramaStory,
                    writing_mode: asString(storyToUse.writing_mode),
                    logName: 'Writing Agent (Agentic Loop)',
                    modelRole: activeRole,
                    onPromptLog: ctx.setPromptLog as
                        | ((updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void)
                        | undefined,
                    max_tokens:
                        targetProvider === 'openrouter'
                            ? creds.openRouterMaxTokens || 65536
                            : isLocalProvider(targetProvider)
                              ? 32768
                              : 16384,
                    temperature:
                        targetProvider === 'gemini' ? 0.8 : targetProvider === 'openrouter' ? 0.85 : 0.75
                },
                onProgress: (msg) => ctx.setLoadingStep(msg)
            });

            if (agenticResult && agenticResult.prose && agenticResult.prose.length > 100) {
                rawDraft = agenticResult.prose;
                initialAgenticOutput = `<prose_text>\n${agenticResult.prose}\n</prose_text>`;
                characterStateUpdates = (agenticResult.characterStateUpdates || []) as Array<
                    Record<string, unknown>
                >;
                sceneExitHook = agenticResult.sceneExitHook || '';
            }
        } catch (agenticErr) {
            console.warn(
                '[writeSceneProse] callAgenticLoop issue, falling back to direct runAgentWithEscalation:',
                agenticErr
            );
        }

        const proseResult = await runAgentWithEscalation<{ prose?: unknown }>(ctx, {
            tierName: 'Writing Agent',
            isAutopilot: autoP,
            initialGenOutput: initialAgenticOutput,
            context: {
                ...scene,
                rollingDialogueStats,
                targetPacingMode,
                writing_mode: storyToUse.writing_mode,
                existingProseText: forceFullRewrite ? '' : existingProseText,
                existingCritique: forceFullRewrite ? '' : existingCritique,
                forceFullRewrite,
                story: storyToUse,
                slopConfig,
                bannedPhrases
            },
            generatorPromptFn: () => `${getProseContext()}

<output_format_description>
${
    isAudioDramaStory
        ? `ACOUSTIC SCRIPT CADENCE RULE: Write spoken clauses in breath-unit syntax (8–15 words per clause, with 1–4+ sentences per character turn as dramatic stakes require) to fulfill the full TARGET LENGTH following the formatting contract below.\n${AUDIO_DRAMA_SYNTAX_CONTRACT_CARD}`
        : 'SYNTACTIC CADENCE RULE: Write in flowing, varied, and musical sentences. Blend actions, sensory observations, and dialogue into rhythmic compound sentences, avoiding staccato fragment chains.'
}
${lengthMandateBlock}

FORMATTING DIRECTIVE: Output the final ${isAudioDramaStory ? 'formatted audio drama script' : 'narrative prose'} enclosed strictly within <prose_text> and </prose_text> tags. Output only the ${isAudioDramaStory ? 'script lines' : 'story paragraphs'} within the tags. End your response immediately after the final </prose_text> tag.
</output_format_description>

${isAudioDramaStory ? 'Begin writing current scene audio drama script.' : 'Begin writing current scene prose.'}
`,
            systemPrompt: finalWritingSystemPrompt,
            reviewerSystemPrompt: isAudioDramaStory
                ? PROMPTS.audioDramaWritingReview
                : enableNarrativeLenses
                  ? PROMPTS.writingReview
                  : stripNarrativeLensSchemaLine(PROMPTS.writingReview),
            reviewerPromptFn: (genOutput) => {
                const parsedOutput = parseWritingOutput(genOutput);
                const structuralVal = validateStructuralOutput('Writing Agent', parsedOutput, {
                    ...scene,
                    rollingDialogueStats,
                    targetPacingMode: targetPacingMode || undefined,
                    writing_mode: asString(storyToUse.writing_mode),
                    story: storyToUse as Partial<Story>,
                    slopConfig,
                    bannedPhrases
                });
                const advisoryWarningsBlock =
                    structuralVal.warnings && structuralVal.warnings.length > 0
                        ? `
<advisory_stylistic_observations>
The automated structural analyzer noted the following stylistic observations:
${structuralVal.warnings.map((w) => `- ${w}`).join('\n')}
Evaluate whether the scene's dramatic velocity, tension, or isolation justifies these choices, or if they should be flagged as issues for surgical revision.
</advisory_stylistic_observations>
`
                        : '';
                const pacingNotice = `
<scene_pacing_context>
Target Length: approximately ${sceneTarget.targetWords.toLocaleString()} words (range: ${sceneTarget.minWords.toLocaleString()}–${sceneTarget.maxWords.toLocaleString()} words).
Pacing Register: ${sceneTarget.register.name} — ${sceneTarget.register.directive}
Reviewer Directive: Evaluate narrative pacing relative to this target and register. Do NOT penalize a scene for being concise if the register is TIGHT or LEAN, nor for being expansive if the register is RICH or EXPANSIVE.
</scene_pacing_context>`;

                return `${DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA}

${getProseContext()}

${pacingNotice}

${advisoryWarningsBlock}

<generated_prose>
${genOutput}
</generated_prose>

BEGIN PROSE CRITIQUE REVIEW`;
            },
            parserFn: (text) => parseWritingOutput(text) as unknown as { prose?: unknown },
            modelSize: 'prose',
            spawningContext: `Sequence ${seq + 1} Scene ${s + 1} Full Scene Prose Writing`,
            activeActNum: Number(sequenceData.parent_act || 1),
            activeChapNum: seq,
            activeSceneNum: s + 1
        });

        const parsedRawProse = proseResult.parsedData?.prose || proseResult.genOutput;
        const parsedProseOut = parseWritingOutput(
            typeof parsedRawProse === 'string' ? parsedRawProse : safeJsonStringify(parsedRawProse)
        );
        finalProseText = parsedProseOut.prose || '';
        if (!rawDraft) {
            rawDraft = typeof parsedRawProse === 'string' ? parsedRawProse : safeJsonStringify(parsedRawProse);
        }

        if (finalProseText) {
            const isDramaProseCleanup = isAudioDramaStory || isAudioDramaScriptText(finalProseText);
            finalProseText = finalProseText
                .replace(/<｜.*?｜>/g, '')
                .replace(/<\|.*?\|>/g, '')
                .replace(
                    isDramaProseCleanup
                        ? /<(?!\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b)\/?[a-z0-9_-]+>/gi
                        : /<\/?[a-z0-9_-]+>/gi,
                    ''
                )
                .replace(/▁|｜/g, '')
                .trim();

            const rawLines = finalProseText.split('\n');
            const cleanLines: string[] = [];
            let insideScratchpad = false;
            for (const line of rawLines) {
                const tr = line.trim();
                if (
                    tr.startsWith('The user wants') ||
                    tr.includes('wants me to revise') ||
                    tr.startsWith('The current beat choreography:') ||
                    tr.startsWith('Choreography:') ||
                    tr.startsWith('Choreography details:') ||
                    tr.startsWith('Previous beat summary:') ||
                    tr.startsWith('So I need to') ||
                    tr.startsWith('Let me draft') ||
                    tr.startsWith('The draft is') ||
                    tr.startsWith('Let me revise') ||
                    tr.startsWith('Given the genre') ||
                    tr.startsWith('Actually wait') ||
                    tr.startsWith('I need to check') ||
                    tr.includes('Let me examine') ||
                    tr.includes('Let me think') ||
                    tr.includes('Let me parse') ||
                    tr.includes('Actually in the choreography') ||
                    tr.startsWith('Key requirements:') ||
                    tr.startsWith('Posture continuity:') ||
                    tr.startsWith('Vocal cadence:') ||
                    tr.includes('Avoid banned patterns') ||
                    tr.includes('Let me write') ||
                    /\*\*(?:Start|Pivot|End):\*\*/i.test(tr) ||
                    /^(?:Start|Pivot|End|Tactic|Action|Reaction|Senses|Length|Careful about|Present tense|Need at least|Avoid|Also continuity|So sequence):/i.test(
                        tr
                    )
                ) {
                    insideScratchpad = true;
                    continue;
                }
                if (insideScratchpad) {
                    if (tr === '---') {
                        insideScratchpad = false;
                        continue;
                    }
                    if (
                        tr.startsWith('-') ||
                        tr.startsWith('*') ||
                        /^(?:\d+\.)/.test(tr) ||
                        tr.includes(':') ||
                        tr.startsWith('Present tense') ||
                        tr.startsWith('Avoid') ||
                        tr.length === 0
                    ) {
                        continue;
                    }
                    insideScratchpad = false;
                }
                cleanLines.push(line);
            }
            finalProseText = cleanLines.join('\n').trim();

            const coTMatch = finalProseText.search(
                /\n\s*---\s*\n\s*(?:Wait|Let me|I need to|Actually|Overall|Note:)/i
            );
            if (coTMatch !== -1) {
                finalProseText = finalProseText.substring(0, coTMatch).trim();
            }

            let startIdx = 0;
            const lines = finalProseText.split('\n');
            while (startIdx < lines.length) {
                const trimmedLine = lines[startIdx].trim();
                if (trimmedLine.startsWith('#') || trimmedLine === '') startIdx++;
                else break;
            }
            finalProseText = lines.slice(startIdx).join('\n').replace(/^---\s*/, '').trim();

            if (isAudioDramaStory || isAudioDramaScriptText(finalProseText)) {
                finalProseText = normalizeAudioDramaScript(finalProseText);
            }
            if (rawDraft && (isAudioDramaStory || isAudioDramaScriptText(rawDraft))) {
                rawDraft = normalizeAudioDramaScript(rawDraft);
            }
        }

        // PHASE 4B: Style & Sensory Polish Pass
        if (enableStylePolish && finalProseText && finalProseText.length > 200 && !isAudioDramaStory) {
            try {
                const draftWordCount = finalProseText.split(/\s+/).length;
                const minAllowedWords = Math.round(draftWordCount * 0.9);
                const maxAllowedWords = Math.round(draftWordCount * 1.1);

                ctx.setLoadingStep(
                    'Style & Sensory Polish: Elevating sentence melody, texture & voice...'
                );
                const prePolishSlopAudit =
                    slopConfig?.enableSlopAudit !== false
                        ? scanTextForSlop(finalProseText, {
                              slopConfig,
                              customBannedPhrases: bannedPhrases,
                              story: storyToUse as Partial<Story>,
                              isAudioDrama: false
                          })
                        : null;
                const prePolishSlopBlock = prePolishSlopAudit?.summary?.hasActionableItems
                    ? `<detected_slop_audit>\nThe following AI-slop defects, scene-closing tells, or clustered cliché patterns were detected in the draft below. Resolve hard defects and trailing scene-closers completely, and rework repeated fallbacks naturally:\n${formatSlopAuditForPrompt(prePolishSlopAudit, { maxItems: 12, includeSentences: true })}\n</detected_slop_audit>\n\n`
                    : '';

                const canonicalInterviews = activeCast
                    .filter(Boolean)
                    .map((ch) => {
                        const details = asRecord(ch.details);
                        const rawInterview =
                            asString(details.deep_profile) ||
                            asString(ch.interview_psychology) ||
                            asString(ch.deep_profile) ||
                            asString(details.personality);
                        if (!rawInterview || rawInterview.length < 20) return '';
                        return `<character_canonical_voice name="${ch.name || 'Character'}">
${rawInterview}
</character_canonical_voice>`;
                    })
                    .filter(Boolean)
                    .join('\n\n');

                const modeRec = narrativeModeObj as unknown as Record<string, unknown>;
                const modeName = asString(modeRec?.name);
                const vsObj = asOptionalRecord(scene.value_shift);

                const polishPrompt = `
${
    enableNarrativeLenses && narrativeModeObj
        ? `<active_scene_narrative_style>
- Style Identifier: ${activeModeId}
- Style Overview: ${narrativeModeObj.context || 'Dynamic stylistic lens'}
- Stylistic Cadence & Pacing Directives:
${injectionPrompt || narrativeModeObj.prompt || 'Balance pacing and interiority.'}
</active_scene_narrative_style>\n\n`
        : ''
}<scene_blueprint>
Setting: ${asString(scene.setting || scene.setting_anchor) || 'Established in scene'}
${enableNarrativeLenses ? `Dominant Narrative Style: ${activeModeId}${modeName ? ` (${modeName})` : ''}\n` : ''}${scene.atmospheric_overview ? `Atmospheric Overview (World-Building Reservoir): ${asString(scene.atmospheric_overview)}\n` : `Sensory Palette (3 Tangible Anchors): ${asString(scene.sensory_palette) || 'Tangible acoustic, physical, and lighting textures'}\n`}${scene.scene_events ? `Scene Events & Plot Points (MUST be dramatized):\n${asString(scene.scene_events)}\n` : ''}Micro-Conflict & Tactic: ${asString(scene.micro_conflict_and_tactic) || 'Immediate obstacle and character tactic'}
Character Voice Directives: ${asString(scene.character_voice_directives) || 'Distinct speech rhythm and psychological defenses'}
Scene Pacing Tempo: ${asString(scene.scene_pacing_tempo) || 'Melodic sentence rhythm alternating short clauses with rich complex sentences'}
Value Shift: ${asString(scene.start_valence || vsObj?.start_state) || 'Start'} -> ${asString(scene.end_valence || vsObj?.end_state) || 'End'}
</scene_blueprint>

${canonicalInterviews ? `<canonical_character_interview_voice>\n${canonicalInterviews}\n</canonical_character_interview_voice>\n` : ''}
${prePolishSlopBlock}<draft_prose>
${finalProseText}
</draft_prose>
${
    dInst
        ? `
<directive_requirement>
CRITICAL: The draft above was generated to satisfy this specific directive instruction:
"${dInst}"
You MUST strictly preserve all story decisions, character actions, tone adjustments, and additions made to fulfill this directive. DO NOT revert or smooth away these changes during your polish pass.
</directive_requirement>
`
        : ''
}
Refine and elevate this scene draft according to your editorial mandates. Preserve ALL plot events and maintain pacing discipline. The polished scene MUST remain close to the draft length (target envelope: ${minAllowedWords.toLocaleString()} to ${maxAllowedWords.toLocaleString()} words; baseline: ~${draftWordCount.toLocaleString()} words). DO NOT inflate the text with speculative philosophizing, unprompted backstory, or redundant padding. Return ONLY the polished prose enclosed within <polished_prose> and </polished_prose> tags.
`;
                const polishOutput = await ctx.callAI(
                    polishPrompt,
                    PROMPTS.styleAndSensoryPolish,
                    false,
                    'Style & Sensory Polish Agent (Phase 4B)',
                    'prose'
                );
                const extractedPolished = extractTag(polishOutput, 'polished_prose');
                if (extractedPolished && extractedPolished.trim().length > 50) {
                    const polishedWordCount = extractedPolished.trim().split(/\s+/).length;
                    if (
                        polishedWordCount >= minAllowedWords &&
                        polishedWordCount <= Math.round(draftWordCount * 1.15)
                    ) {
                        finalProseText = extractedPolished.trim();
                        ctx.logPipelineValidation(
                            `Style & Sensory Polish Pass (Sequence ${seq + 1}, Scene ${s + 1})`,
                            true,
                            `Prose polished successfully (${draftWordCount}w -> ${polishedWordCount}w).`,
                            null,
                            {
                                tierName: 'Style & Sensory Polish Agent',
                                type: 'prose_polish',
                                actionTaken: 'Polished prose committed within length envelope.'
                            }
                        );
                    } else {
                        ctx.logPipelineValidation(
                            `Style & Sensory Polish Pass (Sequence ${seq + 1}, Scene ${s + 1})`,
                            false,
                            `Polish pass bypassed: length (${polishedWordCount}w) violated length clamp vs draft (${draftWordCount}w).`,
                            null,
                            {
                                tierName: 'Style & Sensory Polish Agent',
                                type: 'length_clamp_reject',
                                actionTaken: 'Preserved original draft text to prevent bloat.'
                            }
                        );
                    }
                }
            } catch (polishErr) {
                console.warn(
                    '[writeSceneProse] Style & sensory polish pass warning, continuing with draft:',
                    polishErr
                );
            }
        }

        // POST-WRITING SURGICAL BANNED-WORDS & AI-SLOP EDITOR
        const allStoryCharacters = [
            ...asArray<Record<string, unknown>>(storyToUse?.characters),
            ...(activeCast || [])
        ];
        const activeNames = allStoryCharacters
            .flatMap((ch) => asString(ch.name).trim().split(/\s+/))
            .filter(Boolean);
        const safeBannedPhrases = bannedPhrases.filter(
            (bp) => !activeNames.some((an) => an.toLowerCase() === bp.toLowerCase())
        );
        const isAudioDramaScene = isAudioDramaStory || isAudioDramaScriptText(finalProseText);
        const slopAudit = scanTextForSlop(finalProseText, {
            slopConfig,
            customBannedPhrases: safeBannedPhrases,
            story: storyToUse as Partial<Story>,
            isAudioDrama: isAudioDramaScene
        });
        const shouldTriggerSlopSurgical = Boolean(
            enableReview &&
                slopConfig?.enableSlopAudit !== false &&
                slopAudit?.summary?.shouldTriggerSurgicalGate
        );

        if (shouldTriggerSlopSurgical && slopAudit) {
            const triggerSummary =
                slopAudit.summary.reasons.join(', ') ||
                `${slopAudit.summary.hardCount} hard, ${slopAudit.summary.closerCount} closer, ${slopAudit.summary.clusteredFlagCount} clustered`;
            ctx.showToast(
                `AI Slop Audit triggered (${triggerSummary}). Invoking Surgical Editor...`,
                'warning'
            );
            const auditLines = formatSlopAuditForPrompt(slopAudit, {
                maxItems: 18,
                includeSentences: true
            });
            const auditReasonList = auditLines.split('\n').filter(Boolean);
            ctx.logPipelineValidation(
                `Writing Agent AI Slop Gate (Sequence ${seq + 1}, Scene ${s + 1})`,
                false,
                auditReasonList,
                null,
                {
                    tierName: 'Writing Agent',
                    type: 'banned_words_gate',
                    actionTaken: `Invoking Surgical Editor (AI Slop) for ${triggerSummary}`,
                    errors: auditReasonList
                }
            );
            ctx.setLoadingStep('Surgical Editor: Cleaning AI slop & banned patterns in scene...');
            const surgicalPrompt = `
<original_text>
${finalProseText}
</original_text>

<banned_words_detected>
${auditLines}
</banned_words_detected>
`;
            const bannedWordsSysPrompt = getSurgicalPromptForMode(
                PROMPTS.surgicalEditorBannedWords,
                isAudioDramaScene
            );
            const surgicalRes = await ctx.callAI(
                surgicalPrompt,
                bannedWordsSysPrompt,
                false,
                'Surgical Editor (AI Slop)',
                'review'
            );
            const surgicalReport = await applySurgicalEditsWithRetry(ctx, {
                originalText: finalProseText,
                blocksText: surgicalRes,
                systemPrompt: bannedWordsSysPrompt,
                logName: 'Surgical Editor (AI Slop)',
                modelSize: 'review'
            });
            const patchedProse = isAudioDramaScene
                ? normalizeAudioDramaScript(surgicalReport.text)
                : surgicalReport.text;
            ctx.showToast(
                surgicalReport.summary,
                surgicalReport.failed.length
                    ? 'warning'
                    : surgicalReport.applied.length
                      ? 'success'
                      : 'info'
            );
            if (patchedProse && patchedProse !== finalProseText) {
                finalProseText = patchedProse;
                ctx.logPipelineValidation(
                    `Writing Agent AI Slop Surgical Repair (Sequence ${seq + 1}, Scene ${s + 1})`,
                    true,
                    surgicalReport.summary,
                    null,
                    {
                        tierName: 'Writing Agent',
                        type: 'surgical_repair',
                        actionTaken: 'Prose cleaned of AI slop defects. Proceeding to Continuity Auditor.'
                    }
                );
            } else {
                ctx.logPipelineValidation(
                    `Writing Agent AI Slop Surgical Repair (Sequence ${seq + 1}, Scene ${s + 1})`,
                    false,
                    'Surgical editor could not apply replacements for flagged AI slop.',
                    null,
                    {
                        tierName: 'Writing Agent',
                        type: 'surgical_repair',
                        actionTaken: 'Proceeding with current prose to avoid pipeline stall.'
                    }
                );
            }
        } else {
            ctx.logPipelineValidation(
                `Writing Agent AI Slop Gate (Sequence ${seq + 1}, Scene ${s + 1})`,
                true,
                slopAudit
                    ? `Passed (${slopAudit.summary.hardCount} hard, ${slopAudit.summary.closerCount} closer, ${slopAudit.summary.clusteredFlagCount} clustered flags, ${slopAudit.summary.flagCount} isolated flags).`
                    : 'Passed.',
                null,
                {
                    tierName: 'Writing Agent',
                    type: 'banned_words_gate',
                    actionTaken: 'AI Slop gate passed. Proceeding to Continuity Auditor.'
                }
            );
        }

        // TIER 4: DEDICATED CONTINUITY AUDITOR
        if (enableReview && finalProseText && finalProseText.length > 100) {
            try {
                ctx.setLoadingStep(
                    'Continuity Auditor: Checking physical, spatial, and relational continuity against Active State...'
                );
                const activeStateForAudit = compileActiveState(
                    storyToUse as ContinuityStoryState,
                    scene as unknown as SceneBlueprint,
                    activeCast as unknown as CastMember[],
                    {
                        sequence: Number(sequenceData?.number || 1),
                        scene: s + 1,
                        act: asString(sequenceData?.parent_act)
                    }
                );
                const upcomingBoundaryForAudit = buildUpcomingBoundaryGuardInfo({
                    storyToUse: storyToUse as Partial<Story> & Record<string, unknown>,
                    seq,
                    s,
                    scene: scene as unknown as SceneBlueprint,
                    sequenceData: sequenceData as Sequence,
                    scenesList: scenesList as unknown as SceneBlueprint[]
                }).auditSummary;
                const auditResult = await runContinuityAuditor({
                    proseText: finalProseText,
                    activeStateBlock: activeStateForAudit,
                    scene: scene as unknown as SceneBlueprint,
                    previousScene: (previousScene as unknown as SceneBlueprint) || null,
                    previousSceneProseText:
                        fullPreviousSceneProseText || previousSceneProseText || '',
                    upcomingBoundaryInfo: upcomingBoundaryForAudit,
                    callAIFn: ctx.callAI,
                    isAutopilot: autoP,
                    isAudioDrama: isAudioDramaStory
                });
                if (auditResult && auditResult.status === 'PATCHED' && auditResult.prose) {
                    finalProseText = auditResult.prose;
                    ctx.logPipelineValidation(
                        `Continuity Auditor Surgical Patch (Sequence ${seq + 1}, Scene ${s + 1})`,
                        true,
                        `Applied ${auditResult.patchesApplied} surgical continuity patch(es) against <active_state>.`,
                        null,
                        {
                            tierName: 'Continuity Auditor',
                            type: 'continuity_patch',
                            actionTaken: `Surgically patched ${auditResult.patchesApplied} physical/relational continuity contradiction(s).`
                        }
                    );
                    ctx.showToast(
                        `Continuity Auditor applied ${auditResult.patchesApplied} surgical patch(es)`,
                        'info'
                    );
                } else {
                    ctx.logPipelineValidation(
                        `Continuity Auditor Gate (Sequence ${seq + 1}, Scene ${s + 1})`,
                        true,
                        'Draft strictly adheres to active state relational and physical ground truth.',
                        null,
                        {
                            tierName: 'Continuity Auditor',
                            type: 'continuity_audit_pass',
                            actionTaken:
                                'Active state ground truth validated. Proceeding to Archivist.'
                        }
                    );
                }
            } catch (auditErr) {
                console.warn(
                    '[writeSceneProse] Continuity Auditor pass warning, proceeding with current draft:',
                    auditErr
                );
            }
        }

        // PHASE 4C: AUDIO DRAMA VOICE DIRECTOR SURGICAL PASS
        if (
            enableAudioDramaDirectionPass &&
            isAudioDramaStory &&
            finalProseText &&
            finalProseText.length > 150
        ) {
            try {
                const dirRes = await runAudioDramaVoiceDirectorPass(ctx, {
                    proseText: finalProseText,
                    scene,
                    storyObj: storyToUse,
                    activeCast,
                    sequenceData,
                    s,
                    seq,
                    force: false,
                    onEnhanceStart: (audit) => {
                        ctx.setLoadingStep(
                            `Voice Director (${audit.score}/100): Enhancing inline Drama-3 performance cues...`
                        );
                        ctx.showToast(
                            `Audio Drama under-directed (${audit.score}/100) — running Voice Director pass...`,
                            'info'
                        );
                    }
                });
                if (
                    dirRes &&
                    dirRes.status === 'ENHANCED' &&
                    dirRes.prose &&
                    dirRes.prose !== finalProseText &&
                    dirRes.beforeAudit &&
                    dirRes.afterAudit
                ) {
                    finalProseText = dirRes.prose;
                    ctx.logPipelineValidation(
                        `Voice Director Surgical Pass (Sequence ${seq + 1}, Scene ${s + 1})`,
                        true,
                        `Enhanced Drama-3 directing (${dirRes.appliedCount} edits): Score ${dirRes.beforeAudit.score} -> ${dirRes.afterAudit.score} | Directed ${Math.round(dirRes.beforeAudit.directedRatio * 100)}% -> ${Math.round(dirRes.afterAudit.directedRatio * 100)}% | Pivots ${dirRes.beforeAudit.midLineShiftCount} -> ${dirRes.afterAudit.midLineShiftCount} | XML ${dirRes.beforeAudit.xmlTagCount} -> ${dirRes.afterAudit.xmlTagCount} | Sounds/Pauses ${dirRes.beforeAudit.soundPauseCount} -> ${dirRes.afterAudit.soundPauseCount}.`,
                        null,
                        {
                            tierName: 'Voice Director Surgical Editor',
                            type: 'voice_director_pass',
                            actionTaken: `Applied ${dirRes.appliedCount} inline direction edit(s) via prose model (${dirRes.rejectedCount} rejected by invariance guard).`
                        }
                    );
                    ctx.showToast(
                        `Voice Director enhanced ${dirRes.appliedCount} turn(s) (Score ${dirRes.beforeAudit.score} -> ${dirRes.afterAudit.score})`,
                        'success'
                    );
                } else if (dirRes && dirRes.status === 'SKIPPED_SUFFICIENT' && dirRes.beforeAudit) {
                    ctx.logPipelineValidation(
                        `Voice Director Audit Gate (Sequence ${seq + 1}, Scene ${s + 1})`,
                        true,
                        `Skipped extra LLM call — writer script passed expressiveness threshold (${dirRes.beforeAudit.summary}).`,
                        null,
                        {
                            tierName: 'Voice Director Surgical Editor',
                            type: 'voice_director_skip',
                            actionTaken: 'Expressiveness sufficient; zero extra LLM call needed.'
                        }
                    );
                } else {
                    ctx.logPipelineValidation(
                        `Voice Director Audit Gate (Sequence ${seq + 1}, Scene ${s + 1})`,
                        true,
                        `Voice Director completed (${dirRes?.status || 'NO_IMPROVEMENT'}; ${dirRes?.summary || ''}).`,
                        null,
                        {
                            tierName: 'Voice Director Surgical Editor',
                            type: 'voice_director_gate',
                            actionTaken: 'Retained validated script.'
                        }
                    );
                }
            } catch (dirErr) {
                console.warn(
                    '[writeSceneProse] Voice Director pass warning, continuing with current script:',
                    dirErr
                );
            }
        }

        const proseMetrics = analyzeProseQuality(finalProseText, safeBannedPhrases, {
            slopConfig,
            story: storyToUse as Partial<Story>,
            isAudioDrama: isAudioDramaStory
        });

        if (isAudioDramaStory || isAudioDramaScriptText(finalProseText)) {
            finalProseText = normalizeAudioDramaScript(finalProseText);
        }

        ctx.setLoadingStep('Final Agent: Archiving scene updates (Tier 6.4)...');
        const proseEntry: Record<string, unknown> = {
            final: finalProseText,
            target_words: targetSceneWords,
            pacing_register: sceneTarget?.register?.name || 'BALANCED',
            metrics: proseMetrics,
            failed: false,
            critique: ''
        };
        if (rawDraft && rawDraft !== finalProseText) {
            proseEntry.draft = rawDraft;
        }

        const currentSeqNumForVault = Number(sequenceData?.number || seq + 1 || 1);
        const currentSceneNumForVault = s + 1;

        const preArchivistStory = ctx.setStory((prev) => {
            const nextCharStates = { ...asRecord(prev.character_states) };
            if (Array.isArray(characterStateUpdates)) {
                characterStateUpdates.forEach((u) => {
                    const charName = asString(u?.character_name || u?.character || u?.name);
                    if (charName) {
                        nextCharStates[charName] = {
                            ...asRecord(nextCharStates[charName]),
                            ...u,
                            name: charName,
                            last_updated_scene: sId
                        };
                    }
                });
            }

            const nextSecretVault = Array.isArray(prev.secret_vault)
                ? asArray<Record<string, unknown>>(prev.secret_vault).map((sec) => {
                      const sCopy = { ...sec };
                      const revealAnchor = asRecord(sCopy.reveal_anchor);
                      const revSeq = Number(revealAnchor.sequence_number || 0);
                      const revScene = Number(revealAnchor.scene_number || 1);
                      if (
                          revSeq === currentSeqNumForVault &&
                          (revScene === currentSceneNumForVault ||
                              revScene <= 0 ||
                              Number(sCopy.reveal_target_sequence) === currentSeqNumForVault)
                      ) {
                          sCopy.status = 'revealed';
                      }
                      if (Array.isArray(sCopy.clue_schedule)) {
                          const updatedSchedule = asArray<Record<string, unknown>>(
                              sCopy.clue_schedule
                          ).map((clue) => {
                              if (
                                  Number(clue.sequence_number) === currentSeqNumForVault &&
                                  (Number(clue.scene_number || 1) === currentSceneNumForVault ||
                                      !clue.scene_number)
                              ) {
                                  return { ...clue, seeded_in_prose: true };
                              }
                              return clue;
                          });
                          sCopy.clue_schedule = updatedSchedule;
                          if (
                              updatedSchedule.some((c) => Boolean(c.seeded_in_prose)) &&
                              sCopy.status === 'dormant'
                          ) {
                              sCopy.status = 'seeded';
                          }
                      }
                      return sCopy;
                  })
                : [];

            const prevScenesMap = asRecord(prev.scenes);
            const prevSeqScenesRaw = asArray<Record<string, unknown>>(prevScenesMap[`${seq}`]);
            const prevSeqScenes = [...(prevSeqScenesRaw.length > 0 ? prevSeqScenesRaw : scenesList)];
            if (sceneExitHook && prevSeqScenes[s]) {
                prevSeqScenes[s] = {
                    ...prevSeqScenes[s],
                    exit_hook: sceneExitHook
                };
            }

            const nextBeats = { ...asRecord(prev.beats) };
            if (!nextBeats[sId] && beats && beats.length > 0) {
                nextBeats[sId] = beats;
            }

            return {
                ...prev,
                secret_vault: nextSecretVault,
                scenes: {
                    ...prevScenesMap,
                    [`${seq}`]: prevSeqScenes
                },
                beats: nextBeats,
                prose: {
                    ...asRecord(prev.prose),
                    [sId]: proseEntry
                },
                character_states: nextCharStates
            };
        });

        let archivedStory = await runArchivistForScene(ctx, preArchivistStory, seq, s);

        if (asString(archivedStory.writing_mode) === 'audio_drama' && finalProseText) {
            const draftedScriptChunks = parseAudioDramaScript(finalProseText);
            archivedStory = ensureAudioDramaVoicesRegistered(
                draftedScriptChunks,
                archivedStory as AudioStoryLike
            ) as unknown as PipelineStory;
        }

        const finalMergedProseStory = ctx.setStory((prev) => {
            const prevCast = asArray<Record<string, unknown>>(prev.cast);
            const archCast = asArray<Record<string, unknown>>(archivedStory.cast);
            const baseCast = archCast.length > 0 ? archCast : prevCast;
            const userEditedMap = asRecord(prev.user_edited);

            const mergedCast: Record<string, unknown>[] = baseCast.map(
                (c, cIdx): Record<string, unknown> => {
                const cName = asString(c.name);
                const prevChar =
                    prevCast.find((pc) => asString(pc.name) === cName) || prevCast[cIdx];
                const resolvedSeed =
                    prevChar?.voice_seed ||
                    c.voice_seed ||
                    getDeterministicVoiceSeed({ name: cName }, prev as AudioStoryLike);
                const isRefTextEdited = Boolean(
                    prevChar?.user_edited_reference_text ||
                        userEditedMap[`cast.${cIdx}.reference_text`] ||
                        userEditedMap[`cast.${cName}.reference_text`]
                );
                const resolvedRefText = isRefTextEdited
                    ? asString(prevChar?.reference_text) || asString(c.reference_text)
                    : asString(c.reference_text) || asString(prevChar?.reference_text);
                const isCharEdited =
                    prevChar &&
                    Boolean(
                        prevChar.is_user_edited ||
                            prevChar.user_edited ||
                            prevChar.user_edited_goals ||
                            prevChar.user_edited_cadence ||
                            prevChar.user_edited_flaw ||
                            prevChar.user_edited_role ||
                            prevChar.user_edited_reference_text ||
                            userEditedMap[`cast.${cIdx}.goals`] ||
                            userEditedMap[`cast.${cName}.goals`] ||
                            userEditedMap[`cast.${cIdx}.core_desire`] ||
                            userEditedMap[`cast.${cName}.core_desire`] ||
                            userEditedMap[`cast.${cIdx}.vocal_cadence`] ||
                            userEditedMap[`cast.${cName}.vocal_cadence`] ||
                            userEditedMap[`cast.${cIdx}.reference_text`] ||
                            userEditedMap[`cast.${cName}.reference_text`] ||
                            userEditedMap[`cast.${cIdx}.role`] ||
                            userEditedMap[`cast.${cName}.role`] ||
                            userEditedMap[`cast.${cIdx}.flaw`] ||
                            userEditedMap[`cast.${cName}.flaw`]
                    );

                if (isCharEdited && prevChar) {
                    const prevDetails = asRecord(prevChar.details);
                    const archDetails = asRecord(c.details);
                    const roleLocked = Boolean(
                        prevChar.user_edited_role ||
                            userEditedMap[`cast.${cIdx}.role`] ||
                            userEditedMap[`cast.${cName}.role`]
                    );
                    const goalsLocked = Boolean(
                        prevChar.user_edited_goals ||
                            userEditedMap[`cast.${cIdx}.goals`] ||
                            userEditedMap[`cast.${cName}.goals`]
                    );
                    const flawLocked = Boolean(
                        prevChar.user_edited_flaw ||
                            userEditedMap[`cast.${cIdx}.flaw`] ||
                            userEditedMap[`cast.${cName}.flaw`]
                    );
                    const cadenceLocked = Boolean(
                        prevChar.user_edited_cadence ||
                            userEditedMap[`cast.${cIdx}.vocal_cadence`] ||
                            userEditedMap[`cast.${cName}.vocal_cadence`]
                    );
                    return {
                        ...prevChar,
                        ...c,
                        role: roleLocked ? prevChar.role : c.role || prevChar.role,
                        core_desire: goalsLocked
                            ? prevChar.core_desire || prevDetails.goals
                            : c.core_desire || prevChar.core_desire,
                        core_flaw: flawLocked
                            ? prevChar.core_flaw
                            : c.core_flaw || prevChar.core_flaw,
                        vocal_cadence: cadenceLocked
                            ? prevChar.vocal_cadence
                            : c.vocal_cadence || prevChar.vocal_cadence,
                        voice_seed: resolvedSeed,
                        ...(resolvedRefText ? { reference_text: resolvedRefText } : {}),
                        user_edited_cadence: cadenceLocked,
                        user_edited_reference_text: isRefTextEdited,
                        details: {
                            ...archDetails,
                            ...prevDetails,
                            history: asString(archDetails.history) || asString(prevDetails.history),
                            story_events:
                                asString(archDetails.story_events) ||
                                asString(prevDetails.story_events),
                            goals: goalsLocked
                                ? asString(prevDetails.goals) || asString(prevChar.core_desire)
                                : asString(archDetails.goals) || asString(prevDetails.goals)
                        },
                        is_user_edited: true,
                        user_edited: true
                    };
                }
                return {
                    ...(prevChar || {}),
                    ...c,
                    voice_seed: resolvedSeed,
                    ...(resolvedRefText ? { reference_text: resolvedRefText } : {})
                };
            });

            prevCast.forEach((pc) => {
                const pcName = asString(pc.name);
                if (pc && pcName && !mergedCast.some((mc) => asString(mc.name) === pcName)) {
                    mergedCast.push(pc);
                }
            });

            const prevLore = Array.isArray(prev.lore) ? [...asArray<Record<string, unknown>>(prev.lore)] : [];
            asArray<Record<string, unknown>>(archivedStory.lore).forEach((al) => {
                if (!al || !al.topic) return;
                const existingIdx = prevLore.findIndex(
                    (pl) =>
                        pl &&
                        (pl.topic === al.topic ||
                            (al.merged_from_topic && pl.topic === al.merged_from_topic))
                );
                if (existingIdx !== -1) {
                    if (al.is_merged) {
                        prevLore[existingIdx] = { ...prevLore[existingIdx], ...al };
                    }
                } else {
                    prevLore.push(al);
                }
            });

            const archProseKey = `${seq}-${s}`;
            const archProseEntry = asOptionalRecord(asRecord(archivedStory.prose)[archProseKey]);
            const prevProseMap = asRecord(prev.prose);
            const mergedProse =
                archProseEntry?.final && prevProseMap[archProseKey]
                    ? {
                          ...prevProseMap,
                          [archProseKey]: {
                              ...asRecord(prevProseMap[archProseKey]),
                              final: archProseEntry.final,
                              draft: archProseEntry.draft || archProseEntry.final
                          }
                      }
                    : prevProseMap;

            return {
                ...prev,
                cast: mergedCast,
                prose: mergedProse,
                lore: prevLore,
                narrator_vocal_cadence:
                    prev.narrator_vocal_cadence || archivedStory.narrator_vocal_cadence || '',
                narrator_voice_seed:
                    prev.narrator_voice_seed ||
                    archivedStory.narrator_voice_seed ||
                    getDeterministicVoiceSeed('Narrator', prev as AudioStoryLike),
                narrator_reference_text:
                    prev.narrator_reference_text || archivedStory.narrator_reference_text || '',
                character_states: {
                    ...asRecord(prev.character_states),
                    ...asRecord(archivedStory.character_states)
                },
                relationships: {
                    ...asRecord(prev.relationships),
                    ...asRecord(archivedStory.relationships)
                },
                continuity_ledger: archivedStory.continuity_ledger || prev.continuity_ledger || [],
                knowledge_graph: archivedStory.knowledge_graph ||
                    prev.knowledge_graph || { nodes: [], edges: [] },
                epistemic_graph: archivedStory.epistemic_graph || prev.epistemic_graph,
                secret_vault: archivedStory.secret_vault || prev.secret_vault || [],
                event_log: archivedStory.event_log || prev.event_log || []
            };
        });

        const mergedId = asString(finalMergedProseStory.id);
        if (mergedId) {
            try {
                await storyStore.saveStory(mergedId, finalMergedProseStory);
            } catch (saveErr) {
                console.warn('Failed saving written prose to store:', saveErr);
            }
        }

        ctx.showToast('Full scene prose generated successfully!', 'success');
        return finalMergedProseStory;
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error('Scene prose writing failed:', e);
        ctx.showToast(`Scene prose writing failed: ${msg}`, 'error');
        if (!autoP) {
            if (ctx.notifyAlert) ctx.notifyAlert(`Scene prose writing failed: ${msg}`);
            else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(`Scene prose writing failed: ${msg}`);
            }
        }
        throw e;
    } finally {
        if (!autoP) ctx.setLoading(false);
    }
}

/** Ensures target scene blueprint exists (planning sequence scenes if missing) and drafts its prose. */
export async function handleAutoGenerateScene(
    ctx: PipelineRuntimeContext,
    seqIdx?: number | null,
    sceneIdx?: number | null,
    options: AutoGenerateSceneOptions | boolean = {}
): Promise<void> {
    let seq = seqIdx;
    let s = sceneIdx;
    const selSeq = ctx.getSelectedSequence?.() ?? 0;
    const selSc = ctx.getSelectedScene?.() ?? 0;
    if (s === undefined && seq !== undefined) {
        s = seq;
        seq = selSeq !== null ? selSeq : 0;
    }
    if (seq === undefined || seq === null) seq = selSeq !== null ? selSeq : 0;
    if (s === undefined || s === null) s = selSc !== null ? selSc : 0;

    const isForceFullRewrite =
        typeof options === 'boolean'
            ? options
            : options && typeof options === 'object' && options.forceFullRewrite !== undefined
              ? Boolean(options.forceFullRewrite)
              : true;

    try {
        ctx.setLoading(true);
        let currentStory = ctx.getStory();
        const isAudioDrama = asString(currentStory?.writing_mode) === 'audio_drama';
        ctx.setLoadingStep(
            isForceFullRewrite
                ? isAudioDrama
                    ? `Writing full audio drama script rewrite for Sequence ${seq + 1}, Scene ${s + 1}...`
                    : `Writing full scene rewrite for Sequence ${seq + 1}, Scene ${s + 1}...`
                : isAudioDrama
                  ? `Writing audio drama script for Sequence ${seq + 1}, Scene ${s + 1}...`
                  : `Writing prose for Sequence ${seq + 1}, Scene ${s + 1}...`
        );

        const getScenesForSeq = (st: PipelineStory, qIdx: number) => {
            const sMap = asRecord(st.scenes);
            return asArray(
                sMap[`${qIdx}`] || sMap[`${qIdx}-0`] || sMap[`0-${qIdx}`] || sMap['0-0']
            );
        };

        let scenesList = getScenesForSeq(currentStory, seq);
        if (scenesList.length === 0) {
            console.log(`[Auto-Write] Generating missing scenes for sequence ${seq}...`);
            await generateScenes(ctx, seq, currentStory, true);
            currentStory = ctx.getStory();
            scenesList = getScenesForSeq(currentStory, seq);
        }

        if (scenesList.length === 0 || !scenesList[s]) {
            throw new Error(`Scene ${s + 1} not found in Sequence ${seq + 1}.`);
        }

        await writeSceneProse(ctx, seq, s, currentStory, false, '', {
            forceFullRewrite: isForceFullRewrite
        });
        ctx.showToast(
            isForceFullRewrite
                ? isAudioDrama
                    ? 'Audio Drama Script Fully Rewritten!'
                    : 'Scene Fully Rewritten!'
                : isAudioDrama
                  ? 'Audio Drama Script Written!'
                  : 'Scene Auto-Written!'
        );
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error(e);
        if (ctx.notifyAlert) ctx.notifyAlert(`Auto-Write Error: ${msg}`);
        else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`Auto-Write Error: ${msg}`);
        }
    } finally {
        ctx.setLoading(false);
    }
}
