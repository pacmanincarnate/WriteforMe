/**
 * @module hooks/useSlopConfig
 * Owns the AI Slop & Naming configuration (Phase 6E-3): the config and legacy banned-phrase list
 * with their localStorage persistence, the Settings editor's input state, and the editor
 * handlers. The edits themselves are pure functions in `@/domain/slop`.
 */

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_BANNED_PHRASES } from '@/config';
import {
    addCustomSlopPhrase,
    addSlopCategoryItem,
    exportSlopConfigAsJson,
    normalizeSlopConfig,
    removeSlopCategoryItem,
    setSlopCategorySeverity,
    validateImportedSlopJson,
    withImportedSlopPack
} from '@/domain/slop';
import type { SlopConfig, SlopPack } from '@/types';
import { safeLocalStorageSet } from '@/utils';

export const SLOP_CONFIG_STORAGE_KEY = 'ellipsisprose_slop_config_v1';
export const BANNED_PHRASES_STORAGE_KEY = 'ellipsisprose_banned_phrases';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface UseSlopConfigParams {
    showToast: (message: string, variant?: ToastVariant) => void;
}

export interface UseSlopConfigResult {
    bannedPhrases: string[];
    setBannedPhrases: Dispatch<SetStateAction<string[]>>;
    slopConfig: SlopConfig;
    setSlopConfig: Dispatch<SetStateAction<SlopConfig>>;
    newBannedPhraseInput: string;
    setNewBannedPhraseInput: Dispatch<SetStateAction<string>>;
    slopSearchQuery: string;
    setSlopSearchQuery: Dispatch<SetStateAction<string>>;
    expandedSlopGroups: Record<string, boolean>;
    setExpandedSlopGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
    expandedSlopCategories: Record<string, boolean>;
    setExpandedSlopCategories: Dispatch<SetStateAction<Record<string, boolean>>>;
    newCategoryItemInputs: Record<string, string>;
    setNewCategoryItemInputs: Dispatch<SetStateAction<Record<string, string>>>;
    handleAddBannedPhrase: () => void;
    handleSetSlopCategorySeverity: (categoryId: string, severity: string) => void;
    handleAddSlopCategoryItem: (categoryId: string, rawValue: unknown) => void;
    handleRemoveSlopCategoryItem: (categoryId: string, itemText: string) => void;
    handleResetSlopConfig: () => void;
    handleImportSlopJson: (file: File | null | undefined) => Promise<void>;
    handleExportSlopJson: () => void;
}

const defaultBannedPhrases = (): string[] => [...DEFAULT_BANNED_PHRASES];

function readStoredBannedPhrases(): string[] {
    try {
        const saved = localStorage.getItem(BANNED_PHRASES_STORAGE_KEY);
        return saved ? (JSON.parse(saved) as string[]) : defaultBannedPhrases();
    } catch {
        return defaultBannedPhrases();
    }
}

function readStoredSlopConfig(): SlopConfig {
    try {
        const rawSlop = localStorage.getItem(SLOP_CONFIG_STORAGE_KEY);
        const rawLegacy = localStorage.getItem(BANNED_PHRASES_STORAGE_KEY);
        return normalizeSlopConfig(rawSlop ? JSON.parse(rawSlop) : null, rawLegacy ? JSON.parse(rawLegacy) : null);
    } catch (err) {
        console.warn('Failed loading slopConfig, using defaults:', err);
    }
    return normalizeSlopConfig(null, defaultBannedPhrases());
}

export function useSlopConfig({ showToast }: UseSlopConfigParams): UseSlopConfigResult {
    const [bannedPhrases, setBannedPhrases] = useState<string[]>(readStoredBannedPhrases);
    const [slopConfig, setSlopConfig] = useState<SlopConfig>(readStoredSlopConfig);
    const [newBannedPhraseInput, setNewBannedPhraseInput] = useState('');
    const [slopSearchQuery, setSlopSearchQuery] = useState('');
    const [expandedSlopGroups, setExpandedSlopGroups] = useState<Record<string, boolean>>({
        prose_style: true,
        names_places: false,
        patterns_rhythm: false,
        custom: true
    });
    const [expandedSlopCategories, setExpandedSlopCategories] = useState<Record<string, boolean>>({
        custom_user: true
    });
    const [newCategoryItemInputs, setNewCategoryItemInputs] = useState<Record<string, string>>({});

    useEffect(() => {
        safeLocalStorageSet(BANNED_PHRASES_STORAGE_KEY, bannedPhrases);
    }, [bannedPhrases]);
    useEffect(() => {
        safeLocalStorageSet(SLOP_CONFIG_STORAGE_KEY, slopConfig);
    }, [slopConfig]);

    const handleAddBannedPhrase = (): void => {
        const val = newBannedPhraseInput.trim();
        if (!val) return;
        if (bannedPhrases.some((p) => p.toLowerCase() === val.toLowerCase())) {
            showToast(`"${val}" is already in custom phrases.`, 'info');
            return;
        }
        setBannedPhrases((prev) => [...prev, val]);
        setSlopConfig((prev) => addCustomSlopPhrase(prev, val));
        setNewBannedPhraseInput('');
        showToast(`Added "${val}" to custom phrases.`, 'success');
    };

    const handleSetSlopCategorySeverity = (categoryId: string, severity: string): void => {
        setSlopConfig((prev) => setSlopCategorySeverity(prev, categoryId, severity));
    };

    const handleAddSlopCategoryItem = (categoryId: string, rawValue: unknown): void => {
        const val = String(rawValue || '').trim();
        if (!val) return;
        const valLow = val.toLowerCase();
        if (categoryId === 'custom_user') {
            // The legacy banned-phrase list mirrors the custom category.
            setBannedPhrases((prev) => (prev.some((p) => p.toLowerCase() === valLow) ? prev : [...prev, val]));
        }
        setSlopConfig((prev) => addSlopCategoryItem(prev, categoryId, val));
        setNewCategoryItemInputs((prev) => ({ ...prev, [categoryId]: '' }));
        showToast(`Added "${val}" to ${categoryId.replace(/_/g, ' ')}.`, 'success');
    };

    const handleRemoveSlopCategoryItem = (categoryId: string, itemText: string): void => {
        const targetLow = String(itemText || '').trim().toLowerCase();
        if (!targetLow) return;
        if (categoryId === 'custom_user') {
            setBannedPhrases((prev) => prev.filter((p) => p.toLowerCase() !== targetLow));
        }
        setSlopConfig((prev) => removeSlopCategoryItem(prev, categoryId, itemText));
    };

    const handleResetSlopConfig = (): void => {
        setSlopConfig(normalizeSlopConfig(null, defaultBannedPhrases()));
        setBannedPhrases(defaultBannedPhrases());
        showToast('Restored default AI Slop & Naming configuration.', 'info');
    };

    const handleImportSlopJson = async (file: File | null | undefined): Promise<void> => {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text()) as SlopPack;
            const validation = validateImportedSlopJson(parsed);
            if (!validation.valid) {
                showToast(validation.error || 'Invalid ai-slop JSON file.', 'error');
                return;
            }
            setSlopConfig((prev) => withImportedSlopPack(prev, parsed, file.name));
            showToast(
                `Imported slop dictionary "${parsed.name || file.name}" (${(parsed.categories || []).length} categories).`,
                'success'
            );
        } catch (err) {
            showToast(`Failed to import slop JSON: ${(err as Error).message}`, 'error');
        }
    };

    const handleExportSlopJson = (): void => {
        try {
            const payload = exportSlopConfigAsJson(slopConfig);
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ellipsisprose-ai-slop-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('Exported AI Slop dictionary JSON.', 'success');
        } catch (err) {
            showToast(`Export failed: ${(err as Error).message}`, 'error');
        }
    };

    return {
        bannedPhrases,
        setBannedPhrases,
        slopConfig,
        setSlopConfig,
        newBannedPhraseInput,
        setNewBannedPhraseInput,
        slopSearchQuery,
        setSlopSearchQuery,
        expandedSlopGroups,
        setExpandedSlopGroups,
        expandedSlopCategories,
        setExpandedSlopCategories,
        newCategoryItemInputs,
        setNewCategoryItemInputs,
        handleAddBannedPhrase,
        handleSetSlopCategorySeverity,
        handleAddSlopCategoryItem,
        handleRemoveSlopCategoryItem,
        handleResetSlopConfig,
        handleImportSlopJson,
        handleExportSlopJson
    };
}
