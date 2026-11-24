/**
 * @module domain/audio/scriptParser
 * Audio Drama script validation, expressiveness scoring, 7-pass deterministic normalizer,
 * narrator block/segment collapsing, structured parser, dialogue stats, and timeline cue expansion.
 */

import {
    chunkProseForTts,
    cleanDialogueSpokenText,
    computeCueTextWeight,
    splitLongCueText,
    splitSpokenTextIntoTtsSubchunks
} from './textNormalization';
import { classifyParentheticalTag, extractSpokenAndTags } from './dramaChunker';

export interface DramaScriptTurnInput {
    speaker?: string;
    text?: string;
    spokenText?: string;
    cleanText?: string;
    [key: string]: unknown;
}

export interface DramaScriptSegmentLike {
    speaker?: string;
    text?: string;
    spokenText?: string;
    turns?: DramaScriptTurnInput[];
    [key: string]: unknown;
}

export interface TimelineCuePoint {
    index: number;
    startSec: number;
    endSec: number;
    text: string;
    spokenText: string;
    speaker: string;
}

export interface AudioDramaFormattingAnalysis {
    rawLines: string[];
    speakerLineCount: number;
    narratorLineCount: number;
    consecutiveNarratorRuns: number;
    consecutiveNarratorPairs: number;
    consecutiveSameSpeakerRuns: number;
    foleyOrStageViolations: number;
    physicalBracketTags: string[];
    abbreviatedBracketTags: string[];
    invalidParenTags: string[];
    invalidXmlTags: string[];
}

export interface FlatSingleWordCueSample {
    lineNumber: number;
    speaker: string;
    cue: string;
    preview: string;
}

export interface UntaggedTurnSample {
    lineNumber: number;
    speaker: string;
    spokenWords: number;
    preview: string;
}

export interface AudioDramaExpressivenessReport {
    totalTurns: number;
    narratorTurns: number;
    characterTurns: number;
    directedTurns: number;
    directedRatio: number;
    richCueTurns: number;
    richCueRatio: number;
    actingCueCount: number;
    flatSingleWordCueCount: number;
    midLineShiftCount: number;
    soundPauseCount: number;
    xmlTagCount: number;
    distinctXmlTagCount: number;
    xmlTagBreakdown: Record<string, number>;
    flatSingleWordCues: FlatSingleWordCueSample[];
    untaggedTurnSamples: UntaggedTurnSample[];
    deficits: string[];
    score: number;
    needsDirectionPass: boolean;
    summary: string;
    auditBlock: string;
}

export interface NormalizedDramaScriptStats {
    linesNormalized: number;
    parensConverted: number;
    asteriskEmotesConverted: number;
    markdownTagsConverted: number;
    xmlSynonymsMapped: number;
    invalidXmlConverted: number;
    xmlAutoBalanced: number;
    physicalBracketsSplit: number;
    sfxRepaired: number;
}

export interface NormalizedDramaScriptResult {
    text: string;
    changed: boolean;
    stats: NormalizedDramaScriptStats;
}

export interface ParsedDramaChunk {
    index: number;
    speaker: string;
    emotion: string | null;
    text: string;
    spokenText: string;
    rawSpoken: string;
    breezeText: string;
    drama3Text: string;
    isContinuation: boolean;
    fullLine: string;
    wordCount: number;
    paragraphIndex: number;
    sourceLineIndex: number;
    [key: string]: unknown;
}

export interface ParseAudioDramaOptions {
    raw?: boolean;
    collapseNarrator?: boolean;
}

export interface ExtractDialogueStatsOptions {
    isAudioDrama?: boolean | null;
}

export interface DialogueStatsResult {
    dialogueWords: number;
    narratorWords: number;
    spokenTotalWords: number;
    totalWords: number;
    dialogueRatio: number;
    dialoguePercentage: string;
    isAudioDrama: boolean;
}

/** Expands turns within a rendered segment into proportionally timed cue points. */
export function expandSegmentTurnsToCues(
    chunk: DramaScriptSegmentLike | null | undefined,
    segStartSec: number,
    segEndSec: number
): TimelineCuePoint[] {
    const start = Math.max(0, Number(segStartSec) || 0);
    const end = Math.max(start + 0.1, Number(segEndSec) || start + 1);
    const turns = Array.isArray(chunk?.turns) && chunk.turns.length > 0 ? chunk.turns : null;
    const rawCues: Array<{ text: string; spokenText: string; speaker: string }> = [];

    if (turns) {
        turns.forEach((t) => {
            const spk = t.speaker || 'Narrator';
            const txt = String(t.cleanText || t.spokenText || t.text || '').trim();
            if (!txt) return;
            const parts =
                !t.speaker || String(spk).toLowerCase() === 'narrator'
                    ? splitLongCueText(txt, 220)
                    : [txt];
            parts.forEach((part) => rawCues.push({ text: part, spokenText: part, speaker: spk }));
        });
    } else {
        const txt = String(chunk?.spokenText || chunk?.text || '').trim();
        if (txt) {
            const spk = chunk?.speaker || 'Narrator';
            splitLongCueText(txt, 220).forEach((part) =>
                rawCues.push({ text: part, spokenText: part, speaker: spk })
            );
        }
    }

    if (rawCues.length === 0) return [];
    const weights = rawCues.map((c) => computeCueTextWeight(c.text));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || rawCues.length;
    const span = end - start;
    let cursor = start;

    return rawCues.map((c, idx) => {
        const frac = weights[idx] / totalWeight;
        const cueStart = cursor;
        const cueEnd = idx === rawCues.length - 1 ? end : Math.min(end, cursor + span * frac);
        cursor = cueEnd;
        return {
            index: idx,
            startSec: Number(cueStart.toFixed(3)),
            endSec: Number(cueEnd.toFixed(3)),
            text: c.text,
            spokenText: c.spokenText,
            speaker: c.speaker
        };
    });
}

export const CANONICAL_AUDIO_DRAMA_VOCAL_TAGS = new Set([
    'laughs',
    'chuckles',
    'giggles',
    'crying',
    'sobs',
    'whimpers',
    'groans',
    'moans',
    'sighs',
    'gasps',
    'inhales',
    'exhales',
    'breathing heavily',
    'whispers',
    'shouts',
    'screams',
    'singing',
    'humming',
    'stutters',
    'pause',
    'clears throat',
    'coughs',
    'sniffs',
    'smacks lips',
    'clicks tongue',
    'yawns',
    'sneezes',
    'hiccups',
    'burps',
    'gulps',
    'gags',
    'grunts',
    'scoffs',
    'snorts'
]);

export const DRAMA3_SCOPED_TAGS = new Set([
    'whisper',
    'emphasis',
    'stress',
    'soft',
    'fast',
    'slow',
    'forceful'
]);

const DRAMA3_XML_TAG_SYNONYMS: Record<string, string> = {
    whispers: 'whisper',
    whispering: 'whisper',
    hushed: 'whisper',
    emph: 'emphasis',
    emphasized: 'emphasis',
    strong: 'emphasis',
    b: 'emphasis',
    stressed: 'stress',
    em: 'stress',
    i: 'stress',
    italic: 'stress',
    softly: 'soft',
    quiet: 'soft',
    quietly: 'soft',
    gentle: 'soft',
    gently: 'soft',
    quickly: 'fast',
    rapid: 'fast',
    hurried: 'fast',
    hurried_speech: 'fast',
    slowly: 'slow',
    deliberate: 'slow',
    drawl: 'slow',
    loud: 'forceful',
    shouting: 'forceful',
    shouted: 'forceful',
    yell: 'forceful',
    firm: 'forceful'
};

const VOCAL_EVENT_SYNONYM_MAP: Record<string, string> = {
    laugh: 'laughs',
    laughing: 'laughs',
    'laughs softly': 'laughs',
    'laughs aloud': 'laughs',
    chuckle: 'chuckles',
    chuckling: 'chuckles',
    'chuckles softly': 'chuckles',
    'chuckles darkly': 'chuckles',
    giggle: 'giggles',
    giggling: 'giggles',
    'giggles softly': 'giggles',
    cry: 'crying',
    cries: 'crying',
    'crying softly': 'crying',
    sob: 'sobs',
    sobbing: 'sobs',
    whimper: 'whimpers',
    whimpering: 'whimpers',
    groan: 'groans',
    groaning: 'groans',
    'groaning softly': 'groans',
    moan: 'moans',
    moaning: 'moans',
    'moans softly': 'moans',
    sigh: 'sighs',
    sighing: 'sighs',
    'heavy sigh': 'sighs',
    'deep sigh': 'sighs',
    'soft sigh': 'sighs',
    'sighs heavily': 'sighs',
    'sighs deeply': 'sighs',
    'sighs softly': 'sighs',
    gasp: 'gasps',
    gasping: 'gasps',
    'sharp gasp': 'gasps',
    inhale: 'inhales',
    inhaling: 'inhales',
    'sharp inhale': 'inhales',
    exhale: 'exhales',
    exhaling: 'exhales',
    'long exhale': 'exhales',
    'sharp exhale': 'exhales',
    'heavy breathing': 'breathing heavily',
    'breathes heavily': 'breathing heavily',
    panting: 'breathing heavily',
    pants: 'breathing heavily',
    whisper: 'whispers',
    whispering: 'whispers',
    'whispers softly': 'whispers',
    shout: 'shouts',
    shouting: 'shouts',
    scream: 'screams',
    screaming: 'screams',
    sing: 'singing',
    sings: 'singing',
    hum: 'humming',
    hums: 'humming',
    'humming softly': 'humming',
    stutter: 'stutters',
    stuttering: 'stutters',
    stammer: 'stutters',
    stammers: 'stutters',
    stammering: 'stutters',
    pauses: 'pause',
    'short pause': 'pause',
    'long pause': 'pause',
    'brief pause': 'pause',
    beat: 'pause',
    'clear throat': 'clears throat',
    'clearing throat': 'clears throat',
    'clears his throat': 'clears throat',
    'clears her throat': 'clears throat',
    'clears their throat': 'clears throat',
    cough: 'coughs',
    coughing: 'coughs',
    sniff: 'sniffs',
    sniffing: 'sniffs',
    sniffling: 'sniffs',
    sniffles: 'sniffs',
    'smack lips': 'smacks lips',
    'smacking lips': 'smacks lips',
    'click tongue': 'clicks tongue',
    'clicking tongue': 'clicks tongue',
    'clicks his tongue': 'clicks tongue',
    'clicks her tongue': 'clicks tongue',
    tsk: 'clicks tongue',
    tsks: 'clicks tongue',
    yawn: 'yawns',
    yawning: 'yawns',
    sneeze: 'sneezes',
    sneezing: 'sneezes',
    hiccup: 'hiccups',
    hiccuping: 'hiccups',
    burp: 'burps',
    burping: 'burps',
    gulp: 'gulps',
    gulping: 'gulps',
    gag: 'gags',
    gagging: 'gags',
    grunt: 'grunts',
    grunting: 'grunts',
    scoff: 'scoffs',
    scoffing: 'scoffs',
    'scoffs softly': 'scoffs',
    snort: 'snorts',
    snorting: 'snorts'
};

// Acoustic/vocal-tract and listener-context idioms valid inside Drama-3 [cues] despite mentioning body/room metaphors
const DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE =
    /\b(?:through gritted teeth|with clenched (?:jaw|teeth)|tight[- ]jawed|forcing a (?:thin )?smile|with a (?:wry |cold |bitter |thin )?smile in (?:his|her|their) voice|voice (?:drops?|dropping|breaks?|breaking|cracks?|cracking|trembles?|trembling|shakes?|shaking|tight(?:ens?|ening)?|harden(?:s|ing)?|soften(?:s|ing)?|ris(?:es?|ing)|fad(?:es?|ing)|trails?\s+off|thin(?:ning)?|thick with [^,.;]+|low|quiet|soft|flat|cold|hard|hoarse|raspy|strained|steady|warm|bright|rough|hollow|barely above a whisper)|dropping\s+(?:low|quiet(?:ly)?|soft(?:ly)?|(?:his|her|their)\s+voice|to\s+(?:a\s+)?[^,.;]+)|(?:lowering|raising)\s+(?:his|her|their)\s+voice|keeping (?:his|her|their) voice down|under (?:his|her|their) breath|barely holding it together|barely audible|close to (?:the )?mic|mouth dry|dry swallow|swallowing hard|(?:shaky|ragged|short|uneven|shallow) breath|catching (?:his|her|their) breath|holding (?:his|her|their) breath|sharp intake of breath|(?:long|soft|shaky|heavy|deep|sharp) (?:exhale|inhale|sigh|breath)|choked (?:laugh|sob|voice|tone|chuckle)|half[- ]laughing|clears? (?:his|her|their )?throat|stopping\s+short|cutting\s+(?:himself|herself|themselves)\s+off|catching\s+(?:himself|herself|themselves)|(?:so|lest)\s+(?:the\s+)?[a-z\s]{1,36}?(?:do\s+not|don't|doesn't|won't|can't|cannot)\s+hear(?:\s+(?:him|her|them|us|it))?|next\s+door|(?:calling|speaking|shouting|yelling|talking|whispering|murmuring|muttering)\s+(?:across|through|over|down|up|from|into|behind)\s+(?:the\s+)?(?:room|hall|hallway|door|doorway|window|table|desk|counter|wall|floor|stairs|staircase|phone|radio|comms|intercom|line)|(?:over|on|through)\s+(?:the\s+)?(?:phone|radio|comms|intercom|line|speaker))\b/i;
const DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE_G = new RegExp(
    DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE.source,
    'gi'
);

const AUDIO_DRAMA_BRACKET_PHYSICAL_RE =
    /\b(?:slump(?:ing|ed|s)|collaps(?:ing|ed|es)|rubb(?:ing|ed|s)|pac(?:ing|ed|es)|glanc(?:ing|es?|ed)|star(?:ing|es?|ed)|gaz(?:ing|es?|ed)|blink(?:ing|s|ed)|wink(?:ing|s|ed)|nodd(?:ing|s|ed)|shrugg(?:ing|s|ed)|lung(?:ing|es?|ed)|slam(?:ming|s|med)|patt(?:ing|ed)|pats|gestur(?:ing|es?|ed)|frown(?:ing|s|ed)|smirk(?:ing|s|ed)|grin(?:ning|s|ned)|wip(?:ing|es|ed)|grab(?:bing|s|bed)|clutch(?:ing|es|ed)|button(?:ing|s|ed)|unbutton(?:ing|s|ed)|taps?|tapping|tapped)\b|\b(?:settl(?:ing|es?|ed)\s+(?:into|onto|back|down)|drop(?:ping|ped|s)\s+(?:into|onto|down\s+(?:into|onto)|to\s+(?:his|her|their)\s+knees|(?:his|her|their)\s+(?:bag|glass|cup|gun|knife|phone|keys|head|hands?|shoulders?|eyes?|gaze))|shift(?:ing|ed|s)\s+(?:in|on|his|her|their\s+weight|posture|feet)|rais(?:ing|ed|es)\s+(?:his|her|their|a\s+hand|an?\s+eyebrow|a\s+finger|a\s+glass)|look(?:ing|s|ed)\s+(?:up|down|away|back|over|around|at|toward|towards|into)|turn(?:ing|s|ed)\s+(?:away|back|around|toward|towards|to\s+face|to\s+the)|reach(?:ing|es|ed)\s+(?:into|out|for|across|toward|towards|up|down)|stand(?:ing|s)\s+(?:up|tall|over|by|near|at|beside)|sitt(?:ing|s)\s+(?:down|up|back|in|on|at|beside)|walk(?:ing|s|ed)\s+(?:away|over|toward|towards|into|out|across|up|down)|runn(?:ing|s)\s+(?:away|toward|towards|into|out|across|up|down)|step(?:ping|s|ped)\s+(?:forward|back|aside|toward|towards|into|closer)|point(?:ing|s|ed)\s+(?:at|toward|towards|to|up|down|a\s+finger)|hold(?:ing|s)\s+(?:up|out|onto|his\s+hand|her\s+hand)|pull(?:ing|s|ed)\s+(?:out|back|away|up|down|his|her)|shak(?:ing|es|ed)\s+(?:his|her|their|hands?|head)|lean(?:ing|s|ed)\s+(?:forward|back|in|into|over|against|across|toward|towards|down|closer)|cross(?:ing|es|ed)\s+(?:his|her|their|the\s+room|arms|legs)|wav(?:ing|es|ed)\s+(?:at|to|away|off|a\s+hand|his|her)|touch(?:ing|es|ed)\s+(?:his|her|their|the)|toss(?:ing|es|ed)|unlock(?:ing|s|ed)|lock(?:ing|s|ed)|open(?:ing|s|ed)\s+(?:the|a)|clos(?:ing|es|ed)\s+(?:the|a))\b|\b(?:fingers?|hands?|arms?|legs?|knees?|feet|foot|eyes?|eyebrows?|brow|chin|cheeks?|shoulders?|waist|hips?|wrists?|palms?|knuckles?|collar|jacket|shirt|tie|blouse|skirt|apron|trousers|chair|armchair|table|desk|door|doorway|window|counter|floor|floorboards|walls?|couch|sofa|bed|bench|seat|stool|pocket|coat|drawer|bag|briefcase|envelope|contract|ledger|glass|cup|mug|bottle|phone|screen|monitor|keyboard|banister|stairs|staircase|gun|pistol|revolver|knife|blade)\b/i;

/** Strips protected acoustic idioms before checking whether a bracket cue contains physical blocking. */
function hasPhysicalStagingInBracket(innerText: string): boolean {
    if (!innerText) return false;
    const stripped = String(innerText).replace(DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE_G, ' ');
    return AUDIO_DRAMA_BRACKET_PHYSICAL_RE.test(stripped);
}

/**
 * Analyzes an Audio Drama script against Fish Audio Drama-3 native syntax:
 * speaker prefixes, Narrator-voiced staging, free-form [actor/sound cues] (no physical blocking),
 * zero legacy (...) parenthetical vocal tags, and balanced paired XML tags from the 7 approved tags.
 */
export function analyzeAudioDramaScriptFormatting(prose: unknown): AudioDramaFormattingAnalysis {
    const text = String(prose || '');
    const rawLines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    let speakerLineCount = 0;
    let narratorLineCount = 0;
    let consecutiveNarratorRuns = 0;
    let consecutiveNarratorPairs = 0;
    let consecutiveSameSpeakerRuns = 0;
    let prevSpeakerKey: string | null = null;
    let inNarratorRun = false;
    let inSameSpeakerRun = false;
    let foleyOrStageViolations = 0;
    const physicalBracketTags: string[] = [];
    const abbreviatedBracketTags: string[] = [];
    const invalidParenTags: string[] = [];
    const invalidXmlTags: string[] = [];

    for (const line of rawLines) {
        if (
            /^={3,}|^---|^###|^\*\s*\*\s*\*$/i.test(line) ||
            /^(?:ACT|SEQUENCE|SCENE)\s+[0-9IVXLCDM]+/i.test(line)
        ) {
            prevSpeakerKey = null;
            inNarratorRun = false;
            inSameSpeakerRun = false;
        } else {
            const spkMatch = line.match(/^([A-Za-z0-9_'\s-]+):\s+.+/i);
            if (spkMatch) {
                speakerLineCount++;
                const spkKey = spkMatch[1].trim().toLowerCase();
                if (spkKey === 'narrator') {
                    narratorLineCount++;
                }
                if (prevSpeakerKey !== null && spkKey === prevSpeakerKey) {
                    if (!inSameSpeakerRun) {
                        consecutiveSameSpeakerRuns++;
                        inSameSpeakerRun = true;
                    }
                    if (spkKey === 'narrator') {
                        consecutiveNarratorPairs++;
                        if (!inNarratorRun) {
                            consecutiveNarratorRuns++;
                            inNarratorRun = true;
                        }
                    }
                } else {
                    prevSpeakerKey = spkKey;
                    inSameSpeakerRun = false;
                    inNarratorRun = false;
                }
            } else {
                prevSpeakerKey = null;
                inNarratorRun = false;
                inSameSpeakerRun = false;
            }
        }
        if (/^\[[^\]]+\]$/.test(line) && !line.includes(':')) {
            foleyOrStageViolations++;
        }

        const bracketMatches = line.match(/\[[^\]]+\]/g) || [];
        for (const tag of bracketMatches) {
            if (/^\[(?:SFX|FX|Audio|Sound|Music):[^\]]*\]$/i.test(tag)) {
                foleyOrStageViolations++;
                continue;
            }
            const inner = tag.slice(1, -1).trim();
            if (hasPhysicalStagingInBracket(inner)) {
                physicalBracketTags.push(tag);
            }
        }

        // Flag legacy parenthetical stage/vocal tags (...) on character or Narrator lines
        const parenMatches = line.match(/\([^()]+\)/g) || [];
        for (const pTag of parenMatches) {
            const inner = pTag.slice(1, -1).trim().toLowerCase();
            if (!inner || /^\d+$/.test(inner)) continue;
            const words = inner.split(/\s+/).filter(Boolean);
            const isVocalOrAdverb =
                CANONICAL_AUDIO_DRAMA_VOCAL_TAGS.has(inner) ||
                Object.prototype.hasOwnProperty.call(VOCAL_EVENT_SYNONYM_MAP, inner) ||
                DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE.test(inner) ||
                (words.length <= 4 && !/^(?:i\.e\.|e\.g\.|etc\.|vs\.)$/i.test(inner));
            if (isVocalOrAdverb) {
                invalidParenTags.push(pTag);
            }
        }

        // Validate Drama-3 inline XML prosody tags (paired set of 7 + stack balance)
        const lineWithoutReserved = line.replace(/<\|[^|>]+\|>/g, '');
        const xmlMatches = [...lineWithoutReserved.matchAll(/<(\/?)([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>/g)];
        const stack: string[] = [];
        for (const xm of xmlMatches) {
            const isClose = xm[1] === '/';
            const tagName = xm[2].toLowerCase();
            if (!DRAMA3_SCOPED_TAGS.has(tagName)) {
                invalidXmlTags.push(xm[0]);
                continue;
            }
            if (!isClose) {
                stack.push(tagName);
            } else {
                const topIdx = stack.lastIndexOf(tagName);
                if (topIdx === -1) {
                    invalidXmlTags.push(`${xm[0]} (unmatched close)`);
                } else {
                    stack.splice(topIdx, 1);
                }
            }
        }
        while (stack.length > 0) {
            const unclosed = stack.pop();
            invalidXmlTags.push(`<${unclosed}> (unclosed)`);
        }
    }

    return {
        rawLines,
        speakerLineCount,
        narratorLineCount,
        consecutiveNarratorRuns,
        consecutiveNarratorPairs,
        consecutiveSameSpeakerRuns,
        foleyOrStageViolations,
        physicalBracketTags,
        abbreviatedBracketTags,
        invalidParenTags,
        invalidXmlTags
    };
}

const FLAT_DRAMA3_SINGLE_WORD_CUES = new Set([
    'sad',
    'sadly',
    'angry',
    'angrily',
    'mad',
    'happy',
    'happily',
    'nervous',
    'nervously',
    'worried',
    'scared',
    'afraid',
    'fearful',
    'tense',
    'tensely',
    'quiet',
    'quietly',
    'soft',
    'softly',
    'cold',
    'coldly',
    'warm',
    'warmly',
    'flat',
    'flatly',
    'calm',
    'calmly',
    'firm',
    'firmly',
    'sharp',
    'sharply',
    'tired',
    'wearily',
    'weary',
    'bitter',
    'bitterly',
    'defensive',
    'defensively',
    'hesitant',
    'hesitantly',
    'serious',
    'seriously',
    'urgent',
    'urgently',
    'dry',
    'dryly',
    'low',
    'harsh',
    'harshly',
    'gentle',
    'gently',
    'stern',
    'sternly',
    'anxious',
    'anxiously',
    'frustrated',
    'annoyed',
    'surprised',
    'shocked',
    'relieved',
    'excited',
    'confused',
    'suspicious',
    'guarded',
    'measured',
    'whispering',
    'shouting',
    'yelling',
    'murmuring',
    'muttering',
    'deadpan',
    'brightly'
]);

const DRAMA3_SOUND_PAUSE_CUE_RE =
    /^(?:(?:shaky|ragged|short|uneven|deep|sharp|soft|heavy)\s+)?breath(?:ing heavily)?$|^(?:(?:short|long|brief)\s+)?pauses?$|^beat$|^(?:(?:small|quiet|dry|bitter)\s+)?laughs?$|^chuckles?$|^giggles?$|^(?:(?:soft|heavy|deep|long|quiet)\s+)?sighs?$|^gasps?$|^inhales?$|^exhales?$|^coughs?$|^clears?\s+(?:his|her|their\s+)?throat$|^scoffs?$|^sobs?$|^choked sob$|^groans?$|^grunts?$|^sniffs?$|^gulps?$|^snorts?$|^whimpers?$/i;

/**
 * Fast deterministic non-LLM analyzer measuring Fish Audio Drama-3 expressive direction
 * richness across character turns: subtext/physics [cues] vs flat 1-word labels,
 * mid-line emotional pivots, the 7 paired XML prosody tags, and causal sounds/pauses.
 */
export function analyzeAudioDramaExpressiveness(rawScript: unknown): AudioDramaExpressivenessReport {
    const cleanText = String(rawScript || '')
        .replace(/<\/?prose_text>/gi, '')
        .replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n');

    let totalTurns = 0;
    let narratorTurns = 0;
    let characterTurns = 0;
    let directedTurns = 0;
    let richCueTurns = 0;
    let actingCueCount = 0;
    let flatSingleWordCueCount = 0;
    let midLineShiftCount = 0;
    let soundPauseCount = 0;
    let xmlTagCount = 0;

    const xmlTagBreakdown: Record<string, number> = {
        whisper: 0,
        emphasis: 0,
        stress: 0,
        soft: 0,
        fast: 0,
        slow: 0,
        forceful: 0
    };
    const distinctXmlTags = new Set<string>();
    const flatSingleWordCues: FlatSingleWordCueSample[] = [];
    const substantiveUntagged: UntaggedTurnSample[] = [];
    const shortUntagged: UntaggedTurnSample[] = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li].trim();
        if (!line || /^={3,}|^---|^###|^\*\s*\*\s*\*$/i.test(line)) continue;
        const match = line.match(/^([A-Za-z0-9_'\s-]{1,40}?)\s*:\s+([\s\S]+)$/);
        if (!match) continue;
        const speaker = match[1].trim().replace(/^[*_[\]]+|[*_[\]]+$/g, '').trim();
        if (!speaker || /[.!?]$/.test(speaker) || speaker.includes(';')) continue;
        const body = match[2].trim();
        if (!body) continue;

        totalTurns++;
        if (speaker.toLowerCase() === 'narrator') {
            narratorTurns++;
            continue;
        }

        characterTurns++;
        let turnHasActingCue = false;
        let turnHasRichCue = false;
        let turnHasSoundOrPause = false;
        let turnHasXml = false;

        const bracketMatches = [...body.matchAll(/\[([^\]]+)\]/g)];
        for (const bm of bracketMatches) {
            const inner = bm[1].trim();
            if (!inner) continue;
            const innerLower = inner.toLowerCase();
            if (DRAMA3_SOUND_PAUSE_CUE_RE.test(innerLower)) {
                soundPauseCount++;
                turnHasSoundOrPause = true;
                continue;
            }

            actingCueCount++;
            turnHasActingCue = true;

            const bmIndex = bm.index ?? 0;
            const prefixSpoken = body
                .slice(0, bmIndex)
                .replace(/\[[^\]]+\]/g, ' ')
                .replace(/<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi, ' ')
                .match(/[A-Za-z0-9']+/g);
            if (prefixSpoken && prefixSpoken.length >= 1) {
                midLineShiftCount++;
            }

            const cueWords = inner.split(/\s+/).filter(Boolean);
            const isFlatSingle = cueWords.length === 1 && FLAT_DRAMA3_SINGLE_WORD_CUES.has(innerLower);
            if (isFlatSingle) {
                flatSingleWordCueCount++;
                if (flatSingleWordCues.length < 12) {
                    const spokenPreview = body
                        .replace(/\[[^\]]+\]/g, ' ')
                        .replace(/<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 72);
                    flatSingleWordCues.push({
                        lineNumber: li + 1,
                        speaker,
                        cue: `[${inner}]`,
                        preview: spokenPreview
                    });
                }
            } else if (
                cueWords.length >= 3 ||
                /[,;]|\b(?:but|while|so|until|before|though|hiding|forcing|trying|keeping|through|with)\b/i.test(
                    inner
                ) ||
                (cueWords.length === 2 && !FLAT_DRAMA3_SINGLE_WORD_CUES.has(cueWords[1].toLowerCase()))
            ) {
                turnHasRichCue = true;
            }
        }

        const stack: string[] = [];
        const xmlRe = /<(\/?)(whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi;
        let xm: RegExpExecArray | null;
        while ((xm = xmlRe.exec(body)) !== null) {
            const isClose = xm[1] === '/';
            const tag = xm[2].toLowerCase();
            if (!isClose) {
                stack.push(tag);
            } else {
                const idx = stack.lastIndexOf(tag);
                if (idx !== -1) {
                    stack.splice(idx, 1);
                    xmlTagCount++;
                    xmlTagBreakdown[tag] = (xmlTagBreakdown[tag] || 0) + 1;
                    distinctXmlTags.add(tag);
                    turnHasXml = true;
                }
            }
        }

        if (turnHasActingCue || turnHasSoundOrPause || turnHasXml) {
            directedTurns++;
        }
        if (turnHasRichCue) {
            richCueTurns++;
        }
        if (!turnHasActingCue && !turnHasSoundOrPause && !turnHasXml) {
            const spokenClean = body.replace(/\s+/g, ' ').trim();
            const spokenWordCount = (spokenClean.match(/[A-Za-z0-9']+/g) || []).length;
            const entry: UntaggedTurnSample = {
                lineNumber: li + 1,
                speaker,
                spokenWords: spokenWordCount,
                preview: spokenClean.slice(0, 80)
            };
            if (spokenWordCount >= 6) {
                substantiveUntagged.push(entry);
            } else {
                shortUntagged.push(entry);
            }
        }
    }

    const untaggedTurnSamples = [...substantiveUntagged, ...shortUntagged].slice(0, 12);
    const directedRatio = characterTurns > 0 ? +(directedTurns / characterTurns).toFixed(3) : 1;
    const richCueRatio = characterTurns > 0 ? +(richCueTurns / characterTurns).toFixed(3) : 1;
    const distinctXmlTagCount = distinctXmlTags.size;

    if (characterTurns < 4) {
        const summary = `Short script (${characterTurns} char turns) — auto-pass.`;
        return {
            totalTurns,
            narratorTurns,
            characterTurns,
            directedTurns,
            directedRatio,
            richCueTurns,
            richCueRatio,
            actingCueCount,
            flatSingleWordCueCount,
            midLineShiftCount,
            soundPauseCount,
            xmlTagCount,
            distinctXmlTagCount,
            xmlTagBreakdown,
            flatSingleWordCues,
            untaggedTurnSamples,
            deficits: [],
            score: 100,
            needsDirectionPass: false,
            summary,
            auditBlock: summary
        };
    }

    const targetXmlCount = characterTurns >= 6 ? Math.max(2, Math.floor(characterTurns * 0.22)) : 1;
    const targetMidLineShifts = characterTurns >= 8 ? Math.max(1, Math.floor(characterTurns * 0.12)) : 0;
    const targetSoundPauseCount = characterTurns >= 8 ? Math.max(1, Math.floor(characterTurns * 0.12)) : 0;

    const directedScore = Math.min(25, Math.round((directedRatio / 0.65) * 25));
    const richScore = Math.min(25, Math.round((richCueRatio / 0.45) * 25));
    const xmlCountScore = Math.min(14, Math.round((xmlTagCount / Math.max(1, targetXmlCount)) * 14));
    const xmlDiversityTarget = characterTurns >= 10 ? 2 : 1;
    const xmlDiversityScore = Math.min(6, Math.round((distinctXmlTagCount / xmlDiversityTarget) * 6));
    const xmlScore = xmlCountScore + xmlDiversityScore;
    const pivotScore =
        targetMidLineShifts > 0
            ? Math.min(15, Math.round((midLineShiftCount / targetMidLineShifts) * 15))
            : 15;
    const soundScore =
        targetSoundPauseCount > 0
            ? Math.min(15, Math.round((soundPauseCount / targetSoundPauseCount) * 15))
            : 15;
    const score = Math.max(
        0,
        Math.min(100, directedScore + richScore + xmlScore + pivotScore + soundScore)
    );

    const deficits: string[] = [];
    if (directedRatio < 0.55) {
        deficits.push(
            `Low directed character turns: ${Math.round(directedRatio * 100)}% (${directedTurns}/${characterTurns}, target >= 55%).`
        );
    }
    if (richCueRatio < 0.35 || flatSingleWordCueCount >= 2) {
        deficits.push(
            `Flat or sparse acting directions: ${richCueTurns}/${characterTurns} rich subtext/physics cues (${flatSingleWordCueCount} flat 1-word label(s) detected).`
        );
    }
    if (xmlTagCount < targetXmlCount || (characterTurns >= 10 && distinctXmlTagCount < 2)) {
        deficits.push(
            `Underused 7 paired XML word tags: ${xmlTagCount} used across ${distinctXmlTagCount} tag type(s) (target >= ${targetXmlCount} total${characterTurns >= 10 ? ' across >= 2 distinct tags' : ''}).`
        );
    }
    if (targetMidLineShifts > 0 && midLineShiftCount < targetMidLineShifts) {
        deficits.push(
            `Few mid-line emotional pivots: ${midLineShiftCount} found (target >= ${targetMidLineShifts} inline [pivot] cues mid-sentence).`
        );
    }
    if (targetSoundPauseCount > 0 && soundPauseCount < targetSoundPauseCount) {
        deficits.push(
            `Few paralinguistic sounds/pauses: ${soundPauseCount} found (target >= ${targetSoundPauseCount} causal [sigh]/[laugh]/[small laugh]/[breath]/[shaky breath]/[pause]/[short pause]).`
        );
    }

    const needsDirectionPass =
        score < 68 ||
        deficits.length >= 2 ||
        (characterTurns >= 6 && xmlTagCount === 0) ||
        directedRatio < 0.4;

    const summary = `Score ${score}/100 | Directed ${Math.round(directedRatio * 100)}% (${directedTurns}/${characterTurns}) | Rich cues ${richCueTurns} (flat ${flatSingleWordCueCount}) | Pivots ${midLineShiftCount} | XML ${xmlTagCount} (${distinctXmlTagCount} types) | Sounds/Pauses ${soundPauseCount}`;

    const usedXmlList =
        Object.entries(xmlTagBreakdown)
            .filter(([, c]) => c > 0)
            .map(([t, c]) => `<${t}>:${c}`)
            .join(', ') || 'none';
    const auditLines = [
        `Expressiveness Score: ${score}/100 (${needsDirectionPass ? 'BELOW THRESHOLD - ENHANCEMENT RECOMMENDED' : 'SUFFICIENT'})`,
        `Character Turns: ${characterTurns} | Directed Turns: ${directedTurns} (${Math.round(directedRatio * 100)}%) | Rich Subtext/Physics Cues: ${richCueTurns} | Flat 1-Word Cues: ${flatSingleWordCueCount}`,
        `Mid-Line Emotional Pivots: ${midLineShiftCount} | Paired XML Tags: ${xmlTagCount} (${usedXmlList}) | Sounds & Pauses: ${soundPauseCount}`,
        deficits.length > 0
            ? `Deficits to Address:\n${deficits.map((d) => `- ${d}`).join('\n')}`
            : `Deficits to Address: None (refine selectively only if needed).`,
        flatSingleWordCues.length > 0
            ? `Weak 1-Word Cues to Upgrade into Vocal Physics + Subtext:\n${flatSingleWordCues.map((f) => `- Line ${f.lineNumber} (${f.speaker}): ${f.cue} "${f.preview}"`).join('\n')}`
            : '',
        untaggedTurnSamples.length > 0
            ? `Candidate Untagged Character Turns (skip crisp neutral exchanges, direct emotionally charged lines):\n${untaggedTurnSamples.map((u) => `- Line ${u.lineNumber} (${u.speaker}, ${u.spokenWords}w): "${u.preview}"`).join('\n')}`
            : ''
    ].filter(Boolean);

    return {
        totalTurns,
        narratorTurns,
        characterTurns,
        directedTurns,
        directedRatio,
        richCueTurns,
        richCueRatio,
        actingCueCount,
        flatSingleWordCueCount,
        midLineShiftCount,
        soundPauseCount,
        xmlTagCount,
        distinctXmlTagCount,
        xmlTagBreakdown,
        flatSingleWordCues,
        untaggedTurnSamples,
        deficits,
        score,
        needsDirectionPass,
        summary,
        auditBlock: auditLines.join('\n')
    };
}

const _PAST_IRREGULAR_VERBS: Record<string, string> = {
    lean: 'leaned',
    slam: 'slammed',
    reach: 'reached',
    step: 'stepped',
    look: 'looked',
    glance: 'glanced',
    stare: 'stared',
    gaze: 'gazed',
    turn: 'turned',
    nod: 'nodded',
    shrug: 'shrugged',
    shake: 'shook',
    pull: 'pulled',
    push: 'pushed',
    grab: 'grabbed',
    clutch: 'clutched',
    set: 'set',
    sit: 'sat',
    stand: 'stood',
    walk: 'walked',
    run: 'ran',
    hold: 'held',
    draw: 'drew',
    point: 'pointed',
    drop: 'dropped',
    toss: 'tossed',
    wipe: 'wiped',
    pat: 'patted',
    cross: 'crossed',
    wave: 'waved',
    touch: 'touched',
    open: 'opened',
    close: 'closed',
    unlock: 'unlocked',
    lock: 'locked',
    frown: 'frowned',
    smirk: 'smirked',
    grin: 'grinned',
    blink: 'blinked',
    wink: 'winked',
    slump: 'slumped',
    collapse: 'collapsed',
    rub: 'rubbed',
    pace: 'paced',
    lunge: 'lunged',
    settle: 'settled',
    shift: 'shifted',
    raise: 'raised',
    adjust: 'adjusted',
    tap: 'tapped',
    button: 'buttoned',
    unbutton: 'unbuttoned',
    rise: 'rose',
    keep: 'kept',
    throw: 'threw',
    place: 'placed',
    pick: 'picked',
    tremble: 'trembled',
    quiver: 'quivered',
    tighten: 'tightened'
};

function _conjugateStagingVerbPast(rawVerb: string): string {
    const lower = String(rawVerb || '').toLowerCase();
    if (!lower) return '';
    const candidates = [lower];
    if (lower.endsWith('ing')) {
        const stem = lower.slice(0, -3);
        candidates.push(stem, stem + 'e');
        if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
            candidates.push(stem.slice(0, -1));
        }
    } else if (lower.endsWith('ies')) {
        candidates.push(lower.slice(0, -3) + 'y');
    } else if (lower.endsWith('es')) {
        candidates.push(lower.slice(0, -2), lower.slice(0, -1));
    } else if (lower.endsWith('s')) {
        candidates.push(lower.slice(0, -1));
    } else if (lower.endsWith('ed')) {
        candidates.push(lower);
    }
    for (const c of candidates) {
        if (Object.prototype.hasOwnProperty.call(_PAST_IRREGULAR_VERBS, c)) {
            return _PAST_IRREGULAR_VERBS[c];
        }
    }
    if (lower.endsWith('ed')) return lower;
    if (lower.endsWith('ing')) {
        const stem = lower.slice(0, -3);
        if (stem.endsWith('c')) return stem + 'ked';
        if (Object.prototype.hasOwnProperty.call(_PAST_IRREGULAR_VERBS, stem + 'e')) {
            return _PAST_IRREGULAR_VERBS[stem + 'e'];
        }
        if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
            return stem.slice(0, -1) + 'ed';
        }
        if (/(?:clos|gaz|smil|rac|pac|lung|plac|wip|shak|rais|settl)/.test(stem)) {
            return stem + 'ed';
        }
        return stem + 'ed';
    }
    if (lower.endsWith('es') && /(?:ch|sh|ss|x|z)es$/.test(lower)) {
        return lower.slice(0, -2) + 'ed';
    }
    if (lower.endsWith('s')) {
        const base = lower.slice(0, -1);
        return base.endsWith('e') ? base + 'd' : base + 'ed';
    }
    return lower;
}

function _formatPhysicalClauseAsNarratorSentence(rawClause: string, speaker: string): string {
    const clause = String(rawClause || '').trim().replace(/^[,\s;]+|[,\s;.]+$/g, '');
    if (!clause) return '';
    const oneWordSubjMatch = clause.match(/^(his|her|their|the)\s+([a-z]+)\s+([a-z]+)$/i);
    const leadVerbMatch = clause.match(/^([A-Za-z]+)(?:\s+([\s\S]+))?$/);
    let sentence: string;
    if (oneWordSubjMatch) {
        const past = _conjugateStagingVerbPast(oneWordSubjMatch[3]);
        sentence = `${oneWordSubjMatch[1]} ${oneWordSubjMatch[2]} ${past}`;
    } else if (/^(?:his|her|their|the|a|an)\b/i.test(clause)) {
        sentence = clause.replace(
            /^((?:his|her|their|the|a|an)\s+[a-z]+)\s+([a-z]+(?:ing|s|es))\b/i,
            (_, pfx: string, vb: string) => `${pfx} ${_conjugateStagingVerbPast(vb)}`
        );
    } else if (/^(?:he|she|they)\b/i.test(clause)) {
        sentence = clause.replace(
            /^(he|she|they)\s+([a-z]+)\b/i,
            (_, pr: string, vb: string) => `${pr} ${_conjugateStagingVerbPast(vb)}`
        );
    } else if (leadVerbMatch) {
        const past = _conjugateStagingVerbPast(leadVerbMatch[1]);
        const tail = leadVerbMatch[2] ? ` ${leadVerbMatch[2]}` : '';
        const spk = speaker && speaker !== 'Narrator' ? speaker : '';
        sentence = spk ? `${spk} ${past}${tail}` : `${past}${tail}`;
    } else {
        sentence = speaker && speaker !== 'Narrator' ? `${speaker} ${clause}` : clause;
    }
    sentence = sentence.trim();
    if (!sentence) return '';
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    if (!/[.!?]$/.test(sentence)) sentence += '.';
    return sentence;
}

/**
 * 7-Pass Deterministic Programmatic Normalizer for Fish Audio Drama-3 scripts.
 * Repairs speaker prefixes, banned control tokens, SFX labels, *emotes*, legacy (...) tags,
 * markdown emphasis (**...** -> <emphasis>, *...* -> <stress>), synonym/invalid XML tags,
 * physical-action bracket clauses (programmatically split into past-tense Narrator: lines),
 * unbalanced XML tag stacks, adjacent brackets, and whitespace hygiene.
 */
export function normalizeAudioDramaScriptWithReport(rawText: unknown): NormalizedDramaScriptResult {
    const stats: NormalizedDramaScriptStats = {
        linesNormalized: 0,
        parensConverted: 0,
        asteriskEmotesConverted: 0,
        markdownTagsConverted: 0,
        xmlSynonymsMapped: 0,
        invalidXmlConverted: 0,
        xmlAutoBalanced: 0,
        physicalBracketsSplit: 0,
        sfxRepaired: 0
    };
    if (!rawText || typeof rawText !== 'string') {
        return { text: typeof rawText === 'string' ? rawText : '', changed: false, stats };
    }
    let text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!text.trim()) return { text, changed: text !== rawText, stats };

    const colonLines = text.match(/^[A-Za-z0-9_'\s[\]()*.\-&/]{1,50}:\s+.+/gm) || [];
    const bracketSpeakerTags =
        text.match(
            /\[(?:NARRATOR|[A-Z][A-Za-z0-9_'.-]*(?:\s+[A-Z][A-Za-z0-9_'.-]*){0,2})\](?=\s*(?:\(|\[|[A-Z"“‘'¡¿<]))/g
        ) || [];
    const hasExplicitNarrator = /(?:^|\s)(?:\[NARRATOR\]|\*{0,2}Narrator\s*:)/im.test(text);
    const hasAudioMarker =
        hasExplicitNarrator || colonLines.length >= 2 || bracketSpeakerTags.length >= 2;
    if (!hasAudioMarker) {
        return { text: rawText, changed: false, stats };
    }

    // PASS 1: Typographic hygiene, forbidden Audio.cpp control token scrubbing, & structural speaker prefixes
    text = text
        .replace(/<\|(?:im_start|im_end|voice|text|interleave|speaker:\d+|semantic:[^|>]*)\|>/gi, '')
        .replace(/^\s*PACETIMES\s*:\s*[0-9.]+\s*\]\.?\s*/i, '')
        .replace(
            /(^|\n)\*{1,2}([A-Za-z][A-Za-z0-9_'\s.-]{0,35}?)\s*(?::\*{1,2}|\*{1,2}:)\s+/g,
            '$1$2: '
        )
        .replace(/--+/g, '—')
        .replace(
            /\[NARRATOR\][ \t]*(?:\((?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?|\d+\.\d+)\)[ \t]*)?(?=\[(?!SFX\b)[A-Z][A-Za-z0-9_'.-]*(?:\s+[A-Z][A-Za-z0-9_'.-]*){0,2}\])/gi,
            ''
        )
        .replace(
            /(^|\n)\[(NARRATOR|[A-Za-z][A-Za-z0-9_'.-]*(?:\s+[A-Za-z][A-Za-z0-9_'.-]*){0,2})\]\s*\n+\s*(\([^()\n]{1,160}\)|\[[^\]\n]{1,240}\])\s*\n+\s*(?=[^\n])/g,
            (m, p1: string, spk: string, tag: string) =>
                /^(?:SFX|FX|Audio|Sound|Music)\b/i.test(spk) ? m : `${p1}[${spk}] ${tag} `
        )
        .replace(
            /(^|\n)\[(NARRATOR|[A-Za-z][A-Za-z0-9_'.-]*(?:\s+[A-Za-z][A-Za-z0-9_'.-]*){0,2})\]\s*\n+\s*(?=[^\n])/g,
            (m, p1: string, spk: string) =>
                /^(?:SFX|FX|Audio|Sound|Music)\b/i.test(spk) ? m : `${p1}[${spk}] `
        )
        .replace(
            /([.!?…"”’])\s+\[(NARRATOR|[A-Z][A-Za-z0-9_'.-]*(?:\s+[A-Z][A-Za-z0-9_'.-]*){0,2})\](?=\s*(?:\([^()\n]{1,160}\)|\[[^\]\n]{1,300}\])?\s+[A-Za-z0-9"“‘'¡¿<])/g,
            (m, p1: string, spk: string) =>
                /^(?:SFX|FX|Audio|Sound|Music)\b/i.test(spk) ? m : `${p1}\n\n[${spk}]`
        )
        .replace(/([^\n])\s*\bnarrator\s*:\s+([A-Z"“‘'¡¿([])/gi, (m, prev: string, nextCh: string) =>
            /[A-Z"“‘'¡¿([]/.test(nextCh) ? `${prev}\n\nNarrator: ${nextCh}` : m
        )
        .replace(
            /([.!?…"”’])\s*([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\s*:\s+(?=[A-Z"“‘'¡¿([<])/g,
            (m, p1: string, spk: string) =>
                /^(?:AM|PM|OK|US|UK|TV|ID|VP|CEO|CFO|HR|HQ|AI)$/i.test(spk)
                    ? m
                    : `${p1}\n\n${spk}: `
        )
        .replace(
            /([.!?…"”’])\s+([A-Z][A-Za-z0-9_'.-]*(?:\s+[A-Z][A-Za-z0-9_'.-]*){0,2})\s*:\s+(?=(?:\[|\(|<|"|“))/g,
            (m, p1: string, spk: string) =>
                /^(?:Note|Warning|Update|Result|Reason|Answer|Question|Rule|Fact|Truth|Problem|Tip|Example|Summary|Verdict|AM|PM|OK|US|UK|TV|ID|VP|CEO|CFO|HR|HQ|AI)$/i.test(
                    spk
                )
                    ? m
                    : `${p1}\n\n${spk}: `
        );

    const normalizeSpeakerCase = (rawSpeaker: string): string => {
        const s = String(rawSpeaker || '').trim();
        if (!s) return 'Narrator';
        if (s.toLowerCase() === 'narrator') return 'Narrator';
        if (/[A-Z]{2,}/.test(s) && !/[a-z]/.test(s)) {
            return s.replace(
                /\b([A-Z])([A-Z0-9_']*)\b/g,
                (_, first: string, rest: string) => first + rest.toLowerCase()
            );
        }
        return s;
    };
    const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const isLikelyCueParenthetical = (inner: string, atTurnStart = false): boolean => {
        const key = inner.trim().toLowerCase();
        if (!key || /^\d+$/.test(key) || /^(?:i\.e\.|e\.g\.|etc\.|vs\.)$/i.test(key)) return false;
        if (CANONICAL_AUDIO_DRAMA_VOCAL_TAGS.has(key)) return true;
        if (Object.prototype.hasOwnProperty.call(VOCAL_EVENT_SYNONYM_MAP, key)) return true;
        if (DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE.test(key)) return true;
        const words = key.split(/\s+/).filter(Boolean);
        if (atTurnStart && words.length <= 8) return true;
        if (words.length === 1 && /ly$/.test(key) && key.length >= 4) return true;
        if (
            words.length <= 4 &&
            /\b(?:voice|tone|breath|sigh|laugh|gasp|whisper|pause|beat|soft|quiet|cold|warm|tight|harsh|faint|tear|chok)\b/i.test(
                key
            )
        ) {
            return true;
        }
        return false;
    };

    const rawLines = text.split('\n');
    const outLines: string[] = [];

    for (const rawLine of rawLines) {
        let line = rawLine.trim();
        if (!line) continue;

        if (
            /^\[[^\]]+\]$/.test(line) &&
            !line.includes(':') &&
            !/^\[(?:SFX|FX|Audio|Sound|Music):/i.test(line)
        ) {
            const inner = line.slice(1, -1).trim();
            if (hasPhysicalStagingInBracket(inner) || /^[A-Z][a-z]+\s+/.test(inner)) {
                const sent = _formatPhysicalClauseAsNarratorSentence(inner, '');
                if (sent) {
                    stats.sfxRepaired++;
                    outLines.push(`Narrator: ${sent}`);
                    continue;
                }
            }
        }
        const sfxLineMatch = line.match(/^\[(?:SFX|FX|Audio|Sound|Music)\s*:\s*([^\]]+)\]$/i);
        if (sfxLineMatch) {
            const desc = sfxLineMatch[1].trim();
            const sent = _formatPhysicalClauseAsNarratorSentence(desc, '');
            if (sent) {
                stats.sfxRepaired++;
                outLines.push(`Narrator: ${sent}`);
            }
            continue;
        }

        // Convert line-initial [SpeakerName] to SpeakerName:
        line = line.replace(
            /^\[((?:NARRATOR|[A-Z][A-Za-z0-9_'.-]*(?:\s+[A-Z][A-Za-z0-9_'.-]*){0,2}))\]\s*:?\s+([\s\S]+)$/,
            (m, spk: string, rest: string) =>
                /^(?:SFX|FX|Audio|Sound|Music)\b/i.test(spk) ? m : `${spk}: ${rest}`
        );

        const prefixMatch = line.match(/^([A-Za-z][A-Za-z0-9_'\s.-]{0,35}?)\s*:\s+([\s\S]+)$/);
        if (!prefixMatch) {
            outLines.push(line);
            continue;
        }

        stats.linesNormalized++;
        const speaker = normalizeSpeakerCase(prefixMatch[1]);
        let body = prefixMatch[2].trim();

        const spkRe = new RegExp(
            `^((?:\\([^)\\n]*\\)\\s*|\\[[^\\]\\n]*\\]\\s*)?)(?:\\[${escapeRe(speaker)}\\]\\s*:?|\\b${escapeRe(speaker)}\\s*:)\\s*([\\s\\S]+)$`,
            'i'
        );
        for (let pass = 0; pass < 3; pass++) {
            body = body
                .replace(
                    /^\((?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?|\d+\.\d+(?:\s*[AP]M)?|\d{1,2}\s*[AP]M)\)\s*/i,
                    ''
                )
                .replace(
                    /^\((?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?|\d+\.\d+(?:\s*[AP]M)?|\d{1,2}\s*[AP]M)\s*[,;:-]\s*([^)]+)\)\s*/i,
                    '($1) '
                )
                .trim();
            const dupMatch = body.match(spkRe);
            if (dupMatch) {
                const keptPrefix = (dupMatch[1] || '').trim();
                const restAfterDup = dupMatch[2]
                    .trim()
                    .replace(
                        /^\((?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?|\d+\.\d+(?:\s*[AP]M)?|\d{1,2}\s*[AP]M)\)\s*/i,
                        ''
                    )
                    .replace(
                        /^\((?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?|\d+\.\d+(?:\s*[AP]M)?|\d{1,2}\s*[AP]M)\s*[,;:-]\s*([^)]+)\)\s*/i,
                        '($1) '
                    )
                    .trim();
                body = keptPrefix ? `${keptPrefix} ${restAfterDup}` : restAfterDup;
            }
        }

        // PASS 2: Inline SFX cleanup, *emotes*, markdown **bold** / *italic* -> XML, and legacy (...) -> [...]
        body = body.replace(/\[(?:SFX|FX|Audio|Sound|Music)\s*:\s*([^\]]+)\]/gi, (_, inner: string) => {
            stats.sfxRepaired++;
            return `[${inner.trim()}]`;
        });

        body = body.replace(/\*\*([^*\n]{1,160}?)\*\*/g, (_, inner: string) => {
            stats.markdownTagsConverted++;
            return speaker === 'Narrator' ? inner : `<emphasis>${inner}</emphasis>`;
        });

        body = body.replace(/\*([^*\n]{1,80}?)\*/g, (_m, inner: string) => {
            const key = inner.trim().toLowerCase();
            if (
                CANONICAL_AUDIO_DRAMA_VOCAL_TAGS.has(key) ||
                Object.prototype.hasOwnProperty.call(VOCAL_EVENT_SYNONYM_MAP, key) ||
                DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE.test(key)
            ) {
                stats.asteriskEmotesConverted++;
                if (speaker === 'Narrator') return '';
                const mapped = VOCAL_EVENT_SYNONYM_MAP[key] || key;
                return `[${mapped}]`;
            }
            stats.markdownTagsConverted++;
            return speaker === 'Narrator' ? inner : `<stress>${inner}</stress>`;
        });

        if (speaker === 'Narrator') {
            body = body
                .replace(/<\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful|[a-z]+)\b[^>]*>/gi, '')
                .replace(/\[[^\]]+\]/g, ' ')
                .replace(/^\(([^)\n]+)\)$/, '$1');
            body = body.replace(/\s{2,}/g, ' ').trim();
            if (body) outLines.push(`Narrator: ${body}`);
            continue;
        }

        const idxOffset = 0;
        body = body.replace(/\(([^()\n]{1,120})\)/g, (m, inner: string, offset: number) => {
            const atStart = offset <= 2 || /^[\s[\]A-Za-z,'"-]{0,4}$/.test(body.slice(idxOffset, offset));
            if (!isLikelyCueParenthetical(inner, atStart)) return m;
            stats.parensConverted++;
            const key = inner.trim().toLowerCase();
            if (CANONICAL_AUDIO_DRAMA_VOCAL_TAGS.has(key)) return `[${key}]`;
            if (Object.prototype.hasOwnProperty.call(VOCAL_EVENT_SYNONYM_MAP, key)) {
                return `[${VOCAL_EVENT_SYNONYM_MAP[key]}]`;
            }
            return `[${inner.trim()}]`;
        });

        // PASS 3: XML synonym normalization & unsupported <tag> -> [tag] conversion
        body = body.replace(/<(\/?)([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>/g, (_m, slash: string, rawTag: string) => {
            const lower = rawTag.toLowerCase();
            if (DRAMA3_SCOPED_TAGS.has(lower)) return `<${slash}${lower}>`;
            if (Object.prototype.hasOwnProperty.call(DRAMA3_XML_TAG_SYNONYMS, lower)) {
                stats.xmlSynonymsMapped++;
                return `<${slash}${DRAMA3_XML_TAG_SYNONYMS[lower]}>`;
            }
            stats.invalidXmlConverted++;
            return slash ? '' : `[${lower}] `;
        });

        // PASS 4: Programmatic Physical-Action & Blocking Splitter out of [...] brackets into Narrator: lines
        const preNarratorSentences: string[] = [];
        body = body.replace(/\[([^\]]+)\]/g, (fullTag, rawInner: string) => {
            if (!hasPhysicalStagingInBracket(rawInner)) return fullTag;
            const shielded: string[] = [];
            const tempInner = rawInner.replace(DRAMA3_ACOUSTIC_IDIOM_ALLOWLIST_RE_G, (idiom) => {
                const token = `__IDIOM_${shielded.length}__`;
                shielded.push(idiom);
                return token;
            });
            const rawClauses = tempInner
                .split(/\s*(?:,|;|\.\s+|\bas\b(?=\s+(?:he|she|they|[A-Z][a-z]+)))\s*/)
                .filter(Boolean);
            const keptAcoustic: string[] = [];
            let extractedCount = 0;
            for (const clause of rawClauses) {
                const restored = clause.replace(
                    /__IDIOM_(\d+)__/g,
                    (_, i: string) => shielded[Number(i)] || ''
                );
                const hasAcousticIdiom = /__IDIOM_\d+__/.test(clause);
                const hasAcousticTerm =
                    /\b(?:voice|tone|pitch|tempo|cadence|whisper|breathy|hoarse|rasp|projection|volume|diction|mic|hear|listen|loud|quiet|soft|hush|audible|inaudible|muffl|echo|murmur|mutter|shout|yell|call(?:ing)?)\b/i.test(
                        restored
                    );
                const isPhysical = hasPhysicalStagingInBracket(restored);
                if (isPhysical && !hasAcousticIdiom && !hasAcousticTerm) {
                    const sent = _formatPhysicalClauseAsNarratorSentence(restored, speaker);
                    if (sent) {
                        preNarratorSentences.push(sent);
                        extractedCount++;
                        continue;
                    }
                }
                if (restored.trim()) keptAcoustic.push(restored.trim());
            }
            if (extractedCount > 0) {
                stats.physicalBracketsSplit += extractedCount;
                return keptAcoustic.length > 0 ? `[${keptAcoustic.join(', ')}]` : '';
            }
            return fullTag;
        });

        // PASS 5: XML Tag Stack Auto-Balancer per line (auto-close open tags LIFO, drop unmatched closers)
        const stack: string[] = [];
        let balancedBody = '';
        let cursor = 0;
        const tagScanRe = /<(\/?)(whisper|emphasis|stress|soft|fast|slow|forceful)>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tagScanRe.exec(body)) !== null) {
            balancedBody += body.slice(cursor, tm.index);
            const isClose = tm[1] === '/';
            const tag = tm[2];
            if (!isClose) {
                if (!stack.includes(tag)) {
                    stack.push(tag);
                    balancedBody += `<${tag}>`;
                } else {
                    stats.xmlAutoBalanced++;
                }
            } else {
                const idx = stack.lastIndexOf(tag);
                if (idx !== -1) {
                    while (stack.length - 1 > idx) {
                        const top = stack.pop();
                        balancedBody += `</${top}>`;
                        stats.xmlAutoBalanced++;
                    }
                    stack.pop();
                    balancedBody += `</${tag}>`;
                } else {
                    stats.xmlAutoBalanced++;
                }
            }
            cursor = tm.index + tm[0].length;
        }
        balancedBody += body.slice(cursor);
        while (stack.length > 0) {
            balancedBody += `</${stack.pop()}>`;
            stats.xmlAutoBalanced++;
        }
        body = balancedBody;

        // PASS 6: Merge adjacent acting [cue1] [cue2] while keeping discrete sound/pause events separate
        const isDiscreteVocalCue = (txt: string): boolean => {
            const lower = txt.trim().toLowerCase();
            return (
                CANONICAL_AUDIO_DRAMA_VOCAL_TAGS.has(lower) ||
                Object.prototype.hasOwnProperty.call(VOCAL_EVENT_SYNONYM_MAP, lower) ||
                /^(?:(?:shaky|ragged|short|uneven|deep|sharp)\s+)?breath$|^choked sob$|^sharp intake of breath$|^(?:(?:small|quiet|dry|bitter)\s+)?laughs?$|^(?:(?:soft|heavy|deep|long)\s+)?sighs?$|^(?:(?:long|soft|sharp)\s+)?exhale$|^(?:(?:short|long|brief)\s+)?pause$|^beat$/i.test(
                    lower
                )
            );
        };
        body = body
            .replace(/\[([^\]]{1,120})\]\s+\[([^\]]{1,120})\]/g, (m, a: string, b: string) => {
                const left = a.trim();
                const right = b.trim();
                if (left.toLowerCase() === right.toLowerCase()) return `[${left}]`;
                if (isDiscreteVocalCue(left) || isDiscreteVocalCue(right)) return m;
                if (left.split(/\s+/).length + right.split(/\s+/).length <= 14) {
                    return `[${left}, ${right}]`;
                }
                return m;
            })
            .replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
                const words = inner.trim().split(/\s+/).filter(Boolean);
                if (words.length <= 28) {
                    return `[${inner.trim().replace(/^[,;\s]+|[,;\s]+$/g, '')}]`;
                }
                const clauses = inner.split(/\s*,\s*/);
                const kept: string[] = [];
                let count = 0;
                for (const c of clauses) {
                    const cw = c.trim().split(/\s+/).length;
                    if (count + cw <= 24 || kept.length === 0) {
                        kept.push(c.trim());
                        count += cw;
                    }
                }
                return `[${kept.join(', ')}]`;
            });

        // PASS 7: Final empty delimiter & spacing hygiene
        body = body
            .replace(/\[\s*[,;.]*\s*\]/g, '')
            .replace(/\(\s*\)/g, '')
            .replace(/<(whisper|emphasis|stress|soft|fast|slow|forceful)>\s*<\/\1>/g, '')
            .replace(/\[\s*,\s*/g, '[')
            .replace(/\s*,\s*\]/g, ']')
            .replace(/([\]>])\s{2,}/g, '$1 ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (preNarratorSentences.length > 0) {
            outLines.push(`Narrator: ${preNarratorSentences.join(' ')}`);
        }
        if (body) {
            outLines.push(`${speaker}: ${body}`);
        }
    }

    const finalOutput = outLines.join('\n\n').trim();
    return {
        text: finalOutput,
        changed: finalOutput !== rawText.trim(),
        stats
    };
}

/** Normalizes a raw Audio Drama script into clean Drama-3 syntax. */
export function normalizeAudioDramaScript(rawText: unknown): string {
    return normalizeAudioDramaScriptWithReport(rawText).text;
}

interface ScriptTextBlock {
    type: 'divider' | 'speaker';
    text: string;
    speaker?: string;
    emotion?: string | null;
}

/**
 * Combines adjacent Narrator text blocks in an audio drama script into single, cohesive narration blocks
 * before saving or displaying.
 */
export function combineAdjacentNarratorScriptBlocks(rawText: unknown): string {
    if (!rawText) return '';
    let text = String(rawText).replace(/\r\n/g, '\n');
    if (!text.trim()) return text;

    text = normalizeAudioDramaScript(text);

    const hasSpeakerLines = /^[\p{L}\p{N}_'\s[\]()*.\-&/]{1,50}:\s+.+/mu.test(text);
    if (!hasSpeakerLines) return text;

    const lines = text.split('\n');
    const isDividerOrHeader = (line: string): boolean => {
        const t = line.trim();
        return (
            /^={3,}|^---|^###|^===|^\*\s*\*\s*\*$/i.test(t) ||
            /^(?:ACT|SEQUENCE|SCENE)\s+[0-9IVXLCDM]+/i.test(t)
        );
    };

    const isNarratorSpeaker = (spk: string | undefined | null): boolean => {
        if (!spk) return true;
        const s = String(spk)
            .trim()
            .toLowerCase()
            .replace(/^[*_[]+|[*_\]]+$/g, '');
        return s === 'narrator';
    };

    const joinTextWithPunct = (a: string, b: string): string => {
        const cleanA = String(a || '').trim();
        const cleanB = String(b || '').trim();
        if (!cleanA) return cleanB;
        if (!cleanB) return cleanA;
        const needsPunct = !/[.?!:;—–"']$/.test(cleanA);
        return cleanA + (needsPunct ? '. ' : ' ') + cleanB;
    };

    const parseSpeakerPrefix = (
        line: string
    ): { speaker: string; emotion: string | null; content: string } | null => {
        const trimmed = line.trim();
        if (!trimmed || isDividerOrHeader(trimmed)) return null;
        const clean = trimmed.replace(/^[-*•]\s+/, '');
        const colonMatch = clean.match(/^([\p{L}\p{N}_'\s[\]()*.\-&/]{1,60}?)\s*:\s*(.*)$/u);
        if (!colonMatch) return null;
        let prefix = colonMatch[1].trim();
        const content = colonMatch[2].trim();
        prefix = prefix.replace(/^[*_]+|[*_]+$/g, '').trim();

        let speaker = prefix;
        let emotion: string | null = null;
        const doubleBracket = prefix.match(/^\[([^\]]+)\]\s*(?:\[([^\]]+)\]|\(([^)]+)\))$/);
        if (doubleBracket) {
            speaker = doubleBracket[1].trim();
            emotion = (doubleBracket[2] || doubleBracket[3] || '').trim() || null;
        } else {
            const bracketTrail = prefix.match(/^(.+?)\s*\[([^\]]+)\]$/);
            const parenTrail = prefix.match(/^(.+?)\s*\(([^)]+)\)$/);
            if (bracketTrail && !prefix.startsWith('[')) {
                speaker = bracketTrail[1].trim();
                emotion = bracketTrail[2].trim() || null;
            } else if (parenTrail && !prefix.startsWith('[')) {
                speaker = parenTrail[1].trim();
                emotion = parenTrail[2].trim() || null;
            } else {
                const singleBracket = prefix.match(/^\[([^\]]+)\]$/);
                if (singleBracket) speaker = singleBracket[1].trim();
            }
        }
        speaker = speaker.replace(/^[*_[\s]+|[*_\]\s]+$/g, '').trim();
        if (speaker.length > 40 || /[.!?]$/.test(speaker) || speaker.includes(';')) {
            return null;
        }
        return { speaker, emotion, content };
    };

    const blocks: ScriptTextBlock[] = [];
    let currentBlock: ScriptTextBlock | null = null;

    const flushCurrent = (): void => {
        if (!currentBlock) return;
        blocks.push(currentBlock);
        currentBlock = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) continue;

        if (isDividerOrHeader(trimmed)) {
            flushCurrent();
            blocks.push({ type: 'divider', text: trimmed });
            continue;
        }

        const parsed = parseSpeakerPrefix(line);
        if (parsed) {
            const { speaker, emotion, content } = parsed;
            const isNarr = isNarratorSpeaker(speaker);

            if (isNarr && currentBlock && isNarratorSpeaker(currentBlock.speaker)) {
                let piece = content;
                if (emotion) {
                    piece = `[${emotion}] ${content}`;
                }
                currentBlock.text = joinTextWithPunct(currentBlock.text, piece);
            } else {
                flushCurrent();
                currentBlock = {
                    type: 'speaker',
                    speaker: isNarr ? 'Narrator' : speaker,
                    emotion: emotion || null,
                    text: content
                };
            }
        } else {
            if (currentBlock && isNarratorSpeaker(currentBlock.speaker)) {
                currentBlock.text = joinTextWithPunct(currentBlock.text, trimmed);
            } else {
                flushCurrent();
                currentBlock = {
                    type: 'speaker',
                    speaker: 'Narrator',
                    emotion: null,
                    text: trimmed
                };
            }
        }
    }

    flushCurrent();

    const output: string[] = [];
    for (const b of blocks) {
        if (b.type === 'divider') {
            output.push(b.text);
        } else {
            const emoStr = b.emotion ? `[${b.emotion}] ` : '';
            output.push(`${b.speaker}: ${emoStr}${b.text}`);
        }
    }

    return output.join('\n\n');
}

/**
 * Combines adjacent narrator segments across the script turn sequence.
 * Reduces vocal variation during exposition while strictly preserving character dialogue boundaries.
 */
export function combineAdjacentNarratorSegments<T extends Partial<ParsedDramaChunk>>(
    chunks: T[],
    maxWords = Infinity
): Array<T & ParsedDramaChunk> {
    if (!Array.isArray(chunks) || chunks.length === 0) return [];

    const isNarrator = (speaker: unknown): boolean =>
        !speaker || String(speaker).trim().toLowerCase() === 'narrator';
    const localCountWords = (str: unknown): number =>
        (String(str || '').match(/\b\w+\b/g) || []).length;

    const formatFullLine = (speaker: string, emotion: string | null | undefined, text: string): string => {
        const spk = speaker || 'Narrator';
        return emotion ? `${spk}: [${emotion}] ${text}` : `${spk}: ${text}`;
    };

    const joinSpoken = (a: string, b: string): string => {
        const cleanA = String(a || '').trim();
        const cleanB = String(b || '').trim();
        if (!cleanA) return cleanB;
        if (!cleanB) return cleanA;
        const needsPunct = !/[.?!:;—–"']$/.test(cleanA);
        return cleanA + (needsPunct ? '. ' : ' ') + cleanB;
    };

    const combined: Array<T & ParsedDramaChunk> = [];
    let currentNarrator: (T & ParsedDramaChunk) | null = null;
    let currentNarratorFollowsPriorNarrator = false;

    const flushNarrator = (): void => {
        if (!currentNarrator) return;
        combined.push(currentNarrator);
        currentNarrator = null;
    };

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        if (isNarrator(chunk.speaker)) {
            const chunkSpoken = chunk.spokenText || chunk.text || '';
            const chunkWords = localCountWords(chunkSpoken);

            if (!currentNarrator) {
                const spk = chunk.speaker || 'Narrator';
                const emo = chunk.emotion ?? null;
                const txt = chunk.text || chunkSpoken;
                currentNarrator = {
                    ...chunk,
                    index: combined.length,
                    speaker: spk,
                    emotion: emo,
                    text: txt,
                    spokenText: chunkSpoken,
                    rawSpoken: chunk.rawSpoken || chunkSpoken,
                    breezeText: chunk.breezeText || chunkSpoken,
                    drama3Text: chunk.drama3Text || chunk.rawSpoken || chunkSpoken,
                    isContinuation: currentNarratorFollowsPriorNarrator || Boolean(chunk.isContinuation),
                    wordCount: chunkWords,
                    paragraphIndex: chunk.paragraphIndex ?? 0,
                    sourceLineIndex: chunk.sourceLineIndex ?? 0,
                    fullLine: formatFullLine(spk, emo, txt)
                };
            } else {
                const combinedSpoken = joinSpoken(currentNarrator.spokenText, chunkSpoken);
                const combinedText = joinSpoken(currentNarrator.text, chunk.text || chunkSpoken);
                const combinedRaw = joinSpoken(
                    currentNarrator.rawSpoken || currentNarrator.spokenText,
                    chunk.rawSpoken || chunkSpoken
                );
                const combinedBreeze = joinSpoken(
                    currentNarrator.breezeText || currentNarrator.spokenText,
                    chunk.breezeText || chunkSpoken
                );
                const combinedDrama3 = joinSpoken(
                    currentNarrator.drama3Text || currentNarrator.rawSpoken || currentNarrator.spokenText,
                    chunk.drama3Text || chunk.rawSpoken || chunkSpoken
                );
                const combinedWords = localCountWords(combinedSpoken);

                if (maxWords === Infinity || !maxWords || combinedWords <= maxWords) {
                    currentNarrator.text = combinedText;
                    currentNarrator.spokenText = combinedSpoken;
                    currentNarrator.rawSpoken = combinedRaw;
                    currentNarrator.breezeText = combinedBreeze;
                    currentNarrator.drama3Text = combinedDrama3;
                    currentNarrator.wordCount = combinedWords;
                    if (!currentNarrator.emotion && chunk.emotion) {
                        currentNarrator.emotion = chunk.emotion;
                    }
                    currentNarrator.fullLine = formatFullLine(
                        currentNarrator.speaker,
                        currentNarrator.emotion,
                        currentNarrator.text
                    );
                } else {
                    flushNarrator();
                    currentNarratorFollowsPriorNarrator = true;
                    const spk = chunk.speaker || 'Narrator';
                    const emo = chunk.emotion ?? null;
                    const txt = chunk.text || chunkSpoken;
                    currentNarrator = {
                        ...chunk,
                        index: combined.length,
                        speaker: spk,
                        emotion: emo,
                        text: txt,
                        spokenText: chunkSpoken,
                        rawSpoken: chunk.rawSpoken || chunkSpoken,
                        breezeText: chunk.breezeText || chunkSpoken,
                        drama3Text: chunk.drama3Text || chunk.rawSpoken || chunkSpoken,
                        isContinuation: true,
                        wordCount: chunkWords,
                        paragraphIndex: chunk.paragraphIndex ?? 0,
                        sourceLineIndex: chunk.sourceLineIndex ?? 0,
                        fullLine: formatFullLine(spk, emo, txt)
                    };
                }
            }
        } else {
            flushNarrator();
            currentNarratorFollowsPriorNarrator = false;
            combined.push({ ...(chunk as T & ParsedDramaChunk) });
        }
    }

    flushNarrator();

    return combined.map((c, idx) => ({
        ...c,
        index: idx
    }));
}

/**
 * Deterministically parses an Audio Drama script into structured multi-voice lines.
 * Extracts speaker attribution, optional inline vocal emotion tag(s), and spoken text.
 */
export function parseAudioDramaScript(
    rawText: unknown,
    options: ParseAudioDramaOptions = { raw: false, collapseNarrator: false }
): ParsedDramaChunk[] {
    if (!rawText) return [];
    let text: string;
    if (typeof rawText === 'object' && rawText !== null) {
        const rec = rawText as Record<string, unknown>;
        text = String(rec.final || rec.draft || rec.text || rec.content || '');
    } else {
        text = String(rawText || '');
    }

    if (!text.trim()) return [];

    text = text.replace(/<prose_text>([\s\S]*?)<\/prose_text>/gi, '$1');
    text = text.replace(/```[a-z]*\n([\s\S]*?)```/gi, '$1');
    text = text.replace(/<(?!\/?(?:whisper|emphasis|stress|soft|fast|slow|forceful)\b)[^>]+>/gi, '');
    text = text.replace(/\r\n/g, '\n');

    const shouldCollapseNarrator = Boolean(options && options.collapseNarrator);
    if (shouldCollapseNarrator) {
        text = combineAdjacentNarratorScriptBlocks(text);
    } else {
        text = normalizeAudioDramaScript(text);
    }

    const rawLines = text.split('\n');
    const parsedChunks: ParsedDramaChunk[] = [];
    let lastSpeaker = 'Narrator';

    let paragraphIdx = 0;
    const isRawMode = Boolean(options && options.raw);

    const pushSpokenAsChunks = (
        speakerName: string,
        emotionTag: string | null,
        spokenStr: string,
        pIdx = 0,
        lIdx = 0,
        rawSpokenText: string | null = null
    ): void => {
        if (!spokenStr || !/[a-zA-Z0-9]/.test(spokenStr)) return;
        let cleanEmotion: string | null = null;
        if (emotionTag) {
            const stripped = emotionTag.replace(/^[[(*]+|[\])*]+$/g, '').trim();
            if (
                /^(?:pause|beat|silence|long\s+pause|short\s+pause|brief\s+pause|hesitates?|hesitation|moment|waits?|after\s+a\s+beat|break|gap|breath|takes?\s+a\s+breath|deep\s+breath)$/i.test(
                    stripped
                )
            ) {
                cleanEmotion = null;
            } else if (stripped.length > 25 || /\.\s+/.test(stripped)) {
                cleanEmotion = stripped;
            } else {
                const parts = stripped
                    .split(/[,;/]+/)
                    .map((p) => p.trim())
                    .filter(
                        (p) =>
                            p &&
                            !/^(?:pause|beat|silence|long\s+pause|short\s+pause|brief\s+pause|hesitates?|hesitation|moment|waits?|after\s+a\s+beat|break|gap|breath|takes?\s+a\s+breath|deep\s+breath)$/i.test(
                                p
                            )
                    );
                if (parts.length > 0) {
                    cleanEmotion = parts.join(', ');
                }
            }
        }

        const sourceRaw = rawSpokenText || spokenStr;
        const hasLeadingBracket = /^\s*\[[^\]]+\]/.test(sourceRaw);
        const drama3InputRaw =
            cleanEmotion && !hasLeadingBracket ? `[${cleanEmotion}] ${sourceRaw}` : sourceRaw;
        const tagInfo = extractSpokenAndTags(drama3InputRaw);
        const breezeStr = tagInfo?.breezeText || drama3InputRaw;
        const drama3Str = tagInfo?.drama3Text || drama3InputRaw;

        if (isRawMode || (speakerName && speakerName.toLowerCase() === 'narrator')) {
            parsedChunks.push({
                index: parsedChunks.length,
                speaker: speakerName,
                emotion: cleanEmotion || null,
                text: spokenStr,
                spokenText: spokenStr,
                rawSpoken: drama3InputRaw,
                breezeText: breezeStr,
                drama3Text: drama3Str,
                isContinuation: false,
                fullLine: `${speakerName}: ${drama3Str}`,
                wordCount:
                    (spokenStr.match(/\b\w+\b/g) || breezeStr.match(/\b\w+\b/g) || []).length || 1,
                paragraphIndex: pIdx,
                sourceLineIndex: lIdx
            });
            return;
        }

        const subchunks = splitSpokenTextIntoTtsSubchunks(spokenStr, 120);
        subchunks.forEach((subText, subIdx) => {
            const subRaw =
                subchunks.length === 1
                    ? drama3InputRaw
                    : subIdx === 0 && cleanEmotion
                      ? `[${cleanEmotion}] ${subText}`
                      : subText;
            const subTagInfo =
                subchunks.length === 1 && tagInfo ? tagInfo : extractSpokenAndTags(subRaw);
            const subBreeze = subTagInfo?.breezeText || subRaw;
            const subDrama3 = subTagInfo?.drama3Text || subRaw;

            parsedChunks.push({
                index: parsedChunks.length,
                speaker: speakerName,
                emotion: cleanEmotion || null,
                text: subText,
                spokenText: subText,
                rawSpoken: subRaw,
                breezeText: subBreeze,
                drama3Text: subDrama3,
                isContinuation: subIdx > 0,
                fullLine: `${speakerName}: ${subDrama3}`,
                wordCount:
                    (subText.match(/\b\w+\b/g) || subBreeze.match(/\b\w+\b/g) || []).length || 1,
                paragraphIndex: pIdx,
                sourceLineIndex: lIdx
            });
        });
    };

    rawLines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
            paragraphIdx++;
            return;
        }
        if (/^={3,}|^---|^###|^===|^\*\s*\*\s*\*$/i.test(trimmed)) return;
        if (/^(?:ACT|SEQUENCE|SCENE)\s+[0-9IVXLCDM]+/i.test(trimmed)) return;

        const cleanLine = trimmed.replace(/^[-*•]\s+/, '');
        const colonMatch = cleanLine.match(/^(.{1,60}?)\s*:\s*(.*)$/);
        let matchedValidSpeakerPrefix = false;

        if (colonMatch) {
            let prefix = colonMatch[1].trim();
            const spoken = colonMatch[2].trim();

            prefix = prefix.replace(/^[*_]+|[*_]+$/g, '').trim();

            let emotion: string | null = null;
            let speaker = prefix;

            const doubleBracket = prefix.match(/^\[([^\]]+)\]\s*(?:\[([^\]]+)\]|\(([^)]+)\))$/);
            if (doubleBracket) {
                speaker = doubleBracket[1].trim();
                emotion = (doubleBracket[2] || doubleBracket[3] || '').trim() || null;
            } else {
                const bracketTrail = prefix.match(/^(.+?)\s*\[([^\]]+)\]$/);
                const parenTrail = prefix.match(/^(.+?)\s*\(([^)]+)\)$/);
                if (bracketTrail && !prefix.startsWith('[')) {
                    speaker = bracketTrail[1].trim();
                    emotion = bracketTrail[2].trim() || null;
                } else if (parenTrail && !prefix.startsWith('[')) {
                    const candidateEmotion = parenTrail[2].trim();
                    if (
                        /^(?:whisper(?:ing|s)?|softly|quietly|loudly|angry|angrily|sadly|gently|firmly|coldly|warmly|tiredly|wearily|aside|internal|o\.s\.|v\.o\.|slowly|gravelly|in chorus|resolute|somber|measured|[a-z]{3,20}ly)$/i.test(
                            candidateEmotion
                        )
                    ) {
                        speaker = parenTrail[1].trim();
                        emotion = candidateEmotion;
                    } else {
                        speaker = prefix;
                    }
                } else {
                    const dashEmotion = prefix.match(
                        /^(.+?)\s*(?:[-—–]|\s*,)\s*(?:\[([^\]]+)\]|\(([^)]+)\)|([a-zA-Z\s,.'"-]{3,40}))$/
                    );
                    if (dashEmotion && !prefix.startsWith('[')) {
                        speaker = dashEmotion[1].trim();
                        emotion =
                            (dashEmotion[2] || dashEmotion[3] || dashEmotion[4] || '').trim() || null;
                    } else {
                        const singleBracket = prefix.match(/^\[([^\]]+)\]$/);
                        if (singleBracket) {
                            speaker = singleBracket[1].trim();
                        }
                    }
                }
            }

            speaker = speaker.replace(/^[*_[\s]+|[*_\]\s]+$/g, '').trim();

            if (speaker && speaker.length <= 40 && !/[.!?]$/.test(speaker) && !speaker.includes(';')) {
                matchedValidSpeakerPrefix = true;
                lastSpeaker = speaker;

                let remainingSpoken = spoken;
                while (remainingSpoken) {
                    const postEmotion = remainingSpoken.match(/^(?:\[([^\]]+)\]|\(([^)]+)\))\s*(.*)$/);
                    if (!postEmotion) break;
                    const tagContent = (postEmotion[1] || postEmotion[2] || '').trim();
                    const rest = (postEmotion[3] || '').trim();

                    const isVocal = postEmotion[2]
                        ? classifyParentheticalTag(`(${tagContent})`)?.kind === 'vocal_event'
                        : false;
                    if (isVocal) break;

                    if (!rest && postEmotion[2]) break;
                    if (tagContent) {
                        emotion = emotion ? `${emotion}, ${tagContent}` : tagContent;
                    }
                    remainingSpoken = rest;
                }

                const cleanedSpoken = cleanDialogueSpokenText(remainingSpoken);
                const hasSpeakable =
                    (cleanedSpoken && /[a-zA-Z0-9]/.test(cleanedSpoken)) ||
                    (remainingSpoken && /[a-zA-Z0-9]/.test(remainingSpoken));
                if (hasSpeakable) {
                    pushSpokenAsChunks(
                        speaker,
                        emotion,
                        cleanedSpoken || remainingSpoken,
                        paragraphIdx,
                        lineIdx,
                        spoken
                    );
                }
            }
        }

        if (!matchedValidSpeakerPrefix) {
            let remainingSpoken = trimmed;
            let emotion: string | null = null;
            let hadLeadingTag = false;
            while (remainingSpoken) {
                const bracketMatch = remainingSpoken.match(/^(?:\[([^\]]+)\]|\(([^)]+)\))\s*(.*)$/);
                if (!bracketMatch) break;
                const rest = (bracketMatch[3] || '').trim();

                const isVocal = bracketMatch[2]
                    ? classifyParentheticalTag(`(${bracketMatch[2].trim()})`)?.kind === 'vocal_event'
                    : false;
                if (isVocal) break;

                if (!rest && bracketMatch[2]) break;
                hadLeadingTag = true;
                const extractedEmo = (bracketMatch[1] || bracketMatch[2] || '').trim();
                if (extractedEmo) {
                    emotion = emotion ? `${emotion}, ${extractedEmo}` : extractedEmo;
                }
                remainingSpoken = rest;
            }
            const speaker = hadLeadingTag ? lastSpeaker : 'Narrator';
            const cleanedSpoken = cleanDialogueSpokenText(remainingSpoken);
            const hasSpeakable =
                (cleanedSpoken && /[a-zA-Z0-9]/.test(cleanedSpoken)) ||
                (remainingSpoken && /[a-zA-Z0-9]/.test(remainingSpoken));
            if (hasSpeakable) {
                pushSpokenAsChunks(
                    speaker,
                    emotion,
                    cleanedSpoken || remainingSpoken,
                    paragraphIdx,
                    lineIdx,
                    trimmed
                );
            }
        }
    });

    if (isRawMode || !shouldCollapseNarrator) {
        return parsedChunks;
    }
    return combineAdjacentNarratorSegments(parsedChunks, Infinity);
}

/**
 * Detects whether a string is formatted as an audio drama script
 * (e.g. lines beginning with 'SpeakerName: ' or 'Narrator: ', or convertible [SPEAKER] turns).
 */
export function isAudioDramaScriptText(text: unknown): boolean {
    if (!text || typeof text !== 'string') return false;
    const candidate = normalizeAudioDramaScript(text);
    const cleanLines = candidate
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('===') && !/^---+$/.test(l));
    if (cleanLines.length < 2) return false;
    const speakerLines = cleanLines.filter((l) => /^[\p{L}\p{N}_'\s.\-&/]{1,50}:\s+.+/iu.test(l));
    return speakerLines.length / cleanLines.length >= 0.5;
}

/**
 * Comprehensive dialogue and narration statistics extractor.
 * Understands both traditional novel prose (dialogue in quotes) and
 * Audio Drama scripts (where all text after a character name other than Narrator is dialogue).
 */
export function extractDialogueStats(
    text: unknown,
    options: ExtractDialogueStatsOptions = {}
): DialogueStatsResult {
    if (!text || typeof text !== 'string') {
        return {
            dialogueWords: 0,
            narratorWords: 0,
            spokenTotalWords: 0,
            totalWords: 0,
            dialogueRatio: 0,
            dialoguePercentage: '0%',
            isAudioDrama: false
        };
    }
    const cleanText = text.trim();
    if (!cleanText) {
        return {
            dialogueWords: 0,
            narratorWords: 0,
            spokenTotalWords: 0,
            totalWords: 0,
            dialogueRatio: 0,
            dialoguePercentage: '0%',
            isAudioDrama: false
        };
    }

    const totalWords = cleanText.split(/\s+/).filter(Boolean).length;
    if (totalWords === 0) {
        return {
            dialogueWords: 0,
            narratorWords: 0,
            spokenTotalWords: 0,
            totalWords: 0,
            dialogueRatio: 0,
            dialoguePercentage: '0%',
            isAudioDrama: false
        };
    }

    let isDrama = options.isAudioDrama;
    if (isDrama === undefined || isDrama === null) {
        isDrama = isAudioDramaScriptText(cleanText);
    }

    let dialogueWords = 0;
    let narratorWords = 0;

    if (isDrama) {
        const rawLines = cleanText.split('\n');
        let currentSpeaker = 'Narrator';
        for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('===') || /^---+$/.test(trimmed)) {
                continue;
            }

            const colonMatch = trimmed.match(/^([A-Za-z0-9_'\s-]{1,50})\s*:\s*(.*)$/);
            let lineContent = trimmed;
            if (colonMatch) {
                currentSpeaker = colonMatch[1].replace(/^[*_[\s]+|[*_\]\s]+$/g, '').trim();
                lineContent = colonMatch[2].trim();
            }

            const spokenClean = cleanDialogueSpokenText(lineContent);
            const dCount = spokenClean.split(/\s+/).filter(Boolean).length;
            const isNarrator = /^narrator$/i.test(currentSpeaker);
            if (!isNarrator) {
                dialogueWords += dCount;
            } else {
                narratorWords += dCount;
            }
        }
    } else {
        const tokens = cleanText.split(/\s+/);
        let inQuote = false;
        for (const tok of tokens) {
            const cnt = (tok.match(/[\u0022\u201C\u201D]/g) || []).length;
            if (cnt % 2 !== 0) {
                inQuote = !inQuote;
                dialogueWords++;
            } else if (inQuote || cnt > 0) {
                dialogueWords++;
            }
        }
    }

    const spokenTotalWords = isDrama ? dialogueWords + narratorWords : totalWords;
    const ratioDenominator = isDrama && spokenTotalWords > 0 ? spokenTotalWords : totalWords;
    const dialogueRatio = ratioDenominator > 0 ? dialogueWords / ratioDenominator : 0;
    return {
        dialogueWords,
        narratorWords,
        spokenTotalWords,
        totalWords,
        dialogueRatio,
        dialoguePercentage: `${Math.round(dialogueRatio * 100)}%`,
        isAudioDrama: Boolean(isDrama)
    };
}

/**
 * Detects leaked assistant thinking, evaluation reflections, or meta-commentary
 * to prevent reasoning text from accidentally leaking into scene prose.
 */
export function isMetaCommentaryText(str: unknown): boolean {
    if (!str || typeof str !== 'string') return true;
    const s = str.trim();
    if (s.length < 15) return true;
    return /\b(evaluate_draft|commit_scene_prose|dialogue percentage|pacing target|let me check|let me rewrite|ah, I see|my draft is at|target is ~|as required by the|CONVERSATIONAL_COLLISION|PHYSICAL_IMMEDIACY)\b/i.test(
        s
    );
}

/** Builds an estimated proportional timeline of cues across prose or drama script text. */
export function buildEstimatedCueTimeline(
    proseText: unknown,
    totalDurationSec: number,
    isDrama = false
): TimelineCuePoint[] {
    const dur = Number(totalDurationSec) || 0;
    if (!proseText || typeof proseText !== 'string' || !proseText.trim() || dur <= 0) return [];

    const rawCues: Array<{ text: string; spokenText: string; speaker: string }> = [];
    if (isDrama) {
        const parsed = parseAudioDramaScript(proseText, { collapseNarrator: false }) || [];
        parsed.forEach((turn) => {
            const txt = String(turn.cleanText || turn.spokenText || turn.text || '').trim();
            if (!txt) return;
            const spk = turn.speaker || 'Narrator';
            const parts = String(spk).toLowerCase() === 'narrator' ? splitLongCueText(txt, 200) : [txt];
            parts.forEach((p) => rawCues.push({ text: p, spokenText: p, speaker: spk }));
        });
    } else {
        const chunks = chunkProseForTts(proseText, 60, 180) || [];
        chunks.forEach((ch) => {
            if (ch && ch.text) {
                rawCues.push({ text: ch.text, spokenText: ch.text, speaker: 'Narrator' });
            }
        });
    }

    if (rawCues.length === 0) return [];
    const weights = rawCues.map((c) => computeCueTextWeight(c.text));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || rawCues.length;
    let cursor = 0;

    return rawCues.map((c, idx) => {
        const cueStart = cursor;
        const cueEnd =
            idx === rawCues.length - 1
                ? dur
                : Math.min(dur, cursor + dur * (weights[idx] / totalWeight));
        cursor = cueEnd;
        return {
            index: idx,
            startSec: Number(cueStart.toFixed(3)),
            endSec: Number(cueEnd.toFixed(3)),
            text: c.text,
            spokenText: c.spokenText,
            speaker: c.speaker
        };
    });
}
