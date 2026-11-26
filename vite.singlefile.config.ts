import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

export default defineConfig({
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION)
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
