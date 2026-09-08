# EllipsisProse
AI-powered novel writer

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
