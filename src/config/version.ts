/**
 * Single source of truth for the application version.
 * Injected at build and test time from root `package.json` (`"version"`).
 */
export const APP_VERSION: string = __APP_VERSION__;
