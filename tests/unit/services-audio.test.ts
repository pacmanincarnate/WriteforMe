import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    encodeFloat32PcmToWavBlob,
    type AudioStoryLike,
    type MasterVoiceRecordLike
} from '@/domain/audio';
import {
    activateAudioCppWave,
    base64AudioToBlob,
    blobToBase64,
    buildDrama3Payload,
    buildDrama3RequestAudit,
    buildWave2ActivateBody,
    clearKokoroModelCache,
    decodeWavBlobDirect,
    encodeFloat32PcmToMp3Blob,
    enqueueAudioCppTask,
    ensureAudioDramaVoicesRegistered,
    ensureMp3AudioBlob,
    formatDrama3RequestAuditText,
    isAudioCppQueueBusy,
    liveAudioCppWaveState,
    logDrama3RequestDispatch,
    resetAudioCppStateForTests,
    StudioPipeline,
    synthesizeAudioDramaChunk,
    toDrama3HttpBody
} from '@/services/audio';

function buildSineWavePcm(durationSec = 0.25, sampleRate = 24000, freqHz = 440): Float32Array {
    const count = Math.round(durationSec * sampleRate);
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = 0.25 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
    }
    return out;
}

describe('services/audio', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetAudioCppStateForTests();
    });

    it('round-trips Float32Array PCM through encodeFloat32PcmToWavBlob and decodeWavBlobDirect', async () => {
        const samples = buildSineWavePcm(0.2, 24000, 330);
        const wavBlob = encodeFloat32PcmToWavBlob(samples, 24000);
        expect(wavBlob.type).toBe('audio/wav');
        expect(wavBlob.size).toBeGreaterThan(44);

        const decoded = await decodeWavBlobDirect(wavBlob);
        expect(decoded.sampleRate).toBe(24000);
        expect(decoded.samples.length).toBe(samples.length);
        // 16-bit PCM quantization preserves waveform closely
        let maxDiff = 0;
        for (let i = 0; i < samples.length; i++) {
            const diff = Math.abs(decoded.samples[i] - samples[i]);
            if (diff > maxDiff) maxDiff = diff;
        }
        expect(maxDiff).toBeLessThan(0.001);
    });

    it('round-trips binary payloads through blobToBase64 and base64AudioToBlob', async () => {
        const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 250, 255]);
        const original = new Blob([bytes], { type: 'audio/wav' });
        const b64 = await blobToBase64(original);
        expect(typeof b64).toBe('string');
        expect(b64.length).toBeGreaterThan(0);

        const restored = base64AudioToBlob(b64, 'audio/mpeg');
        expect(restored.type).toBe('audio/mpeg');
        const restoredBytes = new Uint8Array(await restored.arrayBuffer());
        expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
    });

    it('encodes Float32 PCM to MP3 and converts WAV blobs via ensureMp3AudioBlob', async () => {
        const samples = buildSineWavePcm(0.35, 22050, 440);
        const mp3Blob = await encodeFloat32PcmToMp3Blob(samples, 22050, 128);
        expect(mp3Blob.type).toBe('audio/mpeg');
        expect(mp3Blob.size).toBeGreaterThan(500);

        const wavBlob = encodeFloat32PcmToWavBlob(samples, 22050);
        const converted = await ensureMp3AudioBlob(wavBlob, 128);
        expect(converted.type).toBe('audio/mpeg');
        expect(converted.size).toBeGreaterThan(500);

        // Already MP3 should pass through unchanged
        const passthrough = await ensureMp3AudioBlob(converted, 128);
        expect(passthrough).toBe(converted);
    });

    it('serializes AudioCPP queue tasks and builds/activates Wave 2 payloads', async () => {
        const body = buildWave2ActivateBody({
            dramaOffloadProfile: 'resident_hybrid',
            dramaCodecBackend: 'cpu',
            dramaContextLength: 99999,
            dramaCpuExpertLayers: 12,
            dramaExpertCacheSize: 64,
            dramaThreads: 8
        });
        expect(body).toEqual({
            offloadProfile: 'resident_hybrid',
            runMode: 'streaming',
            codecBackend: 'cpu',
            contextLength: 32768,
            cpuExpertLayers: 12,
            expertCacheSize: 64,
            threads: 8
        });

        const order: number[] = [];
        expect(isAudioCppQueueBusy()).toBe(false);

        const p1 = enqueueAudioCppTask(async () => {
            expect(isAudioCppQueueBusy()).toBe(true);
            order.push(1);
            await Promise.resolve();
            return 'first';
        });
        const p2 = enqueueAudioCppTask(async () => {
            order.push(2);
            return 'second';
        });

        await expect(Promise.all([p1, p2])).resolves.toEqual(['first', 'second']);
        expect(order).toEqual([1, 2]);
        expect(isAudioCppQueueBusy()).toBe(false);

        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({ ok: true, activeWave: 2, dramaModelId: 'fish-drama-3' }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const activated = await activateAudioCppWave(
            'http://127.0.0.1:8787',
            2,
            null,
            5000,
            { dramaOffloadProfile: 'auto' }
        );
        expect(activated).toBe(true);
        expect(liveAudioCppWaveState.activeWave).toBe(2);
        expect(liveAudioCppWaveState.wave2Sig).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Identical Wave 2 settings should hit cached active state without refetching
        const cached = await activateAudioCppWave(
            'http://127.0.0.1:8787',
            2,
            null,
            5000,
            { dramaOffloadProfile: 'auto' }
        );
        expect(cached).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        resetAudioCppStateForTests();
        expect(liveAudioCppWaveState.activeWave).toBe(0);
        expect(liveAudioCppWaveState.wave2Sig).toBeNull();
    });

    it('builds Drama-3 cloning payloads with speaker anchors and strips metadata in HTTP body', () => {
        const anchors = new Map<string, MasterVoiceRecordLike>([
            [
                'Narrator_master',
                {
                    refPath: 'C:\\voices\\narrator_master.wav',
                    referenceText: 'The rain in Spain stays mainly in the plain.'
                }
            ],
            [
                'Elena_master',
                {
                    refPath: '/voices/elena_master.wav',
                    referenceText: 'We move before dawn.'
                }
            ]
        ]);

        const payload = buildDrama3Payload(
            {
                baseSeed: 100,
                turns: [
                    { speaker: 'Narrator', spokenText: 'Rain tapped the window.' },
                    { speaker: 'Elena', spokenText: 'Time to go.' },
                    { speaker: 'Elena', spokenText: 'Stay quiet.' }
                ]
            },
            anchors,
            { dramaModelId: 'fish-drama-3', dramaAudioTemperature: 0.85 },
            1
        );

        expect(payload.task).toBe('clon');
        expect(payload.all_refs_valid).toBe(true);
        expect(payload.missing_ref_speakers).toEqual([]);
        expect(payload.speaker_slots).toEqual(['Narrator', 'Elena']);
        expect(payload.references_meta).toEqual([
            {
                text: '<|speaker:0|> The rain in Spain stays mainly in the plain.',
                audio_path: 'C:/voices/narrator_master.wav'
            },
            {
                text: '<|speaker:1|> We move before dawn.',
                audio_path: '/voices/elena_master.wav'
            }
        ]);
        expect(payload.input).toContain('<|speaker:0|> Rain tapped the window.');
        expect(payload.input).toContain('<|speaker:1|> Time to go. Stay quiet.');
        expect(payload.seed).toBe(201);

        const httpBody = toDrama3HttpBody(payload);
        expect('speaker_slots' in httpBody).toBe(false);
        expect('references_meta' in httpBody).toBe(false);
        expect('missing_ref_speakers' in httpBody).toBe(false);
        expect('all_refs_valid' in httpBody).toBe(false);
        expect(httpBody.task).toBe('clon');
        expect(httpBody.options.references).toBeTypeOf('string');

        // Missing reference for multi-speaker should degrade cleanly to tts
        const partialPayload = buildDrama3Payload(
            {
                turns: [
                    { speaker: 'Narrator', spokenText: 'One line.' },
                    { speaker: 'Stranger', spokenText: 'Another line.' }
                ]
            },
            anchors
        );
        expect(partialPayload.all_refs_valid).toBe(false);
        expect(partialPayload.missing_ref_speakers).toEqual(['Stranger']);
        expect(partialPayload.task).toBe('tts');

        // Pins Narrator to <|speaker:0|> even when another character speaks first,
        // keeps character-only chunks dense at 0, deduplicates aliases, skips empty turns,
        // and defaults to developer-recommended temperature 1.0, top_p 0.9, top_k 30.
        const aliasAnchors = new Map<string, MasterVoiceRecordLike>([
            [
                'Narrator_master',
                {
                    speakerKey: 'Narrator',
                    refPath: 'C:\\voices\\narrator_master.wav',
                    referenceText: 'The rain in Spain stays mainly in the plain.'
                }
            ],
            [
                'Oskar Crump_master',
                {
                    speakerKey: 'Oskar Crump',
                    refPath: 'C:/voices/oskar_master.wav',
                    referenceText: 'I manage the dockyard ledgers before sunrise every morning.'
                }
            ],
            [
                'Crump_master',
                {
                    speakerKey: 'Oskar Crump',
                    refPath: 'C:/voices/oskar_master.wav',
                    referenceText: 'I manage the dockyard ledgers before sunrise every morning.'
                }
            ]
        ]);
        const pinnedPayload = buildDrama3Payload(
            {
                baseSeed: 50,
                turns: [
                    { speaker: 'EmptyGhost', spokenText: '   ' },
                    { speaker: 'Oskar Crump', spokenText: 'Sign the manifest.' },
                    { speaker: 'Narrator', spokenText: 'Thunder rolled across the pier.' },
                    { speaker: 'Crump', spokenText: 'Now.' }
                ]
            },
            aliasAnchors
        );
        expect(pinnedPayload.speaker_slots).toEqual(['Narrator', 'Oskar Crump']);
        expect(pinnedPayload.references_meta).toHaveLength(2);
        expect(pinnedPayload.input).toContain('<|speaker:1|> Sign the manifest.');
        expect(pinnedPayload.input).toContain('<|speaker:0|> Thunder rolled across the pier.');
        expect(pinnedPayload.input).toContain('<|speaker:1|> Now.');
        expect(pinnedPayload.temperature).toBe(1.0);
        expect(pinnedPayload.top_p).toBe(0.9);
        expect(pinnedPayload.top_k).toBe(30);

        const charOnlyPayload = buildDrama3Payload(
            {
                turns: [
                    { speaker: 'Oskar Crump', spokenText: 'Check the locks.' },
                    { speaker: 'Elena', spokenText: 'Already bolted.' }
                ]
            },
            new Map([...aliasAnchors, ...anchors])
        );
        expect(charOnlyPayload.speaker_slots).toEqual(['Oskar Crump', 'Elena']);
        expect(charOnlyPayload.input).toContain('<|speaker:0|> Check the locks.');
        expect(charOnlyPayload.input).toContain('<|speaker:1|> Already bolted.');
    });

    it('registers missing Narrator/unlisted speakers non-destructively while preserving user-edited cadence', () => {
        const baseStory: AudioStoryLike = {
            id: 'story-audio-1',
            title: 'Glass Harbor',
            genre: 'Noir Mystery',
            tone: 'Moody',
            cast: [
                {
                    id: 'c-hero',
                    name: 'Mara',
                    role: 'Protagonist',
                    vocal_cadence: 'Custom user voice cadence, low raspy alto, deliberate.',
                    user_edited_cadence: true
                }
            ]
        };

        const updated = ensureAudioDramaVoicesRegistered(
            [
                { speaker: 'Narrator', spokenText: 'Fog rolled off the pier.' },
                { speaker: 'Mara', spokenText: 'Watch the waterline.' },
                { speaker: 'Detective Vance', spokenText: 'No one leaves tonight.', emotion: 'grim' }
            ],
            baseStory
        );

        expect(updated.narrator_vocal_cadence).toBeTruthy();
        expect(typeof updated.narrator_voice_seed).toBe('number');
        expect(updated.cast?.length).toBe(2);
        const mara = updated.cast?.find((c) => c.name === 'Mara');
        expect(mara?.vocal_cadence).toBe('Custom user voice cadence, low raspy alto, deliberate.');
        const vance = updated.cast?.find((c) => c.name === 'Detective Vance');
        expect(vance).toBeTruthy();
        expect(typeof (vance as Record<string, unknown> | undefined)?.vocal_cadence).toBe('string');

        // Auto-heals contradictory non-user-edited cadence and upgrades stale unedited reference_text
        const contradictionStory: AudioStoryLike = {
            id: 'story-audio-heal',
            title: 'Harbor Night',
            cast: [
                {
                    id: 'c-marisol',
                    name: 'Marisol',
                    gender: 'female',
                    age: '27',
                    vocal_cadence: 'A young adult female voice, late twenties, deep baritone.',
                    reference_text:
                        'Marisol adjusts her scarf and eyes the interviewer from across the noisy cafe table.',
                    details: {
                        deep_profile:
                            'Marisol adjusts her scarf and eyes the interviewer. "I still remember how the brass clock sounded at midnight when every trawler left the cove without turning on a single lantern." "Nobody in Harbor Town trusted a calm sea before dawn, and we always kept extra oars beneath the cedar floorboards in case the foghorn failed."'
                    }
                }
            ]
        };
        const healed = ensureAudioDramaVoicesRegistered(
            [{ speaker: 'Marisol', spokenText: 'We leave at high tide.' }],
            contradictionStory
        );
        const healedMarisol = healed.cast?.find((c) => c.name === 'Marisol');
        expect(healedMarisol?.vocal_cadence).not.toMatch(/\bbaritone\b/i);
        expect(healedMarisol?.reference_text).toContain('I still remember how the brass clock sounded');
        expect(healedMarisol?.reference_text).not.toContain('adjusts her scarf');
    });

    it('clears Kokoro/ONNX caches from CacheStorage while keeping unrelated caches', async () => {
        const deletedKeys: string[] = [];
        const mockCaches = {
            keys: vi.fn(async () => [
                'transformers-cache',
                'kokoro-v1',
                'onnx-wasm',
                'huggingface-hub',
                'app-static-v1'
            ]),
            delete: vi.fn(async (name: string) => {
                deletedKeys.push(name);
                return true;
            })
        };
        vi.stubGlobal('caches', mockCaches);

        const count = await clearKokoroModelCache();
        expect(count).toBe(4);
        expect(deletedKeys).toEqual([
            'transformers-cache',
            'kokoro-v1',
            'onnx-wasm',
            'huggingface-hub'
        ]);
    });

    it('routes synthesizeAudioDramaChunk across OpenRouter, Gemini, and validates backend errors', async () => {
        const wavBlob = encodeFloat32PcmToWavBlob(buildSineWavePcm(0.15, 22050, 220), 22050);
        const wavB64 = await blobToBase64(wavBlob);

        vi.stubGlobal(
            'AudioContext',
            class FakeAudioContext {
                decodeAudioData = vi.fn(async () => {
                    throw new Error('stubbed decode fallback');
                });
                close = vi.fn(async () => {});
            }
        );

        let objectUrlCounter = 0;
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn(() => `blob:test-audio-${++objectUrlCounter}`),
            revokeObjectURL: vi.fn()
        });

        // Stub fetch for OpenRouter ElevenLabs v4 TTS
        let capturedOpenRouterBody: Record<string, unknown> | null = null;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) => {
                capturedOpenRouterBody = JSON.parse(String(init?.body || '{}')) as Record<
                    string,
                    unknown
                >;
                return new Response(new Uint8Array([255, 251, 144, 0]), {
                    status: 200,
                    headers: { 'Content-Type': 'audio/mpeg' }
                });
            })
        );

        const orUrl = await synthesizeAudioDramaChunk({
            chunk: {
                speaker: 'Elena',
                spokenText: 'Keep your voice down.',
                emotion: '(whispering)'
            },
            backend: 'openrouter',
            mainOpenRouterKey: 'or-key-test',
            settings: { openRouterModel: 'elevenlabs/eleven-v4' }
        });
        expect(orUrl).toBe('blob:test-audio-1');
        expect(capturedOpenRouterBody?.['input']).toBe('[whispering] Keep your voice down.');

        // Stub fetch for Gemini Interactions audio payload
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ output_audio: { data: wavB64 } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );

        const geminiUrl = await synthesizeAudioDramaChunk({
            chunk: {
                speaker: 'Narrator',
                spokenText: 'The clock struck midnight.',
                emotion: 'tense'
            },
            backend: 'gemini',
            mainApiKey: 'gemini-key-test'
        });
        expect(geminiUrl).toBe('blob:test-audio-2');

        await expect(
            synthesizeAudioDramaChunk({
                chunk: { speaker: 'Narrator', spokenText: 'Hello' },
                backend: 'system'
            })
        ).rejects.toThrow(/System Voices use device speech synthesis/i);

        await expect(
            synthesizeAudioDramaChunk({
                chunk: { speaker: 'Narrator', spokenText: 'Hello' },
                backend: 'unknown_backend'
            })
        ).rejects.toThrow(/Unsupported Audio Drama TTS backend/i);
    });

    it('exposes the full StudioPipeline facade methods and constants', () => {
        expect(StudioPipeline.RAIN_SENTENCE).toBeTypeOf('string');
        expect(typeof StudioPipeline.runStudioRenderJob).toBe('function');
        expect(typeof StudioPipeline.buildDrama3Payload).toBe('function');
        expect(typeof StudioPipeline.toDrama3HttpBody).toBe('function');
        expect(typeof StudioPipeline.stitchAudioBlobsWithPause).toBe('function');
        expect(typeof StudioPipeline.decodeWavBlobDirect).toBe('function');
        expect(typeof StudioPipeline.encodeFloat32PcmToWavBlob).toBe('function');
        expect(typeof StudioPipeline.buildWave2ActivateBody).toBe('function');
        expect(Object.keys(StudioPipeline).length).toBeGreaterThanOrEqual(50);
    });

    it('builds, formats, and logs full untruncated Drama-3 request audits including missing-ref warnings', () => {
        const anchors = new Map<string, MasterVoiceRecordLike>([
            [
                'Narrator_master',
                {
                    speakerKey: 'NARRATOR',
                    uploadKey: 'story_1_NARRATOR_master_abc',
                    refPath: 'C:\\voices\\narrator_master.wav',
                    referenceText: 'A steady evening breeze drifted.',
                    seed: 101,
                    signatureHash: 'abc',
                    promptInstruction: 'Warm baritone narrator.'
                }
            ],
            [
                'Elena_master',
                {
                    speakerKey: 'Elena',
                    uploadKey: 'story_1_Elena_master_def',
                    refPath: '/voices/elena_master.wav',
                    referenceText: 'We move before dawn.',
                    seed: 202,
                    signatureHash: 'def',
                    promptInstruction: 'Crisp alto.'
                }
            ]
        ]);

        const longDialogue = 'Word '.repeat(120).trim() + ' — check untruncated payload.';
        const dramaPayload = buildDrama3Payload(
            {
                baseSeed: 77,
                turns: [
                    { speaker: 'Narrator', spokenText: 'Rain tapped the window.' },
                    { speaker: 'Elena', spokenText: longDialogue }
                ]
            },
            anchors,
            { dramaModelId: 'drama-3', dramaAudioTemperature: 0.85 },
            0
        );
        const wireBody = toDrama3HttpBody(dramaPayload);

        const audit = buildDrama3RequestAudit({
            source: 'studio_render',
            route: 'bridge',
            endpoint: 'http://127.0.0.1:5020/v1/audio/speech',
            chunk: {
                chunkId: 'chunk_000',
                seqIdx: 0,
                sceneIdx: 1,
                splitReason: 'narrator_boundary',
                wordCount: 130,
                estimatedDurationSec: 65
            },
            chunkIndex: 0,
            totalChunks: 2,
            attempt: 1,
            dramaPayload,
            wireBody: wireBody as Record<string, unknown>,
            anchorsMap: anchors
        });

        expect(audit.speakerSlots).toHaveLength(2);
        expect(audit.speakerSlots[0]).toMatchObject({
            slot: 0,
            tag: '<|speaker:0|>',
            speaker: 'Narrator',
            audioPath: 'C:/voices/narrator_master.wav',
            referenceText: '<|speaker:0|> A steady evening breeze drifted.',
            promptInstruction: 'Warm baritone narrator.'
        });
        expect(audit.speakerSlots[1]).toMatchObject({
            slot: 1,
            tag: '<|speaker:1|>',
            speaker: 'Elena',
            audioPath: '/voices/elena_master.wav',
            referenceText: '<|speaker:1|> We move before dawn.',
            promptInstruction: 'Crisp alto.'
        });

        const text = formatDrama3RequestAuditText(audit);
        expect(text).toContain('Scene:       Scene 1.2');
        expect(text).toContain('<|speaker:0|> | Script Speaker: Narrator');
        expect(text).toContain('Audio Path:   C:/voices/narrator_master.wav');
        expect(text).toContain('<|speaker:1|> | Script Speaker: Elena');
        expect(text).toContain(longDialogue);
        expect(text).toContain('=== EXACT WIRE HTTP POST BODY (JSON) ===');
        expect(text).toContain('"model": "drama-3"');

        const stageStartSpy = vi.fn();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        (window as unknown as Record<string, unknown>).logAudioDramaPipelineStageStart = stageStartSpy;
        try {
            logDrama3RequestDispatch({
                source: 'studio_render',
                route: 'bridge',
                endpoint: 'http://127.0.0.1:5020/v1/audio/speech',
                chunk: {
                    chunkId: 'chunk_000',
                    seqIdx: 0,
                    sceneIdx: 1,
                    splitReason: 'narrator_boundary',
                    wordCount: 130,
                    estimatedDurationSec: 65
                },
                chunkIndex: 0,
                totalChunks: 2,
                attempt: 1,
                dramaPayload,
                wireBody: wireBody as Record<string, unknown>,
                anchorsMap: anchors
            });
            expect(consoleSpy).toHaveBeenCalledTimes(1);
            expect(stageStartSpy).toHaveBeenCalledTimes(1);
            const [stageKey, stageTitle, details, meta] = stageStartSpy.mock.calls[0] as [
                string,
                string,
                Record<string, unknown>,
                Record<string, unknown>
            ];
            expect(stageKey).toBe('drama3_request');
            expect(stageTitle).toContain('Segment 1/2 (Narrator, Elena)');
            expect(details.input).toContain(longDialogue);
            const stripTs = (s: string) => s.replace(/^Timestamp:.*$/m, 'Timestamp: <ts>');
            expect(stripTs(String(meta.formattedPrompt))).toBe(stripTs(text));
            expect(meta.modelUsed).toBe('drama-3');
            expect(meta.provider).toBe('audio.cpp');
        } finally {
            delete (window as unknown as Record<string, unknown>).logAudioDramaPipelineStageStart;
        }

        const missingPayload = buildDrama3Payload(
            {
                turns: [
                    { speaker: 'Narrator', spokenText: 'One.' },
                    { speaker: 'Stranger', spokenText: 'Two.' }
                ]
            },
            anchors
        );
        const missingAudit = buildDrama3RequestAudit({
            source: 'live_reader',
            route: 'bridge',
            endpoint: 'http://127.0.0.1:5020/v1/audio/speech',
            wireBody: toDrama3HttpBody(missingPayload) as Record<string, unknown>,
            dramaPayload: missingPayload,
            anchorsMap: anchors
        });
        expect(formatDrama3RequestAuditText(missingAudit)).toContain(
            'WARNING: Missing voice reference(s) for [Stranger]'
        );
    });

    it('logs Drama-3 request payload before POSTing multi-speaker chunk in synthesizeAudioDramaChunk', async () => {
        const validWavBlob = encodeFloat32PcmToWavBlob(buildSineWavePcm(0.2, 44100, 330), 44100);
        const validWavBytes = new Uint8Array(await validWavBlob.arrayBuffer());
        const callOrder: string[] = [];
        const stageStartCalls: Array<{
            stageKey: string;
            stageTitle: string;
            details: Record<string, unknown>;
            meta: Record<string, unknown>;
        }> = [];

        (window as unknown as Record<string, unknown>).logAudioDramaPipelineStageStart = vi.fn(
            (
                stageKey: string,
                stageTitle: string,
                details: Record<string, unknown>,
                meta: Record<string, unknown>
            ) => {
                stageStartCalls.push({ stageKey, stageTitle, details, meta });
                if (stageKey === 'drama3_request') {
                    callOrder.push('log_drama3_request');
                }
            }
        );

        vi.stubGlobal(
            'URL',
            {
                ...URL,
                createObjectURL: vi.fn(() => 'blob:drama3-segment-ok'),
                revokeObjectURL: vi.fn()
            }
        );

        vi.stubGlobal(
            'fetch',
            vi.fn(async (inputUrl: string | URL, init?: RequestInit) => {
                const url = String(inputUrl);
                const method = String(init?.method || 'GET').toUpperCase();
                if (url.includes('/wave/')) {
                    return new Response(JSON.stringify({ status: 'ok' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                if (url.endsWith('/v1/models')) {
                    return new Response(JSON.stringify({ data: [{ id: 'drama-3' }] }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                if (url.includes('/voices/') && method === 'HEAD') {
                    return new Response(null, { status: 404 });
                }
                if (url.includes('/voices/') && method === 'PUT') {
                    const key = decodeURIComponent(url.split('/voices/')[1] || 'voice');
                    return new Response(
                        JSON.stringify({ status: 'ok', key, refPath: `C:/voices/${key}.wav` }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                if (url.endsWith('/v1/audio/speech')) {
                    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
                    if (/drama/i.test(String(body.model || ''))) {
                        callOrder.push('fetch_drama3_speech');
                    }
                    return new Response(validWavBytes, {
                        status: 200,
                        headers: { 'Content-Type': 'audio/wav' }
                    });
                }
                return new Response('{}', { status: 200 });
            })
        );

        try {
            const url = await synthesizeAudioDramaChunk({
                backend: 'audiocpp',
                story: {
                    id: 'story-d3-test',
                    title: 'Drama Test',
                    cast: [{ id: 'c1', name: 'Elena', role: 'Lead' }]
                },
                settings: {
                    backend: 'audiocpp',
                    dramaModelId: 'drama-3',
                    studioBridgeUrl: 'http://127.0.0.1:5020',
                    audioCppUrl: 'http://127.0.0.1:8080',
                    bypassCache: true
                },
                chunk: {
                    chunkId: 'chunk_000',
                    engine: 'drama3_multi',
                    wordCount: 8,
                    estimatedDurationSec: 5,
                    turns: [
                        { speaker: 'Narrator', spokenText: 'Lightning cracked.' },
                        { speaker: 'Elena', spokenText: 'Keep moving.' }
                    ]
                }
            });

            expect(url).toBe('blob:drama3-segment-ok');
            expect(callOrder).toEqual(['log_drama3_request', 'fetch_drama3_speech']);
            const drama3Log = stageStartCalls.find((c) => c.stageKey === 'drama3_request');
            expect(drama3Log).toBeDefined();
            expect(String(drama3Log?.details?.input)).toContain('<|speaker:0|> Lightning cracked.');
            expect(String(drama3Log?.details?.input)).toContain('<|speaker:1|> Keep moving.');
            const refs = drama3Log?.details?.references as Array<{ audio_path?: string }>;
            expect(refs).toHaveLength(2);
            expect(refs[0]?.audio_path).toContain('NARRATOR_master');
            expect(refs[1]?.audio_path).toContain('Elena_master');
            expect(String(drama3Log?.meta?.formattedPrompt)).toContain('C:/voices/');
        } finally {
            delete (window as unknown as Record<string, unknown>).logAudioDramaPipelineStageStart;
        }
    });
});
