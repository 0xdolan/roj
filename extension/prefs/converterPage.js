// SPDX-License-Identifier: GPL-3.0-or-later
// Converter: enter a date in any of the four calendars and see it in all of
// them, formatted with your patterns, plus weekday, day number and distance.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {CALENDARS} from '../lib/engine.js';
import {ENGINE_KEYS} from '../lib/config.js';
import {isolate, ltrLine} from '../lib/richtext.js';
import {CALENDAR_LABELS, iconButton, textButton} from './common.js';

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const ConverterPage = GObject.registerClass(
class RojConverterPage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'converter', title: ctx._('Converter'), icon_name: 'media-playlist-repeat-symbolic'});
        this._ctx = ctx;
        this._calendar = 'gregorian';
        this._jdn = ctx.engine.todayJdn();
        this._syncing = false;

        this._buildInput();
        this._buildResults();
        this._loadInputs();
        this._render();
        ctx.onChange([...ENGINE_KEYS, 'latin-font', 'arabic-font', ...CALENDARS.map(c => `header-format-${c}`)], () => {
            this._loadInputs();
            this._render();
        });
    }

    _buildInput() {
        const _ = this._ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Date'),
            description: _('Choose the calendar your date is in, then set the year, month and day, or type it as YYYY-MM-DD.'),
        });
        group.set_header_suffix(textButton(_('Today'), () => {
            this._jdn = this._ctx.engine.todayJdn();
            this._loadInputs();
            this._render();
        }, ['flat']));
        this.add(group);

        this._calendarRow = new Adw.ComboRow({
            title: _('Calendar'),
            model: Gtk.StringList.new(CALENDARS.map(c => _(CALENDAR_LABELS[c]))),
            selected: CALENDARS.indexOf(this._calendar),
        });
        this._calendarRow.connect('notify::selected', () => {
            this._calendar = CALENDARS[this._calendarRow.selected];
            this._loadInputs();
            this._render();
        });
        group.add(this._calendarRow);

        this._quick = new Adw.EntryRow({title: _('Type a date (YYYY-MM-DD)'), show_apply_button: true});
        this._quick.set_direction(Gtk.TextDirection.LTR);
        this._quick.connect('apply', () => this._applyQuick());
        this._quick.connect('entry-activated', () => this._applyQuick());
        group.add(this._quick);

        const spin = (title, min, max) => {
            const row = Adw.SpinRow.new_with_range(min, max, 1);
            row.title = title;
            row.connect('notify::value', () => this._fromInputs());
            group.add(row);
            return row;
        };
        this._year = spin(_('Year'), 1, 9999);
        this._month = spin(_('Month'), 1, 12);
        this._day = spin(_('Day'), 1, 31);

        this._error = new Gtk.Label({css_classes: ['error'], xalign: 0, visible: false, margin_top: 6});
        group.add(this._error);
    }

    _buildResults() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({title: _('In every calendar')});
        this.add(group);

        this._results = {};
        for (const cal of CALENDARS) {
            const row = new Adw.ActionRow({title: _(CALENDAR_LABELS[cal]), css_classes: ['property']});
            const numeric = new Gtk.Label({css_classes: ['dim-label', 'monospace'], valign: Gtk.Align.CENTER});
            row.add_suffix(numeric);
            row.add_suffix(iconButton('edit-copy-symbolic', _('Copy'), () => ctx.copy(row._plain ?? '')));
            group.add(row);
            this._results[cal] = {row, numeric};
        }

        const extra = new Adw.PreferencesGroup({title: _('Details')});
        this.add(extra);
        this._weekday = new Adw.ActionRow({title: _('Weekday'), css_classes: ['property']});
        this._relative = new Adw.ActionRow({title: _('From today'), css_classes: ['property']});
        this._monthInfo = new Adw.ActionRow({title: _('Kurdish month'), css_classes: ['property']});
        this._julian = new Adw.ActionRow({title: _('Julian Day Number'), css_classes: ['property']});
        for (const row of [this._weekday, this._relative, this._monthInfo, this._julian])
            extra.add(row);
    }

    /** Fill the inputs from the current JDN in the selected calendar. */
    _loadInputs() {
        const [y, m, d] = this._ctx.engine.dateIn(this._calendar, this._jdn);
        this._syncing = true;
        this._year.value = y;
        this._month.value = m;
        this._day.adjustment.upper = this._ctx.engine.monthLength(this._calendar, y, m);
        this._day.value = d;
        this._quick.text = iso(y, m, d);
        this._syncing = false;
    }

    _fromInputs() {
        if (this._syncing)
            return;
        const e = this._ctx.engine;
        const y = this._year.value;
        const m = this._month.value;
        try {
            const length = e.monthLength(this._calendar, y, m);
            this._syncing = true;
            this._day.adjustment.upper = length;
            if (this._day.value > length)
                this._day.value = length;
            this._syncing = false;
            this._jdn = e.toJdn(this._calendar, y, m, this._day.value);
            this._quick.text = iso(y, m, this._day.value);
            this._error.visible = false;
        } catch (err) {
            this._syncing = false;
            this._error.label = err.message;
            this._error.visible = true;
        }
        this._render();
    }

    _applyQuick() {
        const _ = this._ctx._;
        const match = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(this._quick.text);
        if (!match) {
            this._error.label = _('Use the form YYYY-MM-DD, for example 2726-01-01');
            this._error.visible = true;
            return;
        }
        try {
            this._jdn = this._ctx.engine.toJdn(this._calendar, +match[1], +match[2], +match[3]);
            this._error.visible = false;
            this._loadInputs();
            this._render();
        } catch (err) {
            this._error.label = err.message;
            this._error.visible = true;
        }
    }

    _render() {
        const ctx = this._ctx;
        const _ = ctx._;
        const e = ctx.engine;
        const jdn = this._jdn;
        for (const cal of CALENDARS) {
            const {row, numeric} = this._results[cal];
            const r = e.tryFormat(jdn, cal, ctx.settings.get_string(`header-format-${cal}`));
            row._plain = r.ok ? r.text : '';
            row.subtitle = r.ok ? ctx.markup(r.text, {size: 'large'}) : GLib.markup_escape_text(r.error, -1);
            numeric.label = iso(...e.dateIn(cal, jdn));
        }

        this._weekday.subtitle = ctx.markup(e.format(jdn, 'kurdish', '%A'));
        const diff = jdn - e.todayJdn();
        this._relative.subtitle = diff === 0 ? _('Today')
            : diff > 0 ? _('In {n} days', {n: diff}) : _('{n} days ago', {n: -diff});
        this._julian.subtitle = String(Math.floor(jdn + 0.5));

        const [ky, km] = e.dateIn('kurdish', jdn);
        const length = e.monthLength('kurdish', ky, km);
        const name = locale => e.with({locale}).format(jdn, 'kurdish', '%B');
        const names = ltrLine(`${isolate(name('ckb'))} · ${isolate(name('kmr'))}`);
        this._monthInfo.subtitle = `${ctx.markup(names)}  ${GLib.markup_escape_text(_('Month {month}, {days} days', {month: km, days: length}), -1)}`;
    }
});
