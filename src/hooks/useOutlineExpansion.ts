/**
 * @module hooks/useOutlineExpansion
 * Which sequences are expanded in the outline (Phase 6E-3).
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    sequenceIndicesForAct,
    setSequencesExpanded,
    toggleSequenceExpanded,
    type ExpandedSequences
} from '@/domain/story';

export interface UseOutlineExpansionParams {
    story: Parameters<typeof sequenceIndicesForAct>[0];
}

export interface UseOutlineExpansionResult {
    expandedSequences: ExpandedSequences;
    setExpandedSequences: Dispatch<SetStateAction<ExpandedSequences>>;
    toggleSequence: (seqIdx: number) => void;
    /** Expands or collapses every sequence of an act, or exactly `targetSeqIndices` when given. */
    toggleAllSequencesInAct: (actIdx: number, expand?: boolean, targetSeqIndices?: number[] | null) => void;
}

export function useOutlineExpansion({ story }: UseOutlineExpansionParams): UseOutlineExpansionResult {
    const [expandedSequences, setExpandedSequences] = useState<ExpandedSequences>({});

    const toggleSequence = (seqIdx: number): void => {
        setExpandedSequences((prev) => toggleSequenceExpanded(prev, seqIdx));
    };

    const toggleAllSequencesInAct = (
        actIdx: number,
        expand = true,
        targetSeqIndices: number[] | null = null
    ): void => {
        const indices = Array.isArray(targetSeqIndices) ? targetSeqIndices : sequenceIndicesForAct(story, actIdx);
        setExpandedSequences((prev) => setSequencesExpanded(prev, indices, expand));
    };

    return { expandedSequences, setExpandedSequences, toggleSequence, toggleAllSequencesInAct };
}
