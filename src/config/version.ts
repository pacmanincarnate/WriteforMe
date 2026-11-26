/**
 * Single source of truth for the application version and update endpoints.
 * `APP_VERSION` and `APP_BUILD_ID` are injected at build and test time.
 */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_BUILD_ID: string = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';

export const GITHUB_REPO = 'pacmanincarnate/WriteforMe';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const PORTABLE_DOWNLOAD_URL =
    'https://pacmanincarnate.github.io/WriteforMe/download/EllipsisProse-portable.html';
