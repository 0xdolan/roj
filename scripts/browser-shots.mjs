#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Screenshots and store images of the browser extension, in docs/images/browser/:
//
//   store-1-popup.png ... store-5-languages.png   1280x800, Chrome Web Store and addons.mozilla.org
//   promo-small.png 440x280, promo-marquee.png 1400x560   Chrome Web Store promo tiles
//
// Needs the build (make browser) and Chrome or Chromium (CHROME=/path to choose).
// Pages are captured from build/browser/chrome over a local server, with a
// throwaway browser profile, then laid out by scripts/marketing/browser.html.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'build/browser-shots');
const OUT = join(ROOT, 'docs/images/browser');
const NOW = '2026-12-17 10:30'; // the day every Roj screenshot shows
const PORT = 8790 + Math.floor(Math.random() * 100);
const DEBUG = 9400 + Math.floor(Math.random() * 100);

if (!existsSync(join(ROOT, 'build/browser/chrome/popup.html'))) {
    console.error('build/browser/chrome is missing: run "make browser" first');
    process.exit(1);
}

function findChrome() {
    if (process.env.CHROME)
        return process.env.CHROME;
    for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
        try {
            return execFileSync('which', [name]).toString().trim();
        } catch {}
    }
    console.error('Chrome or Chromium not found: set CHROME=/path/to/chrome');
    process.exit(1);
}

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf'};
const server = createServer((req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path)) {
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, {'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store'});
    res.end(readFileSync(path));
}).listen(PORT, '127.0.0.1');

const profile = mkdtempSync(join(tmpdir(), 'roj-shots-'));
const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function finish(code) {
    const exited = new Promise(r => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
    server.close();
    rmSync(profile, {recursive: true, force: true, maxRetries: 5});
    process.exit(code);
}

async function openTab() {
    for (let i = 0; i < 60; i++) {
        try {
            const t = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?about:blank`, {method: 'PUT'})).json();
            const ws = new WebSocket(t.webSocketDebuggerUrl);
            let n = 0;
            const pending = new Map();
            const errors = [];
            ws.onmessage = m => {
                const d = JSON.parse(m.data);
                if (d.id && pending.has(d.id)) {
                    pending.get(d.id)(d);
                    pending.delete(d.id);
                } else if (d.method === 'Runtime.exceptionThrown') {
                    errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
                }
            };
            await new Promise(r => (ws.onopen = r));
            const send = (method, params = {}) => new Promise((resolve, reject) => {
                const id = ++n;
                pending.set(id, d => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
                ws.send(JSON.stringify({id, method, params}));
            });
            await send('Runtime.enable');
            await send('Page.enable');
            return {send, errors};
        } catch {
            await sleep(250);
        }
    }
    throw new Error('Chrome did not start');
}

const tab = await openTab();
const evaluate = async expr => (await tab.send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true})).result.value;

async function load(url, width, height, scale = 2) {
    await tab.send('Page.navigate', {url});
    // Until the new page has loaded: the old one also reports "complete".
    const ready = `location.href === ${JSON.stringify(new URL(url).href)} && document.readyState === 'complete'`;
    for (let i = 0; i < 100 && !await evaluate(ready).catch(() => false); i++)
        await sleep(100);
    // The size is set once the page has loaded, for that page.
    await tab.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
    await evaluate('document.fonts.ready.then(() => 1)');
    await sleep(700);
}

async function shoot(file, clip) {
    const params = {format: 'png'};
    if (clip)
        params.clip = {...clip, scale: 1};
    const {data} = await tab.send('Page.captureScreenshot', params);
    writeFileSync(file, Buffer.from(data, 'base64'));
}

/** Capture an extension page with these settings (the page reads them from localStorage outside the extension). */
async function page(name, path, settings, width, height) {
    const base = `http://127.0.0.1:${PORT}/build/browser/chrome/`;
    await load(`${base}roj.css`, width, height);
    await evaluate(`localStorage.setItem('roj-app-settings', ${JSON.stringify(JSON.stringify(settings))}); 1`);
    const [file, hash = ''] = path.split('#');
    await load(`${base}${file}?now=${encodeURIComponent(NOW)}${hash ? `#${hash}` : ''}`, width, height);
    await shoot(join(RAW, `${name}.png`));
}

try {
    rmSync(RAW, {recursive: true, force: true});
    mkdirSync(RAW, {recursive: true});
    mkdirSync(OUT, {recursive: true});
    const shots = [
        ['popup-ckb', 'popup.html', {locale: 'ckb'}],
        ['popup-kmr', 'popup.html', {locale: 'kmr'}],
        ['popup-en', 'popup.html', {locale: 'en'}],
        ['popup-ar-dark', 'popup.html', {locale: 'ar', theme: 'dark'}],
        ['popup-kmr-dark', 'popup.html', {locale: 'kmr', theme: 'dark'}],
        ['options-converter', 'options.html#converter', {locale: 'en'}, 1000, 700],
        ['options-appearance', 'options.html#appearance', {locale: 'en'}, 1000, 700],
        ['options-events', 'options.html#events', {locale: 'en'}, 1000, 700],
        ['options-formats-dark', 'options.html#formats', {locale: 'en', theme: 'dark'}, 1000, 700],
    ];
    for (const [name, path, settings, width = 380, height = 600] of shots) {
        await page(name, path, settings, width, height);
        if (tab.errors.length) {
            console.error(`${name}: ${tab.errors.join('\n')}`);
            await finish(1);
        }
    }
    const layouts = [
        ['store-1-popup', 1280, 800], ['store-2-events', 1280, 800], ['store-3-converter', 1280, 800],
        ['store-4-themes', 1280, 800], ['store-5-languages', 1280, 800],
        ['promo-small', 440, 280], ['promo-marquee', 1400, 560],
    ];
    for (const [name, width, height] of layouts) {
        await load(`http://127.0.0.1:${PORT}/scripts/marketing/browser.html?${name}`, width, height, 1);
        await shoot(join(OUT, `${name}.png`), {x: 0, y: 0, width, height});
        console.log(`wrote docs/images/browser/${name}.png`);
    }
    await finish(0);
} catch (e) {
    console.error(e.message);
    await finish(1);
}
