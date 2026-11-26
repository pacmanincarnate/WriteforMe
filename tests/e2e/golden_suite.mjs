/**
 * EllipsisProse Permanent Golden Regression E2E Test Suite
 *
 * Pure Node.js + Chrome DevTools Protocol (zero third-party runtime deps).
 * Verifies full functional, structural, persistence, UI, light/dark, mobile,
 * domain-engine, mocked-pipeline, document-parser, and MP3 encoding parity.
 *
 * Modes:
 *   --mode legacy     Serve the pre-refactor single-file app (see "Legacy baseline" below)
 *   --mode local      Start server.js serving dist/ with isolated temp ELLIPSIS_DATA_DIR
 *   --mode subpath    Serve dist/ mounted at /WriteforMe/ with NO /api/* backend (GitHub Pages sim)
 *   --mode singlefile Test dist-singlefile/EllipsisProse-portable.html over HTTP and file:///
 *   --mode upgrade    Seed IDB + localStorage on legacy, then reload Vite dist/ on same origin
 *   --mode pipeline   Drive a full mocked-LLM autopilot run (setup -> bible -> structure -> scenes -> prose)
 *                     on dist/ with a deterministic fake LLM and assert the story it produces
 *   --mode pipeline-legacy   Same scenario against the legacy baseline (needs internet for its CDNs)
 *   --mode pipeline-parity   Run the scenario on legacy and on dist/ and compare the two transcripts
 *   --mode live       Opt-in. Same UI paths against the real Anthropic API (needs ANTHROPIC_API_KEY;
 *                     reports "skipped" and exits 0 without one). See tests/e2e/liveLlm.mjs.
 *
 * Optional:
 *   --screenshots <dir>  Capture light/dark desktop (1440x900) & mobile (390x844) PNGs
 *   --out <file>         pipeline modes: write the run transcript (agent calls + story digest) as JSON
 *
 * Environment:
 *   CHROME_PATH           Chrome/Chromium executable. When unset, common install
 *                         locations for Windows, macOS and Linux are probed.
 *   CHROME_FLAGS          Extra space-separated Chrome flags (e.g. "--no-sandbox").
 *                         --no-sandbox is added automatically when running as root or under CI.
 *   LEGACY_BASELINE_PATH  Path to a pre-refactor index.html to use for legacy/upgrade modes.
 *   LEGACY_BASELINE_REF   Git ref whose index.html is the legacy baseline
 *                         (default: the commit the refactor branch started from).
 *
 * Legacy baseline: legacy/upgrade modes need the old single-file app. It is resolved from
 * scratch/legacy_baseline_index.html if present, else LEGACY_BASELINE_PATH, else it is
 * extracted from git history into scratch/ (gitignored) so a fresh clone can run every mode.
 * The legacy page loads its libraries from public CDNs, so these two modes need internet access.
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createLiveLlm, liveConfigFromEnv, liveOverrideSource, startLiveRelay } from './liveLlm.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
// Full page loads performed by runCoreSuite (initial mount, post-seed reload, and the two reloads in
// runPersistenceEditorSuite). The subpath check allows one /api/storage/status probe per load.
const CORE_SUITE_PAGE_LOADS = 4;
const LEGACY_BASELINE_REL = 'scratch/legacy_baseline_index.html';
// Last commit of the single-file app: the commit refactor/modular-architecture was branched from.
const DEFAULT_LEGACY_BASELINE_REF = 'fd3b70f4ace06b8f8757ed5efee5287ab808ca1a';

function resolveChromePath() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    const candidates = [];
    if (process.platform === 'win32') {
        for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
            if (!base) continue;
            candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
            candidates.push(path.join(base, 'Chromium', 'Application', 'chrome.exe'));
            candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        }
        candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
        candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    } else {
        const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
        for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
            if (!dir) continue;
            for (const name of names) candidates.push(path.join(dir, name));
        }
    }
    const found = candidates.find((c) => fs.existsSync(c));
    // Fall back to the historical default so the "not found" error names a concrete path.
    return found || candidates[0] || 'chrome';
}

function resolveChromeFlags() {
    const flags = String(process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    // Chrome's sandbox cannot start as root, and CI Linux runners restrict unprivileged user namespaces.
    if ((isRoot || (process.env.CI && process.platform === 'linux')) && !flags.includes('--no-sandbox')) {
        flags.push('--no-sandbox');
    }
    return flags;
}

const CHROME_PATH = resolveChromePath();
const CHROME_FLAGS = resolveChromeFlags();

/**
 * Make sure scratch/legacy_baseline_index.html exists and return its repo-relative path.
 * Resolution order: existing scratch file -> LEGACY_BASELINE_PATH -> `git show <ref>:index.html`.
 */
function ensureLegacyBaseline() {
    const target = path.join(ROOT_DIR, LEGACY_BASELINE_REL);
    if (fs.existsSync(target)) return LEGACY_BASELINE_REL;
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (process.env.LEGACY_BASELINE_PATH) {
        const src = path.resolve(process.env.LEGACY_BASELINE_PATH);
        if (!fs.existsSync(src)) throw new Error(`LEGACY_BASELINE_PATH does not exist: ${src}`);
        fs.copyFileSync(src, target);
        return LEGACY_BASELINE_REL;
    }

    const ref = process.env.LEGACY_BASELINE_REF || DEFAULT_LEGACY_BASELINE_REF;
    const git = (args) => spawnSync('git', args, { cwd: ROOT_DIR, maxBuffer: 256 * 1024 * 1024 });
    let shown = git(['show', `${ref}:index.html`]);
    if (shown.status !== 0) {
        // Shallow clones (CI default) may not have the baseline commit yet.
        git(['fetch', '--depth', '1', 'origin', ref]);
        shown = git(['show', `${ref}:index.html`]);
    }
    if (shown.status !== 0 || !shown.stdout || shown.stdout.length < 100000) {
        throw new Error(
            `Legacy baseline unavailable: could not read index.html at git ref ${ref}. ` +
            `Place the pre-refactor index.html at ${LEGACY_BASELINE_REL} or set LEGACY_BASELINE_PATH.`
        );
    }
    fs.writeFileSync(target, shown.stdout);
    console.log(`[golden] Extracted legacy baseline from git ref ${ref.slice(0, 12)} -> ${LEGACY_BASELINE_REL}`);
    return LEGACY_BASELINE_REL;
}

const LEGACY_SITE_REL = 'scratch/legacy_site';
// Static files the pre-refactor page loads from next to index.html. They used to sit at the repo
// root; the modular build keeps its own copies in public/, so the legacy site is rebuilt from git.
const LEGACY_STATIC_FILES = [
    'sw.js', 'manifest.webmanifest', 'ELPIcon2.jpg', 'apple-touch-icon.png', 'favicon.ico',
    'favicon-16x16.png', 'favicon-32x32.png', 'icon-192.png', 'icon-512.png',
    'icon-maskable-192.png', 'icon-maskable-512.png'
];

/**
 * Builds a servable copy of the pre-refactor app (index.html plus its service worker, manifest and
 * icons at the baseline ref) and returns its directory. Serve it with indexFile 'index.html'.
 */
function ensureLegacySite() {
    const indexRel = ensureLegacyBaseline();
    const siteDir = path.join(ROOT_DIR, LEGACY_SITE_REL);
    fs.mkdirSync(siteDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT_DIR, indexRel), path.join(siteDir, 'index.html'));
    const ref = process.env.LEGACY_BASELINE_REF || DEFAULT_LEGACY_BASELINE_REF;
    for (const file of LEGACY_STATIC_FILES) {
        const target = path.join(siteDir, file);
        if (fs.existsSync(target)) continue;
        const shown = spawnSync('git', ['show', `${ref}:${file}`], { cwd: ROOT_DIR, maxBuffer: 64 * 1024 * 1024 });
        if (shown.status === 0 && shown.stdout && shown.stdout.length > 0) {
            fs.writeFileSync(target, shown.stdout);
        } else if (file !== 'sw.js' && fs.existsSync(path.join(ROOT_DIR, 'public', file))) {
            // No git history for the baseline (LEGACY_BASELINE_PATH): icons are unchanged, the old worker is not available.
            fs.copyFileSync(path.join(ROOT_DIR, 'public', file), target);
        }
    }
    return siteDir;
}

const EXPECTED_PROMPT_KEYS = [
    'scenePlannerAgent', 'conceptualDevelopment', 'characterDevelopment', 'storyArc', 'arcReview',
    'actAgent', 'actReview', 'storySoFarAgent', 'continuityBridgeAgent', 'bridgeSceneGeneratorAgent',
    'actCompressorAgent', 'sequenceAgent', 'sequenceReview', 'sceneRosterAgent', 'sceneRosterReview',
    'sceneExpanderAgent', 'sceneExpanderReview', 'directiveScoper', 'directivePlanner',
    'directiveConsistencyReview', 'surgicalEditorProse', 'audioDramaSurgicalEditorProse',
    'audioDramaVoiceDirectorSurgical', 'surgicalEditorStructural', 'surgicalEditorSceneExpansion',
    'surgicalEditorBannedWords', 'entityNameRepair', 'surgicalProseEditor', 'surgicalMRUChoreographer',
    'writingAgent', 'styleAndSensoryPolish', 'continuityAuditor', 'writingReview', 'writingReviewRelaxed',
    'audioDramaWritingModifier', 'audioDramaWritingReview', 'rsiPrompt', 'epistemicConsolidationAgent',
    'archivist', 'loreExtraction', 'loreSectionDistiller', 'loreGroupSynthesizer',
    'lorePrimerSynthesizer', 'loreDistiller', 'voiceDnaExtractorAgent', 'blindReaderAgent',
    'intentExecutionComparatorAgent', 'editorialInvestigatorAgent', 'editorialTribunalAgent',
    'macroStructuralArchitectAgent', 'mesoSceneSurgeonAgent', 'microLineStylistAgent', 'patchArbiterAgent',
    'writing', 'characterDeveloper', 'storyArcPlanner', 'actDivisionPlanner', 'sequencePlanner', 'sceneRosterPlanner'
];

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.mjs': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.webmanifest': 'application/manifest+json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.wasm': 'application/wasm',
    '.map': 'application/json; charset=UTF-8'
};

function parseArgs(argv) {
    const opts = {
        mode: 'local',
        screenshots: '',
        out: ''
    };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--mode' && argv[i + 1]) opts.mode = argv[++i];
        else if (argv[i] === '--screenshots' && argv[i + 1]) opts.screenshots = path.resolve(argv[++i]);
        else if (argv[i] === '--out' && argv[i + 1]) opts.out = path.resolve(argv[++i]);
    }
    return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}

function isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const sock = net.createConnection(port, host);
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => { sock.destroy(); resolve(false); });
    });
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (!data.trim()) return reject(new Error('Empty JSON response'));
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

class NativeCDP {
    constructor(wsUrl) {
        const parsed = new URL(wsUrl);
        this.host = parsed.hostname;
        this.port = parseInt(parsed.port, 10);
        this.path = parsed.pathname;
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = [];
        this.buffer = Buffer.alloc(0);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection(this.port, this.host);
            const key = crypto.randomBytes(16).toString('base64');
            const req = [
                `GET ${this.path} HTTP/1.1`,
                `Host: ${this.host}:${this.port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Key: ${key}`,
                'Sec-WebSocket-Version: 13',
                '\r\n'
            ].join('\r\n');
            this.socket.write(req);

            let upgraded = false;
            this.socket.on('data', (chunk) => {
                if (!upgraded) {
                    const headerEnd = chunk.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                        const headers = chunk.slice(0, headerEnd).toString();
                        if (headers.startsWith('HTTP/1.1 101') || headers.startsWith('HTTP/1.0 101')) {
                            upgraded = true;
                            const rest = chunk.slice(headerEnd + 4);
                            if (rest.length > 0) this.handleFrame(rest);
                            resolve();
                        } else {
                            reject(new Error('WS handshake failed: ' + headers));
                        }
                    }
                } else {
                    this.handleFrame(chunk);
                }
            });
            this.socket.on('error', reject);
        });
    }

    handleFrame(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 2) {
            const firstByte = this.buffer[0];
            const secondByte = this.buffer[1];
            const opcode = firstByte & 0x0f;
            let payloadLen = secondByte & 0x7f;
            let offset = 2;
            if (payloadLen === 126) {
                if (this.buffer.length < 4) return;
                payloadLen = this.buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (this.buffer.length < 10) return;
                payloadLen = Number(this.buffer.readBigUInt64BE(2));
                offset = 10;
            }
            if (this.buffer.length < offset + payloadLen) return;
            const payload = this.buffer.slice(offset, offset + payloadLen);
            this.buffer = this.buffer.slice(offset + payloadLen);

            if (opcode === 1) {
                try {
                    const msg = JSON.parse(payload.toString('utf8'));
                    if (msg.id && this.callbacks.has(msg.id)) {
                        const { resolve, reject } = this.callbacks.get(msg.id);
                        this.callbacks.delete(msg.id);
                        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                        else resolve(msg.result);
                    } else if (msg.method) {
                        this.eventListeners.forEach((fn) => fn(msg.method, msg.params));
                    }
                } catch (_) {}
            }
        }
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const reqId = this.id++;
            this.callbacks.set(reqId, { resolve, reject });
            const payload = Buffer.from(JSON.stringify({ id: reqId, method, params }), 'utf8');
            const mask = crypto.randomBytes(4);
            let header;
            if (payload.length < 126) {
                header = Buffer.from([0x81, 0x80 | payload.length]);
            } else if (payload.length <= 0xffff) {
                header = Buffer.alloc(4);
                header[0] = 0x81;
                header[1] = 0x80 | 126;
                header.writeUInt16BE(payload.length, 2);
            } else {
                header = Buffer.alloc(10);
                header[0] = 0x81;
                header[1] = 0x80 | 127;
                header.writeBigUInt64BE(BigInt(payload.length), 2);
            }
            const masked = Buffer.alloc(payload.length);
            for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
            this.socket.write(Buffer.concat([header, mask, masked]));
        });
    }

    async eval(expression, awaitPromise = true) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise,
            returnByValue: true
        });
        if (res?.exceptionDetails) {
            const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval exception';
            throw new Error(desc);
        }
        return res?.result?.value;
    }

    close() {
        try { this.socket?.end(); this.socket?.destroy(); } catch (_) {}
    }
}

function startStaticHttpServer({ port, mountPrefix = '/', staticDir = ROOT_DIR, indexFile = 'index.html' }) {
    return new Promise((resolve, reject) => {
        const prefix = mountPrefix.endsWith('/') ? mountPrefix : mountPrefix + '/';
        const server = http.createServer((req, res) => {
            const u = new URL(req.url, `http://127.0.0.1:${port}`);
            let pathname = decodeURIComponent(u.pathname);

            if (prefix !== '/') {
                if (pathname === prefix.slice(0, -1)) {
                    res.writeHead(302, { Location: prefix });
                    res.end();
                    return;
                }
                if (!pathname.startsWith(prefix)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found (outside subpath)');
                    return;
                }
                pathname = '/' + pathname.slice(prefix.length);
            }

            if (pathname === '/' || pathname === '') pathname = '/' + indexFile;
            const rel = pathname.replace(/^\/+/, '');
            const target = path.resolve(staticDir, rel);
            if (!target.startsWith(path.resolve(staticDir))) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            fs.stat(target, (err, st) => {
                if (err || !st.isFile()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found: ' + pathname);
                    return;
                }
                const ext = path.extname(target).toLowerCase();
                res.writeHead(200, {
                    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                fs.createReadStream(target).pipe(res);
            });
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({
            close: () => new Promise((r) => {
                server.close(() => r());
                server.closeAllConnections();
            })
        }));
    });
}

async function startLocalAppServer({ port, staticDir, dataDir }) {
    const proc = spawn(process.execPath, [path.join(ROOT_DIR, 'server.js')], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(port),
            STATIC_DIR: staticDir,
            ELLIPSIS_DATA_DIR: dataDir
        },
        stdio: 'pipe'
    });
    for (let i = 0; i < 40; i++) {
        if (await isPortOpen(port)) {
            return {
                close: async () => {
                    try { proc.kill(); } catch (_) {}
                    for (let n = 0; n < 25 && (await isPortOpen(port)); n++) await sleep(200);
                }
            };
        }
        await sleep(200);
    }
    try { proc.kill(); } catch (_) {}
    throw new Error(`server.js failed to start on port ${port}`);
}

async function launchChromeSession(userDataDir, cdpPort) {
    if (!fs.existsSync(CHROME_PATH)) {
        throw new Error(`Chrome not found at ${CHROME_PATH} — set CHROME_PATH to a Chrome/Chromium executable`);
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--window-size=1440,900',
        '--no-first-run',
        '--no-default-browser-check',
        ...CHROME_FLAGS,
        'about:blank'
    ], { stdio: 'ignore' });
    const exitPromise = new Promise((resolve) => chrome.once('exit', resolve));

    let pages = null;
    // A cold Chrome start on a CI runner can take well over 10s; poll for up to 45s.
    for (let i = 0; i < 150; i++) {
        await sleep(300);
        try {
            const list = await fetchJson(`http://127.0.0.1:${cdpPort}/json`);
            if (Array.isArray(list) && list.length > 0) {
                pages = list;
                break;
            }
        } catch (_) {}
    }
    if (!pages) {
        try { chrome.kill(); } catch (_) {}
        throw new Error(`Chrome CDP did not respond on port ${cdpPort}`);
    }

    const pageTarget = pages.find((p) => p.type === 'page') || pages[0];
    const cdp = new NativeCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const exceptions = [];
    const badStaticResponses = [];
    const api404Responses = [];

    cdp.eventListeners.push((method, params) => {
        if (method === 'Runtime.exceptionThrown') {
            const d = params?.exceptionDetails;
            exceptions.push(d?.exception?.description || d?.text || 'Unknown exception');
        } else if (method === 'Network.responseReceived') {
            const url = params?.response?.url || '';
            const status = params?.response?.status || 0;
            if (status >= 400 && url.startsWith('http://127.0.0.1:')) {
                if (url.includes('/api/storage/')) {
                    api404Responses.push({ url, status });
                } else {
                    badStaticResponses.push({ url, status });
                }
            }
        }
    });

    return {
        cdp,
        exceptions,
        badStaticResponses,
        api404Responses,
        close: async () => {
            try {
                await cdp.send('Browser.close');
            } catch (_) {
                // Fallback: connect to browser-level WebSocket if page target rejects Browser.close
                try {
                    const ver = await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`);
                    if (ver?.webSocketDebuggerUrl) {
                        const bCdp = new NativeCDP(ver.webSocketDebuggerUrl);
                        await bCdp.connect();
                        await bCdp.send('Browser.close');
                        bCdp.close();
                    }
                } catch (_) {}
            }
            cdp.close();
            await Promise.race([exitPromise, sleep(5000)]);
            if (chrome.exitCode === null) {
                try { chrome.kill(); } catch (_) {}
                await Promise.race([exitPromise, sleep(1000)]);
            }
            await sleep(200);
        }
    };
}

async function waitForAppMount(cdp, url) {
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 30; i++) {
        await sleep(800);
        try {
            const state = await cdp.eval(`(() => ({
                title: document.title,
                rootLen: document.getElementById('root')?.innerHTML.length || 0,
                hasPrompts: typeof window.PROMPTS === 'object' && window.PROMPTS !== null,
                promptCount: window.PROMPTS ? Object.keys(window.PROMPTS).length : 0,
                hasBridge: Boolean(window.EllipsisProseBridge),
                hasStoryStore: Boolean(window.storyStore)
            }))()`, false);
            if (state && state.rootLen > 2000 && state.hasPrompts && state.hasBridge) {
                return state;
            }
        } catch (_) {}
    }
    throw new Error(`App did not mount cleanly within 24s at ${url}`);
}

function buildSeedFixtureScript() {
    return `(async () => {
        const storyId = 'golden_story_1';
        const story = {
            id: storyId,
            title: 'The Salt Clock',
            book_type: 'novel',
            writing_mode: 'novel',
            genre: 'Literary Mystery',
            tone: 'Atmospheric',
            concept: 'A coastal archivist uncovers forged tide ledgers that hide a vanished lighthouse keeper.',
            logline: 'When a tide ledger falsifies twenty winters of storms, an archivist races the rising sea to expose a town secret.',
            world_primer: 'Oakhaven is a fog-bound harbor town governed by the Tide Registry, where brass salt-clocks measure harbour dues.',
            story_so_far: 'Maren checked the winter ledgers and found three missing weeks.',
            style: {
                genre: 'Literary Mystery',
                mood: 'Tense and brine-soaked',
                writing_guide: 'Close third person limited, sensory maritime detail.'
            },
            cast: [
                {
                    id: 'char_maren',
                    name: 'Maren Vance',
                    role: 'Protagonist',
                    core_flaw: 'Refuses help until crises spiral',
                    core_desire: 'Prove her father did not wreck the beacon',
                    vocal_cadence: 'A steady, measured female alto with crisp consonants and a deliberate, unhurried pace.',
                    details: { history: 'Harbor archivist.', deep_profile: 'I keep ledgers because numbers do not drown.' }
                },
                {
                    id: 'char_tomas',
                    name: 'Tomas Kell',
                    role: 'Harbormaster',
                    core_flaw: 'Protects civic order above truth',
                    core_desire: 'Keep the shipping charter intact',
                    vocal_cadence: 'A weathered, low male baritone with a slow cadence and dry coastal inflection.',
                    details: { history: 'Former pilot.', deep_profile: 'A town survives on what it agrees not to ask.' }
                }
            ],
            acts: [
                { number: 1, title: 'Act I: Salt & Ink', description: 'Maren discovers the altered tide ledger and confronts the harbormaster over the winter storm logs.' },
                { number: 2, title: 'Act II: Low Tide', description: 'Investigating the decommissioned lighthouse reveals hidden cargo manifests and sealed brass canisters.' },
                { number: 3, title: 'Act III: The Beacon', description: 'During the equinox gale, Maren restores the beacon log and exposes the shipping syndicate.' }
            ],
            sequences: [
                { number: 1, parent_act: 1, title: 'The Forged Ledger', dramatic_question: 'Who erased the storm entries?', function: 'Status Quo & Inciting Discovery' },
                { number: 2, parent_act: 1, title: 'Locked Wharf', dramatic_question: 'Can Maren reach the boathouse?', function: 'First Threshold' }
            ],
            scenes: {
                '0': [
                    {
                        id: '1.1',
                        number: '1.1',
                        title: 'The Salt-Stained Page',
                        scene_type: 'PROACTIVE',
                        pov_character: 'Maren Vance',
                        characters_present: ['Maren Vance', 'Tomas Kell'],
                        location: 'Tide Registry',
                        goal: 'Inspect the 1918 ledger before Tomas locks the vault.',
                        conflict: 'Tomas arrives early to inventory the shelves.',
                        outcome: 'Maren copies the smudged column in secret.',
                        value_shift: { start_state: 'Uncertain suspicion', end_state: 'Proof of forgery' },
                        synopsis: 'Maren checks the archive under candlelight and spots fresh iron-gall ink over faded salt rings.'
                    }
                ],
                '1': [
                    {
                        id: '2.1',
                        number: '2.1',
                        title: 'Lantern at Pier Four',
                        scene_type: 'REACTIVE',
                        pov_character: 'Maren Vance',
                        characters_present: ['Maren Vance'],
                        location: 'Pier Four',
                        goal: 'Decode the copied figures.',
                        conflict: 'Gale winds threaten the pier.',
                        outcome: 'Identifies the lighthouse coordinates.',
                        value_shift: { start_state: 'Proof of forgery', end_state: 'Target location' },
                        synopsis: 'Maren compares the forged figures against the harbor depth chart.'
                    }
                ]
            },
            beats: {
                '0-0': [
                    { id: 'b1', beat_type: 'ACTION', initiator: 'Maren Vance', action: 'Maren tilts the salt-stained ledger toward the tallow lamp.', reaction: 'Tomas pauses at the archive threshold, keys jingling.' }
                ]
            },
            prose: {
                '0-0': {
                    final: 'Maren tilted the damp ledger toward the lamp until the iron-gall ink caught the amber flame. Across the margin, someone had scraped away the December storm tally with a penknife and written calmer numbers in its place.\\n\\n"You are working past curfew, Miss Vance," Tomas said from the doorway, brass keys clicking against his palm.\\n\\n"The salt air warps the bindings," Maren replied, shutting the clasp before he could cross the flagstones.',
                    draft: ''
                }
            },
            lore: [
                {
                    topic: 'Tide Registry Vault',
                    detail: 'A limestone cellar beneath the customs house holding two centuries of harbor logs and brass salt-clocks.',
                    valid_from_act: 1,
                    valid_from_scene: 1,
                    related_to: ['Oakhaven'],
                    description: 'World Bible Setting'
                },
                {
                    topic: 'Brass Salt-Clock',
                    detail: 'A tidal chronometer calibrated with brine weights to track shipping tolls during heavy fog.',
                    valid_from_act: 1,
                    valid_from_scene: 1,
                    related_to: ['Tide Registry Vault'],
                    description: 'Imported Lore Segment'
                }
            ],
            relationships: [
                { char_a: 'Maren Vance', char_b: 'Tomas Kell', type: 'Wary Antagonism', tension: 'High', dynamic: 'Archivist vs. Civic Gatekeeper' }
            ],
            secret_vault: [],
            epistemic_graph: null,
            timestamp: Date.now()
        };

        await window.storyStore.saveStory(storyId, story);
        await window.logStore.saveLogs(storyId, [{
            id: 'golden_log_1',
            timestamp: Date.now(),
            name: 'Writing Agent',
            model: 'golden-mock-model',
            prompt: 'Write Scene 1.1',
            response: 'Maren tilted the damp ledger...'
        }]);
        localStorage.setItem('ellipsisprose_active_story_id', storyId);
        localStorage.setItem('gemini_api_key', 'AIzaGoldenTestKey12345');
        localStorage.setItem('ellipsisprose_theme', 'light');
        localStorage.setItem('ellipsisprose_slop_config_v1', JSON.stringify(window.normalizeSlopConfig(null, ['ozone_test'])));
        return { ok: true, storyId };
    })()`;
}

async function runCoreSuite({ cdp, exceptions, badStaticResponses, baseUrl, screenshotDir, results }) {
    const assert = (name, cond, detail = '') => {
        if (cond) {
            results.passed.push(name);
            console.log(`  [PASS] ${name}`);
        } else {
            results.failed.push({ name, detail });
            console.error(`  [FAIL] ${name}${detail ? ' -> ' + detail : ''}`);
        }
    };

    // 1. Mount & Prompt Keys
    const mountState = await waitForAppMount(cdp, baseUrl);
    assert('App mounts into #root (>2000 bytes)', mountState.rootLen > 2000, `len=${mountState.rootLen}`);

    const promptCheck = await cdp.eval(`(() => {
        const expected = ${JSON.stringify(EXPECTED_PROMPT_KEYS)};
        const keys = Object.keys(window.PROMPTS || {});
        const missing = expected.filter(k => !keys.includes(k));
        return { count: keys.length, missing };
    })()`, false);
    assert('window.PROMPTS has all 59+ expected keys', promptCheck.count >= 59 && promptCheck.missing.length === 0, JSON.stringify(promptCheck));

    // 2. Seed rich story + settings and reload to verify persistence hydration
    await cdp.eval(buildSeedFixtureScript(), true);
    await waitForAppMount(cdp, baseUrl);
    await sleep(600);

    const hydrated = await cdp.eval(`(() => ({
        activeId: localStorage.getItem('ellipsisprose_active_story_id'),
        geminiKey: localStorage.getItem('gemini_api_key'),
        bodyText: document.body.innerText.slice(0, 2000),
        hasSaltClockTitle: document.body.innerText.includes('The Salt Clock')
    }))()`, false);
    assert('Seeded story & settings hydrate across full reload', hydrated.activeId === 'golden_story_1' && hydrated.geminiKey === 'AIzaGoldenTestKey12345' && hydrated.hasSaltClockTitle, JSON.stringify({ activeId: hydrated.activeId, hasSaltClockTitle: hydrated.hasSaltClockTitle }));

    // 3. Bridge API
    const bridgeRes = await cdp.eval(`(async () => {
        const b = window.EllipsisProseBridge;
        const status = await b.getStatus();
        const cfg = await b.getModelConfig();
        const stories = await b.listStories();
        const pipe = await b.getPipelineStatus();
        const logs = await b.getLogs(5);
        return {
            version: b.version,
            statusTitle: status?.storyTitle,
            hasGemini: cfg?.hasGeminiKey,
            storiesLen: Array.isArray(stories?.stories) ? stories.stories.length : (Array.isArray(stories) ? stories.length : -1),
            hasPipe: typeof pipe?.loading === 'boolean',
            logsOk: Array.isArray(logs?.logs || logs)
        };
    })()`, true);
    assert('EllipsisProseBridge actions work', bridgeRes.statusTitle === 'The Salt Clock' && bridgeRes.hasGemini && bridgeRes.hasPipe && bridgeRes.logsOk, JSON.stringify(bridgeRes));

    // Helper to click a button by exact title or visible label text
    const clickButton = async (selectorOrText, by = 'title') => {
        return cdp.eval(`(() => {
            const target = ${JSON.stringify(selectorOrText)};
            const mode = ${JSON.stringify(by)};
            const btns = Array.from(document.querySelectorAll('button'));
            let btn = null;
            if (mode === 'title') {
                btn = btns.find(b => b.getAttribute('title') === target);
            } else if (mode === 'aria-label') {
                btn = btns.find(b => b.getAttribute('aria-label') === target);
            } else if (mode === 'text') {
                btn = btns.find(b => (b.innerText || '').trim().includes(target));
            }
            if (!btn) return { clicked: false };
            btn.click();
            return { clicked: true, text: (btn.innerText || '').trim().slice(0, 60) };
        })()`, false);
    };

    const capture = async (name) => {
        if (!screenshotDir) return;
        fs.mkdirSync(screenshotDir, { recursive: true });
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
    };

    // 4. Traverse all 16 views + Light/Dark screenshots
    // Library (Light)
    await clickButton('Bookshelf', 'title');
    await sleep(300);
    let mainLen = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
    assert('View [library] renders cleanly', mainLen > 50, `len=${mainLen}`);
    await capture('library_light');

    // Toggle Dark Mode & capture library_dark
    const lightBg = await cdp.eval(`getComputedStyle(document.documentElement).getPropertyValue('--bg-void').trim()`, false);
    await clickButton('Toggle Theme', 'aria-label');
    await sleep(250);
    const darkInfo = await cdp.eval(`({
        hasDarkClass: document.documentElement.classList.contains('dark'),
        bgVoid: getComputedStyle(document.documentElement).getPropertyValue('--bg-void').trim()
    })`, false);
    assert('Light & Dark CSS tokens switch cleanly', lightBg !== darkInfo.bgVoid && darkInfo.hasDarkClass, JSON.stringify({ lightBg, darkInfo }));
    await capture('library_dark');

    // Settings (Dark)
    await clickButton('Settings', 'title');
    await sleep(300);
    mainLen = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
    assert('View [settings] renders cleanly', mainLen > 100, `len=${mainLen}`);
    await capture('settings_dark');

    // Switch back to Light Mode
    await clickButton('Toggle Theme', 'aria-label');
    await sleep(250);

    // Setup
    await clickButton('New Story', 'title');
    await sleep(300);
    mainLen = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
    assert('View [setup] renders cleanly', mainLen > 100, `len=${mainLen}`);
    await capture('setup_light');

    // Overview (Dashboard) + Folio SubNav: cast, relationships, lore, inspector
    await clickButton('Overview & World Bible', 'title');
    await sleep(300);
    mainLen = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
    assert('View [dashboard] renders cleanly', mainLen > 100, `len=${mainLen}`);

    for (const [viewKey, label] of [
        ['cast', 'Cast & Characters'],
        ['relationships', 'Character Dynamics'],
        ['lore', 'World & Archives'],
        ['inspector', 'Memory Search']
    ]) {
        const res = await clickButton(label, 'text');
        await sleep(250);
        const len = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
        assert(`View [${viewKey}] renders cleanly`, res.clicked && len > 50, JSON.stringify({ res, len }));
    }

    // Pipeline & Logs
    await clickButton('Live Progress', 'title');
    await sleep(250);
    assert('View [pipeline] renders cleanly', (await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false)) > 50);

    await clickButton("Author's Log (LLM Logs)", 'title');
    await sleep(250);
    assert('View [logs] renders cleanly', (await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false)) > 50);

    // Novel Structure -> Sequence Dashboard -> Scene Writer -> Directive -> Editorial
    await clickButton('Novel Structure', 'title');
    await sleep(300);
    assert('View [structure] renders cleanly', (await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false)) > 50);

    const seqClick = await clickButton('Seq 1:', 'text');
    await sleep(250);
    assert('View [sequence_dashboard] renders cleanly', seqClick.clicked && (await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false)) > 50);

    const scnClick = await clickButton('1.1. The Salt-Stained Page', 'text');
    await sleep(300);
    await clickButton('Manuscript', 'text');
    await sleep(250);
    const writerInfo = await cdp.eval(`(() => {
        const m = document.querySelector('main');
        const text = m?.innerText || '';
        const taVals = Array.from(m?.querySelectorAll('textarea') || []).map(t => t.value).join('\\n');
        return { textLen: text.length, hasProse: text.includes('iron-gall ink') || taVals.includes('iron-gall ink') };
    })()`, false);
    assert('View [writer] renders seeded scene prose', scnClick.clicked && writerInfo.hasProse, JSON.stringify(writerInfo));
    await capture('writer_light');

    for (const [viewKey, label] of [
        ['directive', 'Request Change'],
        ['editorial', 'Developmental Polish']
    ]) {
        const res = await clickButton(label, 'text');
        await sleep(250);
        const len = await cdp.eval(`document.querySelector('main')?.innerText.length || 0`, false);
        assert(`View [${viewKey}] renders cleanly`, res.clicked && len > 50, JSON.stringify({ res, len }));
    }

    // Reader
    await clickButton('Reading & Listening Room', 'title');
    await sleep(400);
    const readerText = await cdp.eval(`document.querySelector('main')?.innerText || ''`, false);
    assert('View [reader] renders story prose cleanly', readerText.includes('The Salt Clock') || readerText.includes('iron-gall ink'), `len=${readerText.length}`);
    await capture('reader_light');

    // Exit reader to Library for Mobile 390x844 responsiveness check
    await cdp.eval(`(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('title') || '').includes('Exit') || (x.innerText || '').includes('Exit'));
        if (b) b.click();
    })()`, false);
    await sleep(300);
    await clickButton('Bookshelf', 'title');
    await sleep(250);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true
    });
    await sleep(300);
    const mobileOverflow = await cdp.eval(`({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth
    })`, false);
    assert('Mobile 390x844 has zero horizontal overflow', mobileOverflow.scrollW <= mobileOverflow.innerW + 2, JSON.stringify(mobileOverflow));
    await capture('mobile_390_light');

    // Reset viewport back to desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
    });
    await sleep(200);

    // 5. Pure Domain Golden Contracts (executed inside real browser runtime)
    const domainReport = await cdp.eval(`(async () => {
        const out = {};

        // AI Slop & Naming Audit
        const slopCfg = window.normalizeSlopConfig(null, ['ozone_custom']);
        const slopRes = window.scanTextForSlop(
            'A tapestry of silence fell across the room. Not merely cold, but glacial. His knuckles whitened as a shiver ran down his spine. ozone_custom lingered.',
            { slopConfig: slopCfg, customBannedPhrases: ['ozone_custom'] }
        );
        out.slopActionable = Boolean(slopRes?.summary?.hasActionableItems);
        out.slopTotalHits = (slopRes?.hardHits?.length || 0) + (slopRes?.flagHits?.length || 0) + (slopRes?.patternHits?.length || 0) + (slopRes?.closerHits?.length || 0);

        const nameAudit = window.auditEntityNamesAndPlaces({
            characters: [{ name: 'Elara Vance' }],
            places: [{ name: 'Aethelgard' }]
        });
        out.nameAuditViolations = (nameAudit?.violations?.length || 0) + (nameAudit?.hardViolations?.length || 0);
        out.cascadingRename = window.applyCascadingNameReplacements('Elara Vance met Elara.', { 'Elara Vance': 'Mira Solis', 'Elara': 'Mira' });
        out.bannedCount = window.countBannedPhrases('ozone and more ozone', ['ozone']).count;

        // XML, JSON, Markdown
        const escaped = window.escapeXml('<tag attr="1">&');
        out.xmlRoundTrip = window.decodeXmlEntities(escaped) === '<tag attr="1">&';
        out.extractTag = window.extractTag('<box><title>Clock</title></box>', 'title');
        out.extractAllTags = window.extractAllTags('<i >a</i><i>b</i>', 'i').length;
        const circ = { a: 1 }; circ.self = circ;
        const circStr = window.safeJsonStringify(circ);
        out.circularSafe = circStr.includes('[Circular]');
        out.readerProse = window.formatReaderProse('Paragraph one.\\n\\nParagraph two.');

        // Lore Chunking, Partitioning & BM25
        const bigSection = ('# Chapter Lore\\n\\n' + 'The harbor bells tolled across the salt flats every winter equinox. '.repeat(35)).repeat(3);
        const chunks = window.splitTextIntoBoundaryAwareChunks(bigSection, 1200, 1800, 200);
        out.chunkCount = chunks.length;
        out.noBrokenWords = chunks.every((c, idx) => typeof c?.text === 'string' && c.text.trim().length > 0 && (idx === 0 || !/^[a-z]/.test(c.text.trim())));
        const sections = window.partitionLoreIntoSemanticSections(bigSection, 1800, 2500, 300);
        out.sectionCount = sections.length;
        const bm25 = window.searchLoreLexical('brass salt clock chronometer', [
            { topic: 'Bakery', detail: 'Fresh rye bread every morning.' },
            { topic: 'Brass Salt-Clock', detail: 'A tidal chronometer calibrated with brine weights.' }
        ]);
        out.bm25Top = bm25?.[0]?.metadata?.topic || '';

        // GESM & Active State
        const testStory = {
            title: 'Test',
            cast: [{ id: 'c1', name: 'Maren' }],
            acts: [{ number: 1, title: 'Act 1', description: 'Maren investigates the harbor.' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Seq 1' }],
            scenes: { '0': [{ number: '1.1', title: 'S1', characters_present: ['Maren'], scene_type: 'PROACTIVE', value_shift: { start_state: 'A', end_state: 'B' } }] },
            lore: [{ topic: 'Salt-Clock', detail: 'Measures brine', description: 'World Bible Setting', valid_from_act: 1, valid_from_scene: 1 }]
        };
        const g = window.ensureEpistemicGraph(testStory);
        await window.commitEpistemicSceneDeltas(testStory, [], '1.1');
        const activeState = window.compileActiveState(testStory, testStory.scenes['0'][0], testStory.cast);
        const ledger = window.formatContinuityLedgerForPrompt(testStory, { act: 1, scene: 1 });
        out.gesmOk = Boolean(g && activeState && typeof ledger === 'string');

        // Validators, Surgical Edits, Length Control, Rollback
        const valRes = window.validateStructuralOutput('Act Agent', {
            acts: [
                { number: 1, description: 'Act one establishes the harbor mystery and forces Maren to confront the altered winter logs.' },
                { number: 2, description: 'Act two escalates the conspiracy when the decommissioned lighthouse reveals hidden manifests.' },
                { number: 3, description: 'Act three brings the equinox gale confrontation and restores the true maritime archive.' }
            ]
        });
        out.actValid = Boolean(valRes?.valid);
        out.reviewPass = window.extractReviewStatus('<review><status>PASS</status><critique_analysis>Strong</critique_analysis></review>')?.status;
        const editRes = window.applySurgicalEditsDetailed(
            'He walked down the quiet road.',
            '<edit><search>quiet road</search><replace>cobblestone lane</replace></edit>'
        );
        out.surgicalEdited = editRes?.text || '';
        const seqPlan = window.computeSequenceLengthPlan({ book_type: 'novel', sequences: testStory.sequences, scenes: testStory.scenes }, 0);
        const scnTarget = window.computeSceneWordTarget({ book_type: 'novel', sequences: testStory.sequences, scenes: testStory.scenes }, 0, 0);
        out.lengthTargetOk = (seqPlan?.sequenceBudget > 0) && (scnTarget?.targetWords > 0);
        const rolled = window.buildRolledBackStoryState(testStory, 'acts');
        out.rollbackOk = Array.isArray(rolled?.nextStory?.acts) && rolled.nextStory.acts.length === 0 && rolled.nextStory.lore.length === 1;

        // Audio Drama & Voice Resolution
        const scriptSample = 'Narrator: The bell rang.\\nMaren: [quietly] Who lit the lamp?\\nTomas: (sighs)\\nMaren: *Never mind the tide.*';
        const normScript = window.normalizeAudioDramaScriptWithReport(scriptSample);
        const parsedChunks = window.parseAudioDramaScript(normScript?.text || scriptSample);
        out.audioChunks = parsedChunks.length;
        out.audioExprOk = Boolean(window.analyzeAudioDramaExpressiveness(normScript?.text || scriptSample));
        out.voiceDesc = window.getVoiceDescriptionForCharacter({ name: 'Maren', vocal_cadence: 'Steady female alto, measured pace.' }, testStory);
        out.seedDeterministic = window.getDeterministicVoiceSeed('Maren', testStory) === window.getDeterministicVoiceSeed('Maren', testStory);
        out.sigHash = await window.computeSceneVoiceSignatureHash(scriptSample, testStory, {});
        out.cueTimelineLen = window.buildEstimatedCueTimeline(scriptSample, 12, true)?.length || 0;

        // Editorial Harness
        const constitution = window.compileAestheticConstitution(testStory);
        const harnessProse = 'Maren checked the brass lock. The iron hinges groaned against the salt wind.';
        const normScene = window.normalizeSceneToXml(0, 0, harnessProse, testStory);
        const sceneItem = { seqIdx: 0, sceneIdx: 0, sceneId: normScene.sceneId, proseText: harnessProse, normalized: normScene };
        const telemetry = window.runSceneNlpTelemetry(sceneItem, testStory, [], slopCfg);
        const harnessStory = { ...testStory, prose: { '0-0': { final: harnessProse } } };
        const fullTel = window.runFullManuscriptNlpTelemetry(harnessStory, [], slopCfg);
        const nsg = window.compileNarrativeStateGraph(harnessStory, fullTel);
        const layer0 = await window.evaluateSceneLayer0AndDivergence(nsg.sceneContracts[0], sceneItem, nsg, telemetry, null, false);
        out.harnessOk = Boolean(constitution?.xml && telemetry && nsg && layer0);

        return out;
    })()`, true);

    assert('Domain: AI Slop & Naming Audit', domainReport.slopActionable && domainReport.slopTotalHits > 0 && domainReport.nameAuditViolations > 0 && domainReport.cascadingRename === 'Mira Solis met Mira.' && domainReport.bannedCount === 2, JSON.stringify(domainReport));
    assert('Domain: XML/JSON/Markdown helpers', domainReport.xmlRoundTrip && domainReport.extractTag === 'Clock' && domainReport.extractAllTags === 2 && domainReport.circularSafe && domainReport.readerProse.length > 10, JSON.stringify(domainReport));
    assert('Domain: Lore Chunking, Partitioning & BM25', domainReport.chunkCount >= 2 && domainReport.noBrokenWords && domainReport.sectionCount >= 2 && domainReport.bm25Top === 'Brass Salt-Clock', JSON.stringify(domainReport));
    assert('Domain: GESM & Active State', domainReport.gesmOk, JSON.stringify(domainReport));
    assert('Domain: Validators, Surgical Edits, Length & Rollback', domainReport.actValid && domainReport.reviewPass === 'PASS' && domainReport.surgicalEdited.includes('cobblestone lane') && domainReport.lengthTargetOk && domainReport.rollbackOk, JSON.stringify(domainReport));
    assert('Domain: Audio Drama Parser, Voices, Seed & SigHash', domainReport.audioChunks >= 3 && domainReport.audioExprOk && Boolean(domainReport.voiceDesc) && domainReport.seedDeterministic && Boolean(domainReport.sigHash) && domainReport.cueTimelineLen > 0, JSON.stringify(domainReport));
    assert('Domain: Autonomous Editorial Harness engines', domainReport.harnessOk, JSON.stringify(domainReport));

    // 6. Mocked-LLM Pipeline, Document Extractors & MP3 Encoder
    const ioReport = await cdp.eval(`(async () => {
        const out = {};

        // Mocked __callAIOverride for distillLore
        const prevOverride = window.__callAIOverride;
        window.__callAIOverride = async () => '<world_primer>Oakhaven tide registry canon.</world_primer>';
        try {
            const primer = await window.distillLore('Oakhaven is governed by the Tide Registry.', { storyId: 'golden_story_1' });
            out.distillOk = typeof primer === 'string' && primer.includes('Oakhaven');
        } finally {
            window.__callAIOverride = prevOverride;
        }

        // buildProseContext
        const ctx = window.buildProseContext({
            storyToUse: { title: 'T', writing_mode: 'novel', cast: [{ name: 'Maren' }], acts: [{ number: 1, title: 'A1', description: 'Desc' }] },
            scene: { number: '1.1', title: 'S1', characters_present: ['Maren'], scene_type: 'PROACTIVE' },
            sequenceData: { number: 1, parent_act: 1, title: 'Seq 1' },
            s: 0,
            seq: 0,
            activeCast: [{ name: 'Maren', details: {} }]
        });
        out.proseCtxOk = typeof ctx === 'string' && ctx.length > 50;

        // Document extractors: txt, md, json, csv, synthetic epub
        const txt = await window.extractDocumentText(new File(['Hello World Bible'], 'world.txt', { type: 'text/plain' }));
        const md = await window.extractDocumentText(new File(['# Lore\\nContent here'], 'lore.md', { type: 'text/markdown' }));
        const js = await window.extractDocumentText(new File([JSON.stringify({ harbor: 'Oakhaven' })], 'data.json', { type: 'application/json' }));
        const csv = await window.extractDocumentText(new File(['Name,Role\\nMaren,Archivist'], 'cast.csv', { type: 'text/csv' }));
        out.basicDocsOk = txt.includes('Hello World Bible') && md.includes('Content here') && js.includes('Oakhaven') && csv.includes('Maren');

        const JSZip = await window.ensureJSZip();
        const zip = new JSZip();
        zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
        zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Bible</dc:title></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
        zip.file('OEBPS/ch1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Harbor Lore</h1><p>Salt clocks tick.</p></body></html>');
        const epubBlob = await zip.generateAsync({ type: 'blob' });
        const epubFile = new File([epubBlob], 'bible.epub', { type: 'application/epub+zip' });
        const epubText = await window.extractDocumentText(epubFile);
        out.epubOk = epubText.includes('Salt clocks tick.');

        // MP3 encoding
        const samples = new Float32Array(24000);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / 24000) * 0.25;
        const mp3Blob = await window.encodeFloat32PcmToMp3Blob(samples, 24000, 128);
        out.mp3Type = mp3Blob?.type;
        out.mp3Size = mp3Blob?.size || 0;

        return out;
    })()`, true);

    assert('Pipeline: distillLore & buildProseContext work', ioReport.distillOk && ioReport.proseCtxOk, JSON.stringify(ioReport));
    assert('Documents: txt/md/json/csv/epub extraction work', ioReport.basicDocsOk && ioReport.epubOk, JSON.stringify(ioReport));
    assert('Audio: MP3 encoding produces valid audio/mpeg Blob', ioReport.mp3Type === 'audio/mpeg' && ioReport.mp3Size > 500, JSON.stringify(ioReport));

    // 7. Persistence & editor characterisation (story switch, autosave, scene CRUD, reset, import)
    await runPersistenceEditorSuite({ cdp, baseUrl, assert });

    // 8. Zero exceptions & zero static 404s
    assert('Zero uncaught runtime exceptions', exceptions.length === 0, exceptions.join(' | '));
    assert('Zero static asset HTTP >=400 errors', badStaticResponses.length === 0, JSON.stringify(badStaticResponses));
}

/**
 * Characterisation tests for the story persistence and editor handlers (the Phase 6E-3 extraction
 * targets). They only use window hooks that exist in BOTH the legacy single-file app and the modular
 * build (storyRef, setStory, storyStore, handleAddScene, handleMoveScene, updateSceneBlueprint,
 * handleResetStoryStage, handleImport, EllipsisProseBridge), so the same assertions pin behaviour
 * before and after the extraction. Runs last in the core suite because it mutates the seeded story.
 */
async function runPersistenceEditorSuite({ cdp, baseUrl, assert }) {
    const PRELUDE = `
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const live = () => window.storyRef.current;
        const saved = (id) => window.storyStore.loadStory(id);
        const until = async (fn, timeoutMs = 4000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                try { if (await fn()) return true; } catch (_) {}
                await wait(100);
            }
            return false;
        };
        const sceneTitles = (st, key = '0') => ((st && st.scenes && st.scenes[key]) || []).map((sc) => sc.title);
        const proseText = (st, key) => {
            const p = st && st.prose ? st.prose[key] : null;
            if (!p) return '';
            return typeof p === 'string' ? p : (p.final || p.draft || p.prose || p.text || '');
        };
    `;
    const run = (body) => cdp.eval(`(async () => { ${PRELUDE} ${body} })()`, true);
    const ORIGINAL_SCENE = 'The Salt-Stained Page';

    // Make sure the seeded story is the live one before mutating anything.
    const ready = await run(`
        const ok = await until(() => live() && live().id === 'golden_story_1' && sceneTitles(live()).length === 1);
        return { ok, id: live() && live().id, titles: sceneTitles(live()), hasProse: proseText(live(), '0-0').length > 100 };
    `);
    assert('Persistence: seeded story is live before editor tests', ready.ok && ready.hasProse, JSON.stringify(ready));

    // 7a. A plain setStory edit is autosaved by the persistence effect.
    const autosave = await run(`
        window.setStory((prev) => ({ ...prev, logline: 'GOLDEN-AUTOSAVE-LOGLINE' }));
        const ok = await until(async () => ((await saved('golden_story_1')) || {}).logline === 'GOLDEN-AUTOSAVE-LOGLINE');
        return { ok, liveLogline: live().logline };
    `);
    assert('Persistence: setStory edit autosaves to storage', autosave.ok && autosave.liveLogline === 'GOLDEN-AUTOSAVE-LOGLINE', JSON.stringify(autosave));

    // 7b. Append a scene: existing scene, beats and prose keep their keys.
    const append = await run(`
        window.handleAddScene(0);
        await until(() => sceneTitles(live()).length === 2);
        const persisted = await until(async () => sceneTitles(await saved('golden_story_1')).length === 2);
        return {
            titles: sceneTitles(live()),
            proseAt00: proseText(live(), '0-0').length,
            beatsAt00: ((live().beats || {})['0-0'] || []).length,
            otherSequenceScenes: sceneTitles(live(), '1').length,
            persisted
        };
    `);
    assert('Editors: handleAddScene appends a scene and persists it',
        append.titles.length === 2 && append.titles[0] === ORIGINAL_SCENE && append.proseAt00 > 100 && append.beatsAt00 >= 1 && append.otherSequenceScenes === 1 && append.persisted,
        JSON.stringify(append));

    // 7c. Insert at index 0: the original scene shifts to index 1 and its beats/prose are re-keyed with it.
    const insert = await run(`
        window.handleAddScene(0, 0);
        await until(() => sceneTitles(live()).length === 3);
        const persisted = await until(async () => {
            const st = await saved('golden_story_1');
            return sceneTitles(st).length === 3 && proseText(st, '0-1').length > 100;
        });
        return {
            titles: sceneTitles(live()),
            proseAt00: proseText(live(), '0-0').length,
            proseAt01: proseText(live(), '0-1').length,
            beatsAt01: ((live().beats || {})['0-1'] || []).length,
            persisted
        };
    `);
    assert('Editors: handleAddScene insert re-keys prose and beats of shifted scenes',
        insert.titles.length === 3 && insert.titles[1] === ORIGINAL_SCENE && insert.proseAt00 === 0 && insert.proseAt01 > 100 && insert.beatsAt01 >= 1 && insert.persisted,
        JSON.stringify(insert));

    // 7d. Move the original scene back up: prose and beats travel with the scene.
    const move = await run(`
        window.handleMoveScene(0, 1, -1);
        await until(() => sceneTitles(live())[0] === ${JSON.stringify(ORIGINAL_SCENE)});
        const persisted = await until(async () => {
            const st = await saved('golden_story_1');
            return sceneTitles(st)[0] === ${JSON.stringify(ORIGINAL_SCENE)} && proseText(st, '0-0').length > 100;
        });
        return {
            titles: sceneTitles(live()),
            proseAt00: proseText(live(), '0-0').length,
            proseAt01: proseText(live(), '0-1').length,
            beatsAt00: ((live().beats || {})['0-0'] || []).length,
            persisted
        };
    `);
    assert('Editors: handleMoveScene swaps scenes together with their prose and beats',
        move.titles.length === 3 && move.titles[0] === ORIGINAL_SCENE && move.proseAt00 > 100 && move.proseAt01 === 0 && move.beatsAt00 >= 1 && move.persisted,
        JSON.stringify(move));

    // 7e. Blueprint field edit on a scene is applied and persisted.
    const blueprint = await run(`
        window.updateSceneBlueprint(0, 2, { title: 'Golden Renamed Scene' });
        await until(() => sceneTitles(live())[2] === 'Golden Renamed Scene');
        const persisted = await until(async () => sceneTitles(await saved('golden_story_1'))[2] === 'Golden Renamed Scene');
        return { titles: sceneTitles(live()), persisted };
    `);
    assert('Editors: updateSceneBlueprint edits a scene field and persists it',
        blueprint.titles[2] === 'Golden Renamed Scene' && blueprint.titles[0] === ORIGINAL_SCENE && blueprint.persisted,
        JSON.stringify(blueprint));

    // 7f. Everything above survives a full page reload (hydration path).
    await waitForAppMount(cdp, baseUrl);
    const reloaded = await run(`
        const ok = await until(() => live() && live().id === 'golden_story_1' && sceneTitles(live()).length === 3);
        return {
            ok,
            id: live() && live().id,
            titles: sceneTitles(live()),
            logline: live() && live().logline,
            proseAt00: proseText(live(), '0-0').length,
            castLen: ((live() && live().cast) || []).length,
            worldPrimer: String((live() && live().world_primer) || '').includes('Oakhaven')
        };
    `);
    assert('Persistence: scene edits and autosaved fields survive a full reload',
        reloaded.ok && reloaded.titles[0] === ORIGINAL_SCENE && reloaded.titles[2] === 'Golden Renamed Scene' && reloaded.logline === 'GOLDEN-AUTOSAVE-LOGLINE' && reloaded.proseAt00 > 100 && reloaded.castLen === 2 && reloaded.worldPrimer,
        JSON.stringify(reloaded));

    // 7g. Story switching: each story keeps its own data, edits land on the right record, nothing bleeds across.
    const switching = await run(`
        const second = {
            id: 'golden_story_2',
            title: 'Second Shelf',
            writing_mode: 'novel',
            concept: 'A lamplighter maps a city that rearranges itself every night.',
            logline: 'Second shelf logline.',
            cast: [{ id: 'char_ives', name: 'Ives Marrow', role: 'Protagonist' }],
            acts: [{ number: 1, title: 'Act I: Wicks', description: 'Ives notices the streets no longer match his route book.' }],
            sequences: [{ number: 1, parent_act: 1, title: 'Wrong Turnings', dramatic_question: 'Who is moving the streets?', function: 'Inciting Discovery' }],
            scenes: { '0': [{ id: '1.1', number: '1.1', title: 'Lamp Thirty-One', pov_character: 'Ives Marrow', characters_present: ['Ives Marrow'], synopsis: 'Ives finds lamp thirty-one on the wrong corner.' }] },
            beats: {},
            prose: { '0-0': { final: 'Ives counted the lamps twice along Tallow Row and came up one short, then one over, as though the street itself were breathing in the dark and could not decide how long it wished to be tonight.', draft: '' } },
            lore: [],
            relationships: {},
            graph_edges: []
        };
        await window.storyStore.saveStory(second.id, second);
        const out = {};

        await window.EllipsisProseBridge.switchStory('golden_story_2');
        out.switchedTo2 = await until(() => live() && live().id === 'golden_story_2' && live().title === 'Second Shelf');
        out.activeIdAfterSwitch = await until(() => localStorage.getItem('ellipsisprose_active_story_id') === 'golden_story_2');
        await wait(600); // let the hydration + autosave effects of the switch settle

        window.setStory((prev) => ({ ...prev, logline: 'EDITED-ON-STORY-2' }));
        out.edit2Persisted = await until(async () => ((await saved('golden_story_2')) || {}).logline === 'EDITED-ON-STORY-2');
        const one = await saved('golden_story_1');
        out.story1UntouchedWhileOn2 = Boolean(one) && one.title === 'The Salt Clock' && one.logline === 'GOLDEN-AUTOSAVE-LOGLINE' && sceneTitles(one).length === 3;

        await window.EllipsisProseBridge.switchStory('golden_story_1');
        out.switchedBack = await until(() => live() && live().id === 'golden_story_1' && live().title === 'The Salt Clock' && sceneTitles(live()).length === 3);
        await wait(600);

        const one2 = await saved('golden_story_1');
        const two2 = await saved('golden_story_2');
        out.story1Intact = Boolean(one2) && one2.id === 'golden_story_1' && one2.title === 'The Salt Clock' && sceneTitles(one2).length === 3 && proseText(one2, '0-0').length > 100 && (one2.cast || []).length === 2;
        out.story2Intact = Boolean(two2) && two2.id === 'golden_story_2' && two2.title === 'Second Shelf' && two2.logline === 'EDITED-ON-STORY-2' && sceneTitles(two2).length === 1 && (two2.cast || []).length === 1;
        const listed = await window.storyStore.listStories();
        out.listedIds = (listed || []).map((s) => s.id).filter((id) => id.indexOf('golden_story_') === 0).sort();
        return out;
    `);
    assert('Persistence: switching stories keeps each story intact and edits on the right record',
        switching.switchedTo2 && switching.activeIdAfterSwitch && switching.edit2Persisted && switching.story1UntouchedWhileOn2 && switching.switchedBack && switching.story1Intact && switching.story2Intact && switching.listedIds.join(',') === 'golden_story_1,golden_story_2',
        JSON.stringify(switching));

    // 7h. Reset stage "prose" (confirm modal -> rollback -> forced save): prose is cleared, structure stays.
    const reset = await run(`
        const confirmLabel = 'Delete All Prose';
        const pending = window.handleResetStoryStage('prose');
        const clicked = await until(() => {
            const matches = Array.from(document.querySelectorAll('button')).filter((b) => (b.innerText || '').trim() === confirmLabel);
            if (matches.length === 0) return false;
            matches[matches.length - 1].click();
            return true;
        });
        await Promise.race([Promise.resolve(pending), wait(6000)]);
        const cleared = await until(() => proseText(live(), '0-0').length === 0);
        const persisted = await until(async () => {
            const st = await saved('golden_story_1');
            return Boolean(st) && proseText(st, '0-0').length === 0 && sceneTitles(st).length === 3;
        });
        return {
            clicked,
            cleared,
            persisted,
            titles: sceneTitles(live()),
            castLen: (live().cast || []).length,
            actsLen: (live().acts || []).length,
            modalClosed: await until(() => !Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || '').trim() === confirmLabel)),
            // The reset continues after the save (images, audio, selection, world memory); it reports the outcome in a toast.
            finished: await until(() => (document.body.innerText || '').includes('All prose and writing-time data deleted')),
            failedToast: (document.body.innerText || '').includes('Story reset failed')
        };
    `);
    assert('Persistence: reset stage "prose" clears prose, keeps structure, and persists the regression',
        reset.clicked && reset.cleared && reset.persisted && reset.titles.length === 3 && reset.castLen === 2 && reset.actsLen === 3 && reset.modalClosed,
        JSON.stringify(reset));
    assert('Persistence: reset stage "prose" runs to completion and reports success',
        reset.finished && !reset.failedToast,
        JSON.stringify({ finished: reset.finished, failedToast: reset.failedToast }));

    // 7i. JSON import: the imported story becomes active, is persisted, and existing stories are untouched.
    const imported = await run(`
        const payload = {
            id: 'golden_import_1',
            title: 'Imported Tide',
            writing_mode: 'novel',
            concept: 'A ferryman keeps a ledger of every passenger who never reached the far bank.',
            cast: [{ id: 'char_orla', name: 'Orla Finch', role: 'Protagonist' }],
            acts: [{ number: 1, title: 'Act I: Crossing', description: 'Orla inherits the ferry and its unfinished ledger.' }],
            sequences: [{ number: 1, parent_act: 1, title: 'The Ledger', dramatic_question: 'Whose names are missing?', function: 'Inciting Discovery' }],
            scenes: { '0': [{ id: '1.1', number: '1.1', title: 'First Fare', pov_character: 'Orla Finch', characters_present: ['Orla Finch'], synopsis: 'Orla takes her first passenger across in fog.' }] },
            beats: {},
            prose: { '0-0': { final: 'Orla poled the ferry out from the reeds before dawn, the ledger wrapped in oilcloth under the thwart, and did not look back at the landing where her uncle had stood for forty years counting heads.', draft: '' } },
            lore: []
        };
        const file = new File([JSON.stringify(payload)], 'golden_import.json', { type: 'application/json' });
        await window.handleImport({ target: { files: [file], value: '' } });
        const out = {};
        out.live = await until(() => live() && live().id === 'golden_import_1' && live().title === 'Imported Tide');
        out.activeId = await until(() => localStorage.getItem('ellipsisprose_active_story_id') === 'golden_import_1');
        out.persisted = await until(async () => {
            const st = await saved('golden_import_1');
            return Boolean(st) && st.title === 'Imported Tide' && proseText(st, '0-0').length > 100;
        });
        await wait(600);
        const one = await saved('golden_story_1');
        const two = await saved('golden_story_2');
        out.othersIntact = Boolean(one) && one.title === 'The Salt Clock' && sceneTitles(one).length === 3
            && Boolean(two) && two.title === 'Second Shelf' && two.logline === 'EDITED-ON-STORY-2';
        out.liveCast = ((live() && live().cast) || []).map((c) => c.name);
        return out;
    `);
    assert('Persistence: JSON import activates and persists the story without touching others',
        imported.live && imported.activeId && imported.persisted && imported.othersIntact && imported.liveCast.join(',') === 'Orla Finch',
        JSON.stringify(imported));

    // 7j. The imported story is the one that hydrates after a reload, and the bridge sees the full library.
    await waitForAppMount(cdp, baseUrl);
    const finalState = await run(`
        const ok = await until(() => live() && live().id === 'golden_import_1' && live().title === 'Imported Tide');
        const stories = await window.EllipsisProseBridge.listStories();
        const list = Array.isArray(stories && stories.stories) ? stories.stories : (Array.isArray(stories) ? stories : []);
        const ids = list.map((s) => s.id).filter((id) => /^golden_/.test(String(id))).sort();
        return { ok, id: live() && live().id, ids };
    `);
    assert('Persistence: last active story hydrates after reload and the library lists every story',
        finalState.ok && finalState.ids.join(',') === 'golden_import_1,golden_story_1,golden_story_2',
        JSON.stringify(finalState));
}

// Hosts the app would call for real LLM / embedding / image work. Blocked in pipeline modes so the
// mocked run is hermetic and never depends on (or leaks to) a provider.
const PIPELINE_BLOCKED_URLS = [
    '*generativelanguage.googleapis.com*',
    '*openrouter.ai*',
    '*nano-gpt.com*',
    '*api.elevenlabs.io*',
    '*://localhost:5001/*',
    '*://127.0.0.1:5001/*',
    '*://localhost:8188/*',
    '*://127.0.0.1:8188/*'
];
const PIPELINE_TARGET_PROSE_SCENES = 2;
const PIPELINE_STAGE_ORDER = [
    'Conceptual Development',
    'Character Developer',
    'Story Arc Agent',
    'Act Agent',
    'Sequence Agent',
    'Scene Planner',
    'Writing Agent',
    'Archivist'
];

/** Installs the scripted LLM (fixtures/mockLlm.js) behind window.__callAIOverride and starts a transcript. */
async function installPipelineMock(cdp) {
    const mockSource = fs.readFileSync(path.join(__dirname, 'fixtures', 'mockLlm.js'), 'utf8');
    await cdp.eval(mockSource, false);
    await cdp.eval(`(() => {
        const normalize = (text) => String(text || '')
            .replace(/story_\\d{9,}(?:_[a-z0-9]+)?/g, 'story_ID')
            .replace(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?/g, 'ISO_TIME')
            .replace(/\\b\\d{12,}\\b/g, 'EPOCH');
        const hash = (text) => {
            let h = 2166136261;
            for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
            return ('0000000' + h.toString(16)).slice(-8);
        };
        // The pipeline shuffles sensory "modality hands" with sort(() => 0.5 - Math.random()), and the
        // result lands in the Writing Agent prompt. Other code draws from Math.random too (ids, retry
        // jitter), in an order that differs between runs and between the two builds, so a seeded
        // generator is not enough. Returning values just above 0.5 makes that comparator always
        // negative, so the shuffle is the same whatever was drawn before it, while every value is
        // still distinct (ids built from Math.random stay unique).
        let draws = 0;
        Math.random = () => 0.5 + (++draws) * 1e-9;
        window.__goldenTranscript = [];
        window.__goldenPrompts = [];
        window.__callAIOverride = async (prompt, systemPrompt, isJson, logName, role) => {
            if (String(prompt).includes('redrawing the coastline')) window.__goldenBridgeConceptSeen = true;
            const out = await window.__goldenMockLlm(prompt, systemPrompt, isJson, logName);
            // Known, intended difference: the Lore Extraction prompt embeds the story's status quo and
            // lore topics. The legacy app read them from a stale render closure (usually empty); the
            // modular pipeline reads the live story. Compare the rest of that prompt only.
            const comparable = String(logName || '') === 'Lore Extraction Agent'
                ? String(prompt || '')
                    .replace(/<current_status_quo>[\\s\\S]*?<\\/current_status_quo>/, '<current_status_quo/>')
                    .replace(/<current_lore_topics>[\\s\\S]*?<\\/current_lore_topics>/, '<current_lore_topics/>')
                : prompt;
            const np = normalize(comparable);
            const ns = normalize(systemPrompt);
            window.__goldenPrompts.push({ prompt: np, system: ns });
            window.__goldenTranscript.push({
                logName: String(logName || ''),
                role: String(role || ''),
                isJson: Boolean(isJson),
                promptLen: np.length,
                promptHash: hash(np),
                systemLen: ns.length,
                systemHash: hash(ns),
                outLen: String(out || '').length
            });
            return out;
        };
        return true;
    })()`, false);
}

/**
 * External automation path: `EllipsisProseBridge.startNewStory` (what mcp-server's start_new_story
 * sends) must fill the Setup form AND actually start generation with that concept.
 */
async function runBridgeStartScenario({ cdp, baseUrl, results, label }) {
    const assert = (name, cond, detail = '') => {
        if (cond) {
            results.passed.push(name);
            console.log(`  [PASS] ${name}`);
        } else {
            results.failed.push({ name, detail });
            console.error(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`);
        }
    };
    await waitForAppMount(cdp, baseUrl);
    await sleep(600);
    await installPipelineMock(cdp);
    const concept = 'A cartographer discovers her maps are redrawing the coastline overnight.';
    const reply = await cdp.eval(`window.EllipsisProseBridge.startNewStory(${JSON.stringify({ title: 'Bridge Started Story', concept, isAutopilot: false })})`, true);
    let seen = { calls: 0, conceptInPrompt: false };
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        await sleep(300);
        seen = await cdp.eval(`({ calls: window.__goldenTranscript.length, conceptInPrompt: Boolean(window.__goldenBridgeConceptSeen) })`, false);
        if (seen.calls > 0) break;
    }
    assert(`Bridge[${label}]: startNewStory starts generation with the supplied concept`,
        reply && reply.status === 'started' && seen.calls > 0 && seen.conceptInPrompt,
        JSON.stringify({ reply, seen }));
    // Let the run settle so teardown does not race in-flight work.
    for (let i = 0; i < 120; i++) {
        const st = await cdp.eval('window.EllipsisProseBridge.getPipelineStatus()', true);
        if (!st.loading) break;
        await sleep(500);
    }
}

/** Page script: fill the Setup form through the DOM and start Autopilot through its confirm modal. */
function startAutopilotFromSetupExpr(title, concept) {
    return `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        window.setView('setup');
        await wait(500);
        const setVal = (el, v) => {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        };
        const field = (prefix) => Array.from(document.querySelectorAll('input,textarea'))
            .find((e) => (e.getAttribute('placeholder') || '').startsWith(prefix));
        const title = field('Story Title');
        const concept = field('Concept');
        if (!title || !concept) return { ok: false, reason: 'setup fields not found' };
        setVal(title, ${JSON.stringify(title)});
        setVal(concept, ${JSON.stringify(concept)});
        await wait(700);
        const isStart = (b) => /^Start\\s+Autopilot$/i.test((b.innerText || '').trim());
        const startBtn = Array.from(document.querySelectorAll('button')).find((b) => isStart(b) && !b.disabled);
        if (!startBtn) return { ok: false, reason: 'Start Autopilot button not found or disabled' };
        startBtn.click();
        // The confirm modal renders a second "Start Autopilot" button.
        let confirmed = false;
        for (let i = 0; i < 40 && !confirmed; i++) {
            await wait(100);
            const matches = Array.from(document.querySelectorAll('button')).filter(isStart);
            if (matches.length >= 2) { matches[matches.length - 1].click(); confirmed = true; }
        }
        return { ok: confirmed, reason: confirmed ? '' : 'confirm modal did not appear' };
    })()`;
}

/** Page script: switch Continuous Autopilot off and wait for the pipeline to go idle. */
const STOP_AUTOPILOT_EXPR = `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        let st = await window.EllipsisProseBridge.getPipelineStatus();
        if (st.continuousAutopilot) window.toggleContinuousAutopilot();
        for (let i = 0; i < 300; i++) {
            await wait(200);
            st = await window.EllipsisProseBridge.getPipelineStatus();
            if (!st.continuousAutopilot && !st.loading) return { idle: true };
        }
        return { idle: false, st };
    })()`;

/**
 * Mocked-LLM end-to-end pipeline scenario. Uses the real UI path (Setup form -> Start Autopilot ->
 * confirm) and the window.__callAIOverride seam, both present in the legacy app and the modular build.
 * Returns { transcript, digest } so two builds can be compared.
 */
async function runPipelineScenario({ cdp, exceptions, baseUrl, results, label }) {
    const assert = (name, cond, detail = '') => {
        const full = `${name}`;
        if (cond) {
            results.passed.push(full);
            console.log(`  [PASS] ${full}`);
        } else {
            results.failed.push({ name: full, detail });
            console.error(`  [FAIL] ${full}${detail ? ` -> ${detail}` : ''}`);
        }
    };

    await cdp.send('Network.setBlockedURLs', { urls: PIPELINE_BLOCKED_URLS });
    await waitForAppMount(cdp, baseUrl);
    await sleep(600);

    await installPipelineMock(cdp);

    // 1. Fill the Setup form through the DOM and start Autopilot (real user path).
    const started = await cdp.eval(startAutopilotFromSetupExpr('Golden Pipeline Run',
        'A coastal archivist uncovers forged tide ledgers that hide a vanished lighthouse keeper.'), true);
    assert(`Pipeline[${label}]: Setup form starts Autopilot through the confirm modal`, started.ok, JSON.stringify(started));
    if (!started.ok) return { transcript: [], digest: null };

    // 2. Let Autopilot run until the first scenes have prose, then stop it and wait for it to go idle.
    const proseCountExpr = `(() => {
        const s = window.storyRef.current || {};
        return Object.values(s.prose || {}).filter((p) => p && String(p.final || p.draft || '').trim().length > 0).length;
    })()`;
    let proseScenes = 0;
    let calls = 0;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
        await sleep(500);
        proseScenes = await cdp.eval(proseCountExpr, false);
        calls = await cdp.eval('window.__goldenTranscript.length', false);
        if (proseScenes >= PIPELINE_TARGET_PROSE_SCENES) break;
        if (calls > 400) break; // runaway guard: a healthy run needs ~35 calls
    }
    const stopped = await cdp.eval(STOP_AUTOPILOT_EXPR, true);
    assert(`Pipeline[${label}]: Autopilot writes ${PIPELINE_TARGET_PROSE_SCENES} scenes and stops cleanly`,
        proseScenes >= PIPELINE_TARGET_PROSE_SCENES && stopped.idle, JSON.stringify({ proseScenes, calls, stopped }));

    // 3. Collect the transcript and a digest of the story the run produced.
    await sleep(800);
    const report = await cdp.eval(`(async () => {
        const s = window.storyRef.current || {};
        const words = (t) => String(t || '').trim().split(/\\s+/).filter(Boolean).length;
        const digestOf = (st) => ({
            title: st.title,
            writingMode: st.writing_mode,
            cast: (st.cast || []).map((c) => c.name),
            acts: (st.acts || []).length,
            sequences: (st.sequences || []).length,
            scenesPerSequence: Object.fromEntries(Object.entries(st.scenes || {}).map(([k, v]) => [k, (v || []).length])),
            sceneTitles: ((st.scenes || {})['0'] || []).map((sc) => sc.title),
            proseWords: Object.fromEntries(Object.entries(st.prose || {}).map(([k, v]) => [k, words(v && (v.final || v.draft))])),
            loreCount: (st.lore || []).length,
            hasStoryArc: Boolean(st.story_arc || st.arc || st.central_conflict || st.logline),
            characterStates: Object.keys(st.character_states || {}).sort()
        });
        const saved = s.id ? await window.storyStore.loadStory(s.id) : null;
        return {
            id: s.id,
            activeId: localStorage.getItem('ellipsisprose_active_story_id'),
            digest: digestOf(s),
            savedDigest: saved ? digestOf(saved) : null,
            transcript: window.__goldenTranscript,
            prompts: window.__goldenPrompts
        };
    })()`, true);

    const { digest, savedDigest, transcript, prompts } = report;
    const names = transcript.map((t) => t.logName);
    const firstIndex = (prefix) => names.findIndex((n) => n.startsWith(prefix));
    const stageIdx = PIPELINE_STAGE_ORDER.map(firstIndex);
    const stagesInOrder = stageIdx.every((idx, i) => idx >= 0 && (i === 0 || idx > stageIdx[i - 1]));
    assert(`Pipeline[${label}]: every pipeline stage runs, in order`, stagesInOrder,
        JSON.stringify(PIPELINE_STAGE_ORDER.map((st, i) => `${st}@${stageIdx[i]}`)));

    const retries = names.filter((n) => /Attempt [2-9]\/|\(Retry \d+\)/.test(n));
    assert(`Pipeline[${label}]: valid agent output is accepted on the first attempt (no retries)`, retries.length === 0,
        JSON.stringify([...new Set(retries)].slice(0, 8)));

    const proseKeys = Object.keys(digest.proseWords || {}).filter((k) => digest.proseWords[k] > 0);
    const writeStarts = names.filter((n) => /^Writing Agent \(Attempt 1\//.test(n)).length;
    // A scene may be mid-flight when Autopilot is stopped, so allow one draft beyond the saved scenes.
    assert(`Pipeline[${label}]: written prose is kept (each scene is drafted once, never re-written in a loop)`,
        proseKeys.length >= PIPELINE_TARGET_PROSE_SCENES && writeStarts <= proseKeys.length + 1 && proseKeys.every((k) => digest.proseWords[k] > 200),
        JSON.stringify({ proseWords: digest.proseWords, writeStarts }));

    assert(`Pipeline[${label}]: story bible and structure are populated`,
        digest.title === 'Golden Pipeline Run' && digest.cast.length >= 3 && digest.acts >= 3 && digest.sequences >= 1 && (digest.scenesPerSequence['0'] || 0) >= PIPELINE_TARGET_PROSE_SCENES,
        JSON.stringify(digest));

    assert(`Pipeline[${label}]: generated story is the active story and is persisted identically`,
        Boolean(report.id) && report.id !== 'story_default' && report.activeId === report.id && JSON.stringify(savedDigest) === JSON.stringify(digest),
        JSON.stringify({ id: report.id, activeId: report.activeId, savedDigest }));

    assert(`Pipeline[${label}]: zero uncaught runtime exceptions`, exceptions.length === 0, exceptions.join(' | '));

    return { transcript, digest, prompts };
}

/** Compare two pipeline runs (legacy vs modular). Reports the first divergence. */
function comparePipelineRuns(legacy, modern, results) {
    const record = (name, cond, detail = '') => {
        if (cond) { results.passed.push(name); console.log(`  [PASS] ${name}`); }
        else { results.failed.push({ name, detail }); console.error(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`); }
    };
    const a = legacy.transcript || [];
    const b = modern.transcript || [];
    // Autopilot is stopped by polling, so the two runs can differ by a few trailing calls: compare the common prefix
    // up to the end of the last fully written scene.
    const lastArchivist = (t) => t.map((c) => c.logName).lastIndexOf('Archivist');
    const n = Math.min(lastArchivist(a), lastArchivist(b)) + 1;
    let firstNameDiff = -1;
    let firstPromptDiff = -1;
    let promptDiffs = 0;
    for (let i = 0; i < n; i++) {
        if (a[i].logName !== b[i].logName) { firstNameDiff = i; break; }
        if (a[i].promptHash !== b[i].promptHash || a[i].systemHash !== b[i].systemHash) {
            promptDiffs++;
            if (firstPromptDiff < 0) firstPromptDiff = i;
        }
    }
    record('Parity: legacy and modular builds call the same agents in the same order', n > 0 && firstNameDiff < 0,
        firstNameDiff >= 0 ? JSON.stringify({ index: firstNameDiff, legacy: a[firstNameDiff].logName, modular: b[firstNameDiff].logName }) : `compared ${n} calls`);
    record('Parity: legacy and modular builds send byte-identical prompts to every agent', n > 0 && firstNameDiff < 0 && promptDiffs === 0,
        firstPromptDiff >= 0 ? JSON.stringify({ differingCalls: promptDiffs, of: n, first: { index: firstPromptDiff, legacy: a[firstPromptDiff], modular: b[firstPromptDiff] } }) : '');
    // Full text of every differing prompt pair, for the --out report (a CI artifact), so drift can be diffed offline.
    const promptDiffList = [];
    if (firstNameDiff < 0) {
        for (let i = 0; i < n; i++) {
            if (a[i].promptHash === b[i].promptHash && a[i].systemHash === b[i].systemHash) continue;
            promptDiffList.push({
                index: i,
                logName: a[i].logName,
                legacy: (legacy.prompts || [])[i] || null,
                modular: (modern.prompts || [])[i] || null
            });
        }
    }
    // Human-readable drift summary for the job log: lines present on one side only, per differing call.
    const lineDiff = (x, y) => {
        const xs = String(x || '').split('\n');
        const ys = String(y || '').split('\n');
        const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
        const only = (from, other) => {
            const left = count(other);
            return from.filter((l) => { const c = left.get(l) || 0; if (c > 0) { left.set(l, c - 1); return false; } return true; });
        };
        return { onlyLegacy: only(xs, ys), onlyModular: only(ys, xs) };
    };
    const clip = (l) => (l.length > 400 ? `${l.slice(0, 400)}… (+${l.length - 400} chars)` : l);
    for (const d of promptDiffList) {
        for (const field of ['system', 'prompt']) {
            const lx = d.legacy?.[field];
            const mx = d.modular?.[field];
            if (lx === mx) continue;
            const { onlyLegacy, onlyModular } = lineDiff(lx, mx);
            console.log(`  [drift] call ${d.index} ${d.logName} (${field}): legacy ${String(lx || '').length} chars, modular ${String(mx || '').length} chars; ${onlyLegacy.length} line(s) only in legacy, ${onlyModular.length} only in modular`);
            onlyLegacy.slice(0, 8).forEach((l) => console.log(`      - ${clip(l)}`));
            onlyModular.slice(0, 8).forEach((l) => console.log(`      + ${clip(l)}`));
        }
    }
    const strip = (d) => d ? { ...d, proseWords: undefined, characterStates: undefined } : d;
    record('Parity: legacy and modular builds produce the same story structure',
        JSON.stringify(strip(legacy.digest)) === JSON.stringify(strip(modern.digest)),
        JSON.stringify({ legacy: strip(legacy.digest), modular: strip(modern.digest) }));
    return promptDiffList;
}

/**
 * Offline support (service worker built from src/sw.ts). Runs after the core suite, on the same
 * browser profile, so the story the suite saved is still in IndexedDB. The server is stopped for
 * real (no network emulation), the page is reloaded, and the app has to come up from the precache
 * with the user's data intact. `stopServer` leaves nothing listening on the port.
 */
async function runOfflineSuite({ cdp, exceptions, baseUrl, stopServer, results }) {
    const assert = (name, cond, detail = '') => {
        if (cond) {
            results.passed.push(name);
            console.log(`  [PASS] ${name}`);
        } else {
            results.failed.push({ name, detail });
            console.error(`  [FAIL] ${name}${detail ? ' -> ' + detail : ''}`);
        }
    };

    await waitForAppMount(cdp, baseUrl);
    let sw = null;
    for (let i = 0; i < 40; i++) {
        sw = await cdp.eval(`(async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            const names = await caches.keys();
            const precacheName = names.find((n) => n.startsWith('workbox-precache'));
            const precached = precacheName ? (await (await caches.open(precacheName)).keys()).map((r) => r.url) : [];
            const stories = await window.storyStore.listStories();
            return {
                active: Boolean(reg && reg.active && reg.active.state === 'activated'),
                controlled: Boolean(navigator.serviceWorker.controller),
                script: reg && reg.active ? reg.active.scriptURL : '',
                scope: reg ? reg.scope : '',
                cacheNames: names,
                precachedCount: precached.length,
                hasIndex: precached.some((u) => u.includes('index.html')),
                storyIds: stories.map((st) => st.id).sort()
            };
        })()`, true);
        if (sw.active && sw.controlled && sw.precachedCount >= 15) break;
        await sleep(500);
    }
    assert('Offline: service worker is active, controls the page and is scoped to the app path',
        sw.active && sw.controlled && sw.script === baseUrl + 'sw.js' && sw.scope === baseUrl, JSON.stringify({ ...sw, storyIds: undefined }));
    assert('Offline: every built file is precached and no legacy cache is left behind',
        sw.precachedCount >= 15 && sw.hasIndex && !sw.cacheNames.some((n) => n.startsWith('ellipsisprose-static-')),
        JSON.stringify({ precachedCount: sw.precachedCount, cacheNames: sw.cacheNames }));

    await stopServer();
    const exceptionsBefore = exceptions.length;
    let offlineState = null;
    let offlineError = '';
    try {
        offlineState = await waitForAppMount(cdp, baseUrl);
    } catch (err) {
        offlineError = String(err && err.message ? err.message : err);
    }
    assert('Offline: app boots from the precache with the server stopped',
        Boolean(offlineState) && offlineState.rootLen > 2000 && offlineState.promptCount >= 59, offlineError || JSON.stringify(offlineState));

    const after = offlineState
        ? await cdp.eval(`(async () => {
            const stories = await window.storyStore.listStories();
            return { storyIds: stories.map((st) => st.id).sort(), activeId: localStorage.getItem('ellipsisprose_active_story_id') };
        })()`, true)
        : { storyIds: [], activeId: null };
    assert('Offline: stories and settings in the browser are untouched by the worker',
        sw.storyIds.length > 0 && JSON.stringify(after.storyIds) === JSON.stringify(sw.storyIds) && Boolean(after.activeId),
        JSON.stringify({ before: sw.storyIds, after }));
    assert('Offline: no uncaught exceptions while offline', exceptions.length === exceptionsBefore, exceptions.slice(exceptionsBefore).join(' | '));
}

const LIVE_LORE_SAMPLE = `The city of Vessmark stands on stilts above the Grey Fen. Its Lamplighters' Guild, led by Guildmaster Orla Teague, keeps the marsh-gas lamps burning and decides who may cross the causeways after dark. Twenty years ago the Fen Court was dissolved after the Drowning of the Low Quarter, and the guild has governed in its place ever since. Smugglers called reedmen move salt and letters through the unlit channels.`;
const LIVE_STAGE_ORDER = ['Conceptual Development', 'Character Developer', 'Story Arc Agent', 'Act Agent', 'Sequence Agent', 'Scene Planner', 'Writing Agent'];
const LIVE_TARGET_PROSE_SCENES = 1;

/**
 * Live-model scenarios: the real UI paths with a real model answering. Assertions are structural
 * (did each stage produce something the next stage could use), never about the wording.
 */
async function runLiveScenarios({ cdp, exceptions, baseUrl, results, relay, llm, timeoutMs }) {
    const assert = (name, cond, detail = '') => {
        if (cond) {
            results.passed.push(name);
            console.log(`  [PASS] ${name}`);
        } else {
            results.failed.push({ name, detail });
            console.error(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`);
        }
    };
    const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

    // 1. Connection: one tiny call straight from Node, so a bad key or model fails in seconds.
    let hello = '';
    let helloError = '';
    try {
        hello = await llm.complete({ prompt: 'Reply with the single word READY.', systemPrompt: '', isJson: false, logName: 'Live connection check' });
    } catch (error) {
        helloError = error.message;
    }
    assert(`Live: the model answers (${llm.config?.model || 'scripted'})`, /ready/i.test(hello), helloError || hello.slice(0, 120));
    if (!/ready/i.test(hello)) return;

    await cdp.send('Network.setBlockedURLs', { urls: PIPELINE_BLOCKED_URLS });
    await waitForAppMount(cdp, baseUrl);
    await sleep(600);
    await cdp.eval(liveOverrideSource(relay.url), false);

    // 2. One agent through the app: lore distillation (a single call on the fast path).
    const lore = await cdp.eval(`(async () => {
        try {
            const primer = await window.distillLore(${JSON.stringify(LIVE_LORE_SAMPLE)});
            return { primer: String(primer || ''), errors: window.__goldenLiveErrors.slice() };
        } catch (e) { return { primer: '', errors: [String(e && e.message || e)] }; }
    })()`, true);
    assert('Live: lore distillation returns a world primer that keeps the source names',
        words(lore.primer) >= 20 && /Vessmark|Teague|Lamplighter/i.test(lore.primer),
        JSON.stringify({ words: words(lore.primer), errors: lore.errors, sample: lore.primer.slice(0, 160) }));

    // 3. Autopilot from the Setup form until the first scene has prose.
    await cdp.eval('window.__goldenLiveTranscript.length = 0; window.__goldenLiveErrors.length = 0;', false);
    const started = await cdp.eval(startAutopilotFromSetupExpr('Live Model Run',
        'A lamplighter in a marsh city finds that someone is putting out the causeway lamps one by one. Keep it a short story.'), true);
    assert('Live: Setup form starts Autopilot through the confirm modal', started.ok, JSON.stringify(started));
    if (!started.ok) return;

    const proseCountExpr = `(() => {
        const s = window.storyRef.current || {};
        return Object.values(s.prose || {}).filter((p) => p && String(p.final || p.draft || '').trim().length > 0).length;
    })()`;
    let proseScenes = 0;
    let lastName = '';
    let fatal = '';
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await sleep(2000);
        proseScenes = await cdp.eval(proseCountExpr, false);
        const progress = await cdp.eval(`(() => {
            const t = window.__goldenLiveTranscript;
            return { calls: t.length, last: t.length ? t[t.length - 1].logName : '', errors: window.__goldenLiveErrors.slice(-3) };
        })()`, false);
        if (progress.last && progress.last !== lastName) {
            lastName = progress.last;
            console.log(`  [live] call ${progress.calls}: ${lastName}`);
        }
        if (proseScenes >= LIVE_TARGET_PROSE_SCENES) break;
        // Credentials, quota or the call cap: every further call would fail the same way.
        const hardStop = progress.errors.find((e) => /\(401\)|\(403\)|\(404\)|LIVE_LLM_MAX_CALLS/.test(e));
        if (hardStop) { fatal = hardStop; break; }
    }
    const stopped = await cdp.eval(STOP_AUTOPILOT_EXPR, true);
    assert(`Live: Autopilot writes ${LIVE_TARGET_PROSE_SCENES} scene with a real model and stops cleanly`,
        proseScenes >= LIVE_TARGET_PROSE_SCENES && stopped.idle,
        JSON.stringify({ proseScenes, lastCall: lastName, fatal, stopped, timedOut: Date.now() >= deadline }));

    await sleep(800);
    const report = await cdp.eval(`(async () => {
        const s = window.storyRef.current || {};
        const words = (t) => String(t || '').trim().split(/\\s+/).filter(Boolean).length;
        const digestOf = (st) => ({
            title: st.title,
            cast: (st.cast || []).map((c) => c.name),
            acts: (st.acts || []).length,
            sequences: (st.sequences || []).length,
            scenes: Object.values(st.scenes || {}).reduce((n, v) => n + (v || []).length, 0),
            proseWords: Object.fromEntries(Object.entries(st.prose || {}).map(([k, v]) => [k, words(v && (v.final || v.draft))]))
        });
        const saved = s.id ? await window.storyStore.loadStory(s.id) : null;
        return {
            id: s.id,
            activeId: localStorage.getItem('ellipsisprose_active_story_id'),
            digest: digestOf(s),
            savedDigest: saved ? digestOf(saved) : null,
            transcript: window.__goldenLiveTranscript.map((t) => ({ logName: t.logName, ms: t.ms, chars: t.chars, error: t.error })),
            errors: window.__goldenLiveErrors.slice()
        };
    })()`, true);
    const { digest, savedDigest, transcript } = report;
    const names = transcript.map((t) => t.logName);
    const stageIdx = LIVE_STAGE_ORDER.map((prefix) => names.findIndex((n) => n.startsWith(prefix)));
    assert('Live: every pipeline stage runs, in order',
        stageIdx.every((idx, i) => idx >= 0 && (i === 0 || idx > stageIdx[i - 1])),
        JSON.stringify(LIVE_STAGE_ORDER.map((st, i) => `${st}@${stageIdx[i]}`)));

    assert('Live: real model output parses into a story bible and structure',
        digest.cast.length >= 1 && digest.cast.every((n) => String(n || '').trim()) && digest.acts >= 1 && digest.sequences >= 1 && digest.scenes >= 1,
        JSON.stringify(digest));

    const written = Object.values(digest.proseWords || {}).filter((n) => n > 0);
    assert('Live: the written scene is real prose (150+ words, no leftover tags)',
        written.length >= 1 && written.every((n) => n >= 150)
            && !/<\/?(prose_text|polished_prose|draft_prose)>/.test(await cdp.eval(`(() => {
                const s = window.storyRef.current || {};
                return Object.values(s.prose || {}).map((p) => String((p && (p.final || p.draft)) || '')).join('\\n');
            })()`, false)),
        JSON.stringify(digest.proseWords));

    assert('Live: the generated story is the active story and is saved',
        Boolean(report.id) && report.id !== 'story_default' && report.activeId === report.id
            && Boolean(savedDigest) && savedDigest.cast.length === digest.cast.length && savedDigest.scenes === digest.scenes,
        JSON.stringify({ id: report.id, activeId: report.activeId, savedDigest }));

    assert('Live: zero uncaught runtime exceptions', exceptions.length === 0, exceptions.join(' | '));

    // Not assertions: how hard the model made the pipeline work.
    const retries = names.filter((n) => /Attempt [2-9]\/|\(Retry \d+\)/.test(n)).length;
    console.log(`  [live] ${names.length} agent calls, ${retries} retries, ${report.errors.length} failed calls`);
    return { digest, transcript };
}

/** A stand-in for the live model so the live plumbing can be exercised without a key or network. */
function createScriptedLlm() {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fixtures', 'mockLlm.js'), 'utf8'), sandbox);
    const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, refusals: 0, truncated: 0 };
    return {
        usage,
        config: { model: 'scripted' },
        complete: async ({ prompt, systemPrompt, isJson, logName }) => {
            usage.calls += 1;
            if (logName === 'Live connection check') return 'READY';
            if (/^Lore Distiller/.test(String(logName))) return `World primer. ${String(prompt).slice(-600)}`;
            return String(await sandbox.window.__goldenMockLlm(prompt, systemPrompt, isJson, logName));
        }
    };
}

async function runMode(opts) {
    const results = { mode: opts.mode, passed: [], failed: [] };
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ellipsis-golden-'));
    const userDataDir = path.join(tmpBase, 'chrome-prof');
    const dataDir = path.join(tmpBase, 'vault-data');
    fs.mkdirSync(dataDir, { recursive: true });

    let server = null;
    let session = null;

    try {
        const port = await getFreePort();
        const cdpPort = await getFreePort();

        if (opts.mode === 'legacy') {
            server = await startStaticHttpServer({ port, staticDir: ensureLegacySite(), indexFile: 'index.html' });
            session = await launchChromeSession(userDataDir, cdpPort);
            await runCoreSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/`, screenshotDir: opts.screenshots, results });
        } else if (opts.mode === 'local') {
            const distDir = path.join(ROOT_DIR, 'dist');
            if (!fs.existsSync(path.join(distDir, 'index.html'))) {
                throw new Error('dist/index.html missing — run npm run build first');
            }
            server = await startLocalAppServer({ port, staticDir: distDir, dataDir });
            session = await launchChromeSession(userDataDir, cdpPort);
            await runCoreSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/`, screenshotDir: opts.screenshots, results });
            await runOfflineSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/`, stopServer: () => server.close(), results });
        } else if (opts.mode === 'subpath') {
            const distDir = path.join(ROOT_DIR, 'dist');
            if (!fs.existsSync(path.join(distDir, 'index.html'))) {
                throw new Error('dist/index.html missing — run npm run build first');
            }
            server = await startStaticHttpServer({ port, mountPrefix: '/WriteforMe/', staticDir: distDir, indexFile: 'index.html' });
            session = await launchChromeSession(userDataDir, cdpPort);
            await runCoreSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/WriteforMe/`, screenshotDir: opts.screenshots, results });
            const nonStatusApi404s = session.api404Responses.filter((r) => !String(r.url || '').endsWith('/api/storage/status'));
            const api404CheckName = 'Subpath mode emits at most 1 /api/storage/status probe per load and 0 other /api/storage/* 404s';
            if (session.api404Responses.length <= CORE_SUITE_PAGE_LOADS && nonStatusApi404s.length === 0) {
                results.passed.push(api404CheckName);
                console.log(`  [PASS] ${api404CheckName} (observed ${session.api404Responses.length} status probe(s))`);
            } else {
                const detail = `observed ${session.api404Responses.length} total (${nonStatusApi404s.length} non-status): ${JSON.stringify(session.api404Responses.slice(0, 5))}`;
                results.failed.push({ name: api404CheckName, detail });
                console.error(`  [FAIL] ${api404CheckName} -> ${detail}`);
            }
            await runOfflineSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/WriteforMe/`, stopServer: () => server.close(), results });
        } else if (opts.mode === 'singlefile') {
            const sfDir = path.join(ROOT_DIR, 'dist-singlefile');
            const sfFile = path.join(sfDir, 'EllipsisProse-portable.html');
            if (!fs.existsSync(sfFile)) {
                throw new Error('dist-singlefile/EllipsisProse-portable.html missing — run npm run build:singlefile first');
            }
            server = await startStaticHttpServer({ port, staticDir: sfDir, indexFile: 'EllipsisProse-portable.html' });
            session = await launchChromeSession(userDataDir, cdpPort);
            await runCoreSuite({ ...session, baseUrl: `http://127.0.0.1:${port}/`, screenshotDir: opts.screenshots, results });

            // Also verify direct file:/// boot
            const fileState = await waitForAppMount(session.cdp, pathToFileURL(sfFile).href);
            if (fileState.rootLen > 2000 && fileState.promptCount >= 59 && session.exceptions.length === 0) {
                results.passed.push('Singlefile direct file:/// boot mounts cleanly with all prompts');
                console.log('  [PASS] Singlefile direct file:/// boot mounts cleanly with all prompts');
            } else {
                results.failed.push({ name: 'Singlefile direct file:/// boot', detail: JSON.stringify(fileState) });
                console.error('  [FAIL] Singlefile direct file:/// boot');
            }
        } else if (opts.mode === 'pipeline' || opts.mode === 'pipeline-legacy' || opts.mode === 'pipeline-parity') {
            const distDir = path.join(ROOT_DIR, 'dist');
            const runOn = async (label) => {
                const runPort = await getFreePort();
                const runCdpPort = await getFreePort();
                const profile = path.join(tmpBase, `chrome-prof-${label}`);
                if (label === 'legacy') {
                    server = await startStaticHttpServer({ port: runPort, staticDir: ensureLegacySite(), indexFile: 'index.html' });
                } else {
                    if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/index.html missing — run npm run build first');
                    server = await startStaticHttpServer({ port: runPort, staticDir: distDir, indexFile: 'index.html' });
                }
                session = await launchChromeSession(profile, runCdpPort);
                const run = await runPipelineScenario({ ...session, baseUrl: `http://127.0.0.1:${runPort}/`, results, label });
                await runBridgeStartScenario({ ...session, baseUrl: `http://127.0.0.1:${runPort}/`, results, label });
                await session.close();
                session = null;
                await server.close();
                server = null;
                return run;
            };
            const runs = {};
            if (opts.mode !== 'pipeline') runs.legacy = await runOn('legacy');
            if (opts.mode !== 'pipeline-legacy') runs.modular = await runOn('modular');
            const promptDiffs = opts.mode === 'pipeline-parity' ? comparePipelineRuns(runs.legacy, runs.modular, results) : undefined;
            if (opts.out) {
                const report = {};
                for (const [label, run] of Object.entries(runs)) report[label] = { transcript: run.transcript, digest: run.digest };
                if (promptDiffs) report.promptDiffs = promptDiffs;
                fs.mkdirSync(path.dirname(opts.out), { recursive: true });
                fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));
                console.log(`[golden] Wrote pipeline transcript -> ${opts.out}`);
            }
        } else if (opts.mode === 'live') {
            // Opt-in: real model calls. LIVE_LLM_SCRIPTED=1 swaps in the scripted model to test the plumbing.
            const scripted = process.env.LIVE_LLM_SCRIPTED === '1';
            const config = liveConfigFromEnv();
            if (!scripted && !config.hasCredentials) {
                console.log('[live] SKIPPED: ANTHROPIC_API_KEY is not set. Nothing was run.');
                console.log('\n=== GOLDEN SUITE SUMMARY [live] ===\nSkipped: no ANTHROPIC_API_KEY');
                return;
            }
            const distDir = path.join(ROOT_DIR, 'dist');
            if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/index.html missing — run npm run build first');
            const llm = scripted ? createScriptedLlm() : createLiveLlm(config);
            console.log(scripted
                ? '[live] Using the scripted model (LIVE_LLM_SCRIPTED=1): no network, no cost.'
                : `[live] Model ${config.model}, effort ${config.effort}, at most ${config.maxCalls} calls. This spends real API credit.`);
            server = await startStaticHttpServer({ port, staticDir: distDir, indexFile: 'index.html' });
            const relay = await startLiveRelay({ llm, allowedOrigin: `http://127.0.0.1:${port}` });
            try {
                session = await launchChromeSession(userDataDir, cdpPort);
                const timeoutMs = (Number.parseInt(process.env.LIVE_LLM_TIMEOUT_MINUTES || '', 10) || 30) * 60000;
                const run = await runLiveScenarios({ ...session, baseUrl: `http://127.0.0.1:${port}/`, results, relay, llm, timeoutMs });
                const u = llm.usage;
                console.log(`[live] Usage: ${u.calls} model calls, ${u.inputTokens.toLocaleString()} input tokens, ${u.outputTokens.toLocaleString()} output tokens`
                    + `${u.truncated ? `, ${u.truncated} hit the output cap` : ''}${u.refusals ? `, ${u.refusals} declined` : ''}`);
                if (opts.out && run) {
                    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
                    fs.writeFileSync(opts.out, JSON.stringify({ model: llm.config.model, usage: u, ...run }, null, 2));
                    console.log(`[golden] Wrote live transcript -> ${opts.out}`);
                }
            } finally {
                await relay.close();
            }
        } else if (opts.mode === 'upgrade') {
            const legacySiteDir = ensureLegacySite();
            const distDir = path.join(ROOT_DIR, 'dist');
            if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/index.html missing');

            // Step A: Boot legacy app on fixed origin & seed IDB + localStorage via real app APIs
            server = await startStaticHttpServer({ port, staticDir: legacySiteDir, indexFile: 'index.html' });
            session = await launchChromeSession(userDataDir, cdpPort);
            const originUrl = `http://127.0.0.1:${port}/`;
            await waitForAppMount(session.cdp, originUrl);
            await session.cdp.eval(buildSeedFixtureScript(), true);
            await session.cdp.eval(`window.EllipsisProseBridge.setModelConfig({ provider: 'gemini', apiKey: 'AIzaGoldenTestKey12345' })`, true);
            await waitForAppMount(session.cdp, originUrl);
            await sleep(800);
            // The old hand-written worker installs here; the new build has to take over from it below.
            let legacyWorker = { registered: false, cacheNames: [] };
            for (let i = 0; i < 20; i++) {
                legacyWorker = await session.cdp.eval(`(async () => {
                    const reg = await navigator.serviceWorker.getRegistration();
                    return { registered: Boolean(reg && reg.active), cacheNames: await caches.keys() };
                })()`, true);
                if (legacyWorker.registered && legacyWorker.cacheNames.some((n) => n.startsWith('ellipsisprose-static-'))) break;
                await sleep(500);
            }
            // Navigate to about:blank so Chrome flushes LevelDB localStorage cleanly before process exit
            await session.cdp.send('Page.navigate', { url: 'about:blank' });
            await sleep(500);
            await session.close();
            session = null;
            await server.close();
            server = null;

            // Step B: Start Vite dist/ on the EXACT SAME origin & Chrome profile
            const cdpPort2 = await getFreePort();
            server = await startStaticHttpServer({ port, staticDir: distDir, indexFile: 'index.html' });
            session = await launchChromeSession(userDataDir, cdpPort2);
            await waitForAppMount(session.cdp, originUrl);
            await sleep(700);

            const upgraded = await session.cdp.eval(`(async () => {
                const story = await window.storyStore.loadStory('golden_story_1');
                const logs = await window.logStore.loadLogs('golden_story_1').catch(() => []);
                return {
                    activeId: localStorage.getItem('ellipsisprose_active_story_id'),
                    geminiKey: localStorage.getItem('gemini_api_key'),
                    slopCfg: localStorage.getItem('ellipsisprose_slop_config_v1'),
                    storyTitle: story?.title,
                    worldPrimer: story?.world_primer,
                    proseLen: story?.prose?.['0-0']?.final?.length || 0,
                    castLen: story?.cast?.length || 0,
                    logsLen: Array.isArray(logs) ? logs.length : 0,
                    uiHasTitle: document.body.innerText.includes('The Salt Clock')
                };
            })()`, true);

            const ok = upgraded.activeId === 'golden_story_1'
                && upgraded.geminiKey === 'AIzaGoldenTestKey12345'
                && Boolean(upgraded.slopCfg)
                && upgraded.storyTitle === 'The Salt Clock'
                && upgraded.worldPrimer?.includes('Oakhaven')
                && upgraded.proseLen > 100
                && upgraded.castLen === 2
                && upgraded.uiHasTitle
                && session.exceptions.length === 0;

            if (ok) {
                results.passed.push('Upgrade migration preserves 100% IDB + localStorage user data');
                console.log('  [PASS] Upgrade migration preserves 100% IDB + localStorage user data');
            } else {
                results.failed.push({ name: 'Upgrade migration', detail: JSON.stringify(upgraded) });
                console.error('  [FAIL] Upgrade migration ->', upgraded);
            }

            let takeover = null;
            for (let i = 0; i < 40; i++) {
                takeover = await session.cdp.eval(`(async () => {
                    const reg = await navigator.serviceWorker.getRegistration();
                    const names = await caches.keys();
                    const precacheName = names.find((n) => n.startsWith('workbox-precache'));
                    return {
                        active: Boolean(reg && reg.active && reg.active.state === 'activated'),
                        cacheNames: names,
                        precachedCount: precacheName ? (await (await caches.open(precacheName)).keys()).length : 0,
                        storyTitle: (await window.storyStore.loadStory('golden_story_1'))?.title
                    };
                })()`, true);
                if (takeover.active && takeover.precachedCount >= 15 && !takeover.cacheNames.some((n) => n.startsWith('ellipsisprose-static-'))) break;
                await sleep(500);
            }
            const hadLegacyCache = legacyWorker.registered && legacyWorker.cacheNames.some((n) => n.startsWith('ellipsisprose-static-'));
            const takeoverName = 'Upgrade: new service worker replaces the old one, removes its cache and leaves user data alone';
            const takeoverOk = hadLegacyCache && takeover.active && takeover.precachedCount >= 15
                && !takeover.cacheNames.some((n) => n.startsWith('ellipsisprose-static-'))
                && takeover.storyTitle === 'The Salt Clock';
            if (takeoverOk) {
                results.passed.push(takeoverName);
                console.log(`  [PASS] ${takeoverName}`);
            } else {
                const detail = JSON.stringify({ legacyWorker, takeover });
                results.failed.push({ name: takeoverName, detail });
                console.error(`  [FAIL] ${takeoverName} -> ${detail}`);
            }
        } else {
            throw new Error(`Unknown mode: ${opts.mode}`);
        }
    } finally {
        if (session) await session.close();
        if (server) await server.close();
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
    }

    console.log(`\n=== GOLDEN SUITE SUMMARY [${opts.mode}] ===`);
    console.log(`Passed: ${results.passed.length} | Failed: ${results.failed.length}`);
    if (results.failed.length > 0) {
        console.error('Failures:', JSON.stringify(results.failed, null, 2));
        process.exit(1);
    }
}

const opts = parseArgs(process.argv.slice(2));
console.log(`Running EllipsisProse Golden Suite (mode=${opts.mode})...`);
runMode(opts).catch((err) => {
    console.error('[GOLDEN SUITE FATAL]:', err);
    process.exit(1);
});
