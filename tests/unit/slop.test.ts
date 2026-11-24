import { describe, expect, it } from 'vitest';
import {
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    applyCascadingNameReplacements,
    auditEntityNamesAndPlaces,
    buildEffectiveSlopData,
    buildStoryGrandfatherSet,
    formatSlopAuditForPrompt,
    normalizeSlopConfig,
    scanTextForSlop,
    validateImportedSlopJson
} from '@/domain/slop';

describe('AI Slop & Naming Audit Engine', () => {
    it('exports complete AI_SLOP_REGISTRY categories and patterns', () => {
        expect(Array.isArray(AI_SLOP_REGISTRY.categories)).toBe(true);
        expect(AI_SLOP_REGISTRY.categories.length).toBeGreaterThanOrEqual(15);
        expect(Array.isArray(AI_SLOP_REGISTRY.patterns)).toBe(true);
        expect(Array.isArray(AI_SLOP_REGISTRY.density)).toBe(true);
    });

    it('normalizes slop config and migrates legacy banned phrases without duplicating defaults', () => {
        const cfg = normalizeSlopConfig(null, ['ozone_custom_xyz', '  ']);
        expect(cfg._migratedLegacy).toBe(true);
        expect(cfg.customItemsByCategory.custom_user).toContain('ozone_custom_xyz');
        const eff = buildEffectiveSlopData(cfg, ['extra_phrase_abc']);
        const customCat = eff.categories.find((c) => c.id === 'custom_user');
        expect(customCat?.items).toContain('ozone_custom_xyz');
        expect(customCat?.items).toContain('extra_phrase_abc');
    });

    it('validates imported slop JSON packs strictly', () => {
        expect(validateImportedSlopJson(null).valid).toBe(false);
        expect(validateImportedSlopJson({ categories: [{ id: 'bad' }] }).valid).toBe(false);
        expect(validateImportedSlopJson({ categories: [{ id: 'ok', items: ['test'] }] }).valid).toBe(true);
    });

    it('scans prose for rhetorical patterns, closers, and clustered flags and formats prompt report', () => {
        const prose = [
            'Maren checked the brass lock.',
            'It was not just cold, it was glacial.',
            'He exhaled a breath he didn’t know he was holding.',
            'She knew then it was only the beginning.'
        ].join(' ');
        const report = scanTextForSlop(prose, { slopConfig: DEFAULT_SLOP_CONFIG });
        expect(report.summary.hasActionableItems).toBe(true);
        expect(report.closerHits.length).toBeGreaterThan(0);
        expect(report.patternHits.some((h) => h.categoryId === 'not_x_but_y')).toBe(true);

        const formatted = formatSlopAuditForPrompt(report, { maxItems: 5 });
        expect(formatted.length).toBeGreaterThan(10);
    });

    it('masks dialogue when scanning audio drama scripts for narration-only assistant voice', () => {
        const script = [
            'Narrator: She opened the door.',
            'Maren: "Of course! I remember, we left early."'
        ].join('\n');
        const report = scanTextForSlop(script, { slopConfig: DEFAULT_SLOP_CONFIG, isAudioDrama: true });
        const assistantInDialogue = report.allHits.filter((h) => h.categoryId === 'assistant_voice');
        expect(assistantInDialogue.length).toBe(0);
    });

    it('audits entity names and grandfathers user-supplied concept/lore names', () => {
        const bad = auditEntityNamesAndPlaces({
            characters: [{ name: 'Elara Vance', role: 'Protagonist' }],
            places: [{ name: 'Shadowhaven' }]
        });
        expect(bad.valid).toBe(false);
        expect(bad.violations.length).toBeGreaterThanOrEqual(2);
        expect(bad.hardViolations.length).toBe(1);

        const grandfathered = buildStoryGrandfatherSet({ concept: 'Elara Vance sails from Shadowhaven.' });
        expect(grandfathered.has('Elara Vance')).toBe(true);
        const ok = auditEntityNamesAndPlaces({
            characters: [{ name: 'Elara Vance', role: 'Protagonist' }],
            places: [{ name: 'Shadowhaven' }],
            story: { concept: 'Elara Vance sails from Shadowhaven.' }
        });
        expect(ok.valid).toBe(true);
    });

    it('applies cascading name replacements in longest-first order with ASCII word boundaries', () => {
        const replaced = applyCascadingNameReplacements('Elara Vance spoke to Elara near Elaraville.', {
            'Elara Vance': 'Mira Solis',
            Elara: 'Mira'
        });
        expect(replaced).toBe('Mira Solis spoke to Mira near Elaraville.');
    });
});
