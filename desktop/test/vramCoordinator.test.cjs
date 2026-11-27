'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { DesktopSettings } = require('../lib/settings.cjs');
const { VramCoordinator, TWO_GB_BYTES } = require('../lib/vramCoordinator.cjs');

function startMockServer(handler) {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let body = null;
                try { body = raw.trim() ? JSON.parse(raw) : null; } catch (_) {}
                handler(req, res, body);
            });
        });
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            resolve({
                server: srv,
                port: addr.port,
                url: `http://127.0.0.1:${addr.port}`,
                close: () => new Promise((r) => {
                    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
                    srv.close(r);
                })
            });
        });
    });
}

function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
}

test('juggles Prose (KoboldCpp) -> Audio (audio.cpp) -> Scene Picture (KoboldCpp prompt -> ComfyUI) -> Prose cleanly', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-seq-'));
    const settings = new DesktopSettings(userData);

    const events = [];
    let koboldModel = 'my-local-12b.gguf';
    let koboldUnloadSupported = true;
    let audioAlive = false;
    let audioWave = null;
    let audioModelBytes = 0;
    let comfyFreeMb = 2000;
    let comfyTorchBytes = 12 * 1024 * 1024 * 1024;

    const kSrv = await startMockServer((req, res, body) => {
        if (req.url === '/api/v1/model') {
            return sendJson(res, 200, { result: koboldModel });
        }
        if (req.url === '/api/admin/reload_config' && req.method === 'POST') {
            events.push(`kobold:${body?.filename}`);
            if (!koboldUnloadSupported) return sendJson(res, 404, { error: 'not found' });
            if (body?.filename === 'unload_model') koboldModel = 'inactive';
            if (body?.filename === 'initial_model') koboldModel = 'my-local-12b.gguf';
            return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, {});
    });

    const aSrv = await startMockServer((req, res) => {
        if (req.url === '/health') {
            return sendJson(res, 200, {
                status: 'ok',
                audiocpp_server_alive: audioAlive,
                active_wave: audioWave,
                active_model_bytes: audioModelBytes
            });
        }
        if (req.url === '/wave/deactivate' && req.method === 'POST') {
            events.push('audio:deactivate');
            audioAlive = false;
            audioWave = null;
            audioModelBytes = 0;
            return sendJson(res, 200, { status: 'ok', unloaded: true });
        }
        return sendJson(res, 404, {});
    });

    const cSrv = await startMockServer((req, res, body) => {
        if (req.url === '/system_stats') {
            return sendJson(res, 200, {
                devices: [{
                    name: 'Mock GPU',
                    vram_total: 16 * 1024 * 1024 * 1024,
                    vram_free: comfyFreeMb * 1024 * 1024,
                    torch_vram_total: comfyTorchBytes
                }]
            });
        }
        if (req.url === '/queue') {
            return sendJson(res, 200, { queue_running: [], queue_pending: [] });
        }
        if (req.url === '/free' && req.method === 'POST') {
            events.push(`comfy:free:${Boolean(body?.unload_models)}:${Boolean(body?.free_memory)}`);
            comfyFreeMb = 15000;
            comfyTorchBytes = 0;
            return sendJson(res, 200, {});
        }
        return sendJson(res, 404, {});
    });

    const coord = new VramCoordinator({
        settings,
        supervisor: { status: () => ({ status: 'stopped' }), stop: () => {} },
        controller: {
            layout: () => null,
            ensureKoboldRunning: async () => ({ ready: true, started: false })
        },
        settleMs: 10
    });

    try {
        const hints = { koboldUrl: kSrv.url, bridgeUrl: aSrv.url, comfyUrl: cSrv.url };

        // 1. User generates prose with KoboldCpp
        const l1 = await coord.acquireLease('llm', hints);
        assert.equal(koboldModel, 'my-local-12b.gguf');
        coord.releaseLease(l1.leaseId);

        // 2. User generates Scene Audio -> KoboldCpp must unload BEFORE audio runs
        const a1 = await coord.acquireLease('audio', hints);
        assert.equal(koboldModel, 'inactive');
        audioAlive = true;
        audioWave = 2;
        audioModelBytes = 23 * 1024 * 1024 * 1024; // Drama-3 (> 2 GB)
        coord.releaseLease(a1.leaseId);

        // 3a. User clicks Generate Scene Picture -> LLM prompt runs first, evicting Audio & reloading KoboldCpp
        const l2 = await coord.acquireLease('llm', hints);
        assert.equal(audioAlive, false);
        assert.equal(koboldModel, 'my-local-12b.gguf');
        coord.releaseLease(l2.leaseId);

        // 3b. Image stage runs ComfyUI -> evicts KoboldCpp BEFORE ComfyUI renders
        const c1 = await coord.acquireLease('image', hints);
        assert.equal(koboldModel, 'inactive');
        comfyFreeMb = 1800;
        comfyTorchBytes = 12 * 1024 * 1024 * 1024;
        coord.releaseLease(c1.leaseId);

        // 4. Back to prose -> ComfyUI /free runs, KoboldCpp reloads initial_model
        const l3 = await coord.acquireLease('llm', hints);
        assert.equal(comfyTorchBytes, 0);
        assert.equal(koboldModel, 'my-local-12b.gguf');
        coord.releaseLease(l3.leaseId);

        assert.deepEqual(events, [
            'kobold:unload_model',
            'audio:deactivate',
            'kobold:initial_model',
            'kobold:unload_model',
            'comfy:free:true:true',
            'kobold:initial_model'
        ]);
    } finally {
        coord.dispose();
        await Promise.all([kSrv.close(), aSrv.close(), cSrv.close()]);
    }
});

test('auto policy spares <= 2 GB models while strict evicts all and manual evicts none until freeAllVram', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-thresh-'));
    const settings = new DesktopSettings(userData);

    let deactivateCalls = 0;
    let audioModelBytes = 155 * 1024 * 1024; // Wave 3 Whisper+VAD (155 MB <= 2 GB)

    const aSrv = await startMockServer((req, res) => {
        if (req.url === '/health') {
            return sendJson(res, 200, {
                status: 'ok',
                audiocpp_server_alive: true,
                active_wave: 3,
                active_model_bytes: audioModelBytes
            });
        }
        if (req.url === '/wave/deactivate' && req.method === 'POST') {
            deactivateCalls++;
            return sendJson(res, 200, { status: 'ok', unloaded: true });
        }
        return sendJson(res, 404, {});
    });

    const coord = new VramCoordinator({
        settings,
        supervisor: { status: () => ({ status: 'stopped' }), stop: () => {} },
        controller: {
            layout: () => null,
            ensureKoboldRunning: async () => ({ ready: true })
        },
        isPortOpenFn: async (p) => p === aSrv.port,
        settleMs: 5
    });

    try {
        const hints = { bridgeUrl: aSrv.url, koboldUrl: 'http://127.0.0.1:1', comfyUrl: 'http://127.0.0.1:1' };
        // Seed audio as resident with <= 2 GB
        const aLease = await coord.acquireLease('audio', hints);
        coord.releaseLease(aLease.leaseId);

        // Auto mode: switching to image spares 155 MB audio model
        const iLease = await coord.acquireLease('image', hints);
        coord.releaseLease(iLease.leaseId);
        assert.equal(deactivateCalls, 0);

        // Strict mode: evicts even 155 MB model
        settings.update({ vram: { mode: 'strict' } });
        const iLease2 = await coord.acquireLease('image', hints);
        coord.releaseLease(iLease2.leaseId);
        assert.equal(deactivateCalls, 1);

        // Manual mode: never auto-evicts even > 2 GB, until freeAllVram()
        audioModelBytes = TWO_GB_BYTES + 1024 * 1024;
        settings.update({ vram: { mode: 'manual' } });
        const aLease2 = await coord.acquireLease('audio', hints);
        coord.releaseLease(aLease2.leaseId);
        const iLease3 = await coord.acquireLease('image', hints);
        coord.releaseLease(iLease3.leaseId);
        assert.equal(deactivateCalls, 1);

        await coord.freeAllVram('manual');
        assert.equal(deactivateCalls, 2);
    } finally {
        coord.dispose();
        await aSrv.close();
    }
});

test('falls back to stopping managed KoboldCpp when admin API is absent, but never kills external KoboldCpp', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-fb-'));
    const settings = new DesktopSettings(userData);

    const kSrv = await startMockServer((req, res) => {
        if (req.url === '/api/v1/model') return sendJson(res, 200, { result: 'legacy-model.gguf' });
        return sendJson(res, 404, { error: 'no admin' });
    });

    let stopCalls = 0;
    let svcStatus = 'running';
    let portAlive = true;

    const coord = new VramCoordinator({
        settings,
        supervisor: {
            status: () => ({ status: svcStatus }),
            stop: () => { stopCalls++; portAlive = false; }
        },
        controller: { layout: () => null },
        isPortOpenFn: async () => portAlive,
        settleMs: 5
    });

    try {
        const resManaged = await coord.offloadKobold({ koboldUrl: kSrv.url });
        assert.equal(resManaged.offloaded, true);
        assert.equal(resManaged.method, 'process-stop');
        assert.equal(stopCalls, 1);

        svcStatus = 'external';
        portAlive = true;
        const resExt = await coord.offloadKobold({ koboldUrl: kSrv.url });
        assert.equal(resExt.offloaded, false);
        assert.equal(resExt.reason, 'external-no-admin');
        assert.equal(stopCalls, 1);
    } finally {
        coord.dispose();
        await kSrv.close();
    }
});

test('idle timer pauses while waiting on a cloud LLM and unloads > 2 GB local model after cloud finishes', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-idle-'));
    const settings = new DesktopSettings(userData);
    settings.update({ vram: { mode: 'auto', idleUnloadMinutes: 0.002 } }); // ~120ms

    let koboldModel = 'local-story-12b.gguf';
    let unloadCount = 0;
    const kSrv = await startMockServer((req, res, body) => {
        if (req.url === '/api/v1/model') return sendJson(res, 200, { result: koboldModel });
        if (req.url === '/api/admin/reload_config') {
            if (body?.filename === 'unload_model') {
                unloadCount++;
                koboldModel = 'inactive';
            }
            return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, {});
    });

    const coord = new VramCoordinator({
        settings,
        supervisor: { status: () => ({ status: 'stopped' }), stop: () => {} },
        controller: {
            layout: () => null,
            ensureKoboldRunning: async () => ({ ready: true })
        },
        isPortOpenFn: async (p) => p === kSrv.port,
        settleMs: 5
    });

    try {
        const hints = { koboldUrl: kSrv.url, bridgeUrl: 'http://127.0.0.1:1', comfyUrl: 'http://127.0.0.1:1' };
        // Cloud LLM starts before local LLM releases (e.g. cloud reviewer waiting)
        coord.setCloudActivity(1);
        const l1 = await coord.acquireLease('llm', hints);
        coord.releaseLease(l1.leaseId);

        // Wait longer than 120ms while cloud activity is still 1 -> must NOT unload
        await new Promise((r) => setTimeout(r, 250));
        assert.equal(unloadCount, 0);
        assert.equal(koboldModel, 'local-story-12b.gguf');

        // Cloud LLM finishes -> idle timer starts and unloads local model
        coord.setCloudActivity(0);
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(unloadCount, 1);
        assert.equal(koboldModel, 'inactive');
    } finally {
        coord.dispose();
        await kSrv.close();
    }
});

test('nested same-modality leases are re-entrant and deadlock-free', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-reent-'));
    const settings = new DesktopSettings(userData);
    const coord = new VramCoordinator({
        settings,
        supervisor: { status: () => ({ status: 'stopped' }), stop: () => {} },
        controller: { layout: () => null },
        isPortOpenFn: async () => false,
        settleMs: 5
    });

    try {
        const outer = await coord.acquireLease('audio');
        const inner = await coord.acquireLease('audio');
        assert.equal(outer.reentrant, false);
        assert.equal(inner.reentrant, true);
        assert.equal(coord.totalActiveLeases(), 2);

        coord.releaseLease(inner.leaseId);
        assert.equal(coord.totalActiveLeases(), 1);
        assert.equal(coord.currentModality, 'audio');

        coord.releaseLease(outer.leaseId);
        assert.equal(coord.totalActiveLeases(), 0);
        assert.equal(coord.currentModality, null);
    } finally {
        coord.dispose();
    }
});

test('acquireLease(image) starts local ComfyUI on demand after offloading previous modality', async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vram-comfy-start-'));
    const settings = new DesktopSettings(userData);
    const callOrder = [];
    let comfyOpen = false;

    const kSrv = await startMockServer((req, res, body) => {
        if (req.url === '/api/v1/model') return sendJson(res, 200, { result: 'big-model.gguf' });
        if (req.url === '/api/admin/reload_config' && body?.filename === 'unload_model') {
            callOrder.push('offload:llm');
            return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, {});
    });

    const coord = new VramCoordinator({
        settings,
        supervisor: { status: () => ({ status: 'stopped' }), stop: () => {} },
        controller: {
            layout: () => null,
            ensureComfyRunning: async () => {
                callOrder.push('start:comfyui');
                comfyOpen = true;
                return { ready: true, started: true, status: 'running' };
            }
        },
        isPortOpenFn: async (port) => {
            if (port === kSrv.port) return true;
            if (port === 8188) return comfyOpen;
            return false;
        },
        settleMs: 5
    });

    try {
        const llmLease = await coord.acquireLease('llm', { koboldUrl: kSrv.url });
        coord.releaseLease(llmLease.leaseId);

        const imgLease = await coord.acquireLease('image', { comfyUrl: 'http://127.0.0.1:8188' });
        assert.equal(comfyOpen, true);
        assert.deepEqual(callOrder, ['offload:llm', 'start:comfyui']);
        coord.releaseLease(imgLease.leaseId);
    } finally {
        coord.dispose();
        await kSrv.close();
    }
});
