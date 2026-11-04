import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebSocketServer } from "ws";

const WS_PORT = process.env.ELLIPSIS_MCP_PORT ? parseInt(process.env.ELLIPSIS_MCP_PORT, 10) : 3002;

let activeSocket = null;
let cachedBrowserStatus = null;
let reqIdCounter = 1;
const pendingRequests = new Map();

// Initialize WebSocket server for communicating with index.html
const wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

wss.on("connection", (ws) => {
    activeSocket = ws;
    console.error(`[EllipsisProse MCP] Browser client connected on port ${WS_PORT}`);

    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "status" && msg.payload) {
                cachedBrowserStatus = msg.payload;
                return;
            }
            if (msg.id && pendingRequests.has(msg.id)) {
                const { resolve, reject, timer } = pendingRequests.get(msg.id);
                clearTimeout(timer);
                pendingRequests.delete(msg.id);
                if (msg.success) {
                    resolve(msg.result);
                } else {
                    reject(new Error(msg.error || "Unknown error occurred in EllipsisProse browser bridge"));
                }
            }
        } catch (e) {
            console.error("[EllipsisProse MCP] Error parsing message from browser:", e.message);
        }
    });

    ws.on("close", () => {
        console.error("[EllipsisProse MCP] Browser client disconnected");
        if (activeSocket === ws) {
            activeSocket = null;
        }
    });

    ws.on("error", (err) => {
        console.error("[EllipsisProse MCP] WebSocket error:", err.message);
    });
});

wss.on("error", (err) => {
    console.error(`[EllipsisProse MCP] WebSocket Server error on port ${WS_PORT}:`, err.message);
});

// Helper to send actions to connected EllipsisProse browser instance
function sendToBrowser(action, params = {}, timeoutMs = 45000) {
    if (!activeSocket || activeSocket.readyState !== 1) {
        throw new Error(
            "EllipsisProse web app is not connected to the MCP bridge.\n" +
            "Please ensure EllipsisProse is open in your browser (e.g. at http://127.0.0.1:3000) and that the page is loaded."
        );
    }
    const id = `req_${reqIdCounter++}_${Date.now()}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Timeout waiting for EllipsisProse action '${action}' after ${timeoutMs / 1000}s.`));
        }, timeoutMs);

        pendingRequests.set(id, { resolve, reject, timer });
        activeSocket.send(JSON.stringify({ id, action, params }));
    });
}

// Create the MCP Server
const server = new McpServer({
    name: "ellipsisprose",
    version: "1.0.0"
});

// 1. get_bridge_status
server.tool(
    "get_bridge_status",
    "Checks the live connection status of EllipsisProse in the browser, including active story, current view, word count, and pipeline status.",
    {},
    async () => {
        if (!activeSocket || activeSocket.readyState !== 1) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            connected: false,
                            wsPort: WS_PORT,
                            message: "EllipsisProse is not currently connected. Please open http://127.0.0.1:3000 in your browser."
                        }, null, 2)
                    }
                ]
            };
        }
        try {
            const status = await sendToBrowser("getStatus", {}, 5000);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ connected: true, wsPort: WS_PORT, ...status }, null, 2)
                    }
                ]
            };
        } catch (err) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            connected: true,
                            wsPort: WS_PORT,
                            cachedStatus: cachedBrowserStatus,
                            warning: err.message
                        }, null, 2)
                    }
                ]
            };
        }
    }
);

// 2. start_new_story
server.tool(
    "start_new_story",
    "Resets the workspace and starts a new story in EllipsisProse with the provided concept. Can optionally begin AI story bible generation immediately.",
    {
        concept: z.string().describe("The core concept, pitch, or premise for the novel."),
        title: z.string().optional().describe("Working title for the story (optional)."),
        writingMode: z.enum(["novel", "screenplay", "short_story"]).optional().default("novel").describe("Format of the story (default: 'novel')."),
        autoStart: z.boolean().optional().default(true).describe("Whether to immediately begin the AI story bible generation pipeline (Tier 0.1 initStory). Default is true."),
        isAutopilot: z.boolean().optional().default(false).describe("If autoStart is true, whether to run autonomously in continuous Autopilot mode.")
    },
    async ({ concept, title, writingMode, autoStart, isAutopilot }) => {
        const result = await sendToBrowser("startNewStory", {
            concept,
            title: title || "",
            writingMode: writingMode || "novel",
            autoStart: autoStart !== false,
            isAutopilot: Boolean(isAutopilot)
        }, 60000);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 3. set_model_config
server.tool(
    "set_model_config",
    "Changes the selected model API provider, model, and endpoint settings across the application or specific role (dev, review, prose) in EllipsisProse.",
    {
        provider: z.enum(["gemini", "openrouter", "nanogpt", "koboldcpp", "codex"]).describe("The AI model API provider to select."),
        model: z.string().optional().describe("The specific model ID to set (e.g., 'gemini-2.0-flash', 'google/gemini-2.0-flash-001', 'gpt-4o', 'anthropic/claude-3.5-sonnet')."),
        role: z.enum(["all", "dev", "review", "prose"]).optional().default("all").describe("Role to apply to: 'all' (primary and all tiers), 'dev' (Master/Development), 'review' (Reviewer), or 'prose' (Prose Writer)."),
        apiKey: z.string().optional().describe("Optional API key to set for the provider (stored securely in browser localStorage)."),
        baseUrl: z.string().optional().describe("Optional endpoint URL for local providers (e.g. 'http://localhost:5001' for KoboldCPP, 'http://localhost:5010' for Codex Bridge).")
    },
    async ({ provider, model, role, apiKey, baseUrl }) => {
        const result = await sendToBrowser("setModelConfig", {
            provider,
            model: model || "",
            role: role || "all",
            apiKey: apiKey || "",
            baseUrl: baseUrl || ""
        }, 10000);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 4. get_model_config
server.tool(
    "get_model_config",
    "Retrieves the active model API configuration, configured models for each role (Dev, Review, Prose), and available provider options in EllipsisProse.",
    {},
    async () => {
        const result = await sendToBrowser("getModelConfig", {}, 10000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 5. get_active_story
server.tool(
    "get_active_story",
    "Retrieves the complete active story state including title, premise, character cast, world lore, outline, sequences, chapters/scenes, and word count.",
    {
        includeFullProse: z.boolean().optional().default(false).describe("If true, returns full scene prose. If false, returns outline structure and summaries to save context space.")
    },
    async ({ includeFullProse }) => {
        const result = await sendToBrowser("getActiveStory", { includeFullProse: Boolean(includeFullProse) }, 30000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 6. list_stories
server.tool(
    "list_stories",
    "Lists all stories stored in EllipsisProse's IndexedDB library with their ID, title, concept snippet, word count, and last modified date.",
    {},
    async () => {
        const result = await sendToBrowser("listStories", {}, 15000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 7. switch_story
server.tool(
    "switch_story",
    "Switches the active story in EllipsisProse to a specific story by its ID.",
    {
        storyId: z.string().describe("The ID of the story to load from the library (e.g. 'story_1700000000000').")
    },
    async ({ storyId }) => {
        const result = await sendToBrowser("switchStory", { storyId }, 15000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 8. get_pipeline_status
server.tool(
    "get_pipeline_status",
    "Checks what the AI writing pipeline is currently doing (e.g. idle, writing sequences, scene prose, reviewing) with step index, loading state, and continuous autopilot state.",
    {},
    async () => {
        const result = await sendToBrowser("getPipelineStatus", {}, 5000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 9. trigger_pipeline_step
server.tool(
    "trigger_pipeline_step",
    "Triggers a specific pipeline generation step or advances the novel generation process in EllipsisProse.",
    {
        action: z.enum(["step", "autopilot_toggle", "story_arc", "acts_sequences", "sequences", "scenes", "beats", "prose"]).describe("The pipeline step to execute. 'step' executes the next logical step in the pipeline waterfall. 'autopilot_toggle' starts or pauses continuous autopilot."),
        sequenceIndex: z.number().int().optional().describe("0-based index of the sequence (for scenes, beats, prose)."),
        sceneIndex: z.number().int().optional().describe("0-based index of the scene (for beats, prose).")
    },
    async ({ action, sequenceIndex, sceneIndex }) => {
        const result = await sendToBrowser("triggerPipelineStep", {
            action,
            sequenceIndex: sequenceIndex ?? 0,
            sceneIndex: sceneIndex ?? 0
        }, 120000);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 10. get_chapter
server.tool(
    "get_chapter",
    "Gets the details, outline beats, critique notes, and prose of a specific scene/chapter.",
    {
        sequenceIndex: z.number().int().describe("0-based sequence index."),
        sceneIndex: z.number().int().describe("0-based scene index.")
    },
    async ({ sequenceIndex, sceneIndex }) => {
        const result = await sendToBrowser("getChapter", { sequenceIndex, sceneIndex }, 15000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 11. inject_feedback
server.tool(
    "inject_feedback",
    "Injects directorial guidance or revision feedback into the running pipeline or feedback ledger.",
    {
        feedback: z.string().describe("The revision instruction, critique, or creative guidance to inject into the story.")
    },
    async ({ feedback }) => {
        const result = await sendToBrowser("injectFeedback", { feedback }, 10000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// 12. get_recent_logs
server.tool(
    "get_recent_logs",
    "Returns recent prompt execution logs, model responses, and pipeline events from the active story session.",
    {
        limit: z.number().int().optional().default(20).describe("Maximum number of log entries to retrieve (default: 20).")
    },
    async ({ limit }) => {
        const result = await sendToBrowser("getLogs", { limit: limit || 20 }, 10000);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

// Start Stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[EllipsisProse MCP] Server connected to stdio transport and WebSocket bridge active on ws://127.0.0.1:${WS_PORT}`);
