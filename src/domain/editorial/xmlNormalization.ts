/**
 * @module domain/editorial/xmlNormalization
 * Phase 1 of the Autonomous Editorial Harness: canonical XML scene normalization (`<SceneDocument>`),
 * denormalization back to prose, sentence splitting, speaker inference, and story scene enumeration.
 */

import type { CastMember } from '@/types';
import { decodeXmlEntities, escapeRegExp } from '@/utils';
import { isAudioDramaScriptText } from '@/domain/audio';
import { resolveCharacter } from '@/domain/story';

export interface HarnessLexiconRule {
    phrase: string;
    category: string;
    regex: string;
}

export interface HarnessSomaticPattern {
    id: string;
    label: string;
    regex: RegExp;
}

export interface NormalizedSentence {
    id: string;
    paragraphId: string;
    index: number;
    text: string;
    speaker_ref: string | null;
    wordCount: number;
}

export interface NormalizedParagraph {
    id: string;
    index: number;
    mode: 'DIALOGUE' | 'NARRATION';
    text: string;
    wordCount: number;
    sentences: NormalizedSentence[];
}

export interface NormalizedSceneDocument {
    sceneId: string;
    proseKey: string;
    seqIdx: number;
    sceneIdx: number;
    pov: string;
    xml: string;
    paragraphs: NormalizedParagraph[];
    wordCount: number;
}

export interface DraftedStorySceneItem {
    sceneId: string;
    proseKey: string;
    seqIdx: number;
    sceneIdx: number;
    displayCoord: string;
    title: string;
    actNum: number;
    seqNum: number;
    sceneMeta: Record<string, unknown>;
    seqMeta: Record<string, unknown>;
    proseText: string;
    normalized: NormalizedSceneDocument;
    startWordOffset: number;
    endWordOffset: number;
}

export interface EditorialStoryInput {
    id?: string;
    writing_mode?: string;
    book_type?: string;
    core_thematic_argument?: string;
    themes?: string;
    style?: {
        genre?: string;
        mood?: string;
        writing_guide?: string;
    };
    synthesized_authorial_persona?: string;
    genre_pacing_and_dialogue_rules?: string;
    strict_anti_patterns?: string;
    author_note?: string;
    cast?: Array<CastMember & Record<string, unknown>>;
    character_arcs?: Array<Record<string, unknown>>;
    acts?: Array<Record<string, unknown>>;
    sequences?: Array<Record<string, unknown>>;
    scenes?: Record<string, Array<Record<string, unknown>>>;
    prose?: Record<string, string | { final?: string; draft?: string; [key: string]: unknown }>;
    secret_vault?: Array<Record<string, unknown>>;
    lore?: Array<Record<string, unknown>>;
    continuity_ledger?: Array<Record<string, unknown>>;
    threads?: Array<Record<string, unknown>>;
    epistemic_graph?: Record<string, unknown> | null;
    settings?: { bannedPhrases?: string[]; [key: string]: unknown };
    bannedPhrases?: string[];
    editorial_harness?: {
        customConstitutionOverrides?: unknown;
        constitution?: {
            intentionalOverrides?: unknown;
            [key: string]: unknown;
        };
        novelignore?: unknown;
        [key: string]: unknown;
    } | null;
    [key: string]: unknown;
}

export const HARNESS_FORBIDDEN_SLOP_LEXICON: HarnessLexiconRule[] = [
    { phrase: 'a testament to', category: 'LLM_META_COMMENTARY', regex: '\\ba\\s+testament\\s+to\\b' },
    { phrase: 'delve into', category: 'LLM_META_COMMENTARY', regex: '\\bdelv(?:e|ed|ing)\\s+into\\b' },
    { phrase: 'tapestry of', category: 'LLM_CLICHE', regex: '\\btapestry\\s+of\\b' },
    { phrase: 'symphony of', category: 'LLM_CLICHE', regex: '\\bsymphony\\s+of\\b' },
    { phrase: 'kaleidoscope of', category: 'LLM_CLICHE', regex: '\\bkaleidoscope\\s+of\\b' },
    { phrase: "couldn't help but", category: 'FILTER_PAD', regex: "\\bcouldn['’]t\\s+help\\s+but\\b" },
    {
        phrase: "let out a breath they didn't know they were holding",
        category: 'SOMATIC_CLICHE',
        regex: "breath\\s+(?:he|she|they|i)\\s+didn['’]t\\s+(?:know|realize)"
    },
    { phrase: 'shiver ran down', category: 'SOMATIC_CLICHE', regex: '\\bshivers?\\s+(?:ran|sent|down)\\b' },
    { phrase: 'blood ran cold', category: 'SOMATIC_CLICHE', regex: '\\bblood\\s+ran\\s+cold\\b' },
    {
        phrase: 'palpable tension',
        category: 'TELLING_ABSTRACT',
        regex: '\\b(?:palpable\\s+tension|tension\\s+was\\s+palpable|thick\\s+with\\s+tension)\\b'
    },
    {
        phrase: 'unspoken understanding',
        category: 'SUBTEXT_SHORTCUT',
        regex: '\\bunspoken\\s+(?:understanding|agreement|bond|truth)\\b'
    },
    {
        phrase: 'a mixture of',
        category: 'EMOTIONAL_VAGUENESS',
        regex: '\\ba\\s+(?:strange\\s+)?(?:mixture|blend|combination)\\s+of\\s+\\w+\\s+and\\s+\\w+\\b'
    },
    {
        phrase: 'little did they know',
        category: 'POV_VIOLATION_CLICHE',
        regex: '\\blittle\\s+did\\s+(?:he|she|they)\\s+know\\b'
    }
];

export const HARNESS_FILTER_VERBS: string[] = [
    'saw',
    'heard',
    'felt',
    'realized',
    'wondered',
    'noticed',
    'seemed',
    'knew',
    'watched',
    'observed',
    'sensed',
    'thought',
    'decided',
    'remembered',
    'recognized'
];

export const HARNESS_SOMATIC_PATTERNS: HarnessSomaticPattern[] = [
    {
        id: 'breath_hitch',
        label: 'breath hitched / caught',
        regex: /\b(?:breath\s+(?:hitched|caught)|hitched\s+(?:his|her|their|my)\s+breath)\b/gi
    },
    {
        id: 'jaw_clench',
        label: 'jaw clenched / tightened',
        regex: /\b(?:jaw\s+(?:clenched|tightened|set|ticked)|clenched\s+(?:his|her|their|my)\s+jaw)\b/gi
    },
    {
        id: 'knuckles_white',
        label: 'knuckles whitened',
        regex: /\b(?:knuckles\s+(?:whitened|turned\s+white)|white-knuckled)\b/gi
    },
    {
        id: 'stomach_drop',
        label: 'stomach dropped / knotted',
        regex: /\b(?:stomach\s+(?:dropped|knotted|churned|plummeted)|pit\s+of\s+(?:his|her|their|my)\s+stomach)\b/gi
    },
    {
        id: 'heart_hammer',
        label: 'heart hammered / pounded',
        regex: /\b(?:heart\s+(?:hammered|pounded|thudded|raced|leapt)|pulse\s+(?:spiked|skittered|hammered))\b/gi
    },
    {
        id: 'bile_rose',
        label: 'bile rose',
        regex: /\b(?:bile\s+rose|metallic\s+taste\s+of\s+(?:fear|copper|blood))\b/gi
    }
];

/** Escapes XML attribute and text content safely for Editorial Harness XML artifacts. */
export function escapeHarnessXml(str: unknown): string {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Splits paragraph text into sentences while respecting common English abbreviations. */
export function splitProseIntoSentences(paragraphText: unknown): string[] {
    const clean = String(paragraphText || '').trim();
    if (!clean) return [];
    const abbrevs = new Set([
        'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'gen', 'col', 'maj', 'capt', 'lt', 'sgt', 'vs', 'etc', 'fig', 'no'
    ]);
    const rawMatches = clean.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|\s*$)/g) || [clean];
    const sentences: string[] = [];
    let carry = '';
    for (let i = 0; i < rawMatches.length; i++) {
        const seg = rawMatches[i].trim();
        if (!seg) continue;
        const words = seg.split(/\s+/);
        const lastWord = (words[words.length - 1] || '')
            .replace(/[.!?…"”'’)\]]/g, '')
            .toLowerCase();
        if (abbrevs.has(lastWord) && i < rawMatches.length - 1) {
            carry = carry ? `${carry} ${seg}` : seg;
            continue;
        }
        const full = carry ? `${carry} ${seg}` : seg;
        carry = '';
        sentences.push(full);
    }
    if (carry) sentences.push(carry);
    return sentences.length > 0 ? sentences : [clean];
}

/** Attributes a sentence to a dialogue speaker ID/name when quoted or Audio-Drama formatted. */
export function inferSpeakerForSentence(
    sentenceText: unknown,
    paragraphText: unknown,
    castList: ReadonlyArray<Partial<CastMember>> = [],
    lastSpeakerId: string | null = null
): string | null {
    const sTrim = String(sentenceText || '').trim();
    const dramaMatch = sTrim.match(/^([A-Z][A-Za-z0-9\s.'-]{1,30}):\s+/);
    if (dramaMatch) {
        const candidateName = dramaMatch[1].trim();
        if (candidateName.toLowerCase() === 'narrator') return null;
        const resolved = resolveCharacter(candidateName, castList as CastMember[]);
        return resolved ? resolved.id || resolved.name || candidateName : candidateName;
    }
    const hasQuotes = /["“”][^"“”]{2,}["“”]/.test(sTrim) || /^["“]/.test(sTrim) || /["”]$/.test(sTrim);
    if (!hasQuotes) return null;

    const speechVerbs =
        '(?:said|asked|replied|whispered|murmured|snapped|muttered|called|shouted|added|continued|answered|demanded|breathed|hissed|growled|sighed|noted|warned)';
    const pText = String(paragraphText || '');
    for (const c of castList || []) {
        if (!c || !c.name) continue;
        const firstName = c.name.split(/\s+/)[0];
        const escapedFull = escapeRegExp(c.name);
        const escapedFirst = escapeRegExp(firstName);
        const tagPattern = new RegExp(
            `(?:\\b(?:${escapedFull}|${escapedFirst})\\s+${speechVerbs}\\b|\\b${speechVerbs}\\s+(?:${escapedFull}|${escapedFirst})\\b|\\b(?:${escapedFull}|${escapedFirst})['’]?s\\s+voice\\b)`,
            'i'
        );
        if (tagPattern.test(sTrim) || tagPattern.test(pText)) {
            return c.id || c.name;
        }
    }
    for (const c of castList || []) {
        if (!c || !c.name) continue;
        const firstName = c.name.split(/\s+/)[0];
        if (new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'i').test(sTrim)) {
            return c.id || c.name;
        }
    }
    return lastSpeakerId || 'dialogue_speaker';
}

/** Collapses horizontal spaces while preserving single and double paragraph line breaks. */
export function normalizePreservingNewlines(text: unknown): string {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Normalizes scene prose into `<SceneDocument>` XML with paragraph & sentence coordinates. */
export function normalizeSceneToXml(
    seqIdx: number,
    sceneIdx: number,
    proseText: unknown,
    story: EditorialStoryInput = {}
): NormalizedSceneDocument {
    const sceneCoord = `sc_${seqIdx}_${sceneIdx}`;
    const rawProse = String(proseText || '')
        .replace(/\r\n/g, '\n')
        .trim();
    const isAudioDrama =
        story?.writing_mode === 'audio_drama' || isAudioDramaScriptText(rawProse);
    const paragraphs = rawProse
        ? isAudioDrama
            ? rawProse
                  .split(/\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean)
            : rawProse
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
        : [];
    const castList = Array.isArray(story?.cast) ? story.cast : [];
    const sceneMap = (story?.scenes || {}) as Record<string, Array<Record<string, unknown>>>;
    const sceneObj = (sceneMap[`${seqIdx}`] || sceneMap[String(seqIdx)] || [])[sceneIdx] || {};
    const povChar = String(sceneObj.pov_character || castList[0]?.name || 'Omniscient');

    const parsedParagraphs: NormalizedParagraph[] = [];
    const xmlLines: string[] = [
        `<SceneDocument id="${sceneCoord}" seq_idx="${seqIdx}" scene_idx="${sceneIdx}" title="${escapeHarnessXml(sceneObj.title || `Scene ${seqIdx + 1}.${sceneIdx + 1}`)}" pov="${escapeHarnessXml(povChar)}">`
    ];

    let lastSpeaker: string | null = null;
    paragraphs.forEach((pText, pIdx) => {
        const pId = `${sceneCoord}:p${pIdx + 1}`;
        const sents = splitProseIntoSentences(pText);
        const parsedSentences: NormalizedSentence[] = [];
        const hasDialogue =
            /["“”]/.test(pText) || /^[A-Z][A-Za-z0-9\s.'-]{1,25}:\s+/.test(pText);
        const discourseMode: 'DIALOGUE' | 'NARRATION' = hasDialogue ? 'DIALOGUE' : 'NARRATION';
        xmlLines.push(`  <p id="${pId}" mode="${discourseMode}">`);
        sents.forEach((sText, sIdx) => {
            const sId = `${pId}:s${sIdx + 1}`;
            const speakerRef = inferSpeakerForSentence(sText, pText, castList, lastSpeaker);
            if (speakerRef) lastSpeaker = speakerRef;
            const speakerAttr = speakerRef ? ` speaker_ref="${escapeHarnessXml(speakerRef)}"` : '';
            xmlLines.push(`    <s id="${sId}"${speakerAttr}>${escapeHarnessXml(sText)}</s>`);
            parsedSentences.push({
                id: sId,
                paragraphId: pId,
                index: sIdx + 1,
                text: sText,
                speaker_ref: speakerRef || null,
                wordCount: sText.split(/\s+/).filter(Boolean).length
            });
        });
        xmlLines.push('  </p>');
        parsedParagraphs.push({
            id: pId,
            index: pIdx + 1,
            mode: discourseMode,
            text: pText,
            wordCount: pText.split(/\s+/).filter(Boolean).length,
            sentences: parsedSentences
        });
    });

    xmlLines.push('</SceneDocument>');
    return {
        sceneId: sceneCoord,
        proseKey: `${seqIdx}-${sceneIdx}`,
        seqIdx,
        sceneIdx,
        pov: povChar,
        xml: xmlLines.join('\n'),
        paragraphs: parsedParagraphs,
        wordCount: parsedParagraphs.reduce((acc, p) => acc + p.wordCount, 0)
    };
}

/** Reconstructs clean manuscript prose text from a canonical `<SceneDocument>` XML string. */
export function denormalizeSceneFromXml(xmlStr: unknown): string {
    if (!xmlStr || typeof xmlStr !== 'string') return '';
    const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    const sRegex = /<s\b[^>]*>([\s\S]*?)<\/s>/gi;
    const paragraphs: string[] = [];
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRegex.exec(xmlStr)) !== null) {
        const innerP = pMatch[1];
        const sents: string[] = [];
        let sMatch: RegExpExecArray | null;
        sRegex.lastIndex = 0;
        while ((sMatch = sRegex.exec(innerP)) !== null) {
            const rawS = sMatch[1]
                .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
                .replace(/<\/?[a-zA-Z0-9_:-]+(?:\s+[^>]*)?>/g, '')
                .trim();
            const decoded = decodeXmlEntities(rawS);
            if (decoded) sents.push(decoded);
        }
        if (sents.length > 0) {
            const hasAudioDramaTurns =
                sents.length > 1 &&
                sents
                    .slice(1)
                    .some((s) =>
                        /^(?:[A-Za-z0-9_'\s[\]()*.-]{1,50}:\s+|\[(?:SFX|MUSIC|AMBIENCE|BEAT|PAUSE|VOICE|AUDIO)[^\]]*\]|\((?:SFX|MUSIC|AMBIENCE)[^)]*\))/i.test(
                            s.trim()
                        )
                    );
            paragraphs.push(sents.join(hasAudioDramaTurns ? '\n' : ' '));
        } else {
            const fallbackP = normalizePreservingNewlines(
                innerP
                    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/?[a-zA-Z0-9_:-]+(?:\s+[^>]*)?>/g, '')
            );
            const decodedP = decodeXmlEntities(fallbackP);
            if (decodedP) paragraphs.push(decodedP);
        }
    }
    if (paragraphs.length > 0) return paragraphs.join('\n\n');
    return normalizePreservingNewlines(
        xmlStr
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?[a-zA-Z0-9_:-]+(?:\s+[^>]*)?>/g, '')
    );
}

/** Enumerates all drafted scenes in reading order with normalized XML & cumulative word offsets. */
export function getDraftedStoryScenesList(story: EditorialStoryInput | null | undefined): DraftedStorySceneItem[] {
    const results: DraftedStorySceneItem[] = [];
    if (!story || !story.scenes) return results;
    const scenesMap = story.scenes as Record<string, Array<Record<string, unknown>>>;
    const seqCount = Math.max(
        Array.isArray(story.sequences) ? story.sequences.length : 0,
        Object.keys(scenesMap).length
    );
    let cumulativeWords = 0;
    for (let seqIdx = 0; seqIdx < seqCount; seqIdx++) {
        const sceneArr = scenesMap[`${seqIdx}`] || scenesMap[String(seqIdx)] || [];
        if (!Array.isArray(sceneArr)) continue;
        for (let sceneIdx = 0; sceneIdx < sceneArr.length; sceneIdx++) {
            const proseKey = `${seqIdx}-${sceneIdx}`;
            const proseObj = story.prose?.[proseKey];
            const proseText =
                typeof proseObj === 'string'
                    ? proseObj
                    : String(proseObj?.final || proseObj?.draft || '');
            if (proseText && proseText.trim().length > 20) {
                const normalized = normalizeSceneToXml(seqIdx, sceneIdx, proseText, story);
                const sceneMeta = sceneArr[sceneIdx] || {};
                const seqMeta = (story.sequences || [])[seqIdx] || {};
                const startWordOffset = cumulativeWords;
                cumulativeWords += normalized.wordCount;
                const seqNum = Number(seqMeta.number || seqIdx + 1);
                results.push({
                    sceneId: normalized.sceneId,
                    proseKey,
                    seqIdx,
                    sceneIdx,
                    displayCoord: `${seqNum}.${sceneIdx + 1}`,
                    title: String(sceneMeta.title || `Scene ${seqIdx + 1}.${sceneIdx + 1}`),
                    actNum: Number(seqMeta.parent_act || (seqIdx < 2 ? 1 : seqIdx < 6 ? 2 : 3)),
                    seqNum,
                    sceneMeta,
                    seqMeta,
                    proseText: proseText.trim(),
                    normalized,
                    startWordOffset,
                    endWordOffset: cumulativeWords
                });
            }
        }
    }
    return results;
}
