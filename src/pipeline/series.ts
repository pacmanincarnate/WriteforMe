/**
 * @module pipeline/series
 * Series-only pipeline steps: the Series Architect (rolling series plan), the ending contract
 * auditor, and the end-of-book recap. None of them runs for a standalone story.
 */

import {
    allocateThreadBeats,
    bindSeriesThreads,
    buildEndingContract,
    describeViolation,
    formatEndingContract,
    formatSeriesContext,
    formatSeriesThreadStatus,
    isSeriesStory,
    isThreadOpen,
    materializeSeriesSecrets,
    normalizeOpenThreads,
    parseContractAudit,
    parseSeriesPlan,
    planThreadsForBook,
    seriesThreadLimits,
    fallbackRecap
} from '@/domain/series';
import { SERIES_PROMPTS } from '@/prompts';
import type { CastMember, OpenThread, SeriesInfo, Story } from '@/types';
import { extractTag } from '@/utils';
import {
    asArray,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';

const ARCHITECT_OUTPUT_FORMAT = `<output_format_description>
FORMATTING DIRECTIVE: Return the series plan strictly as XML tags.
<response>
  <series_question>The single dramatic question the whole series answers.</series_question>
  <series_thematic_argument>A debatable thesis. Each book argues one facet of it.</series_thematic_argument>
  <endgame_note>Two or three sentences on where the series is ultimately heading. Not a plot outline.</endgame_note>
  <lead_long_arc>
    <char_name>Name of the CURRENT book's lead</char_name>
    <lie>The belief that will take this character more than one book to shed.</lie>
    <truth>What they will finally understand.</truth>
  </lead_long_arc>
  <books>
    <book number="CURRENT_BOOK_NUMBER" role="opener | escalation | reversal | low_point | finale | middle">
      <book_question>The question this book answers at its climax. Its answer must sharpen the series question, not settle it.</book_question>
      <stakes_scope>Who stands to lose what in this book.</stakes_scope>
      <lead_name>The lead of this book</lead_name>
      <lead_arc_stage><lie>The part of the lie this book confronts.</lie><truth>The partial truth won by the end of this book.</truth></lead_arc_stage>
      <handoff_state>Where the lead, the cast and the world stand on the last page.</handoff_state>
      <thread_intents>
        <thread_intent id="S1">introduce | advance | complicate | pay_off | rest | defer</thread_intent>
      </thread_intents>
    </book>
    <book number="NEXT_BOOK_NUMBER" role="...">
      <!-- A sketch only: book_question, stakes_scope, handoff_state and thread_intents. -->
    </book>
  </books>
  <series_threads>
    <!-- Every existing thread you keep, by its id, plus any NEW thread. New threads use the next free id. -->
    <series_thread id="S1" kind="plot | mystery | relationship | character | world">
      <title>Short name</title>
      <promise>What the reader is led to expect, in one sentence.</promise>
      <owners>Character names who carry it, comma separated</owners>
    </series_thread>
  </series_threads>
  <series_secrets>
    <!-- Only NEW secrets. Zero to two. Existing secrets are kept automatically. -->
    <secret>
      <title>Name of the deep truth</title>
      <cover_story>What everyone believes instead.</cover_story>
      <known_by>Character names, or none</known_by>
      <concealed_from>Character names</concealed_from>
      <layers>
        <layer number="1" reveal_book="CURRENT_BOOK_NUMBER"><truth>A partial truth that works as this book's twist.</truth><revealed_to>Character names</revealed_to></layer>
        <layer number="2" reveal_book="A_LATER_BOOK"><truth>The deeper truth, held back.</truth><revealed_to>Character names</revealed_to></layer>
      </layers>
    </secret>
  </series_secrets>
  <revision_summary>For Book 2 onward: one or two sentences on how the plan changed after the last book. Empty for Book 1.</revision_summary>
</response>
</output_format_description>`;

function findLeadName(story: PipelineStory): string {
    const cast = asArray<CastMember & Record<string, unknown>>(story.cast);
    const lead = cast.find((c) => asString(c.corner_role).toUpperCase() === 'MAIN_CHARACTER') || cast[0];
    return lead?.name || '';
}

/** Keeps the ledger inside the book's limit by resting the newest threads beyond it. */
function capOpenThreads(threads: OpenThread[], maxOpen: number, bookNumber: number): OpenThread[] {
    const open = threads.filter(isThreadOpen);
    if (open.length <= maxOpen) return threads;
    const overflow = new Set(
        open
            .filter((t) => t.origin_book === bookNumber && t.source === 'plan')
            .slice(Math.max(0, maxOpen - open.filter((t) => t.origin_book !== bookNumber).length))
            .map((t) => t.id)
    );
    return threads.filter((t) => !overflow.has(t.id));
}

/**
 * Plans (or re-plans) the series around the current book: series question, this book's place in
 * it, the thread intents and the secret layers. Runs after the cast exists and before the arc.
 */
export async function runSeriesArchitect(
    ctx: PipelineRuntimeContext,
    storyId: string,
    baseStory: PipelineStory
): Promise<PipelineStory> {
    if (!isSeriesStory(baseStory as Partial<Story>)) return baseStory;
    const story = baseStory as Partial<Story> & { series: SeriesInfo };
    const book = story.series.book_number;
    const limits = seriesThreadLimits(story.target_word_count);
    const existingThreads = normalizeOpenThreads(story.open_threads, book);
    const cast = asArray<CastMember & Record<string, unknown>>(story.cast);

    ctx.setLoadingStep(`Series Architect: planning Book ${book} within the series...`);
    ctx.setActivePipelineWork?.({
        mode: 'novel',
        phase: 1,
        elementType: 'arc',
        title: `Series Plan (Book ${book})`,
        subStep: 'Series Architect',
        startedAt: Date.now()
    });

    const previousPlan = story.series.plan || null;
    const prompt = `${formatSeriesContext(story)}<user_concept_for_this_book>
${asString(story.concept)}
</user_concept_for_this_book>

${story.heart_of_the_dilemma ? `<heart_of_the_dilemma>\n${asString(story.heart_of_the_dilemma)}\n</heart_of_the_dilemma>\n\n` : ''}<status_quo>
${asString(story.status_quo)}
</status_quo>

<cast_list>
${cast.map((c) => `- ${c.name} (${asString(c.role)}${c.corner_role ? ` [${asString(c.corner_role)}]` : ''}${c.returning_from_book ? ', returning' : ''}): Flaw: ${asString(c.core_flaw) || 'None'}, Desire: ${asString(c.core_desire) || 'None'}`).join('\n')}
</cast_list>

${previousPlan && previousPlan.long_arcs.length > 0 ? `<existing_long_arcs>\n${previousPlan.long_arcs.map((a) => `- ${a.char_name}: from "${a.lie}" to "${a.truth}"`).join('\n')}\n</existing_long_arcs>\n\n` : ''}${previousPlan && previousPlan.secrets.length > 0 ? `<existing_series_secrets>\n${previousPlan.secrets.map((s) => `- ${s.title}: ${s.layers.map((l) => `layer ${l.layer} (${l.status}, Book ${l.reveal_book}): ${l.truth}`).join(' / ')}`).join('\n')}\n</existing_series_secrets>\n\n` : ''}<planning_task>
Plan Book ${book} of the series "${story.series.title}" and sketch Book ${book + 1}.
- This book is ${asString(story.book_type) || 'a novel'} of about ${Number(story.target_word_count) || 80000} words. Keep at most ${limits.maxOpen} series threads open at once and pay off at most ${limits.maxPayOffs} in this book.
${book === 1 ? `- This is the opener. Design ${Math.min(2, limits.maxOpen)} to ${limits.maxOpen} series threads that this book introduces and does NOT resolve, and at most one layered series secret.` : `- Keep every thread in <open_series_threads> by its id and give each an intent for this book. Decide which, if any, pays off now. You may add a new thread only if there is room.\n- Revise the plan in light of what actually happened in <previous_books>.`}
- The book question must be answerable inside this one book. The series question must not be.
</planning_task>

${ARCHITECT_OUTPUT_FORMAT}`;

    let raw = '';
    try {
        raw = await ctx.callAI(prompt, SERIES_PROMPTS.seriesArchitect, false, 'Series Architect', 'dev');
    } catch (err) {
        console.warn('[runSeriesArchitect] Series Architect call failed, using a minimal plan:', err);
        ctx.logPipelineError('Series Architect', extractErrorMessage(err), null, {
            tierName: 'Series Architect',
            actionTaken: 'Continuing with a minimal series plan'
        });
    }

    const parsed = parseSeriesPlan(raw, {
        bookNumber: book,
        previousPlan,
        existingThreads,
        leadName: findLeadName(story),
        concept: asString(story.concept)
    });
    const bookPlan = parsed.plan.books.find((b) => b.book_number === book) || null;
    const capped = capOpenThreads(parsed.threads, limits.maxOpen, book);
    const sequenceCount = asArray(story.sequences).length || 8;
    const threads = allocateThreadBeats(planThreadsForBook(capped, bookPlan, book, cast, limits), sequenceCount);
    const vault = materializeSeriesSecrets(story.secret_vault, parsed.plan, book);

    ctx.logPipelineValidation(
        'Series Architect',
        parsed.parsed,
        parsed.parsed
            ? `Series plan ready: ${threads.filter(isThreadOpen).length} open series threads, ${parsed.plan.secrets.length} series secrets, Book ${book} question set.`
            : 'Could not read a series plan from the output. Continuing with a minimal plan.',
        null,
        { tierName: 'Series Architect', type: 'structural_gate', actionTaken: 'Proceeding to Tier 1.1 Story Arc Planner' }
    );

    const updated = await ctx.updateStoryById(storyId, (prev) => ({
        ...prev,
        series: { ...asRecord(prev.series), plan: parsed.plan },
        open_threads: threads,
        secret_vault: vault
    }));
    return updated || { ...baseStory, series: { ...story.series, plan: parsed.plan }, open_threads: threads, secret_vault: vault };
}

/**
 * Re-applies the series layer after the Story Arc step, which rewrites `threads` and
 * `secret_vault`: series secrets go back into the vault and threads are bound and scheduled.
 */
export function applySeriesAfterArc(story: PipelineStory): PipelineStory {
    if (!isSeriesStory(story as Partial<Story>)) return story;
    const s = story as Partial<Story> & { series: SeriesInfo };
    const book = s.series.book_number;
    const sequenceCount = asArray(s.sequences).length || 8;
    const bound = bindSeriesThreads(normalizeOpenThreads(s.open_threads, book), asArray(s.threads));
    return {
        ...story,
        open_threads: allocateThreadBeats(bound, sequenceCount),
        secret_vault: materializeSeriesSecrets(s.secret_vault, s.series.plan, book)
    };
}

/**
 * Asks the contract auditor whether a piece of planning or prose breaks the book's ending
 * contract. Returns revision reasons, or an empty list when the text passes or no audit applies.
 */
export async function auditTextAgainstContract(
    ctx: PipelineRuntimeContext,
    story: PipelineStory,
    text: string,
    stage: 'plan' | 'prose'
): Promise<string[]> {
    const contract = buildEndingContract(story as Partial<Story>);
    if (!contract || !text || !text.trim()) return [];
    if (contract.must_stay_open.length === 0 && contract.must_stay_hidden.length === 0) return [];
    const block = formatEndingContract(contract, 'planner');
    const prompt = `${block}

<text_to_check kind="${stage === 'plan' ? 'plan for the final sequences' : 'scene prose from the final sequences'}">
${text.length > 24000 ? text.slice(-24000) : text}
</text_to_check>

Does this text break <must_stay_open> or <must_stay_hidden>? Report only clear violations.`;
    try {
        const out = await ctx.callAI(prompt, SERIES_PROMPTS.contractAuditor, false, 'Series Ending Contract Audit', 'dev');
        return parseContractAudit(out)
            .filter((v) => v.rule === 'must_stay_open' || v.rule === 'must_stay_hidden')
            .map(describeViolation);
    } catch (err) {
        console.warn('[auditTextAgainstContract] Audit call failed, letting the text through:', err);
        return [];
    }
}

/** Writes the recap of a finished book for the next one. Falls back to the running synopsis. */
export async function generateBookRecap(ctx: PipelineRuntimeContext, story: PipelineStory): Promise<string> {
    const fallback = fallbackRecap(story as Partial<Story>);
    const soFar = asString(story.story_so_far).trim();
    if (!soFar) return fallback;
    const acts = asArray<Record<string, unknown>>(story.acts)
        .map((a) => `Act ${asString(a.number)}: ${asString(a.title)}`)
        .join('\n');
    const states = Object.values(asRecord(story.character_states))
        .map((cs) => {
            const r = asRecord(cs);
            return `- ${asString(r.name)}: ${asString(r.emotional_state)} | at ${asString(r.location)} | unresolved: ${asString(r.unresolved_tension)}`;
        })
        .join('\n');
    const prompt = `<book title="${asString(story.title)}">
<concept>${asString(story.concept)}</concept>
<acts>
${acts}
</acts>
<story_so_far>
${soFar}
</story_so_far>
<character_states_at_the_end>
${states}
</character_states_at_the_end>
${formatSeriesThreadStatus(story as Partial<Story>)}</book>

Write the recap of this finished book.`;
    try {
        const out = await ctx.callAI(prompt, SERIES_PROMPTS.bookRecap, false, 'Series Book Recap', 'dev');
        const recap = extractTag(out, 'recap').trim();
        return recap.length > 200 ? recap : fallback;
    } catch (err) {
        console.warn('[generateBookRecap] Recap call failed, using the running synopsis:', err);
        return fallback;
    }
}
