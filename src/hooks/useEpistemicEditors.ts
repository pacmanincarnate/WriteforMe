/**
 * @module hooks/useEpistemicEditors
 * The GESM (epistemic graph) tab's UI state and manual editors (Phase 6E-3): viewer filters, the
 * proposition and belief modals, and save / delete / invalidate handlers. The graph edits are
 * pure functions in `@/domain/continuity/epistemicEditing`.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    deleteProposition,
    invalidateBelief,
    saveBelief,
    saveProposition,
    type BeliefDraft,
    type ContinuityStoryState,
    type EpistemicBeliefEdge,
    type PropositionDraft
} from '@/domain/continuity';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface PropositionModalState {
    isOpen: boolean;
    isNew: boolean;
    id: string;
    claim_text: string;
    subject_id: string;
    predicate: string;
    object_id: string;
    objective_truth: string;
    world_valid_from_scene: string;
    world_valid_to_scene: string;
}

export interface BeliefModalState {
    isOpen: boolean;
    isNew: boolean;
    holder_id: string;
    proposition_id: string;
    stance: string;
    confidence: number;
    source_type: string;
    source_agent_id: string;
    acquired_at_scene: string;
    invalidated_at_scene: string;
}

export interface UseEpistemicEditorsParams<TStory extends ContinuityStoryState = ContinuityStoryState> {
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    showToast: (message: string, variant?: ToastVariant) => void;
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void | Promise<void>;
    }) => void;
}

export interface UseEpistemicEditorsResult {
    epistemicViewTab: string;
    setEpistemicViewTab: Dispatch<SetStateAction<string>>;
    epistemicScrubberCoord: string;
    setEpistemicScrubberCoord: Dispatch<SetStateAction<string>>;
    epistemicFilterChar: string;
    setEpistemicFilterChar: Dispatch<SetStateAction<string>>;
    epistemicSearchQuery: string;
    setEpistemicSearchQuery: Dispatch<SetStateAction<string>>;
    editingPropModal: PropositionModalState;
    setEditingPropModal: Dispatch<SetStateAction<PropositionModalState>>;
    editingBeliefModal: BeliefModalState;
    setEditingBeliefModal: Dispatch<SetStateAction<BeliefModalState>>;
    handleSaveProposition: (propData: PropositionDraft) => void;
    handleDeleteProposition: (propId: string) => void;
    handleSaveBelief: (beliefData: BeliefDraft) => void;
    handleInvalidateBelief: (
        edge: Pick<EpistemicBeliefEdge, 'holder_id' | 'proposition_id' | 'acquired_at_scene'>,
        sceneCoord: string
    ) => void;
}

const CLOSED_PROPOSITION_MODAL: PropositionModalState = {
    isOpen: false,
    isNew: false,
    id: '',
    claim_text: '',
    subject_id: '',
    predicate: 'FACT',
    object_id: '',
    objective_truth: 'TRUE',
    world_valid_from_scene: '0.0',
    world_valid_to_scene: ''
};

const CLOSED_BELIEF_MODAL: BeliefModalState = {
    isOpen: false,
    isNew: false,
    holder_id: '',
    proposition_id: '',
    stance: 'BELIEVES_TRUE',
    confidence: 0.85,
    source_type: 'DIRECT_OBSERVATION',
    source_agent_id: '',
    acquired_at_scene: '1.1',
    invalidated_at_scene: ''
};

export function useEpistemicEditors<TStory extends ContinuityStoryState = ContinuityStoryState>({
    setStory,
    showToast,
    requestConfirm
}: UseEpistemicEditorsParams<TStory>): UseEpistemicEditorsResult {
    // Viewer state: 'gesm' | 'vault' | 'log' tab, timeline scrubber, character filter, search.
    const [epistemicViewTab, setEpistemicViewTab] = useState('gesm');
    const [epistemicScrubberCoord, setEpistemicScrubberCoord] = useState('1.1');
    const [epistemicFilterChar, setEpistemicFilterChar] = useState('ALL');
    const [epistemicSearchQuery, setEpistemicSearchQuery] = useState('');
    const [editingPropModal, setEditingPropModal] = useState<PropositionModalState>(CLOSED_PROPOSITION_MODAL);
    const [editingBeliefModal, setEditingBeliefModal] = useState<BeliefModalState>(CLOSED_BELIEF_MODAL);

    const handleSaveProposition = (propData: PropositionDraft): void => {
        setStory((prev) => saveProposition(prev, propData));
        setEditingPropModal((prev) => ({ ...prev, isOpen: false }));
        showToast('Proposition saved to Epistemic Graph.', 'success');
    };

    const handleDeleteProposition = (propId: string): void => {
        requestConfirm({
            title: `Delete Proposition "${propId}"?`,
            message: `Are you sure you want to delete proposition "${propId}" and its associated character beliefs?`,
            confirmLabel: 'Delete Proposition',
            danger: true,
            onConfirm: () => {
                setStory((prev) => deleteProposition(prev, propId));
                showToast(`Proposition "${propId}" deleted.`, 'info');
            }
        });
    };

    const handleSaveBelief = (beliefData: BeliefDraft): void => {
        setStory((prev) => saveBelief(prev, beliefData));
        setEditingBeliefModal((prev) => ({ ...prev, isOpen: false }));
        showToast('Character belief saved to Epistemic Graph.', 'success');
    };

    const handleInvalidateBelief: UseEpistemicEditorsResult['handleInvalidateBelief'] = (edge, sceneCoord) => {
        setStory((prev) => invalidateBelief(prev, edge, sceneCoord));
        showToast(`Belief invalidated at Scene ${sceneCoord}.`, 'info');
    };

    return {
        epistemicViewTab,
        setEpistemicViewTab,
        epistemicScrubberCoord,
        setEpistemicScrubberCoord,
        epistemicFilterChar,
        setEpistemicFilterChar,
        epistemicSearchQuery,
        setEpistemicSearchQuery,
        editingPropModal,
        setEditingPropModal,
        editingBeliefModal,
        setEditingBeliefModal,
        handleSaveProposition,
        handleDeleteProposition,
        handleSaveBelief,
        handleInvalidateBelief
    };
}
