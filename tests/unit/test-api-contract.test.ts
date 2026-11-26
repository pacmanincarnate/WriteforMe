import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    EXTERNAL_CONTRACT_GLOBALS,
    PUBLIC_WINDOW_CONTRACT,
    TEST_API_APP_GLOBALS,
    TEST_API_MODULE_GLOBALS
} from '@/compat/testApi';

const read = (rel: string): string => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** Browser built-ins and names the suite itself creates on the page. */
const NOT_APP_PROVIDED = (name: string): boolean => name === 'innerWidth' || name.startsWith('__golden');

function windowNamesUsedBy(files: string[]): string[] {
    const source = files.map(read).join('\n');
    return [...new Set([...source.matchAll(/window\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
        .filter((name) => !NOT_APP_PROVIDED(name))
        .sort();
}

describe('public window contract (src/compat/testApi.ts)', () => {
    beforeAll(async () => {
        await import('@/legacy/setupGlobals');
        await import('@/legacy/registerFoundationGlobals');
        await import('@/legacy/registerDomainGlobals');
        await import('@/legacy/registerServiceGlobals');
        await import('@/legacy/registerStoreGlobals');
        await import('@/legacy/registerPipelineGlobals');
        await import('@/legacy/registerUiGlobals');
    }, 60000);

    it('lists exactly the globals the golden suite uses', () => {
        const used = windowNamesUsedBy(['tests/e2e/golden_suite.mjs', 'tests/e2e/fixtures/mockLlm.js']);
        // A failure here means the suite started (or stopped) using a window global: add it to
        // (or remove it from) src/compat/testApi.ts so the dependency stays visible.
        expect(used).toEqual([...PUBLIC_WINDOW_CONTRACT].sort());
    });

    it('has no duplicates', () => {
        expect(new Set(PUBLIC_WINDOW_CONTRACT).size).toBe(PUBLIC_WINDOW_CONTRACT.length);
    });

    it('every module-level global is published at module load', () => {
        const host = window as unknown as Record<string, unknown>;
        const missing = TEST_API_MODULE_GLOBALS.filter((name) => host[name] === undefined);
        expect(missing).toEqual([]);
    });

    it('every app-level global is published by the app shell', () => {
        const shell = [
            read('src/App.tsx'),
            ...fs
                .readdirSync(path.resolve(process.cwd(), 'src/hooks'))
                .map((file) => read(`src/hooks/${file}`))
        ].join('\n');
        const missing = TEST_API_APP_GLOBALS.filter((name) => !shell.includes(`window.${name} = `) && !shell.includes(`publishAppGlobal('${name}', `));
        expect(missing).toEqual([]);
    });

    it('the external contracts are still honoured in src/', () => {
        expect(EXTERNAL_CONTRACT_GLOBALS).toEqual(['EllipsisProseBridge', '__callAIOverride']);
        expect(read('src/hooks/useMcpBridge.ts')).toContain('EllipsisProseBridge');
        expect(read('src/pipeline/aiDispatch.ts')).toContain('__callAIOverride');
    });
});
