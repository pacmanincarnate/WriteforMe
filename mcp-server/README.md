# EllipsisProse MCP Server

A Model Context Protocol (MCP) server that provides a live two-way bridge between **Google Antigravity** and a running instance of **EllipsisProse** in the browser.

---

## Architecture Overview

```
┌──────────────────┐        stdio         ┌─────────────────────────┐       WebSocket        ┌───────────────────────────┐
│                  │   (JSON-RPC MCP)     │  EllipsisProse MCP      │    (JSON-RPC / WS)     │  EllipsisProse Web App    │
│   Antigravity    │ ◄──────────────────► │  Server (Node.js)       │  ◄───────────────────► │  (Browser / index.html)   │
│                  │                      │  • MCP Stdio Server     │    ws://127.0.0.1:3002 │  • React State / Stores   │
└──────────────────┘                      │  • WebSocket Server     │                        │  • Pipeline Controllers   │
                                          └─────────────────────────┘                        └───────────────────────────┘
```

1. **Antigravity to MCP Server (`stdio`)**: Antigravity launches the server via Node.js using standard MCP JSON-RPC over `stdio`.
2. **MCP Server to Browser (`ws://127.0.0.1:3002`)**: The MCP server listens for WebSocket connections from the web application running in any browser (desktop or mobile).
3. **Browser Bridge (`window.EllipsisProseBridge`)**: A modular bridge inside `index.html` receives actions, interacts with React state, the pipeline engines, and `storyStore` (IndexedDB), and returns results asynchronously.

---

## Configuration in Antigravity

The server is registered in `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "ellipsisprose": {
      "command": "node",
      "args": [
        "d:\\AI_Projects\\EllipsisProse\\WriteforMe\\mcp-server\\index.mjs"
      ]
    }
  }
}
```

---

## Available Tools

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `get_bridge_status` | *(none)* | Returns connection state, active story ID, title, current view, word count, and pipeline status. |
| `start_new_story` | `concept` (required), `title`, `writingMode`, `autoStart`, `isAutopilot` | Starts a new story canvas with the concept and optionally triggers the story bible initialization pipeline. |
| `set_model_config` | `provider` (required: `gemini`, `openrouter`, `nanogpt`, `koboldcpp`, `codex`), `model`, `role` (`all`, `dev`, `review`, `prose`), `apiKey`, `baseUrl` | Updates the active model API provider and model across the application or a specific tier role. |
| `get_model_config` | *(none)* | Returns active API provider, 3-model role configurations, and available settings. |
| `get_active_story` | `includeFullProse` (boolean, default: false) | Retrieves the active story bible, outline, characters, sequences, and word counts. |
| `list_stories` | *(none)* | Lists all stories saved in the browser's IndexedDB story library. |
| `switch_story` | `storyId` (required) | Switches the active story to a specific story in the library. |
| `get_pipeline_status` | *(none)* | Checks active agent execution, loading step, and continuous autopilot state. |
| `trigger_pipeline_step`| `action` (`step`, `autopilot_toggle`, `story_arc`, `acts_sequences`, `sequences`, `scenes`, `beats`, `prose`), `sequenceIndex`, `sceneIndex` | Triggers a generation or pipeline step in the writing waterfall. |
| `get_chapter` | `sequenceIndex`, `sceneIndex` | Returns scene metadata, beats, critique notes, and prose. |
| `inject_feedback` | `feedback` (required) | Injects directorial revision feedback into the current writing cycle. |
| `get_recent_logs` | `limit` (number, default: 20) | Retrieves recent prompt execution and reasoning logs. |

---

## How to Run

1. **Start the Web App**:
   ```bash
   npm run serve
   # or node server.js
   ```
   Open `http://localhost:3000` in your browser. The header will display a green `• Antigravity MCP` badge once the bridge connects.

2. **Run MCP Server Standalone (for testing)**:
   ```bash
   npm run mcp-server
   ```
