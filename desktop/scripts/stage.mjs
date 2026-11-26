// Copies the parts of the web app the desktop shell runs into desktop/app-files/, which
// electron-builder ships as resources/app-files. Run `npm run build` in the repo root first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktopDir, '..');
const out = path.join(desktopDir, 'app-files');

const FILES = ['server.js', 'audio-studio-bridge.js', 'codex-bridge.js', 'claude-bridge.js', 'LICENSE', 'README.md'];
const DIRS = ['dist'];

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    console.error('dist/index.html is missing. Run "npm run build" in the repository root first.');
    process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) {
    const src = path.join(root, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
}
for (const d of DIRS) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
fs.mkdirSync(path.join(out, 'audiocpp'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'audiocpp'))) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(root, 'audiocpp', f), path.join(out, 'audiocpp', f));
}
fs.copyFileSync(path.join(desktopDir, 'THIRD_PARTY.md'), path.join(out, 'THIRD_PARTY.md'));
// The server and bridges are CommonJS; make sure no parent "type": "module" changes that.
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: 'ellipsisprose-app-files', private: true, type: 'commonjs' }, null, 2));
console.log(`Staged app files in ${path.relative(root, out)}`);
