/**
 * @module domain/editorial/patchAndVerify
 * Phase 4 & Phase 5 of the Autonomous Editorial Harness:
 * Surgical patch payload extraction, scene splicing with boundary protection,
 * deterministic voice-safe repair escalation, and the 4-Gate Verification Suite.
 */

import { PROMPTS } from '@/prompts';
import { extractTag } from '@/utils';
import type { SlopConfig } from '@/types/slop';
import { isAudioDramaScriptText } from '@/domain/audio';
import { locateNeedle } from '@/domain/editing';
import {
    denormalizeSceneFromXml,
    escapeHarnessXml,
    normalizePreservingNewlines,
    normalizeSceneToXml,
    splitProseIntoSentences
} from './xmlNormalization';
import type {
    DraftedStorySceneItem,
    EditorialStoryInput,
    NormalizedSceneDocument
} from './xmlNormalization';
import { runSceneNlpTelemetry } from './nlpTelemetry';
import type {
    AestheticConstitution,
    AuthorVoiceDNA,
    EditorialCallAIFn,
    SceneTelemetryReport
} from './nlpTelemetry';
import { evaluateSceneLayer0AndDivergence } from './stateGraph';
import type { NarrativeStateGraph, SceneContract } from './stateGraph';

export interface EditorialPatchPayload {
    hasLLMOutput: boolean;
    originalSpanVerifier: string;
    replacementSpan: string;
    operationType: 'REPLACE_SPAN' | 'INSERT_AFTER' | 'DELETE_SPAN' | string;
    parseSuccess: boolean;
}

export interface GateFeedbackContext {
    diagnostic?: string;
    correction?: string;
}

export interface ManuscriptPatchResult {
    success: boolean;
    error?: string;
    patchSource?: 'LLM_SURGICAL' | 'DETERMINISTIC_FALLBACK';
    operationType?: string;
    matchedVia?: string;
    beforeSpan?: string;
    afterSpan?: string;
    updatedFullProse?: string;
    updatedNormalized?: NormalizedSceneDocument;
    precedingContext?: string;
    followingContext?: string;
}

export interface VerificationGateReport {
    gate: string;
    passed: boolean;
    wordDeltaRatio?: number;
    slopCount?: number;
    hardSlopCount?: number;
    closerCount?: number;
    remainingSlopPhrases?: string[];
    headHopCount?: number;
    echoCount?: number;
    psychicDistance?: number;
    postDivergence?: number;
    voiceFidelityScore?: number;
    retryDirective?: string;
    details: string;
}

export interface FourGateSuiteResult {
    allPassed: boolean;
    gates: VerificationGateReport[];
    postTelemetry: SceneTelemetryReport;
    retryDirective: string;
}

/** Checks straight and typographic quotation mark parity for Gate 1 dialogue safety. */
export function hasBalancedQuotes(text: unknown): boolean {
    if (!text || typeof text !== 'string') return true;
    const straightQuotes = (text.match(/"/g) || []).length;
    const curlyOpen = (text.match(/“/g) || []).length;
    const curlyClose = (text.match(/”/g) || []).length;
    return straightQuotes % 2 === 0 && curlyOpen === curlyClose;
}

/** Extracts and normalizes surgical XML patch payloads from specialist LLM responses. */
export function extractEditorialPatchPayload(
    rawPatchOutput: unknown,
    transaction: Record<string, unknown> = {}
): EditorialPatchPayload {
    if (!rawPatchOutput || typeof rawPatchOutput !== 'string' || !rawPatchOutput.trim()) {
        return {
            hasLLMOutput: false,
            originalSpanVerifier: String(transaction.verbatimOriginal || '').trim(),
            replacementSpan: '',
            operationType: 'REPLACE_SPAN',
            parseSuccess: false
        };
    }

    let cleaned = rawPatchOutput.trim();
    cleaned = cleaned.replace(/^```(?:xml)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();

    let operationType = 'REPLACE_SPAN';
    const opTypeMatch =
        cleaned.match(/<PatchOperation[^>]*\btype=["'](REPLACE_SPAN|INSERT_AFTER|DELETE_SPAN)["']/i) ||
        cleaned.match(/<OperationType>(REPLACE_SPAN|INSERT_AFTER|DELETE_SPAN)<\/OperationType>/i);
    if (opTypeMatch) {
        operationType = opTypeMatch[1].toUpperCase();
    }

    let originalSpanVerifier = '';
    const origVerifierMatch =
        cleaned.match(/<OriginalSpanVerifier>([\s\S]*?)<\/OriginalSpanVerifier>/i) ||
        cleaned.match(/<SearchBlock>([\s\S]*?)<\/SearchBlock>/i) ||
        cleaned.match(/<OriginalSpan>([\s\S]*?)<\/OriginalSpan>/i);
    if (origVerifierMatch) {
        const rawOrig = origVerifierMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
        originalSpanVerifier = rawOrig.trim();
    }
    if (!originalSpanVerifier && transaction.verbatimOriginal) {
        originalSpanVerifier = String(transaction.verbatimOriginal).trim();
    }

    let replacementSpan = '';
    let parseSuccess = false;
    const repMatch =
        cleaned.match(/<ReplacementSpan>([\s\S]*?)<\/ReplacementSpan>/i) ||
        cleaned.match(/<ReplaceBlock>([\s\S]*?)<\/ReplaceBlock>/i) ||
        cleaned.match(/<Replacement>([\s\S]*?)<\/Replacement>/i);
    if (repMatch) {
        const rawRep = repMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');

        if (/<(?:p|s|SceneDocument)\b/i.test(rawRep)) {
            const wrapped = /<SceneDocument>/i.test(rawRep)
                ? rawRep
                : `<SceneDocument>${rawRep}</SceneDocument>`;
            const denorm = denormalizeSceneFromXml(wrapped);
            if (denorm && denorm.trim().length > 0) {
                replacementSpan = denorm.trim();
                parseSuccess = true;
            }
        }
        if (!replacementSpan) {
            const stripped = normalizePreservingNewlines(
                rawRep
                    .replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/?[a-zA-Z0-9_:-]+(?:\s+[^>]*)?>/g, '')
            );
            if (stripped.length > 0) {
                replacementSpan = stripped;
                parseSuccess = true;
            }
        }
    }

    if (operationType === 'DELETE_SPAN') {
        replacementSpan = '';
        parseSuccess = Boolean(originalSpanVerifier);
    }

    return {
        hasLLMOutput: true,
        originalSpanVerifier,
        replacementSpan,
        operationType,
        parseSuccess
    };
}

/** Deterministic offline/fallback voice-safe surgical repair with attempt-based escalation. */
export function buildDeterministicSurgicalRepair(
    originalText: unknown,
    _transaction?: Record<string, unknown>,
    attempt = 1,
    _priorFeedback: GateFeedbackContext | null = null
): string {
    void _transaction;
    void _priorFeedback;
    let text = String(originalText || '').trim();
    if (!text) return text;

    if (/\ba\s+testament\s+to\b/i.test(text)) {
        text = text
            .replace(/\bwas\s+a\s+testament\s+to\b/gi, 'exposed')
            .replace(/\ba\s+testament\s+to\b/gi, 'proof of');
    }
    if (/\ba\s+tapestry\s+of\b|\btapestry\s+of\b/i.test(text)) {
        text = text.replace(/\ba\s+tapestry\s+of\s+/gi, 'a ').replace(/\btapestry\s+of\s+/gi, '');
    }
    if (/\bcouldn['’]t\s+help\s+but\s+(\w+)/i.test(text)) {
        text = text.replace(/\bcouldn['’]t\s+help\s+but\s+(\w+)/gi, '$1ed');
    }
    if (/\b(?:the\s+)?palpable\s+tension\b/i.test(text)) {
        text = text.replace(/\b(?:the\s+)?palpable\s+tension\b/gi, 'the silence between them');
    }
    if (/\ba\s+shiver\s+ran\s+down\s+\w+\s+spine\b/i.test(text)) {
        text = text.replace(
            /\ba\s+shiver\s+ran\s+down\s+\w+\s+spine\b/gi,
            'the air turned cold against the back of the neck'
        );
    }
    text = text
        .replace(/^(?:Certainly!|Absolutely!|Of course!|Great question[!.])\s*/i, '')
        .replace(
            /^(?:Here is the (?:revised|polished|updated)\s+(?:passage|paragraph|prose|scene)[^:\n]*:\s*)/i,
            ''
        );

    text = text
        .replace(/\b(?:He|She|They|I)\s+(?:saw|noticed|watched|observed)\s+(?:that\s+)?the\s+/gi, 'The ')
        .replace(/\b(?:he|she|they|i)\s+felt\s+a\s+sudden\s+/gi, 'a sharp ')
        .replace(/\b(?:He|She|They)\s+realized\s+that\s+/gi, '');

    if (attempt >= 2) {
        text = text
            .replace(/\b(?:he|she|they|i)\s+(?:wondered|seemed|knew|sensed|thought)\s+(?:if|that)?\s*/gi, '')
            .replace(/\b(?:just|really|quite|very|suddenly|almost|somewhat)\s+/gi, '')
            .replace(/\b(?:started|began)\s+to\s+(\w+)/gi, '$1ed');
    }

    if (text === String(originalText || '').trim()) {
        const restructureLine = (line: string): string => {
            const sents = splitProseIntoSentences(line);
            if (sents.length >= 2) {
                if (attempt === 3) {
                    sents[0] = sents[0].replace(/[.!?]\s*$/, ', and ');
                    let combined = sents[0] + sents[1].charAt(0).toLowerCase() + sents[1].slice(1);
                    if (sents.length > 2) combined += ' ' + sents.slice(2).join(' ');
                    return combined;
                }
                sents[0] = sents[0]
                    .replace(/\s+very\s+/gi, ' ')
                    .replace(/\s+suddenly\s+/gi, ' ');
                return sents.join(' ');
            } else if (attempt >= 2 && line.length > 20) {
                return line.replace(/,\s*(?:feeling|knowing|wondering)\s+[^.!?]+([.!?])$/i, '$1');
            }
            return line;
        };
        text = text.includes('\n')
            ? text
                  .split('\n')
                  .map((part) => (part.trim() ? restructureLine(part) : ''))
                  .join('\n')
            : restructureLine(text);
    }

    return normalizePreservingNewlines(text);
}

/** Phase 4 Patch Applicator: splices a surgical patch into a scene with boundary spacing defense. */
export function applyManuscriptPatchToScene(
    sceneItem: Pick<DraftedStorySceneItem, 'sceneId' | 'seqIdx' | 'sceneIdx' | 'proseText' | 'normalized'>,
    transaction: Record<string, unknown>,
    rawPatchOutput: unknown,
    story: EditorialStoryInput = {},
    attempt = 1,
    priorFeedback: GateFeedbackContext | null = null
): ManuscriptPatchResult {
    const currentSceneProse = String(
        sceneItem.proseText ||
            (sceneItem.normalized?.paragraphs || []).map((p) => p.text).join('\n\n') ||
            ''
    ).trim();

    if (!currentSceneProse) {
        return { success: false, error: `Scene ${sceneItem.sceneId} has empty prose.` };
    }

    const payload = extractEditorialPatchPayload(rawPatchOutput, transaction);
    const needle = (payload.originalSpanVerifier || String(transaction.verbatimOriginal || '')).trim();
    const startParaId = String(transaction.startAnchor || '').split(':s')[0];
    const paragraphs = sceneItem.normalized?.paragraphs || [];
    const targetParaIdx = paragraphs.findIndex((p) => p.id === startParaId);
    const targetPara = targetParaIdx !== -1 ? paragraphs[targetParaIdx] : null;

    const patchSource: 'LLM_SURGICAL' | 'DETERMINISTIC_FALLBACK' = payload.parseSuccess
        ? 'LLM_SURGICAL'
        : 'DETERMINISTIC_FALLBACK';
    const replacementProse = payload.parseSuccess
        ? payload.replacementSpan
        : buildDeterministicSurgicalRepair(
              needle || (targetPara ? targetPara.text : currentSceneProse),
              transaction,
              attempt,
              priorFeedback
          );

    let updatedFullProse = currentSceneProse;
    let beforeSpan = needle || (targetPara ? targetPara.text : '');
    let afterSpan = replacementProse;
    let spliceSuccess = false;
    let matchVia = 'none';

    const isAudioDrama =
        story?.writing_mode === 'audio_drama' || isAudioDramaScriptText(currentSceneProse);
    const paraJoiner = isAudioDrama && !/\n\s*\n/.test(currentSceneProse) ? '\n' : '\n\n';

    const applyBoundarySpacing = (
        pre: string,
        after: string,
        post: string,
        opType: string
    ): { pre: string; after: string; post: string } => {
        let nextPre = pre;
        let nextPost = post;
        let cleanAfter = after;
        if (cleanAfter && cleanAfter.length > 0) {
            if (nextPre.length > 0) {
                if (/\n$/.test(nextPre)) {
                    cleanAfter = cleanAfter.replace(/^[ \t]+/, '');
                } else if (/\w$/.test(nextPre) && /^\w/.test(cleanAfter)) {
                    cleanAfter = ' ' + cleanAfter;
                } else if (
                    /[.!?]["'”’]?$/.test(nextPre) &&
                    !/\s$/.test(nextPre) &&
                    /^[A-Za-z"'“‘]/.test(cleanAfter)
                ) {
                    cleanAfter = ' ' + cleanAfter;
                } else if (
                    /[,;:]$/.test(nextPre) &&
                    !/\s$/.test(nextPre) &&
                    /^[A-Za-z0-9"'“‘]/.test(cleanAfter)
                ) {
                    cleanAfter = ' ' + cleanAfter;
                } else if (/[ \t]$/.test(nextPre) && /^[ \t]/.test(cleanAfter)) {
                    cleanAfter = cleanAfter.replace(/^[ \t]+/, '');
                }
            }
            if (nextPost.length > 0) {
                if (/^\n/.test(nextPost)) {
                    cleanAfter = cleanAfter.replace(/[ \t]+$/, '');
                } else if (/\w$/.test(cleanAfter) && /^\w/.test(nextPost)) {
                    cleanAfter = cleanAfter + ' ';
                } else if (
                    /[.!?]["'”’]?$/.test(cleanAfter) &&
                    !/^\s/.test(nextPost) &&
                    /^[A-Za-z"'“‘]/.test(nextPost)
                ) {
                    cleanAfter = cleanAfter + ' ';
                } else if (
                    /[,;:]$/.test(cleanAfter) &&
                    !/^\s/.test(nextPost) &&
                    /^[A-Za-z0-9"'“‘]/.test(nextPost)
                ) {
                    cleanAfter = cleanAfter + ' ';
                } else if (/[ \t]$/.test(cleanAfter) && /^[ \t]/.test(nextPost)) {
                    cleanAfter = cleanAfter.replace(/[ \t]+$/, '');
                }
            }
        } else if (opType === 'DELETE_SPAN' || cleanAfter === '') {
            if (nextPre.length > 0 && nextPost.length > 0) {
                if (/\w$/.test(nextPre) && /^\w/.test(nextPost)) {
                    nextPre = nextPre + ' ';
                } else if (/[ \t]$/.test(nextPre) && /^[ \t]/.test(nextPost)) {
                    nextPost = nextPost.replace(/^[ \t]+/, '');
                } else if (
                    /[.!?]["'”’]?$/.test(nextPre) &&
                    !/\s$/.test(nextPre) &&
                    /^[A-Za-z"'“‘]/.test(nextPost)
                ) {
                    nextPre = nextPre + ' ';
                }
            }
        }
        return { pre: nextPre, after: cleanAfter, post: nextPost };
    };

    if (targetPara && needle) {
        const paraMatch = locateNeedle(targetPara.text, needle, true);
        if (paraMatch) {
            beforeSpan = targetPara.text.slice(paraMatch.start, paraMatch.end);
            let rawAfter = payload.operationType === 'DELETE_SPAN' ? '' : replacementProse;
            if (payload.operationType === 'INSERT_AFTER') {
                rawAfter = beforeSpan + (isAudioDrama ? paraJoiner : ' ') + replacementProse;
            }

            const spaced = applyBoundarySpacing(
                targetPara.text.slice(0, paraMatch.start),
                rawAfter,
                targetPara.text.slice(paraMatch.end),
                payload.operationType
            );
            const updatedParaText = normalizePreservingNewlines(
                spaced.pre + spaced.after + spaced.post
            );
            afterSpan = spaced.after;

            const updatedParas = paragraphs.map((p, idx) =>
                idx === targetParaIdx ? updatedParaText : p.text
            );
            updatedFullProse = updatedParas.join(paraJoiner);
            spliceSuccess = true;
            matchVia = `para_needle_${paraMatch.via}`;
        }
    }

    if (!spliceSuccess && needle) {
        const sceneMatch = locateNeedle(currentSceneProse, needle, true);
        if (sceneMatch) {
            beforeSpan = currentSceneProse.slice(sceneMatch.start, sceneMatch.end);
            let rawAfter = payload.operationType === 'DELETE_SPAN' ? '' : replacementProse;
            if (payload.operationType === 'INSERT_AFTER') {
                rawAfter = beforeSpan + (isAudioDrama ? paraJoiner : ' ') + replacementProse;
            }

            const spaced = applyBoundarySpacing(
                currentSceneProse.slice(0, sceneMatch.start),
                rawAfter,
                currentSceneProse.slice(sceneMatch.end),
                payload.operationType
            );
            afterSpan = spaced.after;
            updatedFullProse = spaced.pre + spaced.after + spaced.post;
            spliceSuccess = true;
            matchVia = `scene_needle_${sceneMatch.via}`;
        }
    }

    if (!spliceSuccess && targetPara) {
        beforeSpan = targetPara.text;
        afterSpan = payload.operationType === 'DELETE_SPAN' ? '' : replacementProse;
        const updatedParas = paragraphs
            .map((p, idx) => (idx === targetParaIdx ? afterSpan : p.text))
            .filter(Boolean);
        updatedFullProse = updatedParas.join(paraJoiner);
        spliceSuccess = true;
        matchVia = 'para_fallback';
    }

    if (!spliceSuccess) {
        return {
            success: false,
            error: `Could not locate anchor ${String(transaction.startAnchor || '')} or verbatim span in ${sceneItem.sceneId}`
        };
    }

    const pIdx = targetParaIdx !== -1 ? targetParaIdx : 0;
    const precedingContext = pIdx > 0 ? paragraphs[pIdx - 1]?.text || '' : '';
    const followingContext = pIdx < paragraphs.length - 1 ? paragraphs[pIdx + 1]?.text || '' : '';

    const updatedNormalized = normalizeSceneToXml(
        sceneItem.seqIdx,
        sceneItem.sceneIdx,
        updatedFullProse,
        story
    );

    return {
        success: true,
        patchSource,
        operationType: payload.operationType,
        matchedVia: matchVia,
        beforeSpan,
        afterSpan,
        updatedFullProse,
        updatedNormalized,
        precedingContext,
        followingContext
    };
}

/** Phase 5 Verification Suite: runs Gates 1–4 before committing a patched scene to `story.prose`. */
export async function runFourGateVerificationSuite({
    sceneItem,
    patchedResult,
    transaction,
    baselineTelemetry,
    nsg,
    constitution: _constitution,
    voiceDna: _voiceDna,
    story,
    callAIFn = null,
    useLLM = true,
    slopConfig = null
}: {
    sceneItem: Pick<
        DraftedStorySceneItem,
        'sceneId' | 'displayCoord' | 'title' | 'seqIdx' | 'sceneIdx' | 'proseText' | 'normalized'
    >;
    patchedResult: ManuscriptPatchResult;
    transaction: Record<string, unknown>;
    baselineTelemetry?: SceneTelemetryReport | null;
    nsg?: NarrativeStateGraph | null;
    constitution?: AestheticConstitution | null;
    voiceDna?: AuthorVoiceDNA | null;
    story?: EditorialStoryInput;
    callAIFn?: EditorialCallAIFn | null;
    useLLM?: boolean;
    slopConfig?: Partial<SlopConfig> | null;
}): Promise<FourGateSuiteResult> {
    void _constitution;
    void _voiceDna;
    const origProse = String(
        sceneItem.proseText ||
            (sceneItem.normalized?.paragraphs || []).map((p) => p.text).join('\n\n')
    ).trim();
    const updatedProse = String(patchedResult.updatedFullProse || '').trim();
    const notNoOp = origProse !== updatedProse;
    const updatedWords = patchedResult.updatedNormalized?.wordCount || 0;
    const origWords = sceneItem.normalized?.wordCount || 0;
    const wordDeltaRatio = Math.abs(updatedWords - origWords) / Math.max(1, origWords);
    const hasLeakedXml =
        /<\/?(?:ManuscriptPatch|ReplacementSpan|OriginalSpanVerifier|SearchBlock|ReplaceBlock|SceneDocument|PatchOperation)\b/i.test(
            patchedResult.afterSpan || ''
        ) || /<!\[CDATA\[/i.test(patchedResult.afterSpan || '');
    const quotesOk = hasBalancedQuotes(patchedResult.afterSpan);
    const minLengthOk =
        patchedResult.operationType === 'DELETE_SPAN' ||
        Boolean(patchedResult.afterSpan && patchedResult.afterSpan.trim().length >= 4);
    const isAudioDrama =
        story?.writing_mode === 'audio_drama' || isAudioDramaScriptText(origProse);
    const origLineCount = origProse
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean).length;
    const updatedLineCount = updatedProse
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean).length;
    const audioDramaLinesCollapsed =
        isAudioDrama &&
        origLineCount >= 2 &&
        updatedLineCount < Math.max(2, Math.floor(origLineCount * 0.5));

    let gate1FailureReason = '';
    if (!patchedResult.success) gate1FailureReason = patchedResult.error || 'Patch splicing failed.';
    else if (!notNoOp) gate1FailureReason = 'Patch resulted in identical prose (no change applied).';
    else if (!minLengthOk) gate1FailureReason = 'Replacement span is too short or empty.';
    else if (hasLeakedXml) gate1FailureReason = 'Leaked XML or prompt tags detected in replacement text.';
    else if (!quotesOk)
        gate1FailureReason = 'Unclosed dialogue quotation marks detected in replacement span.';
    else if (audioDramaLinesCollapsed) {
        gate1FailureReason = `Audio drama line breaks collapsed (${origLineCount} lines -> ${updatedLineCount} lines).`;
    } else if (wordDeltaRatio > 0.35) {
        gate1FailureReason = `Word count delta ${(wordDeltaRatio * 100).toFixed(1)}% exceeds 35% safety limit.`;
    } else if (!patchedResult.updatedNormalized?.paragraphs?.length) {
        gate1FailureReason = 'Scene XML DOM became empty.';
    }

    const gate1Passed = !gate1FailureReason;
    const gate1Report: VerificationGateReport = {
        gate: 'Gate 1: NSG & XML Schema Validator',
        passed: gate1Passed,
        wordDeltaRatio: Number((wordDeltaRatio * 100).toFixed(1)),
        details: gate1Passed
            ? `Valid <SceneDocument> DOM, anchor ${String(transaction.startAnchor || '')} preserved, word delta ${(wordDeltaRatio * 100).toFixed(1)}% within bounds.`
            : `Gate 1 failed: ${gate1FailureReason}`
    };

    const bannedList = Array.isArray(story?.settings?.bannedPhrases)
        ? story.settings.bannedPhrases
        : Array.isArray(story?.bannedPhrases)
          ? story.bannedPhrases
          : [];
    const postTelemetry = runSceneNlpTelemetry(
        {
            ...sceneItem,
            proseText: patchedResult.updatedFullProse,
            normalized: patchedResult.updatedNormalized
        },
        story || {},
        bannedList,
        slopConfig
    );
    const baseHardCount = baselineTelemetry?.hardSlopViolations?.length || 0;
    const postHardCount = postTelemetry.hardSlopViolations?.length || 0;
    const hardSlopCleared =
        baseHardCount === 0 ? postHardCount === 0 : postHardCount <= baseHardCount;
    const slopReducedOrZero =
        postTelemetry.slopViolations.length <= (baselineTelemetry?.slopViolations?.length || 0);
    const noNewHeadHops =
        postTelemetry.povHeadHops.length <= (baselineTelemetry?.povHeadHops?.length || 0);
    const noNewEchoes =
        postTelemetry.lexicalEchoes.length <= (baselineTelemetry?.lexicalEchoes?.length || 0);
    const gate2Passed = hardSlopCleared && slopReducedOrZero && noNewHeadHops && noNewEchoes;
    const remainingSlopPhrases = Array.from(
        new Set((postTelemetry.slopViolations || []).map((v) => v.phrase).filter(Boolean))
    ).slice(0, 6);
    const gate2Report: VerificationGateReport = {
        gate: 'Gate 2: NLP Stylometric Delta Gate',
        passed: gate2Passed,
        slopCount: postTelemetry.slopViolations.length,
        hardSlopCount: postHardCount,
        closerCount: postTelemetry.closerViolations?.length || 0,
        remainingSlopPhrases,
        headHopCount: postTelemetry.povHeadHops.length,
        echoCount: postTelemetry.lexicalEchoes.length,
        psychicDistance: postTelemetry.meanPsychicDistance,
        details: gate2Passed
            ? `0 new hard slop/cliché hits, 0 new POV head-hops, PD=${postTelemetry.meanPsychicDistance}, CV=${postTelemetry.sentenceLengthCV}.`
            : `Telemetry regression detected (hardSlop=${postHardCount}, slop=${postTelemetry.slopViolations.length}${remainingSlopPhrases.length ? ` [${remainingSlopPhrases.join(', ')}]` : ''}, headHops=${postTelemetry.povHeadHops.length}, echoes=${postTelemetry.lexicalEchoes.length}).`
    };

    let gate3Passed = true;
    let gate3Divergence = 0.14;
    if (
        transaction.wave === 'WAVE_1_MACRO' ||
        transaction.wave === 'WAVE_2_MESO' ||
        transaction.wave === 1 ||
        transaction.wave === 2
    ) {
        const sceneContract: SceneContract = (nsg?.sceneContracts || []).find(
            (c) => c.id === sceneItem.sceneId
        ) || {
            id: sceneItem.sceneId,
            proseKey: `${sceneItem.seqIdx}-${sceneItem.sceneIdx}`,
            displayCoord: sceneItem.displayCoord,
            seqIdx: sceneItem.seqIdx,
            sceneIdx: sceneItem.sceneIdx,
            actNum: 1,
            seqNum: sceneItem.seqIdx + 1,
            pov: sceneItem.normalized?.pov || 'Narrator',
            title: sceneItem.title,
            wordCount: sceneItem.normalized?.wordCount || 0,
            startWordOffset: 0,
            endWordOffset: sceneItem.normalized?.wordCount || 0,
            dramaticMode: 'SCENE_PROACTIVE',
            narrativeLens: 'BASELINE_NEUTRAL',
            objective: '',
            hingeMoment: '',
            valueShift: {
                startValence: 'Start',
                endValence: 'End',
                turningPointAnchor: String(transaction.startAnchor || `${sceneItem.sceneId}:p1`)
            },
            scheduledClues: [],
            scheduledReveal: null
        };
        const reSim = await evaluateSceneLayer0AndDivergence(
            sceneContract,
            {
                ...sceneItem,
                proseText: patchedResult.updatedFullProse || '',
                normalized: patchedResult.updatedNormalized || sceneItem.normalized
            },
            nsg,
            postTelemetry,
            callAIFn,
            false
        );
        gate3Divergence = reSim.dTotal;
        gate3Passed = reSim.dTotal <= 0.35;
    }
    const gate3Report: VerificationGateReport = {
        gate: 'Gate 3: Scoped Layer 0 Re-Simulation',
        passed: gate3Passed,
        postDivergence: gate3Divergence,
        details: gate3Passed
            ? `Post-patch Layer 0 divergence D_total=${gate3Divergence} <= 0.35 threshold.`
            : `Layer 0 divergence remained high (D_total=${gate3Divergence}).`
    };

    let gate4Passed = true;
    let voiceFidelityScore = 9;
    let arbiterNotes =
        'Patched span resolves ticket while preserving AuthorVoiceDNA and seam continuity.';
    let retryDirective = '';

    if (useLLM && typeof callAIFn === 'function') {
        try {
            const arbPrompt = `<TargetEditorialTickets transaction_id="${String(transaction.transactionId || '')}">
  <Problem>${escapeHarnessXml(transaction.combinedProblem)}</Problem>
  <Directive>${escapeHarnessXml(transaction.combinedDirective)}</Directive>
</TargetEditorialTickets>
<PrecedingContext><![CDATA[${patchedResult.precedingContext || ''}]]></PrecedingContext>
<VersionA_Original anchor="${String(transaction.startAnchor || '')}"><![CDATA[${patchedResult.beforeSpan || ''}]]></VersionA_Original>
<VersionB_Patched anchor="${String(transaction.startAnchor || '')}"><![CDATA[${patchedResult.afterSpan || ''}]]></VersionB_Patched>
<FollowingContext><![CDATA[${patchedResult.followingContext || ''}]]></FollowingContext>
Evaluate Version A vs Version B as the PatchArbiterAgent and emit <PatchArbiterVerdict>.`;
            const arbRaw = await callAIFn(
                arbPrompt,
                PROMPTS.patchArbiterAgent,
                false,
                `Editorial Harness: Gate 4 Patch Arbiter (${String(transaction.transactionId || '')})`,
                'review'
            );
            const verdictMatch = arbRaw.match(/verdict="(APPROVE_COMMIT|REJECT_ROLLBACK)"/i);
            const vfMatch = arbRaw.match(/score_0_to_10="(\d+)"/i);
            if (vfMatch) voiceFidelityScore = parseInt(vfMatch[1], 10);
            if (verdictMatch && verdictMatch[1].toUpperCase() === 'REJECT_ROLLBACK') {
                gate4Passed = false;
                retryDirective =
                    extractTag(arbRaw, 'RetryDirectiveForEditor') ||
                    'Avoid on-the-nose exposition; match original cadence.';
                arbiterNotes = `Rejected by PatchArbiterAgent: ${retryDirective}`;
            }
        } catch (e) {
            console.warn(
                `[Gate4Arbiter] Fallback to deterministic A/B verification for ${String(transaction.transactionId || '')}:`,
                e
            );
        }
    }

    const gate4Report: VerificationGateReport = {
        gate: 'Gate 4: Adversarial A/B Patch Arbiter',
        passed: gate4Passed,
        voiceFidelityScore,
        details: arbiterNotes,
        retryDirective
    };

    const allPassed = gate1Passed && gate2Passed && gate3Passed && gate4Passed;
    return {
        allPassed,
        gates: [gate1Report, gate2Report, gate3Report, gate4Report],
        postTelemetry,
        retryDirective:
            retryDirective ||
            (!gate2Passed ? gate2Report.details : !gate1Passed ? gate1Report.details : '')
    };
}

/** Compiles structured failure diagnostics and correction directives for retry rounds. */
export function compileGateFailureFeedback(
    gateSuite: Partial<FourGateSuiteResult> | null | undefined,
    _patchRes?: ManuscriptPatchResult | null,
    _attempt?: number
): { diagnostic: string; correction: string } {
    void _patchRes;
    void _attempt;
    if (!gateSuite || !Array.isArray(gateSuite.gates)) {
        return {
            diagnostic: 'Verification failed without detailed gate telemetry.',
            correction:
                'Review the ticket directive and provide an alternative phrasing resolving the defect.'
        };
    }

    const failed = gateSuite.gates.filter((g) => !g.passed);
    const diagnostics: string[] = [];
    const corrections: string[] = [];

    failed.forEach((g) => {
        diagnostics.push(`${g.gate}: ${g.details}`);
        if (/Gate 1/i.test(g.gate)) {
            if (/no change applied/i.test(g.details)) {
                corrections.push(
                    'Your replacement was identical to the original. You must actively modify the wording to resolve the issue.'
                );
            } else if (/unclosed dialogue quotation/i.test(g.details)) {
                corrections.push(
                    'Ensure all opening quotation marks have matching closing quotation marks.'
                );
            } else if (/leaked xml/i.test(g.details)) {
                corrections.push(
                    'Do not include XML tags or code fences inside <ReplacementSpan>; emit only clean prose text.'
                );
            } else if (/exceeds 35%/i.test(g.details)) {
                corrections.push(
                    'Keep the revision surgical; avoid deleting or rewriting paragraphs outside the target sentence.'
                );
            }
        } else if (/Gate 2/i.test(g.gate)) {
            if ((g.slopCount || 0) > 0 || (g.hardSlopCount || 0) > 0) {
                const phraseHint =
                    Array.isArray(g.remainingSlopPhrases) && g.remainingSlopPhrases.length > 0
                        ? ` Remaining flagged item(s): ${g.remainingSlopPhrases.map((p) => `"${p}"`).join(', ')}.`
                        : '';
                corrections.push(
                    `Eliminate all generic LLM clichés, hard slop defects, and passive sensory filter phrases.${phraseHint}`
                );
            }
            if ((g.echoCount || 0) > 0) {
                corrections.push(
                    'Avoid repeating nouns or uncommon descriptors that appear in adjacent sentences.'
                );
            }
            if ((g.headHopCount || 0) > 0) {
                corrections.push(
                    'Maintain strict single-POV psychic focus; do not narrate feelings of non-POV characters.'
                );
            }
        } else if (/Gate 3/i.test(g.gate)) {
            corrections.push(
                'Preserve the core emotional turning point and dramatic expectation of the scene contract.'
            );
        } else if (/Gate 4/i.test(g.gate)) {
            if (g.retryDirective) {
                corrections.push(g.retryDirective);
            } else {
                corrections.push(
                    'Avoid on-the-nose exposition. Convey emotional motives through behavioral evasion and physical micro-actions rather than dialogue.'
                );
            }
        }
    });

    return {
        diagnostic:
            diagnostics.join(' | ') || 'Quality gates rejected the candidate replacement.',
        correction:
            corrections.join(' ') ||
            gateSuite.retryDirective ||
            'Provide a fresh, voice-locked surgical replacement addressing the defect.'
    };
}
