// Stages the app files, then runs electron-builder with the version from the root package.json
// (or $ELLIPSISPROSE_VERSION, which the release workflow sets from the git tag).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(fs.readFileSync(path.join(desktopDir, '..', 'package.json'), 'utf8'));
const version = (process.env.ELLIPSISPROSE_VERSION || rootPkg.version).replace(/^v/, '');

const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: desktopDir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) process.exit(r.status || 1);
};

run(process.execPath, [path.join('scripts', 'stage.mjs')]);
const args = ['electron-builder', '--win', '--x64', '--publish', 'never', `--config.extraMetadata.version=${version}`];
if (process.argv.includes('--dir')) args.push('--dir');
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', args);
