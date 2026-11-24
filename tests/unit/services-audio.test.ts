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
    buildWave2ActivateBody,
    clearKokoroModelCache,
    decodeWavBlobDirect,
    encodeFloat32PcmToMp3Blob,
    enqueueAudioCppTask,
    ensureAudioDramaVoicesRegistered,
    ensureMp3AudioBlob,
    isAudioCppQueueBusy,
    liveAudioCppWaveState,
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
});
