// SPDX-License-Identifier: GPL-3.0-or-later
// Panel button: shows the formatted Kurdish date and owns the popup, the
// clock, the event store and every settings connection.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {RojEngine} from '../lib/engine.js';
import {ENGINE_KEYS, customFonts, engineOptions, fontsFromSettings, prefersDark} from '../lib/config.js';
import {localizedText} from '../lib/i18n.js';
import {EventStore} from '../lib/eventStore.js';
import {bundledFontPaths, registerFonts} from '../lib/fonts.js';
import {CalendarView} from './calendarView.js';
import {setRichText} from './text.js';

const EVENT_KEYS = ['events-enabled', 'event-sources', 'ics-refresh-hours'];

export const RojIndicator = GObject.registerClass(
class RojIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Roj Kurdish Calendar');
        this._extension = extension;
        this._settings = extension.getSettings();
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._tickId = 0;

        this._registerFonts();
        this._engine = new RojEngine(engineOptions(this._settings));

        // Panel content
        const panelBox = new St.BoxLayout({style_class: 'panel-status-menu-box roj-panel-box'});
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(GLib.build_filenamev([extension.path, 'icons', 'roj-symbolic.svg'])),
            style_class: 'system-status-icon roj-panel-icon',
        });
        this._label = new St.Label({style_class: 'roj-panel-label', y_align: Clutter.ActorAlign.CENTER});
        // Shown when today has events: a dot, a count or the first title.
        this._eventDot = new St.Widget({style_class: 'roj-panel-dot', y_align: Clutter.ActorAlign.CENTER, visible: false});
        this._eventLabel = new St.Label({style_class: 'roj-panel-event', y_align: Clutter.ActorAlign.CENTER, visible: false});
        panelBox.add_child(this._icon);
        panelBox.add_child(this._label);
        panelBox.add_child(this._eventDot);
        panelBox.add_child(this._eventLabel);
        this.add_child(panelBox);

        // Popup
        this._events = new EventStore({
            extensionPath: extension.path,
            settings: this._settings,
            engine: this._engine,
            onChanged: () => {
                this._view?.refresh();
                this._updateEventMarker();
            },
        });
        this._view = new CalendarView({
            settings: this._settings,
            engine: this._engine,
            events: this._events,
            version: extension.metadata['version-name'] ?? String(extension.metadata.version ?? ''),
            extensionPath: extension.path,
            actions: {
                openPrefs: page => this._openPrefs(page),
                openUri: uri => this._openUri(uri),
            },
        });
        this.menu.box.add_style_class_name('roj-menu');
        this.menu.box.add_child(this._view);
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._view.showToday();
        });

        this._settings.connectObject('changed', (_s, key) => this._onSettingChanged(key), this);
        this._interfaceSettings.connectObject('changed::color-scheme', () => this._applyTheme(), this);

        this._applyTheme();
        this._updatePanel();
        this._events.reload().catch(logError);
    }

    // Settings
    _onSettingChanged(key) {
        if (key === 'prefs-page' || key === 'panel-position' || key === 'panel-index')
            return; // handled by the extension (re-adds the button) or the prefs window

        if (ENGINE_KEYS.includes(key))
            this._engine.setOptions(engineOptions(this._settings));
        if (key === 'custom-fonts')
            this._registerFonts();
        if (key === 'theme') {
            this._applyTheme();
            return;
        }
        if (EVENT_KEYS.includes(key) || key === 'locale') {
            this._events.reload().catch(logError);
            if (key !== 'locale')
                return;
        }
        this._updatePanel();
        this._view.refresh();
    }

    _registerFonts() {
        const fontMap = this._label?.get_pango_context().get_font_map() ??
            global.stage.get_pango_context().get_font_map();
        const paths = [
            ...bundledFontPaths(this._extension.path),
            ...customFonts(this._settings).map(f => f.path),
        ];
        registerFonts(fontMap, paths);
    }

    _applyTheme() {
        const dark = prefersDark(this._settings.get_string('theme'), this._interfaceSettings);
        for (const actor of [this.menu.box, this._view]) {
            actor.remove_style_class_name(dark ? 'roj-light' : 'roj-dark');
            actor.add_style_class_name(dark ? 'roj-dark' : 'roj-light');
        }
    }

    // Clock
    _now() {
        const now = RojEngine.clock();
        return {
            jdn: this._engine.todayJdn(now),
            time: {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()},
        };
    }

    _updatePanel() {
        const {jdn, time} = this._now();
        if (this._lastJdn !== undefined && jdn !== this._lastJdn)
            this._view.setToday(jdn);
        this._lastJdn = jdn;

        const showText = this._settings.get_boolean('panel-show-text');
        const pattern = this._settings.get_string('panel-format');
        const result = this._engine.tryFormat(jdn, 'kurdish', pattern, time);
        this._label.visible = showText;
        this._icon.visible = this._settings.get_boolean('panel-show-icon') || !showText;
        setRichText(this._label, result.ok ? result.text : '⚠', fontsFromSettings(this._settings));
        this._updateEventMarker();

        this._scheduleTick(pattern);
    }

    _updateEventMarker() {
        if (!this._events || this._lastJdn === undefined)
            return;
        const mode = this._settings.get_string('panel-event-indicator');
        const events = mode === 'off' ? [] : this._events.index.eventsOn(this._lastJdn);
        const holiday = events.some(e => e.holiday);
        for (const actor of [this._eventDot, this._eventLabel]) {
            if (holiday)
                actor.add_style_class_name('roj-panel-holiday');
            else
                actor.remove_style_class_name('roj-panel-holiday');
        }
        this._eventDot.visible = events.length > 0 && mode === 'dot';
        this._eventLabel.visible = events.length > 0 && (mode === 'count' || mode === 'title');
        if (!this._eventLabel.visible)
            return;

        let text;
        if (mode === 'count') {
            text = this._engine.number(events.length);
        } else {
            const max = this._settings.get_int('panel-event-length');
            const chars = [...localizedText(events[0].title, this._engine.locale)];
            text = chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
            if (events.length > 1)
                text += ` +${this._engine.number(events.length - 1)}`;
        }
        if (mode === 'count')
            this._eventLabel.add_style_class_name('roj-panel-count');
        else
            this._eventLabel.remove_style_class_name('roj-panel-count');
        setRichText(this._eventLabel, text, fontsFromSettings(this._settings));
    }

    _scheduleTick(pattern) {
        if (this._tickId)
            GLib.source_remove(this._tickId);
        // Wake on the next second or minute boundary, so the date flips exactly at
        // midnight and the time (when shown) stays in step with the top-bar clock.
        const now = GLib.DateTime.new_now_local();
        const ms = RojEngine.needsSeconds(pattern)
            ? 1000 - Math.floor(now.get_microsecond() / 1000)
            : (60 - now.get_second()) * 1000 - Math.floor(now.get_microsecond() / 1000);
        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(ms, 50), () => {
            this._tickId = 0;
            this._updatePanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Actions
    _openPrefs(page) {
        this.menu.close();
        this._settings.set_string('prefs-page', page);
        this._extension.openPreferences();
    }

    _openUri(uri) {
        this.menu.close();
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (e) {
            Main.notifyError('Roj', e.message);
        }
    }

    destroy() {
        if (this._tickId)
            GLib.source_remove(this._tickId);
        this._tickId = 0;
        this._settings.disconnectObject(this);
        this._interfaceSettings.disconnectObject(this);
        this._events.destroy();
        this._events = null;
        this._view = null;
        this._settings = null;
        this._interfaceSettings = null;
        super.destroy();
    }
});
