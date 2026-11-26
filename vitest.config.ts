import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __APP_BUILD_ID__: JSON.stringify('test-build')
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/unit/setup.ts'],
        include: ['tests/unit/**/*.test.{ts,tsx,js,jsx}'],
        // `npm run test:coverage`: summary in the terminal, browsable report in coverage/index.html.
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.d.ts', 'src/sw.ts'],
            reporter: ['text-summary', 'html', 'json-summary'],
            reportsDirectory: 'coverage'
        }
    }
});
