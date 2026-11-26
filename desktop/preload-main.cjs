'use strict';

// Minimal sandboxed bridge exposed to the main EllipsisProse window solely for Desktop app updates.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ellipsisDesktopUpdater', {
    isDesktop: true,
    getState: () => ipcRenderer.invoke('updater:getState'),
    checkForUpdates: (opts) => ipcRenderer.invoke('updater:check', opts),
    downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),
    cancelDownload: () => ipcRenderer.invoke('updater:cancel'),
    skipVersion: (version) => ipcRenderer.invoke('updater:skipVersion', version),
    openReleaseNotes: (url) => ipcRenderer.invoke('updater:openReleaseNotes', url),
    onStateChange: (cb) => {
        if (typeof cb !== 'function') return () => {};
        const listener = (_event, state) => cb(state);
        ipcRenderer.on('updater:state', listener);
        return () => ipcRenderer.removeListener('updater:state', listener);
    }
});
