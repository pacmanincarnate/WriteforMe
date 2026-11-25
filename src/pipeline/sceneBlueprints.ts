/**
 * @module pipeline/sceneBlueprints
 * Tier 4.1–4.4 Scene Planner, Resilient Multi-Strategy Blueprint Parser,
 * Cross-Sequence Boundary Continuity Auditor, and Upstream Place Name Repair.
 */

import {
    inferNarrativeModeForScene,
    NARRATIVE_MODES,
    STRUCTURAL_MODALITIES,
    type NarrativeModeDefinition
} from '@/config';
import {
    buildScenePlannerContinuityBlock,
    ensureEpistemicGraph,
    formatSceneCharactersList,
    type ContinuityStoryState
} from '@/domain/continuity';
import {
    applyCascadingNameReplacements as domainApplyCascadingNameReplacements,
    auditEntityNamesAndPlaces as domainAuditEntityNamesAndPlaces,
    extractCandidatePlaceNames as domainExtractCandidatePlaceNames
} from '@/domain/slop';
import {
    actForSequence,
    buildSceneCountTargetBlock,
    computeSequenceLengthPlan,
    formatLoreForPrompt,
    getAuthorNoteXml,
    normalizeSceneBlueprint,
    parseActNumber,
    parseValueShiftInput
} from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type { CastMember, LoreItem, SceneBlueprint, Story } from '@/types';
import { decodeXmlEntities, extractTag, isSerializationPlaceholder } from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { repairBannedEntitiesWithAI } from './continuityPipeline';

export interface PrefetchScenesResult {
    scenes: Record<string, SceneBlueprint[]>;
    length_control: {
        sequences: Record<string, Record<string, unknown>>;
    };
}

/** TIER 4.1–4.4: Plans scene blueprints for a sequence with boundary continuity & name audits. */
export async function generateScenes(
    ctx: PipelineRuntimeContext,
    sequenceIndex?: number | null,
    currentStory?: PipelineStory | null,
    isAutopilot = false,
    isPrefetch = false
): Promise<PipelineStory | PrefetchScenesResult | undefined> {
    const selectedSeq = ctx.getSelectedSequence?.() ?? null;
    const seqIdx =
        typeof sequenceIndex === 'number'
            ? sequenceIndex
            : selectedSeq !== null
              ? selectedSeq
              : 0;
    const storyToUse = ctx.getStory() || currentStory || {};
    const sequences = asArray<Record<string, unknown>>(storyToUse.sequences);

    if (sequences.length === 0) {
        if (!isAutopilot) {
            ctx.showToast('Please weave sequences first.', 'warning');
            return undefined;
        }
    }

    const currentSequence = sequences[seqIdx] || {
        number: seqIdx + 1,
        title: `Sequence ${seqIdx + 1}`,
        description: asString(storyToUse.concept)
    };
    const currentSeqNum = Number(currentSequence.number || seqIdx + 1);

    if (!isPrefetch) {
        ctx.setLoading(true);
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 3,
            elementType: 'sequence',
            actNumber: parseActNumber(currentSequence.parent_act, actForSequence(seqIdx + 1)),
            seqIdx,
            seqNumber: currentSeqNum,
            seqTitle: asString(currentSequence.title) || `Sequence ${seqIdx + 1}`,
            title: `Sequence ${currentSeqNum}: ${asString(currentSequence.title)}`,
            subStep: 'Planning Scene Blueprints (Tier 4.1–4.3)',
            startedAt: Date.now()
        });
        ctx.setLoadingStep(`Planning Scenes for Sequence ${currentSeqNum}...`);
    }

    const allNarrativeModes: Record<string, NarrativeModeDefinition> =
        ctx.getAllNarrativeModes?.() || NARRATIVE_MODES;

    const parseSceneBlueprints = (rawText: string): Array<SceneBlueprint & Record<string, unknown>> => {
        if (!rawText || typeof rawText !== 'string') return [];
        const text = rawText.trim();
        const sceneBlocks: string[] = [];

        const sceneRegex = /<scene(?:\s+[^>]*)?>([\s\S]*?)<\/scene>/gi;
        let match: RegExpExecArray | null;
        while ((match = sceneRegex.exec(text)) !== null) {
            if (match[1] && match[1].trim()) sceneBlocks.push(match[1].trim());
        }

        if (sceneBlocks.length === 0) {
            const blueprintRegex = /<scene_blueprint(?:\s+[^>]*)?>([\s\S]*?)<\/scene_blueprint>/gi;
            while ((match = blueprintRegex.exec(text)) !== null) {
                if (match[1] && match[1].trim()) sceneBlocks.push(match[1].trim());
            }
        }

        if (sceneBlocks.length === 0) {
            const altRegex =
                /<(?:scene_plan|scene_dossier|chapter_scene)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:scene_plan|scene_dossier|chapter_scene)>/gi;
            while ((match = altRegex.exec(text)) !== null) {
                if (match[1] && match[1].trim()) sceneBlocks.push(match[1].trim());
            }
        }

        if (sceneBlocks.length === 0 && typeof DOMParser !== 'undefined') {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(`<root>${text}</root>`, 'text/xml');
                const nodes = doc.querySelectorAll('scene, scene_blueprint, scene_plan, scene_dossier');
                if (nodes && nodes.length > 0) {
                    nodes.forEach((n) => {
                        const inner = n.innerHTML || n.textContent;
                        if (inner && inner.trim()) sceneBlocks.push(inner.trim());
                    });
                }
            } catch {
                // Ignore invalid partial XML
            }
        }

        if (sceneBlocks.length === 0) {
            const mdSections = text.split(
                /(?:^|\n)(?=(?:#{1,4}\s*(?:Scene|\d+[:.]|\bScene\b)|\*{2}Scene\s*\d+[:*]|\bScene\s+\d+[:.]))/i
            );
            for (const sec of mdSections) {
                const trimmed = sec.trim();
                if (
                    trimmed.length > 60 &&
                    (/title/i.test(trimmed) ||
                        /setting/i.test(trimmed) ||
                        /pov/i.test(trimmed) ||
                        /goal/i.test(trimmed) ||
                        /value_shift|emotional/i.test(trimmed) ||
                        /overview|atmosphere/i.test(trimmed))
                ) {
                    sceneBlocks.push(trimmed);
                }
            }
        }

        if (sceneBlocks.length === 0) return [];

        const allModalities = Object.values(STRUCTURAL_MODALITIES).map((m) => m.name);
        const parsed: Array<SceneBlueprint & Record<string, unknown>> = [];
        const prevSeqScenes = asArray<Record<string, unknown>>(
            asRecord(storyToUse.scenes)[`${seqIdx - 1}`]
        );
        const storyCast = asArray<CastMember>(storyToUse.cast);

        for (let idx = 0; idx < sceneBlocks.length; idx++) {
            const block = sceneBlocks[idx];

            const getField = (tagName: string, mdLabels: string[] = []): string => {
                if (!block) return '';
                const tagRegex = new RegExp(
                    `<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`,
                    'i'
                );
                const tMatch = block.match(tagRegex);
                if (tMatch && tMatch[1].trim()) return decodeXmlEntities(tMatch[1].trim());

                const labels = [tagName, tagName.replace(/_/g, ' '), ...(mdLabels || [])];
                for (const label of labels) {
                    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const mdRegex = new RegExp(
                        `(?:^|\\n)(?:[-*•]|\\d+\\.?)?\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:\\-]\\s*([^\\n]+(?:\\n(?!\\s*(?:[-*•]|\\d+\\.?)?\\s*(?:\\*\\*)?[A-Z][a-zA-Z\\s_]+(?:\\*\\*)?\\s*[:\\-])[^\\n]+)*)`,
                        'i'
                    );
                    const mMatch = block.match(mdRegex);
                    if (mMatch && mMatch[1].trim()) {
                        return mMatch[1]
                            .trim()
                            .replace(/^[:\-\s]+/, '')
                            .replace(/[*_#]+$/, '')
                            .trim();
                    }
                }
                return '';
            };

            const atmosphericOverview =
                getField('atmospheric_overview', [
                    'atmosphere',
                    'setting overview',
                    'spatial overview'
                ]) || '';
            const rawCharactersPresent =
                getField('characters_present', [
                    'characters',
                    'cast present',
                    'cast names',
                    'active characters'
                ]) || '';
            const rawCharTokens = rawCharactersPresent
                ? rawCharactersPresent
                      .split(/[,;\n]+|(?:\band\b)/i)
                      .map((s) => s.trim().replace(/^-\s*/, ''))
                      .filter(Boolean)
                : [];
            const hadCharPlaceholder = rawCharTokens.some((s) => isSerializationPlaceholder(s));
            const charList = rawCharTokens.filter((s) => !isSerializationPlaceholder(s));

            const rawModalityHand =
                getField('modality_hand', [
                    'modalities',
                    'narrative modalities',
                    'selected modalities'
                ]) || '';
            const modalityHandList = rawModalityHand
                ? rawModalityHand
                      .split(/[,;\n]+/)
                      .map((s) => s.trim().replace(/^-\s*/, ''))
                      .filter(Boolean)
                : [];

            const canonicalHand: string[] = [];
            modalityHandList.forEach((mStr) => {
                const clean = String(mStr).trim().toLowerCase();
                const matched = allModalities.find(
                    (am) =>
                        am.toLowerCase() === clean ||
                        am.toLowerCase().includes(clean) ||
                        clean.includes(am.toLowerCase())
                );
                if (matched && !canonicalHand.includes(matched)) {
                    canonicalHand.push(matched);
                }
            });

            const prevHandRaw =
                idx > 0
                    ? parsed[idx - 1]?.modality_hand
                    : prevSeqScenes[prevSeqScenes.length - 1]?.modality_hand;
            const prevHand = asArray<string>(prevHandRaw);
            const prevSet = new Set(prevHand.map((m) => String(m).toLowerCase()));

            if (
                canonicalHand.length < 3 ||
                (canonicalHand.length > 0 && canonicalHand.every((m) => prevSet.has(m.toLowerCase())))
            ) {
                const candidates = allModalities.filter(
                    (m) => !prevSet.has(m.toLowerCase()) && !canonicalHand.includes(m)
                );
                const pool =
                    candidates.length > 0
                        ? candidates
                        : allModalities.filter((m) => !canonicalHand.includes(m));
                const shuffled = [...pool].sort(() => 0.5 - Math.random());
                while (canonicalHand.length < 3 && shuffled.length > 0) {
                    const popped = shuffled.pop();
                    if (popped) canonicalHand.push(popped);
                }
            }
            const finalModalityHand = canonicalHand.slice(0, 5);

            let title = getField('title', ['scene title', 'chapter title', 'name']);
            if (!title) {
                const headerMatch = block.match(
                    /(?:^|\n)#{1,4}\s*(?:Scene\s*[\d.]*[:\s]*)?([^\n]+)/i
                );
                if (headerMatch && headerMatch[1].trim()) {
                    title = headerMatch[1].trim().replace(/[*_]/g, '').trim();
                }
            }
            if (!title) title = `Scene ${idx + 1}`;

            const rawSceneId = getField('scene_id', ['id', 'scene number', 'number']) || '';
            const setting = getField('setting', ['location', 'place', 'scene setting']) || '';
            const transitionJump =
                getField('transition_jump', [
                    'transition jump',
                    'transition',
                    'temporal jump',
                    'spatial transition'
                ]) ||
                (idx === 0 && seqIdx === 0
                    ? 'Opening scene of the novel'
                    : 'Direct continuation from preceding scene');
            const entranceConditions =
                getField('entrance_conditions', [
                    'entrance_condition',
                    'entrance conditions',
                    'entrance condition',
                    'opening state',
                    'entry state'
                ]) || '';
            const pov = getField('pov_character', ['pov', 'viewpoint', 'camera']) || '';
            const goal = getField('goal', ['objective', 'scene objective', 'scene goal']) || '';
            const sceneEvents =
                getField('scene_events', [
                    'scene_event',
                    'scene events',
                    'scene event',
                    'events',
                    'event',
                    'plot_events',
                    'plot_event',
                    'actions',
                    'plot_points',
                    'plot_point'
                ]) || '';
            const valueShift =
                getField('value_shift', ['emotional shift', 'valence shift', 'pivot']) || '';
            const exitHook = getField('exit_hook', ['hook', 'scene hook', 'ending hook']) || '';
            const exitConditions =
                getField('exit_conditions', [
                    'exit_condition',
                    'exit conditions',
                    'exit condition'
                ]) ||
                exitHook ||
                '';
            const sceneTypeRaw =
                getField('scene_type', ['scene type', 'type']) ||
                (idx % 2 === 0 ? 'PROACTIVE' : 'REACTIVE');
            const epistemicFrictionLevel =
                getField('epistemic_friction_level', [
                    'epistemic friction',
                    'friction_level',
                    'friction'
                ]) || 'MODERATE';
            const activationContexts =
                getField('activation_contexts', ['activation context', 'contexts', 'context']) || '';

            const surfaceActivity =
                getField('surface_activity', [
                    'surface activity',
                    'activity',
                    'physical activity',
                    'task',
                    'grounded activity'
                ]) || '';
            const mainCharacterHeart =
                getField('main_character_heart', [
                    'main character heart',
                    'pov heart',
                    'mc heart',
                    'internal yearning',
                    'quiet yearning'
                ]) || '';
            const otherCharacterHeart =
                getField('other_character_heart', [
                    'other character heart',
                    'partner heart',
                    'challenger heart',
                    'counterpart heart'
                ]) || '';
            const theHingeMoment =
                getField('the_hinge_moment', [
                    'the hinge moment',
                    'hinge moment',
                    'the hinge',
                    'hinge',
                    'turning point',
                    'emotional hinge'
                ]) || '';

            const rawDeltasXml =
                getField('target_epistemic_deltas', ['epistemic_deltas', 'target_deltas']) || '';
            const parsedDeltas: Array<Record<string, unknown>> = [];
            if (rawDeltasXml) {
                const deltaRegex = /<delta\s+([^>]*?)\/?>(?:<\/delta>)?/gi;
                let dMatch: RegExpExecArray | null;
                while ((dMatch = deltaRegex.exec(rawDeltasXml)) !== null) {
                    const attrStr = dMatch[1];
                    const getAttr = (attrName: string) => {
                        const m = attrStr.match(new RegExp(`${attrName}=["']([^"']*)["']`, 'i'));
                        return m ? m[1] : '';
                    };
                    const holder = getAttr('holder') || pov || 'Protagonist';
                    const prop = getAttr('proposition') || getAttr('proposition_id') || '';
                    const op = getAttr('operation') || 'ELEVATE_SUSPICION';
                    const toStance = getAttr('to_stance') || 'SUSPECTS_TRUE';
                    const toConf = parseFloat(getAttr('to_confidence') || '0.45');
                    const trigger = getAttr('trigger_clue') || getAttr('trigger') || '';
                    if (prop || holder) {
                        parsedDeltas.push({
                            holder,
                            proposition_id: prop,
                            operation: op,
                            to_stance: toStance,
                            to_confidence: Number.isNaN(toConf) ? 0.45 : toConf,
                            trigger_clue: trigger
                        });
                    }
                }
            }

            if (parsedDeltas.length === 0 && Array.isArray(storyToUse.secret_vault)) {
                const currentScnNum = idx + 1;
                asArray<Record<string, unknown>>(storyToUse.secret_vault).forEach((sec) => {
                    asArray<Record<string, unknown>>(sec.clue_schedule).forEach((clue) => {
                        if (
                            Number(clue.sequence_number) === currentSeqNum &&
                            (Number(clue.scene_number || 1) === currentScnNum ||
                                (currentScnNum === 1 && !clue.scene_number))
                        ) {
                            parsedDeltas.push({
                                holder: pov || 'Protagonist',
                                proposition_id: `prop_${asString(sec.id)}_truth`,
                                operation: 'ELEVATE_SUSPICION',
                                to_stance: 'SUSPECTS_TRUE',
                                to_confidence: 0.4,
                                trigger_clue:
                                    asString(clue.behavioral_directive) ||
                                    `Notice subtle hesitation regarding ${asString(sec.title)}`
                            });
                        }
                    });
                    const revAnchor = asRecord(sec.reveal_anchor);
                    if (
                        Number(revAnchor.sequence_number || sec.reveal_target_sequence) ===
                            currentSeqNum &&
                        (Number(revAnchor.scene_number || 1) === currentScnNum || currentScnNum === 1)
                    ) {
                        parsedDeltas.push({
                            holder: pov || 'Protagonist',
                            proposition_id: `prop_${asString(sec.id)}_truth`,
                            operation: 'ACQUIRE',
                            to_stance: 'BELIEVES_TRUE',
                            to_confidence: 0.95,
                            trigger_clue: `Major revelation of ${asString(sec.title)}`
                        });
                    }
                });
            }

            const rawDominantMode =
                getField('dominant_narrative_mode', [
                    'dominant_mode',
                    'narrative_mode',
                    'narrative_style',
                    'scene_narrative_style',
                    'scene_mode',
                    'mode',
                    'style'
                ]) || '';
            let matchedModeId: string | null = null;
            if (rawDominantMode) {
                const cleanMode = String(rawDominantMode)
                    .trim()
                    .toUpperCase()
                    .replace(/[\s-]+/g, '_');
                if (allNarrativeModes[cleanMode]) {
                    matchedModeId = cleanMode;
                } else {
                    const found = Object.values(allNarrativeModes).find((m) => {
                        const mRec = m as unknown as Record<string, unknown>;
                        const mName = asString(mRec.name);
                        const mTitle = asString(mRec.title);
                        return (
                            m.id.toUpperCase() === cleanMode ||
                            (mName && mName.toLowerCase() === rawDominantMode.trim().toLowerCase()) ||
                            (mTitle &&
                                mTitle.toLowerCase() === rawDominantMode.trim().toLowerCase()) ||
                            cleanMode.includes(m.id.toUpperCase())
                        );
                    });
                    if (found) matchedModeId = found.id;
                }
            }

            const parsedValueShift = parseValueShiftInput(valueShift);

            if (!matchedModeId) {
                matchedModeId = inferNarrativeModeForScene(
                    {
                        title,
                        scene_events: sceneEvents,
                        atmospheric_overview: atmosphericOverview,
                        modality_hand: finalModalityHand,
                        goal,
                        objective: goal
                    },
                    allNarrativeModes
                );
            }

            parsed.push(
                normalizeSceneBlueprint(
                    {
                        id: `scene_${Date.now()}_${idx}`,
                        parsed_scene_id: rawSceneId,
                        number: `${currentSeqNum}.${idx + 1}`,
                        title,
                        scene_type: sceneTypeRaw,
                        pov_character: pov,
                        setting,
                        transition_jump: transitionJump,
                        entrance_conditions: entranceConditions,
                        exit_conditions: exitConditions,
                        scene_events: sceneEvents,
                        dominant_narrative_mode: matchedModeId,
                        atmospheric_overview: atmosphericOverview,
                        modality_hand: finalModalityHand,
                        characters_present:
                            hadCharPlaceholder && charList.length === 0
                                ? ['[Circular]']
                                : [...charList],
                        cast_names:
                            hadCharPlaceholder && charList.length === 0
                                ? ['[Circular]']
                                : [...charList],
                        goal,
                        objective: goal,
                        value_shift: parsedValueShift,
                        exit_hook: exitHook,
                        epistemic_friction_level: epistemicFrictionLevel,
                        activation_contexts: activationContexts,
                        target_epistemic_deltas: parsedDeltas,
                        surface_activity: surfaceActivity,
                        main_character_heart: mainCharacterHeart,
                        other_character_heart: otherCharacterHeart,
                        the_hinge_moment: theHingeMoment
                    },
                    idx,
                    currentSeqNum,
                    storyCast
                ) as SceneBlueprint & Record<string, unknown>
            );
        }

        if (
            parsed.length > 1 &&
            parsed.every((s) => s.dominant_narrative_mode === 'BASELINE_NEUTRAL')
        ) {
            const nonNeutralKeys = Object.keys(allNarrativeModes).filter(
                (k) => k !== 'BASELINE_NEUTRAL'
            );
            if (nonNeutralKeys.length > 0) {
                parsed.forEach((sc, i) => {
                    if (i % 2 === 1) {
                        const inferred = inferNarrativeModeForScene(sc, allNarrativeModes);
                        if (inferred && inferred !== 'BASELINE_NEUTRAL') {
                            sc.dominant_narrative_mode = inferred;
                        } else {
                            sc.dominant_narrative_mode = nonNeutralKeys[i % nonNeutralKeys.length];
                        }
                    }
                });
            }
        }

        return parsed;
    };

    try {
        const lengthPlan = computeSequenceLengthPlan(
            storyToUse as Partial<Story> & Record<string, unknown>,
            seqIdx
        );
        const sceneTargetBlock = buildSceneCountTargetBlock(lengthPlan, seqIdx, currentSequence);
        const targetFloor = lengthPlan.floor;
        const targetIdeal = lengthPlan.idealScenes;

        const availableStylesXml =
            `<available_narrative_styles>\n` +
            Object.values(allNarrativeModes)
                .map((m) => {
                    const mRec = m as unknown as Record<string, unknown>;
                    const name = asString(mRec.name) || asString(mRec.title) || m.id;
                    return `  <style id="${m.id}" name="${name}">\n    <context>${m.context || ''}</context>\n  </style>`;
                })
                .join('\n') +
            `\n</available_narrative_styles>`;

        const seqQuery = `Sequence ${currentSeqNum}: ${asString(currentSequence.title)}. ${asString(currentSequence.description) || asString(currentSequence.sequence_objective)}`;
        const seqLoreDocs = await ctx.retrieveContext(
            seqQuery,
            0.6,
            (meta) =>
                !meta ||
                !meta.valid_from_act ||
                Number(meta.valid_from_act) <= Number(currentSequence.parent_act || 1),
            asArray<LoreItem>(storyToUse.lore)
        );
        const sceneLoreBlocks = formatLoreForPrompt(
            asString(storyToUse.world_primer) || null,
            seqLoreDocs
        );

        const castRosterBlock = `<cast_roster>\n${asArray<CastMember & Record<string, unknown>>(storyToUse.cast).map((c) => `- ${c.name} (${c.role}${c.corner_role ? ` [${asString(c.corner_role)}]` : ''}): Safety Habit / Flaw: ${c.core_flaw || 'None'}, Yearning: ${c.core_desire || 'None'}`).join('\n')}\n</cast_roster>`;
        const epGraph = ensureEpistemicGraph(storyToUse as ContinuityStoryState);
        const epPropLines = Object.values(epGraph.propositions || {})
            .slice(0, 15)
            .map(
                (p) =>
                    `- Proposition [${p.id}]: "${p.claim_text}" (Objective Status: ${p.objective_truth})`
            );
        const seqSecretLines = Array.isArray(storyToUse.secret_vault)
            ? asArray<Record<string, unknown>>(storyToUse.secret_vault).map(
                  (s) =>
                      `- Secret [prop_${asString(s.id)}_truth]: "${asString(s.title)}" (Status: ${asString(s.status) || 'dormant'}) -> Target Reveal: Sequence ${asRecord(s.reveal_anchor).sequence_number || s.reveal_target_sequence || 7}`
              )
            : [];
        const combinedEpistemicLines = [...seqSecretLines, ...epPropLines].join('\n');
        const epistemicPromptBlock = combinedEpistemicLines
            ? `<active_epistemic_propositions>\n${combinedEpistemicLines}\n</active_epistemic_propositions>\n\n`
            : '';

        let newScenes: Array<SceneBlueprint & Record<string, unknown>> = [];
        let attempts = 0;
        let lastOutput = '';

        while (attempts < 3 && newScenes.length < targetFloor) {
            attempts++;
            const liveStoryForScenes = ctx.getStory() || storyToUse;
            const liveSeqs = asArray<Record<string, unknown>>(liveStoryForScenes.sequences);
            const liveSequence = liveSeqs[seqIdx] || currentSequence;
            const liveSeqNum = Number(liveSequence.number || currentSeqNum);
            const sceneContinuityBlock = buildScenePlannerContinuityBlock(
                liveStoryForScenes as ContinuityStoryState,
                seqIdx,
                liveSequence
            );
            let prompt = `Plan approximately ${targetIdeal} high-leverage Scene Blueprints for Sequence ${liveSeqNum}: ${asString(liveSequence.title)}.
Sequence Description & Mandates: ${asString(liveSequence.description)}
${liveSequence.starting_state ? `Sequence Starting State / Entry Anchor: ${asString(liveSequence.starting_state)}\n` : ''}${liveSequence.sequence_objective ? `Sequence Objective: ${asString(liveSequence.sequence_objective)}\n` : ''}${liveSequence.dramatic_question ? `Dramatic Question: ${asString(liveSequence.dramatic_question)}\n` : ''}${liveSequence.sequence_climax ? `Sequence Climax: ${asString(liveSequence.sequence_climax)}\n` : ''}${liveSequence.ending_hook ? `Sequence Ending Hook: ${asString(liveSequence.ending_hook)}\n` : ''}${liveSequence.next_sequence_boundary_guard ? `Sequence Boundary Guard (Do NOT Preempt Next Sequence): ${asString(liveSequence.next_sequence_boundary_guard)}\n` : ''}${liveSequence.four_corner_movement ? `\nSequence Four-Corner Movement (Safety Habit testing): ${asString(liveSequence.four_corner_movement)}\n` : ''}${liveStoryForScenes.heart_of_the_dilemma ? `\nCentral Human Dilemma: "${asString(liveStoryForScenes.heart_of_the_dilemma)}"\n` : ''}
${sceneTargetBlock}

${sceneContinuityBlock}

${availableStylesXml}

${sceneLoreBlocks ? `${sceneLoreBlocks}\n\n` : ''}${castRosterBlock}

${epistemicPromptBlock}

<story_bible_context>
Synthesized Authorial Persona: ${asString(liveStoryForScenes.synthesized_authorial_persona)}
Genre Pacing & Rules: ${asString(liveStoryForScenes.genre_pacing_and_dialogue_rules)}
Strict Anti-Patterns: ${asString(liveStoryForScenes.strict_anti_patterns)}
World Bible: ${asString(liveStoryForScenes.status_quo)}
</story_bible_context>
${getAuthorNoteXml(liveStoryForScenes as Partial<Story> & Record<string, unknown>)}

MANDATORY LORE, CAST & BOUNDARY CONTINUITY DIRECTIVES:
1. Lore Grounding: Ground all scene settings, environments, factions, and institutional rules in the established world lore provided in <world_primer> and <relevant_lore>. Prioritize established locations and organizations from the world lore before inventing new ones.
2. Canonical Cast Roster: Select POV characters (<pov_character>) and scene participants (<characters_present>) strictly from the canonical characters in <cast_roster>. Do not invent extraneous primary or protagonist characters.
3. Cross-Sequence Spatial & Character Continuity: Align Scene ${liveSeqNum}.1 smoothly with <previous_sequence_handoff>, never re-introducing characters who already met in an earlier sequence as strangers, and ensure Scene ${liveSeqNum}.last lands at the exact threshold required by <next_sequence_lookahead_and_boundary_guard> without preempting the next sequence's events or character introductions.
`;
            if (attempts > 1) {
                prompt += `\n\nCRITICAL RETRY MANDATE: Your previous response provided only ${newScenes.length} scene(s). A minimum of ${targetFloor} scenes is required for Sequence ${currentSeqNum} to ensure adequate narrative scope.
You must expand the dramatic runway and plan at least ${targetFloor} distinct scenes. Each scene MUST be strictly enclosed inside <scene>...</scene> tags and MUST include an explicit <dominant_narrative_mode> selected from <available_narrative_styles>:\n<scene>\n  <scene_id>${liveSeqNum}.1</scene_id>\n  <title>...</title>\n  <dominant_narrative_mode>EXACT_STYLE_ID</dominant_narrative_mode>\n  <pov_character>...</pov_character>\n  <setting>...</setting>\n  <transition_jump>...</transition_jump>\n  <entrance_conditions>...</entrance_conditions>\n  <scene_events>One paragraph defining what actually happens in this scene—the concrete plot actions and key events that must take place.</scene_events>\n  <atmospheric_overview>...</atmospheric_overview>\n  <modality_hand>...</modality_hand>\n  <characters_present>...</characters_present>\n  <goal>...</goal>\n  <value_shift>...</value_shift>\n  <exit_hook>...</exit_hook>\n  <epistemic_friction_level>HIGH | MODERATE | LOW</epistemic_friction_level>\n  <activation_contexts>...</activation_contexts>\n  <target_epistemic_deltas>\n    <delta holder="..." proposition="..." operation="ELEVATE_SUSPICION | ACQUIRE | INVALIDATE" to_stance="SUSPECTS_TRUE | BELIEVES_TRUE" to_confidence="0.45" trigger_clue="..." />\n  </target_epistemic_deltas>\n</scene>`;
            }

            const output = await ctx.callAI(
                prompt,
                PROMPTS.scenePlannerAgent,
                false,
                attempts === 1 ? 'Scene Planner' : `Scene Planner (Retry ${attempts})`,
                'dev'
            );
            lastOutput = output;
            newScenes = parseSceneBlueprints(output);
        }

        if (newScenes.length < targetFloor) {
            console.error(
                `[Scene Planner] Underflow error: Only generated ${newScenes.length} scenes (min ${targetFloor} required):`,
                lastOutput
            );
            throw new Error(
                `Scene planning underflow: Generated ${newScenes.length} scenes, but at least ${targetFloor} are required.`
            );
        }

        // Post-Planning Cross-Sequence Boundary Continuity Verification Pass
        const liveStoryForAudit = ctx.getStory() || storyToUse;
        const totalPlannedSequences = asArray(liveStoryForAudit.sequences).length;
        if (
            ctx.getEnableReview() &&
            newScenes.length > 0 &&
            (seqIdx > 0 || seqIdx + 1 < totalPlannedSequences)
        ) {
            try {
                if (!isPrefetch) {
                    ctx.setActivePipelineWork?.({
                        mode: 'novel',
                        phase: 3,
                        elementType: 'sequence',
                        seqIdx,
                        seqNumber: currentSeqNum,
                        subStep: 'Auditing Scene Continuity Boundaries (Tier 4.4)'
                    });
                    ctx.setLoadingStep(
                        `Auditing Scene Continuity Boundaries for Sequence ${currentSeqNum}...`
                    );
                }
                const liveSeqForAudit =
                    asArray<Record<string, unknown>>(liveStoryForAudit.sequences)[seqIdx] ||
                    currentSequence;
                const auditContinuityBlock = buildScenePlannerContinuityBlock(
                    liveStoryForAudit as ContinuityStoryState,
                    seqIdx,
                    liveSeqForAudit
                );
                const plannedScenesXml = newScenes
                    .map(
                        (sc) => `<scene>
  <scene_id>${sc.number}</scene_id>
  <title>${sc.title || ''}</title>
  <pov_character>${sc.pov_character || ''}</pov_character>
  <setting>${sc.setting || ''}</setting>
  <transition_jump>${asString(sc.transition_jump)}</transition_jump>
  <entrance_conditions>${asString(sc.entrance_conditions)}</entrance_conditions>
  <characters_present>${formatSceneCharactersList(sc)}</characters_present>
  <goal>${asString(sc.goal) || asString(sc.objective)}</goal>
  <scene_events>${asString(sc.scene_events) || asString(sc.description)}</scene_events>
  <exit_hook>${asString(sc.exit_hook)}</exit_hook>
</scene>`
                    )
                    .join('\n');

                const boundaryAuditPrompt = `${auditContinuityBlock}

<planned_sequence_scenes>
${plannedScenesXml}
</planned_sequence_scenes>

<audit_target_sequence>
Audit the planned scenes for Sequence ${asString(liveSeqForAudit.number)}: "${asString(liveSeqForAudit.title)}" (Scenes ${asString(liveSeqForAudit.number)}.1 through ${asString(liveSeqForAudit.number)}.${newScenes.length}; Next Sequence: ${Number(liveSeqForAudit.number) + 1}) strictly for spatial continuity, prior-interaction fidelity, and cross-sequence boundary compliance.
</audit_target_sequence>`;

                const boundaryAuditSysPrompt = `You are a Structural Continuity & Sequence Boundary Auditor. Enforce strict spatial continuity, no duplicate character introductions, and strict anti-preemption between adjacent sequences.

## Input Schema Definition
You will receive the following context blocks:
- <sequence_boundary_and_continuity_context>: Contains <previous_sequence_handoff>, <next_sequence_lookahead_and_boundary_guard>, and <story_so_far_and_active_continuity> (<story_so_far>, <living_character_states>, <continuity_ledger>).
- <planned_sequence_scenes>: The planned <scene> blocks (with <scene_id>, <title>, <pov_character>, <setting>, <transition_jump>, <entrance_conditions>, <characters_present>, <goal>, <scene_events>, <exit_hook>) for the sequence under audit.
- <audit_target_sequence>: Target sequence number, title, scene count, first scene ID, and final scene ID.

CHECKLIST:
1. Entry Alignment (Scene N.1 vs <previous_sequence_handoff>): Does Scene N.1 begin seamlessly from where the previous sequence ended (honoring character locations and prior interactions via <transition_jump> and <entrance_conditions>), without teleporting characters or re-introducing already-met characters as strangers?
2. Intra-Sequence Chain: Does every scene move cleanly from the previous scene's setting and exit_hook into the next?
3. Anti-Preemption & Terminal Exit (All scenes, especially the final scene vs <next_sequence_lookahead_and_boundary_guard>): Do ANY scenes in the target sequence prematurely stage events, destination arrivals, or first-time character introductions reserved for Sequence N+1? Does the final scene conclude in a physical setting and <exit_hook> that delivers the characters to the exact threshold needed by Sequence N+1?

If continuity and boundaries are clean, respond ONLY with:
<continuity_status>PASS</continuity_status>

If ANY spatial contradiction, redundant first-meeting re-introduction, or next-sequence encroachment exists, respond with:
<continuity_status>FAIL</continuity_status>
<audit_summary>Brief description of the exact continuity or boundary issue fixed.</audit_summary>
<corrected_scenes>
  <!-- Include complete <scene>...</scene> blocks ONLY for the scene(s) requiring repair, preserving their exact <scene_id> (e.g. N.last). Preserve all existing fields while fixing <setting>, <transition_jump>, <entrance_conditions>, <characters_present>, <goal>, <scene_events>, and <exit_hook>. -->
</corrected_scenes>`;

                const boundaryAuditRes = await ctx.callAI(
                    boundaryAuditPrompt,
                    boundaryAuditSysPrompt,
                    false,
                    'Scene Boundary Continuity Auditor',
                    'review'
                );

                if (
                    boundaryAuditRes &&
                    /<continuity_status>\s*FAIL\s*<\/continuity_status>/i.test(boundaryAuditRes) &&
                    /<corrected_scenes>/i.test(boundaryAuditRes)
                ) {
                    const correctedSection =
                        extractTag(boundaryAuditRes, 'corrected_scenes') || boundaryAuditRes;
                    const correctedParsed = parseSceneBlueprints(correctedSection);
                    let appliedFixes = 0;
                    if (correctedParsed.length > 0) {
                        correctedParsed.forEach((cScene) => {
                            const targetId = String(cScene.parsed_scene_id || '').trim();
                            let matchIdx = targetId
                                ? newScenes.findIndex(
                                      (orig) =>
                                          orig.number === targetId ||
                                          String(orig.number).endsWith(`.${targetId}`)
                                  )
                                : -1;
                            if (matchIdx === -1 && correctedParsed.length === newScenes.length) {
                                matchIdx = correctedParsed.indexOf(cScene);
                            }
                            if (matchIdx >= 0 && newScenes[matchIdx]) {
                                const orig = newScenes[matchIdx];
                                const nextSetting = cScene.setting || orig.setting;
                                const nextTransition = cScene.transition_jump || orig.transition_jump;
                                const nextEntrance =
                                    cScene.entrance_conditions || orig.entrance_conditions;
                                const nextGoal = cScene.goal || orig.goal;
                                const nextEvents = cScene.scene_events || orig.scene_events;
                                const nextExitHook = cScene.exit_hook || orig.exit_hook;
                                const nextAtm =
                                    cScene.atmospheric_overview || orig.atmospheric_overview;
                                const cValShift = asOptionalRecord(cScene.value_shift);
                                const nextValShift =
                                    cValShift && cValShift.start_state
                                        ? cScene.value_shift
                                        : orig.value_shift;
                                const nextValShiftRec = asOptionalRecord(nextValShift);
                                const valStr = nextValShiftRec
                                    ? asString(nextValShiftRec.start_state)
                                    : asString(nextValShift);
                                const cleanRepairCast = (arr: unknown): string[] =>
                                    asArray(arr)
                                        .map((x) =>
                                            typeof x === 'string'
                                                ? x.trim()
                                                : asString(asOptionalRecord(x)?.name || x).trim()
                                        )
                                        .filter((x) => x && !isSerializationPlaceholder(x));
                                const repairedCast = cleanRepairCast(cScene.characters_present);
                                const origPresCast = cleanRepairCast(orig.characters_present);
                                const origNamesCast = cleanRepairCast(orig.cast_names);
                                const nextCast =
                                    repairedCast.length > 0
                                        ? repairedCast
                                        : origPresCast.length > 0
                                          ? origPresCast
                                          : origNamesCast;
                                const repairedScene = normalizeSceneBlueprint(
                                    {
                                        ...orig,
                                        title:
                                            cScene.title && !/^Scene \d+$/i.test(cScene.title)
                                                ? cScene.title
                                                : orig.title,
                                        pov_character: cScene.pov_character || orig.pov_character,
                                        setting: nextSetting,
                                        transition_jump: nextTransition,
                                        entrance_conditions: nextEntrance,
                                        characters_present: [...nextCast],
                                        cast_names: [...nextCast],
                                        goal: nextGoal,
                                        objective: nextGoal,
                                        scene_events: nextEvents,
                                        atmospheric_overview: nextAtm,
                                        value_shift: nextValShift,
                                        exit_hook: nextExitHook,
                                        exit_conditions: nextExitHook || orig.exit_conditions
                                    },
                                    matchIdx,
                                    currentSeqNum,
                                    asArray<CastMember>(liveStoryForAudit.cast || storyToUse.cast)
                                ) as SceneBlueprint & Record<string, unknown>;
                                repairedScene.id = orig.id;
                                repairedScene.number = orig.number;
                                repairedScene.description = `**Setting:** ${asString(nextSetting)}${nextTransition ? `\n**Transition Jump:** ${asString(nextTransition)}` : ''}${nextEntrance ? `\n**Entrance Conditions:** ${asString(nextEntrance)}` : ''}\n**Goal:** ${asString(nextGoal)}${nextEvents ? `\n**Scene Events:** ${asString(nextEvents)}` : ''}\n**Value Shift:** ${valStr}\n**Exit Hook:** ${asString(nextExitHook)}${orig.surface_activity ? `\n**Surface Activity:** ${asString(orig.surface_activity)}` : ''}${nextAtm ? `\n**Atmospheric Overview:** ${asString(nextAtm).slice(0, 160)}...` : ''}`;
                                newScenes[matchIdx] = repairedScene;
                                appliedFixes++;
                            }
                        });
                    }
                    if (appliedFixes > 0) {
                        const auditSummaryText =
                            extractTag(boundaryAuditRes, 'audit_summary') ||
                            `Repaired ${appliedFixes} scene blueprint(s) for cross-sequence boundary continuity.`;
                        ctx.logPipelineValidation(
                            `Scene Boundary Continuity Audit (Sequence ${currentSeqNum})`,
                            true,
                            auditSummaryText,
                            null,
                            {
                                tierName: 'Scene Planner',
                                type: 'scene_boundary_repair',
                                actionTaken: `Surgically updated ${appliedFixes} scene blueprint(s) to enforce sequence entry/exit alignment and anti-preemption.`
                            }
                        );
                    }
                } else {
                    ctx.logPipelineValidation(
                        `Scene Boundary Continuity Audit (Sequence ${currentSeqNum})`,
                        true,
                        'Planned scenes passed cross-sequence entry, exit, and anti-preemption checks.',
                        null,
                        {
                            tierName: 'Scene Planner',
                            type: 'scene_boundary_pass',
                            actionTaken: 'Sequence boundary continuity verified.'
                        }
                    );
                }
            } catch (boundaryAuditErr) {
                console.warn(
                    `[Scene Planner] Boundary continuity audit warning for Sequence ${currentSeqNum}:`,
                    boundaryAuditErr
                );
            }
        }

        // Upstream Slop & Place Name Audit
        const slopConfig = ctx.getSlopConfig();
        if (
            newScenes.length > 0 &&
            slopConfig?.enableSlopAudit !== false &&
            slopConfig?.enableUpstreamNameAudit !== false
        ) {
            try {
                const liveAuditStory = ctx.getStory() || storyToUse;
                const activeCastForAudit = asArray<CastMember>(liveAuditStory.cast);
                const sceneTextBlob = newScenes
                    .map(
                        (sc) =>
                            `${asString(sc.setting)}\n${asString(sc.title)}\n${asString(sc.scene_events)}`
                    )
                    .join('\n');
                const extractPlacesFn =
                    ctx.extractCandidatePlaceNames || domainExtractCandidatePlaceNames;
                const auditFn = ctx.auditEntityNamesAndPlaces || domainAuditEntityNamesAndPlaces;
                const replaceFn =
                    ctx.applyCascadingNameReplacements || domainApplyCascadingNameReplacements;

                const seqPlaceCandidates = extractPlacesFn(sceneTextBlob, activeCastForAudit);
                const seqPlaceAudit = auditFn({
                    characters: [],
                    places: seqPlaceCandidates,
                    existingCast: activeCastForAudit,
                    slopConfig,
                    story: liveAuditStory as Partial<Story>
                });
                if (!seqPlaceAudit.valid && seqPlaceAudit.violations.length > 0) {
                    const { renameMap } = await repairBannedEntitiesWithAI(ctx, {
                        violations: seqPlaceAudit.violations,
                        existingNames: activeCastForAudit
                            .map((c) => c.name)
                            .concat(seqPlaceCandidates),
                        storyContext: `${asString(liveAuditStory.concept)}\nSequence ${currentSeqNum}: ${asString(currentSequence.title)}`,
                        story: liveAuditStory
                    });
                    if (Object.keys(renameMap).length > 0) {
                        const cascadeVal = (v: unknown): unknown => {
                            if (typeof v === 'string') return replaceFn(v, renameMap);
                            if (Array.isArray(v)) {
                                return v.map((x) =>
                                    typeof x === 'string' ? replaceFn(x, renameMap) : x
                                );
                            }
                            return v;
                        };
                        newScenes = newScenes.map((sc) => ({
                            ...sc,
                            title: cascadeVal(sc.title) as string,
                            setting: cascadeVal(sc.setting) as string,
                            description: cascadeVal(sc.description) as string,
                            scene_events: cascadeVal(sc.scene_events) as string,
                            objective: cascadeVal(sc.objective) as string,
                            goal: cascadeVal(sc.goal) as string,
                            surface_activity: cascadeVal(sc.surface_activity) as string,
                            the_hinge_moment: cascadeVal(sc.the_hinge_moment) as string,
                            exit_hook: cascadeVal(sc.exit_hook) as string,
                            cast_names: cascadeVal(sc.cast_names) as string[],
                            characters_present: cascadeVal(sc.characters_present) as string[]
                        }));
                        ctx.showToast(
                            `Upstream Place Audit renamed: ${Object.keys(renameMap)
                                .map((k) => `${k} → ${renameMap[k]}`)
                                .join(', ')}`,
                            'info'
                        );
                    }
                }
            } catch (seqPlaceAuditErr) {
                console.warn('[generateScenes] Upstream place audit warning:', seqPlaceAuditErr);
            }
        }

        const seqLengthEntry = {
            ...lengthPlan,
            actualPlannedScenes: newScenes.length,
            plannedAt: Date.now()
        };

        if (isPrefetch) {
            return {
                scenes: { [`${seqIdx}`]: newScenes },
                length_control: {
                    sequences: { [`${seqIdx}`]: seqLengthEntry }
                }
            };
        }

        const nextStory = ctx.setStory((prev) => {
            const prevLengthCtrl = asRecord(prev.length_control);
            const updatedLengthControl = {
                ...prevLengthCtrl,
                sequences: {
                    ...asRecord(prevLengthCtrl.sequences),
                    [`${seqIdx}`]: seqLengthEntry
                }
            };
            const cleanedBeats = { ...asRecord(prev.beats) };
            const cleanedProse = { ...asRecord(prev.prose) };
            Object.keys(cleanedBeats).forEach((k) => {
                if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) delete cleanedBeats[k];
            });
            Object.keys(cleanedProse).forEach((k) => {
                if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) delete cleanedProse[k];
            });
            return {
                ...prev,
                length_control: updatedLengthControl,
                scenes: {
                    ...asRecord(prev.scenes),
                    [`${seqIdx}`]: newScenes
                },
                beats: cleanedBeats,
                prose: cleanedProse
            };
        });

        const nextId = asString(nextStory.id);
        if (nextId) {
            try {
                await storyStore.saveStory(nextId, nextStory);
            } catch (saveErr) {
                console.warn('Failed saving scenes to store:', saveErr);
            }
        }

        ctx.showToast(
            `Planned ${newScenes.length} scenes for Sequence ${currentSeqNum} (${lengthPlan.sceneRegister.name} register)`,
            'success'
        );
        if (isAutopilot) return nextStory;
        return undefined;
    } catch (err) {
        console.error(err);
        ctx.showToast(`Error generating scenes: ${extractErrorMessage(err)}`, 'error');
        if (isAutopilot) throw err;
        return undefined;
    } finally {
        if (!isAutopilot && !isPrefetch) ctx.setLoading(false);
    }
}
