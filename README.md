# EllipsisProse
AI-powered novel writer

## Using your Codex CLI as the model (optional)

Requires Node 18+ and the Codex CLI installed on PATH and logged in. Run
`npm run codex-bridge` in the project folder, then pick **Codex CLI (local)**
in Settings. The default bridge URL is `http://localhost:5010`; leave the
model set to **Bridge default** to use your Codex configuration.

Each call is a full Codex run with several seconds of overhead. Usage counts
against your ChatGPT plan's Codex limits.
