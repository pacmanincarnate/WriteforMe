'use strict';

/**
 * Coordinates local GPU/VRAM residency across KoboldCpp, audio.cpp (Audio Studio Bridge),
 * and ComfyUI so switching modalities automatically offloads inactive > 2 GB models and
 * an idle timer (default 10 minutes, paused during cloud LLM activity) frees unused VRAM.
 *
 * Pure Node (no Electron imports) so it can be unit-tested directly with `node --test`.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { PORTS } = require('./backends.cjs');
const { isPortOpen } = require('./supervisor.cjs');

const TWO_GB_BYTES = 2 * 1024 * 1024 * 1024;
const MODALITIES = Object.freeze(['llm', 'audio', 'image']);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultHttpRequest(urlStr, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(urlStr);
        } catch (err) {
            reject(err);
            return;
        }
        const payload = body !== null && body !== undefined
            ? (typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(JSON.stringify(body), 'utf8'))
            : null;
        const headers = payload
            ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) }
            : {};
        const req = http.request({
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname + parsed.search,
            method,
            headers,
            timeout: timeoutMs
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = text.trim() ? JSON.parse(text) : null; } catch (_) {}
                resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, text, json });
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error(`Request timeout (${timeoutMs}ms): ${urlStr}`));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function defaultQueryNvidiaSmi() {
    return new Promise((resolve) => {
        execFile(
            'nvidia-smi',
            ['--query-gpu=name,memory.total,memory.used,memory.free', '--format=csv,noheader,nounits'],
            { windowsHide: true, timeout: 2500 },
            (err, stdout) => {
                if (err || !stdout) { resolve(null); return; }
                const firstLine = String(stdout).trim().split(/\r?\n/)[0];
                if (!firstLine) { resolve(null); return; }
                const parts = firstLine.split(',').map((s) => s.trim());
                if (parts.length < 4) { resolve(null); return; }
                const totalMb = Number(parts[1]);
                const usedMb = Number(parts[2]);
                const freeMb = Number(parts[3]);
                if (!Number.isFinite(totalMb) || !Number.isFinite(freeMb)) { resolve(null); return; }
                resolve({
                    source: 'nvidia-smi',
                    gpu: parts[0],
                    totalMb,
                    usedMb: Number.isFinite(usedMb) ? usedMb : Math.max(0, totalMb - freeMb),
                    freeMb
                });
            }
        );
    });
}

function statFileOrSplitShards(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return 0;
        const shardMatch = filePath.match(/^(.*)-(\d{5})-of-(\d{5})(\.gguf)$/i);
        if (shardMatch) {
            const dir = path.dirname(filePath);
            const prefix = path.basename(shardMatch[1]);
            const totalStr = shardMatch[3];
            const ext = shardMatch[4].toLowerCase();
            let sum = 0;
            for (const entry of fs.readdirSync(dir)) {
                const low = entry.toLowerCase();
                if (low.startsWith(prefix.toLowerCase() + '-') && low.includes(`-of-${totalStr}`) && low.endsWith(ext)) {
                    try { sum += fs.statSync(path.join(dir, entry)).size; } catch (_) {}
                }
            }
            if (sum > 0) return sum;
        }
        return fs.statSync(filePath).size;
    } catch (_) {
        return 0;
    }
}

class VramCoordinator {
    /**
     * @param {object} o
     * @param {import('./settings.cjs').DesktopSettings} o.settings
     * @param {import('./supervisor.cjs').Supervisor} o.supervisor
     * @param {import('./controller.cjs').Controller} o.controller
     * @param {Function} [o.onEvent]
     * @param {Function} [o.httpRequest]
     * @param {Function} [o.isPortOpenFn]
     * @param {Function} [o.queryGpuFn]
     * @param {number} [o.settleMs]
     */
    constructor({
        settings,
        supervisor,
        controller,
        onEvent = () => {},
        httpRequest = defaultHttpRequest,
        isPortOpenFn = isPortOpen,
        queryGpuFn = defaultQueryNvidiaSmi,
        settleMs = 350
    }) {
        this.settings = settings;
        this.supervisor = supervisor;
        this.controller = controller;
        this.onEvent = onEvent;
        this.httpRequest = httpRequest;
        this.isPortOpenFn = isPortOpenFn;
        this.queryGpuFn = queryGpuFn;
        this.settleMs = settleMs;

        this._nextLeaseId = 1;
        this.activeLeases = new Map();
        this.modalityRefCount = { llm: 0, audio: 0, image: 0 };
        this.currentModality = null;
        this.resident = { llm: false, audio: false, image: false };
        this.lastKnownModelBytes = { llm: null, audio: null, image: null };
        this.lastHints = { llm: {}, audio: {}, image: {} };
        this.cloudActivityCount = 0;
        this.lastTransitionAt = Date.now();
        this.lastOffloadReason = null;

        this._queue = Promise.resolve();
        this._idleTimer = null;
        this._leaseDrainWaiters = [];
    }

    totalActiveLeases() {
        return this.modalityRefCount.llm + this.modalityRefCount.audio + this.modalityRefCount.image;
    }

    _endpoint(modality, hints = {}) {
        if (modality === 'llm') {
            return String(hints.koboldUrl || `http://127.0.0.1:${PORTS.koboldcpp}`).replace(/\/+$/, '');
        }
        if (modality === 'audio') {
            return String(hints.bridgeUrl || `http://127.0.0.1:${PORTS.audioBridge}`).replace(/\/+$/, '');
        }
        return String(hints.comfyUrl || `http://127.0.0.1:${PORTS.comfyui}`).replace(/\/+$/, '');
    }

    _portForUrl(urlStr, fallbackPort) {
        try {
            const parsed = new URL(urlStr);
            return Number(parsed.port) || fallbackPort;
        } catch (_) {
            return fallbackPort;
        }
    }

    _enqueue(fn) {
        const next = this._queue.then(fn, fn);
        this._queue = next.catch(() => {});
        return next;
    }

    _clearIdleTimer() {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    _armIdleTimer() {
        this._clearIdleTimer();
        if (this.totalActiveLeases() > 0 || this.cloudActivityCount > 0) return;
        const vramCfg = this.settings.data?.vram || {};
        const mode = vramCfg.mode || 'auto';
        if (mode === 'manual') return;
        const minutes = vramCfg.idleUnloadMinutes !== undefined ? Number(vramCfg.idleUnloadMinutes) : 10;
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        if (!this.resident.llm && !this.resident.audio && !this.resident.image) return;

        const delayMs = Math.max(25, Math.round(minutes * 60 * 1000));
        this._idleTimer = setTimeout(() => {
            this._idleTimer = null;
            if (this.totalActiveLeases() > 0 || this.cloudActivityCount > 0) return;
            void this.offloadIdleModels('idle-timeout');
        }, delayMs);
        if (typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
    }

    _waitForOtherLeasesToDrain(targetModality, timeoutMs = 15000) {
        const otherActive = MODALITIES.some((m) => m !== targetModality && this.modalityRefCount[m] > 0);
        if (!otherActive) return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._leaseDrainWaiters = this._leaseDrainWaiters.filter((w) => w !== check);
                resolve();
            }, timeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
            const check = () => {
                const stillOther = MODALITIES.some((m) => m !== targetModality && this.modalityRefCount[m] > 0);
                if (!stillOther) {
                    clearTimeout(timer);
                    this._leaseDrainWaiters = this._leaseDrainWaiters.filter((w) => w !== check);
                    resolve();
                }
            };
            this._leaseDrainWaiters.push(check);
        });
    }

    _notifyLeaseDrained() {
        const waiters = this._leaseDrainWaiters.slice();
        for (const w of waiters) w();
    }

    setCloudActivity(activeOrCount) {
        const nextCount = typeof activeOrCount === 'number'
            ? Math.max(0, Math.round(activeOrCount))
            : (activeOrCount ? 1 : 0);
        this.cloudActivityCount = nextCount;
        if (this.cloudActivityCount > 0) {
            this._clearIdleTimer();
        } else {
            this._armIdleTimer();
        }
        return { cloudActivityCount: this.cloudActivityCount };
    }

    shouldOffloadBackend(bytes) {
        const vramCfg = this.settings.data?.vram || {};
        const mode = vramCfg.mode || 'auto';
        if (mode === 'manual') return false;
        if (mode === 'strict') return bytes > 0;
        const thresholdMb = Number(vramCfg.evictThresholdMb);
        const thresholdBytes = (Number.isFinite(thresholdMb) && thresholdMb > 0 ? thresholdMb : 2048) * 1024 * 1024;
        return bytes > thresholdBytes;
    }

    async estimateModelBytes(modality, hints = {}) {
        const mergedHints = { ...(this.lastHints[modality] || {}), ...(hints || {}) };
        if (modality === 'llm') {
            const kOpts = this.settings.data?.koboldcpp || {};
            if (kOpts.modelPath) {
                const sz = statFileOrSplitShards(kOpts.modelPath);
                if (sz > 0) {
                    this.lastKnownModelBytes.llm = sz;
                    return sz;
                }
            }
            if (kOpts.configPath && fs.existsSync(kOpts.configPath)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(kOpts.configPath, 'utf8'));
                    const rawModel = parsed?.model || parsed?.model_param;
                    if (typeof rawModel === 'string' && rawModel.trim()) {
                        const resolved = path.isAbsolute(rawModel)
                            ? rawModel
                            : path.resolve(path.dirname(kOpts.configPath), rawModel);
                        const sz = statFileOrSplitShards(resolved);
                        if (sz > 0) {
                            this.lastKnownModelBytes.llm = sz;
                            return sz;
                        }
                    }
                } catch (_) {}
            }
            if (this.lastKnownModelBytes.llm && this.lastKnownModelBytes.llm > 0) {
                return this.lastKnownModelBytes.llm;
            }
            // Check if KoboldCpp is actually responding with an active model
            const baseUrl = this._endpoint('llm', mergedHints);
            try {
                const res = await this.httpRequest(`${baseUrl}/api/v1/model`, { timeoutMs: 1500 });
                const modelName = res?.json?.result;
                if (res?.ok && modelName && modelName !== 'inactive' && modelName !== 'ReadOnly') {
                    return 8 * 1024 * 1024 * 1024; // Unknown GGUF size assumed > 2 GB
                }
            } catch (_) {}
            return 0;
        }

        if (modality === 'audio') {
            const bridgeUrl = this._endpoint('audio', mergedHints);
            try {
                const res = await this.httpRequest(`${bridgeUrl}/health`, { timeoutMs: 1500 });
                if (res?.ok && res.json) {
                    const h = res.json;
                    if (!h.audiocpp_server_alive && !h.active_wave) {
                        this.resident.audio = false;
                        return 0;
                    }
                    this.resident.audio = true;
                    const reportedBytes = Number(h.active_model_bytes);
                    if (Number.isFinite(reportedBytes) && reportedBytes > 0) {
                        this.lastKnownModelBytes.audio = reportedBytes;
                        return reportedBytes;
                    }
                    const fallbackByWave = { 1: 5_400_000_000, 2: 23_000_000_000, 3: 155_000_000 };
                    const est = fallbackByWave[Number(h.active_wave)] || 0;
                    this.lastKnownModelBytes.audio = est;
                    return est;
                }
            } catch (_) {}
            return this.resident.audio ? (this.lastKnownModelBytes.audio || 5_400_000_000) : 0;
        }

        if (modality === 'image') {
            const comfyModelsDir = this.controller?.layout?.('comfyui')?.models;
            let diskTotal = 0;
            if (comfyModelsDir) {
                const look = [
                    { dirs: ['diffusion_models', 'unet'], name: mergedHints.unet },
                    { dirs: ['text_encoders', 'clip'], name: mergedHints.clip },
                    { dirs: ['vae'], name: mergedHints.vae },
                    { dirs: ['loras'], name: mergedHints.lora }
                ];
                for (const item of look) {
                    if (!item.name) continue;
                    for (const sub of item.dirs) {
                        const candidate = path.join(comfyModelsDir, sub, item.name);
                        if (fs.existsSync(candidate)) {
                            try { diskTotal += fs.statSync(candidate).size; } catch (_) {}
                            break;
                        }
                    }
                }
            }
            if (diskTotal > 0) {
                this.lastKnownModelBytes.image = diskTotal;
                return diskTotal;
            }
            const comfyUrl = this._endpoint('image', mergedHints);
            try {
                const res = await this.httpRequest(`${comfyUrl}/system_stats`, { timeoutMs: 1500 });
                const dev = res?.json?.devices?.[0];
                if (dev) {
                    const torchAlloc = Number(dev.torch_vram_total || 0);
                    const used = Number(dev.vram_total || 0) - Number(dev.vram_free || 0);
                    const est = Math.max(torchAlloc, used);
                    if (this.resident.image) {
                        return Math.max(est, 12 * 1024 * 1024 * 1024);
                    }
                    return est > TWO_GB_BYTES ? est : 0;
                }
            } catch (_) {}
            return this.resident.image ? (this.lastKnownModelBytes.image || 12 * 1024 * 1024 * 1024) : 0;
        }

        return 0;
    }

    async offloadKobold(hints = {}) {
        const baseUrl = this._endpoint('llm', hints);
        const port = this._portForUrl(baseUrl, PORTS.koboldcpp);
        if (!(await this.isPortOpenFn(port))) {
            this.resident.llm = false;
            return { offloaded: false, reason: 'offline' };
        }

        let currentModel = null;
        try {
            const probe = await this.httpRequest(`${baseUrl}/api/v1/model`, { timeoutMs: 2000 });
            currentModel = probe?.json?.result ?? null;
        } catch (_) {
            currentModel = null;
        }

        if (currentModel === 'inactive' || currentModel === 'ReadOnly') {
            this.resident.llm = false;
            return { offloaded: false, reason: 'already-unloaded' };
        }

        this.onEvent({
            type: 'vram-offloading',
            backendId: 'koboldcpp',
            modality: 'llm',
            message: 'Offloading KoboldCpp model from VRAM…',
            level: 'info'
        });

        try {
            const unloadRes = await this.httpRequest(`${baseUrl}/api/admin/reload_config`, {
                method: 'POST',
                body: { filename: 'unload_model' },
                timeoutMs: 15000
            });
            if (unloadRes && unloadRes.ok) {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline) {
                    const check = await this.httpRequest(`${baseUrl}/api/v1/model`, { timeoutMs: 1500 }).catch(() => null);
                    if (!check || !check.ok || !check.json?.result || check.json.result === 'inactive') {
                        break;
                    }
                    await sleep(200);
                }
                if (this.settleMs > 0) await sleep(this.settleMs);
                this.resident.llm = false;
                this.onEvent({ type: 'vram-offloaded', backendId: 'koboldcpp', modality: 'llm', message: '', always: true });
                return { offloaded: true, method: 'admin-api' };
            }
        } catch (_) {}

        const svcStatus = this.supervisor?.status?.('koboldcpp')?.status;
        if (svcStatus && svcStatus !== 'external' && svcStatus !== 'stopped') {
            this.supervisor.stop('koboldcpp');
            const deadline = Date.now() + 8000;
            while (Date.now() < deadline) {
                if (!(await this.isPortOpenFn(port))) break;
                await sleep(150);
            }
            if (this.settleMs > 0) await sleep(this.settleMs);
            this.resident.llm = false;
            this.onEvent({ type: 'vram-offloaded', backendId: 'koboldcpp', modality: 'llm', message: '', always: true });
            return { offloaded: true, method: 'process-stop' };
        }

        if (svcStatus === 'external') {
            this.onEvent({
                type: 'vram-offload-skipped',
                backendId: 'koboldcpp',
                modality: 'llm',
                message: 'External KoboldCpp on port 5001 is not running with --admin; could not auto-offload VRAM.',
                level: 'warning'
            });
            return { offloaded: false, reason: 'external-no-admin' };
        }

        return { offloaded: false, reason: 'unsupported' };
    }

    async ensureKoboldLoaded(hints = {}) {
        const baseUrl = this._endpoint('llm', hints);
        const port = this._portForUrl(baseUrl, PORTS.koboldcpp);
        if (await this.isPortOpenFn(port)) {
            const probe = await this.httpRequest(`${baseUrl}/api/v1/model`, { timeoutMs: 2500 }).catch(() => null);
            const result = probe?.json?.result;
            if (probe?.ok && result && result !== 'inactive') {
                this.resident.llm = true;
                return { ready: true, started: false, reloaded: false };
            }
            if (probe?.ok && result === 'inactive') {
                this.onEvent({
                    type: 'kobold-reloading',
                    backendId: 'koboldcpp',
                    modality: 'llm',
                    message: 'Reloading KoboldCpp model into VRAM…',
                    level: 'info',
                    always: true
                });
                const reloadRes = await this.httpRequest(`${baseUrl}/api/admin/reload_config`, {
                    method: 'POST',
                    body: { filename: 'initial_model' },
                    timeoutMs: 180000
                }).catch(() => null);
                if (reloadRes && reloadRes.ok) {
                    const deadline = Date.now() + 180000;
                    while (Date.now() < deadline) {
                        const check = await this.httpRequest(`${baseUrl}/api/v1/model`, { timeoutMs: 2000 }).catch(() => null);
                        if (check?.ok && check.json?.result && check.json.result !== 'inactive') {
                            this.resident.llm = true;
                            return { ready: true, started: false, reloaded: true };
                        }
                        await sleep(300);
                    }
                }
            }
        }

        if (this.controller?.ensureKoboldRunning) {
            const started = await this.controller.ensureKoboldRunning(
                () => this.onEvent({ type: 'state-changed' }),
                () => this.onEvent({
                    type: 'kobold-starting',
                    backendId: 'koboldcpp',
                    modality: 'llm',
                    message: 'Starting KoboldCpp and loading model…',
                    level: 'info',
                    always: true
                })
            );
            if (started?.ready) this.resident.llm = true;
            return started;
        }
        return { ready: false, reason: 'unavailable' };
    }

    async ensureComfyLoaded(hints = {}) {
        const baseUrl = this._endpoint('image', hints);
        const port = this._portForUrl(baseUrl, PORTS.comfyui);
        if (await this.isPortOpenFn(port)) {
            return { ready: true, started: false };
        }
        let isLocal = false;
        try {
            const parsed = new URL(baseUrl);
            const host = parsed.hostname.toLowerCase();
            isLocal = (host === '127.0.0.1' || host === 'localhost') && port === PORTS.comfyui;
        } catch (_) {}
        if (isLocal && this.controller?.ensureComfyRunning) {
            return this.controller.ensureComfyRunning(
                () => this.onEvent({ type: 'state-changed' }),
                () => this.onEvent({
                    type: 'comfy-starting',
                    backendId: 'comfyui',
                    modality: 'image',
                    message: 'Starting ComfyUI in the background…',
                    level: 'info',
                    always: true
                })
            );
        }
        return { ready: false, reason: 'unavailable' };
    }

    async offloadAudio(hints = {}) {
        const bridgeUrl = this._endpoint('audio', hints);
        const port = this._portForUrl(bridgeUrl, PORTS.audioBridge);
        if (!(await this.isPortOpenFn(port))) {
            this.resident.audio = false;
            return { offloaded: false, reason: 'offline' };
        }

        const health = await this.httpRequest(`${bridgeUrl}/health`, { timeoutMs: 2000 }).catch(() => null);
        if (!health?.ok || (!health.json?.audiocpp_server_alive && !health.json?.active_wave)) {
            this.resident.audio = false;
            return { offloaded: false, reason: 'already-unloaded' };
        }

        this.onEvent({
            type: 'vram-offloading',
            backendId: 'audiocpp',
            modality: 'audio',
            message: 'Offloading audio.cpp voice model from VRAM…',
            level: 'info'
        });

        const res = await this.httpRequest(`${bridgeUrl}/wave/deactivate`, {
            method: 'POST',
            body: {},
            timeoutMs: 15000
        }).catch(() => null);

        if (res && res.ok) {
            this.resident.audio = false;
            this.lastKnownModelBytes.audio = 0;
            this.onEvent({ type: 'vram-offloaded', backendId: 'audiocpp', modality: 'audio', message: '', always: true });
            return { offloaded: true, method: 'bridge-deactivate' };
        }
        return { offloaded: false, reason: res ? `http-${res.status}` : 'unreachable' };
    }

    async offloadComfy(hints = {}) {
        const comfyUrl = this._endpoint('image', hints);
        const port = this._portForUrl(comfyUrl, PORTS.comfyui);
        if (!(await this.isPortOpenFn(port))) {
            this.resident.image = false;
            return { offloaded: false, reason: 'offline' };
        }

        const beforeStats = await this.httpRequest(`${comfyUrl}/system_stats`, { timeoutMs: 2000 }).catch(() => null);
        const beforeFree = Number(beforeStats?.json?.devices?.[0]?.vram_free);
        const beforeTorch = Number(beforeStats?.json?.devices?.[0]?.torch_vram_total || 0);
        if (!this.resident.image && Number.isFinite(beforeTorch) && beforeTorch === 0) {
            return { offloaded: false, reason: 'already-unloaded' };
        }

        // Let any just-finishing queue item wrap up briefly before flagging /free
        const qRes = await this.httpRequest(`${comfyUrl}/queue`, { timeoutMs: 1500 }).catch(() => null);
        if (Array.isArray(qRes?.json?.queue_running) && qRes.json.queue_running.length > 0) {
            const qDeadline = Date.now() + 5000;
            while (Date.now() < qDeadline) {
                await sleep(250);
                const qNext = await this.httpRequest(`${comfyUrl}/queue`, { timeoutMs: 1500 }).catch(() => null);
                if (!Array.isArray(qNext?.json?.queue_running) || qNext.json.queue_running.length === 0) break;
            }
        }

        this.onEvent({
            type: 'vram-offloading',
            backendId: 'comfyui',
            modality: 'image',
            message: 'Freeing ComfyUI model cache from VRAM…',
            level: 'info'
        });

        const freeRes = await this.httpRequest(`${comfyUrl}/free`, {
            method: 'POST',
            body: { unload_models: true, free_memory: true },
            timeoutMs: 5000
        }).catch(() => null);

        if (!freeRes || !freeRes.ok) {
            return { offloaded: false, reason: freeRes ? `http-${freeRes.status}` : 'unreachable' };
        }

        // POST /free queues the unload asynchronously; wait for vram_free to stabilize
        const pollDeadline = Date.now() + 3000;
        let lastFree = Number.isFinite(beforeFree) ? beforeFree : -1;
        let stableCount = 0;
        let sawIncrease = false;
        while (Date.now() < pollDeadline) {
            await sleep(200);
            const stats = await this.httpRequest(`${comfyUrl}/system_stats`, { timeoutMs: 1500 }).catch(() => null);
            const curFree = Number(stats?.json?.devices?.[0]?.vram_free);
            if (!Number.isFinite(curFree)) {
                if (this.settleMs > 0) await sleep(this.settleMs);
                break;
            }
            if (Number.isFinite(beforeFree) && curFree > beforeFree) sawIncrease = true;
            if (curFree === lastFree && (sawIncrease || curFree > 0)) {
                stableCount++;
                if (stableCount >= 2) break;
            } else {
                stableCount = 0;
            }
            lastFree = curFree;
        }

        this.resident.image = false;
        this.onEvent({ type: 'vram-offloaded', backendId: 'comfyui', modality: 'image', message: '', always: true });
        return { offloaded: true, method: 'comfy-free' };
    }

    async _offloadModality(modality, hints = {}, force = false) {
        if (!force) {
            const bytes = await this.estimateModelBytes(modality, hints);
            if (!this.shouldOffloadBackend(bytes)) {
                return { offloaded: false, reason: 'below-threshold', bytes };
            }
        }
        if (modality === 'llm') return this.offloadKobold(hints);
        if (modality === 'audio') return this.offloadAudio(hints);
        if (modality === 'image') return this.offloadComfy(hints);
        return { offloaded: false, reason: 'unknown-modality' };
    }

    async acquireLease(modality, hints = {}) {
        if (!MODALITIES.includes(modality)) {
            throw new Error(`Unknown GPU modality: ${modality}`);
        }
        this._clearIdleTimer();
        if (hints && typeof hints === 'object') {
            this.lastHints[modality] = { ...(this.lastHints[modality] || {}), ...hints };
        }

        // Re-entrant fast path when the same modality already owns the GPU lease
        if (this.currentModality === modality && this.modalityRefCount[modality] > 0) {
            const leaseId = `lease_${this._nextLeaseId++}`;
            this.activeLeases.set(leaseId, { modality, acquiredAt: Date.now(), hints });
            this.modalityRefCount[modality]++;
            this.resident[modality] = true;
            return { leaseId, modality, reentrant: true, offloaded: [] };
        }

        return this._enqueue(async () => {
            this._clearIdleTimer();
            await this._waitForOtherLeasesToDrain(modality);

            const offloaded = [];
            const mode = this.settings.data?.vram?.mode || 'auto';
            if (mode !== 'manual') {
                for (const other of MODALITIES) {
                    if (other === modality) continue;
                    if (this.modalityRefCount[other] > 0) continue;
                    const res = await this._offloadModality(other, this.lastHints[other], false);
                    if (res.offloaded) offloaded.push({ modality: other, ...res });
                }
            }

            if (modality === 'llm') {
                await this.ensureKoboldLoaded(this.lastHints.llm);
            } else if (modality === 'image') {
                await this.ensureComfyLoaded(this.lastHints.image);
            }

            const leaseId = `lease_${this._nextLeaseId++}`;
            this.activeLeases.set(leaseId, { modality, acquiredAt: Date.now(), hints });
            this.modalityRefCount[modality]++;
            this.currentModality = modality;
            this.resident[modality] = true;
            this.lastTransitionAt = Date.now();
            return { leaseId, modality, reentrant: false, offloaded };
        });
    }

    releaseLease(leaseId) {
        const rec = this.activeLeases.get(leaseId);
        if (!rec) return { released: false };
        this.activeLeases.delete(leaseId);
        this.modalityRefCount[rec.modality] = Math.max(0, this.modalityRefCount[rec.modality] - 1);
        if (this.totalActiveLeases() === 0) {
            this.currentModality = null;
            this._armIdleTimer();
        }
        this._notifyLeaseDrained();
        return { released: true, modality: rec.modality, remaining: this.totalActiveLeases() };
    }

    async offloadIdleModels(reason = 'idle-timeout') {
        return this._enqueue(async () => {
            if (this.totalActiveLeases() > 0 || this.cloudActivityCount > 0) {
                return { skipped: true, reason: 'busy' };
            }
            const results = {};
            for (const m of MODALITIES) {
                results[m] = await this._offloadModality(m, this.lastHints[m], false);
            }
            this.lastOffloadReason = reason;
            return { skipped: false, reason, results };
        });
    }

    async freeAllVram(reason = 'manual') {
        this._clearIdleTimer();
        return this._enqueue(async () => {
            const results = {};
            for (const m of MODALITIES) {
                if (this.modalityRefCount[m] > 0 && reason !== 'manual') continue;
                results[m] = await this._offloadModality(m, this.lastHints[m], true);
            }
            this.lastOffloadReason = reason;
            return { ok: true, reason, results };
        });
    }

    async getStatus() {
        let gpu = await this.queryGpuFn();
        if (!gpu) {
            const comfyUrl = this._endpoint('image', this.lastHints.image);
            const stats = await this.httpRequest(`${comfyUrl}/system_stats`, { timeoutMs: 1200 }).catch(() => null);
            const dev = stats?.json?.devices?.[0];
            if (dev && Number.isFinite(Number(dev.vram_total)) && Number.isFinite(Number(dev.vram_free))) {
                const totalMb = Math.round(Number(dev.vram_total) / (1024 * 1024));
                const freeMb = Math.round(Number(dev.vram_free) / (1024 * 1024));
                gpu = {
                    source: 'comfyui',
                    gpu: dev.name || 'GPU',
                    totalMb,
                    usedMb: Math.max(0, totalMb - freeMb),
                    freeMb
                };
            }
        }
        const vramCfg = this.settings.data?.vram || {};
        return {
            mode: vramCfg.mode || 'auto',
            idleUnloadMinutes: vramCfg.idleUnloadMinutes !== undefined ? Number(vramCfg.idleUnloadMinutes) : 10,
            evictThresholdMb: Number(vramCfg.evictThresholdMb) || 2048,
            currentModality: this.currentModality,
            activeLeases: this.totalActiveLeases(),
            cloudActivityCount: this.cloudActivityCount,
            resident: { ...this.resident },
            gpu
        };
    }

    dispose() {
        this._clearIdleTimer();
    }
}

module.exports = {
    VramCoordinator,
    TWO_GB_BYTES,
    MODALITIES,
    statFileOrSplitShards
};
