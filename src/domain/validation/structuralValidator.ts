/**
 * @module domain/validation/structuralValidator
 * Structural output validators for Story Arc, Act, Sequence, Scene, Beat, and Writing Agents,
 * plus 3-tier reviewer verdict parsing and trivial-MRU / flat-value-shift defect scanners.
 */

import { decodeXmlEntities, extractTag, extractTagList } from '@/utils';
import type { CastMember, Story } from '@/types';
import { ensureCharacter, resolveCharacter } from '@/domain/story';
import { analyzeAudioDramaScriptFormatting, isAudioDramaScriptText } from '@/domain/audio';
import { DEFAULT_SLOP_CONFIG, scanTextForSlop } from '@/domain/slop';
import type { SlopConfig } from '@/types/slop';

export interface StructuralValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ReviewIssueItem {
    severity: string;
    category: string;
    description: string;
    location: string;
    fix_suggestion: string;
    fixSuggestion: string;
}

export interface ReviewCharacterBrief {
    id: string;
    name: string;
    role: string;
    core_flaw: string;
    core_desire: string;
    vocal_cadence: string;
}

export interface ExtractedReviewStatus {
    status: 'PASS' | 'FAIL' | string;
    reasons: string[];
    critique: string;
    briefs: ReviewCharacterBrief[];
    issues: ReviewIssueItem[];
    isValid: boolean;
}

export interface ValidationContext {
    concept?: string;
    cast?: CastMember[];
    length_floor?: number | null;
    generation_ranges?: {
        scenes_per_sequence?: { min?: number };
    };
    writing_mode?: string;
    characters_present?: unknown;
    cast_names?: unknown;
    activeCast?: unknown;
    targetPacingMode?: string;
    slopConfig?: Partial<SlopConfig> & { enableSlopAudit?: boolean };
    bannedPhrases?: string[];
    story?: Partial<Story> | null;
    [key: string]: unknown;
}

/** Validates structural agent outputs and emits blocking errors plus non-blocking advisories. */
export function validateStructuralOutput(
    tierName: string,
    parsedData: unknown,
    context: ValidationContext = {}
): StructuralValidationResult {
    if (!parsedData || (typeof parsedData !== 'object' && typeof parsedData !== 'string')) {
        return {
            valid: false,
            errors: [`${tierName}: Parsed data is null or non-object`],
            warnings: []
        };
    }
    const dataObj: Record<string, unknown> =
        typeof parsedData === 'string'
            ? { prose: parsedData }
            : (parsedData as Record<string, unknown>);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (tierName === 'Story Arc Agent') {
        const thematicArg = String(dataObj.core_thematic_argument || '');
        if (!thematicArg || thematicArg.trim().length === 0) {
            errors.push('Story Arc Agent: Missing core thematic argument');
        }
        if (!dataObj.starting_value_state || !dataObj.ending_value_state) {
            errors.push('Story Arc Agent: Must establish starting and ending value states');
        }
        const threads = (dataObj.threads || dataObj.narrative_threads || []) as Array<
            Record<string, unknown>
        >;
        if (!Array.isArray(threads) || threads.length < 2) {
            if (dataObj.inciting_incident || dataObj.core_thematic_argument || context.concept) {
                const repaired = [
                    {
                        id: 'T1',
                        name: 'Main Plot Thread (A-Story)',
                        description: dataObj.inciting_incident
                            ? `External conflict sparked by: ${dataObj.inciting_incident}`
                            : 'The core external conflict driving the narrative forward.'
                    },
                    {
                        id: 'T2',
                        name: 'Relationship / Thematic Mirror (B-Story)',
                        description: dataObj.core_thematic_argument
                            ? `Relationship dynamic testing: "${dataObj.core_thematic_argument}"`
                            : 'Subplot mirroring and testing the central thematic argument.'
                    },
                    {
                        id: 'T3',
                        name: 'Internal Arc (C-Story)',
                        description:
                            dataObj.starting_value_state && dataObj.ending_value_state
                                ? `Protagonist shift from "${dataObj.starting_value_state}" to "${dataObj.ending_value_state}"`
                                : "The protagonist's internal emotional transformation."
                    }
                ];
                dataObj.threads = repaired;
                warnings.push('Story Arc Agent: Synthesized missing narrative threads from story context.');
            } else {
                errors.push(
                    `Story Arc Agent: Must generate at least 2 narrative threads (got ${Array.isArray(threads) ? threads.length : 0})`
                );
            }
        }
        const charArcs = (dataObj.character_arcs || []) as Array<Record<string, unknown>>;
        if (!Array.isArray(charArcs) || charArcs.length === 0) {
            if (context.cast && context.cast.length > 0) {
                dataObj.character_arcs = context.cast.map((c, i) => ({
                    char_id: c.name || `C${i + 1}`,
                    description: `${c.name || 'Protagonist'} faces their core flaw (${c.core_flaw || 'blind devotion'}) and pursues desire (${c.core_desire || 'redemption'}).`,
                    lie_believed: c.core_flaw || 'They must control everything alone',
                    truth_needed: c.core_desire
                        ? `True strength comes through ${c.core_desire}`
                        : 'Vulnerability is essential for growth',
                    arc_catalyst: dataObj.inciting_incident || 'The catalytic disruption'
                }));
                warnings.push('Story Arc Agent: Synthesized missing character arcs from cast roster.');
            } else {
                errors.push('Story Arc Agent: Must generate character arcs for starting cast');
            }
        }
    } else if (tierName === 'Act Agent' || tierName === 'Act Planner') {
        const acts = (
            Array.isArray(dataObj.acts) ? dataObj.acts : Array.isArray(parsedData) ? parsedData : []
        ) as Array<Record<string, unknown>>;
        if (!Array.isArray(acts) || acts.length < 3) {
            errors.push(
                `Act Agent: Must generate at least 3 acts (got ${Array.isArray(acts) ? acts.length : 0})`
            );
        }
        for (const act of acts) {
            const desc = String(act.description || act.act_mandate || act.summary || '');
            if (desc.length < 50) {
                errors.push(
                    `Act Agent: Act ${act.number || '?'} mandate too short (${desc.length} chars, min 50 required)`
                );
            }
        }
    } else if (tierName === 'Sequence Agent') {
        const seqs = (
            Array.isArray(dataObj.sequences)
                ? dataObj.sequences
                : Array.isArray(parsedData)
                  ? parsedData
                  : []
        ) as unknown[];
        if (!Array.isArray(seqs) || seqs.length !== 8) {
            errors.push(
                `Sequence Agent: Exactly 8 sequences required across 3 acts (got ${seqs.length || 0})`
            );
        }
    } else if (tierName === 'Scene Agent' || tierName === 'Scene Roster Agent') {
        const scenes = (
            Array.isArray(dataObj.scenes)
                ? dataObj.scenes
                : Array.isArray(parsedData)
                  ? parsedData
                  : []
        ) as Array<Record<string, unknown>>;
        const minScenes =
            context.length_floor !== undefined && context.length_floor !== null
                ? context.length_floor
                : context.generation_ranges && context.generation_ranges.scenes_per_sequence
                  ? context.generation_ranges.scenes_per_sequence.min || 3
                  : 3;
        if (!Array.isArray(scenes) || scenes.length < minScenes) {
            errors.push(
                `${tierName}: Generated ${scenes.length || 0} scenes (minimum ${minScenes} required)`
            );
        }

        const validCast = new Set<string>();
        const validCastNames: string[] = [];
        (context.cast || []).forEach((c) => {
            if (c.id) validCast.add(String(c.id).trim().toLowerCase());
            if (c.name) {
                const nameStr = String(c.name).trim().toLowerCase();
                validCast.add(nameStr);
                validCastNames.push(nameStr);
                const parts = nameStr.split(/\s+/);
                if (parts.length > 1 && parts[0].length >= 2) {
                    validCast.add(parts[0]);
                }
            }
        });

        scenes.forEach((sc) => {
            const briefs = (sc.new_character_briefs || []) as CastMember[];
            briefs.forEach((cb) => {
                if (cb.id) validCast.add(String(cb.id).trim().toLowerCase());
                if (cb.name) {
                    const nameStr = String(cb.name).trim().toLowerCase();
                    validCast.add(nameStr);
                    validCastNames.push(nameStr);
                    const parts = nameStr.split(/\s+/);
                    if (parts.length > 1 && parts[0].length >= 2) {
                        validCast.add(parts[0]);
                    }
                }
            });
        });

        for (let i = 0; i < scenes.length; i++) {
            const sc = scenes[i];
            const valShift = sc.value_shift as { start_state?: string; end_state?: string } | undefined;
            const rawType = String(sc.scene_type || sc.type || '').toUpperCase();
            if (
                tierName === 'Scene Agent' &&
                (!valShift || !valShift.start_state || !valShift.end_state)
            ) {
                errors.push(`${tierName}: Scene ${sc.number || i + 1} has missing value shift`);
            } else if (
                valShift &&
                valShift.start_state &&
                valShift.start_state === valShift.end_state
            ) {
                if (!rawType.includes('SEQUEL') && !rawType.includes('REACTIVE')) {
                    errors.push(`${tierName}: Scene ${sc.number || i + 1} has flat value shift`);
                }
            }
            if (
                !rawType ||
                (!rawType.includes('PROACTIVE') &&
                    !rawType.includes('REACTIVE') &&
                    !rawType.includes('SCENE') &&
                    !rawType.includes('SEQUEL'))
            ) {
                errors.push(
                    `${tierName}: Scene ${sc.number || i + 1} missing valid scene_type (PROACTIVE/REACTIVE)`
                );
            }
            const presentList = (
                Array.isArray(sc.characters_present) && sc.characters_present.length
                    ? sc.characters_present
                    : Array.isArray(sc.cast_names) && sc.cast_names.length
                      ? sc.cast_names
                      : sc.cast_ids || []
            ) as unknown[];
            if (validCast.size > 0 && Array.isArray(presentList)) {
                const allCastForValidation: CastMember[] = [...(context.cast || [])];
                ((sc.new_character_briefs || []) as CastMember[]).forEach((cb) =>
                    allCastForValidation.push(cb)
                );

                for (const cid of presentList) {
                    const cleanCid = String(cid || '').trim();
                    if (!cleanCid) continue;
                    const cleanCidLower = cleanCid.toLowerCase();

                    const resolved = resolveCharacter(cleanCid, allCastForValidation);
                    const inSet = validCast.has(cleanCidLower);
                    const matchedPartial = validCastNames.some(
                        (name) => name.includes(cleanCidLower) || cleanCidLower.includes(name)
                    );

                    if (!resolved && !inSet && !matchedPartial) {
                        if (
                            cleanCid.length >= 2 &&
                            !cleanCid.startsWith('null') &&
                            !cleanCid.startsWith('undefined')
                        ) {
                            const newChar = ensureCharacter(
                                cleanCid,
                                context.cast || allCastForValidation
                            );
                            if (newChar) {
                                allCastForValidation.push(newChar);
                                validCast.add(cleanCidLower);
                                validCastNames.push(cleanCidLower);
                                continue;
                            }
                        }
                        errors.push(
                            `${tierName}: Scene ${sc.number || i + 1} references unknown character "${cid}"`
                        );
                    }
                }
            }
        }

        let consecutiveSolo = 0;
        for (let i = 0; i < scenes.length; i++) {
            const sc = scenes[i];
            const presentList = (
                Array.isArray(sc.characters_present) && sc.characters_present.length
                    ? sc.characters_present
                    : Array.isArray(sc.cast_names) && sc.cast_names.length
                      ? sc.cast_names
                      : sc.cast_ids || []
            ) as unknown[];
            if (presentList.length <= 1) {
                consecutiveSolo++;
                if (consecutiveSolo > 2) {
                    errors.push(
                        `${tierName}: Protagonist is isolated for more than two consecutive scenes (Scene ${sc.number || i + 1} is the ${consecutiveSolo}th consecutive solo scene). You must create an opportunity for character interaction at least every two scenes.`
                    );
                }
            } else {
                consecutiveSolo = 0;
            }
        }
    } else if (tierName === 'Writing Agent') {
        const prose =
            typeof dataObj.prose === 'string'
                ? dataObj.prose
                : typeof parsedData === 'string'
                  ? parsedData
                  : '';
        if (prose.length > 50) {
            const isAudioDramaMode =
                (context && context.writing_mode === 'audio_drama') || isAudioDramaScriptText(prose);
            if (isAudioDramaMode) {
                const fmt = analyzeAudioDramaScriptFormatting(prose);

                if (
                    fmt.rawLines.length >= 3 &&
                    fmt.speakerLineCount < Math.floor(fmt.rawLines.length * 0.5)
                ) {
                    errors.push(
                        "Writing Agent (Audio Drama): Script is missing required 'SpeakerName: ' and 'Narrator: ' line prefixes on at least 50% of lines. Format every line as 'Narrator: Spoken staging.' or 'CharacterName: [vocal tone/delivery] Spoken dialogue.'"
                    );
                } else if (
                    fmt.rawLines.length >= 3 &&
                    fmt.speakerLineCount < Math.floor(fmt.rawLines.length * 0.75)
                ) {
                    warnings.push(
                        "Writing Agent (Audio Drama): Inconsistent speaker prefixes detected. Begin every script line with 'CharacterName: ' or 'Narrator: '."
                    );
                }
                if (fmt.narratorLineCount === 0 && fmt.rawLines.length > 3) {
                    warnings.push(
                        "Writing Agent (Audio Drama): No lines attributed to 'Narrator'. Add 'Narrator: ' lines so scene setting, physical movement, and staging are spoken aloud."
                    );
                }
                if (fmt.foleyOrStageViolations > 0) {
                    warnings.push(
                        `Writing Agent (Audio Drama): Detected ${fmt.foleyOrStageViolations} unvoiced SFX label or standalone stage direction(s). Voice physical events aloud on 'Narrator: ' lines.`
                    );
                }
                if (fmt.physicalBracketTags.length > 0) {
                    const sampleTags = fmt.physicalBracketTags.slice(0, 3).join(', ');
                    warnings.push(
                        `Writing Agent (Audio Drama): Detected ${fmt.physicalBracketTags.length} bracketed instruction(s) [...] containing physical body movements, anatomy, or stage props (e.g. ${sampleTags}). Keep [...] focused purely on vocal delivery, emotion, or paralinguistic sound (e.g. [through gritted teeth, voice low]) and move physical staging to a spoken 'Narrator: ' line.`
                    );
                }
                if (fmt.invalidXmlTags && fmt.invalidXmlTags.length > 0) {
                    const sampleXml = fmt.invalidXmlTags.slice(0, 3).join(', ');
                    warnings.push(
                        `Writing Agent (Audio Drama): Detected ${fmt.invalidXmlTags.length} unsupported or unclosed inline prosody XML tag(s) (${sampleXml}). Use ONLY balanced pairs from the 7 approved Drama-3 tags: <whisper>, <emphasis>, <stress>, <soft>, <fast>, <slow>, <forceful>.`
                    );
                }
                if (fmt.invalidParenTags.length > 0) {
                    const sampleParens = fmt.invalidParenTags.slice(0, 3).join(', ');
                    warnings.push(
                        `Writing Agent (Audio Drama): Detected ${fmt.invalidParenTags.length} legacy parenthetical tag(s) (...) (e.g. ${sampleParens}). In Drama-3 syntax, write all delivery cues and vocal events in square brackets [...] (e.g., [sighs], [laughs], [shaky breath], [quietly]) instead of parentheses (...).`
                    );
                }
            } else {
                const words = prose.trim().split(/\s+/).length;

                let inQuote = false;
                let quoteWords = 0;
                const tokens = prose.trim().split(/\s+/);
                for (const token of tokens) {
                    const count = (token.match(/[\u0022\u201C\u201D]/g) || []).length;
                    if (count % 2 !== 0) {
                        inQuote = !inQuote;
                        quoteWords++;
                    } else if (inQuote || count > 0) {
                        quoteWords++;
                    }
                }

                const rawPresent: unknown[] = [
                    ...(Array.isArray(context?.characters_present)
                        ? context.characters_present
                        : context?.characters_present
                          ? [context.characters_present]
                          : []),
                    ...(Array.isArray(context?.cast_names)
                        ? context.cast_names
                        : context?.cast_names
                          ? [context.cast_names]
                          : []),
                    ...(Array.isArray(context?.activeCast)
                        ? context.activeCast
                        : context?.activeCast
                          ? [context.activeCast]
                          : [])
                ];
                const presentChars: string[] = [];
                rawPresent.forEach((c) => {
                    if (!c) return;
                    if (typeof c === 'string') {
                        c.split(/[,;\n]+|(?:\band\b)/i)
                            .map((s) => s.trim().replace(/^-\s*/, ''))
                            .filter(Boolean)
                            .forEach((x) => {
                                if (!presentChars.some((cn) => cn.toLowerCase() === x.toLowerCase())) {
                                    presentChars.push(x);
                                }
                            });
                    } else if (typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string') {
                        const cn = String((c as { name: string }).name).trim();
                        if (cn && !presentChars.some((existing) => existing.toLowerCase() === cn.toLowerCase())) {
                            presentChars.push(cn);
                        }
                    }
                });
                const isSoloScene = presentChars.length <= 1;

                if (isSoloScene) {
                    if (words > 100 && quoteWords === 0) {
                        warnings.push(
                            'Writing Agent: Solo scene has zero spoken vocalization. Even when alone, characters benefit from muttering under their breath, cursing, whispering calculations, or vocalizing to externalize interiority.'
                        );
                    }
                } else {
                    if (words > 100 && quoteWords === 0) {
                        warnings.push(
                            'Writing Agent: Multi-character scene has zero spoken dialogue. In scenes with multiple characters, spoken interaction is the primary engine of interpersonal tension. Consider expanding spoken dialogue.'
                        );
                    }

                    const currentDialogueDensity = words > 0 ? quoteWords / words : 0;
                    if (context && context.targetPacingMode) {
                        if (
                            context.targetPacingMode === 'PHYSICAL_IMMEDIACY' &&
                            currentDialogueDensity < 0.05
                        ) {
                            warnings.push(
                                `Writing Agent (Advisory - Physical Immediacy Target): Dialogue density is ${(currentDialogueDensity * 100).toFixed(1)}% (minimum baseline is 5% due to high prior dialogue average). Spoken dialogue is mandatory; 0% dialogue is strictly forbidden.`
                            );
                        } else if (
                            context.targetPacingMode === 'CONVERSATIONAL_COLLISION' &&
                            currentDialogueDensity < 0.35
                        ) {
                            warnings.push(
                                `Writing Agent (Advisory - Conversational Collision Target): Dialogue density is ${(currentDialogueDensity * 100).toFixed(1)}% (minimum baseline is 35% due to low prior dialogue average). Spoken dialogue must meet the minimum collision threshold.`
                            );
                        }
                    }
                }

                const proseWithoutDialogue = prose.replace(/[\u0022\u201C][^\u0022\u201D]*[\u0022\u201D]/g, ' ');
                const maskedProse = proseWithoutDialogue
                    .replace(/\b(Dr|Mr|Mrs|Ms|Lt|Col|Capt|Sgt|Gen|Prof|Fig|No|Spec|Model|v|vs)\.\s+/gi, '$1_DOT_ ')
                    .replace(/(\d+)\.(\d+)/g, '$1_DEC_$2')
                    .replace(/\.{3}/g, '_ELLIPSIS_');

                const rawSentences = maskedProse.split(/(?<=[.!?])\s+/).filter(Boolean);
                let shortSentencesCount = 0;
                let totalSentencesCount = 0;
                for (const s of rawSentences) {
                    const trimmed = s.trim();
                    const unmasked = trimmed
                        .replace(/_DOT_/g, '.')
                        .replace(/_DEC_/g, '.')
                        .replace(/_ELLIPSIS_/g, '...');
                    const sWords = unmasked.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w)).length;
                    if (sWords > 0) {
                        totalSentencesCount++;
                        if (sWords < 4) {
                            shortSentencesCount++;
                        }
                    }
                }
                const shortRatio =
                    totalSentencesCount > 0 ? shortSentencesCount / totalSentencesCount : 0;
                if (totalSentencesCount >= 10 && shortRatio > 0.2) {
                    warnings.push(
                        `Writing Agent: Excessive staccato cadence detected (${(shortRatio * 100).toFixed(1)}% of narrative sentences are under 4 words, threshold is 20.0%). Vary sentence lengths organically and combine short action fragments into compound, rhythmic sentences.`
                    );
                }

                const metaArtifactRegex =
                    /\b(the camera|camera pulls back|camera pans|camera cuts|cut to black|fade to black|wide shot|close-up shot|exterior shot|interior shot)\b/i;
                if (metaArtifactRegex.test(prose)) {
                    warnings.push(
                        'Writing Agent: Screenplay/cinematic meta-language detected (e.g., "camera pulls back", "cut to"). Narrate through character sensory perception, never cinematic stage directions.'
                    );
                }
            }

            if (context?.slopConfig?.enableSlopAudit !== false) {
                const slopCheck = scanTextForSlop(prose, {
                    slopConfig: (context?.slopConfig || DEFAULT_SLOP_CONFIG) as SlopConfig,
                    customBannedPhrases: context?.bannedPhrases || [],
                    story: (context?.story || null) as Story | null,
                    isAudioDrama: isAudioDramaMode
                });
                const advisoriesAdded: string[] = [];
                if (slopCheck.hardHits.length > 0) {
                    const sampleHard = Array.from(
                        new Set(slopCheck.hardHits.map((h) => `"${h.match}"`))
                    )
                        .slice(0, 4)
                        .join(', ');
                    advisoriesAdded.push(
                        `Writing Agent (Hard AI-Slop Defect): Detected ${slopCheck.hardHits.length} forbidden cliché/name/voice defect(s) (${sampleHard}). Must be replaced.`
                    );
                }
                if (slopCheck.closerHits.length > 0) {
                    const sampleClosers = Array.from(
                        new Set(slopCheck.closerHits.map((h) => `"${h.match}"`))
                    )
                        .slice(0, 3)
                        .join(', ');
                    advisoriesAdded.push(
                        `Writing Agent (Scene-Closing Tell — Final 2 Sentences): Scene ends on generic summary/closer (${sampleClosers}). Replace with concrete physical action, sensory detail, or unresolved tension.`
                    );
                }
                const nxbCount = slopCheck.patternHits.filter(
                    (p) => p.categoryId === 'not_x_but_y'
                ).length;
                const triCount = slopCheck.patternHits.filter((p) => p.categoryId === 'triad').length;
                if (nxbCount >= 2) {
                    advisoriesAdded.push(
                        `Writing Agent (Rhetorical Tic): Detected ${nxbCount} "Not X, but Y" / "It wasn't X, it was Y" antithesis constructions. Keep only if genuinely earned.`
                    );
                }
                if (triCount >= 1) {
                    advisoriesAdded.push(
                        `Writing Agent (Triad Rhythm): Detected ${triCount} repetitive 3-beat anaphora pattern(s). Vary sentence cadence.`
                    );
                }
                if (slopCheck.clusteredFlagHits.length > 0) {
                    const topCats = Array.from(
                        new Set(
                            slopCheck.clusteredFlagHits.map(
                                (h) => `${h.categoryTitle} ("${h.match}")`
                            )
                        )
                    )
                        .slice(0, 3)
                        .join('; ');
                    advisoriesAdded.push(
                        `Writing Agent (Clustered Slop Flags): Repeated AI-tic fallback(s) detected: ${topCats}.`
                    );
                }
                if (slopCheck.densityHits.length > 0 && advisoriesAdded.length < 6) {
                    slopCheck.densityHits.slice(0, 6 - advisoriesAdded.length).forEach((dh) => {
                        advisoriesAdded.push(
                            `Writing Agent (${dh.categoryTitle}): "${dh.match}" — verify pacing and punctuation variety.`
                        );
                    });
                }
                advisoriesAdded.slice(0, 6).forEach((w) => warnings.push(w));
            }
        } else {
            errors.push('Writing Agent: Prose is too short or missing.');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/** Extracts reviewer PASS/FAIL verdict, deviation reasons, issues, and new character briefs using 3-tier parsing. */
export function extractReviewStatus(rawOutput: unknown): ExtractedReviewStatus {
    if (!rawOutput || typeof rawOutput !== 'string') {
        return {
            status: 'FAIL',
            reasons: ['Empty reviewer output'],
            critique: '',
            briefs: [],
            issues: [],
            isValid: false
        };
    }

    const cleanText = rawOutput.trim();

    try {
        const statusTag = extractTag(cleanText, 'status') || extractTag(cleanText, 'verdict');
        if (statusTag) {
            const rawStatus = statusTag.toUpperCase().trim();
            const status: 'PASS' | 'FAIL' =
                rawStatus.includes('PASS') && !rawStatus.includes('FAIL') ? 'PASS' : 'FAIL';
            const critique =
                extractTag(cleanText, 'critique_analysis') || extractTag(cleanText, 'critique') || '';

            let reasons: string[] = [];
            const deviationReasonsTag = extractTag(cleanText, 'deviation_reasons');
            if (deviationReasonsTag) {
                const reasonList = extractTagList(deviationReasonsTag, 'reason');
                if (reasonList && reasonList.length > 0) {
                    reasons = reasonList.map((r) => decodeXmlEntities(r.trim())).filter(Boolean);
                } else {
                    reasons = deviationReasonsTag
                        .split('\n')
                        .map((l) => l.replace(/^[-*]\s*/, '').trim())
                        .filter(Boolean);
                }
            }

            const issues: ReviewIssueItem[] = [];
            const issuesBlock = extractTag(cleanText, 'issues');
            if (issuesBlock) {
                const issueBlocks = extractTagList(issuesBlock, 'issue');
                for (const b of issueBlocks) {
                    const fixSugg = decodeXmlEntities(
                        extractTag(b, 'fix_suggestion') || extractTag(b, 'fixSuggestion') || ''
                    );
                    issues.push({
                        severity: (extractTag(b, 'severity') || 'CRITICAL').toUpperCase().trim(),
                        category: (extractTag(b, 'category') || 'CHOREOGRAPHY').toUpperCase().trim(),
                        description: decodeXmlEntities(extractTag(b, 'description') || ''),
                        location: decodeXmlEntities(extractTag(b, 'location') || ''),
                        fix_suggestion: fixSugg,
                        fixSuggestion: fixSugg
                    });
                }
            }

            if (reasons.length === 0 && issues.length > 0) {
                reasons = issues.map((iss) => iss.description).filter(Boolean);
            }

            const briefs: ReviewCharacterBrief[] = [];
            const briefsBlock = extractTag(cleanText, 'new_character_briefs');
            if (briefsBlock) {
                const briefBlocks = extractTagList(briefsBlock, 'brief');
                for (const b of briefBlocks) {
                    briefs.push({
                        id:
                            extractTag(b, 'id') ||
                            `C_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        name: decodeXmlEntities(extractTag(b, 'name') || ''),
                        role: decodeXmlEntities(extractTag(b, 'role') || ''),
                        core_flaw: decodeXmlEntities(extractTag(b, 'core_flaw') || ''),
                        core_desire: decodeXmlEntities(extractTag(b, 'core_desire') || ''),
                        vocal_cadence: decodeXmlEntities(extractTag(b, 'vocal_cadence') || '')
                    });
                }
            }

            return {
                status,
                reasons,
                critique: decodeXmlEntities(critique),
                briefs,
                issues,
                isValid: true
            };
        }
    } catch {
        // Fall back to pattern matching when XML extraction encounters malformed markup
    }

    const statusPatterns = [
        /^(?:status|verdict|review_status|decision)\s*:\s*['"]?(PASS|FAIL)['"]?/im,
        /\[(?:STATUS|VERDICT)\]\s*:\s*(PASS|FAIL)/i,
        /(?:STATUS|VERDICT)\s*=\s*(PASS|FAIL)/i,
        /^\s*Verdict\s*:\s*(PASS|FAIL)/im,
        /^\s*Status\s*:\s*(PASS|FAIL)/im
    ];

    let extractedStatus: string | null = null;
    for (const pattern of statusPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            extractedStatus = match[1].toUpperCase().trim();
            break;
        }
    }

    if (extractedStatus) {
        const reasons: string[] = [];
        const reasonMatch = cleanText.match(
            /(?:deviation_reasons|reasons|critical_issues)\s*:\s*([\s\S]*?)(?=\n[a-z_]+:|$)/i
        );
        if (reasonMatch) {
            const lines = reasonMatch[1].split('\n');
            for (const line of lines) {
                const trimmed = line.trim().replace(/^[-*]\s*/, '').trim();
                if (trimmed && trimmed !== '[]') reasons.push(trimmed);
            }
        }

        const critMatch = cleanText.match(
            /(?:critique_analysis|critique|analysis)\s*:\s*([\s\S]*?)(?=\n[a-z_]+:|$)/i
        );
        const critique = critMatch ? critMatch[1].trim() : cleanText;

        return { status: extractedStatus, reasons, critique, briefs: [], issues: [], isValid: true };
    }

    if (cleanText.length > 2000 && !cleanText.match(/status|verdict|review_status|decision/i)) {
        return {
            status: 'PASS',
            reasons: [],
            critique: 'Reviewer produced unstructured output; auto-passing.',
            briefs: [],
            issues: [],
            isValid: false
        };
    }

    const upper = cleanText.toUpperCase();
    const hasPass = upper.includes('PASS');
    const hasFail = upper.includes('FAIL');

    if (hasPass && !hasFail) {
        return { status: 'PASS', reasons: [], critique: cleanText, briefs: [], issues: [], isValid: true };
    }

    const reasons: string[] = [];
    const lines = cleanText.split('\n');
    for (const line of lines) {
        const t = line.trim();
        if ((t.startsWith('-') || t.startsWith('*')) && t.length > 5) {
            reasons.push(t.replace(/^[-*]\s*/, ''));
        }
    }

    return {
        status: 'FAIL',
        reasons: reasons.length > 0 ? reasons : ['Reviewer indicated failure or non-conformance'],
        critique: cleanText,
        briefs: [],
        issues: [],
        isValid: hasFail
    };
}

/** Extracts structured review issues from `<issue>`, `<deviation_reasons>`, or markdown bullets. */
export function parseIssuesFromReview(reviewText: unknown): ReviewIssueItem[] {
    if (!reviewText || typeof reviewText !== 'string') return [];

    try {
        const issues: ReviewIssueItem[] = [];
        const issueBlocks = extractTagList(reviewText, 'issue');
        if (issueBlocks && issueBlocks.length > 0) {
            for (const b of issueBlocks) {
                const fixSugg = decodeXmlEntities(
                    extractTag(b, 'fix_suggestion') || extractTag(b, 'fixSuggestion') || ''
                );
                issues.push({
                    severity: String(extractTag(b, 'severity') || 'MINOR').toUpperCase().trim(),
                    category: String(extractTag(b, 'category') || 'STYLE').toUpperCase().trim(),
                    description: decodeXmlEntities(extractTag(b, 'description') || ''),
                    location: decodeXmlEntities(extractTag(b, 'location') || ''),
                    fix_suggestion: fixSugg,
                    fixSuggestion: fixSugg
                });
            }
            if (issues.length > 0) return issues;
        }

        const devTag = extractTag(reviewText, 'deviation_reasons');
        if (devTag) {
            const reasonBlocks = extractTagList(devTag, 'reason');
            if (reasonBlocks && reasonBlocks.length > 0) {
                return reasonBlocks.map((r) => ({
                    severity: 'MAJOR',
                    category: 'STYLE',
                    description: decodeXmlEntities(r.trim()),
                    location: '',
                    fix_suggestion: '',
                    fixSuggestion: ''
                }));
            }
        }
    } catch (e) {
        console.warn('Failed to parse issues from review as XML:', e);
    }

    const lines = reviewText.split('\n');
    const issues: ReviewIssueItem[] = [];
    for (const line of lines) {
        if (issues.length >= 5) {
            console.warn('Regex fallback parsed >5 issues, likely hallucinated output. Capping at 5.');
            break;
        }
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            const cleanDesc = trimmed
                .replace(/^[-*]\s*/, '')
                .replace(/['"[\]]/g, '')
                .trim();
            if (
                cleanDesc &&
                !cleanDesc.toLowerCase().includes('yaml') &&
                !cleanDesc.toLowerCase().includes('schema') &&
                !cleanDesc.toLowerCase().includes('xml')
            ) {
                issues.push({
                    severity: 'MAJOR',
                    category: 'STYLE',
                    description: cleanDesc,
                    location: '',
                    fix_suggestion: '',
                    fixSuggestion: ''
                });
            }
        }
    }
    return issues;
}

/** Finds proactive scenes whose start and end value shifts fail to change polarity or state. */
export function findFlatValueShiftScenes(
    scenes: Array<Record<string, unknown>>
): Array<{ index: number; scene: Record<string, unknown>; reason: string }> {
    const defective: Array<{ index: number; scene: Record<string, unknown>; reason: string }> = [];
    for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const valShift = sc.value_shift as { start_state?: string; end_state?: string } | undefined;
        const rawType = String(sc.scene_type || sc.type || '').toUpperCase();

        if (
            valShift &&
            valShift.start_state &&
            valShift.end_state &&
            valShift.start_state === valShift.end_state
        ) {
            if (!rawType.includes('SEQUEL') && !rawType.includes('REACTIVE')) {
                defective.push({
                    index: i,
                    scene: sc,
                    reason: `Flat value shift (${valShift.start_state}) in non-transitionary scene`
                });
            }
        }
    }
    return defective;
}
