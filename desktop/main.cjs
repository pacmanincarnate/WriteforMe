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
const os = require('os');
const { spawn } = require('child_process');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { Supervisor, httpOk, isPortOpen } = require('./lib/supervisor.cjs');
const { DesktopSettings } = require('./lib/settings.cjs');
const { Controller } = require('./lib/controller.cjs');
const { PORTS, getBackend, AUDIO_MODEL_PACKS } = require('./lib/backends.cjs');
const { latestRelease } = require('./lib/download.cjs');
const { AppUpdater, detectInstallMode, buildPortableUpdaterScript } = require('./lib/updater.cjs');

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const appFilesDir = app.isPackaged ? path.join(process.resourcesPath, 'app-files') : path.resolve(__dirname, '..');
const settings = new DesktopSettings(app.getPath('userData'));
const dataDir = path.join(app.getPath('userData'), 'data');
let mainWindow = null;
let backendsWindow = null;

function resolveDesktopAppVersion() {
    if (process.env.ELLIPSISPROSE_APP_VERSION) {
        return String(process.env.ELLIPSISPROSE_APP_VERSION).replace(/^v/i, '');
    }
    if (app.isPackaged) return app.getVersion();
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(appFilesDir, 'package.json'), 'utf8'));
        if (pkg && typeof pkg.version === 'string') return pkg.version;
    } catch (_) { /* ignore */ }
    return app.getVersion();
}

const appVersion = resolveDesktopAppVersion();
const installMode = detectInstallMode({
    isPackaged: app.isPackaged,
    platform: process.platform,
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE
});

let updaterPushTimer = null;
let lastUpdaterStatus = null;
function pushUpdaterState(state) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const statusChanged = state.status !== lastUpdaterStatus;
    lastUpdaterStatus = state.status;
    if (statusChanged || state.status !== 'downloading') {
        if (updaterPushTimer) { clearTimeout(updaterPushTimer); updaterPushTimer = null; }
        mainWindow.webContents.send('updater:state', state);
        return;
    }
    if (updaterPushTimer) return;
    updaterPushTimer = setTimeout(() => {
        updaterPushTimer = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:state', appUpdater.getState());
        }
    }, 150);
}

const appUpdater = new AppUpdater({
    currentVersion: appVersion,
    installMode,
    userDataDir: app.getPath('userData'),
    settings,
    ...(process.env.ELLIPSISPROSE_RELEASE_API
        ? { fetchRelease: (repo, o) => latestRelease(repo, { ...o, apiBase: process.env.ELLIPSISPROSE_RELEASE_API }) }
        : {}),
    onChange: pushUpdaterState
});

const supervisor = new Supervisor({ onChange: () => pushState() });
const controller = new Controller({
    settings,
    supervisor,
    appFilesDir,
    dataDir,
    node: { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } },
    onVramEvent: (evt) => {
        if (!evt || !evt.type) return;
        if (evt.type === 'state-changed') {
            pushState();
            return;
        }
        if (evt.type === 'vram-offloaded') {
            notifyMainBackendEvent({ ...evt, always: true });
            pushState();
            return;
        }
        if (evt.message) {
            notifyMainBackendEvent(evt);
        }
        pushState();
    },
    // Points release lookups at a mirror or a test server instead of api.github.com.
    ...(process.env.ELLIPSISPROSE_RELEASE_API
        ? { fetchRelease: (repo, o) => latestRelease(repo, { ...o, apiBase: process.env.ELLIPSISPROSE_RELEASE_API }) }
        : {})
});

let pushTimer = null;
function sendStateNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (backendsWindow && !backendsWindow.isDestroyed()) {
        backendsWindow.webContents.send('state', controller.list());
    }
}
function pushState(immediate = false) {
    if (immediate) { sendStateNow(); return; }
    if (pushTimer) return;
    pushTimer = setTimeout(sendStateNow, 150);
}

function notifyMainBackendEvent(payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const backendsFocused = Boolean(backendsWindow && !backendsWindow.isDestroyed() && backendsWindow.isFocused());
    if (!payload.always && backendsFocused) return;
    mainWindow.webContents.send('backends:event', payload);
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
        webPreferences: {
            preload: path.join(__dirname, 'preload-main.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
        }
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

async function handleMenuCheckForUpdates() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        await appUpdater.check({ manual: true });
        return;
    }
    const state = await appUpdater.check({ manual: true });
    if (state.status === 'available') {
        await dialog.showMessageBox({
            type: 'info',
            title: 'Update Available',
            message: `EllipsisProse v${state.latestVersion} is available (current: v${state.currentVersion}).`,
            detail: state.changelog ? state.changelog.slice(0, 600) : 'Open EllipsisProse to review and install the update.'
        });
    } else if (state.status === 'up-to-date') {
        await dialog.showMessageBox({
            type: 'info',
            title: 'Up to Date',
            message: `EllipsisProse v${state.currentVersion} is up to date.`
        });
    } else if (state.status === 'error') {
        await dialog.showMessageBox({
            type: 'warning',
            title: 'Update Check Failed',
            message: state.error || 'Could not check for updates.'
        });
    }
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
                { label: 'Check for Updates…', click: () => { void handleMenuCheckForUpdates(); } },
                { type: 'separator' },
                { label: 'Third-party licenses', click: () => shell.openPath(path.join(appFilesDir, 'THIRD_PARTY.md')) },
                { label: `EllipsisProse ${appVersion}`, enabled: false }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
    const guard = (fn) => async (_e, ...args) => {
        try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: err.message }; }
    };

    const watchJob = (key, promise) => {
        promise.then((res) => {
            if (res && typeof res === 'object' && (res.paused || res.cancelled)) {
                pushState(true);
                return;
            }
            if (key.startsWith('pack:')) {
                const packId = key.slice(5);
                const pack = AUDIO_MODEL_PACKS.find((p) => p.id === packId);
                notifyMainBackendEvent({
                    type: 'pack-complete',
                    packId,
                    message: `${pack?.name || packId} downloaded.`,
                    level: 'success'
                });
            } else if (key === 'text-model') {
                notifyMainBackendEvent({
                    type: 'model-complete',
                    message: 'KoboldCpp model downloaded and selected.',
                    level: 'success'
                });
            } else {
                const b = getBackend(key);
                notifyMainBackendEvent({
                    type: 'install-complete',
                    backendId: key,
                    message: `${b.name} installed successfully.`,
                    level: 'success'
                });
                // Do not eagerly start KoboldCpp or ComfyUI after install so they start silently on demand.
                if (key !== 'koboldcpp' && key !== 'comfyui') {
                    controller.start(key, pushState).catch(() => pushState());
                }
            }
            pushState(true);
        }).catch((err) => {
            if (key.startsWith('pack:')) {
                const packId = key.slice(5);
                const pack = AUDIO_MODEL_PACKS.find((p) => p.id === packId);
                notifyMainBackendEvent({
                    type: 'pack-error',
                    packId,
                    message: `${pack?.name || packId} download failed: ${err.message}`,
                    level: 'error'
                });
            } else if (key === 'text-model') {
                notifyMainBackendEvent({
                    type: 'model-error',
                    message: `Model download failed: ${err.message}`,
                    level: 'error'
                });
            } else {
                const b = getBackend(key);
                notifyMainBackendEvent({
                    type: 'install-error',
                    backendId: key,
                    message: `${b.name} install failed: ${err.message}`,
                    level: 'error'
                });
            }
            pushState(true);
        });
    };

    ipcMain.handle('list', guard(() => controller.list()));
    ipcMain.handle('install', guard((id, variant) => {
        watchJob(id, controller.install(id, variant, pushState));
        pushState(true);
    }));
    ipcMain.handle('uninstall', guard((id) => { controller.uninstall(id); pushState(true); }));
    ipcMain.handle('pause', guard((key) => controller.pause(key, () => pushState(true))));
    ipcMain.handle('resume', guard((key) => {
        watchJob(key, controller.resume(key, pushState));
        pushState(true);
    }));
    ipcMain.handle('cancel', guard((key) => controller.cancel(key, () => pushState(true))));
    ipcMain.handle('start', guard((id) => { controller.start(id, pushState).catch(() => pushState()); pushState(true); }));
    ipcMain.handle('stop', guard((id) => { controller.stop(id); pushState(true); }));
    ipcMain.handle('downloadPack', guard((id) => {
        watchJob(`pack:${id}`, controller.downloadPack(id, pushState));
        pushState(true);
    }));
    ipcMain.handle('downloadTextModel', guard((url) => {
        watchJob('text-model', controller.downloadTextModel(url, pushState));
        pushState(true);
    }));
    ipcMain.handle('setOption', guard((patch) => { settings.update(patch); pushState(true); }));
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
        pushState(true);
        return r.filePaths[0];
    }));
    ipcMain.handle('chooseExistingInstall', guard(async (id) => {
        const isKobold = id === 'koboldcpp';
        const r = await dialog.showOpenDialog(backendsWindow, isKobold
            ? {
                title: 'Select existing KoboldCpp executable',
                properties: ['openFile'],
                filters: [{ name: 'KoboldCpp executable', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
            }
            : {
                title: id === 'comfyui' ? 'Select existing ComfyUI folder' : 'Select existing audio.cpp folder',
                properties: ['openDirectory']
            });
        if (r.canceled || !r.filePaths[0]) return null;
        controller.setCustomInstall(id, r.filePaths[0]);
        pushState(true);
        return r.filePaths[0];
    }));
    ipcMain.handle('clearExistingInstall', guard((id) => {
        controller.clearCustomInstall(id);
        pushState(true);
    }));
    ipcMain.handle('chooseTextModel', guard(async () => {
        const r = await dialog.showOpenDialog(backendsWindow, { title: 'Choose a GGUF model for KoboldCpp', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] });
        if (r.canceled || !r.filePaths[0]) return null;
        settings.update({ koboldcpp: { modelPath: r.filePaths[0], configPath: '' } });
        pushState(true);
        return r.filePaths[0];
    }));
    ipcMain.handle('chooseKoboldConfig', guard(async () => {
        const r = await dialog.showOpenDialog(backendsWindow, {
            title: 'Choose a KoboldCpp config file',
            properties: ['openFile'],
            filters: [{ name: 'KoboldCpp config', extensions: ['kcpps', 'json'] }, { name: 'All files', extensions: ['*'] }]
        });
        if (r.canceled || !r.filePaths[0]) return null;
        settings.update({ koboldcpp: { configPath: r.filePaths[0], modelPath: '' } });
        pushState(true);
        return r.filePaths[0];
    }));
    ipcMain.handle('backends:ensureKoboldRunning', guard(() =>
        controller.ensureKoboldRunning(
            () => pushState(),
            () => notifyMainBackendEvent({
                type: 'kobold-starting',
                backendId: 'koboldcpp',
                message: 'Starting KoboldCpp and loading model…',
                level: 'info',
                always: true
            })
        )
    ));
    ipcMain.handle('backends:ensureComfyRunning', guard(() =>
        controller.ensureComfyRunning(
            () => pushState(),
            () => notifyMainBackendEvent({
                type: 'comfy-starting',
                backendId: 'comfyui',
                message: 'Starting ComfyUI in the background…',
                level: 'info',
                always: true
            })
        )
    ));
    ipcMain.handle('backends:launchComfy', guard(() =>
        controller.ensureComfyRunning(() => pushState(), () => {}, { explicit: true })
    ));
    ipcMain.handle('backends:openWindow', guard(() => { openBackendsWindow(); }));
    ipcMain.handle('backends:acquireGpuLease', guard((modality, hints) => controller.vram.acquireLease(modality, hints)));
    ipcMain.handle('backends:releaseGpuLease', guard((leaseId) => controller.vram.releaseLease(leaseId)));
    ipcMain.handle('backends:setCloudActivity', guard((activeOrCount) => controller.vram.setCloudActivity(activeOrCount)));
    ipcMain.handle('backends:freeAllVram', guard(async () => {
        const res = await controller.vram.freeAllVram('manual');
        pushState(true);
        return res;
    }));
    ipcMain.handle('backends:getVramStatus', guard(() => controller.vram.getStatus()));
    ipcMain.handle('freeAllVram', guard(async () => {
        const res = await controller.vram.freeAllVram('manual');
        pushState(true);
        return res;
    }));
    ipcMain.handle('getVramStatus', guard(() => controller.vram.getStatus()));

    ipcMain.handle('updater:getState', guard(() => appUpdater.getState()));
    ipcMain.handle('updater:check', guard((opts) => appUpdater.check({ manual: Boolean(opts?.manual) })));
    ipcMain.handle('updater:cancel', guard(() => { appUpdater.cancel(); return appUpdater.getState(); }));
    ipcMain.handle('updater:skipVersion', guard((version) => appUpdater.skipVersion(version)));
    ipcMain.handle('updater:openReleaseNotes', guard((url) => {
        const target = String(url || appUpdater.getState().releaseUrl || 'https://github.com/pacmanincarnate/WriteforMe/releases');
        if (!/^https:\/\/github\.com\/pacmanincarnate\/WriteforMe(\/|$)/i.test(target)) {
            throw new Error('Unsupported release URL');
        }
        return shell.openExternal(target);
    }));
    ipcMain.handle('updater:downloadAndInstall', guard(async () => {
        const result = await appUpdater.download();
        const mode = appUpdater.installMode;

        if (mode === 'dev') {
            appUpdater.setDownloadedManual(result.filePath);
            shell.showItemInFolder(result.filePath);
            return { mode: 'manual', filePath: result.filePath };
        }

        if (mode === 'portable') {
            const currentExe = process.env.PORTABLE_EXECUTABLE_FILE;
            let writable = false;
            if (currentExe) {
                try {
                    fs.accessSync(path.dirname(currentExe), fs.constants.W_OK);
                    writable = true;
                } catch (_) {
                    writable = false;
                }
            }
            if (!writable || !currentExe) {
                appUpdater.setDownloadedManual(result.filePath);
                shell.showItemInFolder(result.filePath);
                return { mode: 'manual', filePath: result.filePath };
            }

            const { targetExePath, script } = buildPortableUpdaterScript({
                downloadedPath: result.filePath,
                currentExePath: currentExe,
                newAssetName: path.basename(result.filePath),
                pid: process.pid
            });
            const scriptPath = path.join(os.tmpdir(), `ellipsisprose-update-${process.pid}-${Date.now()}.cmd`);
            fs.writeFileSync(scriptPath, script, 'utf8');

            appUpdater.setInstalling();
            supervisor.stopAll();
            const child = spawn('cmd.exe', ['/c', scriptPath], {
                detached: true,
                windowsHide: true,
                stdio: 'ignore'
            });
            child.unref();
            setTimeout(() => app.quit(), 250);
            return { mode: 'portable', targetExePath };
        }

        // NSIS installer mode
        appUpdater.setInstalling();
        supervisor.stopAll();
        const installer = spawn(result.filePath, [], {
            detached: true,
            stdio: 'ignore'
        });
        installer.unref();
        setTimeout(() => app.quit(), 250);
        return { mode: 'nsis', filePath: result.filePath };
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

app.on('before-quit', () => { controller.vram.dispose(); supervisor.stopAll(); });
app.on('window-all-closed', () => app.quit());
