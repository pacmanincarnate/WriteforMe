# Merging the fork's refactor work

Everything Vanta's fork (`vantaloomin/WriteforMe`) adds sits on top of your
`refactor/modular-architecture` branch at `24906ca`. It is one straight line of commits with no
merge commits, and your branch and `dev` have not moved since, so it merges without conflicts.

Nothing has been pushed to, opened on, or commented on your repository.

## Short version

```
git remote add vanta https://github.com/vantaloomin/WriteforMe.git
git fetch vanta
git checkout refactor/modular-architecture
git merge --ff-only vanta/refactor/merge-ready
npm ci
npm run check
git push origin refactor/modular-architecture
```

`--ff-only` refuses to do anything unless the merge is a clean fast-forward, so it cannot leave
you half-merged. `npm run check` is the full test gate (see `docs/TESTING.md`); it should end
with `ALL GOOD`.

If you would rather review on GitHub, ask Vanta to open one pull request from
`vantaloomin:refactor/merge-ready` into your `refactor/modular-architecture`. Use
"Rebase and merge" or "Create a merge commit". Avoid "Squash", which would flatten 40-odd
reviewable commits into one.

## If you want to take it in steps

Each branch below contains everything above it, so you can stop after any row and still have a
working, green app. Merge them in this order with the same `git merge --ff-only vanta/<branch>`.
The fork PR number is where the description and CI run for that step live
(`https://github.com/vantaloomin/WriteforMe/pull/<n>`).

| Order | Branch | Fork PR | What it does |
| --- | --- | --- | --- |
| 1 | `refactor/safety-net` | 1 | Test gate that runs anywhere, CI, characterisation tests, mocked Autopilot run, small app fixes |
| 2 | `refactor/phase-6f-mcp-bridge` | 2 | Phase 6F: MCP bridge out of the monolith |
| 3 | `refactor/no-hidden-window-channels` | 3 | Modules stop talking through `window` |
| 4 | `refactor/test-api-contract` | 4 | Pins the `window` names the browser tests rely on |
| 5 | `refactor/phase-6e3-story-editors` | 5 | Phase 6E-3: story editors |
| 6 | `refactor/phase-6e3-story-persistence` | 6 | Phase 6E-3: story persistence |
| 7 | `refactor/deploy-and-offline` | 8 | Service worker built from `src/sw.ts`, Pages deploy workflow, duplicate root files removed |
| 8 | `refactor/phase-7a-shell-state` | 9 | Phase 7: shell state into the UI store and hooks |
| 9 | `refactor/phase-7b-typed-app` | 10 | The shell becomes type-checked `src/App.tsx` |
| 10 | `refactor/phase-7c-remove-legacy` | 11 | `src/legacy/` deleted |
| 11 | `refactor/phase-7d-thin-shell` | 12 | Last shell state into typed hooks |
| 12 | `refactor/phase-7e-autopilot-hooks` | 13 | Continuous Autopilot into hooks |
| 13 | `refactor/merge-ready` | 14 | `npm run check`, `docs/TESTING.md`, this guide, Autopilot decision tests |

Good stopping points if you want to pause and use the app for a while: after 6 (Phase 6 done),
after 7 (deploy and offline), after 10 (legacy gone).

## One-time settings on your repository

1. **GitHub Pages source.** Settings, Pages, "Build and deployment", set Source to
   **GitHub Actions**. Step 7 deploys the site with `.github/workflows/deploy-pages.yml` when
   `main` changes, instead of serving files from the branch. Until you switch this, Pages keeps
   serving whatever it serves today. This works on GitHub Free for a public repository.
2. **Actions enabled.** Settings, Actions, General, allow actions to run. `ci.yml` then runs the
   gate on every push to `main`, `dev` and `refactor/**`, and on pull requests.

Nothing else: no secrets, no environment variables, no branch protection changes.

## After it is on your refactor branch

1. Merge `refactor/modular-architecture` into `dev` the way you normally would. `dev` has not
   moved since the branch was cut, so this is conflict-free.
2. Try it with your real provider keys and one real audio export. Those are the two things the
   automated tests fake (see "What each step protects" in `docs/TESTING.md`).
3. Release `dev` to `main` when you are happy. That push is what triggers the Pages deploy.
   `docs/OFFLINE_AND_UPDATES.md` explains how installed copies pick up the new version.

If anything looks wrong after merging, `git reset --hard 24906ca` on your refactor branch puts
it back exactly where you left it, as long as you have not pushed.

## Optional extra: Claude Code provider

Fork PR 7 (`claude/project-thread-n9ulla`) adds a provider that uses a local `claude -p` login.
It is a new feature, not part of the refactor, and it has not been tried on Windows or through a
full Autopilot run. Merge it after everything above, or skip it. See its PR description for the
current state.

## Decisions left for you

These were deliberately not made for you:

- **Shared types.** Modules were typed independently, so `src/App.tsx` re-labels values where two
  modules describe the same thing differently (about 100 places, all through
  `src/compat/shellBoundary.ts`, counted and capped by `shell-boundary-budget.test.ts`). Agreeing
  one canonical `Story` and friends removes them.
- **Props or stores.** `src/App.tsx` is about 2,700 lines of wiring that passes props to views.
  Shrinking it further means views read from stores or context themselves.

## Other branches on the fork

The fork also holds older branches from before this work (`cleanup/*`, `codex/*`, `feat/*`,
`fix/*`, `qol/*`) and its own `main`. They are unrelated to this stack and were left untouched.
Ignore them when merging.
