/**
 * @module config/narrativeStructurePrompts
 * Macro 4-Act Function (NARRATIVE_ACTS) and Meso 8-Sequence Craft Elevation
 * (NARRATIVE_SEQUENCES) specifications, automatic 3-Act-to-4-Act routing,
 * and XML formatting helpers for layered prompt injection.
 */

export type NarrativeActId = 'ACT_1' | 'ACT_2A' | 'ACT_2B' | 'ACT_3';

export type NarrativeSequenceId =
    | 'SEQUENCE_1'
    | 'SEQUENCE_2'
    | 'SEQUENCE_3'
    | 'SEQUENCE_4'
    | 'SEQUENCE_5'
    | 'SEQUENCE_6'
    | 'SEQUENCE_7'
    | 'SEQUENCE_8';

export interface NarrativeActDefinition {
    id: NarrativeActId;
    actNumber: 1 | 2 | 3;
    title: string;
    sequenceScope: string;
    primaryJob: string;
    pacingStakesRule: string;
    context: string;
    prompt: string;
}

export interface NarrativeSequenceDefinition {
    id: NarrativeSequenceId;
    sequenceNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    parentActId: NarrativeActId;
    title: string;
    aiPitfallAddressed: string;
    keyCraftElevation: string;
    context: string;
    prompt: string;
}

export const NARRATIVE_ACTS: Record<NarrativeActId, NarrativeActDefinition> = {
    ACT_1: {
        id: 'ACT_1',
        actNumber: 1,
        title: 'Setup, World Grounding & Commitment',
        sequenceScope: 'Sequences 1–2',
        primaryJob: 'Setup, world grounding, character investment, and disruption into commitment.',
        pacingStakesRule:
            'Keep larger mysteries open; establish lived-in setting reality before shifting the ground.',
        context:
            "Establish the protagonist's normal world, core desire, and hidden flaw; actively build out the lived-in texture of the setting, plant early seeds, and disrupt the status quo until they cross a point of no return.",
        prompt:
            "Ground this scene in the gravity of Act 1: inviting the reader into a believable, tactile reality while letting small, early fissures hint at the larger story ahead. Prioritize verisimilitude and lived-in world expansion—actively paint and flesh out where and when this story lives by weaving in concrete, era- or world-authentic background details (such as everyday tools, local customs, workplace rhythms, ambient sounds, or social norms that stay faithful to your established canon) so the story immediately feels rooted in a real place rather than floating in a blank room. Build character investment and foreshadowing by showing who the POV character is through their daily habits, loyalties, and blind spots (for example, how they navigate a minor friction or protect a quiet vulnerability) so the reader cares deeply before the ground shifts beneath them. Use controlled exposition and thematic seeding: introduce key relationships, rules, and recurring motifs lightly as organic parts of the scene, keeping the central mysteries and larger conflict open and unfolding rather than answered all at once. Let every disruption feel consequential enough to pull the character off balance while preserving the full weight of the story's stakes for later acts."
    },
    ACT_2A: {
        id: 'ACT_2A',
        actNumber: 2,
        title: 'Exploration, Complication & Rising Momentum',
        sequenceScope: 'Sequences 3–4',
        primaryJob: 'Exploration, promise of the premise, widening cast, and rising complications.',
        pacingStakesRule:
            'Deliver genre pleasures while every small win adds a fresh wrinkle leading toward the Midpoint.',
        context:
            'Deliver the promise of the premise as the protagonist tests this new reality, deepens alliances, and hits escalating complications leading toward the midpoint.',
        prompt:
            "Steer this scene with the expansive, testing energy of early Act 2: the protagonist is navigating unfamiliar territory, learning the rules of the new situation, and reacting to obstacles that keep proving trickier than expected. Lean on escalating complication and promise of the premise—let each scene deliver the core pleasures, relationships, and world dynamics the reader came for, while ensuring that every small win or discovery introduces a fresh wrinkle, cost, or unanswered question (for instance, solving an immediate problem only to reveal how much bigger the real obstacle is). Deepen secondary relationships and subplots naturally so the cast and stakes widen, keeping the protagonist's original assumptions intact enough that a coming shift in perspective will genuinely surprise them."
    },
    ACT_2B: {
        id: 'ACT_2B',
        actNumber: 2,
        title: 'Proactive Push, Tightening Pressure & Crisis',
        sequenceScope: 'Sequences 5–6',
        primaryJob: 'Proactive push under duress, narrowing exits, and compounding consequences.',
        pacingStakesRule:
            'Converge existing threads and strip away safety nets; avoid introducing brand-new subplots.',
        context:
            'Shift the protagonist from reacting to driving events as opposition intensifies and safety nets strip away toward the lowest point.',
        prompt:
            'Tighten the narrative vise with the relentless, narrowing pressure of late Act 2: the exploratory phase is over, and every choice now carries visible, compounding consequences. Center the scene on proactive agency under duress and erosion of safety nets—the POV character is actively pushing toward their goal with clearer eyes, yet external opposition, internal flaws, or competing loyalties steadily close off their easy exits (such as a trusted plan failing, an alliance fraying, or a personal compromise coming due). Let earlier planted threads and mistakes begin to collide rather than introducing brand-new subplots, so the reader feels the walls moving inward and the cost of failure growing unmistakable.'
    },
    ACT_3: {
        id: 'ACT_3',
        actNumber: 3,
        title: 'Convergence, Reckoning & Resonant Aftermath',
        sequenceScope: 'Sequences 7–8',
        primaryJob: 'Convergence, decisive reckoning, transformation proof, and resonant aftermath.',
        pacingStakesRule:
            'Pay off planted threads through action; echo the opening to show irreversible change.',
        context:
            "Converge established threads into decisive action, test the protagonist's transformation under maximum stakes, and close with a resonant echo of the beginning.",
        prompt:
            "Bring the full weight of the novel into sharp, decisive focus: Act 3 is about payoff, reckoning, and irreversible commitment. Drive the scene through thematic convergence—pulling established relationships, earlier clues, and the protagonist's core inner struggle directly into the foreground so every beat resolves or transforms threads the reader has already invested in. Test the character's growth through behavioral proof (showing them make a choice or take a stand they would have been incapable of in Act 1) so transformation feels earned through action rather than declared in speeches. As the dust settles in the closing beats, weave in a structural echo—revisiting a familiar image, setting, or dynamic from the opening chapters—so the reader can feel in one glance how profoundly the character and their world have changed."
    }
};

export const NARRATIVE_SEQUENCES: Record<NarrativeSequenceId, NarrativeSequenceDefinition> = {
    SEQUENCE_1: {
        id: 'SEQUENCE_1',
        sequenceNumber: 1,
        parentActId: 'ACT_1',
        title: 'Status Quo & Inciting Disruption',
        aiPitfallAddressed: 'Rushing status quo in 2 paragraphs; throat-clearing openings.',
        keyCraftElevation:
            'Micro-arc of normalcy, demonstrated equilibrium, hairline crack, oblique disruption.',
        context:
            'Give the normal world room to breathe as its own self-contained mini-arc—establishing lived-in rhythms, relationships, and a subtle hairline crack—before letting the inciting disruption intrude sideways.',
        prompt:
            'Give the ordinary world full room to breathe, treating the status quo as its own rewarding, self-contained mini-story before anything breaks. Open with an in-motion status quo built around a micro-arc of normalcy—give the POV character a concrete, small-scale everyday goal with its own minor friction, character-revealing choices, and quiet resolution (such as completing a familiar responsibility, handling a routine social snag, or protecting a small personal ritual) so the reader immediately enjoys inhabiting their life in real time. Anchor this baseline through demonstrated equilibrium: show the textures, comforts, and unspoken rules of their world through at least two lived-in pillars—such as a daily competence and a familiar relationship—paired with a subtle hairline crack (a livable imperfection or quiet longing) that hints at who they could become. Stay fully immersed in this ordinary arc for every scene leading up to the catalyst; only when the scene outline explicitly calls for the turning point, stage an oblique disruption that intrudes sideways into a grounded, ordinary moment so the reader feels the genuine shock of a real, fully realized life tilting off its axis.'
    },
    SEQUENCE_2: {
        id: 'SEQUENCE_2',
        sequenceNumber: 2,
        parentActId: 'ACT_1',
        title: 'Predicament, Resistance & Lock-In',
        aiPitfallAddressed: 'Instant compliance or passive, repetitive whining.',
        keyCraftElevation:
            'Active resistance (patching the leak), narrowing options, earned lock-in choice.',
        context:
            "Turn reluctance into active, intelligent attempts to preserve normal life until the protagonist's own efforts tangle them deeper and force an irreversible choice.",
        prompt:
            'Hold these scenes in the taut, human friction of someone fighting to keep their footing as the ground shifts beneath them. Drive the middle of this sequence through active resistance—have the POV character take concrete, sensible, character-authentic steps to contain the disruption or restore their old equilibrium (for example, calling in a favor, testing a quick workaround, or setting a firm boundary), letting those very attempts expose how deep the problem runs and tangle them further. Use narrowing options across each beat so every half-measure closes an easy exit while clarifying what is truly at stake. Build toward an earned lock-in: frame the Act 1 turning point as an active, character-revealing decision—even under heavy pressure—so crossing into the main story feels chosen, costly, and irreversible.'
    },
    SEQUENCE_3: {
        id: 'SEQUENCE_3',
        sequenceNumber: 3,
        parentActId: 'ACT_2A',
        title: 'First Attempt & Early Friction',
        aiPitfallAddressed: 'Episodic "and then..." drift; instant ally harmony; easy wins.',
        keyCraftElevation: 'Tight causal chaining, productive ally friction, competent failure.',
        context:
            "Chain scenes through tight cause-and-effect as the protagonist's clever first plan collides with deeper rules and new allies bring prickly, independent agendas.",
        prompt:
            'Launch the protagonist onto unfamiliar ground with brisk, investigative energy where every scene pulls directly into the next. Link events through tight causal chaining—using "therefore" and "but" momentum so each scene\'s outcome actively triggers the next obstacle, keeping the sequence taut and cohesive. Ground early relationships in productive ally friction: give new partners, mentors, or counterparts their own distinct motives, blind spots, or guarded boundaries (such as helping for a different reason, or questioning the protagonist\'s judgment) so trust feels earned inch by inch. Steer the sequence toward competent failure: let the protagonist\'s first strategy be genuinely smart and grounded in their old strengths, yet still fall short because it treats a surface symptom rather than the deeper rule governing this new territory.'
    },
    SEQUENCE_4: {
        id: 'SEQUENCE_4',
        sequenceNumber: 4,
        parentActId: 'ACT_2A',
        title: 'Escalating Tests & Midpoint Shift',
        aiPitfallAddressed: 'Saggy-middle repetition; out-of-nowhere or speechified Midpoint.',
        keyCraftElevation:
            'B-story entanglement, earned contrast before turn, retroactive recontextualization.',
        context:
            'Entangle personal bonds with external stakes, let a beat of genuine warmth or false footing breathe, and pivot on a Midpoint that retroactively re-illuminates earlier details.',
        prompt:
            "Build a rising current of personal investment and mounting tension that converges on a perspective-altering hinge. Weave B-story entanglement directly into the external plot so the protagonist's closest relationship or inner desire begins pulling against—or reshaping—what they thought they wanted to win. Carve out earned contrast right before the turn: allow a brief, genuine beat of confidence, warmth, or apparent progress to breathe so the coming shift lands with maximum emotional drop. Anchor the Midpoint in retroactive recontextualization—design the discovery, false victory, or reversal so it suddenly re-illuminates a seemingly small detail, habit, or promise from earlier chapters, reframing the entire story in a single stroke and transforming how the protagonist sees the road ahead."
    },
    SEQUENCE_5: {
        id: 'SEQUENCE_5',
        sequenceNumber: 5,
        parentActId: 'ACT_2B',
        title: 'Proactive Push & Counter-Pressure',
        aiPitfallAddressed: 'One-note loudness; cartoonish opposition; forgetting internal flaw.',
        keyCraftElevation:
            'Intelligent counter-strategy and pyrrhic victories (tactical wins with moral/relational debt).',
        context:
            'Pit a sharper, proactive protagonist against an observant, adaptive opposing force, letting tactical victories quietly accumulate moral or relational debt.',
        prompt:
            "Tighten these scenes into a sharp, high-stakes chess match where both sides are thinking two moves ahead. Elevate the tension through intelligent counter-strategy: treat the opposing force—whether a rival, an institution, or escalating circumstances—as observant and adaptive, responding specifically to what it can realistically see and closing loopholes the protagonist counted on. Layer complexity with pyrrhic victories: let the protagonist's proactive push score genuine tactical gains that quietly carry a steep moral, emotional, or relational debt (for instance, securing an advantage by withholding a truth from an ally, or leaning too hard on their oldest defensive habit). Let the reader feel the unsettling tension of a character winning the battle while steadily compromising what matters most, steering cleanly toward a sobering setback."
    },
    SEQUENCE_6: {
        id: 'SEQUENCE_6',
        sequenceNumber: 6,
        parentActId: 'ACT_2B',
        title: 'Compounding Fallout & Lowest Point',
        aiPitfallAddressed: 'Random misery pile-on; melodramatic despair monologues.',
        keyCraftElevation:
            'Tragic irony (self-authored collapse) and understated devastation via quiet specifics.',
        context:
            "Let the protagonist's own Act 1 blind spot help trigger the collapse, conveying rock bottom through quiet, specific absence and understated devastation.",
        prompt:
            "Bring the full weight of earlier choices crashing together so the collapse feels both devastating and deeply earned. Anchor the turning point in tragic irony—ensure the crisis is triggered, at least in part, by the protagonist's own Act 1 flaw, defensive lie, or blind spot finally coming due alongside external pressure, making the defeat painfully personal. As backup plans and safety nets fall away across the sequence, deliver rock bottom through understated devastation: convey the darkest beat via quiet, concrete specifics—a broken ordinary routine, an empty chair, a small object left behind, or a conversation that simply stops—so restraint lets the reader feel the full hollowness of the loss. Leave the protagonist genuinely stripped of their old armor at the bottom of the trough, with only the raw truth left standing."
    },
    SEQUENCE_7: {
        id: 'SEQUENCE_7',
        sequenceNumber: 7,
        parentActId: 'ACT_3',
        title: 'Regroup, Renewed Resolve & Climax Threshold',
        aiPitfallAddressed: 'Pep-talk flaw cures; last-minute magic-bullet finale plans.',
        keyCraftElevation:
            'Costly clarity, earned resourcefulness, and threshold break forcing improvisation.',
        context:
            'Ground the shift in reluctant, costly honesty, build the final push strictly from established tools and bonds, and break the plan at the threshold so the climax demands improvisation.',
        prompt:
            "Turn the quiet stillness of rock bottom into hard-won, imperfect resolve that accelerates toward the climax. Open the turn with costly clarity—let the protagonist's shift in mindset arrive as reluctant, grounded honesty while they are still bruised and uncertain, accepting a painful truth they resisted all story rather than curing their flaw overnight. Build the final rally through earned resourcefulness, drawing strictly on established relationships, skills, and hard-won knowledge from earlier chapters so every piece of the push feels paid for. Then spring a sharp threshold break right before the finale—a sudden complication, shifting timeline, or unexpected sacrifice that shatters the neat plan on contact, propelling the protagonist into the climax forced to improvise under maximum stakes."
    },
    SEQUENCE_8: {
        id: 'SEQUENCE_8',
        sequenceNumber: 8,
        parentActId: 'ACT_3',
        title: 'Climax & Resonant Resolution',
        aiPitfallAddressed: 'Thematic speeches; neat-bow epilogues; fortune-cookie endings.',
        keyCraftElevation:
            'Thematic proof through sacrifice/restraint, textured aftermath, quiet structural echo.',
        context:
            'Prove transformation through a costly climactic choice, then land in a textured, slightly asymmetrical aftermath that quietly echoes Sequence 1.',
        prompt:
            "Focus every beat of the climax into a decisive crucible where character and plot resolve as one. Deliver thematic proof through sacrifice or restraint—let the turning point hinge on a concrete, costly choice that only the transformed protagonist could make (such as releasing a lifelong grudge, risking something precious for another, or choosing truth over safety), proving who they have become entirely through action. Once the peak breaks, ease into a textured aftermath: honor the real human residue of the journey—a lingering ache, a changed dynamic, or a bittersweet trade-off alongside the victory—so the ending feels lived-in and true. Close on a quiet structural echo—a simple sensory image, gesture, or everyday moment that mirrors Sequence 1 in a transformed light—trusting the contrast itself to carry the story's lasting meaning."
    }
};

const DEFAULT_ACT_BY_SEQUENCE = [1, 1, 2, 2, 2, 2, 3, 3] as const;

function parseBasicActNum(raw: unknown, seqNum: number): 1 | 2 | 3 {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (raw <= 1) return 1;
        if (raw >= 3) return 3;
        return 2;
    }
    if (typeof raw === 'string' && raw.trim()) {
        const clean = raw.trim().toUpperCase().replace(/^ACT\s*/i, '').trim();
        if (/^(?:III|3)\b/.test(clean)) return 3;
        if (/^(?:II|2)\b/.test(clean)) return 2;
        if (/^(?:I|1)\b/.test(clean)) return 1;
        const n = Number.parseInt(clean, 10);
        if (Number.isFinite(n)) {
            if (n <= 1) return 1;
            if (n >= 3) return 3;
            return 2;
        }
    }
    return DEFAULT_ACT_BY_SEQUENCE[seqNum - 1] ?? 3;
}

/**
 * Resolves the 4-Act Function (`ACT_1`, `ACT_2A`, `ACT_2B`, `ACT_3`) for a sequence at `seqIdx`
 * inside a 3-Act persistence schema, routing pre-Midpoint Act 2 sequences to `ACT_2A` and
 * post-Midpoint Act 2 sequences to `ACT_2B`.
 */
export function resolveNarrativeActForSequence(
    seqIdx: number,
    sequences?: ReadonlyArray<Record<string, unknown>> | null,
    fallbackSeqObj?: Record<string, unknown> | null
): NarrativeActDefinition {
    const seqList = Array.isArray(sequences) ? sequences : [];
    const seqObj = fallbackSeqObj || seqList[seqIdx] || null;
    const rawOverride = typeof seqObj?.narrative_act_id === 'string' ? seqObj.narrative_act_id.trim() : '';
    if (rawOverride && Object.prototype.hasOwnProperty.call(NARRATIVE_ACTS, rawOverride)) {
        return NARRATIVE_ACTS[rawOverride as NarrativeActId];
    }

    const seqNum = Number(seqObj?.number || seqIdx + 1 || 1);
    const parentAct = parseBasicActNum(seqObj?.parent_act, seqNum);
    if (parentAct === 1) return NARRATIVE_ACTS.ACT_1;
    if (parentAct === 3) return NARRATIVE_ACTS.ACT_3;

    if (seqList.length > 0) {
        const act2Indices: number[] = [];
        seqList.forEach((item, idx) => {
            const itemNum = Number(item?.number || idx + 1 || 1);
            if (parseBasicActNum(item?.parent_act, itemNum) === 2) {
                act2Indices.push(idx);
            }
        });
        const posInAct2 = act2Indices.indexOf(seqIdx);
        if (posInAct2 >= 0) {
            const midpointSplit = Math.ceil(act2Indices.length / 2);
            return posInAct2 < midpointSplit ? NARRATIVE_ACTS.ACT_2A : NARRATIVE_ACTS.ACT_2B;
        }
    }

    return seqNum <= 4 ? NARRATIVE_ACTS.ACT_2A : NARRATIVE_ACTS.ACT_2B;
}

/**
 * Resolves the 8-Sequence Craft Elevation definition (`SEQUENCE_1`..`SEQUENCE_8`) for a
 * sequence at `seqIdx`, handling both canonical 8-sequence novels and custom sequence counts.
 */
export function resolveNarrativeSequenceForIndex(
    seqIdx: number,
    sequences?: ReadonlyArray<Record<string, unknown>> | null,
    fallbackSeqObj?: Record<string, unknown> | null
): NarrativeSequenceDefinition {
    const seqList = Array.isArray(sequences) ? sequences : [];
    const seqObj = fallbackSeqObj || seqList[seqIdx] || null;
    const rawOverride =
        typeof seqObj?.narrative_sequence_id === 'string'
            ? seqObj.narrative_sequence_id.trim()
            : '';
    if (rawOverride && Object.prototype.hasOwnProperty.call(NARRATIVE_SEQUENCES, rawOverride)) {
        return NARRATIVE_SEQUENCES[rawOverride as NarrativeSequenceId];
    }

    const seqNum = Number(seqObj?.number || seqIdx + 1 || 1);
    if (seqList.length === 0 || seqList.length === 8) {
        const clamped = Math.min(8, Math.max(1, Number.isFinite(seqNum) ? Math.trunc(seqNum) : 1));
        return NARRATIVE_SEQUENCES[`SEQUENCE_${clamped}` as NarrativeSequenceId];
    }

    const actDef = resolveNarrativeActForSequence(seqIdx, seqList, seqObj);
    const sameActIndices: number[] = [];
    seqList.forEach((item, idx) => {
        if (resolveNarrativeActForSequence(idx, seqList, item).id === actDef.id) {
            sameActIndices.push(idx);
        }
    });
    const posInGroup = Math.max(0, sameActIndices.indexOf(seqIdx));
    const isTerminalInGroup =
        sameActIndices.length > 1
            ? posInGroup === sameActIndices.length - 1
            : actDef.id === 'ACT_3';

    if (actDef.id === 'ACT_1') {
        return isTerminalInGroup ? NARRATIVE_SEQUENCES.SEQUENCE_2 : NARRATIVE_SEQUENCES.SEQUENCE_1;
    }
    if (actDef.id === 'ACT_2A') {
        return isTerminalInGroup ? NARRATIVE_SEQUENCES.SEQUENCE_4 : NARRATIVE_SEQUENCES.SEQUENCE_3;
    }
    if (actDef.id === 'ACT_2B') {
        return isTerminalInGroup ? NARRATIVE_SEQUENCES.SEQUENCE_6 : NARRATIVE_SEQUENCES.SEQUENCE_5;
    }
    return isTerminalInGroup ? NARRATIVE_SEQUENCES.SEQUENCE_8 : NARRATIVE_SEQUENCES.SEQUENCE_7;
}

/**
 * Formats `<active_act_function>` and `<active_sequence_craft>` XML blocks for layered injection
 * directly above `<active_scene_narrative_style>` or `<available_narrative_styles>`.
 */
export function formatActiveActAndSequenceXml(
    actDef: NarrativeActDefinition,
    seqDef: NarrativeSequenceDefinition,
    scenePos?: { sceneIndex: number; totalScenes: number }
): string {
    const hasPos = Boolean(scenePos && scenePos.totalScenes > 0);
    const sceneOneBased = hasPos ? scenePos!.sceneIndex + 1 : 0;
    const totalScenes = hasPos ? scenePos!.totalScenes : 0;
    const posLine = hasPos ? `\n- Scene Position in Sequence: Scene ${sceneOneBased} of ${totalScenes}` : '';
    const posScopeNote = hasPos
        ? ` (apply strictly to beats belonging to Scene ${sceneOneBased} of ${totalScenes} in <scene_blueprint>; do not rush ahead to later scenes' turns)`
        : '';

    return `<active_act_function>
- Act Function Identifier: ${actDef.id} (${actDef.title} — ${actDef.sequenceScope})
- Macro Overview: ${actDef.context}
- Core Pacing & Stakes Rule: ${actDef.pacingStakesRule}
- Macro Act Directives:
${actDef.prompt}
</active_act_function>

<active_sequence_craft>
- Sequence Craft Identifier: ${seqDef.id} (${seqDef.title} — Parent: ${seqDef.parentActId})${posLine}
- Sequence Craft Overview: ${seqDef.context}
- AI Pitfall to Counter: ${seqDef.aiPitfallAddressed}
- Key Craft Elevation: ${seqDef.keyCraftElevation}
- Sequence Craft Directives${posScopeNote}:
${seqDef.prompt}
</active_sequence_craft>`;
}

/** Formats the complete 4-Act Function catalog for Act Architect & Act Reviewer prompts. */
export function formatActFunctionGuideXml(): string {
    const body = (Object.values(NARRATIVE_ACTS) as NarrativeActDefinition[])
        .map(
            (act) => `  <act_function id="${act.id}" act_number="${act.actNumber}" scope="${act.sequenceScope}" title="${act.title}">
    <primary_job>${act.primaryJob}</primary_job>
    <pacing_stakes_rule>${act.pacingStakesRule}</pacing_stakes_rule>
    <short_description>${act.context}</short_description>
    <craft_directives>${act.prompt}</craft_directives>
  </act_function>`
        )
        .join('\n');

    return `<act_function_craft_guide>
  <!-- 3-Act Schema Mapping: Act 1 = ACT_1 (Seq 1–2); Act 2 = ACT_2A pre-Midpoint (Seq 3–4) + ACT_2B post-Midpoint (Seq 5–6); Act 3 = ACT_3 (Seq 7–8) -->
${body}
</act_function_craft_guide>`;
}

/** Formats the complete 8-Sequence Craft Elevation catalog for Sequence Planner & Reviewer prompts. */
export function formatSequenceCraftGuideXml(): string {
    const body = (Object.values(NARRATIVE_SEQUENCES) as NarrativeSequenceDefinition[])
        .map(
            (seq) => `  <sequence_craft id="${seq.id}" number="${seq.sequenceNumber}" parent_act="${seq.parentActId}" title="${seq.title}">
    <ai_pitfall_addressed>${seq.aiPitfallAddressed}</ai_pitfall_addressed>
    <key_craft_elevation>${seq.keyCraftElevation}</key_craft_elevation>
    <short_description>${seq.context}</short_description>
    <craft_directives>${seq.prompt}</craft_directives>
  </sequence_craft>`
        )
        .join('\n');

    return `<sequence_craft_elevation_guide>
${body}
</sequence_craft_elevation_guide>`;
}
