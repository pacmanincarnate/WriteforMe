# Using your Claude Code login as the model (optional)

EllipsisProse can write with the Claude plan you already pay for, through the
Claude Code CLI's headless mode (`claude -p`). It works the same way as the
Codex bridge described in `CodexUse.md`.

## Setup

1. Install Node 18+ and [Claude Code](https://claude.com/claude-code) (the CLI, or the Claude desktop app, which carries its own copy).
2. Run `claude` once in a terminal and sign in with your Claude account.
3. Run `npm run claude-bridge` in the project folder and leave it running.
4. In Settings, pick **Claude Code** as the Active Provider. The default bridge
   URL is `http://localhost:5011`. Press **Refresh** if the status does not
   show **Online (signed in)**.

Review and Prose can use Claude Code on their own too: pick **Claude Code** as
the provider override for that role and leave the Primary on another provider.

## Models

Claude Code has no command that lists models, so the bridge offers its aliases:
`sonnet` (the default), `opus`, `haiku` and `fable`. Each always points at the
newest model of that family. Your plan may not include all of them; the bridge
reports the CLI's own message if a model is not available to you. You can also
type a full model name through the MCP server's `set_model_config`.

## What the bridge does and does not do

- It runs the official `claude` program you installed, one `claude -p` turn per
  request, and returns the text. It never reads, copies, stores or logs your
  login. Signing in and out stays in the CLI.
- Each turn runs in an empty temporary folder that is deleted afterwards, with
  every tool switched off, no MCP servers, no skills or slash commands, and no
  saved session. Claude only writes text here; it cannot touch your files.
- `ANTHROPIC_API_KEY` is removed from the CLI's environment, so an API key set
  for something else never silently replaces your plan. `/health` says how the
  CLI is signed in, without the account's email.
- It listens on `127.0.0.1` only by default. Like the Codex bridge it has no
  password, so do not bind it to a public address.

Each call is a full Claude Code run with a few seconds of overhead. Usage
counts against your Claude plan's limits. Claude follows Anthropic's usage
policy, so requests it declines come back as an error in the pipeline log.

## Options

`node claude-bridge.js --port 5011 --concurrency 2 --timeout 600 --bind 127.0.0.1 --cli-path <path to claude>`

The same settings can come from `CLAUDE_BRIDGE_PORT`, `CLAUDE_BRIDGE_CONCURRENCY`,
`CLAUDE_BRIDGE_TIMEOUT`, `CLAUDE_BRIDGE_BIND` and `CLAUDE_BRIDGE_CLI_PATH`.
The bridge finds Claude Code by itself: first whatever `claude` a terminal
would run, then the usual folders of the native installer, WinGet, npm, pnpm
and bun, then the copy the Claude desktop app keeps. Its window prints the
location it uses, or every place it looked when it finds nothing, and it looks
again each time Settings refreshes, so no restart is needed after installing.
Use `--cli-path` only when it is somewhere else. To use a second Claude account,
start the bridge with `CLAUDE_CONFIG_DIR` set to that account's folder, the
same way you would start `claude` for it.

## Embeddings

Claude Code does not embed, so it is not offered as an Embedding Provider.
Keep Gemini, OpenRouter, nano-GPT, KoboldCPP or the Codex bridge's local
embeddings for RAG.
