/**
 * @module hooks/usePromptOverrides
 * The user's reworded prompts: read from storage, checked on save, written back, and applied
 * to the live prompt registry so the next pipeline call uses them.
 */

import { useCallback, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '@/config';
import {
    applyPromptOverrides,
    listEditablePrompts,
    parsePromptOverrides,
    resetPromptOverride,
    savePromptOverride,
    type EditablePromptView,
    type PromptOverrides
} from '@/prompts/overrides';
import { safeLocalStorageSet } from '@/utils';

export const PROMPT_OVERRIDES_STORAGE_KEY = STORAGE_KEYS.promptOverridesV1;

function readStored(): PromptOverrides {
    try {
        return parsePromptOverrides(localStorage.getItem(PROMPT_OVERRIDES_STORAGE_KEY));
    } catch {
        return {};
    }
}

export interface UsePromptOverridesResult {
    prompts: EditablePromptView[];
    /** Saves a wording. Returns the reason when it is refused. */
    savePrompt: (key: string, wording: string) => string | null;
    resetPrompt: (key: string) => void;
}

export function usePromptOverrides(): UsePromptOverridesResult {
    const [overrides, setOverrides] = useState<PromptOverrides>(readStored);

    const commit = useCallback((next: PromptOverrides) => {
        setOverrides(next);
        safeLocalStorageSet(PROMPT_OVERRIDES_STORAGE_KEY, next);
        applyPromptOverrides(next);
    }, []);

    const savePrompt = useCallback(
        (key: string, wording: string): string | null => {
            const result = savePromptOverride(overrides, key, wording);
            if (!result.ok) return result.error;
            commit(result.overrides);
            return null;
        },
        [overrides, commit]
    );

    const resetPrompt = useCallback(
        (key: string) => commit(resetPromptOverride(overrides, key)),
        [overrides, commit]
    );

    const prompts = useMemo(() => listEditablePrompts(overrides), [overrides]);
    return { prompts, savePrompt, resetPrompt };
}
