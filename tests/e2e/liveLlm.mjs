/**
 * Live-model support for the golden suite's `--mode live` (npm run test:live).
 *
 * The app under test runs in Chrome and normally sends its LLM calls to whichever provider is
 * configured in Settings. For a live test we do not want an API key inside the page, so the page's
 * `window.__callAIOverride` seam posts each call to a small relay on 127.0.0.1 (this file), and the
 * relay calls the Anthropic API from Node with the official SDK.
 *
 * Credentials: resolved by the SDK from the environment (ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN).
 * The key is never written to the page, to a log, to the transcript or to disk.
 *
 * Environment:
 *   ANTHROPIC_API_KEY     Required. Without it the live mode reports "skipped" and exits 0.
 *   LIVE_LLM_MODEL        Model id (default claude-opus-5-5). claude-haiku-5-5 is the cheap choice.
 *   LIVE_LLM_EFFORT       low | medium | high | xhigh | max (default low).
 *   LIVE_LLM_MAX_TOKENS   Per-call output cap (default 16000).
 *   LIVE_LLM_MAX_CALLS    Abort the run after this many model calls (default 120).
 *   LIVE_LLM_BASE_URL     Alternative API base URL (gateways, stubs). Default: the SDK's default.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

export const LIVE_DEFAULT_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const JSON_ONLY_NOTE = 'Respond with a single valid JSON value only. No markdown fences, no commentary before or after it.';

const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function liveConfigFromEnv(env = process.env) {
    return {
        hasCredentials: Boolean((env.ANTHROPIC_API_KEY || '').trim() || (env.ANTHROPIC_AUTH_TOKEN || '').trim()),
        model: (env.LIVE_LLM_MODEL || '').trim() || LIVE_DEFAULT_MODEL,
        effort: (env.LIVE_LLM_EFFORT || '').trim() || 'low',
        maxTokens: positiveInt(env.LIVE_LLM_MAX_TOKENS, 16000),
        maxCalls: positiveInt(env.LIVE_LLM_MAX_CALLS, 120),
        baseURL: (env.LIVE_LLM_BASE_URL || '').trim() || 'https://api.anthropic.com'
    };
}

/** Turns an SDK error into one readable line. Most specific class first. */
function describeApiError(error) {
    if (error instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the credentials (401). Check ANTHROPIC_API_KEY.';
    if (error instanceof Anthropic.PermissionDeniedError) return `Anthropic denied access (403): ${error.message}`;
    if (error instanceof Anthropic.NotFoundError) return `Model or endpoint not found (404): ${error.message}. Check LIVE_LLM_MODEL.`;
    if (error instanceof Anthropic.RateLimitError) return `Rate limited (429) after retries: ${error.message}`;
    if (error instanceof Anthropic.BadRequestError) return `Bad request (400): ${error.message}`;
    if (error instanceof Anthropic.APIConnectionError) return `Could not reach the Anthropic API: ${error.message}`;
    if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status ?? ''}: ${error.message}`;
    return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the model client. `complete()` sends one prompt and returns the reply text; `usage`
 * accumulates token counts for the whole run.
 */
export function createLiveLlm(config = liveConfigFromEnv()) {
    // The SDK reads the credentials from the environment itself; nothing here touches the key.
    const client = new Anthropic({ baseURL: config.baseURL, maxRetries: 3 });
    const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, refusals: 0, truncated: 0 };

    async function complete({ prompt, systemPrompt = '', isJson = false }) {
        if (usage.calls >= config.maxCalls) {
            throw new Error(`Live run stopped: more than ${config.maxCalls} model calls (LIVE_LLM_MAX_CALLS).`);
        }
        usage.calls += 1;
        const system = [String(systemPrompt || '').trim(), isJson ? JSON_ONLY_NOTE : ''].filter(Boolean).join('\n\n');
        let message;
        try {
            // Streaming keeps long generations clear of HTTP timeouts; finalMessage() collects the result.
            // fallbacks: "default" lets the API retry a policy decline on the model's default fallback;
            // on models without one the request simply runs on the requested model.
            message = await client.beta.messages
                .stream({
                    model: config.model,
                    max_tokens: config.maxTokens,
                    betas: [FALLBACK_BETA],
                    fallbacks: 'default',
                    output_config: { effort: config.effort },
                    ...(system ? { system } : {}),
                    messages: [{ role: 'user', content: String(prompt || '') }]
                })
                .finalMessage();
        } catch (error) {
            throw new Error(describeApiError(error));
        }
        usage.inputTokens += message.usage?.input_tokens ?? 0;
        usage.outputTokens += message.usage?.output_tokens ?? 0;
        usage.cacheReadTokens += message.usage?.cache_read_input_tokens ?? 0;
        if (message.stop_reason === 'refusal') {
            usage.refusals += 1;
            throw new Error(`The model declined this request (${message.stop_details?.category || 'no category'}).`);
        }
        if (message.stop_reason === 'max_tokens') usage.truncated += 1;
        return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    }

    return { complete, usage, config };
}

/**
 * Starts the 127.0.0.1 relay the page posts to. Only requests carrying the random per-run path
 * token are served, and only `allowedOrigin` gets CORS access.
 * `llm` is anything with `complete({ prompt, systemPrompt, isJson, logName })`.
 */
export function startLiveRelay({ llm, allowedOrigin }) {
    const token = crypto.randomBytes(18).toString('hex');
    const calls = [];
    const server = http.createServer((req, res) => {
        const cors = {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Allow-Private-Network': 'true'
        };
        if (req.url !== `/llm/${token}`) {
            res.writeHead(404, cors);
            res.end();
            return;
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204, cors);
            res.end();
            return;
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            const startedAt = Date.now();
            let logName = '';
            try {
                const request = JSON.parse(body || '{}');
                logName = String(request.logName || '');
                const text = await llm.complete(request);
                calls.push({ logName, ms: Date.now() - startedAt, ok: true, chars: text.length });
                res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text }));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                calls.push({ logName, ms: Date.now() - startedAt, ok: false, error: message });
                res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: message }));
            }
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}/llm/${token}`,
                calls,
                close: () => new Promise((done) => server.close(() => done()))
            });
        });
    });
}

/**
 * Page-side half: routes every app LLM call through the relay and keeps a transcript of
 * agent names (no prompts) in window.__goldenLiveTranscript. Evaluated in the page.
 */
export function liveOverrideSource(relayUrl) {
    return `(() => {
        window.__goldenLiveTranscript = [];
        window.__goldenLiveErrors = [];
        window.__callAIOverride = async (prompt, systemPrompt, isJson, logName) => {
            const entry = { logName: String(logName || ''), isJson: Boolean(isJson), startedAt: Date.now() };
            window.__goldenLiveTranscript.push(entry);
            const res = await fetch(${JSON.stringify(relayUrl)}, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ prompt, systemPrompt, isJson: Boolean(isJson), logName })
            });
            const data = await res.json().catch(() => ({ error: 'relay returned non-JSON' }));
            entry.ms = Date.now() - entry.startedAt;
            if (!res.ok || typeof data.text !== 'string') {
                entry.error = data.error || ('relay status ' + res.status);
                window.__goldenLiveErrors.push(entry.logName + ': ' + entry.error);
                throw new Error(entry.error);
            }
            entry.chars = data.text.length;
            // The app's parsers expect the provider's raw text. Models sometimes wrap JSON in a fence.
            if (!isJson) return data.text;
            return data.text.trim().replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/, '');
        };
    })()`;
}
