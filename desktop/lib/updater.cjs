'use strict';

/**
 * Desktop self-updater for EllipsisProse (NSIS installer & portable exe).
 * Pure Node CommonJS with zero Electron imports so it can be unit-tested with `node --test`.
 */

const fs = require('fs');
const path = require('path');
const { downloadFile, latestRelease, request } = require('./download.cjs');

const DEFAULT_REPO = 'pacmanincarnate/WriteforMe';
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(raw) {
    const match = SEMVER_RE.exec(String(raw || '').trim());
    if (!match) return null;
    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4] ? match[4].split('.').filter(Boolean) : []
    };
}

function comparePre(a, b) {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) {
        const d = Number.parseInt(a, 10) - Number.parseInt(b, 10);
        return d === 0 ? 0 : d < 0 ? -1 : 1;
    }
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) {
        const sa = String(a || '').trim().replace(/^v/i, '');
        const sb = String(b || '').trim().replace(/^v/i, '');
        if (sa === sb) return 0;
        return sa < sb ? -1 : 1;
    }
    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
    if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
    if (pa.prerelease.length === 0) return 1;
    if (pb.prerelease.length === 0) return -1;
    const len = Math.max(pa.prerelease.length, pb.prerelease.length);
    for (let i = 0; i < len; i++) {
        const ai = pa.prerelease[i];
        const bi = pb.prerelease[i];
        if (ai === undefined) return -1;
        if (bi === undefined) return 1;
        const c = comparePre(ai, bi);
        if (c !== 0) return c;
    }
    return 0;
}

function isNewerVersion(candidate, current) {
    if (!candidate || !current) return false;
    return compareVersions(candidate, current) > 0;
}

function detectInstallMode({ isPackaged = false, platform = process.platform, portableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE } = {}) {
    if (!isPackaged) return 'dev';
    if (portableExecutableFile) return 'portable';
    if (platform === 'win32') return 'nsis';
    return 'dev';
}

function parseSha256Sums(text) {
    const map = new Map();
    for (const line of String(text || '').split(/\r?\n/)) {
        const m = /^([a-f0-9]{64})\s+[* ]?(.+)$/i.exec(line.trim());
        if (!m) continue;
        const fileName = path.win32.basename(m[2].trim()).toLowerCase();
        map.set(fileName, m[1].toLowerCase());
    }
    return map;
}

function extractAssetSha256(asset) {
    if (!asset || typeof asset.digest !== 'string') return null;
    const m = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest.trim());
    return m ? m[1].toLowerCase() : null;
}

function selectUpdateAsset(release, installMode = 'nsis') {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const exeAssets = assets.filter((a) => typeof a?.name === 'string' && /\.exe$/i.test(a.name));
    let selected = null;
    if (installMode === 'portable') {
        selected =
            exeAssets.find((a) => /^EllipsisProse-.*-portable\.exe$/i.test(a.name)) ||
            exeAssets.find((a) => /portable/i.test(a.name)) ||
            null;
    } else {
        selected =
            exeAssets.find((a) => /^EllipsisProse-Setup-.*\.exe$/i.test(a.name)) ||
            exeAssets.find((a) => !/portable/i.test(a.name)) ||
            null;
    }
    const sumsAsset = assets.find((a) => typeof a?.name === 'string' && /^SHA256SUMS\.txt$/i.test(a.name)) || null;
    if (!selected) {
        return { asset: null, sha256SumsUrl: sumsAsset?.browser_download_url || null };
    }
    return {
        asset: {
            name: selected.name,
            size: Number.isFinite(Number(selected.size)) ? Number(selected.size) : null,
            downloadUrl: selected.browser_download_url,
            sha256: extractAssetSha256(selected)
        },
        sha256SumsUrl: sumsAsset?.browser_download_url || null
    };
}

async function defaultFetchText(url, opts = {}) {
    const res = await request(url, opts);
    let body = '';
    for await (const chunk of res) body += chunk;
    if ((res.statusCode || 0) >= 400) {
        throw new Error(`HTTP ${res.statusCode} fetching ${url}`);
    }
    return body;
}

function escapeCmdArg(value) {
    return String(value || '').replace(/"/g, '');
}

/**
 * Generates a Windows `.cmd` helper that waits for the current process to exit,
 * swaps or upgrades the portable executable, relaunches it, and removes itself.
 */
function buildPortableUpdaterScript({ downloadedPath, currentExePath, newAssetName, pid }) {
    const dir = path.win32.dirname(currentExePath);
    const currentBase = path.win32.basename(currentExePath);
    const safeNewName = path.win32.basename(newAssetName || currentBase);
    const isVersionedExe = /^EllipsisProse-\d+\.\d+\.\d+.*-portable\.exe$/i.test(currentBase);
    const useNewFilename = isVersionedExe && safeNewName.toLowerCase() !== currentBase.toLowerCase();
    const targetExePath = useNewFilename ? path.win32.join(dir, safeNewName) : currentExePath;
    const backupExePath = `${currentExePath}.old`;

    const dPath = escapeCmdArg(downloadedPath);
    const cPath = escapeCmdArg(currentExePath);
    const tPath = escapeCmdArg(targetExePath);
    const bPath = escapeCmdArg(backupExePath);
    const numericPid = Number.parseInt(String(pid || process.pid), 10) || process.pid;

    const lines = [
        '@echo off',
        'setlocal enableextensions',
        'set /a tries=0',
        ':waitloop',
        `tasklist /FI "PID eq ${numericPid}" 2>NUL | find /I "${numericPid}" >NUL`,
        'if %errorlevel%==0 (',
        '  set /a tries+=1',
        '  if %tries% GEQ 30 goto done_wait',
        '  timeout /t 1 /nobreak >NUL',
        '  goto waitloop',
        ')',
        ':done_wait',
        'ping 127.0.0.1 -n 2 >NUL'
    ];

    if (useNewFilename) {
        lines.push(
            `copy /Y "${dPath}" "${tPath}" >NUL`,
            'if errorlevel 1 goto fail_launch',
            `del /F /Q "${dPath}" >NUL 2>NUL`,
            `del /F /Q "${cPath}" >NUL 2>NUL`
        );
    } else {
        lines.push(
            `if exist "${bPath}" del /F /Q "${bPath}" >NUL 2>NUL`,
            `move /Y "${cPath}" "${bPath}" >NUL`,
            `copy /Y "${dPath}" "${tPath}" >NUL`,
            'if errorlevel 1 (',
            `  if exist "${bPath}" move /Y "${bPath}" "${cPath}" >NUL 2>NUL`,
            '  goto fail_launch',
            ')',
            `del /F /Q "${bPath}" >NUL 2>NUL`,
            `del /F /Q "${dPath}" >NUL 2>NUL`
        );
    }

    lines.push(
        `start "" "${tPath}"`,
        'del "%~f0" >NUL 2>NUL',
        'exit /b 0',
        ':fail_launch',
        `if exist "${cPath}" start "" "${cPath}"`,
        'del "%~f0" >NUL 2>NUL',
        'exit /b 1'
    );

    return {
        targetExePath,
        script: lines.join('\r\n') + '\r\n'
    };
}

class AppUpdater {
    constructor({
        currentVersion,
        installMode = 'nsis',
        userDataDir,
        settings,
        repo = DEFAULT_REPO,
        fetchRelease = latestRelease,
        fetchText = defaultFetchText,
        downloadFileImpl = downloadFile,
        onChange = () => {}
    }) {
        this.currentVersion = String(currentVersion || '0.0.0-dev').replace(/^v/i, '');
        this.installMode = installMode;
        this.userDataDir = userDataDir;
        this.settings = settings;
        this.repo = repo;
        this.fetchRelease = fetchRelease;
        this.fetchText = fetchText;
        this.downloadFileImpl = downloadFileImpl;
        this.onChange = onChange;

        this._checkPromise = null;
        this._downloadAbort = null;
        this._checkAbort = null;

        const skippedVersion = String(this.settings?.data?.updates?.skippedVersion || '').replace(/^v/i, '');
        this.state = {
            status: 'idle',
            manual: false,
            currentVersion: this.currentVersion,
            latestVersion: null,
            releaseName: null,
            changelog: '',
            releaseUrl: null,
            publishedAt: null,
            installMode: this.installMode,
            asset: null,
            progress: null,
            error: null,
            filePath: null,
            skippedVersion,
            isSkipped: false,
            checkedAt: null
        };
    }

    getState() {
        return {
            ...this.state,
            asset: this.state.asset ? { ...this.state.asset } : null,
            progress: this.state.progress ? { ...this.state.progress } : null
        };
    }

    _emit(patch = {}) {
        Object.assign(this.state, patch);
        this.onChange(this.getState());
    }

    async check({ manual = false } = {}) {
        if (this._checkPromise) return this._checkPromise;

        this._checkAbort = new AbortController();
        const signal = this._checkAbort.signal;

        this._emit({
            status: 'checking',
            manual: Boolean(manual),
            error: null,
            progress: null
        });

        this._checkPromise = (async () => {
            try {
                if (this.currentVersion === '0.0.0-dev' && !manual) {
                    const skippedVersion = String(this.settings?.data?.updates?.skippedVersion || '').replace(/^v/i, '');
                    this._emit({
                        status: 'up-to-date',
                        latestVersion: this.currentVersion,
                        skippedVersion,
                        isSkipped: false,
                        checkedAt: new Date().toISOString()
                    });
                    return this.getState();
                }

                const release = await this.fetchRelease(this.repo, { signal });
                const latestVersion = String(release?.tag_name || '').trim().replace(/^v/i, '');
                if (!latestVersion) {
                    throw new Error('Latest release did not include a version tag.');
                }

                const skippedVersion = String(this.settings?.data?.updates?.skippedVersion || '').replace(/^v/i, '');
                const checkedAt = new Date().toISOString();

                if (!isNewerVersion(latestVersion, this.currentVersion)) {
                    this._emit({
                        status: 'up-to-date',
                        latestVersion,
                        releaseName: release.name || `EllipsisProse v${latestVersion}`,
                        changelog: typeof release.body === 'string' ? release.body : '',
                        releaseUrl: release.html_url || `https://github.com/${this.repo}/releases`,
                        publishedAt: release.published_at || null,
                        asset: null,
                        skippedVersion,
                        isSkipped: false,
                        checkedAt
                    });
                    return this.getState();
                }

                const { asset, sha256SumsUrl } = selectUpdateAsset(release, this.installMode);
                if (asset && !asset.sha256 && sha256SumsUrl) {
                    try {
                        const sumsText = await this.fetchText(sha256SumsUrl, { signal });
                        const sumsMap = parseSha256Sums(sumsText);
                        const found = sumsMap.get(asset.name.toLowerCase());
                        if (found) asset.sha256 = found;
                    } catch {
                        // Best-effort checksum lookup
                    }
                }

                this._emit({
                    status: 'available',
                    latestVersion,
                    releaseName: release.name || `EllipsisProse v${latestVersion}`,
                    changelog: typeof release.body === 'string' ? release.body : '',
                    releaseUrl: release.html_url || `https://github.com/${this.repo}/releases`,
                    publishedAt: release.published_at || null,
                    asset,
                    skippedVersion,
                    isSkipped: !manual && Boolean(skippedVersion && skippedVersion === latestVersion),
                    checkedAt
                });
                return this.getState();
            } catch (err) {
                if (manual) {
                    this._emit({
                        status: 'error',
                        error: err?.message || 'Update check failed.',
                        checkedAt: new Date().toISOString()
                    });
                } else {
                    this._emit({
                        status: 'idle',
                        error: null
                    });
                }
                return this.getState();
            } finally {
                this._checkPromise = null;
                this._checkAbort = null;
            }
        })();

        return this._checkPromise;
    }

    async download() {
        if (!this.state.asset || !this.state.asset.downloadUrl) {
            const msg = 'No compatible Windows installer or portable package was found on this release.';
            this._emit({ status: 'error', error: msg });
            throw new Error(msg);
        }

        const updatesDir = path.join(this.userDataDir, 'updates');
        fs.mkdirSync(updatesDir, { recursive: true });
        const targetName = path.basename(this.state.asset.name);
        const dest = path.join(updatesDir, targetName);

        // Clean stale update files from previous versions while keeping .part for current target so resume works.
        try {
            for (const entry of fs.readdirSync(updatesDir)) {
                if (entry === targetName || entry === `${targetName}.part`) continue;
                if (entry.endsWith('.exe') || entry.endsWith('.exe.part')) {
                    fs.rmSync(path.join(updatesDir, entry), { force: true });
                }
            }
        } catch {
            // Non-fatal cleanup
        }

        const ac = new AbortController();
        this._downloadAbort = ac;

        this._emit({
            status: 'downloading',
            error: null,
            filePath: null,
            progress: {
                phase: 'downloading',
                file: targetName,
                received: 0,
                total: this.state.asset.size || null,
                percent: 0
            }
        });

        try {
            const res = await this.downloadFileImpl({
                url: this.state.asset.downloadUrl,
                dest,
                sha256: this.state.asset.sha256 || null,
                signal: ac.signal,
                onProgress: ({ received, total }) => {
                    const effectiveTotal = total || this.state.asset?.size || null;
                    const percent =
                        effectiveTotal && effectiveTotal > 0
                            ? Math.min(100, Math.round((received / effectiveTotal) * 100))
                            : null;
                    this._emit({
                        status: 'downloading',
                        progress: {
                            phase: 'downloading',
                            file: targetName,
                            received,
                            total: effectiveTotal,
                            percent
                        }
                    });
                }
            });

            this._emit({
                status: 'verifying',
                filePath: res.path,
                progress: {
                    phase: 'verifying',
                    file: targetName,
                    received: res.bytes,
                    total: res.bytes,
                    percent: 100
                }
            });

            return {
                filePath: res.path,
                sha256: res.sha256,
                bytes: res.bytes,
                verified: res.verified
            };
        } catch (err) {
            if (ac.signal.aborted || err?.message === 'Cancelled') {
                this._emit({
                    status: 'available',
                    progress: null,
                    error: null
                });
                throw new Error('Cancelled');
            }
            this._emit({
                status: 'error',
                progress: null,
                error: err?.message || 'Download failed.'
            });
            throw err;
        } finally {
            if (this._downloadAbort === ac) this._downloadAbort = null;
        }
    }

    cancel() {
        if (this._downloadAbort) {
            this._downloadAbort.abort();
        }
        if (this._checkAbort) {
            this._checkAbort.abort();
        }
    }

    skipVersion(version) {
        const normalized = String(version || this.state.latestVersion || '').trim().replace(/^v/i, '');
        if (this.settings && typeof this.settings.update === 'function') {
            this.settings.update({ updates: { skippedVersion: normalized } });
        }
        this._emit({
            skippedVersion: normalized,
            isSkipped: Boolean(normalized && this.state.latestVersion === normalized)
        });
        return this.getState();
    }

    setInstalling() {
        this._emit({
            status: 'installing',
            error: null,
            progress: {
                phase: 'installing',
                file: this.state.asset?.name || '',
                received: this.state.progress?.received || 0,
                total: this.state.progress?.total || null,
                percent: 100
            }
        });
    }

    setDownloadedManual(filePath) {
        this._emit({
            status: 'downloaded-manual',
            filePath,
            progress: null,
            error: null
        });
    }

    setError(message) {
        this._emit({
            status: 'error',
            progress: null,
            error: message || 'Update failed.'
        });
    }
}

module.exports = {
    DEFAULT_REPO,
    parseVersion,
    compareVersions,
    isNewerVersion,
    detectInstallMode,
    parseSha256Sums,
    selectUpdateAsset,
    buildPortableUpdaterScript,
    AppUpdater
};
