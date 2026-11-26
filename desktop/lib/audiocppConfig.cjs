'use strict';

/**
 * The wave presets in audiocpp/*.json point at one developer's D:\ drive. For the desktop app
 * we write copies whose model paths point at the user's models folder and whose compute backend
 * matches the audio.cpp build they installed (cuda, vulkan or cpu). The originals are untouched,
 * so "Start Backends.bat" keeps working as before.
 */

const fs = require('fs');
const path = require('path');

const WAVE_FILES = ['config_wave1_breeze.json', 'config_wave2_drama3.json', 'config_wave3_verifier.json'];
const PATH_KEYS = ['path', 'weights', 'codec_weights', 'vad_weights'];

/** Which models-folder file a preset path refers to, by file name. */
function relocate(p, modelsDir, aliases) {
    const base = String(p).split(/[\\/]/).pop();
    if (!base) return p;
    const known = aliases[base.toLowerCase()];
    if (known) return path.join(modelsDir, known);
    return p;
}

/** Maps a file name used anywhere in the presets to its place under the models folder. */
function modelAliases(packs) {
    const out = {};
    for (const pack of packs) {
        for (const f of pack.files) {
            const rel = f.to.split('/').join(path.sep);
            out[path.basename(f.to).toLowerCase()] = rel;
        }
    }
    // The wave 1 preset names the codec by its upstream name; the downloader renames it.
    out['breeze-tts-2-f16.gguf'] = out['breeze-codec-f16.gguf'];
    return out;
}

function rewriteConfig(cfg, { modelsDir, backend, aliases }) {
    const copy = JSON.parse(JSON.stringify(cfg));
    if (backend && typeof copy.backend === 'string') copy.backend = backend;
    for (const m of Array.isArray(copy.models) ? copy.models : []) {
        for (const k of PATH_KEYS) {
            if (typeof m[k] === 'string') m[k] = relocate(m[k], modelsDir, aliases);
        }
        if (backend === 'cpu' && typeof m.device === 'string' && /^cuda/i.test(m.device)) m.device = 'CPU';
    }
    return copy;
}

/**
 * Writes the three wave presets into outDir. Returns outDir.
 * @param {{templatesDir:string,outDir:string,modelsDir:string,backend:string,packs:object[]}} o
 */
function writeWaveConfigs({ templatesDir, outDir, modelsDir, backend, packs }) {
    fs.mkdirSync(outDir, { recursive: true });
    const aliases = modelAliases(packs);
    for (const name of WAVE_FILES) {
        const src = path.join(templatesDir, name);
        if (!fs.existsSync(src)) continue;
        const cfg = JSON.parse(fs.readFileSync(src, 'utf8'));
        const out = rewriteConfig(cfg, { modelsDir, backend, aliases });
        fs.writeFileSync(path.join(outDir, name), JSON.stringify(out, null, 2));
    }
    return outDir;
}

module.exports = { writeWaveConfigs, rewriteConfig, modelAliases, WAVE_FILES };
