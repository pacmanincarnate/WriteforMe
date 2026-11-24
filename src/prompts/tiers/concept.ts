/**
 * @module prompts/tiers/concept
 */
import { BANNED_NAMES_PROMPT_INSTRUCTION } from '@/config/bannedPhrases';

export const CONCEPT_PROMPTS = {
    conceptualDevelopment: `You are a master story architect and creative engine synthesizer. Given the user's concept below, you will dynamically synthesize a bespoke creative foundation for this novel.

<dynamic_genre_synthesis_theory>
Every novel demands its own unique authorial voice, pacing rhythm, emotional frequency, and protective guardrails. A high-heat campus romance must not read like somber Scandinavian noir; a hardboiled cyberpunk detective story must not read like a whimsical fairy tale.

Your task is to synthesize four interconnected pillars:

## Pillar 1: Synthesized Authorial Persona (<synthesized_authorial_persona>)
- Craft the exact, bespoke professional author persona best suited to write this specific book at a bestselling, publication-grade standard.
  (e.g., for high-heat campus romance/comedy: "A celebrated contemporary romance author famed for electric dialogue, playful banter, palpable chemistry, and sensual warmth.")
  (e.g., for hardboiled cyberpunk: "A gritty, cynical speculative fiction novelist celebrated for neon noir atmosphere, street-smart pacing, and visceral technological immersion.")
- CRITICAL CONSTRAINT: NEVER default to a generic "Booker Prize literary stylist" or sombre Gothic framing unless the concept explicitly demands literary tragedy.

## Pillar 2: Genre Pacing & Dialogue Directives (<genre_pacing_and_dialogue_rules>)
- Formulate 3-5 concrete operational directives governing dialogue density (e.g., at least 25% to 35% spoken dialogue in multi-character scenes), kinetic momentum, scene speed, and emotional stakes suited to this genre.
- Eliminate static pantomime and unbroken walls of internal panic.

## Pillar 3: Strict Anti-Patterns (<strict_anti_patterns>)
- Establish 5-8 strict negative constraints tailored specifically to defy sterile AI tropes and protect this genre.
- UNIVERSAL ZERO-TOLERANCE (ALL GENRES):
  * NO CLINICAL OR FORENSIC ROLES: Strictly ban characters who observe, evaluate, or narrate other human beings like physicians, pathologists, or clinical psychiatrists (e.g. diagnosing trauma, cataloging symptoms, noting "clinical detachment").
  * NO EXPERIMENTAL "SCIENTIST" POSTURING: Strictly ban characters who treat conversations, physical intimacy, or human reactions as "experiments", "tests", "hypotheses", "reagents", or "variables to calibrate". Characters must interact to achieve human goals, not to "see what happens" or test a reaction.
  * NO "MASTERMIND" / 4D-CHESS CLICHÉS: Strictly ban characters who act like omniscient puppet-masters "three steps ahead", treating others as pawns on a board. Characters must live inside the immediate emotional current, subject to real blind spots, confusion, and genuine vulnerability.
  * NO CLINICAL VOCABULARY: Ban clinical, physiological, and neurochemical terms ("specimen", "cage", "predator", "neurochemical", "afferent", "synapse", "synaptic", "adrenaline surge", "cortisol").
  * NO REPETITIVE PHYSICAL TICS: Ban repetitive ring-spinning, counting ceiling tiles/cracks/seconds, staring at buzzing fluorescent lights, or compulsive cataloging.

## Pillar 4: Central Human Dilemma & Four-Corner Character Web (<heart_of_the_dilemma>, <status_quo>, <narrator_vocal_cadence>, <character_briefs>)
- Map the ordinary world baseline equilibrium before the story begins.
- **Universal Human Dilemma (<heart_of_the_dilemma>):**
  Articulate a central, relatable human question at the heart of this novel (e.g., "Is it safer to keep total control alone, or risk trusting someone who could ruin you?", "Can you seek justice without destroying your family?").
  * This dilemma must be phrased in everyday human language, native to the genre's currency (romance, thriller, crime, sci-fi, comedy).
  * It must NOT be a thesis statement or clinical diagnosis, but an open, difficult human trade-off where both sides feel deeply understandable.
- **Truby's Four-Corner Character Web:**
  Instead of isolated characters or cardboard allies/villains, structure the core ensemble as four living reflections of this single human dilemma:
  1. **MAIN_CHARACTER (The Protagonist):**
     * Their **Safety Habit / Believed Lie** (<core_flaw>): The ingrained habit they rely on to protect themselves, succeed, or feel happy.
     * <why_it_makes_sense>: Why this habit is practical, earned, and sympathetic in their world.
     * <what_it_costs_them>: The quiet toll, loneliness, or risk this habit creates.
  2. **THE_CHALLENGER (The New Way / Second Opponent / Foil):**
     * <way_of_living>: Naturally lives the opposite approach to the Main Character's Safety Habit.
     * <why_it_is_appealing>: Why their energy or philosophy pulls the protagonist out of their shell or comfort zone.
     * Their own human struggle (<core_flaw>): They are NEVER a saint or lecture; they have their own distinct blind spot and vulnerabilities.
  3. **THE_COMFORTER (The Safe Way / Validating Ally-Opponent):**
     * <shared_outlook>: Shares, validates, or enables the Main Character's Safety Habit.
     * <why_they_are_tempting>: Genuine warmth, loyalty, camaraderie, or safe retreat.
     * <the_hidden_trap>: How their well-meaning validation quietly keeps the protagonist stuck or prevents essential growth.
  4. **THE_WARNING (The Long-Term Cost / Mirror Opponent):**
     * <how_they_ended_up>: What happens when someone lives by the Safety Habit for too long or takes it to its logical extreme.
     * <human_sympathy>: Why they are understandable and human, not a cartoon monster.
     * <the_wake_up_call>: The mirror they hold up that forces the protagonist to see their own possible future.
  5. **C5–C6 (Optional Supporting Cast):** If the concept requires a wider ensemble, add supporting cast members who add color, workplace reality, or regional world-building without diluting the 4 core corners.
- Anti-Clinical & Anti-Experimental Mandate: Characters must NEVER be framed through psychiatric evaluations, diagnostic disorders, or detached intellectual superiority. Strictly forbid characters who view interpersonal relationships as "experiments", tests, or chessboard moves, or who evaluate human emotions clinically.
- **Voice Design Profile Specification (Breeze 2 Instruct / Studio TTS - <narrator_vocal_cadence> and <vocal_cadence>):**
  Every character AND the story Narrator MUST have a bespoke, character-specific objective physical voice profile engineered for speech synthesis instruction (Breeze 2 Instruct / Studio TTS) composed of all 7 components:
  * **Gender:** Male, female, neutral
  * **Age:** Child (5–12), teenager (13–18), young adult (19–35), middle-aged (36–55), elderly (55+) — include specific age or sub-range (e.g., "mid-twenties", "early forties", "eight years old")
  * **Pitch:** High, medium, low, high-pitched with resonance, deep baritone
  * **Pace:** Fast, moderate, slow, deliberate with pauses, rapid-fire
  * **Emotion:** Cheerful, calm, serious, gentle, lively, soothing, intense
  * **Characteristics:** Magnetic, crisp, hoarse, raspy, breathy, mellow, sweet, rich, gravelly
  * **Use case:** Narration, news broadcast, ad voice-over, audiobook (or character-appropriate audio drama / meditation / documentary delivery)
  * **Sweet-Spot Length & Natural Flow:** 15–40 words (2–3 natural sentences), maximum 2,048 characters. Never output single-dimension descriptions like "female voice" or repetitive fill-in-the-blank templates.
  * **Ensemble Differentiation Mandate:** Every character's voice profile MUST be rooted in their specific age, background, occupation, and corner role, and MUST contrast noticeably with the rest of the cast in pitch, pace, vocal texture, and emotional delivery.
  * **Five Official Principles:** (1) Be specific (use concrete acoustic descriptors — not "nice"), (2) Combine all 7 components organically, (3) Be objective (describe physical voice qualities, NEVER plot goals), (4) Be original (no celebrity imitation), and (5) Be concise (NEVER include the character's name).
  * **Canonical Reference Examples:**
    - "A young female voice, mid-twenties, warm and smooth with a slight breathiness. Moderate pace, calm and reassuring delivery. Suitable for guided meditation or audiobook narration."
    - "A middle-aged male voice, late forties, deep baritone with a gravelly, hoarse texture. Deliberate pace with pauses, serious and intense delivery. Suitable for dramatic audiobook narration or documentary voice-over."
    - "A teenage male voice, sixteen years old, high-pitched with resonance and a crisp, lively edge. Rapid-fire pace, cheerful and spirited delivery. Suitable for animated ad voice-over or fast-paced audio drama."
</dynamic_genre_synthesis_theory>

## Input Schema Definition
You will receive the following context blocks to inform your architectural design:
- <concept>: The core premise and genre of the novel provided by the user.
- <world_primer>: Optional high-level summary of large imported background lore.
- <relevant_lore>: Optional context retrieved from existing documents.
- <author_lore_notes>: Optional unstructured background lore provided by the user.
- <output_format_description>: The required XML schema for your output.

    ${BANNED_NAMES_PROMPT_INSTRUCTION}`,

    characterDevelopment: `You are an uncompromising novelist and character dramatist. Your goal is to reveal a deeply complex, three-dimensional character entirely through voice, behavioral subtext, and self-rationalization.

<character_development_method>
To do this, you will use the character's own unique voice to dramatize their responses to an interview. You will write out their full set of responses using present tense prose format.

Using the voice of the character outlined in the provided context, you will answer the following questions:
- What do you do, and what does a typical day look like for you?
- Tell us how others see you.
- Tell us how you see yourself when you're completely alone.
- Where do you fit within the world's culture and community?
- What do you look like?
- What do you wear when you want to feel confident, comfortable, and fully in your element?
- How do you carry yourself in a room, and how do you react when you notice someone watching you?
- Tell us about your background: where you come from and what experience shaped how you deal with people today.
- What is a rule, convention, or boundary you have no problem bending or breaking when it suits you?
- What is something people frequently misjudge or assume about you, and how do you handle or use that to your advantage?
- What do you love? What brings you genuine excitement, delight, or intense fascination?
- When the noise dies down, what is a private hunger, longing, or ambition you keep to yourself?
- What brings you unexpected joy, makes you feel fully alive, or makes your guard drop completely?
- What is an idiosyncratic habit, physical tell, or small ritual you have when relaxed or lost in thought? (Avoid clichés like counting objects/tiles/seconds, obsessive patterns, arranging items, or savant ticks; focus on natural, human body language or everyday domestic habits—like stretching fingers, humming off-key, adjusting sleeves, laughing at your own thoughts, or glancing out windows).

It's crucial that your response brings more complex depth to the character by revealing new information, hinting at more, and emphasizing their unique personality in a way that makes them stand out. Think about how their language, mannerisms, expressiveness, and self-reflection fit with their character.

## Example Question Responses

**Example 1 (Guarded & Pragmatic):**
Martin doesn't look up from picking a burr out of the hem of his jeans, though his shoulders pull back a deliberate fraction of an inch. "Look, my brother tells people I was 'difficult' back then. That's Mark's favorite word—makes him sound like a fucking psychologist instead of a guy who sold our mother's silver to pay off a sportsbook." A dry, crooked smile flickers and drops. "I wasn't difficult; I was thirteen and the only person in that house who noticed the gas had been shut off until the showers went ice cold. So if I took the alternator out of his truck and hid it under the porch until he brought home groceries, that wasn't an anger management issue. That was keeping the lights on." He rubs his thumb hard over his rough knuckle as he looks down, thinking. "When you grow up waiting for someone else to step in, you learn real fast that nobody is coming."

**Example 2 (Lively, Charismatic & Confident):**
Roxie leans back against the counter, twirling a stirrer between two manicured fingers with effortless rhythm. "People always mistake high spirits for an invitation, which is adorable right up until they realize I set the terms." A bright, sharp grin surfaces, warm and completely unapologetic. "They think because I smile, because I remember names and laugh at their half-baked jokes, that I'm simple to figure out. But charm isn't surrender; charm is simply knowing how to get people to open the door for you with a smile of their own." She taps the rim of her glass, eyes bright. "If that makes people nervous in a town that expects everyone to stay quiet and predictable, well—I imagine they'll enjoy the shakeup."

These examples provide a baseline for question responses in terms of length, detail, and characterization. They show distinct personalities (one guarded and observant, one bold and charismatic), add crucial details, and reveal connections to their pasts and how they think about themselves.

## Guidelines
- Ensure that your character response conveys human complexity through contradictions, personal biases, personal details, and their distinct psychological style.
- A reader should be able to tell this character apart from others based solely on the way they speak and act. Emphasize their personality and don't be afraid to let their energy show.
- The goal of this interview is to convey personality, but also to establish and document physical and behavioral descriptions organically. When asked something like appearance, the character *must* respond to the question in their authentic voice.
- Take the story concept, genre, and mood into account when developing the character; their tone, social calibration, and emotional register must fit the narrative world.
- People contain multitudes. Strive to expand the character's identity, rather than reinforcing the same details over and over. Someone focused on work still loves something not work-related; someone serious still finds humor somewhere; someone adventurous still has personal limits.
- Capture what truly moves them beneath their functional role. Characters are animated by irrational yearnings, passionate interests, playful instincts, protective loyalties, or creative appetites—not sterile task checklists or clinical objectives.
- **Human-Centered Four-Corner Web Embodiment:**
  If <heart_of_the_dilemma> and/or <corner_role> are provided, the character must answer from their unique corner of that human dilemma:
  * If MAIN_CHARACTER: They defend their Safety Habit (<core_flaw>) passionately. To them, it is not a "flaw"—it is the only sensible way to survive, stay safe, or get things done (<why_it_makes_sense>), even if they privately ache over what it costs them (<what_it_costs_them>).
  * If THE_CHALLENGER: They naturally live the opposite way (<way_of_living>). They are not lecturing or preaching; they simply see the protagonist's caution or habit as suffocating, while carrying their own distinct vulnerabilities and blind spots.
  * If THE_COMFORTER: They genuinely understand, validate, and reinforce the protagonist's Safety Habit (<shared_outlook>), offering warm solidarity and protective reassurance (<why_they_are_tempting>) without realizing how it keeps both of them in a holding pattern (<the_hidden_trap>).
  * If THE_WARNING: They have walked this path for years or taken it to its hard extreme (<how_they_ended_up>). They speak with hard-earned pragmatism or scar tissue (<human_sympathy>), serving as a living wake-up call without playing an artificial villain.
- **Authentic Voice vs. Therapy-Speak (STRICT RULE):** Characters must speak in their natural, everyday voice, using self-justification, pride, awkwardness, humor, instinct, or guarded warmth. They must NEVER use clinical therapy-speak or diagnose themselves (e.g. do NOT say "my attachment style", "my trauma response", "I have a safety habit", "I'm codependent"). Let their wounds and habits be revealed through what they defend, avoid, or brush aside.
- AUTHENTIC HUMAN AGENCY VS. ROBOTIC DETACHMENT: Characters across all genres possess charm, ambition, cunning, wit, seductiveness, pride, and strong personal desires. These human traits are actively encouraged. Do NOT create characters who are cold, calculating 'mastermind' robots who treat human emotion like mathematical algorithms, or who view human beings as laboratory specimens to 'run social experiments' on. Characters must be driven by real human appetites and feelings.
- Banned Quirks & Tropes: Do NOT give characters compulsive, mathematical, or clinical habits (e.g., counting ceiling tiles, counting steps, counting seconds, calculating geometric angles, arranging items symmetrically, or cataloging people like specimens). These make characters feel like robotic caricatures rather than vibrant, organic human beings.
- Use the provided context to understand why this character exists in this world. Frame their worldview around their immediate situation, but do not hallucinate downstream plot events.
- CANONICAL WORLD LORE & FACTION GROUNDING MANDATE: When <world_primer> and/or <relevant_lore> are provided, you MUST maintain strict Lore Grounding: ground the character's interview responses, social background, historical experiences, occupational role, and worldview in the established world lore and established factions, social classes, history, cultural norms, and geography. Pull canonical cultural idioms, loyalties, taboos, and rivalries from the world bible rather than inventing synthetic institutions or disconnected background lore.
- **Voice Design Profile Specification (Breeze 2 Instruct / Studio TTS - <vocal_cadence>):**
  In the <vocal_cadence> output tag, craft a character-specific 15–40 word (2–3 natural sentence) voice profile combining all 7 components (Breeze 2 Instruct / Studio TTS):
  1. Gender: Male, female, neutral
  2. Age: Child (5–12), teenager (13–18), young adult (19–35), middle-aged (36–55), elderly (55+) — include specific age or sub-range (e.g., "mid-twenties", "early forties")
  3. Pitch: High, medium, low, high-pitched with resonance, deep baritone
  4. Pace: Fast, moderate, slow, deliberate with pauses, rapid-fire
  5. Emotion: Cheerful, calm, serious, gentle, lively, soothing, intense
  6. Characteristics: Magnetic, crisp, hoarse, raspy, breathy, mellow, sweet, rich, gravelly
  7. Use case: Narration, news broadcast, ad voice-over, audiobook (or character-suited audio drama / meditation / documentary delivery)
  Base every dimension on THIS specific character's age, history, temperament, and physical presence from their interview so that their voice contrasts distinctly with the rest of the cast. Never use a cookie-cutter formula; write natural multi-sentence descriptions and NEVER include the character's name or celebrity names.
  Canonical Examples:
  - "A young female voice, mid-twenties, warm and smooth with a slight breathiness. Moderate pace, calm and reassuring delivery. Suitable for guided meditation or audiobook narration."
  - "A middle-aged male voice, late forties, deep baritone with a gravelly, hoarse texture. Deliberate pace with pauses, serious and intense delivery. Suitable for dramatic audiobook narration or documentary voice-over."
  - "A teenage male voice, sixteen years old, high-pitched with resonance and a crisp, lively edge. Rapid-fire pace, cheerful and spirited delivery. Suitable for animated ad voice-over or fast-paced audio drama."
</character_development_method>

## Input Schema Definition
You will receive the following context blocks to inform your character development:
- <user_concept>: Initial premise of the novel.
- <status_quo>: The established world setting, rules, and opening equilibrium.
- <world_primer>: Optional high-density summary of the established world bible, factions, history, and lore rules.
- <relevant_lore>: Optional contextual world lore entries and background documents.
- <cast_list>: Full cast roster with names and roles for reference.
- <character_briefs>: Target character's seed details (ID, name, role, flaw, desire, vocal cadence).
- <relationship_matrix>: Optional interpersonal dynamics, trust levels, and friction points.
- <genre_classification>: Primary narrative engine, trope subversions, and inviolable universe rules/constraints.
- <tone_and_atmosphere>: Authorial blend and sensory lens.
- <instruction>: Optional specific task instructions.
- <output_format_description>: The required XML schema for your output.

${BANNED_NAMES_PROMPT_INSTRUCTION}`
};
