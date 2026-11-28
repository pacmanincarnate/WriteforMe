/**
 * @module pipeline/autopilot
 * Continuous Autopilot Orchestrator:
 * Interactive activation confirmation (`handleAutopilot`) and single-step progression
 * (`runContinuousAutopilotStep`) coordinating Init -> Story Arc -> Acts & Sequences ->
 * Sequence Scene Weaving (+ background prefetch) -> Scene Prose Writing -> Editorial Harness.
 */

import { computePacingRanges, LENGTH_CONTROL, normalizeSequences } from '@/domain/story';
import { isModelStop } from '@/services/llm';
import { storyStore } from '@/services/storage';
import { isLocalProvider, type Sequence } from '@/types';
import { generateActsAndSequences, generateSequences, generateStoryArc } from './arcAndActs';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { autopilotCapPause, autopilotCheckpointPause } from './autopilotLimits';
import { runAutonomousEditorialHarness } from './editorialHarness';
import { createStoryEntityFromSetup, initStory } from './initStory';
import { writeSceneProse } from './prosePipeline';
import { generateScenes } from './sceneBlueprints';

export interface AutopilotOptions {
    fromSetup?: boolean;
}

/** Prefetches scene blueprints for the next sequence while the current sequence's last scene drafts. */
function prefetchScenesForSequence(
    ctx: PipelineRuntimeContext,
    seqIdx: number,
    currentStory: PipelineStory
): void {
    const apiProvider = ctx.getApiProvider();
    if (isLocalProvider(apiProvider)) return;

    const prefetchCache = ctx.getPrefetchCacheRef?.();
    const continuousRef = ctx.getContinuousAutopilotRef?.();
    if (!prefetchCache?.current) return;

    const key = `scenes:${seqIdx}`;
    if (prefetchCache.current.has(key)) return;

    const prefetchPromise = (async (): Promise<PipelineStory | null> => {
        try {
            if (continuousRef && !continuousRef.current) throw new Error('Autopilot stopped');
            ctx.logPipelineDelay?.(
                'Pipeline',
                0,
                `[Prefetch] Starting scene generation for Sequence ${seqIdx + 1}`
            );
            const updatedStory = await generateScenes(ctx, seqIdx, currentStory, true, true);
            if (!continuousRef || continuousRef.current) {
                ctx.logPipelineDelay?.(
                    'Pipeline',
                    0,
                    `[Prefetch] Finished scene generation for Sequence ${seqIdx + 1}`
                );
                return updatedStory ? (updatedStory as unknown as PipelineStory) : null;
            }
            throw new Error('Autopilot stopped');
        } catch (err) {
            console.warn(`[Prefetch] Scene generation failed for Sequence ${seqIdx + 1}:`, err);
            return null;
        }
    })();

    prefetchCache.current.set(key, prefetchPromise);
}

/** Consumes a pending prefetched sequence scene-weaving promise if cached. */
function consumePrefetch(
    ctx: PipelineRuntimeContext,
    key: string
): Promise<PipelineStory | null> | null {
    const prefetchCache = ctx.getPrefetchCacheRef?.();
    if (prefetchCache?.current?.has(key)) {
        const data = prefetchCache.current.get(key) || null;
        prefetchCache.current.delete(key);
        return data;
    }
    return null;
}

/** Starts or toggles Continuous Autopilot with setup story creation & user confirmation. */
export async function handleAutopilot(
    ctx: PipelineRuntimeContext,
    options: AutopilotOptions = {}
): Promise<void> {
    if (ctx.getContinuousAutopilot?.()) {
        ctx.toggleContinuousAutopilot?.();
        return;
    }
    if (ctx.getImportingLore?.()) return;

    const setupDraft = ctx.getSetupDraft?.() || {};
    const inputConcept = asString(setupDraft.inputConcept);
    const view = ctx.getView?.() || '';
    const isFromSetup = Boolean(options?.fromSetup) || (view === 'setup' && Boolean(inputConcept.trim()));
    const story = ctx.getStory();
    const conceptToUse = isFromSetup
        ? inputConcept.trim()
        : asString(story.concept) || inputConcept;

    if (!conceptToUse) {
        ctx.showToast('Please enter a story concept first!', 'warning');
        return;
    }

    const startAutopilot = async (): Promise<void> => {
        if (isFromSetup) {
            const created = await createStoryEntityFromSetup(ctx, { navigateToOverview: true });
            if (!created) return;
        }
        const continuousRef = ctx.getContinuousAutopilotRef?.();
        if (continuousRef) continuousRef.current = true;
        ctx.setContinuousAutopilot?.(true);
    };

    if (typeof ctx.requestConfirm === 'function') {
        ctx.requestConfirm({
            title: 'Activate Autonomous Autopilot?',
            message:
                'Autopilot will autonomously generate your story bible, structure acts and sequences, weave scenes, and write novel prose continuously until complete or stopped.',
            confirmLabel: 'Start Autopilot',
            danger: false,
            onConfirm: startAutopilot
        });
    } else {
        await startAutopilot();
    }
}

/** Executes the next highest-priority autonomous generation step for the active story. */
export async function runContinuousAutopilotStep(
    ctx: PipelineRuntimeContext
): Promise<boolean> {
    let currentStory = ctx.getStory();
    const setupDraft = ctx.getSetupDraft?.() || {};
    const inputConcept = asString(setupDraft.inputConcept);
    const conceptToUse = asString(currentStory?.concept) || inputConcept;
    const continuousRef = ctx.getContinuousAutopilotRef?.();
    const isStopped = (): boolean => Boolean(continuousRef && !continuousRef.current);

    if (!conceptToUse) {
        ctx.showToast('Please enter a story concept first!');
        ctx.setContinuousAutopilot?.(false);
        if (continuousRef) continuousRef.current = false;
        return false;
    }

    // Caps are checked between steps only, so a step that has started always finishes.
    const capReason = await autopilotCapPause().catch(() => '');
    if (capReason) {
        ctx.showToast(capReason, 'warning');
        ctx.setContinuousAutopilot?.(false);
        if (continuousRef) continuousRef.current = false;
        ctx.setLoading(false);
        return false;
    }

    const isBibleInitialized = Boolean(
        currentStory.status_quo ||
            asArray(currentStory.cast).length > 0 ||
            currentStory.starting_value_state ||
            asArray(currentStory.acts).length > 0 ||
            asArray(currentStory.sequences).length > 0
    );

    if (!isBibleInitialized) {
        ctx.setLoadingStep('Autopilot: Initializing Story Bible...');
        const initResult = await initStory(ctx, true, { existingStory: currentStory });
        if (initResult) {
            currentStory = initResult;
        }
        if (isStopped()) return false;
        ctx.logPipelineDelay?.(
            'Autopilot Cooldown',
            2000,
            'Initialization cooldown delay before structuring acts and sequences'
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return true;
    }

    if (!currentStory.core_thematic_argument) {
        if (!ctx.isAutopilotProtectedView?.()) ctx.setView?.('dashboard');
        ctx.setLoadingStep('Autopilot: Establishing Story Arc & Thematic Thesis...');
        const arcStory = await generateStoryArc(ctx, currentStory, true);
        if (arcStory && arcStory.core_thematic_argument) {
            currentStory = arcStory;
        } else {
            console.error('[Autopilot] Story Arc generation failed to yield core_thematic_argument.');
            ctx.showToast(
                'Autopilot paused: Story Arc could not be generated. Please run Story Arc Agent manually.',
                'error'
            );
            ctx.setContinuousAutopilot?.(false);
            if (continuousRef) continuousRef.current = false;
            ctx.setLoading(false);
            return false;
        }
        if (isStopped()) return false;
        ctx.logPipelineDelay?.(
            'Autopilot Cooldown',
            2000,
            'Cooldown delay after generating story arc'
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return true;
    }

    const sequencesList = asArray<Record<string, unknown>>(currentStory.sequences);
    if (sequencesList.length === 0) {
        if (!ctx.isAutopilotProtectedView?.()) ctx.setView?.('structure');
        if (asArray(currentStory.acts).length >= 3) {
            ctx.setLoadingStep('Autopilot: Weaving Sequences...');
            currentStory = (await generateSequences(ctx, currentStory, true)) || currentStory;
        } else {
            ctx.setLoadingStep('Autopilot: Structuring Acts & Sequences...');
            currentStory =
                (await generateActsAndSequences(ctx, currentStory, true)) || currentStory;
        }
        if (isStopped()) {
            ctx.setLoading(false);
            return false;
        }
        ctx.showToast('Acts & Sequences structured! Cooling down...');
        ctx.logPipelineDelay?.(
            'Autopilot Cooldown',
            3000,
            'Inter-step delay after structuring acts and sequences'
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        ctx.setLoading(false);
        return true;
    } else if (sequencesList.length < 8) {
        const prevSeqLen = sequencesList.length;
        currentStory = ctx.setStory((prev) => ({
            ...prev,
            sequences: normalizeSequences(
                asArray<Sequence>(prev.sequences || currentStory.sequences)
            )
        }));
        const savedId = asString(currentStory.id);
        if (savedId) {
            await storyStore.saveStory(savedId, currentStory);
        }
        ctx.showToast(`Restored full sequence framework (padded from ${prevSeqLen} to 8).`);
    }

    const prefetchCache = ctx.getPrefetchCacheRef?.();
    const totalSequences = asArray<Record<string, unknown>>(currentStory.sequences).length;

    for (let seqIdx = 0; seqIdx < totalSequences; seqIdx++) {
        if (isStopped()) return false;
        currentStory = ctx.getStory() || currentStory;

        const sequence = asRecord(asArray(currentStory.sequences)[seqIdx]);
        const scenesMap = asRecord(currentStory.scenes);
        const scenes = asArray<Record<string, unknown>>(scenesMap[`${seqIdx}`] || scenesMap[seqIdx]);
        const activeThreadsCount = asArray<Record<string, unknown>>(
            currentStory.thread_statuses
        ).filter((t) => t && t.status !== 'resolved').length;
        const pacingRanges = computePacingRanges(
            Number(currentStory.target_word_count) || 80000,
            seqIdx,
            activeThreadsCount
        );
        const lengthCtrlSeqs = asRecord(asRecord(currentStory.length_control).sequences);
        const bookTypeKey = (asString(currentStory.book_type) || 'popular') as keyof typeof LENGTH_CONTROL.BOOK_TYPES;
        const seqFloor =
            Number(asOptionalRecord(lengthCtrlSeqs[`${seqIdx}`])?.floor) ||
            Number(asOptionalRecord(pacingRanges?.scenes_per_sequence)?.min) ||
            LENGTH_CONTROL.BOOK_TYPES[bookTypeKey]?.sceneFloor ||
            3;
        const minRequiredScenes = seqFloor;
        const proseMap = asRecord(currentStory.prose);
        const hasProseForSequence = Object.keys(proseMap).some(
            (k) => (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) && Boolean(proseMap[k])
        );
        const needsSceneWeaving =
            scenes.length === 0 || (scenes.length < minRequiredScenes && !hasProseForSequence);

        if (needsSceneWeaving) {
            if (scenes.length > 0 && scenes.length < minRequiredScenes && !hasProseForSequence) {
                console.log(
                    `[Autopilot] Sequence ${seqIdx + 1} has only ${scenes.length} scenes (min ${minRequiredScenes} required). Re-weaving scenes for full novel length.`
                );
                ctx.showToast(
                    `Re-weaving Sequence ${seqIdx + 1} to meet novel-length scene count (${minRequiredScenes}+ scenes)...`,
                    'info'
                );
            }

            const prefetchKey = `scenes:${seqIdx}`;
            if (prefetchCache?.current?.has(prefetchKey)) {
                const prefetchPromise = consumePrefetch(ctx, prefetchKey);
                ctx.logPipelineDelay?.(
                    'Pipeline',
                    0,
                    `[Prefetch HIT] Awaiting prefetched scenes for Sequence ${seqIdx + 1}`
                );
                const resolvedStory = prefetchPromise ? await prefetchPromise : null;
                const resolvedScenes = asRecord(resolvedStory?.scenes);
                const resolvedSeqScenes = resolvedScenes[`${seqIdx}`] || resolvedScenes[seqIdx];
                if (resolvedStory && resolvedSeqScenes) {
                    currentStory = ctx.setStory((prev) => {
                        const cleanedBeats = { ...asRecord(prev.beats) };
                        const cleanedProse = { ...asRecord(prev.prose) };
                        Object.keys(cleanedBeats).forEach((k) => {
                            if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) {
                                delete cleanedBeats[k];
                            }
                        });
                        Object.keys(cleanedProse).forEach((k) => {
                            if (k.startsWith(`${seqIdx}-`) || k === `${seqIdx}`) {
                                delete cleanedProse[k];
                            }
                        });
                        const prefetchedLengthCtrl = asRecord(
                            asOptionalRecord(resolvedStory.length_control)?.sequences
                        );
                        const prefetchedLengthSeq =
                            prefetchedLengthCtrl[`${seqIdx}`] || prefetchedLengthCtrl[seqIdx];
                        const prevLengthCtrl = asOptionalRecord(prev.length_control);
                        const updatedLengthControl = prefetchedLengthSeq
                            ? {
                                  ...(prevLengthCtrl || {}),
                                  sequences: {
                                      ...asRecord(prevLengthCtrl?.sequences),
                                      [`${seqIdx}`]: prefetchedLengthSeq
                                  }
                              }
                            : prev.length_control;

                        const updated: PipelineStory = {
                            ...prev,
                            ...(updatedLengthControl ? { length_control: updatedLengthControl } : {}),
                            scenes: {
                                ...asRecord(prev.scenes),
                                [`${seqIdx}`]: resolvedSeqScenes
                            },
                            beats: cleanedBeats,
                            prose: cleanedProse
                        };
                        const updId = asString(updated.id);
                        if (updId) {
                            storyStore
                                .saveStory(updId, updated)
                                .catch((err) =>
                                    console.warn('Failed saving prefetch scenes to store:', err)
                                );
                        }
                        return updated;
                    });
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    ctx.setLoading(false);
                    return true;
                }
            }

            if (!ctx.isAutopilotProtectedView?.()) {
                ctx.setSelectedSequence?.(seqIdx);
                ctx.setView?.('sequence_dashboard');
            }
            ctx.setLoadingStep(
                `Autopilot: Weaving scenes for Sequence ${seqIdx + 1} (${asString(sequence.title)})...`
            );
            try {
                const woven = await generateScenes(ctx, seqIdx, ctx.getStory() || currentStory, true);
                if (woven) {
                    currentStory = woven as unknown as PipelineStory;
                }
            } catch (err) {
                if (isModelStop(err) || isStopped()) {
                    ctx.setLoading(false);
                    return false;
                }
                const msg = extractErrorMessage(err);
                console.error('Autopilot scene generation error:', err);
                ctx.showToast(
                    `Autopilot scene planning failed for Sequence ${seqIdx + 1}: ${msg}`,
                    'error'
                );
                ctx.logPipelineError(
                    `Autopilot Scene Planner (Sequence ${seqIdx + 1})`,
                    msg,
                    err instanceof Error ? err.stack || null : null
                );
                ctx.setContinuousAutopilot?.(false);
                if (continuousRef) continuousRef.current = false;
                ctx.setLoading(false);
                return false;
            }
            if (isStopped()) {
                ctx.setLoading(false);
                return false;
            }
            ctx.showToast(`Sequence ${seqIdx + 1} scenes wove! Cooling down...`);
            ctx.logPipelineDelay?.(
                'Autopilot Cooldown',
                3000,
                `Inter-step delay after weaving scenes for Sequence ${seqIdx + 1}`
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
            ctx.setLoading(false);
            return true;
        }

        const seqScenesCount = asArray(
            asRecord(currentStory.scenes)[`${seqIdx}`] || asRecord(currentStory.scenes)[seqIdx]
        ).length;
        for (let sceneIdx = 0; sceneIdx < seqScenesCount; sceneIdx++) {
            if (isStopped()) return false;
            currentStory = ctx.getStory() || currentStory;

            const currentScenesMap = asRecord(currentStory.scenes);
            const currentSeqScenes = asArray(
                currentScenesMap[`${seqIdx}`] || currentScenesMap[seqIdx]
            );
            const sId = `${seqIdx}-${sceneIdx}`;
            const rawProse = asRecord(currentStory.prose)[sId];
            const proseRec = asOptionalRecord(rawProse);
            const missingProse = !rawProse || (!proseRec?.final && typeof rawProse !== 'string');

            if (missingProse) {
                if (!ctx.isAutopilotProtectedView?.()) {
                    ctx.setSelectedSequence?.(seqIdx);
                    ctx.setSelectedScene?.(sceneIdx);
                    ctx.setView?.('writer');
                }

                if (isStopped()) {
                    ctx.setLoading(false);
                    return false;
                }

                ctx.setLoading(true);
                ctx.setLoadingStep(
                    `Autopilot: Drafting prose for Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}...`
                );
                try {
                    const written = await writeSceneProse(
                        ctx,
                        seqIdx,
                        sceneIdx,
                        ctx.getStory() || currentStory,
                        true
                    );
                    if (!written) {
                        console.error(
                            '[Autopilot] writeSceneProse returned null or undefined story state.'
                        );
                        ctx.showToast(
                            `Autopilot paused: invalid story state after Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}.`,
                            'error'
                        );
                        ctx.setContinuousAutopilot?.(false);
                        if (continuousRef) continuousRef.current = false;
                        ctx.setLoading(false);
                        return false;
                    }
                    currentStory = ctx.getStory() || written;
                } catch (err) {
                    if (isModelStop(err) || isStopped()) {
                        ctx.setLoading(false);
                        return false;
                    }
                    console.error('Autopilot scene prose error:', err);
                    ctx.showToast(
                        `Autopilot paused at Sequence ${seqIdx + 1}, Scene ${sceneIdx + 1}: ${extractErrorMessage(err)}`,
                        'error'
                    );
                    ctx.setContinuousAutopilot?.(false);
                    if (continuousRef) continuousRef.current = false;
                    ctx.setLoading(false);
                    return false;
                }

                const seqsArr = asArray(currentStory.sequences);
                if (sceneIdx === currentSeqScenes.length - 1 && seqIdx + 1 < seqsArr.length) {
                    const nextScenesMap = asRecord(currentStory.scenes);
                    const nextScenes = asArray(
                        nextScenesMap[`${seqIdx + 1}`] || nextScenesMap[seqIdx + 1]
                    );
                    if (nextScenes.length === 0) {
                        prefetchScenesForSequence(ctx, seqIdx + 1, currentStory);
                    }
                }

                const checkpoint = autopilotCheckpointPause({
                    seqIdx,
                    sceneIdx,
                    scenesInSequence: currentSeqScenes.length,
                    sequenceActs: seqsArr.map((sq) => asRecord(sq).parent_act as number | string | undefined)
                });
                if (checkpoint && !isStopped()) {
                    ctx.showToast(checkpoint, 'info');
                    ctx.setContinuousAutopilot?.(false);
                    if (continuousRef) continuousRef.current = false;
                    ctx.setLoading(false);
                    return false;
                }

                if (!isStopped()) {
                    ctx.showToast(`Scene ${sceneIdx + 1} completed! Taking a short breath...`);
                    ctx.logPipelineDelay?.(
                        'Autopilot Cooldown',
                        3000,
                        `Inter-step delay after drafting prose for Scene ${seqIdx + 1}.${sceneIdx + 1}`
                    );
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                }
                ctx.setLoading(false);
                return true;
            }
        }
    }

    const postSeqs = asArray(currentStory.sequences);
    if (postSeqs.length < 8) {
        console.warn(`[Autopilot] Completion halted: sequences length is ${postSeqs.length}`);
        ctx.setContinuousAutopilot?.(false);
        if (continuousRef) continuousRef.current = false;
        ctx.setLoading(false);
        ctx.showToast(
            'Autopilot paused: Structure contains incomplete sequences. Please weave all sequences.',
            'warning'
        );
        return false;
    }

    const enableEditorialHarnessAutopilot = ctx.getEnableEditorialHarnessAutopilot?.() ?? true;
    const editorialAlreadyDone = Boolean(
        asOptionalRecord(currentStory.editorial_harness)?.autopilotCompleted
    );
    if (enableEditorialHarnessAutopilot && !editorialAlreadyDone) {
        if (isStopped()) {
            ctx.setLoading(false);
            return false;
        }
        ctx.setLoadingStep(
            'Autopilot: Running Autonomous Editorial Harness & 3-Wave Literary CI/CD...'
        );
        ctx.showToast(
            'All scenes drafted! Autopilot is now running the 5-Phase Autonomous Editorial Harness...',
            'info'
        );
        try {
            await runAutonomousEditorialHarness(ctx, {
                mode: 'full_pipeline',
                scopeSceneId: 'ALL',
                useLLM: ctx.getEditorialUseDeepLLM?.() ?? true,
                storyOverride: currentStory,
                isAutopilot: true
            });
        } catch (harnessErr) {
            console.warn('[Autopilot] Editorial Harness pass encountered an error:', harnessErr);
        }
        ctx.setLoading(false);
        return true;
    }

    ctx.setContinuousAutopilot?.(false);
    if (continuousRef) continuousRef.current = false;
    prefetchCache?.current?.clear();
    ctx.setLoading(false);
    ctx.showToast(
        '✨ Continuous Autopilot Complete! The entire novel has been woven, written, and verified by the Editorial Harness!'
    );
    return false;
}
