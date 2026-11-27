// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface BridgeSettings {
    port: number;
    concurrency: number;
    timeout: number;
    bind: string;
    'cli-path': string;
}
interface CliSystem {
    platform?: string;
    env?: Record<string, string | undefined>;
    home?: string;
}
interface CliPlan {
    command: string;
    prefix: string[];
    location: string;
}
interface ChatBody {
    model?: unknown;
    reasoning_effort?: unknown;
    response_format?: { type?: string };
    messages: Array<{ role: string; content: unknown }>;
}
interface ClaudeBridgeModule {
    LOGIN_STEP: string;
    PREAMBLE: string;
    parseSettings(argv: string[], env: Record<string, string | undefined>): BridgeSettings;
    cliEnvironment(env: Record<string, string | undefined>): Record<string, string | undefined>;
    models(): { data: Array<{ id: string }> };
    claudeArguments(opts: { model: string; effort?: string; systemFile: string }): string[];
    buildPrompt(body: ChatBody): { system: string; prompt: string };
    validateChatBody(body: unknown): string | null;
    parseClaudeOutput(stdout: string): {
        content?: string;
        usage?: Record<string, number>;
        error?: string;
    };
    parseLoginStatus(output: string | null): { loggedIn: boolean; method: string };
    cliLocations(cliPath: string, system?: CliSystem): string[];
    launchPlan(file: string, platform?: string): CliPlan | null;
    findCli(cliPath: string, system?: CliSystem): CliPlan | null;
    startBridge(settings: BridgeSettings): { server: Server; shutdown(): void };
}

const bridge = createRequire(import.meta.url)('../../claude-bridge.js') as ClaudeBridgeModule;

describe('claude-bridge: request and output handling', () => {
    it('parses options and rejects unknown or out-of-range ones', () => {
        expect(bridge.parseSettings([], {})).toEqual({
            port: 5011,
            concurrency: 2,
            timeout: 600,
            bind: '127.0.0.1',
            'cli-path': ''
        });
        const custom = bridge.parseSettings(['--port', '6000', '--cli-path', '/opt/claude'], {
            CLAUDE_BRIDGE_TIMEOUT: '30'
        });
        expect(custom).toMatchObject({ port: 6000, timeout: 30, 'cli-path': '/opt/claude' });
        expect(() => bridge.parseSettings(['--nope', '1'], {})).toThrow(/Usage/);
        expect(() => bridge.parseSettings(['--port', '70000'], {})).toThrow(/Invalid port/);
    });

    it('runs one tool-less, session-less print turn and never bare mode', () => {
        const args = bridge.claudeArguments({ model: 'opus', effort: 'high', systemFile: '/t/system.txt' });
        expect(args).toEqual([
            '-p',
            '--output-format',
            'json',
            '--system-prompt-file',
            '/t/system.txt',
            '--tools',
            '',
            '--strict-mcp-config',
            '--disable-slash-commands',
            '--no-session-persistence',
            '--model',
            'opus',
            '--effort',
            'high'
        ]);
        expect(bridge.claudeArguments({ model: 'sonnet', systemFile: 's' })).not.toContain('--effort');
        expect(args).not.toContain('--bare');
    });

    it('keeps an API key out of the CLI environment so the plan login is used', () => {
        const env = bridge.cliEnvironment({
            ANTHROPIC_API_KEY: 'sk-secret',
            CLAUDE_CONFIG_DIR: '/home/me/.claude-second',
            PATH: '/bin'
        });
        expect(env).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-second', PATH: '/bin' });
    });

    it('puts the system prompt in its own text and the request on stdin', () => {
        const plain = bridge.buildPrompt({
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You plan novels.' },
                { role: 'user', content: 'Outline act one.' }
            ]
        });
        expect(plain.system).toBe(`${bridge.PREAMBLE}\n\nYou plan novels.`);
        expect(plain.prompt).toBe(
            'Outline act one.\n\nRespond with a single valid JSON object and nothing else.'
        );

        const conversation = bridge.buildPrompt({
            messages: [
                { role: 'user', content: 'Draft it.' },
                { role: 'assistant', content: 'Draft one.' },
                { role: 'user', content: 'Tighten it.' }
            ]
        });
        expect(conversation.system).toBe(bridge.PREAMBLE);
        expect(conversation.prompt).toBe(
            'User:\nDraft it.\n\nAssistant:\nDraft one.\n\nUser:\nTighten it.\n\nAssistant:'
        );
    });

    it('validates chat bodies', () => {
        const user = [{ role: 'user', content: 'hi' }];
        expect(bridge.validateChatBody({ messages: user })).toBeNull();
        expect(bridge.validateChatBody({ messages: user, reasoning_effort: 'max' })).toBeNull();
        expect(bridge.validateChatBody({ messages: [{ role: 'user', content: null }] })).toMatch(/text messages/);
        expect(bridge.validateChatBody({ messages: [{ role: 'system', content: 's' }] })).toMatch(/non-empty/);
        expect(bridge.validateChatBody({ messages: user, model: 5 })).toBe('model must be a string');
        expect(bridge.validateChatBody({ messages: user, reasoning_effort: 'ultra' })).toBe(
            'Unsupported reasoning_effort'
        );
    });

    it('reads the result, usage, and failures from the CLI output', () => {
        const ok = bridge.parseClaudeOutput(
            JSON.stringify({
                type: 'result',
                subtype: 'success',
                is_error: false,
                result: ' prose ',
                usage: {
                    input_tokens: 2,
                    cache_creation_input_tokens: 10,
                    cache_read_input_tokens: 5,
                    output_tokens: 4
                }
            })
        );
        expect(ok).toEqual({
            content: 'prose',
            usage: { prompt_tokens: 17, completion_tokens: 4, total_tokens: 21 }
        });

        const viaArray = bridge.parseClaudeOutput(
            JSON.stringify([{ type: 'system' }, { type: 'result', subtype: 'success', result: 'x' }])
        );
        expect(viaArray.content).toBe('x');

        const signedOut = bridge.parseClaudeOutput(
            JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Please run /login' })
        );
        expect(signedOut.error).toBe(bridge.LOGIN_STEP);

        const badModel = bridge.parseClaudeOutput(
            JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'No such model' })
        );
        expect(badModel.error).toBe('Claude Code could not complete the request: No such model');

        expect(bridge.parseClaudeOutput('not json').error).toMatch(/not recognized/);
        expect(
            bridge.parseClaudeOutput(JSON.stringify({ type: 'result', subtype: 'success', result: '' })).error
        ).toBe('Claude Code returned no content');
    });

    it('reports only whether the CLI is signed in and how', () => {
        expect(
            bridge.parseLoginStatus(
                JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'someone@example.com' })
            )
        ).toEqual({ loggedIn: true, method: 'claude.ai' });
        expect(bridge.parseLoginStatus(JSON.stringify({ loggedIn: false }))).toEqual({
            loggedIn: false,
            method: ''
        });
        expect(bridge.parseLoginStatus(null)).toEqual({ loggedIn: false, method: '' });
        expect(bridge.parseLoginStatus('Logged in')).toEqual({ loggedIn: true, method: '' });
    });

    describe('finding Claude Code', () => {
        let home = '';
        const put = (...parts: string[]): string => {
            const file = path.join(home, ...parts);
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, '');
            return file;
        };
        const windows = (PATH = ''): CliSystem => ({
            platform: 'win32',
            home,
            env: {
                PATH,
                APPDATA: path.join(home, 'AppData', 'Roaming'),
                LOCALAPPDATA: path.join(home, 'AppData', 'Local')
            }
        });
        const NPM_SHIM = (target: string): string =>
            `@ECHO off\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%"  "%dp0%\\${target}" %*\r\n`;

        beforeEach(() => {
            home = mkdtempSync(path.join(tmpdir(), 'claude-home-'));
        });
        afterEach(() => rmSync(home, { recursive: true, force: true }));

        it('uses a full --cli-path as given and looks a bare command name up on PATH', () => {
            expect(bridge.cliLocations('/custom/claude')).toEqual(['/custom/claude']);
            expect(bridge.cliLocations('claude2', windows(path.join(home, 'bin')))).toEqual(
                ['claude2.exe', 'claude2.cmd', 'claude2.bat'].map((name) => path.join(home, 'bin', name))
            );
            expect(bridge.findCli(path.join(home, 'missing', 'claude'))).toBeNull();
        });

        it('finds nothing on a computer without Claude Code', () => {
            expect(bridge.findCli('', windows(path.join(home, 'bin')))).toBeNull();
            expect(bridge.findCli('', { platform: 'linux', home, env: { PATH: path.join(home, 'bin') } })).toBeNull();
        });

        it('takes the CLI a terminal would run, the program before its shim', () => {
            const exe = put('bin', 'claude.exe');
            put('bin', 'claude.cmd');
            put('.local', 'bin', 'claude.exe');
            expect(bridge.findCli('', windows(`"${path.join(home, 'empty')}";${path.join(home, 'bin')}`))).toEqual({
                command: exe,
                prefix: [],
                location: exe
            });
            const unix = put('unix', 'claude');
            expect(
                bridge.findCli('', { platform: 'linux', home, env: { PATH: `/nowhere:${path.join(home, 'unix')}` } })
            ).toMatchObject({ command: unix });
        });

        it('finds the native, WinGet and npm installs when PATH does not have them', () => {
            const npm = path.join(home, 'AppData', 'Roaming', 'npm');
            const script = put('AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
            mkdirSync(npm, { recursive: true });
            writeFileSync(path.join(npm, 'claude.cmd'), NPM_SHIM('node_modules\\@anthropic-ai\\claude-code\\cli.js'));
            expect(bridge.findCli('', windows())).toEqual({
                command: process.execPath,
                prefix: [script],
                location: path.join(npm, 'claude.cmd')
            });
            const winget = put('AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'claude.exe');
            expect(bridge.findCli('', windows())).toMatchObject({ command: winget });
            const native = put('.local', 'bin', 'claude.exe');
            expect(bridge.findCli('', windows())).toMatchObject({ command: native });
        });

        it('runs the program behind a batch shim, never the shim itself', () => {
            const program = put('npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
            const shim = path.join(home, 'npm', 'claude.cmd');
            writeFileSync(shim, NPM_SHIM('node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'));
            expect(bridge.launchPlan(shim, 'win32')).toEqual({ command: program, prefix: [], location: shim });
            // A shim written some other way still leads to the package beside it.
            writeFileSync(shim, '@echo off\r\nclaude-real %*\r\n');
            expect(bridge.launchPlan(shim, 'win32')).toMatchObject({ command: program });
            const lost = path.join(home, 'elsewhere', 'claude.cmd');
            mkdirSync(path.dirname(lost));
            writeFileSync(lost, '@echo off\r\nclaude-real %*\r\n');
            expect(bridge.launchPlan(lost, 'win32')).toBeNull();
        });

        it('falls back to the newest copy inside the Claude desktop app', () => {
            put('AppData', 'Roaming', 'Claude', 'claude-code', '2.9.4', 'claude.exe');
            const newest = put('AppData', 'Roaming', 'Claude', 'claude-code', '2.10.1', 'claude.exe');
            expect(bridge.findCli('', windows())).toMatchObject({ command: newest });
            rmSync(path.join(home, 'AppData', 'Roaming'), { recursive: true });
            const store = put(
                'AppData', 'Local', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude',
                'claude-code', '2.10.1', 'claude.exe'
            );
            expect(bridge.findCli('', windows())).toMatchObject({ command: store });
        });
    });

    it('lists the family aliases, default first', () => {
        expect(bridge.models().data.map((m) => m.id)).toEqual(['sonnet', 'opus', 'haiku', 'fable']);
    });
});

// A stand-in `claude` that records how it was called. Shell shebangs do not run on Windows.
describe.skipIf(process.platform === 'win32')('claude-bridge: HTTP server with a stand-in CLI', () => {
    const FAKE_CLI = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
if (args[0] === 'auth') {
    console.log(JSON.stringify({ loggedIn: process.env.FAKE_SIGNED_OUT !== '1', authMethod: 'claude.ai', email: 'a@b.c' }));
    process.exit(process.env.FAKE_SIGNED_OUT === '1' ? 1 : 0);
}
let stdin = '';
process.stdin.setEncoding('utf8').on('data', (c) => { stdin += c; }).on('end', () => {
    const system = fs.readFileSync(args[args.indexOf('--system-prompt-file') + 1], 'utf8');
    if (stdin.includes('FAIL_LOGIN')) {
        console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }));
        process.exit(1);
    }
    console.log(JSON.stringify({
        type: 'result', subtype: 'success', is_error: false,
        result: JSON.stringify({ args, stdin, system, cwdFiles: fs.readdirSync(process.cwd()), hasKey: 'ANTHROPIC_API_KEY' in process.env }),
        usage: { input_tokens: 3, output_tokens: 7 }
    }));
});
`;
    let dir = '';
    let running: { server: Server; shutdown(): void } | null = null;

    async function start(): Promise<string> {
        dir = mkdtempSync(path.join(tmpdir(), 'fake-claude-'));
        const cli = path.join(dir, 'claude');
        writeFileSync(cli, FAKE_CLI);
        chmodSync(cli, 0o755);
        running = bridge.startBridge({ port: 0, concurrency: 1, timeout: 30, bind: '127.0.0.1', 'cli-path': cli });
        const server = running.server;
        if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }

    afterEach(async () => {
        const server = running?.server;
        running?.shutdown();
        if (server?.listening) await new Promise((resolve) => server.close(resolve));
        running = null;
        if (dir) rmSync(dir, { recursive: true, force: true });
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.FAKE_SIGNED_OUT;
    });

    const post = (base: string, body: unknown): Promise<Response> =>
        fetch(`${base}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

    it('answers /health and /v1/models without exposing the account', async () => {
        const base = await start();
        const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
        expect(health).toMatchObject({
            ok: true,
            claude: '9.9.9 (Claude Code)',
            location: path.join(dir, 'claude'),
            login: { loggedIn: true, method: 'claude.ai' },
            default_model: 'sonnet'
        });
        expect(JSON.stringify(health)).not.toContain('a@b.c');
        const models = (await (await fetch(`${base}/v1/models`)).json()) as { data: Array<{ id: string }> };
        expect(models.data[0].id).toBe('sonnet');
    });

    it('reports a signed-out CLI in /health', async () => {
        process.env.FAKE_SIGNED_OUT = '1';
        const base = await start();
        const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
        expect(health.login).toEqual({ loggedIn: false, method: '' });
    });

    it('finds a CLI installed after the bridge started, without a restart', async () => {
        dir = mkdtempSync(path.join(tmpdir(), 'fake-claude-'));
        const cli = path.join(dir, 'claude');
        running = bridge.startBridge({ port: 0, concurrency: 1, timeout: 30, bind: '127.0.0.1', 'cli-path': cli });
        const server = running.server;
        if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const health = async (): Promise<Record<string, unknown>> =>
            (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
        expect(await health()).toMatchObject({ claude: null, location: null, login: { loggedIn: false } });
        const res = await post(base, { messages: [{ role: 'user', content: 'Write.' }] });
        expect(res.status).toBe(502);
        expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/was not found/);
        writeFileSync(cli, FAKE_CLI);
        chmodSync(cli, 0o755);
        expect(await health()).toMatchObject({ claude: '9.9.9 (Claude Code)', location: cli });
    });

    it('runs a completion in an empty folder that is removed afterwards', async () => {
        process.env.ANTHROPIC_API_KEY = 'sk-should-not-reach-the-cli';
        const base = await start();
        const before = readdirSync(tmpdir()).filter((name) => name.startsWith('claude-bridge-'));
        const res = await post(base, {
            model: 'opus',
            reasoning_effort: 'none',
            messages: [
                { role: 'system', content: 'SYS' },
                { role: 'user', content: 'Write.' }
            ]
        });
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            model: string;
            choices: Array<{ message: { content: string } }>;
            usage: Record<string, number>;
        };
        expect(data.model).toBe('opus');
        expect(data.usage).toEqual({ prompt_tokens: 3, completion_tokens: 7, total_tokens: 10 });
        const seen = JSON.parse(data.choices[0].message.content) as {
            args: string[];
            stdin: string;
            system: string;
            cwdFiles: string[];
            hasKey: boolean;
        };
        expect(seen.stdin).toBe('Write.');
        expect(seen.system).toBe(`${bridge.PREAMBLE}\n\nSYS`);
        expect(seen.cwdFiles).toEqual(['system.txt']);
        expect(seen.hasKey).toBe(false);
        expect(seen.args.slice(seen.args.indexOf('--model'))).toEqual(['--model', 'opus', '--effort', 'low']);
        expect(seen.args[seen.args.indexOf('--tools') + 1]).toBe('');
        const after = readdirSync(tmpdir()).filter((name) => name.startsWith('claude-bridge-'));
        expect(after).toEqual(before);
    });

    it('turns a missing login into the sign-in step, and rejects malformed requests', async () => {
        const base = await start();
        const signedOut = await post(base, { messages: [{ role: 'user', content: 'FAIL_LOGIN' }] });
        expect(signedOut.status).toBe(502);
        expect(((await signedOut.json()) as { error: { message: string } }).error.message).toBe(bridge.LOGIN_STEP);

        expect((await post(base, { messages: [{ role: 'user', content: null }] })).status).toBe(400);
        expect((await fetch(`${base}/v1/embeddings`, { method: 'POST', body: '{}' })).status).toBe(404);
    });
});
