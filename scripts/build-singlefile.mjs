import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

const res = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.singlefile.config.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_SINGLEFILE: '1' }
});

if (res.status !== 0) {
    process.exit(res.status || 1);
}

const builtIndex = path.join(rootDir, 'dist-singlefile', 'index.html');
const portablePath = path.join(rootDir, 'dist-singlefile', 'EllipsisProse-portable.html');
if (!fs.existsSync(builtIndex)) {
    console.error('[build-singlefile] Expected output missing:', builtIndex);
    process.exit(1);
}

fs.copyFileSync(builtIndex, portablePath);
const sizeMb = (fs.statSync(portablePath).size / (1024 * 1024)).toFixed(2);
console.log(`[build-singlefile] Created ${portablePath} (${sizeMb} MB)`);
