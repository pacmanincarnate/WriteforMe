/**
 * EllipsisProse One-Click Launcher
 * Starts the local web server (server.js on port 3000), starts the Audio Studio
 * Bridge (audio-studio-bridge.js on port 5020), opens the app in the default
 * browser at http://localhost:3000/, and pre-warms Audio.cpp (Wave 1) via the bridge.
 *
 * Usage:
 *   node launch.js [--no-browser] [--no-bridge] [--no-prewarm] [--dry-run]
 */

'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT_DIR = __dirname;
const PORTS = require('./src/config/ports.json');

function parseArgs(argv) {
    const opts = {
        webPort: Number(process.env.PORT || PORTS.web),
        bridgePort: Number(process.env.AUDIO_STUDIO_BRIDGE_PORT || PORTS.audioStudioBridge),
        daemonPort: Number(process.env.AUDIOCPP_PORT || PORTS.audioCpp),
        openBrowser: true,
        startBridge: true,
        prewarmAudio: process.env.ELLIPSISPROSE_PREWARM_AUDIO !== '0',
        dryRun: process.env.ELLIPSISPROSE_LAUNCHER_DRYRUN === '1',
        customUrl: ''
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--no-browser') opts.openBrowser = false;
        else if (arg === '--no-bridge') opts.startBridge = false;
        else if (arg === '--no-prewarm') opts.prewarmAudio = false;
        else if (arg === '--dry-run') opts.dryRun = true;
        else if (arg === '--port' && argv[i + 1]) opts.webPort = Number(argv[++i]);
        else if (arg === '--bridge-port' && argv[i + 1]) opts.bridgePort = Number(argv[++i]);
        else if (arg === '--daemon-port' && argv[i + 1]) opts.daemonPort = Number(argv[++i]);
        else if (arg === '--url' && argv[i + 1]) opts.customUrl = argv[++i];
    }

    return opts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPortListening(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host })
            .on('connect', () => {
                socket.destroy();
                resolve(true);
            })
            .on('error', () => resolve(false));
        socket.setTimeout(1000, () => {
            socket.destroy();
            resolve(false);
        });
    });
}

function httpRequestJson(url, { method = 'GET', timeoutMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(body); } catch (_) {}
                resolve({ statusCode: res.statusCode, body, json: parsed });
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timed out (${url})`));
        });
        req.on('error', reject);
        req.end();
    });
}

async function waitForHttpReady(url, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await httpRequestJson(url, { method: 'GET', timeoutMs: 2000 });
            if (res.statusCode >= 200 && res.statusCode < 400) {
                return res;
            }
        } catch (_) {}
        await sleep(300);
    }
    throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}

function spawnDetachedService(title, scriptFile, args = [], extraEnv = {}) {
    const scriptPath = path.join(ROOT_DIR, scriptFile);
    const env = { ...process.env, ...extraEnv };

    if (process.platform === 'win32') {
        // Launch in its own minimized window using windowsVerbatimArguments so cmd/start quotes stay intact
        const quotedArgs = [scriptFile, ...args]
            .map((a) => (/[\s"&|<>^()]/.test(String(a)) ? `"${String(a).replace(/"/g, '')}"` : String(a)))
            .join(' ');
        const safeTitle = String(title || 'EllipsisProse').replace(/"/g, '');
        const child = spawn(
            'cmd.exe',
            ['/d', '/c', `start "${safeTitle}" /min cmd /k node ${quotedArgs}`],
            {
                cwd: ROOT_DIR,
                env,
                detached: true,
                stdio: 'ignore',
                windowsVerbatimArguments: true
            }
        );
        child.unref();
        return child;
    }

    const child = spawn(process.execPath, [scriptPath, ...args], {
        cwd: ROOT_DIR,
        env,
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
    return child;
}

function openInDefaultBrowser(targetUrl) {
    if (process.platform === 'win32') {
        const safeUrl = String(targetUrl).replace(/"/g, '');
        const child = spawn('cmd.exe', ['/d', '/c', `start "" "${safeUrl}"`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            windowsVerbatimArguments: true
        });
        child.unref();
        return;
    }
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(opener, [targetUrl], { detached: true, stdio: 'ignore' });
    child.unref();
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const appUrl = opts.customUrl || `http://localhost:${opts.webPort}/`;
    const localWebCheckUrl = `http://127.0.0.1:${opts.webPort}/`;
    const bridgeHealthUrl = `http://127.0.0.1:${opts.bridgePort}/health`;

    console.log('=== EllipsisProse Unified Launcher ===');

    if (opts.dryRun) {
        console.log('[dry-run] Web App URL:', appUrl);
        console.log('[dry-run] Would ensure server.js on port', opts.webPort);
        console.log('[dry-run] Would ensure audio-studio-bridge.js on port', opts.bridgePort, `(enabled=${opts.startBridge})`);
        console.log('[dry-run] Would pre-warm Audio.cpp Wave 1 via bridge:', opts.prewarmAudio);
        console.log('[dry-run] Would open browser:', opts.openBrowser);
        return;
    }

    // 1. Ensure dist/ is built before launching server.js
    const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
    if (!fs.existsSync(distIndex)) {
        console.log('[Build] dist/index.html not found — running Vite production build...');
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const buildRes = spawnSync(npmCmd, ['run', 'build'], {
            cwd: ROOT_DIR,
            stdio: 'inherit',
            // Node 20.12+/22 refuses to spawn .cmd files without a shell (EINVAL, status null).
            shell: process.platform === 'win32'
        });
        if (buildRes.error) {
            throw new Error(`Vite build could not start: ${buildRes.error.message}`);
        }
        if (buildRes.status !== 0) {
            throw new Error(`Vite build failed with exit code ${buildRes.status}`);
        }
    }

    // 2. Web server (server.js)
    const webAlreadyUp = await isPortListening(opts.webPort);
    if (webAlreadyUp) {
        console.log(`[Web] server.js is already listening on port ${opts.webPort}.`);
    } else {
        console.log(`[Web] Starting server.js on port ${opts.webPort}...`);
        spawnDetachedService('EllipsisProse Web Server', 'server.js', [], { PORT: String(opts.webPort) });
        await waitForHttpReady(localWebCheckUrl, 15000);
        console.log(`[Web] Ready at ${appUrl}`);
    }

    // 2. Audio Studio Bridge (audio-studio-bridge.js)
    let bridgeHealth = null;
    if (opts.startBridge) {
        const bridgeAlreadyUp = await isPortListening(opts.bridgePort);
        if (bridgeAlreadyUp) {
            console.log(`[Bridge] audio-studio-bridge.js is already listening on port ${opts.bridgePort}.`);
        } else {
            console.log(`[Bridge] Starting audio-studio-bridge.js on port ${opts.bridgePort}...`);
            spawnDetachedService(
                'EllipsisProse Audio Studio Bridge',
                'audio-studio-bridge.js',
                ['--port', String(opts.bridgePort), '--daemon-port', String(opts.daemonPort)]
            );
        }
        try {
            const res = await waitForHttpReady(bridgeHealthUrl, 15000);
            bridgeHealth = res.json;
            const detectedBin = bridgeHealth?.audiocpp_bin || bridgeHealth?.audiocpp_executable;
            console.log(`[Bridge] Ready at http://127.0.0.1:${opts.bridgePort} (Audio.cpp bin: ${detectedBin || 'not detected'})`);
        } catch (bridgeErr) {
            console.warn(`[Bridge] Warning: ${bridgeErr.message}`);
        }
    }

    // 3. Open the web app immediately so the user doesn't wait for TTS model loading
    if (opts.openBrowser) {
        console.log(`[Browser] Opening ${appUrl}...`);
        openInDefaultBrowser(appUrl);
    }

    // 4. Report GPU VRAM availability so external VRAM-heavy apps (e.g. LM Studio) are surfaced early
    const gpuVram = bridgeHealth?.gpu_vram;
    if (gpuVram && Number.isFinite(gpuVram.free_mb)) {
        console.log(`[GPU] ${gpuVram.gpu}: ${gpuVram.free_mb} MiB free / ${gpuVram.total_mb} MiB total (${gpuVram.used_mb} MiB in use).`);
        if (gpuVram.free_mb < 8500) {
            console.warn(`[GPU Warning] Free VRAM is below 8.5 GiB (${gpuVram.free_mb} MiB). Unload models in other apps (e.g. LM Studio) before running Drama-3 to prevent slow VRAM-to-RAM spilling.`);
        }
    }

    // 5. Pre-warm Audio.cpp (Wave 1) through Audio Studio Bridge unless already listening or disabled
    if (opts.startBridge && opts.prewarmAudio && bridgeHealth) {
        const daemonAlreadyUp = Boolean(bridgeHealth.audiocpp_server_alive || bridgeHealth.daemon_alive) || (await isPortListening(opts.daemonPort));
        const detectedBin = bridgeHealth.audiocpp_bin || bridgeHealth.audiocpp_executable;
        if (daemonAlreadyUp) {
            console.log(`[Audio.cpp] Daemon is already active on port ${opts.daemonPort} (wave=${bridgeHealth.active_wave ?? 'external'}).`);
        } else if (detectedBin) {
            console.log(`[Audio.cpp] Pre-warming Wave 1 (Breeze 2) on port ${opts.daemonPort} via Audio Studio Bridge...`);
            try {
                const actRes = await httpRequestJson(`http://127.0.0.1:${opts.bridgePort}/wave/1/activate`, {
                    method: 'POST',
                    timeoutMs: 130000
                });
                if (actRes.statusCode >= 200 && actRes.statusCode < 300) {
                    console.log(`[Audio.cpp] Wave 1 active and ready (PID ${actRes.json?.pid || 'managed'}).`);
                } else {
                    console.warn(`[Audio.cpp] Wave 1 activation returned HTTP ${actRes.statusCode}: ${actRes.body}`);
                }
            } catch (warmErr) {
                console.warn(`[Audio.cpp] Pre-warm notice: ${warmErr.message}`);
            }
        } else {
            console.log('[Audio.cpp] Executable not detected automatically; skipping Wave 1 pre-warm (set AUDIOCPP_DIR in backends.local.cmd if needed).');
        }
    }

    console.log('=== All requested services launched ===');
}

main().catch((err) => {
    console.error('[Launcher Error]', err);
    process.exit(1);
});
