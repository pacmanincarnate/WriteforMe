'use strict';

/**
 * Resumable HTTPS download with progress and SHA-256 verification. Uses only Node built-ins so
 * it runs the same in Electron's main process and in plain `node --test`.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const USER_AGENT = 'EllipsisProse-Desktop';

function client(url) {
    return url.startsWith('http:') ? http : https;
}

/** GET that follows redirects and resolves with the final response. */
function request(url, { headers = {}, signal, maxRedirects = 10 } = {}) {
    return new Promise((resolve, reject) => {
        const req = client(url).get(url, { headers: { 'User-Agent': USER_AGENT, ...headers } }, (res) => {
            const status = res.statusCode || 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                if (maxRedirects <= 0) return reject(new Error(`Too many redirects for ${url}`));
                const next = new URL(res.headers.location, url).toString();
                return resolve(request(next, { headers, signal, maxRedirects: maxRedirects - 1 }));
            }
            resolve(res);
        });
        req.on('error', reject);
        if (signal) {
            if (signal.aborted) req.destroy(new Error('Cancelled'));
            signal.addEventListener('abort', () => req.destroy(new Error('Cancelled')), { once: true });
        }
    });
}

async function getJson(url, opts = {}) {
    const res = await request(url, { ...opts, headers: { Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
    let body = '';
    for await (const chunk of res) body += chunk;
    if ((res.statusCode || 0) >= 400) {
        throw new Error(`HTTP ${res.statusCode} from ${url}: ${body.slice(0, 200)}`);
    }
    return JSON.parse(body);
}

function sha256File(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file)
            .on('data', (d) => h.update(d))
            .on('error', reject)
            .on('end', () => resolve(h.digest('hex')));
    });
}

/**
 * Downloads `url` to `dest`. Bytes go to `dest + ".part"` first and the transfer resumes from it
 * when the server supports ranges, so a dropped 23 GB model download does not start over.
 *
 * @param {object} o
 * @param {string} o.url
 * @param {string} o.dest
 * @param {string|null} [o.sha256]   expected hex digest; a mismatch deletes the file and throws
 * @param {(p:{received:number,total:number|null})=>void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{path:string, sha256:string, bytes:number, verified:boolean}>}
 */
async function downloadFile({ url, dest, sha256 = null, onProgress, signal }) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const part = `${dest}.part`;
    let start = 0;
    try { start = fs.statSync(part).size; } catch (_) { start = 0; }

    let res = await request(url, { headers: start > 0 ? { Range: `bytes=${start}-` } : {}, signal });
    if (res.statusCode === 416) {
        // The .part file is already complete (or bigger than the file); start clean.
        res.resume();
        fs.rmSync(part, { force: true });
        start = 0;
        res = await request(url, { signal });
    }
    if (res.statusCode === 200 && start > 0) {
        // Server ignored the range request: overwrite from the beginning.
        start = 0;
    }
    if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        throw new Error(`HTTP ${res.statusCode} downloading ${url}`);
    }

    const len = Number(res.headers['content-length']);
    const total = Number.isFinite(len) ? len + start : null;
    let received = start;
    let lastTick = 0;

    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(part, { flags: start > 0 ? 'a' : 'w' });
        res.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (onProgress && now - lastTick > 250) {
                lastTick = now;
                onProgress({ received, total });
            }
        });
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        res.pipe(out);
        if (signal) signal.addEventListener('abort', () => { res.destroy(); out.destroy(); reject(new Error('Cancelled')); }, { once: true });
    });
    if (onProgress) onProgress({ received, total });

    if (total !== null && received !== total) {
        throw new Error(`Download of ${path.basename(dest)} stopped at ${received} of ${total} bytes. Try again to resume.`);
    }

    const digest = await sha256File(part);
    if (sha256 && digest !== sha256.toLowerCase()) {
        fs.rmSync(part, { force: true });
        throw new Error(`Checksum mismatch for ${path.basename(dest)}: expected ${sha256}, got ${digest}. The file was deleted.`);
    }
    fs.rmSync(dest, { force: true });
    fs.renameSync(part, dest);
    return { path: dest, sha256: digest, bytes: received, verified: Boolean(sha256) };
}

/** Latest non-prerelease of a GitHub repository, via the public REST API. */
function latestRelease(repo, opts = {}) {
    const base = opts.apiBase || 'https://api.github.com';
    return getJson(`${base}/repos/${repo}/releases/latest`, opts);
}

module.exports = { downloadFile, latestRelease, getJson, sha256File, request };
