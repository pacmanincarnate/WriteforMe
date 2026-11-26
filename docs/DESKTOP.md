# Desktop app (Windows exe)

`desktop/` wraps EllipsisProse in an Electron window and adds a **Backends** window that installs
and runs KoboldCpp (text), ComfyUI (images) and audio.cpp (audio drama voices) on the user's PC.
The web version and the `.bat` launchers keep working exactly as before.

## What the user gets

1. Download `EllipsisProse-Setup-<version>.exe` (installer) or `EllipsisProse-<version>-portable.exe`
   from the GitHub release.
2. On first run the app opens with the Backends window on top. Each backend has a GPU choice
   (NVIDIA, AMD/Intel, CPU), an **Install** button and a "Start with EllipsisProse" switch.
3. Install downloads the backend from its own project's latest GitHub release, checks its
   SHA-256 when GitHub publishes one, unpacks it, and starts it on the port the app already uses
   (5001, 8188, 5020/8080). No settings to change in the app.
4. Models are separate: pick or paste a link to a `.gguf` for KoboldCpp; one-click packs for the
   audio.cpp voice models (same files as `Download Audio Models.bat`); ComfyUI's models folder
   opens with one click for the Krea 2 files.

Stories, settings and audio live in `%APPDATA%\EllipsisProse\data` (the same disk vault
`server.js` always used). Backends and models default to `%APPDATA%\EllipsisProse\backends`
and can be moved to a bigger drive from the Backends window.

## Decisions

**Electron, not Tauri** (Vanta chose this on 2026-11-26). The app already runs on Node
(`server.js`, the audio bridge, the Codex bridge). Electron ships Node, so those run unchanged as
child processes. Tauri would need a separately bundled Node plus a Rust toolchain in CI, to save
roughly 85 MB on an app whose backends are several gigabytes.

**Download on first run, not bundled.**

- Size: ComfyUI portable alone is about 2 GB compressed. A bundled installer would be 3 GB+ before
  any model, and every user would download all three even if they only use cloud providers.
- GPU builds: each backend has different packages for NVIDIA, AMD, Intel and CPU. Downloading
  lets the user pick the one that fits instead of shipping every variant.
- Licenses: KoboldCpp is AGPL-3.0 and ComfyUI is GPL-3.0. Shipping their binaries inside our
  installer would make every EllipsisProse release a redistribution of them, with the duty to
  offer the matching source for each one. Downloading the unchanged program from the project's
  own release means we never redistribute it. audio.cpp is Apache-2.0 and would be fine to
  bundle, but it is handled the same way for consistency and so it can be updated on its own.
- Updates: "Reinstall / update" fetches the newest upstream release without a new EllipsisProse
  release.

What we do ship: Electron (MIT) and the 7-Zip command-line binary from `7zip-bin` (LGPL-2.1),
used to unpack downloads. Both are listed in `desktop/THIRD_PARTY.md`, which the app shows under
Help.

## How it fits together

| File | Job |
| --- | --- |
| `desktop/main.cjs` | Electron main process: starts `server.js` on 127.0.0.1:3000 with the data folder in `%APPDATA%`, opens the app window, menu, IPC, and desktop self-update handoff |
| `desktop/preload-main.cjs` | Minimal sandboxed bridge (`window.ellipsisDesktopUpdater`) exposing update checks, download progress, skip-version, and release notes to the main app window |
| `desktop/lib/updater.cjs` | GitHub release check, NSIS/portable `.exe` asset selection, SHA-256 verification, and Windows portable swap script generator |
| `desktop/lib/backends.cjs` | The list of backends, their release assets per GPU variant, ports and launch arguments |
| `desktop/lib/install.cjs` | Latest-release lookup, download, checksum, unpack into `<backends>/<id>.new`, swap in only when the program is found |
| `desktop/lib/download.cjs` | Resumable HTTPS download (`.part` file plus Range), redirects, SHA-256 |
| `desktop/lib/supervisor.cjs` | Child processes, health checks, logs, kills each process tree on quit; reuses a port that is already serving |
| `desktop/lib/audiocppConfig.cjs` | Writes copies of `audiocpp/config_wave*.json` with model paths pointing at the user's models folder and the right compute backend |
| `desktop/ui/` | The Backends window (plain HTML, no framework) |

audio.cpp is not launched directly. The desktop app runs `audio-studio-bridge.js`, which already
starts and swaps the audio.cpp daemon per wave. Three optional environment variables were added
to the bridge so it can run from a read-only install folder: `ELLIPSISPROSE_AUDIOCPP_CONFIG_DIR`,
`ELLIPSISPROSE_AUDIOCPP_CWD` and `ELLIPSISPROSE_BRIDGE_CACHE_DIR`. Without them it behaves as
before. `server.js` gained an optional `HOST` (the desktop app binds to loopback; default
unchanged).

## Building

Locally (Windows, Node 22):

```
npm ci
npm run build
cd desktop
npm ci
npm test
npm run dist        # desktop/release/EllipsisProse-Setup-<version>.exe and the portable exe
npm start           # run from source without packaging (uses ../dist)
```

On GitHub, `.github/workflows/desktop.yml`:

- Push a tag `v2.2.0` and the workflow builds both exes and attaches them, with `SHA256SUMS.txt`,
  to a **draft** release for that tag. Check it, then press Publish.
- Actions tab, Desktop app, Run workflow builds the same files as a downloadable artifact.
- Pull requests that touch the desktop code run the desktop tests on Linux and Windows.

The exe is unsigned, so Windows SmartScreen shows "unknown publisher" the first time. To sign,
add the repository secrets `WINDOWS_CERT_P12_BASE64` (base64 of a .pfx code-signing certificate)
and `WINDOWS_CERT_PASSWORD`; electron-builder picks them up.

## Tests

`desktop/test/` (Node's built-in runner, no Electron needed): asset selection against real
release asset names, resume after a dropped connection, checksum mismatch, redirects, a full
install of fake ComfyUI (.7z) and audio.cpp (.zip plus CUDA runtime) packages from a local fake
GitHub, the old install surviving a broken package, process supervision, and the real `server.js`
starting from the desktop's launch spec.

`ELLIPSISPROSE_RELEASE_API=<url>` points release lookups at another server, which is how the
install flow was also driven through the real Electron window in testing.

## Desktop self-updates

- On launch (and via **Help → Check for Updates…** or **Check for Updates** in the sidebar), the desktop shell queries `pacmanincarnate/WriteforMe` for the latest GitHub release and compares versions.
- When an update is available, the in-app **Update Available** dialog displays the GitHub release **What's Changed** changelog and offers **Download & Update**.
- **Installed (NSIS) builds** download `EllipsisProse-Setup-<version>.exe` into `%APPDATA%\EllipsisProse\updates`, verify its SHA-256 checksum (via GitHub asset digest or `SHA256SUMS.txt`), stop managed backend processes, launch the installer, and quit so the upgrade can proceed.
- **Portable builds** download `EllipsisProse-<version>-portable.exe`, verify its SHA-256 checksum, and (when the portable folder is writable) run a small Windows helper script that waits for the app to exit, swaps in the new `.exe`, and relaunches it.

## Not done yet

- Not yet run on a real Windows PC with real backend downloads. The CI Windows job runs the tests
  and the build; the first tagged build is the real check.
- audio.cpp's CUDA asset names were inferred from its README (only the CPU zips were visible when
  this was written). If they differ, Install shows the asset names it found and the regex in
  `desktop/lib/backends.cjs` needs a one-line fix.
- Krea 2 model downloads for ComfyUI are manual; the exact Hugging Face files are not pinned here.
