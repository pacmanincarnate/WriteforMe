/**
 * EllipsisProse Audio Studio Bridge (Hybrid Studio TTS)
 * Manages Audio.cpp process lifecycle across Wave 1 (Breeze 2), Wave 2 (MOSS-TTSD),
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
const CACHE_DIR = path.join(ROOT_DIR, 'cache', 'voices');
const AUDIOCPP_CONFIGS_DIR = path.join(ROOT_DIR, 'audiocpp');

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
    2: path.join(AUDIOCPP_CONFIGS_DIR, 'config_wave2_moss.json'),
    3: path.join(AUDIOCPP_CONFIGS_DIR, 'config_wave3_verifier.json')
};

const WAVE_MODEL_IDS = {
    1: 'breeze-tts',
    2: 'moss_ensemble',
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
    logRing: [],
    swapMode: settings.swapMode
};

function pushLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    state.logRing.push(entry);
    if (state.logRing.length > 200) state.logRing.shift();
    console.log(entry);
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
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve(true);
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

    state.activeWave = null;
    state.activeModel = null;
    state.procStartTime = null;

    const closed = await waitForPortClosed(settings.daemonPort, 10000);
    if (!closed) {
        pushLog(`Warning: Port ${settings.daemonPort} remained busy after termination`);
    } else {
        pushLog(`Port ${settings.daemonPort} released successfully.`);
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

    const bin = findAudioCppExecutable();
    if (!bin) {
        throw new Error('Audio.cpp executable not found. Install audiocpp_server or configure ELLIPSISPROSE_AUDIOCPP_DIR.');
    }

    const configFile = WAVE_CONFIGS[wave];
    if (!fs.existsSync(configFile)) {
        throw new Error(`Configuration preset not found: ${configFile}`);
    }

    pushLog(`Spawning Audio.cpp Wave ${wave} daemon (${WAVE_MODEL_IDS[wave]}) using ${bin}...`);
    const args = ['--config', configFile];
    const modelSpecsDir = 'D:\\AI_Projects\\Audiocpp\\audio.cpp\\model_specs';
    if (fs.existsSync(modelSpecsDir)) {
        args.push('--model-spec-override', modelSpecsDir);
    }
    const proc = spawn(bin, args, {
        cwd: 'D:\\AI_Projects\\Audiocpp\\audio.cpp',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', d => pushLog(`[audiocpp stdout] ${String(d).trim()}`));
    proc.stderr.on('data', d => pushLog(`[audiocpp stderr] ${String(d).trim()}`));

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

    const healthUrl = `http://127.0.0.1:${settings.daemonPort}/v1/health`;
    pushLog(`Polling health at ${healthUrl}...`);
    try {
        await pollHealth(healthUrl, 120000);
        pushLog(`Audio.cpp Wave ${wave} daemon is healthy and ready.`);
    } catch (e) {
        pushLog(`Health check failed: ${e.message}. Testing fallback root health endpoint...`);
        try {
            await pollHealth(`http://127.0.0.1:${settings.daemonPort}/health`, 10000);
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

function handleHealth(req, res) {
    isPortListening(settings.daemonPort).then(daemonAlive => {
        const bin = findAudioCppExecutable();
        sendJson(res, 200, {
            status: 'ok',
            bridge_port: settings.port,
            swap_mode: settings.swapMode,
            audiocpp_server_port: settings.daemonPort,
            audiocpp_server_alive: daemonAlive,
            audiocpp_bin: bin,
            active_wave: state.activeWave,
            active_model: state.activeModel,
            uptime_seconds: state.procStartTime ? Math.round((Date.now() - state.procStartTime) / 1000) : 0,
            cache_dir: CACHE_DIR,
            routes: {
                health: '/health',
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

function handleGetVoice(req, res, speakerKey) {
    const sanitized = speakerKey.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    const fileName = `${sanitized}.wav`;
    const filePath = path.join(CACHE_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: `Voice file not found for ${sanitized}` });
    }

    try {
        const stat = fs.statSync(filePath);
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
        timeout: 900000 // 15 minutes for large multi-speaker MOSS-TTSD chunks + model load
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

    // Route: PUT /voices/:speakerKey
    const voiceMatch = pathname.match(/^\/voices\/([^\/]+)$/);
    if (voiceMatch) {
        if (req.method === 'PUT') {
            return handlePutVoice(req, res, decodeURIComponent(voiceMatch[1]));
        }
        if (req.method === 'GET') {
            return handleGetVoice(req, res, decodeURIComponent(voiceMatch[1]));
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
