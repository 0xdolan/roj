// SPDX-License-Identifier: GPL-3.0-or-later
// Writes events as an iCalendar (RFC 5545) file that Google Calendar, Apple
// Calendar and Outlook can import or subscribe to. Gregorian events repeat
// with RRULE:FREQ=YEARLY. Calendar apps only know the Gregorian calendar, so
// events in the Kurdish, Persian and Islamic calendars are written out once
// per year in the range instead.

import {localizedText} from './i18n.js';

const MAX_OCTETS = 75;
const encoder = new TextEncoder();

function escapeText(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/[;,]/g, '\\$&')
        .replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 octets continue on the next line after a space,
// split between characters, never inside a UTF-8 sequence.
function fold(line) {
    if (encoder.encode(line).length <= MAX_OCTETS)
        return line;
    const out = [];
    let chunk = '';
    let size = 0;
    for (const ch of line) {
        const n = encoder.encode(ch).length;
        const limit = out.length ? MAX_OCTETS - 1 : MAX_OCTETS;
        if (size + n > limit) {
            out.push(chunk);
            chunk = '';
            size = 0;
        }
        chunk += ch;
        size += n;
    }
    out.push(chunk);
    return out.join('\r\n ');
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const ymd = ([y, m, d]) => `${pad(y, 4)}${pad(m)}${pad(d)}`;

function slug(ev, i) {
    return ev.id ?? `${ev.calendar}-${ev.month}-${ev.day}-${i}`;
}

/** Text in exactly `lang`, without falling back to another language. */
function exactText(value, lang) {
    if (!value)
        return '';
    return typeof value === 'string' ? value : value[lang] ?? '';
}

/**
 * Gregorian [y, m, d] of every occurrence of a recurring event whose
 * Gregorian year is in [fromYear, toYear].
 */
function occurrences(engine, ev, fromYear, toYear) {
    // Kurdish months and days are the Persian ones; only the year differs.
    const calendar = ev.calendar === 'kurdish' ? 'persian' : ev.calendar;
    const first = engine.toJdn('gregorian', fromYear, 1, 1);
    const last = engine.toJdn('gregorian', toYear, 12, 31);
    const [y1] = engine.dateIn(calendar, first);
    const [y2] = engine.dateIn(calendar, last);
    const out = [];
    for (let y = y1; y <= y2; y++) {
        const jdn = engine.toJdn(calendar, y, ev.month, ev.day);
        // Skip days a short month does not have, such as 30 Reşemê in most years.
        const [, m, d] = engine.dateIn(calendar, jdn);
        if (m !== ev.month || d !== ev.day || jdn < first || jdn > last)
            continue;
        out.push(engine.dateIn('gregorian', jdn));
    }
    return out;
}

/**
 * Build an .ics document.
 * @param {object[]} events normalised events (see events.js)
 * @param {object} options
 * @param {import('./engine.js').RojEngine} options.engine its Islamic offset moves Islamic events
 * @param {string} options.lang language of titles: ckb, kmr, en, fa or ar
 * @param {string} options.name calendar name shown by calendar apps
 * @param {string} [options.description]
 * @param {number} options.fromYear first Gregorian year for non-Gregorian events
 * @param {number} options.toYear last Gregorian year for non-Gregorian events
 * @param {string} options.stamp DTSTAMP, as YYYYMMDDTHHMMSSZ
 */
export function buildIcs(events, {engine, lang, name, description = '', fromYear, toYear, stamp}) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Roj//Kurdish calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `NAME:${escapeText(name)}`,
        `X-WR-CALNAME:${escapeText(name)}`,
    ];
    if (description)
        lines.push(`X-WR-CALDESC:${escapeText(description)}`);
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:P1W', 'X-PUBLISHED-TTL:P1W');

    const vevent = (uid, date, ev, rrule) => {
        const title = localizedText(ev.title, lang);
        const notes = exactText(ev.description, lang);
        const [y, m, d] = date;
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        lines.push('BEGIN:VEVENT', `UID:${uid}@roj.0xdolan.github.io`, `DTSTAMP:${stamp}`);
        if (ev.time) {
            const [hh, mm] = ev.time.split(':');
            lines.push(`DTSTART:${ymd(date)}T${pad(hh)}${pad(mm)}00`);
        } else {
            lines.push(`DTSTART;VALUE=DATE:${ymd(date)}`,
                `DTEND;VALUE=DATE:${ymd([next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()])}`);
        }
        if (rrule)
            lines.push('RRULE:FREQ=YEARLY');
        lines.push(`SUMMARY;LANGUAGE=${lang}:${escapeText(title)}`);
        if (notes)
            lines.push(`DESCRIPTION;LANGUAGE=${lang}:${escapeText(notes)}`);
        if (ev.holiday)
            lines.push('CATEGORIES:HOLIDAY');
        lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
    };

    events.forEach((ev, i) => {
        const id = slug(ev, i);
        if (ev.year !== null && ev.year !== undefined) {
            const calendar = ev.calendar === 'kurdish' ? 'persian' : ev.calendar;
            const year = ev.calendar === 'kurdish' ? ev.year - 1321 : ev.year;
            vevent(`${id}-${ev.year}`, engine.dateIn('gregorian', engine.toJdn(calendar, year, ev.month, ev.day)), ev, false);
        } else if (ev.calendar === 'gregorian') {
            vevent(id, [ev.since ?? fromYear, ev.month, ev.day], ev, true);
        } else {
            for (const date of occurrences(engine, ev, fromYear, toYear))
                vevent(`${id}-${date[0]}`, date, ev, false);
        }
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n');
}
