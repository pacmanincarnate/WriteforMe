# Working on EllipsisProse

Browser app that drafts a novel through a pipeline of LLM steps. React, TypeScript, Vite, Zustand. No backend: stories live in IndexedDB.

## Three readers

Every screen is opened by three people: the writer using it, the developer changing it, and the agent editing it next. A change that helps one by costing another is not done.

- **Writer:** each place has one name. The sidebar item, the page title and any link to it read the same. Names come from `VIEW_LABELS` in `src/config/models.ts`; render the constant, do not retype it.
- **Writer:** no caption that only explains the layout. Section headings over a self-evident group, eyebrows that restate the heading under them, and subtitles that describe the page are removed, not reworded. If a screen needs a caption, fix the screen.
- **Developer and agent:** a file you cannot read in one sitting is a cost to both. Do not grow `src/App.tsx` or any view past its current size; move logic into `src/hooks`, `src/domain` or `src/pipeline` and test it there.

## Commands

| When | Run |
| --- | --- |
| Once | `npm ci` |
| While editing | `npm run check:quick` |
| Before pushing | `npm run check` (ends with `ALL GOOD` or `FAILED`) |
| See the app | `npm run dev`, then seed a story with `buildSeedFixtureScript()` from `tests/e2e/golden_suite.mjs` |

Details are in `docs/TESTING.md`. Lint runs with `--max-warnings=0`.

## Where things are

| Path | Holds |
| --- | --- |
| `src/App.tsx` | The shell: wires hooks to views. Typed, large, shrinking. |
| `src/views/<name>/` | One folder per screen. The folder name is the `view` id. |
| `src/components/` | Shared pieces: layout, cards, modals, icons. |
| `src/hooks/`, `src/stores/` | UI state and Zustand stores. |
| `src/pipeline/`, `src/prompts/` | Generation steps and their prompts. |
| `src/domain/`, `src/services/` | Pure story logic; providers, storage, updates. |
| `tests/unit/`, `tests/e2e/` | Vitest; the golden browser suite. |
| `docs/` | One page per feature. Add one when you add a feature. |

## Rules that tests enforce

- `tests/unit/shell-boundary-budget.test.ts` caps `handOff(` in `App.tsx`. Lower the budget when you remove one; never raise it.
- No `as any`, `@ts-ignore` or `@ts-nocheck` in the shell.
- Component tests mount with `createRoot` and `act`. `@testing-library` is not installed.

## Pull requests

Branch from `dev` and open the PR into `dev`. Keep each PR to one idea. Merge it when CI is green; no approval is needed. Tagged releases (`v*`) are the exception and wait for the owner.
