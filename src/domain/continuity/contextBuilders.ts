/**
 * @module domain/continuity/contextBuilders
 * Sequence, Scene Planner, Boundary Guard, and Archivist blueprint context formatters.
 */

import { formatSequenceCraftGuideXml } from '@/config';
import type { CastMember, Story } from '@/types';
import {
    STOPWORDS,
    isSerializationPlaceholder,
    safeEscapeRegex,
    tokenMatch
} from '@/utils';
import {
    buildCharacterArcsBlock,
    buildGenreToneBlocks,
    buildRelationshipFrictionBlock,
    buildStoryInfoBlock,
    formatLoreForPrompt,
    formatSceneSummary,
    getAuthorNoteXml,
    sanitizeStoryContextForPosition
} from '@/domain/story';
import { formatContinuityLedgerForPrompt } from './ledger';
import type { ContinuityStoryState } from './ledger';

export interface UpcomingBoundaryGuardResult {
    xmlBlock: string;
    auditSummary: string;
    isSequenceBoundary: boolean;
}

/** Builds sanitized, ledger-grounded prompt context for Sequence and Act generation steps. */
export function buildSequencePromptContext(
    storyToUse: Partial<Story> & ContinuityStoryState,
    nextRels: Record<string, Record<string, unknown>> | null | undefined,
    actsData: Array<Record<string, unknown>> | null | undefined,
    currentSeqNum = 1,
    relevantLore: unknown = null
): string {
    const rels =
        nextRels || (storyToUse.relationships as Record<string, Record<string, unknown>> | undefined) || {};
    const acts = (actsData || storyToUse.acts || []) as Array<Record<string, unknown>>;
    const sanitizedStory = sanitizeStoryContextForPosition(
        storyToUse,
        Math.ceil(Number(currentSeqNum || 1) / 2.5),
        Number(currentSeqNum || 1)
    );
    const loreBlocks = formatLoreForPrompt(sanitizedStory.world_primer, relevantLore);
    const sanitizedCast = (sanitizedStory.cast || []) as Array<
        CastMember & Record<string, unknown>
    >;

    return `${buildGenreToneBlocks(sanitizedStory.style)}

${loreBlocks ? `${loreBlocks}\n\n` : ''}${buildStoryInfoBlock(sanitizedStory, { fullStoryLabels: true })}

<active_character_profiles>
[EMOTIONAL TEMPERATURE: Write these characters as human beings who feel deeply. Their traits are not clinical diagnoses, but the messy result of lived experiences. Allow for genuine emotional warmth and irrational human complexity.]
${sanitizedCast
    .map((c) => {
        const roleBadge = c.corner_role ? ` [${c.corner_role}]` : '';
        const cornerDetails = [
            c.why_it_makes_sense ? `Why it makes sense: ${c.why_it_makes_sense}` : '',
            c.what_it_costs_them ? `Cost: ${c.what_it_costs_them}` : '',
            c.way_of_living ? `Way of living: ${c.way_of_living}` : '',
            c.shared_outlook ? `Shared outlook: ${c.shared_outlook}` : '',
            c.the_hidden_trap ? `Hidden trap: ${c.the_hidden_trap}` : '',
            c.how_they_ended_up ? `How they ended up: ${c.how_they_ended_up}` : '',
            c.the_wake_up_call ? `Wake-up call: ${c.the_wake_up_call}` : ''
        ]
            .filter(Boolean)
            .join(' | ');
        return `- ${c.name} (${c.role}${roleBadge}): Safety Habit / Flaw: ${c.core_flaw || 'None'}, Core Yearning: ${c.core_desire || 'None'}${cornerDetails ? ` (${cornerDetails})` : ''}`;
    })
    .join('\n')}
</active_character_profiles>

${buildCharacterArcsBlock(sanitizedStory)}

<character_relationships>
${buildRelationshipFrictionBlock(sanitizedCast, rels)}
</character_relationships>

<continuity_ledger>
${formatContinuityLedgerForPrompt(sanitizedStory)}
</continuity_ledger>

<act_descriptions>
${acts
    .map((a) => {
        let mandateText = String(a.act_mandate || a.description || '');
        if (Array.isArray(sanitizedStory.secret_vault)) {
            sanitizedStory.secret_vault.forEach((sec) => {
                if (
                    sec.status !== 'revealed' &&
                    Number(sec.reveal_anchor?.act_number || 3) > Number(a.number)
                ) {
                    if (sec.truth && sec.truth.length > 8) {
                        mandateText = mandateText.replace(
                            new RegExp(safeEscapeRegex(sec.truth), 'gi'),
                            '[Crucial Turning Point Withheld]'
                        );
                    }
                    if (sec.title) {
                        mandateText = mandateText.replace(
                            new RegExp(safeEscapeRegex(sec.title), 'gi'),
                            '[Key Reversal Pending]'
                        );
                    }
                }
            });
        }
        const knots = Array.isArray(a.knots)
            ? (a.knots as Array<{ description?: string; interaction?: string }>)
                  .map((k) => `${k.description} (${k.interaction})`)
                  .join('; ')
            : '';
        return `## Act ${a.number}: ${a.title}\nMandate: ${mandateText}\nWorld Developments: ${a.world_building_developments || ''}\nKnots: ${knots}`;
    })
    .join('\n\n')}
</act_descriptions>
${getAuthorNoteXml(sanitizedStory)}

${formatSequenceCraftGuideXml()}`;
}

/** Extracts the trailing `wordLimit` words of a prose string or entry object. */
export function extractProseTextTail(proseEntry: unknown, wordLimit = 350): string {
    let text = '';
    if (typeof proseEntry === 'string') text = proseEntry;
    else if (proseEntry && typeof proseEntry === 'object') {
        const p = proseEntry as Record<string, unknown>;
        text = String(p.final || p.prose || p.draft || '');
    }
    text = String(text || '').trim();
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length <= wordLimit) return text;
    return '...' + words.slice(-wordLimit).join(' ');
}

/** Resolves a sequence's scenes array across legacy (`0-0`, `seq-0`) and canonical keys. */
export function getSequenceScenesList(
    storyObj: Partial<Story> | Record<string, unknown> = {},
    targetSeqIdx = 0
): Array<Record<string, unknown>> {
    const scenesMap = (storyObj?.scenes || {}) as Record<
        string,
        Array<Record<string, unknown>> | undefined
    >;
    return (
        scenesMap[`${targetSeqIdx}`] ||
        scenesMap[`${targetSeqIdx}-0`] ||
        scenesMap[`0-${targetSeqIdx}`] ||
        (targetSeqIdx === 0 ? scenesMap['0-0'] : undefined) ||
        []
    );
}

/** Formats present cast names for a scene object while filtering placeholder tokens. */
export function formatSceneCharactersList(sc: Record<string, unknown> | null | undefined = {}): string {
    if (!sc) return '';
    const toCleanList = (val: unknown): string[] => {
        if (Array.isArray(val)) {
            return val
                .map((x) =>
                    typeof x === 'string'
                        ? x.trim()
                        : ((x as Record<string, unknown>)?.name || String(x || '')).toString().trim()
                )
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        if (typeof val === 'string') {
            return val
                .split(/[,;\n]+/)
                .map((s) => s.trim().replace(/^-\s*/, ''))
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
        }
        return [];
    };
    const pres = toCleanList(sc.characters_present);
    const names = pres.length > 0 ? pres : toCleanList(sc.cast_names);
    return names.join(', ');
}

/** Compiles cross-sequence handoff, lookahead anti-preemption guard, and continuity context for Scene Planning. */
export function buildScenePlannerContinuityBlock(
    storyState: ContinuityStoryState = {},
    seqIdx = 0,
    liveSequence: Record<string, unknown> | null = null
): string {
    const sequencesArr = Array.isArray(storyState.sequences)
        ? (storyState.sequences as Array<Record<string, unknown>>)
        : [];
    const liveSeq = liveSequence || sequencesArr[seqIdx] || { number: seqIdx + 1, parent_act: 1 };
    const seqNum = Number(liveSeq.number || seqIdx + 1);

    let prevSeqBlock = `<previous_sequence_handoff>\nSequence ${seqNum} opens the novel in the established <status_quo> baseline. There is no preceding sequence.\n</previous_sequence_handoff>`;
    if (seqIdx > 0) {
        const prevSeq = sequencesArr[seqIdx - 1] || { number: seqIdx };
        const prevSeqNum = Number(prevSeq.number || seqIdx);
        const prevSeqScenes = getSequenceScenesList(storyState, seqIdx - 1);
        const lastPrevScene =
            prevSeqScenes.length > 0 ? prevSeqScenes[prevSeqScenes.length - 1] : null;
        const proseMap = storyState.prose as Record<string, unknown> | undefined;
        const prevProseRaw = lastPrevScene
            ? proseMap?.[`${seqIdx - 1}-${prevSeqScenes.length - 1}`] ||
              proseMap?.[`${seqIdx - 1}-0-${prevSeqScenes.length - 1}`] ||
              null
            : null;
        const prevProseTail = extractProseTextTail(prevProseRaw, 350);

        const prevScenesSummary =
            prevSeqScenes.length > 0
                ? prevSeqScenes
                      .map((sc, idx) => {
                          const chars = formatSceneCharactersList(sc) || 'Unspecified';
                          const summary = String(
                              sc.scene_events ||
                                  sc.objective ||
                                  sc.goal ||
                                  formatSceneSummary(sc) ||
                                  ''
                          )
                              .slice(0, 220)
                              .trim();
                          return `  - Scene ${sc.number || `${prevSeqNum}.${idx + 1}`}: "${sc.title || 'Untitled'}" | Setting: ${sc.setting || 'Unspecified'} | Cast Present: ${chars}\n    Key Events: ${summary}${sc.exit_hook ? `\n    Exit Hook: ${sc.exit_hook}` : ''}`;
                      })
                      .join('\n')
                : '  (No scene blueprints planned yet for previous sequence.)';

        const lastPrevDetails = lastPrevScene
            ? `Final Scene of Previous Sequence (${lastPrevScene.number || `${prevSeqNum}.${prevSeqScenes.length}`}: "${lastPrevScene.title || 'Untitled'}"):\n  - POV Character: ${lastPrevScene.pov_character || 'Unspecified'}\n  - Setting: ${lastPrevScene.setting || 'Unspecified'}\n  - Characters Present: ${formatSceneCharactersList(lastPrevScene) || 'Unspecified'}\n  - Scene Events: ${lastPrevScene.scene_events || lastPrevScene.objective || lastPrevScene.goal || 'Unspecified'}\n  - Exit Hook: ${lastPrevScene.exit_hook || prevSeq.ending_hook || 'Unspecified'}`
            : `Previous Sequence Ending Hook: ${prevSeq.ending_hook || 'Not specified.'}`;

        prevSeqBlock = `<previous_sequence_handoff>
Previous Sequence ${prevSeqNum}: "${prevSeq.title || `Sequence ${prevSeqNum}`}"
- Sequence Objective: ${prevSeq.sequence_objective || ''}
- Sequence Climax: ${prevSeq.sequence_climax || ''}
- Sequence Ending Hook: ${prevSeq.ending_hook || ''}

Scenes Already Established in Sequence ${prevSeqNum} (Cast Introductions & Events Already Completed):
${prevScenesSummary}

${lastPrevDetails}
${prevProseTail ? `\n<previous_sequence_final_prose_excerpt>\n${prevProseTail}\n</previous_sequence_final_prose_excerpt>` : ''}

MANDATORY ENTRY ALIGNMENT FOR SCENE ${seqNum}.1:
1. Scene ${seqNum}.1 MUST open in direct causal and spatial continuity with the terminal state of Sequence ${prevSeqNum} (honoring where each character ended, or explicitly bridging travel/time via <transition_jump> and <entrance_conditions>).
2. NEVER re-introduce a character as an unintroduced stranger or replay a first meeting if they already appeared and interacted in Sequence ${prevSeqNum} above.
</previous_sequence_handoff>`;
    }

    let nextSeqBlock = `<next_sequence_lookahead_and_boundary_guard>\nSequence ${seqNum} is the final sequence of the novel; resolve all active narrative threads toward the closing equilibrium.\n</next_sequence_lookahead_and_boundary_guard>`;
    if (seqIdx + 1 < sequencesArr.length) {
        const nextSeq = sequencesArr[seqIdx + 1];
        const nextSeqNum = Number(nextSeq.number || seqIdx + 2);
        const nextSeqScenes = getSequenceScenesList(storyState, seqIdx + 1);
        const firstNextScene = nextSeqScenes.length > 0 ? nextSeqScenes[0] : null;
        const nextFocus = Array.isArray(nextSeq.characters_in_focus)
            ? nextSeq.characters_in_focus.join(', ')
            : String(nextSeq.characters_in_focus || '');

        const nextFirstSceneText = firstNextScene
            ? `\nAlready-Planned Opening Scene of Sequence ${nextSeqNum} (${firstNextScene.number || `${nextSeqNum}.1`}: "${firstNextScene.title || 'Untitled'}"):\n  - Opening Setting: ${firstNextScene.setting || 'Unspecified'}\n  - POV: ${firstNextScene.pov_character || 'Unspecified'} | Cast: ${formatSceneCharactersList(firstNextScene) || 'Unspecified'}\n  - Entrance Conditions: ${firstNextScene.entrance_conditions || 'Unspecified'}\n  - Planned Events: ${firstNextScene.scene_events || firstNextScene.objective || firstNextScene.description || ''}`
            : '';

        nextSeqBlock = `<next_sequence_lookahead_and_boundary_guard>
Upcoming Sequence ${nextSeqNum}: "${nextSeq.title || `Sequence ${nextSeqNum}`}" (${nextSeq.sequence_function || 'Next Sequence'})
- Dramatic Question: ${nextSeq.dramatic_question || ''}
- Sequence Objective: ${nextSeq.sequence_objective || ''}
- Required Starting State for Sequence ${nextSeqNum}: ${nextSeq.starting_state || liveSeq.ending_hook || 'Starts immediately after this sequence ends.'}
- Characters in Focus: ${nextFocus || 'Unspecified'}
- Next Sequence Summary: ${nextSeq.description || ''}
- Current Sequence Boundary Guard: ${liveSeq.next_sequence_boundary_guard || `Do NOT preempt events, destination arrivals, or primary character introductions reserved for Sequence ${nextSeqNum}.`}${nextFirstSceneText}

CRITICAL ANTI-PREEMPTION & TERMINAL HANDOFF MANDATE:
1. STRICT ANTI-PREEMPTION: Scenes in Sequence ${seqNum} MUST NOT encroach upon, prematurely execute, spoil, or stage plot events, major encounters, or first-time character introductions belonging to Sequence ${nextSeqNum}.
2. TERMINAL SCENE TARGET (Scene ${seqNum}.last): The final scene of Sequence ${seqNum} MUST maneuver the characters spatially, physically, and causally so that its ending setting and <exit_hook> deliver them cleanly to the exact starting location and premise required by Sequence ${nextSeqNum} (<starting_state>${firstNextScene ? ` / Scene ${nextSeqNum}.1` : ''}).
</next_sequence_lookahead_and_boundary_guard>`;
    }

    const charStatesObj = (storyState.character_states || {}) as Record<
        string,
        Record<string, unknown>
    >;
    const charStateLines = Object.entries(charStatesObj)
        .map(([k, cs]) => {
            if (!cs || typeof cs !== 'object') return null;
            const cName = String(cs.name || cs.character || k);
            return `- ${cName}: Location: ${cs.location || 'Unspecified'} | Physical: ${cs.physical_state || 'Normal'} | Emotional: ${cs.emotional_state || 'Baseline'} | Tension: ${cs.unresolved_tension || 'None'}`;
        })
        .filter(Boolean);

    const ledgerText = formatContinuityLedgerForPrompt(storyState, {
        sequence: seqNum,
        scene: 1,
        act: liveSeq.parent_act,
        activeCast: storyState.cast || []
    });

    const activeContinuityBlock = `<story_so_far_and_active_continuity>
<story_so_far>
${String(storyState.story_so_far || '').trim() || 'No prose drafted yet; starting from initial story bible baseline.'}
</story_so_far>

<living_character_states>
${charStateLines.length > 0 ? charStateLines.join('\n') : 'No updated character states recorded yet; baseline story bible status applies.'}
</living_character_states>

<continuity_ledger>
${ledgerText || 'No active continuity ledger items yet.'}
</continuity_ledger>
</story_so_far_and_active_continuity>`;

    return `<sequence_boundary_and_continuity_context>\n${prevSeqBlock}\n\n${nextSeqBlock}\n\n${activeContinuityBlock}\n</sequence_boundary_and_continuity_context>`;
}

/**
 * Detects pre-catalyst scenes inside Sequence 1 so opening scenes stay 100% immersed in their
 * everyday micro-arc without leaking later Inciting Incident plot beats via lookahead context.
 */
export function isPreCatalystSequenceOneScene({
    storyToUse = {},
    seq = 0,
    s = 0,
    effectiveScenes,
    effectiveSeqData
}: {
    storyToUse?: Partial<Story> & Record<string, unknown>;
    seq?: number;
    s?: number;
    effectiveScenes?: Array<Record<string, unknown>>;
    effectiveSeqData?: Record<string, unknown> | null;
} = {}): boolean {
    const scenes =
        Array.isArray(effectiveScenes) && effectiveScenes.length > 0
            ? effectiveScenes
            : getSequenceScenesList(storyToUse, seq);
    const seqObj =
        effectiveSeqData ||
        ((storyToUse.sequences || [])[seq] as Record<string, unknown> | undefined) || {
            number: seq + 1
        };
    const seqNum = Number(seqObj.number || seq + 1);
    if (seqNum !== 1 || scenes.length <= 1) return false;

    const catalystReference = `${String(storyToUse.inciting_incident || '')} ${String(seqObj.sequence_climax || '')}`
        .toLowerCase()
        .trim();
    const refTokens = new Set(
        catalystReference
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length >= 4 && !STOPWORDS.has(t))
    );

    let catalystIdx = -1;
    for (let idx = 0; idx < scenes.length; idx++) {
        const sc = scenes[idx] || {};
        const scText = `${String(sc.title || '')} ${String(sc.goal || sc.objective || '')} ${String(sc.scene_events || '')} ${String(sc.the_hinge_moment || '')}`.toLowerCase();
        if (/\b(?:inciting incident|inciting disruption|catalyst|point of no return)\b/i.test(scText)) {
            catalystIdx = idx;
            break;
        }
        if (refTokens.size >= 3) {
            let hits = 0;
            for (const tok of refTokens) {
                if (tokenMatch(scText, tok)) hits++;
            }
            if (hits >= Math.min(3, Math.ceil(refTokens.size * 0.4))) {
                catalystIdx = idx;
                break;
            }
        }
    }

    if (catalystIdx === 0) return false;
    if (catalystIdx < 0) catalystIdx = scenes.length - 1;
    return s < catalystIdx;
}

/** Builds anti-preemption and terminal handoff guard metadata for the Writing and Auditing Agents. */
export function buildUpcomingBoundaryGuardInfo({
    storyToUse = {},
    seq = 0,
    s = 0,
    scene = {},
    sequenceData = null,
    scenesList = []
}: {
    storyToUse?: Partial<Story> & Record<string, unknown>;
    seq?: number;
    s?: number;
    scene?: Record<string, unknown>;
    sequenceData?: Record<string, unknown> | null;
    scenesList?: Array<Record<string, unknown>>;
} = {}): UpcomingBoundaryGuardResult {
    const effectiveScenes =
        Array.isArray(scenesList) && scenesList.length > 0
            ? scenesList
            : getSequenceScenesList(storyToUse, seq);
    const effectiveSeqData =
        sequenceData ||
        ((storyToUse.sequences || [])[seq] as Record<string, unknown> | undefined) || {
            number: seq + 1
        };
    const seqNum = Number(effectiveSeqData.number || seq + 1);
    const nextSceneInSeq = s + 1 < effectiveScenes.length ? effectiveScenes[s + 1] : null;

    if (nextSceneInSeq) {
        const nextNum = nextSceneInSeq.number || `${seqNum}.${s + 2}`;
        const nextChars = formatSceneCharactersList(nextSceneInSeq) || 'Unspecified';
        const nextEvents =
            nextSceneInSeq.scene_events ||
            nextSceneInSeq.objective ||
            nextSceneInSeq.goal ||
            nextSceneInSeq.description ||
            '';
        const exitTarget =
            scene.exit_hook ||
            scene.exit_conditions ||
            `Lead directly into Scene ${nextNum} ("${nextSceneInSeq.title || 'Next Scene'}").`;
        const gateSeq1 = isPreCatalystSequenceOneScene({
            storyToUse,
            seq,
            s,
            effectiveScenes,
            effectiveSeqData
        });
        const upcomingEventsLine = gateSeq1
            ? `- Sequence 1 Context Gate: [Future scene plot turns are intentionally masked for this early Sequence 1 scene so attention gravity does not rush the opening status quo. Focus 100% on dramatizing THIS scene's own everyday micro-arc, demonstrated equilibrium, and exit hook without foreshadowing or staging later disruptions.]`
            : `- Reserved Upcoming Events / Premise: ${nextEvents}`;
        const xmlBlock = `<upcoming_boundary_and_handoff_guard>
[NEXT SCENE WITHIN SEQUENCE ${seqNum} — ANTI-PREEMPTION & HANDOFF TARGET]:
- Upcoming Scene: ${nextNum} ("${nextSceneInSeq.title || 'Next Scene'}")
- Upcoming Scene Setting: ${nextSceneInSeq.setting || 'Established next location'}
- Upcoming POV / Cast: POV ${nextSceneInSeq.pov_character || 'Unspecified'} | Present: ${nextChars}
- Upcoming Transition Jump: ${nextSceneInSeq.transition_jump || 'Direct continuation'}
- Upcoming Entrance Conditions: ${nextSceneInSeq.entrance_conditions || 'Standard entrance'}
${upcomingEventsLine}

MANDATORY PROSE BOUNDARY RULES:
1. ANTI-PREEMPTION: Do NOT dramatize, resolve, or prematurely trigger events, discoveries, or character introductions reserved for Upcoming Scene ${nextNum}.
2. TERMINAL HANDOFF ALIGNMENT: Conclude this scene on its planned exit hook (${exitTarget}) so the characters end in a location and situational state compatible with Scene ${nextNum}.
</upcoming_boundary_and_handoff_guard>`;
        const auditEventsText = gateSeq1
            ? '[Masked for Sequence 1 status-quo context gate]'
            : String(nextEvents).slice(0, 250);
        const auditSummary = `Next Scene ${nextNum} ("${nextSceneInSeq.title || 'Next Scene'}"): Setting="${nextSceneInSeq.setting || ''}", Cast="${nextChars}", Entrance="${nextSceneInSeq.entrance_conditions || ''}", Reserved Events="${auditEventsText}". Required Exit Hook: "${exitTarget}".`;
        return { xmlBlock, auditSummary, isSequenceBoundary: false };
    }

    const sequencesArr = Array.isArray(storyToUse.sequences)
        ? (storyToUse.sequences as Array<Record<string, unknown>>)
        : [];
    const nextSeq = seq + 1 < sequencesArr.length ? sequencesArr[seq + 1] : null;
    if (nextSeq) {
        const nextSeqNum = Number(nextSeq.number || seq + 2);
        const nextSeqScenes = getSequenceScenesList(storyToUse, seq + 1);
        const firstNextScene = nextSeqScenes.length > 0 ? nextSeqScenes[0] : null;
        const nextSeqFocus = Array.isArray(nextSeq.characters_in_focus)
            ? nextSeq.characters_in_focus.join(', ')
            : String(nextSeq.characters_in_focus || '');
        const exitTarget =
            scene.exit_hook ||
            scene.exit_conditions ||
            effectiveSeqData.ending_hook ||
            `Position cast for Sequence ${nextSeqNum}.`;
        const boundaryGuard = String(effectiveSeqData.next_sequence_boundary_guard || '');

        const firstSceneSnippet = firstNextScene
            ? `\n- Next Sequence Opening Scene (${firstNextScene.number || `${nextSeqNum}.1`}: "${firstNextScene.title || 'Untitled'}"):\n  * Setting: ${firstNextScene.setting || 'Unspecified'}\n  * Characters Present: ${formatSceneCharactersList(firstNextScene) || 'Unspecified'}\n  * Entrance Conditions: ${firstNextScene.entrance_conditions || 'Unspecified'}\n  * Planned Events: ${firstNextScene.scene_events || firstNextScene.objective || firstNextScene.description || ''}`
            : '';

        const xmlBlock = `<upcoming_boundary_and_handoff_guard>
[CRITICAL SEQUENCE BOUNDARY HANDOFF — FINAL SCENE OF SEQUENCE ${seqNum} LEADING INTO SEQUENCE ${nextSeqNum}]:
You are drafting the FINAL scene of Sequence ${seqNum}. Sequence ${nextSeqNum} begins immediately after this scene concludes.
- Next Sequence: Sequence ${nextSeqNum} — "${nextSeq.title || ''}" (${nextSeq.sequence_function || ''})
- Next Sequence Objective: ${nextSeq.sequence_objective || ''}
- Next Sequence Dramatic Question: ${nextSeq.dramatic_question || ''}
- Next Sequence Required Starting State: ${nextSeq.starting_state || effectiveSeqData.ending_hook || 'Starts immediately after Sequence ' + seqNum}
- Next Sequence Characters in Focus: ${nextSeqFocus || 'Unspecified'}
- Next Sequence Summary: ${nextSeq.description || ''}
${boundaryGuard ? `- Explicit Sequence Boundary Guard: ${boundaryGuard}\n` : ''}${firstSceneSnippet}

MANDATORY SEQUENCE BOUNDARY RULES:
1. STRICT SEQUENCE BOUNDARY ANTI-PREEMPTION: You are STRICTLY FORBIDDEN from encroaching upon Sequence ${nextSeqNum}'s plot events, prematurely arriving at destination encounters reserved for Sequence ${nextSeqNum}, or introducing characters whose first introduction belongs to Sequence ${nextSeqNum}.
2. MANDATORY SPATIAL & CAUSAL EXIT POSITIONING: By the final paragraph of this scene, you MUST leave the characters in the exact physical location, cast grouping, and unresolved hook (${exitTarget}) required for Sequence ${nextSeqNum} to open seamlessly without spatial teleportation or plot contradiction.
</upcoming_boundary_and_handoff_guard>`;
        const auditSummary = `SEQUENCE BOUNDARY (Final scene of Seq ${seqNum} -> Seq ${nextSeqNum} "${nextSeq.title || ''}"): Next starting_state="${nextSeq.starting_state || effectiveSeqData.ending_hook || ''}". Boundary Guard="${boundaryGuard}". ${firstNextScene ? `Scene ${nextSeqNum}.1 Setting="${firstNextScene.setting || ''}", Cast="${formatSceneCharactersList(firstNextScene)}", Events="${String(firstNextScene.scene_events || firstNextScene.objective || '').slice(0, 220)}". ` : `NextSeqDesc="${String(nextSeq.sequence_objective || nextSeq.description || '').slice(0, 240)}". `}Required Exit Hook: "${exitTarget}".`;
        return { xmlBlock, auditSummary, isSequenceBoundary: true };
    }

    const xmlBlock = `<upcoming_boundary_and_handoff_guard>
[FINAL SCENE OF THE NOVEL]:
This is the closing scene of Sequence ${seqNum} and the novel. Bring the scene to its resolved exit hook (${scene.exit_hook || effectiveSeqData.ending_hook || 'Closing resolution'}).
</upcoming_boundary_and_handoff_guard>`;
    return {
        xmlBlock,
        auditSummary: `Final scene of novel (Seq ${seqNum}). Exit hook: ${scene.exit_hook || effectiveSeqData.ending_hook || 'Closing resolution'}`,
        isSequenceBoundary: false
    };
}

/** Formats hard facts, state changes, and relationship shifts planned inside a scene blueprint. */
export function formatArchivistBlueprintContext(
    scene: Record<string, unknown> | null | undefined = {}
): string {
    if (!scene) return '';

    const facts = ((scene.hard_facts_introduced ||
        scene.continuity_facts ||
        scene.facts ||
        []) as Array<Record<string, unknown>>).map(
        (f) => `- Continuity Fact [${f.category || 'Fact'}]: ${f.key} -> "${f.detail || f.value || f.fact}"`
    );

    const stateChanges = ((scene.state_changes ||
        scene.state_changes_introduced ||
        []) as Array<Record<string, unknown>>).map(
        (sc) => `- State Change: Entity "${sc.entity_id}" -> Relation [${sc.relation}] -> Target "${sc.target}"`
    );

    const relShifts = ((scene.relationship_shifts || []) as Array<Record<string, unknown>>).map(
        (rs) =>
            `- Relationship Shift: "${rs.from || rs.source_id}" -> "${rs.to || rs.target_id}" changed to "${rs.new_feeling || rs.new_dynamic}"`
    );

    const allMandates = [...facts, ...stateChanges, ...relShifts];
    if (allMandates.length === 0) return '';

    return `<scene_blueprint>\n${allMandates.join('\n')}\n</scene_blueprint>`;
}
