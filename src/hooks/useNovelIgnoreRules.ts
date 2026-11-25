/**
 * @module hooks/useNovelIgnoreRules
 * The `.novelignore` editor in the Editorial Harness view (Phase 6E-3): the draft rule form and
 * the add / remove handlers. Rule edits are pure functions in `@/domain/editorial/novelIgnore`;
 * each change is also written straight to the story database.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    addNovelIgnoreRule,
    removeNovelIgnoreRule,
    type EditorialStoryInput,
    type NovelIgnoreRuleDraft
} from '@/domain/editorial';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type HarnessStory = EditorialStoryInput & { editorial_harness?: Record<string, unknown> | null };

export type NovelIgnoreDraftState = Required<NovelIgnoreRuleDraft>;

export interface UseNovelIgnoreRulesParams<TStory extends HarnessStory = HarnessStory> {
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    showToast: (message: string, variant?: ToastVariant) => void;
    /** Persists a story by id; failures are ignored (autosave will retry). */
    saveStory?: (id: string, story: TStory) => Promise<unknown>;
}

export interface UseNovelIgnoreRulesResult {
    novelIgnoreDraftRule: NovelIgnoreDraftState;
    setNovelIgnoreDraftRule: Dispatch<SetStateAction<NovelIgnoreDraftState>>;
    handleAddNovelIgnoreRule: () => void;
    handleRemoveNovelIgnoreRule: (idx: number) => void;
}

export function useNovelIgnoreRules<TStory extends HarnessStory = HarnessStory>({
    setStory,
    showToast,
    saveStory
}: UseNovelIgnoreRulesParams<TStory>): UseNovelIgnoreRulesResult {
    const [novelIgnoreDraftRule, setNovelIgnoreDraftRule] = useState<NovelIgnoreDraftState>({
        rule_type: 'ALLOW_PHRASE',
        pattern: '',
        scope: 'GLOBAL',
        reason: 'Intentional stylistic choice'
    });

    const applyAndSave = (edit: (story: TStory) => TStory): void => {
        setStory((prev) => {
            const updated = edit(prev);
            if (saveStory && updated.id) {
                saveStory(updated.id, updated).catch(() => {});
            }
            return updated;
        });
    };

    const handleAddNovelIgnoreRule = (): void => {
        if (!novelIgnoreDraftRule.pattern.trim()) {
            showToast('Enter a phrase or rule pattern for .novelignore.', 'warning');
            return;
        }
        const draft = novelIgnoreDraftRule;
        applyAndSave((prev) => addNovelIgnoreRule(prev, draft));
        setNovelIgnoreDraftRule((prev) => ({ ...prev, pattern: '' }));
        showToast('Added rule to .novelignore constitution.', 'success');
    };

    const handleRemoveNovelIgnoreRule = (idx: number): void => {
        applyAndSave((prev) => removeNovelIgnoreRule(prev, idx));
        showToast('Removed .novelignore exemption rule.', 'info');
    };

    return { novelIgnoreDraftRule, setNovelIgnoreDraftRule, handleAddNovelIgnoreRule, handleRemoveNovelIgnoreRule };
}
