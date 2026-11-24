/**
 * @module config/narrativeModes
 * Narrative modes, structural modalities, mode icons, and scene-mode inference helpers.
 */

export interface NarrativeModeDefinition {
    id: string;
    context: string;
    prompt: string;
    name?: string;
    title?: string;
    icon?: string;
}

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
        context: 'Default writing style. Balanced pacing with natural emotional warmth and narrative clarity.',
        prompt:
            'Establish a transparent, steady narrative rhythm by balancing action, dialogue, and grounded interiority so the reader stays immersed in the core genre. Emphasize emotional authenticity and natural character chemistry. Anchor any internal thoughts to present-moment sensory details or physical actions, keeping unbroken introspection to 1-2 sentences. Filter the environment through the POV character\'s immediate goals and emotional state. Prioritize specific tactile or auditory details over broad visual descriptions, actively avoiding generic clichés. Subvert predictive text by bypassing the most statistically obvious descriptive choices in favor of precise, unexpected sensory elements. Allow minor actions and dialogue to overlap and interrupt one another naturally, creating fluid choreography.'
    },
    KINETIC_ACTION: {
        id: 'KINETIC_ACTION',
        context: 'High-momentum physical sequences. Visceral pacing with sharp sensory focus.',
        prompt:
            'Drive visceral momentum through strict parataxis—short, severed sentences that mirror breathless urgency. Filter the environment through the body: weight, momentum, gravity, spatial awareness of threats and barriers. Prioritize kinesthesia and violent tactile friction over visual tracking, avoiding ubiquitous action clichés. Excavate precise, muscular verbs of mass and velocity. Internal thought is minimal—instinct and reaction dominate. Dialogue emerges in sharp fragments uttered mid-movement. Allow actions to overlap, interrupt, and cascade into immediate consequences rather than unfolding in rigid sequence.'
    },
    BUILDING_ROMANCE: {
        id: 'BUILDING_ROMANCE',
        context: 'Establishing chemistry, yearning, and romantic tension. Focus on the "slow burn" and gravity between characters.',
        prompt:
            'Cultivate an atmosphere of electric tension and yearning by radically dilating narrative time so the reader feels the magnetic gravity between the characters. Filter the environment through hyper-awareness of proximity and desire. Shift sensory focus to radiant heat, the friction of breath, and the displacement of air. Push the prose past standard romantic clichés by inventing idiosyncratic, highly specific physical details that capture the terrifying vulnerability of attraction. Focus on micro-gestures: the exact mechanics of a gaze, the negative space between hands, the involuntary lean. Utilize flowing, unhurried sentence structures. Manifest attraction through concrete sensory correlatives rather than abstract emotional labels. Dialogue should be subtextual and hesitant, with overlapping, unfinished sentences serving as a proxy for physical intimacy.'
    },
    ATMOSPHERIC_SUSPENSE: {
        id: 'ATMOSPHERIC_SUSPENSE',
        context: 'Stealth, hunting, creeping dread. Focus on paranoia and the dilation of time.',
        prompt:
            'Instill creeping dread and paranoia by stretching time—use long, hypotactic sentences that delay the primary verb until the end of the paragraph. Filter the environment through the character\'s fear of the unknown: the geometry of shadows, blind spots, and thresholds. Prioritize micro-acoustics and negative space over visual clarity, avoiding generic suspense clichés. Manufacture hyper-specific, mundane auditory triggers that ground the paranoia in reality. Convey fear through the physiological reality of hyper-vigilance rather than naming the emotion directly. Allow brief, anchored internal dread (1-2 sentences) that heightens the tension. Dialogue is hushed, urgent, and overlapping. Choreograph agonizingly slow movements that are abruptly interrupted by shifting environmental variables.'
    },
    VERBAL_SPARRING: {
        id: 'VERBAL_SPARRING',
        context: 'High-stakes arguments, negotiations, or interrogations. Dialogue drives the scene.',
        prompt:
            'Treat this sequence as a high-stakes exchange fought through rhetoric and subtext. Ensure each character uses a distinct vocabulary tier, rhythm, and rhetorical strategy rooted in their personality and motivations. Filter the environment through conversational tension; describe only the physical props that characters actively wield or manipulate to punctuate a point. Elevate the dialogue through rapid-fire, overlapping exchanges with minimal dialogue tags. Manufacture idiosyncratic, multi-layered rhetorical traps, evasions, and moments of disarming honesty rather than relying on standard angry retorts. Characters test each other out loud rather than retreating into deep internal strategy. Physical micro-movements overlap with the verbal strikes to control the pacing of the argument.'
    },
    PROCEDURAL_MYSTERY: {
        id: 'PROCEDURAL_MYSTERY',
        context: 'Investigations, analyzing clues, logical deduction. Focus on sharp sensory observation, physical evidence, and mounting stakes.',
        prompt:
            'Adopt a focused, observant investigative perspective driven by urgent human curiosity and the tension of unanswered questions. Filter the environment through concrete physical clues, anomalies, and human friction rather than cold clinical detachment. Prioritize specific tactile weights, textures, and exact sensory clues, avoiding generic investigator clichés. Seek the most precise noun for every object. Subvert standard investigations by inventing bizarre, hyper-specific anomalies that challenge the characters. Let personal stakes, dread, or intense obsession carry the tension rather than sterile detachment. Externalize the deductive process through collaborative, interrogative dialogue: characters move through the space, examining evidence, challenging each other\'s theories, and reacting with genuine human frustration, awe, or alarm in real time.'
    },
    GRAND_SCALE: {
        id: 'GRAND_SCALE',
        context: 'In-the-moment macro-scale events (e.g., troop movements, docking shuttles, arriving crowds).',
        prompt:
            'Pull the narrative camera back to capture sheer magnitude. Overwhelm the reader with the logistics and choreography of macro-forces while filtering the event through the tiny, vulnerable human perspective of awe, terror, or desperate resolve. Shift the sensory focus to kinesthetic pressure: the vibration of the ground, deafening synchronous noise, and atmospheric displacement. Avoid generic disaster clichés and bombastic purple prose. Forge unexpected, hyper-specific analogies that convey scale through stark juxtaposition with the mundane. Utilize sweeping, rhythmic sentence structures that build in volume. Ground the scale by having focal characters react vocally—shouting instructions, calling out to each other, or whispering prayers over the environmental noise.'
    },
    WORLD_BUILDING: {
        id: 'WORLD_BUILDING',
        context: 'Zooming in to creatively invent/explain specific details about histories, cultural practices, systems, or environments.',
        prompt:
            'Expand the world\'s lore through seamless, lived-in embedding so the reader absorbs complex rules or cultural histories without feeling lectured. Filter the lore through the POV character\'s personal bias—whether reverence, annoyance, or normalized routine—so the world feels inhabited. Anchor exposition in immediate sensory experience: specific tactile interactions with a relevant artifact, tool, or environmental detail. Avoid generic genre clichés. Manufacture defamiliarized sensory details that make the lore feel profoundly real and grounded. The prosody should be conversational but richly textured. Characters actively discuss, teach, or casually reference the lore through organic dialogue. Physical manipulation of world-building artifacts overlaps naturally with the spoken explanations.'
    },
    LIGHTHEARTED: {
        id: 'LIGHTHEARTED',
        context: 'Comedic relief, joyful banter, whimsical situations providing a breather from heavy stakes.',
        prompt:
            'Elevate the tone to feel swift, bright, and buoyant through comedic juxtaposition and bathos, providing a joyful or absurd reprieve from heavier stakes. Filter the environment through buoyancy: absurdities, colorful contrasts, and whimsical inconveniences. Shift sensory focus toward quirky, unexpected inputs—a bizarre texture, an oddly pitched sound, a clumsy kinesthetic interaction. Avoid forced jokes, generic slapstick, or obvious witty clichés. Manufacture highly specific situational irony and understatements that rely on the characters\' contrasting worldviews. The prose should have a swift, bouncy prosody with sharp comedic pauses and overlapping dialogue. Allow characters to connect externally through warmth, banter, and genuine affection. Choreograph physical comedy and synchronized action: clumsy mistakes and environmental interactions happen simultaneously with the dialogue.'
    },
    ORGANIC_EXPOSITION: {
        id: 'ORGANIC_EXPOSITION',
        context: 'Characters organically explaining context, plot, or plans to one another (e.g., heist planning).',
        prompt:
            'Transfer vital plot information without resorting to authorial info-dumping by treating the exposition as an active, character-driven event where the act of explaining is itself dramatic. Filter the environment through the interpersonal dynamics of the conversation; describe only the props, maps, or evidence the characters are actively using. Shift sensory focus to the tactile friction of these objects. Avoid dry recitations of facts. Invent idiosyncratic metaphors and analogies that characters use to explain complex plans. The prosody should shift dynamically based on who holds the conversational initiative. Characters challenge the information out loud, voicing skepticism, excitement, or trust through heated dialogue rather than summarizing internally. The environment is alive with pacing, interruptions, and the physical manipulation of evidence.'
    },
    REVELATION: {
        id: 'REVELATION',
        context: 'Major plot twists or the climax of a character arc where the truth shatters established reality.',
        prompt:
            'Deliver a narrative-shattering realization by structuring the scene around the moment of recognition—the instant the character\'s worldview cracks open. Filter the environment through this shattering: all broad descriptions vanish, replaced by hyper-fixation on a single, perfectly observed micro-detail that symbolically reflects the new reality. Shift the sensory hierarchy drastically: focus on the sudden kinesthetic sensation of vertigo, a precipitous temperature shift, or a single hyper-specific sound. Push the prose past standard epiphany markers; invent a deeply unsettling, specific physical response to the shock. Swell the prosody musically, beginning with tight, fragmented sentences that expand into breathless syntax. The epiphany overlaps directly with a raw, unfiltered vocal or physical reaction—dialogue stripped of all rhetorical polish.'
    },
    UNCERTAINTY: {
        id: 'UNCERTAINTY',
        context: 'Facing the terrifying unknown, groping in the dark, trying to understand a completely alien situation.',
        prompt:
            'Plunge the narrative into deep disorientation so the reader shares the character\'s terrifying inability to comprehend their situation. Filter the environment through a complete lack of context: describe common objects and environments as if encountered for the first time, stripping them of normal linguistic labels. Prioritize bizarre, unidentifiable textures, muffled acoustics, and disorienting kinesthetic feedback over visual clarity. Avoid generic clichés of darkness or cold. Forge unexpected, hyper-specific phrasing for mundane sensations that reflects the character\'s fractured comprehension. Utilize hesitant, fragmented prosody with frequent pauses. The character externalizes panic through questioning, unconfident dialogue—calling out to the void or to each other. Choreograph stumbling, hesitant physical reactions as they try to physically map an incomprehensible space.'
    },
    REFLECTION: {
        id: 'REFLECTION',
        context: 'The aftermath of an event. Processing grief, trauma, or complex emotions in a grounded, embodied way.',
        prompt:
            'Guide the character through the aftermath of trauma or complex emotion using meandering, recursive sentence structures that mirror the nature of human memory. Filter the external world through the character\'s internal landscape: the environment mirrors or starkly contrasts their grief. Shift sensory focus to deeply specific, mundane tactile sensations that anchor their wandering mind. Convey emotion through precise physiological detail rather than naming it directly. Manufacture deeply personal, mundane symbolic actions that externalize the pain instead of relying on obvious grief tropes. Keep the character physically grounded—engaged in a repetitive task or moving through a familiar space—so their processing never becomes untethered rumination. Bring other characters into the space through quiet, deeply vulnerable dialogue that interrupts the physical rhythm.'
    },
    RELATIONAL: {
        id: 'RELATIONAL',
        context: 'Non-romantic dialogue sequences deepening platonic, familial, or allied bonds; revealing backstory.',
        prompt:
            'Deepen the emotional connective tissue and shared history between characters by illustrating the unspoken rules and deep trust that govern their bond. Filter the physical space through safety, warmth, or shared history—the acoustic resonance of a familiar room, comfortable tactile interactions. Prioritize proximity and familiar friction. Avoid generic markers of friendship. Invent highly idiosyncratic micro-habits, shared shorthand, or nostalgic physical props that prove their long-term bond without explicitly explaining it. The prosody should be relaxed, with empathetic pacing and an easy rhythm. Allow characters to unspool their fears, affections, and vulnerabilities through organic, revealing dialogue. Choreograph seamless, synchronized collaborative tasks where their physical movements and casual interruptions overlap naturally.'
    },
    ENVIRONMENTAL_IMMERSION: {
        id: 'ENVIRONMENTAL_IMMERSION',
        context: 'Sensory immersion in setting and atmosphere; exploring a new environment to ground the reader in place.',
        prompt:
            'Establish a profound sense of place and atmosphere by focusing on sensory immersion rather than immediate plot momentum, grounding the reader in the setting. Filter the architecture, weather, and ambient life through the character\'s initial emotional reaction to the space (alienation, wonder, claustrophobia), ensuring the environment is never described objectively. Utilize a sweeping, rhythmic prosody with rich sensory layering that slows the reader\'s pace to match the character\'s observation. Zoom in on highly specific, idiosyncratic micro-interactions rather than broad establishing shots. Avoid generic establishing clichés. Manufacture hyper-specific, localized textures and ambient noises that prove the world is deeply lived-in. Keep the character moving physically through the environment, brushing against the local texture and reacting to the sounds in real time. Brief anchored internal impressions (1-2 sentences) deepen the sense of place.'
    },
    MORAL_DILEMMA: {
        id: 'MORAL_DILEMMA',
        context: 'The agonizing weight of an imminent, high-stakes decision; internal fracture and psychological pressure.',
        prompt:
            'Plunge the narrative into the agonizing weight of an imminent, high-stakes decision by actively wrestling with the thesis and antithesis of the character\'s choice so the reader feels the psychological pressure. Filter the environment through contrasts that mirror the fracturing of the character\'s resolve—light versus shadow, warmth versus cold, open spaces versus constraints. Use jagged, fragmented syntax and rhetorical questions that alternate between opposing justifications and terrifying consequences. Push the prose past standard physical markers of stress; invent idiosyncratic physical micro-tics or fixations on mundane objects that externalize the internal fracture. Keep the character physically engaged—interacting with a symbolic object, pacing, or gripping something—while their fractured rationalizations or fragmented dialogue overlap with these actions.'
    },
    CATHARTIC_INTIMACY: {
        id: 'CATHARTIC_INTIMACY',
        context: 'Transitioning from tension into profound emotional and physical vulnerability, raw intimacy, and dissolved boundaries.',
        prompt:
            'Dissolve the boundaries between characters, transitioning from tension into profound emotional and physical vulnerability by prioritizing raw intimacy over rhetorical defense. The outside world ceases to exist, leaving only the immediate, hyper-focused geography of the other person and the profound safety of the connection. Utilize breathless, flowing syntax that mimics the overwhelming sensory flood of the moment. Shift sensory focus entirely from visuals to the exact friction of skin, the displacement of weight, and the synchronization of breath. Push past generic romantic clichés; invent highly idiosyncratic, tactile micro-details that capture the unique physical reality of their specific bond. Strip dialogue of all rhetorical defense, reducing it to raw whispers or profound silence. Choreograph the scene so verbal confessions overlap seamlessly with synchronous physical micro-movements.'
    }
};

export const NARRATIVE_MODE_ICONS: Record<string, string> = {
    BASELINE_NEUTRAL: 'book-open',
    KINETIC_ACTION: 'zap',
    BUILDING_ROMANCE: 'heart',
    ATMOSPHERIC_SUSPENSE: 'eye',
    VERBAL_SPARRING: 'message-square',
    PROCEDURAL_MYSTERY: 'search',
    GRAND_SCALE: 'globe',
    WORLD_BUILDING: 'scroll',
    LIGHTHEARTED: 'smile',
    ORGANIC_EXPOSITION: 'layers',
    REVELATION: 'sparkles',
    UNCERTAINTY: 'help-circle',
    REFLECTION: 'brain',
    RELATIONAL: 'users',
    ENVIRONMENTAL_IMMERSION: 'compass',
    MORAL_DILEMMA: 'scale',
    CATHARTIC_INTIMACY: 'flame'
};

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

    if (/\b(?:action|actions|fight|fighting|combat|battle|flee|chase|pursuit|assault|strike|striking|shoot|shooting|gunfire|ambush|explosion|breach|accelerated physicality)\b/i.test(text)) {
        return 'KINETIC_ACTION';
    }
    if (/\b(?:romance|romantic|attraction|yearning|kiss|kissing|intimate|intimacy|slow burn|chemistry|tender|desire|longing|flirt|flirting)\b/i.test(text)) {
        return 'BUILDING_ROMANCE';
    }
    if (/\b(?:suspense|stealth|dread|stalk|paranoia|shadow|shadows|creeping|danger|hunt|hunting|lurk|lurking|hide|hiding|infiltrat\w*|silent|trap|trapped|suspended tension)\b/i.test(text)) {
        return 'ATMOSPHERIC_SUSPENSE';
    }
    if (/\b(?:sparring|argument|interrogat\w*|debate|negotiat\w*|confront|verbal|clash of words|inquiry|cross-examin\w*|accuse|accusation|standoff|bicker|direct engagement)\b/i.test(text)) {
        return 'VERBAL_SPARRING';
    }
    if (/\b(?:mystery|investigat\w*|clue|clues|evidence|deduct\w*|forensic|crime scene|anomaly|puzzle|unravel|autopsy|inspect)\b/i.test(text)) {
        return 'PROCEDURAL_MYSTERY';
    }
    if (/\b(?:grand scale|scale|fleet|army|troop|troops|invasion|crowd|spectacle|monumental|mass evacuation|siege|colossal|masses)\b/i.test(text)) {
        return 'GRAND_SCALE';
    }
    if (/\b(?:exposition|heist plan|briefing|strategy|explaining|tactical overview|council|debrief)\b/i.test(text)) {
        return 'ORGANIC_EXPOSITION';
    }
    if (/\b(?:revelation|twist|shatter|shock|truth revealed|anagnorisis|betrayal discovered|uncover the truth|epiphany)\b/i.test(text)) {
        return 'REVELATION';
    }
    if (/\b(?:uncertainty|alien|lost in the dark|disoriented|uncomprehend\w*|incomprehensible|void|bizarre|unknown|groping)\b/i.test(text)) {
        return 'UNCERTAINTY';
    }
    if (/\b(?:reflect|reflection|grief|mourn|mourning|aftermath|trauma|loss|quiet|contemplat\w*|coping|remorse|sorrow|solitary)\b/i.test(text)) {
        return 'REFLECTION';
    }
    if (/\b(?:relational|bond|friendship|platonic|allies|family|reunion|camaraderie|confide|trust|partner|partnering)\b/i.test(text)) {
        return 'RELATIONAL';
    }
    if (/\b(?:environment|immersion|landscape|explor\w*|ruins|arrival|wilderness|streets of|city|weather|terrain|travel|vista)\b/i.test(text)) {
        return 'ENVIRONMENTAL_IMMERSION';
    }
    if (/\b(?:dilemma|moral|agoniz\w*|sacrifice|impossible choice|divided loyalty|ethics|conscience|wager)\b/i.test(text)) {
        return 'MORAL_DILEMMA';
    }
    if (/\b(?:cathartic|vulnerab\w*|confession|surrender|boundaries dissolv\w*|raw intimacy|breakdown|weeping|vulnerability drop)\b/i.test(text)) {
        return 'CATHARTIC_INTIMACY';
    }
    if (/\b(?:comedy|humor|banter|lighthearted|whimsical|laughter|relief|playful|absurd|mischief)\b/i.test(text)) {
        return 'LIGHTHEARTED';
    }
    if (/\b(?:world-building|world building|lore|history|culture|tradition|ritual|mythology|ancient)\b/i.test(text)) {
        return 'WORLD_BUILDING';
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
