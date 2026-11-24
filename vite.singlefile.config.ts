import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: './',
    plugins: [
        react(),
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
