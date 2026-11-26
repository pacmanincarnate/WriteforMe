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
            try { fs.unlinkSync(fullPath); deleted++; } catch (_) {}
            continue;
        }
        if (cleanKeepPrefix && !f.startsWith(cleanKeepPrefix)) {
            try { fs.unlinkSync(fullPath); deleted++; } catch (_) {}
            continue;
        }
        if (maxAgeMs > 0 && (now - stat.mtimeMs) > maxAgeMs) {
            try { fs.unlinkSync(fullPath); deleted++; } catch (_) {}
            continue;
        }
        const m = f.match(/^(.+_master)_[a-zA-Z0-9]+\.wav$/i);
        if (m) {
            const key = m[1].toLowerCase();
            const prev = byMasterPrefix.get(key);
            if (!prev || stat.mtimeMs > prev.mtimeMs) {
                if (prev) {
                    try { fs.unlinkSync(prev.fullPath); deleted++; } catch (_) {}
                }
                byMasterPrefix.set(key, { fullPath, mtimeMs: stat.mtimeMs });
            } else {
                try { fs.unlinkSync(fullPath); deleted++; } catch (_) {}
            }
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
    cudaWarmupSuppressed: 0,
    cudaWarmupFirstLogged: false,
    logRing: [],
    swapMode: settings.swapMode
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

    const closed = await waitForPortClosed(settings.daemonPort, 10000);
    if (!closed) {
        pushLog(`Warning: Port ${settings.daemonPort} remained busy after termination`);
    } else {
        pushLog(`Port ${settings.daemonPort} released successfully.`);
        // Give CUDA/WDDM a brief moment to reclaim freed VRAM before spawning the next model
        await sleep(400);
    }
}

async function activateWave(waveNumber) {
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

    // Pattern A: child process manager
    const daemonAlive = await isPortListening(settings.daemonPort);
    if (state.activeWave === wave && daemonAlive) {
        return {
            status: 'ok',
            active_wave: wave,
            active_model: state.activeModel,
            already_active: true
        };
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

    const configFile = WAVE_CONFIGS[wave];
    if (!fs.existsSync(configFile)) {
        throw new Error(`Configuration preset not found: ${configFile}`);
    }

    state.cudaWarmupSuppressed = 0;
    state.cudaWarmupFirstLogged = false;
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
        }
    });

    state.activeProc = proc;
    state.activeWave = wave;
    state.activeModel = WAVE_MODEL_IDS[wave];
    state.procStartTime = Date.now();

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

    const vramBefore = queryGpuVramStatus();
    if (vramBefore) {
        pushLog(`[GPU] ${vramBefore.gpu}: ${vramBefore.free_mb} MiB free / ${vramBefore.total_mb} MiB total (${vramBefore.used_mb} MiB used by other apps)`);
        if (wave === 2 && vramBefore.free_mb < 8500) {
            pushLog(`[GPU Warning] Only ${vramBefore.free_mb} MiB VRAM free before starting Drama-3. Close other GPU-resident models (e.g. LM Studio, Ollama, Koboldcpp) if synthesis slows down.`);
        }
    }
            throw new Error(`Failed to activate Wave ${wave} daemon: ${e.message}`);
        }
    }

    return {
        status: 'ok',
        active_wave: wave,
        active_model: state.activeModel,
        pid: proc.pid
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
                            try { fs.unlinkSync(path.join(CACHE_DIR, existing)); } catch (_) {}
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
        try {
            fs.unlinkSync(filePath);
            deleted = true;
        } catch (_) {}
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
                fs.unlinkSync(path.join(CACHE_DIR, f));
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
    activateWave(waveNumber)
        .then(result => sendJson(res, 200, result))
        .catch(err => {
            pushLog(`activateWave error: ${err.message}`);
            sendJson(res, 500, { error: err.message });
        });
}

function handleProxyV1(req, res) {
    const targetUrl = `http://127.0.0.1:${settings.daemonPort}${req.url}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    let finished = false;
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

    req.pipe(proxyReq);
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
        return handleProxyV1(req, res);
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
