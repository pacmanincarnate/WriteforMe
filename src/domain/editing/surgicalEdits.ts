/**
 * @module domain/editing/surgicalEdits
 * Surgical prose, structural XML, and Audio Drama Voice Director patch engine
 * with 5-tier needle resolution, boundary spacing protection, and weighted-LCS change ratios.
 */

import { decodeXmlEntities } from '@/utils';
import {
    analyzeAudioDramaScriptFormatting,
    isAudioDramaScriptText,
    normalizeAudioDramaScriptWithReport
} from '@/domain/audio';

export interface NeedleLocation {
    start: number;
    end: number;
    via: 'exact' | 'trimmed' | 'normalized' | 'whitespace' | 'anchored';
}

export interface ParsedSurgicalEdit {
    index: number;
    type: 'rewrite_passage' | 'insert_after' | 'delete_passage' | 'search_replace' | string;
    search?: string;
    original?: string;
    anchor?: string;
    target?: string;
    replace?: string;
    rewritten?: string;
    content?: string;
    [key: string]: unknown;
}

export interface AppliedSurgicalEdit {
    index: number;
    type: string;
    matchedVia: string;
    before: string;
    after: string;
}

export interface FailedSurgicalEdit {
    index: number;
    type: string;
    needle: string;
    reason: string;
}

export interface RejectedVoiceDirectorEdit {
    index: number;
    type: string;
    needle: string;
    reason: string;
}

export interface SurgicalEditReport {
    text: string;
    edits: Array<Record<string, unknown>>;
    applied: AppliedSurgicalEdit[];
    failed: FailedSurgicalEdit[];
    summary: string;
}

export interface VoiceDirectorEditReport {
    text: string;
    edits: ParsedSurgicalEdit[];
    applied: AppliedSurgicalEdit[];
    rejected: RejectedVoiceDirectorEdit[];
    failed: FailedSurgicalEdit[];
    summary: string;
}

export const SURGICAL_MAX_CHANGE_RATIO = 0.6;

/** Locates a target substring across exact, trimmed, typography-normalized, whitespace-regex, and anchored tiers. */
export function locateNeedle(
    haystack: string,
    needle: string,
    allowAnchored = false
): NeedleLocation | null {
    if (typeof haystack !== 'string' || typeof needle !== 'string' || !needle.trim()) return null;
    let start = haystack.indexOf(needle);
    if (start !== -1) return { start, end: start + needle.length, via: 'exact' };
    const trimmed = needle.trim();
    start = haystack.indexOf(trimmed);
    if (start !== -1) return { start, end: start + trimmed.length, via: 'trimmed' };

    const normalize = (text: string): string =>
        text
            .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
            .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2026/g, '.')
            .replace(/[\u00a0\u2009\u202f]/g, ' ');
    const normalizedText = normalize(haystack);
    const normalizedNeedle = normalize(trimmed);
    start = normalizedText.indexOf(normalizedNeedle);
    if (start !== -1) return { start, end: start + normalizedNeedle.length, via: 'normalized' };

    const pattern = normalizedNeedle
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
    const match = new RegExp(pattern).exec(normalizedText);
    if (match) return { start: match.index, end: match.index + match[0].length, via: 'whitespace' };

    if (allowAnchored && normalizedNeedle.length >= 80) {
        const head = normalizedNeedle.slice(0, 40);
        const tail = normalizedNeedle.slice(-40);
        start = normalizedText.indexOf(head);
        if (start !== -1 && normalizedText.indexOf(head, start + 1) === -1) {
            const tailStart = normalizedText.indexOf(tail, start + head.length);
            const end = tailStart + tail.length;
            if (
                tailStart !== -1 &&
                normalizedText.indexOf(tail, tailStart + 1) === -1 &&
                end - start <= 3 * normalizedNeedle.length
            ) {
                return { start, end, via: 'anchored' };
            }
        }
    }
    return null;
}

/**
 * Word-level weighted LCS (two-row DP): share of `after`'s non-whitespace characters that are
 * not part of the longest common word subsequence with `before`.
 */
export function computeChangeRatio(before: string, after: string): number {
    const oldWords = String(before || '')
        .split(/\s+/)
        .filter(Boolean);
    const newWords = String(after || '')
        .split(/\s+/)
        .filter(Boolean);
    const afterChars = newWords.reduce((sum, word) => sum + word.length, 0);
    if (afterChars === 0) return 0;
    let prev = new Uint32Array(newWords.length + 1);
    let curr = new Uint32Array(newWords.length + 1);
    for (let i = 1; i <= oldWords.length; i++) {
        for (let j = 1; j <= newWords.length; j++) {
            curr[j] =
                oldWords[i - 1] === newWords[j - 1]
                    ? prev[j - 1] + newWords[j - 1].length
                    : Math.max(prev[j], curr[j - 1]);
        }
        [prev, curr] = [curr, prev];
    }
    const commonCharacters = prev[newWords.length];
    return (afterChars - commonCharacters) / afterChars;
}

/** Sequentially applies parsed prose surgical edits with boundary spacing protection. */
export function applyParsedEdits(
    originalText: string,
    edits: ParsedSurgicalEdit[]
): SurgicalEditReport {
    const report: SurgicalEditReport = {
        text: originalText,
        edits: edits as Array<Record<string, unknown>>,
        applied: [],
        failed: [],
        summary: ''
    };
    const fields: Record<string, [keyof ParsedSurgicalEdit, (keyof ParsedSurgicalEdit)?]> = {
        rewrite_passage: ['original', 'rewritten'],
        insert_after: ['anchor', 'content'],
        delete_passage: ['target'],
        search_replace: ['search', 'replace']
    };
    const ordered = [...edits];
    for (const edit of ordered) {
        const names = Object.prototype.hasOwnProperty.call(fields, edit.type)
            ? fields[edit.type]
            : null;
        const needle = names ? String(edit[names[0]] || '') : '';
        const fail = (reason: string): void => {
            report.failed.push({ index: edit.index, type: edit.type, needle, reason });
        };
        if (!names) {
            fail('unsupported edit type');
            continue;
        }
        if (!needle || !needle.trim()) {
            fail('missing or empty needle');
            continue;
        }
        const replacementKey = names[1];
        if (replacementKey && edit[replacementKey] === undefined) {
            fail(`missing ${String(replacementKey)}`);
            continue;
        }
        const match = locateNeedle(
            report.text,
            needle,
            edit.type === 'rewrite_passage' || edit.type === 'delete_passage'
        );
        if (!match) {
            fail('needle not found');
            continue;
        }
        const { start, end } = match;
        const before = report.text.slice(start, end);
        let after = edit.type === 'delete_passage' || !replacementKey ? '' : String(edit[replacementKey] ?? '');
        if (edit.type === 'insert_after') {
            let insertedContent = after;
            if (!needle.startsWith('\n') && !needle.startsWith('\r\n') && /^\r?\n[ \t]*/.test(insertedContent)) {
                insertedContent = insertedContent.replace(/^\r?\n[ \t]*/, '');
            }
            if (!needle.endsWith('\n') && !needle.endsWith('\r\n') && /\r?\n[ \t]*$/.test(insertedContent)) {
                insertedContent = insertedContent.replace(/\r?\n[ \t]*$/, '');
            }
            const trimmedInserted = insertedContent.replace(/^\s+/, '');
            const isInsertedSpeakerTurn = /^[A-Za-z0-9_'\s-]{1,40}:\s+/.test(trimmedInserted);
            const isBeforeAudioLine =
                /^[A-Za-z0-9_'\s-]{1,40}:\s+/.test(before.trim()) &&
                isAudioDramaScriptText(report.text);
            if (isInsertedSpeakerTurn || isBeforeAudioLine) {
                after = before.replace(/\s+$/, '') + '\n\n' + trimmedInserted;
            } else if (!/\s$/.test(before) && !/^\s/.test(insertedContent)) {
                after = before + ' ' + insertedContent;
            } else {
                after = before + insertedContent;
            }
        }

        if (typeof after === 'string' && after.length > 0) {
            if (!needle.startsWith('\n') && !needle.startsWith('\r\n') && /^\r?\n[ \t]*/.test(after)) {
                after = after.replace(/^\r?\n[ \t]*/, '');
            }
            if (!needle.endsWith('\n') && !needle.endsWith('\r\n') && /\r?\n[ \t]*$/.test(after)) {
                after = after.replace(/\r?\n[ \t]*$/, '');
            }
        }

        let pre = report.text.slice(0, start);
        let post = report.text.slice(end);

        if (after && after.length > 0) {
            if (start > 0) {
                if (/\w$/.test(pre) && /^\w/.test(after)) {
                    after = ' ' + after;
                } else if (/[.!?]["'”’]?$/.test(pre) && !/\s$/.test(pre) && /^[A-Za-z"'“‘]/.test(after)) {
                    after = ' ' + after;
                } else if (/[,;:]$/.test(pre) && !/\s$/.test(pre) && /^[A-Za-z0-9"'“‘]/.test(after)) {
                    after = ' ' + after;
                } else if (/\s$/.test(pre) && /^\s/.test(after)) {
                    after = after.replace(/^\s+/, ' ');
                    if (/\s$/.test(pre) && after.startsWith(' ')) {
                        after = after.slice(1);
                    }
                }
            }

            if (end < report.text.length) {
                if (/\w$/.test(after) && /^\w/.test(post)) {
                    after = after + ' ';
                } else if (/[.!?]["'”’]?$/.test(after) && !/^\s/.test(post) && /^[A-Za-z"'“‘]/.test(post)) {
                    after = after + ' ';
                } else if (/[,;:]$/.test(after) && !/^\s/.test(post) && /^[A-Za-z0-9"'“‘]/.test(post)) {
                    after = after + ' ';
                } else if (/\s$/.test(after) && /^\s/.test(post)) {
                    after = after.replace(/\s+$/, '');
                }
            }
        } else if (edit.type === 'delete_passage' || after === '') {
            if (start > 0 && end < report.text.length) {
                if (/\w$/.test(pre) && /^\w/.test(post)) {
                    pre = pre + ' ';
                } else if (/\s$/.test(pre) && /^\s/.test(post)) {
                    post = post.replace(/^\s+/, '');
                } else if (/[.!?]["'”’]?$/.test(pre) && !/\s$/.test(pre) && /^[A-Za-z"'“‘]/.test(post)) {
                    pre = pre + ' ';
                } else if (/[,;:]$/.test(pre) && !/\s$/.test(pre) && /^[A-Za-z0-9"'“‘]/.test(post)) {
                    pre = pre + ' ';
                }
            }
        }

        if (before === after) {
            fail('edit makes no change');
            continue;
        }
        report.text = pre + after + post;
        report.applied.push({
            index: edit.index,
            type: edit.type,
            matchedVia: match.via,
            before,
            after
        });
    }
    report.summary = `Surgical edits: ${report.applied.length} applied, ${report.failed.length} failed.`;
    return report;
}

/** Applies `<structural_edit>` XML commands (replace, delete, insert_after, truncate_after) to XML outlines. */
export function applyStructuralEdits(
    originalText: string,
    blocksText: string
): SurgicalEditReport {
    const report: SurgicalEditReport = {
        text: originalText,
        edits: [],
        applied: [],
        failed: [],
        summary: ''
    };
    const editRegex = /<structural_edit>([\s\S]*?)<\/structural_edit>/gi;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = editRegex.exec(blocksText)) !== null) {
        const block = match[1];
        const field = (name: string): string | undefined => {
            const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(block);
            if (!m) return undefined;
            const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
            return cdata ? cdata[1] : decodeXmlEntities(m[1]);
        };

        const action = (field('action') || 'replace').trim().toLowerCase();
        const targetTag = (field('target_tag') || '').trim();
        const idTag = (field('target_identifier_tag') || '').trim();
        const idValue = (field('target_identifier_value') || '').trim();
        const newContent = field('new_content') || '';

        const editObj = {
            index: index++,
            type: action,
            needle: `<${targetTag}>...<${idTag}>${idValue}</${idTag}>...</${targetTag}>`
        };
        report.edits.push(editObj);

        if (!targetTag || !idTag || !idValue) {
            report.failed.push({
                ...editObj,
                reason: 'Missing required tags (target_tag, target_identifier_tag, target_identifier_value).'
            });
            continue;
        }

        const elementRegex = new RegExp(`<${targetTag}>(?:[\\s\\S]*?)</${targetTag}>`, 'gi');
        let found = false;

        if (action === 'truncate_after' || action === 'delete_all_after') {
            let pastTarget = false;
            report.text = report.text.replace(elementRegex, (elementMatch) => {
                if (pastTarget) {
                    return '';
                }
                const idMatchRegex = new RegExp(
                    `<${idTag}>\\s*${idValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</${idTag}>`,
                    'i'
                );
                if (idMatchRegex.test(elementMatch)) {
                    found = true;
                    pastTarget = true;
                    return elementMatch;
                }
                return elementMatch;
            });
            if (found) {
                report.text = report.text.replace(
                    /<has_more>\s*true\s*<\/has_more>/gi,
                    '<has_more>false</has_more>'
                );
                report.applied.push({
                    index: editObj.index,
                    type: editObj.type,
                    matchedVia: 'structural_truncate',
                    before: '',
                    after: `Truncated all <${targetTag}> nodes after ${idValue}`
                });
            } else {
                report.failed.push({
                    ...editObj,
                    reason: `Could not find <${targetTag}> containing <${idTag}>${idValue}</${idTag}>`
                });
            }
            continue;
        }

        report.text = report.text.replace(elementRegex, (elementMatch) => {
            const idMatchRegex = new RegExp(
                `<${idTag}>\\s*${idValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</${idTag}>`,
                'i'
            );
            if (idMatchRegex.test(elementMatch)) {
                found = true;
                if (action === 'delete') {
                    return '';
                } else if (action === 'replace') {
                    return newContent;
                } else if (action === 'insert_after') {
                    return elementMatch + '\n' + newContent;
                }
            }
            return elementMatch;
        });

        if (found) {
            report.applied.push({
                index: editObj.index,
                type: editObj.type,
                matchedVia: 'structural_id',
                before: '',
                after: newContent
            });
        } else {
            report.failed.push({
                ...editObj,
                reason: `Could not find <${targetTag}> containing <${idTag}>${idValue}</${idTag}>`
            });
        }
    }
    report.summary = `Structural edits: ${report.applied.length} applied, ${report.failed.length} failed.`;
    return report;
}

/** Parses XML `<edit>`, `<surgical_patch>`, or `<search_replace>` blocks into typed edit items. */
export function _parseSurgicalEditXmlBlocks(blocksText: unknown): ParsedSurgicalEdit[] {
    const edits: ParsedSurgicalEdit[] = [];
    if (typeof blocksText !== 'string' || !blocksText) return edits;
    let blocks = Array.from(blocksText.matchAll(/<edit>([\s\S]*?)<\/edit>/gi), (m) => m[1]);
    blocks.push(
        ...Array.from(
            blocksText.matchAll(/<surgical_patch[\s\S]*?>([\s\S]*?)<\/surgical_patch>/gi),
            (m) => m[1]
        )
    );
    if (!blocks.length) {
        blocks = Array.from(
            blocksText.matchAll(/<search_replace>([\s\S]*?)<\/search_replace>/gi),
            (m) => m[1]
        );
    }
    if (!blocks.length && /<search>/i.test(blocksText)) blocks = [blocksText];
    for (const block of blocks) {
        const field = (name: string): string | undefined => {
            const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(block);
            if (!match) return undefined;
            const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(match[1]);
            return cdata ? cdata[1] : decodeXmlEntities(match[1]);
        };
        const edit: ParsedSurgicalEdit = { index: edits.length, type: '' };
        const needleFields = ['search', 'original', 'anchor', 'target'] as const;
        const replaceFields = ['replace', 'rewritten', 'content'] as const;
        for (const name of [...needleFields, ...replaceFields]) {
            const value = field(name);
            if (value !== undefined && ((replaceFields as readonly string[]).includes(name) || value.trim())) {
                edit[name] = value;
            }
        }
        edit.type =
            (field('type') || '').trim() ||
            (edit.search
                ? 'search_replace'
                : edit.original
                  ? 'rewrite_passage'
                  : edit.anchor
                    ? 'insert_after'
                    : edit.target
                      ? 'delete_passage'
                      : '');
        edits.push(edit);
    }
    return edits;
}

/** Dispatches structural or prose XML edit blocks and returns a detailed application report. */
export function applySurgicalEditsDetailed(
    originalText: string,
    blocksText: string
): SurgicalEditReport {
    if (typeof blocksText === 'string' && /<structural_edit>/i.test(blocksText)) {
        return applyStructuralEdits(originalText, blocksText);
    }
    const edits = _parseSurgicalEditXmlBlocks(blocksText);
    return applyParsedEdits(originalText, edits);
}

/**
 * Per-edit deterministic validator for the Audio Drama Voice Director Surgical Pass.
 * Enforces Narrator turn lock, 100% spoken-word invariance, and zero physical blocking
 * or malformed XML/parenthetical tags before committing each edit independently.
 */
export function applyVoiceDirectorSurgicalEdits(
    originalText: unknown,
    blocksText: unknown
): VoiceDirectorEditReport {
    const edits = _parseSurgicalEditXmlBlocks(blocksText);
    const report: VoiceDirectorEditReport = {
        text: String(originalText || ''),
        edits,
        applied: [],
        rejected: [],
        failed: [],
        summary: ''
    };
    if (!edits.length || !report.text) {
        report.summary = 'Voice Director: 0 applied, 0 rejected, 0 failed.';
        return report;
    }

    const extractSpokenWordTokens = (str: string): string[] => {
        const stripped = String(str || '')
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi, '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"');
        return stripped.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];
    };

    const extractNarratorLines = (str: string): string[] =>
        String(str || '')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => /^Narrator:\s*/i.test(l));

    for (const edit of edits) {
        if (edit.type !== 'search_replace' && edit.type !== 'rewrite_passage') {
            report.rejected.push({
                index: edit.index,
                type: edit.type,
                needle: edit.anchor || edit.target || '',
                reason: 'unsupported_for_voice_director'
            });
            continue;
        }

        const isRewrite = edit.type === 'rewrite_passage';
        const needle = isRewrite ? edit.original : edit.search;
        const rawAfter = isRewrite ? edit.rewritten : edit.replace;
        if (!needle || !needle.trim()) {
            report.failed.push({
                index: edit.index,
                type: edit.type,
                needle: '',
                reason: 'missing or empty needle'
            });
            continue;
        }
        if (rawAfter === undefined) {
            report.failed.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: `missing ${isRewrite ? 'rewritten' : 'replace'}`
            });
            continue;
        }

        const match = locateNeedle(report.text, needle, isRewrite);
        if (!match) {
            report.failed.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: 'needle not found'
            });
            continue;
        }

        const before = report.text.slice(match.start, match.end);
        let candidateAfter = String(rawAfter || '');
        if (!needle.startsWith('\n') && !needle.startsWith('\r\n') && /^\r?\n[ \t]*/.test(candidateAfter)) {
            candidateAfter = candidateAfter.replace(/^\r?\n[ \t]*/, '');
        }
        if (!needle.endsWith('\n') && !needle.endsWith('\r\n') && /\r?\n[ \t]*$/.test(candidateAfter)) {
            candidateAfter = candidateAfter.replace(/\r?\n[ \t]*$/, '');
        }

        const beforeNarr = extractNarratorLines(before);
        const afterNarr = extractNarratorLines(candidateAfter);
        const touchesNarrator =
            /^Narrator:\s*/i.test(before.trim()) ||
            /^Narrator:\s*/i.test(candidateAfter.trim()) ||
            beforeNarr.length !== afterNarr.length ||
            beforeNarr.some((line, i) => line !== afterNarr[i]);
        if (touchesNarrator) {
            report.rejected.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: 'narrator_turn_protected'
            });
            continue;
        }

        const fmtBefore = analyzeAudioDramaScriptFormatting(before);
        const fmtRawAfter = analyzeAudioDramaScriptFormatting(candidateAfter);
        if (fmtRawAfter.physicalBracketTags.length > fmtBefore.physicalBracketTags.length) {
            report.rejected.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: `physical_or_xml_violation: physical bracket cue (${fmtRawAfter.physicalBracketTags.join(', ')})`
            });
            continue;
        }

        const normEnv = normalizeAudioDramaScriptWithReport(
            `Narrator: __VD_ANCHOR__\n\n${candidateAfter}`
        );
        let cleanedAfter = normEnv.text.replace(/^Narrator:\s*__VD_ANCHOR__\s*/i, '').trim();
        if (!cleanedAfter) cleanedAfter = candidateAfter.trim();
        const fmtNormAfter = analyzeAudioDramaScriptFormatting(cleanedAfter);

        const introducedSyntaxViolation =
            normEnv.stats.physicalBracketsSplit > 0 ||
            fmtNormAfter.physicalBracketTags.length > fmtBefore.physicalBracketTags.length ||
            fmtNormAfter.invalidXmlTags.length > fmtBefore.invalidXmlTags.length ||
            fmtNormAfter.invalidParenTags.length > fmtBefore.invalidParenTags.length ||
            fmtNormAfter.foleyOrStageViolations > fmtBefore.foleyOrStageViolations;
        if (introducedSyntaxViolation) {
            report.rejected.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: 'physical_or_xml_violation'
            });
            continue;
        }

        const wordsBefore = extractSpokenWordTokens(before);
        const wordsAfter = extractSpokenWordTokens(cleanedAfter);
        const wordsIdentical =
            wordsBefore.length > 0 &&
            wordsBefore.length === wordsAfter.length &&
            wordsBefore.every((w, i) => w === wordsAfter[i]);
        if (!wordsIdentical) {
            report.rejected.push({
                index: edit.index,
                type: edit.type,
                needle,
                reason: `spoken_words_altered (${wordsBefore.length}w -> ${wordsAfter.length}w)`
            });
            continue;
        }

        const validatedEdit: ParsedSurgicalEdit = isRewrite
            ? { index: edit.index, type: 'rewrite_passage', original: before, rewritten: cleanedAfter }
            : { index: edit.index, type: 'search_replace', search: before, replace: cleanedAfter };
        const step = applyParsedEdits(report.text, [validatedEdit]);
        if (step.applied.length > 0) {
            report.text = step.text;
            report.applied.push(...step.applied);
        } else {
            report.failed.push(...step.failed);
        }
    }

    report.summary = `Voice Director: ${report.applied.length} applied, ${report.rejected.length} rejected, ${report.failed.length} failed.`;
    return report;
}
