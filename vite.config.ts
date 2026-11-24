import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: process.env.VITE_BASE || './',
    plugins: [react()],
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
                    'markdown-vendor': ['marked', 'dompurify']
                }
            },
            onwarn(warning, defaultHandler) {
                if (warning.code === 'CIRCULAR_DEPENDENCY') {
                    const msg = String(warning.message || '');
                    const isNodeModules = msg.includes('node_modules');
                    const isLegacy = msg.includes('src/legacy') || msg.includes('src\\legacy');
                    if (!isNodeModules && !isLegacy) {
                        throw new Error(`Circular dependency detected in modular source: ${msg}`);
                    }
                    return;
                }
                defaultHandler(warning);
            }
        }
    }
});
