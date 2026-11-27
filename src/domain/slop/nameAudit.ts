import type {
    CastMember,
    EntityNameAuditReport,
    EntityNameViolation,
    SlopCategory,
    SlopConfig,
    SlopPattern,
    Story
} from '@/types';
import {
    DEFAULT_SLOP_CONFIG,
    NO_DERIVATIVE_NAME_CATS,
    PLACE_SUFFIX_EXCLUSIONS,
    PREFIX_DERIVATIVE_NAME_CATS,
    escapeRx,
    isAsciiAlnum,
    isAsciiLetter
} from './registry';
import { buildEffectiveSlopData, buildStoryGrandfatherSet } from './config';
import { findBoundaryMatches, isAtSentenceStart } from './scanner';
import { getNameBanks, inventedWordsOf } from '@/domain/names';

export function extractCandidatePlaceNames(
    text: string,
    excludeCast?: Array<CastMember | string> | null
): string[] {
    if (!text || typeof text !== 'string') return [];
    const castTokens = new Set<string>();
    (excludeCast || []).forEach((c) => {
        const nm = typeof c === 'string' ? c : (c && c.name);
        if (!nm) return;
        nm.toLowerCase().split(/\s+/).forEach((t) => { if (t) castTokens.add(t); });
    });
    const candidates: string[] = [];
    const seen = new Set<string>();
    const rx = /\b(?:The\s+)?[A-Z][a-z]+(?:\s+(?:of\s+)?[A-Z][a-z]+){0,3}\b/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
        const phrase = m[0].trim();
        if (phrase.length < 3) continue;
        const low = phrase.toLowerCase();
        if (castTokens.has(low)) continue;
        if (phrase.indexOf(' ') === -1 && isAtSentenceStart(text, m.index)) continue;
        if (!seen.has(low)) {
            seen.add(low);
            candidates.push(phrase);
        }
    }
    return candidates;
}

export interface AuditEntityNamesParams {
    characters?: Array<CastMember | string>;
    places?: Array<{ name?: string } | string>;
    existingCast?: Array<CastMember | string>;
    slopConfig?: SlopConfig | null;
    story?: Partial<Story> | null;
}

export function auditEntityNamesAndPlaces(params?: AuditEntityNamesParams): EntityNameAuditReport {
    const p = params || {};
    const characters = Array.isArray(p.characters) ? p.characters : [];
    const places = Array.isArray(p.places) ? p.places : [];
    const existingCast = Array.isArray(p.existingCast) ? p.existingCast : [];
    const slopConfig = p.slopConfig || DEFAULT_SLOP_CONFIG;
    const effData = buildEffectiveSlopData(slopConfig);
    const grandfather = buildStoryGrandfatherSet(p.story, { includeCast: false });

    const catById: Record<string, SlopCategory> = {};
    effData.categories.forEach((c) => { catById[c.id] = c; });
    const patById: Record<string, SlopPattern> = {};
    effData.patterns.forEach((pt) => { patById[pt.id] = pt; });

    function checkNameAgainstCat(nameStr: string, cat: SlopCategory | undefined, allowDeriv: boolean) {
        if (!cat || cat.severity === 'off') return null;
        for (let i = 0; i < (cat.items || []).length; i++) {
            const item = cat.items[i];
            if (grandfather.has(item)) continue;
            const found = findBoundaryMatches(nameStr, item, cat.match, allowDeriv);
            if (found.length > 0) {
                if (NO_DERIVATIVE_NAME_CATS.has(cat.id) && found[0].match.length > item.length) continue;
                return {
                    item,
                    matched: found[0].match,
                    categoryId: cat.id,
                    categoryTitle: cat.title,
                    severity: cat.severity || 'flag'
                };
            }
        }
        return null;
    }

    let overdrawnFirstUsed = 0;
    let overdrawnSurnameUsed = 0;
    let overdrawnPlaceUsed = 0;
    const existingFirstList: string[] = [];
    const existingSurnameList: string[] = [];

    existingCast.forEach((ec) => {
        const ecName = String(typeof ec === 'string' ? ec : (ec && ec.name) || '').trim();
        if (!ecName || grandfather.has(ecName)) return;
        if (checkNameAgainstCat(ecName, catById.names_overdrawn, false)) {
            overdrawnFirstUsed++;
            existingFirstList.push(ecName);
        }
        if (checkNameAgainstCat(ecName, catById.surnames_overdrawn, false)) {
            overdrawnSurnameUsed++;
            existingSurnameList.push(ecName);
        }
    });

    const madeUpBanks = slopConfig.enableNameBank !== false ? getNameBanks() : null;
    const hardCharCats = ['names_stock_full', 'names_feminine', 'names_masculine', 'names_romance_hero', 'names_unisex', 'names_word', 'surnames'];
    const violations: EntityNameViolation[] = [];
    const hardViolations: EntityNameViolation[] = [];
    const overdrawnViolations: EntityNameViolation[] = [];

    for (let ci = 0; ci < characters.length; ci++) {
        const ch = characters[ci];
        const chObj = (ch && typeof ch === 'object') ? ch : null;
        const cName = String(typeof ch === 'string' ? ch : (chObj && chObj.name) || '').trim();
        if (!cName || grandfather.has(cName)) continue;
        const isProtagonist = Boolean(chObj && (chObj.id === 'C1' || chObj.corner_role === 'MAIN_CHARACTER' || /protagonist/i.test(String(chObj.role || ''))));

        let hitHard: { item: string; matched: string; categoryId: string; categoryTitle: string; severity: string } | null = null;
        for (let hci = 0; hci < hardCharCats.length; hci++) {
            const cId = hardCharCats[hci];
            const cat = catById[cId];
            if (!cat || cat.severity !== 'hard') continue;
            const res = checkNameAgainstCat(cName, cat, PREFIX_DERIVATIVE_NAME_CATS.has(cId));
            if (res) { hitHard = res; break; }
        }
        if (!hitHard && patById.synth_quantum && patById.synth_quantum.severity === 'hard' && /\b(?:Synth|Quantum)[A-Za-z]*\b/.test(cName)) {
            hitHard = { item: cName, matched: cName, categoryId: 'synth_quantum', categoryTitle: 'Synth- or Quantum- names', severity: 'hard' };
        }
        if (!hitHard && madeUpBanks) {
            // Shapes a model coins (Vaeryn Duskmere) that no list can enumerate. Names the author typed stay.
            const coined = inventedWordsOf(madeUpBanks, cName).filter((word) => !grandfather.has(word));
            if (coined.length > 0) {
                hitHard = { item: coined[0], matched: coined[0], categoryId: 'made_up', categoryTitle: 'Reads as a made-up name', severity: 'hard' };
            }
        }
        if (hitHard) {
            const vHard: EntityNameViolation = {
                entityType: 'character',
                name: cName,
                id: chObj?.id,
                role: chObj?.role,
                reason: `${hitHard.categoryTitle} ("${hitHard.matched}")`,
                severity: 'hard',
                categoryId: hitHard.categoryId
            };
            violations.push(vHard);
            hardViolations.push(vHard);
            continue;
        }

        const ovFirst = checkNameAgainstCat(cName, catById.names_overdrawn, false);
        if (ovFirst && catById.names_overdrawn?.severity !== 'off') {
            if (isProtagonist || overdrawnFirstUsed >= 1 || catById.names_overdrawn?.severity === 'hard') {
                const vOvF: EntityNameViolation = {
                    entityType: 'character',
                    name: cName,
                    id: chObj?.id,
                    role: chObj?.role,
                    reason: isProtagonist
                        ? `Overdrawn given name "${ovFirst.matched}" on protagonist (allowed only for at most 1 minor character)`
                        : `Overdrawn given name "${ovFirst.matched}" exceeds 1-per-story budget (already used by ${existingFirstList[0] || 'another character'})`,
                    severity: 'overdrawn',
                    categoryId: 'names_overdrawn'
                };
                violations.push(vOvF);
                overdrawnViolations.push(vOvF);
                continue;
            } else {
                overdrawnFirstUsed++;
                existingFirstList.push(cName);
            }
        }

        const ovSur = checkNameAgainstCat(cName, catById.surnames_overdrawn, false);
        if (ovSur && catById.surnames_overdrawn?.severity !== 'off') {
            if (overdrawnSurnameUsed >= 1 || catById.surnames_overdrawn?.severity === 'hard') {
                const vOvS: EntityNameViolation = {
                    entityType: 'character',
                    name: cName,
                    id: chObj?.id,
                    role: chObj?.role,
                    reason: `Overdrawn surname "${ovSur.matched}" exceeds 1-per-story budget`,
                    severity: 'overdrawn',
                    categoryId: 'surnames_overdrawn'
                };
                violations.push(vOvS);
                overdrawnViolations.push(vOvS);
            } else {
                overdrawnSurnameUsed++;
                existingSurnameList.push(cName);
            }
        }
    }

    for (let pi = 0; pi < places.length; pi++) {
        const pl = places[pi];
        const pName = String(typeof pl === 'string' ? pl : (pl && pl.name) || '').trim();
        if (!pName || grandfather.has(pName)) continue;

        let plHard = (catById.places && catById.places.severity === 'hard') ? checkNameAgainstCat(pName, catById.places, true) : null;
        if (!plHard && patById.synth_quantum && patById.synth_quantum.severity === 'hard' && /\b(?:Synth|Quantum)[A-Za-z]*\b/.test(pName)) {
            plHard = { item: pName, matched: pName, categoryId: 'synth_quantum', categoryTitle: 'Synth- or Quantum- names', severity: 'hard' };
        }
        if (!plHard && patById.place_suffix && patById.place_suffix.severity !== 'off') {
            const psMatch = pName.match(/\b[A-Z][a-z]+(?:brook|haven|wood|vale|crest|fall|fell|shire|moor|hold|spire)\b/);
            if (psMatch && !PLACE_SUFFIX_EXCLUSIONS.has(psMatch[0].toLowerCase())) {
                plHard = { item: psMatch[0], matched: psMatch[0], categoryId: 'place_suffix', categoryTitle: 'Stock place suffix', severity: patById.place_suffix.severity };
            }
        }
        if (plHard) {
            const vp: EntityNameViolation = {
                entityType: 'place',
                name: pName,
                reason: `${plHard.categoryTitle} ("${plHard.matched}")`,
                severity: plHard.severity === 'hard' ? 'hard' : 'overdrawn',
                categoryId: plHard.categoryId
            };
            violations.push(vp);
            if (vp.severity === 'hard') hardViolations.push(vp);
            else overdrawnViolations.push(vp);
            continue;
        }

        const plOv = checkNameAgainstCat(pName, catById.places_overdrawn, false);
        if (plOv && catById.places_overdrawn?.severity !== 'off') {
            if (overdrawnPlaceUsed >= 1 || catById.places_overdrawn?.severity === 'hard') {
                const vpo: EntityNameViolation = {
                    entityType: 'place',
                    name: pName,
                    reason: `Overdrawn place/group name "${plOv.matched}" exceeds 1-per-story budget`,
                    severity: 'overdrawn',
                    categoryId: 'places_overdrawn'
                };
                violations.push(vpo);
                overdrawnViolations.push(vpo);
            } else {
                overdrawnPlaceUsed++;
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations,
        hardViolations,
        overdrawnViolations,
        overdrawnCounts: {
            firstNames: overdrawnFirstUsed,
            surnames: overdrawnSurnameUsed,
            places: overdrawnPlaceUsed
        }
    };
}

export function applyCascadingNameReplacements(text: string, renameMap?: Record<string, string> | null): string {
    if (!text || typeof text !== 'string' || !renameMap) return text;
    const entries = Object.keys(renameMap)
        .filter((k) => k && renameMap[k] && k !== renameMap[k])
        .sort((a, b) => b.length - a.length);
    let out = text;
    for (let i = 0; i < entries.length; i++) {
        const oldName = entries[i];
        const newName = renameMap[oldName];
        const rx = new RegExp(escapeRx(oldName), 'g');
        out = out.replace(rx, (matched, offset, fullStr) => {
            const prev = offset > 0 ? fullStr[offset - 1] : '';
            const next = (offset + matched.length) < fullStr.length ? fullStr[offset + matched.length] : '';
            if (isAsciiAlnum(oldName[0]) && isAsciiLetter(prev)) return matched;
            if (isAsciiAlnum(oldName[oldName.length - 1]) && isAsciiLetter(next)) return matched;
            return newName;
        });
    }
    return out;
}
