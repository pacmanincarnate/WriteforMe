/**
 * @module hooks/useImageApiKeys
 * One saved image API key per cloud image provider, so switching provider never sends
 * one provider's key to another.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { STORAGE_KEYS } from '@/config';
import { safeLocalStorageSet } from '@/utils';

/** Where each cloud image provider's key is saved. ComfyUI is local and has none. */
export const IMAGE_API_KEY_STORAGE: Readonly<Record<string, string>> = {
    gemini: STORAGE_KEYS.imageApiKeyGemini,
    openrouter: STORAGE_KEYS.imageApiKeyOpenRouter,
    openai: STORAGE_KEYS.imageApiKeyOpenAi
};

type ImageApiKeys = Record<string, string>;

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/**
 * Loads the saved keys. Before keys were per provider there was a single one; it is handed
 * to the provider that was selected when it was saved (Gemini when that was ComfyUI), once.
 */
export function loadImageApiKeys(currentProvider: string): ImageApiKeys {
    const keys: ImageApiKeys = {};
    for (const [provider, storageKey] of Object.entries(IMAGE_API_KEY_STORAGE)) {
        keys[provider] = read(storageKey) || '';
    }
    const legacy = (read(STORAGE_KEYS.imageApiKey) || '').trim();
    if (legacy) {
        const owner = currentProvider in IMAGE_API_KEY_STORAGE ? currentProvider : 'gemini';
        if (read(IMAGE_API_KEY_STORAGE[owner]) === null) keys[owner] = legacy;
    }
    return keys;
}

/** The image key for the selected provider, with a setter that writes only that provider's key. */
export function useImageApiKeys(imageProvider: string): {
    imageApiKey: string;
    setImageApiKey: Dispatch<SetStateAction<string>>;
} {
    const [keys, setKeys] = useState<ImageApiKeys>(() => loadImageApiKeys(imageProvider));

    useEffect(() => {
        for (const [provider, storageKey] of Object.entries(IMAGE_API_KEY_STORAGE)) {
            safeLocalStorageSet(storageKey, keys[provider] || '');
        }
        try {
            localStorage.removeItem(STORAGE_KEYS.imageApiKey);
        } catch {
            // Storage unavailable: nothing to clean up
        }
    }, [keys]);

    const imageApiKey = keys[imageProvider] || '';
    const setImageApiKey = useCallback<Dispatch<SetStateAction<string>>>(
        (next) => {
            if (!(imageProvider in IMAGE_API_KEY_STORAGE)) return;
            setKeys((prev) => {
                const current = prev[imageProvider] || '';
                const value = typeof next === 'function' ? next(current) : next;
                return value === current ? prev : { ...prev, [imageProvider]: value };
            });
        },
        [imageProvider]
    );

    return { imageApiKey, setImageApiKey };
}
