// SPDX-License-Identifier: GPL-3.0-or-later
// The Roj popup: the toolbar popup of the browser extension and the main page
// of the web app. It draws the popup of extension/ui/calendarView.js with the
// same parts, settings and behaviour.

import {CALENDARS, RojEngine, SECONDARY_CALENDARS, pinClock} from '../lib/engine.js';
import {N_, localizedText, translator} from '../lib/i18n.js';
import {AUTHOR, AUTHOR_URL, DOCS_URL, REPO_URL, SITE_URL, VERSION} from '../lib/constants.js';
import {engineOptions, loadSettings, uiLanguage} from './settings.js';
import {loadEvents} from './sources.js';
import {applyLook} from './look.js';
import {isExtension, onStoreChanged, openPage, pingBackground} from './store.js';
import {esc, icon, setupInstall} from './ui.js';

const CALENDAR_NAMES = {kurdish: N_('Kurdish'), gregorian: N_('Gregorian'), persian: N_('Persian'), islamic: N_('Islamic')};
const EVENT_ROWS = 3;
const TITLE_LENGTH = 46;

// Screenshots pin the clock with ?now=YYYY-MM-DDTHH:MM.
const pinned = new URLSearchParams(location.search).get('now');
if (pinned)
    pinClock(pinned);

const popup = document.getElementById('popup');
let settings;
let engine;
let _;
let index = null;
let today;
let selected;
let viewYear;
let viewMonth;

const truncate = (text, max) => {
    const chars = [...text];
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
};

function build() {
    popup.innerHTML = `
      <div class="roj-header">
        <div class="roj-header-title"></div>
        <div class="roj-header-lines">
          ${SECONDARY_CALENDARS.map(cal => `<div class="roj-header-line" data-cal="${cal}"><span class="roj-chip roj-chip-${cal}"></span><span class="roj-header-line-text"></span></div>`).join('')}
        </div>
      </div>
      <div class="roj-nav">
        <button type="button" class="roj-icon-button roj-nav-year" data-shift="-12"></button>
        <button type="button" class="roj-icon-button" data-shift="-1"></button>
        <div class="roj-nav-title">
          <button type="button" class="roj-month-title"></button>
          <div class="roj-month-spans">${SECONDARY_CALENDARS.map(cal => `<span class="roj-span roj-span-${cal}" data-cal="${cal}"></span>`).join('')}</div>
        </div>
        <button type="button" class="roj-icon-button" data-shift="1"></button>
        <button type="button" class="roj-icon-button roj-nav-year" data-shift="12"></button>
      </div>
      <div class="roj-weekdays">${'<span class="roj-weekday"></span>'.repeat(7)}</div>
      <div class="roj-grid" role="grid">${'<button type="button" class="roj-day" tabindex="-1"></button>'.repeat(42)}</div>
      <div class="roj-legend">${CALENDARS.map(cal => `<span class="roj-legend-item" data-cal="${cal}"><span class="roj-legend-dot roj-legend-${cal}"></span><span class="roj-legend-label"></span></span>`).join('')}</div>
      <div class="roj-events"><div class="roj-events-title"></div><div class="roj-events-list"></div></div>
      <div class="roj-actions">
        <button type="button" class="roj-action" data-action="today">${icon('today')}<span></span></button>
        <button type="button" class="roj-action" data-action="convert">${icon('convert')}<span></span></button>
        <button type="button" class="roj-action" data-action="copy">${icon('copy')}<span></span></button>
        <button type="button" class="roj-action" data-action="settings">${icon('settings')}<span></span></button>
      </div>
      <div class="roj-footer" dir="ltr">
        <span>Made with</span><span class="roj-heart">♥</span><span>by</span>
        <a href="${AUTHOR_URL}" target="_blank" rel="noopener">${AUTHOR}</a><span>·</span>
        <a href="${REPO_URL}" target="_blank" rel="noopener">Source</a><span>·</span>
        <a href="${DOCS_URL}" target="_blank" rel="noopener">Docs</a><span>·</span>
        <a href="${SITE_URL}" target="_blank" rel="noopener">Site</a><span>·</span>
        <a href="${REPO_URL}/releases" target="_blank" rel="noopener">v${VERSION}</a>
      </div>`;

    popup.querySelectorAll('[data-shift]').forEach(b => b.addEventListener('click', () => shift(+b.dataset.shift)));
    popup.querySelector('.roj-month-title').addEventListener('click', showToday);
    popup.querySelectorAll('.roj-day').forEach(b => b.addEventListener('click', () => select(+b.dataset.jdn)));
    const grid = popup.querySelector('.roj-grid');
    grid.addEventListener('keydown', onGridKey);
    grid.addEventListener('wheel', onWheel, {passive: false});
    popup.querySelector('[data-action="today"]').addEventListener('click', showToday);
    popup.querySelector('[data-action="convert"]').addEventListener('click', () => openPage('options.html#converter'));
    popup.querySelector('[data-action="copy"]').addEventListener('click', copySelected);
    popup.querySelector('[data-action="settings"]').addEventListener('click', () => openPage('options.html#general'));
}

async function load() {
    settings = await loadSettings();
    engine = new RojEngine(engineOptions(settings));
    _ = translator(uiLanguage(settings));
    await applyLook(settings);
    today = engine.todayJdn();
    selected ??= today;
    [viewYear, viewMonth] = engine.dateIn('kurdish', selected);
    index = (await loadEvents(engine, settings)).index;
    refresh();
}

function refresh() {
    const rtl = engine.isRtl;
    popup.dir = rtl ? 'rtl' : 'ltr';
    popup.lang = settings.locale;
    popup.dataset.layout = settings['card-layout'];
    document.documentElement.lang = uiLanguage(settings);
    document.title = `Roj · ${engine.format(today, 'kurdish', settings['header-format-kurdish'])}`;
    const navIcons = rtl ? ['last', 'next', 'prev', 'first'] : ['first', 'prev', 'next', 'last'];
    const navLabels = [N_('Previous year'), N_('Previous month'), N_('Next month'), N_('Next year')];
    popup.querySelectorAll('.roj-nav [data-shift]').forEach((b, i) => {
        b.innerHTML = icon(navIcons[i]);
        b.setAttribute('aria-label', _(navLabels[i]));
        b.title = _(navLabels[i]);
    });
    const actions = {today: N_('Today'), convert: N_('Convert'), copy: N_('Copy'), settings: N_('Settings')};
    for (const [key, label] of Object.entries(actions)) {
        const button = popup.querySelector(`[data-action="${key}"]`);
        button.querySelector('span').textContent = _(label);
        button.setAttribute('aria-label', _(label));
    }
    const weekend = new Set(settings['weekend-days']);
    popup.querySelectorAll('.roj-weekday').forEach((el, i) => {
        const {jsDay, name} = engine.weekdayNames('%a')[i];
        el.textContent = name;
        el.classList.toggle('roj-weekday-weekend', weekend.has(jsDay));
    });
    popup.querySelector('.roj-footer').hidden = !settings['show-footer'];
    renderMonth();
    renderSelection();
}

const subsShown = () => SECONDARY_CALENDARS.filter(cal => settings[`card-show-${cal}`]);

function eventsOn(jdn) {
    return settings['events-enabled'] && index ? index.eventsOn(jdn) : [];
}

function renderMonth() {
    const grid = engine.monthGrid(viewYear, viewMonth);
    const subs = subsShown();
    const weekend = new Set(settings['weekend-days']);
    const dots = settings['show-event-dots'];
    const holidays = settings['highlight-holidays'];
    popup.querySelector('.roj-month-title').textContent = engine.format(grid.first, 'kurdish', '%B %Y');
    const last = grid.first + grid.length - 1;
    popup.querySelectorAll('.roj-span').forEach(el => {
        const cal = el.dataset.cal;
        el.hidden = !subs.includes(cal);
        if (!el.hidden)
            el.textContent = monthSpan(cal, grid.first, last);
    });

    const cards = popup.querySelectorAll('.roj-day');
    grid.weeks.flat().forEach((cell, i) => {
        const card = cards[i];
        const events = eventsOn(cell.jdn);
        const isToday = cell.jdn === today;
        card.dataset.jdn = cell.jdn;
        card.className = 'roj-day';
        card.classList.toggle('roj-day-outside', !cell.inMonth);
        card.classList.toggle('roj-day-today', isToday);
        card.classList.toggle('roj-day-selected', cell.jdn === selected && !isToday);
        card.classList.toggle('roj-day-weekend', weekend.has(cell.weekday));
        card.classList.toggle('roj-day-holiday', holidays && events.some(e => e.holiday));
        card.classList.toggle('roj-day-has-sub', subs.length > 0);
        card.tabIndex = cell.jdn === selected ? 0 : -1;
        card.setAttribute('aria-selected', String(cell.jdn === selected));
        card.setAttribute('aria-label', engine.format(cell.jdn, 'kurdish', '%A %d %B %Y') +
            (events.length ? `, ${events.map(e => localizedText(e.title, settings.locale)).join(', ')}` : ''));
        const subsHtml = subs.map(cal => `<span class="roj-sub roj-sub-${cal}">${engine.number(cell.dates[cal][2], cal)}</span>`).join('');
        const dotColor = events.find(e => e.color)?.color;
        card.innerHTML = `${dots && events.length ? `<span class="roj-day-dot"${dotColor && !isToday ? ` style="background:${esc(dotColor)}"` : ''}></span>` : ''}` +
            `<span class="roj-day-number">${engine.number(cell.dates.kurdish[2], 'kurdish')}</span>` +
            (subs.length ? `<span class="roj-day-secondary">${subsHtml}</span>` : '');
    });

    const legend = popup.querySelector('.roj-legend');
    legend.hidden = subs.length === 0;
    legend.querySelectorAll('.roj-legend-item').forEach(item => {
        const cal = item.dataset.cal;
        item.hidden = cal !== 'kurdish' && !subs.includes(cal);
        item.querySelector('.roj-legend-label').textContent = _(CALENDAR_NAMES[cal]);
    });
}

function monthSpan(cal, first, last) {
    const [y1, m1] = engine.dateIn(cal, first);
    const [y2, m2] = engine.dateIn(cal, last);
    if (y1 === y2 && m1 === m2)
        return engine.format(first, cal, '%B %Y');
    if (y1 === y2)
        return `${engine.format(first, cal, '%B')} · ${engine.format(last, cal, '%B %Y')}`;
    return `${engine.format(first, cal, '%B %Y')} · ${engine.format(last, cal, '%B %Y')}`;
}

function formatted(jdn, cal, key) {
    const r = engine.tryFormat(jdn, cal, settings[key]);
    return r.ok ? r.text : '⚠';
}

function renderSelection() {
    popup.querySelector('.roj-header-title').textContent = formatted(selected, 'kurdish', 'header-format-kurdish');
    popup.querySelectorAll('.roj-header-line').forEach(row => {
        const cal = row.dataset.cal;
        row.hidden = !settings[`header-show-${cal}`];
        row.querySelector('.roj-chip').textContent = _(CALENDAR_NAMES[cal]);
        // Month names in Arabic script reorder the digits around them in a
        // left-to-right line, so each date is isolated in its own direction.
        row.querySelector('.roj-header-line-text').innerHTML = `<bdi>${esc(formatted(selected, cal, `header-format-${cal}`))}</bdi>`;
    });

    const box = popup.querySelector('.roj-events');
    box.hidden = !settings['events-enabled'];
    if (box.hidden)
        return;
    const events = eventsOn(selected);
    popup.querySelector('.roj-events-title').textContent = _('Events');
    const list = popup.querySelector('.roj-events-list');
    if (!events.length) {
        list.innerHTML = `<div class="roj-event-empty">${esc(_('No events on this day'))}</div>`;
        return;
    }
    const shown = events.length > EVENT_ROWS ? EVENT_ROWS - 1 : events.length;
    list.innerHTML = events.slice(0, shown).map(ev => {
        const title = truncate(localizedText(ev.title, settings.locale), TITLE_LENGTH);
        const description = localizedText(ev.description, settings.locale);
        const row = `
            <span class="roj-event-dot"${ev.color ? ` style="background:${esc(ev.color)}"` : ''}></span>
            <span class="roj-event-title">${esc(ev.time ? `${ev.time} · ${title}` : title)}</span>
            ${ev.holiday ? `<span class="roj-event-badge">${esc(_('Holiday'))}</span>` : ''}`;
        return description
            ? `<details class="roj-event-details"><summary class="roj-event">${row}</summary><p class="roj-event-description">${esc(description)}</p></details>`
            : `<div class="roj-event">${row}</div>`;
    }).join('') + (events.length > shown
        ? `<div class="roj-event-more">${esc(_('+{count} more', {count: engine.number(events.length - shown)}))}</div>`
        : '');
}

function select(jdn, focus = false) {
    selected = jdn;
    [viewYear, viewMonth] = engine.dateIn('kurdish', jdn);
    renderMonth();
    renderSelection();
    if (focus)
        popup.querySelector(`.roj-day[data-jdn="${jdn}"]`)?.focus();
}

function showToday() {
    today = engine.todayJdn();
    select(today);
}

function shift(months) {
    [viewYear, viewMonth] = RojEngine.shiftMonth(viewYear, viewMonth, months);
    renderMonth();
}

let wheelDelta = 0;
function onWheel(event) {
    event.preventDefault();
    wheelDelta += event.deltaY;
    if (Math.abs(wheelDelta) < 40)
        return;
    shift(wheelDelta > 0 ? 1 : -1);
    wheelDelta = 0;
}

function onGridKey(event) {
    const rtl = popup.dir === 'rtl';
    const steps = {ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7};
    let target = null;
    if (event.key in steps) {
        target = selected + steps[event.key];
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        const [y, m, d] = engine.dateIn('kurdish', selected);
        const [ny, nm] = RojEngine.shiftMonth(y, m, event.key === 'PageUp' ? -1 : 1);
        target = engine.toJdn('kurdish', ny, nm, Math.min(d, engine.monthLength('kurdish', ny, nm)));
    } else if (event.key === 'Home') {
        target = engine.todayJdn();
    }
    if (target === null)
        return;
    event.preventDefault();
    select(target, true);
}

async function copySelected() {
    const r = engine.tryFormat(selected, 'kurdish', settings['copy-format']);
    if (!r.ok)
        return;
    const label = popup.querySelector('[data-action="copy"] span');
    try {
        await navigator.clipboard.writeText(r.text);
        label.textContent = _('Copied');
        setTimeout(() => {
            label.textContent = _('Copy');
        }, 1500);
    } catch {
        // clipboard blocked: nothing to do
    }
}

// The day changes at midnight while the web app stays open.
function scheduleMidnight() {
    const now = RojEngine.clock();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    setTimeout(() => {
        const was = today;
        today = engine.todayJdn();
        if (selected === was)
            selected = today;
        [viewYear, viewMonth] = engine.dateIn('kurdish', selected);
        refresh();
        scheduleMidnight();
    }, Math.max(next - now, 1000));
}

build();
await load();
popup.querySelector('.roj-day[tabindex="0"]')?.focus({preventScroll: true});
scheduleMidnight();
onStoreChanged(() => load().catch(console.error));
if (isExtension)
    pingBackground({type: 'refresh'});
else
    setupInstall(_);
