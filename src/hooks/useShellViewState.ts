/**
 * @module hooks/useShellViewState
 * Small pieces of view state the shell hands to more than one view.
 */

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { generateRandomArchetypes, type ArchetypeOption } from '@/config';
import { safeLocalStorageSet } from '@/utils';

type Setter<T> = Dispatch<SetStateAction<T>>;

export const NARRATIVE_LENSES_STORAGE_KEY = 'ellipsisprose_enable_narrative_lenses_v2';
/** Older builds read this key; it is still written so a downgrade keeps the preference. */
export const NARRATIVE_LENSES_LEGACY_STORAGE_KEY = 'ellipsisprose_enable_narrative_lenses';

/**
 * Master toggle for Narrative Lenses. On by default, so narrative styles shape scene drafting
 * unless the user turned them off.
 */
export function useNarrativeLensesToggle(): [boolean, Setter<boolean>] {
    const [enabled, setEnabled] = useState(() => {
        const stored = localStorage.getItem(NARRATIVE_LENSES_STORAGE_KEY);
        return stored !== null ? stored === 'true' : true;
    });
    useEffect(() => {
        safeLocalStorageSet(NARRATIVE_LENSES_STORAGE_KEY, enabled);
        safeLocalStorageSet(NARRATIVE_LENSES_LEGACY_STORAGE_KEY, enabled);
    }, [enabled]);
    return [enabled, setEnabled];
}

/** Random character archetypes offered in Setup; drawn once per app start, redrawn on request. */
export function useArchetypeOptions(count = 20): [ArchetypeOption[], Setter<ArchetypeOption[]>] {
    const [options, setOptions] = useState<ArchetypeOption[]>([]);
    useEffect(() => {
        setOptions(generateRandomArchetypes(count));
    }, [count]);
    return [options, setOptions];
}

export interface SettingsDisclosureParams {
    reviewModel?: unknown;
    proseModel?: unknown;
    reviewProvider?: unknown;
    proseProvider?: unknown;
}

export interface UseSettingsDisclosuresResult {
    showAdvancedModelRouting: boolean;
    setShowAdvancedModelRouting: Setter<boolean>;
    showOtherApiKeys: boolean;
    setShowOtherApiKeys: Setter<boolean>;
}

/** True when any per-role model or provider override is set, so its section should start open. */
export function hasModelRoutingOverrides(params: SettingsDisclosureParams): boolean {
    return [params.reviewModel, params.proseModel, params.reviewProvider, params.proseProvider].some(
        (value) => typeof value === 'string' && value.length > 0
    );
}

/** Which collapsible Settings sections are open. Decided once, from the settings at first render. */
export function useSettingsDisclosures(params: SettingsDisclosureParams): UseSettingsDisclosuresResult {
    const [showAdvancedModelRouting, setShowAdvancedModelRouting] = useState(() =>
        hasModelRoutingOverrides(params)
    );
    const [showOtherApiKeys, setShowOtherApiKeys] = useState(false);
    return { showAdvancedModelRouting, setShowAdvancedModelRouting, showOtherApiKeys, setShowOtherApiKeys };
}

export interface UseAudioFollowStateResult {
    /** Whether the reader keeps scrolling to the line being spoken. */
    isFollowingAudio: boolean;
    setIsFollowingAudio: Setter<boolean>;
    isFollowingAudioRef: MutableRefObject<boolean>;
    /** Bumped to ask the reader to jump back to the spoken line. */
    returnToAudioNonce: number;
    setReturnToAudioNonce: Setter<number>;
}

export function useAudioFollowState(): UseAudioFollowStateResult {
    const [isFollowingAudio, setIsFollowingAudio] = useState(true);
    const isFollowingAudioRef = useRef(true);
    const [returnToAudioNonce, setReturnToAudioNonce] = useState(0);
    return { isFollowingAudio, setIsFollowingAudio, isFollowingAudioRef, returnToAudioNonce, setReturnToAudioNonce };
}
