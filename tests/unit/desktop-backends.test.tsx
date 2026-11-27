import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isKoboldReachable, useDesktopBackends } from '@/hooks';
import { fetchComfyInfoCatalog, generateComfyImage, isLocalComfyUrl } from '@/services/images';
import { callKoboldCPP, checkKoboldCPPStatus, isLocalKoboldUrl } from '@/services/llm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

function TestToastSubscriber({
    showToast
}: {
    showToast: (message: string, type?: string) => void;
}) {
    useDesktopBackends({ showToast });
    return null;
}

afterEach(() => {
    while (mountedRoots.length) {
        const root = mountedRoots.pop();
        act(() => root?.unmount());
    }
    delete window.ellipsisDesktopBackends;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useDesktopBackends', () => {
    it('forwards desktop backend events to showToast and unsubscribes on unmount', () => {
        let listener: ((evt: { type: string; message: string; level?: 'success' | 'error' | 'info' | 'warning' }) => void) | null = null;
        const unsubscribe = vi.fn();
        window.ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning: vi.fn(async () => ({ ok: true, value: { ready: true, started: false } })),
            openBackendsWindow: vi.fn(async () => ({ ok: true })),
            onEvent: vi.fn((cb) => {
                listener = cb;
                return unsubscribe;
            })
        };

        const showToast = vi.fn();
        const container = document.createElement('div');
        const root = createRoot(container);
        mountedRoots.push(root);

        act(() => {
            root.render(<TestToastSubscriber showToast={showToast} />);
        });

        expect(listener).not.toBeNull();
        act(() => {
            listener?.({ type: 'install-complete', message: 'KoboldCpp installed successfully.', level: 'success' });
        });
        expect(showToast).toHaveBeenCalledWith('KoboldCpp installed successfully.', 'success');

        act(() => {
            root.unmount();
        });
        mountedRoots.pop();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('on-demand KoboldCpp desktop startup', () => {
    it('detects local KoboldCpp URLs accurately', () => {
        expect(isLocalKoboldUrl('http://127.0.0.1:5001')).toBe(true);
        expect(isLocalKoboldUrl('http://localhost:5001/v1')).toBe(true);
        expect(isLocalKoboldUrl('http://192.168.1.10:5001')).toBe(false);
        expect(isLocalKoboldUrl('http://127.0.0.1:5010')).toBe(false);
    });

    it('calls ensureKoboldRunning on callKoboldCPP and isKoboldReachable, but not on checkKoboldCPPStatus', async () => {
        const ensureKoboldRunning = vi.fn(async () => ({
            ok: true,
            value: { ready: true, started: true, status: 'running' }
        }));
        window.ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning,
            openBackendsWindow: vi.fn(async () => ({ ok: true })),
            onEvent: vi.fn(() => () => {})
        };

        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/v1/models')) {
                return new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), { status: 200 });
            }
            return new Response(
                JSON.stringify({
                    model: 'local-model',
                    choices: [{ message: { role: 'assistant', content: 'Hello there.' } }]
                }),
                { status: 200 }
            );
        });
        vi.stubGlobal('fetch', fetchMock);

        // Passive status check must NOT wake KoboldCpp into VRAM.
        const status = await checkKoboldCPPStatus('http://127.0.0.1:5001');
        expect(status.online).toBe(true);
        expect(ensureKoboldRunning).not.toHaveBeenCalled();

        // Actual generation call MUST wake KoboldCpp first.
        const text = await callKoboldCPP('http://127.0.0.1:5001', 'koboldcpp', 'Say hi', '', false);
        expect(text).toBe('Hello there.');
        expect(ensureKoboldRunning).toHaveBeenCalledTimes(1);

        // Continuous autopilot preflight also wakes KoboldCpp on demand.
        const reachable = await isKoboldReachable('http://localhost:5001');
        expect(reachable).toBe(true);
        expect(ensureKoboldRunning).toHaveBeenCalledTimes(2);
    });
});

describe('on-demand ComfyUI desktop startup', () => {
    it('detects local ComfyUI URLs accurately', () => {
        expect(isLocalComfyUrl('http://127.0.0.1:8188')).toBe(true);
        expect(isLocalComfyUrl('http://localhost:8188/')).toBe(true);
        expect(isLocalComfyUrl('http://192.168.1.50:8188')).toBe(false);
        expect(isLocalComfyUrl('http://127.0.0.1:3000')).toBe(false);
    });

    it('keeps passive fetchComfyInfoCatalog silent, wakes on startIfNeeded, and wakes on generateComfyImage', async () => {
        const ensureComfyRunning = vi.fn(async () => ({
            ok: true,
            value: { ready: true, started: true, status: 'running' }
        }));
        window.ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning: vi.fn(async () => ({ ok: true, value: { ready: true, started: false } })),
            ensureComfyRunning,
            openBackendsWindow: vi.fn(async () => ({ ok: true })),
            onEvent: vi.fn(() => () => {})
        };

        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/system_stats')) {
                return new Response(JSON.stringify({ system: { comfyui_version: '0.3' }, devices: [{ name: 'RTX' }] }), { status: 200 });
            }
            if (url.includes('/object_info/UNETLoader')) {
                return new Response(JSON.stringify({ UNETLoader: { input: { required: { unet_name: [['krea2.safetensors']] } } } }), { status: 200 });
            }
            if (url.includes('/object_info/CLIPLoader')) {
                return new Response(JSON.stringify({ CLIPLoader: { input: { required: { clip_name: [['qwen.safetensors']] } } } }), { status: 200 });
            }
            if (url.includes('/object_info/VAELoader')) {
                return new Response(JSON.stringify({ VAELoader: { input: { required: { vae_name: [['qwen_vae.safetensors']] } } } }), { status: 200 });
            }
            if (url.includes('/object_info/LoraLoaderModelOnly')) {
                return new Response(JSON.stringify({ LoraLoaderModelOnly: { input: { required: { lora_name: [[]] } } } }), { status: 200 });
            }
            if (url.includes('/object_info/KSampler')) {
                return new Response(
                    JSON.stringify({ KSampler: { input: { required: { sampler_name: [['euler']], scheduler: [['simple']] } } } }),
                    { status: 200 }
                );
            }
            if (url.endsWith('/prompt')) {
                return new Response(JSON.stringify({ prompt_id: 'p1' }), { status: 200 });
            }
            if (url.endsWith('/history/p1')) {
                return new Response(JSON.stringify({ p1: { outputs: { '7': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } }), { status: 200 });
            }
            if (url.includes('/view?')) {
                return {
                    ok: true,
                    status: 200,
                    blob: async () => new Blob(['img'], { type: 'image/png' })
                } as unknown as Response;
            }
            return new Response('not found', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);

        // Passive Settings probe must NOT start ComfyUI.
        const passive = await fetchComfyInfoCatalog('http://127.0.0.1:8188');
        expect(passive.status.error).toBe('');
        expect(passive.status.online).toBe(true);
        expect(ensureComfyRunning).not.toHaveBeenCalled();

        // Explicit Refresh with startIfNeeded MUST wake ComfyUI.
        await fetchComfyInfoCatalog('http://127.0.0.1:8188', { startIfNeeded: true });
        expect(ensureComfyRunning).toHaveBeenCalledTimes(1);

        // Image generation without acquireGpuLease falls back to ensureComfyRunning.
        const dataUrl = await generateComfyImage('a sunlit desk', '1:1', {
            url: 'http://127.0.0.1:8188',
            unet: 'krea2.safetensors',
            clip: 'qwen.safetensors',
            vae: 'qwen_vae.safetensors'
        });
        expect(dataUrl).toMatch(/^data:/);
        expect(ensureComfyRunning).toHaveBeenCalledTimes(2);
    });
});
