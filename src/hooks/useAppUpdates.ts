/**
 * @module hooks/useAppUpdates
 * Checks for updates automatically on launch (and on manual demand), managing
 * the changelog confirmation modal for both Web (hard reload) and Desktop (download & install).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION, GITHUB_RELEASES_URL, PORTABLE_DOWNLOAD_URL } from '@/config';
import {
    checkForWebUpdate,
    detectUpdateEnvironment,
    getSkippedUpdateKey,
    performHardReloadUpdate,
    setSkippedUpdateKey,
    type DesktopUpdaterState,
    type UpdateEnvironment,
    type UpdateInfo
} from '@/services/updates';

export interface UseAppUpdatesOptions {
    showToast?: (message: string, type?: string) => void;
    launchDelayMs?: number;
}

export interface UseAppUpdatesResult {
    environment: UpdateEnvironment;
    updateInfo: UpdateInfo | null;
    isModalOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
    isChecking: boolean;
    isApplying: boolean;
    desktopState: DesktopUpdaterState | null;
    error: string | null;
    hasAvailableUpdate: boolean;
    checkForUpdates: (opts?: { manual?: boolean }) => Promise<void>;
    confirmUpdate: () => Promise<void>;
    cancelDownload: () => Promise<void>;
    skipCurrentUpdate: () => Promise<void>;
    openReleaseNotes: () => void;
}

function desktopStateToUpdateInfo(state: DesktopUpdaterState | null): UpdateInfo | null {
    if (!state || !state.latestVersion) return null;
    const relevantStatuses: DesktopUpdaterState['status'][] = [
        'available',
        'downloading',
        'verifying',
        'installing',
        'downloaded-manual',
        'error'
    ];
    if (!relevantStatuses.includes(state.status)) return null;
    return {
        environment: 'desktop',
        currentVersion: state.currentVersion || APP_VERSION,
        latestVersion: state.latestVersion,
        releaseName: state.releaseName || `EllipsisProse v${state.latestVersion}`,
        changelog: state.changelog || '',
        releaseUrl: state.releaseUrl || GITHUB_RELEASES_URL,
        publishedAt: state.publishedAt || null,
        updateKey: `${state.latestVersion}:desktop:${state.installMode}`,
        installMode: state.installMode,
        assetName: state.asset?.name || null,
        assetSize: state.asset?.size ?? null,
        downloadUrl: state.asset?.downloadUrl || null
    };
}

export function useAppUpdates({
    showToast,
    launchDelayMs = 2000
}: UseAppUpdatesOptions = {}): UseAppUpdatesResult {
    const environment = detectUpdateEnvironment();
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [desktopState, setDesktopState] = useState<DesktopUpdaterState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const lastNotifiedKeyRef = useRef<string>('');
    const didAutoCheckRef = useRef(false);

    const handleDesktopState = useCallback((next: DesktopUpdaterState) => {
        setDesktopState(next);
        setIsChecking(next.status === 'checking');
        setError(next.status === 'error' ? next.error || 'Update failed.' : null);

        const info = desktopStateToUpdateInfo(next);
        if (info) {
            setUpdateInfo(info);
        }

        if (next.status === 'available' && info) {
            const shouldOpen =
                next.manual || (!next.isSkipped && lastNotifiedKeyRef.current !== info.updateKey);
            if (shouldOpen) {
                lastNotifiedKeyRef.current = info.updateKey;
                setIsModalOpen(true);
            }
        } else if (next.status === 'up-to-date' && next.manual) {
            showToastRef.current?.(
                `EllipsisProse v${next.currentVersion || APP_VERSION} is up to date.`,
                'info'
            );
        } else if (next.status === 'error' && next.manual && !info) {
            showToastRef.current?.(next.error || 'Could not check for updates.', 'error');
        }
    }, []);

    // Desktop IPC subscription & startup check
    useEffect(() => {
        if (environment !== 'desktop') return;
        const bridge = window.ellipsisDesktopUpdater;
        if (!bridge) return;

        let cancelled = false;
        const unsubscribe = bridge.onStateChange((state) => {
            if (!cancelled) handleDesktopState(state);
        });

        void bridge
            .getState()
            .then((res) => {
                if (cancelled || !res?.ok || !res.value) return;
                handleDesktopState(res.value);
            })
            .catch(() => {});

        const timer = setTimeout(() => {
            if (cancelled || didAutoCheckRef.current) return;
            didAutoCheckRef.current = true;
            void bridge.checkForUpdates({ manual: false }).catch(() => {});
        }, launchDelayMs);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            unsubscribe();
        };
    }, [environment, handleDesktopState, launchDelayMs]);

    const runWebCheck = useCallback(
        async (manual: boolean) => {
            setIsChecking(true);
            if (manual) setError(null);
            try {
                const res = await checkForWebUpdate({ manual });
                if (res.status === 'available' && res.update) {
                    setUpdateInfo(res.update);
                    const skippedKey = getSkippedUpdateKey();
                    const shouldOpen =
                        manual ||
                        (skippedKey !== res.update.updateKey &&
                            lastNotifiedKeyRef.current !== res.update.updateKey);
                    if (shouldOpen) {
                        lastNotifiedKeyRef.current = res.update.updateKey;
                        setIsModalOpen(true);
                    }
                    return;
                }
                if (manual) {
                    if (res.status === 'offline') {
                        showToastRef.current?.(
                            res.error || 'You appear to be offline. Connect to check for updates.',
                            'info'
                        );
                    } else if (res.status === 'error') {
                        showToastRef.current?.(
                            res.error || 'Could not check for updates right now.',
                            'error'
                        );
                    } else {
                        showToastRef.current?.(`EllipsisProse v${APP_VERSION} is up to date.`, 'info');
                    }
                }
            } finally {
                setIsChecking(false);
            }
        },
        []
    );

    // Web / Single-file startup check + Service Worker background update listener
    useEffect(() => {
        if (environment === 'desktop') return;
        let cancelled = false;

        const timer = setTimeout(() => {
            if (cancelled || didAutoCheckRef.current) return;
            didAutoCheckRef.current = true;
            void runWebCheck(false);
        }, launchDelayMs);

        const swCleanups: Array<() => void> = [];
        if (
            environment === 'web' &&
            typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator
        ) {
            void navigator.serviceWorker
                .getRegistration()
                .then((reg) => {
                    if (!reg || cancelled) return;
                    const attachWorker = (worker: ServiceWorker | null) => {
                        if (!worker) return;
                        const onStateChange = () => {
                            if (
                                !cancelled &&
                                worker.state === 'installed' &&
                                navigator.serviceWorker.controller
                            ) {
                                void runWebCheck(false);
                            }
                        };
                        worker.addEventListener('statechange', onStateChange);
                        swCleanups.push(() => worker.removeEventListener('statechange', onStateChange));
                    };

                    if (reg.installing) attachWorker(reg.installing);
                    const onUpdateFound = () => attachWorker(reg.installing);
                    reg.addEventListener('updatefound', onUpdateFound);
                    swCleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));
                })
                .catch(() => {});
        }

        return () => {
            cancelled = true;
            clearTimeout(timer);
            for (const fn of swCleanups) fn();
        };
    }, [environment, launchDelayMs, runWebCheck]);

    const checkForUpdates = useCallback(
        async ({ manual = true }: { manual?: boolean } = {}) => {
            if (environment === 'desktop') {
                const bridge = window.ellipsisDesktopUpdater;
                if (!bridge) return;
                setIsChecking(true);
                setError(null);
                try {
                    const res = await bridge.checkForUpdates({ manual });
                    if (res?.ok && res.value) {
                        handleDesktopState(res.value);
                    } else if (!res?.ok && manual) {
                        const msg = res?.error || 'Could not check for updates.';
                        setError(msg);
                        showToastRef.current?.(msg, 'error');
                    }
                } catch (err) {
                    if (manual) {
                        const msg = err instanceof Error ? err.message : 'Update check failed.';
                        setError(msg);
                        showToastRef.current?.(msg, 'error');
                    }
                } finally {
                    setIsChecking(false);
                }
                return;
            }
            await runWebCheck(manual);
        },
        [environment, handleDesktopState, runWebCheck]
    );

    const confirmUpdate = useCallback(async () => {
        if (!updateInfo) return;
        setError(null);

        if (environment === 'desktop') {
            const bridge = window.ellipsisDesktopUpdater;
            if (!bridge) return;
            try {
                const res = await bridge.downloadAndInstall();
                if (res && !res.ok && res.error && res.error !== 'Cancelled') {
                    setError(res.error);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Update failed.';
                if (msg !== 'Cancelled') setError(msg);
            }
            return;
        }

        if (environment === 'singlefile') {
            const url = updateInfo.downloadUrl || PORTABLE_DOWNLOAD_URL;
            window.open(url, '_blank', 'noopener,noreferrer');
            setIsModalOpen(false);
            return;
        }

        setIsApplying(true);
        try {
            await performHardReloadUpdate();
        } catch (err) {
            setIsApplying(false);
            setError(err instanceof Error ? err.message : 'Hard reload failed.');
        }
    }, [environment, updateInfo]);

    const cancelDownload = useCallback(async () => {
        if (environment !== 'desktop') return;
        try {
            await window.ellipsisDesktopUpdater?.cancelDownload();
        } catch {
            // Ignore cancellation errors
        }
    }, [environment]);

    const skipCurrentUpdate = useCallback(async () => {
        if (!updateInfo) {
            setIsModalOpen(false);
            return;
        }
        if (environment === 'desktop') {
            try {
                await window.ellipsisDesktopUpdater?.skipVersion(updateInfo.latestVersion);
            } catch {
                // Ignore skip persistence error
            }
        } else {
            setSkippedUpdateKey(updateInfo.updateKey);
        }
        setIsModalOpen(false);
    }, [environment, updateInfo]);

    const openReleaseNotes = useCallback(() => {
        const url = updateInfo?.releaseUrl || GITHUB_RELEASES_URL;
        if (environment === 'desktop' && window.ellipsisDesktopUpdater) {
            void window.ellipsisDesktopUpdater.openReleaseNotes(url);
            return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [environment, updateInfo]);

    const openModal = useCallback(() => {
        if (updateInfo) {
            setIsModalOpen(true);
        } else {
            void checkForUpdates({ manual: true });
        }
    }, [checkForUpdates, updateInfo]);

    const closeModal = useCallback(() => {
        const busyDesktop =
            desktopState?.status === 'downloading' ||
            desktopState?.status === 'verifying' ||
            desktopState?.status === 'installing';
        if (isApplying || busyDesktop) return;
        setIsModalOpen(false);
    }, [desktopState?.status, isApplying]);

    const hasAvailableUpdate = Boolean(updateInfo);

    return {
        environment,
        updateInfo,
        isModalOpen,
        openModal,
        closeModal,
        isChecking,
        isApplying,
        desktopState,
        error,
        hasAvailableUpdate,
        checkForUpdates,
        confirmUpdate,
        cancelDownload,
        skipCurrentUpdate,
        openReleaseNotes
    };
}
