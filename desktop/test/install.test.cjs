'use strict';

/**
 * End-to-end install flow against a local HTTP server that plays GitHub: release JSON, assets
 * with digests, a dropped connection to test resume, and real archives unpacked by 7-Zip.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { downloadFile } = require('../lib/download.cjs');
const { installBackend, findInstallLayout, readInstalled, sevenZipPath } = require('../lib/install.cjs');
const { Controller } = require('../lib/controller.cjs');
const { Supervisor } = require('../lib/supervisor.cjs');
const { DesktopSettings } = require('../lib/settings.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ep-desktop-'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function serve(routes) {
    const hits = [];
    const server = http.createServer((req, res) => {
        hits.push({ url: req.url, range: req.headers.range || null });
        const route = routes[req.url];
        if (!route) { res.writeHead(404); return res.end('nope'); }
        route(req, res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}` })));
}

function sendBytes(buf, { dropAfter = null } = {}) {
    return (req, res) => {
        const m = /bytes=(\d+)-/.exec(req.headers.range || '');
        const start = m ? Number(m[1]) : 0;
        if (start >= buf.length) { res.writeHead(416); return res.end(); }
        const body = buf.subarray(start);
        res.writeHead(m ? 206 : 200, { 'Content-Length': body.length, 'Accept-Ranges': 'bytes' });
        if (dropAfter !== null && !m) {
            res.write(body.subarray(0, dropAfter));
            setTimeout(() => res.destroy(), 20);
            return;
        }
        res.end(body);
    };
}

test('download resumes from a .part file after the connection drops', async () => {
    const data = crypto.randomBytes(300 * 1024);
    const { server, hits, base } = await serve({ '/big.bin': sendBytes(data, { dropAfter: 100 * 1024 }) });
    const dir = tmp();
    const dest = path.join(dir, 'big.bin');
    await assert.rejects(downloadFile({ url: `${base}/big.bin`, dest }));
    assert.ok(fs.existsSync(`${dest}.part`));
    const res = await downloadFile({ url: `${base}/big.bin`, dest, sha256: sha(data) });
    assert.equal(res.verified, true);
    assert.equal(sha(fs.readFileSync(dest)), sha(data));
    assert.ok(hits.some((h) => h.range && h.range.startsWith('bytes=')), 'second request used a range');
    server.close();
});

test('a checksum mismatch deletes the file and fails', async () => {
    const data = Buffer.from('hello');
    const { server, base } = await serve({ '/f': sendBytes(data) });
    const dest = path.join(tmp(), 'f');
    await assert.rejects(downloadFile({ url: `${base}/f`, dest, sha256: 'b'.repeat(64) }), /Checksum mismatch/);
    assert.ok(!fs.existsSync(dest) && !fs.existsSync(`${dest}.part`));
    server.close();
});

test('redirects are followed (GitHub sends assets via a CDN redirect)', async () => {
    const data = Buffer.from('payload');
    const { server, base } = await serve({
        '/r': (req, res) => { res.writeHead(302, { Location: '/real' }); res.end(); },
        '/real': sendBytes(data)
    });
    const dest = path.join(tmp(), 'r');
    await downloadFile({ url: `${base}/r`, dest });
    assert.equal(fs.readFileSync(dest, 'utf8'), 'payload');
    server.close();
});

function makeArchive(srcDir, archive) {
    const r = spawnSync(sevenZipPath(), ['a', archive, '.'], { cwd: srcDir });
    assert.equal(r.status, 0, String(r.stderr));
    return fs.readFileSync(archive);
}

test('installs ComfyUI (7z) and audio.cpp (zip + CUDA runtime) and records what it installed', async () => {
    const work = tmp();
    // A fake ComfyUI portable tree.
    const comfySrc = path.join(work, 'comfy-src', 'ComfyUI_windows_portable');
    fs.mkdirSync(path.join(comfySrc, 'python_embeded'), { recursive: true });
    fs.mkdirSync(path.join(comfySrc, 'ComfyUI', 'models'), { recursive: true });
    fs.writeFileSync(path.join(comfySrc, 'python_embeded', 'python.exe'), 'py');
    fs.writeFileSync(path.join(comfySrc, 'ComfyUI', 'main.py'), 'print(1)');
    const comfy7z = makeArchive(path.join(work, 'comfy-src'), path.join(work, 'c.7z'));
    // A fake audio.cpp build and its CUDA runtime.
    const audioSrc = path.join(work, 'audio-src', 'bin');
    fs.mkdirSync(audioSrc, { recursive: true });
    fs.writeFileSync(path.join(audioSrc, 'audiocpp_server.exe'), 'exe');
    const audioZip = makeArchive(path.join(work, 'audio-src'), path.join(work, 'a.zip'));
    const rtSrc = path.join(work, 'rt-src', 'bin');
    fs.mkdirSync(rtSrc, { recursive: true });
    fs.writeFileSync(path.join(rtSrc, 'cudart64_12.dll'), 'dll');
    const rtZip = makeArchive(path.join(work, 'rt-src'), path.join(work, 'rt.zip'));

    let base = '';
    const routes = {
        '/c.7z': sendBytes(comfy7z),
        '/a.zip': sendBytes(audioZip),
        '/rt.zip': sendBytes(rtZip)
    };
    const srv = await serve(routes);
    base = srv.base;
    const releases = {
        'Comfy-Org/ComfyUI': { tag_name: 'v0.9.9', assets: [{ name: 'ComfyUI_windows_portable_nvidia.7z', browser_download_url: `${base}/c.7z`, digest: `sha256:${sha(comfy7z)}` }] },
        '0xShug0/audio.cpp': {
            tag_name: 'v0.9.0',
            assets: [
                { name: 'audio-v0.9.0-bin-windows-x64-cuda12.4.zip', browser_download_url: `${base}/a.zip` },
                { name: 'cudart-audio-v0.9.0-bin-windows-x64-cuda12.4.zip', browser_download_url: `${base}/rt.zip` }
            ]
        }
    };
    const fetchRelease = async (repo) => releases[repo];
    const backendsDir = path.join(work, 'backends');

    const phases = [];
    const comfy = await installBackend({ backendsDir, backendId: 'comfyui', variantId: 'nvidia', fetchRelease, onProgress: (p) => phases.push(p.phase) });
    assert.ok(comfy.layout.python.endsWith(path.join('python_embeded', 'python.exe')));
    assert.ok(fs.existsSync(path.join(comfy.layout.root, 'ComfyUI', 'main.py')));
    assert.ok(phases.includes('download') && phases.includes('extract') && phases.at(-1) === 'done');

    const audio = await installBackend({ backendsDir, backendId: 'audiocpp', variantId: 'cuda', fetchRelease });
    assert.ok(fs.existsSync(path.join(audio.layout.binDir, 'cudart64_12.dll')), 'runtime unpacked next to the server');

    const rec = readInstalled(backendsDir);
    assert.equal(rec.comfyui.tag, 'v0.9.9');
    assert.equal(rec.comfyui.files[0].verified, true);
    assert.equal(rec.audiocpp.files.length, 2);
    assert.equal(rec.audiocpp.files[0].verified, false);
    assert.ok(!fs.existsSync(path.join(backendsDir, '_downloads', 'ComfyUI_windows_portable_nvidia.7z')), 'archives are cleaned up');

    // Controller: the audio bridge is started with presets rewritten for this install.
    const userData = path.join(work, 'userdata');
    const settings = new DesktopSettings(userData);
    settings.update({ backendsDir });
    const repoRoot = path.resolve(__dirname, '..', '..');
    const ctl = new Controller({ settings, supervisor: new Supervisor(), appFilesDir: repoRoot, dataDir: path.join(userData, 'data'), node: { command: process.execPath, env: {} } });
    const spec = ctl.serviceSpec('audiocpp');
    assert.equal(spec.env.ELLIPSISPROSE_AUDIOCPP_DIR, audio.layout.binDir);
    const wave1 = JSON.parse(fs.readFileSync(path.join(spec.env.ELLIPSISPROSE_AUDIOCPP_CONFIG_DIR, 'config_wave1_breeze.json'), 'utf8'));
    assert.equal(wave1.models[0].path, path.join(settings.audioModelsDir, 'breeze2', 'breeze-tts-2-q8_0.gguf'));
    const listed = ctl.list();
    assert.equal(listed.backends.find((b) => b.id === 'comfyui').installed.tag, 'v0.9.9');
    assert.equal(listed.backends.find((b) => b.id === 'koboldcpp').installed, null);
    assert.equal(ctl.serviceSpec('koboldcpp'), null);
    srv.server.close();
});

test('a package without the expected program leaves the old install alone', async () => {
    const work = tmp();
    const src = path.join(work, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'README.txt'), 'no exe here');
    const zip = makeArchive(src, path.join(work, 'x.zip'));
    const srv = await serve({ '/x.zip': sendBytes(zip) });
    const backendsDir = path.join(work, 'backends');
    const keep = path.join(backendsDir, 'audiocpp', 'bin');
    fs.mkdirSync(keep, { recursive: true });
    fs.writeFileSync(path.join(keep, 'audiocpp_server.exe'), 'old');
    const fetchRelease = async () => ({ tag_name: 'v1', assets: [{ name: 'audio-v1-bin-windows-x64-cpu.zip', browser_download_url: `${srv.base}/x.zip` }] });
    await assert.rejects(installBackend({ backendsDir, backendId: 'audiocpp', variantId: 'cpu', fetchRelease }), /expected program files/);
    assert.ok(findInstallLayout('audiocpp', path.join(backendsDir, 'audiocpp')), 'old install still there');
    srv.server.close();
});
