/**
 * @module services/images/comfyLauncher
 * Starts a headless ComfyUI for the person. The desktop app does it through its bridge; the
 * launcher (`server.js`) does it through `/api/comfyui`. A page with neither (the single-file
 * build, a static host, a phone on the LAN) cannot start programs, so it has no launcher.
 */

import { fetchWithTimeout } from '@/services/http';
import { isLocalComfyUrl } from './comfyui';

export type ComfyLauncherKind = 'desktop' | 'server';

export interface ComfyLaunchResult {
    /** ComfyUI was started, or was already running. */
    ok: boolean;
    /** `not-installed`: desktop has no ComfyUI yet. `not-found`: the launcher needs its folder. */
    reason?: 'not-installed' | 'not-found' | 'failed';
    /** The folder the launcher used, so the field can show it. */
    dir?: string;
}

interface ServerLauncherReply {
    available?: boolean;
    started?: boolean;
    reason?: string;
    dir?: string;
    status?: string;
}

function isLoopbackUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === 'http:' &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname.toLowerCase())
        );
    } catch {
        return false;
    }
}

async function askServer(path: string, init: RequestInit = {}): Promise<ServerLauncherReply> {
    if (typeof window === 'undefined' || !/^https?:$/.test(window.location.protocol)) return {};
    try {
        const response = await fetchWithTimeout(`/api/comfyui/${path}`, init, 8000);
        if (!response.ok) return {};
        return (await response.json()) as ServerLauncherReply;
    } catch {
        return {};
    }
}

/** Which launcher, if any, can start ComfyUI at `comfyUrl` from this page. */
export async function detectComfyLauncher(comfyUrl: string): Promise<ComfyLauncherKind | null> {
    if (typeof window !== 'undefined' && window.ellipsisDesktopBackends?.launchComfy) {
        return isLocalComfyUrl(comfyUrl) ? 'desktop' : null;
    }
    if (!isLoopbackUrl(comfyUrl)) return null;
    return (await askServer('status')).available ? 'server' : null;
}

/** Starts ComfyUI. Desktop resolves once it has loaded; the launcher resolves once it is spawned. */
export async function launchComfy(
    kind: ComfyLauncherKind,
    comfyUrl: string,
    dir = ''
): Promise<ComfyLaunchResult> {
    if (kind === 'desktop') {
        const reply = await window.ellipsisDesktopBackends?.launchComfy?.().catch(() => undefined);
        if (reply?.value?.ready) return { ok: true };
        return { ok: false, reason: reply?.value?.reason === 'not-installed' ? 'not-installed' : 'failed' };
    }
    const reply = await askServer('launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: comfyUrl, dir })
    });
    if (reply.started && reply.status !== 'failed') return { ok: true, dir: reply.dir };
    return { ok: false, reason: reply.reason === 'not-found' ? 'not-found' : 'failed', dir: reply.dir };
}

/** True while the launcher's ComfyUI process is still coming up (always false on desktop). */
export async function isComfyStillStarting(kind: ComfyLauncherKind): Promise<boolean> {
    if (kind === 'desktop') return false;
    const status = (await askServer('status')).status;
    return status === 'starting' || status === 'unresponsive' || status === 'running';
}
