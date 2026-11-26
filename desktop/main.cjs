'use strict';

/**
 * EllipsisProse desktop shell.
 *
 * Runs the existing local server (server.js) and audio bridge as child processes using
 * Electron's own Node, opens the app in a window, and offers a "Backends" window that downloads
 * KoboldCpp, ComfyUI and audio.cpp from their official releases on first run.
 */

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { Supervisor, httpOk, isPortOpen } = require('./lib/supervisor.cjs');
const { DesktopSettings } = require('./lib/settings.cjs');
const { Controller } = require('./lib/controller.cjs');
const { PORTS } = require('./lib/backends.cjs');
const { latestRelease } = require('./lib/download.cjs');

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const appFilesDir = app.isPackaged ? path.join(process.resourcesPath, 'app-files') : path.resolve(__dirname, '..');
const settings = new DesktopSettings(app.getPath('userData'));
const dataDir = path.join(app.getPath('userData'), 'data');
let mainWindow = null;
let backendsWindow = null;

const supervisor = new Supervisor({ onChange: () => pushState() });
const controller = new Controller({
    settings,
    supervisor,
    appFilesDir,
    dataDir,
    node: { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } },
    // Points release lookups at a mirror or a test server instead of api.github.com.
    ...(process.env.ELLIPSISPROSE_RELEASE_API
        ? { fetchRelease: (repo, o) => latestRelease(repo, { ...o, apiBase: process.env.ELLIPSISPROSE_RELEASE_API }) }
        : {})
});

let pushTimer = null;
function pushState() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
        pushTimer = null;
        if (backendsWindow && !backendsWindow.isDestroyed()) {
            backendsWindow.webContents.send('state', controller.list());
        }
    }, 150);
}

/** Picks the web port: 3000 normally; reuse a running EllipsisProse there; else a fallback. */
async function chooseWebPort() {
    if (!(await isPortOpen(PORTS.web))) return { port: PORTS.web, reuse: false };
    if (await httpOk(`http://127.0.0.1:${PORTS.web}/api/storage/status`)) return { port: PORTS.web, reuse: true };
    return { port: 3417, reuse: false };
}

function hardenWindow(win) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
}

function createMainWindow(url) {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 900,
        minHeight: 600,
        title: 'EllipsisProse',
        icon: path.join(__dirname, 'build', 'icon.png'),
        backgroundColor: '#14110f',
        webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    hardenWindow(mainWindow);
    mainWindow.webContents.on('will-navigate', (e, target) => {
        if (!target.startsWith(url)) { e.preventDefault(); shell.openExternal(target); }
    });
    mainWindow.loadURL(url);
    mainWindow.on('closed', () => { mainWindow = null; });
}

function openBackendsWindow() {
    if (backendsWindow && !backendsWindow.isDestroyed()) { backendsWindow.focus(); return; }
    backendsWindow = new BrowserWindow({
        width: 860,
        height: 820,
        title: 'EllipsisProse Backends',
        parent: mainWindow || undefined,
        backgroundColor: '#14110f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
        }
    });
    hardenWindow(backendsWindow);
    backendsWindow.setMenuBarVisibility(false);
    backendsWindow.loadFile(path.join(__dirname, 'ui', 'backends.html'));
    backendsWindow.on('closed', () => { backendsWindow = null; });
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                { label: 'Backends…', accelerator: 'CmdOrCtrl+B', click: openBackendsWindow },
                { label: 'Open data folder', click: () => shell.openPath(dataDir) },
                { label: 'Open backends folder', click: () => { fs.mkdirSync(settings.backendsDir, { recursive: true }); shell.openPath(settings.backendsDir); } },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
                { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }]
        },
        {
            label: 'Help',
            submenu: [
                { label: 'Third-party licenses', click: () => shell.openPath(path.join(appFilesDir, 'THIRD_PARTY.md')) },
                { label: `EllipsisProse ${app.getVersion()}`, enabled: false }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
    const guard = (fn) => async (_e, ...args) => {
        try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: err.message }; }
    };
    ipcMain.handle('list', guard(() => controller.list()));
    ipcMain.handle('install', guard((id, variant) => { controller.install(id, variant, pushState).then(() => controller.start(id, pushState)).catch(() => pushState()); }));
    ipcMain.handle('uninstall', guard((id) => controller.uninstall(id)));
    ipcMain.handle('cancel', guard((key) => controller.cancel(key)));
    ipcMain.handle('start', guard((id) => { controller.start(id, pushState).catch(() => pushState()); }));
    ipcMain.handle('stop', guard((id) => controller.stop(id)));
    ipcMain.handle('downloadPack', guard((id) => { controller.downloadPack(id, pushState).catch(() => pushState()); }));
    ipcMain.handle('downloadTextModel', guard((url) => { controller.downloadTextModel(url, pushState).catch(() => pushState()); }));
    ipcMain.handle('setOption', guard((patch) => { settings.update(patch); pushState(); }));
    ipcMain.handle('finishSetup', guard(() => { settings.update({ setupDone: true }); if (backendsWindow) backendsWindow.close(); }));
    ipcMain.handle('openPath', guard((which) => {
        const map = { backends: settings.backendsDir, audioModels: settings.audioModelsDir, textModels: settings.textModelsDir, comfyModels: controller.layout('comfyui')?.models, data: dataDir };
        const target = map[which];
        if (!target) throw new Error('Not available yet');
        fs.mkdirSync(target, { recursive: true });
        return shell.openPath(target);
    }));
    ipcMain.handle('openExternal', guard((url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); }));
    ipcMain.handle('chooseBackendsDir', guard(async () => {
        const r = await dialog.showOpenDialog(backendsWindow, { title: 'Where should backends and models go?', properties: ['openDirectory', 'createDirectory'] });
        if (r.canceled || !r.filePaths[0]) return null;
        supervisor.stopAll();
        settings.update({ backendsDir: r.filePaths[0] });
        pushState();
        return r.filePaths[0];
    }));
    ipcMain.handle('chooseTextModel', guard(async () => {
        const r = await dialog.showOpenDialog(backendsWindow, { title: 'Choose a GGUF model for KoboldCpp', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] });
        if (r.canceled || !r.filePaths[0]) return null;
        settings.update({ koboldcpp: { modelPath: r.filePaths[0] } });
        pushState();
        return r.filePaths[0];
    }));
}

app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(async () => {
    buildMenu();
    registerIpc();
    fs.mkdirSync(dataDir, { recursive: true });

    const { port, reuse } = await chooseWebPort();
    settings.webPort = port;
    if (!reuse) {
        const svc = await supervisor.start('web', controller.serviceSpec('web'));
        if (svc.status !== 'running' && svc.status !== 'external') {
            dialog.showErrorBox('EllipsisProse could not start', `The local server did not start.\n\n${svc.log.slice(-15).join('\n')}`);
            app.quit();
            return;
        }
    }
    createMainWindow(`http://127.0.0.1:${port}/`);
    if (!settings.data.setupDone) openBackendsWindow();
    controller.startInstalled(pushState);
});

app.on('before-quit', () => supervisor.stopAll());
app.on('window-all-closed', () => app.quit());
