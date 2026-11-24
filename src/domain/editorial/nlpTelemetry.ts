/**
 * @module domain/editorial/nlpTelemetry
 * Phase 1A/1B & Stage 2A of the Autonomous Editorial Harness:
 * AestheticConstitution compiler, deterministic NLP stylometric telemetry, 8D character voice vectors,
 * global drift computation, and AuthorVoiceDNA extraction.
 */

import { PROMPTS } from '@/prompts';
import { escapeRegExp, extractTag, extractTagList } from '@/utils';
import type { SlopConfig } from '@/types/slop';
import { isAudioDramaScriptText } from '@/domain/audio';
import { DEFAULT_SLOP_CONFIG, scanTextForSlop } from '@/domain/slop';
import { normalizeIntentionalOverrides } from '@/domain/story';
import {
    HARNESS_FILTER_VERBS,
    HARNESS_FORBIDDEN_SLOP_LEXICON,
    HARNESS_SOMATIC_PATTERNS,
    escapeHarnessXml,
    getDraftedStoryScenesList,
    normalizeSceneToXml
} from './xmlNormalization';
import type {
    DraftedStorySceneItem,
    EditorialStoryInput,
    HarnessLexiconRule,
    NormalizedSceneDocument,
    NormalizedSentence
} from './xmlNormalization';

export type EditorialCallAIFn = (
    userPrompt: string,
    sysPrompt: string,
    useJson: boolean,
    label: string,
    role: string
) => Promise<string>;

export interface AestheticConstitution {
    version: string;
    genreAndSubgenre: {
        primary: string;
        secondary: string;
        audienceExpectationTier: string;
    };
    narrativePOVContract: {
        globalType: string;
        headHopTolerance: string;
        psychicDistanceRange: { min: number; max: number; targetMean: number };
        maxFilterWordsPer1k: number;
    };
    epistemicAndSubtextMandates: {
        subtextToExpositionRatio: number;
        dramaticIronyPolicy: string;
        maxUnanchoredExpositionSentences: number;
    };
    pacingAndDiscourseTargets: {
        targetDialogueRatioRange: { min: number; max: number };
        targetActionRatioRange: { min: number; max: number };
        targetInteriorityRatioRange: { min: number; max: number };
        targetDescriptionRatioRange: { min: number; max: number };
    };
    authorialDirectives: {
        persona: string;
        writingGuide: string;
        pacingAndDialogueRules: string;
        strictAntiPatterns: string;
        authorNote: string;
    };
    intentionalOverrides: Array<Record<string, unknown>>;
    xml: string;
}

export interface SlopViolationItem {
    anchor: string;
    paragraphId: string;
    phrase: string;
    category: string;
    categoryId?: string;
    severity?: string;
    isClustered?: boolean;
    isTrailingCloser?: boolean;
    note?: string;
    text: string;
}

export interface Character8DVoiceVector {
    turnCount: number;
    avg_dialogue_turn_words: number;
    contraction_rate: number;
    question_ratio: number;
    exclamation_ratio: number;
    lexical_diversity: number;
    latinate_ratio: number;
    subordinate_clause_rate: number;
    colloquial_marker_rate: number;
    driftDistance?: number;
}

export interface SceneTelemetryReport {
    sceneId: string;
    proseKey: string;
    wordCount: number;
    meanSentenceWords: number;
    stdSentenceWords: number;
    sentenceLengthCV: number;
    hypotaxisRatio: number;
    leftBranchingIndex: number;
    passiveVoiceRate: number;
    meanPsychicDistance: number;
    filterWordDensityPer1k: number;
    filterWordMatches: Array<{ anchor: string; verb: string; text: string }>;
    povHeadHops: Array<{
        anchor: string;
        non_pov_character: string;
        pov_character: string;
        text: string;
    }>;
    lexicalEchoes: Array<{
        lemma: string;
        first_anchor: string;
        second_anchor: string;
        token_distance: number;
        echo_salience_score: number;
        excerpt: string;
    }>;
    somaticCrutches: Array<{
        id: string;
        label: string;
        count: number;
        anchors: string[];
    }>;
    dialogueRatio: number;
    sensoryDensityPer1k: number;
    kineticVelocity: number;
    whiteRoomSpans: Array<{
        start_anchor: string;
        end_anchor: string;
        word_span: number;
    }>;
    monotonousClusters: Array<{
        start_anchor: string;
        end_anchor: string;
        window_cv: number;
        mean_words: number;
        excerpt: string;
    }>;
    slopViolations: SlopViolationItem[];
    hardSlopViolations: SlopViolationItem[];
    closerViolations: SlopViolationItem[];
    flagSlopViolations: SlopViolationItem[];
    rhetoricalViolations: SlopViolationItem[];
    punctuationCollapse: SlopViolationItem[];
    questionFreeDialogue: SlopViolationItem[];
    characterVoiceMetrics: Record<string, Character8DVoiceVector>;
    xml: string;
}

export interface FullManuscriptTelemetryReport {
    scenesList: DraftedStorySceneItem[];
    sceneTelemetryMap: Record<string, SceneTelemetryReport>;
    characterCentroids: Record<
        string,
        {
            centroid: Record<string, number>;
            std: Record<string, number>;
            scenesSampled: number;
        }
    >;
}

export interface AuthorVoiceDNA {
    extractedFromScenes: number;
    syntacticCadence: {
        meanWords: number;
        stdDevWords: number;
        coeffOfVariation: number;
        hypotaxisRatio: number;
        leftBranchingRatio: number;
        passiveRate: number;
    };
    perceptualProfile: {
        baselinePsychicDistance: number;
        filterVerbRate: number;
        dialogueRatio: number;
    };
    signatureLexicon: Array<{ lemma: string; register: string; count: number }>;
    exemplars: Array<{
        id: string;
        source_anchor: string;
        mode: string;
        verbatimText: string;
        stylisticNotes: string;
    }>;
    forbiddenSlopLexicon: HarnessLexiconRule[];
    xml: string;
}

const VOICE_DIMS = [
    'avg_dialogue_turn_words',
    'contraction_rate',
    'question_ratio',
    'exclamation_ratio',
    'lexical_diversity',
    'latinate_ratio',
    'subordinate_clause_rate',
    'colloquial_marker_rate'
] as const;

/** Compiles the manuscript `<AestheticConstitution>` contract including `.novelignore` overrides. */
export function compileAestheticConstitution(
    story: EditorialStoryInput | null | undefined,
    customOverrides: unknown = null
): AestheticConstitution {
    const genreStr = story?.style?.genre || 'Literary Fiction';
    const moodStr = story?.style?.mood || 'Atmospheric, grounded, emotionally resonant';
    const guideStr =
        story?.style?.writing_guide ||
        'Prioritize subtext, concrete sensory grounding, and rhythmic sentence variation.';
    const personaStr = story?.synthesized_authorial_persona || 'Master Prose Stylist';
    const pacingRules =
        story?.genre_pacing_and_dialogue_rules ||
        'Balance kinetic momentum with earned psychological interiority.';
    const antiPatterns =
        story?.strict_anti_patterns ||
        'Never state subtext on the nose; avoid melodramatic somatic clichés and repetitive sentence openings.';
    const authorNote = story?.author_note || '';

    const isFirstPerson = /\bfirst[-\s]person\b/i.test(guideStr + ' ' + personaStr);
    const isOmniscient = /\bomniscient\b/i.test(guideStr + ' ' + personaStr);
    const povType = isFirstPerson
        ? 'FIRST_PERSON_DEEP'
        : isOmniscient
          ? 'OMNISCIENT'
          : 'THIRD_PERSON_LIMITED_DEEP';

    const existingOverrides = normalizeIntentionalOverrides(
        customOverrides ??
            story?.editorial_harness?.customConstitutionOverrides ??
            story?.editorial_harness?.constitution?.intentionalOverrides ??
            story?.editorial_harness?.novelignore
    ) as Array<Record<string, unknown>>;

    const moodOrSubgenre = (m: string): string =>
        String(m || '')
            .split(/[,\n]/)[0]
            ?.trim() || 'Dramatic';

    const constitutionObj = {
        version: '1.0',
        genreAndSubgenre: {
            primary: genreStr.split(/[,\n]/)[0]?.trim() || 'Fiction',
            secondary: moodOrSubgenre(moodStr),
            audienceExpectationTier:
                story?.book_type === 'epic' || story?.book_type === 'full_length'
                    ? 'LITERARY'
                    : 'UPMARKET'
        },
        narrativePOVContract: {
            globalType: povType,
            headHopTolerance: 'ZERO',
            psychicDistanceRange: { min: 1.5, max: 3.5, targetMean: 2.1 },
            maxFilterWordsPer1k: 4.5
        },
        epistemicAndSubtextMandates: {
            subtextToExpositionRatio: 0.75,
            dramaticIronyPolicy: 'PRESERVE_ASYMMETRY',
            maxUnanchoredExpositionSentences: 4
        },
        pacingAndDiscourseTargets: {
            targetDialogueRatioRange: { min: 0.25, max: 0.58 },
            targetActionRatioRange: { min: 0.2, max: 0.45 },
            targetInteriorityRatioRange: { min: 0.12, max: 0.32 },
            targetDescriptionRatioRange: { min: 0.1, max: 0.25 }
        },
        authorialDirectives: {
            persona: personaStr,
            writingGuide: guideStr,
            pacingAndDialogueRules: pacingRules,
            strictAntiPatterns: antiPatterns,
            authorNote
        },
        intentionalOverrides: existingOverrides
    };

    const xml = `<AestheticConstitution version="1.0">
  <GenreAndSubgenre primary="${escapeHarnessXml(constitutionObj.genreAndSubgenre.primary)}" secondary="${escapeHarnessXml(constitutionObj.genreAndSubgenre.secondary)}" audience_expectation_tier="${constitutionObj.genreAndSubgenre.audienceExpectationTier}" />
  <NarrativePOVContract>
    <GlobalType>${constitutionObj.narrativePOVContract.globalType}</GlobalType>
    <HeadHopTolerance>ZERO</HeadHopTolerance>
    <PsychicDistanceRange min="1.5" max="3.5" target_mean="2.1" />
    <MaxFilterWordsPer1k>4.5</MaxFilterWordsPer1k>
  </NarrativePOVContract>
  <EpistemicAndSubtextMandates>
    <SubtextToExpositionRatio>0.75</SubtextToExpositionRatio>
    <DramaticIronyPolicy>PRESERVE_ASYMMETRY</DramaticIronyPolicy>
    <MaxUnanchoredExpositionSentences>4</MaxUnanchoredExpositionSentences>
  </EpistemicAndSubtextMandates>
  <PacingAndDiscourseTargets>
    <TargetDialogueRatioRange min="0.25" max="0.58" />
    <TargetActionRatioRange min="0.20" max="0.45" />
    <TargetInteriorityRatioRange min="0.12" max="0.32" />
    <TargetDescriptionRatioRange min="0.10" max="0.25" />
  </PacingAndDiscourseTargets>
  <AuthorialDirectives>
    <SynthesizedPersona><![CDATA[${personaStr}]]></SynthesizedPersona>
    <WritingGuide><![CDATA[${guideStr}]]></WritingGuide>
    <GenrePacingRules><![CDATA[${pacingRules}]]></GenrePacingRules>
    <StrictAntiPatterns><![CDATA[${antiPatterns}]]></StrictAntiPatterns>
    ${authorNote ? `<GlobalAuthorNote><![CDATA[${authorNote}]]></GlobalAuthorNote>` : ''}
  </AuthorialDirectives>
  <IntentionalOverrides>
${existingOverrides.map((ov) => `    <IgnoreRule scope="${escapeHarnessXml(ov.scope || 'GLOBAL')}" rule_type="${escapeHarnessXml(ov.rule_type || 'STYLE_OVERRIDE')}" reason="${escapeHarnessXml(ov.reason || 'Authorial intent')}" />`).join('\n')}
  </IntentionalOverrides>
</AestheticConstitution>`;

    return { ...constitutionObj, xml };
}

/** Runs deterministic multi-pass NLP & stylometric telemetry for a single normalized scene. */
export function runSceneNlpTelemetry(
    sceneItem: Partial<DraftedStorySceneItem> & { normalized?: NormalizedSceneDocument },
    story: EditorialStoryInput = {},
    customBannedPhrases: string[] = [],
    slopConfig: Partial<SlopConfig> | null = null
): SceneTelemetryReport {
    const normalized =
        sceneItem.normalized ||
        normalizeSceneToXml(
            sceneItem.seqIdx || 0,
            sceneItem.sceneIdx || 0,
            sceneItem.proseText || '',
            story
        );
    const sceneId = normalized.sceneId;
    const allSentences: Array<NormalizedSentence & { paragraphMode: string }> = [];
    normalized.paragraphs.forEach((p) => {
        p.sentences.forEach((s) => allSentences.push({ ...s, paragraphMode: p.mode }));
    });

    const totalWords = Math.max(1, normalized.wordCount);
    const sentenceLengths = allSentences.map((s) => s.wordCount);
    const meanL =
        sentenceLengths.length > 0
            ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
            : 14.0;
    const varianceL =
        sentenceLengths.length > 1
            ? sentenceLengths.reduce((acc, l) => acc + Math.pow(l - meanL, 2), 0) /
              sentenceLengths.length
            : 25.0;
    const stdL = Math.sqrt(varianceL);
    const cv = meanL > 0 ? stdL / meanL : 0.45;

    const monotonousClusters: SceneTelemetryReport['monotonousClusters'] = [];
    for (let i = 0; i <= allSentences.length - 5; i++) {
        const win = allSentences.slice(i, i + 5);
        const winLens = win.map((s) => s.wordCount);
        const wMean = winLens.reduce((a, b) => a + b, 0) / 5;
        const wStd = Math.sqrt(
            winLens.reduce((acc, l) => acc + Math.pow(l - wMean, 2), 0) / 5
        );
        const wCv = wMean > 0 ? wStd / wMean : 1.0;
        if (wCv < 0.22 && wMean >= 5) {
            monotonousClusters.push({
                start_anchor: win[0].id,
                end_anchor: win[4].id,
                window_cv: Number(wCv.toFixed(3)),
                mean_words: Number(wMean.toFixed(1)),
                excerpt: win
                    .map((s) => s.text)
                    .join(' ')
                    .slice(0, 220)
            });
            i += 3;
        }
    }

    const subordinatingConj =
        /\b(?:although|though|because|since|unless|until|while|whereas|whenever|wherever|whether|after|before|if|once|provided)\b/gi;
    const coordinatingConj = /\b(?:and|but|or|nor|for|yet|so)\b/gi;
    let subCount = 0;
    let coordCount = 0;
    let leftBranchingCount = 0;
    let passiveCount = 0;

    allSentences.forEach((s) => {
        const subs = (s.text.match(subordinatingConj) || []).length;
        const coords = (s.text.match(coordinatingConj) || []).length;
        subCount += subs;
        coordCount += coords;
        if (
            /^(?:Although|Though|Because|Since|While|When|After|Before|If|Unless|Having|Walking|Looking|Turning|Standing|Despite|In\s+spite)\b/i.test(
                s.text.trim()
            )
        ) {
            leftBranchingCount++;
        }
        if (/\b(?:was|were|been|being|is|are)\s+\w+(?:ed|en)\b/i.test(s.text)) {
            passiveCount++;
        }
    });

    const hypotaxisRatio = Number((subCount / Math.max(1, coordCount + subCount)).toFixed(3));
    const leftBranchingIndex = Number(
        (leftBranchingCount / Math.max(1, allSentences.length)).toFixed(3)
    );
    const passiveVoiceRate = Number((passiveCount / Math.max(1, allSentences.length)).toFixed(3));

    const filterWordMatches: SceneTelemetryReport['filterWordMatches'] = [];
    const povHeadHops: SceneTelemetryReport['povHeadHops'] = [];
    const castList = Array.isArray(story?.cast) ? story.cast : [];
    const povName = String(normalized.pov || '').trim();
    const nonPovNames = castList
        .map((c) => c?.name)
        .filter(
            (n): n is string =>
                Boolean(n) &&
                Boolean(povName) &&
                povName.toLowerCase() !== 'omniscient' &&
                !String(n).toLowerCase().includes(povName.toLowerCase()) &&
                !povName.toLowerCase().includes(String(n).toLowerCase())
        );

    let pdSum = 0;
    allSentences.forEach((s) => {
        if (s.speaker_ref) {
            pdSum += 1.6;
            return;
        }
        let sPd = 2.2;
        const lowerS = s.text.toLowerCase();
        for (const fv of HARNESS_FILTER_VERBS) {
            const fvRegex = new RegExp(
                `\\b(?:i|he|she|they|${escapeRegExp(povName.split(/\s+/)[0] || 'character')})\\s+${fv}\\b`,
                'i'
            );
            if (fvRegex.test(s.text)) {
                filterWordMatches.push({ anchor: s.id, verb: fv, text: s.text });
                sPd += 0.85;
            }
        }
        for (const otherName of nonPovNames) {
            const firstOther = otherName.split(/\s+/)[0];
            const hopRegex = new RegExp(
                `\\b${escapeRegExp(firstOther)}\\s+(?:wondered|realized|knew|thought|remembered|regretted|hoped|feared|dreaded|decided)\\b`,
                'i'
            );
            if (
                hopRegex.test(s.text) &&
                !/\b(?:seemed|appeared|looked|as\s+if|must\s+have)\b/i.test(s.text)
            ) {
                povHeadHops.push({
                    anchor: s.id,
                    non_pov_character: otherName,
                    pov_character: povName,
                    text: s.text
                });
            }
        }
        if (/[?—…]/.test(s.text) && !s.speaker_ref) sPd -= 0.45;
        if (/\b(?:century|generation|kingdom|society|humanity|tradition|historians|era)\b/i.test(lowerS)) {
            sPd += 1.1;
        }
        pdSum += Math.max(1.0, Math.min(5.0, sPd));
    });

    const meanPsychicDistance = Number((pdSum / Math.max(1, allSentences.length)).toFixed(2));
    const filterWordDensityPer1k = Number(
        ((filterWordMatches.length / totalWords) * 1000).toFixed(2)
    );

    const stopWords = new Set([
        'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but', 'his', 'from', 'they',
        'she', 'her', 'had', 'were', 'was', 'their', 'what', 'said', 'there', 'all', 'would', 'when',
        'into', 'out', 'about', 'who', 'get', 'which', 'make', 'can', 'like', 'time', 'just', 'him',
        'know', 'take', 'people', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
        'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
        'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any',
        'these', 'give', 'day', 'most', 'down', 'hand', 'eyes', 'room', 'voice', 'door', 'head', 'face',
        'away', 'still', 'through', 'before', 'where', 'something', 'nothing', 'around', 'again'
    ]);

    const tokenStream: Array<{
        lemma: string;
        word: string;
        anchor: string;
        tokIdx: number;
        sentenceText: string;
    }> = [];
    const lemmaCounts: Record<string, number> = {};
    allSentences.forEach((s) => {
        const words = s.text.toLowerCase().match(/\b[a-z]{5,}\b/g) || [];
        words.forEach((w) => {
            if (stopWords.has(w)) return;
            const lemma = w.replace(/(?:ing|edly|ed|ly|ness|ments?)$/, '');
            if (lemma.length < 4 || stopWords.has(lemma)) return;
            const tokIdx = tokenStream.length;
            tokenStream.push({ lemma, word: w, anchor: s.id, tokIdx, sentenceText: s.text });
            lemmaCounts[lemma] = (lemmaCounts[lemma] || 0) + 1;
        });
    });

    const lexicalEchoes: SceneTelemetryReport['lexicalEchoes'] = [];
    const lastSeenByLemma: Record<string, (typeof tokenStream)[number]> = {};
    const tau = 150.0;
    tokenStream.forEach((tok) => {
        const prev = lastSeenByLemma[tok.lemma];
        if (prev && tok.tokIdx - prev.tokIdx <= 220 && tok.tokIdx - prev.tokIdx >= 2) {
            const dist = tok.tokIdx - prev.tokIdx;
            const estIdf = Math.min(6.8, 3.8 + Math.min(2.6, (tok.word.length - 5) * 0.32));
            const echoScore = Math.pow(estIdf, 2) * Math.exp(-dist / tau);
            if (echoScore >= 28.0) {
                lexicalEchoes.push({
                    lemma: tok.word,
                    first_anchor: prev.anchor,
                    second_anchor: tok.anchor,
                    token_distance: dist,
                    echo_salience_score: Number(echoScore.toFixed(1)),
                    excerpt: tok.sentenceText
                });
            }
        }
        lastSeenByLemma[tok.lemma] = tok;
    });

    const somaticCrutches: SceneTelemetryReport['somaticCrutches'] = [];
    HARNESS_SOMATIC_PATTERNS.forEach((pat) => {
        const hitAnchors: string[] = [];
        allSentences.forEach((s) => {
            pat.regex.lastIndex = 0;
            if (pat.regex.test(s.text)) {
                hitAnchors.push(s.id);
            }
        });
        if (hitAnchors.length > 0) {
            somaticCrutches.push({
                id: pat.id,
                label: pat.label,
                count: hitAnchors.length,
                anchors: hitAnchors
            });
        }
    });

    const sensoryLexicon =
        /\b(?:cold|warm|heat|chill|damp|wet|dry|rough|smooth|sharp|dull|bitter|sweet|metallic|copper|acrid|smoke|ozone|dust|rust|shadow|glare|flicker|gleam|hum|buzz|rasped|echo|creak|thud|clatter|scent|reek|fragrance|stink|velvet|iron|stone|glass|splinter|grease|sweat|pulse|shiver|weight|pressure)\b/gi;
    const actionVerbs =
        /\b(?:grabbed|lunged|stepped|turned|pulled|pushed|struck|slammed|ran|sprinted|ducked|leapt|dropped|caught|threw|drew|snatched|bolted|stumbled|pivoted|shoved|kick|kicked|pressed|crossed|opened|shut|locked)\b/gi;

    let dialogueWords = 0;
    let sensoryHitsTotal = 0;
    const whiteRoomSpans: SceneTelemetryReport['whiteRoomSpans'] = [];
    let consecutiveZeroSensoryWords = 0;
    let zeroSensoryStartAnchor: string | null = null;

    normalized.paragraphs.forEach((p) => {
        if (p.mode === 'DIALOGUE') dialogueWords += p.wordCount;
        const sHits = (p.text.match(sensoryLexicon) || []).length;
        sensoryHitsTotal += sHits;
        if (sHits === 0) {
            if (!zeroSensoryStartAnchor) zeroSensoryStartAnchor = p.id;
            consecutiveZeroSensoryWords += p.wordCount;
        } else {
            if (consecutiveZeroSensoryWords >= 320 && zeroSensoryStartAnchor) {
                whiteRoomSpans.push({
                    start_anchor: zeroSensoryStartAnchor,
                    end_anchor: p.id,
                    word_span: consecutiveZeroSensoryWords
                });
            }
            consecutiveZeroSensoryWords = 0;
            zeroSensoryStartAnchor = null;
        }
    });
    if (
        consecutiveZeroSensoryWords >= 320 &&
        zeroSensoryStartAnchor &&
        normalized.paragraphs.length > 0
    ) {
        whiteRoomSpans.push({
            start_anchor: zeroSensoryStartAnchor,
            end_anchor: normalized.paragraphs[normalized.paragraphs.length - 1].id,
            word_span: consecutiveZeroSensoryWords
        });
    }

    const dialogueRatio = Number((dialogueWords / totalWords).toFixed(3));
    const sensoryDensityPer1k = Number(((sensoryHitsTotal / totalWords) * 1000).toFixed(2));
    const actionHits = (
        normalized.paragraphs
            .map((p) => p.text)
            .join(' ')
            .match(actionVerbs) || []
    ).length;
    const kineticVelocity = Number(
        Math.min(
            1.0,
            (actionHits / totalWords) * 35 + dialogueRatio * 0.4 + (1 / Math.max(8, meanL)) * 3.5
        ).toFixed(3)
    );

    const hardSlopViolations: SlopViolationItem[] = [];
    const closerViolations: SlopViolationItem[] = [];
    const flagSlopViolations: SlopViolationItem[] = [];
    const rhetoricalViolations: SlopViolationItem[] = [];
    const punctuationCollapse: SlopViolationItem[] = [];
    const questionFreeDialogue: SlopViolationItem[] = [];
    const slopViolations: SlopViolationItem[] = [];

    const rawSceneTextForSlop = String(
        sceneItem.proseText || normalized.paragraphs.map((p) => p.text).join('\n\n')
    );
    const isAudioDramaScene =
        story?.writing_mode === 'audio_drama' || isAudioDramaScriptText(rawSceneTextForSlop);

    const findAnchorForSlopHit = (hit: {
        match?: string;
        sentence?: string;
        isTrailingCloser?: boolean;
        start?: number;
    }) => {
        const matchLow = String(hit.match || '').toLowerCase();
        const sentLow = String(hit.sentence || '').toLowerCase();
        if (hit.isTrailingCloser && allSentences.length > 0) {
            const tailSents = allSentences.slice(-2);
            const exactTail = tailSents.find(
                (s) => matchLow && s.text.toLowerCase().includes(matchLow)
            );
            if (exactTail) return exactTail;
            return tailSents[tailSents.length - 1];
        }
        if (sentLow) {
            const sentMatch = allSentences.find(
                (s) =>
                    s.text.toLowerCase().includes(sentLow.slice(0, 48)) ||
                    sentLow.includes(s.text.toLowerCase().slice(0, 48))
            );
            if (sentMatch) return sentMatch;
        }
        if (matchLow) {
            const byMatch = allSentences.find((s) => s.text.toLowerCase().includes(matchLow));
            if (byMatch) return byMatch;
        }
        const ratio =
            rawSceneTextForSlop.length > 0
                ? Math.min(0.99, Math.max(0, (hit.start || 0) / rawSceneTextForSlop.length))
                : 0;
        const approxIdx = Math.min(
            Math.max(0, Math.floor(ratio * allSentences.length)),
            Math.max(0, allSentences.length - 1)
        );
        return (
            allSentences[approxIdx] || {
                id: `${sceneId}:p1:s1`,
                paragraphId: `${sceneId}:p1`,
                text: hit.sentence || ''
            }
        );
    };

    const slopScan = scanTextForSlop(rawSceneTextForSlop, {
        slopConfig: slopConfig ? ({ ...DEFAULT_SLOP_CONFIG, ...slopConfig } as SlopConfig) : DEFAULT_SLOP_CONFIG,
        customBannedPhrases,
        story: story as Record<string, unknown>,
        isAudioDrama: isAudioDramaScene
    });

    const seenViolKeys = new Set<string>();
    const mapHit = (h: {
        match: string;
        sentence: string;
        categoryTitle: string;
        categoryId: string;
        severity: string;
        isClustered?: boolean;
        isTrailingCloser?: boolean;
        note?: string;
        start?: number;
    }): SlopViolationItem => {
        const anc = findAnchorForSlopHit(h);
        return {
            anchor: anc.id,
            paragraphId: anc.paragraphId || String(anc.id).split(':s')[0],
            phrase: h.match,
            category: h.categoryTitle || h.categoryId,
            categoryId: h.categoryId,
            severity: h.severity,
            isClustered: Boolean(h.isClustered),
            isTrailingCloser: Boolean(h.isTrailingCloser),
            note: h.note || '',
            text: anc.text || h.sentence || ''
        };
    };

    (slopScan.hardHits || []).forEach((h) => {
        const mapped = mapHit(h);
        hardSlopViolations.push(mapped);
        const k = `${mapped.anchor}::${mapped.phrase.toLowerCase()}`;
        if (!seenViolKeys.has(k)) {
            seenViolKeys.add(k);
            slopViolations.push(mapped);
        }
    });
    (slopScan.closerHits || []).forEach((h) => {
        const mapped = mapHit(h);
        closerViolations.push(mapped);
        const k = `${mapped.anchor}::${mapped.phrase.toLowerCase()}`;
        if (!seenViolKeys.has(k)) {
            seenViolKeys.add(k);
            slopViolations.push(mapped);
        }
    });
    (slopScan.flagHits || []).forEach((h) => {
        const mapped = mapHit(h);
        flagSlopViolations.push(mapped);
        if (mapped.isClustered) {
            const k = `${mapped.anchor}::${mapped.phrase.toLowerCase()}`;
            if (!seenViolKeys.has(k)) {
                seenViolKeys.add(k);
                slopViolations.push(mapped);
            }
        }
    });
    (slopScan.patternHits || []).forEach((h) => {
        if (h.severity !== 'hard' && !h.isTrailingCloser) {
            rhetoricalViolations.push(mapHit(h));
        }
    });
    (slopScan.densityHits || []).forEach((h) => {
        const mapped = mapHit(h);
        if (h.categoryId === 'punctuation_collapse') punctuationCollapse.push(mapped);
        else if (h.categoryId === 'question_free_dialogue') questionFreeDialogue.push(mapped);
    });

    const speakerSlices: Record<string, NormalizedSentence[]> = {};
    allSentences.forEach((s) => {
        if (!s.speaker_ref || s.speaker_ref === 'dialogue_speaker') return;
        if (!speakerSlices[s.speaker_ref]) speakerSlices[s.speaker_ref] = [];
        speakerSlices[s.speaker_ref].push(s);
    });

    const characterVoiceMetrics: Record<string, Character8DVoiceVector> = {};
    Object.entries(speakerSlices).forEach(([spkId, sents]) => {
        characterVoiceMetrics[spkId] = computeCharacter8DVoiceVector(sents);
    });

    const somaticTotalHits = somaticCrutches.reduce((sum, sc) => sum + (sc.count || 0), 0);
    const xml = `<SceneProseTelemetry scene_id="${sceneId}" word_count="${totalWords}">
  <RhythmAndSyntax mean_sentence_words="${meanL.toFixed(1)}" std_sentence_words="${stdL.toFixed(1)}" cv="${cv.toFixed(3)}" hypotaxis_ratio="${hypotaxisRatio}" left_branching_index="${leftBranchingIndex}" passive_rate="${passiveVoiceRate}" />
  <PsychicDistanceAndPOV mean_pd="${meanPsychicDistance}" filter_words_per_1k="${filterWordDensityPer1k}" head_hop_count="${povHeadHops.length}" />
  <DiscourseAndPacing dialogue_ratio="${dialogueRatio}" sensory_per_1k="${sensoryDensityPer1k}" kinetic_velocity="${kineticVelocity}" white_room_count="${whiteRoomSpans.length}" />
  <Anomalies slop_count="${slopViolations.length}" hard_slop_count="${hardSlopViolations.length}" closer_count="${closerViolations.length}" rhetorical_count="${rhetoricalViolations.length}" somatic_crutch_count="${somaticTotalHits}" echo_count="${lexicalEchoes.length}" monotonous_cluster_count="${monotonousClusters.length}" />
</SceneProseTelemetry>`;

    return {
        sceneId,
        proseKey: normalized.proseKey,
        wordCount: totalWords,
        meanSentenceWords: Number(meanL.toFixed(2)),
        stdSentenceWords: Number(stdL.toFixed(2)),
        sentenceLengthCV: Number(cv.toFixed(3)),
        hypotaxisRatio,
        leftBranchingIndex,
        passiveVoiceRate,
        meanPsychicDistance,
        filterWordDensityPer1k,
        filterWordMatches,
        povHeadHops,
        lexicalEchoes,
        somaticCrutches,
        dialogueRatio,
        sensoryDensityPer1k,
        kineticVelocity,
        whiteRoomSpans,
        monotonousClusters,
        slopViolations,
        hardSlopViolations,
        closerViolations,
        flagSlopViolations,
        rhetoricalViolations,
        punctuationCollapse,
        questionFreeDialogue,
        characterVoiceMetrics,
        xml
    };
}

/** Computes the 8-dimensional linguistic feature vector for a speaker's dialogue turns. */
export function computeCharacter8DVoiceVector(
    sentenceObjs: ReadonlyArray<{ text: string }> = []
): Character8DVoiceVector {
    if (!Array.isArray(sentenceObjs) || sentenceObjs.length === 0) {
        return {
            turnCount: 0,
            avg_dialogue_turn_words: 10.0,
            contraction_rate: 0.05,
            question_ratio: 0.15,
            exclamation_ratio: 0.05,
            lexical_diversity: 0.7,
            latinate_ratio: 0.15,
            subordinate_clause_rate: 0.15,
            colloquial_marker_rate: 0.08
        };
    }
    const totalTurns = sentenceObjs.length;
    const allText = sentenceObjs.map((s) => s.text).join(' ');
    const words = allText.toLowerCase().match(/\b[a-z'’]+\b/g) || [];
    const wordCount = Math.max(1, words.length);
    const uniqueWords = new Set(words.map((w) => w.replace(/['’].*$/, ''))).size;

    const contractions = (allText.match(/\b\w+['’](?:t|re|ve|ll|d|m|s)\b/gi) || []).length;
    const questions = sentenceObjs.filter((s) => s.text.includes('?')).length;
    const exclamations = sentenceObjs.filter((s) => s.text.includes('!')).length;
    const latinateWords = words.filter(
        (w) => /(?:tion|sion|ment|ence|ance|ity|ive|ous|al|ize|ate)$/.test(w) && w.length >= 7
    ).length;
    const subClauses = (
        allText.match(
            /\b(?:although|though|because|since|unless|until|while|whereas|if|when|after|before)\b/gi
        ) || []
    ).length;
    const colloquial = (
        allText.match(
            /\b(?:yeah|nah|hell|damn|gonna|wanna|gotta|ain't|look|listen|well|just|maybe|sorta|kinda)\b|—|\.\.\.|…/gi
        ) || []
    ).length;

    return {
        turnCount: totalTurns,
        avg_dialogue_turn_words: Number((wordCount / totalTurns).toFixed(2)),
        contraction_rate: Number((contractions / wordCount).toFixed(3)),
        question_ratio: Number((questions / totalTurns).toFixed(3)),
        exclamation_ratio: Number((exclamations / totalTurns).toFixed(3)),
        lexical_diversity: Number((uniqueWords / Math.sqrt(2 * wordCount)).toFixed(3)),
        latinate_ratio: Number((latinateWords / wordCount).toFixed(3)),
        subordinate_clause_rate: Number((subClauses / totalTurns).toFixed(3)),
        colloquial_marker_rate: Number((colloquial / totalTurns).toFixed(3))
    };
}

/** Computes normalized Euclidean distance `D_self(c, k)` from a scene vector to a character centroid. */
export function computeVoiceDriftDistance(
    sceneVec: Partial<Character8DVoiceVector> | null | undefined,
    globalCentroid: Record<string, number> | null | undefined,
    globalStd?: Record<string, number> | null
): number {
    if (!sceneVec || !globalCentroid || (sceneVec.turnCount || 0) < 2) return 0.0;
    const defaultScale: Record<string, number> = {
        avg_dialogue_turn_words: 5.5,
        contraction_rate: 0.045,
        question_ratio: 0.18,
        exclamation_ratio: 0.12,
        lexical_diversity: 0.35,
        latinate_ratio: 0.08,
        subordinate_clause_rate: 0.16,
        colloquial_marker_rate: 0.18
    };
    let sumSq = 0;
    const vecRecord = sceneVec as unknown as Record<string, number | undefined>;
    VOICE_DIMS.forEach((d) => {
        const diff = (vecRecord[d] || 0) - (globalCentroid[d] || 0);
        const scale = Math.max(defaultScale[d] * 0.6, (globalStd && globalStd[d]) || defaultScale[d]);
        sumSq += Math.pow(diff / scale, 2);
    });
    return Number(Math.sqrt(sumSq / VOICE_DIMS.length).toFixed(3));
}

/** Runs Stage 2A NLP telemetry across all drafted scenes and computes character centroids & drift. */
export function runFullManuscriptNlpTelemetry(
    story: EditorialStoryInput | null | undefined,
    customBannedPhrases: string[] = [],
    slopConfig: Partial<SlopConfig> | null = null
): FullManuscriptTelemetryReport {
    const scenesList = getDraftedStoryScenesList(story);
    const sceneTelemetryMap: Record<string, SceneTelemetryReport> = {};
    const charSceneVectors: Record<
        string,
        Array<{ sceneId: string; vec: Character8DVoiceVector }>
    > = {};

    scenesList.forEach((sc) => {
        const t = runSceneNlpTelemetry(sc, story || {}, customBannedPhrases, slopConfig);
        sceneTelemetryMap[sc.sceneId] = t;
        Object.entries(t.characterVoiceMetrics || {}).forEach(([spkId, vec]) => {
            if (!charSceneVectors[spkId]) charSceneVectors[spkId] = [];
            charSceneVectors[spkId].push({ sceneId: sc.sceneId, vec });
        });
    });

    const characterCentroids: FullManuscriptTelemetryReport['characterCentroids'] = {};
    Object.entries(charSceneVectors).forEach(([spkId, entries]) => {
        const centroid: Record<string, number> = {};
        const std: Record<string, number> = {};
        VOICE_DIMS.forEach((d) => {
            const vals = entries.map((e) => (e.vec[d] as number) || 0);
            const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
            const s = Math.sqrt(
                vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, vals.length)
            );
            centroid[d] = Number(mean.toFixed(3));
            std[d] = Number(Math.max(0.02, s).toFixed(3));
        });
        characterCentroids[spkId] = { centroid, std, scenesSampled: entries.length };

        entries.forEach((e) => {
            const drift = computeVoiceDriftDistance(e.vec, centroid, std);
            if (sceneTelemetryMap[e.sceneId]?.characterVoiceMetrics?.[spkId]) {
                sceneTelemetryMap[e.sceneId].characterVoiceMetrics[spkId].driftDistance = drift;
            }
        });
    });

    return {
        scenesList,
        sceneTelemetryMap,
        characterCentroids
    };
}

/** Extracts `<AuthorVoiceDNA>` from the manuscript's strongest paragraphs and telemetry averages. */
export async function extractAuthorVoiceDNA(
    story: EditorialStoryInput | null | undefined,
    fullTelemetry?: FullManuscriptTelemetryReport | null,
    callAIFn: EditorialCallAIFn | null = null,
    customBannedPhrases: string[] = []
): Promise<AuthorVoiceDNA> {
    const scenesList = fullTelemetry?.scenesList || getDraftedStoryScenesList(story);
    const telemetryMap = fullTelemetry?.sceneTelemetryMap || {};

    let totalMeanWords = 15.2;
    let totalStdWords = 8.4;
    let totalCv = 0.55;
    let totalHypotaxis = 0.38;
    let totalLeftBranch = 0.24;
    let totalPassive = 0.06;
    let totalPd = 2.1;
    let totalFilterRate = 2.8;
    let totalDialogueRatio = 0.38;

    const tValues = Object.values(telemetryMap);
    if (tValues.length > 0) {
        const avg = (fn: (item: SceneTelemetryReport) => number): number =>
            tValues.reduce((acc, x) => acc + fn(x), 0) / tValues.length;
        totalMeanWords = Number(avg((x) => x.meanSentenceWords).toFixed(1));
        totalStdWords = Number(avg((x) => x.stdSentenceWords).toFixed(1));
        totalCv = Number(avg((x) => x.sentenceLengthCV).toFixed(2));
        totalHypotaxis = Number(avg((x) => x.hypotaxisRatio).toFixed(2));
        totalLeftBranch = Number(avg((x) => x.leftBranchingIndex).toFixed(2));
        totalPassive = Number(avg((x) => x.passiveVoiceRate).toFixed(2));
        totalPd = Number(avg((x) => x.meanPsychicDistance).toFixed(2));
        totalFilterRate = Number(avg((x) => x.filterWordDensityPer1k).toFixed(2));
        totalDialogueRatio = Number(avg((x) => x.dialogueRatio).toFixed(2));
    }

    const candidateParagraphs: Array<{
        anchor: string;
        mode: string;
        text: string;
        score: number;
        cv: number;
    }> = [];
    scenesList.forEach((sc) => {
        const scTel = telemetryMap[sc.sceneId];
        sc.normalized.paragraphs.forEach((p) => {
            if (p.wordCount < 35 || p.wordCount > 240) return;
            const hasHardOrCloser = (scTel?.hardSlopViolations || [])
                .concat(scTel?.closerViolations || [])
                .some((v) => v.anchor.startsWith(p.id));
            const hasSlop =
                hasHardOrCloser ||
                (scTel?.slopViolations || []).some((v) => v.anchor.startsWith(p.id));
            const hasFilter = (scTel?.filterWordMatches || []).some((f) =>
                f.anchor.startsWith(p.id)
            );
            if (hasSlop || hasFilter) return;
            const sLens = p.sentences.map((s) => s.wordCount);
            const pMean = sLens.reduce((a, b) => a + b, 0) / Math.max(1, sLens.length);
            const pStd = Math.sqrt(
                sLens.reduce((acc, l) => acc + Math.pow(l - pMean, 2), 0) / Math.max(1, sLens.length)
            );
            const pCv = pMean > 0 ? pStd / pMean : 0.3;
            const score =
                pCv * 40 +
                Math.min(30, p.sentences.length * 5) +
                (p.mode === 'DIALOGUE' ? 12 : 10);
            candidateParagraphs.push({
                anchor: p.id,
                mode: p.mode === 'DIALOGUE' ? 'SUBTEXTUAL_DIALOGUE' : 'ATMOSPHERIC_NARRATION',
                text: p.text,
                score,
                cv: Number(pCv.toFixed(2))
            });
        });
    });

    candidateParagraphs.sort((a, b) => b.score - a.score);
    let exemplars = candidateParagraphs.slice(0, 4).map((c, idx) => ({
        id: `ex_${idx + 1}`,
        source_anchor: c.anchor,
        mode: c.mode,
        verbatimText: c.text,
        stylisticNotes: `High rhythmic variation (CV=${c.cv}), zero filter words, concrete perceptual grounding.`
    }));

    const freqMap: Record<string, number> = {};
    scenesList.forEach((sc) => {
        const words = sc.proseText.toLowerCase().match(/\b[a-z]{6,}\b/g) || [];
        words.forEach((w) => {
            freqMap[w] = (freqMap[w] || 0) + 1;
        });
    });
    const signatureLexicon = Object.entries(freqMap)
        .filter((entry) => entry[1] >= 2 && entry[1] <= 18)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16)
        .map(([lemma, count]) => ({ lemma, register: 'manuscript_domain', count }));

    if (typeof callAIFn === 'function' && candidateParagraphs.length >= 2) {
        try {
            const topPoolXml = candidateParagraphs
                .slice(0, 8)
                .map(
                    (c) =>
                        `<Candidate anchor="${c.anchor}" mode="${c.mode}" cv="${c.cv}"><![CDATA[${c.text}]]></Candidate>`
                )
                .join('\n');
            const prompt = `<ManuscriptStylometricSummary mean_sentence_words="${totalMeanWords}" cv="${totalCv}" hypotaxis="${totalHypotaxis}" psychic_distance="${totalPd}" />\n<CandidateParagraphPool>\n${topPoolXml}\n</CandidateParagraphPool>\nSelect the 3-4 strongest <ExemplarParagraph> items and 12 <SignatureLexeme> items.`;
            const rawResp = await callAIFn(
                prompt,
                PROMPTS.voiceDnaExtractorAgent,
                false,
                'Editorial Harness: Voice DNA Extractor',
                'review'
            );
            const exBlocks = extractTagList(rawResp, 'ExemplarParagraph') || [];
            if (exBlocks.length > 0) {
                exemplars = exBlocks.map((blk, i) => {
                    const idMatch = blk.match(/id="([^"]+)"/i);
                    const anchorMatch = blk.match(/source_anchor="([^"]+)"/i);
                    const modeMatch = blk.match(/mode="([^"]+)"/i);
                    const vText =
                        extractTag(blk, 'VerbatimText') || candidateParagraphs[i]?.text || '';
                    const sNotes =
                        extractTag(blk, 'StylisticNotes') || 'Curated authorial voice exemplar.';
                    return {
                        id: idMatch ? idMatch[1] : `ex_${i + 1}`,
                        source_anchor: anchorMatch
                            ? anchorMatch[1]
                            : candidateParagraphs[i]?.anchor || 'sc_0_0:p1',
                        mode: modeMatch ? modeMatch[1] : 'NARRATIVE',
                        verbatimText: vText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(),
                        stylisticNotes: sNotes.trim()
                    };
                });
            }
        } catch (e) {
            console.warn(
                '[VoiceDNAExtractor] Falling back to deterministic exemplar selection:',
                e
            );
        }
    }

    const combinedSlop: HarnessLexiconRule[] = [
        ...HARNESS_FORBIDDEN_SLOP_LEXICON,
        ...(customBannedPhrases || []).slice(0, 25).map((p) => ({
            phrase: p,
            category: 'STORY_BANNED_LEXICON',
            regex: `\\b${escapeRegExp(p)}\\b`
        }))
    ];

    const xml = `<AuthorVoiceDNA version="1.0" extracted_from_scenes="${scenesList.length}">
  <SyntacticCadenceProfile>
    <SentenceLengthDistribution mean_words="${totalMeanWords}" std_dev_words="${totalStdWords}" coeff_of_variation="${totalCv}" p10_words="5" p50_words="${Math.round(totalMeanWords * 0.9)}" p90_words="${Math.round(totalMeanWords + totalStdWords * 1.3)}" max_run_short_sentences="4" max_run_long_sentences="2" />
    <ClauseTopology hypotaxis_to_parataxis_ratio="${totalHypotaxis}" avg_subordinate_clauses_per_sentence="${(totalHypotaxis * 1.4).toFixed(2)}" participial_opening_max_rate="0.08" left_branching_sentence_ratio="${totalLeftBranch}" passive_voice_baseline_rate="${totalPassive}" />
    <PunctuationSignature em_dash_per_1k="6.5" semicolon_per_1k="2.1" fragment_sentence_ratio="0.09" />
  </SyntacticCadenceProfile>
  <PerceptualAndPsychicProfile>
    <BaselinePsychicDistance value="${totalPd}" />
    <FilterVerbCeiling per_1k_words="${Math.max(3.5, totalFilterRate)}" />
    <FreeIndirectDiscourseDensity per_1k_words="11.5" />
    <DialogueTagDistribution action_beat_anchor_ratio="0.52" bare_said_asked_ratio="0.38" zero_tag_turn_ratio="0.10" adverbial_tag_ceiling="0.01" />
  </PerceptualAndPsychicProfile>
  <LexicalAndSensoryProfile>
    <MovingAverageTypeTokenRatio window_500="0.74" />
    <SignatureLexicon>
${signatureLexicon.map((s) => `      <SignatureLexeme lemma="${escapeHarnessXml(s.lemma)}" register="${escapeHarnessXml(s.register)}" />`).join('\n')}
    </SignatureLexicon>
  </LexicalAndSensoryProfile>
  <GoldStandardExemplars>
${exemplars.map((ex) => `    <ExemplarParagraph id="${escapeHarnessXml(ex.id)}" source_anchor="${escapeHarnessXml(ex.source_anchor)}" mode="${escapeHarnessXml(ex.mode)}">\n      <VerbatimText><![CDATA[${ex.verbatimText}]]></VerbatimText>\n      <StylisticNotes>${escapeHarnessXml(ex.stylisticNotes)}</StylisticNotes>\n    </ExemplarParagraph>`).join('\n')}
  </GoldStandardExemplars>
  <ForbiddenSlopLexicon>
${combinedSlop.map((sl) => `    <SlopPattern phrase="${escapeHarnessXml(sl.phrase)}" category="${escapeHarnessXml(sl.category)}" regex="${escapeHarnessXml(sl.regex)}" />`).join('\n')}
  </ForbiddenSlopLexicon>
</AuthorVoiceDNA>`;

    return {
        extractedFromScenes: scenesList.length,
        syntacticCadence: {
            meanWords: totalMeanWords,
            stdDevWords: totalStdWords,
            coeffOfVariation: totalCv,
            hypotaxisRatio: totalHypotaxis,
            leftBranchingRatio: totalLeftBranch,
            passiveRate: totalPassive
        },
        perceptualProfile: {
            baselinePsychicDistance: totalPd,
            filterVerbRate: totalFilterRate,
            dialogueRatio: totalDialogueRatio
        },
        signatureLexicon,
        exemplars,
        forbiddenSlopLexicon: combinedSlop,
        xml
    };
}
