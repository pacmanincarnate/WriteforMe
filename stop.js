/**
 * EllipsisProse Stop All
 * Stops everything launch.js, "Start Backends.bat" and server.js can leave running: the web server,
 * the Audio Studio Bridge, the Codex and Claude bridges, and the programs they start (ComfyUI, the
 * built-in llama.cpp embedding server, Audio.cpp).
 *
 * Each service is found by the port it listens on AND the script it runs, so another program that
 * happens to use the same port is left alone. A service is stopped with its whole process tree,
 * which also closes its minimized window.
 *
 * Usage:
 *   node stop.js [--dry-run]
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = __dirname;
const PORTS = require('./src/config/ports.json');

/** The node services, each with the words that mark a window or npm wrapper as belonging to it. */
function nodeServices(env = process.env) {
    return [
        { label: 'Web server', script: 'server.js', hints: ['server.js'], port: Number(env.PORT || PORTS.web) },
        {
            label: 'Audio Studio Bridge',
            script: 'audio-studio-bridge.js',
            hints: ['audio-studio-bridge.js', 'audio-bridge'],
            port: Number(env.AUDIO_STUDIO_BRIDGE_PORT || PORTS.audioStudioBridge)
        },
        {
            label: 'Codex bridge',
            script: 'codex-bridge.js',
            hints: ['codex-bridge.js', 'codex-bridge'],
            port: Number(env.CODEX_BRIDGE_PORT || PORTS.codexBridge)
        },
        {
            label: 'Claude bridge',
            script: 'claude-bridge.js',
            hints: ['claude-bridge.js', 'claude-bridge'],
            port: Number(env.CLAUDE_BRIDGE_PORT || PORTS.claudeBridge)
        }
    ];
}

/** The same names audio-studio-bridge.js clears when it swaps models. */
const AUDIOCPP_NAMES = ['audiocpp_server.exe', 'audiocpp.exe', 'audio-server.exe'];
/** The flags comfy-launcher.js always passes (desktop/lib/backends.cjs, launchSpec). */
const COMFY_FLAGS = ['main.py', '--enable-cors-header', '--listen 127.0.0.1'];
const WRAPPERS = new Set(['cmd.exe', 'node.exe', 'node']);

const lower = (value) => String(value || '').toLowerCase();

/**
 * Decides what to stop, from a snapshot of the machine.
 *
 * @param {{pid:number,ppid:number,name:string,exe?:string,commandLine?:string}[]} processes
 * @param {{port:number,pid:number}[]} listeners
 * @param {{rootDir?:string,dataDir?:string,env?:object,selfPid?:number}} [options]
 * @returns {{label:string,pid:number}[]} one entry per process tree, parents before leftovers
 */
function planStops(processes, listeners, options = {}) {
    const env = options.env || process.env;
    const rootDir = options.rootDir || ROOT_DIR;
    const dataDir = options.dataDir
        || (env.ELLIPSIS_DATA_DIR ? path.resolve(env.ELLIPSIS_DATA_DIR) : path.join(rootDir, 'data'));
    const byPid = new Map(processes.map((p) => [p.pid, p]));
    const targets = [];
    const add = (label, pid) => {
        if (pid !== options.selfPid && !targets.some((t) => t.pid === pid)) targets.push({ label, pid });
    };

    for (const service of nodeServices(env)) {
        for (const { pid } of listeners.filter((l) => l.port === service.port)) {
            const proc = byPid.get(pid);
            if (!proc || !lower(proc.name).startsWith('node') || !lower(proc.commandLine).includes(service.script)) continue;
            // Climb to the window that was opened for it (cmd /k node x.js, or cmd /k npm run x).
            let top = proc;
            for (let parent = byPid.get(top.ppid); parent; parent = byPid.get(top.ppid)) {
                const mine = WRAPPERS.has(lower(parent.name))
                    && service.hints.some((hint) => lower(parent.commandLine).includes(hint));
                if (!mine || parent.pid === options.selfPid) break;
                top = parent;
            }
            add(service.label, top.pid);
        }
    }

    // Leftovers: programs a service started that outlived it (the service was force-closed).
    const embeddingsDir = lower(path.join(dataDir, 'embeddings') + path.sep);
    for (const proc of processes) {
        const name = lower(proc.name);
        const commandLine = lower(proc.commandLine);
        if (name.startsWith('llama-server') && lower(proc.exe || proc.commandLine).includes(embeddingsDir)) {
            add('Built-in embeddings (llama.cpp)', proc.pid);
        } else if (AUDIOCPP_NAMES.includes(name)) {
            add('Audio.cpp', proc.pid);
        } else if (name.startsWith('python') && COMFY_FLAGS.every((flag) => commandLine.includes(flag)) && !byPid.has(proc.ppid)) {
            // Only a ComfyUI whose starter is gone. One you started yourself keeps running.
            add('ComfyUI', proc.pid);
        }
    }

    // A target inside another target's tree goes down with it; keep it only to name it.
    const inTreeOf = (pid, rootPid) => {
        const seen = new Set();
        for (let p = byPid.get(pid); p && !seen.has(p.pid); p = byPid.get(p.ppid)) {
            if (p.pid === rootPid) return true;
            seen.add(p.pid);
        }
        return false;
    };
    return targets.filter((t) => !targets.some((other) => other.pid !== t.pid && inTreeOf(byPid.get(t.pid)?.ppid, other.pid)));
}

/** The programs each stop takes down with it, for the report. */
function describeTree(processes, rootPid) {
    const names = [];
    const walk = (pid) => {
        for (const child of processes.filter((p) => p.ppid === pid && p.pid !== pid)) {
            const name = lower(child.name);
            const commandLine = lower(child.commandLine);
            if (name.startsWith('python') && commandLine.includes('main.py')) names.push('ComfyUI');
            else if (name.startsWith('llama-server')) names.push('built-in embeddings');
            else if (AUDIOCPP_NAMES.includes(name)) names.push('Audio.cpp');
            walk(child.pid);
        }
    };
    walk(rootPid);
    return [...new Set(names)];
}

function snapshotWindows() {
    const script = [
        "$ErrorActionPreference = 'SilentlyContinue'",
        '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
        '$p = @(Get-CimInstance Win32_Process | ForEach-Object { @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = $_.Name; exe = $_.ExecutablePath; commandLine = $_.CommandLine } })',
        '$l = @(Get-NetTCPConnection -State Listen | ForEach-Object { @{ port = [int]$_.LocalPort; pid = [int]$_.OwningProcess } })',
        '@{ processes = $p; listeners = $l } | ConvertTo-Json -Depth 4 -Compress'
    ].join('; ');
    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true
    });
    if (res.error) throw new Error(`Could not list running programs: ${res.error.message}`);
    const parsed = JSON.parse(res.stdout);
    return { processes: parsed.processes || [], listeners: parsed.listeners || [] };
}

function main() {
    const dryRun = process.argv.includes('--dry-run') || process.env.ELLIPSISPROSE_STOP_DRYRUN === '1';
    console.log('=== EllipsisProse Stop All ===');
    if (process.platform !== 'win32') {
        console.log('Stop All is for Windows. On this system, close the terminals the services run in.');
        return;
    }

    const { processes, listeners } = snapshotWindows();
    const plan = planStops(processes, listeners, { selfPid: process.pid });
    if (!plan.length) {
        console.log('Nothing is running.');
        return;
    }

    let failed = 0;
    for (const { label, pid } of plan) {
        const extras = describeTree(processes, pid);
        const what = `${label}${extras.length ? ` (with ${extras.join(', ')})` : ''}, PID ${pid}`;
        if (dryRun) {
            console.log(`[dry-run] Would stop ${what}`);
            continue;
        }
        const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        if (res.status === 0) {
            console.log(`Stopped ${what}`);
        } else {
            failed++;
            console.warn(`Could not stop ${what}`);
        }
    }
    if (failed) process.exit(1);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[Stop All Error]', err.message);
        process.exit(1);
    }
}

module.exports = { planStops, describeTree, nodeServices };
