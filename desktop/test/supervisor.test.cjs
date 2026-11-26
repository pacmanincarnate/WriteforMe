'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { Supervisor, isPortOpen } = require('../lib/supervisor.cjs');
const { Controller } = require('../lib/controller.cjs');
const { DesktopSettings } = require('../lib/settings.cjs');

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
}

test('starts a service, waits for health, and stops its process tree', async () => {
    const port = await freePort();
    const script = `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1',()=>console.log('up'))`;
    const sup = new Supervisor();
    const svc = await sup.start('t', { command: process.execPath, args: ['-e', script], healthUrl: `http://127.0.0.1:${port}/`, port, readyTimeoutMs: 10000 });
    assert.equal(svc.status, 'running');
    assert.ok(svc.log.includes('up'));
    sup.stop('t');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await isPortOpen(port), false);
});

test('an occupied port is reused, not fought over', async () => {
    const port = await freePort();
    const srv = net.createServer().listen(port, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const sup = new Supervisor();
    const svc = await sup.start('t', { command: process.execPath, args: ['-e', 'setTimeout(()=>{},1e6)'], port });
    assert.equal(svc.status, 'external');
    assert.equal(svc.child, null);
    srv.close();
});

test('a crashing service is reported as failed with its output', async () => {
    const sup = new Supervisor();
    const svc = await sup.start('t', { command: process.execPath, args: ['-e', 'console.error("boom"); process.exit(3)'], healthUrl: 'http://127.0.0.1:9/', readyTimeoutMs: 5000 });
    assert.equal(svc.status, 'failed');
    assert.ok(svc.log.some((l) => l.includes('boom')));
});

test('the real server.js starts from the desktop spec and serves its storage API', async () => {
    const port = await freePort();
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-web-'));
    const settings = new DesktopSettings(userData);
    settings.webPort = port;
    const sup = new Supervisor();
    const repoRoot = path.resolve(__dirname, '..', '..');
    const ctl = new Controller({ settings, supervisor: sup, appFilesDir: repoRoot, dataDir: path.join(userData, 'data'), node: { command: process.execPath, env: {} } });
    const svc = await sup.start('web', ctl.serviceSpec('web'));
    try {
        assert.equal(svc.status, 'running', svc.log.join('\n'));
        assert.ok(fs.existsSync(path.join(userData, 'data', 'stories')), 'vault lives in the user data folder');
    } finally {
        sup.stopAll();
    }
});
