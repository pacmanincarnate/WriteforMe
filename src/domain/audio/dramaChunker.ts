/**
 * @module domain/audio/dramaChunker
 * Cue classification, sub-turn splitting, duration estimation, and DP-optimal
 * 1-to-2 minute segment chunking for Audio Drama & Novel Drama-3 synthesis.
 */

import { drama3ToBreezeStore } from './vocalEvents';
import {
    cleanDialogueSpokenText,
    normalizeAudioDramaText,
    normalizeAudioDramaTextPreservingTags
} from './textNormalization';

export type ParentheticalClassification =
    | {
          kind: 'vocal_event';
          canonical: string;
          canonicalTags: string[];
          direction: string | null;
          score: number;
          raw: string;
      }
    | {
          kind: 'acting_direction';
          direction: string;
          score: number;
          raw: string;
      };

export interface ExtractedSpokenAndTags {
    cleanText: string;
    vocalEvents: string[];
    actingDirections: string[];
    breezeText: string;
    drama3Text: string;
}

export interface DramaTurnLike {
    index?: number;
    speaker?: string;
    speakerKey?: string;
    isNarrator?: boolean;
    text?: string;
    spokenText?: string;
    rawSpoken?: string;
    cleanText?: string;
    drama3Text?: string;
    wordCount?: number;
    paragraphIndex?: number;
    sourceLineIndex?: number;
    isSubTurn?: boolean;
    [key: string]: unknown;
}

export interface Drama3ChunkSettings {
    minSegmentSec?: number;
    targetSegmentSec?: number;
    maxSegmentSec?: number;
    hardMaxSegmentSec?: number;
    maxChunkWords?: number;
    maxSpeakersPerChunk?: number;
    sceneSeed?: number;
}

export interface Drama3Segment {
    chunkId: string;
    type: 'drama3_multi';
    engine: 'drama3_multi';
    isMultiSpeakerSegment: boolean;
    baseSeed: number;
    turns: Array<Record<string, unknown>>;
    speakers: string[];
    speaker: string;
    speakerKey: string | null;
    emotion: null;
    previewText: string;
    text: string;
    spokenText: string;
    wordCount: number;
    estimatedDurationSec: number;
    startsOnNarrator: boolean;
    splitReason: string;
    hasDialogue: boolean;
    isNarratorOnly: boolean;
}

/** Classifies a `[cue]` or `(cue)` string into a canonical vocal event or acting direction. */
export function classifyParentheticalTag(rawTag: string | null | undefined): ParentheticalClassification | null {
    if (!rawTag) return null;
    const resolved = drama3ToBreezeStore.resolveCue(rawTag);
    if (!resolved) return null;
    if (resolved.canonicalTag) {
        return {
            kind: 'vocal_event',
            canonical: resolved.canonicalTag,
            canonicalTags: resolved.canonicalTags,
            direction: resolved.instructStyle || null,
            score: resolved.score,
            raw: rawTag
        };
    }
    return {
        kind: 'acting_direction',
        direction: resolved.instructStyle || rawTag.replace(/^[[(]+|[\])]+$/g, '').trim(),
        score: resolved.score,
        raw: rawTag
    };
}

/** Extracts plain speech, Breeze 2 vocal events/directions, and normalized Drama-3 text. */
export function extractSpokenAndTags(rawSpokenText: unknown): ExtractedSpokenAndTags {
    if (!rawSpokenText) {
        return { cleanText: '', vocalEvents: [], actingDirections: [], breezeText: '', drama3Text: '' };
    }

    const scrubbed = String(rawSpokenText)
        .replace(/<\|(?:im_start|im_end|voice|text|interleave|speaker:\d+|semantic:[^|>]*)\|>/gi, '')
        .trim();

    const drama3Text = normalizeAudioDramaTextPreservingTags(scrubbed);

    const vocalEvents: string[] = [];
    const actingDirections: string[] = [];
    const addDirection = (dirStr: string) => {
        if (!dirStr) return;
        const trimmed = String(dirStr).trim();
        if (trimmed && !actingDirections.includes(trimmed)) {
            actingDirections.push(trimmed);
        }
    };

    const xmlTranslated = drama3ToBreezeStore.translateXmlToBreeze(scrubbed);
    for (const dir of xmlTranslated.xmlDirections) {
        addDirection(dir);
    }

    const tagRegex = /(\[[^\]]+\]|\([^()]+\))/g;
    let breezeText = xmlTranslated.text.replace(tagRegex, (match) => {
        const resolved = drama3ToBreezeStore.resolveCue(match);
        if (!resolved) return '';
        const emitted: string[] = [];
        if (resolved.canonicalTags && resolved.canonicalTags.length > 0) {
            for (const tag of resolved.canonicalTags) {
                vocalEvents.push(tag);
                emitted.push(tag);
            }
        }
        if (resolved.instructStyle) {
            addDirection(resolved.instructStyle);
        }
        return emitted.length > 0 ? ` ${emitted.join(' ')} ` : ' ';
    });

    breezeText = normalizeAudioDramaText(breezeText).replace(/\s{2,}/g, ' ').trim();
    if (!breezeText && vocalEvents.length > 0) {
        breezeText = vocalEvents.join(' ');
    }
    const cleanText = normalizeAudioDramaText(cleanDialogueSpokenText(scrubbed));

    return { cleanText, vocalEvents, actingDirections, breezeText, drama3Text };
}

/** Splits overly long narrator or character turns (> 85 words) on sentence boundaries. */
export function splitIntoSpokenSubTurns<T extends DramaTurnLike>(turn: T): T[] {
    const raw = String(turn.rawSpoken || turn.spokenText || turn.text || '');
    const wordCount = (raw.match(/\b\w+\b/g) || []).length;

    const maxWords = 85;
    const targetWords = 65;

    if (wordCount <= maxWords) {
        return [turn];
    }

    const sentenceBoundaryRegex = /([^.?!]+[.?!]+(?:\s+|$))/g;
    const sentences: string[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = sentenceBoundaryRegex.exec(raw)) !== null) {
        sentences.push(match[0]);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < raw.length) {
        const remainder = raw.slice(lastIndex).trim();
        if (remainder) sentences.push(remainder);
    }

    if (sentences.length <= 1) {
        return [turn];
    }

    const subTurns: T[] = [];
    let currentGroup: string[] = [];
    let currentWords = 0;

    sentences.forEach((sent) => {
        const sWords = (sent.match(/\b\w+\b/g) || []).length;
        if (currentWords + sWords > targetWords && currentWords > 0) {
            const groupText = currentGroup.join(' ').trim();
            subTurns.push({
                ...turn,
                index: turn.index,
                text: groupText,
                spokenText: groupText,
                rawSpoken: groupText,
                wordCount: currentWords,
                isSubTurn: true
            });
            currentGroup = [sent];
            currentWords = sWords;
        } else {
            currentGroup.push(sent);
            currentWords += sWords;
        }
    });

    if (currentGroup.length > 0) {
        const groupText = currentGroup.join(' ').trim();
        subTurns.push({
            ...turn,
            index: turn.index,
            text: groupText,
            spokenText: groupText,
            rawSpoken: groupText,
            wordCount: currentWords,
            isSubTurn: true
        });
    }

    return subTurns;
}

/**
 * Estimates spoken + acting duration (seconds) of a single parsed audio drama turn.
 */
export function estimateDramaTurnSeconds(turn: DramaTurnLike | null | undefined): number {
    if (!turn) return 0;
    const rawWords =
        typeof turn.wordCount === 'number'
            ? turn.wordCount
            : (String(turn.cleanText || turn.spokenText || turn.text || '').match(/\b\w+\b/g) || []).length;
    const rawSrc = String(turn.rawSpoken || turn.drama3Text || turn.text || '');
    const pauseHits = (
        rawSrc.match(/\[(?:pause|long\s+pause|short\s+pause|brief\s+pause|beat|silence)\]/gi) || []
    ).length;
    const bracketHits = (rawSrc.match(/\[[^\]]+\]/g) || []).length;
    const ellipsisHits = (rawSrc.match(/\.{3}|…/g) || []).length;
    const baseWps = turn.isNarrator ? 2.3 : 2.05;
    const sec =
        rawWords / baseWps +
        pauseHits * 0.9 +
        Math.max(0, bracketHits - pauseHits) * 0.55 +
        ellipsisHits * 0.35 +
        0.5;
    return Math.max(1.2, +sec.toFixed(2));
}

/**
 * Segments parsed audio drama turns into cohesive 1-to-2 minute multi-character Drama-3 blocks
 * using Dynamic Programming to strongly prefer clean Narrator staging boundaries.
 */
export function chunkAudioDramaTurns(
    turns: DramaTurnLike[] | null | undefined,
    settings: Drama3ChunkSettings = {}
): Drama3Segment[] {
    if (!turns || turns.length === 0) return [];

    const minSegmentSec =
        typeof settings?.minSegmentSec === 'number' && settings.minSegmentSec > 0
            ? settings.minSegmentSec
            : 60;
    const targetSegmentSec =
        typeof settings?.targetSegmentSec === 'number' && settings.targetSegmentSec > 0
            ? settings.targetSegmentSec
            : 90;
    const maxSegmentSec =
        typeof settings?.maxSegmentSec === 'number' && settings.maxSegmentSec > 0
            ? settings.maxSegmentSec
            : 120;
    const hardMaxSegmentSec =
        typeof settings?.hardMaxSegmentSec === 'number' && settings.hardMaxSegmentSec > 0
            ? settings.hardMaxSegmentSec
            : 135;
    const hardMaxChunkWords =
        typeof settings?.maxChunkWords === 'number' && settings.maxChunkWords > 0
            ? settings.maxChunkWords
            : 285;
    const maxSpeakersPerChunk =
        typeof settings?.maxSpeakersPerChunk === 'number' && settings.maxSpeakersPerChunk > 0
            ? settings.maxSpeakersPerChunk
            : 4;

    const expandedTurns: DramaTurnLike[] = [];
    turns.forEach((t) => {
        const subs = splitIntoSpokenSubTurns(t);
        subs.forEach((s) => expandedTurns.push(s));
    });

    const enriched = expandedTurns.map((t, idx) => {
        const isNarrator = !t.speaker || t.speaker.toLowerCase() === 'narrator';
        const rawSrc = String(t.rawSpoken || t.drama3Text || t.spokenText || t.text || '');
        const tagData = extractSpokenAndTags(rawSrc);
        const words = (tagData.cleanText.match(/\b\w+\b/g) || []).length;
        const spk = isNarrator ? 'Narrator' : t.speaker || 'Character';
        const turnObj = {
            turnIndex: idx,
            originalTurn: t,
            speaker: spk,
            speakerKey: spk,
            isNarrator,
            cleanText: tagData.cleanText,
            vocalEvents: tagData.vocalEvents,
            actingDirections: tagData.actingDirections,
            breezeText: tagData.breezeText,
            drama3Text: tagData.drama3Text,
            rawSpoken: rawSrc,
            wordCount: words,
            paragraphIndex: Number(t.paragraphIndex ?? 0),
            sourceLineIndex: Number(t.sourceLineIndex ?? idx),
            estimatedSec: 0
        };
        turnObj.estimatedSec = estimateDramaTurnSeconds(turnObj);
        return turnObj;
    });

    const n = enriched.length;
    if (n === 0) return [];

    const prefDur = new Array<number>(n + 1).fill(0);
    const prefWords = new Array<number>(n + 1).fill(0);
    const allSceneSpeakers = new Set<string>();
    for (let k = 0; k < n; k++) {
        prefDur[k + 1] = prefDur[k] + enriched[k].estimatedSec;
        prefWords[k + 1] = prefWords[k] + enriched[k].wordCount;
        allSceneSpeakers.add(enriched[k].speaker.trim().toLowerCase());
    }

    const totalDur = prefDur[n];
    const totalWords = prefWords[n];

    const makeSegment = (startIdx: number, endIdxExclusive: number, segIdx: number): Drama3Segment => {
        const chunkTurns = enriched.slice(startIdx, endIdxExclusive);
        const segWords = prefWords[endIdxExclusive] - prefWords[startIdx];
        const segDur = prefDur[endIdxExclusive] - prefDur[startIdx];
        const speakerList: string[] = [];
        const speakerSeen = new Set<string>();
        for (const ct of chunkTurns) {
            const spkNorm = ct.speaker.trim().toLowerCase();
            if (!speakerSeen.has(spkNorm)) {
                speakerSeen.add(spkNorm);
                speakerList.push(ct.speaker);
            }
        }
        const isSingleSpeaker = speakerList.length === 1;
        const speakerSummary = isSingleSpeaker
            ? speakerList[0]
            : speakerList.slice(0, 3).join(', ') +
              (speakerList.length > 3 ? ` +${speakerList.length - 3}` : '');
        const joinedClean = chunkTurns
            .map((ct) => (ct.cleanText || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();

        let splitReason = 'scene_end';
        if (endIdxExclusive < n) {
            const prevTurn = enriched[endIdxExclusive - 1];
            const nextTurn = enriched[endIdxExclusive];
            if (nextTurn.isNarrator) splitReason = 'narrator_boundary';
            else if (prevTurn.isNarrator) splitReason = 'post_narrator';
            else splitReason = 'duration_window';
        }

        return {
            chunkId: `chunk_${String(segIdx).padStart(3, '0')}`,
            type: 'drama3_multi',
            engine: 'drama3_multi',
            isMultiSpeakerSegment: true,
            baseSeed: settings?.sceneSeed || 42,
            turns: chunkTurns,
            speakers: speakerList,
            speaker: speakerSummary,
            speakerKey: isSingleSpeaker ? chunkTurns[0].speakerKey || chunkTurns[0].speaker : null,
            emotion: null,
            previewText: chunkTurns[0]?.cleanText || joinedClean,
            text: joinedClean,
            spokenText: joinedClean,
            wordCount: segWords,
            estimatedDurationSec: Math.round(segDur),
            startsOnNarrator: Boolean(chunkTurns[0]?.isNarrator),
            splitReason,
            hasDialogue: true,
            isNarratorOnly: chunkTurns.every((ct) => ct.isNarrator)
        };
    };

    if (totalWords <= hardMaxChunkWords && allSceneSpeakers.size <= maxSpeakersPerChunk) {
        if (totalDur <= maxSegmentSec || (totalDur <= hardMaxSegmentSec && totalDur - minSegmentSec < 45)) {
            return [makeSegment(0, n, 0)];
        }
    }

    const dpCost = new Array<number>(n + 1).fill(Infinity);
    const nextCut = new Array<number>(n + 1).fill(n);
    dpCost[n] = 0;

    for (let i = n - 1; i >= 0; i--) {
        const segSpeakers = new Set<string>();
        for (let j = i + 1; j <= n; j++) {
            segSpeakers.add(enriched[j - 1].speaker.trim().toLowerCase());
            const segDur = prefDur[j] - prefDur[i];
            const segWords = prefWords[j] - prefWords[i];

            if (j > i + 1) {
                if (
                    segDur > hardMaxSegmentSec ||
                    segWords > hardMaxChunkWords ||
                    segSpeakers.size > maxSpeakersPerChunk
                ) {
                    break;
                }
            }

            let durPenalty: number;
            if (segDur < minSegmentSec) {
                durPenalty =
                    i === 0 && j === n ? 0 : Math.pow((minSegmentSec - segDur) / 15, 2) * 42;
            } else if (segDur > maxSegmentSec) {
                durPenalty = Math.pow((segDur - maxSegmentSec) / 10, 2) * 32;
            } else {
                durPenalty = Math.pow((segDur - targetSegmentSec) / 30, 2) * 12;
            }

            let boundaryCost = 0;
            if (j < n) {
                const prev = enriched[j - 1];
                const next = enriched[j];
                const prevRaw = String(prev.cleanText || prev.rawSpoken || '').trim();
                const nextRaw = String(next.cleanText || next.rawSpoken || '').trim();

                if (next.isNarrator) {
                    boundaryCost -= 45;
                } else if (prev.isNarrator) {
                    boundaryCost -= 22;
                } else if (
                    next.paragraphIndex > prev.paragraphIndex + 1 &&
                    /[.!?]["”’']?$/.test(prevRaw)
                ) {
                    boundaryCost -= 10;
                }

                if (/(?:—|--)\s*$/.test(prevRaw) || /^\s*(?:—|--)/.test(nextRaw)) {
                    boundaryCost += 120;
                }
                if (prev.speaker === next.speaker) {
                    boundaryCost += 80;
                }
                if (/\?["”’']?\s*$/.test(prevRaw) && !next.isNarrator) {
                    boundaryCost += 35;
                }
            }

            const totalCost = durPenalty + boundaryCost + dpCost[j];
            if (totalCost < dpCost[i]) {
                dpCost[i] = totalCost;
                nextCut[i] = j;
            }
        }
    }

    const chunks: Drama3Segment[] = [];
    let cursor = 0;
    let segCounter = 0;
    while (cursor < n) {
        const cut = nextCut[cursor] > cursor ? nextCut[cursor] : cursor + 1;
        chunks.push(makeSegment(cursor, cut, segCounter++));
        cursor = cut;
    }
    return chunks;
}

/**
 * Segments Standard Novel prose into cohesive 1-to-2 minute Drama-3 blocks voiced by
 * the Breeze-2 anchored Narrator, avoiding mid-dialogue splits.
 */
export function chunkNovelProseForDrama3(
    proseText: unknown,
    settings: Drama3ChunkSettings = {}
): Drama3Segment[] {
    if (!proseText || typeof proseText !== 'string') return [];
    let plain = proseText.replace(/\r\n/g, '\n');
    plain = plain.replace(/^#+\s+/gm, '');
    plain = plain.replace(/^\s*[-*_]{3,}\s*$/gm, '');
    plain = plain.replace(/!\[.*?\]\(.*?\)/g, '');
    plain = plain.replace(/\[(.*?)\]\(.*?\)/g, '$1');
    plain = plain.replace(/\*\*([^*]+)\*\*/g, '$1');
    plain = plain.replace(/\*([^*]+)\*/g, '$1');
    plain = plain.replace(/__([^_]+)__/g, '$1');
    plain = plain.replace(/_([^_]+)_/g, '$1');
    plain = plain.replace(/`([^`]+)`/g, '$1');
    plain = plain.replace(/<[^>]+>/g, '');
    plain = plain.trim();
    if (!plain) return [];

    const minSegmentSec =
        typeof settings?.minSegmentSec === 'number' && settings.minSegmentSec > 0
            ? settings.minSegmentSec
            : 60;
    const targetSegmentSec =
        typeof settings?.targetSegmentSec === 'number' && settings.targetSegmentSec > 0
            ? settings.targetSegmentSec
            : 90;
    const maxSegmentSec =
        typeof settings?.maxSegmentSec === 'number' && settings.maxSegmentSec > 0
            ? settings.maxSegmentSec
            : 120;
    const hardMaxSegmentSec =
        typeof settings?.hardMaxSegmentSec === 'number' && settings.hardMaxSegmentSec > 0
            ? settings.hardMaxSegmentSec
            : 135;
    const hardMaxChunkWords =
        typeof settings?.maxChunkWords === 'number' && settings.maxChunkWords > 0
            ? settings.maxChunkWords
            : 285;

    const rawParagraphs = plain
        .split(/\n\s*\n+/)
        .map((p) => p.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);
    if (rawParagraphs.length === 0) return [];

    const units: Array<{ text: string; paragraphIndex: number }> = [];
    rawParagraphs.forEach((para, pIdx) => {
        const words = (para.match(/\b\w+\b/g) || []).length;
        if (words <= 140) {
            units.push({ text: para, paragraphIndex: pIdx });
            return;
        }
        const sentences = para.match(/[^.?!\u2026]+(?:[.?!\u2026]+["'\u201d\u2019]?|$)/g) || [para];
        let buf = '';
        let bufWords = 0;
        sentences.forEach((rawS) => {
            const s = rawS.trim();
            if (!s) return;
            const sw = (s.match(/\b\w+\b/g) || []).length;
            if (buf && bufWords + sw > 110) {
                units.push({ text: buf, paragraphIndex: pIdx });
                buf = s;
                bufWords = sw;
            } else {
                buf = buf ? buf + ' ' + s : s;
                bufWords += sw;
            }
        });
        if (buf) units.push({ text: buf, paragraphIndex: pIdx });
    });

    const enriched = units.map((u, idx) => {
        const cleanText = u.text;
        const words = (cleanText.match(/\b\w+\b/g) || []).length || 1;
        const hasQuotedDialogue = /["\u201c\u201d\u00ab\u00bb\u201e]/.test(cleanText);
        const isPureNarrative = !hasQuotedDialogue;
        const punctMatches = cleanText.match(/[,;:\u2014\u2013]|[.?!\u2026]/g) || [];
        const estimatedSec = Math.max(1.2, words / 2.35 + punctMatches.length * 0.16);
        return {
            turnIndex: idx,
            speaker: 'Narrator',
            speakerKey: 'Narrator',
            isNarrator: true,
            cleanText,
            breezeText: cleanText,
            drama3Text: cleanText,
            rawSpoken: cleanText,
            spokenText: cleanText,
            wordCount: words,
            paragraphIndex: u.paragraphIndex,
            hasQuotedDialogue,
            isPureNarrative,
            estimatedSec
        };
    });

    const n = enriched.length;
    if (n === 0) return [];

    const prefDur = new Array<number>(n + 1).fill(0);
    const prefWords = new Array<number>(n + 1).fill(0);
    for (let k = 0; k < n; k++) {
        prefDur[k + 1] = prefDur[k] + enriched[k].estimatedSec;
        prefWords[k + 1] = prefWords[k] + enriched[k].wordCount;
    }

    const totalDur = prefDur[n];
    const totalWords = prefWords[n];

    const makeSegment = (startIdx: number, endIdxExclusive: number, segIdx: number): Drama3Segment => {
        const chunkTurns = enriched.slice(startIdx, endIdxExclusive);
        const segWords = prefWords[endIdxExclusive] - prefWords[startIdx];
        const segDur = prefDur[endIdxExclusive] - prefDur[startIdx];
        const joinedClean = chunkTurns.map((ct) => ct.cleanText).filter(Boolean).join(' ').trim();

        let splitReason = 'scene_end';
        if (endIdxExclusive < n) {
            const prevTurn = enriched[endIdxExclusive - 1];
            const nextTurn = enriched[endIdxExclusive];
            if (nextTurn.isPureNarrative) splitReason = 'non_quote_narrative_boundary';
            else if (prevTurn.isPureNarrative) splitReason = 'post_narrative_boundary';
            else splitReason = 'duration_window';
        }

        return {
            chunkId: `chunk_${String(segIdx).padStart(3, '0')}`,
            type: 'drama3_multi',
            engine: 'drama3_multi',
            isMultiSpeakerSegment: false,
            baseSeed: settings?.sceneSeed || 42,
            turns: chunkTurns,
            speakers: ['Narrator'],
            speaker: 'Narrator',
            speakerKey: 'Narrator',
            emotion: null,
            previewText: chunkTurns[0]?.cleanText || joinedClean,
            text: joinedClean,
            spokenText: joinedClean,
            wordCount: segWords,
            estimatedDurationSec: Math.round(segDur),
            startsOnNarrator: true,
            splitReason,
            hasDialogue: chunkTurns.some((ct) => ct.hasQuotedDialogue),
            isNarratorOnly: true
        };
    };

    if (totalWords <= hardMaxChunkWords) {
        if (totalDur <= maxSegmentSec || (totalDur <= hardMaxSegmentSec && totalDur - minSegmentSec < 45)) {
            return [makeSegment(0, n, 0)];
        }
    }

    const dpCost = new Array<number>(n + 1).fill(Infinity);
    const nextCut = new Array<number>(n + 1).fill(n);
    dpCost[n] = 0;

    for (let i = n - 1; i >= 0; i--) {
        for (let j = i + 1; j <= n; j++) {
            const segDur = prefDur[j] - prefDur[i];
            const segWords = prefWords[j] - prefWords[i];
            if (j > i + 1 && (segDur > hardMaxSegmentSec || segWords > hardMaxChunkWords)) {
                break;
            }

            let durPenalty: number;
            if (segDur < minSegmentSec) {
                durPenalty =
                    i === 0 && j === n ? 0 : Math.pow((minSegmentSec - segDur) / 15, 2) * 42;
            } else if (segDur > maxSegmentSec) {
                durPenalty = Math.pow((segDur - maxSegmentSec) / 10, 2) * 32;
            } else {
                durPenalty = Math.pow((segDur - targetSegmentSec) / 30, 2) * 12;
            }

            let boundaryCost = 0;
            if (j < n) {
                const prev = enriched[j - 1];
                const next = enriched[j];
                const prevRaw = prev.cleanText;
                const nextRaw = next.cleanText;

                if (prev.isPureNarrative && next.isPureNarrative) boundaryCost -= 85;
                else if (next.isPureNarrative) boundaryCost -= 50;
                else if (prev.isPureNarrative) boundaryCost -= 35;
                if (prev.hasQuotedDialogue && next.hasQuotedDialogue) boundaryCost += 110;
                if (/(?:\u2014|--)\s*$/.test(prevRaw) || /^\s*(?:\u2014|--)/.test(nextRaw)) {
                    boundaryCost += 120;
                }
                if (/\?["\u201d\u2019']?\s*$/.test(prevRaw) && next.hasQuotedDialogue) {
                    boundaryCost += 50;
                }
            }

            const totalCost = durPenalty + boundaryCost + dpCost[j];
            if (totalCost < dpCost[i]) {
                dpCost[i] = totalCost;
                nextCut[i] = j;
            }
        }
    }

    const chunks: Drama3Segment[] = [];
    let cursor = 0;
    let segCounter = 0;
    while (cursor < n) {
        const cut = nextCut[cursor] > cursor ? nextCut[cursor] : cursor + 1;
        chunks.push(makeSegment(cursor, cut, segCounter++));
        cursor = cut;
    }
    return chunks;
}
