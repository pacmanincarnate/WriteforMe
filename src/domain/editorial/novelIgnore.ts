/**
 * @module domain/editorial/novelIgnore
 * `.novelignore` rules: intentional style exemptions stored on the story's editorial harness and
 * compiled into its Aesthetic Constitution. Adding or removing a rule recompiles the
 * constitution.
 */

import { normalizeIntentionalOverrides } from '@/domain/story';
import { compileAestheticConstitution } from './nlpTelemetry';
import type { EditorialStoryInput } from './xmlNormalization';

export interface NovelIgnoreRuleDraft {
    rule_type?: string;
    scope?: string;
    pattern: string;
    reason?: string;
}

type HarnessStory = EditorialStoryInput & {
    editorial_harness?: Record<string, unknown> | null;
};

/** The story's current rules, from whichever of the three historical locations holds them. */
export function getNovelIgnoreRules(story: HarnessStory): Array<Record<string, unknown>> {
    const harness = (story.editorial_harness || {}) as {
        constitution?: { intentionalOverrides?: unknown };
        customConstitutionOverrides?: unknown;
        novelignore?: unknown;
    };
    return normalizeIntentionalOverrides(
        harness.constitution?.intentionalOverrides || harness.customConstitutionOverrides || harness.novelignore
    );
}

function withRules<T extends HarnessStory>(story: T, rules: Array<Record<string, unknown>>): T {
    return {
        ...story,
        editorial_harness: {
            ...(story.editorial_harness || {}),
            customConstitutionOverrides: rules,
            constitution: compileAestheticConstitution(story, rules)
        }
    };
}

/** Appends a rule (pattern trimmed, other fields defaulted). */
export function addNovelIgnoreRule<T extends HarnessStory>(story: T, draft: NovelIgnoreRuleDraft): T {
    return withRules(story, [
        ...getNovelIgnoreRules(story),
        {
            rule_type: draft.rule_type || 'ALLOW_PHRASE',
            scope: draft.scope || 'GLOBAL',
            pattern: draft.pattern.trim(),
            reason: draft.reason || 'Intentional stylistic exemption'
        }
    ]);
}

/** Removes the rule at `idx`. */
export function removeNovelIgnoreRule<T extends HarnessStory>(story: T, idx: number): T {
    return withRules(
        story,
        getNovelIgnoreRules(story).filter((_, i) => i !== idx)
    );
}
