// SPDX-License-Identifier: GPL-3.0-or-later
// Loads event sources (bundled JSON, local JSON/ICS files, online ICS feeds)
// into an EventIndex. Online feeds are cached under ~/.cache/roj so the popup
// works offline and the network is only touched every few hours.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventIndex, parseEventsDocument} from './events.js';
import {eventSources} from './config.js';
import {localizedText} from './i18n.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const decoder = new TextDecoder('utf-8');

function cacheDir() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'roj', 'feeds']);
}

function cachePathFor(url) {
    const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, url, -1);
    return GLib.build_filenamev([cacheDir(), `${hash}.ics`]);
}

async function readText(path, cancellable) {
    const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    return decoder.decode(bytes);
}

function fileAgeHours(path) {
    try {
        const info = Gio.File.new_for_path(path).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const modified = info.get_modification_date_time().to_unix();
        return (GLib.get_real_time() / 1e6 - modified) / 3600;
    } catch {
        return Infinity;
    }
}

/** Download `url` (http/https/webcal) with libsoup 3 and return its text. */
export async function fetchText(url, cancellable) {
    const {default: Soup} = await import('gi://Soup?version=3.0');
    const session = new Soup.Session({timeout: 30, user_agent: 'roj (https://github.com/0xdolan/roj)'});
    const message = Soup.Message.new('GET', url.replace(/^webcal:/i, 'https:'));
    if (!message)
        throw new Error(`Invalid URL: ${url}`);
    const bytes = await new Promise((resolve, reject) => {
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (s, res) => {
            try {
                resolve(s.send_and_read_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
    if (message.get_status() !== Soup.Status.OK)
        throw new Error(`HTTP ${message.get_status()} for ${url}`);
    return decoder.decode(bytes.get_data());
}

export class EventStore {
    /**
     * @param {object} params
     * @param {string} params.extensionPath
     * @param {Gio.Settings} params.settings
     * @param {import('./engine.js').RojEngine} params.engine
     * @param {Function} params.onChanged called after every (re)load
     */
    constructor({extensionPath, settings, engine, onChanged}) {
        this._extensionPath = extensionPath;
        this._settings = settings;
        this._onChanged = onChanged;
        this._cancellable = new Gio.Cancellable();
        this.index = new EventIndex(engine);
        this.errors = new Map();
        this.info = new Map(); // source id → {name, count}
        this._refreshId = 0;
    }

    builtinPath() {
        return GLib.build_filenamev([this._extensionPath, 'data', 'events', 'kurdish.json']);
    }

    /** Reload every enabled source. `force` re-downloads online feeds. */
    async reload(force = false) {
        const lang = this._settings.get_string('locale');
        const loaded = [];
        const errors = new Map();
        const info = new Map();
        const enabled = this._settings.get_boolean('events-enabled')
            ? eventSources(this._settings).filter(s => s.enabled !== false)
            : [];

        for (const source of enabled) {
            try {
                const text = await this._readSource(source, force);
                const doc = parseEventsDocument(text, source.location ?? 'events.json');
                const name = source.name || localizedText(doc.name, lang) || source.location || source.id;
                const events = source.allHolidays ? doc.events.map(ev => ({...ev, holiday: true})) : doc.events;
                loaded.push({id: source.id, name, color: source.color ?? null, events});
                info.set(source.id, {name, count: events.length});
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;
                errors.set(source.id, e.message);
                console.warn(`Roj: event source ${source.id} failed: ${e.message}`);
            }
        }
        // destroy() may have run while sources were loading.
        if (this._cancellable.is_cancelled())
            return;
        this.index.setSources(loaded);
        this.errors = errors;
        this.info = info;
        this._scheduleRefresh();
        this._onChanged?.();
    }

    async _readSource(source, force) {
        switch (source.kind) {
        case 'builtin':
            return readText(this.builtinPath(), this._cancellable);
        case 'file':
            return readText(source.location, this._cancellable);
        case 'url':
            return this._readFeed(source.location, force);
        default:
            throw new Error(`Unknown source kind ${source.kind}`);
        }
    }

    async _readFeed(url, force) {
        const path = cachePathFor(url);
        const maxAge = this._settings.get_int('ics-refresh-hours');
        if (!force && fileAgeHours(path) < maxAge)
            return readText(path, this._cancellable);
        try {
            const text = await fetchText(url, this._cancellable);
            GLib.mkdir_with_parents(cacheDir(), 0o700);
            await Gio.File.new_for_path(path).replace_contents_bytes_async(
                new GLib.Bytes(new TextEncoder().encode(text)), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, this._cancellable);
            return text;
        } catch (e) {
            // Offline or server error: fall back to the last good copy.
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                return readText(path, this._cancellable);
            throw e;
        }
    }

    _scheduleRefresh() {
        if (this._refreshId)
            GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        const hasFeeds = eventSources(this._settings).some(s => s.kind === 'url' && s.enabled !== false);
        if (!hasFeeds)
            return;
        const seconds = this._settings.get_int('ics-refresh-hours') * 3600;
        this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, seconds, () => {
            this._refreshId = 0;
            this.reload(true).catch(logError);
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._cancellable.cancel();
        if (this._refreshId)
            GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        this._onChanged = null;
    }
}
