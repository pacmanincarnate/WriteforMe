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
            'boundaries/files': [
                { pattern: ['src/main.tsx', 'src/App.tsx', 'src/sw.ts'], category: 'entry' }
            ],
            'boundaries/elements': [
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
                        {
                            from: { file: { categories: 'entry' } },
                            allow: [
                                { to: { element: { type: ['ui', 'stores', 'pipeline', 'services', 'domain', 'foundation'] } } },
                                { to: { file: { categories: 'entry' } } }
                            ]
                        },
                        { from: { element: { type: 'ui' } }, allow: [{ to: { element: { type: ['ui', 'stores', 'pipeline', 'services', 'domain', 'foundation'] } } }] },
                        { from: { element: { type: 'stores' } }, allow: [{ to: { element: { type: ['stores', 'services', 'domain', 'foundation'] } } }] },
                        { from: { element: { type: 'pipeline' } }, allow: [{ to: { element: { type: ['pipeline', 'stores', 'services', 'domain', 'foundation'] } } }] },
                        { from: { element: { type: 'services' } }, allow: [{ to: { element: { type: ['services', 'domain', 'foundation'] } } }] },
                        { from: { element: { type: 'domain' } }, allow: [{ to: { element: { type: ['domain', 'foundation'] } } }] },
                        { from: { element: { type: 'foundation' } }, allow: [{ to: { element: { type: 'foundation' } } }] }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/prompts/tiers/**/*.ts'],
        rules: {
            'no-useless-escape': 'off'
        }
    }
);
