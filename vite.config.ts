import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
        // Git unavailable (e.g. source archive without .git)
    }
    return `build-${Date.now().toString(36)}`;
}

const APP_BUILD_ID: string = resolveBuildId();

/**
 * File types in dist/ that the service worker stores for offline use. If the app starts shipping
 * a new type (say .svg or .wasm), add it here; scripts/check-precache.mjs fails the build until
 * every built file is covered. See the header of src/sw.ts.
 */
const PRECACHE_GLOBS = ['**/*.{html,js,mjs,css,json,webmanifest,png,jpg,jpeg,ico,gif,webp}'];

export default defineConfig({
    base: process.env.VITE_BASE || './',
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
        {
            name: 'emit-version-manifest',
            closeBundle() {
                const distDir = path.resolve(__dirname, 'dist');
                if (!fs.existsSync(distDir)) return;
                const manifest = {
                    version: APP_VERSION,
                    buildId: APP_BUILD_ID,
                    builtAt: new Date().toISOString()
                };
                fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
            }
        },
        // Compiles src/sw.ts to dist/sw.js and injects the list of built files into it.
        // Registration stays in src/main.tsx and the manifest stays in public/.
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectRegister: false,
            manifest: false,
            injectManifest: {
                globPatterns: PRECACHE_GLOBS,
                globIgnores: ['**/version.json'],
                // The main bundle and the PDF worker are a few MB each; all of it must be offline.
                maximumFileSizeToCacheInBytes: 12 * 1024 * 1024
            }
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        chunkSizeWarningLimit: 3500,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom'],
                    'markdown-vendor': ['marked', 'dompurify'],
                    'icons-vendor': ['lucide-react']
                }
            },
            onwarn(warning, defaultHandler) {
                if (warning.code === 'CIRCULAR_DEPENDENCY') {
                    const msg = String(warning.message || '');
                    const isNodeModules = msg.includes('node_modules');
                    if (!isNodeModules) {
                        throw new Error(`Circular dependency detected in modular source: ${msg}`);
                    }
                    return;
                }
                defaultHandler(warning);
            }
        }
    }
});
