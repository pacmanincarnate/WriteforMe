/**
 * @module domain/validation/proseQuality
 * Dynamic n-gram over-use detection, rolling dialogue pacing, prose telemetry/slop analysis,
 * Writing Agent fenced output parsing, valence state parsing, and prompt-cache ordering validation.
 */

import type { Story } from '@/types';
import type { SlopConfig } from '@/types/slop';
import {
    extractDialogueStats,
    isAudioDramaScriptText,
    normalizeAudioDramaScript
} from '@/domain/audio';
import { DEFAULT_SLOP_CONFIG, scanTextForSlop } from '@/domain/slop';

export interface RollingDialogueSceneStat {
    wordCount?: number;
    dialogueWords?: number;
    [key: string]: unknown;
}

export interface RollingDialogueStatus {
    currentWords: number;
    currentDialogueWords: number;
    currentDensity: number;
    totalWindowWords: number;
    totalWindowDialogue: number;
    rollingDensity: number;
    windowSceneCount: number;
    isPass: boolean;
    prevScenes: RollingDialogueSceneStat[];
}

export interface ProseQualitySlopSummary {
    hardCount: number;
    closerCount: number;
    flagCount: number;
    clusteredFlagCount: number;
    patternCount: number;
    densityCount: number;
    emDashPer1k: number;
    shouldTriggerSurgicalGate: boolean;
}

export interface ProseQualityAnalysis {
    wordCount: number;
    dialogueRatio: number;
    rhythmVariance: number;
    sensoryDensity: number;
    sensoryWordCount: number;
    adverbDensity: number;
    adverbCount: number;
    bannedPhraseDensity: number;
    bannedPhraseCount: number;
    bannedMatches: string[];
    slopAudit?: ProseQualitySlopSummary;
}

export interface ProseQualityOptions {
    slopConfig?: Partial<SlopConfig>;
    story?: Partial<Story> | null;
    isAudioDrama?: boolean;
}

export interface PromptCacheOrderValidation {
    valid: boolean;
    reason?: string;
}

/** Identifies overused 2–4 word n-grams in recent prose outside stopwords and character exclusions. */
export function getDynamicBannedPhrases(
    recentProse: string | null | undefined,
    exclusions: unknown[] = []
): string[] {
    if (!recentProse) return [];

    const cleanText = recentProse
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');

    const stopWords = new Set([
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as',
        'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will',
        'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
        'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year',
        'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its',
        'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
        'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'said', 'asked', 'replied', 'nodded',
        'looked', 'turned', 'eyes', 'face', 'head', 'hand', 'hands', 'voice', 'door', 'room', 'man', 'woman', 'felt',
        'knew', 'saw', 'heard', 'stood', 'sat', 'walked', 'went', 'came', 'told', 'left', 'right', 'down', 'around',
        'away', 'off', 'through', 'something', 'anything', 'nothing', 'everything', 'someone', 'anyone', 'everyone',
        'was', 'were', 'had', 'been', 'are', 'is', 'am', 'has', 'did', 'doing', 'does', 'got', 'gotten',
        'going', 'gone', 'very', 'really', 'too', 'quite', 'rather', 'somewhat', 'almost', 'always', 'never',
        'sometimes', 'often', 'usually', 'suddenly', 'finally', 'quickly', 'slowly', 'carefully', 'sudden', 'moment',
        'second', 'minute', 'hour', 'while', 'during', 'before', 'until', 'again', 'once', 'twice',
        'against', 'between', 'under', 'below', 'above', 'behind', 'across', 'along', 'without', 'within', 'toward',
        'towards', 'inside', 'outside', 'onto', 'upon', 'near', 'past', 'throughout', 'among', 'where', 'why', 'here'
    ]);

    const ex = new Set(exclusions.map((e) => String(e).toLowerCase().trim()));
    const words = cleanText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    const ngrams: Record<string, number> = {};
    const addNgram = (phrase: string): void => {
        if (!phrase) return;
        const parts = phrase.split(' ');
        if (parts.every((p) => stopWords.has(p) || ex.has(p))) return;
        if (parts.some((p) => ex.has(p))) return;
        ngrams[phrase] = (ngrams[phrase] || 0) + 1;
    };

    for (let i = 0; i < words.length; i++) {
        if (i < words.length - 1) addNgram(`${words[i]} ${words[i + 1]}`);
        if (i < words.length - 2) addNgram(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
        if (i < words.length - 3) addNgram(`${words[i]} ${words[i + 1]} ${words[i + 2]} ${words[i + 3]}`);
    }

    return Object.entries(ngrams)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map((entry) => entry[0]);
}

/** Computes single-scene and rolling multi-scene dialogue density ratio. */
export function computeRollingDialogueStatus(
    currentProse: string | null | undefined,
    prevScenesStats: RollingDialogueSceneStat[] = []
): RollingDialogueStatus {
    const dStats = extractDialogueStats(currentProse);
    const words = (currentProse || '').trim().split(/\s+/).filter(Boolean);
    const dWords = dStats.dialogueWords;

    let totalWindowWords = words.length;
    let totalWindowDialogue = dWords;
    for (const s of prevScenesStats) {
        totalWindowWords += s.wordCount || 0;
        totalWindowDialogue += s.dialogueWords || 0;
    }

    const currentDensity = words.length > 0 ? dWords / words.length : 0;
    const rollingDensity = totalWindowWords > 0 ? totalWindowDialogue / totalWindowWords : 0;
    const windowSceneCount = prevScenesStats.length + 1;

    return {
        currentWords: words.length,
        currentDialogueWords: dWords,
        currentDensity,
        totalWindowWords,
        totalWindowDialogue,
        rollingDensity,
        windowSceneCount,
        isPass: rollingDensity >= 0.15 || words.length <= 100,
        prevScenes: prevScenesStats
    };
}

/** Computes dialogue percentage, sentence rhythm stdev, sensory density, adverb density, and slop metrics. */
export function analyzeProseQuality(
    proseText: unknown,
    bannedPhrases: string[] = [],
    options: ProseQualityOptions = {}
): ProseQualityAnalysis {
    if (!proseText || typeof proseText !== 'string') {
        return {
            wordCount: 0,
            dialogueRatio: 0,
            rhythmVariance: 0,
            sensoryDensity: 0,
            sensoryWordCount: 0,
            adverbDensity: 0,
            adverbCount: 0,
            bannedPhraseDensity: 0,
            bannedPhraseCount: 0,
            bannedMatches: [],
            slopAudit: {
                hardCount: 0,
                closerCount: 0,
                flagCount: 0,
                clusteredFlagCount: 0,
                patternCount: 0,
                densityCount: 0,
                emDashPer1k: 0,
                shouldTriggerSurgicalGate: false
            }
        };
    }

    const words = proseText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount === 0) {
        return {
            wordCount: 0,
            dialogueRatio: 0,
            rhythmVariance: 0,
            sensoryDensity: 0,
            sensoryWordCount: 0,
            adverbDensity: 0,
            adverbCount: 0,
            bannedPhraseDensity: 0,
            bannedPhraseCount: 0,
            bannedMatches: []
        };
    }

    const dStats = extractDialogueStats(proseText);
    const dialogueRatio = parseFloat((dStats.dialogueRatio * 100).toFixed(2));

    const rawSentences = proseText.split(/(?<=[.!?])\s+/).filter(Boolean);
    const sentenceLengths = rawSentences
        .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
        .filter((l) => l > 0);
    let rhythmVariance = 0;
    if (sentenceLengths.length > 1) {
        const mean = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
        const variance =
            sentenceLengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sentenceLengths.length;
        rhythmVariance = parseFloat(Math.sqrt(variance).toFixed(2));
    }

    const SENSORY_REGEX =
        /\b(saw|bright|dark|shadow|shadows|gleam|gleamed|glow|glowing|red|blue|green|crimson|pale|shimmer|shimmered|gaze|gazed|glimpse|glimpsed|flash|flashed|flicker|flickered|silhouette|silhouettes|blur|blurred|glare|sparkle|sparkled|dim|vivid|golden|silver|amber|onyx|emerald|obsidian|iridescent|radiant|transparent|murky|pitch|neon|sound|sounded|hear|heard|murmur|murmured|whisper|whispered|echo|echoed|hum|humming|roar|roared|hiss|hissed|clang|clanged|scream|screamed|shriek|shrieked|rattle|rattled|snap|snapped|crackle|crackled|buzz|buzzing|chime|chimed|thump|thumped|clatter|clattered|rustle|rustled|rumble|rumbled|deafening|screech|creak|creaked|ring|ringing|raspy|acoustic|resonance|smell|smelled|scent|scented|odor|aroma|fragrance|stench|musk|musky|metallic|ozone|acrid|stale|perfume|pungent|foul|floral|damp|smokey|sulfur|vinegar|citrus|sweet|sour|putrid|rotten|taste|tasted|bitter|salty|savory|tangy|copper|acid|iron|burnt|scorch|scorched|plasma|spicy|astringent|bile|blood|nectar|ash|touch|touched|feel|feeling|cold|warm|hot|icy|burning|smooth|rough|coarse|sharp|soft|hard|wet|dry|pressure|prickle|prickled|numb|sting|stung|tingle|tingled|grit|gritty|sticky|slick|greasy|heavy|lightweight|shivering|pulse|pulsing|vibration|friction|grain)\b/gi;
    const sensoryMatches = proseText.match(SENSORY_REGEX) || [];
    const sensoryWordCount = sensoryMatches.length;
    const sensoryDensity = parseFloat((sensoryWordCount / (wordCount / 100)).toFixed(2));

    const ADVERB_CANDIDATE_REGEX = /\b[a-zA-Z]+ly\b/gi;
    const NON_ADVERB_EXCLUSIONS = new Set([
        'only', 'early', 'family', 'friendly', 'daily', 'lonely', 'holy', 'ugly',
        'deadly', 'lively', 'likely', 'unlikely', 'anomaly', 'ally', 'belly',
        'rally', 'bully', 'supply', 'apply', 'imply', 'reply', 'rely', 'fly',
        'jelly', 'lily', 'folly', 'silly', 'curly', 'chilly', 'orderly',
        'elderly', 'monopoly', 'assembly', 'butterfly', 'dragonfly', 'gravelly',
        'pebbly', 'crinkly', 'wrinkly', 'bristly', 'steely', 'wooly', 'oily',
        'alley', 'valley', 'volley', 'galley', 'trolley', 'medley', 'motley', 'barley', 'parsley'
    ]);
    const rawAdverbMatches = proseText.match(ADVERB_CANDIDATE_REGEX) || [];
    const adverbMatches = rawAdverbMatches.filter((w) => !NON_ADVERB_EXCLUSIONS.has(w.toLowerCase()));
    const adverbCount = adverbMatches.length;
    const adverbDensity = parseFloat((adverbCount / (wordCount / 100)).toFixed(2));

    const auditRes = scanTextForSlop(proseText, {
        slopConfig: (options?.slopConfig || DEFAULT_SLOP_CONFIG) as SlopConfig,
        customBannedPhrases: bannedPhrases,
        story: (options?.story || null) as Story | null,
        isAudioDrama: Boolean(options?.isAudioDrama)
    });
    const actionable = [
        ...(auditRes.hardHits || []),
        ...(auditRes.closerHits || []),
        ...(auditRes.clusteredFlagHits || [])
    ];
    const bannedPhraseCount = actionable.length;
    const bannedMatches: string[] = [];
    const seenBm = new Set<string>();
    actionable.forEach((h) => {
        const key = String(h.match || '').toLowerCase();
        if (key && !seenBm.has(key)) {
            seenBm.add(key);
            bannedMatches.push(key);
        }
    });
    const slopAuditSummary: ProseQualitySlopSummary = {
        hardCount: auditRes.summary.hardCount,
        closerCount: auditRes.summary.closerCount,
        flagCount: auditRes.summary.flagCount,
        clusteredFlagCount: auditRes.summary.clusteredFlagCount,
        patternCount: auditRes.summary.patternCount,
        densityCount: auditRes.summary.densityCount,
        emDashPer1k: auditRes.summary.emDashPer1k,
        shouldTriggerSurgicalGate: auditRes.summary.shouldTriggerSurgicalGate
    };

    const bannedPhraseDensity = parseFloat((bannedPhraseCount / (wordCount / 100)).toFixed(2));

    return {
        wordCount,
        dialogueRatio,
        rhythmVariance,
        sensoryDensity,
        sensoryWordCount,
        adverbDensity,
        adverbCount,
        bannedPhraseDensity,
        bannedPhraseCount,
        bannedMatches,
        slopAudit: slopAuditSummary
    };
}

/** Extracts clean scene prose from `<prose_text>` XML fences and normalizes Audio Drama scripts. */
export function parseWritingOutput(text: unknown): { prose: string } {
    if (!text || typeof text !== 'string') return { prose: '' };

    let rawProse: string;
    const proseTagMatch = text.match(/<prose_text>([\s\S]*?)<\/prose_text>/i);
    if (proseTagMatch && proseTagMatch[1].trim()) {
        rawProse = proseTagMatch[1].trim();
    } else {
        const unclosedMatch = text.match(/<prose_text>([\s\S]*)$/i);
        if (unclosedMatch && unclosedMatch[1].trim()) {
            rawProse = unclosedMatch[1].trim();
        } else {
            let cleaned = text
                .replace(
                    /^[\s\S]*?(?:Here is (?:the|my) (?:complete )?(?:prose|story|scene|draft|chapter)(?: for [^:\n]+)?:|Here is the prose:|Here is the story:|Here is the scene:)\s*/i,
                    ''
                )
                .trim();

            const thinkingSplitMatch = cleaned.match(
                /^(?:(?:The dialogue percentage|Let me check|Ah, I see|evaluate_draft|pacing target|Let me rewrite|I need to expand|CONVERSATIONAL_COLLISION)[\s\S]*?\n\n+)([\s\S]+)$/i
            );
            if (thinkingSplitMatch && thinkingSplitMatch[1].trim()) {
                cleaned = thinkingSplitMatch[1].trim();
            }
            rawProse = cleaned || text.trim();
        }
    }

    if (rawProse && isAudioDramaScriptText(rawProse)) {
        rawProse = normalizeAudioDramaScript(rawProse);
    }

    return { prose: rawProse };
}

/** Parses qualitative or signed numeric value-shift valence states while preserving narrative labels. */
export function parseValenceState(rawVal: unknown, fallback: number | string = 0): number | string {
    if (rawVal === undefined || rawVal === null) return fallback;
    const str = String(rawVal).trim();
    if (!str) return fallback;
    if (/^[+-]?\d+$/.test(str)) {
        return parseInt(str, 10);
    }
    if (/^[+-]?\d+\.\d+$/.test(str)) {
        const num = parseFloat(str);
        if (!isNaN(num)) return num;
    }
    return str;
}

/** Ensures static prefix context blocks precede volatile dynamic tail blocks for prefix caching. */
export function validatePromptCacheOrder(promptText: unknown): PromptCacheOrderValidation {
    if (!promptText || typeof promptText !== 'string') {
        return { valid: false, reason: 'Empty prompt' };
    }

    const staticMarkers = [
        '<active_characters_profiles>',
        '<relationship_friction_matrix>',
        '<lore_subtext_context>',
        '<reference_style>',
        '<story_details>',
        '<status_quo>',
        '<genre_classification>',
        '<tone_and_atmosphere>',
        '<writing_style_description>',
        '<scene_blueprint>',
        '<narrative_world_context>',
        '<world_primer>',
        '<lore_context>',
        '<continuity_ledger>'
    ];
    const dynamicMarkers = [
        '<unresolved_continuity_mandates>',
        '<directive_rewrite_mandate>',
        '<directive_requirement>',
        '<draft_to_revise>',
        '<critical_issues>',
        '<reviewer_critique>',
        '=== DRAFT FOR REVISION ==='
    ];

    let lastStaticPos = -1;
    for (const sm of staticMarkers) {
        const pos = promptText.indexOf(sm);
        if (pos !== -1) {
            lastStaticPos = Math.max(lastStaticPos, pos);
        }
    }

    let firstDynamicPos = Infinity;
    for (const dm of dynamicMarkers) {
        const pos = promptText.indexOf(dm);
        if (pos !== -1) {
            firstDynamicPos = Math.min(firstDynamicPos, pos);
        }
    }

    if (lastStaticPos !== -1 && firstDynamicPos !== Infinity && lastStaticPos > firstDynamicPos) {
        return {
            valid: false,
            reason: `Static context block appeared at index ${lastStaticPos} after dynamic tail at index ${firstDynamicPos}`
        };
    }

    return { valid: true };
}
