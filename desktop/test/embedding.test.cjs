'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Supervisor } = require('../lib/supervisor.cjs');
const {
    LocalEmbedding, MODELS, RUNTIMES, DEFAULT_MODEL_ID, FILE_PREFIX, SERVER_ENV, MODELS_ENV, TEXT_LIMIT,
    serverArgs, threads, isEmbeddingFile, promptFor
} = require('../lib/embedding.cjs');

// Stands in for llama-server: answers /health and echoes each input's length and the model file.
const FAKE_SERVER = `
const a = process.argv.slice(2);
const port = Number(a[a.indexOf('--port') + 1]);
const model = a[a.indexOf('-m') + 1];
if (/broken/.test(model)) { console.error('error loading model: bad magic'); process.exit(1); }
require('http').createServer((req, res) => {
    if (req.url === '/health') return res.end('{"status":"ok"}');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        const input = JSON.parse(body).input;
        // Out of order on purpose: the caller must sort by index.
        const data = input.map((text, index) => ({ index, embedding: [text.length, require('path').basename(model).length], text })).reverse();
        res.end(JSON.stringify({ data }));
    });
}).listen(port, '127.0.0.1');
`;

function setup({ env = {}, platformKey = 'win32-x64' } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-embed-'));
    const fake = path.join(root, 'fake-server.cjs');
    fs.writeFileSync(fake, FAKE_SERVER);
    const settings = { backendsDir: path.join(root, 'backends'), textModelsDir: path.join(root, 'backends', 'text-models') };
    const supervisor = new Supervisor();
    const downloads = [];
    const embedding = new LocalEmbedding({
        settings,
        supervisor,
        env,
        platformKey,
        homeDir: path.join(root, 'home'),
        download: async ({ url, dest, sha256, onProgress }) => {
            downloads.push({ url, sha256 });
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, 'x');
            onProgress({ received: 1, total: 1 });
        },
        unpack: async (_archive, dest) => {
            fs.mkdirSync(path.join(dest, 'build'), { recursive: true });
            fs.writeFileSync(path.join(dest, 'build', 'llama-server.exe'), '');
        },
        launcher: () => ({ command: process.execPath, args: [fake] })
    });
    return { root, settings, supervisor, embedding, downloads };
}

test('the server command keeps the model on the processor', () => {
    const args = serverArgs('/m/embeddinggemma-2-Q8_0.gguf', 4242, 16);
    assert.deepEqual(args.slice(0, 9), ['-m', '/m/embeddinggemma-2-Q8_0.gguf', '--embedding', '--host', '127.0.0.1', '--port', '4242', '-ngl', '0']);
    assert.ok(!args.includes('--pooling'));
    assert.deepEqual(serverArgs('/m/Qwen3-Embedding-0.6B-Q8_0.gguf', 1, 16).slice(-2), ['--pooling', 'last']);
    assert.equal(threads(16), 4);
    assert.equal(threads(2), 1);
    assert.equal(threads(0), 1);
});

test('only embedding model files are offered', () => {
    assert.equal(isEmbeddingFile('nomic-embed-text-v1.5.Q8_0.gguf'), true);
    assert.equal(isEmbeddingFile('mmproj-embed.gguf'), false);
    assert.equal(isEmbeddingFile('llama-3-8b.gguf'), false);
    assert.equal(isEmbeddingFile('embed.bin'), false);
});

test('search queries and stored texts get the instructions their model was trained with', () => {
    assert.equal(promptFor('embeddinggemma-2-Q8_0.gguf', 'query'), 'task: search result | query: ');
    assert.equal(promptFor('embeddinggemma-2-Q8_0.gguf', 'document'), 'title: none | text: ');
    assert.equal(promptFor('bge-small-embed.gguf', 'query'), '');
});

test('first use downloads llama.cpp and the model against pinned checksums, then answers', async () => {
    const { embedding, supervisor, downloads, settings } = setup();
    try {
        const before = embedding.status();
        assert.equal(before.available, true);
        assert.equal(before.state, 'off');
        assert.deepEqual(before.models.map((m) => [m.id, m.installed]), MODELS.map((m) => [m.id, false]));

        const vectors = await embedding.embed(undefined, ['abc', 'x'.repeat(TEXT_LIMIT * 2)], 'query');
        assert.deepEqual(downloads.map((d) => d.sha256), [RUNTIMES['win32-x64'].sha256, MODELS[0].sha256]);
        assert.ok(downloads[0].url.endsWith(RUNTIMES['win32-x64'].name));
        assert.equal(vectors.length, 2);
        assert.equal(vectors[0][0], 'task: search result | query: abc'.length, 'the query instruction is added, and order is restored');
        assert.equal(vectors[1][0], TEXT_LIMIT, 'long texts are cut');
        assert.ok(fs.existsSync(path.join(settings.backendsDir, 'embedding-models', MODELS[0].file)));

        const after = embedding.status(DEFAULT_MODEL_ID);
        assert.equal(after.state, 'ready');
        assert.equal(after.models[0].installed, true);

        await embedding.embed(DEFAULT_MODEL_ID, ['again']);
        assert.equal(downloads.length, 2, 'nothing is downloaded twice');
    } finally {
        supervisor.stopAll();
    }
});

test('a model file found on this PC can be chosen, and switching restarts the server with it', async () => {
    const { root, embedding, supervisor, downloads } = setup({ env: { [SERVER_ENV]: path.join(os.tmpdir(), 'llama-server') } });
    try {
        const lmStudio = path.join(root, 'home', '.lmstudio', 'models', 'nomic');
        fs.mkdirSync(lmStudio, { recursive: true });
        const file = path.join(lmStudio, 'nomic-embed-text-v1.5.Q8_0.gguf');
        fs.writeFileSync(file, 'gguf');
        fs.writeFileSync(path.join(lmStudio, 'chat-model.gguf'), 'gguf');

        const listed = embedding.status().models.filter((m) => m.source);
        assert.deepEqual(listed.map((m) => [m.id, m.source]), [[FILE_PREFIX + file, 'LM Studio']]);

        const first = await embedding.embed(FILE_PREFIX + file, ['abc']);
        assert.equal(first[0][0], 'search_document: abc'.length);
        assert.equal(first[0][1], path.basename(file).length);
        assert.equal(downloads.length, 0, 'the user\'s own llama-server and file need no download');

        const second = await embedding.embed(MODELS[1].id, ['abc']);
        assert.equal(second[0][1], MODELS[1].file.length, 'the server now runs the other model');
        assert.equal(embedding.status(FILE_PREFIX + file).state, 'off');
        assert.equal(embedding.status(MODELS[1].id).state, 'ready');
    } finally {
        supervisor.stopAll();
    }
});

test('a path the search did not find is refused', async () => {
    const { root, embedding } = setup();
    const stray = path.join(root, 'secret-embed.gguf');
    fs.writeFileSync(stray, 'gguf');
    await assert.rejects(embedding.embed(FILE_PREFIX + stray, ['abc']), /not on this PC/);
    assert.equal(embedding.status(FILE_PREFIX + stray).state, 'failed');
});

test('extra model folders come from the environment', () => {
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-extra-'));
    fs.writeFileSync(path.join(extra, 'my-embed.gguf'), 'gguf');
    const { embedding } = setup({ env: { [MODELS_ENV]: extra } });
    assert.deepEqual(embedding.status().models.filter((m) => m.source).map((m) => m.source), ['Your folder']);
});

test('a model that fails to load is reported with llama.cpp\'s reason', async () => {
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-extra-'));
    const file = path.join(extra, 'broken-embed.gguf');
    fs.writeFileSync(file, 'gguf');
    const { embedding, supervisor } = setup({ env: { [SERVER_ENV]: 'llama-server', [MODELS_ENV]: extra } });
    try {
        await assert.rejects(embedding.ensure(FILE_PREFIX + file), /could not load the model: bad magic/);
        const status = embedding.status(FILE_PREFIX + file);
        assert.equal(status.state, 'failed');
        assert.match(status.message, /bad magic/);
    } finally {
        supervisor.stopAll();
    }
});

test('a computer with no pinned build says so', async () => {
    const { embedding } = setup({ platformKey: 'sunos-sparc' });
    assert.equal(embedding.status().available, false);
    await assert.rejects(embedding.ensure(), new RegExp(SERVER_ENV));
});

test('the launcher\'s server runs the same model and answers in the bridge\'s shape', async () => {
    const { createEmbeddingLauncher } = require('../../embedding-launcher.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-embed-srv-'));
    const fake = path.join(root, 'fake-server.cjs');
    fs.writeFileSync(fake, FAKE_SERVER);
    const launcher = createEmbeddingLauncher({
        dataDir: root,
        platformKey: 'win32-x64',
        homeDir: path.join(root, 'home'),
        download: async ({ dest }) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, 'x'); },
        unpack: async (_archive, dest) => { fs.mkdirSync(dest, { recursive: true }); fs.writeFileSync(path.join(dest, 'llama-server.exe'), ''); },
        launcher: () => ({ command: process.execPath, args: [fake] })
    });
    try {
        const before = await launcher.call('status', {});
        assert.equal(before.ok, true);
        assert.equal(before.value.available, true);

        const ensured = await launcher.call('ensure', { model: DEFAULT_MODEL_ID });
        assert.equal(ensured.value.state, 'ready');
        assert.ok(fs.existsSync(path.join(root, 'embeddings', 'embedding-models', MODELS[0].file)), 'files live under the data folder');

        const embedded = await launcher.call('embed', { model: DEFAULT_MODEL_ID, texts: ['abc'], kind: 'query' });
        assert.equal(embedded.value[0][0], 'task: search result | query: abc'.length);

        const refused = await launcher.call('embed', { model: 'file:/etc/passwd', texts: ['abc'] });
        assert.deepEqual([refused.ok, /not on this PC/.test(refused.error)], [false, true]);
    } finally {
        launcher.dispose();
    }
});
