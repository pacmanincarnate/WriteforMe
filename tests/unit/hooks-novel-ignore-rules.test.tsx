import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { addNovelIgnoreRule, getNovelIgnoreRules, removeNovelIgnoreRule } from '@/domain/editorial';
import { useNovelIgnoreRules, type UseNovelIgnoreRulesResult } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestStory = { id?: string; editorial_harness?: Record<string, unknown> | null };
const harnessOf = (story: TestStory) =>
    story.editorial_harness as {
        customConstitutionOverrides: Array<Record<string, unknown>>;
        constitution: { intentionalOverrides?: unknown };
        keep?: string;
    };

describe('.novelignore rules (pure)', () => {
    it('reads rules from any of the three historical locations', () => {
        const rule = { pattern: 'x' };
        expect(getNovelIgnoreRules({})).toEqual([]);
        expect(getNovelIgnoreRules({ editorial_harness: { novelignore: [rule] } })).toEqual([rule]);
        expect(getNovelIgnoreRules({ editorial_harness: { customConstitutionOverrides: [rule] } })).toEqual([rule]);
        expect(
            getNovelIgnoreRules({ editorial_harness: { constitution: { intentionalOverrides: [rule] }, novelignore: [] } })
        ).toEqual([rule]);
    });

    it('adds a trimmed, defaulted rule and recompiles the constitution', () => {
        const story: TestStory = { id: 's1', editorial_harness: { keep: 'me' } };
        const next = addNovelIgnoreRule(story, { pattern: '  ozone  ' });
        expect(harnessOf(next).customConstitutionOverrides).toEqual([
            { rule_type: 'ALLOW_PHRASE', scope: 'GLOBAL', pattern: 'ozone', reason: 'Intentional stylistic exemption' }
        ]);
        expect(harnessOf(next).keep).toBe('me');
        expect(JSON.stringify(harnessOf(next).constitution)).toContain('ozone');
        expect(story.editorial_harness).toEqual({ keep: 'me' });
    });

    it('appends to existing rules and removes by index', () => {
        const one = addNovelIgnoreRule({} as TestStory, { pattern: 'a', rule_type: 'ALLOW_RULE', scope: 'SCENE', reason: 'r' });
        const two = addNovelIgnoreRule(one, { pattern: 'b' });
        expect(getNovelIgnoreRules(two).map((r) => r.pattern)).toEqual(['a', 'b']);
        expect(getNovelIgnoreRules(two)[0]).toMatchObject({ rule_type: 'ALLOW_RULE', scope: 'SCENE', reason: 'r' });
        const removed = removeNovelIgnoreRule(two, 0);
        expect(getNovelIgnoreRules(removed).map((r) => r.pattern)).toEqual(['b']);
        expect(JSON.stringify(harnessOf(removed).constitution)).not.toContain('"a"');
        expect(getNovelIgnoreRules(removeNovelIgnoreRule(two, 9))).toHaveLength(2);
    });
});

describe('useNovelIgnoreRules', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    function mount(initial: TestStory = { id: 's1' }, withSave = true) {
        const toasts: Array<[string, string | undefined]> = [];
        const saves: Array<[string, TestStory]> = [];
        const box = { story: initial };
        let latest: UseNovelIgnoreRulesResult | null = null;
        function Probe(): null {
            latest = useNovelIgnoreRules<TestStory>({
                setStory: (updater) => {
                    box.story = updater(box.story);
                },
                showToast: (m, v) => toasts.push([m, v]),
                saveStory: withSave
                    ? (id, story) => {
                          saves.push([id, story]);
                          return Promise.reject(new Error('disk full'));
                      }
                    : undefined
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        return { current: () => latest as UseNovelIgnoreRulesResult, toasts, saves, box };
    }

    it('warns and does nothing when the pattern is blank', () => {
        const h = mount();
        act(() => h.current().setNovelIgnoreDraftRule((prev) => ({ ...prev, pattern: '   ' })));
        act(() => h.current().handleAddNovelIgnoreRule());
        expect(h.toasts).toEqual([['Enter a phrase or rule pattern for .novelignore.', 'warning']]);
        expect(h.box.story.editorial_harness).toBeUndefined();
        expect(h.saves).toEqual([]);
    });

    it('adds a rule, saves the story, clears only the pattern and tolerates a failed save', async () => {
        const h = mount();
        act(() => h.current().setNovelIgnoreDraftRule({ rule_type: 'ALLOW_PHRASE', scope: 'SCENE', pattern: ' ozone ', reason: 'voice' }));
        act(() => h.current().handleAddNovelIgnoreRule());
        expect(getNovelIgnoreRules(h.box.story)).toEqual([
            { rule_type: 'ALLOW_PHRASE', scope: 'SCENE', pattern: 'ozone', reason: 'voice' }
        ]);
        expect(h.saves).toHaveLength(1);
        expect(h.saves[0][0]).toBe('s1');
        expect(h.saves[0][1]).toBe(h.box.story);
        expect(h.current().novelIgnoreDraftRule).toEqual({ rule_type: 'ALLOW_PHRASE', scope: 'SCENE', pattern: '', reason: 'voice' });
        expect(h.toasts).toEqual([['Added rule to .novelignore constitution.', 'success']]);
        await Promise.resolve();
    });

    it('removes a rule and saves', () => {
        const h = mount(addNovelIgnoreRule({ id: 's1' } as TestStory, { pattern: 'a' }));
        act(() => h.current().handleRemoveNovelIgnoreRule(0));
        expect(getNovelIgnoreRules(h.box.story)).toEqual([]);
        expect(h.saves).toHaveLength(1);
        expect(h.toasts).toEqual([['Removed .novelignore exemption rule.', 'info']]);
    });

    it('skips the direct save for a story without an id or without a saver', () => {
        const noId = mount({});
        act(() => noId.current().setNovelIgnoreDraftRule((prev) => ({ ...prev, pattern: 'a' })));
        act(() => noId.current().handleAddNovelIgnoreRule());
        expect(noId.saves).toEqual([]);
        const noSaver = mount({ id: 's1' }, false);
        act(() => noSaver.current().handleRemoveNovelIgnoreRule(0));
        expect(noSaver.saves).toEqual([]);
    });
});
