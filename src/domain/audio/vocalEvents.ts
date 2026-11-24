/**
 * @module domain/audio/vocalEvents
 * Canonical 34 Breeze 2 parenthetical vocal event tags and the in-browser hybrid
 * TF-IDF + 12D acoustic vector store translating Drama-3 cues into Breeze 2 controls.
 */

export const CANONICAL_VOCAL_EVENTS: ReadonlySet<string> = new Set([
    '(laughs)', '(chuckles)', '(giggles)',
    '(crying)', '(sobs)', '(whimpers)', '(groans)', '(moans)',
    '(sighs)', '(gasps)', '(inhales)', '(exhales)', '(breathing heavily)',
    '(whispers)', '(shouts)', '(screams)', '(singing)', '(humming)', '(stutters)', '(pause)',
    '(clears throat)', '(coughs)', '(sniffs)',
    '(smacks lips)', '(clicks tongue)',
    '(yawns)', '(sneezes)', '(hiccups)', '(burps)', '(gulps)', '(gags)',
    '(grunts)', '(scoffs)', '(snorts)',
    '(sigh)', '(laugh)', '(cough)', '(gasp)', '(yawn)'
]);

export const VOCAL_EVENT_SYNONYMS: Record<string, string> = {
    laugh: '(laughs)', laughs: '(laughs)', laughing: '(laughs)', laughed: '(laughs)',
    chuckle: '(chuckles)', chuckles: '(chuckles)', chuckling: '(chuckles)', chuckled: '(chuckles)',
    giggle: '(giggles)', giggles: '(giggles)', giggling: '(giggles)', giggled: '(giggles)',
    cry: '(crying)', crying: '(crying)', cries: '(crying)',
    sob: '(sobs)', sobs: '(sobs)', sobbing: '(sobs)', sobbed: '(sobs)',
    whimper: '(whimpers)', whimpers: '(whimpers)', whimpering: '(whimpers)',
    groan: '(groans)', groans: '(groans)', groaning: '(groans)',
    moan: '(moans)', moans: '(moans)', moaning: '(moans)',
    sigh: '(sighs)', sighs: '(sighs)', sighing: '(sighs)', sighed: '(sighs)',
    gasp: '(gasps)', gasps: '(gasps)', gasping: '(gasps)',
    inhale: '(inhales)', inhales: '(inhales)', inhaling: '(inhales)',
    breath: '(inhales)', 'deep breath': '(inhales)', 'shaky breath': '(inhales)',
    exhale: '(exhales)', exhales: '(exhales)', exhaling: '(exhales)',
    'small laugh': '(chuckles)',
    'breathing heavily': '(breathing heavily)', 'heavy breathing': '(breathing heavily)', 'breathes heavily': '(breathing heavily)',
    whisper: '(whispers)', whispers: '(whispers)', whispering: '(whispers)', whispered: '(whispers)',
    shout: '(shouts)', shouts: '(shouts)', shouting: '(shouts)',
    scream: '(screams)', screams: '(screams)', screaming: '(screams)',
    sing: '(singing)', singing: '(singing)', sings: '(singing)',
    hum: '(humming)', humming: '(humming)', hums: '(humming)',
    stutter: '(stutters)', stutters: '(stutters)', stuttering: '(stutters)',
    pause: '(pause)', pauses: '(pause)', 'short pause': '(pause)', 'long pause': '(pause)', 'brief pause': '(pause)',
    'clear throat': '(clears throat)', 'clears throat': '(clears throat)', 'clearing throat': '(clears throat)', 'throat clearing': '(clears throat)',
    cough: '(coughs)', coughs: '(coughs)', coughing: '(coughs)',
    sniff: '(sniffs)', sniffs: '(sniffs)', sniffing: '(sniffs)',
    'smack lips': '(smacks lips)', 'smacks lips': '(smacks lips)', 'smacking lips': '(smacks lips)', 'lip smack': '(smacks lips)',
    'click tongue': '(clicks tongue)', 'clicks tongue': '(clicks tongue)', 'clicking tongue': '(clicks tongue)', 'tongue click': '(clicks tongue)',
    yawn: '(yawns)', yawns: '(yawns)', yawning: '(yawns)',
    sneeze: '(sneezes)', sneezes: '(sneezes)', sneezing: '(sneezes)',
    hiccup: '(hiccups)', hiccups: '(hiccups)', hiccuping: '(hiccups)',
    burp: '(burps)', burps: '(burps)', burping: '(burps)',
    gulp: '(gulps)', gulps: '(gulps)', gulping: '(gulps)',
    gag: '(gags)', gags: '(gags)', gagging: '(gags)',
    grunt: '(grunts)', grunts: '(grunts)', grunting: '(grunts)',
    scoff: '(scoffs)', scoffs: '(scoffs)', scoffing: '(scoffs)',
    snort: '(snorts)', snorts: '(snorts)', snorting: '(snorts)'
};

interface SparseTfidfVec {
    vec: Map<string, number>;
    norm: number;
}

interface PrototypeIndexEntry {
    tag: string;
    sparse: SparseTfidfVec;
    dense: number[];
}

export interface CueResolutionResult {
    kind: 'vocal_event' | 'acting_direction';
    canonicalTags: string[];
    canonicalTag: string | null;
    instructStyle: string | null;
    score: number;
}

/**
 * In-browser Dual-Space Hybrid Vector Store + RAG Reverse-Translator mapping
 * Fish Audio Drama-3 cues and XML prosody tags into Breeze 2 canonical tags/styles.
 */
export class Drama3ToBreezeVectorStore {
    cache: Map<string, CueResolutionResult>;
    maxCacheEntries: number;
    prototypes: Array<{ tag: string; docs: string; vec: number[] }>;
    conceptLexicon12D: Record<string, number[]>;
    paralinguisticHeadwordRe: RegExp;
    idf: Map<string, number>;
    protoIndex: PrototypeIndexEntry[];

    constructor() {
        this.cache = new Map();
        this.maxCacheEntries = 512;

        this.prototypes = [
            { tag: '(laughs)', docs: 'laughs laugh laughing laughter amused joyous burst of laughter hearty laugh', vec: [0.45, 0.85, 0.15, 0.25, 0.35, 1.0, 0.0, 0.0, 0.3, 0.2, 0.0, 0.0] },
            { tag: '(chuckles)', docs: 'chuckles chuckle chuckling small laugh dry laugh quiet laugh soft laugh faint laugh amused breath half laugh', vec: [0.15, 0.55, 0.25, 0.0, -0.2, 0.85, 0.0, 0.0, 0.1, 0.1, 0.0, 0.0] },
            { tag: '(giggles)', docs: 'giggles giggle giggling playful high light titter bubbly laugh', vec: [0.35, 0.8, 0.15, 0.7, 0.0, 0.9, 0.0, 0.0, 0.45, 0.25, 0.0, 0.0] },
            { tag: '(crying)', docs: 'crying cry cries weeping tears sorrowful voice watery breakdown', vec: [-0.2, -0.8, 0.35, 0.2, -0.1, 0.0, 1.0, 0.4, -0.2, 0.1, 0.15, 0.0] },
            { tag: '(sobs)', docs: 'sobs sob sobbing choked sob ragged sob convulsive weeping trembling voice tears', vec: [0.25, -0.95, 0.45, 0.15, 0.1, 0.0, 1.0, 0.65, 0.1, 0.3, 0.15, 0.0] },
            { tag: '(whimpers)', docs: 'whimpers whimper whimpering small broken cry trembling whine frightened soft cry', vec: [-0.1, -0.8, 0.35, 0.45, -0.5, 0.0, 0.9, 0.35, 0.0, 0.1, 0.0, 0.0] },
            { tag: '(groans)', docs: 'groans groan groaning pained groan low moan weary grunt discomfort', vec: [0.05, -0.65, 0.15, -0.5, -0.1, 0.0, 0.75, 0.45, -0.2, 0.0, 0.2, 0.0] },
            { tag: '(moans)', docs: 'moans moan moaning low pained murmur agonized ache', vec: [-0.1, -0.55, 0.25, -0.35, -0.25, 0.0, 0.8, 0.25, -0.3, 0.0, 0.1, 0.0] },
            { tag: '(sighs)', docs: 'sighs sigh sighing heavy sigh deep sigh weary sigh tired exhale quiet sigh long sigh relief breath', vec: [-0.35, -0.2, 0.9, -0.15, -0.35, 0.0, 0.15, 0.0, -0.45, 0.0, 0.0, 0.2] },
            { tag: '(gasps)', docs: 'gasps gasp gasping sharp intake of breath startled breath shocked inhale suddenly breathless', vec: [0.7, -0.35, 0.85, 0.35, 0.25, 0.0, 0.25, 0.4, 0.7, 0.1, 0.1, 0.0] },
            { tag: '(inhales)', docs: 'inhales inhale inhaling sharp inhale deep inhale drawing breath catching breath', vec: [0.25, 0.0, 0.95, 0.1, -0.2, 0.0, 0.1, 0.15, 0.25, 0.0, 0.0, 0.15] },
            { tag: '(exhales)', docs: 'exhales exhale exhaling long exhale slow exhale sharp exhale letting breath out relief exhale', vec: [-0.3, 0.05, 0.95, -0.1, -0.3, 0.0, 0.0, 0.0, -0.4, 0.0, 0.0, 0.15] },
            { tag: '(breathing heavily)', docs: 'breathing heavily heavy breathing panting shaky breath ragged breath short breath trembling breath uneven breath out of breath', vec: [0.55, -0.4, 1.0, 0.0, -0.1, 0.0, 0.3, 0.25, 0.65, 0.25, 0.0, 0.0] },
            { tag: '(whispers)', docs: 'whispers whisper whispering hushed sotto voce barely audible soft murmur secret close mic', vec: [-0.45, 0.0, 0.75, 0.0, -0.95, 0.0, 0.0, 0.15, -0.2, 0.0, 0.0, 0.1] },
            { tag: '(shouts)', docs: 'shouts shout shouting yelling bellowing loud call projecting voice forceful yell', vec: [0.85, -0.2, 0.1, 0.25, 0.95, 0.0, 0.1, 0.35, 0.55, 0.0, 0.0, 0.0] },
            { tag: '(screams)', docs: 'screams scream screaming shriek shrieking piercing yell terror outcry', vec: [1.0, -0.8, 0.15, 0.8, 1.0, 0.0, 0.7, 0.55, 0.8, 0.0, 0.0, 0.0] },
            { tag: '(singing)', docs: 'singing sing sings melodic tune song lyrics lilting voice', vec: [0.2, 0.5, 0.2, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.3, 0.0, 0.0] },
            { tag: '(humming)', docs: 'humming hum hums quiet tune nasal melody soft hum', vec: [-0.2, 0.35, 0.15, 0.0, -0.35, 0.0, 0.0, 0.0, -0.25, 0.2, 0.35, 0.0] },
            { tag: '(stutters)', docs: 'stutters stutter stuttering stammer stammering halting hesitant broken speech nervous repeating', vec: [0.35, -0.35, 0.25, 0.1, -0.15, 0.0, 0.25, 0.75, 0.2, 0.35, 0.0, 0.15] },
            { tag: '(pause)', docs: 'pause pauses beat brief pause long pause silence quiet moment hesitates trails off waiting', vec: [-0.5, 0.0, 0.1, 0.0, -0.7, 0.0, 0.0, 0.0, -0.85, 0.0, 0.0, 1.0] },
            { tag: '(clears throat)', docs: 'clears throat clearing throat dry throat clear polite hem interrupt coughs lightly', vec: [0.05, 0.0, 0.1, -0.15, -0.1, 0.0, 0.0, 0.75, 0.0, 0.2, 0.9, 0.1] },
            { tag: '(coughs)', docs: 'coughs cough coughing dry cough choked cough hacking chesty cough', vec: [0.3, -0.4, 0.2, -0.1, 0.25, 0.0, 0.3, 0.65, 0.35, 0.5, 1.0, 0.0] },
            { tag: '(sniffs)', docs: 'sniffs sniff sniffing sniffle sniffling wet nose tearful sniff', vec: [-0.1, -0.35, 0.3, 0.05, -0.3, 0.0, 0.45, 0.1, 0.0, 0.2, 0.95, 0.0] },
            { tag: '(smacks lips)', docs: 'smacks lips smack lips tasting lip smack dry mouth clicking mouth', vec: [-0.15, 0.0, 0.05, 0.0, -0.25, 0.0, 0.0, 0.15, -0.1, 0.75, 0.2, 0.1] },
            { tag: '(clicks tongue)', docs: 'clicks tongue click tongue tsk disapproving tongue click tut', vec: [0.05, -0.2, 0.0, 0.2, -0.15, 0.0, 0.0, 0.2, 0.1, 0.85, 0.1, 0.05] },
            { tag: '(yawns)', docs: 'yawns yawn yawning sleepy tired wide breath drowsy fatigue', vec: [-0.75, 0.0, 0.7, -0.15, -0.25, 0.0, 0.0, 0.0, -0.75, 0.65, 0.1, 0.2] },
            { tag: '(sneezes)', docs: 'sneezes sneeze sneezing sharp burst nasal blast achoo', vec: [0.5, -0.1, 0.35, 0.3, 0.6, 0.0, 0.0, 0.2, 0.65, 0.85, 0.9, 0.0] },
            { tag: '(hiccups)', docs: 'hiccups hiccup hiccuping involuntary spasm sharp hic', vec: [0.25, 0.0, 0.15, 0.35, 0.1, 0.0, 0.0, 0.55, 0.35, 0.95, 0.3, 0.0] },
            { tag: '(burps)', docs: 'burps burp burping belch coarse gastric sound', vec: [0.1, 0.0, 0.1, -0.5, 0.2, 0.0, 0.0, 0.2, 0.0, 0.9, 0.4, 0.0] },
            { tag: '(gulps)', docs: 'gulps gulp gulping dry swallow swallowing hard nervous swallow lump in throat', vec: [0.2, -0.35, 0.1, -0.1, -0.3, 0.0, 0.2, 0.9, 0.1, 0.6, 0.7, 0.15] },
            { tag: '(gags)', docs: 'gags gag gagging retch choking disgust nausea', vec: [0.45, -0.8, 0.15, 0.0, 0.25, 0.0, 0.55, 0.95, 0.4, 0.75, 0.9, 0.0] },
            { tag: '(grunts)', docs: 'grunts grunt grunting effortful strain heavy exertion low impact sound', vec: [0.45, -0.45, 0.15, -0.65, 0.35, 0.0, 0.45, 0.7, 0.3, 0.2, 0.35, 0.0] },
            { tag: '(scoffs)', docs: 'scoffs scoff scoffing bitter scoff derisive dismissive laugh contemptuous puff', vec: [0.2, -0.4, 0.35, 0.0, 0.05, 0.4, 0.0, 0.15, 0.25, 0.15, 0.5, 0.0] },
            { tag: '(snorts)', docs: 'snorts snort snorting sharp nasal puff derisive snort amused snort', vec: [0.25, -0.15, 0.3, -0.1, 0.1, 0.35, 0.0, 0.1, 0.35, 0.25, 0.95, 0.0] }
        ];

        this.conceptLexicon12D = {
            laugh: [0.4, 0.85, 0.15, 0.2, 0.2, 1.0, 0, 0, 0.25, 0.15, 0, 0],
            chuckle: [0.15, 0.55, 0.2, 0, -0.2, 0.9, 0, 0, 0.1, 0.1, 0, 0],
            giggle: [0.35, 0.8, 0.1, 0.7, 0, 0.9, 0, 0, 0.4, 0.2, 0, 0],
            amused: [0.15, 0.65, 0.1, 0.1, -0.1, 0.7, 0, 0, 0.1, 0, 0, 0],
            small: [-0.2, 0, 0.1, 0, -0.4, 0.2, 0, 0, -0.1, 0, 0, 0],
            dry: [0.0, -0.15, 0.05, -0.1, -0.15, 0.2, 0, 0.35, -0.05, 0.1, 0.25, 0],
            cry: [-0.15, -0.8, 0.35, 0.2, -0.1, 0, 1.0, 0.4, -0.15, 0.1, 0.15, 0],
            sob: [0.25, -0.95, 0.45, 0.15, 0.1, 0, 1.0, 0.65, 0.1, 0.3, 0.15, 0],
            choked: [0.2, -0.8, 0.35, 0, -0.15, 0, 0.75, 0.9, 0.05, 0.2, 0.35, 0],
            whimper: [-0.1, -0.8, 0.3, 0.45, -0.5, 0, 0.9, 0.3, 0, 0.1, 0, 0],
            groan: [0.05, -0.65, 0.15, -0.5, -0.1, 0, 0.75, 0.45, -0.2, 0, 0.2, 0],
            moan: [-0.1, -0.55, 0.25, -0.35, -0.25, 0, 0.8, 0.25, -0.3, 0, 0.1, 0],
            pain: [0.25, -0.8, 0.15, -0.2, 0.1, 0, 0.85, 0.5, 0.05, 0, 0.1, 0],
            sigh: [-0.35, -0.2, 0.9, -0.15, -0.35, 0, 0.15, 0, -0.45, 0, 0, 0.2],
            breath: [0.25, -0.15, 0.95, 0, -0.2, 0, 0.15, 0.15, 0.25, 0.1, 0, 0.05],
            shaky: [0.35, -0.45, 0.85, 0.1, -0.2, 0, 0.4, 0.35, 0.3, 0.2, 0, 0],
            ragged: [0.45, -0.45, 0.95, 0, -0.15, 0, 0.35, 0.3, 0.5, 0.2, 0, 0],
            heavy: [0.25, -0.25, 0.85, -0.2, -0.1, 0, 0.2, 0.15, 0.35, 0.15, 0, 0],
            panting: [0.6, -0.3, 1.0, 0.05, 0.05, 0, 0.25, 0.2, 0.75, 0.3, 0, 0],
            gasp: [0.7, -0.35, 0.85, 0.35, 0.25, 0, 0.25, 0.4, 0.7, 0.1, 0.1, 0],
            intake: [0.55, -0.2, 0.9, 0.2, 0.1, 0, 0.15, 0.3, 0.55, 0, 0.05, 0],
            sharp: [0.6, -0.3, 0.6, 0.25, 0.2, 0, 0.15, 0.3, 0.65, 0.1, 0.1, 0],
            inhale: [0.25, 0, 0.95, 0.1, -0.2, 0, 0.1, 0.15, 0.25, 0, 0, 0.15],
            exhale: [-0.3, 0.05, 0.95, -0.1, -0.3, 0, 0, 0, -0.4, 0, 0, 0.15],
            whisper: [-0.45, 0, 0.75, 0, -0.95, 0, 0, 0.15, -0.2, 0, 0, 0.1],
            hushed: [-0.45, 0, 0.7, 0, -0.9, 0, 0, 0.15, -0.25, 0, 0, 0.15],
            quiet: [-0.45, 0, 0.45, 0, -0.75, 0, 0, 0.05, -0.3, 0, 0, 0.2],
            soft: [-0.4, 0.15, 0.5, 0, -0.65, 0, 0, 0, -0.25, 0, 0, 0.05],
            shout: [0.85, -0.2, 0.1, 0.25, 0.95, 0, 0.1, 0.35, 0.55, 0, 0, 0],
            scream: [1.0, -0.8, 0.15, 0.8, 1.0, 0, 0.7, 0.55, 0.8, 0, 0, 0],
            yell: [0.85, -0.25, 0.1, 0.3, 0.95, 0, 0.15, 0.35, 0.6, 0, 0, 0],
            forceful: [0.65, -0.15, 0, -0.1, 0.75, 0, 0, 0.25, 0.35, 0, 0, 0],
            pause: [-0.5, 0, 0.1, 0, -0.7, 0, 0, 0, -0.85, 0, 0, 1.0],
            beat: [-0.45, 0, 0.1, 0, -0.6, 0, 0, 0, -0.75, 0, 0, 0.9],
            silence: [-0.55, 0, 0.05, 0, -0.85, 0, 0, 0, -0.9, 0, 0, 1.0],
            cough: [0.3, -0.4, 0.2, -0.1, 0.25, 0, 0.3, 0.65, 0.35, 0.5, 1.0, 0],
            throat: [0.1, -0.05, 0.1, -0.15, -0.1, 0, 0.05, 0.8, 0, 0.2, 0.85, 0.05],
            clear: [0.05, 0, 0.1, -0.1, -0.1, 0, 0, 0.7, 0, 0.2, 0.85, 0.05],
            sniff: [-0.1, -0.35, 0.3, 0.05, -0.3, 0, 0.45, 0.1, 0, 0.2, 0.95, 0],
            swallow: [0.15, -0.3, 0.1, -0.1, -0.3, 0, 0.2, 0.9, 0.1, 0.55, 0.65, 0.15],
            gulp: [0.2, -0.35, 0.1, -0.1, -0.3, 0, 0.2, 0.95, 0.1, 0.6, 0.7, 0.15],
            stutter: [0.35, -0.35, 0.25, 0.1, -0.15, 0, 0.25, 0.75, 0.2, 0.35, 0, 0.15],
            stammer: [0.35, -0.35, 0.25, 0.1, -0.15, 0, 0.25, 0.75, 0.2, 0.35, 0, 0.15],
            scoff: [0.2, -0.4, 0.35, 0, 0.05, 0.4, 0, 0.15, 0.25, 0.15, 0.5, 0],
            snort: [0.25, -0.15, 0.3, -0.1, 0.1, 0.35, 0, 0.1, 0.35, 0.25, 0.95, 0],
            grunt: [0.45, -0.45, 0.15, -0.65, 0.35, 0, 0.45, 0.7, 0.3, 0.2, 0.35, 0],
            yawn: [-0.75, 0, 0.7, -0.15, -0.25, 0, 0, 0, -0.75, 0.65, 0.1, 0.2],
            sneeze: [0.5, -0.1, 0.35, 0.3, 0.6, 0, 0, 0.2, 0.65, 0.85, 0.9, 0],
            hiccup: [0.25, 0, 0.15, 0.35, 0.1, 0, 0, 0.55, 0.35, 0.95, 0.3, 0],
            burp: [0.1, 0, 0.1, -0.5, 0.2, 0, 0, 0.2, 0, 0.9, 0.4, 0],
            gag: [0.45, -0.8, 0.15, 0, 0.25, 0, 0.55, 0.95, 0.4, 0.75, 0.9, 0],
            hum: [-0.2, 0.35, 0.15, 0, -0.35, 0, 0, 0, -0.25, 0.2, 0.35, 0],
            sing: [0.2, 0.5, 0.2, 0.3, 0.2, 0.1, 0, 0, 0, 0.3, 0, 0],
            lips: [-0.15, 0, 0.05, 0, -0.25, 0, 0, 0.15, -0.1, 0.75, 0.2, 0.1],
            tongue: [0.05, -0.2, 0, 0.2, -0.15, 0, 0, 0.2, 0.1, 0.85, 0.1, 0.05],
            gritted: [0.4, -0.6, 0, -0.2, 0.1, 0, 0.2, 0.65, -0.1, 0, 0, 0],
            teeth: [0.35, -0.55, 0, -0.2, 0.05, 0, 0.15, 0.6, -0.1, 0, 0, 0],
            trembling: [0.2, -0.6, 0.45, 0.15, -0.3, 0, 0.6, 0.45, 0.05, 0.1, 0, 0],
            breaking: [0.15, -0.75, 0.4, 0.1, -0.35, 0, 0.75, 0.65, -0.15, 0.05, 0.1, 0],
            bitter: [0.15, -0.5, 0.2, -0.15, -0.05, 0.25, 0.1, 0.2, 0.05, 0, 0.2, 0],
            cold: [-0.2, -0.35, 0, -0.25, -0.15, 0, 0, 0.25, -0.2, 0, 0, 0],
            warm: [-0.1, 0.6, 0.15, -0.1, -0.1, 0.15, 0, 0, -0.1, 0, 0, 0],
            urgent: [0.7, -0.25, 0.2, 0.2, 0.45, 0, 0.1, 0.2, 0.85, 0, 0, 0],
            fast: [0.6, 0, 0.1, 0.15, 0.3, 0, 0, 0.1, 0.95, 0, 0, 0],
            slow: [-0.4, 0, 0.2, -0.15, -0.2, 0, 0, 0, -0.9, 0, 0, 0.35]
        };

        this.paralinguisticHeadwordRe =
            /\b(?:breath(?:ing)?|sigh(?:s|ed|ing)?|laugh(?:s|ed|ing|ter)?|chuckl(?:e|es|ed|ing)|giggl(?:e|es|ed|ing)|sob(?:s|bed|bing)?|cry(?:ing|ies)?|whimper(?:s|ed|ing)?|groan(?:s|ed|ing)?|moan(?:s|ed|ing)?|gasp(?:s|ed|ing)?|inhal(?:e|es|ed|ing)|exhal(?:e|es|ed|ing)|pant(?:s|ed|ing)?|cough(?:s|ed|ing)?|sniff(?:s|ed|ing|l(?:e|es|ing))?|scoff(?:s|ed|ing)?|snort(?:s|ed|ing)?|grunt(?:s|ed|ing)?|gulp(?:s|ed|ing)?|swallow(?:s|ed|ing)?|gag(?:s|ged|ging)?|yawn(?:s|ed|ing)?|sneez(?:e|es|ed|ing)|hiccup(?:s|ped|ping)?|burp(?:s|ed|ing)?|pause(?:s|d)?|beat|hum(?:s|med|ming)?|sing(?:s|ing)?|stutter(?:s|ed|ing)?|stammer(?:s|ed|ing)?|throat|tongue|lips)\b/i;

        this.idf = new Map();
        this.protoIndex = [];
        this._buildIndex();
    }

    _stemWord(word: string): string {
        let w = String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
        else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
        else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
        else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2);
        else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
        return w;
    }

    _tokenizeFeatures(text: string): string[] {
        const feats: string[] = [];
        const words = String(text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        for (const rawW of words) {
            const stem = this._stemWord(rawW);
            if (stem) feats.push('w:' + stem);
            const padded = '^' + rawW + '$';
            for (let i = 0; i <= padded.length - 3; i++) {
                feats.push('g:' + padded.slice(i, i + 3));
            }
        }
        return feats;
    }

    _normalizeVec(arr: number[]): number[] {
        let norm = 0;
        for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
        norm = Math.sqrt(norm);
        if (norm <= 1e-8) return arr.slice();
        return arr.map((v) => v / norm);
    }

    _buildSparseTfidf(text: string, useExistingIdf = true): SparseTfidfVec {
        const feats = this._tokenizeFeatures(text);
        const tf = new Map<string, number>();
        for (const f of feats) {
            const w = f.startsWith('w:') ? 2.2 : 1.0;
            tf.set(f, (tf.get(f) || 0) + w);
        }
        const vec = new Map<string, number>();
        let normSq = 0;
        for (const [f, cnt] of tf.entries()) {
            const idfVal = useExistingIdf ? this.idf.get(f) || 1.2 : 1.0;
            const val = cnt * idfVal;
            vec.set(f, val);
            normSq += val * val;
        }
        return { vec, norm: Math.sqrt(normSq) || 1 };
    }

    _buildDenseConceptVec(text: string): { vec: number[]; hits: number } {
        const words = String(text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        const accum = new Array<number>(12).fill(0);
        let hits = 0;
        for (const w of words) {
            const stem = this._stemWord(w);
            const entry = this.conceptLexicon12D[w] || this.conceptLexicon12D[stem];
            if (entry) {
                for (let d = 0; d < 12; d++) accum[d] += entry[d];
                hits++;
            }
        }
        return { vec: this._normalizeVec(accum), hits };
    }

    _cosineSparse(a: SparseTfidfVec, b: SparseTfidfVec): number {
        if (!a || !b || a.norm === 0 || b.norm === 0) return 0;
        let dot = 0;
        for (const [k, v] of a.vec.entries()) {
            const bv = b.vec.get(k);
            if (bv) dot += v * bv;
        }
        return Math.max(0, Math.min(1, dot / (a.norm * b.norm)));
    }

    _cosineDense(a: number[], b: number[]): number {
        if (!a || !b) return 0;
        let dot = 0;
        for (let d = 0; d < 12; d++) dot += a[d] * b[d];
        return Math.max(0, Math.min(1, dot));
    }

    _buildIndex(): void {
        const df = new Map<string, number>();
        for (const p of this.prototypes) {
            const feats = new Set(this._tokenizeFeatures(p.docs));
            for (const f of feats) df.set(f, (df.get(f) || 0) + 1);
        }
        const N = this.prototypes.length;
        for (const [f, count] of df.entries()) {
            this.idf.set(f, Math.log((N + 1) / (count + 1)) + 1.0);
        }
        this.protoIndex = this.prototypes.map((p) => ({
            tag: p.tag,
            sparse: this._buildSparseTfidf(p.docs, true),
            dense: this._normalizeVec(p.vec)
        }));
    }

    _retrieveTopMatch(clauseText: string): {
        tag: string | null;
        hybridScore: number;
        tfidfSim: number;
        denseSim: number;
        hasHeadword: boolean;
    } {
        const clean = String(clauseText || '').trim().toLowerCase();
        if (!clean) {
            return { tag: null, hybridScore: 0, tfidfSim: 0, denseSim: 0, hasHeadword: false };
        }

        if (VOCAL_EVENT_SYNONYMS[clean]) {
            return {
                tag: VOCAL_EVENT_SYNONYMS[clean],
                hybridScore: 1.0,
                tfidfSim: 1.0,
                denseSim: 1.0,
                hasHeadword: true
            };
        }
        const parenDirect = `(${clean})`;
        if (CANONICAL_VOCAL_EVENTS.has(parenDirect)) {
            const normalizedCanon = VOCAL_EVENT_SYNONYMS[clean] || parenDirect;
            return {
                tag: normalizedCanon,
                hybridScore: 1.0,
                tfidfSim: 1.0,
                denseSim: 1.0,
                hasHeadword: true
            };
        }

        const qSparse = this._buildSparseTfidf(clean, true);
        const qDenseInfo = this._buildDenseConceptVec(clean);
        const hasHeadword = this.paralinguisticHeadwordRe.test(clean);

        let best: {
            tag: string | null;
            hybridScore: number;
            tfidfSim: number;
            denseSim: number;
            hasHeadword: boolean;
        } = { tag: null, hybridScore: 0, tfidfSim: 0, denseSim: 0, hasHeadword };
        for (const proto of this.protoIndex) {
            const tfidfSim = this._cosineSparse(qSparse, proto.sparse);
            const denseSim = qDenseInfo.hits > 0 ? this._cosineDense(qDenseInfo.vec, proto.dense) : 0;
            const hybridScore = 0.58 * tfidfSim + 0.42 * denseSim;
            if (hybridScore > best.hybridScore) {
                best = { tag: proto.tag, hybridScore, tfidfSim, denseSim, hasHeadword };
            }
        }
        return best;
    }

    /** Resolves a Drama-3 `[cue]` or legacy `(cue)` into Breeze 2 sound tags and/or acting directions. */
    resolveCue(rawInner: unknown): CueResolutionResult {
        const raw = String(rawInner || '').replace(/^[[(]+|[\])]+$/g, '').trim();
        if (!raw) {
            return {
                kind: 'acting_direction',
                canonicalTags: [],
                canonicalTag: null,
                instructStyle: null,
                score: 0
            };
        }
        const cacheKey = raw.toLowerCase();
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, cached);
            return cached;
        }

        let result: CueResolutionResult;
        if (VOCAL_EVENT_SYNONYMS[cacheKey]) {
            result = {
                kind: 'vocal_event',
                canonicalTags: [VOCAL_EVENT_SYNONYMS[cacheKey]],
                canonicalTag: VOCAL_EVENT_SYNONYMS[cacheKey],
                instructStyle: null,
                score: 1.0
            };
        } else if (CANONICAL_VOCAL_EVENTS.has(`(${cacheKey})`)) {
            const canon = VOCAL_EVENT_SYNONYMS[cacheKey] || `(${cacheKey})`;
            result = {
                kind: 'vocal_event',
                canonicalTags: [canon],
                canonicalTag: canon,
                instructStyle: null,
                score: 1.0
            };
        } else {
            const clauses = raw
                .split(/\s*[,;]\s*/)
                .map((c) => c.trim())
                .filter(Boolean);
            const canonicalTags: string[] = [];
            const instructClauses: string[] = [];
            let maxScore = 0;

            for (const clause of clauses) {
                const wordCount = clause.split(/\s+/).filter(Boolean).length;
                const match = this._retrieveTopMatch(clause);
                maxScore = Math.max(maxScore, match.hybridScore);

                const promoteAsSoundEvent =
                    Boolean(match.tag) &&
                    (match.hybridScore >= 0.99 ||
                        (match.hasHeadword && match.hybridScore >= 0.36 && wordCount <= 5) ||
                        (!match.hasHeadword &&
                            wordCount <= 3 &&
                            match.tfidfSim >= 0.32 &&
                            match.hybridScore >= 0.48));

                if (promoteAsSoundEvent && match.tag) {
                    if (!canonicalTags.includes(match.tag)) {
                        canonicalTags.push(match.tag);
                    }
                    if (
                        wordCount >= 3 &&
                        match.hybridScore < 0.99 &&
                        !/^(?:pause|beat)$/i.test(clause)
                    ) {
                        instructClauses.push(clause);
                    }
                } else {
                    instructClauses.push(clause);
                }
            }

            const instructStyle = instructClauses.length > 0 ? instructClauses.join(', ') : null;
            result = {
                kind: canonicalTags.length > 0 ? 'vocal_event' : 'acting_direction',
                canonicalTags,
                canonicalTag: canonicalTags[0] || null,
                instructStyle,
                score: maxScore
            };
        }

        if (this.cache.size >= this.maxCacheEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) this.cache.delete(oldestKey);
        }
        this.cache.set(cacheKey, result);
        return result;
    }

    /** Translates Drama-3 paired XML prosody tags into Breeze 2 parenthetical tags and instruct directions. */
    translateXmlToBreeze(text: unknown): { text: string; xmlDirections: string[] } {
        const xmlDirections: string[] = [];
        if (!text) return { text: '', xmlDirections };
        const TAG_MAP: Record<string, { inject: string | null; dir: string }> = {
            whisper: { inject: '(whispers)', dir: 'hushed, close-mic whisper' },
            soft: { inject: null, dir: 'soft, gentle delivery' },
            fast: { inject: null, dir: 'rapid, urgent pace' },
            slow: { inject: null, dir: 'slow, deliberate cadence' },
            forceful: { inject: null, dir: 'forceful, emphatic projection' },
            emphasis: { inject: null, dir: 'emphasized key phrase' },
            stress: { inject: null, dir: 'pointed vocal stress' }
        };
        let hasWhisperTag = false;
        let out = String(text).replace(
            /<(\/?)(whisper|emphasis|stress|soft|fast|slow|forceful)\b[^>]*>/gi,
            (_m, slash: string, tagRaw: string) => {
                const tag = tagRaw.toLowerCase();
                const spec = TAG_MAP[tag];
                if (spec && !slash) {
                    if (!xmlDirections.includes(spec.dir)) xmlDirections.push(spec.dir);
                    if (spec.inject) {
                        hasWhisperTag = true;
                        return ` ${spec.inject} `;
                    }
                }
                return '';
            }
        );
        if (hasWhisperTag) {
            out = out.replace(/(?:\(whispers\)\s*){2,}/g, '(whispers) ');
        }
        return { text: out, xmlDirections };
    }
}

export const drama3ToBreezeStore = new Drama3ToBreezeVectorStore();
