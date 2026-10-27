// SPDX-License-Identifier: GPL-3.0-or-later
// The live calendar on the Roj website. It runs the extension's own engine,
// events and translations (copied into ./engine by `make web`) and draws the
// popup of extension/ui/calendarView.js with the same structure and classes.

import {CALENDARS, RojEngine, SECONDARY_CALENDARS} from './engine/lib/engine.js';
import {EventIndex, parseEventsJson} from './engine/lib/events.js';
import {N_, localizedText, translator} from './engine/lib/i18n.js';
import {AUTHOR, AUTHOR_URL, DOCS_URL, REPO_URL, SITE_URL, VERSION} from './engine/lib/constants.js';

const ICS_BASE = 'https://0xdolan.github.io/roj/calendar/kurdish-events';
const CALENDAR_NAMES = {kurdish: N_('Kurdish'), gregorian: N_('Gregorian'), persian: N_('Persian'), islamic: N_('Islamic')};
const HEADER_FORMATS = {kurdish: '%A %d %B %Y', gregorian: '%A %d %B %Y', persian: '%d %B %Y', islamic: '%d %B %Y'};
const WEEKEND = new Set([5]);
const LOCALES = ['ckb', 'kmr', 'en', 'fa', 'ar'];
const STORE_KEY = 'roj-calendar';

const ICONS = {
    first: '<path d="M11 4 7 8l4 4M7 4 3 8l4 4"/>',
    prev: '<path d="M10 3 5 8l5 5"/>',
    next: '<path d="m6 3 5 5-5 5"/>',
    last: '<path d="m5 4 4 4-4 4M9 4l4 4-4 4"/>',
    today: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    convert: '<path d="M3 6h9l-2.5-2.5M13 10H4l2.5 2.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
};
const icon = name => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

// State: settings persist per browser; the day and language also live in the
// address so a link opens the same view.
const defaults = {locale: 'ckb', secondaryLanguage: 'same', layout: 'row', era: 'solar',
    subs: {gregorian: true, persian: false, islamic: false}};
let prefs = structuredClone(defaults);
try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved)
        prefs = {...prefs, ...saved, subs: {...prefs.subs, ...saved.subs}};
} catch {
    // storage unavailable: keep the defaults
}
const params = new URLSearchParams(location.search);
if (LOCALES.includes(params.get('lang')))
    prefs.locale = params.get('lang');

let engine = makeEngine();
let t = translator(prefs.locale);
const index = new EventIndex(engine);
let allEvents = [];
let today = engine.todayJdn();
let selected = parseDateParam(params.get('date')) ?? today;
let [viewYear, viewMonth] = engine.dateIn('kurdish', selected);

function makeEngine() {
    return new RojEngine({locale: prefs.locale, uiLanguage: prefs.locale, secondaryLanguage: prefs.secondaryLanguage, era: prefs.era});
}

function parseDateParam(value) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value ?? '');
    if (!m)
        return null;
    try {
        return engine.toJdn('gregorian', +m[1], +m[2], +m[3]);
    } catch {
        return null;
    }
}

const iso = ([y, m, d]) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const dirOf = locale => (['ckb', 'fa', 'ar'].includes(locale) ? 'rtl' : 'ltr');

function save() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch {
        // storage unavailable: settings last for this visit only
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', prefs.locale);
    if (selected === today)
        url.searchParams.delete('date');
    else
        url.searchParams.set('date', iso(engine.dateIn('gregorian', selected)));
    history.replaceState(null, '', url);
}

// The popup
const popup = document.getElementById('popup');

function buildPopup() {
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
        <a href="${AUTHOR_URL}">${AUTHOR}</a><span>·</span><a href="${REPO_URL}">Source</a><span>·</span>
        <a href="${DOCS_URL}">Docs</a><span>·</span><a href="${SITE_URL}">Site</a><span>·</span>
        <a href="${REPO_URL}/releases">v${VERSION}</a>
      </div>`;

    popup.querySelectorAll('[data-shift]').forEach(b => b.addEventListener('click', () => shift(+b.dataset.shift)));
    popup.querySelector('.roj-month-title').addEventListener('click', showToday);
    popup.querySelectorAll('.roj-day').forEach(b => b.addEventListener('click', () => select(+b.dataset.jdn)));
    popup.querySelector('.roj-grid').addEventListener('keydown', onGridKey);
    popup.querySelector('[data-action="today"]').addEventListener('click', showToday);
    popup.querySelector('[data-action="convert"]').addEventListener('click', () => {
        setConverter('gregorian', engine.dateIn('gregorian', selected));
        document.getElementById('convert').scrollIntoView({behavior: 'smooth'});
    });
    popup.querySelector('[data-action="copy"]').addEventListener('click', copySelected);
    popup.querySelector('[data-action="settings"]').addEventListener('click', () => {
        const options = document.getElementById('options');
        options.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        options.classList.remove('flash');
        void options.offsetWidth;
        options.classList.add('flash');
    });
}

function refresh() {
    popup.dir = dirOf(prefs.locale);
    popup.lang = prefs.locale;
    popup.dataset.layout = prefs.layout;
    const rtl = popup.dir === 'rtl';
    const navIcons = rtl ? ['last', 'next', 'prev', 'first'] : ['first', 'prev', 'next', 'last'];
    const navLabels = [N_('Previous year'), N_('Previous month'), N_('Next month'), N_('Next year')];
    popup.querySelectorAll('.roj-nav [data-shift]').forEach((b, i) => {
        b.innerHTML = icon(navIcons[i]);
        b.setAttribute('aria-label', t(navLabels[i]));
    });
    const actions = {today: N_('Today'), convert: N_('Convert'), copy: N_('Copy'), settings: N_('Settings')};
    for (const [key, label] of Object.entries(actions)) {
        const button = popup.querySelector(`[data-action="${key}"]`);
        button.querySelector('span').textContent = t(label);
        button.setAttribute('aria-label', t(label));
    }
    popup.querySelectorAll('.roj-weekday').forEach((el, i) => {
        const {jsDay, name} = engine.weekdayNames('%a')[i];
        el.textContent = name;
        el.classList.toggle('roj-weekday-weekend', WEEKEND.has(jsDay));
    });
    renderMonth();
    renderSelection();
    syncOptions();
}

function secondaries() {
    return SECONDARY_CALENDARS.filter(cal => prefs.subs[cal]);
}

function renderMonth() {
    const grid = engine.monthGrid(viewYear, viewMonth);
    const subs = secondaries();
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
        const events = index.eventsOn(cell.jdn);
        const isToday = cell.jdn === today;
        card.dataset.jdn = cell.jdn;
        card.className = 'roj-day';
        card.classList.toggle('roj-day-outside', !cell.inMonth);
        card.classList.toggle('roj-day-today', isToday);
        card.classList.toggle('roj-day-selected', cell.jdn === selected && !isToday);
        card.classList.toggle('roj-day-weekend', WEEKEND.has(cell.weekday));
        card.classList.toggle('roj-day-holiday', events.some(e => e.holiday));
        card.classList.toggle('roj-day-has-sub', subs.length > 0);
        card.tabIndex = cell.jdn === selected ? 0 : -1;
        card.setAttribute('aria-selected', String(cell.jdn === selected));
        card.setAttribute('aria-label', engine.format(cell.jdn, 'kurdish', '%A %d %B %Y') +
            (events.length ? `, ${events.map(e => localizedText(e.title, prefs.locale)).join(', ')}` : ''));
        const subsHtml = subs.map(cal => `<span class="roj-sub roj-sub-${cal}">${engine.number(cell.dates[cal][2], cal)}</span>`).join('');
        card.innerHTML = `${events.length ? '<span class="roj-day-dot"></span>' : ''}` +
            `<span class="roj-day-number">${engine.number(cell.dates.kurdish[2], 'kurdish')}</span>` +
            (subs.length ? `<span class="roj-day-secondary">${subsHtml}</span>` : '');
    });

    const legend = popup.querySelector('.roj-legend');
    legend.hidden = subs.length === 0;
    legend.querySelectorAll('.roj-legend-item').forEach(item => {
        const cal = item.dataset.cal;
        item.hidden = cal !== 'kurdish' && !subs.includes(cal);
        item.querySelector('.roj-legend-label').textContent = t(CALENDAR_NAMES[cal]);
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

function renderSelection() {
    popup.querySelector('.roj-header-title').textContent = engine.format(selected, 'kurdish', HEADER_FORMATS.kurdish);
    popup.querySelectorAll('.roj-header-line').forEach(row => {
        const cal = row.dataset.cal;
        row.querySelector('.roj-chip').textContent = t(CALENDAR_NAMES[cal]);
        const text = row.querySelector('.roj-header-line-text');
        // Month names in Arabic script reorder the digits around them in a
        // left-to-right line, so each date is isolated in its own direction.
        text.innerHTML = `<bdi>${esc(engine.format(selected, cal, HEADER_FORMATS[cal]))}</bdi>`;
    });

    const events = index.eventsOn(selected);
    popup.querySelector('.roj-events-title').textContent = t('Events');
    const list = popup.querySelector('.roj-events-list');
    if (!events.length) {
        list.innerHTML = `<div class="roj-event-empty">${esc(t('No events on this day'))}</div>`;
    } else {
        list.innerHTML = events.map(ev => `
          <a class="roj-event" href="#ev-${esc(ev.id ?? '')}">
            <span class="roj-event-dot"></span>
            <span class="roj-event-title">${esc(localizedText(ev.title, prefs.locale))}</span>
            ${ev.holiday ? `<span class="roj-event-badge">${esc(t('Holiday'))}</span>` : ''}
          </a>`).join('');
        list.querySelectorAll('.roj-event').forEach(a => a.addEventListener('click', () => openEvent(a.hash.slice(4))));
    }
    save();
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

function onGridKey(event) {
    const rtl = popup.dir === 'rtl';
    const steps = {
        ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7,
    };
    let target = null;
    if (event.key in steps)
        target = selected + steps[event.key];
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
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
    const label = popup.querySelector('[data-action="copy"] span');
    try {
        await navigator.clipboard.writeText(engine.format(selected, 'kurdish', HEADER_FORMATS.kurdish));
        label.textContent = t('Copied');
        setTimeout(() => {
            label.textContent = t('Copy');
        }, 1500);
    } catch {
        // clipboard blocked: nothing to do
    }
}

// Options
function syncOptions() {
    document.querySelectorAll('.seg[data-option]').forEach(seg => {
        seg.querySelectorAll('button').forEach(b => {
            const on = prefs[seg.dataset.option] === b.dataset.value;
            b.setAttribute('aria-checked', String(on));
            b.setAttribute('role', 'radio');
        });
    });
    document.querySelectorAll('[data-sub]').forEach(box => {
        box.checked = prefs.subs[box.dataset.sub];
    });
}

function setOption(key, value) {
    prefs[key] = value;
    engine = makeEngine();
    t = translator(prefs.locale);
    [viewYear, viewMonth] = engine.dateIn('kurdish', selected);
    refresh();
    renderEventList();
    renderMonths();
    renderConverter();
}

document.querySelectorAll('.seg[data-option]').forEach(seg => {
    seg.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b)
            setOption(seg.dataset.option, b.dataset.value);
    });
});
document.querySelectorAll('[data-sub]').forEach(box => box.addEventListener('change', () => {
    prefs.subs[box.dataset.sub] = box.checked;
    renderMonth();
    save();
}));

// Subscriptions
function renderSubscriptions() {
    document.querySelectorAll('.sub-card').forEach(card => {
        const lang = card.dataset.lang;
        const https = `${ICS_BASE}-${lang}.ics`;
        const webcal = https.replace(/^https:/, 'webcal:');
        const links = document.createElement('div');
        links.className = 'sub-links';
        links.innerHTML = `
          <a class="btn primary" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}">Google Calendar</a>
          <a class="btn" href="${webcal}">Apple Calendar</a>
          <a class="btn" href="kurdish-events-${lang}.ics" download>Download .ics</a>
          <button type="button" class="btn copy-link">Copy link</button>`;
        links.querySelector('.copy-link').addEventListener('click', async e => {
            try {
                await navigator.clipboard.writeText(https);
                e.target.textContent = 'Link copied';
                setTimeout(() => {
                    e.target.textContent = 'Copy link';
                }, 1500);
            } catch {
                prompt('Copy this link:', https);
            }
        });
        const url = document.createElement('code');
        url.className = 'sub-url';
        url.textContent = https;
        card.append(url, links);
    });
}

// Every Kurdish day, in the order they fall this Gregorian year
function occurrenceIn(ev, gYear) {
    const first = engine.toJdn('gregorian', gYear, 1, 1);
    const last = engine.toJdn('gregorian', gYear, 12, 31);
    if (ev.calendar === 'gregorian')
        return engine.toJdn('gregorian', gYear, ev.month, ev.day);
    const [y1] = engine.dateIn(ev.calendar, first);
    for (let y = y1; y <= y1 + 1; y++) {
        const jdn = engine.toJdn(ev.calendar, y, ev.month, ev.day);
        if (jdn >= first && jdn <= last)
            return jdn;
    }
    return null;
}

function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s|]+/g, url => `<a href="${url}" rel="noopener">${url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>`);
}

function renderEventList() {
    const gYear = engine.dateIn('gregorian', today)[0];
    document.getElementById('events-sub').textContent =
        `The ${allEvents.length} days Roj includes, in the order they fall in ${gYear}. Open one to read what happened and where it comes from.`;
    const rows = allEvents
        .map(ev => ({ev, jdn: occurrenceIn(ev, gYear)}))
        .filter(r => r.jdn !== null)
        .sort((a, b) => a.jdn - b.jdn);
    const list = document.getElementById('event-list');
    const dir = dirOf(prefs.locale);
    const english = engine.with({locale: 'en'});
    list.dir = dir;
    list.innerHTML = rows.map(({ev, jdn}) => {
        const title = localizedText(ev.title, prefs.locale);
        const description = localizedText(ev.description, 'ckb');
        const [body, ...rest] = description.split('\n');
        const sources = rest.find(l => /https?:\/\//.test(l)) ?? '';
        const facts = rest.filter(l => l !== sources);
        const since = ev.since ? `<span class="ev-since" dir="ltr">${ev.since} · ${gYear - ev.since} years</span>` : '';
        const kinds = {kurdish: 'Kurdish calendar', islamic: 'Islamic calendar'};
        const kind = kinds[ev.calendar] ? `<span class="ev-kind" dir="ltr">${kinds[ev.calendar]}</span>` : '';
        return `
          <details class="ev" id="ev-${esc(ev.id)}">
            <summary>
              <span class="ev-date"><b>${esc(engine.format(jdn, 'kurdish', '%d %B'))}</b><span><bdi>${esc(english.format(jdn, 'gregorian', '%d %B'))}</bdi></span></span>
              <span class="ev-title" dir="${dir}">${esc(title)}</span>
              <span class="ev-tags">${ev.holiday ? '<span class="ev-holiday" dir="ltr">Holiday</span>' : ''}${kind}${since}</span>
            </summary>
            <div class="ev-body">
              ${body ? `<p class="rtl" lang="ckb">${esc(body)}</p>` : '<p class="muted" dir="ltr">No description yet.</p>'}
              ${facts.map(f => `<p class="rtl ev-fact" lang="ckb">${esc(f)}</p>`).join('')}
              ${sources ? `<p class="ev-sources" dir="ltr">Sources: ${linkify(sources.replace(/^[^:]*:\s*/, '')).split(' | ').join(' · ')}</p>` : ''}
              <p class="ev-other">${['ckb', 'kmr', 'en'].filter(l => l !== prefs.locale && ev.title[l]).map(l => `<span dir="${dirOf(l)}">${esc(ev.title[l])}</span>`).join(' · ')}</p>
              <button type="button" dir="ltr" class="btn ev-show" data-jdn="${jdn}">Show in the calendar</button>
            </div>
          </details>`;
    }).join('');
    list.querySelectorAll('.ev-show').forEach(b => b.addEventListener('click', () => {
        select(+b.dataset.jdn);
        document.querySelector('.cal-hero').scrollIntoView({behavior: 'smooth'});
    }));
}

function openEvent(id, scroll = false) {
    const el = document.getElementById(`ev-${id}`);
    if (!el)
        return;
    el.open = true;
    if (scroll)
        el.scrollIntoView();
}

// Months of this Kurdish year
function renderMonths() {
    const [year] = engine.dateIn('kurdish', today);
    const ckb = engine.with({locale: 'ckb'});
    const kmr = engine.with({locale: 'kmr'});
    const en = engine.with({locale: 'en'});
    let html = `<caption>Kurdish year ${en.number(year)}</caption><thead><tr><th>#</th><th>Sorani</th><th>Kurmanji</th><th>Days</th><th>Begins</th></tr></thead><tbody>`;
    for (let m = 1; m <= 12; m++) {
        const first = engine.toJdn('kurdish', year, m, 1);
        html += `<tr${first <= today && today < first + engine.monthLength('kurdish', year, m) ? ' class="now"' : ''}>
          <td>${m}</td><td class="rtl">${esc(ckb.format(first, 'kurdish', '%B'))}</td><td>${esc(kmr.format(first, 'kurdish', '%B'))}</td>
          <td>${engine.monthLength('kurdish', year, m)}</td><td>${esc(en.format(first, 'gregorian', '%d %b %Y'))}</td></tr>`;
    }
    document.getElementById('months').innerHTML = `${html}</tbody>`;
}

// Converter
const convCal = document.getElementById('conv-cal');
const convDate = document.getElementById('conv-date');
let convJdn = null;

function setConverter(cal, date) {
    convCal.value = cal;
    convDate.value = iso(date);
    renderConverter();
}

function renderConverter() {
    const out = document.getElementById('conv-out');
    const m = /^\s*(\d{1,4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*$/.exec(convDate.value);
    convJdn = null;
    if (m) {
        const [y, mo, d] = [+m[1], +m[2], +m[3]];
        try {
            const jdn = engine.toJdn(convCal.value, y, mo, d);
            const back = engine.dateIn(convCal.value, jdn);
            if (back[0] === y && back[1] === mo && back[2] === d)
                convJdn = jdn;
        } catch {
            // not a real date
        }
    }
    document.getElementById('conv-show').disabled = convJdn === null;
    if (convJdn === null) {
        out.innerHTML = `<p class="muted">${convDate.value.trim() ? 'That date does not exist in this calendar.' : 'Type a date, for example 2026-03-21.'}</p>`;
        return;
    }
    out.innerHTML = CALENDARS.map(cal => `
      <div class="conv-row">
        <span class="roj-chip roj-chip-${cal}">${esc(t(CALENDAR_NAMES[cal]))}</span>
        <code>${iso(engine.dateIn(cal, convJdn))}</code>
        <span><bdi>${esc(engine.format(convJdn, cal, HEADER_FORMATS[cal]))}</bdi></span>
      </div>`).join('');
}

convCal.addEventListener('change', () => {
    if (convJdn !== null)
        convDate.value = iso(engine.dateIn(convCal.value, convJdn));
    renderConverter();
});
convDate.addEventListener('input', renderConverter);
document.getElementById('conv-show').addEventListener('click', () => {
    if (convJdn === null)
        return;
    select(convJdn);
    document.querySelector('.cal-hero').scrollIntoView({behavior: 'smooth'});
});

// Start
async function main() {
    buildPopup();
    refresh();
    renderSubscriptions();
    renderMonths();
    setConverter('gregorian', engine.dateIn('gregorian', today));
    try {
        const response = await fetch('engine/data/events/kurdish.json');
        allEvents = parseEventsJson(await response.text()).events;
    } catch (e) {
        console.warn(`Roj: could not load events: ${e.message}`);
    }
    index.setSources([{id: 'kurdish', name: 'Kurdish', events: allEvents}]);
    renderMonth();
    renderSelection();
    renderEventList();
    if (location.hash.startsWith('#ev-'))
        openEvent(location.hash.slice(4), true);

    // Follow midnight, like the extension.
    setInterval(() => {
        const now = engine.todayJdn();
        if (now === today)
            return;
        const follow = selected === today;
        today = now;
        if (follow)
            showToday();
        else
            renderMonth();
    }, 60 * 1000);
}

main();
