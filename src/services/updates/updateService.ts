/**
 * @module services/updates/updateService
 * Update detection, GitHub release/changelog lookup, and cache-clearing hard-reload helpers
 * for Web (GitHub Pages / PWA), Single-File, and Electron Desktop environments.
 */

import {
    APP_BUILD_ID,
    APP_VERSION,
    CLOUD_API_URLS,
    GITHUB_RELEASES_URL,
    GITHUB_REPO,
    PORTABLE_DOWNLOAD_URL,
    STORAGE_KEYS,
    TIMEOUTS_MS
} from '@/config';
import { isNewerSemver, compareSemver } from './semver';

export type UpdateEnvironment = 'desktop' | 'web' | 'singlefile';
export type DesktopInstallMode = 'nsis' | 'portable' | 'dev';

export interface UpdateDownloadProgress {
    phase: 'downloading' | 'verifying' | 'installing';
    file?: string;
    received: number;
    total: number | null;
    percent: number | null;
}

export interface UpdateInfo {
    environment: UpdateEnvironment;
    currentVersion: string;
    latestVersion: string;
    currentBuildId?: string;
    latestBuildId?: string;
    releaseName: string;
    changelog: string;
    releaseUrl: string;
    publishedAt: string | null;
    updateKey: string;
    installMode?: DesktopInstallMode;
    assetName?: string | null;
    assetSize?: number | null;
    downloadUrl?: string | null;
    isSameVersionHotfix?: boolean;
}

export type DesktopUpdaterStatus =
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'verifying'
    | 'installing'
    | 'downloaded-manual'
    | 'error';

export interface DesktopUpdaterState {
    status: DesktopUpdaterStatus;
    manual: boolean;
    currentVersion: string;
    latestVersion: string | null;
    releaseName: string | null;
    changelog: string;
    releaseUrl: string | null;
    publishedAt: string | null;
    installMode: DesktopInstallMode;
    asset: {
        name: string;
        size: number | null;
        downloadUrl: string;
        sha256: string | null;
    } | null;
    progress: UpdateDownloadProgress | null;
    error: string | null;
    filePath: string | null;
    skippedVersion: string;
    isSkipped: boolean;
    checkedAt: string | null;
}

export interface DesktopUpdaterBridge {
    isDesktop: true;
    getState: () => Promise<{ ok: boolean; value?: DesktopUpdaterState; error?: string }>;
    checkForUpdates: (opts?: {
        manual?: boolean;
    }) => Promise<{ ok: boolean; value?: DesktopUpdaterState; error?: string }>;
    downloadAndInstall: () => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    cancelDownload: () => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    skipVersion: (version: string) => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    openReleaseNotes: (url?: string) => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    onStateChange: (cb: (state: DesktopUpdaterState) => void) => () => void;
}

export interface RemoteVersionManifest {
    version: string;
    buildId?: string;
    builtAt?: string;
}

export interface GitHubReleaseSummary {
    tagName: string;
    version: string;
    name: string;
    body: string;
    htmlUrl: string;
    publishedAt: string | null;
}

export interface WebUpdateCheckResult {
    status: 'available' | 'up-to-date' | 'offline' | 'error';
    update: UpdateInfo | null;
    error?: string;
}

export interface CheckWebUpdateOptions {
    manual?: boolean;
    currentVersion?: string;
    currentBuildId?: string;
    repo?: string;
    fetchImpl?: typeof fetch;
    environment?: UpdateEnvironment;
}

/** Detects whether the app is running inside Electron Desktop, the portable single-file HTML, or a web host. */
export function detectUpdateEnvironment(): UpdateEnvironment {
    if (typeof window !== 'undefined' && window.ellipsisDesktopUpdater?.isDesktop) {
        return 'desktop';
    }
    if (
        import.meta.env?.VITE_SINGLEFILE ||
        (typeof window !== 'undefined' && window.location?.protocol === 'file:')
    ) {
        return 'singlefile';
    }
    return 'web';
}

/** Reads the update key the user previously chose to skip. */
export function getSkippedUpdateKey(): string {
    try {
        return localStorage.getItem(STORAGE_KEYS.skippedUpdateKey) || '';
    } catch {
        return '';
    }
}

/** Persists a skipped update key so the modal does not reopen for that version/build automatically. */
export function setSkippedUpdateKey(key: string): void {
    try {
        if (key) localStorage.setItem(STORAGE_KEYS.skippedUpdateKey, key);
        else localStorage.removeItem(STORAGE_KEYS.skippedUpdateKey);
    } catch {
        // Ignore storage restrictions
    }
}

function normalizeVersion(raw: string | null | undefined): string {
    return String(raw || '').trim().replace(/^v/i, '');
}

async function fetchWithAbort(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    fetchImpl: typeof fetch
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fetches `./version.json` with cache disabled. Returns `null` silently on 404, non-JSON,
 * dev-server fallback, or network failure.
 */
export async function fetchRemoteVersionManifest(
    fetchImpl: typeof fetch = fetch
): Promise<RemoteVersionManifest | null> {
    try {
        const res = await fetchWithAbort(
            `./version.json?_=${Date.now()}`,
            { cache: 'no-store' },
            TIMEOUTS_MS.updateManifest,
            fetchImpl
        );
        if (!res || !res.ok) return null;
        const contentType = res.headers?.get?.('content-type') || '';
        if (contentType && !contentType.toLowerCase().includes('json')) return null;
        const data = (await res.json()) as Partial<RemoteVersionManifest> | null;
        if (!data || typeof data.version !== 'string' || !data.version.trim()) return null;
        return {
            version: normalizeVersion(data.version),
            buildId: typeof data.buildId === 'string' ? data.buildId.trim() : undefined,
            builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined
        };
    } catch {
        return null;
    }
}

/**
 * Queries the public GitHub Releases API for the latest published release.
 * Returns `null` silently when offline, rate-limited, or when no release exists.
 */
export async function fetchLatestGitHubRelease(
    repo: string = GITHUB_REPO,
    fetchImpl: typeof fetch = fetch
): Promise<GitHubReleaseSummary | null> {
    try {
        const res = await fetchWithAbort(
            `${CLOUD_API_URLS.githubApiRepos}/${repo}/releases/latest`,
            {
                headers: { Accept: 'application/vnd.github+json' },
                cache: 'no-store'
            },
            TIMEOUTS_MS.updateGithub,
            fetchImpl
        );
        if (!res || !res.ok) return null;
        const data = (await res.json()) as {
            tag_name?: string;
            name?: string;
            body?: string;
            html_url?: string;
            published_at?: string;
        } | null;
        if (!data || typeof data.tag_name !== 'string') return null;
        const version = normalizeVersion(data.tag_name);
        if (!version) return null;
        return {
            tagName: data.tag_name,
            version,
            name: String(data.name || `EllipsisProse ${data.tag_name}`).trim(),
            body: typeof data.body === 'string' ? data.body : '',
            htmlUrl: typeof data.html_url === 'string' ? data.html_url : GITHUB_RELEASES_URL,
            publishedAt: typeof data.published_at === 'string' ? data.published_at : null
        };
    } catch {
        return null;
    }
}

function isHexSha(val: string | undefined): val is string {
    return Boolean(val && /^[0-9a-f]{7,40}$/i.test(val.trim()));
}

function areSameBuildId(a: string | undefined, b: string | undefined): boolean {
    const na = String(a || '').trim().toLowerCase();
    const nb = String(b || '').trim().toLowerCase();
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (isHexSha(na) && isHexSha(nb)) {
        return na.startsWith(nb) || nb.startsWith(na);
    }
    return false;
}

/**
 * Fallback changelog builder using GitHub compare or recent commits on `main` when a deployed
 * build differs without a matching release note body.
 */
export async function fetchRecentCommitsChangelog(
    repo: string = GITHUB_REPO,
    currentCommit?: string,
    remoteCommit?: string,
    fetchImpl: typeof fetch = fetch
): Promise<string> {
    try {
        if (
            isHexSha(currentCommit) &&
            isHexSha(remoteCommit) &&
            !areSameBuildId(currentCommit, remoteCommit)
        ) {
            const cmpRes = await fetchWithAbort(
                `${CLOUD_API_URLS.githubApiRepos}/${repo}/compare/${encodeURIComponent(currentCommit)}...${encodeURIComponent(remoteCommit)}`,
                { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' },
                TIMEOUTS_MS.updateGithub,
                fetchImpl
            );
            if (cmpRes && cmpRes.ok) {
                const cmpData = (await cmpRes.json()) as {
                    commits?: Array<{ sha?: string; commit?: { message?: string } }>;
                };
                const commits = Array.isArray(cmpData?.commits) ? cmpData.commits : [];
                if (commits.length > 0) {
                    const lines = commits
                        .slice(-15)
                        .reverse()
                        .map((c) => {
                            const headline = String(c.commit?.message || '')
                                .split('\n')[0]
                                .trim();
                            const shortSha = String(c.sha || '').slice(0, 7);
                            return headline
                                ? `* ${headline}${shortSha ? ` (\`${shortSha}\`)` : ''}`
                                : null;
                        })
                        .filter(Boolean);
                    if (lines.length > 0) {
                        return `## Recent Changes\n${lines.join('\n')}`;
                    }
                }
            }
        }

        const commitsRes = await fetchWithAbort(
            `${CLOUD_API_URLS.githubApiRepos}/${repo}/commits?sha=main&per_page=8`,
            { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' },
            TIMEOUTS_MS.updateGithub,
            fetchImpl
        );
        if (!commitsRes || !commitsRes.ok) return '';
        const list = (await commitsRes.json()) as Array<{
            sha?: string;
            commit?: { message?: string };
        }>;
        if (!Array.isArray(list) || list.length === 0) return '';
        const lines = list
            .map((c) => {
                const headline = String(c.commit?.message || '')
                    .split('\n')[0]
                    .trim();
                const shortSha = String(c.sha || '').slice(0, 7);
                return headline ? `* ${headline}${shortSha ? ` (\`${shortSha}\`)` : ''}` : null;
            })
            .filter(Boolean);
        return lines.length > 0 ? `## Recent Changes\n${lines.join('\n')}` : '';
    } catch {
        return '';
    }
}

async function checkServiceWorkerForUpdate(): Promise<{
    hasWaitingWorker: boolean;
    waitingWorker: ServiceWorker | null;
}> {
    if (
        typeof navigator === 'undefined' ||
        !('serviceWorker' in navigator) ||
        typeof navigator.serviceWorker.getRegistration !== 'function'
    ) {
        return { hasWaitingWorker: false, waitingWorker: null };
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            return { hasWaitingWorker: false, waitingWorker: null };
        }
        try {
            await reg.update();
        } catch {
            // Non-fatal (e.g. offline or dev server)
        }
        const waitingWorker = reg.waiting || null;
        const hasWaitingWorker = Boolean(navigator.serviceWorker.controller && waitingWorker);
        return {
            hasWaitingWorker,
            waitingWorker: hasWaitingWorker ? waitingWorker : null
        };
    } catch {
        return { hasWaitingWorker: false, waitingWorker: null };
    }
}

/**
 * Checks whether a newer version/build of the Web or Single-File app is live, and resolves its
 * GitHub changelog when available.
 */
export async function checkForWebUpdate(
    opts: CheckWebUpdateOptions = {}
): Promise<WebUpdateCheckResult> {
    const manual = Boolean(opts.manual);
    const currentVersion = normalizeVersion(opts.currentVersion ?? APP_VERSION);
    const currentBuildId = String(opts.currentBuildId ?? APP_BUILD_ID ?? '').trim();
    const repo = opts.repo || GITHUB_REPO;
    const fetchImpl = opts.fetchImpl || fetch;
    const environment = opts.environment || detectUpdateEnvironment();

    if (typeof navigator !== 'undefined' && navigator.onLine === false && !manual) {
        return { status: 'offline', update: null };
    }

    if (environment === 'singlefile') {
        const release = await fetchLatestGitHubRelease(repo, fetchImpl);
        if (!release) {
            return manual
                ? {
                      status: 'error',
                      update: null,
                      error: 'Could not reach GitHub to check for updates.'
                  }
                : { status: 'up-to-date', update: null };
        }
        if (isNewerSemver(release.version, currentVersion)) {
            let changelog = release.body;
            if (!changelog) {
                changelog = await fetchRecentCommitsChangelog(repo, currentBuildId, undefined, fetchImpl);
            }
            return {
                status: 'available',
                update: {
                    environment: 'singlefile',
                    currentVersion,
                    latestVersion: release.version,
                    currentBuildId,
                    releaseName: release.name,
                    changelog,
                    releaseUrl: release.htmlUrl,
                    publishedAt: release.publishedAt,
                    updateKey: `${release.version}:singlefile`,
                    downloadUrl: PORTABLE_DOWNLOAD_URL
                }
            };
        }
        return { status: 'up-to-date', update: null };
    }

    // Web (GitHub Pages / local server / PWA)
    const [swState, remoteManifest] = await Promise.all([
        checkServiceWorkerForUpdate(),
        fetchRemoteVersionManifest(fetchImpl)
    ]);

    const versionComparison = remoteManifest
        ? compareSemver(remoteManifest.version, currentVersion)
        : null;
    const versionNewer = Boolean(
        remoteManifest && versionComparison !== null && versionComparison > 0
    );
    const buildChanged = Boolean(
        remoteManifest &&
            remoteManifest.buildId &&
            currentBuildId &&
            !areSameBuildId(remoteManifest.buildId, currentBuildId) &&
            versionComparison !== null &&
            versionComparison >= 0
    );
    // ./version.json is fetched with cache:'no-store' and excluded from SW precaching, so when
    // available it is the authoritative source of truth. Only fall back to a waiting SW when
    // ./version.json could not be fetched.
    const swUpdateFallback = !remoteManifest && swState.hasWaitingWorker;
    const actionable = versionNewer || buildChanged || swUpdateFallback;

    if (!actionable) {
        if (remoteManifest && swState.waitingWorker) {
            try {
                swState.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            } catch {
                // Ignore postMessage errors
            }
        }
        if (manual && !remoteManifest && typeof navigator !== 'undefined' && navigator.onLine === false) {
            return {
                status: 'offline',
                update: null,
                error: 'You appear to be offline. Connect to the internet to check for updates.'
            };
        }
        return { status: 'up-to-date', update: null };
    }

    const latestVersion = remoteManifest?.version || currentVersion;
    const latestBuildId = remoteManifest?.buildId || (swUpdateFallback ? 'sw-pending' : '');
    if (
        compareSemver(latestVersion, currentVersion) <= 0 &&
        latestBuildId &&
        currentBuildId &&
        areSameBuildId(latestBuildId, currentBuildId)
    ) {
        return { status: 'up-to-date', update: null };
    }
    const isSameVersionHotfix = !versionNewer && (buildChanged || swUpdateFallback);

    const release = await fetchLatestGitHubRelease(repo, fetchImpl);
    let changelog = '';
    let releaseName =
        versionNewer && remoteManifest
            ? `EllipsisProse v${remoteManifest.version}`
            : 'EllipsisProse Web Update';
    let releaseUrl = GITHUB_RELEASES_URL;
    let publishedAt: string | null = remoteManifest?.builtAt || null;

    if (release) {
        const releaseMatchesOrNewer = compareSemver(release.version, latestVersion) >= 0;
        if (!isSameVersionHotfix && releaseMatchesOrNewer) {
            releaseName = release.name;
            releaseUrl = release.htmlUrl;
            publishedAt = release.publishedAt || publishedAt;
            changelog = release.body;
        } else if (release.version === latestVersion && release.body) {
            releaseName = release.name;
            releaseUrl = release.htmlUrl;
            publishedAt = release.publishedAt || publishedAt;
            changelog = release.body;
        }
    }

    if (isSameVersionHotfix || !changelog) {
        const commitsNotes = await fetchRecentCommitsChangelog(
            repo,
            currentBuildId,
            remoteManifest?.buildId,
            fetchImpl
        );
        if (commitsNotes) {
            changelog = changelog ? `${commitsNotes}\n\n---\n\n${changelog}` : commitsNotes;
        }
    }

    const updateKey = `${latestVersion}:${latestBuildId}`;
    return {
        status: 'available',
        update: {
            environment: 'web',
            currentVersion,
            latestVersion,
            currentBuildId,
            latestBuildId,
            releaseName,
            changelog,
            releaseUrl,
            publishedAt,
            updateKey,
            isSameVersionHotfix
        }
    };
}

/**
 * Clears EllipsisProse & Workbox service-worker caches (leaving IndexedDB and localStorage
 * stories/settings untouched), activates any waiting service worker, primes the HTTP cache,
 * and performs a hard-reload navigation.
 */
export async function performHardReloadUpdate(): Promise<void> {
    if (typeof window === 'undefined') return;

    if ('caches' in window && typeof window.caches?.keys === 'function') {
        try {
            const cacheNames = await window.caches.keys();
            await Promise.all(
                cacheNames
                    .filter(
                        (name) =>
                            name.startsWith('workbox-precache-') ||
                            name.startsWith('ellipsisprose-')
                    )
                    .map((name) => window.caches.delete(name))
            );
        } catch {
            // Ignore cache storage errors
        }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                regs.map(async (reg) => {
                    try {
                        await reg.update();
                    } catch {
                        // Ignore update errors
                    }
                    if (reg.waiting) {
                        try {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        } catch {
                            // Ignore postMessage errors
                        }
                    }
                })
            );
        } catch {
            // Ignore SW registration errors
        }
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('_ep_updated');

    if (typeof fetch === 'function') {
        try {
            await fetch(cleanUrl.toString(), {
                cache: 'reload',
                credentials: 'same-origin'
            });
        } catch {
            // Best-effort cache refresh
        }
    }

    const reloadUrl = new URL(cleanUrl.toString());
    reloadUrl.searchParams.set('_ep_updated', String(Date.now()));
    window.location.replace(reloadUrl.toString());
}
