/**
 * @module hooks/useShellModals
 * State and openers for three app-level dialogs: the generic text edit dialog, the escalation
 * intervention dialog and the failed-beat critique dialog. Extracted from the legacy shell in
 * Phase 7.
 */

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type Setter<T> = Dispatch<SetStateAction<T>>;

export interface EditModalState {
    isOpen: boolean;
    title: string;
    value: string;
    onConfirm: ((newValue: string) => void) | null;
}

export interface InterventionModalState {
    isOpen: boolean;
    tierName: string;
    deviationReasons: unknown[];
    rawOutput: string;
    /** Called with the user's choice, for example 'abort'. */
    onResolve: ((choice: string, payload?: unknown) => void) | null;
}

export interface CritiqueModalState {
    isOpen: boolean;
    beatNumber: number | string | null;
    critique: string;
}

export const NO_CRITIQUE_TEXT = 'No critique available.';

export interface UseShellModalsParams {
    showToast: (message: string, variant?: ToastVariant) => void;
}

export interface UseShellModalsResult {
    editingState: EditModalState;
    setEditingState: Setter<EditModalState>;
    interventionState: InterventionModalState;
    setInterventionState: Setter<InterventionModalState>;
    critiqueState: CritiqueModalState;
    setCritiqueState: Setter<CritiqueModalState>;
    /** Opens the edit dialog; confirming calls `onConfirm`, closes the dialog and toasts. */
    openEditModal: (title: string, value: string | null | undefined, onConfirm: (newValue: string) => void) => void;
    openCritiqueModal: (beatNumber: number | string | null, critique?: string | null) => void;
}

export function useShellModals({ showToast }: UseShellModalsParams): UseShellModalsResult {
    const [editingState, setEditingState] = useState<EditModalState>({
        isOpen: false,
        title: '',
        value: '',
        onConfirm: null
    });
    const [interventionState, setInterventionState] = useState<InterventionModalState>({
        isOpen: false,
        tierName: '',
        deviationReasons: [],
        rawOutput: '',
        onResolve: null
    });
    const [critiqueState, setCritiqueState] = useState<CritiqueModalState>({
        isOpen: false,
        beatNumber: null,
        critique: ''
    });

    const openCritiqueModal = useCallback<UseShellModalsResult['openCritiqueModal']>((beatNumber, critique) => {
        setCritiqueState({ isOpen: true, beatNumber, critique: critique || NO_CRITIQUE_TEXT });
    }, []);

    const openEditModal = useCallback<UseShellModalsResult['openEditModal']>(
        (title, value, onConfirm) => {
            setEditingState({
                isOpen: true,
                title,
                value: value || '',
                onConfirm: (newValue) => {
                    onConfirm(newValue);
                    setEditingState((prev) => ({ ...prev, isOpen: false }));
                    showToast(`${title} updated!`, 'success');
                }
            });
        },
        [showToast]
    );

    return {
        editingState,
        setEditingState,
        interventionState,
        setInterventionState,
        critiqueState,
        setCritiqueState,
        openEditModal,
        openCritiqueModal
    };
}
