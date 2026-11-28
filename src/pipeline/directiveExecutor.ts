/**
 * @module pipeline/directiveExecutor
 * Directive Agent Plan Executor (Tier 6.2):
 * Atomically executes structured directive actions across story metadata, cast/arcs/relationships,
 * threads, secrets, world lore, continuity facts, GESM propositions/beliefs, acts, sequences,
 * scene blueprints, surgical/line/rewrite prose edits, scene-to-prose cascade, and post-run
 * verification + cross-scene consistency audits.
 */

import { STRUCTURAL_MODALITIES } from '@/config';
import {
    cleanCharacterNameFromVoiceProfile,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    isValidQwenVoiceProfile,
    synthesizeQwenVoiceDesignProfile,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import {
    compareSceneCoordinates,
    ensureEpistemicGraph,
    normalizeEntityId,
    normalizeEpistemicPropositionsMap,
    resolvePropositionMatch,
    type ContinuityStoryState,
    type EpistemicGraph
} from '@/domain/continuity';
import {
    applyParsedEdits,
    computeChangeRatio,
    SURGICAL_MAX_CHANGE_RATIO,
    type AppliedSurgicalEdit
} from '@/domain/editing';
import {
    actForSequence,
    appendPersistedMandate,
    canonicalizeModalityHand,
    isActionBlockedByProtection,
    normalizeSceneBlueprint,
    parseValueShiftInput,
    reindexStoryForSequenceDelete,
    reindexStoryForSequenceInsert,
    resolveCharacter,
    resolveSceneCastFields,
    type DirectiveActionInput
} from '@/domain/story';
import type { CastMember, SceneBlueprint, Story } from '@/types';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { markRestorePoint } from './restorePoint';
import { repairBannedEntitiesWithAI } from './continuityPipeline';
import {
    reviewDirectiveConsistency,
    verifyAndArchiveDirectiveScene,
    type DirectiveActionExecutionResult,
    type DirectiveActionItem,
    type DirectiveLogFn
} from './directivePlanner';
import { ingestLore } from './lorePipeline';
import { writeSceneProse } from './prosePipeline';
import { applySurgicalProsePatch } from './surgicalPatch';

/** Executes a compiled list of Directive Agent actions sequentially with undo snapshot safety. */
export async function executeDirectivePlan(
    ctx: PipelineRuntimeContext,
    planActions: DirectiveActionItem[]
): Promise<void> {
    if (ctx.getIsPlanningDirective?.() || ctx.getIsExecutingDirective?.()) return;
    const initialStory = ctx.getStory();
    const snapshot = JSON.parse(JSON.stringify(initialStory)) as PipelineStory;
    await markRestorePoint(ctx, 'Before applying a directive plan', snapshot);

    try {
        ctx.setDirectiveUndoSnapshot?.(snapshot);
        ctx.setIsExecutingDirective?.(true);
        ctx.setDirectiveProgress?.(0);
        ctx.setDirectiveExecutionLogs?.([]);

        let currentStory = JSON.parse(JSON.stringify(snapshot)) as PipelineStory;
        const results: DirectiveActionExecutionResult[] = [];
        const touchedProseScenes = new Set<string>();
        let lastProseActions = new Map<string, number>();

        // Keep prior edit undo targets attached to their scenes as later structural actions shift keys.
        const rekeyResultScenes = (mapKey: (key: string) => string | null): void => {
            results.forEach((result) => {
                if (result.proseSceneId) {
                    const mapped = mapKey(result.proseSceneId);
                    if (mapped === null) delete result.proseSceneId;
                    else result.proseSceneId = mapped;
                }
            });
            lastProseActions = new Map(
                [...lastProseActions]
                    .map(([key, idx]) => [mapKey(key), idx] as const)
                    .filter((entry): entry is [string, number] => entry[0] !== null)
            );
            touchedProseScenes.clear();
            lastProseActions.forEach((_idx, key) => touchedProseScenes.add(key));
        };

        ctx.setDirectivePlan?.((prev) =>
            prev
                ? {
                      ...prev,
                      consistencyReview: undefined,
                      actions: prev.actions.map((action) => ({ ...action, result: undefined }))
                  }
                : prev
        );

        const logMessage: DirectiveLogFn = (text, status = 'pending') => {
            ctx.setDirectiveExecutionLogs?.((prev) => {
                if (
                    prev.length > 0 &&
                    prev[prev.length - 1].status === 'running' &&
                    (status === 'success' || status === 'error')
                ) {
                    const next = [...prev];
                    next[next.length - 1] = {
                        ...next[next.length - 1],
                        status,
                        text: text || next[next.length - 1].text
                    };
                    return next;
                }
                return [...prev, { id: Date.now() + Math.random(), text, status }];
            });
        };

        const protectWrittenProse = ctx.getProtectWrittenProse?.() ?? true;
        const cascadeSceneChanges = ctx.getCascadeSceneChanges?.() ?? true;
        const verifyDirectiveEdits = ctx.getVerifyDirectiveEdits?.() ?? true;
        const directiveInput = ctx.getDirectiveInput?.() || '';
        const slopConfig = ctx.getSlopConfig();

        for (let i = 0; i < planActions.length; i++) {
            const action = planActions[i];
            const actionNum = i + 1;
            const totalActions = planActions.length;
            let resultMessage = '';
            let appliedEditsForAction: AppliedSurgicalEdit[] | undefined;
            let cascadeInstructions = '';
            let cascadeResult:
                | {
                      status: 'applied' | 'failed' | 'skipped';
                      message: string;
                      appliedEdits: AppliedSurgicalEdit[];
                  }
                | undefined;

            try {
                if (action.skipped === true) {
                    const message = 'Skipped by author before execution.';
                    results[i] = { status: 'skipped', message };
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Skipped by author: ${action.description || action.action_type}`,
                        'pending'
                    );
                    continue;
                }

                const blockedByProtection = isActionBlockedByProtection(
                    action as DirectiveActionInput,
                    currentStory as unknown as Partial<Story> & Record<string, unknown>,
                    protectWrittenProse
                );
                if (blockedByProtection && action.allow_protected !== true) {
                    const message = 'Protect Written Prose is enabled. Target is in a locked section.';
                    results[i] = { status: 'skipped', message };
                    logMessage(`[Action ${actionNum}/${totalActions}] Skipped: ${message}`, 'pending');
                    continue;
                }

                logMessage(
                    `[Action ${actionNum}/${totalActions}] Running: ${action.description}`,
                    'running'
                );

                const actIdx =
                    action.target_act_idx !== undefined && action.target_act_idx !== null
                        ? parseInt(String(action.target_act_idx), 10)
                        : 0;
                const rawSeqTarget = action.target_sequence_idx ?? action.target_seq_idx;
                const seqIdx =
                    rawSeqTarget !== undefined && rawSeqTarget !== null
                        ? parseInt(String(rawSeqTarget), 10)
                        : 0;
                const sceneIdx =
                    action.target_scene_idx !== null && action.target_scene_idx !== undefined
                        ? parseInt(String(action.target_scene_idx), 10)
                        : 0;
                const sceneKey = `${seqIdx}`;
                const sId = `${seqIdx}-${sceneIdx}`;
                const details = asRecord(action.details);
                const proseEntry = asOptionalRecord(asRecord(currentStory.prose)[sId]);
                const proseBeforeAction = asString(proseEntry?.final);

                // SCALE 0: STORY & METADATA OPERATIONS
                if (action.action_type === 'MODIFY_STORY_METADATA') {
                    const style = { ...asRecord(currentStory.style) };
                    if (details.title !== undefined) currentStory.title = details.title;
                    if (details.concept !== undefined) currentStory.concept = details.concept;
                    if (details.heart_of_the_dilemma !== undefined) {
                        currentStory.heart_of_the_dilemma = details.heart_of_the_dilemma;
                    }
                    if (details.status_quo !== undefined) currentStory.status_quo = details.status_quo;
                    if (details.inciting_incident !== undefined) {
                        currentStory.inciting_incident = details.inciting_incident;
                    }
                    if (details.themes !== undefined) currentStory.themes = details.themes;
                    if (details.core_thematic_argument !== undefined) {
                        currentStory.core_thematic_argument = details.core_thematic_argument;
                    }
                    if (details.starting_value_state !== undefined) {
                        currentStory.starting_value_state = details.starting_value_state;
                    }
                    if (details.ending_value_state !== undefined) {
                        currentStory.ending_value_state = details.ending_value_state;
                    }
                    if (details.major_surprises_and_twists !== undefined) {
                        currentStory.major_surprises_and_twists =
                            details.major_surprises_and_twists;
                    }
                    if (details.author_note !== undefined) {
                        currentStory.author_note = details.author_note;
                    }
                    if (details.genre !== undefined) style.genre = details.genre;
                    if (details.mood !== undefined) style.mood = details.mood;
                    if (details.writing_guide !== undefined) {
                        style.writing_guide = details.writing_guide;
                    }
                    if (details.synthesized_authorial_persona !== undefined) {
                        currentStory.synthesized_authorial_persona =
                            details.synthesized_authorial_persona;
                        style.synthesized_authorial_persona =
                            details.synthesized_authorial_persona;
                    }
                    if (details.genre_pacing_and_dialogue_rules !== undefined) {
                        currentStory.genre_pacing_and_dialogue_rules =
                            details.genre_pacing_and_dialogue_rules;
                        style.genre_pacing_and_dialogue_rules =
                            details.genre_pacing_and_dialogue_rules;
                    }
                    if (details.strict_anti_patterns !== undefined) {
                        currentStory.strict_anti_patterns = details.strict_anti_patterns;
                        style.strict_anti_patterns = details.strict_anti_patterns;
                    }
                    currentStory.style = style;

                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: Surgically modified story metadata.`,
                        'success'
                    );
                } else if (action.action_type === 'ADD_CHARACTER') {
                    let charNameToAdd = asString(details.name) || 'Unnamed Character';
                    const auditedDetails: Record<string, unknown> = { ...details };
                    if (
                        slopConfig?.enableSlopAudit !== false &&
                        slopConfig?.enableUpstreamNameAudit !== false &&
                        typeof ctx.auditEntityNamesAndPlaces === 'function' &&
                        charNameToAdd !== 'Unnamed Character'
                    ) {
                        try {
                            const directiveConceptStory: PipelineStory = {
                                ...currentStory,
                                concept: `${asString(currentStory.concept)}\n${directiveInput}`
                            };
                            const dirAudit = ctx.auditEntityNamesAndPlaces({
                                characters: [
                                    {
                                        name: charNameToAdd,
                                        role: asString(details.role) || 'Minor Character'
                                    }
                                ],
                                existingCast: asArray<CastMember>(currentStory.cast),
                                slopConfig,
                                story: directiveConceptStory
                            });
                            if (!dirAudit.valid && dirAudit.violations.length > 0) {
                                const { renameMap } = await repairBannedEntitiesWithAI(ctx, {
                                    violations: dirAudit.violations,
                                    existingNames: asArray<Record<string, unknown>>(
                                        currentStory.cast
                                    )
                                        .map((c) => asString(c.name))
                                        .concat([charNameToAdd]),
                                    storyContext: asString(currentStory.concept),
                                    story: directiveConceptStory
                                });
                                if (renameMap[charNameToAdd]) {
                                    charNameToAdd = renameMap[charNameToAdd];
                                    Object.keys(auditedDetails).forEach((dk) => {
                                        if (
                                            typeof auditedDetails[dk] === 'string' &&
                                            typeof ctx.applyCascadingNameReplacements === 'function'
                                        ) {
                                            auditedDetails[dk] = ctx.applyCascadingNameReplacements(
                                                auditedDetails[dk] as string,
                                                renameMap
                                            );
                                        }
                                    });
                                    auditedDetails.name = charNameToAdd;
                                    logMessage(
                                        `[Action ${actionNum}/${totalActions}] Upstream Name Audit renamed ${asString(details.name)} → ${charNameToAdd}.`,
                                        'info'
                                    );
                                }
                            }
                        } catch (dirAuditErr) {
                            console.warn('[Directive ADD_CHARACTER] Name audit warning:', dirAuditErr);
                        }
                    }

                    const rawAddedCadence = cleanCharacterNameFromVoiceProfile(
                        asString(auditedDetails.vocal_cadence),
                        [charNameToAdd]
                    );
                    const newChar: Record<string, unknown> = {
                        id: `C_dyn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: charNameToAdd,
                        role: asString(auditedDetails.role) || 'Minor Character',
                        ...(auditedDetails.corner_role
                            ? { corner_role: auditedDetails.corner_role }
                            : {}),
                        core_flaw: asString(auditedDetails.core_flaw) || 'Unspecified flaw',
                        core_desire: asString(auditedDetails.core_desire) || 'Unspecified desire',
                        vocal_cadence: isValidQwenVoiceProfile(rawAddedCadence)
                            ? rawAddedCadence
                            : synthesizeQwenVoiceDesignProfile(
                                  auditedDetails as VoiceCastMember,
                                  charNameToAdd,
                                  currentStory as AudioStoryLike
                              ),
                        ...(auditedDetails.deep_profile
                            ? { details: { deep_profile: auditedDetails.deep_profile } }
                            : {})
                    };
                    [
                        'why_it_makes_sense',
                        'what_it_costs_them',
                        'way_of_living',
                        'why_it_is_appealing',
                        'shared_outlook',
                        'the_hidden_trap',
                        'how_they_ended_up',
                        'human_sympathy',
                        'the_wake_up_call'
                    ].forEach((field) => {
                        if (auditedDetails[field]) newChar[field] = auditedDetails[field];
                    });
                    newChar.voice_seed = getDeterministicVoiceSeed(
                        newChar as VoiceCastMember,
                        currentStory as AudioStoryLike
                    );
                    const newCharDetails = asOptionalRecord(newChar.details);
                    if (newCharDetails?.deep_profile && !newChar.reference_text) {
                        const extractedRef = extractPersonalizedReferenceTextFromInterview(
                            asString(newCharDetails.deep_profile)
                        );
                        if (extractedRef) newChar.reference_text = extractedRef;
                    }
                    currentStory.cast = [
                        ...asArray<Record<string, unknown>>(currentStory.cast),
                        newChar
                    ];
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: Added new character ${asString(newChar.name)}.`,
                        'success'
                    );
                } else if (action.action_type === 'MODIFY_CHARACTER') {
                    const castList = [...asArray<Record<string, unknown>>(currentStory.cast)];
                    let charIdx = castList.findIndex(
                        (c) => c.id === action.target_character_id
                    );
                    if (charIdx === -1 && details.name) {
                        const targetLower = asString(details.name).toLowerCase();
                        charIdx = castList.findIndex(
                            (c) => asString(c.name).toLowerCase() === targetLower
                        );
                    }

                    if (charIdx > -1) {
                        const charRec: Record<string, unknown> = {
                            ...castList[charIdx],
                            details: { ...asRecord(castList[charIdx].details) }
                        };
                        const charDetails = asRecord(charRec.details);
                        if (details.name) charRec.name = details.name;
                        if (details.role) charRec.role = details.role;
                        if (details.corner_role) charRec.corner_role = details.corner_role;
                        [
                            'why_it_makes_sense',
                            'what_it_costs_them',
                            'way_of_living',
                            'why_it_is_appealing',
                            'shared_outlook',
                            'the_hidden_trap',
                            'how_they_ended_up',
                            'human_sympathy',
                            'the_wake_up_call'
                        ].forEach((field) => {
                            if (details[field] !== undefined) charRec[field] = details[field];
                        });
                        if (details.core_flaw !== undefined) {
                            charRec.core_flaw = details.core_flaw;
                        }
                        if (details.core_desire !== undefined) {
                            charRec.core_desire = details.core_desire;
                        }
                        if (details.deep_profile !== undefined) {
                            charDetails.deep_profile = details.deep_profile;
                            charRec.details = charDetails;
                        }
                        if (details.aliases !== undefined) {
                            charRec.aliases = Array.isArray(details.aliases)
                                ? details.aliases
                                : String(details.aliases)
                                      .split(/[,;\n]+/)
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                        }
                        const charName = asString(charRec.name);
                        if (details.vocal_cadence) {
                            const cleanedModCadence = cleanCharacterNameFromVoiceProfile(
                                asString(details.vocal_cadence),
                                [charName]
                            );
                            charRec.vocal_cadence = isValidQwenVoiceProfile(cleanedModCadence)
                                ? cleanedModCadence
                                : synthesizeQwenVoiceDesignProfile(
                                      {
                                          ...charRec,
                                          vocal_cadence: cleanedModCadence
                                      } as VoiceCastMember,
                                      charName,
                                      currentStory as AudioStoryLike
                                  );
                        }
                        if (!charRec.voice_seed) {
                            charRec.voice_seed = getDeterministicVoiceSeed(
                                charRec as VoiceCastMember,
                                currentStory as AudioStoryLike
                            );
                        }
                        const userEditedMap = asRecord(currentStory.user_edited);
                        if (
                            details.deep_profile !== undefined &&
                            !charRec.user_edited_reference_text &&
                            !userEditedMap[`cast.${charName}.reference_text`]
                        ) {
                            const extractedModRef = extractPersonalizedReferenceTextFromInterview(
                                asString(details.deep_profile)
                            );
                            if (extractedModRef) charRec.reference_text = extractedModRef;
                        }

                        castList[charIdx] = charRec;
                        currentStory = { ...currentStory, cast: castList };
                        ctx.setStory(currentStory);
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: Surgically modified character ${charName}.`,
                            'success'
                        );
                    } else {
                        throw new Error(
                            `Character ${action.target_character_id || asString(details.name)} not found.`
                        );
                    }
                } else if (action.action_type === 'DELETE_CHARACTER') {
                    const castList = [...asArray<Record<string, unknown>>(currentStory.cast)];
                    let charIdx = castList.findIndex(
                        (c) => c.id === action.target_character_id
                    );
                    if (charIdx === -1 && details.name) {
                        const targetLower = asString(details.name).toLowerCase();
                        charIdx = castList.findIndex(
                            (c) => asString(c.name).toLowerCase() === targetLower
                        );
                    }

                    if (charIdx > -1) {
                        const deletedName = asString(castList[charIdx].name);
                        castList.splice(charIdx, 1);
                        currentStory = { ...currentStory, cast: castList };
                        ctx.setStory(currentStory);
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: Deleted character ${deletedName}.`,
                            'success'
                        );
                    } else {
                        throw new Error(
                            `Character ${action.target_character_id || asString(details.name)} not found to delete.`
                        );
                    }
                } else if (action.action_type === 'MODIFY_RELATIONSHIP') {
                    const names = details.relationship_key
                        ? asString(details.relationship_key).split('->')
                        : [asString(details.from_name), asString(details.to_name)];
                    if (names.length !== 2) throw new Error('relationship_key must use NameA->NameB.');
                    const castArr = asArray<CastMember>(currentStory.cast);
                    const resolveName = (name: string): string => {
                        const character = castArr.find(
                            (c) => asString(c.name).toLowerCase() === name.trim().toLowerCase()
                        );
                        if (!character) {
                            throw new Error(
                                `Unknown relationship character: ${name || '(missing name)'}.`
                            );
                        }
                        return character.name;
                    };
                    const from = resolveName(names[0]);
                    const to = resolveName(names[1]);
                    const relationships = { ...asRecord(currentStory.relationships) };
                    const targetKeyLower = `${from}->${to}`.toLowerCase();
                    const key =
                        Object.keys(relationships).find(
                            (k) =>
                                k
                                    .split('->')
                                    .map((nm) => nm.trim().toLowerCase())
                                    .join('->') === targetKeyLower
                        ) || `${from}->${to}`;
                    const entry: Record<string, unknown> = {
                        current: '',
                        hidden_tension: '',
                        trust_level: 5,
                        ...asRecord(relationships[key])
                    };
                    ['current', 'hidden_tension'].forEach((field) => {
                        if (details[field] !== undefined) entry[field] = details[field];
                    });
                    if (details.trust_level !== undefined && details.trust_level !== '') {
                        const trust = Number(details.trust_level);
                        if (!Number.isFinite(trust) || trust < 1 || trust > 10) {
                            throw new Error('trust_level must be between 1 and 10.');
                        }
                        entry.trust_level = trust;
                    }
                    entry.history = [
                        ...asArray(entry.history),
                        {
                            chapter: 'Directive',
                            change: asString(details.current) || `Updated relationship ${from}->${to}.`
                        }
                    ];
                    relationships[key] = entry;
                    currentStory = { ...currentStory, relationships };
                    resultMessage = `Updated relationship ${from}->${to}.`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (
                    action.action_type === 'ADD_THREAD' ||
                    action.action_type === 'MODIFY_THREAD' ||
                    action.action_type === 'DELETE_THREAD'
                ) {
                    const threads = [...asArray<Record<string, unknown>>(currentStory.threads)];
                    const reqId = asString(details.thread_id || details.id).trim();
                    const detailNameLower = asString(details.name).toLowerCase();
                    const matchIdx = threads.findIndex(
                        (t) =>
                            (reqId && asString(t.id).toLowerCase() === reqId.toLowerCase()) ||
                            (details.name && asString(t.name).toLowerCase() === detailNameLower)
                    );
                    if (action.action_type === 'ADD_THREAD') {
                        const nextId = reqId || `T${threads.length + 1}`;
                        if (!details.name && !details.description) {
                            throw new Error('ADD_THREAD requires name or description.');
                        }
                        const entry = {
                            id: nextId,
                            name: asString(details.name) || `Thread ${nextId}`,
                            description: asString(details.description)
                        };
                        if (matchIdx > -1) threads[matchIdx] = { ...threads[matchIdx], ...entry };
                        else threads.push(entry);
                        resultMessage = `Added narrative thread ${entry.id}: ${entry.name}.`;
                    } else if (action.action_type === 'MODIFY_THREAD') {
                        if (matchIdx === -1) {
                            throw new Error(
                                `Thread "${reqId || asString(details.name) || '(missing)'}" not found.`
                            );
                        }
                        const updated = { ...threads[matchIdx] };
                        if (details.name !== undefined) updated.name = details.name;
                        if (details.description !== undefined) {
                            updated.description = details.description;
                        }
                        threads[matchIdx] = updated;
                        resultMessage = `Updated narrative thread ${asString(updated.id)}: ${asString(updated.name)}.`;
                    } else {
                        if (matchIdx === -1) {
                            throw new Error(
                                `Thread "${reqId || asString(details.name) || '(missing)'}" not found to delete.`
                            );
                        }
                        const removed = threads.splice(matchIdx, 1)[0];
                        resultMessage = `Deleted narrative thread ${asString(removed.id)}: ${asString(removed.name)}.`;
                    }
                    currentStory = { ...currentStory, threads };
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'MODIFY_CHARACTER_ARC') {
                    const arcs = [...asArray<Record<string, unknown>>(currentStory.character_arcs)];
                    const lookup = asString(
                        details.char_id || details.name || action.target_character_id
                    ).trim();
                    const resolvedChar = lookup
                        ? resolveCharacter(lookup, asArray<CastMember>(currentStory.cast))
                        : null;
                    const resolvedRec = resolvedChar
                        ? (resolvedChar as unknown as Record<string, unknown>)
                        : null;
                    const matchNames = [
                        lookup.toLowerCase(),
                        asString(resolvedRec?.name).toLowerCase(),
                        asString(resolvedRec?.id).toLowerCase()
                    ].filter(Boolean);
                    const arcIdx = arcs.findIndex((a) =>
                        matchNames.includes(asString(a.char_id).trim().toLowerCase())
                    );
                    const baseArc: Record<string, unknown> =
                        arcIdx > -1
                            ? { ...arcs[arcIdx] }
                            : {
                                  char_id: asString(resolvedRec?.name) || lookup || 'Protagonist',
                                  corner_role: asString(resolvedRec?.corner_role),
                                  lie_believed: '',
                                  truth_needed: '',
                                  arc_catalyst: '',
                                  description: '',
                                  web_pressure: ''
                              };
                    [
                        'corner_role',
                        'lie_believed',
                        'truth_needed',
                        'arc_catalyst',
                        'description',
                        'web_pressure'
                    ].forEach((field) => {
                        if (details[field] !== undefined) baseArc[field] = details[field];
                    });
                    if (arcIdx > -1) arcs[arcIdx] = baseArc;
                    else arcs.push(baseArc);
                    currentStory = { ...currentStory, character_arcs: arcs };
                    resultMessage = `Updated character arc for ${asString(baseArc.char_id)}.`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (
                    action.action_type === 'ADD_SECRET' ||
                    action.action_type === 'MODIFY_SECRET'
                ) {
                    const vault = [...asArray<Record<string, unknown>>(currentStory.secret_vault)];
                    const secretId = asString(details.secret_id || details.id).trim();
                    const title = asString(details.title).trim();
                    const parseNames = (val: unknown): string[] =>
                        Array.isArray(val)
                            ? val.map((x) => asString(x).trim()).filter(Boolean)
                            : typeof val === 'string'
                              ? val
                                    .split(/[,;\n]+/)
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                              : [];
                    const idx = vault.findIndex(
                        (s) =>
                            (secretId && s.id === secretId) ||
                            (title && asString(s.title).toLowerCase() === title.toLowerCase())
                    );
                    if (action.action_type === 'ADD_SECRET') {
                        if (!title && !details.truth) {
                            throw new Error('ADD_SECRET requires title or truth.');
                        }
                        const revAct = parseInt(asString(details.reveal_target_act) || '3', 10) || 3;
                        const revSeq =
                            parseInt(asString(details.reveal_target_sequence) || '7', 10) || 7;
                        const publicBelief = asString(details.public_cover_story);
                        const knownArr = parseNames(details.known_by);
                        const concealedArr = parseNames(details.concealed_from);
                        const newSecret = {
                            id:
                                secretId ||
                                `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                            title: title || 'New Secret',
                            category: asString(details.category) || 'plot_mystery',
                            truth: asString(details.truth),
                            cover_story: { public_belief: publicBelief, character_masks: {} },
                            public_cover_story: publicBelief,
                            known_by_characters: knownArr,
                            known_by: knownArr,
                            concealed_from_characters: concealedArr,
                            concealed_from: concealedArr,
                            reveal_target_act: revAct,
                            reveal_target_sequence: revSeq,
                            reveal_anchor: { act_number: revAct, sequence_number: revSeq },
                            status: 'dormant',
                            clue_schedule: []
                        };
                        if (idx > -1) vault[idx] = { ...vault[idx], ...newSecret };
                        else vault.push(newSecret);
                        resultMessage = `Added secret "${newSecret.title}".`;
                    } else {
                        if (idx === -1) {
                            throw new Error(`Secret "${secretId || title || '(missing)'}" not found.`);
                        }
                        const sec: Record<string, unknown> = { ...vault[idx] };
                        if (title) sec.title = title;
                        if (details.category !== undefined) sec.category = details.category;
                        if (details.truth !== undefined) sec.truth = details.truth;
                        if (details.public_cover_story !== undefined) {
                            sec.public_cover_story = details.public_cover_story;
                            const existingCover = asOptionalRecord(sec.cover_story);
                            sec.cover_story = {
                                ...(existingCover || { character_masks: {} }),
                                public_belief: details.public_cover_story
                            };
                        }
                        if (details.known_by !== undefined) {
                            const knownArr = parseNames(details.known_by);
                            sec.known_by = knownArr;
                            sec.known_by_characters = knownArr;
                        }
                        if (details.concealed_from !== undefined) {
                            const concealedArr = parseNames(details.concealed_from);
                            sec.concealed_from = concealedArr;
                            sec.concealed_from_characters = concealedArr;
                        }
                        if (
                            details.reveal_target_act !== undefined &&
                            details.reveal_target_act !== ''
                        ) {
                            const ra = parseInt(asString(details.reveal_target_act), 10);
                            if (Number.isFinite(ra)) {
                                sec.reveal_target_act = ra;
                                sec.reveal_anchor = {
                                    ...asRecord(sec.reveal_anchor),
                                    act_number: ra
                                };
                            }
                        }
                        if (
                            details.reveal_target_sequence !== undefined &&
                            details.reveal_target_sequence !== ''
                        ) {
                            const rs = parseInt(asString(details.reveal_target_sequence), 10);
                            if (Number.isFinite(rs)) {
                                sec.reveal_target_sequence = rs;
                                sec.reveal_anchor = {
                                    ...asRecord(sec.reveal_anchor),
                                    sequence_number: rs
                                };
                            }
                        }
                        vault[idx] = sec;
                        resultMessage = `Updated secret "${asString(sec.title)}".`;
                    }
                    currentStory = { ...currentStory, secret_vault: vault };
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (
                    action.action_type === 'ADD_LORE' ||
                    action.action_type === 'MODIFY_LORE'
                ) {
                    const topic = asString(details.topic).trim();
                    const detail = details.detail;
                    if (!topic || detail === undefined) {
                        throw new Error('Lore requires topic and detail.');
                    }
                    const lore = [...asArray<Record<string, unknown>>(currentStory.lore)];
                    const loreIdx = lore.findIndex(
                        (item) => asString(item.topic).toLowerCase() === topic.toLowerCase()
                    );
                    if (action.action_type === 'ADD_LORE') {
                        const processed = await ingestLore(ctx, {
                            topic,
                            detail: asString(detail)
                        });
                        if (loreIdx === -1) lore.push(processed as unknown as Record<string, unknown>);
                        else lore[loreIdx] = { ...lore[loreIdx], detail: processed.detail };
                        currentStory = { ...currentStory, lore };
                        ctx.setStory(currentStory);
                    } else {
                        if (loreIdx === -1) throw new Error(`Lore topic "${topic}" not found.`);
                        lore[loreIdx] = { ...lore[loreIdx], detail };
                        currentStory = { ...currentStory, lore };
                        ctx.setStory(currentStory);
                        try {
                            await ingestLore(ctx, lore[loreIdx] as { topic: string; detail: string });
                        } catch (err) {
                            console.warn('[Directive] Lore updated; vector indexing failed:', err);
                        }
                    }
                    resultMessage = `Updated lore topic "${topic}".`;
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'ADD_CONTINUITY_FACT') {
                    const key = asString(details.key).trim();
                    const value = asString(details.value ?? '').trim();
                    const category = asString(details.category || 'Directive').trim() || 'Directive';
                    if (!key || !value) throw new Error('Continuity fact requires key and value.');
                    const entityName = asString(details.entity_name).trim();
                    const entity = entityName
                        ? asArray<Record<string, unknown>>(currentStory.cast).find(
                              (c) => asString(c.name).toLowerCase() === entityName.toLowerCase()
                          )
                        : null;
                    if (entityName && !entity) {
                        throw new Error(`Unknown continuity character: ${entityName}.`);
                    }
                    if (![actIdx, seqIdx, sceneIdx].every((idx) => Number.isInteger(idx) && idx >= 0)) {
                        throw new Error('Continuity target indices must be non-negative integers.');
                    }
                    const tag = `fact:${category}:${key}`.toLowerCase().replace(/\s+/g, '_');
                    const entry = {
                        key,
                        value,
                        category,
                        source_scene: 'Directive',
                        valid_from_act: actIdx + 1,
                        valid_from_sequence: seqIdx + 1,
                        valid_from_scene: sceneIdx + 1,
                        entity_id: asString(entity?.id),
                        tracking_tag: tag,
                        created_at: Date.now(),
                        status: 'active'
                    };
                    const ledger = [
                        ...asArray<Record<string, unknown>>(currentStory.continuity_ledger)
                    ];
                    const existingIdx = ledger.findIndex((item) => item.tracking_tag === tag);
                    if (existingIdx !== -1) ledger.splice(existingIdx, 1);
                    ledger.push(entry);
                    currentStory = { ...currentStory, continuity_ledger: ledger };
                    resultMessage = `Recorded continuity fact "${key}".`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                }

                // SCALE 1: ACT LEVEL SURGICAL OPERATIONS
                else if (action.action_type === 'MODIFY_ACT') {
                    const actsList = [...asArray<Record<string, unknown>>(currentStory.acts)];
                    if (actsList[actIdx]) {
                        const act = { ...actsList[actIdx] };
                        if (details.title) act.title = details.title;
                        if (details.act_mandate !== undefined) {
                            act.act_mandate = details.act_mandate;
                            act.description = details.act_mandate;
                        }
                        if (details.core_tension !== undefined) {
                            act.core_tension = details.core_tension;
                        }
                        if (details.thematic_reversal !== undefined) {
                            act.thematic_reversal = details.thematic_reversal;
                        }
                        if (details.world_building_developments !== undefined) {
                            act.world_building_developments = details.world_building_developments;
                        }

                        actsList[actIdx] = act;
                        currentStory = { ...currentStory, acts: actsList };
                        ctx.setStory(currentStory);
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: Surgically modified Act ${asString(act.number) || actIdx + 1} mandate.`,
                            'success'
                        );
                    } else {
                        throw new Error(`Act at index ${actIdx} not found.`);
                    }
                }

                // SCALE 2: SEQUENCE LEVEL & PERSISTED FUTURE MANDATE OPERATIONS
                else if (action.action_type === 'PERSIST_FUTURE_MANDATE') {
                    const mandateText = asString(
                        details.mandate_text ||
                            details.instructions ||
                            details.description ||
                            action.description
                    ).trim();
                    if (!mandateText) {
                        throw new Error('PERSIST_FUTURE_MANDATE requires mandate_text.');
                    }
                    const label = asString(details.mandate_label).trim();
                    const scopePref = asString(details.target_scope || 'auto').trim().toLowerCase();
                    const seqList = [...asArray<Record<string, unknown>>(currentStory.sequences)];
                    const actsList = [...asArray<Record<string, unknown>>(currentStory.acts)];

                    if ((scopePref === 'sequence' || scopePref === 'auto') && seqList[seqIdx]) {
                        const seq = { ...seqList[seqIdx] };
                        const updatedDesc = appendPersistedMandate(
                            asString(seq.description || seq.summary),
                            mandateText,
                            label
                        );
                        seq.description = updatedDesc;
                        seq.summary = updatedDesc;
                        seqList[seqIdx] = seq;
                        currentStory = { ...currentStory, sequences: seqList };
                        resultMessage = `Persisted future mandate onto Sequence ${asString(seq.number) || seqIdx + 1} (${asString(seq.title) || 'Sequence'}).`;
                    } else if ((scopePref === 'act' || scopePref === 'auto') && actsList[actIdx]) {
                        const act = { ...actsList[actIdx] };
                        const updatedMandate = appendPersistedMandate(
                            asString(act.act_mandate || act.description),
                            mandateText,
                            label
                        );
                        act.act_mandate = updatedMandate;
                        act.description = updatedMandate;
                        actsList[actIdx] = act;
                        currentStory = { ...currentStory, acts: actsList };
                        resultMessage = `Persisted future mandate onto Act ${asString(act.number) || actIdx + 1} (${asString(act.title) || 'Act'}).`;
                    } else {
                        currentStory = {
                            ...currentStory,
                            author_note: appendPersistedMandate(
                                asString(currentStory.author_note),
                                mandateText,
                                label
                            )
                        };
                        resultMessage = "Persisted future mandate onto Story Author's Note.";
                    }
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'MODIFY_SEQUENCE') {
                    const seqList = [...asArray<Record<string, unknown>>(currentStory.sequences)];
                    if (seqList[seqIdx]) {
                        const seq = { ...seqList[seqIdx] };
                        if (details.title) seq.title = details.title;
                        if (details.sequence_function !== undefined) {
                            seq.sequence_function = details.sequence_function;
                        }
                        if (details.dramatic_question !== undefined) {
                            seq.dramatic_question = details.dramatic_question;
                            seq.tactical_question = details.dramatic_question;
                        }
                        if (details.starting_state !== undefined) {
                            seq.starting_state = details.starting_state;
                        }
                        if (details.description !== undefined) {
                            seq.description = details.description;
                            seq.summary = details.description;
                        }
                        if (details.sequence_objective !== undefined) {
                            seq.sequence_objective = details.sequence_objective;
                        }
                        if (details.four_corner_movement !== undefined) {
                            seq.four_corner_movement = details.four_corner_movement;
                        }
                        if (details.sequence_climax !== undefined) {
                            seq.sequence_climax = details.sequence_climax;
                        }
                        if (details.ending_hook !== undefined) {
                            seq.ending_hook = details.ending_hook;
                        }
                        if (details.next_sequence_boundary_guard !== undefined) {
                            seq.next_sequence_boundary_guard = details.next_sequence_boundary_guard;
                        }
                        if (details.threads_advanced !== undefined) {
                            seq.threads_advanced = Array.isArray(details.threads_advanced)
                                ? details.threads_advanced
                                : String(details.threads_advanced)
                                      .split(/[,;\n]+/)
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                        }
                        if (details.characters_in_focus !== undefined) {
                            seq.characters_in_focus = Array.isArray(details.characters_in_focus)
                                ? details.characters_in_focus
                                : String(details.characters_in_focus)
                                      .split(/[,;\n]+/)
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                        }

                        seqList[seqIdx] = seq;
                        currentStory = { ...currentStory, sequences: seqList };
                        ctx.setStory(currentStory);
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: Surgically modified Sequence ${asString(seq.number) || seqIdx + 1}.`,
                            'success'
                        );
                    } else {
                        throw new Error(`Sequence at index ${seqIdx} not found.`);
                    }
                } else if (action.action_type === 'ADD_SEQUENCE') {
                    const acts = asArray(currentStory.acts);
                    if (!acts[actIdx]) throw new Error(`Act at index ${actIdx} not found.`);
                    const parentAct = actIdx + 1;
                    const sequences = asArray<Record<string, unknown>>(currentStory.sequences);
                    const firstIdx = sequences.findIndex(
                        (seq, idx) => Number(seq.parent_act || actForSequence(idx + 1)) >= parentAct
                    );
                    const nextActIdx = sequences.findIndex(
                        (seq, idx) => Number(seq.parent_act || actForSequence(idx + 1)) > parentAct
                    );
                    const startIdx = firstIdx === -1 ? sequences.length : firstIdx;
                    const endIdx = nextActIdx === -1 ? sequences.length : nextActIdx;
                    const requestedIdx = details.insert_at_idx;
                    const insertIdx =
                        requestedIdx !== undefined && requestedIdx !== null && requestedIdx !== ''
                            ? Number(requestedIdx)
                            : endIdx;
                    if (!Number.isInteger(insertIdx) || insertIdx < startIdx || insertIdx > endIdx) {
                        throw new Error('ADD_SEQUENCE insertion index must be within the target act.');
                    }
                    currentStory = reindexStoryForSequenceInsert(
                        currentStory as unknown as Partial<Story> & Record<string, unknown>,
                        insertIdx,
                        {
                            title: asString(details.title) || 'New Sequence',
                            parent_act: parentAct,
                            sequence_function: asString(details.sequence_function),
                            dramatic_question: asString(details.dramatic_question),
                            tactical_question: asString(details.dramatic_question),
                            starting_state: asString(details.starting_state),
                            description: asString(details.description),
                            summary: asString(details.description),
                            sequence_objective: asString(details.sequence_objective),
                            four_corner_movement: asString(details.four_corner_movement),
                            next_sequence_boundary_guard: asString(
                                details.next_sequence_boundary_guard
                            )
                        }
                    ) as PipelineStory;
                    rekeyResultScenes((key) =>
                        key.replace(
                            /^(\d+)-/,
                            (_, seq) =>
                                `${Number(seq) >= insertIdx ? Number(seq) + 1 : Number(seq)}-`
                        )
                    );
                    resultMessage = `Added Sequence ${insertIdx + 1} in Act ${parentAct}.`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'DELETE_SEQUENCE') {
                    currentStory = reindexStoryForSequenceDelete(
                        currentStory as unknown as Partial<Story> & Record<string, unknown>,
                        seqIdx
                    ) as PipelineStory;
                    rekeyResultScenes((key) =>
                        Number(key.split('-')[0]) === seqIdx
                            ? null
                            : key.replace(
                                  /^(\d+)-/,
                                  (_, seq) =>
                                      `${Number(seq) > seqIdx ? Number(seq) - 1 : Number(seq)}-`
                              )
                    );
                    resultMessage = `Deleted Sequence ${seqIdx + 1}.`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                }

                // SCALE 3: DEVELOPED SCENE BLUEPRINT OPERATIONS
                else if (action.action_type === 'MODIFY_SCENE') {
                    const scenesMap = asRecord(currentStory.scenes);
                    const seqScenes = [...asArray<Record<string, unknown>>(scenesMap[sceneKey])];
                    if (seqScenes[sceneIdx]) {
                        const origScene = seqScenes[sceneIdx];
                        const scene: Record<string, unknown> = { ...origScene };
                        if (details.title !== undefined && details.title !== '') {
                            scene.title = details.title;
                        }
                        if (details.objective !== undefined) {
                            scene.objective = details.objective;
                            scene.goal = details.objective;
                        }
                        if (details.scene_type) scene.scene_type = details.scene_type;

                        const modeToUse = details.dominant_narrative_mode || details.mode_override;
                        if (modeToUse) scene.dominant_narrative_mode = modeToUse;

                        [
                            'pov_character',
                            'setting',
                            'scene_events',
                            'atmospheric_overview',
                            'surface_activity',
                            'main_character_heart',
                            'other_character_heart',
                            'the_hinge_moment',
                            'exit_hook',
                            'transition_jump',
                            'entrance_conditions',
                            'exit_conditions',
                            'micro_conflict_and_tactic',
                            'sensory_palette',
                            'scene_pacing_tempo',
                            'character_voice_directives',
                            'epistemic_friction_level',
                            'activation_contexts'
                        ].forEach((field) => {
                            if (details[field] !== undefined) scene[field] = details[field];
                        });

                        if (details.modality_hand !== undefined) {
                            scene.modality_hand = canonicalizeModalityHand(
                                details.modality_hand,
                                asArray<string>(origScene.modality_hand)
                            );
                        }
                        if (details.value_shift !== undefined) {
                            scene.value_shift = parseValueShiftInput(details.value_shift);
                        }
                        if (details.plot_commitments !== undefined) {
                            scene.plot_commitments = Array.isArray(details.plot_commitments)
                                ? details.plot_commitments
                                : typeof details.plot_commitments === 'string'
                                  ? details.plot_commitments
                                        .split(';')
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                  : [];
                        }
                        if (details.cast_names !== undefined) {
                            const resolvedCast = resolveSceneCastFields(
                                details.cast_names,
                                asArray<CastMember>(currentStory.cast)
                            );
                            scene.cast_names = resolvedCast.cast_names;
                            scene.characters_present = resolvedCast.characters_present;
                            scene.cast_ids = resolvedCast.cast_ids;
                        }
                        if (
                            details.description !== undefined &&
                            details.description !== '' &&
                            !details.scene_events &&
                            !scene.scene_events
                        ) {
                            scene.scene_events = details.description;
                        }

                        const seqObj = asOptionalRecord(asArray(currentStory.sequences)[seqIdx]);
                        const sequenceNum = Number(seqObj?.number || seqIdx + 1);
                        const normalizedScene = normalizeSceneBlueprint(
                            scene as SceneBlueprint & Record<string, unknown>,
                            sceneIdx,
                            sequenceNum,
                            asArray<CastMember>(currentStory.cast)
                        ) as unknown as Record<string, unknown>;
                        normalizedScene.id = origScene.id || `${sequenceNum}.${sceneIdx + 1}`;
                        normalizedScene.number =
                            origScene.number || `${sequenceNum}.${sceneIdx + 1}`;

                        const blueprintDiffFields = [
                            'title',
                            'pov_character',
                            'setting',
                            'dominant_narrative_mode',
                            'scene_type',
                            'transition_jump',
                            'entrance_conditions',
                            'exit_conditions',
                            'objective',
                            'scene_events',
                            'atmospheric_overview',
                            'modality_hand',
                            'micro_conflict_and_tactic',
                            'sensory_palette',
                            'scene_pacing_tempo',
                            'character_voice_directives',
                            'surface_activity',
                            'main_character_heart',
                            'other_character_heart',
                            'the_hinge_moment',
                            'value_shift',
                            'exit_hook',
                            'cast_names',
                            'plot_commitments'
                        ].filter(
                            (field) =>
                                JSON.stringify(normalizedScene[field] ?? '') !==
                                JSON.stringify(origScene[field] ?? '')
                        );

                        const hasExplicitProseActionLater = planActions
                            .slice(i + 1)
                            .some((nextAct) => {
                                const nextSeq = parseInt(
                                    String(
                                        nextAct.target_sequence_idx ?? nextAct.target_seq_idx ?? 0
                                    ),
                                    10
                                );
                                const nextScene = parseInt(
                                    String(nextAct.target_scene_idx ?? 0),
                                    10
                                );
                                return (
                                    `${nextSeq}-${nextScene}` === sId &&
                                    [
                                        'SURGICAL_PATCH_PROSE',
                                        'LINE_EDIT_PROSE',
                                        'REWRITE_PROSE'
                                    ].includes(nextAct.action_type)
                                );
                            });

                        const currentSceneProseFinal = asString(
                            asOptionalRecord(asRecord(currentStory.prose)[sId])?.final
                        );
                        if (
                            blueprintDiffFields.length > 0 &&
                            currentSceneProseFinal &&
                            !hasExplicitProseActionLater
                        ) {
                            cascadeInstructions = `Modify Scene ${seqIdx + 1}.${sceneIdx + 1} prose to reflect these updated Scene Blueprint fields:\n${JSON.stringify(
                                blueprintDiffFields.map((field) => ({
                                    field,
                                    before: origScene[field] ?? '',
                                    after: normalizedScene[field]
                                })),
                                null,
                                2
                            )}`;
                        }

                        seqScenes[sceneIdx] = normalizedScene;
                        currentStory = {
                            ...currentStory,
                            scenes: { ...scenesMap, [sceneKey]: seqScenes }
                        };
                        ctx.setStory(currentStory);
                        resultMessage = `Modified Scene ${seqIdx + 1}.${sceneIdx + 1} ("${asString(normalizedScene.title)}") blueprint.`;
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                            'success'
                        );
                    } else {
                        throw new Error(
                            `Scene at index ${sceneIdx} in Sequence ${seqIdx + 1} not found.`
                        );
                    }
                } else if (action.action_type === 'ADD_SCENE') {
                    const scenesMap = asRecord(currentStory.scenes);
                    const seqScenes = [...asArray<Record<string, unknown>>(scenesMap[sceneKey])];
                    const rawInsertIdx =
                        details.insert_at_idx !== undefined && details.insert_at_idx !== ''
                            ? parseInt(String(details.insert_at_idx), 10)
                            : seqScenes.length;
                    const insertIdx = Number.isFinite(rawInsertIdx)
                        ? Math.max(0, Math.min(seqScenes.length, rawInsertIdx))
                        : seqScenes.length;

                    const nextBeats = { ...asRecord(currentStory.beats) };
                    const nextProse = { ...asRecord(currentStory.prose) };
                    const numScenes = seqScenes.length;

                    for (let idx = numScenes - 1; idx >= insertIdx; idx--) {
                        const oldKey = `${seqIdx}-${idx}`;
                        const newKey = `${seqIdx}-${idx + 1}`;
                        if (nextBeats[oldKey]) {
                            nextBeats[newKey] = nextBeats[oldKey];
                            delete nextBeats[oldKey];
                        }
                        if (nextProse[oldKey]) {
                            nextProse[newKey] = nextProse[oldKey];
                            delete nextProse[oldKey];
                        }
                    }

                    const seqObj = asOptionalRecord(asArray(currentStory.sequences)[seqIdx]);
                    const sequenceNum = Number(seqObj?.number || seqIdx + 1);
                    const newSceneNum = `${sequenceNum}.${insertIdx + 1}`;
                    const resolvedCast = resolveSceneCastFields(
                        details.cast_names || '',
                        asArray<CastMember>(currentStory.cast)
                    );
                    const parsedValueShift = parseValueShiftInput(details.value_shift);
                    const prevHand =
                        insertIdx > 0 ? asArray<string>(seqScenes[insertIdx - 1]?.modality_hand) : [];
                    const allModalities = Object.values(STRUCTURAL_MODALITIES || {}).map(
                        (m) => m.name
                    );
                    const defaultHand = allModalities
                        .filter((m) => !prevHand.includes(m))
                        .slice(0, 3);
                    const modalityHand = canonicalizeModalityHand(
                        details.modality_hand,
                        defaultHand
                    );

                    const newSceneDraft: Record<string, unknown> = {
                        id: newSceneNum,
                        number: newSceneNum,
                        title: asString(details.title) || 'New Scene',
                        pov_character:
                            asString(details.pov_character) || resolvedCast.cast_names[0] || '',
                        setting: asString(details.setting),
                        goal: asString(details.objective),
                        objective: asString(details.objective),
                        scene_events: asString(details.scene_events || details.description),
                        atmospheric_overview: asString(details.atmospheric_overview),
                        modality_hand: modalityHand,
                        surface_activity: asString(details.surface_activity),
                        main_character_heart: asString(details.main_character_heart),
                        other_character_heart: asString(details.other_character_heart),
                        the_hinge_moment: asString(details.the_hinge_moment),
                        exit_hook: asString(details.exit_hook),
                        micro_conflict_and_tactic: asString(details.micro_conflict_and_tactic),
                        sensory_palette: asString(details.sensory_palette),
                        scene_pacing_tempo: asString(details.scene_pacing_tempo),
                        character_voice_directives: asString(details.character_voice_directives),
                        epistemic_friction_level:
                            asString(details.epistemic_friction_level) || 'MODERATE',
                        activation_contexts: asString(details.activation_contexts),
                        entrance_conditions: asString(details.entrance_conditions),
                        exit_conditions: asString(details.exit_conditions),
                        scene_type:
                            asString(details.scene_type) ||
                            (insertIdx % 2 === 0 ? 'PROACTIVE' : 'REACTIVE'),
                        transition_jump:
                            asString(details.transition_jump) ||
                            (insertIdx === 0
                                ? 'Sequence opening'
                                : 'Seamless temporal/spatial continuation'),
                        dominant_narrative_mode:
                            asString(details.dominant_narrative_mode || details.mode_override) ||
                            'BASELINE_NEUTRAL',
                        cast_ids: resolvedCast.cast_ids,
                        cast_names: resolvedCast.cast_names,
                        characters_present: resolvedCast.characters_present,
                        thread_ids: ['T1'],
                        active_thread_ids: ['T1'],
                        value_shift: parsedValueShift,
                        relationship_shifts: [],
                        relationship_changes: [],
                        state_changes_introduced: []
                    };
                    if (details.plot_commitments) {
                        newSceneDraft.plot_commitments = Array.isArray(details.plot_commitments)
                            ? details.plot_commitments
                            : String(details.plot_commitments)
                                  .split(';')
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                    }
                    const newScene = normalizeSceneBlueprint(
                        newSceneDraft as SceneBlueprint & Record<string, unknown>,
                        insertIdx,
                        sequenceNum,
                        asArray<CastMember>(currentStory.cast)
                    ) as unknown as Record<string, unknown>;

                    seqScenes.splice(insertIdx, 0, newScene);
                    seqScenes.forEach((sc, idx) => {
                        sc.id = `${sequenceNum}.${idx + 1}`;
                        sc.number = sc.id;
                    });

                    currentStory = {
                        ...currentStory,
                        scenes: { ...scenesMap, [sceneKey]: seqScenes },
                        beats: nextBeats,
                        prose: nextProse
                    };
                    rekeyResultScenes((key) => {
                        const [seq, scene] = key.split('-').map(Number);
                        return seq === seqIdx && scene >= insertIdx ? `${seq}-${scene + 1}` : key;
                    });
                    resultMessage = `Added Scene ${sequenceNum}.${insertIdx + 1} ("${asString(newScene.title)}").`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'DELETE_SCENE') {
                    const scenesMap = asRecord(currentStory.scenes);
                    const seqScenes = [...asArray<Record<string, unknown>>(scenesMap[sceneKey])];

                    if (seqScenes[sceneIdx]) {
                        const deletedSceneTitle = asString(seqScenes[sceneIdx].title);
                        const nextBeats = { ...asRecord(currentStory.beats) };
                        const nextProse = { ...asRecord(currentStory.prose) };
                        const numScenes = seqScenes.length;

                        const delKey = `${seqIdx}-${sceneIdx}`;
                        delete nextBeats[delKey];
                        delete nextProse[delKey];

                        for (let idx = sceneIdx + 1; idx < numScenes; idx++) {
                            const oldKey = `${seqIdx}-${idx}`;
                            const newKey = `${seqIdx}-${idx - 1}`;
                            if (nextBeats[oldKey]) {
                                nextBeats[newKey] = nextBeats[oldKey];
                                delete nextBeats[oldKey];
                            }
                            if (nextProse[oldKey]) {
                                nextProse[newKey] = nextProse[oldKey];
                                delete nextProse[oldKey];
                            }
                        }

                        seqScenes.splice(sceneIdx, 1);
                        const seqObj = asOptionalRecord(asArray(currentStory.sequences)[seqIdx]);
                        const sequenceNum = Number(seqObj?.number || seqIdx + 1);
                        seqScenes.forEach((sc, idx) => {
                            sc.id = `${sequenceNum}.${idx + 1}`;
                            sc.number = sc.id;
                        });

                        currentStory = {
                            ...currentStory,
                            scenes: { ...scenesMap, [sceneKey]: seqScenes },
                            beats: nextBeats,
                            prose: nextProse
                        };
                        rekeyResultScenes((key) => {
                            const [seq, scene] = key.split('-').map(Number);
                            return seq !== seqIdx
                                ? key
                                : scene === sceneIdx
                                  ? null
                                  : scene > sceneIdx
                                    ? `${seq}-${scene - 1}`
                                    : key;
                        });
                        ctx.setStory(currentStory);
                        logMessage(
                            `[Action ${actionNum}/${totalActions}] Success: Deleted Scene "${deletedSceneTitle}" at index ${sceneIdx}.`,
                            'success'
                        );
                    } else {
                        throw new Error(
                            `Scene at index ${sceneIdx} in Sequence ${seqIdx + 1} not found.`
                        );
                    }
                } else if (action.action_type === 'MOVE_SCENE') {
                    const destinations = [
                        action.to_sequence_idx,
                        details.to_sequence_idx,
                        details.target_sequence_idx,
                        details.target_seq_idx
                    ];
                    if (
                        destinations.some(
                            (idx) =>
                                idx !== undefined &&
                                idx !== null &&
                                idx !== '' &&
                                Number(idx) !== seqIdx
                        ) ||
                        !/^\d+$/.test(String(details.to_idx ?? ''))
                    ) {
                        throw new Error('MOVE_SCENE only supports moves within a sequence');
                    }
                    const toIdx = Number(details.to_idx);
                    const scenesMap = asRecord(currentStory.scenes);
                    const seqScenes = asArray<Record<string, unknown>>(scenesMap[sceneKey]);
                    if (!seqScenes[sceneIdx] || toIdx >= seqScenes.length) {
                        throw new Error(
                            'MOVE_SCENE source and destination must be existing scenes in the sequence.'
                        );
                    }
                    const order = seqScenes.map((_, idx) => idx);
                    order.splice(toIdx, 0, order.splice(sceneIdx, 1)[0]);
                    const currentBeats = asRecord(currentStory.beats);
                    const currentProse = asRecord(currentStory.prose);
                    const nextBeats = { ...currentBeats };
                    const nextProse = { ...currentProse };
                    const seqObj = asOptionalRecord(asArray(currentStory.sequences)[seqIdx]);
                    const sequenceNum = Number(seqObj?.number || seqIdx + 1);
                    const scenes = order.map((oldIdx, newIdx) => {
                        const oldKey = `${seqIdx}-${oldIdx}`;
                        const newKey = `${seqIdx}-${newIdx}`;
                        delete nextBeats[newKey];
                        delete nextProse[newKey];
                        if (Object.prototype.hasOwnProperty.call(currentBeats, oldKey)) {
                            nextBeats[newKey] = currentBeats[oldKey];
                        }
                        if (Object.prototype.hasOwnProperty.call(currentProse, oldKey)) {
                            nextProse[newKey] = currentProse[oldKey];
                        }
                        return {
                            ...seqScenes[oldIdx],
                            id: `${sequenceNum}.${newIdx + 1}`,
                            number: `${sequenceNum}.${newIdx + 1}`
                        };
                    });
                    currentStory = {
                        ...currentStory,
                        scenes: { ...scenesMap, [sceneKey]: scenes },
                        beats: nextBeats,
                        prose: nextProse
                    };
                    rekeyResultScenes((key) => {
                        const [seq, scene] = key.split('-').map(Number);
                        return seq === seqIdx ? `${seq}-${order.indexOf(scene)}` : key;
                    });
                    resultMessage = `Moved Scene ${sceneIdx + 1} to position ${toIdx + 1} in Sequence ${seqIdx + 1}.`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                }

                // SCALE 4: WRITTEN PROSE SURGICAL PATCHING, LINE EDITING & REWRITING
                else if (action.action_type === 'SURGICAL_PATCH_PROSE') {
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Applying surgical prose patch to Scene ${sceneIdx + 1}...`,
                        'running'
                    );
                    if (details.find_text && !details.instructions) {
                        const proseMap = asRecord(currentStory.prose);
                        const proseObj = asRecord(proseMap[sId]);
                        const currentProse =
                            typeof proseMap[sId] === 'string'
                                ? asString(proseMap[sId])
                                : asString(proseObj.final);
                        if (!currentProse.trim()) {
                            throw new Error(
                                `Scene ${sceneIdx + 1} has no written prose yet. Generate prose first or use Write Prose.`
                            );
                        }
                        const findText = asString(details.find_text);
                        const report = applyParsedEdits(currentProse, [
                            {
                                index: 0,
                                type: 'search_replace',
                                search: findText,
                                replace: asString(details.replace_text)
                            }
                        ]);
                        if (!report.applied.length) {
                            throw new Error(
                                `find_text not found in Scene ${sceneIdx + 1} prose: "${findText.slice(0, 60)}"`
                            );
                        }
                        const changeRatio = computeChangeRatio(currentProse, report.text);
                        if (
                            changeRatio > SURGICAL_MAX_CHANGE_RATIO &&
                            action.allow_large_change !== true
                        ) {
                            throw new Error(
                                `Edit rejected: would change ${Math.round(changeRatio * 100)}% of the scene (limit 60%)`
                            );
                        }
                        const prose: Record<string, unknown> = { ...proseObj, final: report.text };
                        delete prose.stale;
                        currentStory = {
                            ...currentStory,
                            prose: { ...proseMap, [sId]: prose }
                        };
                        appliedEditsForAction = report.applied as AppliedSurgicalEdit[];
                        resultMessage =
                            report.summary ||
                            `Applied direct patch to Scene ${sceneIdx + 1} prose.`;
                    } else {
                        const patched = await applySurgicalProsePatch(ctx, {
                            story: currentStory,
                            seqIdx,
                            sceneIdx,
                            instructions:
                                asString(details.instructions) ||
                                action.description ||
                                'Apply surgical edits seamlessly.',
                            allowLargeChange: action.allow_large_change,
                            logName: 'Surgical Prose Editor'
                        });
                        currentStory = patched.story;
                        appliedEditsForAction = patched.appliedEdits;
                        resultMessage = patched.message;
                    }
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'LINE_EDIT_PROSE') {
                    const proseMap = asRecord(currentStory.prose);
                    const proseObj = asRecord(proseMap[sId]);
                    let currentProse =
                        typeof proseMap[sId] === 'string'
                            ? asString(proseMap[sId])
                            : asString(proseObj.final);

                    if (!currentProse.trim()) {
                        throw new Error(`Scene ${sceneIdx + 1} has no written prose yet to line-edit.`);
                    }

                    const edits: Array<{ find: string; replace: string }> = [
                        ...(details.find_text
                            ? [{ find: asString(details.find_text), replace: asString(details.replace_text) }]
                            : []),
                        ...(Array.isArray(details.line_edits)
                            ? details.line_edits.map((le) => {
                                  const leRec = asRecord(le);
                                  return {
                                      find: asString(leRec.find),
                                      replace: asString(leRec.replace)
                                  };
                              })
                            : [])
                    ];
                    const misses: string[] = [];
                    let appliedEdits = 0;
                    appliedEditsForAction = [];
                    for (const [index, edit] of edits.entries()) {
                        const report = applyParsedEdits(currentProse, [
                            {
                                index,
                                type: 'search_replace',
                                search: edit.find,
                                replace: edit.replace || ''
                            }
                        ]);
                        if (!report.applied.length) {
                            misses.push(
                                `find_text not found in Scene ${sceneIdx + 1} prose: "${(edit.find || '').slice(0, 60)}"`
                            );
                            continue;
                        }
                        currentProse = report.text;
                        appliedEditsForAction.push(...report.applied);
                        appliedEdits++;
                    }
                    if (appliedEdits === 0) {
                        throw new Error(
                            misses.join('; ') || `No line edits provided for Scene ${sceneIdx + 1} prose.`
                        );
                    }
                    resultMessage = `Applied ${appliedEdits} line edit(s) to Scene ${sceneIdx + 1} prose.${misses.length ? ` Misses: ${misses.join('; ')}` : ''}`;

                    currentStory = {
                        ...currentStory,
                        prose: {
                            ...proseMap,
                            [sId]: { ...proseObj, final: currentProse }
                        }
                    };
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'REWRITE_PROSE') {
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Running Writing Agent for Scene ${sceneIdx + 1}...`,
                        'running'
                    );

                    const modeToUse = details.mode_override || details.dominant_narrative_mode;
                    if (modeToUse !== undefined) {
                        const scenesMap = asRecord(currentStory.scenes);
                        const scenesList = [...asArray<Record<string, unknown>>(scenesMap[sceneKey])];
                        if (scenesList[sceneIdx]) {
                            scenesList[sceneIdx] = {
                                ...scenesList[sceneIdx],
                                dominant_narrative_mode: modeToUse === '' ? null : modeToUse
                            };
                            currentStory = {
                                ...currentStory,
                                scenes: { ...scenesMap, [sceneKey]: scenesList }
                            };
                            ctx.setStory(currentStory);
                        }
                    }

                    currentStory =
                        (await writeSceneProse(
                            ctx,
                            seqIdx,
                            sceneIdx,
                            currentStory,
                            true,
                            asString(details.instructions),
                            { forceFullRewrite: true }
                        )) || currentStory;
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: Rewrote prose for Scene ${sceneIdx + 1}.`,
                        'success'
                    );
                } else if (action.action_type === 'ADD_PROPOSITION') {
                    const graph: EpistemicGraph = ensureEpistemicGraph(
                        currentStory as unknown as ContinuityStoryState
                    );
                    currentStory.epistemic_graph = graph;
                    const propId = details.id ? asString(details.id).trim() : `prop_${Date.now()}`;
                    const objTruthRaw = asString(details.objective_truth);
                    const objectiveTruth: 'TRUE' | 'FALSE' | 'UNRESOLVED' =
                        objTruthRaw === 'TRUE' || objTruthRaw === 'FALSE' || objTruthRaw === 'UNRESOLVED'
                            ? objTruthRaw
                            : 'TRUE';
                    const newProp = {
                        id: propId,
                        claim_text:
                            asString(details.claim_text) ||
                            action.description ||
                            'Unspecified proposition',
                        subject_id: normalizeEntityId(asString(details.subject_id) || 'world'),
                        predicate: (asString(details.predicate) || 'FACT').toUpperCase().trim(),
                        object_id: normalizeEntityId(asString(details.object_id)),
                        objective_truth: objectiveTruth,
                        world_valid_from_scene: asString(details.world_valid_from) || '0.0',
                        world_valid_to_scene: details.world_valid_to
                            ? asString(details.world_valid_to)
                            : null
                    };
                    graph.propositions = normalizeEpistemicPropositionsMap(graph.propositions);
                    graph.propositions[propId] = {
                        ...(graph.propositions[propId] || {}),
                        ...newProp
                    };
                    resultMessage = `Added proposition "${newProp.id}": "${newProp.claim_text}".`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else if (action.action_type === 'MODIFY_EPISTEMIC_BELIEF') {
                    const graph: EpistemicGraph = ensureEpistemicGraph(
                        currentStory as unknown as ContinuityStoryState
                    );
                    currentStory.epistemic_graph = graph;
                    const lookupKey = asString(details.proposition_id || details.claim_text);
                    const targetProp = resolvePropositionMatch(lookupKey, graph);
                    if (!targetProp) {
                        throw new Error(
                            `Proposition matching "${lookupKey}" not found in epistemic graph.`
                        );
                    }
                    const holderId = normalizeEntityId(
                        asString(details.holder_id || action.target_character_id) || 'meta_reader'
                    );
                    const targetCoord = asString(details.target_scene || details.scene_coord) || '1.1';
                    const stance = (asString(details.stance) || 'BELIEVES_TRUE').toUpperCase().trim();
                    const parsedConf = Number(details.confidence);
                    const conf =
                        Number.isFinite(parsedConf) && details.confidence !== ''
                            ? Math.max(0, Math.min(1, parsedConf))
                            : 0.85;
                    const srcType = asString(details.source_type) || 'INFERRED';
                    const srcAgent = details.told_by ? normalizeEntityId(asString(details.told_by)) : null;

                    const currentEdges = (graph.first_order_edges || graph.holds_belief_edges || []).map(
                        (e) => {
                            if (
                                e.holder_id === holderId &&
                                e.proposition_id === targetProp.id &&
                                (!e.invalidated_at_scene ||
                                    compareSceneCoordinates(
                                        e.invalidated_at_scene,
                                        targetCoord,
                                        currentStory as unknown as ContinuityStoryState
                                    ) > 0)
                            ) {
                                return { ...e, invalidated_at_scene: targetCoord };
                            }
                            return e;
                        }
                    );

                    if (stance !== 'UNAWARE') {
                        currentEdges.push({
                            id: `belief_${holderId}_${targetProp.id}_${Date.now()}`,
                            holder_id: holderId,
                            proposition_id: targetProp.id,
                            stance,
                            confidence: conf,
                            source_type: srcType,
                            source_agent_id: srcAgent,
                            acquired_at_scene: targetCoord,
                            invalidated_at_scene: null,
                            emotional_charge: 0.5
                        });
                    }
                    graph.holds_belief_edges = currentEdges;
                    graph.first_order_edges = currentEdges;

                    resultMessage = `Updated ${holderId} belief on "${targetProp.id}" to ${stance} (${Math.round(conf * 100)}%).`;
                    ctx.setStory(currentStory);
                    logMessage(
                        `[Action ${actionNum}/${totalActions}] Success: ${resultMessage}`,
                        'success'
                    );
                } else {
                    throw new Error(`Unsupported directive action: ${action.action_type}`);
                }

                // Clear stale flag if prose actions completed directly on sId
                const postProseMap = asRecord(currentStory.prose);
                const postProseEntry = asOptionalRecord(postProseMap[sId]);
                if (
                    ['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE', 'REWRITE_PROSE'].includes(
                        action.action_type
                    ) &&
                    postProseEntry?.stale
                ) {
                    const cleanedProse = { ...postProseEntry };
                    delete cleanedProse.stale;
                    currentStory = {
                        ...currentStory,
                        prose: { ...postProseMap, [sId]: cleanedProse }
                    };
                    ctx.setStory(currentStory);
                }

                // Scene-to-Prose Cascade when a blueprint changed and no explicit prose action follows
                const postCascadeCheckFinal = asString(
                    asOptionalRecord(asRecord(currentStory.prose)[sId])?.final
                );
                if (cascadeInstructions && postCascadeCheckFinal) {
                    const cascadeLabel = `[Action ${actionNum}/${totalActions} · cascade]`;
                    if (cascadeSceneChanges) {
                        logMessage(
                            `${cascadeLabel} Applying scene blueprint changes to written prose...`,
                            'running'
                        );
                        try {
                            const patched = await applySurgicalProsePatch(ctx, {
                                story: currentStory,
                                seqIdx,
                                sceneIdx,
                                instructions: `The scene's blueprint has changed. Apply the following change to the written prose with minimal edits.\n${cascadeInstructions}`,
                                allowLargeChange: action.allow_large_change,
                                logName: 'Surgical Prose Editor (Scene Cascade)'
                            });
                            currentStory = patched.story;
                            cascadeResult = {
                                status: 'applied',
                                message: patched.message,
                                appliedEdits: patched.appliedEdits
                            };
                            logMessage(`${cascadeLabel} Success: ${patched.message}`, 'success');
                        } catch (err) {
                            const message = extractErrorMessage(err);
                            cascadeResult = { status: 'failed', message, appliedEdits: [] };
                            logMessage(`${cascadeLabel} Failed: ${message}`, 'error');
                        }
                    } else {
                        cascadeResult = {
                            status: 'skipped',
                            message: 'Scene blueprint changes applied; prose cascade is disabled.',
                            appliedEdits: []
                        };
                        logMessage(`${cascadeLabel} Skipped: ${cascadeResult.message}`, 'pending');
                    }

                    if (cascadeResult.status !== 'applied') {
                        const existingMap = asRecord(currentStory.prose);
                        currentStory = {
                            ...currentStory,
                            prose: {
                                ...existingMap,
                                [sId]: {
                                    ...asRecord(existingMap[sId]),
                                    stale: {
                                        reason:
                                            cascadeResult.status === 'failed'
                                                ? 'Scene-to-prose cascade failed.'
                                                : 'Scene blueprint changed with prose cascade disabled.',
                                        at: Date.now()
                                    }
                                }
                            }
                        };
                    }
                    ctx.setStory(currentStory);
                }

                results[i] = {
                    status: 'applied',
                    message: resultMessage || action.description || action.action_type,
                    ...(appliedEditsForAction
                        ? { appliedEdits: appliedEditsForAction, proseSceneId: sId }
                        : {}),
                    ...(cascadeResult ? { cascade: cascadeResult, proseSceneId: sId } : {})
                };

                const finalProseAfterAction = asString(
                    asOptionalRecord(asRecord(currentStory.prose)[sId])?.final
                );
                if (action.action_type === 'REWRITE_PROSE') {
                    // The full writing pipeline already reviewed and archived the replacement.
                    touchedProseScenes.delete(sId);
                    lastProseActions.delete(sId);
                } else if (
                    (['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE'].includes(action.action_type) ||
                        cascadeResult?.status === 'applied') &&
                    finalProseAfterAction !== proseBeforeAction
                ) {
                    touchedProseScenes.add(sId);
                    lastProseActions.set(sId, i);
                }
            } catch (err) {
                const message = extractErrorMessage(err);
                console.error(`Directive action ${actionNum} failed:`, err);
                results[i] = { status: 'failed', message };
                logMessage(`[Action ${actionNum}/${totalActions}] Failed: ${message}`, 'error');
                continue;
            } finally {
                ctx.setDirectiveProgress?.(Math.round(((i + 1) / totalActions) * 100));
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const touchedInOrder = [...touchedProseScenes].sort((a, b) => {
            const [aSeq, aScene] = a.split('-').map(Number);
            const [bSeq, bScene] = b.split('-').map(Number);
            return aSeq - bSeq || aScene - bScene;
        });

        if (verifyDirectiveEdits) {
            for (const sId of touchedInOrder) {
                const verified = await verifyAndArchiveDirectiveScene(
                    ctx,
                    currentStory,
                    sId,
                    logMessage
                );
                currentStory = verified.story;
                const lastIdx = lastProseActions.get(sId);
                if (lastIdx !== undefined && results[lastIdx]) {
                    results[lastIdx].review = verified.review;
                }
                ctx.setStory(currentStory);
            }
        }

        const currentPlan = ctx.getDirectivePlan?.() || null;
        const consistencyReview =
            currentPlan?.scope_kind === 'arc' && touchedInOrder.length >= 2
                ? await reviewDirectiveConsistency(
                      ctx,
                      currentStory,
                      touchedInOrder,
                      currentPlan.consistency_notes,
                      logMessage
                  )
                : undefined;

        ctx.setDirectivePlan?.((prev) =>
            prev
                ? {
                      ...prev,
                      consistencyReview,
                      actions: prev.actions.map((action, idx) =>
                          results[idx] ? { ...action, result: results[idx] } : action
                      )
                  }
                : prev
        );

        const counts = results.reduce(
            (totals, result) => {
                if (result) totals[result.status]++;
                return totals;
            },
            { applied: 0, failed: 0, skipped: 0 }
        );

        const prefetchCache = ctx.getPrefetchCacheRef?.();
        if (counts.applied > 0 && prefetchCache?.current) {
            prefetchCache.current.clear();
        }
        const summary = `Directive complete: ${counts.applied} applied, ${counts.failed} failed, ${counts.skipped} skipped.`;
        logMessage(summary, 'complete');
        ctx.showToast(summary, counts.failed || counts.skipped ? 'info' : 'success');
    } finally {
        ctx.setIsExecutingDirective?.(false);
    }
}
