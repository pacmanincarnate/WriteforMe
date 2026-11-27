'use strict';

// Minimal sandboxed bridge exposed to the main EllipsisProse window for Desktop app updates and backend lifecycle.
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

contextBridge.exposeInMainWorld('ellipsisDesktopBackends', {
    isDesktop: true,
    ensureKoboldRunning: () => ipcRenderer.invoke('backends:ensureKoboldRunning'),
    ensureComfyRunning: () => ipcRenderer.invoke('backends:ensureComfyRunning'),
    acquireGpuLease: (modality, hints) => ipcRenderer.invoke('backends:acquireGpuLease', modality, hints),
    releaseGpuLease: (leaseId) => ipcRenderer.invoke('backends:releaseGpuLease', leaseId),
    setCloudActivity: (activeOrCount) => ipcRenderer.invoke('backends:setCloudActivity', activeOrCount),
    freeAllVram: () => ipcRenderer.invoke('backends:freeAllVram'),
    getVramStatus: () => ipcRenderer.invoke('backends:getVramStatus'),
    openBackendsWindow: () => ipcRenderer.invoke('backends:openWindow'),
    onEvent: (cb) => {
        if (typeof cb !== 'function') return () => {};
        const listener = (_event, payload) => cb(payload);
        ipcRenderer.on('backends:event', listener);
        return () => ipcRenderer.removeListener('backends:event', listener);
    }
});
