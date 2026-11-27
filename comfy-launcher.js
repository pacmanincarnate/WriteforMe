'use strict';

/**
 * Lets server.js start a headless ComfyUI for the page it serves, and stop it when server.js exits.
 * Reuses the desktop app's process supervisor and ComfyUI launch flags (desktop/lib), so both paths
 * start ComfyUI the same way. The desktop app does not use this file: it has its own bridge.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getBackend, launchSpec } = require('./desktop/lib/backends.cjs');
const { findInstallLayoutFromPath } = require('./desktop/lib/install.cjs');
const { Supervisor } = require('./desktop/lib/supervisor.cjs');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
// The first start imports torch, which can take minutes on a cold disk.
const READY_TIMEOUT_MS = 240000;

/** The port of a loopback http ComfyUI address, or null when the address is not this machine. */
function loopbackPort(url) {
    try {
        const u = new URL(String(url || ''));
        if (u.protocol !== 'http:' || !LOOPBACK_HOSTS.has(u.hostname.toLowerCase())) return null;
        const port = Number(u.port || 80);
        return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
    } catch (_) {
        return null;
    }
}

/**
 * A ComfyUI folder as something runnable. Falls back to the system Python for a plain git clone
 * with no venv beside it.
 */
function resolveLayout(dir, env = process.env) {
    if (!dir) return null;
    const layout = findInstallLayoutFromPath('comfyui', dir);
    if (layout) return layout;
    const mainPy = [path.join(dir, 'main.py'), path.join(dir, 'ComfyUI', 'main.py')].find((p) => fs.existsSync(p));
    if (!mainPy) return null;
    const root = path.dirname(mainPy);
    return {
        python: env.COMFYUI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
        root,
        mainPy,
        models: path.join(root, 'models'),
        isPortable: false
    };
}

class ComfyLauncher {
    /**
     * @param {object} o
     * @param {string} o.dataDir   where the chosen ComfyUI folder is remembered
     * @param {string} o.rootDir   the EllipsisProse folder; ComfyUI is looked for next to it
     * @param {object} [o.env]
     * @param {Supervisor} [o.supervisor]  injectable for tests
     */
    constructor({ dataDir, rootDir, env = process.env, supervisor = new Supervisor() }) {
        this.configFile = path.join(dataDir, 'comfyui-launcher.json');
        this.rootDir = rootDir;
        this.env = env;
        this.supervisor = supervisor;
    }

    savedDir() {
        try {
            return String(JSON.parse(fs.readFileSync(this.configFile, 'utf8')).dir || '');
        } catch (_) {
            return '';
        }
    }

    /** The saved folder, then COMFYUI_DIR, then the usual places next to this app and in the home folder. */
    findDir() {
        const parent = path.dirname(this.rootDir);
        const home = os.homedir();
        const candidates = [
            this.savedDir(),
            this.env.COMFYUI_DIR,
            path.join(parent, 'ComfyUI_windows_portable'),
            path.join(parent, 'ComfyUI'),
            path.join(home, 'ComfyUI_windows_portable'),
            path.join(home, 'ComfyUI')
        ];
        return candidates.find((dir) => dir && resolveLayout(dir, this.env)) || '';
    }

    status() {
        const { status, log } = this.supervisor.status('comfyui');
        return { available: true, dir: this.findDir(), status, log: log.slice(-8) };
    }

    /**
     * Starts ComfyUI on the port of `url` and returns without waiting for it to load; the page
     * polls ComfyUI itself. `dir`, when given, replaces the remembered folder.
     */
    async launch({ url, dir } = {}) {
        const port = loopbackPort(url);
        if (!port) return { started: false, reason: 'not-local' };

        const wanted = String(dir || '').trim();
        if (wanted && !resolveLayout(wanted, this.env)) return { started: false, reason: 'not-found' };
        const folder = wanted || this.findDir();
        const layout = resolveLayout(folder, this.env);
        if (!layout) return { started: false, reason: 'not-found' };
        if (wanted) fs.writeFileSync(this.configFile, JSON.stringify({ dir: wanted }, null, 2));

        const backend = getBackend('comfyui');
        const spec = launchSpec(backend, { args: [] }, layout, { extraArgs: this.env.COMFYUI_ARGS || '', port });
        const starting = this.supervisor.start('comfyui', {
            ...spec,
            port,
            healthUrl: `http://127.0.0.1:${port}${backend.healthPath}`,
            readyTimeoutMs: READY_TIMEOUT_MS
        });
        starting.catch(() => {});
        // Long enough for the supervisor to spawn (or to find the port already served).
        await Promise.race([starting, new Promise((resolve) => setTimeout(resolve, 1500))]);
        return { started: true, dir: folder, status: this.supervisor.status('comfyui').status };
    }

    dispose() {
        this.supervisor.stopAll();
    }
}

/**
 * Starting a program is only for the person at this machine: the request must come from loopback,
 * be addressed to loopback (no DNS rebinding), and not be sent by another site's page.
 */
function isLocalRequest(req) {
    const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (remote !== '127.0.0.1' && remote !== '::1') return false;
    const hostOf = (value) => {
        try {
            return new URL(value).hostname.toLowerCase();
        } catch (_) {
            return '';
        }
    };
    if (!LOOPBACK_HOSTS.has(hostOf(`http://${req.headers.host || ''}`))) return false;
    const origin = req.headers.origin;
    return !origin || LOOPBACK_HOSTS.has(hostOf(origin));
}

module.exports = { ComfyLauncher, isLocalRequest, loopbackPort, resolveLayout };
