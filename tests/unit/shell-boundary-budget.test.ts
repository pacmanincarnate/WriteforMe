import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `src/compat/shellBoundary.ts` lets the app shell re-label a value for a module that declares
 * the same data differently. Every use is a place where two declarations still disagree. These
 * budgets are the counts at the time the shell became type-checked: lower them as shared types
 * are reconciled, never raise them.
 */
const HAND_OFF_BUDGET = 103;
const STORY_SLICE_BUDGET = 26;

const shell = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const count = (pattern: RegExp): number => (shell.match(pattern) || []).length;

describe('shell boundary budget', () => {
    it('does not add generic hand-offs', () => {
        expect(count(/\bhandOff\(/g)).toBeLessThanOrEqual(HAND_OFF_BUDGET);
    });

    it('does not add story re-labels', () => {
        expect(count(/\b(storyFor|storyRefFor|setStoryFor)[<(]/g)).toBeLessThanOrEqual(STORY_SLICE_BUDGET);
    });

    it('uses no other escape hatch', () => {
        expect(count(/\bas any\b|@ts-ignore|@ts-expect-error|@ts-nocheck/g)).toBe(0);
    });
});
