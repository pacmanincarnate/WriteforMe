import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/config';
import { loadImageApiKeys, useImageApiKeys } from '@/hooks';
import { DISK_SETTINGS_API_KEY_NAMES } from '@/services/storage/diskSettingsVault';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('per-provider image API keys', () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;
    let latest: ReturnType<typeof useImageApiKeys>;

    function Probe({ provider }: { provider: string }) {
        latest = useImageApiKeys(provider);
        return null;
    }

    function render(provider: string) {
        if (!root) {
            host = document.createElement('div');
            document.body.appendChild(host);
            root = createRoot(host);
        }
        act(() => root!.render(<Probe provider={provider} />));
    }

    beforeEach(() => localStorage.clear());
    afterEach(() => {
        act(() => root?.unmount());
        host?.remove();
        root = null;
        host = null;
    });

    it('keeps a separate key for each provider across switches', () => {
        render('openai');
        act(() => latest.setImageApiKey('sk-openai'));
        expect(latest.imageApiKey).toBe('sk-openai');

        render('gemini');
        expect(latest.imageApiKey).toBe('');
        act(() => latest.setImageApiKey('gem-key'));

        render('openrouter');
        expect(latest.imageApiKey).toBe('');

        render('openai');
        expect(latest.imageApiKey).toBe('sk-openai');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKeyOpenAi)).toBe('sk-openai');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKeyGemini)).toBe('gem-key');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKeyOpenRouter)).toBe('');
    });

    it('has no key for ComfyUI and ignores writes there', () => {
        render('comfyui');
        act(() => latest.setImageApiKey('nope'));
        expect(latest.imageApiKey).toBe('');
    });

    it('hands the old single key to the provider that was selected, once', () => {
        localStorage.setItem(STORAGE_KEYS.imageApiKey, 'old-key');
        render('openrouter');
        expect(latest.imageApiKey).toBe('old-key');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKeyOpenRouter)).toBe('old-key');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKeyGemini)).toBe('');
        expect(localStorage.getItem(STORAGE_KEYS.imageApiKey)).toBeNull();

        // The disk vault may put the old key back; a key the writer has since cleared stays cleared.
        act(() => latest.setImageApiKey(''));
        localStorage.setItem(STORAGE_KEYS.imageApiKey, 'old-key');
        expect(loadImageApiKeys('openrouter').openrouter).toBe('');
    });

    it('gives an old key saved under ComfyUI to Gemini', () => {
        localStorage.setItem(STORAGE_KEYS.imageApiKey, 'old-key');
        expect(loadImageApiKeys('comfyui')).toEqual({ gemini: 'old-key', openrouter: '', openai: '' });
    });

    it('protects every provider key in the disk vault', () => {
        for (const key of [
            STORAGE_KEYS.imageApiKeyGemini,
            STORAGE_KEYS.imageApiKeyOpenRouter,
            STORAGE_KEYS.imageApiKeyOpenAi
        ]) {
            expect(DISK_SETTINGS_API_KEY_NAMES.has(key)).toBe(true);
        }
    });
});
