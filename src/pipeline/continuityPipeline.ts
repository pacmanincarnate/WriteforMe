/**
 * @module pipeline/continuityPipeline
 * Retroactive State Injection (RSI), secret clue seeding, upstream entity name repair,
 * Tier 6.4 Scene Archivist, and Tier 0.2 Character Profile/Interview orchestration.
 */

import {
    cleanCharacterNameFromVoiceProfile,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    isAudioDramaScriptText,
    isValidQwenVoiceProfile,
    normalizeAudioDramaScript,
    synthesizeQwenVoiceDesignProfile,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import {
    buildFallbackSceneDelta,
    ensureEpistemicGraph,
    formatArchivistBlueprintContext,
    renderStorySoFar,
    resolveSequenceParentAct,
    sanitizeScenePlotDelta,
    upsertSceneMemoryDelta,
    type ContinuityStoryState,
    type WorldUpdatesPayload
} from '@/domain/continuity';
import { computeChangeRatio, SURGICAL_MAX_CHANGE_RATIO } from '@/domain/editing';
import {
    applyCascadingNameReplacements as domainApplyCascadingNameReplacements,
    auditEntityNamesAndPlaces as domainAuditEntityNamesAndPlaces,
    FALLBACK_GROUNDED_NAMES,
    FALLBACK_GROUNDED_PLACES
} from '@/domain/slop';
import {
    actForSequence,
    buildGenreToneBlocks,
    buildRelationshipFrictionBlock,
    formatLoreForPrompt,
    getSceneActiveCast,
    type ActiveCastMember
} from '@/domain/story';
import { getSurgicalPromptForMode, PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type {
    CastMember,
    EntityNameViolation,
    LoreItem,
    SceneBlueprint
} from '@/types';
import { decodeXmlEntities, extractTag } from '@/utils';
import {
    asArray,
    asNumber,
    asOptionalRecord,
    asRecord,
    asString,
    asStringArray,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { handleWorldUpdates } from './lorePipeline';
import { applySurgicalEditsWithRetry } from './surgicalPatch';

export interface RsiSlotResult {
    slot: {
        seqIdx: number;
        sceneIdx: number;
        sId: string;
        prose: string;
        sceneTitle: string;
        seqNumber: number;
    };
    item: string;
}

export interface RepairBannedEntitiesParams {
    violations?: EntityNameViolation[];
    existingNames?: string[];
    storyContext?: string;
    story?: PipelineStory | null;
}

export interface RepairBannedEntitiesResult {
    renameMap: Record<string, string>;
    usedFallback: boolean;
    remainingViolations: EntityNameViolation[];
}

export interface CharacterProfileResult {
    deep_profile: string;
    vocal_cadence: string;
    core_yearning: string;
}

function getAuditFn(ctx: PipelineRuntimeContext) {
    return ctx.auditEntityNamesAndPlaces || domainAuditEntityNamesAndPlaces;
}

function getCascadeReplaceFn(ctx: PipelineRuntimeContext) {
    return ctx.applyCascadingNameReplacements || domainApplyCascadingNameReplacements;
}

function cascadeStringFields(
    obj: unknown,
    renameMap: Record<string, string>,
    replaceFn: (text: string, map: Record<string, string>) => string
): unknown {
    if (!obj || typeof obj !== 'object' || !renameMap || Object.keys(renameMap).length === 0) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => cascadeStringFields(item, renameMap, replaceFn));
    }
    const copy: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    Object.keys(record).forEach((k) => {
        const val = record[k];
        if (typeof val === 'string') copy[k] = replaceFn(val, renameMap);
        else if (val && typeof val === 'object') {
            copy[k] = cascadeStringFields(val, renameMap, replaceFn);
        } else {
            copy[k] = val;
        }
    });
    return copy;
}

/** TIER 6.3: Retroactive State Injection (RSI) for missing character items/facts. */
export async function checkAndExecuteRSI(
    ctx: PipelineRuntimeContext,
    reason: string,
    currentStory: PipelineStory
): Promise<RsiSlotResult | null> {
    const match = reason.match(/([a-zA-Z\s]+)\s+(?:does not possess|lacks|needs|missing)\s+\[(.*?)\]/i);
    if (!match) return null;

    const charName = match[1].trim();
    const item = match[2].trim();

    ctx.showToast(
        `RSI: Triggered for ${charName} lacking [${item}]. Finding open context slot...`,
        'info'
    );

    let openSlot: RsiSlotResult['slot'] | null = null;
    const sequences = asArray<Record<string, unknown>>(currentStory.sequences);
    const scenesMap = asRecord(currentStory.scenes);
    const proseMap = asRecord(currentStory.prose);

    for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
        const sequence = asRecord(sequences[seqIdx]);
        const scenes = asArray<Record<string, unknown>>(scenesMap[`${seqIdx}`]);
        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
            const scene = asRecord(scenes[sceneIdx]);
            const sId = `${seqIdx}-${sceneIdx}`;

            const rawCast = scene.cast_names ?? scene.characters_present;
            const sCast = Array.isArray(rawCast) ? rawCast : asStringArray(rawCast);
            const hasChar = sCast.some((c) => {
                if (typeof c === 'string') return c.toLowerCase() === charName.toLowerCase();
                const cRec = asOptionalRecord(c);
                const cName = asString(cRec?.name);
                return Boolean(cName && cName.toLowerCase() === charName.toLowerCase());
            });
            if (hasChar) {
                const proseEntry = asOptionalRecord(proseMap[sId]);
                const finalText = asString(proseEntry?.final);
                if (finalText) {
                    openSlot = {
                        seqIdx,
                        sceneIdx,
                        sId,
                        prose: finalText,
                        sceneTitle: asString(scene.title),
                        seqNumber: Number(sequence.number || seqIdx + 1)
                    };
                    break;
                }
            }
        }
        if (openSlot) break;
    }

    if (!openSlot) {
        console.warn(`RSI: No open context slot found for ${charName} to acquire [${item}].`);
        return null;
    }

    ctx.setLoadingStep(
        `RSI: Injecting [${item}] into Sequence ${openSlot.seqNumber}, Scene ${openSlot.sceneIdx + 1}...`
    );

    const isAudioMode =
        asString(currentStory.writing_mode) === 'audio_drama' || isAudioDramaScriptText(openSlot.prose);
    const sysPrompt = getSurgicalPromptForMode(PROMPTS.rsiPrompt, isAudioMode);
    const rsiUserPrompt = `<original_text>
${openSlot.prose}
</original_text>

<injection_mandate>
Seamlessly insert the following detail: "Seamlessly include an action where ${charName} acquires or pockets the item: "${item}"."
Ensure this is done subtly (e.g. pocketing an item, glancing at a document, mentioning a fact). Do not change the scene's emotional climax or outcome.
</injection_mandate>

BEGIN RETROACTIVE STATE INJECTION`;
    const rsiOutput = await ctx.callAI(
        rsiUserPrompt,
        sysPrompt,
        false,
        'Surgical RSI Injector',
        'review'
    );
    const surgicalReport = await applySurgicalEditsWithRetry(ctx, {
        originalText: openSlot.prose,
        blocksText: rsiOutput,
        systemPrompt: sysPrompt,
        logName: 'Surgical RSI Injector',
        modelSize: 'review'
    });
    if (!surgicalReport.applied.length) {
        console.warn('RSI: no surgical edits could be applied');
        return null;
    }
    const newProse = isAudioMode ? normalizeAudioDramaScript(surgicalReport.text) : surgicalReport.text;
    const changeRatio = computeChangeRatio(openSlot.prose, newProse);
    if (changeRatio > SURGICAL_MAX_CHANGE_RATIO) {
        console.warn(
            `Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`
        );
        return null;
    }

    const sceneIdStr = `${openSlot.seqNumber}.${openSlot.sceneIdx + 1}`;
    const newEdge = {
        source: charName,
        target: item,
        relation: 'HAS',
        learned_in_scene: sceneIdStr,
        context: `Surgically injected into Sequence ${openSlot.seqNumber}, Scene ${openSlot.sceneIdx + 1}`
    };

    const resolvedSlot = openSlot;
    ctx.setStory((prev) => {
        const nextProse = { ...asRecord(prev.prose) };
        nextProse[resolvedSlot.sId] = {
            ...asRecord(nextProse[resolvedSlot.sId]),
            final: newProse
        };

        const nextBeats = { ...asRecord(prev.beats) };
        const existingSceneBeats = asArray<Record<string, unknown>>(nextBeats[resolvedSlot.sId]);
        if (existingSceneBeats.length > 0) {
            const beat = { ...existingSceneBeats[0] };
            const note = `[Metadata RSI: ${charName} acquires ${item}]`;
            const beatDesc = asString(beat.description);
            if (!beatDesc.includes(note)) {
                beat.description = `${beatDesc.trim()} ${note}`;
            }
            const clonedBeats = [...existingSceneBeats];
            clonedBeats[0] = beat;
            nextBeats[resolvedSlot.sId] = clonedBeats;
        }

        const nextEdges = [...asArray(prev.graph_edges), newEdge];
        return {
            ...prev,
            prose: nextProse,
            beats: nextBeats,
            graph_edges: nextEdges
        };
    });

    ctx.showToast(surgicalReport.summary, surgicalReport.failed.length ? 'warning' : 'success');
    return { slot: openSlot, item };
}

/** Retroactively injects a secret clue directive into preceding drafted scene prose via RSI. */
export async function retroactivelyInjectClue(
    ctx: PipelineRuntimeContext,
    secretId: string,
    clueIdx: number,
    currentStory: PipelineStory = ctx.getStory()
): Promise<{
    slot: RsiSlotResult['slot'];
    newProse: string;
} | null> {
    if (!currentStory || !Array.isArray(currentStory.secret_vault)) {
        ctx.showToast('No secret vault found in story.', 'error');
        return null;
    }
    const secretVault = asArray<Record<string, unknown>>(currentStory.secret_vault);
    const secret = secretVault.find((s) => asString(s.id) === secretId);
    if (!secret) {
        ctx.showToast(`Secret "${secretId}" not found in vault.`, 'error');
        return null;
    }
    const clueList = Array.isArray(secret.clue_schedule)
        ? asArray<Record<string, unknown>>(secret.clue_schedule)
        : asArray<Record<string, unknown>>(secret.clues);
    const clue = asOptionalRecord(clueList[clueIdx]);
    if (!clue) {
        ctx.showToast('Specified clue not found on secret.', 'error');
        return null;
    }
    if (clue.seeded_in_prose) {
        ctx.showToast('This clue is already marked as seeded in prose.', 'info');
        return null;
    }

    const targetSeqNum = Number(clue.sequence_number || 2);
    let openSlot: RsiSlotResult['slot'] | null = null;
    const sequences = asArray<Record<string, unknown>>(currentStory.sequences);
    const seqIdx = sequences.findIndex((sq) => Number(sq.number) === targetSeqNum);
    const actualSeqIdx = seqIdx !== -1 ? seqIdx : targetSeqNum - 1;
    const scenesMap = asRecord(currentStory.scenes);
    const proseMap = asRecord(currentStory.prose);
    const scenes = asArray<Record<string, unknown>>(scenesMap[String(actualSeqIdx)]);

    for (let scIdx = 0; scIdx < scenes.length; scIdx++) {
        const scene = asRecord(scenes[scIdx]);
        const sId = `${actualSeqIdx}-${scIdx}`;
        const proseObj = asOptionalRecord(proseMap[sId]);
        const proseContent = asString(proseObj?.final) || asString(proseObj?.prose);
        if (proseObj && proseContent) {
            openSlot = {
                seqIdx: actualSeqIdx,
                sceneIdx: scIdx,
                sId,
                prose: proseContent,
                sceneTitle: asString(scene.title),
                seqNumber: targetSeqNum
            };
            break;
        }
    }

    if (!openSlot) {
        ctx.showToast(
            `No drafted prose found in Sequence ${targetSeqNum} to inject clue into.`,
            'warning'
        );
        return null;
    }

    ctx.setLoading(true);
    ctx.setLoadingStep(
        `RSI: Surgically injecting clue into Sequence ${openSlot.seqNumber}, Scene ${openSlot.sceneIdx + 1}...`
    );

    try {
        const isAudioMode =
            asString(currentStory.writing_mode) === 'audio_drama' ||
            isAudioDramaScriptText(openSlot.prose);
        const sysPrompt = getSurgicalPromptForMode(PROMPTS.rsiPrompt, isAudioMode);
        const rsiUserPrompt = `<original_text>
${openSlot.prose}
</original_text>

<injection_mandate>
Seamlessly insert the following subtle behavioral action or environmental detail:
"${asString(clue.behavioral_directive)}"
(Narrative Motivation/Cover Reason: ${asString(clue.benign_reason) || 'Natural character habit or circumstance'})

Ensure this is integrated seamlessly and naturally into the existing action without changing the scene's emotional climax, dialogue balance, or outcome.
</injection_mandate>

BEGIN RETROACTIVE STATE INJECTION`;

        const rsiOutput = await ctx.callAI(
            rsiUserPrompt,
            sysPrompt,
            false,
            'Surgical Secret Clue Injector',
            'review'
        );
        const surgicalReport = await applySurgicalEditsWithRetry(ctx, {
            originalText: openSlot.prose,
            blocksText: rsiOutput,
            systemPrompt: sysPrompt,
            logName: 'Surgical Secret Clue Injector',
            modelSize: 'review'
        });

        if (!surgicalReport.applied.length) {
            ctx.showToast('RSI: Could not apply surgical edits cleanly.', 'warning');
            return null;
        }

        const newProse = isAudioMode
            ? normalizeAudioDramaScript(surgicalReport.text)
            : surgicalReport.text;
        const changeRatio = computeChangeRatio(openSlot.prose, newProse);
        if (changeRatio > SURGICAL_MAX_CHANGE_RATIO) {
            ctx.showToast(
                `RSI rejected: Would alter ${(changeRatio * 100).toFixed(0)}% of the scene (limit 60%).`,
                'warning'
            );
            return null;
        }

        const updatedVault = secretVault.map((s) => {
            if (asString(s.id) !== secretId) return s;
            const existingClues = Array.isArray(s.clue_schedule)
                ? asArray<Record<string, unknown>>(s.clue_schedule)
                : asArray<Record<string, unknown>>(s.clues);
            const sClues = existingClues.map((c, i) =>
                i === clueIdx ? { ...c, seeded_in_prose: true } : c
            );
            return {
                ...s,
                status: s.status === 'dormant' ? 'seeded' : s.status,
                clue_schedule: sClues
            };
        });

        const resolvedSlot = openSlot;
        ctx.setStory((prev) => {
            const nextProse = { ...asRecord(prev.prose) };
            nextProse[resolvedSlot.sId] = {
                ...asRecord(nextProse[resolvedSlot.sId]),
                final: newProse
            };
            const merged: PipelineStory = {
                ...prev,
                prose: nextProse,
                secret_vault: updatedVault
            };
            const mergedId = asString(merged.id);
            if (mergedId) {
                storyStore.saveStory(mergedId, merged).catch((err) => {
                    console.warn('Failed saving RSI clue prose:', err);
                });
            }
            return merged;
        });

        ctx.showToast(
            `Surgically seeded clue into Sequence ${openSlot.seqNumber}, Scene ${openSlot.sceneIdx + 1}!`,
            'success'
        );
        return { slot: openSlot, newProse };
    } catch (err) {
        console.error('Retroactive clue injection error:', err);
        ctx.showToast(`Failed to inject clue: ${extractErrorMessage(err)}`, 'error');
        return null;
    } finally {
        ctx.setLoading(false);
    }
}

/** Repairs flagged banned entity/place names using AI with deterministic grounded fallback. */
export async function repairBannedEntitiesWithAI(
    ctx: PipelineRuntimeContext,
    {
        violations = [],
        existingNames = [],
        storyContext = '',
        story: ctxStory = null
    }: RepairBannedEntitiesParams = {}
): Promise<RepairBannedEntitiesResult> {
    if (!Array.isArray(violations) || violations.length === 0) {
        return { renameMap: {}, usedFallback: false, remainingViolations: [] };
    }
    const renameMap: Record<string, string> = {};
    const usedNamesLower = new Set(
        (existingNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
    );
    let pending: EntityNameViolation[] = violations.slice();
    const auditFn = getAuditFn(ctx);
    const slopConfig = ctx.getSlopConfig();

    const parseReplaceTags = (xmlText: string): Record<string, string> => {
        const pairs: Record<string, string> = {};
        if (!xmlText || typeof xmlText !== 'string') return pairs;
        const rx = /<replace\b([^>]*?)(?:\/>|>\s*<\/replace>)/gi;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(xmlText)) !== null) {
            const attrs = m[1] || '';
            const oldM = attrs.match(/\bold\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
            const newM = attrs.match(/\bnew\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
            const oldVal = decodeXmlEntities((oldM && (oldM[1] || oldM[2])) || '').trim();
            const newVal = decodeXmlEntities((newM && (newM[1] || newM[2])) || '').trim();
            if (oldVal && newVal && oldVal.toLowerCase() !== newVal.toLowerCase()) {
                pairs[oldVal] = newVal;
            }
        }
        return pairs;
    };

    for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt++) {
        try {
            const prompt = `<story_context>\n${String(storyContext || '').slice(0, 1400)}\n</story_context>\n<existing_cast_names>\n${Array.from(usedNamesLower).join(', ') || '(none)'}\n</existing_cast_names>\n<flagged_entities>\n${pending.map((v) => `- [${v.entityType || 'character'} | ${v.severity || 'hard'}] "${v.name}" -> ${v.reason}`).join('\n')}\n</flagged_entities>\n${attempt > 1 ? '<retry_note>Previous replacements were still flagged or collided with existing names. Provide fresh, culturally varied, everyday grounded names.</retry_note>\n' : ''}Output ONLY <replacements><replace old="..." new="..." /></replacements>.`;
            const raw = await ctx.callAI(
                prompt,
                PROMPTS.entityNameRepair,
                false,
                `Entity Name Audit & Repair (Attempt ${attempt})`,
                'dev'
            );
            const parsed = parseReplaceTags(raw);
            const nextPending: EntityNameViolation[] = [];
            for (const v of pending) {
                const candidate = parsed[v.name];
                if (!candidate || usedNamesLower.has(candidate.toLowerCase())) {
                    nextPending.push(v);
                    continue;
                }
                const reAudit = auditFn({
                    characters:
                        v.entityType === 'character'
                            ? [{ name: candidate, id: v.id, role: v.role } as CastMember]
                            : [],
                    places: v.entityType === 'place' ? [candidate] : [],
                    existingCast: asArray<CastMember>(ctxStory?.cast),
                    slopConfig,
                    story: ctxStory
                });
                if (reAudit.valid) {
                    renameMap[v.name] = candidate;
                    usedNamesLower.add(candidate.toLowerCase());
                } else {
                    nextPending.push(v);
                }
            }
            pending = nextPending;
        } catch (err) {
            console.warn(`[repairBannedEntitiesWithAI] Attempt ${attempt} failed:`, err);
        }
    }

    let usedFallback = false;
    if (pending.length > 0) {
        const fallbackNames =
            Array.isArray(FALLBACK_GROUNDED_NAMES) && FALLBACK_GROUNDED_NAMES.length > 0
                ? FALLBACK_GROUNDED_NAMES
                : [
                      'Hannah Mercer',
                      'Thomas Callahan',
                      'Nadia Okafor',
                      'David Kowalski',
                      'Miriam Delgado',
                      'Samuel Lindqvist'
                  ];
        const fallbackPlaces =
            Array.isArray(FALLBACK_GROUNDED_PLACES) && FALLBACK_GROUNDED_PLACES.length > 0
                ? FALLBACK_GROUNDED_PLACES
                : ['Alder Street', 'St. Jude Annex', 'Harborview Foundry', 'Eastgate Station'];
        pending.forEach((v) => {
            const pool = v.entityType === 'place' ? fallbackPlaces : fallbackNames;
            let pick = pool.find((item) => !usedNamesLower.has(item.toLowerCase()));
            if (!pick) {
                pick =
                    v.entityType === 'place'
                        ? `District ${usedNamesLower.size + 4} Annex`
                        : `Morgan Ellis ${usedNamesLower.size + 1}`;
            }
            renameMap[v.name] = pick;
            usedNamesLower.add(pick.toLowerCase());
            usedFallback = true;
        });
    }

    return { renameMap, usedFallback, remainingViolations: [] };
}

/** TIER 6.4: Shared scene archivist executed after writing and directive verification. */
export async function runArchivistForScene(
    ctx: PipelineRuntimeContext,
    storyState: PipelineStory,
    seqIdx: number,
    sceneIdx: number
): Promise<PipelineStory> {
    try {
        const scenesMap = asRecord(storyState.scenes);
        const scenesRaw =
            scenesMap[`${seqIdx}`] ||
            scenesMap[`${seqIdx}-0`] ||
            scenesMap[`0-${seqIdx}`] ||
            scenesMap['0-0'] ||
            [];
        const scenes = asArray<Record<string, unknown>>(scenesRaw);
        const scene = asRecord(
            scenes[sceneIdx] || scenes[0] || { title: 'Scene', description: 'Scene', cast_names: [] }
        );
        const sequences = asArray<Record<string, unknown>>(storyState.sequences);
        const sequenceData = asRecord(
            sequences[seqIdx] || { number: seqIdx + 1, parent_act: actForSequence(seqIdx + 1) }
        );
        const proseMap = asRecord(storyState.prose);
        const finalProseText = asString(asOptionalRecord(proseMap[`${seqIdx}-${sceneIdx}`])?.final);
        const castList = asArray<ActiveCastMember>(storyState.cast);
        const activeCast = getSceneActiveCast(scene as SceneBlueprint & Record<string, unknown>, castList);
        const currentLoreList = asArray<Record<string, unknown>>(storyState.lore)
            .map((l) => asString(l.topic))
            .filter(Boolean)
            .join(', ');
        const archivistBlueprint = formatArchivistBlueprintContext(scene);
        const targetDeltas = asArray(scene.target_epistemic_deltas);
        const epistemicContractBlock =
            targetDeltas.length > 0
                ? `<target_epistemic_deltas>\n${JSON.stringify(targetDeltas, null, 2)}\n</target_epistemic_deltas>\n`
                : '';
        const epGraphForArchivist = ensureEpistemicGraph(storyState as ContinuityStoryState);
        const activePropsList = Object.values(epGraphForArchivist.propositions || {})
            .slice(0, 20)
            .map((p) => `- ${p.id}: "${p.claim_text}" (Truth: ${p.objective_truth})`)
            .join('\n');
        const activePropsBlock = activePropsList
            ? `<active_epistemic_propositions>\n${activePropsList}\n</active_epistemic_propositions>\n`
            : '';

        const archivistPrompt = `<output_format_description>
FORMATTING DIRECTIVE: Output format must be strictly valid JSON. Do not write markdown code blocks, preamble, or explanations. Start directly with '{' and end with '}'.

Output Schema:
{
  "scene_synopsis": "2-3 concise narrative sentences (35-65 words) summarizing ONLY the key plot actions, causal turns, and irreversible character or relationship shifts dramatized in this scene. Name characters explicitly; omit room-by-room blocking and atmospheric description.",
  "cast_updates": [
    {
      "name": "Character Name",
      "append_history": "Backstory revealed in the scene to append.",
      "append_story_events": "New narrative events from the scene to append.",
      "update_goals": "How their active yearning, emotional drive, or personal stakes deepened or evolved in this scene (focus on human drive rather than a dry task checklist)."
    }
  ],
  "new_characters": [
    {
      "name": "New Character Name",
      "role": "Their role (e.g. Ally, Antagonist, Witness)",
      "details": {
        "history": "their backstory",
        "story_events": "their initial scene events",
        "goals": "their core yearning and motivation"
      }
    }
  ],
  "lore_updates": [
    {
      "topic": "Category (e.g. History, Lore, Magic, Object, Rule, Character Appearance)",
      "detail": "Objective, encyclopedic description of the newly established fact."
    }
  ],
  "continuity_facts": [
    {
      "category": "Appearance | Object | Place | Opinion | Agreement",
      "key": "Specific Subject (e.g. Elara Hair Color)",
      "detail": "Concrete detail established in the prose text.",
      "character": "Character Name or entity"
    }
  ],
  "relationship_updates": [
    {
      "from": "Character A",
      "to": "Character B",
      "new_feeling": "New relationship dynamic",
      "trigger": "Scene event that triggered this shift"
    }
  ],
  "character_state_updates": [
    {
      "name": "Character Name",
      "physical_state": "Physical condition, injuries, fatigue, posture, or physical status at scene end.",
      "emotional_state": "Core emotional state, feelings, or mood at scene end (e.g. Guarded, Elated, Betrayed, Suspicious, Determined).",
      "unresolved_tension": "Specific lingering psychological conflict, unanswered question, dilemma, or interpersonal friction carrying forward.",
      "location": "Physical location where this character ended the scene."
    }
  ],
  "epistemic_transitions": [
    {
      "operation": "ACQUIRE | ELEVATE_SUSPICION | INVALIDATE",
      "holder_id": "Character Name",
      "proposition_id": "Matching proposition ID from <active_epistemic_propositions> (or omit if brand new claim)",
      "new_claim_text": "Concrete statement if a brand new fact, secret, or belief was formed in this scene",
      "stance": "BELIEVES_TRUE | SUSPECTS_TRUE | DOUBTS | BELIEVES_FALSE",
      "confidence": 0.45,
      "source_type": "DIRECT_OBSERVATION | TOLD_BY_AGENT | INFERRED",
      "source_agent_id": "Character Name who stated this claim (if source_type is TOLD_BY_AGENT)",
      "exposed_liar_agent_id": "Character Name proven on-page to have lied (triggers provenance cascade)",
      "evidence_summary": "Specific physical observation or dialogue exchange that caused this belief shift"
    }
  ]
}
CRITICAL MANDATE: For EVERY character listed in <cast_list> who participated in or was present during this scene, you MUST output their updated "character_state_updates" capturing their real-time emotional state, unresolved tension, physical condition, and location at the conclusion of the scene.
</output_format_description>

<current_lore_topics>
${currentLoreList}
</current_lore_topics>
${activePropsBlock}<cast_list>
${activeCast.map((ch) => ch.name).join(', ')}
</cast_list>
${archivistBlueprint ? `${archivistBlueprint}\n` : ''}${epistemicContractBlock}<scene_text>
${finalProseText}
</scene_text>

BEGIN EXTRACTING SCENE ARCHIVE FACTS
`;
        const rawArchivistOutput = await ctx.callAI(
            archivistPrompt,
            PROMPTS.archivist,
            false,
            'Archivist',
            'review'
        );
        interface ArchivistUpdatesPayload extends WorldUpdatesPayload {
            new_characters?: Array<CastMember & Record<string, unknown>>;
            lore_updates?: Array<{ topic?: string; detail?: string }>;
            epistemic_transitions?: Array<Record<string, unknown>>;
        }
        let updates: ArchivistUpdatesPayload | null = null;

        if (rawArchivistOutput) {
            const jsonStr =
                extractTag(rawArchivistOutput, 'archived_facts') ||
                extractTag(rawArchivistOutput, 'response');
            if (jsonStr) {
                try {
                    updates = JSON.parse(jsonStr.trim()) as ArchivistUpdatesPayload;
                } catch (e) {
                    console.warn('Failed to parse tagged archivist JSON, attempting fallback:', e);
                }
            }
            if (!updates) {
                try {
                    const cleaned = rawArchivistOutput
                        .replace(/^```json\s*/i, '')
                        .replace(/^```\s*/i, '')
                        .replace(/```\s*$/i, '')
                        .trim();
                    const firstBrace = cleaned.indexOf('{');
                    const lastBrace = cleaned.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        updates = JSON.parse(
                            cleaned.substring(firstBrace, lastBrace + 1)
                        ) as ArchivistUpdatesPayload;
                    }
                } catch (e) {
                    console.warn('Archivist direct JSON parse failed:', e);
                }
            }
        }

        if (updates) {
            let archStoryState = storyState;
            let effectiveUpdates: ArchivistUpdatesPayload = updates;
            const slopConfig = ctx.getSlopConfig();
            const newChars = asArray<CastMember & Record<string, unknown>>(updates.new_characters);

            if (
                newChars.length > 0 &&
                slopConfig?.enableSlopAudit !== false &&
                slopConfig?.enableUpstreamNameAudit !== false
            ) {
                try {
                    const auditFn = getAuditFn(ctx);
                    const archAudit = auditFn({
                        characters: newChars,
                        existingCast: asArray<CastMember>(storyState.cast),
                        slopConfig,
                        story: storyState
                    });
                    if (!archAudit.valid && archAudit.violations.length > 0) {
                        const existingNames = asArray<Record<string, unknown>>(storyState.cast)
                            .map((c) => asString(c.name))
                            .concat(newChars.map((c) => asString(c.name)))
                            .filter(Boolean);
                        const { renameMap } = await repairBannedEntitiesWithAI(ctx, {
                            violations: archAudit.violations,
                            existingNames,
                            storyContext: `${asString(storyState.concept)}\n${asString(scene.description)}`,
                            story: storyState
                        });
                        if (Object.keys(renameMap).length > 0) {
                            const replaceFn = getCascadeReplaceFn(ctx);
                            effectiveUpdates = cascadeStringFields(
                                updates,
                                renameMap,
                                replaceFn
                            ) as ArchivistUpdatesPayload;
                            const sId = `${seqIdx}-${sceneIdx}`;
                            const repairedProse = replaceFn(finalProseText, renameMap);
                            if (
                                repairedProse &&
                                repairedProse !== finalProseText &&
                                proseMap[sId]
                            ) {
                                archStoryState = {
                                    ...storyState,
                                    prose: {
                                        ...proseMap,
                                        [sId]: {
                                            ...asRecord(proseMap[sId]),
                                            final: repairedProse,
                                            draft: repairedProse
                                        }
                                    }
                                };
                            }
                            ctx.showToast(
                                `Upstream Name Audit: Renamed ${Object.keys(renameMap)
                                    .map((k) => `${k} → ${renameMap[k]}`)
                                    .join(', ')}`,
                                'info'
                            );
                        }
                    }
                } catch (archAuditErr) {
                    console.warn('[runArchivistForScene] Entity name audit warning:', archAuditErr);
                }
            }

            let resultStory: PipelineStory = storyState;
            const mergedStory = await handleWorldUpdates(
                ctx,
                effectiveUpdates,
                asNumber(sequenceData.parent_act, 1),
                asString(scene.number) || 1,
                archStoryState,
                scene
            );
            if (mergedStory) {
                resultStory = mergedStory;
            }
            const rawSynopsis = sanitizeScenePlotDelta(asString(effectiveUpdates.scene_synopsis));
            const effectiveSynopsis =
                rawSynopsis.length >= 15
                    ? rawSynopsis
                    : buildFallbackSceneDelta(scene, seqIdx, sceneIdx, finalProseText);
            const nextMemory = upsertSceneMemoryDelta(resultStory.story_memory, {
                key: `${seqIdx}-${sceneIdx}`,
                seqIdx,
                sceneIdx,
                sceneNumber:
                    asString(scene.number) || `${Number(sequenceData.number || seqIdx + 1)}.${sceneIdx + 1}`,
                title: asString(scene.title) || `Scene ${seqIdx + 1}.${sceneIdx + 1}`,
                synopsis: effectiveSynopsis,
                parentAct: resolveSequenceParentAct(sequenceData, seqIdx),
                totalScenesInSeq: scenes.length
            });
            const nextSoFar = renderStorySoFar(nextMemory, resultStory);
            return {
                ...resultStory,
                story_memory: nextMemory,
                story_so_far: nextSoFar
            };
        }
        console.warn('Archivist returned no usable updates.');
        const fallbackSynopsis = buildFallbackSceneDelta(scene, seqIdx, sceneIdx, finalProseText);
        const fallbackMemory = upsertSceneMemoryDelta(storyState.story_memory, {
            key: `${seqIdx}-${sceneIdx}`,
            seqIdx,
            sceneIdx,
            sceneNumber:
                asString(scene.number) || `${Number(sequenceData.number || seqIdx + 1)}.${sceneIdx + 1}`,
            title: asString(scene.title) || `Scene ${seqIdx + 1}.${sceneIdx + 1}`,
            synopsis: fallbackSynopsis,
            parentAct: resolveSequenceParentAct(sequenceData, seqIdx),
            totalScenesInSeq: scenes.length
        });
        return {
            ...storyState,
            story_memory: fallbackMemory,
            story_so_far: renderStorySoFar(fallbackMemory, storyState)
        };
    } catch (archError) {
        console.warn('Archivist step failed or skipped:', archError);
    }
    return storyState;
}

/** TIER 0.2: On-demand character interview / psychological profile generator. */
export async function generateCharacterProfile(
    ctx: PipelineRuntimeContext,
    charOrName: string | Record<string, unknown>,
    charRoleOrStoryContext?: string | Record<string, unknown>,
    contextOrFlaw?: string | Record<string, unknown>,
    storyContextOrDesire?: string | Record<string, unknown>,
    optionalVocalCadence?: string
): Promise<CharacterProfileResult> {
    let charName: string;
    let charRole: string;
    let flaw: string;
    let desire: string;
    let cadence: string;
    let storyCtx: Record<string, unknown>;
    const charObj =
        typeof charOrName === 'object' && charOrName !== null ? charOrName : null;

    if (charObj) {
        const details = asRecord(charObj.details);
        charName = asString(charObj.name, 'Character');
        charRole = asString(charObj.role, 'Supporting');
        flaw = asString(charObj.core_flaw) || asString(details.history) || 'Unspecified flaw';
        desire = asString(charObj.core_desire) || asString(details.goals) || 'Unspecified desire';
        cadence = asString(charObj.vocal_cadence, 'Distinct speech cadence');
        storyCtx =
            typeof charRoleOrStoryContext === 'object' && charRoleOrStoryContext !== null
                ? charRoleOrStoryContext
                : {};
    } else {
        charName = String(charOrName || 'Character');
        charRole = String(charRoleOrStoryContext || 'Supporting');
        if (typeof contextOrFlaw === 'object' && contextOrFlaw !== null) {
            flaw =
                asString(contextOrFlaw.core_flaw) ||
                asString(contextOrFlaw.flaw) ||
                'Unspecified flaw';
            desire =
                asString(contextOrFlaw.core_desire) ||
                asString(contextOrFlaw.desire) ||
                'Unspecified desire';
            cadence =
                asString(contextOrFlaw.vocal_cadence) ||
                asString(contextOrFlaw.cadence) ||
                'Distinct speech cadence';
            storyCtx =
                typeof storyContextOrDesire === 'object' && storyContextOrDesire !== null
                    ? storyContextOrDesire
                    : {};
        } else {
            flaw = String(contextOrFlaw || 'Unspecified flaw');
            desire =
                typeof storyContextOrDesire === 'string'
                    ? storyContextOrDesire || flaw
                    : flaw;
            cadence = String(optionalVocalCadence || 'Distinct speech cadence');
            storyCtx =
                typeof storyContextOrDesire === 'object' && storyContextOrDesire !== null
                    ? storyContextOrDesire
                    : {};
        }
    }

    const castList = Array.isArray(storyCtx.cast) ? asArray<Record<string, unknown>>(storyCtx.cast) : [];
    const castListBlock =
        castList.length > 0
            ? `<cast_list>\n${castList.map((c) => `- ${asString(c.name)} (${asString(c.role)})`).join('\n')}\n</cast_list>\n`
            : '';

    const currentStory = ctx.getStory();
    const activePrimer =
        asString(storyCtx.world_primer) || asString(currentStory.world_primer) || null;
    const fallbackLore = asArray<LoreItem>(storyCtx.lore || currentStory.lore);
    const charLoreDocs = await ctx.retrieveContext(
        `Character: ${charName} (${charRole})`,
        0.6,
        null,
        fallbackLore
    );
    const charLoreBlocks = formatLoreForPrompt(activePrimer, charLoreDocs);

    const statusQuoText =
        asString(storyCtx.status_quo) ||
        asString(storyCtx.world_bible) ||
        asString(storyCtx.concept);
    const relationshipsText = asString(storyCtx.relationships) || 'None defined.';
    const contextBlock = `<user_concept>${asString(storyCtx.concept)}</user_concept>
${storyCtx.heart_of_the_dilemma ? `<heart_of_the_dilemma>\n${asString(storyCtx.heart_of_the_dilemma)}\n</heart_of_the_dilemma>\n` : ''}${charLoreBlocks ? `${charLoreBlocks}\n` : ''}<status_quo>${statusQuoText}</status_quo>
${castListBlock}<character_briefs>
<char_id>C_${charName.replace(/\s+/g, '_')}</char_id>
<char_name>${charName}</char_name>
<brief_role>${charRole}</brief_role>
${charObj?.corner_role ? `<corner_role>${asString(charObj.corner_role)}</corner_role>\n` : ''}<core_flaw>${flaw}</core_flaw>
${charObj?.why_it_makes_sense ? `<why_it_makes_sense>${asString(charObj.why_it_makes_sense)}</why_it_makes_sense>\n` : ''}${charObj?.what_it_costs_them ? `<what_it_costs_them>${asString(charObj.what_it_costs_them)}</what_it_costs_them>\n` : ''}${charObj?.way_of_living ? `<way_of_living>${asString(charObj.way_of_living)}</way_of_living>\n` : ''}${charObj?.the_wake_up_call ? `<the_wake_up_call>${asString(charObj.the_wake_up_call)}</the_wake_up_call>\n` : ''}<core_desire>${desire}</core_desire>
<vocal_cadence>${cadence}</vocal_cadence>
</character_briefs>
<relationship_matrix>${relationshipsText}</relationship_matrix>
${buildGenreToneBlocks(asRecord(storyCtx.style))}`;

    const prompt = `${contextBlock}\n\n<instruction>Conduct the dramatized character interview for ${charName}. Ground the character in the established world rules, factions, culture, and lore provided in <world_primer> and <relevant_lore>. Prioritize established lore names, factions, and settings over inventing new ones. Using their unique voice, write out their full responses to every interview question in present tense prose format.</instruction>\n\n<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <character_registry>
    <id>C1</id>
    <name>Character Name</name>
    <first_person_interview>The complete dramatized interview: present tense prose responses to all interview questions, written in the character's unmistakable voice with behavioral subtext and self-rationalization throughout.</first_person_interview>
    <vocal_cadence>Bespoke 7-Component Voice Design profile specific to this character (Gender: male/female/neutral + Age: child/teenager/young adult/middle-aged/elderly with specific age or sub-range + Pitch: high/medium/low/high-pitched with resonance/deep baritone + Pace: fast/moderate/slow/deliberate with pauses/rapid-fire + Emotion: cheerful/calm/serious/gentle/lively/soothing/intense + Characteristics: magnetic/crisp/hoarse/raspy/breathy/mellow/sweet/rich/gravelly + Use case: narration/news broadcast/ad voice-over/audiobook). 15-40 words in 2-3 natural sentences (e.g., "A young female voice, mid-twenties, warm and smooth with a slight breathiness. Moderate pace, calm and reassuring delivery. Suitable for guided meditation or audiobook narration."). Must reflect this specific character and differ from the rest of the cast; NEVER include character or celebrity names.</vocal_cadence>
    <core_yearning>A rich, poetic 1-2 sentence distillation of what truly drives this character: blending their outward striving with their tender internal longing and the emotional stakes that make them human.</core_yearning>
  </character_registry>
</response>
</output_format_description>

BEGIN DEVELOPING CHARACTER PROFILES`;

    const interviewOutput = await ctx.callAI(
        prompt,
        PROMPTS.characterDevelopment,
        false,
        'Character Developer (Tier 0.2)',
        'prose'
    );
    const interviewText = extractTag(interviewOutput, 'first_person_interview') || interviewOutput;
    const parsedCadence = extractTag(interviewOutput, 'vocal_cadence');
    const parsedYearning = extractTag(interviewOutput, 'core_yearning');
    return {
        deep_profile: decodeXmlEntities(interviewText),
        vocal_cadence: parsedCadence ? decodeXmlEntities(parsedCadence).trim() : cadence,
        core_yearning: parsedYearning ? decodeXmlEntities(parsedYearning).trim() : ''
    };
}

/** Fetches or interviews a character profile in-place inside `mutableCastList`. */
export async function getCharacterDetails(
    ctx: PipelineRuntimeContext,
    charName: string,
    mutableCastList: Array<CastMember & Record<string, unknown>>
): Promise<string> {
    const charIdx = mutableCastList.findIndex((c) => c.name === charName);
    if (charIdx === -1) {
        console.log(`Character ${charName} not found in cast.`);
        return 'Character details unavailable.';
    }
    const char = mutableCastList[charIdx];
    const charDetails = asOptionalRecord(char.details);
    if (charDetails && asString(charDetails.deep_profile)) {
        return asString(charDetails.deep_profile);
    }

    ctx.setLoadingStep(`Interviewing ${char.name}...`);
    const currentStory = ctx.getStory();
    const castArr = asArray<CastMember>(currentStory.cast);
    const rels = asRecord(currentStory.relationships) as Record<string, Record<string, unknown>>;
    const frictionCast = [char, ...castArr.filter((c) => c.name !== char.name).slice(0, 2)];

    const storyContext = {
        concept: currentStory.concept,
        status_quo: currentStory.status_quo || currentStory.concept,
        cast: castArr,
        themes: currentStory.themes,
        style: currentStory.style,
        relationships: buildRelationshipFrictionBlock(frictionCast, rels)
    };

    const profileResult = await generateCharacterProfile(ctx, char, storyContext);
    const deepProfileText = profileResult.deep_profile || '';
    const parsedCadence = profileResult.vocal_cadence || '';
    const parsedYearning = profileResult.core_yearning || '';

    const target = mutableCastList[charIdx];
    const targetDetails = asRecord(target.details);
    targetDetails.deep_profile = deepProfileText;
    if (!target.voice_sample && deepProfileText) {
        const firstSentence = deepProfileText.split('.')[0];
        target.voice_sample = firstSentence
            ? `${firstSentence.substring(0, 120)}...`
            : `${deepProfileText.substring(0, 120)}...`;
    }
    const cleanedInterviewCadence = cleanCharacterNameFromVoiceProfile(parsedCadence, [char.name]);
    if (!target.user_edited_cadence) {
        if (isValidQwenVoiceProfile(cleanedInterviewCadence)) {
            target.vocal_cadence = cleanedInterviewCadence;
        } else if (!isValidQwenVoiceProfile(asString(target.vocal_cadence))) {
            target.vocal_cadence = synthesizeQwenVoiceDesignProfile(
                target as VoiceCastMember,
                char.name,
                { ...currentStory, cast: mutableCastList } as AudioStoryLike
            );
        }
    }
    if (parsedYearning && parsedYearning.trim()) {
        target.core_desire = parsedYearning.trim();
        targetDetails.goals = parsedYearning.trim();
    }
    target.details = targetDetails;
    if (!target.user_edited_reference_text && deepProfileText) {
        const personalizedRef = extractPersonalizedReferenceTextFromInterview(deepProfileText);
        if (personalizedRef) {
            target.reference_text = personalizedRef;
        }
    }
    return deepProfileText;
}

export function computeSpawnedCharacterVoiceSeed(
    briefName: string,
    story: PipelineStory
): number {
    return getDeterministicVoiceSeed({ name: briefName }, story as AudioStoryLike);
}
