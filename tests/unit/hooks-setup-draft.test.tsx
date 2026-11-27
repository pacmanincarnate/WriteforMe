import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETUP_DRAFT_STORAGE_KEYS as KEYS, useSetupDraft, type UseSetupDraftResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useSetupDraft', () => {
    const roots: Root[] = [];
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    function mount() {
        let latest: UseSetupDraftResult | null = null;
        function Probe(): null {
            latest = useSetupDraft();
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return () => latest as unknown as UseSetupDraftResult;
    }

    it('starts with defaults and stores the non-text defaults on mount', () => {
        const h = mount();
        expect(h()).toMatchObject({
            inputTitle: '',
            inputConcept: '',
            inputAuthorNote: '',
            inputWritingMode: 'novel',
            inputBookType: 'popular',
            inputCustomWords: 80000
        });
        expect(localStorage.getItem(KEYS.title)).toBeNull();
        expect(localStorage.getItem(KEYS.writingMode)).toBe('novel');
        expect(localStorage.getItem(KEYS.bookType)).toBe('popular');
        expect(localStorage.getItem(KEYS.customWords)).toBe('80000');
    });

    it('restores a stored draft', () => {
        localStorage.setItem(KEYS.title, 'The Salt Clock');
        localStorage.setItem(KEYS.concept, 'A harbor town keeps time in salt.');
        localStorage.setItem(KEYS.authorNote, 'Slow burn');
        localStorage.setItem(KEYS.writingMode, 'audio_drama');
        localStorage.setItem(KEYS.bookType, 'epic');
        localStorage.setItem(KEYS.customWords, '120000');
        expect(mount()()).toMatchObject({
            inputTitle: 'The Salt Clock',
            inputConcept: 'A harbor town keeps time in salt.',
            inputAuthorNote: 'Slow burn',
            inputWritingMode: 'audio_drama',
            inputBookType: 'epic',
            inputCustomWords: 120000
        });
    });

    it('falls back for an unknown writing mode and an invalid or too-small word target', () => {
        localStorage.setItem(KEYS.writingMode, 'screenplay');
        localStorage.setItem(KEYS.customWords, '999');
        expect(mount()()).toMatchObject({ inputWritingMode: 'novel', inputCustomWords: 80000 });
        localStorage.setItem(KEYS.customWords, 'lots');
        expect(mount()().inputCustomWords).toBe(80000);
        localStorage.setItem(KEYS.customWords, '1000');
        expect(mount()().inputCustomWords).toBe(1000);
    });

    it('writes each field as it changes and removes emptied text fields', () => {
        const h = mount();
        act(() => {
            h().setInputTitle('Draft');
            h().setInputConcept('Idea');
            h().setInputAuthorNote('Note');
            h().setInputWritingMode('audio_drama');
            h().setInputBookType('novella');
            h().setInputCustomWords(45000);
        });
        expect(localStorage.getItem(KEYS.title)).toBe('Draft');
        expect(localStorage.getItem(KEYS.concept)).toBe('Idea');
        expect(localStorage.getItem(KEYS.authorNote)).toBe('Note');
        expect(localStorage.getItem(KEYS.writingMode)).toBe('audio_drama');
        expect(localStorage.getItem(KEYS.bookType)).toBe('novella');
        expect(localStorage.getItem(KEYS.customWords)).toBe('45000');

        act(() => h().setInputTitle(''));
        expect(localStorage.getItem(KEYS.title)).toBeNull();
        expect(localStorage.getItem(KEYS.concept)).toBe('Idea');
    });

    it('resetSetupDraftFields restores defaults and leaves no text draft behind', () => {
        const h = mount();
        act(() => {
            h().setInputTitle('Draft');
            h().setInputConcept('Idea');
            h().setInputAuthorNote('Note');
            h().setInputWritingMode('audio_drama');
            h().setInputBookType('epic');
            h().setInputCustomWords(120000);
        });
        act(() => h().resetSetupDraftFields());
        expect(h()).toMatchObject({
            inputTitle: '',
            inputConcept: '',
            inputAuthorNote: '',
            inputWritingMode: 'novel',
            inputBookType: 'popular',
            inputCustomWords: 80000
        });
        expect(localStorage.getItem(KEYS.title)).toBeNull();
        expect(localStorage.getItem(KEYS.concept)).toBeNull();
        expect(localStorage.getItem(KEYS.authorNote)).toBeNull();
        // The change effects store the defaults again, exactly as the shell did.
        expect(localStorage.getItem(KEYS.writingMode)).toBe('novel');
        expect(localStorage.getItem(KEYS.bookType)).toBe('popular');
        expect(localStorage.getItem(KEYS.customWords)).toBe('80000');
    });

    it('a reset when the fields are already default removes the stored keys', () => {
        const h = mount();
        act(() => h().resetSetupDraftFields());
        expect(localStorage.getItem(KEYS.writingMode)).toBeNull();
        expect(localStorage.getItem(KEYS.bookType)).toBeNull();
        expect(localStorage.getItem(KEYS.customWords)).toBeNull();
    });

    it('keeps the series option off by default, stores it, and clears it on reset', () => {
        const h = mount();
        expect(h()).toMatchObject({ inputSeriesOpener: false, inputSeriesTitle: '' });
        expect(localStorage.getItem(KEYS.seriesOpener)).toBeNull();
        act(() => {
            h().setInputSeriesOpener(true);
            h().setInputSeriesTitle('The Harbour Books');
        });
        expect(localStorage.getItem(KEYS.seriesOpener)).toBe('1');
        expect(localStorage.getItem(KEYS.seriesTitle)).toBe('The Harbour Books');
        expect(mount()()).toMatchObject({ inputSeriesOpener: true, inputSeriesTitle: 'The Harbour Books' });
        act(() => h().resetSetupDraftFields());
        expect(h()).toMatchObject({ inputSeriesOpener: false, inputSeriesTitle: '' });
        expect(localStorage.getItem(KEYS.seriesOpener)).toBeNull();
        expect(localStorage.getItem(KEYS.seriesTitle)).toBeNull();
    });

    it('keeps the serial option off by default, stores it with its rotation, and clears it on reset', () => {
        const h = mount();
        expect(h()).toMatchObject({ inputSerial: false, inputSerialRotation: 'anchored' });
        expect(localStorage.getItem(KEYS.serial)).toBeNull();
        act(() => {
            h().setInputSerial(true);
            h().setInputSerialRotation('ensemble');
        });
        expect(localStorage.getItem(KEYS.serial)).toBe('1');
        expect(localStorage.getItem(KEYS.serialRotation)).toBe('ensemble');
        expect(mount()()).toMatchObject({ inputSerial: true, inputSerialRotation: 'ensemble' });
        act(() => h().resetSetupDraftFields());
        expect(h()).toMatchObject({ inputSerial: false, inputSerialRotation: 'anchored' });
        expect(localStorage.getItem(KEYS.serial)).toBeNull();
        expect(localStorage.getItem(KEYS.serialRotation)).toBeNull();
    });
});
