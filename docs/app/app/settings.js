// SPDX-License-Identifier: GPL-3.0-or-later
// Roj settings in the browser. The keys, types, defaults and limits are those
// of the GNOME extension's GSettings schema (copied into defaults.js by
// `make web`), so a backup exported on GNOME imports here and the other way
// round.

import {CALENDARS, LOCALES} from '../lib/engine.js';
import {resolveUiLanguage} from '../lib/i18n.js';
import {VERSION} from '../lib/constants.js';
import {SCHEMA} from './defaults.js';
import {readSettings, writeSettings} from './store.js';

// Keys that mean nothing in a browser and are never written to a backup made here.
const PRIVATE_KEYS = new Set(['prefs-page']);

export const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(SCHEMA).map(([k, s]) => [k, s.default])));

/** Whether `value` fits the schema of `key`. */
export function validValue(key, value) {
    const spec = SCHEMA[key];
    if (!spec)
        return false;
    switch (spec.type) {
    case 's':
        return typeof value === 'string' && (!spec.choices || spec.choices.includes(value));
    case 'b':
        return typeof value === 'boolean';
    case 'i':
    case 'd':
        return typeof value === 'number' && Number.isFinite(value) &&
            (spec.type === 'd' || Number.isInteger(value)) &&
            (!spec.range || (value >= spec.range[0] && value <= spec.range[1]));
    case 'ai':
        return Array.isArray(value) && value.every(v => Number.isInteger(v));
    default:
        return false;
    }
}

/** Saved values over the defaults; anything invalid falls back to its default. */
export function withDefaults(saved) {
    const values = {...DEFAULTS};
    for (const [key, value] of Object.entries(saved ?? {})) {
        if (validValue(key, value))
            values[key] = value;
    }
    return values;
}

export async function loadSettings() {
    return withDefaults(await readSettings());
}

/** Store only what differs from the defaults, to stay inside storage.sync limits. */
export async function saveSettings(values) {
    const changed = {};
    for (const [key, value] of Object.entries(values)) {
        if (key in DEFAULTS && JSON.stringify(value) !== JSON.stringify(DEFAULTS[key]) && validValue(key, value))
            changed[key] = value;
    }
    await writeSettings(changed);
}

export async function setSetting(key, value) {
    const values = await loadSettings();
    if (!validValue(key, value))
        throw new Error(`Invalid value for ${key}`);
    values[key] = value;
    await saveSettings(values);
    return values;
}

export async function resetSettings() {
    await writeSettings({});
}

// The same mapping as extension/lib/config.js, over a plain object.
export function uiLanguage(s) {
    return resolveUiLanguage(s['ui-language'], s.locale);
}

export function engineOptions(s) {
    return {
        locale: s.locale,
        uiLanguage: uiLanguage(s),
        secondaryLanguage: s['secondary-language'],
        digits: Object.fromEntries(LOCALES.map(l => [l, s[`digits-${l}`]])),
        era: s.era,
        leadingZero: s['leading-zero'],
        ezafe: Object.fromEntries(CALENDARS.map(c => [c, s[`ezafe-${c}`]])),
        ezafeAfterDay: s['ezafe-after-day'],
        ezafeOnMonth: s['ezafe-on-month'],
        monthVariant: s['month-variant'],
        weekdayVariant: s['weekday-variant'],
        islamicOffset: s['islamic-offset'],
        weekStart: s['week-start'],
    };
}

function parseList(text) {
    try {
        const value = JSON.parse(text);
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

/** Event sources: `[{id, kind: 'builtin'|'file'|'url', location, name, enabled, color, allHolidays}]`. */
export function eventSources(s) {
    const sources = parseList(s['event-sources'])
        .filter(x => x && typeof x.id === 'string' && ['builtin', 'file', 'url'].includes(x.kind));
    if (!sources.some(x => x.kind === 'builtin'))
        sources.unshift({id: 'kurdish', kind: 'builtin', enabled: true, color: '#F5CD0E'});
    return sources;
}

/** Fonts loaded from a file in this browser: `[{family, id}]`. GNOME entries (with a path) are skipped. */
export function customFonts(s) {
    return parseList(s['custom-fonts']).filter(f => f && typeof f.family === 'string' && typeof f.id === 'string');
}

// Backup, in the format of extension/lib/config.js
export function exportSettings(s) {
    const values = {};
    for (const key of Object.keys(SCHEMA).sort()) {
        if (!PRIVATE_KEYS.has(key))
            values[key] = s[key];
    }
    return JSON.stringify({
        application: 'roj',
        uuid: 'roj@0xdolan.github.io',
        version: VERSION,
        exported: new Date().toISOString(),
        settings: values,
    }, null, 2);
}

/** Apply a backup; returns `{values, applied, skipped}` without saving. */
export function importSettings(current, text) {
    const data = JSON.parse(text);
    if (!data || data.application !== 'roj' || typeof data.settings !== 'object' || data.settings === null)
        throw new Error('This file is not a Roj settings backup.');
    const values = {...current};
    const applied = [];
    const skipped = [];
    for (const [key, value] of Object.entries(data.settings)) {
        if (!PRIVATE_KEYS.has(key) && validValue(key, value)) {
            values[key] = value;
            applied.push(key);
        } else {
            skipped.push(key);
        }
    }
    return {values, applied, skipped};
}
