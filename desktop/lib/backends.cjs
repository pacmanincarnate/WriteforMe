'use strict';

/**
 * What the desktop app can download and run. Pure data plus small pure helpers, so it can be
 * unit-tested without Electron, the network or Windows.
 *
 * Nothing here is bundled into the installer. Each backend is fetched from its own project's
 * official GitHub release the first time the user asks for it (see docs/DESKTOP.md for why).
 */

const path = require('path');

/** Ports the web app already defaults to (src/stores/useSettingsStore.ts, audio bridge). */
const PORTS = Object.freeze({
    web: 3000,
    koboldcpp: 5001,
    comfyui: 8188,
    audioBridge: 5020,
    audiocpp: 8080,
    codexBridge: 5010
});

/**
 * @typedef {object} Variant
 * @property {string} id
 * @property {string} label
 * @property {RegExp} match         asset name to download
 * @property {RegExp[]} [prefer]    tie-breakers when several assets match, best first
 * @property {RegExp} [exclude]     asset names to skip even if they match
 * @property {RegExp[]} [extras]    further assets unpacked into the same folder (e.g. CUDA runtime)
 * @property {string[]} [args]      extra launch arguments for this variant
 */

const BACKENDS = Object.freeze([
    {
        id: 'koboldcpp',
        name: 'KoboldCpp',
        role: 'Local text generation',
        repo: 'LostRuins/koboldcpp',
        homepage: 'https://github.com/LostRuins/koboldcpp',
        license: 'AGPL-3.0',
        licenseUrl: 'https://github.com/LostRuins/koboldcpp/blob/concedo/LICENSE.md',
        kind: 'exe',
        port: PORTS.koboldcpp,
        healthPath: '/api/v1/model',
        sizeHint: 'about 500 MB to 1 GB, plus the model you choose',
        variants: [
            { id: 'cuda', label: 'NVIDIA (CUDA)', match: /^koboldcpp\.exe$/i },
            { id: 'nocuda', label: 'AMD / Intel / CPU (Vulkan)', match: /^koboldcpp-nocuda\.exe$/i },
            { id: 'oldpc', label: 'Older PC (no AVX2)', match: /^koboldcpp-oldpc\.exe$/i }
        ]
    },
    {
        id: 'comfyui',
        name: 'ComfyUI',
        role: 'Local image generation (Krea 2)',
        repo: 'Comfy-Org/ComfyUI',
        homepage: 'https://github.com/Comfy-Org/ComfyUI',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE',
        kind: '7z',
        port: PORTS.comfyui,
        healthPath: '/system_stats',
        sizeHint: 'about 2 GB download, 6 GB on disk, plus Krea 2 models',
        variants: [
            { id: 'nvidia', label: 'NVIDIA (recent GPUs)', match: /^ComfyUI_windows_portable_nvidia\.7z$/i },
            { id: 'nvidia_cu126', label: 'NVIDIA (GTX 10-series and older)', match: /^ComfyUI_windows_portable_nvidia_cu126\.7z$/i },
            { id: 'amd', label: 'AMD', match: /^ComfyUI_windows_portable_amd\.7z$/i },
            { id: 'intel', label: 'Intel', match: /^ComfyUI_windows_portable_intel\.7z$/i },
            { id: 'cpu', label: 'CPU only (slow)', match: /^ComfyUI_windows_portable_nvidia\.7z$/i, args: ['--cpu'] }
        ]
    },
    {
        id: 'audiocpp',
        name: 'audio.cpp',
        role: 'Local audio drama voices (Breeze 2, Drama-3, Whisper)',
        repo: '0xShug0/audio.cpp',
        homepage: 'https://github.com/0xShug0/audio.cpp',
        license: 'Apache-2.0',
        licenseUrl: 'https://github.com/0xShug0/audio.cpp/blob/main/LICENSE',
        kind: 'zip',
        // audio.cpp is started and swapped between "waves" by audio-studio-bridge.js, so the
        // desktop app runs the bridge rather than the daemon itself.
        port: PORTS.audioBridge,
        healthPath: '/health',
        sizeHint: 'about 25 MB (CPU) to 600 MB (CUDA), plus voice models',
        variants: [
            {
                id: 'cuda',
                label: 'NVIDIA (CUDA)',
                match: /windows.*x64.*cuda.*\.zip$/i,
                exclude: /cudart/i,
                prefer: [/cuda-?12/i, /cuda/i],
                extras: [/cudart.*windows.*x64.*\.zip$|windows.*x64.*cudart.*\.zip$/i],
                backend: 'cuda'
            },
            { id: 'vulkan', label: 'AMD / Intel (Vulkan)', match: /windows.*x64.*vulkan.*\.zip$/i, backend: 'vulkan' },
            { id: 'cpu', label: 'CPU only', match: /windows-x64-cpu\.zip$/i, backend: 'cpu' }
        ]
    }
]);

/**
 * Voice models for audio.cpp. Same files and folder names as "Download Audio Models.bat", so a
 * folder filled by either tool works with the other.
 */
const AUDIO_MODEL_PACKS = Object.freeze([
    {
        id: 'wave1',
        name: 'Breeze 2 TTS (voice design and narration)',
        sizeHint: '5.4 GB',
        files: [
            { url: 'https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/breeze-tts-2-q8_0.gguf', to: 'breeze2/breeze-tts-2-q8_0.gguf' },
            { url: 'https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/breeze-tts-2-f16.gguf', to: 'breeze2/breeze-codec-f16.gguf' }
        ],
        licenseUrl: 'https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp'
    },
    {
        id: 'wave2',
        name: 'Fish Audio Drama-3 (multi-speaker dialogue)',
        sizeHint: '23 GB',
        files: [
            { url: 'https://huggingface.co/Jmica/Drama-3-GGUF/resolve/main/drama-3-backbone-8bit-experts-Q4_K_S.gguf', to: 'Drama-3-GGUF/drama-3-backbone-8bit-experts-Q4_K_S.gguf' }
        ],
        licenseUrl: 'https://huggingface.co/Jmica/Drama-3-GGUF'
    },
    {
        id: 'wave3',
        name: 'Whisper verifier and VAD (silence trimming)',
        sizeHint: '155 MB',
        files: [
            { url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q8_0.bin', to: 'whisper/whisper-base.en-q8_0.gguf' },
            { url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin', to: 'vad/earshot-vad-f16.gguf' }
        ],
        licenseUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
    }
]);

function getBackend(id) {
    const b = BACKENDS.find((x) => x.id === id);
    if (!b) throw new Error(`Unknown backend: ${id}`);
    return b;
}

function getVariant(backend, variantId) {
    const v = backend.variants.find((x) => x.id === variantId) || backend.variants[0];
    return v;
}

/**
 * Picks the release asset for a variant. Returns { asset, extras } or throws with the asset
 * names it saw, so a renamed upstream file gives a readable error instead of a wrong download.
 */
function selectAssets(release, variant) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const candidates = assets.filter((a) => variant.match.test(a.name) && !(variant.exclude && variant.exclude.test(a.name)));
    if (candidates.length === 0) {
        const names = assets.map((a) => a.name).join(', ') || '(none)';
        throw new Error(`No asset matching ${variant.match} in release ${release?.tag_name || '?'}. Assets: ${names}`);
    }
    let asset = candidates[0];
    for (const re of variant.prefer || []) {
        const hit = candidates.find((a) => re.test(a.name));
        if (hit) { asset = hit; break; }
    }
    const extras = [];
    for (const re of variant.extras || []) {
        const hit = assets.find((a) => re.test(a.name) && a !== asset);
        if (hit) extras.push(hit);
    }
    return { asset, extras };
}

/** GitHub exposes "sha256:<hex>" on release assets; returns the hex or null. */
function assetSha256(asset) {
    const d = asset && typeof asset.digest === 'string' ? asset.digest : '';
    const m = d.match(/^sha256:([0-9a-f]{64})$/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Command line for a backend that the desktop app launches itself.
 * `layout` comes from findInstallLayout() after install; `options` are user choices.
 */
function launchSpec(backend, variant, layout, options = {}) {
    const extra = splitArgs(options.extraArgs || '');
    if (backend.id === 'koboldcpp') {
        const args = ['--port', String(backend.port), '--host', '127.0.0.1'];
        if (options.modelPath) args.push('--model', options.modelPath, '--skiplauncher');
        return { command: layout.exe, args: [...args, ...(variant.args || []), ...extra], cwd: path.dirname(layout.exe) };
    }
    if (backend.id === 'comfyui') {
        const args = [
            '-s', path.join(layout.root, 'ComfyUI', 'main.py'),
            '--windows-standalone-build',
            '--listen', '127.0.0.1',
            '--port', String(backend.port),
            // The app calls ComfyUI from the page at http://127.0.0.1:3000, which needs CORS.
            '--enable-cors-header'
        ];
        return { command: layout.python, args: [...args, ...(variant.args || []), ...extra], cwd: layout.root };
    }
    throw new Error(`${backend.id} is not launched directly`);
}

/** Splits a user-typed argument string, honouring double quotes. */
function splitArgs(text) {
    const out = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(String(text))) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
    return out;
}

module.exports = {
    PORTS,
    BACKENDS,
    AUDIO_MODEL_PACKS,
    getBackend,
    getVariant,
    selectAssets,
    assetSha256,
    launchSpec,
    splitArgs
};
