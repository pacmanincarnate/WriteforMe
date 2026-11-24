/**
 * @module services/llm/tools
 * Writing Agent function tool declarations (`WRITING_AGENT_TOOLS`) and sandboxed
 * local execution (`executeLocalTool`) with epistemic secret masking, AI-slop audit,
 * Audio Drama formatting verification, and archivist memory queries.
 */

import {
    analyzeAudioDramaExpressiveness,
    analyzeAudioDramaScriptFormatting,
    extractDialogueStats,
    isAudioDramaScriptText
} from '@/domain/audio';
import {
    initKnowledgeGraph,
    projectFocalizedSubgraph,
    querySemanticEventLog,
    type ContinuityStoryState
} from '@/domain/continuity';
import { DEFAULT_SLOP_CONFIG, scanTextForSlop } from '@/domain/slop';
import type { SlopConfig, Story } from '@/types';
import { safeEscapeRegex } from '@/utils';
import type { LlmToolDefinition } from './types';

export interface LocalToolSecretEntry {
    status?: string;
    title?: string;
    truth?: string;
    reveal_anchor?: { sequence_number?: number };
    cover_story?: {
        character_masks?: Record<
            string,
            {
                apparent_flaw?: string;
                trait_mask?: string;
                public_interview_voice?: string;
                history_mask?: string;
            }
        >;
    };
}

export interface LocalToolStoryContext extends ContinuityStoryState {
    character_states?: Record<string, Record<string, unknown> & { location?: string }>;
    status_quo?: string;
    continuity_ledger?: Array<{
        key?: string;
        value?: string;
        category?: string;
        source_scene?: string;
    }>;
}

export interface LocalToolSceneContext {
    number?: string | number;
    title?: string;
    setting?: string;
    environment?: string;
    characters_present?: string[];
    cast_names?: string[];
    exit_hook?: string;
    exit_conditions?: string;
    objective?: string;
    goal?: string;
    pov_character?: string;
}

export interface LocalToolContext {
    story?: LocalToolStoryContext;
    currentScene?: LocalToolSceneContext;
    previousScene?: LocalToolSceneContext | null;
    previousSceneProseText?: string;
    currentSceneProseText?: string;
    currentSceneCritique?: string;
    activeCast?: Array<{ name?: string; id?: string; details?: Record<string, unknown> }>;
    sequenceData?: { number?: number | string };
    forceFullRewrite?: boolean;
    writing_mode?: string;
    slopConfig?: (SlopConfig & { enableSlopAudit?: boolean }) | null;
    bannedPhrases?: string[];
}

export const WRITING_AGENT_TOOLS: LlmToolDefinition[] = [
    {
        name: 'inspect_character_state',
        description:
            'Retrieve real-time psychological, physical, emotional, and relational state for a character to maintain continuity and authentic voice.',
        parameters: {
            type: 'object',
            properties: {
                character_id: {
                    type: 'string',
                    description:
                        "The name or ID of the character to inspect (e.g. 'Jane Eyre', 'Mr. Rochester')"
                }
            },
            required: ['character_id']
        }
    },
    {
        name: 'query_story_lore',
        description:
            'Search world-building rules, cultural background, institutional structures, or setting lore to ensure accurate physical and contextual logic.',
        parameters: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'The lore topic, faction, rule, or setting to look up'
                }
            },
            required: ['topic']
        }
    },
    {
        name: 'inspect_previous_scene_exit',
        description:
            'Inspect the final emotional tone, physical momentum, and unresolved hook of the previous scene to ensure seamless continuity across scene boundaries.',
        parameters: {
            type: 'object',
            properties: {
                scene_index: {
                    type: 'number',
                    description: 'Optional sequence or scene index to inspect'
                }
            }
        }
    },
    {
        name: 'evaluate_draft',
        description:
            'Self-critique an initial scene draft against genre pacing rules, dialogue anti-patterns, and clinical/neurochemical clichés before finalization. For audio drama scripts, evaluates speaker formatting, absence of SFX tags, and character dialogue propulsion (all non-Narrator character lines are treated as dialogue).',
        parameters: {
            type: 'object',
            properties: {
                draft_text: {
                    type: 'string',
                    description: 'The initial scene draft text to critique'
                },
                focus_areas: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        "Specific aspects to scrutinize (e.g. ['dialogue subtext', 'sensory specificity', 'avoiding clinical jargon'])"
                }
            },
            required: ['draft_text']
        }
    },
    {
        name: 'commit_scene_prose',
        description:
            'Terminal action: Commit the finalized scene prose after self-evaluation, along with updated character emotional/physical states and exit hook for next scenes.',
        parameters: {
            type: 'object',
            properties: {
                final_prose: {
                    type: 'string',
                    description: 'The complete, polished prose text of the scene.'
                },
                character_state_updates: {
                    type: 'array',
                    description:
                        'Updated physical, emotional, and relational states for characters present in this scene.',
                    items: {
                        type: 'object',
                        properties: {
                            character_name: { type: 'string' },
                            physical_state: { type: 'string' },
                            emotional_state: { type: 'string' },
                            relational_shift: { type: 'string' },
                            unresolved_tension: { type: 'string' }
                        },
                        required: ['character_name', 'emotional_state']
                    }
                },
                scene_exit_hook: {
                    type: 'string',
                    description:
                        'Sensory or narrative hook lingering at the end of the scene to anchor the opening of the next scene.'
                }
            },
            required: ['final_prose']
        }
    },
    {
        name: 'query_archivist',
        description:
            "Query the Multi-Tiered Memory Engine (Relational Knowledge Graph, Semantic Event Log, and World Lore) mid-draft to verify specific historical events, past conversations, item locations, or character revelations without hallucinations.",
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description:
                        "The historical question or continuity detail to check (e.g. 'Did Sloane mention the silver key in Act 1?', 'Who currently possesses the cipher?')"
                },
                focus_entity: {
                    type: 'string',
                    description:
                        'Optional specific character, item, or location name to narrow the query.'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'roll_narrative_oracle',
        description:
            'Roll an improv-style lateral narrative dice tool to introduce organic micro-frictions, unpredictable behavioral complications, or status shifts that elevate the scene without altering the macro-plot value shift.',
        parameters: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    enum: [
                        'any',
                        'improv_pivot',
                        'status_shift',
                        'subtext_eruption',
                        'sensorial_intrusion',
                        'oblique_strategy'
                    ],
                    description:
                        "The category of lateral friction: 'improv_pivot' (Yes, but / No, and), 'status_shift', 'subtext_eruption', 'sensorial_intrusion', 'oblique_strategy', or 'any'."
                },
                dramatic_context: {
                    type: 'string',
                    description:
                        'Brief phrase describing what is happening right now in the scene to contextually tailor the lateral constraint.'
                }
            }
        }
    },
    {
        name: 'inspect_current_scene_draft',
        description:
            'Inspect the existing draft text and any prior review critique for this scene when performing a revision, second pass, or rewrite.',
        parameters: {
            type: 'object',
            properties: {
                include_full_draft: {
                    type: 'boolean',
                    description:
                        'Whether to return the entire draft text (true) or an excerpt summary (false).'
                }
            }
        }
    }
];

export function executeLocalTool(
    name: string,
    args: Record<string, unknown> = {},
    context: LocalToolContext = {}
): Record<string, unknown> {
    const {
        story = {},
        currentScene = {},
        previousScene = null,
        previousSceneProseText = '',
        currentSceneProseText = '',
        currentSceneCritique = '',
        activeCast = []
    } = context;
    const characterStates = story.character_states || {};

    // Epistemic Sandboxing: Determine current sequence position and filter unrevealed secrets
    const currentSeqPos = Number(
        context.sequenceData?.number ||
            (currentScene?.number ? String(currentScene.number).split('.')[0] : 1) ||
            1
    );
    const unrevealedVaultSecrets: LocalToolSecretEntry[] = Array.isArray(story.secret_vault)
        ? (story.secret_vault as LocalToolSecretEntry[]).filter(
              (sec) =>
                  sec.status !== 'revealed' &&
                  Number(sec.reveal_anchor?.sequence_number || 7) > currentSeqPos
          )
        : [];

    const sanitizeStateObj = (
        stateObj: Record<string, unknown>,
        charName: string,
        cId?: string
    ): Record<string, unknown> => {
        if (!stateObj || unrevealedVaultSecrets.length === 0) return stateObj;
        const cloned = { ...stateObj };
        unrevealedVaultSecrets.forEach((sec) => {
            const masks = sec.cover_story?.character_masks || {};
            const mask =
                masks[charName] ||
                (cId ? masks[cId] : undefined) ||
                (charName
                    ? Object.entries(masks).find(
                          ([k]) => k.toLowerCase() === String(charName).toLowerCase()
                      )?.[1]
                    : undefined);
            if (mask) {
                if (mask.apparent_flaw || mask.trait_mask) {
                    cloned.emotional_state = mask.apparent_flaw || mask.trait_mask;
                    cloned.unresolved_tension = mask.apparent_flaw || mask.trait_mask;
                }
                if (mask.public_interview_voice) {
                    cloned.canonical_interview_voice = mask.public_interview_voice;
                }
                if (mask.history_mask) {
                    cloned.history = mask.history_mask;
                }
            }
            if (sec.truth && sec.truth.length > 5) {
                const truthRegex = new RegExp(safeEscapeRegex(sec.truth), 'gi');
                if (typeof cloned.canonical_interview_voice === 'string') {
                    cloned.canonical_interview_voice = cloned.canonical_interview_voice.replace(
                        truthRegex,
                        '[Private Personal Motivation]'
                    );
                }
                if (typeof cloned.emotional_state === 'string') {
                    cloned.emotional_state = cloned.emotional_state.replace(
                        truthRegex,
                        '[Guarded Tension]'
                    );
                }
                if (typeof cloned.unresolved_tension === 'string') {
                    cloned.unresolved_tension = cloned.unresolved_tension.replace(
                        truthRegex,
                        '[Guarded Tension]'
                    );
                }
            }
        });
        return cloned;
    };

    switch (name) {
        case 'inspect_character_state': {
            const charQuery = String(args?.character_id || '')
                .trim()
                .toLowerCase();
            if (!charQuery) return { error: 'No character_id provided.' };

            const castPool = (story.cast || activeCast || []) as Array<{
                id?: string;
                name: string;
                role?: string;
                core_flaw?: string;
                core_desire?: string;
                vocal_cadence?: string;
                interview_psychology?: string;
                deep_profile?: string;
                details?: { deep_profile?: string; [k: string]: unknown };
            }>;
            const castMember = castPool.find(
                (c) =>
                    (c.name &&
                        (c.name.toLowerCase() === charQuery ||
                            c.name.toLowerCase().includes(charQuery))) ||
                    (c.id && String(c.id).toLowerCase() === charQuery)
            );
            const canonicalVoice =
                castMember?.details?.deep_profile ||
                castMember?.interview_psychology ||
                castMember?.deep_profile ||
                '';

            const matchKey = Object.keys(characterStates).find(
                (k) => k.toLowerCase() === charQuery || k.toLowerCase().includes(charQuery)
            );
            if (matchKey && characterStates[matchKey]) {
                return {
                    found: true,
                    character: matchKey,
                    state: sanitizeStateObj(
                        {
                            ...characterStates[matchKey],
                            canonical_interview_voice: canonicalVoice
                        },
                        matchKey,
                        castMember?.id
                    )
                };
            }
            if (castMember) {
                return {
                    found: true,
                    character: castMember.name,
                    state: sanitizeStateObj(
                        {
                            name: castMember.name,
                            role: castMember.role,
                            physical_state: 'Standard active condition',
                            emotional_state: castMember.core_flaw || 'Baseline tension',
                            goals: castMember.core_desire || '',
                            vocal_cadence: castMember.vocal_cadence || '',
                            unresolved_tension: castMember.core_flaw || '',
                            canonical_interview_voice: canonicalVoice
                        },
                        castMember.name,
                        castMember.id
                    )
                };
            }
            return {
                found: false,
                message: `No character matching "${String(
                    args.character_id || ''
                )}" was found in story records.`
            };
        }

        case 'query_story_lore': {
            const topicQuery = String(args?.topic || '')
                .trim()
                .toLowerCase();
            if (!topicQuery) return { error: 'No topic provided.' };

            const results: Array<{ topic?: string; detail?: string }> = [];
            const loreList = Array.isArray(story.lore) ? story.lore : [];
            for (const item of loreList) {
                const top = String(item.topic || '').toLowerCase();
                const rawDetail = String(
                    item.detail || (item as { text?: unknown }).text || ''
                );
                const det = rawDetail.toLowerCase();
                if (
                    top.includes(topicQuery) ||
                    det.includes(topicQuery) ||
                    topicQuery.includes(top)
                ) {
                    results.push({ topic: item.topic, detail: rawDetail });
                }
            }
            if (
                story.status_quo &&
                (story.status_quo.toLowerCase().includes(topicQuery) || results.length === 0)
            ) {
                results.push({
                    topic: 'World Status Quo',
                    detail: story.status_quo.substring(0, 600) + '...'
                });
            }
            if (unrevealedVaultSecrets.length > 0) {
                unrevealedVaultSecrets.forEach((sec) => {
                    if (sec.truth && sec.truth.length > 5) {
                        const truthRegex = new RegExp(safeEscapeRegex(sec.truth), 'gi');
                        results.forEach((res) => {
                            if (res.detail) {
                                res.detail = res.detail.replace(
                                    truthRegex,
                                    '[Redacted lore - pending narrative development]'
                                );
                            }
                        });
                    }
                    if (sec.title && sec.title.length > 4) {
                        const titleRegex = new RegExp(safeEscapeRegex(sec.title), 'gi');
                        results.forEach((res) => {
                            if (res.topic) res.topic = res.topic.replace(titleRegex, '[Redacted Topic]');
                            if (res.detail) res.detail = res.detail.replace(titleRegex, '[Redacted Topic]');
                        });
                    }
                });
            }
            return {
                query: args.topic,
                matches_found: results.length,
                results: results.slice(0, 5)
            };
        }

        case 'inspect_previous_scene_exit': {
            const characterLocations = Object.fromEntries(
                Object.entries(characterStates || {}).map(([k, v]) => [
                    k,
                    v?.location || 'Unspecified'
                ])
            );
            if (!previousScene && !previousSceneProseText) {
                return {
                    has_previous_scene: false,
                    character_locations: characterLocations,
                    message:
                        'This is the opening scene of the novel or act. There is no preceding scene.'
                };
            }
            return {
                has_previous_scene: true,
                previous_scene_title: previousScene?.title || 'Previous Scene',
                previous_scene_setting:
                    previousScene?.setting || previousScene?.environment || 'Not specified',
                previous_scene_characters: Array.isArray(previousScene?.characters_present)
                    ? previousScene.characters_present
                    : previousScene?.cast_names || [],
                character_locations: characterLocations,
                exit_hook:
                    previousScene?.exit_hook ||
                    previousScene?.exit_conditions ||
                    'Standard sequence continuation',
                scene_objective: previousScene?.objective || previousScene?.goal || '',
                ending_prose_snippet: previousSceneProseText
                    ? previousSceneProseText.slice(-400)
                    : 'No ending prose snippet available.'
            };
        }

        case 'inspect_current_scene_draft': {
            if (context?.forceFullRewrite) {
                return {
                    has_draft: false,
                    message:
                        'A mandatory full rewrite is underway. Prior draft is unavailable; generate prose completely fresh from the blueprint.'
                };
            }
            const draftText = currentSceneProseText || '';
            if (!draftText) {
                return {
                    has_draft: false,
                    message: 'No prior draft exists for this scene. This is an initial drafting pass.'
                };
            }
            const returnFull = args?.include_full_draft !== false;
            return {
                has_draft: true,
                word_count: draftText.split(/\s+/).filter(Boolean).length,
                prior_critique: currentSceneCritique || 'No prior review critique recorded.',
                draft: returnFull
                    ? draftText
                    : draftText.length > 2000
                      ? draftText.slice(0, 1000) +
                        '\n\n[... middle sections ...]\n\n' +
                        draftText.slice(-1000)
                      : draftText
            };
        }

        case 'evaluate_draft': {
            const draft = String(args?.draft_text || '');
            const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;

            const isAudioDrama =
                story?.writing_mode === 'audio_drama' ||
                context?.writing_mode === 'audio_drama' ||
                isAudioDramaScriptText(draft);

            const bannedPatterns = [
                /\b(adrenaline|cortisol|dopamine|neurochemical|synapse|amygdala|hypothalamus)\b/gi,
                /\b(predator|prey|apex|calculated with mathematical|calculated precisely)\b/gi,
                /\b(counted the cracks|counting cracks|spun the ring|spinning the ring|twirled the ring|fiddling with (?:his|her|their) ring)\b/gi,
                /\b(pupils dilated|heart rate spiked|pulse hammered against (?:his|her) ribs|took three measured breaths)\b/gi,
                /\b(fight or flight|muscle memory engaged|pure instinct took over|clinical precision|clinical detachment|micro-expressions?)\b/gi,
                /\b(testing a hypothesis|test (?:a|the) hypothesis|ran an experiment|as an experiment|gauge (?:his|her|their) reaction|gather data|observing (?:his|her|their) behavior)\b/gi,
                /\b(three steps ahead|three moves ahead|puppet master|pawns? on a (?:chess)?board|playing chess while)\b/gi
            ];

            const flags: string[] = [];
            for (const pattern of bannedPatterns) {
                const matches = draft.match(pattern);
                if (matches) {
                    flags.push(
                        ...matches.map(
                            (m) =>
                                `Overly clinical/neurochemical, experimental, mastermind, or repetitive trope detected: "${m}"`
                        )
                    );
                }
            }

            const labeledEmotionPatterns = [
                /\b(felt (?:a wave of|a surge of|a sudden|overwhelmed|terrified|furious|confused|hopeless))\b/gi,
                /\b(realized (?:he|she|they) (?:was|were) (?:afraid|terrified|in love|panicking))\b/gi,
                /\b(an overwhelming sense of (?:dread|longing|anger|sadness))\b/gi
            ];
            for (const pattern of labeledEmotionPatterns) {
                const matches = draft.match(pattern);
                if (matches) {
                    flags.push(
                        ...matches.map(
                            (m) =>
                                `Labeled emotion shortcut detected: "${m}". Dramatize through visceral physical action, sensory detail, or somatic response.`
                        )
                    );
                }
            }

            let slopSummary: Record<string, number> | null = null;
            if (context?.slopConfig?.enableSlopAudit !== false) {
                const draftSlop = scanTextForSlop(draft, {
                    slopConfig: context?.slopConfig || DEFAULT_SLOP_CONFIG,
                    customBannedPhrases: context?.bannedPhrases || [],
                    story: story as Partial<Story>,
                    isAudioDrama
                });
                const seenToolFlags = new Set<string>();
                (draftSlop.hardHits || []).forEach((h) => {
                    const msg = `Hard AI-slop defect (${h.categoryTitle}): "${h.match}" — replace immediately.`;
                    if (!seenToolFlags.has(msg)) {
                        seenToolFlags.add(msg);
                        flags.push(msg);
                    }
                });
                (draftSlop.closerHits || []).forEach((h) => {
                    const msg = `Scene-closing cliché in final 2 sentences: "${h.match}". End on concrete physical action, sensory detail, or unanswered tension instead.`;
                    if (!seenToolFlags.has(msg)) {
                        seenToolFlags.add(msg);
                        flags.push(msg);
                    }
                });
                (draftSlop.clusteredFlagHits || []).slice(0, 6).forEach((h) => {
                    const msg = `Repeated AI-slop tic (${h.categoryTitle}): "${h.match}" appeared multiple times. Rework repeated fallbacks.`;
                    if (!seenToolFlags.has(msg)) {
                        seenToolFlags.add(msg);
                        flags.push(msg);
                    }
                });
                const nxbHits = (draftSlop.patternHits || []).filter(
                    (p) => p.categoryId === 'not_x_but_y'
                );
                if (nxbHits.length >= 2) {
                    flags.push(
                        `Rhetorical crutch: "${nxbHits[0].categoryTitle}" appeared ${nxbHits.length} times — vary sentence structure.`
                    );
                }
                const triHits = (draftSlop.patternHits || []).filter(
                    (p) => p.categoryId === 'triad'
                );
                if (triHits.length >= 1) {
                    flags.push(
                        `Triad anaphora rhythm detected ("${triHits[0].match}") — break up repetitive triple phrasing.`
                    );
                }
                (draftSlop.densityHits || []).forEach((dh) => {
                    if (
                        dh.categoryId === 'punctuation_collapse' ||
                        dh.categoryId === 'question_free_dialogue'
                    ) {
                        flags.push(`${dh.categoryTitle}: ${dh.match}.`);
                    }
                });
                slopSummary = {
                    hard_count: draftSlop.summary.hardCount,
                    closer_count: draftSlop.summary.closerCount,
                    clustered_flag_count: draftSlop.summary.clusteredFlagCount,
                    pattern_count: draftSlop.summary.patternCount,
                    density_count: draftSlop.summary.densityCount
                };
            }

            let dialogueWords: number;
            let dialogueRatio: number;
            let audioDramaFmt: ReturnType<typeof analyzeAudioDramaScriptFormatting> | null = null;

            if (isAudioDrama) {
                const dStats = extractDialogueStats(draft, { isAudioDrama: true });
                dialogueWords = dStats.dialogueWords;
                dialogueRatio = dStats.dialogueRatio;
                const spokenWordsForBalance = dStats.spokenTotalWords || wordCount;
                const speakingCastCount = activeCast.filter(
                    (c) => c && String(c.name || c).trim().toLowerCase() !== 'narrator'
                ).length;

                const fmt = analyzeAudioDramaScriptFormatting(draft);
                audioDramaFmt = fmt;

                if (fmt.rawLines.length >= 3 && fmt.speakerLineCount < Math.floor(fmt.rawLines.length * 0.75)) {
                    flags.push(
                        "Audio Drama Formatting: Inconsistent speaker prefixes. Begin every line with 'CharacterName: ' or 'Narrator: '."
                    );
                }
                if (fmt.foleyOrStageViolations > 0) {
                    flags.push(
                        `Audio Drama Formatting: Detected ${fmt.foleyOrStageViolations} unvoiced SFX label or standalone stage cue(s). Voice physical events aloud on 'Narrator: ' lines.`
                    );
                }
                if (fmt.physicalBracketTags.length > 0) {
                    flags.push(
                        `Audio Drama Formatting: Detected ${
                            fmt.physicalBracketTags.length
                        } bracketed instruction(s) [...] with physical movement or props (${fmt.physicalBracketTags
                            .slice(0, 3)
                            .join(
                                ', '
                            )}). Keep [...] focused on vocal delivery/sound and voice physical blocking on 'Narrator: ' lines.`
                    );
                }
                if (fmt.invalidXmlTags && fmt.invalidXmlTags.length > 0) {
                    flags.push(
                        `Audio Drama Formatting: Detected ${
                            fmt.invalidXmlTags.length
                        } unsupported or unclosed inline prosody XML tag(s) (${fmt.invalidXmlTags
                            .slice(0, 3)
                            .join(
                                ', '
                            )}). Use only balanced pairs from <whisper>, <emphasis>, <stress>, <soft>, <fast>, <slow>, <forceful>.`
                    );
                }
                if (fmt.invalidParenTags.length > 0) {
                    flags.push(
                        `Audio Drama Formatting: Detected ${
                            fmt.invalidParenTags.length
                        } legacy parenthetical tag(s) (...) (${fmt.invalidParenTags
                            .slice(0, 3)
                            .join(
                                ', '
                            )}). In Drama-3 syntax, write all delivery cues and vocal events inside square brackets [...] instead of parentheses (...).`
                    );
                }
                if (speakingCastCount > 1 && dialogueRatio < 0.65 && spokenWordsForBalance > 200) {
                    flags.push(
                        `Audio Drama Dialogue Balance: Spoken character dialogue is ${Math.round(
                            dialogueRatio * 100
                        )}% (${Math.round(
                            (1 - dialogueRatio) * 100
                        )}% Narrator; target 75%–90% character speech, <=25% Narrator). Convert descriptive staging and interpersonal beats into active multi-turn character dialogue exchanges.`
                    );
                }
                if (fmt.consecutiveNarratorRuns > 0) {
                    flags.push(
                        `Audio Drama Unified Narration: Found ${fmt.consecutiveNarratorRuns} spot(s) with consecutive 'Narrator:' turns. Combine contiguous Narrator sentences into one unified 'Narrator:' paragraph so each narration beat lands in a single cohesive chunk.`
                    );
                }

                const expr = analyzeAudioDramaExpressiveness(draft);
                if (expr && expr.needsDirectionPass && wordCount > 120) {
                    const topDeficits = expr.deficits.slice(0, 2).join(' ');
                    flags.push(
                        `Drama-3 Expressiveness (${expr.score}/100): ${
                            topDeficits || 'Dialogue lacks layered vocal direction.'
                        } Enrich key character turns with vocal physics + subtext [...], listener context, mid-line [pivots], causal [sigh]/[breath]/[small laugh]/[pause], and varied paired XML tags (<whisper>, <emphasis>, <stress>, <soft>, <fast>, <slow>, <forceful>).`
                    );
                }
            } else {
                const sentences = draft.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 10);
                let consecutiveSubjectCount = 0;
                let lastSubject = '';
                for (const s of sentences) {
                    const clean = s.trim();
                    const match = clean.match(
                        /^(He|She|They|It|[A-Z][a-z]+)\s+(walked|looked|turned|felt|saw|took|grabbed|said|stepped|nodded|pulled|pushed|moved|reached)\b/i
                    );
                    if (match) {
                        const subj = match[1].toLowerCase();
                        if (subj === lastSubject) {
                            consecutiveSubjectCount++;
                            if (consecutiveSubjectCount >= 4) {
                                flags.push(
                                    `Repetitive sentence cadence: 4+ consecutive sentences open with subject-verb pattern ("${match[0]}..."). Vary sentence melody and rhythm.`
                                );
                                break;
                            }
                        } else {
                            consecutiveSubjectCount = 1;
                            lastSubject = subj;
                        }
                    } else {
                        consecutiveSubjectCount = 0;
                        lastSubject = '';
                    }
                }

                const dStats = extractDialogueStats(draft, { isAudioDrama: false });
                dialogueWords = dStats.dialogueWords;
                dialogueRatio = dStats.dialogueRatio;

                if (wordCount >= 40 && dialogueWords === 0) {
                    flags.push(
                        'Scene has 0% spoken dialogue. Every scene requires spoken interaction or vocalization (the dialogue target is a mandatory minimum; 0% dialogue is strictly forbidden).'
                    );
                } else if (activeCast.length > 1 && dialogueRatio < 0.15 && wordCount > 300) {
                    flags.push(
                        `Multi-character scene has low dialogue ratio (${Math.round(
                            dialogueRatio * 100
                        )}%). Characters should actively converse, react, and process stakes out loud (minimum 15% required).`
                    );
                }
            }

            const exprInfo = isAudioDrama ? analyzeAudioDramaExpressiveness(draft) : null;

            return {
                draft_word_count: wordCount,
                dialogue_percentage: `${Math.round(dialogueRatio * 100)}%`,
                dialogue_word_count: dialogueWords,
                format: isAudioDrama ? 'audio_drama_script' : 'narrative_prose',
                ...(isAudioDrama
                    ? {
                          narrator_percentage: `${Math.round((1 - dialogueRatio) * 100)}%`,
                          consecutive_narrator_runs: audioDramaFmt
                              ? audioDramaFmt.consecutiveNarratorRuns
                              : 0
                      }
                    : {}),
                ...(exprInfo
                    ? {
                          expressiveness_score: exprInfo.score,
                          expressiveness_summary: exprInfo.summary
                      }
                    : {}),
                ...(slopSummary ? { slop_summary: slopSummary } : {}),
                anti_pattern_flags: flags,
                critique_summary:
                    flags.length === 0
                        ? isAudioDrama
                            ? 'Audio drama script conforms to multi-voice acoustic standards with clean speaker formatting and active character dialogue.'
                            : 'Draft is stylistically clean, avoids clinical tropes, and maintains narrative momentum.'
                        : `Found ${flags.length} stylistic/formatting concerns. Please revise before calling commit_scene_prose.`,
                ready_to_commit: flags.length === 0
            };
        }

        case 'query_archivist': {
            const q = String(args?.query || '').trim();
            const focus = String(args?.focus_entity || '')
                .trim()
                .toLowerCase();
            if (!q) return { error: 'No query provided to query_archivist.' };

            const kg = initKnowledgeGraph(story);
            const matchingNodes = kg.nodes.filter(
                (n) =>
                    (focus && n.name.toLowerCase().includes(focus)) ||
                    q.toLowerCase().includes(n.name.toLowerCase()) ||
                    (n.attributes &&
                        Object.values(n.attributes).some((v) =>
                            String(v).toLowerCase().includes(q.toLowerCase())
                        ))
            );
            const matchingEdges = kg.edges.filter(
                (e) =>
                    (focus &&
                        (e.source.toLowerCase().includes(focus) ||
                            e.target.toLowerCase().includes(focus))) ||
                    q.toLowerCase().includes(e.source.toLowerCase()) ||
                    q.toLowerCase().includes(e.target.toLowerCase())
            );

            const eventMatches = querySemanticEventLog(story, {
                entityNames: focus ? [focus] : [],
                query: q,
                limit: 4
            });

            const ledger = story.continuity_ledger || [];
            const ledgerMatches = ledger
                .filter((e) => {
                    const str = `${e.key || ''} ${e.value || ''} ${e.category || ''}`.toLowerCase();
                    return (focus && str.includes(focus)) || str.includes(q.toLowerCase());
                })
                .slice(0, 4);

            const loreList = Array.isArray(story.lore) ? story.lore : [];
            const loreMatches = loreList
                .filter((l) => {
                    const top = String(l.topic || '').toLowerCase();
                    const det = String(l.detail || (l as { text?: unknown }).text || '').toLowerCase();
                    return (
                        top.includes(q.toLowerCase()) ||
                        (focus && top.includes(focus)) ||
                        det.includes(q.toLowerCase())
                    );
                })
                .slice(0, 3);

            const epistemicMatches: Array<{
                claim: string;
                stance: string;
                confidence: unknown;
                source_type: unknown;
            }> = [];
            if (story.epistemic_graph && story.epistemic_graph.propositions) {
                const povChar = currentScene?.pov_character || activeCast[0]?.name || '';
                const currentCoord =
                    currentScene && currentScene.number
                        ? String(currentScene.number).trim()
                        : '1.1';
                const proj = projectFocalizedSubgraph(story, {
                    povCharId: povChar,
                    sceneCoord: currentCoord
                });
                Object.values(story.epistemic_graph.propositions).forEach((p) => {
                    const edge = proj.povBeliefs[p.id];
                    if (!edge || edge.stance === 'UNAWARE') return;
                    if (
                        p.claim_text.toLowerCase().includes(q.toLowerCase()) ||
                        (focus &&
                            (p.subject_id.includes(focus) || p.object_id.includes(focus)))
                    ) {
                        epistemicMatches.push({
                            claim: p.claim_text,
                            stance: edge.stance,
                            confidence: edge.confidence,
                            source_type: edge.source_type
                        });
                    }
                });
            }

            return {
                query: q,
                historical_ground_truth: {
                    knowledge_graph_nodes: matchingNodes.map((n) => ({
                        name: n.name,
                        type: n.type,
                        status: n.status,
                        attributes: n.attributes
                    })),
                    knowledge_graph_edges: matchingEdges.map((e) => ({
                        from: e.source,
                        to: e.target,
                        relation: e.relation,
                        status: e.status
                    })),
                    recent_events: eventMatches.map((ev) => ({
                        scene: ev.scene_id,
                        summary: ev.summary
                    })),
                    continuity_facts: ledgerMatches.map((l) => ({
                        key: l.key,
                        value: l.value,
                        category: l.category,
                        scene: l.source_scene
                    })),
                    world_lore: loreMatches.map((lm) => ({
                        topic: lm.topic,
                        detail: lm.detail || (lm as { text?: string }).text
                    })),
                    focalized_character_beliefs: epistemicMatches
                },
                guidance:
                    "Use this historical record to ground the scene's dialogue and subtext without contradicting established canon."
            };
        }

        case 'roll_narrative_oracle': {
            const reqCat = String(args?.category || 'any').toLowerCase();
            const dContext = String(args?.dramatic_context || '').trim();

            const oracleBank: Record<string, string[]> = {
                improv_pivot: [
                    'Yes, but... The character gains what they asked for, but it comes with an immediate, unexpected physical or social cost.',
                    "No, and... The character's attempt fails completely, and the failure immediately escalates the urgency or reveals an impending hazard.",
                    "Yes, but... Agreement is reached, but the terms compromise someone's personal dignity, leverage, or secrecy.",
                    'No, and... The refusal reveals that an opposing party has already taken irreversible action elsewhere.'
                ],
                status_shift: [
                    'The character with the lowest power or perceived authority in the room suddenly seizes the high ground through a sharp observation, unvarnished truth, or unexpected refusal.',
                    'The dominant figure in the room suddenly fumbles—revealing an unexpected hesitation, physical tremor, or sudden loss of certainty.',
                    'An unspoken alliance shifts: someone in the room subtly aligns with the opposing speaker through deliberate eye contact, a shared glance, or loaded silence.'
                ],
                subtext_eruption: [
                    'A character accidentally speaks the quiet part out loud—stating an unfiltered truth they desperately meant to disguise.',
                    "A character answers a hidden question that wasn't asked, exposing their secret preoccupation or vulnerability.",
                    'A deliberate pause or slip of the tongue betrays concealed knowledge or emotional attachment.'
                ],
                sensorial_intrusion: [
                    'An intrusive physical element of the immediate environment (a sudden draft, dropping temperature, breaking glass, flickering lamp, exterior alarm/horn) forcibly interrupts the conversation.',
                    "A sharp bodily sensation (an old ache flaring, sudden muscle tremor, dry throat, ringing in the ears) breaks the character's focus and forces a physical pause."
                ],
                oblique_strategy: [
                    'Honor thy error as a hidden intention: let an awkward phrasing, clumsy hesitation, or physical mistake become the dramatic pivot of this interaction.',
                    'Look closely at the most mundane or embarrassing detail in the room and make it the focal point of the next paragraph.',
                    'State the problem in words as simply and plainly as possible, stripping away all defensive rhetoric.',
                    'Give the opposing character an unexpected moment of genuine grace, restraint, or quiet pity.'
                ]
            };

            const categories = [
                'improv_pivot',
                'status_shift',
                'subtext_eruption',
                'sensorial_intrusion',
                'oblique_strategy'
            ];
            const chosenCategory =
                reqCat !== 'any' && oracleBank[reqCat]
                    ? reqCat
                    : categories[Math.floor(Math.random() * categories.length)];
            const prompts = oracleBank[chosenCategory];
            const selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];

            return {
                oracle_roll: {
                    category: chosenCategory,
                    dramatic_context: dContext || 'Current dramatic exchange',
                    micro_friction_constraint: selectedPrompt,
                    directive:
                        "Integrate this micro-friction laterally into the next paragraph to create unexpected texture without altering the scene's ultimate Value Shift or macro objective."
                }
            };
        }

        case 'commit_scene_prose': {
            const finalProse = String(args?.final_prose || '').trim();
            return {
                status: 'COMMITTED',
                prose_length: finalProse.length,
                word_count: finalProse.split(/\s+/).filter(Boolean).length,
                character_state_updates: args?.character_state_updates || [],
                scene_exit_hook: args?.scene_exit_hook || ''
            };
        }

        default:
            return { error: `Unknown tool "${name}".` };
    }
}
