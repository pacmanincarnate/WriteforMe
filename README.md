# EllipsisProse
AI-powered novel writer

## One-click local backends (Windows)

Double-click **Start Backends.bat** in the project folder. On first run it
installs the npm packages for the Codex bridge and local embeddings, then it
opens the Codex bridge (port 5010) and ComfyUI (port 8188, started with
`--enable-cors-header`) in two minimized windows. Either is skipped when its
port is already in use, so it is safe to run again or to use alongside the
ComfyUI desktop app.

ComfyUI is located automatically: a saved choice in `backends.local.cmd`
(git-ignored), then the `ELLIPSISPROSE_COMFY_DIR` environment variable, then
the usual install folders (a ComfyUI, ComfyUI-Easy-Install or
ComfyUI_windows_portable folder next to the project, `~\comfy\ComfyUI`,
`~\ComfyUI`, `~\Documents\ComfyUI`, `C:\ComfyUI`, `D:\ComfyUI` and the
portable variants). If none match, a folder picker opens once and the choice
is saved. Portable installs launch with their embedded Python, clones with
their `venv` or `.venv`, otherwise `python` on PATH. Delete
`backends.local.cmd` to choose again, or set the variable to `skip` to never
start ComfyUI from here.

## Using your Codex CLI as the model (optional)

Requires Node 18+ and the Codex CLI installed on PATH and logged in. Run
`npm run codex-bridge` in the project folder, then pick **Codex CLI (local)**
in Settings. The default bridge URL is `http://localhost:5010`. New primary
model selections default to `gpt-5.6-luna`; choose **Bridge default** to use
your Codex configuration. Saved model choices, including Bridge default, are preserved.

Each call is a full Codex run with several seconds of overhead. Usage counts
against your ChatGPT plan's Codex limits.

For local embeddings, run `npm install` once to install the optional
`@xenova/transformers` package, then run `npm run codex-bridge` and pick
**Codex Bridge (local)** as the **Embedding Provider (RAG)** in Settings.
The bridge embeds in-process with `Xenova/bge-small-en-v1.5` (384 dimensions);
Codex CLI itself does not embed. First use downloads about 33 MB to
`~/.ellipsisprose/models`, which survives `node_modules` reinstalls. Override
the model with `--embedding-model` or `CODEX_BRIDGE_EMBEDDING_MODEL` if needed.
Switching embedding providers requires **Rebuild RAG index** in World Lore,
because vectors from different providers are incompatible.

`npm install` should report 0 vulnerabilities: `package.json` pins patched
`protobufjs` and `sharp` underneath the embeddings package via `overrides`.
Neither is used by the bridge's text path, but the pins keep the audit clean.

## Local images with ComfyUI (Krea 2)

Requires ComfyUI with a Krea 2 Turbo diffusion model, a Qwen3-VL-4B text
encoder, and the Qwen image VAE installed. Use these three separate models;
the all-in-one Krea 2 checkpoint does not include a text encoder.

Start ComfyUI with `--enable-cors-header` so the app can reach its HTTP API
from the browser. For example, add `--enable-cors-header` to the Python
command in your **Start ComfyUI** script. Keeping `--listen 127.0.0.1` keeps
ComfyUI local. To restrict CORS to the app's origin, use
`--enable-cors-header http://localhost:8765` if that is where you serve the app.

In Settings, select **ComfyUI (local, Krea 2)** as the **Image API Provider**.
The default URL is `http://127.0.0.1:8188`. Press **Refresh**, then choose the
**Diffusion model**, **Text encoder**, and **VAE**. No API key is needed.
An optional LoRA and its strength can also be selected. Cover and beat images
use these settings and the existing Story Art Style.

The first image loads the models and takes about a minute; later images take
seconds. The generation timeout defaults to 600 seconds and can be changed
in Settings.
