/**
 * @module domain/audio/voiceProfiles
 * Deterministic voice profile validation/synthesis, speaker identity hashing,
 * reference transcript extraction, backend voice mappers, TTS error translation,
 * scene prose hashing, and full-story audio export sequence planning.
 */

import type { CastMember, Story } from '@/types';
import { migrateAudioDramaSettings } from '@/config';
import type { AudioDramaSettings } from '@/config';
import { resolveCharacter } from '@/domain/story';
import { parseAudioDramaScript } from './scriptParser';

export interface VoiceCastMember extends Partial<CastMember> {
    name?: string;
    gender?: string;
    age?: string | number;
    corner_role?: string;
    archetype?: string;
    vocal_profile?: string;
    voice_profile?: string;
    voice_description?: string;
    voice?: unknown;
    user_edited_cadence?: boolean;
    reference_text?: string;
    user_edited_reference_text?: boolean;
    interview_psychology?: string;
    deep_profile?: string;
    canonical_interview_voice?: string;
    way_of_living?: string;
    why_it_makes_sense?: string;
    what_it_costs_them?: string;
    shared_outlook?: string;
    how_they_ended_up?: string;
    sceneEmotions?: string;
    sceneDialogueSample?: string;
    details?: {
        history?: string;
        deep_profile?: string;
        vocal_profile?: string;
        [key: string]: unknown;
    };
}

export interface AudioStoryLike extends Partial<Story> {
    narrator_vocal_cadence?: string;
    narrator_voice_profile?: string;
    narrator_voice_seed?: number;
    narrator_reference_text?: string;
    user_edited?: Record<string, boolean | undefined>;
    themes?: string;
}

export interface ResolvedCastMemberResult {
    found: VoiceCastMember | null;
    fromCastList: boolean;
    castList: VoiceCastMember[];
    cleanName: string;
    passedObj: VoiceCastMember | null;
}

export interface SpeakerVoiceIdentity {
    liveStory: AudioStoryLike | null | undefined;
    storyId: string;
    rawSpk: string;
    normalizedSpk: string;
    isNarrator: boolean;
    matchedChar: VoiceCastMember | null;
    masterKey: string;
    promptInstruction: string;
    baseSeed: number;
    guidanceScale: number;
    expectedReferenceText: string;
    sigHash: string;
    uploadKey: string;
    effectiveSettings: AudioDramaSettings | Record<string, unknown>;
}

export interface MasterVoiceRecordLike {
    refPath?: string | null;
    promptInstruction?: string;
    seed?: number;
    referenceText?: string;
    signatureHash?: string;
    [key: string]: unknown;
}

export interface HumanReadableTtsError {
    type: string;
    title: string;
    message: string;
    suggestedAction: string;
    actionLabel: string;
    secondaryAction: string;
    secondaryLabel: string;
    allowSettings: boolean;
}

export interface AudioStorageRecordLike {
    blob?: Blob | null;
    seqIdx?: number | string;
    sceneIdx?: number | string;
    includedSceneIndices?: Array<number | string>;
    [key: string]: unknown;
}

export interface SequenceAudioPlanItem {
    blob: Blob;
    seqIdx: number;
    sceneIdx?: number;
    isSequenceBlob?: boolean;
    coveredIndices?: number[];
    label: string;
    pauseAfterMs: number | null;
}

export interface SequenceAudioPlanResult {
    seqIdx: number;
    seqNum: number;
    seqTitle: string;
    totalScenes: number;
    items: SequenceAudioPlanItem[];
    coveredSceneIndices: number[];
    coveredSet: Set<number>;
    missingIndices: number[];
    internalMissingIndices: number[];
    trailingMissingIndices: number[];
    status: 'none' | 'incomplete' | 'missing_in_structure' | 'complete';
    usedSequenceRecord: boolean;
}

export interface AudioExportSlot {
    type: 'sequence' | 'scene';
    seqIdx: number;
    sceneIdx?: number;
    seqNum: number;
    label: string;
    hasAudio: boolean;
}

export interface StoryAudioExportPlan {
    status: 'none' | 'incomplete' | 'missing_in_structure' | 'complete';
    items: SequenceAudioPlanItem[];
    seqPlans: SequenceAudioPlanResult[];
    totalOutlinedScenes: number;
    coveredSceneCount: number;
    totalSeqs: number;
    coveredSeqCount: number;
    missingBeforeLast: AudioExportSlot[];
    missingAfterLast: AudioExportSlot[];
    missingBeforeSummary: string;
    missingAfterSummary: string;
}

export const RAIN_SENTENCE =
    'A steady evening breeze drifted along the quiet avenue as warm amber streetlights flickered awake one by one. Inside the corner bookshop, old floorboards creaked beneath unhurried footsteps while someone turned a crisp page and paused to listen to the distant rumble of passing traffic.';

export const BREEZE_MASTER_GUIDANCE_SCALE = 1.8;

export const META_TOKENS = new Set([
    'sigh',
    'laugh',
    'cough',
    'gasp',
    'yawn',
    'speaker',
    'narrator',
    'breeze',
    'drama'
]);

export const VOICE_REFERENCE_MIN_SECONDS = 15;
export const VOICE_REFERENCE_TARGET_MAX_SECONDS = 20;

/** Strips leading character names, honorific prefixes, and stale anchor text from a voice description. */
export function cleanCharacterNameFromVoiceProfile(
    rawDesc: unknown,
    namesToStrip: Array<string | undefined | null> = []
): string {
    if (!rawDesc) return '';
    let desc = String(rawDesc).trim();
    const fullNames: string[] = [];
    namesToStrip.filter(Boolean).forEach((n) => {
        const trimmed = String(n).trim();
        if (!trimmed || trimmed.toLowerCase() === 'narrator') return;
        fullNames.push(trimmed);
        const noHonorific = trimmed
            .replace(
                /^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Capt\.|Captain|Det\.|Detective|Prof\.|Professor|Lord|Lady|Sir|Dame|General|Colonel|Major|Lieutenant|Sergeant|Inspector)\s+/i,
                ''
            )
            .trim();
        if (noHonorific && noHonorific !== trimmed) {
            fullNames.push(noHonorific);
        }
    });

    const sortedNames = Array.from(new Set(fullNames)).sort((a, b) => b.length - a.length);
    sortedNames.forEach((nameStr) => {
        const esc = nameStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        desc = desc.replace(new RegExp(`^\\[?${esc}\\]?\\s*[:\\-–—]\\s*`, 'i'), '');
        desc = desc.replace(
            new RegExp(`^${esc}\\s+(?:is|has|speaks\\s+with)\\s+(an?\\s+|the\\s+)?`, 'i'),
            (_m, art: string | undefined) =>
                art ? art.charAt(0).toUpperCase() + art.slice(1) : 'A '
        );
        desc = desc.replace(new RegExp(`\\b${esc}'s\\s+voice\\s+is\\s+`, 'gi'), 'A ');
        desc = desc.replace(new RegExp(`\\b${esc}'s\\b`, 'gi'), 'their');
    });

    desc = desc.replace(
        /^A\s+(?:middle-aged|elderly|young adult|teenager|child(?:\s+around\s+\d+\s+years\s+old)?)\s+(?:male|female|neutral)\s+voice\.\s+(?=(?:nine|ten|eleven|twelve|twenty|thirty|forty|fifty|mid-\d\ds?|\d{1,2}\b|a\s+woman\s+in\s+her|a\s+man\s+in\s+his|[a-zA-Z\s]+,\s*(?:female|male)))/i,
        ''
    );

    desc = desc.replace(/^([A-Z][a-zA-Z0-9_\s]{1,25})\s*:\s*/, '');
    desc = desc
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;])/g, '$1')
        .trim();
    return desc;
}

/** Checks whether a vocal description is a non-placeholder, non-action vocal description. */
export function isUsableVocalDescription(text: unknown): boolean {
    if (!text || typeof text !== 'string') return false;
    let trimmed = text.trim();
    trimmed = trimmed.replace(/^["“”']\s*|\s*["“”']$/g, '').trim();
    if (trimmed.length < 15 || trimmed.length > 2048) return false;
    if (/^(?:standard|standard rhythm and tone|distinct speech cadence|n\/a|none|default|unknown)$/i.test(trimmed)) {
        return false;
    }
    if (
        /\b(?:undefined|null)\b/i.test(trimmed) ||
        /\b(?:doesn't look up|shakes his head|shakes her head|laughs,\s+a|sets the|rubs his|reaches out)\b/i.test(
            trimmed
        )
    ) {
        return false;
    }
    return true;
}

/** Detects legacy template boilerplate voice descriptions slated for re-synthesis. */
export function isLegacyBoilerplateVoiceProfile(text: unknown): boolean {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim().replace(/^["“”']\s*|\s*["“”']$/g, '').trim();
    return /^A\s+[a-z-]+,\s+(?:child(?:\s+around\s+\d+\s+years\s+old)?|teenager|young adult|middle-aged|elderly)\s+(?:male|female|neutral)\s+voice,\s+with\s+a\s+(?:fast|medium|slow|measured)\s+pace,\s+(?:high|medium|low)\s+pitch,\s+and\s+a\s+(?:slightly\s+)?[a-z-]+(?:,\s+[a-z-]+)?\s+tone,\s+suitable\s+for\s+/i.test(
        trimmed
    );
}

/** Validates whether a vocal description specifies both voice gender/register and acoustic dimensions. */
export function isValidVoiceDesignProfile(text: unknown): boolean {
    if (!isUsableVocalDescription(text)) return false;
    if (isLegacyBoilerplateVoiceProfile(text)) return false;
    const trimmed = String(text).trim();
    const hasGender =
        /\b(male|female|neutral|man|woman|boy|girl|androgynous|baritone|tenor|bass|soprano|alto|contralto|mezzo)\b/i.test(
            trimmed
        );
    const hasAcousticDimension =
        /\b(pitch|pitched|pace|paced|slow|fast|moderate|medium|low|high|deep|crisp|hoarse|mellow|sweet|rich|powerful|magnetic|calm|gentle|serious|lively|composed|soothing|cheerful|intense|timbre|tone|voice|cadence|delivery|raspy|gravelly|velvety|warm|smooth|breathy|breathiness|deliberate|pauses|rapid-fire|years?\s+old|young|middle-aged|elderly|teenager|child|adult|twenties|thirties|forties|fifties|sixties|suitable\s+for|audiobook|narration|audio\s+drama|voice-over|broadcast|meditation)\b/i.test(
            trimmed
        );
    return hasGender && hasAcousticDimension;
}

export const isValidQwenVoiceProfile = isValidVoiceDesignProfile;

/** Deterministic FNV-1a 32-bit unsigned hash used for differentiating ensemble voices. */
export function computeVoiceVarietyHash(str: unknown): number {
    const s = String(str || 'character')
        .toLowerCase()
        .trim();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
}

/** Synthesizes a 7-dimension Studio Voice Design prompt from character dossier and story genre. */
export function synthesizeVoiceDesignProfile(
    charObj: VoiceCastMember | null | undefined,
    speakerName = '',
    storyContext: AudioStoryLike | null | undefined = null
): string {
    const nameStr = String(charObj?.name || speakerName || 'Character').trim();
    const genreText = [
        storyContext?.genre || (charObj as Record<string, unknown> | null)?.genre || '',
        storyContext?.tone || (charObj as Record<string, unknown> | null)?.tone || '',
        storyContext?.themes || '',
        storyContext?.concept || ''
    ].join(' ');

    if (!nameStr || nameStr.toLowerCase() === 'narrator') {
        if (/\b(horror|gothic|occult|supernatural|grimdark|eldritch)\b/i.test(genreText)) {
            return 'A middle-aged male voice, late forties, low-pitched with dark resonance and a slightly hoarse, magnetic timbre. Slow, deliberate pace with pauses and a serious, intense delivery. Suitable for atmospheric horror audiobook narration or suspenseful audio drama.';
        }
        if (/\b(noir|mystery|detective|crime|thriller|espionage|suspense)\b/i.test(genreText)) {
            return 'A middle-aged male voice, mid-forties, deep baritone with a smoky, gravelly texture and crisp articulation. Moderate, measured pace with a calm, observant delivery. Suitable for investigative journalism, mystery voice-over, or noir audiobook narration.';
        }
        if (/\b(romance|romantic|cozy|heartwarming)\b/i.test(genreText)) {
            return 'A young adult female voice, late twenties, medium pitch with a warm, mellow smoothness and subtle breathiness. Moderate pace, gentle and soothing delivery. Suitable for intimate romance audiobook narration or heartfelt dramatic voice-over.';
        }
        if (/\b(sci-fi|science\s+fiction|cyberpunk|space\s+opera|dystopian|futuristic)\b/i.test(genreText)) {
            return 'A middle-aged female voice, early forties, medium-low pitch with crisp, magnetic clarity and a rich undertone. Moderate, poised pace with a calm, serious delivery. Suitable for documentary broadcast, speculative fiction narration, or cinematic voice-over.';
        }
        if (/\b(fantasy|medieval|mythology|epic|historical)\b/i.test(genreText)) {
            return 'An elderly male voice, early sixties, deep baritone with rich, weathered resonance and a mellow warmth. Slow, deliberate pace with pauses and a calm, authoritative delivery. Suitable for historical chronicle narration or epic audiobook storytelling.';
        }
        if (/\b(comedy|satire|humorous|lighthearted)\b/i.test(genreText)) {
            return 'A young adult male voice, late twenties, medium-high pitch with a crisp, bright timbre and lively energy. Fast, nimble pace with a cheerful, witty delivery. Suitable for comedic podcast hosting, animated ad voice-over, or upbeat audiobook narration.';
        }
        return 'A middle-aged male voice, early forties, deep baritone with a rich, magnetic tone and smooth resonance. Moderate, deliberate pace with a calm, composed delivery. Suitable for literary audiobook narration or documentary broadcast.';
    }

    const primaryIdentityText = [
        nameStr,
        charObj?.gender || '',
        charObj?.age || '',
        charObj?.role || '',
        charObj?.archetype || '',
        charObj?.corner_role || ''
    ].join(' ');

    const rawCadenceText =
        (!isLegacyBoilerplateVoiceProfile(charObj?.vocal_cadence)
            ? charObj?.vocal_cadence || ''
            : '') +
        ' ' +
        (!isLegacyBoilerplateVoiceProfile(charObj?.voice_description)
            ? charObj?.voice_description || ''
            : '');

    const traitsAndPsychologyText = [
        rawCadenceText,
        charObj?.core_flaw || '',
        charObj?.core_desire || '',
        charObj?.way_of_living || '',
        charObj?.why_it_makes_sense || '',
        charObj?.what_it_costs_them || '',
        charObj?.shared_outlook || '',
        charObj?.how_they_ended_up || '',
        charObj?.sceneEmotions || '',
        charObj?.sceneDialogueSample || '',
        charObj?.details?.history || '',
        String(charObj?.details?.deep_profile || '').slice(0, 600)
    ].join(' ');

    const combinedContext = `${primaryIdentityText} ${traitsAndPsychologyText}`;

    const castList = Array.isArray(storyContext?.cast)
        ? storyContext.cast
        : Array.isArray(storyContext?.characters)
          ? storyContext.characters
          : [];
    const castIdx = castList.findIndex(
        (c) => c && c.name && c.name.toLowerCase().trim() === nameStr.toLowerCase()
    );
    const charHash = computeVoiceVarietyHash(
        `${nameStr}::${charObj?.id || castIdx}::${charObj?.role || ''}::${charObj?.corner_role || ''}`
    );
    const slotOffset = castIdx >= 0 ? castIdx : charHash % 7;

    const explicitGender = String(charObj?.gender || '')
        .toLowerCase()
        .trim();
    const femPronouns = (
        combinedContext.match(
            /\b(she|her|hers|herself|woman|female|girl|lady|matron|actress|widow|waitress|hostess|priestess|sorceress|witch|soprano|alto|contralto|mezzo|queen|princess|duchess)\b/gi
        ) || []
    ).length;
    const malePronouns = (
        combinedContext.match(
            /\b(he|him|his|himself|man|male|boy|lord|actor|waiter|barkeep|bartender|priest|monk|wizard|baritone|tenor|bass|king|prince|duke)\b/gi
        ) || []
    ).length;
    const neutralMarkers = (
        combinedContext.match(
            /\b(non-binary|nonbinary|androgynous|neutral\s+voice|they\/them|synthetic|ai\s+construct|android|droid)\b/gi
        ) || []
    ).length;

    let gender: 'male' | 'female' | 'neutral' = 'male';
    if (
        /\b(neutral|non-binary|nonbinary|androgynous)\b/i.test(explicitGender) ||
        (neutralMarkers > 0 && femPronouns === 0 && malePronouns === 0)
    ) {
        gender = 'neutral';
    } else if (/\b(female|woman|girl)\b/i.test(explicitGender)) {
        gender = 'female';
    } else if (/\b(male|man|boy)\b/i.test(explicitGender)) {
        gender = 'male';
    } else {
        const firstName = nameStr
            .replace(
                /^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Capt\.|Captain|Det\.|Detective|Prof\.|Professor|Lord|Lady|Sir|Dame|Sister|Mother|Father|Brother|General|Colonel|Major|Lieutenant|Sergeant|Officer|Agent)\s+/i,
                ''
            )
            .split(/\s+/)[0]
            .toLowerCase();
        if (/^(?:mrs\.|ms\.|miss|lady|dame|sister|mother|queen|princess|duchess|madame|matron)\b/i.test(nameStr)) {
            gender = 'female';
        } else if (/^(?:mr\.|sir|lord|father|brother|king|prince|duke)\b/i.test(nameStr)) {
            gender = 'male';
        } else if (
            /(?:a|ia|na|ra|la|ie|yn|elle|ette|ine|beth|sara|maya|elena|claire|alice|lily|rose|grace|chloe|zoe|iris|vera|nora|hannah|rachel|leah|miriam|esther|ruth|carmen|helen|margaret|victoria|catherine|elizabeth|mary|jane|anne|juliet|ophelia|lyra|clara|aria)$/i.test(
                firstName
            )
        ) {
            gender = 'female';
        } else if (femPronouns > malePronouns) {
            gender = 'female';
        } else if (malePronouns > femPronouns) {
            gender = 'male';
        }
    }

    type AgeCategory = 'child' | 'teenager' | 'young adult' | 'middle-aged' | 'elderly';
    let ageCategory: AgeCategory = 'young adult';
    let explicitYears: number | null = null;

    const ageSource = `${charObj?.age || ''} ${primaryIdentityText} ${combinedContext}`;
    const explicitYearMatch =
        ageSource.match(/\b(\d{1,2})(?:\s*-?\s*years?\s*-?\s*old)\b/i) ||
        (charObj?.age ? String(charObj.age).match(/\b(\d{1,3})\b/) : null);
    if (explicitYearMatch) {
        explicitYears = parseInt(explicitYearMatch[1], 10);
    } else {
        const wordAgeMap: Record<string, number> = {
            five: 5,
            six: 6,
            seven: 7,
            eight: 8,
            nine: 9,
            ten: 10,
            eleven: 11,
            twelve: 12,
            thirteen: 13,
            fourteen: 14,
            fifteen: 15,
            sixteen: 16,
            seventeen: 17,
            eighteen: 18,
            nineteen: 19,
            twenty: 20,
            'twenty-two': 22,
            'twenty-five': 25,
            'twenty-eight': 28,
            thirty: 30,
            'thirty-five': 35,
            forty: 40,
            'forty-five': 45,
            fifty: 50,
            'fifty-two': 52,
            'fifty-five': 55,
            sixty: 60,
            'sixty-five': 65,
            seventy: 70
        };
        const wordAgeMatch = combinedContext.match(
            /\b(five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:-[a-z]+)?|thirty(?:-[a-z]+)?|forty(?:-[a-z]+)?|fifty(?:-[a-z]+)?|sixty(?:-[a-z]+)?|seventy(?:-[a-z]+)?)-year-old\b/i
        );
        if (wordAgeMatch) {
            const key = wordAgeMatch[1].toLowerCase();
            explicitYears =
                wordAgeMap[key] ||
                (key.startsWith('twenty')
                    ? 25
                    : key.startsWith('thirty')
                      ? 34
                      : key.startsWith('forty')
                        ? 44
                        : key.startsWith('fifty')
                          ? 52
                          : key.startsWith('sixty')
                            ? 63
                            : 70);
        }
    }

    const hasAdultHonorific =
        /^(?:Dr\.|Doctor|Capt\.|Captain|Det\.|Detective|Prof\.|Professor|Lord|Lady|Sir|Dame|General|Colonel|Major|Inspector|Judge|Magistrate|Warden|Abbot|Bishop|Archbishop|Cardinal)\b/i.test(
            nameStr
        );
    const cornerRole = String(charObj?.corner_role || '').toUpperCase();

    if (explicitYears !== null) {
        if (explicitYears <= 12) ageCategory = 'child';
        else if (explicitYears <= 18) ageCategory = 'teenager';
        else if (explicitYears <= 35) ageCategory = 'young adult';
        else if (explicitYears <= 55) ageCategory = 'middle-aged';
        else ageCategory = 'elderly';
    } else if (
        /\b(elderly|ancient|grandfather|grandmother|grandpa|grandma|retired|wrinkled|grey-haired|gray-haired|crone|patriarch|matriarch|elder|sixties|seventies|eighties)\b/i.test(
            combinedContext
        )
    ) {
        ageCategory = 'elderly';
    } else if (
        /\b(middle-aged|mid-40s|mid-50s|forties|fifties|seasoned|veteran|commander|detective|mentor|blacksmith|general|colonel|professor|inspector)\b/i.test(
            combinedContext
        ) ||
        hasAdultHonorific ||
        cornerRole === 'THE_WARNING'
    ) {
        ageCategory = 'middle-aged';
    } else if (
        /\b(teen|teenager|adolescent|high\s+school|youth|youngster|apprentice\s+boy|apprentice\s+girl)\b/i.test(
            combinedContext
        )
    ) {
        ageCategory = 'teenager';
    } else if (
        /\b(child|kid|little\s+boy|little\s+girl|elementary|young\s+child|orphan\s+child)\b/i.test(
            combinedContext
        )
    ) {
        ageCategory = 'child';
    }

    const ageDetailPools: Record<AgeCategory, string[]> = {
        child: ['around eight years old', 'around ten years old', 'nine years old', 'eleven years old'],
        teenager: ['sixteen years old', 'late teens', 'mid-teens', 'seventeen years old'],
        'young adult': ['early twenties', 'mid-twenties', 'late twenties', 'early thirties'],
        'middle-aged': ['late thirties', 'early forties', 'mid-forties', 'early fifties'],
        elderly: ['late fifties', 'mid-sixties', 'early seventies', 'weathered sixties']
    };
    const ageSubDetail =
        explicitYears !== null
            ? `${explicitYears} years old`
            : ageDetailPools[ageCategory][(charHash + slotOffset) % ageDetailPools[ageCategory].length];

    const pitchPools: Record<'male' | 'female' | 'neutral', Record<AgeCategory, string[]>> = {
        male: {
            child: ['high pitch', 'bright high pitch'],
            teenager: ['medium-high pitch', 'light tenor pitch', 'medium pitch with youthful resonance'],
            'young adult': [
                'medium pitch',
                'warm baritone pitch',
                'resonant tenor pitch',
                'low-medium pitch',
                'deep baritone'
            ],
            'middle-aged': [
                'deep baritone',
                'low pitch with chest resonance',
                'resonant low-medium pitch',
                'grounded baritone pitch'
            ],
            elderly: [
                'low gravelly baritone',
                'deep low pitch',
                'weathered low-medium pitch',
                'resonant bass-baritone'
            ]
        },
        female: {
            child: ['high pitch', 'bright high-pitched register'],
            teenager: ['high-pitched with bright resonance', 'light soprano pitch', 'clear medium-high pitch'],
            'young adult': [
                'medium pitch',
                'high-pitched with resonance',
                'warm mezzo-soprano pitch',
                'low contralto pitch',
                'clear medium-high pitch'
            ],
            'middle-aged': [
                'rich contralto pitch',
                'medium-low pitch with resonance',
                'grounded medium pitch',
                'warm alto register'
            ],
            elderly: ['low contralto pitch', 'weathered medium-low pitch', 'soft medium pitch with resonance']
        },
        neutral: {
            child: ['high pitch', 'clear medium-high pitch'],
            teenager: ['medium-high pitch', 'medium pitch with light resonance'],
            'young adult': ['medium pitch', 'low-medium pitch with resonance', 'high-pitched with resonance'],
            'middle-aged': ['medium-low pitch', 'low resonant pitch', 'balanced medium pitch'],
            elderly: ['low pitch with dry resonance', 'measured medium-low pitch']
        }
    };

    let pitchDesc: string;
    if (/\b(deep\s+baritone|baritone|bass)\b/i.test(combinedContext)) {
        pitchDesc = 'deep baritone';
    } else if (/\b(contralto|low-pitched|husky\s+low|deep\s+voice)\b/i.test(combinedContext)) {
        pitchDesc = gender === 'female' ? 'low contralto pitch' : 'deep low pitch';
    } else if (/\b(high-pitched\s+with\s+resonance|soprano|bright\s+high)\b/i.test(combinedContext)) {
        pitchDesc = 'high-pitched with resonance';
    } else if (/\b(high-pitched|shrill|piercing|high\s+voice)\b/i.test(combinedContext)) {
        pitchDesc = 'high pitch';
    } else {
        const genderPool = pitchPools[gender] || pitchPools.neutral;
        const agePitchPool = genderPool[ageCategory] || genderPool['young adult'];
        pitchDesc = agePitchPool[(charHash + slotOffset * 2) % agePitchPool.length];
    }

    const isAdjectivalPitch = /^high-pitched\b/i.test(pitchDesc);
    const pitchNounPhrase = isAdjectivalPitch ? 'high pitch with resonance' : pitchDesc;

    const pacePool = [
        'moderate pace',
        'deliberate pace with pauses',
        'fast, nimble pace',
        'slow, unhurried pace',
        'rapid-fire pace',
        'measured, moderate pace',
        'brisk, purposeful pace'
    ];
    let paceDesc: string;
    if (/\b(rapid-fire|fast-talking|chatterbox|hyperactive|frenetic|breathless)\b/i.test(combinedContext)) {
        paceDesc = 'rapid-fire pace';
    } else if (
        /\b(fast|brisk|quick|impulsive|rebel|scout|challenger|sharpshooter|rogue|witty)\b/i.test(
            combinedContext
        ) ||
        cornerRole === 'THE_CHALLENGER'
    ) {
        paceDesc = charHash % 2 === 0 ? 'fast, energetic pace' : 'brisk, rapid-fire pace';
    } else if (/\b(deliberate|pauses|careful|hesitant|cautious|guarded|calculating|strategist)\b/i.test(combinedContext)) {
        paceDesc = 'deliberate pace with pauses';
    } else if (
        /\b(slow|unhurried|languid|drawl|weathered|patient|healer|blacksmith|elder)\b/i.test(
            combinedContext
        ) ||
        cornerRole === 'THE_WARNING'
    ) {
        paceDesc = charHash % 2 === 0 ? 'slow, unhurried pace' : 'deliberate pace with pauses';
    } else {
        paceDesc = pacePool[(charHash + slotOffset * 3) % pacePool.length];
    }

    const emotionPool = [
        'calm and reassuring',
        'serious and focused',
        'gentle and empathetic',
        'lively and expressive',
        'soothing and steady',
        'intense and commanding',
        'cheerful and spirited'
    ];
    let emotionDesc: string;
    if (/\b(intense|fierce|obsessive|relentless|vengeful|grim|defiant|warning)\b/i.test(combinedContext) || cornerRole === 'THE_WARNING') {
        emotionDesc = charHash % 2 === 0 ? 'intense and serious' : 'serious and unyielding';
    } else if (
        /\b(lively|rebel|challenger|bold|daring|audacious|playful|fiery|spirited|sarcastic)\b/i.test(
            combinedContext
        ) ||
        cornerRole === 'THE_CHALLENGER'
    ) {
        emotionDesc = charHash % 2 === 0 ? 'lively and spirited' : 'cheerful and audacious';
    } else if (
        /\b(soothing|healer|comforter|sanctuary|nurturing|peaceful)\b/i.test(combinedContext) ||
        cornerRole === 'THE_COMFORTER'
    ) {
        emotionDesc = charHash % 2 === 0 ? 'gentle and soothing' : 'calm and reassuring';
    } else if (/\b(cheerful|optimistic|sunny|bubbly|upbeat|joyful)\b/i.test(combinedContext)) {
        emotionDesc = 'cheerful and warm';
    } else if (/\b(serious|stoic|stern|grave|severe|disciplined)\b/i.test(combinedContext)) {
        emotionDesc = 'serious and composed';
    } else if (/\b(nervous|anxious|timid|skittish|guarded|apprentice)\b/i.test(combinedContext)) {
        const guardedEmotions = [
            'serious and watchful',
            'calm yet guarded',
            'gentle and earnest',
            'intense and focused'
        ];
        emotionDesc = guardedEmotions[(charHash + slotOffset) % guardedEmotions.length];
    } else {
        emotionDesc = emotionPool[(charHash + slotOffset * 5) % emotionPool.length];
    }

    const characteristicPairs = [
        'warm and smooth with a slight breathiness',
        'crisp and articulate with a magnetic edge',
        'rich and velvety with mellow undertones',
        'raspy and weathered with gravelly resonance',
        'sweet and clear with a gentle airy texture',
        'hoarse and smoky with intense presence',
        'mellow and grounded with crisp diction',
        'magnetic and resonant with a dark, rich timbre',
        'breathy and intimate with a soft, sweet warmth',
        'gravelly and rugged with a commanding, rich weight'
    ];
    let characteristicsDesc: string;
    if (/\b(gravelly|raspy|hoarse|rough|scarred|veteran|blacksmith|brawler|mercenary)\b/i.test(combinedContext)) {
        characteristicsDesc =
            charHash % 2 === 0
                ? 'gravelly and weathered with a hoarse, rich undertone'
                : 'raspy and rugged with a deep, magnetic presence';
    } else if (/\b(crisp|sharp|precise|scholar|mage|detective|commander|aristocrat|scout)\b/i.test(combinedContext)) {
        const crispOptions = [
            'crisp and incisive with a magnetic clarity',
            'crisp and articulate with a slight breathiness',
            'magnetic and sharp with a rich, focused timbre'
        ];
        characteristicsDesc = crispOptions[(charHash + slotOffset * 2) % crispOptions.length];
    } else if (/\b(sweet|healer|innocent|comforter|sanctuary)\b/i.test(combinedContext)) {
        const sweetOptions = [
            'mellow and sweet with a soothing, breathy warmth',
            'warm and smooth with a slight breathiness',
            'sweet and clear with a soft, mellow timbre'
        ];
        characteristicsDesc = sweetOptions[(charHash + slotOffset * 2) % sweetOptions.length];
    } else {
        characteristicsDesc = characteristicPairs[(charHash + slotOffset * 7) % characteristicPairs.length];
    }

    const useCasePool = [
        'dramatic audiobook narration or intimate character monologue',
        'immersive audio drama performance or cinematic voice-over',
        'suspenseful thriller narration or investigative news broadcast',
        'guided meditation or audiobook narration',
        'dynamic commercial ad voice-over or spirited audio drama dialogue',
        'authoritative documentary narration or historical audio drama',
        'expressive literary audiobook or character-driven voice-over',
        'late-night radio broadcast or atmospheric audio drama performance'
    ];
    let useCaseDesc: string;
    if (/\b(soothing|gentle|sweet|mellow|healer|comforter)\b/i.test(emotionDesc + ' ' + characteristicsDesc)) {
        useCaseDesc =
            charHash % 2 === 0
                ? 'guided meditation or audiobook narration'
                : 'intimate audiobook narration or soothing voice-over';
    } else if (/\b(lively|cheerful|fast|rapid-fire|brisk)\b/i.test(emotionDesc + ' ' + paceDesc)) {
        useCaseDesc =
            charHash % 2 === 0
                ? 'lively ad voice-over or fast-paced audio drama'
                : 'upbeat news broadcast, commercial voice-over, or dynamic audiobook dialogue';
    } else if (
        /\b(gravelly|raspy|hoarse|deep baritone|intense)\b/i.test(
            characteristicsDesc + ' ' + pitchDesc + ' ' + emotionDesc
        )
    ) {
        useCaseDesc =
            charHash % 2 === 0
                ? 'gritty dramatic monologue, cinematic trailer voice-over, or dark audiobook narration'
                : 'character-driven audio drama performance or documentary narration';
    } else if (/\b(crisp|serious|deliberate)\b/i.test(characteristicsDesc + ' ' + emotionDesc + ' ' + paceDesc)) {
        useCaseDesc =
            charHash % 2 === 0
                ? 'news broadcast, investigative documentary, or dramatic audiobook narration'
                : 'precision voice-over, literary audiobook narration, or tense audio drama';
    } else {
        useCaseDesc = useCasePool[(charHash + slotOffset * 11) % useCasePool.length];
    }

    const leadArticle = /^[aeiou]/i.test(ageCategory) ? 'An' : 'A';
    const emotionArticle = /^[aeiou]/i.test(emotionDesc) ? 'an' : 'a';
    const templateVariant = (charHash + slotOffset) % 4;

    if (templateVariant === 0) {
        return `${leadArticle} ${ageCategory} ${gender} voice, ${ageSubDetail}, ${pitchDesc} and ${characteristicsDesc}. ${paceDesc.charAt(0).toUpperCase() + paceDesc.slice(1)}, ${emotionDesc} delivery. Suitable for ${useCaseDesc}.`;
    } else if (templateVariant === 1) {
        return `${leadArticle} ${ageCategory} ${gender} voice, ${ageSubDetail}, ${characteristicsDesc} in a ${pitchNounPhrase}. ${paceDesc.charAt(0).toUpperCase() + paceDesc.slice(1)}, ${emotionDesc} delivery. Suitable for ${useCaseDesc}.`;
    } else if (templateVariant === 2) {
        return `${leadArticle} ${ageCategory} ${gender} voice (${ageSubDetail}) with a ${pitchNounPhrase}, ${characteristicsDesc}. ${emotionDesc.charAt(0).toUpperCase() + emotionDesc.slice(1)} delivery at a ${paceDesc}. Suitable for ${useCaseDesc}.`;
    }
    return `${leadArticle} ${ageCategory} ${gender} voice, ${ageSubDetail}, featuring a ${pitchNounPhrase} that is ${characteristicsDesc}. ${paceDesc.charAt(0).toUpperCase() + paceDesc.slice(1)} with ${emotionArticle} ${emotionDesc} delivery, suitable for ${useCaseDesc}.`;
}

export const synthesizeQwenVoiceDesignProfile = synthesizeVoiceDesignProfile;

/** Validates whether a candidate filesystem path is an absolute local/Unix reference WAV path. */
export function isValidVoiceRefPath(p: unknown): p is string {
    return (
        typeof p === 'string' &&
        p.length > 3 &&
        !p.startsWith('./') &&
        !p.startsWith('../') &&
        !p.startsWith('data:') &&
        (/^[a-zA-Z]:[\\/]/ .test(p) || p.startsWith('/'))
    );
}

/**
 * Cleans candidate TTS voice reference text by removing XML/interview wrappers,
 * quotation marks, Audio.cpp control tokens, and markdown formatting while preserving
 * internal apostrophes in contractions and possessives.
 */
export function sanitizeVoiceReferenceText(rawText: unknown): string {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

    const trimmedRaw = text.trim();
    if (
        /^\{[\s\S]*\}$/.test(trimmedRaw) &&
        /"(?:name|id|vocal_cadence|first_person_interview)"\s*:/.test(trimmedRaw)
    ) {
        return '';
    }
    if (/<first_person_interview>/i.test(text)) {
        const closedMatch = text.match(/<first_person_interview>([\s\S]*?)<\/first_person_interview>/i);
        if (closedMatch) {
            text = closedMatch[1];
        } else {
            const openMatch = text.match(/<first_person_interview>([\s\S]*)$/i);
            if (openMatch) text = openMatch[1];
        }
    } else if (/<(?:response|character_registry)\b/i.test(text)) {
        return '';
    }

    text = text
        .replace(/<\|(?:im_start|im_end|voice|text|interleave|speaker:\d+|semantic:[^|>]*)\|>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/^#+\s+/gm, '')
        .replace(/^\s*[-*•]\s+/gm, '')
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/_([^_\n]+)_/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1');

    text = text.replace(/["\u201c\u201d\u00ab\u00bb\u201e]/g, '');

    for (let pass = 0; pass < 2; pass++) {
        text = text.replace(
            /(^|[\s([—–-])['\u2018]([^'\u2018\u2019\n]{1,180}?)['\u2019](?=$|[\s.,!?;:\])—–-])/g,
            '$1$2'
        );
    }
    text = text
        .replace(/(^|[\s([—–-])['\u2018\u2019]+(?=\S)/g, '$1')
        .replace(/([^sS\w]|[^sS])['\u2018\u2019]+(?=$|[\s.,!?;:\])—–-])/g, '$1')
        .replace(/(^|\s)['\u2018\u2019]+(?=\s|$)/g, '$1');

    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Estimates spoken duration (in seconds) of a reference transcript at normal
 * Breeze 2 calibration cadence (~2.7 words/sec plus punctuation pauses).
 */
export function estimateReferenceTextSeconds(text: unknown): number {
    const clean = sanitizeVoiceReferenceText(text);
    if (!clean) return 0;
    const words = (clean.match(/\b[\w'’]+\b/g) || []).length;
    if (words === 0) return 0;
    const internalPauses = (clean.match(/[,;:\u2014\u2013]/g) || []).length;
    const sentencePauses = (clean.match(/[.!?\u2026]+/g) || []).length;
    return +(words / 2.7 + internalPauses * 0.1 + sentencePauses * 0.22).toFixed(2);
}

/**
 * Splits cleaned prose into full sentences without breaking on common abbreviations,
 * initials, or decimal numbers.
 */
export function splitReferenceTextIntoSentences(cleanedText: unknown): string[] {
    const clean = sanitizeVoiceReferenceText(cleanedText);
    if (!clean) return [];

    const DOT_TOKEN = '__REF_DOT__';
    const shielded = clean
        .replace(/(\d)\.(\d)/g, `$1${DOT_TOKEN}$2`)
        .replace(
            /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Capt|Lt|Sgt|Col|Gen|Rev|Hon|Pres|Gov|Sen|Rep|vs|etc|approx|est)\./gi,
            `$1${DOT_TOKEN}`
        )
        .replace(/\b(e\.g|i\.e|U\.S|U\.K|a\.m|p\.m)\./gi, (m) => m.replace(/\./g, DOT_TOKEN))
        .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, `$1${DOT_TOKEN}`);

    const parts = shielded
        .split(/(?<=[.!?\u2026])\s+/)
        .map((s) => s.replace(new RegExp(DOT_TOKEN, 'g'), '.').trim())
        .filter(Boolean);

    return parts.length > 0 ? parts : [clean];
}

/**
 * Extracts enough full sentences from the beginning of a character's interview
 * to reach at least ~15 seconds of speech without cutting mid-sentence.
 */
export function extractPersonalizedReferenceTextFromInterview(
    interviewText: unknown,
    options: { minSeconds?: number } = {}
): string {
    const minSeconds =
        typeof options?.minSeconds === 'number' && options.minSeconds > 0
            ? options.minSeconds
            : VOICE_REFERENCE_MIN_SECONDS;

    const sentences = splitReferenceTextIntoSentences(interviewText);
    if (sentences.length === 0) return '';

    let reachedMin = false;
    const selected: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
        selected.push(sentences[i]);
        const estSec = estimateReferenceTextSeconds(selected.join(' '));
        if (estSec >= minSeconds) {
            reachedMin = true;
            break;
        }
    }
    if (!reachedMin) return '';
    return selected.join(' ').trim();
}

/**
 * Resolves the freshest cast member record from `story.cast` (or `story.characters`)
 * before falling back to any passed object.
 */
export function resolveCastMemberForSpeaker(
    speakerName: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined
): ResolvedCastMemberResult {
    const passedObj =
        typeof speakerName === 'object' && speakerName !== null
            ? (speakerName as VoiceCastMember)
            : null;
    const cleanName = String(passedObj ? passedObj.name || '' : speakerName || '').trim();
    const castList: VoiceCastMember[] =
        Array.isArray(story?.cast) && story.cast.length > 0
            ? story.cast
            : Array.isArray(story?.characters) && story.characters.length > 0
              ? story.characters
              : [];

    let found: VoiceCastMember | null = null;
    if (passedObj?.id) {
        found = castList.find((c) => c && c.id === passedObj.id) || null;
    }
    if (!found && cleanName) {
        found = resolveCharacter(cleanName, castList as CastMember[]) as VoiceCastMember | null;
    }
    if (!found && cleanName) {
        const lowerClean = cleanName.toLowerCase();
        found =
            castList.find((c) => c && c.name && c.name.toLowerCase() === lowerClean) ||
            castList.find((c) => {
                if (!c || !c.name) return false;
                const cLower = c.name.toLowerCase();
                return (
                    cLower.startsWith(lowerClean + ' ') ||
                    lowerClean.startsWith(cLower + ' ') ||
                    cLower.includes(lowerClean)
                );
            }) ||
            null;
    }
    const fromCastList = Boolean(found);
    if (
        !found &&
        passedObj &&
        (passedObj.name ||
            passedObj.vocal_cadence ||
            passedObj.voice_seed !== undefined ||
            passedObj.reference_text ||
            passedObj.details)
    ) {
        found = passedObj;
    }
    return { found, fromCastList, castList, cleanName, passedObj };
}

/**
 * Resolves the TTS Master Voice referenceText for a speaker ("Narrator" or cast member).
 */
export function getVoiceReferenceTextForCharacter(
    speakerName: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined
): string {
    const cleanName =
        typeof speakerName === 'object' && speakerName !== null
            ? String(speakerName.name || '').trim()
            : String(speakerName || '').trim();

    if (!cleanName || cleanName.toLowerCase() === 'narrator') {
        const customNarratorRef = sanitizeVoiceReferenceText(story?.narrator_reference_text || '');
        return customNarratorRef || RAIN_SENTENCE;
    }

    const { found } = resolveCastMemberForSpeaker(speakerName, story);

    if (found) {
        const isCustom = Boolean(
            found.user_edited_reference_text ||
                story?.user_edited?.[`cast.${found.name}.reference_text`]
        );
        const storedRef = sanitizeVoiceReferenceText(found.reference_text || '');
        if (
            storedRef &&
            (isCustom || estimateReferenceTextSeconds(storedRef) >= VOICE_REFERENCE_MIN_SECONDS)
        ) {
            return storedRef;
        }

        const interviewSource =
            found.details?.deep_profile ||
            found.interview_psychology ||
            found.deep_profile ||
            found.canonical_interview_voice ||
            '';
        const extracted = extractPersonalizedReferenceTextFromInterview(interviewSource);
        if (extracted) return extracted;
    }

    return RAIN_SENTENCE;
}

let liveStoryProvider: (() => AudioStoryLike | null | undefined) | null = null;

/**
 * Registers the source of the live (in-editor) story. The app shell calls this once with a getter
 * for its current story so long-running audio jobs can pick up edits made while they run.
 * Pass `null` to unregister (tests).
 */
export function setLiveStoryProviderForAudio(
    provider: (() => AudioStoryLike | null | undefined) | null
): void {
    liveStoryProvider = provider;
}

/**
 * Always resolves the freshest active story state if the job's story ID matches the live story
 * (see `setLiveStoryProviderForAudio`); otherwise returns the story it was given.
 */
export function getLiveStoryForAudio<T extends AudioStoryLike | null | undefined>(storyObj: T): T {
    const live = liveStoryProvider ? liveStoryProvider() : null;
    if (live && storyObj?.id && live.id === storyObj.id) {
        return live as T;
    }
    return storyObj;
}

/** Resolves a speaker's canonical natural-language Studio Voice Design prompt. */
export function getVoiceDescriptionForCharacter(
    speakerName: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined
): string {
    const passedObj =
        typeof speakerName === 'object' && speakerName !== null
            ? (speakerName as VoiceCastMember)
            : null;
    const cleanName = passedObj ? String(passedObj.name || '').trim() : String(speakerName || '').trim();

    if (!cleanName || cleanName.toLowerCase() === 'narrator') {
        const customNarrator = story?.narrator_vocal_cadence || story?.narrator_voice_profile || '';
        const defaultGenericNarrator =
            'A calm, middle-aged male voice, with a measured pace, low pitch, and a deep, magnetic tone, suitable for audiobook and audio drama narration.';
        const isUserEditedNarrator = Boolean(story?.user_edited?.narrator_vocal_cadence);
        if (isUserEditedNarrator && customNarrator && String(customNarrator).trim().length > 0) {
            return cleanCharacterNameFromVoiceProfile(customNarrator, ['Narrator']);
        }
        const isUneditedDefault =
            (customNarrator === defaultGenericNarrator ||
                isLegacyBoilerplateVoiceProfile(customNarrator)) &&
            !isUserEditedNarrator;
        if (customNarrator && isUsableVocalDescription(customNarrator) && !isUneditedDefault) {
            return cleanCharacterNameFromVoiceProfile(customNarrator, ['Narrator']);
        }
        return synthesizeVoiceDesignProfile({ name: 'Narrator' }, 'Narrator', story);
    }

    const { found, castList } = resolveCastMemberForSpeaker(speakerName, story);

    let desc: string;
    if (found) {
        const foundIdx = castList.indexOf(found);
        const isUserEditedCadence = Boolean(
            found.user_edited_cadence ||
                story?.user_edited?.[`cast.${found.name}.vocal_cadence`] ||
                (foundIdx >= 0 && story?.user_edited?.[`cast.${foundIdx}.vocal_cadence`])
        );
        const directUserCadence = cleanCharacterNameFromVoiceProfile(found.vocal_cadence || '', [
            cleanName,
            found.name
        ]);
        if (isUserEditedCadence && directUserCadence.length > 0) {
            desc = directUserCadence;
        } else {
            const cadenceCandidates = [
                found.vocal_cadence,
                found.vocal_profile,
                found.voice_profile,
                found.voice_description,
                found.details?.vocal_profile,
                typeof found.voice === 'string' ? found.voice : ''
            ].map((c) => cleanCharacterNameFromVoiceProfile(c || '', [cleanName, found.name]));
            const primaryUsable =
                isUsableVocalDescription(directUserCadence) &&
                !isLegacyBoilerplateVoiceProfile(directUserCadence)
                    ? directUserCadence
                    : '';
            const strippedCadence =
                primaryUsable ||
                cadenceCandidates.find((c) => isValidVoiceDesignProfile(c)) ||
                cadenceCandidates.find(
                    (c) => isUsableVocalDescription(c) && !isLegacyBoilerplateVoiceProfile(c)
                ) ||
                '';
            if (isUsableVocalDescription(strippedCadence)) {
                const cleanCadence = strippedCadence
                    .replace(
                        /^An?\s+(?:middle-aged|elderly|young adult|teenager|child(?:\s+around\s+\d+\s+years\s+old)?)\s+(?:male|female|neutral)\s+voice\.\s*/i,
                        ''
                    )
                    .trim();
                const hasExplicitGender =
                    /\b(male|female|neutral|man|woman|boy|girl|androgynous|contralto|soprano|alto|mezzo|tenor|baritone|bass)\b/i.test(
                        cleanCadence
                    );
                const hasExplicitAge =
                    /\b(child|kid|teen|teenage|teenager|young|youthful|adult|middle-aged|elderly|old|aged|\d{1,2}s|\d{1,2}\s*years?\s+old|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties|late\s+twenties|early\s+twenties|mid-30s|mid-40s|mid-50s|mid-20s|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-[a-z]+|thirty|thirty-[a-z]+|forty|forty-[a-z]+|fifty|fifty-[a-z]+|sixty|sixty-[a-z]+|seventy|seventy-[a-z]+|eighty|eighty-[a-z]+|ninety|ninety-[a-z]+|age\s*:\s*\d{1,2})\b/i.test(
                        cleanCadence
                    );
                if (hasExplicitGender && hasExplicitAge) {
                    desc = cleanCadence;
                } else {
                    const synthesizedBase = synthesizeVoiceDesignProfile(
                        found,
                        found.name || cleanName,
                        story
                    );
                    const anchorMatch = synthesizedBase.match(
                        /(child|teenager|young adult|middle-aged|elderly)\s+(male|female|neutral)\s+voice/i
                    );
                    const leadArt = anchorMatch && /^[aeiou]/i.test(anchorMatch[1]) ? 'An' : 'A';
                    const genderAgePrefix = anchorMatch
                        ? `${leadArt} ${anchorMatch[1]} ${anchorMatch[2]} voice`
                        : 'A distinct character voice';
                    desc = `${genderAgePrefix}. ${cleanCadence}`;
                }
            } else {
                desc = synthesizeVoiceDesignProfile(found, found.name || cleanName, story);
            }
        }
    } else {
        const speakerObj = passedObj || { name: cleanName };
        desc = synthesizeVoiceDesignProfile(speakerObj, cleanName, story);
    }

    desc = cleanCharacterNameFromVoiceProfile(desc, [cleanName, found?.name]);
    if (desc.length > 2048) {
        desc = desc.substring(0, 2045).trim() + '...';
    }
    return desc.trim();
}

/** Returns a deterministic positive 31-bit voice seed for Narrator or cast member. */
export function getDeterministicVoiceSeed(
    speakerName: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined
): number {
    const passedObj =
        typeof speakerName === 'object' && speakerName !== null
            ? (speakerName as VoiceCastMember)
            : null;
    const cleanName = passedObj ? String(passedObj.name || '').trim() : String(speakerName || '').trim();

    if (!cleanName || cleanName.toLowerCase() === 'narrator') {
        if (story && typeof story.narrator_voice_seed === 'number' && Number.isFinite(story.narrator_voice_seed)) {
            return Math.floor(Math.abs(story.narrator_voice_seed)) % 2147483647 || 424242;
        }
        return 718281;
    }

    const { found } = resolveCastMemberForSpeaker(speakerName, story);

    if (found && typeof found.voice_seed === 'number' && Number.isFinite(found.voice_seed)) {
        return Math.floor(Math.abs(found.voice_seed)) % 2147483647 || 101010;
    }

    if (passedObj && typeof passedObj.voice_seed === 'number' && Number.isFinite(passedObj.voice_seed)) {
        return Math.floor(Math.abs(passedObj.voice_seed)) % 2147483647 || 101010;
    }

    const canonicalName = String(found?.name || cleanName)
        .replace(
            /^(?:Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Capt\.|Captain|Det\.|Detective|Cmdr\.|Commander|Prof\.|Professor|Lord|Lady|Sir|Dame)\s+/i,
            ''
        )
        .trim()
        .toLowerCase();

    let hash = 2166136261;
    for (let i = 0; i < canonicalName.length; i++) {
        hash ^= canonicalName.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const positiveHash = Math.abs(hash >>> 0) % 2147483647;
    return positiveHash === 0 ? 123456 : positiveHash;
}

/** Automatically maps a character's voice description to ElevenLabs standard voice IDs. */
export function mapCharacterToElevenLabsVoice(voiceDesc: string, charName: string): string {
    const text = `${charName || ''} ${voiceDesc || ''}`.toLowerCase();

    if (charName && charName.toLowerCase() === 'narrator') {
        return 'george';
    }

    const isFemale =
        /\b(female|woman|girl|mother|sister|her|she|lady|daughter|queen|matron|actress)\b/i.test(
            text
        );
    const isElder = /\b(old|elder|grandfather|grandmother|aged|weathered|ancient|veteran|retired)\b/i.test(text);
    const isYoung = /\b(young|teen|youth|student|boy|girl|child|kid|adolescent)\b/i.test(text);
    const isDeepCommanding =
        /\b(deep|commanding|raspy|gravelly|authoritative|harsh|intense|growl|baritone|bass)\b/i.test(
            text
        );
    const isBritish = /\b(british|uk|english|london|aristocratic|posh)\b/i.test(text);

    if (isFemale) {
        if (isBritish) return isYoung ? 'alice' : 'lily';
        if (isYoung) return 'bella';
        if (isDeepCommanding) return 'alice';
        if (/\b(playful|witty|quirky)\b/i.test(text)) return 'jessica';
        return 'sarah';
    }
    if (isElder) return isBritish ? 'roger' : 'bill';
    if (isBritish) return isDeepCommanding ? 'daniel' : 'harry';
    if (isDeepCommanding) return 'adam';
    if (isYoung) return 'liam';
    if (/\b(cinematic|trailer|epic)\b/i.test(text)) return 'brian';
    if (/\b(charming|friendly|casual)\b/i.test(text)) return 'chris';
    return 'adam';
}

/** Automatically maps a character's voice description to Gemini 30 prebuilt studio voices. */
export function mapCharacterToGeminiVoice(voiceDesc: string, charName: string): string {
    const text = `${charName || ''} ${voiceDesc || ''}`.toLowerCase();

    if (charName && charName.toLowerCase() === 'narrator') {
        return 'Charon';
    }

    const isFemale = /\b(female|woman|girl|mother|sister|her|she|lady|daughter|queen|matron)\b/i.test(text);
    const isDeepOrFirm = /\b(deep|commanding|firm|authoritative|gravelly|baritone|stern)\b/i.test(text);
    const isUpbeat = /\b(upbeat|cheerful|fast|excitable|young|playful|bright)\b/i.test(text);

    if (isFemale) {
        if (isDeepOrFirm) return 'Kore';
        if (isUpbeat) return 'Zephyr';
        if (/\b(soft|gentle|quiet)\b/i.test(text)) return 'Achernar';
        if (/\b(smooth|warm)\b/i.test(text)) return 'Sulafat';
        return 'Aoede';
    }
    if (isDeepOrFirm) return 'Orus';
    if (/\b(gravelly|rough|harsh)\b/i.test(text)) return 'Algenib';
    if (isUpbeat) return 'Fenrir';
    if (/\b(calm|casual|friendly)\b/i.test(text)) return 'Achird';
    return 'Puck';
}

/** Automatically maps a character's voice description to Kokoro-82M ONNX voices. */
export function mapCharacterToKokoroVoice(voiceDesc: string, charName: string): string {
    const text = `${charName || ''} ${voiceDesc || ''}`.toLowerCase();

    if (charName && charName.toLowerCase() === 'narrator') {
        return 'bm_george';
    }

    const isFemale = /\b(female|woman|girl|mother|sister|her|she|lady|daughter)\b/i.test(text);
    const isBritish = /\b(british|uk|english|london|posh)\b/i.test(text);

    if (isFemale) {
        if (isBritish) return 'bf_alice';
        if (/\b(whisper|soft|quiet)\b/i.test(text)) return 'af_nicole';
        if (/\b(bright|youthful|energetic)\b/i.test(text)) return 'af_bella';
        return 'af_heart';
    }
    if (isBritish) return 'bm_daniel';
    if (/\b(deep|resonant|commanding)\b/i.test(text)) return 'am_adam';
    if (/\b(warm|friendly|casual)\b/i.test(text)) return 'am_michael';
    return 'am_adam';
}

/** Automatically maps character traits to local Audio.cpp voice presets. */
export function mapCharacterToAudioCppVoice(voiceDesc: string, charName: string): string {
    const text = `${charName || ''} ${voiceDesc || ''}`.toLowerCase();

    if (/^(demo_[12]_man|demo_[34]_woman)$/i.test((voiceDesc || '').trim())) {
        return (voiceDesc || '').trim();
    }

    if (charName && charName.toLowerCase() === 'narrator') {
        return 'demo_1_man';
    }

    const isFemale = /\b(female|woman|girl|mother|sister|her|she|lady|daughter|soprano)\b/i.test(text);

    if (isFemale) {
        if (/\b(bright|youthful|energetic|fast|lively)\b/i.test(text)) return 'demo_4_woman';
        return 'demo_3_woman';
    }
    if (/\b(casual|secondary|young|friendly)\b/i.test(text)) return 'demo_2_man';
    return 'demo_1_man';
}

/**
 * Resolves a speaker's canonical key, voice prompt, deterministic seed, personalized referenceText,
 * and deterministic signature hash from the freshest available story state.
 */
export function resolveSpeakerVoiceIdentity(
    speakerKey: VoiceCastMember | string | null | undefined,
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {}
): SpeakerVoiceIdentity {
    const liveStory = getLiveStoryForAudio(story);
    const passedObj =
        typeof speakerKey === 'object' && speakerKey !== null ? (speakerKey as VoiceCastMember) : null;
    const rawSpk = String(passedObj ? passedObj.name || 'Narrator' : speakerKey || 'Narrator').trim();
    const isNarrator = !rawSpk || rawSpk.toUpperCase() === 'NARRATOR';
    const storyId = String(liveStory?.id || liveStory?.title || 'story').replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
    );

    const effectiveSettings = migrateAudioDramaSettings(settings);

    const matchedChar = isNarrator
        ? null
        : resolveCastMemberForSpeaker(passedObj || rawSpk, liveStory).found;

    const normalizedSpk = isNarrator
        ? 'NARRATOR'
        : String(matchedChar?.name || rawSpk).trim() || rawSpk;
    const masterKey = `${storyId}_${normalizedSpk}_master`;

    const voiceDesc = getVoiceDescriptionForCharacter(matchedChar || normalizedSpk, liveStory);
    const cleanDesc = cleanCharacterNameFromVoiceProfile(voiceDesc, [
        normalizedSpk,
        rawSpk,
        matchedChar?.name
    ]).replace(/\.+$/, '');

    const promptInstruction = isNarrator
        ? cleanDesc
            ? `${cleanDesc}.`
            : 'A calm, clear, evocative adult narrator with warm resonance and steady pacing.'
        : cleanDesc
          ? `${cleanDesc}.`
          : 'A clear, distinctive, natural adult character voice.';

    const baseSeed = getDeterministicVoiceSeed(matchedChar || normalizedSpk, liveStory);
    const guidanceScale = BREEZE_MASTER_GUIDANCE_SCALE;
    const expectedReferenceText =
        getVoiceReferenceTextForCharacter(matchedChar || normalizedSpk, liveStory) || RAIN_SENTENCE;
    const sigHash = computeVoiceVarietyHash(
        `${promptInstruction}|${baseSeed}|${expectedReferenceText}|cfg=${guidanceScale}`
    ).toString(36);
    const uploadKey = `${masterKey}_${sigHash}`;

    return {
        liveStory,
        storyId,
        rawSpk,
        normalizedSpk,
        isNarrator,
        matchedChar,
        masterKey,
        promptInstruction,
        baseSeed,
        guidanceScale,
        expectedReferenceText,
        sigHash,
        uploadKey,
        effectiveSettings
    };
}

/** Verifies whether a cached Master Voice WAV record still matches the resolved speaker identity. */
export function isMasterVoiceRecordMatching(
    cachedRecord: MasterVoiceRecordLike | null | undefined,
    identity: SpeakerVoiceIdentity,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {}
): boolean {
    if (!cachedRecord || !cachedRecord.refPath || !isValidVoiceRefPath(cachedRecord.refPath)) {
        return false;
    }
    if (
        (settings as Record<string, unknown>)?.forceRecalibrate ||
        (identity?.effectiveSettings as Record<string, unknown>)?.forceRecalibrate
    ) {
        return false;
    }
    return (
        cachedRecord.promptInstruction === identity.promptInstruction &&
        cachedRecord.seed === identity.baseSeed &&
        (cachedRecord.referenceText || RAIN_SENTENCE) === identity.expectedReferenceText &&
        cachedRecord.signatureHash === identity.sigHash
    );
}

/** Computes a combined signature hash across a list of speakers for audio cache invalidation. */
export function computeSpeakersVoiceSignatureHash(
    speakersList: Array<VoiceCastMember | string> | null | undefined,
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {}
): string {
    const liveStory = getLiveStoryForAudio(story);
    const list =
        Array.isArray(speakersList) && speakersList.length > 0 ? speakersList : ['NARRATOR'];
    const bySpeaker = new Map<string, string>();
    for (const spk of list) {
        if (!spk) continue;
        const id = resolveSpeakerVoiceIdentity(spk, liveStory, settings);
        if (!bySpeaker.has(id.normalizedSpk)) {
            bySpeaker.set(id.normalizedSpk, id.sigHash);
        }
    }
    if (bySpeaker.size === 0) {
        const nar = resolveSpeakerVoiceIdentity('NARRATOR', liveStory, settings);
        bySpeaker.set(nar.normalizedSpk, nar.sigHash);
    }
    const canonical = Array.from(bySpeaker.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([spk, hash]) => `${spk}:${hash}`)
        .join('|');
    return computeVoiceVarietyHash(canonical).toString(36);
}

/** Computes a scene-level cast voice signature hash covering Narrator and every speaker in the scene. */
export function computeSceneVoiceSignatureHash(
    proseText: unknown,
    story: AudioStoryLike | null | undefined,
    settings: Partial<AudioDramaSettings> | Record<string, unknown> = {}
): string {
    const speakers: string[] = ['NARRATOR'];
    const text = String(proseText || '').trim();
    if (text) {
        try {
            const parsed = parseAudioDramaScript(text, { raw: true, collapseNarrator: false });
            if (Array.isArray(parsed)) {
                for (const ch of parsed) {
                    const rec = ch as Record<string, unknown>;
                    const spk = String(rec?.speakerKey || ch?.speaker || '').trim();
                    if (spk) speakers.push(spk);
                }
            }
        } catch {
            // Fall back to NARRATOR signature on malformed scene input
        }
    }
    return computeSpeakersVoiceSignatureHash(speakers, story, settings);
}

/** Translates raw TTS network, API key, quota, or memory failures into user-facing remediation prompts. */
export function getHumanReadableTtsError(
    err: unknown,
    backend = 'audiocpp',
    chunk: unknown = null
): HumanReadableTtsError {
    void chunk;
    const raw =
        err && typeof err === 'object'
            ? String((err as { message?: unknown }).message || String(err))
            : String(err || '');
    const lower = raw.toLowerCase();

    if (
        (backend === 'hybrid' || backend === 'audiocpp' || backend === 'breeze') &&
        (lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('could not reach audio') ||
            lower.includes('connection refused') ||
            lower.includes('err_connection_refused'))
    ) {
        return {
            type: 'LOCAL_SERVER_OFFLINE',
            title: 'Speech server is unreachable',
            message:
                "We couldn't connect to your local Audio.cpp server. You can listen right now using our free built-in voice, or check if Audio.cpp is running.",
            suggestedAction: 'switch_to_browser',
            actionLabel: 'Use Built-in Voice',
            secondaryAction: 'skip_line',
            secondaryLabel: 'Skip Line',
            allowSettings: true
        };
    }

    if (lower.includes('mixed content') || (lower.includes('https') && lower.includes('http') && lower.includes('blocked'))) {
        return {
            type: 'MIXED_CONTENT_BLOCKED',
            title: 'Local server blocked by browser security',
            message:
                'Your browser prevents connecting to local HTTP servers while on a secure page. You can switch to our free built-in voice, or open EllipsisProse locally.',
            suggestedAction: 'switch_to_browser',
            actionLabel: 'Use Built-in Voice',
            secondaryAction: 'skip_line',
            secondaryLabel: 'Skip Line',
            allowSettings: true
        };
    }

    if (
        lower.includes('key is missing') ||
        (lower.includes('api key') && (lower.includes('missing') || lower.includes('not configured')))
    ) {
        const provider = backend === 'gemini' ? 'Gemini' : 'OpenRouter';
        return {
            type: 'API_KEY_MISSING',
            title: `${provider} API key needed`,
            message: `A ${provider} key is needed for this speech voice. You can add your key in Settings, or keep listening with our free built-in voice.`,
            suggestedAction: 'switch_to_browser',
            actionLabel: 'Use Free Built-in Voice',
            secondaryAction: 'open_settings',
            secondaryLabel: 'Open Settings',
            allowSettings: true
        };
    }

    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
        const provider = backend === 'gemini' ? 'Gemini' : 'OpenRouter';
        return {
            type: 'API_KEY_INVALID',
            title: `${provider} key wasn't accepted`,
            message: `Please check your ${provider} API key in Settings, or continue with our free built-in voice.`,
            suggestedAction: 'switch_to_browser',
            actionLabel: 'Use Free Built-in Voice',
            secondaryAction: 'open_settings',
            secondaryLabel: 'Check Key',
            allowSettings: true
        };
    }

    if (
        lower.includes('quota') ||
        lower.includes('resource_exhausted') ||
        lower.includes('429') ||
        lower.includes('payment required') ||
        lower.includes('402') ||
        lower.includes('credits')
    ) {
        const provider =
            backend === 'gemini' ? 'Google' : backend === 'openrouter' ? 'OpenRouter' : 'Voice service';
        return {
            type: 'QUOTA_EXHAUSTED',
            title: `${provider} is temporarily busy`,
            message:
                'The voice service is momentarily busy or out of credits. Switch to our free built-in voice to keep listening without interruption.',
            suggestedAction: 'switch_to_browser',
            actionLabel: 'Use Free Built-in Voice',
            secondaryAction: 'retry',
            secondaryLabel: 'Try Again',
            allowSettings: true
        };
    }

    if (
        lower.includes('worker') ||
        lower.includes('memory') ||
        lower.includes('allocation') ||
        lower.includes('oom') ||
        lower.includes('wasm')
    ) {
        return {
            type: 'DEVICE_MEMORY_LIMIT',
            title: 'Device is low on memory for AI voices',
            message:
                "Your device is running low on memory. Switch to your device's native voice for instant, reliable speech.",
            suggestedAction: 'switch_to_system',
            actionLabel: 'Use Device Voice',
            secondaryAction: 'skip_line',
            secondaryLabel: 'Skip Line',
            allowSettings: false
        };
    }

    if (lower.includes('timed out') || lower.includes('timeout')) {
        return {
            type: 'SYNTHESIS_TIMEOUT',
            title: 'This line took too long to speak',
            message:
                'Generating this line took longer than expected. You can skip to the next line or try again.',
            suggestedAction: 'skip_line',
            actionLabel: 'Skip Line',
            secondaryAction: 'retry',
            secondaryLabel: 'Try Again',
            allowSettings: false
        };
    }

    if (lower.includes('playback stream error') || lower.includes('decode') || lower.includes('format')) {
        return {
            type: 'PLAYBACK_DECODE_ERROR',
            title: 'Trouble playing this audio line',
            message:
                'There was a playback issue with this line. You can skip ahead to keep listening.',
            suggestedAction: 'skip_line',
            actionLabel: 'Skip Ahead',
            secondaryAction: 'retry',
            secondaryLabel: 'Try Again',
            allowSettings: false
        };
    }

    return {
        type: 'GENERAL_ERROR',
        title: 'Voice playback paused',
        message:
            'We encountered an issue creating this voice line. You can switch to our free built-in voice or skip to the next line.',
        suggestedAction: backend !== 'browser' ? 'switch_to_browser' : 'switch_to_system',
        actionLabel: backend !== 'browser' ? 'Use Built-in Voice' : 'Use Device Voice',
        secondaryAction: 'skip_line',
        secondaryLabel: 'Skip Line',
        allowSettings: true
    };
}

/** Computes a deterministic hex FNV-1a digest of scene prose for audio cache invalidation. */
export function computeSceneProseHash(text: unknown): string {
    const str = String(text || '').trim();
    if (!str) return 'empty';
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/** Builds a deduplicated audio stitching plan for one sequence from scene and sequence recordings. */
export function resolveSequenceAudioPlan(
    story: AudioStoryLike | null | undefined,
    seqIdx: number,
    sceneRecords: AudioStorageRecordLike[] = [],
    seqRecord: AudioStorageRecordLike | null = null
): SequenceAudioPlanResult {
    const safeSeq = Number(seqIdx);
    const seq = (story?.sequences || [])[safeSeq] || { number: safeSeq + 1, title: '' };
    const seqNum = Number(seq.number) || safeSeq + 1;
    const rawTitle = String(seq.title || `Sequence ${seqNum}`).trim();
    const seqTitle = rawTitle.replace(/^Sequence\s+\d+[:\s-]*/i, '').trim() || rawTitle;

    const rawScenes =
        (story?.scenes && (story.scenes[safeSeq] || story.scenes[String(safeSeq)])) || [];
    const sceneList = Array.isArray(rawScenes) ? rawScenes : [];
    const totalScenes = sceneList.length;

    const sceneMap = new Map<number, AudioStorageRecordLike>();
    (sceneRecords || []).forEach((rec) => {
        if (!rec || !rec.blob || Number(rec.seqIdx) !== safeSeq) return;
        const scIdx = Number(rec.sceneIdx);
        if (isNaN(scIdx) || scIdx < 0) return;
        if (totalScenes > 0 && scIdx >= totalScenes) return;
        sceneMap.set(scIdx, rec);
    });
    const validSceneIndices = Array.from(sceneMap.keys()).sort((a, b) => a - b);
    const sceneSet = new Set(validSceneIndices);

    const hasSeqBlob = Boolean(seqRecord && seqRecord.blob && Number(seqRecord.seqIdx ?? safeSeq) === safeSeq);
    const rawSeqIncluded =
        hasSeqBlob && Array.isArray(seqRecord?.includedSceneIndices) && seqRecord.includedSceneIndices.length > 0
            ? seqRecord.includedSceneIndices
            : hasSeqBlob && totalScenes > 0
              ? Array.from({ length: totalScenes }, (_, i) => i)
              : [];
    const seqCoveredIndices = Array.from(
        new Set(
            rawSeqIncluded
                .map(Number)
                .filter((i) => !isNaN(i) && i >= 0 && (totalScenes === 0 || i < totalScenes))
        )
    ).sort((a, b) => a - b);
    const seqSet = new Set(seqCoveredIndices);

    const everySeqSceneHasIndividual =
        seqCoveredIndices.length > 0 && seqCoveredIndices.every((i) => sceneSet.has(i));

    let items: SequenceAudioPlanItem[];
    let coveredSceneIndices: number[];
    let usedSequenceRecord: boolean;

    if (!hasSeqBlob || seqCoveredIndices.length === 0 || everySeqSceneHasIndividual) {
        items = validSceneIndices.map((scIdx, idx) => ({
            blob: sceneMap.get(scIdx)!.blob!,
            seqIdx: safeSeq,
            sceneIdx: scIdx,
            label: `Scene ${seqNum}.${scIdx + 1}`,
            pauseAfterMs: idx < validSceneIndices.length - 1 ? 2000 : null
        }));
        coveredSceneIndices = validSceneIndices;
        usedSequenceRecord = false;
    } else {
        const minSeqCovered = seqCoveredIndices[0];
        const nonOverlapping = validSceneIndices.filter((scIdx) => !seqSet.has(scIdx));
        const beforeSeq = nonOverlapping.filter((scIdx) => scIdx < minSeqCovered);
        const afterSeq = nonOverlapping.filter((scIdx) => scIdx >= minSeqCovered);

        const rawItems: Array<Omit<SequenceAudioPlanItem, 'pauseAfterMs'>> = [
            ...beforeSeq.map((scIdx) => ({
                blob: sceneMap.get(scIdx)!.blob!,
                seqIdx: safeSeq,
                sceneIdx: scIdx,
                label: `Scene ${seqNum}.${scIdx + 1}`
            })),
            {
                blob: seqRecord!.blob!,
                seqIdx: safeSeq,
                isSequenceBlob: true,
                coveredIndices: seqCoveredIndices,
                label: `Sequence ${seqNum}`
            },
            ...afterSeq.map((scIdx) => ({
                blob: sceneMap.get(scIdx)!.blob!,
                seqIdx: safeSeq,
                sceneIdx: scIdx,
                label: `Scene ${seqNum}.${scIdx + 1}`
            }))
        ];
        items = rawItems.map((it, idx) => ({
            ...it,
            pauseAfterMs: idx < rawItems.length - 1 ? 2000 : null
        }));
        coveredSceneIndices = Array.from(new Set([...seqCoveredIndices, ...validSceneIndices])).sort(
            (a, b) => a - b
        );
        usedSequenceRecord = true;
    }

    const coveredSet = new Set(coveredSceneIndices);
    let status: SequenceAudioPlanResult['status'];
    let missingIndices: number[] = [];
    let internalMissingIndices: number[] = [];
    let trailingMissingIndices: number[] = [];

    if (totalScenes === 0) {
        status = items.length > 0 ? 'complete' : 'none';
    } else if (coveredSceneIndices.length === 0) {
        status = 'none';
        missingIndices = Array.from({ length: totalScenes }, (_, i) => i);
        trailingMissingIndices = missingIndices;
    } else {
        missingIndices = Array.from({ length: totalScenes }, (_, i) => i).filter(
            (i) => !coveredSet.has(i)
        );
        const maxCovered = coveredSceneIndices[coveredSceneIndices.length - 1];
        internalMissingIndices = missingIndices.filter((i) => i < maxCovered);
        trailingMissingIndices = missingIndices.filter((i) => i >= maxCovered);
        if (missingIndices.length === 0) {
            status = 'complete';
        } else if (internalMissingIndices.length > 0) {
            status = 'missing_in_structure';
        } else {
            status = 'incomplete';
        }
    }

    return {
        seqIdx: safeSeq,
        seqNum,
        seqTitle,
        totalScenes,
        items,
        coveredSceneIndices,
        coveredSet,
        missingIndices,
        internalMissingIndices,
        trailingMissingIndices,
        status,
        usedSequenceRecord
    };
}

/** Formats missing audio slots across sequences into a concise summary string. */
export function formatMissingAudioSlotsSummary(
    missingSlots: AudioExportSlot[] | null | undefined,
    seqPlans: SequenceAudioPlanResult[] | null | undefined
): string {
    if (!missingSlots || missingSlots.length === 0) return '';
    const planBySeq = new Map((seqPlans || []).map((p) => [p.seqIdx, p]));
    const grouped = new Map<number, AudioExportSlot[]>();
    missingSlots.forEach((slot) => {
        if (!grouped.has(slot.seqIdx)) grouped.set(slot.seqIdx, []);
        grouped.get(slot.seqIdx)!.push(slot);
    });

    const parts: string[] = [];
    grouped.forEach((slotsForSeq, sIdx) => {
        const plan = planBySeq.get(sIdx);
        const seqNum = plan ? plan.seqNum : sIdx + 1;
        if (!plan || plan.totalScenes === 0 || slotsForSeq.length >= plan.totalScenes) {
            parts.push(
                plan && plan.totalScenes > 0
                    ? `Sequence ${seqNum} (all ${plan.totalScenes} scenes)`
                    : `Sequence ${seqNum}`
            );
        } else {
            const labels = slotsForSeq.map((s) => s.label);
            parts.push(labels.length === 1 ? `Scene ${labels[0]}` : `Scenes ${labels.join(', ')}`);
        }
    });

    if (parts.length <= 6) return parts.join('; ');
    return `${parts.slice(0, 6).join('; ')}, and ${parts.length - 6} more`;
}

/**
 * Builds the full-novel audio stitching plan across all sequences and scenes,
 * preventing scene duplication and distinguishing trailing gaps from structural gaps.
 */
export function buildStoryAudioExportPlan(
    story: AudioStoryLike | null | undefined,
    allSceneRecords: AudioStorageRecordLike[] = [],
    allSeqRecords: AudioStorageRecordLike[] = []
): StoryAudioExportPlan {
    const sequences = Array.isArray(story?.sequences) ? story.sequences : [];
    const sceneKeysMax = Object.keys(story?.scenes || {})
        .map((k) => Number(k) + 1)
        .filter((n) => !isNaN(n) && n > 0)
        .reduce((max, n) => Math.max(max, n), 0);
    const totalSeqs = Math.max(sequences.length, sceneKeysMax);

    const scenesBySeq = new Map<number, AudioStorageRecordLike[]>();
    (allSceneRecords || []).forEach((rec) => {
        if (!rec || !rec.blob) return;
        const sIdx = Number(rec.seqIdx);
        if (isNaN(sIdx) || sIdx < 0) return;
        if (!scenesBySeq.has(sIdx)) scenesBySeq.set(sIdx, []);
        scenesBySeq.get(sIdx)!.push(rec);
    });

    const seqRecordBySeq = new Map<number, AudioStorageRecordLike>();
    (allSeqRecords || []).forEach((rec) => {
        if (!rec || !rec.blob) return;
        const sIdx = Number(rec.seqIdx);
        if (!isNaN(sIdx) && sIdx >= 0) {
            seqRecordBySeq.set(sIdx, rec);
        }
    });

    const seqPlans: SequenceAudioPlanResult[] = [];
    for (let sIdx = 0; sIdx < totalSeqs; sIdx++) {
        seqPlans.push(
            resolveSequenceAudioPlan(
                story,
                sIdx,
                scenesBySeq.get(sIdx) || [],
                seqRecordBySeq.get(sIdx) || null
            )
        );
    }

    const slots: AudioExportSlot[] = [];
    seqPlans.forEach((p) => {
        if (p.totalScenes === 0) {
            slots.push({
                type: 'sequence',
                seqIdx: p.seqIdx,
                seqNum: p.seqNum,
                label: `Sequence ${p.seqNum}`,
                hasAudio: p.items.length > 0
            });
        } else {
            for (let scIdx = 0; scIdx < p.totalScenes; scIdx++) {
                slots.push({
                    type: 'scene',
                    seqIdx: p.seqIdx,
                    sceneIdx: scIdx,
                    seqNum: p.seqNum,
                    label: `${p.seqNum}.${scIdx + 1}`,
                    hasAudio: p.coveredSet.has(scIdx)
                });
            }
        }
    });

    const nonEmptyPlans = seqPlans.filter((p) => p.items.length > 0);
    const items: SequenceAudioPlanItem[] = [];
    nonEmptyPlans.forEach((p, planIdx) => {
        const isLastPlan = planIdx === nonEmptyPlans.length - 1;
        p.items.forEach((it, itemIdx) => {
            const isLastInPlan = itemIdx === p.items.length - 1;
            items.push({
                ...it,
                pauseAfterMs: isLastInPlan ? (isLastPlan ? null : 2500) : (it.pauseAfterMs ?? 2000)
            });
        });
    });

    let lastCoveredSlotIdx = -1;
    for (let i = slots.length - 1; i >= 0; i--) {
        if (slots[i].hasAudio) {
            lastCoveredSlotIdx = i;
            break;
        }
    }

    const missingBeforeLast =
        lastCoveredSlotIdx >= 0 ? slots.slice(0, lastCoveredSlotIdx).filter((s) => !s.hasAudio) : [];
    const missingAfterLast =
        lastCoveredSlotIdx >= 0 ? slots.slice(lastCoveredSlotIdx + 1).filter((s) => !s.hasAudio) : slots;

    let status: StoryAudioExportPlan['status'];
    if (items.length === 0) {
        status = 'none';
    } else if (missingBeforeLast.length > 0) {
        status = 'missing_in_structure';
    } else if (missingAfterLast.length > 0) {
        status = 'incomplete';
    } else {
        status = 'complete';
    }

    const totalOutlinedScenes = seqPlans.reduce((sum, p) => sum + p.totalScenes, 0);
    const coveredSceneCount = seqPlans.reduce((sum, p) => sum + p.coveredSceneIndices.length, 0);
    const coveredSeqCount = nonEmptyPlans.length;

    return {
        status,
        items,
        seqPlans,
        totalOutlinedScenes,
        coveredSceneCount,
        totalSeqs,
        coveredSeqCount,
        missingBeforeLast,
        missingAfterLast,
        missingBeforeSummary: formatMissingAudioSlotsSummary(missingBeforeLast, seqPlans),
        missingAfterSummary: formatMissingAudioSlotsSummary(missingAfterLast, seqPlans)
    };
}
