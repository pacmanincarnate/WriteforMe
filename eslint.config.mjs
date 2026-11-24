import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
    {
        ignores: ['dist/**', 'dist-singlefile/**', 'node_modules/**', 'scratch/**', 'src/legacy/**', 'tests/e2e/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx,js,jsx}', 'tests/unit/**/*.{ts,tsx,js,jsx}'],
        plugins: {
            'import-x': importX,
            boundaries
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: './tsconfig.json'
                })
            ],
            'boundaries/elements': [
                { type: 'entry', pattern: 'src/*', mode: 'file' },
                { type: 'ui', pattern: ['src/views/**', 'src/components/**', 'src/hooks/**'] },
                { type: 'stores', pattern: ['src/stores/**'] },
                { type: 'pipeline', pattern: ['src/pipeline/**', 'src/services/bridge/**'] },
                { type: 'services', pattern: ['src/services/**'] },
                { type: 'domain', pattern: ['src/domain/**'] },
                { type: 'foundation', pattern: ['src/prompts/**', 'src/config/**', 'src/utils/**', 'src/types/**', 'src/compat/**'] }
            ]
        },
        rules: {
            'import-x/no-cycle': ['error', { maxDepth: 10 }],
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    policies: [
                        { from: { type: 'entry' }, allow: [{ to: { type: ['entry', 'ui', 'stores', 'pipeline', 'services', 'domain', 'foundation'] } }] },
                        { from: { type: 'ui' }, allow: [{ to: { type: ['ui', 'stores', 'pipeline', 'services', 'domain', 'foundation'] } }] },
                        { from: { type: 'stores' }, allow: [{ to: { type: ['stores', 'services', 'domain', 'foundation'] } }] },
                        { from: { type: 'pipeline' }, allow: [{ to: { type: ['pipeline', 'stores', 'services', 'domain', 'foundation'] } }] },
                        { from: { type: 'services' }, allow: [{ to: { type: ['services', 'domain', 'foundation'] } }] },
                        { from: { type: 'domain' }, allow: [{ to: { type: ['domain', 'foundation'] } }] },
                        { from: { type: 'foundation' }, allow: [{ to: { type: 'foundation' } }] }
                    ]
                }
            ]
        }
    }
);
