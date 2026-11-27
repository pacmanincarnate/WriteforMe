/**
 * @module pipeline/directiveReview
 * Directive prose critique XML schema, review prompt builder, and verdict parser.
 */

import {
    formatActiveActAndSequenceXml,
    resolveNarrativeActForSequence,
    resolveNarrativeSequenceForIndex
} from '@/config';
import {
    formatContinuityLedgerForPrompt,
    getSequenceScenesList,
    type ContinuityStoryState
} from '@/domain/continuity';
import {
    actForSequence,
    getSceneActiveCast,
    type ActiveCastMember
} from '@/domain/story';
import {
    extractReviewStatus,
    parseIssuesFromReview,
    type ReviewIssueItem
} from '@/domain/validation';
import type { SceneBlueprint, Sequence } from '@/types';

export const DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA = `<output_format_description>
FORMATTING DIRECTIVE: Return your evaluation strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

CRITICAL AUDIT DIRECTIVE: Compare <generated_prose> against <scene_blueprint> (especially scene_events, objective, surface_activity, main_character_heart, other_character_heart, the_hinge_moment, value_shift, exit_hook, plot_commitments, pov_character, setting, and cast_names). Verify that every crucial plot event, wager, rule, turning point, and character commitment in the scene blueprint is realized with fidelity. If the prose softens, dilutes, contradicts, or omits a core scene blueprint commitment or turning point, mark <status>FAIL</status> with CRITICAL severity under category: CHOREOGRAPHY, quote the mismatch, and demand a fix.

Output Schema:
<response>
  <critique_analysis>Perform a focused analysis of Scene Blueprint fidelity (scene_events, hinge moment, value shift, plot commitments), epistemic boundaries, continuity, voice, and style. Be specific — quote exact passages.</critique_analysis>
  <issues>
    <issue>
      <severity>CRITICAL</severity> <!-- CRITICAL | MAJOR | MINOR -->
      <category>CHOREOGRAPHY</category> <!-- CHOREOGRAPHY | CONTINUITY | EPISTEMIC | VOICE | STYLE -->
      <description>Clear explanation of the problem (e.g. 'Scene blueprint specified X in scene_events/hinge_moment, but prose changed it to Y').</description>
      <location>Quote of the offending text passage.</location>
      <fix_suggestion>How to restore the exact scene blueprint premise/commitments in the prose.</fix_suggestion>
    </issue>
  </issues>
  <status>PASS</status> <!-- or FAIL -->
  <deviation_reasons>
    <reason>List each critical or major issue description briefly here.</reason>
  </deviation_reasons>
</response>
</output_format_description>`;

export const DIRECTIVE_REVIEW_OUTPUT_FORMAT = `${DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA}

BEGIN PROSE CRITIQUE REVIEW`;

export interface DirectiveReviewResult {
    status: 'PASS' | 'FAIL';
    issues: ReviewIssueItem[];
    critique: string;
    error?: boolean;
}

export interface DirectiveReviewStoryState extends ContinuityStoryState {
    sequences?: Sequence[];
    scenes?: Record<string, Array<SceneBlueprint & Record<string, unknown>>>;
    cast?: ActiveCastMember[];
    synthesized_authorial_persona?: string;
    genre_pacing_and_dialogue_rules?: string;
    strict_anti_patterns?: string;
    style?: {
        genre?: string;
        mood?: string;
        writing_guide?: string;
        synthesized_authorial_persona?: string;
        genre_pacing_and_dialogue_rules?: string;
        strict_anti_patterns?: string;
    };
}

/** Builds the XML critique prompt for a directive-edited or regenerated scene. */
export function buildDirectiveReviewContext(
    storyState: DirectiveReviewStoryState,
    seqIdx: number,
    sceneIdx: number
): string {
    const sId = `${seqIdx}-${sceneIdx}`;
    const scene = storyState.scenes?.[`${seqIdx}`]?.[sceneIdx];
    if (!scene) throw new Error(`Scene ${seqIdx + 1}.${sceneIdx + 1} no longer exists.`);
    const sequence = storyState.sequences?.[seqIdx];
    const blueprintFields = [
        'title',
        'pov_character',
        'setting',
        'dominant_narrative_mode',
        'scene_type',
        'objective',
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
        'plot_commitments',
        'cast_names',
        'description'
    ];
    const blueprint = Object.fromEntries(
        blueprintFields.map((key) => [
            key,
            scene[key] !== undefined
                ? scene[key]
                : key === 'cast_names' || key === 'modality_hand'
                  ? []
                  : ''
        ])
    );
    const profiles = getSceneActiveCast(scene, storyState.cast || []).map((ch) =>
        Object.fromEntries(
            ['name', 'role', 'corner_role', 'core_flaw', 'core_desire', 'vocal_cadence'].map(
                (key) => [key, (ch as Record<string, unknown>)[key] || '']
            )
        )
    );
    const persona =
        storyState.synthesized_authorial_persona ||
        storyState.style?.synthesized_authorial_persona ||
        '';
    const genreRules =
        storyState.genre_pacing_and_dialogue_rules ||
        storyState.style?.genre_pacing_and_dialogue_rules ||
        '';
    const antiPatterns =
        storyState.strict_anti_patterns || storyState.style?.strict_anti_patterns || '';
    const pillars = `${persona ? `<synthesized_authorial_persona>\n${persona}\n</synthesized_authorial_persona>\n\n` : ''}${genreRules ? `<genre_pacing_and_dialogue_rules>\n${genreRules}\n</genre_pacing_and_dialogue_rules>\n\n` : ''}${antiPatterns ? `<strict_anti_patterns>\n${antiPatterns}\n</strict_anti_patterns>\n\n` : ''}`;

    const rawProseEntry = storyState.prose?.[sId];
    const generatedProse =
        typeof rawProseEntry === 'string' ? rawProseEntry : rawProseEntry?.final || '';
    const sequencesList = (storyState.sequences || []) as Array<Record<string, unknown>>;
    const seqScenes = getSequenceScenesList(storyState as Record<string, unknown>, seqIdx);
    const actDef = resolveNarrativeActForSequence(
        seqIdx,
        sequencesList,
        sequence as Record<string, unknown> | undefined
    );
    const seqDef = resolveNarrativeSequenceForIndex(
        seqIdx,
        sequencesList,
        sequence as Record<string, unknown> | undefined
    );
    const actAndSeqXml = formatActiveActAndSequenceXml(
        actDef,
        seqDef,
        seqScenes.length > 0 ? { sceneIndex: sceneIdx, totalScenes: seqScenes.length } : undefined
    );

    return `${pillars}${DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA}

<continuity_ledger>
${formatContinuityLedgerForPrompt(storyState, {
    sequence: seqIdx + 1,
    scene: sceneIdx + 1,
    act: sequence?.parent_act || actForSequence(seqIdx + 1),
    sceneObj: scene,
    activeCast: profiles as unknown as ActiveCastMember[]
})}
</continuity_ledger>
<active_characters_profiles>
${JSON.stringify(profiles, null, 2)}
</active_characters_profiles>
<scene_blueprint>
${JSON.stringify(blueprint, null, 2)}
</scene_blueprint>
${actAndSeqXml}
<generated_prose>
${generatedProse}
</generated_prose>

BEGIN PROSE CRITIQUE REVIEW`;
}

/** Parses reviewer XML output and fails strictly when `<status>` is invalid or omitted. */
export function parseDirectiveReview(output: string): DirectiveReviewResult {
    const parsed = extractReviewStatus(output);
    const issues = parseIssuesFromReview(output);
    if (!parsed.isValid) throw new Error('Reviewer returned no valid PASS/FAIL evaluation.');
    return {
        status: parsed.status === 'PASS' && !issues.length ? 'PASS' : 'FAIL',
        issues,
        critique: parsed.critique || ''
    };
}

/** Constructs a standardized FAIL review payload when verification throws unexpectedly. */
export function directiveReviewFailure(err: unknown): DirectiveReviewResult {
    const message = err instanceof Error ? err.message : String(err);
    const fixSuggestion = 'Resolve the review error and verify the scene again.';
    return {
        status: 'FAIL',
        critique: message,
        issues: [
            {
                severity: 'CRITICAL',
                category: 'CONTINUITY',
                description: `Verification could not complete: ${message}`,
                location: '',
                fixSuggestion,
                fix_suggestion: fixSuggestion
            }
        ],
        error: true
    };
}
