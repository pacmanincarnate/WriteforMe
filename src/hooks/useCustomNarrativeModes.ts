/**
 * @module hooks/useCustomNarrativeModes
 * User-defined narrative modes (Phase 6E-3): the saved modes with their localStorage
 * persistence, the Settings form state, the merged built-in + custom mode map, and the
 * add / edit / rename / delete handlers. Validation and the rename cascade are pure functions in
 * `@/domain/story/customNarrativeModes`.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    NARRATIVE_MODES,
    NARRATIVE_MODE_ICONS,
    STORAGE_KEYS,
    type NarrativeModeDefinition
} from '@/config';
import {
    removeCustomMode,
    renameNarrativeModeInScenes,
    upsertCustomMode,
    validateCustomModeDraft,
    type CustomNarrativeModes
} from '@/domain/story';
import type { SceneBlueprint } from '@/types';
import { safeLocalStorageSet } from '@/utils';

export const CUSTOM_MODES_STORAGE_KEY = STORAGE_KEYS.customModes;
const DEFAULT_MODE_ICON = 'tag';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type ModeStory = { scenes?: Record<string, SceneBlueprint[]> };

export interface UseCustomNarrativeModesParams<TStory extends ModeStory = ModeStory> {
    /** Applies a story update; used to cascade a renamed mode id through scene blueprints. */
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    showToast: (message: string, variant?: ToastVariant) => void;
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void | Promise<void>;
    }) => void;
    /** Shows a blocking validation message. Defaults to `window.alert`. */
    notifyAlert?: (message: string) => void;
}

export interface UseCustomNarrativeModesResult {
    customModes: CustomNarrativeModes;
    setCustomModes: Dispatch<SetStateAction<CustomNarrativeModes>>;
    /** Built-in modes overlaid with the custom ones. */
    allNarrativeModes: Record<string, NarrativeModeDefinition>;
    getModeIcon: (modeId: string) => string;
    editingModeId: string | null;
    newModeId: string;
    setNewModeId: Dispatch<SetStateAction<string>>;
    newModeContext: string;
    setNewModeContext: Dispatch<SetStateAction<string>>;
    newModePrompt: string;
    setNewModePrompt: Dispatch<SetStateAction<string>>;
    newModeIcon: string;
    setNewModeIcon: Dispatch<SetStateAction<string>>;
    isIconPickerOpen: boolean;
    setIsIconPickerOpen: Dispatch<SetStateAction<boolean>>;
    handleStartEditCustomMode: (mode: NarrativeModeDefinition) => void;
    handleCancelEditCustomMode: () => void;
    handleSaveCustomMode: () => void;
    handleDeleteCustomMode: (modeId: string) => void;
}

function readStoredCustomModes(): CustomNarrativeModes {
    const saved = localStorage.getItem(CUSTOM_MODES_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as CustomNarrativeModes) : {};
}

export function useCustomNarrativeModes<TStory extends ModeStory = ModeStory>({
    setStory,
    showToast,
    requestConfirm,
    notifyAlert
}: UseCustomNarrativeModesParams<TStory>): UseCustomNarrativeModesResult {
    const [customModes, setCustomModes] = useState<CustomNarrativeModes>(readStoredCustomModes);
    const [editingModeId, setEditingModeId] = useState<string | null>(null);
    const [newModeId, setNewModeId] = useState('');
    const [newModeContext, setNewModeContext] = useState('');
    const [newModePrompt, setNewModePrompt] = useState('');
    const [newModeIcon, setNewModeIcon] = useState(DEFAULT_MODE_ICON);
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

    useEffect(() => {
        safeLocalStorageSet(CUSTOM_MODES_STORAGE_KEY, customModes);
    }, [customModes]);

    const allNarrativeModes = useMemo(() => ({ ...NARRATIVE_MODES, ...customModes }), [customModes]);

    const getModeIcon = (modeId: string): string => {
        const modeObj = allNarrativeModes[modeId];
        if (modeObj && modeObj.icon) return modeObj.icon;
        return NARRATIVE_MODE_ICONS[modeId] || DEFAULT_MODE_ICON;
    };

    const alertUser = (message: string): void => {
        if (notifyAlert) notifyAlert(message);
        else if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    };

    const handleStartEditCustomMode = (mode: NarrativeModeDefinition): void => {
        setEditingModeId(mode.id);
        setNewModeId(mode.id);
        setNewModeContext(mode.context || '');
        setNewModePrompt(mode.prompt || '');
        setNewModeIcon(mode.icon || DEFAULT_MODE_ICON);
    };

    const handleCancelEditCustomMode = (): void => {
        setEditingModeId(null);
        setNewModeId('');
        setNewModeContext('');
        setNewModePrompt('');
        setNewModeIcon(DEFAULT_MODE_ICON);
    };

    const handleSaveCustomMode = (): void => {
        const result = validateCustomModeDraft(
            { id: newModeId, context: newModeContext, prompt: newModePrompt, icon: newModeIcon },
            customModes,
            editingModeId
        );
        if (!result.ok) {
            alertUser(result.error);
            return;
        }
        const { mode } = result;

        if (editingModeId && editingModeId !== mode.id) {
            // Renamed: replace the entry and repoint every scene that used the old id.
            const previousId = editingModeId;
            setCustomModes((prev) => upsertCustomMode(prev, mode, previousId));
            setStory((prev) => renameNarrativeModeInScenes(prev, previousId, mode.id));
            showToast(`Custom mode updated to ${mode.id}!`, 'success');
        } else {
            setCustomModes((prev) => upsertCustomMode(prev, mode));
            showToast(
                editingModeId ? `Custom mode ${mode.id} updated!` : `Custom mode ${mode.id} added!`,
                'success'
            );
        }

        handleCancelEditCustomMode();
    };

    const handleDeleteCustomMode = (modeId: string): void => {
        requestConfirm({
            title: `Delete Custom Mode "${modeId}"?`,
            message: 'Are you sure you want to delete this custom narrative mode?',
            confirmLabel: 'Delete Mode',
            danger: true,
            onConfirm: () => {
                setCustomModes((prev) => removeCustomMode(prev, modeId));
                if (editingModeId === modeId) {
                    handleCancelEditCustomMode();
                }
                showToast(`Custom mode ${modeId} deleted.`, 'info');
            }
        });
    };

    return {
        customModes,
        setCustomModes,
        allNarrativeModes,
        getModeIcon,
        editingModeId,
        newModeId,
        setNewModeId,
        newModeContext,
        setNewModeContext,
        newModePrompt,
        setNewModePrompt,
        newModeIcon,
        setNewModeIcon,
        isIconPickerOpen,
        setIsIconPickerOpen,
        handleStartEditCustomMode,
        handleCancelEditCustomMode,
        handleSaveCustomMode,
        handleDeleteCustomMode
    };
}
