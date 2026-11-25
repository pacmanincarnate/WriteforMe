# EllipsisProse — Modularization Plan & Handoff

> Branch: `refactor/modular-architecture` (based on `dev`) · Last updated: 2026-11-25 · Last commit at time of writing: `138b5e5`
>
> Purpose: this document tells a new developer **what the refactor is, what is done, what remains, the rules, and how to verify every step.** Read it fully before touching code.

---

## 1. Goal

Break the former single-file app (`index.html`, ~hundreds of thousands of characters of in-browser Babel JSX) into a cleanly layered, modular, typed codebase **without changing any behavior, visuals, mobile layout, storage format, or `window.*` bridge contracts.**

**Target stack:** Vite · React 18 · TypeScript (`strict: true`) · Zustand 5 · compiled Tailwind CSS 3.4 · Workbox PWA · Vitest · Playwright-style golden E2E suite.

**Hosting / delivery requirements (decided with the product owner):**

| Requirement | Decision |
|---|---|
| GitHub Pages | Must work at `https://pacmanincarnate.github.io/WriteforMe/` (subpath `/WriteforMe/`). |
| Language | TypeScript, `strict: true`, **zero `any`**, no `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`, no `eslint-disable`, zero ESLint warnings. |
| Node | Node.js v22 (on this Windows machine: `C:\Users\cshai\AppData\Local\hermes\node` — must be prepended to `PATH`). |
| Desktop launch | Double-clicking `index.html` is retired; a `.bat`/`launch.js` + `server.js` start-up path stays (the local bridge controls TTS backends). |
| Portable build | Optional single-file portable HTML (`dist-singlefile/EllipsisProse-portable.html`), to be auto-built by GitHub Actions on every push. |
| Test safety net | Behavior must be proven equal after **every** sub-phase by the Verification Gate (§5). |

---

## 2. Architecture (layering rules — enforced by ESLint `boundaries`)

```
src/
  foundation/types/config/utils   ← leaf modules, no upward imports
  domain/        pure logic (story, audio, editorial, lore, continuity …) — no React, no I/O
  prompts/       prompt templates (window.PROMPTS parity)
  services/      I/O: llm, storage (IDB), audio, images, rag, documents, http, browser, bridge
  stores/        Zustand 5 stores (settings, ui, story, pipeline, audio)
  pipeline/      agent orchestrators (context.ts + one file per agent flow)
  hooks/         React hooks that wrap stores/services/pipeline for the UI
  components/    shared UI (modals, cards, layout, ui primitives)
  views/         one folder per app view (library, setup, writer, reader, …)
  legacy/        MonolithApp.jsx — the shrinking remainder of the old App component
  compat/        window.* compatibility shims
  styles/        compiled Tailwind + CSS tokens
```

Import direction (see `eslint.config.mjs`; `import-x/no-cycle` maxDepth 10):

- `ui` = `views/**`, `components/**`, `hooks/**`
- `pipeline` = `pipeline/**` **and** `services/bridge/**` → may import `pipeline, stores, services, domain, foundation`; **never** `hooks`, `views`, `components`, `legacy`.
- `stores`, `services`, `domain`, `foundation` each only import downwards.
- `src/legacy/**` is ignored by ESLint (it is being drained, not polished) but **must still typecheck/build**.
- Hooks inside `src/hooks/` must stay **acyclic** among themselves (see §6, "late-bound refs").

---

## 3. Progress

### 3.1 Completed phases (all committed and pushed)

| Phase | What moved out of the monolith | Commit(s) |
|---|---|---|
| 0–2 | Tooling (Vite/TS/Tailwind/PWA/Vitest/ESLint), golden E2E suite, config/types/utils, prompts, pure domain engines | see `git log` (oldest commits on branch) |
| 2c | Editorial harness, rollback/migration, log formatter, structural repair domain engines | `548b854` |
| 3a | Storage (IDB stores, vault detector), document extractors, RAG, browser services | `0b3d0ed` |
| 3b | LLM providers, smart routing, model catalogs, agentic writing loop | `de4bfd5` |
| 3c | Kokoro, studio mastering, AudioCPP, TTS synthesizer, MP3 export | `34cb1b8` |
| 4a | lucide-react icons, shared UI, modals, cards; CDN shims removed | `ee362c9` |
| 4b | ReaderView, LogsView, orphaned-log recovery | `5cae0db` |
| 5a | Story templates/stats, image API, export/import, RAG retrieval | `455768a` |
| 5b | AI dispatch, provider catalogs, world updates, directive helpers, prose context builder | `812ac62` |
| 5c | Typed Zustand 5 stores wired to live UI/theme/modal/pipeline-log slices | `2df7fca` |
| 5d | Setup, Inspector, Library, Cast, Lore, Relationships, Structure views | `bef7a75` |
| 5e | Dashboard, Directive, Editorial views | `42020ff` |
| 5f | Writer, Pipeline views | `d2a23fb` |
| 5g | Settings view | `2b76500` |
| 5h | StudioSidebar, StudioHeader, remaining modals | `e47ba38` |
| 6A | Pipeline: escalation, lore, continuity orchestrators | `40160ee` |
| 6B | Pipeline: story init & structure (arc/acts/sequences/scenes) | `986b13b` |
| 6C | Pipeline: prose writing, voice director, surgical patch | `7a420ef` |
| 6D | Pipeline: directive planner/executor, editorial harness, autopilot | `242aee4` |
| 6E-1 | Hooks: `useReaderController`, `useStoryImages`, `useModelCatalog` | `e8fb254` |
| 6E-2 | Hooks: `useVoiceManagement`, `useAudioProduction`, `useTtsPlayback` | `138b5e5` |

### 3.2 Current state snapshot

- `src/legacy/MonolithApp.jsx`: **~5,640 lines** (was ~15,900 before Phase 6C).
- Vitest: **34 files / 201 tests passing.**
- E2E (all must stay green): `golden` **45/45**, `subpath` **46/46**, `singlefile` **46/46**, `upgrade` **1/1**.
- Hooks present in `src/hooks/`: `useDebounce`, `useReaderController`, `useStoryImages`, `useModelCatalog`, `useVoiceManagement`, `useAudioProduction`, `useTtsPlayback`.
- Pipeline orchestrators present in `src/pipeline/` (context, escalation, lore, continuity, story structure, prose, voice director, surgical patch, directive planner/executor, editorial harness, autopilot, …).

### 3.3 Remaining work (in order)

| # | Phase | Status | Scope |
|---|---|---|---|
| 1 | **6E-3** Persistence & editors hooks | ⏳ NOT STARTED (surveyed only) | See §4.1 |
| 2 | **6F** MCP bridge | ✅ DONE | `src/services/bridge/mcpBridge.ts` + `src/hooks/useMcpBridge.ts`; see §4.2 |
| 3 | **7** `src/App.tsx`, retire legacy, CI/CD | ⏳ NOT STARTED | See §4.3 |
| 4 | Hardening & release | ⏳ NOT STARTED | See §4.4 |

---

## 4. Remaining phases in detail

> Line numbers below are from the survey at commit `138b5e5` and **will drift** — always re-locate boundaries with a Node script before splicing (see §6).

### 4.1 Phase 6E-3 — `useStoryPersistence` + `useStoryEditors`

Create `src/hooks/useStoryPersistence.ts` and `src/hooks/useStoryEditors.ts`; export from `src/hooks/index.ts`; replace the corresponding code in `MonolithApp.jsx` with hook calls; add `tests/unit/hooks-persistence-editors.test.tsx`.

**`useStoryPersistence` candidates** (story/library/IDB hydration, autosave, import/export/reset/delete):
`refreshLibrary` (~L761), `handleUpdateStoryCoverStyle` (~L1071), `handleDuplicateStory`, `handleDeleteLibraryStory`, `updateStoryById` (~L2637), `handleLoreImport` / `handlePostGenLoreImport` (~L2841–2965), `handleResetStoryStage` (~L3380), `handleDeleteStory` (~L3509), `handleExport`, `handleExportAudioDramaTxt`, `handleExportEpub`, `handleImport` (~L3713–3798), plus the story hydrate/autosave effects around `setStory` (L679) and `deletedStoryIdsRef`.

**`useStoryEditors` candidates** (editing UI handlers):
- Slop config CRUD (`handleAddBannedPhrase` … `handleExportSlopJson`, `handleAddStoryAllowlistItem`, `handleRemoveStoryAllowlistItem`, ~L1380–1540)
- GESM propositions/beliefs (`handleSaveProposition`, `handleDeleteProposition`, `handleSaveBelief`, `handleInvalidateBelief`, ~L2359–2526)
- Directive plan action editing (`handleUpdateActionField`, `…Detail`, `…AppliedEdit`, `handleToggleDirectiveActionSkip`, `handleRemoveDirectiveAction`, `handleAddManualDirectiveAction`, `handleUndoSurgicalEdit`, ~L2994–3140)
- `.novelignore` CRUD (`handleAddNovelIgnoreRule`, `handleRemoveNovelIgnoreRule`, `handleRunHarnessInspectorTool`)
- Custom narrative modes CRUD (`handleStartEditCustomMode` … `handleDeleteCustomMode`, ~L3559–3678)
- Scene/beat CRUD (`handleBeatChange`, `handleAddBeat`, `handleDeleteBeat`, `handleDeleteScene`, `handleAddScene`, `handleMoveScene`, `handleDismissStaleProse`, ~L3823–4300)
- `openLogDetailModal` (~L2527), `openEditModal` (~L2617), `toggleAllSequencesInAct` (~L2278), `handleDeleteLore`.

**Must preserve:** `window.createDefaultStoryTemplate`, `window.hasHydratedStory`, `window.storyRef`, `window.setStory` (set at ~L695–698).

**Coupling notes:**
- `openEditModal` is already consumed by `useVoiceManagement` through `openEditModalRef` / `openEditModalStable`. If `openEditModal` moves into `useStoryEditors`, keep the ref indirection (assign `openEditModalRef.current = openEditModal` after the hook call).
- `refreshAvailableSceneAudio` and `clearStoryTtsArtifacts` (from `useAudioProduction`) are used by import/reset/delete handlers — pass them in as params (hooks are called in a fixed order in `MonolithApp.jsx`; the persistence hook must be called **after** `useAudioProduction`).

### 4.2 Phase 6F — MCP bridge (done)

**Result:** `createBridgeDispatcher` / `createBridgeApi` / `connectMcpBridge` live in `src/services/bridge/mcpBridge.ts` (React-free, state and callbacks injected through `getState()` / `getActions()`); `useMcpBridge` owns the enable toggle, the WebSocket lifecycle and the `window.EllipsisProseBridge` registration. The dispatcher is created once and re-reads state and callbacks on every call and after every `await`, which fixes two stale-closure bugs the inline version had: the WebSocket kept using the pipeline callbacks from the render it connected in, and `startNewStory` with `autoStart` replied "started" but ran `initStory` against the pre-update (empty) Setup form, so nothing was generated. `mcp-server` no longer advertises the `beats` pipeline step, which the app never accepted; `tests/unit/bridge-mcp.test.tsx` pins the two lists together. Original task notes follow.

- New `src/services/bridge/mcpBridge.ts` (+ `index.ts`) holding the dispatcher currently in `handleBridgeAction` (~L4619–4948, ~330 lines) and the MCP WebSocket connection logic.
- New `src/hooks/useMcpBridge.ts` to own the WebSocket `useEffect` (~90 lines) and the `window.EllipsisProseBridge` registration (~L4949).
- `services/bridge/**` is classified as the `pipeline` layer: it may import `@/pipeline`, `@/stores`, `@/services`, `@/domain`, `@/prompts`, `@/config`, `@/utils`, `@/types`; **not** hooks/views/components/legacy. State access must go through injected callbacks (`getStory`, `setStory`, `showToast`, …), not React.
- Preserve the `window.EllipsisProseBridge` action surface exactly — the golden suite test "EllipsisProseBridge actions work" and the external `mcp-server/` depend on it.
- Add `tests/unit/bridge-mcp.test.ts` (action dispatch, unknown action error, param validation).

### 4.3 Phase 7 — `src/App.tsx`, legacy removal, CI/CD

1. Convert the residual `MonolithApp.jsx` into typed `src/App.tsx` composed of hooks + views (move remaining state/effects into hooks or stores; the file should become a thin composition root). Delete `src/legacy/` and `src/compat/` shims no longer needed (keep any `window.*` contract that is documented as public).
2. `.github/workflows/`:
   - `ci.yml`: Node 22, `npm ci`, typecheck, lint (`--max-warnings=0`), `npm test`, build, singlefile build, all four E2E modes.
   - `deploy-pages.yml`: build with base `/WriteforMe/`, deploy `dist/` to GitHub Pages.
   - `portable.yml` (or a job in CI): build `dist-singlefile/EllipsisProse-portable.html` and publish as artifact/release asset on each push.
3. Update `launch.js` / `server.js` / `.bat` docs for the new `dist/` layout; document the dev flow in `README`.
4. Service worker: confirm `public/sw.js` / Workbox precache works at the subpath and does not break the singlefile build.

### 4.4 Hardening & release

- Remove dead code and unused exports; prune `window.*` bindings that nothing reads (**only** after a repo-wide search incl. `mcp-server/` and `audio-studio-bridge.js`).
- Manual QA pass on desktop + phone-sized viewport: library → setup → full pipeline run (all four providers: Gemini, OpenRouter, NanoGPT, KoboldCpp), reader, audio drama, import/export.
- Merge `refactor/modular-architecture` → `dev` via PR once Phase 7 is green; promote to `main` only at a verified milestone (existing two-tier policy: `dev` = work, `main` = release).

---

## 5. Verification Gate (run after **every** sub-phase, before committing)

All nine must exit 0 (PowerShell, from repo root; Node 22 on `PATH`):

```powershell
$env:PATH = "C:\Users\cshai\AppData\Local\hermes\node;$env:PATH"
npm run typecheck
npm run lint -- --max-warnings=0
npm test                      # Vitest — currently 34 files / 201 tests
npm run build
npm run build:singlefile
npm run test:golden           # 45/45
npm run test:subpath          # 46/46
npm run test:singlefile       # 46/46
npm run test:upgrade          # 1/1  (IDB + localStorage data survives upgrade)
npm run test:pipeline         # 9/9  (mocked Autopilot run: setup -> bible -> structure -> 2 written scenes; bridge startNewStory)
```

The whole gate is also available as one command: `npm run gate` (`npm run verify` runs the first four steps, `npm run test:e2e` the four E2E modes). CI (`.github/workflows/ci.yml`) runs the same nine steps on every push and pull request.

E2E notes:
- Chrome is auto-detected on Windows, macOS and Linux; set `CHROME_PATH` to override and `CHROME_FLAGS` for extra flags (`--no-sandbox` is added automatically as root or under CI).
- `test:pipeline` drives Autopilot from the Setup form with a scripted LLM (`tests/e2e/fixtures/mockLlm.js`, installed through `window.__callAIOverride`), blocks provider hosts, seeds `Math.random`, and is deterministic run to run. `npm run test:pipeline-parity` runs the same scenario on the legacy baseline and on `dist/` and compares agent order, prompt hashes and the resulting structure; it is informational in CI because the legacy page needs CDN access.
- `test:upgrade` (and `--mode legacy`) need the pre-refactor single-file app. If `scratch/legacy_baseline_index.html` is missing it is extracted from git history (commit `fd3b70f`, override with `LEGACY_BASELINE_REF` or `LEGACY_BASELINE_PATH`), so a fresh clone can run it. The legacy page loads libraries from public CDNs, so this step needs internet access.

Commit only after all pass. One commit per sub-phase, message format:
`refactor(phase-6e-3): extract story persistence and editor hooks`

Do **not** stage unrelated pre-existing dirty files (see §7).

---

## 6. How a sub-phase is executed (playbook) and pitfalls

**Playbook**
1. Locate the exact code ranges in `src/legacy/MonolithApp.jsx` with a small Node script (grep is unreliable on this Windows setup — use `Select-String` or Node).
2. Read the ranges in chunks; list every symbol declared inside them and every place outside them that still uses those symbols (scan the whole file, including JSX props like `foo={foo}`).
3. Write the hook(s) in TypeScript, preserving behavior line-for-line (no "improvements" during extraction).
4. Write a splice script (save under a scratch dir and run with `node file.cjs`; **inline node scripts > ~8 KB fail on Windows** with "filename or extension is too long"). Splice **bottom-up** so earlier line numbers stay valid; assert the first/last line of every range before cutting.
5. Destructure **every** value the monolith still needs from the new hook's return object (including setters used by remaining code).
6. Add unit tests, run the Gate, fix, commit.

**Pitfalls we already hit (don't repeat them)**
- **Missing symbol after splice** → runtime `ReferenceError` that typecheck can't see (legacy is JSX). Example: `findCastIndexForChar`, `setTtsError`, `setTtsCurrentTime`, `requestChunkAudio` were used by JSX props outside the removed range. The golden suite's "Zero uncaught runtime exceptions" test catches this — it's the safety net. Always do the outside-usage scan in step 2.
- **Infinite re-render / OOM** in hook unit tests and in effects: never put unstable values (`story`, `showToast`, inline functions, fresh `makeRef()` objects) in `useEffect` dependency arrays unless the original code did; mirror the original primitive deps (`storyId`, lengths) and read the latest objects via refs (`storyRef.current`, `showToastRef.current`). In tests, **hoist all fixtures/spies/refs outside** the `mountHook(() => …)` callback.
- **`@testing-library/react` is NOT installed.** Test hooks with `act` from `react` + `createRoot` from `react-dom/client` (see `mountHook` in `tests/unit/hooks-audio-studio.test.tsx`).
- **Hook cycles / ordering:** hooks that need functions from hooks declared *later* receive them through late-bound refs (`stopTtsPlaybackRef`, `setTtsQueueAndRefRef`, `openEditModalRef`, …) that `MonolithApp.jsx` assigns after the later hook runs. Shared refs that the reader controller needs (`ttsStatusRef`, `ttsPlayingSceneRef`, `isFollowingAudioRef`) must be created **above** `useReaderController`.
- **Typing:** audio queue items are `SharedTtsQueueItem` (index-signature object) — use `undefined`, not `null`, for `audioUrl`. `AudioDramaSettings.backend` is a narrow union; widen to `string` for legacy comparisons like `'browser'`/`'audiocpp'`.
- **Line endings:** files may flip between CRLF and LF; git prints CRLF warnings. Don't write regexes that assume one — normalize or test for both.
- **Never kill a pre-existing `node server.js` on port 3000** — the E2E suites manage their own servers.
- Windows/PowerShell: no `grep`; chain commands with `;` and check `$LASTEXITCODE`.

---

## 7. Working-tree hygiene

These files are modified/untracked locally and **belong to other work — never stage them in refactor commits:**
`Download Audio Models.bat`, `audio-studio-bridge.js`, `audiocpp/config_wave2_drama3.json`, `audiocpp/server.pattern-b.json`, `.agents/`, `.superpowers/`, `Implementation Plans/*` (untracked ones), `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`, `TEST_READY.md`, `mcp-server/package-lock.json`, `mockups/`, and everything in `docs/` except `docs/refactor/`.

Stage by explicit path (`git add <file> …`), never `git add -A`.

---

## 8. Getting started (new dev)

```powershell
git clone https://github.com/pacmanincarnate/WriteforMe.git
cd WriteforMe
git checkout refactor/modular-architecture
$env:PATH = "C:\Users\cshai\AppData\Local\hermes\node;$env:PATH"   # or any Node 22 install
npm ci
npm run dev          # Vite dev server
# run the Gate (§5) once to confirm a green baseline before changing anything
```

Suggested split for two people: one takes **6E-3** (persistence/editors), the other **6F** (MCP bridge) — they touch different regions of `MonolithApp.jsx`, but both edit `src/hooks/index.ts` and the monolith import line, so rebase frequently and always re-locate line ranges after pulling.

## 9. Project-wide rules (from the repo's `.agents/rules`)

- Must keep working with all APIs: Gemini, OpenRouter, NanoGPT, KoboldCpp (local).
- A change to any agent's data/response format must be reflected in the downstream review agents and the storage/processing functions.
- UI must work on Windows, macOS, iOS and Android (phones/tablets).
- Changes must be **complete** — no truncated sections, hard-coded placeholders, or half-implemented work.
- Prefer the correct, industry-standard solution over a quick one; keep code navigable (clear names, JSDoc module headers, logical placement).
