'use strict';

/**
 * Ties the pieces together: what is installed, how to start each service, and model downloads.
 * Has no Electron imports so the whole flow can run under `node --test`.
 */

const fs = require('fs');
const path = require('path');
const { BACKENDS, AUDIO_MODEL_PACKS, PORTS, getBackend, getVariant, launchSpec, splitArgs } = require('./backends.cjs');
const { installBackend, findInstallLayout, findInstallLayoutFromPath, readInstalled } = require('./install.cjs');
const { writeWaveConfigs } = require('./audiocppConfig.cjs');
const { downloadFile } = require('./download.cjs');
const { httpOk } = require('./supervisor.cjs');
const { VramCoordinator } = require('./vramCoordinator.cjs');
const { LocalEmbedding } = require('./embedding.cjs');

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
    constructor({ settings, supervisor, appFilesDir, dataDir, node, fetchRelease, onVramEvent = () => {}, httpOkFn = httpOk }) {
        this.settings = settings;
        this.supervisor = supervisor;
        this.appFilesDir = appFilesDir;
        this.dataDir = dataDir;
        this.node = node;
        this.fetchRelease = fetchRelease;
        this.httpOkFn = httpOkFn;
        this.jobs = new Map();
        this.jobControls = new Map();
        this._koboldStartPromise = null;
        this._comfyStartPromise = null;
        this.vram = new VramCoordinator({
            settings,
            supervisor,
            controller: this,
            onEvent: onVramEvent
        });
        // Lore search embeddings on the processor; see embedding.cjs for why it takes no VRAM lease.
        this.embedding = new LocalEmbedding({ settings, supervisor });
    }

    backendDir(id) {
        return path.join(this.settings.backendsDir, id);
    }

    layout(id) {
        const custom = this.settings.data.customPaths?.[id];
        if (custom) return findInstallLayoutFromPath(id, custom);
        return findInstallLayout(id, this.backendDir(id));
    }

    publicJob(key) {
        const job = this.jobs.get(key);
        return job ? { ...job } : null;
    }

    setCustomInstall(id, targetPath) {
        getBackend(id);
        const resolved = findInstallLayoutFromPath(id, targetPath);
        if (!resolved) {
            const hints = {
                koboldcpp: 'Choose koboldcpp.exe (or a folder containing it).',
                comfyui: 'Choose a ComfyUI folder containing main.py and python_embeded/python.exe or venv/Scripts/python.exe.',
                audiocpp: 'Choose audiocpp_server.exe (or a folder containing it).'
            };
            throw new Error(`Could not find a valid ${id} install at "${targetPath}". ${hints[id] || ''}`);
        }
        this.stop(id);
        this.settings.update({ customPaths: { [id]: targetPath } });
        return resolved;
    }

    clearCustomInstall(id) {
        getBackend(id);
        this.stop(id);
        this.settings.update({ customPaths: { [id]: '' } });
    }

    list() {
        const installed = readInstalled(this.settings.backendsDir);
        const backends = BACKENDS.map((b) => {
            const customPath = this.settings.data.customPaths?.[b.id] || '';
            const activeLayout = this.layout(b.id);
            const customPathMissing = Boolean(customPath && !activeLayout);
            const installSource = customPath ? (activeLayout ? 'custom' : null) : (activeLayout ? 'managed' : null);
            const installedInfo = activeLayout
                ? (customPath
                    ? { variant: this.settings.data[b.id]?.variant || null, tag: 'existing install', external: true, path: customPath }
                    : (installed[b.id] || { variant: null, tag: 'unknown' }))
                : null;
            return {
                id: b.id,
                name: b.name,
                role: b.role,
                license: b.license,
                licenseUrl: b.licenseUrl,
                homepage: b.homepage,
                sizeHint: b.sizeHint,
                port: b.port,
                variants: b.variants.map((v) => ({ id: v.id, label: v.label })),
                installed: installedInfo,
                installSource,
                customPath,
                customPathMissing,
                autostart: Boolean(this.settings.data.autostart[b.id]),
                options: this.settings.data[b.id] || {},
                job: this.publicJob(b.id),
                ...this.supervisor.status(b.id)
            };
        });
        const packs = AUDIO_MODEL_PACKS.map((p) => ({
            id: p.id,
            name: p.name,
            sizeHint: p.sizeHint,
            licenseUrl: p.licenseUrl,
            present: p.files.every((f) => fs.existsSync(path.join(this.settings.audioModelsDir, f.to))),
            job: this.publicJob(`pack:${p.id}`)
        }));
        return {
            backendsDir: this.settings.backendsDir,
            audioModelsDir: this.settings.audioModelsDir,
            textModelsDir: this.settings.textModelsDir,
            comfyModelsDir: this.layout('comfyui')?.models || null,
            setupDone: Boolean(this.settings.data.setupDone),
            vram: this.settings.data.vram,
            textModelJob: this.publicJob('text-model'),
            backends,
            packs
        };
    }

    async runJob(key, fn, onChange, resumeSpec = null) {
        const prev = this.jobs.get(key);
        if (prev && !prev.error && !prev.paused) throw new Error('Already running');
        const ac = new AbortController();
        const job = {
            phase: 'starting',
            file: prev?.file || '',
            received: prev?.paused ? (prev.received || 0) : 0,
            total: prev?.paused ? (prev.total ?? null) : null,
            speedBps: 0,
            paused: false,
            error: null
        };
        const ctrl = { ac, resumeSpec, pausedByUser: false, cancelledByUser: false };
        this.jobs.set(key, job);
        this.jobControls.set(key, ctrl);
        onChange();
        const report = (p) => { Object.assign(job, p); onChange(); };
        try {
            const result = await fn(report, ac.signal);
            this.jobs.delete(key);
            this.jobControls.delete(key);
            onChange();
            return result;
        } catch (err) {
            if (ctrl.pausedByUser || err?.code === 'PAUSED') {
                job.phase = 'paused';
                job.paused = true;
                job.speedBps = 0;
                job.error = null;
                onChange();
                return { paused: true };
            }
            if (ctrl.cancelledByUser || err?.code === 'CANCELLED') {
                this.jobs.delete(key);
                this.jobControls.delete(key);
                onChange();
                return { cancelled: true };
            }
            job.error = err.message;
            job.phase = 'error';
            job.paused = false;
            job.speedBps = 0;
            onChange();
            throw err;
        }
    }

    pause(key, onChange = () => {}) {
        const job = this.jobs.get(key);
        const ctrl = this.jobControls.get(key);
        if (!job || !ctrl || job.paused || job.error) return false;
        if (job.phase === 'extract' || job.phase === 'verify') return false;
        ctrl.pausedByUser = true;
        ctrl.ac.abort('paused');
        job.phase = 'paused';
        job.paused = true;
        job.speedBps = 0;
        job.error = null;
        onChange();
        return true;
    }

    resume(key, onChange = () => {}) {
        const job = this.jobs.get(key);
        const ctrl = this.jobControls.get(key);
        if (!job || !job.paused || !ctrl?.resumeSpec) throw new Error('No paused download to resume');
        const spec = ctrl.resumeSpec;
        if (spec.kind === 'install') return this.install(spec.id, spec.variantId, onChange);
        if (spec.kind === 'pack') return this.downloadPack(spec.packId, onChange);
        if (spec.kind === 'textModel') return this.downloadTextModel(spec.url, onChange);
        throw new Error(`Unsupported resume kind: ${spec.kind}`);
    }

    cancel(key, onChange = () => {}) {
        const ctrl = this.jobControls.get(key);
        if (ctrl) {
            ctrl.cancelledByUser = true;
            ctrl.ac.abort('cancelled');
        }
        this.jobs.delete(key);
        this.jobControls.delete(key);
        onChange();
    }

    install(id, variantId, onChange = () => {}) {
        this.stop(id);
        return this.runJob(id, async (report, signal) => {
            const res = await installBackend({
                backendsDir: this.settings.backendsDir,
                backendId: id,
                variantId,
                onProgress: report,
                signal,
                ...(this.fetchRelease ? { fetchRelease: this.fetchRelease } : {})
            });
            if (this.settings.data.customPaths?.[id]) {
                this.settings.update({ customPaths: { [id]: '' } });
            }
            return res;
        }, onChange, { kind: 'install', id, variantId });
    }

    uninstall(id) {
        if (this.settings.data.customPaths?.[id]) {
            this.clearCustomInstall(id);
            return;
        }
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
                await downloadFile({
                    url: f.url,
                    dest,
                    signal,
                    onProgress: (p) => report(
                        p.verifying
                            ? { phase: 'verify', file: path.basename(f.to), received: p.received, total: p.total, speedBps: 0 }
                            : { phase: 'download', file: path.basename(f.to), ...p }
                    )
                });
            }
        }, onChange, { kind: 'pack', packId });
    }

    /** Downloads a .gguf for KoboldCpp from a URL the user pasted and selects it. */
    downloadTextModel(url, onChange = () => {}) {
        const u = new URL(url);
        if (u.protocol !== 'https:') throw new Error('Use an https:// link');
        const name = decodeURIComponent(u.pathname.split('/').pop() || 'model.gguf');
        if (!/\.gguf$/i.test(name)) throw new Error('The link should end in .gguf');
        const dest = path.join(this.settings.textModelsDir, name.replace(/[^\w.\-]+/g, '_'));
        return this.runJob('text-model', async (report, signal) => {
            await downloadFile({
                url,
                dest,
                signal,
                onProgress: (p) => report(
                    p.verifying
                        ? { phase: 'verify', file: name, received: p.received, total: p.total, speedBps: 0 }
                        : { phase: 'download', file: name, ...p }
                )
            });
            this.settings.update({ koboldcpp: { modelPath: dest, configPath: '' } });
            return dest;
        }, onChange, { kind: 'textModel', url });
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
            const variantId = this.settings.data.audiocpp?.variant || installed.variant;
            const variant = getVariant(backend, variantId);
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
        if (id === 'koboldcpp') {
            if (opts.configPath && !fs.existsSync(opts.configPath)) opts.configPath = '';
            if (opts.modelPath && !fs.existsSync(opts.modelPath)) opts.modelPath = '';
        }
        const hasKoboldTarget = id === 'koboldcpp' && Boolean(opts.configPath || opts.modelPath);
        if (hasKoboldTarget) {
            const adminDir = path.join(this.dataDir, 'kobold-admin');
            fs.mkdirSync(adminDir, { recursive: true });
            opts.adminDir = adminDir;
        }
        const spec = launchSpec(backend, variant, layout, opts);
        return {
            ...spec,
            port: backend.port,
            hideWindow: !(id === 'koboldcpp' && !hasKoboldTarget),
            healthUrl: `http://127.0.0.1:${backend.port}${backend.healthPath}`,
            // First ComfyUI start installs nothing but can take minutes to import torch; KoboldCpp
            // without a model/config waits on its own launcher window, so it never reports ready by itself.
            readyTimeoutMs: id === 'comfyui' ? 240000 : (hasKoboldTarget ? 180000 : 5000)
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

    /**
     * Starts every installed backend the user left on autostart, except KoboldCpp and ComfyUI,
     * which start lazily on demand so they do not occupy VRAM or open extra processes at launch.
     */
    startInstalled(onChange = () => {}) {
        return Promise.all(
            BACKENDS
                .filter((b) => b.id !== 'koboldcpp' && b.id !== 'comfyui' && this.settings.data.autostart[b.id] && this.layout(b.id))
                .map((b) => this.start(b.id, onChange).catch(() => {}))
        );
    }

    /** Starts KoboldCpp on demand when a local generation request is made. */
    async ensureKoboldRunning(onChange = () => {}, onStarting = () => {}) {
        const current = this.supervisor.status('koboldcpp').status;
        if (current === 'running' || current === 'external') {
            return { ready: true, started: false, status: current };
        }
        if (await this.httpOkFn(`http://127.0.0.1:${PORTS.koboldcpp}/api/v1/model`)) {
            return { ready: true, started: false, status: 'external' };
        }
        if (!this.layout('koboldcpp')) {
            return { ready: false, reason: 'not-installed' };
        }
        if (!this.settings.data.autostart.koboldcpp) {
            return { ready: false, reason: 'autostart-disabled' };
        }
        if (!this._koboldStartPromise) {
            onStarting();
            this._koboldStartPromise = this.start('koboldcpp', onChange)
                .then((svc) => ({
                    ready: svc.status === 'running' || svc.status === 'external',
                    started: true,
                    status: svc.status
                }))
                .finally(() => {
                    this._koboldStartPromise = null;
                });
        }
        return this._koboldStartPromise;
    }

    /**
     * Starts ComfyUI silently on demand when an image generation or refresh request is made.
     * `explicit` is the Launch button: the person asked, so the autostart switch does not apply.
     */
    async ensureComfyRunning(onChange = () => {}, onStarting = () => {}, { explicit = false } = {}) {
        const current = this.supervisor.status('comfyui').status;
        if (current === 'running' || current === 'external') {
            return { ready: true, started: false, status: current };
        }
        if (await this.httpOkFn(`http://127.0.0.1:${PORTS.comfyui}/system_stats`)) {
            return { ready: true, started: false, status: 'external' };
        }
        if (!this.layout('comfyui')) {
            return { ready: false, reason: 'not-installed' };
        }
        if (!explicit && !this.settings.data.autostart.comfyui) {
            return { ready: false, reason: 'autostart-disabled' };
        }
        if (!this._comfyStartPromise) {
            onStarting();
            this._comfyStartPromise = this.start('comfyui', onChange)
                .then((svc) => ({
                    ready: svc.status === 'running' || svc.status === 'external',
                    started: true,
                    status: svc.status
                }))
                .finally(() => {
                    this._comfyStartPromise = null;
                });
        }
        return this._comfyStartPromise;
    }
}

module.exports = { Controller, splitArgs };
