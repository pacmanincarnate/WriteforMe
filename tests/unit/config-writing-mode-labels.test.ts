import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WRITING_MODE_LABELS, writingModeLabel } from '@/config';

describe('writing mode labels', () => {
    it('names a story by the same words the writer picks', () => {
        expect(writingModeLabel('novel')).toBe(WRITING_MODE_LABELS.novel);
        expect(writingModeLabel(undefined)).toBe(WRITING_MODE_LABELS.novel);
        expect(writingModeLabel('audio_drama')).toBe(WRITING_MODE_LABELS.audio_drama);
    });

    it('is rendered from the constant, not retyped, where the mode is chosen', () => {
        for (const file of [
            'src/views/dashboard/DashboardView.tsx',
            'src/views/setup/SetupView.tsx'
        ]) {
            const source = readFileSync(file, 'utf8');
            expect(source).toContain('WRITING_MODE_LABELS.novel');
            expect(source).not.toMatch(/>\s*(Standard Novel|Novel|Audio Drama)\s*</);
            expect(source).not.toContain("'Prose'");
        }
    });
});
