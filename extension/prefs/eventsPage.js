// SPDX-License-Identifier: GPL-3.0-or-later
// Events: display options and event sources. The built-in Kurdish events,
// JSON or .ics files, and online calendars (with one-click holiday feeds).

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {DOCS_URL} from '../lib/constants.js';
import {eventSources, setEventSources} from '../lib/config.js';
import {EventStore} from '../lib/eventStore.js';
import {N_} from '../lib/i18n.js';
import {
    choose, codeBlock, fileFilters, iconButton, pickFile, pickSaveFile, prose, spinRow, switchRow,
    textButton, writeFile,
} from './common.js';

const PALETTE = ['#3584E4', '#2EC27E', '#E66100', '#9141AC', '#E01B24', '#865E3C', '#1C71D8'];

const google = id => `https://calendar.google.com/calendar/ical/${id}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
const SUGGESTED_FEEDS = [
    {name: N_('Holidays in Iraq'), url: google('en.iq')},
    {name: N_('Holidays in Iran'), url: google('en.ir')},
    {name: N_('Holidays in Turkey'), url: google('en.turkish')},
    {name: N_('Holidays in Syria'), url: google('en.sy')},
    {name: N_('Holidays in Germany'), url: google('en.german')},
    {name: N_('Muslim holidays'), url: google('en.islamic')},
];

const EXAMPLE = {
    name: {ckb: 'بۆنەکانی من', kmr: 'Bûyerên min', en: 'My events', fa: 'رویدادهای من', ar: 'مناسباتي'},
    events: [
        {calendar: 'kurdish', month: 1, day: 1, holiday: true,
            title: {ckb: 'نەورۆز', kmr: 'Newroz', en: 'Newroz', fa: 'نوروز', ar: 'نوروز'}},
        {calendar: 'gregorian', month: 5, day: 15, title: {ckb: 'ڕۆژی زمانی کوردی', kmr: 'Roja Zimanê Kurdî', en: 'Kurdish Language Day'}},
        {calendar: 'persian', month: 1, day: 13, title: 'Sizdah Bedar'},
        {calendar: 'islamic', month: 10, day: 1, holiday: true, title: {ckb: 'جەژنی ڕەمەزان', kmr: 'Cejna Remezanê', en: 'Eid al-Fitr', ar: 'عيد الفطر'}},
        {calendar: 'gregorian', year: 2026, month: 12, day: 31, time: '20:00', title: 'A one-off event with a time'},
    ],
};

function rgbaToHex(rgba) {
    const h = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h(rgba.red)}${h(rgba.green)}${h(rgba.blue)}`.toUpperCase();
}

const esc = text => GLib.markup_escape_text(String(text), -1);

export const EventsPage = GObject.registerClass(
class RojEventsPage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'events', title: ctx._('Events'), icon_name: 'x-office-calendar-symbolic'});
        this._ctx = ctx;
        this._rows = [];

        this._store = new EventStore({
            extensionPath: ctx.path,
            settings: ctx.settings,
            engine: ctx.engine,
            onChanged: () => this._renderSources(),
        });
        ctx.addCleanup(() => this._store.destroy());

        this._buildDisplay();
        this._buildSources();
        this._buildFormat();

        ctx.onChange(['event-sources', 'events-enabled', 'locale'], () => this._reload());
        this._reload();
    }

    _reload(force = false) {
        this._renderSources();
        this._store.reload(force).catch(logError);
    }

    _buildDisplay() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({title: _('Display')});
        this.add(group);
        group.add(switchRow(ctx, 'events-enabled', _('Show events'), _('Lists the selected day’s events in the popup')));
        group.add(switchRow(ctx, 'show-event-dots', _('Mark days that have events'), _('A small dot in the corner of the day card')));
        group.add(switchRow(ctx, 'highlight-holidays', _('Colour holidays'), _('Days off are tinted like weekends')));
        const refresh = spinRow(ctx, 'ics-refresh-hours', _('Refresh online calendars every'),
            {min: 1, max: 168, subtitle: _('Hours. Downloaded calendars are kept for offline use.')});
        refresh.add_suffix(iconButton('view-refresh-symbolic', _('Refresh now'), () => {
            this._reload(true);
            ctx.toast(_('Refreshing calendars…'));
        }));
        group.add(refresh);
        group.add(prose(`<small>${esc(_('The top bar can also show today’s events: see Appearance, Top bar.'))}</small>`, ['dim-label']));
    }

    _buildSources() {
        const _ = this._ctx._;
        this._sourcesGroup = new Adw.PreferencesGroup({
            title: _('Sources'),
            description: _('Kurdish events are included. Add your own events as a JSON file, or any calendar as an .ics file or link, such as the public holidays of a country.'),
        });
        this.add(this._sourcesGroup);

        // Always the last row; source rows are inserted before it.
        this._addRow = new Adw.ActionRow({title: _('Add a calendar'), subtitle: _('A JSON or .ics file, or an online calendar')});
        this._addRow.add_prefix(new Gtk.Image({icon_name: 'list-add-symbolic'}));
        this._addRow.add_suffix(textButton(_('File…'), () => this._addFile()));
        this._addRow.add_suffix(this._feedMenu());
    }

    _feedMenu() {
        const _ = this._ctx._;
        const popover = new Gtk.Popover();
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2, margin_top: 6, margin_bottom: 6});
        popover.set_child(box);
        const add = (label, onClick) => {
            const b = new Gtk.Button({label, css_classes: ['flat']});
            b.get_child().xalign = 0;
            b.connect('clicked', () => {
                popover.popdown();
                onClick();
            });
            box.append(b);
        };
        add(_('Enter a link…'), () => this._addUrl());
        box.append(new Gtk.Separator());
        for (const feed of SUGGESTED_FEEDS)
            add(_(feed.name), () => this._addSource({kind: 'url', location: feed.url, name: _(feed.name)}));
        return new Gtk.MenuButton({label: _('Online…'), valign: Gtk.Align.CENTER, popover});
    }

    _renderSources() {
        const ctx = this._ctx;
        const _ = ctx._;
        for (const row of [...this._rows, this._addRow]) {
            if (row.get_parent())
                this._sourcesGroup.remove(row);
        }
        this._rows = [];

        eventSources(ctx.settings).forEach((source, index) => {
            const info = this._store.info.get(source.id);
            const error = this._store.errors.get(source.id);
            const builtin = source.kind === 'builtin';
            const title = builtin ? _('Kurdish events (included)') : source.name || info?.name || source.location;

            let subtitle;
            if (error)
                subtitle = `<span foreground="#e01b24">${esc(error)}</span>`;
            else if (source.enabled === false)
                subtitle = esc(_('Off'));
            else if (info)
                subtitle = esc(_('{count} events', {count: info.count}));
            else
                subtitle = esc(_('Loading…'));
            if (!builtin) {
                const where = source.kind === 'url' ? source.location.replace(/^https?:\/\//, '').slice(0, 60) : source.location;
                subtitle += ` · ${esc(where)}`;
            }

            const row = new Adw.ActionRow({title: esc(title), subtitle});
            row.add_prefix(new Gtk.Image({
                icon_name: source.kind === 'url' ? 'web-browser-symbolic' : builtin ? 'x-office-calendar-symbolic' : 'text-x-generic-symbolic',
            }));

            const color = new Gtk.ColorDialogButton({
                dialog: new Gtk.ColorDialog({with_alpha: false}),
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Colour of the event marker'),
            });
            const rgba = new Gdk.RGBA();
            rgba.parse(source.color ?? '#F5CD0E');
            color.rgba = rgba;
            color.connect('notify::rgba', () => this._update(index, {color: rgbaToHex(color.rgba)}));
            row.add_suffix(color);

            if (!builtin) {
                const holidays = new Gtk.ToggleButton({
                    icon_name: 'weather-clear-symbolic',
                    tooltip_text: _('Treat every event in this calendar as a holiday'),
                    valign: Gtk.Align.CENTER,
                    active: !!source.allHolidays,
                    css_classes: ['flat'],
                });
                holidays.connect('toggled', () => this._update(index, {allHolidays: holidays.active}));
                row.add_suffix(holidays);
            } else {
                row.add_suffix(iconButton('document-open-symbolic', _('Open the included file'), () => {
                    new Gtk.FileLauncher({file: Gio.File.new_for_path(this._store.builtinPath())})
                        .launch(ctx.window, null, null);
                }));
            }

            const toggle = new Gtk.Switch({active: source.enabled !== false, valign: Gtk.Align.CENTER});
            toggle.connect('notify::active', () => this._update(index, {enabled: toggle.active}));
            row.add_suffix(toggle);

            if (!builtin)
                row.add_suffix(iconButton('user-trash-symbolic', _('Remove'), () => this._remove(index)));

            this._sourcesGroup.add(row);
            this._rows.push(row);
        });
        this._sourcesGroup.add(this._addRow);
    }

    _update(index, changes) {
        const sources = eventSources(this._ctx.settings);
        const current = sources[index];
        if (!current || Object.entries(changes).every(([k, v]) => current[k] === v))
            return;
        sources[index] = {...current, ...changes};
        setEventSources(this._ctx.settings, sources);
    }

    async _remove(index) {
        const ctx = this._ctx;
        const _ = ctx._;
        const sources = eventSources(ctx.settings);
        const source = sources[index];
        const answer = await choose(ctx, _('Remove this calendar?'),
            _('{name} will no longer be shown. The file itself is not deleted.', {name: source.name || source.location}),
            [['cancel', _('Cancel')], ['remove', _('Remove')]], {destructive: 'remove'});
        if (answer !== 'remove')
            return;
        sources.splice(index, 1);
        setEventSources(ctx.settings, sources);
    }

    _addSource(source) {
        const ctx = this._ctx;
        const _ = ctx._;
        const sources = eventSources(ctx.settings);
        if (sources.some(s => s.location === source.location)) {
            ctx.toast(_('That calendar is already added'));
            return;
        }
        const color = PALETTE[(sources.length - 1) % PALETTE.length];
        sources.push({id: `${source.kind}-${GLib.uuid_string_random().slice(0, 8)}`, enabled: true, color, ...source});
        setEventSources(ctx.settings, sources);
        ctx.toast(_('Added {name}', {name: source.name || GLib.path_get_basename(source.location)}));
    }

    async _addFile() {
        const _ = this._ctx._;
        const file = await pickFile(this._ctx, _('Add events or a calendar'), fileFilters(
            {name: _('Events and calendars'), suffixes: ['json', 'ics', 'ical']},
            {name: _('JSON events'), suffixes: ['json']},
            {name: _('iCalendar'), suffixes: ['ics', 'ical']}));
        if (file)
            this._addSource({kind: 'file', location: file.get_path()});
    }

    async _addUrl() {
        const ctx = this._ctx;
        const _ = ctx._;
        const entry = new Gtk.Entry({
            placeholder_text: 'https://… webcal://…',
            activates_default: true,
            width_chars: 40,
        });
        entry.set_direction(Gtk.TextDirection.LTR);
        const response = await choose(ctx, _('Add an online calendar'), _('Paste the address of an .ics calendar.'),
            [['cancel', _('Cancel')], ['add', _('Add')]], {suggested: 'add', extra: entry});
        const url = entry.text.trim();
        if (response !== 'add' || !url)
            return;
        if (!/^(https?|webcal):\/\//i.test(url)) {
            ctx.toast(_('The link must start with https://, http:// or webcal://'));
            return;
        }
        this._addSource({kind: 'url', location: url});
    }

    _buildFormat() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Writing your own events'),
            description: _('A JSON file lists events by calendar, month and day. A title can be one text, or one per language.'),
        });
        this.add(group);
        group.add(codeBlock([
            '{ "name": "My events",',
            '  "events": [',
            '    { "calendar": "kurdish", "month": 1, "day": 1,',
            '      "holiday": true,',
            '      "title": { "ckb": "نەورۆز", "kmr": "Newroz", "en": "Newroz" } },',
            '    { "calendar": "gregorian", "year": 2026,',
            '      "month": 12, "day": 31, "time": "20:00",',
            '      "title": "A one-off event" } ] }',
        ].join('\n')));
        group.add(prose(`<small>${esc(_('calendar: kurdish, gregorian, persian or islamic. year: leave it out for every year. holiday: true colours the day like a weekend. Titles can be ckb, kmr, en, fa and ar. time and description are optional.'))}</small>`, ['dim-label']));

        const actions = new Adw.PreferencesGroup();
        this.add(actions);
        const example = new Adw.ActionRow({title: _('Example file'), subtitle: _('A starting point with one event in each calendar')});
        example.add_suffix(textButton(_('Save…'), async () => {
            const file = await pickSaveFile(ctx, _('Save the example events'), 'my-events.json');
            if (file) {
                await writeFile(file, `${JSON.stringify(EXAMPLE, null, 2)}\n`);
                ctx.toast(_('Saved {file}', {file: file.get_basename()}));
            }
        }));
        actions.add(example);

        const docs = new Adw.ActionRow({title: _('Full reference'), subtitle: _('Event format, .ics support and examples'), activatable: true});
        docs.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        docs.connect('activated', () => ctx.openUri(`${DOCS_URL}#events`));
        actions.add(docs);
    }
});
