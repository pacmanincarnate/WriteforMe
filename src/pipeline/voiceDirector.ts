/**
 * @module pipeline/voiceDirector
 * Audio Drama Voice Director surgical expressiveness enhancer (Phase 4C)
 * and manual per-scene voice direction handler.
 */

import {
    analyzeAudioDramaExpressiveness,
    getVoiceDescriptionForCharacter,
    normalizeAudioDramaScript,
    type AudioDramaExpressivenessReport,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import { applyVoiceDirectorSurgicalEdits } from '@/domain/editing';
import {
    buildRelationshipFrictionBlock,
    getSceneActiveCast,
    parseValueShiftInput,
    type ActiveCastMember
} from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type { CastMember, SceneBlueprint } from '@/types';
import { escapeXml } from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';

export interface VoiceDirectorPassParams {
    proseText?: string;
    scene?: Record<string, unknown>;
    storyObj?: PipelineStory | null;
    activeCast?: Array<ActiveCastMember & Record<string, unknown>>;
    sequenceData?: Record<string, unknown>;
    s?: number;
    seq?: number;
    force?: boolean;
    onEnhanceStart?: ((audit: AudioDramaExpressivenessReport) => void) | null;
}

export interface VoiceDirectorPassResult {
    prose: string | undefined;
    status: 'SKIPPED_TOO_SHORT' | 'SKIPPED_SUFFICIENT' | 'ENHANCED' | 'NO_IMPROVEMENT';
    beforeAudit: AudioDramaExpressivenessReport | null;
    afterAudit: AudioDramaExpressivenessReport | null;
    appliedCount: number;
    rejectedCount: number;
    failedCount: number;
    summary?: string;
}

/** Evaluates Audio Drama script expressiveness and surgically enriches dialogue vocal cues. */
export async function runAudioDramaVoiceDirectorPass(
    ctx: PipelineRuntimeContext,
    {
        proseText,
        scene = {},
        storyObj = null,
        activeCast = [],
        sequenceData = {},
        s = 0,
        seq = 0,
        force = false,
        onEnhanceStart = null
    }: VoiceDirectorPassParams = {}
): Promise<VoiceDirectorPassResult> {
    const sourceText = String(proseText || '');
    if (sourceText.trim().length < 80) {
        return {
            prose: proseText,
            status: 'SKIPPED_TOO_SHORT',
            beforeAudit: null,
            afterAudit: null,
            appliedCount: 0,
            rejectedCount: 0,
            failedCount: 0
        };
    }

    const beforeAudit = analyzeAudioDramaExpressiveness(sourceText);
    if (!force && !beforeAudit.needsDirectionPass) {
        return {
            prose: proseText,
            status: 'SKIPPED_SUFFICIENT',
            beforeAudit,
            afterAudit: beforeAudit,
            appliedCount: 0,
            rejectedCount: 0,
            failedCount: 0
        };
    }

    if (typeof onEnhanceStart === 'function') {
        onEnhanceStart(beforeAudit);
    }

    const liveStory = storyObj || ctx.getStory() || {};
    const castList =
        Array.isArray(activeCast) && activeCast.length > 0
            ? activeCast
            : (getSceneActiveCast(
                  scene as SceneBlueprint & Record<string, unknown>,
                  asArray<ActiveCastMember>(liveStory.cast)
              ) as Array<ActiveCastMember & Record<string, unknown>>);
    const charCast = castList.filter((c) => c && c.name && c.name.toLowerCase() !== 'narrator');
    const castLines = charCast
        .map((ch) => {
            const details = asRecord(ch.details);
            const flaw = asString(ch.core_flaw) || asString(details.history) || 'Guarded';
            const desire = asString(ch.core_desire) || asString(details.goals) || 'Unspecified';
            const cadence =
                getVoiceDescriptionForCharacter(
                    ch as VoiceCastMember,
                    liveStory as AudioStoryLike
                ) ||
                asString(ch.vocal_cadence) ||
                'Natural conversational cadence';
            return `<character name="${escapeXml(ch.name)}">
  <psychological_wound>${escapeXml(flaw)}</psychological_wound>
  <core_yearning>${escapeXml(desire)}</core_yearning>
  <vocal_cadence>${escapeXml(cadence)}</vocal_cadence>
</character>`;
        })
        .join('\n');

    const relMatrix =
        buildRelationshipFrictionBlock(
            charCast as unknown as CastMember[],
            asRecord(liveStory.relationships) as Record<string, Record<string, unknown>>
        ) || 'No recorded relationship friction matrix.';

    const parsedVs = parseValueShiftInput(scene.value_shift);
    const vsStart = asString(scene.start_valence) || parsedVs.start_state || 'Start';
    const vsEnd = asString(scene.end_valence) || parsedVs.end_state || 'End';
    const sceneLabel =
        asString(scene.number) || `${asString(sequenceData?.number) || seq + 1}.${s + 1}`;

    const directorBasePrompt = `<scene_emotional_context>
Scene: ${escapeXml(sceneLabel)} — ${escapeXml(asString(scene.title) || 'Scene')}
Setting / Room Acoustics: ${escapeXml(asString(scene.setting || scene.setting_anchor || scene.environment) || 'Unspecified')}
Objective: ${escapeXml(asString(scene.objective || scene.goal) || 'Dramatize the encounter')}
Value Shift: ${escapeXml(vsStart)} -> ${escapeXml(vsEnd)}
${scene.the_hinge_moment ? `Hinge Moment: ${escapeXml(asString(scene.the_hinge_moment))}\n` : ''}${scene.main_character_heart ? `Main Character Heart (Subtext / Defense): ${escapeXml(asString(scene.main_character_heart))}\n` : ''}${scene.other_character_heart ? `Counterpart Heart (What They Hide/Offer): ${escapeXml(asString(scene.other_character_heart))}\n` : ''}${scene.character_voice_directives ? `Voice Directives: ${escapeXml(asString(scene.character_voice_directives))}\n` : ''}</scene_emotional_context>

<cast_dynamics>
${castLines || '<character name="Cast">No detailed character profiles provided.</character>'}
<relationship_friction_matrix>
${escapeXml(relMatrix)}
</relationship_friction_matrix>
</cast_dynamics>

<expressiveness_audit>
${escapeXml(beforeAudit.auditBlock)}
</expressiveness_audit>

<original_text>
${sourceText}
</original_text>

Apply surgical <edits> upgrading expressive Drama-3 vocal delivery on character lines while preserving every spoken word verbatim and leaving all Narrator lines untouched.`;

    const rawDirectorOutput = await ctx.callAI(
        directorBasePrompt,
        PROMPTS.audioDramaVoiceDirectorSurgical,
        false,
        'Voice Director Surgical Editor (Drama-3)',
        'prose'
    );

    let editReport = applyVoiceDirectorSurgicalEdits(sourceText, rawDirectorOutput);

    if (
        editReport.applied.length === 0 &&
        (editReport.failed.length > 0 || editReport.rejected.length > 0)
    ) {
        const failSummary = [
            ...editReport.failed.map(
                (f) =>
                    `- Anchor/parse issue (${f.type}): ${f.reason} on "${String(f.needle || '').slice(0, 60)}"`
            ),
            ...editReport.rejected.map(
                (r) =>
                    `- Guard rejected (${r.type}): ${r.reason} on "${String(r.needle || '').slice(0, 60)}"`
            )
        ].join('\n');

        const retryPrompt = `${directorBasePrompt}

<previous_attempt_diagnostics>
Zero edits applied cleanly on the first attempt due to strict safety invariants:
${failSummary}
CRITICAL FIX FOR RETRY: Quote <original> / <search> verbatim from <original_text>, target ONLY character dialogue lines (NEVER Narrator: lines), keep EVERY spoken word 100% identical in order, and put ZERO physical actions or props inside [...].
</previous_attempt_diagnostics>`;

        const retryOutput = await ctx.callAI(
            retryPrompt,
            PROMPTS.audioDramaVoiceDirectorSurgical,
            false,
            'Voice Director Surgical Editor Retry (Drama-3)',
            'prose'
        );
        const retryReport = applyVoiceDirectorSurgicalEdits(sourceText, retryOutput);
        if (retryReport.applied.length > 0) {
            editReport = retryReport;
        }
    }

    let directedText = editReport.text;
    if (editReport.applied.length > 0) {
        directedText = normalizeAudioDramaScript(directedText);
    }

    const afterAudit = analyzeAudioDramaExpressiveness(directedText);
    const accepted =
        editReport.applied.length > 0 && (afterAudit.score >= beforeAudit.score || force);

    return {
        prose: accepted ? directedText : proseText,
        status: accepted ? 'ENHANCED' : 'NO_IMPROVEMENT',
        beforeAudit,
        afterAudit: accepted ? afterAudit : beforeAudit,
        appliedCount: editReport.applied.length,
        rejectedCount: editReport.rejected.length,
        failedCount: editReport.failed.length,
        summary: editReport.summary
    };
}

/** Manual trigger for Voice Director expressiveness upgrade on an existing audio drama scene. */
export async function handleDirectSceneVoices(
    ctx: PipelineRuntimeContext,
    seqIdx?: number | null,
    sceneIdx?: number | null
): Promise<void> {
    if (ctx.getIsDirectingVoices?.() || ctx.getLoading?.()) return;
    const selectedSeq = ctx.getSelectedSequence?.() ?? 0;
    const selectedSc = ctx.getSelectedScene?.() ?? 0;
    const seq = seqIdx !== undefined && seqIdx !== null ? Number(seqIdx) : Number(selectedSeq || 0);
    const s =
        sceneIdx !== undefined && sceneIdx !== null ? Number(sceneIdx) : Number(selectedSc || 0);
    const liveStory = ctx.getStory();
    if (!liveStory || asString(liveStory.writing_mode) !== 'audio_drama') return;

    const sId = `${seq}-${s}`;
    const proseMap = asRecord(liveStory.prose);
    const existingEntry = proseMap[sId] || proseMap[`${sId}-0`];
    const existingRec = asOptionalRecord(existingEntry);
    const scriptText =
        typeof existingEntry === 'string'
            ? existingEntry
            : asString(existingRec?.final || existingRec?.prose || existingRec?.draft);
    if (!scriptText || scriptText.trim().length < 80) {
        ctx.showToast(
            'Draft the audio drama scene script first before directing voices.',
            'info'
        );
        return;
    }

    const scenesMap = asRecord(liveStory.scenes);
    const scenesList = asArray<Record<string, unknown>>(
        scenesMap[`${seq}`] || scenesMap[`${seq}-0`] || scenesMap[`0-${seq}`]
    );
    const sceneItem = asRecord(scenesList[s]);
    const sequenceData = asRecord(asArray(liveStory.sequences)[seq]);
    const activeCast = getSceneActiveCast(
        sceneItem as SceneBlueprint & Record<string, unknown>,
        asArray<ActiveCastMember>(liveStory.cast)
    ) as Array<ActiveCastMember & Record<string, unknown>>;

    ctx.setIsDirectingVoices?.(true);
    ctx.setLoadingStep(
        `Voice Director: Enhancing Drama-3 delivery for Sequence ${seq + 1}, Scene ${s + 1}...`
    );
    try {
        const dirRes = await runAudioDramaVoiceDirectorPass(ctx, {
            proseText: scriptText,
            scene: sceneItem,
            storyObj: liveStory,
            activeCast,
            sequenceData,
            s,
            seq,
            force: true
        });
        if (dirRes && dirRes.appliedCount > 0 && dirRes.prose && dirRes.prose !== scriptText) {
            const nextProseText = dirRes.prose;
            const updatedStory = ctx.setStory((prev) => {
                const prevProseMap = asRecord(prev.prose);
                const prevProse = asOptionalRecord(prevProseMap[sId]);
                const nextEntry = prevProse
                    ? { ...prevProse, final: nextProseText }
                    : { final: nextProseText };
                return {
                    ...prev,
                    prose: {
                        ...prevProseMap,
                        [sId]: nextEntry
                    }
                };
            });
            const updatedId = asString(updatedStory?.id);
            if (updatedId) {
                try {
                    await storyStore.saveStory(updatedId, updatedStory);
                } catch (saveErr) {
                    console.warn('[Direct Voices] Failed saving updated script:', saveErr);
                }
            }
            ctx.showToast(
                `Directed ${dirRes.appliedCount} character turn(s) — Score ${dirRes.beforeAudit?.score ?? '?'} -> ${dirRes.afterAudit?.score ?? '?'}`,
                'success'
            );
        } else {
            ctx.showToast(
                `Voice Director made no changes (Score ${dirRes?.beforeAudit?.score ?? '?'}/100${dirRes?.rejectedCount ? `, ${dirRes.rejectedCount} rejected` : ''}).`,
                'info'
            );
        }
    } catch (err) {
        console.error('[Direct Voices] Failed:', err);
        ctx.showToast(`Voice direction pass failed: ${extractErrorMessage(err)}`, 'error');
    } finally {
        ctx.setIsDirectingVoices?.(false);
    }
}
