// SPDX-License-Identifier: GPL-3.0-or-later
// General: languages, digits, Sorani grammar, name variants, week layout,
// Islamic day adjustment and settings backup.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {getLocaleData} from '../lib/tsroj.js';
import {CALENDARS, DIGIT_SETS, LOCALES, RojEngine} from '../lib/engine.js';
import {exportSettings, importSettings, resetSettings} from '../lib/config.js';
import {LANGUAGE_NAMES, N_} from '../lib/i18n.js';
import {
    CALENDAR_LABELS, choose, comboRow, fileFilters, pickFile, pickSaveFile, readFile, spinRow,
    switchRow, textButton, writeFile,
} from './common.js';

const WEEKDAYS = [
    [6, N_('Sat')], [0, N_('Sun')], [1, N_('Mon')], [2, N_('Tue')], [3, N_('Wed')], [4, N_('Thu')], [5, N_('Fri')],
];

const LANGUAGE_LABELS = {
    ckb: N_('Sorani'),
    kmr: N_('Kurmanji'),
    en: N_('English'),
    fa: N_('language|Persian'),
    ar: N_('language|Arabic'),
};

/** "Sorani · کوردی (سۆرانی)": the language in the interface language and in itself. */
function languageLabel(_, code) {
    const own = LANGUAGE_NAMES[code];
    const translated = _(LANGUAGE_LABELS[code]);
    return translated === own ? own : `${translated} · ${own}`;
}

/** Options for the month or weekday name variants of a Kurdish-calendar language. */
function variantOptions(_, locale, field) {
    // Persian and Arabic dates use the Sorani month names.
    const source = locale === 'fa' || locale === 'ar' ? 'ckb' : locale;
    const entries = getLocaleData(source, 'kurdish')[field];
    const count = Math.max(...entries.map(e => e.names.length));
    const options = [];
    for (let i = 0; i < count; i++) {
        const names = i === 0
            ? entries.map(e => e.names[0])
            : entries.filter(e => e.names[i]).map(e => e.names[i]);
        const sample = names.slice(0, 4).join(source === 'ckb' ? '، ' : ', ');
        const more = names.length > 4 ? ' …' : '';
        const label = i === 0 ? _('Default') : _('Variant {n}', {n: i});
        options.push({value: i, label: `${label}: ${sample}${more}`});
    }
    return options;
}

export const GeneralPage = GObject.registerClass(
class RojGeneralPage extends Adw.PreferencesPage {
    _init(ctx) {
        const _ = ctx._;
        super._init({name: 'general', title: _('General'), icon_name: 'preferences-system-symbolic'});
        this._ctx = ctx;
        this._buildLanguage();
        this._buildDigits();
        this._buildGrammar();
        this._buildWeek();
        this._buildIslamic();
        this._buildBackup();
    }

    _buildLanguage() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Languages'),
            description: _('Choose the language of the Kurdish date, of the other calendars and of the interface.'),
        });
        this.add(group);

        group.add(comboRow(ctx, 'locale', _('Main date language'),
            LOCALES.map(code => ({value: code, label: languageLabel(_, code)})),
            _('The language of the Kurdish date in the top bar and the popup')));

        group.add(comboRow(ctx, 'secondary-language', _('Other calendars'), [
            {value: 'same', label: _('Same as the main date')},
            {value: 'interface', label: _('Same as the interface')},
            {value: 'native', label: _('Each in its own language')},
        ], _('Own language: Gregorian in English, Persian in Persian, Islamic in Arabic')));

        group.add(comboRow(ctx, 'ui-language', _('Interface language'), [
            {value: 'auto', label: _('Same as the main date')},
            ...LOCALES.map(code => ({value: code, label: languageLabel(_, code)})),
        ], _('Menus, labels and this window')));

        const today = ctx.engine.todayJdn();
        const year = era => new RojEngine({era}).dateIn('kurdish', today)[0];
        group.add(comboRow(ctx, 'era', _('Year numbering'), [
            {value: 'solar', label: _('Kurdish solar: Persian year + 1321 ({year})', {year: year('solar')})},
            {value: 'nineveh', label: _('Fall of Nineveh: Persian year + 1233 ({year})', {year: year('nineveh')})},
        ], _('Months and days stay the same; only the year number changes')));
    }

    _buildDigits() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Digits'),
            description: _('Each calendar\'s numbers use the digits of its own language: Gregorian English 012, Persian Persian ۰۱۲, Islamic Arabic ٠١٢, and the Kurdish date the main language. Choose other digits for a language here.'),
        });
        this.add(group);
        const sample = set => DIGIT_SETS[set].slice(0, 4).join('');
        for (const code of LOCALES) {
            group.add(comboRow(ctx, `digits-${code}`, languageLabel(_, code), [
                {value: 'native', label: _('Own digits')},
                {value: 'latin', label: `${_('Western')} ${sample('latin')}`},
                {value: 'arabic', label: `${_('digits|Arabic')} ${sample('arabic')}`},
                {value: 'persian', label: `${_('digits|Persian')} ${sample('persian')}`},
            ]));
        }
        group.add(comboRow(ctx, 'leading-zero', _('Leading zero'), [
            {value: 'auto', label: _('Automatic: off for Sorani, Persian and Arabic')},
            {value: 'on', label: _('Always (05)')},
            {value: 'off', label: _('Never (5)')},
        ], _('For %d, %m and the hour')));
    }

    _buildGrammar() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Sorani ezafe (ی)'),
            description: _('The linking ی as Sorani writes it: ٥ی پووشپەڕی ٢٧٢٦. It applies only to dates written in Sorani, and is on for the Kurdish date only by default.'),
        });
        this.add(group);

        for (const cal of CALENDARS)
            group.add(switchRow(ctx, `ezafe-${cal}`, _(CALENDAR_LABELS[cal])));
        group.add(switchRow(ctx, 'ezafe-after-day', _('After the day number'), _('When a month name follows: ٥ی پووشپەڕ')));
        group.add(switchRow(ctx, 'ezafe-on-month', _('After the month name'), _('When a year follows: پووشپەڕی ٢٧٢٦')));

        const names = new Adw.PreferencesGroup({title: _('Names')});
        this.add(names);
        const monthVariant = comboRow(ctx, 'month-variant', _('Kurdish month names'), [], _('Some months have more than one traditional name'));
        const weekdayVariant = comboRow(ctx, 'weekday-variant', _('Weekday names'), []);
        names.add(monthVariant);
        names.add(weekdayVariant);

        const sync = () => {
            const locale = ctx.settings.get_string('locale');
            monthVariant.setOptions(variantOptions(_, locale, 'months'));
            weekdayVariant.setOptions(variantOptions(_, locale, 'weekdays'));
            weekdayVariant.visible = locale !== 'fa' && locale !== 'ar';
        };
        sync();
        ctx.onChange(['locale'], sync);
    }

    _buildWeek() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({title: _('Week')});
        this.add(group);

        group.add(comboRow(ctx, 'week-start', _('First day of the week'), [
            {value: 6, label: _('Saturday')},
            {value: 0, label: _('Sunday')},
            {value: 1, label: _('Monday')},
        ]));

        const row = new Adw.ActionRow({title: _('Weekend'), subtitle: _('Shown in red in the calendar')});
        const box = new Gtk.Box({spacing: 4, valign: Gtk.Align.CENTER, css_classes: ['linked']});
        const toggles = WEEKDAYS.map(([day, label]) => {
            const toggle = new Gtk.ToggleButton({label: _(label)});
            toggle.connect('toggled', () => {
                const days = new Set(ctx.settings.get_value('weekend-days').deepUnpack());
                if (toggle.active)
                    days.add(day);
                else
                    days.delete(day);
                const next = [...days].sort();
                if (next.join() !== ctx.settings.get_value('weekend-days').deepUnpack().sort().join())
                    ctx.settings.set_value('weekend-days', new GLib.Variant('ai', next));
            });
            box.append(toggle);
            return [day, toggle];
        });
        const sync = () => {
            const days = new Set(ctx.settings.get_value('weekend-days').deepUnpack());
            for (const [day, toggle] of toggles)
                toggle.active = days.has(day);
        };
        sync();
        ctx.onChange(['weekend-days'], sync);
        row.add_suffix(box);
        group.add(row);
    }

    _buildIslamic() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Islamic calendar'),
            description: _('Roj uses the arithmetic (tabular) Hijri calendar. Where months begin with the sighting of the moon, dates can differ by a day or two; adjust them here.'),
        });
        this.add(group);
        const row = spinRow(ctx, 'islamic-offset', _('Day adjustment'), {min: -3, max: 3});
        const preview = () => {
            const e = ctx.engine;
            row.subtitle = ctx.markup(_('Today: {date}', {date: e.format(e.todayJdn(), 'islamic', '%-d %B %Y')}));
        };
        preview();
        ctx.onChange(['islamic-offset', 'locale', 'secondary-language', 'digits-ar', 'digits-fa', 'digits-ckb', 'digits-kmr', 'digits-en'], preview);
        group.add(row);
    }

    _buildBackup() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Backup and restore'),
            description: _('Save every Roj setting to a file, and load it on another computer or after a fresh install.'),
        });
        this.add(group);

        const exportRow = new Adw.ActionRow({title: _('Export settings'), subtitle: _('Saves a .json file')});
        exportRow.add_suffix(textButton(_('Export…'), () => this._export()));
        group.add(exportRow);

        const importRow = new Adw.ActionRow({title: _('Import settings'), subtitle: _('Loads a file made with Export')});
        importRow.add_suffix(textButton(_('Import…'), () => this._import()));
        group.add(importRow);

        const resetRow = new Adw.ActionRow({title: _('Reset to defaults'), subtitle: _('Every setting returns to how it was after installing')});
        resetRow.add_suffix(textButton(_('Reset…'), () => this._reset(), ['destructive-action']));
        group.add(resetRow);
    }

    async _export() {
        const ctx = this._ctx;
        const _ = ctx._;
        const stamp = GLib.DateTime.new_now_local().format('%Y-%m-%d');
        const file = await pickSaveFile(ctx, _('Export Roj settings'), `roj-settings-${stamp}.json`);
        if (!file)
            return;
        try {
            await writeFile(file, exportSettings(ctx.settings));
            ctx.toast(_('Settings saved to {file}', {file: file.get_basename()}));
        } catch (e) {
            ctx.toast(_('Could not save: {error}', {error: e.message}));
        }
    }

    async _import() {
        const ctx = this._ctx;
        const _ = ctx._;
        const file = await pickFile(ctx, _('Import Roj settings'), fileFilters({name: _('Roj settings (JSON)'), suffixes: ['json']}));
        if (!file)
            return;
        try {
            const {applied, skipped} = importSettings(ctx.settings, await readFile(file));
            ctx.toast(skipped.length
                ? _('Imported {applied} settings, skipped {skipped}', {applied: applied.length, skipped: skipped.length})
                : _('Imported {applied} settings', {applied: applied.length}));
        } catch (e) {
            ctx.toast(_('Could not import: {error}', {error: e.message}));
        }
    }

    async _reset() {
        const ctx = this._ctx;
        const _ = ctx._;
        const answer = await choose(ctx, _('Reset all settings?'),
            _('Languages, fonts, patterns, event sources and every other option return to their defaults. Export first if you may want them back.'),
            [['cancel', _('Cancel')], ['reset', _('Reset')]], {destructive: 'reset'});
        if (answer === 'reset') {
            resetSettings(ctx.settings);
            ctx.toast(_('Settings reset'));
        }
    }
});
