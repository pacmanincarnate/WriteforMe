/**
 * @module domain/continuity/storyMemory
 * Pure hierarchical "Story So Far" memory engine (Telescoping Pyramid):
 * - Active Sequence: keyed per-scene causal deltas (`story_memory.scenes["seqIdx-sceneIdx"]`)
 * - Current Act (completed sequences): compressed sequence summaries (`story_memory.sequences["seqIdx"]`)
 * - Completed Acts: compressed act summaries (`story_memory.acts["actNum"]`)
 *
 * Deterministically renders `story.story_so_far` in strict chronological order so prompts stay
 * bounded (~450–1,100 words) without losing early setup or accumulating tactical handoff bloat.
 */

import { actForSequence, parseActNumber } from '@/domain/story';
import type {
    StoryMemory,
    StoryMemoryActEntry,
    StoryMemorySceneEntry,
    StoryMemorySequenceEntry
} from '@/types';

/** Word-count threshold above which an unstructured `story_so_far` is flagged as needing compression. */
export const STORY_SO_FAR_BLOATED_WORD_THRESHOLD = 1200;

/** Creates a blank hierarchical `StoryMemory` container. */
export function createEmptyStoryMemory(): StoryMemory {
    return {
        acts: {},
        sequences: {},
        scenes: {}
    };
}

/** Normalizes and shallow-clones any partial or legacy `story_memory` object safely. */
export function ensureStoryMemory(raw: unknown): StoryMemory {
    if (!raw || typeof raw !== 'object') {
        return createEmptyStoryMemory();
    }
    const rec = raw as Record<string, unknown>;
    const actsRaw = rec.acts && typeof rec.acts === 'object' ? (rec.acts as Record<string, unknown>) : {};
    const seqsRaw =
        rec.sequences && typeof rec.sequences === 'object'
            ? (rec.sequences as Record<string, unknown>)
            : {};
    const scenesRaw =
        rec.scenes && typeof rec.scenes === 'object' ? (rec.scenes as Record<string, unknown>) : {};

    const acts: Record<string, StoryMemoryActEntry> = {};
    Object.entries(actsRaw).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const entry = v as Record<string, unknown>;
        const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
        if (!summary) return;
        acts[k] = {
            actNumber: Number(entry.actNumber) || parseInt(k, 10) || 1,
            title: typeof entry.title === 'string' ? entry.title : '',
            summary,
            updatedAt: Number(entry.updatedAt) || 0
        };
    });

    const sequences: Record<string, StoryMemorySequenceEntry> = {};
    Object.entries(seqsRaw).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const entry = v as Record<string, unknown>;
        const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
        if (!summary) return;
        const seqIdx = Number.isFinite(Number(entry.seqIdx)) ? Number(entry.seqIdx) : parseInt(k, 10) || 0;
        const seqNumber = Number(entry.seqNumber) || seqIdx + 1;
        sequences[k] = {
            seqIdx,
            seqNumber,
            parentAct: Number(entry.parentAct) || actForSequence(seqNumber),
            title: typeof entry.title === 'string' ? entry.title : '',
            summary,
            sceneCount: Number(entry.sceneCount) || 0,
            updatedAt: Number(entry.updatedAt) || 0
        };
    });

    const scenes: Record<string, StoryMemorySceneEntry> = {};
    Object.entries(scenesRaw).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const entry = v as Record<string, unknown>;
        const synopsis = typeof entry.synopsis === 'string' ? sanitizeScenePlotDelta(entry.synopsis) : '';
        if (!synopsis) return;
        const [rawSeq, rawSc] = k.split('-').map((n) => parseInt(n, 10));
        const seqIdx = Number.isFinite(Number(entry.seqIdx)) ? Number(entry.seqIdx) : Number.isFinite(rawSeq) ? rawSeq : 0;
        const sceneIdx = Number.isFinite(Number(entry.sceneIdx))
            ? Number(entry.sceneIdx)
            : Number.isFinite(rawSc)
              ? rawSc
              : 0;
        scenes[k] = {
            key: typeof entry.key === 'string' && entry.key ? entry.key : k,
            seqIdx,
            sceneIdx,
            sceneNumber:
                typeof entry.sceneNumber === 'string' && entry.sceneNumber
                    ? entry.sceneNumber
                    : `${seqIdx + 1}.${sceneIdx + 1}`,
            title: typeof entry.title === 'string' ? entry.title : `Scene ${seqIdx + 1}.${sceneIdx + 1}`,
            synopsis,
            updatedAt: Number(entry.updatedAt) || 0
        };
    });

    const result: StoryMemory = { acts, sequences, scenes };
    if (typeof rec.lastHandoffDossier === 'string' && rec.lastHandoffDossier.trim()) {
        result.lastHandoffDossier = rec.lastHandoffDossier.trim();
    }
    if (typeof rec.manualBaseText === 'string' && rec.manualBaseText.trim()) {
        result.manualBaseText = rec.manualBaseText.trim();
    }
    return result;
}

/**
 * Strips Continuity Bridge terminal spatial/interaction tags, stray XML wrappers,
 * and markdown headers so stored synopses remain pure narrative plot deltas.
 */
export function sanitizeScenePlotDelta(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    const cleanedLines = raw
        .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:xml|markdown|md)?/gi, '').replace(/```/g, ''))
        .replace(/<\/?(?:response|story_so_far|compressed_sequence_summary|compressed_summary|synopsis|scene_synopsis)[^>]*>/gi, '')
        .split(/\r?\n/)
        .filter((line) => !/^\s*(?:[-*•]\s*)?\[TERMINAL SPATIAL\s*&?\s*INTERACTION STATE\]\s*:?/i.test(line))
        .filter((line) => !/^\s*(?:[-*•]\s*)?\[Immediate Preceding Scene Handoff[^\]]*\]\s*:?/i.test(line))
        .map((line) => line.replace(/^#{1,6}\s+/, '').trim());

    return cleanedLines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Extracts drafted prose text from a `story.prose[key]` slot. */
export function extractProseText(entry: unknown): string {
    if (!entry) return '';
    if (typeof entry === 'string') return entry.trim();
    if (typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const candidate = rec.final || rec.prose || rec.text || rec.draft;
        return typeof candidate === 'string' ? candidate.trim() : '';
    }
    return '';
}

/** Resolves a sequence's parent Act number consistently with the 8-sequence model. */
export function resolveSequenceParentAct(
    seq: Record<string, unknown> | undefined,
    seqIdx: number
): number {
    const seqNumber = Number(seq?.number) || seqIdx + 1;
    const fallback = actForSequence(seqNumber);
    return parseActNumber(seq?.parent_act != null ? seq.parent_act : fallback, fallback);
}

/**
 * Deterministic zero-LLM fallback scene delta built from the scene blueprint (and optional
 * prose excerpt) when Archivist returns `{}` or omits `scene_synopsis`.
 */
export function buildFallbackSceneDelta(
    scene: Record<string, unknown>,
    seqIdx: number,
    sceneIdx: number,
    proseText?: string
): string {
    const sceneNumber =
        typeof scene?.number === 'string' || typeof scene?.number === 'number'
            ? String(scene.number).trim()
            : `${seqIdx + 1}.${sceneIdx + 1}`;
    const title = typeof scene?.title === 'string' && scene.title.trim() ? scene.title.trim() : `Scene ${sceneNumber}`;
    const pov =
        typeof scene?.pov_character === 'string' && scene.pov_character.trim()
            ? scene.pov_character.trim()
            : '';
    const objective =
        (typeof scene?.objective === 'string' && scene.objective.trim()) ||
        (typeof scene?.goal === 'string' && scene.goal.trim()) ||
        (typeof scene?.scene_objective === 'string' && scene.scene_objective.trim()) ||
        '';
    const exitHook =
        (typeof scene?.exit_hook === 'string' && scene.exit_hook.trim()) ||
        (typeof scene?.outcome === 'string' && scene.outcome.trim()) ||
        '';

    let valueShiftNote = '';
    const vs = scene?.value_shift;
    if (typeof vs === 'string' && vs.trim()) {
        valueShiftNote = vs.trim();
    } else if (vs && typeof vs === 'object') {
        const vsRec = vs as Record<string, unknown>;
        const start = typeof vsRec.start_state === 'string' ? vsRec.start_state.trim() : '';
        const end = typeof vsRec.end_state === 'string' ? vsRec.end_state.trim() : '';
        if (start && end) valueShiftNote = `${start} to ${end}`;
    }

    const parts: string[] = [];
    if (pov && objective) {
        parts.push(`In "${title}" (Scene ${sceneNumber}), ${pov} pursues the objective: ${objective.replace(/[.]+$/, '')}.`);
    } else if (objective) {
        parts.push(`In "${title}" (Scene ${sceneNumber}), the action centers on: ${objective.replace(/[.]+$/, '')}.`);
    } else {
        parts.push(`In "${title}" (Scene ${sceneNumber}), the dramatized events advance the active sequence.`);
    }

    if (valueShiftNote) {
        parts.push(`Dramatic shift: ${valueShiftNote.replace(/[.]+$/, '')}.`);
    }
    if (exitHook) {
        parts.push(`Outcome: ${exitHook.replace(/[.]+$/, '')}.`);
    } else if (proseText && proseText.trim().length > 0 && !objective) {
        const snippet = proseText.trim().replace(/\s+/g, ' ').slice(0, 140).trim();
        parts.push(`Dramatized beat: ${snippet}${proseText.trim().length > 140 ? '...' : ''}`);
    }

    return sanitizeScenePlotDelta(parts.join(' '));
}

/**
 * Inserts or overwrites a keyed scene delta in `story_memory` and invalidates any stale
 * sequence/act summaries that depended on that sequence when a scene is rewritten or added.
 */
export function upsertSceneMemoryDelta(
    memoryInput: unknown,
    entry: Omit<StoryMemorySceneEntry, 'updatedAt'> & {
        parentAct: number;
        totalScenesInSeq: number;
    }
): StoryMemory {
    const memory = ensureStoryMemory(memoryInput);
    const cleanSynopsis = sanitizeScenePlotDelta(entry.synopsis);
    if (!cleanSynopsis) return memory;

    const nextScenes: Record<string, StoryMemorySceneEntry> = {
        ...memory.scenes,
        [entry.key]: {
            key: entry.key,
            seqIdx: entry.seqIdx,
            sceneIdx: entry.sceneIdx,
            sceneNumber: entry.sceneNumber,
            title: entry.title,
            synopsis: cleanSynopsis,
            updatedAt: Date.now()
        }
    };

    const nextSequences = { ...memory.sequences };
    const nextActs = { ...memory.acts };
    const seqKey = String(entry.seqIdx);
    const actKey = String(entry.parentAct);

    // If this sequence was already compressed (e.g., user force-rewrote a scene or added a scene),
    // invalidate the sequence summary and its parent act summary so they re-compress cleanly.
    if (nextSequences[seqKey] || nextActs[actKey]) {
        delete nextSequences[seqKey];
        delete nextActs[actKey];
    }

    return {
        ...memory,
        acts: nextActs,
        sequences: nextSequences,
        scenes: nextScenes
    };
}

/**
 * Prunes all `story_memory` entries belonging to `seqIdx` and invalidates its parent Act
 * summary (used when re-weaving scenes for a sequence).
 */
export function pruneStoryMemoryForSequence(
    memoryInput: unknown,
    seqIdx: number,
    parentAct: number
): StoryMemory {
    const memory = ensureStoryMemory(memoryInput);
    const prefix = `${seqIdx}-`;
    const nextScenes: Record<string, StoryMemorySceneEntry> = {};
    Object.entries(memory.scenes).forEach(([k, v]) => {
        if (!k.startsWith(prefix)) {
            nextScenes[k] = v;
        }
    });
    const nextSequences = { ...memory.sequences };
    delete nextSequences[String(seqIdx)];

    const nextActs = { ...memory.acts };
    delete nextActs[String(parentAct)];

    return {
        ...memory,
        acts: nextActs,
        sequences: nextSequences,
        scenes: nextScenes
    };
}

/** Helper to read the scene array for a sequence index from `story.scenes`. */
function getSeqScenesFromStory(story: Record<string, unknown>, seqIdx: number): Record<string, unknown>[] {
    const scenesMap =
        story?.scenes && typeof story.scenes === 'object'
            ? (story.scenes as Record<string, unknown>)
            : {};
    const raw =
        scenesMap[`${seqIdx}`] ||
        scenesMap[`${seqIdx}-0`] ||
        scenesMap[`0-${seqIdx}`];
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

/** Checks whether every planned scene in `seqIdx` currently has drafted prose. */
export function isSequenceFullyDrafted(story: Record<string, unknown>, seqIdx: number): boolean {
    const seqScenes = getSeqScenesFromStory(story, seqIdx);
    if (seqScenes.length === 0) return false;
    const proseMap =
        story?.prose && typeof story.prose === 'object'
            ? (story.prose as Record<string, unknown>)
            : {};
    for (let sIdx = 0; sIdx < seqScenes.length; sIdx++) {
        const proseEntry = proseMap[`${seqIdx}-${sIdx}`] || proseMap[`${seqIdx}-0-${sIdx}`];
        if (!extractProseText(proseEntry)) {
            return false;
        }
    }
    return true;
}

/**
 * Finds sequence indices whose planned scenes are all drafted but lack an up-to-date
 * compressed sequence summary in `story_memory.sequences`.
 */
export function findCompletedUnsummarizedSequences(
    story: Record<string, unknown>,
    memoryInput: unknown
): number[] {
    const memory = ensureStoryMemory(memoryInput);
    const sequences = Array.isArray(story?.sequences) ? (story.sequences as Record<string, unknown>[]) : [];
    const pending: number[] = [];

    for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
        const seqScenes = getSeqScenesFromStory(story, seqIdx);
        if (seqScenes.length === 0) continue;
        if (!isSequenceFullyDrafted(story, seqIdx)) continue;

        const existing = memory.sequences[String(seqIdx)];
        if (!existing || !existing.summary || existing.sceneCount !== seqScenes.length) {
            pending.push(seqIdx);
        }
    }
    return pending;
}

/**
 * Finds Act numbers whose member sequences are all drafted and summarized in
 * `story_memory.sequences`, but which do not yet have a locked summary in `story_memory.acts`.
 */
export function findCompletedUnsummarizedActs(
    story: Record<string, unknown>,
    memoryInput: unknown
): number[] {
    const memory = ensureStoryMemory(memoryInput);
    const sequences = Array.isArray(story?.sequences) ? (story.sequences as Record<string, unknown>[]) : [];
    if (sequences.length === 0) return [];

    const seqsByAct = new Map<number, number[]>();
    sequences.forEach((seq, seqIdx) => {
        const actNum = resolveSequenceParentAct(seq, seqIdx);
        const list = seqsByAct.get(actNum) || [];
        list.push(seqIdx);
        seqsByAct.set(actNum, list);
    });

    const pendingActs: number[] = [];
    for (const [actNum, seqIndices] of seqsByAct.entries()) {
        if (seqIndices.length === 0) continue;
        if (memory.acts[String(actNum)]?.summary) continue;

        const allSequencesSummarized = seqIndices.every((seqIdx) => {
            if (!isSequenceFullyDrafted(story, seqIdx)) return false;
            const seqScenes = getSeqScenesFromStory(story, seqIdx);
            const seqSummary = memory.sequences[String(seqIdx)];
            return Boolean(seqSummary?.summary && seqSummary.sceneCount === seqScenes.length);
        });
        if (allSequencesSummarized) {
            pendingActs.push(actNum);
        }
    }

    return pendingActs.sort((a, b) => a - b);
}

/**
 * Deterministically renders `story.story_so_far` from the Telescoping Pyramid (`StoryMemory`):
 * - Completed Acts render as `[Act N — Title]: <summary>` (hiding child sequences/scenes).
 * - Completed Sequences in the active Act render as `[Sequence K — Title]: <summary>` (hiding child scenes).
 * - Drafted scenes in the currently in-progress Sequence render as concise `- Scene K.S (Title): <synopsis>` bullets.
 */
export function renderStorySoFar(memoryInput: unknown, story: Record<string, unknown>): string {
    const memory = ensureStoryMemory(memoryInput);
    const proseMap =
        story?.prose && typeof story.prose === 'object'
            ? (story.prose as Record<string, unknown>)
            : {};

    const draftedProseKeys = new Set<string>();
    Object.entries(proseMap).forEach(([key, val]) => {
        if (extractProseText(val)) {
            draftedProseKeys.add(key);
        }
    });

    if (draftedProseKeys.size === 0) {
        return '';
    }

    const actsArr = Array.isArray(story?.acts) ? (story.acts as Record<string, unknown>[]) : [];
    const sequencesArr = Array.isArray(story?.sequences)
        ? (story.sequences as Record<string, unknown>[])
        : [];

    const actTitleByNum = new Map<number, string>();
    actsArr.forEach((act, idx) => {
        const actNum = parseActNumber(act?.number != null ? act.number : idx + 1, idx + 1);
        const title = typeof act?.title === 'string' ? act.title.trim() : '';
        if (title) actTitleByNum.set(actNum, title);
    });

    // Collect all act numbers referenced by sequences, acts memory, or scene memory.
    const actSeqMap = new Map<number, number[]>();
    sequencesArr.forEach((seq, seqIdx) => {
        const actNum = resolveSequenceParentAct(seq, seqIdx);
        const arr = actSeqMap.get(actNum) || [];
        arr.push(seqIdx);
        actSeqMap.set(actNum, arr);
    });

    // Ensure scene entries whose sequence isn't in `sequencesArr` (e.g., partial fixtures) still render.
    const orphanSeqIndices = new Set<number>();
    Object.values(memory.scenes).forEach((sc) => {
        if (sc.seqIdx >= sequencesArr.length) {
            orphanSeqIndices.add(sc.seqIdx);
        }
    });
    orphanSeqIndices.forEach((seqIdx) => {
        const actNum = actForSequence(seqIdx + 1);
        const arr = actSeqMap.get(actNum) || [];
        if (!arr.includes(seqIdx)) {
            arr.push(seqIdx);
            actSeqMap.set(actNum, arr);
        }
    });

    Object.keys(memory.acts).forEach((k) => {
        const actNum = parseInt(k, 10);
        if (Number.isFinite(actNum) && !actSeqMap.has(actNum)) {
            actSeqMap.set(actNum, []);
        }
    });

    const sortedActNums = Array.from(actSeqMap.keys()).sort((a, b) => a - b);
    const sections: string[] = [];

    if (
        memory.manualBaseText &&
        Object.keys(memory.acts).length === 0 &&
        Object.keys(memory.sequences).length === 0
    ) {
        const cleanManual = sanitizeScenePlotDelta(memory.manualBaseText);
        if (cleanManual) sections.push(cleanManual);
    }

    for (const actNum of sortedActNums) {
        const actEntry = memory.acts[String(actNum)];
        if (actEntry?.summary) {
            const actTitle = actTitleByNum.get(actNum) || actEntry.title;
            const heading = actTitle ? `[Act ${actNum} — ${actTitle}]:` : `[Act ${actNum}]:`;
            sections.push(`${heading}\n${actEntry.summary.trim()}`);
            continue;
        }

        const seqIndices = (actSeqMap.get(actNum) || []).slice().sort((a, b) => a - b);
        for (const seqIdx of seqIndices) {
            const seqObj = sequencesArr[seqIdx];
            const seqNum = Number(seqObj?.number) || seqIdx + 1;
            const seqTitle = typeof seqObj?.title === 'string' ? seqObj.title.trim() : '';
            const seqEntry = memory.sequences[String(seqIdx)];

            if (seqEntry?.summary && isSequenceFullyDrafted(story, seqIdx)) {
                const resolvedTitle = seqTitle || seqEntry.title;
                const heading = resolvedTitle
                    ? `[Sequence ${seqNum} — ${resolvedTitle}]:`
                    : `[Sequence ${seqNum}]:`;
                sections.push(`${heading}\n${seqEntry.summary.trim()}`);
                continue;
            }

            const sceneEntries = Object.values(memory.scenes)
                .filter((sc) => {
                    if (sc.seqIdx !== seqIdx) return false;
                    return (
                        draftedProseKeys.has(sc.key) ||
                        draftedProseKeys.has(`${sc.seqIdx}-0-${sc.sceneIdx}`)
                    );
                })
                .sort((a, b) => a.sceneIdx - b.sceneIdx);

            if (sceneEntries.length > 0) {
                const heading = seqTitle
                    ? `[Sequence ${seqNum} — ${seqTitle} — Recent Scenes]:`
                    : `[Sequence ${seqNum} — Recent Scenes]:`;
                const bullets = sceneEntries.map(
                    (sc) => `- Scene ${sc.sceneNumber} (${sc.title}): ${sc.synopsis}`
                );
                sections.push(`${heading}\n${bullets.join('\n')}`);
            }
        }
    }

    if (sections.length === 0 && memory.manualBaseText) {
        return sanitizeScenePlotDelta(memory.manualBaseText);
    }

    return sections.join('\n\n').trim();
}
