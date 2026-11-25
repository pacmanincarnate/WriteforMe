/**
 * @module domain/story/outlineExpansion
 * Expand / collapse state for sequences in the outline, and removal of a lore item.
 */

import { actForSequence, parseActNumber } from './structure';

export type ExpandedSequences = Record<string, boolean>;

interface OutlineStory {
    acts?: Array<{ number?: unknown } | null | undefined>;
    sequences?: Array<{ number?: number | string | null; parent_act?: unknown }>;
}

/** Indices of the sequences that belong to the act at `actIdx` (by `parent_act`, else by position). */
export function sequenceIndicesForAct(story: OutlineStory, actIdx: number): number[] {
    const act = story.acts?.[actIdx];
    const actNumber = (act && parseActNumber(act.number, actIdx + 1)) || actIdx + 1;
    const indices: number[] = [];
    (story.sequences || []).forEach((seq, sIdx) => {
        const seqNum = Number(seq.number != null ? seq.number : sIdx + 1);
        const fallbackAct = actForSequence(seqNum);
        if (parseActNumber(seq.parent_act != null ? seq.parent_act : fallbackAct, fallbackAct) === actNumber) {
            indices.push(sIdx);
        }
    });
    return indices;
}

/** Sets the given sequences to expanded or collapsed. */
export function setSequencesExpanded(
    expanded: ExpandedSequences,
    seqIndices: ReadonlyArray<number | string>,
    expand: boolean
): ExpandedSequences {
    const next = { ...expanded };
    seqIndices.forEach((sIdx) => {
        next[sIdx] = expand;
    });
    return next;
}

export function toggleSequenceExpanded(expanded: ExpandedSequences, seqIdx: number | string): ExpandedSequences {
    return { ...expanded, [seqIdx]: !expanded[seqIdx] };
}

/** Removes the lore item at `index` from world memory. */
export function removeLoreAt<T extends { lore?: unknown[] }>(story: T, index: number): T {
    const lore = [...(story.lore || [])];
    lore.splice(index, 1);
    return { ...story, lore };
}
