/**
 * @module domain/series/prompts
 * Prompt blocks for books in a series. Every formatter returns '' for a standalone story, so a
 * story without `series` produces exactly the prompts it produced before series support.
 */

import type { Story } from '@/types';
import { buildEndingContract, formatEndingContract } from './contract';
import { getCurrentBookPlan, getNextBookPlan, isSeriesStory } from './plan';
import { fairPlayLedgerForVaultSecret, isRevealDueThisBook } from './secrets';
import { formatThreadLedgerForPrompt, getSeriesThreadDirectivesForSequence, isThreadOpen } from './threads';

type AnyRecord = Record<string, unknown>;

function clean(val: unknown): string {
    return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}

function formatReturningCast(story: Partial<Story>): string {
    const returning = story.series?.returning_cast || [];
    if (returning.length === 0) return '';
    return returning
        .map((c) => {
            const end = (c.end_state || {}) as AnyRecord;
            const bits = [
                clean(c.role) ? `Role so far: ${clip(clean(c.role), 200)}` : '',
                clean(c.last_corner_role) ? `Last corner: ${clean(c.last_corner_role)}` : '',
                clean(end.emotional_state) ? `Left feeling: ${clip(clean(end.emotional_state), 160)}` : '',
                clean(end.location) ? `Left at: ${clip(clean(end.location), 120)}` : '',
                clean(end.unresolved_tension) ? `Unresolved: ${clip(clean(end.unresolved_tension), 200)}` : ''
            ].filter(Boolean);
            return `- ${c.name}${bits.length ? `. ${bits.join(' | ')}` : ''}`;
        })
        .join('\n');
}

function formatBookPlanLines(story: Partial<Story>): string {
    const plan = getCurrentBookPlan(story);
    if (!plan) return '';
    return [
        plan.role ? `<book_role>${plan.role}</book_role>` : '',
        plan.book_question ? `<book_question>${plan.book_question}</book_question>` : '',
        plan.stakes_scope ? `<stakes_scope>${plan.stakes_scope}</stakes_scope>` : '',
        plan.lead_arc_stage && (plan.lead_arc_stage.lie || plan.lead_arc_stage.truth)
            ? `<lead_arc_stage_for_this_book lead="${plan.lead_name || ''}">From "${plan.lead_arc_stage.lie}" toward "${plan.lead_arc_stage.truth}". This is one stage of a longer arc, not the whole journey.</lead_arc_stage_for_this_book>`
            : '',
        plan.handoff_state ? `<handoff_state>${plan.handoff_state}</handoff_state>` : ''
    ]
        .filter(Boolean)
        .join('\n');
}

/**
 * Series background for concept and arc planning: where the series stands, who returns,
 * and what is still open.
 */
export function formatSeriesContext(story: Partial<Story> | null | undefined): string {
    if (!isSeriesStory(story)) return '';
    const s = story.series;
    const plan = s.plan;
    const parts: string[] = [`<series_context series="${s.title}" book="${s.book_number}">`];
    if (plan?.series_question) parts.push(`<series_question>${plan.series_question}</series_question>`);
    if (plan?.series_thematic_argument) {
        parts.push(`<series_thematic_argument>${plan.series_thematic_argument}</series_thematic_argument>`);
    }
    if (plan?.endgame_note) parts.push(`<endgame_note>${plan.endgame_note}</endgame_note>`);
    const bookLines = formatBookPlanLines(story);
    if (bookLines) parts.push(`<this_book>\n${bookLines}\n</this_book>`);
    if (s.previous_books.length > 0) {
        parts.push(
            `<previous_books>\n${s.previous_books
                .map((b) => `<book number="${b.book_number}" title="${b.title}">\n${clip(b.recap, 4000)}\n</book>`)
                .join('\n')}\n</previous_books>`
        );
    }
    const returning = formatReturningCast(story);
    if (returning) parts.push(`<returning_cast>\n${returning}\n</returning_cast>`);
    if (s.carryover?.style_note) {
        parts.push(`<established_series_style>\n${clip(s.carryover.style_note, 1500)}\n</established_series_style>`);
    }
    const ledger = formatThreadLedgerForPrompt(story.open_threads, 'full');
    if (ledger) parts.push(`<open_series_threads>\n${ledger}\n</open_series_threads>`);
    parts.push('</series_context>');
    return `${parts.join('\n')}\n\n`;
}

/** Tier 0.1 rules for a book in a series, appended after the series context. */
export function formatSeriesConceptRules(story: Partial<Story> | null | undefined): string {
    if (!isSeriesStory(story)) return '';
    const book = story.series.book_number;
    if (book <= 1) {
        return `<series_rules>\nThis story is Book 1 of the series "${story.series.title}". Build a world and cast with room to grow: the status quo should hold tensions that one book cannot exhaust.\n</series_rules>\n\n`;
    }
    return `<series_rules>
This is Book ${book} of the series "${story.series.title}". It continues the same world.
- Build a FRESH four-corner character web around THIS book's own dilemma. The dilemma must be a new facet of <series_thematic_argument>, not a repeat of an earlier book.
- C1 (MAIN_CHARACTER) MUST be one of the characters in <returning_cast>, using that exact name. It does not have to be the previous lead.
- Returning characters may take a different corner than before. Use their exact names. Their flaw and desire must grow out of where the last book left them, never reset to who they were at the start of Book 1.
- New characters may fill the other corners. Do not rename, replace or contradict anyone in <returning_cast>.
- <status_quo> describes the world as it stands AFTER the previous books, including the consequences in <previous_books>.
- Keep genre, tone and prose style consistent with <established_series_style>.
</series_rules>

`;
}

function formatSecretsForPlanner(story: Partial<Story>): string {
    const book = story.series?.book_number || 1;
    const vault = Array.isArray(story.secret_vault) ? story.secret_vault : [];
    const lines: string[] = [];
    vault.forEach((v) => {
        const sec = v as typeof v & { parent_secret_id?: string; reveal_book?: number; scope?: 'book' | 'series' };
        if (!sec.parent_secret_id) return;
        if (isRevealDueThisBook(sec, book)) {
            const ledger = fairPlayLedgerForVaultSecret(story, sec);
            lines.push(
                `<series_secret id="${sec.id}" reveal="this_book"><title>${sec.title}</title><truth_revealed_in_this_book>${sec.truth}</truth_revealed_in_this_book>${ledger ? `<clues_already_planted>${ledger}</clues_already_planted>` : ''}</series_secret>`
            );
        } else {
            lines.push(
                `<series_secret id="${sec.id}" reveal="book_${sec.reveal_book}"><title>${sec.title}</title><hidden_truth>${sec.truth}</hidden_truth><rule>Stays hidden for this whole book. Plan at most one quiet clue. Never reveal or confirm it.</rule></series_secret>`
            );
        }
    });
    return lines.join('\n');
}

/** Tier 1.1 and act planning: the thread ledger with intents, series secrets, and the contract. */
export function formatSeriesPlanningBlock(story: Partial<Story> | null | undefined): string {
    if (!isSeriesStory(story)) return '';
    const parts: string[] = [`<series_planning series="${story.series.title}" book="${story.series.book_number}">`];
    const bookLines = formatBookPlanLines(story);
    if (bookLines) parts.push(bookLines);
    const ledger = formatThreadLedgerForPrompt(story.open_threads, 'full');
    if (ledger) {
        parts.push(
            `<series_threads>\n${ledger}\n</series_threads>\n<series_thread_rules>Series threads run across books and are tracked separately from this book's own narrative threads (T1, T2, T3...). Weave each series thread into the book according to its intent: introduce, advance and complicate threads move but do NOT resolve; pay_off threads resolve in the final sequences; rest threads get one brief mention; defer threads never appear. When one of this book's narrative threads carries a series thread, say so in that thread's description by naming the series thread id (for example "carries S2").</series_thread_rules>`
        );
    }
    const secrets = formatSecretsForPlanner(story);
    if (secrets) {
        parts.push(
            `<series_secrets>\n${secrets}\n</series_secrets>\n<series_secret_rules>A series secret marked reveal="this_book" is one of this book's major twists: plan its reveal near the climax and make it pay off the clues already planted. The other secrets in <secret_vault> must be native to this book. Do not restate series secrets inside <secret_vault>.</series_secret_rules>`
        );
    }
    const contract = formatEndingContract(buildEndingContract(story), 'planner');
    if (contract) parts.push(contract);
    const next = getNextBookPlan(story);
    if (next?.book_question) {
        parts.push(`<next_book_sketch>The following book will ask: ${next.book_question}</next_book_sketch>`);
    }
    parts.push('</series_planning>');
    return `${parts.join('\n')}\n\n`;
}

/** Sequence planning: which series threads sit in which sequence, plus the contract. */
export function formatSeriesSequenceHints(story: Partial<Story> | null | undefined, sequenceCount = 8): string {
    if (!isSeriesStory(story)) return '';
    const lines: string[] = [];
    for (let seq = 1; seq <= sequenceCount; seq++) {
        const due = getSeriesThreadDirectivesForSequence(story, seq);
        if (due.length === 0) continue;
        lines.push(`Sequence ${seq}: ${due.map((d) => `${d.thread_id} "${d.title}" (${d.intent})`).join('; ')}`);
    }
    const contract = formatEndingContract(buildEndingContract(story), 'planner');
    if (lines.length === 0 && !contract) return '';
    const parts = [`<series_thread_schedule>`];
    if (lines.length > 0) {
        parts.push(lines.join('\n'));
        parts.push(
            'Give each listed series thread a concrete beat in its sequence and add its id (for example S1) to that sequence\'s <threads_advanced>. Outside these sequences a series thread may be felt but must not be resolved.'
        );
    }
    parts.push('</series_thread_schedule>');
    if (contract) parts.push(contract);
    return `${parts.join('\n')}\n\n`;
}

/** Scene planning and prose for one sequence: the threads due there, and the guard near the end. */
export function formatSeriesSceneDirectives(
    story: Partial<Story> | null | undefined,
    seqNum: number | string,
    audience: 'planner' | 'prose' = 'planner',
    sequenceCount = 8
): string {
    if (!isSeriesStory(story)) return '';
    const seq = Number(seqNum);
    const due = getSeriesThreadDirectivesForSequence(story, seq);
    const parts: string[] = [];
    if (due.length > 0) {
        const lines = due.map((d) => {
            const reminder = d.needsReminder
                ? ' This thread comes from an earlier book: re-establish it for the reader in a line or two, with no recap dump.'
                : '';
            return `- ${d.thread_id} "${d.title}": ${d.directive}${reminder}`;
        });
        parts.push(
            audience === 'planner'
                ? `<series_thread_directives>\nSeries threads due in this sequence. Place each in ONE scene where it arises naturally from the action:\n${lines.join('\n')}\n</series_thread_directives>`
                : `<series_threads_in_play>\nThese longer-running threads belong to this stretch of the book. Touch one only if this scene's blueprint calls for it, and never resolve one unless told to:\n${lines.join('\n')}\n</series_threads_in_play>`
        );
    }
    if (seq >= sequenceCount - 1) {
        const contract = formatEndingContract(buildEndingContract(story), audience);
        if (contract) parts.push(contract);
    }
    return parts.length > 0 ? `${parts.join('\n')}\n\n` : '';
}

/** Extra output fields the continuity pass reports for a book in a series. */
export function formatSeriesContinuityAddendum(story: Partial<Story> | null | undefined): string {
    if (!isSeriesStory(story)) return '';
    const threads = (story.open_threads || []).filter(isThreadOpen);
    const book = story.series.book_number;
    const secrets = (Array.isArray(story.secret_vault) ? story.secret_vault : []).filter((v) => v && v.status !== 'revealed');
    const threadLines = threads.map((t) => `- ${t.id}: ${t.title}. Promise: ${t.promise || t.description}`).join('\n');
    const secretLines = secrets
        .map((v) => {
            const sec = v as typeof v & { reveal_book?: number; scope?: 'book' | 'series' };
            const held = !isRevealDueThisBook(sec, book) ? ` (HELD for Book ${sec.reveal_book}: any reveal is a leak)` : '';
            return `- ${v.id}: ${v.title}${held}. Truth: ${v.truth}`;
        })
        .join('\n');
    return `<series_tracking>
This story is Book ${book} of a series. In addition to the fields above, add these three arrays to the SAME JSON object. Use empty arrays when nothing applies.
  "open_thread_updates": [ { "id": "S1", "change": "advanced | complicated | resolved", "note": "One line: what changed for this thread in THIS scene." } ],
  "new_thread_candidates": [ { "title": "Short name", "promise": "What the reader now expects to see answered later", "owners": ["Character Name"], "kind": "plot | mystery | relationship | character | world" } ],
  "secret_events": [ { "secret_id": "id from the list below", "event": "clue_seeded | layer_revealed | leaked", "evidence": "Short quote or description from the scene." } ]
Rules: report a thread only if this scene really moved it. Use "resolved" only when the scene settles the thread for good. Propose a new thread candidate rarely: only for a question the scene clearly opens that will outlast this book.
<series_threads>
${threadLines || '(none yet)'}
</series_threads>
<tracked_secrets>
${secretLines || '(none)'}
</tracked_secrets>
</series_tracking>
`;
}

/** A thread status table for the Story So Far and recap prompts, so no open thread is lost. */
export function formatSeriesThreadStatus(story: Partial<Story> | null | undefined): string {
    if (!isSeriesStory(story)) return '';
    const threads = (story.open_threads || []).filter((t) => t.status !== 'abandoned');
    if (threads.length === 0) return '';
    const lines = threads.map((t) => `- ${t.id} "${t.title}" [${t.status}]${t.last_note ? `: ${t.last_note}` : ''}`);
    return `<series_thread_status>\nLonger-running threads of the series. Keep every open one visible in the summary, with where it currently stands:\n${lines.join('\n')}\n</series_thread_status>\n\n`;
}

/** Interview addendum for a character who returns from an earlier book. */
export function formatReturningInterviewBlock(char: AnyRecord, bookNumber: number): string {
    const prior = clean(char.prior_deep_profile);
    if (!char.returning_from_book || !prior) return '';
    const end = (char.prior_end_state || {}) as AnyRecord;
    const endBits = [clean(end.emotional_state), clean(end.unresolved_tension), clean(end.location)].filter(Boolean).join(' | ');
    return `<returning_character book="${bookNumber}">
${clean(char.name)} returns from an earlier book. This is the SAME person: keep their voice, speech habits and history exactly. What has changed is their outlook, shaped by what they lived through.
<earlier_interview>
${clip(prior, 6000)}
</earlier_interview>
${endBits ? `<where_the_last_book_left_them>${endBits}</where_the_last_book_left_them>\n` : ''}In this new interview, let them speak from where they stand NOW. Show what they have learned, what they still refuse to see, and how their answers differ from the earlier interview. Do not contradict established facts about them.
</returning_character>
`;
}
