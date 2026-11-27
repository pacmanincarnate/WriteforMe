# Testing EllipsisProse

One command tells you whether a change broke something:

```
npm run check
```

It runs every layer below in order, prints one line per step, and ends with `ALL GOOD` or `FAILED`.
When a step fails it prints the lines that matter and saves the full output in `scratch/check/<step>.log`.

```
EllipsisProse check (full)

✓ Types                                                  14.6s
✓ Lint                                                   10.0s
✓ Unit tests              480 tests in 57 files          23.2s
✓ Build                                                  12.4s
✓ Build portable file                                    11.9s
✓ Browser: app            51 checks                      21.9s
✓ Browser: GitHub Pages   52 checks                      20.7s
✓ Browser: portable file  47 checks                      19.8s
✓ Browser: Autopilot      9 checks                       37.1s
✓ Browser: old data       1 checks                       15.0s

ALL GOOD: 10 steps passed. 3m 07s
```

A failure looks like this:

```
✗ Unit tests  1 failed, 480 passed in 58 files  20.5s
    │  FAIL  tests/unit/text.test.ts > countWords > ignores extra whitespace
    │ AssertionError: expected 2 to be 3 // Object.is equality
    │  ❯ tests/unit/text.test.ts:14:41
    full output: scratch/check/unit.log

FAILED: 1 of 10 steps (unit). 3m 02s
Re-run just those: npm run check -- --only unit
```

## Which command when

| When | Command | Time |
| --- | --- | --- |
| While editing, after each change | `npm run check:quick` | under a minute, no browser |
| While writing one test | `npm run test:watch` | re-runs on save |
| Before you commit or merge | `npm run check` | 3 to 4 minutes |
| One step failed and you are fixing it | `npm run check -- --only unit,golden` | just those |
| You want to stop at the first failure | `npm run check -- --bail` | |
| You want the raw output | `npm run check -- --verbose` | |
| See what the steps are | `npm run check -- --list` | |

The first run needs `npm ci`. The browser steps need Chrome or Chromium installed. It is found
automatically on Windows, macOS and Linux; set `CHROME_PATH` if yours lives somewhere unusual.

Every push to `main`, `dev` or a `refactor/**` branch, and every pull request, runs the same steps
in GitHub Actions (`.github/workflows/ci.yml`), so a red X on a commit means the same thing as a
local `FAILED`.

## What each step protects

| Step | Catches |
| --- | --- |
| `typecheck` | A function called with the wrong shape, a renamed field still used somewhere, a missing import. Strict TypeScript over all of `src/` and the unit tests. |
| `lint` | Unused code, `any`, and a module importing from a layer it must not (for example `domain/` importing from `views/`). Zero warnings allowed. |
| `unit` | Logic. About 480 fast tests over domain rules, prompts, the pipeline orchestrators, services, stores, hooks and view rendering. Runs in jsdom, no browser, no network. |
| `build` | The production build, plus a check that everything the app needs offline is in the service worker's precache. |
| `build-singlefile` | The portable one-file build. |
| `golden` | The real app in real Chrome: it mounts, all prompts load, a seeded story shows up in every view, edits persist across reloads, light and dark themes, mobile layout, document import, MP3 export, offline reload. |
| `subpath` | The same checks served the way GitHub Pages serves it (under `/WriteforMe/`, with no backend). |
| `singlefile` | The portable HTML over http and opened straight from disk. |
| `pipeline` | A whole Autopilot run from the Setup form through two written scenes, with a scripted fake LLM. Checks agent order and the story it produces. |
| `upgrade` | Stories and settings saved by the old single-file app still open in the new build. Needs internet, because the old page loads libraries from CDNs. Skipped automatically when you are offline; CI always runs it. |

Two things no step in `npm run check` covers: real model output, and real audio generation through
the audio bridge. The tests replace both with fakes. For real model output there is an opt-in
live test, described next.

## Live model test (opt-in, costs money)

Everything above uses a scripted fake LLM, so it proves the plumbing but not that a real model's
output gets through the parsers. The live test runs the same UI paths with a real Anthropic model
answering:

```
export ANTHROPIC_API_KEY=...        # PowerShell: $env:ANTHROPIC_API_KEY = "..."
npm run build
npm run test:live
```

It is never part of `npm run check`, and CI does not run it on pushes or pull requests. Without
`ANTHROPIC_API_KEY` it prints `SKIPPED` and exits successfully.

What it does, in order:

1. **Connection.** One tiny call, so a wrong key or model name fails in seconds.
2. **One agent through the app.** Distils a short lore passage into a world primer.
3. **Short Autopilot run.** Fills in the Setup form, starts Autopilot, and lets it run from
   concept through cast, arc, acts, sequences and scene plans until the first scene has prose,
   then stops it.

The checks are about structure, never wording: each stage ran in order, the model's output
parsed into a cast, acts, sequences and scenes, the scene is real prose with no leftover tags,
the story was saved, and nothing threw. The run prints each agent as it is called and ends with
the number of calls, retries and tokens used, so you can see what it cost.

Settings (all optional environment variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `LIVE_LLM_MODEL` | `claude-opus-5-5` | Model id. `claude-haiku-5-5` is the cheap, fast choice. |
| `LIVE_LLM_EFFORT` | `low` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `LIVE_LLM_MAX_CALLS` | `120` | Hard stop for the run. A healthy run is roughly 25 to 60 calls. |
| `LIVE_LLM_MAX_TOKENS` | `16000` | Output cap per call. |
| `LIVE_LLM_TIMEOUT_MINUTES` | `30` | How long Autopilot may take to reach the first scene. |

`npm run test:live -- --out scratch/live-run.json` saves the agent list, timings and the story
outline (no prompts, no key).

About the key: it is read from the environment by the Anthropic SDK in the Node test process.
The page under test never receives it. The page sends each LLM call to a relay on `127.0.0.1`
that only exists for the run, and the relay makes the API call. The key is not logged, not
written to the transcript, and must not be committed: keep it in your shell or a secret manager,
not in a file in this repository.

To run it on GitHub, add a repository secret named `ANTHROPIC_API_KEY`, then start the
"Live model test" workflow by hand from the Actions tab (`.github/workflows/live-llm.yml`).

What this does not test: the app's own provider code (Gemini, OpenRouter, NanoGPT, Anthropic,
Codex, Kobold). The live test answers at the same seam the fake LLM uses, so it bypasses the
app's Anthropic provider too (`src/services/llm/anthropic.ts`, covered with a stubbed API in
`tests/unit/anthropic-provider.test.ts`). Checking a provider end to end still means trying it by
hand with that provider's key.

To test the live plumbing itself without a key or any cost, `LIVE_LLM_SCRIPTED=1 npm run test:live`
runs the same scenarios against the scripted model.

## If a step fails

1. Read the lines printed under the red `✗`. For unit tests they name the test file and the
   assertion; for browser steps they are the `[FAIL]` checks.
2. Open `scratch/check/<step>.log` for the full output.
3. Fix, then re-run only that step: `npm run check -- --only <step>`.
4. Run the full `npm run check` once at the end.

A browser step is skipped when the build it depends on failed, so fix the build first.

## Adding a test

Add one whenever you fix a bug (write the test that would have caught it) or add behaviour.

### Logic (most tests)

Create or extend a file in `tests/unit/`. Files are named after the layer they cover:
`domain-*.test.ts`, `pipeline-*.test.ts`, `services-*.test.ts`, `stores*.test.ts`,
`hooks-*.test.tsx`, `views-*.test.tsx`. Import the code through the `@/` alias.

```ts
import { describe, expect, it } from 'vitest';
import { countWords } from '@/utils';

describe('countWords', () => {
    it('ignores extra whitespace', () => {
        expect(countWords('  one   two ')).toBe(2);
    });
});
```

### Pipeline code that calls an LLM

Do not call a model. Replace the modules it calls with `vi.mock` and assert on what was called
and what the story looks like afterwards. `tests/unit/pipeline-autopilot-steps.test.ts` is the
example to copy: it pins which stage Autopilot runs next for each story state.

### Hooks

There is no `@testing-library` here. Mount the hook with React itself. Copy the `mountHook`
helper from the top of `tests/unit/hooks-shell-state.test.tsx`:

```tsx
const read = mountHook(() => useGenerationStatus());
act(() => read().setIsGenerating(true));
expect(read().isGenerating).toBe(true);
```

### Something only a real browser shows

Add an `assert('name', condition, detail)` line to the matching section of
`tests/e2e/golden_suite.mjs` (`runCoreSuite`, `runPersistenceEditorSuite`, `runOfflineSuite`).
The suite drives Chrome directly, so `cdp.eval('...')` runs code in the page. Prefer a unit
test when one can prove the same thing; these are slower.

Tests reach into the page only through the names listed in `src/compat/testApi.ts`. If a test
needs a new one, add it there on purpose.

## Coverage

```
npm run test:coverage
```

prints a summary and writes a browsable report to `coverage/index.html`. It counts unit tests
only, so `src/App.tsx` shows 0% even though the browser suites exercise it.

Unit tests currently cover a little over half the lines in `src/`. The thinnest areas, in the
order worth filling:

| Area | Why it is thin |
| --- | --- |
| `pipeline/initStory.ts`, `pipeline/storySoFar.ts`, `pipeline/editorialHarness.ts`, `pipeline/directiveExecutor.ts` | Long LLM-driven flows. The mocked Autopilot browser run covers the main path; the retry and repair branches are not pinned. |
| `services/audio/studioPipeline.ts`, `services/audio/exporter.ts`, `hooks/useTtsPlayback.ts`, `hooks/useVoiceManagement.ts` | Need Web Audio and the audio bridge, which jsdom does not have. |
| `services/rag/embeddingService.ts` | Loads a local model. |

There is no minimum coverage threshold in the gate on purpose: a number that blocks merges
invites tests written to move the number. Use the report to decide what to test next.

## Three guard tests worth knowing

These fail on purpose when the architecture slips, not when behaviour changes:

- `no-hidden-window-channels.test.ts`: modules must not talk to each other through `window`.
- `test-api-contract.test.ts`: the `window` names the browser suites use stay published.
- `shell-boundary-budget.test.ts`: the number of type re-labels in `src/App.tsx` may go down, never up.
