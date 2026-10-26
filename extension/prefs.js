// SPDX-License-Identifier: GPL-3.0-or-later
// Roj preferences window.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import PangoCairo from 'gi://PangoCairo';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {customFonts, fontsFromSettings, prefersDark, uiLanguage} from './lib/config.js';
import {isRtlLocale} from './lib/engine.js';
import {bundledFontPaths, registerFonts} from './lib/fonts.js';
import {PrefsContext} from './prefs/common.js';
import {GeneralPage} from './prefs/generalPage.js';
import {AppearancePage} from './prefs/appearancePage.js';
import {FormatsPage} from './prefs/formatsPage.js';
import {EventsPage} from './prefs/eventsPage.js';
import {ConverterPage} from './prefs/converterPage.js';
import {GuidePage} from './prefs/guidePage.js';
import {AboutPage} from './prefs/aboutPage.js';

// Styles for the day-card preview and small decorations.
const CSS = `
.roj-preview { padding: 6px; }
.roj-card { min-width: 50px; min-height: 52px; border-radius: 12px; padding: 3px 4px;
  background-color: alpha(currentColor, 0.07); }
.roj-card-number { font-size: 17px; font-weight: 700; }
.roj-card-weekend .roj-card-number { color: #e01b24; }
.roj-card-today { background-color: #f5cd0e; }
.roj-card-today .roj-card-number { color: #141414; }
.roj-card-sub { font-size: 10px; font-weight: 700; }
.roj-sub-gregorian { color: #3584e4; }
.roj-sub-persian { color: #26a269; }
.roj-sub-islamic { color: #9141ac; }
.roj-card-today .roj-card-sub { color: #3d3300; }
.roj-dot { min-width: 10px; min-height: 10px; border-radius: 99px; }
.roj-dot-gregorian { background-color: #3584e4; }
.roj-dot-persian { background-color: #2ec27e; }
.roj-dot-islamic { background-color: #9141ac; }
.roj-code { padding: 12px 14px; margin-bottom: 6px; }
.roj-version-pill { font-weight: 700; font-size: 0.9em; padding: 2px 12px; border-radius: 99px;
  background-color: alpha(#f5cd0e, 0.25); }
`;

const PAGES = [GeneralPage, AppearancePage, FormatsPage, EventsPage, ConverterPage, GuidePage, AboutPage];
const PAGE_NAMES = ['general', 'appearance', 'formats', 'events', 'converter', 'guide', 'about'];

// Settings that change the language or direction of the window itself.
const REBUILD_KEYS = ['ui-language', 'locale'];

export default class RojPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(900, 880);
        window.search_enabled = true;

        // Bundled and user fonts, so previews render exactly like the popup.
        registerFonts(PangoCairo.FontMap.get_default(), [
            ...bundledFontPaths(this.path),
            ...customFonts(settings).map(f => f.path),
        ]);

        const display = Gdk.Display.get_default();
        const styles = new Gtk.CssProvider();
        const fontStyles = new Gtk.CssProvider();
        this._loadCss(styles, CSS);
        Gtk.StyleContext.add_provider_for_display(display, styles, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        Gtk.StyleContext.add_provider_for_display(display, fontStyles, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        const originalDirection = Gtk.Widget.get_default_direction();
        let ctx = null;
        let pages = [];
        let rebuildId = 0;

        const build = () => {
            const visible = window.get_visible_page_name?.() ?? null;
            ctx?.destroy();
            pages.forEach(p => window.remove(p));

            // The window follows the interface language, including its direction
            // and the user's fonts for each script.
            const lang = uiLanguage(settings);
            Gtk.Widget.set_default_direction(isRtlLocale(lang) ? Gtk.TextDirection.RTL : Gtk.TextDirection.LTR);
            const fonts = fontsFromSettings(settings);
            this._loadCss(fontStyles, `window.roj-prefs { font-family: "${fonts.latin}", "${fonts.arabic}", sans-serif; }`);
            window.add_css_class('roj-prefs');

            ctx = new PrefsContext({settings, path: this.path, metadata: this.metadata, window});
            pages = PAGES.map(Page => new Page(ctx));
            pages.forEach(p => window.add(p));
            if (visible)
                window.set_visible_page_name(visible);
            this._applyTheme(ctx);
            this._followPageRequests(ctx);
        };

        const settingsId = settings.connect('changed', (_s, key) => {
            const fontsChanged = key === 'latin-font' || key === 'arabic-font';
            if (fontsChanged) {
                const fonts = fontsFromSettings(settings);
                this._loadCss(fontStyles, `window.roj-prefs { font-family: "${fonts.latin}", "${fonts.arabic}", sans-serif; }`);
            }
            if (!REBUILD_KEYS.includes(key) || rebuildId)
                return;
            // Rebuild after the current signal, never inside the widget that changed it.
            rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                rebuildId = 0;
                if (uiLanguage(settings) !== ctx.lang)
                    build();
                return GLib.SOURCE_REMOVE;
            });
        });

        window.connect('close-request', () => {
            if (rebuildId)
                GLib.source_remove(rebuildId);
            settings.disconnect(settingsId);
            ctx?.destroy();
            Gtk.Widget.set_default_direction(originalDirection);
            Gtk.StyleContext.remove_provider_for_display(display, styles);
            Gtk.StyleContext.remove_provider_for_display(display, fontStyles);
            return false;
        });

        build();
    }

    _loadCss(provider, css) {
        if (provider.load_from_string)
            provider.load_from_string(css);
        else
            provider.load_from_data(css, -1);
    }

    /** Honour the Theme setting while the window is open, then restore. */
    _applyTheme(ctx) {
        const manager = Adw.StyleManager.get_default();
        const original = manager.color_scheme;
        const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const apply = () => {
            const theme = ctx.settings.get_string('theme');
            if (theme === 'system')
                manager.color_scheme = original;
            else
                manager.color_scheme = prefersDark(theme, iface) ? Adw.ColorScheme.FORCE_DARK : Adw.ColorScheme.FORCE_LIGHT;
        };
        apply();
        ctx.onChange(['theme'], apply);
        ctx.addCleanup(() => (manager.color_scheme = original));
    }

    /** The popup's Convert and Settings buttons ask for a page through a setting. */
    _followPageRequests(ctx) {
        const show = () => {
            const page = ctx.settings.get_string('prefs-page');
            if (PAGE_NAMES.includes(page)) {
                ctx.window.set_visible_page_name(page);
                ctx.settings.set_string('prefs-page', '');
            }
        };
        show();
        ctx.onChange(['prefs-page'], show);
    }
}
