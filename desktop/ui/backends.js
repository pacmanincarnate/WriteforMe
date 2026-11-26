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
    if (job.phase === 'release') return 'Finding the latest release…';
    if (job.phase === 'extract') return `Unpacking ${job.file}…`;
    if (job.phase === 'download') {
        const pct = job.total ? ` (${Math.floor((job.received / job.total) * 100)}%)` : '';
        return `${job.file}: ${fmtBytes(job.received)}${job.total ? ` of ${fmtBytes(job.total)}` : ''}${pct}`;
    }
    return 'Working…';
}

function showProgress(el, job) {
    const box = $('.progress', el);
    box.hidden = !job;
    if (!job) return;
    const pct = job.phase === 'download' && job.total ? (job.received / job.total) * 100 : (job.phase === 'extract' ? 100 : 5);
    $('.bar i', box).style.width = `${pct}%`;
    const t = $('.ptext', box);
    t.textContent = progressText(job);
    t.classList.toggle('error', Boolean(job.error));
    const cancel = $('.cancel', box);
    if (cancel) cancel.textContent = job.error ? 'Dismiss' : 'Cancel';
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
    const map = { running: 'Running', external: 'Running (already open)', starting: 'Starting…', unresponsive: 'Started, waiting', failed: 'Stopped with an error', stopped: 'Installed' };
    return map[b.status] || 'Installed';
}

function koboldExtra(el, b) {
    const box = $('.extra', el);
    box.innerHTML = `
        <div class="row"><span>Model:</span> <code class="model"></code>
            <button class="pick">Choose .gguf…</button><button class="link open-models">Open models folder</button></div>
        <div class="row"><input type="text" class="url" placeholder="Or paste a Hugging Face link to a .gguf file">
            <button class="fetch">Download</button></div>
        <p class="muted">Without a model, KoboldCpp opens its own launcher so you can pick one there. The README suggests a Qwen3.6-35B-A3B GGUF.</p>
        <div class="progress tm" hidden><div class="bar"><i></i></div><span class="ptext"></span></div>
        <div class="row"><span>Extra arguments:</span><input type="text" class="args" placeholder="e.g. --contextsize 16384 --gpulayers 99"></div>`;
    $('.pick', box).onclick = () => act(desktop.chooseTextModel());
    $('.open-models', box).onclick = () => act(desktop.openPath('textModels'));
    $('.fetch', box).onclick = () => { const u = $('.url', box).value.trim(); if (u) act(desktop.downloadTextModel(u)); };
    $('.args', box).onchange = (e) => act(desktop.setOption({ koboldcpp: { extraArgs: e.target.value } }));
    $('.args', box).value = b.options.extraArgs || '';
}

function comfyExtra(el, b) {
    const box = $('.extra', el);
    box.innerHTML = `
        <p class="muted">Image generation uses Krea 2 Turbo: put the diffusion model, the Qwen3-VL text encoder and the Qwen VAE in ComfyUI's
            <code>models/diffusion_models</code>, <code>models/text_encoders</code> and <code>models/vae</code> folders, then pick them in EllipsisProse Settings.</p>
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
    $('.install', el).onclick = () => act(desktop.install(b.id, sel.value));
    $('.start', el).onclick = () => act(desktop.start(b.id));
    $('.stop', el).onclick = () => act(desktop.stop(b.id));
    $('.uninstall', el).onclick = () => { if (confirm(`Remove ${b.name} from this PC? Your models stay.`)) act(desktop.uninstall(b.id)); };
    $('.cancel', el).onclick = () => act(desktop.cancel(b.id));
    $('.autostart', el).onchange = (e) => act(desktop.setOption({ autostart: { [b.id]: e.target.checked } }));
    if (b.id === 'koboldcpp') koboldExtra(el, b);
    if (b.id === 'comfyui') comfyExtra(el, b);
    if (b.id === 'audiocpp') audioExtra(el, b);
    $('#backends').appendChild(el);
    return el;
}

function updateCard(el, b) {
    const live = b.status === 'running' || b.status === 'starting' || b.status === 'external' || b.status === 'unresponsive';
    const badge = $('.status', el);
    badge.textContent = statusLabel(b);
    badge.className = `badge status ${b.installed ? b.status : ''}`;
    if (b.installed && b.installed.variant && document.activeElement !== $('.variant', el)) $('.variant', el).value = b.installed.variant;
    $('.install', el).textContent = b.installed ? `Reinstall / update${b.installed.tag ? ` (have ${b.installed.tag})` : ''}` : 'Install';
    $('.install', el).classList.toggle('primary', !b.installed);
    $('.install', el).disabled = Boolean(b.job && !b.job.error);
    $('.start', el).hidden = !b.installed || live;
    $('.stop', el).hidden = !live || b.status === 'external';
    $('.uninstall', el).hidden = !b.installed;
    $('.autostart', el).checked = b.autostart;
    showProgress(el, b.job);
    $('.log', el).textContent = (b.log || []).join('\n');
    if (b.id === 'koboldcpp') {
        $('.model', el).textContent = b.options.modelPath || 'none chosen';
    }
}

function renderPacks(packs, s) {
    const box = $('#packs');
    box.innerHTML = '';
    for (const p of packs) {
        const row = document.createElement('div');
        row.className = 'pack';
        const job = p.job;
        row.innerHTML = '<div><strong class="pn"></strong> <span class="muted ps"></span><br><a href="#" class="pl">Model license</a> <span class="ptext muted"></span></div><div class="row"><button class="go"></button></div>';
        $('.pn', row).textContent = p.name;
        $('.ps', row).textContent = p.sizeHint;
        $('.pl', row).onclick = (e) => { e.preventDefault(); desktop.openExternal(p.licenseUrl); };
        $('.ptext', row).textContent = job ? ` · ${progressText(job)}` : '';
        const go = $('.go', row);
        if (p.present) { go.textContent = 'Downloaded'; go.disabled = true; }
        else if (job && !job.error) { go.textContent = 'Cancel'; go.onclick = () => act(desktop.cancel(`pack:${p.id}`)); }
        else { go.textContent = job && job.error ? 'Retry' : 'Download'; go.onclick = () => act(desktop.downloadPack(p.id)); }
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
    const tm = cards.get('koboldcpp') && $('.progress.tm', cards.get('koboldcpp'));
    if (tm) showProgress(tm.parentElement, s.textModelJob);
    renderPacks(s.packs, s);
    $('#done').textContent = s.setupDone ? 'Close' : 'Done';
}

async function refresh() {
    const r = await desktop.list();
    if (r.ok) render(r.value);
}

$('#change-dir').onclick = () => act(desktop.chooseBackendsDir());
$('#open-dir').onclick = () => act(desktop.openPath('backends'));
$('#done').onclick = () => desktop.finishSetup();
desktop.onState(render);
refresh();
setInterval(() => { if (state && state.backends.some((b) => b.status === 'starting' || b.status === 'unresponsive')) refresh(); }, 2000);
