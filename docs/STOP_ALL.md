# Stop All

Double-click **Stop All.bat** (or run `npm run stop`) to close everything the launchers leave running. It is the counterpart of `Launch EllipsisProse.bat` and `Start Backends.bat`, whose services each sit in their own minimized window.

| Stopped | Found by |
| --- | --- |
| Web server (`server.js`) | Listens on port 3000, or `PORT` |
| Audio Studio Bridge (`audio-studio-bridge.js`) | Listens on port 5020, or `AUDIO_STUDIO_BRIDGE_PORT` |
| Codex bridge, Claude bridge | Listen on ports 5010 and 5011, or `CODEX_BRIDGE_PORT` and `CLAUDE_BRIDGE_PORT` |
| ComfyUI started from Settings | Runs inside the web server's process tree |
| Built-in embeddings (`llama-server`) | Runs inside the web server's process tree |
| Audio.cpp | Runs inside the Audio Studio Bridge's process tree |

A service is stopped only when the program on its port is `node` running that service's script, so another program that happens to use port 3000 is left alone. Each one is stopped with its whole process tree (`taskkill /T /F`), which takes ComfyUI, the embedding server and Audio.cpp with it and closes the minimized window.

## Leftovers

When a service was force-closed earlier, what it started can outlive it. Stop All also clears:

- a `llama-server` running from `data/embeddings/`;
- Audio.cpp, by the executable names the bridge itself clears (`audiocpp_server.exe`, `audiocpp.exe`, `audio-server.exe`);
- a ComfyUI carrying the launcher's flags whose starter is gone.

A ComfyUI you started yourself still has its starter and keeps running, the same rule as in [Launch ComfyUI](COMFYUI_LAUNCH.md). The desktop app is not touched: quit it from its own window.

## Code

- `Stop All.bat`: finds Node, runs `stop.js`. `--dry-run` lists what would be stopped.
- `stop.js`: `planStops` decides from a snapshot of processes and listening ports; `main` takes the snapshot and stops each tree. Windows only.
- Tests: `tests/unit/stop-all.test.ts`.
