// SPDX-License-Identifier: GPL-3.0-or-later
// Minimal iCalendar (RFC 5545) reader for holiday and event feeds. It covers
// what public holiday calendars use: all-day and timed VEVENTs, multi-day
// ranges and yearly recurrence. Everything else is ignored, never fatal.

const MAX_SPAN_DAYS = 62;

function unescapeText(value) {
    return value
        .replace(/\\n/gi, '\n')
        .replace(/\\([,;\\])/g, '$1');
}

function parseLine(line) {
    // NAME;PARAM=VALUE;PARAM="quoted:value":VALUE
    let inQuotes = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"')
            inQuotes = !inQuotes;
        else if (ch === ':' && !inQuotes) {
            colon = i;
            break;
        }
    }
    if (colon < 0)
        return null;
    const head = line.slice(0, colon).split(';');
    const params = {};
    for (const p of head.slice(1)) {
        const eq = p.indexOf('=');
        if (eq > 0)
            params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    return {name: head[0].toUpperCase(), params, value: line.slice(colon + 1)};
}

/** Parse an iCalendar date or date-time into local wall-clock parts. */
export function parseIcsDate(value, params = {}) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m)
        return null;
    const [, y, mo, d, hh, mm, ss, z] = m;
    if (hh === undefined || params.VALUE === 'DATE')
        return {year: +y, month: +mo, day: +d, allDay: true, hour: 0, minute: 0};
    if (z) {
        const local = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss ?? 0)));
        return {
            year: local.getFullYear(), month: local.getMonth() + 1, day: local.getDate(),
            allDay: false, hour: local.getHours(), minute: local.getMinutes(),
        };
    }
    // Floating time or TZID: shown as written.
    return {year: +y, month: +mo, day: +d, allDay: false, hour: +hh, minute: +mm};
}

function parseRrule(value) {
    const rule = {};
    for (const part of value.split(';')) {
        const [k, v] = part.split('=');
        if (k && v)
            rule[k.toUpperCase()] = v;
    }
    return rule;
}

function addDays(date, n) {
    const d = new Date(date.year, date.month - 1, date.day + n);
    return {...date, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate()};
}

function daysBetween(a, b) {
    const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
    return Math.round(ms / 86400000);
}

/**
 * Parse ICS text into `{name, events}` where each event is a plain record in
 * the same shape as the JSON events format (calendar is always 'gregorian').
 */
export function parseIcs(text) {
    const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let name = null;
    let current = null;

    for (const raw of lines) {
        const prop = parseLine(raw);
        if (!prop)
            continue;
        if (prop.name === 'BEGIN' && prop.value.toUpperCase() === 'VEVENT') {
            current = {};
            continue;
        }
        if (prop.name === 'END' && prop.value.toUpperCase() === 'VEVENT') {
            if (current)
                events.push(...expandEvent(current));
            current = null;
            continue;
        }
        if (!current) {
            if (prop.name === 'X-WR-CALNAME')
                name = unescapeText(prop.value);
            continue;
        }
        switch (prop.name) {
        case 'SUMMARY':
            current.title = unescapeText(prop.value);
            break;
        case 'DESCRIPTION':
            current.description = unescapeText(prop.value);
            break;
        case 'CATEGORIES':
            current.categories = unescapeText(prop.value).split(',').map(s => s.trim());
            break;
        case 'DTSTART':
            current.start = parseIcsDate(prop.value, prop.params);
            break;
        case 'DTEND':
            current.end = parseIcsDate(prop.value, prop.params);
            break;
        case 'RRULE':
            current.rrule = parseRrule(prop.value);
            break;
        case 'STATUS':
            current.status = prop.value.toUpperCase();
            break;
        case 'TRANSP':
            current.transparent = prop.value.toUpperCase() === 'TRANSPARENT';
            break;
        }
    }
    return {name, events};
}

function expandEvent(ev) {
    if (!ev.start || !ev.title || ev.status === 'CANCELLED')
        return [];

    const time = ev.start.allDay
        ? null
        : `${String(ev.start.hour).padStart(2, '0')}:${String(ev.start.minute).padStart(2, '0')}`;
    const yearly = ev.rrule?.FREQ === 'YEARLY';

    let span = 1;
    if (ev.end) {
        span = daysBetween(ev.start, ev.end);
        // All-day DTEND is exclusive; a timed event ending later the same day spans 1.
        if (!ev.end.allDay)
            span += 1;
        span = Math.min(Math.max(span, 1), MAX_SPAN_DAYS);
    }

    const out = [];
    for (let i = 0; i < span; i++) {
        const d = addDays(ev.start, i);
        const record = {
            calendar: 'gregorian',
            month: yearly && ev.rrule.BYMONTH ? +ev.rrule.BYMONTH : d.month,
            day: yearly && ev.rrule.BYMONTHDAY ? +ev.rrule.BYMONTHDAY : d.day,
            title: ev.title,
        };
        if (!yearly)
            record.year = d.year;
        if (time && i === 0)
            record.time = time;
        if (ev.description)
            record.description = ev.description;
        // Public holiday feeds mark days off either by category or, like Google's
        // national calendars, with the description "Public holiday".
        if (ev.categories?.some(c => /holiday/i.test(c)) || /^\s*public holiday\s*$/i.test(ev.description ?? ''))
            record.holiday = true;
        out.push(record);
    }
    return out;
}
