/**
 * @module domain/story/directivePlanning
 * Scene active cast resolution, modality hand canonicalization, directive mandate helpers,
 * directive plan XML parser/serializer, and drafted story word counter.
 */

import { STRUCTURAL_MODALITIES } from '@/config';
import type { CastMember, SceneBlueprint } from '@/types';
import {
    STOPWORDS,
    decodeXmlEntities,
    escapeXml,
    extractTag,
    isSerializationPlaceholder,
    tokenMatch
} from '@/utils';
import { resolveCharacter } from './entities';

export interface ActiveCastMember extends CastMember {
    aliases?: unknown[];
    details?: {
        aliases?: unknown[];
        history?: string;
        goals?: string;
        personality?: string;
        deep_profile?: string;
        [key: string]: unknown;
    };
}

export interface DirectiveLineEdit {
    find: string;
    replace: string;
}

export interface DirectiveActionDetails extends Record<string, unknown> {
    instructions?: string;
    find_text?: string;
    replace_text?: string;
    line_edits?: DirectiveLineEdit[];
    insert_at_idx?: number;
    key?: string;
    value?: string;
    to_sequence_idx?: string | number;
    target_sequence_idx?: string | number;
    target_seq_idx?: string | number;
    dominant_narrative_mode?: string;
    mode_override?: string;
}

export interface DirectiveActionItem {
    action_type: string;
    allow_protected?: boolean;
    allow_large_change?: boolean;
    target_act_idx: number;
    target_sequence_idx: number;
    target_seq_idx?: number;
    target_scene_idx: number | null;
    target_character_id: string | null;
    description: string;
    details: DirectiveActionDetails;
    skipped?: boolean;
    result?: unknown;
    [key: string]: unknown;
}

export interface DirectivePlan {
    evaluation: string;
    scope_kind: 'local' | 'arc' | string;
    consistency_notes: string;
    actions: DirectiveActionItem[];
    consistencyReview?: unknown;
}

/** Resolves the cast members present in a scene from explicit scene fields or blueprint prose mentions. */
export function getSceneActiveCast(
    scene: (SceneBlueprint & Record<string, unknown>) | null | undefined,
    mutableCast: ReadonlyArray<ActiveCastMember | null | undefined>
): ActiveCastMember[] {
    if (!scene) return [];
    const castList = (Array.isArray(mutableCast) ? mutableCast : []).filter(
        (c): c is ActiveCastMember => Boolean(c)
    );

    const flattenList = (val: unknown): Array<string | Record<string, unknown>> => {
        const items = Array.isArray(val) ? val : val ? [val] : [];
        const out: Array<string | Record<string, unknown>> = [];
        items.forEach((it) => {
            if (typeof it === 'string') {
                it.split(/[,;\n]+|(?:\band\b)/i)
                    .map((s) => s.trim().replace(/^-\s*/, ''))
                    .filter((x) => x && !isSerializationPlaceholder(x))
                    .forEach((x) => out.push(x));
            } else if (it && typeof it === 'object') {
                out.push(it as Record<string, unknown>);
            }
        });
        return out;
    };

    const castNames = flattenList(scene.cast_names);
    const castIds = flattenList(scene.cast_ids);
    const presNames = flattenList(scene.characters_present);
    const chars = flattenList(scene.characters);
    const scCast = flattenList(scene.cast);

    const allIdentifiers = [...castIds, ...castNames, ...presNames, ...chars, ...scCast];

    let activeCast = castList.filter((ch) => {
        const chName = (ch.name || '').trim().toLowerCase();
        const chId = (ch.id || '').trim().toLowerCase();
        const cAliases = (
            Array.isArray(ch.aliases)
                ? ch.aliases
                : Array.isArray(ch.details?.aliases)
                  ? ch.details.aliases
                  : []
        ).map((a) => String(a).trim().toLowerCase());

        return allIdentifiers.some((ident) => {
            if (!ident) return false;
            if (typeof ident === 'object') {
                if (ident === (ch as unknown)) return true;
                const iId = String(ident.id || '').trim().toLowerCase();
                const iName = String(ident.name || '').trim().toLowerCase();
                if (iId && chId && iId === chId) return true;
                if (iName && chName && iName === chName) return true;
                return false;
            }
            const cleanIdent = String(ident).trim().toLowerCase();
            if (chId && cleanIdent === chId) return true;
            if (chName && cleanIdent === chName) return true;
            if (cAliases.includes(cleanIdent)) return true;
            const resolved = resolveCharacter(cleanIdent, castList);
            if (!resolved) return false;
            if (resolved === ch) return true;
            const resId = String(resolved.id || '').trim().toLowerCase();
            const resName = String(resolved.name || '').trim().toLowerCase();
            return (
                (Boolean(resId && chId) && resId === chId) ||
                (Boolean(resName && chName) && resName === chName)
            );
        });
    });

    if (activeCast.length === 0) {
        const text =
            `${scene.title || ''} ${scene.pov_character || ''} ${String(scene.scene_events || '')} ${scene.objective || scene.goal || ''} ${String(scene.surface_activity || '')} ${String(scene.the_hinge_moment || '')}`.toLowerCase();

        activeCast = castList.filter((ch) => {
            if (!ch || !ch.name) return false;
            const cName = String(ch.name).trim().toLowerCase();
            const cAliases = (
                Array.isArray(ch.aliases)
                    ? ch.aliases
                    : Array.isArray(ch.details?.aliases)
                      ? ch.details.aliases
                      : []
            ).map((a) => String(a).trim().toLowerCase());
            if (tokenMatch(text, cName) || cAliases.some((a) => tokenMatch(text, a))) return true;
            const parts = cName.split(/\s+/);
            return parts.some((p) => p.length >= 2 && !STOPWORDS.has(p) && tokenMatch(text, p));
        });
    }

    if (activeCast.length === 0 && castList.length > 0) {
        activeCast = [castList[0]];
    }

    return activeCast;
}

/** Normalizes a modality hand value into up to 5 canonical structural modality names. */
export function canonicalizeModalityHand(
    rawHand: unknown,
    fallback: string[] = []
): string[] {
    const allModalities = Object.values(STRUCTURAL_MODALITIES || {}).map((m) => m.name);
    let items: string[] = [];
    if (Array.isArray(rawHand)) {
        items = rawHand.map((item) => String(item || '').trim()).filter(Boolean);
    } else if (typeof rawHand === 'string' && rawHand.trim()) {
        const trimmed = rawHand.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (Array.isArray(parsed)) {
                    items = parsed.map((x) => String(x || '').trim()).filter(Boolean);
                }
            } catch {
                // Fall back to delimited split
            }
        }
        if (items.length === 0) {
            items = trimmed
                .split(/[,;\n]+/)
                .map((s) => s.trim().replace(/^-\s*/, ''))
                .filter(Boolean);
        }
    }

    const canonical: string[] = [];
    items.forEach((mStr) => {
        const clean = mStr.toLowerCase();
        const matched = allModalities.find(
            (am) =>
                am.toLowerCase() === clean ||
                am.toLowerCase().includes(clean) ||
                clean.includes(am.toLowerCase())
        );
        if (matched && !canonical.includes(matched)) canonical.push(matched);
        else if (!matched && allModalities.length === 0 && !canonical.includes(mStr)) {
            canonical.push(mStr);
        }
    });

    if (canonical.length > 0) return canonical.slice(0, 5);
    return Array.isArray(fallback) ? fallback : [];
}

/** Resolves `cast_ids`, `cast_names`, and `characters_present` from raw cast inputs. */
export function resolveSceneCastFields(
    rawCast: unknown,
    storyCast: ReadonlyArray<{ id?: string; name?: string }> = []
): { cast_ids: string[]; cast_names: string[]; characters_present: string[] } {
    const parsedCast = Array.isArray(rawCast)
        ? rawCast
              .map((n) =>
                  typeof n === 'string'
                      ? n.trim()
                      : String((n as { name?: unknown } | null)?.name || n || '')
              )
              .filter(Boolean)
        : typeof rawCast === 'string'
          ? rawCast
                .split(/[,;\n]+/)
                .map((name) => name.trim())
                .filter(Boolean)
          : [];

    const castIds = parsedCast
        .map((name) => {
            const existing = (storyCast || []).find(
                (c) => (c.name || '').toLowerCase() === name.toLowerCase()
            );
            return existing?.id || name;
        })
        .filter(Boolean);

    const castNames = castIds.map((id, idx) => {
        const char = (storyCast || []).find((c) => c.id === id);
        return char?.name || parsedCast[idx];
    });

    return { cast_ids: castIds, cast_names: castNames, characters_present: [...castNames] };
}

/** Appends a future-mandate bullet line to an existing text block without duplicating identical text. */
export function appendPersistedMandate(
    existingText = '',
    mandateText = '',
    label = ''
): string {
    const cleanMandate = String(mandateText || '').trim();
    if (!cleanMandate) return String(existingText || '');
    const cleanLabel = String(label || '').trim();
    const line = `- **DIRECTIVE MANDATE${cleanLabel ? ` (${cleanLabel})` : ''}:** ${cleanMandate}`;
    const base = String(existingText || '').trim();
    if (!base) return line;
    if (base.toLowerCase().includes(cleanMandate.toLowerCase())) return base;
    return `${base}\n${line}`;
}

/** Serializes a parsed/edited directive plan back into `<response>...</response>` XML. */
export function serializeDirectivePlan(plan: Partial<DirectivePlan> | null | undefined): string {
    const tag = (name: string, value: unknown): string =>
        `<${name}>${escapeXml(value == null ? '' : String(value))}</${name}>`;

    const actions = (plan?.actions || [])
        .filter((action) => !action?.skipped)
        .map((action) => {
            const fields = [
                'action_type',
                'target_act_idx',
                'target_sequence_idx',
                'target_scene_idx',
                'target_character_id',
                'description',
                'allow_large_change'
            ] as const;
            const targets = fields
                .map((field) =>
                    tag(
                        field,
                        field === 'target_sequence_idx'
                            ? action.target_sequence_idx ?? action.target_seq_idx
                            : action[field]
                    )
                )
                .join('\n');

            const details = Object.entries(action.details || {})
                .map(([field, value]) => {
                    if (field === 'line_edits') {
                        const edits = Array.isArray(value) ? (value as DirectiveLineEdit[]) : [];
                        return `<line_edits>${edits.map((edit) => `<edit>${tag('find', edit.find)}${tag('replace', edit.replace)}</edit>`).join('')}</line_edits>`;
                    }
                    return tag(
                        field,
                        typeof value === 'object' && value !== null ? JSON.stringify(value) : value
                    );
                })
                .join('\n');

            return `<action>\n${targets}\n<details>\n${details}\n</details>\n</action>`;
        })
        .join('\n');

    return `<response>\n${tag('evaluation', plan?.evaluation)}\n${tag('scope_kind', plan?.scope_kind || 'local')}\n${tag('consistency_notes', plan?.consistency_notes)}\n<actions>\n${actions}\n</actions>\n</response>`;
}

/** Strips execution results and consistency review state from a directive plan copy. */
export function clearDirectivePlanResults(plan: DirectivePlan): DirectivePlan {
    const cleanPlan: DirectivePlan = {
        evaluation: plan.evaluation,
        scope_kind: plan.scope_kind,
        consistency_notes: plan.consistency_notes,
        actions: plan.actions.map((action) => {
            const { result: _removedResult, ...rest } = action;
            void _removedResult;
            return {
                ...rest,
                details: JSON.parse(JSON.stringify(action.details || {})) as DirectiveActionDetails
            };
        })
    };
    return cleanPlan;
}

/** Parses XML output from the Directive Planner into structured actions and details. */
export function parseDirectivePlan(planText: string): DirectivePlan {
    if (!planText || typeof planText !== 'string') {
        return { evaluation: '', actions: [], scope_kind: 'local', consistency_notes: '' };
    }

    const decodePlanText = (text: string): string =>
        text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity) =>
            decodeXmlEntities(entity)
        );
    const readPlanTag = (text: string, tag: string): string =>
        decodePlanText(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text || '')?.[1]?.trim() || '');

    const cleanText = planText.replace(/<!--[\s\S]*?-->/g, '');
    const planHeader = cleanText.replace(/<actions>[\s\S]*?<\/actions>/gi, '');
    const scope_kind =
        extractTag(planHeader, 'scope_kind').toLowerCase() === 'arc' ? 'arc' : 'local';
    const consistency_notes = readPlanTag(planHeader, 'consistency_notes');

    const actionBlocks: string[] = [];
    let actionDepth = 0;
    let actionStart = 0;
    for (const match of cleanText.matchAll(/<\/?action>/gi)) {
        if (match[0][1] !== '/') {
            if (actionDepth++ === 0) actionStart = (match.index ?? 0) + match[0].length;
        } else if (actionDepth > 0 && --actionDepth === 0) {
            actionBlocks.push(cleanText.slice(actionStart, match.index ?? 0));
        }
    }

    if (actionBlocks.length > 0) {
        const evaluation = readPlanTag(planHeader, 'evaluation');
        const actions: DirectiveActionItem[] = actionBlocks.map((block) => {
            const actionType = (extractTag(block, 'action_type') || '').trim();
            const details: DirectiveActionDetails = {};
            const rawTag = (text: string | null | undefined, tag: string): string | null =>
                new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text || '')?.[1] ?? null;
            const detBlock = rawTag(block, 'details');
            const lineEditsBlock = rawTag(detBlock, 'line_edits') ?? rawTag(block, 'line_edits') ?? '';

            const getField = (tag: string, literal = false): string => {
                const withoutList = (text: string | null | undefined): string =>
                    (text || '').replace(/<line_edits>[\s\S]*?<\/line_edits>/gi, '');
                const val =
                    rawTag(withoutList(detBlock), tag) ?? rawTag(withoutList(block), tag) ?? '';
                return decodePlanText(literal ? val : val.trim());
            };

            const setIfPresent = (field: string, aliasTag: string | null = null): void => {
                const primaryVal = getField(field);
                const aliasVal = aliasTag ? getField(aliasTag) : '';
                const hasPrimary = rawTag(detBlock, field) !== null || primaryVal !== '';
                const hasAlias = Boolean(
                    aliasTag && (rawTag(detBlock, aliasTag) !== null || aliasVal !== '')
                );
                if (hasPrimary) details[field] = primaryVal;
                else if (hasAlias) details[field] = aliasVal;
            };

            setIfPresent('title');
            setIfPresent('objective', 'goal');
            setIfPresent('description');
            const modeVal = getField('dominant_narrative_mode') || getField('mode_override');
            if (
                modeVal !== '' ||
                rawTag(detBlock, 'dominant_narrative_mode') !== null ||
                rawTag(detBlock, 'mode_override') !== null
            ) {
                details.dominant_narrative_mode = modeVal;
                details.mode_override = modeVal;
            }
            setIfPresent('scene_type');
            setIfPresent('cast_names', 'characters_present');
            setIfPresent('act_mandate', 'mandate');
            setIfPresent('core_tension');
            setIfPresent('thematic_reversal');
            setIfPresent('world_building_developments');
            setIfPresent('sequence_function', 'function');
            setIfPresent('dramatic_question');
            setIfPresent('starting_state', 'entry_anchor');
            setIfPresent('sequence_objective');
            setIfPresent('four_corner_movement');
            setIfPresent('threads_advanced');
            setIfPresent('characters_in_focus');
            setIfPresent('sequence_climax');
            setIfPresent('ending_hook');
            setIfPresent('next_sequence_boundary_guard', 'boundary_guard');

            // Scene Blueprint & Sandbox fields
            [
                'pov_character',
                'setting',
                'scene_events',
                'atmospheric_overview',
                'modality_hand',
                'surface_activity',
                'main_character_heart',
                'other_character_heart',
                'the_hinge_moment',
                'value_shift',
                'exit_hook',
                'transition_jump',
                'entrance_conditions',
                'exit_conditions',
                'epistemic_friction_level',
                'activation_contexts',
                'plot_commitments'
            ].forEach((field) => setIfPresent(field));

            // Persisted Future Mandate fields
            ['target_scope', 'mandate_label', 'mandate_text'].forEach((field) =>
                setIfPresent(field)
            );

            // Prose edit fields
            details.instructions = getField('instructions');
            details.find_text = getField('find_text', true) || getField('find', true);
            details.replace_text = getField('replace_text', true) || getField('replace', true);
            details.line_edits = Array.from(
                lineEditsBlock.matchAll(/<edit>([\s\S]*?)<\/edit>/gi),
                (match) => ({
                    find: decodePlanText(rawTag(match[1], 'find') ?? ''),
                    replace: decodePlanText(rawTag(match[1], 'replace') ?? '')
                })
            );

            // Story, Arc, Thread, Secret & Style fields
            [
                'concept',
                'heart_of_the_dilemma',
                'status_quo',
                'inciting_incident',
                'themes',
                'core_thematic_argument',
                'starting_value_state',
                'ending_value_state',
                'major_surprises_and_twists',
                'author_note',
                'genre',
                'mood',
                'writing_guide',
                'synthesized_authorial_persona',
                'genre_pacing_and_dialogue_rules',
                'strict_anti_patterns',
                'thread_id',
                'char_id',
                'lie_believed',
                'truth_needed',
                'arc_catalyst',
                'web_pressure',
                'secret_id',
                'truth',
                'public_cover_story',
                'known_by',
                'concealed_from',
                'reveal_target_act',
                'reveal_target_sequence'
            ].forEach((field) => setIfPresent(field));

            // Character fields (including Truby Four-Corner fields)
            [
                'name',
                'role',
                'corner_role',
                'core_flaw',
                'core_desire',
                'vocal_cadence',
                'deep_profile',
                'aliases',
                'why_it_makes_sense',
                'what_it_costs_them',
                'way_of_living',
                'why_it_is_appealing',
                'shared_outlook',
                'the_hidden_trap',
                'how_they_ended_up',
                'human_sympathy',
                'the_wake_up_call'
            ].forEach((field) => setIfPresent(field));

            // Relationship, Lore, Continuity & Epistemic fields
            [
                'relationship_key',
                'from_name',
                'to_name',
                'current',
                'hidden_tension',
                'trust_level',
                'topic',
                'detail',
                'category',
                'entity_name',
                'to_idx',
                'parent_act',
                'id',
                'claim_text',
                'subject_id',
                'predicate',
                'object_id',
                'objective_truth',
                'world_valid_from',
                'world_valid_to',
                'proposition_id',
                'holder_id',
                'target_scene',
                'scene_coord',
                'stance',
                'confidence',
                'source_type',
                'told_by'
            ].forEach((field) => setIfPresent(field));

            if (actionType === 'ADD_CONTINUITY_FACT') {
                const factDetails = (detBlock || '').replace(
                    /<line_edits>[\s\S]*?<\/line_edits>/gi,
                    ''
                );
                details.key = decodePlanText((rawTag(factDetails, 'key') || '').trim());
                details.value = decodePlanText((rawTag(factDetails, 'value') || '').trim());
            }
            if (actionType === 'MOVE_SCENE') {
                const toSequence = getField('to_sequence_idx');
                if (toSequence !== '') details.to_sequence_idx = toSequence;
                ['to_sequence_idx', 'target_sequence_idx', 'target_seq_idx'].forEach((field) => {
                    const value = rawTag(detBlock, field);
                    if (value !== null) details[field] = value.trim();
                });
            }

            const insertAt = getField('insert_at_idx');
            if (insertAt !== '') {
                details.insert_at_idx = parseInt(insertAt, 10);
            }

            const targetActStr = extractTag(block, 'target_act_idx');
            const targetSeqStr =
                extractTag(block, 'target_sequence_idx') || extractTag(block, 'target_seq_idx');
            const targetSceneStr = extractTag(block, 'target_scene_idx');
            const targetCharStr = readPlanTag(block, 'target_character_id');

            const seqIdx =
                targetSeqStr !== null && targetSeqStr !== '' ? parseInt(targetSeqStr, 10) : 0;

            return {
                action_type: actionType,
                allow_protected: false,
                allow_large_change:
                    (extractTag(block, 'allow_large_change') || '').trim().toLowerCase() === 'true',
                target_act_idx:
                    targetActStr !== null && targetActStr !== '' ? parseInt(targetActStr, 10) : 0,
                target_sequence_idx: seqIdx,
                target_seq_idx: seqIdx,
                target_scene_idx:
                    targetSceneStr !== null && targetSceneStr !== ''
                        ? parseInt(targetSceneStr, 10)
                        : null,
                target_character_id: targetCharStr !== null ? targetCharStr : null,
                description: readPlanTag(
                    block.replace(/<details>[\s\S]*?<\/details>/gi, ''),
                    'description'
                ),
                details
            };
        });
        return { evaluation, actions, scope_kind, consistency_notes };
    }

    return {
        evaluation: readPlanTag(planHeader, 'evaluation'),
        actions: [],
        scope_kind,
        consistency_notes
    };
}

/** Counts prose words stored across sequence scenes and `story.prose`. */
export function countStoryWords(
    st:
        | {
              sequences?: Array<{
                  sequence_number?: number | string;
                  number?: number | string;
                  scenes?: Array<{ scene_number?: number | string; number?: number | string; prose?: unknown }>;
              }>;
              prose?: Record<string, unknown>;
          }
        | null
        | undefined
): number {
    if (!st || !st.sequences) return 0;
    let total = 0;
    st.sequences.forEach((seq) => {
        (seq.scenes || []).forEach((sc) => {
            const prose =
                sc.prose ||
                (st.prose &&
                    st.prose[`${seq.sequence_number || seq.number}-${sc.scene_number || sc.number}`]);
            if (typeof prose === 'string' && prose.trim()) {
                total += prose.trim().split(/\s+/).length;
            }
        });
    });
    return total;
}
