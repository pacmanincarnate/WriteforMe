/**
 * @module domain/story/length
 * Closed-loop novel length controller (glide path & cascade control), word counting,
 * and aggregate story progress metrics.
 */

import type { ProseEntry, SceneBlueprint, Sequence, Story } from '@/types';

export interface BookTypeSpec {
    label: string;
    words: number;
    sceneFloor: number;
}

export const LENGTH_CONTROL = {
    DEFAULT_TARGET_WORDS: 80000,
    NOMINAL_SCENE_WORDS: 1500,
    BOOK_TYPES: {
        short_story: { label: 'Short Story', words: 20000, sceneFloor: 2 },
        novella: { label: 'Novella', words: 40000, sceneFloor: 3 },
        popular: { label: 'Popular', words: 80000, sceneFloor: 3 },
        full_length: { label: 'Full Length', words: 100000, sceneFloor: 3 },
        epic: { label: 'Epic', words: 200000, sceneFloor: 4 }
    } as Record<string, BookTypeSpec>,
    SEQUENCE_WEIGHTS: [0.1, 0.11, 0.13, 0.15, 0.13, 0.14, 0.15, 0.09],
    DEADBAND: 0.03,
    KP: 0.7,
    MAX_HORIZON_SHARE: 0.4,
    MULTIPLIER_MIN: 0.7,
    MULTIPLIER_MAX: 1.35,
    MULTIPLIER_SLEW: 0.15,
    SCENE_SHARE: 0.6,
    LENGTH_SHARE: 0.4,
    WORDS_ABS_MIN: 1100,
    WORDS_ABS_MAX: 2600,
    INNER_MIN: 0.85,
    INNER_MAX: 1.15,
    INNER_SLEW: 0.1,
    BIAS_ALPHA: 0.2,
    BIAS_MIN: 0.8,
    BIAS_MAX: 1.5,
    BIAS_SEED: 1.15,
    ACT_III_MIN_MULTIPLIER: 0.85,
    CLIMAX_MIN_SCENES: 4,
    RESOLUTION_MIN_SCENES: 3
};

export interface NovelLengthMeasurement {
    wordsWritten: number;
    scenesWritten: number;
    perSequenceWords: number[];
    perSequenceScenes: number[];
    perSequenceUnwritten: number[];
    biasRatio: number;
}

export interface PacingRegister {
    name: string;
    directive: string;
}

export interface SequenceLengthPlan {
    seqIdx: number;
    targetWords: number;
    bookType: string;
    multiplier: number;
    mScenes: number;
    mLength: number;
    idealScenes: number;
    rangeMin: number;
    rangeMax: number;
    floor: number;
    sceneWordTarget: number;
    sequenceBudget: number;
    biasRatio: number;
    driftE: number;
    driftState: string;
    sceneRegister: PacingRegister;
    justification: string;
}

export interface SceneWordTarget {
    targetWords: number;
    minWords: number;
    maxWords: number;
    pageCount: number;
    register: PacingRegister;
    sequenceBudget: number;
    remainingBudget: number;
    effectiveRemainingScenes: number;
}

export interface StoryProgressMetrics {
    draftedScenes: number;
    totalWords: number;
    plannedScenes: number;
    sequenceCount: number;
    actCount: number;
    castCount: number;
    loreCount: number;
    hasConcept: boolean;
    score: number;
}

/**
 * Pure measurement function: scans story prose without mutating state.
 */
export function measureNovelLength(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined,
    options: { excludeSceneId?: string | null } = {}
): NovelLengthMeasurement {
    const excludeId = options.excludeSceneId || null;
    let wordsWritten = 0;
    let scenesWritten = 0;
    const perSequenceWords = [0, 0, 0, 0, 0, 0, 0, 0];
    const perSequenceScenes = [0, 0, 0, 0, 0, 0, 0, 0];
    const perSequenceUnwritten = [0, 0, 0, 0, 0, 0, 0, 0];
    let biasRatio = LENGTH_CONTROL.BIAS_SEED;

    const scenesMap = (story?.scenes || {}) as Record<string, SceneBlueprint[]>;
    const proseMap = (story?.prose || {}) as Record<string, ProseEntry | string>;

    for (let sq = 0; sq < 8; sq++) {
        const seqScenes = scenesMap[`${sq}`] || scenesMap[sq] || [];
        if (Array.isArray(seqScenes)) {
            seqScenes.forEach((sc, scIdx) => {
                const sId = sc.id || `${sq + 1}.${scIdx + 1}`;
                if (
                    excludeId &&
                    (sId === excludeId ||
                        `${sq}-${scIdx}` === excludeId ||
                        `${sq}-0-${scIdx}` === excludeId)
                ) {
                    perSequenceUnwritten[sq]++;
                    return;
                }

                const proseObj = proseMap[sId] || proseMap[`${sq}-${scIdx}`] || proseMap[`${sq}-0-${scIdx}`];
                const text =
                    typeof proseObj === 'string'
                        ? proseObj
                        : proseObj?.final || proseObj?.draft || proseObj?.prose || '';
                const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

                if (wordCount > 0) {
                    wordsWritten += wordCount;
                    scenesWritten++;
                    perSequenceWords[sq] += wordCount;
                    perSequenceScenes[sq]++;

                    const requested =
                        proseObj && typeof proseObj === 'object' && proseObj.target_words
                            ? proseObj.target_words
                            : LENGTH_CONTROL.NOMINAL_SCENE_WORDS;
                    const ratio = Math.max(
                        LENGTH_CONTROL.BIAS_MIN,
                        Math.min(LENGTH_CONTROL.BIAS_MAX, wordCount / Math.max(500, requested))
                    );
                    biasRatio = biasRatio + LENGTH_CONTROL.BIAS_ALPHA * (ratio - biasRatio);
                } else {
                    perSequenceUnwritten[sq]++;
                }
            });
        }
    }

    return {
        wordsWritten,
        scenesWritten,
        perSequenceWords,
        perSequenceScenes,
        perSequenceUnwritten,
        biasRatio: Math.max(LENGTH_CONTROL.BIAS_MIN, Math.min(LENGTH_CONTROL.BIAS_MAX, biasRatio))
    };
}

/**
 * Outer loop: runs before planning each sequence and computes target scene count,
 * floor, recommended range, and authorial register.
 */
export function computeSequenceLengthPlan(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined,
    seqIdx: number | string = 0
): SequenceLengthPlan {
    const safeSeq = Math.max(0, Math.min(7, parseInt(String(seqIdx), 10) || 0));
    const targetWords = Math.max(
        10000,
        parseInt(String(story?.target_word_count || ''), 10) || LENGTH_CONTROL.DEFAULT_TARGET_WORDS
    );
    const bookTypeKey = story?.book_type || 'popular';
    const bookTypeConfig = LENGTH_CONTROL.BOOK_TYPES[bookTypeKey] || LENGTH_CONTROL.BOOK_TYPES.popular;
    const weights = LENGTH_CONTROL.SEQUENCE_WEIGHTS;

    const measure = measureNovelLength(story);
    const r = measure.biasRatio;

    let cumulativeSetpoint = 0;
    for (let i = 0; i < safeSeq; i++) {
        cumulativeSetpoint += targetWords * weights[i];
    }

    let earlierWords = 0;
    for (let i = 0; i < safeSeq; i++) {
        earlierWords += measure.perSequenceWords[i];
        if (measure.perSequenceUnwritten[i] > 0) {
            earlierWords += measure.perSequenceUnwritten[i] * LENGTH_CONTROL.NOMINAL_SCENE_WORDS * r;
        }
    }

    const driftE = earlierWords - cumulativeSetpoint;
    const deadbandWords = LENGTH_CONTROL.DEADBAND * targetWords;
    let filteredDrift = 0;
    if (Math.abs(driftE) > deadbandWords) {
        filteredDrift = driftE > 0 ? driftE - deadbandWords : driftE + deadbandWords;
    }

    let remainingWeight = 0;
    for (let i = safeSeq; i < 8; i++) {
        remainingWeight += weights[i];
    }
    const currentWeight = weights[safeSeq];
    const rawShare = remainingWeight > 0 ? currentWeight / remainingWeight : 1.0;
    const horizonShare = Math.min(LENGTH_CONTROL.MAX_HORIZON_SHARE, rawShare);

    const sequenceBudgetIdeal = targetWords * currentWeight;
    let m = 1.0;
    if (sequenceBudgetIdeal > 0) {
        m = 1.0 - (LENGTH_CONTROL.KP * filteredDrift * horizonShare) / sequenceBudgetIdeal;
    }

    if (safeSeq >= 6) {
        m = Math.max(m, LENGTH_CONTROL.ACT_III_MIN_MULTIPLIER);
    }

    m = Math.max(LENGTH_CONTROL.MULTIPLIER_MIN, Math.min(LENGTH_CONTROL.MULTIPLIER_MAX, m));
    if (safeSeq > 0) {
        const lcSeqs = (story?.length_control as { sequences?: Array<Partial<SequenceLengthPlan>> } | undefined)
            ?.sequences;
        const prevPlan = lcSeqs?.[safeSeq - 1];
        if (prevPlan && typeof prevPlan.multiplier === 'number') {
            const maxDelta = LENGTH_CONTROL.MULTIPLIER_SLEW;
            m = Math.max(
                prevPlan.multiplier - maxDelta,
                Math.min(prevPlan.multiplier + maxDelta, m)
            );
        }
    }

    const mScenes = Math.pow(m, LENGTH_CONTROL.SCENE_SHARE);
    const mLength = Math.pow(m, LENGTH_CONTROL.LENGTH_SHARE);

    const nominalSceneWords = LENGTH_CONTROL.NOMINAL_SCENE_WORDS;
    const sceneWordTarget = Math.round(
        Math.max(
            LENGTH_CONTROL.WORDS_ABS_MIN,
            Math.min(LENGTH_CONTROL.WORDS_ABS_MAX, nominalSceneWords * mLength)
        )
    );

    const adjustedSeqBudget = sequenceBudgetIdeal * m;
    const idealScenesRaw = adjustedSeqBudget / Math.max(500, sceneWordTarget * r);
    const idealScenes = Math.max(1, Math.round(idealScenesRaw));

    let baseFloor = bookTypeConfig.sceneFloor || 3;
    if (safeSeq === 6) baseFloor = Math.max(baseFloor, LENGTH_CONTROL.CLIMAX_MIN_SCENES);
    else if (safeSeq === 7) baseFloor = Math.max(baseFloor, LENGTH_CONTROL.RESOLUTION_MIN_SCENES);

    const floor = Math.max(baseFloor, idealScenes - 2);
    const rangeMin = Math.max(floor, idealScenes - 1);
    const rangeMax = Math.max(rangeMin + 1, idealScenes + 1);

    let sceneRegister: PacingRegister = {
        name: 'BALANCED',
        directive: 'Plan the sequence according to its natural dramatic rhythm, maintaining steady momentum.'
    };
    if (mScenes < 0.92) {
        sceneRegister = {
            name: 'CONSOLIDATE',
            directive:
                'The novel is tracking rich and expansive. Plan fewer, high-density scenes. Combine moments that share a location or dramatic goal into single unified scenes. Fold minor connective logistics (travel, brief check-ins) into adjacent scenes rather than giving them standalone blueprints.'
        };
    } else if (mScenes < 0.98) {
        sceneRegister = {
            name: 'FOCUSED',
            directive:
                'Keep the sequence lean and direct. Ensure every scene centers on a distinct, sharp turning point. Handle connective moments efficiently within scenes.'
        };
    } else if (mScenes > 1.08) {
        sceneRegister = {
            name: 'EXPAND',
            directive:
                'The novel has ample structural runway. Give each dramatic turn its own dedicated scene rather than compressing multiple beats into one. Dramatize consequences and explore active subplot threads that would otherwise be summarized.'
        };
    } else if (mScenes > 1.02) {
        sceneRegister = {
            name: 'DEVELOPED',
            directive:
                'Give key dramatic developments room to breathe. Ensure key character reactions and consequences are given dedicated scene space.'
        };
    }

    let driftState = 'On track';
    if (m < 0.95) driftState = 'Running expansive (gently consolidating)';
    else if (m > 1.05) driftState = 'Running lean (gently expanding)';

    const seqLabels = [
        'Setup & Status Quo',
        'Inciting Incident & Lock-In',
        'First Obstacles & Subplots',
        'Escalation & Midpoint Reversal',
        'Midpoint Fallout & Friction',
        'Tightening Net & Dark Night',
        'Climax & Decisive Confrontation',
        'Resolution & Transformed Equilibrium'
    ];

    return {
        seqIdx: safeSeq,
        targetWords,
        bookType: bookTypeKey,
        multiplier: parseFloat(m.toFixed(4)),
        mScenes: parseFloat(mScenes.toFixed(4)),
        mLength: parseFloat(mLength.toFixed(4)),
        idealScenes,
        rangeMin,
        rangeMax,
        floor,
        sceneWordTarget,
        sequenceBudget: Math.round(adjustedSeqBudget),
        biasRatio: parseFloat(r.toFixed(3)),
        driftE: Math.round(driftE),
        driftState,
        sceneRegister,
        justification: `Sequence ${safeSeq + 1} (${seqLabels[safeSeq]}): Calibrated for ${bookTypeConfig.label} format (${targetWords.toLocaleString()} words). Recommended ${rangeMin}–${rangeMax} scenes (${floor} minimum).`
    };
}

/**
 * Inner loop: computes target word count and authorial pacing register for a single scene.
 */
export function computeSceneWordTarget(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined,
    seqIdx: number | string = 0,
    sceneIdx: number | string = 0
): SceneWordTarget {
    const safeSeq = Math.max(0, Math.min(7, parseInt(String(seqIdx), 10) || 0));
    const safeSc = Math.max(0, parseInt(String(sceneIdx), 10) || 0);

    const lcSeqs = (story?.length_control as { sequences?: SequenceLengthPlan[] } | undefined)?.sequences;
    let seqPlan = lcSeqs?.[safeSeq];
    if (!seqPlan || typeof seqPlan.sequenceBudget !== 'number') {
        seqPlan = computeSequenceLengthPlan(story, safeSeq);
    }

    const measure = measureNovelLength(story);
    const r = seqPlan.biasRatio || measure.biasRatio || 1.15;
    const seqBudget =
        seqPlan.sequenceBudget ||
        LENGTH_CONTROL.DEFAULT_TARGET_WORDS * (LENGTH_CONTROL.SEQUENCE_WEIGHTS[safeSeq] || 0.125);
    const wordsWrittenInSeq = measure.perSequenceWords[safeSeq] || 0;
    const remainingBudget = Math.max(1000, seqBudget - wordsWrittenInSeq);

    const scenesMap = (story?.scenes || {}) as Record<string, SceneBlueprint[]>;
    const seqScenes = scenesMap[`${safeSeq}`] || scenesMap[safeSeq] || [];
    let unwrittenScenesCount = 0;
    seqScenes.forEach((_sc, idx) => {
        if (idx >= safeSc) {
            unwrittenScenesCount++;
        }
    });
    const effectiveRemainingScenes =
        seqScenes.length > 0 ? Math.max(1, unwrittenScenesCount) : Math.max(1, seqPlan.idealScenes || 1);

    const neededPerScene = remainingBudget / (effectiveRemainingScenes * r);
    const baseTarget = seqPlan.sceneWordTarget || LENGTH_CONTROL.NOMINAL_SCENE_WORDS;

    const rawRatio = baseTarget > 0 ? neededPerScene / baseTarget : 1.0;
    const dampedFactor = Math.max(
        LENGTH_CONTROL.INNER_MIN,
        Math.min(LENGTH_CONTROL.INNER_MAX, Math.sqrt(rawRatio))
    );

    let targetWords = Math.round(baseTarget * dampedFactor);
    targetWords = Math.max(
        LENGTH_CONTROL.WORDS_ABS_MIN,
        Math.min(LENGTH_CONTROL.WORDS_ABS_MAX, targetWords)
    );

    if (safeSc > 0) {
        const prevSceneKey = `${safeSeq}-${safeSc - 1}`;
        const proseMap = (story?.prose || {}) as Record<string, ProseEntry | string>;
        const prevRaw = proseMap[prevSceneKey] || proseMap[`${safeSeq}-0-${safeSc - 1}`];
        const prevEntry = prevRaw && typeof prevRaw === 'object' ? prevRaw : null;
        if (prevEntry && prevEntry.target_words) {
            const maxShift = Math.round(prevEntry.target_words * LENGTH_CONTROL.INNER_SLEW);
            targetWords = Math.max(
                prevEntry.target_words - maxShift,
                Math.min(prevEntry.target_words + maxShift, targetWords)
            );
        }
    }

    targetWords = Math.round(targetWords / 50) * 50;

    const pageCount = Math.max(4, Math.round(targetWords / 250));
    const minWords = Math.round((targetWords * 0.9) / 50) * 50;
    const maxWords = Math.round((targetWords * 1.1) / 50) * 50;

    const ratioToNominal = targetWords / LENGTH_CONTROL.NOMINAL_SCENE_WORDS;
    let register: PacingRegister = {
        name: 'BALANCED',
        directive:
            'Give the scene its natural dramatic space, balancing atmospheric staging, character voice, and conflict.'
    };
    if (ratioToNominal < 0.88) {
        register = {
            name: 'TIGHT',
            directive:
                'Enter late at the immediate point of tension. Keep internal reflections brief and tied to action. Cut lingering transitions and exit promptly once the value shift and exit hook land.'
        };
    } else if (ratioToNominal < 0.96) {
        register = {
            name: 'LEAN',
            directive:
                'Drive directly toward the core conflict. Prioritize active dialogue and immediate sensory details over extended atmospheric description.'
        };
    } else if (ratioToNominal > 1.15) {
        register = {
            name: 'EXPANSIVE',
            directive:
                "Dramatize the scene with immersive depth. Draw richly upon the atmospheric overview, explore the character's internal sensory experience, and let pivotal exchanges unfold with full dramatic weight. Do not summarize turning points."
        };
    } else if (ratioToNominal > 1.04) {
        register = {
            name: 'RICH',
            directive:
                'Let character reactions and subtext breathe. Allow dialogue exchanges room for pushback and psychological defenses before resolving the scene.'
        };
    }

    return {
        targetWords,
        minWords,
        maxWords,
        pageCount,
        register,
        sequenceBudget: seqBudget,
        remainingBudget: Math.round(remainingBudget),
        effectiveRemainingScenes
    };
}

/** Builds `<scene_count_target>` prompt block for the Scene Planner Agent. */
export function buildSceneCountTargetBlock(
    plan: SequenceLengthPlan,
    seqIdx: number,
    sequence: Partial<Sequence> = {}
): string {
    const seqNumber = sequence.number || seqIdx + 1;
    const seqTitle = sequence.title || `Sequence ${seqNumber}`;
    return `<scene_count_target>
Target Scene Count: Plan approximately ${plan.idealScenes} scenes for Sequence ${seqNumber}: ${seqTitle}.
Acceptable Range: You may plan between ${plan.rangeMin} and ${plan.rangeMax} scenes, but never fewer than ${plan.floor}.
Scene Length: Each scene will be drafted at approximately ${plan.sceneWordTarget.toLocaleString()} words. Please ensure every scene you plan has enough substance to support this length.
Pacing Directive: ${plan.sceneRegister.name}. ${plan.sceneRegister.directive}
</scene_count_target>`;
}

/** Builds TARGET LENGTH and PACING REGISTER prompt blocks for the Writing Agent. */
export function buildLengthMandateBlock(
    sceneTarget: SceneWordTarget,
    { isAudioDrama = false }: { isAudioDrama?: boolean } = {}
): string {
    const audioDramaDirectives: Record<string, string> = {
        TIGHT: 'Enter late at the immediate point of tension. Fulfill the full TARGET LENGTH through rapid-fire, high-stakes character exchanges across 35–50+ turns and unified single-chunk Narrator staging, exiting cleanly once the value shift and exit hook land.',
        LEAN: 'Drive directly toward the core conflict, fulfilling the full TARGET LENGTH through sharp, multi-beat spoken character exchanges (2–4 sentences per substantive turn) and unified single-chunk Narrator transitions.',
        BALANCED:
            'Give the scene its full dramatic weight and reach the full TARGET LENGTH through 40–65+ lively character turns (letting argumentative, persuasive, or emotional turns span 2–4 breath-unit sentences with mid-line pivots) paired with unified single-chunk Narrator staging.',
        RICH: 'Let character reactions, vocal pushback, and subtext breathe across extended 45–70+ turn spoken dialogue exchanges (2–4+ sentences per substantive turn) to fulfill the full TARGET LENGTH, keeping Narrator staging unified in single chunks.',
        EXPANSIVE:
            'Dramatize the scene with full acoustic depth to fulfill the entire TARGET LENGTH through extended 50–75+ turn character exchanges, multi-sentence vocal sparring, layered subtext, and full-weight dramatic reversals on-mic, while keeping essential Narrator staging consolidated into unified single-chunk turns.'
    };
    const registerName = sceneTarget?.register?.name || 'BALANCED';
    const registerDirective = isAudioDrama
        ? audioDramaDirectives[registerName] || sceneTarget.register.directive
        : sceneTarget.register.directive;
    return `TARGET LENGTH: Write approximately ${sceneTarget.targetWords.toLocaleString()} words (roughly ${sceneTarget.pageCount} manuscript pages). You may write anywhere between ${sceneTarget.minWords.toLocaleString()} and ${sceneTarget.maxWords.toLocaleString()} words as needed.
PACING REGISTER: ${registerName}. ${registerDirective}`;
}

/** Backward-compatible wrapper mapping legacy pacing calls to `computeSequenceLengthPlan`. */
export function computePacingRanges(
    arg1: string | number = 80000,
    arg2: number | null = null,
    arg3: number | null = null,
    _arg4 = 0
): Record<string, unknown> {
    void _arg4;
    let targetWordCount: unknown;
    let sequenceIndex: number;
    if (typeof arg1 === 'string' && isNaN(Number(arg1))) {
        targetWordCount = arg2;
        sequenceIndex = arg3 || 0;
    } else {
        targetWordCount = arg1;
        sequenceIndex = arg2 || 0;
    }

    const dummyStory = {
        target_word_count: parseInt(String(targetWordCount), 10) || 80000,
        book_type: 'popular',
        prose: {},
        scenes: {}
    };
    const plan = computeSequenceLengthPlan(dummyStory, sequenceIndex);

    return {
        scenes_per_sequence: {
            min: plan.floor,
            max: plan.rangeMax,
            justification: plan.justification
        },
        beats_per_scene: {
            min: 1,
            max: 1,
            justification: 'Beats deprecated; pacing governed by dynamic scene length controller.'
        },
        _lengthPlan: plan
    };
}

/** Backward-compatible wrapper for `calculateTargetWordCount`. */
export function calculateTargetWordCount(arg1: unknown, arg2?: unknown): string | number {
    if (typeof arg1 === 'string') {
        return insertTargetWordCount(arg1, arg2, LENGTH_CONTROL.NOMINAL_SCENE_WORDS);
    }
    return LENGTH_CONTROL.NOMINAL_SCENE_WORDS;
}

/** Replaces legacy target word count placeholders inside a prompt string. */
export function insertTargetWordCount(
    prompt: string,
    _beatsOrCount?: unknown,
    precalculatedWords?: number
): string;
export function insertTargetWordCount<T>(
    prompt: T,
    _beatsOrCount?: unknown,
    precalculatedWords?: number
): T;
export function insertTargetWordCount(
    prompt: unknown,
    _beatsOrCount?: unknown,
    precalculatedWords?: number
): unknown {
    void _beatsOrCount;
    if (typeof prompt !== 'string') return prompt;
    const words = precalculatedWords || LENGTH_CONTROL.NOMINAL_SCENE_WORDS;
    const formattedWords = words.toLocaleString();

    let result = prompt;
    result = result.replace(/\[TARGET_WORD_COUNT\]/g, formattedWords);
    result = result.replace(/1,500[–-]3,000 words/g, `${formattedWords} words`);
    result = result.replace(/1500[–-]3000 words/g, `${formattedWords} words`);
    result = result.replace(
        /\(aim for approximately 120[–-]200 words per beat\)/g,
        `(target: approximately ${formattedWords} words total)`
    );
    result = result.replace(
        /aim for approximately 120[–-]200 words per beat/g,
        `target: approximately ${formattedWords} words total`
    );
    result = result.replace(
        /120[–-]200 words per beat/g,
        `approximately ${formattedWords} words total`
    );
    return result;
}

/** Extracts text string from a string or structured `ProseEntry` object. */
export function extractStoryProseText(entry: unknown): string {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        return String(rec.final || rec.text || rec.draft || '');
    }
    return '';
}

/** Computes aggregate completion counts and weighted score for story hydration/ranking. */
export function computeStoryProgressMetrics(
    storyData: (Partial<Story> & Record<string, unknown>) | null | undefined
): StoryProgressMetrics {
    if (!storyData || typeof storyData !== 'object') {
        return {
            draftedScenes: 0,
            totalWords: 0,
            plannedScenes: 0,
            sequenceCount: 0,
            actCount: 0,
            castCount: 0,
            loreCount: 0,
            hasConcept: false,
            score: 0
        };
    }

    let draftedScenes = 0;
    let totalWords = 0;
    const seenKeys = new Set<string>();

    const proseMap =
        storyData.prose && typeof storyData.prose === 'object' ? storyData.prose : {};
    for (const key of Object.keys(proseMap)) {
        const text = extractStoryProseText((proseMap as Record<string, unknown>)[key]).trim();
        if (text) {
            seenKeys.add(key);
            draftedScenes++;
            totalWords += text.split(/\s+/).filter(Boolean).length;
        }
    }

    let plannedScenes = 0;
    const scenesMap =
        storyData.scenes && typeof storyData.scenes === 'object' ? storyData.scenes : {};
    for (const seqKey of Object.keys(scenesMap)) {
        const seqScenes = (scenesMap as Record<string, unknown>)[seqKey];
        if (!Array.isArray(seqScenes)) continue;
        plannedScenes += seqScenes.length;
        seqScenes.forEach((sc, scIdx) => {
            const key = `${seqKey}-${scIdx}`;
            if (seenKeys.has(key) || !sc || typeof sc !== 'object') return;
            const scRec = sc as Record<string, unknown>;
            const inlineText = extractStoryProseText(
                scRec.prose || scRec.final || scRec.text
            ).trim();
            if (inlineText) {
                seenKeys.add(key);
                draftedScenes++;
                totalWords += inlineText.split(/\s+/).filter(Boolean).length;
            }
        });
    }

    const sequenceCount = Array.isArray(storyData.sequences) ? storyData.sequences.length : 0;
    const actCount = Array.isArray(storyData.acts) ? storyData.acts.length : 0;
    const castCount = Array.isArray(storyData.cast) ? storyData.cast.length : 0;
    const loreCount = Array.isArray(storyData.lore) ? storyData.lore.length : 0;
    const title = String(storyData.title || '').trim();
    const hasConcept = Boolean(
        String(storyData.concept || '').trim() ||
            String(storyData.logline || '').trim() ||
            String(storyData.story_so_far || '').trim() ||
            (title && title !== 'Untitled Story')
    );

    const score =
        draftedScenes * 100000 +
        totalWords +
        plannedScenes * 500 +
        sequenceCount * 100 +
        actCount * 50 +
        castCount * 20 +
        loreCount * 10 +
        (hasConcept ? 5 : 0);

    return {
        draftedScenes,
        totalWords,
        plannedScenes,
        sequenceCount,
        actCount,
        castCount,
        loreCount,
        hasConcept,
        score
    };
}
