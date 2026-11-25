/**
 * Fails the build when a file in dist/ is missing from the service worker's precache list.
 * Offline support depends on that list being complete; see the header of src/sw.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const workerPath = path.join(distDir, 'sw.js');

if (!fs.existsSync(workerPath)) {
    console.error('[check-precache] dist/sw.js is missing. The build did not produce a service worker.');
    process.exit(1);
}

const worker = fs.readFileSync(workerPath, 'utf8');
if (worker.includes('__WB_MANIFEST')) {
    console.error('[check-precache] dist/sw.js still contains the __WB_MANIFEST placeholder.');
    process.exit(1);
}

/** Files that must not be precached. */
const EXEMPT = new Set(['sw.js', '.nojekyll']);

function listFiles(dir, prefix = '') {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
    });
}

const files = listFiles(distDir).filter((file) => !EXEMPT.has(file) && !file.endsWith('.map'));
const missing = files.filter((file) => !worker.includes(`"${file}"`));

if (missing.length > 0) {
    console.error('[check-precache] These built files are not in the offline precache list:');
    for (const file of missing) console.error(`  - ${file}`);
    console.error('Add their extension to PRECACHE_GLOBS in vite.config.ts (see the header of src/sw.ts).');
    process.exit(1);
}

const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(distDir, file)).size, 0);
console.log(`[check-precache] ${files.length} files precached for offline use (${(bytes / (1024 * 1024)).toFixed(2)} MB).`);
