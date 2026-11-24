import type { Config } from 'tailwindcss';

const config: Config = {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                void: 'var(--bg-void)',
                surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
                'surface-elevated': 'var(--bg-surface-elevated)',
                'surface-active': 'var(--bg-surface-active)',
                'surface-subtle': 'var(--bg-surface-subtle)',
                sidebar: 'var(--bg-sidebar)',
                inset: 'rgb(var(--inset-rgb) / <alpha-value>)',
                mist: {
                    50: 'rgb(var(--mist-50-rgb) / <alpha-value>)',
                    100: 'rgb(var(--mist-100-rgb) / <alpha-value>)',
                    200: 'rgb(var(--mist-200-rgb) / <alpha-value>)',
                    300: 'rgb(var(--mist-300-rgb) / <alpha-value>)',
                },
                wash: { DEFAULT: 'var(--wash)', strong: 'var(--wash-strong)' },
                edge: {
                    DEFAULT: 'var(--border-subtle)',
                    soft: 'var(--edge-soft)',
                    strong: 'var(--edge-strong)',
                    300: 'var(--edge-300)',
                    bold: 'var(--edge-bold)',
                    highlight: 'var(--border-highlight)',
                },
                gold: { DEFAULT: 'rgb(var(--accent-gold-rgb) / <alpha-value>)', tint: 'var(--gold-tint)', edge: 'var(--gold-edge)' },
                lift: 'var(--lift)',
                'gold-ink': { DEFAULT: 'var(--gold-ink)', deep: 'var(--gold-ink-deep)' },
                ink: {
                    DEFAULT: 'var(--text-primary)',
                    950: 'var(--ink-950)',
                    900: 'var(--ink-900)',
                    800: 'var(--ink-800)',
                    700: 'var(--ink-700)',
                    600: 'var(--ink-600)',
                    500: 'var(--ink-500)',
                    400: 'var(--ink-400)',
                    300: 'var(--ink-300)',
                },
                btn: {
                    DEFAULT: 'var(--btn-bg)',
                    hover: 'var(--btn-bg-hover)',
                    ink: 'var(--btn-ink)',
                    accent: 'var(--btn-accent)',
                },
                ember: { tint: 'var(--ember-tint)', 'tint-strong': 'var(--ember-tint-strong)', edge: 'var(--ember-edge)', 600: 'var(--ember-600)', 700: 'var(--ember-700)', 800: 'var(--ember-800)', 900: 'var(--ember-900)', 950: 'var(--ember-950)' },
                blush: { tint: 'var(--blush-tint)', 'tint-strong': 'var(--blush-tint-strong)', edge: 'var(--blush-edge)', 600: 'var(--blush-600)', 700: 'var(--blush-700)', 800: 'var(--blush-800)', 900: 'var(--blush-900)', 950: 'var(--blush-950)' },
                sage: { DEFAULT: 'var(--accent-emerald)', tint: 'var(--sage-tint)', 'tint-strong': 'var(--sage-tint-strong)', edge: 'var(--sage-edge)', 600: 'var(--sage-600)', 700: 'var(--sage-700)', 800: 'var(--sage-800)', 900: 'var(--sage-900)' },
                plum: { tint: 'var(--plum-tint)', 'tint-strong': 'var(--plum-tint-strong)', edge: 'var(--plum-edge)', 600: 'var(--plum-600)', 700: 'var(--plum-700)', 800: 'var(--plum-800)', 900: 'var(--plum-900)', 950: 'var(--plum-950)' },
                azure: { tint: 'var(--azure-tint)', edge: 'var(--azure-edge)', 700: 'var(--azure-700)', 800: 'var(--azure-800)', 900: 'var(--azure-900)' },
                iris: { tint: 'var(--iris-tint)', 'tint-strong': 'var(--iris-tint-strong)', edge: 'var(--iris-edge)', 700: 'var(--iris-700)', 800: 'var(--iris-800)' },
                lagoon: { tint: 'var(--lagoon-tint)', 'tint-strong': 'var(--lagoon-tint-strong)', edge: 'var(--lagoon-edge)', 800: 'var(--lagoon-800)' },
                tangerine: { tint: 'var(--tangerine-tint)', edge: 'var(--tangerine-edge)', 800: 'var(--tangerine-800)' },
                orchid: { tint: 'var(--orchid-tint)', edge: 'var(--orchid-edge)', 800: 'var(--orchid-800)' },
            }
        }
    },
    plugins: []
};

export default config;
