// SPDX-License-Identifier: GPL-3.0-or-later
// Guide: how the Kurdish calendar works and how Roj converts dates, with
// examples computed live from today's date and the user's settings.

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ENGINE_KEYS} from '../lib/config.js';
import {isolate, ltrLine} from '../lib/richtext.js';
import {codeBlock, prose, textButton} from './common.js';

const pad = n => String(n).padStart(2, '0');
const iso = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;

export const GuidePage = GObject.registerClass(
class RojGuidePage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'guide', title: ctx._('Guide'), icon_name: 'help-browser-symbolic'});
        this._ctx = ctx;
        this._groups = [];
        this._render();
        ctx.onChange([...ENGINE_KEYS, 'latin-font', 'arabic-font'], () => this._render());
    }

    _group(title, description = '') {
        const group = new Adw.PreferencesGroup({title, description});
        this.add(group);
        this._groups.push(group);
        return group;
    }

    _row(group, title, subtitle) {
        const row = new Adw.ActionRow({title, subtitle, css_classes: ['property']});
        group.add(row);
        return row;
    }

    _render() {
        for (const group of this._groups.splice(0))
            this.remove(group);

        const ctx = this._ctx;
        const _ = ctx._;
        const e = ctx.engine;
        const ckb = e.with({locale: 'ckb'});
        const kmr = e.with({locale: 'kmr'});
        // Several scripts on one line: isolate each piece and keep the line LTR.
        const mix = (...parts) => ctx.markup(ltrLine(parts.map(isolate).join('  ·  ')));
        const offset = e.options.era === 'nineveh' ? 1233 : 1321;

        // What it is
        let g = this._group(_('The Kurdish solar calendar'));
        g.add(prose(_('The Kurdish calendar follows the sun. Each year begins at <b>Newroz</b>, the March equinox, usually on 21 March. The first month is itself called Newroz, or Xakelêwe (خاکەلێوە); choose the names you prefer under General, Names.')));
        g.add(prose(_('Its months have the same lengths as the Persian (Jalali) calendar: the first six have <b>31 days</b>, the next five have <b>30 days</b>, and the last has <b>29 days</b>, or 30 in a leap year. Roj places leap years with the arithmetic 2820-year cycle of tsroj.')));
        g.add(prose(_('Only the year number differs. Roj counts from the Median kingdom (700 BC): <b>Kurdish year = Persian year + 1321</b>. Some writers count from the fall of Nineveh (612 BC), which is Persian year + 1233. Choose it under General, Year numbering.')));

        // How conversion works, live for today
        const today = e.todayJdn();
        const dates = e.allDates(today);
        g = this._group(_('How Roj converts a date'),
            _('Every calendar is converted through one number: the day count astronomers use. Here is today, step by step.'));
        this._row(g, _('1. Start from the Gregorian date of your computer'), iso(dates.gregorian));
        this._row(g, _('2. Turn it into a Julian Day Number (days since 4713 BC)'), String(Math.floor(today + 0.5)));
        this._row(g, _('3. Compute the Persian date from that number'), iso(dates.persian));
        this._row(g, _('4. Add {offset} to the year: that is the Kurdish date', {offset}),
            mix(iso(dates.kurdish), ckb.format(today, 'kurdish', '%d %B %Y'), kmr.format(today, 'kurdish', '%d %B %Y')));
        this._row(g, _('5. The Islamic date comes from the same number (30-year arithmetic cycle)'),
            e.options.islamicOffset
                ? `${iso(dates.islamic)}  ${_('(adjusted by {n} days)', {n: e.options.islamicOffset})}`
                : iso(dates.islamic));
        g.add(prose(`<small>${_('Going the other way works the same: any calendar, then the day number, then any other calendar. The mathematics comes from the tsroj library, the same engine as pyroj for Python.')}</small>`, ['dim-label']));

        // Fixed example
        const sample = e.toJdn('gregorian', 2026, 6, 26);
        g = this._group(_('Example: 26 June 2026'));
        this._row(g, _('Kurdish in Sorani'), ctx.markup(ckb.format(sample, 'kurdish', '%A %d %B %Y')));
        this._row(g, _('Kurdish in Kurmanji'), ctx.markup(kmr.format(sample, 'kurdish', '%A %d %B %Y')));
        this._row(g, _('Persian'), mix(iso(e.dateIn('persian', sample)), e.format(sample, 'persian', '%d %B %Y')));
        this._row(g, _('Islamic'), mix(iso(e.dateIn('islamic', sample)), e.format(sample, 'islamic', '%d %B %Y')));

        // Months
        const [ky] = dates.kurdish;
        g = this._group(_('The twelve months of {year}', {year: ky}), _('Start dates are for this Kurdish year.'));
        const english = e.with({locale: 'en', secondaryLanguage: 'native'});
        for (let month = 1; month <= 12; month++) {
            const first = e.toJdn('kurdish', ky, month, 1);
            const length = e.monthLength('kurdish', ky, month);
            this._row(g, mix(`${month}.`, ckb.format(first, 'kurdish', '%B'), kmr.format(first, 'kurdish', '%B')),
                _('{days} days, from {date}', {days: length, date: english.format(first, 'gregorian', '%-d %B %Y')}));
        }

        // Patterns
        g = this._group(_('Date patterns'),
            _('The top bar, the popup header and the Copy button each use a pattern made of strftime tokens.'));
        const show = (pattern, engine) => this._row(g, `<tt>${pattern}</tt>`, ctx.markup(engine.format(today, 'kurdish', pattern)));
        show('%A %d %B %Y', ckb);
        show('%d %B %Y', kmr);
        show('%Y/%m/%d', ckb);
        g.add(prose(`<small>${_('Sorani adds the ezafe ی after the day when a month name follows (٥ی پووشپەڕ), and after the month when a year follows (پووشپەڕی ٢٧٢٦). Turn it on or off for each calendar under General.')}</small>`, ['dim-label']));
        const formats = textButton(_('Open the token reference'), () => ctx.window.set_visible_page_name('formats'), ['pill']);
        formats.halign = Gtk.Align.START;
        formats.margin_top = 6;
        g.add(formats);

        // Using the popup
        g = this._group(_('Using the popup'));
        g.add(prose([
            _('<b>Click a day</b> to see it in every calendar and list its events.'),
            _('<b>Scroll</b> over the days, or use the arrows, to change month; the outer arrows move a year.'),
            _('<b>Click the month name</b> to return to today.'),
            _('The <b>small coloured numbers</b> in each day are the Gregorian (blue), Persian (green) and Islamic (purple) days. Choose them under Appearance.'),
            _('<b>Copy</b> puts the selected day on the clipboard using the Copy pattern; <b>Convert</b> opens the converter.'),
            _('When today has events, the top bar shows a marker next to the date.'),
        ].map(line => `•  ${line}`).join('\n')));

        // Command line
        g = this._group(_('Command line'), _('The same engine works in a terminal as roj. Install it from the About page.'));
        g.add(codeBlock([
            'roj                          # today in all four calendars',
            'roj cal                      # this Kurdish month as a grid',
            'roj convert 2026-06-26 --from gregorian',
            'roj format "%A %d %B %Y" --locale kmr',
            'roj events --month           # events this month',
            'roj tokens                   # every pattern token',
        ].join('\n')));
    }
});
