/**
 * @module hooks/usePersistedBoolean
 * A boolean preference kept in localStorage as the strings 'true' / 'false'.
 */

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Reads a stored boolean. Anything other than the opposite of the default counts as the default,
 * so a missing or unreadable key never flips a preference.
 */
export function readPersistedBoolean(key: string, defaultValue: boolean): boolean {
    try {
        const raw = localStorage.getItem(key);
        return defaultValue ? raw !== 'false' : raw === 'true';
    } catch {
        return defaultValue;
    }
}

/**
 * State for a boolean preference that is restored from `key` and written back on every change
 * (and once on mount). `label` only appears in the console warning when a write fails.
 */
export function usePersistedBoolean(
    key: string,
    defaultValue: boolean,
    label = key
): [boolean, Dispatch<SetStateAction<boolean>>] {
    const [value, setValue] = useState(() => readPersistedBoolean(key, defaultValue));
    useEffect(() => {
        try {
            localStorage.setItem(key, String(value));
        } catch (err) {
            console.warn(`Could not save ${label} preference:`, err);
        }
    }, [key, label, value]);
    return [value, setValue];
}
