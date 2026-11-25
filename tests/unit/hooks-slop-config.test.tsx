import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BANNED_PHRASES } from '@/config';
import {
    AI_SLOP_REGISTRY,
    addCustomSlopPhrase,
    addSlopCategoryItem,
    addStoryAllowlistTerm,
    normalizeSlopConfig,
    removeSlopCategoryItem,
    removeStoryAllowlistTerm,
    setSlopCategorySeverity,
    withImportedSlopPack
} from '@/domain/slop';
import { useSlopConfig, useStoryEditors, type EditorStory, type UseSlopConfigResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const builtInCategory = AI_SLOP_REGISTRY.categories.find((c) => c.items.length > 0)!;
const builtInItem = builtInCategory.items[0];

describe('slop config edits (pure)', () => {
    const base = () => normalizeSlopConfig(null, []);

    it('sets a category severity and ignores invalid values', () => {
        const config = base();
        expect(setSlopCategorySeverity(config, 'x', 'hard').categorySeverities.x).toBe('hard');
        expect(setSlopCategorySeverity(config, 'x', 'loud')).toBe(config);
    });

    it('adds custom phrases once, case-insensitively', () => {
        const once = addCustomSlopPhrase(base(), 'Ozone tang');
        expect(once.customItemsByCategory.custom_user).toContain('Ozone tang');
        expect(addCustomSlopPhrase(once, 'ozone TANG')).toBe(once);
    });

    it('removing a built-in records it as removed; re-adding it restores it', () => {
        const removed = removeSlopCategoryItem(base(), builtInCategory.id, builtInItem);
        expect(removed.removedDefaultItems[builtInCategory.id]).toEqual([builtInItem]);
        expect(removeSlopCategoryItem(removed, builtInCategory.id, builtInItem).removedDefaultItems[builtInCategory.id]).toEqual([
            builtInItem
        ]);
        const restored = addSlopCategoryItem(removed, builtInCategory.id, builtInItem.toUpperCase());
        expect(restored.removedDefaultItems[builtInCategory.id]).toEqual([]);
        expect(restored.customItemsByCategory[builtInCategory.id]).toEqual([builtInItem.toUpperCase()]);
    });

    it('removing a custom item deletes it without touching the removed list', () => {
        const added = addSlopCategoryItem(base(), 'custom_user', 'gossamer');
        const removed = removeSlopCategoryItem(added, 'custom_user', 'GOSSAMER');
        expect(removed.customItemsByCategory.custom_user).not.toContain('gossamer');
        expect(removed.removedDefaultItems.custom_user || []).toEqual([]);
        expect(removeSlopCategoryItem(added, 'custom_user', '  ')).toBe(added);
    });

    it('attaches an imported pack with metadata', () => {
        const pack = { name: '', version: '2', categories: [{ id: 'a', title: 'A', items: ['x'] }] };
        const next = withImportedSlopPack(base(), pack, 'mine.json', 99);
        expect(next.importedPack).toBe(pack);
        expect(next.importedPackMeta).toEqual({ name: 'mine.json', version: '2', importedAt: 99, categoryCount: 1 });
    });

    it('story allowlist add/remove is case-insensitive and stable when unchanged', () => {
        const story = { id: 's', slop_allowlist: ['Voss'] };
        expect(addStoryAllowlistTerm(story, 'voss')).toBe(story);
        expect(addStoryAllowlistTerm(story, 'Thorne').slop_allowlist).toEqual(['Voss', 'Thorne']);
        expect(removeStoryAllowlistTerm(story, ' VOSS ').slop_allowlist).toEqual([]);
        expect(addStoryAllowlistTerm<{ id: string; slop_allowlist?: unknown }>({ id: 's' }, 'Voss').slop_allowlist).toEqual(['Voss']);
    });
});

const roots: Root[] = [];
afterEach(() => {
    while (roots.length) {
        const root = roots.pop();
        act(() => root?.unmount());
    }
});

function mountSlop(): { current: () => UseSlopConfigResult; toasts: Array<[string, string | undefined]> } {
    const toasts: Array<[string, string | undefined]> = [];
    let latest: UseSlopConfigResult | null = null;
    function Probe(): null {
        latest = useSlopConfig({ showToast: (m, v) => toasts.push([m, v]) });
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe />));
    return { current: () => latest as UseSlopConfigResult, toasts };
}

describe('useSlopConfig', () => {
    beforeEach(() => localStorage.clear());

    it('starts from defaults and persists both keys', () => {
        const h = mountSlop();
        expect(h.current().bannedPhrases).toEqual([...DEFAULT_BANNED_PHRASES]);
        expect(h.current().slopConfig.schemaVersion).toBeGreaterThan(0);
        expect(JSON.parse(localStorage.getItem('ellipsisprose_banned_phrases') || '[]')).toEqual([
            ...DEFAULT_BANNED_PHRASES
        ]);
        expect(localStorage.getItem('ellipsisprose_slop_config_v1')).toContain('schemaVersion');
    });

    it('hydrates from storage, migrating the legacy phrase list into the config', () => {
        localStorage.setItem('ellipsisprose_banned_phrases', JSON.stringify(['ozone_custom']));
        const h = mountSlop();
        expect(h.current().bannedPhrases).toEqual(['ozone_custom']);
        expect(h.current().slopConfig.customItemsByCategory.custom_user).toContain('ozone_custom');
    });

    it('falls back to defaults when storage holds garbage', () => {
        localStorage.setItem('ellipsisprose_banned_phrases', '{not json');
        localStorage.setItem('ellipsisprose_slop_config_v1', '{not json');
        const h = mountSlop();
        expect(h.current().bannedPhrases).toEqual([...DEFAULT_BANNED_PHRASES]);
        expect(h.current().slopConfig.enableSlopAudit).toBe(true);
    });

    it('adds a banned phrase to both lists, clears the input and rejects duplicates', () => {
        const h = mountSlop();
        act(() => h.current().setNewBannedPhraseInput('  gossamer  '));
        act(() => h.current().handleAddBannedPhrase());
        expect(h.current().bannedPhrases).toContain('gossamer');
        expect(h.current().slopConfig.customItemsByCategory.custom_user).toContain('gossamer');
        expect(h.current().newBannedPhraseInput).toBe('');
        expect(h.toasts.at(-1)).toEqual(['Added "gossamer" to custom phrases.', 'success']);
        expect(JSON.parse(localStorage.getItem('ellipsisprose_banned_phrases') || '[]')).toContain('gossamer');

        act(() => h.current().setNewBannedPhraseInput('GOSSAMER'));
        act(() => h.current().handleAddBannedPhrase());
        expect(h.current().bannedPhrases.filter((p) => p.toLowerCase() === 'gossamer')).toHaveLength(1);
        expect(h.toasts.at(-1)).toEqual(['"GOSSAMER" is already in custom phrases.', 'info']);
    });

    it('category items mirror into the legacy list only for the custom category', () => {
        const h = mountSlop();
        act(() => h.current().handleAddSlopCategoryItem('custom_user', 'velvet dark'));
        expect(h.current().bannedPhrases).toContain('velvet dark');
        act(() => h.current().handleAddSlopCategoryItem(builtInCategory.id, 'thrumming'));
        expect(h.current().bannedPhrases).not.toContain('thrumming');
        expect(h.current().slopConfig.customItemsByCategory[builtInCategory.id]).toContain('thrumming');
        expect(h.toasts.at(-1)?.[0]).toBe(`Added "thrumming" to ${builtInCategory.id.replace(/_/g, ' ')}.`);

        act(() => h.current().handleRemoveSlopCategoryItem('custom_user', 'Velvet Dark'));
        expect(h.current().bannedPhrases).not.toContain('velvet dark');
        act(() => h.current().handleRemoveSlopCategoryItem(builtInCategory.id, builtInItem));
        expect(h.current().slopConfig.removedDefaultItems[builtInCategory.id]).toContain(builtInItem);
    });

    it('imports a valid pack, rejects an invalid one, and resets to defaults', async () => {
        const h = mountSlop();
        const good = new File([JSON.stringify({ name: 'Mine', categories: [{ id: 'a', title: 'A', items: ['x'] }] })], 'mine.json');
        await act(async () => h.current().handleImportSlopJson(good));
        expect(h.current().slopConfig.importedPackMeta).toMatchObject({ name: 'Mine', categoryCount: 1 });
        expect(h.toasts.at(-1)).toEqual(['Imported slop dictionary "Mine" (1 categories).', 'success']);

        await act(async () => h.current().handleImportSlopJson(new File(['{"nope":1}'], 'bad.json')));
        expect(h.toasts.at(-1)?.[1]).toBe('error');
        await act(async () => h.current().handleImportSlopJson(new File(['not json'], 'bad.json')));
        expect(h.toasts.at(-1)?.[0]).toMatch(/^Failed to import slop JSON: /);

        act(() => h.current().handleSetSlopCategorySeverity('custom_user', 'hard'));
        expect(h.current().slopConfig.categorySeverities.custom_user).toBe('hard');
        act(() => h.current().handleResetSlopConfig());
        expect(h.current().slopConfig.importedPack).toBeNull();
        expect(h.current().bannedPhrases).toEqual([...DEFAULT_BANNED_PHRASES]);
        expect(h.toasts.at(-1)).toEqual(['Restored default AI Slop & Naming configuration.', 'info']);
    });
});

describe('useStoryEditors: story allowlist', () => {
    it('saves only when the allowlist actually changes on add, always on remove', () => {
        let story: EditorStory = { id: 'story_1', slop_allowlist: ['Voss'] };
        const saves: string[][] = [];
        const toasts: string[] = [];
        let api: ReturnType<typeof useStoryEditors<EditorStory>> | null = null;
        function Probe(): null {
            api = useStoryEditors<EditorStory>({
                story,
                setStory: (updater) => (story = updater(story)),
                selectedSequence: 0,
                selectedScene: 0,
                setSelectedSequence: () => undefined,
                setSelectedScene: () => undefined,
                showToast: (m) => toasts.push(m),
                requestConfirm: () => undefined,
                storyStoreInstance: {
                    saveStory: async (_id, data) => {
                        saves.push([...(data.slop_allowlist as string[])]);
                    }
                }
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));

        api!.handleAddStoryAllowlistItem(' voss ');
        expect(saves).toHaveLength(0);
        api!.handleAddStoryAllowlistItem('Thorne');
        expect(saves).toEqual([['Voss', 'Thorne']]);
        expect(toasts.at(-1)).toBe('Allowed "Thorne" in this story.');
        api!.handleAddStoryAllowlistItem('   ');
        expect(toasts).toHaveLength(2);
        api!.handleRemoveStoryAllowlistItem('VOSS');
        expect(story.slop_allowlist).toEqual(['Thorne']);
        expect(saves).toHaveLength(2);
    });
});
