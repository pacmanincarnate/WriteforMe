/*
 * Local Codex CLI text-generation and embedding bridge for EllipsisProse.
 * Requires Node 18+ and an installed, logged-in Codex CLI on PATH.
 * Run: node codex-bridge.js
 * Options: --port 5010 --concurrency 2 --timeout 600 --bind 127.0.0.1
 * Environment: CODEX_BRIDGE_PORT, CONCURRENCY, TIMEOUT, BIND (same prefix).
 * CODEX_HOME overrides the default ~/.codex configuration directory.
 * Optional @xenova/transformers enables local embeddings; run npm install once.
 * Models are cached in ~/.ellipsisprose/models, outside node_modules.
 * Override the embedding model with --embedding-model / CODEX_BRIDGE_EMBEDDING_MODEL.
 * Exposes /health, /v1/models, /v1/embeddings, and non-streaming /v1/chat/completions.
 * Each completion runs in an empty temporary directory, removed afterwards.
 */
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const settings = {
    port: process.env.CODEX_BRIDGE_PORT || 5010,
    concurrency: process.env.CODEX_BRIDGE_CONCURRENCY || 2,
    timeout: process.env.CODEX_BRIDGE_TIMEOUT || 600,
    bind: process.env.CODEX_BRIDGE_BIND || '127.0.0.1',
    'embedding-model': process.env.CODEX_BRIDGE_EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5'
};
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    if (!process.argv[i].startsWith('--') || !Object.hasOwn(settings, key) || !process.argv[i + 1]) {
        throw new Error('Usage: node codex-bridge.js [--port 5010] [--concurrency 2] [--timeout 600] [--bind 127.0.0.1] [--embedding-model Xenova/bge-small-en-v1.5]');
    }
    settings[key] = process.argv[i + 1];
}
for (const key of ['port', 'concurrency', 'timeout']) {
    settings[key] = Number(settings[key]);
    const max = key === 'port' ? 65535 : key === 'timeout' ? 2147483 : Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 1 || settings[key] > max) {
        throw new Error(`Invalid ${key}: expected a positive integer no greater than ${max}`);
    }
}

const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const preamble = 'You are being used as a pure text-generation model by a writing application. Do not run commands, do not read or write files, do not browse, do not ask questions, and do not add commentary before or after the requested output. Produce only the output the instructions ask for.';
const effortMap = { none: 'low', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' };
const waiting = [];
const active = new Set();
let stopping = false;

const EMBEDDING_MODEL = settings['embedding-model'];
let embeddingModelPromise;
let embeddingModelLoaded = false;
let embeddingQueue = Promise.resolve();

function embeddingPackage() {
    try {
        return require('@xenova/transformers');
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            throw Object.assign(new Error('Local embeddings need the optional package: run "npm install" in the project folder (installs @xenova/transformers).'), { status: 501 });
        }
        throw error;
    }
}

function embeddingHealth() {
    let available = false;
    try { embeddingPackage(); available = true; } catch (_) { /* No download or startup failure. */ }
    return { available, model: EMBEDDING_MODEL, loaded: embeddingModelLoaded };
}

function loadEmbeddingModel() {
    if (!embeddingModelPromise) {
        embeddingModelPromise = Promise.resolve().then(async () => {
            const { pipeline, env } = embeddingPackage();
            env.allowLocalModels = false;
            env.cacheDir = path.join(os.homedir(), '.ellipsisprose', 'models');
            fs.mkdirSync(env.cacheDir, { recursive: true });
            const started = Date.now();
            console.log(`Local embeddings loading model=${JSON.stringify(EMBEDDING_MODEL)}`);
            const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { quantized: true });
            embeddingModelLoaded = true;
            console.log(`Local embeddings ready model=${JSON.stringify(EMBEDDING_MODEL)} duration=${Date.now() - started}ms`);
            return extractor;
        }).catch(error => {
            embeddingModelPromise = undefined; // Permit a retry after an install or failed download.
            throw error;
        });
    }
    return embeddingModelPromise;
}

async function embedInputs(inputs) {
    const extractor = await loadEmbeddingModel(); // Parallel first requests share one model load.
    const result = embeddingQueue.then(async () => {
        const data = [];
        for (const [index, text] of inputs.entries()) {
            const output = await extractor(text, { pooling: 'cls', normalize: true });
            data.push({ object: 'embedding', index, embedding: Array.from(output.data) });
        }
        return { object: 'list', data, model: EMBEDDING_MODEL, usage: { prompt_tokens: 0, total_tokens: 0 } };
    });
    // Serialize all ORT calls across requests, and keep the queue usable after failures.
    embeddingQueue = result.catch(() => {});
    return result;
}

function defaultModel() {
    try {
        // Only root TOML keys belong to the active configuration, not later tables.
        const root = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8').split(/^\s*\[/m)[0];
        return root.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1] || 'gpt-6-astra';
    } catch (_) {
        return 'gpt-6-astra';
    }
}

function models() {
    const preferred = defaultModel();
    let entries;
    try {
        const cache = JSON.parse(fs.readFileSync(path.join(codexHome, 'models_cache.json'), 'utf8'));
        if (!Array.isArray(cache.models)) throw new Error('Invalid model cache');
        entries = cache.models.filter(m => m.visibility === 'list' && typeof m.slug === 'string')
            .map(m => ({ id: m.slug, object: 'model', display_name: m.display_name || m.slug }));
    } catch (_) {
        entries = [preferred, 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']
            .map(id => ({ id, object: 'model', display_name: id }));
    }
    const first = entries.find(m => m.id === preferred) || { id: preferred, object: 'model', display_name: preferred };
    return { object: 'list', data: [...new Map([first, ...entries].map(m => [m.id, m])).values()] };
}

function killTree(child) {
    if (!child?.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
        killer.on('exit', code => { if (code) child.kill('SIGKILL'); });
    } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    }
}

function spawnCodex(args, cwd, onChild) {
    const preferred = process.platform === 'win32' ? 'codex.cmd' : 'codex';
    const fallback = process.platform === 'win32' ? 'codex' : 'codex.cmd';
    return new Promise((resolve, reject) => {
        const launch = (command, argv, canFallback) => {
            let child;
            const failed = error => {
                // Modern Node cannot spawn a Windows batch shim without a shell.
                // Launch the standard npm Codex entrypoint with Node to keep argv literal.
                if (process.platform === 'win32' && error.code === 'EINVAL' && command === 'codex.cmd') {
                    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
                        const entry = path.join(dir.replace(/^"|"$/g, ''), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
                        if (fs.existsSync(entry)) return launch(process.execPath, [entry, ...args], false);
                    }
                    return launch(fallback, args, false);
                }
                if (error.code === 'ENOENT' && canFallback) return launch(fallback, args, false);
                reject(new Error(`Could not start Codex CLI: ${error.message}. Ensure Codex is installed and on PATH.`));
            };
            try {
                child = spawn(command, argv, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
            } catch (error) {
                failed(error);
                return;
            }
            child.once('error', failed);
            child.once('spawn', () => {
                child.removeListener('error', failed);
                child.on('error', reject);
                resolve(child);
            });
            onChild(child);
        };
        launch(preferred, args, true);
    });
}

async function version() {
    let child;
    const timer = setTimeout(() => killTree(child), 5000);
    try {
        child = await spawnCodex(['--version'], os.tmpdir(), c => { child = c; });
        let output = '';
        child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
        child.stderr.resume();
        child.stdin.on('error', () => {});
        child.stdin.end();
        return await new Promise(resolve => child.once('close', code => resolve(code === 0 ? output.trim() : null)));
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
const codexVersion = version();

function send(res, status, body) {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

async function complete(job) {
    let dir;
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bridge-'));
        const outputFile = path.join(dir, 'last-message.txt');
        const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', job.model, '--output-last-message', outputFile];
        if (job.effort) args.push('-c', `model_reasoning_effort="${job.effort}"`);
        args.push('-');
        const child = await spawnCodex(args, dir, c => { job.child = c; });
        console.log(`codex exec started pid=${child.pid} model=${JSON.stringify(job.model)} effort=${job.effort || 'config'} (queued ${Date.now() - job.started}ms)`);
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
        const closed = new Promise(resolve => child.once('close', resolve));
        child.stdin.on('error', () => {}); // Early CLI rejection can close stdin before the prompt is consumed.
        child.stdin.end(job.prompt);
        if (job.cancelled) killTree(child);
        const code = await closed;
        if (job.cancelled) return;
        const stderrTail = stderr.trim().split(/\r?\n/).slice(-20).join('\n');
        if (code !== 0) {
            send(job.res, 502, { error: { message: `codex exec exited with code ${code}: ${stderrTail || 'No stderr output'}` } });
            return;
        }
        let content;
        try { content = fs.readFileSync(outputFile, 'utf8').trim(); } catch (_) { content = stdout.trim(); }
        if (!content) {
            send(job.res, 502, { error: { message: 'codex returned no content', stderr_tail: stderrTail } });
            return;
        }
        const tokenMatch = [...stderr.matchAll(/^tokens used\s*\r?\n\s*([\d,]+)/gm)].pop();
        const response = {
            id: `chatcmpl-${crypto.randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000),
            model: job.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]
        };
        if (tokenMatch) response.usage = { total_tokens: Number(tokenMatch[1].replace(/,/g, '')) };
        send(job.res, 200, response);
    } catch (error) {
        if (!job.cancelled) send(job.res, 502, { error: { message: error.message } });
    } finally {
        clearTimeout(job.timer);
        if (dir && path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('codex-bridge-')) {
            try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
            catch (error) { console.error(`Could not remove request directory ${dir}: ${error.message}`); }
        }
    }
}

function drain() {
    while (!stopping && active.size < settings.concurrency && waiting.length) {
        const job = waiting.shift();
        active.add(job);
        complete(job).finally(() => { active.delete(job); drain(); });
    }
}

const server = http.createServer(async (req, res) => {
    const started = Date.now();
    let model = defaultModel();
    let effort;
    let embeddingInputs = 0;
    let embeddingDims = 0;
    const route = req.url.split('?')[0];
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.once('finish', () => console.log(route === '/v1/embeddings'
        ? `${req.method} ${JSON.stringify(route)} inputs=${embeddingInputs} dims=${embeddingDims} duration=${Date.now() - started}ms status=${res.statusCode}`
        : `${req.method} ${JSON.stringify(route)} model=${JSON.stringify(model)} effort=${effort || 'config'} duration=${Date.now() - started}ms status=${res.statusCode}`));
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && route === '/v1/models') { send(res, 200, models()); return; }
    if (req.method === 'GET' && route === '/health') {
        send(res, 200, { ok: true, codex: await codexVersion, default_model: model, queue: { active: active.size, waiting: waiting.length }, embeddings: embeddingHealth() });
        return;
    }
    if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/embeddings'].includes(route)) { send(res, 404, { error: { message: 'Not found' } }); return; }
    try {
        let raw = '';
        req.setEncoding('utf8');
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        if (route === '/v1/embeddings') {
            const input = body && !Array.isArray(body) ? body.input : undefined;
            if (typeof input !== 'string' && !(Array.isArray(input) && input.every(text => typeof text === 'string'))) {
                send(res, 400, { error: { message: 'input must be a string or an array of strings' } }); return;
            }
            const inputs = typeof input === 'string' ? [input] : input;
            embeddingInputs = inputs.length;
            if (stopping) { send(res, 503, { error: { message: 'Bridge is stopping' } }); return; }
            const result = await embedInputs(inputs);
            embeddingDims = result.data[0]?.embedding.length || 0;
            send(res, 200, result);
            return;
        }
        if (!body || !Array.isArray(body.messages) || body.messages.some(m => !m || typeof m.role !== 'string' || typeof m.content !== 'string')) {
            send(res, 400, { error: { message: 'messages must be an array of { role, content } text messages' } }); return;
        }
        if (body.model !== undefined && typeof body.model !== 'string') {
            send(res, 400, { error: { message: 'model must be a string' } }); return;
        }
        model = body.model?.trim() || model;
        if (body.reasoning_effort !== undefined) {
            if (!Object.hasOwn(effortMap, body.reasoning_effort)) {
                send(res, 400, { error: { message: 'Unsupported reasoning_effort' } }); return;
            }
            effort = effortMap[body.reasoning_effort];
        }
        const textFor = role => body.messages.filter(m => m.role === role).map(m => m.content).join('\n\n');
        let prompt = `${preamble}\n\n<system_instructions>\n${textFor('system')}\n</system_instructions>\n\n<user_request>\n${textFor('user')}\n</user_request>`;
        if (body.response_format?.type === 'json_object') prompt += '\n\nRespond with a single valid JSON object and nothing else.';
        if (stopping) { send(res, 503, { error: { message: 'Bridge is stopping' } }); return; }
        const job = { res, model, effort, prompt, child: null, cancelled: false, started };
        console.log(`POST "/v1/chat/completions" model=${JSON.stringify(model)} effort=${effort || 'config'} queued (active ${active.size}, waiting ${waiting.length}, prompt ${prompt.length} chars)`);
        // The deadline includes FIFO queue time; timed-out jobs never start later.
        job.timer = setTimeout(() => {
            job.cancelled = true;
            const index = waiting.indexOf(job);
            if (index !== -1) waiting.splice(index, 1);
            killTree(job.child);
            send(res, 504, { error: { message: `codex exec timed out after ${settings.timeout} s` } });
        }, settings.timeout * 1000);
        waiting.push(job);
        drain();
    } catch (error) {
        send(res, error.status || (error instanceof SyntaxError ? 400 : 500), { error: { message: error.message } });
    }
});
server.timeout = 0;
server.listen(settings.port, settings.bind, () => console.log(`Codex bridge listening on http://${settings.bind}:${settings.port} (concurrency ${settings.concurrency}, timeout ${settings.timeout}s)`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });

function shutdown() {
    stopping = true;
    for (const job of [...waiting.splice(0), ...active]) {
        job.cancelled = true;
        clearTimeout(job.timer);
        killTree(job.child);
        send(job.res, 503, { error: { message: 'Bridge is stopping' } });
    }
    server.close();
    server.closeIdleConnections?.();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
