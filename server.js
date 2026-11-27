const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORTS = require('./src/config/ports.json');

const PORT = process.env.PORT || PORTS.web;
const ROOT = __dirname;

const DATA_DIR = process.env.ELLIPSIS_DATA_DIR
    ? path.resolve(process.env.ELLIPSIS_DATA_DIR)
    : path.join(ROOT, 'data');
const STATIC_DIR = process.env.STATIC_DIR
    ? path.resolve(process.env.STATIC_DIR)
    : path.join(ROOT, 'dist');
const STORIES_DIR = path.join(DATA_DIR, 'stories');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DELETED_BACKUPS_DIR = path.join(BACKUPS_DIR, '_deleted');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const MAX_BACKUPS_PER_STORY = 15;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 250 * 1024 * 1024; // 250 MB

for (const dir of [DATA_DIR, STORIES_DIR, BACKUPS_DIR, DELETED_BACKUPS_DIR, IMAGES_DIR, AUDIO_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.mjs': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.map': 'application/json; charset=UTF-8',
    '.webmanifest': 'application/manifest+json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=UTF-8'
};

function toSafeFilename(id) {
    const raw = String(id || 'unnamed');
    const encoded = encodeURIComponent(raw)
        .replace(/\*/g, '%2A')
        .replace(/%/g, '_p_');
    const safe = (!encoded || encoded === '.' || encoded === '..') ? `_item_${Date.now()}` : encoded;
    if (safe.length <= 160) return safe;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    return safe.slice(0, 140) + '_' + hash;
}

function resolveWithin(baseDir, ...segments) {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(baseDir, ...segments);
    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
        throw new Error('Path traversal denied');
    }
    return resolvedTarget;
}

function writeFileAtomic(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function toAsciiHeaderJson(obj) {
    return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (ch) => {
        return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
    });
}

function extractProseText(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
        return String(entry.final || entry.text || entry.draft || '');
    }
    return '';
}

function computeStoryMetrics(storyData) {
    if (!storyData || typeof storyData !== 'object') {
        return {
            draftedScenes: 0,
            totalWords: 0,
            plannedScenes: 0,
            sequenceCount: 0,
            actCount: 0,
            castCount: 0,
            loreCount: 0,
            hasConcept: false,
            score: 0
        };
    }

    let draftedScenes = 0;
    let totalWords = 0;
    const seenKeys = new Set();

    const proseMap = storyData.prose && typeof storyData.prose === 'object' ? storyData.prose : {};
    for (const key of Object.keys(proseMap)) {
        const text = extractProseText(proseMap[key]).trim();
        if (text) {
            seenKeys.add(key);
            draftedScenes++;
            totalWords += text.split(/\s+/).filter(Boolean).length;
        }
    }

    let plannedScenes = 0;
    const scenesMap = storyData.scenes && typeof storyData.scenes === 'object' ? storyData.scenes : {};
    for (const seqKey of Object.keys(scenesMap)) {
        const seqScenes = scenesMap[seqKey];
        if (!Array.isArray(seqScenes)) continue;
        plannedScenes += seqScenes.length;
        seqScenes.forEach((sc, scIdx) => {
            const key = `${seqKey}-${scIdx}`;
            if (seenKeys.has(key) || !sc || typeof sc !== 'object') return;
            const inlineText = extractProseText(sc.prose || sc.final || sc.text).trim();
            if (inlineText) {
                seenKeys.add(key);
                draftedScenes++;
                totalWords += inlineText.split(/\s+/).filter(Boolean).length;
            }
        });
    }

    const sequenceCount = Array.isArray(storyData.sequences) ? storyData.sequences.length : 0;
    const actCount = Array.isArray(storyData.acts) ? storyData.acts.length : 0;
    const castCount = Array.isArray(storyData.cast) ? storyData.cast.length : 0;
    const loreCount = Array.isArray(storyData.lore) ? storyData.lore.length : 0;
    const title = String(storyData.title || '').trim();
    const hasConcept = Boolean(
        String(storyData.concept || '').trim() ||
        String(storyData.logline || '').trim() ||
        String(storyData.story_so_far || '').trim() ||
        (title && title !== 'Untitled Story')
    );

    const score =
        (draftedScenes * 100000) +
        totalWords +
        (plannedScenes * 500) +
        (sequenceCount * 100) +
        (actCount * 50) +
        (castCount * 20) +
        (loreCount * 10) +
        (hasConcept ? 5 : 0);

    return {
        draftedScenes,
        totalWords,
        plannedScenes,
        sequenceCount,
        actCount,
        castCount,
        loreCount,
        hasConcept,
        score
    };
}

function listBackupFilesForStory(safeId) {
    const dir = resolveWithin(BACKUPS_DIR, safeId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json') && !f.includes('.tmp.'))
        .map((f) => {
            const fullPath = path.join(dir, f);
            let mtimeMs = 0;
            try { mtimeMs = fs.statSync(fullPath).mtimeMs; } catch (_) {}
            return { name: f, path: fullPath, mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
}

function writeStoryBackup(safeId, record, metrics) {
    if (!record || !record.data) return null;
    const backupDir = resolveWithin(BACKUPS_DIR, safeId);
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${safeId}_${ts}_sc${metrics.draftedScenes}_w${metrics.totalWords}.json`;
    const backupPath = resolveWithin(backupDir, filename);
    writeFileAtomic(backupPath, JSON.stringify(record));

    const allBackups = listBackupFilesForStory(safeId);
    for (let i = MAX_BACKUPS_PER_STORY; i < allBackups.length; i++) {
        try { fs.unlinkSync(allBackups[i].path); } catch (_) {}
    }
    return backupPath;
}

function readStoryRecordWithRecovery(storyId) {
    const safeId = toSafeFilename(storyId);
    const primaryPath = resolveWithin(STORIES_DIR, `${safeId}.json`);
    const primary = readJsonSafe(primaryPath);
    if (primary && primary.data) return primary;

    const backups = listBackupFilesForStory(safeId);
    for (const b of backups) {
        const candidate = readJsonSafe(b.path);
        if (candidate && candidate.data) {
            try { writeFileAtomic(primaryPath, JSON.stringify(candidate)); } catch (_) {}
            return candidate;
        }
    }
    return null;
}

function listAllStoryRecords() {
    const map = new Map();
    if (fs.existsSync(STORIES_DIR)) {
        for (const file of fs.readdirSync(STORIES_DIR)) {
            if (!file.endsWith('.json') || file.includes('.tmp.')) continue;
            const rec = readJsonSafe(path.join(STORIES_DIR, file));
            if (rec && rec.id && rec.data) {
                map.set(rec.id, rec);
            }
        }
    }
    if (fs.existsSync(BACKUPS_DIR)) {
        for (const entry of fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === '_deleted') continue;
            const backups = listBackupFilesForStory(entry.name);
            for (const b of backups) {
                const candidate = readJsonSafe(b.path);
                if (candidate && candidate.id && candidate.data) {
                    if (!map.has(candidate.id)) {
                        map.set(candidate.id, candidate);
                        try {
                            const primaryPath = resolveWithin(STORIES_DIR, `${toSafeFilename(candidate.id)}.json`);
                            writeFileAtomic(primaryPath, JSON.stringify(candidate));
                        } catch (_) {}
                    }
                    break;
                }
            }
        }
    }
    return Array.from(map.values());
}

function saveStoryRecord(storyId, body) {
    const safeId = toSafeFilename(storyId);
    const primaryPath = resolveWithin(STORIES_DIR, `${safeId}.json`);
    const existingRecord = readStoryRecordWithRecovery(storyId);
    const incomingData = body && body.data ? body.data : {};
    const allowRegression = Boolean(body && body.allowRegression);
    const timestamp = Number(body && body.timestamp) || Date.now();

    const oldMetrics = computeStoryMetrics(existingRecord ? existingRecord.data : null);
    const newMetrics = computeStoryMetrics(incomingData);

    const existingHasSignificantContent = Boolean(
        existingRecord && (
            oldMetrics.draftedScenes > 0 ||
            oldMetrics.totalWords > 100 ||
            oldMetrics.sequenceCount > 0 ||
            oldMetrics.castCount > 0 ||
            oldMetrics.loreCount > 0
        )
    );
    const incomingIsBlankTemplate = (
        newMetrics.draftedScenes === 0 &&
        newMetrics.totalWords === 0 &&
        newMetrics.sequenceCount === 0 &&
        newMetrics.castCount === 0 &&
        !newMetrics.hasConcept
    );

    if (existingHasSignificantContent && incomingIsBlankTemplate && !allowRegression) {
        writeStoryBackup(safeId, existingRecord, oldMetrics);
        return {
            status: 409,
            payload: {
                error: 'RegressionBlocked',
                message: 'Blocked blank template from overwriting an existing drafted story.',
                existingRecord
            }
        };
    }

    if (existingRecord && existingRecord.data) {
        const backups = listBackupFilesForStory(safeId);
        const newestBackupAgeMs = backups.length > 0 ? (Date.now() - backups[0].mtimeMs) : Infinity;
        const shouldSnapshot = (
            newMetrics.draftedScenes < oldMetrics.draftedScenes ||
            newMetrics.totalWords < oldMetrics.totalWords - 100 ||
            newMetrics.draftedScenes > oldMetrics.draftedScenes ||
            Math.abs(newMetrics.totalWords - oldMetrics.totalWords) >= 200 ||
            newestBackupAgeMs >= BACKUP_INTERVAL_MS
        );
        if (shouldSnapshot) {
            writeStoryBackup(safeId, existingRecord, oldMetrics);
        }
    }

    const nextRecord = { id: storyId, data: incomingData, timestamp };
    writeFileAtomic(primaryPath, JSON.stringify(nextRecord));
    return { status: 200, payload: { ok: true, id: storyId, timestamp, metrics: newMetrics } };
}

function softDeleteStoryRecord(storyId) {
    const safeId = toSafeFilename(storyId);
    const primaryPath = resolveWithin(STORIES_DIR, `${safeId}.json`);
    if (fs.existsSync(primaryPath)) {
        const dest = resolveWithin(DELETED_BACKUPS_DIR, `${safeId}_${Date.now()}.json`);
        try { fs.copyFileSync(primaryPath, dest); } catch (_) {}
        fs.unlinkSync(primaryPath);
    }
}

function clearAllStoryRecordsWithBackup() {
    if (!fs.existsSync(STORIES_DIR)) return 0;
    let count = 0;
    const stamp = Date.now();
    for (const file of fs.readdirSync(STORIES_DIR)) {
        if (!file.endsWith('.json') || file.includes('.tmp.')) continue;
        const src = path.join(STORIES_DIR, file);
        const dest = resolveWithin(DELETED_BACKUPS_DIR, `${file.replace(/\.json$/, '')}_${stamp}.json`);
        try { fs.copyFileSync(src, dest); } catch (_) {}
        try {
            fs.unlinkSync(src);
            count++;
        } catch (_) {}
    }
    return count;
}

/**
 * Reads persisted application settings (API keys, provider/model selections, preferences)
 * from the Local Disk Vault settings file (`data/settings.json`).
 */
function readSettingsRecord() {
    const raw = readJsonSafe(SETTINGS_FILE);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { version: 1, updatedAt: 0, settings: {} };
    }
    const settingsObj = (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings))
        ? raw.settings
        : {};
    const clean = {};
    for (const [k, v] of Object.entries(settingsObj)) {
        if (typeof k !== 'string' || !k || k.length > 200) continue;
        if (typeof v === 'string') {
            if (v.length <= 262144) clean[k] = v;
        } else if (typeof v === 'number') {
            if (Number.isFinite(v)) clean[k] = String(v);
        } else if (typeof v === 'boolean') {
            clean[k] = String(v);
        }
    }
    return {
        version: 1,
        updatedAt: Number(raw.updatedAt) || 0,
        settings: clean
    };
}

/**
 * Merges (or replaces when `body.replace === true`) primitive settings entries
 * into `data/settings.json` atomically. Passing `null`/`undefined` deletes a key.
 */
function saveSettingsRecord(body) {
    const existing = readSettingsRecord();
    const hasNestedSettings = Boolean(
        body && typeof body.settings === 'object' && body.settings !== null && !Array.isArray(body.settings)
    );
    const incoming = hasNestedSettings
        ? body.settings
        : ((body && typeof body === 'object' && !Array.isArray(body)) ? body : {});
    const nextSettings = (body && body.replace === true) ? {} : { ...existing.settings };

    for (const [k, v] of Object.entries(incoming)) {
        if (!hasNestedSettings && k === 'replace') continue;
        if (typeof k !== 'string' || !k || k.length > 200) continue;
        if (v === null || v === undefined) {
            delete nextSettings[k];
            continue;
        }
        if (typeof v === 'string') {
            if (v.length <= 262144) nextSettings[k] = v;
        } else if (typeof v === 'number') {
            if (Number.isFinite(v)) nextSettings[k] = String(v);
        } else if (typeof v === 'boolean') {
            nextSettings[k] = String(v);
        }
    }

    const record = {
        version: 1,
        updatedAt: Date.now(),
        settings: nextSettings
    };
    writeFileAtomic(SETTINGS_FILE, JSON.stringify(record, null, 2));
    return {
        ok: true,
        updatedAt: record.updatedAt,
        settings: nextSettings
    };
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-audio-meta');
    res.setHeader('Access-Control-Expose-Headers', 'x-audio-meta');
}

function sendJson(res, statusCode, data) {
    setCorsHeaders(res);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(data));
}

function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        let settled = false;
        req.on('data', (chunk) => {
            if (settled) return;
            total += chunk.length;
            if (total > maxBytes) {
                settled = true;
                const err = new Error('Payload too large');
                err.statusCode = 413;
                reject(err);
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!settled) {
                settled = true;
                resolve(Buffer.concat(chunks));
            }
        });
        req.on('error', (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        });
    });
}

async function readJsonBody(req) {
    const buf = await readRawBody(req);
    const text = buf.toString('utf8');
    if (!text.trim()) return {};
    return JSON.parse(text);
}

function parseRawSegments(rawPathname) {
    return String(rawPathname || '/')
        .split('/')
        .filter(Boolean)
        .map((seg) => decodeURIComponent(seg));
}

function getAudioPaths(storyId, type, seqIdx, sceneIdx = null) {
    const safeStoryId = toSafeFilename(storyId);
    const storyAudioDir = resolveWithin(AUDIO_DIR, safeStoryId);
    const baseName = type === 'scene'
        ? `scene_${Number(seqIdx)}_${Number(sceneIdx)}`
        : `seq_${Number(seqIdx)}`;
    return {
        storyAudioDir,
        binPath: resolveWithin(storyAudioDir, `${baseName}.bin`),
        metaPath: resolveWithin(storyAudioDir, `${baseName}.meta.json`)
    };
}

let comfyLauncher;
/** The ComfyUI launcher, or null where its helper files are not shipped (the desktop app has its own). */
function getComfyLauncher() {
    if (comfyLauncher !== undefined) return comfyLauncher;
    try {
        const { ComfyLauncher } = require('./comfy-launcher.js');
        const launcher = new ComfyLauncher({ dataDir: DATA_DIR, rootDir: ROOT });
        // ComfyUI started from here closes with this server, however the server is closed.
        process.on('exit', () => launcher.dispose());
        for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
            process.on(signal, () => process.exit(0));
        }
        comfyLauncher = launcher;
    } catch (_) {
        comfyLauncher = null;
    }
    return comfyLauncher;
}

/** GET /api/comfyui/status and POST /api/comfyui/launch, for the person at this machine only. */
async function handleComfyRequest(req, res, parsedUrl) {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }
    const { isLocalRequest } = require('./comfy-launcher.js');
    const launcher = isLocalRequest(req) ? getComfyLauncher() : null;
    if (!launcher) {
        sendJson(res, 200, { available: false });
        return;
    }
    if (method === 'GET' && parsedUrl.pathname === '/api/comfyui/status') {
        sendJson(res, 200, launcher.status());
        return;
    }
    if (method === 'POST' && parsedUrl.pathname === '/api/comfyui/launch') {
        const body = await readJsonBody(req);
        sendJson(res, 200, { available: true, ...(await launcher.launch(body || {})) });
        return;
    }
    sendJson(res, 404, { error: 'Not Found' });
}

async function handleApiRequest(req, res, parsedUrl) {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    const segments = parseRawSegments(parsedUrl.pathname);

    // GET /api/storage/status
    if (method === 'GET' && segments.length === 3 && segments[2] === 'status') {
        const stories = listAllStoryRecords();
        sendJson(res, 200, {
            ok: true,
            dataDir: DATA_DIR,
            storiesCount: stories.length,
            hasSettings: fs.existsSync(SETTINGS_FILE)
        });
        return;
    }

    // GET/POST /api/storage/settings
    if (segments.length === 3 && segments[2] === 'settings') {
        if (method === 'GET') {
            const rec = readSettingsRecord();
            sendJson(res, 200, {
                ok: true,
                exists: fs.existsSync(SETTINGS_FILE),
                updatedAt: rec.updatedAt,
                settings: rec.settings
            });
            return;
        }
        if (method === 'POST') {
            const body = await readJsonBody(req);
            const result = saveSettingsRecord(body);
            sendJson(res, 200, result);
            return;
        }
    }

    // /api/storage/stories...
    if (segments[2] === 'stories') {
        if (method === 'GET' && segments.length === 3) {
            sendJson(res, 200, { stories: listAllStoryRecords() });
            return;
        }
        if (segments.length === 4) {
            const storyId = segments[3];
            if (method === 'GET') {
                const record = readStoryRecordWithRecovery(storyId);
                if (!record) {
                    sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                sendJson(res, 200, { record });
                return;
            }
            if (method === 'POST') {
                const body = await readJsonBody(req);
                const result = saveStoryRecord(storyId, body);
                sendJson(res, result.status, result.payload);
                return;
            }
            if (method === 'DELETE') {
                softDeleteStoryRecord(storyId);
                sendJson(res, 200, { ok: true, id: storyId });
                return;
            }
        }
    }

    // POST /api/storage/clear-all
    if (method === 'POST' && segments.length === 3 && segments[2] === 'clear-all') {
        const cleared = clearAllStoryRecordsWithBackup();
        sendJson(res, 200, { ok: true, cleared });
        return;
    }

    // /api/storage/images...
    if (segments[2] === 'images') {
        if (segments.length === 3) {
            const prefix = parsedUrl.searchParams.get('prefix') || '';
            const keysOnly = parsedUrl.searchParams.get('keysOnly') === '1' || parsedUrl.searchParams.get('keysOnly') === 'true';
            if (method === 'GET') {
                const images = [];
                const ids = [];
                if (fs.existsSync(IMAGES_DIR)) {
                    for (const file of fs.readdirSync(IMAGES_DIR)) {
                        if (!file.endsWith('.json') || file.includes('.tmp.')) continue;
                        const rec = readJsonSafe(path.join(IMAGES_DIR, file));
                        if (rec && rec.id && (!prefix || String(rec.id).startsWith(prefix))) {
                            if (keysOnly) {
                                if (rec.dataUrl) ids.push(rec.id);
                            } else {
                                images.push(rec);
                            }
                        }
                    }
                }
                sendJson(res, 200, keysOnly ? { ids } : { images });
                return;
            }
            if (method === 'DELETE') {
                let deletedCount = 0;
                if (fs.existsSync(IMAGES_DIR)) {
                    for (const file of fs.readdirSync(IMAGES_DIR)) {
                        if (!file.endsWith('.json') || file.includes('.tmp.')) continue;
                        const filePath = path.join(IMAGES_DIR, file);
                        const rec = readJsonSafe(filePath);
                        if (!prefix || (rec && typeof rec.id === 'string' && rec.id.startsWith(prefix))) {
                            try {
                                fs.unlinkSync(filePath);
                                deletedCount++;
                            } catch (_) {}
                        }
                    }
                }
                sendJson(res, 200, { ok: true, deletedCount });
                return;
            }
        }
        if (segments.length === 4) {
            const imgId = segments[3];
            const imgPath = resolveWithin(IMAGES_DIR, `${toSafeFilename(imgId)}.json`);
            if (method === 'GET') {
                const rec = readJsonSafe(imgPath);
                if (!rec) {
                    sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                sendJson(res, 200, { record: rec });
                return;
            }
            if (method === 'POST') {
                const body = await readJsonBody(req);
                const rec = {
                    id: imgId,
                    dataUrl: body.dataUrl || null,
                    timestamp: Number(body.timestamp) || Date.now()
                };
                writeFileAtomic(imgPath, JSON.stringify(rec));
                sendJson(res, 200, { ok: true, id: imgId });
                return;
            }
            if (method === 'DELETE') {
                if (fs.existsSync(imgPath)) {
                    try { fs.unlinkSync(imgPath); } catch (_) {}
                }
                sendJson(res, 200, { ok: true, id: imgId });
                return;
            }
        }
    }

    // /api/storage/audio/:storyId...
    if (segments[2] === 'audio' && segments.length >= 4) {
        const storyId = segments[3];
        const safeStoryId = toSafeFilename(storyId);
        const storyAudioDir = resolveWithin(AUDIO_DIR, safeStoryId);

        // GET /api/storage/audio/:storyId/meta
        if (method === 'GET' && segments.length === 5 && segments[4] === 'meta') {
            const scenes = [];
            const sequences = [];
            if (fs.existsSync(storyAudioDir)) {
                for (const file of fs.readdirSync(storyAudioDir)) {
                    if (!file.endsWith('.meta.json') || file.includes('.tmp.')) continue;
                    const meta = readJsonSafe(path.join(storyAudioDir, file));
                    if (!meta) continue;
                    if (meta.type === 'sequence' || file.startsWith('seq_')) {
                        sequences.push({ ...meta, type: 'sequence' });
                    } else {
                        scenes.push({ ...meta, type: 'scene' });
                    }
                }
            }
            sendJson(res, 200, { scenes, sequences });
            return;
        }

        // DELETE /api/storage/audio/:storyId
        if (method === 'DELETE' && segments.length === 4) {
            if (fs.existsSync(storyAudioDir)) {
                fs.rmSync(storyAudioDir, { recursive: true, force: true });
            }
            sendJson(res, 200, { ok: true, storyId });
            return;
        }

        // Scene audio: /api/storage/audio/:storyId/scene/:seqIdx/:sceneIdx
        if (segments.length === 7 && segments[4] === 'scene') {
            const seqIdx = Number(segments[5]);
            const sceneIdx = Number(segments[6]);
            if (!Number.isFinite(seqIdx) || !Number.isFinite(sceneIdx)) {
                sendJson(res, 400, { error: 'Invalid seqIdx or sceneIdx' });
                return;
            }
            const { storyAudioDir: dir, binPath, metaPath } = getAudioPaths(storyId, 'scene', seqIdx, sceneIdx);

            if (method === 'PUT') {
                const rawBuf = await readRawBody(req);
                let headerMeta = {};
                const rawHeader = req.headers['x-audio-meta'];
                if (typeof rawHeader === 'string' && rawHeader.trim()) {
                    try { headerMeta = JSON.parse(rawHeader); } catch (_) {}
                }
                fs.mkdirSync(dir, { recursive: true });
                writeFileAtomic(binPath, rawBuf);
                const meta = {
                    ...headerMeta,
                    id: `${storyId}:${seqIdx}:${sceneIdx}`,
                    storyId,
                    type: 'scene',
                    seqIdx,
                    sceneIdx,
                    sceneId: `${seqIdx}-${sceneIdx}`,
                    mimeType: headerMeta.mimeType || req.headers['content-type'] || 'audio/mpeg',
                    sizeBytes: rawBuf.length,
                    updatedAt: Number(headerMeta.updatedAt) || Date.now()
                };
                writeFileAtomic(metaPath, JSON.stringify(meta));
                sendJson(res, 200, { ok: true, meta });
                return;
            }

            if (method === 'GET') {
                if (!fs.existsSync(binPath)) {
                    sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                const meta = readJsonSafe(metaPath) || {
                    id: `${storyId}:${seqIdx}:${sceneIdx}`,
                    storyId,
                    type: 'scene',
                    seqIdx,
                    sceneIdx,
                    mimeType: 'audio/mpeg'
                };
                const stat = fs.statSync(binPath);
                setCorsHeaders(res);
                const headerMeta = { ...meta };
                let metaHeaderStr = toAsciiHeaderJson(headerMeta);
                if (metaHeaderStr.length > 12288) {
                    delete headerMeta.cueTimeline;
                    metaHeaderStr = toAsciiHeaderJson(headerMeta);
                }
                res.writeHead(200, {
                    'Content-Type': meta.mimeType || 'audio/mpeg',
                    'Content-Length': stat.size,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'x-audio-meta': metaHeaderStr
                });
                fs.createReadStream(binPath).pipe(res);
                return;
            }

            if (method === 'DELETE') {
                if (fs.existsSync(binPath)) try { fs.unlinkSync(binPath); } catch (_) {}
                if (fs.existsSync(metaPath)) try { fs.unlinkSync(metaPath); } catch (_) {}
                sendJson(res, 200, { ok: true });
                return;
            }
        }

        // Sequence audio: /api/storage/audio/:storyId/sequence/:seqIdx
        if (segments.length === 6 && segments[4] === 'sequence') {
            const seqIdx = Number(segments[5]);
            if (!Number.isFinite(seqIdx)) {
                sendJson(res, 400, { error: 'Invalid seqIdx' });
                return;
            }
            const { storyAudioDir: dir, binPath, metaPath } = getAudioPaths(storyId, 'sequence', seqIdx);

            if (method === 'PUT') {
                const rawBuf = await readRawBody(req);
                let headerMeta = {};
                const rawHeader = req.headers['x-audio-meta'];
                if (typeof rawHeader === 'string' && rawHeader.trim()) {
                    try { headerMeta = JSON.parse(rawHeader); } catch (_) {}
                }
                fs.mkdirSync(dir, { recursive: true });
                writeFileAtomic(binPath, rawBuf);
                const meta = {
                    ...headerMeta,
                    id: `${storyId}:seq:${seqIdx}`,
                    storyId,
                    type: 'sequence',
                    seqIdx,
                    mimeType: headerMeta.mimeType || req.headers['content-type'] || 'audio/mpeg',
                    sizeBytes: rawBuf.length,
                    updatedAt: Number(headerMeta.updatedAt) || Date.now()
                };
                writeFileAtomic(metaPath, JSON.stringify(meta));
                sendJson(res, 200, { ok: true, meta });
                return;
            }

            if (method === 'GET') {
                if (!fs.existsSync(binPath)) {
                    sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                const meta = readJsonSafe(metaPath) || {
                    id: `${storyId}:seq:${seqIdx}`,
                    storyId,
                    type: 'sequence',
                    seqIdx,
                    mimeType: 'audio/mpeg'
                };
                const stat = fs.statSync(binPath);
                setCorsHeaders(res);
                res.writeHead(200, {
                    'Content-Type': meta.mimeType || 'audio/mpeg',
                    'Content-Length': stat.size,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'x-audio-meta': toAsciiHeaderJson(meta)
                });
                fs.createReadStream(binPath).pipe(res);
                return;
            }

            if (method === 'DELETE') {
                if (fs.existsSync(binPath)) try { fs.unlinkSync(binPath); } catch (_) {}
                if (fs.existsSync(metaPath)) try { fs.unlinkSync(metaPath); } catch (_) {}
                sendJson(res, 200, { ok: true });
                return;
            }
        }
    }

    sendJson(res, 404, { error: 'Unknown storage endpoint' });
}

const server = http.createServer((req, res) => {
    let parsedUrl;
    try {
        parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
        return;
    }

    if (parsedUrl.pathname.startsWith('/api/comfyui/')) {
        handleComfyRequest(req, res, parsedUrl).catch((err) => {
            if (!res.headersSent) sendJson(res, 200, { available: false, error: err?.message || 'ComfyUI launcher failed' });
            else try { res.end(); } catch (_) {}
        });
        return;
    }

    if (parsedUrl.pathname.startsWith('/api/storage/')) {
        handleApiRequest(req, res, parsedUrl).catch((err) => {
            console.error('[Storage API] Error handling', req.method, parsedUrl.pathname, err);
            const code = err?.statusCode || 500;
            if (!res.headersSent) {
                sendJson(res, code, { error: err?.message || 'Internal Server Error' });
            } else {
                try { res.end(); } catch (_) {}
            }
        });
        return;
    }

    let reqPath = decodeURIComponent(parsedUrl.pathname);
    if (reqPath === '/') reqPath = '/index.html';

    let safePath;
    try {
        safePath = resolveWithin(STATIC_DIR, reqPath.replace(/^\/+/, ''));
    } catch (_) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if ((err || !stats.isFile()) && reqPath === '/index.html') {
            // The app is only served from the Vite build output; the repo root is not servable.
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('EllipsisProse has not been built yet. Run "npm run build" (or use the launcher, which builds on first start), then reload.');
            return;
        }
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: ' + reqPath);
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const isImmutableAsset = reqPath.startsWith('/assets/');
        const cacheControl = isImmutableAsset
            ? 'public, max-age=31536000, immutable'
            : 'no-cache, no-store, must-revalidate';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'Access-Control-Allow-Origin': '*'
        });

        fs.createReadStream(safePath).pipe(res);
    });
});

// HOST lets the desktop app keep the vault on loopback; the default stays as before.
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log(`EllipsisProse Local Server running at http://localhost:${PORT}/ and http://127.0.0.1:${PORT}/`);
    console.log(`Serving static app from: ${STATIC_DIR}`);
    if (!fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
        console.warn('No built app found there yet. Run "npm run build" to create it. The /api endpoints work regardless (for "npm run dev").');
    }
    console.log(`Local Disk Vault active at: ${DATA_DIR}`);
});
