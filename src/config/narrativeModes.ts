/**
 * @module config/narrativeModes
 * Narrative modes, structural modalities, mode icons, and scene-mode inference helpers.
 */

export interface NarrativeModeDefinition {
    id: string;
    category?: string;
    context: string;
    prompt: string;
    boundaryNote?: string;
    name?: string;
    title?: string;
    icon?: string;
}

export const NARRATIVE_MODE_CATEGORIES = [
    'Baseline & Pacing',
    'Action & Tension',
    'Dialogue & Social',
    'Discovery & World',
    'Emotion & Interiority',
    'Connection & Intimacy'
] as const;

export const NARRATIVE_MODE_SHARED_GUARDRAILS = `Apply the selected Narrative Mode strictly as a modulation of camera distance, pacing, sensory emphasis, and emotional focus on top of the novel's global genre, voice, and heat/content rating.
  1. **Honor the Cast List:** Never introduce, summon, or walk additional characters into a scene unless they are specified in the scene outline. Treat all dialogue or interpersonal cues in a lens as conditional on who is actually present.
  2. **Protect Canon & Continuity:** Distinguish between major canon and environmental texture: draw plot clues, world rules, key props, and shared character history strictly from the provided story bible, prior chapters, and scene outline (never inventing unauthorized lore, mystery anomalies, or fake backstory to satisfy a stylistic cue), while freely enriching scenes with minor, setting-authentic sensory and everyday details so the world feels lived-in.
  3. **Specificity Over Stock Phrasing:** Ground descriptions and emotions in concrete, character-specific sensory details and physical behavior rather than abstract emotional labels or generic genre stock phrases.
  4. **Preserve Global Voice & Rating:** Defer to the novel's core tone (e.g., noir, cozy, grimdark, lyrical, pragmatic) and content/heat boundaries whenever a lens leaves register or explicitness open.
  5. **Organic Information Delivery:** Deliver plot context, recaps, and operational plans through active character interaction, clarifying questions, and shifting stakes rather than authorial info-dumps.`;

export const LEGACY_NARRATIVE_MODE_REDIRECTS: Readonly<Record<string, string>> = {
    CATHARTIC_INTIMACY: 'INTIMACY_COORDINATOR',
    ORGANIC_EXPOSITION: 'BASELINE_NEUTRAL',
    REVELATION: 'EMOTIONAL_RUPTURE'
};

export interface StructuralModalityDefinition {
    id: string;
    name: string;
    category: string;
    summary: string;
    instruction: string;
}

export interface SceneModeInferenceInput {
    title?: string;
    goal?: string;
    objective?: string;
    scene_events?: string;
    atmospheric_overview?: string;
    modality_hand?: string[];
}

export const NARRATIVE_MODES: Record<string, NarrativeModeDefinition> = {
    BASELINE_NEUTRAL: {
        id: 'BASELINE_NEUTRAL',
        category: 'Baseline & Pacing',
        context:
            "Default balanced mode. Steady pacing across action, dialogue, and grounded interiority that defers cleanly to your novel's core genre and tone.",
        prompt:
            "Set a clear, grounded, steady rhythm that lets your novel's core genre and voice take center stage. Maintain a consistent psychic distance—staying close to the POV character's immediate perspective—so the reader experiences the room through their goals and mood rather than a detached summary. Blend light free indirect discourse directly into the narration (for instance, letting the character's private opinion tint a description of a crowded room or a delayed reply) so their interiority flows seamlessly alongside action and dialogue. Choose concrete, everyday sensory details across sight, sound, and touch that anchor the moment naturally, and let physical beats and spoken lines unfold at an unhurried, conversational cadence so the prose feels transparent and effortless."
    },
    MONTAGE_SUMMARY: {
        id: 'MONTAGE_SUMMARY',
        category: 'Baseline & Pacing',
        context:
            'Compressing hours, days, weeks, or journeys into rhythmic narrative summary, iterative action, and selective micro-vignettes.',
        prompt:
            'Lift the camera into a sweeping, rhythmic stride that compresses hours, days, or seasons into propulsive forward motion. Use habitual summary and parallelism—repeating a crisp temporal or routine marker (such as "each morning...", "by the second week...")—so the reader feels repetition, effort, and gradual change accumulating across time. Break the sweep with two or three brief, vivid micro-vignettes (a fleeting sensory detail, a scrap of dialogue, or a small turning point) so the passage feels lived-in and textured instead of skipped over. Track concrete shifts from start to finish—changing light, growing skill, physical wear, or deepening rapport—and close with a smooth zoom-in landing into a single present-moment sensory beat that returns the story cleanly to real time.'
    },
    QUIET_SLICE_OF_LIFE: {
        id: 'QUIET_SLICE_OF_LIFE',
        category: 'Baseline & Pacing',
        context:
            'Grounded, low-stakes normalcy—sharing a meal, walking a market, or enjoying an ordinary routine as a calm breather between heavy arcs.',
        prompt:
            'Offer the reader a restorative, unhurried pause—a warm window into ordinary life that reminds us who these characters are when the storm is quiet. Use unhurried dialogue tangents—easy small talk, minor preferences, or gentle banter that reveals personality without serving an urgent plot goal—paired with earned contrast, letting simple everyday pleasures (a shared meal, morning light, a familiar errand) carry quiet emotional richness because of everything the characters have endured. Keep the pacing relaxed and the sensory details simple, specific, and grounded in the present moment, giving the story breathing room so the reader feels what normal life looks like for these people and why it matters.'
    },
    KINETIC_ACTION: {
        id: 'KINETIC_ACTION',
        category: 'Action & Tension',
        context:
            'High-momentum physical sequences (fights, chases, escapes). Visceral pacing, clear spatial blocking, and sharp sensory impact.',
        prompt:
            "Pull the scene into sharp, immediate physical momentum where every heartbeat counts. Build each beat around Motivation–Reaction Units (MRUs)—putting the physical trigger first, the character's instinctive gut response second, and their deliberate move third (for example, the sudden shift of weight underfoot, the sharp intake of breath, then the lunge for balance)—so the reader feels impact in real time instead of reading a summary of it. Keep the physical blocking crystal clear: track where bodies, obstacles, exits, and moving objects sit in relation to one another so every collision or close call lands with real weight. Vary your sentence rhythm with elastic time: fire off crisp, punchy clauses during rapid bursts, then briefly stretch a decisive half-second right before a turning point so the consequence hits hard. When characters speak, keep lines short and clipped by exertion so the dialogue carries the breathlessness of motion."
    },
    ATMOSPHERIC_SUSPENSE: {
        id: 'ATMOSPHERIC_SUSPENSE',
        category: 'Action & Tension',
        context:
            'Stealth, pursuit, and creeping dread when a threat is suspected or closing in. Stretches tension through quiet detail and hyper-vigilance.',
        prompt:
            'Steep the scene in quiet, watchful dread—the prickling certainty that a threat is nearby or closing in. Use dramatic irony and delayed release by placing a subtle, unsettling detail on the page a beat before the character acts on it (such as a draft shifting where a room should be still, or a familiar sound stopping half a second too soon), giving the reader time to brace right alongside them. Pair Motivation–Reaction Units with sound-to-silence contrast: move through measured, observant sentences that track shadows, sightlines, and blind spots, then break them with a sudden short stop to mimic a held breath or a sharp freeze. Show fear through physical stillness and heightened awareness—a tight grip, shallow breathing, ears straining—so the reader feels the pressure in their own chest. If other characters are present, keep exchanges hushed and economical; if the POV character is alone, let quiet movement and watchful silence tighten the vise.',
        boundaryNote:
            'Use when a threat is known or suspected (predator-prey tension). Use UNCERTAINTY when the rules of reality or the situation itself cannot be comprehended.'
    },
    GRAND_SCALE: {
        id: 'GRAND_SCALE',
        category: 'Action & Tension',
        context:
            'In-the-moment macro-scale set pieces (armies, disasters, orbital dockings, massive crowds) experienced through a grounded human vantage point.',
        prompt:
            "Open the frame wide so the reader feels the breathtaking, humbling weight of something far larger than any single person. Anchor that magnitude through scale-by-contrast—placing one small, vulnerable human detail directly beside a vast force (for example, a lone figure shielding their eyes as a horizon fills with motion, or a trembling hand steadying against vibrating ground)—so the sheer size feels visceral rather than distant. Build momentum with anaphora and rhythmic swell, letting sweeping, layered sentences gather cadence as visuals, ground-level vibration, and immense sound converge. Keep the spectacle filtered through the POV character's limited vantage point; if others are nearby, weave in brief, shouted or hushed human reactions shaped by the sheer volume of the moment so the scale stays rooted in lived experience."
    },
    COVER_AND_BLUFF: {
        id: 'COVER_AND_BLUFF',
        category: 'Action & Tension',
        context:
            'Maintaining a fragile cover, telling a high-stakes lie, or improvising under scrutiny to keep someone from discovering the truth.',
        prompt:
            "Tighten the wire around a character performing a calm, convincing front while hiding a fragile truth under live scrutiny. Drive the tension with dramatic irony and half-truths—anchoring the lie in real, verifiable details so it sounds effortless to the listener, while letting the reader feel every inch of the thin ice underneath. Pace the scene around pressure spikes: an unexpected follow-up question, a slight pause that lasts a beat too long, or a small detail that almost slips, followed by the quick, composed improvisation needed to steer attention back. Pair outward ease (steady voice, relaxed posture, natural eye contact) with sharp, brief flashes of free indirect discourse as the POV character reads the other person's face for the slightest flicker of doubt, keeping the tone seamlessly matched to your novel's genre."
    },
    CRAFT_AND_PROCESS: {
        id: 'CRAFT_AND_PROCESS',
        category: 'Action & Tension',
        context:
            'Competence-driven sequences of making, repairing, surgery, hacking, or high-focus problem-solving under constraints.',
        prompt:
            'Draw the reader into the absorbing, tactile satisfaction of skilled work done under real constraints. Ground the sequence in sensory feedback loops—showing the character read their progress through exact, domain-authentic details of resistance, sound, heat, alignment, or texture—so competence feels earned and tangible rather than summarized. Structure the effort with micro-complications: establish a steady, methodical rhythm of steps, then introduce a small snag (a stubborn material, a tight tolerance, a slipping deadline) that forces a sharp, inventive adjustment. Let the prose mirror deep concentration, pairing precise, concrete verbs with physical focus; if others are assisting or watching, keep exchanges crisp, functional, and timed to the rhythm of the hands at work.'
    },
    VERBAL_SPARRING: {
        id: 'VERBAL_SPARRING',
        category: 'Dialogue & Social',
        context:
            'Adversarial arguments, interrogations, and high-stakes negotiations where rhetoric, leverage, and subtext drive the scene.',
        prompt:
            "Turn this conversation into a sharp, high-stakes duel of wit, leverage, and shifting control. Track status shifts across the exchange—letting a well-timed question, a pointed reframe, or a single quiet line flip who holds the upper hand in the room—so every turn of dialogue feels consequential. Pair oblique dialogue with purposeful action beats (such as setting a cup down a beat too slowly, or holding someone's gaze before answering) to replace repetitive tags, keep speaker turns effortless to follow, and pace the pauses where a verbal blow lands. Give each speaker a distinct rhythm and angle rooted in their own goals, weaving brief flashes of the POV character reading the other side's tells so the reader can follow the strategy underneath every word.",
        boundaryNote:
            'Use for zero-sum adversarial clashes. Use SOCIAL_INTRIGUE for polite, masked politics, and EMOTIONAL_RUPTURE for raw, unguarded personal blowups.'
    },
    SOCIAL_INTRIGUE: {
        id: 'SOCIAL_INTRIGUE',
        category: 'Dialogue & Social',
        context:
            'Polite masking, court or gala politics, and crowded-room subtext where alliances shift and threats hide behind etiquette.',
        prompt:
            'Step into a poised, razor-sharp social arena where good manners are armor and every small courtesy carries a second meaning. Use oblique dialogue and polite weaponization—where a warm compliment doubles as a warning, a gentle interruption shifts the floor, or a conspicuous omission speaks louder than an accusation—so the reader feels the hidden stakes humming beneath polished conversation. Treat physical blocking as status, noticing who approaches whom, who holds the center of attention, who goes quiet when a name is mentioned, and where eyes flick across the room. Balance smooth external composure with crisp flashes of free indirect discourse as the POV character tracks shifting alliances and hidden agendas, letting the reader savor the tension of playing a dangerous game while keeping a gracious smile.'
    },
    LIGHTHEARTED: {
        id: 'LIGHTHEARTED',
        category: 'Dialogue & Social',
        context:
            'Playful banter, situational comedy, and buoyant humor (witty exchanges, charming mishaps) that lift the tone from heavier stakes.',
        prompt:
            'Give the scene an easy, playful bounce—a warm, witty breather where character chemistry and timing carry the joy. Lean on deadpan understatement (treating a minor inconvenience or small absurdity with complete seriousness) and the rule of three (establishing a tidy expectation twice before playfully breaking it on the third beat) so the humor springs from sharp contrast and personality. Use callbacks to echo an earlier quirk or line with fresh timing, giving the reader the pleasure of being in on the joke. Keep the pacing nimble with dry pauses and affectionate banter, allowing light physical mishaps only when they grow naturally out of who these characters are, so the warmth feels genuine and restorative.'
    },
    PROCEDURAL_MYSTERY: {
        id: 'PROCEDURAL_MYSTERY',
        category: 'Discovery & World',
        context:
            'Investigations, clue analysis, and logical deduction—focusing on physical evidence, sharp observation, and testing hypotheses.',
        prompt:
            "Sharpen the narrative into focused, inquisitive precision, inviting the reader to piece the puzzle together right alongside the POV character. Drive the scene through false-assumption friction—having the character test an intuitive guess against a concrete physical detail that immediately complicates or disproves it (for instance, expecting wear on one side of an object only to find it untouched)—so discovery feels earned and surprising. Anchor every observation in a telling detail: choose exact, concrete nouns for textures, marks, alignments, and anomalies drawn strictly from the story's established clues so the logic stays transparent and fair. If partners or witnesses are present, let competing hypotheses spark sharp questions and collaborative testing; if the POV character is alone, trace the chain of observation and deduction cleanly through their immediate focus."
    },
    WORLD_BUILDING: {
        id: 'WORLD_BUILDING',
        category: 'Discovery & World',
        context:
            'Embedding cultural practices, history, magic/tech systems, or social rules naturally into lived-in scene action and dialogue.',
        prompt:
            "Let the setting breathe as a fully inhabited world, revealing how its customs, systems, and histories shape everyday life from the inside out. Rely on the iceberg principle: weave established local rules, idioms, taboos, or tools casually into active scene beats without stopping to explain every reference (for example, a character automatically paying a customary toll or sidestepping a local superstition as part of their errand), trusting context to teach the reader organically. Filter every detail through free indirect discourse colored by the POV character's own habit, pride, or irritation so the world feels completely lived-in and personal rather than presented like an encyclopedia. If other characters are present, let cultural friction or practical shorthand surface naturally in conversation; if alone, let routine interactions with the environment carry the depth.",
        boundaryNote:
            'Use for cultural, historical, or systemic rules. Use ENVIRONMENTAL_IMMERSION for pure sensory atmosphere.'
    },
    ENVIRONMENTAL_IMMERSION: {
        id: 'ENVIRONMENTAL_IMMERSION',
        category: 'Discovery & World',
        context:
            'Pure sensory atmosphere and sense of place—slowing down to ground the reader in a vivid setting or new location.',
        prompt:
            "Slow the reader's stride and invite them to inhabit this place fully, turning setting into a living mood rather than a painted backdrop. Use proximity layering—guiding attention smoothly from the wide feel of light, air, and architecture down to two or three sharply observed close-up textures—so the space becomes vivid and memorable while staying crisp. Bring the surroundings to life with active, mood-colored verbs (letting light pool, wind worry at an edge, or shadows lengthen) and filter every impression through subjective POV so the location reflects the character's wonder, nostalgia, or unease. Match the sentence rhythm to the character's movement—whether strolling through the space or absorbing it from a still vantage point—weaving brief, grounded impressions naturally into the atmosphere."
    },
    UNCERTAINTY: {
        id: 'UNCERTAINTY',
        category: 'Discovery & World',
        context:
            'Navigating strange occurrences, contradictory clues, or a strategic impasse where characters are lucid but genuinely do not know what is happening or how to proceed.',
        prompt:
            "Settle the scene into lucid, uneasy perplexity—the quiet friction of clear-headed characters facing something strange or hitting a dead end with no obvious next move. Use contradictory framing by placing two plain, undeniable observations side by side that refuse to fit together (for example, a familiar place behaving by unfamiliar rules, or two solid facts pointing in opposite directions), keeping the prose itself crisp and clear so the reader experiences the exact puzzle the characters are facing. Show hesitant, half-formed guesses, false starts, and unanswered questions left hanging in silence to capture the weight of stalled momentum. Match the mood to your novel's genre—whether quiet curiosity, unease, or mounting frustration—letting dialogue among multiple characters reflect competing theories and honest admissions of not knowing what comes next, or following a lone character's careful, unresolved probing.",
        boundaryNote:
            'Use for lucid confusion or strategic impasse. Use ATMOSPHERIC_SUSPENSE for suspected danger/stealth, PROCEDURAL_MYSTERY for methodical clue-solving, and ALTERED_STATE for compromised perception.'
    },
    REFLECTION: {
        id: 'REFLECTION',
        category: 'Emotion & Interiority',
        context:
            'Quiet aftermath scenes where a POV character processes grief, trauma, or major change through grounded, embodied memory.',
        prompt:
            'Let the pace soften into quiet, unhurried stillness as the POV character absorbs the weight of what has happened. Anchor their inner world with an objective correlative and associative sensory triggers—allowing an ordinary, present-moment detail (such as the warmth of a mug, a familiar sound outside, or the rhythm of a simple household task) to unexpectedly pull up a memory or mirror their grief, relief, or change. Slip smoothly into free indirect discourse so thoughts and memories surface in natural, human waves rather than tidy speeches, keeping the character physically grounded in the room so emotion stays embodied and real. If another character is already present in the scene, keep their presence gentle and understated, letting shared quiet carry as much comfort as spoken words; if the POV character is alone, let the solitude hold the full depth of the beat.'
    },
    MORAL_DILEMMA: {
        id: 'MORAL_DILEMMA',
        category: 'Emotion & Interiority',
        context:
            'The weight of an imminent, high-stakes ethical decision—competing loyalties, irreversible costs, and psychological pressure.',
        prompt:
            "Pull the scene inward around the heavy, inescapable gravity of a choice where every path carries a real cost. Anchor the abstract stakes with personified stakes—placing a tangible reminder, a waiting face, or a concrete object in the character's line of sight that embodies what will be lost—so the reader feels the human weight of the decision immediately. Use free indirect discourse to trace failed rationalization: let the character genuinely try to talk themselves into the easier or cleaner option, only to run headlong into the truth of what it demands, giving the internal struggle honest psychological teeth. Keep the surrounding space subtly pressurized by time or expectation, and express the strain through small, restrained physical habits. If other characters are present, let their hopes, pleas, or quiet scrutiny sharpen the cost; if alone, let the stillness press the character toward an irreversible decision."
    },
    EMOTIONAL_RUPTURE: {
        id: 'EMOTIONAL_RUPTURE',
        category: 'Emotion & Interiority',
        context:
            'Raw, unguarded emotional blowups—betrayals, breakups, and messy personal confrontations where cleverness gives way to hurt.',
        prompt:
            'Strip away the polish and let the scene crack open with the raw, uneven heat of a genuine personal breaking point. Build the clash around displaced grievance when appropriate—letting tension ignite over a small, ordinary trigger before the deeper hurt, betrayal, or resentment breaks through—so the argument feels painfully real instead of rehearsed. Pace the confrontation with rhythmic whiplash: alternate sharp, overlapping bursts where characters talk past each other or say something they cannot easily take back with sudden, heavy dead-air beats where the damage hangs in the silent room. Ground the fallout in visceral, unguarded physical reactions—a stiffened jaw, averted eyes, restless pacing, or the sudden awareness of how loud the room just was—so the emotional fracture lands with unmistakable human truth.'
    },
    ALTERED_STATE: {
        id: 'ALTERED_STATE',
        category: 'Emotion & Interiority',
        context:
            'Fever dreams, panic spirals, intoxication, exhaustion, or unreliable perception governed by associative, non-linear logic.',
        prompt:
            "Tilt the lens until the edges of perception blur, pulling the reader inside a mind altered by fever, exhaustion, panic, intoxication, trance, or dream logic. Use sensory bleed and unreliable framing—letting one sense slip into another, stretching or skipping time, or having the character briefly misread an ordinary detail before reality snaps back into focus—so the disorientation feels vivid and experiential while the prose itself remains evocative and legible. Shape the rhythm through syntactic mirroring: tight, looping, accelerating beats for panic, or drifting, porous, associative phrasing for fever, exhaustion, or trance. Anchor every surreal or fractured leap in the character's underlying memories, physical state, or unspoken fears so the sequence deepens psychological truth."
    },
    RELATIONAL: {
        id: 'RELATIONAL',
        category: 'Connection & Intimacy',
        context:
            'Non-romantic scenes deepening platonic, familial, or allied bonds—from shared comfort and trust to raw, unguarded emotional breakthroughs.',
        prompt:
            'Warm the scene with the quiet gravity of genuine human connection—the ease, loyalty, and hard-won trust between friends, family, or allies. Use the iceberg principle through shared shorthand and micro-caretaking (such as finishing a thought the other person trails off on, or automatically handing over something they need before they ask) to prove a deep history without stopping to summarize it. Give the dialogue an unhurried, attentive rhythm where comfortable silences and half-finished thoughts breathe naturally. When the scene calls for an emotional breakthrough, let defenses drop completely into plain, unguarded honesty, sincere reassurance, and steadying physical comfort—using shared routines when the setting invites them, or letting quiet stillness hold the weight of being truly understood.'
    },
    BUILDING_ROMANCE: {
        id: 'BUILDING_ROMANCE',
        category: 'Connection & Intimacy',
        context:
            'Establishing romantic chemistry, yearning, and slow-burn tension—as well as the vulnerable emotional breakthrough when romantic defenses finally crack.',
        prompt:
            "Slow the world down until the air between these two characters feels charged with anticipation, longing, and the quiet pull of what remains unsaid. Lean on oblique dialogue—letting characters answer a loaded question with a deflection, a lingering look, or a small physical gesture (such as pausing mid-reach or adjusting something between them)—so subtext carries the emotional heat while defenses are still up. Use sensory proximity to draw the reader's eye to the shifting inches between them: the warmth of a voice, a sudden stillness, the small details one notices only when completely absorbed in another person. Let your sentences move with an unhurried, fluid cadence that gives quiet pauses room to linger. Match the emotional temperature to their specific dynamic—whether playful, guarded, or aching—and if barriers finally crack into an honest confession, let the prose soften into plain, unguarded tenderness so the emotional breakthrough lands with full weight.",
        boundaryNote:
            'Use for slow-burn tension, yearning, and emotional confessions. Use INTIMACY_COORDINATOR once romance advances into actual physical intimacy.'
    },
    INTIMACY_COORDINATOR: {
        id: 'INTIMACY_COORDINATOR',
        category: 'Connection & Intimacy',
        context:
            'Romance advancing into actual physical intimacy—slowed pacing, personalized emotional needs and desires, mutual responsiveness, and full sensory presence.',
        prompt:
            "Slow time down to a warm, unhurried hush, honoring the full emotional and physical reality of these two specific people finally being close, calibrated strictly to your novel's established heat level and content boundaries. Center the scene on emotional–physical braiding—weaving physical sensation directly into who these characters are, letting their personal desires, hesitations, histories, and what closeness means to each of them shape every beat—so the moment could only belong to this couple. Show mutual enthusiasm and attentiveness naturally through small, lived-in cues: a quiet check-in, a softening posture, curious touch, and partners actively reading and answering each other's breath, gaze, and rhythm. Balance close-up sensory richness (warmth, texture, sound, weight, eye contact, and the quiet details of the room) with pacing through contrast—lingering beats of stillness, hushed whispers, or shared laughter—so the intimacy feels tender, deeply personal, and vividly alive.",
        boundaryNote:
            'Use when romance progresses into physical/sensual intimacy. Use BUILDING_ROMANCE for slow-burn tension and emotional confessions, and RELATIONAL for non-romantic emotional vulnerability.'
    }
};

export const NARRATIVE_MODE_ICONS: Record<string, string> = {
    BASELINE_NEUTRAL: 'book-open',
    MONTAGE_SUMMARY: 'film',
    QUIET_SLICE_OF_LIFE: 'coffee',
    KINETIC_ACTION: 'zap',
    ATMOSPHERIC_SUSPENSE: 'eye',
    GRAND_SCALE: 'globe',
    COVER_AND_BLUFF: 'fingerprint',
    CRAFT_AND_PROCESS: 'hammer',
    VERBAL_SPARRING: 'message-square',
    SOCIAL_INTRIGUE: 'crown',
    LIGHTHEARTED: 'smile',
    PROCEDURAL_MYSTERY: 'search',
    WORLD_BUILDING: 'scroll',
    ENVIRONMENTAL_IMMERSION: 'compass',
    UNCERTAINTY: 'help-circle',
    REFLECTION: 'brain',
    MORAL_DILEMMA: 'scale',
    EMOTIONAL_RUPTURE: 'scissors',
    ALTERED_STATE: 'moon',
    RELATIONAL: 'users',
    BUILDING_ROMANCE: 'heart',
    INTIMACY_COORDINATOR: 'flame',
    // Legacy fallbacks for unmigrated scene payloads
    ORGANIC_EXPOSITION: 'layers',
    REVELATION: 'sparkles',
    CATHARTIC_INTIMACY: 'flame'
};

/**
 * Resolves a stored or LLM-emitted narrative mode ID, redirecting retired built-in IDs
 * (`CATHARTIC_INTIMACY`, `ORGANIC_EXPOSITION`, `REVELATION`) to their modern counterparts.
 */
export function resolveNarrativeModeId(
    modeId: string | null | undefined,
    availableModes?: Record<string, unknown> | null
): string {
    const raw = String(modeId || '').trim();
    if (!raw) return 'BASELINE_NEUTRAL';
    if (availableModes && Object.prototype.hasOwnProperty.call(availableModes, raw)) {
        return raw;
    }
    const redirected = LEGACY_NARRATIVE_MODE_REDIRECTS[raw];
    if (redirected) {
        if (
            !availableModes ||
            Object.keys(availableModes).length === 0 ||
            Object.prototype.hasOwnProperty.call(availableModes, redirected)
        ) {
            return redirected;
        }
    }
    return raw;
}

/**
 * Groups narrative mode keys by category in canonical matrix order for `<optgroup>` dropdowns.
 * Falls back to `hasCategories: false` when callers pass minimal mode maps without `category`.
 */
export function groupNarrativeModesForSelect(allNarrativeModes: Record<string, unknown>): {
    grouped: Array<{ category: string; keys: string[] }>;
    uncategorized: string[];
    hasCategories: boolean;
} {
    const keys = Object.keys(allNarrativeModes || {});
    const buckets = new Map<string, string[]>();
    const uncategorized: string[] = [];
    let hasCategories = false;

    for (const cat of NARRATIVE_MODE_CATEGORIES) {
        buckets.set(cat, []);
    }

    for (const key of keys) {
        const entry = allNarrativeModes[key] as { category?: unknown } | null | undefined;
        const cat = entry && typeof entry.category === 'string' ? entry.category.trim() : '';
        if (cat) {
            hasCategories = true;
            const list = buckets.get(cat) || [];
            list.push(key);
            buckets.set(cat, list);
        } else {
            uncategorized.push(key);
        }
    }

    const grouped: Array<{ category: string; keys: string[] }> = [];
    for (const [category, catKeys] of buckets.entries()) {
        if (catKeys.length > 0) {
            grouped.push({ category, keys: catKeys });
        }
    }

    return { grouped, uncategorized, hasCategories };
}

/** Infers the dominant narrative mode key from scene metadata and modality hand. */
export function inferNarrativeModeForScene(
    scene: SceneModeInferenceInput | null | undefined,
    availableModes: Record<string, NarrativeModeDefinition> | null = null
): string {
    if (!scene) return 'BASELINE_NEUTRAL';
    const winModes =
        typeof window !== 'undefined'
            ? (window as unknown as { NARRATIVE_MODES?: Record<string, NarrativeModeDefinition> })
                  .NARRATIVE_MODES
            : undefined;
    const modes = availableModes || winModes || NARRATIVE_MODES;
    const canUse = (candidate: string): boolean => !modes || Boolean(modes[candidate]);
    const text =
        `${scene.title || ''} ${scene.goal || ''} ${scene.objective || ''} ${scene.scene_events || ''} ${scene.atmospheric_overview || ''} ${(Array.isArray(scene.modality_hand) ? scene.modality_hand : []).join(' ')}`.toLowerCase();

    if (modes) {
        for (const [key, modeObj] of Object.entries(modes)) {
            if (key === 'BASELINE_NEUTRAL') continue;
            const keyClean = key.toLowerCase().replace(/_/g, ' ');
            if (
                keyClean.length > 3 &&
                new RegExp(`\\b${keyClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
            ) {
                return key;
            }
            if (modeObj && (modeObj.name || modeObj.title)) {
                const nameClean = String(modeObj.name || modeObj.title).toLowerCase();
                if (
                    nameClean.length > 3 &&
                    new RegExp(`\\b${nameClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
                ) {
                    return key;
                }
            }
        }
    }

    if (
        canUse('MONTAGE_SUMMARY') &&
        /\b(?:montage|time skip|weeks pass|months pass|days pass|seasons? pass|passing weeks|over the next few weeks|iterative training|long journey across)\b/i.test(
            text
        )
    ) {
        return 'MONTAGE_SUMMARY';
    }
    if (
        canUse('INTIMACY_COORDINATOR') &&
        /\b(?:intimacy coordinator|physical intimacy|sensual intimacy|lovemaking|make love|making love|into bed together|undress\w*|consensual intimacy|carnal|passionate night)\b/i.test(
            text
        )
    ) {
        return 'INTIMACY_COORDINATOR';
    }
    if (
        canUse('KINETIC_ACTION') &&
        /\b(?:action|actions|fight|fighting|combat|battle|flee|chase|pursuit|assault|strike|striking|shoot|shooting|gunfire|ambush|explosion|breach|accelerated physicality)\b/i.test(
            text
        )
    ) {
        return 'KINETIC_ACTION';
    }
    if (
        canUse('BUILDING_ROMANCE') &&
        /\b(?:romance|romantic|attraction|yearning|kiss|kissing|intimate|intimacy|slow burn|chemistry|tender|desire|longing|flirt|flirting)\b/i.test(
            text
        )
    ) {
        return 'BUILDING_ROMANCE';
    }
    if (
        canUse('COVER_AND_BLUFF') &&
        /\b(?:bluff|bluffing|undercover|fragile cover|maintain\w* cover|blown cover|disguise|impersonat\w*|alibi|high-stakes lie|deceiv\w*|conning|poker face)\b/i.test(
            text
        )
    ) {
        return 'COVER_AND_BLUFF';
    }
    if (
        canUse('ALTERED_STATE') &&
        /\b(?:altered state|fever dream|hallucinat\w*|deliri\w*|intoxicat\w*|drunk\w*|drugged|panic spiral|concuss\w*|trance|nightmare|dissociat\w*|vertigo)\b/i.test(
            text
        )
    ) {
        return 'ALTERED_STATE';
    }
    if (
        canUse('ATMOSPHERIC_SUSPENSE') &&
        /\b(?:suspense|stealth|dread|stalk|paranoia|shadow|shadows|creeping|danger|hunt|hunting|lurk|lurking|hide|hiding|infiltrat\w*|silent|trap|trapped|suspended tension)\b/i.test(
            text
        )
    ) {
        return 'ATMOSPHERIC_SUSPENSE';
    }
    if (
        canUse('SOCIAL_INTRIGUE') &&
        /\b(?:social intrigue|court politics|gala|ballroom|banquet|etiquette|high society|diplomatic reception|salon|polite mask\w*|courtly|whispered alliances)\b/i.test(
            text
        )
    ) {
        return 'SOCIAL_INTRIGUE';
    }
    if (
        canUse('EMOTIONAL_RUPTURE') &&
        /\b(?:emotional rupture|rupture|breakup|break up|blowup|blow-up|screaming match|betrayal|shouting match|lash\w* out|raw confrontation|falling out|bitter fight)\b/i.test(
            text
        )
    ) {
        return 'EMOTIONAL_RUPTURE';
    }
    if (
        canUse('VERBAL_SPARRING') &&
        /\b(?:sparring|argument|interrogat\w*|debate|negotiat\w*|confront|verbal|clash of words|inquiry|cross-examin\w*|accuse|accusation|standoff|bicker|direct engagement)\b/i.test(
            text
        )
    ) {
        return 'VERBAL_SPARRING';
    }
    if (
        canUse('PROCEDURAL_MYSTERY') &&
        /\b(?:mystery|investigat\w*|clue|clues|evidence|deduct\w*|forensic|crime scene|anomaly|puzzle|unravel|autopsy|inspect)\b/i.test(
            text
        )
    ) {
        return 'PROCEDURAL_MYSTERY';
    }
    if (
        canUse('CRAFT_AND_PROCESS') &&
        /\b(?:craft and process|surgery|surgical|forging|blacksmith\w*|repairing|lockpick\w*|rewir\w*|calibrat\w*|disarm\w* the|decrypt\w*|hacking|tinkering|craftsmanship|fabricat\w*|alchem\w*)\b/i.test(
            text
        )
    ) {
        return 'CRAFT_AND_PROCESS';
    }
    if (
        canUse('GRAND_SCALE') &&
        /\b(?:grand scale|scale|fleet|army|troop|troops|invasion|crowd|spectacle|monumental|mass evacuation|siege|colossal|masses|orbital docking)\b/i.test(
            text
        )
    ) {
        return 'GRAND_SCALE';
    }
    if (
        canUse('UNCERTAINTY') &&
        /\b(?:uncertainty|alien|lost in the dark|disoriented|uncomprehend\w*|incomprehensible|void|bizarre|unknown|groping|perplex\w*|contradictory clues|impasse|dead end)\b/i.test(
            text
        )
    ) {
        return 'UNCERTAINTY';
    }
    if (
        canUse('REFLECTION') &&
        /\b(?:reflect|reflection|grief|mourn|mourning|aftermath|trauma|loss|quiet|contemplat\w*|coping|remorse|sorrow|solitary)\b/i.test(
            text
        )
    ) {
        return 'REFLECTION';
    }
    if (
        canUse('RELATIONAL') &&
        /\b(?:relational|bond|friendship|platonic|allies|family|reunion|camaraderie|confide|trust|partner|partnering|comforting|vulnerability drop)\b/i.test(
            text
        )
    ) {
        return 'RELATIONAL';
    }
    if (
        canUse('ENVIRONMENTAL_IMMERSION') &&
        /\b(?:environment|immersion|landscape|explor\w*|ruins|arrival|wilderness|streets of|city|weather|terrain|travel|vista)\b/i.test(
            text
        )
    ) {
        return 'ENVIRONMENTAL_IMMERSION';
    }
    if (
        canUse('MORAL_DILEMMA') &&
        /\b(?:dilemma|moral|agoniz\w*|sacrifice|impossible choice|divided loyalty|ethics|ethical choice|conscience|wager)\b/i.test(
            text
        )
    ) {
        return 'MORAL_DILEMMA';
    }
    if (
        canUse('LIGHTHEARTED') &&
        /\b(?:comedy|humor|banter|lighthearted|whimsical|laughter|relief|playful|absurd|mischief)\b/i.test(
            text
        )
    ) {
        return 'LIGHTHEARTED';
    }
    if (
        canUse('WORLD_BUILDING') &&
        /\b(?:world-building|world building|lore|history|culture|customs|tradition|ritual|mythology|ancient)\b/i.test(
            text
        )
    ) {
        return 'WORLD_BUILDING';
    }
    if (
        canUse('QUIET_SLICE_OF_LIFE') &&
        /\b(?:slice of life|daily routine|ordinary routine|mundane errand|calm breather|domestic normalcy|sharing a meal|lazy afternoon|market stroll)\b/i.test(
            text
        )
    ) {
        return 'QUIET_SLICE_OF_LIFE';
    }

    return 'BASELINE_NEUTRAL';
}

export const STRUCTURAL_MODALITIES: Record<string, StructuralModalityDefinition> = {
    DIRECT_ENGAGEMENT: {
        id: 'DIRECT_ENGAGEMENT',
        name: 'Direct Engagement',
        category: 'Interpersonal Dynamics',
        summary: 'Characters address the core friction head-on; opposing goals collide openly.',
        instruction:
            'Characters address core friction without evasion or polite deflection. Opposing objectives collide openly in dialogue or physical demands. High dramatic clarity: stakes are named, ultimatums are delivered, and neither side conceals their immediate goal.'
    },
    SUBTEXTUAL_EVASION: {
        id: 'SUBTEXTUAL_EVASION',
        name: 'Subtextual Evasion',
        category: 'Interpersonal Dynamics',
        summary: 'Characters talk around the true issue, masking stakes behind mundane tasks or polite deflection.',
        instruction:
            'Characters actively circle the unspeakable core conflict, burying true stakes beneath mundane tasks, administrative routine, or stiff politeness. Casual talk masks high tension; reveal conflict through charged silences, timing, and physical displacements.'
    },
    VULNERABILITY_DROP: {
        id: 'VULNERABILITY_DROP',
        name: 'Vulnerability Drop',
        category: 'Interpersonal Dynamics',
        summary: 'A sudden removal of emotional armor; surrendering leverage by revealing a truth.',
        instruction:
            'A character voluntarily disarms their cynical defenses, sarcasm, or conversational leverage to state a raw, vulnerable truth. The dynamic shifts from defensive sparring to disorienting emotional exposure and somatic stillness.'
    },
    DEFENSIVE_DISENGAGEMENT: {
        id: 'DEFENSIVE_DISENGAGEMENT',
        name: 'Defensive Disengagement',
        category: 'Interpersonal Dynamics',
        summary: 'A character actively pulls away—emotionally or physically—to protect themselves.',
        instruction:
            'A character recognizes an approaching emotional threshold or personal threat and actively withdraws. They erect cold boundaries, break eye contact, increase physical distance, or terminate a topic, leaving a tense vacuum.'
    },
    SUSPENDED_TENSION: {
        id: 'SUSPENDED_TENSION',
        name: 'Suspended Tension',
        category: 'Interpersonal Dynamics',
        summary: 'High friction built entirely without dialogue, relying on proximity and anticipation.',
        instruction:
            'Construct unrelenting tension purely through physical proximity, shared space, held breath, and the dread or desire of the next inevitable motion without spoken dialogue. Micro-acoustics and spatial positioning carry heavy dramatic weight.'
    },
    SENSORY_ANCHORING: {
        id: 'SENSORY_ANCHORING',
        name: 'Sensory Anchoring',
        category: 'Internal Mechanics',
        summary: 'Processing a shock or realization purely through heightened physical sensation rather than internal monologue.',
        instruction:
            'Bypass abstract internal monologues. Ground shock, revelation, or decision making entirely in visceral somatic sensation: cold metal, bitter taste, vibrations through the floor, or harsh light. Physical sensation drives immediate reflexes.'
    },
    INTERNAL_REALIGNMENT: {
        id: 'INTERNAL_REALIGNMENT',
        name: 'Internal Realignment',
        category: 'Internal Mechanics',
        summary: 'The POV character is forced to instantly reconcile new information that breaks their assumptions.',
        instruction:
            'A new revelation shatters a prior assumption or belief. Narrate the sudden emotional vertigo and shock as the ground shifts beneath the character: prior memories take on painful or startling new meaning, loyalties fracture, and the character is forced to make an immediate, messy choice without losing narrative momentum.'
    },
    FOCUS_SHIFT: {
        id: 'FOCUS_SHIFT',
        name: 'Focus Shift',
        category: 'Internal Mechanics',
        summary: 'The narrative lens suddenly widens to realize overwhelming scope, or hyper-focuses on a mundane detail.',
        instruction:
            'Abruptly alter perceptual focal length: either widen the lens to the crushing scope of systemic stakes, or snap into hyper-focus on an absurdly mundane physical detail to cope with overwhelming reality.'
    },
    ENVIRONMENTAL_FRICTION: {
        id: 'ENVIRONMENTAL_FRICTION',
        name: 'Environmental Friction',
        category: 'Environmental Mechanics',
        summary: "The physical setting actively complicates the characters' goals.",
        instruction:
            'The physical setting actively resists, disrupts, and taxes the characters. Weather, geometry, decaying equipment, or unstable footing forces characters to continuously adapt their physical blocking, voice volume, and timing.'
    },
    PUBLIC_PRIVATE_COLLISION: {
        id: 'PUBLIC_PRIVATE_COLLISION',
        name: 'Public/Private Collision',
        category: 'Environmental Mechanics',
        summary: 'The outside world interrupts an intimate dynamic, forcing characters to mask their situation.',
        instruction:
            'An intense personal confrontation or secret is suddenly intruded upon by outsiders or public circumstances. Characters must mask their conflict with rehearsed composure while fierce subtext continues beneath.'
    },
    ACCELERATED_PHYSICALITY: {
        id: 'ACCELERATED_PHYSICALITY',
        name: 'Accelerated Physicality',
        category: 'Environmental Mechanics',
        summary: 'Pacing accelerates as characters rely on physical movement rather than words; actions produce immediate, irreversible physical results.',
        instruction:
            'Urgency elevates as physical action replaces conversation. Movements, spatial hazards, and mass drive consequences forward rapidly. Every action produces immediate, irreversible physical results on the page.'
    }
};

/** Formats a scene's structural modality hand into prompt instructions. */
export function formatModalityHand(modalityHand: string[] = []): string {
    if (!Array.isArray(modalityHand) || modalityHand.length === 0) {
        return 'No specific modality hand assigned.';
    }
    return modalityHand
        .map((modKey) => {
            const cleanKey = String(modKey).trim().toUpperCase().replace(/[\s-]+/g, '_');
            const m =
                STRUCTURAL_MODALITIES[cleanKey] ||
                Object.values(STRUCTURAL_MODALITIES).find(
                    (sm) => sm.name.toLowerCase() === String(modKey).toLowerCase()
                );
            if (m) {
                return `- [${m.category}: ${m.name}]: ${m.instruction}`;
            }
            return `- [Structural Movement: ${modKey}]: Weave this distinct structural mode to drive dynamic narrative friction.`;
        })
        .join('\n');
}
