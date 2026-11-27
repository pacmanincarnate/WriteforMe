/**
 * @module hooks/useSetupDraft
 * The unsaved Setup form (title, concept, author note, writing mode, book type, custom word
 * target, and the series option). Each field is restored from localStorage on load and written back as it changes, so a
 * half-typed concept survives a reload. Extracted from the legacy shell in Phase 7.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { STORAGE_KEYS } from '@/config';
import { safeLocalStorageSet } from '@/utils';

export const SETUP_DRAFT_STORAGE_KEYS = {
    title: STORAGE_KEYS.draftTitle,
    concept: STORAGE_KEYS.draftConcept,
    authorNote: STORAGE_KEYS.draftAuthorNote,
    writingMode: STORAGE_KEYS.draftWritingMode,
    bookType: STORAGE_KEYS.draftBookType,
    customWords: STORAGE_KEYS.draftCustomWords,
    seriesOpener: STORAGE_KEYS.draftSeriesOpener,
    seriesTitle: STORAGE_KEYS.draftSeriesTitle
} as const;

export type SetupWritingMode = 'novel' | 'audio_drama';

export const DEFAULT_SETUP_BOOK_TYPE = 'popular';
export const DEFAULT_SETUP_CUSTOM_WORDS = 80000;
const MIN_SETUP_CUSTOM_WORDS = 1000;

export interface UseSetupDraftResult {
    inputTitle: string;
    setInputTitle: Dispatch<SetStateAction<string>>;
    inputConcept: string;
    setInputConcept: Dispatch<SetStateAction<string>>;
    inputAuthorNote: string;
    setInputAuthorNote: Dispatch<SetStateAction<string>>;
    inputWritingMode: SetupWritingMode;
    setInputWritingMode: Dispatch<SetStateAction<SetupWritingMode>>;
    inputBookType: string;
    setInputBookType: Dispatch<SetStateAction<string>>;
    inputCustomWords: number;
    setInputCustomWords: Dispatch<SetStateAction<number>>;
    /** True when the new story is planned as Book 1 of a series. */
    inputSeriesOpener: boolean;
    setInputSeriesOpener: Dispatch<SetStateAction<boolean>>;
    inputSeriesTitle: string;
    setInputSeriesTitle: Dispatch<SetStateAction<string>>;
    /** Puts every field back to its default and removes the stored draft. */
    resetSetupDraftFields: () => void;
}

function readDraftString(key: string, fallback = ''): string {
    try {
        return localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function readDraftWritingMode(): SetupWritingMode {
    return readDraftString(SETUP_DRAFT_STORAGE_KEYS.writingMode) === 'audio_drama' ? 'audio_drama' : 'novel';
}

function readDraftCustomWords(): number {
    const parsed = parseInt(readDraftString(SETUP_DRAFT_STORAGE_KEYS.customWords), 10);
    return Number.isFinite(parsed) && parsed >= MIN_SETUP_CUSTOM_WORDS ? parsed : DEFAULT_SETUP_CUSTOM_WORDS;
}

/** Stores a text field, or removes its key when the field is empty. */
function persistDraftText(key: string, value: string): void {
    try {
        if (value) safeLocalStorageSet(key, value);
        else localStorage.removeItem(key);
    } catch {
        // Storage unavailable; the draft just will not survive a reload.
    }
}

export function useSetupDraft(): UseSetupDraftResult {
    const [inputTitle, setInputTitle] = useState(() => readDraftString(SETUP_DRAFT_STORAGE_KEYS.title));
    const [inputConcept, setInputConcept] = useState(() => readDraftString(SETUP_DRAFT_STORAGE_KEYS.concept));
    const [inputAuthorNote, setInputAuthorNote] = useState(() =>
        readDraftString(SETUP_DRAFT_STORAGE_KEYS.authorNote)
    );
    const [inputWritingMode, setInputWritingMode] = useState<SetupWritingMode>(readDraftWritingMode);
    const [inputBookType, setInputBookType] = useState(() =>
        readDraftString(SETUP_DRAFT_STORAGE_KEYS.bookType, DEFAULT_SETUP_BOOK_TYPE)
    );
    const [inputCustomWords, setInputCustomWords] = useState(readDraftCustomWords);
    const [inputSeriesOpener, setInputSeriesOpener] = useState(
        () => readDraftString(SETUP_DRAFT_STORAGE_KEYS.seriesOpener) === '1'
    );
    const [inputSeriesTitle, setInputSeriesTitle] = useState(() =>
        readDraftString(SETUP_DRAFT_STORAGE_KEYS.seriesTitle)
    );

    useEffect(() => {
        persistDraftText(SETUP_DRAFT_STORAGE_KEYS.title, inputTitle);
    }, [inputTitle]);
    useEffect(() => {
        persistDraftText(SETUP_DRAFT_STORAGE_KEYS.concept, inputConcept);
    }, [inputConcept]);
    useEffect(() => {
        persistDraftText(SETUP_DRAFT_STORAGE_KEYS.authorNote, inputAuthorNote);
    }, [inputAuthorNote]);
    useEffect(() => {
        safeLocalStorageSet(SETUP_DRAFT_STORAGE_KEYS.writingMode, inputWritingMode || 'novel');
    }, [inputWritingMode]);
    useEffect(() => {
        safeLocalStorageSet(SETUP_DRAFT_STORAGE_KEYS.bookType, inputBookType || DEFAULT_SETUP_BOOK_TYPE);
    }, [inputBookType]);
    useEffect(() => {
        safeLocalStorageSet(SETUP_DRAFT_STORAGE_KEYS.customWords, inputCustomWords);
    }, [inputCustomWords]);
    useEffect(() => {
        persistDraftText(SETUP_DRAFT_STORAGE_KEYS.seriesOpener, inputSeriesOpener ? '1' : '');
    }, [inputSeriesOpener]);
    useEffect(() => {
        persistDraftText(SETUP_DRAFT_STORAGE_KEYS.seriesTitle, inputSeriesTitle);
    }, [inputSeriesTitle]);

    const resetSetupDraftFields = useCallback(() => {
        setInputTitle('');
        setInputConcept('');
        setInputAuthorNote('');
        setInputWritingMode('novel');
        setInputBookType(DEFAULT_SETUP_BOOK_TYPE);
        setInputCustomWords(DEFAULT_SETUP_CUSTOM_WORDS);
        setInputSeriesOpener(false);
        setInputSeriesTitle('');
        try {
            for (const key of Object.values(SETUP_DRAFT_STORAGE_KEYS)) localStorage.removeItem(key);
        } catch {
            // Storage unavailable; nothing to remove.
        }
    }, []);

    return {
        inputTitle,
        setInputTitle,
        inputConcept,
        setInputConcept,
        inputAuthorNote,
        setInputAuthorNote,
        inputWritingMode,
        setInputWritingMode,
        inputBookType,
        setInputBookType,
        inputCustomWords,
        setInputCustomWords,
        inputSeriesOpener,
        setInputSeriesOpener,
        inputSeriesTitle,
        setInputSeriesTitle,
        resetSetupDraftFields
    };
}
