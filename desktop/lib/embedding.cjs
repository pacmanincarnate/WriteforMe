'use strict';

/**
 * Built-in embeddings for lore search (RAG): llama.cpp's `llama-server` in embedding mode, set up
 * by the app. Ported from Prospero's Companion (`providers/builtin_recall.py`).
 *
 * The runtime is a pinned llama.cpp build, checked against its SHA-256. The model is one of the
 * suggested files below (downloaded and checked the same way) or an embedding .gguf already on
 * this PC. The server runs on the processor only (`-ngl 0`) on a private loopback port, so it
 * never takes VRAM from KoboldCpp, ComfyUI or audio.cpp and needs no lease from the VRAM
 * coordinator. The page never talks to it directly: it asks through IPC and this module answers.
 *
 * No Electron imports, so it runs under `node --test`.
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { downloadFile } = require('./download.cjs');
const { extract, findFile } = require('./install.cjs');

const SERVICE_ID = 'embedding';
const RUNTIME_TAG = 'b11457';
const RELEASES = 'https://github.com/ggml-org/llama.cpp/releases/download';
/** `${process.platform}-${process.arch}` -> the CPU build of the pinned release. */
const RUNTIMES = Object.freeze({
    'win32-x64': { name: 'llama-b11457-bin-win-cpu-x64.zip', bytes: 19436652, sha256: 'ed20ed40e10c04d0853d8acf8700f0e6c1bb8212f0cc70c3a0da13dcbbc1b802' },
    'linux-x64': { name: 'llama-b11457-bin-ubuntu-x64.tar.gz', bytes: 17733249, sha256: '210eaa41a16e0d24fa44071cb62f95702ef903c84d86506d6482ac919bcee078' },
    'darwin-arm64': { name: 'llama-b11457-bin-macos-arm64.tar.gz', bytes: 12007659, sha256: 'e234070cbde0c8b0d30f79fa08ff8246abe22c72acb752619349b8d9c46f7839' },
    'darwin-x64': { name: 'llama-b11457-bin-macos-x64.tar.gz', bytes: 11525345, sha256: 'f807f15aa0d4d9947b9befd06b3ff4bd8ddd30775d7b4b4505c8d3c5f33f0014' }
});
/** A llama-server of the user's own, for a platform without a pinned build or to try another. */
const SERVER_ENV = 'ELLIPSISPROSE_LLAMA_SERVER';
/** Extra folders to search for embedding models, separated like PATH. */
const MODELS_ENV = 'ELLIPSISPROSE_EMBEDDING_MODELS';

/** The first entry is the default. */
const MODELS = Object.freeze([
    {
        id: 'embeddinggemma-2',
        name: 'EmbeddingGemma 2',
        file: 'embeddinggemma-2-Q8_0.gguf',
        url: 'https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/resolve/main/embeddinggemma-2-Q8_0.gguf',
        bytes: 309855456,
        sha256: '2188ac1deca4b77dffefd603c2776a9d76d9d74ec01841392982ebb840b09135',
        memoryMb: 350
    },
    {
        id: 'qwen3-embedding-0.6b',
        name: 'Qwen3 Embedding 0.6B',
        file: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
        url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf',
        bytes: 639150592,
        sha256: '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439',
        memoryMb: 950
    }
]);
const DEFAULT_MODEL_ID = MODELS[0].id;
const FILE_PREFIX = 'file:';

const CONTEXT = 2048;
/** The server reads at most CONTEXT tokens per text; longer texts are cut rather than refused. */
const TEXT_LIMIT = 6000;
const START_MS = 120000;
const REQUEST_MS = 60000;
const SCAN_LIMIT = 5000;
const SCAN_DEPTH = 4;

/**
 * Retrieval models trained with instructions search better with them: name contains, the prefix
 * for a search query, the prefix for a stored text.
 */
const PROMPTS = Object.freeze([
    ['embeddinggemma', 'task: search result | query: ', 'title: none | text: '],
    ['qwen3-embedding', 'Instruct: Given a scene from a novel, retrieve the world lore that relates to it\nQuery: ', ''],
    ['nomic-embed-text', 'search_query: ', 'search_document: '],
    ['mxbai-embed-large', 'Represent this sentence for searching relevant passages: ', ''],
    ['snowflake-arctic-embed', 'Represent this sentence for searching relevant passages: ', '']
]);

function promptFor(fileName, kind) {
    const lower = String(fileName).toLowerCase();
    const hit = PROMPTS.find(([marker]) => lower.includes(marker));
    if (!hit) return '';
    return kind === 'query' ? hit[1] : hit[2];
}

/** Half the cores, at most four: indexing is background work and the PC stays responsive. */
function threads(cpuCount = os.cpus().length) {
    return Math.max(1, Math.min(4, Math.floor((cpuCount || 2) / 2)));
}

function serverArgs(modelPath, port, cpuCount) {
    const args = [
        '-m', modelPath, '--embedding', '--host', '127.0.0.1', '--port', String(port), '-ngl', '0',
        '-c', String(CONTEXT), '-b', String(CONTEXT), '-ub', String(CONTEXT), '-t', String(threads(cpuCount)), '--no-webui'
    ];
    // Qwen3 embeddings are read from the last token; other models carry their pooling in the file.
    if (path.basename(modelPath).toLowerCase().includes('qwen3')) args.push('--pooling', 'last');
    return args;
}

function isEmbeddingFile(name) {
    const lower = String(name).toLowerCase();
    return lower.endsWith('.gguf') && lower.includes('embed') && !lower.includes('mmproj');
}

/** Embedding .gguf files under each root, a few levels deep. */
function findModelFiles(roots) {
    const found = [];
    let seen = 0;
    for (const { source, dir } of roots) {
        let level = [dir];
        for (let depth = 0; depth <= SCAN_DEPTH && level.length; depth++) {
            const next = [];
            for (const folder of level) {
                let entries = [];
                try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch (_) { continue; }
                seen += entries.length;
                if (seen > SCAN_LIMIT) return found;
                for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                    const full = path.join(folder, entry.name);
                    if (entry.isDirectory()) next.push(full);
                    else if (entry.isFile() && isEmbeddingFile(entry.name)) {
                        let bytes = 0;
                        try { bytes = fs.statSync(full).size; } catch (_) { continue; }
                        found.push({ path: full, name: entry.name, source, bytes });
                    }
                }
            }
            level = next;
        }
    }
    return found;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

function postJson(url, body, timeoutMs = REQUEST_MS) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const req = http.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) },
            timeout: timeoutMs
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch (_) { /* reported by the caller */ }
                resolve({ status: res.statusCode || 0, text, json });
            });
        });
        req.on('timeout', () => req.destroy(new Error('The embedding model took too long to answer.')));
        req.on('error', reject);
        req.end(payload);
    });
}

/** The system's tar. Windows 10 and later ship one that also reads .zip. */
function untar(archive, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    return new Promise((resolve, reject) => {
        const proc = spawn('tar', ['-xf', archive, '-C', destDir], { windowsHide: true });
        proc.on('error', reject);
        proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`))));
    });
}

/**
 * The desktop app unpacks .zip with its bundled 7-Zip. Started from the launcher (server.js) there
 * is no 7-Zip package, so the system's tar does it.
 */
async function unpackArchive(archive, destDir) {
    if (archive.endsWith('.zip')) {
        try {
            require.resolve('7zip-bin');
        } catch (_) {
            return untar(archive, destDir);
        }
        return extract(archive, destDir);
    }
    return untar(archive, destDir);
}

/** Why the server stopped: llama.cpp's own reason when it gave one, else the end of its log. */
function failureReason(log) {
    const reason = log.find((line) => line.includes('error loading model:'));
    if (reason) return `llama.cpp could not load the model: ${reason.split('error loading model:')[1].trim().slice(0, 300)}`;
    return log.slice(-4).join(' ').slice(-400);
}

class LocalEmbedding {
    /**
     * @param {object} o
     * @param {{backendsDir:string, textModelsDir:string}} o.settings
     * @param {import('./supervisor.cjs').Supervisor} o.supervisor
     * @param {object} [o.env]            process.env by default
     * @param {string} [o.platformKey]    `${platform}-${arch}` by default
     * @param {string} [o.homeDir]
     * @param {Function} [o.download]     downloadFile by default
     * @param {Function} [o.unpack]       (archive, destDir) => Promise
     * @param {(serverPath:string)=>{command:string,args:string[]}} [o.launcher]  test seam
     */
    constructor({ settings, supervisor, env = process.env, platformKey = `${process.platform}-${process.arch}`, homeDir = os.homedir(), download = downloadFile, unpack, launcher }) {
        this.settings = settings;
        this.supervisor = supervisor;
        this.env = env;
        this.platformKey = platformKey;
        this.homeDir = homeDir;
        this.download = download;
        this.unpack = unpack || unpackArchive;
        this.launcher = launcher || ((serverPath) => ({ command: serverPath, args: [] }));
        this.running = null;   // { modelId, port }
        this.progress = null;  // { modelId, phase, received, total }
        this.failure = null;   // { modelId, message }
        this.queue = Promise.resolve();
        this.abort = null;
    }

    get runtimeDir() {
        return path.join(this.settings.backendsDir, 'llamacpp', RUNTIME_TAG);
    }

    get modelsDir() {
        return path.join(this.settings.backendsDir, 'embedding-models');
    }

    serverPath() {
        const own = this.env[SERVER_ENV];
        if (own) return own;
        return findFile(this.runtimeDir, ['llama-server.exe', 'llama-server'], 3);
    }

    available() {
        return Boolean(this.env[SERVER_ENV] || RUNTIMES[this.platformKey]);
    }

    foundFiles() {
        const extra = String(this.env[MODELS_ENV] || '').split(path.delimiter).filter(Boolean);
        const suggested = new Set(MODELS.map((m) => path.join(this.modelsDir, m.file)));
        return findModelFiles([
            { source: 'EllipsisProse', dir: this.modelsDir },
            { source: 'EllipsisProse', dir: this.settings.textModelsDir },
            { source: 'LM Studio', dir: path.join(this.homeDir, '.lmstudio', 'models') },
            { source: 'LM Studio', dir: path.join(this.homeDir, '.cache', 'lm-studio', 'models') },
            ...extra.map((dir) => ({ source: 'Your folder', dir }))
        ]).filter((f) => !suggested.has(f.path));
    }

    /** Where a model id points. A file id must be one this PC's search found, never an arbitrary path. */
    resolve(modelId) {
        const id = modelId || DEFAULT_MODEL_ID;
        const suggested = MODELS.find((m) => m.id === id);
        if (suggested) return { id, file: suggested.file, path: path.join(this.modelsDir, suggested.file), suggested };
        if (id.startsWith(FILE_PREFIX)) {
            const hit = this.foundFiles().find((f) => f.path === id.slice(FILE_PREFIX.length));
            if (hit) return { id, file: hit.name, path: hit.path, suggested: null };
        }
        throw new Error('That embedding model is not on this PC any more. Choose another.');
    }

    isReady(modelId) {
        return Boolean(this.running && this.running.modelId === modelId && this.supervisor.status(SERVICE_ID).status === 'running');
    }

    status(modelId) {
        const id = modelId || DEFAULT_MODEL_ID;
        let state = 'off';
        let message = '';
        if (this.isReady(id)) state = 'ready';
        else if (this.progress && this.progress.modelId === id) state = this.progress.phase;
        else if (this.failure && this.failure.modelId === id) { state = 'failed'; message = this.failure.message; }
        return {
            available: this.available(),
            state,
            message,
            received: state === 'downloading' ? this.progress.received : 0,
            total: state === 'downloading' ? this.progress.total : 0,
            models: [
                ...MODELS.map((m) => ({
                    id: m.id,
                    name: m.name,
                    bytes: m.bytes,
                    memoryMb: m.memoryMb,
                    installed: fs.existsSync(path.join(this.modelsDir, m.file)),
                    source: ''
                })),
                ...this.foundFiles().map((f) => ({
                    id: FILE_PREFIX + f.path,
                    name: f.name,
                    bytes: f.bytes,
                    memoryMb: null,
                    installed: true,
                    source: f.source
                }))
            ]
        };
    }

    /**
     * Makes `modelId` answer requests: downloads llama.cpp and the model when missing, then starts
     * the server. One setup runs at a time; asking for another model stops the download in flight.
     */
    ensure(modelId) {
        const id = modelId || DEFAULT_MODEL_ID;
        if (this.isReady(id)) return Promise.resolve(this.running);
        if (this.abort && this.progress && this.progress.modelId !== id) this.abort.abort('cancelled');
        const run = this.queue.then(() => this.setUp(id));
        this.queue = run.catch(() => {});
        return run;
    }

    async setUp(id) {
        if (this.isReady(id)) return this.running;
        const ac = new AbortController();
        this.abort = ac;
        this.failure = null;
        try {
            if (!this.available()) throw new Error(`There is no built-in llama.cpp for this computer. Set ${SERVER_ENV} to a llama-server you installed.`);
            const model = this.resolve(id);
            const runtime = this.serverPath() ? null : RUNTIMES[this.platformKey];
            const needModel = model.suggested && !fs.existsSync(model.path) ? model.suggested : null;
            const total = (runtime ? runtime.bytes : 0) + (needModel ? needModel.bytes : 0);
            let done = 0;
            const report = (received) => { this.progress = { modelId: id, phase: 'downloading', received: done + received, total }; };

            if (runtime) {
                report(0);
                const archive = path.join(this.settings.backendsDir, '_downloads', runtime.name);
                await this.download({ url: `${RELEASES}/${RUNTIME_TAG}/${runtime.name}`, dest: archive, sha256: runtime.sha256, signal: ac.signal, onProgress: (p) => report(p.received) });
                const staging = `${this.runtimeDir}.new`;
                fs.rmSync(staging, { recursive: true, force: true });
                await this.unpack(archive, staging);
                fs.rmSync(this.runtimeDir, { recursive: true, force: true });
                fs.renameSync(staging, this.runtimeDir);
                fs.rmSync(archive, { force: true });
                if (!this.serverPath()) throw new Error('The llama.cpp download did not contain llama-server.');
                done += runtime.bytes;
            }
            if (needModel) {
                report(0);
                await this.download({ url: needModel.url, dest: model.path, sha256: needModel.sha256, signal: ac.signal, onProgress: (p) => report(p.received) });
            }

            this.progress = { modelId: id, phase: 'starting', received: 0, total: 0 };
            await this.start(id, model.path);
            return this.running;
        } catch (err) {
            if (err && err.code !== 'CANCELLED') this.failure = { modelId: id, message: err.message };
            throw err;
        } finally {
            this.progress = null;
            if (this.abort === ac) this.abort = null;
        }
    }

    async start(id, modelPath) {
        await this.stop();
        const serverPath = this.serverPath();
        const port = await freePort();
        const { command, args } = this.launcher(serverPath);
        const dir = path.dirname(serverPath);
        if (process.platform !== 'win32') { try { fs.chmodSync(serverPath, 0o755); } catch (_) { /* reported on spawn */ } }
        const svc = await this.supervisor.start(SERVICE_ID, {
            command,
            args: [...args, ...serverArgs(modelPath, port)],
            cwd: dir,
            // The Linux and macOS builds keep their libraries beside the program.
            env: { LD_LIBRARY_PATH: [dir, this.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter) },
            healthUrl: `http://127.0.0.1:${port}/health`,
            readyTimeoutMs: START_MS
        });
        if (svc.status !== 'running') {
            const reason = failureReason(svc.log || []);
            this.supervisor.stop(SERVICE_ID);
            throw new Error(`The embedding model did not start. ${reason}`.trim());
        }
        this.running = { modelId: id, port };
    }

    /** Stops the server and waits for it to go, so the next start is not handed the old process. */
    async stop() {
        this.running = null;
        const svc = this.supervisor.services.get(SERVICE_ID);
        this.supervisor.stop(SERVICE_ID);
        const child = svc && svc.child;
        for (let i = 0; child && child.exitCode === null && child.signalCode === null && i < 50; i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        this.supervisor.services.delete(SERVICE_ID);
    }

    /** One vector per text, in order. `kind` is 'query' for a search and 'document' for stored text. */
    async embed(modelId, texts, kind = 'document') {
        const id = modelId || DEFAULT_MODEL_ID;
        if (!Array.isArray(texts) || !texts.length || !texts.every((t) => typeof t === 'string')) {
            throw new Error('Nothing to embed.');
        }
        const { port } = await this.ensure(id);
        const prefix = promptFor(this.resolve(id).file, kind);
        const input = texts.map((t) => (prefix + t).slice(0, TEXT_LIMIT));
        const res = await postJson(`http://127.0.0.1:${port}/v1/embeddings`, { model: id, input });
        const data = res.json && res.json.data;
        if (res.status !== 200 || !Array.isArray(data) || data.length !== input.length) {
            throw new Error(`The embedding model answered ${res.status}: ${res.text.slice(0, 200)}`);
        }
        const vectors = [...data].sort((a, b) => (a.index || 0) - (b.index || 0)).map((item) => item.embedding);
        if (!vectors.every((v) => Array.isArray(v) && v.length)) throw new Error('The embedding model returned an empty vector.');
        return vectors;
    }
}

module.exports = {
    LocalEmbedding, MODELS, RUNTIMES, RUNTIME_TAG, DEFAULT_MODEL_ID, FILE_PREFIX, SERVER_ENV, MODELS_ENV, SERVICE_ID, TEXT_LIMIT,
    serverArgs, threads, isEmbeddingFile, findModelFiles, promptFor
};
