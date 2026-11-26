/**
 * @module components/modals/UpdateModal
 * Editorial update confirmation dialog displaying the GitHub release changelog
 * and triggering either a Web hard reload or a Desktop verified download & install.
 */

import { useEffect, useMemo } from 'react';
import {
    AlertTriangle,
    ArrowUpRight,
    CheckCircle2,
    Download,
    RefreshCw,
    X
} from '@/components/icons';
import {
    renderChangelogHtml,
    type DesktopUpdaterState,
    type UpdateInfo
} from '@/services/updates';

export interface UpdateModalProps {
    isOpen: boolean;
    updateInfo: UpdateInfo | null;
    desktopState: DesktopUpdaterState | null;
    isApplying: boolean;
    error: string | null;
    isBusyGenerating?: boolean;
    onConfirm: () => void;
    onCancelDownload: () => void;
    onSkip: () => void;
    onClose: () => void;
    onOpenReleaseNotes: () => void;
}

function formatBytesMb(bytes: number | null | undefined): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPublishedDate(iso: string | null): string | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function environmentLabel(info: UpdateInfo): string {
    if (info.environment === 'desktop') {
        if (info.installMode === 'portable') return 'Desktop Portable';
        if (info.installMode === 'nsis') return 'Desktop Installer';
        return 'Desktop App';
    }
    if (info.environment === 'singlefile') return 'Portable HTML';
    return 'Web App';
}

export function UpdateModal({
    isOpen,
    updateInfo,
    desktopState,
    isApplying,
    error,
    isBusyGenerating = false,
    onConfirm,
    onCancelDownload,
    onSkip,
    onClose,
    onOpenReleaseNotes
}: UpdateModalProps) {
    const status = desktopState?.status;
    const isDownloading = status === 'downloading';
    const isVerifying = status === 'verifying';
    const isInstalling = status === 'installing';
    const isDownloadedManual = status === 'downloaded-manual';
    const isBusy = isApplying || isDownloading || isVerifying || isInstalling;

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isBusy) {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isBusy, onClose]);

    const changelogHtml = useMemo(() => {
        if (!updateInfo?.changelog) return '';
        return renderChangelogHtml(updateInfo.changelog);
    }, [updateInfo?.changelog]);

    if (!isOpen || !updateInfo) return null;

    const progress = desktopState?.progress;
    const publishedDate = formatPublishedDate(updateInfo.publishedAt);
    const displayError = error || (status === 'error' ? desktopState?.error : null);

    const primaryLabel = (() => {
        if (updateInfo.environment === 'desktop') {
            if (isDownloading) return 'Downloading…';
            if (isVerifying) return 'Verifying Checksum…';
            if (isInstalling) return 'Launching Updater…';
            return 'Download & Update';
        }
        if (updateInfo.environment === 'singlefile') {
            return 'Download Latest Portable';
        }
        return isApplying ? 'Reloading…' : 'Hard Reload & Update';
    })();

    return (
        <div
            className="update-modal fixed inset-0 z-[105] flex items-center justify-center bg-stone-950/45 backdrop-blur-md p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
        >
            <div className="glass-modal w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-edge/60 bg-surface/98 flex flex-col space-y-4 max-h-[88vh]">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-gold-tint border border-gold-edge text-gold-ink shrink-0">
                            {updateInfo.environment === 'web' ? (
                                <RefreshCw size={18} className={isApplying ? 'animate-spin' : ''} />
                            ) : (
                                <Download size={18} />
                            )}
                        </div>
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3
                                    id="update-modal-title"
                                    className="text-lg font-serif font-bold text-ink-900 tracking-tight"
                                >
                                    Update Available
                                </h3>
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mist-100 text-ink-600 border border-edge">
                                    {environmentLabel(updateInfo)}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                                <span className="px-2 py-0.5 rounded-md bg-inset text-ink-500 border border-edge">
                                    v{updateInfo.currentVersion}
                                    {updateInfo.isSameVersionHotfix && updateInfo.currentBuildId
                                        ? ` (${updateInfo.currentBuildId})`
                                        : ''}
                                </span>
                                <span className="text-ink-400">→</span>
                                <span className="px-2 py-0.5 rounded-md bg-gold-tint text-gold-ink font-bold border border-gold-edge">
                                    v{updateInfo.latestVersion}
                                    {updateInfo.isSameVersionHotfix && updateInfo.latestBuildId
                                        ? ` (${updateInfo.latestBuildId})`
                                        : ''}
                                </span>
                                {publishedDate && (
                                    <span className="text-ink-400 text-[11px] font-sans ml-1">
                                        · {publishedDate}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isBusy}
                        className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-wash transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Close update dialog"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Generation / Autopilot Caution */}
                {isBusyGenerating && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <span>
                            Active generation or Autopilot is running. Updating now will reload or restart
                            EllipsisProse — saved scenes remain safe, or choose <strong>Later</strong> until it
                            finishes.
                        </span>
                    </div>
                )}

                {/* Changelog Section */}
                <div className="flex flex-col min-h-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-500">
                            What&apos;s Changed
                        </span>
                        <button
                            type="button"
                            onClick={onOpenReleaseNotes}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gold-ink hover:underline cursor-pointer"
                        >
                            <span>View on GitHub</span>
                            <ArrowUpRight size={12} />
                        </button>
                    </div>

                    <div className="rounded-xl border border-edge bg-inset/80 p-4 overflow-y-auto max-h-64">
                        {changelogHtml ? (
                            <div
                                className="update-changelog-prose text-xs text-ink-700 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: changelogHtml }}
                            />
                        ) : (
                            <p className="text-xs text-ink-500 italic">
                                Release notes could not be loaded offline or were not provided for this build.
                                Click &ldquo;View on GitHub&rdquo; to inspect the full commit history.
                            </p>
                        )}
                    </div>
                </div>

                {/* Desktop Download / Install Progress */}
                {(isDownloading || isVerifying || isInstalling) && progress && (
                    <div className="rounded-xl border border-gold-edge bg-gold-tint/50 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-ink-800 truncate pr-2">
                                {isVerifying
                                    ? 'Verifying SHA-256 checksum…'
                                    : isInstalling
                                      ? 'Closing app & launching updater…'
                                      : `Downloading ${progress.file || updateInfo.assetName || 'update'}…`}
                            </span>
                            <span className="font-mono text-gold-ink font-bold shrink-0">
                                {progress.total
                                    ? `${formatBytesMb(progress.received)} / ${formatBytesMb(progress.total)}${
                                          progress.percent !== null ? ` (${progress.percent}%)` : ''
                                      }`
                                    : formatBytesMb(progress.received)}
                            </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-mist-200 overflow-hidden">
                            <div
                                className="h-full bg-gold transition-all duration-200 rounded-full"
                                style={{
                                    width: `${
                                        progress.percent !== null
                                            ? Math.max(4, Math.min(100, progress.percent))
                                            : 100
                                    }%`
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Manual Folder Handoff Confirmation (dev mode or read-only portable dir) */}
                {isDownloadedManual && desktopState?.filePath && (
                    <div className="rounded-xl border border-sage-edge bg-sage-tint px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-sage-800">
                        <CheckCircle2 size={15} className="text-sage-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <div className="font-semibold">Update downloaded and verified</div>
                            <div className="text-[11px] opacity-90 break-all mt-0.5">
                                Saved to <code>{desktopState.filePath}</code>. Run the downloaded file to
                                finish updating.
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {displayError && (
                    <div className="rounded-xl border border-blush-edge bg-blush-tint px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs text-blush-900">
                        <div className="flex items-start gap-2 min-w-0">
                            <AlertTriangle size={15} className="text-crimson-600 shrink-0 mt-0.5" />
                            <span className="break-words">{displayError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenReleaseNotes}
                            className="text-xs font-bold underline shrink-0 cursor-pointer"
                        >
                            GitHub
                        </button>
                    </div>
                )}

                {/* Data Preservation Notice */}
                <p className="text-[11px] text-ink-500 leading-snug">
                    Your stories, settings, library, and local backends are preserved automatically during
                    updates.
                </p>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-edge-subtle/60">
                    <button
                        type="button"
                        onClick={onSkip}
                        disabled={isBusy}
                        className="px-2.5 py-2 rounded-xl text-xs font-medium text-ink-500 hover:text-ink-800 hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        Skip This Version
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                        {isDownloading ? (
                            <button
                                type="button"
                                onClick={onCancelDownload}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-700 hover:text-ink-900 hover:bg-wash border border-edge-strong transition-colors cursor-pointer"
                            >
                                Cancel Download
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isBusy}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {isDownloadedManual ? 'Close' : 'Later'}
                            </button>
                        )}

                        {!isDownloadedManual && (
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={isBusy}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-btn-ink bg-btn hover:bg-btn-hover active:scale-95 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {updateInfo.environment === 'web' ? (
                                    <RefreshCw
                                        size={13}
                                        className={isApplying ? 'animate-spin' : ''}
                                    />
                                ) : (
                                    <Download size={13} />
                                )}
                                <span>{displayError ? 'Retry Update' : primaryLabel}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
