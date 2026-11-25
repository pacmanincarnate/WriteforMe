/**
 * @module domain/slop/configEditing
 * Pure edits to the AI Slop & Naming configuration made from the Settings editor, plus the
 * per-story allowlist. Each function returns a new object, or the same reference when nothing
 * changed, so callers can use them directly as state updaters.
 */

import type { SlopConfig, SlopPack, SlopSeverity } from '@/types';
import { AI_SLOP_REGISTRY, DEFAULT_SLOP_CONFIG } from './registry';

const SEVERITIES: readonly SlopSeverity[] = ['hard', 'flag', 'off'];

const listOf = (map: Record<string, string[]> | undefined, key: string): string[] =>
    Array.isArray(map?.[key]) ? (map as Record<string, string[]>)[key] : [];

const includesInsensitive = (list: readonly string[], valueLower: string): boolean =>
    list.some((item) => item.toLowerCase() === valueLower);

/** Whether `severity` is one of the three category severities the editor can set. */
export function isSlopSeverity(severity: unknown): severity is SlopSeverity {
    return SEVERITIES.includes(severity as SlopSeverity);
}

/** Sets a category's severity. Invalid severities leave the config untouched. */
export function setSlopCategorySeverity(config: SlopConfig, categoryId: string, severity: unknown): SlopConfig {
    if (!isSlopSeverity(severity)) return config;
    return {
        ...config,
        categorySeverities: { ...(config?.categorySeverities || {}), [categoryId]: severity }
    };
}

/** Appends a phrase to the user's custom list unless it is already there (case-insensitive). */
export function addCustomSlopPhrase(config: SlopConfig, phrase: string): SlopConfig {
    const existing = listOf(config?.customItemsByCategory, 'custom_user');
    if (includesInsensitive(existing, phrase.toLowerCase())) return config;
    return {
        ...config,
        customItemsByCategory: { ...(config?.customItemsByCategory || {}), custom_user: [...existing, phrase] }
    };
}

/**
 * Adds an item to a category. If the item is a built-in the user had removed earlier, it is
 * also taken off the category's removed list so it is active again.
 */
export function addSlopCategoryItem(config: SlopConfig, categoryId: string, item: string): SlopConfig {
    const itemLower = item.toLowerCase();
    const customList = listOf(config?.customItemsByCategory, categoryId);
    const removedList = listOf(config?.removedDefaultItems, categoryId);
    return {
        ...config,
        customItemsByCategory: {
            ...(config?.customItemsByCategory || {}),
            [categoryId]: includesInsensitive(customList, itemLower) ? customList : [...customList, item]
        },
        removedDefaultItems: {
            ...(config?.removedDefaultItems || {}),
            [categoryId]: removedList.filter((x) => x.toLowerCase() !== itemLower)
        }
    };
}

/**
 * Removes an item from a category: custom items are deleted, built-in items (from `registry`)
 * are recorded on the removed list so the default stays suppressed.
 */
export function removeSlopCategoryItem(
    config: SlopConfig,
    categoryId: string,
    item: string,
    registry: SlopPack = AI_SLOP_REGISTRY
): SlopConfig {
    const itemLower = String(item || '').trim().toLowerCase();
    if (!itemLower) return config;
    const customList = listOf(config?.customItemsByCategory, categoryId);
    const removedList = listOf(config?.removedDefaultItems, categoryId);
    const isBuiltIn = Boolean(
        registry?.categories?.find((c) => c.id === categoryId)?.items?.some((i) => i.toLowerCase() === itemLower)
    );
    return {
        ...config,
        customItemsByCategory: {
            ...(config?.customItemsByCategory || {}),
            [categoryId]: customList.filter((x) => x.toLowerCase() !== itemLower)
        },
        removedDefaultItems: {
            ...(config?.removedDefaultItems || {}),
            [categoryId]:
                isBuiltIn && !includesInsensitive(removedList, itemLower) ? [...removedList, item] : removedList
        }
    };
}

/** Attaches a validated imported dictionary and its display metadata. */
export function withImportedSlopPack(
    config: SlopConfig | null | undefined,
    pack: SlopPack,
    fileName: string,
    now: number = Date.now()
): SlopConfig {
    return {
        ...(config || DEFAULT_SLOP_CONFIG),
        importedPack: pack,
        importedPackMeta: {
            name: pack.name || fileName,
            version: pack.version || '',
            importedAt: now,
            categoryCount: (pack.categories || []).length
        }
    };
}

/** A story's own list of terms the slop audit must not flag. */
export interface SlopAllowlistStory {
    slop_allowlist?: unknown;
    [key: string]: unknown;
}

const allowlistOf = (story: SlopAllowlistStory): string[] =>
    Array.isArray(story.slop_allowlist) ? (story.slop_allowlist as string[]) : [];

/** Adds a term to the story allowlist. Returns the same story when it is already allowed. */
export function addStoryAllowlistTerm<T extends SlopAllowlistStory>(story: T, term: string): T {
    const existing = allowlistOf(story);
    if (includesInsensitive(existing, term.toLowerCase())) return story;
    return { ...story, slop_allowlist: [...existing, term] };
}

/** Removes a term from the story allowlist (case-insensitive). */
export function removeStoryAllowlistTerm<T extends SlopAllowlistStory>(story: T, term: string): T {
    const termLower = String(term || '').trim().toLowerCase();
    return { ...story, slop_allowlist: allowlistOf(story).filter((x) => x.toLowerCase() !== termLower) };
}
