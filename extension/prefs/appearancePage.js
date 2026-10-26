// SPDX-License-Identifier: GPL-3.0-or-later
// Appearance: theme, top bar (including the event marker), day cards with a
// live preview, popup header, fonts and text size.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import PangoCairo from 'gi://PangoCairo';

import {BUNDLED_FONTS} from '../lib/constants.js';
import {SECONDARY_CALENDARS, weekdayOf} from '../lib/engine.js';
import {ENGINE_KEYS, customFonts} from '../lib/config.js';
import {bundledFontPaths, canRegisterFonts, listFamilies, registerFonts} from '../lib/fonts.js';
import {isolate, ltrLine} from '../lib/richtext.js';
import {
    CALENDAR_LABELS, choose, comboRow, fileFilters, iconButton, pickFile, spinRow, switchRow,
    textButton,
} from './common.js';

const PREVIEW_KEYS = [
    ...ENGINE_KEYS, 'card-show-gregorian', 'card-show-persian', 'card-show-islamic', 'card-layout',
    'latin-font', 'arabic-font', 'weekend-days',
];

function userFontDir() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'roj', 'fonts']);
}

/** Family name of a font file: fc-scan when available, else what Pango learned. */
function familyOfFile(path, before) {
    try {
        const [ok, out] = GLib.spawn_command_line_sync(`fc-scan --format "%{family[0]}" ${GLib.shell_quote(path)}`);
        const name = ok ? new TextDecoder().decode(out).trim() : '';
        if (name)
            return name;
    } catch {
        // fall through
    }
    const after = listFamilies(PangoCairo.FontMap.get_default());
    return after.find(f => !before.includes(f)) ?? null;
}

export const AppearancePage = GObject.registerClass(
class RojAppearancePage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'appearance', title: ctx._('Appearance'), icon_name: 'applications-graphics-symbolic'});
        this._ctx = ctx;
        this._buildTheme();
        this._buildPanel();
        this._buildCards();
        this._buildHeader();
        this._buildFonts();
    }

    _buildTheme() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({title: _('Theme')});
        this.add(group);
        group.add(comboRow(ctx, 'theme', _('Colour scheme'), [
            {value: 'system', label: _('Follow the system')},
            {value: 'light', label: _('Light')},
            {value: 'dark', label: _('Dark')},
        ], _('Used by the popup and this window')));
        group.add(spinRow(ctx, 'font-scale', _('Popup text size'), {min: 0.8, max: 1.5, step: 0.05, digits: 2}));
        group.add(switchRow(ctx, 'show-footer', _('Credits line'), _('“Made with ♥ by 0xdolan” at the bottom of the popup')));
    }

    _buildPanel() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Top bar'),
            description: _('The text pattern is set on the Formats page.'),
        });
        this.add(group);
        group.add(comboRow(ctx, 'panel-position', _('Position'), [
            {value: 'left', label: _('Left')},
            {value: 'center', label: _('Centre')},
            {value: 'right', label: _('Right')},
        ]));
        group.add(spinRow(ctx, 'panel-index', _('Order within the area'), {min: -1, max: 20, subtitle: _('0 is first; -1 puts it last')}));
        group.add(switchRow(ctx, 'panel-show-text', _('Show the date')));
        group.add(switchRow(ctx, 'panel-show-icon', _('Show the Roj icon'), _('The icon is always shown when the date is hidden')));

        group.add(comboRow(ctx, 'panel-event-indicator', _('Today’s events'), [
            {value: 'dot', label: _('A dot next to the date')},
            {value: 'count', label: _('The number of events')},
            {value: 'title', label: _('The first event’s title')},
            {value: 'off', label: _('Nothing')},
        ], _('Shown when today has an event; red when today is a holiday')));
        const length = spinRow(ctx, 'panel-event-length', _('Longest title'), {min: 8, max: 80, subtitle: _('Characters; longer titles are shortened')});
        const syncLength = () => (length.visible = ctx.settings.get_string('panel-event-indicator') === 'title');
        syncLength();
        ctx.onChange(['panel-event-indicator'], syncLength);
        group.add(length);
    }

    // Day cards

    _buildCards() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Day cards'),
            description: _('The large number is always the Kurdish day. Add the Gregorian, Persian or Islamic day as small numbers of the same size: any one, two or all three.'),
        });
        this.add(group);

        this._preview = new Gtk.Box({
            spacing: 6,
            halign: Gtk.Align.CENTER,
            margin_top: 6,
            margin_bottom: 12,
            css_classes: ['roj-preview'],
        });
        group.add(this._preview);

        for (const cal of SECONDARY_CALENDARS) {
            const subtitle = cal === 'gregorian' ? _('On by default') : _('Off by default');
            const row = switchRow(ctx, `card-show-${cal}`, _('{calendar} day', {calendar: _(CALENDAR_LABELS[cal])}), subtitle);
            row.add_prefix(new Gtk.Box({css_classes: ['roj-dot', `roj-dot-${cal}`], valign: Gtk.Align.CENTER}));
            group.add(row);
        }
        group.add(comboRow(ctx, 'card-layout', _('Placement of the small numbers'), [
            {value: 'row', label: _('In a row under the day')},
            {value: 'corners', label: _('In the corners')},
        ]));

        this._renderPreview();
        ctx.onChange(PREVIEW_KEYS, () => this._renderPreview());
    }

    _renderPreview() {
        const ctx = this._ctx;
        const e = ctx.engine;
        const settings = ctx.settings;
        let child;
        while ((child = this._preview.get_first_child()))
            this._preview.remove(child);

        const secondaries = SECONDARY_CALENDARS.filter(c => settings.get_boolean(`card-show-${c}`));
        const corners = settings.get_string('card-layout') === 'corners';
        const weekend = new Set(settings.get_value('weekend-days').deepUnpack());
        const today = e.todayJdn();
        const start = today - ((weekdayOf(today) - e.options.weekStart + 7) % 7);
        this._preview.set_direction(e.isRtl ? Gtk.TextDirection.RTL : Gtk.TextDirection.LTR);

        for (let i = 0; i < 7; i++) {
            const jdn = start + i;
            const dates = e.allDates(jdn);
            const card = new Gtk.Overlay({css_classes: ['roj-card']});
            if (jdn === today)
                card.add_css_class('roj-card-today');
            if (weekend.has(weekdayOf(jdn)))
                card.add_css_class('roj-card-weekend');

            const centred = corners || !secondaries.length;
            card.set_child(new Gtk.Label({
                use_markup: true,
                label: ctx.markup(e.number(dates.kurdish[2], 'kurdish')),
                css_classes: ['roj-card-number'],
                valign: centred ? Gtk.Align.CENTER : Gtk.Align.START,
                margin_top: centred ? 0 : 6,
            }));

            const sub = cal => new Gtk.Label({
                use_markup: true,
                label: ctx.markup(e.number(dates[cal][2], cal)),
                css_classes: ['roj-card-sub', `roj-sub-${cal}`],
            });
            if (corners) {
                const place = {
                    gregorian: [Gtk.Align.END, Gtk.Align.START],
                    persian: [Gtk.Align.START, Gtk.Align.END],
                    islamic: [Gtk.Align.END, Gtk.Align.END],
                };
                for (const cal of secondaries) {
                    const label = sub(cal);
                    [label.halign, label.valign] = place[cal];
                    card.add_overlay(label);
                }
            } else if (secondaries.length) {
                const row = new Gtk.Box({spacing: 5, halign: Gtk.Align.CENTER, valign: Gtk.Align.END});
                secondaries.forEach(cal => row.append(sub(cal)));
                card.add_overlay(row);
            }
            this._preview.append(card);
        }
    }

    _buildHeader() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Popup header'),
            description: _('The selected day is shown at the top of the popup in Kurdish, followed by these calendars.'),
        });
        this.add(group);
        for (const cal of SECONDARY_CALENDARS)
            group.add(switchRow(ctx, `header-show-${cal}`, _('{calendar} date', {calendar: _(CALENDAR_LABELS[cal])})));
    }

    // Fonts

    _buildFonts() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Fonts'),
            description: _('Text is split by script. Letters in the Arabic Unicode range (Sorani, Persian, Arabic) use the right-to-left font; everything else, such as Kurmanji and English, uses the left-to-right font.'),
        });
        this.add(group);

        this._fontMap = PangoCairo.FontMap.get_default();
        this._latinRow = this._fontRow('latin-font', _('Left-to-right text'), 'latin');
        this._arabicRow = this._fontRow('arabic-font', _('Right-to-left text'), 'arabic');
        group.add(this._latinRow);
        group.add(this._arabicRow);

        this._sample = new Adw.ActionRow({css_classes: ['property']});
        group.add(this._sample);

        const load = new Adw.ActionRow({
            title: _('Load a font file'),
            subtitle: _('A .ttf or .otf file, copied into Roj’s own folder and used without installing it'),
        });
        load.add_suffix(textButton(_('Choose a file…'), () => this._loadFontFile()));
        group.add(load);

        this._customGroup = new Adw.PreferencesGroup({title: _('Loaded font files')});
        this.add(this._customGroup);
        this._customRows = [];

        if (!canRegisterFonts(this._fontMap))
            this._buildLegacyFontInstall(group);

        this._syncFonts();
        ctx.onChange(['latin-font', 'arabic-font', 'custom-fonts', 'locale'], () => this._syncFonts());
    }

    _fontRow(key, title, script) {
        const ctx = this._ctx;
        const row = new Adw.ComboRow({title});
        row._key = key;
        row._script = script;
        row.connect('notify::selected', () => {
            const family = row._families?.[row.selected];
            if (family && family !== ctx.settings.get_string(key))
                ctx.settings.set_string(key, family);
        });
        row.add_suffix(iconButton('font-select-symbolic', ctx._('Choose any installed font…'), async () => {
            const dialog = new Gtk.FontDialog({title, modal: true});
            try {
                const family = await dialog.choose_family(ctx.window, null, null);
                if (family)
                    ctx.settings.set_string(key, family.get_name());
            } catch {
                // cancelled
            }
        }));
        return row;
    }

    _syncFonts() {
        const ctx = this._ctx;
        const _ = ctx._;
        const custom = customFonts(ctx.settings);
        for (const row of [this._latinRow, this._arabicRow]) {
            const current = ctx.settings.get_string(row._key);
            const bundled = BUNDLED_FONTS.filter(f => f.script === row._script).map(f => f.family);
            const families = [...new Set([...bundled, ...custom.map(f => f.family), current])];
            row._families = families;
            row.model = Gtk.StringList.new(families.map(f => (bundled.includes(f) ? _('{font} (included)', {font: f}) : f)));
            row.selected = families.indexOf(current);
            row.subtitle = bundled.includes(current) ? '' : _('Installed or loaded font');
        }
        const fonts = ctx.fonts;
        const e = ctx.engine;
        const jdn = e.todayJdn();
        const samples = ['ckb', 'kmr'].map(locale => e.with({locale}).format(jdn, 'kurdish', '%d %B %Y'));
        this._sample.title = _('Preview: {latin} and {arabic}', {latin: fonts.latin, arabic: fonts.arabic});
        this._sample.subtitle = ctx.markup(ltrLine(samples.map(isolate).join(' · ')), {size: 'large'});

        for (const row of this._customRows)
            this._customGroup.remove(row);
        this._customRows = custom.map(font => {
            const row = new Adw.ActionRow({title: font.family, subtitle: font.path});
            row.add_suffix(iconButton('user-trash-symbolic', _('Remove'), () => this._removeFont(font)));
            this._customGroup.add(row);
            return row;
        });
        this._customGroup.visible = custom.length > 0;
    }

    async _loadFontFile() {
        const ctx = this._ctx;
        const _ = ctx._;
        const file = await pickFile(ctx, _('Load a font file'), fileFilters({name: _('Fonts'), suffixes: ['ttf', 'otf', 'TTF', 'OTF']}));
        if (!file)
            return;
        try {
            GLib.mkdir_with_parents(userFontDir(), 0o755);
            const dest = Gio.File.new_for_path(GLib.build_filenamev([userFontDir(), file.get_basename()]));
            file.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null);

            const before = listFamilies(this._fontMap);
            const failed = registerFonts(this._fontMap, [dest.get_path()]);
            if (failed.length && canRegisterFonts(this._fontMap))
                throw new Error(_('the file is not a usable font'));
            const family = familyOfFile(dest.get_path(), before);
            if (!family)
                throw new Error(_('could not read the font name'));

            const list = customFonts(ctx.settings).filter(f => f.path !== dest.get_path());
            list.push({family, path: dest.get_path()});
            ctx.settings.set_string('custom-fonts', JSON.stringify(list));

            const use = await choose(ctx, _('Use “{font}”?', {font: family}),
                _('Choose which text should use this font. You can change it later.'),
                [['none', _('Just add it')], ['latin', _('Left-to-right text')], ['arabic', _('Right-to-left text')]],
                {suggested: 'arabic'});
            if (use === 'latin' || use === 'arabic')
                ctx.settings.set_string(`${use}-font`, family);
            ctx.toast(_('Loaded {font}', {font: family}));
        } catch (e) {
            ctx.toast(_('Could not load the font: {error}', {error: e.message}));
        }
    }

    _removeFont(font) {
        const ctx = this._ctx;
        const list = customFonts(ctx.settings).filter(f => f.path !== font.path);
        ctx.settings.set_string('custom-fonts', JSON.stringify(list));
        for (const key of ['latin-font', 'arabic-font']) {
            if (ctx.settings.get_string(key) === font.family && !list.some(f => f.family === font.family))
                ctx.settings.reset(key);
        }
        if (font.path.startsWith(userFontDir()))
            Gio.File.new_for_path(font.path).delete_async(GLib.PRIORITY_DEFAULT, null, null);
        ctx.toast(ctx._('Removed {font}. It disappears completely after you log out.', {font: font.family}));
    }

    /** Pango older than 1.56 cannot load font files at runtime: offer to install them. */
    _buildLegacyFontInstall(group) {
        const ctx = this._ctx;
        const _ = ctx._;
        const row = new Adw.ActionRow({
            title: _('Install the included fonts'),
            subtitle: _('This system’s Pango is older than 1.56, so Manrope, Vazirmatn, Estedad and Sahel must be copied to ~/.local/share/fonts to be used'),
        });
        row.add_suffix(textButton(_('Install'), () => {
            const target = GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'roj']);
            GLib.mkdir_with_parents(target, 0o755);
            for (const path of [...bundledFontPaths(ctx.path), ...customFonts(ctx.settings).map(f => f.path)]) {
                const src = Gio.File.new_for_path(path);
                src.copy(Gio.File.new_for_path(GLib.build_filenamev([target, src.get_basename()])),
                    Gio.FileCopyFlags.OVERWRITE, null, null);
            }
            GLib.spawn_command_line_async('fc-cache -f');
            ctx.toast(_('Fonts installed. Log out and back in if the top bar does not update.'));
        }, ['suggested-action']));
        group.add(row);
    }
});

