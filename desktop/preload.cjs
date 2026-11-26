'use strict';

// Only the Backends window gets this bridge. The main app window has no preload at all.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('desktop', {
    list: call('list'),
    install: call('install'),
    uninstall: call('uninstall'),
    cancel: call('cancel'),
    start: call('start'),
    stop: call('stop'),
    downloadPack: call('downloadPack'),
    downloadTextModel: call('downloadTextModel'),
    setOption: call('setOption'),
    finishSetup: call('finishSetup'),
    openPath: call('openPath'),
    openExternal: call('openExternal'),
    chooseBackendsDir: call('chooseBackendsDir'),
    chooseTextModel: call('chooseTextModel'),
    onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s))
});
