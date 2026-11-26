'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { DesktopSettings } = require('../lib/settings.cjs');
const {
    AppUpdater,
    compareVersions,
    isNewerVersion,
    detectInstallMode,
    parseSha256Sums,
    selectUpdateAsset,
    buildPortableUpdaterScript
} = require('../lib/updater.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ep-updater-'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function serve(routes) {
    const server = http.createServer((req, res) => {
        const route = routes[req.url];
        if (!route) {
            res.writeHead(404);
            return res.end('not found');
        }
        route(req, res);
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
        )
    );
}

test('semver comparison and install mode detection work cleanly', () => {
    assert.equal(compareVersions('2.3.0', '2.2.0'), 1);
    assert.equal(compareVersions('v2.2.0', '2.2.0'), 0);
    assert.equal(compareVersions('2.2.0-beta.1', '2.2.0'), -1);
    assert.equal(isNewerVersion('v2.2.1', '2.2.0'), true);
    assert.equal(isNewerVersion('2.2.0', '2.2.0'), false);

    assert.equal(detectInstallMode({ isPackaged: false, platform: 'win32' }), 'dev');
    assert.equal(
        detectInstallMode({ isPackaged: true, platform: 'win32', portableExecutableFile: 'C:\\Apps\\EllipsisProse.exe' }),
        'portable'
    );
    assert.equal(detectInstallMode({ isPackaged: true, platform: 'win32' }), 'nsis');
});

test('selectUpdateAsset picks NSIS setup vs portable exe and parses SHA256SUMS.txt', () => {
    const release = {
        tag_name: 'v2.3.0',
        assets: [
            {
                name: 'EllipsisProse-2.3.0-portable.exe',
                size: 90000000,
                browser_download_url: 'https://example.com/portable.exe',
                digest: 'sha256:' + 'a'.repeat(64)
            },
            {
                name: 'EllipsisProse-Setup-2.3.0.exe',
                size: 85000000,
                browser_download_url: 'https://example.com/setup.exe'
            },
            {
                name: 'SHA256SUMS.txt',
                size: 200,
                browser_download_url: 'https://example.com/SHA256SUMS.txt'
            }
        ]
    };

    const portable = selectUpdateAsset(release, 'portable');
    assert.equal(portable.asset.name, 'EllipsisProse-2.3.0-portable.exe');
    assert.equal(portable.asset.sha256, 'a'.repeat(64));

    const nsis = selectUpdateAsset(release, 'nsis');
    assert.equal(nsis.asset.name, 'EllipsisProse-Setup-2.3.0.exe');
    assert.equal(nsis.asset.sha256, null);
    assert.equal(nsis.sha256SumsUrl, 'https://example.com/SHA256SUMS.txt');

    const map = parseSha256Sums(`${'b'.repeat(64)}  EllipsisProse-Setup-2.3.0.exe\n`);
    assert.equal(map.get('ellipsisprose-setup-2.3.0.exe'), 'b'.repeat(64));
});

test('AppUpdater checks, verifies checksum via SHA256SUMS.txt, and downloads from local server', async () => {
    const userDataDir = tmp();
    const settings = new DesktopSettings(userDataDir);
    const payload = Buffer.from('fake-setup-installer-binary-content');
    const digest = sha(payload);

    const { server, base } = await serve({
        '/repos/pacmanincarnate/WriteforMe/releases/latest': (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    tag_name: 'v2.3.0',
                    name: 'EllipsisProse v2.3.0',
                    body: '## What\'s Changed\n* Auto update support',
                    html_url: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.3.0',
                    published_at: '2026-11-26T18:00:00Z',
                    assets: [
                        {
                            name: 'EllipsisProse-Setup-2.3.0.exe',
                            size: payload.length,
                            browser_download_url: `${base}/EllipsisProse-Setup-2.3.0.exe`
                        },
                        {
                            name: 'SHA256SUMS.txt',
                            size: 120,
                            browser_download_url: `${base}/SHA256SUMS.txt`
                        }
                    ]
                })
            );
        },
        '/EllipsisProse-Setup-2.3.0.exe': (_req, res) => {
            res.writeHead(200, { 'Content-Length': payload.length });
            res.end(payload);
        },
        '/SHA256SUMS.txt': (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`${digest}  EllipsisProse-Setup-2.3.0.exe\n`);
        }
    });

    try {
        const events = [];
        const updater = new AppUpdater({
            currentVersion: '2.2.0',
            installMode: 'nsis',
            userDataDir,
            settings,
            fetchRelease: async (repo) => {
                const r = await fetch(`${base}/repos/${repo}/releases/latest`);
                return r.json();
            },
            onChange: (st) => events.push(st.status)
        });

        const checked = await updater.check({ manual: false });
        assert.equal(checked.status, 'available');
        assert.equal(checked.latestVersion, '2.3.0');
        assert.equal(checked.asset.sha256, digest);
        assert.match(checked.changelog, /Auto update support/);

        const dl = await updater.download();
        assert.equal(dl.verified, true);
        assert.equal(dl.sha256, digest);
        assert.equal(fs.readFileSync(dl.filePath).toString(), payload.toString());
        assert.ok(events.includes('checking'));
        assert.ok(events.includes('downloading'));
        assert.ok(events.includes('verifying'));
    } finally {
        server.close();
    }
});

test('AppUpdater handles checksum mismatch, skipVersion persistence, and silent background failure', async () => {
    const userDataDir = tmp();
    const settings = new DesktopSettings(userDataDir);
    const payload = Buffer.from('corrupted-binary');

    const { server, base } = await serve({
        '/bad.exe': (_req, res) => {
            res.writeHead(200, { 'Content-Length': payload.length });
            res.end(payload);
        }
    });

    try {
        const failingUpdater = new AppUpdater({
            currentVersion: '2.2.0',
            installMode: 'nsis',
            userDataDir,
            settings,
            fetchRelease: async () => {
                throw new Error('Offline');
            }
        });

        const autoRes = await failingUpdater.check({ manual: false });
        assert.equal(autoRes.status, 'idle');
        assert.equal(autoRes.error, null);

        const manualRes = await failingUpdater.check({ manual: true });
        assert.equal(manualRes.status, 'error');
        assert.match(manualRes.error, /Offline/);

        const mismatchUpdater = new AppUpdater({
            currentVersion: '2.2.0',
            installMode: 'nsis',
            userDataDir,
            settings,
            fetchRelease: async () => ({
                tag_name: 'v2.4.0',
                body: 'Release notes',
                assets: [
                    {
                        name: 'EllipsisProse-Setup-2.4.0.exe',
                        size: payload.length,
                        browser_download_url: `${base}/bad.exe`,
                        digest: `sha256:${'f'.repeat(64)}`
                    }
                ]
            })
        });

        const avail = await mismatchUpdater.check({ manual: false });
        assert.equal(avail.status, 'available');
        await assert.rejects(mismatchUpdater.download(), /Checksum mismatch/);
        assert.equal(mismatchUpdater.getState().status, 'error');

        const skipped = mismatchUpdater.skipVersion('2.4.0');
        assert.equal(skipped.skippedVersion, '2.4.0');
        const recheckAuto = await mismatchUpdater.check({ manual: false });
        assert.equal(recheckAuto.isSkipped, true);
        const recheckManual = await mismatchUpdater.check({ manual: true });
        assert.equal(recheckManual.isSkipped, false);
    } finally {
        server.close();
    }
});

test('buildPortableUpdaterScript handles versioned and custom portable executable names', () => {
    const versioned = buildPortableUpdaterScript({
        downloadedPath: 'C:\\Users\\test\\AppData\\Roaming\\EllipsisProse\\updates\\EllipsisProse-2.3.0-portable.exe',
        currentExePath: 'D:\\Portable\\EllipsisProse-2.2.0-portable.exe',
        newAssetName: 'EllipsisProse-2.3.0-portable.exe',
        pid: 4242
    });
    assert.equal(versioned.targetExePath, 'D:\\Portable\\EllipsisProse-2.3.0-portable.exe');
    assert.match(versioned.script, /PID eq 4242/);
    assert.match(versioned.script, /start "" "D:\\Portable\\EllipsisProse-2\.3\.0-portable\.exe"/);

    const customNamed = buildPortableUpdaterScript({
        downloadedPath: 'C:\\Users\\test\\AppData\\Roaming\\EllipsisProse\\updates\\EllipsisProse-2.3.0-portable.exe',
        currentExePath: 'D:\\Portable\\MyWriter.exe',
        newAssetName: 'EllipsisProse-2.3.0-portable.exe',
        pid: 9999
    });
    assert.equal(customNamed.targetExePath, 'D:\\Portable\\MyWriter.exe');
    assert.match(customNamed.script, /MyWriter\.exe\.old/);
    assert.match(customNamed.script, /start "" "D:\\Portable\\MyWriter\.exe"/);
});
