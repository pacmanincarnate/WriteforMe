/**
 * @module pipeline/storySoFar
 * Telescoping Pyramid "Story So Far" compression orchestrator:
 * - Backfills missing causal scene deltas from drafted scenes / event log
 * - Compresses completed sequences via Sequence Compressor Agent (`PROMPTS.sequenceCompressorAgent`)
 * - Compresses completed acts via Act Compressor Agent (`PROMPTS.actCompressorAgent`)
 * - Synchronizes `story_memory` and renders compact `story.story_so_far`
 */

import {
    buildFallbackSceneDelta,
    ensureStoryMemory,
    extractProseText,
    findCompletedUnsummarizedActs,
    findCompletedUnsummarizedSequences,
    renderStorySoFar,
    resolveSequenceParentAct,
    sanitizeScenePlotDelta,
    upsertSceneMemoryDelta
} from '@/domain/continuity';
import { formatSeriesThreadStatus } from '@/domain/series';
import { parseActNumber } from '@/domain/story';
import { PROMPTS } from '@/prompts';
import { storyStore } from '@/services/storage';
import type { Story, StoryMemory } from '@/types';
import { countWords, decodeXmlEntities, extractTag } from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { runAgentWithEscalation } from './escalation';

function getScenesListForSeq(story: PipelineStory, seqIdx: number): Record<string, unknown>[] {
    const scenesMap = asRecord(story?.scenes);
    const raw =
        scenesMap[`${seqIdx}`] ||
        scenesMap[`${seqIdx}-0`] ||
        scenesMap[`0-${seqIdx}`];
    return asArray<Record<string, unknown>>(raw);
}

function formatThreadsXml(story: PipelineStory): string {
    const threads = asArray<Record<string, unknown>>(story?.threads);
    if (threads.length === 0) return 'None explicitly defined.';
    return threads
        .map((t) => `- [${asString(t.id || t.thread_id) || 'T'}] ${asString(t.name)}: ${asString(t.description)}`)
        .join('\n');
}

/**
 * Ensures every scene with drafted prose in `story.prose` has a corresponding causal scene delta
 * inside `memory.scenes`. Preserves existing Archivist synopses and falls back to `event_log` or
 * deterministic blueprint summaries for legacy/unindexed scenes.
 */
export function backfillDraftedSceneDeltas(
    story: PipelineStory,
    memoryInput: unknown
): StoryMemory {
    let memory = ensureStoryMemory(memoryInput);
    const sequences = asArray<Record<string, unknown>>(story?.sequences);
    const proseMap = asRecord(story?.prose);
    const eventLog = asArray<Record<string, unknown>>(story?.event_log);
    const scenesMap = asRecord(story?.scenes);

    const seqIndices = new Set<number>();
    sequences.forEach((_, idx) => seqIndices.add(idx));
    Object.keys(scenesMap).forEach((k) => {
        const parsed = parseInt(k, 10);
        if (Number.isFinite(parsed) && parsed >= 0) seqIndices.add(parsed);
    });

    for (const seqIdx of Array.from(seqIndices).sort((a, b) => a - b)) {
        const seqObj = sequences[seqIdx];
        const parentAct = resolveSequenceParentAct(seqObj, seqIdx);
        const seqScenes = getScenesListForSeq(story, seqIdx);

        seqScenes.forEach((sc, sceneIdx) => {
            const key = `${seqIdx}-${sceneIdx}`;
            const proseEntry = proseMap[key] || proseMap[`${seqIdx}-0-${sceneIdx}`];
            const proseText = extractProseText(proseEntry);
            if (!proseText) return;
            if (memory.scenes[key]?.synopsis) return;

            const sceneNumber =
                asString(sc.number) || `${Number(seqObj?.number || seqIdx + 1)}.${sceneIdx + 1}`;
            const matchedEvent = eventLog.find(
                (ev) =>
                    asString(ev.scene_id) === sceneNumber ||
                    asString(ev.scene_id) === `Scene ${sceneNumber}` ||
                    (Number(ev.sequence) === Number(seqObj?.number || seqIdx + 1) &&
                        Number(ev.scene) === sceneIdx + 1)
            );
            const eventSummary = sanitizeScenePlotDelta(asString(matchedEvent?.summary));
            const synopsis =
                eventSummary.length >= 25
                    ? eventSummary
                    : buildFallbackSceneDelta(sc, seqIdx, sceneIdx, proseText);

            memory = {
                ...memory,
                scenes: {
                    ...memory.scenes,
                    [key]: {
                        key,
                        seqIdx,
                        sceneIdx,
                        sceneNumber,
                        title: asString(sc.title) || `Scene ${sceneNumber}`,
                        synopsis,
                        updatedAt: Date.now()
                    }
                }
            };
            // Ensure parentAct is referenced deterministically if needed later
            void parentAct;
        });
    }

    return memory;
}

/**
 * Compresses all drafted scene deltas of a completed sequence into a ~110–160 word narrative summary.
 */
export async function compressCompletedSequence(
    ctx: PipelineRuntimeContext,
    currentStory: PipelineStory,
    seqIdx: number,
    isAutopilot = false
): Promise<string | null> {
    const sequences = asArray<Record<string, unknown>>(currentStory?.sequences);
    const seqObj = sequences[seqIdx] || { number: seqIdx + 1 };
    const seqNumber = Number(seqObj.number) || seqIdx + 1;
    const seqTitle = asString(seqObj.title) || `Sequence ${seqNumber}`;
    const parentAct = resolveSequenceParentAct(seqObj, seqIdx);

    const memory = backfillDraftedSceneDeltas(currentStory, currentStory.story_memory);
    const seqScenes = getScenesListForSeq(currentStory, seqIdx);
    const sceneEventLines = seqScenes
        .map((sc, sIdx) => {
            const key = `${seqIdx}-${sIdx}`;
            const entry = memory.scenes[key];
            if (!entry?.synopsis) return null;
            return `- Scene ${entry.sceneNumber || `${seqNumber}.${sIdx + 1}`} (${entry.title || asString(sc.title)}): ${entry.synopsis}`;
        })
        .filter((line): line is string => Boolean(line));

    if (sceneEventLines.length === 0) return null;

    ctx.setLoadingStep?.(`Compressing Sequence ${seqNumber} summary...`);

    const threadsAdvanced = asArray(seqObj.threads_advanced)
        .map((t) => (typeof t === 'string' ? t : asString(asOptionalRecord(t)?.id || t)))
        .filter(Boolean)
        .join(', ');

    const promptBody = `
<concept>${asString(currentStory.concept)}</concept>

<narrative_threads>
${formatThreadsXml(currentStory)}
</narrative_threads>

<sequence_metadata>
- Sequence: ${seqNumber} (Parent Act: ${parentAct}) — "${seqTitle}"
- Structural Function: ${asString(seqObj.sequence_function || seqObj.function) || 'Dramatic Sequence'}
- Dramatic Question: ${asString(seqObj.dramatic_question || seqObj.tactical_question) || 'Unspecified'}
- Sequence Objective: ${asString(seqObj.sequence_objective || seqObj.description) || 'Unspecified'}
- Threads Advanced: ${threadsAdvanced || 'See narrative threads'}
- Planned Ending Hook: ${asString(seqObj.ending_hook || seqObj.sequence_climax) || 'Direct continuation'}
</sequence_metadata>

<sequence_scene_events>
${sceneEventLines.join('\n')}
</sequence_scene_events>
${formatSeriesThreadStatus(currentStory as Partial<Story>).trimEnd()}

<output_format_description>
FORMATTING DIRECTIVE: Return strictly as XML tags. Do not use markdown code blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <compressed_sequence_summary>A concise 110-160 word narrative summary synthesizing how this sequence's dramatic question, active plot threads, and character dynamics progressed across its drafted scenes and propelled the story into the next sequence.</compressed_sequence_summary>
</response>
</output_format_description>
`;

    try {
        const res = await runAgentWithEscalation<{ summary: string }>(ctx, {
            tierName: 'Sequence Compressor Agent',
            isAutopilot,
            generatorPromptFn: () => promptBody,
            systemPrompt: PROMPTS.sequenceCompressorAgent,
            parserFn: (raw) => {
                if (!raw) return { summary: '' };
                const rawStr = String(raw);
                const tagged =
                    extractTag(rawStr, 'compressed_sequence_summary') ||
                    extractTag(rawStr, 'compressed_summary') ||
                    extractTag(rawStr, 'story_so_far');
                const cleaned = sanitizeScenePlotDelta(
                    decodeXmlEntities(tagged || rawStr)
                );
                return { summary: cleaned };
            },
            validateFn: (data) => {
                if (!data.summary || data.summary.length < 25) {
                    return {
                        valid: false,
                        errors: ['Compressed sequence summary is too short or missing.']
                    };
                }
                if (countWords(data.summary) > 350) {
                    return {
                        valid: false,
                        errors: ['Compressed sequence summary exceeded 350-word ceiling; tighten to 110-160 words.']
                    };
                }
                return { valid: true };
            },
            modelSize: 'review',
            spawningContext: `Sequence ${seqNumber} Compression`
        });

        return res?.parsedData?.summary || null;
    } catch (err) {
        console.warn(`[compressCompletedSequence] Failed compressing Sequence ${seqNumber}:`, err);
        return null;
    }
}

/**
 * Compresses all sequence summaries of a completed Act into a ~180–250 word macro-act summary.
 */
export async function compressCompletedAct(
    ctx: PipelineRuntimeContext,
    currentStory: PipelineStory,
    actNumber: number,
    isAutopilot = false
): Promise<string | null> {
    const acts = asArray<Record<string, unknown>>(currentStory?.acts);
    const actObj =
        acts.find((a, idx) => parseActNumber(a?.number != null ? a.number : idx + 1, idx + 1) === actNumber) ||
        null;
    const actTitle = asString(actObj?.title) || `Act ${actNumber}`;
    const actMandate = asString(actObj?.act_mandate || actObj?.description) || 'Macro Act Progression';

    const memory = ensureStoryMemory(currentStory.story_memory);
    const sequences = asArray<Record<string, unknown>>(currentStory?.sequences);
    const actSeqSummaries: string[] = [];

    sequences.forEach((seq, seqIdx) => {
        if (resolveSequenceParentAct(seq, seqIdx) !== actNumber) return;
        const seqSummary = memory.sequences[String(seqIdx)];
        if (seqSummary?.summary) {
            const seqNum = Number(seq?.number) || seqSummary.seqNumber || seqIdx + 1;
            const seqTitle = asString(seq?.title) || seqSummary.title || `Sequence ${seqNum}`;
            actSeqSummaries.push(`[Sequence ${seqNum} — ${seqTitle}]:\n${seqSummary.summary}`);
        }
    });

    if (actSeqSummaries.length === 0) return null;

    ctx.setLoadingStep?.(`Act Compressor: Summarizing Act ${actNumber}...`);

    const promptBody = `
<concept>${asString(currentStory.concept)}</concept>

<core_thematic_argument>${asString(currentStory.core_thematic_argument)}</core_thematic_argument>

<act_mandate>
Act ${actNumber}: ${actTitle}
${actMandate}
</act_mandate>

<narrative_threads>
${formatThreadsXml(currentStory)}
</narrative_threads>

<completed_act_sequences>
${actSeqSummaries.join('\n\n')}
</completed_act_sequences>
${formatSeriesThreadStatus(currentStory as Partial<Story>).trimEnd()}

<output_format_description>
FORMATTING DIRECTIVE: Return strictly as XML tags. Do not use markdown code blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <compressed_summary>A concise 180-250 word act summary capturing major plot turns, A/B/C narrative thread progressions and intersections, character arc shifts, and unresolved dramatic tensions entering the next act.</compressed_summary>
</response>
</output_format_description>
`;

    try {
        const res = await runAgentWithEscalation<{ summary: string }>(ctx, {
            tierName: 'Act Compressor Agent',
            isAutopilot,
            generatorPromptFn: () => promptBody,
            systemPrompt: PROMPTS.actCompressorAgent,
            parserFn: (raw) => {
                if (!raw) return { summary: '' };
                const rawStr = String(raw);
                const tagged =
                    extractTag(rawStr, 'compressed_summary') ||
                    extractTag(rawStr, 'story_so_far');
                const cleaned = sanitizeScenePlotDelta(
                    decodeXmlEntities(tagged || rawStr)
                );
                return { summary: cleaned };
            },
            validateFn: (data) => {
                if (!data.summary || data.summary.length < 25) {
                    return {
                        valid: false,
                        errors: ['Act compressed summary is too short or missing.']
                    };
                }
                if (countWords(data.summary) > 450) {
                    return {
                        valid: false,
                        errors: ['Act compressed summary exceeded 450-word ceiling; tighten to 180-250 words.']
                    };
                }
                return { valid: true };
            },
            modelSize: 'review',
            spawningContext: `Act ${actNumber} Compression`
        });

        return res?.parsedData?.summary || null;
    } catch (err) {
        console.warn(`[compressCompletedAct] Failed compressing Act ${actNumber}:`, err);
        return null;
    }
}

/**
 * Runs post-scene telescoping synchronization:
 * 1. Ensures the just-drafted scene (and any unindexed prior drafted scenes) has a delta in `story_memory`.
 * 2. Compresses any completed sequences missing a sequence summary.
 * 3. Compresses any completed acts whose sequences are all summarized.
 * 4. Renders `story.story_so_far` and commits both fields via `ctx.setStory`.
 */
export async function syncStorySoFarAfterScene(
    ctx: PipelineRuntimeContext,
    currentStory: PipelineStory,
    seqIdx: number,
    sceneIdx: number,
    options: { isAutopilot?: boolean; sceneSynopsis?: string } = {}
): Promise<PipelineStory> {
    const isAutopilot = Boolean(options.isAutopilot);
    let workingStory: PipelineStory = { ...currentStory };
    let memory = ensureStoryMemory(workingStory.story_memory);

    const sequences = asArray<Record<string, unknown>>(workingStory.sequences);
    const seqObj = sequences[seqIdx];
    const seqScenes = getScenesListForSeq(workingStory, seqIdx);
    const sceneObj = asRecord(seqScenes[sceneIdx] || {});
    const proseMap = asRecord(workingStory.prose);
    const key = `${seqIdx}-${sceneIdx}`;
    const proseText = extractProseText(proseMap[key] || proseMap[`${seqIdx}-0-${sceneIdx}`]);

    if (proseText) {
        const providedSynopsis = sanitizeScenePlotDelta(asString(options.sceneSynopsis));
        const existingSynopsis = memory.scenes[key]?.synopsis;
        const effectiveSynopsis =
            providedSynopsis.length >= 15
                ? providedSynopsis
                : existingSynopsis || buildFallbackSceneDelta(sceneObj, seqIdx, sceneIdx, proseText);

        memory = upsertSceneMemoryDelta(memory, {
            key,
            seqIdx,
            sceneIdx,
            sceneNumber:
                asString(sceneObj.number) ||
                `${Number(seqObj?.number || seqIdx + 1)}.${sceneIdx + 1}`,
            title: asString(sceneObj.title) || `Scene ${seqIdx + 1}.${sceneIdx + 1}`,
            synopsis: effectiveSynopsis,
            parentAct: resolveSequenceParentAct(seqObj, seqIdx),
            totalScenesInSeq: seqScenes.length
        });
    }

    memory = backfillDraftedSceneDeltas(workingStory, memory);
    workingStory = { ...workingStory, story_memory: memory };

    const pendingSeqs = findCompletedUnsummarizedSequences(workingStory, memory);
    for (const doneSeqIdx of pendingSeqs) {
        const doneSeqObj = sequences[doneSeqIdx];
        const doneSeqNum = Number(doneSeqObj?.number) || doneSeqIdx + 1;
        const doneParentAct = resolveSequenceParentAct(doneSeqObj, doneSeqIdx);
        const doneScenes = getScenesListForSeq(workingStory, doneSeqIdx);
        const summary = await compressCompletedSequence(ctx, workingStory, doneSeqIdx, isAutopilot);
        if (summary) {
            memory = {
                ...memory,
                sequences: {
                    ...memory.sequences,
                    [String(doneSeqIdx)]: {
                        seqIdx: doneSeqIdx,
                        seqNumber: doneSeqNum,
                        parentAct: doneParentAct,
                        title: asString(doneSeqObj?.title) || `Sequence ${doneSeqNum}`,
                        summary,
                        sceneCount: doneScenes.length,
                        updatedAt: Date.now()
                    }
                }
            };
            if (memory.manualBaseText) {
                delete memory.manualBaseText;
            }
            workingStory = { ...workingStory, story_memory: memory };
        }
    }

    const pendingActs = findCompletedUnsummarizedActs(workingStory, memory);
    const actsArr = asArray<Record<string, unknown>>(workingStory.acts);
    for (const doneActNum of pendingActs) {
        const actObj = actsArr.find(
            (a, idx) => parseActNumber(a?.number != null ? a.number : idx + 1, idx + 1) === doneActNum
        );
        const summary = await compressCompletedAct(ctx, workingStory, doneActNum, isAutopilot);
        if (summary) {
            memory = {
                ...memory,
                acts: {
                    ...memory.acts,
                    [String(doneActNum)]: {
                        actNumber: doneActNum,
                        title: asString(actObj?.title) || `Act ${doneActNum}`,
                        summary,
                        updatedAt: Date.now()
                    }
                }
            };
            workingStory = { ...workingStory, story_memory: memory };
        }
    }

    const renderedSoFar = renderStorySoFar(memory, workingStory);
    const committedStory = ctx.setStory((prev) => ({
        ...prev,
        story_memory: memory,
        story_so_far: renderedSoFar
    }));

    return {
        ...workingStory,
        ...committedStory,
        story_memory: memory,
        story_so_far: renderedSoFar
    };
}

/**
 * Rebuilds and compresses the entire `story_so_far` hierarchy from drafted scenes on demand
 * (for cleaning up existing in-progress novels with oversized tactical handoff logs).
 */
export async function rebuildStorySoFar(
    ctx: PipelineRuntimeContext,
    targetStory?: PipelineStory | null,
    isAutopilot = false
): Promise<PipelineStory> {
    const baseStory = targetStory || ctx.getStory();
    const beforeWords = countWords(asString(baseStory?.story_so_far));

    const proseMap = asRecord(baseStory?.prose);
    const hasDrafted = Object.values(proseMap).some((p) => Boolean(extractProseText(p)));
    if (!hasDrafted) {
        ctx.showToast?.('Draft at least one scene before compressing Story So Far.', 'info');
        return baseStory;
    }

    if (!isAutopilot) ctx.setLoading(true);
    ctx.setLoadingStep('Rebuilding & compressing Story So Far memory...');

    try {
        const existingMem = ensureStoryMemory(baseStory.story_memory);
        const freshBase: StoryMemory = {
            acts: {},
            sequences: {},
            scenes: existingMem.scenes,
            ...(existingMem.lastHandoffDossier
                ? { lastHandoffDossier: existingMem.lastHandoffDossier }
                : {})
        };
        let memory = backfillDraftedSceneDeltas(baseStory, freshBase);
        let workingStory: PipelineStory = { ...baseStory, story_memory: memory };

        const sequences = asArray<Record<string, unknown>>(workingStory.sequences);
        const actsArr = asArray<Record<string, unknown>>(workingStory.acts);

        const pendingSeqs = findCompletedUnsummarizedSequences(workingStory, memory);
        for (const seqIdx of pendingSeqs) {
            const seqObj = sequences[seqIdx];
            const seqNum = Number(seqObj?.number) || seqIdx + 1;
            const parentAct = resolveSequenceParentAct(seqObj, seqIdx);
            const seqScenes = getScenesListForSeq(workingStory, seqIdx);
            const summary = await compressCompletedSequence(ctx, workingStory, seqIdx, isAutopilot);
            if (summary) {
                memory = {
                    ...memory,
                    sequences: {
                        ...memory.sequences,
                        [String(seqIdx)]: {
                            seqIdx,
                            seqNumber: seqNum,
                            parentAct,
                            title: asString(seqObj?.title) || `Sequence ${seqNum}`,
                            summary,
                            sceneCount: seqScenes.length,
                            updatedAt: Date.now()
                        }
                    }
                };
                workingStory = { ...workingStory, story_memory: memory };
            }
        }

        const pendingActs = findCompletedUnsummarizedActs(workingStory, memory);
        for (const actNum of pendingActs) {
            const actObj = actsArr.find(
                (a, idx) => parseActNumber(a?.number != null ? a.number : idx + 1, idx + 1) === actNum
            );
            const summary = await compressCompletedAct(ctx, workingStory, actNum, isAutopilot);
            if (summary) {
                memory = {
                    ...memory,
                    acts: {
                        ...memory.acts,
                        [String(actNum)]: {
                            actNumber: actNum,
                            title: asString(actObj?.title) || `Act ${actNum}`,
                            summary,
                            updatedAt: Date.now()
                        }
                    }
                };
                workingStory = { ...workingStory, story_memory: memory };
            }
        }

        const nextSoFar = renderStorySoFar(memory, workingStory);
        const afterWords = countWords(nextSoFar);

        const committed = ctx.setStory((prev) => ({
            ...prev,
            story_memory: memory,
            story_so_far: nextSoFar
        }));

        const committedId = asString(committed.id);
        if (committedId) {
            try {
                await storyStore.saveStory(committedId, committed);
            } catch (saveErr) {
                console.warn('[rebuildStorySoFar] Failed persisting compressed story_so_far:', saveErr);
            }
        }

        ctx.showToast(
            beforeWords > afterWords && beforeWords > 0
                ? `Compressed Story So Far from ${beforeWords.toLocaleString()} to ${afterWords.toLocaleString()} words!`
                : `Rebuilt Story So Far (${afterWords.toLocaleString()} words).`,
            'success'
        );

        return committed;
    } catch (err) {
        const msg = extractErrorMessage(err);
        console.error('[rebuildStorySoFar] Compression failed:', err);
        ctx.showToast(`Failed compressing Story So Far: ${msg}`, 'error');
        return baseStory;
    } finally {
        if (!isAutopilot) {
            ctx.setLoading(false);
            ctx.setLoadingStep('');
        }
    }
}
