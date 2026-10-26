// SPDX-License-Identifier: GPL-3.0-or-later
// Shared plumbing for the preferences pages: a context object that owns the
// settings, a live RojEngine, the translator and all signal connections, plus
// row builders.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {RojEngine} from '../lib/engine.js';
import {ENGINE_KEYS, engineOptions, fontsFromSettings, uiLanguage} from '../lib/config.js';
import {N_, translator} from '../lib/i18n.js';
import {fontMarkup} from '../lib/richtext.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open', 'open_finish');
Gio._promisify(Gtk.FileDialog.prototype, 'save', 'save_finish');
Gio._promisify(Gtk.FontDialog.prototype, 'choose_family', 'choose_family_finish');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

export const CALENDAR_LABELS = {
    kurdish: N_('Kurdish'),
    gregorian: N_('Gregorian'),
    persian: N_('Persian (Jalali)'),
    islamic: N_('Islamic (Hijri)'),
};

/**
 * Everything a page needs. One context lives as long as one build of the
 * window; switching the interface language destroys it and builds anew.
 */
export class PrefsContext {
    constructor({settings, path, metadata, window}) {
        this.settings = settings;
        this.path = path;
        this.metadata = metadata;
        this.window = window;
        this.lang = uiLanguage(settings);
        this._ = translator(this.lang);
        this.engine = new RojEngine(engineOptions(settings));
        this._handlers = [];
        this._cleanups = [];

        // Connected first, so every preview handler sees the updated engine.
        this.onChange(ENGINE_KEYS, () => this.engine.setOptions(engineOptions(settings)));
    }

    get fonts() {
        return fontsFromSettings(this.settings);
    }

    /** Pango markup for `text` using the configured LTR/RTL fonts. */
    markup(text, attrs = {}) {
        return fontMarkup(text, this.fonts, attrs);
    }

    get version() {
        return this.metadata['version-name'] ?? String(this.metadata.version ?? '');
    }

    /** Call `callback` when any of `keys` changes (or any key when `keys` is null). */
    onChange(keys, callback) {
        const id = this.settings.connect('changed', (_s, key) => {
            if (!keys || keys.includes(key))
                callback(key);
        });
        this._handlers.push(id);
        return id;
    }

    /** Run `fn` when this context is destroyed. */
    addCleanup(fn) {
        this._cleanups.push(fn);
    }

    toast(title) {
        this.window.add_toast(new Adw.Toast({title, timeout: 3}));
    }

    copy(text, what = null) {
        const clipboard = Gdk.Display.get_default().get_clipboard();
        const bytes = new GLib.Bytes(new TextEncoder().encode(text));
        clipboard.set_content(Gdk.ContentProvider.new_for_bytes('text/plain;charset=utf-8', bytes));
        this.toast(what ?? this._('Copied to the clipboard'));
    }

    openUri(uri) {
        new Gtk.UriLauncher({uri}).launch(this.window, null, null);
    }

    destroy() {
        for (const id of this._handlers)
            this.settings.disconnect(id);
        this._handlers = [];
        for (const fn of this._cleanups.splice(0))
            fn();
    }
}

// Row builders

export function switchRow(ctx, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    ctx.settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** Combo bound to a string or integer key. `options`: [{value, label}]. */
export function comboRow(ctx, key, title, options, subtitle = '') {
    const row = new Adw.ComboRow({title, subtitle});
    const isInt = ctx.settings.settings_schema.get_key(key).get_value_type().dup_string() === 'i';
    const get = () => (isInt ? ctx.settings.get_int(key) : ctx.settings.get_string(key));
    let current = options;

    const sync = () => {
        const index = current.findIndex(o => o.value === get());
        if (index >= 0 && row.selected !== index)
            row.selected = index;
    };
    row.setOptions = opts => {
        current = opts;
        row.model = Gtk.StringList.new(opts.map(o => o.label));
        sync();
    };
    row.setOptions(options);
    row.connect('notify::selected', () => {
        const option = current[row.selected];
        if (!option || option.value === get())
            return;
        if (isInt)
            ctx.settings.set_int(key, option.value);
        else
            ctx.settings.set_string(key, option.value);
    });
    ctx.onChange([key], sync);
    return row;
}

export function spinRow(ctx, key, title, {min, max, step = 1, digits = 0, subtitle = ''}) {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.title = title;
    row.subtitle = subtitle;
    row.digits = digits;
    ctx.settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function iconButton(iconName, tooltip, onClick, cssClasses = ['flat']) {
    const button = new Gtk.Button({
        icon_name: iconName,
        tooltip_text: tooltip,
        valign: Gtk.Align.CENTER,
        css_classes: cssClasses,
    });
    button.connect('clicked', onClick);
    return button;
}

export function textButton(label, onClick, cssClasses = []) {
    const button = new Gtk.Button({label, valign: Gtk.Align.CENTER, css_classes: cssClasses});
    button.connect('clicked', onClick);
    return button;
}

/** A wrapping label for prose inside a PreferencesGroup. */
export function prose(markup, cssClasses = []) {
    return new Gtk.Label({
        label: markup,
        use_markup: true,
        wrap: true,
        xalign: 0,
        selectable: false,
        css_classes: cssClasses,
    });
}

/** A selectable, non-wrapping monospace block for code and commands. */
export function codeBlock(text) {
    const label = new Gtk.Label({
        label: text,
        xalign: 0,
        selectable: true,
        css_classes: ['monospace', 'card', 'roj-code'],
    });
    label.set_direction(Gtk.TextDirection.LTR);
    return label;
}

/** Ask a question. Resolves to the chosen response id. */
export function choose(ctx, heading, body, responses, {destructive = null, suggested = null, extra = null} = {}) {
    return new Promise(resolve => {
        const dialog = Adw.AlertDialog
            ? new Adw.AlertDialog({heading, body})
            : new Adw.MessageDialog({transient_for: ctx.window, modal: true, heading, body});
        for (const [id, label] of responses)
            dialog.add_response(id, label);
        if (destructive)
            dialog.set_response_appearance(destructive, Adw.ResponseAppearance.DESTRUCTIVE);
        if (suggested) {
            dialog.set_response_appearance(suggested, Adw.ResponseAppearance.SUGGESTED);
            dialog.set_default_response(suggested);
        }
        if (extra)
            dialog.set_extra_child(extra);
        dialog.set_close_response(responses[0][0]);
        if (Adw.AlertDialog) {
            dialog.choose(ctx.window, null, (d, res) => resolve(d.choose_finish(res)));
        } else {
            dialog.connect('response', (_d, response) => resolve(response));
            dialog.present();
        }
    });
}

export function fileFilters(...specs) {
    const store = new Gio.ListStore({item_type: Gtk.FileFilter});
    for (const {name, suffixes} of specs) {
        const filter = new Gtk.FileFilter({name});
        suffixes.forEach(s => filter.add_suffix(s));
        store.append(filter);
    }
    return store;
}

/** Pick a file to open; resolves to a Gio.File or null when cancelled. */
export async function pickFile(ctx, title, filters) {
    const dialog = new Gtk.FileDialog({title, modal: true, filters});
    try {
        return await dialog.open(ctx.window, null);
    } catch {
        return null;
    }
}

export async function pickSaveFile(ctx, title, initialName) {
    const dialog = new Gtk.FileDialog({title, modal: true, initial_name: initialName});
    try {
        return await dialog.save(ctx.window, null);
    } catch {
        return null;
    }
}

export async function readFile(file) {
    const [bytes] = await file.load_contents_async(null);
    return new TextDecoder().decode(bytes);
}

export async function writeFile(file, text) {
    await file.replace_contents_bytes_async(
        new GLib.Bytes(new TextEncoder().encode(text)), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
