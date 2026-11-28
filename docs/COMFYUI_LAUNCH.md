# Launch ComfyUI

Settings, Image Generation shows **Launch ComfyUI** whenever ComfyUI is not answering and the page is able to start it. It starts ComfyUI headless (no browser tab, no window) with the flags the app needs: `--enable-cors-header`, `--disable-auto-launch`, `--listen 127.0.0.1` and the port from the ComfyUI URL field.

| How you run the app | Who starts ComfyUI | When it closes |
| --- | --- | --- |
| Desktop app | The app's backend supervisor (`desktop/lib/controller.cjs`, `ensureComfyRunning` with `explicit`) | When the desktop app quits |
| `Launch EllipsisProse.bat`, `npm start`, `npm run dev` | `server.js` through `comfy-launcher.js` (`GET /api/comfyui/status`, `POST /api/comfyui/launch`) | When the web server stops (its window is closed, or Ctrl+C) |
| Single-file build, a static host, or another device on the LAN | Nobody: a web page alone cannot start programs, so the button is not shown | n/a |

A ComfyUI that was already running is used as it is and is never closed by the app.

## Where the launcher looks for ComfyUI

The desktop app uses the ComfyUI it installed, or the folder chosen in its Backends window. If none is installed the button reads **Install ComfyUI** and opens that window.

`server.js` looks, in order, at the folder typed into Settings (remembered in `data/comfyui-launcher.json`), the `COMFYUI_DIR` environment variable, then `ComfyUI_windows_portable` and `ComfyUI` next to the EllipsisProse folder and in the home folder. When none holds a `main.py`, the settings card asks for the folder. Portable builds use their `python_embeded`; a git clone uses its `venv` or `.venv`, or else the system Python (`COMFYUI_PYTHON` overrides it). Extra arguments go in `COMFYUI_ARGS`, for example `--cuda-device 1`.

## Safety

`/api/comfyui` only answers requests that come from this machine, are addressed to `localhost` or `127.0.0.1`, and are not sent by another site's page (`isLocalRequest` in `comfy-launcher.js`). The server only ever runs a ComfyUI `main.py`, and only on a loopback address.

## Code

- `src/views/settings/ComfyConnection.tsx`: the status line and button.
- `src/hooks/useComfyLauncher.ts`, `src/services/images/comfyLauncher.ts`: detection, launch, waiting until ComfyUI answers.
- `comfy-launcher.js`: the `server.js` side. It reuses `desktop/lib` (`launchSpec`, `Supervisor`), so both paths start ComfyUI the same way.
- Tests: `tests/unit/comfy-launcher.test.tsx`, `desktop/test/install.test.cjs`.
