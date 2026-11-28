import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectComfyLauncher, launchComfy } from '@/services/images';
import { ComfyConnection } from '@/views/settings/ComfyConnection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface StartSpec {
    command: string;
    args: string[];
    port: number;
    healthUrl: string;
}
interface FakeSupervisor {
    starts: StartSpec[];
    stopped: boolean;
    start(id: string, spec: StartSpec): Promise<{ status: string }>;
    status(id: string): { status: string; log: string[] };
    stopAll(): void;
}
interface LauncherModule {
    ComfyLauncher: new (o: {
        dataDir: string;
        rootDir: string;
        env?: Record<string, string | undefined>;
        supervisor?: FakeSupervisor;
    }) => {
        status(): { available: boolean; dir: string; status: string };
        launch(o: { url?: string; dir?: string }): Promise<{
            started: boolean;
            reason?: string;
            dir?: string;
            status?: string;
        }>;
        dispose(): void;
    };
    isLocalRequest(req: {
        socket: { remoteAddress: string };
        headers: { host?: string; origin?: string };
    }): boolean;
    loopbackPort(url: string): number | null;
}

const launcherModule = createRequire(import.meta.url)('../../comfy-launcher.js') as LauncherModule;
const { ComfyLauncher, isLocalRequest, loopbackPort } = launcherModule;

const tempDirs: string[] = [];
const mountedRoots: Root[] = [];

function tmp(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'comfy-launcher-'));
    tempDirs.push(dir);
    return dir;
}

function fakeComfyFolder(): string {
    const dir = path.join(tmp(), 'ComfyUI');
    mkdirSync(path.join(dir, 'venv', 'bin'), { recursive: true });
    writeFileSync(path.join(dir, 'main.py'), 'print(1)');
    writeFileSync(path.join(dir, 'venv', 'bin', 'python'), '');
    return dir;
}

function fakeSupervisor(): FakeSupervisor {
    let status = 'stopped';
    return {
        starts: [],
        stopped: false,
        async start(_id, spec) {
            this.starts.push(spec);
            status = 'starting';
            return { status };
        },
        status: () => ({ status, log: [] }),
        stopAll() {
            this.stopped = true;
        }
    };
}

afterEach(() => {
    while (mountedRoots.length) {
        const root = mountedRoots.pop();
        act(() => root?.unmount());
    }
    while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    delete window.ellipsisDesktopBackends;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('comfy-launcher.js', () => {
    it('starts ComfyUI headless with CORS on the port of the configured address', async () => {
        const dataDir = tmp();
        const folder = fakeComfyFolder();
        const supervisor = fakeSupervisor();
        const launcher = new ComfyLauncher({ dataDir, rootDir: tmp(), env: {}, supervisor });

        const result = await launcher.launch({ url: 'http://127.0.0.1:8190', dir: folder });

        expect(result).toMatchObject({ started: true, dir: folder, status: 'starting' });
        const spec = supervisor.starts[0];
        expect(spec.command).toBe(path.join(folder, 'venv', 'bin', 'python'));
        expect(spec.args).toEqual(
            expect.arrayContaining(['--enable-cors-header', '--disable-auto-launch', '--port', '8190'])
        );
        expect(spec.port).toBe(8190);
        expect(spec.healthUrl).toBe('http://127.0.0.1:8190/system_stats');
        // The folder is remembered, so the next launch needs none.
        expect(JSON.parse(readFileSync(path.join(dataDir, 'comfyui-launcher.json'), 'utf8'))).toEqual({
            dir: folder
        });
        expect(launcher.status().dir).toBe(folder);

        launcher.dispose();
        expect(supervisor.stopped).toBe(true);
    });

    it('asks for the folder when ComfyUI is not found, and refuses addresses on other machines', async () => {
        const supervisor = fakeSupervisor();
        const empty = tmp();
        const launcher = new ComfyLauncher({
            dataDir: tmp(),
            rootDir: path.join(empty, 'app'),
            env: {},
            supervisor
        });
        vi.spyOn(launcher as unknown as { findDir(): string }, 'findDir').mockReturnValue('');

        expect(await launcher.launch({ url: 'http://127.0.0.1:8188' })).toEqual({
            started: false,
            reason: 'not-found'
        });
        expect(await launcher.launch({ url: 'http://127.0.0.1:8188', dir: empty })).toEqual({
            started: false,
            reason: 'not-found'
        });
        expect(await launcher.launch({ url: 'http://192.168.1.20:8188' })).toEqual({
            started: false,
            reason: 'not-local'
        });
        expect(supervisor.starts).toHaveLength(0);
        expect(loopbackPort('https://127.0.0.1:8188')).toBeNull();
    });

    it('only serves the person at this machine', () => {
        const req = (remoteAddress: string, host: string, origin?: string) => ({
            socket: { remoteAddress },
            headers: { host, origin }
        });
        expect(isLocalRequest(req('127.0.0.1', 'localhost:3000', 'http://localhost:3000'))).toBe(true);
        expect(isLocalRequest(req('::ffff:127.0.0.1', '127.0.0.1:3000'))).toBe(true);
        expect(isLocalRequest(req('192.168.1.7', '192.168.1.2:3000'))).toBe(false);
        expect(isLocalRequest(req('127.0.0.1', 'localhost:3000', 'https://evil.example'))).toBe(false);
        expect(isLocalRequest(req('127.0.0.1', 'rebind.example:3000'))).toBe(false);
    });
});

describe('detectComfyLauncher and launchComfy', () => {
    it('finds no launcher when the page has no server behind it', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 404 })));
        expect(await detectComfyLauncher('http://127.0.0.1:8188')).toBeNull();
    });

    it('uses the launcher server for a loopback address and never for a remote one', async () => {
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
            Response.json(
                init?.method === 'POST'
                    ? { available: true, started: true, status: 'starting', dir: 'C:\\Comfy' }
                    : { available: true, status: 'stopped' }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        expect(await detectComfyLauncher('http://192.168.1.20:8188')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await detectComfyLauncher('http://localhost:8190')).toBe('server');
        expect(await launchComfy('server', 'http://localhost:8190')).toEqual({ ok: true, dir: 'C:\\Comfy' });
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe('/api/comfyui/launch');
        expect(JSON.parse(String(init?.body))).toEqual({ url: 'http://localhost:8190', dir: '' });
    });
});

describe('ComfyConnection', () => {
    const offline = { online: false, version: '', device: '', error: 'Cannot reach ComfyUI.' };

    async function mount(props: {
        comfyStatus: typeof offline;
        refreshComfyInfo: () => Promise<void>;
    }): Promise<HTMLElement> {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        mountedRoots.push(root);
        await act(async () => {
            root.render(<ComfyConnection comfyUrl="http://127.0.0.1:8188" {...props} />);
        });
        return host;
    }

    const launchButton = (host: HTMLElement) =>
        Array.from(host.querySelectorAll('button')).find((b) => /Launch|Install|Starting/.test(b.textContent || ''));

    it('shows no launch button where the page cannot start programs', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
        const host = await mount({ comfyStatus: offline, refreshComfyInfo: async () => {} });
        expect(launchButton(host)).toBeUndefined();
        expect(host.querySelector('[role="status"]')?.textContent).toBe('Cannot reach ComfyUI.');
    });

    it('launches through the desktop app and refreshes once ComfyUI is up', async () => {
        const launch = vi.fn(async () => ({ ok: true, value: { ready: true, started: true } }));
        window.ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning: vi.fn(async () => ({ ok: true })),
            launchComfy: launch,
            openBackendsWindow: vi.fn(async () => ({ ok: true })),
            onEvent: () => () => {}
        };
        const refresh = vi.fn(async () => {});
        const host = await mount({ comfyStatus: offline, refreshComfyInfo: refresh });
        expect(host.querySelector('[role="status"]')?.textContent).toBe('ComfyUI is not running.');

        await act(async () => {
            launchButton(host)?.click();
        });
        expect(launch).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalled();
    });

    it('offers the install window when the desktop app has no ComfyUI yet', async () => {
        const openBackendsWindow = vi.fn(async () => ({ ok: true }));
        window.ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning: vi.fn(async () => ({ ok: true })),
            launchComfy: vi.fn(async () => ({
                ok: true,
                value: { ready: false, started: false, reason: 'not-installed' }
            })),
            openBackendsWindow,
            onEvent: () => () => {}
        };
        const host = await mount({ comfyStatus: offline, refreshComfyInfo: async () => {} });
        await act(async () => {
            launchButton(host)?.click();
        });
        expect(launchButton(host)?.textContent).toBe('Install ComfyUI');
        await act(async () => {
            launchButton(host)?.click();
        });
        expect(openBackendsWindow).toHaveBeenCalledTimes(1);
    });

    it('asks for the ComfyUI folder when the launcher cannot find it', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) =>
                Response.json(
                    init?.method === 'POST'
                        ? { available: true, started: false, reason: 'not-found' }
                        : { available: true, status: 'stopped' }
                )
            )
        );
        const host = await mount({ comfyStatus: offline, refreshComfyInfo: async () => {} });
        expect(host.querySelector('input')).toBeNull();
        await act(async () => {
            launchButton(host)?.click();
        });
        expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('ComfyUI folder');
    });
});
