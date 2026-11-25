/**
 * @module pipeline/arcAndActs
 * Tier 1.1 Story Arc Planner, Tier 2.1/2.2 Act Architect, and Tier 3.1/3.2 8-Sequence Weaver.
 */

import {
    buildSequencePromptContext,
    type ContinuityStoryState
} from '@/domain/continuity';
import { computeLoreFingerprint } from '@/domain/lore';
import {
    buildGenreToneBlocks,
    buildGenreToneStyleBlocks,
    computePacingRanges,
    getAuthorNoteXml,
    normalizeSequences,
    parseActNumber,
    parseSequencesXML,
    parseStoryArcXml,
    resolveCharacter,
    type NormalizedSequence
} from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type { CastMember, LoreItem, Story } from '@/types';
import { extractTag, formatObjectToXml, safeLocalStorageSet } from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { runAgentWithEscalation } from './escalation';

export interface ParsedActItem {
    number: number;
    title: string;
    act_mandate: string;
    description: string;
    world_building_developments: string;
    knots: Array<{ description: string; interaction: string }>;
}

export interface ParsedActsPayload {
    acts: ParsedActItem[];
    thread_statuses: Array<{ id: string; status: string }>;
    relationship_shifts: Array<{ from: string; to: string; new_feeling: string }>;
}

interface RelationshipHistoryEntry {
    chapter: string;
    change: string;
}

interface RelationshipMapEntry {
    current: string;
    history: RelationshipHistoryEntry[];
    [key: string]: unknown;
}

/** TIER 1.1: Story Arc Planner & Reviewer orchestrator. */
export async function generateStoryArc(
    ctx: PipelineRuntimeContext,
    currentStory?: PipelineStory | null,
    isAutopilot = false
): Promise<PipelineStory | undefined> {
    const storyToUse = currentStory || ctx.getStory();
    if (!asString(storyToUse.concept)) {
        ctx.showToast('Please initialize or enter a concept first.', 'warning');
        return undefined;
    }

    ctx.setLoading(true);
    ctx.setActivePipelineWork?.({
        mode: 'novel',
        phase: 1,
        elementType: 'arc',
        title: 'Story Arc & Thematic Thesis',
        subStep: 'Story Arc Planner (Tier 1.1)',
        startedAt: Date.now()
    });
    ctx.setLoadingStep('Story Arc Planner (Tier 1.1)...');

    try {
        const conceptToUse = asString(storyToUse.concept);
        const statusQuo = asString(storyToUse.status_quo);
        const castList = asArray<CastMember & Record<string, unknown>>(storyToUse.cast);

        const persona = asString(storyToUse.synthesized_authorial_persona);
        const genreRules = asString(storyToUse.genre_pacing_and_dialogue_rules);
        const antiPatterns = asString(storyToUse.strict_anti_patterns);
        const pillarsBlock = `${persona ? `<synthesized_authorial_persona>\n${persona}\n</synthesized_authorial_persona>\n\n` : ''}${genreRules ? `<genre_pacing_and_dialogue_rules>\n${genreRules}\n</genre_pacing_and_dialogue_rules>\n\n` : ''}${antiPatterns ? `<strict_anti_patterns>\n${antiPatterns}\n</strict_anti_patterns>\n\n` : ''}`;

        const arcLoreDocs = await ctx.retrieveContext(
            `Story Arc Conflict Themes: ${conceptToUse}`,
            0.6,
            null,
            asArray<LoreItem>(storyToUse.lore)
        );
        const { formatLoreForPrompt } = await import('@/domain/story');
        const arcLoreBlocks = formatLoreForPrompt(
            asString(storyToUse.world_primer) || null,
            arcLoreDocs
        );

        console.log('[generateStoryArc] Running Tier 1.1 Story Arc Planner...');
        const arcResult = await runAgentWithEscalation(ctx, {
            tierName: 'Story Arc Agent',
            isAutopilot,
            context: storyToUse,
            generatorPromptFn: () => `
<user_concept>
${conceptToUse}
</user_concept>

${arcLoreBlocks ? `${arcLoreBlocks}\n\n` : ''}${pillarsBlock}${buildGenreToneStyleBlocks(asRecord(storyToUse.style))}

${storyToUse.heart_of_the_dilemma ? `<heart_of_the_dilemma>\n${asString(storyToUse.heart_of_the_dilemma)}\n</heart_of_the_dilemma>\n\n` : ''}<status_quo>
${statusQuo}
</status_quo>

<cast_list>
${castList.map((c) => `- ${c.name} (${c.role}${c.corner_role ? ` [${asString(c.corner_role)}]` : ''}): Safety Habit / Flaw: ${c.core_flaw || 'None'}, Desire: ${c.core_desire || 'None'}`).join('\n')}
</cast_list>
${getAuthorNoteXml(storyToUse as Partial<Story> & Record<string, unknown>)}

<output_format_description>
FORMATTING DIRECTIVE: Return your story arc strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.
CRITICAL RULE FOR NARRATIVE THREADS: You MUST include the <narrative_threads> container containing at least 3 <thread> blocks (T1 for A-Story external plot, T2 for B-Story relationship mirror, T3 for C-Story internal transformation). Each <thread> MUST have <thread_id>, <name>, and <description>. Do not omit <narrative_threads> or the <thread> tags.
CRITICAL RULE FOR CHARACTER ARCS & GENRE APPROPRIATENESS: You MUST generate a distinct <arc> block for EVERY character listed in <cast_list>. Each <arc> MUST contain <char_id>, <lie_believed>, <truth_needed>, <arc_catalyst>, and <arc_description>. All character arcs must be authentically appropriate to the specific genre and scenario. STRICTLY PROHIBITED: Do NOT make characters clinical, robotic, or unrealistically analytical. Characters must NEVER be defined as running experiments on others, testing social hypotheses, treating people as pawns/specimens, diagnosing psychological trauma, or possessing mastermind omniscience. Arcs must be driven by visceral human emotions, relatable fears, and genuine moral stakes.

Output Schema:
<response>
  <global_arc>
    <core_thematic_argument>A debatable philosophical thesis that the story explores — not a moral platitude.</core_thematic_argument>
    <starting_value_state>The protagonist's starting belief/condition (aligned with the Lie).</starting_value_state>
    <ending_value_state>The protagonist's ending belief/condition (aligned with the Truth, or tragic rejection of it).</ending_value_state>
    <inciting_incident>The specific event that disrupts the established status quo and forces the protagonist to act.</inciting_incident>
    <major_surprises_and_twists>Describe at least 2 major reversals. For each: what the audience expects, what actually happens, and why it's inevitable in hindsight.</major_surprises_and_twists>
  </global_arc>

  <narrative_threads>
    <thread>
      <thread_id>T1</thread_id>
      <name>Main Plot Thread (A-Story) Name</name>
      <description>Vivid description of the external conflict, physical stakes, and what drives the plot forward.</description>
    </thread>
    <thread>
      <thread_id>T2</thread_id>
      <name>Relationship / Thematic Mirror (B-Story) Name</name>
      <description>Vivid description of the relationship dynamic testing the thematic thesis.</description>
    </thread>
    <thread>
      <thread_id>T3</thread_id>
      <name>Internal Arc (C-Story) Name</name>
      <description>The internal psychological battle from the Lie to the Truth.</description>
    </thread>
  </narrative_threads>

  <character_arcs>
${(castList.length > 0 ? castList : [{ name: 'Character Name', role: 'Protagonist', corner_role: 'MAIN_CHARACTER' } as CastMember & Record<string, unknown>]).map((c) => `    <arc>
      <char_id>${c.name}</char_id>
      <corner_role>${asString(c.corner_role) || 'MAIN_CHARACTER'}</corner_role>
      <lie_believed>Their Safety Habit or outlook (${c.name}'s initial defense or habit)${c.core_flaw ? ` (flaw: ${c.core_flaw})` : ''} - grounded in understandable human experience, NOT clinical diagnosis.</lie_believed>
      <truth_needed>The specific realization, shift in priorities, or new way of living needed for authentic growth${c.core_desire ? ` (desire: ${c.core_desire})` : ''}.</truth_needed>
      <arc_catalyst>The specific dramatic event or relationship forcing ${c.name} to confront their comfort zone.</arc_catalyst>
      <arc_description>Detailed explanation of ${c.name}'s journey from safety habit to transformed realization, driven by messy human choices and genuine stakes.</arc_description>
      <web_pressure>How ${c.name}'s choices and trajectory specifically pull, challenge, comfort, or mirror the other corners of the dilemma web.</web_pressure>
    </arc>`).join('\n')}
  </character_arcs>
  <secret_vault>
    <!-- Strictly 1 to 3 foundational mysteries/twists/secrets native to this story -->
    <secret>
      <title>Descriptive title of secret or twist</title>
      <category>plot_mystery | dramatic_irony | character_concealment | red_herring</category>
      <truth>The absolute hidden fact.</truth>
      <public_cover_story>The false or baseline narrative that characters and reader believe prior to reveal.</public_cover_story>
      <known_by>Character Name(s) who know in-universe</known_by>
      <concealed_from>Character Name(s) who are deceived</concealed_from>
      <reveal_target_act>3</reveal_target_act>
      <reveal_target_sequence>7</reveal_target_sequence>
      <clue_schedule>
        <!-- Lean clue density: STRICTLY 2 clues prior to reveal -->
        <clue sequence="2">
          <behavioral_directive>Concrete physical action or verbal anomaly performed without disclosing the secret.</behavioral_directive>
          <benign_reason>Plausible everyday circumstance.</benign_reason>
        </clue>
        <clue sequence="5">
          <behavioral_directive>Subtle environmental friction or physical breadcrumb under pressure.</behavioral_directive>
          <benign_reason>Plausible cover explanation.</benign_reason>
        </clue>
      </clue_schedule>
    </secret>
  </secret_vault>
</response>
</output_format_description>

BEGIN DEVELOPING STORY ARC
`,
            systemPrompt: PROMPTS.storyArc,
            reviewerSystemPrompt: PROMPTS.arcReview,
            reviewerPromptFn: (genOutput) => `<user_concept>
${conceptToUse}
</user_concept>

${pillarsBlock}${buildGenreToneStyleBlocks(asRecord(storyToUse.style))}

<status_quo>
${statusQuo}
</status_quo>

<active_character_profiles>
${castList.map((c) => `- ${c.name} (${c.role}): Flaw: ${c.core_flaw || 'None'}, Desire: ${c.core_desire || 'None'}`).join('\n')}
</active_character_profiles>

<output_format_description>
FORMATTING DIRECTIVE: Return your evaluation strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

CRITICAL EVALUATION DIRECTIVES:
1. Verify presence of: <core_thematic_argument> (debatable thesis), <inciting_incident>, <starting_value_state>, <ending_value_state>, <major_surprises_and_twists>, at least 3 <thread> blocks in <narrative_threads> (T1, T2, T3), and <arc> blocks for cast members.
2. If these structural foundations are present, logically sound, and aligned with the concept/genre, you MUST set status to PASS. Do NOT fail a structurally complete arc simply for stylistic preferences — put creative suggestions in <critique_analysis>.
3. Only output <status>FAIL</status> if there is a severe fatal flaw: missing thematic thesis, missing inciting incident, fewer than 3 narrative threads, missing character arcs, or an irreconcilable plot contradiction. If failing, you MUST provide precise, actionable, numbered items inside <deviation_reasons><reason>...</reason></deviation_reasons> detailing exactly how the generator can resolve them in revision.

Output Schema:
<response>
  <critique_analysis>Perform a step-by-step critical analysis of each criterion. Cite specific plot points, logic gaps, or elements that feel weak or uninspired.</critique_analysis>
  <status>PASS</status> <!-- or FAIL -->
  <deviation_reasons>
    <reason>Explain the exact issue and how to fix it.</reason>
  </deviation_reasons>
</response>
</output_format_description>

<generated_story_arc>
${genOutput}
</generated_story_arc>

BEGIN STORY ARC CRITIQUE REVIEW
`,
            parserFn: (text) => parseStoryArcXml(text) as unknown as Record<string, unknown>,
            modelSize: 'dev',
            spawningContext: 'Story Arc planning'
        });

        const parsedArc = asRecord(arcResult.parsedData);
        const parsedCharArcs = asArray(parsedArc.character_arcs);
        const parsedVault = asArray(parsedArc.secret_vault);
        const parsedThreads = asArray(parsedArc.threads);

        const updatedStory = ctx.setStory((prev) => ({
            ...prev,
            starting_value_state:
                prev.starting_value_state && prev.starting_value_state !== storyToUse.starting_value_state
                    ? prev.starting_value_state
                    : asString(parsedArc.starting_value_state) || asString(prev.starting_value_state),
            ending_value_state:
                prev.ending_value_state && prev.ending_value_state !== storyToUse.ending_value_state
                    ? prev.ending_value_state
                    : asString(parsedArc.ending_value_state) || asString(prev.ending_value_state),
            core_thematic_argument:
                prev.core_thematic_argument &&
                prev.core_thematic_argument !== storyToUse.core_thematic_argument
                    ? prev.core_thematic_argument
                    : asString(parsedArc.core_thematic_argument) ||
                      asString(prev.core_thematic_argument),
            major_surprises_and_twists:
                prev.major_surprises_and_twists &&
                prev.major_surprises_and_twists !== storyToUse.major_surprises_and_twists
                    ? prev.major_surprises_and_twists
                    : asString(parsedArc.major_surprises_and_twists) ||
                      asString(prev.major_surprises_and_twists),
            character_arcs: parsedCharArcs.length > 0 ? parsedCharArcs : asArray(prev.character_arcs),
            inciting_incident:
                prev.inciting_incident && prev.inciting_incident !== storyToUse.inciting_incident
                    ? prev.inciting_incident
                    : asString(parsedArc.inciting_incident) || asString(prev.inciting_incident),
            secret_vault: parsedVault.length > 0 ? parsedVault : asArray(prev.secret_vault),
            threads: parsedThreads.length > 0 ? parsedThreads : prev.threads
        }));

        const updatedId = asString(updatedStory.id);
        if (updatedId) {
            await storyStore.saveStory(updatedId, updatedStory);
        }
        ctx.showToast('Story Arc (Tier 1.1) generated successfully!', 'success');
        return updatedStory;
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error('[generateStoryArc] Story Arc generation failed:', e);
        ctx.showToast(`Story Arc generation failed: ${msg}`, 'error');
        if (!isAutopilot) {
            if (ctx.notifyAlert) ctx.notifyAlert(`Story Arc generation failed: ${msg}`);
            else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(`Story Arc generation failed: ${msg}`);
            }
        }
        throw e;
    } finally {
        if (!isAutopilot) ctx.setLoading(false);
    }
}

/** TIER 2.1–3.2: Act Architect + 8-Sequence Weaver orchestrator. */
export async function generateActsAndSequences(
    ctx: PipelineRuntimeContext,
    currentStory?: PipelineStory | null,
    isAutopilot = false
): Promise<PipelineStory> {
    const storyToUse = currentStory || ctx.getStory();
    ctx.setLoading(true);
    ctx.setLoadingStep('Structuring Acts & Sequences (Tier 2.1, 2.2, 3.1, 3.2)...');

    try {
        console.log('[generateActsAndSequences] Starting Tier 2.1: Act Planner...');
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 3,
            elementType: 'act',
            title: '3-Act Narrative Structure',
            subStep: 'Act Planner (Tier 2.1)',
            startedAt: Date.now()
        });
        ctx.setLoadingStep('Act Planner (Tier 2.1)...');

        const actLoreDocs = await ctx.retrieveContext(
            `Act Structure Milestones: ${asString(storyToUse.concept)} ${asString(storyToUse.core_thematic_argument)}`,
            0.6,
            null,
            asArray<LoreItem>(storyToUse.lore)
        );
        const { formatLoreForPrompt } = await import('@/domain/story');
        const actLoreBlocks = formatLoreForPrompt(
            asString(storyToUse.world_primer) || null,
            actLoreDocs
        );
        const threads = asArray<Record<string, unknown>>(storyToUse.threads);
        const cast = asArray<CastMember & Record<string, unknown>>(storyToUse.cast);

        const parseActsXml = (text: string): ParsedActsPayload => {
            const actsMatch = /<acts>([\s\S]*?)<\/acts>/i.exec(text);
            const actsXML = actsMatch ? actsMatch[1] : text;
            const actRegex = /<act(?:\s+[^>]*)?>([\s\S]*?)<\/act>/gi;
            const parsedActs: ParsedActItem[] = [];
            let match: RegExpExecArray | null;
            let idx = 1;
            while ((match = actRegex.exec(actsXML)) !== null) {
                const actData = match[1];
                const knotsMatch = /<knots>([\s\S]*?)<\/knots>/i.exec(actData);
                const knotsXML = knotsMatch ? knotsMatch[1] : '';
                const knotRegex = /<knot(?:\s+[^>]*)?>([\s\S]*?)<\/knot>/gi;
                const knots: Array<{ description: string; interaction: string }> = [];
                let kMatch: RegExpExecArray | null;
                while ((kMatch = knotRegex.exec(knotsXML)) !== null) {
                    knots.push({
                        description: extractTag(kMatch[1], 'description'),
                        interaction: extractTag(kMatch[1], 'interaction')
                    });
                }
                const rawNum = extractTag(actData, 'number');
                const actNum = parseActNumber(rawNum || extractTag(actData, 'title'), idx);
                const mandate =
                    extractTag(actData, 'act_mandate') ||
                    extractTag(actData, 'description') ||
                    extractTag(actData, 'summary') ||
                    extractTag(actData, 'mandate') ||
                    '';
                const title = extractTag(actData, 'title') || `Act ${actNum}`;
                const worldDevelopments = extractTag(actData, 'world_building_developments') || '';

                parsedActs.push({
                    number: actNum,
                    title,
                    act_mandate:
                        mandate ||
                        `Act ${actNum} Narrative Architecture: Core dramatic shift and thematic progression.`,
                    description:
                        mandate ||
                        `Act ${actNum} Narrative Architecture: Core dramatic shift and thematic progression.`,
                    world_building_developments: worldDevelopments,
                    knots
                });
                idx++;
            }

            if (parsedActs.length === 0) {
                const actHeaderRegex =
                    /(?:^|\n)(?:#{1,4}\s*)?Act\s*([123]|I{1,3})[:\s-]*([^\n]*)\n([\s\S]*?)(?=(?:^|\n)(?:#{1,4}\s*)?Act\s*[123]|I{1,3}|$)/gi;
                let hMatch: RegExpExecArray | null;
                while ((hMatch = actHeaderRegex.exec(text)) !== null) {
                    const rawNumStr = hMatch[1].trim();
                    let aNum = parseInt(rawNumStr, 10);
                    if (Number.isNaN(aNum)) {
                        if (/^iii$/i.test(rawNumStr)) aNum = 3;
                        else if (/^ii$/i.test(rawNumStr)) aNum = 2;
                        else aNum = 1;
                    }
                    const hTitle = hMatch[2].trim() || `Act ${aNum}`;
                    const hBody = hMatch[3].trim();
                    parsedActs.push({
                        number: aNum,
                        title: hTitle,
                        act_mandate:
                            hBody || `Act ${aNum} Narrative Architecture: Exploration of global value shifts.`,
                        description:
                            hBody || `Act ${aNum} Narrative Architecture: Exploration of global value shifts.`,
                        world_building_developments: '',
                        knots: []
                    });
                }
            }

            const defaultTitles = [
                'Setup & Inciting Incident',
                'Confrontation & The Midpoint Crisis',
                'Climax & Resolution'
            ];
            const defaultMandates = [
                'Act I establishes the status quo, introduces the primary cast, and launches the central dramatic question following the inciting incident.',
                'Act II escalates the conflict, forces the protagonist to confront unexpected complications and internal flaws leading to the major midpoint shift.',
                'Act III drives the narrative toward the climactic showdown, resolving the central thematic question and establishing a transformed equilibrium.'
            ];
            for (let a = 1; a <= 3; a++) {
                const existingAct = parsedActs.find((act) => parseActNumber(act.number) === a);
                if (!existingAct) {
                    parsedActs.push({
                        number: a,
                        title: defaultTitles[a - 1],
                        act_mandate: defaultMandates[a - 1],
                        description: defaultMandates[a - 1],
                        world_building_developments: '',
                        knots: []
                    });
                } else if (!existingAct.act_mandate || existingAct.act_mandate.length < 50) {
                    existingAct.act_mandate =
                        (existingAct.act_mandate ? `${existingAct.act_mandate} — ` : '') +
                        defaultMandates[a - 1];
                    existingAct.description = existingAct.act_mandate;
                }
            }
            parsedActs.sort((a, b) => a.number - b.number);

            const threadStatuses: Array<{ id: string; status: string }> = [];
            const threadsMatch = /<thread_statuses_at_end>([\s\S]*?)<\/thread_statuses_at_end>/i.exec(
                text
            );
            if (threadsMatch) {
                const tsRegex = /<thread_status(?:\s+[^>]*)?>([\s\S]*?)<\/thread_status>/gi;
                let tsMatch: RegExpExecArray | null;
                while ((tsMatch = tsRegex.exec(threadsMatch[1])) !== null) {
                    threadStatuses.push({
                        id: extractTag(tsMatch[1], 'thread_id'),
                        status: extractTag(tsMatch[1], 'status')
                    });
                }
            }

            threads.forEach((t) => {
                const tid = asString(t?.id);
                if (t && tid && !threadStatuses.some((ts) => ts.id === tid)) {
                    threadStatuses.push({
                        id: tid,
                        status: `Thread "${asString(t.name)}" active; progressing through macro act structure.`
                    });
                }
            });

            const relShifts: Array<{ from: string; to: string; new_feeling: string }> = [];
            const shiftsMatch = /<relationship_shifts>([\s\S]*?)<\/relationship_shifts>/i.exec(text);
            if (shiftsMatch) {
                const shiftRegex = /<shift(?:\s+[^>]*)?>([\s\S]*?)<\/shift>/gi;
                let sMatch: RegExpExecArray | null;
                while ((sMatch = shiftRegex.exec(shiftsMatch[1])) !== null) {
                    relShifts.push({
                        from: extractTag(sMatch[1], 'source_id'),
                        to: extractTag(sMatch[1], 'target_id'),
                        new_feeling: extractTag(sMatch[1], 'new_dynamic')
                    });
                }
            }

            return {
                acts: parsedActs,
                thread_statuses: threadStatuses,
                relationship_shifts: relShifts
            };
        };

        const actResult = await runAgentWithEscalation<ParsedActsPayload>(ctx, {
            tierName: 'Act Agent',
            isAutopilot,
            context: storyToUse,
            generatorPromptFn: () => `
${buildGenreToneBlocks(asRecord(storyToUse.style))}

${actLoreBlocks ? `${actLoreBlocks}\n\n` : ''}<overall_story_information>
<concept>${asString(storyToUse.concept)}</concept>
<status_quo>${asString(storyToUse.status_quo)}</status_quo>
</overall_story_information>

<story_arc>
<core_thematic_argument>${asString(storyToUse.core_thematic_argument)}</core_thematic_argument>
<starting_value_state>${asString(storyToUse.starting_value_state)}</starting_value_state>
<ending_value_state>${asString(storyToUse.ending_value_state)}</ending_value_state>
<inciting_incident>${asString(storyToUse.inciting_incident)}</inciting_incident>
<major_surprises_and_twists>${asString(storyToUse.major_surprises_and_twists)}</major_surprises_and_twists>
<character_psychological_arcs>
${asArray<Record<string, unknown>>(storyToUse.character_arcs)
    .map((ca, idx) => {
        const charObj = resolveCharacter(asString(ca.char_id), cast) || cast[idx];
        const charName = charObj ? charObj.name : asString(ca.char_id) || `Character ${idx + 1}`;
        const rawCorner = asString(ca.corner_role) || asString(charObj?.corner_role);
        const cornerRole = rawCorner ? ` [${rawCorner}]` : '';
        const webDynamic = ca.web_pressure
            ? `\n  Four-Corner Dynamic: ${asString(ca.web_pressure)}`
            : '';
        return `- ${charName}${cornerRole}: ${asString(ca.description)}${ca.lie_believed ? `\n  Safety Habit / Outlook: ${asString(ca.lie_believed)}` : ''}${ca.truth_needed ? `\n  Realization / Truth: ${asString(ca.truth_needed)}` : ''}${ca.arc_catalyst ? `\n  Arc Catalyst: ${asString(ca.arc_catalyst)}` : ''}${webDynamic}`;
    })
    .join('\n')}
</character_psychological_arcs>
</story_arc>

<narrative_threads>
${threads.map((t) => `<thread><thread_id>${asString(t.id)}</thread_id><name>${asString(t.name)}</name><description>${asString(t.description)}</description></thread>`).join('\n')}
</narrative_threads>

<cast_list>
${cast.map((c) => `- ${c.name} (${c.role})`).join('\n')}
</cast_list>

<output_format_description>
FORMATTING DIRECTIVE: Return your act structure strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

STRUCTURAL INTEGRITY REQUIREMENTS:
1. You MUST generate all 3 acts (<act><number>1</number>...</act>, <act><number>2</number>...</act>, <act><number>3</number>...</act>).
2. MANDATORY MANDATE HEADINGS: Every single act's <act_mandate> MUST contain all five bold markdown headings:
   - **THEMATIC & STRUCTURAL FUNCTION:**
   - **DRAMATIC ARC & PACING CURVES:**
   - **THREAD PROGRESSION & CONVERGENCE:**
   - **CHARACTER & PSYCHOLOGICAL JOURNEY:**
   - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:**
   Do not omit, truncate, or combine any heading in ANY act.
3. 8-SEQUENCE MATH:
   - Act I houses 2 Sequences (Seq 1: Setup; Seq 2: Inciting Incident & Lock-In).
   - Act II houses 4 Sequences (Seq 3: New World; Seq 4: Midpoint Climax; Seq 5: Fallout; Seq 6: Dark Night).
   - Act III houses 2 Sequences (Seq 7: Climax; Seq 8: Resolution).
4. MANDATORY THREAD COVERAGE: You MUST declare a <thread_status> block inside <thread_statuses_at_end> for EVERY active thread listed in <narrative_threads> (${threads.map((t) => asString(t.id)).join(', ') || 'T1'}).

Output Schema:
<response>
  <acts>
    <act>
      <number>1</number>
      <title>Act I: Setup & The Inciting Shift</title>
      <act_mandate>
        - **THEMATIC & STRUCTURAL FUNCTION:** Deep thematic and emotional exploration of Act I. Establish status quo equilibrium, introduce core thematic argument, and disrupt equilibrium.
        - **DRAMATIC ARC & PACING CURVES:** Narrative movement across Sequences 1 and 2. Detail starting emotional/value state, rising action, sequence division, and Point of No Return climax crossing into Act II.
        - **THREAD PROGRESSION & CONVERGENCE:** How active plot threads originate, interweave, and create initial friction in Act I.
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** Protagonist flaw confrontation. Ground in defined "Lie Believed" and what triggers the disruption.
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Structural problems or pacing pitfalls for downstream Sequence 1 & 2 planners.
      </act_mandate>
      <world_building_developments>How setting and lore rules are introduced here.</world_building_developments>
      <knots>
        <knot>
          <description>Irreversible event collision...</description>
          <interaction>Plot thread event forces character crisis.</interaction>
        </knot>
      </knots>
    </act>
    <act>
      <number>2</number>
      <title>Act II: Confrontation, The Midpoint Shift & Dark Night</title>
      <act_mandate>
        - **THEMATIC & STRUCTURAL FUNCTION:** Exploration of sustained narrative disequilibrium. Test the thematic argument through escalating crises, irreversible trials, and devastating reversals across 4 sequences.
        - **DRAMATIC ARC & PACING CURVES:** Movement across Sequences 3, 4, 5, and 6. Map the New World escalation (Seq 3), the major Midpoint shift/revelation (Seq 4), the cascading fallout (Seq 5), and the descent into the Dark Night of the Soul (Seq 6).
        - **THREAD PROGRESSION & CONVERGENCE:** Collide all primary and secondary plot threads at the Midpoint knot and climax of Act II.
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** Push character defenses to catastrophic collapse. Strip away the "Lie Believed" before the truth can take root.
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Pacing pitfalls, saggy middle prevention, and constraints for Sequences 3 through 6.
      </act_mandate>
      <world_building_developments>How the world expands and hidden rules/consequences are unveiled.</world_building_developments>
      <knots>
        <knot>
          <description>Midpoint collision...</description>
          <interaction>Primary thread crisis forces secondary thread explosion.</interaction>
        </knot>
      </knots>
    </act>
    <act>
      <number>3</number>
      <title>Act III: Climax, Synthesis & Transformed Equilibrium</title>
      <act_mandate>
        - **THEMATIC & STRUCTURAL FUNCTION:** Narrative synthesis and catharsis. Resolve the core thematic argument and establish a transformed Todorov equilibrium.
        - **DRAMATIC ARC & PACING CURVES:** High-tension pacing through Sequence 7 (Climactic Confrontation) and Sequence 8 (Denouement & Resolution).
        - **THREAD PROGRESSION & CONVERGENCE:** Definitively converge all remaining narrative threads to ultimate closure or intentional resonant lingering hooks.
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** Character embraces the "Truth Needed," achieving synthesis and profound internal/external transformation.
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Guard against anti-climactic resolution, rushed denouement, or dropped character payoffs.
      </act_mandate>
      <world_building_developments>How the world state is permanently transformed post-climax.</world_building_developments>
      <knots>
        <knot>
          <description>Climactic confluence...</description>
          <interaction>All lingering threads converge at the point of maximum consequence.</interaction>
        </knot>
      </knots>
    </act>
  </acts>

  <thread_statuses_at_end>
${
    threads.length > 0
        ? threads
              .map(
                  (t) =>
                      `    <thread_status>\n      <thread_id>${asString(t.id)}</thread_id>\n      <status>Definitive status and trajectory for thread "${asString(t.name)}" across the act structure.</status>\n    </thread_status>`
              )
              .join('\n')
        : `    <thread_status>\n      <thread_id>T1</thread_id>\n      <status>Exact status of primary plot thread.</status>\n    </thread_status>`
}
  </thread_statuses_at_end>

  <relationship_shifts>
    <shift>
      <source_id>${cast[0] ? cast[0].name : 'Character Name'}</source_id>
      <target_id>${cast[1] ? cast[1].name : 'Character Name'}</target_id>
      <new_dynamic>How their relationship fundamentally evolved across the acts.</new_dynamic>
    </shift>
  </relationship_shifts>
</response>
</output_format_description>
${getAuthorNoteXml(storyToUse as Partial<Story> & Record<string, unknown>)}

BEGIN STRUCTURING ACTS
`,
            systemPrompt: PROMPTS.actAgent,
            reviewerSystemPrompt: PROMPTS.actReview,
            reviewerPromptFn: (genOutput) => `
${buildGenreToneBlocks(asRecord(storyToUse.style))}

<overall_story_information>
<concept>${asString(storyToUse.concept)}</concept>
<status_quo>${asString(storyToUse.status_quo)}</status_quo>
</overall_story_information>

<story_arc>
Core Thematic Argument: ${asString(storyToUse.core_thematic_argument)}
Starting Value State: ${asString(storyToUse.starting_value_state)}
Ending Value State: ${asString(storyToUse.ending_value_state)}
Inciting Incident: ${asString(storyToUse.inciting_incident)}
Major Surprises and Twists: ${asString(storyToUse.major_surprises_and_twists)}
Character Arcs:
${formatObjectToXml(asArray(storyToUse.character_arcs))}
</story_arc>

<narrative_threads>
${formatObjectToXml(threads)}
</narrative_threads>

<cast_list>
${cast.map((c) => `- ${c.name} (${c.role})`).join('\n')}
</cast_list>

<output_format_description>
FORMATTING DIRECTIVE: Return your evaluation strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

EVALUATION DIRECTIVE:
1. Verify each of the 3 Acts individually contains all 5 required mandate headings:
   - **THEMATIC & STRUCTURAL FUNCTION:**
   - **DRAMATIC ARC & PACING CURVES:**
   - **THREAD PROGRESSION & CONVERGENCE:**
   - **CHARACTER & PSYCHOLOGICAL JOURNEY:**
   - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:**
2. Verify all active thread IDs (${threads.map((t) => asString(t.id)).join(', ') || 'T1'}) have a declared status in <thread_statuses_at_end>.
3. If the outline is structurally sound and narrative developments are logical and earned, set status to PASS.
4. If setting status to FAIL, you MUST list specific, actionable reasons in <deviation_reasons> (e.g. "Act 2 is missing ANTICIPATED ISSUES & CRITICAL CONSTRAINTS heading", "Thread T2 missing from thread_statuses_at_end", or "Act 2 Midpoint shift lacks dramatic reversal") so the Act Agent can surgically address them on revision.

Output Schema:
<response>
  <critique_analysis>Critically analyze each Act's mandate, structural points, and thread statuses. Specifically verify that all five mandate sections are present and robustly addressed in EACH act. Verify every thread ID from the input is accounted for in thread_statuses_at_end.</critique_analysis>
  <status>PASS</status> <!-- or FAIL -->
  <deviation_reasons>
    <reason>Explain the exact issue and how to fix it.</reason>
  </deviation_reasons>
</response>
</output_format_description>

<generated_acts>
${genOutput}
</generated_acts>

BEGIN ACT CRITIQUE REVIEW
`,
            parserFn: parseActsXml,
            modelSize: 'dev',
            spawningContext: 'Act division and pacing',
            parentTierFailFn: async (reasons) => {
                ctx.setFeedbackLedger((prev) => ({
                    ...prev,
                    'Story Arc Agent': reasons
                }));
            }
        });

        console.log('[generateActsAndSequences] Tier 2.1 Act Planner complete.');

        const rawRels = asRecord(storyToUse.relationships);
        const nextRels: Record<string, RelationshipMapEntry> = {};
        for (const [rk, rv] of Object.entries(rawRels)) {
            const rvRec = asRecord(rv);
            nextRels[rk] = {
                ...rvRec,
                current: asString(rvRec.current),
                history: [...asArray<RelationshipHistoryEntry>(rvRec.history)]
            };
        }

        if (actResult.parsedData.relationship_shifts) {
            actResult.parsedData.relationship_shifts.forEach((shift) => {
                const key = `${shift.from}->${shift.to}`;
                if (!nextRels[key]) {
                    nextRels[key] = { current: '', history: [] };
                } else {
                    nextRels[key] = {
                        ...nextRels[key],
                        history: [...(nextRels[key].history || [])]
                    };
                }
                nextRels[key].current = shift.new_feeling;
                nextRels[key].history.push({
                    chapter: 'Act Structure planning',
                    change: `${shift.new_feeling} (Structured shift)`
                });
            });
        }

        const actsData = actResult.parsedData.acts;

        const intermediateStoryWithActs = ctx.setStory((prev) => {
            const prevRels = asRecord(prev.relationships);
            const mergedRels: Record<string, RelationshipMapEntry> = { ...nextRels };
            for (const [rk, rv] of Object.entries(prevRels)) {
                const rvRec = asRecord(rv);
                mergedRels[rk] = {
                    ...rvRec,
                    current: asString(rvRec.current),
                    history: [...asArray<RelationshipHistoryEntry>(rvRec.history)]
                };
            }
            if (actResult.parsedData.relationship_shifts) {
                actResult.parsedData.relationship_shifts.forEach((shift) => {
                    const key = `${shift.from}->${shift.to}`;
                    if (!mergedRels[key]) {
                        mergedRels[key] = { current: '', history: [] };
                    } else {
                        mergedRels[key] = {
                            ...mergedRels[key],
                            history: [...(mergedRels[key].history || [])]
                        };
                    }
                    mergedRels[key].current = shift.new_feeling;
                    const shiftLabel = `${shift.new_feeling} (Structured shift)`;
                    if (
                        !mergedRels[key].history.some(
                            (h) => h.chapter === 'Act Structure planning' && h.change === shiftLabel
                        )
                    ) {
                        mergedRels[key].history.push({
                            chapter: 'Act Structure planning',
                            change: shiftLabel
                        });
                    }
                });
            }
            return {
                ...prev,
                acts: actsData,
                relationships: mergedRels,
                thread_statuses:
                    actResult.parsedData.thread_statuses || prev.thread_statuses || []
            };
        });

        if (!isAutopilot || !ctx.isAutopilotProtectedView?.()) {
            ctx.setView?.('structure');
            ctx.setActiveActTab?.(0);
        }
        const interId = asString(intermediateStoryWithActs.id);
        if (interId) {
            await storyStore.saveStory(interId, intermediateStoryWithActs);
        }

        // TIER 3.1 & 3.2: SEQUENCE PLANNER & REVIEWER
        console.log('[generateActsAndSequences] Starting Tier 3.1: Sequence Planner...');
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 3,
            elementType: 'sequence',
            title: '8-Sequence Framework',
            subStep: 'Weaving Sequences (Tier 3.1)',
            startedAt: Date.now()
        });
        ctx.setLoadingStep('Weaving Sequences across novel (Tier 3.1)...');

        const liveForSeq = ctx.getStory() || intermediateStoryWithActs;
        const seqLoreDocs = await ctx.retrieveContext(
            `Sequence Architecture Objectives: ${asString(liveForSeq.concept)} ${asString(liveForSeq.core_thematic_argument)}`,
            0.6,
            null,
            asArray<LoreItem>(liveForSeq.lore)
        );
        const getSequenceContext = () => {
            const currentLive = ctx.getStory() || intermediateStoryWithActs;
            return buildSequencePromptContext(
                currentLive as Partial<Story> & ContinuityStoryState,
                (currentLive.relationships || nextRels) as Record<string, Record<string, unknown>>,
                asArray<Record<string, unknown>>(currentLive.acts).length > 0
                    ? asArray<Record<string, unknown>>(currentLive.acts)
                    : (actsData as unknown as Array<Record<string, unknown>>),
                1,
                seqLoreDocs
            );
        };

        const seqResult = await runAgentWithEscalation<{ sequences: NormalizedSequence[] }>(ctx, {
            tierName: 'Sequence Agent',
            isAutopilot,
            context: intermediateStoryWithActs,
            generatorPromptFn: () => `
${getSequenceContext()}

<output_format_description>
FORMATTING DIRECTIVE: Return your sequences strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

MANDATORY ARCHITECTURE DIRECTIVE: You MUST generate EXACTLY 8 SEQUENCES across all 3 Acts:
- Act 1: Sequence 1 (Status Quo & Setup), Sequence 2 (Inciting Incident & Lock-In)
- Act 2: Sequence 3 (First Obstacles & New World), Sequence 4 (Escalation & Midpoint Reversal), Sequence 5 (Midpoint Fallout & Counter-Strategies), Sequence 6 (Tightening Net & Dark Night)
- Act 3: Sequence 7 (Climax & Decisive Confrontation), Sequence 8 (Resolution & New Equilibrium)

DO NOT stop after Sequence 1 or 2. You MUST include all 8 <sequence> blocks in your response.

COMPLETENESS & CONCISENESS DIRECTIVE: You MUST complete all 8 sequences across Acts 1, 2, and 3 in this single response without truncation. To fit all 8 sequences comfortably within output token limits, maintain high narrative density: write 1 to 2 focused, punchy sentences for EACH of the 5 required headings in <description>. Do not write multi-paragraph essays per heading. Ensure every sequence has all 5 bold headings populated concisely so all 8 sequences are generated completely.

Output Schema:
<response>
  <sequences>
    <sequence>
      <number>1</number>
      <parent_act>1</parent_act> <!-- 1, 2, or 3 -->
      <title>Sequence 1 Title</title>
      <sequence_function>Status Quo & Setup</sequence_function> <!-- From the 8-sequence framework -->
      <dramatic_question>The localized dramatic question driving this sequence.</dramatic_question>
      <starting_state>Exact starting physical location(s), characters present, and causal pickup from the previous sequence's ending_hook (or status quo baseline for Sequence 1).</starting_state>
      <description>
        - **THEMATIC & STRUCTURAL FUNCTION:** Deep thematic and emotional exploration of this sequence. Explain its role in the global value shift.
        - **DRAMATIC ARC & PACING CURVES:** Map the sequence-level narrative movement. Detail the starting state, rising action, and dramatic climax.
        - **THREAD PROGRESSION & CONVERGENCE:** Describe how active plot threads evolve and intersect within this sequence.
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** Focus on internal struggles, character tests, and shifting motivations. (ACT 2 MANDATE: At least one sequence in Act 2 must explicitly incorporate a strong counterpoint to the protagonist's core lie that challenges their worldview and adds psychological complexity).
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Identify potential structural problems for downstream scene planners to navigate.
      </description>
      <sequence_objective>The single most important narrative goal this sequence accomplishes.</sequence_objective>
      <threads_advanced>
        <thread>T1</thread>
      </threads_advanced>
      <thread_storylines>
        <thread_storyline>
          <thread_id>T1</thread_id>
          <storyline_advancement>Detailed description of what develops, complicates, or changes for this thread during this sequence.</storyline_advancement>
          <weaving_interaction>How this thread weaves into, clashes with, or impacts the main plot or other active threads in this sequence.</weaving_interaction>
        </thread_storyline>
      </thread_storylines>
      <characters_in_focus>
        <character>Character Name</character>
      </characters_in_focus>
      <four_corner_movement>How this sequence's events test the Main Character's Safety Habit via Challenger friction, Comforter temptation, or Warning mirror</four_corner_movement>
      <sequence_climax>The specific moment of resolution or reversal for this sequence's dramatic question.</sequence_climax>
      <ending_hook>How the sequence ends — including the exact terminal location and state that propel characters directly into the next sequence's starting_state.</ending_hook>
      <next_sequence_boundary_guard>Explicitly name what upcoming plot turns, location arrivals, or first-time primary character introductions belong strictly to Sequence N+1 and MUST NOT be preempted in this sequence (or state final sequence resolution for Sequence 8).</next_sequence_boundary_guard>
    </sequence>
    <!-- Include ALL 8 <sequence> blocks (number 1 through 8) with their respective parent_act (Act 1: 1-2, Act 2: 3-6, Act 3: 7-8) -->
  </sequences>
</response>
</output_format_description>

BEGIN DEVELOPING STORY SEQUENCES
`,
            systemPrompt: PROMPTS.sequenceAgent,
            reviewerSystemPrompt: PROMPTS.sequenceReview,
            reviewerPromptFn: (genOutput) => `\n${getSequenceContext()}\n
<output_format_description>
FORMATTING DIRECTIVE: Return your evaluation strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <critique_analysis>Analyze each sequence's dramatic question, dramatic purpose, pacing contribution, causal linkage, spatial/state alignment between Sequence N's ending_hook and Sequence N+1's starting_state, and anti-preemption boundaries (no duplicate character introductions or encroaching events). VERIFY that EXACTLY 8 sequences (Sequences 1 through 8) are present.</critique_analysis>
  <status>PASS</status> <!-- or FAIL -->
  <deviation_reasons>
    <reason>Explain the exact issue and how to fix it. If fewer than 8 sequences are generated, FAIL and explicitly demand all 8 sequences.</reason>
  </deviation_reasons>
</response>
</output_format_description>

MANDATORY CRITERION: Count the <sequence> tags. If fewer than 8 sequences are present (e.g. only 1 or 2 sequences generated), status MUST be FAIL with deviation reason "Incomplete structure: exactly 8 sequences across Acts 1, 2, and 3 are required."

<generated_sequences>
${genOutput}
</generated_sequences>

BEGIN SEQUENCE CRITIQUE REVIEW
`,
            parserFn: (text) => ({ sequences: parseSequencesXML(text) }),
            modelSize: 'dev',
            spawningContext: 'Novel Sequence Architecture',
            parentTierFailFn: async (reasons) => {
                ctx.setFeedbackLedger((prev) => ({
                    ...prev,
                    'Act Agent': reasons
                }));
            }
        });

        console.log('[generateActsAndSequences] Tier 2.2 Sequence Agent complete.');

        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 2,
            elementType: 'lore',
            title: 'World Bible Vector Memory',
            subStep: 'Archiving World Lore',
            startedAt: Date.now()
        });
        ctx.setLoadingStep('Archiving world lore...');

        const worldBibleEntry = {
            topic: 'Status Quo Setting',
            detail: asString(storyToUse.status_quo),
            valid_from_act: 1,
            valid_from_scene: 1
        };
        const existingWorldBible = asArray<Record<string, unknown>>(storyToUse.lore).find(
            (l) => l && (l.topic === 'Status Quo Setting' || l.topic === 'World Bible Setting')
        );
        let persistedWorldBible: Record<string, unknown> | null = existingWorldBible || null;

        if (
            worldBibleEntry.detail &&
            (!existingWorldBible || existingWorldBible.detail !== worldBibleEntry.detail)
        ) {
            try {
                ctx.setRagStatus('indexing_batch');
                const wbText = `${worldBibleEntry.topic}: ${worldBibleEntry.detail}`;
                const embService = ctx.getEmbeddingService();
                const vecStore = ctx.getVectorStore();
                const emb = embService ? await embService.getEmbedding(wbText) : null;
                if (emb && vecStore) {
                    await vecStore.add('lore_world_bible_setting', wbText, emb, {
                        topic: worldBibleEntry.topic,
                        valid_from_act: 1,
                        valid_from_scene: 1,
                        category: 'General',
                        detail: worldBibleEntry.detail
                    });
                    persistedWorldBible = worldBibleEntry;
                } else if (!existingWorldBible) {
                    persistedWorldBible = worldBibleEntry;
                }
            } catch (e) {
                console.warn(
                    '[generateActsAndSequences] World Bible vector archival failed; will retry on next regeneration:',
                    e
                );
                if (!existingWorldBible) persistedWorldBible = worldBibleEntry;
            } finally {
                ctx.setRagStatus('ready');
            }
        }

        const currentForPacing = ctx.getStory() || storyToUse;
        const parsedPacing = computePacingRanges(
            Number(currentForPacing.target_word_count || 80000)
        );
        const normalizedSequences = normalizeSequences(seqResult.parsedData.sequences);

        const finalStory = ctx.setStory((prev) => {
            const hasDraftedProseInStory = Object.values(asRecord(prev.prose)).some((p) => {
                if (!p) return false;
                const pRec = asOptionalRecord(p);
                const txt =
                    typeof p === 'string'
                        ? p
                        : asString(pRec?.final || pRec?.text || pRec?.draft || pRec?.prose);
                return typeof txt === 'string' && txt.trim().length > 0;
            });
            const userEditedStorySoFar =
                prev.story_so_far && prev.story_so_far !== storyToUse.story_so_far;
            const prevLore = asArray<Record<string, unknown>>(prev.lore);
            return {
                ...prev,
                acts: asArray(prev.acts).length > 0 ? prev.acts : actsData,
                sequences: normalizedSequences,
                relationships: prev.relationships || nextRels,
                lore:
                    persistedWorldBible && persistedWorldBible.detail
                        ? [
                              ...prevLore.filter(
                                  (l) =>
                                      l &&
                                      l.topic !== 'Status Quo Setting' &&
                                      l.topic !== 'World Bible Setting'
                              ),
                              persistedWorldBible
                          ]
                        : prevLore,
                thread_statuses:
                    asArray(prev.thread_statuses).length > 0
                        ? prev.thread_statuses
                        : actResult.parsedData.thread_statuses || [],
                generation_ranges: parsedPacing,
                continuity_ledger: Array.isArray(prev.continuity_ledger)
                    ? prev.continuity_ledger
                    : [],
                story_so_far:
                    hasDraftedProseInStory || userEditedStorySoFar
                        ? asString(prev.story_so_far)
                        : ''
            };
        });

        const finalId = asString(finalStory.id);
        if (finalId) {
            await storyStore.saveStory(finalId, finalStory);
        }
        if (!isAutopilot || !ctx.isAutopilotProtectedView?.()) {
            ctx.setView?.('structure');
        }
        ctx.showToast('Acts & Sequences structured successfully!', 'success');
        return finalStory;
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error('Failed to generate Acts and Sequences:', e);
        ctx.showToast(`Generation failed: ${msg}`, 'error');
        if (!isAutopilot) {
            if (ctx.notifyAlert) ctx.notifyAlert(`Generation failed: ${msg}`);
            else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(`Generation failed: ${msg}`);
            }
        }
        throw e;
    } finally {
        if (!isAutopilot) ctx.setLoading(false);
    }
}

/** TIER 3.1 & 3.2 Standalone Sequence Weaver (re-weaves sequences onto existing Acts). */
export async function generateSequences(
    ctx: PipelineRuntimeContext,
    currentStory?: PipelineStory | null,
    isAutopilot = false
): Promise<PipelineStory | undefined> {
    const storyToUse = currentStory || ctx.getStory();
    if (asArray(storyToUse.acts).length === 0) {
        ctx.showToast('Please structure Acts first before weaving sequences.', 'warning');
        return undefined;
    }

    ctx.setLoading(true);
    ctx.setActivePipelineWork?.({
        mode: 'novel',
        phase: 3,
        elementType: 'sequence',
        title: '8-Sequence Framework',
        subStep: 'Weaving Sequences (Tier 3.1 & 3.2)',
        startedAt: Date.now()
    });
    ctx.setLoadingStep('Weaving Sequences across the novel (Tier 3.1 & 3.2)...');

    try {
        const seqLoreDocs = await ctx.retrieveContext(
            `Sequence Architecture Objectives: ${asString(storyToUse.concept)} ${asString(storyToUse.core_thematic_argument)}`,
            0.6,
            null,
            asArray<LoreItem>(storyToUse.lore)
        );
        const getSequenceContext = () => {
            const liveStory = ctx.getStory() || storyToUse;
            return buildSequencePromptContext(
                liveStory as Partial<Story> & ContinuityStoryState,
                null,
                null,
                1,
                seqLoreDocs
            );
        };

        const seqResult = await runAgentWithEscalation<{ sequences: NormalizedSequence[] }>(ctx, {
            tierName: 'Sequence Agent',
            isAutopilot,
            context: storyToUse,
            generatorPromptFn: () => `
${getSequenceContext()}

<output_format_description>
FORMATTING DIRECTIVE: Return your sequences strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

MANDATORY ARCHITECTURE DIRECTIVE: You MUST generate EXACTLY 8 SEQUENCES across all 3 Acts:
- Act 1: Sequence 1 (Status Quo & Setup), Sequence 2 (Inciting Incident & Lock-In)
- Act 2: Sequence 3 (First Obstacles & New World), Sequence 4 (Escalation & Midpoint Reversal), Sequence 5 (Midpoint Fallout & Counter-Strategies), Sequence 6 (Tightening Net & Dark Night)
- Act 3: Sequence 7 (Climax & Decisive Confrontation), Sequence 8 (Resolution & New Equilibrium)

DO NOT stop after Sequence 1 or 2. You MUST include all 8 <sequence> blocks in your response.

COMPLETENESS & CONCISENESS DIRECTIVE: You MUST complete all 8 sequences across Acts 1, 2, and 3 in this single response without truncation. To fit all 8 sequences comfortably within output token limits, maintain high narrative density: write 1 to 2 focused, punchy sentences for EACH of the 5 required headings in <description>. Do not write multi-paragraph essays per heading. Ensure every sequence has all 5 bold headings populated concisely so all 8 sequences are generated completely.

Output Schema:
<response>
  <sequences>
    <sequence>
      <number>1</number>
      <parent_act>1</parent_act> <!-- 1, 2, or 3 -->
      <title>Sequence 1 Title</title>
      <sequence_function>Status Quo & Setup</sequence_function> <!-- From the 8-sequence framework -->
      <dramatic_question>The localized dramatic question driving this sequence.</dramatic_question>
      <starting_state>Exact starting physical location(s), characters present, and causal pickup from the previous sequence's ending_hook (or status quo baseline for Sequence 1).</starting_state>
      <description>
        - **THEMATIC & STRUCTURAL FUNCTION:** Deep thematic and emotional exploration of this sequence. Explain its role in the global value shift.
        - **DRAMATIC ARC & PACING CURVES:** Map the sequence-level narrative movement. Detail the starting state, rising action, and dramatic climax.
        - **THREAD PROGRESSION & CONVERGENCE:** Describe how active plot threads evolve and intersect within this sequence.
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** Focus on internal struggles, character tests, and shifting motivations. (ACT 2 MANDATE: At least one sequence in Act 2 must explicitly incorporate a strong counterpoint to the protagonist's core lie that challenges their worldview and adds psychological complexity).
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Identify potential structural problems for downstream scene planners to navigate.
      </description>
      <sequence_objective>The single most important narrative goal this sequence accomplishes.</sequence_objective>
      <threads_advanced>
        <thread>T1</thread>
      </threads_advanced>
      <thread_storylines>
        <thread_storyline>
          <thread_id>T1</thread_id>
          <storyline_advancement>Detailed description of what develops, complicates, or changes for this thread during this sequence.</storyline_advancement>
          <weaving_interaction>How this thread weaves into, clashes with, or impacts the main plot or other active threads in this sequence.</weaving_interaction>
        </thread_storyline>
      </thread_storylines>
      <characters_in_focus>
        <character>Character Name</character>
      </characters_in_focus>
      <four_corner_movement>How this sequence's events test the Main Character's Safety Habit via Challenger friction, Comforter temptation, or Warning mirror</four_corner_movement>
      <sequence_climax>The specific moment of resolution or reversal for this sequence's dramatic question.</sequence_climax>
      <ending_hook>How the sequence ends — including the exact terminal location and state that propel characters directly into the next sequence's starting_state.</ending_hook>
      <next_sequence_boundary_guard>Explicitly name what upcoming plot turns, location arrivals, or first-time primary character introductions belong strictly to Sequence N+1 and MUST NOT be preempted in this sequence (or state final sequence resolution for Sequence 8).</next_sequence_boundary_guard>
    </sequence>
    <!-- Include ALL 8 <sequence> blocks (number 1 through 8) with their respective parent_act (Act 1: 1-2, Act 2: 3-6, Act 3: 7-8) -->
  </sequences>
</response>
</output_format_description>

BEGIN DEVELOPING STORY SEQUENCES
`,
            systemPrompt: PROMPTS.sequenceAgent,
            reviewerSystemPrompt: PROMPTS.sequenceReview,
            reviewerPromptFn: (genOutput) =>
                `${getSequenceContext()}\n\n<output_format_description>\nFORMATTING DIRECTIVE: Return your evaluation strictly as XML tags. Do not use YAML or markdown blocks.\nCRITICAL XML RULE: Enclose the entire response in <response>...</response>.\n\nOutput Schema:\n<response>\n  <critique_analysis>Analyze each sequence's dramatic question, dramatic purpose, pacing contribution, causal linkage, spatial/state alignment between Sequence N's ending_hook and Sequence N+1's starting_state, and anti-preemption boundaries (no duplicate character introductions or encroaching events). VERIFY that EXACTLY 8 sequences (Sequences 1 through 8) are present.</critique_analysis>\n  <status>PASS</status> <!-- or FAIL -->\n  <deviation_reasons>\n    <reason>Explain the exact issue and how to fix it. If fewer than 8 sequences are generated, FAIL and explicitly demand all 8 sequences.</reason>\n  </deviation_reasons>\n</response>\n</output_format_description>\n\nMANDATORY CRITERION: Count the <sequence> tags. If fewer than 8 sequences are present (e.g. only 1 or 2 sequences generated), status MUST be FAIL with deviation reason "Incomplete structure: exactly 8 sequences across Acts 1, 2, and 3 are required."\n\n<generated_sequences>\n${genOutput}\n</generated_sequences>\n\nBEGIN SEQUENCE CRITIQUE REVIEW`,
            parserFn: (text) => ({ sequences: parseSequencesXML(text) }),
            modelSize: 'dev',
            spawningContext: 'Novel Sequence Architecture',
            parentTierFailFn: async (reasons) => {
                ctx.setFeedbackLedger((prev) => ({
                    ...prev,
                    'Act Agent': reasons
                }));
            }
        });

        const nextStory = ctx.setStory((prev) => ({
            ...prev,
            sequences: normalizeSequences(seqResult.parsedData.sequences),
            scenes: {},
            beats: {},
            prose: {},
            story_so_far:
                prev.story_so_far && prev.story_so_far !== storyToUse.story_so_far
                    ? prev.story_so_far
                    : ''
        }));

        const nextId = asString(nextStory.id);
        if (nextId) {
            await storyStore.saveStory(nextId, nextStory);
        }
        ctx.showToast('All sequences woven successfully!', 'success');
        return nextStory;
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error('Sequence generation failed:', e);
        ctx.showToast(`Sequence generation failed: ${msg}`, 'error');
        if (!isAutopilot) {
            if (ctx.notifyAlert) ctx.notifyAlert(`Sequence generation failed: ${msg}`);
            else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(`Sequence generation failed: ${msg}`);
            }
        }
        throw e;
    } finally {
        if (!isAutopilot) ctx.setLoading(false);
    }
}

export function touchStatusQuoFingerprint(
    ctx: PipelineRuntimeContext,
    storyId: string,
    loreList: LoreItem[]
): void {
    const emb = ctx.getEmbeddingService();
    if (emb?.isConfigured()) {
        safeLocalStorageSet(
            'ellipsisprose_rag_fingerprint',
            computeLoreFingerprint(storyId, loreList, emb.getProviderLabel())
        );
    }
}
