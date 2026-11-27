/**
 * @module domain/editing/passageRewrite
 * The checks around "select a passage and rewrite it": which part of the scene was really
 * selected, what the model sees around it, and whether what came back may replace it. The model
 * only ever returns the passage, and it is put into the scene here, so nothing outside the
 * selection can change.
 */

export const PASSAGE_MIN_CHARS = 12;
export const PASSAGE_MAX_CHARS = 8000;
export const PASSAGE_CONTEXT_CHARS = 1500;
export const PASSAGE_INSTRUCTION_MAX_CHARS = 600;

export interface PassageSelection {
    start: number;
    end: number;
    text: string;
}

export interface PassageSelectionProblem {
    problem: string;
}

/** The selection without the white space at its edges, or why it cannot be rewritten. */
export function passageSelection(
    text: string,
    start: number,
    end: number
): PassageSelection | PassageSelectionProblem {
    const source = String(text || '');
    let from = Math.max(0, Math.min(start, end, source.length));
    let to = Math.min(source.length, Math.max(start, end, 0));
    while (from < to && /\s/.test(source[from])) from++;
    while (to > from && /\s/.test(source[to - 1])) to--;
    if (to - from === 0) return { problem: 'Select the passage you want rewritten first.' };
    if (to - from < PASSAGE_MIN_CHARS) {
        return { problem: 'That selection is too short to rewrite. Select at least a few words.' };
    }
    if (to - from > PASSAGE_MAX_CHARS) {
        return {
            problem: `That selection is too long (${(to - from).toLocaleString()} characters). Select up to ${PASSAGE_MAX_CHARS.toLocaleString()}, or rewrite the whole scene instead.`
        };
    }
    return { start: from, end: to, text: source.slice(from, to) };
}

/** The text on each side of the selection that the model is shown, cut at a word break. */
export function passageSurroundings(
    text: string,
    selection: PassageSelection,
    limit: number = PASSAGE_CONTEXT_CHARS
): { before: string; after: string } {
    let before = text.slice(Math.max(0, selection.start - limit), selection.start);
    if (selection.start > limit) before = before.replace(/^\S*\s+/, '');
    let after = text.slice(selection.end, selection.end + limit);
    if (selection.end + limit < text.length) after = after.replace(/\s+\S*$/, '');
    return { before, after };
}

/** The rewritten passage out of the model's answer, or null when there is none to use. */
export function passageFromAnswer(answer: string): string | null {
    let raw = String(answer || '');
    const tagged = /<rewrite>([\s\S]*?)<\/rewrite>/i.exec(raw);
    if (tagged) raw = tagged[1];
    else if (/<rewrite>/i.test(raw)) raw = raw.replace(/^[\s\S]*<rewrite>/i, '');
    raw = raw
        .replace(/^\s*```[a-z]*\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .replace(/<\/?(?:passage|before|after|rewrite)>/gi, '')
        .trim();
    return raw || null;
}

/** Why a rewrite may not replace the passage, or null when it may. */
export function passageRewriteProblem(original: string, rewrite: string, surroundings: { before: string; after: string }): string | null {
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
    const was = squash(original);
    const now = squash(rewrite);
    if (!now) return 'The model returned nothing.';
    if (now === was) return 'The model returned the passage unchanged.';
    if (now.length > was.length * 3 + 400) return 'The rewrite came back far longer than the passage.';
    // Repeating the neighbours would duplicate text once the rewrite is put in.
    const tail = squash(surroundings.before).slice(-80);
    const head = squash(surroundings.after).slice(0, 80);
    if (tail.length >= 60 && now.includes(tail)) return 'The rewrite repeated the text before the passage.';
    if (head.length >= 60 && now.includes(head)) return 'The rewrite repeated the text after the passage.';
    return null;
}

/** The scene with the selection replaced; everything outside it is untouched, letter for letter. */
export function withPassageReplaced(
    text: string,
    selection: PassageSelection,
    rewrite: string
): { text: string; start: number; end: number } {
    const next = text.slice(0, selection.start) + rewrite + text.slice(selection.end);
    return { text: next, start: selection.start, end: selection.start + rewrite.length };
}
