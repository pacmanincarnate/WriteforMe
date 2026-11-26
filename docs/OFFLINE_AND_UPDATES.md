# Offline support and updates

EllipsisProse works offline once it has been opened online one time. This page says how that
works, what happens when a new version ships, and what a developer has to touch (usually nothing).

## How it works

- `src/sw.ts` is the service worker source. `npm run build` compiles it to `dist/sw.js` and writes
  into it the list of every file in `dist/`, each with a content hash (Workbox precache).
- The first online visit downloads all of those files (about 5.5 MB) into the browser's Cache
  Storage. After that the app starts with no network at all.
- Page loads try the network first and fall back to the stored copy after 4 seconds. An online
  user always gets the newest deploy on the next load. An offline user gets the last version that
  finished downloading.
- Calls to LLM, image and embedding providers and to the Local Disk Vault (`/api/*`) are never
  cached or intercepted. Generating text still needs a connection to the provider (or a local one
  such as KoboldCpp).
- The portable single file (`EllipsisProse-portable.html`) has no service worker. It is already
  one self-contained file.

## User data

Stories, settings, images and audio are stored in IndexedDB and localStorage. The service worker
only reads and writes Cache Storage, and only caches it created. Updating, replacing or removing
the worker cannot touch stories. Two things do lose browser data, and neither is caused by the
worker: the user clearing site data, and moving the site to a different address (storage belongs
to the address). Export a backup before either.

## What to do for an update

| Change | What you do |
| --- | --- |
| Any normal release: code, styles, icons, new lazy-loaded chunks | Nothing. Merge to `main`; the deploy workflow rebuilds the file list. |
| The app ships a new file type that must work offline (`.svg`, `.woff2`, `.wasm`, ...) | Add the extension to `PRECACHE_GLOBS` in `vite.config.ts`. The build fails and names the file until you do. |
| The app loads from a new external host that should work offline (font or library CDN) | Add the host to `RUNTIME_CACHE_HOSTS` in `src/sw.ts`. Version-pinned, immutable files only. Never an API host. |
| A pinned version on one of those hosts changes, or you edit the caching rules in `src/sw.ts` | Bump `RUNTIME_CACHE` in `src/sw.ts` (`v1` to `v2`). |
| A new icon size or a manifest change | Edit `public/`. There is one copy of each file; the repo root no longer has duplicates. |
| The site moves to a new domain or path | Nothing in the code. Tell users to export first; their data stays at the old address. |

Never rename `sw.js` and never serve it with long-lived caching. Browsers find updates by
re-downloading that exact URL. `server.js` and GitHub Pages both serve it correctly today.

## What users see

- **Automatic check on launch**: About two seconds after the web app opens online, it checks `./version.json` (which is never cached by the service worker) and the active service worker registration. Users can also trigger a manual check anytime from **Check for Updates** in the sidebar.
- **Changelog & Hard Reload confirmation**: When a newer version or build is deployed on the Pages site, EllipsisProse fetches the release notes from GitHub (`pacmanincarnate/WriteforMe`) and opens an **Update Available** modal displaying **What's Changed**. Clicking **Hard Reload & Update** clears only EllipsisProse/Workbox Cache Storage entries, activates any waiting service worker, primes the browser cache, and reloads cleanly without touching IndexedDB or `localStorage` stories/settings.
- **Background preload fallback**: If a tab that was open during a deploy asks for a lazy-loaded chunk from the previous version that no longer exists, the app reloads itself once (the `vite:preloadError` handler in `src/main.tsx`). Work is autosaved to the browser before that.

## Checks that guard this

- `scripts/check-precache.mjs` runs at the end of `npm run build` and fails if any built file is
  missing from the offline list.
- `npm run test:golden` and `npm run test:subpath` stop the server, reload, and require the app to
  boot from the cache with the saved stories intact (the subpath run mirrors GitHub Pages).
- `npm run test:upgrade` installs the old hand-written worker from the pre-refactor app, then loads
  the new build on the same browser profile and requires the new worker to take over, delete the
  old cache and leave stories untouched.

## Removing offline support

If the worker ever has to go, do not just delete it: installed copies would keep the last one
forever. Replace the body of `src/sw.ts` with a worker that deletes the caches it owns, calls
`self.registration.unregister()`, and ship that for a few months first.
