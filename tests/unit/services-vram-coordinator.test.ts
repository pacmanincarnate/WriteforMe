import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    liveAudioCppWaveState,
    resetAudioCppStateForTests
} from '@/services/audio';
import {
    resetVramCoordinatorForTests,
    setBrowserIdleUnloadMsForTests,
    withCloudActivity,
    withLocalGpuLease
} from '@/services/vram';

const originalFetch = globalThis.fetch;

describe('services/vram coordinator', () => {
    beforeEach(() => {
        resetVramCoordinatorForTests();
        resetAudioCppStateForTests();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        delete (window as unknown as { ellipsisDesktopBackends?: unknown }).ellipsisDesktopBackends;
        resetVramCoordinatorForTests();
        resetAudioCppStateForTests();
        vi.restoreAllMocks();
    });

    it('delegates GPU leases and cloud activity to Desktop IPC and clears Wave cache on offload events', async () => {
        const calls: string[] = [];
        let eventCb: ((evt: { type: string; modality?: 'llm' | 'audio' | 'image'; message: string }) => void) | null = null;

        (window as unknown as { ellipsisDesktopBackends: unknown }).ellipsisDesktopBackends = {
            isDesktop: true,
            ensureKoboldRunning: vi.fn(async () => ({ ok: true, value: { ready: true, started: false } })),
            acquireGpuLease: vi.fn(async (modality: string) => {
                calls.push(`acquire:${modality}`);
                return { ok: true, value: { leaseId: `l_${modality}`, modality, reentrant: false } };
            }),
            releaseGpuLease: vi.fn(async (leaseId: string) => {
                calls.push(`release:${leaseId}`);
                return { ok: true, value: { released: true } };
            }),
            setCloudActivity: vi.fn(async (count: number) => {
                calls.push(`cloud:${count}`);
                return { ok: true, value: { cloudActivityCount: count } };
            }),
            openBackendsWindow: vi.fn(async () => ({ ok: true })),
            onEvent: vi.fn((cb: typeof eventCb) => {
                eventCb = cb;
                return () => {
                    eventCb = null;
                };
            })
        };

        await withLocalGpuLease('audio', { bridgeUrl: 'http://127.0.0.1:5020' }, async () => {
            liveAudioCppWaveState.activeWave = 2;
            liveAudioCppWaveState.wave2Sig = 'sig-v1';
        });

        await withCloudActivity(async () => {
            expect(calls).toContain('cloud:1');
        });

        expect(calls).toEqual([
            'acquire:audio',
            'release:l_audio',
            'cloud:1',
            'cloud:0'
        ]);

        // Simulated Desktop offload notification invalidates cached audio wave state
        expect(eventCb).not.toBeNull();
        eventCb!({ type: 'vram-offloaded', modality: 'audio', message: '' });
        expect(liveAudioCppWaveState.activeWave).toBe(0);
        expect(liveAudioCppWaveState.wave2Sig).toBeNull();
    });

    it('uses zero extra HTTP calls on cold start in browser mode, and offloads across modalities cleanly', async () => {
        const fetchCalls: Array<{ url: string; body?: string }> = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (input, init) => {
            const url = String(input);
            const body = init?.body ? String(init.body) : undefined;
            fetchCalls.push({ url, body });
            if (url.endsWith('/health')) {
                return new Response(
                    JSON.stringify({
                        audiocpp_server_alive: true,
                        active_wave: 2,
                        active_model_bytes: 23_000_000_000
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });

        // Cold start 'llm' -> no prior resident backends, zero extra offload calls
        await withLocalGpuLease('llm', { koboldUrl: 'http://127.0.0.1:5001' }, async () => {
            expect(fetchCalls).toHaveLength(0);
        });

        // Switch to 'audio' -> offloads KoboldCpp admin API first
        await withLocalGpuLease('audio', { bridgeUrl: 'http://127.0.0.1:5020' }, async () => {
            liveAudioCppWaveState.activeWave = 2;
        });
        expect(fetchCalls.some((c) => c.url === 'http://127.0.0.1:5001/api/admin/reload_config' && c.body?.includes('unload_model'))).toBe(true);

        // Switch to 'image' -> checks /health (>2GB) and deactivates Audio Bridge
        await withLocalGpuLease('image', { comfyUrl: 'http://127.0.0.1:8188' }, async () => {});
        expect(fetchCalls.some((c) => c.url === 'http://127.0.0.1:5020/wave/deactivate')).toBe(true);
        expect(liveAudioCppWaveState.activeWave).toBe(0);

        // Switch back to 'llm' -> calls ComfyUI /free and reloads KoboldCpp initial_model
        await withLocalGpuLease('llm', { koboldUrl: 'http://127.0.0.1:5001' }, async () => {});
        expect(fetchCalls.some((c) => c.url === 'http://127.0.0.1:8188/free' && c.body?.includes('unload_models'))).toBe(true);
        expect(fetchCalls.some((c) => c.url === 'http://127.0.0.1:5001/api/admin/reload_config' && c.body?.includes('initial_model'))).toBe(true);
    });

    it('pauses browser idle auto-unload while waiting on a cloud LLM', async () => {
        setBrowserIdleUnloadMsForTests(40);
        const unloadUrls: string[] = [];
        globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
            unloadUrls.push(String(input));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });

        let releaseCloud!: () => void;
        const cloudPending = withCloudActivity(
            () =>
                new Promise<void>((resolve) => {
                    releaseCloud = resolve;
                })
        );

        await withLocalGpuLease('llm', { koboldUrl: 'http://127.0.0.1:5001' }, async () => {});

        await new Promise((r) => setTimeout(r, 90));
        expect(unloadUrls).toHaveLength(0);

        releaseCloud();
        await cloudPending;
        await new Promise((r) => setTimeout(r, 90));
        expect(unloadUrls).toContain('http://127.0.0.1:5001/api/admin/reload_config');
    });
});
