'use strict';

/**
 * Ties the pieces together: what is installed, how to start each service, and model downloads.
 * Has no Electron imports so the whole flow can run under `node --test`.
 */

const fs = require('fs');
const path = require('path');
const { BACKENDS, AUDIO_MODEL_PACKS, PORTS, getBackend, getVariant, launchSpec, splitArgs } = require('./backends.cjs');
const { installBackend, findInstallLayout, readInstalled } = require('./install.cjs');
const { writeWaveConfigs } = require('./audiocppConfig.cjs');
const { downloadFile } = require('./download.cjs');

class Controller {
    /**
     * @param {object} o
     * @param {import('./settings.cjs').DesktopSettings} o.settings
     * @param {import('./supervisor.cjs').Supervisor} o.supervisor
     * @param {string} o.appFilesDir   folder holding server.js, audio-studio-bridge.js, audiocpp/, dist/
     * @param {string} o.dataDir       the user's EllipsisProse data folder
     * @param {{command:string, env:object}} o.node  how to run a Node script (Electron-as-Node in the app)
     * @param {Function} [o.fetchRelease]  injectable for tests
     */
    constructor({ settings, supervisor, appFilesDir, dataDir, node, fetchRelease }) {
        this.settings = settings;
        this.supervisor = supervisor;
        this.appFilesDir = appFilesDir;
        this.dataDir = dataDir;
        this.node = node;
        this.fetchRelease = fetchRelease;
        this.jobs = new Map();
    }

    backendDir(id) {
        return path.join(this.settings.backendsDir, id);
    }

    layout(id) {
        return findInstallLayout(id, this.backendDir(id));
    }

    list() {
        const installed = readInstalled(this.settings.backendsDir);
        const backends = BACKENDS.map((b) => ({
            id: b.id,
            name: b.name,
            role: b.role,
            license: b.license,
            licenseUrl: b.licenseUrl,
            homepage: b.homepage,
            sizeHint: b.sizeHint,
            port: b.port,
            variants: b.variants.map((v) => ({ id: v.id, label: v.label })),
            installed: this.layout(b.id) ? (installed[b.id] || { variant: null, tag: 'unknown' }) : null,
            autostart: Boolean(this.settings.data.autostart[b.id]),
            options: this.settings.data[b.id] || {},
            job: this.jobs.get(b.id) || null,
            ...this.supervisor.status(b.id)
        }));
        const packs = AUDIO_MODEL_PACKS.map((p) => ({
            id: p.id,
            name: p.name,
            sizeHint: p.sizeHint,
            licenseUrl: p.licenseUrl,
            present: p.files.every((f) => fs.existsSync(path.join(this.settings.audioModelsDir, f.to))),
            job: this.jobs.get(`pack:${p.id}`) || null
        }));
        return {
            backendsDir: this.settings.backendsDir,
            audioModelsDir: this.settings.audioModelsDir,
            textModelsDir: this.settings.textModelsDir,
            comfyModelsDir: this.layout('comfyui')?.models || null,
            setupDone: Boolean(this.settings.data.setupDone),
            textModelJob: this.jobs.get('text-model') || null,
            backends,
            packs
        };
    }

    async runJob(key, fn, onChange) {
        if (this.jobs.has(key) && !this.jobs.get(key).error) throw new Error('Already running');
        const ac = new AbortController();
        const job = { phase: 'starting', file: '', received: 0, total: null, error: null, abort: () => ac.abort() };
        this.jobs.set(key, job);
        const report = (p) => { Object.assign(job, p); onChange(); };
        try {
            const result = await fn(report, ac.signal);
            this.jobs.delete(key);
            onChange();
            return result;
        } catch (err) {
            job.error = err.message;
            job.phase = 'error';
            onChange();
            throw err;
        }
    }

    cancel(key) {
        const job = this.jobs.get(key);
        if (job && job.abort) job.abort();
        if (job && job.error) this.jobs.delete(key);
    }

    install(id, variantId, onChange = () => {}) {
        this.stop(id);
        return this.runJob(id, (report, signal) => installBackend({
            backendsDir: this.settings.backendsDir,
            backendId: id,
            variantId,
            onProgress: report,
            signal,
            ...(this.fetchRelease ? { fetchRelease: this.fetchRelease } : {})
        }), onChange);
    }

    uninstall(id) {
        this.stop(id);
        fs.rmSync(this.backendDir(id), { recursive: true, force: true });
    }

    downloadPack(packId, onChange = () => {}) {
        const pack = AUDIO_MODEL_PACKS.find((p) => p.id === packId);
        if (!pack) throw new Error(`Unknown model pack ${packId}`);
        return this.runJob(`pack:${packId}`, async (report, signal) => {
            for (const f of pack.files) {
                const dest = path.join(this.settings.audioModelsDir, f.to);
                if (fs.existsSync(dest)) continue;
                await downloadFile({ url: f.url, dest, signal, onProgress: (p) => report({ phase: 'download', file: path.basename(f.to), ...p }) });
            }
        }, onChange);
    }

    /** Downloads a .gguf for KoboldCpp from a URL the user pasted and selects it. */
    downloadTextModel(url, onChange = () => {}) {
        const u = new URL(url);
        if (u.protocol !== 'https:') throw new Error('Use an https:// link');
        const name = decodeURIComponent(u.pathname.split('/').pop() || 'model.gguf');
        if (!/\.gguf$/i.test(name)) throw new Error('The link should end in .gguf');
        const dest = path.join(this.settings.textModelsDir, name.replace(/[^\w.\-]+/g, '_'));
        return this.runJob('text-model', async (report, signal) => {
            await downloadFile({ url, dest, signal, onProgress: (p) => report({ phase: 'download', file: name, ...p }) });
            this.settings.update({ koboldcpp: { modelPath: dest } });
            return dest;
        }, onChange);
    }

    /** The spec the supervisor needs to start a service, or null when it cannot start yet. */
    serviceSpec(id) {
        const installed = readInstalled(this.settings.backendsDir)[id] || {};
        if (id === 'web') {
            return {
                command: this.node.command,
                args: [path.join(this.appFilesDir, 'server.js')],
                cwd: this.appFilesDir,
                env: {
                    ...this.node.env,
                    PORT: String(this.settings.webPort || PORTS.web),
                    HOST: '127.0.0.1',
                    ELLIPSIS_DATA_DIR: this.dataDir,
                    STATIC_DIR: path.join(this.appFilesDir, 'dist')
                },
                port: this.settings.webPort || PORTS.web,
                healthUrl: `http://127.0.0.1:${this.settings.webPort || PORTS.web}/api/storage/status`,
                readyTimeoutMs: 20000
            };
        }
        if (id === 'audiocpp') {
            const layout = this.layout('audiocpp');
            if (!layout) return null;
            const backend = getBackend('audiocpp');
            const variant = getVariant(backend, installed.variant);
            const configDir = writeWaveConfigs({
                templatesDir: path.join(this.appFilesDir, 'audiocpp'),
                outDir: path.join(this.dataDir, 'audiocpp-configs'),
                modelsDir: this.settings.audioModelsDir,
                backend: variant.backend,
                packs: AUDIO_MODEL_PACKS
            });
            return {
                command: this.node.command,
                args: [path.join(this.appFilesDir, 'audio-studio-bridge.js'), '--port', String(PORTS.audioBridge), '--daemon-port', String(PORTS.audiocpp)],
                cwd: this.appFilesDir,
                env: {
                    ...this.node.env,
                    ELLIPSISPROSE_AUDIOCPP_DIR: layout.binDir,
                    ELLIPSISPROSE_AUDIOCPP_CWD: this.settings.audioModelsDir,
                    ELLIPSISPROSE_AUDIOCPP_CONFIG_DIR: configDir,
                    ELLIPSISPROSE_BRIDGE_CACHE_DIR: path.join(this.dataDir, 'cache', 'voices')
                },
                port: PORTS.audioBridge,
                healthUrl: `http://127.0.0.1:${PORTS.audioBridge}/health`
            };
        }
        const backend = getBackend(id);
        const layout = this.layout(id);
        if (!layout) return null;
        const variant = getVariant(backend, installed.variant);
        const opts = { ...(this.settings.data[id] || {}) };
        if (id === 'koboldcpp' && opts.modelPath && !fs.existsSync(opts.modelPath)) opts.modelPath = '';
        const spec = launchSpec(backend, variant, layout, opts);
        return {
            ...spec,
            port: backend.port,
            hideWindow: !(id === 'koboldcpp' && !opts.modelPath),
            healthUrl: `http://127.0.0.1:${backend.port}${backend.healthPath}`,
            // First ComfyUI start installs nothing but can take minutes to import torch; KoboldCpp
            // without a model waits on its own launcher window, so it never reports ready by itself.
            readyTimeoutMs: id === 'comfyui' ? 240000 : (opts.modelPath ? 180000 : 5000)
        };
    }

    async start(id, onChange = () => {}) {
        const spec = this.serviceSpec(id);
        if (!spec) throw new Error(`${id} is not installed`);
        fs.mkdirSync(this.settings.audioModelsDir, { recursive: true });
        const p = this.supervisor.start(id, spec);
        onChange();
        return p;
    }

    stop(id) {
        this.supervisor.stop(id);
    }

    /** Starts every installed backend the user left on autostart. Errors are kept in its log. */
    startInstalled(onChange = () => {}) {
        return Promise.all(BACKENDS.filter((b) => this.settings.data.autostart[b.id] && this.layout(b.id))
            .map((b) => this.start(b.id, onChange).catch(() => {})));
    }
}

module.exports = { Controller, splitArgs };
