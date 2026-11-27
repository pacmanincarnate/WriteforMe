/*
 * Local Claude Code text-generation bridge for EllipsisProse.
 * Requires Node 18+ and a signed-in Claude Code: the CLI, or the copy inside the Claude desktop app.
 * Run: node claude-bridge.js
 * Options: --port 5011 --concurrency 2 --timeout 600 --bind 127.0.0.1 --cli-path <path to claude>
 * Environment: CLAUDE_BRIDGE_PORT, CONCURRENCY, TIMEOUT, BIND, CLI_PATH (same prefix).
 * Exposes /health, /v1/models, and non-streaming /v1/chat/completions (the Codex bridge's contract).
 *
 * The bridge runs the official, unmodified `claude` program the user installed and signed in to
 * themselves, one `claude -p` turn per request. It never reads, copies, stores, logs or forwards
 * the login: the CLI handles all of that. Each turn runs in an empty temporary directory (removed
 * afterwards) with the system prompt in a file there, the request on stdin, every tool off, no MCP
 * servers, no skills or slash commands, and nothing saved as a session. `--bare` is never passed,
 * because bare mode ignores the plan login. ANTHROPIC_API_KEY is left out of the CLI's environment
 * so a key set for something else never silently takes the place of the plan. CLAUDE_CONFIG_DIR is
 * passed through, so a second account's folder works the same way it does in a terminal.
 */
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const PORTS = require('./src/config/ports.json');

const USAGE = `Usage: node claude-bridge.js [--port ${PORTS.claudeBridge}] [--concurrency 2] [--timeout 600] [--bind 127.0.0.1] [--cli-path <path to claude>]`;
// Claude Code has no command that lists models. Its aliases always point at the newest model of
// each family; a plan may not include all of them, which is only known when a request is sent.
const MODELS = [['sonnet', 'Sonnet (newest)'], ['opus', 'Opus (newest)'], ['haiku', 'Haiku (newest)'], ['fable', 'Fable (newest)']];
const DEFAULT_MODEL = 'sonnet';
const PREAMBLE = 'You are being used as a pure text-generation model by a writing application. Do not run commands, do not read or write files, do not browse, do not ask questions, and do not add commentary before or after the requested output. Produce only the output the instructions ask for.';
const CLI_MISSING = 'Claude Code was not found. Install it from claude.com/claude-code, sign in by running "claude" once in a terminal, or pass --cli-path with its full location.';
const LOGIN_STEP = 'Claude Code is not signed in. Run "claude" once in a terminal on this computer, sign in with your Claude account, then try again.';
// Words the CLI uses when its login is missing or expired.
const AUTH_SIGNS = ['/login', 'not logged in', 'authenticat', 'oauth', 'invalid api key'];
// Kept out of the CLI's environment so it uses the plan login, not an API key.
const DROPPED_ENV = ['ANTHROPIC_API_KEY'];
const EFFORT_MAP = { none: 'low', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' };
const ROLE_LABELS = { user: 'User', assistant: 'Assistant' };

function parseSettings(argv, env) {
    const settings = {
        port: env.CLAUDE_BRIDGE_PORT || PORTS.claudeBridge,
        concurrency: env.CLAUDE_BRIDGE_CONCURRENCY || 2,
        timeout: env.CLAUDE_BRIDGE_TIMEOUT || 600,
        bind: env.CLAUDE_BRIDGE_BIND || '127.0.0.1',
        'cli-path': env.CLAUDE_BRIDGE_CLI_PATH || ''
    };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        if (!argv[i].startsWith('--') || !Object.hasOwn(settings, key) || !argv[i + 1]) throw new Error(USAGE);
        settings[key] = argv[i + 1];
    }
    for (const key of ['port', 'concurrency', 'timeout']) {
        settings[key] = Number(settings[key]);
        const max = key === 'port' ? 65535 : key === 'timeout' ? 2147483 : Number.MAX_SAFE_INTEGER;
        if (!Number.isSafeInteger(settings[key]) || settings[key] < 1 || settings[key] > max) {
            throw new Error(`Invalid ${key}: expected a positive integer no greater than ${max}`);
        }
    }
    return settings;
}

function cliEnvironment(env = process.env) {
    return Object.fromEntries(Object.entries(env).filter(([name]) => !DROPPED_ENV.includes(name)));
}

function models() {
    return { object: 'list', data: MODELS.map(([id, display_name]) => ({ id, object: 'model', display_name })) };
}

function claudeArguments({ model, effort, systemFile }) {
    const args = ['-p', '--output-format', 'json', '--system-prompt-file', systemFile, '--tools', '',
        '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--model', model];
    if (effort) args.push('--effort', effort);
    return args;
}

/**
 * Splits an OpenAI-style request into the system prompt file's text and the stdin prompt.
 * A plain system + user request goes through as is; a longer conversation becomes one transcript.
 */
function buildPrompt(body) {
    const system = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n').trim();
    const turns = body.messages.filter(m => m.role !== 'system');
    let prompt = turns.every(m => m.role === 'user')
        ? turns.map(m => m.content).join('\n\n')
        : turns.map(m => `${ROLE_LABELS[m.role] || m.role}:\n${m.content}`).join('\n\n') + '\n\nAssistant:';
    if (body.response_format?.type === 'json_object') prompt += '\n\nRespond with a single valid JSON object and nothing else.';
    return { system: system ? `${PREAMBLE}\n\n${system}` : PREAMBLE, prompt };
}

function validateChatBody(body) {
    if (!body || !Array.isArray(body.messages) || body.messages.some(m => !m || typeof m.role !== 'string' || typeof m.content !== 'string')) {
        return 'messages must be an array of { role, content } text messages';
    }
    if (!body.messages.some(m => m.role !== 'system' && m.content.trim())) return 'messages must include a non-empty user message';
    if (body.model !== undefined && typeof body.model !== 'string') return 'model must be a string';
    if (body.reasoning_effort !== undefined && !Object.hasOwn(EFFORT_MAP, body.reasoning_effort)) return 'Unsupported reasoning_effort';
    return null;
}

function isAuthFailure(text) {
    const lower = String(text || '').toLowerCase();
    return AUTH_SIGNS.some(sign => lower.includes(sign));
}

/** Turns the CLI's `--output-format json` output into { content, usage } or { error }. */
function parseClaudeOutput(stdout) {
    let data;
    try { data = JSON.parse(stdout); } catch (_) { return { error: 'Claude Code output was not recognized.' }; }
    const result = Array.isArray(data) ? data.findLast(entry => entry?.type === 'result') : data;
    if (!result || result.type !== 'result') return { error: 'Claude Code output was not recognized.' };
    const text = typeof result.result === 'string' ? result.result.trim() : '';
    if (result.is_error || result.subtype !== 'success') {
        return { error: isAuthFailure(text) ? LOGIN_STEP : `Claude Code could not complete the request: ${text || result.subtype || 'unknown error'}` };
    }
    if (!text) return { error: 'Claude Code returned no content' };
    const u = result.usage || {};
    const prompt_tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const completion_tokens = u.output_tokens || 0;
    return { content: text, usage: { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens } };
}

const isFile = file => {
    try { return fs.statSync(file).isFile(); } catch (_) { return false; }
};
const subfolders = dir => {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); } catch (_) { return []; }
};

/**
 * Every file that may be Claude Code, best first: what a terminal would run (PATH), then the usual
 * folders of the native installer, the package managers, and the copy the Claude desktop app keeps.
 * A bridge started from a shortcut or an old terminal often has a PATH without the CLI, so the
 * folders are checked even when PATH comes up empty.
 */
function cliLocations(cliPath, { platform = process.platform, env = process.env, home = os.homedir() } = {}) {
    const windows = platform === 'win32';
    const names = windows ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude'];
    const onPath = name => (env.PATH || env.Path || '').split(windows ? ';' : ':')
        .map(dir => dir.replace(/^"|"$/g, '')).filter(Boolean).map(dir => path.join(dir, name));
    if (cliPath) {
        // A full location is used as given; a bare command name (claude2) is looked up on PATH.
        if (/[\\/]/.test(cliPath)) return [cliPath];
        return (windows && !path.extname(cliPath) ? ['.exe', '.cmd', '.bat'] : ['']).flatMap(ext => onPath(cliPath + ext));
    }
    // PATH order wins, as in a terminal; inside one folder the program beats its batch shim.
    const found = onPath('').flatMap(dir => names.map(name => path.join(dir, name)));
    const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    // The desktop app keeps one folder per Claude Code version; the newest comes first.
    const desktop = root => subfolders(path.join(root, 'claude-code'))
        .sort((x, y) => y.localeCompare(x, undefined, { numeric: true }))
        .map(version => path.join(root, 'claude-code', version, names[0]));
    if (windows) {
        found.push(
            path.join(home, '.local', 'bin', 'claude.exe'),
            path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'claude.exe'),
            path.join(appData, 'npm', 'claude.cmd'),
            path.join(localAppData, 'pnpm', 'claude.cmd'),
            path.join(home, '.bun', 'bin', 'claude.exe'),
            ...desktop(path.join(appData, 'Claude')),
            // The Microsoft Store build of the desktop app keeps its data under Packages.
            ...subfolders(path.join(localAppData, 'Packages')).filter(name => /^(AnthropicPBC\.)?Claude_/i.test(name))
                .flatMap(name => desktop(path.join(localAppData, 'Packages', name, 'LocalCache', 'Roaming', 'Claude')))
        );
    } else {
        found.push(
            path.join(home, '.local', 'bin', 'claude'),
            path.join(home, '.claude', 'local', 'claude'),
            '/opt/homebrew/bin/claude',
            '/usr/local/bin/claude',
            path.join(home, '.npm-global', 'bin', 'claude'),
            path.join(home, '.bun', 'bin', 'claude'),
            ...desktop(path.join(home, 'Library', 'Application Support', 'Claude'))
        );
    }
    return [...new Set(found)];
}

/**
 * How to start one found file: { command, prefix, location }, or null when it cannot be started.
 * Node cannot spawn a Windows batch shim without a shell, and a shell would re-read the request's
 * arguments. So a shim is read as text for the program or script it starts, and that is run instead.
 */
function launchPlan(file, platform = process.platform) {
    if (!isFile(file)) return null;
    if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(file)) return { command: file, prefix: [], location: file };
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
    const dir = path.dirname(file);
    // npm, pnpm and bun shims name their target relative to the shim's own folder (%dp0% or %~dp0).
    const named = [...text.matchAll(/%~?dp0%?[\\/]?([^"\r\n%]+?)"/gi)].map(match => match[1]);
    const usual = ['bin/claude.exe', 'cli.js'].map(tail => `node_modules/@anthropic-ai/claude-code/${tail}`);
    for (const target of [...named.reverse(), ...usual]) {
        const resolved = path.join(dir, ...target.split(/[\\/]+/));
        if (/(^|[\\/])node\.exe$/i.test(target) || !isFile(resolved)) continue;
        if (/\.[cm]?js$/i.test(resolved)) return { command: process.execPath, prefix: [resolved], location: file };
        if (/\.exe$/i.test(resolved)) return { command: resolved, prefix: [], location: file };
    }
    return null;
}

/** The first place Claude Code can be started from, or null. */
function findCli(cliPath, system = {}) {
    for (const file of cliLocations(cliPath, system)) {
        const plan = launchPlan(file, system.platform);
        if (plan) return plan;
    }
    return null;
}

function killTree(child) {
    if (!child?.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
        killer.on('exit', code => { if (code) child.kill('SIGKILL'); });
    } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    }
}

function spawnClaude(cli, args, cwd, onChild) {
    return new Promise((resolve, reject) => {
        if (!cli) { reject(new Error(CLI_MISSING)); return; }
        let child;
        const failed = error => reject(new Error(`Could not start Claude Code at ${cli.location}: ${error.message}`));
        try {
            child = spawn(cli.command, [...cli.prefix, ...args], { cwd, env: cliEnvironment(), windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (error) {
            failed(error);
            return;
        }
        child.once('error', failed);
        child.once('spawn', () => {
            child.removeListener('error', failed);
            child.on('error', reject);
            resolve(child);
        });
        onChild(child);
    });
}

/** Runs a short CLI command and resolves its stdout, or null when it fails or times out. */
async function probe(cli, args, timeoutMs) {
    let child;
    const timer = setTimeout(() => killTree(child), timeoutMs);
    try {
        child = await spawnClaude(cli, args, os.tmpdir(), c => { child = c; });
        let output = '';
        child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
        child.stderr.resume();
        child.stdin.on('error', () => {});
        child.stdin.end();
        return await new Promise(resolve => child.once('close', code => resolve(code === 0 ? output.trim() : null)));
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** `claude auth status`: only whether the CLI is signed in and how. Nothing else from it is kept. */
function parseLoginStatus(output) {
    if (output === null) return { loggedIn: false, method: '' };
    let status = {};
    try { status = JSON.parse(output || '{}'); } catch (_) { /* Older CLIs print text; exit code 0 still means signed in. */ }
    if (!status || typeof status !== 'object' || Array.isArray(status)) status = {};
    return { loggedIn: status.loggedIn !== false, method: String(status.authMethod || '') };
}

function send(res, status, body) {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

function startBridge(settings) {
    const waiting = [];
    const active = new Set();
    let stopping = false;
    // Looked for again on every request until it is found, so installing it needs no bridge restart.
    let cli = null;
    const findClaude = () => {
        if (cli && !fs.existsSync(cli.command)) cli = null;
        if (!cli && (cli = findCli(settings['cli-path']))) console.log(`Claude Code found at ${cli.location}`);
        return cli;
    };
    // Each check starts the CLI, so answers are kept: the version for good, the login briefly.
    let version = null;
    let login = { at: 0, value: null };
    const claudeVersion = () => (version ||= probe(findClaude(), ['--version'], 15000).then(found => { if (!found) version = null; return found; }));
    const loginStatus = () => {
        if (!login.value || Date.now() - login.at > 30000) {
            login = { at: Date.now(), value: probe(findClaude(), ['auth', 'status', '--json'], 20000).then(parseLoginStatus) };
        }
        return login.value;
    };
    // Settings gives /health a few seconds. A slow first start of the CLI is reported as still unknown, not as missing.
    const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms, undefined).unref())]);
    if (findClaude()) { claudeVersion(); loginStatus(); }
    else console.log(`Claude Code was not found yet. Looked in:\n  ${cliLocations(settings['cli-path']).join('\n  ')}`);

    async function complete(job) {
        let dir;
        try {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-bridge-'));
            const systemFile = path.join(dir, 'system.txt');
            fs.writeFileSync(systemFile, job.system, 'utf8');
            const child = await spawnClaude(findClaude(), claudeArguments({ model: job.model, effort: job.effort, systemFile }), dir, c => { job.child = c; });
            console.log(`claude -p started pid=${child.pid} model=${JSON.stringify(job.model)} effort=${job.effort || 'default'} (queued ${Date.now() - job.started}ms)`);
            let stdout = '';
            let stderr = '';
            child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
            child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
            const closed = new Promise(resolve => child.once('close', resolve));
            child.stdin.on('error', () => {}); // Early CLI rejection can close stdin before the prompt is consumed.
            child.stdin.end(job.prompt);
            if (job.cancelled) killTree(child);
            const code = await closed;
            if (job.cancelled) return;
            const stderrTail = stderr.trim().split(/\r?\n/).slice(-20).join('\n');
            // A failed turn still prints its result object, which says why, so read stdout first.
            const parsed = parseClaudeOutput(stdout);
            if (parsed.error) {
                const message = code !== 0 && !stdout.trim()
                    ? (isAuthFailure(stderrTail) ? LOGIN_STEP : `claude -p exited with code ${code}: ${stderrTail || 'No stderr output'}`)
                    : parsed.error;
                if (message === LOGIN_STEP) login = { at: 0, value: null };
                send(job.res, 502, { error: { message } });
                return;
            }
            send(job.res, 200, {
                id: `chatcmpl-${crypto.randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000),
                model: job.model, choices: [{ index: 0, message: { role: 'assistant', content: parsed.content }, finish_reason: 'stop' }],
                usage: parsed.usage
            });
        } catch (error) {
            if (!job.cancelled) send(job.res, 502, { error: { message: error.message } });
        } finally {
            clearTimeout(job.timer);
            if (dir && path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('claude-bridge-')) {
                try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
                catch (error) { console.error(`Could not remove request directory ${dir}: ${error.message}`); }
            }
        }
    }

    function drain() {
        while (!stopping && active.size < settings.concurrency && waiting.length) {
            const job = waiting.shift();
            active.add(job);
            complete(job).finally(() => { active.delete(job); drain(); });
        }
    }

    const server = http.createServer(async (req, res) => {
        const started = Date.now();
        let model = DEFAULT_MODEL;
        let effort;
        const route = req.url.split('?')[0];
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.once('finish', () => console.log(`${req.method} ${JSON.stringify(route)} model=${JSON.stringify(model)} effort=${effort || 'default'} duration=${Date.now() - started}ms status=${res.statusCode}`));
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET' && route === '/v1/models') { send(res, 200, models()); return; }
        if (req.method === 'GET' && route === '/health') {
            const found = findClaude();
            const [known, signedIn] = found ? await Promise.all([within(claudeVersion(), 4000), within(loginStatus(), 4000)]) : [];
            send(res, 200, {
                ok: true, claude: found ? known || 'version unknown' : null, location: found ? found.location : null,
                login: found ? signedIn || null : { loggedIn: false, method: '' },
                default_model: model, queue: { active: active.size, waiting: waiting.length }
            });
            return;
        }
        if (req.method !== 'POST' || route !== '/v1/chat/completions') { send(res, 404, { error: { message: 'Not found' } }); return; }
        try {
            let raw = '';
            req.setEncoding('utf8');
            for await (const chunk of req) raw += chunk;
            const body = JSON.parse(raw);
            const invalid = validateChatBody(body);
            if (invalid) { send(res, 400, { error: { message: invalid } }); return; }
            model = body.model?.trim() || model;
            if (body.reasoning_effort !== undefined) effort = EFFORT_MAP[body.reasoning_effort];
            if (stopping) { send(res, 503, { error: { message: 'Bridge is stopping' } }); return; }
            const job = { res, model, effort, ...buildPrompt(body), child: null, cancelled: false, started };
            console.log(`POST "/v1/chat/completions" model=${JSON.stringify(model)} effort=${effort || 'default'} queued (active ${active.size}, waiting ${waiting.length}, prompt ${job.system.length + job.prompt.length} chars)`);
            // The deadline includes FIFO queue time; timed-out jobs never start later.
            job.timer = setTimeout(() => {
                job.cancelled = true;
                const index = waiting.indexOf(job);
                if (index !== -1) waiting.splice(index, 1);
                killTree(job.child);
                send(res, 504, { error: { message: `claude -p timed out after ${settings.timeout} s` } });
            }, settings.timeout * 1000);
            // A browser that gives up should not leave a turn running on the user's plan.
            res.once('close', () => {
                if (res.writableEnded || job.cancelled) return;
                job.cancelled = true;
                clearTimeout(job.timer);
                const index = waiting.indexOf(job);
                if (index !== -1) waiting.splice(index, 1);
                killTree(job.child);
            });
            waiting.push(job);
            drain();
        } catch (error) {
            send(res, error instanceof SyntaxError ? 400 : 500, { error: { message: error.message } });
        }
    });
    server.timeout = 0;
    server.listen(settings.port, settings.bind, () => console.log(`Claude Code bridge listening on http://${settings.bind}:${settings.port} (concurrency ${settings.concurrency}, timeout ${settings.timeout}s)`));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });

    function shutdown() {
        stopping = true;
        for (const job of [...waiting.splice(0), ...active]) {
            job.cancelled = true;
            clearTimeout(job.timer);
            killTree(job.child);
            send(job.res, 503, { error: { message: 'Bridge is stopping' } });
        }
        server.close();
        server.closeIdleConnections?.();
    }
    return { server, shutdown };
}

if (require.main === module) {
    const { shutdown } = startBridge(parseSettings(process.argv.slice(2), process.env));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

module.exports = {
    parseSettings, cliEnvironment, models, claudeArguments, buildPrompt, validateChatBody,
    parseClaudeOutput, parseLoginStatus, cliLocations, launchPlan, findCli, isAuthFailure, startBridge, LOGIN_STEP, PREAMBLE
};
