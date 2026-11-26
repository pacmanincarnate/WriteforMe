'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { BACKENDS, getBackend, getVariant, selectAssets, assetSha256, launchSpec, splitArgs } = require('../lib/backends.cjs');
const { rewriteConfig, modelAliases } = require('../lib/audiocppConfig.cjs');
const { AUDIO_MODEL_PACKS } = require('../lib/backends.cjs');

const asset = (name, extra = {}) => ({ name, browser_download_url: `https://example.invalid/${name}`, ...extra });

test('every backend has a license, a repo and at least one variant', () => {
    for (const b of BACKENDS) {
        assert.ok(b.license && b.licenseUrl.startsWith('https://'), b.id);
        assert.match(b.repo, /^[\w.-]+\/[\w.-]+$/);
        assert.ok(b.variants.length > 0);
    }
});

test('koboldcpp variants pick the exact exe, not the Linux or old-PC builds', () => {
    const release = { tag_name: 'v1.123.1', assets: ['koboldcpp-linux-x64', 'koboldcpp-oldpc.exe', 'koboldcpp-nocuda.exe', 'koboldcpp.exe', 'koboldcpp-mac-arm64'].map((n) => asset(n)) };
    const b = getBackend('koboldcpp');
    assert.equal(selectAssets(release, getVariant(b, 'cuda')).asset.name, 'koboldcpp.exe');
    assert.equal(selectAssets(release, getVariant(b, 'nocuda')).asset.name, 'koboldcpp-nocuda.exe');
    assert.equal(selectAssets(release, getVariant(b, 'oldpc')).asset.name, 'koboldcpp-oldpc.exe');
});

test('comfyui nvidia does not grab the cu126 package; cpu reuses it with --cpu', () => {
    const release = { assets: ['ComfyUI_windows_portable_nvidia_cu126.7z', 'ComfyUI_windows_portable_nvidia.7z', 'ComfyUI_windows_portable_amd.7z'].map((n) => asset(n)) };
    const b = getBackend('comfyui');
    assert.equal(selectAssets(release, getVariant(b, 'nvidia')).asset.name, 'ComfyUI_windows_portable_nvidia.7z');
    assert.equal(selectAssets(release, getVariant(b, 'nvidia_cu126')).asset.name, 'ComfyUI_windows_portable_nvidia_cu126.7z');
    const cpu = getVariant(b, 'cpu');
    const spec = launchSpec(b, cpu, { python: 'C:\\c\\python_embeded\\python.exe', root: 'C:\\c' }, {});
    assert.ok(spec.args.includes('--cpu'));
    assert.ok(spec.args.includes('--enable-cors-header'));
    assert.deepEqual(spec.args.slice(spec.args.indexOf('--port'), spec.args.indexOf('--port') + 2), ['--port', '8188']);
});

test('audio.cpp cuda prefers CUDA 12, skips the runtime as the main asset, and adds it as an extra', () => {
    const release = {
        assets: [
            'audio-v0.9.0-bin-windows-x64-cpu.zip',
            'audio-v0.9.0-bin-windows-x64-cpu-portable.zip',
            'audio-v0.9.0-bin-windows-x64-cuda13.3.zip',
            'audio-v0.9.0-bin-windows-x64-cuda12.4.zip',
            'cudart-audio-v0.9.0-bin-windows-x64-cuda12.4.zip',
            'audio-v0.9.0-bin-windows-x64-vulkan.zip'
        ].map((n) => asset(n))
    };
    const b = getBackend('audiocpp');
    const cuda = selectAssets(release, getVariant(b, 'cuda'));
    assert.equal(cuda.asset.name, 'audio-v0.9.0-bin-windows-x64-cuda12.4.zip');
    assert.deepEqual(cuda.extras.map((a) => a.name), ['cudart-audio-v0.9.0-bin-windows-x64-cuda12.4.zip']);
    assert.equal(selectAssets(release, getVariant(b, 'cpu')).asset.name, 'audio-v0.9.0-bin-windows-x64-cpu.zip');
    assert.equal(selectAssets(release, getVariant(b, 'vulkan')).asset.name, 'audio-v0.9.0-bin-windows-x64-vulkan.zip');
});

test('a renamed upstream asset fails with the names it saw', () => {
    const b = getBackend('koboldcpp');
    assert.throws(() => selectAssets({ tag_name: 'v9', assets: [asset('kcpp.exe')] }, getVariant(b, 'cuda')), /kcpp\.exe/);
});

test('sha256 digests are read from GitHub asset metadata', () => {
    const hex = 'a'.repeat(64);
    assert.equal(assetSha256({ digest: `sha256:${hex}` }), hex);
    assert.equal(assetSha256({ digest: 'md5:abc' }), null);
    assert.equal(assetSha256({}), null);
});

test('koboldcpp launches straight into a chosen model, or into its own launcher without one', () => {
    const b = getBackend('koboldcpp');
    const v = getVariant(b, 'cuda');
    const withModel = launchSpec(b, v, { exe: 'C:\\k\\koboldcpp.exe' }, { modelPath: 'D:\\m\\q.gguf', extraArgs: '--contextsize 16384 --tag "two words"' });
    assert.deepEqual(withModel.args, ['--port', '5001', '--host', '127.0.0.1', '--model', 'D:\\m\\q.gguf', '--skiplauncher', '--contextsize', '16384', '--tag', 'two words']);
    const without = launchSpec(b, v, { exe: 'C:\\k\\koboldcpp.exe' }, {});
    assert.ok(!without.args.includes('--skiplauncher'));
});

test('splitArgs honours quotes', () => {
    assert.deepEqual(splitArgs('  a "b c"  d '), ['a', 'b c', 'd']);
    assert.deepEqual(splitArgs(''), []);
});

test('wave presets are pointed at the models folder and the installed compute backend', () => {
    const aliases = modelAliases(AUDIO_MODEL_PACKS);
    const modelsDir = path.join('U', 'models');
    const cfg = {
        backend: 'cuda',
        models: [
            { id: 'a', path: 'D:/AI_Projects/Audiocpp/audio.cpp/models/Breeze-TTS-2-GGUF/breeze-tts-2-q8_0.gguf' },
            { id: 'b', path: 'D:\\AI_Projects\\x\\Drama-3-GGUF\\drama-3-backbone-8bit-experts-Q4_K_S.gguf' },
            { id: 'c', weights: './models/whisper/whisper-base.en-q8_0.gguf', vad_weights: './models/vad/earshot-vad-f16.gguf', device: 'CUDA0' },
            { id: 'd', path: 'E:/somewhere/unknown.gguf' }
        ]
    };
    const out = rewriteConfig(cfg, { modelsDir, backend: 'cpu', aliases });
    assert.equal(out.backend, 'cpu');
    assert.equal(out.models[0].path, path.join(modelsDir, 'breeze2', 'breeze-tts-2-q8_0.gguf'));
    assert.equal(out.models[1].path, path.join(modelsDir, 'Drama-3-GGUF', 'drama-3-backbone-8bit-experts-Q4_K_S.gguf'));
    assert.equal(out.models[2].weights, path.join(modelsDir, 'whisper', 'whisper-base.en-q8_0.gguf'));
    assert.equal(out.models[2].vad_weights, path.join(modelsDir, 'vad', 'earshot-vad-f16.gguf'));
    assert.equal(out.models[2].device, 'CPU');
    assert.equal(out.models[3].path, 'E:/somewhere/unknown.gguf');
    assert.equal(cfg.backend, 'cuda', 'the template is not modified');
});
