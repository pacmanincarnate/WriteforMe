'use strict';

/**
 * Lets server.js run the built-in embedding model for the page it serves, so lore search sets
 * itself up when the app is started from "Launch EllipsisProse.bat" too. It is the desktop app's
 * own module (desktop/lib/embedding.cjs) with a folder under the data directory; the desktop app
 * does not use this file, it has its own bridge.
 *
 * Every call answers in the bridge's shape, { ok, value } or { ok: false, error }, so the page
 * treats both paths alike.
 */

const path = require('path');
const { LocalEmbedding } = require('./desktop/lib/embedding.cjs');
const { Supervisor } = require('./desktop/lib/supervisor.cjs');

const ACTIONS = Object.freeze(['status', 'ensure', 'embed']);

function createEmbeddingLauncher({ dataDir, supervisor = new Supervisor(), ...options }) {
    const root = path.join(dataDir, 'embeddings');
    const embedding = new LocalEmbedding({
        settings: { backendsDir: root, textModelsDir: path.join(root, 'text-models') },
        supervisor,
        ...options
    });
    const run = {
        status: ({ model }) => embedding.status(model),
        ensure: async ({ model }) => { await embedding.ensure(model); return embedding.status(model); },
        embed: ({ model, texts, kind }) => embedding.embed(model, texts, kind === 'query' ? 'query' : 'document')
    };
    return {
        actions: ACTIONS,
        embedding,
        async call(action, body) {
            try {
                return { ok: true, value: await run[action](body || {}) };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        },
        dispose: () => supervisor.stopAll()
    };
}

module.exports = { createEmbeddingLauncher, ACTIONS };
