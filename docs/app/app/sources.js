// SPDX-License-Identifier: GPL-3.0-or-later
// Event sources in the browser, as extension/lib/eventStore.js does on GNOME:
// the included Kurdish events, JSON or .ics files the user added (their text is
// kept in local storage), and online calendars, downloaded again after
// `ics-refresh-hours` with the last good copy kept for offline use.

import {EventIndex, parseEventsDocument} from '../lib/events.js';
import {localizedText} from '../lib/i18n.js';
import {eventSources} from './settings.js';
import {assetUrl, readLocal, removeLocal, writeLocal} from './store.js';

export const BUILTIN_PATH = 'data/events/kurdish.json';
const fileKey = id => `file:${id}`;
const feedKey = id => `feed:${id}`;

/** webcal:// is https:// for a browser. */
export function feedUrl(location) {
    return String(location).replace(/^webcal:\/\//i, 'https://');
}

export function validFeedUrl(text) {
    return /^(https?|webcal):\/\/[^\s/]+\.[^\s]+$/i.test(String(text).trim());
}

async function fetchText(url) {
    const response = await fetch(url, {cache: 'no-store', credentials: 'omit'});
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.text();
}

async function readFeed(source, maxAgeHours, force) {
    const cached = await readLocal(feedKey(source.id));
    const age = cached ? (Date.now() - cached.time) / 3600000 : Infinity;
    if (!force && age < maxAgeHours)
        return cached.text;
    try {
        const text = await fetchText(feedUrl(source.location));
        await writeLocal(feedKey(source.id), {text, time: Date.now()});
        return text;
    } catch (e) {
        // Offline or server error: fall back to the last good copy.
        if (cached)
            return cached.text;
        // A failed fetch without a status is almost always CORS in the web app.
        throw e instanceof TypeError ? new Error('cors') : e;
    }
}

async function readSource(source, settings, force) {
    switch (source.kind) {
    case 'builtin':
        return fetchText(assetUrl(BUILTIN_PATH));
    case 'file': {
        const text = await readLocal(fileKey(source.id));
        if (typeof text !== 'string')
            throw new Error('missing');
        return text;
    }
    case 'url':
        return readFeed(source, settings['ics-refresh-hours'], force);
    default:
        throw new Error(`Unknown source kind ${source.kind}`);
    }
}

/**
 * Load every enabled source into a new EventIndex.
 * Returns `{index, errors: Map(id, message), info: Map(id, {name, count})}`.
 */
export async function loadEvents(engine, settings, {force = false} = {}) {
    const lang = settings.locale;
    const loaded = [];
    const errors = new Map();
    const info = new Map();
    const enabled = settings['events-enabled'] ? eventSources(settings).filter(s => s.enabled !== false) : [];
    await Promise.all(enabled.map(async source => {
        try {
            const text = await readSource(source, settings, force);
            const doc = parseEventsDocument(text, source.location ?? 'events.json');
            const name = source.name || localizedText(doc.name, lang) || source.location || source.id;
            const events = source.allHolidays ? doc.events.map(ev => ({...ev, holiday: true})) : doc.events;
            loaded.push({order: enabled.indexOf(source), id: source.id, name, color: source.color ?? null, events});
            info.set(source.id, {name, count: events.length});
        } catch (e) {
            errors.set(source.id, e.message);
        }
    }));
    loaded.sort((a, b) => a.order - b.order);
    const index = new EventIndex(engine);
    index.setSources(loaded);
    return {index, errors, info};
}

/** Keep the text of an added file. */
export function storeFile(id, text) {
    return writeLocal(fileKey(id), text);
}

/** Forget everything kept for a removed source. */
export async function forgetSource(id) {
    await removeLocal(fileKey(id));
    await removeLocal(feedKey(id));
}
