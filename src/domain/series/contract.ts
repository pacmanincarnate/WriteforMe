/**
 * @module domain/series/contract
 * The ending contract: what a book in a series must close, pay off, keep open and keep hidden.
 * The contract is hard. Planning and prose for the final sequences are checked against it.
 */

import type { ContractViolation, EndingContract, OpenThread, SecretEntry, SeriesSecretFields, Story } from '@/types';
import { getCurrentBookPlan, isSeriesStory } from './plan';
import { isRevealDueThisBook } from './secrets';
import { isThreadOpen } from './threads';

type VaultSecret = SecretEntry & SeriesSecretFields;

/** Builds the contract for the current book, or null for a standalone story. */
export function buildEndingContract(story: Partial<Story> | null | undefined): EndingContract | null {
    if (!isSeriesStory(story)) return null;
    const book = story.series.book_number;
    const plan = getCurrentBookPlan(story);
    const threads = Array.isArray(story.open_threads) ? story.open_threads : [];
    // A thread resolved earlier in this book was a pay-off; it stays out of both lists.
    const live = threads.filter((t) => t.status !== 'abandoned');
    const mustPayOff = live.filter((t) => t.intent === 'pay_off');
    const mustStayOpen = live.filter((t) => t.intent !== 'pay_off' && (isThreadOpen(t) || wasResolvedInBook(t, book)));
    const vault = (Array.isArray(story.secret_vault) ? story.secret_vault : []) as VaultSecret[];
    const mustStayHidden = vault
        .filter((v) => v && !isRevealDueThisBook(v, book))
        .map((v) => ({ secret_id: String(v.id || ''), title: String(v.title || 'Secret'), truth: String(v.truth || '') }));
    const firstBookThread = Array.isArray(story.threads) ? (story.threads[0] as { id?: string } | undefined) : undefined;
    return {
        book_number: book,
        book_question: plan?.book_question || '',
        handoff_state: plan?.handoff_state || '',
        must_close: [String(firstBookThread?.id || 'T1')],
        must_pay_off: mustPayOff,
        must_stay_open: mustStayOpen,
        must_stay_hidden: mustStayHidden
    };
}

function wasResolvedInBook(thread: OpenThread, book: number): boolean {
    return thread.status === 'resolved' && (thread.touches || []).some((x) => x.book === book);
}

export function isContractEmpty(contract: EndingContract | null): boolean {
    return (
        !contract ||
        (!contract.book_question &&
            !contract.handoff_state &&
            contract.must_pay_off.length === 0 &&
            contract.must_stay_open.length === 0 &&
            contract.must_stay_hidden.length === 0)
    );
}

/**
 * The contract as a prompt block. Planners see the hidden truths so they can steer around them;
 * prose never does, it only gets titles.
 */
export function formatEndingContract(contract: EndingContract | null, audience: 'planner' | 'prose' = 'planner'): string {
    if (!contract || isContractEmpty(contract)) return '';
    const line = (t: OpenThread) => `${t.id} "${t.title}"${audience === 'planner' && t.promise ? ` (promise: ${t.promise})` : ''}`;
    const parts: string[] = [`<ending_contract book="${contract.book_number}">`];
    parts.push(
        `<must_close>This book's own main plot (${contract.must_close.join(', ')})${contract.book_question ? ` and its question: ${contract.book_question}` : ''}. The book must feel complete on its own. A cliffhanger may only come from a series thread or a new hook, never from leaving this question unanswered.</must_close>`
    );
    if (contract.must_pay_off.length > 0) {
        parts.push(`<must_pay_off>${contract.must_pay_off.map(line).join('; ')}. Each of these resolves on the page before the book ends.</must_pay_off>`);
    }
    if (contract.must_stay_open.length > 0) {
        parts.push(
            `<must_stay_open>${contract.must_stay_open.map(line).join('; ')}. Do NOT resolve, explain away or settle these. They may end sharper than they began, never closed.</must_stay_open>`
        );
    }
    if (contract.must_stay_hidden.length > 0) {
        const hidden = contract.must_stay_hidden
            .map((s) => (audience === 'planner' ? `"${s.title}" (truth, never to reach the page: ${s.truth})` : `"${s.title}"`))
            .join('; ');
        parts.push(`<must_stay_hidden>${hidden}. No character may learn, state or confirm these in this book.</must_stay_hidden>`);
    }
    if (contract.handoff_state && audience === 'planner') {
        parts.push(`<handoff_state>${contract.handoff_state}</handoff_state>`);
    }
    parts.push('</ending_contract>');
    return parts.join('\n');
}

/** Checks the drafted book against the contract using what the ledger and vault recorded. */
export function checkEndingContract(story: Partial<Story> | null | undefined, options: { bookFinished?: boolean } = {}): ContractViolation[] {
    if (!isSeriesStory(story)) return [];
    const book = story.series.book_number;
    const violations: ContractViolation[] = [];
    const threads = Array.isArray(story.open_threads) ? story.open_threads : [];
    threads.forEach((t) => {
        if (t.status === 'abandoned') return;
        const lastTouch = (t.touches || []).filter((x) => x.book === book).slice(-1)[0];
        if (t.intent !== 'pay_off' && t.status === 'resolved' && lastTouch) {
            violations.push({
                rule: 'must_stay_open',
                subject: t.id,
                evidence: `"${t.title}" was resolved in scene ${lastTouch.scene}: ${lastTouch.note}`
            });
        }
        if (options.bookFinished && t.intent === 'pay_off' && t.status !== 'resolved') {
            violations.push({
                rule: 'must_pay_off',
                subject: t.id,
                evidence: `"${t.title}" was planned to pay off in this book and is still open.`
            });
        }
    });
    const vault = (Array.isArray(story.secret_vault) ? story.secret_vault : []) as VaultSecret[];
    vault.forEach((v) => {
        if (v && !isRevealDueThisBook(v, book) && v.status === 'revealed') {
            violations.push({
                rule: 'must_stay_hidden',
                subject: String(v.id || ''),
                evidence: `"${String(v.title || 'Secret')}" belongs to Book ${v.reveal_book} and was revealed in this book.`
            });
        }
    });
    return violations;
}

/** Parses the contract auditor's XML reply into violations. An empty list means the text passes. */
export function parseContractAudit(text: string): ContractViolation[] {
    const out: ContractViolation[] = [];
    if (!text) return out;
    const re = /<violation(?:\s+[^>]*)?>([\s\S]*?)<\/violation>/gi;
    let m: RegExpExecArray | null;
    const tag = (src: string, name: string) => {
        const t = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(src);
        return t ? t[1].trim() : '';
    };
    while ((m = re.exec(text)) !== null) {
        const rule = tag(m[1], 'rule').toLowerCase();
        const valid = ['must_close', 'must_stay_open', 'must_stay_hidden', 'must_pay_off'] as const;
        const subject = tag(m[1], 'subject');
        const evidence = tag(m[1], 'evidence');
        if (!subject && !evidence) continue;
        out.push({
            rule: (valid as readonly string[]).includes(rule) ? (rule as ContractViolation['rule']) : 'must_stay_open',
            subject,
            evidence
        });
    }
    return out;
}

export function describeViolation(v: ContractViolation): string {
    const label =
        v.rule === 'must_stay_open'
            ? 'A series thread that must stay open was resolved'
            : v.rule === 'must_stay_hidden'
              ? 'A secret held for a later book was given away'
              : v.rule === 'must_pay_off'
                ? 'A planned pay-off is missing'
                : "The book's own story is not closed";
    return `Series ending contract (${v.subject || v.rule}): ${label}. ${v.evidence}`.trim();
}
