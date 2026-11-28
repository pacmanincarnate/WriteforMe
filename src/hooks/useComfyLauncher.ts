/**
 * @module hooks/useComfyLauncher
 * The "Launch ComfyUI" button's state: whether this page can start ComfyUI at all, the start
 * itself, and the wait until ComfyUI answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComfyLauncherKind, ComfyStatusInfo } from '@/services/images';
import { detectComfyLauncher, isComfyStillStarting, launchComfy } from '@/services/images';

/** The first start imports torch and can take minutes. */
const READY_TIMEOUT_MS = 240000;
const POLL_MS = 3000;

export type ComfyLaunchPhase = 'idle' | 'starting' | 'needs-folder' | 'not-installed' | 'failed';

export interface UseComfyLauncherOptions {
    comfyUrl: string;
    comfyStatus: ComfyStatusInfo;
    refreshComfyInfo: (opts?: { startIfNeeded?: boolean }) => void | Promise<void>;
    /** Test seam: the wait between readiness checks. */
    pollMs?: number;
}

export interface UseComfyLauncherResult {
    /** Null where the page cannot start programs (single-file build, static host, LAN reader). */
    kind: ComfyLauncherKind | null;
    phase: ComfyLaunchPhase;
    folder: string;
    setFolder: (folder: string) => void;
    launch: () => Promise<void>;
}

export function useComfyLauncher({
    comfyUrl,
    comfyStatus,
    refreshComfyInfo,
    pollMs = POLL_MS
}: UseComfyLauncherOptions): UseComfyLauncherResult {
    const [kind, setKind] = useState<ComfyLauncherKind | null>(null);
    const [phase, setPhase] = useState<ComfyLaunchPhase>('idle');
    const [folder, setFolder] = useState('');
    const online = useRef(comfyStatus.online);
    online.current = comfyStatus.online;
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    useEffect(() => {
        let current = true;
        void detectComfyLauncher(comfyUrl).then((found) => {
            if (current) setKind(found);
        });
        return () => {
            current = false;
        };
    }, [comfyUrl]);

    useEffect(() => {
        if (comfyStatus.online) setPhase('idle');
    }, [comfyStatus.online]);

    const launch = useCallback(async (): Promise<void> => {
        if (!kind) return;
        setPhase('starting');
        const result = await launchComfy(kind, comfyUrl, folder.trim());
        if (!alive.current) return;
        if (result.dir) setFolder(result.dir);
        if (!result.ok) {
            setPhase(
                result.reason === 'not-found'
                    ? 'needs-folder'
                    : result.reason === 'not-installed'
                      ? 'not-installed'
                      : 'failed'
            );
            return;
        }
        const deadline = Date.now() + READY_TIMEOUT_MS;
        for (;;) {
            await refreshComfyInfo();
            if (!alive.current || online.current) return;
            if (Date.now() > deadline || !(await isComfyStillStarting(kind))) break;
            await new Promise((resolve) => setTimeout(resolve, pollMs));
            if (!alive.current) return;
        }
        setPhase('failed');
    }, [comfyUrl, folder, kind, pollMs, refreshComfyInfo]);

    return { kind, phase, folder, setFolder, launch };
}
