'use strict';

/**
 * Starts, watches and stops the processes the desktop app owns. Every child is killed with its
 * whole process tree on quit (ComfyUI and the audio bridge both start grandchildren).
 */

const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const LOG_LINES = 400;

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 800) {
    return new Promise((resolve) => {
        const s = net.createConnection({ port, host });
        const done = (v) => { s.destroy(); resolve(v); };
        s.once('connect', () => done(true));
        s.once('error', () => done(false));
        s.setTimeout(timeoutMs, () => done(false));
    });
}

function httpOk(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            res.resume();
            resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400);
        });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

async function waitFor(fn, { timeoutMs = 30000, intervalMs = 300, isAlive = () => true } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn()) return true;
        if (!isAlive()) return false;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}

function killTree(child) {
    if (!child || child.exitCode !== null || child.killed) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { try { child.kill('SIGTERM'); } catch (__) { /* gone */ } }
    }
}

class Supervisor {
    constructor({ onChange = () => {} } = {}) {
        this.services = new Map();
        this.onChange = onChange;
    }

    /**
     * @param {string} id
     * @param {{command:string,args:string[],cwd?:string,env?:object,healthUrl?:string,port?:number,readyTimeoutMs?:number}} spec
     */
    async start(id, spec) {
        const existing = this.services.get(id);
        if (existing && existing.child && existing.child.exitCode === null) return existing;

        if (spec.port && await isPortOpen(spec.port)) {
            // Something (maybe the user's own copy) already serves this port. Use it, don't fight it.
            const svc = { id, status: 'external', child: null, log: [`Port ${spec.port} is already in use; using the running service.`] };
            this.services.set(id, svc);
            this.onChange(id, svc);
            return svc;
        }

        const child = spawn(spec.command, spec.args || [], {
            cwd: spec.cwd,
            env: { ...process.env, ...(spec.env || {}) },
            // KoboldCpp's own model picker is a window; hiding it would leave nothing to click.
            windowsHide: spec.hideWindow !== false,
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const svc = { id, status: 'starting', child, log: [] };
        this.services.set(id, svc);
        const push = (chunk) => {
            for (const line of String(chunk).split(/\r?\n/)) {
                if (!line) continue;
                svc.log.push(line);
                if (svc.log.length > LOG_LINES) svc.log.shift();
            }
            this.onChange(id, svc);
        };
        child.stdout.on('data', push);
        child.stderr.on('data', push);
        child.on('error', (err) => { svc.status = 'failed'; push(`[desktop] ${err.message}`); });
        child.on('exit', (code, signal) => {
            if (svc.status !== 'stopped') svc.status = code === 0 ? 'stopped' : 'failed';
            push(`[desktop] exited (code ${code}${signal ? `, signal ${signal}` : ''})`);
        });
        this.onChange(id, svc);

        if (spec.healthUrl) {
            const ok = await waitFor(() => httpOk(spec.healthUrl), {
                timeoutMs: spec.readyTimeoutMs || 30000,
                isAlive: () => child.exitCode === null
            });
            if (svc.status === 'starting') svc.status = ok ? 'running' : (child.exitCode === null ? 'unresponsive' : 'failed');
            if (svc.status === 'unresponsive') {
                // Still alive (e.g. loading a large model, or waiting on its own launcher): keep checking.
                const timer = setInterval(async () => {
                    if (svc.status !== 'unresponsive' || child.exitCode !== null) { clearInterval(timer); return; }
                    if (await httpOk(spec.healthUrl)) { svc.status = 'running'; clearInterval(timer); this.onChange(id, svc); }
                }, 5000);
                timer.unref();
            }
        } else if (svc.status === 'starting') {
            svc.status = 'running';
        }
        this.onChange(id, svc);
        return svc;
    }

    stop(id) {
        const svc = this.services.get(id);
        if (!svc) return;
        svc.status = 'stopped';
        killTree(svc.child);
        this.onChange(id, svc);
    }

    stopAll() {
        for (const id of this.services.keys()) this.stop(id);
    }

    status(id) {
        const svc = this.services.get(id);
        return svc ? { status: svc.status, log: svc.log.slice(-60) } : { status: 'stopped', log: [] };
    }
}

module.exports = { Supervisor, isPortOpen, httpOk, waitFor, killTree };
