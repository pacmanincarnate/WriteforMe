#!/usr/bin/env node
/**
 * One command that answers "did I break anything?".
 *
 *   npm run check            everything: types, lint, unit tests, both builds, browser suites
 *   npm run check:quick      types, lint and unit tests only (under a minute, no browser)
 *
 *   npm run check -- --only unit,golden    run just the named steps
 *   npm run check -- --skip upgrade        leave steps out
 *   npm run check -- --bail                stop at the first failure
 *   npm run check -- --verbose             stream every step's full output
 *   npm run check -- --list                show the steps and exit
 *   npm run check -- --only build,live     opt-in: real Anthropic API run (see docs/TESTING.md)
 *
 * Each step prints one line. The full output of every step is saved under scratch/check/
 * (gitignored), and a failing step prints the part of its output that matters.
 * Exit code is 0 only when nothing failed. See docs/TESTING.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT_DIR, 'scratch', 'check');
// The pre-refactor page used by the upgrade step loads its libraries from this CDN.
const UPGRADE_PROBE_URL = 'https://cdnjs.cloudflare.com/';
const FAILURE_LINES_SHOWN = 40;

const STEPS = [
    { id: 'typecheck', label: 'Types', command: 'npm run typecheck', quick: true, what: 'TypeScript, strict, whole project' },
    { id: 'lint', label: 'Lint', command: 'npm run lint -- --max-warnings=0', quick: true, what: 'ESLint incl. module boundary rules, zero warnings' },
    { id: 'unit', label: 'Unit tests', command: 'npm test', quick: true, what: 'Vitest: domain, pipeline, services, stores, hooks, views' },
    { id: 'build', label: 'Build', command: 'npm run build', what: 'Vite production build + offline precache check' },
    { id: 'build-singlefile', label: 'Build portable file', command: 'npm run build:singlefile', what: 'Single HTML file build' },
    { id: 'golden', label: 'Browser: app', command: 'npm run test:golden', needs: ['build'], what: 'Real Chrome against server.js + dist/' },
    { id: 'subpath', label: 'Browser: GitHub Pages', command: 'npm run test:subpath', needs: ['build'], what: 'Same checks served from /WriteforMe/ with no backend' },
    { id: 'singlefile', label: 'Browser: portable file', command: 'npm run test:singlefile', needs: ['build-singlefile'], what: 'Portable HTML over http and file://' },
    { id: 'pipeline', label: 'Browser: Autopilot', command: 'npm run test:pipeline', needs: ['build'], what: 'Full Autopilot run with a scripted LLM' },
    { id: 'upgrade', label: 'Browser: old data', command: 'npm run test:upgrade', needs: ['build'], online: true, what: 'Stories saved by the old app still open (needs internet)' },
    // Opt-in only: real model calls cost money. Runs only when named with --only live.
    { id: 'live', label: 'Browser: live model', command: 'npm run test:live', needs: ['build'], optIn: true, what: 'Opt-in: Autopilot against the real Anthropic API (needs ANTHROPIC_API_KEY, costs money)' }
];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);
const dim = (t) => paint('2', t);
const bold = (t) => paint('1', t);

const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function parseArgs(argv) {
    const opts = { quick: false, bail: false, verbose: false, list: false, only: null, skip: new Set() };
    const listValue = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const [flag, inline] = arg.split('=');
        const value = () => (inline !== undefined ? inline : argv[++i]);
        if (flag === '--quick') opts.quick = true;
        else if (flag === '--bail') opts.bail = true;
        else if (flag === '--verbose') opts.verbose = true;
        else if (flag === '--list') opts.list = true;
        else if (flag === '--only') opts.only = new Set(listValue(value()));
        else if (flag === '--skip') listValue(value()).forEach((id) => opts.skip.add(id));
        else if (flag === '--help' || flag === '-h') opts.list = true;
        else throw new Error(`Unknown option ${arg}. Try --list.`);
    }
    const known = new Set(STEPS.map((s) => s.id));
    for (const id of [...(opts.only || []), ...opts.skip]) {
        if (!known.has(id)) throw new Error(`Unknown step "${id}". Steps: ${[...known].join(', ')}`);
    }
    return opts;
}

function formatDuration(ms) {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

function run(command, { verbose }) {
    return new Promise((resolve) => {
        const child = spawn(command, { cwd: ROOT_DIR, shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
        let output = '';
        const collect = (chunk) => {
            output += chunk;
            if (verbose) process.stdout.write(chunk);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
        child.on('close', (code) => resolve({ code: code ?? 1, output: stripAnsi(output) }));
    });
}

/** One short phrase for the result line, e.g. "480 tests in 58 files". */
function summarize(step, output, passed) {
    if (step.id === 'unit') {
        const tests = output.match(/Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed/);
        const files = output.match(/Test Files\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed/);
        const failedOnly = output.match(/Tests\s+(\d+) failed/);
        if (tests) {
            const failed = Number(tests[1] || 0);
            const fileCount = files ? Number(files[1] || 0) + Number(files[2]) : null;
            const where = fileCount ? ` in ${fileCount} files` : '';
            return failed ? `${failed} failed, ${tests[2]} passed${where}` : `${tests[2]} tests${where}`;
        }
        if (failedOnly) return `${failedOnly[1]} failed`;
    }
    if (/^Skipped: no ANTHROPIC_API_KEY/m.test(output)) return 'not run: no ANTHROPIC_API_KEY';
    const browser = output.match(/Passed: (\d+) \| Failed: (\d+)/);
    if (browser) return Number(browser[2]) ? `${browser[2]} failed, ${browser[1]} passed` : `${browser[1]} checks`;
    if (step.id === 'typecheck' && !passed) {
        const errors = output.match(/error TS\d+/g);
        if (errors) return `${errors.length} type error${errors.length === 1 ? '' : 's'}`;
    }
    if (step.id === 'lint' && !passed) {
        const problems = output.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
        if (problems) return `${problems[2]} errors, ${problems[3]} warnings`;
    }
    return '';
}

/** The lines of a failing step worth reading first. Falls back to the end of the output. */
function failureExcerpt(step, output) {
    const lines = output.split(/\r?\n/);
    let picked = [];
    if (step.id === 'typecheck') picked = lines.filter((l) => /error TS\d+/.test(l));
    else if (step.id === 'unit') picked = lines.filter((l) => /^\s*(FAIL|×|✗|AssertionError|Error:|TypeError:|ReferenceError:)/.test(l) || /^\s*❯ .*\.test\./.test(l));
    else if (/^(golden|subpath|singlefile|pipeline|upgrade|live)$/.test(step.id)) picked = lines.filter((l) => /\[FAIL\]|Chrome not found|Error:/.test(l));
    if (!picked.length) picked = lines.filter((l) => l.trim()).slice(-FAILURE_LINES_SHOWN);
    const shown = picked.slice(0, FAILURE_LINES_SHOWN);
    if (picked.length > shown.length) shown.push(`... ${picked.length - shown.length} more line(s)`);
    return shown;
}

async function isOnline() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        await fetch(UPGRADE_PROBE_URL, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        return true;
    } catch {
        return false;
    }
}

function printStepList() {
    console.log('Steps, in the order they run:\n');
    for (const step of STEPS) {
        console.log(`  ${step.id.padEnd(17)} ${step.what}${step.quick ? dim('  [quick]') : ''}${step.optIn ? dim('  [only with --only]') : ''}`);
    }
    console.log('\nnpm run check            all steps');
    console.log('npm run check:quick      the [quick] steps');
    console.log('npm run check -- --only unit,golden | --skip upgrade | --bail | --verbose');
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.list) {
        printStepList();
        return 0;
    }

    const selected = STEPS.filter((step) => {
        if (opts.only) return opts.only.has(step.id);
        if (opts.skip.has(step.id) || step.optIn) return false;
        return opts.quick ? Boolean(step.quick) : true;
    });
    fs.mkdirSync(LOG_DIR, { recursive: true });

    const labelWidth = Math.max(...selected.map((s) => s.label.length)) + 2;
    const results = new Map();
    const startedAt = Date.now();
    let online = null;

    console.log(bold(`\nEllipsisProse check (${opts.quick ? 'quick' : opts.only ? 'selected steps' : 'full'})\n`));

    for (const step of selected) {
        const label = step.label.padEnd(labelWidth);
        const blockedBy = (step.needs || []).find((id) => results.get(id) === 'failed');
        if (blockedBy) {
            results.set(step.id, 'skipped');
            console.log(`${yellow('-')} ${label}${dim(`skipped, "${blockedBy}" failed`)}`);
            continue;
        }
        if (opts.bail && [...results.values()].includes('failed')) {
            results.set(step.id, 'skipped');
            console.log(`${yellow('-')} ${label}${dim('skipped (--bail)')}`);
            continue;
        }
        if (step.online && !opts.only) {
            if (online === null) online = await isOnline();
            if (!online) {
                results.set(step.id, 'skipped');
                console.log(`${yellow('-')} ${label}${dim('skipped, no internet (CI runs it)')}`);
                continue;
            }
        }

        if (process.stdout.isTTY && !opts.verbose) process.stdout.write(dim(`… ${label}running`));
        const stepStart = Date.now();
        const { code, output } = await run(step.command, opts);
        const duration = formatDuration(Date.now() - stepStart);
        const logFile = path.join(LOG_DIR, `${step.id}.log`);
        fs.writeFileSync(logFile, output);
        if (process.stdout.isTTY && !opts.verbose) process.stdout.write('\r\x1b[2K');

        const passed = code === 0;
        results.set(step.id, passed ? 'passed' : 'failed');
        const detail = summarize(step, output, passed);
        const mark = passed ? green('✓') : red('✗');
        console.log(`${mark} ${label}${detail.padEnd(30)} ${dim(duration)}`);
        if (!passed) {
            for (const line of failureExcerpt(step, output)) console.log(`    ${red('│')} ${line}`);
            console.log(`    ${dim(`full output: ${path.relative(ROOT_DIR, logFile)}`)}`);
        }
    }

    const count = (state) => [...results.values()].filter((v) => v === state).length;
    const failed = count('failed');
    const skipped = count('skipped');
    const total = formatDuration(Date.now() - startedAt);
    const skippedNote = skipped ? `, ${skipped} skipped` : '';
    console.log('');
    if (failed) {
        const names = selected.filter((s) => results.get(s.id) === 'failed').map((s) => s.id);
        console.log(red(bold(`FAILED: ${failed} of ${selected.length} steps (${names.join(', ')})${skippedNote}. ${total}`)));
        console.log(dim(`Re-run just those: npm run check -- --only ${names.join(',')}`));
        return 1;
    }
    console.log(green(bold(`ALL GOOD: ${count('passed')} steps passed${skippedNote}. ${total}`)));
    if (opts.quick) console.log(dim('Quick mode skips the builds and browser suites. Run "npm run check" before merging.'));
    return 0;
}

main().then(
    (code) => process.exit(code),
    (error) => {
        console.error(red(error.message));
        process.exit(2);
    }
);
