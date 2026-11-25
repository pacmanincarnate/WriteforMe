/**
 * @module hooks/useLoreBrowser
 * Lore tab list state: search text, current page, the filtered and paged entries, and the
 * drag-over flags of the two lore drop zones. A new search returns to page 1. Extracted from the
 * legacy shell in Phase 7.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { countLorePages, filterLoreEntries, sliceLorePage, type BrowsableLoreEntry } from '@/domain/lore';

export const LORE_PAGE_SIZE = 25;

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface UseLoreBrowserResult<T extends BrowsableLoreEntry> {
    loreSearch: string;
    setLoreSearch: Setter<string>;
    lorePage: number;
    setLorePage: Setter<number>;
    lorePageSize: number;
    filteredLore: T[];
    paginatedLore: T[];
    totalLorePages: number;
    isDraggingSetupLore: boolean;
    setIsDraggingSetupLore: Setter<boolean>;
    isDraggingLoreTab: boolean;
    setIsDraggingLoreTab: Setter<boolean>;
}

export function useLoreBrowser<T extends BrowsableLoreEntry>(lore: T[] | null | undefined): UseLoreBrowserResult<T> {
    const [isDraggingSetupLore, setIsDraggingSetupLore] = useState(false);
    const [isDraggingLoreTab, setIsDraggingLoreTab] = useState(false);
    const [loreSearch, setLoreSearch] = useState('');
    const [lorePage, setLorePage] = useState(1);

    const filteredLore = useMemo(() => filterLoreEntries(lore, loreSearch), [lore, loreSearch]);
    const totalLorePages = countLorePages(filteredLore.length, LORE_PAGE_SIZE);
    const paginatedLore = useMemo(() => sliceLorePage(filteredLore, lorePage, LORE_PAGE_SIZE), [filteredLore, lorePage]);

    useEffect(() => {
        setLorePage(1);
    }, [loreSearch]);

    return {
        loreSearch,
        setLoreSearch,
        lorePage,
        setLorePage,
        lorePageSize: LORE_PAGE_SIZE,
        filteredLore,
        paginatedLore,
        totalLorePages,
        isDraggingSetupLore,
        setIsDraggingSetupLore,
        isDraggingLoreTab,
        setIsDraggingLoreTab
    };
}
