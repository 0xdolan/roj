// SPDX-License-Identifier: GPL-3.0-or-later
// Event model and lookup. Sources (the bundled Kurdish events, user JSON files
// and ICS feeds) are normalised into one shape and indexed so that looking up
// a day is a handful of Map reads, cheap enough to run for all 42 grid cells.
//
// JSON event format (see docs/EVENTS.md):
//   { "calendar": "kurdish" | "gregorian" | "persian" | "islamic",
//     "month": 1-12, "day": 1-31, "year": optional (one-off event),
//     "title": "text" | {"ckb": "…", "kmr": "…", "en": "…"},
//     "description": optional, same shapes as title,
//     "holiday": optional boolean, "time": optional "HH:MM",
//     "id": optional stable name, "since": optional year it first happened }

import {CALENDARS} from './engine.js';
import {parseIcs} from './ics.js';
import {persianToJdn} from './tsroj.js';

const KURDISH_SOLAR_OFFSET = 1321;

export class EventFormatError extends Error {}

function validText(value) {
    if (typeof value === 'string')
        return value.trim().length > 0;
    return value && typeof value === 'object' &&
        Object.values(value).some(v => typeof v === 'string' && v.trim());
}

/** Validate and normalise one raw event. Returns null when unusable. */
export function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const calendar = String(raw.calendar ?? 'gregorian').toLowerCase();
    const month = Number(raw.month);
    const day = Number(raw.day);
    if (!CALENDARS.includes(calendar))
        return null;
    if (!Number.isInteger(month) || month < 1 || month > 12)
        return null;
    if (!Number.isInteger(day) || day < 1 || day > 31)
        return null;
    if (!validText(raw.title))
        return null;
    const year = raw.year === undefined || raw.year === null ? null : Number(raw.year);
    if (year !== null && !Number.isInteger(year))
        return null;
    return {
        calendar,
        month,
        day,
        year,
        title: raw.title,
        description: raw.description ?? null,
        holiday: raw.holiday === true,
        time: typeof raw.time === 'string' ? raw.time : null,
        id: typeof raw.id === 'string' ? raw.id : null,
        since: Number.isInteger(raw.since) ? raw.since : null,
    };
}

/** Parse a JSON events document: `{name, events: [...]}` or a bare array. */
export function parseEventsJson(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new EventFormatError(`Invalid JSON: ${e.message}`);
    }
    const list = Array.isArray(data) ? data : data?.events;
    if (!Array.isArray(list))
        throw new EventFormatError('Expected an "events" array');
    const events = [];
    const rejected = [];
    list.forEach((raw, i) => {
        const ev = normalizeEvent(raw);
        if (ev)
            events.push(ev);
        else
            rejected.push(i);
    });
    return {name: Array.isArray(data) ? null : data.name ?? null, events, rejected};
}

/** Parse either format, chosen by file name or content sniffing. */
export function parseEventsDocument(text, filename = '') {
    const isIcs = /\.ics$/i.test(filename) || /^\s*BEGIN:VCALENDAR/i.test(text);
    if (isIcs) {
        const {name, events} = parseIcs(text);
        return {name, events: events.map(normalizeEvent).filter(Boolean), rejected: []};
    }
    return parseEventsJson(text);
}

/**
 * Index of events across sources. `sources` is a list of
 * `{id, name, color, events}` where `events` are normalised records.
 */
export class EventIndex {
    constructor(engine) {
        this._engine = engine;
        this._recurring = new Map();
        this._oneOff = new Map();
        this._count = 0;
    }

    get size() {
        return this._count;
    }

    setSources(sources) {
        this._recurring.clear();
        this._oneOff.clear();
        this._count = 0;
        for (const source of sources) {
            for (const ev of source.events) {
                const entry = {...ev, sourceId: source.id, sourceName: source.name, color: source.color ?? null};
                if (ev.year === null) {
                    this._push(this._recurring, `${ev.calendar}:${ev.month}:${ev.day}`, entry);
                } else {
                    const jdn = this._oneOffJdn(ev);
                    if (jdn !== null)
                        this._push(this._oneOff, jdn, entry);
                }
                this._count++;
            }
        }
    }

    _push(map, key, entry) {
        const list = map.get(key);
        if (list)
            list.push(entry);
        else
            map.set(key, [entry]);
    }

    _oneOffJdn(ev) {
        try {
            // One-off Kurdish years are always read in the solar era (Persian + 1321)
            // so an event file means the same day whatever era the user displays.
            if (ev.calendar === 'kurdish')
                return persianToJdn(ev.year - KURDISH_SOLAR_OFFSET, ev.month, ev.day);
            return this._engine.toJdn(ev.calendar, ev.year, ev.month, ev.day);
        } catch {
            return null;
        }
    }

    /** Events on a day, holidays first. */
    eventsOn(jdn) {
        const dates = this._engine.allDates(jdn);
        const found = [...(this._oneOff.get(jdn) ?? [])];
        for (const cal of CALENDARS) {
            const [, m, d] = dates[cal];
            const list = this._recurring.get(`${cal}:${m}:${d}`);
            if (list)
                found.push(...list);
        }
        return found.sort((a, b) => Number(b.holiday) - Number(a.holiday));
    }

    hasEvents(jdn) {
        return this.eventsOn(jdn).length > 0;
    }
}
