'use strict';

/* global desktop */

const $ = (sel, root = document) => root.querySelector(sel);
const cards = new Map();
let state = null;

function fmtBytes(n) {
    if (!Number.isFinite(n)) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function progressText(job) {
    if (!job) return '';
    if (job.error) return job.error;
    if (job.phase === 'starting') return 'Starting…';
    if (job.phase === 'release') return 'Finding the latest release…';
    if (job.phase === 'verify') return `Verifying checksum for ${job.file}…`;
    if (job.phase === 'extract') return `Unpacking ${job.file}…`;
    if (job.phase === 'paused') {
        if (job.file && job.received) {
            const pct = job.total ? ` (${Math.floor((job.received / job.total) * 100)}%)` : '';
            return `Paused — ${job.file}: ${fmtBytes(job.received)}${job.total ? ` of ${fmtBytes(job.total)}` : ''}${pct}`;
        }
        return 'Paused';
    }
    if (job.phase === 'download') {
        const pct = job.total ? ` (${Math.floor((job.received / job.total) * 100)}%)` : '';
        const spd = job.speedBps > 0 ? ` · ${fmtBytes(job.speedBps)}/s` : '';
        return `${job.file}: ${fmtBytes(job.received)}${job.total ? ` of ${fmtBytes(job.total)}` : ''}${pct}${spd}`;
    }
    return 'Working…';
}

function showProgressBox(box, job, key) {
    if (!box) return;
    box.hidden = !job;
    if (!job) return;
    const bar = $('.bar', box);
    const indeterminate = !job.paused && !job.error && (
        job.phase === 'starting' ||
        job.phase === 'release' ||
        job.phase === 'verify' ||
        job.phase === 'extract' ||
        (job.phase === 'download' && !job.total)
    );
    bar.classList.toggle('indeterminate', indeterminate);
    bar.classList.toggle('paused', Boolean(job.paused));
    const pct = (job.phase === 'download' || job.paused) && job.total
        ? Math.min(100, (job.received / job.total) * 100)
        : (job.phase === 'extract' || job.phase === 'verify' ? 100 : 0);
    $('i', bar).style.width = indeterminate ? '40%' : `${pct}%`;

    const t = $('.ptext', box);
    t.textContent = progressText(job);
    t.classList.toggle('error', Boolean(job.error));

    const pauseBtn = $('.pause', box);
    if (pauseBtn) {
        const canTogglePause = !job.error && job.phase !== 'extract' && job.phase !== 'verify';
        pauseBtn.hidden = !canTogglePause;
        if (canTogglePause) {
            pauseBtn.disabled = false;
            pauseBtn.textContent = job.paused ? 'Resume' : 'Pause';
            pauseBtn.onclick = () => {
                pauseBtn.disabled = true;
                pauseBtn.textContent = job.paused ? 'Resuming…' : 'Pausing…';
                act(job.paused ? desktop.resume(key) : desktop.pause(key));
            };
        }
    }

    const cancelBtn = $('.cancel', box);
    if (cancelBtn) {
        cancelBtn.textContent = job.error ? 'Dismiss' : 'Cancel';
        cancelBtn.onclick = () => act(desktop.cancel(key));
    }
}

async function act(promise) {
    const r = await promise;
    if (r && r.ok === false) alertInline(r.error);
    await refresh();
    return r && r.value;
}

function alertInline(msg) {
    const el = document.createElement('p');
    el.className = 'error';
    el.textContent = msg;
    $('header').appendChild(el);
    setTimeout(() => el.remove(), 8000);
}

function statusLabel(b) {
    if (!b.installed) return 'Not installed';
    if ((b.id === 'koboldcpp' || b.id === 'comfyui') && b.status === 'stopped' && b.autostart) return 'Ready (on demand)';
    const map = { running: 'Running', external: 'Running (already open)', starting: 'Starting…', unresponsive: 'Started, waiting', failed: 'Stopped with an error', stopped: 'Installed' };
    return map[b.status] || 'Installed';
}

function koboldExtra(el, b) {
    const box = $('.extra', el);
    box.innerHTML = `
        <div class="row"><span>Model / Config:</span> <code class="model"></code>
            <button class="pick">Choose .gguf…</button>
            <button class="pick-config">Choose .kcpps config…</button>
            <button class="clear-target link danger">Clear</button>
            <button class="link open-models">Open models folder</button></div>
        <div class="row"><input type="text" class="url" placeholder="Or paste a Hugging Face link to a .gguf file">
            <button class="fetch">Download</button></div>
        <p class="muted">Pick a <code>.gguf</code> model (defaults to 65,536 context, Q8 KV cache with Flash Attention, Jinja templates, and automatic GPU layer offloading) or a saved <code>.kcpps</code> config file. Without one, KoboldCpp opens its own launcher. Starts on demand so VRAM stays free until needed.</p>
        <div class="progress tm" hidden><div class="bar"><i></i></div><span class="ptext"></span><button class="pause link">Pause</button><button class="cancel link">Cancel</button></div>
        <div class="row"><span>Extra arguments:</span><input type="text" class="args" placeholder="Override defaults, e.g. --contextsize 32768 --gpulayers 40"></div>`;
    $('.pick', box).onclick = () => act(desktop.chooseTextModel());
    $('.pick-config', box).onclick = () => act(desktop.chooseKoboldConfig());
    $('.clear-target', box).onclick = () => act(desktop.setOption({ koboldcpp: { modelPath: '', configPath: '' } }));
    $('.open-models', box).onclick = () => act(desktop.openPath('textModels'));
    $('.fetch', box).onclick = () => {
        const u = $('.url', box).value.trim();
        if (!u) return;
        showProgressBox($('.progress.tm', box), { phase: 'starting', file: u.split('/').pop() || 'model.gguf', received: 0, total: null, speedBps: 0, paused: false, error: null }, 'text-model');
        act(desktop.downloadTextModel(u));
    };
    $('.args', box).onchange = (e) => act(desktop.setOption({ koboldcpp: { extraArgs: e.target.value } }));
    $('.args', box).value = b.options.extraArgs || '';
}

function comfyExtra(el, b) {
    const box = $('.extra', el);
    box.innerHTML = `
        <p class="muted">Image generation uses Krea 2 Turbo: put the diffusion model, the Qwen3-VL text encoder and the Qwen VAE in ComfyUI's
            <code>models/diffusion_models</code>, <code>models/text_encoders</code> and <code>models/vae</code> folders, then pick them in EllipsisProse Settings. Starts silently in the background when needed without opening a browser window.</p>
        <div class="row"><button class="open-models">Open ComfyUI models folder</button></div>
        <div class="row"><span>Extra arguments:</span><input type="text" class="args" placeholder="e.g. --lowvram"></div>`;
    $('.open-models', box).onclick = () => act(desktop.openPath('comfyModels'));
    $('.args', box).onchange = (e) => act(desktop.setOption({ comfyui: { extraArgs: e.target.value } }));
    $('.args', box).value = b.options.extraArgs || '';
}

function audioExtra(el) {
    $('.extra', el).innerHTML = '<p class="muted">Runs the EllipsisProse Audio Studio bridge, which starts and swaps audio.cpp models as needed. Download voice models below.</p>';
}

function buildCard(b) {
    const el = $('#backend-tpl').content.firstElementChild.cloneNode(true);
    $('.name', el).textContent = b.name;
    $('.role', el).textContent = b.role;
    $('.size', el).textContent = b.sizeHint;
    $('.license', el).textContent = b.license;
    $('.license', el).onclick = (e) => { e.preventDefault(); desktop.openExternal(b.licenseUrl); };
    $('.homepage', el).onclick = (e) => { e.preventDefault(); desktop.openExternal(b.homepage); };
    const sel = $('.variant', el);
    for (const v of b.variants) sel.add(new Option(v.label, v.id));
    if (b.id === 'audiocpp') {
        sel.onchange = () => act(desktop.setOption({ audiocpp: { variant: sel.value } }));
    }
    $('.install', el).onclick = () => {
        const btn = $('.install', el);
        btn.disabled = true;
        btn.textContent = 'Starting…';
        showProgressBox($('.progress', el), { phase: 'starting', file: b.name, received: 0, total: null, speedBps: 0, paused: false, error: null }, b.id);
        act(desktop.install(b.id, sel.value));
    };
    $('.use-existing', el).onclick = () => act(desktop.chooseExistingInstall(b.id));
    $('.change-existing', el).onclick = () => act(desktop.chooseExistingInstall(b.id));
    $('.unlink', el).onclick = () => act(desktop.clearExistingInstall(b.id));
    $('.start', el).onclick = () => act(desktop.start(b.id));
    $('.stop', el).onclick = () => act(desktop.stop(b.id));
    $('.uninstall', el).onclick = () => { if (confirm(`Remove ${b.name} from this PC? Your models stay.`)) act(desktop.uninstall(b.id)); };
    $('.autostart', el).onchange = (e) => act(desktop.setOption({ autostart: { [b.id]: e.target.checked } }));
    if (b.id === 'koboldcpp') {
        $('.auto-label', el).textContent = 'Start when needed (loads model on first request)';
        koboldExtra(el, b);
    }
    if (b.id === 'comfyui') {
        $('.auto-label', el).textContent = 'Start when needed (silent, on first image request)';
        comfyExtra(el, b);
    }
    if (b.id === 'audiocpp') audioExtra(el, b);
    $('#backends').appendChild(el);
    return el;
}

function updateCard(el, b) {
    const live = b.status === 'running' || b.status === 'starting' || b.status === 'external' || b.status === 'unresponsive';
    const badge = $('.status', el);
    badge.textContent = statusLabel(b);
    const badgeState = b.installed
        ? ((b.id === 'koboldcpp' || b.id === 'comfyui') && b.status === 'stopped' && b.autostart ? 'ondemand' : b.status)
        : '';
    badge.className = `badge status ${badgeState}`;
    if (b.installed && b.installed.variant && document.activeElement !== $('.variant', el)) $('.variant', el).value = b.installed.variant;
    const jobRunning = Boolean(b.job && !b.job.error && !b.job.paused);
    const installBtn = $('.install', el);
    if (jobRunning) {
        installBtn.textContent = b.job.phase === 'extract' ? 'Unpacking…' : (b.job.phase === 'verify' ? 'Verifying…' : 'Installing…');
        installBtn.disabled = true;
    } else if (b.job && b.job.paused) {
        installBtn.textContent = 'Paused';
        installBtn.disabled = true;
    } else {
        installBtn.textContent = b.installed ? `Reinstall / update${b.installed.tag ? ` (${b.installed.tag})` : ''}` : 'Install';
        installBtn.disabled = false;
    }
    installBtn.classList.toggle('primary', !b.installed);

    const isCustom = b.installSource === 'custom';
    const hasCustomRow = isCustom || b.customPathMissing;
    const customRow = $('.custom-path', el);
    customRow.hidden = !hasCustomRow;
    customRow.classList.toggle('missing', Boolean(b.customPathMissing));
    if (hasCustomRow) {
        $('.custom-path-label', customRow).textContent = b.customPathMissing ? 'Existing install not found:' : 'Using existing install:';
        $('.custom-path-val', customRow).textContent = b.customPath;
    }
    $('.use-existing', el).hidden = hasCustomRow;
    $('.start', el).hidden = !b.installed || live;
    $('.stop', el).hidden = !live || b.status === 'external';
    $('.uninstall', el).hidden = !b.installed || isCustom;
    $('.autostart', el).checked = b.autostart;
    showProgressBox($('.progress', el), b.job, b.id);
    $('.log', el).textContent = (b.log || []).join('\n');
    if (b.id === 'koboldcpp') {
        const hasConfig = Boolean(b.options.configPath);
        const hasModel = Boolean(b.options.modelPath);
        $('.model', el).textContent = hasConfig
            ? `Config: ${b.options.configPath}`
            : (hasModel ? `Model: ${b.options.modelPath}` : 'none chosen');
        $('.clear-target', el).hidden = !hasConfig && !hasModel;
    }
}

function renderPacks(packs, s) {
    const box = $('#packs');
    box.innerHTML = '';
    for (const p of packs) {
        const row = document.createElement('div');
        row.className = 'pack';
        const job = p.job;
        row.innerHTML = '<div><strong class="pn"></strong> <span class="muted ps"></span><br><a href="#" class="pl">Model license</a> <span class="ptext muted"></span></div><div class="row btns"></div>';
        $('.pn', row).textContent = p.name;
        $('.ps', row).textContent = p.sizeHint;
        $('.pl', row).onclick = (e) => { e.preventDefault(); desktop.openExternal(p.licenseUrl); };
        $('.ptext', row).textContent = job ? ` · ${progressText(job)}` : '';
        const btns = $('.btns', row);
        const key = `pack:${p.id}`;
        if (p.present) {
            const b = document.createElement('button');
            b.textContent = 'Downloaded';
            b.disabled = true;
            btns.appendChild(b);
        } else if (job && !job.error) {
            if (job.phase !== 'verify') {
                const pauseBtn = document.createElement('button');
                pauseBtn.textContent = job.paused ? 'Resume' : 'Pause';
                pauseBtn.onclick = () => {
                    pauseBtn.disabled = true;
                    act(job.paused ? desktop.resume(key) : desktop.pause(key));
                };
                btns.appendChild(pauseBtn);
            }
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'link';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => act(desktop.cancel(key));
            btns.appendChild(cancelBtn);
        } else {
            const go = document.createElement('button');
            go.textContent = job && job.error ? 'Retry' : 'Download';
            go.onclick = () => {
                go.disabled = true;
                go.textContent = 'Starting…';
                act(desktop.downloadPack(p.id));
            };
            btns.appendChild(go);
        }
        box.appendChild(row);
    }
    const open = document.createElement('button');
    open.className = 'link';
    open.textContent = `Open voice models folder (${s.audioModelsDir})`;
    open.onclick = () => act(desktop.openPath('audioModels'));
    box.appendChild(open);
}

function render(s) {
    state = s;
    $('#backends-dir').textContent = s.backendsDir;
    for (const b of s.backends) {
        if (!cards.has(b.id)) cards.set(b.id, buildCard(b));
        updateCard(cards.get(b.id), b);
    }
    const koboldCard = cards.get('koboldcpp');
    if (koboldCard) showProgressBox($('.progress.tm', koboldCard), s.textModelJob, 'text-model');
    renderPacks(s.packs, s);
    renderVramSettings(s.vram);
    $('#done').textContent = s.setupDone ? 'Close' : 'Done';
}

function renderVramSettings(v) {
    if (!v) return;
    const modeSel = $('#vram-mode');
    const idleSel = $('#vram-idle');
    if (modeSel && document.activeElement !== modeSel && v.mode) modeSel.value = v.mode;
    if (idleSel && document.activeElement !== idleSel && v.idleUnloadMinutes !== undefined) {
        idleSel.value = String(v.idleUnloadMinutes);
    }
}

async function refreshVramStatus() {
    if (!desktop.getVramStatus) return;
    const r = await desktop.getVramStatus();
    if (!r?.ok || !r.value) return;
    const st = r.value;
    const summaryEl = $('#vram-summary');
    const badgeEl = $('#vram-resident');
    if (summaryEl) {
        if (st.gpu && Number.isFinite(st.gpu.freeMb) && Number.isFinite(st.gpu.totalMb)) {
            const freeGb = (st.gpu.freeMb / 1024).toFixed(1);
            const totalGb = (st.gpu.totalMb / 1024).toFixed(1);
            summaryEl.textContent = `${st.gpu.gpu || 'GPU'} · ${freeGb} GB free of ${totalGb} GB`;
        } else {
            summaryEl.textContent = 'GPU telemetry unavailable (will still offload inactive > 2 GB models cleanly)';
        }
    }
    if (badgeEl) {
        const res = st.resident || {};
        const names = [res.llm ? 'KoboldCpp' : null, res.audio ? 'audio.cpp' : null, res.image ? 'ComfyUI' : null].filter(Boolean);
        if (st.currentModality) {
            badgeEl.textContent = `Active: ${st.currentModality.toUpperCase()}`;
            badgeEl.className = 'badge running';
        } else if (names.length > 0) {
            badgeEl.textContent = `Warm: ${names.join(', ')}`;
            badgeEl.className = 'badge ondemand';
        } else {
            badgeEl.textContent = 'VRAM Idle';
            badgeEl.className = 'badge';
        }
    }
}

async function refresh() {
    const r = await desktop.list();
    if (r.ok) render(r.value);
    await refreshVramStatus();
}

$('#change-dir').onclick = () => act(desktop.chooseBackendsDir());
$('#open-dir').onclick = () => act(desktop.openPath('backends'));
$('#vram-mode').onchange = (e) => act(desktop.setOption({ vram: { mode: e.target.value } }));
$('#vram-idle').onchange = (e) => act(desktop.setOption({ vram: { idleUnloadMinutes: Number(e.target.value) } }));
$('#free-vram').onclick = async () => {
    const btn = $('#free-vram');
    btn.disabled = true;
    btn.textContent = 'Freeing…';
    try {
        await act(desktop.freeAllVram());
    } finally {
        btn.disabled = false;
        btn.textContent = 'Free VRAM now';
    }
};
$('#done').onclick = () => desktop.finishSetup();
desktop.onState(render);
refresh();
setInterval(() => {
    if (state && state.backends.some((b) => b.status === 'starting' || b.status === 'unresponsive')) {
        refresh();
    } else {
        void refreshVramStatus();
    }
}, 3000);
