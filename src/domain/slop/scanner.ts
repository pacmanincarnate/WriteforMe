import type {
    SlopAuditReport,
    SlopConfig,
    SlopDensityRule,
    SlopHit,
    SlopHitSeverity,
    SlopPattern,
    Story
} from '@/types';
import {
    AMBIGUOUS_SENTENCE_START_NAMES,
    ASSISTANT_NARRATION_ONLY_ITEMS,
    DEFAULT_SLOP_CONFIG,
    NO_DERIVATIVE_NAME_CATS,
    PLACE_SUFFIX_EXCLUSIONS,
    PREFIX_DERIVATIVE_NAME_CATS,
    STOP_WORDS_SLOP,
    escapeRx,
    isAsciiAlnum,
    isAsciiLetter
} from './registry';
import { buildEffectiveSlopData, buildStoryGrandfatherSet } from './config';
import { detectRepeatedPhrases } from './phrases';

export function isAtSentenceStart(text: string, pos: number): boolean {
    let i = pos - 1;
    while (i >= 0 && ' \t"\'“‘*_('.indexOf(text[i]) !== -1) {
        i--;
    }
    if (i < 0) return true;
    return '.!?\n:'.indexOf(text[i]) !== -1;
}

export function lineOfPos(text: string, pos: number): number {
    let count = 1;
    for (let i = 0; i < pos && i < text.length; i++) {
        if (text.charCodeAt(i) === 10) count++;
    }
    return count;
}

export function snippetAt(text: string, start: number, end: number, pad?: number): string {
    const p = pad || 48;
    return text.slice(Math.max(0, start - p), Math.min(text.length, end + p)).replace(/\n+/g, ' ').trim();
}

export function extractSentenceAt(text: string, pos: number): string {
    if (!text) return '';
    let s = pos;
    while (s > 0 && '.!?\n'.indexOf(text[s - 1]) === -1) s--;
    let e = pos;
    while (e < text.length && '.!?\n'.indexOf(text[e]) === -1) e++;
    if (e < text.length && text[e] !== '\n') e++;
    return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

export function extractTrailingSentenceSpan(
    text: string,
    sentenceCount?: number
): { start: number; end: number; text: string } {
    const targetCount = sentenceCount || 2;
    const clean = String(text || '').trimEnd();
    if (!clean) return { start: 0, end: 0, text: '' };
    const spans: Array<{ start: number; end: number; text: string }> = [];
    const rx = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(clean)) !== null) {
        const seg = m[0].trim();
        if (seg && /[A-Za-z0-9]/.test(seg)) {
            spans.push({ start: m.index, end: m.index + m[0].length, text: seg });
        }
    }
    if (spans.length === 0) return { start: 0, end: clean.length, text: clean };
    const slice = spans.slice(-targetCount);
    return {
        start: slice[0].start,
        end: slice[slice.length - 1].end,
        text: clean.slice(slice[0].start, slice[slice.length - 1].end)
    };
}

export function buildNarrationOnlyText(text: string, isAudioDrama: boolean): string {
    const chars = text.split('');
    const quoteRx = /"[^"\n]*"|“[^”\n]*”/g;
    let m: RegExpExecArray | null;
    while ((m = quoteRx.exec(text)) !== null) {
        for (let i = m.index; i < m.index + m[0].length; i++) {
            if (chars[i] !== '\n') chars[i] = ' ';
        }
    }
    if (isAudioDrama) {
        let offset = 0;
        const lines = text.split('\n');
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const spkMatch = line.match(/^([A-Z][A-Za-z0-9\s.'-]{1,30}):\s+/);
            if (spkMatch && spkMatch[1].trim().toLowerCase() !== 'narrator') {
                for (let ci = 0; ci < line.length; ci++) {
                    chars[offset + ci] = ' ';
                }
            }
            offset += line.length + 1;
        }
    }
    return chars.join('');
}

export function findBoundaryMatches(
    text: string,
    item: string,
    kind?: string,
    allowPrefixDeriv?: boolean
): Array<{ match: string; start: number; end: number }> {
    const results: Array<{ match: string; start: number; end: number }> = [];
    if (!text || !item) return results;
    const esc = escapeRx(item);
    const suffix = (kind === 'name' && allowPrefixDeriv) ? '[a-z]{0,4}' : '';
    const flags = (kind === 'name') ? 'g' : 'gi';
    const rx = new RegExp(esc + suffix, flags);
    const firstAlpha = isAsciiAlnum(item[0]);
    const lastAlpha = isAsciiAlnum(item[item.length - 1]);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (firstAlpha && start > 0 && isAsciiLetter(text[start - 1])) continue;
        if ((lastAlpha || suffix) && end < text.length && isAsciiLetter(text[end])) continue;
        results.push({ match: m[0], start, end });
    }
    return results;
}

export function getEmDashMatches(
    text: string,
    isAudioDrama: boolean
): Array<{ match: string; start: number; end: number }> {
    const results: Array<{ match: string; start: number; end: number }> = [];
    if (!text) return results;
    const rx = /—|–|\s--\s|\s-\s|[A-Za-z0-9]--[A-Za-z0-9]/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
        let start = m.index;
        let matched = m[0];
        let end = start + matched.length;
        if (/^[A-Za-z0-9]--[A-Za-z0-9]$/.test(matched)) {
            start += 1;
            end -= 1;
            matched = '--';
        }
        if (matched !== '—' && matched !== '–') {
            if (text.slice(Math.max(0, start - 1), end + 1).indexOf('---') !== -1) {
                continue;
            }
        }
        if (isAudioDrama) {
            const after = text.slice(end, Math.min(text.length, end + 6));
            if (/^\s*(?:\n|$|["”\]<])/.test(after)) continue;
        }
        results.push({ match: matched.trim() || matched, start, end });
    }
    return results;
}

export interface ScanTextForSlopOptions {
    slopConfig?: SlopConfig | null;
    customBannedPhrases?: string[] | null;
    isAudioDrama?: boolean;
    hardOnly?: boolean;
    story?: Partial<Story> | null;
    grandfatherCast?: boolean;
}

export function scanTextForSlop(text: string, options?: ScanTextForSlopOptions): SlopAuditReport {
    const opts = options || {};
    const rawText = String(text || '');
    const slopConfig = opts.slopConfig || DEFAULT_SLOP_CONFIG;
    const effData = buildEffectiveSlopData(slopConfig, opts.customBannedPhrases);
    const isAudioDrama = Boolean(opts.isAudioDrama);
    const hardOnly = Boolean(opts.hardOnly);
    const grandfather = buildStoryGrandfatherSet(opts.story, { includeCast: opts.grandfatherCast !== false });

    const wordsAll = rawText.match(/[A-Za-z'’]+/g) || [];
    const wordCount = wordsAll.length;
    const narrationOnlyText = buildNarrationOnlyText(rawText, isAudioDrama);
    const trailingSpan = extractTrailingSentenceSpan(rawText, 2);

    const hardHits: SlopHit[] = [];
    const closerHits: SlopHit[] = [];
    const flagHits: SlopHit[] = [];
    const patternHits: SlopHit[] = [];
    const densityHits: SlopHit[] = [];
    let hitSeq = 0;

    function makeHit(
        severity: SlopHitSeverity,
        catId: string,
        catTitle: string,
        matchStr: string,
        start: number,
        end: number,
        note: string | undefined,
        isTrailingCloser: boolean
    ): SlopHit {
        hitSeq++;
        return {
            id: `slop_${hitSeq}_${catId}`,
            severity,
            categoryId: catId,
            categoryTitle: catTitle,
            match: matchStr,
            line: lineOfPos(rawText, start),
            start,
            end,
            sentence: extractSentenceAt(rawText, start),
            context: snippetAt(rawText, start, end, 48),
            note: note || '',
            isTrailingCloser: Boolean(isTrailingCloser),
            isClustered: false
        };
    }

    // 1. Category scans
    for (let ci = 0; ci < effData.categories.length; ci++) {
        const cat = effData.categories[ci];
        if (!cat || cat.severity === 'off') continue;
        if (hardOnly && cat.severity !== 'hard') continue;
        const allowDeriv = PREFIX_DERIVATIVE_NAME_CATS.has(cat.id) && !NO_DERIVATIVE_NAME_CATS.has(cat.id);

        for (let ii = 0; ii < (cat.items || []).length; ii++) {
            const item = cat.items[ii];
            if (!item) continue;
            const itemLow = item.toLowerCase();
            const useNarrationOnly = ((cat.id === 'assistant_voice' || cat.id === 'wiki_chatbot') && ASSISTANT_NARRATION_ONLY_ITEMS.has(itemLow));
            const scanTarget = useNarrationOnly ? narrationOnlyText : rawText;

            const found = findBoundaryMatches(scanTarget, item, cat.match, allowDeriv);
            for (let fi = 0; fi < found.length; fi++) {
                const f = found[fi];
                if (grandfather.has(f.match) || grandfather.has(item)) continue;
                if (cat.id === 'names_word' && isAtSentenceStart(rawText, f.start)) continue;
                if (cat.match === 'name' && AMBIGUOUS_SENTENCE_START_NAMES.has(item) && isAtSentenceStart(rawText, f.start)) continue;
                if (NO_DERIVATIVE_NAME_CATS.has(cat.id) && f.match.length > item.length) continue;

                const inTrailing = f.start >= trailingSpan.start && f.start < trailingSpan.end;
                const isCloser = (cat.id === 'scene_closers' && inTrailing);
                const hit = makeHit(
                    isCloser ? 'high_closer' : (cat.severity || 'flag'),
                    cat.id,
                    cat.title,
                    f.match,
                    f.start,
                    f.end,
                    cat.note,
                    isCloser
                );
                if (isCloser) closerHits.push(hit);
                else if (cat.severity === 'hard') hardHits.push(hit);
                else flagHits.push(hit);
            }
        }
    }

    // 2. Trailing 2-sentence moralizing/summary closer check (2E)
    const sceneClosersCat = effData.categories.find((c) => c.id === 'scene_closers');
    if (!hardOnly && (!sceneClosersCat || sceneClosersCat.severity !== 'off') && trailingSpan.text) {
        const moralCloserRx = /\b(?:for the first time in|she knew then|he knew then|they knew then|it was only the beginning|whatever came next|the start of something|changed forever|would never be the same|all that mattered now|and somehow,?\s+that|ready for whatever)\b/gi;
        let mc: RegExpExecArray | null;
        while ((mc = moralCloserRx.exec(trailingSpan.text)) !== null) {
            const absStart = trailingSpan.start + mc.index;
            const absEnd = absStart + mc[0].length;
            if (grandfather.has(mc[0])) continue;
            if (closerHits.some((ch) => Math.abs(ch.start - absStart) < 8)) continue;
            closerHits.push(makeHit(
                'high_closer',
                'scene_closers',
                'Scene-closing tells',
                mc[0],
                absStart,
                absEnd,
                'Moralizing/summary closer inside final 2 sentences.',
                true
            ));
        }
    }

    // 3. Patterns
    const patMap: Record<string, SlopPattern> = {};
    effData.patterns.forEach((p) => { patMap[p.id] = p; });

    // 3a. Em dash
    const emPat = patMap.em_dash;
    const emMatches = getEmDashMatches(rawText, isAudioDrama);
    const emDashCount = emMatches.length;
    const emDashPer1k = wordCount > 0 ? Number(((emDashCount / wordCount) * 1000).toFixed(2)) : 0;
    if (emPat && emPat.severity !== 'off') {
        const emMode = slopConfig.emDashMode || 'density';
        if (emMode === 'strict' && (!hardOnly || emPat.severity === 'hard')) {
            for (let ei = 0; ei < emMatches.length; ei++) {
                const em = emMatches[ei];
                const emHardHit = makeHit('hard', 'em_dash', emPat.title, em.match, em.start, em.end, emPat.note, false);
                hardHits.push(emHardHit);
                patternHits.push(emHardHit);
            }
        } else if (emMode === 'density' && !hardOnly) {
            const maxPer1k = Number.isFinite(Number(slopConfig.emDashMaxPer1k)) ? Number(slopConfig.emDashMaxPer1k) : 3;
            if (wordCount >= 100 && emDashCount >= 4 && emDashPer1k > maxPer1k) {
                const firstEm = emMatches[0];
                const densEmHit = makeHit(
                    'flag',
                    'em_dash',
                    `${emPat.title} (${emDashPer1k}/1k words > ${maxPer1k})`,
                    `${emDashCount} em dashes`,
                    firstEm.start,
                    firstEm.end,
                    `Exceeded em-dash density cap (${emDashPer1k} per 1k words).`,
                    false
                );
                densEmHit.isClustered = true;
                patternHits.push(densEmHit);
            }
        }
    }

    // 3b. Not X, but Y
    const nxbPat = patMap.not_x_but_y;
    if (nxbPat && nxbPat.severity !== 'off' && (!hardOnly || nxbPat.severity === 'hard')) {
        const nxbRx1 = /\b(?:it\s+wasn['’]t|this\s+wasn['’]t|that\s+wasn['’]t|wasn['’]t\s+just|isn['’]t\s+just|weren['’]t\s+just|not\s+just|not\s+merely|not\s+out\s+of)\b[^.!?;]{1,65}?(?:,|—|--)\s*(?:but|it\s+was|it['’]s|it\s+is|they\s+were)\b/gi;
        const nxbRx2 = /\b(?:it|this|that)\s+(?:wasn['’]t|isn['’]t)\s+[^.!?\n]{2,45}\.\s+(?:it|this|that)\s+(?:was|is)\s+[^.!?\n]{2,45}[.!]/gi;
        const nxbRanges: number[] = [];
        [nxbRx1, nxbRx2].forEach((rx) => {
            let nm: RegExpExecArray | null;
            while ((nm = rx.exec(rawText)) !== null) {
                if (grandfather.has(nm[0])) continue;
                if (nxbRanges.some((r) => Math.abs(r - nm!.index) < 10)) continue;
                nxbRanges.push(nm.index);
                const inEnd = nm.index >= trailingSpan.start && nm.index < trailingSpan.end;
                const nh = makeHit(inEnd ? 'high_closer' : nxbPat.severity, 'not_x_but_y', nxbPat.title, nm[0], nm.index, nm.index + nm[0].length, '', inEnd);
                if (inEnd) closerHits.push(nh);
                if (nxbPat.severity === 'hard') hardHits.push(nh);
                else patternHits.push(nh);
            }
        });
    }

    // 3c. Triad rhythm
    const triPat = patMap.triad;
    if (triPat && triPat.severity !== 'off' && (!hardOnly || triPat.severity === 'hard')) {
        const triRx = /\b(\w+\s+\w+)\s+[^,.]{1,30},\s+\1\s+[^,.]{1,30},\s+(?:and\s+)?\1\b/gi;
        let tm: RegExpExecArray | null;
        const triOffsets: number[] = [];
        while ((tm = triRx.exec(rawText)) !== null) {
            if (grandfather.has(tm[0])) continue;
            triOffsets.push(tm.index);
            const triEnd = tm.index >= trailingSpan.start && tm.index < trailingSpan.end;
            const th = makeHit(triEnd ? 'high_closer' : triPat.severity, 'triad', triPat.title, tm[0], tm.index, tm.index + tm[0].length, '', triEnd);
            if (triEnd) closerHits.push(th);
            if (triPat.severity === 'hard') hardHits.push(th);
            else patternHits.push(th);
        }
        const sRx = /[^.!?\n]+[.!?]+/g;
        const sList: Array<{ stem: string; start: number; end: number; text: string } | null> = [];
        let sm: RegExpExecArray | null;
        while ((sm = sRx.exec(rawText)) !== null) {
            const st = sm[0].trim();
            const two = st.match(/^([A-Za-z]+['’]?[A-Za-z]*\s+[A-Za-z]+['’]?[A-Za-z]*)\b/);
            if (two) sList.push({ stem: two[1].toLowerCase(), start: sm.index, end: sm.index + sm[0].length, text: st });
            else sList.push(null);
        }
        for (let si = 0; si <= sList.length - 3; si++) {
            const a = sList[si];
            const b = sList[si + 1];
            const c = sList[si + 2];
            if (a && b && c && a.stem === b.stem && b.stem === c.stem) {
                if (triOffsets.some((o) => o >= a.start && o <= c.end)) continue;
                const triEnd2 = c.start >= trailingSpan.start && c.start < trailingSpan.end;
                const th2 = makeHit(triEnd2 ? 'high_closer' : triPat.severity, 'triad', triPat.title, `${a.stem} ... (×3 sentences)`, a.start, c.end, '', triEnd2);
                if (triEnd2) closerHits.push(th2);
                if (triPat.severity === 'hard') hardHits.push(th2);
                else patternHits.push(th2);
                si += 2;
            }
        }
    }

    // 3d. Invented place suffix
    const psPat = patMap.place_suffix;
    if (psPat && psPat.severity !== 'off' && (!hardOnly || psPat.severity === 'hard')) {
        const psRx = /\b[A-Z][a-z]+(?:brook|haven|wood|vale|crest|fall|fell|shire|moor|hold|spire)\b/g;
        let pm: RegExpExecArray | null;
        while ((pm = psRx.exec(rawText)) !== null) {
            const wLow = pm[0].toLowerCase();
            if (PLACE_SUFFIX_EXCLUSIONS.has(wLow)) continue;
            if (grandfather.has(pm[0])) continue;
            if (isAtSentenceStart(rawText, pm.index)) continue;
            const psh = makeHit(psPat.severity, 'place_suffix', psPat.title, pm[0], pm.index, pm.index + pm[0].length, '', false);
            if (psPat.severity === 'hard') hardHits.push(psh);
            else patternHits.push(psh);
        }
    }

    // 3e. Synth- or Quantum- names
    const sqPat = patMap.synth_quantum;
    if (sqPat && sqPat.severity !== 'off' && (!hardOnly || sqPat.severity === 'hard')) {
        const sqRx = /\b(?:Synth|Quantum)[A-Za-z]*\b/g;
        let sqm: RegExpExecArray | null;
        while ((sqm = sqRx.exec(rawText)) !== null) {
            if (grandfather.has(sqm[0])) continue;
            const sqh = makeHit(sqPat.severity, 'synth_quantum', sqPat.title, sqm[0], sqm.index, sqm.index + sqm[0].length, '', false);
            if (sqPat.severity === 'hard') hardHits.push(sqh);
            else patternHits.push(sqh);
        }
    }

    // 3f. Smart quotes
    const smartPat = patMap.smart_quotes;
    if (smartPat && smartPat.severity !== 'off' && (!hardOnly || smartPat.severity === 'hard')) {
        const smqRx = /[“”‘’]/g;
        let smqm: RegExpExecArray | null;
        while ((smqm = smqRx.exec(rawText)) !== null) {
            const smqh = makeHit(smartPat.severity, 'smart_quotes', smartPat.title, smqm[0], smqm.index, smqm.index + 1, smartPat.note, false);
            if (smartPat.severity === 'hard') hardHits.push(smqh);
            else patternHits.push(smqh);
        }
    }

    // 3g. Patterns that carry their own regex (the Wikipedia signs, or an imported pack's).
    for (const pat of effData.patterns) {
        if (!pat.regex || pat.severity === 'off' || (hardOnly && pat.severity !== 'hard')) continue;
        let rx: RegExp;
        try {
            const flags = `g${String(pat.flags || '').replace(/[^imsu]/g, '')}`;
            rx = new RegExp(pat.regex, flags);
        } catch {
            continue;
        }
        let found: RegExpExecArray | null;
        let guard = 0;
        while ((found = rx.exec(rawText)) !== null && guard++ < 200) {
            if (found[0].length === 0) {
                rx.lastIndex++;
                continue;
            }
            const start = found.index + (found[0].length - found[0].trimStart().length);
            const hit = makeHit(pat.severity, pat.id, pat.title, found[0].trim(), start, found.index + found[0].length, pat.note, false);
            if (pat.severity === 'hard') hardHits.push(hit);
            else patternHits.push(hit);
        }
    }

    // 4. Density checks
    if (!hardOnly) {
        const densMap: Record<string, SlopDensityRule> = {};
        effData.density.forEach((d) => { densMap[d.id] = d; });
        const wordTokens: Array<{ lower: string; start: number; end: number }> = [];
        const wtRx = /[A-Za-z']+/g;
        let wtm: RegExpExecArray | null;
        while ((wtm = wtRx.exec(rawText)) !== null) {
            wordTokens.push({ lower: wtm[0].toLowerCase(), start: wtm.index, end: wtm.index + wtm[0].length });
        }

        const echoRule = densMap.echo_chamber;
        if (echoRule && echoRule.severity !== 'off' && wordTokens.length > 0) {
            const echoWin = echoRule.window || 200;
            const echoNeed = echoRule.count || 3;
            const positions: Record<string, number[]> = {};
            for (let wi = 0; wi < wordTokens.length; wi++) {
                const wt = wordTokens[wi];
                if (STOP_WORDS_SLOP.has(wt.lower) || wt.lower.length < 4) continue;
                const rawChar = rawText[wt.start];
                if (rawChar && rawChar === rawChar.toUpperCase() && rawChar !== rawChar.toLowerCase() && !isAtSentenceStart(rawText, wt.start)) continue;
                if (grandfather.has(wt.lower)) continue;
                if (!positions[wt.lower]) positions[wt.lower] = [];
                positions[wt.lower].push(wi);
            }
            const echoSeen = new Set<string>();
            Object.keys(positions).forEach((wKey) => {
                const idxArr = positions[wKey];
                for (let j = 0; j <= idxArr.length - echoNeed; j++) {
                    if (idxArr[j + echoNeed - 1] - idxArr[j] < echoWin) {
                        const bucket = `${wKey}::${Math.floor(idxArr[j] / echoWin)}`;
                        if (!echoSeen.has(bucket)) {
                            echoSeen.add(bucket);
                            const eStart = wordTokens[idxArr[j]].start;
                            const eEnd = wordTokens[idxArr[j + echoNeed - 1]].end;
                            densityHits.push(makeHit(echoRule.severity, 'echo_chamber', echoRule.title, wKey, eStart, eEnd, '', false));
                        }
                        break;
                    }
                }
            });
        }

        const phraseRule = densMap.repeated_phrase;
        if (phraseRule && phraseRule.severity !== 'off' && wordTokens.length > 0) {
            const repeats = detectRepeatedPhrases([{ id: 'scene', text: rawText }], {
                minimum: phraseRule.count || 3,
                ignoreWords: grandfather.tokenLower
            });
            for (const repeat of repeats.slice(0, 8)) {
                const first = repeat.spans[0];
                densityHits.push(
                    makeHit(phraseRule.severity, 'repeated_phrase', phraseRule.title, repeat.phrase, first.start, first.end, `used ${repeat.count} times`, false)
                );
            }
        }

        const puncRule = densMap.punctuation_collapse;
        if (puncRule && puncRule.severity !== 'off' && wordTokens.length > 0) {
            const pWin = puncRule.window || 500;
            const step = Math.max(50, Math.floor(pWin / 2));
            for (let pi = 0; pi <= wordTokens.length - pWin; pi += step) {
                const chunk = wordTokens.slice(pi, pi + pWin);
                if (chunk.length < pWin) break;
                const span = rawText.slice(chunk[0].start, chunk[chunk.length - 1].end);
                if (!/[;:?]|\.\.\.|…/.test(span)) {
                    densityHits.push(makeHit(puncRule.severity, 'punctuation_collapse', puncRule.title, `${pWin} words`, chunk[0].start, chunk[chunk.length - 1].end, '', false));
                    break;
                }
            }
        }

        const qRule = densMap.question_free_dialogue;
        if (qRule && qRule.severity !== 'off' && rawText.trim().length > 80) {
            const dialogueChunks = isAudioDrama
                ? (rawText.match(/^[A-Z][A-Za-z0-9\s.'-]{1,30}:\s+.+$/gm) || []).filter((l) => !/^Narrator:/i.test(l))
                : (rawText.match(/["“][^"”\n]{2,}["”]/g) || []);
            if (dialogueChunks.length >= 3 && rawText.indexOf('?') === -1) {
                densityHits.push(makeHit(qRule.severity, 'question_free_dialogue', qRule.title, `${dialogueChunks.length} dialogue turns, 0 "?"`, 0, Math.min(rawText.length, 60), '', false));
            }
        }
    }

    // 5. Clustering & Gate logic
    const phraseCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const paraFlagCounts: Record<number, number> = {};
    for (let hi = 0; hi < flagHits.length; hi++) {
        const fh = flagHits[hi];
        const beforeText = rawText.slice(0, fh.start || 0);
        const paraMatches = beforeText.match(/\n\s*\n/g);
        const pIdx = paraMatches ? paraMatches.length : 0;
        fh._paraIdx = pIdx;
        const pKey = `${fh.categoryId}::${fh.match.toLowerCase()}`;
        phraseCounts[pKey] = (phraseCounts[pKey] || 0) + 1;
        categoryCounts[fh.categoryId] = (categoryCounts[fh.categoryId] || 0) + 1;
        paraFlagCounts[pIdx] = (paraFlagCounts[pIdx] || 0) + 1;
    }
    const clusteredFlagHits: SlopHit[] = [];
    for (let hj = 0; hj < flagHits.length; hj++) {
        const fhj = flagHits[hj];
        const pKey2 = `${fhj.categoryId}::${fhj.match.toLowerCase()}`;
        if (phraseCounts[pKey2] >= 2 || categoryCounts[fhj.categoryId] >= 3 || paraFlagCounts[fhj._paraIdx || 0] >= 2) {
            fhj.isClustered = true;
            clusteredFlagHits.push(fhj);
        }
        delete fhj._paraIdx;
    }

    const notXCount = patternHits.filter((p) => p.categoryId === 'not_x_but_y').length;
    const triadCount = patternHits.filter((p) => p.categoryId === 'triad').length;
    const emClusterCount = patternHits.filter((p) => p.categoryId === 'em_dash' && p.isClustered).length;

    const reasons: string[] = [];
    if (hardHits.length > 0) reasons.push(`${hardHits.length} hard defect(s)`);
    if (closerHits.length > 0) reasons.push(`${closerHits.length} scene-closing tell(s) in final 2 sentences`);
    if (clusteredFlagHits.length > 0) reasons.push(`${clusteredFlagHits.length} clustered flag hit(s)`);
    if (notXCount >= 3) reasons.push(`${notXCount} "Not X, but Y" constructions`);
    if (triadCount >= 2) reasons.push(`${triadCount} triad rhythms`);

    const shouldTriggerSurgicalGate = (
        hardHits.length >= 1 ||
        closerHits.length >= 1 ||
        clusteredFlagHits.length >= 1 ||
        notXCount >= 3 ||
        triadCount >= 2
    );
    const hasActionableItems = shouldTriggerSurgicalGate || patternHits.length > 0 || densityHits.length > 0;

    const allHits = hardHits.concat(
        closerHits,
        flagHits,
        patternHits.filter((p) => p.severity !== 'hard' && !p.isTrailingCloser),
        densityHits
    );
    const rank: Record<string, number> = { hard: 0, high_closer: 1, flag: 2 };
    allHits.sort((a, b) => {
        const ra = rank[a.severity] !== undefined ? rank[a.severity] : 3;
        const rb = rank[b.severity] !== undefined ? rank[b.severity] : 3;
        if (ra !== rb) return ra - rb;
        return a.start - b.start;
    });

    return {
        hardHits,
        closerHits,
        flagHits,
        clusteredFlagHits,
        patternHits,
        densityHits,
        allHits,
        phraseCounts,
        categoryCounts,
        summary: {
            wordCount,
            hardCount: hardHits.length,
            closerCount: closerHits.length,
            flagCount: flagHits.length,
            clusteredFlagCount: clusteredFlagHits.length,
            patternCount: patternHits.length,
            densityCount: densityHits.length,
            emDashCount,
            emDashPer1k,
            emClusterCount,
            shouldTriggerSurgicalGate,
            hasActionableItems,
            reasons
        }
    };
}

export function formatSlopAuditForPrompt(
    auditReport?: Partial<SlopAuditReport> | null,
    options?: { maxItems?: number; includeSentences?: boolean }
): string {
    if (!auditReport) return '';
    const opts = options || {};
    const maxItems = opts.maxItems || 15;
    const includeSentences = opts.includeSentences !== false;
    const lines: string[] = [];
    const seen = new Set<string>();

    function pushLine(tag: string, hit: SlopHit) {
        if (lines.length >= maxItems) return;
        const key = `${tag}::${hit.categoryId}::${hit.match.toLowerCase()}::${hit.line}`;
        if (seen.has(key)) return;
        seen.add(key);
        const sentPart = (includeSentences && hit.sentence) ? ` | Sentence: "${hit.sentence.slice(0, 220)}"` : '';
        const notePart = hit.note ? ` (${hit.note})` : '';
        lines.push(`- [${tag} | ${hit.categoryTitle}] "${hit.match}"${notePart}${sentPart}`);
    }

    (auditReport.hardHits || []).forEach((h) => { pushLine('HARD DEFECT - MUST REPLACE', h); });
    (auditReport.closerHits || []).forEach((h) => { pushLine('SCENE CLOSER - FINAL 2 SENTENCES', h); });
    (auditReport.clusteredFlagHits || []).forEach((h) => { pushLine('FLAG CLUSTER - REWORK REPETITION', h); });
    (auditReport.patternHits || []).forEach((h) => {
        if (h.severity !== 'hard' && !h.isTrailingCloser) pushLine('RHETORICAL/STYLE PATTERN', h);
    });
    (auditReport.densityHits || []).forEach((h) => { pushLine('DENSITY WARNING', h); });
    return lines.join('\n');
}
