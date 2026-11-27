/**
 * @module pipeline/proseContext
 * 4-tier cache-friendly XML context compiler for the Writing Agent prose & audio drama prompt.
 */

import {
    formatActiveActAndSequenceXml,
    formatModalityHand,
    resolveNarrativeActForSequence,
    resolveNarrativeSequenceForIndex
} from '@/config';
import {
    getVoiceDescriptionForCharacter,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import {
    buildUpcomingBoundaryGuardInfo,
    compileActiveState,
    getSequenceScenesList,
    isPreCatalystSequenceOneScene,
    type ContinuityStoryState
} from '@/domain/continuity';
import {
    buildGenreToneStyleBlocks,
    buildRelationshipFrictionBlock,
    formatSceneSummary,
    getAuthorNoteXml,
    parseActNumber,
    parseValueShiftInput
} from '@/domain/story';
import type { Act, CastMember, Relationship, SceneBlueprint, Sequence } from '@/types';
import { isSerializationPlaceholder, safeEscapeRegex } from '@/utils';

export interface ProseContextCastMember extends Partial<CastMember>, Record<string, unknown> {
    name?: string;
    aliases?: unknown[];
    interview_psychology?: string;
    deep_profile?: string;
    corner_role?: string;
    why_it_makes_sense?: string;
    what_it_costs_them?: string;
    way_of_living?: string;
    why_it_is_appealing?: string;
    shared_outlook?: string;
    why_they_are_tempting?: string;
    the_hidden_trap?: string;
    how_they_ended_up?: string;
    human_sympathy?: string;
    the_wake_up_call?: string;
    details?: {
        history?: string;
        goals?: string;
        deep_profile?: string;
        personality?: string;
        [key: string]: unknown;
    };
}

export interface ProseContextStoryInput
    extends Omit<ContinuityStoryState, 'relationships' | 'style'>,
        Record<string, unknown> {
    writing_mode?: string;
    world_primer?: string;
    story_so_far?: string;
    author_note?: string;
    synthesized_authorial_persona?: string;
    genre_pacing_and_dialogue_rules?: string;
    strict_anti_patterns?: string;
    acts?: Act[];
    sequences?: Sequence[];
    scenes?: Record<string, Array<SceneBlueprint & Record<string, unknown>>>;
    relationships?: Record<string, Record<string, unknown>> | Relationship[];
    style?: {
        genre?: string;
        mood?: string;
        writing_guide?: string;
        synthesized_authorial_persona?: string;
        genre_pacing_and_dialogue_rules?: string;
        strict_anti_patterns?: string;
        [key: string]: unknown;
    };
    secret_vault?: Array<{
        status?: string;
        truth?: string;
        title?: string;
        reveal_anchor?: {
            act_number?: number;
            sequence_number?: number;
        };
        cover_story?: {
            character_masks?: Record<
                string,
                {
                    history_mask?: string;
                    trait_mask?: string;
                    apparent_flaw?: string;
                    public_interview_voice?: string;
                }
            >;
        };
    }>;
}

export interface ProseContextNarrativeMode {
    id?: string;
    name?: string;
    category?: string;
    context?: string;
    prompt?: string;
    [key: string]: unknown;
}

export interface RollingDialogueStat {
    wordCount?: number;
    dialogueWords?: number;
}

export interface BuildProseContextParams {
    storyToUse?: ProseContextStoryInput;
    scene?: SceneBlueprint & Record<string, unknown>;
    sequenceData?: (Sequence & Record<string, unknown>) | null;
    s?: number;
    seq?: number;
    actData?: (Act & Record<string, unknown>) | null;
    activeCast?: ProseContextCastMember[];
    loreContext?: string | Array<{ text?: string; detail?: string }>;
    previousScene?: (SceneBlueprint & Record<string, unknown>) | null;
    previousSceneProseText?: string | null;
    enableNarrativeLenses?: boolean;
    activeModeId?: string;
    narrativeModeObj?: ProseContextNarrativeMode | null;
    injectionPrompt?: string;
    dInst?: string;
    rollingDialogueStats?: RollingDialogueStat[];
    existingProseText?: string;
    existingCritique?: string;
    forceFullRewrite?: boolean;
}

/**
 * Compiles the 4-tier cache-friendly XML context string consumed by prose drafting,
 * rewrite, and Audio Drama Writing Agent prompts.
 */
export function buildProseContext({
    storyToUse = {},
    scene = {} as SceneBlueprint & Record<string, unknown>,
    sequenceData = null,
    s = 0,
    seq = 0,
    actData = null,
    activeCast = [],
    loreContext = '',
    previousScene = null,
    previousSceneProseText = null,
    enableNarrativeLenses = false,
    activeModeId = 'BASELINE_NEUTRAL',
    narrativeModeObj = null,
    injectionPrompt = '',
    dInst = '',
    rollingDialogueStats = [],
    existingProseText = '',
    existingCritique = '',
    forceFullRewrite = false
}: BuildProseContextParams = {}): string {
    const seqObj = (sequenceData || {}) as Partial<Sequence> & Record<string, unknown>;
    const actInfo =
        actData ||
        (storyToUse.acts
            ? (storyToUse.acts.find(
                  (a) => parseActNumber(a.number) === parseActNumber(seqObj.parent_act || 1)
              ) as (Act & Record<string, unknown>) | undefined) || null
            : null);

    const currentSeqNum = Number(seqObj.number || seq + 1 || 1);

    // Epistemic Sanitization: Filter unrevealed secrets for current position
    const unrevealedSecrets = Array.isArray(storyToUse.secret_vault)
        ? storyToUse.secret_vault.filter(
              (sec) =>
                  sec.status !== 'revealed' &&
                  Number(sec.reveal_anchor?.sequence_number || 7) > currentSeqNum
          )
        : [];

    // Sanitize Act Mandate so future twists are not leaked in Act Context
    let sanitizedActMandate = actInfo
        ? String(actInfo.act_mandate || actInfo.description || '')
        : '';
    if (unrevealedSecrets.length > 0 && sanitizedActMandate && actInfo) {
        unrevealedSecrets.forEach((sec) => {
            if (Number(sec.reveal_anchor?.act_number || 3) > Number(actInfo.number || 1)) {
                if (sec.truth && sec.truth.length > 8) {
                    sanitizedActMandate = sanitizedActMandate.replace(
                        new RegExp(safeEscapeRegex(sec.truth), 'gi'),
                        '[Crucial Turning Point Withheld]'
                    );
                }
                if (sec.title) {
                    sanitizedActMandate = sanitizedActMandate.replace(
                        new RegExp(safeEscapeRegex(sec.title), 'gi'),
                        '[Key Reversal Pending]'
                    );
                }
            }
        });
    }

    // Sanitize Active Cast: Apply cover story masks & scrub unrevealed secret truths
    const sanitizedActiveCast = (activeCast || []).map((ch) => {
        if (!ch) return ch;
        const cloned: ProseContextCastMember = { ...ch, details: { ...(ch.details || {}) } };
        unrevealedSecrets.forEach((sec) => {
            const masks = sec.cover_story?.character_masks || {};
            const charNameLower = ch.name ? ch.name.toLowerCase() : '';
            const mask =
                (ch.name ? masks[ch.name] : undefined) ||
                (ch.id ? masks[ch.id] : undefined) ||
                (charNameLower
                    ? Object.entries(masks).find(([k]) => k.toLowerCase() === charNameLower)?.[1]
                    : undefined);
            if (mask && cloned.details) {
                if (mask.history_mask) cloned.details.history = mask.history_mask;
                if (mask.trait_mask) cloned.core_flaw = mask.trait_mask;
                if (mask.apparent_flaw) cloned.core_flaw = mask.apparent_flaw;
                if (mask.public_interview_voice) {
                    cloned.details.deep_profile = mask.public_interview_voice;
                    cloned.interview_psychology = mask.public_interview_voice;
                }
            }
            if (sec.truth && sec.truth.length > 5 && cloned.details) {
                const truthRegex = new RegExp(safeEscapeRegex(sec.truth), 'gi');
                if (cloned.details.deep_profile) {
                    cloned.details.deep_profile = cloned.details.deep_profile.replace(
                        truthRegex,
                        '[Private Personal Motivation]'
                    );
                }
                if (cloned.interview_psychology) {
                    cloned.interview_psychology = cloned.interview_psychology.replace(
                        truthRegex,
                        '[Private Personal Motivation]'
                    );
                }
            }
        });
        return cloned;
    });

    const clueDirectivesBlock = '';
    const revealDirectiveBlock = '';

    // Build context-aware dialogue pacing target
    const rawPresent: unknown[] = [
        ...(Array.isArray(scene.characters_present)
            ? scene.characters_present
            : scene.characters_present
              ? [scene.characters_present]
              : []),
        ...(Array.isArray(scene.cast_names)
            ? scene.cast_names
            : scene.cast_names
              ? [scene.cast_names]
              : []),
        ...(Array.isArray(activeCast) ? activeCast : activeCast ? [activeCast] : [])
    ];
    const presentChars: string[] = [];
    rawPresent.forEach((c) => {
        if (!c) return;
        if (typeof c === 'string') {
            c.split(/[,;\n]+|(?:\band\b)/i)
                .map((str) => str.trim().replace(/^-\s*/, ''))
                .filter(
                    (x) => x && !isSerializationPlaceholder(x) && x.toLowerCase() !== 'narrator'
                )
                .forEach((x) => {
                    if (!presentChars.some((cn) => cn.toLowerCase() === x.toLowerCase())) {
                        presentChars.push(x);
                    }
                });
        } else if (
            typeof c === 'object' &&
            'name' in c &&
            typeof (c as { name?: unknown }).name === 'string'
        ) {
            const cn = String((c as { name: string }).name).trim();
            if (
                cn &&
                !isSerializationPlaceholder(cn) &&
                cn.toLowerCase() !== 'narrator' &&
                !presentChars.some((existing) => existing.toLowerCase() === cn.toLowerCase())
            ) {
                presentChars.push(cn);
            }
        }
    });
    const isSolo = presentChars.length <= 1;

    let dialogueTargetBlock: string;
    if (storyToUse.writing_mode === 'audio_drama') {
        if (isSolo) {
            const soloName = presentChars[0] || scene.pov_character || 'Protagonist';
            dialogueTargetBlock = `
<dialogue_pacing_target>
- Scene Mode: AUDIO DRAMA SOLO SCENE (1 speaking character present: ${soloName})
- Full-Length Execution & Unified Narration: Fulfill the full scene TARGET LENGTH through rich, grounded solo vocalizations from ${soloName} (muttering calculations, reacting aloud to physical obstacles, addressing off-stage voices or comms across multi-sentence turns) paired with vivid, unified single-chunk "Narrator: " paragraphs holding all contiguous narration sentences for each staging beat.
</dialogue_pacing_target>
`;
        } else {
            const charNames = presentChars.join(', ');
            dialogueTargetBlock = `
<dialogue_pacing_target>
- Scene Mode: AUDIO DRAMA MULTI-CHARACTER SCENE (${presentChars.length} speaking characters present: ${charNames})
- Target Spoken Balance & Full Length: Fulfill the entire scene TARGET LENGTH by allocating 75%–90% of spoken words to rich, sustained character dialogue across 40–65+ turns (letting argumentative, persuasive, or emotional turns run 2–4+ breath-unit sentences with mid-line [pivots]), paired with ~15%–25% Narrator staging.
- Unified Narration & Sustained Exchanges: Propel every beat of the scene through extended multi-turn character exchanges (3–6+ consecutive character turns), carrying reactions, tension, and room awareness inside character speech and Drama-3 vocal cues. Consolidate each Narrator staging beat into ONE unified, cohesive "Narrator: " paragraph before handing the floor back to character dialogue.
</dialogue_pacing_target>
`;
        }
    } else if (isSolo) {
        const soloName = presentChars[0] || scene.pov_character || 'Protagonist';
        dialogueTargetBlock = `
<dialogue_pacing_target>
- Scene Mode: SOLO SCENE (1 character present: ${soloName})
- Target Dialogue Density: Minimum 2% of scene word count (typically 2%–5%, approx. 20–60 words of spoken dialogue; dialogue must never be 0%).
- Directive: The character is physically alone in this scene. Do NOT invent artificial, theatrical monologues or long walls of spoken dialogue to hit generic dialogue quotas. Instead, satisfy the spoken dialogue mandate through authentic, grounded solo vocalizations: muttering curses under their breath, whispering quietly under their breath, vocalizing frustration at equipment, addressing an inanimate obstacle, or checking a dead comms channel. Spoken dialogue must feel psychologically grounded in an isolated character coping with stress. Spoken dialogue is strictly required—0% dialogue is never acceptable.
</dialogue_pacing_target>
`;
    } else {
        let priorWords = 0;
        let priorDialogue = 0;
        (rollingDialogueStats || []).forEach((ps) => {
            priorWords += ps.wordCount || 0;
            priorDialogue += ps.dialogueWords || 0;
        });
        const priorDensity = priorWords > 0 ? priorDialogue / priorWords : 0.25;
        const charNames = presentChars.join(', ');

        let targetPacingMode = 'BALANCED';
        let targetDensityRange =
            'Minimum 20% of scene word count (baseline minimum: at least 20%, typically 20%–35%, approx. 300–600 words of spoken dialogue across multi-turn exchanges; dialogue must never be 0%)';
        let pacingDirective =
            "Multiple characters are present. Spoken dialogue is the primary engine of interpersonal tension, relationship friction, and dramatic velocity. Banish silent pantomime where characters merely gesticulate. Characters must actively converse, argue, challenge each other's assumptions, process recent trauma out loud, and verbalize consequences together. Ensure dialogue consists of substantive back-and-forth exchanges rather than isolated barked orders. The target percentage represents a mandatory minimum threshold.";

        if (priorDensity > 0.4) {
            targetPacingMode = 'PHYSICAL_IMMEDIACY';
            targetDensityRange =
                'Minimum 5% of scene word count (baseline minimum: at least 5%, typically 5%–15%, approx. 80–250 words of spoken dialogue; dialogue must never be 0%)';
            pacingDirective = `The preceding scenes were heavily dialogue-driven (prior rolling density: ${(priorDensity * 100).toFixed(1)}%). Ground the narrative in physical reality, spatial movement, sensory atmosphere, and environmental interaction. Dialogue must be sparse, tense, and essential, relying on bodily actions and spatial consequences rather than extended conversations. Spoken dialogue is still mandatory—the 5% target is a strict minimum baseline, not an invitation for 0% dialogue.`;
        } else if (priorDensity < 0.15 && priorWords > 0) {
            targetPacingMode = 'CONVERSATIONAL_COLLISION';
            targetDensityRange =
                'Minimum 35% of scene word count (baseline minimum: at least 35%, typically 35%–50%, approx. 500–850 words of spoken dialogue across active exchanges)';
            pacingDirective = `The preceding scenes had low dialogue density (prior rolling density: ${(priorDensity * 100).toFixed(1)}%). Accelerate interpersonal friction through active back-and-forth dialogue, verbal sparring, revelations, confessions, and direct verbal collision. Dialogue must meet or exceed this minimum baseline.`;
        }

        const minPct =
            targetPacingMode === 'PHYSICAL_IMMEDIACY'
                ? '5%'
                : targetPacingMode === 'CONVERSATIONAL_COLLISION'
                  ? '35%'
                  : '20%';

        dialogueTargetBlock = `
<dialogue_pacing_target>
- Scene Mode: MULTI-CHARACTER SCENE (${presentChars.length} characters present: ${charNames})
- Dynamic Pacing Mode: ${targetPacingMode}
- Target Dialogue Density: ${targetDensityRange}
- Mandatory Minimum Rule: The specified percentage is a strict MINIMUM baseline. Under no circumstances is 0% dialogue permitted.
- 3-Scene Rolling Window Status: Prior scenes in the rolling window averaged ${(priorDensity * 100).toFixed(1)}% dialogue (minimum required baseline for this scene is ${minPct}).
- Directive: ${pacingDirective}
</dialogue_pacing_target>
`;
    }

    const activeStateBlock = compileActiveState(
        storyToUse as unknown as ContinuityStoryState,
        scene,
        sanitizedActiveCast as unknown as Array<CastMember | string>,
        {
            sequence: seqObj.number || 1,
            scene: s + 1,
            act: seqObj.parent_act
        }
    );

    const atmosphericOverviewBlock = scene.atmospheric_overview
        ? `
<atmospheric_overview>
${String(scene.atmospheric_overview)}
</atmospheric_overview>
`
        : scene.setting
          ? `
<atmospheric_overview>
Spatial setting and atmospheric baseline: ${scene.setting}
</atmospheric_overview>
`
          : '';

    const modalityHand = Array.isArray(scene.modality_hand)
        ? (scene.modality_hand as string[])
        : [];
    const modalityHandBlock =
        modalityHand.length > 0
            ? `
<selected_modality_hand>
${formatModalityHand(modalityHand)}
</selected_modality_hand>
`
            : '';

    const persona =
        storyToUse.synthesized_authorial_persona ||
        storyToUse.style?.synthesized_authorial_persona ||
        'Engage visceral, human-centered storytelling with rich sensory grounding and natural conversational rhythms.';
    const genreRules =
        storyToUse.genre_pacing_and_dialogue_rules ||
        storyToUse.style?.genre_pacing_and_dialogue_rules ||
        'Maintain active dramatic tension, organic dialogue rhythms, and immediate physical consequences.';
    const antiPatterns =
        storyToUse.strict_anti_patterns ||
        storyToUse.style?.strict_anti_patterns ||
        'Zero tolerance for clinical/neurochemical jargon (adrenaline, cortisol, amygdala), treating interactions as experiments or testing hypotheses, mastermind/chess-pawn tropes, or robotic analytical detachment.';

    const personaBlock = `<synthesized_authorial_persona>\n${persona}\n</synthesized_authorial_persona>`;
    const genreRulesBlock = `<genre_pacing_and_dialogue_rules>\n${genreRules}\n</genre_pacing_and_dialogue_rules>`;
    const strictAntiPatternsBlock = `<strict_anti_patterns>\n${antiPatterns}\n</strict_anti_patterns>`;

    const allSequences = Array.isArray(storyToUse.sequences)
        ? (storyToUse.sequences as Array<Record<string, unknown>>)
        : [];
    const seqScenesForPos = getSequenceScenesList(storyToUse as Record<string, unknown>, seq);
    const activeActDef = resolveNarrativeActForSequence(seq, allSequences, seqObj);
    const activeSeqDef = resolveNarrativeSequenceForIndex(seq, allSequences, seqObj);
    const activeActAndSequenceBlock = `
${formatActiveActAndSequenceXml(
    activeActDef,
    activeSeqDef,
    seqScenesForPos.length > 0 ? { sceneIndex: s, totalScenes: seqScenesForPos.length } : undefined
)}
`;
    const gateSeq1 = isPreCatalystSequenceOneScene({
        storyToUse: storyToUse as Record<string, unknown>,
        seq,
        s,
        effectiveScenes: seqScenesForPos,
        effectiveSeqData: seqObj
    });

    const activeLensBlock =
        enableNarrativeLenses && narrativeModeObj
            ? `
<active_scene_narrative_style>
- Style Identifier: ${activeModeId}${narrativeModeObj.category ? `\n- Category: ${narrativeModeObj.category}` : ''}
- Style Overview: ${narrativeModeObj.context || 'Dynamic stylistic lens'}
- Stylistic Cadence & Pacing Directives:
${injectionPrompt || narrativeModeObj.prompt || 'Balance pacing and interiority.'}
</active_scene_narrative_style>
`
            : '';

    const primerText = (storyToUse.world_primer || '').trim();
    const loreText = (
        typeof loreContext === 'string'
            ? loreContext
            : Array.isArray(loreContext)
              ? loreContext.map((l) => l.text || l.detail || '').join('\n')
              : ''
    ).trim();
    const staticWorldPrimerBlock = primerText
        ? `<narrative_world_context>\n<world_primer>\n${primerText}\n</world_primer>\n</narrative_world_context>\n\n`
        : '';
    const dynamicLoreBlock = loreText
        ? primerText
            ? `<lore_context>\n${loreText}\n</lore_context>\n\n`
            : `<narrative_world_context>\n<lore_context>\n${loreText}\n</lore_context>\n</narrative_world_context>\n\n`
        : '';

    const parsedVs = parseValueShiftInput(scene.value_shift);
    const vsStart = String(scene.start_valence || parsedVs.start_state || 'Neutral');
    const vsEnd = String(scene.end_valence || parsedVs.end_state || 'Shifted');

    const canonicalInterviewsBlock = (() => {
        const canonicalInterviews = sanitizedActiveCast
            .filter(Boolean)
            .map((ch) => {
                const rawInterview =
                    ch.details?.deep_profile ||
                    ch.interview_psychology ||
                    ch.deep_profile ||
                    ch.details?.personality ||
                    '';
                if (!rawInterview || rawInterview.length < 20) return '';
                return `<character_canonical_voice name="${ch.name || 'Character'}">
[CANONICAL VOICE MANDATE — ADOPT THIS EXACT VOICE, SPEECH RHYTHM, AND PSYCHOLOGICAL DEFENSE STYLE IN PROSE AND DIALOGUE]:
${rawInterview}
</character_canonical_voice>`;
            })
            .filter(Boolean)
            .join('\n\n');
        return canonicalInterviews
            ? `<canonical_character_interview_voice>
[CANONICAL VOICE MANDATE: The following excerpts represent each character's authentic voice, speech rhythm, emotional defense mechanisms, and vocabulary. In dialogue and POV narration, you MUST honor the vocal cadence, idioms, and emotional defense style established in their own words below.]
${canonicalInterviews}
</canonical_character_interview_voice>\n`
            : '';
    })();

    const bridgeMandateBlock = (() => {
        if (!scene?.is_bridge_scene) return '';
        const seqScenesList =
            storyToUse.scenes?.[`${seq}`] ||
            storyToUse.scenes?.[`${seq}-0`] ||
            storyToUse.scenes?.[`0-${seq}`] ||
            storyToUse.scenes?.['0-0'] ||
            [];
        const targetNextScene = (seqScenesList[s + 1] ||
            scene.bridged_to_scene_snapshot ||
            null) as (SceneBlueprint & Record<string, unknown>) | null;
        if (!targetNextScene) return '';
        const targetChars = Array.isArray(targetNextScene.characters_present)
            ? targetNextScene.characters_present.join(', ')
            : targetNextScene.characters_present ||
              (Array.isArray(targetNextScene.cast_names)
                  ? targetNextScene.cast_names.join(', ')
                  : targetNextScene.cast_names) ||
              '';
        return `<bridge_scene_handoff_mandate>
[CRITICAL CONTINUITY BRIDGE SCENE MANDATE — STRICT POINT-A TO POINT-B HANDOFF]:
This scene is an inserted Continuity Bridge Scene designed specifically to connect the end of the previous scene to the opening of Upcoming Scene ${seqObj.number || seq + 1}.${s + 2} ("${targetNextScene.title || 'Next Planned Scene'}").
- Target Next Scene Setting (Point B): ${targetNextScene.setting || 'Established upcoming setting'}
- Target Next Scene POV Character: ${targetNextScene.pov_character || 'Established POV'}
- Target Next Scene Characters Present: ${targetChars || 'Established cast'}
- Target Next Scene Opening Premise / Goal: ${targetNextScene.objective || targetNextScene.goal || targetNextScene.scene_events || formatSceneSummary(targetNextScene) || ''}
MANDATORY TERMINAL REQUIREMENT: By the final paragraph of this scene's prose, you MUST complete the transition and place the characters physically, spatially, and situationally at the threshold of Upcoming Scene ${seqObj.number || seq + 1}.${s + 2} so that it can begin seamlessly without another bridge scene. Do NOT introduce new tangential subplots, and NEVER end this bridge scene mid-sentence, mid-crisis, or on an unresolved cliffhanger that pulls characters away from the target next scene.
</bridge_scene_handoff_mandate>\n`;
    })();

    const upcomingBoundaryBlock =
        buildUpcomingBoundaryGuardInfo({
            storyToUse: storyToUse as Record<string, unknown>,
            seq,
            s,
            scene,
            sequenceData: sequenceData as Record<string, unknown> | null
        }).xmlBlock || '';

    const threadStorylines = Array.isArray(scene.thread_storylines)
        ? (scene.thread_storylines as Array<{ thread_id?: string; scene_storyline?: string }>)
        : [];
    const activeThreadIds = Array.isArray(scene.active_thread_ids)
        ? (scene.active_thread_ids as string[])
        : [];
    const plotCommitments = scene.plot_commitments as
        | Array<{ description?: string; exact_terms?: string; consequence?: string } | string>
        | string
        | undefined;

    return `${personaBlock}

${genreRulesBlock}

${strictAntiPatternsBlock}

${buildGenreToneStyleBlocks(storyToUse.style, { includeTechnicalSpecs: true })}${getAuthorNoteXml({ author_note: storyToUse.author_note })}

${staticWorldPrimerBlock}<story_so_far>
${storyToUse.story_so_far || 'The story is just beginning (no prose has been written yet).'}
</story_so_far>

${canonicalInterviewsBlock}<active_characters_profiles>
[EMOTIONAL TEMPERATURE: Write these characters as human beings who feel deeply. Their traits are not clinical diagnoses, but the messy result of lived experiences. Allow for genuine emotional warmth and irrational human complexity.]
${sanitizedActiveCast
    .filter(Boolean)
    .map((ch) => {
        const flaw = ch.core_flaw || ch.details?.history || 'Unspecified flaw';
        const desire = ch.core_desire || ch.details?.goals || 'Unspecified desire';
        const cadence = getVoiceDescriptionForCharacter(
            ch as VoiceCastMember,
            storyToUse as unknown as AudioStoryLike
        );
        const cornerXml = [
            ch.corner_role ? `  <corner_role>${ch.corner_role}</corner_role>` : '',
            ch.why_it_makes_sense
                ? `  <why_it_makes_sense>${ch.why_it_makes_sense}</why_it_makes_sense>`
                : '',
            ch.what_it_costs_them
                ? `  <what_it_costs_them>${ch.what_it_costs_them}</what_it_costs_them>`
                : '',
            ch.way_of_living ? `  <way_of_living>${ch.way_of_living}</way_of_living>` : '',
            ch.why_it_is_appealing
                ? `  <why_it_is_appealing>${ch.why_it_is_appealing}</why_it_is_appealing>`
                : '',
            ch.shared_outlook ? `  <shared_outlook>${ch.shared_outlook}</shared_outlook>` : '',
            ch.why_they_are_tempting
                ? `  <why_they_are_tempting>${ch.why_they_are_tempting}</why_they_are_tempting>`
                : '',
            ch.the_hidden_trap ? `  <the_hidden_trap>${ch.the_hidden_trap}</the_hidden_trap>` : '',
            ch.how_they_ended_up
                ? `  <how_they_ended_up>${ch.how_they_ended_up}</how_they_ended_up>`
                : '',
            ch.human_sympathy ? `  <human_sympathy>${ch.human_sympathy}</human_sympathy>` : '',
            ch.the_wake_up_call
                ? `  <the_wake_up_call>${ch.the_wake_up_call}</the_wake_up_call>`
                : ''
        ]
            .filter(Boolean)
            .join('\n');
        return `<character_profile>
  <name>${ch.name || 'Character'}</name>
  <role>${ch.role || 'Character'}</role>
${cornerXml ? `${cornerXml}\n` : ''}  <psychological_wound>${flaw}</psychological_wound>
  <core_yearning>${desire}</core_yearning>
  <vocal_cadence>${cadence}</vocal_cadence>
</character_profile>`;
    })
    .join('\n')}
</active_characters_profiles>

<relationship_friction_matrix>
${buildRelationshipFrictionBlock(
    sanitizedActiveCast as unknown as CastMember[],
    Array.isArray(storyToUse.relationships) ? {} : storyToUse.relationships || {}
)}
</relationship_friction_matrix>

${activeStateBlock}

${dynamicLoreBlock}<previous_context>
${
    previousScene
        ? `Previous Scene (${previousScene.number || (s > 0 ? `${seqObj.number || 1}.${s}` : `${Number(seqObj.number || 1) - 1}.last`)}: ${previousScene.title}):
${formatSceneSummary(previousScene) || String(previousScene.scene_events || '') || previousScene.objective || ''}
Preceding Scene Physical Exit State: ${previousScene.exit_conditions || previousScene.exit_hook || 'Characters exited from previous scene.'}
Lingering Exit Hook from Prior Scene: ${previousScene.exit_hook || 'None.'}
`
        : 'This is the opening scene of the novel.\n'
}
${
    previousSceneProseText
        ? `[WARNING: ANTI-DUPLICATION GUARD]
The following prose is the FINAL passage of the previous scene. These events have ALREADY been fully dramatized. Do NOT re-narrate, re-describe, or re-dramatize any of them. Begin this scene AFTER these events.

Ending Prose of Previous Scene:
${previousSceneProseText}`
        : 'No previous scene prose available.'
}
</previous_context>

<scene_blueprint>
Scene ID: ${scene.number || `${seqObj.number || 1}.${s + 1}`}
Title: ${scene.title || ''}
POV Character: ${scene.pov_character || sanitizedActiveCast[0]?.name || 'Unspecified'}
${enableNarrativeLenses ? `Dominant Narrative Style: ${activeModeId}${narrativeModeObj?.name ? ` (${narrativeModeObj.name})` : ''}\n` : ''}Scene Type: ${scene.scene_type || (s % 2 === 0 ? 'PROACTIVE' : 'REACTIVE')}
Transition Jump: ${scene.transition_jump || 'Seamless temporal/spatial continuation'}
Value Shift: ${vsStart} -> ${vsEnd}
Objective: ${scene.objective || scene.goal || ''}
${scene.scene_events ? `Scene Events & Plot Points (MUST be dramatized):\n${scene.scene_events}\n` : ''}${scene.micro_conflict_and_tactic ? `Micro-Conflict & Tactic: ${scene.micro_conflict_and_tactic}\n` : ''}${!scene.atmospheric_overview && scene.sensory_palette ? `Sensory Palette: ${scene.sensory_palette}\n` : ''}${scene.character_voice_directives ? `Character Voice Directives: ${scene.character_voice_directives}\n` : ''}${scene.scene_pacing_tempo ? `Scene Pacing Tempo: ${scene.scene_pacing_tempo}\n` : ''}Entrance Conditions: ${scene.entrance_conditions || scene.entrance_condition || 'Continuity baseline from prior scene'}
Exit Conditions: ${scene.exit_conditions || scene.exit_condition || 'Resolved scene state leading into exit hook'}
Exit Hook: ${scene.exit_hook || 'Lead naturally into next scene'}
${scene.surface_activity ? `Surface Activity (Grounded Physical Action): ${scene.surface_activity}\n` : ''}${scene.main_character_heart ? `POV / Main Character's Heart (Quiet Yearning/Defense): ${scene.main_character_heart}\n` : ''}${scene.other_character_heart ? `Counterpart Character's Heart (What they offer/protect): ${scene.other_character_heart}\n` : ''}${scene.the_hinge_moment ? `The Hinge Moment (Turning Point): ${scene.the_hinge_moment}\n` : ''}${threadStorylines.length > 0 ? `Active Thread Storylines:\n${threadStorylines.map((ts) => `- Thread ${ts.thread_id}: ${ts.scene_storyline}`).join('\n')}\n` : activeThreadIds.length > 0 ? `Active Threads: ${activeThreadIds.join(', ')}\n` : ''}${scene.thread_weaving_notes ? `Thread Weaving Guidance:\n${scene.thread_weaving_notes}\n` : ''}${scene.setting || scene.environment ? `Setting/Environment: ${scene.setting || scene.environment}\n` : ''}${
    gateSeq1
        ? `${actInfo ? `Act Context: Act ${actInfo.number}: ${actInfo.title} (Early Sequence 1 Status-Quo Gate: Establish normal world equilibrium and lived-in setting reality; reserve inciting disruption for its scheduled later scene)\n` : ''}Sequence Context: Sequence 1: ${seqObj.title || activeSeqDef.title} (Status-Quo Micro-Arc Phase)`
        : `${actInfo ? `Act Context: Act ${actInfo.number}: ${actInfo.title} (Mandate: ${sanitizedActMandate})\n` : ''}Sequence Context: Sequence ${seqObj.number || 1}: ${seqObj.title || ''} (Objective: ${seqObj.sequence_objective || seqObj.description || ''})${seqObj.sequence_objective && seqObj.description && seqObj.description !== seqObj.sequence_objective ? `\nSequence Description & Mandates: ${seqObj.description}` : ''}`
}
${plotCommitments && ((Array.isArray(plotCommitments) && plotCommitments.length > 0) || typeof plotCommitments === 'string') ? `Plot Commitments (MUST appear in prose):\n${Array.isArray(plotCommitments) ? plotCommitments.map((pc) => (typeof pc === 'object' ? `- ${pc.description}: "${pc.exact_terms}" → Consequence: ${pc.consequence}` : `- ${pc}`)).join('\n') : plotCommitments}\n` : ''}</scene_blueprint>
${bridgeMandateBlock}${clueDirectivesBlock}
${revealDirectiveBlock}
${atmosphericOverviewBlock}
${modalityHandBlock}
${activeActAndSequenceBlock}${activeLensBlock}
${upcomingBoundaryBlock}
${dialogueTargetBlock}
${
    !forceFullRewrite && existingProseText
        ? `
<current_scene_prior_draft_context>
[EXISTING SCENE DRAFT & REVISION BASELINE]
An existing draft for THIS current scene already exists in the project. ${dInst ? 'You are rewriting/steering this draft to incorporate user directive instructions.' : 'You are performing a second pass or revision on this scene.'}
DO NOT rewrite blind or ignore what was already established. Use this draft as your foundation: preserve its effective phrasing, dialogue exchanges, sensory textures, and character dynamics, while revising or expanding according to the scene requirements${dInst ? ' and user directive' : ''}.

<existing_scene_draft>
${existingProseText}
</existing_scene_draft>
${
    existingCritique
        ? `
<prior_editorial_critique>
${existingCritique}
</prior_editorial_critique>
`
        : ''
}${
              dInst
                  ? `
<revision_directive>
${dInst}
</revision_directive>
`
                  : `
<revision_guidance>
Refine, deepen, or correct this draft while preserving its strongest narrative beats and sensory descriptions.
</revision_guidance>
`
          }
</current_scene_prior_draft_context>
`
        : ''
}
${
    forceFullRewrite
        ? `
<mandatory_full_rewrite_mandate>
CRITICAL DIRECTIVE: You are executing a MANDATORY FULL REWRITE of this scene from scratch.
- DO NOT patch, edit, or copy from any prior draft or memory.
- Dramatize the entire scene completely fresh from opening line to exit hook based solely on the <scene_blueprint>, character profiles, narrative world context${storyToUse.writing_mode === 'audio_drama' ? ', and acoustic audio drama script specifications' : ', and narrative style lens'}.
- Reinvent the scene's ${storyToUse.writing_mode === 'audio_drama' ? 'acoustic staging, speaker dialogue exchanges, delivery cues, and pacing' : 'blocking, dialogue exchanges, sensory textures, and pacing'} from the ground up to produce a vibrant, fully original scene ${storyToUse.writing_mode === 'audio_drama' ? 'audio drama script' : 'dramatization'}.
</mandatory_full_rewrite_mandate>
`
        : ''
}
${
    dInst
        ? `
<directive_requirement>
You MUST rewrite this scene's prose to satisfy the following instruction:
"${dInst}"
${!forceFullRewrite && existingProseText ? 'Ground your revision in the <existing_scene_draft> provided in <current_scene_prior_draft_context>, retaining its working elements while enacting this directive.' : ''}
</directive_requirement>
`
        : ''
}
`;
}
