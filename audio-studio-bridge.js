/**
 * EllipsisProse Audio Studio Bridge (Hybrid Studio TTS)
 * Manages Audio.cpp process lifecycle across Wave 1 (Breeze 2), Wave 2 (Fish Audio Drama-3),
 * and Wave 3 (Verifier), provides local voice WAV reference caching,
 * and reverse proxies inference requests over persistent HTTP Keep-Alive.
 *
 * Requirements: Node.js 18+ (zero external dependencies)
 * Default Port: 5020
 * Daemon Port: 8080
 */

'use strict';

const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration & CLI Argument Parsing
// ---------------------------------------------------------------------------
const ROOT_DIR = __dirname;
// The desktop app (desktop/main.cjs) runs this bridge from a read-only install folder, so it
// points the voice cache and the wave presets at the user's data folder with these variables.
const CACHE_DIR = process.env.ELLIPSISPROSE_BRIDGE_CACHE_DIR
    ? path.resolve(process.env.ELLIPSISPROSE_BRIDGE_CACHE_DIR)
    : path.join(ROOT_DIR, 'cache', 'voices');
const AUDIOCPP_CONFIGS_DIR = process.env.ELLIPSISPROSE_AUDIOCPP_CONFIG_DIR
    ? path.resolve(process.env.ELLIPSISPROSE_AUDIOCPP_CONFIG_DIR)
    : path.join(ROOT_DIR, 'audiocpp');
const RUNTIME_WAVE2_CONFIG_PATH = path.join(path.dirname(CACHE_DIR), 'runtime_wave2_drama3.json');
const LEGACY_AUDIOCPP_HOME = 'D:\\AI_Projects\\Audiocpp\\audio.cpp';

/** Working folder for the daemon: an explicit override, the original dev checkout, or the binary's folder. */
function resolveDaemonCwd(binPath) {
    if (process.env.ELLIPSISPROSE_AUDIOCPP_CWD) return process.env.ELLIPSISPROSE_AUDIOCPP_CWD;
    if (fs.existsSync(LEGACY_AUDIOCPP_HOME)) return LEGACY_AUDIOCPP_HOME;
    return path.dirname(binPath);
}

const settings = {
    port: Number(process.env.AUDIO_STUDIO_BRIDGE_PORT || 5020),
    daemonPort: Number(process.env.AUDIOCPP_PORT || 8080),
    bind: process.env.AUDIO_STUDIO_BRIDGE_BIND || '127.0.0.1',
    swapMode: process.env.AUDIO_STUDIO_SWAP_MODE || 'patternA', // 'patternA' | 'patternB'
    audiocppDir: process.env.ELLIPSISPROSE_AUDIOCPP_DIR || '',
    audiocppBin: ''
};

for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    const val = process.argv[i + 1];
    if (key === 'port') settings.port = Number(val);
    else if (key === 'daemon-port') settings.daemonPort = Number(val);
    else if (key === 'bind') settings.bind = val;
    else if (key === 'swap-mode') settings.swapMode = val;
    else if (key === 'audiocpp-dir') settings.audiocppDir = val;
    else if (key === 'audiocpp-bin') settings.audiocppBin = val;
}

// Ensure cache directory exists
fs.mkdirSync(CACHE_DIR, { recursive: true });

function getVqSidecarPath(wavPath) {
    return `${wavPath}.vq.json`;
}

function unlinkWavAndSidecar(wavPath) {
    try { fs.unlinkSync(wavPath); } catch (_) {}
    try {
        const vqPath = getVqSidecarPath(wavPath);
        if (fs.existsSync(vqPath)) fs.unlinkSync(vqPath);
    } catch (_) {}
}

function pruneVoiceCache({ keepStoryId = '', deleteAll = false, maxAgeMs = 0 } = {}) {
    if (!fs.existsSync(CACHE_DIR)) return { deleted: 0, remaining: 0 };
    const cleanKeepPrefix = keepStoryId
        ? String(keepStoryId).replace(/[^a-zA-Z0-9_-]/g, '_') + '_'
        : '';
    const now = Date.now();
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.toLowerCase().endsWith('.wav'));
    const byMasterPrefix = new Map();
    let deleted = 0;

    for (const f of files) {
        const fullPath = path.join(CACHE_DIR, f);
        let stat = null;
        try { stat = fs.statSync(fullPath); } catch (_) { continue; }

        if (deleteAll) {
            unlinkWavAndSidecar(fullPath);
            deleted++;
            continue;
        }
        if (cleanKeepPrefix && !f.startsWith(cleanKeepPrefix)) {
            unlinkWavAndSidecar(fullPath);
            deleted++;
            continue;
        }
        if (maxAgeMs > 0 && (now - stat.mtimeMs) > maxAgeMs) {
            unlinkWavAndSidecar(fullPath);
            deleted++;
            continue;
        }
        const m = f.match(/^(.+_master)_[a-zA-Z0-9]+\.wav$/i);
        if (m) {
            const key = m[1].toLowerCase();
            const prev = byMasterPrefix.get(key);
            if (!prev || stat.mtimeMs > prev.mtimeMs) {
                if (prev) {
                    unlinkWavAndSidecar(prev.fullPath);
                    deleted++;
                }
                byMasterPrefix.set(key, { fullPath, mtimeMs: stat.mtimeMs });
            } else {
                unlinkWavAndSidecar(fullPath);
                deleted++;
            }
        }
    }

    // Remove orphan .vq.json sidecars whose backing .wav no longer exists
    for (const f of fs.readdirSync(CACHE_DIR)) {
        if (!f.toLowerCase().endsWith('.vq.json')) continue;
        const wavCompanion = path.join(CACHE_DIR, f.slice(0, -'.vq.json'.length));
        if (!fs.existsSync(wavCompanion)) {
            try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
        }
    }

    const remaining = fs.readdirSync(CACHE_DIR).filter(f => f.toLowerCase().endsWith('.wav')).length;
    return { deleted, remaining };
}

// Startup only deduplicates superseded master hashes for the same speaker; keep all active Master WAVs across restarts
const _startupPrune = pruneVoiceCache({});
if (_startupPrune.deleted > 0) {
    console.log(`[Bridge Startup] Pruned ${_startupPrune.deleted} superseded duplicate voice WAV sample(s); ${_startupPrune.remaining} active.`);
}

// ---------------------------------------------------------------------------
// Audio.cpp Binary & Path Discovery
// ---------------------------------------------------------------------------
function resolveLocalCfgDir() {
    const localCfgPath = path.join(ROOT_DIR, 'backends.local.cmd');
    if (fs.existsSync(localCfgPath)) {
        try {
            const lines = fs.readFileSync(localCfgPath, 'utf8').split('\n');
            for (const line of lines) {
                const match = line.match(/^\s*set\s+"AUDIOCPP_DIR=([^"]+)"/i);
                if (match && match[1]) return match[1].trim();
            }
        } catch (_) {}
    }
    return '';
}

function findAudioCppExecutable() {
    if (settings.audiocppBin && fs.existsSync(settings.audiocppBin)) {
        return settings.audiocppBin;
    }

    const candidateDirs = [
        settings.audiocppDir,
        resolveLocalCfgDir(),
        'D:\\AI_Projects\\Audiocpp\\audio.cpp\\build\\windows-cuda-release\\bin',
        'D:\\AI_Projects\\Audiocpp\\audio.cpp',
        'D:\\AI_Projects\\Audiocpp\\audio.cpp\\build',
        path.join(ROOT_DIR, 'audiocpp'),
        'C:\\audiocpp',
        'D:\\audiocpp',
        path.join(os.homedir(), 'audiocpp')
    ].filter(Boolean);

    const binNames = os.platform() === 'win32'
        ? ['audiocpp_server.exe', 'audiocpp.exe', 'audio-server.exe']
        : ['audiocpp_server', 'audiocpp', 'audio-server'];

    for (const dir of candidateDirs) {
        for (const b of binNames) {
            const candidate = path.join(dir, b);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // Check system PATH
    try {
        const whichCmd = os.platform() === 'win32' ? 'where audiocpp_server' : 'which audiocpp_server';
        const result = execSync(whichCmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
        const firstLine = result.split(/\r?\n/)[0];
        if (firstLine && fs.existsSync(firstLine)) return firstLine;
    } catch (_) {}

    return null;
}

const WAVE_CONFIGS = {
    1: path.join(AUDIOCPP_CONFIGS_DIR, 'config_wave1_breeze.json'),
    2: path.join(AUDIOCPP_CONFIGS_DIR, 'config_wave2_drama3.json'),
    3: path.join(AUDIOCPP_CONFIGS_DIR, 'config_wave3_verifier.json')
};

const WAVE_MODEL_IDS = {
    1: 'breeze-tts',
    2: 'drama-3',
    3: 'whisper_verifier'
};

// ---------------------------------------------------------------------------
// State & Keep-Alive Proxy Agent
// ---------------------------------------------------------------------------
const state = {
    activeWave: null,
    activeModel: null,
    activeProc: null,
    procStartTime: null,
    activeStoryPrefix: '',
    activeWave2RequestedSig: null,
    activeOffload: null,
    cudaWarmupSuppressed: 0,
    cudaWarmupFirstLogged: false,
    cudaGraphReuseSuppressed: 0,
    logRing: [],
    swapMode: settings.swapMode,
    perfStats: {
        last: null,
        recent: [],
        avgRealtimeX: null,
        avgRtf: null
    }
};

function pushLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    state.logRing.push(entry);
    if (state.logRing.length > 500) state.logRing.shift();
    console.log(entry);
}

/**
 * Splits child daemon stdout/stderr chunks into lines and throttles repetitive
 * CUDA graph warmup noise so voice calibration logs remain visible in /logs.
 */
function logDaemonStreamChunk(streamLabel, chunk) {
    const rawLines = String(chunk).split(/\r?\n/);
    for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line) continue;
        // Resident hybrid mode emits "CUDA Graph id N reused" ~36 times per generated frame; drop cleanly
        if (/cuda graph id \d+ reused/i.test(line)) {
            state.cudaGraphReuseSuppressed = (state.cudaGraphReuseSuppressed || 0) + 1;
            continue;
        }
        if (/cuda graph warmup complete/i.test(line)) {
            if (!state.cudaWarmupFirstLogged) {
                state.cudaWarmupFirstLogged = true;
                pushLog(`[audiocpp ${streamLabel}] ${line}`);
            } else {
                state.cudaWarmupSuppressed = (state.cudaWarmupSuppressed || 0) + 1;
                if (state.cudaWarmupSuppressed % 100 === 0) {
                    pushLog(`[audiocpp ${streamLabel}] (${state.cudaWarmupSuppressed} repetitive CUDA graph warmup messages suppressed)`);
                }
            }
            continue;
        }
        if (state.cudaWarmupSuppressed > 0) {
            pushLog(`[audiocpp ${streamLabel}] (suppressed ${state.cudaWarmupSuppressed} repetitive CUDA graph warmup messages)`);
            state.cudaWarmupSuppressed = 0;
        }
        pushLog(`[audiocpp ${streamLabel}] ${line}`);
    }
}

const proxyAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 64,
    keepAliveMsecs: 15000
});

// ---------------------------------------------------------------------------
// Process Lifecycle Manager (Pattern A)
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function isPortListening(port) {
    return new Promise(resolve => {
        const client = net.createConnection({ port, host: '127.0.0.1' })
            .on('connect', () => {
                client.destroy();
                resolve(true);
            })
            .on('error', () => {
                resolve(false);
            });
    });
}

async function waitForPortClosed(port, timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const listening = await isPortListening(port);
        if (!listening) return true;
        await sleep(200);
    }
    return false;
}

function pollHealth(url, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
            const req = http.get(url, res => {
                res.resume();
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve(true);
                } else if (res.statusCode === 404) {
                    reject(new Error('Daemon health check returned status 404'));
                } else if (Date.now() - started > timeoutMs) {
                    reject(new Error(`Daemon health check timed out with status ${res.statusCode}`));
                } else {
                    setTimeout(check, 250);
                }
            });
            req.on('error', () => {
                if (Date.now() - started > timeoutMs) {
                    reject(new Error(`Daemon health check timed out after ${timeoutMs}ms`));
                } else {
                    setTimeout(check, 250);
                }
            });
            req.setTimeout(2000, () => req.destroy());
        };
        check();
    });
}

function queryGpuVramStatus() {
    try {
        const out = execSync(
            'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits',
            { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 2500 }
        ).trim();
        const firstLine = out.split(/\r?\n/)[0];
        if (!firstLine) return null;
        const parts = firstLine.split(',').map(s => s.trim());
        if (parts.length < 4) return null;
        return {
            gpu: parts[0],
            total_mb: Number(parts[1]),
            used_mb: Number(parts[2]),
            free_mb: Number(parts[3])
        };
    } catch (_) {
        return null;
    }
}

async function stopActiveDaemon() {
    if (state.activeProc) {
        const pid = state.activeProc.pid;
        pushLog(`Terminating active Audio.cpp daemon (PID ${pid})...`);
        try {
            if (os.platform() === 'win32') {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            } else {
                state.activeProc.kill('SIGTERM');
            }
        } catch (_) {}
        state.activeProc = null;
    }

    // Ensure no orphaned Audio.cpp server processes (from earlier runs or other waves) remain holding VRAM
    if (os.platform() === 'win32') {
        for (const exeName of ['audiocpp_server.exe', 'audiocpp.exe', 'audio-server.exe']) {
            try {
                execSync(`taskkill /F /IM ${exeName}`, { stdio: 'ignore', timeout: 3000 });
            } catch (_) {}
        }
    }

    state.activeWave = null;
    state.activeModel = null;
    state.procStartTime = null;
    state.activeWave2RequestedSig = null;
    state.activeOffload = null;

    const closed = await waitForPortClosed(settings.daemonPort, 10000);
    if (!closed) {
        pushLog(`Warning: Port ${settings.daemonPort} remained busy after termination`);
    } else {
        pushLog(`Port ${settings.daemonPort} released successfully.`);
        // Give CUDA/WDDM a brief moment to reclaim freed VRAM before spawning the next model
        await sleep(400);
    }
}

function normalizeWave2Overrides(raw = {}) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const profileRaw = String(src.offloadProfile || src.profile || 'auto').trim().toLowerCase();
    const offloadProfile = ['auto', 'resident_hybrid', 'pinned_cache', 'custom'].includes(profileRaw)
        ? profileRaw
        : 'auto';
    const runModeRaw = String(src.runMode || src.mode || 'streaming').trim().toLowerCase();
    const runMode = (runModeRaw === 'offline' || runModeRaw === 'streaming') ? runModeRaw : 'streaming';
    const norm = {
        offloadProfile,
        runMode,
        cpuExpertLayers: (src.cpuExpertLayers !== undefined && src.cpuExpertLayers !== null && src.cpuExpertLayers !== '')
            ? Math.max(0, Math.min(40, Math.round(Number(src.cpuExpertLayers))))
            : null,
        diskExperts: (typeof src.diskExperts === 'boolean') ? src.diskExperts : null,
        pinExperts: (typeof src.pinExperts === 'boolean') ? src.pinExperts : null,
        expertCacheSize: (src.expertCacheSize !== undefined && src.expertCacheSize !== null && src.expertCacheSize !== '')
            ? Math.max(8, Math.min(256, Math.round(Number(src.expertCacheSize))))
            : null,
        codecBackend: (src.codecBackend === 'cpu' || src.codecBackend === 'same') ? src.codecBackend : null,
        contextLength: (src.contextLength !== undefined && src.contextLength !== null && Number.isFinite(Number(src.contextLength)))
            ? Math.max(2048, Math.min(32768, Math.round(Number(src.contextLength))))
            : null,
        threads: (src.threads !== undefined && src.threads !== null && Number.isFinite(Number(src.threads)))
            ? Math.max(1, Math.min(32, Math.round(Number(src.threads))))
            : null,
        ggufFile: typeof src.ggufFile === 'string' && src.ggufFile.trim() ? src.ggufFile.trim() : null,
        forceRestart: Boolean(src.forceRestart)
    };
    const sig = JSON.stringify({
        offloadProfile: norm.offloadProfile,
        runMode: norm.runMode,
        cpuExpertLayers: norm.cpuExpertLayers,
        diskExperts: norm.diskExperts,
        pinExperts: norm.pinExperts,
        expertCacheSize: norm.expertCacheSize,
        codecBackend: norm.codecBackend,
        contextLength: norm.contextLength,
        threads: norm.threads,
        ggufFile: norm.ggufFile
    });
    return { norm, sig };
}

function resolveWave2RuntimeConfig(baseCfgPath, overridesNorm, vramStatus) {
    const cfg = JSON.parse(fs.readFileSync(baseCfgPath, 'utf8'));
    const models = Array.isArray(cfg.models) ? cfg.models : [];
    const primaryOpts = (models[0] && models[0].session_options) || {};

    if (overridesNorm.ggufFile) {
        const defaultDrama3Dir = (models[0] && models[0].path && path.isAbsolute(models[0].path))
            ? path.dirname(models[0].path)
            : path.join(LEGACY_AUDIOCPP_HOME, 'models', 'Drama-3-GGUF');
        const candidate = path.isAbsolute(overridesNorm.ggufFile)
            ? overridesNorm.ggufFile
            : path.join(defaultDrama3Dir, overridesNorm.ggufFile);
        if (fs.existsSync(candidate)) {
            for (const m of models) m.path = candidate;
        }
    }

    const activePath = String((models[0] && models[0].path) || '').toLowerCase();
    let expertLayerMb = 432.0;
    if (activePath.includes('q2_k')) expertLayerMb = 252.0;
    else if (activePath.includes('q3_k')) expertLayerMb = 330.0;
    const baseReductionMb = activePath.includes('backbone-4bit') ? 1150 : 0;

    const baseCtx = parseInt(primaryOpts['fish_drama3.context_length'], 10);
    const contextLength = overridesNorm.contextLength || (Number.isFinite(baseCtx) ? baseCtx : 8192);
    const threads = overridesNorm.threads || Number(cfg.threads) || 6;
    cfg.threads = threads;

    const baseCodec = primaryOpts['fish_drama3.codec_backend'] === 'cpu' ? 'cpu' : 'same';
    let codecBackend = overridesNorm.codecBackend || baseCodec;
    let diskExperts = primaryOpts['fish_drama3.disk_experts'] === 'true';
    let pinExperts = primaryOpts['fish_drama3.pin_experts'] === 'true';
    let cpuExpertLayers = Number.isFinite(parseInt(primaryOpts['fish_drama3.cpu_expert_layers'], 10))
        ? parseInt(primaryOpts['fish_drama3.cpu_expert_layers'], 10)
        : 0;
    let expertCacheSize = Number.isFinite(parseInt(primaryOpts['fish_drama3.expert_cache_size'], 10))
        ? parseInt(primaryOpts['fish_drama3.expert_cache_size'], 10)
        : 44;

    const freeMb = Number(vramStatus?.free_mb) || 0;
    const kvMb = Math.round(606 * (contextLength / 8192));
    const computeSafeMinCpuLayers = (targetCodec) => {
        if (freeMb <= 0) return null;
        const baseVramMb = (targetCodec === 'cpu' ? 5310 : 6150) + kvMb - baseReductionMb;
        const safetyMarginMb = 1000;
        const availForExperts = Math.max(0, freeMb - baseVramMb - safetyMarginMb);
        const maxGpuLayers = Math.min(40, Math.max(0, Math.floor(availForExperts / expertLayerMb)));
        return 40 - maxGpuLayers;
    };
    const computeSafeMaxSlots = (targetCodec) => {
        if (freeMb <= 0) return null;
        const baseVramMb = (targetCodec === 'cpu' ? 5350 : 6650) + kvMb - baseReductionMb;
        const availForCache = Math.max(0, freeMb - baseVramMb - 1000);
        const mbPerSlotAllLayers = (40 * expertLayerMb) / 256;
        return Math.max(8, Math.min(256, Math.floor(availForCache / mbPerSlotAllLayers)));
    };

    const profile = overridesNorm.offloadProfile || 'auto';
    if (profile === 'pinned_cache') {
        diskExperts = true;
        pinExperts = overridesNorm.pinExperts !== null ? overridesNorm.pinExperts : true;
        cpuExpertLayers = 0;
        const desiredSlots = overridesNorm.expertCacheSize !== null ? overridesNorm.expertCacheSize : expertCacheSize;
        const maxSafeSlots = computeSafeMaxSlots(codecBackend);
        expertCacheSize = maxSafeSlots !== null
            ? Math.max(8, Math.min(desiredSlots, maxSafeSlots))
            : Math.max(8, Math.min(256, desiredSlots));
    } else if (profile === 'resident_hybrid') {
        diskExperts = false;
        pinExperts = false;
        const safeMinCpu = computeSafeMinCpuLayers(codecBackend);
        if (overridesNorm.cpuExpertLayers !== null) {
            cpuExpertLayers = overridesNorm.cpuExpertLayers;
            if (safeMinCpu !== null && cpuExpertLayers < safeMinCpu) {
                pushLog(`[Offload Clamp] Requested cpu_expert_layers=${cpuExpertLayers} exceeds free VRAM (${freeMb} MiB); clamping to cpu_expert_layers=${safeMinCpu}.`);
                cpuExpertLayers = safeMinCpu;
            }
        } else {
            cpuExpertLayers = safeMinCpu !== null ? safeMinCpu : 36;
        }
    } else if (profile === 'auto') {
        const safeMinCpu = computeSafeMinCpuLayers(codecBackend);
        if (safeMinCpu === null || safeMinCpu > 12) {
            // On 12-16 GB GPUs with Q4_K_S, pinned_cache + streaming outperforms resident_hybrid by ~22%
            diskExperts = true;
            pinExperts = true;
            cpuExpertLayers = 0;
            const maxSafeSlots = computeSafeMaxSlots(codecBackend);
            const desiredSlots = overridesNorm.expertCacheSize !== null ? overridesNorm.expertCacheSize : 54;
            expertCacheSize = maxSafeSlots !== null
                ? Math.max(8, Math.min(desiredSlots, maxSafeSlots))
                : Math.max(8, Math.min(256, Math.min(desiredSlots, expertCacheSize)));
        } else {
            // Ample VRAM (e.g., 24+ GB GPU or smaller Q2_K/Q3_K quant): resident_hybrid keeps >=28/40 layers on GPU
            diskExperts = false;
            pinExperts = false;
            cpuExpertLayers = safeMinCpu;
        }
    } else {
        // Custom: honor explicit flags while enforcing backbone.cpp invariant
        if (overridesNorm.diskExperts !== null) diskExperts = overridesNorm.diskExperts;
        if (overridesNorm.pinExperts !== null) pinExperts = overridesNorm.pinExperts;
        if (overridesNorm.cpuExpertLayers !== null) cpuExpertLayers = overridesNorm.cpuExpertLayers;
        if (overridesNorm.expertCacheSize !== null) expertCacheSize = overridesNorm.expertCacheSize;
        if (diskExperts && cpuExpertLayers > 0) {
            pushLog(`[Offload Warning] Disabling disk_experts because cpu_expert_layers=${cpuExpertLayers} > 0 (avoids token-by-token prefill fallback).`);
            diskExperts = false;
            pinExperts = false;
        }
        if (pinExperts && !diskExperts) pinExperts = false;
    }

    const runMode = overridesNorm.runMode || 'streaming';
    for (const m of models) {
        m.mode = runMode;
        const opts = { ...(m.session_options || {}) };
        opts['fish_drama3.disk_experts'] = String(diskExperts);
        opts['fish_drama3.pin_experts'] = String(pinExperts);
        opts['fish_drama3.cpu_expert_layers'] = String(cpuExpertLayers);
        opts['fish_drama3.context_length'] = String(contextLength);
        opts['fish_drama3.codec_backend'] = codecBackend;
        opts['fish_drama3.backbone_prefill_cache_mb'] = opts['fish_drama3.backbone_prefill_cache_mb'] || '512';
        opts['fish_drama3.tower_prefill_cache_mb'] = opts['fish_drama3.tower_prefill_cache_mb'] || '512';
        if (diskExperts) {
            opts['fish_drama3.expert_cache_size'] = String(expertCacheSize);
        } else {
            delete opts['fish_drama3.expert_cache_size'];
        }
        m.session_options = opts;
    }

    fs.mkdirSync(path.dirname(RUNTIME_WAVE2_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(RUNTIME_WAVE2_CONFIG_PATH, JSON.stringify(cfg, null, 2));

    const offloadSummary = {
        profile,
        run_mode: runMode,
        mode: diskExperts ? 'pinned_cache' : 'resident_hybrid',
        disk_experts: diskExperts,
        pin_experts: pinExperts,
        gpu_expert_layers: diskExperts ? 0 : (40 - cpuExpertLayers),
        cpu_expert_layers: cpuExpertLayers,
        expert_cache_size: diskExperts ? expertCacheSize : null,
        codec_backend: codecBackend,
        context_length: contextLength,
        threads,
        free_vram_mb_at_start: freeMb || null,
        model_path: (models[0] && models[0].path) || ''
    };
    return { configPath: RUNTIME_WAVE2_CONFIG_PATH, offloadSummary };
}

async function activateWave(waveNumber, overrides = {}) {
    const wave = Number(waveNumber);
    if (![1, 2, 3].includes(wave)) {
        throw new Error(`Invalid wave number: ${waveNumber}. Expected 1, 2, or 3.`);
    }

    if (settings.swapMode === 'patternB') {
        // Pattern B: single persistent daemon with LRU swap
        state.activeWave = wave;
        state.activeModel = WAVE_MODEL_IDS[wave];
        return {
            status: 'ok',
            active_wave: wave,
            active_model: state.activeModel,
            mode: 'patternB'
        };
    }

    const { norm: wave2Norm, sig: wave2Sig } = normalizeWave2Overrides(overrides);

    // Pattern A: child process manager
    const daemonAlive = await isPortListening(settings.daemonPort);
    if (state.activeWave === wave && daemonAlive) {
        const wave2Changed = wave === 2 && (wave2Norm.forceRestart || (state.activeWave2RequestedSig !== null && wave2Sig !== state.activeWave2RequestedSig));
        if (!wave2Changed) {
            return {
                status: 'ok',
                active_wave: wave,
                active_model: state.activeModel,
                already_active: true,
                offload: state.activeOffload
            };
        }
        pushLog(`[Offload] Wave 2 settings changed (${wave2Norm.offloadProfile}); restarting Drama-3 daemon cleanly...`);
    }

    await stopActiveDaemon();

    const vramBefore = queryGpuVramStatus();
    if (vramBefore) {
        pushLog(`[GPU] ${vramBefore.gpu}: ${vramBefore.free_mb} MiB free / ${vramBefore.total_mb} MiB total (${vramBefore.used_mb} MiB used by other apps)`);
        if (wave === 2 && vramBefore.free_mb < 8500) {
            pushLog(`[GPU Warning] Only ${vramBefore.free_mb} MiB VRAM free before starting Drama-3. Close other GPU-resident models (e.g. LM Studio, Ollama, Koboldcpp) if synthesis slows down.`);
        }
    }

    const bin = findAudioCppExecutable();
    if (!bin) {
        throw new Error('Audio.cpp executable not found. Install audiocpp_server or configure ELLIPSISPROSE_AUDIOCPP_DIR.');
    }

    let configFile = WAVE_CONFIGS[wave];
    if (!fs.existsSync(configFile)) {
        throw new Error(`Configuration preset not found: ${configFile}`);
    }

    let resolvedOffload = null;
    if (wave === 2) {
        const resolved = resolveWave2RuntimeConfig(configFile, wave2Norm, vramBefore);
        configFile = resolved.configPath;
        resolvedOffload = resolved.offloadSummary;
        pushLog(
            `[Offload] Wave 2 (${resolvedOffload.mode}, run=${resolvedOffload.run_mode}, profile=${resolvedOffload.profile}): ` +
            (resolvedOffload.disk_experts
                ? `disk_experts=true, pin=${resolvedOffload.pin_experts}, cache_slots=${resolvedOffload.expert_cache_size}/256`
                : `GPU_layers=${resolvedOffload.gpu_expert_layers}/40, CPU_layers=${resolvedOffload.cpu_expert_layers}/40`) +
            `, codec=${resolvedOffload.codec_backend}, ctx=${resolvedOffload.context_length}, threads=${resolvedOffload.threads}`
        );
    }

    state.cudaWarmupSuppressed = 0;
    state.cudaWarmupFirstLogged = false;
    state.cudaGraphReuseSuppressed = 0;
    pushLog(`Spawning Audio.cpp Wave ${wave} daemon (${WAVE_MODEL_IDS[wave]}) using ${bin}...`);
    const args = ['--config', configFile];
    const modelSpecsDir = path.join(LEGACY_AUDIOCPP_HOME, 'model_specs');
    if (fs.existsSync(modelSpecsDir)) {
        args.push('--model-spec-override', modelSpecsDir);
    }
    const proc = spawn(bin, args, {
        cwd: resolveDaemonCwd(bin),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', d => logDaemonStreamChunk('stdout', d));
    proc.stderr.on('data', d => logDaemonStreamChunk('stderr', d));

    proc.on('exit', (code, signal) => {
        pushLog(`Audio.cpp daemon exited with code ${code}, signal ${signal}`);
        if (state.activeProc === proc) {
            state.activeProc = null;
            state.activeWave = null;
            state.activeModel = null;
            state.activeWave2RequestedSig = null;
            state.activeOffload = null;
        }
    });

    state.activeProc = proc;
    state.activeWave = wave;
    state.activeModel = WAVE_MODEL_IDS[wave];
    state.procStartTime = Date.now();
    state.activeWave2RequestedSig = wave === 2 ? wave2Sig : null;
    state.activeOffload = resolvedOffload;

    const healthUrl = `http://127.0.0.1:${settings.daemonPort}/health`;
    pushLog(`Polling health at ${healthUrl}...`);
    try {
        await pollHealth(healthUrl, 120000);
        pushLog(`Audio.cpp Wave ${wave} daemon is healthy and ready.`);
    } catch (e) {
        pushLog(`Health check failed: ${e.message}. Testing fallback /v1/health endpoint...`);
        try {
            await pollHealth(`http://127.0.0.1:${settings.daemonPort}/v1/health`, 10000);
            pushLog(`Audio.cpp Wave ${wave} daemon responded on fallback endpoint.`);
        } catch (e2) {
            await stopActiveDaemon();
            throw new Error(`Failed to activate Wave ${wave} daemon: ${e.message}`);
        }
    }

    return {
        status: 'ok',
        active_wave: wave,
        active_model: state.activeModel,
        pid: proc.pid,
        offload: state.activeOffload
    };
}

// ---------------------------------------------------------------------------
// HTTP Request Handlers
// ---------------------------------------------------------------------------
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function sendJson(res, statusCode, data) {
    if (res.headersSent || res.writableEnded) return;
    setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
}

function isWaveConfigModelAvailable(waveNum, binPath, daemonAlive) {
    const cfgPath = WAVE_CONFIGS[waveNum];
    if (!cfgPath || !fs.existsSync(cfgPath)) return false;
    if (!binPath && !daemonAlive) return false;
    try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const models = Array.isArray(cfg?.models) ? cfg.models : [];
        if (models.length === 0) return false;
        // If we have a local binary path, verify at least one declared model file exists when resolvable
        const baseDirs = [
            AUDIOCPP_CONFIGS_DIR,
            binPath ? path.resolve(path.dirname(binPath), '..', '..') : '',
            LEGACY_AUDIOCPP_HOME,
            ROOT_DIR
        ].filter(Boolean);
        let anyPathChecked = false;
        let anyPathExists = false;
        for (const m of models) {
            const p = m?.path || m?.weights;
            if (!p) continue;
            if (path.isAbsolute(p)) {
                anyPathChecked = true;
                if (fs.existsSync(p)) { anyPathExists = true; break; }
            } else {
                for (const bd of baseDirs) {
                    const candidate = path.resolve(bd, p);
                    if (fs.existsSync(candidate)) {
                        anyPathChecked = true;
                        anyPathExists = true;
                        break;
                    }
                }
                if (!anyPathChecked && baseDirs.some(bd => fs.existsSync(bd))) {
                    anyPathChecked = true;
                }
            }
        }
        return (!anyPathChecked || anyPathExists || daemonAlive);
    } catch (_) {
        return Boolean(binPath || daemonAlive);
    }
}

function handleHealth(req, res) {
    isPortListening(settings.daemonPort).then(daemonAlive => {
        const bin = findAudioCppExecutable();
        const availableWaves = [1, 2, 3].filter(w => isWaveConfigModelAvailable(w, bin, daemonAlive));
        sendJson(res, 200, {
            status: 'ok',
            bridge_port: settings.port,
            swap_mode: settings.swapMode,
            audiocpp_server_port: settings.daemonPort,
            audiocpp_server_alive: daemonAlive,
            audiocpp_bin: bin,
            available_waves: availableWaves,
            active_wave: state.activeWave,
            active_model: state.activeModel,
            offload: state.activeOffload,
            perf: {
                last: state.perfStats.last,
                avgRealtimeX: state.perfStats.avgRealtimeX,
                avgRtf: state.perfStats.avgRtf,
                sampleCount: state.perfStats.recent.length
            },
            uptime_seconds: state.procStartTime ? Math.round((Date.now() - state.procStartTime) / 1000) : 0,
            gpu_vram: queryGpuVramStatus(),
            cache_dir: CACHE_DIR,
            routes: {
                health: '/health',
                logs: '/logs',
                voices: '/voices/:speakerKey',
                activate_wave: '/wave/:n/activate',
                proxy_v1: '/v1/*'
            }
        });
    });
}

function handlePutVoice(req, res, speakerKey) {
    const sanitized = speakerKey.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    if (!sanitized) {
        return sendJson(res, 400, { error: 'Invalid speakerKey' });
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 44) {
            return sendJson(res, 400, { error: 'Payload too short to be a valid WAV audio file' });
        }

        const fileName = `${sanitized}.wav`;
        const filePath = path.join(CACHE_DIR, fileName);

        try {
            fs.writeFileSync(filePath, buffer);
            try {
                const staleVq = getVqSidecarPath(filePath);
                if (fs.existsSync(staleVq)) fs.unlinkSync(staleVq);
            } catch (_) {}
            const refPath = path.resolve(filePath);

            // Immediately delete any superseded _master_<hash>.wav files for the exact same
            // story+speaker while preserving all other characters' and stories' saved Master WAVs.
            const masterMatch = sanitized.match(/^(.+_master)_[a-zA-Z0-9]+$/i);
            const masterPrefix = masterMatch ? (masterMatch[1] + '_') : '';
            if (masterPrefix) {
                try {
                    for (const existing of fs.readdirSync(CACHE_DIR)) {
                        if (!existing.toLowerCase().endsWith('.wav') || existing.toLowerCase() === fileName.toLowerCase()) continue;
                        if (existing.toLowerCase().startsWith(masterPrefix.toLowerCase())) {
                            unlinkWavAndSidecar(path.join(CACHE_DIR, existing));
                        }
                    }
                } catch (_) {}
            }

            pushLog(`Saved reference voice WAV [${sanitized}] (${buffer.length} bytes) to ${refPath}`);
            sendJson(res, 200, {
                status: 'ok',
                key: sanitized,
                refPath,
                size: buffer.length
            });
        } catch (err) {
            pushLog(`Failed to write voice file: ${err.message}`);
            sendJson(res, 500, { error: `Failed to save voice file: ${err.message}` });
        }
    });
    req.on('error', err => {
        sendJson(res, 500, { error: err.message });
    });
}

function handleHeadVoice(req, res, speakerKey) {
    const sanitized = speakerKey.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    const filePath = path.join(CACHE_DIR, `${sanitized}.wav`);
    if (!fs.existsSync(filePath)) {
        setCorsHeaders(res);
        res.writeHead(404);
        return res.end();
    }
    try {
        const stat = fs.statSync(filePath);
        if (stat.size < 44) {
            setCorsHeaders(res);
            res.writeHead(404);
            return res.end();
        }
        // Touch mtime on active HEAD verification so active voices are not aged out mid-render
        try {
            const now = new Date();
            fs.utimesSync(filePath, now, now);
        } catch (_) {}
        setCorsHeaders(res);
        res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': stat.size
        });
        return res.end();
    } catch (_) {
        setCorsHeaders(res);
        res.writeHead(404);
        return res.end();
    }
}

function handleDeleteVoice(req, res, speakerKey) {
    const sanitized = speakerKey.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    const filePath = path.join(CACHE_DIR, `${sanitized}.wav`);
    let deleted = false;
    if (fs.existsSync(filePath)) {
        unlinkWavAndSidecar(filePath);
        deleted = !fs.existsSync(filePath);
    }
    sendJson(res, 200, { status: 'ok', key: sanitized, deleted });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw.trim() ? JSON.parse(raw) : {});
            } catch (_) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

/**
 * Deletes cached Master WAV files for a specific speaker across all known aliases
 * within a story without touching any other cast member or story WAVs.
 */
function invalidateSpeakerVoices({ storyId = '', speakerAliases = [] } = {}) {
    if (!fs.existsSync(CACHE_DIR)) return { deleted: 0, deletedFiles: [], remaining: 0 };
    const cleanStoryId = String(storyId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.toLowerCase().endsWith('.wav'));
    if (!cleanStoryId) {
        return { deleted: 0, deletedFiles: [], remaining: files.length };
    }

    const prefixes = new Set();
    const storyLower = cleanStoryId.toLowerCase();
    for (const rawAlias of (Array.isArray(speakerAliases) ? speakerAliases : [])) {
        const trimmed = String(rawAlias || '').trim();
        if (!trimmed) continue;
        const variants = new Set([trimmed, trimmed.replace(/\s+/g, '_')]);
        if (trimmed.toLowerCase() === 'narrator') {
            variants.add('narrator');
            variants.add('NARRATOR');
        }
        for (const variant of variants) {
            const sanitizedAlias = variant.replace(/[^a-zA-Z0-9_\.-]/g, '_').toLowerCase();
            if (sanitizedAlias) {
                prefixes.add(`${storyLower}_${sanitizedAlias}_master`);
            }
        }
    }

    let deleted = 0;
    const deletedFiles = [];
    for (const f of files) {
        const lower = f.toLowerCase();
        let matches = false;
        for (const p of prefixes) {
            if (lower.startsWith(p + '_') || lower === (p + '.wav')) {
                matches = true;
                break;
            }
        }
        if (matches) {
            try {
                unlinkWavAndSidecar(path.join(CACHE_DIR, f));
                deleted++;
                deletedFiles.push(f);
            } catch (_) {}
        }
    }

    const remaining = fs.readdirSync(CACHE_DIR).filter(f => f.toLowerCase().endsWith('.wav')).length;
    return { deleted, deletedFiles, remaining };
}

function handleInvalidateVoices(req, res) {
    readJsonBody(req)
        .then(body => {
            const speakerAliases = Array.isArray(body.speakerAliases) ? body.speakerAliases : [];
            const result = invalidateSpeakerVoices({
                storyId: body.storyId || '',
                speakerAliases
            });
            if (result.deleted > 0) {
                pushLog(`Invalidated ${result.deleted} cached voice WAV(s) for ${body.storyId || 'story'} [${speakerAliases.join(', ')}]`);
            }
            sendJson(res, 200, { status: 'ok', ...result });
        })
        .catch(err => sendJson(res, 500, { error: err.message }));
}

function handlePruneVoices(req, res) {
    readJsonBody(req)
        .then(body => {
            if (body.keepStoryId) {
                state.activeStoryPrefix = String(body.keepStoryId).replace(/[^a-zA-Z0-9_-]/g, '_') + '_';
            }
            const result = pruneVoiceCache({
                keepStoryId: body.keepStoryId || '',
                deleteAll: Boolean(body.deleteAll),
                maxAgeMs: Number(body.maxAgeMs) || 0
            });
            if (result.deleted > 0) {
                pushLog(`Pruned ${result.deleted} ephemeral voice WAV sample(s); ${result.remaining} remaining.`);
            }
            sendJson(res, 200, { status: 'ok', ...result });
        })
        .catch(err => sendJson(res, 500, { error: err.message }));
}

function handleGetVoice(req, res, speakerKey) {
    const sanitized = speakerKey.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    const fileName = `${sanitized}.wav`;
    const filePath = path.join(CACHE_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: `Voice file not found for ${sanitized}` });
    }

    try {
        const stat = fs.statSync(filePath);
        try {
            const now = new Date();
            fs.utimesSync(filePath, now, now);
        } catch (_) {}
        setCorsHeaders(res);
        res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': stat.size
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        sendJson(res, 500, { error: e.message });
    }
}

function handleActivateWave(req, res, waveStr) {
    const waveNumber = parseInt(waveStr, 10);
    readJsonBody(req)
        .then(overrides => activateWave(waveNumber, overrides))
        .then(result => sendJson(res, 200, result))
        .catch(err => {
            pushLog(`activateWave error: ${err.message}`);
            sendJson(res, 500, { error: err.message });
        });
}

// ---------------------------------------------------------------------------
// Drama-3 VQ Reference Code Sidecar Cache & Performance Telemetry
// ---------------------------------------------------------------------------
function computeFileSha256(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function loadCachedVqCodes(wavPath) {
    try {
        if (!fs.existsSync(wavPath)) return null;
        const stat = fs.statSync(wavPath);
        if (!stat.isFile() || stat.size < 44) return null;
        const sidecarPath = getVqSidecarPath(wavPath);
        const wavSha256 = computeFileSha256(wavPath);
        if (fs.existsSync(sidecarPath)) {
            const parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
            if (
                parsed &&
                parsed.version === 1 &&
                parsed.wavSize === stat.size &&
                parsed.wavSha256 === wavSha256 &&
                Array.isArray(parsed.vq_codes) &&
                parsed.vq_codes.length === 10 &&
                Array.isArray(parsed.vq_codes[0]) &&
                parsed.vq_codes[0].length > 0
            ) {
                return { vq_codes: parsed.vq_codes, stat, wavSha256 };
            }
        }
        return { vq_codes: null, stat, wavSha256 };
    } catch (_) {
        return null;
    }
}

function saveCachedVqCodes(wavPath, stat, wavSha256, vqCodes) {
    if (!Array.isArray(vqCodes) || vqCodes.length !== 10 || !Array.isArray(vqCodes[0]) || vqCodes[0].length === 0) {
        return false;
    }
    const sidecarPath = getVqSidecarPath(wavPath);
    const tmpPath = `${sidecarPath}.tmp.${process.pid}.${Date.now()}`;
    const record = {
        version: 1,
        wavPath,
        wavSize: stat.size,
        wavMtimeMs: stat.mtimeMs,
        wavSha256,
        frames: vqCodes[0].length,
        vq_codes: vqCodes
    };
    fs.writeFileSync(tmpPath, JSON.stringify(record));
    fs.renameSync(tmpPath, sidecarPath);
    return true;
}

function postDaemonJson(pathname, payloadObj, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const payloadBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
        const req = http.request(`http://127.0.0.1:${settings.daemonPort}${pathname}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(payloadBuf.length)
            },
            agent: proxyAgent,
            timeout: timeoutMs
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(raw));
                    } catch (e) {
                        reject(new Error(`Invalid JSON from daemon ${pathname}: ${e.message}`));
                    }
                } else {
                    reject(new Error(`Daemon ${pathname} HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Daemon ${pathname} request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.write(payloadBuf);
        req.end();
    });
}

async function resolveReferencesWithVqCodes(bodyObj) {
    const meta = { hits: 0, encoded: 0, total: 0, encodeMs: 0, active: false };
    if (!bodyObj || typeof bodyObj !== 'object' || !bodyObj.options || typeof bodyObj.options !== 'object') {
        return { bodyObj, meta };
    }
    const isDramaTarget = state.activeWave === 2 || /drama/i.test(String(bodyObj.model || ''));
    if (!isDramaTarget) {
        return { bodyObj, meta };
    }

    const refKey = bodyObj.options.references !== undefined
        ? 'references'
        : (bodyObj.options.multi_reference_cond !== undefined ? 'multi_reference_cond' : null);
    if (!refKey) {
        return { bodyObj, meta };
    }

    const rawVal = bodyObj.options[refKey];
    const wasString = typeof rawVal === 'string';
    let refs = null;
    try {
        refs = wasString ? JSON.parse(rawVal) : rawVal;
    } catch (_) {
        return { bodyObj, meta };
    }
    if (!Array.isArray(refs) || refs.length === 0) {
        return { bodyObj, meta };
    }

    meta.active = true;
    meta.total = refs.length;
    const byNormPath = new Map();
    const missingList = [];

    for (const desc of refs) {
        if (!desc || typeof desc !== 'object') continue;
        if (Array.isArray(desc.vq_codes) && desc.vq_codes.length === 10) {
            meta.hits++;
            continue;
        }
        const rawAudioPath = desc.audio_path || desc.audio;
        if (typeof rawAudioPath !== 'string' || !rawAudioPath.trim()) continue;
        const normKey = path.resolve(rawAudioPath).toLowerCase();
        if (byNormPath.has(normKey)) {
            const prev = byNormPath.get(normKey);
            if (prev.vq_codes) meta.hits++;
            continue;
        }
        const cacheProbe = loadCachedVqCodes(rawAudioPath);
        if (!cacheProbe) {
            byNormPath.set(normKey, { rawAudioPath, vq_codes: null, stat: null, wavSha256: null });
            continue;
        }
        if (cacheProbe.vq_codes) {
            meta.hits++;
            byNormPath.set(normKey, { rawAudioPath, vq_codes: cacheProbe.vq_codes, stat: cacheProbe.stat, wavSha256: cacheProbe.wavSha256 });
        } else {
            const entry = {
                rawAudioPath,
                text: String(desc.text || 'Reference speech.').replace(/<\|speaker:\d+\|>/gi, '').trim() || 'Reference speech.',
                vq_codes: null,
                stat: cacheProbe.stat,
                wavSha256: cacheProbe.wavSha256
            };
            byNormPath.set(normKey, entry);
            missingList.push(entry);
        }
    }

    if (missingList.length > 0) {
        const encStart = Date.now();
        try {
            // Batch up to 16 references per encode_reference_only call (Drama-3 speaker tag limit 0..15)
            for (let offset = 0; offset < missingList.length; offset += 16) {
                const batch = missingList.slice(offset, offset + 16);
                const encodeRefs = batch.map((item, idx) => ({
                    text: `<|speaker:${idx}|> ${item.text}`,
                    audio_path: item.rawAudioPath
                }));
                const taskResp = await postDaemonJson('/v1/tasks/run', {
                    model: bodyObj.model || 'drama-3',
                    request: {
                        text: 'Prepare references.',
                        options: {
                            encode_reference_only: true,
                            references: JSON.stringify(encodeRefs)
                        }
                    }
                }, 300000);
                const artifacts = Array.isArray(taskResp?.artifacts) ? taskResp.artifacts : [];
                for (let idx = 0; idx < batch.length; idx++) {
                    const art = artifacts.find(a => a && a.id === `drama3_reference_${idx}`) || artifacts[idx];
                    if (!art || typeof art.payload !== 'string') continue;
                    const decoded = JSON.parse(Buffer.from(art.payload, 'base64').toString('utf8'));
                    if (Array.isArray(decoded?.vq_codes) && decoded.vq_codes.length === 10 && decoded.vq_codes[0]?.length > 0) {
                        batch[idx].vq_codes = decoded.vq_codes;
                        saveCachedVqCodes(batch[idx].rawAudioPath, batch[idx].stat, batch[idx].wavSha256, decoded.vq_codes);
                        meta.encoded++;
                    }
                }
            }
        } catch (encErr) {
            pushLog(`[VQ Cache Warning] encode_reference_only failed (${encErr.message}); falling back to raw audio_path.`);
        }
        meta.encodeMs = Date.now() - encStart;
    }

    const rewritten = refs.map(desc => {
        if (!desc || typeof desc !== 'object') return desc;
        if (Array.isArray(desc.vq_codes) && desc.vq_codes.length === 10) return desc;
        const rawAudioPath = desc.audio_path || desc.audio;
        if (typeof rawAudioPath !== 'string' || !rawAudioPath.trim()) return desc;
        const entry = byNormPath.get(path.resolve(rawAudioPath).toLowerCase());
        if (entry && Array.isArray(entry.vq_codes) && entry.vq_codes.length === 10) {
            return { text: desc.text, vq_codes: entry.vq_codes };
        }
        return desc;
    });

    const nextBody = {
        ...bodyObj,
        options: {
            ...bodyObj.options,
            [refKey]: wasString ? JSON.stringify(rewritten) : rewritten
        }
    };
    pushLog(`[VQ Cache] References: ${meta.hits}/${meta.total} cached hits, ${meta.encoded} newly encoded (${meta.encodeMs}ms).`);
    return { bodyObj: nextBody, meta };
}

function recordWave2Perf(modelId, audioSec, wallSec, vqMeta) {
    if (!(audioSec > 0 && wallSec > 0)) return;
    const realtimeX = audioSec / wallSec;
    const rtf = wallSec / audioSec;
    const entry = {
        ts: new Date().toISOString(),
        model: modelId || 'drama-3',
        audioSec: Number(audioSec.toFixed(2)),
        wallSec: Number(wallSec.toFixed(2)),
        realtimeX: Number(realtimeX.toFixed(3)),
        rtf: Number(rtf.toFixed(3)),
        vqHits: vqMeta?.hits || 0,
        vqEncoded: vqMeta?.encoded || 0,
        vqTotal: vqMeta?.total || 0
    };
    state.perfStats.last = entry;
    state.perfStats.recent.push(entry);
    if (state.perfStats.recent.length > 20) state.perfStats.recent.shift();
    const sumAudio = state.perfStats.recent.reduce((s, e) => s + e.audioSec, 0);
    const sumWall = state.perfStats.recent.reduce((s, e) => s + e.wallSec, 0);
    state.perfStats.avgRealtimeX = sumWall > 0 ? Number((sumAudio / sumWall).toFixed(3)) : null;
    state.perfStats.avgRtf = sumAudio > 0 ? Number((sumWall / sumAudio).toFixed(3)) : null;
    pushLog(
        `[Perf] Wave 2 ${entry.model}: ${entry.audioSec.toFixed(1)}s audio in ${entry.wallSec.toFixed(1)}s -> ` +
        `${entry.realtimeX.toFixed(2)}x realtime (RTF ${entry.rtf.toFixed(2)}) | rolling=${state.perfStats.avgRealtimeX.toFixed(2)}x`
    );
}

function forwardProxyRequest(req, res, targetUrl, headers, bodyBuffer = null, telemetryCtx = null) {
    let finished = false;
    const reqStartMs = Date.now();
    const proxyReq = http.request(targetUrl, {
        method: req.method,
        headers,
        agent: proxyAgent,
        timeout: 900000 // 15 minutes for large multi-speaker Drama-3 chunks + model load
    }, proxyRes => {
        if (finished || res.headersSent || res.writableEnded) return;
        finished = true;
        setCorsHeaders(res);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (k.toLowerCase() !== 'access-control-allow-origin') {
                res.setHeader(k, v);
            }
        }
        res.writeHead(proxyRes.statusCode);

        if (telemetryCtx && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            let hdrBuf = Buffer.alloc(0);
            let totalBytes = 0;
            proxyRes.on('data', chunk => {
                totalBytes += chunk.length;
                if (hdrBuf.length < 44) {
                    const needed = 44 - hdrBuf.length;
                    hdrBuf = Buffer.concat([hdrBuf, chunk.subarray(0, needed)]);
                }
            });
            proxyRes.on('end', () => {
                if (hdrBuf.length >= 44 && hdrBuf.toString('ascii', 0, 4) === 'RIFF' && hdrBuf.toString('ascii', 8, 12) === 'WAVE') {
                    const byteRate = hdrBuf.readUInt32LE(28);
                    if (byteRate > 0) {
                        const audioSec = Math.max(0, (totalBytes - 44) / byteRate);
                        const wallSec = (Date.now() - reqStartMs) / 1000;
                        recordWave2Perf(telemetryCtx.modelId, audioSec, wallSec, telemetryCtx.vqMeta);
                    }
                }
            });
        }

        proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
        if (finished) return;
        finished = true;
        pushLog(`Proxy timeout (900s) waiting for ${targetUrl}`);
        proxyReq.destroy();
        sendJson(res, 504, { error: 'Audio.cpp proxy request timed out' });
    });

    proxyReq.on('error', err => {
        if (finished) return;
        finished = true;
        pushLog(`Proxy error to ${targetUrl}: ${err.message}`);
        sendJson(res, 502, {
            error: `Audio.cpp server on port ${settings.daemonPort} is not reachable`,
            details: err.message
        });
    });

    req.on('aborted', () => {
        if (!finished) {
            finished = true;
            proxyReq.destroy();
        }
    });
    res.on('close', () => {
        if (!res.writableFinished && !finished) {
            finished = true;
            proxyReq.destroy();
        }
    });

    if (bodyBuffer !== null) {
        proxyReq.write(bodyBuffer);
        proxyReq.end();
    } else {
        req.pipe(proxyReq);
    }
}

function handleProxyV1(req, res, pathname = '') {
    const targetUrl = `http://127.0.0.1:${settings.daemonPort}${req.url}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    const isSpeechPost = req.method === 'POST' && (pathname === '/v1/audio/speech' || req.url.split('?')[0] === '/v1/audio/speech');
    if (!isSpeechPost) {
        return forwardProxyRequest(req, res, targetUrl, headers, null, null);
    }

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
        const rawBuf = Buffer.concat(chunks);
        let parsed = null;
        try {
            parsed = JSON.parse(rawBuf.toString('utf8'));
        } catch (_) {
            return forwardProxyRequest(req, res, targetUrl, headers, rawBuf, null);
        }

        const isDramaModel = state.activeWave === 2 || /drama/i.test(String(parsed?.model || ''));
        let finalBuf = rawBuf;
        let vqMeta = null;
        if (isDramaModel) {
            try {
                const resolved = await resolveReferencesWithVqCodes(parsed);
                vqMeta = resolved.meta;
                finalBuf = Buffer.from(JSON.stringify(resolved.bodyObj), 'utf8');
                delete headers['transfer-encoding'];
                headers['content-length'] = String(finalBuf.length);
            } catch (vqErr) {
                pushLog(`[VQ Cache Warning] Unexpected error resolving references (${vqErr.message}); forwarding raw payload.`);
            }
        }
        const telemetryCtx = isDramaModel ? { modelId: parsed?.model || state.activeModel || 'drama-3', vqMeta } : null;
        forwardProxyRequest(req, res, targetUrl, headers, finalBuf, telemetryCtx);
    });
    req.on('error', err => {
        sendJson(res, 400, { error: `Failed to read speech request body: ${err.message}` });
    });
}

// ---------------------------------------------------------------------------
// HTTP Server Creation
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // Route: GET /health
    if (req.method === 'GET' && pathname === '/health') {
        return handleHealth(req, res);
    }

    // Route: GET /logs
    if (req.method === 'GET' && pathname === '/logs') {
        return sendJson(res, 200, { logs: state.logRing });
    }

    // Route: POST /voices/invalidate
    if (req.method === 'POST' && pathname === '/voices/invalidate') {
        return handleInvalidateVoices(req, res);
    }

    // Route: POST /voices/prune
    if (req.method === 'POST' && pathname === '/voices/prune') {
        return handlePruneVoices(req, res);
    }

    // Route: PUT / GET / HEAD / DELETE /voices/:speakerKey
    const voiceMatch = pathname.match(/^\/voices\/([^\/]+)$/);
    if (voiceMatch) {
        const decodedKey = decodeURIComponent(voiceMatch[1]);
        if (req.method === 'PUT') {
            return handlePutVoice(req, res, decodedKey);
        }
        if (req.method === 'GET') {
            return handleGetVoice(req, res, decodedKey);
        }
        if (req.method === 'HEAD') {
            return handleHeadVoice(req, res, decodedKey);
        }
        if (req.method === 'DELETE') {
            return handleDeleteVoice(req, res, decodedKey);
        }
    }

    // Route: POST /wave/:waveNumber/activate
    const waveMatch = pathname.match(/^\/wave\/([123])\/activate$/);
    if (req.method === 'POST' && waveMatch) {
        return handleActivateWave(req, res, waveMatch[1]);
    }

    // Route: POST /v1/* (Reverse proxy to Audio.cpp daemon)
    if (pathname.startsWith('/v1/')) {
        return handleProxyV1(req, res, pathname);
    }

    // Fallback 404
    sendJson(res, 404, { error: `Not found: ${req.method} ${pathname}` });
});

// Clean shutdown handler
function shutdown() {
    pushLog('Shutting down Audio Studio Bridge...');
    server.close();
    stopActiveDaemon().finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.timeout = 0;
server.keepAliveTimeout = 910000;
server.requestTimeout = 910000;

server.listen(settings.port, settings.bind, () => {
    pushLog(`=== EllipsisProse Audio Studio Bridge running on http://${settings.bind}:${settings.port} ===`);
    pushLog(`Configured daemon port: ${settings.daemonPort} | Swap mode: ${settings.swapMode}`);
    pushLog(`Voice reference cache: ${CACHE_DIR}`);
});
