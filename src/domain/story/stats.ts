/**
 * @module domain/story/stats
 * Story progress, scene completion, word count, and reading-time statistics.
 */

import type { CastMember, ProseEntry, SceneBlueprint, Sequence } from '@/types';
import { actForSequence } from './structure';

export interface SequenceStatusItem {
    index: number;
    number: number;
    title: string;
    act: number;
    total: number;
    completed: number;
    drafted: number;
    isComplete: boolean;
    hasProgress: boolean;
}

export interface StoryStats {
    words: number;
    readingTimeMin: number;
    completedScenes: number;
    draftedScenes: number;
    totalScenes: number;
    completionPct: number;
    actCount: number;
    seqCount: number;
    castCount: number;
    loreCount: number;
    sequencesStatus: SequenceStatusItem[];
    castAvatars: CastMember[];
}

export interface StoryStatsInput {
    acts?: unknown[];
    sequences?: Partial<Sequence>[];
    cast?: CastMember[];
    lore?: unknown[];
    scenes?: Record<string, SceneBlueprint[]>;
    prose?: Record<string, ProseEntry | string>;
    chapters?: Record<string, unknown[]>;
}

/** Computes aggregate word count, reading time, and per-sequence completion metrics for a story. */
export function calculateStoryStats(story: StoryStatsInput | null | undefined): StoryStats {
    if (!story || typeof story !== 'object') {
        return {
            words: 0,
            readingTimeMin: 0,
            completedScenes: 0,
            draftedScenes: 0,
            totalScenes: 0,
            completionPct: 0,
            actCount: 0,
            seqCount: 0,
            castCount: 0,
            loreCount: 0,
            sequencesStatus: [],
            castAvatars: []
        };
    }

    const actCount = Array.isArray(story.acts) ? story.acts.length : 0;
    const seqCount = Array.isArray(story.sequences) ? story.sequences.length : 0;
    const castCount = Array.isArray(story.cast) ? story.cast.length : 0;
    const loreCount = Array.isArray(story.lore) ? story.lore.length : 0;

    let totalScenes = 0;
    let completedScenes = 0;
    let draftedScenes = 0;
    let totalWords = 0;

    const sequencesStatus: SequenceStatusItem[] = [];
    const sequencesList = Array.isArray(story.sequences) ? story.sequences : [];

    for (let sq = 0; sq < (sequencesList.length || 8); sq++) {
        const seqInfo = sequencesList[sq] || {
            number: sq + 1,
            title: `Sequence ${sq + 1}`,
            parent_act: actForSequence(sq + 1)
        };
        const sceneList = story.scenes?.[`${sq}`] || [];
        const seqTotal = Array.isArray(sceneList) ? sceneList.length : 0;
        let seqCompleted = 0;
        let seqDrafted = 0;

        if (Array.isArray(sceneList)) {
            sceneList.forEach((_sc, scIdx) => {
                totalScenes++;
                const beatKey = `${sq}-${scIdx}`;
                const rawProse = story.prose?.[beatKey];
                const proseObj =
                    rawProse && typeof rawProse === 'object' ? rawProse : null;
                if (proseObj) {
                    if (proseObj.final) {
                        completedScenes++;
                        seqCompleted++;
                        const text = String(proseObj.final || '');
                        const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
                        totalWords += wc;
                    } else if (proseObj.draft) {
                        draftedScenes++;
                        seqDrafted++;
                        const text = String(proseObj.draft || '');
                        const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
                        totalWords += wc;
                    }
                }
            });
        }

        sequencesStatus.push({
            index: sq,
            number: sq + 1,
            title: seqInfo.title || `Seq ${sq + 1}`,
            act: Number(seqInfo.parent_act) || actForSequence(sq + 1),
            total: seqTotal,
            completed: seqCompleted,
            drafted: seqDrafted,
            isComplete: seqTotal > 0 && seqCompleted === seqTotal,
            hasProgress: seqCompleted + seqDrafted > 0
        });
    }

    // Legacy fallback if scenes is empty but chapters exists
    if (totalScenes === 0 && story.chapters && typeof story.chapters === 'object') {
        Object.values(story.chapters).forEach((arr) => {
            if (Array.isArray(arr)) totalScenes += arr.length;
        });
    }

    const completionPct = totalScenes > 0 ? Math.round((completedScenes / totalScenes) * 100) : 0;
    const readingTimeMin = Math.ceil(totalWords / 225);
    const castAvatars = Array.isArray(story.cast) ? story.cast.slice(0, 5) : [];

    return {
        words: totalWords,
        readingTimeMin,
        completedScenes,
        draftedScenes,
        totalScenes,
        completionPct,
        actCount: actCount || 3,
        seqCount: seqCount || 8,
        castCount,
        loreCount,
        sequencesStatus,
        castAvatars
    };
}
