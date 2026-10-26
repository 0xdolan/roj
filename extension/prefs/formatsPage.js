// SPDX-License-Identifier: GPL-3.0-or-later
// Formats: every strftime pattern Roj uses, with live previews, presets and a
// reference of all tokens rendered in all four calendars.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {CALENDARS, PRESETS, TOKENS} from '../lib/engine.js';
import {ENGINE_KEYS} from '../lib/config.js';
import {N_} from '../lib/i18n.js';
import {isolate} from '../lib/richtext.js';
import {CALENDAR_LABELS, iconButton, prose} from './common.js';

const PATTERNS = [
    {key: 'panel-format', title: N_('Top bar'), calendar: 'kurdish'},
    {key: 'header-format-kurdish', title: N_('Popup header: Kurdish'), calendar: 'kurdish'},
    {key: 'header-format-gregorian', title: N_('Popup header: Gregorian'), calendar: 'gregorian'},
    {key: 'header-format-persian', title: N_('Popup header: Persian'), calendar: 'persian'},
    {key: 'header-format-islamic', title: N_('Popup header: Islamic'), calendar: 'islamic'},
    {key: 'copy-format', title: N_('The Copy button'), calendar: 'kurdish'},
];

// Token and preset descriptions live in the engine, which has no translator.
N_('Year, four digits'); N_('Year, last two digits'); N_('Month name'); N_('Short month name');
N_('Month number, padding follows the leading zero setting'); N_('Month number, never padded');
N_('Day of month, padding follows the leading zero setting'); N_('Day of month, never padded');
N_('Weekday name'); N_('Short weekday name'); N_('Minimal weekday name');
N_('Weekday number: Saturday is 1, or Monday is 1 for Gregorian');
N_('Weekday number from Saturday (1) to Friday (7)');
N_('Hour, 24-hour clock'); N_('Hour, 12-hour clock'); N_('Minute'); N_('Second');
N_('AM or PM in the date language'); N_('A literal % sign');
N_('Full'); N_('Long'); N_('Day and month'); N_('Weekday, day and month'); N_('Short');
N_('Numeric'); N_('ISO style'); N_('Date and time'); N_('12-hour time');

function nowTime() {
    const now = GLib.DateTime.new_now_local();
    return {hour: now.get_hour(), minute: now.get_minute(), second: now.get_second()};
}

const esc = text => GLib.markup_escape_text(text, -1);

export const FormatsPage = GObject.registerClass(
class RojFormatsPage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'formats', title: ctx._('Formats'), icon_name: 'text-x-generic-symbolic'});
        this._ctx = ctx;
        this._previews = [];
        this._buildPatterns();
        this._buildTokens();
        ctx.onChange([...ENGINE_KEYS, 'latin-font', 'arabic-font', ...PATTERNS.map(p => p.key)], () => this._refresh());
        this._refresh();
    }

    _buildPatterns() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Patterns'),
            description: _('Patterns use the same strftime tokens as tsroj and pyroj. Use the list button to insert a token or choose a preset; the preview updates as you type.'),
        });
        this.add(group);

        for (const spec of PATTERNS) {
            const entry = new Adw.EntryRow({title: _(spec.title)});
            // Patterns are always typed left to right.
            entry.set_direction(Gtk.TextDirection.LTR);
            ctx.settings.bind(spec.key, entry, 'text', 0);
            entry.add_suffix(this._insertMenu(entry));
            entry.add_suffix(iconButton('edit-undo-symbolic', _('Restore the default'), () => ctx.settings.reset(spec.key)));
            group.add(entry);

            const preview = new Adw.ActionRow({title: _('Preview'), css_classes: ['property']});
            group.add(preview);
            this._previews.push({spec, preview});
        }
    }

    /** A popover listing presets (replace the pattern) and tokens (insert at the cursor). */
    _insertMenu(entry) {
        const _ = this._ctx._;
        const popover = new Gtk.Popover();
        const scroller = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            propagate_natural_height: true,
            max_content_height: 420,
        });
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2, margin_top: 6, margin_bottom: 6});
        scroller.set_child(box);
        popover.set_child(scroller);

        const heading = text => box.append(new Gtk.Label({
            label: text, xalign: 0, margin_start: 8, margin_top: 6, css_classes: ['heading'],
        }));
        const item = (label, onClick) => {
            const button = new Gtk.Button({css_classes: ['flat']});
            button.set_child(new Gtk.Label({label, use_markup: true, xalign: 0}));
            button.connect('clicked', () => {
                onClick();
                popover.popdown();
            });
            box.append(button);
        };

        heading(_('Presets'));
        for (const p of PRESETS)
            item(`${esc(_(p.name))}  <tt>${esc(p.pattern)}</tt>`, () => (entry.text = p.pattern));
        heading(_('Tokens'));
        for (const t of TOKENS) {
            item(`<tt>${esc(t.token)}</tt>  ${esc(_(t.desc))}`, () => {
                const position = entry.insert_text(t.token, -1, entry.get_position());
                entry.set_position(position);
            });
        }

        return new Gtk.MenuButton({
            icon_name: 'view-list-bullet-symbolic',
            tooltip_text: _('Insert a token or a preset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            popover,
        });
    }

    _buildTokens() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Token reference'),
            description: _('Every token, shown for today in all four calendars with your current languages and options.'),
        });
        this.add(group);
        group.add(prose(`<small>${esc(_('Sorani ezafe (ی) is added only when the pattern has a day and a month name, and only for the calendars where it is switched on.'))}</small>`, ['dim-label']));

        this._tokenRows = TOKENS.map(t => {
            const row = new Adw.ActionRow({title: `<tt>${esc(t.token)}</tt>   ${esc(_(t.desc))}`});
            row.add_suffix(iconButton('edit-copy-symbolic', _('Copy {token}', {token: t.token}),
                () => ctx.copy(t.token, _('Copied {token}', {token: t.token}))));
            group.add(row);
            return {token: t, row};
        });
    }

    _refresh() {
        const ctx = this._ctx;
        const _ = ctx._;
        const e = ctx.engine;
        const jdn = e.todayJdn();
        const time = nowTime();

        for (const {spec, preview} of this._previews) {
            const r = e.tryFormat(jdn, spec.calendar, ctx.settings.get_string(spec.key), time);
            preview.subtitle = r.ok
                ? ctx.markup(r.text || ' ')
                : `<span foreground="#e01b24">${esc(r.error)}</span>`;
        }

        for (const {token, row} of this._tokenRows) {
            const calendars = token.kind === 'time' || token.kind === 'literal' ? ['kurdish'] : CALENDARS;
            row.subtitle = calendars.map(cal => {
                const text = e.format(jdn, cal, token.token, time);
                const label = calendars.length > 1 ? `${esc(_(CALENDAR_LABELS[cal]).split(' ')[0])}: ` : '';
                return `${label}${ctx.markup(isolate(text))}`;
            }).join('  ·  ');
        }
    }
});
