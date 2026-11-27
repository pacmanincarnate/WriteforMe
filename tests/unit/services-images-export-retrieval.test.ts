import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import { GraphManager } from '@/domain/lore';
import { calculateStoryStats } from '@/domain/story';
import { ensureJSZip } from '@/services/documents';
import {
    buildAudioDramaTxtScript,
    buildStoryEpubBlob,
    parseStoryImportFile,
    persistImportedStory
} from '@/services/export';
import {
    buildComfyKrea2Workflow,
    cleanImagePrompt,
    comfyAspectToSize,
    generateImage,
    pickComfyDefault
} from '@/services/images';
import { retrieveLoreContext, searchLoreLexical } from '@/services/rag';
import { imageStore, storyStore, type SceneAudioRecord } from '@/services/storage';

const SAMPLE_TINY_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

describe('Phase 5A: domain templates/stats, image API, export/import, and RAG retrieval', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('creates default story templates with epistemic graph and generation ranges', () => {
        const def = createDefaultStoryTemplate();
        expect(def.id).toBe('story_default');
        expect(def.title).toBe('Untitled Story');
        expect(def.epistemic_graph.entities.meta_reader.id).toBe('meta_reader');
        expect(def.generation_ranges.scenes_per_sequence).toEqual({
            min: 3,
            max: 10,
            justification: 'Calibrated for Popular novel format (80,000 words).'
        });

        const custom = createDefaultStoryTemplate('story_custom_42');
        expect(custom.id).toBe('story_custom_42');
    });

    it('calculates story stats accurately including null guard, words, and legacy chapters fallback', () => {
        const emptyStats = calculateStoryStats(null);
        expect(emptyStats.words).toBe(0);
        expect(emptyStats.totalScenes).toBe(0);

        const stats = calculateStoryStats({
            acts: [{ number: 1, title: 'Act I' }],
            sequences: [{ number: 1, title: 'Opening', parent_act: 1 }],
            scenes: {
                '0': [
                    { title: 'Scene 1' },
                    { title: 'Scene 2' }
                ]
            },
            prose: {
                '0-0': { final: 'One two three four five.' },
                '0-1': { draft: 'Six seven eight.' }
            },
            cast: Array.from({ length: 7 }, (_, i) => ({ name: `Char ${i + 1}` })),
            lore: [{ topic: 'City', detail: 'Ancient' }]
        });

        expect(stats.words).toBe(8);
        expect(stats.readingTimeMin).toBe(1);
        expect(stats.completedScenes).toBe(1);
        expect(stats.draftedScenes).toBe(1);
        expect(stats.totalScenes).toBe(2);
        expect(stats.completionPct).toBe(50);
        expect(stats.castCount).toBe(7);
        expect(stats.castAvatars).toHaveLength(5);
        expect(stats.loreCount).toBe(1);
        expect(stats.sequencesStatus[0]?.hasProgress).toBe(true);
        expect(stats.sequencesStatus[0]?.isComplete).toBe(false);

        const legacyStats = calculateStoryStats({
            chapters: { '0': [{}, {}, {}] },
            scenes: {}
        });
        expect(legacyStats.totalScenes).toBe(3);
    });

    it('cleans image prompts, maps ComfyUI aspect ratios, builds Krea2 workflows, and picks defaults', () => {
        expect(cleanImagePrompt('<response><image_prompt>  Misty lighthouse  </image_prompt></response>')).toBe(
            'Misty lighthouse'
        );
        expect(cleanImagePrompt('<note>Red clover</note>')).toBe('Red clover');

        expect(comfyAspectToSize('16:9')).toEqual({ width: 1344, height: 768 });
        expect(comfyAspectToSize('unknown')).toEqual({ width: 1024, height: 1024 });

        const noLora = buildComfyKrea2Workflow({
            prompt: 'Harbor fog',
            width: 896,
            height: 1152,
            seed: 123,
            unet: 'krea2.safetensors',
            clip: 'qwen.safetensors',
            vae: 'vae.safetensors'
        });
        expect(noLora['15']).toBeUndefined();
        expect(noLora['5'].inputs.model).toEqual(['10', 0]);

        const withLora = buildComfyKrea2Workflow({
            prompt: 'Harbor fog',
            width: 896,
            height: 1152,
            seed: 123,
            unet: 'krea2.safetensors',
            clip: 'qwen.safetensors',
            vae: 'vae.safetensors',
            lora: 'film_grain.safetensors',
            loraStrength: 0.65
        });
        expect(withLora['15']?.class_type).toBe('LoraLoaderModelOnly');
        expect(withLora['5'].inputs.model).toEqual(['15', 0]);

        expect(pickComfyDefault(['foo.safetensors', 'krea2_turbo.safetensors'], [/krea.?2.*turbo/i])).toBe(
            'krea2_turbo.safetensors'
        );
        expect(pickComfyDefault(['alpha', 'beta'], [/gamma/i])).toBe('');
    });

    it('dispatches generateImage across validation errors, Gemini migration/legacy, OpenRouter, and unsupported providers', async () => {
        await expect(
            generateImage('Test prompt', '1:1', { provider: 'gemini', apiKey: '' })
        ).rejects.toThrow('API key for provider "gemini" is not configured');

        await expect(
            generateImage('Test prompt', '1:1', {
                provider: 'comfyui',
                comfy: { unet: '', clip: 'clip', vae: 'vae' }
            })
        ).rejects.toThrow('ComfyUI: choose the Krea 2 diffusion model');

        await expect(
            generateImage('Test prompt', '1:1', { provider: 'unknown_provider', apiKey: 'k' })
        ).rejects.toThrow('Unsupported Image Provider: unknown_provider');

        const migrated = vi.fn();
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('gemini-3.1-flash-image:generateContent')) {
                return new Response(
                    JSON.stringify({
                        candidates: [
                            {
                                content: {
                                    parts: [{ inlineData: { data: 'QUJD', mimeType: 'image/png' } }]
                                }
                            }
                        ]
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (url.includes('imagen-4.0:predict')) {
                return new Response(
                    JSON.stringify({
                        predictions: [{ bytesBase64Encoded: 'WFla', mimeType: 'image/jpeg' }]
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (url === 'https://openrouter.ai/api/v1/images') {
                return new Response(
                    JSON.stringify({
                        data: [
                            {
                                b64_json: SAMPLE_TINY_PNG_DATA_URL.replace('data:image/png;base64,', ''),
                                media_type: 'image/png'
                            }
                        ]
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response(JSON.stringify({ ok: false }), { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const modernResult = await generateImage('Moonlit bay', '3:4', {
            provider: 'gemini',
            model: 'imagen-3.0-generate-002',
            apiKey: 'gem-key',
            onModelMigrated: migrated
        });
        expect(migrated).toHaveBeenCalledWith('gemini-3.1-flash-image');
        expect(modernResult).toBe('data:image/png;base64,QUJD');

        const legacyResult = await generateImage('Sunlit ridge', '16:9', {
            provider: 'gemini',
            model: 'imagen-4.0',
            apiKey: 'gem-key'
        });
        expect(legacyResult).toBe('data:image/jpeg;base64,WFla');

        const orResult = await generateImage('Lantern alley', '1:1', {
            provider: 'openrouter',
            model: 'black-forest-labs/flux',
            fallbackOpenRouterKey: 'or-key'
        });
        expect(orResult).toBe(SAMPLE_TINY_PNG_DATA_URL);
    });

    it('uses OpenRouter /api/v1/images with aspect_ratio, mime sniffing, URL blob conversion, 400 retry, and chat fallback', async () => {
        const tinyPngB64 = SAMPLE_TINY_PNG_DATA_URL.replace('data:image/png;base64,', '');
        const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];

        // 1. Dedicated image model (flux-3-image-klein) -> /api/v1/images with b64_json + media_type
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
                requests.push({ url, body });
                return new Response(
                    JSON.stringify({ data: [{ b64_json: tinyPngB64, media_type: 'image/png' }] }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        const kleinResult = await generateImage('Stormy cliffside lighthouse', '16:9', {
            provider: 'openrouter',
            model: 'black-forest-labs/flux-3-image-klein',
            apiKey: 'or-key'
        });
        expect(kleinResult).toBe(SAMPLE_TINY_PNG_DATA_URL);
        expect(requests[0]).toEqual({
            url: 'https://openrouter.ai/api/v1/images',
            body: {
                model: 'black-forest-labs/flux-3-image-klein',
                prompt: 'Stormy cliffside lighthouse',
                response_format: 'b64_json',
                aspect_ratio: '16:9'
            }
        });

        // 2. Sniffs JPEG MIME type when media_type is omitted
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ data: [{ b64_json: '/9j/AAAA' }] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        const sniffedResult = await generateImage('Sunset ridge', '3:4', {
            provider: 'openrouter',
            model: 'black-forest-labs/flux.2-pro',
            apiKey: 'or-key'
        });
        expect(sniffedResult).toBe('data:image/jpeg;base64,/9j/AAAA');

        // 3. Converts signed URL output to data URL via fetch + FileReader
        const pngBytes = Uint8Array.from(atob(tinyPngB64), (c) => c.charCodeAt(0));
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url === 'https://openrouter.ai/api/v1/images') {
                    return new Response(
                        JSON.stringify({ data: [{ url: 'https://cdn.openrouter.ai/signed/img.png' }] }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                if (url === 'https://cdn.openrouter.ai/signed/img.png') {
                    const res = new Response(pngBytes, {
                        status: 200,
                        headers: { 'Content-Type': 'image/png' }
                    });
                    res.blob = async () => new Blob([pngBytes], { type: 'image/png' });
                    return res;
                }
                return new Response('Not found', { status: 404 });
            })
        );
        const urlConvertedResult = await generateImage('Glass harbor', '1:1', {
            provider: 'openrouter',
            model: 'bytedance-seed/seedream-5-5',
            apiKey: 'or-key'
        });
        expect(urlConvertedResult).toMatch(/^data:image\/png;base64,/);

        // 4. Retries without aspect_ratio when /api/v1/images returns 400 mentioning aspect_ratio
        const retryPayloads: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
                retryPayloads.push(body);
                if (retryPayloads.length === 1) {
                    return new Response(
                        JSON.stringify({ error: { message: 'Unsupported aspect_ratio for model' } }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return new Response(
                    JSON.stringify({ data: [{ b64_json: tinyPngB64, media_type: 'image/png' }] }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        const retryResult = await generateImage('Panoramic valley', '16:9', {
            provider: 'openrouter',
            model: 'tencent/hy-world-2.1-panorama',
            apiKey: 'or-key'
        });
        expect(retryResult).toBe(SAMPLE_TINY_PNG_DATA_URL);
        expect(retryPayloads).toHaveLength(2);
        expect(retryPayloads[0].aspect_ratio).toBe('16:9');
        expect('aspect_ratio' in retryPayloads[1]).toBe(false);

        // 5. Falls back to /chat/completions when /api/v1/images returns 404 mentioning chat/completions
        const fallbackUrls: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                fallbackUrls.push(url);
                if (url === 'https://openrouter.ai/api/v1/images') {
                    return new Response(
                        JSON.stringify({ error: { message: 'Use the chat/completions endpoint instead.' } }),
                        { status: 404, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return new Response(
                    JSON.stringify({
                        choices: [{ message: { images: [{ image_url: { url: SAMPLE_TINY_PNG_DATA_URL } }] } }]
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        const fallbackResult = await generateImage('Clockwork library', '3:4', {
            provider: 'openrouter',
            model: 'custom/chat-only-image-model',
            apiKey: 'or-key'
        });
        expect(fallbackResult).toBe(SAMPLE_TINY_PNG_DATA_URL);
        expect(fallbackUrls).toEqual([
            'https://openrouter.ai/api/v1/images',
            'https://openrouter.ai/api/v1/chat/completions'
        ]);

        // 6. Does NOT retry /chat/completions on unrelated 404 (e.g. invalid model slug)
        const unrelatedUrls: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                unrelatedUrls.push(String(input));
                return new Response(JSON.stringify({ error: { message: 'No endpoints found for model' } }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        await expect(
            generateImage('Missing model', '1:1', {
                provider: 'openrouter',
                model: 'nonexistent/model',
                apiKey: 'or-key'
            })
        ).rejects.toThrow('OpenRouter Image API failed: 404');
        expect(unrelatedUrls).toEqual(['https://openrouter.ai/api/v1/images']);
    });

    it('builds Audio Drama TXT scripts with dramatis personae and fallback prose scan', () => {
        const emptyResult = buildAudioDramaTxtScript({ title: 'Empty Script', acts: [], sequences: [] });
        expect(emptyResult.sceneCount).toBe(0);
        expect(emptyResult.filename).toBe('empty_script_audio_drama.txt');

        const built = buildAudioDramaTxtScript({
            title: 'Harbor Signal',
            concept: 'A lighthouse keeper intercepts a coded broadcast.',
            style: { genre: 'Mystery', mood: 'Tense' },
            cast: [{ name: 'Mara Vance', role: 'Protagonist' }],
            acts: [{ number: 1, title: 'The Signal' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Midnight Watch' }],
            scenes: { '0': [{ number: '1.1', title: 'Static on Band Nine' }] },
            prose: { '0-0': { final: 'Mara Vance: Did you hear that clicking?' } }
        });

        expect(built.sceneCount).toBe(1);
        expect(built.filename).toBe('harbor_signal_audio_drama.txt');
        expect(built.content).toContain('HARBOR SIGNAL - AUDIO DRAMA SCRIPT');
        expect(built.content).toContain('Mara Vance (Protagonist)');
        expect(built.content).toContain('Mara Vance: Did you hear that clicking?');
    });

    it('round-trips EPUB export (cover, portrait, scene art, MP3 audio, Appendix links) and import copy-on-collision', async () => {
        // Ensure disk vault probe resolves quickly offline in unit tests
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 404 }))
        );

        const storyId = `story_epub_${Date.now()}`;
        const story = {
            id: storyId,
            title: 'Glass Meridian',
            concept: 'Navigators chart a vanished sea.',
            cast: [{ id: 'c_elen', name: 'Elen Ward', role: 'Cartographer' }],
            continuity_ledger: [
                {
                    key: 'Astrolabe Key',
                    value: 'Unlocks the brass chart cabinet.',
                    category: 'Object'
                }
            ],
            acts: [{ number: 1, title: 'Departure' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Pier Seven' }],
            scenes: {
                '0': [{ number: '1.1', title: 'Salt and Brass', scene_type: 'Proactive' }]
            },
            beats: { '0-0': [] },
            prose: {
                '0-0': {
                    final: 'Elen Ward placed the Astrolabe Key beside the compass.'
                }
            }
        };

        const audioRecords = new Map<string, SceneAudioRecord>();
        const mockAudioStore = {
            getAllStoryAudioRecords: async (id: string) =>
                Array.from(audioRecords.values()).filter((r) => r.storyId === id),
            saveSceneAudio: async (cfg: {
                storyId: string;
                seqIdx: number;
                sceneIdx: number;
                blob: Blob;
                mimeType?: string;
                durationSec?: number;
                textHash?: string;
                cueCount?: number;
                cueTimeline?: unknown[] | null;
            }) => {
                const rec: SceneAudioRecord = {
                    id: `${cfg.storyId}:${cfg.seqIdx}:${cfg.sceneIdx}`,
                    storyId: cfg.storyId,
                    seqIdx: cfg.seqIdx,
                    sceneIdx: cfg.sceneIdx,
                    blob: cfg.blob,
                    mimeType: cfg.mimeType || 'audio/mpeg',
                    durationSec: cfg.durationSec || 0,
                    textHash: cfg.textHash || '',
                    voiceSigHash: '',
                    cueCount: cfg.cueCount || 0,
                    cueTimeline: cfg.cueTimeline || null,
                    sizeBytes: cfg.blob.size,
                    updatedAt: Date.now()
                };
                audioRecords.set(rec.id, rec);
                return rec;
            },
            getSceneAudio: async (id: string, seqIdx: number, sceneIdx: number) =>
                audioRecords.get(`${id}:${seqIdx}:${sceneIdx}`) || null,
            deleteStoryAudio: async (id: string) => {
                for (const [k, v] of audioRecords.entries()) {
                    if (v.storyId === id) audioRecords.delete(k);
                }
            }
        };

        await imageStore.saveImage(`cover_${storyId}`, SAMPLE_TINY_PNG_DATA_URL);
        await imageStore.saveImage(`portrait_${storyId}_c_elen`, SAMPLE_TINY_PNG_DATA_URL);
        await imageStore.saveImage(`scene_${storyId}_0-0`, SAMPLE_TINY_PNG_DATA_URL);
        await mockAudioStore.saveSceneAudio({
            storyId,
            seqIdx: 0,
            sceneIdx: 0,
            blob: new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x64])], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationSec: 12,
            textHash: 'abc123'
        });

        const epubResult = await buildStoryEpubBlob(story, { imageStore, audioStore: mockAudioStore });
        expect(epubResult.audioCount).toBe(1);
        expect(epubResult.filename).toMatch(/^ellipsisprose_export_Glass_Meridian_/);

        const JSZip = await ensureJSZip();
        const epubBytes = await epubResult.blob.arrayBuffer();
        const loadedZip = await new JSZip().loadAsync(epubBytes);
        expect(await loadedZip.file('mimetype')?.async('text')).toBe('application/epub+zip');
        expect(loadedZip.file('OEBPS/content.opf')).not.toBeNull();
        expect(loadedZip.file('OEBPS/toc.ncx')).not.toBeNull();
        expect(loadedZip.file('OEBPS/Audio/scene_0_0.mp3')).not.toBeNull();
        const embeddedMp3Bytes = new Uint8Array(
            (await loadedZip.file('OEBPS/Audio/scene_0_0.mp3')?.async('arraybuffer')) || new ArrayBuffer(0)
        );
        expect(Array.from(embeddedMp3Bytes)).toEqual([0xff, 0xfb, 0x90, 0x64]);

        const chapHtml = await loadedZip.file('OEBPS/Text/Act_1_Part_1_Chap_1.xhtml')?.async('text');
        expect(chapHtml).toContain('appendix-ref');
        expect(chapHtml).toContain('Appendix.xhtml#char_c_elen');

        const appendixHtml = await loadedZip.file('OEBPS/Text/Appendix.xhtml')?.async('text');
        expect(appendixHtml).toContain('Elen Ward');
        expect(appendixHtml).toContain('Astrolabe Key');

        // Seed existing story ID so import collision asks to copy instead of overwrite
        await storyStore.saveStory(storyId, story as Record<string, unknown>);
        const epubFile = new File([epubBytes], epubResult.filename, {
            type: 'application/epub+zip'
        });
        const parsedPayload = await parseStoryImportFile(epubFile);
        const imported = await persistImportedStory(parsedPayload, {
            confirmOverwrite: async () => false,
            storyStore,
            imageStore,
            audioStore: mockAudioStore
        });

        expect(imported.storyId).not.toBe(storyId);
        expect(String(imported.story.title)).toContain('(Imported ');
        expect(imported.importedAudioCount).toBe(1);
        expect(imported.totalDraftedScenes).toBe(1);
        expect(imported.coverUrl).toBe(SAMPLE_TINY_PNG_DATA_URL);

        const restoredAudio = await mockAudioStore.getSceneAudio(imported.storyId, 0, 0);
        expect(restoredAudio?.blob.size).toBe(4);
    });

    it('ranks lore via BM25 lexical search and augments results via vector fallback and GraphManager', async () => {
        const lore = [
            {
                id: 'l1',
                topic: 'Sunken Lantern',
                detail: 'A brass beacon beneath the breakwater that reveals shoals.',
                related_to: ['Tide Guild'],
                valid_from_act: 1
            },
            {
                id: 'l2',
                topic: 'Tide Guild',
                detail: 'Harbor pilots who maintain the breakwater beacons.',
                valid_from_act: 1
            },
            {
                id: 'l3',
                topic: 'Future Vault',
                detail: 'Restricted Act 3 archive.',
                valid_from_act: 3
            }
        ];

        const filtered = searchLoreLexical('brass beacon Sunken Lantern', lore, {
            filterFn: (meta) => Number(meta.valid_from_act || 1) <= 1,
            limit: 2,
            threshold: 0.05
        });
        expect(filtered[0]?.metadata.topic).toBe('Sunken Lantern');
        expect(filtered.every((item) => item.metadata.topic !== 'Future Vault')).toBe(true);

        const graphManager = new GraphManager();
        graphManager.buildGraph(lore);

        const retrieved = await retrieveLoreContext(
            'Sunken Lantern',
            {
                embeddingService: {
                    isConfigured: () => true,
                    getEmbedding: async () => {
                        throw new Error('embedding offline');
                    }
                },
                vectorStore: {
                    search: async () => []
                },
                graphManager,
                fallbackLoreList: lore
            },
            0.5
        );

        const topics = retrieved.map((r) => r.metadata.topic);
        expect(topics).toContain('Sunken Lantern');
        expect(topics).toContain('Tide Guild');
    });
});
