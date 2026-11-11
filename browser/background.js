// SPDX-License-Identifier: GPL-3.0-or-later
// The toolbar button, as the GNOME top-bar indicator (extension/ui/indicator.js):
// today's Kurdish day on the icon (or the Roj logo), the panel pattern and
// today's events in the tooltip, and a dot or a count when today has events.
// Alarms redraw it at midnight, every minute when the pattern shows the time,
// and refresh online calendars every `ics-refresh-hours`.

import {RojEngine, TOKENS} from './lib/engine.js';
import {localizedText} from './lib/i18n.js';
import {engineOptions, loadSettings} from './app/settings.js';
import {loadEvents} from './app/sources.js';

const api = globalThis.browser ?? globalThis.chrome;
const action = api.action ?? api.browserAction;
const SUN = '#F5CD0E';
const INK = '#241F31';
const HOLIDAY = '#E01B24';
const EVENT = '#3584E4';
const TIME_TOKENS = TOKENS.filter(t => t.kind === 'time').map(t => t.token);
const LOGO = {16: 'icons/roj-16.png', 32: 'icons/roj-32.png', 48: 'icons/roj-48.png', 128: 'icons/roj-128.png'};

let fontReady = null;

/** The included Vazirmatn draws both Western and Arabic-Indic digits. */
function loadIconFont() {
    fontReady ??= (async () => {
        try {
            const face = new FontFace('Roj Icon', `url(${api.runtime.getURL('fonts/Vazirmatn.ttf')})`, {weight: '100 900'});
            await face.load();
            (globalThis.fonts ?? globalThis.document?.fonts)?.add(face);
            return '"Roj Icon"';
        } catch {
            return 'sans-serif';
        }
    })();
    return fontReady;
}

function drawIcon(size, text, family, dot) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const r = size * 0.22;
    ctx.fillStyle = SUN;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = size * (text.length > 1 ? 0.78 : 0.9);
    ctx.font = `800 ${px}px ${family}`;
    const width = ctx.measureText(text).width;
    if (width > size * 0.92) {
        px *= size * 0.92 / width;
        ctx.font = `800 ${px}px ${family}`;
    }
    ctx.fillText(text, size / 2, size / 2 + size * 0.04);
    if (dot) {
        const d = size * 0.2;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(size - d, d, d + Math.max(1, size / 16), 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(size - d, d, d, 0, 2 * Math.PI);
        ctx.fill();
    }
    return ctx.getImageData(0, 0, size, size);
}

async function drawLogoWithDot(dot) {
    // The logo is a PNG; draw it, then the dot, at two sizes.
    const out = {};
    for (const size of [16, 32]) {
        const blob = await (await fetch(api.runtime.getURL(LOGO[size]))).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, size, size);
        const d = size * 0.2;
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(size - d, d, d, 0, 2 * Math.PI);
        ctx.fill();
        out[size] = ctx.getImageData(0, 0, size, size);
    }
    return out;
}

async function setIcon(settings, engine, today, dot) {
    try {
        if (settings['panel-show-text']) {
            const family = await loadIconFont();
            const text = engine.format(today, 'kurdish', '%-d');
            await action.setIcon({imageData: {16: drawIcon(16, text, family, dot), 32: drawIcon(32, text, family, dot)}});
        } else if (dot) {
            await action.setIcon({imageData: await drawLogoWithDot(dot)});
        } else {
            await action.setIcon({path: LOGO});
        }
    } catch {
        // No OffscreenCanvas (older Safari): keep the logo.
        await action.setIcon({path: LOGO}).catch(() => {});
    }
}

function nextMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime();
}

async function scheduleAlarms(settings) {
    api.alarms.create('midnight', {when: nextMidnight()});
    const pattern = settings['panel-format'];
    if (TIME_TOKENS.some(t => pattern.includes(t)))
        api.alarms.create('minute', {when: Date.now() + (60 - new Date().getSeconds()) * 1000, periodInMinutes: 1});
    else
        await api.alarms.clear('minute');
    const hours = settings['ics-refresh-hours'];
    const feeds = await api.alarms.get('feeds');
    if (!feeds || feeds.periodInMinutes !== hours * 60)
        api.alarms.create('feeds', {delayInMinutes: hours * 60, periodInMinutes: hours * 60});
}

let running = null;
let again = false;

/** Redraw the button. Calls that arrive while drawing are merged into one more pass. */
function update(force = false) {
    if (running) {
        again = true;
        return running;
    }
    running = (async () => {
        try {
            do {
                again = false;
                await draw(force);
            } while (again);
        } finally {
            running = null;
        }
    })();
    return running;
}

async function draw(force) {
    const settings = await loadSettings();
    const engine = new RojEngine(engineOptions(settings));
    const now = RojEngine.clock();
    const today = engine.todayJdn(now);
    const time = {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()};
    let events = [];
    if (settings['events-enabled']) {
        try {
            const {index} = await loadEvents(engine, settings, {force});
            events = index.eventsOn(today);
        } catch {
            events = [];
        }
    }
    const holiday = events.some(e => e.holiday);
    let mode = settings['panel-event-indicator'];
    if (mode === 'title')
        mode = 'dot';
    const color = holiday ? HOLIDAY : EVENT;
    const dot = events.length && mode === 'dot' ? color : null;

    await setIcon(settings, engine, today, dot);

    const count = events.length && mode === 'count' ? engine.number(events.length) : '';
    await action.setBadgeText({text: count});
    if (count)
        await action.setBadgeBackgroundColor({color});
    action.setBadgeTextColor?.({color: '#FFFFFF'})?.catch?.(() => {});

    const formatted = engine.tryFormat(today, 'kurdish', settings['panel-format'], time);
    const lines = [formatted.ok ? formatted.text : engine.format(today, 'kurdish', '%d %B %Y')];
    for (const ev of events.slice(0, 5))
        lines.push(`${ev.holiday ? '● ' : '· '}${localizedText(ev.title, engine.locale)}`);
    if (events.length > 5)
        lines.push(`+${engine.number(events.length - 5)}`);
    await action.setTitle({title: lines.join('\n')});

    await scheduleAlarms(settings);
}

api.alarms.onAlarm.addListener(alarm => {
    update(alarm.name === 'feeds');
});
api.runtime.onMessage.addListener(message => {
    if (message?.type === 'refresh')
        update();
});
api.storage.onChanged.addListener((changes, area) => {
    // Feed copies are written by the popup and the options page too; the
    // settings key is what changes what the button shows.
    if (area === 'sync' || Object.keys(changes).some(k => k.startsWith('file:')))
        update();
});
api.runtime.onStartup?.addListener(() => update());
api.runtime.onInstalled.addListener(() => update());
api.permissions?.onAdded?.addListener(() => update(true));
update();
