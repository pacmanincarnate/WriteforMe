'use strict';

/**
 * Installs a backend into <backendsDir>/<id>/ and remembers what was installed in
 * <backendsDir>/installed.json. Extraction uses the 7-Zip binary from the `7zip-bin` package,
 * which handles both .zip and .7z and ships inside the installer (LGPL-2.1, see THIRD_PARTY.md).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getBackend, getVariant, selectAssets, assetSha256 } = require('./backends.cjs');
const { downloadFile, latestRelease } = require('./download.cjs');

function sevenZipPath() {
    // eslint-disable-next-line global-require
    let p = require('7zip-bin').path7za;
    // Inside a packaged app the binary is unpacked next to app.asar.
    p = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    if (process.platform !== 'win32') {
        // npm does not always keep the exec bit on this package's binaries.
        try { fs.accessSync(p, fs.constants.X_OK); } catch (_) { try { fs.chmodSync(p, 0o755); } catch (__) { /* report on spawn */ } }
    }
    return p;
}

function extract(archive, destDir, { sevenZip = sevenZipPath() } = {}) {
    fs.mkdirSync(destDir, { recursive: true });
    return new Promise((resolve, reject) => {
        const proc = spawn(sevenZip, ['x', archive, `-o${destDir}`, '-y', '-bso0', '-bsp0'], { windowsHide: true });
        let err = '';
        proc.stderr.on('data', (d) => { err += d; });
        proc.on('error', reject);
        proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`7-Zip exited with ${code}: ${err.trim()}`))));
    });
}

/** Breadth-first search for a file name, a few levels deep. */
function findFile(root, names, maxDepth = 4) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    let level = [root];
    for (let depth = 0; depth <= maxDepth && level.length; depth++) {
        const next = [];
        for (const dir of level) {
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isFile() && wanted.has(e.name.toLowerCase())) return full;
                if (e.isDirectory()) next.push(full);
            }
        }
        level = next;
    }
    return null;
}

/** Where the runnable parts of an installed backend are. Null when not (fully) installed. */
function findInstallLayout(backendId, dir) {
    if (!fs.existsSync(dir)) return null;
    if (backendId === 'koboldcpp') {
        const exe = findFile(dir, ['koboldcpp.exe', 'koboldcpp-nocuda.exe', 'koboldcpp-oldpc.exe', 'koboldcpp-linux-x64', 'koboldcpp'], 1);
        return exe ? { exe } : null;
    }
    if (backendId === 'comfyui') {
        const python = findFile(dir, ['python.exe'], 3);
        if (!python || path.basename(path.dirname(python)).toLowerCase() !== 'python_embeded') return null;
        const root = path.dirname(path.dirname(python));
        if (!fs.existsSync(path.join(root, 'ComfyUI', 'main.py'))) return null;
        return { python, root, models: path.join(root, 'ComfyUI', 'models') };
    }
    if (backendId === 'audiocpp') {
        const exe = findFile(dir, ['audiocpp_server.exe', 'audiocpp_server'], 4);
        return exe ? { exe, binDir: path.dirname(exe) } : null;
    }
    return null;
}

function readInstalled(backendsDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(backendsDir, 'installed.json'), 'utf8')) || {};
    } catch (_) {
        return {};
    }
}

function writeInstalled(backendsDir, data) {
    fs.mkdirSync(backendsDir, { recursive: true });
    const file = path.join(backendsDir, 'installed.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
}

/**
 * Downloads and unpacks one backend. Progress events: { phase, file, received, total }.
 * A previous install of the same backend is replaced only after the new one unpacked cleanly.
 */
async function installBackend({ backendsDir, backendId, variantId, onProgress = () => {}, signal, fetchRelease = latestRelease, sevenZip }) {
    const backend = getBackend(backendId);
    const variant = getVariant(backend, variantId);
    onProgress({ phase: 'release', file: backend.repo });
    const release = await fetchRelease(backend.repo, { signal });
    const { asset, extras } = selectAssets(release, variant);

    const downloadsDir = path.join(backendsDir, '_downloads');
    const finalDir = path.join(backendsDir, backend.id);
    const stagingDir = path.join(backendsDir, `${backend.id}.new`);
    fs.rmSync(stagingDir, { recursive: true, force: true });

    const files = [];
    for (const a of [asset, ...extras]) {
        const dest = path.join(downloadsDir, a.name);
        const res = await downloadFile({
            url: a.browser_download_url,
            dest,
            sha256: assetSha256(a),
            signal,
            onProgress: (p) => onProgress({ phase: 'download', file: a.name, ...p })
        });
        files.push({ name: a.name, size: res.bytes, sha256: res.sha256, verified: res.verified, path: dest });
    }

    for (const f of files) {
        if (backend.kind === 'exe' && f.name === asset.name) {
            fs.mkdirSync(stagingDir, { recursive: true });
            fs.copyFileSync(f.path, path.join(stagingDir, f.name));
        } else {
            onProgress({ phase: 'extract', file: f.name });
            await extract(f.path, stagingDir, sevenZip ? { sevenZip } : undefined);
        }
    }

    const layout = findInstallLayout(backend.id, stagingDir);
    if (!layout) {
        throw new Error(`${backend.name} unpacked, but the expected program files were not found in ${asset.name}. Upstream may have changed its package layout.`);
    }

    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, finalDir);
    for (const f of files) fs.rmSync(f.path, { force: true });

    const installed = readInstalled(backendsDir);
    installed[backend.id] = {
        variant: variant.id,
        tag: release.tag_name || null,
        installedAt: new Date().toISOString(),
        files: files.map(({ name, size, sha256, verified }) => ({ name, size, sha256, verified }))
    };
    writeInstalled(backendsDir, installed);
    onProgress({ phase: 'done', file: asset.name });
    return { layout: findInstallLayout(backend.id, finalDir), record: installed[backend.id] };
}

module.exports = { installBackend, findInstallLayout, readInstalled, writeInstalled, extract, findFile, sevenZipPath };
