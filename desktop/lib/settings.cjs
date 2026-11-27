'use strict';

/** Desktop-only preferences, kept in <userData>/desktop-settings.json. */

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
    backendsDir: '',
    setupDone: false,
    autostart: { koboldcpp: true, comfyui: true, audiocpp: true },
    koboldcpp: { modelPath: '', configPath: '', extraArgs: '' },
    comfyui: { extraArgs: '' },
    audiocpp: { variant: '' },
    customPaths: { koboldcpp: '', comfyui: '', audiocpp: '' },
    updates: { autoCheck: true, skippedVersion: '' },
    vram: { mode: 'auto', idleUnloadMinutes: 10, evictThresholdMb: 2048 }
});

function merge(base, over) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over || {})) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
            ? { ...base[k], ...v }
            : v;
    }
    return out;
}

class DesktopSettings {
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
        this.file = path.join(userDataDir, 'desktop-settings.json');
        let saved = {};
        try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) { saved = {}; }
        this.data = merge(DEFAULTS, saved);
    }

    get backendsDir() {
        return this.data.backendsDir || path.join(this.userDataDir, 'backends');
    }

    get audioModelsDir() {
        return path.join(this.backendsDir, 'audiocpp-models');
    }

    get textModelsDir() {
        return path.join(this.backendsDir, 'text-models');
    }

    update(patch) {
        this.data = merge(this.data, patch);
        fs.mkdirSync(this.userDataDir, { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
        return this.data;
    }
}

module.exports = { DesktopSettings, DEFAULTS, merge };
