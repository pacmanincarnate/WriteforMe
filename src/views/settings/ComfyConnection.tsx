/**
 * @module views/settings/ComfyConnection
 * ComfyUI's connection line in Image Generation settings: whether it answers, a button that
 * starts it headless where the page can (desktop app, launcher), and Refresh.
 */

import React from 'react';
import type { ComfyStatusInfo } from '@/services/images';
import { useComfyLauncher } from '@/hooks';

export interface ComfyConnectionProps {
    comfyUrl: string;
    comfyStatus: ComfyStatusInfo;
    refreshComfyInfo: (opts?: { startIfNeeded?: boolean }) => void | Promise<void>;
}

export const ComfyConnection: React.FC<ComfyConnectionProps> = ({
    comfyUrl,
    comfyStatus,
    refreshComfyInfo
}) => {
    const { kind, phase, folder, setFolder, launch } = useComfyLauncher({
        comfyUrl,
        comfyStatus,
        refreshComfyInfo
    });
    const starting = phase === 'starting';
    const canLaunch = Boolean(kind) && !comfyStatus.online;

    const statusText = comfyStatus.online
        ? `Online. ComfyUI ${comfyStatus.version} on ${comfyStatus.device}`
        : starting
          ? 'Starting ComfyUI. The first start can take a few minutes.'
          : phase === 'needs-folder'
            ? 'ComfyUI was not found on this computer.'
            : phase === 'not-installed'
              ? 'ComfyUI is not installed yet.'
              : phase === 'failed'
                ? 'ComfyUI did not start.'
                : kind
                  ? 'ComfyUI is not running.'
                  : comfyStatus.error || 'Press Refresh to connect to ComfyUI.';

    const onLaunch = (): void => {
        if (phase === 'not-installed') {
            void window.ellipsisDesktopBackends?.openBackendsWindow();
            return;
        }
        void launch();
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
                <p role="status" className="text-xs text-ink-500 break-words min-w-0 flex-1">
                    {statusText}
                </p>
                {canLaunch && (
                    <button
                        type="button"
                        onClick={onLaunch}
                        disabled={starting}
                        className="px-3 py-1.5 rounded-xl bg-gold-tint hover:bg-gold/25 border border-gold-edge text-gold-ink text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                        {starting
                            ? 'Starting…'
                            : phase === 'not-installed'
                              ? 'Install ComfyUI'
                              : 'Launch ComfyUI'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void refreshComfyInfo({ startIfNeeded: true })}
                    className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                >
                    Refresh
                </button>
            </div>
            {canLaunch && phase === 'needs-folder' && (
                <input
                    type="text"
                    aria-label="ComfyUI folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onLaunch();
                    }}
                    className="w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
                    placeholder="ComfyUI folder, e.g. C:\ComfyUI_windows_portable"
                />
            )}
        </div>
    );
};
