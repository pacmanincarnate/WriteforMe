/**
 * @module prompts/protocols
 * Shared XML surgical editing protocols, Drama-3 acoustic syntax contract card,
 * and prompt helper utilities.
 */

export const SURGICAL_EDIT_PROTOCOL = `Rules for all surgical edits:
1. Identify the MINIMUM set of changes needed. Return edits only; do NOT rewrite the entire text or XML payload.
2. Quote \`search\`/\`original\`/\`anchor\`/\`target\` character-for-character from <original_text>, including punctuation and quote marks; never paraphrase.
3. FULL-SENTENCE BOUNDARY MANDATE (FOR PROSE): When editing narrative prose, every \`search\`/\`replace\` block MUST encompass COMPLETE, WHOLE SENTENCES (from the opening capital letter or quotation mark to the terminal period, question mark, exclamation point, or closing quote). NEVER replace mid-sentence phrases, partial clauses, or sub-sentence fragments, as doing so severs sentence syntax, drops prepositions, and corrupts grammatical flow.
4. PARAGRAPH-LEVEL REWRITES: If multiple changes, dialogue adjustments, or continuity fixes occur within the same paragraph, replace the ENTIRE paragraph using <type>rewrite_passage</type> instead of multiple fragmented micro-edits.
5. Maintain strict tense consistency. Check the tense of the surrounding original text (e.g. present tense vs. past tense) and ensure all edit blocks match that exact tense.
6. Grammatical integrity: Ensure all replacement content is grammatically complete, properly capitalized, and maintains correct punctuation and sentence spacing.
7. If a field value must itself contain < or &, wrap that value in CDATA.

FORMATTING DIRECTIVE: Return ONLY XML enclosed in <edits>...</edits>. Do not use YAML, markdown blocks, commentary, or a full-prose response.
Output Schema (four available edit types; emit only the edits needed):
<edits>
  <edit>
    <type>search_replace</type>
    <search>exact original complete sentence</search>
    <replace>corrected complete sentence</replace>
  </edit>
  <edit>
    <type>rewrite_passage</type>
    <original>entire paragraph or block containing the issue</original>
    <rewritten>new improved paragraph or block</rewritten>
  </edit>
  <edit>
    <type>insert_after</type>
    <anchor>sentence, phrase, or element after which to insert</anchor>
    <content>new text, dialogue, sensory details, or block to insert</content>
  </edit>
  <edit>
    <type>delete_passage</type>
    <target>exact element, complete sentence, or passage to remove</target>
  </edit>
</edits>`;

export const AUDIO_DRAMA_SYNTAX_CONTRACT_CARD = `<audio_drama_syntax_contract>
ACOUSTIC SCRIPT CADENCE & FISH AUDIO DRAMA-3 DIRECTING CONTRACT:
1. TURN STRUCTURE & SPEAKER ALTERNATION: Start every turn on its own line with Title Case "Narrator: " or "CharacterName: ", separated by a blank line between turns. Keep all contiguous sentences from the same speaker unified inside one single turn before switching to the next speaker; a substantive character turn may run 2–4+ spoken breath-unit sentences (with mid-line [pivots] and [pause] beats) when arguing, explaining, deflecting, or confessing.
2. UNIFIED NARRATOR STAGING & DIALOGUE PRIORITY: Fulfill the scene's full TARGET LENGTH by carrying 75%–90% of spoken words through sustained multi-turn character dialogue (typically 40–65+ character turns across the scene, conveying reactions, intent, and physical awareness directly through speech and Drama-3 vocal cues). Reserve "Narrator: " for essential scene transitions and major physical staging, combining all contiguous narration sentences for a beat into ONE single cohesive "Narrator: " paragraph of clean declarative prose.
3. LAYER 1 — [LINE DIRECTION & MID-LINE PIVOTS]: Direct the voice actor with plain-English cues right before the words they shape. Describe vocal physics + hidden subtext (e.g., [choked up, crying quietly], [cheerful, but hiding that she is worried], [barely holding it together, forcing a smile]) and listener context (e.g., [quietly, so the kids next door do not hear]) instead of flat 1-word mood labels like [sad] or [angry]. Because a cue governs everything after it until the next [...], insert mid-line [pivots] wherever intent shifts (e.g., [bright, showing off] And this is the new kitchen... [stopping short, alarmed] Wait, is that water?). Keep [...] strictly acoustic — zero physical blocking or props inside [...].
4. LAYER 2 — 7 PAIRED XML WORD-LEVEL TAGS: When only 1–6 specific words bend delivery inside a steady mood, wrap them in balanced pairs strictly from these 7 tags:
   <whisper>...</whisper> (secrets/threats), <emphasis>...</emphasis> (core hinge word), <stress>...</stress> (sharp accusation/contrast), <soft>...</soft> (gentle aside/reassurance), <forceful>...</forceful> (command/outburst), <slow>...</slow> (big reveal/deliberate moment), <fast>...</fast> (rushed aside/nervous ramble).
   Close every opener on the same turn; vary tags naturally across the scene; never invent custom XML tags.
5. LAYER 3 — CAUSAL SOUNDS & PAUSES: Place supported events ([sigh], [laugh], [small laugh], [breath], [shaky breath]) right after their emotional trigger ("That's the third time. [sigh] Fine."), and use [pause] or [short pause] for silence — or [pause] [slow, deadly serious] to pivot pace out of silence. Never use (...) or *italics*/**bold** for delivery cues.
6. MODEL EXCHANGE:
   Narrator: Priya stopped beside the oak desk and slid the open ledger toward Tomas as rain hissed against the dockyard glass.

   Priya: [quietly, so the clerks outside do not hear] Look at line <stress>four</stress>. [short pause] [voice tightening, refusing to blink] I thought you cleared the vault— <whisper>why is Mara's name scratched out?</whisper>

   Tomas: [cheerful, but hiding panic underneath] Wait, let me— [shaky breath] Look, it's just a clerk typo, okay, we can flag it tomorrow— [pause] [low, tired defeat] <soft>I forged the date on Tuesday.</soft>

   Priya: [low, measured dread] Tuesday. Right before the harbor seals locked. [breath] [urgent, pressing in] Who else has a key to that drawer, Tomas?

   Tomas: [hollow, rushing slightly] <fast>Nobody on the night shift, I swear—</fast> [sigh] only Varga, and he left for the ferry twenty minutes ago.
</audio_drama_syntax_contract>`;

export const AUDIO_DRAMA_SURGICAL_MANDATE = `
AUDIO DRAMA SURGICAL EDITING MANDATE (FISH AUDIO DRAMA-3 + BREEZE 2):
This text is a multi-voice Audio Drama script using native Fish Audio Drama-3 syntax. Preserve and enforce this exact turn formatting in every replacement or insertion:
1. TURN PREFIX, COHESIVE BLOCKS & SPACING: Begin every turn on its own line with Title Case "Narrator: " or "CharacterName: ", separated by a blank line between turns. Keep all contiguous sentences by the same speaker unified inside one cohesive turn—whenever adding or splitting Narrator staging immediately adjacent to an existing "Narrator: " turn, merge the staging sentences into that single unified "Narrator: " turn.
2. 2-STEP NARRATOR SPLIT: When a character line places physical action, posture, props, or facial staging inside [...] or (...), use <type>rewrite_passage</type> on that full line (and any immediately preceding "Narrator: " line if one already sits right above it) so the physical staging lands inside ONE unified "Narrator: " turn followed by the character's spoken turn:
   - Turn 1: Narrator: <Unified declarative sentences speaking the physical action aloud.>
   - Turn 2: CharacterName: [<purely vocal/emotional actor cue>] <Spoken dialogue.>
3. FREE-FORM [ACTOR & SOUND CUES]: Write character vocal directions and paralinguistic cues in natural-language square brackets [...] (e.g., [cold, flat], [through gritted teeth, keeping his voice down], [shaky breath], [small laugh], [pause]). Convert any legacy parenthetical tags like (sighs) or (softly) into square brackets [sighs] / [softly].
4. 7 PAIRED XML PROSODY TAGS ONLY: For mid-line vocal shaping, use ONLY balanced pairs from <whisper>...</whisper>, <emphasis>...</emphasis>, <stress>...</stress>, <soft>...</soft>, <fast>...</fast>, <slow>...</slow>, <forceful>...</forceful>. Never use unsupported XML tags or markdown emphasis.

Example Audio Drama Surgical Repair:
<edit>
  <type>rewrite_passage</type>
  <original>GARRETT: [Leaning forward, winking cheerfully] (chuckles) Come on, *sign* it.</original>
  <rewritten>Narrator: Garrett leaned across the desk and offered a conspiratorial wink.

Garrett: [small laugh] [warm, practiced charm, close to the mic] Come on, <soft><stress>sign</stress> it.</soft></rewritten>
</edit>`;

export function getSurgicalPromptForMode(
    basePrompt: string | null | undefined,
    isAudioDrama?: boolean
): string {
    if (!basePrompt) return basePrompt || '';
    if (!isAudioDrama) return basePrompt;
    return `${basePrompt}\n${AUDIO_DRAMA_SURGICAL_MANDATE}`;
}

export const STRUCTURAL_EDIT_PROTOCOL = `Rules for structural XML edits:
1. Identify the MINIMUM set of nodes (e.g. Acts, Sequences, Scenes, Beats) that must be changed to fix the issues. Return edits only; do NOT rewrite the entire XML payload.
2. For each node that needs to be repaired, replaced, inserted, deleted, or truncated, you MUST output a <structural_edit> block.
3. Do NOT use search_replace text patching, as it breaks easily on XML. Instead, target the specific node using its XML tag and its unique identifier tag (e.g. <number> or <beat_id>).
4. CUTTING BLOAT & OVEREXTENSION: If reviewer feedback indicates that a scene loops, repeats earlier beats, or overshoots its ending by running past the exit conditions, use <action>truncate_after</action>. This keeps the target node and cleanly strips away ALL subsequent nodes of that tag type in a single operation, setting <has_more>false</has_more>.
5. If a field value must itself contain < or &, wrap that value in CDATA.

FORMATTING DIRECTIVE: Return ONLY XML enclosed in <edits>...</edits>. Do not use YAML, markdown blocks, commentary, or a full-prose response.
Output Schema (four available edit types; emit only the edits needed):
<edits>
  <structural_edit>
    <action>replace</action>
    <target_tag>scene</target_tag> <!-- the XML tag of the node to replace, e.g. act, sequence, scene, or beat -->
    <target_identifier_tag>number</target_identifier_tag> <!-- the tag that holds its ID, e.g. number or beat_id -->
    <target_identifier_value>1.2</target_identifier_value> <!-- the exact value of the ID -->
    <new_content>
      <scene>
        <number>1.2</number>
        <!-- the fully corrected node -->
      </scene>
    </new_content>
  </structural_edit>
  <structural_edit>
    <action>insert_after</action>
    <target_tag>beat</target_tag> <!-- the XML tag of the node to insert AFTER -->
    <target_identifier_tag>beat_id</target_identifier_tag>
    <target_identifier_value>1.2.3</target_identifier_value>
    <new_content>
      <beat>
         <!-- the fully generated new node -->
      </beat>
    </new_content>
  </structural_edit>
  <structural_edit>
    <action>delete</action>
    <target_tag>sequence</target_tag>
    <target_identifier_tag>number</target_identifier_tag>
    <target_identifier_value>2</target_identifier_value>
  </structural_edit>
  <structural_edit>
    <action>truncate_after</action>
    <target_tag>beat</target_tag> <!-- Target tag to truncate, e.g. beat -->
    <target_identifier_tag>beat_id</target_identifier_tag> <!-- ID tag of the last valid node to KEEP -->
    <target_identifier_value>1.2.14</target_identifier_value> <!-- Keeps this node and discards all subsequent beats -->
  </structural_edit>
</edits>`;

/**
 * Removes narrative-lens schema bullets from writing/review system prompts when narrative lenses are disabled.
 */
export function stripNarrativeLensSchemaLine(promptText: string): string;
export function stripNarrativeLensSchemaLine<T>(promptText: T): T;
export function stripNarrativeLensSchemaLine(promptText: unknown): unknown {
    return typeof promptText === 'string'
        ? promptText.replace(
              /\n\s*-\s*<(?:active_scene_narrative_style|writing_lens)(?:\s*\/\s*<writing_lens>)?>:.*?\n(?=\s*-|\n|$)/gs,
              '\n'
          )
        : promptText;
}
