/**
 * @module compat/shellBoundary
 * The app shell (`src/App.tsx`) holds one copy of each piece of app state and hands it to every
 * hook and view. Those modules were typed one at a time during the migration, and each declares
 * its own view of what it receives (`CastStory`, `DashboardStory`, `PipelineStory`,
 * `PromptLogEntry`, `LogsViewEntry`, ...). The declarations describe the same runtime values but
 * do not all agree with each other: `prose` entries are `string | ProseEntry` in `@/types` and
 * objects only in the directive view, a log entry's `stepTier` is nullable in the store and not
 * in the log formatter, and so on.
 *
 * Until the shared shapes are reconciled into single canonical types, the functions here are the
 * only way the shell re-labels a value for the module that receives it. They change nothing at
 * runtime. The target type is taken from where the value is used, so a call site reads
 * `story={storyFor(story)}`.
 *
 * `tests/unit/shell-boundary-budget.test.ts` counts the call sites so the number can only go down.
 */
import type { MutableRefObject } from 'react';
import type { Story } from '@/types';

export type SetStory = (updaterOrValue: Story | ((prev: Story) => Story)) => Story;

/** The story document, as the slice the receiving module declares. */
export function storyFor<Slice>(story: Story | null | undefined): Slice {
    return story as unknown as Slice;
}

export function storyRefFor<Slice>(ref: MutableRefObject<Story>): MutableRefObject<Slice> {
    return ref as unknown as MutableRefObject<Slice>;
}

export function setStoryFor<Setter>(setStory: SetStory): Setter {
    return setStory as unknown as Setter;
}

/**
 * Any other shell value whose producer and consumer declare it differently. Prefer fixing the two
 * declarations; use this only where that means redesigning a shared type.
 */
export function handOff<Target>(value: unknown): Target {
    return value as Target;
}
