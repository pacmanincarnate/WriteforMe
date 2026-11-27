#!/usr/bin/env node
/**
 * Ensures EllipsisProse CLI scripts run under Node.js >= 20.19.0 even when an older
 * system-wide Node (such as Machine PATH Node 18) sits ahead of a user-level Node 22 install.
 *
 * Written strictly with Node 18-compatible ESM APIs so older Node binaries can parse it
 * cleanly before handing off to the modern Node runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/** Returns true when `versionStr` (e.g. "22.23.1" or "v20.19.0") is >= 20.19.0. */
export function isSupportedNodeVersion(versionStr) {
    const clean = String(versionStr || '').trim().replace(/^v/i, '');
    const parts = clean.split('.');
    const major = Number.parseInt(parts[0] || '0', 10);
    const minor = Number.parseInt(parts[1] || '0', 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
    return major > 20 || (major === 20 && minor >= 19);
}

/** Returns a clone of `baseEnv` with `path.dirname(nodeExePath)` prepended cleanly to PATH/Path. */
export function buildEnvWithModernNode(nodeExePath, baseEnv = process.env) {
    const env = { ...baseEnv };
    const nodeDir = path.dirname(nodeExePath);
    const isWin = process.platform === 'win32';
    const sep = path.delimiter;

    const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === 'path');
    const primaryKey = isWin ? (pathKeys[0] || 'Path') : 'PATH';
    const existingRaw = pathKeys.map((k) => env[k]).filter(Boolean).join(sep);

    for (const k of pathKeys) {
        if (k !== primaryKey) delete env[k];
    }

    const norm = (p) => (isWin ? p.replace(/[\\/]+$/, '').toLowerCase() : p.replace(/\/+$/, ''));
    const targetNorm = norm(nodeDir);
    const parts = existingRaw
        .split(sep)
        .map((p) => p.trim())
        .filter((p) => p && norm(p) !== targetNorm);

    env[primaryKey] = [nodeDir, ...parts].join(sep);
    return env;
}

/** Finds an installed Node executable with version >= 20.19.0, or null if none is available. */
export function findModernNodeExecutable() {
    if (isSupportedNodeVersion(process.versions.node)) {
        return process.execPath;
    }

    const isWin = process.platform === 'win32';
    const binName = isWin ? 'node.exe' : 'node';
    const candidates = [];

    if (isWin) {
        if (process.env.LOCALAPPDATA) {
            candidates.push(path.join(process.env.LOCALAPPDATA, 'hermes', 'node', binName));
        }
        if (process.env.NVM_SYMLINK) {
            candidates.push(path.join(process.env.NVM_SYMLINK, binName));
        }
        if (process.env.VOLTA_HOME) {
            candidates.push(path.join(process.env.VOLTA_HOME, 'bin', binName));
        }
    }

    const pathVal = Object.keys(process.env)
        .filter((k) => k.toLowerCase() === 'path')
        .map((k) => process.env[k])
        .filter(Boolean)
        .join(path.delimiter);

    for (const dir of pathVal.split(path.delimiter)) {
        const trimmed = dir.trim();
        if (trimmed) {
            candidates.push(path.join(trimmed, binName));
        }
    }

    const seen = new Set();
    const currentNorm = isWin ? process.execPath.toLowerCase() : process.execPath;

    for (const candidate of candidates) {
        if (!candidate) continue;
        const resolved = path.resolve(candidate);
        const key = isWin ? resolved.toLowerCase() : resolved;
        if (key === currentNorm || seen.has(key)) continue;
        seen.add(key);

        if (!fs.existsSync(resolved)) continue;
        try {
            const probe = spawnSync(resolved, ['-p', 'process.versions.node'], {
                encoding: 'utf8',
                windowsHide: true
            });
            if (probe.status === 0 && isSupportedNodeVersion(probe.stdout)) {
                return resolved;
            }
        } catch {
            // Skip unusable candidate
        }
    }

    return null;
}

function runCli() {
    const [targetScript, ...restArgs] = process.argv.slice(2);
    if (!targetScript) {
        console.error('Usage: node scripts/run-node20.mjs <scriptPath> [...args]');
        process.exit(2);
    }

    const modernNode = findModernNodeExecutable();
    if (!modernNode) {
        console.error(
            `[EllipsisProse] Node.js >= 20.19.0 is required (current: v${process.versions.node} at ${process.execPath}). Install Node 22 LTS from https://nodejs.org.`
        );
        process.exit(1);
    }

    const resolvedTarget = path.resolve(ROOT_DIR, targetScript);
    const res = spawnSync(modernNode, [resolvedTarget, ...restArgs], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: buildEnvWithModernNode(modernNode)
    });

    if (res.error) {
        console.error(`[EllipsisProse] Failed to launch ${resolvedTarget}: ${res.error.message}`);
        process.exit(1);
    }
    process.exit(res.status ?? 1);
}

const isEntrypoint =
    process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isEntrypoint) {
    runCli();
}
