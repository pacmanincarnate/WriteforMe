import { describe, expect, it } from 'vitest';
import {
    analyzeAudioDramaExpressiveness,
    analyzeAudioDramaScriptFormatting,
    analyzeAudioPcmData,
    applyHighPass75Hz,
    applyRaisedCosineFades,
    bisectChunk,
    buildEstimatedCueTimeline,
    buildStoryAudioExportPlan,
    CANONICAL_VOCAL_EVENTS,
    checkBoundaryTruncation,
    chunkAudioDramaTurns,
    chunkNovelProseForDrama3,
    chunkProseForTts,
    classifyParentheticalTag,
    cleanCharacterNameFromVoiceProfile,
    cleanDialogueSpokenText,
    combineAdjacentNarratorScriptBlocks,
    combineAdjacentNarratorSegments,
    computeCueTextWeight,
    computeRmsDb,
    computeSceneProseHash,
    computeSceneVoiceSignatureHash,
    computeWordErrorRate,
    detectMetaWordLeakage,
    drama3ToBreezeStore,
    encodeFloat32PcmToWavBlob,
    estimateDramaTurnSeconds,
    estimateReferenceTextSeconds,
    expandSegmentTurnsToCues,
    extractDialogueStats,
    extractPersonalizedReferenceTextFromInterview,
    extractSpokenAndTags,
    generatePinkNoiseRoomTone,
    getDeterministicVoiceSeed,
    getHumanReadableTtsError,
    getVoiceDescriptionForCharacter,
    getVoiceReferenceTextForCharacter,
    integerToEnglishWords,
    isAudioDramaScriptText,
    isLegacyBoilerplateVoiceProfile,
    isMasterVoiceRecordMatching,
    isMetaCommentaryText,
    isUsableVocalDescription,
    isValidVoiceDesignProfile,
    isValidVoiceRefPath,
    levelSamplesToLufs,
    mapCharacterToAudioCppVoice,
    mapCharacterToElevenLabsVoice,
    mapCharacterToGeminiVoice,
    mapCharacterToKokoroVoice,
    measureIntegratedLufs,
    normalizeAudioDramaScriptWithReport,
    normalizeAudioDramaText,
    normalizeAudioDramaTextPreservingTags,
    normalizeDirectionKey,
    ordinalToEnglishWords,
    RAIN_SENTENCE,
    resolveSequenceAudioPlan,
    resolveSpeakerVoiceIdentity,
    sanitizeVoiceReferenceText,
    splitIntoSpokenSubTurns,
    splitLongCueText,
    splitSpokenTextIntoTtsSubchunks,
    stripProseToPlainText,
    studioTargetF0Band,
    synthesizeVoiceDesignProfile,
    verifyChunkQuality,
    parseAudioDramaScript
} from '@/domain/audio';

describe('Audio Domain: textNormalization & vocalEvents', () => {
    it('strips prose and expands numbers, currency, ordinals, and times', () => {
        expect(stripProseToPlainText({ final: '**Elena** stepped outside — quietly.' })).toBe(
            'Elena stepped outside , quietly.'
        );
        expect(chunkProseForTts('First sentence. Second sentence is longer for chunking.', 10, 40).length).toBeGreaterThanOrEqual(1);
        expect(computeCueTextWeight('Hello, world!')).toBeGreaterThan(0);
        expect(splitLongCueText('One. Two. Three. Four.', 12).length).toBeGreaterThan(1);

        expect(cleanDialogueSpokenText('[sighs] (softly) Hello there.')).toBe('Hello there.');
        expect(splitSpokenTextIntoTtsSubchunks('Sentence one. Sentence two.', 20).length).toBeGreaterThanOrEqual(1);

        expect(integerToEnglishWords(42)).toBe('forty-two');
        expect(ordinalToEnglishWords(3)).toBe('third');

        const expanded = normalizeAudioDramaText('At 7:30 pm in 1995, the 1st ticket cost $12.');
        expect(expanded).toContain('twelve dollars');
        expect(expanded).toContain('first');
        expect(expanded).toContain('nineteen ninety-five');
        expect(expanded).toContain('seven thirty PM');

        const preserved = normalizeAudioDramaTextPreservingTags(
            '<whisper>Meet me at 7:30 pm [low, tense]</whisper>'
        );
        expect(preserved).toContain('<whisper>');
        expect(preserved).toContain('[low, tense]');
        expect(preserved).toContain('seven thirty PM');
    });

    it('resolves canonical vocal events, synonyms, and acting directions via drama3ToBreezeStore', () => {
        expect(CANONICAL_VOCAL_EVENTS.has('(laughs)')).toBe(true);

        const canonical = drama3ToBreezeStore.resolveCue('(sighs)');
        expect(canonical?.canonicalTag).toBe('(sighs)');

        const synonym = drama3ToBreezeStore.resolveCue('(quiet chuckle)');
        expect(synonym).not.toBeNull();
        expect(synonym?.canonicalTag === '(chuckles)' || Boolean(synonym?.instructStyle)).toBe(true);

        const direction = drama3ToBreezeStore.resolveCue('[voice dropping barely above a whisper]');
        expect(direction?.instructStyle).toContain('whisper');
    });
});

describe('Audio Domain: dramaChunker & scriptParser', () => {
    it('classifies tags, splits sub-turns, estimates durations, and chunks scripts and novel prose', () => {
        const cls = classifyParentheticalTag('(laughs)');
        expect(cls?.kind).toBe('vocal_event');

        const extracted = extractSpokenAndTags('[sighs] *Hello* <whisper>world</whisper>');
        expect(extracted.cleanText).toContain('world');

        const subTurns = splitIntoSpokenSubTurns({ speaker: 'Elena', text: 'First thought. Second thought.' });
        expect(subTurns.length).toBeGreaterThanOrEqual(1);
        expect(estimateDramaTurnSeconds({ speaker: 'Narrator', wordCount: 23 })).toBeGreaterThan(5);

        const turns = [
            { speaker: 'Narrator', spokenText: 'Rain tapped against the glass.' },
            { speaker: 'Elena', spokenText: 'Did you hear that?' }
        ];
        const segments = chunkAudioDramaTurns(turns);
        expect(segments.length).toBeGreaterThanOrEqual(1);

        const novelSegments = chunkNovelProseForDrama3(
            'The harbor bell tolled at midnight. "Stay back," Elena warned. He stepped closer anyway.'
        );
        expect(novelSegments.length).toBeGreaterThanOrEqual(1);
    });

    it('validates, scores, normalizes (7-pass), parses, computes stats, and expands cues for Audio Drama scripts', () => {
        const rawScript = [
            'Elena: **Listen** *sigh* (softly) [reaches into coat pocket, voice tight] Where is the key?',
            'Elena: <emph>Now.</emph>',
            'Narrator: The lamp sputtered.',
            'Narrator: Rain fell harder.'
        ].join('\n');

        const fmt = analyzeAudioDramaScriptFormatting(rawScript);
        expect(fmt.speakerLineCount).toBe(4);
        expect(fmt.physicalBracketTags.length).toBeGreaterThan(0);
        expect(fmt.invalidXmlTags).toContain('<emph>');

        const report = normalizeAudioDramaScriptWithReport(rawScript);
        expect(report.text).toContain('<emphasis>Listen</emphasis>');
        expect(report.text).toContain('[sighs]');
        expect(report.text).toContain('[voice tight]');
        expect(report.text).toContain('Narrator: Elena reached into coat pocket.');

        const collapsed = combineAdjacentNarratorScriptBlocks(report.text);
        expect(collapsed).toContain('The lamp sputtered. Rain fell harder.');

        const parsed = parseAudioDramaScript(collapsed);
        expect(parsed.length).toBeGreaterThanOrEqual(2);
        expect(isAudioDramaScriptText(collapsed)).toBe(true);

        const segCombined = combineAdjacentNarratorSegments([
            { speaker: 'Narrator', spokenText: 'Part one.' },
            { speaker: 'Narrator', spokenText: 'Part two.' },
            { speaker: 'Elena', spokenText: 'Go.' }
        ]);
        expect(segCombined).toHaveLength(2);
        expect(segCombined[0].spokenText).toContain('Part two.');

        const exp = analyzeAudioDramaExpressiveness(collapsed);
        expect(exp.score).toBeGreaterThanOrEqual(0);
        expect(exp.score).toBeLessThanOrEqual(100);

        const dramaStats = extractDialogueStats(collapsed, { isAudioDrama: true });
        expect(dramaStats.isAudioDrama).toBe(true);
        expect(dramaStats.dialogueWords).toBeGreaterThan(0);

        const novelStats = extractDialogueStats('She walked home. "Never again," he whispered.');
        expect(novelStats.isAudioDrama).toBe(false);
        expect(novelStats.dialogueWords).toBe(2);

        expect(isMetaCommentaryText('Let me rewrite this draft for clarity.')).toBe(true);
        expect(isMetaCommentaryText('The harbor waves broke against the pilings before dawn.')).toBe(false);

        const cues = expandSegmentTurnsToCues({ turns: [{ speaker: 'Elena', text: 'Stay quiet.' }] }, 0, 4);
        expect(cues).toHaveLength(1);
        expect(cues[0].endSec).toBe(4);

        const timeline = buildEstimatedCueTimeline(collapsed, 12, true);
        expect(timeline.length).toBeGreaterThanOrEqual(1);
        expect(timeline[timeline.length - 1].endSec).toBe(12);
    });
});

describe('Audio Domain: voiceProfiles & export planning', () => {
    it('validates/synthesizes voice profiles, sanitizes references, maps backends, and hashes identities deterministically', () => {
        expect(cleanCharacterNameFromVoiceProfile('Dr. Elena Vance: warm alto voice.', ['Dr. Elena Vance'])).toBe(
            'warm alto voice.'
        );
        expect(isUsableVocalDescription('standard')).toBe(false);
        expect(isUsableVocalDescription('A calm, resonant baritone voice with steady pacing.')).toBe(true);
        expect(
            isLegacyBoilerplateVoiceProfile(
                'A warm, young adult female voice, with a medium pace, medium pitch, and a slightly calm tone, suitable for narration'
            )
        ).toBe(true);
        expect(
            isValidVoiceDesignProfile('A young adult female voice, crisp contralto pitch, moderate pace, warm audiobook delivery.')
        ).toBe(true);

        const synth = synthesizeVoiceDesignProfile({ name: 'Detective Hale', age: '45', gender: 'male' }, 'Detective Hale', {
            genre: 'noir mystery'
        });
        expect(isValidVoiceDesignProfile(synth)).toBe(true);

        expect(isValidVoiceRefPath('C:\\audio\\ref.wav')).toBe(true);
        expect(isValidVoiceRefPath('./relative.wav')).toBe(false);

        const cleanedRef = sanitizeVoiceReferenceText('<first_person_interview>"I\'m not afraid," he whispered.</first_person_interview>');
        expect(cleanedRef).toBe("I'm not afraid, he whispered.");
        expect(estimateReferenceTextSeconds(RAIN_SENTENCE)).toBeGreaterThan(15);

        const longInterview =
            'I grew up near the docks where the foghorns never stopped singing before dawn. Every morning my father checked the brass barometer and counted the outgoing trawlers by hull color. When the harbor froze in ninety-two, we burned crate timber in an iron stove just to keep the ledger ink from thickening.';
        const excerpt = extractPersonalizedReferenceTextFromInterview(longInterview);
        expect(estimateReferenceTextSeconds(excerpt)).toBeGreaterThanOrEqual(15);

        const story = {
            id: 'story_1',
            title: 'Harbor',
            cast: [{ id: 'c1', name: 'Dr. Elena Vance', gender: 'female', age: 34, details: { deep_profile: longInterview } }]
        };
        expect(getVoiceReferenceTextForCharacter('Narrator', story)).toBe(RAIN_SENTENCE);
        expect(getVoiceReferenceTextForCharacter('Elena Vance', story)).toContain('harbor');
        expect(getVoiceDescriptionForCharacter('Dr. Elena Vance', story).length).toBeGreaterThan(20);

        expect(getDeterministicVoiceSeed('Elena Vance', story)).toBe(getDeterministicVoiceSeed('Dr. Elena Vance', story));
        expect(mapCharacterToElevenLabsVoice('young bright female', 'Clara')).toBe('bella');
        expect(mapCharacterToGeminiVoice('deep firm male baritone', 'Marcus')).toBe('Orus');
        expect(mapCharacterToKokoroVoice('soft whisper female', 'Clara')).toBe('af_nicole');
        expect(mapCharacterToAudioCppVoice('bright energetic woman', 'Clara')).toBe('demo_4_woman');

        const id = resolveSpeakerVoiceIdentity('Elena Vance', story, { backend: 'hybrid' });
        expect(id.normalizedSpk).toBe('Dr. Elena Vance');
        expect(
            isMasterVoiceRecordMatching(
                {
                    refPath: 'C:\\voices\\elena.wav',
                    promptInstruction: id.promptInstruction,
                    seed: id.baseSeed,
                    referenceText: id.expectedReferenceText,
                    signatureHash: id.sigHash
                },
                id
            )
        ).toBe(true);

        const sceneSig = computeSceneVoiceSignatureHash('Narrator: Fog rolled in.\n\nElena Vance: Look out.', story);
        expect(sceneSig.length).toBeGreaterThan(0);

        expect(getHumanReadableTtsError(new Error('Failed to fetch'), 'audiocpp').type).toBe('LOCAL_SERVER_OFFLINE');
        expect(computeSceneProseHash('Scene prose')).toBe(computeSceneProseHash('Scene prose'));
    });

    it('plans deduplicated sequence/story audio export and classifies complete vs missing_in_structure vs incomplete', () => {
        const blobA = new Blob(['a'], { type: 'audio/wav' });
        const blobB = new Blob(['b'], { type: 'audio/wav' });
        const story = {
            sequences: [{ number: 1, title: 'Sequence 1: Start' }, { number: 2, title: 'Next' }],
            scenes: {
                '0': [{ title: '1.1' }, { title: '1.2' }],
                '1': [{ title: '2.1' }]
            }
        };

        const seqPlan = resolveSequenceAudioPlan(
            story,
            0,
            [{ seqIdx: 0, sceneIdx: 0, blob: blobA }],
            { seqIdx: 0, blob: blobB, includedSceneIndices: [0, 1] }
        );
        expect(seqPlan.usedSequenceRecord).toBe(true);
        expect(seqPlan.items).toHaveLength(1);
        expect(seqPlan.status).toBe('complete');

        const completePlan = buildStoryAudioExportPlan(
            story,
            [
                { seqIdx: 0, sceneIdx: 0, blob: blobA },
                { seqIdx: 0, sceneIdx: 1, blob: blobB },
                { seqIdx: 1, sceneIdx: 0, blob: blobA }
            ],
            []
        );
        expect(completePlan.status).toBe('complete');
        expect(completePlan.items).toHaveLength(3);

        const incompletePlan = buildStoryAudioExportPlan(
            story,
            [{ seqIdx: 0, sceneIdx: 0, blob: blobA }],
            []
        );
        expect(incompletePlan.status).toBe('incomplete');

        const gapPlan = buildStoryAudioExportPlan(
            story,
            [{ seqIdx: 1, sceneIdx: 0, blob: blobA }],
            []
        );
        expect(gapPlan.status).toBe('missing_in_structure');
    });
});

describe('Audio Domain: DSP & WAV encoding', () => {
    it('detects pitch, clipping, LUFS leveling, ASR WER/truncation/leaks, chunk bisection, and RIFF WAV headers', async () => {
        expect(studioTargetF0Band('deep baritone adult male').label).toBe('baritone_adult_male');
        expect(normalizeDirectionKey('[Softly, Calm voice]')).toBe('calm_softly_voice');
        expect(computeRmsDb(new Float32Array(0))).toBe(-100);

        const sr = 16000;
        const n = 4096;
        const sine200 = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            sine200[i] = 0.25 * Math.sin((2 * Math.PI * 200 * i) / sr);
        }
        const analyzed = analyzeAudioPcmData(sine200, sr);
        expect(analyzed.medianF0).toBeGreaterThan(190);
        expect(analyzed.medianF0).toBeLessThan(210);
        expect(analyzed.isClipping).toBe(false);

        const clipped = new Float32Array([0.5, 1.0, -0.5]);
        expect(analyzeAudioPcmData(clipped, sr).isClipping).toBe(true);

        expect(computeWordErrorRate('the quick brown fox', 'the quick red fox')).toBe(0.25);
        expect(
            checkBoundaryTruncation(
                'one two three four five six seven eight',
                'one two three four five six seven eight'
            )
        ).toBe(true);
        expect(detectMetaWordLeakage('hello world', 'hello sigh world')).toEqual(['sigh']);

        const quality = verifyChunkQuality({
            expectedText: 'one two three four five six',
            transcriptText: 'one two three four five six',
            durationSec: 2.3,
            wordCount: 6,
            rmsDb: -18,
            speechRatio: 0.9
        });
        expect(quality.valid).toBe(true);

        const bisected = bisectChunk({
            id: 'c1',
            turns: [{ text: 'A' }, { text: 'B' }, { text: 'C' }]
        });
        expect(bisected).not.toBeNull();
        expect(bisected?.[0].turns).toHaveLength(1);
        expect(bisected?.[1].turns).toHaveLength(2);

        const pink = generatePinkNoiseRoomTone(512, -55);
        expect(pink).toHaveLength(512);
        applyHighPass75Hz(sine200, sr);
        applyRaisedCosineFades(sine200, sr, 10);
        levelSamplesToLufs(sine200, sr, -18.0, -1.5);
        expect(measureIntegratedLufs(sine200, sr)).toBeGreaterThan(-30);

        const wavSamples = new Float32Array([0, 0.5, -0.5, 0.25]);
        const blob = encodeFloat32PcmToWavBlob(wavSamples, 24000);
        expect(blob.type).toBe('audio/wav');
        expect(blob.size).toBe(44 + wavSamples.length * 2);

        const buf = await blob.arrayBuffer();
        const view = new DataView(buf);
        const tag = (off: number) =>
            String.fromCharCode(
                view.getUint8(off),
                view.getUint8(off + 1),
                view.getUint8(off + 2),
                view.getUint8(off + 3)
            );
        expect(tag(0)).toBe('RIFF');
        expect(view.getUint32(4, true)).toBe(36 + wavSamples.length * 2);
        expect(tag(8)).toBe('WAVE');
        expect(tag(12)).toBe('fmt ');
        expect(view.getUint16(20, true)).toBe(1);
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(24000);
        expect(view.getUint16(34, true)).toBe(16);
        expect(tag(36)).toBe('data');
        expect(view.getUint32(40, true)).toBe(wavSamples.length * 2);
    });
});
