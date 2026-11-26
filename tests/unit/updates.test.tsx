import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateModal } from '@/components/modals/UpdateModal';
import {
    checkForWebUpdate,
    compareSemver,
    formatChangelogMarkdown,
    isNewerSemver,
    parseSemver,
    performHardReloadUpdate,
    renderChangelogHtml,
    type DesktopUpdaterState,
    type UpdateInfo
} from '@/services/updates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

function mountElement(node: React.ReactElement): { container: HTMLDivElement; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => {
        root.render(node);
    });
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        }
    };
}

afterEach(() => {
    while (mountedRoots.length) {
        const root = mountedRoots.pop();
        act(() => root?.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

describe('SemVer utilities', () => {
    it('parses and compares standard and prerelease versions accurately', () => {
        expect(parseSemver('v2.3.1')).toEqual({
            major: 2,
            minor: 3,
            patch: 1,
            prerelease: []
        });
        expect(compareSemver('2.3.0', '2.2.0')).toBe(1);
        expect(compareSemver('v2.2.0', '2.2.0')).toBe(0);
        expect(compareSemver('2.2.0-beta.1', '2.2.0')).toBe(-1);
        expect(compareSemver('2.2.0-beta.10', '2.2.0-beta.2')).toBe(1);
        expect(isNewerSemver('v2.2.1', '2.2.0')).toBe(true);
        expect(isNewerSemver('2.2.0', '2.2.0')).toBe(false);
        expect(isNewerSemver('2.2.0', '0.0.0-dev')).toBe(true);
    });
});

describe('Changelog formatting and sanitization', () => {
    it('links bare GitHub PR, compare, and commit URLs while preserving XSS safety', () => {
        const raw = [
            '## What\'s Changed',
            '* Add seamless updater by @alice in https://github.com/pacmanincarnate/WriteforMe/pull/42',
            '* Existing [link](https://github.com/pacmanincarnate/WriteforMe/pull/43)',
            '<script>alert("xss")</script>',
            '**Full Changelog**: https://github.com/pacmanincarnate/WriteforMe/compare/v2.2.0...v2.3.0'
        ].join('\n');

        const formatted = formatChangelogMarkdown(raw);
        expect(formatted).toContain('[#42](https://github.com/pacmanincarnate/WriteforMe/pull/42)');
        expect(formatted).toContain('[link](https://github.com/pacmanincarnate/WriteforMe/pull/43)');
        expect(formatted).toContain(
            '[v2.2.0...v2.3.0](https://github.com/pacmanincarnate/WriteforMe/compare/v2.2.0...v2.3.0)'
        );

        const html = renderChangelogHtml(raw);
        expect(html).not.toContain('<script');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('>#42</a>');
    });
});

describe('Web update checker', () => {
    it('detects a newer deployed version and attaches matching GitHub release notes', async () => {
        const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('./version.json')) {
                return jsonResponse({
                    version: '2.3.0',
                    buildId: 'def5678',
                    builtAt: '2026-11-26T18:00:00Z'
                });
            }
            if (url.includes('/releases/latest')) {
                return jsonResponse({
                    tag_name: 'v2.3.0',
                    name: 'EllipsisProse v2.3.0',
                    body: '## What\'s Changed\n* Added auto-updater',
                    html_url: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.3.0',
                    published_at: '2026-11-26T18:05:00Z'
                });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const res = await checkForWebUpdate({
            currentVersion: '2.2.0',
            currentBuildId: 'abc1234',
            environment: 'web',
            fetchImpl: mockFetch
        });

        expect(res.status).toBe('available');
        expect(res.update?.latestVersion).toBe('2.3.0');
        expect(res.update?.changelog).toContain('Added auto-updater');
        expect(res.update?.environment).toBe('web');
    });

    it('detects a same-version Pages rebuild via buildId and falls back to commit comparison', async () => {
        const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('./version.json')) {
                return jsonResponse({
                    version: '2.2.0',
                    buildId: '9999999',
                    builtAt: '2026-11-26T18:00:00Z'
                });
            }
            if (url.includes('/releases/latest')) {
                return jsonResponse({
                    tag_name: 'v2.2.0',
                    name: 'EllipsisProse v2.2.0',
                    body: 'Initial v2.2.0 notes',
                    html_url: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.2.0'
                });
            }
            if (url.includes('/compare/1111111...9999999')) {
                return jsonResponse({
                    commits: [{ sha: '9999999abcdef', commit: { message: 'fix: hotfix reader scroll\n\ndetails' } }]
                });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const res = await checkForWebUpdate({
            currentVersion: '2.2.0',
            currentBuildId: '1111111',
            environment: 'web',
            fetchImpl: mockFetch
        });

        expect(res.status).toBe('available');
        expect(res.update?.isSameVersionHotfix).toBe(true);
        expect(res.update?.changelog).toContain('fix: hotfix reader scroll');
        expect(res.update?.changelog).toContain('Initial v2.2.0 notes');
    });

    it('returns up-to-date when deployed version and buildId match, even if offline/404 in dev', async () => {
        const sameFetch = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).startsWith('./version.json')) {
                return jsonResponse({ version: '2.2.0', buildId: '28175fc' });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const upToDate = await checkForWebUpdate({
            currentVersion: '2.2.0',
            currentBuildId: '28175fc',
            environment: 'web',
            fetchImpl: sameFetch
        });
        expect(upToDate.status).toBe('up-to-date');

        const failingFetch = vi.fn(async () => {
            throw new Error('Network down');
        }) as unknown as typeof fetch;
        const silent = await checkForWebUpdate({
            currentVersion: '2.2.0',
            currentBuildId: '28175fc',
            environment: 'web',
            fetchImpl: failingFetch
        });
        expect(silent.status).toBe('up-to-date');
    });

    it('checks GitHub releases directly in singlefile portable mode', async () => {
        const mockFetch = vi.fn(async () =>
            jsonResponse({
                tag_name: 'v2.4.0',
                name: 'EllipsisProse v2.4.0',
                body: '* New feature',
                html_url: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.4.0'
            })
        ) as unknown as typeof fetch;

        const res = await checkForWebUpdate({
            currentVersion: '2.2.0',
            environment: 'singlefile',
            fetchImpl: mockFetch
        });

        expect(res.status).toBe('available');
        expect(res.update?.environment).toBe('singlefile');
        expect(res.update?.downloadUrl).toContain('EllipsisProse-portable.html');
    });
});

describe('performHardReloadUpdate', () => {
    it('deletes only EllipsisProse/Workbox caches, activates waiting SW, and navigates cleanly', async () => {
        const deleted: string[] = [];
        const postMessage = vi.fn();
        const update = vi.fn(async () => {});
        const replaceSpy = vi.fn();
        const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }));

        Object.defineProperty(window, 'caches', {
            configurable: true,
            value: {
                keys: vi.fn(async () => [
                    'workbox-precache-v2-http://localhost/',
                    'ellipsisprose-runtime-v1',
                    'unrelated-user-cache'
                ]),
                delete: vi.fn(async (name: string) => {
                    deleted.push(name);
                    return true;
                })
            }
        });

        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                getRegistrations: vi.fn(async () => [
                    {
                        update,
                        waiting: { postMessage }
                    }
                ])
            }
        });

        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                href: 'https://pacmanincarnate.github.io/WriteforMe/?_ep_updated=1',
                replace: replaceSpy
            }
        });
        vi.stubGlobal('fetch', fetchSpy);

        try {
            await performHardReloadUpdate();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation
            });
            vi.unstubAllGlobals();
        }

        expect(deleted).toEqual([
            'workbox-precache-v2-http://localhost/',
            'ellipsisprose-runtime-v1'
        ]);
        expect(update).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(replaceSpy).toHaveBeenCalledTimes(1);
        expect(String(replaceSpy.mock.calls[0][0])).toContain('_ep_updated=');
    });
});

describe('UpdateModal component', () => {
    it('renders changelog, version transition, and environment-appropriate actions', () => {
        const webInfo: UpdateInfo = {
            environment: 'web',
            currentVersion: '2.2.0',
            latestVersion: '2.3.0',
            releaseName: 'EllipsisProse v2.3.0',
            changelog: '## Highlights\n* Faster story generation',
            releaseUrl: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.3.0',
            publishedAt: '2026-11-26T18:00:00Z',
            updateKey: '2.3.0:abc'
        };

        const onConfirm = vi.fn();
        const onSkip = vi.fn();
        const onClose = vi.fn();

        const view = mountElement(
            <UpdateModal
                isOpen={true}
                updateInfo={webInfo}
                desktopState={null}
                isApplying={false}
                error={null}
                onConfirm={onConfirm}
                onCancelDownload={vi.fn()}
                onSkip={onSkip}
                onClose={onClose}
                onOpenReleaseNotes={vi.fn()}
            />
        );

        expect(view.container.textContent).toContain('Update Available');
        expect(view.container.textContent).toContain('v2.2.0');
        expect(view.container.textContent).toContain('v2.3.0');
        expect(view.container.textContent).toContain('Faster story generation');
        expect(view.container.textContent).toContain('Hard Reload & Update');

        const buttons = Array.from(view.container.querySelectorAll('button'));
        const confirmBtn = buttons.find((b) => b.textContent?.includes('Hard Reload & Update'));
        expect(confirmBtn).toBeDefined();
        act(() => {
            confirmBtn?.click();
        });
        expect(onConfirm).toHaveBeenCalledTimes(1);

        view.unmount();
    });

    it('renders desktop download progress and cancel action while downloading', () => {
        const desktopInfo: UpdateInfo = {
            environment: 'desktop',
            installMode: 'nsis',
            currentVersion: '2.2.0',
            latestVersion: '2.3.0',
            releaseName: 'EllipsisProse v2.3.0',
            changelog: '* Desktop installer improvements',
            releaseUrl: 'https://github.com/pacmanincarnate/WriteforMe/releases/tag/v2.3.0',
            publishedAt: null,
            updateKey: '2.3.0:desktop:nsis',
            assetName: 'EllipsisProse-Setup-2.3.0.exe'
        };

        const desktopState: DesktopUpdaterState = {
            status: 'downloading',
            manual: false,
            currentVersion: '2.2.0',
            latestVersion: '2.3.0',
            releaseName: 'EllipsisProse v2.3.0',
            changelog: '* Desktop installer improvements',
            releaseUrl: desktopInfo.releaseUrl,
            publishedAt: null,
            installMode: 'nsis',
            asset: {
                name: 'EllipsisProse-Setup-2.3.0.exe',
                size: 100 * 1024 * 1024,
                downloadUrl: 'https://example.com/setup.exe',
                sha256: null
            },
            progress: {
                phase: 'downloading',
                file: 'EllipsisProse-Setup-2.3.0.exe',
                received: 50 * 1024 * 1024,
                total: 100 * 1024 * 1024,
                percent: 50
            },
            error: null,
            filePath: null,
            skippedVersion: '',
            isSkipped: false,
            checkedAt: null
        };

        const onCancel = vi.fn();
        const view = mountElement(
            <UpdateModal
                isOpen={true}
                updateInfo={desktopInfo}
                desktopState={desktopState}
                isApplying={false}
                error={null}
                onConfirm={vi.fn()}
                onCancelDownload={onCancel}
                onSkip={vi.fn()}
                onClose={vi.fn()}
                onOpenReleaseNotes={vi.fn()}
            />
        );

        expect(view.container.textContent).toContain('Desktop Installer');
        expect(view.container.textContent).toContain('50%');
        const cancelBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Cancel Download')
        );
        expect(cancelBtn).toBeDefined();
        act(() => {
            cancelBtn?.click();
        });
        expect(onCancel).toHaveBeenCalledTimes(1);

        view.unmount();
    });
});
