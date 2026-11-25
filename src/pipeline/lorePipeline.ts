/**
 * @module pipeline/lorePipeline
 * Map-Reduce World Bible distillation, RAG vector indexing/deduplication,
 * Tier 6.5 Lore Extraction Agent, and bi-temporal World Updates synchronization.
 */

import {
    applyWorldUpdates,
    commitEpistemicSceneDeltas,
    formatSceneCoord,
    type ContinuityStoryState,
    type ProcessedLoreEntry,
    type WorldUpdateStoryState,
    type WorldUpdatesPayload
} from '@/domain/continuity';
import {
    computeLoreFingerprint,
    deriveLoreTitle,
    normalizeLoreRelations,
    partitionLoreIntoSemanticSections
} from '@/domain/lore';
import { PROMPTS } from '@/prompts';
import type { LoreItem } from '@/types';
import { extractAllTags, extractTag, safeLocalStorageSet } from '@/utils';
import {
    asArray,
    asNumber,
    asOptionalRecord,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';

export interface DistillLoreOptions {
    storyId?: string | null;
    onProgress?: (msg: string) => void;
}

interface SectionBriefing {
    index: number;
    total?: number;
    title: string;
    text: string;
}

export interface LoreRebuildControl {
    service: ReturnType<PipelineRuntimeContext['getEmbeddingService']>;
    clearPending: boolean;
    deduplicate: boolean;
    assertCurrent: () => void;
}

export interface IngestedLoreResult extends ProcessedLoreEntry {
    topic?: string;
    detail?: string;
    description?: string;
    valid_from_act?: number;
    valid_from_scene?: number;
    related_to?: string[];
    is_merged: boolean;
    merged_from_topic?: string;
}

export interface IngestLoreBatchOptions {
    clearExisting?: boolean;
    deduplicate?: boolean;
    storyId?: string;
    fingerprintProcessed?: boolean;
    isCurrent?: () => boolean;
    status?: string;
    throwOnError?: boolean;
}

/**
 * Scalable Map-Reduce World Bible distiller supporting Fast-Path (<=28k chars),
 * sequential section extraction, and recursive tree-reduction into a unified World Primer.
 */
export async function distillLore(
    ctx: PipelineRuntimeContext,
    text: string,
    options: DistillLoreOptions = {}
): Promise<string | null> {
    if (!text || typeof text !== 'string' || !text.trim()) return null;
    const trimmedText = text.trim();
    const totalChars = trimmedText.length;
    const FAST_PATH_LIMIT = 28000;
    const targetStoryId = options?.storyId || null;
    const activeVersion = ctx.getLoreImportVersion();
    const isSuperseded = () => !targetStoryId && ctx.getLoreImportVersion() !== activeVersion;

    const applyPrimerToTarget = async (primerText: string): Promise<void> => {
        const currentStory = ctx.getStory();
        if (!targetStoryId || asString(currentStory.id) === targetStoryId) {
            ctx.setWorldPrimer(primerText);
        }
        if (targetStoryId) {
            await ctx.updateStoryById(targetStoryId, (prev) => ({
                ...prev,
                world_primer: primerText
            }));
            return;
        }
        const latestStory = ctx.getStory();
        if (latestStory && asString(latestStory.id)) {
            const updatedStory = ctx.setStory((prev) => ({
                ...prev,
                world_primer: primerText
            }));
            const updatedId = asString(updatedStory.id);
            if (updatedId) {
                const winStore = (
                    typeof window !== 'undefined'
                        ? (window as unknown as {
                              storyStore?: {
                                  saveStory?: (id: string, data: PipelineStory) => Promise<unknown>;
                              };
                          }).storyStore
                        : undefined
                );
                if (winStore?.saveStory) {
                    winStore.saveStory(updatedId, updatedStory).catch((err) => {
                        console.warn('[distillLore] Failed to persist primer to storyStore:', err);
                    });
                }
            }
        }
    };

    const updateProgress = async (msg: string): Promise<void> => {
        if (typeof options?.onProgress === 'function') {
            try {
                options.onProgress(msg);
            } catch (e) {
                console.warn('[distillLore] onProgress callback threw:', e);
            }
        }
        ctx.setLoadingStep(msg);
        await new Promise((r) => setTimeout(r, 10));
    };

    // TIER 1: FAST PATH FOR SMALL / MEDIUM DOCUMENTS (<= 28,000 characters)
    if (totalChars <= FAST_PATH_LIMIT) {
        await updateProgress('Distilling World Primer (Single-Pass)...');
        try {
            const primer = await ctx.callAI(
                `<world_bible_source_text>\n${trimmedText}\n</world_bible_source_text>`,
                PROMPTS.lorePrimerSynthesizer || PROMPTS.loreDistiller,
                false,
                'Lore Distiller (Fast Path)',
                'review'
            );
            if (primer && primer.trim()) {
                const cleanPrimer = primer.trim();
                await applyPrimerToTarget(cleanPrimer);
                return cleanPrimer;
            }
        } catch (e) {
            console.error('[distillLore] Fast-path distillation failed:', e);
            ctx.showToast('Distillation failed, using raw notes fallback.', 'warning');
            const fallback = `# WORLD PRIMER (Raw Fallback)\n\n${trimmedText.substring(0, 10000)}`;
            await applyPrimerToTarget(fallback);
            return fallback;
        }
    }

    // TIER 2: MAP PHASE - PARTITION & EXTRACT SECTIONS SEQUENTIALLY
    const sections = partitionLoreIntoSemanticSections(trimmedText, 20000, 25000, 12000);
    console.log(
        `[distillLore] Document partitioned into ${sections.length} semantic sections (total ${totalChars} chars).`
    );

    const sectionBriefings: SectionBriefing[] = [];
    const effectiveConfig = ctx.getEffectiveModelConfig('review');
    const targetProvider = effectiveConfig?.provider || 'gemini';
    const hasAiOverride = Boolean(
        typeof window !== 'undefined' &&
            (window as unknown as { __callAIOverride?: unknown }).__callAIOverride
    );
    const pacingDelayMs = hasAiOverride ? 10 : targetProvider === 'gemini' ? 1200 : 400;

    for (let i = 0; i < sections.length; i++) {
        if (isSuperseded()) {
            console.warn('[distillLore] Distillation superseded or cancelled by user.');
            return null;
        }

        const sec = sections[i];
        await updateProgress(
            `Distilling World Primer (Section ${i + 1}/${sections.length}: ${sec.title})...`
        );

        const sectionPayload =
            `<section_distillation_request>\n` +
            `  <metadata>\n` +
            `    <section_number>${sec.index}</section_number>\n` +
            `    <total_sections>${sec.total}</total_sections>\n` +
            `    <section_heading>${sec.title}</section_heading>\n` +
            `    <character_count>${sec.charCount}</character_count>\n` +
            `  </metadata>\n` +
            `  <section_text>\n${sec.text}\n  </section_text>\n` +
            `</section_distillation_request>`;

        try {
            const briefing = await ctx.callAI(
                sectionPayload,
                PROMPTS.loreSectionDistiller,
                false,
                `Lore Section Distiller ${sec.index}/${sec.total}`,
                'review'
            );

            if (briefing && briefing.trim()) {
                sectionBriefings.push({
                    index: sec.index,
                    total: sec.total,
                    title: sec.title,
                    text: briefing.trim()
                });
            } else {
                throw new Error('Empty response from section distiller');
            }
        } catch (secErr) {
            console.warn(
                `[distillLore] Section ${sec.index} distillation failed; applying heuristic extractive fallback:`,
                secErr
            );
            ctx.showToast(
                `Notice: Distillation fallback applied for Section ${sec.index}/${sec.total}.`,
                'info'
            );

            const lines = sec.text
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
            const keyLines = lines
                .filter(
                    (l) =>
                        l.startsWith('#') ||
                        l.startsWith('-') ||
                        l.startsWith('*') ||
                        l.includes(':')
                )
                .slice(0, 15);
            const fallbackText =
                keyLines.length > 0 ? keyLines.join('\n') : lines.slice(0, 5).join(' ');

            sectionBriefings.push({
                index: sec.index,
                total: sec.total,
                title: sec.title,
                text: `### Section Briefing (${sec.title} - Extractive Fallback)\n${fallbackText.substring(0, 2000)}`
            });
        }

        if (i < sections.length - 1) {
            await new Promise((r) => setTimeout(r, pacingDelayMs));
        }
    }

    if (sectionBriefings.length === 0) {
        ctx.showToast('Failed to extract lore sections.', 'error');
        return null;
    }

    // TIER 3: REDUCE PHASE - SYNTHESIZE UNIFIED WORLD PRIMER
    let currentBriefings: SectionBriefing[] = [...sectionBriefings];
    const MAX_REDUCE_INPUT_CHARS = 20000;
    let treeLevel = 1;

    while (
        currentBriefings.map((b) => b.text).join('\n\n---\n\n').length > MAX_REDUCE_INPUT_CHARS &&
        currentBriefings.length > 3
    ) {
        if (isSuperseded()) return null;
        await updateProgress(`Synthesizing World Lore Clusters (Level ${treeLevel})...`);
        const clusterSize = 3;
        const nextLevelBriefings: SectionBriefing[] = [];

        for (let i = 0; i < currentBriefings.length; i += clusterSize) {
            const cluster = currentBriefings.slice(i, i + clusterSize);
            const clusterIndices = cluster.map((c) => c.index).join(', ');
            const clusterText = cluster
                .map((c) => `### ${c.title || `Section ${c.index}`}\n${c.text}`)
                .join('\n\n---\n\n');

            try {
                const clusterSummary = await ctx.callAI(
                    `<cluster_sections>${clusterIndices}</cluster_sections>\n\n<cluster_briefings>\n${clusterText}\n</cluster_briefings>`,
                    PROMPTS.loreGroupSynthesizer,
                    false,
                    `Lore Cluster Synthesizer L${treeLevel}.${Math.floor(i / clusterSize) + 1}`,
                    'review'
                );
                nextLevelBriefings.push({
                    index: Math.floor(i / clusterSize) + 1,
                    title: `Cluster (${clusterIndices})`,
                    text:
                        clusterSummary && clusterSummary.trim()
                            ? clusterSummary.trim()
                            : clusterText.substring(0, 4000)
                });
            } catch (clusterErr) {
                console.warn(
                    `[distillLore] Cluster synthesis failed for sections [${clusterIndices}]:`,
                    clusterErr
                );
                nextLevelBriefings.push({
                    index: Math.floor(i / clusterSize) + 1,
                    title: `Cluster (${clusterIndices})`,
                    text: clusterText.substring(0, 4000)
                });
            }
            if (i + clusterSize < currentBriefings.length) {
                await new Promise((r) => setTimeout(r, pacingDelayMs));
            }
        }

        currentBriefings = nextLevelBriefings;
        treeLevel++;
    }

    await updateProgress('Synthesizing Unified World Primer...');
    const finalInputText = currentBriefings
        .map((b) => `### ${b.title || `Section ${b.index}`}\n${b.text}`)
        .join('\n\n---\n\n');

    try {
        const finalPrimer = await ctx.callAI(
            `<source_briefings_count>${currentBriefings.length}</source_briefings_count>\n\n<section_briefings>\n${finalInputText}\n</section_briefings>`,
            PROMPTS.lorePrimerSynthesizer || PROMPTS.loreDistiller,
            false,
            'World Primer Synthesizer',
            'review'
        );

        const resolvedPrimer =
            finalPrimer && finalPrimer.trim()
                ? finalPrimer.trim()
                : `# WORLD PRIMER\n\n${finalInputText}`;
        await applyPrimerToTarget(resolvedPrimer);
        return resolvedPrimer;
    } catch (reduceErr) {
        console.error(
            '[distillLore] Final primer synthesis failed, using consolidated section briefings:',
            reduceErr
        );
        ctx.showToast(
            'Final primer synthesis encountered an issue; preserved all extracted section briefings.',
            'warning'
        );
        const fallbackPrimer = `# WORLD PRIMER (Consolidated Sections)\n\n${finalInputText}`;
        await applyPrimerToTarget(fallbackPrimer);
        return fallbackPrimer;
    }
}

/** Single-item RAG vector ingest with 3-tier semantic redundancy check. */
export async function ingestLore(
    ctx: PipelineRuntimeContext,
    rawItem: Partial<LoreItem> & Record<string, unknown>,
    rebuild: LoreRebuildControl | null = null
): Promise<IngestedLoreResult> {
    if (!rebuild) ctx.bumpRagIndexRevision();
    safeLocalStorageSet('ellipsisprose_rag_fingerprint', '');
    if (!rawItem || !rawItem.topic || !rawItem.detail) {
        return { ...rawItem, is_merged: false };
    }
    const normalizedRelated = normalizeLoreRelations(rawItem.related_to);
    const item = { ...rawItem, related_to: normalizedRelated };
    const topicStr = asString(item.topic);
    const detailStr = asString(item.detail);
    const descStr = asString(item.description);

    try {
        const service = rebuild?.service || ctx.getEmbeddingService();
        const vectorStore = ctx.getVectorStore();
        if (!service || !vectorStore) {
            return { ...item, is_merged: false };
        }

        const itemText = `${topicStr}: ${descStr || detailStr}`;
        const tempEmbedding = await service.getEmbedding(itemText);
        if (!tempEmbedding || tempEmbedding.length === 0) {
            if (rebuild) throw new Error('No embedding returned for lore item.');
            return { ...item, is_merged: false };
        }
        if (rebuild) rebuild.assertCurrent();

        const skipRedundancy = Boolean(rebuild?.clearPending || rebuild?.deduplicate === false);
        const redundancy = skipRedundancy
            ? null
            : await vectorStore.checkRedundancy(tempEmbedding, 0.92);

        if (redundancy) {
            const similarityScore = redundancy.score !== undefined ? redundancy.score : 0.92;
            const redMeta = asRecord(redundancy.metadata);
            const existingDetail =
                redMeta.detail !== undefined
                    ? asString(redMeta.detail)
                    : redundancy.text && redundancy.text.includes(':')
                      ? redundancy.text.replace(/^[^:]+:\s*/, '')
                      : '';
            const newDetail = detailStr.trim();

            let chosenDetail = '';
            let chosenEmbedding = tempEmbedding;

            if (similarityScore >= 0.95) {
                console.log(
                    `[ingestLore] Near-duplicate detected (similarity: ${similarityScore.toFixed(3)} >= 0.95). Merging deterministically.`
                );
                if (newDetail.length >= existingDetail.length || !existingDetail) {
                    chosenDetail = newDetail;
                    chosenEmbedding = tempEmbedding;
                } else {
                    chosenDetail = existingDetail;
                    chosenEmbedding = redundancy.vector || tempEmbedding;
                }
            } else {
                console.log(
                    `[ingestLore] Semantic overlap detected (similarity: ${similarityScore.toFixed(3)}). Invoking LLM Lore Keeper.`
                );
                chosenDetail = await ctx.callAI(
                    `Existing: ${redundancy.text}\nNew: ${detailStr}\n\nTask: Merge these two lore entries into one concise, consistent entry.`,
                    'You are a Lore Keeper.',
                    false,
                    'Lore Merger',
                    'review'
                );
                const reEmbedding = await service.getEmbedding(`${topicStr}: ${chosenDetail}`);
                if (rebuild && (!reEmbedding || reEmbedding.length === 0)) {
                    throw new Error('No embedding returned for merged lore item.');
                }
                if (reEmbedding) chosenEmbedding = reEmbedding;
            }

            const mergedMetadata: Record<string, unknown> = {
                ...redMeta,
                topic: topicStr,
                detail: chosenDetail,
                valid_from_act: Math.min(
                    asNumber(redMeta.valid_from_act, 1),
                    asNumber(item.valid_from_act, 1)
                ),
                valid_from_scene: Math.min(
                    asNumber(redMeta.valid_from_scene, 1),
                    asNumber(item.valid_from_scene, 1)
                ),
                related_to: Array.from(
                    new Set([...normalizeLoreRelations(redMeta.related_to), ...normalizedRelated])
                )
            };

            if (rebuild) rebuild.assertCurrent();
            await vectorStore.add(
                redundancy.id,
                `${topicStr}: ${chosenDetail}`,
                chosenEmbedding,
                mergedMetadata
            );

            return {
                ...item,
                detail: chosenDetail,
                valid_from_act: asNumber(mergedMetadata.valid_from_act, 1),
                valid_from_scene: asNumber(mergedMetadata.valid_from_scene, 1),
                related_to: mergedMetadata.related_to as string[],
                is_merged: true,
                merged_from_topic: asString(redMeta.topic) || undefined
            };
        }

        const id = `lore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        if (rebuild) {
            rebuild.assertCurrent();
            if (rebuild.clearPending) {
                await vectorStore.clear();
                rebuild.clearPending = false;
            }
        }
        await vectorStore.add(id, `${topicStr}: ${detailStr}`, tempEmbedding, {
            topic: topicStr,
            detail: detailStr,
            valid_from_act: asNumber(item.valid_from_act, 1),
            valid_from_scene: asNumber(item.valid_from_scene, 1),
            related_to: normalizedRelated
        });
        return { ...item, is_merged: false };
    } catch (err) {
        if (rebuild) throw err;
        console.warn('[ingestLore] Lore embedding/indexing skipped due to error:', err);
        return { ...item, is_merged: false };
    } finally {
        if (!rebuild) {
            ctx.bumpRagIndexRevision();
            safeLocalStorageSet('ellipsisprose_rag_fingerprint', '');
        }
    }
}

/** Sequential batch ingest of lore items for initialization, import, or full index rebuild. */
export async function ingestLoreBatch(
    ctx: PipelineRuntimeContext,
    loreList: Array<Partial<LoreItem> & Record<string, unknown>>,
    options: IngestLoreBatchOptions = {}
): Promise<IngestedLoreResult[]> {
    const {
        clearExisting = false,
        deduplicate = true,
        storyId = asString(ctx.getStory().id),
        fingerprintProcessed = false,
        isCurrent = () => true,
        status = 'indexing_batch',
        throwOnError = false
    } = options;

    const service = ctx.getEmbeddingService();
    const revision = clearExisting ? ctx.bumpRagIndexRevision() : ctx.getRagIndexRevision();
    const rebuild: LoreRebuildControl | null = clearExisting
        ? {
              service,
              clearPending: true,
              deduplicate,
              assertCurrent: () => {
                  if (
                      !isCurrent() ||
                      ctx.getEmbeddingService() !== service ||
                      ctx.getRagIndexRevision() !== revision
                  ) {
                      throw new Error(
                          'Lore indexing cancelled because the story, lore, or embedding provider changed.'
                      );
                  }
              }
          }
        : null;

    ctx.setRagStatus(status);
    try {
        if (clearExisting && !service?.isConfigured()) {
            throw new Error('No embedding credentials configured.');
        }
        const processedList: IngestedLoreResult[] = [];
        const provider = service?.provider || 'gemini';
        const pacingDelayMs = provider === 'gemini' ? 350 : 150;

        for (let itemIdx = 0; itemIdx < loreList.length; itemIdx++) {
            const item = loreList[itemIdx];
            if (rebuild) rebuild.assertCurrent();
            if (itemIdx > 0 && pacingDelayMs > 0) {
                await new Promise((r) => setTimeout(r, pacingDelayMs));
            }
            const processed = await ingestLore(ctx, item, rebuild);
            if (!processed.is_merged) {
                processedList.push(processed);
            } else {
                const idx = processedList.findIndex(
                    (p) =>
                        (processed.merged_from_topic && p.topic === processed.merged_from_topic) ||
                        p.topic === processed.topic
                );
                if (idx !== -1) {
                    processedList[idx] = processed;
                } else {
                    processedList.push(processed);
                }
            }
        }

        if (rebuild && service) {
            rebuild.assertCurrent();
            if (!rebuild.clearPending) {
                const fingerprintItems = (fingerprintProcessed ? processedList : loreList) as LoreItem[];
                safeLocalStorageSet(
                    'ellipsisprose_rag_fingerprint',
                    computeLoreFingerprint(storyId, fingerprintItems, service.getProviderLabel())
                );
            }
        }
        return processedList;
    } catch (err) {
        if (throwOnError) throw err;
        console.warn('[RAG] lore ingest stopped:', err);
        return loreList.map((item) => ({ ...item, is_merged: false }));
    } finally {
        ctx.setRagStatus('ready');
    }
}

/** Forces a clean RAG vector store rebuild from canonical `story.lore`. */
export async function rebuildRagIndex(ctx: PipelineRuntimeContext): Promise<void> {
    const currentStatus = ctx.getRagStatus();
    if (
        ctx.getIsRebuildingRag() ||
        currentStatus === 'indexing' ||
        currentStatus === 'indexing_batch'
    ) {
        return;
    }
    const story = ctx.getStory();
    const lore = asArray<Partial<LoreItem> & Record<string, unknown>>(story.lore);
    ctx.setIsRebuildingRag(true);
    ctx.showToast(`Rebuilding RAG index for ${lore.length} lore entries…`, 'info');
    try {
        await ingestLoreBatch(ctx, lore, {
            clearExisting: true,
            deduplicate: false,
            throwOnError: true
        });
        ctx.showToast('RAG index rebuilt', 'success');
    } catch (error) {
        ctx.showToast(`RAG index rebuild failed: ${extractErrorMessage(error)}`, 'error');
    } finally {
        ctx.setRagStatus('ready');
        ctx.setIsRebuildingRag(false);
    }
}

/**
 * Synchronizes Archivist / GESM updates, newly extracted lore items, and bi-temporal
 * Knowledge Graph / Continuity Ledger mutations onto either `targetStory` or active `story`.
 */
export async function handleWorldUpdates(
    ctx: PipelineRuntimeContext,
    updates: (WorldUpdatesPayload & {
        lore_updates?: Array<{ topic?: string; detail?: string }>;
        epistemic_transitions?: Array<Record<string, unknown>>;
    }) | null | undefined,
    activeActNum: number | string = 1,
    activeSceneNum: number | string = 1,
    targetStory: PipelineStory | null = null,
    sceneObj: Record<string, unknown> | null = null
): Promise<PipelineStory | null> {
    if (!updates) return ctx.getStory() || targetStory || null;

    let committedEpistemicGraph: unknown = null;
    let committedSecretVault: unknown = null;
    try {
        const base = { ...(ctx.getStory() || targetStory || {}) };
        const sceneCoord =
            typeof activeSceneNum === 'string' && activeSceneNum.includes('.')
                ? activeSceneNum
                : formatSceneCoord(activeActNum, activeSceneNum);
        await commitEpistemicSceneDeltas(
            base as ContinuityStoryState,
            asArray<Record<string, unknown>>(updates.epistemic_transitions),
            sceneCoord,
            sceneObj || {},
            ctx.callAI
        );
        committedEpistemicGraph = base.epistemic_graph;
        committedSecretVault = base.secret_vault;
    } catch (gesmCommitErr) {
        console.warn('[handleWorldUpdates] GESM commit warning:', gesmCommitErr);
    }

    const processedLoreStart: IngestedLoreResult[] = [];
    if (updates.lore_updates && updates.lore_updates.length > 0) {
        ctx.setRagStatus('indexing');
        for (const up of updates.lore_updates) {
            const rawItem: Partial<LoreItem> & Record<string, unknown> = {
                topic: up.topic,
                detail: up.detail,
                valid_from_act: typeof activeActNum === 'number' ? activeActNum : 1,
                valid_from_scene: typeof activeSceneNum === 'number' ? activeSceneNum : 1
            };
            const processed = await ingestLore(ctx, rawItem);
            processedLoreStart.push(processed);
        }
        ctx.setRagStatus('idle');
    }

    const applyWorldFn = ctx.applyWorldUpdates || applyWorldUpdates;

    if (targetStory) {
        const latestBase = ctx.getStory() || targetStory;
        const baseWithEpistemic: PipelineStory = {
            ...targetStory,
            ...latestBase,
            prose: { ...asRecord(targetStory.prose), ...asRecord(latestBase.prose) },
            beats: { ...asRecord(targetStory.beats), ...asRecord(latestBase.beats) },
            scenes: { ...asRecord(targetStory.scenes), ...asRecord(latestBase.scenes) },
            character_states: {
                ...asRecord(targetStory.character_states),
                ...asRecord(latestBase.character_states)
            },
            ...(committedEpistemicGraph ? { epistemic_graph: committedEpistemicGraph } : {}),
            ...(committedSecretVault ? { secret_vault: committedSecretVault } : {})
        };
        return applyWorldFn(
            baseWithEpistemic as WorldUpdateStoryState,
            updates,
            processedLoreStart,
            activeActNum,
            activeSceneNum
        );
    }

    let updatedResult: PipelineStory | null = null;
    ctx.setStory((prev) => {
        const baseWithEpistemic: PipelineStory = {
            ...prev,
            ...(committedEpistemicGraph ? { epistemic_graph: committedEpistemicGraph } : {}),
            ...(committedSecretVault ? { secret_vault: committedSecretVault } : {})
        };
        updatedResult = applyWorldFn(
            baseWithEpistemic as WorldUpdateStoryState,
            updates,
            processedLoreStart,
            activeActNum,
            activeSceneNum
        );
        return updatedResult;
    });
    return updatedResult;
}

/** TIER 6.5: Extracts implicit world-building lore from newly generated structural/prose payloads. */
export async function triggerLoreExtraction(
    ctx: PipelineRuntimeContext,
    payload: string,
    activeActNum: number | string = 1,
    activeSceneNum: number | string = 1
): Promise<void> {
    if (!payload) return;
    try {
        const story = ctx.getStory();
        const loreItems = asArray<Record<string, unknown>>(story.lore);
        const currentLoreList = loreItems
            .map((l) => asString(asOptionalRecord(l)?.topic))
            .filter(Boolean)
            .join(', ');

        const promptText = `<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <extracted_lore>...</extracted_lore>.

Output Schema:
<extracted_lore>
  <lore_entry>
    <category>Category (e.g., Cultural Tradition, Architecture, Magic System)</category>
    <title>A specific 2-6 word noun phrase naming the fact, no trailing punctuation</title>
    <new_fact>Objective, encyclopedic description of the newly established lore.</new_fact>
  </lore_entry>
  <!-- Repeat as necessary -->
</extracted_lore>
</output_format_description>

<current_status_quo>
${asString(story.status_quo)}
</current_status_quo>
<current_lore_topics>
${currentLoreList}
</current_lore_topics>

<newly_generated_payload>
${payload}
</newly_generated_payload>

BEGIN EXTRACTING WORLD LORE
`;
        const extractionOutput = await ctx.callAI(
            promptText,
            PROMPTS.loreExtraction,
            false,
            'Lore Extraction Agent',
            'review'
        );
        if (extractionOutput && !extractionOutput.includes('<extracted_lore>NONE</extracted_lore>')) {
            const entries = extractAllTags(extractionOutput, 'lore_entry');
            if (entries.length > 0) {
                const loreUpdates = entries
                    .map((entry) => {
                        const cat = extractTag(entry, 'category');
                        const fact = extractTag(entry, 'new_fact');
                        const title = extractTag(entry, 'title').trim();
                        const topic = title
                            ? `${cat}: ${title}`
                            : `${cat}: ${deriveLoreTitle(fact)}`;
                        return { topic, detail: fact };
                    })
                    .filter((up) => Boolean(up.topic && up.detail));

                if (loreUpdates.length > 0) {
                    ctx.showToast(
                        `Lore Extraction: Found ${loreUpdates.length} new lore items, indexing...`,
                        'info'
                    );
                    await handleWorldUpdates(
                        ctx,
                        { lore_updates: loreUpdates },
                        activeActNum,
                        activeSceneNum
                    );
                }
            }
        }
    } catch (err) {
        console.warn('Lore Extraction Agent execution failed:', err);
    }
}
