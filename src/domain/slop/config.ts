import type {
    SlopCategory,
    SlopConfig,
    SlopDensityRule,
    SlopPack,
    SlopPattern,
    SlopSeverity,
    Story
} from '@/types';
import {
    AI_SLOP_REGISTRY,
    DEFAULT_SLOP_CONFIG,
    cloneJsonSafe,
    getAllDefaultItemLowerSet
} from './registry';

export interface StoryGrandfatherSet {
    exactLower: Set<string>;
    tokenLower: Set<string>;
    has(candidate: string): boolean;
}

export interface EffectiveSlopData {
    name: string;
    version: string;
    author: string;
    categories: SlopCategory[];
    patterns: SlopPattern[];
    density: SlopDensityRule[];
}

export function normalizeSlopConfig(
    rawConfig?: Partial<SlopConfig> | null,
    legacyBannedPhrases?: string[] | null
): SlopConfig {
    const base = cloneJsonSafe(DEFAULT_SLOP_CONFIG) as SlopConfig;
    if (rawConfig && typeof rawConfig === 'object') {
        if (typeof rawConfig.enableSlopAudit === 'boolean') base.enableSlopAudit = rawConfig.enableSlopAudit;
        if (typeof rawConfig.enableUpstreamNameAudit === 'boolean') {
            base.enableUpstreamNameAudit = rawConfig.enableUpstreamNameAudit;
        }
        if (typeof rawConfig.enableNameBank === 'boolean') base.enableNameBank = rawConfig.enableNameBank;
        if (rawConfig.emDashMode === 'off' || rawConfig.emDashMode === 'density' || rawConfig.emDashMode === 'strict') {
            base.emDashMode = rawConfig.emDashMode;
        }
        const maxNum = Number(rawConfig.emDashMaxPer1k);
        if (Number.isFinite(maxNum) && maxNum >= 0 && maxNum <= 50) {
            base.emDashMaxPer1k = maxNum;
        }
        if (rawConfig.categorySeverities && typeof rawConfig.categorySeverities === 'object') {
            Object.keys(rawConfig.categorySeverities).forEach((k) => {
                const v = rawConfig.categorySeverities?.[k];
                if (v === 'hard' || v === 'flag' || v === 'off') {
                    base.categorySeverities[k] = v;
                }
            });
        }
        if (rawConfig.customItemsByCategory && typeof rawConfig.customItemsByCategory === 'object') {
            Object.keys(rawConfig.customItemsByCategory).forEach((k) => {
                const arr = rawConfig.customItemsByCategory?.[k];
                if (Array.isArray(arr)) {
                    base.customItemsByCategory[k] = Array.from(
                        new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))
                    );
                }
            });
        }
        if (rawConfig.removedDefaultItems && typeof rawConfig.removedDefaultItems === 'object') {
            Object.keys(rawConfig.removedDefaultItems).forEach((k) => {
                const arr = rawConfig.removedDefaultItems?.[k];
                if (Array.isArray(arr)) {
                    base.removedDefaultItems[k] = arr.map((x) => String(x || '').trim()).filter(Boolean);
                }
            });
        }
        if (rawConfig.importedPack && typeof rawConfig.importedPack === 'object' && Array.isArray(rawConfig.importedPack.categories)) {
            base.importedPack = rawConfig.importedPack;
        }
        if (rawConfig.importedPackMeta && typeof rawConfig.importedPackMeta === 'object') {
            base.importedPackMeta = rawConfig.importedPackMeta;
        }
    }

    if (Array.isArray(legacyBannedPhrases) && legacyBannedPhrases.length > 0 && (!rawConfig || !rawConfig._migratedLegacy)) {
        const knownDefaults = getAllDefaultItemLowerSet();
        const existingCustom = Array.isArray(base.customItemsByCategory.custom_user)
            ? base.customItemsByCategory.custom_user.slice()
            : [];
        const existingCustomLower = new Set(existingCustom.map((x) => x.toLowerCase()));
        for (let i = 0; i < legacyBannedPhrases.length; i++) {
            const lp = String(legacyBannedPhrases[i] || '').trim();
            if (!lp) continue;
            const lpLow = lp.toLowerCase();
            if (!knownDefaults.has(lpLow) && !existingCustomLower.has(lpLow)) {
                existingCustom.push(lp);
                existingCustomLower.add(lpLow);
            }
        }
        base.customItemsByCategory.custom_user = existingCustom;
    }
    base._migratedLegacy = true;
    return base;
}

export function validateImportedSlopJson(parsed: unknown): { valid: boolean; error?: string } {
    const obj = parsed as Partial<SlopPack> | null;
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.categories)) {
        return { valid: false, error: 'Invalid ai-slop.json: expected a JSON object with a "categories" array.' };
    }
    for (let i = 0; i < obj.categories.length; i++) {
        const cat = obj.categories[i];
        if (!cat || typeof cat !== 'object' || !cat.id || !Array.isArray(cat.items)) {
            return { valid: false, error: `Invalid category at index ${i}: expected "id" and "items" array.` };
        }
    }
    return { valid: true };
}

export function buildEffectiveSlopData(
    slopConfig?: SlopConfig | null,
    extraCustomPhrases?: string[] | null
): EffectiveSlopData {
    const cfg = slopConfig && typeof slopConfig === 'object' ? slopConfig : DEFAULT_SLOP_CONFIG;
    const sourcePack: SlopPack = (cfg.importedPack && Array.isArray(cfg.importedPack.categories))
        ? cfg.importedPack
        : AI_SLOP_REGISTRY;
    const sevOverrides = cfg.categorySeverities || {};
    const customMap = cfg.customItemsByCategory || {};
    const removedMap = cfg.removedDefaultItems || {};

    const seenCatIds = new Set<string>();
    const categories: SlopCategory[] = [];

    function appendCategory(cat: SlopCategory) {
        if (!cat || !cat.id || seenCatIds.has(cat.id)) return;
        seenCatIds.add(cat.id);
        const sev: SlopSeverity = sevOverrides[cat.id] || cat.severity || 'flag';
        const removedSet = new Set((removedMap[cat.id] || []).map((x) => String(x).toLowerCase()));
        const customItems = Array.isArray(customMap[cat.id]) ? customMap[cat.id] : [];
        const merged: string[] = [];
        const seenItems = new Set<string>();
        const rawItems = (cat.items || []).concat(customItems);
        for (let j = 0; j < rawItems.length; j++) {
            const it = String(rawItems[j] || '').trim();
            if (!it) continue;
            const low = it.toLowerCase();
            if (removedSet.has(low) && customItems.indexOf(it) === -1) continue;
            if (!seenItems.has(low)) {
                seenItems.add(low);
                merged.push(it);
            }
        }
        const group = cat.group || (
            /^(?:names_|surnames|places)/.test(cat.id)
                ? 'names_places'
                : (cat.id === 'custom_user' ? 'custom' : 'prose_style')
        );
        categories.push({
            id: cat.id,
            group,
            title: cat.title || cat.id,
            severity: sev,
            match: cat.match || 'phrase',
            note: cat.note || '',
            items: merged
        });
    }

    for (let i = 0; i < sourcePack.categories.length; i++) {
        appendCategory(sourcePack.categories[i]);
    }
    for (let b = 0; b < AI_SLOP_REGISTRY.categories.length; b++) {
        const builtin = AI_SLOP_REGISTRY.categories[b];
        if (builtin.id === 'ellipsis_clinical_mastermind' || builtin.id === 'custom_user') {
            appendCategory(builtin);
        }
    }
    if (Array.isArray(extraCustomPhrases) && extraCustomPhrases.length > 0) {
        const allBuiltIn = getAllDefaultItemLowerSet();
        const customCat = categories.find((c) => c.id === 'custom_user');
        if (customCat) {
            const cSeen = new Set(customCat.items.map((x) => x.toLowerCase()));
            for (let k = 0; k < extraCustomPhrases.length; k++) {
                const ep = String(extraCustomPhrases[k] || '').trim();
                if (!ep) continue;
                const epLow = ep.toLowerCase();
                if (!allBuiltIn.has(epLow) && !cSeen.has(epLow)) {
                    cSeen.add(epLow);
                    customCat.items.push(ep);
                }
            }
        }
    }

    const basePatterns = Array.isArray(sourcePack.patterns) && sourcePack.patterns.length > 0
        ? sourcePack.patterns
        : (AI_SLOP_REGISTRY.patterns || []);
    const patterns: SlopPattern[] = basePatterns.map((p) => {
        let pSev: SlopSeverity = sevOverrides[p.id] || p.severity || 'flag';
        if (p.id === 'em_dash') {
            const mode = cfg.emDashMode || 'density';
            pSev = mode === 'off' ? 'off' : (mode === 'strict' ? 'hard' : 'flag');
        }
        return {
            id: p.id,
            title: p.title,
            severity: pSev,
            note: p.note || ''
        };
    });

    const baseDensity = Array.isArray(sourcePack.density) && sourcePack.density.length > 0
        ? sourcePack.density
        : (AI_SLOP_REGISTRY.density || []);
    const density: SlopDensityRule[] = baseDensity.map((d) => ({
        id: d.id,
        title: d.title,
        severity: sevOverrides[d.id] || d.severity || 'flag',
        window: d.window,
        count: d.count
    }));

    return {
        name: sourcePack.name || AI_SLOP_REGISTRY.name || 'AI slop audit list',
        version: sourcePack.version || AI_SLOP_REGISTRY.version || '1.0',
        author: sourcePack.author || AI_SLOP_REGISTRY.author || '',
        categories,
        patterns,
        density
    };
}

export function exportSlopConfigAsJson(slopConfig?: SlopConfig | null) {
    const eff = buildEffectiveSlopData(slopConfig);
    return {
        name: eff.name,
        version: eff.version,
        author: eff.author,
        exportedAt: new Date().toISOString(),
        emDashMode: (slopConfig && slopConfig.emDashMode) || 'density',
        emDashMaxPer1k: (slopConfig && slopConfig.emDashMaxPer1k) || 3,
        categories: eff.categories.map((c) => ({
            id: c.id,
            title: c.title,
            severity: c.severity,
            match: c.match,
            note: c.note,
            items: c.items
        })),
        patterns: eff.patterns.map((p) => ({
            id: p.id,
            title: p.title,
            severity: p.severity,
            note: p.note
        })),
        density: eff.density
    };
}

export function buildStoryGrandfatherSet(
    story?: Partial<Story> | null,
    options?: { includeCast?: boolean }
): StoryGrandfatherSet {
    const opts = options || {};
    const includeCast = opts.includeCast !== false;
    const exactLower = new Set<string>();
    const tokenLower = new Set<string>();

    function addTerm(raw: unknown) {
        const s = String(raw || '').trim();
        if (!s || s.length < 2) return;
        const low = s.toLowerCase();
        exactLower.add(low);
        const parts = low.split(/[\s,]+/).filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].length >= 2) tokenLower.add(parts[i]);
        }
    }

    function extractCapitalizedFromUserText(txt: unknown) {
        if (!txt || typeof txt !== 'string') return;
        const rx = /\b[A-Z][a-zA-Z'’-]{2,}\b/g;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(txt)) !== null) {
            addTerm(m[0]);
        }
    }

    if (story && typeof story === 'object') {
        extractCapitalizedFromUserText(story.concept);
        extractCapitalizedFromUserText(story.author_note);

        if (Array.isArray(story.lore)) {
            for (let li = 0; li < story.lore.length; li++) {
                const lItem = story.lore[li] as Record<string, unknown> | undefined;
                if (!lItem || lItem.topic === 'Status Quo Setting') continue;
                addTerm(lItem.topic);
                addTerm(lItem.keyword);
                extractCapitalizedFromUserText(lItem.detail || lItem.text || '');
            }
        }

        if (includeCast) {
            const castArr = [
                ...(Array.isArray(story.cast) ? story.cast : []),
                ...(Array.isArray(story.characters) ? story.characters : [])
            ];
            for (let ci = 0; ci < castArr.length; ci++) {
                const ch = castArr[ci] as (Record<string, unknown> | string | null | undefined);
                if (!ch) continue;
                addTerm(typeof ch === 'string' ? ch : ch.name);
                if (typeof ch === 'object' && Array.isArray(ch.aliases)) {
                    for (let ai = 0; ai < ch.aliases.length; ai++) addTerm(ch.aliases[ai]);
                }
            }
        }

        if (Array.isArray(story.slop_allowlist)) {
            for (let si = 0; si < story.slop_allowlist.length; si++) {
                addTerm(story.slop_allowlist[si]);
            }
        }

        const harness = story.editorial_harness as Record<string, unknown> | undefined;
        const constitution = harness?.constitution as Record<string, unknown> | undefined;
        const overrides = harness && (
            harness.customConstitutionOverrides ||
            constitution?.intentionalOverrides ||
            harness.novelignore
        );
        if (Array.isArray(overrides)) {
            for (let oi = 0; oi < overrides.length; oi++) {
                const ov = overrides[oi] as Record<string, unknown> | undefined;
                if (ov && ov.pattern) addTerm(ov.pattern);
            }
        }
    }

    return {
        exactLower,
        tokenLower,
        has(candidate: string): boolean {
            const c = String(candidate || '').trim().toLowerCase();
            if (!c) return false;
            if (exactLower.has(c) || tokenLower.has(c)) return true;
            const parts = c.split(/\s+/).filter(Boolean);
            return parts.length > 1 && parts.every((p) => tokenLower.has(p));
        }
    };
}
