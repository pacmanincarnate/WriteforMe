/**
 * @module services/audio/kokoro
 * In-browser Kokoro-82M Web Worker factory (with classic-worker fallback on `file:` / iOS)
 * and browser CacheStorage cleanup helper.
 */

import { CDN_URLS, DEFAULT_TTS_MODELS } from '@/config';

export type KokoroWorkerHandle = Worker & {
    _blobUrl?: string;
};

/** Spawns a dedicated Kokoro neural TTS Web Worker backed by an inline Blob script. */
export function createKokoroWorker(): KokoroWorkerHandle {
    const workerCode = [
        'let tts = null;',
        'let currentConfig = null;',
        'let initPromise = null;',
        'let generationQueue = Promise.resolve();',
        'let currentGenerationSessionId = 0;',
        '',
        'self.onmessage = async (e) => {',
        '    const { type, id, payload } = e.data || {};',
        '    try {',
        "        if (type === 'clear') {",
        '            currentGenerationSessionId++;',
        '            return;',
        "        } else if (type === 'init') {",
        '            const { modelId, dtype, device } = payload || {};',
        `            const targetModel = modelId || '${DEFAULT_TTS_MODELS.kokoro}';`,
        "            const targetDtype = dtype || 'q8';",
        '            // Enforce WASM by default. WebGPU with q8 produces known tensor dequantization corruption in Chromium/Opera.',
        "            const requestedDevice = (device === 'auto' || !device) ? 'wasm' : device;",
        '            const targetDevice = requestedDevice;',
        '',
        '            if (tts && currentConfig && currentConfig.modelId === targetModel && currentConfig.dtype === targetDtype && currentConfig.device === targetDevice) {',
        "                self.postMessage({ type: 'ready', id, device: currentConfig.resolvedDevice, message: 'Model ready from cache' });",
        '                return;',
        '            }',
        '',
        '            initPromise = (async () => {',
        '                try {',
        "                    self.postMessage({ type: 'status', id, status: 'loading-library', progress: 5, message: 'Loading kokoro-js ML library...' });",
        '                    try {',
        `                        const { env } = await import('${CDN_URLS.transformersJs}');`,
        '                        env.backends.onnx.wasm.numThreads = 1;',
        '                        env.backends.onnx.wasm.simd = true;',
        '                        env.backends.onnx.wasm.proxy = false;',
        `                        env.backends.onnx.wasm.wasmPaths = '${CDN_URLS.transformersWasmPath}';`,
        '                    } catch(e) {',
        "                        console.warn('Could not pre-configure transformers.js env', e);",
        '                    }',
        `                    const { KokoroTTS } = await import('${CDN_URLS.kokoroJs}');`,
        '',
        '                    // Check if model weights are already cached in browser CacheStorage',
        '                    let isModelCached = false;',
        '                    try {',
        "                        if (typeof caches !== 'undefined') {",
        "                            const cache = await caches.open('transformers-cache');",
        `                            const match = await cache.match('${CDN_URLS.kokoroModelQuantized}');`,
        '                            if (match) isModelCached = true;',
        '                        }',
        '                    } catch (cErr) {}',
        '',
        '                    let currentProgress = isModelCached ? 80 : 15;',
        '                    if (isModelCached) {',
        "                        self.postMessage({ type: 'status', id, status: 'loading-model', progress: 80, message: 'Loading Kokoro-82M neural model from cache...' });",
        '                    } else {',
        "                        const sizeText = targetDtype === 'q4' ? '~45MB' : '~86MB';",
        "                        self.postMessage({ type: 'status', id, status: 'loading-model', progress: 15, message: 'Downloading Kokoro-82M weights (' + sizeText + ')...' });",
        '                    }',
        '',
        '                    const progressCallback = (p) => {',
        '                        let pct = null;',
        "                        if (p && typeof p.progress === 'number' && !isNaN(p.progress)) {",
        '                            pct = Math.round(p.progress);',
        "                        } else if (p && typeof p.loaded === 'number' && p.loaded > 0) {",
        "                            const total = (typeof p.total === 'number' && p.total > 0) ? p.total : 85000000;",
        '                        pct = Math.round((p.loaded / total) * 100);',
        '                    }',
        "                    if (typeof pct === 'number' && !isNaN(pct)) {",
        '                        const clamped = Math.min(95, Math.max(15, pct));',
        '                        if (clamped > currentProgress) {',
        '                            currentProgress = clamped;',
        "                            const fileName = p.file ? (' (' + p.file.split('/').pop() + ')') : '';",
        "                            self.postMessage({ type: 'progress', id, progress: clamped, message: 'Downloading ONNX model' + fileName + '...' });",
        '                        }',
        '                    }',
        '                };',
        '',
        '                let ticker = null;',
        '                if (!isModelCached) {',
        '                    ticker = setInterval(() => {',
        '                        if (currentProgress < 75) {',
        '                            currentProgress += 1;',
        "                            self.postMessage({ type: 'progress', id, progress: currentProgress, message: 'Downloading Kokoro-82M weights (' + currentProgress + '%)...' });",
        '                        }',
        '                    }, 500);',
        '                }',
        '',
        "                let resolvedDevice = 'wasm';",
        '                try {',
        "                    if (targetDevice === 'webnn-npu') {",
        '                        try {',
        '                            tts = await KokoroTTS.from_pretrained(targetModel, {',
        '                                dtype: targetDtype,',
        "                                device: 'webnn-npu',",
        '                                progress_callback: progressCallback',
        '                            });',
        "                            resolvedDevice = 'webnn-npu';",
        '                        } catch (errNpu) {',
        "                            console.warn('WebNN NPU not available, falling back to WASM:', errNpu);",
        '                        }',
        "                    } else if (targetDevice === 'webgpu') {",
        '                        try {',
        '                            const gpuLoad = KokoroTTS.from_pretrained(targetModel, {',
        '                                dtype: targetDtype,',
        "                                device: 'webgpu',",
        '                                progress_callback: progressCallback',
        '                            });',
        '                            const timeoutPromise = new Promise((_, reject) =>',
        "                                setTimeout(() => reject(new Error('WebGPU initialization timeout')), 8000)",
        '                            );',
        '                            tts = await Promise.race([gpuLoad, timeoutPromise]);',
        "                            resolvedDevice = 'webgpu';",
        '                        } catch (errGpu) {',
        "                            console.warn('WebGPU init failed, falling back to WebAssembly:', errGpu);",
        '                        }',
        '                    }',
        '',
        '                    if (!tts) {',
        '                        tts = await KokoroTTS.from_pretrained(targetModel, {',
        '                            dtype: targetDtype,',
        "                            device: 'wasm',",
        '                            progress_callback: progressCallback',
        '                        });',
        "                        resolvedDevice = 'wasm';",
        '                    }',
        '',
        '                    // Eagerly pre-cache the voice embedding into kokoro-voices CacheStorage',
        '                    // so that generate() never hangs on an unexpected secondary network fetch on mobile.',
        "                    const preloadVoice = (payload && payload.voice) || 'af_heart';",
        '                    try {',
        "                        if (typeof caches !== 'undefined' && preloadVoice !== 'system_native') {",
        "                            const voiceCache = await caches.open('kokoro-voices');",
        `                            const voiceUrl = '${CDN_URLS.kokoroVoicesBase}' + preloadVoice + '.bin';`,
        '                            const match = await voiceCache.match(voiceUrl);',
        '                            if (!match) {',
        "                                self.postMessage({ type: 'status', id, status: 'loading-voice', progress: 95, message: 'Pre-caching neural voice (' + preloadVoice + ')...' });",
        '                                const vResp = await fetch(voiceUrl);',
        '                                if (vResp.ok) {',
        '                                    await voiceCache.put(voiceUrl, vResp.clone());',
        '                                }',
        '                            }',
        '                        }',
        '                    } catch (vErr) {',
        "                        console.warn('Voice pre-caching non-fatal warning:', vErr);",
        '                    }',
        '                } finally {',
        '                    if (ticker) clearInterval(ticker);',
        '                }',
        '',
        '                currentConfig = { modelId: targetModel, dtype: targetDtype, device: targetDevice, resolvedDevice };',
        "                self.postMessage({ type: 'ready', id, device: resolvedDevice, message: 'Kokoro TTS ready (' + resolvedDevice.toUpperCase() + ')' });",
        '                } catch (initErr) {',
        "                    console.error('Kokoro ML initialization error:', initErr);",
        "                    self.postMessage({ type: 'error', id, error: 'Failed to initialize ML models: ' + (initErr.message || String(initErr)) });",
        '                    throw initErr;',
        '                }',
        '            })();',
        '',
        '            await initPromise;',
        '',
        "        } else if (type === 'ping') {",
        "            self.postMessage({ type: 'pong', id });",
        "        } else if (type === 'generate') {",
        '            const activeSessionId = currentGenerationSessionId;',
        '            generationQueue = generationQueue.then(async () => {',
        '                if (activeSessionId !== currentGenerationSessionId) return;',
        '                if (!tts && initPromise) {',
        '                    await initPromise;',
        '                }',
        '                if (!tts) {',
        "                    throw new Error('Kokoro TTS model is not loaded yet.');",
        '                }',
        '                const chunkIndex = (payload && payload.chunkIndex !== undefined) ? payload.chunkIndex : (e.data && e.data.chunkIndex);',
        '                const text = (payload && payload.text) ? payload.text : (e.data && e.data.text);',
        '                const voice = (payload && payload.voice) ? payload.voice : (e.data && e.data.voice);',
        '                const speed = (payload && payload.speed !== undefined) ? payload.speed : (e.data && e.data.speed);',
        '                if (!text || !text.trim()) return;',
        '                const t0 = Date.now();',
        '                const raw = await tts.generate(text, {',
        "                    voice: voice || 'af_heart',",
        "                    speed: typeof speed === 'number' ? speed : 1.0",
        '                });',
        '                if (activeSessionId !== currentGenerationSessionId) return;',
        '',
        '                let wavBuffer = null;',
        '                const sampleRate = (raw && raw.sampling_rate) || 24000;',
        '',
        '                // Extract raw audio samples as Float32Array directly, bypassing raw.toWav().',
        '                let f32 = null;',
        '                if (raw && raw.audio instanceof Float32Array) {',
        '                    f32 = raw.audio;',
        '                } else if (raw && raw.audio && raw.audio.data instanceof Float32Array) {',
        '                    f32 = raw.audio.data;',
        '                } else if (raw && raw.audio && ArrayBuffer.isView(raw.audio)) {',
        '                    f32 = new Float32Array(raw.audio.buffer, raw.audio.byteOffset, raw.audio.length);',
        '                }',
        '',
        '                if (f32 && f32.length > 0) {',
        '                    let maxAmp = 0;',
        '                    for (let i = 0; i < f32.length; i++) {',
        '                        const abs = Math.abs(f32[i]);',
        '                        if (abs > maxAmp) maxAmp = abs;',
        '                    }',
        '                    const scale = maxAmp > 0.98 ? 0.98 / maxAmp : 1.0;',
        '                    const numSamples = f32.length;',
        '                    const pcm16 = new Int16Array(numSamples);',
        '                    for (let i = 0; i < numSamples; i++) {',
        '                        const s = Math.max(-1, Math.min(1, f32[i] * scale));',
        '                        pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);',
        '                    }',
        '',
        '                    const buf = new ArrayBuffer(44 + pcm16.byteLength);',
        '                    const v = new DataView(buf);',
        '                    const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };',
        "                    w(0, 'RIFF');",
        '                    v.setUint32(4, 36 + pcm16.byteLength, true);',
        "                    w(8, 'WAVE');",
        "                    w(12, 'fmt ');",
        '                    v.setUint32(16, 16, true);',
        '                    v.setUint16(20, 1, true);',
        '                    v.setUint16(22, 1, true);',
        '                    v.setUint32(24, sampleRate, true);',
        '                    v.setUint32(28, sampleRate * 2, true);',
        '                    v.setUint16(32, 2, true);',
        '                    v.setUint16(34, 16, true);',
        "                    w(36, 'data');",
        '                    v.setUint32(40, pcm16.byteLength, true);',
        '                    new Uint8Array(buf, 44).set(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength));',
        '                    wavBuffer = buf;',
        "                } else if (raw && typeof raw.toBlob === 'function') {",
        '                    const blob = raw.toBlob();',
        '                    wavBuffer = await blob.arrayBuffer();',
        "                } else if (raw && typeof raw.toWav === 'function') {",
        '                    wavBuffer = raw.toWav();',
        '                }',
        '',
        '                const elapsedMs = Date.now() - t0;',
        '                if (wavBuffer) {',
        '                    self.postMessage({',
        "                        type: 'chunk_audio',",
        '                        id,',
        '                        payload: { chunkIndex, wavBuffer, sampleRate, elapsedMs }',
        '                    }, [wavBuffer]);',
        '                    f32 = null;',
        '                    pcm16 = null;',
        '                    wavBuffer = null;',
        '                } else {',
        "                    throw new Error('Failed to extract audio buffer from Kokoro output.');",
        '                }',
        '            }).catch(err => {',
        "                console.error('Kokoro Worker generation error:', err);",
        "                self.postMessage({ type: 'error', id, error: err.message || String(err) });",
        '            });',
        '        }',
        '    } catch (err) {',
        "        console.error('Kokoro Worker error:', err);",
        "        self.postMessage({ type: 'error', id, error: err.message || String(err) });",
        '    }',
        '};'
    ].join('\n');

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    let worker: KokoroWorkerHandle;
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
    const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
            (navigator.maxTouchPoints > 1 && /Macintosh|Mac/i.test(navigator.userAgent || '')));
    try {
        if (isFileProtocol || isIOS) {
            worker = new Worker(url);
        } else {
            worker = new Worker(url, { type: 'module' });
        }
    } catch (moduleErr) {
        console.warn('Module worker instantiation failed, falling back to classic worker:', moduleErr);
        worker = new Worker(url);
    }
    worker._blobUrl = url;
    return worker;
}

/** Purges Kokoro/ONNX/Transformers caches from browser CacheStorage. */
export async function clearKokoroModelCache(): Promise<number> {
    try {
        if (typeof window !== 'undefined' && 'caches' in window) {
            const cacheNames = await caches.keys();
            let deleted = 0;
            for (const name of cacheNames) {
                if (
                    name.includes('transformers') ||
                    name.includes('onnx') ||
                    name.includes('huggingface') ||
                    name.includes('kokoro')
                ) {
                    await caches.delete(name);
                    deleted++;
                }
            }
            return deleted;
        }
        return 0;
    } catch (e) {
        console.warn('clearKokoroModelCache error:', e);
        return 0;
    }
}
