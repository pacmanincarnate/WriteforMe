import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

function resolveBuildId(): string {
    const envSha = String(process.env.GITHUB_SHA || '').trim();
    if (envSha) return envSha.slice(0, 7);
    try {
        const sha = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString('utf8')
            .trim();
        if (sha) return sha;
    } catch {
        // Git unavailable
    }
    return `build-${Date.now().toString(36)}`;
}

const APP_BUILD_ID: string = resolveBuildId();

export default defineConfig({
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID)
    },
    plugins: [
        react(),
        {
            name: 'inject-app-version',
            transformIndexHtml(html) {
                return html.replace(/%APP_VERSION%/g, APP_VERSION);
            }
        },
        viteSingleFile({ removeViteModuleLoader: false })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    build: {
        outDir: 'dist-singlefile',
        emptyOutDir: true,
        sourcemap: false,
        cssCodeSplit: false,
        assetsInlineLimit: 100000000,
        chunkSizeWarningLimit: 8000,
        rollupOptions: {
            output: {
                inlineDynamicImports: true
            }
        }
    }
});
