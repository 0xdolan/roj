// SPDX-License-Identifier: GPL-3.0-or-later
// GSettings helpers shared by the Shell extension and the preferences window.

import GLib from 'gi://GLib';

import {UUID, VERSION} from './constants.js';
import {CALENDARS, LOCALES} from './engine.js';
import {resolveUiLanguage} from './i18n.js';

// Keys that change how dates are computed or formatted.
export const ENGINE_KEYS = [
    'locale', 'ui-language', 'secondary-language', 'era', 'leading-zero',
    'ezafe-after-day', 'ezafe-on-month', 'month-variant', 'weekday-variant',
    'islamic-offset', 'week-start',
    ...CALENDARS.map(c => `ezafe-${c}`),
    ...LOCALES.map(l => `digits-${l}`),
];

// Keys never written to an exported backup.
const PRIVATE_KEYS = new Set(['prefs-page']);

/** The interface language: the ui-language setting, or the date language when "auto". */
export function uiLanguage(settings) {
    return resolveUiLanguage(settings.get_string('ui-language'), settings.get_string('locale'));
}

export function engineOptions(settings) {
    return {
        locale: settings.get_string('locale'),
        uiLanguage: uiLanguage(settings),
        secondaryLanguage: settings.get_string('secondary-language'),
        digits: Object.fromEntries(LOCALES.map(l => [l, settings.get_string(`digits-${l}`)])),
        era: settings.get_string('era'),
        leadingZero: settings.get_string('leading-zero'),
        ezafe: Object.fromEntries(CALENDARS.map(c => [c, settings.get_boolean(`ezafe-${c}`)])),
        ezafeAfterDay: settings.get_boolean('ezafe-after-day'),
        ezafeOnMonth: settings.get_boolean('ezafe-on-month'),
        monthVariant: settings.get_int('month-variant'),
        weekdayVariant: settings.get_int('weekday-variant'),
        islamicOffset: settings.get_int('islamic-offset'),
        weekStart: settings.get_int('week-start'),
    };
}

export function fontsFromSettings(settings) {
    return {
        latin: settings.get_string('latin-font'),
        arabic: settings.get_string('arabic-font'),
    };
}

function parseJsonKey(settings, key, fallback) {
    try {
        const value = JSON.parse(settings.get_string(key));
        return Array.isArray(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

/** User-loaded fonts: `[{family, path}]`. */
export function customFonts(settings) {
    return parseJsonKey(settings, 'custom-fonts', [])
        .filter(f => f && typeof f.path === 'string' && typeof f.family === 'string');
}

/** Event sources: `[{id, kind: 'builtin'|'file'|'url', location, name, enabled, color}]`. */
export function eventSources(settings) {
    const sources = parseJsonKey(settings, 'event-sources', [])
        .filter(s => s && typeof s.id === 'string' && ['builtin', 'file', 'url'].includes(s.kind));
    if (!sources.some(s => s.kind === 'builtin'))
        sources.unshift({id: 'kurdish', kind: 'builtin', enabled: true, color: '#F5CD0E'});
    return sources;
}

export function setEventSources(settings, sources) {
    settings.set_string('event-sources', JSON.stringify(sources));
}

/** Whether the effective scheme is dark, given the `theme` key and the desktop. */
export function prefersDark(theme, interfaceSettings) {
    if (theme === 'dark')
        return true;
    if (theme === 'light')
        return false;
    return interfaceSettings?.get_string('color-scheme') === 'prefer-dark';
}

// Backup
/** Serialise every user-visible key to a JSON string. */
export function exportSettings(settings) {
    const schema = settings.settings_schema;
    const values = {};
    for (const key of schema.list_keys().sort()) {
        if (!PRIVATE_KEYS.has(key))
            values[key] = settings.get_value(key).recursiveUnpack();
    }
    return JSON.stringify({
        application: 'roj',
        uuid: UUID,
        version: VERSION,
        exported: GLib.DateTime.new_now_utc().format_iso8601(),
        settings: values,
    }, null, 2);
}

/**
 * Apply a backup produced by `exportSettings`. Unknown keys and values of the
 * wrong type or outside the schema's range are skipped and reported.
 */
export function importSettings(settings, text) {
    const data = JSON.parse(text);
    if (!data || data.application !== 'roj' || typeof data.settings !== 'object')
        throw new Error('This file is not a Roj settings backup.');

    const schema = settings.settings_schema;
    const applied = [];
    const skipped = [];
    for (const [key, value] of Object.entries(data.settings)) {
        if (PRIVATE_KEYS.has(key) || !schema.has_key(key)) {
            skipped.push(key);
            continue;
        }
        const schemaKey = schema.get_key(key);
        try {
            const variant = new GLib.Variant(schemaKey.get_value_type().dup_string(), value);
            if (!schemaKey.range_check(variant))
                throw new Error('out of range');
            settings.set_value(key, variant);
            applied.push(key);
        } catch {
            skipped.push(key);
        }
    }
    return {applied, skipped};
}

/** Reset every key to its default. */
export function resetSettings(settings) {
    for (const key of settings.settings_schema.list_keys())
        settings.reset(key);
}
